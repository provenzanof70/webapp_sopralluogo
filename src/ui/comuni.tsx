// Componenti e servizi comuni dell'interfaccia: router a hash, sessione corrente, finestre modali, avvisi.
import { useEffect, useState, useCallback } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import { Sessione } from '../archivio/sessione';
import type { StatoVoce } from '../dominio/completezza';
import type { Priorita } from '../dominio/tipi';

// ------------------------------------------------------------------ router
export function useHash(): string[] {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}
export function vai(...parti: string[]) { location.hash = '#/' + parti.map(encodeURIComponent).join('/'); }

// ------------------------------------------------------------------ sessione
let corrente: Sessione | null = null;
export async function sessione(id: string): Promise<Sessione> {
  if (corrente?.istanza.id === id) return corrente;
  corrente = await Sessione.apri(id);
  return corrente;
}
export function chiudiSessione() { corrente = null; }
export function useSessione(id: string | undefined): Sessione | null {
  const [s, setS] = useState<Sessione | null>(corrente?.istanza.id === id ? corrente : null);
  const [, setV] = useState(0);
  useEffect(() => {
    if (!id) return;
    let via: (() => void) | undefined;
    let vivo = true;
    sessione(id).then((x) => {
      if (!vivo) return;
      setS(x);
      via = x.ascolta(() => setV((v) => v + 1));
    }).catch((e) => avvisa(String(e.message ?? e), true));
    return () => { vivo = false; via?.(); };
  }, [id]);
  return s;
}

// ------------------------------------------------------------------ avvisi (toast)
type Toast = { testo: string; errore: boolean; id: number };
let ascoltaToast: ((t: Toast | null) => void) | null = null;
let nToast = 0;
export function avvisa(testo: string, errore = false) {
  const t = { testo, errore, id: ++nToast };
  ascoltaToast?.(t);
  setTimeout(() => { if (nToast === t.id) ascoltaToast?.(null); }, errore ? 9000 : 2600);
}
export function OspiteToast() {
  const [t, setT] = useState<Toast | null>(null);
  useEffect(() => { ascoltaToast = setT; return () => { ascoltaToast = null; }; }, []);
  if (!t) return null;
  return <div class={`toast ${t.errore ? 'err' : ''}`} role="status" onClick={() => setT(null)}>{t.testo}</div>;
}

/** Esegue un'azione di scrittura e mostra l'errore in modo esplicito. */
export async function prova<T>(f: () => Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await f();
    if (ok) avvisa(ok);
    return r;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await messaggio('Operazione non riuscita', `${m}\n\nIl dato NON è stato salvato. Riprova; se si ripete, esporta un checkpoint.`);
    return undefined;
  }
}

// ------------------------------------------------------------------ finestre modali
type Campo = { id: string; etichetta: string; tipo?: 'testo' | 'area' | 'data' | 'numero' | 'password' | 'scelta'; valore?: string; scelte?: string[]; obbligatorio?: boolean; aiuto?: string };
type Richiesta = { titolo: string; testo?: string; campi?: Campo[]; ok?: string; annulla?: string | null; pericolo?: boolean; risolvi: (v: Record<string, string> | null) => void };
let ascoltaModale: ((r: Richiesta | null) => void) | null = null;
const codaModali: Richiesta[] = [];
function mostra(r: Richiesta) { codaModali.push(r); if (codaModali.length === 1) ascoltaModale?.(r); }
function avanti() { codaModali.shift(); ascoltaModale?.(codaModali[0] ?? null); }

export function chiedi(titolo: string, campi: Campo[], o: { testo?: string; ok?: string } = {}): Promise<Record<string, string> | null> {
  return new Promise((risolvi) => mostra({ titolo, campi, testo: o.testo, ok: o.ok ?? 'Conferma', risolvi }));
}
export function conferma(titolo: string, testo?: string, o: { ok?: string; pericolo?: boolean; annulla?: string } = {}): Promise<boolean> {
  return new Promise((r) => mostra({ titolo, testo, ok: o.ok ?? 'Conferma', annulla: o.annulla, pericolo: o.pericolo, risolvi: (v) => r(!!v) }));
}
export function messaggio(titolo: string, testo: string): Promise<void> {
  return new Promise((r) => mostra({ titolo, testo, ok: 'Ho capito', annulla: null, risolvi: () => r() }));
}
export async function motivo(titolo: string, testo?: string): Promise<string | null> {
  const r = await chiedi(titolo, [{ id: 'm', etichetta: 'Motivo', tipo: 'area', obbligatorio: true }], { testo });
  return r?.m?.trim() || null;
}

