import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/app';
import './stile.css';

// L'aggiornamento non si applica da solo: si chiede conferma (con avviso se c'è un sopralluogo in corso).
const ascoltatori: (() => void)[] = [];
const aggiornamento = { pronto: false, applica: () => {}, ascolta: (f: () => void) => { ascoltatori.push(f); } };
const aggiornaSW = registerSW({
  immediate: true,
  onNeedRefresh() { aggiornamento.pronto = true; ascoltatori.forEach((f) => f()); },
});
aggiornamento.applica = () => { aggiornaSW(true); };
// controlla aggiornamenti all'apertura e ogni 30 minuti
async function cercaAggiornamenti() { try { const r = await navigator.serviceWorker?.getRegistration(); await r?.update(); } catch { /* offline */ } }
(window as unknown as { cercaAggiornamenti: () => Promise<void> }).cercaAggiornamenti = cercaAggiornamenti;
setInterval(cercaAggiornamenti, 30 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) cercaAggiornamenti(); });

navigator.storage?.persist?.().catch(() => undefined);
addEventListener('unhandledrejection', (e) => console.error('Errore non gestito', e.reason));

render(<App aggiornamento={aggiornamento} />, document.getElementById('app')!);
