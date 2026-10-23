#!/usr/bin/env python3
"""Verifica di integrità del pacchetto di rientro dell'app di sopralluogo (solo libreria standard;
usa il modulo jsonschema se installato per validare manifest.json).

Uso:
  python verifica_pacchetto_rientro.py <volume1.zip> [<volume2.zip> ...] [--andata <ANDATA.zip>] [--schema <pacchetto-rientro.v1.schema.json>] [--json <esito.json>]

Controlli:
  1. hash.sha256: ogni file elencato esiste e ha l'impronta dichiarata; nessun file non elencato (salvo hash.sha256 e SIGILLO.txt)
  2. SIGILLO.txt (pacchetto finale): SHA-256 di hash.sha256 e hash finale del registro coincidono
  3. eventi.jsonl: catena integra (ogni riga contiene "prec" = SHA-256 dei byte UTF-8 della riga precedente; prima riga prec = 64 zeri se daSeq = 1),
     seq contigui, hash dell'ultima riga = manifest.eventi.hashFinale
  4. struttura.json: SHA-256 = manifest.struttura.sha256; se --andata, byte-identico a quello del pacchetto di andata
  5. evidenze: ogni file esiste in uno dei volumi, SHA-256 e byte coincidono
  6. volumi: stesso idSopralluogoLocale, numerazione completa 1..totale
Uscita 0 = integro; 1 = problemi (elencati). Non modifica nulla.
"""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ZERI = "0" * 64


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def main() -> int:
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return 2
    opz = {}
    for k in ("--andata", "--schema", "--json"):
        if k in a:
            i = a.index(k)
            opz[k] = a[i + 1]
            del a[i:i + 2]
    volumi = [Path(p) for p in a]
    errori: list[str] = []
    avvisi: list[str] = []
    manifest = None
    file_globali: dict[str, tuple[str, bytes]] = {}
    numeri = set()

    for v in volumi:
        with zipfile.ZipFile(v) as z:
            nomi = set(z.namelist())
            if "manifest.json" not in nomi or "hash.sha256" not in nomi:
                errori.append(f"{v.name}: manca manifest.json o hash.sha256")
                continue
            m = json.loads(z.read("manifest.json"))
            if m.get("formato") != "mcstudio.sopralluogo.rientro":
                errori.append(f"{v.name}: formato non riconosciuto")
                continue
            if manifest is None:
                manifest = m
            elif m["idSopralluogoLocale"] != manifest["idSopralluogoLocale"] or m["eventi"]["hashFinale"] != manifest["eventi"]["hashFinale"]:
                errori.append(f"{v.name}: volume di un altro pacchetto o di un altro momento")
            numeri.add(m["volume"]["numero"])
            # 1. hash.sha256
            hash_txt = z.read("hash.sha256")
            elencati = set()
            for riga in hash_txt.decode("utf-8").splitlines():
                if not riga.strip():
                    continue
                h, n = riga.split("  ", 1)
                elencati.add(n)
                if n not in nomi:
                    errori.append(f"{v.name}: {n} elencato ma assente")
                    continue
                dati = z.read(n)
                if sha(dati) != h:
                    errori.append(f"{v.name}: impronta errata per {n}")
                file_globali[n] = (h, dati)
            extra = nomi - elencati - {"hash.sha256", "SIGILLO.txt"} - {n for n in nomi if n.endswith("/")}
            for n in sorted(extra):
                errori.append(f"{v.name}: file non elencato in hash.sha256: {n}")
            # 2. SIGILLO
            if m["tipoPacchetto"] == "finale":
                if "SIGILLO.txt" not in nomi:
                    errori.append(f"{v.name}: pacchetto finale senza SIGILLO.txt")
                else:
                    sig = dict(r.split(": ", 1) for r in z.read("SIGILLO.txt").decode("utf-8").splitlines() if ": " in r)
                    if sig.get("sha256(hash.sha256)") != sha(hash_txt):
                        errori.append(f"{v.name}: SIGILLO non coerente con hash.sha256")
                    if sig.get("hashFinaleEventi") != m["eventi"]["hashFinale"]:
                        errori.append(f"{v.name}: SIGILLO non coerente con il registro eventi")

    if manifest is None:
        print("\n".join(errori) or "Nessun volume leggibile")
        return 1

    tot = manifest["volume"]["totale"]
    if numeri != set(range(1, tot + 1)):
        errori.append(f"Volumi presenti {sorted(numeri)} su {tot}: mancano {sorted(set(range(1, tot + 1)) - numeri)}")

    # 3. catena eventi
    if "eventi.jsonl" in file_globali:
        righe = file_globali["eventi.jsonl"][1].decode("utf-8").split("\n")
        righe = [r for r in righe if r]
        prec = ZERI if manifest["eventi"]["daSeq"] == 1 else None
        seq_attesa = manifest["eventi"]["daSeq"]
        h = None
        for i, r in enumerate(righe):
            ev = json.loads(r)
            if ev.get("seq") != seq_attesa:
                errori.append(f"eventi.jsonl riga {i + 1}: seq {ev.get('seq')} invece di {seq_attesa}")
            if prec is not None and ev.get("prec") != prec:
                errori.append(f"eventi.jsonl riga {i + 1}: catena interrotta (prec non coincide)")
            h = sha(r.encode("utf-8"))
            prec = h
            seq_attesa += 1
        if h != manifest["eventi"]["hashFinale"]:
            errori.append("eventi.jsonl: hash finale diverso da manifest.eventi.hashFinale")
        if seq_attesa - 1 != manifest["eventi"]["aSeq"]:
            errori.append("eventi.jsonl: ultimo seq diverso da manifest.eventi.aSeq")
    else:
        errori.append("eventi.jsonl assente")

    # 4. struttura
    if "struttura.json" in file_globali:
        b = file_globali["struttura.json"][1]
        if sha(b) != manifest["struttura"]["sha256"]:
            errori.append("struttura.json: impronta diversa da manifest.struttura.sha256")
        if "--andata" in opz:
            with zipfile.ZipFile(opz["--andata"]) as z:
                if z.read("struttura.json") != b:
                    errori.append("struttura.json diversa da quella del pacchetto di andata indicato (revisione diversa?)")
    else:
        errori.append("struttura.json assente")

    # 5. evidenze
    n_ev = {"attive": 0, "annullate": 0, "inbox": 0}
    for e in manifest.get("evidenze", []):
        if e.get("annullata"):
            n_ev["annullate"] += 1
        else:
            n_ev["attive"] += 1
            if not e.get("elementi") and e.get("tipo") in ("foto", "audio", "documento", "nota"):
                n_ev["inbox"] += 1
        f = e.get("file")
        if not f:
            continue
        if f not in file_globali:
            if manifest["tipoPacchetto"] == "checkpoint":
                avvisi.append(f"{f}: non in questo checkpoint (atteso in uno precedente)")
            else:
                errori.append(f"{f}: evidenza dichiarata ma assente da tutti i volumi")
            continue
        h, dati = file_globali[f]
        if e.get("sha256") and e["sha256"] != sha(dati):
            errori.append(f"{f}: impronta diversa da quella registrata all'acquisizione")
        if e.get("byte") is not None and e["byte"] != len(dati):
            errori.append(f"{f}: dimensione diversa da quella registrata")

    # 6. schema (facoltativo)
    if "--schema" in opz:
        try:
            import jsonschema  # type: ignore
            schema = json.loads(Path(opz["--schema"]).read_text(encoding="utf-8"))
            v = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
            for err in sorted(v.iter_errors(manifest), key=lambda x: list(x.path)):
                errori.append(f"manifest.json /{'/'.join(map(str, err.path))}: {err.message[:200]}")
        except ImportError:
            avvisi.append("modulo jsonschema non installato: validazione dello schema saltata (pip install jsonschema)")

    esito = {
        "integro": not errori,
        "tipoPacchetto": manifest["tipoPacchetto"],
        "pratica": manifest["struttura"]["codicePratica"],
        "revisione": manifest["struttura"]["revisione"],
        "idStruttura": manifest["struttura"]["idStruttura"],
        "statoSopralluogo": manifest["stato"]["statoSopralluogo"],
        "eventi": manifest["eventi"],
        "evidenze": n_ev,
        "deroghe": len(manifest.get("deroghe", [])),
        "errori": errori,
        "avvisi": avvisi,
    }
    if "--json" in opz:
        Path(opz["--json"]).write_text(json.dumps(esito, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Pratica {esito['pratica']} — {esito['revisione']} — pacchetto {esito['tipoPacchetto']} — sopralluogo {esito['statoSopralluogo']}")
    print(f"Eventi {manifest['eventi']['daSeq']}–{manifest['eventi']['aSeq']} · evidenze attive {n_ev['attive']} (in INBOX {n_ev['inbox']}) · annullate {n_ev['annullate']} · deroghe {esito['deroghe']}")
    for x in avvisi:
        print("AVVISO ", x)
    for x in errori:
        print("ERRORE ", x)
    print("INTEGRO" if not errori else f"NON INTEGRO: {len(errori)} problemi")
    return 0 if not errori else 1


if __name__ == "__main__":
    sys.exit(main())
