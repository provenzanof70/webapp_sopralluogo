// Guscio del sopralluogo: barra, schede, viste Adesso / Giro / Cosa manca / INBOX / Altro.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import type { ElLettura, Presente } from '../dominio/tipi';
import { useSessione, vai, avvisa, prova, chiedi, conferma, Badge, Pr, useOra, InputSalva, parseNumero, messaggio } from './comuni';
import { statoElemento, statoLista, avanzamentoArea, contaModificheNonEsportate, apertiA } from '../dominio/completezza';
import { VistaArea, ChiudiArea } from './area';
import { Cattura, Miniature, acquisisciFile, scegliVoci } from './evidenze';
import { elementoAperto } from './editori';
import { Icona, titoloBreve, sequenzaArea, RigaVoce } from './voci';
import { FineSopralluogo } from './fine';
import { ElencoFigure, VistaFigura } from './figure';
import { VistaVerbale } from './verbale';
import { VistaEsporta } from './esporta';
import { impostazione } from '../archivio/db';
import { db } from '../archivio/db';
import { chiediEliminazione, chiediRipartenza } from './home';
import { VisorePdf } from './pdf';
import { isoLocale, soloOra, dataIt, numIt } from '../util/base';
import { indiceElementi } from '../dominio/stato';

export function Sopralluogo({ id, percorso }: { id: string; percorso: string[] }) {
  const ses = useSessione(id);
  const ora = useOra(30000);
  const [intervallo, setIntervallo] = useState(45);
  useEffect(() => { impostazione('promemoriaMinuti', 45).then(setIntervallo); }, []);
  if (!ses) return <div class="contenuto"><p class="tenue">Apertura del sopralluogo…</p></div>;
  const vista = percorso[0] ?? 'adesso';
  const nonEsp = contaModificheNonEsportate(ses.istanza.aSeq, ses.stato);
  const rif = ses.stato.checkpoint.confermati.at(-1)?.il ?? ses.stato.avviatoIl;
  const minuti = rif ? (ora.getTime() - Date.parse(rif)) / 60000 : 0;
  const allarme = nonEsp > 0 && ses.stato.statoSopralluogo === 'inCorso' && minuti > intervallo;
  const areaCorr = vista === 'a' || vista === 'chiudi' ? ses.struttura.aree.find((a) => a.id === percorso[1]) : undefined;
  const tab = TAB_DI[vista] ?? 'altro';
  const scheda = (v: string, ic: string, et: string, n?: number) => (
    <button class={tab === v ? 'att' : ''} onClick={() => vai('s', id, v)} aria-current={tab === v ? 'page' : undefined}>
      <span class="ic"><Icona n={ic} />{n ? <span class="conta">{n}</span> : null}</span>{et}</button>
  );
  const indietro = () => {
    if (vista === 'a' && percorso[2]) return vai('s', id, 'a', percorso[1]);
    if (vista === 'a' || vista === 'chiudi') return vai('s', id, vista === 'chiudi' ? 'a' : 'giro', ...(vista === 'chiudi' ? [percorso[1]] : []));
    if (vista === 'figura') return vai('s', id, 'figure');
    if (PRINCIPALI.includes(vista)) return vai('');
    return vai('s', id, 'altro');
  };
  let corpo;
  switch (vista) {
    case 'preparazione': corpo = <Preparazione ses={ses} />; break;
    case 'adesso': corpo = <Adesso ses={ses} />; break;
    case 'giro': corpo = <Giro ses={ses} />; break;
    case 'a': corpo = <VistaArea ses={ses} area={percorso[1]} codice={percorso[2]} />; break;
    case 'chiudi': corpo = <ChiudiArea ses={ses} area={percorso[1]} />; break;
    case 'manca': corpo = <CosaManca ses={ses} />; break;
    case 'inbox': corpo = <Inbox ses={ses} />; break;
    case 'altro': corpo = <Altro ses={ses} />; break;
    case 'presenti': corpo = <Presenti ses={ses} />; break;
    case 'documenti': corpo = <Documenti ses={ses} />; break;
    case 'contemporanee': corpo = <Contemporanee ses={ses} gruppo={percorso[1]} momentoIniziale={percorso[2]} />; break;
    case 'figure': corpo = <ElencoFigure ses={ses} />; break;
    case 'figura': corpo = <VistaFigura ses={ses} id={percorso[1]} />; break;
    case 'verbale': corpo = <VistaVerbale ses={ses} />; break;
    case 'fine': corpo = <FineSopralluogo ses={ses} />; break;
    case 'esporta': corpo = <VistaEsporta ses={ses} />; break;
    case 'integrita': corpo = <Integrita ses={ses} />; break;
    case 'pdf': corpo = <PdfCampo ses={ses} pagina={Number(percorso[1]) || 1} />; break;
    default: corpo = <Adesso ses={ses} />;
  }
  const p = ses.struttura.pratica;
  const titolo = areaCorr ? areaCorr.titolo : `${p.committente.ragioneSociale.replace(/\s+S\.?r\.?l\.?$|\s+S\.?p\.?A\.?$/i, '')} · ${p.sito.denominazione.replace(/^Stabilimento di\s+/i, '')}`;
  const nApe = apertiA(ses.struttura, ses.stato).length;
  return <div class="app">
    <div class="barra">
      <button class="ind" onClick={indietro} aria-label="Indietro"><Icona n="indietro" d={24} s={2.4} /></button>
      <div class="tit">
        <b>{titolo}</b>
        <small>{p.codice} · {giornoBreve(p.data)} · {soloOra(isoLocale(ora))}{ses.stato.statoSopralluogo === 'chiuso' ? ' · chiuso' : ''}</small>
      </div>
      <button class="ind" onClick={cerca(ses)} aria-label="Cerca un codice"><Icona n="cerca" /></button>
      {ses.stato.statoSopralluogo !== 'preparazione' && <button class={`stato-copia ${nonEsp ? (allarme ? 'allarme' : 'dasalvare') : 'ok'}`} onClick={() => vai('s', id, 'esporta')}>{nonEsp ? 'da salvare' : 'salvato'}</button>}
    </div>
    {allarme && <div class="avviso" style="margin:8px 12px 0">Ultima copia salvata {Math.round(minuti)} minuti fa. <a href={`#/s/${id}/esporta`}>Salva copia adesso</a></div>}
    <div class="contenuto">{corpo}</div>
    <nav class="schede">
      {scheda('adesso', 'adesso', 'Adesso')}
      {scheda('giro', 'aree', 'Aree')}
      {ses.stato.statoSopralluogo !== 'chiuso' ? <ScattoRapido ses={ses} area={areaCorr?.id} /> : <span class="scatto-vuoto" />}
      {scheda('manca', 'dafare', 'Da fare', nApe)}
      {scheda('altro', 'menu', 'Menu', contaInbox(ses))}
    </nav>
  </div>;
}

