// Dossier patient informatisé (M02) : identité, alertes (allergies, antécédents), historique chronologique des visites,
// consultations, prescriptions, résultats validés et hospitalisations. Chaque ouverture est tracée par le serveur.
import React from 'react';
import { useCharger, Pastille } from './ui.jsx';
import { useApp } from '../App.jsx';
import { date, heure, age } from '../format.js';

export default function Dossier({ patientId, compact }) {
  const { ref } = useApp();
  const [d, , err] = useCharger(patientId ? `/patients/${patientId}/dossier` : null);
  if (err) return <p className="bandeau erreur">{err}</p>;
  if (!d) return <p className="info">Chargement du dossier…</p>;
  const p = d.patient;
  const derniere = d.visites.flatMap(v => v.consultations).find(c => c.poids);
  return (
    <div className="dossier">
      <div className="identite">
        <div>
          <h3>{p.nom} {p.prenom}</h3>
          <p><code>{p.ipun}</code> · {p.sexe === 'F' ? 'Femme' : 'Homme'}, {age(p.date_naissance)}{p.age_estime ? ' (âge estimé)' : ''} · {ref.categories[p.categorie]}</p>
          <p className="aide-champ">{[p.telephone, p.adresse, p.province].filter(Boolean).join(' · ')}{p.nom_mere ? ` · mère : ${p.nom_mere}` : ''}</p>
        </div>
        <div className="alertes-patient">
          {p.allergies ? <Pastille ton="rouge">Allergie : {p.allergies}</Pastille> : <Pastille ton="gris">Pas d’allergie connue</Pastille>}
          {p.antecedents && <Pastille ton="orange">{p.antecedents}</Pastille>}
          {derniere && <Pastille ton="gris">Dernier poids {derniere.poids} kg</Pastille>}
        </div>
      </div>
      <h4>Historique ({d.visites.length} visite{d.visites.length > 1 ? 's' : ''})</h4>
      {d.visites.length === 0 && <p className="info">Première visite.</p>}
      <ol className="chronologie">
        {d.visites.slice(0, compact ? 6 : 50).map(v => (
          <li key={v.id}>
            <div className="chrono-tete"><strong>{date(v.arrivee)}</strong> {heure(v.arrivee)} · {v.service} · {v.etablissement}
              {v.type === 'URGENCE' && <Pastille ton="rouge">Urgence {v.triage}</Pastille>}
              {v.issue && v.issue !== 'SORTIE' && <Pastille ton={v.issue === 'DECES' ? 'rouge' : 'orange'}>{v.issue.replace('_', ' ').toLowerCase()}</Pastille>}
              {['ATTENTE', 'EN_COURS'].includes(v.statut) && <Pastille ton="orange">en cours</Pastille>}
            </div>
            {v.consultations.map(c => (
              <div key={c.id} className="chrono-corps">
                <div><b>{c.diagnostic_libelle}</b> <code>{c.diagnostic_code}</code> <small>· {c.medecin}</small></div>
                <div className="constantes">{[c.temperature && `T ${c.temperature} °C`, c.ta_sys && `TA ${c.ta_sys}/${c.ta_dia}`, c.pouls && `pouls ${c.pouls}`, c.spo2 && `SpO₂ ${c.spo2} %`, c.poids && `${c.poids} kg`].filter(Boolean).join(' · ')}</div>
                {c.anamnese && <div className="aide-champ">{c.anamnese}</div>}
                {c.prescriptions.length > 0 && <div className="presc">℞ {c.prescriptions.map(x => `${x.dci} ${x.dosage} (${x.posologie})`).join(' ; ')}</div>}
              </div>))}
            {v.examens.length > 0 && <div className="chrono-corps examens-ligne">{v.examens.map(x => (
              <span key={x.id} className={x.resultat ? (x.anormal ? 'res anormal' : 'res') : 'res attente'}>{x.libelle} : {x.resultat ? `${x.resultat}${x.unite ? ' ' + x.unite : ''}` : 'en attente'}</span>))}</div>}
            {v.sejours.map(s => <div key={s.id} className="chrono-corps aide-champ">Hospitalisé en {s.service}, lit {s.lit}, du {date(s.entree)} {s.sortie ? `au ${date(s.sortie)}` : '(en cours)'}</div>)}
          </li>))}
      </ol>
    </div>
  );
}
