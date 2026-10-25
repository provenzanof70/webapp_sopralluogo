// Riduttore: lo stato di campo è funzione pura della struttura e del registro eventi.
// Ogni modifica passa da un evento; lo stato materializzato in archivio deve coincidere con
// la ricostruzione dal solo registro (test obbligatorio).
import type {
  Struttura, Stato, Evento, Esito, Elemento, Evidenza, Cella, PassoEsito, DatoRilevato, Presente, Firma, PuntoAperto,
  ElLettura, ElMisura, ElTabella, TipoElemento,
} from './tipi';

export function statoIniziale(s: Struttura): Stato {
  const presenti: Record<string, Presente> = {};
  for (const p of s.persone ?? []) {
    presenti[p.id] = { chiave: p.id, persona: p.id, nome: p.nome, ruolo: p.ruolo, societa: p.societa, telefono: p.telefono, presente: false };
  }
  return {
    statoSopralluogo: 'preparazione',
    presenti,
    esiti: {},
    evidenze: {},
    progressivi: {},
    deroghe: [],
    obiettivi: {},
    areeChiuse: {},
    verbale: {
      campi: {},
      puntiAperti: (s.verbale?.puntiApertiPrecompilati ?? []).map((p) => ({ ...p })),
      areeNonAccessibili: [],
      firme: [],
      firmeInvalidate: [],
    },
    checkpoint: { esportati: [], confermati: [] },
    evidenzeEsportate: {},
    ripristini: [],
    preparazioneFatta: {},
    nSostanziali: 0,
    nSostanzialiEsportati: 0,
  };
}

export const STATO_INIZIALE_ESITO: Record<TipoElemento, string> = {
  verifica: 'aperto', domanda: 'aperta', foto: 'aperta', lettura: 'aperta', misura: 'aperta', documento: 'aperto',
  anomalia: 'aperta', tabella: 'aperta', protocollo: 'aperto', uscitaArea: 'aperta', informazione: 'letta',
};

/** Indice per codice degli elementi della struttura (cache per struttura). */
const cacheIndici = new WeakMap<Struttura, Map<string, Elemento>>();
export function indiceElementi(s: Struttura): Map<string, Elemento> {
  let m = cacheIndici.get(s);
  if (!m) { m = new Map(s.elementi.map((e) => [e.id, e])); cacheIndici.set(s, m); }
  return m;
}

function esitoDi(st: Stato, el: Elemento, il: string): Esito {
  const e = st.esiti[el.id];
  if (e) return e;
  const nuovo: Esito = { tipo: el.tipo, stato: STATO_INIZIALE_ESITO[el.tipo], aggiornatoIl: il };
  st.esiti[el.id] = nuovo;
  return nuovo;
}

/** Celle «da compilare» di una tabella per riga: colonne non in sola lettura e non chiave. */
export function colonneDaCompilare(t: ElTabella) {
  return t.colonne.filter((c) => !c.solaLettura && !c.chiave);
}
export function righeTabella(t: ElTabella, e?: Esito): string[] {
  const base = (t.righe ?? []).map((r) => r.id);
  const agg = (e?.righeAggiunte ?? []).filter((r) => !r.annullata).map((r) => r.id);
  return [...base, ...agg];
}

export function momentiAttesi(el: ElLettura | ElMisura): string[] {
  if (el.tipo === 'misura') return ['unica'];
  return el.momenti.filter((m) => m !== 'intermedia');
}

function valoriAttesi(el: ElLettura | ElMisura): { grandezza: string; momento: string; ripetizione: number }[] {
  const out: { grandezza: string; momento: string; ripetizione: number }[] = [];
  for (const m of momentiAttesi(el)) for (const g of el.grandezze) for (let r = 1; r <= (g.ripetizioni ?? 1); r++) out.push({ grandezza: g.id, momento: m, ripetizione: r });
  return out;
}

function chiaveValore(v: { grandezza?: string; momento?: string; ripetizione?: number }) {
  return `${v.grandezza ?? ''}|${v.momento ?? 'unica'}|${v.ripetizione ?? 1}`;
}

