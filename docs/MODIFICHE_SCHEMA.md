# Modifiche agli schemi

- 1.0.0 — prima versione (23/10/2026).
- 1.1.0 — (app 1.3) campo facoltativo `componente` su ogni elemento: oggetto fisico o tema a cui la voce si riferisce (es. «DNM 6700L», «Quadro generale», max 80 caratteri). L'app raggruppa le voci dell'area per componente; le voci senza componente vanno sotto «Tutta l'area». Il campo `titolo` (già presente dalla 1.0) diventa il **titolo breve** mostrato negli elenchi (3–8 parole, senza ripetere il testo); il testo completo resta nel pannello della voce.
  - Compatibilità: l'app 1.3 legge sia 1.0.0 sia 1.1.0. L'app fino alla 1.2 **rifiuta** una struttura che contiene `componente`: generare 1.1.0 solo quando sui dispositivi c'è l'app 1.3 o successiva (versione in ⚙ Impostazioni). Il `titolo` breve si può usare anche con 1.0.0.
  - Esempio fittizio: `esempi/struttura_esempio_fittizio_1.1.json` e `esempi/SOPRALLUOGO_ESEMPIO_20261016_ANDATA_rev002_schema1.1.zip`.
