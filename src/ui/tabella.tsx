// Tabelle di rilievo: una scheda per riga su telefono, griglia su tablet.
import { useState } from 'preact/hooks';
import type { Sessione } from '../archivio/sessione';
import type { ElTabella, Esito, Colonna, DatoAtti, Cella } from '../dominio/tipi';
import { righeTabella, colonneDaCompilare } from '../dominio/stato';
import { statoCodice } from '../dominio/completezza';
import { prova, chiedi, motivo, parseNumero, Badge, conferma } from './comuni';
import { numIt } from '../util/base';
import { valoreFormattato } from '../report/contenuti';

function etichettaRiga(t: ElTabella, id: string, e?: Esito): string {
  const chiave = t.colonne.find((c) => c.chiave);
  const atti = t.righe?.find((r) => r.id === id)?.celle ?? {};
  const v = chiave ? (e?.celle?.[id]?.[chiave.id]?.valore ?? atti[chiave.id]?.valore) : undefined;
  return v != null && v !== '' ? `${id} — ${numIt(v)}` : id;
}

export function EditorTabella({ ses, el, e }: { ses: Sessione; el: ElTabella; e?: Esito }) {
  const righe = righeTabella(el, e);
  const [riga, setRiga] = useState<string | null>(null);
  const largo = typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;
  if (el.solaLettura) return <Griglia ses={ses} el={el} e={e} righe={righe} onRiga={() => undefined} />;
  return <>
    <p style="margin:6px 0;font-weight:600">{el.titolo}</p>
    {el.notaPiede && <p class="piccolo tenue">{el.notaPiede}</p>}
    {largo ? <Griglia ses={ses} el={el} e={e} righe={righe} onRiga={setRiga} /> : (
      <div class="card" style="padding:0">
        {righe.map((r) => (
          <button class="voce-lista" key={r} onClick={() => setRiga(riga === r ? null : r)}>
            <span class="cresce">{etichettaRiga(el, r, e)}</span>
            <Badge s={statoCodice(ses.struttura, ses.stato, r)} />
          </button>
        ))}
      </div>
    )}
    {riga && <Riga ses={ses} el={el} e={e} id={riga} onChiudi={() => setRiga(null)} />}
    {el.consentiRigheAggiuntive !== false && <button class="btn pic" style="margin-top:8px" onClick={async () => {
      const n = (e?.righeAggiunte ?? []).length + 1;
      const id = `${el.id}-N${n}`;
      await prova(() => ses.registra('riga.aggiunta', el.id, { riga: id }));
      setRiga(id);
    }}>+ Aggiungi riga</button>}
  </>;
}

function Griglia({ ses, el, e, righe, onRiga }: { ses: Sessione; el: ElTabella; e?: Esito; righe: string[]; onRiga: (r: string) => void }) {
  return (
    <div class="scorri"><table class="t">
      <thead><tr><th>Riga</th>{el.colonne.map((c) => <th>{c.etichetta}{c.unita ? ` [${c.unita}]` : ''}</th>)}</tr></thead>
      <tbody>{righe.map((r) => {
        const atti = el.righe?.find((x) => x.id === r)?.celle ?? {};
        return <tr key={r} onClick={() => onRiga(r)} style="cursor:pointer">
          <td><code>{r}</code></td>
          {el.colonne.map((c) => {
            const cel = e?.celle?.[r]?.[c.id];
            const a = atti[c.id];
            if (cel) return <td>{cel.stato === 'corretto' && a ? <s class="tenue">{numIt(a.valore)} </s> : null}<b>{valoreFormattato(cel.valore)}</b>{cel.stato === 'confermato' ? ' ✓' : ''}</td>;
            return <td style={a ? 'background:var(--atti)' : ''}>{a ? valoreFormattato(a.valore, a.unita) : ''}</td>;
          })}
        </tr>;
      })}</tbody>
    </table></div>
  );
}

function Riga({ ses, el, e, id, onChiudi }: { ses: Sessione; el: ElTabella; e?: Esito; id: string; onChiudi: () => void }) {
  const atti = el.righe?.find((r) => r.id === id)?.celle ?? {};
  const aggiunta = e?.righeAggiunte?.find((r) => r.id === id);
  const colonne = el.colonne.filter((c) => !c.solaLettura || atti[c.id]);
  return (
    <div class="modale-sfondo" onClick={(x) => { if (x.target === x.currentTarget) onChiudi(); }}>
      <div class="modale">
        <div class="riga"><h2 class="cresce" style="margin:0">{etichettaRiga(el, id, e)}</h2><button class="btn pic" onClick={onChiudi}>Fatto</button></div>
        <p class="piccolo tenue">{el.titolo}</p>
        {colonne.map((c) => <CellaEd key={c.id} ses={ses} el={el} riga={id} col={c} atti={atti[c.id]} cel={e?.celle?.[id]?.[c.id]} />)}
        {aggiunta && !aggiunta.annullata && <button class="btn pic per" onClick={async () => { if (await conferma('Annullare la riga aggiunta?', 'Resta nel registro come annullata.')) { await prova(() => ses.registra('riga.annullata', el.id, { riga: id })); onChiudi(); } }}>Annulla riga</button>}
        <p class="piccolo tenue" style="margin-top:10px">Colonne da compilare: {colonneDaCompilare(el).length}</p>
      </div>
    </div>
  );
}

