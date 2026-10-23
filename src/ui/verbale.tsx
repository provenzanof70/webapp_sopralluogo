// Verbale, firme e chiusura del sopralluogo.
import { useEffect, useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import { contenutoVerbale, testoPerFirma } from '../report/contenuti';
import { apertiA } from '../dominio/completezza';
import { prova, chiedi, conferma, motivo, InputSalva, vai, avvisa } from './comuni';
import { Firma } from './firma';
import { titoloElemento } from './editori';
import { sha256, dataOra } from '../util/base';

export function VistaVerbale({ ses }: { ses: Sessione }) {
  const s = ses.struttura, st = ses.stato;
  const c = contenutoVerbale(s, st);
  const [impronta, setImpronta] = useState('');
  const [firmaDi, setFirmaDi] = useState<string | null>(null);
  useEffect(() => { sha256(testoPerFirma(c)).then(setImpronta); }, [ses.versione]);
  const chiuso = st.statoSopralluogo === 'chiuso';
  const previste = s.verbale?.firme ?? [{ id: 'FIRMA-REDE', ruolo: 'Il tecnico', parte: 'redattore' as const }];
  const nonValide = st.verbale.firme.filter((f) => impronta && f.sha256ContenutoFirmato !== impronta);
  const modificaVerbale = async (dati: Record<string, unknown>) => {
    if (st.verbale.firme.length && !(await conferma('Il verbale è già firmato', 'Modificandolo le firme raccolte non saranno più valide e andranno ripetute (restano nel registro).', { ok: 'Modifica comunque' }))) return false;
    await prova(() => ses.registra('verbale.aggiornato', null, dati));
    if (st.verbale.firme.length) await prova(() => ses.registra('firme.invalidate', null));
    return true;
  };
  const chiudi = async () => {
    const aperti = apertiA(s, st);
    if (aperti.length) {
      const ok = await conferma(`${aperti.length} voci di priorità A aperte`, aperti.slice(0, 25).map((e) => `${e.id} (${e.area}) — ${titoloElemento(e).slice(0, 70)}`).join('\n') + (aperti.length > 25 ? '\n…' : '') + '\n\nPer chiudere serve un motivo (deroga) per ciascuna. Procedere?', { ok: 'Registra le deroghe', annulla: 'Torno al giro' });
      if (!ok) return vai('s', ses.istanza.id, 'manca');
      for (const e of aperti) {
        const m = await motivo(`Deroga ${e.id}`, titoloElemento(e));
        if (!m) { avvisa('Chiusura interrotta'); return; }
        await prova(() => ses.registra('deroga.registrata', null, { codice: e.id, motivo: m }));
      }
    }
    const letturePartenza = s.elementi.filter((e) => e.tipo === 'lettura' && e.momenti.includes('partenza') && !st.esiti[e.id]?.valori?.some((v) => v.momento === 'partenza'));
    if (letturePartenza.length && !(await conferma('Letture alla partenza mancanti', letturePartenza.map((e) => e.id).join(', ') + '\nChiudere comunque?', { ok: 'Chiudi comunque', annulla: 'Le faccio ora' }))) {
      const g = letturePartenza.find((e) => e.tipo === 'lettura' && e.gruppo);
      if (g && g.tipo === 'lettura') vai('s', ses.istanza.id, 'contemporanee', g.gruppo!);
      return;
    }
    if (!(await conferma('Chiudere il sopralluogo?', 'Si registra l\'ora di fine. Poi si raccolgono le firme sul verbale e si esporta il pacchetto finale.'))) return;
    await prova(() => ses.registra('sopralluogo.chiuso', null), 'Sopralluogo chiuso');
  };
  return <>
    <h1>{c.titolo}</h1>
    {!chiuso && <div class="avviso">Il verbale si firma dopo la chiusura del sopralluogo (l'ora di fine fa parte del testo firmato). <button class="btn pic pri" onClick={chiudi}>Chiudi il sopralluogo</button></div>}
    {nonValide.length > 0 && <div class="errore">Il verbale è cambiato dopo la firma di {nonValide.map((f) => f.nome).join(', ')}: le firme vanno ripetute.
      <button class="btn pic" onClick={() => prova(() => ses.registra('firme.invalidate', null))}>Azzera le firme</button></div>}
    <div class="card">
      <p style="white-space:pre-wrap">{c.intro}</p>
      {c.sezioni.map((z) => <div><b>{z.titolo}</b><ul style="margin:4px 0 10px">{z.righe.map((r) => <li class="piccolo">{r}</li>)}</ul></div>)}
      {c.note.map((n) => <p class="piccolo tenue">{n}</p>)}
      <p class="piccolo tenue">Impronta del testo: <code style="word-break:break-all">{impronta}</code></p>
    </div>
    <details class="card"><summary><b>Modifica i campi</b> <small class="tenue">(vuoto = compilazione automatica)</small></summary>
      {(s.verbale?.campi ?? []).map((k) => <label class="campo"><span>{k.etichetta}</span>
        <InputSalva area valore={st.verbale.campi[k.id] ?? ''} placeholder="automatico" onSalva={(v) => modificaVerbale({ campi: { [k.id]: v } })} /></label>)}
      {!s.verbale?.testoIntroduttivo?.includes('{alle}') ? null : !chiuso && <label class="campo"><span>Ora di fine (se diversa dalla chiusura)</span><InputSalva tipo="time" valore={st.verbale.campi.__alle ?? ''} onSalva={(v) => modificaVerbale({ campi: { __alle: v } })} /></label>}
    </details>
    <div class="card"><h3>Punti aperti e impegni</h3>
      {st.verbale.puntiAperti.map((p, i) => <div class="riga" style="margin:6px 0"><span class="cresce piccolo">{i + 1}. {p.testo}{p.responsabile ? ` — ${p.responsabile}` : ''}{p.entro ? ` — entro ${p.entro}` : ''}</span>
        <button class="btn pic" onClick={() => modificaVerbale({ puntiAperti: st.verbale.puntiAperti.filter((_, j) => j !== i) })}>✕</button></div>)}
      <button class="btn pic" onClick={async () => {
        const r = await chiedi('Nuovo punto aperto', [{ id: 't', etichetta: 'Impegno', tipo: 'area', obbligatorio: true }, { id: 'r', etichetta: 'Responsabile' }, { id: 'e', etichetta: 'Entro (es. 30/10/2026)' }]);
        if (r) await modificaVerbale({ puntiAperti: [...st.verbale.puntiAperti, { testo: r.t, ...(r.r ? { responsabile: r.r } : {}), ...(r.e ? { entro: r.e } : {}) }] });
      }}>+ Aggiungi</button>
    </div>
    <div class="card"><h3>Aree non accessibili o non verificate</h3>
      {st.verbale.areeNonAccessibili.map((a, i) => <div class="riga piccolo"><span class="cresce">{a.area}: {a.motivo}</span><button class="btn pic" onClick={() => modificaVerbale({ areeNonAccessibili: st.verbale.areeNonAccessibili.filter((_, j) => j !== i) })}>✕</button></div>)}
      <button class="btn pic" onClick={async () => {
        const r = await chiedi('Area non accessibile', [{ id: 'a', etichetta: 'Area', tipo: 'scelta', scelte: s.aree.map((x) => x.id), valore: s.aree[0]?.id }, { id: 'm', etichetta: 'Motivo', tipo: 'area', obbligatorio: true }]);
        if (r) await modificaVerbale({ areeNonAccessibili: [...st.verbale.areeNonAccessibili, { area: r.a, motivo: r.m }] });
      }}>+ Aggiungi</button>
    </div>
    <div class="card"><h3>Firme</h3>
      {previste.map((f) => {
        const fatta = st.verbale.firme.find((x) => x.id === f.id);
        const persona = s.persone?.find((p) => p.id === f.persona);
        return <div class="riga" style="margin:8px 0">
          <span class="cresce"><b>{f.ruolo}</b><br /><small class="tenue">{fatta ? `${fatta.nome} — ${dataOra(fatta.il)}${fatta.sha256ContenutoFirmato !== impronta ? ' — NON PIÙ VALIDA' : ''}` : persona?.nome ?? ''}</small></span>
          <button class={`btn ${fatta ? '' : 'pri'}`} disabled={!chiuso} onClick={() => setFirmaDi(f.id)}>{fatta ? 'Rifirma' : 'Firma'}</button>
        </div>;
      })}
      <p class="piccolo tenue">Firma elettronica semplice. Se preferisci il verbale cartaceo, fotografalo firmato e allegalo come documento.</p>
    </div>
    {chiuso && st.verbale.firme.length >= previste.length && !nonValide.length && <a class="btn ok larga" href={`#/s/${ses.istanza.id}/esporta`}>Firme complete: esporta il pacchetto finale →</a>}
    {firmaDi && (() => {
      const f = previste.find((x) => x.id === firmaDi)!;
      const persona = s.persone?.find((p) => p.id === f.persona);
      return <Firma titolo={`Firma — ${f.ruolo}`} sottotitolo="Chi firma conferma di aver letto il verbale mostrato sopra." nome={persona?.nome ?? ''} onFine={async (r) => {
        setFirmaDi(null);
        if (!r) return;
        const imp = await sha256(testoPerFirma(contenutoVerbale(ses.struttura, ses.stato)));
        const ev = await prova(() => ses.acquisisci({ blob: r.png, tipo: 'firma', fonte: 'schermo', area: undefined, didascalia: `${f.ruolo} — ${r.nome}` }));
        if (ev) await prova(() => ses.registra('verbale.firmato', null, { firma: { id: f.id, ruolo: f.ruolo, nome: r.nome, evidenza: ev.id, il: ev.acquisitaIl, sha256ContenutoFirmato: imp } }), 'Firma salvata');
      }} />;
    })()}
  </>;
}
