// Generazione dei report: verbale, report sintetico per il cliente, fascicolo fotografico (PDF),
// report dettagliato (HTML autosufficiente), CSV delle tabelle.
import type { Sessione } from '../archivio/sessione';
import type { ElTabella, Elemento, Evidenza, Esito } from '../dominio/tipi';
import { Impaginatore, GRIGIO, BLU } from './pdf';
import { contenutoVerbale, documentiStato, dichiarazioniDaConfermare, presentiTesto, areeVisitate, valoreFormattato, ETICHETTE_STATO_DOC } from './contenuti';
import { statoElemento, statoLista } from '../dominio/completezza';
import { righeTabella } from '../dominio/stato';
import { dataIt, dataOra, soloOra, numIt, utf8, sha256 } from '../util/base';
import { ridimensiona } from '../util/immagini';
import type { FileReport } from '../pacchetti/rientro';
import { VERSIONE_APP } from '../pacchetti/rientro';

export interface OpzioniReport { bozza?: boolean; fotoPerPagina?: 1 | 2 | 4; includiRiservateNelFascicolo?: boolean; intestazione?: string }

function piede(ses: Sessione) {
  const p = ses.struttura.pratica;
  return `Pratica ${p.codice} — ${p.committente.ragioneSociale} — sopralluogo del ${dataIt(p.data)} — ${ses.struttura.generazione.revisione}`;
}

function intestazione(im: Impaginatore, ses: Sessione, titolo: string, opz: OpzioniReport) {
  const p = ses.struttura.pratica;
  im.testo(opz.intestazione || p.redattore.societa, { size: 9, colore: GRIGIO });
  im.titolo(titolo, 16);
  im.testo(`Pratica ${p.codice} — ${p.titolo}`, { size: 10, bold: true });
  im.testo(`${p.committente.ragioneSociale} — ${[p.sito.denominazione, p.sito.indirizzo].filter(Boolean).join(', ')}`, { size: 10 });
  im.testo(`Data del sopralluogo: ${dataIt(p.data)} — Redattore: ${p.redattore.nome}${p.redattore.qualifica ? ', ' + p.redattore.qualifica : ''}`, { size: 9, colore: GRIGIO });
  im.linea();
}

// ------------------------------------------------------------------- verbale

export async function generaVerbale(ses: Sessione, opz: OpzioniReport = {}): Promise<Uint8Array> {
  const st = ses.stato;
  const c = contenutoVerbale(ses.struttura, st);
  const im = new Impaginatore(piede(ses), true, opz.bozza ? 'BOZZA' : undefined);
  await im.avvia(c.titolo);
  intestazione(im, ses, c.titolo, opz);
  im.testo(c.intro, { size: 10.5, dopo: 8 });
  for (const sz of c.sezioni) {
    im.testo(sz.titolo, { size: 10.5, bold: true, colore: BLU, dopo: 2 });
    for (const r of sz.righe) im.testo(`• ${r}`, { size: 9.5, x: im.m + 8 });
    im.y -= 4;
  }
  for (const n of c.note) im.testo(n, { size: 9, colore: GRIGIO });
  im.y -= 10;
  // firme
  const previste = ses.struttura.verbale?.firme ?? [];
  for (const f of previste) {
    const fatta = st.verbale.firme.find((x) => x.id === f.id);
    im.spazio(110);
    im.testo(f.ruolo, { size: 10, bold: true });
    if (fatta) {
      const b = await ses.blobEvidenza(fatta.evidenza);
      if (b) {
        const img = await im.immagine(new Uint8Array(await b.arrayBuffer()), 'image/png');
        if (img) {
          const k = Math.min(200 / img.width, 60 / img.height);
          im.pagina.drawImage(img, { x: im.m, y: im.y - img.height * k, width: img.width * k, height: img.height * k });
          im.y -= img.height * k + 4;
        }
      }
      im.testo(`${fatta.nome} — firmato il ${dataOra(fatta.il)}`, { size: 9 });
      im.testo(`Impronta SHA-256 del contenuto firmato: ${fatta.sha256ContenutoFirmato}`, { size: 7, colore: GRIGIO });
    } else {
      im.y -= 40;
      im.testo('Nome ______________________   Firma ______________________', { size: 9 });
    }
    im.y -= 8;
  }
  im.testo(`Firma elettronica semplice raccolta su dispositivo con l'app di sopralluogo MC Studio v${VERSIONE_APP}.`, { size: 7, colore: GRIGIO });
  return im.chiudi();
}

