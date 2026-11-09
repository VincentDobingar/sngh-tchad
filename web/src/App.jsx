import React, { useEffect, useState, createContext, useContext } from 'react';
import { api, session } from './api.js';
import { ROLES } from './droits.js';
import { t, traduireRef, abonner, langueCourante } from './i18n/index.js';
import SelecteurLangue from './components/SelecteurLangue.jsx';
import Connexion from './pages/Connexion.jsx';
import Accueil from './pages/Accueil.jsx';
import FileAttente from './pages/FileAttente.jsx';
import Patients from './pages/Patients.jsx';
import Laboratoire from './pages/Laboratoire.jsx';
import Pharmacie from './pages/Pharmacie.jsx';
import Caisse from './pages/Caisse.jsx';
import Lits from './pages/Lits.jsx';
import Tableau from './pages/Tableau.jsx';
import National from './pages/National.jsx';
import Surveillance from './pages/Surveillance.jsx';
import Rapport from './pages/Rapport.jsx';
import Admin from './pages/Admin.jsx';
import Carte from './pages/Carte.jsx';
import VerifierRecu from './pages/VerifierRecu.jsx';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Pages par profil : la première est la page d'accueil du profil.
const PAGES = [
  { id: 'national', titre: 'Vue nationale', roles: ['decideur', 'admin'], C: National },
  { id: 'tableau', titre: 'Tableau de bord', roles: ['directeur', 'decideur', 'admin'], C: Tableau },
  { id: 'carte', titre: 'Carte sanitaire', roles: ['decideur', 'directeur', 'admin'], C: Carte },
  { id: 'accueil', titre: 'Accueil et admission', roles: ['accueil'], C: Accueil },
  { id: 'file', titre: 'File d’attente', roles: ['medecin', 'infirmier'], C: FileAttente },
  { id: 'lits', titre: 'Lits', roles: ['infirmier', 'medecin', 'directeur'], C: Lits },
  { id: 'patients', titre: 'Dossiers patients', roles: ['medecin', 'infirmier'], C: Patients },
  { id: 'labo', titre: 'Laboratoire', roles: ['laborantin'], C: Laboratoire },
  { id: 'pharmacie', titre: 'Pharmacie', roles: ['pharmacien', 'directeur'], C: Pharmacie },
  { id: 'caisse', titre: 'Caisse', roles: ['caissier'], C: Caisse },
  { id: 'surveillance', titre: 'Surveillance', roles: ['decideur', 'directeur', 'medecin', 'admin'], C: Surveillance },
  { id: 'rapport', titre: 'Rapport SNIS', roles: ['directeur', 'decideur', 'admin'], C: Rapport },
  { id: 'admin', titre: 'Administration', roles: ['admin'], C: Admin },
];
// Le profil infirmier commence par les lits.
const ORDRE = { infirmier: ['lits', 'file', 'patients'] };

export default function App() {
  const [s, setS] = useState(session.lire());
  const [ref, setRef] = useState(null);
  const [page, setPage] = useState(() => location.hash.slice(1).split('/')[0]);
  const [param, setParam] = useState(() => location.hash.split('/')[1] || null);
  const [langue, setLangue] = useState(langueCourante());
  useEffect(() => abonner(setLangue), []);

  useEffect(() => {
    const deco = () => setS(null);
    const hash = () => { setPage(location.hash.slice(1).split('/')[0]); setParam(location.hash.split('/')[1] || null); };
    window.addEventListener('sngh:deconnexion', deco);
    window.addEventListener('hashchange', hash);
    return () => { window.removeEventListener('sngh:deconnexion', deco); window.removeEventListener('hashchange', hash); };
  }, []);
  useEffect(() => { if (s) api('GET', '/referentiels').then(setRef).catch(() => {}); }, [s]);
  const refT = React.useMemo(() => traduireRef(ref), [ref, langue]);

  // Vérification publique d'un reçu (code QR) : accessible sans connexion.
  if (page === 'verifier') return <VerifierRecu key={langue} numero={param} />;
  if (!s) return <Connexion key={langue} onConnecte={x => { session.ecrire(x); setS(x); }} />;
  const u = s.utilisateur;
  let pages = PAGES.filter(p => p.roles.includes(u.role));
  if (ORDRE[u.role]) pages = ORDRE[u.role].map(id => pages.find(p => p.id === id)).concat(pages.filter(p => !ORDRE[u.role].includes(p.id)));
  const courante = pages.find(p => p.id === page) || pages[0];
  const aller = (id, p) => { location.hash = p ? `${id}/${p}` : id; };
  const etab = refT?.etablissements.find(e => e.id === u.etablissement_id);

  return (
    <Ctx.Provider value={{ u, ref: refT, aller, param, etab, langue }}>
      <header className="entete">
        <div className="marque">
          <img src="/logo-sngh-blanc.svg" alt={t("SNGH")} />
          <span>{etab ? etab.nom : t('Ministère de la Santé Publique')}</span>
        </div>
        <nav>{pages.map(p => <button key={p.id} className={p.id === courante.id ? 'actif' : ''} onClick={() => aller(p.id)}>{t(p.titre)}</button>)}</nav>
        <div className="profil">
          <span className="qui">{t(u.nom)}<small>{t(ROLES[u.role])}</small></span>
          <SelecteurLangue sombre />
          <button className="lien" onClick={() => { session.effacer(); setS(null); }}>{t("Déconnexion")}</button>
        </div>
      </header>
      <div className="bandeau-demo">{t("Prototype de démonstration · données entièrement fictives")}</div>
      <main className="contenu">
        {!refT ? <p className="info">{t("Chargement des référentiels…")}</p> : <courante.C key={courante.id + langue} />}
      </main>
      <footer className="pied">{t('SNGH Tchad · Système National de Gestion Hospitalière · prototype {annee}', { annee: new Date().getFullYear() })}</footer>
    </Ctx.Provider>
  );
}
