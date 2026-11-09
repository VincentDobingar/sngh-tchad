// Référentiels du prototype : provinces, services, diagnostics CIM-10 fréquents, catalogue d'examens,
// médicaments essentiels, tarifs, maladies à potentiel épidémique (SIMR) et règles de gratuité ciblée.
// Les tarifs et seuils sont ILLUSTRATIFS : ils seront arrêtés par le Ministère pendant le cadrage.

export const PROVINCES = ['Barh El Gazel', 'Batha', 'Borkou', 'Chari-Baguirmi', 'Ennedi-Est', 'Ennedi-Ouest', 'Guéra', 'Hadjer-Lamis', 'Kanem', 'Lac',
  'Logone Occidental', 'Logone Oriental', 'Mandoul', 'Mayo-Kebbi Est', 'Mayo-Kebbi Ouest', 'Moyen-Chari', 'N’Djamena', 'Ouaddaï', 'Salamat', 'Sila',
  'Tandjilé', 'Tibesti', 'Wadi Fira'];

export const TYPES_ETABLISSEMENT = { HN: 'Hôpital national', HP: 'Hôpital provincial', HD: 'Hôpital de district' };

export const SERVICES = [
  { code: 'URG', nom: 'Urgences', lits: 6 },
  { code: 'MED', nom: 'Médecine générale', lits: 12 },
  { code: 'PED', nom: 'Pédiatrie', lits: 10 },
  { code: 'MAT', nom: 'Maternité', lits: 8 },
  { code: 'CHI', nom: 'Chirurgie', lits: 8 },
];

export const TRIAGE = { ROUGE: 'Urgence absolue', ORANGE: 'Très urgent', JAUNE: 'Urgent', VERT: 'Non urgent' };

// Diagnostics fréquents (liste courte), codes CIM-10.
export const DIAGNOSTICS = [
  ['B54', 'Paludisme simple'], ['B50.0', 'Paludisme grave à P. falciparum'], ['A09', 'Diarrhée et gastro-entérite infectieuse'],
  ['J06.9', 'Infection respiratoire aiguë haute'], ['J18.9', 'Pneumopathie'], ['E43', 'Malnutrition aiguë sévère'], ['E44.0', 'Malnutrition aiguë modérée'],
  ['A01.0', 'Fièvre typhoïde'], ['N39.0', 'Infection urinaire'], ['D50.9', 'Anémie ferriprive'], ['D57.1', 'Drépanocytose'],
  ['I10', 'Hypertension artérielle'], ['E11.9', 'Diabète de type 2'], ['Z34.9', 'Surveillance de grossesse normale'], ['O80', 'Accouchement normal'],
  ['O14.1', 'Pré-éclampsie sévère'], ['K35.8', 'Appendicite aiguë'], ['S06.9', 'Traumatisme crânien'], ['T14.9', 'Traumatisme, autre'],
  ['A15.0', 'Tuberculose pulmonaire'], ['B20', 'Infection à VIH'], ['R50.9', 'Fièvre sans précision'],
  ['A90', 'Dengue'], ['A00.9', 'Choléra'], ['B05.9', 'Rougeole'], ['A39.0', 'Méningite à méningocoque'], ['A98.4', 'Fièvre hémorragique (Ebola) suspecte'],
];
export const libelleDiagnostic = code => DIAGNOSTICS.find(d => d[0] === code)?.[1];

// Maladies à potentiel épidémique (SIMR) : alerte quand le nombre de cas sur 7 jours dans un établissement atteint le seuil.
export const MPE = {
  'A00.9': { maladie: 'Choléra', seuil: 1 },
  'B05.9': { maladie: 'Rougeole', seuil: 1 },
  'A39.0': { maladie: 'Méningite', seuil: 2 },
  'A98.4': { maladie: 'Fièvre hémorragique', seuil: 1 },
  'A90':   { maladie: 'Dengue', seuil: 5 },
};

