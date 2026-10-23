// Validazione della struttura: schema (validatori precompilati) + controlli semantici.
// Stessa logica di strumenti/verifica_struttura.mjs.
import * as V from './validatori.generati.js';
import type { Struttura } from './tipi';

export interface EsitoValidazione { errori: string[]; avvisi: string[] }

type Err = { instancePath: string; message?: string; params?: unknown };
const fmt = (e: Err, base = '') => `${base}${e.instancePath || ''}: ${e.message ?? 'non valido'}${e.params ? ' ' + JSON.stringify(e.params) : ''}`;

const PER_TIPO: Record<string, keyof typeof V> = {
  verifica: 'elemento_verifica', domanda: 'elemento_domanda', foto: 'elemento_foto', lettura: 'elemento_lettura',
  misura: 'elemento_misura', documento: 'elemento_documento', anomalia: 'elemento_anomalia', tabella: 'elemento_tabella',
  protocollo: 'elemento_protocollo', uscitaArea: 'elemento_uscitaArea', informazione: 'elemento_informazione',
};

export function validaStruttura(s: unknown): EsitoValidazione {
  const errori: string[] = [];
  const avvisi: string[] = [];
  if (!V.validaStruttura(s)) {
    const errs = (V.validaStruttura.errors ?? []) as Err[];
    for (const e of errs.filter((e) => !/^\/elementi\/[0-9]+/.test(e.instancePath))) errori.push(fmt(e));
    const el = (s as { elementi?: unknown[] })?.elementi;
    (Array.isArray(el) ? el : []).forEach((x, i) => {
      const e = x as { tipo?: string; id?: string };
      const base = `/elementi/${i} (${e?.id})`;
      const k = PER_TIPO[e?.tipo ?? ''];
      if (!k) { errori.push(`${base}: tipo «${e?.tipo}» non ammesso`); return; }
      const v = V[k];
      if (!v(e)) for (const er of (v.errors ?? []) as Err[]) errori.push(fmt(er, base));
    });
    if (!errori.length) errori.push('Struttura non conforme allo schema');
    return { errori, avvisi };
  }
  controlliSemantici(s as Struttura, errori, avvisi);
  return { errori, avvisi };
}

function controlliSemantici(s: Struttura, errori: string[], avvisi: string[]) {
  const arr = <T,>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : []);
  const codici = new Map<string, string>();
  const registra = (id: string, dove: string) => {
    if (codici.has(id)) errori.push(`Codice duplicato «${id}» (${dove} e ${codici.get(id)})`);
    else codici.set(id, dove);
  };
  const aree = new Set(s.aree.map((a) => a.id));
  s.aree.forEach((a) => registra(a.id, 'aree'));
  s.elementi.forEach((e) => registra(e.id, `elemento ${e.tipo}`));
  arr(s.obiettivi).forEach((o) => registra(o.id, 'obiettivi'));
  arr(s.figure).forEach((f) => registra(f.id, 'figure'));
  arr(s.persone).forEach((p) => registra(p.id, 'persone'));
  const persone = new Set(arr(s.persone).map((p) => p.id));
  const interni = new Set<string>();
  for (const e of s.elementi) {
    if (e.tipo === 'tabella') {
      const cols = new Set<string>();
      for (const c of e.colonne) { if (cols.has(c.id)) errori.push(`${e.id}: colonna duplicata ${c.id}`); cols.add(c.id); }
      const righe = new Set<string>();
      for (const r of arr(e.righe)) {
        if (righe.has(r.id)) errori.push(`${e.id}: riga duplicata ${r.id}`);
        righe.add(r.id); interni.add(r.id);
        for (const k of Object.keys(r.celle ?? {})) if (!cols.has(k)) errori.push(`${e.id}/${r.id}: cella su colonna inesistente «${k}»`);
      }
    }
    if (e.tipo === 'protocollo') {
      const passi = new Set<string>();
      for (const p of e.passi) { if (passi.has(p.id)) errori.push(`${e.id}: passo duplicato ${p.id}`); passi.add(p.id); interni.add(p.id); }
    }
    if (e.tipo === 'lettura' || e.tipo === 'misura') {
      const g = new Set<string>();
      for (const x of e.grandezze) { if (g.has(x.id)) errori.push(`${e.id}: grandezza duplicata ${x.id}`); g.add(x.id); }
    }
  }
  const esiste = (c: string) => codici.has(c) || interni.has(c);
  for (const e of s.elementi) if (!aree.has(e.area)) errori.push(`${e.id}: area «${e.area}» inesistente`);
  for (const v of arr(s.nonLasciare)) if (v.area && !aree.has(v.area)) errori.push(`Cosa da non lasciare n.${v.n}: area «${v.area}» inesistente`);
  for (const f of arr(s.programma)) for (const a of arr(f.aree)) if (!aree.has(a)) errori.push(`Programma ${f.dalle}: area «${a}» inesistente`);
  for (const a of s.aree) for (const fid of arr(a.figure)) if (!codici.has(fid)) errori.push(`Area ${a.id}: figura «${fid}» inesistente`);
  const rif = (l: string[] | undefined, dove: string) => { for (const c of arr(l)) if (!esiste(c)) errori.push(`${dove}: rimando a codice inesistente «${c}»`); };
  for (const o of arr(s.obiettivi)) rif(o.rif, `Obiettivo ${o.id}`);
  for (const v of arr(s.nonLasciare)) { rif(v.rif, `Cosa da non lasciare n.${v.n}`); rif(v.obiettivi, `Cosa da non lasciare n.${v.n}`); }
  for (const e of s.elementi) {
    for (const c of arr(e.rif)) if (!esiste(c)) avvisi.push(`${e.id}: rif «${c}» non presente nella struttura`);
    if (e.tipo === 'anomalia') rif(e.doveSiVerifica, `Anomalia ${e.id}`);
    if (e.tipo === 'lettura') rif(e.fotoCollegate, `Lettura ${e.id}`);
    if (e.tipo === 'uscitaArea') for (const v of e.voci) rif(v.rif, `Uscita area ${e.id}`);
    if (e.tipo === 'informazione' && e.figura && !codici.has(e.figura)) errori.push(`${e.id}: figura «${e.figura}» inesistente`);
    if (e.tipo === 'domanda' && e.destinatario && /^P[0-9]+$/.test(e.destinatario) && !persone.has(e.destinatario)) errori.push(`${e.id}: persona «${e.destinatario}» inesistente`);
  }
  for (const f of arr(s.verbale?.firme)) if (f.persona && !persone.has(f.persona)) errori.push(`Firma ${f.id}: persona «${f.persona}» inesistente`);
  for (const a of aree) if (!s.elementi.some((e) => e.area === a)) avvisi.push(`Area ${a} senza elementi`);
}

export function validaManifestRientro(m: unknown): string[] {
  if (V.validaRientro(m)) return [];
  return ((V.validaRientro.errors ?? []) as Err[]).slice(0, 20).map((e) => fmt(e));
}
