// Radice dell'app: instradamento, blocco con PIN, politica di aggiornamento.
import { useEffect, useState } from 'preact/hooks';
import { useHash, OspiteModale, OspiteToast, avvisa } from './comuni';
import { Home, Impostazioni, Informazioni, applicaTema } from './home';
import { Sopralluogo } from './sopralluogo';
import { impostazione, db } from '../archivio/db';
import { sha256 } from '../util/base';

export function App({ aggiornamento }: { aggiornamento: { pronto: boolean; applica: () => void; ascolta: (f: () => void) => void } }) {
  const h = useHash();
  const [bloccata, setBloccata] = useState(false);
  const [agg, setAgg] = useState(aggiornamento.pronto);
  useEffect(() => { aggiornamento.ascolta(() => setAgg(true)); }, []);
  useEffect(() => {
    impostazione('tema', 'auto').then((t) => applicaTema(String(t)));
    impostazione('pinHash', '').then((p) => { if (p) setBloccata(true); });
    let nascostaDa = 0;
    const vis = async () => {
      if (document.hidden) { nascostaDa = Date.now(); return; }
      const p = await impostazione('pinHash', '');
      const min = await impostazione('pinMinuti', 5);
      if (p && nascostaDa && Date.now() - nascostaDa > min * 60000) setBloccata(true);
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);
  let pagina;
  if (h[0] === 's' && h[1]) pagina = <Sopralluogo key={h[1]} id={h[1]} percorso={h.slice(2)} />;
  else if (h[0] === 'impostazioni') pagina = <Impostazioni />;
  else if (h[0] === 'informazioni') pagina = <Informazioni />;
  else pagina = <Home />;
  return <>
    {agg && <BannerAggiornamento applica={aggiornamento.applica} />}
    {pagina}
    <OspiteModale />
    <OspiteToast />
    {bloccata && <Blocco onSblocca={() => setBloccata(false)} />}
  </>;
}

function BannerAggiornamento({ applica }: { applica: () => void }) {
  const [inCorso, setInCorso] = useState<boolean | null>(null);
  useEffect(() => { db().istanze.toArray().then((l) => setInCorso(l.some((i) => i.statoSopralluogo === 'inCorso'))); }, []);
  if (inCorso === null) return null;
  return <div class="avviso" style="margin:0;border-radius:0">
    {inCorso ? 'Aggiornamento dell\'app disponibile: verrà installato quando non ci sono sopralluoghi in corso (chiudili o esportali prima).'
      : <>Aggiornamento dell'app disponibile. <button class="btn pic pri" onClick={applica}>Aggiorna ora</button></>}
  </div>;
}

function Blocco({ onSblocca }: { onSblocca: () => void }) {
  const [pin, setPin] = useState('');
  return <div class="blocco"><form class="card" style="max-width:340px;width:100%" onSubmit={async (e) => {
    e.preventDefault();
    if ((await sha256('mcstudio-pin:' + pin)) === (await impostazione('pinHash', ''))) { setPin(''); onSblocca(); }
    else { avvisa('PIN errato', true); setPin(''); }
  }}>
    <h2>App bloccata</h2>
    <input type="password" inputMode="numeric" autoFocus value={pin} onInput={(e) => setPin(e.currentTarget.value)} placeholder="PIN" />
    <button class="btn pri larga" style="margin-top:10px">Sblocca</button>
  </form></div>;
}
