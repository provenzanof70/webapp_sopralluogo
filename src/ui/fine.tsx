// Fine sopralluogo in quattro passi: letture alla partenza, verbale (e chiusura), firme, copia finale.
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Sessione } from '../archivio/sessione';
import type { ElLettura } from '../dominio/tipi';
import { apertiA } from '../dominio/completezza';
import { contenutoVerbale, testoPerFirma } from '../report/contenuti';
import { prova, chiedi, conferma, vai, avvisa } from './comuni';
import { Firma } from './firma';
import { Icona, titoloBreve } from './voci';
import { esportaPacchetto } from './esporta';
import { sha256, soloOra, dataIt, isoLocale } from '../util/base';

/** Chiude il sopralluogo: le voci importanti ancora aperte diventano «non fattibili oggi» con un motivo unico. */
export async function chiudiSopralluogo(ses: Sessione): Promise<boolean> {
  const s = ses.struttura, st = ses.stato;
  const aperti = apertiA(s, st);
  if (aperti.length) {
    const r = await chiedi(`${aperti.length} voci importanti ancora aperte`, [
      { id: 'm', etichetta: 'Motivo (uno per tutte)', tipo: 'area', obbligatorio: true },
    ], { testo: aperti.slice(0, 12).map((e) => `• ${titoloBreve(e)}`).join('\n') + (aperti.length > 12 ? `\n… e altre ${aperti.length - 12}` : '') + '\n\nSe chiudi, restano nel verbale come non fattibili oggi con questo motivo. Per farle, annulla e vai in «Da fare».', ok: 'Segna e chiudi' });
    if (!r) return false;
    for (const e of aperti) await prova(() => ses.registra('deroga.registrata', null, { codice: e.id, motivo: r.m.trim() }));
  }
  if (!(await conferma('Chiudere il sopralluogo?', `Si registra l'ora di fine (${soloOra(isoLocale())}). Dopo si firmano il verbale e si salva la copia finale.`, { ok: 'Chiudi il sopralluogo' }))) return false;
  await prova(() => ses.registra('sopralluogo.chiuso', null), 'Sopralluogo chiuso');
  return true;
}

function Passo({ n, fatto, attivo, titolo, sotto, children }: { n: number; fatto: boolean; attivo: boolean; titolo: string; sotto: string; children?: ComponentChildren }) {
  return <div class={`passo-fine ${attivo ? 'attivo' : ''} ${!fatto && !attivo ? 'spento' : ''}`}>
    <div class="riga" style="flex-wrap:nowrap">
      <span class={`num ${fatto ? 'fatto' : attivo ? 'att' : ''}`}>{fatto ? <Icona n="ok" d={18} s={2.6} /> : n}</span>
      <div class="cresce"><div style="font-weight:600">{titolo}</div><div class="piccolo tenue">{sotto}</div></div>
    </div>
    {attivo && children}
  </div>;
}

