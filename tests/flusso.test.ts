// Collaudo del nucleo: import, rilievo, checkpoint, finale, verifica Python, ricostruzione, ripristino, quota.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { analizzaAndata, creaSopralluogo, ErroreImport } from '../src/pacchetti/andata';
import { Sessione } from '../src/archivio/sessione';
import { costruisciPacchetto } from '../src/pacchetti/rientro';
import { analizzaRipristino, eseguiRipristino } from '../src/pacchetti/ripristino';
import { generaTuttiIReport } from '../src/report/genera';
import { ricostruisci } from '../src/dominio/stato';
import { statoElemento, apertiA } from '../src/dominio/completezza';
import { contenutoVerbale, testoPerFirma, dichiarazioniDaConfermare } from '../src/report/contenuti';
import { db, ErroreArchivio } from '../src/archivio/db';
import { sha256 } from '../src/util/base';
import type { Evento } from '../src/dominio/tipi';

const OUT = join(process.cwd(), 'tests', 'uscita');
mkdirSync(OUT, { recursive: true });
const ANDATA = 'esempi/SOPRALLUOGO_ESEMPIO_20261016_ANDATA_rev001.zip';
const blobDa = (p: string, type = '') => new Blob([readFileSync(p)], { type });
const foto = (n: number) => blobDa(`tests/fixture/foto${n}.jpg`, 'image/jpeg');

function verificaPython(files: string[], extra: string[] = []): string {
  try {
    return execFileSync('python3', ['strumenti/verifica_pacchetto_rientro.py', ...files, '--andata', ANDATA, '--schema', 'schema/pacchetto-rientro.v1.schema.json', ...extra], { encoding: 'utf8' });
  } catch (e) {
    const err = e as { stdout?: string };
    return err.stdout ?? String(e);
  }
}

async function salva(p: { volumi: { nome: string; blob: Blob }[] }) {
  const percorsi: string[] = [];
  for (const v of p.volumi) {
    const f = join(OUT, v.nome);
    writeFileSync(f, new Uint8Array(await v.blob.arrayBuffer()));
    percorsi.push(f);
  }
  return percorsi;
}

let ses: Sessione;
let checkpoint1: string[] = [];
let finale: string[] = [];

