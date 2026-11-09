// Dossier patient informatisé (M02) : identité, alertes (allergies, antécédents), historique chronologique des visites,
// consultations, prescriptions, résultats validés et hospitalisations. Chaque ouverture est tracée par le serveur.
import React from 'react';
import { useCharger, Pastille } from './ui.jsx';
import { useApp } from '../App.jsx';
import { date, heure, age, t } from '../format.js';

const ISSUES = { HOSPITALISATION: 'hospitalisation', TRANSFERT: 'transfert', DECES: 'Décès', CONTRE_AVIS: 'sortie contre avis médical' };

export default function Dossier({ patientId, compact }) {
  const { ref } = useApp();
  const [d, , err] = useCharger(patientId ? `/patients/${patientId}/dossier` : null);
  if (err) return <p className="bandeau erreur">{err}</p>;
  if (!d) return <p className="info">{t("Chargement du dossier…")}</p>;
  const p = d.patient;
  const derniere = d.visites.flatMap(v => v.consultations).find(c => c.poids);
  return (
    <div className="dossier">
      <div className="identite">
        <div>
          <h3>{p.nom} {p.prenom}</h3>
          <p><code>{p.ipun}</code> · {t(p.sexe === 'F' ? 'Femme' : 'Homme')}, {age(p.date_naissance)}{p.age_estime ? ` ${t('(âge estimé)')}` : ''} · {ref.categories[p.categorie]}</p>
          <p className="aide-champ">{[p.telephone, p.adresse, t(p.province)].filter(Boolean).join(' · ')}{p.nom_mere ? ` · ${t('mère : {nom}', { nom: p.nom_mere })}` : ''}</p>
        </div>
        <div className="alertes-patient">
          {p.allergies ? <Pastille ton="rouge">{t('Allergie : {x}', { x: p.allergies })}</Pastille> : <Pastille ton="gris">{t("Pas d’allergie connue")}</Pastille>}
          {p.antecedents && <Pastille ton="orange">{p.antecedents}</Pastille>}
          {derniere && <Pastille ton="gris">{t('Dernier poids : {n} kg', { n: derniere.poids })}</Pastille>}
        </div>
      </div>
      <h4>{t(d.visites.length > 1 ? 'Historique ({n} visites)' : 'Historique ({n} visite)', { n: d.visites.length })}</h4>
      {d.visites.length === 0 && <p className="info">{t("Première visite.")}</p>}
      <ol className="chronologie">
        {d.visites.slice(0, compact ? 6 : 50).map(v => (
          <li key={v.id}>
            <div className="chrono-tete"><strong>{date(v.arrivee)}</strong> {heure(v.arrivee)} · {t(v.service)} · {t(v.etablissement)}
              {v.type === 'URGENCE' && <Pastille ton="rouge">{t('Urgence {niveau}', { niveau: t(v.triage) })}</Pastille>}
              {v.issue && v.issue !== 'SORTIE' && <Pastille ton={v.issue === 'DECES' ? 'rouge' : 'orange'}>{t(ISSUES[v.issue] || v.issue)}</Pastille>}
              {['ATTENTE', 'EN_COURS'].includes(v.statut) && <Pastille ton="orange">{t("en cours")}</Pastille>}
            </div>
            {v.consultations.map(c => (
              <div key={c.id} className="chrono-corps">
                <div><b>{t(c.diagnostic_libelle)}</b> <code>{c.diagnostic_code}</code> <small>· {c.medecin}</small></div>
                <div className="constantes">{[c.temperature && t('T {v} °C', { v: c.temperature }), c.ta_sys && t('TA {s}/{d}', { s: c.ta_sys, d: c.ta_dia }), c.pouls && t('pouls {v}', { v: c.pouls }), c.spo2 && t('SpO₂ {v} %', { v: c.spo2 }), c.poids && t('{v} kg', { v: c.poids })].filter(Boolean).join(' · ')}</div>
                {c.anamnese && <div className="aide-champ">{t(c.anamnese)}</div>}
                {c.prescriptions.length > 0 && <div className="presc">℞ {c.prescriptions.map(x => `${t(x.dci)} ${x.dosage} (${t(x.posologie)})`).join(' ; ')}</div>}
              </div>))}
            {v.examens.length > 0 && <div className="chrono-corps examens-ligne">{v.examens.map(x => (
              <span key={x.id} className={x.resultat ? (x.anormal ? 'res anormal' : 'res') : 'res attente'}>{t(x.libelle)} : {x.resultat ? `${t(x.resultat)}${x.unite ? ' ' + x.unite : ''}` : t('en attente')}</span>))}</div>}
            {v.sejours.map(s => <div key={s.id} className="chrono-corps aide-champ">{s.sortie ? t('Hospitalisé en {service}, lit {lit}, du {du} au {au}', { service: t(s.service), lit: s.lit, du: date(s.entree), au: date(s.sortie) }) : t('Hospitalisé en {service}, lit {lit}, depuis le {du}', { service: t(s.service), lit: s.lit, du: date(s.entree) })}</div>)}
          </li>))}
      </ol>
    </div>
  );
}
