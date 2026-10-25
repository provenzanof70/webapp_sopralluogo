// Export del pacchetto di rientro (checkpoint incrementale o finale sigillato), con volumi.
// Formato: docs/ISTRUZIONI_CLAUDE_CODE.md § 5.2 — verificabile con strumenti/verifica_pacchetto_rientro.py
import type { Sessione } from '../archivio/sessione';
import { db } from '../archivio/db';
import type { Esito, Evidenza } from '../dominio/tipi';
import { statoLista } from '../dominio/completezza';
import { validaManifestRientro } from '../dominio/validazione';
import { sha256, utf8, isoLocale, fusoOrario, marcaFile } from '../util/base';
import { scriviZip, type FileDaScrivere } from '../util/zip';

export const VERSIONE_APP = '1.4.0';
declare const __BUILD__: string;
export const BUILD_APP = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'sviluppo';
export const VERSIONE_SCHEMA = '1.0.0';

export interface FileReport { nome: string; dati: Uint8Array | Blob; tipo: 'verbale' | 'reportDettagliato' | 'reportSintetico' | 'fascicoloFotografico' | 'tabellaCsv' | 'figuraAnnotata' | 'schedaCompilata'; elemento?: string }

export interface PacchettoPronto {
  tipo: 'checkpoint' | 'finale';
  volumi: { nome: string; blob: Blob }[];
  aSeq: number;
  hashFinale: string;
  evidenzeIncluse: string[];
  byteTotali: number;
  nSostanziali: number;
}

const CAMPI: Record<string, string[]> = {
  _base: ['tipo', 'stato', 'aggiornatoIl', 'evidenze', 'note', 'notaInterna'],
  verifica: ['valoreRilevato', 'classe', 'fonte', 'motivo'],
  domanda: ['risposta', 'rispostaDa', 'provenienza', 'daConfermarePerIscritto'],
  foto: ['motivo'],
  lettura: ['valori', 'strumentoUsato', 'motivo'],
  misura: ['valori', 'strumentoUsato', 'motivo'],
  documento: ['promessoEntro', 'chiLoInvia', 'motivo'],
  anomalia: ['esito'],
  tabella: ['celle', 'righeAggiunte', 'csv'],
  protocollo: ['passi', 'ripristino'],
  uscitaArea: [],
  informazione: [],
};

function pulisci<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === '') continue;
    out[k] = v;
  }
  return out as T;
}

function esitoPerManifest(e: Esito, csv?: string): Record<string, unknown> {
  const amm = new Set([...CAMPI._base, ...(CAMPI[e.tipo] ?? [])]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries({ ...e, ...(csv ? { csv } : {}) })) {
    if (!amm.has(k) || v === undefined || v === '') continue;
    if (k === 'evidenze' && Array.isArray(v) && !v.length) continue;
    if (k === 'promessoEntro' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) continue;
    if (k === 'valori') { out[k] = (v as object[]).map((x) => pulisci(x)); continue; }
    if (k === 'passi') {
      const p: Record<string, unknown> = {};
      for (const [pid, pe] of Object.entries(v as Record<string, object>)) p[pid] = pulisci(pe);
      out[k] = p; continue;
    }
    if (k === 'celle') {
      const c: Record<string, Record<string, unknown>> = {};
      for (const [r, cols] of Object.entries(v as Record<string, Record<string, object>>)) {
        c[r] = {};
        for (const [col, cel] of Object.entries(cols)) {
          const x = pulisci(cel) as Record<string, unknown>;
          if (Array.isArray(x.evidenze) && !x.evidenze.length) delete x.evidenze;
          c[r][col] = x;
        }
      }
      out[k] = c; continue;
    }
    if (k === 'ripristino') { out[k] = pulisci(v as object); continue; }
    out[k] = v;
  }
  return out;
}

function evidenzaPerManifest(e: Evidenza): Record<string, unknown> {
  return pulisci({ ...e }) as Record<string, unknown>;
}

export function nomePacchetto(ses: Sessione, tipo: 'checkpoint' | 'finale', marca: string, vol?: { n: number; tot: number }) {
  const p = ses.struttura.pratica;
  const v = vol && vol.tot > 1 ? `_vol${String(vol.n).padStart(2, '0')}di${String(vol.tot).padStart(2, '0')}` : '';
  return `SOPRALLUOGO_${p.prefissoFile}_${p.data.replace(/-/g, '')}_RIENTRO_${tipo}_${marca}${v}.zip`;
}

