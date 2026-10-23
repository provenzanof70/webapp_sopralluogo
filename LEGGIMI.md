# Kit app di sopralluogo — come partire

1. **GitHub**: crea un repository vuoto (nome proposto `sopralluogo-mcstudio`). Su piano gratuito GitHub Pages richiede un repository pubblico: va bene, perché conterrà solo codice e dati fittizi.
2. **Cartella sul PC**: clona il repository in una cartella di lavoro **fuori** dalle cartelle delle pratiche (es. `C:\Users\prove\Sviluppo\sopralluogo-mcstudio`). Copia dentro tutto il contenuto di questo kit (`docs/`, `schema/`, `esempi/`, `strumenti/`, questo `LEGGIMI.md`).
3. **Claude Code**: apri Claude Code in quella cartella e incolla:

   > Leggi `docs/ISTRUZIONI_CLAUDE_CODE.md` per intero: è la specifica dell'app. Fammi prima le domande del § 15, poi procedi con la fase F0 e fermati alla fine di ogni fase come indicato al § 12. Rispondi sempre in italiano.

4. Alla fine di ogni fase Claude Code ti dà l'indirizzo e l'elenco delle prove da fare sul telefono. Le correzioni gliele dai come elenco numerato.
5. **Skill dei progetti**: la skill `sopralluogo-guida-schede-rilievo` (estesa) produce il pacchetto di andata; la skill `sopralluogo-rientro-evidenze` importa il pacchetto di rientro. Entrambe usano gli script di `strumenti/` di questo repository: quando la skill chiede dove si trova la cartella dell'app, indica quella del punto 2.

Script (dalla cartella del repository):
- `node strumenti/verifica_struttura.mjs <struttura.json> --figure-dir <cartella>` — richiede `npm install ajv ajv-formats` (Claude Code lo aggiunge al `package.json`).
- `python strumenti/crea_pacchetto_andata.py <struttura.json> <cartella_base> <uscita.zip> [--pdf <pdf>]`
- `python strumenti/verifica_pacchetto_rientro.py <rientro.zip> [--andata <andata.zip>] [--schema schema/pacchetto-rientro.v1.schema.json]` — `pip install jsonschema` per la validazione dello schema.

Gli esempi in `esempi/` sono interamente fittizi.
