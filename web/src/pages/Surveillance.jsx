// Surveillance épidémiologique (M19) : les diagnostics posés en consultation alimentent automatiquement la surveillance
// des maladies à potentiel épidémique (SIMR), sans double saisie ; alerte dès que le seuil est atteint sur 7 jours.
import React from 'react';
import { useApp } from '../App.jsx';
import { useCharger, Pastille } from '../components/ui.jsx';
import { Histogramme, Legende } from '../components/Graphiques.jsx';
import { dateHeure, age } from '../format.js';

const TONS = ['forte', 'claire', 'moyenne', 'pale', 'accent'];

export default function Surveillance() {
  const { ref } = useApp();
  const [d, , err] = useCharger('/surveillance', 60000);
  if (err) return <p className="bandeau erreur">{err}</p>;
  if (!d) return <p className="info">Chargement…</p>;
  const codes = Object.keys(ref.mpe);
  const series = codes.map((c, i) => ({ cle: c, libelle: ref.mpe[c].maladie, ton: TONS[i % TONS.length] }));
  const semaines = Object.values(d.semaines.reduce((acc, s) => { (acc[s.semaine] ||= { date: s.debut })[s.code] = s.n; return acc; }, {}));
  return (
    <>
      <div className="titre-page"><h2>Surveillance épidémiologique</h2><p>Maladies à potentiel épidémique déclarées automatiquement depuis les consultations. Seuils d’alerte illustratifs, à fixer avec la Direction de la surveillance.</p></div>
      <div className="alertes-mpe">{d.global.map(a => (
        <div key={a.code} className={`mpe ${a.alerte ? 'alerte' : ''}`}>
          <strong>{a.cas_7j}</strong><span>{a.maladie}</span><small>cas sur 7 jours · seuil {a.seuil}</small>
          {a.alerte ? <Pastille ton="rouge">ALERTE</Pastille> : <Pastille ton="vert">sous le seuil</Pastille>}
        </div>))}</div>
      <div className="carte sans-marge">
        <table className="tableau">
          <thead><tr><th>Établissement</th>{codes.map(c => <th key={c} className="num">{ref.mpe[c].maladie}</th>)}</tr></thead>
          <tbody>{d.par_etablissement.map(e => (
            <tr key={e.id}><td><strong>{e.nom}</strong><br /><small>{e.province}</small></td>
              {e.alertes.map(a => <td key={a.code} className="num">{a.alerte ? <Pastille ton="rouge">{a.cas_7j}</Pastille> : a.cas_7j}</td>)}</tr>))}</tbody>
        </table>
      </div>
      <div className="carte">
        <h3>Cas par semaine (8 dernières semaines)</h3>
        <Legende elements={series} />
        {semaines.length ? <Histogramme serie={semaines} series={series} aria="Cas par semaine" infobulle={(s, j) => `Semaine du ${j} : ${codes.map(c => `${ref.mpe[c].maladie} ${s[c] || 0}`).join(', ')}`} /> : <p className="info">Aucun cas.</p>}
      </div>
      <div className="carte">
        <h3>Cas des 14 derniers jours (liste linéaire)</h3>
        <table className="tableau">
          <thead><tr><th>Date</th><th>Maladie</th><th>IPUN</th><th>Sexe, âge</th><th>Quartier / village</th><th>Établissement</th></tr></thead>
          <tbody>{d.cas.map((c, i) => <tr key={i}><td>{dateHeure(c.cree_le)}</td><td>{c.diagnostic_libelle} <code>{c.code}</code></td><td><code>{c.ipun}</code></td><td>{c.sexe} · {age(c.date_naissance)}</td><td>{c.adresse || '—'}</td><td>{c.etablissement}</td></tr>)}</tbody>
        </table>
        <p className="aide-champ">Liste sans nom : l’identifiant (IPUN) suffit aux équipes d’investigation habilitées pour retrouver le dossier.</p>
      </div>
    </>
  );
}
