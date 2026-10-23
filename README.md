# App di sopralluogo — MC Studio

App da installare su iPhone e tablet Android per gestire i sopralluoghi tecnici (diagnosi energetiche, perizie 4.0/5.0, Conto Termico, ISI, CTU).

**Indirizzo:** https://provenzanof70.github.io/webapp_sopralluogo/

- Il contenuto di ogni sopralluogo (verifiche, domande, foto, letture, misure, documenti, tabelle, anomalie, protocolli) arriva dal **pacchetto di andata** generato nel progetto della pratica dalla skill `sopralluogo-guida-schede-rilievo`.
- In campo l'app registra esiti, risposte con chi le ha date, letture con l'ora, foto e documenti con impronta SHA-256, audio, note, firme del verbale. Funziona senza rete.
- Esporta **checkpoint** durante la giornata e un **pacchetto finale sigillato** (verbale, report dettagliato, report sintetico per il cliente, fascicolo fotografico, tabelle CSV), da importare nella pratica con la skill `sopralluogo-rientro-evidenze`.
- **Nessun dato esce dal dispositivo** se non lo esporti tu. Questo repository contiene solo il programma e dati fittizi.

Documenti: `docs/GUIDA_RAPIDA.md` (uso in campo) · `docs/PROVE_SU_DISPOSITIVO.md` (collaudo su telefono) · `docs/ISTRUZIONI_CLAUDE_CODE.md` (specifica) · `docs/DECISIONI.md`.

Sviluppo: `npm install`, `npm test` (richiede Python 3 con `jsonschema`), `npm run build`. Ogni push su `main` esegue i test e pubblica su GitHub Pages.
