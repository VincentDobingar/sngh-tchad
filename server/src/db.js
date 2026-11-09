// Base SQLite du SNGH (prototype) : établissements, patients, parcours de soins, plateau technique,
// pharmacie, caisse et journal d'audit. Une seule base pour tous les établissements : chaque ligne porte son établissement.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS etablissements (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  type TEXT NOT NULL,              -- HN (hôpital national), HP (hôpital provincial), HD (hôpital de district)
  province TEXT NOT NULL,
  ville TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  etablissement_id INTEGER NOT NULL REFERENCES etablissements(id),
  code TEXT NOT NULL,
  nom TEXT NOT NULL,
  UNIQUE (etablissement_id, code)
);
CREATE TABLE IF NOT EXISTS lits (
  id INTEGER PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id),
  numero TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'LIBRE' CHECK (statut IN ('LIBRE','OCCUPE','NETTOYAGE','HORS_SERVICE')),
  UNIQUE (service_id, numero)
);
CREATE TABLE IF NOT EXISTS utilisateurs (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  mot_de_passe TEXT NOT NULL,
  role TEXT NOT NULL,
  etablissement_id INTEGER REFERENCES etablissements(id),
  actif INTEGER NOT NULL DEFAULT 1,
  derniere_connexion TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  ipun TEXT UNIQUE,                 -- Identifiant Patient Unique National
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  cle_recherche TEXT NOT NULL,      -- nom et prénom normalisés (sans accents, phonétique simplifiée)
  sexe TEXT NOT NULL CHECK (sexe IN ('F','M')),
  date_naissance TEXT,
  age_estime INTEGER NOT NULL DEFAULT 0,
  telephone TEXT,
  nom_pere TEXT,
  nom_mere TEXT,
  adresse TEXT,
  province TEXT,
  categorie TEXT NOT NULL DEFAULT 'PAYANT' CHECK (categorie IN ('PAYANT','GRATUITE','ASSURE','INDIGENT')),
  assureur TEXT,
  allergies TEXT,
  antecedents TEXT,
  groupe_sanguin TEXT,
  non_identifie INTEGER NOT NULL DEFAULT 0,
  etablissement_id INTEGER REFERENCES etablissements(id),
  cree_par INTEGER REFERENCES utilisateurs(id),
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patients_cle ON patients(cle_recherche);
CREATE INDEX IF NOT EXISTS idx_patients_tel ON patients(telephone);

-- Une visite = un passage du patient dans un établissement (consultation, urgence ou hospitalisation).
CREATE TABLE IF NOT EXISTS visites (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  etablissement_id INTEGER NOT NULL REFERENCES etablissements(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  type TEXT NOT NULL CHECK (type IN ('CONSULTATION','URGENCE')),
  ticket TEXT NOT NULL,
  triage TEXT CHECK (triage IN ('ROUGE','ORANGE','JAUNE','VERT')),
  motif TEXT,
  statut TEXT NOT NULL DEFAULT 'ATTENTE' CHECK (statut IN ('ATTENTE','EN_COURS','HOSPITALISE','TERMINEE')),
  issue TEXT CHECK (issue IN ('SORTIE','HOSPITALISATION','TRANSFERT','DECES','CONTRE_AVIS')),
  arrivee TEXT NOT NULL DEFAULT (datetime('now')),
  debut_prise_en_charge TEXT,
  fin TEXT,
  cree_par INTEGER REFERENCES utilisateurs(id)
);
CREATE INDEX IF NOT EXISTS idx_visites_etab ON visites(etablissement_id, arrivee);
CREATE INDEX IF NOT EXISTS idx_visites_patient ON visites(patient_id);

CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY,
  visite_id INTEGER NOT NULL REFERENCES visites(id),
  medecin_id INTEGER REFERENCES utilisateurs(id),
  temperature REAL, ta_sys INTEGER, ta_dia INTEGER, pouls INTEGER, poids REAL, taille REAL, spo2 INTEGER, pb INTEGER,
  anamnese TEXT,
  examen TEXT,
  diagnostic_code TEXT,             -- CIM-10
  diagnostic_libelle TEXT,
  conduite TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_consult_visite ON consultations(visite_id);
CREATE INDEX IF NOT EXISTS idx_consult_diag ON consultations(diagnostic_code);

CREATE TABLE IF NOT EXISTS medicaments (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  dci TEXT NOT NULL,
  forme TEXT NOT NULL,
  dosage TEXT NOT NULL,
  prix INTEGER NOT NULL,            -- FCFA par unité de dispensation
  programme TEXT                    -- intrant de programme gratuit (PALU, VIH, TB, NUT) ou NULL
);
CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY,
  etablissement_id INTEGER NOT NULL REFERENCES etablissements(id),
  medicament_id INTEGER NOT NULL REFERENCES medicaments(id),
  numero TEXT NOT NULL,
  peremption TEXT NOT NULL,
  quantite INTEGER NOT NULL CHECK (quantite >= 0),
  recu_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lots ON lots(etablissement_id, medicament_id, peremption);
CREATE TABLE IF NOT EXISTS seuils (
  etablissement_id INTEGER NOT NULL REFERENCES etablissements(id),
  medicament_id INTEGER NOT NULL REFERENCES medicaments(id),
  seuil INTEGER NOT NULL,
  PRIMARY KEY (etablissement_id, medicament_id)
);
CREATE TABLE IF NOT EXISTS mouvements (
  id INTEGER PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES lots(id),
  type TEXT NOT NULL CHECK (type IN ('RECEPTION','DISPENSATION','AJUSTEMENT')),
  quantite INTEGER NOT NULL,        -- positive en entrée, négative en sortie
  motif TEXT,
  prescription_id INTEGER,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mouvements_le ON mouvements(le);

CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY,
  consultation_id INTEGER NOT NULL REFERENCES consultations(id),
  medicament_id INTEGER NOT NULL REFERENCES medicaments(id),
  posologie TEXT NOT NULL,
  quantite INTEGER NOT NULL CHECK (quantite > 0),
  statut TEXT NOT NULL DEFAULT 'A_DISPENSER' CHECK (statut IN ('A_DISPENSER','DISPENSEE','RUPTURE')),
  dispense_par INTEGER REFERENCES utilisateurs(id),
  dispense_le TEXT
);
CREATE TABLE IF NOT EXISTS examens (
  id INTEGER PRIMARY KEY,
  visite_id INTEGER NOT NULL REFERENCES visites(id),
  consultation_id INTEGER REFERENCES consultations(id),
  code TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'DEMANDE' CHECK (statut IN ('DEMANDE','PRELEVE','SAISI','VALIDE')),
  resultat TEXT,
  anormal INTEGER NOT NULL DEFAULT 0,
  critique INTEGER NOT NULL DEFAULT 0,
  demande_le TEXT NOT NULL DEFAULT (datetime('now')),
  saisi_par INTEGER REFERENCES utilisateurs(id), saisi_le TEXT,
  valide_par INTEGER REFERENCES utilisateurs(id), valide_le TEXT
);
CREATE INDEX IF NOT EXISTS idx_examens_statut ON examens(statut);

CREATE TABLE IF NOT EXISTS sejours (
  id INTEGER PRIMARY KEY,
  visite_id INTEGER NOT NULL REFERENCES visites(id),
  lit_id INTEGER NOT NULL REFERENCES lits(id),
  entree TEXT NOT NULL DEFAULT (datetime('now')),
  sortie TEXT,
  mode_sortie TEXT CHECK (mode_sortie IN ('GUERISON','TRANSFERT','DECES','CONTRE_AVIS'))
);

CREATE TABLE IF NOT EXISTS factures (
  id INTEGER PRIMARY KEY,
  numero TEXT UNIQUE,
  visite_id INTEGER NOT NULL REFERENCES visites(id),
  etablissement_id INTEGER NOT NULL REFERENCES etablissements(id),
  statut TEXT NOT NULL DEFAULT 'A_PAYER' CHECK (statut IN ('A_PAYER','PAYEE','PRISE_EN_CHARGE','ANNULEE')),
  total INTEGER NOT NULL DEFAULT 0,
  prise_en_charge INTEGER NOT NULL DEFAULT 0,
  motif_prise_en_charge TEXT,
  a_payer INTEGER NOT NULL DEFAULT 0,
  mode TEXT CHECK (mode IN ('ESPECES','AIRTEL_MONEY','MOOV_MONEY','TIERS_PAYANT')),
  reference_paiement TEXT,
  caissier_id INTEGER REFERENCES utilisateurs(id),
  payee_le TEXT,
  annulee_par INTEGER REFERENCES utilisateurs(id),
  motif_annulation TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lignes_facture (
  id INTEGER PRIMARY KEY,
  facture_id INTEGER NOT NULL REFERENCES factures(id),
  nature TEXT NOT NULL,             -- ACTE, EXAMEN, MEDICAMENT, SEJOUR
  libelle TEXT NOT NULL,
  quantite INTEGER NOT NULL,
  prix_unitaire INTEGER NOT NULL,
  montant INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY,
  utilisateur_id INTEGER,
  etablissement_id INTEGER,
  action TEXT NOT NULL,
  objet TEXT,
  objet_id INTEGER,
  detail TEXT,
  le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_journal_le ON journal(le);
`;

export function openDb(file = process.env.SNGH_DB || 'data/sngh.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function journaliser(db, u, action, objet, objetId, detail) {
  db.prepare('INSERT INTO journal (utilisateur_id, etablissement_id, action, objet, objet_id, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .run(u?.id ?? null, u?.etablissement_id ?? null, action, objet ?? null, objetId ?? null, detail ? JSON.stringify(detail) : null);
}
