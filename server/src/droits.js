// Matrice des droits par rôle (RBAC) : source unique, partagée par le serveur et l'interface.
// Chacun ne fait que son métier : l'accueil n'écrit pas dans le dossier médical, le médecin n'encaisse pas,
// la caisse ne voit pas le contenu médical, le laboratoire seul saisit et valide les résultats.
export const ROLES = {
  admin: 'Administrateur système',
  decideur: 'Décideur central (Ministère)',
  directeur: 'Directeur d’hôpital',
  accueil: 'Agent d’accueil',
  medecin: 'Médecin',
  infirmier: 'Infirmier',
  laborantin: 'Laborantin',
  pharmacien: 'Pharmacien',
  caissier: 'Caissier',
};
// Rôles rattachés à un établissement : ils ne voient que ses données.
export const ROLES_ETABLISSEMENT = ['directeur', 'accueil', 'medecin', 'infirmier', 'laborantin', 'pharmacien', 'caissier'];

export const DROITS = {
  admettre:      { roles: ['accueil'],                            libelle: 'enregistrer un patient et ouvrir une visite' },
  rechercher:    { roles: ['accueil', 'medecin', 'infirmier', 'caissier'], libelle: 'rechercher un patient' },
  dossier:       { roles: ['medecin', 'infirmier'],               libelle: 'consulter le dossier médical' },
  consulter:     { roles: ['medecin'],                            libelle: 'consulter, prescrire, demander des examens' },
  lits:          { roles: ['medecin', 'infirmier', 'directeur'],  libelle: 'gérer les lits et hospitalisations' },
  laboratoire:   { roles: ['laborantin'],                         libelle: 'saisir et valider les résultats' },
  pharmacie:     { roles: ['pharmacien'],                         libelle: 'dispenser et gérer les stocks' },
  caisse:        { roles: ['caissier'],                           libelle: 'encaisser et annuler une facture' },
  tableauEtab:   { roles: ['directeur', 'decideur', 'admin'],     libelle: 'voir le tableau de bord d’un établissement' },
  tableauNational:{ roles: ['decideur', 'admin'],                 libelle: 'voir le tableau de bord national' },
  surveillance:  { roles: ['decideur', 'directeur', 'medecin', 'admin'], libelle: 'voir les alertes épidémiologiques' },
  administrer:   { roles: ['admin'],                              libelle: 'gérer les comptes et le paramétrage' },
};

export const peut = (role, droit) => !!DROITS[droit]?.roles.includes(role);