export function FineSopralluogo({ ses }: { ses: Sessione }) {
  const s = ses.struttura, st = ses.stato, id = ses.istanza.id;
  const [impronta, setImpronta] = useState('');
  const [firmaDi, setFirmaDi] = useState<string | null>(null);
  const [lavoro, setLavoro] = useState<string | null>(null);
  useEffect(() => { sha256(testoPerFirma(contenutoVerbale(s, st))).then(setImpronta); }, [ses.versione]);
  const chiuso = st.statoSopralluogo === 'chiuso';

  // 1. letture alla partenza
  const conPartenza = s.elementi.filter((e): e is ElLettura => e.tipo === 'lettura' && e.momenti.includes('partenza'));
  const mancano = conPartenza.filter((e) => !st.esiti[e.id]?.valori?.some((v) => v.momento === 'partenza'));
  const oraPart = conPartenza.map((e) => st.esiti[e.id]?.valori?.find((v) => v.momento === 'partenza')?.il).filter(Boolean).sort()[0];
  const f1 = mancano.length === 0;
  const vaiLetture = () => {
    const g = mancano.find((e) => e.gruppo);
    if (g) return vai('s', id, 'contemporanee', g.gruppo!, 'partenza');
    if (mancano[0]) vai('s', id, 'a', mancano[0].area, mancano[0].id);
  };

  // 2. verbale e chiusura
  const presenti = Object.values(st.presenti).filter((p) => p.presente).map((p) => p.nome);
  const chiuse = s.aree.filter((a) => st.areeChiuse[a.id]).length;
  const promessi = s.elementi.filter((e) => e.tipo === 'documento' && st.esiti[e.id]?.stato === 'promesso');
  const perIscritto = Object.values(st.esiti).filter((e) => e.tipo === 'domanda' && e.daConfermarePerIscritto).length;

  // 3. firme
  const previste = s.verbale?.firme ?? [{ id: 'FIRMA-REDE', ruolo: 'Il tecnico', parte: 'redattore' as const }];
  const valide = previste.filter((f) => st.verbale.firme.some((x) => x.id === f.id && x.sha256ContenutoFirmato === impronta));
  const f3 = chiuso && !!impronta && valide.length === previste.length;

  // 4. copia finale
  const finale = st.checkpoint.confermati.find((c) => st.checkpoint.esportati.some((e) => e.nomeFile === c.nomeFile && e.tipo === 'finale'));
  const salta = location.hash.endsWith('/salta');
  const attivo = !f1 && !chiuso && !salta ? 1 : !chiuso ? 2 : !f3 ? 3 : !finale ? 4 : 0;

  return <>
    <h1 style="margin-bottom:2px">Fine sopralluogo</h1>
    <p class="piccolo tenue" style="margin-top:0">quattro passi, in ordine</p>
    <Passo n={1} fatto={f1} attivo={attivo === 1} titolo="Letture alla partenza" sotto={!conPartenza.length ? 'nessuna prevista' : f1 ? `fatte${oraPart ? ' alle ' + soloOra(oraPart) : ''}` : `mancano ${mancano.length}`}>
      <div class="due" style="margin-top:10px"><button class="btn" onClick={() => vai('s', id, 'fine', 'salta')}>Più tardi</button><button class="btn pri" onClick={vaiLetture}>Fai le letture</button></div>
    </Passo>
    <Passo n={2} fatto={chiuso} attivo={attivo === 2} titolo="Rileggi il verbale" sotto={chiuso ? `sopralluogo chiuso${st.chiusoIl ? ' alle ' + soloOra(st.chiusoIl) : ''}` : 'si compila da solo con quanto registrato'}>
      <div class="riepilogo">
        <div><b>Presenti:</b> {presenti.join(', ') || '—'}</div>
        <div><b>Aree chiuse:</b> {chiuse} di {s.aree.length}</div>
        {promessi.length > 0 && <div><b>Documenti promessi:</b> {promessi.map((d) => `${titoloBreve(d)}${st.esiti[d.id]?.promessoEntro ? ' entro ' + dataIt(st.esiti[d.id].promessoEntro!) : ''}`).join('; ')}</div>}
        {perIscritto > 0 && <div><b>Da confermare per iscritto:</b> {perIscritto} risposte</div>}
        {st.deroghe.length > 0 && <div><b>Non fattibili oggi:</b> {st.deroghe.length}</div>}
        {apertiA(s, st).length > 0 && <div style="color:var(--pA)"><b>Importanti ancora aperte:</b> {apertiA(s, st).length}</div>}
      </div>
      <div class="due" style="margin-top:10px">
        <a class="btn" href={`#/s/${id}/verbale`}>Modifica</a>
        <button class="btn pri" onClick={() => chiudiSopralluogo(ses)}>Va bene, chiudi</button>
      </div>
    </Passo>
    <Passo n={3} fatto={f3} attivo={attivo === 3} titolo="Firme" sotto={chiuso ? `${valide.length} di ${previste.length}` : 'cliente e tecnico, col dito'}>
      {previste.map((f) => {
        const fatta = st.verbale.firme.find((x) => x.id === f.id);
        const ok = fatta && fatta.sha256ContenutoFirmato === impronta;
        const persona = s.persone?.find((p) => p.id === f.persona);
        return <div class="riga" style="margin:10px 0;flex-wrap:nowrap">
          <span class="cresce"><b>{f.ruolo}</b><br /><small class="tenue">{fatta ? `${fatta.nome}${ok ? ' ✓' : ' — da ripetere: il verbale è cambiato'}` : persona?.nome ?? ''}</small></span>
          <button class={`btn ${ok ? '' : 'pri'}`} onClick={() => setFirmaDi(f.id)}>{fatta ? 'Rifirma' : 'Firma'}</button>
        </div>;
      })}
      <a class="piccolo" href={`#/s/${id}/verbale`}>Leggi il verbale completo</a>
    </Passo>
    <Passo n={4} fatto={!!finale} attivo={attivo === 4} titolo="Salva la copia finale" sotto={finale ? `salvata: ${finale.nomeFile}` : 'foto, verbale e report in un solo file sigillato'}>
      <button class="btn ok larga grande" style="margin-top:10px" disabled={!!lavoro} onClick={() => esportaPacchetto(ses, 'finale', setLavoro)}>Salva la copia finale</button>
    </Passo>
    {attivo === 0 && <div class="okbox" style="margin-top:12px"><b>Sopralluogo completato.</b> Rientrato in studio, nel progetto della pratica usa la skill di rientro con il file salvato.</div>}
    {firmaDi && (() => {
      const f = previste.find((x) => x.id === firmaDi)!;
      const persona = s.persone?.find((p) => p.id === f.persona);
      return <Firma titolo={`Firma — ${f.ruolo}`} sottotitolo="Chi firma conferma di aver letto il verbale." nome={persona?.nome ?? ''} onFine={async (r) => {
        setFirmaDi(null);
        if (!r) return;
        const imp = await sha256(testoPerFirma(contenutoVerbale(ses.struttura, ses.stato)));
        const ev = await prova(() => ses.acquisisci({ blob: r.png, tipo: 'firma', fonte: 'schermo', area: undefined, didascalia: `${f.ruolo} — ${r.nome}` }));
        if (ev) await prova(() => ses.registra('verbale.firmato', null, { firma: { id: f.id, ruolo: f.ruolo, nome: r.nome, evidenza: ev.id, il: ev.acquisitaIl, sha256ContenutoFirmato: imp } }), 'Firma salvata');
        else avvisa('Firma non salvata', true);
      }} />;
    })()}
    {lavoro && <div class="modale-sfondo"><div class="modale"><p>{lavoro}</p><p class="piccolo tenue">Non chiudere l'app.</p></div></div>}
  </>;
}
