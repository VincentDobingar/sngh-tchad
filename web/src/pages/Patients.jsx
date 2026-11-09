// Recherche d'un patient et ouverture de son dossier (accès tracé).
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Champ } from '../components/ui.jsx';
import Dossier from '../components/Dossier.jsx';
import { date } from '../format.js';

export default function Patients() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [choisi, setChoisi] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined; }
    const id = setTimeout(() => api('GET', `/patients?q=${encodeURIComponent(q)}`).then(setRes).catch(() => setRes([])), 250);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <>
      <div className="titre-page"><h2>Dossiers patients</h2><p>Chaque ouverture de dossier est enregistrée dans le journal d’audit (qui, quand, quel dossier).</p></div>
      <div className="consultation">
        <div className="carte">
          <Champ libelle="Rechercher"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, téléphone ou IPUN" autoFocus /></Champ>
          {res && <ul className="resultats">{res.length === 0 ? <li className="info">Aucun patient.</li> : res.map(p => (
            <li key={p.id}><button className={choisi === p.id ? 'choisi' : ''} onClick={() => setChoisi(p.id)}><strong>{p.nom} {p.prenom}</strong><small>{p.ipun} · {p.age} · dernière visite {date(p.derniere_visite)}</small></button></li>))}</ul>}
        </div>
        <div className="carte">{choisi ? <Dossier key={choisi} patientId={choisi} /> : <p className="info">Choisissez un patient pour ouvrir son dossier.</p>}</div>
      </div>
    </>
  );
}
