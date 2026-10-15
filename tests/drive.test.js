'use strict';
// node --test tests/drive.test.js — lecture des contrats Excel, rapprochement et synchronisation (Drive simulé, données fictives).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-drive-')), 'crm.db');
process.env.DISABLE_JOBS = '1';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('../server/node_modules/exceljs');
const db = require('../server/database');
const google = require('../server/google');
const drive = require('../server/drive');

/** Contrat fictif avec la même disposition que le gabarit réel (étiquettes sous les valeurs). */
async function contract(o = {}) {
  const wb = new ExcelJS.Workbook(); const s = wb.addWorksheet('Soumission');
  s.getCell('H2').value = '# Soumission'; s.getCell('J2').value = o.numero ?? 100;
  s.getCell('E6').value = o.nom ?? null; s.getCell('H6').value = o.prenom ?? null; s.getCell('E7').value = 'Nom client'; s.getCell('H7').value = 'Prénom client';
  s.getCell('E8').value = o.adresse ?? '1 rue Test'; s.getCell('H8').value = o.ville ?? 'Laval'; s.getCell('E9').value = 'Adresse'; s.getCell('H9').value = 'Ville';
  s.getCell('E10').value = o.cp ?? 'H7X1A1'; s.getCell('H10').value = o.tel ?? null; s.getCell('E11').value = 'Code Postal'; s.getCell('H11').value = 'Téléphone 1';
  s.getCell('E12').value = 'x'; s.getCell('H12').value = o.email ?? null; s.getCell('E13').value = 'Téléphone 2'; s.getCell('H13').value = 'Courriel';
  s.getCell('B27').value = 'Protection Noxnano'; s.getCell('C27').value = 'x';
  if (o.pi2) s.getCell('H24').value = `Produit NoxNano ${o.pi2} pieds carré`;
  s.getCell('A57').value = 'Items'; s.getCell('G57').value = 'Prix (+tx)';
  const items = o.items ?? [['Protection Noxnano', 2000]];
  items.forEach(([label, price], i) => { s.getCell(`A${58 + i}`).value = label; s.getCell(`G${58 + i}`).value = price; });
  if (o.formulaErrors) {
    s.getCell('G67').value = { formula: 'SUM(G58:G61)', result: { error: '#VALUE!' } };
    s.getCell('G73').value = { formula: 'G67*1.15', result: { error: '#VALUE!' } };
    s.getCell('J75').value = { formula: 'G73+I73', result: { error: '#VALUE!' } };
  } else if (o.travaux !== undefined) { s.getCell('G67').value = o.travaux; s.getCell('G73').value = o.total ?? null; s.getCell('J75').value = o.total ?? null; }
  s.getCell('C69').value = 'Entrepreneur'; s.getCell('C71').value = 'Client';
  if (o.signe) { s.getCell('D69').value = '2026/06/19'; s.getCell('D71').value = '2026/06/19'; }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('montants : texte libre jamais pris pour un montant, formats français acceptés', () => {
  assert.equal(drive.money('1 234,56 $'), 1234.56);
  assert.equal(drive.money('2,610.00$'), 2610);
  assert.equal(drive.money('-250.00$'), -250);
  assert.equal(drive.money('#VALUE!'), null);
  assert.equal(drive.money({ error: '#VALUE!' }), null);
  assert.equal(drive.money('Inclut avec confirmation au plus tard le 2026/06/09'), null);
  assert.equal(drive.money('0.00$'), 0);
});

test('numéro de soumission : #55 ne correspond pas à #551', () => {
  assert.equal(drive.hasNumero('Soumission #551 - Importé Drive', '55'), false);
  assert.equal(drive.hasNumero('Soumission #55 - Importé Drive', '55'), true);
  assert.equal(drive.hasNumero('Soumission # - Importe Drive', '55'), false);
});

test('lecture d’un contrat : coordonnées, services, superficie, signature', async () => {
  const p = await drive.parseContract(await contract({ numero: 71, nom: 'Tremblay', prenom: 'Luc', tel: '5145551234', email: 'luc@example.test', pi2: 2920, travaux: 2610, total: 3000.8475, signe: true }));
  assert.equal(p.numero, '71'); assert.equal(p.nom, 'Tremblay'); assert.equal(p.prenom, 'Luc');
  assert.equal(p.service, 'Protection Noxnano'); assert.equal(p.pi2, 2920); assert.equal(p.superficie_m2, 271.28);
  assert.equal(p.travaux, 2610); assert.equal(p.total, 3000.85, 'total arrondi à 2 décimales'); assert.equal(p.signe, true);
});

test('formules en erreur : total recalculé ; texte dans la colonne des prix ignoré ; contrat vide sans montant', async () => {
  const p = await drive.parseContract(await contract({ nom: 'Test', prenom: 'Err', formulaErrors: true, items: [['Protection', 2550], ['Gouttières', 'Inclut avec confirmation au plus tard le 2026/06/09'], ['Cabanon', 95], ['Rabais', -250]] }));
  assert.equal(p.travaux, 2395); assert.equal(p.total, 2753.65);
  const empty = await drive.parseContract(await contract({ nom: 'Vide', prenom: 'Contrat', items: [], travaux: 0, total: 0 }));
  assert.equal(empty.travaux, null); assert.equal(empty.total, null);
});

// ---------- synchronisation avec un Drive simulé ----------
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', FOLDER = 'application/vnd.google-apps.folder';
const tree = { LEADS: [], SOUM: [] }; const blobs = new Map();
const mockDrive = {
  files: {
    list: async ({ q }) => {
      const parent = /'([^']+)' in parents/.exec(q)[1];
      const children = tree[parent] || [];
      return { data: { files: /folder/.test(q) ? children.filter(f => f.mimeType === FOLDER) : children } };
    },
    get: async ({ fileId, fields }) => fields ? { data: [...Object.values(tree).flat()].find(f => f.id === fileId) } : { data: blobs.get(fileId) },
    export: async () => { throw new Error('inutilisé'); }
  }
};
function addFolder(id, name) { tree.LEADS.push({ id, name, mimeType: FOLDER, parents: ['LEADS'], modifiedTime: '2026-06-01T00:00:00Z' }); tree[id] = []; }
async function addFile(folderId, id, name, buf) { tree[folderId].push({ id, name, mimeType: XLSX, parents: [folderId], modifiedTime: '2026-06-10T12:00:00Z' }); blobs.set(id, buf); }
const count = async t => (await db.get(`SELECT COUNT(*) n FROM ${t}`)).n;

