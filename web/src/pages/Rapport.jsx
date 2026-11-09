// Rapport mensuel d'activité hospitalière (M17), généré automatiquement depuis les données de soins, au format
// illustratif du SNIS ; le point focal le contrôle avant transmission à DHIS2 (export CSV dans le prototype).
import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { useCharger, Kpi } from '../components/ui.jsx';
import { nombre, t } from '../format.js';

const TRANCHES = ['0-11 mois', '1-4 ans', '5-14 ans', '15 ans et plus'];

export default function Rapport() {
  const { u, ref } = useApp();
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [etab, setEtab] = useState('');
  const [d, , err] = useCharger(`/rapports/mensuel?mois=${mois}${etab ? `&etablissement_id=${etab}` : ''}`);
  const exporter = () => {
    const l = [['Rubrique', 'Valeur'], ['Mois', d.mois], ['Établissement', d.etablissement?.nom || 'Tous'], ['Consultations', d.consultations], ['Urgences', d.urgences],
      ['Hospitalisations', d.hospitalisations], ['Accouchements', d.accouchements], ['Décès', d.deces], ['Examens validés', d.examens],
      ...TRANCHES.flatMap(tr => ['F', 'M'].map(s => [`Visites ${tr} ${s}`, d.tranches.find(x => x.tranche === tr && x.sexe === s)?.n || 0])),
      ...d.morbidite.map(m => [`Morbidité ${m.code} ${m.nom}`, m.n])];
    const url = URL.createObjectURL(new Blob(['﻿' + l.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `rapport_SNIS_${d.mois}_${d.etablissement?.code || 'national'}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="titre-page ligne">
        <div><h2>{t("Rapport mensuel d’activité (SNIS)")}</h2><p>{t("Généré automatiquement : aucune ressaisie. À contrôler par le point focal statistique avant envoi à DHIS2.")}</p></div>
        <div className="outils">
          {!u.etablissement_id && <select value={etab} onChange={e => setEtab(e.target.value)}><option value="">{t("Tous les établissements")}</option>{ref.etablissements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}</select>}
          <input type="month" value={mois} max={new Date().toISOString().slice(0, 7)} onChange={e => setMois(e.target.value)} />
          <button onClick={exporter} disabled={!d}>{t("Exporter (CSV)")}</button>
        </div>
      </div>
      {err && <p className="bandeau erreur">{err}</p>}
      {d && <>
        <div className="kpis">
          <Kpi v={nombre(d.consultations)} l="consultations externes" ton="fort" /><Kpi v={nombre(d.urgences)} l="urgences" /><Kpi v={nombre(d.hospitalisations)} l="hospitalisations" />
          <Kpi v={nombre(d.accouchements)} l="accouchements" /><Kpi v={nombre(d.deces)} l="décès" /><Kpi v={nombre(d.examens)} l="examens validés" />
        </div>
        <div className="deux">
          <div className="carte"><h3>{t("Fréquentation par âge et sexe")}</h3>
            <table className="tableau"><thead><tr><th>{t("Tranche d’âge")}</th><th className="num">{t("Féminin")}</th><th className="num">{t("Masculin")}</th><th className="num">{t("Total")}</th></tr></thead>
              <tbody>{TRANCHES.map(tr => { const f = d.tranches.find(x => x.tranche === tr && x.sexe === 'F')?.n || 0, m = d.tranches.find(x => x.tranche === tr && x.sexe === 'M')?.n || 0;
                return <tr key={tr}><td>{t(tr)}</td><td className="num">{nombre(f)}</td><td className="num">{nombre(m)}</td><td className="num"><strong>{nombre(f + m)}</strong></td></tr>; })}</tbody></table></div>
          <div className="carte"><h3>{t("Morbidité (CIM-10)")}</h3>
            <table className="tableau"><thead><tr><th>{t("Code")}</th><th>{t("Diagnostic")}</th><th className="num">{t("Cas")}</th></tr></thead>
              <tbody>{d.morbidite.map(m => <tr key={m.code}><td><code>{m.code}</code></td><td>{t(m.nom)}</td><td className="num">{nombre(m.n)}</td></tr>)}</tbody></table></div>
        </div>
        <div className="bandeau attente"><span>{t("Transmission à DHIS2 : prévue à l’intégration (lot 1), après validation du point focal. Dans ce prototype, le rapport s’exporte en CSV.")}</span></div>
      </>}
    </>
  );
}