const PRINCIPALI = ['adesso', 'giro', 'manca', 'altro'];
const TAB_DI: Record<string, string> = { adesso: 'adesso', preparazione: 'adesso', contemporanee: 'adesso', fine: 'adesso', presenti: 'adesso', giro: 'giro', a: 'giro', chiudi: 'giro', manca: 'manca', inbox: 'altro', altro: 'altro' };
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
function giornoBreve(d: string) { const x = new Date(d + 'T12:00:00'); return Number.isNaN(x.getTime()) ? d : `${GIORNI[x.getDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`; }

function contaInbox(ses: Sessione) {
  return Object.values(ses.stato.evidenze).filter((e) => !e.elementi.length && !e.annullata && (e.tipo === 'foto' || e.tipo === 'audio' || e.tipo === 'documento' || e.tipo === 'nota')).length;
}

const cerca = (ses: Sessione) => async () => {
  const r = await chiedi('Vai al codice', [{ id: 'c', etichetta: 'Codice (es. Q18, F24, CNC)', obbligatorio: true }]);
  if (!r) return;
  const c = r.c.trim();
  const idx = indiceElementi(ses.struttura);
  const el = idx.get(c) ?? [...idx.values()].find((e) => e.id.toLowerCase() === c.toLowerCase())
    ?? ses.struttura.elementi.find((e) => (e.tipo === 'tabella' && e.righe?.some((x) => x.id.toLowerCase() === c.toLowerCase())) || (e.tipo === 'protocollo' && e.passi.some((p) => p.id.toLowerCase() === c.toLowerCase())));
  if (el) return vai('s', ses.istanza.id, 'a', el.area, el.id);
  const area = ses.struttura.aree.find((a) => a.id.toLowerCase() === c.toLowerCase());
  if (area) return vai('s', ses.istanza.id, 'a', area.id);
  const fig = ses.struttura.figure?.find((f) => f.id.toLowerCase() === c.toLowerCase());
  if (fig) return vai('s', ses.istanza.id, 'figura', fig.id);
  avvisa(`Codice ${c} non trovato`, true);
};

function ScattoRapido({ ses, area }: { ses: Sessione; area?: string }) {
  const inp = useRef<HTMLInputElement>(null);
  return <>
    <input ref={inp} type="file" accept="image/*" capture="environment" class="nascosto" onChange={async (e) => {
      const f = e.currentTarget.files?.[0];
      e.currentTarget.value = '';
      if (!f) return;
      const cod = elementoAperto();
      const el = cod ? ses.struttura.elementi.find((x) => x.id === cod) : undefined;
      const usa = el && el.tipo !== 'informazione' && el.tipo !== 'uscitaArea' ? [el.id] : [];
      const dove = area ?? el?.area ?? sessionStorage.getItem('areaCorrente') ?? undefined;
      const r = await acquisisciFile(ses, f, { tipo: el?.tipo === 'documento' ? 'documento' : 'foto', fonte: 'fotocamera', elementi: usa, area: dove });
      if (r) avvisa(usa.length ? `Foto salvata su «${titoloBreve(el!)}»` : `Foto salvata${dove ? ' (' + dove + ')' : ''}: la colleghi dopo da Menu › Foto da assegnare`);
    }} />
    <button class="scatto" aria-label="Scatta una foto" onClick={() => inp.current?.click()}><Icona n="camera" d={28} /></button>
  </>;
}

