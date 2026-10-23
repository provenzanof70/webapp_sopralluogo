// Contenuti testuali condivisi da verbale, report e interfaccia.
import type { Struttura, Stato, ElLettura, ElDocumento, ElDomanda, Esito } from '../dominio/tipi';
import { dataIt, soloOra, numIt } from '../util/base';

export const ETICHETTE_STATO_DOC: Record<string, string> = {
  aperto: 'da chiedere', ritiratoOriginale: 'ritirato in originale', ritiratoCopia: 'ritirato in copia',
  fotografato: 'fotografato in sede', promesso: 'promesso', nonDisponibile: 'non disponibile',
};

export function presentiTesto(st: Stato): string[] {
  return Object.values(st.presenti).filter((p) => p.presente).map((p) =>
    [p.nome, [p.ruolo, p.societa].filter(Boolean).join(', '), p.dalle || p.alle ? `dalle ${p.dalle ?? '…'} alle ${p.alle ?? '…'}` : '']
      .filter(Boolean).join(' — '));
}

export function areeVisitate(s: Struttura, st: Stato): string[] {
  const toccate = new Set<string>();
  for (const [c, e] of Object.entries(st.esiti)) {
    const el = s.elementi.find((x) => x.id === c);
    if (el && el.tipo !== 'informazione' && (e.stato !== 'aperto' && e.stato !== 'aperta' || (e.evidenze ?? []).length)) toccate.add(el.area);
  }
  for (const e of Object.values(st.evidenze)) if (e.area && !e.annullata) toccate.add(e.area);
  for (const a of Object.keys(st.areeChiuse)) toccate.add(a);
  const nonAcc = new Set(st.verbale.areeNonAccessibili.map((a) => a.area));
  return s.aree.filter((a) => toccate.has(a.id) && !nonAcc.has(a.id)).map((a) => `${a.titolo} (${a.id})`);
}

export function valoreFormattato(v: unknown, unita?: string) {
  return v === null || v === undefined || v === '' ? '—' : `${numIt(v)}${unita ? ' ' + unita : ''}`;
}

export function lettureRiferimento(s: Struttura, st: Stato): string[] {
  const out: string[] = [];
  for (const el of s.elementi) {
    if (el.tipo !== 'lettura') continue;
    const l = el as ElLettura;
    if (!l.momenti.includes('arrivo') && !l.momenti.includes('partenza')) continue;
    const e = st.esiti[l.id];
    const parti: string[] = [];
    for (const g of l.grandezze) {
      const val = (m: string) => e?.valori?.find((v) => v.grandezza === g.id && v.momento === m);
      const a = val('arrivo'), p = val('partenza');
      if (!a && !p) continue;
      parti.push(`${g.nome}: arrivo ${valoreFormattato(a?.valore, g.unita)}${a ? ` (${soloOra(a.il)})` : ''} · partenza ${valoreFormattato(p?.valore, g.unita)}${p ? ` (${soloOra(p.il)})` : ''}`);
    }
    if (parti.length) out.push(`${l.id} ${l.strumento} — ${parti.join('; ')}`);
  }
  return out;
}

export function documentiStato(s: Struttura, st: Stato): string[] {
  const out: string[] = [];
  for (const el of s.elementi) {
    if (el.tipo !== 'documento') continue;
    const d = el as ElDocumento;
    const e = st.esiti[d.id];
    if (!e || e.stato === 'aperto') continue;
    let t = `${d.id} ${d.documento} — ${ETICHETTE_STATO_DOC[e.stato] ?? e.stato}`;
    if (e.stato === 'promesso') t += ` entro ${dataIt(e.promessoEntro) || '…'}${e.chiLoInvia ? `, lo invia ${e.chiLoInvia}` : ''}`;
    if (e.note) t += ` (${e.note})`;
    out.push(t);
  }
  return out;
}

