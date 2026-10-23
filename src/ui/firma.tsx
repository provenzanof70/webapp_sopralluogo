// Firma col dito su canvas (pointer events).
import { useEffect, useRef, useState } from 'preact/hooks';

export function Firma({ titolo, sottotitolo, nome: nomeIniziale = '', onFine }: {
  titolo: string; sottotitolo?: string; nome?: string; onFine: (r: { png: Blob; nome: string } | null) => void;
}) {
  const c = useRef<HTMLCanvasElement>(null);
  const [nome, setNome] = useState(nomeIniziale);
  const [vuota, setVuota] = useState(true);
  useEffect(() => {
    const cv = c.current!;
    const dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0a1a3a';
    let giu = false, lx = 0, ly = 0;
    const pos = (e: PointerEvent) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const d = (e: PointerEvent) => { giu = true; cv.setPointerCapture(e.pointerId); [lx, ly] = pos(e); e.preventDefault(); };
    const m = (e: PointerEvent) => {
      if (!giu) return;
      const [x, y] = pos(e);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke();
      lx = x; ly = y; setVuota(false); e.preventDefault();
    };
    const u = () => { giu = false; };
    cv.addEventListener('pointerdown', d); cv.addEventListener('pointermove', m); cv.addEventListener('pointerup', u); cv.addEventListener('pointercancel', u);
    return () => { cv.removeEventListener('pointerdown', d); cv.removeEventListener('pointermove', m); cv.removeEventListener('pointerup', u); cv.removeEventListener('pointercancel', u); };
  }, []);
  const pulisci = () => {
    const cv = c.current!; const ctx = cv.getContext('2d')!;
    const r = cv.getBoundingClientRect();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height); setVuota(true);
  };
  const salva = () => c.current!.toBlob((b) => b && onFine({ png: b, nome: nome.trim() }), 'image/png');
  return (
    <div class="modale-sfondo"><div class="modale">
      <h2>{titolo}</h2>
      {sottotitolo && <p class="piccolo">{sottotitolo}</p>}
      <label class="campo"><span>Nome e cognome di chi firma *</span><input value={nome} onInput={(e) => setNome(e.currentTarget.value)} /></label>
      <canvas ref={c} class="firma" />
      <div class="riga" style="margin-top:10px">
        <button class="btn" onClick={() => onFine(null)}>Annulla</button>
        <button class="btn" onClick={pulisci}>Cancella</button>
        <span class="cresce" />
        <button class="btn ok" disabled={vuota || !nome.trim()} onClick={salva}>Salva firma</button>
      </div>
    </div></div>
  );
}
