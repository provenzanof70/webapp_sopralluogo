// Scheda di un elemento della struttura: intestazione + editor specifico per tipo.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import type {
  Elemento, ElVerifica, ElDomanda, ElFoto, ElLettura, ElMisura, ElDocumento, ElAnomalia, ElProtocollo, ElUscitaArea, Esito, DatoAtti, Momento,
} from '../dominio/tipi';
import { statoElemento, statoLista, statoCodice, contaModificheNonEsportate } from '../dominio/completezza';
import { momentiAttesi } from '../dominio/stato';
import { Badge, InputSalva, prova, chiedi, motivo, conferma, parseNumero, vai } from './comuni';
import { Cattura, Miniature } from './evidenze';
import { EditorTabella } from './tabella';
import { dataIt, dataOra, isoLocale, soloOra, numIt } from '../util/base';
import { valoreFormattato, ETICHETTE_STATO_DOC } from '../report/contenuti';
import { Firma } from './firma';
import { NOMI_TIPO, titoloBreve, descrizione, sequenzaArea, Icona } from './voci';

export function titoloElemento(el: Elemento): string {
  switch (el.tipo) {
    case 'verifica': case 'domanda': case 'informazione': return el.testo;
    case 'foto': return el.oggetto;
    case 'lettura': return el.strumento;
    case 'misura': return el.cosa;
    case 'documento': return el.documento;
    case 'anomalia': return el.tema;
    case 'tabella': case 'protocollo': return el.titolo;
    case 'uscitaArea': return el.titolo ?? 'Prima di lasciare l\'area';
  }
}

let apertoOra: string | null = null;
/** Codice della voce aperta nel pannello (per lo scatto rapido dalla barra). */
export function elementoAperto() { return apertoOra; }

/** Pannello di una voce: titolo breve, testo, azioni principali, «Altre azioni», navigazione Prec./Avanti. */
export function Pannello({ ses, el, inline, onChiudi }: { ses: Sessione; el: Elemento; inline?: boolean; onChiudi: () => void }) {
  const e = ses.stato.esiti[el.id];
  const seq = sequenzaArea(ses, el.area);
  const i = seq.findIndex((x) => x.id === el.id);
  const prec = i > 0 ? seq[i - 1] : undefined;
  const succ = i >= 0 && i < seq.length - 1 ? seq[i + 1] : undefined;
  const vaiA = (x: Elemento) => vai('s', ses.istanza.id, 'a', x.area, x.id);
  const avanti = () => (succ ? vaiA(succ) : vai('s', ses.istanza.id, 'chiudi', el.area));
  useEffect(() => { apertoOra = el.id; return () => { apertoOra = null; }; }, [el.id]);
  const desc = descrizione(el);
  const corpo = useRef<HTMLDivElement>(null);
  useEffect(() => { corpo.current?.scrollTo(0, 0); }, [el.id]);
  return <section class={inline ? 'pannello inline' : 'pannello'} aria-label={`Voce ${el.id}`}>
    {!inline && <div class="maniglia" />}
    <div class="pn-testa">
      {el.priorita === 'A' && <span class="pn-a">A</span>}
      <span class="tenue piccolo">{NOMI_TIPO[el.tipo]}{el.riservato ? ' · riservato' : ''}</span>
      <code class="pn-cod">{el.id}</code>
      <span class="cresce" />
      {!inline && <button class="pn-x" aria-label="Chiudi" onClick={onChiudi}><Icona n="chiudi" /></button>}
    </div>
    <div class="pn-corpo" ref={corpo}>
      <h2 class="pn-tit">{titoloBreve(el)}</h2>
      {desc && <p class="pn-desc">{desc}</p>}
      {el.nota && <p class="piccolo tenue">{el.nota}</p>}
      <Editor ses={ses} el={el} e={e} dopoConferma={avanti} />
    </div>
    <div class="pn-piede">
      <button class="btn" disabled={!prec} onClick={() => prec && vaiA(prec)}><Icona n="indietro" d={18} /> Prec.</button>
      <button class="btn pri cresce" onClick={avanti}>{succ ? <>Avanti: <span class="ellissi">{titoloBreve(succ)}</span></> : 'Fine area: chiudila'} <Icona n="avanti" d={18} /></button>
    </div>
  </section>;
}

