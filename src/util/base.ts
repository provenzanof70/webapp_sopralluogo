// Utilità di base: impronte, identificativi, date con offset.

const enc = new TextEncoder();

function esadecimale(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export async function sha256(dati: Uint8Array | ArrayBuffer | Blob | string): Promise<string> {
  let buf: ArrayBuffer | Uint8Array;
  if (typeof dati === 'string') buf = enc.encode(dati);
  else if (dati instanceof Blob) buf = await dati.arrayBuffer();
  else buf = dati;
  return esadecimale(await crypto.subtle.digest('SHA-256', buf as BufferSource));
}

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** ISO 8601 locale con offset, al secondo: 2026-10-16T15:31:04+02:00 */
export function isoLocale(d: Date = new Date()): string {
  const off = -d.getTimezoneOffset();
  const segno = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${segno}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}

export function fusoOrario(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'sconosciuto'; } catch { return 'sconosciuto'; }
}

/** «16/10/2026 15:31» da ISO */
export function dataOra(iso?: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}
export function soloOra(iso?: string): string {
  const m = iso ? /T(\d{2}):(\d{2})/.exec(iso) : null;
  return m ? `${m[1]}:${m[2]}` : '';
}
export function dataIt(isoData?: string): string {
  const m = isoData ? /^(\d{4})-(\d{2})-(\d{2})/.exec(isoData) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoData ?? '';
}
/** AAAAMMGG-HHMM dall'ora locale */
export function marcaFile(d: Date = new Date()): string {
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
}

export function utf8(s: string): Uint8Array { return enc.encode(s); }
export function daUtf8(b: Uint8Array | ArrayBuffer): string { return new TextDecoder().decode(b); }

/** Numero all'italiana per CSV e report */
export function numIt(v: unknown): string {
  if (typeof v === 'number') return String(v).replace('.', ',');
  if (typeof v === 'boolean') return v ? 'sì' : 'no';
  return v == null ? '' : String(v);
}

export function estensioneDaMime(mime: string | undefined, nome?: string): string {
  const daNome = nome && /\.([A-Za-z0-9]{1,5})$/.exec(nome)?.[1]?.toLowerCase();
  if (daNome) return daNome === 'jpeg' ? 'jpg' : daNome;
  const m: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp',
    'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'application/pdf': 'pdf', 'text/plain': 'txt',
  };
  return (mime && m[mime.split(';')[0]]) || 'bin';
}

export function codiceFile(c: string): string { return c.replace(/[^A-Za-z0-9.-]/g, '-'); }