export async function costruisciManifest(ses: Sessione, tipo: 'checkpoint' | 'finale', report: FileReport[], csvPerTabella: Record<string, string>) {
  const st = ses.stato;
  const s = ses.struttura;
  const rs = await db().strutture.get(ses.istanza.id);
  const esiti: Record<string, unknown> = {};
  for (const [codice, e] of Object.entries(st.esiti)) esiti[codice] = esitoPerManifest(e, csvPerTabella[codice]);
  const obiettivi: Record<string, unknown> = {};
  for (const o of s.obiettivi ?? []) {
    const stl = statoLista(s, st, o.rif);
    obiettivi[o.id] = pulisci({ stato: stl === 'completo' ? 'completo' : stl === 'aperto' ? 'aperto' : 'parziale', nota: st.obiettivi[o.id]?.nota });
  }
  const ultimoConf = st.checkpoint.confermati.at(-1);
  const installata = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  let persistente: boolean | undefined;
  try { persistente = typeof navigator !== 'undefined' && navigator.storage?.persisted ? await navigator.storage.persisted() : undefined; } catch { persistente = undefined; }
  const m: Record<string, unknown> = {
    formato: 'mcstudio.sopralluogo.rientro',
    versioneSchema: VERSIONE_SCHEMA,
    tipoPacchetto: tipo,
    volume: { numero: 1, totale: 1 },
    struttura: pulisci({
      idStruttura: s.idStruttura, sha256: rs!.sha256, revisione: s.generazione.revisione,
      codicePratica: s.pratica.codice, prefissoFile: s.pratica.prefissoFile, versioneSchema: s.versioneSchema,
    }),
    idSopralluogoLocale: ses.istanza.id,
    app: pulisci({
      versione: VERSIONE_APP,
      piattaforma: typeof navigator !== 'undefined' ? (navigator as { platform?: string }).platform : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      installata, storagePersistente: persistente,
    }),
    creatoIl: isoLocale(),
    fusoOrario: fusoOrario(),
    stato: pulisci({ statoSopralluogo: st.statoSopralluogo, avviatoIl: st.avviatoIl, chiusoIl: st.chiusoIl }),
    eventi: { file: 'eventi.jsonl', daSeq: 1, aSeq: ses.istanza.aSeq, hashFinale: ses.istanza.hashFinale },
    presenti: Object.values(st.presenti).filter((p) => p.presente).map((p) => pulisci({
      persona: p.persona, nome: p.nome, ruolo: p.ruolo, societa: p.societa, telefono: p.telefono, dalle: p.dalle, alle: p.alle,
      aggiuntaInCampo: p.aggiuntaInCampo || undefined,
    })),
    esiti,
    obiettivi,
    evidenze: Object.values(st.evidenze).sort((a, b) => a.acquisitaIl.localeCompare(b.acquisitaIl)).map(evidenzaPerManifest),
    deroghe: st.deroghe,
  };
  if (st.consensi) m.consensi = pulisci({ ...st.consensi });
  if (ultimoConf) m.checkpointPrecedente = { creatoIl: ultimoConf.il, aSeq: ultimoConf.aSeq, hashFinale: ultimoConf.hashFinale, nomeFile: ultimoConf.nomeFile };
  const v = st.verbale;
  if (Object.keys(v.campi).length || v.puntiAperti.length || v.firme.length || v.areeNonAccessibili.length) {
    m.verbale = pulisci({
      campi: v.campi,
      puntiAperti: v.puntiAperti.map((p) => pulisci({ ...p })),
      areeNonAccessibili: v.areeNonAccessibili,
      firme: v.firme,
      pdf: report.find((r) => r.tipo === 'verbale')?.nome,
    });
  }
  if (report.length) {
    m.report = await Promise.all(report.map(async (r) => pulisci({ file: r.nome, tipo: r.tipo, sha256: await sha256(r.dati), elemento: r.elemento })));
  }
  const errori = validaManifestRientro(m);
  if (errori.length) throw new Error('Errore interno: manifest non conforme allo schema. Segnalare. ' + errori.join(' · '));
  return m;
}

