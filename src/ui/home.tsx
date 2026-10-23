// Home: elenco dei sopralluoghi sul dispositivo, importazione, ripristino, impostazioni, informazioni.
import { useEffect, useRef, useState } from 'preact/hooks';
import { db, impostazione, salvaImpostazione, type RecIstanza } from '../archivio/db';
import { analizzaAndata, creaSopralluogo, ErroreImport, type AnalisiAndata } from '../pacchetti/andata';
import { analizzaRipristino, eseguiRipristino, type AnalisiRipristino } from '../pacchetti/ripristino';
import { vai, prova, conferma, chiedi, messaggio, avvisa, Card, chiudiSessione } from './comuni';
import { dataIt, dataOra, sha256 } from '../util/base';
import { VERSIONE_APP } from '../pacchetti/rientro';
import { contaModificheNonEsportate } from '../dominio/completezza';

function useIstanze() {
  const [l, setL] = useState<(RecIstanza & { nonEsp: number })[] | null>(null);
  const ricarica = async () => {
    const ist = await db().istanze.orderBy('creatoIl').reverse().toArray();
    const out = [];
    for (const i of ist) {
      const s = await db().stati.get(i.id);
      out.push({ ...i, nonEsp: s ? contaModificheNonEsportate(i.aSeq, s.stato) : 0 });
    }
    setL(out);
  };
  useEffect(() => { ricarica(); }, []);
  return [l, ricarica] as const;
}

export function Home() {
  const [istanze, ricarica] = useIstanze();
  const [analisi, setAnalisi] = useState<AnalisiAndata | null>(null);
  const [rip, setRip] = useState<AnalisiRipristino | null>(null);
  const [errore, setErrore] = useState<{ msg: string; dettagli: string[] } | null>(null);
  const [occupato, setOccupato] = useState('');
  const inImp = useRef<HTMLInputElement>(null);
  const inRip = useRef<HTMLInputElement>(null);
  useEffect(() => { chiudiSessione(); }, []);

  const importa = async (f: File) => {
    setErrore(null); setOccupato('Verifica del pacchetto…');
    try { setAnalisi(await analizzaAndata(f, f.name)); }
    catch (e) { setErrore({ msg: (e as Error).message, dettagli: e instanceof ErroreImport ? e.dettagli : [] }); }
    finally { setOccupato(''); }
  };
  const ripristina = async (files: FileList) => {
    setErrore(null); setOccupato('Verifica dei pacchetti…');
    try { setRip(await analizzaRipristino(Array.from(files).map((f) => ({ nome: f.name, blob: f })))); }
    catch (e) { setErrore({ msg: (e as Error).message, dettagli: e instanceof ErroreImport ? e.dettagli : [] }); }
    finally { setOccupato(''); }
  };

  if (analisi) return <AnteprimaImport a={analisi} onAnnulla={() => setAnalisi(null)} />;
  if (rip) return <AnteprimaRipristino a={rip} onAnnulla={() => setRip(null)} />;

  return <div class="app">
    <div class="barra"><div class="tit"><b>Sopralluogo MC Studio</b><small>v{VERSIONE_APP}</small></div><button onClick={() => vai('impostazioni')}>⚙</button></div>
    <div class="contenuto">
      <StatoDispositivo />
      <input ref={inImp} type="file" accept=".zip,.json,application/zip,application/json" class="nascosto" onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) importa(f); }} />
      <input ref={inRip} type="file" accept=".zip,application/zip" multiple class="nascosto" onChange={(e) => { const f = e.currentTarget.files; if (f?.length) ripristina(f); e.currentTarget.value = ''; }} />
      <div class="griglia2">
        <button class="btn pri" onClick={() => inImp.current?.click()}>Importa pacchetto di andata</button>
        <button class="btn" onClick={() => inRip.current?.click()}>Ripristina da pacchetti di rientro</button>
      </div>
      {occupato && <p class="tenue">{occupato}</p>}
      {errore && <div class="errore"><b>{errore.msg}</b>{errore.dettagli.length > 0 && <ul class="piccolo">{errore.dettagli.slice(0, 30).map((d) => <li>{d}</li>)}</ul>}</div>}
      <h2>Sopralluoghi su questo dispositivo</h2>
      {istanze === null ? <p class="tenue">…</p> : !istanze.length ? <p class="tenue">Nessuno. Importa il pacchetto di andata generato nel progetto della pratica (SOPRALLUOGO_…_ANDATA_….zip).</p> : (
        <div class="card" style="padding:0">{istanze.map((i) => <div class="voce-lista" style="display:block">
          <a href={`#/s/${i.id}`} style="color:inherit;text-decoration:none;display:block">
            <div class="riga"><b class="cresce">{i.codicePratica} · {i.committente}</b><span class={`badge ${i.statoSopralluogo === 'chiuso' ? 'completo' : i.statoSopralluogo === 'inCorso' ? 'parziale' : 'aperto'}`}>{i.statoSopralluogo === 'inCorso' ? 'in corso' : i.statoSopralluogo}</span></div>
            <div class="piccolo tenue">{i.sito} · {dataIt(i.data)} · {i.revisione}{i.origine?.startsWith('ripristino') ? ' · ripristinato' : ''}</div>
            <div class="piccolo">{i.nonEsp ? <span style="color:var(--avviso)">{i.nonEsp} modifiche non esportate</span> : <span class="tenue">tutto esportato</span>}{i.archiviata ? ' · archiviato' : ''}</div>
          </a>
          <div class="riga" style="margin-top:6px;justify-content:flex-end">
            <button class="btn pic per" onClick={() => elimina(i, ricarica)}>Elimina dal dispositivo</button>
          </div>
        </div>)}</div>
      )}
      <p class="piccolo tenue" style="margin-top:20px">I dati restano solo su questo dispositivo finché non li esporti. L'app non invia nulla in rete. <a href="#/informazioni">Informazioni e privacy</a></p>
    </div>
  </div>;
}

