// Guscio del sopralluogo: barra, schede, viste Adesso / Giro / Cosa manca / INBOX / Altro.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import type { ElLettura, Presente } from '../dominio/tipi';
import { useSessione, vai, avvisa, prova, chiedi, conferma, Badge, Pr, useOra, InputSalva, parseNumero, messaggio } from './comuni';
import { statoElemento, statoLista, avanzamentoArea, contaModificheNonEsportate, statoCodice } from '../dominio/completezza';
import { VistaArea, elementoAperto } from './area';
import { Cattura, Miniature, acquisisciFile } from './evidenze';
import { titoloElemento } from './editori';
import { ElencoFigure, VistaFigura } from './figure';
import { VistaVerbale } from './verbale';
import { VistaEsporta } from './esporta';
import { impostazione } from '../archivio/db';
import { db } from '../archivio/db';
import { isoLocale, soloOra, dataIt, numIt } from '../util/base';
import { indiceElementi } from '../dominio/stato';

export function Sopralluogo({ id, percorso }: { id: string; percorso: string[] }) {
  const ses = useSessione(id);
  const ora = useOra(30000);
  const [intervallo, setIntervallo] = useState(45);
  useEffect(() => { impostazione('promemoriaMinuti', 45).then(setIntervallo); }, []);
  if (!ses) return <div class="contenuto"><p class="tenue">Apertura del sopralluogo…</p></div>;
  const vista = percorso[0] ?? (ses.stato.statoSopralluogo === 'preparazione' ? 'preparazione' : 'adesso');
  const nonEsp = contaModificheNonEsportate(ses.istanza.aSeq, ses.stato);
  const rif = ses.stato.checkpoint.confermati.at(-1)?.il ?? ses.stato.avviatoIl;
  const minuti = rif ? (ora.getTime() - Date.parse(rif)) / 60000 : 0;
  const allarme = nonEsp > 0 && ses.stato.statoSopralluogo === 'inCorso' && minuti > intervallo;
  const areaCorr = vista === 'a' ? ses.struttura.aree.find((a) => a.id === percorso[1]) : undefined;
  const scheda = (v: string, ic: string, et: string) => (
    <button class={vista === v || (v === 'giro' && vista === 'a') ? 'att' : ''} onClick={() => vai('s', id, v)}><span class="ic">{ic}</span>{et}</button>
  );
  let corpo;
  switch (vista) {
    case 'preparazione': corpo = <Preparazione ses={ses} />; break;
    case 'adesso': corpo = <Adesso ses={ses} />; break;
    case 'giro': corpo = <Giro ses={ses} />; break;
    case 'a': corpo = <VistaArea ses={ses} area={percorso[1]} codice={percorso[2]} />; break;
    case 'manca': corpo = <CosaManca ses={ses} />; break;
    case 'inbox': corpo = <Inbox ses={ses} />; break;
    case 'altro': corpo = <Altro ses={ses} />; break;
    case 'presenti': corpo = <Presenti ses={ses} />; break;
    case 'documenti': corpo = <Documenti ses={ses} />; break;
    case 'contemporanee': corpo = <Contemporanee ses={ses} gruppo={percorso[1]} />; break;
    case 'figure': corpo = <ElencoFigure ses={ses} />; break;
    case 'figura': corpo = <VistaFigura ses={ses} id={percorso[1]} />; break;
    case 'verbale': corpo = <VistaVerbale ses={ses} />; break;
    case 'esporta': corpo = <VistaEsporta ses={ses} />; break;
    case 'integrita': corpo = <Integrita ses={ses} />; break;
    default: corpo = <Adesso ses={ses} />;
  }
  return <div class="app">
    <div class="barra">
      <button onClick={() => vai('')} aria-label="Elenco sopralluoghi">☰</button>
      <div class="tit">
        <b>{ses.struttura.pratica.codice} · {areaCorr ? areaCorr.titolo : ses.struttura.pratica.committente.ragioneSociale}</b>
        <small>{ses.struttura.pratica.sito.denominazione} · {soloOra(isoLocale(ora))}{ses.stato.statoSopralluogo === 'chiuso' ? ' · CHIUSO' : ''}</small>
      </div>
      <button onClick={cerca(ses)} aria-label="Cerca codice">🔍</button>
      <button class={allarme ? 'avv' : ''} onClick={() => vai('s', id, 'esporta')} title="Modifiche non esportate">⇪ {nonEsp}</button>
    </div>
    {allarme && <div class="avviso" style="margin:8px 12px 0">Ultimo checkpoint {Math.round(minuti)} minuti fa, {nonEsp} modifiche non esportate. <a href={`#/s/${id}/esporta`}>Fai un checkpoint</a></div>}
    <div class="contenuto">{corpo}</div>
    {ses.stato.statoSopralluogo !== 'chiuso' && <ScattoRapido ses={ses} area={areaCorr?.id} />}
    <nav class="schede">
      {scheda('adesso', '◷', 'Adesso')}
      {scheda('giro', '▦', 'Giro')}
      {scheda('manca', '!', 'Cosa manca')}
      {scheda('inbox', '⬚', `INBOX${contaInbox(ses) ? ' ' + contaInbox(ses) : ''}`)}
      {scheda('altro', '⋯', 'Altro')}
    </nav>
  </div>;
}

