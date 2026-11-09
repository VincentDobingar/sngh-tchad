// Parcours complet d'un patient et règles métier essentielles : droits par profil, doublons, gratuité ciblée,
// double validation du laboratoire, sortie FEFO, facture jamais supprimée, cloisonnement des établissements.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { openDb } from '../src/db.js';
import { seed } from '../src/seed.js';
import { creerApp } from '../src/app.js';
import { cleRecherche, genererIpun } from '../src/referentiels.js';

let srv, base, db; const tok = {};
async function appel(m, chemin, corps, qui) {
  const r = await fetch(base + chemin, { method: m, headers: { 'Content-Type': 'application/json', ...(qui ? { Authorization: `Bearer ${tok[qui]}` } : {}) }, body: corps ? JSON.stringify(corps) : undefined });
  return { status: r.status, corps: (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text() };
}
before(async () => {
  db = openDb(':memory:'); seed(db, { adminPassword: 'admin-test-123' });
  srv = creerApp(db).listen(0); base = `http://localhost:${srv.address().port}`;
  const h = bcrypt.hashSync('motdepasse1', 4);
  const ins = (login, role, e) => db.prepare('INSERT INTO utilisateurs (nom, login, mot_de_passe, role, etablissement_id) VALUES (?, ?, ?, ?, ?)').run(login, login, h, role, e);
  for (const [l, r] of [['accueil', 'accueil'], ['medecin', 'medecin'], ['infirmier', 'infirmier'], ['labo', 'laborantin'], ['bio', 'laborantin'], ['pharma', 'pharmacien'], ['caisse', 'caissier'], ['directeur', 'directeur']]) ins(l, r, 1);
  ins('caisse2', 'caissier', 2); ins('decideur', 'decideur', null);
  for (const l of ['accueil', 'medecin', 'infirmier', 'labo', 'bio', 'pharma', 'caisse', 'directeur', 'caisse2', 'decideur'])
    tok[l] = (await appel('POST', '/api/auth/connexion', { login: l, mot_de_passe: 'motdepasse1' })).corps.token;
  const para = db.prepare("SELECT id FROM medicaments WHERE code = 'PARA'").get().id;
  // Deux lots : le second périme plus tôt, il doit sortir en premier.
  db.prepare("INSERT INTO lots (etablissement_id, medicament_id, numero, peremption, quantite) VALUES (1, ?, 'TARD', date('now', '+400 days'), 100)").run(para);
  db.prepare("INSERT INTO lots (etablissement_id, medicament_id, numero, peremption, quantite) VALUES (1, ?, 'TOT', date('now', '+60 days'), 10)").run(para);
  db.prepare("INSERT INTO lots (etablissement_id, medicament_id, numero, peremption, quantite) VALUES (1, ?, 'PERIME', date('now', '-1 days'), 500)").run(para);
});
after(() => srv.close());

test('recherche tolérante aux variantes de translittération', () => {
  assert.equal(cleRecherche('Mahammat Achta'), cleRecherche('MAHAMAT Ashta'));
  assert.equal(cleRecherche('Djibrine Oumar'), cleRecherche('Jibrine Umar'));
  assert.match(genererIpun(42, 2026), /^TD-2026-0000042-[0-9X]$/);
});

let patient, visite, adulte, visiteAdulte;
test('admission : création, détection des doublons, ticket', async () => {
  let r = await appel('POST', '/api/patients', { nom: 'Abakar', prenom: 'Fatimé', sexe: 'F', age_annees: 3, telephone: '+235 66 00 00 01' }, 'accueil');
  assert.equal(r.status, 201); patient = r.corps; assert.match(patient.ipun, /^TD-/);
  r = await appel('POST', '/api/patients', { nom: 'ABAKAR', prenom: 'Fatime', sexe: 'F', age_annees: 3 }, 'accueil');
  assert.equal(r.status, 409); assert.equal(r.corps.doublons[0].id, patient.id);
  r = await appel('GET', '/api/patients?q=fatime%20abakar', null, 'accueil'); assert.equal(r.corps[0].id, patient.id);
  r = await appel('POST', '/api/patients', { nom: 'Ngarlejy', prenom: 'Béral', sexe: 'M', date_naissance: '1980-05-01' }, 'medecin');
  assert.equal(r.status, 403, 'le médecin n’enregistre pas les admissions');
  r = await appel('POST', '/api/visites', { patient_id: patient.id, service_code: 'PED' }, 'accueil');
  assert.equal(r.status, 201); visite = r.corps; assert.match(visite.ticket, /^PED-\d{3}$/);
  adulte = (await appel('POST', '/api/patients', { nom: 'Ngarlejy', prenom: 'Béral', sexe: 'M', date_naissance: '1980-05-01' }, 'accueil')).corps;
  visiteAdulte = (await appel('POST', '/api/visites', { patient_id: adulte.id, service_code: 'MED' }, 'accueil')).corps;
  r = await appel('POST', '/api/visites', { patient_id: adulte.id, type: 'URGENCE' }, 'accueil'); assert.equal(r.status, 400, 'triage obligatoire');
});

test('consultation : réservée au médecin ; examens et ordonnance transmis', async () => {
  const corps = { temperature: 39.1, diagnostic_code: 'B54', issue: 'SORTIE', examens: ['GE'], prescriptions: [{ medicament_id: db.prepare("SELECT id FROM medicaments WHERE code = 'PARA'").get().id, posologie: '1 cp x 3', quantite: 15 }] };
  assert.equal((await appel('POST', `/api/visites/${visiteAdulte.id}/consultation`, corps, 'infirmier')).status, 403);
  const file = (await appel('GET', '/api/visites/file', null, 'medecin')).corps; assert.equal(file.length, 2);
  assert.equal((await appel('POST', `/api/visites/${visiteAdulte.id}/consultation`, { ...corps, diagnostic_code: '' }, 'medecin')).status, 400);
  assert.equal((await appel('POST', `/api/visites/${visiteAdulte.id}/consultation`, corps, 'medecin')).status, 201);
  assert.equal((await appel('POST', `/api/visites/${visite.id}/consultation`, { diagnostic_code: 'A09', issue: 'SORTIE' }, 'medecin')).status, 201);
});

test('laboratoire : double validation par un second biologiste', async () => {
  const [x] = (await appel('GET', '/api/labo', null, 'labo')).corps;
  assert.equal((await appel('GET', '/api/labo', null, 'medecin')).status, 403);
  assert.equal((await appel('POST', `/api/labo/${x.id}/resultat`, { resultat: 'Bof' }, 'labo')).status, 400);
  assert.equal((await appel('POST', `/api/labo/${x.id}/resultat`, { resultat: 'Positif ++' }, 'labo')).status, 200);
  assert.equal((await appel('POST', `/api/labo/${x.id}/valider`, null, 'labo')).status, 403);
  // Avant validation, le résultat n'apparaît pas dans le dossier.
  let d = (await appel('GET', `/api/patients/${adulte.id}/dossier`, null, 'medecin')).corps;
  assert.equal(d.visites[0].examens[0].resultat, null);
  assert.equal((await appel('POST', `/api/labo/${x.id}/valider`, null, 'bio')).status, 200);
  d = (await appel('GET', `/api/patients/${adulte.id}/dossier`, null, 'medecin')).corps;
  assert.equal(d.visites[0].examens[0].resultat, 'Positif ++');
  assert.equal((await appel('GET', `/api/patients/${adulte.id}/dossier`, null, 'caisse')).status, 403, 'la caisse ne lit pas le dossier médical');
  assert.ok(db.prepare("SELECT COUNT(*) n FROM journal WHERE action = 'ACCES_DOSSIER'").get().n >= 2);
});

test('pharmacie : sortie FEFO, jamais de lot périmé', async () => {
  const [o] = (await appel('GET', '/api/pharmacie/ordonnances', null, 'pharma')).corps;
  assert.equal(o.disponible, 110, 'le lot périmé n’est pas compté');
  const r = await appel('POST', `/api/pharmacie/ordonnances/${o.id}/dispenser`, null, 'pharma');
  assert.equal(r.status, 200);
  assert.deepEqual(r.corps.lots.map(l => [l.numero, l.quantite]), [['TOT', 10], ['TARD', 5]]);
  assert.equal(db.prepare("SELECT quantite FROM lots WHERE numero = 'PERIME'").get().quantite, 500);
});

test('caisse : gratuité ciblée, encaissement mobile money, annulation tracée sans suppression', async () => {
  const fs = (await appel('GET', '/api/caisse/factures', null, 'caisse')).corps;
  assert.equal(fs.length, 1, 'l’enfant de moins de 5 ans ne paie pas');
  const enfant = db.prepare('SELECT * FROM factures WHERE visite_id = ?').get(visite.id);
  assert.equal(enfant.statut, 'PRISE_EN_CHARGE'); assert.match(enfant.motif_prise_en_charge, /moins de 5 ans/);
  const f = fs[0];
  assert.equal(f.total, 2000 + 1000 + 15 * 25);
  assert.equal((await appel('POST', `/api/caisse/factures/${f.id}/encaisser`, { mode: 'AIRTEL_MONEY' }, 'caisse')).status, 400, 'référence obligatoire');
  assert.equal((await appel('POST', `/api/caisse/factures/${f.id}/encaisser`, { mode: 'AIRTEL_MONEY', reference: 'AM123' }, 'caisse2')).status, 403, 'autre établissement');
  assert.equal((await appel('POST', `/api/caisse/factures/${f.id}/encaisser`, { mode: 'AIRTEL_MONEY', reference: 'AM123' }, 'caisse')).status, 200);
  assert.equal((await appel('POST', `/api/caisse/factures/${f.id}/annuler`, { motif: '' }, 'caisse')).status, 400);
  assert.equal((await appel('POST', `/api/caisse/factures/${f.id}/annuler`, { motif: 'Erreur de patient' }, 'caisse')).status, 200);
  assert.equal(db.prepare('SELECT statut FROM factures WHERE id = ?').get(f.id).statut, 'ANNULEE');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM journal WHERE action = 'ANNULATION'").get().n, 1);
  const j = (await appel('GET', '/api/caisse/journee', null, 'caisse')).corps; assert.ok(j.prises_en_charge.n >= 1);
});

test('lits : admission puis sortie, journées facturées', async () => {
  const p = (await appel('POST', '/api/patients', { nom: 'Mahamat', prenom: 'Saleh', sexe: 'M', date_naissance: '1975-01-01' }, 'accueil')).corps;
  const v = (await appel('POST', '/api/visites', { patient_id: p.id, service_code: 'CHI' }, 'accueil')).corps;
  await appel('POST', `/api/visites/${v.id}/consultation`, { diagnostic_code: 'K35.8', issue: 'HOSPITALISATION' }, 'medecin');
  const l = (await appel('GET', '/api/lits', null, 'infirmier')).corps;
  assert.equal(l.attente.length, 1);
  const lit = l.services.find(s => s.code === 'CHI').lits[0];
  assert.equal((await appel('POST', `/api/lits/${lit.id}/admettre`, { visite_id: v.id }, 'infirmier')).status, 200);
  assert.equal((await appel('POST', `/api/lits/${lit.id}/admettre`, { visite_id: v.id }, 'infirmier')).status, 409);
  assert.equal((await appel('POST', `/api/lits/${lit.id}/sortie`, { mode_sortie: 'GUERISON' }, 'infirmier')).status, 200);
  assert.equal(db.prepare('SELECT statut FROM lits WHERE id = ?').get(lit.id).statut, 'NETTOYAGE');
  assert.ok(db.prepare("SELECT 1 FROM lignes_facture lf JOIN factures f ON f.id = lf.facture_id WHERE f.visite_id = ? AND lf.nature = 'SEJOUR'").get(v.id));
});

test('pilotage : tableau de bord établissement et national, surveillance, rapport ; droits', async () => {
  const t = (await appel('GET', '/api/tableau', null, 'directeur')).corps;
  assert.equal(t.etablissement.id, 1); assert.ok(t.indicateurs.visites >= 3);
  assert.equal((await appel('GET', '/api/tableau/national', null, 'directeur')).status, 403);
  const n = (await appel('GET', '/api/tableau/national', null, 'decideur')).corps; assert.equal(n.etablissements.length, 3);
  const s = (await appel('GET', '/api/surveillance', null, 'decideur')).corps; assert.equal(s.global.length, 5);
  const r = (await appel('GET', '/api/rapports/mensuel', null, 'directeur')).corps; assert.ok(r.consultations >= 3);
  assert.equal((await appel('GET', '/api/admin/utilisateurs', null, 'decideur')).status, 403);
});

test('paiement Konoom : demande au téléphone, confirmation, reçu numéroté vérifiable publiquement', async () => {
  const p = (await appel('POST', '/api/patients', { nom: 'Hassan', prenom: 'Zara', sexe: 'F', date_naissance: '1990-03-03', telephone: '+235 66 11 22 33' }, 'accueil')).corps;
  const v = (await appel('POST', '/api/visites', { patient_id: p.id, service_code: 'MED' }, 'accueil')).corps;
  const f = db.prepare('SELECT * FROM factures WHERE visite_id = ?').get(v.id);
  assert.equal((await appel('POST', `/api/caisse/factures/${f.id}/paiement-mobile`, { operateur: 'ORANGE', telephone: '66112233' }, 'caisse')).status, 400);
  assert.equal((await appel('POST', `/api/caisse/factures/${f.id}/paiement-mobile`, { operateur: 'KONOOM', telephone: '123' }, 'caisse')).status, 400);
  const d = await appel('POST', `/api/caisse/factures/${f.id}/paiement-mobile`, { operateur: 'KONOOM', telephone: '66 11 22 33' }, 'caisse');
  assert.equal(d.status, 201); assert.equal(d.corps.statut, 'EN_ATTENTE');
  assert.equal((await appel('POST', `/api/caisse/factures/${f.id}/paiement-mobile`, { operateur: 'KONOOM', telephone: '66112233' }, 'caisse')).status, 409, 'une seule demande en attente');
  // Le client valide : on avance l'horloge de la demande au-delà du délai simulé.
  db.prepare("UPDATE paiements SET cree_le = datetime('now', '-30 seconds') WHERE id = ?").run(d.corps.id);
  const r = (await appel('GET', `/api/caisse/paiements/${d.corps.id}`, null, 'caisse')).corps;
  assert.equal(r.statut, 'CONFIRME'); assert.match(r.reference_operateur, /^KN/);
  assert.match(r.facture.numero_recu, /^R-HGRN-\d{4}-\d{6}$/); assert.equal(r.facture.mode, 'KONOOM');
  const pub = await fetch(`${base}/api/recus/${r.facture.numero_recu}`).then(x => x.json());
  assert.equal(pub.valide, true); assert.equal(pub.montant, f.a_payer); assert.equal(pub.patient, 'Zara H.');
  assert.equal((await fetch(`${base}/api/recus/R-HGRN-2026-999999`)).status, 404);
  const sms = (await appel('POST', `/api/caisse/factures/${f.id}/recu-sms`, {}, 'caisse')).corps;
  assert.match(sms.texte, new RegExp(r.facture.numero_recu));
  // Refus du client (numéro de test finissant par 00) : la facture reste à payer.
  const p2 = (await appel('POST', '/api/patients', { nom: 'Ali', prenom: 'Moussa', sexe: 'M', date_naissance: '1985-01-01' }, 'accueil')).corps;
  const v2 = (await appel('POST', '/api/visites', { patient_id: p2.id, service_code: 'MED' }, 'accueil')).corps;
  const f2 = db.prepare('SELECT * FROM factures WHERE visite_id = ?').get(v2.id);
  const d2 = (await appel('POST', `/api/caisse/factures/${f2.id}/paiement-mobile`, { operateur: 'MOOV_MONEY', telephone: '99 12 34 00' }, 'caisse')).corps;
  db.prepare("UPDATE paiements SET cree_le = datetime('now', '-30 seconds') WHERE id = ?").run(d2.id);
  assert.equal((await appel('GET', `/api/caisse/paiements/${d2.id}`, null, 'caisse')).corps.statut, 'ECHEC');
  assert.equal(db.prepare('SELECT statut FROM factures WHERE id = ?').get(f2.id).statut, 'A_PAYER');
});

test('carte sanitaire : cas par province de résidence et profil d’une province', async () => {
  const c = (await appel('GET', '/api/carte?indicateur=paludisme&jours=30', null, 'decideur')).corps;
  assert.equal(c.provinces.length, 23); assert.ok(c.total >= 1);
  assert.equal(c.etablissements.find(e => e.code === 'HGRN').lat, 12.1131);
  const fiche = (await appel('GET', `/api/carte/province/${encodeURIComponent('N’Djamena')}`, null, 'directeur')).corps;
  assert.ok(fiche.visites >= 1);
  assert.equal((await appel('GET', '/api/carte', null, 'caisse')).status, 403);
});
