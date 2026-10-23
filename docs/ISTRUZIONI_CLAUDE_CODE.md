# App di sopralluogo MC Studio — istruzioni per Claude Code

Versione 1.0 — 23/10/2026 — committente interno: ing. Francesco Provenzano, MC Studio Architettura e Design S.r.l. (EGE UNI CEI 11339, perito, CTU, DPO esterno).

Questo file è la specifica completa. Leggilo tutto prima di scrivere codice. Dove la specifica tace, scegli la soluzione più semplice che non metta a rischio i dati e annotala in `docs/DECISIONI.md`. Chiedi a Francesco solo ciò che non puoi decidere da qui (vedi § 15).

---

## 0. Il kit che hai ricevuto

| Percorso | Contenuto | Ruolo |
|---|---|---|
| `docs/ISTRUZIONI_CLAUDE_CODE.md` | questo file | specifica |
| `schema/struttura-sopralluogo.v1.schema.json` | JSON Schema 2020-12 del file che l'app importa | **contratto di ingresso** |
| `schema/pacchetto-rientro.v1.schema.json` | JSON Schema del `manifest.json` che l'app esporta | **contratto di uscita** |
| `esempi/struttura_esempio_fittizio.json` | struttura valida con tutti i tipi di elemento | fixture |
| `esempi/SOPRALLUOGO_ESEMPIO_20261016_ANDATA_rev001.zip` | pacchetto di andata completo (struttura + figura + manifest) | fixture di import |
| `esempi/SOPRALLUOGO_ESEMPIO_20261016_RIENTRO_finale_20261016-1835.zip` | pacchetto di rientro fittizio prodotto da script | **riferimento di formato** per l'export |
| `strumenti/verifica_struttura.mjs` | validatore schema + controlli semantici | da riusare nell'app (stessa logica) |
| `strumenti/crea_pacchetto_andata.py` | crea lo ZIP di andata | usato dalla skill di progetto |
| `strumenti/verifica_pacchetto_rientro.py` | verifica integrità del rientro | usato dalla skill di rientro; **il tuo export deve superarlo** |
| `strumenti/genera_rientro_fittizio.py` | genera il rientro di esempio | riferimento eseguibile del formato |

Gli schemi sono il contratto con due skill che girano nei progetti di Francesco sul PC (Claude desktop):
- **andata** — la skill `sopralluogo-guida-schede-rilievo` genera, dalla stessa base dati, il PDF di campo (copia di sicurezza su carta) e il pacchetto ZIP di andata per l'app;
- **rientro** — la skill `sopralluogo-rientro-evidenze` importa nella pratica lo ZIP che l'app esporta.

Non cambiare gli schemi in modo incompatibile. Se serve un campo nuovo: aggiungilo come facoltativo, alza la versione minore (`1.1.0`), aggiorna esempi e test, e scrivi in `docs/MODIFICHE_SCHEMA.md` cosa cambia per le skill, così Francesco le fa aggiornare.

---

## 1. Obiettivo

