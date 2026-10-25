// Scheda PDF: il PDF di campo, identico, con i codici toccabili e quanto registrato scritto nelle celle.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Sessione } from '../archivio/sessione';
import type { Elemento } from '../dominio/tipi';
import { testoCampo, statoAncora, type Ancora, type Campo, type IndiceScheda } from '../dominio/schedaPdf';
import { statoCodice } from '../dominio/completezza';
import { caricaScheda, generaSchedaCompilata, type Scheda } from '../report/schedaCompilata';
import { Pannello } from './editori';
import { vai, prova, avvisa } from './comuni';
import { Icona } from './voci';
import { consegnaFile } from './evidenze';
import { useLargo } from './area';

export function SchedaPdf({ ses, codice }: { ses: Sessione; codice?: string }) {
  const id = ses.istanza.id;
  const [sc, setSc] = useState<Scheda | null | undefined>(undefined);
  const [errore, setErrore] = useState<string | null>(null);
  const [av, setAv] = useState<[number, number]>([0, 0]);
  const largo = useLargo();
  const [zoom, setZoom] = useState(() => { try { return Number(localStorage.getItem('zoomScheda')) || (innerWidth < 700 ? 2.2 : 1); } catch { return innerWidth < 700 ? 2.2 : 1; } });
  const [pagina, setPagina] = useState(1);
  const [occupato, setOccupato] = useState(false);
  useEffect(() => { caricaScheda(ses, (a, b) => setAv([a, b])).then(setSc).catch((e) => setErrore((e as Error).message)); }, [ses.istanza.id]);
  useEffect(() => { try { localStorage.setItem('zoomScheda', String(zoom)); } catch { /* */ } }, [zoom]);
  // porta in vista il codice scelto
  useEffect(() => {
    if (!sc || !codice) return;
    const a = sc.indice.ancore.find((x) => x.codice === codice) ?? sc.indice.ancore.find((x) => x.apre === codice);
    if (!a) return;
    setTimeout(() => {
      const box = document.getElementById(`sch-${a.pagina}`);
      if (!box) return;
      const s = box.clientWidth / sc.indice.pagine[a.pagina - 1].larghezza;
      const top = box.getBoundingClientRect().top + scrollY + (sc.indice.pagine[a.pagina - 1].altezza - a.y) * s;
      scrollTo({ top: Math.max(0, top - (largo ? 160 : 140)), behavior: 'smooth' });
      const sx = document.getElementById('scheda-scorri');
      if (sx) sx.scrollLeft = Math.max(0, a.x * s - 30);
    }, 120);
  }, [sc, codice]);

  if (errore) return <p class="errore">PDF di campo non leggibile: {errore}</p>;
  if (sc === undefined) return <div class="card"><p>Preparo la scheda: leggo il PDF di campo{av[1] ? ` (pagina ${av[0]} di ${av[1]})` : ''}…</p></div>;
  if (sc === null) return <p class="avviso">Questo sopralluogo non ha il PDF di campo (lo ZIP di andata non lo conteneva).</p>;

  const ordine = sc.indice.ordine.map((c) => ses.struttura.elementi.find((e) => e.id === c)).filter((e): e is Elemento => !!e && e.tipo !== 'informazione' && e.tipo !== 'uscitaArea');
  const sel = codice ? ses.struttura.elementi.find((e) => e.id === codice) : undefined;
  const chiudi = () => vai('s', id, 'scheda');
  const tocca = async (a: Ancora) => {
    if (a.prep) {
      const fatto = !!ses.stato.preparazioneFatta[a.prep];
      if (ses.stato.statoSopralluogo === 'chiuso') return;
      await prova(() => ses.registra('preparazione.spuntata', null, { chiave: a.prep, fatto: !fatto }), fatto ? 'Tolta la spunta' : 'Spuntato');
      return;
    }
    vai('s', id, 'scheda', a.apre);
  };
  const toccaCampo = (c: Campo) => {
    if (c.c.k === 'lista') {
      const aperto = c.c.codici.find((x) => statoCodice(ses.struttura, ses.stato, x) !== 'completo') ?? c.c.codici[0];
      const elx = ses.struttura.elementi.find((e) => e.id === aperto) ?? ses.struttura.elementi.find((e) => e.tipo === 'tabella' && e.righe?.some((r) => r.id === aperto)) ?? ses.struttura.elementi.find((e) => e.tipo === 'protocollo' && e.passi.some((p) => p.id === aperto));
      if (elx) vai('s', id, 'scheda', elx.id);
      return;
    }
    if (c.c.k === 'prep') return;
    const apre = c.apre ?? ('el' in c.c ? c.c.el : undefined);
    if (apre) vai('s', id, 'scheda', apre);
  };
  const vaiPagina = (n: number) => {
    const p = Math.max(1, Math.min(sc.indice.pagine.length, n));
    setPagina(p);
    document.getElementById(`sch-${p}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const compilato = async () => {
    setOccupato(true);
    try {
      const b = await prova(() => generaSchedaCompilata(ses));
      if (b) await consegnaFile(`${ses.struttura.pratica.prefissoFile}_scheda_compilata.pdf`, new Blob([b as BlobPart], { type: 'application/pdf' }), 'Scheda compilata');
    } finally { setOccupato(false); }
  };
  const nTot = sc.indice.ordine.length;
  const nFatti = sc.indice.ordine.filter((c) => statoCodice(ses.struttura, ses.stato, c) === 'completo').length;

  return <>
    <div class="scheda-barra">
      <button class="btn pic" onClick={() => setZoom((z) => Math.max(0.6, Math.round((z / 1.25) * 100) / 100))} aria-label="Riduci">−</button>
      <button class="btn pic" onClick={() => setZoom((z) => Math.min(4, Math.round(z * 1.25 * 100) / 100))} aria-label="Ingrandisci">+</button>
      <button class="btn pic" onClick={() => vaiPagina(pagina - 1)} aria-label="Pagina precedente">‹</button>
      <span class="piccolo" style="min-width:58px;text-align:center">pag. {pagina}/{sc.indice.pagine.length}</span>
      <button class="btn pic" onClick={() => vaiPagina(pagina + 1)} aria-label="Pagina successiva">›</button>
      <span class="cresce piccolo tenue sch-conta" style="text-align:right">{nFatti} di {nTot} voci</span>
      <button class="btn pic" disabled={occupato} onClick={compilato}>{occupato ? 'Preparo…' : <>PDF<span class="sch-lungo"> compilato</span></>}</button>
    </div>
    {!sc.indice.ancore.length && <p class="avviso">Nel PDF non ho trovato i codici della struttura: la scheda si legge ma non si compila da qui. Usa la vista ad elenco (Aree).</p>}
    <div id="scheda-scorri" class={`scheda-scorri ${sel && largo ? 'con-pannello' : ''}`}>
      <div style={`width:${zoom * 100}%`}>
        {sc.indice.pagine.map((p) => <PaginaScheda key={p.n} ses={ses} doc={sc.doc} indice={sc.indice} n={p.n} codice={codice} onVisibile={setPagina} onAncora={tocca} onCampo={toccaCampo} />)}
      </div>
    </div>
    {sel && <div class={`foglio-sfondo ${largo ? 'laterale' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) chiudi(); }}>
      <Pannello key={sel.id} ses={ses} el={sel} onChiudi={chiudi} sequenza={ordine} onVai={(x) => vai('s', id, 'scheda', x.id)} fine={{ etichetta: 'Fine della scheda', azione: () => { chiudi(); avvisa('Sei all\'ultima voce della scheda'); } }} />
    </div>}
  </>;
}

