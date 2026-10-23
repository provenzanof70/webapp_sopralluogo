// Regole di completezza (uscita area, cose da non lasciare, obiettivi, cosa manca).
import type { Struttura, Stato, Elemento, Priorita } from './tipi';
import { indiceElementi, colonneDaCompilare, righeTabella } from './stato';

export type StatoVoce = 'completo' | 'parziale' | 'aperto' | 'derogato';

export function statoElemento(s: Struttura, st: Stato, el: Elemento): StatoVoce {
  const e = st.esiti[el.id];
  const deroga = st.deroghe.some((d) => d.codice === el.id);
  const fine = (ok: boolean, parz = false): StatoVoce => (ok ? 'completo' : deroga ? 'derogato' : parz ? 'parziale' : 'aperto');
  if (el.tipo === 'informazione') return 'completo';
  if (!e) return fine(false);
  switch (el.tipo) {
    case 'verifica': return fine(e.stato !== 'aperto');
    case 'domanda': return fine(['risposta', 'nonRisposta', 'rinviata'].includes(e.stato));
    case 'foto': return fine(['fatta', 'nonDisponibile'].includes(e.stato), (e.evidenze ?? []).length > 0);
    case 'lettura':
    case 'misura': return fine(['completa', 'nonEseguibile'].includes(e.stato), e.stato === 'parziale');
    case 'documento': return fine(e.stato !== 'aperto');
    case 'anomalia': return fine(['chiusa', 'limite'].includes(e.stato));
    case 'tabella': return fine(e.stato === 'completa', e.stato === 'parziale');
    case 'protocollo': return fine(['completo', 'parziale', 'nonEseguito'].includes(e.stato), e.stato === 'inCorso');
    case 'uscitaArea': return fine(['chiusa', 'chiusaConDeroga'].includes(e.stato));
  }
  return 'aperto';
}

/** Stato di un codice qualsiasi: elemento, riga di tabella, passo di protocollo. */
export function statoCodice(s: Struttura, st: Stato, codice: string): StatoVoce {
  const idx = indiceElementi(s);
  const el = idx.get(codice);
  if (el) return statoElemento(s, st, el);
  for (const t of s.elementi) {
    if (t.tipo === 'tabella' && righeTabella(t, st.esiti[t.id]).includes(codice)) {
      const cols = colonneDaCompilare(t);
      const celle = st.esiti[t.id]?.celle?.[codice] ?? {};
      const n = cols.filter((c) => celle[c.id]).length;
      return n >= cols.length ? 'completo' : n > 0 ? 'parziale' : 'aperto';
    }
    if (t.tipo === 'protocollo' && t.passi.some((p) => p.id === codice)) {
      const p = st.esiti[t.id]?.passi?.[codice];
      return p && p.stato !== 'daFare' ? 'completo' : 'aperto';
    }
  }
  return 'aperto';
}

export function statoLista(s: Struttura, st: Stato, codici: string[] | undefined): StatoVoce {
  const l = codici ?? [];
  if (!l.length) return 'aperto';
  const stati = l.map((c) => statoCodice(s, st, c));
  if (stati.every((x) => x === 'completo')) return 'completo';
  if (stati.some((x) => x !== 'aperto')) return 'parziale';
  return 'aperto';
}

export interface Avanzamento { tot: number; fatti: number }
export function avanzamentoArea(s: Struttura, st: Stato, area: string): Record<Priorita | 'tutti', Avanzamento> {
  const out = { A: { tot: 0, fatti: 0 }, B: { tot: 0, fatti: 0 }, C: { tot: 0, fatti: 0 }, tutti: { tot: 0, fatti: 0 } };
  for (const el of s.elementi) {
    if (el.area !== area || el.tipo === 'informazione' || el.tipo === 'uscitaArea') continue;
    const ok = statoElemento(s, st, el) === 'completo';
    const p = el.priorita ?? 'C';
    out[p].tot++; out.tutti.tot++;
    if (ok) { out[p].fatti++; out.tutti.fatti++; }
  }
  return out;
}

/** Voci aperte di priorità A di un'area (per l'uscita area e la chiusura). */
export function apertiA(s: Struttura, st: Stato, area?: string): Elemento[] {
  return s.elementi.filter((el) => (!area || el.area === area) && el.priorita === 'A' && el.tipo !== 'uscitaArea'
    && statoElemento(s, st, el) !== 'completo' && !st.deroghe.some((d) => d.codice === el.id));
}

export function contaModificheNonEsportate(_aSeq: number, st: Stato): number {
  return Math.max(0, (st.nSostanziali ?? 0) - (st.nSostanzialiEsportati ?? 0));
}
