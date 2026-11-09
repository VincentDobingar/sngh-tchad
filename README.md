# SNGH Tchad · prototype de démonstration

Prototype du **Système National de Gestion Hospitalière** du Ministère de la Santé Publique et de la Prévention (République du Tchad), conforme dans ses grandes lignes au cahier des charges SNGH. Il montre le parcours complet d’un patient dans trois hôpitaux pilotes et le pilotage national. **Toutes les données sont fictives.**

Éditeur : Digital Business Services Africa. Même socle technique que SENTINELLE Dengue (Node 22, SQLite, Express, React).

## Ce que montre le prototype

| Module du cahier des charges | Dans le prototype |
|---|---|
| M01 Identification et admission | Recherche tolérante aux variantes d’orthographe (Mahamat / Mahammat, Achta / Ashta), IPUN avec clé de contrôle, âge estimé, détection des doublons, ticket de file d’attente, carte patient avec QR code |
| M02 Dossier patient informatisé | Historique chronologique, constantes, diagnostics CIM-10, ordonnances, résultats validés, hospitalisations ; chaque accès est tracé |
| M03 / M04 Consultations et urgences | File d’attente par gravité (triage rouge, orange, jaune, vert) puis par arrivée, consultation complète, orientation |
| M05 Hospitalisation et lits | Cartographie des lits en temps réel, admission, sortie, nettoyage, hors service, journées facturées |
| M09 Laboratoire | Prélèvement, saisie, valeurs normales et critiques, **double validation** par un second biologiste |
| M12 Pharmacie et stocks | Ordonnances à servir, sortie **FEFO**, lots et péremptions, CMM, mois de stock, alertes, réception CPA, intrants de programme gratuits |
| M14 Facturation et caisse | Facture alimentée par le parcours, **gratuités ciblées automatiques** (moins de 5 ans, grossesse, urgences), espèces, Airtel Money, Moov Money, tiers payant, reçu, clôture du jour, annulation motivée (jamais de suppression) |
| M17 Rapports SNIS | Rapport mensuel généré automatiquement (âge, sexe, morbidité), export CSV avant intégration DHIS2 |
| M18 Tableaux de bord | Établissement, ensemble des établissements, vue nationale par province |
| M19 Surveillance | Maladies à potentiel épidémique déclarées automatiquement depuis les diagnostics, seuils d’alerte, liste linéaire sans nom |
| M20 Administration | Comptes, rôles (RBAC), suspension, journal d’audit, matrice des droits |

Profils : administrateur système, décideur central, directeur d’hôpital, accueil, médecin, infirmier, laborantin, pharmacien, caissier. Chacun ne voit que son métier et son établissement (matrice unique : `server/src/droits.js`).

## Démarrer en local

```
npm run install:all
npm run demo        # compile l’interface puis démarre sur http://localhost:3000 avec les données fictives
```

Comptes de démonstration : `decideur.minsante`, puis pour chaque hôpital (`hgrn`, `hpmdo`, `hdbgr`) : `directeur.`, `accueil.`, `medecin.`, `infirmier.`, `labo.`, `bio.`, `pharma.`, `caisse.` suivis du code (ex. `medecin.hgrn`). Mot de passe local : `demo1234`. Compte `admin` : `ChangezMoi!2026` en local.

Tests : `npm test` (parcours complet, droits, doublons, double validation, FEFO, gratuité, annulation, lits, cohérence des données de démonstration).

## Mise en ligne

Interface sur Vercel, serveur sur Railway : voir [DEPLOIEMENT.md](DEPLOIEMENT.md).

## Limites du prototype

Tarifs, seuils d’alerte, format de l’IPUN et règles de gratuité sont illustratifs et seront arrêtés pendant le cadrage. Ne sont pas couverts : interface DHIS2 réelle, automates de laboratoire (HL7/ASTM), PACS, banque de sang, bloc opératoire, RH, comptabilité, applications mobiles, fonctionnement hors ligne et synchronisation, chiffrement et sauvegardes de production.