function PaginaScheda({ ses, doc, indice, n, codice, onVisibile, onAncora, onCampo }: {
  ses: Sessione; doc: PDFDocumentProxy; indice: IndiceScheda; n: number; codice?: string;
  onVisibile: (n: number) => void; onAncora: (a: Ancora) => void; onCampo: (c: Campo) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [vicina, setVicina] = useState(n <= 2);
  const [larghezza, setLarghezza] = useState(0);
  const pg = indice.pagine[n - 1];
  useEffect(() => {
    const o = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setVicina(true); if (e[0].intersectionRatio > 0.25) onVisibile(n); } }, { rootMargin: '800px 0px', threshold: [0, 0.25] });
    if (box.current) o.observe(box.current);
    const r = new ResizeObserver(() => setLarghezza(box.current?.clientWidth ?? 0));
    if (box.current) r.observe(box.current);
    return () => { o.disconnect(); r.disconnect(); };
  }, [n]);
  useEffect(() => {
    if (!vicina || !cv.current || !larghezza) return;
    let compito: { cancel: () => void } | null = null;
    let vivo = true;
    (async () => {
      const p = await doc.getPage(n);
      if (!vivo) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const v = p.getViewport({ scale: (larghezza / pg.larghezza) * dpr });
      const c = cv.current!;
      c.width = Math.floor(v.width); c.height = Math.floor(v.height);
      const t = p.render({ canvasContext: c.getContext('2d')!, viewport: v });
      compito = t;
      await t.promise.catch(() => undefined);
    })();
    return () => { vivo = false; compito?.cancel(); };
  }, [vicina, larghezza, doc, n]);
  const s = larghezza / pg.larghezza;
  const ancore = indice.ancore.filter((a) => a.pagina === n);
  const campi = indice.campi.filter((c) => c.pagina === n);
  return <div ref={box} id={`sch-${n}`} class="sch-pagina" style={`aspect-ratio:${pg.larghezza}/${pg.altezza}`}>
    <canvas ref={cv} class="sch-tela" />
    {vicina && s > 0 && <>
      {ancore.map((a) => {
        const st = statoAncora(ses.struttura, ses.stato, a);
        const testa = a.codice === a.apre || !!a.prep;
        return <button class={`sch-riga ${codice && a.apre === codice ? 'sel' : ''}`} aria-label={`Apri ${a.codice}`}
          style={`left:${(a.x - 3) * s}px;top:${(pg.altezza - a.y - a.h * 0.95) * s}px;width:${(a.w + 3) * s}px;height:${a.h * 1.45 * s}px`}
          onClick={() => onAncora(a)}>
          {testa && <span class={`sch-pallino ${st}`} style={`left:${-9 * s}px;top:${a.h * 0.25 * s}px;width:${6.5 * s}px;height:${6.5 * s}px`} />}
        </button>;
      })}
      {campi.map((c) => {
        const { testo, stato } = testoCampo(ses.struttura, ses.stato, c.c);
        if (!testo) return null;
        const segno = c.c.k === 'lista' || c.c.k === 'fatta' || c.c.k === 'prep';
        return <span class={`sch-campo ${segno ? 'segno' : ''} ${stato ?? ''} ${testo.startsWith('non fattibile') ? 'derogato' : ''}`}
          style={`left:${(c.x + 1) * s}px;top:${(pg.altezza - c.y - c.fs * 0.95) * s}px;max-width:${(segno ? Math.max(c.w, 10) : c.w) * s}px;font-size:${Math.max(6, c.fs * 1.02 * s)}px`}
          onClick={() => onCampo(c)}>{testo}</span>;
      })}
    </>}
    <span class="sch-num">pag. {n}</span>
  </div>;
}

/** Pulsante «Scheda PDF» per le viste dove serve (area, menu). */
export function LinkScheda({ ses, codice, etichetta = 'Scheda PDF' }: { ses: Sessione; codice?: string; etichetta?: string }) {
  if (!ses.struttura.generazione.pdfCampo) return null;
  return <a class="btn pic" href={`#/s/${ses.istanza.id}/scheda${codice ? '/' + encodeURIComponent(codice) : ''}`}><Icona n="documento" d={16} /> {etichetta}</a>;
}
