// Plateau technique et logistique : laboratoire (M09), pharmacie et stocks (M12), facturation et caisse (M14),
// hospitalisation et gestion des lits (M05). Tout est limité à l'établissement du compte.
import express from 'express';
import { tx, journaliser } from '../db.js';
import { ErreurHttp, exiger } from '../auth.js';
import { EXAMENS, interpreter, MODES_PAIEMENT } from '../referentiels.js';
import { ajouterLigne, facturerJournees } from '../facturation.js';
import { etablissementDe } from './parcours.js';

const texte = (v, max = 300) => (v == null || v === '' ? null : String(v).trim().slice(0, max));
const jours = (a, b = new Date()) => Math.ceil((new Date(b) - new Date(a.replace(' ', 'T') + 'Z')) / 864e5);

export default function routesPlateau(db) {
  const r = express.Router();
  const etab = req => etablissementDe(req, req.query.etablissement_id ?? req.body?.etablissement_id);
  const dansEtab = (sql, id, e) => { const x = db.prepare(sql).get(id); if (!x) throw new ErreurHttp(404, 'Élément introuvable.'); if (x.etablissement_id !== e) throw new ErreurHttp(403, 'Cet élément relève d’un autre établissement.'); return x; };

  // ---------- Laboratoire ----------
  r.get('/labo', exiger('laboratoire'), (req, res) => {
    const e = etab(req);
    const statuts = req.query.statut === 'termine' ? ['VALIDE'] : ['DEMANDE', 'PRELEVE', 'SAISI'];
    const lignes = db.prepare(`SELECT x.*, v.ticket, v.triage, s.nom AS service, p.nom, p.prenom, p.sexe, p.date_naissance, p.ipun,
        us.nom AS saisi_par_nom, uv.nom AS valide_par_nom
      FROM examens x JOIN visites v ON v.id = x.visite_id JOIN services s ON s.id = v.service_id JOIN patients p ON p.id = v.patient_id
      LEFT JOIN utilisateurs us ON us.id = x.saisi_par LEFT JOIN utilisateurs uv ON uv.id = x.valide_par
      WHERE v.etablissement_id = ? AND x.statut IN (${statuts.map(() => '?').join(',')})
      ORDER BY CASE v.triage WHEN 'ROUGE' THEN 0 WHEN 'ORANGE' THEN 1 ELSE 2 END, x.demande_le ${statuts[0] === 'VALIDE' ? 'DESC LIMIT 100' : ''}`).all(e, ...statuts);
    res.json(lignes.map(l => ({ ...l, examen: EXAMENS[l.code] })));
  });
  const examenDe = (req, e) => dansEtab('SELECT x.*, v.etablissement_id FROM examens x JOIN visites v ON v.id = x.visite_id WHERE x.id = ?', Number(req.params.id), e);

  r.post('/labo/:id/prelever', exiger('laboratoire'), (req, res) => {
    const x = examenDe(req, etab(req));
    if (x.statut !== 'DEMANDE') throw new ErreurHttp(409, 'Prélèvement déjà enregistré.');
    db.prepare("UPDATE examens SET statut = 'PRELEVE' WHERE id = ?").run(x.id);
    res.json({ ok: true });
  });
  r.post('/labo/:id/resultat', exiger('laboratoire'), (req, res) => {
    const x = examenDe(req, etab(req));
    if (x.statut === 'VALIDE') throw new ErreurHttp(409, 'Résultat déjà validé : il ne peut plus être modifié.');
    const def = EXAMENS[x.code];
    const resultat = texte(req.body?.resultat, 40);
    if (!resultat || (def.choix && !def.choix.includes(resultat)) || (!def.choix && !Number.isFinite(Number(resultat.replace(',', '.')))))
      throw new ErreurHttp(400, 'Résultat invalide.', { resultat: def.choix ? 'Choisissez une valeur.' : `Valeur numérique en ${def.unite}.` });
    const { anormal, critique } = interpreter(x.code, resultat);
    db.prepare("UPDATE examens SET statut = 'SAISI', resultat = ?, anormal = ?, critique = ?, saisi_par = ?, saisi_le = datetime('now') WHERE id = ?")
      .run(resultat, anormal, critique, req.utilisateur.id, x.id);
    journaliser(db, req.utilisateur, 'RESULTAT_SAISI', 'examens', x.id);
    res.json({ anormal, critique });
  });
  // Double validation : la personne qui valide n'est pas celle qui a saisi.
  r.post('/labo/:id/valider', exiger('laboratoire'), (req, res) => {
    const x = examenDe(req, etab(req));
    if (x.statut !== 'SAISI') throw new ErreurHttp(409, 'Aucun résultat à valider.');
    if (x.saisi_par === req.utilisateur.id) throw new ErreurHttp(403, 'Double validation : le résultat doit être validé par un autre biologiste que celui qui l’a saisi.');
    db.prepare("UPDATE examens SET statut = 'VALIDE', valide_par = ?, valide_le = datetime('now') WHERE id = ?").run(req.utilisateur.id, x.id);
    journaliser(db, req.utilisateur, 'RESULTAT_VALIDE', 'examens', x.id);
    res.json({ ok: true });
  });

  // ---------- Pharmacie ----------
  const stockDispo = (e, mid) => db.prepare("SELECT COALESCE(SUM(quantite), 0) q FROM lots WHERE etablissement_id = ? AND medicament_id = ? AND peremption > date('now')").get(e, mid).q;

  r.get('/pharmacie/ordonnances', exiger('pharmacie'), (req, res) => {
    const e = etab(req);
    const lignes = db.prepare(`SELECT pr.*, m.dci, m.dosage, m.forme, m.prix, m.programme, p.nom, p.prenom, p.ipun, v.ticket, s.nom AS service, c.cree_le, u.nom AS medecin
      FROM prescriptions pr JOIN medicaments m ON m.id = pr.medicament_id JOIN consultations c ON c.id = pr.consultation_id
      JOIN visites v ON v.id = c.visite_id JOIN patients p ON p.id = v.patient_id JOIN services s ON s.id = v.service_id LEFT JOIN utilisateurs u ON u.id = c.medecin_id
      WHERE v.etablissement_id = ? AND pr.statut = 'A_DISPENSER' ORDER BY c.cree_le`).all(e);
    res.json(lignes.map(l => ({ ...l, disponible: stockDispo(e, l.medicament_id) })));
  });

  // Dispensation FEFO : les lots qui périment le plus tôt sortent en premier ; jamais un lot périmé.
  r.post('/pharmacie/ordonnances/:id/dispenser', exiger('pharmacie'), (req, res) => {
    const e = etab(req);
    const pr = dansEtab(`SELECT pr.*, v.etablissement_id, v.id AS visite_id, m.dci, m.dosage, m.prix, m.programme FROM prescriptions pr
      JOIN consultations c ON c.id = pr.consultation_id JOIN visites v ON v.id = c.visite_id JOIN medicaments m ON m.id = pr.medicament_id WHERE pr.id = ?`, Number(req.params.id), e);
    if (pr.statut !== 'A_DISPENSER') throw new ErreurHttp(409, 'Ordonnance déjà traitée.');
    if (stockDispo(e, pr.medicament_id) < pr.quantite) throw new ErreurHttp(409, 'Stock insuffisant : déclarez une rupture ou réceptionnez un lot.');
    const lots = tx(db, () => {
      let reste = pr.quantite; const sortis = [];
      for (const l of db.prepare("SELECT * FROM lots WHERE etablissement_id = ? AND medicament_id = ? AND quantite > 0 AND peremption > date('now') ORDER BY peremption, id").all(e, pr.medicament_id)) {
        if (!reste) break;
        const q = Math.min(reste, l.quantite); reste -= q;
        db.prepare('UPDATE lots SET quantite = quantite - ? WHERE id = ?').run(q, l.id);
        db.prepare("INSERT INTO mouvements (lot_id, type, quantite, prescription_id, utilisateur_id) VALUES (?, 'DISPENSATION', ?, ?, ?)").run(l.id, -q, pr.id, req.utilisateur.id);
        sortis.push({ numero: l.numero, peremption: l.peremption, quantite: q });
      }
      db.prepare("UPDATE prescriptions SET statut = 'DISPENSEE', dispense_par = ?, dispense_le = datetime('now') WHERE id = ?").run(req.utilisateur.id, pr.id);
      ajouterLigne(db, pr.visite_id, 'MEDICAMENT', `${pr.dci} ${pr.dosage}${pr.programme ? ' (programme, gratuit)' : ''}`, pr.quantite, pr.prix);
      journaliser(db, req.utilisateur, 'DISPENSATION', 'prescriptions', pr.id, { lots: sortis });
      return sortis;
    });
    res.json({ lots });
  });
  r.post('/pharmacie/ordonnances/:id/rupture', exiger('pharmacie'), (req, res) => {
    const pr = dansEtab('SELECT pr.*, v.etablissement_id FROM prescriptions pr JOIN consultations c ON c.id = pr.consultation_id JOIN visites v ON v.id = c.visite_id WHERE pr.id = ?', Number(req.params.id), etab(req));
    if (pr.statut !== 'A_DISPENSER') throw new ErreurHttp(409, 'Ordonnance déjà traitée.');
    db.prepare("UPDATE prescriptions SET statut = 'RUPTURE', dispense_par = ?, dispense_le = datetime('now') WHERE id = ?").run(req.utilisateur.id, pr.id);
    journaliser(db, req.utilisateur, 'RUPTURE', 'prescriptions', pr.id);
    res.json({ ok: true });
  });

  // État du stock : quantité utilisable, consommation moyenne mensuelle (CMM sur 90 jours), mois de stock, alertes.
  r.get('/pharmacie/stock', (req, res, next) => (['pharmacien', 'directeur', 'decideur', 'admin'].includes(req.utilisateur.role) ? next() : next(new ErreurHttp(403, 'Action non autorisée pour votre profil.'))), (req, res) => {
    const e = etab(req);
    const lignes = db.prepare(`SELECT m.*, s.seuil,
        (SELECT COALESCE(SUM(quantite), 0) FROM lots WHERE etablissement_id = ? AND medicament_id = m.id AND peremption > date('now')) AS quantite,
        (SELECT COALESCE(SUM(quantite), 0) FROM lots WHERE etablissement_id = ? AND medicament_id = m.id AND peremption <= date('now')) AS perimes,
        (SELECT COALESCE(SUM(quantite), 0) FROM lots WHERE etablissement_id = ? AND medicament_id = m.id AND peremption > date('now') AND peremption <= date('now', '+90 days')) AS bientot,
        (SELECT MIN(peremption) FROM lots WHERE etablissement_id = ? AND medicament_id = m.id AND quantite > 0 AND peremption > date('now')) AS prochaine_peremption,
        (SELECT COALESCE(-SUM(mv.quantite), 0) FROM mouvements mv JOIN lots l ON l.id = mv.lot_id WHERE l.etablissement_id = ? AND l.medicament_id = m.id
          AND mv.type = 'DISPENSATION' AND mv.le >= datetime('now', '-90 days')) / 3.0 AS cmm
      FROM medicaments m JOIN seuils s ON s.medicament_id = m.id AND s.etablissement_id = ? ORDER BY m.dci`).all(e, e, e, e, e, e);
    res.json(lignes.map(l => ({ ...l, cmm: Math.round(l.cmm), mois_stock: l.cmm > 0 ? Math.round((l.quantite / l.cmm) * 10) / 10 : null,
      alerte: l.quantite === 0 ? 'RUPTURE' : l.quantite < l.seuil ? 'SOUS_SEUIL' : l.bientot > 0 ? 'PEREMPTION' : null,
      lots: db.prepare('SELECT * FROM lots WHERE etablissement_id = ? AND medicament_id = ? AND quantite > 0 ORDER BY peremption').all(e, l.id) })));
  });
  r.post('/pharmacie/lots', exiger('pharmacie'), (req, res) => {
    const e = etab(req); const b = req.body || {};
    const erreurs = {};
    if (!db.prepare('SELECT 1 FROM medicaments WHERE id = ?').get(Number(b.medicament_id))) erreurs.medicament_id = 'Médicament requis.';
    if (!texte(b.numero, 40)) erreurs.numero = 'Numéro de lot requis.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.peremption || '') || b.peremption <= new Date().toISOString().slice(0, 10)) erreurs.peremption = 'Date de péremption future requise.';
    if (!(Number.isInteger(Number(b.quantite)) && Number(b.quantite) > 0)) erreurs.quantite = 'Quantité entière positive requise.';
    if (Object.keys(erreurs).length) throw new ErreurHttp(400, 'Réception incomplète.', erreurs);
    const id = tx(db, () => {
      const lid = Number(db.prepare('INSERT INTO lots (etablissement_id, medicament_id, numero, peremption, quantite) VALUES (?, ?, ?, ?, ?)').run(e, Number(b.medicament_id), texte(b.numero, 40), b.peremption, Number(b.quantite)).lastInsertRowid);
      db.prepare("INSERT INTO mouvements (lot_id, type, quantite, motif, utilisateur_id) VALUES (?, 'RECEPTION', ?, ?, ?)").run(lid, Number(b.quantite), texte(b.motif) || 'Livraison CPA', req.utilisateur.id);
      journaliser(db, req.utilisateur, 'RECEPTION', 'lots', lid);
      return lid;
    });
    res.status(201).json({ id });
  });

  // ---------- Caisse ----------
  r.get('/caisse/factures', exiger('caisse'), (req, res) => {
    const e = etab(req);
    const statut = ['A_PAYER', 'PAYEE', 'PRISE_EN_CHARGE', 'ANNULEE'].includes(req.query.statut) ? req.query.statut : 'A_PAYER';
    const lignes = db.prepare(`SELECT f.*, p.nom, p.prenom, p.ipun, p.categorie, p.telephone, v.ticket, s.nom AS service, u.nom AS caissier
      FROM factures f JOIN visites v ON v.id = f.visite_id JOIN patients p ON p.id = v.patient_id JOIN services s ON s.id = v.service_id
      LEFT JOIN utilisateurs u ON u.id = f.caissier_id
      WHERE f.etablissement_id = ? AND f.statut = ? ${statut === 'A_PAYER' ? '' : "AND date(COALESCE(f.payee_le, f.cree_le)) >= date('now', '-2 days')"}
      ORDER BY f.id DESC LIMIT 200`).all(e, statut);
    res.json(lignes.map(f => ({ ...f, lignes: db.prepare('SELECT * FROM lignes_facture WHERE facture_id = ? ORDER BY id').all(f.id) })));
  });
  const factureDe = (req, e) => dansEtab('SELECT * FROM factures WHERE id = ?', Number(req.params.id), e);
  r.post('/caisse/factures/:id/encaisser', exiger('caisse'), (req, res) => {
    const f = factureDe(req, etab(req));
    if (f.statut !== 'A_PAYER') throw new ErreurHttp(409, 'Cette facture n’est pas à encaisser.');
    const mode = req.body?.mode;
    if (!MODES_PAIEMENT[mode]) throw new ErreurHttp(400, 'Mode de paiement requis.', { mode: 'Choisissez un mode de paiement.' });
    const ref = texte(req.body?.reference, 40);
    if (['AIRTEL_MONEY', 'MOOV_MONEY'].includes(mode) && !ref) throw new ErreurHttp(400, 'Référence de la transaction requise.', { reference: 'Référence mobile money requise.' });
    db.prepare("UPDATE factures SET statut = 'PAYEE', mode = ?, reference_paiement = ?, caissier_id = ?, payee_le = datetime('now') WHERE id = ?").run(mode, ref, req.utilisateur.id, f.id);
    journaliser(db, req.utilisateur, 'ENCAISSEMENT', 'factures', f.id, { montant: f.a_payer, mode });
    res.json(db.prepare('SELECT * FROM factures WHERE id = ?').get(f.id));
  });
  // Aucune suppression : une facture se corrige par une annulation motivée et tracée.
  r.post('/caisse/factures/:id/annuler', exiger('caisse'), (req, res) => {
    const f = factureDe(req, etab(req));
    if (f.statut === 'ANNULEE') throw new ErreurHttp(409, 'Facture déjà annulée.');
    const motif = texte(req.body?.motif, 200);
    if (!motif || motif.length < 5) throw new ErreurHttp(400, 'Motif d’annulation requis.', { motif: 'Motif requis (5 caractères au moins).' });
    db.prepare("UPDATE factures SET statut = 'ANNULEE', annulee_par = ?, motif_annulation = ? WHERE id = ?").run(req.utilisateur.id, motif, f.id);
    journaliser(db, req.utilisateur, 'ANNULATION', 'factures', f.id, { motif, montant: f.a_payer, statut_avant: f.statut });
    res.json({ ok: true });
  });
  // Clôture de caisse du jour : totaux par mode, prises en charge et annulations.
  r.get('/caisse/journee', exiger('caisse'), (req, res) => {
    const e = etab(req);
    const jour = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
    const parMode = db.prepare("SELECT mode, COUNT(*) n, SUM(a_payer) montant FROM factures WHERE etablissement_id = ? AND statut = 'PAYEE' AND date(payee_le) = ? GROUP BY mode").all(e, jour);
    const pec = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(prise_en_charge), 0) montant FROM factures WHERE etablissement_id = ? AND statut IN ('PAYEE','PRISE_EN_CHARGE') AND date(cree_le) = ? AND prise_en_charge > 0").get(e, jour);
    const annulees = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(a_payer), 0) montant FROM factures WHERE etablissement_id = ? AND statut = 'ANNULEE' AND date(cree_le) = ?").get(e, jour);
    res.json({ date: jour, par_mode: parMode, total: parMode.reduce((a, m) => a + m.montant, 0), prises_en_charge: pec, annulees });
  });

  // ---------- Lits et hospitalisation ----------
  r.get('/lits', exiger('lits'), (req, res) => {
    const e = etab(req);
    const services = db.prepare("SELECT * FROM services WHERE etablissement_id = ? AND code != 'URG' ORDER BY id").all(e);
    for (const s of services)
      s.lits = db.prepare(`SELECT l.*, sj.id AS sejour_id, sj.entree, p.nom, p.prenom, p.ipun, p.id AS patient_id, c.diagnostic_libelle
        FROM lits l LEFT JOIN sejours sj ON sj.lit_id = l.id AND sj.sortie IS NULL LEFT JOIN visites v ON v.id = sj.visite_id
        LEFT JOIN patients p ON p.id = v.patient_id LEFT JOIN consultations c ON c.id = (SELECT MAX(id) FROM consultations WHERE visite_id = v.id)
        WHERE l.service_id = ? ORDER BY l.numero`).all(s.id);
    const attente = db.prepare(`SELECT v.*, p.nom, p.prenom, p.ipun, s.nom AS service, s.code AS service_code, c.diagnostic_libelle FROM visites v
      JOIN patients p ON p.id = v.patient_id JOIN services s ON s.id = v.service_id LEFT JOIN consultations c ON c.id = (SELECT MAX(id) FROM consultations WHERE visite_id = v.id)
      WHERE v.etablissement_id = ? AND v.statut = 'HOSPITALISE' AND NOT EXISTS (SELECT 1 FROM sejours WHERE visite_id = v.id AND sortie IS NULL) ORDER BY v.arrivee`).all(e);
    res.json({ services, attente });
  });
  const litDe = (req, e) => dansEtab('SELECT l.*, s.etablissement_id FROM lits l JOIN services s ON s.id = l.service_id WHERE l.id = ?', Number(req.params.id), e);
  r.post('/lits/:id/admettre', exiger('lits'), (req, res) => {
    const e = etab(req); const l = litDe(req, e);
    if (l.statut !== 'LIBRE') throw new ErreurHttp(409, 'Ce lit n’est pas libre.');
    const v = dansEtab('SELECT * FROM visites WHERE id = ?', Number(req.body?.visite_id), e);
    if (v.statut !== 'HOSPITALISE' || db.prepare('SELECT 1 FROM sejours WHERE visite_id = ? AND sortie IS NULL').get(v.id)) throw new ErreurHttp(409, 'Ce patient n’attend pas de lit.');
    tx(db, () => {
      db.prepare('INSERT INTO sejours (visite_id, lit_id) VALUES (?, ?)').run(v.id, l.id);
      db.prepare("UPDATE lits SET statut = 'OCCUPE' WHERE id = ?").run(l.id);
      journaliser(db, req.utilisateur, 'ADMISSION_LIT', 'lits', l.id, { visite: v.id });
    });
    res.json({ ok: true });
  });
  r.post('/lits/:id/sortie', exiger('lits'), (req, res) => {
    const e = etab(req); const l = litDe(req, e);
    const sj = db.prepare('SELECT * FROM sejours WHERE lit_id = ? AND sortie IS NULL').get(l.id);
    if (!sj) throw new ErreurHttp(409, 'Ce lit n’est pas occupé.');
    const mode = ['GUERISON', 'TRANSFERT', 'DECES', 'CONTRE_AVIS'].includes(req.body?.mode_sortie) ? req.body.mode_sortie : null;
    if (!mode) throw new ErreurHttp(400, 'Mode de sortie requis.', { mode_sortie: 'Choisissez un mode de sortie.' });
    tx(db, () => {
      db.prepare("UPDATE sejours SET sortie = datetime('now'), mode_sortie = ? WHERE id = ?").run(mode, sj.id);
      db.prepare("UPDATE lits SET statut = 'NETTOYAGE' WHERE id = ?").run(l.id);
      const issue = { GUERISON: 'SORTIE', TRANSFERT: 'TRANSFERT', DECES: 'DECES', CONTRE_AVIS: 'CONTRE_AVIS' }[mode];
      db.prepare("UPDATE visites SET statut = 'TERMINEE', issue = ?, fin = datetime('now') WHERE id = ?").run(issue, sj.visite_id);
      facturerJournees(db, sj.visite_id, jours(sj.entree));
      journaliser(db, req.utilisateur, 'SORTIE', 'sejours', sj.id, { mode });
    });
    res.json({ ok: true });
  });
  r.post('/lits/:id/statut', exiger('lits'), (req, res) => {
    const l = litDe(req, etab(req));
    const statut = req.body?.statut;
    if (!['LIBRE', 'NETTOYAGE', 'HORS_SERVICE'].includes(statut) || l.statut === 'OCCUPE') throw new ErreurHttp(409, 'Changement de statut impossible pour ce lit.');
    db.prepare('UPDATE lits SET statut = ? WHERE id = ?').run(statut, l.id);
    res.json({ ok: true });
  });

  return r;
}
