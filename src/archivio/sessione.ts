// Sessione di lavoro su un sopralluogo: coda di scrittura seriale, registro a catena, evidenze.
// Regola: un dato è «salvato» solo dopo che la transazione è conclusa e (per i file) la rilettura
// ne ha confermato l'impronta.
import { db, traduciErrore, type RecIstanza } from './db';
import type { Struttura, Stato, Evento, Evidenza, TipoEvidenza } from '../dominio/tipi';
import { applica, statoIniziale } from '../dominio/stato';
import { sha256, isoLocale, uuid, estensioneDaMime, codiceFile } from '../util/base';

export const ZERI = '0'.repeat(64);

export interface NuovoEvento { tipo: string; codice?: string | null; dati?: Record<string, unknown> }
interface FileDaSalvare { id: string; blob: Blob; sha256: string; miniatura?: Blob | null }

export class Sessione {
  istanza: RecIstanza;
  struttura: Struttura;
  stato: Stato;
  private coda: Promise<unknown> = Promise.resolve();
  private ascoltatori = new Set<() => void>();
  versione = 0;

  constructor(istanza: RecIstanza, struttura: Struttura, stato: Stato) {
    this.istanza = istanza;
    this.struttura = struttura;
    this.stato = stato;
  }

  static async apri(id: string): Promise<Sessione> {
    const d = db();
    const ist = await d.istanze.get(id);
    if (!ist) throw new Error('Sopralluogo non trovato sul dispositivo');
    const rs = await d.strutture.get(id);
    const st = await d.stati.get(id);
    if (!rs) throw new Error('Struttura mancante: archivio incompleto');
    const struttura = JSON.parse(new TextDecoder().decode(rs.bytes)) as Struttura;
    return new Sessione(ist, struttura, st?.stato ?? statoIniziale(struttura));
  }

  ascolta(f: () => void) { this.ascoltatori.add(f); return () => this.ascoltatori.delete(f); }
  private notifica() { this.versione++; for (const f of this.ascoltatori) f(); }

  /** Accoda un'operazione: la funzione riceve lo stato corrente e restituisce gli eventi (ed eventuali file). */
  esegui(costruisci: (st: Stato) => { eventi: NuovoEvento[]; files?: FileDaSalvare[] } | null): Promise<Evento[]> {
    const p = this.coda.then(async () => {
      const piano = costruisci(this.stato);
      if (!piano || !piano.eventi.length) return [];
      return this.scrivi(piano.eventi, piano.files ?? []);
    });
    this.coda = p.catch(() => undefined);
    return p;
  }

  /** Si può eliminare davvero solo ciò che non è mai finito in una copia confermata (e non le firme). */
  puoEliminare(id: string): boolean {
    const e = this.stato.evidenze[id];
    return !!e && e.tipo !== 'firma' && !e.annullata && !this.stato.evidenzeEsportate[id] && this.stato.statoSopralluogo !== 'chiuso';
  }

  async eliminaEvidenza(id: string): Promise<void> {
    if (!this.puoEliminare(id)) throw new Error('Questa evidenza è già in una copia salvata (o è una firma): si può solo annullare.');
    const e = this.stato.evidenze[id];
    await this.esegui(() => ({ eventi: [{ tipo: 'evidenza.eliminata', codice: null, dati: { id, file: e.file ?? null, sha256: e.sha256 ?? null } }] }));
    const d = db();
    await d.transaction('rw', [d.blob, d.miniature], async () => {
      await d.blob.delete([this.istanza.id, id]);
      await d.miniature.delete([this.istanza.id, id]);
    });
  }

  registra(tipo: string, codice: string | null, dati: Record<string, unknown> = {}): Promise<Evento[]> {
    return this.esegui(() => ({ eventi: [{ tipo, codice, dati }] }));
  }

  private async scrivi(nuovi: NuovoEvento[], files: FileDaSalvare[]): Promise<Evento[]> {
    const stato = structuredClone(this.stato);
    let seq = this.istanza.aSeq;
    let prec = this.istanza.hashFinale;
    const righe: { seq: number; riga: string; hash: string }[] = [];
    const eventi: Evento[] = [];
    for (const n of nuovi) {
      seq += 1;
      const ev: Evento = { seq, il: isoLocale(), tipo: n.tipo, codice: n.codice ?? null, dati: n.dati ?? {}, prec };
      const riga = JSON.stringify(ev);
      const hash = await sha256(riga);
      applica(stato, this.struttura, ev);
      righe.push({ seq, riga, hash });
      eventi.push(ev);
      prec = hash;
    }
    const ist: RecIstanza = { ...this.istanza, aSeq: seq, hashFinale: prec, statoSopralluogo: stato.statoSopralluogo };
    const d = db();
    try {
      await d.transaction('rw', [d.eventi, d.stati, d.istanze, d.blob, d.miniature], async () => {
        for (const f of files) {
          await d.blob.put({ istanza: ist.id, id: f.id, blob: f.blob });
          if (f.miniatura) await d.miniature.put({ istanza: ist.id, id: f.id, blob: f.miniatura });
        }
        for (const r of righe) await d.eventi.add({ istanza: ist.id, seq: r.seq, riga: r.riga, hash: r.hash });
        await d.stati.put({ istanza: ist.id, stato });
        await d.istanze.put(ist);
      });
    } catch (e) {
      throw traduciErrore(e);
    }
    this.istanza = ist;
    this.stato = stato;
    this.notifica();
    // rilettura di controllo dei file appena scritti
    for (const f of files) {
      const r = await d.blob.get([ist.id, f.id]);
      const h = r ? await sha256(r.blob) : '';
      if (h !== f.sha256) throw new Error(`Verifica dopo il salvataggio NON superata per un file (${f.id}). Ripeti l'acquisizione e fai un checkpoint.`);
    }
    return eventi;
  }