async function elimina(i: RecIstanza & { nonEsp: number }, ricarica: () => void) {
  const s = await db().stati.get(i.id);
  const finale = s?.stato.checkpoint.esportati.some((x) => x.tipo === 'finale') && i.nonEsp === 0;
  if (!finale) {
    await messaggio('Non eliminabile', 'Si può eliminare solo un sopralluogo chiuso, esportato con il pacchetto finale e senza modifiche successive non esportate.');
    return;
  }
  const r = await chiedi('Elimina dal dispositivo', [{ id: 'c', etichetta: `Per confermare scrivi il codice pratica «${i.codicePratica}»`, obbligatorio: true }],
    { testo: 'Il sopralluogo sparisce da questo dispositivo. Resta solo ciò che hai salvato su OneDrive (pacchetto finale). Operazione irreversibile.', ok: 'Elimina' });
  if (!r || r.c.trim() !== i.codicePratica) { if (r) avvisa('Codice non corrispondente: nulla eliminato', true); return; }
  const d = db();
  await prova(() => d.transaction('rw', [d.istanze, d.strutture, d.figure, d.campo, d.eventi, d.stati, d.blob, d.miniature], async () => {
    for (const t of [d.figure, d.eventi, d.blob, d.miniature]) await (t as typeof d.blob).where('istanza').equals(i.id).delete();
    await d.strutture.delete(i.id); await d.campo.delete(i.id); await d.stati.delete(i.id); await d.istanze.delete(i.id);
  }), 'Eliminato dal dispositivo');
  ricarica();
}