function ricalcola(st: Stato, el: Elemento, e: Esito) {
  switch (el.tipo) {
    case 'foto': {
      if (e.stato === 'nonDisponibile' && !(e.evidenze ?? []).length) return;
      const n = (e.evidenze ?? []).filter((id) => {
        const ev = st.evidenze[id];
        return ev && !ev.annullata && (ev.tipo === 'foto' || ev.tipo === 'annotazione' || ev.tipo === 'documento');
      }).length;
      e.stato = n >= (el.scattiMinimi ?? 2) ? 'fatta' : e.stato === 'nonDisponibile' ? 'nonDisponibile' : 'aperta';
      return;
    }
    case 'lettura':
    case 'misura': {
      if (e.stato === 'nonEseguibile') return;
      const presenti = new Set((e.valori ?? []).filter((v) => v.valore !== null && v.valore !== '').map(chiaveValore));
      const attesi = valoriAttesi(el);
      const fatti = attesi.filter((a) => presenti.has(chiaveValore(a))).length;
      e.stato = fatti === 0 ? 'aperta' : fatti === attesi.length ? 'completa' : 'parziale';
      return;
    }
    case 'tabella': {
      if (el.solaLettura) { e.stato = 'completa'; return; }
      const cols = colonneDaCompilare(el);
      let tot = 0, fatti = 0;
      for (const r of righeTabella(el, e)) for (const c of cols) { tot++; if (e.celle?.[r]?.[c.id]) fatti++; }
      e.stato = fatti === 0 ? 'aperta' : fatti >= tot ? 'completa' : 'parziale';
      return;
    }
    case 'protocollo': {
      const passi = el.passi.map((p) => e.passi?.[p.id]?.stato ?? 'daFare');
      const fatti = passi.filter((p) => p !== 'daFare').length;
      if (fatti === 0) e.stato = 'aperto';
      else if (fatti < passi.length) e.stato = 'inCorso';
      else e.stato = passi.every((p) => p === 'eseguito') ? 'completo' : 'parziale';
      return;
    }
    default:
      return;
  }
}

