// Esportazione: checkpoint incrementale, pacchetto finale sigillato, report in bozza.
import { useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import { costruisciPacchetto } from '../pacchetti/rientro';
import { generaTuttiIReport, generaVerbale, generaFascicolo, generaSintetico, generaDettagliato, type OpzioniReport } from '../report/genera';
import { impostazione } from '../archivio/db';
import { contaModificheNonEsportate } from '../dominio/completezza';
import { consegnaFile } from './evidenze';
import { prova, conferma, avvisa, messaggio } from './comuni';
import { dataOra } from '../util/base';

async function opzioniReport(bozza: boolean): Promise<OpzioniReport> {
  return { bozza, fotoPerPagina: await impostazione<1 | 2 | 4>('fotoPerPagina', 2), intestazione: await impostazione('intestazione', 'MC Studio Architettura e Design S.r.l.') };
}

export function VistaEsporta({ ses }: { ses: Sessione }) {
  const st = ses.stato;
  const [lavoro, setLavoro] = useState<string | null>(null);
  const nonEsp = contaModificheNonEsportate(ses.istanza.aSeq, st);
  const ultimo = st.checkpoint.confermati.at(-1);
  const nuoveEv = Object.values(st.evidenze).filter((e) => e.file && !st.evidenzeEsportate[e.id]);
  const byteNuovi = nuoveEv.reduce((a, e) => a + (e.byte ?? 0), 0);
  const chiuso = st.statoSopralluogo === 'chiuso';
  const firmeOk = (ses.struttura.verbale?.firme ?? []).every((f) => st.verbale.firme.some((x) => x.id === f.id));

  const esegui = async (tipo: 'checkpoint' | 'finale') => {
    if (tipo === 'finale' && !firmeOk && !(await conferma('Verbale non firmato da tutti', 'Esportare comunque il pacchetto finale?', { ok: 'Esporta' }))) return;
    setLavoro(tipo === 'finale' ? 'Genero report e pacchetto finale…' : 'Preparo il checkpoint…');
    try {
      const report = await generaTuttiIReport(ses, await opzioniReport(false), tipo === 'checkpoint');
      const p = await prova(async () => costruisciPacchetto(ses, tipo, report, await impostazione('sogliaVolumiMB', 400)));
      if (!p) return;
      await prova(() => ses.registra('checkpoint.esportato', null, { nomeFile: p.volumi.map((v) => v.nome).join(' + '), tipo, aSeq: p.aSeq, hashFinale: p.hashFinale }));
      setLavoro(null);
      for (const [i, v] of p.volumi.entries()) {
        if (p.volumi.length > 1) await messaggio(`Volume ${i + 1} di ${p.volumi.length}`, `Salva il volume «${v.nome}» (${Math.round(v.blob.size / 1048576)} MB). Servono tutti i volumi.`);
        const fatto = await consegnaFile(v.nome, v.blob, `Sopralluogo ${ses.struttura.pratica.codice}`);
        if (!fatto) { avvisa('Esportazione annullata: nulla risulta salvato', true); return; }
      }
      const salvato = await conferma('Hai salvato il file?', `Conferma solo se ${p.volumi.length > 1 ? 'tutti i volumi sono stati salvati' : `«${p.volumi[0].nome}» è stato salvato`} su OneDrive o in File. Fino alla conferma le modifiche risultano non esportate.`, { ok: 'Sì, salvato', annulla: 'No' });
      if (salvato) await prova(() => ses.registra('checkpoint.confermato', null, { nomeFile: p.volumi.map((v) => v.nome).join(' + '), aSeq: p.aSeq, hashFinale: p.hashFinale, evidenze: p.evidenzeIncluse, nSostanziali: p.nSostanziali }), tipo === 'finale' ? 'Pacchetto finale salvato' : 'Checkpoint salvato');
    } finally { setLavoro(null); }
  };

  const bozza = async (nome: string, f: () => Promise<Uint8Array>, tipo: string) => {
    setLavoro(`Genero ${nome}…`);
    try {
      const d = await prova(f);
      if (d) await consegnaFile(nome, new Blob([d as BlobPart], { type: tipo }), nome);
    } finally { setLavoro(null); }
  };

  return <>
    <h1>Esporta</h1>
    <div class="card">
      <p>Registro: <b>{ses.istanza.aSeq}</b> eventi · modifiche non esportate: <b>{nonEsp}</b><br />
        Evidenze non ancora esportate: <b>{nuoveEv.length}</b> ({Math.round(byteNuovi / 1048576 * 10) / 10} MB)<br />
        Ultimo salvataggio confermato: {ultimo ? `${dataOra(ultimo.il)} — ${ultimo.nomeFile}` : 'nessuno'}</p>
      <button class="btn pri larga" disabled={!!lavoro} onClick={() => esegui('checkpoint')}>⇪ Checkpoint (solo le novità)</button>
      <p class="piccolo tenue">Salvalo nella cartella OneDrive della pratica. Con il pacchetto di andata e i checkpoint il sopralluogo si ricostruisce su un altro dispositivo.</p>
    </div>
    <div class="card">
      <h3>Pacchetto finale</h3>
      {!chiuso ? <p class="piccolo">Disponibile dopo la chiusura del sopralluogo (Altro → Verbale e chiusura).</p> : <>
        {!firmeOk && <p class="avviso piccolo">Il verbale non è ancora firmato da tutti.</p>}
        <p class="piccolo">Contiene tutte le evidenze, il registro, verbale, report dettagliato, report sintetico per il cliente, fascicolo fotografico, tabelle CSV, con impronte e sigillo.</p>
        <button class="btn ok larga" disabled={!!lavoro} onClick={() => esegui('finale')}>Esporta il pacchetto finale sigillato</button>
      </>}
    </div>
    <div class="card">
      <h3>Report singoli {chiuso ? '' : '(bozza)'}</h3>
      <div class="gruppo-btn">
        <button class="btn pic" disabled={!!lavoro} onClick={async () => bozza('verbale.pdf', async () => generaVerbale(ses, await opzioniReport(!chiuso)), 'application/pdf')}>Verbale</button>
        <button class="btn pic" disabled={!!lavoro} onClick={async () => bozza('fascicolo_fotografico.pdf', async () => generaFascicolo(ses, await opzioniReport(!chiuso)), 'application/pdf')}>Fascicolo fotografico</button>
        <button class="btn pic" disabled={!!lavoro} onClick={async () => bozza('report_sintetico_cliente.pdf', async () => generaSintetico(ses, await opzioniReport(!chiuso)), 'application/pdf')}>Sintetico per il cliente</button>
        <button class="btn pic" disabled={!!lavoro} onClick={async () => bozza('report_dettagliato.html', async () => generaDettagliato(ses, await opzioniReport(!chiuso)), 'text/html')}>Report dettagliato</button>
      </div>
    </div>
    {lavoro && <div class="modale-sfondo"><div class="modale"><p>{lavoro}</p><p class="piccolo tenue">Non chiudere l'app.</p></div></div>}
  </>;
}