function contaInbox(ses: Sessione) {
  return Object.values(ses.stato.evidenze).filter((e) => !e.elementi.length && !e.annullata && (e.tipo === 'foto' || e.tipo === 'audio' || e.tipo === 'documento' || e.tipo === 'nota')).length;
}

const cerca = (ses: Sessione) => async () => {
  const r = await chiedi('Vai al codice', [{ id: 'c', etichetta: 'Codice (es. Q18, F24, TAB-CMP)', obbligatorio: true }]);
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
      const r = await acquisisciFile(ses, f, { tipo: el?.tipo === 'documento' ? 'documento' : 'foto', fonte: 'fotocamera', elementi: usa, area: area ?? el?.area ?? sessionStorage.getItem('areaCorrente') ?? undefined });
      if (r) avvisa(usa.length ? `Foto salvata su ${usa[0]}` : 'Foto salvata in INBOX');
    }} />
    <button class="fab" aria-label="Scatto rapido" onClick={() => inp.current?.click()}>📷</button>
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
  const s = ses.struttura;
  const hm = soloOra(isoLocale(ora));
  const fascia = (s.programma ?? []).find((f) => f.dalle <= hm && (!f.alle || hm < f.alle)) ?? (s.programma ?? []).filter((f) => f.dalle <= hm).at(-1);
  const prossima = (s.programma ?? []).find((f) => f.dalle > hm);
  const passi: { proto: string; area: string; id: string; prev: string; manovra: string }[] = [];
  const oggi = isoLocale(ora).slice(0, 10) === s.pratica.data;
  for (const el of s.elementi) if (el.tipo === 'protocollo' && !el.daLasciareAlCliente) for (const p of el.passi) {
    const pe = ses.stato.esiti[el.id]?.passi?.[p.id];
    if ((!pe || pe.stato === 'daFare') && p.orarioPrevisto) passi.push({ proto: el.id, area: el.area, id: p.id, prev: p.orarioPrevisto, manovra: p.manovra });
  }
  passi.sort((a, b) => a.prev.localeCompare(b.prev));
  const gruppi = [...new Set(s.elementi.filter((e): e is ElLettura => e.tipo === 'lettura' && !!e.gruppo).map((e) => e.gruppo!))];
  const [wake, setWake] = useState<WakeLockSentinel | null>(null);
  const minuti = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const adesso = ora.getHours() * 60 + ora.getMinutes();
  return <>
    {ses.stato.statoSopralluogo === 'preparazione' && <div class="avviso">Sopralluogo non ancora avviato. <a href={`#/s/${ses.istanza.id}/preparazione`}>Vai alla preparazione</a></div>}
    {fascia && <div class="card">
      <div class="tenue piccolo">Adesso · {fascia.dalle}{fascia.alle ? `–${fascia.alle}` : ''}</div>
      <h2 style="margin:4px 0">{fascia.attivita}</h2>
      {fascia.chi && <p class="piccolo">Con: {fascia.chi}</p>}
      <div class="gruppo-btn">{(fascia.aree ?? []).map((a) => <a class="btn pri" href={`#/s/${ses.istanza.id}/a/${a}`}>{a} →</a>)}</div>
      {prossima && <p class="piccolo tenue">Poi alle {prossima.dalle}: {prossima.attivita}</p>}
    </div>}
    {passi.length > 0 && <div class="card">
      <h3>Prossimi passi a orario</h3>
      {passi.slice(0, 3).map((p) => {
        const d = minuti(p.prev) - adesso;
        return <a class="voce-lista" href={`#/s/${ses.istanza.id}/a/${p.area}/${p.proto}`} style="color:inherit;text-decoration:none">
          <b style={`min-width:56px;color:${!oggi ? 'inherit' : d <= 0 ? 'var(--errore)' : d <= 5 ? 'var(--avviso)' : 'inherit'}`}>{p.prev}</b>
          <span class="cresce"><code>{p.id}</code> {p.manovra}</span>
          <span class="piccolo">{!oggi ? '' : d > 0 ? `tra ${d}′` : d === 0 ? 'ORA' : `${-d}′ fa`}</span>
        </a>;
      })}
      {'wakeLock' in navigator && <button class="btn pic" style="margin-top:8px" onClick={async () => {
        if (wake) { await wake.release(); setWake(null); return; }
        try { setWake(await navigator.wakeLock.request('screen')); avvisa('Lo schermo resta acceso finché sei in questa schermata'); } catch { avvisa('Impossibile tenere acceso lo schermo', true); }
      }}>{wake ? 'Schermo sempre acceso: ON' : 'Tieni lo schermo acceso'}</button>}
    </div>}
    {gruppi.map((g) => <a class="btn larga" style="margin:6px 0" href={`#/s/${ses.istanza.id}/contemporanee/${encodeURIComponent(g)}`}>Letture contemporanee «{g}»</a>)}
    <div class="card"><h3>Avanzamento</h3><Giro ses={ses} compatto /></div>
  </>;
}

