// Scheda PDF: collega il testo del PDF di campo ai codici della struttura.
// Funzione pura: riceve il testo delle pagine (posizioni in punti PDF, origine in basso a sinistra)
// e restituisce dove stanno i codici (zone da toccare) e dove scrivere ciò che si registra (campi).
import type { Struttura, Stato, Elemento, ElTabella, ElLettura, ElMisura, ElProtocollo } from './tipi';
import { statoElemento, statoLista, statoCodice, type StatoVoce } from './completezza';
import { numIt, soloOra, dataIt } from '../util/base';

export interface TestoPagina { n: number; larghezza: number; altezza: number; voci: { s: string; x: number; y: number; w: number; h: number }[] }

export type Contenuto =
  | { k: 'esito'; el: string }
  | { k: 'risposta'; el: string }
  | { k: 'doc'; el: string }
  | { k: 'fatta'; el: string }
  | { k: 'nfoto'; el: string }
  | { k: 'anomalia'; el: string }
  | { k: 'valore'; el: string; g: string; m: string; r: number }
  | { k: 'ora'; el: string; g?: string; m?: string }
  | { k: 'cella'; el: string; riga: string; col: string }
  | { k: 'passoOra'; el: string; passo: string }
  | { k: 'passoVal'; el: string; passo: string }
  | { k: 'lista'; codici: string[] }
  | { k: 'prep'; id: string };

/** Zona da toccare: il codice e la sua riga. */
export interface Ancora { pagina: number; x: number; y: number; w: number; h: number; apre: string; codice: string; prep?: string }
/** Campo da scrivere sul PDF: cella di destinazione (x, larghezza) alla quota della riga. */
export interface Campo { pagina: number; x: number; y: number; w: number; fs: number; c: Contenuto; apre?: string }
export interface IndiceScheda { ancore: Ancora[]; campi: Campo[]; ordine: string[]; paginaDi: Record<string, number>; pagine: { n: number; larghezza: number; altezza: number }[] }

