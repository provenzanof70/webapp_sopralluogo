// Elementi comuni del nuovo flusso: titoli brevi, icone per tipo, righe compatte, raggruppamento per componente.
import type { JSX } from 'preact';
import type { Sessione } from '../archivio/sessione';
import type { Elemento, Esito, TipoElemento } from '../dominio/tipi';
import { statoElemento, type StatoVoce } from '../dominio/completezza';
import { titoloElemento } from './editori';
import { prova } from './comuni';
import { dataIt, numIt, soloOra } from '../util/base';
import { ETICHETTE_STATO_DOC, valoreFormattato } from '../report/contenuti';

export const NOMI_TIPO: Record<TipoElemento, string> = {
  verifica: 'Verifica', domanda: 'Domanda', foto: 'Foto', lettura: 'Lettura', misura: 'Misura', documento: 'Documento',
  anomalia: 'Da chiarire', tabella: 'Tabella', protocollo: 'Manovre', uscitaArea: 'Prima di uscire', informazione: 'Nota',
};

/** Titolo breve: il campo `titolo` se c'è (struttura 1.1), altrimenti la prima frase del testo, accorciata. */
export function titoloBreve(el: Elemento): string {
  if (el.titolo && el.tipo !== 'uscitaArea') return el.titolo;
  return accorcia(titoloElemento(el));
}

