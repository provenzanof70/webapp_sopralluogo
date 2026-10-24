// Visualizzatore PDF interno (pdf.js locale): su Android il browser non apre i PDF dall'app.
import { useEffect, useRef, useState } from 'preact/hooks';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function VisorePdf({ blob, titolo, paginaIniziale = 1, onChiudi }: { blob: Blob; titolo: string; paginaIniziale?: number; onChiudi?: () => void }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pagina, setPagina] = useState(paginaIniziale);
  const contenitore = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let vivo = true;
    let d: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const dati = new Uint8Array(await blob.arrayBuffer());
        d = await pdfjs.getDocument({ data: dati, isEvalSupported: false, useSystemFonts: true }).promise;
        if (vivo) setDoc(d);
      } catch (e) { if (vivo) setErrore((e as Error).message); }
    })();
    return () => { vivo = false; d?.destroy(); };
  }, [blob]);
  useEffect(() => {
    if (!doc || paginaIniziale <= 1) return;
    setTimeout(() => document.getElementById(`pdfpag-${paginaIniziale}`)?.scrollIntoView(), 300);
  }, [doc]);
  const vai = (n: number) => {
    if (!doc) return;
    const p = Math.max(1, Math.min(doc.numPages, n));
    setPagina(p);
    document.getElementById(`pdfpag-${p}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return <>
    <div class="riga" style="position:sticky;top:56px;z-index:6;background:var(--sfondo);padding:6px 0">
      {onChiudi && <button class="btn pic" onClick={onChiudi}>←</button>}
      <b class="cresce" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{titolo}</b>
      <button class="btn pic" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>−</button>
      <button class="btn pic" onClick={() => setZoom((z) => Math.min(4, z * 1.25))}>+</button>
      <button class="btn pic" onClick={() => vai(pagina - 1)}>‹</button>
      <input style="width:64px;min-height:40px" inputMode="numeric" value={String(pagina)} onChange={(e) => vai(Number(e.currentTarget.value) || 1)} />
      <span class="piccolo">/ {doc?.numPages ?? '…'}</span>
      <button class="btn pic" onClick={() => vai(pagina + 1)}>›</button>
    </div>
    {errore && <p class="errore">PDF non leggibile: {errore}</p>}
    {!doc && !errore && <p class="tenue">Apertura del PDF…</p>}
    <div ref={contenitore} style="overflow-x:auto">
      {doc && Array.from({ length: doc.numPages }, (_, i) => <Pagina key={i + 1} doc={doc} n={i + 1} zoom={zoom} onVisibile={setPagina} />)}
    </div>
  </>;
}

function Pagina({ doc, n, zoom, onVisibile }: { doc: PDFDocumentProxy; n: number; zoom: number; onVisibile: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [vicina, setVicina] = useState(n <= 2);
  const [proporzione, setProporzione] = useState(0.707);
  useEffect(() => {
    doc.getPage(n).then((p) => { const v = p.getViewport({ scale: 1 }); setProporzione(v.height / v.width); });
    const o = new IntersectionObserver((e) => {
      if (e[0].isIntersecting) { setVicina(true); if (e[0].intersectionRatio > 0.3) onVisibile(n); }
    }, { rootMargin: '600px 0px', threshold: [0, 0.3] });
    if (box.current) o.observe(box.current);
    return () => o.disconnect();
  }, [doc, n]);
  useEffect(() => {
    if (!vicina || !cv.current || !box.current) return;
    let compito: { cancel: () => void } | null = null;
    (async () => {
      const p = await doc.getPage(n);
      const largo = box.current!.clientWidth * zoom;
      const base = p.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const v = p.getViewport({ scale: (largo / base.width) * dpr });
      const c = cv.current!;
      c.width = v.width; c.height = v.height;
      c.style.width = `${largo}px`; c.style.height = `${largo * (base.height / base.width)}px`;
      const t = p.render({ canvasContext: c.getContext('2d')!, viewport: v });
      compito = t;
      await t.promise.catch(() => undefined);
    })();
    return () => compito?.cancel();
  }, [vicina, zoom, doc, n]);
  return (
    <div ref={box} id={`pdfpag-${n}`} style="margin:8px 0;width:100%">
      <canvas ref={cv} style={`background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);display:block;${vicina ? '' : `width:100%;aspect-ratio:${1 / proporzione}`}`} />
      <div class="piccolo tenue" style="text-align:center">pag. {n}</div>
    </div>
  );
}
