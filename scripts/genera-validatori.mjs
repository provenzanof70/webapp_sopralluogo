// Genera validatori Ajv precompilati (nessun eval a runtime: compatibili con la CSP dell'app).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

const s = JSON.parse(readFileSync('schema/struttura-sopralluogo.v1.schema.json', 'utf8'));
const r = JSON.parse(readFileSync('schema/pacchetto-rientro.v1.schema.json', 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false, code: { source: true, esm: true } });
addFormats(ajv);
ajv.addSchema(s);
ajv.addSchema(r);
const tipi = { verifica: 'elVerifica', domanda: 'elDomanda', foto: 'elFoto', lettura: 'elLettura', misura: 'elMisura',
  documento: 'elDocumento', anomalia: 'elAnomalia', tabella: 'elTabella', protocollo: 'elProtocollo',
  uscitaArea: 'elUscitaArea', informazione: 'elInformazione' };
const mappa = { validaStruttura: s.$id, validaRientro: r.$id };
for (const [t, d] of Object.entries(tipi)) mappa[`elemento_${t}`] = `${s.$id}#/$defs/${d}`;
let codice = standaloneCode(ajv, mappa);
// sostituisce i require() dei runtime Ajv con implementazioni locali (modulo ESM puro)
codice = codice
  .replace(/require\("ajv\/dist\/runtime\/equal"\)\.default/g, '__equal')
  .replace(/require\("ajv\/dist\/runtime\/ucs2length"\)\.default/g, '__ucs2length')
  .replace(/require\("ajv-formats\/dist\/formats"\)\.fullFormats/g, '__fmt');
if (/require\(/.test(codice)) throw new Error('require() residuo nel codice generato');
const preambolo = `
function __equal(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !__equal(a[k], b[k])) return false;
    return true;
  }
  return a !== a && b !== b;
}
function __ucs2length(str) { let n = 0, i = 0; const l = str.length; while (i < l) { n++; const c = str.charCodeAt(i++); if (c >= 0xd800 && c <= 0xdbff && i < l) { const d = str.charCodeAt(i); if ((d & 0xfc00) === 0xdc00) i++; } } return n; }
const __GG = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function __data(s) {
  const m = /^(\\d\\d\\d\\d)-(\\d\\d)-(\\d\\d)$/.exec(s); if (!m) return false;
  const a = +m[1], me = +m[2], g = +m[3];
  const bis = a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0);
  return me >= 1 && me <= 12 && g >= 1 && g <= (me === 2 && bis ? 29 : __GG[me]);
}
function __ora(s) { return /^([01]\\d|2[0-3]):[0-5]\\d:([0-5]\\d|60)(\\.\\d+)?(z|[+-]([01]\\d|2[0-3]):?[0-5]\\d)$/i.test(s); }
const __fmt = {
  date: { validate: __data },
  'date-time': { validate: (s) => { const p = s.split(/t|\\s/i); return p.length === 2 && __data(p[0]) && __ora(p[1]); } },
  uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
};
`;
codice = codice.replace('"use strict";', '"use strict";' + preambolo);
mkdirSync('src/dominio', { recursive: true });
writeFileSync('src/dominio/validatori.generati.js', '// @ts-nocheck\n/* File generato da scripts/genera-validatori.mjs — non modificare */\n' + codice);
writeFileSync('src/dominio/validatori.generati.d.ts',
  'type V = ((d: unknown) => boolean) & { errors?: Array<{ instancePath: string; message?: string; params?: unknown }> | null };\n' +
  Object.keys(mappa).map((k) => `export declare const ${k}: V;`).join('\n') + '\n');
console.log('Validatori generati:', Object.keys(mappa).length);
