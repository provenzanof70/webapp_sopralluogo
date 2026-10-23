// Tipi del dominio. Rispecchiano schema/struttura-sopralluogo.v1.schema.json (ingresso)
// e schema/pacchetto-rientro.v1.schema.json (uscita). Tenere allineati agli schemi.

export type Priorita = 'A' | 'B' | 'C';
export type Valore = string | number | boolean;

export interface DatoAtti {
  valore: Valore;
  unita?: string;
  classe?: string;
  origine?: string;
  fonte?: string;
  nota?: string;
}

export interface Grandezza {
  id: string;
  nome: string;
  unita?: string;
  tipoValore?: 'numero' | 'intero' | 'testo' | 'siNo';
  ripetizioni?: number;
}

export interface Persona {
  id: string;
  nome: string;
  ruolo?: string;
  societa?: string;
  telefono?: string;
  email?: string;
  presenza?: string;
  parte: 'committente' | 'redattore' | 'terzi';
}

export interface Area {
  id: string;
  titolo: string;
  ordine: number;
  capitoloPdf?: string;
  dalle?: string;
  alle?: string;
  accompagnatore?: string;
  scopo?: string;
  figure?: string[];
}

interface BaseElemento {
  id: string;
  area: string;
  ordine: number;
  priorita?: Priorita;
  titolo?: string;
  rif?: string[];
  capitoloPdf?: string;
  riservato?: boolean;
  nota?: string;
}

export interface ElVerifica extends BaseElemento { tipo: 'verifica'; testo: string; agliAtti?: DatoAtti }
export interface ElDomanda extends BaseElemento { tipo: 'domanda'; testo: string; destinatario?: string; perche?: string; temaSensibile?: boolean }
export interface ElFoto extends BaseElemento { tipo: 'foto'; oggetto: string; leggibile?: string; serveA?: string; scattiMinimi?: number }
export type Momento = 'arrivo' | 'intermedia' | 'partenza' | 'unica';
export interface ElLettura extends BaseElemento {
  tipo: 'lettura'; strumento: string; grandezze: Grandezza[]; dove?: string; momenti: Momento[];
  gruppo?: string; controlloCoerenza?: string; agliAtti?: DatoAtti; fotoCollegate?: string[];
}
export interface ElMisura extends BaseElemento { tipo: 'misura'; cosa: string; strumento: string; perche?: string; grandezze: Grandezza[]; indicativa?: boolean }
export interface ElDocumento extends BaseElemento { tipo: 'documento'; documento: string; daChi?: string; perche?: string; sito?: string; daPreparareInGiornata?: boolean }
export interface ElAnomalia extends BaseElemento { tipo: 'anomalia'; tema: string; datoAtti: string; evidenzaDaRaccogliere?: string; doveSiVerifica?: string[]; riferimentoRegistro?: string }
export interface Colonna {
  id: string; etichetta: string;
  tipoValore?: 'testo' | 'numero' | 'intero' | 'scelta' | 'siNo' | 'ora' | 'data' | 'codici';
  unita?: string; scelte?: string[]; chiave?: boolean; solaLettura?: boolean;
}
export interface Riga { id: string; celle?: Record<string, DatoAtti> }
export interface ElTabella extends BaseElemento {
  tipo: 'tabella'; titolo: string; colonne: Colonna[]; righe?: Riga[];
  consentiRigheAggiuntive?: boolean; solaLettura?: boolean; notaPiede?: string;
}
export interface Passo { id: string; orarioPrevisto?: string; alle?: string; manovra: string; esegue?: string; grandezze?: Grandezza[] }
export interface ElProtocollo extends BaseElemento {
  tipo: 'protocollo'; titolo: string; scopo?: string; passi: Passo[]; regole?: string[];
  firmaRipristino?: boolean; daLasciareAlCliente?: boolean;
}
export interface ElUscitaArea extends BaseElemento { tipo: 'uscitaArea'; voci: { testo: string; rif?: string[] }[] }
export interface ElInformazione extends BaseElemento { tipo: 'informazione'; testo: string; figura?: string }