// ------------------------------------------------------------------- sintetico per il cliente

export async function generaSintetico(ses: Sessione, opz: OpzioniReport = {}): Promise<Uint8Array> {
  const s = ses.struttura, st = ses.stato;
  const im = new Impaginatore(piede(ses), true, opz.bozza ? 'BOZZA' : undefined);
  await im.avvia('Riepilogo del sopralluogo');
  intestazione(im, ses, 'Riepilogo del sopralluogo', opz);
  const sez = (t: string, righe: string[]) => {
    im.testo(t, { size: 11, bold: true, colore: BLU, dopo: 2 });
    for (const r of righe.length ? righe : ['—']) im.testo(`• ${r}`, { size: 9.5, x: im.m + 8 });
    im.y -= 6;
  };
  sez('Orari', [`Inizio ${soloOra(st.avviatoIl) || s.pratica.dalle || '…'} — fine ${soloOra(st.chiusoIl) || '…'}`]);
  sez('Presenti', presentiTesto(st));
  sez('Aree visitate', areeVisitate(s, st));
  if (st.verbale.areeNonAccessibili.length) sez('Aree non accessibili o non verificate', st.verbale.areeNonAccessibili.map((a) => `${a.area}: ${a.motivo}`));
  sez('Documenti: stato', documentiStato(s, st).filter((r) => !s.elementi.find((e) => r.startsWith(e.id + ' ') && e.riservato)));
  const promessi = s.elementi.filter((e) => e.tipo === 'documento' && !e.riservato && st.esiti[e.id]?.stato === 'promesso');
  if (promessi.length) {
    im.testo('Documenti da inviare', { size: 11, bold: true, colore: BLU, dopo: 2 });
    im.tabella(['Cod.', 'Documento', 'Entro', 'Chi lo invia'], promessi.map((e) => {
      const x = st.esiti[e.id];
      return [e.id, (e as { documento: string }).documento, dataIt(x.promessoEntro), x.chiLoInvia ?? ''];
    }), [1, 6, 1.6, 2.4]);
  }
  sez('Dichiarazioni rese in sopralluogo, da confermare per iscritto', dichiarazioniDaConfermare(s, st));
  sez('Punti aperti e impegni', st.verbale.puntiAperti.map((p) => `${p.testo}${p.responsabile ? ' — ' + p.responsabile : ''}${p.entro ? ' — entro ' + p.entro : ''}`));
  im.testo('Il presente riepilogo riporta quanto rilevato e dichiarato in sopralluogo e non contiene valutazioni: i dati saranno elaborati nel documento finale.', { size: 8.5, colore: GRIGIO });
  return im.chiudi();
}

// ------------------------------------------------------------------- fascicolo fotografico

