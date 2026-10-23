// Acquisizione e visualizzazione delle evidenze (foto, galleria, file, audio, note).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import type { Evidenza, TipoEvidenza } from '../dominio/tipi';
import { leggiExif, ridimensiona } from '../util/immagini';
import { impostazione } from '../archivio/db';
import { avvisa, prova, motivo, chiedi, conferma, messaggio } from './comuni';
import { dataOra } from '../util/base';

const urlCache = new Map<string, string>();
export function useUrlMiniatura(ses: Sessione, id: string) {
  const [u, setU] = useState<string | null>(urlCache.get(ses.istanza.id + id) ?? null);
  useEffect(() => {
    if (u) return;
    let vivo = true;
    ses.miniatura(id).then((b) => {
      if (!b || !vivo) return;
      if (!/^image\//.test(b.type) || /hei[cf]/i.test(b.type)) return;
      const x = URL.createObjectURL(b);
      urlCache.set(ses.istanza.id + id, x);
      setU(x);
    });
    return () => { vivo = false; };
  }, [id]);
  return u;
}

async function gpsDispositivo(): Promise<Evidenza['gps'] | undefined> {
  if (!(await impostazione('gpsDispositivo', false)) || !navigator.geolocation) return undefined;
  return new Promise((r) => navigator.geolocation.getCurrentPosition(
    (p) => r({ lat: p.coords.latitude, lon: p.coords.longitude, accuratezzaM: Math.round(p.coords.accuracy), fonte: 'dispositivo' }),
    () => r(undefined), { timeout: 4000, maximumAge: 60000 },
  ));
}

export async function acquisisciFile(ses: Sessione, f: File | Blob, o: { tipo: TipoEvidenza; fonte: Evidenza['fonte']; elementi: string[]; area?: string; nome?: string; didascalia?: string; figuraBase?: string }) {
  if (ses.stato.consensi?.foto === 'no' && (o.tipo === 'foto' || o.tipo === 'documento')) {
    if (!(await conferma('Consenso alle foto: NO', 'Il committente non ha dato il consenso alle foto. Procedere comunque?', { ok: 'Procedi' }))) return;
  }
  const img = f.type.startsWith('image/');
  const exif = img ? await leggiExif(f) : {};
  const mini = img ? await ridimensiona(f, 480, 0.75) : null;
  const gps = exif.gps ? { ...exif.gps, fonte: 'exif' as const } : img ? await gpsDispositivo() : undefined;
  return prova(() => ses.acquisisci({
    blob: f, tipo: o.tipo, fonte: o.fonte, nomeOriginale: o.nome ?? (f as File).name, elementi: o.elementi, area: o.area,
    didascalia: o.didascalia, gps, dataOriginaleExif: exif.dataOriginale, miniatura: mini, figuraBase: o.figuraBase,
  }));
}

/** Pulsanti di acquisizione per un elemento (o per l'INBOX se elementi è vuoto). */
export function Cattura({ ses, elementi, area, tipi = ['foto', 'galleria', 'file', 'audio', 'nota'], tipoFoto = 'foto' }: {
  ses: Sessione; elementi: string[]; area?: string; tipi?: string[]; tipoFoto?: 'foto' | 'documento';
}) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const fil = useRef<HTMLInputElement>(null);
  const [occupato, setOccupato] = useState(false);
  const [reg, setReg] = useState(false);
  const carica = async (files: FileList | null, fonte: Evidenza['fonte']) => {
    if (!files?.length) return;
    setOccupato(true);
    let n = 0;
    for (const f of Array.from(files)) {
      const tipo: TipoEvidenza = f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('image/') ? tipoFoto : 'documento';
      const r = await acquisisciFile(ses, f, { tipo, fonte, elementi, area });
      if (r) n++;
    }
    setOccupato(false);
    if (n) avvisa(n === 1 ? 'Salvato e verificato' : `${n} file salvati e verificati`);
  };
  return (
    <div class="gruppo-btn" style="margin-top:8px">
      <input ref={cam} type="file" accept="image/*" capture="environment" class="nascosto" onChange={(e) => { carica(e.currentTarget.files, 'fotocamera'); e.currentTarget.value = ''; }} />
      <input ref={gal} type="file" accept="image/*" multiple class="nascosto" onChange={(e) => { carica(e.currentTarget.files, 'galleria'); e.currentTarget.value = ''; }} />
      <input ref={fil} type="file" multiple class="nascosto" onChange={(e) => { carica(e.currentTarget.files, 'file'); e.currentTarget.value = ''; }} />
      {tipi.includes('foto') && <button class="btn pic pri" disabled={occupato} onClick={() => cam.current?.click()}>📷 Scatta</button>}
      {tipi.includes('galleria') && <button class="btn pic" disabled={occupato} onClick={() => gal.current?.click()}>🖼 Galleria</button>}
      {tipi.includes('file') && <button class="btn pic" disabled={occupato} onClick={() => fil.current?.click()}>📄 File</button>}
      {tipi.includes('audio') && <button class="btn pic" disabled={occupato} onClick={() => setReg(true)}>🎙 Audio</button>}
      {tipi.includes('nota') && <button class="btn pic" disabled={occupato} onClick={async () => {
        const r = await chiedi('Nota', [{ id: 't', etichetta: 'Testo (puoi dettare con il microfono della tastiera)', tipo: 'area', obbligatorio: true }]);
        if (r?.t?.trim()) await prova(() => ses.nota(r.t.trim(), elementi, area), 'Nota salvata');
      }}>✎ Nota</button>}
      {occupato && <span class="tenue piccolo">Salvataggio e verifica…</span>}
      {reg && <Registratore onFine={async (b) => { setReg(false); if (b) { setOccupato(true); await acquisisciFile(ses, b, { tipo: 'audio', fonte: 'microfono', elementi, area, nome: `audio.${b.type.includes('mp4') ? 'm4a' : 'webm'}` }); setOccupato(false); avvisa('Audio salvato e verificato'); } }} />}
    </div>
  );
}