// ------------------------------------------------------------------ giro
function Giro({ ses, compatto }: { ses: Sessione; compatto?: boolean }) {
  const aree = [...ses.struttura.aree].sort((a, b) => a.ordine - b.ordine);
  return <>
    {!compatto && <h1>Giro</h1>}
    <div class={compatto ? '' : 'card'} style={compatto ? '' : 'padding:0'}>
      {aree.map((a) => {
        const av = avanzamentoArea(ses.struttura, ses.stato, a.id);
        const chiusa = ses.stato.areeChiuse[a.id];
        return <a class="voce-lista" href={`#/s/${ses.istanza.id}/a/${a.id}`} style="color:inherit;text-decoration:none;display:flex">
          <div class="cresce">
            <div><code><b>{a.id}</b></code> {a.titolo}</div>
            <div class="piccolo tenue">{a.dalle ?? ''}{a.alle ? `–${a.alle}` : ''} · A {av.A.fatti}/{av.A.tot} · tot {av.tutti.fatti}/{av.tutti.tot}{chiusa ? ' · chiusa' : ''}</div>
            <div class="barra-prog" style="margin-top:4px"><div style={`width:${av.tutti.tot ? (100 * av.tutti.fatti) / av.tutti.tot : 0}%`} /></div>
          </div>
          <span>›</span>
        </a>;
      })}
    </div>
  </>;
}

