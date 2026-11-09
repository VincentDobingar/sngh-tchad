// Surveillance épidémiologique (M19) : les diagnostics posés en consultation alimentent automatiquement la surveillance
// des maladies à potentiel épidémique (SIMR), sans double saisie ; alerte dès que le seuil est atteint sur 7 jours.
import React from 'react';
import { useApp } from '../App.jsx';
import { useCharger, Pastille } from '../components/ui.jsx';
import { Histogramme, Legende } from '../components/Graphiques.jsx';
import { dateHeure, age, t } from '../format.js';

const TONS = ['forte', 'claire', 'moyenne', 'pale', 'accent'];

export default function Surveillance() {
  const { ref } = useApp();
  const [d, , err] = useCharger('/surveillance', 60000);
  if (err) return <p className="bandeau erreur">{err}</p>;
  if (!d) return <p className="info">{t("Chargement…")}</p>;
  const codes = Object.keys(ref.mpe);
  const series = codes.map((c, i) => ({ cle: c, libelle: ref.mpe[c].maladie, ton: TONS[i % TONS.length] }));
  const semaines = Object.values(d.semaines.reduce((acc, s) => { (acc[s.semaine] ||= { date: s.debut })[s.code] = s.n; return acc; }, {}));
  return (
    <>
      <div className="titre-page"><h2>{t("Surveillance épidémiologique")}</h2><p>{t("Maladies à potentiel épidémique déclarées automatiquement depuis les consultations. Seuils d’alerte illustratifs, à fixer avec la Direction de la surveillance.")}</p></div>
      <div className="alertes-mpe">{d.global.map(a => (
        <div key={a.code} className={`mpe ${a.alerte ? 'alerte' : ''}`}>
          <strong>{a.cas_7j}</strong><span>{t(a.maladie)}</span><small>{t('cas sur 7 jours · seuil {s}', { s: a.seuil })}</small>
          {a.alerte ? <Pastille ton="rouge">{t("ALERTE")}</Pastille> : <Pastille ton="vert">{t("sous le seuil")}</Pastille>}
        </div>))}</div>
      <div className="carte sans-marge">
        <table className="tableau">
          <thead><tr><th>{t("Établissement")}</th>{codes.map(c => <th key={c} className="num">{ref.mpe[c].maladie}</th>)}</tr></thead>
          <tbody>{d.par_etablissement.map(e => (
            <tr key={e.id}><td><strong>{t(e.nom)}</strong><br /><small>{t(e.province)}</small></td>
              {e.alertes.map(a => <td key={a.code} className="num">{a.alerte ? <Pastille ton="rouge">{a.cas_7j}</Pastille> : a.cas_7j}</td>)}</tr>))}</tbody>
        </table>
      </div>
      <div className="carte">
        <h3>{t("Cas par semaine (8 dernières semaines)")}</h3>
        <Legende elements={series} />
        {semaines.length ? <Histogramme serie={semaines} series={series} aria="Cas par semaine" infobulle={(s, j) => t('Semaine du {j} : {n}', { j, n: codes.map(c => `${ref.mpe[c].maladie} ${s[c] || 0}`).join(', ') })} /> : <p className="info">{t("Aucun cas.")}</p>}
      </div>
      <div className="carte">
        <h3>{t("Cas des 14 derniers jours (liste linéaire)")}</h3>
        <table className="tableau">
          <thead><tr><th>{t("Date")}</th><th>{t("Maladie")}</th><th>{t("IPUN")}</th><th>{t("Sexe, âge")}</th><th>{t("Quartier / village")}</th><th>{t("Établissement")}</th></tr></thead>
          <tbody>{d.cas.map((c, i) => <tr key={i}><td>{dateHeure(c.cree_le)}</td><td>{t(c.diagnostic_libelle)} <code>{c.code}</code></td><td><code>{c.ipun}</code></td><td>{t(c.sexe)} · {age(c.date_naissance)}</td><td>{c.adresse || '—'}</td><td>{t(c.etablissement)}</td></tr>)}</tbody>
        </table>
        <p className="aide-champ">{t("Liste sans nom : l’identifiant (IPUN) suffit aux équipes d’investigation habilitées pour retrouver le dossier.")}</p>
      </div>
    </>
  );
}