// ------------------------------------------------------------------ preparazione
function Preparazione({ ses }: { ses: Sessione }) {
  const s = ses.struttura, st = ses.stato;
  const [spazio, setSpazio] = useState<string>('');
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      const lib = ((e.quota ?? 0) - (e.usage ?? 0)) / 1048576;
      setSpazio(`Spazio disponibile per l'app: circa ${Math.round(lib)} MB (≈ ${Math.floor(lib / 5)} foto da 5 MB)`);
    }).catch(() => undefined);
  }, []);
  return <>
    <h1>Prima di partire</h1>
    <div class="card">
      <b>{s.pratica.titolo}</b>
      <p class="piccolo">{s.pratica.committente.ragioneSociale} — {[s.pratica.sito.denominazione, s.pratica.sito.indirizzo].filter(Boolean).join(', ')}<br />
        {dataIt(s.pratica.data)}{s.pratica.dalle ? ` dalle ${s.pratica.dalle}` : ''}{s.pratica.alle ? ` alle ${s.pratica.alle}` : ''} · {s.generazione.revisione}</p>
      {spazio && <p class="piccolo tenue">{spazio}</p>}
    </div>
    {(s.preparazione ?? []).length > 0 && <div class="card"><h3>Checklist</h3>{s.preparazione!.map((p, i) => {
      const k = p.id ?? `p${i}`;
      return <label class="riga" style="margin:8px 0"><input type="checkbox" style="width:24px;height:24px" checked={!!st.preparazioneFatta[k]} onChange={(e) => prova(() => ses.registra('preparazione.spuntata', null, { chiave: k, fatto: e.currentTarget.checked }))} /><span class="cresce">{p.testo}{p.chi ? <small class="tenue"> — {p.chi}</small> : null}</span><Pr p={p.priorita} /></label>;
    })}</div>}
    {(s.strumenti ?? []).length > 0 && <div class="card"><h3>Strumenti e loro limiti</h3><table class="t"><tbody>{s.strumenti!.map((x) => <tr><td><b>{x.nome}</b><br /><small>{x.uso}</small></td><td class="piccolo">{x.classeLimiti}</td></tr>)}</tbody></table></div>}
    {(s.regoleCampo ?? []).length > 0 && <div class="card"><h3>Regole di campo</h3><ul>{s.regoleCampo!.map((r) => <li>{r}</li>)}</ul></div>}
    {s.legenda && <div class="card"><h3>Legenda</h3>
      {Object.entries(s.legenda.priorita ?? {}).map(([k, v]) => <p class="piccolo"><Pr p={k as 'A'} /> {v}</p>)}
      {Object.entries(s.legenda.classi ?? {}).map(([k, v]) => <p class="piccolo"><b>{k}</b> {v}</p>)}
      {(s.legenda.formule ?? []).map((f) => <p class="piccolo"><code>{f}</code></p>)}
    </div>}
    <div class="card">
      <h3>Ora del dispositivo</h3>
      <p>Il telefono segna <b>{soloOra(isoLocale())}</b> del {dataIt(isoLocale().slice(0, 10))}. Verifica che sia giusta: tutte le letture prendono quest'ora.</p>
      <button class="btn pri larga" onClick={async () => {
        await prova(() => ses.registra('sopralluogo.avviato', null), 'Sopralluogo avviato');
        vai('s', ses.istanza.id, 'presenti');
      }}>Avvia il sopralluogo</button>
    </div>
  </>;
}

