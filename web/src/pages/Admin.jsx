// Administration (M20) : comptes et rôles (RBAC), suspension, journal d'audit consultable, matrice des droits.
import React, { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { useCharger, Modale, Champ, Pastille, Action } from '../components/ui.jsx';
import { dateHeure } from '../format.js';
import { ROLES_ETABLISSEMENT } from '../droits.js';

export default function Admin() {
  const [onglet, setOnglet] = useState('comptes');
  return (
    <>
      <div className="titre-page"><h2>Administration</h2><p>Comptes, rôles et traçabilité. Chaque action sensible est inscrite au journal d’audit.</p></div>
      <div className="onglets">{[['comptes', 'Comptes'], ['journal', 'Journal d’audit'], ['droits', 'Matrice des droits']].map(([k, l]) => <button key={k} className={onglet === k ? 'actif' : ''} onClick={() => setOnglet(k)}>{l}</button>)}</div>
      {onglet === 'comptes' && <Comptes />}{onglet === 'journal' && <Journal />}{onglet === 'droits' && <Droits />}
    </>
  );
}

function Comptes() {
  const { ref, u } = useApp();
  const [liste, recharger] = useCharger('/admin/utilisateurs');
  const [edit, setEdit] = useState(null);
  const [filtre, setFiltre] = useState('');
  const lignes = (liste || []).filter(x => !filtre || `${x.nom} ${x.login} ${x.etablissement || ''}`.toLowerCase().includes(filtre.toLowerCase()));
  return (
    <>
      <div className="barre-outils"><input placeholder="Filtrer (nom, identifiant, établissement)" value={filtre} onChange={e => setFiltre(e.target.value)} /><button className="principal" onClick={() => setEdit({})}>Nouveau compte</button></div>
      <div className="carte sans-marge">
        <table className="tableau">
          <thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Établissement</th><th>Dernière connexion</th><th className="num">Actions (7 j)</th><th>État</th><th /></tr></thead>
          <tbody>{lignes.map(x => (
            <tr key={x.id} className={x.actif ? '' : 'silence'}>
              <td>{x.nom}</td><td><code>{x.login}</code></td><td>{ref.roles[x.role]}</td><td>{x.etablissement || <small>niveau central</small>}</td>
              <td>{dateHeure(x.derniere_connexion)}</td><td className="num">{x.actions_7j}</td>
              <td>{x.actif ? <Pastille ton="vert">actif</Pastille> : <Pastille ton="rouge">suspendu</Pastille>}</td>
              <td className="actions-cellule"><button className="lien" onClick={() => setEdit(x)}>Modifier</button>
                {x.id !== u.id && <Action className="lien" faire={async () => { await api('PATCH', `/admin/utilisateurs/${x.id}`, { actif: !x.actif }); recharger(); }}>{x.actif ? 'Suspendre' : 'Réactiver'}</Action>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      {edit && <Compte x={edit} onFerme={() => setEdit(null)} onFait={() => { setEdit(null); recharger(); }} />}
    </>
  );
}

function Compte({ x, onFerme, onFait }) {
  const { ref } = useApp();
  const nouveau = !x.id;
  const [f, setF] = useState({ nom: x.nom || '', login: x.login || '', role: x.role || '', etablissement_id: x.etablissement_id || '', mot_de_passe: '' });
  const [err, setErr] = useState({}); const [msg, setMsg] = useState('');
  const set = (k, v) => setF(y => ({ ...y, [k]: v }));
  return (
    <Modale titre={nouveau ? 'Nouveau compte' : `Modifier ${x.login}`} onFerme={onFerme}>
      <div className="grille">
        <Champ libelle="Nom complet" erreur={err.nom}><input value={f.nom} onChange={e => set('nom', e.target.value)} /></Champ>
        {nouveau && <Champ libelle="Identifiant" erreur={err.login}><input value={f.login} onChange={e => set('login', e.target.value.toLowerCase())} placeholder="prenom.nom" /></Champ>}
        <Champ libelle="Rôle" erreur={err.role}><select value={f.role} onChange={e => set('role', e.target.value)}><option value="">Choisir…</option>{Object.entries(ref.roles).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Champ>
        {ROLES_ETABLISSEMENT.includes(f.role) && <Champ libelle="Établissement" erreur={err.etablissement_id}><select value={f.etablissement_id} onChange={e => set('etablissement_id', e.target.value)}><option value="">Choisir…</option>{ref.etablissements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></Champ>}
        <Champ libelle={nouveau ? 'Mot de passe initial' : 'Nouveau mot de passe (facultatif)'} erreur={err.mot_de_passe} aide="8 caractères au moins."><input type="password" autoComplete="new-password" value={f.mot_de_passe} onChange={e => set('mot_de_passe', e.target.value)} /></Champ>
      </div>
      {msg && <p className="bandeau erreur">{msg}</p>}
      <div className="actions"><button className="principal" onClick={async () => {
        setErr({}); setMsg('');
        try { await api(nouveau ? 'POST' : 'PATCH', nouveau ? '/admin/utilisateurs' : `/admin/utilisateurs/${x.id}`, f); onFait(); } catch (e) { setErr(e.details || {}); setMsg(e.message); }
      }}>Enregistrer</button></div>
    </Modale>
  );
}

const ACTIONS = ['CONNEXION', 'ECHEC_CONNEXION', 'ACCES_DOSSIER', 'ADMISSION', 'CONSULTATION', 'RESULTAT_VALIDE', 'DISPENSATION', 'ENCAISSEMENT', 'ANNULATION', 'SUSPENSION', 'CREATION_COMPTE'];
function Journal() {
  const [action, setAction] = useState('');
  const [liste] = useCharger(`/admin/journal${action ? `?action=${action}` : ''}`);
  return (
    <>
      <div className="barre-outils"><select value={action} onChange={e => setAction(e.target.value)}><option value="">Toutes les actions</option>{ACTIONS.map(a => <option key={a}>{a}</option>)}</select></div>
      <div className="carte sans-marge">
        <table className="tableau"><thead><tr><th>Date</th><th>Utilisateur</th><th>Établ.</th><th>Action</th><th>Objet</th><th>Détail</th></tr></thead>
          <tbody>{liste?.map(j => <tr key={j.id} className={['ECHEC_CONNEXION', 'ANNULATION', 'SUSPENSION'].includes(j.action) ? 'alerte' : ''}>
            <td>{dateHeure(j.le)}</td><td>{j.utilisateur || '—'} <small>{j.login}</small></td><td>{j.etablissement || '—'}</td><td><code>{j.action}</code></td><td>{j.objet} {j.objet_id}</td><td><small>{j.detail}</small></td></tr>)}</tbody></table>
      </div>
    </>
  );
}

function Droits() {
  const { ref } = useApp();
  const roles = Object.keys(ref.roles);
  return (
    <div className="carte sans-marge">
      <table className="tableau matrice"><thead><tr><th>Droit</th>{roles.map(r => <th key={r}>{ref.roles[r]}</th>)}</tr></thead>
        <tbody>{Object.entries(ref.droits).map(([k, d]) => <tr key={k}><td>{d.libelle}</td>{roles.map(r => <td key={r} className="centre">{d.roles.includes(r) ? '✓' : ''}</td>)}</tr>)}</tbody></table>
    </div>
  );
}
