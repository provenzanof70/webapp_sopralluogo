// Lettura EXIF (data originale, GPS, orientamento) senza alterare l'immagine; miniature per la sola visualizzazione.

export interface InfoExif { dataOriginale?: string; gps?: { lat: number; lon: number }; orientamento?: number }

export async function leggiExif(b: Blob): Promise<InfoExif> {
  try {
    const testa = new DataView(await b.slice(0, Math.min(b.size, 256 * 1024)).arrayBuffer());
    if (testa.getUint16(0) !== 0xffd8) return {};
    let p = 2;
    while (p + 4 < testa.byteLength) {
      const marcatore = testa.getUint16(p);
      const lung = testa.getUint16(p + 2);
      if (marcatore === 0xffe1 && testa.getUint32(p + 4) === 0x45786966) return tiff(testa, p + 10);
      if ((marcatore & 0xff00) !== 0xff00) break;
      p += 2 + lung;
    }
  } catch { /* EXIF illeggibile: non è un errore */ }
  return {};
}

function tiff(dv: DataView, base: number): InfoExif {
  const le = dv.getUint16(base) === 0x4949;
  const u16 = (o: number) => dv.getUint16(base + o, le);
  const u32 = (o: number) => dv.getUint32(base + o, le);
  const out: InfoExif = {};
  const leggiIfd = (off: number, f: (tag: number, tipo: number, n: number, valOff: number) => void) => {
    if (off <= 0 || base + off + 2 > dv.byteLength) return;
    const n = u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (base + e + 12 > dv.byteLength) return;
      f(u16(e), u16(e + 2), u32(e + 4), e + 8);
    }
  };
  const ascii = (n: number, valOff: number) => {
    const o = n > 4 ? u32(valOff) : valOff;
    let s = '';
    for (let i = 0; i < n - 1 && base + o + i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(base + o + i));
    return s;
  };
  const razionali = (n: number, valOff: number) => {
    const o = u32(valOff);
    const r: number[] = [];
    for (let i = 0; i < n; i++) { const d = u32(o + i * 8 + 4); r.push(d ? u32(o + i * 8) / d : 0); }
    return r;
  };
  let exifOff = 0, gpsOff = 0;
  leggiIfd(u32(4), (tag, _t, n, v) => {
    if (tag === 0x0112) out.orientamento = u16(v);
    if (tag === 0x8769) exifOff = u32(v);
    if (tag === 0x8825) gpsOff = u32(v);
    if (tag === 0x0132 && !out.dataOriginale) out.dataOriginale = ascii(n, v);
  });
  leggiIfd(exifOff, (tag, _t, n, v) => { if (tag === 0x9003) out.dataOriginale = ascii(n, v); });
  let latR = 'N', lonR = 'E', lat: number[] | null = null, lon: number[] | null = null;
  leggiIfd(gpsOff, (tag, _t, n, v) => {
    if (tag === 1) latR = String.fromCharCode(dv.getUint8(base + v));
    if (tag === 2) lat = razionali(n, v);
    if (tag === 3) lonR = String.fromCharCode(dv.getUint8(base + v));
    if (tag === 4) lon = razionali(n, v);
  });
  if (lat && lon) {
    const g = (x: number[]) => x[0] + x[1] / 60 + x[2] / 3600;
    const la = g(lat) * (latR === 'S' ? -1 : 1), lo = g(lon) * (lonR === 'W' ? -1 : 1);
    if (Number.isFinite(la) && Number.isFinite(lo) && (la !== 0 || lo !== 0)) out.gps = { lat: la, lon: lo };
  }
  if (out.dataOriginale) {
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(out.dataOriginale);
    if (m) out.dataOriginale = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  }
  return out;
}

/** Riduce un'immagine (solo per visualizzazione e report). Restituisce null se il browser non la sa decodificare. */
export async function ridimensiona(b: Blob, lato: number, qualita = 0.82): Promise<Blob | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const bmp = await createImageBitmap(b, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const k = Math.min(1, lato / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    let blob: Blob | null = null;
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      blob = await c.convertToBlob({ type: 'image/jpeg', quality: qualita });
    } else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', qualita));
    }
    bmp.close?.();
    return blob;
  } catch {
    return null;
  }
}

export async function dimensioniImmagine(b: Blob): Promise<{ w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(b);
    const r = { w: bmp.width, h: bmp.height };
    bmp.close?.();
    return r;
  } catch { return null; }
}
