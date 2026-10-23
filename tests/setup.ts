import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { impostaCaricatoreFont } from '../src/report/pdf';
impostaCaricatoreFont(async () => ({
  normale: new Uint8Array(readFileSync('public/fonts/DejaVuSans.ttf')),
  grassetto: new Uint8Array(readFileSync('public/fonts/DejaVuSans-Bold.ttf')),
}));