export async function generaFascicolo(ses: Sessione, opz: OpzioniReport = {}): Promise<Uint8Array> {
  const s = ses.struttura, st = ses.stato;
  const per = opz.fotoPerPagina ?? 2;
  const ordineArea = new Map(s.aree.map((a) => [a.id, a.ordine]));
  const foto = Object.values(st.evidenze)
    .filter((e) => (e.tipo === 'foto' || e.tipo === 'annotazione') && !e.annullata && (opz.includiRiservateNelFascicolo || !e.riservata))
    .filter((e) => !(e.elementi.some((c) => s.elementi.find((x) => x.id === c)?.riservato) && !opz.includiRiservateNelFascicolo))
    .sort((a, b) => (ordineArea.get(a.area ?? '') ?? 999) - (ordineArea.get(b.area ?? '') ?? 999) || a.acquisitaIl.localeCompare(b.acquisitaIl));
  const im = new Impaginatore(piede(ses), true, opz.bozza ? 'BOZZA' : undefined);
  await im.avvia('Fascicolo fotografico');
  // copertina
  im.y -= 120;
  im.testo(opz.intestazione || s.pratica.redattore.societa, { size: 12, colore: GRIGIO });
  im.titolo('Fascicolo fotografico', 26);
  im.testo(s.pratica.titolo, { size: 13, bold: true });
  im.testo(s.pratica.committente.ragioneSociale, { size: 12 });
  im.testo([s.pratica.sito.denominazione, s.pratica.sito.indirizzo].filter(Boolean).join(' — '), { size: 11 });
  im.y -= 10;
  im.testo(`Sopralluogo del ${dataIt(s.pratica.data)} — ${foto.length} fotografie`, { size: 11 });
  im.testo(`Redattore: ${s.pratica.redattore.nome}${s.pratica.redattore.qualifica ? ', ' + s.pratica.redattore.qualifica : ''}`, { size: 11 });
  im.testo(`Pratica ${s.pratica.codice} — ${s.generazione.revisione}`, { size: 9, colore: GRIGIO });
  // indice (le pagine si calcolano prima dell'impaginazione: copertina + indice)
  const righeIndice = Math.ceil(foto.length / 1) ;
  const pagineIndice = Math.max(1, Math.ceil((righeIndice + 4) / 45));
  const primaPaginaFoto = 1 + pagineIndice + 1;
  im.nuovaPagina();
  im.titolo('Indice delle fotografie', 14);
  const indice = foto.map((e, i) => [String(i + 1), e.elementi.join(', ') || 'INBOX', s.aree.find((a) => a.id === e.area)?.titolo ?? e.area ?? '', e.didascalia ?? descrizioneDa(s.elementi, e), soloOra(e.acquisitaIl), String(primaPaginaFoto + Math.floor(i / per))]);
  im.tabella(['N.', 'Codice', 'Area', 'Didascalia', 'Ora', 'Pag.'], indice, [0.6, 1.4, 2.2, 5, 0.9, 0.7], 8);
  while (im.pagine.length < 1 + pagineIndice) im.nuovaPagina();
  // pagine foto
  const altezzaBox = (im.h - 2 * im.m - 30) / (per === 4 ? 2 : per);
  const larghezzaBox = per === 4 ? im.larghezzaUtile / 2 : im.larghezzaUtile;
  for (let i = 0; i < foto.length; i++) {
    const pos = i % per;
    if (pos === 0) im.nuovaPagina();
    const col = per === 4 ? pos % 2 : 0;
    const riga = per === 4 ? Math.floor(pos / 2) : pos;
    const x0 = im.m + col * larghezzaBox;
    const yTop = im.h - im.m - riga * altezzaBox;
    const e = foto[i];
    const testoH = 34;
    const maxW = larghezzaBox - 10, maxH = altezzaBox - testoH - 10;
    const orig = await ses.blobEvidenza(e.id);
    let img = null;
    if (orig) {
      const ridotta = await ridimensiona(orig, per === 1 ? 2000 : 1400, 0.8);
      const sorgente = ridotta ?? orig;
      img = await im.immagine(new Uint8Array(await sorgente.arrayBuffer()), ridotta ? 'image/jpeg' : (e.mime ?? ''));
    }
    if (img) {
      const k = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * k, h = img.height * k;
      im.pagina.drawImage(img, { x: x0 + (larghezzaBox - w) / 2, y: yTop - h, width: w, height: h });
    } else {
      im.pagina.drawRectangle({ x: x0 + 5, y: yTop - maxH, width: maxW, height: maxH, borderColor: GRIGIO, borderWidth: 0.5 });
      im.pagina.drawText('Formato non incorporabile: vedi file originale nel pacchetto', { x: x0 + 12, y: yTop - maxH / 2, size: 8, font: im.f, color: GRIGIO });
    }
    const didasc = `Foto ${i + 1} — ${e.elementi.join(', ') || 'INBOX'} — ${e.didascalia ?? descrizioneDa(s.elementi, e)}`;
    const righe = im.righe(didasc, 8.5, im.fb, larghezzaBox - 10).slice(0, 2);
    let yy = yTop - maxH - 12;
    for (const r of righe) { im.pagina.drawText(r, { x: x0 + 5, y: yy, size: 8.5, font: im.fb }); yy -= 10.5; }
    im.pagina.drawText(`${s.aree.find((a) => a.id === e.area)?.titolo ?? ''} · ${dataOra(e.acquisitaIl)} · ${e.file?.split('/').pop() ?? ''}`.slice(0, 120), { x: x0 + 5, y: yy, size: 7, font: im.f, color: GRIGIO });
  }
  im.y = im.m;
  return im.chiudi();
}