function StatoDispositivo() {
  const [info, setInfo] = useState<{ persist?: boolean; uso?: number; quota?: number }>({});
  const installata = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  useEffect(() => {
    (async () => {
      let persist: boolean | undefined;
      try { persist = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()); } catch { /* */ }
      const e = await navigator.storage?.estimate?.().catch(() => undefined);
      setInfo({ persist, uso: e?.usage, quota: e?.quota });
    })();
  }, []);
  const mb = (x?: number) => (x ? Math.round(x / 1048576) : 0);
  const pieno = info.quota ? (info.uso ?? 0) / info.quota : 0;
  return <>
    {!installata && <div class="avviso"><b>Installa l'app</b> prima di usarla in campo: così funziona senza rete e i dati sono protetti dalla pulizia automatica del browser.<br />
      <small>iPhone: Safari → Condividi → «Aggiungi alla schermata Home». Android: Chrome → menu ⋮ → «Installa app».</small></div>}
    <div class="riga piccolo tenue" style="margin-bottom:10px">
      <span>Archiviazione persistente: <b style={info.persist ? 'color:var(--ok)' : 'color:var(--avviso)'}>{info.persist ? 'sì' : 'no'}</b></span>
      <span>Spazio usato: {mb(info.uso)} MB di {mb(info.quota)} MB</span>
    </div>
    {pieno > 0.8 && <div class={pieno > 0.9 ? 'errore' : 'avviso'}>Spazio quasi esaurito ({Math.round(pieno * 100)}%). Esporta e elimina i sopralluoghi già archiviati.</div>}
  </>;
}

function AnteprimaImport({ a, onAnnulla }: { a: AnalisiAndata; onAnnulla: () => void }) {
  const s = a.struttura;
  const conta: Record<string, number> = {};
  for (const e of s.elementi) conta[e.tipo] = (conta[e.tipo] ?? 0) + 1;
  const nA = s.elementi.filter((e) => e.priorita === 'A').length;
  return <div class="app"><div class="barra"><button onClick={onAnnulla}>←</button><div class="tit"><b>Importa</b><small>{a.nomePacchetto}</small></div></div>
    <div class="contenuto">
      <div class="okbox">Pacchetto integro e struttura valida.</div>
      <Card titolo={`Pratica ${s.pratica.codice}`}>
        <p><b>{s.pratica.titolo}</b><br />{s.pratica.committente.ragioneSociale}<br />{[s.pratica.sito.denominazione, s.pratica.sito.indirizzo].filter(Boolean).join(', ')}<br />
          {dataIt(s.pratica.data)}{s.pratica.dalle ? ` dalle ${s.pratica.dalle}` : ''} · {s.generazione.revisione}</p>
        <p class="piccolo">{s.aree.length} aree · {Object.entries(conta).map(([k, v]) => `${k} ${v}`).join(' · ')} · priorità A: {nA} · figure: {a.figure.size}{a.campo ? ' · PDF di campo incluso' : ''}</p>
      </Card>
      {a.avvisi.length > 0 && <div class="avviso"><b>Avvisi</b><ul class="piccolo">{a.avvisi.map((x) => <li>{x}</li>)}</ul></div>}
      {a.esistenti.length > 0 && <div class="avviso">Su questo dispositivo c'è già un sopralluogo della stessa pratica e data:
        <ul class="piccolo">{a.esistenti.map((i) => <li><a href={`#/s/${i.id}`}>{i.revisione}{i.idStruttura === s.idStruttura ? ' (stessa revisione)' : ' (revisione diversa)'} — creato {dataOra(i.creatoIl)}</a></li>)}</ul>
        Importando se ne crea uno <b>nuovo</b>: quello esistente non viene toccato.</div>}
      <button class="btn pri larga" onClick={async () => {
        if (a.esistenti.some((i) => i.idStruttura === s.idStruttura) && !(await conferma('Stessa revisione già presente', 'Creare comunque un secondo sopralluogo separato?'))) return;
        const id = await prova(() => creaSopralluogo(a), 'Sopralluogo importato');
        if (id) vai('s', id);
      }}>Crea il sopralluogo</button>
    </div></div>;
}