describe('sopralluogo completo', () => {
  beforeAll(async () => { await db().delete(); await db().open(); });

  it('rifiuta un pacchetto manomesso e importa quello integro', async () => {
    // pacchetto con struttura alterata: impronta errata
    const { leggiZip, scriviZip } = await import('../src/util/zip');
    const voci = await leggiZip(blobDa(ANDATA));
    const files = [];
    for (const [n, v] of voci) {
      let d = await v.leggi();
      if (n === 'struttura.json') d = new TextEncoder().encode(new TextDecoder().decode(d).replace('ESEMPIO MECCANICA', 'ALTRO'));
      files.push({ nome: n, dati: d });
    }
    await expect(analizzaAndata(await scriviZip(files), 'x.zip')).rejects.toBeInstanceOf(ErroreImport);
    expect(await db().istanze.count()).toBe(0);

    const a = await analizzaAndata(blobDa(ANDATA), 'andata.zip');
    expect(a.figure.size).toBe(1);
    const id = await creaSopralluogo(a);
    ses = await Sessione.apri(id);
    expect(ses.istanza.aSeq).toBe(1);
  });

  it('registra il rilievo in campo', async () => {
    await ses.registra('sopralluogo.avviato', null);
    await ses.registra('consenso.registrato', null, { foto: 'si', registrazioneAudio: 'no' });
    await ses.registra('presenza.aggiornata', null, { chiave: 'P1', presente: true });
    await ses.registra('presenza.aggiornata', null, { chiave: 'X1', nome: 'Luca Verdi', ruolo: 'Elettricista', presente: true, aggiuntaInCampo: true, dalle: '16:00' });
    await ses.registra('esito.aggiornato', 'Q17', { campi: { stato: 'risposta', risposta: 'Si spegne a mano.', rispostaDa: 'Anna Bianchi, referente', provenienza: 'D', daConfermarePerIscritto: true } });
    await ses.registra('esito.aggiornato', 'Q18', { campi: { stato: 'risposta', risposta: 'Spina propria.', rispostaDa: 'Anna Bianchi', provenienza: 'R' } });
    const ids = [];
    for (let i = 1; i <= 4; i++) ids.push((await ses.acquisisci({ blob: foto(i), tipo: 'foto', fonte: 'fotocamera', elementi: ['F36'], area: 'CMP', nomeOriginale: `IMG_${i}.JPG` })).id);
    expect(ses.stato.esiti.F36.stato).toBe('fatta');
    await ses.acquisisci({ blob: foto(5), tipo: 'foto', fonte: 'galleria', elementi: ['F37', 'Q18', 'Z02'], area: 'CMP' });
    expect(ses.stato.esiti.F37.stato).toBe('aperta'); // 1 scatto su 2
    const inbox = await ses.acquisisci({ blob: foto(1), tipo: 'foto', fonte: 'fotocamera', elementi: [], area: 'CMP' });
    expect(inbox.file).toMatch(/_INBOX_006\.jpg$/);
    await ses.registra('evidenza.aggiornata', null, { id: inbox.id, elementi: ['F37'] });
    expect(ses.stato.esiti.F37.stato).toBe('fatta');
    expect(ses.stato.evidenze[inbox.id].file).toMatch(/_INBOX_006\.jpg$/); // nome fissato all'acquisizione
    await ses.registra('evidenza.annullata', null, { id: ids[3], motivo: 'foto mossa' });

  });

  it('applica le regole di completezza e gli altri tipi', async () => {
    // F36 richiede 4 scatti: dopo l'annullamento torna aperta
    const s = ses.struttura;
    expect(ses.stato.esiti.F36.stato).toBe('aperta');
    await ses.acquisisci({ blob: foto(2), tipo: 'foto', fonte: 'fotocamera', elementi: ['F36'], area: 'CMP' });
    expect(ses.stato.esiti.F36.stato).toBe('fatta');
    await ses.registra('valore.registrato', 'L03', { lista: [
      { grandezza: 'hTot', momento: 'arrivo', ripetizione: 1, valore: 21834, unita: 'h', il: '2026-10-16T14:31:00+02:00' },
      { grandezza: 'hCarico', momento: 'arrivo', ripetizione: 1, valore: 15210, unita: 'h', il: '2026-10-16T14:31:00+02:00' },
    ] });
    expect(ses.stato.esiti.L03.stato).toBe('parziale');
    await ses.registra('valore.registrato', 'L03', { lista: [
      { grandezza: 'hTot', momento: 'partenza', ripetizione: 1, valore: 21837, unita: 'h', il: '2026-10-16T18:16:00+02:00' },
      { grandezza: 'hCarico', momento: 'partenza', ripetizione: 1, valore: 15212, unita: 'h', il: '2026-10-16T18:16:00+02:00', oraCorretta: { da: '2026-10-16T18:20:00+02:00', motivo: 'lettura fatta alle 18:16, registrata dopo' } },
    ] });
    expect(ses.stato.esiti.L03.stato).toBe('completa');
    await ses.registra('cella.aggiornata', 'TAB-CMP', { riga: 'C04', colonna: 'pn', cella: { stato: 'confermato', valore: 11, valoreAgliAtti: 11, classe: 'F', fonte: 'targa' } });
    await ses.registra('cella.aggiornata', 'TAB-CMP', { riga: 'C05', colonna: 'pn', cella: { stato: 'corretto', valore: 0.42, valoreAgliAtti: 0.419, classe: 'F', fonte: 'targa' } });
    await ses.registra('riga.aggiunta', 'TAB-CMP', { riga: 'TAB-CMP-N1' });
    await ses.registra('cella.aggiornata', 'TAB-CMP', { riga: 'TAB-CMP-N1', colonna: 'utenza', cella: { stato: 'rilevato', valore: 'Scaricatore di condensa', classe: 'R' } });
    expect(ses.stato.esiti['TAB-CMP'].stato).toBe('parziale');
    await ses.registra('esito.aggiornato', 'D16', { campi: { stato: 'promesso', promessoEntro: '2026-10-23', chiLoInvia: 'Amministrazione' } });
    await ses.registra('esito.aggiornato', 'Z02', { campi: { stato: 'chiusa', esito: 'Spina propria, resta alimentato.' } });
    await ses.registra('passo.aggiornato', 'GR', { passo: 'GR0', campi: { stato: 'eseguito', oraEffettiva: '2026-10-16T16:45:00+02:00', eseguitoDa: 'Elettricista' } });
    expect(ses.stato.esiti.GR.stato).toBe('inCorso');
    await ses.registra('passo.aggiornato', 'GR', { passo: 'GR1', campi: { stato: 'eseguito', oraEffettiva: '2026-10-16T17:15:00+02:00' } });
    await ses.registra('passo.aggiornato', 'GR', { passo: 'GR2', campi: { stato: 'saltato', motivo: 'referente uscito' } });
    await ses.registra('passo.aggiornato', 'GR', { passo: 'RIP', campi: { stato: 'eseguito', oraEffettiva: '2026-10-16T18:30:00+02:00' } });
    expect(ses.stato.esiti.GR.stato).toBe('parziale');
    expect(statoElemento(s, ses.stato, s.elementi.find((e) => e.id === 'GR')!)).toBe('completo');
    const aperti = apertiA(s, ses.stato, 'CMP').map((e) => e.id);
    expect(aperti).toContain('TAB-CMP');
    expect(aperti).not.toContain('F36');
  });

  it('esporta un checkpoint verificabile in Python', async () => {
    const r = await generaTuttiIReport(ses, {}, true);
    const p = await costruisciPacchetto(ses, 'checkpoint', r);
    checkpoint1 = await salva(p);
    const out = verificaPython(checkpoint1);
    expect(out).toContain('INTEGRO');
    expect(out).not.toContain('NON INTEGRO');
    await ses.registra('checkpoint.esportato', null, { nomeFile: p.volumi[0].nome, tipo: 'checkpoint', aSeq: p.aSeq, hashFinale: p.hashFinale });
    await ses.registra('checkpoint.confermato', null, { nomeFile: p.volumi[0].nome, aSeq: p.aSeq, hashFinale: p.hashFinale, evidenze: p.evidenzeIncluse, nSostanziali: p.nSostanziali });
    const { contaModificheNonEsportate } = await import('../src/dominio/completezza');
    expect(contaModificheNonEsportate(ses.istanza.aSeq, ses.stato)).toBe(0);
    expect(Object.keys(ses.stato.evidenzeEsportate).length).toBe(p.evidenzeIncluse.length);
  });

  it('chiude con firme, deroghe e pacchetto finale sigillato', async () => {
    await ses.nota('Rumore di perdita vicino al serbatoio', ['F35'], 'CMP');
    await ses.registra('deroga.registrata', null, { codice: 'TAB-CMP', motivo: 'colonne η e h/g da chiedere per iscritto' });
    await ses.registra('area.chiusa', null, { area: 'CMP', conDeroga: true });
    await ses.registra('verbale.aggiornato', null, { puntiAperti: [...ses.stato.verbale.puntiAperti, { testo: 'Seconda lettura contaore', responsabile: 'Referente', entro: '23/10/2026' }] });
    await ses.registra('sopralluogo.chiuso', null);
    const c = contenutoVerbale(ses.struttura, ses.stato);
    const impronta = await sha256(testoPerFirma(c));
    for (const f of ses.struttura.verbale!.firme) {
      const ev = await ses.acquisisci({ blob: blobDa('tests/fixture/firma.png', 'image/png'), tipo: 'firma', fonte: 'schermo', area: 'CHIUSURA' });
      await ses.registra('verbale.firmato', null, { firma: { id: f.id, ruolo: f.ruolo, nome: f.parte === 'redattore' ? 'ing. Mario Rossi' : 'Anna Bianchi', evidenza: ev.id, il: ev.acquisitaIl, sha256ContenutoFirmato: impronta } });
    }
    expect(dichiarazioniDaConfermare(ses.struttura, ses.stato).join()).toContain('Q17');
    const r = await generaTuttiIReport(ses, { fotoPerPagina: 2 });
    for (const x of r) if (x.nome.endsWith('.pdf')) writeFileSync(join(OUT, x.nome.split('/').pop()!), x.dati as Uint8Array);
    writeFileSync(join(OUT, 'report_dettagliato.html'), r.find((x) => x.tipo === 'reportDettagliato')!.dati as Uint8Array);
    const p = await costruisciPacchetto(ses, 'finale', r);
    finale = await salva(p);
    const out = verificaPython(finale);
    expect(out).toContain('INTEGRO');
    expect(out).not.toContain('NON INTEGRO');
  });

  it('lo stato materializzato coincide con la ricostruzione dal registro', async () => {
    const righe = await ses.eventi();
    const st = ricostruisci(ses.struttura, righe.map((r) => JSON.parse(r.riga) as Evento));
    const salvato = (await db().stati.get(ses.istanza.id))!.stato;
    expect(JSON.parse(JSON.stringify(st))).toEqual(JSON.parse(JSON.stringify(salvato)));
    expect(await ses.verificaRegistro()).toEqual([]);
  });

  it('ripristina dal finale in una nuova istanza, due volte senza collisioni', async () => {
    const files = [...finale, ANDATA].map((f) => ({ nome: f.split('/').pop()!, blob: blobDa(f) }));
    const a = await analizzaRipristino(files);
    const id1 = await eseguiRipristino(a);
    const id2 = await eseguiRipristino(await analizzaRipristino(files));
    expect(new Set([id1, id2, ses.istanza.id]).size).toBe(3);
    for (const id of [id1, id2]) {
      const r = await Sessione.apri(id);
      expect(await r.verificaRegistro()).toEqual([]);
      expect(r.stato.esiti).toEqual(ses.stato.esiti);
      expect(Object.keys(r.stato.evidenze).sort()).toEqual(Object.keys(ses.stato.evidenze).sort());
      expect(await r.figura('FIG1')).toBeTruthy();
      expect(r.stato.ripristini.length).toBe(1);
    }
    // l'originale resta intatto
    expect(await ses.verificaRegistro()).toEqual([]);
  });

  it('ripristina dalla catena andata + checkpoint', async () => {
    const files = [...checkpoint1, ANDATA].map((f) => ({ nome: f.split('/').pop()!, blob: blobDa(f) }));
    const id = await eseguiRipristino(await analizzaRipristino(files));
    const r = await Sessione.apri(id);
    expect(await r.verificaRegistro()).toEqual([]);
    expect(r.stato.esiti.L03.stato).toBe('completa');
  });

  it('divide in volumi e ogni volume è verificabile', async () => {
    const r = await generaTuttiIReport(ses, {}, true);
    const p = await costruisciPacchetto(ses, 'finale', r, 0.05);
    expect(p.volumi.length).toBeGreaterThan(1);
    const vol = await salva(p);
    const out = verificaPython(vol);
    expect(out).toContain('INTEGRO');
    expect(out).not.toContain('NON INTEGRO');
    const parziale = verificaPython(vol.slice(1));
    expect(parziale).toContain('NON INTEGRO');
  });

  it('rileva manomissioni del registro sul dispositivo', async () => {
    const d = db();
    const r = await d.eventi.get([ses.istanza.id, 3]);
    await d.eventi.put({ ...r!, riga: r!.riga.replace('"si"', '"no"') });
    expect((await ses.verificaRegistro()).length).toBeGreaterThan(0);
    await d.eventi.put(r!);
    expect(await ses.verificaRegistro()).toEqual([]);
  });

  it('con memoria piena non salva nulla e lo dice', async () => {
    const d = db();
    const prima = ses.istanza.aSeq;
    const orig = d.blob.put.bind(d.blob);
    (d.blob as unknown as { put: unknown }).put = () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; return Promise.reject(e); };
    await expect(ses.acquisisci({ blob: foto(3), tipo: 'foto', fonte: 'fotocamera', elementi: ['F35'], area: 'CMP' })).rejects.toBeInstanceOf(ErroreArchivio);
    (d.blob as unknown as { put: unknown }).put = orig;
    expect(ses.istanza.aSeq).toBe(prima);
    expect((await db().istanze.get(ses.istanza.id))!.aSeq).toBe(prima);
    expect(await ses.verificaRegistro()).toEqual([]);
    // dopo, si riprende normalmente
    await ses.acquisisci({ blob: foto(3), tipo: 'foto', fonte: 'fotocamera', elementi: ['F35'], area: 'CMP' });
    expect(ses.istanza.aSeq).toBe(prima + 1);
  });
});