export function OspiteModale() {
  const [r, setR] = useState<Richiesta | null>(null);
  const [val, setVal] = useState<Record<string, string>>({});
  useEffect(() => { ascoltaModale = (x) => { setR(x); setVal(Object.fromEntries((x?.campi ?? []).map((c) => [c.id, c.valore ?? '']))); }; return () => { ascoltaModale = null; }; }, []);
  if (!r) return null;
  const mancano = (r.campi ?? []).some((c) => c.obbligatorio && !val[c.id]?.trim());
  const chiudi = (v: Record<string, string> | null) => { r.risolvi(v); avanti(); };
  return (
    <div class="modale-sfondo" onClick={(e) => { if (e.target === e.currentTarget && r.annulla !== null) chiudi(null); }}>
      <form class="modale" onSubmit={(e) => { e.preventDefault(); if (!mancano) chiudi(r.campi ? val : {}); }}>
        <h2>{r.titolo}</h2>
        {r.testo && <p style="white-space:pre-wrap">{r.testo}</p>}
        {(r.campi ?? []).map((c, i) => (
          <label class="campo" key={c.id}>
            <span>{c.etichetta}{c.obbligatorio ? ' *' : ''}</span>
            {c.tipo === 'area' ? <textarea autoFocus={i === 0} value={val[c.id]} onInput={(e) => setVal({ ...val, [c.id]: (e.target as HTMLTextAreaElement).value })} />
              : c.tipo === 'scelta' ? <select value={val[c.id]} onChange={(e) => setVal({ ...val, [c.id]: (e.target as HTMLSelectElement).value })}>{(c.scelte ?? []).map((s) => <option value={s}>{s}</option>)}</select>
              : <input autoFocus={i === 0} type={c.tipo === 'data' ? 'date' : c.tipo === 'numero' ? 'text' : c.tipo === 'password' ? 'password' : 'text'} inputMode={c.tipo === 'numero' ? 'decimal' : undefined} value={val[c.id]} onInput={(e) => setVal({ ...val, [c.id]: (e.target as HTMLInputElement).value })} />}
            {c.aiuto && <small class="tenue">{c.aiuto}</small>}
          </label>
        ))}
        <div class="riga" style="justify-content:flex-end;margin-top:12px">
          {r.annulla !== null && <button type="button" class="btn" onClick={() => chiudi(null)}>{r.annulla ?? 'Annulla'}</button>}
          <button type="submit" class={`btn ${r.pericolo ? 'per' : 'pri'}`} disabled={mancano}>{r.ok ?? 'OK'}</button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ piccoli componenti
export function Pr({ p }: { p?: Priorita }) { return p ? <span class={`pr ${p}`} title={`Priorità ${p}`}>{p}</span> : null; }
const ET: Record<StatoVoce, string> = { completo: 'fatto', parziale: 'parziale', aperto: 'aperto', derogato: 'deroga' };
export function Badge({ s }: { s: StatoVoce }) { return <span class={`badge ${s}`}>{ET[s]}</span>; }
export function Card({ children, titolo }: { children: ComponentChildren; titolo?: ComponentChildren }) {
  return <div class="card">{titolo && <h3>{titolo}</h3>}{children}</div>;
}
export function Campo({ etichetta, children }: { etichetta: string; children: ComponentChildren }) {
  return <label class="campo"><span>{etichetta}</span>{children}</label>;
}

/** Input testuale che salva su blur o Invio, non a ogni tasto (ogni salvataggio è un evento nel registro). */
export function InputSalva(p: { valore?: string; onSalva: (v: string) => void; area?: boolean; placeholder?: string; numerico?: boolean; tipo?: string }) {
  const [v, setV] = useState(p.valore ?? '');
  useEffect(() => setV(p.valore ?? ''), [p.valore]);
  const salva = useCallback(() => { if ((p.valore ?? '') !== v) p.onSalva(v); }, [v, p.valore]);
  const comuni = {
    value: v, placeholder: p.placeholder,
    onInput: (e: JSX.TargetedEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.currentTarget.value),
    onBlur: salva,
  };
  if (p.area) return <textarea {...comuni} />;
  return <input {...comuni} type={p.tipo ?? 'text'} inputMode={p.numerico ? 'decimal' : undefined}
    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); } }} />;
}

export function useOra(intervallo = 30000) {
  const [d, setD] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setD(new Date()), intervallo); return () => clearInterval(t); }, [intervallo]);
  return d;
}

export function parseNumero(s: string): number | string | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, (m, i, str) => (str.includes(',') ? '' : m)).replace(',', '.'));
  return Number.isFinite(n) ? n : t;
}
