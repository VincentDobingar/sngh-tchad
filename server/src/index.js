import { openDb } from './db.js';
import { seed } from './seed.js';
import { creerApp } from './app.js';
import { genererDemo } from './donnees-demo.js';

const env = process.env;
const demo = process.argv.includes('--demo');
// En ligne, pas de mot de passe par défaut : le serveur refuse de démarrer sans les variables nécessaires.
if (env.NODE_ENV === 'production' && !demo) {
  const manque = [];
  if (!env.SNGH_ADMIN_PASSWORD || env.SNGH_ADMIN_PASSWORD.length < 10) manque.push('SNGH_ADMIN_PASSWORD (10 caractères au moins)');
  if (env.SNGH_DONNEES_DEMO === '1' && (!env.SNGH_DEMO_PASSWORD || env.SNGH_DEMO_PASSWORD.length < 10)) manque.push('SNGH_DEMO_PASSWORD (10 caractères au moins)');
  if (manque.length) { console.error('Démarrage refusé, variables manquantes : ' + manque.join(', ')); process.exit(1); }
}
const db = openDb(demo ? 'data/demo.db' : undefined);
seed(db);
if (!demo && !env.SNGH_ADMIN_PASSWORD) console.warn('Attention : mot de passe administrateur par défaut. Changez-le avant tout déploiement.');
// Démonstration : activité FICTIVE générée au premier démarrage, sur une base sans aucune visite.
if ((demo || env.SNGH_DONNEES_DEMO === '1') && !db.prepare('SELECT 1 FROM visites LIMIT 1').get()) {
  const r = genererDemo(db, demo ? 'demo1234' : env.SNGH_DEMO_PASSWORD || 'demo1234');
  console.log(`Données de démonstration FICTIVES générées : ${r.patients} patients, ${r.visites} visites.`);
}
const port = Number(env.PORT) || 3000;
creerApp(db).listen(port, () => console.log(`SNGH Tchad (prototype) démarré sur http://localhost:${port}`));
