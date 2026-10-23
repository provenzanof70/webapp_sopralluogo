// Lettura e scrittura ZIP.
// Lettura: dal Blob, tramite la directory centrale; le voci STORED si estraggono come fette del Blob
// (nessuna copia in memoria), le DEFLATE si decomprimono una alla volta.
// Scrittura: fflate in modalità sincrona (niente Worker, compatibile con la CSP), STORED per i media.
import { inflateSync, Zip, ZipPassThrough, ZipDeflate } from 'fflate';

export interface VoceZip {
  nome: string;
  dimensione: number;
  leggi(): Promise<Uint8Array>;
  comeBlob(tipo?: string): Promise<Blob>;
}

async function fetta(b: Blob, da: number, a: number): Promise<DataView> {
  return new DataView(await b.slice(da, a).arrayBuffer());
}

export async function leggiZip(zip: Blob): Promise<Map<string, VoceZip>> {
  const lung = zip.size;
  const coda = Math.min(lung, 65557);
  const dv = await fetta(zip, lung - coda, lung);
  let eocd = -1;
  for (let i = coda - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Il file non è uno ZIP valido (manca la directory centrale)');
  const nVoci = dv.getUint16(eocd + 10, true);
  const dimCd = dv.getUint32(eocd + 12, true);
  const offCd = dv.getUint32(eocd + 16, true);
  if (offCd === 0xffffffff || nVoci === 0xffff) throw new Error('ZIP64 non supportato: usare volumi più piccoli');
  const cd = await fetta(zip, offCd, offCd + dimCd);
  const voci = new Map<string, VoceZip>();
  const dec = new TextDecoder();
  let p = 0;
  for (let k = 0; k < nVoci; k++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('Directory centrale ZIP danneggiata');
    const metodo = cd.getUint16(p + 10, true);
    const compr = cd.getUint32(p + 20, true);
    const nonCompr = cd.getUint32(p + 24, true);
    const lNome = cd.getUint16(p + 28, true);
    const lExtra = cd.getUint16(p + 30, true);
    const lComm = cd.getUint16(p + 32, true);
    const offLocale = cd.getUint32(p + 42, true);
    const nome = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, lNome));
    p += 46 + lNome + lExtra + lComm;
    if (nome.endsWith('/')) continue;
    if (metodo !== 0 && metodo !== 8) throw new Error(`Metodo di compressione non supportato per ${nome}`);
    const inizioDati = async () => {
      const h = await fetta(zip, offLocale, offLocale + 30);
      if (h.getUint32(0, true) !== 0x04034b50) throw new Error(`Intestazione locale ZIP danneggiata: ${nome}`);
      return offLocale + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    };
    const voce: VoceZip = {
      nome,
      dimensione: nonCompr,
      async comeBlob(tipo = '') {
        const i = await inizioDati();
        if (metodo === 0) return zip.slice(i, i + compr, tipo);
        const d = inflateSync(new Uint8Array(await zip.slice(i, i + compr).arrayBuffer()));
        return new Blob([d as BlobPart], { type: tipo });
      },
      async leggi() {
        const i = await inizioDati();
        const grezzo = new Uint8Array(await zip.slice(i, i + compr).arrayBuffer());
        return metodo === 0 ? grezzo : inflateSync(grezzo, { out: new Uint8Array(nonCompr) });
      },
    };
    voci.set(nome, voce);
  }
  return voci;
}

export interface FileDaScrivere {
  nome: string;
  dati: Uint8Array | Blob;
}

const GIA_COMPRESSI = /\.(jpe?g|png|heic|heif|webp|m4a|aac|mp4|mp3|webm|ogg|pdf|zip)$/i;

/** Scrive uno ZIP in un Blob; legge i Blob uno alla volta per contenere la memoria. */
export async function scriviZip(files: FileDaScrivere[]): Promise<Blob> {
  const parti: Uint8Array[] = [];
  let errore: Error | null = null;
  const z = new Zip((err, chunk) => {
    if (err) errore = err as Error;
    else parti.push(chunk);
  });
  for (const f of files) {
    const dati = f.dati instanceof Blob ? new Uint8Array(await f.dati.arrayBuffer()) : f.dati;
    const voce = GIA_COMPRESSI.test(f.nome) ? new ZipPassThrough(f.nome) : new ZipDeflate(f.nome, { level: 6 });
    z.add(voce);
    voce.push(dati, true);
    if (errore) throw errore;
  }
  z.end();
  if (errore) throw errore;
  return new Blob(parti as BlobPart[], { type: 'application/zip' });
}
