#!/usr/bin/env python3
"""Crea il pacchetto di andata per l'app di sopralluogo (solo libreria standard).

Uso:
  python crea_pacchetto_andata.py <struttura.json> <cartella_figure_base> <uscita.zip> [--pdf <pdf_di_campo>]

<cartella_figure_base> è la cartella che contiene la sottocartella figure/ citata in struttura.json.
Il PDF di campo, se indicato, va in campo/<nome> e il suo SHA-256 deve coincidere con generazione.pdfCampo.sha256 (se presente).

Contenuto dello ZIP:
  struttura.json           (byte-identico al file di input)
  figure/<file>            (byte-identici; SHA-256 verificato contro struttura.json)
  campo/<pdf>              (opzionale)
  MANIFEST_SHA256.txt      ("<sha256>  <percorso>" per ogni file, ordinato)

Prima di lanciarlo validare la struttura con verifica_struttura.mjs.
"""
import hashlib
import json
import sys
import zipfile
from pathlib import Path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    args = sys.argv[1:]
    if len(args) < 3:
        print(__doc__)
        return 2
    f_struttura, base_fig, uscita = Path(args[0]), Path(args[1]), Path(args[2])
    pdf = Path(args[args.index("--pdf") + 1]) if "--pdf" in args else None

    grezzo = f_struttura.read_bytes()
    s = json.loads(grezzo.decode("utf-8"))
    if s.get("formato") != "mcstudio.sopralluogo.struttura":
        print("ERRORE: il file non è una struttura di sopralluogo")
        return 1

    voci: list[tuple[str, bytes]] = [("struttura.json", grezzo)]
    for f in s.get("figure", []):
        p = base_fig / f["file"]
        dati = p.read_bytes()
        if sha256(dati) != f["sha256"]:
            print(f"ERRORE: SHA-256 della figura {f['id']} non coincide con struttura.json")
            return 1
        voci.append((f["file"], dati))

    if pdf:
        dati = pdf.read_bytes()
        atteso = s.get("generazione", {}).get("pdfCampo", {}).get("sha256")
        if atteso and atteso != sha256(dati):
            print("ERRORE: SHA-256 del PDF di campo non coincide con generazione.pdfCampo.sha256")
            return 1
        voci.append((f"campo/{pdf.name}", dati))

    manifest = "".join(f"{sha256(d)}  {n}\n" for n, d in sorted(voci))
    uscita.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(uscita, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for n, d in voci:
            # le immagini e i PDF sono già compressi: STORED evita lavoro inutile
            comp = zipfile.ZIP_STORED if n.lower().endswith((".png", ".jpg", ".jpeg", ".pdf")) else zipfile.ZIP_DEFLATED
            z.writestr(n, d, compress_type=comp)
        z.writestr("MANIFEST_SHA256.txt", manifest)

    # rilettura di controllo
    with zipfile.ZipFile(uscita) as z:
        righe = z.read("MANIFEST_SHA256.txt").decode().splitlines()
        for r in righe:
            h, n = r.split("  ", 1)
            if sha256(z.read(n)) != h:
                print(f"ERRORE in rilettura: {n}")
                return 1
    print(f"Pacchetto creato: {uscita}  ({len(voci)} file + manifest)")
    print(f"SHA-256 del pacchetto: {sha256(uscita.read_bytes())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