function Atti({ d }: { d?: DatoAtti }) {
  if (!d) return null;
  return <div class="atti-box">
    <div class="atti-et">Agli atti</div>
    <div class="atti-val">{valoreFormattato(d.valore, d.unita)}</div>
    {(d.classe || d.origine || d.fonte || d.nota) && <div class="atti-fonte">{[d.classe && (d.origine ? `${d.classe} (${d.origine})` : d.classe), d.fonte, d.nota].filter(Boolean).join(' · ')}</div>}
  </div>;
}

function Collegamenti({ ses, codici }: { ses: Sessione; codici?: string[] }) {
  if (!codici?.length) return null;
  return (
    <div class="piccolo" style="margin:6px 0">Collegata a: {codici.map((c, i) => {
      const el = ses.struttura.elementi.find((x) => x.id === c);
      return <span key={c}>{i ? ', ' : ''}{el ? <a href={`#/s/${ses.istanza.id}/a/${el.area}/${c}`}>{c}</a> : <span class="tenue">{c}</span>}</span>;
    })}</div>
  );
}

function NoteElemento({ ses, el, e }: { ses: Sessione; el: Elemento; e?: Esito }) {
  return <>
    <label class="campo"><span>Nota (può finire nei report)</span><InputSalva area valore={e?.note} onSalva={(v) => prova(() => ses.registra('esito.aggiornato', el.id, { campi: { note: v } }))} /></label>
    <label class="campo"><span>Nota interna (mai nei report per il cliente)</span><InputSalva area valore={e?.notaInterna} onSalva={(v) => prova(() => ses.registra('esito.aggiornato', el.id, { campi: { notaInterna: v } }))} /></label>
  </>;
}

/** «Non fattibile oggi» (deroga): solo per le voci importanti non completate. */
function NonFattibile({ ses, el }: { ses: Sessione; el: Elemento }) {
  const d = ses.stato.deroghe.find((x) => x.codice === el.id);
  if (d) return <p class="avviso piccolo">Non fattibile oggi: {d.motivo} <button class="btn pic" onClick={() => prova(() => ses.registra('deroga.revocata', null, { codice: el.id }), 'Di nuovo da fare')}>Annulla</button></p>;
  if (el.priorita !== 'A' || statoElemento(ses.struttura, ses.stato, el) === 'completo') return null;
  return <button class="btn pic" onClick={async () => {
    const m = await motivo('Non fattibile oggi', 'Perché non si può fare oggi? Il motivo resta nel verbale e nel report.');
    if (m) await prova(() => ses.registra('deroga.registrata', null, { codice: el.id, motivo: m }), 'Segnata come non fattibile oggi');
  }}>Non fattibile oggi…</button>;
}