function descrizioneDa(elementi: Elemento[], e: Evidenza): string {
  const el = elementi.find((x) => x.id === e.elementi[0]);
  if (!el) return '';
  if (el.tipo === 'foto') return el.oggetto;
  if (el.tipo === 'domanda' || el.tipo === 'verifica' || el.tipo === 'informazione') return el.testo.slice(0, 120);
  if (el.tipo === 'documento') return el.documento;
  if (el.tipo === 'lettura') return el.strumento;
  if (el.tipo === 'misura') return el.cosa;
  if (el.tipo === 'anomalia') return el.tema;
  return el.titolo ?? '';
}

// ------------------------------------------------------------------- CSV

export function csvTabella(t: ElTabella, e: Esito | undefined): string {
  const q = (v: unknown) => { const s = numIt(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const intest = ['riga'];
  for (const c of t.colonne) intest.push(`${c.etichetta}${c.unita ? ' [' + c.unita + ']' : ''}`, `${c.id} stato`, `${c.id} agli atti`, `${c.id} classe`, `${c.id} fonte`);
  const out = [intest.map(q).join(';')];
  for (const r of righeTabella(t, e)) {
    const atti = t.righe?.find((x) => x.id === r)?.celle ?? {};
    const riga: unknown[] = [r];
    for (const c of t.colonne) {
      const cel = e?.celle?.[r]?.[c.id];
      const a = atti[c.id];
      riga.push(cel ? cel.valore ?? '' : a?.valore ?? '', cel?.stato ?? (a ? 'agli atti (non confermato)' : ''), a?.valore ?? '', cel?.classe ?? a?.classe ?? '', cel?.fonte ?? a?.fonte ?? '');
    }
    out.push(riga.map(q).join(';'));
  }
  return '﻿' + out.join('\r\n') + '\r\n';
}

// ------------------------------------------------------------------- report dettagliato (HTML)

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function dataUrl(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${b.type || 'image/jpeg'};base64,${btoa(bin)}`;
}

export async function generaDettagliato(ses: Sessione, opz: OpzioniReport = {}): Promise<Uint8Array> {
  const s = ses.struttura, st = ses.stato;
  const miniature = new Map<string, string>();
  for (const e of Object.values(st.evidenze)) {
    if (e.tipo !== 'foto' && e.tipo !== 'annotazione' && e.tipo !== 'firma' && e.tipo !== 'documento') continue;
    const m = await ses.miniatura(e.id);
    if (!m) continue;
    const piccola = m.size > 120_000 ? (await ridimensiona(m, 360, 0.7)) : m;
    if (piccola && piccola.size < 400_000) miniature.set(e.id, await dataUrl(piccola));
  }
  const evid = (ids?: string[]) => (ids ?? []).map((id) => {
    const e = st.evidenze[id];
    if (!e) return '';
    const nome = e.file?.split('/').pop() ?? (e.tipo === 'nota' ? 'nota' : '');
    const img = miniature.get(id);
    return `<figure class="ev${e.annullata ? ' ann' : ''}">${img ? `<img src="${img}" alt="">` : ''}<figcaption>${esc(nome)}${e.testo ? ' — ' + esc(e.testo) : ''}${e.didascalia ? ' — ' + esc(e.didascalia) : ''}<br><small>${dataOra(e.acquisitaIl)} · ${e.sha256 ? esc(e.sha256.slice(0, 16)) + '…' : ''}${e.annullata ? ' · ANNULLATA: ' + esc(e.annullata.motivo) : ''}</small></figcaption></figure>`;
  }).join('');
  const etStato = (x: string) => `<span class="st st-${esc(x)}">${esc(x)}</span>`;
  const blocchi: string[] = [];
  for (const a of [...s.aree].sort((x, y) => x.ordine - y.ordine)) {
    const els = s.elementi.filter((e) => e.area === a.id).sort((x, y) => x.ordine - y.ordine);
    const righe: string[] = [];
    for (const el of els) {
      const e = st.esiti[el.id];
      const comp = statoElemento(s, st, el);
      let corpo = '';
      switch (el.tipo) {
        case 'verifica':
          corpo = `<p>${esc(el.testo)}</p>${el.agliAtti ? `<p class="atti">Agli atti: ${esc(valoreFormattato(el.agliAtti.valore, el.agliAtti.unita))} (${esc(el.agliAtti.classe ?? '')}${el.agliAtti.fonte ? ', ' + esc(el.agliAtti.fonte) : ''})</p>` : ''}${e?.valoreRilevato !== undefined ? `<p>Rilevato: <b>${esc(valoreFormattato(e.valoreRilevato))}</b> ${esc(e.classe ?? '')} ${esc(e.fonte ?? '')}</p>` : ''}${e?.motivo ? `<p>Motivo: ${esc(e.motivo)}</p>` : ''}`;
          break;
        case 'domanda':
          corpo = `<p>${esc(el.testo)}</p>${e?.risposta ? `<p>Risposta: <b>${esc(e.risposta)}</b> — ${esc(e.rispostaDa ?? '')} [${esc(e.provenienza ?? '')}]${e.daConfermarePerIscritto ? ' — da confermare per iscritto' : ''}</p>` : ''}`;
          break;
        case 'foto':
          corpo = `<p>${esc(el.oggetto)}${el.leggibile ? ` — leggibile: ${esc(el.leggibile)}` : ''}</p>${e?.motivo ? `<p>Motivo: ${esc(e.motivo)}</p>` : ''}`;
          break;
        case 'lettura': case 'misura': {
          const g = new Map(el.grandezze.map((x) => [x.id, x]));
          corpo = `<p>${esc(el.tipo === 'lettura' ? el.strumento : `${el.cosa} — ${el.strumento}`)}</p>${(e?.valori ?? []).length ? `<table><tr><th>Grandezza</th><th>Momento</th><th>Rip.</th><th>Valore</th><th>Ora</th></tr>${(e!.valori ?? []).map((v) => `<tr><td>${esc(g.get(v.grandezza ?? '')?.nome ?? v.grandezza)}</td><td>${esc(v.momento ?? '')}</td><td>${v.ripetizione ?? 1}</td><td>${esc(valoreFormattato(v.valore, v.unita))}</td><td>${dataOra(v.il)}${v.oraCorretta ? ` (corretta da ${esc(v.oraCorretta.da)}: ${esc(v.oraCorretta.motivo)})` : ''}</td></tr>`).join('')}</table>` : ''}${e?.strumentoUsato ? `<p>Strumento usato: ${esc(e.strumentoUsato)}</p>` : ''}`;
          break;
        }
        case 'documento':
          corpo = `<p>${esc(el.documento)}${el.daChi ? ` — da ${esc(el.daChi)}` : ''}</p>${e ? `<p>${esc(ETICHETTE_STATO_DOC[e.stato] ?? e.stato)}${e.promessoEntro ? ' entro ' + dataIt(e.promessoEntro) : ''}${e.chiLoInvia ? ' — ' + esc(e.chiLoInvia) : ''}</p>` : ''}`;
          break;
        case 'anomalia':
          corpo = `<p>${esc(el.tema)}</p><p class="atti">Agli atti: ${esc(el.datoAtti)}</p>${e?.esito ? `<p>Esito: <b>${esc(e.esito)}</b></p>` : ''}`;
          break;
        case 'tabella': {
          const rr = righeTabella(el, e);
          corpo = `<table><tr><th>Riga</th>${el.colonne.map((c) => `<th>${esc(c.etichetta)}${c.unita ? ' [' + esc(c.unita) + ']' : ''}</th>`).join('')}</tr>${rr.map((r) => {
            const atti = el.righe?.find((x) => x.id === r)?.celle ?? {};
            return `<tr><td>${esc(r)}</td>${el.colonne.map((c) => {
              const cel = e?.celle?.[r]?.[c.id]; const at = atti[c.id];
              if (cel) return `<td>${cel.stato === 'corretto' ? `<s>${esc(valoreFormattato(at?.valore))}</s> ` : ''}<b>${esc(valoreFormattato(cel.valore))}</b><br><small>${esc(cel.stato)} ${esc(cel.classe ?? '')} ${esc(cel.fonte ?? '')}</small></td>`;
              return at ? `<td class="atti">${esc(valoreFormattato(at.valore, at.unita))}<br><small>agli atti ${esc(at.classe ?? '')}</small></td>` : '<td></td>';
            }).join('')}</tr>`;
          }).join('')}</table>`;
          break;
        }
        case 'protocollo':
          corpo = `<p>${esc(el.titolo)}</p><table><tr><th>Passo</th><th>Previsto</th><th>Manovra</th><th>Esito</th><th>Ora effettiva</th></tr>${el.passi.map((p) => { const pe = e?.passi?.[p.id]; return `<tr><td>${esc(p.id)}</td><td>${esc(p.orarioPrevisto ?? '')}</td><td>${esc(p.manovra)}</td><td>${esc(pe?.stato ?? 'daFare')}${pe?.motivo ? ': ' + esc(pe.motivo) : ''}</td><td>${dataOra(pe?.oraEffettiva)} ${esc(pe?.eseguitoDa ?? '')}</td></tr>`; }).join('')}</table>${e?.ripristino?.il ? `<p>Ripristino firmato da ${esc(e.ripristino.nome)} il ${dataOra(e.ripristino.il)}</p>` : ''}`;
          break;
        case 'uscitaArea':
          corpo = `<ul>${el.voci.map((v) => `<li>${esc(v.testo)} — ${esc(statoLista(s, st, v.rif))}</li>`).join('')}</ul>`;
          break;
        case 'informazione':
          corpo = `<p>${esc(el.testo)}</p>`;
          break;
      }
      const deroga = st.deroghe.find((d) => d.codice === el.id);
      righe.push(`<section class="el p${el.priorita ?? 'C'}" data-stato="${comp}" data-pr="${el.priorita ?? 'C'}"><h4><code>${esc(el.id)}</code> ${esc(el.tipo)} · priorità ${el.priorita ?? '—'} · ${etStato(e?.stato ?? 'aperto')} · ${comp}${el.riservato ? ' · RISERVATO' : ''}</h4>${corpo}${e?.note ? `<p>Note: ${esc(e.note)}</p>` : ''}${e?.notaInterna ? `<p class="int">Nota interna: ${esc(e.notaInterna)}</p>` : ''}${deroga ? `<p class="der">Deroga: ${esc(deroga.motivo)} (${dataOra(deroga.il)})</p>` : ''}${evid(e?.evidenze)}</section>`);
    }
    const chiusa = st.areeChiuse[a.id];
    blocchi.push(`<h3>${esc(a.titolo)} <code>${esc(a.id)}</code>${chiusa ? ` — chiusa ${dataOra(chiusa.il)}${chiusa.conDeroga ? ' con deroga' : ''}` : ''}</h3>${a.scopo ? `<p class="scopo">${esc(a.scopo)}</p>` : ''}${righe.join('')}`);
  }
  const inbox = Object.values(st.evidenze).filter((e) => !e.elementi.length && (e.tipo === 'foto' || e.tipo === 'audio' || e.tipo === 'documento' || e.tipo === 'nota'));
  const ob = (s.obiettivi ?? []).map((o) => `<tr><td>${esc(o.id)}</td><td>${esc(o.titolo)}</td><td>${esc(statoLista(s, st, o.rif))}</td><td>${esc(st.obiettivi[o.id]?.nota ?? '')}</td></tr>`).join('');
  const nl = (s.nonLasciare ?? []).map((v) => `<tr><td>${v.n}</td><td>${esc(v.testo)}</td><td>${esc(v.rif.join(', '))}</td><td>${esc(statoLista(s, st, v.rif))}</td></tr>`).join('');
  const p = s.pratica;
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Report dettagliato — ${esc(p.codice)}</title>
<style>body{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0 auto;max-width:1100px;padding:16px;color:#16202b}h1{font-size:22px}h3{margin-top:28px;border-bottom:2px solid #1b4472;padding-bottom:4px;color:#1b4472}h4{margin:0 0 4px;font-size:13px}code{background:#eef1f5;padding:1px 4px;border-radius:3px}.el{border:1px solid #d6dbe2;border-radius:6px;padding:8px 10px;margin:8px 0}.el[data-stato=completo]{border-left:5px solid #2e7d32}.el[data-stato=aperto]{border-left:5px solid #c62828}.el[data-stato=parziale]{border-left:5px solid #ef8f00}.el[data-stato=derogato]{border-left:5px solid #6a1b9a}.atti{color:#5b6573}table{border-collapse:collapse;width:100%;margin:6px 0;font-size:12px}td,th{border:1px solid #d6dbe2;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eef1f5}.ev{display:inline-block;width:180px;margin:4px;vertical-align:top;font-size:11px}.ev img{width:180px;height:135px;object-fit:cover;border-radius:4px}.ann{opacity:.45}.int{color:#8a4b00}.der{color:#6a1b9a}.filtri{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #d6dbe2}.nascosto{display:none}@media print{.filtri{display:none}}</style></head><body>
<p style="color:#5b6573">${esc(opz.intestazione || p.redattore.societa)} — documento interno di lavoro${opz.bozza ? ' — <b>BOZZA</b>' : ''}</p>
<h1>Report dettagliato del sopralluogo</h1>
<p><b>Pratica ${esc(p.codice)}</b> — ${esc(p.titolo)}<br>${esc(p.committente.ragioneSociale)} — ${esc([p.sito.denominazione, p.sito.indirizzo].filter(Boolean).join(', '))}<br>Data ${dataIt(p.data)} · inizio ${dataOra(st.avviatoIl)} · fine ${dataOra(st.chiusoIl)} · ${esc(s.generazione.revisione)} · idStruttura ${esc(s.idStruttura)}<br>Registro: ${ses.istanza.aSeq} eventi · impronta finale <code>${esc(ses.istanza.hashFinale)}</code></p>
<p><b>Presenti:</b> ${esc(presentiTesto(st).join(' · '))}</p>
${st.consensi ? `<p><b>Consensi:</b> foto ${esc(st.consensi.foto)}${st.consensi.fotoLimiti ? ' (' + esc(st.consensi.fotoLimiti) + ')' : ''} · audio ${esc(st.consensi.registrazioneAudio)}</p>` : ''}
${ob ? `<h3>Obiettivi</h3><table><tr><th>Cod.</th><th>Obiettivo</th><th>Stato</th><th>Nota</th></tr>${ob}</table>` : ''}
${nl ? `<h3>Le cose da non lasciare</h3><table><tr><th>N.</th><th>Voce</th><th>Codici</th><th>Stato</th></tr>${nl}</table>` : ''}
${st.deroghe.length ? `<h3>Deroghe</h3><ul>${st.deroghe.map((d) => `<li><code>${esc(d.codice)}</code> ${esc(d.motivo)} (${dataOra(d.il)})</li>`).join('')}</ul>` : ''}
<div class="filtri">Filtra: <label><input type="checkbox" id="fa"> solo priorità A</label> <label><input type="checkbox" id="fo"> solo non completi</label></div>
${blocchi.join('\n')}
${inbox.length ? `<h3>INBOX — evidenze non assegnate</h3>${evid(inbox.map((e) => e.id))}` : ''}
<h3>Impronte</h3><p style="font-size:12px">Ogni file del pacchetto è elencato con la sua impronta SHA-256 in <code>hash.sha256</code>. Le impronte qui mostrate sono abbreviate.</p>
<script>(function(){var a=document.getElementById('fa'),o=document.getElementById('fo');function f(){document.querySelectorAll('.el').forEach(function(e){var h=(a.checked&&e.dataset.pr!=='A')||(o.checked&&e.dataset.stato==='completo');e.classList.toggle('nascosto',h)})}a.onchange=f;o.onchange=f})();</script>
</body></html>`;
  return utf8(html);
}

// ------------------------------------------------------------------- insieme dei report per l'export

export async function generaTuttiIReport(ses: Sessione, opz: OpzioniReport = {}, soloCsv = false): Promise<FileReport[]> {
  const out: FileReport[] = [];
  for (const el of ses.struttura.elementi) {
    if (el.tipo !== 'tabella' || el.solaLettura) continue;
    const e = ses.stato.esiti[el.id];
    if (!e) continue;
    out.push({ nome: `report/tabelle/${el.id.replace(/[^A-Za-z0-9._-]/g, '-')}.csv`, dati: utf8(csvTabella(el, e)), tipo: 'tabellaCsv', elemento: el.id });
  }
  if (soloCsv) return out;
  out.push({ nome: 'report/verbale.pdf', dati: await generaVerbale(ses, opz), tipo: 'verbale' });
  out.push({ nome: 'report/report_dettagliato.html', dati: await generaDettagliato(ses, opz), tipo: 'reportDettagliato' });
  out.push({ nome: 'report/report_sintetico_cliente.pdf', dati: await generaSintetico(ses, opz), tipo: 'reportSintetico' });
  out.push({ nome: 'report/fascicolo_fotografico.pdf', dati: await generaFascicolo(ses, opz), tipo: 'fascicoloFotografico' });
  return out;
}

export { sha256 };