function aggiornaCollegamenti(st: Stato, s: Struttura, ev: Evidenza, prima: string[], il: string) {
  const idx = indiceElementi(s);
  const tocca = new Set([...prima, ...ev.elementi]);
  for (const c of tocca) {
    const el = idx.get(c);
    if (!el) continue;
    const e = esitoDi(st, el, il);
    const lista = new Set(e.evidenze ?? []);
    if (ev.elementi.includes(c) && !ev.annullata) lista.add(ev.id); else lista.delete(ev.id);
    e.evidenze = [...lista];
    e.aggiornatoIl = il;
    ricalcola(st, el, e);
  }
}

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Applica un evento allo stato (muta `st`). Restituisce i codici di esito toccati. */
export function applica(st: Stato, s: Struttura, ev: Evento): void {
  const d = ev.dati as D;
  const il = ev.il;
  const idx = indiceElementi(s);
  if (ev.tipo !== 'struttura.importata' && !ev.tipo.startsWith('checkpoint.') && ev.tipo !== 'ripristino.eseguito') st.nSostanziali = (st.nSostanziali ?? 0) + 1;
  switch (ev.tipo) {
    case 'struttura.importata':
      return;
    case 'sopralluogo.avviato':
      st.statoSopralluogo = 'inCorso';
      st.avviatoIl = st.avviatoIl ?? il;
      return;
    case 'sopralluogo.chiuso':
      st.statoSopralluogo = 'chiuso';
      st.chiusoIl = il;
      return;
    case 'sopralluogo.riaperto':
      st.statoSopralluogo = 'inCorso';
      delete st.chiusoIl;
      return;
    case 'preparazione.spuntata':
      st.preparazioneFatta[d.chiave] = !!d.fatto;
      return;
    case 'presenza.aggiornata': {
      const p = st.presenti[d.chiave] ?? { chiave: d.chiave, nome: '', presente: true, aggiuntaInCampo: true };
      st.presenti[d.chiave] = { ...p, ...d, chiave: d.chiave };
      return;
    }
    case 'consenso.registrato':
      st.consensi = { foto: d.foto, fotoLimiti: d.fotoLimiti || undefined, registrazioneAudio: d.registrazioneAudio, registratoIl: il };
      return;
    case 'evidenza.acquisita': {
      const e = { ...(d.evidenza as Evidenza) };
      st.evidenze[e.id] = e;
      st.progressivi[e.tipo] = Math.max(st.progressivi[e.tipo] ?? 0, e.progressivo);
      aggiornaCollegamenti(st, s, e, [], il);
      return;
    }
    case 'evidenza.aggiornata': {
      const e = st.evidenze[d.id];
      if (!e) return;
      const prima = [...e.elementi];
      if (Array.isArray(d.elementi)) e.elementi = d.elementi;
      if (d.didascalia !== undefined) e.didascalia = d.didascalia || undefined;
      if (d.riservata !== undefined) e.riservata = !!d.riservata;
      aggiornaCollegamenti(st, s, e, prima, il);
      return;
    }
    case 'evidenza.eliminata': {
      // eliminazione vera (solo evidenze mai salvate in una copia confermata): l'acquisizione resta nel registro
      const e = st.evidenze[d.id];
      if (!e) return;
      const prima = [...e.elementi];
      e.elementi = [];
      aggiornaCollegamenti(st, s, e, prima, il);
      for (const es of Object.values(st.esiti)) {
        if (es.evidenze?.includes(d.id)) es.evidenze = es.evidenze.filter((x) => x !== d.id);
        for (const r of Object.values(es.celle ?? {})) for (const c of Object.values(r)) if (c.evidenze?.includes(d.id)) c.evidenze = c.evidenze.filter((x) => x !== d.id);
      }
      delete st.evidenze[d.id];
      delete st.evidenzeEsportate[d.id];
      return;
    }
    case 'evidenza.annullata': {
      const e = st.evidenze[d.id];
      if (!e) return;
      e.annullata = { il, motivo: d.motivo };
      aggiornaCollegamenti(st, s, e, [...e.elementi], il);
      return;
    }
    case 'esito.aggiornato': {
      const el = idx.get(ev.codice ?? '');
      if (!el) return;
      const e = esitoDi(st, el, il);
      Object.assign(e, d.campi ?? {});
      e.tipo = el.tipo;
      e.aggiornatoIl = il;
      ricalcola(st, el, e);
      return;
    }
    case 'valore.registrato': {
      const el = idx.get(ev.codice ?? '');
      if (!el || (el.tipo !== 'lettura' && el.tipo !== 'misura')) return;
      const e = esitoDi(st, el, il);
      const valori = [...(e.valori ?? [])];
      for (const v of d.lista as DatoRilevato[]) {
        const k = chiaveValore(v);
        const i = valori.findIndex((x) => chiaveValore(x) === k);
        if (i >= 0) valori[i] = { ...v }; else valori.push({ ...v });
      }
      e.valori = valori;
      if (d.strumentoUsato !== undefined) e.strumentoUsato = d.strumentoUsato;
      if (e.stato === 'nonEseguibile') e.stato = 'aperta';
      e.aggiornatoIl = il;
      ricalcola(st, el, e);
      return;
    }
    case 'cella.aggiornata': {
      const el = idx.get(ev.codice ?? '');
      if (!el || el.tipo !== 'tabella') return;
      const e = esitoDi(st, el, il);
      e.celle = e.celle ?? {};
      e.celle[d.riga] = e.celle[d.riga] ?? {};
      if (d.cella === null) delete e.celle[d.riga][d.colonna];
      else e.celle[d.riga][d.colonna] = { ...(d.cella as Cella), il };
      e.aggiornatoIl = il;
      ricalcola(st, el, e);
      return;
    }
    case 'riga.aggiunta':
    case 'riga.annullata': {
      const el = idx.get(ev.codice ?? '');
      if (!el || el.tipo !== 'tabella') return;
      const e = esitoDi(st, el, il);
      const righe = [...(e.righeAggiunte ?? [])];
      if (ev.tipo === 'riga.aggiunta') righe.push({ id: d.riga, il });
      else { const r = righe.find((x) => x.id === d.riga); if (r) r.annullata = true; }
      e.righeAggiunte = righe;
      e.aggiornatoIl = il;
      ricalcola(st, el, e);
      return;
    }
    case 'passo.aggiornato': {
      const el = idx.get(ev.codice ?? '');
      if (!el || el.tipo !== 'protocollo') return;
      const e = esitoDi(st, el, il);
      e.passi = e.passi ?? {};
      const prec: PassoEsito = e.passi[d.passo] ?? { stato: 'daFare' };
      e.passi[d.passo] = { ...prec, ...(d.campi as Partial<PassoEsito>) };
      e.aggiornatoIl = il;
      ricalcola(st, el, e);
      return;
    }
    case 'ripristino.firmato': {
      const el = idx.get(ev.codice ?? '');
      if (!el || el.tipo !== 'protocollo') return;
      const e = esitoDi(st, el, il);
      e.ripristino = { il, firma: d.firma, nome: d.nome };
      e.aggiornatoIl = il;
      return;
    }
    case 'area.chiusa':
    case 'area.riaperta': {
      if (ev.tipo === 'area.chiusa') st.areeChiuse[d.area] = { il, conDeroga: !!d.conDeroga };
      else delete st.areeChiuse[d.area];
      for (const el of s.elementi) {
        if (el.tipo !== 'uscitaArea' || el.area !== d.area) continue;
        const e = esitoDi(st, el, il);
        e.stato = ev.tipo === 'area.riaperta' ? 'aperta' : d.conDeroga ? 'chiusaConDeroga' : 'chiusa';
        e.aggiornatoIl = il;
      }
      return;
    }
    case 'deroga.registrata':
      st.deroghe = st.deroghe.filter((x) => x.codice !== d.codice);
      st.deroghe.push({ codice: d.codice, motivo: d.motivo, il });
      return;
    case 'deroga.revocata':
      st.deroghe = st.deroghe.filter((x) => x.codice !== d.codice);
      return;
    case 'obiettivo.nota':
      st.obiettivi[ev.codice ?? ''] = { nota: d.nota || undefined };
      return;
    case 'verbale.aggiornato':
      if (d.campi) st.verbale.campi = { ...st.verbale.campi, ...d.campi };
      if (d.puntiAperti) st.verbale.puntiAperti = d.puntiAperti as PuntoAperto[];
      if (d.areeNonAccessibili) st.verbale.areeNonAccessibili = d.areeNonAccessibili;
      return;
    case 'verbale.firmato':
      st.verbale.firme = [...st.verbale.firme.filter((f) => f.id !== (d.firma as Firma).id), d.firma as Firma];
      return;
    case 'firme.invalidate':
      st.verbale.firmeInvalidate = [...st.verbale.firmeInvalidate, ...st.verbale.firme];
      st.verbale.firme = [];
      return;
    case 'checkpoint.esportato':
      st.checkpoint.esportati.push({ nomeFile: d.nomeFile, tipo: d.tipo, aSeq: d.aSeq, hashFinale: d.hashFinale, il });
      return;
    case 'checkpoint.confermato':
      st.checkpoint.confermati.push({ nomeFile: d.nomeFile, aSeq: d.aSeq, hashFinale: d.hashFinale, il });
      for (const id of d.evidenze as string[]) if (!st.evidenzeEsportate[id]) st.evidenzeEsportate[id] = d.nomeFile;
      st.nSostanzialiEsportati = typeof d.nSostanziali === 'number' ? d.nSostanziali : st.nSostanziali;
      return;
    case 'ripristino.eseguito':
      st.ripristini.push({ il, origine: d.origine, daIstanza: d.daIstanza });
      return;
    default:
      // eventi sconosciuti (versioni future) non alterano lo stato
      return;
  }
}

export function ricostruisci(s: Struttura, eventi: Evento[]): Stato {
  const st = statoIniziale(s);
  for (const e of eventi) applica(st, s, e);
  return st;
}