// ------------------------------------------------------------------ adesso
function Adesso({ ses }: { ses: Sessione }) {
  const ora = useOra(15000);
  const s = ses.struttura, st = ses.stato, id = ses.istanza.id;
  const hm = soloOra(isoLocale(ora));
  const oggi = isoLocale(ora).slice(0, 10) === s.pratica.data;
  const prog = s.programma ?? [];
  const fascia = oggi ? (prog.find((f) => f.dalle <= hm && (!f.alle || hm < f.alle)) ?? prog.filter((f) => f.dalle <= hm).at(-1)) : undefined;
  const prossima = oggi ? prog.find((f) => f.dalle > hm) : undefined;
  const aree = [...s.aree].sort((a, b) => a.ordine - b.ordine);
  // area corrente: quella della fascia oraria, altrimenti l'ultima aperta, altrimenti la prima non chiusa
  const daFascia = fascia?.aree?.map((x) => aree.find((a) => a.id === x)).find((a) => a && !st.areeChiuse[a.id]);
  const ultima = aree.find((a) => a.id === sessionStorage.getItem('areaCorrente') && !st.areeChiuse[a.id]);
  const area = daFascia ?? ultima ?? aree.find((a) => !st.areeChiuse[a.id]);
  const prossimaVoce = area ? sequenzaArea(ses, area.id).find((e) => statoElemento(s, st, e) !== 'completo') : undefined;
  const av = area ? avanzamentoArea(s, st, area.id) : undefined;
  const passi: { proto: string; area: string; id: string; prev: string; manovra: string; esegue?: string }[] = [];
  for (const el of s.elementi) if (el.tipo === 'protocollo' && !el.daLasciareAlCliente) for (const p of el.passi) {
    const pe = st.esiti[el.id]?.passi?.[p.id];
    if ((!pe || pe.stato === 'daFare') && p.orarioPrevisto) passi.push({ proto: el.id, area: el.area, id: p.id, prev: p.orarioPrevisto, manovra: p.manovra, esegue: p.esegue });
  }
  passi.sort((a, b) => a.prev.localeCompare(b.prev));
  const gruppi = [...new Set(s.elementi.filter((e): e is ElLettura => e.tipo === 'lettura' && !!e.gruppo).map((e) => e.gruppo!))];
  const [wake, setWake] = useState<WakeLockSentinel | null>(null);
  const minuti = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const adesso = ora.getHours() * 60 + ora.getMinutes();
  const presenti = Object.values(st.presenti).filter((p) => p.presente);
  const chiuse = aree.filter((a) => st.areeChiuse[a.id]).length;
  return <>
    {st.statoSopralluogo === 'preparazione' && <div class="card evidente">
      <div class="et-sez">Quando sei sul posto</div>
      <h2 style="margin:4px 0 6px">{s.pratica.committente.ragioneSociale}</h2>
      <p class="piccolo tenue" style="margin:0 0 10px">{dataIt(s.pratica.data)}{s.pratica.dalle ? ` · ${s.pratica.dalle}${s.pratica.alle ? '–' + s.pratica.alle : ''}` : ''}. Intanto puoi guardare le aree e le voci: niente si registra finché non avvii.</p>
      <div class="due"><a class="btn" href={`#/s/${id}/preparazione`}>Prima di partire</a><button class="btn pri" onClick={async () => {
        await prova(() => ses.registra('sopralluogo.avviato', null), 'Sopralluogo avviato');
        vai('s', id, 'presenti');
      }}>Avvia il sopralluogo</button></div>
    </div>}
    {area && <div class="card evidente">
      <div class="et-sez">{fascia ? `Adesso · ${fascia.dalle}${fascia.alle ? '–' + fascia.alle : ''}` : 'Area in corso'}</div>
      <h2 style="margin:4px 0 2px">{area.titolo}</h2>
      <p class="piccolo tenue" style="margin:0 0 10px">{[(area.accompagnatore ?? fascia?.chi) && `con ${area.accompagnatore ?? fascia?.chi}`, av && `${av.tutti.fatti} di ${av.tutti.tot} fatte`].filter(Boolean).join(' · ')}</p>
      {prossimaVoce ? <a class="btn pri larga grande" href={`#/s/${id}/a/${area.id}/${prossimaVoce.id}`}><span class="col"><small>Continua da</small><span class="ellissi">{titoloBreve(prossimaVoce)}</span></span><Icona n="avanti" /></a>
        : <a class="btn pri larga" href={`#/s/${id}/chiudi/${area.id}`}>Tutto fatto: chiudi l'area</a>}
      <a class="btn larga" style="margin-top:8px" href={`#/s/${id}/a/${area.id}`}>Vedi tutta l'area</a>
      {prossima && <p class="piccolo tenue" style="margin:10px 0 0">Poi alle {prossima.dalle}: {prossima.attivita}</p>}
    </div>}
    {passi.length > 0 && <div class="card">
      <div class="et-sez">Manovre a orario</div>
      {passi.slice(0, 3).map((p) => {
        const d = minuti(p.prev) - adesso;
        const col = !oggi ? '' : d <= 0 ? 'var(--errore)' : d <= 5 ? 'var(--avviso)' : '';
        return <div class="riga" style="margin:8px 0;flex-wrap:nowrap">
          <b style={`min-width:52px;font-size:18px;${col ? 'color:' + col : ''}`}>{p.prev}</b>
          <a class="cresce" style="color:inherit;text-decoration:none;min-width:0" href={`#/s/${id}/a/${p.area}/${p.proto}`}><span class="ellissi" style="display:block">{p.manovra}</span>
            <small class="tenue">{!oggi ? '' : d > 0 ? `tra ${d} min` : d === 0 ? 'adesso' : `${-d} min fa`}{p.esegue ? ` · esegue ${p.esegue}` : ''}</small></a>
          {st.statoSopralluogo === 'inCorso' && <button class="btn pic ok" onClick={() => prova(() => ses.registra('passo.aggiornato', p.proto, { passo: p.id, campi: { stato: 'eseguito', oraEffettiva: isoLocale(), eseguitoDa: p.esegue ?? presenti[0]?.nome ?? '' } }), `Fatto alle ${soloOra(isoLocale())}`)}>Fatto ora</button>}
        </div>;
      })}
      {'wakeLock' in navigator && <button class="btn pic" style="margin-top:4px" onClick={async () => {
        if (wake) { await wake.release(); setWake(null); return; }
        try { setWake(await navigator.wakeLock.request('screen')); avvisa('Lo schermo resta acceso finché sei qui'); } catch { avvisa('Impossibile tenere acceso lo schermo', true); }
      }}>{wake ? 'Schermo sempre acceso ✓' : 'Tieni lo schermo acceso'}</button>}
    </div>}
    {gruppi.map((g) => {
      const letture = s.elementi.filter((e): e is ElLettura => e.tipo === 'lettura' && e.gruppo === g);
      const momenti = [...new Set(letture.flatMap((l) => l.momenti))];
      return <a class="card riga" style="color:inherit;text-decoration:none;flex-wrap:nowrap" href={`#/s/${id}/contemporanee/${encodeURIComponent(g)}`}>
        <Icona n="lettura" d={26} colore="var(--primario)" />
        <span class="cresce"><b>Letture contatori</b>{gruppi.length > 1 ? ` «${g}»` : ''}<br /><small class="tenue">{momenti.map((m) => {
          const fatte = letture.filter((l) => !l.momenti.includes(m) || st.esiti[l.id]?.valori?.some((v) => v.momento === m));
          const t = letture.map((l) => st.esiti[l.id]?.valori?.find((v) => v.momento === m)?.il).filter(Boolean).sort()[0];
          return `${NOMI_MOMENTO[m] ?? m}: ${fatte.length === letture.length ? `fatte${t ? ' alle ' + soloOra(t) : ''} ✓` : 'da fare'}`;
        }).join(' · ')}</small></span><Icona n="avanti" />
      </a>;
    })}
    <a class="card riga" style="color:inherit;text-decoration:none;flex-wrap:nowrap" href={`#/s/${id}/giro`}>
      <Icona n="aree" d={26} colore="var(--primario)" /><span class="cresce"><b>Aree</b><br /><small class="tenue">{chiuse} di {aree.length} chiuse</small></span><Icona n="avanti" />
    </a>
    {st.statoSopralluogo === 'inCorso' && chiuse === aree.length && <a class="btn ok larga" href={`#/s/${id}/fine`}>Tutte le aree chiuse: fine sopralluogo</a>}
  </>;
}

const NOMI_MOMENTO: Record<string, string> = { arrivo: 'arrivo', partenza: 'partenza', intermedia: 'intermedia', unica: 'lettura' };

// ------------------------------------------------------------------ aree
function Giro({ ses }: { ses: Sessione }) {
  const aree = [...ses.struttura.aree].sort((a, b) => a.ordine - b.ordine);
  const corr = sessionStorage.getItem('areaCorrente');
  return <>
    <h1>Aree</h1>
    <div class="card" style="padding:0">
      {aree.map((a) => {
        const av = avanzamentoArea(ses.struttura, ses.stato, a.id);
        const chiusa = ses.stato.areeChiuse[a.id];
        const aA = av.A.tot - av.A.fatti;
        const st = chiusa ? 'chiusa' : av.tutti.fatti > 0 ? 'avviata' : 'nuova';
        return <a class={`voce-lista area-riga ${a.id === corr ? 'corrente' : ''}`} href={`#/s/${ses.istanza.id}/a/${a.id}`}>
          <span class={`pallino ${st}`} />
          <span class="cresce"><span style="display:block">{a.titolo}</span>
            <small class="tenue">{chiusa ? 'chiusa' : `${av.tutti.fatti} di ${av.tutti.tot} fatte`}{!chiusa && aA ? <span style="color:var(--pA);font-weight:600"> · {aA} importanti</span> : null}</small></span>
          {a.dalle && <span class="piccolo tenue">{a.dalle}</span>}
          <Icona n="avanti" d={18} />
        </a>;
      })}
    </div>
  </>;
}

// ------------------------------------------------------------------ da fare
function CosaManca({ ses }: { ses: Sessione }) {
  const s = ses.struttura, st = ses.stato, id = ses.istanza.id;
  const [solo, setSolo] = useState<'A' | 'tutte'>('A');
  const aperti = s.elementi.filter((e) => e.tipo !== 'informazione' && e.tipo !== 'uscitaArea' && statoElemento(s, st, e) !== 'completo' && statoElemento(s, st, e) !== 'derogato' && (solo === 'tutte' || e.priorita === 'A'));
  const aree = [...s.aree].sort((a, b) => a.ordine - b.ordine).map((a) => ({ a, voci: aperti.filter((e) => e.area === a.id).sort((x, y) => x.ordine - y.ordine) })).filter((x) => x.voci.length);
  const promessi = s.elementi.filter((e) => e.tipo === 'documento' && st.esiti[e.id]?.stato === 'promesso');
  const nInbox = contaInbox(ses);
  return <>
    <h1>Da fare</h1>
    {nInbox > 0 && <a class="avviso riga" style="text-decoration:none;color:inherit" href={`#/s/${id}/inbox`}><span class="cresce"><b>{nInbox} foto o note da assegnare</b> a una voce</span><Icona n="avanti" /></a>}
    <div class="filtri"><button class={solo === 'A' ? 'sel' : ''} onClick={() => setSolo('A')}>Importanti ({apertiA(s, st).length})</button><button class={solo === 'tutte' ? 'sel' : ''} onClick={() => setSolo('tutte')}>Tutte</button></div>
    {aree.map(({ a, voci }) => <div>
      <div class="gruppo-tit">{a.titolo}</div>
      <div class="gruppo-voci">{voci.map((e) => <RigaVoce ses={ses} el={e} onApri={() => vai('s', id, 'a', e.area, e.id)} />)}</div>
    </div>)}
    {!aperti.length && <p class="okbox">Nessuna voce {solo === 'A' ? 'importante ' : ''}da fare.</p>}
    {promessi.length > 0 && <div class="card"><h3>Documenti promessi</h3>{promessi.map((d) => { const e = st.esiti[d.id]; return <p class="piccolo" style="margin:6px 0">{titoloBreve(d)} — entro {e?.promessoEntro ? dataIt(e.promessoEntro) : '?'}{e?.chiLoInvia ? `, da ${e.chiLoInvia}` : ''}</p>; })}</div>}
    {(s.nonLasciare ?? []).length > 0 && <details class="card"><summary><b>Le cose da non lasciare</b> <small class="tenue">({s.nonLasciare!.filter((v) => statoLista(s, st, v.rif) === 'completo').length} di {s.nonLasciare!.length})</small></summary>
      {s.nonLasciare!.map((v) => <div class="riga" style="margin:8px 0;align-items:flex-start;flex-wrap:nowrap"><b style="min-width:20px">{v.n}</b><span class="cresce">{v.testo}</span><Badge s={statoLista(s, st, v.rif)} /></div>)}
    </details>}
    {(s.obiettivi ?? []).length > 0 && <details class="card"><summary><b>Obiettivi del sopralluogo</b></summary>
      {s.obiettivi!.map((o) => <div style="margin:10px 0">
        <div class="riga" style="flex-wrap:nowrap"><span class="cresce">{o.titolo}</span><Badge s={statoLista(s, st, o.rif)} /></div>
        {o.evidenza && <div class="piccolo tenue">Da portare a casa: {o.evidenza}</div>}
        <InputSalva placeholder="nota sull'obiettivo" valore={st.obiettivi[o.id]?.nota} onSalva={(v) => prova(() => ses.registra('obiettivo.nota', o.id, { nota: v }))} />
      </div>)}
    </details>}
    {st.deroghe.length > 0 && <details class="card"><summary><b>Non fattibili oggi</b> <small class="tenue">({st.deroghe.length})</small></summary>{st.deroghe.map((d) => {
      const el = s.elementi.find((e) => e.id === d.codice);
      return <p class="piccolo">{el ? <a href={`#/s/${id}/a/${el.area}/${el.id}`}>{titoloBreve(el)}</a> : d.codice}: {d.motivo}</p>;
    })}</details>}
  </>;
}

// ------------------------------------------------------------------ foto da assegnare
function Inbox({ ses }: { ses: Sessione }) {
  const lista = Object.values(ses.stato.evidenze).filter((e) => !e.elementi.length && !e.annullata && (e.tipo === 'foto' || e.tipo === 'audio' || e.tipo === 'documento' || e.tipo === 'nota'));
  const [sel, setSel] = useState<Set<string>>(new Set());
  return <>
    <h1>Foto da assegnare</h1>
    <p class="piccolo tenue">Foto e note fatte con il pulsante centrale senza una voce aperta. Seleziona e collega a una voce; toccando la miniatura la apri.</p>
    {lista.length > 0 && <>
      <div class="card" style="padding:0">
        {lista.map((e) => <label class="voce-lista"><input type="checkbox" style="width:22px;height:22px" checked={sel.has(e.id)} onChange={(x) => { const n = new Set(sel); if (x.currentTarget.checked) n.add(e.id); else n.delete(e.id); setSel(n); }} />
          <span class="cresce piccolo">{e.tipo === 'nota' ? 'Nota' : e.tipo === 'audio' ? 'Audio' : 'Foto'} delle {soloOra(e.acquisitaIl)}{e.area ? ` · ${ses.struttura.aree.find((a) => a.id === e.area)?.titolo ?? e.area}` : ''}{e.testo ? ` — ${e.testo.slice(0, 40)}` : ''}</span></label>)}
      </div>
      <Miniature ses={ses} ids={lista.map((e) => e.id)} />
      <button class="btn pri larga" style="margin-top:10px" disabled={!sel.size} onClick={async () => {
        const prima = ses.stato.evidenze[[...sel][0]];
        const cod = await scegliVoci(ses, prima?.area);
        if (!cod) return;
        for (const id of sel) await prova(() => ses.registra('evidenza.aggiornata', null, { id, elementi: cod }));
        setSel(new Set());
        avvisa('Collegate');
      }}>Collega le selezionate a una voce</button>
    </>}
    {!lista.length && <p class="okbox">Nessuna foto da assegnare.</p>}
    <Cattura ses={ses} elementi={[]} area={sessionStorage.getItem('areaCorrente') ?? undefined} tipi={['galleria', 'file', 'audio', 'nota']} />
  </>;
}

// ------------------------------------------------------------------ menu
function Altro({ ses }: { ses: Sessione }) {
  const id = ses.istanza.id;
  const [pdf, setPdf] = useState<string | null>(null);
  useEffect(() => { db().campo.get(id).then((c) => { if (c) setPdf(c.nome); }); }, [id]);
  const gruppi = [...new Set(ses.struttura.elementi.filter((e): e is ElLettura => e.tipo === 'lettura' && !!e.gruppo).map((e) => e.gruppo!))];
  const nInbox = contaInbox(ses);
  const voce = (h: string, t: string, d: string, n?: number) => <a class="voce-lista" href={`#/s/${id}/${h}`}><span class="cresce"><b>{t}</b>{n ? <span class="conta-in">{n}</span> : null}<br /><small class="tenue">{d}</small></span><Icona n="avanti" d={18} /></a>;
  return <>
    <h1>Menu</h1>
    <div class="card" style="padding:0">
      {voce('preparazione', 'Prima di partire', 'Checklist, strumenti, regole di campo')}
      {voce('presenti', 'Presenti e consensi', 'Chi c\'è, consenso a foto e audio')}
      {gruppi.map((g) => voce(`contemporanee/${encodeURIComponent(g)}`, gruppi.length > 1 ? `Letture contatori «${g}»` : 'Letture contatori', 'Tutte allo stesso minuto, arrivo e partenza'))}
      {voce('documenti', 'Documenti', 'Da ritirare o farsi promettere')}
      {voce('inbox', 'Foto da assegnare', 'Foto e note non ancora collegate a una voce', nInbox)}
      {(ses.struttura.figure ?? []).length > 0 && voce('figure', 'Planimetrie e schemi', 'Da consultare e annotare')}
      {pdf && voce('pdf', 'PDF di campo', 'Il documento stampabile del sopralluogo')}
    </div>
    <div class="card" style="padding:0">
      {voce('esporta', 'Salva copia', 'Copia di sicurezza su OneDrive, report in bozza')}
      {voce('fine', 'Fine sopralluogo', 'Letture finali, verbale, firme, copia finale')}
      {voce('verbale', 'Verbale', 'Testo, punti aperti, firme')}
      {voce('integrita', 'Controllo integrità', 'Registro e impronte dei file')}
    </div>
    {(ses.struttura.dopoSopralluogo ?? []).length > 0 && <details class="card"><summary><b>Dopo il sopralluogo</b></summary><ul>{ses.struttura.dopoSopralluogo!.map((d) => <li>{d.testo}{d.entro ? <small class="tenue"> — {d.entro}</small> : null}</li>)}</ul></details>}
    <details class="card"><summary><b>Ricomincia o elimina</b></summary>
      <p class="piccolo tenue">Ricominciare crea un sopralluogo vuoto dallo stesso ZIP di andata. Eliminare cancella questo sopralluogo dal dispositivo.</p>
      <div class="gruppo-btn">
        <button class="btn pic" onClick={async () => { const n = await chiediRipartenza(ses.istanza); if (n) vai('s', n); }}>Ricomincia da zero</button>
        <button class="btn pic per" onClick={async () => { if (await chiediEliminazione(ses.istanza)) vai(''); }}>Elimina questo sopralluogo</button>
      </div>
    </details>
  </>;
}

// ------------------------------------------------------------------ presenti e consensi
function Presenti({ ses }: { ses: Sessione }) {
  const st = ses.stato;
  const agg = (p: Presente, campi: Partial<Presente>) => prova(() => ses.registra('presenza.aggiornata', null, { ...p, ...campi }));
  return <>
    <h1>Presenti e consensi</h1>
    <div class="card"><h3>Consensi</h3>
      <p class="piccolo">Foto di impianti e targhe:</p>
      <div class="gruppo-btn">{(['si', 'conLimiti', 'no'] as const).map((v) => <button class={`btn pic ${st.consensi?.foto === v ? 'sel' : ''}`} onClick={async () => {
        let lim = '';
        if (v === 'conLimiti') { const r = await chiedi('Limiti al consenso', [{ id: 'l', etichetta: 'Aree o oggetti da non fotografare', tipo: 'area', obbligatorio: true }]); if (!r) return; lim = r.l; }
        await prova(() => ses.registra('consenso.registrato', null, { foto: v, fotoLimiti: lim, registrazioneAudio: st.consensi?.registrazioneAudio ?? 'no' }), 'Consenso registrato');
      }}>{v === 'si' ? 'Sì' : v === 'no' ? 'No' : 'Con limiti'}</button>)}</div>
      {st.consensi?.fotoLimiti && <p class="avviso piccolo">Limiti: {st.consensi.fotoLimiti}</p>}
      <p class="piccolo">Registrazione audio delle interviste:</p>
      <div class="gruppo-btn">{(['si', 'no'] as const).map((v) => <button class={`btn pic ${st.consensi?.registrazioneAudio === v ? 'sel' : ''}`} onClick={() => prova(() => ses.registra('consenso.registrato', null, { foto: st.consensi?.foto ?? 'si', fotoLimiti: st.consensi?.fotoLimiti ?? '', registrazioneAudio: v }), 'Consenso registrato')}>{v === 'si' ? 'Sì' : 'No'}</button>)}</div>
    </div>
    <div class="card"><h3>Persone</h3>
      {Object.values(st.presenti).map((p) => <div style="border-top:1px solid var(--bordo);padding:8px 0">
        <label class="riga"><input type="checkbox" style="width:24px;height:24px" checked={p.presente} onChange={(e) => agg(p, { presente: e.currentTarget.checked })} />
          <span class="cresce"><b>{p.nome}</b>{p.ruolo ? ` — ${p.ruolo}` : ''}{p.societa ? <small class="tenue"> · {p.societa}</small> : null}{p.aggiuntaInCampo ? <small class="tenue"> · aggiunto in campo</small> : null}</span></label>
        {p.presente && <div class="riga" style="margin-top:4px">
          <span class="piccolo">dalle</span><div style="width:110px"><InputSalva tipo="time" valore={p.dalle} onSalva={(v) => agg(p, { dalle: v })} /></div>
          <span class="piccolo">alle</span><div style="width:110px"><InputSalva tipo="time" valore={p.alle} onSalva={(v) => agg(p, { alle: v })} /></div>
          {p.telefono && <a class="btn pic" href={`tel:${p.telefono.replace(/\s/g, '')}`}>📞</a>}
        </div>}
      </div>)}
      <button class="btn" style="margin-top:8px" onClick={async () => {
        const r = await chiedi('Aggiungi presente', [{ id: 'n', etichetta: 'Nome e cognome', obbligatorio: true }, { id: 'r', etichetta: 'Ruolo' }, { id: 's', etichetta: 'Società' }, { id: 't', etichetta: 'Telefono' }]);
        if (r) await prova(() => ses.registra('presenza.aggiornata', null, { chiave: `X${Date.now()}`, nome: r.n, ruolo: r.r || undefined, societa: r.s || undefined, telefono: r.t || undefined, presente: true, aggiuntaInCampo: true, dalle: soloOra(isoLocale()) }), 'Aggiunto');
      }}>+ Aggiungi presente</button>
    </div>
  </>;
}

// ------------------------------------------------------------------ documenti
function Documenti({ ses }: { ses: Sessione }) {
  const docs = ses.struttura.elementi.filter((e) => e.tipo === 'documento');
  const apertura = docs.filter((d) => d.tipo === 'documento' && d.daPreparareInGiornata);
  const altri = docs.filter((d) => !(d.tipo === 'documento' && d.daPreparareInGiornata));
  const riga = (d: typeof docs[number]) => <RigaVoce ses={ses} el={d} onApri={() => vai('s', ses.istanza.id, 'a', d.area, d.id)} />;
  return <>
    <h1>Documenti</h1>
    {apertura.length > 0 && <><div class="gruppo-tit">Da chiedere in apertura</div><div class="gruppo-voci">{apertura.map(riga)}</div></>}
    {altri.length > 0 && <><div class="gruppo-tit">{apertura.length ? 'Gli altri' : 'Tutti'}</div><div class="gruppo-voci">{altri.map(riga)}</div></>}
  </>;
}

// ------------------------------------------------------------------ letture contatori (contemporanee)
function Contemporanee({ ses, gruppo, momentoIniziale }: { ses: Sessione; gruppo: string; momentoIniziale?: string }) {
  const letture = ses.struttura.elementi.filter((e): e is ElLettura => e.tipo === 'lettura' && e.gruppo === gruppo).sort((a, b) => a.ordine - b.ordine);
  const momenti = [...new Set(letture.flatMap((l) => l.momenti))];
  const mancaIn = (m: string) => letture.some((l) => l.momenti.includes(m as ElLettura['momenti'][number]) && !ses.stato.esiti[l.id]?.valori?.some((v) => v.momento === m));
  const [momento, setMomento] = useState(momenti.find((m) => m === momentoIniziale) ?? momenti.find(mancaIn) ?? momenti[0]);
  const [oraComune, setOraComune] = useState<string>(() => isoLocale());
  const [val, setVal] = useState<Record<string, string>>({});
  useOra(20000);
  const vecchia = Date.now() - Date.parse(oraComune) > 120000;
  const scritti = Object.values(val).filter((x) => x.trim()).length;
  const salva = async () => {
    const il = oraComune;
    let n = 0;
    for (const l of letture) {
      if (!l.momenti.includes(momento)) continue;
      const lista = l.grandezze.map((g) => ({ g, t: val[`${l.id}|${g.id}`] })).filter((x) => x.t !== undefined && x.t.trim() !== '')
        .map(({ g, t }) => ({ grandezza: g.id, momento, ripetizione: 1, valore: g.tipoValore === 'testo' ? t.trim() : parseNumero(t), ...(g.unita ? { unita: g.unita } : {}), il }));
      if (lista.length) { await prova(() => ses.registra('valore.registrato', l.id, { lista })); n += lista.length; }
    }
    if (n) { avvisa(`${n} valori salvati alle ${soloOra(il)}`); setVal({}); }
  };
  return <>
    <h1 style="margin-bottom:2px">Letture contatori</h1>
    <p class="piccolo tenue" style="margin-top:0">Tutte con la stessa ora{gruppo ? ` · «${gruppo}»` : ''}</p>
    {momenti.length > 1 && <div class="filtri">{momenti.map((m) => <button class={momento === m ? 'sel' : ''} onClick={() => setMomento(m)}>{NOMI_MOMENTO[m]?.replace(/^./, (c) => c.toUpperCase()) ?? m}{!mancaIn(m) ? ' ✓' : ''}</button>)}</div>}
    <div class={`ora-letture ${vecchia ? 'vecchia' : ''}`}>
      <Icona n="adesso" d={26} />
      <div class="cresce"><div class="piccolo">Ora delle letture</div><div class="ora-grande">{soloOra(oraComune)}</div></div>
      <button class="btn pic" onClick={() => setOraComune(isoLocale())}>Rimetti adesso</button>
    </div>
    {vecchia && <p class="avviso piccolo">Sono passati più di 2 minuti: se le letture non sono contemporanee premi «Rimetti adesso».</p>}
    {letture.filter((l) => l.momenti.includes(momento)).map((l) => {
      const e = ses.stato.esiti[l.id];
      const fatta = l.grandezze.every((g) => e?.valori?.some((v) => v.grandezza === g.id && v.momento === momento));
      return <div class="card" key={l.id}>
        <div class="riga" style="flex-wrap:nowrap">{fatta && <Icona n="ok" d={20} s={2.6} colore="var(--ok)" />}<b class="cresce">{titoloBreve(l)}</b>{l.priorita === 'A' && !fatta && <span class="rv-a">A</span>}</div>
        {l.dove && <p class="piccolo tenue" style="margin:2px 0 6px">{l.dove}</p>}
        {l.grandezze.map((g) => {
          const fatto = e?.valori?.find((v) => v.grandezza === g.id && v.momento === momento);
          return <label class="lettura-riga">
            <span class="cresce">{g.nome}{fatto ? <small class="ok-txt">{numIt(fatto.valore)}{g.unita ? ' ' + g.unita : ''} · alle {soloOra(fatto.il)}</small> : null}</span>
            <input inputMode={g.tipoValore === 'testo' ? undefined : 'decimal'} placeholder={fatto ? 'correggi' : '—'} value={val[`${l.id}|${g.id}`] ?? ''} onInput={(x) => setVal({ ...val, [`${l.id}|${g.id}`]: x.currentTarget.value })} />
            <span class="unita">{g.unita ?? ''}</span>
          </label>;
        })}
        {l.controlloCoerenza && momento === 'partenza' && <p class="piccolo atti">{l.controlloCoerenza}</p>}
        <div style="margin-top:8px"><Cattura ses={ses} elementi={[...(l.fotoCollegate ?? []).slice(0, 1), l.id]} area={l.area} tipi={['foto']} grande etichetta="Foto del display" /></div>
      </div>;
    })}
    <div class="piede-fisso"><button class="btn ok cresce grande" disabled={!scritti} onClick={salva}>{scritti ? `Salva ${scritti} valori delle ${soloOra(oraComune)}` : `Scrivi i valori (ora ${soloOra(oraComune)})`}</button></div>
  </>;
}

// ------------------------------------------------------------------ PDF di campo
function PdfCampo({ ses, pagina }: { ses: Sessione; pagina: number }) {
  const [c, setC] = useState<{ nome: string; blob: Blob } | null | undefined>(undefined);
  useEffect(() => { db().campo.get(ses.istanza.id).then((x) => setC(x ? { nome: x.nome, blob: x.blob } : null)); }, [ses.istanza.id]);
  if (c === undefined) return <p class="tenue">…</p>;
  if (!c) return <p class="avviso">Questo sopralluogo non ha il PDF di campo (il pacchetto di andata non lo conteneva).</p>;
  return <VisorePdf blob={c.blob} titolo={c.nome} paginaIniziale={pagina} onChiudi={() => history.back()} />;
}

// ------------------------------------------------------------------ integrità
function Integrita({ ses }: { ses: Sessione }) {
  const [esito, setEsito] = useState<string[] | null>(null);
  const [corso, setCorso] = useState(false);
  return <>
    <h1>Verifica di integrità</h1>
    <p>Ricontrolla sul dispositivo la catena del registro ({ses.istanza.aSeq} eventi) e l'impronta SHA-256 di ogni file acquisito.</p>
    <button class="btn pri" disabled={corso} onClick={async () => { setCorso(true); setEsito(await ses.verificaRegistro()); setCorso(false); }}>{corso ? 'Verifica in corso…' : 'Verifica ora'}</button>
    {esito && (esito.length ? <div class="errore"><b>Problemi rilevati:</b><ul>{esito.map((x) => <li>{x}</li>)}</ul>Esporta subito un checkpoint e segnala.</div>
      : <p class="okbox">Tutto integro: registro e {Object.values(ses.stato.evidenze).filter((e) => e.file).length} file verificati.</p>)}
    <p class="piccolo tenue">Impronta finale del registro: <code style="word-break:break-all">{ses.istanza.hashFinale}</code></p>
    <button class="btn pic" onClick={() => messaggio('Identificativi', `Sopralluogo locale: ${ses.istanza.id}\nStruttura: ${ses.struttura.idStruttura}\n${ses.struttura.generazione.revisione}\nOrigine: ${ses.istanza.origine ?? ''}`)}>Identificativi</button>
    {ses.stato.statoSopralluogo === 'chiuso' && <button class="btn pic" style="margin-left:8px" onClick={async () => {
      if (await conferma('Riaprire il sopralluogo?', 'Le firme del verbale restano registrate ma andranno ripetute se il verbale cambia.')) await prova(() => ses.registra('sopralluogo.riaperto', null, { motivo: 'riapertura manuale' }), 'Riaperto');
    }}>Riapri sopralluogo</button>}
  </>;
}
