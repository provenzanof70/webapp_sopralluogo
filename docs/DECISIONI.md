# Decisioni tecniche

- **Preact + TypeScript + Vite**: stessa API di React, pacchetto più leggero per il telefono.
- **Tipi scritti a mano** (`src/dominio/tipi.ts`) allineati agli schemi; la conformità è garantita da validatori Ajv **precompilati** (`scripts/genera-validatori.mjs`): nessun `eval` a runtime, compatibile con la CSP restrittiva.
- **IndexedDB (Dexie)** per tutto, blob compresi; OPFS non usato.
- **Registro a catena**: hash = SHA-256 dei byte UTF-8 della riga così come scritta; nessuna canonicalizzazione. Lo stato è ricostruibile dal solo registro (test).
- **Coda di scrittura seriale** per sopralluogo: hash calcolati fuori dalla transazione, scrittura di evento + stato + file in un'unica transazione, poi rilettura e verifica dell'impronta dei file.
- **Nome dei file delle evidenze fissato all'acquisizione** (`PREFISSO_AAAAMMGG_CODICE|INBOX_NNN.ext`): non cambia se l'evidenza viene ricollegata, così checkpoint e finale coincidono.
- **ZIP**: lettura dal Blob tramite directory centrale (voci STORED come fette, senza copia in memoria); scrittura con fflate sincrono (niente Worker), media in STORED. Volumi per restare sotto i 4 GB e nella memoria del telefono.
- **PDF con pdf-lib + font DejaVu Sans** (licenza libera, file in `public/fonts`): copre accenti e simboli (Δ, η, φ, ≤).
- **Aggiornamenti**: service worker in modalità «prompt»; l'aggiornamento si propone solo se non ci sono sopralluoghi in corso.
- **Hosting**: GitHub Pages da repository pubblico (solo codice e dati fittizi; `scripts/controlla-dati.mjs` in CI blocca file sospetti).
- **Firma**: canvas + PNG + impronta del testo firmato; firme invalidate se il verbale cambia.