before(async () => {
  await db.init();
  google.status = async () => ({ connected: true, drive: true }); google.getAuthedClient = async () => ({}); google.driveApi = () => mockDrive;
  await db.run("INSERT INTO settings (key,value) VALUES ('drive_leads_id','LEADS'),('drive_root_id','SOUM')");
  // État « ancien import » : sans liens Drive, soumissions sans numéro ni lien d'opportunité
  await db.run("INSERT INTO clients (id,nom,prenom,telephone,notes) VALUES (1,'Tremblay','Luc','514-555-1234','Importé Drive: Luc.xlsx'),(2,'','Jad','514-586-1379','Importé Drive'),(3,'Gagnon','Paul','514-111-2222',NULL),(4,'Gagnon','Paul','514-333-4444',NULL),(5,'Roy','Marc','418-000-0000',NULL)");
  await db.run("INSERT INTO opportunites (id,client_id,titre,etape,valeur,notes) VALUES (1,1,'Protection Toiture - Protection Noxnano','complete',2610,'Soumission #71 - Importé Drive'),(2,2,'Protection Toiture - Protection Noxnano','contrat',2385,'Soumission # - Importe Drive'),(3,5,'Lead - Marc','lead',0,NULL)");
  await db.run("INSERT INTO quotes (id,reference,client_id,montant,statut,notes) VALUES (1,'SOU-2026-0001',1,3000.85,'acceptee',NULL),(2,'SOU-2026-0002',2,2742.15,'acceptee',NULL)");
  addFolder('F1', 'Luc Tremblay'); await addFile('F1', 'X1', 'Luc Contrat Protectoit.xlsx', await contract({ numero: 71, nom: 'Tremblay', prenom: 'Luc', tel: '5145551234', travaux: 2610, total: 3000.85 }));
  addFolder('F2', 'Jad'); await addFile('F2', 'X2', 'Jad Contrat Protectoit.xlsx', await contract({ numero: 55, nom: '', prenom: 'Jad', tel: '5145861379', travaux: 2385, total: 2742.15, signe: true }));
  addFolder('F3', 'Nathalie Nouvelle'); await addFile('F3', 'X3', 'Nathalie Contrat Protectoit.xlsx', await contract({ numero: 200, nom: 'Nouvelle', prenom: 'Nathalie', tel: '4385550000', email: 'n@example.test', travaux: 3000, total: 3449.25, pi2: 1500 }));
  addFolder('F4', 'Paul Gagnon'); await addFile('F4', 'X4', 'Paul Contrat Protectoit.xlsx', await contract({ numero: 210, nom: 'Gagnon', prenom: 'Paul', tel: '', travaux: 1000, total: 1149.75 }));
  addFolder('F5', 'Dossier Vide (outside)');
  addFolder('F6', 'Marc Roy');
  addFolder('F7', 'Copie'); // deux versions du même contrat : #50 (jamais importée) et #51
  await addFile('F7', 'X7a', 'Copy of Contrat.xlsx', await contract({ numero: 50, nom: 'Version', prenom: 'Deux', tel: '5145559999', adresse: '9 rue Double', travaux: 1000, total: 1149.75 }));
  await addFile('F7', 'X7b', 'Version Deux Contrat.xlsx', await contract({ numero: 51, nom: 'Version', prenom: 'Deux', tel: '5145559999', adresse: '9 rue Double', travaux: 1200, total: 1379.7 }));
});