export type Elemento =
  | ElVerifica | ElDomanda | ElFoto | ElLettura | ElMisura | ElDocumento
  | ElAnomalia | ElTabella | ElProtocollo | ElUscitaArea | ElInformazione;
export type TipoElemento = Elemento['tipo'];

export interface Figura { id: string; titolo: string; file: string; sha256: string; annotabile?: boolean; copieDaSiglare?: number }

export interface Verbale {
  titolo: string;
  testoIntroduttivo?: string;
  campi?: { id: string; etichetta: string; tipoValore?: string; valoreIniziale?: string }[];
  puntiApertiPrecompilati?: PuntoAperto[];
  noteFisse?: string[];
  firme: { id: string; ruolo: string; parte: Persona['parte']; persona?: string }[];
}

export interface PuntoAperto { testo: string; responsabile?: string; entro?: string }
export interface VoceChecklist { id?: string; testo: string; chi?: string; entro?: string; priorita?: Priorita }

export interface Struttura {
  formato: 'mcstudio.sopralluogo.struttura';
  versioneSchema: string;
  idStruttura: string;
  generazione: { il: string; da: string; revisione: string; sorgente?: { file: string; sha256?: string }; pdfCampo?: { file: string; sha256?: string } };
  pratica: {
    codice: string; titolo: string; tipo: string; riferimentiNormativi?: string[];
    committente: { ragioneSociale: string; piva?: string; sede?: string };
    sito: { denominazione: string; indirizzo?: string; codice?: string; note?: string };
    data: string; dalle?: string; alle?: string;
    redattore: { nome: string; qualifica?: string; societa: string; telefono?: string };
    rapportoRiferimento?: string; prefissoFile: string; cartellaSopralluogo?: string;
  };
  persone?: Persona[];
  legenda?: {
    priorita?: Partial<Record<Priorita, string>>; classi?: Record<string, string>; origini?: Record<string, string>;
    provenienzaRisposte?: Record<string, string>; formule?: string[]; note?: string[];
  };
  regoleCampo?: string[];
  obiettivi?: { id: string; titolo: string; stato?: string; evidenza?: string; rif?: string[] }[];
  nonLasciare?: { n: number; testo: string; area?: string; rif: string[]; obiettivi?: string[] }[];
  preparazione?: VoceChecklist[];
  strumenti?: { nome: string; uso?: string; classeLimiti?: string }[];
  programma?: { dalle: string; alle?: string; attivita: string; chi?: string; aree?: string[] }[];
  aree: Area[];
  elementi: Elemento[];
  figure?: Figura[];
  verbale?: Verbale;
  dopoSopralluogo?: VoceChecklist[];
}

// ---------------------------------------------------------------- stato di campo

export type TipoEvidenza = 'foto' | 'audio' | 'documento' | 'firma' | 'annotazione' | 'nota';

export interface Evidenza {
  id: string;
  tipo: TipoEvidenza;
  file?: string; // percorso nel pacchetto, fissato all'acquisizione
  testo?: string;
  sha256?: string;
  byte?: number;
  mime?: string;
  nomeOriginale?: string;
  fonte?: 'fotocamera' | 'galleria' | 'file' | 'microfono' | 'schermo' | 'tastiera';
  acquisitaIl: string;
  dataOriginaleExif?: string;
  progressivo: number;
  elementi: string[];
  area?: string;
  didascalia?: string;
  gps?: { lat: number; lon: number; accuratezzaM?: number; fonte: 'dispositivo' | 'exif' };
  figuraBase?: string;
  riservata?: boolean;
  annullata?: { il: string; motivo: string };
}

export interface DatoRilevato {
  grandezza?: string;
  momento?: Momento;
  ripetizione?: number;
  valore: Valore | null;
  unita?: string;
  il: string;
  oraCorretta?: { da: string; motivo: string };
}