// ------------------------------------------------------------------ cosa manca
function CosaManca({ ses }: { ses: Sessione }) {
  const s = ses.struttura, st = ses.stato;
  const [solo, setSolo] = useState<'A' | 'tutte'>('A');
  const aperti = s.elementi.filter((e) => e.tipo !== 'informazione' && e.tipo !== 'uscitaArea' && statoElemento(s, st, e) !== 'completo' && (solo === 'tutte' || e.priorita === 'A'));
  return <>
    <h1>Cosa manca</h1>
    {(s.nonLasciare ?? []).length > 0 && <div class="card"><h3>Le cose da non lasciare</h3>
      {s.nonLasciare!.map((v) => {
        const x = statoLista(s, st, v.rif);
        return <div class="riga" style="margin:6px 0;align-items:flex-start"><b style="min-width:24px">{v.n}</b><span class="cresce">{v.testo}<br /><small>{v.rif.map((c) => {
          const el = s.elementi.find((e) => e.id === c);
          return <a style="margin-right:6px" href={el ? `#/s/${ses.istanza.id}/a/${el.area}/${c}` : undefined}>{c}{statoCodice(s, st, c) === 'completo' ? '✓' : ''}</a>;
        })}</small></span><Badge s={x} /></div>;
      })}
    </div>}
    {(s.obiettivi ?? []).length > 0 && <div class="card"><h3>Obiettivi</h3>
      {s.obiettivi!.map((o) => <div style="margin:8px 0">
        <div class="riga"><code><b>{o.id}</b></code><span class="cresce">{o.titolo}</span><Badge s={statoLista(s, st, o.rif)} /></div>
        {o.evidenza && <div class="piccolo tenue">Da portare a casa: {o.evidenza}</div>}
        <InputSalva placeholder="nota sull'obiettivo" valore={st.obiettivi[o.id]?.nota} onSalva={(v) => prova(() => ses.registra('obiettivo.nota', o.id, { nota: v }))} />
      </div>)}
    </div>}
    <div class="riga"><h3 class="cresce">Voci aperte ({aperti.length})</h3>
      <button class={`btn pic ${solo === 'A' ? 'sel' : ''}`} onClick={() => setSolo('A')}>Solo A</button>
      <button class={`btn pic ${solo === 'tutte' ? 'sel' : ''}`} onClick={() => setSolo('tutte')}>Tutte</button></div>
    <div class="card" style="padding:0">
      {aperti.map((e) => <a class="voce-lista" style="color:inherit;text-decoration:none" href={`#/s/${ses.istanza.id}/a/${e.area}/${e.id}`}>
        <Pr p={e.priorita} /><span class="cresce"><code>{e.id}</code> <span class="piccolo">{titoloElemento(e).slice(0, 90)}</span><br /><small class="tenue">{e.area}</small></span><Badge s={statoElemento(s, st, e)} />
      </a>)}
      {!aperti.length && <p style="padding:12px" class="okbox">Nessuna voce aperta {solo === 'A' ? 'di priorità A' : ''}.</p>}
    </div>
    {st.deroghe.length > 0 && <div class="card"><h3>Deroghe</h3>{st.deroghe.map((d) => <p class="piccolo"><code>{d.codice}</code> {d.motivo}</p>)}</div>}
  </>;
}