function Registratore({ onFine }: { onFine: (b: Blob | null) => void }) {
  const [stato, setStato] = useState<'avvio' | 'reg' | 'errore'>('avvio');
  const [sec, setSec] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const parti = useRef<Blob[]>([]);
  useEffect(() => {
    let flusso: MediaStream | null = null;
    let t: number | undefined;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('non supportato');
        flusso = await navigator.mediaDevices.getUserMedia({ audio: true });
        const tipo = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((x) => MediaRecorder.isTypeSupported?.(x));
        const r = new MediaRecorder(flusso, tipo ? { mimeType: tipo } : undefined);
        r.ondataavailable = (e) => { if (e.data.size) parti.current.push(e.data); };
        r.start(1000);
        rec.current = r;
        setStato('reg');
        t = window.setInterval(() => setSec((s) => s + 1), 1000);
      } catch { setStato('errore'); }
    })();
    return () => { clearInterval(t); flusso?.getTracks().forEach((x) => x.stop()); };
  }, []);
  const ferma = () => {
    const r = rec.current;
    if (!r) return onFine(null);
    r.onstop = () => onFine(new Blob(parti.current, { type: r.mimeType || 'audio/webm' }));
    r.stop();
  };
  return (
    <div class="modale-sfondo"><div class="modale">
      <h2>Registrazione audio</h2>
      {stato === 'errore' ? <>
        <p class="errore">Microfono non disponibile. Registra con l'app Registratore del telefono e allega il file con «📄 File».</p>
        <button class="btn" onClick={() => onFine(null)}>Chiudi</button>
      </> : <>
        <p style="font-size:32px;text-align:center">● {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}</p>
        <p class="tenue piccolo">Registra solo con il consenso dei presenti.</p>
        <div class="riga"><button class="btn per" onClick={() => { rec.current?.stop(); onFine(null); }}>Scarta</button><button class="btn ok cresce" disabled={stato !== 'reg'} onClick={ferma}>■ Ferma e salva</button></div>
      </>}
    </div></div>
  );
}

export function Miniature({ ses, ids, mostraAnnullate = true }: { ses: Sessione; ids?: string[]; mostraAnnullate?: boolean }) {
  const lista = (ids ?? []).map((id) => ses.stato.evidenze[id]).filter((e) => e && (mostraAnnullate || !e.annullata));
  const [aperta, setAperta] = useState<string | null>(null);
  if (!lista.length) return null;
  return (
    <>
      <div class="mini">{lista.map((e) => <Mini key={e.id} ses={ses} e={e} onApri={() => setAperta(e.id)} />)}</div>
      {aperta && <Visore ses={ses} id={aperta} onChiudi={() => setAperta(null)} />}
    </>
  );
}

function Mini({ ses, e, onApri }: { ses: Sessione; e: Evidenza; onApri: () => void }) {
  const u = useUrlMiniatura(ses, e.id);
  const et = e.tipo === 'nota' ? '✎ nota' : e.tipo === 'audio' ? '🎙 audio' : e.tipo === 'documento' && !u ? '📄 doc' : e.tipo;
  return (
    <button class={`m ${e.annullata ? 'ann' : ''}`} style="background:none;border:0;padding:0;text-align:left" onClick={onApri}>
      {u ? <img src={u} alt="" /> : <div class="ph">{et}</div>}
      <small>{e.file ? e.file.split('_').slice(-2).join('_') : e.testo?.slice(0, 20)}</small>
    </button>
  );
}

