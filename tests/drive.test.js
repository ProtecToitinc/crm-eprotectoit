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

test('synchronisation réelle : aucun doublon de client / soumission, valeurs existantes conservées', async () => {
  const real = await drive.sync({ dry: false, full: true });
  assert.equal(real.errors, 0, JSON.stringify(real.details.filter(d => d.action === 'erreur')));
  // Luc et Jad rapprochés (numéro / téléphone), pas recréés
  assert.equal((await db.all("SELECT id FROM clients WHERE prenom='Luc'")).length, 1);
  assert.equal((await db.all("SELECT id FROM clients WHERE prenom='Jad'")).length, 1);
  assert.equal(await count('quotes'), 2 + 1 /* Nathalie */ + 1 /* Version Deux #51 */ , 'les anciennes soumissions sont reprises, pas dupliquées');
  const opp1 = await db.get('SELECT * FROM opportunites WHERE id=1');
  assert.equal(opp1.etape, 'complete', 'une opportunité complétée n’est jamais rétrogradée');
  const opp2 = await db.get('SELECT * FROM opportunites WHERE id=2');
  assert.equal(opp2.etape, 'contrat'); assert.match(opp2.notes, /Soumission #55/, 'le numéro est ajouté à l’ancienne opportunité sans numéro');
  const q2 = await db.get('SELECT * FROM quotes WHERE id=2'); assert.equal(q2.opportunite_id, 2); assert.equal(q2.montant, 2742.15);
  // Nouveau client complet
  const n = await db.get("SELECT * FROM clients WHERE prenom='Nathalie'");
  assert.equal(n.telephone, '438-555-0000'); assert.equal(n.code_postal, 'H7X 1A1');
  assert.equal((await db.all('SELECT * FROM toitures WHERE client_id=?', [n.id])).length, 1);
  assert.equal((await db.get("SELECT COUNT(*) n FROM opportunites WHERE client_id=? AND etape='soumission'", [n.id])).n, 1);
  // Dossier sans contrat : client « lead » sans les parenthèses du nom de dossier
  const v = await db.get("SELECT * FROM clients WHERE prenom='Dossier'");
  assert.equal(v.nom, 'Vide'); assert.match(v.notes, /aucun fichier/);
  // Copie ancienne ignorée
  assert.equal((await db.get("SELECT status FROM drive_items WHERE drive_id='X7a'")).status, 'ignore');
  // Lead existant « Marc » : rapproché (pas de 2e opportunité)
  assert.equal((await db.all('SELECT id FROM opportunites WHERE client_id=5')).length, 1);
});

test('« Paul Gagnon » en double : mis en attente de validation, rien n’est créé', async () => {
  const st = await drive.status();
  const item = st.review.find(r => r.name.startsWith('Paul'));
  assert.ok(item, 'élément à valider présent'); assert.match(item.message, /Nom présent plusieurs fois/);
  assert.equal(st.autoEnabled, false);
  assert.equal((await db.all("SELECT id FROM clients WHERE prenom='Paul'")).length, 2);
});

test('relancer la synchronisation ne change rien (idempotent)', async () => {
  const snap = async () => JSON.stringify([await count('clients'), await count('opportunites'), await count('quotes'), await count('documents'), await count('toitures')]);
  const a = await snap(); await drive.sync({ dry: false, full: true }); assert.equal(await snap(), a);
});

test('données modifiées à la main : jamais écrasées', async () => {
  await db.run("UPDATE clients SET ville='Ville choisie par moi', telephone='514-999-9999' WHERE prenom='Nathalie'");
  await db.run("UPDATE opportunites SET valeur=4242 WHERE client_id=(SELECT id FROM clients WHERE prenom='Nathalie')");
  blobs.set('X3', await contract({ numero: 200, nom: 'Nouvelle', prenom: 'Nathalie', tel: '4385550000', email: 'n@example.test', ville: 'Autre ville', travaux: 3500, total: 4024.13 }));
  tree.F3[0].modifiedTime = '2026-07-01T00:00:00Z';
  await drive.sync({ dry: false, full: true });
  const c = await db.get("SELECT * FROM clients WHERE prenom='Nathalie'");
  assert.equal(c.ville, 'Ville choisie par moi'); assert.equal(c.telephone, '514-999-9999');
  assert.equal((await db.get('SELECT valeur FROM opportunites WHERE client_id=?', [c.id])).valeur, 4242);
});

test('résolution manuelle : lier, puis activation automatique seulement quand tout est réglé', async () => {
  const st = await drive.status();
  const item = st.review.find(r => r.name.startsWith('Paul'));
  const r = await drive.resolveItem(item.drive_id, { action: 'lier', client_id: 3 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await db.get("SELECT client_id,status FROM drive_items WHERE drive_id='X4'")).client_id, 3);
  assert.equal((await db.all("SELECT id FROM clients WHERE prenom='Paul'")).length, 2, 'aucun client créé');
  assert.equal((await db.get('SELECT COUNT(*) n FROM opportunites WHERE client_id=3')).n, 1);
  assert.equal((await drive.status()).review.length, 0);
});

test('fichier illisible (pas un classeur) : erreur claire, pas de plantage', async () => {
  await assert.rejects(() => drive.parseContract(Buffer.from('<html>erreur</html>')), e => e.unreadable === true && /illisible/i.test(e.message));
  await assert.rejects(() => drive.parseContract(Buffer.alloc(0)), e => e.unreadable === true && /vide/i.test(e.message));
});

test('montants d’essai (moins de 100 $) ignorés', async () => {
  const p = await drive.parseContract(await contract({ nom: 'Essai', prenom: 'Gabarit', travaux: 2.22, total: 2.55 }));
  assert.equal(p.travaux, null); assert.equal(p.total, null);
});

test('contrat au numéro inconnu pour un client déjà importé : à valider, puis « mettre à jour l’ancienne »', async () => {
  await db.run("INSERT INTO clients (id,nom,prenom,telephone,notes) VALUES (20,'Revision','Rita','514-777-0000','Importé Drive')");
  await db.run("INSERT INTO opportunites (id,client_id,titre,etape,valeur,notes) VALUES (20,20,'Protection Toiture - X','soumission',1000,'Soumission #10 - Importé Drive')");
  await db.run("INSERT INTO quotes (id,reference,client_id,opportunite_id,montant,statut,notes) VALUES (20,'SOU-2026-0900',20,20,1149.75,'envoyee','Soumission #10 - Importé Drive')");
  addFolder('F20', 'Rita Revision'); await addFile('F20', 'X20', 'Rita Contrat.xlsx', await contract({ numero: 11, nom: 'Revision', prenom: 'Rita', tel: '5147770000', adresse: '5 rue Rev', travaux: 1500, total: 1724.63 }));
  const before = [await count('opportunites'), await count('quotes')];
  await drive.sync({ dry: false, full: true });
  const item = await db.get("SELECT * FROM drive_items WHERE drive_id='X20'");
  assert.equal(item.status, 'validation'); assert.match(item.message, /nouvelle soumission ou mise à jour/i);
  assert.deepEqual([await count('opportunites'), await count('quotes')], before, 'rien créé avant ton choix');
  const r = await drive.resolveItem('X20', { action: 'maj' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([await count('opportunites'), await count('quotes')], before, 'mise à jour, pas de doublon');
  assert.match((await db.get('SELECT notes FROM opportunites WHERE id=20')).notes, /#11/);
  assert.equal((await db.get('SELECT montant FROM quotes WHERE id=20')).montant, 1724.63);
});

test('copie du gabarit : aucune soumission ni montant créés', async () => {
  addFolder('F21', 'Gabi Test'); await addFile('F21', 'X21', 'Copy of Gabarit Contrat.xlsx', await contract({ numero: 300, nom: 'Test', prenom: 'Gabi', tel: '5145558888', travaux: 2700, total: 3104.33 }));
  const q = await count('quotes');
  await drive.sync({ dry: false, full: true });
  assert.equal(await count('quotes'), q);
  const c = await db.get("SELECT id FROM clients WHERE prenom='Gabi'");
  assert.ok(c, 'le client est créé');
  assert.equal((await db.get('SELECT etape,valeur FROM opportunites WHERE client_id=?', [c.id])).etape, 'lead');
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
