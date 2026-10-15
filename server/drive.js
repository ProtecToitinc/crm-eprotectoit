'use strict';
/**
 * Drive -> CRM eProtectoIT.
 * Garde-fous : aperçu (dry-run) sans écriture, rapprochement prudent, jamais d'écrasement
 * de données modifiées à la main, jamais de rétrogradation d'étape, aucun doublon de client.
 */
const ExcelJS = require('exceljs');
const db = require('./database');
const google = require('./google');
const { norm, phoneKey, emailKey, nextReference, getSetting, setSetting, addHistory } = require('./lib');

const ROOT = '1Xg_dEIz77yVxZQ20hfHXN4rd_uE7vLfN';
const LEADS = '1eFQSjqzmzTseq31FJpp_D72mB2CUDr9S';
const TEMPLATE = '1iixhLjIV2lTiCxc3DxIbtX-P76FebUk9';
const TAXES = 1.14975; // TPS 5 % + TVQ 9,975 %
const STAGE_ORDER = ['lead', 'soumission', 'rdv', 'contrat', 'complete'];

const clean = v => String(v ?? '').trim();
const normName = value => norm(clean(value)).replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const safeError = e => clean(e?.message || e).replace(/(access_token|refresh_token|client_secret)=[^&\s]+/gi, '$1=[masqué]').slice(0, 300);
const r2 = n => Math.round(n * 100) / 100;
const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parseJson = s => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
const personName = folderName => clean(folderName).replace(/\s*\([^)]*\)\s*$/, '').trim();
const stageRank = x => STAGE_ORDER.indexOf(x);

/** Montant : nombre ou texte du genre « 2 610,00 $ ». Du texte libre (« Inclut ... 2026/06/09 ») n'est JAMAIS un montant. */
const money = v => {
  if (v == null || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object') return null;
  let s = clean(v);
  if (!s || !/^[-+]?\s*\$?\s*[-+]?\s*[\d\s .,]+\s*\$?$/.test(s)) return null;
  const negative = s.includes('-');
  s = s.replace(/[^\d,.]/g, '');
  if (!/\d/.test(s)) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
};
const fmtPhone = v => {
  let d = clean(v).replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : clean(v);
};
const fmtPostal = v => {
  const s = clean(v).toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s) ? `${s.slice(0, 3)} ${s.slice(3)}` : clean(v);
};
const hasNumero = (notes, numero) => !!clean(numero) && new RegExp(`soumission\\s*#\\s*${escapeRe(clean(numero))}(?!\\d)`, 'i').test(String(notes || ''));
const anyNumero = notes => /soumission\s*#\s*\d+/i.test(String(notes || ''));

