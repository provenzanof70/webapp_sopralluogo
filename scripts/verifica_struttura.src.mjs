#!/usr/bin/env node
// Verifica di una struttura di sopralluogo (struttura.json) — schema + controlli semantici.
// Uso:  node verifica_struttura.mjs <struttura.json> [--figure-dir <cartella che contiene figure/>]
// Dipendenze: ajv@8, ajv-formats@3 (npm i ajv ajv-formats)
// Uscita: 0 se valida, 1 se ci sono errori. Gli avvisi non bloccano.

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const qui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (!args[0]) { console.error('Uso: node verifica_struttura.mjs <struttura.json> [--figure-dir <dir>]'); process.exit(2); }
const fileStruttura = resolve(args[0]);
const iFig = args.indexOf('--figure-dir');
const dirFigure = iFig >= 0 ? resolve(args[iFig + 1]) : dirname(fileStruttura);

const schema = JSON.parse(readFileSync(join(qui, '..', 'schema', 'struttura-sopralluogo.v1.schema.json'), 'utf8'));
const s = JSON.parse(readFileSync(fileStruttura, 'utf8'));

const errori = [];
const avvisi = [];

// 1. Schema
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const valida = ajv.compile(schema);
const fmt = (e, base = '') => `SCHEMA ${base}${e.instancePath || ''}: ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`;
// mappa tipo -> definizione specifica, per messaggi leggibili (oneOf altrimenti elenca tutte le varianti)
const defPerTipo = {
  verifica: 'elVerifica', domanda: 'elDomanda', foto: 'elFoto', lettura: 'elLettura', misura: 'elMisura',
  documento: 'elDocumento', anomalia: 'elAnomalia', tabella: 'elTabella', protocollo: 'elProtocollo',
  uscitaArea: 'elUscitaArea', informazione: 'elInformazione',
};
if (!valida(s)) {
  const fuoriElementi = valida.errors.filter((e) => !/^\/elementi\/[0-9]+/.test(e.instancePath));
  for (const e of fuoriElementi) errori.push(fmt(e));
  (Array.isArray(s.elementi) ? s.elementi : []).forEach((el, i) => {
    const def = defPerTipo[el && el.tipo];
    const base = `/elementi/${i} (${el && el.id})`;
    if (!def) { errori.push(`SCHEMA ${base}: tipo «${el && el.tipo}» non ammesso (${Object.keys(defPerTipo).join(', ')})`); return; }
    const v = ajv.getSchema(`${schema.$id}#/$defs/${def}`);
    if (!v(el)) for (const e of v.errors) errori.push(fmt(e, base));
  });
}

// 2. Controlli semantici (solo se la forma base regge)
const arr = (x) => (Array.isArray(x) ? x : []);
const codici = new Map(); // codice -> origine
const registra = (id, dove) => {
  if (!id) return;
  if (codici.has(id)) errori.push(`Codice duplicato «${id}» (${dove} e ${codici.get(id)})`);
  else codici.set(id, dove);
};
const aree = new Set(arr(s.aree).map((a) => a.id));
arr(s.aree).forEach((a) => registra(a.id, 'aree'));
arr(s.elementi).forEach((e) => registra(e.id, `elemento ${e.tipo}`));
arr(s.obiettivi).forEach((o) => registra(o.id, 'obiettivi'));
arr(s.figure).forEach((f) => registra(f.id, 'figure'));
const persone = new Set(arr(s.persone).map((p) => p.id));
arr(s.persone).forEach((p) => registra(p.id, 'persone'));
// codici "interni" (righe di tabella, passi di protocollo, grandezze) devono essere univoci nel loro contenitore
const interni = new Set();
for (const e of arr(s.elementi)) {
  if (e.tipo === 'tabella') {
    const cols = new Set();
    for (const c of arr(e.colonne)) { if (cols.has(c.id)) errori.push(`${e.id}: colonna duplicata ${c.id}`); cols.add(c.id); }
    const righe = new Set();
    for (const r of arr(e.righe)) {
      if (righe.has(r.id)) errori.push(`${e.id}: riga duplicata ${r.id}`);
      righe.add(r.id); interni.add(r.id);
      for (const k of Object.keys(r.celle || {})) if (!cols.has(k)) errori.push(`${e.id}/${r.id}: cella su colonna inesistente «${k}»`);
    }
    if (!arr(e.colonne).some((c) => c.chiave)) avvisi.push(`${e.id}: nessuna colonna «chiave» — l'app userà l'id della riga come etichetta`);
  }
  if (e.tipo === 'protocollo') {
    const passi = new Set();
    for (const p of arr(e.passi)) { if (passi.has(p.id)) errori.push(`${e.id}: passo duplicato ${p.id}`); passi.add(p.id); interni.add(p.id); }
  }
  if (e.tipo === 'lettura' || e.tipo === 'misura') {
    const g = new Set();
    for (const x of arr(e.grandezze)) { if (g.has(x.id)) errori.push(`${e.id}: grandezza duplicata ${x.id}`); g.add(x.id); }
  }
}
const esiste = (c) => codici.has(c) || interni.has(c);