function AnteprimaRipristino({ a, onAnnulla }: { a: AnalisiRipristino; onAnnulla: () => void }) {
  const m = a.manifest;
  return <div class="app"><div class="barra"><button onClick={onAnnulla}>←</button><div class="tit"><b>Ripristina</b><small>{a.nomi.length} file</small></div></div>
    <div class="contenuto">
      <div class="okbox">Pacchetti integri: impronte, sigillo e catena del registro verificati.</div>
      <Card titolo={`Pratica ${a.struttura.pratica.codice}`}>
        <p>{a.struttura.pratica.committente.ragioneSociale} · {dataIt(a.struttura.pratica.data)} · {a.struttura.generazione.revisione}</p>
        <p class="piccolo">Registro: {a.righe.length} eventi · evidenze: {a.evidenze.length} · stato: {m.stato.statoSopralluogo} · pacchetto più recente del {dataOra(m.creatoIl)} ({m.tipoPacchetto})</p>
      </Card>
      {a.avvisi.length > 0 && <div class="avviso"><ul class="piccolo">{a.avvisi.map((x) => <li>{x}</li>)}</ul></div>}
      <p class="piccolo">Il ripristino crea un <b>nuovo</b> sopralluogo su questo dispositivo, che prosegue il registro dall'ultimo evento salvato.</p>
      <button class="btn pri larga" onClick={async () => {
        const id = await prova(() => eseguiRipristino(a), 'Ripristino completato');
        if (id) vai('s', id);
      }}>Ripristina</button>
    </div></div>;
}

export function Impostazioni() {
  const [v, setV] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    (async () => setV({
      sogliaVolumiMB: await impostazione('sogliaVolumiMB', 400), promemoriaMinuti: await impostazione('promemoriaMinuti', 45),
      gpsDispositivo: await impostazione('gpsDispositivo', false), fotoPerPagina: await impostazione('fotoPerPagina', 2),
      intestazione: await impostazione('intestazione', 'MC Studio Architettura e Design S.r.l.'), tema: await impostazione('tema', 'auto'),
      pinHash: await impostazione('pinHash', ''), pinMinuti: await impostazione('pinMinuti', 5),
    }))();
  }, []);
  if (!v) return null;
  const set = async (k: string, x: unknown) => { await salvaImpostazione(k, x); setV({ ...v, [k]: x }); if (k === 'tema') applicaTema(String(x)); };
  return <div class="app"><div class="barra"><button onClick={() => vai('')}>←</button><div class="tit"><b>Impostazioni</b></div></div>
    <div class="contenuto">
      <Card titolo="Esportazione">
        <label class="campo"><span>Dimensione massima di un volume (MB)</span><select value={String(v.sogliaVolumiMB)} onChange={(e) => set('sogliaVolumiMB', Number(e.currentTarget.value))}>{[150, 250, 400, 800].map((n) => <option value={n}>{n}</option>)}</select></label>
        <label class="campo"><span>Promemoria checkpoint dopo (minuti)</span><select value={String(v.promemoriaMinuti)} onChange={(e) => set('promemoriaMinuti', Number(e.currentTarget.value))}>{[20, 30, 45, 60, 90].map((n) => <option value={n}>{n}</option>)}</select></label>
      </Card>
      <Card titolo="Report">
        <label class="campo"><span>Intestazione</span><input value={String(v.intestazione)} onBlur={(e) => set('intestazione', e.currentTarget.value)} /></label>
        <label class="campo"><span>Foto per pagina nel fascicolo</span><select value={String(v.fotoPerPagina)} onChange={(e) => set('fotoPerPagina', Number(e.currentTarget.value))}>{[1, 2, 4].map((n) => <option value={n}>{n}</option>)}</select></label>
      </Card>
      <Card titolo="Dispositivo">
        <label class="riga"><input type="checkbox" style="width:24px;height:24px" checked={!!v.gpsDispositivo} onChange={(e) => set('gpsDispositivo', e.currentTarget.checked)} /><span>Registra la posizione GPS del telefono con le foto (se la foto non la contiene già)</span></label>
        <label class="campo"><span>Aspetto</span><select value={String(v.tema)} onChange={(e) => set('tema', e.currentTarget.value)}><option value="auto">Automatico</option><option value="chiaro">Chiaro</option><option value="contrasto">Alto contrasto (sole)</option></select></label>
      </Card>
      <Card titolo="Blocco con PIN">
        <p class="piccolo">Chiede un PIN all'apertura e dopo un periodo in background. Si aggiunge al blocco del telefono.</p>
        <div class="gruppo-btn">
          <button class="btn pic" onClick={async () => {
            const r = await chiedi('Imposta PIN', [{ id: 'p', etichetta: 'PIN (almeno 4 cifre)', tipo: 'password', obbligatorio: true }, { id: 'q', etichetta: 'Ripeti', tipo: 'password', obbligatorio: true }]);
            if (!r) return;
            if (r.p !== r.q || r.p.length < 4) return avvisa('PIN non valido o diverso', true);
            await set('pinHash', await sha256('mcstudio-pin:' + r.p));
            avvisa('PIN impostato');
          }}>{v.pinHash ? 'Cambia PIN' : 'Imposta PIN'}</button>
          {!!v.pinHash && <button class="btn pic" onClick={() => set('pinHash', '')}>Disattiva PIN</button>}
          <select style="width:auto" value={String(v.pinMinuti)} onChange={(e) => set('pinMinuti', Number(e.currentTarget.value))}>{[1, 5, 15, 30].map((n) => <option value={n}>blocco dopo {n} min</option>)}</select>
        </div>
      </Card>
      <a class="btn larga" href="#/informazioni">Informazioni e privacy</a>
    </div></div>;
}

