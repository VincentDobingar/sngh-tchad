// Pilotage : tableaux de bord établissement et national (M18), surveillance épidémiologique (M19),
// rapport mensuel SNIS (M17), administration des comptes et journal d'audit (M20).
import express from 'express';
import bcrypt from 'bcryptjs';
import { journaliser } from '../db.js';
import { ErreurHttp, exiger, portee } from '../auth.js';
import { ROLES, ROLES_ETABLISSEMENT, DROITS } from '../droits.js';
import { MPE, PROVINCES, DIAGNOSTICS, EXAMENS, TRIAGE, CATEGORIES, MODES_PAIEMENT, TYPES_ETABLISSEMENT, SERVICES, OPERATEURS, INDICATEURS_CARTE } from '../referentiels.js';
import { modePasserelle } from '../paiements.js';

const PERIODES = [7, 30, 90];

export default function routesPilotage(db) {
  const r = express.Router();

  r.get('/referentiels', (req, res) => {
    const p = portee(req.utilisateur);
    res.json({
      etablissements: db.prepare(`SELECT * FROM etablissements ${p ? 'WHERE id = ?' : ''} ORDER BY id`).all(...(p ? [p] : [])),
      services: SERVICES, provinces: PROVINCES, diagnostics: DIAGNOSTICS, examens: EXAMENS, triage: TRIAGE, categories: CATEGORIES,
      modes: MODES_PAIEMENT, operateurs: OPERATEURS, passerelle: modePasserelle(), types: TYPES_ETABLISSEMENT, mpe: MPE, roles: ROLES, droits: DROITS, indicateurs_carte: INDICATEURS_CARTE,
      medicaments: db.prepare('SELECT * FROM medicaments ORDER BY dci').all(),
    });
  });

  // Filtre établissement : imposé par le compte ou choisi par un profil central (vide = national).
  function filtre(req) {
    const p = portee(req.utilisateur);
    const id = p || (Number(req.query.etablissement_id) || null);
    return { id, sql: id ? 'AND v.etablissement_id = ?' : '', params: id ? [id] : [] };
  }

  r.get('/tableau', exiger('tableauEtab'), (req, res) => {
    const f = filtre(req);
    if (!f.id && !['decideur', 'admin'].includes(req.utilisateur.role)) throw new ErreurHttp(403, 'Vue nationale réservée au niveau central.');
    const j = PERIODES.includes(Number(req.query.jours)) ? Number(req.query.jours) : 30;
    const depuis = `-${j} days`;
    const fe = f.id ? 'AND etablissement_id = ?' : '';
    const un = (sql, ...a) => db.prepare(sql).get(...a);

    const visites = un(`SELECT COUNT(*) n, SUM(type = 'URGENCE') urgences, COUNT(DISTINCT patient_id) patients FROM visites v WHERE arrivee >= datetime('now', ?) ${f.sql}`, depuis, ...f.params);
    const deces = un(`SELECT COUNT(*) n FROM visites v WHERE issue = 'DECES' AND arrivee >= datetime('now', ?) ${f.sql}`, depuis, ...f.params).n;
    const lits = un(`SELECT COUNT(*) total, SUM(l.statut = 'OCCUPE') occupes FROM lits l JOIN services s ON s.id = l.service_id WHERE 1 ${f.id ? 'AND s.etablissement_id = ?' : ''}`, ...f.params);
    const dms = un(`SELECT AVG(julianday(sj.sortie) - julianday(sj.entree)) d, COUNT(*) n FROM sejours sj JOIN visites v ON v.id = sj.visite_id WHERE sj.sortie >= datetime('now', ?) ${f.sql}`, depuis, ...f.params);
    const recettes = un(`SELECT COALESCE(SUM(a_payer), 0) encaisse FROM factures WHERE statut = 'PAYEE' AND payee_le >= datetime('now', ?) ${fe}`, depuis, ...f.params).encaisse;
    const gratuites = un(`SELECT COALESCE(SUM(prise_en_charge), 0) m, COUNT(*) n FROM factures WHERE statut IN ('PAYEE','PRISE_EN_CHARGE') AND prise_en_charge > 0 AND cree_le >= datetime('now', ?) ${fe}`, depuis, ...f.params);
    const attenteLabo = un(`SELECT COUNT(*) n, SUM(x.critique) critiques FROM examens x JOIN visites v ON v.id = x.visite_id WHERE x.statut != 'VALIDE' ${f.sql}`, ...f.params);
    const delaiLabo = un(`SELECT AVG((julianday(x.valide_le) - julianday(x.demande_le)) * 24) h FROM examens x JOIN visites v ON v.id = x.visite_id WHERE x.valide_le >= datetime('now', ?) ${f.sql}`, depuis, ...f.params).h;
    const attente = un(`SELECT AVG((julianday(debut_prise_en_charge) - julianday(arrivee)) * 1440) m FROM visites v WHERE type = 'CONSULTATION' AND debut_prise_en_charge IS NOT NULL AND arrivee >= datetime('now', ?) ${f.sql}`, depuis, ...f.params).m;

    const serie = db.prepare(`SELECT date(arrivee) AS date, SUM(type = 'CONSULTATION') consultations, SUM(type = 'URGENCE') urgences
      FROM visites v WHERE arrivee >= datetime('now', ?) ${f.sql} GROUP BY date(arrivee) ORDER BY date`).all(depuis, ...f.params);
    const morbidite = db.prepare(`SELECT c.diagnostic_code AS code, c.diagnostic_libelle AS nom, COUNT(*) n FROM consultations c JOIN visites v ON v.id = c.visite_id
      WHERE c.cree_le >= datetime('now', ?) ${f.sql} GROUP BY c.diagnostic_code ORDER BY n DESC LIMIT 10`).all(depuis, ...f.params);
    const parService = db.prepare(`SELECT s.nom, COUNT(*) n FROM visites v JOIN services s ON s.id = v.service_id WHERE v.arrivee >= datetime('now', ?) ${f.sql} GROUP BY s.code ORDER BY n DESC`).all(depuis, ...f.params);
    const occupation = db.prepare(`SELECT s.nom, COUNT(*) total, SUM(l.statut = 'OCCUPE') occupes FROM lits l JOIN services s ON s.id = l.service_id
      WHERE s.code != 'URG' ${f.id ? 'AND s.etablissement_id = ?' : ''} GROUP BY s.code ORDER BY s.id`).all(...f.params);
    const ruptures = db.prepare(`SELECT e.code AS etablissement, m.dci, m.dosage, se.seuil,
        (SELECT COALESCE(SUM(quantite), 0) FROM lots WHERE etablissement_id = e.id AND medicament_id = m.id AND peremption > date('now')) AS quantite
      FROM seuils se JOIN medicaments m ON m.id = se.medicament_id JOIN etablissements e ON e.id = se.etablissement_id WHERE 1 ${f.id ? 'AND e.id = ?' : ''}`).all(...f.params)
      .filter(x => x.quantite < x.seuil).sort((a, b) => a.quantite / a.seuil - b.quantite / b.seuil);
    const paiements = db.prepare(`SELECT mode, COUNT(*) n, SUM(a_payer) montant FROM factures WHERE statut = 'PAYEE' AND payee_le >= datetime('now', ?) ${fe} GROUP BY mode ORDER BY montant DESC`).all(depuis, ...f.params);

    res.json({
      etablissement: f.id ? db.prepare('SELECT * FROM etablissements WHERE id = ?').get(f.id) : null, jours: j,
      indicateurs: { visites: visites.n, urgences: visites.urgences || 0, patients: visites.patients, deces, recettes, gratuites: gratuites.m, nb_gratuites: gratuites.n,
        lits_total: lits.total, lits_occupes: lits.occupes || 0, taux_occupation: lits.total ? Math.round((lits.occupes || 0) / lits.total * 100) : 0,
        dms: dms.d ? Math.round(dms.d * 10) / 10 : null, sorties: dms.n, examens_en_attente: attenteLabo.n, resultats_critiques: attenteLabo.critiques || 0,
        delai_labo_h: delaiLabo ? Math.round(delaiLabo * 10) / 10 : null, attente_min: attente ? Math.round(attente) : null, ruptures: ruptures.filter(x => x.quantite === 0).length, sous_seuil: ruptures.length },
      serie, morbidite, par_service: parService, occupation, ruptures: ruptures.slice(0, 12), paiements, alertes: alertes(f.id),
    });
  });

  // Comparaison des établissements (vue nationale), avec regroupement par province.
  r.get('/tableau/national', exiger('tableauNational'), (req, res) => {
    const j = PERIODES.includes(Number(req.query.jours)) ? Number(req.query.jours) : 30;
    const lignes = db.prepare('SELECT * FROM etablissements WHERE actif = 1 ORDER BY id').all().map(e => {
      const un = (sql, ...a) => db.prepare(sql).get(e.id, ...a);
      const lits = un("SELECT COUNT(*) total, SUM(l.statut = 'OCCUPE') occ FROM lits l JOIN services s ON s.id = l.service_id WHERE s.etablissement_id = ?");
      return { ...e,
        visites: un("SELECT COUNT(*) n FROM visites WHERE etablissement_id = ? AND arrivee >= datetime('now', ?)", `-${j} days`).n,
        deces: un("SELECT COUNT(*) n FROM visites WHERE etablissement_id = ? AND issue = 'DECES' AND arrivee >= datetime('now', ?)", `-${j} days`).n,
        recettes: un("SELECT COALESCE(SUM(a_payer), 0) n FROM factures WHERE etablissement_id = ? AND statut = 'PAYEE' AND payee_le >= datetime('now', ?)", `-${j} days`).n,
        taux_occupation: lits.total ? Math.round((lits.occ || 0) / lits.total * 100) : 0,
        sous_seuil: db.prepare(`SELECT COUNT(*) n FROM seuils se WHERE se.etablissement_id = ? AND se.seuil >
          (SELECT COALESCE(SUM(quantite), 0) FROM lots WHERE etablissement_id = se.etablissement_id AND medicament_id = se.medicament_id AND peremption > date('now'))`).get(e.id).n,
        alertes: alertes(e.id).filter(a => a.alerte).length,
        derniere_activite: un('SELECT MAX(arrivee) d FROM visites WHERE etablissement_id = ?').d };
    });
    const provinces = PROVINCES.map(p => {
      const es = lignes.filter(e => e.province === p);
      return { province: p, etablissements: es.length, visites: es.reduce((a, e) => a + e.visites, 0), alertes: es.reduce((a, e) => a + e.alertes, 0) };
    });
    res.json({ jours: j, etablissements: lignes, provinces });
  });

  // ---------- Carte sanitaire : géolocalisation par province de résidence du patient ----------
  // Le lieu retenu est la province de résidence déclarée à l'admission (à défaut, celle de l'établissement).
  function filtreIndicateur(ind) {
    const def = INDICATEURS_CARTE[ind] || INDICATEURS_CARTE.visites;
    if (def.codes) return { def, join: 'JOIN consultations c ON c.visite_id = v.id', where: `AND c.diagnostic_code IN (${def.codes.map(() => '?').join(',')})`, params: def.codes };
    if (ind === 'deces') return { def, join: '', where: "AND v.issue = 'DECES'", params: [] };
    return { def, join: '', where: '', params: [] };
  }
  r.get('/carte', exiger('tableauEtab'), (req, res) => {
    const f = filtre(req);
    const j = PERIODES.includes(Number(req.query.jours)) ? Number(req.query.jours) : 30;
    const ind = INDICATEURS_CARTE[req.query.indicateur] ? req.query.indicateur : 'visites';
    const x = filtreIndicateur(ind);
    const depuis = `-${j} days`;
    const lieu = "COALESCE(p.province, e.province)";
    const base = `FROM visites v JOIN patients p ON p.id = v.patient_id JOIN etablissements e ON e.id = v.etablissement_id ${x.join}
      WHERE v.arrivee >= datetime('now', ?) ${f.sql} ${x.where}`;
    const parProvince = db.prepare(`SELECT ${lieu} AS province, COUNT(DISTINCT v.id) n, SUM(v.issue = 'DECES') deces FROM visites v JOIN patients p ON p.id = v.patient_id JOIN etablissements e ON e.id = v.etablissement_id ${x.join}
      WHERE v.arrivee >= datetime('now', ?) ${f.sql} ${x.where} GROUP BY 1`).all(depuis, ...f.params, ...x.params);
    const visitesProvince = Object.fromEntries(db.prepare(`SELECT ${lieu} AS province, COUNT(*) n FROM visites v JOIN patients p ON p.id = v.patient_id JOIN etablissements e ON e.id = v.etablissement_id
      WHERE v.arrivee >= datetime('now', ?) ${f.sql} GROUP BY 1`).all(depuis, ...f.params).map(r => [r.province, r.n]));
    const etabs = db.prepare(`SELECT e.id, COUNT(DISTINCT v.id) n ${base} GROUP BY e.id`).all(depuis, ...f.params, ...x.params);
    const tous = db.prepare(`SELECT * FROM etablissements ${f.id ? 'WHERE id = ?' : ''}`).all(...f.params).map(e => ({ ...e, n: etabs.find(y => y.id === e.id)?.n || 0 }));
    const semaines = db.prepare(`SELECT strftime('%Y-%W', v.arrivee) AS semaine, MIN(date(v.arrivee)) AS date, COUNT(DISTINCT v.id) n ${base} GROUP BY semaine ORDER BY semaine`).all(depuis, ...f.params, ...x.params);
    res.json({ indicateur: ind, libelle: x.def.libelle, jours: j, etablissement: f.id || null,
      provinces: PROVINCES.map(pr => { const l = parProvince.find(y => y.province === pr); const n = l?.n || 0, v = visitesProvince[pr] || 0;
        return { province: pr, n, deces: l?.deces || 0, visites: v, part: v ? Math.round(n / v * 1000) / 10 : null }; }),
      etablissements: tous, semaines, total: parProvince.reduce((a, y) => a + y.n, 0) });
  });
  // Fiche d'une province : profil sanitaire (tous les indicateurs), établissements fréquentés, évolution.
  r.get('/carte/province/:nom', exiger('tableauEtab'), (req, res) => {
    const f = filtre(req);
    const pr = PROVINCES.find(x => x === req.params.nom);
    if (!pr) throw new ErreurHttp(404, 'Province inconnue.');
    const j = PERIODES.includes(Number(req.query.jours)) ? Number(req.query.jours) : 30;
    const depuis = `-${j} days`;
    const cond = `AND COALESCE(p.province, e.province) = ? AND v.arrivee >= datetime('now', ?) ${f.sql}`;
    const profil = Object.entries(INDICATEURS_CARTE).filter(([k]) => k !== 'visites').map(([k, def]) => {
      const x = filtreIndicateur(k);
      const n = db.prepare(`SELECT COUNT(DISTINCT v.id) n FROM visites v JOIN patients p ON p.id = v.patient_id JOIN etablissements e ON e.id = v.etablissement_id ${x.join} WHERE 1 ${cond} ${x.where}`)
        .get(pr, depuis, ...f.params, ...x.params).n;
      return { indicateur: k, libelle: def.libelle, n };
    });
    const visites = db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT v.patient_id) patients FROM visites v JOIN patients p ON p.id = v.patient_id JOIN etablissements e ON e.id = v.etablissement_id WHERE 1 ${cond}`).get(pr, depuis, ...f.params);
    const etabs = db.prepare(`SELECT e.nom, COUNT(*) n FROM visites v JOIN patients p ON p.id = v.patient_id JOIN etablissements e ON e.id = v.etablissement_id WHERE 1 ${cond} GROUP BY e.id ORDER BY n DESC`).all(pr, depuis, ...f.params);
    const morbidite = db.prepare(`SELECT c.diagnostic_libelle AS nom, COUNT(*) n FROM visites v JOIN patients p ON p.id = v.patient_id JOIN etablissements e ON e.id = v.etablissement_id
      JOIN consultations c ON c.visite_id = v.id WHERE 1 ${cond} GROUP BY c.diagnostic_code ORDER BY n DESC LIMIT 6`).all(pr, depuis, ...f.params);
    res.json({ province: pr, jours: j, visites: visites.n, patients: visites.patients, profil, etablissements: etabs, morbidite });
  });

  // Surveillance : cas des maladies à potentiel épidémique sur 7 jours, comparés au seuil d'alerte, et série sur 8 semaines.
  function alertes(etabId) {
    return Object.entries(MPE).map(([code, m]) => {
      const n = db.prepare(`SELECT COUNT(*) n FROM consultations c JOIN visites v ON v.id = c.visite_id WHERE c.diagnostic_code = ? AND c.cree_le >= datetime('now', '-7 days') ${etabId ? 'AND v.etablissement_id = ?' : ''}`)
        .get(code, ...(etabId ? [etabId] : [])).n;
      return { code, maladie: m.maladie, seuil: m.seuil, cas_7j: n, alerte: n >= m.seuil };
    });
  }
  r.get('/surveillance', exiger('surveillance'), (req, res) => {
    const f = filtre(req);
    const codes = Object.keys(MPE);
    const etabs = db.prepare(`SELECT * FROM etablissements ${f.id ? 'WHERE id = ?' : ''} ORDER BY id`).all(...f.params);
    const semaines = db.prepare(`SELECT strftime('%Y-%W', c.cree_le) AS semaine, MIN(date(c.cree_le)) AS debut, c.diagnostic_code AS code, COUNT(*) n
      FROM consultations c JOIN visites v ON v.id = c.visite_id WHERE c.diagnostic_code IN (${codes.map(() => '?').join(',')}) AND c.cree_le >= datetime('now', '-56 days') ${f.sql}
      GROUP BY semaine, c.diagnostic_code ORDER BY semaine`).all(...codes, ...f.params);
    const cas = db.prepare(`SELECT c.cree_le, c.diagnostic_code AS code, c.diagnostic_libelle, p.ipun, p.sexe, p.date_naissance, p.adresse, e.nom AS etablissement, e.province
      FROM consultations c JOIN visites v ON v.id = c.visite_id JOIN patients p ON p.id = v.patient_id JOIN etablissements e ON e.id = v.etablissement_id
      WHERE c.diagnostic_code IN (${codes.map(() => '?').join(',')}) AND c.cree_le >= datetime('now', '-14 days') ${f.sql} ORDER BY c.cree_le DESC LIMIT 100`).all(...codes, ...f.params);
    res.json({ global: alertes(f.id), par_etablissement: etabs.map(e => ({ ...e, alertes: alertes(e.id) })), semaines, cas });
  });

  // Rapport mensuel d'activité hospitalière (format illustratif du SNIS), prêt à être validé puis transmis à DHIS2.
  r.get('/rapports/mensuel', exiger('tableauEtab'), (req, res) => {
    const f = filtre(req);
    const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : new Date().toISOString().slice(0, 7);
    const m = [`${mois}-01`, `${mois}-01`];
    const ent = `AND v.arrivee >= date(?) AND v.arrivee < date(?, '+1 month') ${f.sql}`;
    const g = (sql) => db.prepare(sql).get(...m, ...f.params);
    const tranches = db.prepare(`SELECT CASE WHEN (julianday(v.arrivee) - julianday(p.date_naissance)) / 365.25 < 1 THEN '0-11 mois'
        WHEN (julianday(v.arrivee) - julianday(p.date_naissance)) / 365.25 < 5 THEN '1-4 ans' WHEN (julianday(v.arrivee) - julianday(p.date_naissance)) / 365.25 < 15 THEN '5-14 ans'
        ELSE '15 ans et plus' END AS tranche, p.sexe, COUNT(*) n FROM visites v JOIN patients p ON p.id = v.patient_id WHERE 1 ${ent} GROUP BY tranche, p.sexe`).all(...m, ...f.params);
    const morbidite = db.prepare(`SELECT c.diagnostic_code AS code, c.diagnostic_libelle AS nom, COUNT(*) n FROM consultations c JOIN visites v ON v.id = c.visite_id WHERE 1 ${ent}
      GROUP BY c.diagnostic_code ORDER BY n DESC`).all(...m, ...f.params);
    res.json({ mois, etablissement: f.id ? db.prepare('SELECT * FROM etablissements WHERE id = ?').get(f.id) : null,
      consultations: g(`SELECT COUNT(*) n FROM visites v WHERE type = 'CONSULTATION' ${ent}`).n,
      urgences: g(`SELECT COUNT(*) n FROM visites v WHERE type = 'URGENCE' ${ent}`).n,
      hospitalisations: g(`SELECT COUNT(*) n FROM visites v WHERE (v.statut = 'HOSPITALISE' OR EXISTS (SELECT 1 FROM sejours WHERE visite_id = v.id)) ${ent}`).n,
      accouchements: g(`SELECT COUNT(*) n FROM consultations c JOIN visites v ON v.id = c.visite_id WHERE c.diagnostic_code = 'O80' ${ent}`).n,
      deces: g(`SELECT COUNT(*) n FROM visites v WHERE issue = 'DECES' ${ent}`).n,
      examens: g(`SELECT COUNT(*) n FROM examens x JOIN visites v ON v.id = x.visite_id WHERE x.statut = 'VALIDE' ${ent}`).n,
      tranches, morbidite });
  });

  // ---------- Administration ----------
  r.get('/admin/utilisateurs', exiger('administrer'), (_req, res) => {
    res.json(db.prepare(`SELECT u.id, u.nom, u.login, u.role, u.etablissement_id, u.actif, u.derniere_connexion, u.cree_le, e.nom AS etablissement,
      (SELECT COUNT(*) FROM journal j WHERE j.utilisateur_id = u.id AND j.le >= datetime('now', '-7 days')) AS actions_7j
      FROM utilisateurs u LEFT JOIN etablissements e ON e.id = u.etablissement_id ORDER BY u.etablissement_id NULLS FIRST, u.role, u.nom`).all());
  });
  const verifierCompte = (b, creation) => {
    const erreurs = {};
    if (creation && !/^[a-z0-9._-]{3,40}$/.test(b.login || '')) erreurs.login = 'Identifiant : 3 à 40 caractères (minuscules, chiffres, . _ -).';
    if (!b.nom || String(b.nom).trim().length < 3) erreurs.nom = 'Nom requis.';
    if (!ROLES[b.role]) erreurs.role = 'Rôle requis.';
    if (ROLES_ETABLISSEMENT.includes(b.role) && !db.prepare('SELECT 1 FROM etablissements WHERE id = ?').get(Number(b.etablissement_id))) erreurs.etablissement_id = 'Établissement requis pour ce rôle.';
    if ((creation || b.mot_de_passe) && String(b.mot_de_passe || '').length < 8) erreurs.mot_de_passe = '8 caractères au moins.';
    if (Object.keys(erreurs).length) throw new ErreurHttp(400, 'Compte incomplet.', erreurs);
  };
  r.post('/admin/utilisateurs', exiger('administrer'), (req, res) => {
    const b = req.body || {};
    verifierCompte(b, true);
    if (db.prepare('SELECT 1 FROM utilisateurs WHERE login = ?').get(b.login)) throw new ErreurHttp(409, 'Cet identifiant existe déjà.', { login: 'Identifiant déjà utilisé.' });
    const id = Number(db.prepare('INSERT INTO utilisateurs (nom, login, mot_de_passe, role, etablissement_id) VALUES (?, ?, ?, ?, ?)')
      .run(String(b.nom).trim(), b.login, bcrypt.hashSync(b.mot_de_passe, 10), b.role, ROLES_ETABLISSEMENT.includes(b.role) ? Number(b.etablissement_id) : null).lastInsertRowid);
    journaliser(db, req.utilisateur, 'CREATION_COMPTE', 'utilisateurs', id, { login: b.login, role: b.role });
    res.status(201).json({ id });
  });
  r.patch('/admin/utilisateurs/:id', exiger('administrer'), (req, res) => {
    const u = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(Number(req.params.id));
    if (!u) throw new ErreurHttp(404, 'Compte introuvable.');
    const b = { nom: u.nom, role: u.role, etablissement_id: u.etablissement_id, ...req.body };
    if ('actif' in req.body) {
      if (u.id === req.utilisateur.id) throw new ErreurHttp(409, 'Vous ne pouvez pas suspendre votre propre compte.');
      db.prepare('UPDATE utilisateurs SET actif = ? WHERE id = ?').run(req.body.actif ? 1 : 0, u.id);
      journaliser(db, req.utilisateur, req.body.actif ? 'REACTIVATION' : 'SUSPENSION', 'utilisateurs', u.id);
      return res.json({ ok: true });
    }
    verifierCompte(b, false);
    db.prepare('UPDATE utilisateurs SET nom = ?, role = ?, etablissement_id = ? WHERE id = ?').run(String(b.nom).trim(), b.role, ROLES_ETABLISSEMENT.includes(b.role) ? Number(b.etablissement_id) : null, u.id);
    if (b.mot_de_passe) db.prepare('UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?').run(bcrypt.hashSync(b.mot_de_passe, 10), u.id);
    journaliser(db, req.utilisateur, 'MODIFICATION_COMPTE', 'utilisateurs', u.id, { role: b.role, mot_de_passe: !!b.mot_de_passe });
    res.json({ ok: true });
  });
  r.get('/admin/journal', exiger('administrer'), (req, res) => {
    const action = req.query.action ? String(req.query.action) : null;
    res.json(db.prepare(`SELECT j.*, u.nom AS utilisateur, u.login, e.code AS etablissement FROM journal j LEFT JOIN utilisateurs u ON u.id = j.utilisateur_id
      LEFT JOIN etablissements e ON e.id = j.etablissement_id ${action ? 'WHERE j.action = ?' : ''} ORDER BY j.id DESC LIMIT 300`).all(...(action ? [action] : [])));
  });

  return r;
}
