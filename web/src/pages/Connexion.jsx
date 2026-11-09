import React, { useState } from 'react';
import { api } from '../api.js';

// Comptes de démonstration (identifiants seulement ; le mot de passe est communiqué à part).
const DEMO = [
  ['decideur.minsante', 'Décideur central'], ['directeur.hgrn', 'Directeur'], ['accueil.hgrn', 'Accueil'], ['medecin.hgrn', 'Médecin'],
  ['infirmier.hgrn', 'Infirmier'], ['labo.hgrn', 'Laborantin'], ['bio.hgrn', 'Biologiste'], ['pharma.hgrn', 'Pharmacien'], ['caisse.hgrn', 'Caissier'],
];

export default function Connexion({ onConnecte }) {
  const [login, setLogin] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(false);
  const envoyer = async e => {
    e.preventDefault();
    setErreur(''); setAttente(true);
    try { onConnecte(await api('POST', '/auth/connexion', { login: login.trim(), mot_de_passe: mdp })); }
    catch (err) { setErreur(err.message); }
    finally { setAttente(false); }
  };
  return (
    <div className="page-connexion">
      <div className="connexion-bloc">
        <form className="carte connexion" onSubmit={envoyer}>
          <img src="/logo-sngh.svg" alt="" className="logo" />
          <h1 className="masque">SNGH Tchad</h1>
          <p className="sous">Système National de Gestion Hospitalière<br />Ministère de la Santé Publique et de la Prévention</p>
          <label>Identifiant<input value={login} onChange={e => setLogin(e.target.value)} autoComplete="username" autoFocus required /></label>
          <label>Mot de passe<input type="password" value={mdp} onChange={e => setMdp(e.target.value)} autoComplete="current-password" required /></label>
          {erreur && <p className="erreur">{erreur}</p>}
          <button className="principal" disabled={attente}>{attente ? 'Connexion…' : 'Se connecter'}</button>
          <p className="aide-champ centre">Prototype de démonstration : toutes les données sont fictives.</p>
        </form>
        <div className="carte demo-comptes">
          <h3>Comptes de démonstration</h3>
          <p className="aide-champ">Hôpital Général de Référence Nationale (HGRN). Remplacez <code>hgrn</code> par <code>hpmdo</code> (Moundou) ou <code>hdbgr</code> (Bongor) pour les autres hôpitaux pilotes.</p>
          <ul>{DEMO.map(([l, r]) => <li key={l}><button type="button" className="lien" onClick={() => setLogin(l)}>{l}</button><span>{r}</span></li>)}</ul>
        </div>
      </div>
    </div>
  );
}