export function Visore({ ses, id, onChiudi }: { ses: Sessione; id: string; onChiudi: () => void }) {
  const e = ses.stato.evidenze[id];
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    ses.blobEvidenza(id).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (!e) return null;
  return (
    <div class="modale-sfondo" onClick={(x) => { if (x.target === x.currentTarget) onChiudi(); }}>
      <div class="modale">
        <div class="riga"><h2 class="cresce" style="margin:0">{e.tipo} {e.progressivo}</h2><button class="btn pic" onClick={onChiudi}>Chiudi</button></div>
        {e.annullata && <p class="avviso">Annullata il {dataOra(e.annullata.il)}: {e.annullata.motivo}. Resta nel pacchetto.</p>}
        {url && e.tipo !== 'audio' && e.mime?.startsWith('image/') && <img src={url} style="width:100%;border-radius:8px;margin:8px 0" alt="" />}
        {url && e.tipo === 'audio' && <audio src={url} controls style="width:100%;margin:8px 0" />}
        {url && e.mime === 'application/pdf' && <a class="btn" href={url} target="_blank" rel="noopener">Apri il PDF</a>}
        {e.tipo === 'nota' && <p style="white-space:pre-wrap" class="atti">{e.testo}</p>}
        <p class="piccolo tenue">{e.file}<br />Acquisita {dataOra(e.acquisitaIl)}{e.dataOriginaleExif ? ` · scatto ${e.dataOriginaleExif.replace('T', ' ')}` : ''}{e.gps ? ` · GPS ${e.gps.lat.toFixed(5)}, ${e.gps.lon.toFixed(5)} (${e.gps.fonte})` : ''}<br />Codici: {e.elementi.join(', ') || 'INBOX'}{e.sha256 ? <><br />SHA-256 {e.sha256}</> : null}</p>
        <div class="gruppo-btn">
          <button class="btn pic" onClick={async () => {
            const r = await chiedi('Didascalia', [{ id: 'd', etichetta: 'Didascalia', tipo: 'area', valore: e.didascalia ?? '' }]);
            if (r) await prova(() => ses.registra('evidenza.aggiornata', null, { id, didascalia: r.d.trim() }), 'Didascalia salvata');
          }}>Didascalia</button>
          <button class="btn pic" onClick={async () => {
            const r = await chiedi('Collega a codici', [{ id: 'c', etichetta: 'Codici separati da virgola (vuoto = INBOX)', valore: e.elementi.join(', ') }]);
            if (!r) return;
            const nuovi = r.c.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
            const sconosciuti = nuovi.filter((c) => !ses.struttura.elementi.some((x) => x.id === c) && !ses.struttura.elementi.some((x) => x.tipo === 'tabella' && x.righe?.some((rr) => rr.id === c)));
            if (sconosciuti.length && !(await conferma('Codici non presenti nella struttura', sconosciuti.join(', ') + '\nCollegare comunque?'))) return;
            await prova(() => ses.registra('evidenza.aggiornata', null, { id, elementi: nuovi }), 'Collegamenti aggiornati');
          }}>Collega</button>
          <button class="btn pic" onClick={() => prova(() => ses.registra('evidenza.aggiornata', null, { id, riservata: !e.riservata }), e.riservata ? 'Non più riservata' : 'Marcata riservata')}>{e.riservata ? 'Riservata ✓' : 'Riservata'}</button>
          {!e.annullata && <button class="btn pic per" onClick={async () => {
            const m = await motivo('Annulla evidenza', 'L\'evidenza non si cancella: resta nel pacchetto marcata come annullata.');
            if (m) { await prova(() => ses.registra('evidenza.annullata', null, { id, motivo: m }), 'Annullata'); onChiudi(); }
          }}>Annulla</button>}
          {url && <a class="btn pic" href={url} download={e.file?.split('/').pop()}>Scarica</a>}
        </div>
      </div>
    </div>
  );
}

export async function consegnaFile(nome: string, blob: Blob, titolo: string): Promise<boolean> {
  const file = new File([blob], nome, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: titolo });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
  const android = /Android/i.test(navigator.userAgent);
  await messaggio('File pronto', `«${nome}» è stato salvato nei download del dispositivo.\n\n${android
    ? 'Dove trovarlo: app «File» (o «I miei file») → cartella Download.\nPer metterlo su OneDrive: app OneDrive → cartella della pratica → «+» → Carica → Download → il file.'
    : 'Dove trovarlo: app «File» → Download (oppure la cartella download del browser).\nPoi spostalo nella cartella OneDrive della pratica.'}`);
  return true;
}