function CellaEd({ ses, el, riga, col, atti, cel }: { ses: Sessione; el: ElTabella; riga: string; col: Colonna; atti?: DatoAtti; cel?: Cella }) {
  const [testo, setTesto] = useState(cel?.valore != null ? numIt(cel.valore) : '');
  const classi = Object.keys(ses.struttura.legenda?.classi ?? { M: '', F: '', S: '', D: '', R: '' });
  const salva = (c: Omit<Cella, 'il'> | null) => prova(() => ses.registra('cella.aggiornata', el.id, { riga, colonna: col.id, cella: c }));
  const conv = (s: string) => (col.tipoValore === 'numero' || col.tipoValore === 'intero' ? parseNumero(s) : s.trim() || null);
  const solaLettura = col.solaLettura || col.chiave && !!atti;
  return (
    <div style="border-top:1px solid var(--bordo);padding:8px 0">
      <div class="piccolo"><b>{col.etichetta}</b>{col.unita ? ` [${col.unita}]` : ''}</div>
      {atti && <div class="atti">Agli atti: <b>{valoreFormattato(atti.valore, atti.unita)}</b>{atti.classe ? ` · ${atti.classe}` : ''}{atti.origine ? ` (${atti.origine})` : ''}{atti.fonte ? ` · ${atti.fonte}` : ''}</div>}
      {solaLettura ? null : <>
        {cel && <p class="piccolo okbox" style="margin:4px 0">{cel.stato}: <b>{valoreFormattato(cel.valore)}</b>{cel.classe ? ` · ${cel.classe}` : ''}{cel.fonte ? ` · ${cel.fonte}` : ''}{cel.motivo ? ` · ${cel.motivo}` : ''}</p>}
        {atti ? (
          <div class="gruppo-btn">
            <button class="btn pic ok" onClick={() => salva({ stato: 'confermato', valore: atti.valore, valoreAgliAtti: atti.valore, classe: atti.classe, fonte: atti.fonte })}>Confermo</button>
            <button class="btn pic" onClick={async () => {
              const r = await chiedi(`Correggi ${col.etichetta}`, [
                { id: 'v', etichetta: 'Valore rilevato', valore: '', obbligatorio: true },
                { id: 'c', etichetta: 'Classe', tipo: 'scelta', scelte: classi, valore: 'R' },
                { id: 'f', etichetta: 'Fonte', obbligatorio: true },
              ], { testo: `Agli atti: ${numIt(atti.valore)}. Il valore agli atti resta registrato.` });
              if (r) await salva({ stato: 'corretto', valore: conv(r.v), valoreAgliAtti: atti.valore, classe: r.c, fonte: r.f });
            }}>Correggo</button>
            <button class="btn pic" onClick={async () => { const m = await motivo('Non verificabile'); if (m) await salva({ stato: 'nonVerificabile', valoreAgliAtti: atti.valore, motivo: m }); }}>Non verificabile</button>
            {cel && <button class="btn pic" onClick={() => salva(null)}>Azzera</button>}
          </div>
        ) : (
          <div class="riga">
            {col.tipoValore === 'siNo' ? (
              <div class="gruppo-btn">{['sì', 'no'].map((v) => <button class={`btn pic ${cel?.valore === v ? 'sel' : ''}`} onClick={() => salva({ stato: 'rilevato', valore: v, classe: cel?.classe ?? 'R' })}>{v}</button>)}</div>
            ) : col.tipoValore === 'scelta' && col.scelte?.length ? (
              <select value={String(cel?.valore ?? '')} onChange={(x) => salva({ stato: 'rilevato', valore: x.currentTarget.value, classe: cel?.classe ?? 'R' })}>
                <option value="">—</option>{col.scelte.map((s) => <option>{s}</option>)}
              </select>
            ) : (
              <input class="cresce" value={testo} inputMode={col.tipoValore === 'numero' || col.tipoValore === 'intero' ? 'decimal' : undefined}
                type={col.tipoValore === 'ora' ? 'time' : col.tipoValore === 'data' ? 'date' : 'text'}
                placeholder={col.tipoValore === 'codici' ? 'es. F24, F25' : ''}
                onInput={(x) => setTesto(x.currentTarget.value)}
                onBlur={() => { const v = conv(testo); if (v === null && !cel) return; if (v === null) salva(null); else if (v !== cel?.valore) salva({ stato: 'rilevato', valore: v, classe: cel?.classe ?? 'R', fonte: cel?.fonte }); }} />
            )}
            {cel && <select style="width:84px" value={cel.classe ?? ''} onChange={(x) => salva({ ...cel, classe: x.currentTarget.value })}>{classi.map((k) => <option>{k}</option>)}</select>}
          </div>
        )}
      </>}
    </div>
  );
}
