# Guida rapida — app di sopralluogo

## Una volta sola
1. Apri **https://provenzanof70.github.io/webapp_sopralluogo/**
   - iPhone: in **Safari** → Condividi → **Aggiungi alla schermata Home**.
   - Tablet Android: in **Chrome** → menu ⋮ → **Installa app**.
2. Apri l'app **dall'icona** (non dal browser): solo così funziona senza rete e i dati sono protetti.
3. Facoltativo: ⚙ Impostazioni → PIN, alto contrasto, GPS del telefono.

## Prima del sopralluogo
1. Nel progetto della pratica (Claude desktop) la skill `sopralluogo-guida-schede-rilievo` produce il PDF di campo e lo ZIP `SOPRALLUOGO_…_ANDATA_rev….zip` nella cartella della pratica su OneDrive.
2. App → **Importa pacchetto di andata** → OneDrive → lo ZIP. L'app verifica impronte e struttura.
3. Stampa il PDF di campo: è la copia di sicurezza.

## In campo
- **Prima di partire**: checklist, strumenti, ora del telefono → **Avvia il sopralluogo** → presenti e consensi.
- **Adesso**: cosa prevede il programma ora, prossimi passi a orario, letture contemporanee.
- **Giro**: le aree in ordine con l'avanzamento. Dentro un'area tocchi una voce per compilarla.
- **📷 rotondo**: scatto rapido sulla voce aperta (o in INBOX se nessuna è aperta).
- Dati **agli atti** (in grigio): «Confermo» oppure «Correggo» (valore, classe, fonte). L'originale resta registrato.
- Ogni risposta: testo (puoi dettare col microfono della tastiera), **chi ha risposto**, **R** riscontrato o **D** dichiarato.
- Letture: l'ora si registra da sola; si può correggere con motivo.
- **Cosa manca**: le cose da non lasciare, obiettivi, voci aperte di priorità A.
- **Chiudi l'area** a fine giro: se restano voci A aperte serve un motivo (deroga).
- Niente si cancella: «Annulla» lascia l'evidenza nel pacchetto con il motivo.

## Ricominciare o eliminare
- **Ricomincia da zero** (nell'elenco iniziale o in Altro → Gestione del sopralluogo): crea un sopralluogo vuoto dallo stesso ZIP di andata, senza riscegliere il file; puoi tenere o eliminare quello vecchio.
- **Elimina**: cancella il sopralluogo dal dispositivo, dopo aver scritto il codice pratica. Se ci sono dati non esportati l'app lo dice chiaramente prima.
- Per caricare una **nuova revisione** dello ZIP: «Importa pacchetto di andata» crea un nuovo sopralluogo; poi elimina quello vecchio se non serve.

## Salvataggi
- Il contatore **⇪** in alto mostra le modifiche non esportate; diventa arancione dopo 45 minuti.
- **Esporta → Checkpoint**: salva su OneDrive solo le novità. Conferma «Sì, salvato» solo se il file è davvero salvato.
- Telefono rotto o scarico: sull'altro dispositivo **Ripristina** con il pacchetto di andata + i checkpoint.

## Chiusura
1. Altro → **Verbale e chiusura** → **Chiudi il sopralluogo** (letture alla partenza prima!).
2. Firme col dito di committente e tecnico.
3. **Esporta il pacchetto finale sigillato** → OneDrive, cartella della pratica.
4. Nel progetto della pratica: skill `sopralluogo-rientro-evidenze`.