// Catalogue d'examens : résultat qualitatif (liste) ou numérique (unité, normales, seuils critiques).
export const EXAMENS = {
  GE:    { libelle: 'Goutte épaisse (paludisme)', prix: 1000, choix: ['Négatif', 'Positif +', 'Positif ++', 'Positif +++'] },
  TDRP:  { libelle: 'TDR paludisme', prix: 500, choix: ['Négatif', 'Positif'] },
  HB:    { libelle: 'Hémoglobine', prix: 1500, unite: 'g/dL', min: 11, max: 16, critiqueMin: 7 },
  GLY:   { libelle: 'Glycémie', prix: 1000, unite: 'g/L', min: 0.7, max: 1.1, critiqueMin: 0.5, critiqueMax: 3 },
  CREA:  { libelle: 'Créatinine', prix: 2500, unite: 'mg/L', min: 6, max: 12, critiqueMax: 40 },
  WIDAL: { libelle: 'Sérodiagnostic de Widal', prix: 2000, choix: ['Négatif', 'Positif'] },
  ECBU:  { libelle: 'Examen cytobactériologique des urines', prix: 3000, choix: ['Stérile', 'Infection'] },
  GRS:   { libelle: 'Groupage sanguin ABO-Rhésus', prix: 2000, choix: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  VIH:   { libelle: 'Test VIH (programme)', prix: 0, choix: ['Négatif', 'Positif'] },
  NS1:   { libelle: 'TDR dengue NS1', prix: 2000, choix: ['Négatif', 'Positif'] },
};
// Un résultat qualitatif est anormal s'il n'est pas le premier de la liste (ou « Stérile » / groupe sanguin, jamais anormaux).
export function interpreter(code, resultat) {
  const e = EXAMENS[code];
  if (!e) return { anormal: 0, critique: 0 };
  if (e.choix) {
    if (code === 'GRS') return { anormal: 0, critique: 0 };
    return { anormal: resultat !== e.choix[0] ? 1 : 0, critique: 0 };
  }
  const v = Number(String(resultat).replace(',', '.'));
  if (!Number.isFinite(v)) return { anormal: 0, critique: 0 };
  const critique = (e.critiqueMin != null && v < e.critiqueMin) || (e.critiqueMax != null && v > e.critiqueMax);
  return { anormal: v < e.min || v > e.max ? 1 : 0, critique: critique ? 1 : 0 };
}

// Médicaments essentiels (extrait). « programme » : intrant gratuit (paludisme, nutrition…), non facturé.
export const MEDICAMENTS = [
  ['ALU', 'Artéméther-Luméfantrine', 'comprimé', '20/120 mg', 0, 'PALU'],
  ['ARTS', 'Artésunate', 'injectable', '60 mg', 0, 'PALU'],
  ['PARA', 'Paracétamol', 'comprimé', '500 mg', 25, null],
  ['AMOX', 'Amoxicilline', 'gélule', '500 mg', 50, null],
  ['COTRI', 'Cotrimoxazole', 'comprimé', '480 mg', 30, null],
  ['SRO', 'Sels de réhydratation orale', 'sachet', '20,5 g/L', 100, null],
  ['ZINC', 'Zinc', 'comprimé', '20 mg', 25, null],
  ['METRO', 'Métronidazole', 'comprimé', '250 mg', 25, null],
  ['CEFT', 'Ceftriaxone', 'injectable', '1 g', 800, null],
  ['RL', 'Ringer lactate', 'perfusion', '500 ml', 1000, null],
  ['SG5', 'Sérum glucosé 5 %', 'perfusion', '500 ml', 800, null],
  ['FAF', 'Fer + acide folique', 'comprimé', '200/0,4 mg', 15, null],
  ['IBU', 'Ibuprofène', 'comprimé', '400 mg', 40, null],
  ['AMLO', 'Amlodipine', 'comprimé', '5 mg', 50, null],
  ['METF', 'Metformine', 'comprimé', '500 mg', 40, null],
  ['OCYT', 'Ocytocine', 'injectable', '10 UI', 500, null],
  ['MGSO4', 'Sulfate de magnésium', 'injectable', '5 g', 1500, null],
  ['ATPE', 'Aliment thérapeutique prêt à l’emploi', 'sachet', '92 g', 0, 'NUT'],
  ['ALB', 'Albendazole', 'comprimé', '400 mg', 100, null],
  ['DIAZ', 'Diazépam', 'injectable', '10 mg', 300, null],
];

// Tarifs des actes par type d'établissement (FCFA).
export const TARIFS = {
  CONSULTATION: { HN: 2000, HP: 1500, HD: 1000 },
  URGENCE:      { HN: 3000, HP: 2500, HD: 2000 },
  JOURNEE:      { HN: 3000, HP: 2500, HD: 2000 },
};

export const MODES_PAIEMENT = { ESPECES: 'Espèces', AIRTEL_MONEY: 'Airtel Money', MOOV_MONEY: 'Moov Money', TIERS_PAYANT: 'Tiers payant' };
export const CATEGORIES = { PAYANT: 'Payant', GRATUITE: 'Gratuité ciblée', ASSURE: 'Assuré (tiers payant 80 %)', INDIGENT: 'Indigent (validé par le service social)' };

// Âge en années (décimal) à une date donnée.
export const ageAns = (dateNaissance, le = new Date()) =>
  dateNaissance ? (new Date(le) - new Date(dateNaissance)) / (365.25 * 864e5) : null;

// Gratuité ciblée selon la politique nationale (illustrative) : enfants de moins de 5 ans, femmes enceintes
// (maternité, CPN, accouchement), urgences. Renvoie le taux pris en charge et le motif.
export function priseEnCharge(patient, visite, serviceCode, diagnosticCode) {
  const age = ageAns(patient.date_naissance, visite.arrivee);
  if (age != null && age < 5) return { taux: 1, motif: 'Gratuité ciblée : enfant de moins de 5 ans' };
  if (serviceCode === 'MAT' || /^(Z34|O)/.test(diagnosticCode || '')) return { taux: 1, motif: 'Gratuité ciblée : femme enceinte' };
  if (visite.type === 'URGENCE') return { taux: 1, motif: 'Gratuité ciblée : urgence' };
  if (patient.categorie === 'INDIGENT') return { taux: 1, motif: 'Indigent validé par le service social' };
  if (patient.categorie === 'ASSURE') return { taux: 0.8, motif: `Tiers payant ${patient.assureur || 'assurance'} (80 %)` };
  return { taux: 0, motif: null };
}

// Clé de recherche tolérante : minuscules, sans accents ni ponctuation, avec simplifications fréquentes
// des translittérations (ou/w, ch/sh, dj/j, doubles lettres, h muet, « el »/« al »).
export function cleRecherche(texte) {
  return String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’`-]/g, ' ').replace(/[^a-z ]/g, '')
    .replace(/\b(al|el)\s+/g, 'al')
    .replace(/ou/g, 'u').replace(/w/g, 'u').replace(/sh/g, 'ch').replace(/dj/g, 'j').replace(/kh/g, 'k').replace(/q/g, 'k')
    .replace(/y/g, 'i').replace(/ph/g, 'f').replace(/h/g, '').replace(/(.)\1+/g, '$1').replace(/e\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

// IPUN illustratif : TD-AAAA-NNNNNNN-C (année d'enregistrement, numéro séquentiel, clé de contrôle mod 11).
export function genererIpun(id, annee = new Date().getFullYear()) {
  const n = String(id).padStart(7, '0');
  const somme = [...n].reduce((s, c, i) => s + Number(c) * (i + 2), 0);
  return `TD-${annee}-${n}-${somme % 11 === 10 ? 'X' : somme % 11}`;
}
