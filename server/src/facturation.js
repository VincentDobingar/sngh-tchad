// Facturation : une facture ouverte par visite, alimentée au fil du parcours (acte à l'admission, examens à la
// prescription, médicaments à la dispensation, journées à la sortie). Une facture payée n'est jamais modifiée :
// tout ajout ultérieur ouvre une facture complémentaire. Aucune suppression : l'annulation est tracée.
import { priseEnCharge, TARIFS, EXAMENS } from './referentiels.js';

function factureOuverte(db, visiteId) {
  const f = db.prepare("SELECT * FROM factures WHERE visite_id = ? AND statut IN ('A_PAYER','PRISE_EN_CHARGE') ORDER BY id DESC LIMIT 1").get(visiteId);
  if (f) return f;
  const v = db.prepare('SELECT * FROM visites WHERE id = ?').get(visiteId);
  const id = Number(db.prepare('INSERT INTO factures (visite_id, etablissement_id, cree_le) VALUES (?, ?, ?)').run(visiteId, v.etablissement_id, v.arrivee).lastInsertRowid);
  const e = db.prepare('SELECT code FROM etablissements WHERE id = ?').get(v.etablissement_id);
  db.prepare('UPDATE factures SET numero = ? WHERE id = ?').run(`F-${e.code}-${String(id).padStart(7, '0')}`, id);
  return db.prepare('SELECT * FROM factures WHERE id = ?').get(id);
}

// Recalcule total, part prise en charge et reste à payer selon la catégorie du patient et la gratuité ciblée.
export function recalculer(db, factureId) {
  const f = db.prepare('SELECT * FROM factures WHERE id = ?').get(factureId);
  const v = db.prepare('SELECT v.*, s.code AS service_code FROM visites v JOIN services s ON s.id = v.service_id WHERE v.id = ?').get(f.visite_id);
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(v.patient_id);
  const diag = db.prepare('SELECT diagnostic_code FROM consultations WHERE visite_id = ? ORDER BY id DESC LIMIT 1').get(v.id)?.diagnostic_code;
  const total = db.prepare('SELECT COALESCE(SUM(montant), 0) t FROM lignes_facture WHERE facture_id = ?').get(factureId).t;
  const { taux, motif } = priseEnCharge(p, v, v.service_code, diag);
  const pec = Math.round(total * taux);
  const statut = total > 0 && pec >= total ? 'PRISE_EN_CHARGE' : 'A_PAYER';
  db.prepare('UPDATE factures SET total = ?, prise_en_charge = ?, motif_prise_en_charge = ?, a_payer = ?, statut = ? WHERE id = ?')
    .run(total, pec, taux ? motif : null, total - pec, statut, factureId);
}

export function ajouterLigne(db, visiteId, nature, libelle, quantite, prixUnitaire) {
  const f = factureOuverte(db, visiteId);
  db.prepare('INSERT INTO lignes_facture (facture_id, nature, libelle, quantite, prix_unitaire, montant) VALUES (?, ?, ?, ?, ?, ?)')
    .run(f.id, nature, libelle, quantite, prixUnitaire, quantite * prixUnitaire);
  recalculer(db, f.id);
  return f.id;
}

export const typeEtablissement = (db, visiteId) =>
  db.prepare('SELECT e.type FROM visites v JOIN etablissements e ON e.id = v.etablissement_id WHERE v.id = ?').get(visiteId).type;

export function facturerActe(db, visiteId, typeVisite) {
  const t = typeEtablissement(db, visiteId);
  const cle = typeVisite === 'URGENCE' ? 'URGENCE' : 'CONSULTATION';
  return ajouterLigne(db, visiteId, 'ACTE', typeVisite === 'URGENCE' ? 'Prise en charge aux urgences' : 'Consultation', 1, TARIFS[cle][t]);
}
export const facturerExamen = (db, visiteId, code) => ajouterLigne(db, visiteId, 'EXAMEN', EXAMENS[code].libelle, 1, EXAMENS[code].prix);
export function facturerJournees(db, visiteId, jours) {
  const t = typeEtablissement(db, visiteId);
  return ajouterLigne(db, visiteId, 'SEJOUR', 'Journée d’hospitalisation', Math.max(1, jours), TARIFS.JOURNEE[t]);
}
