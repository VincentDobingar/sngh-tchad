// Vue nationale : comparaison des établissements connectés et couverture du déploiement par province.
import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { useCharger, Kpi, Pastille } from '../components/ui.jsx';
import { fcfa, millions, nombre, dateHeure } from '../format.js';

export default function National() {
  const { ref } = useApp();
  const [jours, setJours] = useState(30);
  const [d, , err] = useCharger(`/tableau/national?jours=${jours}`, 60000);
  if (err) return <p className="bandeau erreur">{err}</p>;
  if (!d) return <p className="info">Chargement…</p>;
  const E = d.etablissements;
  const couvertes = d.provinces.filter(p => p.etablissements).length;
  return (
    <>
      <div className="titre-page ligne">
        <div><h2>Vue nationale</h2><p>Phase pilote : 1 hôpital national, 1 hôpital provincial, 1 hôpital de district · {jours} derniers jours.</p></div>
        <div className="outils"><select value={jours} onChange={e => setJours(Number(e.target.value))}>{[7, 30, 90].map(j => <option key={j} value={j}>{j} jours</option>)}</select></div>
      </div>
      <div className="kpis">
        <Kpi v={E.length} l="établissements connectés" ton="fort" />
        <Kpi v={`${couvertes} / ${d.provinces.length}`} l="provinces couvertes" />
        <Kpi v={nombre(E.reduce((a, e) => a + e.visites, 0))} l="visites enregistrées" />
        <Kpi v={millions(E.reduce((a, e) => a + e.recettes, 0))} l="FCFA encaissés" />
        <Kpi v={E.reduce((a, e) => a + e.alertes, 0)} l="alertes épidémiques actives" ton={E.some(e => e.alertes) ? 'alerte' : ''} />
      </div>
      <div className="carte sans-marge">
        <table className="tableau">
          <thead><tr><th>Établissement</th><th>Province</th><th className="num">Visites</th><th className="num">Occupation</th><th className="num">Recettes</th><th className="num">Décès</th><th>Stocks</th><th>Alertes</th><th>Dernière activité</th></tr></thead>
          <tbody>{E.map(e => (
            <tr key={e.id}>
              <td><strong>{e.nom}</strong><br /><small>{ref.types[e.type]} · {e.code}</small></td><td>{e.province}</td>
              <td className="num">{nombre(e.visites)}</td><td className="num">{e.taux_occupation} %</td><td className="num">{fcfa(e.recettes)}</td><td className="num">{e.deces}</td>
              <td>{e.sous_seuil ? <Pastille ton="orange">{e.sous_seuil} sous le seuil</Pastille> : <Pastille ton="vert">normal</Pastille>}</td>
              <td>{e.alertes ? <Pastille ton="rouge">{e.alertes} alerte(s)</Pastille> : <Pastille ton="vert">aucune</Pastille>}</td>
              <td>{dateHeure(e.derniere_activite)}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="carte">
        <h3>Couverture par province</h3>
        <div className="provinces">{d.provinces.map(p => (
          <div key={p.province} className={`province ${p.etablissements ? 'couverte' : ''} ${p.alertes ? 'alerte' : ''}`}>
            <strong>{p.province}</strong><span>{p.etablissements ? `${p.etablissements} établ. · ${nombre(p.visites)} visites` : 'vague de déploiement à venir'}</span>
          </div>))}</div>
        <p className="aide-champ">Calendrier du cahier des charges : vague 1 (hôpitaux nationaux et CHU), vague 2 (hôpitaux provinciaux), vague 3 (hôpitaux de district, province par province).</p>
      </div>
    </>
  );
}
