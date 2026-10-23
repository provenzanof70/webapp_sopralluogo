// Piccolo motore di impaginazione su pdf-lib: testo con a capo, titoli, tabelle semplici, immagini.
import { PDFDocument, rgb, degrees, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export type CaricatoreFont = () => Promise<{ normale: Uint8Array; grassetto: Uint8Array }>;

let caricatore: CaricatoreFont = async () => {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
  const [a, b] = await Promise.all([
    fetch(`${base}fonts/DejaVuSans.ttf`).then((r) => r.arrayBuffer()),
    fetch(`${base}fonts/DejaVuSans-Bold.ttf`).then((r) => r.arrayBuffer()),
  ]);
  return { normale: new Uint8Array(a), grassetto: new Uint8Array(b) };
};
export function impostaCaricatoreFont(f: CaricatoreFont) { caricatore = f; }

let cacheFont: { normale: Uint8Array; grassetto: Uint8Array } | null = null;

export const GRIGIO = rgb(0.42, 0.45, 0.5);
export const NERO = rgb(0.08, 0.1, 0.13);
export const BLU = rgb(0.1, 0.25, 0.45);
export const CHIARO = rgb(0.93, 0.94, 0.96);

export class Impaginatore {
  doc!: PDFDocument;
  f!: PDFFont;
  fb!: PDFFont;
  pagina!: PDFPage;
  y = 0;
  w: number;
  h: number;
  m = 42;
  piede: string;
  pagine: PDFPage[] = [];
  filigrana?: string;

  constructor(piede: string, verticale = true, filigrana?: string) {
    this.w = verticale ? 595.28 : 841.89;
    this.h = verticale ? 841.89 : 595.28;
    this.piede = piede;
    this.filigrana = filigrana;
  }

  async avvia(titolo: string) {
    this.doc = await PDFDocument.create();
    this.doc.registerFontkit(fontkit);
    cacheFont = cacheFont ?? (await caricatore());
    this.f = await this.doc.embedFont(cacheFont.normale, { subset: true });
    this.fb = await this.doc.embedFont(cacheFont.grassetto, { subset: true });
    this.doc.setTitle(titolo);
    this.doc.setProducer('App di sopralluogo MC Studio');
    this.doc.setCreator('App di sopralluogo MC Studio');
    this.nuovaPagina();
  }

  get larghezzaUtile() { return this.w - 2 * this.m; }

  nuovaPagina() {
    this.pagina = this.doc.addPage([this.w, this.h]);
    this.pagine.push(this.pagina);
    this.y = this.h - this.m;
    if (this.filigrana) {
      this.pagina.drawText(this.filigrana, { x: this.w / 2 - 150, y: this.h / 2, size: 72, font: this.fb, color: rgb(0.85, 0.85, 0.85), opacity: 0.5, rotate: degrees(35) });
    }
  }

  spazio(h: number) { if (this.y - h < this.m + 20) this.nuovaPagina(); }

  righe(testo: string, size: number, font: PDFFont, larghezza: number): string[] {
    const out: string[] = [];
    for (const par of pulisciTesto(testo).split('\n')) {
      const parole = par.split(/ +/);
      let r = '';
      for (const p of parole) {
        const prova = r ? `${r} ${p}` : p;
        if (font.widthOfTextAtSize(prova, size) <= larghezza) { r = prova; continue; }
        if (r) out.push(r);
        // parola più lunga della riga: spezza
        let q = p;
        while (font.widthOfTextAtSize(q, size) > larghezza && q.length > 1) {
          let k = q.length;
          while (k > 1 && font.widthOfTextAtSize(q.slice(0, k), size) > larghezza) k--;
          out.push(q.slice(0, k));
          q = q.slice(k);
        }
        r = q;
      }
      out.push(r);
    }
    return out;
  }

  testo(t: string, o: { size?: number; bold?: boolean; colore?: ReturnType<typeof rgb>; x?: number; larghezza?: number; dopo?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.bold ? this.fb : this.f;
    const x = o.x ?? this.m;
    const lw = o.larghezza ?? this.w - this.m - x;
    for (const r of this.righe(t, size, font, lw)) {
      this.spazio(size * 1.35);
      this.pagina.drawText(r, { x, y: this.y - size, size, font, color: o.colore ?? NERO });
      this.y -= size * 1.35;
    }
    this.y -= o.dopo ?? 2;
  }

  titolo(t: string, size = 14) {
    this.spazio(size * 3);
    this.y -= 6;
    this.testo(t, { size, bold: true, colore: BLU, dopo: 4 });
  }

  linea() {
    this.spazio(8);
    this.pagina.drawLine({ start: { x: this.m, y: this.y }, end: { x: this.w - this.m, y: this.y }, thickness: 0.5, color: GRIGIO });
    this.y -= 8;
  }

  /** Tabella a colonne con larghezze relative; righe che non stanno vanno a pagina nuova (intestazione ripetuta). */
  tabella(intest: string[], righe: string[][], pesi?: number[], size = 8.5) {
    const n = intest.length;
    const p = pesi ?? intest.map(() => 1);
    const tot = p.reduce((a, b) => a + b, 0);
    const larg = p.map((x) => (x / tot) * this.larghezzaUtile);
    const pad = 3;
    const disegnaRiga = (celle: string[], bold: boolean, sfondo: boolean) => {
      const linee = celle.map((c, i) => this.righe(c ?? '', size, bold ? this.fb : this.f, larg[i] - 2 * pad));
      const h = Math.max(...linee.map((l) => l.length)) * size * 1.3 + 2 * pad;
      if (this.y - h < this.m + 20) { this.nuovaPagina(); if (!bold) disegnaRiga(intest, true, true); }
      let x = this.m;
      if (sfondo) this.pagina.drawRectangle({ x: this.m, y: this.y - h, width: this.larghezzaUtile, height: h, color: CHIARO });
      for (let i = 0; i < n; i++) {
        let yy = this.y - pad - size;
        for (const r of linee[i]) { this.pagina.drawText(r, { x: x + pad, y: yy, size, font: bold ? this.fb : this.f, color: NERO }); yy -= size * 1.3; }
        x += larg[i];
      }
      this.pagina.drawLine({ start: { x: this.m, y: this.y - h }, end: { x: this.w - this.m, y: this.y - h }, thickness: 0.3, color: GRIGIO });
      this.y -= h;
    };
    disegnaRiga(intest, true, true);
    for (const r of righe) disegnaRiga(r, false, false);
    this.y -= 6;
  }

  async immagine(dati: Uint8Array, mime: string): Promise<PDFImage | null> {
    try {
      if (/png/i.test(mime)) return await this.doc.embedPng(dati);
      if (/jpe?g/i.test(mime)) return await this.doc.embedJpg(dati);
    } catch { /* formato non incorporabile */ }
    return null;
  }

  async chiudi(): Promise<Uint8Array> {
    const n = this.pagine.length;
    this.pagine.forEach((pg, i) => {
      const t = `${this.piede} — pag. ${i + 1} di ${n}`;
      const r = this.righe(t, 7, this.f, this.larghezzaUtile)[0];
      pg.drawText(r, { x: this.m, y: 22, size: 7, font: this.f, color: GRIGIO });
    });
    return this.doc.save({ useObjectStreams: true });
  }
}

/** Sostituisce i caratteri che il font potrebbe non avere (emoji ecc.). */
export function pulisciTesto(s: string): string {
  return String(s ?? '').replace(/\r/g, '').replace(/\t/g, ' ').replace(/[\u{1F000}-\u{1FFFF}]/gu, '?');
}