function Editor({ ses, el, e, dopoConferma }: { ses: Sessione; el: Elemento; e?: Esito; dopoConferma: () => void }) {
  const conFoto = el.tipo !== 'informazione' && el.tipo !== 'uscitaArea';
  const tipoFoto = el.tipo === 'documento' ? 'documento' : 'foto';
  const foto = conFoto ? <Cattura ses={ses} elementi={[el.id]} area={el.area} tipi={['foto']} tipoFoto={tipoFoto} grande /> : null;
  const evid = <Miniature ses={ses} ids={e?.evidenze} />;
  const altre = (extra?: preact.ComponentChildren) => <details class="altre">
    <summary>Altre azioni</summary>
    <div class="altre-corpo">
      {extra}
      {conFoto && <Cattura ses={ses} elementi={[el.id]} area={el.area} tipi={['galleria', 'file', 'audio', 'nota']} tipoFoto={tipoFoto} />}
      <div class="gruppo-btn" style="margin-top:8px"><NonFattibile ses={ses} el={el} /></div>
      <Collegamenti ses={ses} codici={el.rif} />
      {el.tipo !== 'informazione' && <NoteElemento ses={ses} el={el} e={e} />}
    </div>
  </details>;
  switch (el.tipo) {
    case 'verifica': return <><EdVerifica ses={ses} el={el} e={e} foto={foto} dopoConferma={dopoConferma} />{evid}{altre(<AltreVerifica ses={ses} el={el} e={e} />)}</>;
    case 'domanda': return <><EdDomanda ses={ses} el={el} e={e} />{foto}{evid}{altre(<AltreDomanda ses={ses} el={el} />)}</>;
    case 'foto': return <><EdFoto ses={ses} el={el} e={e} />{foto}{evid}{altre(<button class="btn pic" onClick={async () => { const m = await motivo('Foto non disponibile'); if (m) reg(ses, el.id, { stato: 'nonDisponibile', motivo: m }); }}>Foto non disponibile…</button>)}</>;
    case 'lettura': case 'misura': return <><EdValori ses={ses} el={el} e={e} />{foto}{evid}{altre(<button class="btn pic" onClick={async () => { const m = await motivo('Lettura/misura non eseguibile'); if (m) reg(ses, el.id, { stato: 'nonEseguibile', motivo: m }); }}>Non eseguibile…</button>)}</>;
    case 'documento': return <><EdDocumento ses={ses} el={el} e={e} />{foto}{evid}{altre()}</>;
    case 'anomalia': return <><EdAnomalia ses={ses} el={el} e={e} />{foto}{evid}{altre()}</>;
    case 'tabella': return <><EditorTabella ses={ses} el={el} e={e} />{foto}{evid}{altre()}</>;
    case 'protocollo': return <><EdProtocollo ses={ses} el={el} e={e} />{foto}{evid}{altre()}</>;
    case 'uscitaArea': return <EdUscita ses={ses} el={el} />;
    case 'informazione': return <>{descrizione(el) ? null : <p style="white-space:pre-wrap">{el.testo}</p>}{el.figura && <a class="btn pic" href={`#/s/${ses.istanza.id}/figura/${el.figura}`}>Apri la planimetria {el.figura}</a>}</>;
  }
}

const reg = (ses: Sessione, codice: string, campi: Partial<Esito>, ok?: string) => prova(() => ses.registra('esito.aggiornato', codice, { campi }), ok);

const ESITI_VER: Record<string, string> = { confermato: 'Confermato', corretto: 'Corretto', difforme: 'Difforme', nonVerificabile: 'Non verificabile', daIntegrare: 'Da integrare' };

async function scegliVerifica(ses: Sessione, el: ElVerifica, e: Esito | undefined, stato: string) {
  if (stato === 'corretto' || stato === 'difforme') {
    const r = await chiedi(stato === 'corretto' ? 'Correggo il dato agli atti' : 'Diverso da quanto previsto', [
      { id: 'v', etichetta: 'Valore che vedo', valore: e?.valoreRilevato != null ? String(e.valoreRilevato) : '', obbligatorio: stato === 'corretto' },
      { id: 'f', etichetta: 'Da dove lo leggo (targa, display, documento, detto da…)', valore: e?.fonte ?? '', obbligatorio: true },
      { id: 'c', etichetta: 'Classe', tipo: 'scelta', scelte: Object.keys(ses.struttura.legenda?.classi ?? { M: '', F: '', S: '', D: '', R: '' }), valore: e?.classe ?? 'R' },
    ], { testo: 'Il valore agli atti resta registrato accanto a quello nuovo. Fai una foto come prova.' });
    if (!r) return false;
    await reg(ses, el.id, { stato, valoreRilevato: parseNumero(r.v), classe: r.c, fonte: r.f }, 'Salvato');
    return true;
  }
  if (stato === 'nonVerificabile' || stato === 'daIntegrare') {
    const m = await motivo(stato === 'nonVerificabile' ? 'Non verificabile' : 'Da integrare');
    if (m) { await reg(ses, el.id, { stato, motivo: m }, 'Salvato'); return true; }
    return false;
  }
  await reg(ses, el.id, { stato }, 'Confermato');
  return true;
}