export function accorcia(t: string, max = 64): string {
  const s = t.replace(/\s+/g, ' ').trim();
  const m = /^(.{12,}?)(\?|[.;:](\s|$)| — | – | \()/.exec(s);
  let r = m ? (m[2] === '?' ? m[1] + '?' : m[1]) : s;
  if (r.length > max) r = r.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return r;
}

/** Testo completo da mostrare nel pannello, solo se aggiunge qualcosa al titolo breve. */
export function descrizione(el: Elemento): string | null {
  const t = titoloElemento(el);
  const b = titoloBreve(el);
  if (el.tipo === 'tabella' || el.tipo === 'protocollo' || el.tipo === 'uscitaArea') return null;
  return t.trim() === b.trim() || t.trim() === b.replace(/…$/, '').trim() ? null : t;
}

const P: Record<string, string> = {
  verifica: 'M4 5h16v14H4zM8 12l3 3 5-6',
  domanda: 'M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4M12 18h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  foto: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  lettura: 'M4 15a8 8 0 1 1 16 0M12 15l4-5M3 19h18',
  misura: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  documento: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  anomalia: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  tabella: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
  protocollo: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  uscitaArea: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
  informazione: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  indietro: 'M15 6l-6 6 6 6', avanti: 'M9 6l6 6-6 6', chiudi: 'M6 6l12 12M18 6L6 18', ok: 'M5 12l4 4 10-10',
  cerca: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20',
  adesso: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  aree: 'M3 4h8v7H3zM13 4h8v7h-8zM3 13h8v7H3zM13 13h8v7h-8z',
  dafare: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
};
export function Icona({ n, d = 22, s = 2, colore = 'currentColor', stile }: { n: string; d?: number; s?: number; colore?: string; stile?: string }) {
  return <svg width={d} height={d} viewBox="0 0 24 24" fill="none" stroke={colore} stroke-width={s} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={stile}><path d={P[n] ?? P.informazione} /></svg>;
}

/** Riassunto di una voce fatta, da mostrare sotto il titolo. */
export function riassunto(ses: Sessione, el: Elemento, e?: Esito): string {
  if (!e) return '';
  switch (el.tipo) {
    case 'domanda': return e.risposta ? `→ ${e.risposta}` : e.stato === 'nonRisposta' ? 'nessuna risposta' : e.stato === 'rinviata' ? 'rinviata' : '';
    case 'verifica': return e.stato === 'aperto' ? '' : ({ confermato: 'confermato', corretto: 'corretto', difforme: 'difforme', nonVerificabile: 'non verificabile', daIntegrare: 'da integrare' } as Record<string, string>)[e.stato] + (e.valoreRilevato != null ? `: ${numIt(e.valoreRilevato)}` : '');
    case 'documento': return e.stato === 'aperto' ? '' : `${ETICHETTE_STATO_DOC[e.stato] ?? e.stato}${e.promessoEntro ? ' entro ' + dataIt(e.promessoEntro) : ''}`;
    case 'lettura': case 'misura': return (e.valori ?? []).filter((v) => v.valore != null).slice(0, 3).map((v) => `${numIt(v.valore)}${v.unita ? ' ' + v.unita : ''} · ${soloOra(v.il)}`).join('  ·  ') || (e.stato === 'nonEseguibile' ? 'non eseguibile' : '');
    case 'foto': { const n = (e.evidenze ?? []).filter((id) => !ses.stato.evidenze[id]?.annullata).length; return e.stato === 'nonDisponibile' ? 'non disponibile' : n ? `${n} foto` : ''; }
    case 'anomalia': return e.esito ?? '';
    default: return '';
  }
}

/** Avanzamento parziale di una voce, es. «1 di 2 foto». */
export function avanzamento(ses: Sessione, el: Elemento): string {
  const e = ses.stato.esiti[el.id];
  if (el.tipo === 'foto') { const n = (e?.evidenze ?? []).filter((id) => !ses.stato.evidenze[id]?.annullata).length; return `${n} di ${el.scattiMinimi ?? 2} foto`; }
  if (el.tipo === 'protocollo') { const fatti = el.passi.filter((p) => e?.passi?.[p.id] && e.passi[p.id].stato !== 'daFare').length; return `${fatti} di ${el.passi.length} passi`; }
  return 'in parte';
}

/** Gruppi della lista di un'area: per componente se la struttura li ha, altrimenti per tipo. */
export function gruppiArea(els: Elemento[]): { titolo: string; voci: Elemento[] }[] {
  const conComp = els.some((e) => e.componente);
  const out: { titolo: string; voci: Elemento[] }[] = [];
  const trova = (t: string) => { let g = out.find((x) => x.titolo === t); if (!g) { g = { titolo: t, voci: [] }; out.push(g); } return g; };
  if (conComp) {
    trova('Tutta l\'area');
    for (const e of els) trova(e.componente ?? 'Tutta l\'area').voci.push(e);
    return out.filter((g) => g.voci.length);
  }
  const NOMI: [TipoElemento[], string][] = [
    [['verifica'], 'Da verificare'], [['domanda'], 'Da chiedere'], [['documento'], 'Documenti'], [['lettura', 'misura'], 'Letture e misure'],
    [['tabella'], 'Da rilevare in tabella'], [['protocollo'], 'Manovre a orario'], [['foto'], 'Foto'], [['anomalia'], 'Da chiarire'],
  ];
  for (const [tipi, t] of NOMI) { const v = els.filter((e) => tipi.includes(e.tipo)); if (v.length) out.push({ titolo: t, voci: v }); }
  return out;
}

/** Voci "navigabili" di un'area in ordine (senza note informative e senza l'uscita area). */
export function sequenzaArea(ses: Sessione, area: string): Elemento[] {
  const els = ses.struttura.elementi.filter((e) => e.area === area && e.tipo !== 'informazione' && e.tipo !== 'uscitaArea').sort((a, b) => a.ordine - b.ordine);
  return gruppiArea(els).flatMap((g) => g.voci);
}

export function confermaRapida(ses: Sessione, el: Elemento) {
  return prova(() => ses.registra('esito.aggiornato', el.id, { campi: { stato: 'confermato' } }), 'Confermato');
}

export function RigaVoce({ ses, el, attiva, onApri }: { ses: Sessione; el: Elemento; attiva?: boolean; onApri: () => void }) {
  const st: StatoVoce = statoElemento(ses.struttura, ses.stato, el);
  const e = ses.stato.esiti[el.id];
  const fatto = st === 'completo';
  const r = fatto ? riassunto(ses, el, e) : '';
  const nf = st === 'derogato';
  const veloce = !fatto && !nf && el.tipo === 'verifica' && el.agliAtti;
  const sotto = fatto ? r : nf ? 'non fattibile oggi' : st === 'parziale' ? avanzamento(ses, el) : veloce && el.tipo === 'verifica' ? `agli atti: ${valoreFormattato(el.agliAtti!.valore, el.agliAtti!.unita)}` : '';
  const clic: JSX.MouseEventHandler<HTMLDivElement> = (ev) => { if ((ev.target as HTMLElement).closest('button.rapido')) return; onApri(); };
  return <div class={`rv ${fatto ? 'fatta' : ''} ${attiva ? 'attiva' : ''}`} role="button" tabIndex={0} onClick={clic} onKeyDown={(k) => { if (k.key === 'Enter') onApri(); }} id={`el-${el.id}`}>
    <span class="rv-ic"><Icona n={el.tipo} d={20} /></span>
    <span class="rv-t">
      <span class="rv-tit">{titoloBreve(el)}</span>
      {sotto && <span class={`rv-sotto ${st === 'parziale' ? 'parz' : ''}`}>{sotto}</span>}
    </span>
    {fatto ? <span class="rv-ok" aria-label="fatto"><Icona n="ok" d={20} s={2.6} /></span>
      : veloce ? <button class="rapido" onClick={() => confermaRapida(ses, el)}>Confermo</button>
        : el.priorita === 'A' && !nf ? <span class="rv-a" title="Importante">A</span> : null}
  </div>;
}
