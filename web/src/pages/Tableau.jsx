// Tableau de bord (M18) : vue établissement (directeur) ou vue au choix pour le niveau central (national par défaut).
// Fréquentation, urgences, occupation des lits, durée de séjour, délais, recettes et gratuités, morbidité, stocks, alertes.
import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { useCharger, Kpi, Pastille } from '../components/ui.jsx';
import { Histogramme, Legende, BarresHorizontales } from '../components/Graphiques.jsx';
import { fcfa, millions, nombre, duree } from '../format.js';

const SERIES = [{ cle: 'consultations', libelle: 'consultations', ton: 'forte' }, { cle: 'urgences', libelle: 'urgences', ton: 'claire' }];

export default function Tableau() {
  const { u, ref, aller } = useApp();
  const central = !u.etablissement_id;
  const [etab, setEtab] = useState('');
  const [jours, setJours] = useState(30);
  const [d, , err] = useCharger(`/tableau?jours=${jours}${etab ? `&etablissement_id=${etab}` : ''}`, 60000);
  if (err) return <p className="bandeau erreur">{err}</p>;
  const k = d?.indicateurs;
  return (
    <>
      <div className="titre-page ligne">
        <div><h2>Tableau de bord {d?.etablissement ? `· ${d.etablissement.nom}` : '· ensemble des établissements pilotes'}</h2>
          <p>{jours} derniers jours · actualisé chaque minute</p></div>
        <div className="outils">
          {central && <select value={etab} onChange={e => setEtab(e.target.value)}><option value="">Tous les établissements</option>{ref.etablissements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}</select>}
          <select value={jours} onChange={e => setJours(Number(e.target.value))}>{[7, 30, 90].map(j => <option key={j} value={j}>{j} jours</option>)}</select>
        </div>
      </div>
      {!d ? <p className="info">Chargement…</p> : <>
        {d.alertes.some(a => a.alerte) && (
          <div className="bandeau erreur"><strong>Alerte épidémiologique :</strong>
            {d.alertes.filter(a => a.alerte).map(a => <span key={a.code}>{a.maladie} · {a.cas_7j} cas en 7 jours (seuil {a.seuil})</span>)}
            <button className="lien" onClick={() => aller('surveillance')}>Voir la surveillance</button></div>)}
        <div className="kpis">
          <Kpi v={nombre(k.visites)} l={`visites · ${nombre(k.patients)} patients`} ton="fort" />
          <Kpi v={nombre(k.urgences)} l="passages aux urgences" />
          <Kpi v={`${k.taux_occupation} %`} l={`occupation des lits (${k.lits_occupes} / ${k.lits_total})`} />
          <Kpi v={k.dms != null ? `${nombre(k.dms)} j` : '—'} l={`durée moyenne de séjour · ${k.sorties} sorties`} />
          <Kpi v={duree(k.attente_min)} l="attente moyenne avant consultation" />
          <Kpi v={k.delai_labo_h != null ? `${nombre(k.delai_labo_h)} h` : '—'} l={`délai moyen des résultats · ${k.examens_en_attente} en cours`} />
          <Kpi v={millions(k.recettes)} l="FCFA encaissés" />
          <Kpi v={millions(k.gratuites)} l={`FCFA de gratuités ciblées (${nombre(k.nb_gratuites)} factures)`} />
          <Kpi v={k.deces} l="décès" ton={k.deces ? 'alerte' : ''} />
          <Kpi v={k.sous_seuil} l={`médicaments sous le seuil · ${k.ruptures} en rupture`} ton={k.ruptures ? 'alerte' : ''} />
        </div>
        <div className="carte">
          <h3>Fréquentation par jour</h3>
          <Legende elements={SERIES} />
          <Histogramme serie={d.serie} series={SERIES} aria="Visites par jour" infobulle={(s, j) => `${j} : ${s.consultations} consultations, ${s.urgences} urgences`} />
        </div>
        <div className="deux">
          <div className="carte"><h3>Morbidité : 10 premiers diagnostics</h3><BarresHorizontales lignes={d.morbidite.map(m => ({ ...m, nom: m.nom }))} /></div>
          <div className="carte"><h3>Visites par service</h3><BarresHorizontales lignes={d.par_service} ton="moyenne" />
            <h3 className="espace">Occupation des lits par service</h3>
            <BarresHorizontales lignes={d.occupation.map(o => ({ nom: o.nom, n: Math.round((o.occupes || 0) / o.total * 100) }))} ton="claire" />
            <p className="aide-champ">En pourcentage des lits du service.</p></div>
        </div>
        <div className="deux">
          <div className="carte"><h3>Recettes par mode de paiement</h3>
            <table className="tableau"><thead><tr><th>Mode</th><th className="num">Paiements</th><th className="num">Montant</th></tr></thead>
              <tbody>{d.paiements.map(p => <tr key={p.mode}><td>{ref.modes[p.mode]}</td><td className="num">{nombre(p.n)}</td><td className="num">{fcfa(p.montant)}</td></tr>)}</tbody></table>
            <p className="aide-champ">Mobile money : {Math.round(d.paiements.filter(p => p.mode.endsWith('MONEY')).reduce((a, p) => a + p.montant, 0) / Math.max(1, k.recettes) * 100)} % des recettes, traçables de bout en bout.</p></div>
          <div className="carte"><h3>Médicaments sous le seuil d’alerte</h3>
            {d.ruptures.length === 0 ? <p className="info ok">Aucun médicament sous le seuil.</p> :
              <table className="tableau"><thead><tr>{!d.etablissement && <th>Établ.</th>}<th>Médicament</th><th className="num">Stock</th><th className="num">Seuil</th></tr></thead>
                <tbody>{d.ruptures.map(r => <tr key={r.etablissement + r.dci} className={r.quantite === 0 ? 'alerte' : ''}>{!d.etablissement && <td>{r.etablissement}</td>}<td>{r.dci} {r.dosage}{r.quantite === 0 && <Pastille ton="rouge">rupture</Pastille>}</td><td className="num">{nombre(r.quantite)}</td><td className="num">{nombre(r.seuil)}</td></tr>)}</tbody></table>}</div>
        </div>
      </>}
    </>
  );
}
