// Parcours patient : identification et admission (M01), file d'attente et consultation (M03, M04),
// dossier patient informatisé (M02), demandes d'examens et prescriptions.
import express from 'express';
import { tx, journaliser } from '../db.js';
import { ErreurHttp, exiger, portee } from '../auth.js';
import { cleRecherche, genererIpun, libelleDiagnostic, EXAMENS, TRIAGE, ageAns } from '../referentiels.js';
import { facturerActe, facturerExamen, recalculer } from '../facturation.js';

const texte = (v, max = 2000) => (v == null || v === '' ? null : String(v).trim().slice(0, max));
const nombre = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Établissement de travail : celui du compte, ou celui demandé par un profil central.
export function etablissementDe(req, demande) {
  const p = portee(req.utilisateur);
  if (p) return p;
  const id = Number(demande);
  if (!Number.isInteger(id) || id <= 0) throw new ErreurHttp(400, 'Établissement requis.');
  return id;
}

const age = p => {
  const a = ageAns(p.date_naissance);
  return a == null ? null : a < 1 ? `${Math.floor(a * 12)} mois` : `${Math.floor(a)} ans`;
};
const resume = p => ({ ...p, age: age(p), cle_recherche: undefined });

export default function routesParcours(db) {
  const r = express.Router();

  // ---------- Patients ----------
  r.get('/patients', exiger('rechercher'), (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const chiffres = q.replace(/\D/g, '');
    const mots = cleRecherche(q).split(' ').filter(m => m.length >= 2);
    const conds = [], params = [];
    if (/^TD-/i.test(q)) { conds.push('ipun = ?'); params.push(q.toUpperCase()); }
    if (chiffres.length >= 6) { conds.push("REPLACE(telephone, ' ', '') LIKE ?"); params.push(`%${chiffres}%`); }
    if (mots.length) { conds.push('(' + mots.map(() => 'cle_recherche LIKE ?').join(' AND ') + ')'); params.push(...mots.map(m => `%${m}%`)); }
    if (!conds.length) return res.json([]);
    const lignes = db.prepare(`SELECT p.*, (SELECT MAX(arrivee) FROM visites WHERE patient_id = p.id) AS derniere_visite
      FROM patients p WHERE ${conds.join(' OR ')} ORDER BY derniere_visite DESC NULLS LAST LIMIT 25`).all(...params);
    res.json(lignes.map(resume));
  });

  r.post('/patients', exiger('admettre'), (req, res) => {
    const b = req.body || {};
    const erreurs = {};
    const nom = texte(b.nom, 80)?.toUpperCase(), prenom = texte(b.prenom, 80);
    if (!nom && !b.non_identifie) erreurs.nom = 'Nom requis.';
    if (!prenom && !b.non_identifie) erreurs.prenom = 'Prénom requis.';
    if (!['F', 'M'].includes(b.sexe)) erreurs.sexe = 'Sexe requis.';
    let naissance = texte(b.date_naissance, 10), estime = 0;
    if (!naissance && nombre(b.age_annees) != null) {
      const a = nombre(b.age_annees);
      if (a < 0 || a > 120) erreurs.age_annees = 'Âge invalide.';
      else { naissance = `${new Date().getFullYear() - Math.floor(a)}-07-01`; estime = 1; }
    }
    if (naissance && (!/^\d{4}-\d{2}-\d{2}$/.test(naissance) || naissance > aujourdhui())) erreurs.date_naissance = 'Date de naissance invalide.';
    if (!naissance && !b.non_identifie) erreurs.date_naissance = 'Date de naissance ou âge estimé requis.';
    const categorie = ['PAYANT', 'GRATUITE', 'ASSURE', 'INDIGENT'].includes(b.categorie) ? b.categorie : 'PAYANT';
    if (Object.keys(erreurs).length) throw new ErreurHttp(400, 'Fiche incomplète.', erreurs);

    const nomF = nom || 'INCONNU', prenomF = prenom || `${b.sexe === 'F' ? 'Femme' : 'Homme'} non identifié(e)`;
    const cle = cleRecherche(`${nomF} ${prenomF}`);
    // Doublons probables : même clé phonétique, même sexe, même année de naissance (à un an près).
    if (!b.forcer && !b.non_identifie) {
      const annee = Number(naissance.slice(0, 4));
      const doublons = db.prepare(`SELECT * FROM patients WHERE cle_recherche = ? AND sexe = ? AND date_naissance IS NOT NULL
        AND ABS(CAST(substr(date_naissance, 1, 4) AS INTEGER) - ?) <= 1 LIMIT 5`).all(cle, b.sexe, annee);
      if (doublons.length) return res.status(409).json({ erreur: 'Ce patient semble déjà enregistré.', doublons: doublons.map(resume) });
    }
    const u = req.utilisateur;
    const p = tx(db, () => {
      const id = Number(db.prepare(`INSERT INTO patients (nom, prenom, cle_recherche, sexe, date_naissance, age_estime, telephone, nom_pere, nom_mere,
        adresse, province, categorie, assureur, allergies, antecedents, non_identifie, etablissement_id, cree_par)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nomF, prenomF, cle, b.sexe, naissance, estime, texte(b.telephone, 20),
        texte(b.nom_pere, 80), texte(b.nom_mere, 80), texte(b.adresse, 160), texte(b.province, 40), categorie, texte(b.assureur, 60),
        texte(b.allergies, 300), texte(b.antecedents, 500), b.non_identifie ? 1 : 0, u.etablissement_id, u.id).lastInsertRowid);
      db.prepare('UPDATE patients SET ipun = ? WHERE id = ?').run(genererIpun(id), id);
      journaliser(db, u, 'CREATION', 'patients', id);
      return db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
    });
    res.status(201).json(resume(p));
  });

  // Dossier patient : accès tracé (qui a consulté quel dossier, quand).
  r.get('/patients/:id/dossier', exiger('dossier'), (req, res) => {
    const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(Number(req.params.id));
    if (!p) throw new ErreurHttp(404, 'Patient introuvable.');
    const visites = db.prepare(`SELECT v.*, s.nom AS service, e.nom AS etablissement FROM visites v
      JOIN services s ON s.id = v.service_id JOIN etablissements e ON e.id = v.etablissement_id WHERE v.patient_id = ? ORDER BY v.arrivee DESC`).all(p.id);
    for (const v of visites) {
      v.consultations = db.prepare(`SELECT c.*, u.nom AS medecin FROM consultations c LEFT JOIN utilisateurs u ON u.id = c.medecin_id WHERE c.visite_id = ? ORDER BY c.id`).all(v.id);
      for (const c of v.consultations)
        c.prescriptions = db.prepare(`SELECT pr.*, m.dci, m.dosage, m.forme FROM prescriptions pr JOIN medicaments m ON m.id = pr.medicament_id WHERE pr.consultation_id = ?`).all(c.id);
      v.examens = db.prepare('SELECT * FROM examens WHERE visite_id = ? ORDER BY id').all(v.id)
        .map(x => ({ ...x, libelle: EXAMENS[x.code]?.libelle, unite: EXAMENS[x.code]?.unite, resultat: x.statut === 'VALIDE' ? x.resultat : null }));
      v.sejours = db.prepare(`SELECT sj.*, l.numero AS lit, s.nom AS service FROM sejours sj JOIN lits l ON l.id = sj.lit_id JOIN services s ON s.id = l.service_id WHERE sj.visite_id = ?`).all(v.id);
    }
    journaliser(db, req.utilisateur, 'ACCES_DOSSIER', 'patients', p.id);
    res.json({ patient: resume(p), visites });
  });

  // ---------- Visites et file d'attente ----------
  r.post('/visites', exiger('admettre'), (req, res) => {
    const b = req.body || {};
    const u = req.utilisateur;
    const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(Number(b.patient_id));
    if (!p) throw new ErreurHttp(404, 'Patient introuvable.');
    const type = b.type === 'URGENCE' ? 'URGENCE' : 'CONSULTATION';
    const service = db.prepare('SELECT * FROM services WHERE etablissement_id = ? AND code = ?').get(u.etablissement_id, type === 'URGENCE' ? 'URG' : b.service_code);
    if (!service) throw new ErreurHttp(400, 'Service inconnu.', { service_code: 'Choisissez un service.' });
    if (type === 'URGENCE' && !TRIAGE[b.triage]) throw new ErreurHttp(400, 'Niveau de triage requis.', { triage: 'Choisissez un niveau de triage.' });
    if (db.prepare("SELECT 1 FROM visites WHERE patient_id = ? AND etablissement_id = ? AND statut IN ('ATTENTE','EN_COURS')").get(p.id, u.etablissement_id))
      throw new ErreurHttp(409, 'Ce patient a déjà une visite en cours dans l’établissement.');
    const v = tx(db, () => {
      const n = db.prepare("SELECT COUNT(*) n FROM visites WHERE service_id = ? AND date(arrivee) = date('now')").get(service.id).n + 1;
      const id = Number(db.prepare('INSERT INTO visites (patient_id, etablissement_id, service_id, type, ticket, triage, motif, cree_par) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(p.id, u.etablissement_id, service.id, type, `${service.code}-${String(n).padStart(3, '0')}`, type === 'URGENCE' ? b.triage : null, texte(b.motif, 200), u.id).lastInsertRowid);
      facturerActe(db, id, type);
      journaliser(db, u, 'ADMISSION', 'visites', id, { service: service.code });
      return db.prepare('SELECT v.*, s.nom AS service FROM visites v JOIN services s ON s.id = v.service_id WHERE v.id = ?').get(id);
    });
    const attente = db.prepare("SELECT COUNT(*) n FROM visites WHERE service_id = ? AND statut = 'ATTENTE' AND id < ?").get(service.id, v.id).n;
    res.status(201).json({ ...v, patient: resume(p), devant: attente });
  });

  // File d'attente du jour (et urgences encore présentes) : triée par gravité puis par heure d'arrivée.
  r.get('/visites/file', exiger('dossier'), (req, res) => {
    const etab = etablissementDe(req, req.query.etablissement_id);
    const svc = req.query.service ? String(req.query.service) : null;
    const lignes = db.prepare(`SELECT v.*, s.code AS service_code, s.nom AS service, p.nom, p.prenom, p.sexe, p.date_naissance, p.ipun, p.allergies,
        CAST((julianday('now') - julianday(v.arrivee)) * 1440 AS INTEGER) AS attente_min
      FROM visites v JOIN services s ON s.id = v.service_id JOIN patients p ON p.id = v.patient_id
      WHERE v.etablissement_id = ? AND v.statut IN ('ATTENTE','EN_COURS') ${svc ? 'AND s.code = ?' : ''}
      ORDER BY CASE v.triage WHEN 'ROUGE' THEN 0 WHEN 'ORANGE' THEN 1 WHEN 'JAUNE' THEN 2 ELSE 3 END, v.arrivee`).all(...[etab, ...(svc ? [svc] : [])]);
    res.json(lignes.map(l => ({ ...l, age: age(l) })));
  });

  r.post('/visites/:id/appeler', exiger('consulter'), (req, res) => {
    const v = visiteDe(req);
    if (v.statut !== 'ATTENTE') throw new ErreurHttp(409, 'Ce patient n’est plus en attente.');
    db.prepare("UPDATE visites SET statut = 'EN_COURS', debut_prise_en_charge = datetime('now') WHERE id = ?").run(v.id);
    res.json({ ok: true });
  });

  // Consultation : constantes, examen, diagnostic CIM-10, prescriptions, examens demandés et orientation.
  r.post('/visites/:id/consultation', exiger('consulter'), (req, res) => {
    const v = visiteDe(req);
    if (!['ATTENTE', 'EN_COURS'].includes(v.statut)) throw new ErreurHttp(409, 'Cette visite est déjà clôturée.');
    const b = req.body || {};
    const erreurs = {};
    if (!b.diagnostic_code || !libelleDiagnostic(b.diagnostic_code)) erreurs.diagnostic_code = 'Diagnostic CIM-10 requis.';
    const issue = ['SORTIE', 'HOSPITALISATION', 'TRANSFERT', 'DECES', 'CONTRE_AVIS'].includes(b.issue) ? b.issue : null;
    if (!issue) erreurs.issue = 'Orientation requise.';
    const t = nombre(b.temperature);
    if (t != null && (t < 30 || t > 45)) erreurs.temperature = 'Température invalide.';
    const prescriptions = Array.isArray(b.prescriptions) ? b.prescriptions.filter(x => x && x.medicament_id) : [];
    for (const [i, x] of prescriptions.entries())
      if (!db.prepare('SELECT 1 FROM medicaments WHERE id = ?').get(Number(x.medicament_id)) || !(Number(x.quantite) > 0) || !texte(x.posologie))
        erreurs[`prescription_${i}`] = 'Médicament, posologie et quantité requis.';
    const examens = [...new Set(Array.isArray(b.examens) ? b.examens : [])].filter(c => EXAMENS[c]);
    if (Object.keys(erreurs).length) throw new ErreurHttp(400, 'Consultation incomplète.', erreurs);
    const u = req.utilisateur;
    const id = tx(db, () => {
      const cid = Number(db.prepare(`INSERT INTO consultations (visite_id, medecin_id, temperature, ta_sys, ta_dia, pouls, poids, taille, spo2, pb,
          anamnese, examen, diagnostic_code, diagnostic_libelle, conduite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(v.id, u.id, t, nombre(b.ta_sys), nombre(b.ta_dia), nombre(b.pouls), nombre(b.poids), nombre(b.taille), nombre(b.spo2), nombre(b.pb),
          texte(b.anamnese), texte(b.examen), b.diagnostic_code, libelleDiagnostic(b.diagnostic_code), texte(b.conduite)).lastInsertRowid);
      for (const x of prescriptions)
        db.prepare('INSERT INTO prescriptions (consultation_id, medicament_id, posologie, quantite) VALUES (?, ?, ?, ?)').run(cid, Number(x.medicament_id), texte(x.posologie, 120), Math.round(Number(x.quantite)));
      for (const c of examens) {
        db.prepare('INSERT INTO examens (visite_id, consultation_id, code) VALUES (?, ?, ?)').run(v.id, cid, c);
        facturerExamen(db, v.id, c);
      }
      const statut = issue === 'HOSPITALISATION' ? 'HOSPITALISE' : 'TERMINEE';
      db.prepare(`UPDATE visites SET statut = ?, issue = ?, debut_prise_en_charge = COALESCE(debut_prise_en_charge, datetime('now')),
        fin = CASE WHEN ? = 'TERMINEE' THEN datetime('now') END WHERE id = ?`).run(statut, issue, statut, v.id);
      // Le diagnostic peut ouvrir une gratuité (grossesse) : la facture est recalculée.
      for (const f of db.prepare("SELECT id FROM factures WHERE visite_id = ? AND statut IN ('A_PAYER','PRISE_EN_CHARGE')").all(v.id)) recalculer(db, f.id);
      journaliser(db, u, 'CONSULTATION', 'visites', v.id, { diagnostic: b.diagnostic_code, issue });
      return cid;
    });
    res.status(201).json({ id });
  });

  function visiteDe(req) {
    const v = db.prepare('SELECT * FROM visites WHERE id = ?').get(Number(req.params.id));
    if (!v) throw new ErreurHttp(404, 'Visite introuvable.');
    const p = portee(req.utilisateur);
    if (p && v.etablissement_id !== p) throw new ErreurHttp(403, 'Cette visite relève d’un autre établissement.');
    return v;
  }

  return r;
}