function EdVerifica({ ses, el, e, foto, dopoConferma }: { ses: Sessione; el: ElVerifica; e?: Esito; foto: preact.ComponentChildren; dopoConferma: () => void }) {
  const fatta = e && e.stato !== 'aperto';
  return <>
    <Atti d={el.agliAtti} />
    {fatta && <p class="okbox piccolo"><b>{ESITI_VER[e.stato] ?? e.stato}</b>{e.valoreRilevato != null ? ` — ${numIt(e.valoreRilevato)}` : ''}{e.fonte ? ` · ${e.fonte}` : ''}{e.motivo ? ` · ${e.motivo}` : ''} · alle {soloOra(e.aggiornatoIl)}
      {' '}<button class="btn pic" onClick={() => reg(ses, el.id, { stato: 'aperto' }, 'Di nuovo da fare')}>Rifai</button></p>}
    {!fatta && <button class="btn ok grande larga" onClick={async () => { if (await scegliVerifica(ses, el, e, 'confermato')) dopoConferma(); }}><Icona n="ok" s={2.6} />{el.agliAtti ? 'Confermo' : 'Verificato, è così'}</button>}
    <div class="due">
      <button class="btn" onClick={() => scegliVerifica(ses, el, e, el.agliAtti ? 'corretto' : 'difforme')}>{el.agliAtti ? 'Correggo…' : 'Non è così…'}</button>
      {foto}
    </div>
  </>;
}

function AltreVerifica({ ses, el, e }: { ses: Sessione; el: ElVerifica; e?: Esito }) {
  return <div class="gruppo-btn">
    {el.agliAtti && <button class="btn pic" onClick={() => scegliVerifica(ses, el, e, 'difforme')}>Diverso da quanto previsto…</button>}
    <button class="btn pic" onClick={() => scegliVerifica(ses, el, e, 'nonVerificabile')}>Non verificabile…</button>
    <button class="btn pic" onClick={() => scegliVerifica(ses, el, e, 'daIntegrare')}>Da integrare…</button>
  </div>;
}

function AltreDomanda({ ses, el }: { ses: Sessione; el: ElDomanda }) {
  return <div class="gruppo-btn">
    <button class="btn pic" onClick={async () => { const m = await motivo('Nessuna risposta'); if (m) reg(ses, el.id, { stato: 'nonRisposta', motivo: m, note: m }); }}>Nessuna risposta…</button>
    <button class="btn pic" onClick={async () => { const m = await motivo('Rinviata (a chi, entro quando)'); if (m) reg(ses, el.id, { stato: 'rinviata', note: m }); }}>Rinviata…</button>
  </div>;
}

function EdDomanda({ ses, el, e }: { ses: Sessione; el: ElDomanda; e?: Esito }) {
  const presenti = Object.values(ses.stato.presenti).filter((p) => p.presente);
  const dest = ses.struttura.persone?.find((p) => p.id === el.destinatario);
  return <>
    <p class="piccolo tenue">A chi: {dest ? `${dest.nome}${dest.ruolo ? ' (' + dest.ruolo + ')' : ''}` : el.destinatario ?? '—'}{el.perche ? ` · Perché: ${el.perche}` : ''}</p>
    {el.temaSensibile && <p class="avviso piccolo">Tema sensibile: porre la domanda in forma tecnica e neutra.</p>}
    <label class="campo"><span>Risposta (detta con il microfono della tastiera)</span>
      <InputSalva area valore={e?.risposta} onSalva={(v) => reg(ses, el.id, { risposta: v, stato: v.trim() ? 'risposta' : 'aperta', provenienza: e?.provenienza ?? 'D', daConfermarePerIscritto: e?.daConfermarePerIscritto ?? (e?.provenienza ?? 'D') === 'D' }, 'Risposta salvata')} />
    </label>
    <label class="campo"><span>Chi ha risposto</span>
      <select value={e?.rispostaDa ?? ''} onChange={async (x) => {
        let v = x.currentTarget.value;
        if (v === '__altro') { const r = await chiedi('Chi ha risposto', [{ id: 'n', etichetta: 'Nome e ruolo', obbligatorio: true }]); if (!r) return; v = r.n; }
        reg(ses, el.id, { rispostaDa: v });
      }}>
        <option value="">— scegli —</option>
        {presenti.map((p) => { const v = `${p.nome}${p.ruolo ? ', ' + p.ruolo : ''}`; return <option value={v}>{v}</option>; })}
        {e?.rispostaDa && !presenti.some((p) => `${p.nome}${p.ruolo ? ', ' + p.ruolo : ''}` === e.rispostaDa) && <option value={e.rispostaDa}>{e.rispostaDa}</option>}
        <option value="__altro">Altro…</option>
      </select>
    </label>
    <div class="gruppo-btn">
      <button class={`btn pic ${e?.provenienza === 'R' ? 'sel' : ''}`} onClick={() => reg(ses, el.id, { provenienza: 'R', daConfermarePerIscritto: false })}>Riscontrato (visto)</button>
      <button class={`btn pic ${(e?.provenienza ?? 'D') === 'D' && e ? 'sel' : ''}`} onClick={() => reg(ses, el.id, { provenienza: 'D', daConfermarePerIscritto: true })}>Dichiarato (detto)</button>
      <label class="riga piccolo"><input type="checkbox" checked={!!e?.daConfermarePerIscritto} onChange={(x) => reg(ses, el.id, { daConfermarePerIscritto: x.currentTarget.checked })} /> da confermare per iscritto</label>
    </div>
  </>;
}

