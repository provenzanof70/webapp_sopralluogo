// Vista di un'area: intestazione, filtri, elementi raggruppati per tipo.
import { useEffect, useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import type { Elemento, TipoElemento } from '../dominio/tipi';
import { statoElemento, avanzamentoArea } from '../dominio/completezza';
import { SchedaElemento, chiudiArea } from './editori';
import { Cattura } from './evidenze';
import { vai } from './comuni';

const GRUPPI: { titolo: string; tipi: TipoElemento[] }[] = [
  { titolo: 'Informazioni', tipi: ['informazione'] },
  { titolo: 'Verifiche', tipi: ['verifica'] },
  { titolo: 'Domande', tipi: ['domanda'] },
  { titolo: 'Documenti', tipi: ['documento'] },
  { titolo: 'Tabelle di rilievo', tipi: ['tabella'] },
  { titolo: 'Letture e misure', tipi: ['lettura', 'misura'] },
  { titolo: 'Protocolli', tipi: ['protocollo'] },
  { titolo: 'Foto', tipi: ['foto'] },
  { titolo: 'Anomalie da verificare', tipi: ['anomalia'] },
  { titolo: 'Prima di lasciare l\'area', tipi: ['uscitaArea'] },
];

let ultimoAperto: string | null = null;
export function elementoAperto() { return ultimoAperto; }

export function VistaArea({ ses, area, codice }: { ses: Sessione; area: string; codice?: string }) {
  const a = ses.struttura.aree.find((x) => x.id === area);
  const [soloA, setSoloA] = useState(false);
  const [soloAperte, setSoloAperte] = useState(false);
  const [aperto, setAperto] = useState<string | null>(codice ?? null);
  useEffect(() => { if (codice) { setAperto(codice); setTimeout(() => document.getElementById(`el-${codice}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80); } }, [codice]);
  useEffect(() => { ultimoAperto = aperto; return () => { ultimoAperto = null; }; }, [aperto]);
  useEffect(() => { sessionStorage.setItem('areaCorrente', area); }, [area]);
  if (!a) return <p>Area non trovata.</p>;
  const av = avanzamentoArea(ses.struttura, ses.stato, area);
  const els = ses.struttura.elementi.filter((e) => e.area === area).sort((x, y) => x.ordine - y.ordine);
  const filtra = (e: Elemento) => (!soloA || e.priorita === 'A' || e.tipo === 'uscitaArea') && (!soloAperte || statoElemento(ses.struttura, ses.stato, e) !== 'completo');
  const chiusa = ses.stato.areeChiuse[area];
  const aree = [...ses.struttura.aree].sort((x, y) => x.ordine - y.ordine);
  const i = aree.findIndex((x) => x.id === area);
  return <>
    <div class="card">
      <div class="riga"><code><b>{a.id}</b></code>{a.capitoloPdf && <span class="tenue piccolo">cap. {a.capitoloPdf}</span>}<span class="cresce" />{(a.dalle || a.alle) && <span class="piccolo">{a.dalle}{a.alle ? `–${a.alle}` : ''}</span>}</div>
      <h2 style="margin:4px 0">{a.titolo}</h2>
      {a.accompagnatore && <p class="piccolo" style="margin:2px 0">Con: <b>{a.accompagnatore}</b></p>}
      {a.scopo && <p class="piccolo tenue" style="margin:2px 0">{a.scopo}</p>}
      <div class="riga piccolo" style="margin-top:6px">
        <span>A {av.A.fatti}/{av.A.tot}</span><span>B {av.B.fatti}/{av.B.tot}</span><span>C {av.C.fatti}/{av.C.tot}</span>
        <div class="cresce barra-prog"><div style={`width:${av.tutti.tot ? (100 * av.tutti.fatti) / av.tutti.tot : 0}%`} /></div>
      </div>
      {chiusa && <p class="okbox piccolo">Area chiusa{chiusa.conDeroga ? ' con deroga' : ''}.</p>}
      {(a.figure ?? []).length > 0 && <div class="gruppo-btn" style="margin-top:6px">{a.figure!.map((f) => <a class="btn pic" href={`#/s/${ses.istanza.id}/figura/${f}`}>🗺 {f}</a>)}</div>}
      <p class="piccolo tenue" style="margin:8px 0 0">Prima foto dell'area: inquadra il cartellino «{a.id}».</p>
      <Cattura ses={ses} elementi={[]} area={area} tipi={['foto', 'nota']} />
    </div>
    <div class="riga" style="margin:4px 2px">
      <button class={`btn pic ${soloA ? 'sel' : ''}`} onClick={() => setSoloA(!soloA)}>Solo A</button>
      <button class={`btn pic ${soloAperte ? 'sel' : ''}`} onClick={() => setSoloAperte(!soloAperte)}>Solo aperte</button>
    </div>
    {GRUPPI.map((g) => {
      const lista = els.filter((e) => g.tipi.includes(e.tipo) && filtra(e));
      if (!lista.length) return null;
      return <div key={g.titolo}>
        <div class="sezione-tit">{g.titolo}</div>
        {lista.map((e) => <SchedaElemento key={e.id} ses={ses} el={e} aperta={aperto === e.id} onApri={(v) => setAperto(v ? e.id : null)} />)}
      </div>;
    })}
    {!els.some((e) => e.tipo === 'uscitaArea') && !chiusa && <button class="btn pri larga" style="margin-top:12px" onClick={() => chiudiArea(ses, area)}>Chiudi l'area</button>}
    <div class="riga" style="margin-top:16px">
      {i > 0 && <button class="btn" onClick={() => vai('s', ses.istanza.id, 'a', aree[i - 1].id)}>← {aree[i - 1].id}</button>}
      <span class="cresce" />
      {i < aree.length - 1 && <button class="btn" onClick={() => vai('s', ses.istanza.id, 'a', aree[i + 1].id)}>{aree[i + 1].id} →</button>}
    </div>
  </>;
}
