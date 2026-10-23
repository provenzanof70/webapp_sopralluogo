// Gestione dei sopralluoghi sul dispositivo: eliminazione e ripartenza dal pacchetto di andata.
import { db, traduciErrore } from './db';
import { creaSopralluogo, type AnalisiAndata } from '../pacchetti/andata';
import { contaModificheNonEsportate } from '../dominio/completezza';
import type { Struttura } from '../dominio/tipi';

export interface SituazioneEsportazione {
  nonEsportate: number;
  evidenzeNonEsportate: number;
  finaleEsportato: boolean;
  avviato: boolean;
}

/** Quanto lavoro andrebbe perso eliminando il sopralluogo. */
export async function situazione(id: string): Promise<SituazioneEsportazione> {
  const d = db();
  const ist = await d.istanze.get(id);
  const s = (await d.stati.get(id))?.stato;
  if (!ist || !s) return { nonEsportate: 0, evidenzeNonEsportate: 0, finaleEsportato: false, avviato: false };
  return {
    nonEsportate: contaModificheNonEsportate(ist.aSeq, s),
    evidenzeNonEsportate: Object.values(s.evidenze).filter((e) => e.file && !s.evidenzeEsportate[e.id]).length,
    finaleEsportato: s.checkpoint.confermati.length > 0 && s.checkpoint.esportati.some((x) => x.tipo === 'finale'),
    avviato: s.statoSopralluogo !== 'preparazione' || (s.nSostanziali ?? 0) > 0,
  };
}

/** Elimina definitivamente un sopralluogo e tutti i suoi file dal dispositivo. */
export async function eliminaSopralluogo(id: string): Promise<void> {
  const d = db();
  try {
    await d.transaction('rw', [d.istanze, d.strutture, d.figure, d.campo, d.eventi, d.stati, d.blob, d.miniature], async () => {
      await d.figure.where('istanza').equals(id).delete();
      await d.eventi.where('istanza').equals(id).delete();
      await d.blob.where('istanza').equals(id).delete();
      await d.miniature.where('istanza').equals(id).delete();
      await d.strutture.delete(id);
      await d.campo.delete(id);
      await d.stati.delete(id);
      await d.istanze.delete(id);
    });
  } catch (e) { throw traduciErrore(e); }
}

/** Crea un nuovo sopralluogo vuoto dallo stesso pacchetto di andata già importato (struttura, figure, PDF di campo). */
export async function ripartiDaAndata(id: string): Promise<string> {
  const d = db();
  const rs = await d.strutture.get(id);
  if (!rs) throw new Error('Struttura non disponibile su questo dispositivo: importa di nuovo lo ZIP di andata.');
  const struttura = JSON.parse(new TextDecoder().decode(rs.bytes)) as Struttura;
  const figure = new Map<string, Blob>();
  for (const f of await d.figure.where('istanza').equals(id).toArray()) figure.set(f.id, f.blob);
  const c = await d.campo.get(id);
  const a: AnalisiAndata = {
    struttura, bytes: rs.bytes, sha256: rs.sha256, figure,
    campo: c ? { nome: c.nome, blob: c.blob } : undefined,
    avvisi: [], nomePacchetto: rs.nomePacchetto ?? 'pacchetto di andata già importato', esistenti: [],
  };
  return creaSopralluogo(a);
}
