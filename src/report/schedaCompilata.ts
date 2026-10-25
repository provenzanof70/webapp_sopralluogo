// Scheda PDF: lettura del PDF di campo (pdf.js), indice dei codici e PDF compilato (pdf-lib).
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Sessione } from '../archivio/sessione';
import { db } from '../archivio/db';
import { indicizza, testoCampo, statoAncora, type IndiceScheda, type TestoPagina } from '../dominio/schedaPdf';
import { caricaFont } from './pdf';
import { dataOra, isoLocale } from '../util/base';

export interface Scheda { doc: PDFDocumentProxy; indice: IndiceScheda; nome: string; blob: Blob }
const cache = new Map<string, Promise<Scheda | null>>();

/** Apre il PDF di campo del sopralluogo e ne costruisce l'indice (una volta per sessione). */
export function caricaScheda(ses: Sessione, avanzamento?: (fatte: number, tot: number) => void): Promise<Scheda | null> {
  const k = ses.istanza.id + '|' + ses.struttura.idStruttura;
  let p = cache.get(k);
  if (!p) {
    p = (async () => {
      const c = await db().campo.get(ses.istanza.id);
      if (!c) return null;
      const pdfjs = await import('pdfjs-dist');
      const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await c.blob.arrayBuffer()), isEvalSupported: false, useSystemFonts: true }).promise;
      const pagine: TestoPagina[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        const v = pg.getViewport({ scale: 1 });
        const t = await pg.getTextContent();
        pagine.push({
          n, larghezza: v.width, altezza: v.height,
          voci: t.items.filter((i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => 'str' in i)
            .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) })),
        });
        avanzamento?.(n, doc.numPages);
      }
      return { doc, indice: indicizza(ses.struttura, pagine), nome: c.nome, blob: c.blob };
    })().catch((e) => { cache.delete(k); throw e; });
    cache.set(k, p);
  }
  return p;
}

const BLU = rgb(0.09, 0.22, 0.62), VERDE = rgb(0.18, 0.49, 0.2), ARANCIO = rgb(0.85, 0.5, 0.05), ROSSO = rgb(0.7, 0.15, 0.12), VIOLA = rgb(0.42, 0.1, 0.6);

/** Il PDF di campo con, sopra, ciò che è stato registrato nell'app (esiti, risposte, valori con l'ora, foto). */
export async function generaSchedaCompilata(ses: Sessione): Promise<Uint8Array | null> {
  const sc = await caricaScheda(ses);
  if (!sc) return null;
  const s = ses.struttura, st = ses.stato;
  const doc = await PDFDocument.load(new Uint8Array(await sc.blob.arrayBuffer()), { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  const f = await doc.embedFont((await caricaFont()).normale, { subset: true });
  const pagine = doc.getPages();
  const scrivi = (n: number, t: string, x: number, y: number, size: number, w: number, color = BLU) => {
    const pg = pagine[n - 1];
    if (!pg || !t) return;
    // a capo su due righe al massimo, poi puntini
    const parole = t.replace(/\s+/g, ' ').split(' ');
    const righe: string[] = [];
    let r = '';
    for (const p of parole) {
      const prova = r ? r + ' ' + p : p;
      if (f.widthOfTextAtSize(prova, size) <= w || !r) r = prova; else { righe.push(r); r = p; }
    }
    if (r) righe.push(r);
    const vis = righe.slice(0, 2);
    if (righe.length > 2) vis[1] = vis[1] + ' ' + righe.slice(2).join(' ');
    vis.forEach((testo0, i) => {
      let testo = testo0;
      while (testo.length > 1 && f.widthOfTextAtSize(testo, size) > w) testo = testo.slice(0, -2) + '…';
      pg.drawText(testo, { x, y: y - i * size * 1.15, size, font: f, color });
    });
  };
  for (const c of sc.indice.campi) {
    const { testo, stato } = testoCampo(s, st, c.c);
    if (!testo) continue;
    const size = Math.min(c.fs, 7.5);
    const colore = stato === 'derogato' || testo.startsWith('non fattibile') ? VIOLA : c.c.k === 'lista' || c.c.k === 'fatta' || c.c.k === 'prep' ? (stato === 'completo' ? VERDE : ARANCIO) : BLU;
    scrivi(c.pagina, testo, c.x + 1.5, c.y, size, Math.max(8, c.w - 2), colore);
  }
  for (const a of sc.indice.ancore) {
    if (a.codice !== a.apre && !a.prep) continue;
    const sv = statoAncora(s, st, a);
    const pg = pagine[a.pagina - 1];
    if (!pg || sv === 'aperto') continue;
    pg.drawCircle({ x: a.x - 5, y: a.y + a.h * 0.3, size: 2.2, color: sv === 'completo' ? VERDE : sv === 'derogato' ? VIOLA : ARANCIO });
  }
  const nota = `Compilato con l'app di sopralluogo · ${dataOra(isoLocale())} · registro ${ses.istanza.aSeq} eventi · ${ses.istanza.hashFinale.slice(0, 12)}`;
  for (const pg of pagine) pg.drawText(nota, { x: 30, y: 8, size: 5.5, font: f, color: ROSSO });
  return doc.save();
}
