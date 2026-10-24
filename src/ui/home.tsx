// Home: elenco dei sopralluoghi sul dispositivo, importazione, ripristino, impostazioni, informazioni.
import { useEffect, useRef, useState } from 'preact/hooks';
import { db, impostazione, salvaImpostazione, type RecIstanza } from '../archivio/db';
import { analizzaAndata, creaSopralluogo, ErroreImport, type AnalisiAndata } from '../pacchetti/andata';
import { analizzaRipristino, eseguiRipristino, type AnalisiRipristino } from '../pacchetti/ripristino';
import { vai, prova, conferma, chiedi, avvisa, Card, chiudiSessione } from './comuni';
import { dataIt, dataOra, sha256 } from '../util/base';
import { VERSIONE_APP, BUILD_APP } from '../pacchetti/rientro';
import { contaModificheNonEsportate } from '../dominio/completezza';
import { situazione, eliminaSopralluogo, ripartiDaAndata } from '../archivio/gestione';

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
    <div class="barra"><div class="tit"><b>Sopralluoghi</b><small>MC Studio · v{VERSIONE_APP}</small></div><button onClick={() => vai('impostazioni')} aria-label="Impostazioni">⚙</button></div>
    <div class="contenuto">
      <StatoDispositivo />
      <input ref={inImp} type="file" accept=".zip,.json,application/zip,application/json" class="nascosto" onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) importa(f); }} />
      <input ref={inRip} type="file" accept=".zip,application/zip" multiple class="nascosto" onChange={(e) => { const f = e.currentTarget.files; if (f?.length) ripristina(f); e.currentTarget.value = ''; }} />
      {occupato && <p class="tenue">{occupato}</p>}
      {errore && <div class="errore"><b>{errore.msg}</b>{errore.dettagli.length > 0 && <ul class="piccolo">{errore.dettagli.slice(0, 30).map((d) => <li>{d}</li>)}</ul>}</div>}
      {istanze === null ? <p class="tenue">…</p> : !istanze.length ? <div class="card evidente">
        <h2 style="margin-top:0">Nessun sopralluogo</h2>
        <p class="piccolo">Carica lo ZIP di andata preparato nel progetto della pratica (SOPRALLUOGO_…_ANDATA_….zip).</p>
        <button class="btn pri larga grande" onClick={() => inImp.current?.click()}>Carica una pratica (ZIP)</button>
      </div> : (() => {
        const oggi = new Date().toISOString().slice(0, 10);
        const pross = istanze.find((i) => i.statoSopralluogo === 'inCorso')
          ?? [...istanze].filter((i) => i.statoSopralluogo === 'preparazione' && i.data >= oggi).sort((x, y) => x.data.localeCompare(y.data))[0]
          ?? istanze[0];
        const altri = istanze.filter((i) => i !== pross);
        return <>
          <div class="card evidente">
            <div class="et-sez">{pross.statoSopralluogo === 'inCorso' ? 'In corso' : pross.statoSopralluogo === 'chiuso' ? 'Ultimo' : 'Prossimo'}</div>
            <h2 style="margin:4px 0 2px">{pross.codicePratica} · {pross.committente}</h2>
            <p class="piccolo tenue" style="margin:0 0 12px">{pross.sito} · {dataIt(pross.data)} · {pross.revisione}{pross.nonEsp ? <span style="color:var(--avviso);font-weight:600"> · da salvare</span> : null}</p>
            <a class="btn pri larga grande" href={`#/s/${pross.id}`}>{pross.statoSopralluogo === 'inCorso' ? 'Continua il sopralluogo' : pross.statoSopralluogo === 'chiuso' ? 'Apri' : 'Apri e prepara'}</a>
            <Gestisci i={pross} ricarica={ricarica} />
          </div>
          {altri.length > 0 && <><div class="gruppo-tit">Altri sopralluoghi</div>
            <div class="card" style="padding:0">{altri.map((i) => <div class="voce-lista" style="display:block">
              <a href={`#/s/${i.id}`} style="color:inherit;text-decoration:none;display:block">
                <div class="riga" style="flex-wrap:nowrap"><b class="cresce ellissi">{i.codicePratica} · {i.committente}</b><span class="piccolo tenue">{i.statoSopralluogo === 'inCorso' ? 'in corso' : i.statoSopralluogo === 'chiuso' ? 'chiuso' : dataIt(i.data)}</span></div>
                <div class="piccolo tenue">{i.sito} · {i.revisione}{i.nonEsp ? <span style="color:var(--avviso)"> · da salvare</span> : null}</div>
              </a>
              <Gestisci i={i} ricarica={ricarica} />
            </div>)}</div></>}
          <button class="btn larga" style="margin-top:14px" onClick={() => inImp.current?.click()}>+ Carica una pratica (ZIP)</button>
        </>;
      })()}
      <button class="btn pic" style="margin-top:10px" onClick={() => inRip.current?.click()}>Ripristina da copie salvate…</button>
      <p class="piccolo tenue" style="margin-top:20px">I dati restano solo su questo dispositivo finché non li esporti. L'app non invia nulla in rete. <a href="#/informazioni">Informazioni e privacy</a></p>
    </div>
  </div>;
}

