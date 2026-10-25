// Vista di un'area: intestazione essenziale, filtro, righe compatte raggruppate per componente,
// pannello della voce (foglio dal basso sul telefono, affiancato sul tablet), chiusura area.
import { useEffect, useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import type { Elemento, ElUscitaArea } from '../dominio/tipi';
import { statoElemento, avanzamentoArea, apertiA, statoLista } from '../dominio/completezza';
import { Pannello, suggerisciCheckpoint } from './editori';
import { vai, prova, avvisa, Badge } from './comuni';
import { RigaVoce, gruppiArea, titoloBreve, Icona } from './voci';
import { soloOra } from '../util/base';
import { LinkScheda } from './scheda';

export function useLargo(min = 900) {
  const mq = typeof matchMedia === 'function' ? matchMedia(`(min-width: ${min}px)`) : null;
  const [l, setL] = useState(!!mq?.matches);
  useEffect(() => {
    if (!mq) return;
    const f = () => setL(mq.matches);
    mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  }, []);
  return l;
}

type Filtro = 'dafare' | 'A' | 'tutte';

export function VistaArea({ ses, area, codice }: { ses: Sessione; area: string; codice?: string }) {
  const a = ses.struttura.aree.find((x) => x.id === area);
  const largo = useLargo();
  const [filtro, setFiltro] = useState<Filtro>(() => (sessionStorage.getItem('filtroArea') as Filtro) || 'dafare');
  // le voci fatte durante questa visita restano visibili (spuntate) anche con il filtro «Da fare»
  const [visti] = useState(() => new Set<string>());
  useEffect(() => { sessionStorage.setItem('areaCorrente', area); }, [area]);
  useEffect(() => { try { sessionStorage.setItem('filtroArea', filtro); } catch { /* */ } }, [filtro]);
  useEffect(() => { if (codice) setTimeout(() => document.getElementById(`el-${codice}`)?.scrollIntoView({ block: 'nearest' }), 60); }, [codice]);
  if (!a) return <p>Area non trovata.</p>;
  const id = ses.istanza.id;
  const av = avanzamentoArea(ses.struttura, ses.stato, area);
  const tutte = ses.struttura.elementi.filter((e) => e.area === area).sort((x, y) => x.ordine - y.ordine);
  const info = tutte.filter((e) => e.tipo === 'informazione');
  const voci = tutte.filter((e) => e.tipo !== 'informazione' && e.tipo !== 'uscitaArea');
  const aperta = (e: Elemento) => statoElemento(ses.struttura, ses.stato, e) !== 'completo';
  for (const e of voci) if (aperta(e)) visti.add(e.id);
  const mostra = (e: Elemento) => filtro === 'tutte' || (filtro === 'A' ? e.priorita === 'A' : (aperta(e) || visti.has(e.id) || e.id === codice));
  const gruppi = gruppiArea(voci).map((g) => ({ ...g, voci: g.voci.filter(mostra) })).filter((g) => g.voci.length);
  const chiusa = ses.stato.areeChiuse[area];
  const aree = [...ses.struttura.aree].sort((x, y) => x.ordine - y.ordine);
  const i = aree.findIndex((x) => x.id === area);
  const sel = codice ? ses.struttura.elementi.find((e) => e.id === codice) : undefined;
  const apri = (e: Elemento) => vai('s', id, 'a', area, e.id);
  const chiudiPannello = () => vai('s', id, 'a', area);
  const nAperteA = voci.filter((e) => e.priorita === 'A' && aperta(e)).length;

  const lista = <div class="area-lista">
    <div class="area-testa">
      <h1 class="area-tit">{a.titolo}</h1>
      <div class="piccolo tenue">{[a.accompagnatore && `con ${a.accompagnatore}`, (a.dalle || a.alle) && `${a.dalle ?? ''}${a.alle ? '–' + a.alle : ''}`, `${av.tutti.fatti} di ${av.tutti.tot} fatte`].filter(Boolean).join(' · ')}</div>
      {chiusa && <p class="okbox piccolo">Area chiusa alle {soloOra(chiusa.il)}{chiusa.conDeroga ? ', con voci non fattibili oggi' : ''}. <button class="btn pic" onClick={() => prova(() => ses.registra('area.riaperta', null, { area }), 'Area riaperta')}>Riapri</button></p>}
      {(a.figure?.length || a.capitoloPdf || ses.struttura.generazione.pdfCampo) && <div class="gruppo-btn" style="margin-top:6px">
        {(a.figure ?? []).map((f) => <a class="btn pic" href={`#/s/${id}/figura/${f}`}>Planimetria {f}</a>)}
        {a.capitoloPdf && <a class="btn pic" href={`#/s/${id}/pdf`}>PDF cap. {a.capitoloPdf}</a>}
        {voci[0] && <LinkScheda ses={ses} codice={voci[0].id} etichetta="Compila sul PDF" />}
      </div>}
    </div>
    {(a.scopo || info.length > 0) && <details class="info-area"><summary>Da sapere su quest'area</summary>
      {a.scopo && <p class="piccolo">{a.scopo}</p>}
      {info.map((x) => x.tipo === 'informazione' && <p class="piccolo" style="white-space:pre-wrap">{x.testo}{x.figura ? <> <a href={`#/s/${id}/figura/${x.figura}`}>planimetria {x.figura}</a></> : null}</p>)}
    </details>}
    <div class="filtri" role="tablist">
      {([['dafare', 'Da fare'], ['A', 'Solo importanti'], ['tutte', 'Tutte']] as [Filtro, string][]).map(([k, t]) =>
        <button role="tab" aria-selected={filtro === k} class={filtro === k ? 'sel' : ''} onClick={() => setFiltro(k)}>{t}</button>)}
    </div>
    {gruppi.map((g) => <div key={g.titolo}>
      {(gruppi.length > 1 || g.titolo !== 'Tutta l\'area') && <div class="gruppo-tit">{g.titolo}</div>}
      <div class="gruppo-voci">{g.voci.map((e) => <RigaVoce key={e.id} ses={ses} el={e} attiva={e.id === codice} onApri={() => apri(e)} />)}</div>
    </div>)}
    {!gruppi.length && <p class="okbox">{filtro === 'dafare' ? 'Niente da fare in quest\'area.' : 'Nessuna voce.'}</p>}
    {!chiusa && <button class={`btn larga ${nAperteA ? '' : 'pri'}`} style="margin-top:14px" onClick={() => vai('s', id, 'chiudi', area)}>Chiudi l'area{nAperteA ? ` (restano ${nAperteA} importanti)` : ''}</button>}
    <div class="riga" style="margin-top:12px">
      {i > 0 && <button class="btn pic" onClick={() => vai('s', id, 'a', aree[i - 1].id)}><Icona n="indietro" d={16} /> {aree[i - 1].titolo}</button>}
      <span class="cresce" />
      {i < aree.length - 1 && <button class="btn pic" onClick={() => vai('s', id, 'a', aree[i + 1].id)}>{aree[i + 1].titolo} <Icona n="avanti" d={16} /></button>}
    </div>
  </div>;

  if (largo) return <div class="area-due">
    {lista}
    <div class="area-dettaglio">{sel ? <Pannello key={sel.id} ses={ses} el={sel} inline onChiudi={chiudiPannello} />
      : <div class="vuoto-dett"><p class="tenue">Tocca una voce a sinistra per vederla qui.</p></div>}</div>
  </div>;
  return <>
    {lista}
    {sel && <div class="foglio-sfondo" onClick={(e) => { if (e.target === e.currentTarget) chiudiPannello(); }}>
      <Pannello key={sel.id} ses={ses} el={sel} onChiudi={chiudiPannello} />
    </div>}
  </>;
}

// ------------------------------------------------------------------ chiusura dell'area
const MOTIVI = ['Referente assente', 'Documento non pronto', 'Si chiede per mail', 'Impianto fermo', 'Area non accessibile'];

export function ChiudiArea({ ses, area }: { ses: Sessione; area: string }) {
  const a = ses.struttura.aree.find((x) => x.id === area);
  const aperte = apertiA(ses.struttura, ses.stato, area);
  const [via, setVia] = useState<Set<string>>(() => new Set(aperte.map((e) => e.id)));
  const [motivo, setMotivo] = useState('');
  const uscita = ses.struttura.elementi.find((e): e is ElUscitaArea => e.area === area && e.tipo === 'uscitaArea');
  if (!a) return <p>Area non trovata.</p>;
  const id = ses.istanza.id;
  const restano = aperte.filter((e) => !via.has(e.id));
  const chiudi = async () => {
    if (via.size && !motivo.trim()) return avvisa('Scrivi il motivo (uno per tutte)', true);
    for (const e of aperte) if (via.has(e.id)) await prova(() => ses.registra('deroga.registrata', null, { codice: e.id, motivo: motivo.trim() }));
    if (restano.length) {
      avvisa(`Restano da fare ${restano.length} voci`);
      return vai('s', id, 'a', area, restano[0].id);
    }
    await prova(() => ses.registra('area.chiusa', null, { area, conDeroga: via.size > 0 }), 'Area chiusa');
    const aree = [...ses.struttura.aree].sort((x, y) => x.ordine - y.ordine);
    const succ = aree[aree.findIndex((x) => x.id === area) + 1];
    await suggerisciCheckpoint(ses);
    if (location.hash.includes('/chiudi/')) vai('s', id, succ ? 'a' : 'adesso', ...(succ ? [succ.id] : []));
  };
  return <>
    <h1 style="margin-bottom:4px">Chiudi l'area</h1>
    <p class="tenue piccolo" style="margin-top:0">{a.titolo}</p>
    {uscita && <div class="card"><h3>Prima di uscire</h3>
      {uscita.voci.map((v) => <div class="riga" style="margin:6px 0"><span class="cresce">{v.testo}</span>{v.rif?.length ? <Badge s={statoLista(ses.struttura, ses.stato, v.rif)} /> : null}</div>)}
    </div>}
    {!aperte.length ? <p class="okbox">Tutte le voci importanti sono fatte.</p> : <>
      <p>Restano <b>{aperte.length} voci importanti</b>. Togli la spunta a quelle che vuoi ancora fare; le altre si chiudono come <b>non fattibili oggi</b>, con il motivo qui sotto.</p>
      <div class="card" style="padding:0">{aperte.map((e) => <label class="voce-lista">
        <input type="checkbox" style="width:22px;height:22px" checked={via.has(e.id)} onChange={(x) => { const n = new Set(via); if (x.currentTarget.checked) n.add(e.id); else n.delete(e.id); setVia(n); }} />
        <span class="cresce">{titoloBreve(e)}</span>
        {!via.has(e.id) && <span class="piccolo" style="color:var(--primario);font-weight:600">la faccio</span>}
      </label>)}</div>
      {via.size > 0 && <>
        <label class="campo"><span><b>Motivo</b> (uno per tutte)</span><textarea value={motivo} onInput={(e) => setMotivo(e.currentTarget.value)} placeholder="Es. referente in riunione: si chiede per iscritto entro il …" /></label>
        <div class="gruppo-btn">{MOTIVI.map((m) => <button class="chip" onClick={() => setMotivo(motivo ? `${motivo}; ${m}` : m)}>{m}</button>)}</div>
      </>}
    </>}
    <div class="piede-fisso">
      <button class="btn" onClick={() => vai('s', id, 'a', area)}>Torno all'area</button>
      <button class="btn pri cresce" onClick={chiudi}>{restano.length ? `Segna e torna alle ${restano.length} da fare` : 'Chiudi l\'area'}</button>
    </div>
  </>;
}