export function applicaTema(t: string) {
  const r = document.documentElement;
  r.classList.toggle('chiaro', t === 'chiaro');
  r.classList.toggle('contrasto', t === 'contrasto');
}

export function Informazioni() {
  return <div class="app"><div class="barra"><button onClick={() => history.back()}>←</button><div class="tit"><b>Informazioni e privacy</b></div></div>
    <div class="contenuto">
      <Card titolo="Che cos'è">
        <p>App di sopralluogo di MC Studio Architettura e Design S.r.l. (v{VERSIONE_APP}). Importa la struttura del sopralluogo generata nel progetto della pratica, registra in campo esiti, foto, audio, documenti e firme, ed esporta pacchetti sigillati.</p>
      </Card>
      <Card titolo="Dove stanno i dati">
        <ul>
          <li>Solo in questo dispositivo (archivio del browser/app), finché non li esporti.</li>
          <li>L'app non invia dati in rete: nessun server, nessuna analitica, nessun servizio esterno. Il sito che la distribuisce contiene solo il programma.</li>
          <li>L'esportazione crea file ZIP che salvi tu (OneDrive, File): contengono struttura, registro, foto e documenti originali, report e impronte SHA-256.</li>
          <li>La posizione GPS del telefono si registra solo se attivata nelle impostazioni. I consensi a foto e audio si registrano per ogni sopralluogo.</li>
          <li>Per cancellare: «Elimina dal dispositivo» (dopo l'export finale) oppure rimuovere l'app.</li>
        </ul>
      </Card>
      <Card titolo="Integrità">
        <p class="piccolo">Ogni file acquisito riceve un'impronta SHA-256 al momento dell'acquisizione e non viene mai modificato. Ogni operazione è un evento in un registro concatenato: ciascun evento contiene l'impronta del precedente. Il pacchetto finale ha un sigillo. La firma del verbale è una firma elettronica semplice.</p>
      </Card>
    </div></div>;
}