// ------------------------------------------------------------------ INBOX
function Inbox({ ses }: { ses: Sessione }) {
  const lista = Object.values(ses.stato.evidenze).filter((e) => !e.elementi.length && !e.annullata && (e.tipo === 'foto' || e.tipo === 'audio' || e.tipo === 'documento' || e.tipo === 'nota'));
  const [sel, setSel] = useState<Set<string>>(new Set());
  return <>
    <h1>INBOX</h1>
    <p class="piccolo tenue">Scatti rapidi e note non ancora collegati a un codice. Tocca una miniatura per aprirla; seleziona più evidenze per assegnarle insieme.</p>
    <Cattura ses={ses} elementi={[]} area={sessionStorage.getItem('areaCorrente') ?? undefined} />
    {lista.length > 0 && <>
      <div class="card">
        {lista.map((e) => <label class="riga" style="margin:6px 0"><input type="checkbox" style="width:24px;height:24px" checked={sel.has(e.id)} onChange={(x) => { const n = new Set(sel); if (x.currentTarget.checked) n.add(e.id); else n.delete(e.id); setSel(n); }} />
          <span class="cresce piccolo">{e.tipo} {e.progressivo} · {e.area ?? '—'} · {soloOra(e.acquisitaIl)}{e.testo ? ` — ${e.testo.slice(0, 40)}` : ''}</span></label>)}
      </div>
      <Miniature ses={ses} ids={lista.map((e) => e.id)} />
      <button class="btn pri larga" style="margin-top:10px" disabled={!sel.size} onClick={async () => {
        const r = await chiedi(`Assegna ${sel.size} evidenze`, [{ id: 'c', etichetta: 'Codici (separati da virgola)', obbligatorio: true }]);
        if (!r) return;
        const cod = r.c.split(/[,\s]+/).filter(Boolean);
        for (const id of sel) await prova(() => ses.registra('evidenza.aggiornata', null, { id, elementi: cod }));
        setSel(new Set());
        avvisa('Assegnate');
      }}>Assegna le selezionate a un codice</button>
    </>}
    {!lista.length && <p class="okbox">INBOX vuota.</p>}
  </>;
}

// ------------------------------------------------------------------ altro
function Altro({ ses }: { ses: Sessione }) {
  const id = ses.istanza.id;
  const [pdf, setPdf] = useState<string | null>(null);
  useEffect(() => { db().campo.get(id).then((c) => { if (c) setPdf(URL.createObjectURL(c.blob)); }); }, [id]);
  const voce = (h: string, t: string, d: string) => <a class="voce-lista" href={`#/s/${id}/${h}`} style="color:inherit;text-decoration:none;display:flex"><span class="cresce"><b>{t}</b><br /><small class="tenue">{d}</small></span>›</a>;
  return <>
    <h1>Altro</h1>
    <div class="card" style="padding:0">
      {voce('preparazione', 'Preparazione', 'Checklist, strumenti, regole di campo, legenda')}
      {voce('presenti', 'Presenti e consensi', 'Chi c\'è, consenso a foto e registrazione')}
      {voce('documenti', 'Documenti', 'Tutti i documenti da ritirare o farsi promettere')}
      {voce('figure', 'Figure', 'Planimetrie e schemi da consultare e annotare')}
      {voce('verbale', 'Verbale e chiusura', 'Verbale, firme, chiusura del sopralluogo')}
      {voce('esporta', 'Esporta', 'Checkpoint, pacchetto finale, report')}
      {voce('integrita', 'Verifica di integrità', 'Controlla registro e impronte sul dispositivo')}
    </div>
    {pdf && <a class="btn larga" href={pdf} target="_blank" rel="noopener">Apri il PDF di campo</a>}
    {(ses.struttura.dopoSopralluogo ?? []).length > 0 && <div class="card"><h3>Dopo il sopralluogo</h3><ul>{ses.struttura.dopoSopralluogo!.map((d) => <li>{d.testo}{d.entro ? <small class="tenue"> — {d.entro}</small> : null}</li>)}</ul></div>}
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
  return <>
    <h1>Documenti</h1>
    <div class="card" style="padding:0">{docs.map((d) => {
      const e = ses.stato.esiti[d.id];
      return <a class="voce-lista" style="color:inherit;text-decoration:none" href={`#/s/${ses.istanza.id}/a/${d.area}/${d.id}`}>
        <Pr p={d.priorita} /><span class="cresce"><code>{d.id}</code> <span class="piccolo">{titoloElemento(d)}</span><br /><small class="tenue">{e && e.stato !== 'aperto' ? `${e.stato}${e.promessoEntro ? ' entro ' + dataIt(e.promessoEntro) : ''}${e.chiLoInvia ? ' — ' + e.chiLoInvia : ''}` : 'da chiedere'}{d.daPreparareInGiornata ? ' · chiedere in apertura' : ''}</small></span>
        <Badge s={statoElemento(ses.struttura, ses.stato, d)} />
      </a>;
    })}</div>
  </>;
}

