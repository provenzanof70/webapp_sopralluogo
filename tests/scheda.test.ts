import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { indicizza, testoCampo, type TestoPagina } from '../src/dominio/schedaPdf';
import { statoIniziale } from '../src/dominio/stato';
import type { Struttura, ElLettura, ElTabella } from '../src/dominio/tipi';

const s: Struttura = JSON.parse(fs.readFileSync('esempi/struttura_esempio_fittizio_1.1.json', 'utf8'));
const L = s.elementi.find((e): e is ElLettura => e.tipo === 'lettura')!;
const T = s.elementi.find((e): e is ElTabella => e.tipo === 'tabella' && !!e.righe?.length)!;
const v = (s0: string, x: number, y: number) => ({ s: s0, x, y, w: s0.length * 4, h: 7 });

describe('Scheda PDF', () => {
  it('trova codici, colonne e righe delle grandezze nel testo del PDF', () => {
    const colT = T.colonne.filter((c) => !c.chiave && !c.solaLettura)[0];
    const pagina: TestoPagina = { n: 1, larghezza: 842, altezza: 595, voci: [
      v('☐', 49, 500), v('Codice', 72, 500), v('Pr.', 132, 500), v('Cosa verificare', 154, 500), v('Agli atti (classe, fonte)', 379, 500), v('Esito: confermo / correggo', 574, 500),
      v('☐', 49, 480), v('V-CMP-01', 72, 480), v('A', 132, 480), v('Arresto a fine turno', 154, 480),
      v('Codice', 49, 440), v('Pr.', 132, 440), v('A chi', 154, 440), v('Domanda (perché)', 300, 440), v('Risposta — chi l\'ha data — R/D', 650, 440),
      v('Q17', 49, 420), v('A', 132, 420), v('Referente', 154, 420),
      v('Momento', 49, 380), v('Grandezza', 124, 380), v('Unità', 424, 380), v('Valore', 477, 380), v('Ora', 612, 380), v('N. foto', 687, 380),
      v(`${L.id} · A · ${L.strumento}`, 49, 365),
      v(L.momenti[0], 49, 350), v(L.grandezze[0].nome, 124, 350),
      v('Id', 49, 300), ...T.colonne.slice(1).map((c, i) => v(c.etichetta, 140 + i * 90, 300)),
      v(T.righe![0].id, 49, 280), v('voce', 140, 280),
    ] };
    const ix = indicizza(s, [pagina]);
    expect(ix.paginaDi['V-CMP-01']).toBe(1);
    expect(ix.paginaDi['Q17']).toBe(1);
    expect(ix.paginaDi[L.id]).toBe(1);
    const esito = ix.campi.find((c) => c.c.k === 'esito')!;
    expect(esito.x).toBe(574);
    expect(ix.campi.find((c) => c.c.k === 'risposta')!.x).toBe(650);
    const val = ix.campi.find((c) => c.c.k === 'valore')!;
    expect(val.x).toBe(477);
    expect(val.y).toBe(350);
    expect(ix.campi.some((c) => c.c.k === 'cella' && c.c.riga === T.righe![0].id && c.c.col === colT.id)).toBe(true);
    // testo da scrivere
    const st = statoIniziale(s);
    st.esiti['V-CMP-01'] = { tipo: 'verifica', stato: 'corretto', valoreRilevato: 25, classe: 'R', fonte: 'targa', aggiornatoIl: '2026-10-16T10:00:00' };
    expect(testoCampo(s, st, esito.c).testo).toBe('corretto 25 (R) · targa');
    st.esiti[L.id] = { tipo: 'lettura', stato: 'parziale', aggiornatoIl: 'x', valori: [{ grandezza: L.grandezze[0].id, momento: L.momenti[0], ripetizione: 1, valore: 1234.5, il: '2026-10-16T09:42:00' }] };
    expect(testoCampo(s, st, val.c).testo).toBe('1234,5');
    expect(testoCampo(s, st, ix.campi.find((c) => c.c.k === 'ora')!.c).testo).toBe('09:42');
  });
});