type Voce = TestoPagina['voci'][number];
const MOMENTI = new Set(['arrivo', 'partenza', 'intermedia', 'unica']);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function righe(voci: Voce[]): Voce[][] {
  const ord = [...voci].filter((v) => v.s.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const out: Voce[][] = [];
  for (const v of ord) {
    const r = out.at(-1);
    if (r && Math.abs(r[0].y - v.y) < 2.5) r.push(v); else out.push([v]);
  }
  return out.map((r) => r.sort((a, b) => a.x - b.x));
}

const TESTATE = /^(codice|id|momento|grandezza|passo|n\.?|☐)$/i;

export function indicizza(s: Struttura, pagine: TestoPagina[]): IndiceScheda {
  const el = new Map<string, Elemento>(s.elementi.map((e) => [e.id, e]));
  const rigaDi = new Map<string, ElTabella>();
  const passoDi = new Map<string, ElProtocollo>();
  for (const e of s.elementi) {
    if (e.tipo === 'tabella') for (const r of e.righe ?? []) rigaDi.set(r.id, e);
    if (e.tipo === 'protocollo') for (const p of e.passi) passoDi.set(p.id, e);
  }
  const prep = new Set((s.preparazione ?? []).map((p, i) => p.id ?? `p${i}`));
  const noto = (c: string) => el.has(c) || rigaDi.has(c) || passoDi.has(c);
  const ancore: Ancora[] = [], campi: Campo[] = [], ordine: string[] = [];
  const paginaDi: Record<string, number> = {};
  let testata: Voce[] = [];
  let gruppo: ElLettura | ElMisura | null = null;
  let tabella: ElTabella | null = null;

  const colonna = (t: RegExp | string, larghezza: number): { x: number; w: number } | null => {
    const i = testata.findIndex((h) => (typeof t === 'string' ? norm(h.s).startsWith(norm(t)) && norm(t).length > 0 : t.test(h.s.trim())));
    if (i < 0) return null;
    const x = testata[i].x;
    const dopo = testata.slice(i + 1).find((h) => h.x > x + 4);
    return { x, w: Math.max(20, (dopo ? dopo.x : larghezza - 40) - x - 3) };
  };

  for (const p of pagine) {
    const L = righe(p.voci);
    for (const r of L) {
      const toks = r[0].s.trim() === '☐' ? r.slice(1) : r;
      if (!toks.length) continue;
      const primo = toks[0].s.trim();
      const lead = primo.split(/\s+·\s+|\s+/)[0].replace(/[,:;]$/, '');
      const fs = Math.max(5, Math.min(9, toks[0].h || 7));
      const H = fs * 1.15;

      // riga di testata di una tabella
      if (TESTATE.test(primo) && r.length >= 3 && !noto(lead)) { testata = r; continue; }

      const ancora = (apre: string, codice: string, v: Voce) => {
        const largo = Math.max(v.w * (codice.length / Math.max(1, v.s.length)), fs * 2);
        ancore.push({ pagina: p.n, x: v.x, y: v.y, w: Math.max(largo, p.larghezza - 40 - v.x), h: H, apre, codice });
        if (!(apre in paginaDi)) { paginaDi[apre] = p.n; ordine.push(apre); }
      };
      const campo = (col: { x: number; w: number } | null, c: Contenuto, apre?: string) => {
        if (col) campi.push({ pagina: p.n, x: col.x, y: toks[0].y, w: col.w, fs, c, apre });
      };

      // uscita area «Prima di lasciare l'area (U-XXX)» e righe ☐ … [codici]
      const uscita = /\((U-[A-Za-z0-9-]+)\)/.exec(primo);
      if (uscita && el.has(uscita[1])) { gruppo = null; continue; }
      if (r[0].s.trim().startsWith('☐') && /\[([^\]]+)\]\s*$/.test(r.map((v) => v.s).join(' '))) {
        const m = /\[([^\]]+)\]\s*$/.exec(r.map((v) => v.s).join(' '))!;
        const cod = m[1].split(/[,\s]+/).filter(noto);
        if (cod.length) { campi.push({ pagina: p.n, x: r[0].x, y: r[0].y, w: 10, fs, c: { k: 'lista', codici: cod }, apre: cod[0] }); continue; }
      }

      if (el.has(lead) && toks[0].x < p.larghezza * 0.3) {
        const e = el.get(lead)!;
        ancora(e.id, lead, toks[0]);
        gruppo = null;
        switch (e.tipo) {
          case 'verifica': campo(colonna(/^Esito/i, p.larghezza), { k: 'esito', el: e.id }); break;
          case 'domanda': campo(colonna(/^Risposta/i, p.larghezza), { k: 'risposta', el: e.id }); break;
          case 'documento': campo(colonna(/^(Ritirato|Esito|Stato|Promesso)/i, p.larghezza), { k: 'doc', el: e.id }); break;
          case 'foto': campo(colonna(/^Fatta/i, p.larghezza), { k: 'fatta', el: e.id }); campo(colonna(/^N\.?\s*foto/i, p.larghezza), { k: 'nfoto', el: e.id }); break;
          case 'anomalia': campo(colonna(/^Esito/i, p.larghezza), { k: 'anomalia', el: e.id }); break;
          case 'lettura': case 'misura': gruppo = e; break;
          case 'tabella': tabella = e; break;
          default: break;
        }
        continue;
      }
      if (rigaDi.has(lead) && toks[0].x < p.larghezza * 0.3) {
        const t = rigaDi.get(lead)!;
        tabella = t; gruppo = null;
        ancora(t.id, lead, toks[0]);
        for (const c of t.colonne) {
          if (c.chiave || c.solaLettura) continue;
          campo(colonna(c.etichetta.split(/[(/[]/)[0].trim() || c.etichetta, p.larghezza), { k: 'cella', el: t.id, riga: lead, col: c.id }, t.id);
        }
        continue;
      }
      if (passoDi.has(lead) && toks[0].x < p.larghezza * 0.3) {
        const pr = passoDi.get(lead)!;
        gruppo = null;
        ancora(pr.id, lead, toks[0]);
        campo(colonna(/^Ora effettiva/i, p.larghezza), { k: 'passoOra', el: pr.id, passo: lead }, pr.id);
        campo(colonna(/^Valori/i, p.larghezza), { k: 'passoVal', el: pr.id, passo: lead }, pr.id);
        continue;
      }
      if (prep.has(lead) && toks[0].x < p.larghezza * 0.3) {
        ancore.push({ pagina: p.n, x: toks[0].x, y: toks[0].y, w: p.larghezza - 40 - toks[0].x, h: H, apre: '', codice: lead, prep: lead });
        campi.push({ pagina: p.n, x: r[0].x, y: r[0].y, w: 10, fs, c: { k: 'prep', id: lead } });
        continue;
      }
      // righe delle grandezze di una lettura o misura
      if (gruppo) {
        let m = 'unica', resto = toks;
        if (MOMENTI.has(primo.toLowerCase())) { m = primo.toLowerCase(); resto = toks.slice(1); }
        const testo = norm(resto[0]?.s ?? '');
        const g = testo ? gruppo.grandezze.find((x) => { const n = norm(x.nome); return testo === n || testo.startsWith(n) || (n.startsWith(testo) && testo.length > 6); }) : undefined;
        if (g) {
          if (gruppo.tipo === 'misura' && m === 'unica') m = 'unica';
          const nr = g.ripetizioni ?? 1;
          for (let k = 1; k <= nr; k++) campo(colonna(nr > 1 ? new RegExp(`^Valore\\s*${k}$`, 'i') : /^Valore(\s*1)?$/i, p.larghezza), { k: 'valore', el: gruppo.id, g: g.id, m, r: k }, gruppo.id);
          campo(colonna(/^Ora$/i, p.larghezza), { k: 'ora', el: gruppo.id, g: g.id, m }, gruppo.id);
          ancore.push({ pagina: p.n, x: toks[0].x, y: toks[0].y, w: p.larghezza - 40 - toks[0].x, h: H, apre: gruppo.id, codice: `${gruppo.id}·${g.id}` });
          continue;
        }
      }
      // elenchi di codici (le 20 cose, obiettivi): «L01, L02, F01»
      for (const v of r) {
        const t = v.s.trim().replace(/,$/, '');
        if (!/^[A-Z][A-Za-z0-9-]*(,\s*[A-Z][A-Za-z0-9-]*)*$/.test(t) || t === lead && el.has(lead)) continue;
        const cod = t.split(/,\s*/);
        if (cod.length && cod.every(noto) && v.x > p.larghezza * 0.3) {
          campi.push({ pagina: p.n, x: v.x + v.w + 3, y: v.y, w: 12, fs, c: { k: 'lista', codici: cod }, apre: cod[0] });
        }
      }
    }
  }
  void tabella;
  return { ancore, campi, ordine, paginaDi, pagine: pagine.map((p) => ({ n: p.n, larghezza: p.larghezza, altezza: p.altezza })) };
}

const ESITI: Record<string, string> = { confermato: 'confermato', corretto: 'corretto', difforme: 'difforme', nonVerificabile: 'non verificabile', daIntegrare: 'da integrare' };
const DOC: Record<string, string> = { ritiratoOriginale: 'ritirato (originale)', ritiratoCopia: 'ritirato (copia)', fotografato: 'fotografato', promesso: 'promesso', nonDisponibile: 'non disponibile' };

/** Testo da scrivere nel campo e stato (per il colore). Vuoto se non c'è nulla di registrato. */
export function testoCampo(s: Struttura, st: Stato, c: Contenuto): { testo: string; stato?: StatoVoce } {
  const e = 'el' in c ? st.esiti[c.el] : undefined;
  const nEv = (id: string) => (st.esiti[id]?.evidenze ?? []).filter((x) => !st.evidenze[x]?.annullata).length;
  switch (c.k) {
    case 'esito': {
      if (!e || e.stato === 'aperto') return { testo: deroga(st, c.el) };
      const v = e.valoreRilevato != null ? ` ${numIt(e.valoreRilevato)}` : '';
      return { testo: `${ESITI[e.stato] ?? e.stato}${v}${e.classe && e.stato !== 'confermato' ? ` (${e.classe})` : ''}${e.fonte ? ` · ${e.fonte}` : ''}${e.motivo ? ` · ${e.motivo}` : ''}`, stato: 'completo' };
    }
    case 'risposta': {
      if (!e || (!e.risposta && e.stato === 'aperta')) return { testo: deroga(st, c.el) };
      if (e.stato === 'nonRisposta') return { testo: `nessuna risposta${e.motivo ? ' · ' + e.motivo : ''}`, stato: 'completo' };
      if (e.stato === 'rinviata') return { testo: `rinviata${e.note ? ' · ' + e.note : ''}`, stato: 'completo' };
      return { testo: `${e.risposta ?? ''}${e.rispostaDa ? ` — ${e.rispostaDa}` : ''}${e.provenienza ? ` — ${e.provenienza}` : ''}`, stato: 'completo' };
    }
    case 'doc': {
      if (!e || e.stato === 'aperto') return { testo: deroga(st, c.el) };
      return { testo: `${DOC[e.stato] ?? e.stato}${e.promessoEntro ? ' entro ' + dataIt(e.promessoEntro) : ''}${e.chiLoInvia ? ' / ' + e.chiLoInvia : ''}${e.motivo ? ' · ' + e.motivo : ''}`, stato: 'completo' };
    }
    case 'fatta': {
      const x = el(s, c.el); if (!x) return { testo: '' };
      const sv = statoElemento(s, st, x);
      return { testo: sv === 'completo' ? '✓' : '', stato: sv };
    }
    case 'nfoto': { const n = nEv(c.el); const nd = e?.stato === 'nonDisponibile'; return { testo: nd ? `n.d. · ${e?.motivo ?? ''}` : n ? String(n) : '', stato: n || nd ? 'completo' : undefined }; }
    case 'anomalia': {
      if (!e || (e.stato === 'aperta' && !e.esito)) return { testo: '' };
      return { testo: `${e.stato}${e.esito ? ' — ' + e.esito : ''}`, stato: e.stato === 'aperta' ? 'parziale' : 'completo' };
    }
    case 'valore': {
      const v = e?.valori?.find((x) => x.grandezza === c.g && (x.momento ?? 'unica') === c.m && (x.ripetizione ?? 1) === c.r);
      return v && v.valore != null ? { testo: numIt(v.valore), stato: 'completo' } : { testo: '' };
    }
    case 'ora': {
      const v = e?.valori?.find((x) => x.grandezza === c.g && (x.momento ?? 'unica') === c.m);
      return v ? { testo: `${soloOra(v.il)}${v.oraCorretta ? '*' : ''}`, stato: 'completo' } : { testo: '' };
    }
    case 'cella': {
      const x = e?.celle?.[c.riga]?.[c.col];
      if (!x) return { testo: '' };
      const t = x.stato === 'nonVerificabile' ? `n.v.${x.motivo ? ' · ' + x.motivo : ''}` : x.stato === 'confermato' ? `✓ ${x.valore != null ? numIt(x.valore) : ''}` : x.valore != null ? numIt(x.valore) : '';
      return { testo: t.trim(), stato: 'completo' };
    }
    case 'passoOra': { const pe = e?.passi?.[c.passo]; return pe?.oraEffettiva ? { testo: soloOra(pe.oraEffettiva), stato: 'completo' } : pe?.stato === 'saltato' ? { testo: 'saltato', stato: 'completo' } : { testo: '' }; }
    case 'passoVal': {
      const pe = e?.passi?.[c.passo];
      const v = (pe?.valori ?? []).filter((x) => x.valore != null).map((x) => numIt(x.valore)).join(' · ');
      const t = [v, pe?.note, pe?.motivo].filter(Boolean).join(' · ');
      return { testo: t, stato: t ? 'completo' : undefined };
    }
    case 'lista': { const sv = statoLista(s, st, c.codici); return { testo: sv === 'completo' ? '✓' : sv === 'parziale' ? '◐' : '', stato: sv }; }
    case 'prep': return { testo: st.preparazioneFatta[c.id] ? '✓' : '', stato: st.preparazioneFatta[c.id] ? 'completo' : 'aperto' };
  }
}

function el(s: Struttura, id: string) { return s.elementi.find((e) => e.id === id); }
function deroga(st: Stato, id: string) { const d = st.deroghe.find((x) => x.codice === id); return d ? `non fattibile oggi · ${d.motivo}` : ''; }

/** Stato della voce per il bollino accanto al codice. */
export function statoAncora(s: Struttura, st: Stato, a: Ancora): StatoVoce {
  if (a.prep) return st.preparazioneFatta[a.prep] ? 'completo' : 'aperto';
  return statoCodice(s, st, a.codice === a.apre ? a.apre : a.codice);
}