export function dichiarazioniDaConfermare(s: Struttura, st: Stato): string[] {
  const out: string[] = [];
  for (const el of s.elementi) {
    if (el.tipo !== 'domanda' || el.riservato) continue;
    const e = st.esiti[el.id];
    if (!e || e.stato !== 'risposta' || e.provenienza !== 'D' || e.daConfermarePerIscritto === false) continue;
    out.push(`${el.id} ${(el as ElDomanda).testo} → «${e.risposta ?? ''}»${e.rispostaDa ? ` (${e.rispostaDa})` : ''}`);
  }
  return out;
}

export interface SezioneVerbale { titolo: string; righe: string[] }

/** Contenuto del verbale: è ciò che si firma (l'impronta si calcola su testoPerFirma). */
export function contenutoVerbale(s: Struttura, st: Stato): { titolo: string; intro: string; sezioni: SezioneVerbale[]; note: string[] } {
  const v = s.verbale;
  const dalle = soloOra(st.avviatoIl) || s.pratica.dalle || '…';
  const alle = soloOra(st.chiusoIl) || st.verbale.campi.__alle || '…';
  const sost = (t: string) => t
    .replace(/\{data\}/g, dataIt(s.pratica.data)).replace(/\{dalle\}/g, dalle).replace(/\{alle\}/g, alle)
    .replace(/\{sito\}/g, [s.pratica.sito.denominazione, s.pratica.sito.indirizzo].filter(Boolean).join(', '))
    .replace(/\{committente\}/g, s.pratica.committente.ragioneSociale);
  const intro = sost(v?.testoIntroduttivo ?? 'Il giorno {data}, dalle ore {dalle} alle ore {alle}, presso {sito} di {committente}, si è svolto il sopralluogo. Il verbale non contiene valutazioni conclusive.');
  const sezioni: SezioneVerbale[] = [];
  const campi = v?.campi ?? [
    { id: 'presenti', etichetta: 'Presenti', tipoValore: 'elencoPresenti' },
    { id: 'aree', etichetta: 'Aree visitate', tipoValore: 'elencoAree' },
    { id: 'documenti', etichetta: 'Documenti', tipoValore: 'documentiStato' },
    { id: 'dichiarazioni', etichetta: 'Dichiarazioni da confermare per iscritto', tipoValore: 'dichiarazioniDaConfermare' },
  ];
  for (const c of campi) {
    const manuale = st.verbale.campi[c.id];
    let righe: string[];
    if (manuale !== undefined && manuale !== '') righe = manuale.split('\n');
    else switch (c.tipoValore) {
      case 'elencoPresenti': righe = presentiTesto(st); break;
      case 'elencoAree': righe = areeVisitate(s, st); break;
      case 'lettureRiferimento': righe = lettureRiferimento(s, st); break;
      case 'documentiStato': righe = documentiStato(s, st); break;
      case 'dichiarazioniDaConfermare': righe = dichiarazioniDaConfermare(s, st); break;
      default: righe = c.valoreIniziale ? [c.valoreIniziale] : [];
    }
    sezioni.push({ titolo: c.etichetta, righe: righe.length ? righe : ['—'] });
  }
  if (st.verbale.areeNonAccessibili.length) sezioni.push({ titolo: 'Aree non accessibili o non verificate', righe: st.verbale.areeNonAccessibili.map((a) => `${a.area}: ${a.motivo}`) });
  sezioni.push({
    titolo: 'Punti aperti e impegni',
    righe: st.verbale.puntiAperti.length ? st.verbale.puntiAperti.map((p, i) => `${i + 1}. ${p.testo}${p.responsabile ? ` — ${p.responsabile}` : ''}${p.entro ? ` — entro ${p.entro}` : ''}`) : ['—'],
  });
  return { titolo: v?.titolo ?? 'Verbale di sopralluogo', intro, sezioni, note: v?.noteFisse ?? [] };
}

export function testoPerFirma(c: ReturnType<typeof contenutoVerbale>): string {
  return [c.titolo, c.intro, ...c.sezioni.flatMap((x) => [x.titolo, ...x.righe]), ...c.note].join('\n');
}

export function descriviEsito(e: Esito | undefined): string {
  if (!e) return 'aperto';
  return e.stato;
}
