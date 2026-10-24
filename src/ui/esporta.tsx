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

/** Salva copia (checkpoint) o copia finale sigillata: genera, consegna il file, chiede conferma del salvataggio. */
export async function esportaPacchetto(ses: Sessione, tipo: 'checkpoint' | 'finale', setLavoro: (t: string | null) => void): Promise<boolean> {
  const st = ses.stato;
  const firmeOk = (ses.struttura.verbale?.firme ?? []).every((f) => st.verbale.firme.some((x) => x.id === f.id));
  if (tipo === 'finale' && !firmeOk && !(await conferma('Verbale non firmato da tutti', 'Salvare comunque la copia finale?', { ok: 'Salva' }))) return false;
  setLavoro(tipo === 'finale' ? 'Preparo report e copia finale…' : 'Preparo la copia…');
  try {
    const report = await generaTuttiIReport(ses, await opzioniReport(false), tipo === 'checkpoint');
    const p = await prova(async () => costruisciPacchetto(ses, tipo, report, await impostazione('sogliaVolumiMB', 400)));
    if (!p) return false;
    await prova(() => ses.registra('checkpoint.esportato', null, { nomeFile: p.volumi.map((v) => v.nome).join(' + '), tipo, aSeq: p.aSeq, hashFinale: p.hashFinale }));
    setLavoro(null);
    for (const [i, v] of p.volumi.entries()) {
      if (p.volumi.length > 1) await messaggio(`Parte ${i + 1} di ${p.volumi.length}`, `Salva la parte «${v.nome}» (${Math.round(v.blob.size / 1048576)} MB). Servono tutte le parti.`);
      const fatto = await consegnaFile(v.nome, v.blob, `Sopralluogo ${ses.struttura.pratica.codice}`);
      if (!fatto) { avvisa('Annullato: nulla risulta salvato', true); return false; }
    }
    const salvato = await conferma('Hai salvato il file?', `Conferma solo se ${p.volumi.length > 1 ? 'tutte le parti sono state salvate' : `«${p.volumi[0].nome}» è stato salvato`} su OneDrive o in File. Fino alla conferma le modifiche risultano da salvare.`, { ok: 'Sì, salvato', annulla: 'No' });
    if (salvato) await prova(() => ses.registra('checkpoint.confermato', null, { nomeFile: p.volumi.map((v) => v.nome).join(' + '), aSeq: p.aSeq, hashFinale: p.hashFinale, evidenze: p.evidenzeIncluse, nSostanziali: p.nSostanziali }), tipo === 'finale' ? 'Copia finale salvata' : 'Copia salvata');
    return !!salvato;
  } finally { setLavoro(null); }
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
  const esegui = (tipo: 'checkpoint' | 'finale') => esportaPacchetto(ses, tipo, setLavoro);

  const bozza = async (nome: string, f: () => Promise<Uint8Array>, tipo: string) => {
    setLavoro(`Genero ${nome}…`);
    try {
      const d = await prova(f);
      if (d) await consegnaFile(nome, new Blob([d as BlobPart], { type: tipo }), nome);
    } finally { setLavoro(null); }
  };

  return <>
    <h1>Salva copia</h1>
    <div class="card">
      {nonEsp ? <p><b>{nonEsp} modifiche</b> e <b>{nuoveEv.length} file</b> ({Math.round(byteNuovi / 1048576 * 10) / 10} MB) da salvare.</p> : <p class="okbox">Tutto salvato.</p>}
      <p class="piccolo tenue">Ultima copia: {ultimo ? `${dataOra(ultimo.il)} — ${ultimo.nomeFile}` : 'nessuna'}</p>
      <button class="btn pri larga grande" disabled={!!lavoro} onClick={() => esegui('checkpoint')}>Salva copia (solo le novità)</button>
      <p class="piccolo tenue">Mettila nella cartella OneDrive della pratica. Con lo ZIP di andata e le copie il sopralluogo si ricostruisce anche su un altro telefono.</p>
    </div>
    <div class="card">
      <h3>Copia finale sigillata</h3>
      {!chiuso ? <p class="piccolo">Si fa alla fine: Menu › Fine sopralluogo.</p> : <>
        {!firmeOk && <p class="avviso piccolo">Il verbale non è ancora firmato da tutti.</p>}
        <p class="piccolo">Contiene tutte le evidenze, il registro, verbale, report dettagliato, report sintetico per il cliente, fascicolo fotografico, tabelle CSV, con impronte e sigillo.</p>
        <button class="btn ok larga" disabled={!!lavoro} onClick={() => esegui('finale')}>Salva la copia finale sigillata</button>
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
