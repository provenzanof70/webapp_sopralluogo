// Figure della struttura: consultazione con zoom e annotazione a penna (l'originale resta intatto).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import { prova, chiedi, avvisa } from './comuni';
import { Miniature } from './evidenze';

export function ElencoFigure({ ses }: { ses: Sessione }) {
  const fig = ses.struttura.figure ?? [];
  return <>
    <h1>Figure</h1>
    {!fig.length && <p class="tenue">Nessuna figura nel pacchetto.</p>}
    {fig.map((f) => {
      const ann = Object.values(ses.stato.evidenze).filter((e) => e.tipo === 'annotazione' && e.figuraBase === f.id);
      return <div class="card" key={f.id}>
        <div class="riga"><code><b>{f.id}</b></code><span class="cresce">{f.titolo}</span><a class="btn pic pri" href={`#/s/${ses.istanza.id}/figura/${f.id}`}>Apri</a></div>
        {f.copieDaSiglare ? <p class="piccolo avviso">Da far siglare al referente ({f.copieDaSiglare} copia stampata).</p> : null}
        <Miniature ses={ses} ids={ann.map((a) => a.id)} />
      </div>;
    })}
  </>;
}

export function VistaFigura({ ses, id }: { ses: Sessione; id: string }) {
  const f = ses.struttura.figure?.find((x) => x.id === id);
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [annota, setAnnota] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    ses.figura(id).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (!f) return <p>Figura non trovata.</p>;
  if (!url) return <p class="tenue">Figura non disponibile su questo dispositivo{ses.istanza.origine?.startsWith('ripristino') ? ' (ripristino senza pacchetto di andata)' : ''}.</p>;
  if (annota) return <Annotatore ses={ses} id={id} url={url} onFine={() => setAnnota(false)} />;
  return <>
    <h1>{f.titolo}</h1>
    <div class="riga" style="margin-bottom:8px">
      <button class="btn pic" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))}>−</button>
      <button class="btn pic" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
      <button class="btn pic" onClick={() => setZoom((z) => Math.min(6, z * 1.5))}>+</button>
      <span class="cresce" />
      {f.annotabile !== false && <button class="btn pic pri" onClick={() => setAnnota(true)}>✎ Annota</button>}
    </div>
    <div class="fig-wrap"><img src={url} style={`width:${zoom * 100}%;max-width:none`} alt={f.titolo} /></div>
  </>;
}

function Annotatore({ ses, id, url, onFine }: { ses: Sessione; id: string; url: string; onFine: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [colore, setColore] = useState('#d32f2f');
  const [spessore, setSpessore] = useState(4);
  const [modo, setModo] = useState<'penna' | 'testo'>('penna');
  const storia = useRef<ImageData[]>([]);
  const prop = useRef({ colore, spessore, modo });
  prop.current = { colore, spessore, modo };
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = cv.current!;
      const max = 2400;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      c.width = img.width * k; c.height = img.height * k;
      c.style.width = '100%';
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      let giu = false, lx = 0, ly = 0;
      const pos = (e: PointerEvent) => { const b = c.getBoundingClientRect(); return [(e.clientX - b.left) * (c.width / b.width), (e.clientY - b.top) * (c.height / b.height)]; };
      const scala = () => c.width / c.getBoundingClientRect().width;
      c.onpointerdown = async (e) => {
        e.preventDefault();
        storia.current.push(ctx.getImageData(0, 0, c.width, c.height));
        if (storia.current.length > 15) storia.current.shift();
        const [x, y] = pos(e);
        if (prop.current.modo === 'testo') {
          const r = await chiedi('Etichetta', [{ id: 't', etichetta: 'Testo o codice (es. T01, compressore)', obbligatorio: true }]);
          if (r?.t) {
            const s = 16 * scala();
            ctx.font = `bold ${s}px sans-serif`;
            const w = ctx.measureText(r.t).width;
            ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(x - 3, y - s, w + 6, s * 1.3);
            ctx.fillStyle = prop.current.colore; ctx.fillText(r.t, x, y);
          }
          return;
        }
        giu = true; c.setPointerCapture(e.pointerId); [lx, ly] = [x, y];
      };
      c.onpointermove = (e) => {
        if (!giu) return;
        e.preventDefault();
        const [x, y] = pos(e);
        ctx.strokeStyle = prop.current.colore; ctx.lineWidth = prop.current.spessore * scala(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke();
        [lx, ly] = [x, y];
      };
      c.onpointerup = c.onpointercancel = () => { giu = false; };
    };
    img.src = url;
  }, [url]);
  const salva = () => cv.current!.toBlob(async (b) => {
    if (!b) return;
    const r = await chiedi('Salva annotazione', [{ id: 'd', etichetta: 'Didascalia', tipo: 'area' }, { id: 'c', etichetta: 'Codici collegati (facoltativo, separati da virgola)' }]);
    if (!r) return;
    const ev = await prova(() => ses.acquisisci({ blob: b, tipo: 'annotazione', fonte: 'schermo', figuraBase: id, elementi: r.c.split(/[,\s]+/).filter(Boolean), didascalia: r.d.trim() || undefined }));
    if (ev) { avvisa('Annotazione salvata come nuova evidenza: la figura originale resta intatta'); onFine(); }
  }, 'image/png');
  return <>
    <div class="riga" style="position:sticky;top:56px;z-index:5;background:var(--sfondo);padding:6px 0">
      {['#d32f2f', '#1565c0', '#2e7d32', '#000000'].map((x) => <button class={`btn pic ${colore === x ? 'sel' : ''}`} style={`color:${x}`} onClick={() => { setColore(x); setModo('penna'); }}>●</button>)}
      <select style="width:auto" value={spessore} onChange={(e) => setSpessore(Number(e.currentTarget.value))}><option value="2">fine</option><option value="4">medio</option><option value="8">spesso</option></select>
      <button class={`btn pic ${modo === 'testo' ? 'sel' : ''}`} onClick={() => setModo(modo === 'testo' ? 'penna' : 'testo')}>T</button>
      <button class="btn pic" onClick={() => { const s = storia.current.pop(); if (s) cv.current!.getContext('2d')!.putImageData(s, 0, 0); }}>↶</button>
      <span class="cresce" />
      <button class="btn pic" onClick={onFine}>Annulla</button>
      <button class="btn pic ok" onClick={salva}>Salva</button>
    </div>
    <p class="piccolo tenue">{modo === 'testo' ? 'Tocca il punto dove mettere l\'etichetta.' : 'Disegna con il dito. Per spostarti esci dall\'annotazione e usa lo zoom.'}</p>
    <canvas ref={cv} class="annota" />
  </>;
}