function EdFoto({ ses, el, e }: { ses: Sessione; el: ElFoto; e?: Esito }) {
  const n = (e?.evidenze ?? []).filter((id) => !ses.stato.evidenze[id]?.annullata).length;
  return <>
    {el.leggibile && <p class="piccolo">Deve essere leggibile: <b>{el.leggibile}</b></p>}
    {el.serveA && <p class="piccolo tenue">Serve a: {el.serveA}</p>}
    <p class="piccolo">Scatti: <b>{n}</b> di {el.scattiMinimi ?? 2} (una d'insieme + un dettaglio)</p>
    {e?.stato === 'nonDisponibile' && <p class="avviso piccolo">Non disponibile: {e.motivo}</p>}
  </>;
}

function EdValori({ ses, el, e }: { ses: Sessione; el: ElLettura | ElMisura; e?: Esito }) {
  const momenti: Momento[] = el.tipo === 'lettura' ? el.momenti : ['unica'];
  const val = (g: string, m: string, r: number) => e?.valori?.find((v) => v.grandezza === g && (v.momento ?? 'unica') === m && (v.ripetizione ?? 1) === r);
  const salva = (g: string, unita: string | undefined, m: Momento, r: number, testo: string, tipoValore?: string) => {
    const valore = testo.trim() === '' ? null : tipoValore === 'testo' ? testo.trim() : parseNumero(testo);
    return prova(() => ses.registra('valore.registrato', el.id, { lista: [{ grandezza: g, momento: m, ripetizione: r, valore, ...(unita ? { unita } : {}), il: isoLocale() }] }), 'Salvato con l\'ora');
  };
  const correggiOra = async (g: string, m: Momento, r: number) => {
    const v = val(g, m, r);
    if (!v) return;
    const x = await chiedi('Correggi l\'ora della lettura', [{ id: 'o', etichetta: 'Ora effettiva (hh:mm)', valore: soloOra(v.il), obbligatorio: true }, { id: 'm', etichetta: 'Motivo', obbligatorio: true }],
      { testo: 'L\'ora registrata in automatico resta conservata accanto a quella corretta.' });
    if (!x || !/^\d{1,2}:\d{2}$/.test(x.o)) return;
    const il = v.il.replace(/T\d{2}:\d{2}:\d{2}/, `T${x.o.padStart(5, '0')}:00`);
    await prova(() => ses.registra('valore.registrato', el.id, { lista: [{ ...v, il, oraCorretta: { da: v.oraCorretta?.da ?? v.il, motivo: x.m } }] }), 'Ora corretta');
  };
  return <>
    {el.tipo === 'lettura' ? (el.dove ? <p class="piccolo tenue">Dove: {el.dove}</p> : null)
      : <p class="piccolo tenue">Strumento: {el.strumento}{el.indicativa ? ' (valore indicativo)' : ''}</p>}
    {el.tipo === 'lettura' && <Atti d={el.agliAtti} />}
    {el.tipo === 'lettura' && el.gruppo && <a class="btn pic" href={`#/s/${ses.istanza.id}/contemporanee/${encodeURIComponent(el.gruppo)}`}>Fai tutte le letture insieme («{el.gruppo}») ›</a>}
    {el.tipo === 'misura' && el.perche && <p class="piccolo tenue">Perché: {el.perche}</p>}
    {momenti.map((m) => (
      <div key={m} style="margin-top:8px">
        {momenti.length > 1 && <div class="sezione-tit" style="margin:6px 0 2px">{m}</div>}
        {el.grandezze.flatMap((g) => Array.from({ length: g.ripetizioni ?? 1 }, (_, i) => i + 1).map((r) => {
          const v = val(g.id, m, r);
          return (
            <div class="riga" key={g.id + r} style="margin:4px 0">
              <span class="cresce piccolo">{g.nome}{(g.ripetizioni ?? 1) > 1 ? ` (${r})` : ''}{g.unita ? ` [${g.unita}]` : ''}</span>
              <div style="width:150px"><InputSalva valore={v?.valore != null ? numIt(v.valore) : ''} numerico={g.tipoValore !== 'testo'} onSalva={(t) => salva(g.id, g.unita, m, r, t, g.tipoValore)} /></div>
              <button class="btn pic" style="min-width:64px" disabled={!v} onClick={() => correggiOra(g.id, m, r)} title="Correggi l'ora">{v ? soloOra(v.il) : '--:--'}{v?.oraCorretta ? '*' : ''}</button>
            </div>
          );
        }))}
      </div>
    ))}
    {el.tipo === 'lettura' && momentiAttesi(el).includes('arrivo') && momentiAttesi(el).includes('partenza') && <Delta el={el} e={e} />}
    {el.tipo === 'lettura' && el.controlloCoerenza && <p class="piccolo atti">Controllo di coerenza: {el.controlloCoerenza}</p>}
    {el.tipo === 'misura' && <label class="campo"><span>Strumento usato (marca, modello)</span><InputSalva valore={e?.strumentoUsato ?? ''} placeholder={el.strumento} onSalva={(v) => prova(() => ses.registra('valore.registrato', el.id, { lista: [], strumentoUsato: v }))} /></label>}
  </>;
}

function Delta({ el, e }: { el: ElLettura; e?: Esito }) {
  const righe = el.grandezze.map((g) => {
    const a = e?.valori?.find((v) => v.grandezza === g.id && v.momento === 'arrivo');
    const p = e?.valori?.find((v) => v.grandezza === g.id && v.momento === 'partenza');
    if (typeof a?.valore !== 'number' || typeof p?.valore !== 'number') return null;
    const ore = (Date.parse(p.il) - Date.parse(a.il)) / 3.6e6;
    const d = p.valore - a.valore;
    return `${g.nome}: Δ ${numIt(Math.round(d * 1000) / 1000)}${g.unita ? ' ' + g.unita : ''} in ${numIt(Math.round(ore * 100) / 100)} h${ore > 0 ? ` → ${numIt(Math.round((d / ore) * 1000) / 1000)}${g.unita ? ' ' + g.unita : ''}/h` : ''}`;
  }).filter(Boolean);
  return righe.length ? <p class="piccolo okbox">{righe.map((r) => <div>{r}</div>)}</p> : null;
}

function EdDocumento({ ses, el, e }: { ses: Sessione; el: ElDocumento; e?: Esito }) {
  const scegli = async (stato: string) => {
    if (stato === 'promesso') {
      const r = await chiedi('Documento promesso', [
        { id: 'd', etichetta: 'Entro il', tipo: 'data', valore: e?.promessoEntro ?? '', obbligatorio: true },
        { id: 'c', etichetta: 'Chi lo invia', valore: e?.chiLoInvia ?? el.daChi ?? '', obbligatorio: true },
      ]);
      if (r) await reg(ses, el.id, { stato, promessoEntro: r.d, chiLoInvia: r.c }, 'Salvato');
      return;
    }
    if (stato === 'nonDisponibile') { const m = await motivo('Documento non disponibile'); if (m) await reg(ses, el.id, { stato, motivo: m }); return; }
    await reg(ses, el.id, { stato }, 'Salvato');
  };
  return <>
    <p class="piccolo tenue">Da: {el.daChi ?? '—'}{el.perche ? ` · Perché: ${el.perche}` : ''}{el.daPreparareInGiornata ? ' · da chiedere in apertura' : ''}</p>
    {e && e.stato !== 'aperto' && <p class="okbox piccolo">{ETICHETTE_STATO_DOC[e.stato]}{e.promessoEntro ? ` entro ${dataIt(e.promessoEntro)}` : ''}{e.chiLoInvia ? ` — ${e.chiLoInvia}` : ''}{e.motivo ? ` — ${e.motivo}` : ''}</p>}
    <div class="gruppo-btn">
      {(['ritiratoOriginale', 'ritiratoCopia', 'fotografato', 'promesso', 'nonDisponibile'] as const).map((s) =>
        <button class={`btn pic ${e?.stato === s ? 'sel' : ''}`} onClick={() => scegli(s)}>{ETICHETTE_STATO_DOC[s]}</button>)}
    </div>
    <p class="piccolo tenue">Le foto delle pagine restano copie acquisite in sopralluogo: il documento resta da ricevere dal cliente.</p>
  </>;
}

function EdAnomalia({ ses, el, e }: { ses: Sessione; el: ElAnomalia; e?: Esito }) {
  return <>
    <div class="atti">Agli atti: {el.datoAtti}</div>
    {el.evidenzaDaRaccogliere && <p class="piccolo">Evidenza da raccogliere: {el.evidenzaDaRaccogliere}</p>}
    {el.doveSiVerifica?.length ? <div class="piccolo" style="margin:6px 0">Dove si verifica: {el.doveSiVerifica.map((c) => {
      const x = ses.struttura.elementi.find((y) => y.id === c);
      return <a style="margin-right:8px" href={x ? `#/s/${ses.istanza.id}/a/${x.area}/${c}` : undefined}>{c} <Badge s={statoCodice(ses.struttura, ses.stato, c)} /></a>;
    })}</div> : null}
    <label class="campo"><span>Esito in sopralluogo (fatti ed evidenze, nessuna conclusione)</span>
      <InputSalva area valore={e?.esito} onSalva={(v) => reg(ses, el.id, { esito: v })} />
    </label>
    <div class="gruppo-btn">
      <button class={`btn pic ${e?.stato === 'chiusa' ? 'sel' : ''}`} onClick={() => reg(ses, el.id, { stato: 'chiusa' }, 'Chiusa')}>Chiusa</button>
      <button class={`btn pic ${e?.stato === 'limite' ? 'sel' : ''}`} onClick={() => reg(ses, el.id, { stato: 'limite' }, 'Limite da dichiarare')}>Limite</button>
      <button class={`btn pic ${!e || e.stato === 'aperta' ? 'sel' : ''}`} onClick={() => reg(ses, el.id, { stato: 'aperta' })}>Aperta</button>
    </div>
  </>;
}

function EdProtocollo({ ses, el, e }: { ses: Sessione; el: ElProtocollo; e?: Esito }) {
  const [firma, setFirma] = useState(false);
  const presenti = Object.values(ses.stato.presenti).filter((p) => p.presente);
  return <>
    {el.scopo && <p class="piccolo tenue">{el.scopo}</p>}
    {el.regole?.length ? <ul class="piccolo">{el.regole.map((r) => <li>{r}</li>)}</ul> : null}
    {el.daLasciareAlCliente && <p class="avviso piccolo">Protocollo da lasciare al cliente: si registra quando torna il foglio compilato.</p>}
    {el.passi.map((p) => {
      const pe = e?.passi?.[p.id];
      return (
        <div class="card" key={p.id} style="margin:6px 0">
          <div class="riga"><code><b>{p.id}</b></code><span class="tenue piccolo">{p.orarioPrevisto ?? ''}{p.alle ? `–${p.alle}` : ''}</span><span class="cresce" /><span class={`badge ${pe?.stato === 'eseguito' ? 'completo' : pe?.stato === 'saltato' ? 'derogato' : 'aperto'}`}>{pe?.stato ?? 'da fare'}</span></div>
          <p style="margin:4px 0">{p.manovra}</p>
          {p.esegue && <p class="piccolo tenue">Esegue: {p.esegue}</p>}
          {pe?.oraEffettiva && <p class="piccolo">Eseguito alle <b>{soloOra(pe.oraEffettiva)}</b>{pe.eseguitoDa ? ` da ${pe.eseguitoDa}` : ''}</p>}
          {pe?.motivo && <p class="piccolo">Motivo: {pe.motivo}</p>}
          <div class="gruppo-btn">
            <button class="btn pic ok" onClick={async () => {
              const chi = p.esegue ?? presenti[0]?.nome ?? '';
              await prova(() => ses.registra('passo.aggiornato', el.id, { passo: p.id, campi: { stato: 'eseguito', oraEffettiva: isoLocale(), eseguitoDa: chi } }), `${p.id} eseguito alle ${soloOra(isoLocale())}`);
            }}>Eseguito ora</button>
            <button class="btn pic" onClick={async () => { const m = await motivo(`Salta ${p.id}`); if (m) await prova(() => ses.registra('passo.aggiornato', el.id, { passo: p.id, campi: { stato: 'saltato', motivo: m } })); }}>Saltato…</button>
            <button class="btn pic" onClick={async () => {
              const r = await chiedi(`Nota per ${p.id}`, [{ id: 'n', etichetta: 'Stato delle utenze, letture, osservazioni', tipo: 'area', valore: pe?.note ?? '' }]);
              if (r) await prova(() => ses.registra('passo.aggiornato', el.id, { passo: p.id, campi: { note: r.n } }));
            }}>Nota</button>
            {pe && pe.stato !== 'daFare' && <button class="btn pic" onClick={async () => { if (await conferma(`Riportare ${p.id} a «da fare»?`)) await prova(() => ses.registra('passo.aggiornato', el.id, { passo: p.id, campi: { stato: 'daFare' } })); }}>Annulla esito</button>}
          </div>
          {pe?.note && <p class="piccolo atti">{pe.note}</p>}
        </div>
      );
    })}
    {el.firmaRipristino && (e?.ripristino?.il ? <p class="okbox piccolo">Ripristino firmato da {e.ripristino.nome} alle {soloOra(e.ripristino.il)}</p>
      : <button class="btn" onClick={() => setFirma(true)}>Firma del ripristino…</button>)}
    {firma && <Firma titolo="Firma del ripristino" sottotitolo="Il referente conferma che le utenze sono state riportate nello stato abituale." onFine={async (r) => {
      setFirma(false);
      if (!r) return;
      const ev = await prova(() => ses.acquisisci({ blob: r.png, tipo: 'firma', fonte: 'schermo', elementi: [el.id], area: el.area, didascalia: `Firma ripristino — ${r.nome}` }));
      if (ev) await prova(() => ses.registra('ripristino.firmato', el.id, { firma: ev.id, nome: r.nome }), 'Ripristino firmato');
    }} />}
  </>;
}

function EdUscita({ ses, el }: { ses: Sessione; el: ElUscitaArea }) {
  const chiusa = ses.stato.areeChiuse[el.area];
  return <>
    {el.voci.map((v) => <div class="riga" style="margin:6px 0"><Badge s={statoLista(ses.struttura, ses.stato, v.rif)} /><span class="cresce">{v.testo}</span><span class="piccolo tenue">{(v.rif ?? []).join(', ')}</span></div>)}
    {chiusa ? <div class="okbox piccolo">Area chiusa alle {soloOra(chiusa.il)}{chiusa.conDeroga ? ' con deroga' : ''} <button class="btn pic" onClick={() => prova(() => ses.registra('area.riaperta', null, { area: el.area }))}>Riapri</button></div>
      : <button class="btn pri" style="margin-top:8px" onClick={() => chiudiArea(ses, el.area)}>Chiudi l'area</button>}
  </>;
}

export function chiudiArea(ses: Sessione, area: string) { vai('s', ses.istanza.id, 'chiudi', area); }

export async function suggerisciCheckpoint(ses: Sessione) {
  if (contaModificheNonEsportate(ses.istanza.aSeq, ses.stato) > 5 && await conferma('Salva una copia', 'Hai chiuso un\'area: salva ora una copia su OneDrive, così niente si perde anche se il telefono si rompe.', { ok: 'Salva copia', annulla: 'Più tardi' })) {
    vai('s', ses.istanza.id, 'esporta');
  }
}

export { dataOra };