Un'app unica da usare in sopralluogo su **iPhone** e **tablet Android**, che:
1. importa il pacchetto di andata della pratica (tutto ciò che va verificato, chiesto, fotografato, letto, misurato, ritirato viene dal progetto, **mai inventato dall'app**);
2. guida il giro area per area e registra esiti, risposte, letture con ora, misure, foto, audio, documenti fotografati, note, firme;
3. **non perde mai un dato** e rende ogni evidenza verificabile (SHA-256 all'acquisizione, registro a catena);
4. esporta checkpoint durante la giornata e, a fine sopralluogo, un pacchetto finale sigillato con verbale firmato, report dettagliato, report sintetico per il cliente, fascicolo fotografico e tabelle CSV;
5. funziona **offline** per l'intera giornata (centrali termiche interrate, cabine, capannoni senza campo).

### 1.1 Principi non negoziabili

1. **Nessuna perdita di dati.** Ogni acquisizione è scritta in modo durevole prima che l'interfaccia la mostri come salvata. Niente pulsante «Salva».
2. **Niente si cancella in campo.** Annullare = marcare con motivo; l'oggetto resta nel pacchetto.
3. **Agli atti ≠ rilevato.** Un dato agli atti si conferma o si corregge; il valore originale resta sempre accanto a quello rilevato.
4. **Ogni dato porta classe e fonte** (M misurato, F documentale, S stimato, D dichiarato, R riscontrato… — la legenda viene dalla struttura).
5. **Ogni lettura porta l'ora** al minuto, registrata in automatico; una correzione manuale dell'ora conserva l'ora automatica e il motivo.
6. **Zero rete per i dati.** L'app non invia nulla a nessun server. Nessuna analitica, nessun CDN a runtime, nessun font remoto.
7. **Tono prudente.** I testi generati dall'app (verbale, report) non contengono conclusioni: riportano fatti, dichiarazioni attribuite e punti aperti.
8. **L'app è generica.** Nessun contenuto specifico di una pratica o di un tipo di pratica è scritto nel codice: aree, codici, tabelle e colonne arrivano dalla struttura.

---

## 2. Contesto d'uso (progetta per questo)

- Un tecnico (Francesco), a volte un collaboratore; un sopralluogo dura 2–8 ore; 100–400 foto (3–6 MB l'una), qualche audio, 5–30 documenti fotografati.
- Uso a una mano, in piedi, con luce forte o scarsa, a volte con guanti; tempi stretti: l'app deve far risparmiare tempo, non chiederne.
- Dispositivi: iPhone recente (Safari, iOS ≥ 17) e tablet Android (Chrome ≥ 120). Su tablet layout a due colonne.
- Batteria e memoria possono scarseggiare; il telefono può bloccarsi, riavviarsi o chiudere l'app in qualsiasi momento.
- Il PDF di campo stampato resta in cartellina come **copia di sicurezza**: l'app non lo sostituisce sul piano legale, ma è lo strumento principale.
- Le stesse pratiche possono essere diagnosi energetiche (UNI CEI EN 16247), perizie 4.0/5.0, Conto Termico, ISI INAIL, CTU.

---

## 3. Architettura e stack

- **PWA installabile**, offline-first, pubblicata su **GitHub Pages** (HTTPS). Si installa da Safari («Aggiungi a Home») e da Chrome («Installa app»).
- **TypeScript** stretto, **Vite**, **React** (oppure Preact se preferisci, motivandolo in DECISIONI), CSS semplice con variabili (tema chiaro/scuro e modalità «alto contrasto per esterni»).
- **IndexedDB** con **Dexie** per dati e blob (originali delle evidenze, miniature). Valuta OPFS solo come ottimizzazione documentata; il ripristino non deve dipenderne.
- **Ajv 2020 + ajv-formats** per validare la struttura in import (riusa la logica di `strumenti/verifica_struttura.mjs`, inclusi i controlli semantici e i messaggi per tipo).
- **fflate** (o equivalente puro JS) per ZIP in lettura e scrittura, a blocchi, senza caricare tutto in memoria quando evitabile.
- **pdf-lib** con un font incorporato (es. Noto Sans o Inter, licenza OFL) per verbale, report sintetico e fascicolo fotografico. Tutto in italiano con accenti corretti.
- **vite-plugin-pwa** (Workbox) con precache completo dell'app; nessuna risorsa esterna.
- Hash: `crypto.subtle.digest('SHA-256', …)`.
- Nessun backend. Nessun account. Nessun cookie.

Struttura suggerita del repository:

```
/                      vite, package.json, README.md (in italiano)
/docs                  ISTRUZIONI_CLAUDE_CODE.md, DECISIONI.md, MODIFICHE_SCHEMA.md, GUIDA_RAPIDA.md, PROVE_SU_DISPOSITIVO.md
/schema                i due schemi (serviti anche dall'app pubblicata in /schema/…)
/esempi                fixture (solo dati FITTIZI)
/strumenti             script del kit
/src
  /dominio             tipi generati dagli schemi, regole di completezza, calcoli (Δ, coerenza)
  /archivio            Dexie, registro eventi, evidenze, quota/persistenza, migrazioni
  /pacchetti           import andata, export checkpoint/finale, ripristino, volumi
  /report              verbale PDF, report dettagliato HTML, report sintetico PDF, fascicolo fotografico PDF, CSV
  /ui                  schermate e componenti
/tests                 unità (Vitest) e e2e (Playwright: WebKit + Chromium mobile)
/.github/workflows     build, test, deploy su Pages
```

Genera i tipi TypeScript dagli schemi (es. `json-schema-to-typescript`) in fase di build, così app e schema non divergono.

---

## 4. Modello dei dati

### 4.1 Struttura (ingresso) — vedi `schema/struttura-sopralluogo.v1.schema.json`

Sintesi:
- `pratica`, `persone`, `legenda` (priorità A/B/C, classi, origini, provenienza delle risposte R/D, formule), `regoleCampo`;
- `obiettivi` (O1…On) e `nonLasciare` (le «20 cose da non lasciare», ognuna con `rif` ai codici: **lo stato si calcola**);
- `preparazione` (prima di partire), `strumenti` (con limiti), `programma` (fasce orarie → aree);
- `aree` ordinate (id breve = cartellino da inquadrare nella prima foto dell'area);
- `elementi`, tutti con `id` (codice univoco: F24, Q05, L01, M13, D16, Z01, TAB-CMP…), `tipo`, `area`, `ordine`, `priorita`, `rif`, `riservato`:

| tipo | in campo si registra |
|---|---|
| `verifica` | esito: confermato / corretto / difforme / non verificabile / da integrare; valore rilevato con classe e fonte; evidenze |
| `domanda` | risposta (testo, dettatura da tastiera), **chi l'ha data** (persona o testo libero), provenienza R/D, «da confermare per iscritto» |
| `foto` | scatti (≥ `scattiMinimi`, default 2: insieme + dettaglio) oppure «non disponibile» con motivo |
| `lettura` | valori per grandezza e per momento (arrivo / intermedia / partenza / unica), ora automatica, foto collegate; `gruppo` = letture contemporanee |
| `misura` | valori per grandezza e ripetizione, strumento usato, «indicativa» se lo strumento non è tarato |
| `documento` | ritirato originale / ritirato copia / fotografato / promesso entro (data + chi lo invia) / non disponibile; pagine fotografate |
| `anomalia` | esito: chiusa (con spiegazione) / limite (da dichiarare) / aperta; evidenze |
| `tabella` | celle agli atti (grigie) confermate o corrette; celle bianche rilevate; righe aggiunte |
| `protocollo` | per passo: ora effettiva, eseguito da, valori, saltato con motivo; ripristino con firma se richiesto |
| `uscitaArea` | controllo «prima di lasciare l'area»: stato calcolato dai `rif`, chiusura con deroga motivata |
| `informazione` | sola lettura (es. profilo dei carichi di base, avvertenze) |

- `figure` (planimetrie, schemi a blocchi) da consultare e **annotare**;
- `verbale` (testo con segnaposto, campi automatici, punti aperti precompilati, firme previste);
- `dopoSopralluogo` (promemoria mostrati a fine giornata).

### 4.2 Stato di campo

Ogni sopralluogo importato è un'istanza con `idSopralluogoLocale` (UUID). Stessa struttura importata due volte = due istanze distinte, mai sovrascritte.

Esiti: un record per codice, come in `schema/pacchetto-rientro.v1.schema.json` → `$defs/esito`. Le tabelle conservano per ogni cella `valoreAgliAtti` e `valore`.

Persone: si possono aggiungere presenti in campo (nome, ruolo, società, telefono, dalle/alle); quelle della struttura si marcano presenti/assenti.

Consensi (foto, registrazione audio): registrati all'apertura con ora. Se il consenso foto è «no» o «con limiti», l'app lo ricorda a ogni scatto.

### 4.3 Evidenze

Tipi: `foto`, `audio`, `documento` (pagine), `firma`, `annotazione` (figura annotata: nuova immagine, l'originale resta intatto), `nota` (testo).

Per ogni evidenza: UUID, SHA-256 dei **byte originali così come ricevuti**, byte, MIME, nome originale, fonte (fotocamera, galleria, file, microfono, schermo, tastiera), `acquisitaIl` (ISO 8601 con offset), data EXIF originale se presente, GPS (dal dispositivo solo se Francesco lo abilita nelle impostazioni; altrimenti dall'EXIF se presente), progressivo per tipo, elementi collegati (vuoto = **INBOX**), area, didascalia, `riservata`.

Regole:
- l'originale non si ricomprime, non si ruota, non si ritaglia: rotazioni e ritagli valgono solo per la visualizzazione e i report;
- miniature separate, generate dopo il salvataggio dell'originale;
- un'evidenza può essere collegata a più codici (es. targa dell'essiccatore → F37, Q18, Z02);
- **scatto rapido**: un pulsante sempre visibile scatta e collega al codice aperto, oppure mette in INBOX con area corrente; da INBOX si assegna dopo, anche in blocco;
- import da galleria/File: conserva i byte ricevuti; leggi EXIF (data, GPS, orientamento) senza alterarlo. Verifica sul dispositivo quale via (fotocamera in app, galleria, File) preserva l'originale su iOS e documentalo in `PROVE_SU_DISPOSITIVO.md` (iOS può convertire HEIC→JPEG o togliere metadati a seconda della via);
- audio: `MediaRecorder` (mp4/aac su iOS, webm/opus su Android); se il microfono non è disponibile, allegare un file audio esterno (es. registratore Plaud) con la stessa catena di hash.

### 4.4 Registro eventi a catena (`eventi.jsonl`)

Ogni modifica genera un evento append-only. Una riga = un oggetto JSON compatto (UTF-8, senza spazi superflui), con i campi:

```json
{"seq":12,"il":"2026-10-16T15:31:04+02:00","tipo":"esito.aggiornato","codice":"Q18","dati":{…},"prec":"<sha256 della riga precedente>"}
```

- `prec` della prima riga = 64 zeri;
- l'hash di una riga è lo **SHA-256 dei byte UTF-8 della riga esattamente come scritta** (senza il ritorno a capo): nessuna canonicalizzazione, si hasha il testo;
- `manifest.eventi.hashFinale` = hash dell'ultima riga;
- tipi minimi: `struttura.importata`, `sopralluogo.avviato`, `presenza.aggiornata`, `consenso.registrato`, `evidenza.acquisita`, `evidenza.collegata`, `evidenza.annullata`, `esito.aggiornato`, `cella.aggiornata`, `riga.aggiunta`, `passo.eseguito`, `area.chiusa`, `deroga.registrata`, `ora.corretta`, `verbale.firmato`, `checkpoint.esportato`, `checkpoint.confermato`, `sopralluogo.chiuso`, `ripristino.eseguito`;
- `dati` contiene il minimo per ricostruire lo stato (valori nuovi, non snapshot interi).

Lo stato corrente è materializzato in tabelle Dexie per velocità, ma **deve poter essere ricostruito dal solo registro + evidenze** (test obbligatorio). Il verificatore `strumenti/verifica_pacchetto_rientro.py` controlla questa catena.

---

## 5. Pacchetti

### 5.1 Andata (ingresso)

```
SOPRALLUOGO_<PREFISSO>_<AAAAMMGG>_ANDATA_rev<NNN>.zip
├── struttura.json
├── figure/<file>.png|jpg
├── campo/<pdf di campo>.pdf        (facoltativo: consultabile in app, pagina per capitolo)
└── MANIFEST_SHA256.txt             righe "<sha256>  <percorso>"
```

Import:
1. apertura dal selettore file (su iPhone compare OneDrive se installato) o condivisione verso l'app se supportato;
2. verifica di MANIFEST_SHA256 (ogni file) → validazione schema → controlli semantici → hash delle figure;
3. in caso di errore: messaggio chiaro in italiano, elenco puntuale («Q04: area XXX inesistente»), nessuna importazione parziale;
4. riepilogo prima di confermare: pratica, sito, data, revisione, conteggi per tipo e per priorità A;
5. se esiste già un sopralluogo con lo stesso `idStruttura`: chiedere se aprire quello esistente o crearne uno nuovo (mai sovrascrivere). Se esiste una revisione diversa della stessa pratica e data, avvisare.

Si importa anche uno ZIP che contiene solo `struttura.json` (per prove), ma con avviso.

### 5.2 Rientro (uscita) — riferimento eseguibile: `strumenti/genera_rientro_fittizio.py`

```
SOPRALLUOGO_<PREFISSO>_<AAAAMMGG>_RIENTRO_<checkpoint|finale>_<AAAAMMGG-HHMM>[_vol<NN>di<NN>].zip
├── manifest.json                    conforme a pacchetto-rientro.v1.schema.json
├── struttura.json                   byte-identico a quello importato
├── eventi.jsonl                     registro completo dalla seq 1
├── evidenze/foto/<PREFISSO>_<AAAAMMGG>_<CODICE|INBOX>_<NNN>.<ext>
├── evidenze/audio/…  evidenze/documenti/…  evidenze/firme/…  evidenze/annotazioni/…
├── report/                          (solo nel finale; CSV anche nei checkpoint)
│   ├── verbale.pdf
│   ├── report_dettagliato.html      autosufficiente, miniature incorporate
│   ├── report_sintetico_cliente.pdf
│   ├── fascicolo_fotografico.pdf
│   └── tabelle/<ID_TABELLA>.csv     UTF-8 con BOM, separatore «;», virgola decimale
├── hash.sha256                      "<sha256>  <percorso>" per ogni file tranne hash.sha256 e SIGILLO.txt, ordinato
└── SIGILLO.txt                      solo nel finale (vedi sotto)
```

- Nome delle evidenze: un'evidenza collegata a più codici prende il nome dal primo; il manifest elenca tutti i collegamenti.
- **Checkpoint**: contiene manifest ed `eventi.jsonl` completi, `struttura.json`, e solo le evidenze nuove dall'ultimo checkpoint confermato (`checkpointPrecedente` nel manifest). Una catena di checkpoint + andata deve bastare a ricostruire tutto.
- **Finale**: tutte le evidenze, tutti i report, `SIGILLO.txt`.
- **Volumi**: se il pacchetto supera la soglia (default 400 MB, configurabile), dividilo in volumi; ogni volume ha manifest identico (cambia solo `volume.numero`), `eventi.jsonl`, `struttura.json`, la propria parte di evidenze e il proprio `hash.sha256`; ogni file di evidenza sta in un solo volume.
- `SIGILLO.txt` (righe `chiave: valore`):
  ```
  SIGILLO PACCHETTO DI RIENTRO
  pratica: <codice>
  idStruttura: <uuid>
  idSopralluogoLocale: <uuid>
  creatoIl: <ISO>
  volume: <n>/<tot>
  sha256(hash.sha256): <hex>
  hashFinaleEventi: <hex>
  versioneApp: <semver>
  ```
- Consegna del file: Web Share API con file (`navigator.share({ files })`) → «Salva su File» / OneDrive; fallback: download. L'app non può sapere se il salvataggio è andato a buon fine: dopo la condivisione chiede «Hai salvato il file?» e registra `checkpoint.confermato` solo su conferma. Il contatore «modifiche non esportate» si azzera solo dopo conferma.
- **Il tuo export deve superare `python strumenti/verifica_pacchetto_rientro.py <zip> --schema schema/pacchetto-rientro.v1.schema.json`** (test in CI su pacchetti generati dall'app in e2e).

### 5.3 Ripristino

- Da un pacchetto finale, oppure da andata + catena di checkpoint (in ordine), oppure dai volumi di un finale.
- Verifica integrità completa prima di scrivere qualsiasi cosa; poi ricostruzione dal registro eventi.
- Il ripristino crea **sempre una nuova istanza** con nuovo `idSopralluogoLocale`, registra `ripristino.eseguito` con l'origine e continua la catena. Mai sovrascrivere un'istanza esistente, mai riusare gli id delle evidenze di un'altra istanza sullo stesso dispositivo senza verificarne l'hash (nella prima versione web c'era un bug proprio qui: test dedicato).
- Uso tipico: telefono rotto → si ripristina sul tablet e si continua.

---

## 6. Flusso in campo e schermate

### 6.1 Home

Elenco sopralluoghi sul dispositivo (pratica, sito, data, stato, modifiche non esportate, ultimo checkpoint). Azioni: Importa, Ripristina, Apri, Archivia (solo dopo export finale confermato), Elimina dal dispositivo (solo dopo export finale confermato e doppia conferma con digitazione del codice pratica).

Indicatori sempre visibili: spazio usato/disponibile (`navigator.storage.estimate()`), storage persistente sì/no, app installata sì/no (se no: banner che spiega come installarla e perché), versione.

### 6.2 Preparazione (prima di partire)

Checklist `preparazione` e `strumenti` con limiti; prova rapida di fotocamera, microfono, GPS (se abilitato), spazio libero stimato per N foto; pulsante «Avvia sopralluogo» (registra ora di inizio).

### 6.3 Sopralluogo — navigazione

- **Barra superiore**: pratica · area corrente · ora · contatore «non esportate» (diventa arancione oltre una soglia o dopo 45 minuti dall'ultimo checkpoint) · pulsante checkpoint.
- **Vista «Adesso»**: fascia del programma in corso, area suggerita, prossimo passo di protocollo con conto alla rovescia, letture contemporanee in scadenza.
- **Vista «Giro»**: aree in ordine con avanzamento (A fatte/tot, B, C), stato di uscita area.
- **Vista area**: intestazione (accompagnatore, orario, scopo, capitolo PDF, figure) e sezioni nell'ordine della struttura raggruppate per tipo: Verifiche · Domande · Tabelle · Letture e misure · Foto · Uscita area. Filtri: solo A, solo aperte.
- **Vista «Cosa manca»**: tutte le voci aperte per priorità e area; le «cose da non lasciare» con stato calcolato; obiettivi O con stato calcolato (completo / parziale / aperto) e campo nota.
- **Ricerca per codice** (digiti «Q18» e ci vai); ogni codice citato in un testo o in `rif` è un collegamento.
- **INBOX** delle evidenze non assegnate, con assegnazione rapida a un codice dell'area.
- **Ufficio**: documenti con stato (vista dedicata per area UFF o filtro «tutti i documenti»), scheda V.
- **Figure**: zoom, annotazione a penna (colori, spessore, testo, segnaposto con codice collegato), salvataggio come evidenza `annotazione`.
- **PDF di campo**: se presente nel pacchetto, consultabile alla pagina del capitolo dell'area.

### 6.4 Comportamenti per tipo (essenziali)

- **Verifica**: pulsanti grandi «Confermo agli atti» / «Correggo» (richiede valore, classe, fonte; propone di collegare una foto) / «Non verificabile» (motivo) / «Da integrare».
- **Domanda**: campo risposta; selettore «chi ha risposto» (presenti + testo libero); R/D obbligatorio; «da confermare per iscritto» predefinito su D. Se `temaSensibile`, mostra l'avviso «porre in forma tecnica neutra».
- **Foto**: anteprima con contatore scatti/minimi; leggibile e scopo sempre visibili; «Non disponibile» con motivo.
- **Lettura**: per ogni momento previsto, campi delle grandezze con tastiera numerica; l'ora si registra quando si conferma il valore; il **gruppo di letture contemporanee** ha una schermata dedicata con un unico pulsante «Ora comune» che fissa lo stesso minuto per tutte e avvisa se le conferme si allargano oltre 2 minuti. Alla partenza mostra arrivo, partenza, Δ e Δ/Δt (dove numerico) e il testo di `controlloCoerenza`.
- **Misura**: ripetizioni numerate, media mostrata (non sostituisce i valori), strumento usato (testo, con suggerimento dalla struttura), etichetta «indicativa» se previsto.
- **Documento**: stato con selettore; «promesso entro» con data e chi lo invia; fotografia delle pagine (multipagina) come evidenza `documento`.
- **Anomalia**: dato agli atti a confronto, dove si verifica (collegamenti), esito.
- **Tabella**: sul telefono una scheda per riga (celle grigie con conferma/correzione, celle bianche da compilare, tipi di valore rispettati); sul tablet griglia; «Aggiungi riga» se consentito (id automatico `<ID_TABELLA>-N<n>`); colonna `codici` = selettore di evidenze/codici.
- **Protocollo**: lista dei passi con orario previsto; pulsante «Eseguito ora» registra l'ora effettiva e chi esegue; avviso sonoro/vibrazione all'orario previsto se l'app è in primo piano (Wake Lock facoltativo per tenere lo schermo acceso durante il protocollo); «Saltato» con motivo; firma del ripristino se `firmaRipristino`.
- **Uscita area**: voci con stato calcolato dai `rif`; se restano voci A aperte, «Chiudi con deroga» chiede un motivo per ciascuna (evento `deroga.registrata`).

Regola di completezza di un codice (usata da uscita area, cose da non lasciare, obiettivi, cosa manca):
- verifica: esito diverso da aperto; domanda: risposta o non risposta/rinviata con nota; foto: scatti ≥ minimi o non disponibile; lettura: tutti i momenti previsti con tutti i valori; misura: tutte le ripetizioni; documento: stato diverso da aperto; anomalia: chiusa o limite; tabella: tutte le celle grigie confermate/corrette/non verificabili (le bianche contano come parziale); protocollo: tutti i passi eseguiti o saltati con motivo; righe di tabella e passi indirizzabili come codici.

### 6.5 Chiusura e verbale

1. Letture alla partenza (gruppo contemporanee).
2. Riepilogo anomalie Z con esito.
3. Verbale: testo introduttivo con segnaposto compilati; campi automatici (`elencoPresenti`, `elencoAree` visitate e non accessibili con motivo, `lettureRiferimento` arrivo/partenza, `documentiStato`, `dichiarazioniDaConfermare` = risposte con provenienza D), punti aperti precompilati + aggiunti, note fisse; tutto modificabile prima della firma.
4. **Firme col dito** (canvas, pointer events) per ciascuna firma prevista, con nome digitato; si salva PNG + ora + SHA-256 del testo del verbale mostrato al momento della firma. Modificare il verbale dopo una firma invalida le firme raccolte (vanno ripetute; le precedenti restano nel registro). È una firma elettronica semplice: il verbale cartaceo firmato resta possibile come alternativa (foto delle pagine come evidenza).
5. «Chiudi sopralluogo» → genera i report → export finale sigillato → schermata «Dopo il sopralluogo» con i promemoria della struttura.

---

## 7. Report generati

1. **Verbale** (PDF, A4 verticale): intestazione pratica, testo, campi, punti aperti, note fisse, firme con nome e ora, piè di pagina con SHA-256 del contenuto firmato e versione dell'app.
2. **Report dettagliato** (HTML autosufficiente, interno): tutte le aree e tutti i codici con esiti, valori agli atti a confronto, classi e fonti, risposte con chi le ha date, letture con ora, miniature cliccabili, deroghe, anomalie, registro riassunto, impronte. Ordinabile e filtrabile; stampabile.
3. **Report sintetico per il cliente** (PDF): dati generali, presenti, aree visitate, documenti promessi con data e chi li invia, dichiarazioni da confermare per iscritto, punti aperti. **Esclusi**: anomalie, note interne, elementi ed evidenze `riservati`, valutazioni.
4. **Fascicolo fotografico** (PDF): copertina (pratica, sito, data, redattore, logo facoltativo da impostazioni), indice per area con riferimento di pagina, schede foto numerate con codice, didascalia, area, ora; impaginazione 1, 2 o 4 foto per pagina; esclude annullate e riservate (opzione per includere le riservate nella versione interna).
5. **CSV delle tabelle** (`report/tabelle/<ID>.csv`): una riga per riga di tabella; per ogni colonna valore, stato (confermato/corretto/rilevato/non verificabile), valore agli atti, classe, fonte. Servono alla skill di rientro per riportare i dati nel modello della pratica.

I report si generano anche prima della chiusura in modalità «bozza» (filigrana BOZZA), senza sigillo.

---

## 8. Persistenza e sicurezza del dato

| Rischio | Contromisura obbligatoria |
|---|---|
| Crash, chiusura o riavvio durante l'acquisizione | Scrittura transazionale: blob originale + metadati + evento nella stessa transazione Dexie; rilettura e verifica dell'hash prima di mostrare «salvato»; se fallisce, messaggio esplicito e nuovo tentativo. |
| Lo storage viene svuotato dal sistema | `navigator.storage.persist()` all'avvio e indicatore; app installata su Home (su iOS le web app installate hanno uno storage proprio, non soggetto alla pulizia dei siti visitati); banner se non installata. |
| Spazio esaurito | Stima prima del sopralluogo; avviso all'80% e al 90%; a quota piena l'acquisizione si blocca con messaggio chiaro, mai in silenzio; suggerire un checkpoint e la rimozione di sopralluoghi già archiviati. |
| Telefono perso o rotto | Checkpoint incrementali (promemoria a fine area e ogni 45 minuti); ripristino su altro dispositivo. |
| Contestazione sull'integrità | SHA-256 all'acquisizione, registro a catena, manifest e sigillo; originali mai modificati. |
| Aggiornamento dell'app a metà sopralluogo | Il service worker nuovo **non si attiva** mentre c'è un sopralluogo «in corso»; si attiva solo su conferma esplicita a sopralluogo chiuso o senza sopralluoghi aperti. Migrazioni Dexie testate con dati della versione precedente. |
| Ora del dispositivo sbagliata | Registra sempre offset e fuso; all'avvio del sopralluogo mostra l'ora e chiede conferma visiva; correzioni manuali dell'ora tracciate. |
| Furto del dispositivo | PIN facoltativo dell'app (blocco dopo N minuti in background) oltre al blocco del telefono; nessun dato in chiaro fuori da IndexedDB; nessun dato nell'URL. |
| Perdita di dati per bug | Test di ricostruzione dal registro, test di ripristino round-trip, test di quota piena e di transazione interrotta (§ 11). |

---

## 9. Privacy e sicurezza (Francesco è DPO esterno: va fatto bene)

- Nessuna chiamata di rete con dati. CSP restrittiva nel `index.html`: `default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'`. Se una libreria richiede di più, documentalo e cerca un'alternativa.
- Nessuna analitica, nessun log remoto, nessun crash reporter esterno. Log locale degli errori esportabile a mano.
- **Il repository su GitHub Pages è pubblico** (piano gratuito): contiene solo codice e dati **fittizi**. Aggiungi un controllo in CI e un hook pre-commit che rifiutano ZIP, PDF, immagini e JSON fuori da `esempi/` e `public/`, e ogni file con nomi tipo `SOPRALLUOGO_*` fuori da `esempi/`. Nessun dato di clienti reali nei test.
- GPS disattivato per impostazione predefinita (attivabile); consenso foto e audio registrati per sopralluogo.
- Informativa breve nella pagina «Informazioni» dell'app: dove stanno i dati (solo sul dispositivo finché non si esporta), cosa contiene l'export, come cancellare.

---

## 10. Interfaccia

- Italiano, tono asciutto. Etichette brevi, codici sempre visibili.
- Bersagli tattili ≥ 48 px; pulsante di scatto rapido raggiungibile col pollice; nessuna azione distruttiva a portata di tocco accidentale.
- Leggibilità al sole: modalità alto contrasto; testo minimo 16 px.
- Colori di priorità A/B/C coerenti in tutta l'app e mai unico veicolo di significato (sempre anche la lettera).
- Celle e valori «agli atti» in grigio come nel PDF; valori rilevati in nero; correzioni evidenziate con il valore agli atti barrato accanto.
- Tablet: lista a sinistra, dettaglio a destra.
- Dettatura: il microfono della tastiera di sistema basta; non usare Web Speech API come requisito.
- Accessibilità: etichette ARIA, focus visibile, funzionamento con testo ingrandito.

---

## 11. Test

**Automatici (CI su ogni push):**
- schema: tutti gli esempi validi; un set di strutture non valide (una per errore) produce i messaggi attesi;
- import: pacchetto di andata dell'esempio; ZIP con manifest errato → rifiuto senza scritture;
- registro: catena coerente; manomissione di una riga rilevata; ricostruzione dello stato dal solo registro + evidenze = stato materializzato;
- export → verifica con `strumenti/verifica_pacchetto_rientro.py` (Python in CI) → **INTEGRO**; manifest valido contro lo schema;
- ripristino round-trip: export finale → nuovo profilo browser → ripristino → stessi esiti e stessi hash; ripristino della stessa struttura due volte → due istanze distinte senza collisioni (test del bug storico);
- checkpoint: andata + 3 checkpoint → ripristino completo;
- volumi: pacchetto oltre soglia → più volumi, tutti verificati;
- quota: simulazione di `QuotaExceededError` → nessuna perdita, messaggio corretto;
- transazione interrotta (chiusura pagina a metà scrittura, simulata) → nessun record orfano o, se presente, rilevato e segnalato all'avvio;
- completezza: regole del § 6.4 su casi limite;
- report: generazione su dati di esempio; il report sintetico non contiene codici `riservati`, anomalie, note interne (test che cerca stringhe);
- e2e Playwright su WebKit (iPhone) e Chromium (tablet): giro completo dell'esempio, foto simulate (file di prova), firme, chiusura, export.

**Su dispositivo (Francesco, guidato da `docs/PROVE_SU_DISPOSITIVO.md` che scrivi tu, passo passo e in italiano):**
1. installazione su iPhone e tablet; storage persistente attivo;
2. modalità aereo per tutto il test;
3. import del pacchetto di esempio da OneDrive;
4. 50 foto con fotocamera, 10 da galleria, 2 audio, 1 documento di 3 pagine;
5. chiusura forzata dell'app durante uno scatto e riavvio del telefono a metà giro → nessun dato perso;
6. checkpoint su OneDrive; ripristino del checkpoint sull'altro dispositivo e prosecuzione;
7. verbale con due firme, chiusura, export finale su OneDrive;
8. sul PC: `python verifica_pacchetto_rientro.py` → INTEGRO; controllo con PowerShell `Get-FileHash -Algorithm SHA256` di due foto contro `hash.sha256`;
9. prova di carico: 400 foto in un sopralluogo, tempi di apertura dell'area e di export annotati.

---

## 12. Piano di lavoro a fasi

Lavora per fasi. **Alla fine di ogni fase fermati** e scrivi a Francesco, in italiano e in breve: cosa è pronto, l'indirizzo pubblicato, cosa provare sul telefono (elenco numerato), limiti noti. Francesco risponde con correzioni numerate.

| Fase | Contenuto | Criterio di accettazione |
|---|---|---|
| **F0 — Fondamenta** | repo, CI (lint, type-check, test, verifica rientro in Python), deploy Pages, PWA installabile vuota, schemi e fixture nel repo, tipi generati, protezioni anti-dati-reali, `DECISIONI.md` | app installabile su iPhone e Android e apribile offline; CI verde |
| **F1 — Nucleo sicuro** | archivio Dexie, registro a catena, evidenze con hash, import andata con validazione, home, aree, verifiche, domande, foto (+ INBOX, scatto rapido), note, checkpoint, ripristino | test § 11 di registro, import, export/ripristino verdi; prove 1–6 su dispositivo superate |
| **F2 — Rilievo completo** | letture (gruppi contemporanei, Δ), misure, tabelle, documenti, anomalie, uscita area, cosa manca, cose da non lasciare, obiettivi, protocolli a orario, figure annotabili, PDF di campo consultabile, audio | giro completo dell'esempio su dispositivo senza ricorrere alla carta |
| **F3 — Chiusura e report** | verbale con firme, report dettagliato, sintetico, fascicolo fotografico, CSV, export finale sigillato, volumi | `verifica_pacchetto_rientro.py` → INTEGRO su export reale da iPhone e da tablet; report controllati da Francesco |
| **F4 — Robustezza** | PIN, politica di aggiornamento, quota, prova di carico 400 foto, guida rapida, informativa | prove 7–9 superate; `GUIDA_RAPIDA.md` di una pagina |

---

## 13. Cose da NON fare

- Non scrivere nel codice aree, codici o contenuti di una pratica.
- Non comprimere, ruotare o modificare gli originali delle evidenze.
- Non cancellare dati in campo; non sovrascrivere istanze.
- Non usare `localStorage` per dati di sopralluogo (solo preferenze di interfaccia).
- Non caricare script, font o stili da CDN.
- Non aggiungere account, sincronizzazioni automatiche o servizi cloud (eventuale sincronizzazione = fase futura, da concordare).
- Non introdurre dipendenze pesanti senza motivo scritto in `DECISIONI.md`.
- Non mettere dati reali nel repository.
- Non cambiare gli schemi in modo incompatibile.

---

## 14. Riferimenti

- Le schede cartacee di sopralluogo di Francesco (non nel repository: contengono dati di clienti) hanno guidato lo schema. La struttura delle schede è: copertina e presenti → come si usa (legenda, regole di campo) → obiettivi e 20 cose da non lasciare → prima di partire (stampe, strumenti e limiti, programma) → riunione di apertura → letture contemporanee → un capitolo per area (cosa verificare, domande, tabelle di rilievo, letture e misure, foto, prima di lasciare l'area) → ufficio (documenti, domande amministrative, scheda V, manutenzione, schema a blocchi da validare) → fine turno (protocolli a orario, anomalie Z) → chiusura e verbale firmato → dopo il sopralluogo → figure A3.
- Due prototipi precedenti a pagina singola (checklist con hash e ZIP sigillato; fascicolo fotografico con copertina, indice e impaginazione 1/2/4) possono essere forniti da Francesco come riferimento visivo in `docs/riferimenti/`: prendine le idee, non il codice.

---

## 15. Cosa chiedere a Francesco (solo questo, all'inizio)

1. Nome utente GitHub e nome del repository (proposta: `sopralluogo-mcstudio`).
2. Soglia dei volumi (proposta 400 MB) e intervallo del promemoria checkpoint (proposta 45 minuti).
3. Logo dello studio per il fascicolo fotografico (file) oppure solo testo «MC Studio Architettura e Design S.r.l.».

Tutto il resto è deciso in questo documento.
