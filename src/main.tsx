import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/app';
import './stile.css';

// L'aggiornamento non si applica da solo: si chiede conferma e mai durante un sopralluogo in corso.
const ascoltatori: (() => void)[] = [];
const aggiornamento = { pronto: false, applica: () => {}, ascolta: (f: () => void) => { ascoltatori.push(f); } };
const aggiornaSW = registerSW({
  immediate: true,
  onNeedRefresh() { aggiornamento.pronto = true; ascoltatori.forEach((f) => f()); },
});
aggiornamento.applica = () => { aggiornaSW(true); };

navigator.storage?.persist?.().catch(() => undefined);
addEventListener('unhandledrejection', (e) => console.error('Errore non gestito', e.reason));

render(<App aggiornamento={aggiornamento} />, document.getElementById('app')!);