// ------------------------------------------------------------------ letture contemporanee
function Contemporanee({ ses, gruppo }: { ses: Sessione; gruppo: string }) {
  const letture = ses.struttura.elementi.filter((e): e is ElLettura => e.tipo === 'lettura' && e.gruppo === gruppo);
  const momenti = [...new Set(letture.flatMap((l) => l.momenti))];
  const [momento, setMomento] = useState(momenti.find((m) => letture.some((l) => !ses.stato.esiti[l.id]?.valori?.some((v) => v.momento === m))) ?? momenti[0]);
  const [oraComune, setOraComune] = useState<string | null>(null);
  const [val, setVal] = useState<Record<string, string>>({});
  const salva = async () => {
    const il = oraComune ?? isoLocale();
    let n = 0;
    for (const l of letture) {
      if (!l.momenti.includes(momento)) continue;
      const lista = l.grandezze.map((g) => ({ g, t: val[`${l.id}|${g.id}`] })).filter((x) => x.t !== undefined && x.t.trim() !== '')
        .map(({ g, t }) => ({ grandezza: g.id, momento, ripetizione: 1, valore: g.tipoValore === 'testo' ? t.trim() : parseNumero(t), ...(g.unita ? { unita: g.unita } : {}), il }));
      if (lista.length) { await prova(() => ses.registra('valore.registrato', l.id, { lista })); n += lista.length; }
    }
    if (n) { avvisa(`${n} valori salvati alle ${soloOra(il)}`); setVal({}); setOraComune(null); }
  };
  return <>
    <h1>Letture contemporanee</h1>
    <p class="piccolo tenue">Gruppo «{gruppo}»: tutte le letture con la stessa ora. Premi «Ora comune» quando inizi il giro dei display, poi scrivi i valori.</p>
    <div class="gruppo-btn">{momenti.map((m) => <button class={`btn pic ${momento === m ? 'sel' : ''}`} onClick={() => setMomento(m)}>{m}</button>)}</div>
    <div class="card">
      <button class="btn pri larga" onClick={() => setOraComune(isoLocale())}>{oraComune ? `Ora comune fissata: ${soloOra(oraComune)} (ripremi per aggiornare)` : 'Ora comune: adesso'}</button>
      {oraComune && (Date.now() - Date.parse(oraComune)) > 120000 && <p class="avviso piccolo">Sono passati più di 2 minuti dall'ora comune: le letture non sono più contemporanee. Aggiorna l'ora.</p>}
    </div>
    {letture.filter((l) => l.momenti.includes(momento)).map((l) => {
      const e = ses.stato.esiti[l.id];
      return <div class="card" key={l.id}>
        <div class="riga"><code><b>{l.id}</b></code><span class="cresce">{l.strumento}</span><Pr p={l.priorita} /></div>
        {l.dove && <p class="piccolo tenue">{l.dove}</p>}
        {l.grandezze.map((g) => {
          const fatto = e?.valori?.find((v) => v.grandezza === g.id && v.momento === momento);
          return <div class="riga" style="margin:4px 0"><span class="cresce piccolo">{g.nome}{g.unita ? ` [${g.unita}]` : ''}{fatto ? <b> — {numIt(fatto.valore)} alle {soloOra(fatto.il)}</b> : null}</span>
            <input style="width:150px" inputMode={g.tipoValore === 'testo' ? undefined : 'decimal'} value={val[`${l.id}|${g.id}`] ?? ''} onInput={(x) => setVal({ ...val, [`${l.id}|${g.id}`]: x.currentTarget.value })} /></div>;
        })}
        {l.controlloCoerenza && momento === 'partenza' && <p class="piccolo atti">{l.controlloCoerenza}</p>}
        <Cattura ses={ses} elementi={[...(l.fotoCollegate ?? []).slice(0, 1), l.id]} area={l.area} tipi={['foto']} />
      </div>;
    })}
    <button class="btn ok larga" onClick={salva}>Salva tutte con l'ora comune</button>
  </>;
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
