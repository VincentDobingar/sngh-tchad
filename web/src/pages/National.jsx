// Vue nationale : comparaison des établissements connectés et couverture du déploiement par province.
import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { useCharger, Kpi, Pastille } from '../components/ui.jsx';
import { fcfa, millions, nombre, dateHeure, t } from '../format.js';

export default function National() {
  const { ref } = useApp();
  const [jours, setJours] = useState(30);
  const [d, , err] = useCharger(`/tableau/national?jours=${jours}`, 60000);
  if (err) return <p className="bandeau erreur">{err}</p>;
  if (!d) return <p className="info">{t("Chargement…")}</p>;
  const E = d.etablissements;
  const couvertes = d.provinces.filter(p => p.etablissements).length;
  return (
    <>
      <div className="titre-page ligne">
        <div><h2>{t("Vue nationale")}</h2><p>{t('Phase pilote : 1 hôpital national, 1 hôpital provincial, 1 hôpital de district · {j} derniers jours.', { j: jours })}</p></div>
        <div className="outils"><select value={jours} onChange={e => setJours(Number(e.target.value))}>{[7, 30, 90].map(j => <option key={j} value={j}>{t('{n} jours', { n: j })}</option>)}</select></div>
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
          <thead><tr><th>{t("Établissement")}</th><th>{t("Province")}</th><th className="num">{t("Visites")}</th><th className="num">{t("Occupation")}</th><th className="num">{t("Recettes")}</th><th className="num">{t("Décès")}</th><th>{t("Stocks")}</th><th>{t("Alertes")}</th><th>{t("Dernière activité")}</th></tr></thead>
          <tbody>{E.map(e => (
            <tr key={e.id}>
              <td><strong>{t(e.nom)}</strong><br /><small>{ref.types[e.type]} · {e.code}</small></td><td>{t(e.province)}</td>
              <td className="num">{nombre(e.visites)}</td><td className="num">{e.taux_occupation} %</td><td className="num">{fcfa(e.recettes)}</td><td className="num">{e.deces}</td>
              <td>{e.sous_seuil ? <Pastille ton="orange">{t('{n} sous le seuil', { n: e.sous_seuil })}</Pastille> : <Pastille ton="vert">{t("normal")}</Pastille>}</td>
              <td>{e.alertes ? <Pastille ton="rouge">{t('{n} alerte(s)', { n: e.alertes })}</Pastille> : <Pastille ton="vert">{t("aucune")}</Pastille>}</td>
              <td>{dateHeure(e.derniere_activite)}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="carte">
        <h3>{t("Couverture par province")}</h3>
        <div className="provinces">{d.provinces.map(p => (
          <div key={p.province} className={`province ${p.etablissements ? 'couverte' : ''} ${p.alertes ? 'alerte' : ''}`}>
            <strong>{t(p.province)}</strong><span>{p.etablissements ? t('{n} établ. · {v} visites', { n: p.etablissements, v: nombre(p.visites) }) : t('vague de déploiement à venir')}</span>
          </div>))}</div>
        <p className="aide-champ">{t("Calendrier du cahier des charges : vague 1 (hôpitaux nationaux et CHU), vague 2 (hôpitaux provinciaux), vague 3 (hôpitaux de district, province par province).")}</p>
      </div>
    </>
  );
}
