// Archivio locale (IndexedDB tramite Dexie). Nessun dato di sopralluogo fuori da qui.
import Dexie, { type Table } from 'dexie';
import type { Stato } from '../dominio/tipi';

export interface RecIstanza {
  id: string;                 // idSopralluogoLocale
  idStruttura: string;
  codicePratica: string;
  titolo: string;
  committente: string;
  sito: string;
  data: string;
  prefisso: string;
  revisione: string;
  creatoIl: string;
  aSeq: number;
  hashFinale: string;
  statoSopralluogo: Stato['statoSopralluogo'];
  archiviata?: boolean;
  origine?: string;           // 'andata' | 'ripristino da …'
}
export interface RecStruttura { istanza: string; bytes: Uint8Array; sha256: string; nomePacchetto?: string }
export interface RecFigura { istanza: string; id: string; blob: Blob }
export interface RecCampo { istanza: string; nome: string; blob: Blob }
export interface RecEvento { istanza: string; seq: number; riga: string; hash: string }
export interface RecStato { istanza: string; stato: Stato }
export interface RecBlob { istanza: string; id: string; blob: Blob }
export interface RecImpostazione { chiave: string; valore: unknown }

export class DbSopralluogo extends Dexie {
  istanze!: Table<RecIstanza, string>;
  strutture!: Table<RecStruttura, string>;
  figure!: Table<RecFigura, [string, string]>;
  campo!: Table<RecCampo, string>;
  eventi!: Table<RecEvento, [string, number]>;
  stati!: Table<RecStato, string>;
  blob!: Table<RecBlob, [string, string]>;
  miniature!: Table<RecBlob, [string, string]>;
  impostazioni!: Table<RecImpostazione, string>;

  constructor(nome = 'sopralluogo-mcstudio') {
    super(nome);
    this.version(1).stores({
      istanze: 'id, idStruttura, creatoIl',
      strutture: 'istanza',
      figure: '[istanza+id], istanza',
      campo: 'istanza',
      eventi: '[istanza+seq], istanza',
      stati: 'istanza',
      blob: '[istanza+id], istanza',
      miniature: '[istanza+id], istanza',
      impostazioni: 'chiave',
    });
  }
}

let istanzaDb: DbSopralluogo | null = null;
export function db(): DbSopralluogo {
  if (!istanzaDb) istanzaDb = new DbSopralluogo();
  return istanzaDb;
}
/** Solo per i test: usa un database con nome diverso. */
export function impostaDb(d: DbSopralluogo) { istanzaDb = d; }

export class ErroreArchivio extends Error {}

export function traduciErrore(e: unknown): Error {
  const err = e as { name?: string; inner?: { name?: string }; message?: string };
  const nome = err?.name ?? '';
  const interno = err?.inner?.name ?? '';
  if (nome === 'QuotaExceededError' || interno === 'QuotaExceededError') {
    return new ErroreArchivio('Spazio di archiviazione esaurito: il dato NON è stato salvato. Esporta un checkpoint e libera spazio (sopralluoghi già archiviati, foto del telefono).');
  }
  if (e instanceof Error) return e;
  return new Error(String(e));
}

export async function impostazione<T>(chiave: string, predefinito: T): Promise<T> {
  const r = await db().impostazioni.get(chiave);
  return (r?.valore as T) ?? predefinito;
}
export async function salvaImpostazione(chiave: string, valore: unknown) {
  await db().impostazioni.put({ chiave, valore });
}