// aree referenziate
for (const e of arr(s.elementi)) if (!aree.has(e.area)) errori.push(`${e.id}: area «${e.area}» inesistente`);
for (const v of arr(s.nonLasciare)) if (v.area && !aree.has(v.area)) errori.push(`Cosa da non lasciare n.${v.n}: area «${v.area}» inesistente`);
for (const f of arr(s.programma)) for (const a of arr(f.aree)) if (!aree.has(a)) errori.push(`Programma ${f.dalle}: area «${a}» inesistente`);
for (const a of arr(s.aree)) for (const fid of arr(a.figure)) if (!codici.has(fid)) errori.push(`Area ${a.id}: figura «${fid}» inesistente`);

// rimandi
const controllaRif = (lista, dove) => { for (const c of arr(lista)) if (!esiste(c)) errori.push(`${dove}: rimando a codice inesistente «${c}»`); };
for (const o of arr(s.obiettivi)) controllaRif(o.rif, `Obiettivo ${o.id}`);
for (const v of arr(s.nonLasciare)) { controllaRif(v.rif, `Cosa da non lasciare n.${v.n}`); controllaRif(v.obiettivi, `Cosa da non lasciare n.${v.n}`); }
for (const e of arr(s.elementi)) {
  // rif può contenere codici esterni (R*, C*, IM*, S*, residui del rapporto): solo avviso
  for (const c of arr(e.rif)) if (!esiste(c)) avvisi.push(`${e.id}: rif «${c}» non presente nella struttura (ammesso se è un codice del rapporto)`);
  if (e.tipo === 'anomalia') controllaRif(e.doveSiVerifica, `Anomalia ${e.id}`);
  if (e.tipo === 'lettura') controllaRif(e.fotoCollegate, `Lettura ${e.id}`);
  if (e.tipo === 'uscitaArea') for (const v of arr(e.voci)) controllaRif(v.rif, `Uscita area ${e.id}`);
  if (e.tipo === 'informazione' && e.figura && !codici.has(e.figura)) errori.push(`${e.id}: figura «${e.figura}» inesistente`);
  if (e.tipo === 'domanda' && e.destinatario && /^P[0-9]+$/.test(e.destinatario) && !persone.has(e.destinatario)) errori.push(`${e.id}: persona «${e.destinatario}» inesistente`);
}
if (s.verbale) for (const f of arr(s.verbale.firme)) if (f.persona && !persone.has(f.persona)) errori.push(`Firma ${f.id}: persona «${f.persona}» inesistente`);

// classi usate devono stare in legenda
const classi = new Set(Object.keys((s.legenda && s.legenda.classi) || {}));
const controllaClasse = (d, dove) => { if (d && d.classe && classi.size && !classi.has(d.classe)) avvisi.push(`${dove}: classe «${d.classe}» non in legenda`); };
for (const e of arr(s.elementi)) {
  controllaClasse(e.agliAtti, e.id);
  if (e.tipo === 'tabella') for (const r of arr(e.righe)) for (const [k, d] of Object.entries(r.celle || {})) controllaClasse(d, `${e.id}/${r.id}/${k}`);
}

// ordine univoco per area
const ordini = new Map();
for (const e of arr(s.elementi)) {
  const k = `${e.area}#${e.ordine}`;
  if (ordini.has(k)) avvisi.push(`Area ${e.area}: ordine ${e.ordine} usato da ${ordini.get(k)} e ${e.id}`);
  ordini.set(k, e.id);
}

// ogni area con almeno un elemento; ogni foto/domanda/lettura di priorità A richiamata da qualche parte è opzionale → solo statistica
for (const a of aree) if (!arr(s.elementi).some((e) => e.area === a)) avvisi.push(`Area ${a} senza elementi`);

// figure: file presenti e hash coerente
for (const f of arr(s.figure)) {
  const p = join(dirFigure, f.file);
  if (!existsSync(p)) { errori.push(`Figura ${f.id}: file mancante ${f.file} (cercato in ${dirFigure})`); continue; }
  const h = createHash('sha256').update(readFileSync(p)).digest('hex');
  if (h !== f.sha256) errori.push(`Figura ${f.id}: SHA-256 non corrisponde (atteso ${f.sha256}, trovato ${h})`);
}

// riepilogo
const conta = {};
for (const e of arr(s.elementi)) conta[e.tipo] = (conta[e.tipo] || 0) + 1;
const contaA = arr(s.elementi).filter((e) => e.priorita === 'A').length;
console.log(`Struttura ${s.pratica?.codice ?? '?'} — ${s.generazione?.revisione ?? '?'}`);
console.log(`Elementi: ${Object.entries(conta).map(([k, v]) => `${k} ${v}`).join(' · ')} — priorità A: ${contaA}`);
console.log(`Aree: ${aree.size} · Figure: ${arr(s.figure).length} · Cose da non lasciare: ${arr(s.nonLasciare).length}`);
for (const a of avvisi) console.log(`AVVISO  ${a}`);
for (const e of errori) console.log(`ERRORE  ${e}`);
console.log(errori.length ? `\nNON VALIDA: ${errori.length} errori` : '\nVALIDA');
process.exit(errori.length ? 1 : 0);
