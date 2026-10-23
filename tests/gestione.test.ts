import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { analizzaAndata, creaSopralluogo } from '../src/pacchetti/andata';
import { Sessione } from '../src/archivio/sessione';
import { eliminaSopralluogo, ripartiDaAndata, situazione } from '../src/archivio/gestione';
import { db, DbSopralluogo, impostaDb } from '../src/archivio/db';

const ANDATA = 'esempi/SOPRALLUOGO_ESEMPIO_20261016_ANDATA_rev001.zip';

describe('gestione dei sopralluoghi', () => {
  beforeAll(async () => { impostaDb(new DbSopralluogo('test-gestione')); await db().delete(); await db().open(); });

  it('ricomincia dallo ZIP già importato ed elimina senza lasciare residui', async () => {
    const id = await creaSopralluogo(await analizzaAndata(new Blob([readFileSync(ANDATA)]), 'andata.zip'));
    const ses = await Sessione.apri(id);
    await ses.registra('sopralluogo.avviato', null);
    await ses.acquisisci({ blob: new Blob([readFileSync('tests/fixture/foto1.jpg')], { type: 'image/jpeg' }), tipo: 'foto', fonte: 'fotocamera', elementi: ['F36'], area: 'CMP' });
    const sit = await situazione(id);
    expect(sit.nonEsportate).toBeGreaterThan(0);
    expect(sit.evidenzeNonEsportate).toBe(1);

    const nuovo = await ripartiDaAndata(id);
    expect(nuovo).not.toBe(id);
    const s2 = await Sessione.apri(nuovo);
    expect(s2.istanza.aSeq).toBe(1);
    expect(Object.keys(s2.stato.evidenze)).toHaveLength(0);
    expect(s2.struttura.idStruttura).toBe(ses.struttura.idStruttura);
    expect(await s2.figura('FIG1')).toBeTruthy();

    await eliminaSopralluogo(id);
    const d = db();
    expect(await d.istanze.get(id)).toBeUndefined();
    for (const t of [d.eventi, d.blob, d.miniature, d.figure]) expect(await (t as typeof d.blob).where('istanza').equals(id).count()).toBe(0);
    expect(await d.strutture.get(id)).toBeUndefined();
    // il nuovo resta intatto
    expect(await (await Sessione.apri(nuovo)).verificaRegistro()).toEqual([]);
  });
});