function Gestisci({ i, ricarica }: { i: RecIstanza; ricarica: () => void }) {
  return <details class="gestisci"><summary>Ricomincia o elimina</summary>
    <div class="riga" style="margin-top:6px">
      <button class="btn pic" onClick={async () => { const n = await chiediRipartenza(i); if (n) vai('s', n); }}>Ricomincia da zero</button>
      <button class="btn pic per" onClick={async () => { if (await chiediEliminazione(i)) ricarica(); }}>Elimina</button>
    </div>
  </details>;
}

export async function chiediEliminazione(i: RecIstanza): Promise<boolean> {
  const s = await situazione(i.id);
  const perdite: string[] = [];
  if (s.nonEsportate) perdite.push(`${s.nonEsportate} modifiche non esportate`);
  if (s.evidenzeNonEsportate) perdite.push(`${s.evidenzeNonEsportate} foto/file non esportati`);
  const rischio = perdite.length > 0 && s.avviato;
  const testo = rischio
    ? `ATTENZIONE: su questo dispositivo ci sono ${perdite.join(' e ')}. Se elimini, quel lavoro è perso per sempre (resta solo ciò che hai già salvato con le copie).\n\nSe vuoi tenerlo, annulla e fai prima Menu › Salva copia.`
    : s.finaleEsportato
      ? 'Il pacchetto finale è stato esportato e confermato. Il sopralluogo sparisce da questo dispositivo; resta ciò che hai salvato.'
      : 'Il sopralluogo sparisce da questo dispositivo. Lo ZIP di andata resta dove l\'hai salvato e puoi reimportarlo quando vuoi.';
  const r = await chiedi(rischio ? 'Eliminare e perdere i dati?' : 'Elimina dal dispositivo',
    [{ id: 'c', etichetta: `Per confermare scrivi il codice pratica «${i.codicePratica}»`, obbligatorio: true }],
    { testo: testo + '\n\nOperazione irreversibile.', ok: 'Elimina definitivamente' });
  if (!r) return false;
  if (r.c.trim() !== i.codicePratica) { avvisa('Codice non corrispondente: nulla eliminato', true); return false; }
  const ok = await prova(async () => { await eliminaSopralluogo(i.id); return true; }, 'Sopralluogo eliminato dal dispositivo');
  if (ok) chiudiSessione();
  return ok === true;
}

export async function chiediRipartenza(i: RecIstanza): Promise<string | null> {
  const s = await situazione(i.id);
  const scelta = await chiedi('Ricomincia dallo ZIP di andata', [{
    id: 'v', etichetta: 'Il sopralluogo attuale', tipo: 'scelta',
    scelte: ['Tienilo (crea un secondo sopralluogo vuoto)', 'Eliminalo dopo aver creato quello nuovo'],
    valore: 'Tienilo (crea un secondo sopralluogo vuoto)',
  }], {
    testo: `Si crea un nuovo sopralluogo vuoto dalla stessa struttura (${i.revisione}), con figure e PDF di campo. Non serve riscegliere il file.`
      + (s.avviato && (s.nonEsportate || s.evidenzeNonEsportate) ? `\n\nAttenzione: l'attuale ha ${s.nonEsportate} modifiche e ${s.evidenzeNonEsportate} file non esportati.` : ''),
    ok: 'Ricomincia',
  });
  if (!scelta) return null;
  const nuovo = await prova(() => ripartiDaAndata(i.id), 'Nuovo sopralluogo creato');
  if (!nuovo) return null;
  if (scelta.v.startsWith('Eliminalo')) {
    const eliminato = await chiediEliminazione(i);
    if (!eliminato) avvisa('Il sopralluogo precedente è stato mantenuto');
  }
  return nuovo;
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
      <Card titolo="Aggiornamenti">
        <p class="piccolo">Versione installata: <b>{VERSIONE_APP}</b> · build {BUILD_APP} UTC</p>
        <button class="btn pic" onClick={async () => {
          await (window as unknown as { cercaAggiornamenti?: () => Promise<void> }).cercaAggiornamenti?.();
          avvisa('Controllo eseguito: se c\'è una versione nuova compare il pulsante «Aggiorna ora» in alto');
        }}>Cerca aggiornamenti</button>
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
