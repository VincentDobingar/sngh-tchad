// Tableau de bord (M18) : vue établissement (directeur) ou vue au choix pour le niveau central (national par défaut).
// Fréquentation, urgences, occupation des lits, durée de séjour, délais, recettes et gratuités, morbidité, stocks, alertes.
import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { useCharger, Kpi, Pastille } from '../components/ui.jsx';
import { Histogramme, Legende, BarresHorizontales } from '../components/Graphiques.jsx';
import { fcfa, millions, nombre, duree, t } from '../format.js';

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
        <div><h2>{d?.etablissement ? t('Tableau de bord · {etab}', { etab: t(d.etablissement.nom) }) : t('Tableau de bord · ensemble des établissements pilotes')}</h2>
          <p>{t('{j} derniers jours · actualisé chaque minute', { j: jours })}</p></div>
        <div className="outils">
          {central && <select value={etab} onChange={e => setEtab(e.target.value)}><option value="">{t("Tous les établissements")}</option>{ref.etablissements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}</select>}
          <select value={jours} onChange={e => setJours(Number(e.target.value))}>{[7, 30, 90].map(j => <option key={j} value={j}>{t('{n} jours', { n: j })}</option>)}</select>
        </div>
      </div>
      {!d ? <p className="info">{t("Chargement…")}</p> : <>
        {d.alertes.some(a => a.alerte) && (
          <div className="bandeau erreur"><strong>{t("Alerte épidémiologique :")}</strong>
            {d.alertes.filter(a => a.alerte).map(a => <span key={a.code}>{t('{maladie} · {n} cas en 7 jours (seuil {s})', { maladie: t(a.maladie), n: a.cas_7j, s: a.seuil })}</span>)}
            <button className="lien" onClick={() => aller('surveillance')}>{t("Voir la surveillance")}</button></div>)}
        <div className="kpis">
          <Kpi v={nombre(k.visites)} l={t('visites · {n} patients', { n: nombre(k.patients) })} ton="fort" />
          <Kpi v={nombre(k.urgences)} l="passages aux urgences" />
          <Kpi v={`${k.taux_occupation} %`} l={t('occupation des lits ({n} / {total})', { n: k.lits_occupes, total: k.lits_total })} />
          <Kpi v={k.dms != null ? t('{n} j', { n: nombre(k.dms) }) : '—'} l={t('durée moyenne de séjour · {n} sorties', { n: k.sorties })} />
          <Kpi v={duree(k.attente_min)} l="attente moyenne avant consultation" />
          <Kpi v={k.delai_labo_h != null ? t('{n} h', { n: nombre(k.delai_labo_h) }) : '—'} l={t('délai moyen des résultats · {n} en cours', { n: k.examens_en_attente })} />
          <Kpi v={millions(k.recettes)} l="FCFA encaissés" />
          <Kpi v={millions(k.gratuites)} l={t('FCFA de gratuités ciblées ({n} factures)', { n: nombre(k.nb_gratuites) })} />
          <Kpi v={k.deces} l="décès" ton={k.deces ? 'alerte' : ''} />
          <Kpi v={k.sous_seuil} l={t('médicaments sous le seuil · {n} en rupture', { n: k.ruptures })} ton={k.ruptures ? 'alerte' : ''} />
        </div>
        <div className="carte">
          <h3>{t("Fréquentation par jour")}</h3>
          <Legende elements={SERIES} />
          <Histogramme serie={d.serie} series={SERIES} aria="Visites par jour" infobulle={(s, j) => t('{j} : {c} consultations, {u} urgences', { j, c: s.consultations, u: s.urgences })} />
        </div>
        <div className="deux">
          <div className="carte"><h3>{t("Morbidité : 10 premiers diagnostics")}</h3><BarresHorizontales lignes={d.morbidite.map(m => ({ ...m, nom: t(m.nom) }))} /></div>
          <div className="carte"><h3>{t("Visites par service")}</h3><BarresHorizontales lignes={d.par_service.map(s => ({ ...s, nom: t(s.nom) }))} ton="moyenne" />
            <h3 className="espace">{t("Occupation des lits par service")}</h3>
            <BarresHorizontales lignes={d.occupation.map(o => ({ nom: t(o.nom), n: Math.round((o.occupes || 0) / o.total * 100) }))} ton="claire" />
            <p className="aide-champ">{t("En pourcentage des lits du service.")}</p></div>
        </div>
        <div className="deux">
          <div className="carte"><h3>{t("Recettes par mode de paiement")}</h3>
            <table className="tableau"><thead><tr><th>{t("Mode")}</th><th className="num">{t("Paiements")}</th><th className="num">{t("Montant")}</th></tr></thead>
              <tbody>{d.paiements.map(p => <tr key={p.mode}><td>{ref.modes[p.mode]}</td><td className="num">{nombre(p.n)}</td><td className="num">{fcfa(p.montant)}</td></tr>)}</tbody></table>
            <p className="aide-champ">{t('Mobile money : {n} % des recettes, traçables de bout en bout.', { n: Math.round(d.paiements.filter(p => ['AIRTEL_MONEY', 'MOOV_MONEY', 'KONOOM'].includes(p.mode)).reduce((a, p) => a + p.montant, 0) / Math.max(1, k.recettes) * 100) })}</p></div>
          <div className="carte"><h3>{t("Médicaments sous le seuil d’alerte")}</h3>
            {d.ruptures.length === 0 ? <p className="info ok">{t("Aucun médicament sous le seuil.")}</p> :
              <table className="tableau"><thead><tr>{!d.etablissement && <th>{t("Établ.")}</th>}<th>{t("Médicament")}</th><th className="num">{t("Stock")}</th><th className="num">{t("Seuil")}</th></tr></thead>
                <tbody>{d.ruptures.map(r => <tr key={r.etablissement + r.dci} className={r.quantite === 0 ? 'alerte' : ''}>{!d.etablissement && <td>{r.etablissement}</td>}<td>{t(r.dci)} {r.dosage}{r.quantite === 0 && <Pastille ton="rouge">{t("rupture")}</Pastille>}</td><td className="num">{nombre(r.quantite)}</td><td className="num">{nombre(r.seuil)}</td></tr>)}</tbody></table>}</div>
        </div>
      </>}
    </>
  );
}