// ---- Formules sans résultat enregistré (fichiers produits par la conversion Google) : petit évaluateur sûr, sans eval ----
const colNum = letters => letters.toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
function evalFormula(sheet, formula, depth = 0) {
  if (depth > 12) throw new Error('formule circulaire');
  const src = String(formula).replace(/^=/, '').replace(/\$/g, '');
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)(%?)|([A-Za-z]+\d+:[A-Za-z]+\d+)|([A-Za-z]+\d+)|([A-Za-z]+)(?=\()|([()+\-*\/,]))/y;
  let m, pos = 0;
  while (pos < src.length && src.slice(pos).trim()) {
    re.lastIndex = pos; m = re.exec(src);
    if (!m) throw new Error('formule non prise en charge');
    pos = re.lastIndex;
    tokens.push(m[1] !== undefined ? { t: 'num', v: Number(m[1]) / (m[2] ? 100 : 1) } : m[3] ? { t: 'range', v: m[3] } : m[4] ? { t: 'ref', v: m[4] } : m[5] ? { t: 'fn', v: m[5].toUpperCase() } : { t: 'op', v: m[6] });
  }
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  const num = addr => {
    const cell = sheet.getCell(addr), v = cell.value;
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && 'formula' in v) {
      if ('result' in v) { if (typeof v.result === 'number') return v.result; throw new Error('résultat invalide'); }
      return evalFormula(sheet, v.formula, depth + 1);
    }
    throw new Error('texte dans un calcul');
  };
  const range = rng => {
    const [a, b] = rng.split(':'), pa = /([A-Za-z]+)(\d+)/.exec(a), pb = /([A-Za-z]+)(\d+)/.exec(b), out = [];
    for (let r = +pa[2]; r <= +pb[2]; r++) for (let c = colNum(pa[1]); c <= colNum(pb[1]); c++) out.push(num(sheet.getCell(r, c).address));
    return out;
  };
  function expr() { let v = term(); while (peek() && peek().t === 'op' && '+-'.includes(peek().v)) { const o = next().v; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  function term() { let v = unary(); while (peek() && peek().t === 'op' && '*/'.includes(peek().v)) { const o = next().v; const r = unary(); if (o === '/' && r === 0) throw new Error('division par zéro'); v = o === '*' ? v * r : v / r; } return v; }
  function unary() { if (peek() && peek().t === 'op' && (peek().v === '-' || peek().v === '+')) { const o = next().v; const v = unary(); return o === '-' ? -v : v; } return primary(); }
  function primary() {
    const tk = next();
    if (!tk) throw new Error('formule incomplète');
    if (tk.t === 'num') return tk.v;
    if (tk.t === 'ref') return num(tk.v);
    if (tk.t === 'op' && tk.v === '(') { const v = expr(); if (next()?.v !== ')') throw new Error('parenthèse'); return v; }
    if (tk.t === 'fn') {
      if (!['SUM', 'ROUND'].includes(tk.v) || next()?.v !== '(') throw new Error('fonction non prise en charge');
      const args = [];
      while (true) {
        if (peek()?.t === 'range') args.push(...range(next().v)); else args.push(expr());
        const sep = next();
        if (sep?.v === ')') break;
        if (sep?.v !== ',') throw new Error('arguments');
      }
      return tk.v === 'SUM' ? args.reduce((a, b) => a + b, 0) : Math.round(args[0] * 10 ** (args[1] || 0)) / 10 ** (args[1] || 0);
    }
    throw new Error('formule non prise en charge');
  }
  const value = expr();
  if (i < tokens.length) throw new Error('formule non prise en charge');
  return value;
}
function cellValue(c) {
  if (!c) return '';
  const v = c.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('formula' in v && !('result' in v)) { try { return evalFormula(c.worksheet, v.formula); } catch { return ''; } }
    if ('result' in v) return v.result?.error ? '' : cellValue({ value: v.result });
    if ('text' in v) return v.text;
    if (Array.isArray(v.richText)) return v.richText.map(x => x.text).join('');
    return '';
  }
  return v;
}
/** Les étiquettes du gabarit sont SOUS leurs valeurs : on lit la cellule au-dessus de l'étiquette. */
function lookup(sheet, label, fallback) {
  const target = norm(label);
  for (let row = 2; row <= Math.min(sheet.rowCount, 90); row++) {
    for (let col = 1; col <= Math.min(sheet.columnCount, 15); col++) {
      const c = sheet.getCell(row, col);
      if (c.isMerged && c.master.address !== c.address) continue;
      if (norm(cellValue(c)) === target) {
        const v = cellValue(sheet.getCell(row - 1, col));
        if (clean(v)) return v;
      }
    }
  }
  return cellValue(sheet.getCell(fallback));
}
/** Une signature compte seulement si la cellule de date contient une vraie date. */
function signature(sheet, row) {
  for (const col of ['D', 'E']) {
    const value = sheet.getCell(`${col}${row}`).value;
    if (value instanceof Date && !isNaN(value.valueOf())) return true;
    const s = clean(cellValue(sheet.getCell(`${col}${row}`)));
    if (/\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/](?:20)?\d{2}\b/.test(s)) return true;
  }
  return false;
}
const JSZip = require('jszip');
/** Charge un .xlsx ; fichier vide / ancien format = erreur « illisible » claire ; images mal formées retirées au besoin. */
async function loadWorkbook(buffer) {
  const fail = message => { const e = new Error(message); e.unreadable = true; return e; };
  if (!buffer || buffer.length < 4) throw fail('Fichier vide');
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw fail(buffer[0] === 0xd0 && buffer[1] === 0xcf ? 'Ancien format .xls : ouvre-le dans Excel et enregistre-le en .xlsx' : 'Fichier illisible (vide, corrompu ou pas un classeur Excel)');
  }
  try { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer); return wb; }
  catch (error) {
    if (!/anchors|drawing/i.test(String(error?.message))) throw error;
    // Image mal formée dans le fichier : on retire les dessins, le contrat se lit sans eux.
    const zip = await JSZip.loadAsync(buffer);
    for (const name of Object.keys(zip.files)) if (/^xl\/(drawings|media)\//.test(name)) zip.remove(name);
    for (const name of Object.keys(zip.files)) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) zip.file(name, (await zip.file(name).async('string')).replace(/<drawing\b[^>]*\/>/g, '').replace(/<legacyDrawing\b[^>]*\/>/g, ''));
      if (/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(name)) zip.file(name, (await zip.file(name).async('string')).replace(/<Relationship\b[^>]*Target="[^"]*drawings\/[^"]*"[^>]*\/>/g, ''));
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await zip.generateAsync({ type: 'nodebuffer' }));
    return wb;
  }
}
async function parseContract(buffer) {
  const workbook = await loadWorkbook(buffer);
  const s = workbook.getWorksheet('Soumission') || workbook.worksheets.find(w => norm(w.name).includes('soumission'));
  if (!s) throw new Error('Feuille Soumission absente');
  const read = (label, address) => clean(lookup(s, label, address));
  const warnings = [];
  const services = [];
  for (let row = 24; row <= 31; row++) {
    if (/^x$/i.test(clean(cellValue(s.getCell(`C${row}`))))) services.push(clean(cellValue(s.getCell(`B${row}`))));
  }
  const ranked = ['Protection Noxnano', 'Protection Noxseal', 'Nettoyage de toiture', 'Nettoyage de gouttières', 'Réparations mineures de la toiture'];
  const service = ranked.find(x => services.some(y => norm(y).includes(norm(x)))) || services.find(x => x && !/rabais|subvention/i.test(x)) || 'Protection Toiture';
  const surfaceLine = clean(cellValue(s.getCell('H24')));
  const surfaceMatch = surfaceLine.match(/([\d][\d\s,.]*)\s*(?:pi(?:eds?)?\s*(?:carr[eé]s?|\^?2)|pieds?\s+carr[eé]s?)/i);
  const pi2 = surfaceMatch ? money(surfaceMatch[1]) : null;
  const items = [];
  for (let row = 57; row <= Math.min(s.rowCount, 82); row++) {
    const label = clean(cellValue(s.getCell(`A${row}`)));
    const price = money(cellValue(s.getCell(`G${row}`)));
    if (label && price !== null) items.push({ label, price });
  }
  const amount = money(cellValue(s.getCell('G67')));
  const additions = money(cellValue(s.getCell('I67'))) || 0;
  const grand = money(cellValue(s.getCell('J75'))) ?? money(cellValue(s.getCell('G73')));
  let works = amount === null ? (items.length ? items.reduce((a, x) => a + x.price, 0) : null) : amount;
  let travaux = works === null ? null : r2(works + additions);
  let total = grand === null && travaux !== null ? r2(travaux * TAXES) : (grand === null ? null : r2(grand));
  // Moins de 100 $ = montant d'essai ou de gabarit, jamais une vraie soumission.
  if (travaux !== null && travaux < 100) { if (travaux > 0) warnings.push(`Montant d'essai ignoré (${travaux})`); travaux = null; total = null; }
  if (total !== null && total < 100) { if (total > 0) warnings.push(`Total d'essai ignoré (${total})`); total = null; }
  // Valeurs aberrantes : mieux vaut aucun montant qu'un montant faux.
  if (travaux !== null && (travaux < 0 || travaux > 500000)) { warnings.push(`Montant des travaux douteux (${travaux})`); travaux = null; total = null; }
  if (total !== null && (total < 0 || total > 600000)) { warnings.push(`Total douteux (${total})`); total = null; }
  const raw = {};
  for (const a of ['J2', 'E6', 'H6', 'E8', 'H8', 'H10', 'H12', 'G67', 'I67', 'G73', 'J75']) raw[a] = cellValue(s.getCell(a));
  const numero = clean(cellValue(s.getCell('J2'))).replace(/^#\s*/, '');
  const tel2 = read('Téléphone 2', 'E12');
  return {
    numero: /^\d+$/.test(numero) ? numero : numero.replace(/\D/g, ''),
    nom: read('Nom client', 'E6'), prenom: read('Prénom client', 'H6'),
    adresse: read('Adresse', 'E8'), ville: read('Ville', 'H8'), code_postal: read('Code postal', 'E10'),
    telephone: read('Téléphone 1', 'H10'), telephone2: /^x?$/i.test(clean(tel2)) ? '' : clean(tel2), email: read('Courriel', 'H12'),
    service, services, pi2, superficie_m2: pi2 === null ? null : r2(pi2 * 0.09290304),
    travaux, total, signe: signature(s, 69) && signature(s, 71), warnings, raw
  };
}

const TABLES = ['clients', 'opportunites', 'quotes', 'toitures', 'documents', 'drive_items'];
const colCache = new Map();
async function cols(table) {
  if (!TABLES.includes(table)) throw new Error('Table interdite');
  if (!colCache.has(table)) colCache.set(table, new Set((await db.all(`PRAGMA table_info(${table})`)).map(x => x.name)));
  return colCache.get(table);
}
async function insert(table, values) {
  const columns = await cols(table);
  const pairs = Object.entries(values).filter(([k, v]) => columns.has(k) && v !== undefined);
  if (!pairs.length) throw new Error(`Aucune colonne valide pour ${table}`);
  const r = await db.run(`INSERT INTO ${table} (${pairs.map(([k]) => `"${k}"`).join(',')}) VALUES (${pairs.map(() => '?').join(',')})`, pairs.map(([, v]) => v));
  return r.lastID;
}
async function patch(table, id, values) {
  const columns = await cols(table);
  const pairs = Object.entries(values).filter(([k, v]) => columns.has(k) && v !== undefined);
  if (!pairs.length) return;
  const touch = columns.has('updated_at') ? ",updated_at=datetime('now')" : '';
  await db.run(`UPDATE ${table} SET ${pairs.map(([k]) => `"${k}"=?`).join(',')}${touch} WHERE id=?`, [...pairs.map(([, v]) => v), id]);
}
async function listAll(drive, q, fields = 'nextPageToken,files(id,name,parents,modifiedTime,mimeType,size,webViewLink)') {
  let pageToken; const all = [];
  do {
    const response = await drive.files.list({ q, pageSize: 1000, fields, supportsAllDrives: true, includeItemsFromAllDrives: true, ...(pageToken ? { pageToken } : {}) });
    all.push(...response.data.files || []); pageToken = response.data.nextPageToken;
  } while (pageToken);
  return all;
}
async function fetchExcel(drive, file) {
  let r;
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') r = await drive.files.export({ fileId: file.id, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { responseType: 'arraybuffer' });
  else r = await drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  return Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data);
}
const docLink = file => file.webViewLink || (file.mimeType === 'application/vnd.google-apps.spreadsheet' ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(file.id)}/edit` : `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`);
const isSheet = f => f.id !== TEMPLATE && (/\.xlsx$/i.test(f.name) || f.mimeType === 'application/vnd.google-apps.spreadsheet');
const q = id => String(id).replace(/[\\']/g, c => '\\' + c);

async function loadContext() {
  const [clients, opps, quotes, items, toitures, docs] = await Promise.all([
    db.all('SELECT * FROM clients'), db.all('SELECT * FROM opportunites'), db.all('SELECT * FROM quotes'),
    db.all('SELECT * FROM drive_items'), db.all('SELECT DISTINCT client_id FROM toitures'), db.all('SELECT client_id,chemin FROM documents WHERE client_id IS NOT NULL')
  ]);
  return { clients, opps, quotes, items: new Map(items.map(i => [i.drive_id, i])), toitures: new Set(toitures.map(t => t.client_id)), docs: new Set(docs.map(d => `${d.client_id}|${d.chemin}`)), virtual: 0 };
}

// ---------- rapprochement ----------
function nameTokens(c) { return norm([c.prenom, c.nom].join(' ')).split(/[^a-z0-9]+/).filter(t => t.length > 1); }
/** Le contrat et la fiche partagent-ils au moins un mot du nom? (ou l'un des deux n'a pas de nom) */
function namesOverlap(client, first, last) {
  const a = nameTokens(client), b = nameTokens({ prenom: first, nom: last });
  return !a.length || !b.length || a.some(t => b.includes(t));
}
const sameName = (client, first, last) => !!normName([first, last].join(' ')) && normName([client.prenom, client.nom].join(' ')) === normName([first, last].join(' '));

function match(ctx, file, folder, contract, seen) {
  // Choix manuels de l'utilisateur
  if (seen?.decision === 'lier' && seen.client_id) return { id: seen.client_id, reason: 'liaison manuelle' };
  if (seen?.decision === 'creer') return { id: null, reason: 'création confirmée' };
  const items = ctx.items instanceof Map ? [...ctx.items.values()] : ctx.items;
  const links = items.filter(x => x.client_id && [file?.id, folder?.id].includes(x.drive_id));
  const linkIds = [...new Set(links.map(x => x.client_id))];
  if (linkIds.length === 1) return { id: linkIds[0], reason: 'déjà lié à Drive' };
  if (linkIds.length > 1) return { review: true, reason: 'Liens Drive contradictoires', candidates: linkIds };

  const folderPerson = personName(folder?.name);
  const first = contract?.prenom || folderPerson.split(/\s+/)[0] || '';
  const last = contract ? contract.nom : folderPerson.split(/\s+/).slice(1).join(' ');
  const compat = c => sameName(c, first, last);
  const byId = id => ctx.clients.find(c => c.id === id);
  const phone = contract?.telephone ? phoneKey(contract.telephone) : '', mail = contract?.email ? emailKey(contract.email) : '';
  const sharesContact = c => (phone && phoneKey(c.telephone) === phone) || (mail && emailKey(c.email) === mail);

  if (contract?.numero) {
    const ids = [...new Set(ctx.opps.filter(o => hasNumero(o.notes, contract.numero)).map(o => byId(o.client_id)).filter(c => c && (compat(c) || sharesContact(c) || (!last && namesOverlap(c, first, last)))).map(c => c.id))];
    if (ids.length === 1) return { id: ids[0], reason: 'numéro de soumission' };
    if (ids.length > 1) return { review: true, reason: 'Plusieurs clients avec la même soumission', candidates: ids };
  }
  if (phone || mail) {
    const found = ctx.clients.filter(sharesContact);
    if (found.length === 1) {
      if (namesOverlap(found[0], first, last)) return { id: found[0].id, reason: 'téléphone / courriel' };
      return { review: true, reason: 'Même téléphone ou courriel, mais nom différent', candidates: [found[0].id] };
    }
    if (found.length > 1) {
      const named = found.filter(compat);
      if (named.length === 1) return { id: named[0].id, reason: 'téléphone + nom' };
      return { review: true, reason: 'Coordonnées partagées par plusieurs clients', candidates: found.map(c => c.id) };
    }
  }
  const named = ctx.clients.filter(compat);
  if (named.length === 1) return { id: named[0].id, reason: 'nom exact' };
  if (named.length > 1) return { review: true, reason: 'Nom présent plusieurs fois', candidates: named.map(c => c.id) };
  // Un prénom seul (Jad) n'est jamais un rapprochement automatique sûr
  if (!last && first && ctx.clients.some(c => normName(c.prenom) === normName(first))) return { review: true, reason: 'Prénom seul : rapprochement manuel requis' };
  if (!first || (contract && !last && !contract.telephone && !contract.email)) return { review: true, reason: 'Identité insuffisante pour créer un client' };
  return { id: null, reason: 'nouveau client' };
}

/** Champs à mettre à jour : on remplit les vides, et on ne remplace qu'une valeur que l'utilisateur n'a pas modifiée depuis la dernière synchro. */
function mergeSnapshot(current, prior, next) {
  const changes = {};
  for (const [field, value] of Object.entries(next)) {
    if (value == null || value === '') continue;
    if (current[field] == null || current[field] === '') changes[field] = value;
    else if (prior && Object.prototype.hasOwnProperty.call(prior, field) && clean(current[field]) === clean(prior[field]) && clean(value) !== clean(prior[field])) changes[field] = value;
  }
  return changes;
}

async function saveItem(run, item, kind, fields) {
  const previous = run.ctx.items.get(item.id) || {};
  const row = {
    ...previous, ...fields, drive_id: item.id, kind, name: item.name, parent_id: item.parents?.[0] || previous.parent_id || null,
    modified_time: item.modifiedTime || previous.modified_time || null, web_link: item.webViewLink || previous.web_link || null, synced_at: new Date().toISOString()
  };
  if (!row.status) row.status = 'ok';
  if (fields.status && fields.status !== 'ok' && previous.snapshot) row.snapshot = previous.snapshot; // garder le dernier bon état
  run.ctx.items.set(item.id, row);
  if (run.dry) return;
  const columns = await cols('drive_items');
  const pairs = Object.entries(row).filter(([k]) => columns.has(k) && k !== 'drive_id');
  await db.run(`INSERT INTO drive_items (drive_id,${pairs.map(([k]) => k).join(',')}) VALUES (?,${pairs.map(() => '?').join(',')})
    ON CONFLICT(drive_id) DO UPDATE SET ${pairs.map(([k]) => `${k}=excluded.${k}`).join(',')}`, [item.id, ...pairs.map(([, v]) => v ?? null)]);
}
const virtualId = run => --run.ctx.virtual;

const isDriveOpp = o => /import[ée]\s*drive/i.test(o.notes || '');
/** Retrouve l'opportunité déjà existante pour ce contrat (lien Drive, numéro, ancienne opportunité sans numéro, choix « mettre à jour »). */
function findOpp(ctx, file, clientId, parsed, seen) {
  const clientOpps = ctx.opps.filter(o => o.client_id === clientId);
  const linkedElsewhere = o => [...ctx.items.values()].some(i => i.opportunite_id === o.id && i.drive_id !== file.id && i.kind === 'file');
  let opp = (seen?.opportunite_id && clientOpps.find(o => o.id === seen.opportunite_id))
    || (parsed.numero && clientOpps.find(o => hasNumero(o.notes, parsed.numero)));
  if (!opp) {
    // Opportunité sans numéro créée par l'ancien import (ou lead du dossier Drive) : on la reprend au lieu d'en créer une 2e.
    const legacy = clientOpps.filter(o => !anyNumero(o.notes) && !linkedElsewhere(o) && (isDriveOpp(o) || (o.etape === 'lead' && /^Lead - /.test(o.titre || ''))));
    if (legacy.length === 1) opp = legacy[0];
  }
  if (!opp && seen?.decision === 'maj') {
    const drive = clientOpps.filter(o => isDriveOpp(o) && !linkedElsewhere(o));
    if (drive.length === 1) opp = drive[0];
  }
  return { opp: opp || null, clientOpps };
}

/** Aucune transaction : chaque étape est idempotente (rapprochement par numéro / liens Drive), donc une reprise après erreur ne crée pas de doublon. */
async function storeContract(run, file, folder, parsed, decision) {
  const { ctx, dry } = run;
  const plan = [];
  const seen = ctx.items.get(file.id);
  const prior = parseJson(seen?.snapshot);
  const force = seen?.decision === 'maj'; // l'utilisateur a choisi de mettre à jour l'ancienne soumission avec ce contrat
  const values = { prenom: parsed.prenom, nom: parsed.nom || '', adresse: parsed.adresse, ville: parsed.ville, code_postal: fmtPostal(parsed.code_postal), telephone: fmtPhone(parsed.telephone), email: parsed.email };

  let clientId = decision.id;
  if (!clientId) {
    plan.push('Créer le client');
    const notes = `Importé Drive: ${file.name}`;
    clientId = dry ? virtualId(run) : await insert('clients', { ...values, notes });
    ctx.clients.push({ id: clientId, ...values, notes });
    if (!dry) await addHistory(clientId, 'drive', `Client créé automatiquement depuis Drive (${file.name})`);
  } else {
    const current = ctx.clients.find(c => c.id === clientId);
    if (!current) throw new Error('Client lié introuvable');
    const changes = mergeSnapshot(current, prior.client, values);
    if (Object.keys(changes).length) {
      plan.push(`Compléter la fiche : ${Object.keys(changes).join(', ')}`);
      if (!dry) { await patch('clients', clientId, changes); await addHistory(clientId, 'drive', `Fiche complétée depuis Drive : ${Object.keys(changes).join(', ')}`); }
      Object.assign(current, changes);
    }
  }

  // ----- opportunité -----
  const { opp: foundOpp, clientOpps } = findOpp(ctx, file, clientId, parsed, seen);
  let opp = foundOpp;
  const oppExisted = !!opp;
  const priced = (parsed.total || 0) > 0 || (parsed.travaux || 0) > 0;
  const oppNotes = parsed.numero ? `Soumission #${parsed.numero} - Importé Drive` : 'Importé Drive';
  let oppId = null;
  if (!opp && !priced && clientOpps.length) {
    // Contrat sans montants (ex. copie du gabarit) pour un client qui a déjà un dossier : on lie seulement le document.
  } else if (!opp) {
    plan.push(`Créer l'opportunité (${parsed.signe ? 'contrat signé' : priced ? 'soumission' : 'lead, sans montants'}, ${parsed.travaux ?? '—'} $)`);
    const row = { client_id: clientId, titre: `Protection Toiture - ${parsed.service}`, service: parsed.service, notes: oppNotes, etape: parsed.signe ? 'contrat' : priced ? 'soumission' : 'lead', valeur: parsed.travaux };
    oppId = dry ? virtualId(run) : await insert('opportunites', row);
    ctx.opps.push({ id: oppId, ...row });
  } else {
    oppId = opp.id;
    const update = {};
    const rank = stageRank(opp.etape);
    if (parsed.signe && rank >= 0 && rank < stageRank('contrat')) update.etape = 'contrat';
    else if (rank === 0 && priced) update.etape = 'soumission';
    if (force && parsed.numero && !hasNumero(opp.notes, parsed.numero)) update.notes = oppNotes;
    if (parsed.travaux != null && parsed.travaux > 0 && (force || opp.valeur == null || Number(opp.valeur) === 0 || (prior.travaux != null && Number(opp.valeur) === Number(prior.travaux) && Number(opp.valeur) !== parsed.travaux))) update.valeur = parsed.travaux;
    if (!opp.service) update.service = parsed.service;
    if (parsed.numero && !anyNumero(opp.notes) && (!opp.notes || /^import[ée]\s*drive$/i.test(clean(opp.notes)) || /^soumission\s*#\s*[-?]?\s*-?\s*import/i.test(clean(opp.notes)))) update.notes = oppNotes;
    if (Object.keys(update).length) {
      plan.push(`Mettre à jour l'opportunité : ${Object.entries(update).filter(([k]) => k !== 'notes').map(([k, v]) => `${k}=${v}`).join(', ') || 'numéro'}`);
      if (!dry) await patch('opportunites', oppId, update);
      Object.assign(opp, update);
    }
  }

  // ----- soumission (quote) -----
  const clientQuotes = ctx.quotes.filter(x => x.client_id === clientId);
  const takenByOtherFile = x => [...ctx.items.values()].some(i => i.quote_id === x.id && i.drive_id !== file.id && i.kind === 'file');
  let quote = (seen?.quote_id && ctx.quotes.find(q => q.id === seen.quote_id))
    || clientQuotes.find(x => hasNumero(x.notes, parsed.numero));
  if (!quote) {
    const onOpp = clientQuotes.filter(x => x.opportunite_id === oppId && !takenByOtherFile(x));
    quote = onOpp.length === 1 ? onOpp[0] : null;
  }
  if (!quote && oppExisted) {
    // Ancien import : soumission sans numéro ni lien. On la reprend si le montant correspond ou si c'est la seule non liée.
    // Seulement si le montant correspond (sinon c'est une autre soumission, pas l'ancienne).
    const loose = clientQuotes.filter(x => !x.opportunite_id && !anyNumero(x.notes) && !takenByOtherFile(x));
    quote = loose.find(x => parsed.total != null && Math.abs(Number(x.montant) - parsed.total) < 0.015) || (parsed.total == null && loose.length === 1 ? loose[0] : null);
  }
  let quoteId = null;
  if (!quote && !priced) {
    // Contrat sans montants : rien à soumettre pour l'instant
  } else if (!quote) {
    plan.push(`Créer la soumission (${parsed.total ?? '—'} $)`);
    const row = { client_id: clientId, opportunite_id: oppId, service: parsed.service, montant: parsed.total, statut: parsed.signe ? 'acceptee' : 'envoyee', notes: oppNotes };
    quoteId = dry ? virtualId(run) : await insert('quotes', { ...row, reference: await nextReference('SOU', 'quotes') });
    ctx.quotes.push({ id: quoteId, ...row });
  } else {
    quoteId = quote.id;
    const update = {};
    if (parsed.signe && ['brouillon', 'envoyee'].includes(quote.statut)) update.statut = 'acceptee';
    if (force && parsed.numero && !hasNumero(quote.notes, parsed.numero)) update.notes = oppNotes;
    if (parsed.total != null && (force || quote.montant == null || Number(quote.montant) === 0 || (prior.total != null && Number(quote.montant) === Number(prior.total) && Number(quote.montant) !== parsed.total))) update.montant = parsed.total;
    if (!quote.opportunite_id) update.opportunite_id = oppId;
    if (!quote.notes) update.notes = oppNotes;
    if (Object.keys(update).length) {
      plan.push(`Mettre à jour la soumission : ${Object.entries(update).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      if (!dry) await patch('quotes', quoteId, update);
      Object.assign(quote, update);
    }
  }

  // ----- toiture + document -----
  if (parsed.pi2 != null && !ctx.toitures.has(clientId)) {
    plan.push(`Ajouter la toiture (${parsed.superficie_m2} m²)`);
    if (!dry) await insert('toitures', { client_id: clientId, materiau: /noxnano/i.test(parsed.service) ? 'Noxnano' : null, superficie_m2: parsed.superficie_m2 });
    ctx.toitures.add(clientId);
  }
  const url = docLink(file);
  let documentId = seen?.document_id || null;
  if (!ctx.docs.has(`${clientId}|${url}`)) {
    plan.push('Lier le contrat Drive à la fiche');
    if (!dry) documentId = await insert('documents', { client_id: clientId, nom: file.name, chemin: url, type_doc: 'soumission' });
    ctx.docs.add(`${clientId}|${url}`);
  }
  const snapshot = JSON.stringify({ client: values, travaux: parsed.travaux, total: parsed.total, numero: parsed.numero, signe: parsed.signe });
  await saveItem(run, file, 'file', { client_id: clientId, opportunite_id: oppId, quote_id: quoteId, document_id: documentId, status: 'ok', message: decision.reason, snapshot });
  if (folder) await saveItem(run, folder, 'folder', { client_id: clientId, opportunite_id: ctx.items.get(folder.id)?.opportunite_id || oppId, status: 'ok', message: 'Dossier client synchronisé' });
  return { client_id: clientId, opportunite_id: oppId, quote_id: quoteId, plan };
}

async function storeFolder(run, folder, decision) {
  const { ctx, dry } = run;
  const plan = [];
  let clientId = decision.id, oppId = ctx.items.get(folder.id)?.opportunite_id || null;
  if (!clientId) {
    const parts = personName(folder.name).split(/\s+/);
    const row = { prenom: parts.shift() || '', nom: parts.join(' '), notes: 'Lead importé du dossier Drive Leads (aucun fichier)' };
    plan.push('Créer le client (dossier sans contrat)');
    clientId = dry ? virtualId(run) : await insert('clients', row);
    ctx.clients.push({ id: clientId, ...row });
    const opp = { client_id: clientId, titre: `Lead - ${personName(folder.name)}`, etape: 'lead', service: 'Protection Toiture' };
    oppId = dry ? virtualId(run) : await insert('opportunites', opp);
    ctx.opps.push({ id: oppId, ...opp });
    if (!dry) await addHistory(clientId, 'drive', `Client créé automatiquement depuis le dossier Drive « ${folder.name} »`);
  }
  await saveItem(run, folder, 'folder', { client_id: clientId, opportunite_id: oppId, status: 'ok', message: 'Dossier sans contrat' });
  return { client_id: clientId, plan };
}

/** Une version plus ancienne du même contrat (même adresse, numéro plus petit) ne doit pas créer une 2e soumission. */
function findSuperseded(parsedList, ctx) {
  const superseded = new Map(), revisions = new Map();
  // Même adresse ET même personne (téléphone ou nom) : sinon deux clients à la même adresse seraient confondus.
  const key = p => (normName(p.adresse) ? `${normName(p.adresse)}|${phoneKey(p.telephone) || normName([p.prenom, p.nom].join(' '))}` : '');
  const imported = x => ctx.items.get(x.file.id)?.status === 'ok' || ctx.opps.some(o => hasNumero(o.notes, x.parsed.numero));
  for (const a of parsedList) {
    if (!a.parsed.numero || !key(a.parsed)) continue;
    const newer = parsedList.find(b => b !== a && b.parsed.numero && key(b.parsed) === key(a.parsed) && Number(b.parsed.numero) > Number(a.parsed.numero));
    if (!newer) continue;
    if (!imported(a)) superseded.set(a.file.id, newer.parsed.numero);                 // ancienne copie jamais importée : on l'ignore
    else if (!imported(newer)) revisions.set(newer.file.id, a.parsed.numero);          // nouvelle version d'un contrat déjà importé : à confirmer
  }
  return { superseded, revisions };
}

async function processFolderOnly(run, folder) {
  const { ctx, result, dry } = run;
  const seen = ctx.items.get(folder.id);
  if (seen?.decision === 'ignorer') return;
  if (seen?.status === 'ok' && seen.client_id) { result.unchanged++; return; }
  const decision = match(ctx, null, folder, null, seen);
  if (decision.review) {
    result.review++;
    result.details.push({ kind: 'folder', name: folder.name, id: folder.id, action: 'à valider', reason: decision.reason, candidates: decision.candidates || [] });
    await saveItem(run, folder, 'folder', { status: 'validation', message: decision.reason, client_id: null });
    return;
  }
  const stored = await storeFolder(run, folder, decision);
  result.details.push({ kind: 'folder', name: folder.name, id: folder.id, action: decision.id ? 'rapproché' : 'créé', client_id: dry && !decision.id ? null : stored.client_id, reason: decision.reason, plan: stored.plan });
  decision.id ? result.matched++ : result.created++;
}
async function processParsed(run, file, folder, parsed, superseded, revisionOf) {
  const { ctx, result, dry } = run;
  const seen = ctx.items.get(file.id);
  // Copie du gabarit : les montants sont ceux du modèle, jamais ceux d'un client.
  if (/gabarit/i.test(file.name)) parsed = { ...parsed, travaux: null, total: null, pi2: null, superficie_m2: null, signe: false };
  if (seen?.decision === 'ignorer') { result.unchanged++; return; }
  if (superseded && seen?.decision !== 'creer' && seen?.decision !== 'lier') {
    result.ignored = (result.ignored || 0) + 1;
    result.details.push({ kind: 'file', id: file.id, name: file.name, folder: folder?.name, action: 'ignoré', reason: `Version antérieure : remplacée par la soumission #${superseded}` });
    await saveItem(run, file, 'file', { status: 'ignore', message: `Version antérieure (remplacée par #${superseded})`, client_id: seen?.client_id || null });
    return;
  }
  const decision = match(ctx, file, folder, parsed, seen);
  if (revisionOf && !decision.review && decision.id && !['ajouter', 'creer', 'lier'].includes(seen?.decision)) {
    decision.review = true; decision.candidates = [decision.id];
    decision.reason = `Nouvelle version (#${parsed.numero}) d'un contrat déjà importé (#${revisionOf}) : l'ajouter comme nouvelle soumission ou l'ignorer?`;
  }
  if (!decision.review && decision.id && !['ajouter', 'maj', 'creer', 'lier'].includes(seen?.decision) && (parsed.travaux || parsed.total)) {
    const { opp, clientOpps } = findOpp(ctx, file, decision.id, parsed, seen);
    const known = clientOpps.filter(isDriveOpp);
    if (!opp && known.length) {
      decision.review = true; decision.candidates = [decision.id];
      const nums = known.map(o => (/soumission\s*#\s*(\d+)/i.exec(o.notes || '') || [])[1] || '?').join(', ');
      decision.reason = `Ce contrat (#${parsed.numero || '?'}) ne correspond à aucune soumission connue de ce client (déjà au dossier : #${nums}). Nouvelle soumission ou mise à jour de l'ancienne?`;
    }
  }
  const detail = { kind: 'file', id: file.id, name: file.name, folder: folder?.name, action: decision.review ? 'à valider' : decision.id ? 'rapproché' : 'créé', client_id: decision.id || null, reason: decision.reason, preview: { ...parsed, raw: undefined } };
  if (decision.review) {
    result.review++; detail.candidates = decision.candidates || [];
    await saveItem(run, file, 'file', { status: 'validation', message: decision.reason, client_id: null, snapshot: JSON.stringify({ preview: { ...parsed, raw: undefined } }) });
  } else {
    const stored = await storeContract(run, file, folder, parsed, decision);
    detail.client_id = dry && !decision.id ? null : stored.client_id; detail.plan = stored.plan;
    decision.id ? result.matched++ : result.created++;
  }
  result.details.push(detail);
}

let active = false;
let progress = null; // { done, total, name } pendant une synchronisation
let lastRun = null;  // dernier passage lancé depuis le CRM (aperçu ou réel)
async function buildRun({ dry }) {
  const gs = await google.status();
  if (!gs?.connected || !gs?.drive) return { error: 'Google Drive doit être autorisé (Intégrations → Connecter Google)' };
  const drive = google.driveApi(await google.getAuthedClient());
  return { drive, dry, ctx: await loadContext(), result: { ok: true, dry, started: new Date().toISOString(), created: 0, matched: 0, unchanged: 0, review: 0, errors: 0, details: [] } };
}
async function sync({ dry = true, full = false, limit = 0 } = {}) {
  if (!dry) return { ok: false, dry: false, message: 'Import Drive désactivé : ajoutez manuellement les soumissions dans chaque fiche client.', details: [] };
  if (!dry) return { ok: false, dry: false, message: 'Importation Drive désactivée pour éviter les doublons.', details: [] };
  if (active) return { ok: false, message: 'Synchronisation déjà en cours' };
  active = true;
  let run;
  try {
    run = await buildRun({ dry });
    if (run.error) return { ok: false, dry, message: run.error, details: [] };
    const { drive, result, ctx } = run;
    const rootId = (await getSetting('drive_root_id')) || ROOT;
    const leadsId = (await getSetting('drive_leads_id')) || LEADS;
    const folders = await listAll(drive, `'${q(leadsId)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const sources = [{ id: leadsId, name: 'Leads', root: true }, ...folders, { id: rootId, name: 'Soumissions', root: true }];
    progress = { done: 0, total: sources.length, name: '' };
    const last = await getSetting('drive_last_sync');
    const cutoff = !full && last ? Date.parse(last) - 10 * 60 * 1000 : 0;
    let encountered = 0;
    const parsedAll = [], folderOnly = [];
    for (const folder of sources) {
      progress.name = folder.name;
      const files = await listAll(drive, `'${q(folder.id)}' in parents and trashed=false`);
      const sheets = files.filter(isSheet);
      const asFolder = folder.root ? null : folder;
      if (!sheets.length && !folder.root) folderOnly.push(folder);
      for (const file of sheets) {
        if (limit > 0 && encountered >= limit) break;
        encountered++;
        const seen = ctx.items.get(file.id);
        if (!full && seen?.status === 'ok' && seen.modified_time === file.modifiedTime) { result.unchanged++; continue; }
        if (seen?.status === 'ignore' && seen.modified_time === file.modifiedTime) { result.unchanged++; continue; }
        if (cutoff && Date.parse(file.modifiedTime) < cutoff && seen?.status === 'ok') { result.unchanged++; continue; }
        try { parsedAll.push({ file, folder: asFolder, parsed: await parseContract(await fetchExcel(drive, file)) }); }
        catch (error) {
          if (error?.unreadable) {
            result.unreadable = (result.unreadable || 0) + 1;
            result.details.push({ kind: 'file', id: file.id, name: file.name, folder: folder.name, action: 'illisible', reason: safeError(error) });
            await saveItem(run, file, 'file', { status: 'ignore', message: safeError(error) }).catch(() => {});
          } else {
            result.errors++;
            result.details.push({ kind: 'file', id: file.id, name: file.name, action: 'erreur', reason: safeError(error) });
            await saveItem(run, file, 'file', { status: 'erreur', message: safeError(error) }).catch(() => {});
          }
        }
      }
      progress.done++;
      if (limit > 0 && encountered >= limit) break;
    }
    // Phase 2 : décisions prises sur l'ensemble des contrats (versions d'un même contrat dans des dossiers différents)
    progress = { done: sources.length, total: sources.length, name: 'Rapprochement' };
    const { superseded, revisions } = findSuperseded(parsedAll, ctx);
    for (const { file, folder, parsed } of parsedAll) {
      try { await processParsed(run, file, folder, parsed, superseded.get(file.id), revisions.get(file.id)); }
      catch (error) {
        result.errors++;
        result.details.push({ kind: 'file', id: file.id, name: file.name, action: 'erreur', reason: safeError(error) });
        await saveItem(run, file, 'file', { status: 'erreur', message: safeError(error) }).catch(() => {});
      }
    }
    for (const folder of folderOnly) {
      try { await processFolderOnly(run, folder); }
      catch (error) { result.errors++; result.details.push({ kind: 'folder', id: folder.id, name: folder.name, action: 'erreur', reason: safeError(error) }); }
    }
    if (!dry) {
      const when = new Date().toISOString();
      await setSetting('drive_last_sync', when);
      await setSetting('drive_last_result', JSON.stringify({ ...result, details: undefined, at: when }));
      await setSetting('drive_last_error', result.errors ? `${result.errors} fichier(s) en erreur` : '');
    }
    return result;
  } catch (error) {
    if (/invalid_grant|unauthorized_client|invalid_client/i.test(String(error?.message))) google.noteAuthError(error);
    if (!run?.dry) await setSetting('drive_last_error', safeError(error)).catch(() => {});
    return { ok: false, dry, message: safeError(error), details: [] };
  } finally { active = false; progress = null; }
}
/** Lance la synchronisation en arrière-plan (la requête HTTP reviendrait trop tard pour le proxy) ; le CRM interroge /api/drive/run. */
async function startSync(opts = {}) {
  if (opts.dry === false) return { ok: false, message: 'Importation Drive désactivée : ajoutez les soumissions manuellement depuis chaque fiche client.' };
  if (active) return { ok: false, message: 'Synchronisation déjà en cours' };
  const gs = await google.status();
  if (!gs?.connected || !gs?.drive) return { ok: false, message: 'Google Drive doit être autorisé (Intégrations → Connecter Google)' };
  const dry = opts.dry !== false;
  lastRun = { running: true, dry, started: new Date().toISOString() };
  sync(opts).then(async result => {
    lastRun = { running: false, dry, started: lastRun.started, finished: new Date().toISOString(), result };
    await setSetting('drive_last_run', JSON.stringify(lastRun)).catch(() => {});
  }).catch(async e => { lastRun = { running: false, dry, started: lastRun.started, finished: new Date().toISOString(), result: { ok: false, message: safeError(e), details: [] } }; });
  return { ok: true, started: true };
}
async function currentRun() {
  if (lastRun) return { ...lastRun, progress };
  const saved = parseJson(await getSetting('drive_last_run'));
  return saved.started ? { ...saved, progress: null } : { running: false, progress: null };
}
/** Traite immédiatement un seul élément après un choix manuel (lier / créer). */
async function resolveItem(driveId, { action, client_id }) {
  const item = await db.get('SELECT * FROM drive_items WHERE drive_id=?', [driveId]);
  if (!item) return { ok: false, status: 404, message: 'Élément Drive inconnu' };
  if (!['lier', 'creer', 'ajouter', 'maj', 'ignorer'].includes(action)) return { ok: false, status: 400, message: 'Action invalide' };
  if (!['ignorer'].includes(action)) return { ok: false, status: 403, message: 'Importation Drive désactivée : les soumissions doivent être ajoutées manuellement.' };
  if (action === 'lier' && !(await db.get('SELECT id FROM clients WHERE id=?', [Number(client_id)]))) return { ok: false, status: 400, message: 'Client introuvable' };
  await db.run('UPDATE drive_items SET decision=?, client_id=?, message=? WHERE drive_id=?', [action, action === 'lier' ? Number(client_id) : null, `Choix manuel : ${action}`, driveId]);
  if (action === 'ignorer') { await db.run("UPDATE drive_items SET status='ignore', message='Ignoré par vous' WHERE drive_id=?", [driveId]); return { ok: true }; }
  if (active) return { ok: true, pending: true, message: 'Choix enregistré, appliqué à la prochaine synchronisation' };
  active = true;
  try {
    const run = await buildRun({ dry: false });
    if (run.error) return { ok: true, pending: true, message: `Choix enregistré. ${run.error}` };
    const file = (await run.drive.files.get({ fileId: driveId, fields: 'id,name,parents,modifiedTime,mimeType,size,webViewLink', supportsAllDrives: true })).data;
    const parent = item.parent_id && item.parent_id !== (await getSetting('drive_leads_id') || LEADS) && item.parent_id !== (await getSetting('drive_root_id') || ROOT)
      ? { id: item.parent_id, name: (await run.drive.files.get({ fileId: item.parent_id, fields: 'id,name', supportsAllDrives: true })).data.name } : null;
    if (item.kind === 'folder') await processFolderOnly(run, { ...file });
    else await processParsed(run, file, parent, await parseContract(await fetchExcel(run.drive, file)), null, null);
    return { ok: true, details: run.result.details };
  } catch (error) { return { ok: false, message: safeError(error) }; }
  finally { active = false; }
}

async function status() {
  const rows = await db.all(`SELECT drive_id,name,kind,message,client_id,status,synced_at,web_link,snapshot FROM drive_items WHERE status IN ('validation','erreur') ORDER BY synced_at DESC LIMIT 200`);
  const review = rows.map(r => ({ ...r, preview: parseJson(r.snapshot).preview || null, snapshot: undefined }));
  const clients = review.length ? await db.all('SELECT id,prenom,nom,telephone,ville FROM clients ORDER BY nom,prenom') : [];
  return {
    lastSync: await getSetting('drive_last_sync'), summary: parseJson(await getSetting('drive_last_result')), lastError: await getSetting('drive_last_error'),
    autoEnabled: false, review, clients, busy: active, progress
  };
}
function register(app, { auth }) {
  app.get('/api/drive/status', auth, async (req, res) => res.json(await status()));
  app.post('/api/drive/sync', auth, async (req, res) => res.json(await startSync({ dry: req.body?.dry !== false, full: !!req.body?.full, limit: Math.max(0, Math.min(1000, Number(req.body?.limit) || 0)) })));
  app.get('/api/drive/run', auth, async (req, res) => res.json(await currentRun()));
  app.get('/api/drive/items', auth, async (req, res) => res.json(await db.all('SELECT drive_id,kind,name,client_id,opportunite_id,quote_id,status,message,synced_at,web_link FROM drive_items ORDER BY synced_at DESC LIMIT 1000')));
  app.post('/api/drive/items/:id/resolve', auth, async (req, res) => { const r = await resolveItem(req.params.id, req.body || {}); res.status(r.status || (r.ok ? 200 : 500)).json(r); });
  // La synchronisation automatique ne s'active que lorsque plus rien n'est à valider.
  app.post('/api/drive/auto', auth, async (req, res) => {
    const enable = !!req.body?.enabled;
    if (enable) return res.status(403).json({ ok: false, message: 'Synchronisation automatique désactivée pour éviter les doublons.' });
    if (enable) {
      const open = await db.get("SELECT COUNT(*) AS n FROM drive_items WHERE status IN ('validation','erreur')");
      if (open.n) return res.status(409).json({ ok: false, message: `${open.n} élément(s) à valider ou en erreur : règle-les d'abord.` });
      if (!(await getSetting('drive_last_sync'))) return res.status(409).json({ ok: false, message: 'Fais d’abord une synchronisation réelle validée après l’aperçu.' });
    }
    await setSetting('drive_sync_enabled', enable ? '1' : '0');
    res.json({ ok: true, enabled: enable });
  });
}
module.exports = { register, sync, startSync, currentRun, status, parseContract, match, money, mergeSnapshot, hasNumero, findSuperseded, resolveItem };