test('aperçu (dry-run) : aucune écriture dans la base, mais un plan détaillé', async () => {
  const before = [await count('clients'), await count('opportunites'), await count('quotes'), await count('drive_items'), await count('documents')];
  const dry = await drive.sync({ dry: true, full: true });
  assert.equal(dry.ok, true);
  assert.deepEqual([await count('clients'), await count('opportunites'), await count('quotes'), await count('drive_items'), await count('documents')], before);
  assert.ok(dry.details.some(d => d.name.startsWith('Nathalie') && d.action === 'créé'));
  assert.ok(dry.review >= 1, 'le doublon « Paul Gagnon » doit être soumis à validation');
});

test('les soumissions Drive ne sont plus importées dans le CRM', async () => {
  const before = [await count('clients'), await count('opportunites'), await count('quotes'), await count('documents'), await count('drive_items')];
  const result = await drive.sync({ dry: false, full: true });
  assert.equal(result.ok, false);
  assert.match(result.message, /désactivé/);
  assert.deepEqual([await count('clients'), await count('opportunites'), await count('quotes'), await count('documents'), await count('drive_items')], before);
  assert.equal((await drive.status()).autoEnabled, false);
});

test('fichier illisible (pas un classeur) : erreur claire, pas de plantage', async () => {
  await assert.rejects(() => drive.parseContract(Buffer.from('<html>erreur</html>')), e => e.unreadable === true && /illisible/i.test(e.message));
  await assert.rejects(() => drive.parseContract(Buffer.alloc(0)), e => e.unreadable === true && /vide/i.test(e.message));
});

test('montants d’essai (moins de 100 $) ignorés', async () => {
  const p = await drive.parseContract(await contract({ nom: 'Essai', prenom: 'Gabarit', travaux: 2.22, total: 2.55 }));
  assert.equal(p.travaux, null); assert.equal(p.total, null);
});

test('formules sans résultat enregistré (fichiers convertis par Google) : calculées localement', async () => {
  const wb = new ExcelJS.Workbook(); const s = wb.addWorksheet('Soumission');
  s.getCell('J2').value = 140; s.getCell('E6').value = 'Formule'; s.getCell('H6').value = 'Test'; s.getCell('E8').value = '1 rue F';
  s.getCell('A58').value = 'Protection Noxnano'; s.getCell('G58').value = { formula: '1200*1.65' };
  s.getCell('A59').value = 'Rabais'; s.getCell('G59').value = { formula: '-500' };
  s.getCell('G67').value = { formula: 'G58+G59+G60+G62+G61' };
  s.getCell('G69').value = { formula: 'G67*0.05' }; s.getCell('G71').value = { formula: 'G67*0.09975' };
  s.getCell('G73').value = { formula: 'G67+G69+G71' }; s.getCell('J75').value = { formula: 'G73+I73' };
  const p = await drive.parseContract(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(p.travaux, 1480); assert.equal(p.total, 1701.63);
});
