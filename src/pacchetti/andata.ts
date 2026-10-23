// Import del pacchetto di andata: verifica completa prima di scrivere qualsiasi cosa.
import { leggiZip } from '../util/zip';
import { sha256, uuid, isoLocale, daUtf8 } from '../util/base';
import { validaStruttura } from '../dominio/validazione';
import type { Struttura, Evento } from '../dominio/tipi';
import { statoIniziale, applica } from '../dominio/stato';
import { db, traduciErrore, type RecIstanza } from '../archivio/db';
import { ZERI } from '../archivio/sessione';

export interface AnalisiAndata {
  struttura: Struttura;
  bytes: Uint8Array;
  sha256: string;
  figure: Map<string, Blob>;
  campo?: { nome: string; blob: Blob };
  avvisi: string[];
  nomePacchetto: string;
  esistenti: RecIstanza[];
}

export class ErroreImport extends Error {
  dettagli: string[];
  constructor(msg: string, dettagli: string[] = []) { super(msg); this.dettagli = dettagli; }
}

/** Analizza un file (ZIP di andata oppure struttura.json) senza scrivere nulla. */
export async function analizzaAndata(file: Blob, nome: string): Promise<AnalisiAndata> {
  const avvisi: string[] = [];
  let bytes: Uint8Array;
  const figure = new Map<string, Blob>();
  let campo: AnalisiAndata['campo'];
  const testa = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const eZip = testa[0] === 0x50 && testa[1] === 0x4b;
  if (eZip) {
    const voci = await leggiZip(file);
    const vs = voci.get('struttura.json');
    if (!vs) throw new ErroreImport('Lo ZIP non contiene struttura.json: non è un pacchetto di andata.');
    if (voci.has('manifest.json')) throw new ErroreImport('Questo è un pacchetto di RIENTRO: usa «Ripristina», non «Importa».');
    const vm = voci.get('MANIFEST_SHA256.txt');
    if (!vm) avvisi.push('Manca MANIFEST_SHA256.txt: integrità del pacchetto non verificabile.');
    else {
      const problemi: string[] = [];
      for (const r of daUtf8(await vm.leggi()).split(/\r?\n/)) {
        if (!r.trim()) continue;
        const i = r.indexOf('  ');
        const h = r.slice(0, i), n = r.slice(i + 2);
        const v = voci.get(n);
        if (!v) { problemi.push(`${n}: elencato ma assente`); continue; }
        if ((await sha256(await v.leggi())) !== h) problemi.push(`${n}: impronta errata`);
      }
      if (problemi.length) throw new ErroreImport('Pacchetto danneggiato o modificato.', problemi);
    }
    bytes = await vs.leggi();
    for (const [n, v] of voci) {
      if (n.startsWith('campo/') && n.toLowerCase().endsWith('.pdf')) campo = { nome: n.slice(6), blob: await v.comeBlob('application/pdf') };
    }
    const s0 = parse(bytes);
    for (const f of s0.figure ?? []) {
      const v = voci.get(f.file);
      if (!v) throw new ErroreImport(`Figura ${f.id} mancante nel pacchetto (${f.file}).`);
      const b = await v.leggi();
      if ((await sha256(b)) !== f.sha256) throw new ErroreImport(`Figura ${f.id}: impronta diversa da quella dichiarata.`);
      figure.set(f.id, new Blob([b as BlobPart], { type: f.file.endsWith('.png') ? 'image/png' : 'image/jpeg' }));
    }
  } else {
    bytes = new Uint8Array(await file.arrayBuffer());
    avvisi.push('Importato solo struttura.json (senza pacchetto): figure e verifica delle impronte assenti. Usare solo per prove.');
  }
  const struttura = parse(bytes);
  const v = validaStruttura(struttura);
  if (v.errori.length) throw new ErroreImport('La struttura non è valida: correggerla nel progetto e rigenerare il pacchetto.', v.errori);
  if (!eZip && (struttura.figure ?? []).length) avvisi.push(`${struttura.figure!.length} figure dichiarate non disponibili.`);
  avvisi.push(...v.avvisi);
  const esistenti = (await db().istanze.toArray()).filter((i) => i.idStruttura === struttura.idStruttura
    || (i.codicePratica === struttura.pratica.codice && i.data === struttura.pratica.data));
  return { struttura, bytes, sha256: await sha256(bytes), figure, campo, avvisi, nomePacchetto: nome, esistenti };
}

function parse(bytes: Uint8Array): Struttura {
  try { return JSON.parse(daUtf8(bytes)) as Struttura; } catch {
    throw new ErroreImport('struttura.json non è un JSON leggibile.');
  }
}

/** Crea un nuovo sopralluogo dal pacchetto analizzato. Mai sovrascrive un sopralluogo esistente. */
export async function creaSopralluogo(a: AnalisiAndata): Promise<string> {
  const id = uuid();
  const s = a.struttura;
  const ev: Evento = {
    seq: 1, il: isoLocale(), tipo: 'struttura.importata', codice: null,
    dati: { idStruttura: s.idStruttura, sha256: a.sha256, revisione: s.generazione.revisione, pacchetto: a.nomePacchetto },
    prec: ZERI,
  };
  const riga = JSON.stringify(ev);
  const hash = await sha256(riga);
  const stato = statoIniziale(s);
  applica(stato, s, ev);
  const ist: RecIstanza = {
    id, idStruttura: s.idStruttura, codicePratica: s.pratica.codice, titolo: s.pratica.titolo,
    committente: s.pratica.committente.ragioneSociale, sito: s.pratica.sito.denominazione, data: s.pratica.data,
    prefisso: s.pratica.prefissoFile, revisione: s.generazione.revisione, creatoIl: ev.il, aSeq: 1, hashFinale: hash,
    statoSopralluogo: 'preparazione', origine: 'andata',
  };
  const d = db();
  try {
    await d.transaction('rw', [d.istanze, d.strutture, d.figure, d.campo, d.eventi, d.stati], async () => {
      await d.strutture.put({ istanza: id, bytes: a.bytes, sha256: a.sha256, nomePacchetto: a.nomePacchetto });
      for (const [fid, blob] of a.figure) await d.figure.put({ istanza: id, id: fid, blob });
      if (a.campo) await d.campo.put({ istanza: id, nome: a.campo.nome, blob: a.campo.blob });
      await d.eventi.add({ istanza: id, seq: 1, riga, hash });
      await d.stati.put({ istanza: id, stato });
      await d.istanze.put(ist);
    });
  } catch (e) { throw traduciErrore(e); }
  return id;
}
