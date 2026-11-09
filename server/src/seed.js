// Données de référence : établissements pilotes, services, lits, médicaments, seuils de stock et compte administrateur.
// Le pilote du cahier des charges associe un hôpital national, un hôpital provincial et un hôpital de district.
import bcrypt from 'bcryptjs';
import { tx } from './db.js';
import { SERVICES, MEDICAMENTS } from './referentiels.js';

export const ETABLISSEMENTS = [
  { code: 'HGRN', nom: 'Hôpital Général de Référence Nationale', type: 'HN', province: 'N’Djamena', ville: 'N’Djamena' },
  { code: 'HPMDO', nom: 'Hôpital provincial de Moundou', type: 'HP', province: 'Logone Occidental', ville: 'Moundou' },
  { code: 'HDBGR', nom: 'Hôpital de district de Bongor', type: 'HD', province: 'Mayo-Kebbi Est', ville: 'Bongor' },
];
// Nombre de lits par service selon le type d'établissement.
const ECHELLE = { HN: 1.5, HP: 1, HD: 0.6 };

export function seed(db, { adminPassword = process.env.SNGH_ADMIN_PASSWORD || 'ChangezMoi!2026' } = {}) {
  return tx(db, () => {
    const insE = db.prepare('INSERT OR IGNORE INTO etablissements (code, nom, type, province, ville) VALUES (?, ?, ?, ?, ?)');
    for (const e of ETABLISSEMENTS) insE.run(e.code, e.nom, e.type, e.province, e.ville);
    const insS = db.prepare('INSERT OR IGNORE INTO services (etablissement_id, code, nom) VALUES (?, ?, ?)');
    const insL = db.prepare('INSERT OR IGNORE INTO lits (service_id, numero) VALUES (?, ?)');
    for (const e of db.prepare('SELECT * FROM etablissements').all()) {
      for (const s of SERVICES) {
        insS.run(e.id, s.code, s.nom);
        const sid = db.prepare('SELECT id FROM services WHERE etablissement_id = ? AND code = ?').get(e.id, s.code).id;
        const n = Math.max(2, Math.round(s.lits * (ECHELLE[e.type] || 1)));
        for (let i = 1; i <= n; i++) insL.run(sid, `${s.code}-${String(i).padStart(2, '0')}`);
      }
    }
    const insM = db.prepare('INSERT OR IGNORE INTO medicaments (code, dci, forme, dosage, prix, programme) VALUES (?, ?, ?, ?, ?, ?)');
    for (const m of MEDICAMENTS) insM.run(...m);
    const insSeuil = db.prepare('INSERT OR IGNORE INTO seuils (etablissement_id, medicament_id, seuil) VALUES (?, ?, ?)');
    for (const e of db.prepare('SELECT id, type FROM etablissements').all())
      for (const m of db.prepare('SELECT id, forme FROM medicaments').all())
        insSeuil.run(e.id, m.id, Math.round((['comprimé', 'gélule'].includes(m.forme) ? 300 : 40) * (ECHELLE[e.type] || 1)));
    if (!db.prepare("SELECT 1 FROM utilisateurs WHERE login = 'admin'").get())
      db.prepare("INSERT INTO utilisateurs (nom, login, mot_de_passe, role) VALUES ('Administrateur système', 'admin', ?, 'admin')")
        .run(bcrypt.hashSync(adminPassword, 10));
  });
}
