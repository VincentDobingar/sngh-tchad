// Passerelle de paiement mobile money : Airtel Money, Moov Money et Konoom.
// Chaque opérateur a son adaptateur. En démonstration (par défaut), la passerelle est SIMULÉE : aucune somme réelle
// n'est débitée ; le client « valide » quelques secondes après la demande. En production, chaque adaptateur appelle
// l'API marchande de l'opérateur avec les identifiants fournis par contrat (variables d'environnement) et la
// confirmation arrive par notification de l'opérateur (callback), jamais par une simple déclaration de la caisse.
import { randomInt } from 'node:crypto';
import { OPERATEURS } from './referentiels.js';

const DELAI_VALIDATION_MS = 6000; // temps simulé pour que le client saisisse son code secret

export const modePasserelle = () => (process.env.SNGH_PAIEMENT_MODE === 'reel' ? 'reel' : 'simulation');

// Numéro tchadien : +235 suivi de 8 chiffres.
export function normaliserTelephone(t) {
  const c = String(t || '').replace(/\D/g, '').replace(/^00235|^235/, '');
  return /^\d{8}$/.test(c) ? `+235 ${c.slice(0, 2)} ${c.slice(2, 4)} ${c.slice(4, 6)} ${c.slice(6)}` : null;
}

// Demande de paiement envoyée au téléphone du client.
export function demander(operateur, { montant, telephone, reference }) {
  if (!OPERATEURS[operateur]) throw new Error('Opérateur inconnu.');
  if (modePasserelle() === 'reel') throw new Error(`Connexion à l’API ${OPERATEURS[operateur].nom} non configurée (contrat marchand requis).`);
  return { accepte: true, message: `Demande de ${montant} FCFA envoyée au ${telephone} (${OPERATEURS[operateur].nom}, réf. ${reference}).` };
}

// État de la demande. Simulation : validée après quelques secondes ; un numéro se terminant par 00 simule un refus du client.
export function verifier(operateur, paiement) {
  if (paiement.statut !== 'EN_ATTENTE') return null;
  const ecoule = Date.now() - new Date(paiement.cree_le.replace(' ', 'T') + 'Z').getTime();
  if (ecoule > 15 * 60 * 1000) return { statut: 'EXPIRE', motif: 'Délai de validation dépassé (15 min).' };
  if (ecoule < DELAI_VALIDATION_MS) return null;
  if (paiement.telephone.replace(/\D/g, '').endsWith('00')) return { statut: 'ECHEC', motif: 'Paiement refusé par le client ou solde insuffisant.' };
  return { statut: 'CONFIRME', reference: referenceOperateur(operateur) };
}

export const referenceOperateur = operateur => `${OPERATEURS[operateur].prefixe}${new Date().toISOString().slice(2, 10).replace(/-/g, '')}.${randomInt(1000, 9999)}.${randomInt(100000, 999999)}`;