/** Costruisce il pacchetto. Non registra eventi: lo fa il chiamante dopo la consegna. */
export async function costruisciPacchetto(ses: Sessione, tipo: 'checkpoint' | 'finale', report: FileReport[], sogliaMB = 400): Promise<PacchettoPronto> {
  const st = ses.stato;
  const marca = marcaFile();
  const rs = await db().strutture.get(ses.istanza.id);
  if (!rs) throw new Error('Struttura mancante');
  const eventi = await ses.eventi();
  if (eventi.length !== ses.istanza.aSeq) throw new Error('Registro incompleto sul dispositivo: esportazione interrotta per sicurezza.');
  const jsonl = utf8(eventi.map((e) => e.riga).join('\n') + '\n');
  const csvPerTabella: Record<string, string> = {};
  for (const r of report) if (r.tipo === 'tabellaCsv' && r.elemento) csvPerTabella[r.elemento] = r.nome;
  const manifest = await costruisciManifest(ses, tipo, report, csvPerTabella);

  // evidenze da includere
  const daIncludere = Object.values(st.evidenze).filter((e) => e.file && (tipo === 'finale' || !st.evidenzeEsportate[e.id]));
  const soglia = sogliaMB * 1024 * 1024;
  const gruppi: Evidenza[][] = [[]];
  let dim = report.reduce((a, r) => a + (r.dati instanceof Blob ? r.dati.size : r.dati.byteLength), 0);
  for (const e of daIncludere) {
    if (dim + (e.byte ?? 0) > soglia && gruppi[gruppi.length - 1].length) { gruppi.push([]); dim = 0; }
    gruppi[gruppi.length - 1].push(e);
    dim += e.byte ?? 0;
  }
  const tot = gruppi.length;
  const volumi: { nome: string; blob: Blob }[] = [];
  let byteTotali = 0;
  for (let i = 0; i < tot; i++) {
    const mv = { ...manifest, volume: { numero: i + 1, totale: tot } };
    const files: FileDaScrivere[] = [
      { nome: 'manifest.json', dati: utf8(JSON.stringify(mv, null, 2)) },
      { nome: 'struttura.json', dati: rs.bytes },
      { nome: 'eventi.jsonl', dati: jsonl },
    ];
    if (i === 0) for (const r of report) files.push({ nome: r.nome, dati: r.dati });
    for (const e of gruppi[i]) {
      const b = await ses.blobEvidenza(e.id);
      if (!b) throw new Error(`File dell'evidenza mancante sul dispositivo: ${e.file}`);
      const dati = new Uint8Array(await b.arrayBuffer());
      if ((await sha256(dati)) !== e.sha256) throw new Error(`Impronta non corrispondente per ${e.file}: esportazione interrotta.`);
      files.push({ nome: e.file!, dati });
    }
    files.sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
    const righe: string[] = [];
    for (const f of files) righe.push(`${await sha256(f.dati)}  ${f.nome}`);
    const hashTxt = utf8(righe.join('\n') + '\n');
    files.push({ nome: 'hash.sha256', dati: hashTxt });
    if (tipo === 'finale') {
      const sig = [
        'SIGILLO PACCHETTO DI RIENTRO',
        `pratica: ${ses.struttura.pratica.codice}`,
        `idStruttura: ${ses.struttura.idStruttura}`,
        `idSopralluogoLocale: ${ses.istanza.id}`,
        `creatoIl: ${manifest.creatoIl}`,
        `volume: ${i + 1}/${tot}`,
        `sha256(hash.sha256): ${await sha256(hashTxt)}`,
        `hashFinaleEventi: ${ses.istanza.hashFinale}`,
        `versioneApp: ${VERSIONE_APP}`,
      ].join('\n') + '\n';
      files.push({ nome: 'SIGILLO.txt', dati: utf8(sig) });
    }
    const blob = await scriviZip(files);
    byteTotali += blob.size;
    volumi.push({ nome: nomePacchetto(ses, tipo, marca, { n: i + 1, tot }), blob });
  }
  return { tipo, volumi, aSeq: ses.istanza.aSeq, hashFinale: ses.istanza.hashFinale, evidenzeIncluse: daIncludere.map((e) => e.id), byteTotali, nSostanziali: st.nSostanziali ?? 0 };
}