  // ------------------------------------------------------------------ evidenze

  async acquisisci(p: {
    blob: Blob; tipo: TipoEvidenza; fonte: Evidenza['fonte']; nomeOriginale?: string; elementi?: string[];
    area?: string; didascalia?: string; gps?: Evidenza['gps']; dataOriginaleExif?: string; figuraBase?: string;
    miniatura?: Blob | null; riservata?: boolean;
  }): Promise<Evidenza> {
    const buf = new Uint8Array(await p.blob.arrayBuffer());
    const blob = new Blob([buf as BlobPart], { type: p.blob.type || '' });
    const h = await sha256(buf);
    const id = uuid();
    let creata: Evidenza | null = null;
    await this.esegui((st) => {
      const progressivo = (st.progressivi[p.tipo] ?? 0) + 1;
      const s = this.struttura.pratica;
      const giorno = s.data.replace(/-/g, '');
      const cartella = { foto: 'foto', audio: 'audio', documento: 'documenti', firma: 'firme', annotazione: 'annotazioni', nota: '' }[p.tipo];
      const ext = estensioneDaMime(blob.type, p.nomeOriginale);
      const etichetta = p.tipo === 'firma' ? 'FIRMA' : p.tipo === 'annotazione' ? `${codiceFile(p.figuraBase ?? 'FIG')}-ANN` : codiceFile(p.elementi?.[0] ?? 'INBOX');
      const num = String(progressivo).padStart(3, '0');
      const ev: Evidenza = {
        id, tipo: p.tipo,
        file: `evidenze/${cartella}/${codiceFile(s.prefissoFile)}_${giorno}_${etichetta}_${num}.${ext}`,
        sha256: h, byte: buf.byteLength, mime: blob.type || undefined, nomeOriginale: p.nomeOriginale || undefined,
        fonte: p.fonte, acquisitaIl: isoLocale(), dataOriginaleExif: p.dataOriginaleExif, progressivo,
        elementi: p.elementi ?? [], area: p.area, didascalia: p.didascalia || undefined, gps: p.gps,
        figuraBase: p.figuraBase, riservata: p.riservata || undefined,
      };
      for (const k of Object.keys(ev) as (keyof Evidenza)[]) if (ev[k] === undefined) delete ev[k];
      creata = ev;
      return { eventi: [{ tipo: 'evidenza.acquisita', codice: ev.elementi[0] ?? null, dati: { evidenza: ev } }], files: [{ id, blob, sha256: h, miniatura: p.miniatura }] };
    });
    return creata!;
  }

  async nota(testo: string, elementi: string[], area?: string): Promise<Evidenza> {
    let creata: Evidenza | null = null;
    await this.esegui((st) => {
      const progressivo = (st.progressivi.nota ?? 0) + 1;
      const ev: Evidenza = { id: uuid(), tipo: 'nota', testo, fonte: 'tastiera', acquisitaIl: isoLocale(), progressivo, elementi, ...(area ? { area } : {}) };
      creata = ev;
      return { eventi: [{ tipo: 'evidenza.acquisita', codice: elementi[0] ?? null, dati: { evidenza: ev } }] };
    });
    return creata!;
  }

  async blobEvidenza(id: string): Promise<Blob | undefined> {
    return (await db().blob.get([this.istanza.id, id]))?.blob;
  }
  async miniatura(id: string): Promise<Blob | undefined> {
    return (await db().miniature.get([this.istanza.id, id]))?.blob ?? (await this.blobEvidenza(id));
  }
  async figura(id: string): Promise<Blob | undefined> {
    return (await db().figure.get([this.istanza.id, id]))?.blob;
  }
  async eventi(): Promise<{ seq: number; riga: string; hash: string }[]> {
    return db().eventi.where('istanza').equals(this.istanza.id).sortBy('seq');
  }

  /** Verifica completa della catena del registro sul dispositivo. */
  async verificaRegistro(): Promise<string[]> {
    const ev = await this.eventi();
    const problemi: string[] = [];
    let prec = ZERI;
    let atteso = 1;
    for (const e of ev) {
      const o = JSON.parse(e.riga) as Evento;
      if (o.seq !== atteso) problemi.push(`Sequenza interrotta a ${atteso}`);
      if (o.prec !== prec) problemi.push(`Catena interrotta all'evento ${o.seq}`);
      const h = await sha256(e.riga);
      if (h !== e.hash) problemi.push(`Impronta errata all'evento ${o.seq}`);
      prec = h;
      atteso = o.seq + 1;
    }
    if (prec !== this.istanza.hashFinale) problemi.push('Impronta finale diversa da quella registrata');
    for (const e of Object.values(this.stato.evidenze)) {
      if (!e.file) continue;
      const b = await this.blobEvidenza(e.id);
      if (!b) { problemi.push(`File mancante: ${e.file}`); continue; }
      if ((await sha256(b)) !== e.sha256) problemi.push(`Impronta errata: ${e.file}`);
    }
    return problemi;
  }
}