export interface Cella {
  stato: 'confermato' | 'corretto' | 'rilevato' | 'nonVerificabile';
  valore?: Valore | null;
  valoreAgliAtti?: Valore | null;
  classe?: string;
  fonte?: string;
  motivo?: string;
  il: string;
  evidenze?: string[];
}

export interface PassoEsito {
  stato: 'daFare' | 'eseguito' | 'saltato';
  oraEffettiva?: string;
  eseguitoDa?: string;
  valori?: DatoRilevato[];
  note?: string;
  motivo?: string;
}

/** Esito di un elemento. I campi presenti dipendono dal tipo (vedi schema di rientro). */
export interface Esito {
  tipo: TipoElemento;
  stato: string;
  aggiornatoIl: string;
  evidenze?: string[];
  note?: string;
  notaInterna?: string;
  // verifica
  valoreRilevato?: Valore | null;
  classe?: string;
  fonte?: string;
  motivo?: string;
  // domanda
  risposta?: string;
  rispostaDa?: string;
  provenienza?: 'R' | 'D';
  daConfermarePerIscritto?: boolean;
  // lettura / misura
  valori?: DatoRilevato[];
  strumentoUsato?: string;
  // documento
  promessoEntro?: string;
  chiLoInvia?: string;
  // anomalia
  esito?: string;
  // tabella
  celle?: Record<string, Record<string, Cella>>;
  righeAggiunte?: { id: string; il: string; annullata?: boolean }[];
  csv?: string;
  // protocollo
  passi?: Record<string, PassoEsito>;
  ripristino?: { il?: string; firma?: string; nome?: string };
}

export interface Presente {
  chiave: string;
  persona?: string;
  nome: string;
  ruolo?: string;
  societa?: string;
  telefono?: string;
  dalle?: string;
  alle?: string;
  presente: boolean;
  aggiuntaInCampo?: boolean;
}

export interface Firma { id: string; ruolo: string; nome: string; evidenza: string; il: string; sha256ContenutoFirmato: string }

export interface Stato {
  statoSopralluogo: 'preparazione' | 'inCorso' | 'chiuso';
  avviatoIl?: string;
  chiusoIl?: string;
  presenti: Record<string, Presente>;
  consensi?: { foto: 'si' | 'no' | 'conLimiti'; fotoLimiti?: string; registrazioneAudio: 'si' | 'no'; registratoIl: string };
  esiti: Record<string, Esito>;
  evidenze: Record<string, Evidenza>;
  progressivi: Partial<Record<TipoEvidenza, number>>;
  deroghe: { codice: string; motivo: string; il: string }[];
  obiettivi: Record<string, { nota?: string }>;
  areeChiuse: Record<string, { il: string; conDeroga: boolean }>;
  verbale: {
    campi: Record<string, string>;
    puntiAperti: PuntoAperto[];
    areeNonAccessibili: { area: string; motivo: string }[];
    firme: Firma[];
    firmeInvalidate: Firma[];
  };
  checkpoint: {
    esportati: { nomeFile: string; tipo: 'checkpoint' | 'finale'; aSeq: number; hashFinale: string; il: string }[];
    confermati: { nomeFile: string; aSeq: number; hashFinale: string; il: string }[];
  };
  /** id evidenza -> nome del pacchetto confermato che la contiene */
  evidenzeEsportate: Record<string, string>;
  ripristini: { il: string; origine: string; daIstanza?: string }[];
  /** eventi di contenuto (esclusi struttura.importata e checkpoint.*) e quanti risultano in un salvataggio confermato */
  nSostanziali: number;
  nSostanzialiEsportati: number;
  preparazioneFatta: Record<string, boolean>;
}

export interface Evento {
  seq: number;
  il: string;
  tipo: string;
  codice: string | null;
  dati: Record<string, unknown>;
  prec: string;
}
