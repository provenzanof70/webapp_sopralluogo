# Guida rapida — app di sopralluogo (1.4)

## Una volta sola
1. Apri **https://provenzanof70.github.io/webapp_sopralluogo/**
   - iPhone: in **Safari** → Condividi → **Aggiungi alla schermata Home**.
   - Tablet Android: in **Chrome** → menu ⋮ → **Installa app**.
2. Apri l'app **dall'icona** (non dal browser): solo così funziona senza rete e i dati sono protetti.
3. Facoltativo: ⚙ Impostazioni → PIN, alto contrasto, GPS del telefono.

## Prima del sopralluogo
1. Nel progetto della pratica (Claude desktop) la skill `sopralluogo-guida-schede-rilievo` produce il PDF di campo e lo ZIP `SOPRALLUOGO_…_ANDATA_rev….zip`.
2. App → **+ Carica una pratica (ZIP)** → lo ZIP. L'app verifica impronte e struttura.
3. Stampa il PDF di campo: è la copia di sicurezza.

## In campo — quattro pulsanti in basso
- **Adesso**: l'area del momento con «Continua da …» (la prossima voce da fare), le manovre a orario con «Fatto ora», lo stato delle letture contatori. Prima di avviare puoi già guardare tutto: niente si registra finché non premi **Avvia il sopralluogo**.
- **Aree**: il giro in ordine; pallino verde = chiusa, arancione = avviata. Nell'area le voci sono righe brevi, raggruppate per oggetto (es. «DNM 6700L»). Filtro: **Da fare** (predefinito), **Solo importanti**, **Tutte**.
- **📷 al centro**: foto sulla voce aperta; se nessuna voce è aperta finisce in **Foto da assegnare**.
- **Da fare**: le voci importanti (A) ancora aperte, per area; documenti promessi; le cose da non lasciare.
- **Menu**: prima di partire, presenti e consensi, letture contatori, documenti, foto da assegnare, planimetrie, PDF di campo, salva copia, fine sopralluogo.

## Una voce
- Tocca la riga: si apre il pannello con titolo, testo, dato **agli atti** e i pulsanti principali (es. **Confermo** / **Correggo…** / **Foto**). Tutto il resto è in **Altre azioni** (galleria, file, audio, nota, non fattibile oggi, note).
- Sulle verifiche con dato agli atti puoi premere **Confermo** direttamente nella riga.
- **Avanti ›** porta alla voce successiva dell'area; alla fine propone di chiudere l'area.
- **Letture contatori**: l'ora si fissa quando apri la schermata (tasto «Rimetti adesso»), scrivi i valori, **Salva … valori delle hh:mm**. Accanto a ogni valore salvato c'è l'ora.

## Compilare sul PDF (Scheda PDF, dalla 1.4)
- Menu › **Scheda PDF**, oppure nell'area **Compila sul PDF**, oppure «sul PDF» nel pannello di una voce.
- Si vedono le pagine del PDF di campo, identiche. Ogni codice (V-…, Q…, F…, L…, righe di tabella, passi dei protocolli) è toccabile: si apre il pannello della voce (sul tablet a destra, sul telefono dal basso) con le stesse azioni di sempre, comprese foto, documenti e audio.
- Quello che registri compare scritto in blu nelle celle del PDF (esito, risposta, valore e ora delle letture, celle delle tabelle, ora effettiva dei passi); il pallino accanto al codice è verde se la voce è fatta, arancione se è in parte, viola se non fattibile oggi.
- **Avanti ›** segue l'ordine del PDF. Con − e + si ingrandisce; sul telefono si scorre anche di lato.
- **PDF compilato**: scarica il PDF di campo con sopra tutto ciò che è stato registrato. È incluso anche nella copia finale (report/scheda_pdf_compilata.pdf).
- Funziona con i PDF prodotti dalla skill (codici stampati a inizio riga). Con PDF vecchi senza codici delle verifiche, quelle righe non sono toccabili: si compilano dalla vista Aree.

## Chiudere un'area
- **Chiudi l'area**: le voci importanti rimaste sono già spuntate come «non fattibili oggi» con **un solo motivo** per tutte (con suggerimenti). Togli la spunta a quelle che vuoi ancora fare.

## Salvataggi
- In alto a destra: **da salvare** (bianco) o **salvato**; diventa arancione dopo 45 minuti senza copia.
- **Salva copia**: salva su OneDrive solo le novità. Conferma «Sì, salvato» solo se il file è davvero salvato.
- Telefono rotto o scarico: sull'altro dispositivo **Ripristina da copie salvate** con lo ZIP di andata + le copie.

## Fine sopralluogo (Menu › Fine sopralluogo)
1. Letture alla partenza.
2. Rileggi il verbale (riepilogo automatico) → **Va bene, chiudi**.
3. Firme col dito di committente e tecnico.
4. **Salva la copia finale** → OneDrive, cartella della pratica. Poi, nel progetto: skill `sopralluogo-rientro-evidenze`.

## Ricominciare o eliminare
- Nell'elenco iniziale («Ricomincia o elimina») o in Menu: **Ricomincia da zero** crea un sopralluogo vuoto dallo stesso ZIP; **Elimina** chiede il codice pratica e avvisa se ci sono dati non salvati.
- **Eliminare una foto** (o audio, documento, nota) appena fatta: la × rossa sulla miniatura, oppure apri la foto → «Elimina». L'app chiede conferma; il file sparisce dal dispositivo e nel registro resta solo l'annotazione dell'eliminazione.
- Una foto già finita in una copia salvata non si elimina più: si può solo «Annullare» (resta nel pacchetto marcata come annullata, con il motivo). Le firme non si eliminano.

## Parole cambiate rispetto alla 1.2
INBOX → **Foto da assegnare** · deroga → **Non fattibile oggi** · checkpoint → **Salva copia** · pacchetto finale → **Copia finale sigillata** · letture contemporanee → **Letture contatori** · Giro → **Aree** · Cosa manca → **Da fare** · Altro → **Menu**.
