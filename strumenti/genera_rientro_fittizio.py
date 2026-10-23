#!/usr/bin/env python3
"""Genera un pacchetto di rientro FITTIZIO, conforme alla specifica, a partire da un pacchetto di andata.
Serve come riferimento di formato per l'app (test di compatibilità) e per provare la skill di rientro.

Uso: python genera_rientro_fittizio.py <ANDATA.zip> <uscita_RIENTRO.zip>
"""
import hashlib
import io
import json
import sys
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

from PIL import Image, ImageDraw  # solo per creare foto di prova

TZ = timezone(timedelta(hours=2))
ZERI = "0" * 64


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def foto(testo: str) -> bytes:
    im = Image.new("RGB", (800, 600), (200, 210, 220))
    ImageDraw.Draw(im).text((20, 20), testo, fill="black")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def main() -> int:
    andata, uscita = sys.argv[1], sys.argv[2]
    with zipfile.ZipFile(andata) as z:
        struttura_b = z.read("struttura.json")
    s = json.loads(struttura_b)
    pref = s["pratica"]["prefissoFile"]
    giorno = s["pratica"]["data"].replace("-", "")
    t0 = datetime.fromisoformat(s["pratica"]["data"] + "T14:31:00").replace(tzinfo=TZ)

    file_pacchetto: dict[str, bytes] = {"struttura.json": struttura_b}
    evidenze = []
    progressivo = 0

    def aggiungi_foto(codice: str, area: str, minuti: int, didascalia: str) -> str:
        nonlocal progressivo
        progressivo += 1
        dati = foto(f"{codice} - {didascalia}")
        nome = f"evidenze/foto/{pref}_{giorno}_{codice}_{progressivo:03d}.jpg"
        file_pacchetto[nome] = dati
        eid = str(uuid.uuid4())
        evidenze.append({
            "id": eid, "tipo": "foto", "file": nome, "sha256": sha(dati), "byte": len(dati), "mime": "image/jpeg",
            "nomeOriginale": f"IMG_{4500 + progressivo}.JPG", "fonte": "fotocamera",
            "acquisitaIl": iso(t0 + timedelta(minutes=minuti)), "progressivo": progressivo,
            "elementi": [codice] if codice != "INBOX" else [], "area": area, "didascalia": didascalia,
        })
        return eid

    e_f36a = aggiungi_foto("F36", "CMP", 60, "Controllore: ore totali")
    e_f36b = aggiungi_foto("F36", "CMP", 61, "Controllore: pressioni")
    e_f37 = aggiungi_foto("F37", "CMP", 63, "Essiccatore: spina dedicata")
    aggiungi_foto("INBOX", "CMP", 64, "Scatto rapido da assegnare")
    # una foto annullata resta nel pacchetto
    e_ann = aggiungi_foto("F35", "CMP", 58, "Vista d'insieme mossa")
    evidenze[-1]["annullata"] = {"il": iso(t0 + timedelta(minutes=59)), "motivo": "foto mossa, rifatta"}

    # firme (PNG)
    def firma(nome_persona: str, minuti: int) -> str:
        nonlocal progressivo
        im = Image.new("RGB", (600, 200), "white")
        ImageDraw.Draw(im).line([(20, 150), (200, 60), (400, 140), (580, 50)], fill="black", width=4)
        buf = io.BytesIO(); im.save(buf, "PNG"); dati = buf.getvalue()
        nome = f"evidenze/firme/{pref}_{giorno}_FIRMA_{nome_persona.replace(' ', '')}.png"
        file_pacchetto[nome] = dati
        eid = str(uuid.uuid4())
        evidenze.append({"id": eid, "tipo": "firma", "file": nome, "sha256": sha(dati), "byte": len(dati), "mime": "image/png",
                         "fonte": "schermo", "acquisitaIl": iso(t0 + timedelta(minutes=minuti)), "progressivo": 1 if "Bianchi" in nome_persona else 2,
                         "elementi": [], "area": "CHIUSURA", "riservata": False})
        return eid

    f_cli = firma("Anna Bianchi", 238)
    f_rede = firma("Mario Rossi", 239)

    esiti = {
        "Q17": {"tipo": "domanda", "stato": "risposta", "aggiornatoIl": iso(t0 + timedelta(minutes=62)),
                "risposta": "Si spegne a mano a fine turno, non sempre.", "rispostaDa": "Anna Bianchi, referente tecnico",
                "provenienza": "D", "daConfermarePerIscritto": True},
        "Q18": {"tipo": "domanda", "stato": "risposta", "aggiornatoIl": iso(t0 + timedelta(minutes=63)),
                "risposta": "L'essiccatore ha una spina propria e resta alimentato.", "rispostaDa": "Anna Bianchi, referente tecnico",
                "provenienza": "R", "evidenze": [e_f37]},
        "F36": {"tipo": "foto", "stato": "fatta", "aggiornatoIl": iso(t0 + timedelta(minutes=61)), "evidenze": [e_f36a, e_f36b]},
        "F37": {"tipo": "foto", "stato": "fatta", "aggiornatoIl": iso(t0 + timedelta(minutes=63)), "evidenze": [e_f37]},
        "L03": {"tipo": "lettura", "stato": "completa", "aggiornatoIl": iso(t0 + timedelta(minutes=225)),
                "valori": [
                    {"grandezza": "hTot", "momento": "arrivo", "valore": 21834, "unita": "h", "il": iso(t0)},
                    {"grandezza": "hCarico", "momento": "arrivo", "valore": 15210, "unita": "h", "il": iso(t0)},
                    {"grandezza": "hTot", "momento": "partenza", "valore": 21837, "unita": "h", "il": iso(t0 + timedelta(minutes=225))},
                    {"grandezza": "hCarico", "momento": "partenza", "valore": 15212, "unita": "h", "il": iso(t0 + timedelta(minutes=225))}],
                "evidenze": [e_f36a]},
        "TAB-CMP": {"tipo": "tabella", "stato": "parziale", "aggiornatoIl": iso(t0 + timedelta(minutes=65)),
                    "celle": {"C04": {"pn": {"stato": "confermato", "valore": 11, "valoreAgliAtti": 11, "classe": "F", "fonte": "targa fotografata", "il": iso(t0 + timedelta(minutes=60)), "evidenze": [e_f36a]},
                                      "fuoriOrario": {"stato": "rilevato", "valore": "sì", "classe": "D", "fonte": "dichiarazione Anna Bianchi", "il": iso(t0 + timedelta(minutes=62))}},
                              "C05": {"pn": {"stato": "corretto", "valore": 0.42, "valoreAgliAtti": 0.419, "classe": "F", "fonte": "targa", "il": iso(t0 + timedelta(minutes=63)), "evidenze": [e_f37]}}},
                    "csv": "report/tabelle/TAB-CMP.csv"},
        "D16": {"tipo": "documento", "stato": "promesso", "aggiornatoIl": iso(t0 + timedelta(minutes=200)), "promessoEntro": "2026-10-23", "chiLoInvia": "Amministrazione"},
        "Z02": {"tipo": "anomalia", "stato": "chiusa", "aggiornatoIl": iso(t0 + timedelta(minutes=230)), "esito": "Essiccatore con spina propria, resta alimentato a compressore fermo (riscontrato).", "evidenze": [e_f37]},
        "GR": {"tipo": "protocollo", "stato": "parziale", "aggiornatoIl": iso(t0 + timedelta(minutes=236)),
               "passi": {"GR0": {"stato": "eseguito", "oraEffettiva": iso(t0 + timedelta(minutes=134)), "eseguitoDa": "Elettricista"},
                         "GR1": {"stato": "eseguito", "oraEffettiva": iso(t0 + timedelta(minutes=164)), "eseguitoDa": "Elettricista"},
                         "GR2": {"stato": "saltato", "motivo": "referente uscito alle 17:40"},
                         "RIP": {"stato": "eseguito", "oraEffettiva": iso(t0 + timedelta(minutes=236)), "eseguitoDa": "Elettricista"}},
               "ripristino": {"il": iso(t0 + timedelta(minutes=236)), "firma": f_cli, "nome": "Anna Bianchi"}},
    }

    # registro eventi a catena: hash = SHA-256 dei byte UTF-8 della riga; ogni riga porta "prec"
    righe = []
    prec = ZERI
    seq = 0

    def evento(tipo: str, codice, dati: dict, minuti: int):
        nonlocal prec, seq
        seq += 1
        ev = {"seq": seq, "il": iso(t0 + timedelta(minutes=minuti)), "tipo": tipo, "codice": codice, "dati": dati, "prec": prec}
        riga = json.dumps(ev, ensure_ascii=False, separators=(",", ":"))
        righe.append(riga)
        prec = sha(riga.encode("utf-8"))

    evento("struttura.importata", None, {"idStruttura": s["idStruttura"], "sha256": sha(struttura_b)}, -60)
    evento("sopralluogo.avviato", None, {}, 0)
    for e in evidenze:
        evento("evidenza.acquisita", (e["elementi"] or [None])[0], {"id": e["id"], "sha256": e["sha256"]}, 60)
    evento("evidenza.annullata", "F35", {"id": e_ann, "motivo": "foto mossa, rifatta"}, 59)
    for k, v in esiti.items():
        evento("esito.aggiornato", k, {"stato": v["stato"]}, 120)
    evento("sopralluogo.chiuso", None, {}, 240)
    file_pacchetto["eventi.jsonl"] = ("\n".join(righe) + "\n").encode("utf-8")

    csv = "﻿riga;utenza;pn [kW];stato pn;classe;fonte\nC04;Compressore a vite 11 kW;11;confermato;F;targa fotografata\nC05;Essiccatore;0,42;corretto (agli atti 0,419);F;targa\n"
    file_pacchetto["report/tabelle/TAB-CMP.csv"] = csv.encode("utf-8")

    manifest = {
        "formato": "mcstudio.sopralluogo.rientro", "versioneSchema": "1.0.0", "tipoPacchetto": "finale",
        "volume": {"numero": 1, "totale": 1},
        "struttura": {"idStruttura": s["idStruttura"], "sha256": sha(struttura_b), "revisione": s["generazione"]["revisione"],
                      "codicePratica": s["pratica"]["codice"], "prefissoFile": pref, "versioneSchema": s["versioneSchema"]},
        "idSopralluogoLocale": str(uuid.uuid4()),
        "app": {"versione": "0.0.0-fixture", "piattaforma": "fixture", "installata": True, "storagePersistente": True},
        "creatoIl": iso(t0 + timedelta(minutes=242)), "fusoOrario": "Europe/Rome",
        "stato": {"statoSopralluogo": "chiuso", "avviatoIl": iso(t0), "chiusoIl": iso(t0 + timedelta(minutes=240))},
        "eventi": {"file": "eventi.jsonl", "daSeq": 1, "aSeq": seq, "hashFinale": prec},
        "presenti": [{"persona": "P1", "nome": "Anna Bianchi", "ruolo": "Referente tecnico"},
                     {"nome": "Luca Verdi", "ruolo": "Elettricista", "dalle": "16:00", "aggiuntaInCampo": True},
                     {"persona": "P3", "nome": "ing. Mario Rossi", "ruolo": "REDE"}],
        "consensi": {"foto": "si", "registrazioneAudio": "no", "registratoIl": iso(t0 + timedelta(minutes=2))},
        "esiti": esiti,
        "obiettivi": {"O1": {"stato": "completo"}, "O2": {"stato": "parziale", "nota": "GR2 non eseguito"}},
        "evidenze": evidenze,
        "deroghe": [{"codice": "GR2", "motivo": "Referente uscito alle 17:40: gradino non eseguito", "il": iso(t0 + timedelta(minutes=236))}],
        "verbale": {"campi": {"presenti": "Anna Bianchi; Luca Verdi; ing. Mario Rossi"},
                    "puntiAperti": [{"testo": "Curva quartoraria agosto–ottobre (D16)", "responsabile": "Amministrazione", "entro": "23/10/2026"}],
                    "firme": [{"id": "FIRMA-CLIENTE", "ruolo": "Per il Committente", "nome": "Anna Bianchi", "evidenza": f_cli, "il": iso(t0 + timedelta(minutes=238)), "sha256ContenutoFirmato": sha(b"testo verbale fittizio")},
                              {"id": "FIRMA-REDE", "ruolo": "Il REDE", "nome": "ing. Mario Rossi", "evidenza": f_rede, "il": iso(t0 + timedelta(minutes=239)), "sha256ContenutoFirmato": sha(b"testo verbale fittizio")}]},
        "report": [{"file": "report/tabelle/TAB-CMP.csv", "tipo": "tabellaCsv", "sha256": sha(file_pacchetto["report/tabelle/TAB-CMP.csv"]), "elemento": "TAB-CMP"}],
    }
    file_pacchetto["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")

    hash_txt = "".join(f"{sha(d)}  {n}\n" for n, d in sorted(file_pacchetto.items())).encode("utf-8")
    sigillo = (
        "SIGILLO PACCHETTO DI RIENTRO — DATI FITTIZI\n"
        f"pratica: {s['pratica']['codice']}\n"
        f"idStruttura: {s['idStruttura']}\n"
        f"idSopralluogoLocale: {manifest['idSopralluogoLocale']}\n"
        f"creatoIl: {manifest['creatoIl']}\n"
        "volume: 1/1\n"
        f"sha256(hash.sha256): {sha(hash_txt)}\n"
        f"hashFinaleEventi: {prec}\n"
        f"versioneApp: {manifest['app']['versione']}\n"
    )
    with zipfile.ZipFile(uscita, "w", zipfile.ZIP_DEFLATED) as z:
        for n, d in sorted(file_pacchetto.items()):
            z.writestr(n, d)
        z.writestr("hash.sha256", hash_txt)
        z.writestr("SIGILLO.txt", sigillo.encode("utf-8"))
    print(f"Creato {uscita}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
