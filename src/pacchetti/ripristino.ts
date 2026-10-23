// Ripristino da pacchetti di rientro (finale, volumi, oppure catena di checkpoint) + eventuale andata.
// Verifica tutto prima di scrivere; crea SEMPRE una nuova istanza (nuovo idSopralluogoLocale).
import { leggiZip, type VoceZip } from '../util/zip';
import { sha256, uuid, isoLocale, daUtf8 } from '../util/base';
import type { Struttura, Evento, Evidenza } from '../dominio/tipi';
import { ricostruisci } from '../dominio/stato';
import { db, traduciErrore, type RecIstanza } from '../archivio/db';
import { ZERI } from '../archivio/sessione';
import { ErroreImport } from './andata';

interface Letto { nome: string; voci: Map<string, VoceZip>; manifest?: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface AnalisiRipristino {
  struttura: Struttura;
  strutturaBytes: Uint8Array;
  righe: string[];
  manifest: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  evidenze: { ev: Evidenza; voce: VoceZip }[];
  figure: Map<string, Blob>;
  campo?: { nome: string; blob: Blob };
  avvisi: string[];
  nomi: string[];
}

export async function analizzaRipristino(files: { nome: string; blob: Blob }[]): Promise<AnalisiRipristino> {
  const avvisi: string[] = [];
  const letti: Letto[] = [];
  let andata: Letto | undefined;
  for (const f of files) {
    const voci = await leggiZip(f.blob);
    if (voci.has('manifest.json')) {
      const problemi = await verificaHash(voci, f.nome);
      if (problemi.length) throw new ErroreImport(`${f.nome}: pacchetto danneggiato o modificato.`, problemi);
      const manifest = JSON.parse(daUtf8(await voci.get('manifest.json')!.leggi()));
      if (manifest.formato !== 'mcstudio.sopralluogo.rientro') throw new ErroreImport(`${f.nome}: formato non riconosciuto.`);
      if (manifest.tipoPacchetto === 'finale') {
        const sig = voci.get('SIGILLO.txt');
        if (!sig) throw new ErroreImport(`${f.nome}: pacchetto finale senza SIGILLO.`);
        const righe = Object.fromEntries(daUtf8(await sig.leggi()).split('\n').filter((r) => r.includes(': ')).map((r) => [r.slice(0, r.indexOf(': ')), r.slice(r.indexOf(': ') + 2)]));
        if (righe['sha256(hash.sha256)'] !== await sha256(await voci.get('hash.sha256')!.leggi())) throw new ErroreImport(`${f.nome}: SIGILLO non coerente.`);
      }
      letti.push({ nome: f.nome, voci, manifest });
    } else if (voci.has('struttura.json')) {
      andata = { nome: f.nome, voci };
    } else throw new ErroreImport(`${f.nome}: non è un pacchetto di sopralluogo.`);
  }
  if (!letti.length) throw new ErroreImport('Serve almeno un pacchetto di RIENTRO (checkpoint o finale). Il solo pacchetto di andata si importa con «Importa».');
  const idLoc = letti[0].manifest!.idSopralluogoLocale;
  const idStr = letti[0].manifest!.struttura.idStruttura;
  for (const l of letti) {
    if (l.manifest!.struttura.idStruttura !== idStr) throw new ErroreImport(`${l.nome}: appartiene a un'altra struttura (revisione diversa).`);
    if (l.manifest!.idSopralluogoLocale !== idLoc) throw new ErroreImport(`${l.nome}: appartiene a un altro sopralluogo.`);
  }
  // il pacchetto più recente porta il registro completo
  const ultimo = letti.reduce((a, b) => (b.manifest!.eventi.aSeq > a.manifest!.eventi.aSeq ? b : a));
  const m = ultimo.manifest!;
  const tot = m.volume.totale;
  if (tot > 1) {
    const presenti = new Set(letti.filter((l) => l.manifest!.eventi.hashFinale === m.eventi.hashFinale).map((l) => l.manifest!.volume.numero));
    for (let i = 1; i <= tot; i++) if (!presenti.has(i)) throw new ErroreImport(`Manca il volume ${i} di ${tot}.`);
  }
  const strutturaBytes = await ultimo.voci.get('struttura.json')!.leggi();
  if ((await sha256(strutturaBytes)) !== m.struttura.sha256) throw new ErroreImport('struttura.json non corrisponde al manifest.');
  const struttura = JSON.parse(daUtf8(strutturaBytes)) as Struttura;
  // catena eventi
  const righe = daUtf8(await ultimo.voci.get('eventi.jsonl')!.leggi()).split('\n').filter((r) => r);
  let prec = ZERI;
  for (let i = 0; i < righe.length; i++) {
    const ev = JSON.parse(righe[i]) as Evento;
    if (ev.seq !== i + 1 || ev.prec !== prec) throw new ErroreImport(`Registro eventi interrotto all'evento ${i + 1}.`);
    prec = await sha256(righe[i]);
  }
  if (prec !== m.eventi.hashFinale || righe.length !== m.eventi.aSeq) throw new ErroreImport('Registro eventi non coerente con il manifest.');
  // evidenze: cercate in tutti i pacchetti
  const evidenze: AnalisiRipristino['evidenze'] = [];
  const statoRicostruito = ricostruisci(struttura, righe.map((r) => JSON.parse(r)));
  for (const ev of Object.values(statoRicostruito.evidenze)) {
    if (!ev.file) continue;
    const l = letti.find((x) => x.voci.has(ev.file!));
    if (!l) throw new ErroreImport(`Manca il file ${ev.file}: servono anche i checkpoint precedenti o tutti i volumi.`);
    const voce = l.voci.get(ev.file)!;
    if ((await sha256(await voce.leggi())) !== ev.sha256) throw new ErroreImport(`${ev.file}: impronta diversa da quella registrata all'acquisizione.`);
    evidenze.push({ ev, voce });
  }
  // figure e PDF di campo dal pacchetto di andata, se fornito
  const figure = new Map<string, Blob>();
  let campo: AnalisiRipristino['campo'];
  if (andata) {
    const b = await andata.voci.get('struttura.json')!.leggi();
    if ((await sha256(b)) !== m.struttura.sha256) avvisi.push('Il pacchetto di andata fornito è di un\'altra revisione: figure non importate.');
    else {
      for (const f of struttura.figure ?? []) {
        const v = andata.voci.get(f.file);
        if (v) { const d = await v.leggi(); if ((await sha256(d)) === f.sha256) figure.set(f.id, new Blob([d as BlobPart], { type: f.file.endsWith('.png') ? 'image/png' : 'image/jpeg' })); }
      }
      for (const [n, v] of andata.voci) if (n.startsWith('campo/') && n.endsWith('.pdf')) campo = { nome: n.slice(6), blob: await v.comeBlob('application/pdf') };
    }
  } else if ((struttura.figure ?? []).length) avvisi.push('Figure non disponibili: aggiungi anche il pacchetto di ANDATA per averle.');
  return { struttura, strutturaBytes, righe, manifest: m, evidenze, figure, campo, avvisi, nomi: files.map((f) => f.nome) };
}

async function verificaHash(voci: Map<string, VoceZip>, nome: string): Promise<string[]> {
  const h = voci.get('hash.sha256');
  if (!h) return [`${nome}: manca hash.sha256`];
  const problemi: string[] = [];
  const elencati = new Set<string>();
  for (const r of daUtf8(await h.leggi()).split('\n')) {
    if (!r.trim()) continue;
    const i = r.indexOf('  ');
    const imp = r.slice(0, i), n = r.slice(i + 2);
    elencati.add(n);
    const v = voci.get(n);
    if (!v) { problemi.push(`${n}: assente`); continue; }
    if ((await sha256(await v.leggi())) !== imp) problemi.push(`${n}: impronta errata`);
  }
  for (const n of voci.keys()) if (!elencati.has(n) && n !== 'hash.sha256' && n !== 'SIGILLO.txt') problemi.push(`${n}: non elencato`);
  return problemi;
}

export async function eseguiRipristino(a: AnalisiRipristino): Promise<string> {
  const id = uuid();
  const d = db();
  const righe = [...a.righe];
  const hashes: string[] = [];
  for (const r of righe) hashes.push(await sha256(r));
  const ev: Evento = {
    seq: righe.length + 1, il: isoLocale(), tipo: 'ripristino.eseguito', codice: null,
    dati: { origine: a.nomi.join(', '), daIstanza: a.manifest.idSopralluogoLocale },
    prec: hashes.at(-1)!,
  };
  const riga = JSON.stringify(ev);
  righe.push(riga);
  hashes.push(await sha256(riga));
  const stato = ricostruisci(a.struttura, righe.map((r) => JSON.parse(r)));
  const s = a.struttura;
  const ist: RecIstanza = {
    id, idStruttura: s.idStruttura, codicePratica: s.pratica.codice, titolo: s.pratica.titolo,
    committente: s.pratica.committente.ragioneSociale, sito: s.pratica.sito.denominazione, data: s.pratica.data,
    prefisso: s.pratica.prefissoFile, revisione: s.generazione.revisione, creatoIl: ev.il,
    aSeq: righe.length, hashFinale: hashes.at(-1)!, statoSopralluogo: stato.statoSopralluogo,
    origine: `ripristino da ${a.nomi.join(', ')}`,
  };
  // i blob si leggono fuori dalla transazione (IndexedDB chiude le transazioni in attesa di altro)
  const blobs: { id: string; blob: Blob }[] = [];
  for (const { ev: e, voce } of a.evidenze) blobs.push({ id: e.id, blob: new Blob([(await voce.leggi()) as BlobPart], { type: e.mime ?? '' }) });
  try {
    await d.transaction('rw', [d.istanze, d.strutture, d.figure, d.campo, d.eventi, d.stati, d.blob], async () => {
      await d.strutture.put({ istanza: id, bytes: a.strutturaBytes, sha256: a.manifest.struttura.sha256 });
      for (const [fid, blob] of a.figure) await d.figure.put({ istanza: id, id: fid, blob });
      if (a.campo) await d.campo.put({ istanza: id, nome: a.campo.nome, blob: a.campo.blob });
      for (let i = 0; i < righe.length; i++) await d.eventi.add({ istanza: id, seq: i + 1, riga: righe[i], hash: hashes[i] });
      for (const b of blobs) await d.blob.put({ istanza: id, id: b.id, blob: b.blob });
      await d.stati.put({ istanza: id, stato });
      await d.istanze.put(ist);
    });
  } catch (e) { throw traduciErrore(e); }
  return id;
}
