# Prove su dispositivo (iPhone e tablet Android)

Usa il pacchetto di prova fittizio `esempi/SOPRALLUOGO_ESEMPIO_20261016_ANDATA_rev001.zip` (copialo su OneDrive). Annota l'esito di ogni prova; le correzioni come elenco numerato.

1. **Installazione**: aggiungi l'app alla schermata Home (iPhone) / installa (Android). Aprila dall'icona: in alto deve comparire «Archiviazione persistente: sì» (su iPhone può restare «no» finché non è installata).
2. **Senza rete**: attiva la modalità aereo e riapri l'app dall'icona. Deve aprirsi normalmente. Tieni la modalità aereo per tutte le prove seguenti.
3. **Import**: Importa → OneDrive → pacchetto di prova → «Crea il sopralluogo».
4. **Foto**: nell'area CMP scatta 6 foto con «📷 Scatta», 3 da «Galleria», 1 documento di più pagine su un documento D. Annota se le foto da galleria mantengono data e posizione (Visore → dettagli).
5. **Audio**: registra 20 secondi con «🎙 Audio». Se il microfono non funziona, allega un file del Registratore con «📄 File».
6. **Resistenza**: durante uno scatto chiudi l'app forzatamente (scorri via); riaprila: l'ultima foto deve esserci oppure non esserci, mai a metà. Poi riavvia il telefono e verifica che tutto sia ancora lì. Altro → Verifica di integrità → «Tutto integro».
7. **Checkpoint**: Esporta → Checkpoint → salva su OneDrive → «Sì, salvato».
8. **Ripristino**: sull'altro dispositivo Ripristina scegliendo pacchetto di andata + checkpoint; prosegui il lavoro lì.
9. **Chiusura**: verbale → chiudi → firme → pacchetto finale su OneDrive.
10. **Verifica sul PC** (cartella dell'app): `python strumenti/verifica_pacchetto_rientro.py <finale.zip> --andata <andata.zip> --schema schema/pacchetto-rientro.v1.schema.json` → **INTEGRO**. Controllo indipendente di due foto: PowerShell `Get-FileHash -Algorithm SHA256 <foto>` e confronto con `hash.sha256`.
11. **Carico**: un sopralluogo di prova con 300–400 foto; annota i tempi di apertura dell'area e di esportazione.

Limiti noti da verificare:
- iOS: le foto scelte dalla Galleria possono arrivare convertite (HEIC → JPEG) e senza posizione; quelle scattate con «📷» sono salvate esattamente come arrivano dalla fotocamera.
- iOS: le notifiche a orario dei protocolli funzionano solo con l'app aperta (si vede il conto alla rovescia in «Adesso»).
- La firma del verbale è una firma elettronica semplice.
