// Laboratoire (M09) : demandes reçues des services, prélèvement, saisie du résultat (valeurs normales et seuils critiques),
// puis validation par un second biologiste. Seuls les résultats validés apparaissent dans le dossier patient.
import React, { useState } from 'react';
import { api } from '../api.js';
import { useCharger, Pastille, Triage, Action, Kpi } from '../components/ui.jsx';
import { heure, date, age } from '../format.js';

const ETATS = { DEMANDE: ['Demandé', 'gris'], PRELEVE: ['Prélevé', 'orange'], SAISI: ['À valider', 'orange'], VALIDE: ['Validé', 'vert'] };

export default function Laboratoire() {
  const [onglet, setOnglet] = useState('cours');
  const [liste, recharger, err] = useCharger(`/labo${onglet === 'termine' ? '?statut=termine' : ''}`, 30000);
  const n = s => liste?.filter(x => x.statut === s).length ?? 0;
  return (
    <>
      <div className="titre-page"><h2>Laboratoire</h2><p>Double validation : un résultat saisi doit être validé par un autre biologiste avant d’être visible du médecin.</p></div>
      {onglet === 'cours' && liste && <div className="kpis"><Kpi v={n('DEMANDE')} l="à prélever" /><Kpi v={n('PRELEVE')} l="à analyser" /><Kpi v={n('SAISI')} l="à valider" ton="fort" /><Kpi v={liste.filter(x => x.critique).length} l="valeurs critiques" ton={liste.some(x => x.critique) ? 'alerte' : ''} /></div>}
      <div className="onglets">
        <button className={onglet === 'cours' ? 'actif' : ''} onClick={() => setOnglet('cours')}>En cours</button>
        <button className={onglet === 'termine' ? 'actif' : ''} onClick={() => setOnglet('termine')}>Validés récemment</button>
      </div>
      {err && <p className="bandeau erreur">{err}</p>}
      <div className="file-labo">
        {liste?.length === 0 && <p className="info">Aucun examen.</p>}
        {liste?.map(x => <Ligne key={x.id} x={x} recharger={recharger} />)}
      </div>
    </>
  );
}

function Ligne({ x, recharger }) {
  const [val, setVal] = useState(x.resultat || '');
  const e = x.examen;
  const [libelle, ton] = ETATS[x.statut];
  return (
    <div className={`ligne-labo ${x.statut === 'VALIDE' ? 'faite' : ''} ${x.critique ? 'critique' : ''}`}>
      <div className="id-cas">
        <strong>{e.libelle}</strong>
        <span>{x.nom} {x.prenom} · {x.sexe} · {age(x.date_naissance)}</span>
        <span><code>{x.ipun}</code> · {x.service} {x.ticket} <Triage niveau={x.triage} /></span>
        <span>Demandé le {date(x.demande_le)} à {heure(x.demande_le)}</span>
      </div>
      <div className="saisie-labo">
        {x.statut === 'DEMANDE' && <Action className="principal" faire={async () => { await api('POST', `/labo/${x.id}/prelever`); recharger(); }}>Enregistrer le prélèvement</Action>}
        {['PRELEVE', 'SAISI'].includes(x.statut) && (e.choix
          ? <div className="choix">{e.choix.map(c => <button key={c} type="button" className={val === c ? 'choisi' : ''} onClick={() => setVal(c)}>{c}</button>)}</div>
          : <label className="en-ligne">Valeur <input type="number" step="0.01" value={val} onChange={ev => setVal(ev.target.value)} /> {e.unite} <small>(normales {e.min} – {e.max})</small></label>)}
        {x.statut === 'VALIDE' && <span className={x.anormal ? 'res anormal' : 'res'}>{x.resultat} {e.unite || ''}</span>}
        {x.critique ? <Pastille ton="rouge">Valeur critique : prévenir le médecin</Pastille> : x.anormal && x.statut !== 'DEMANDE' ? <Pastille ton="orange">Anormal</Pastille> : null}
        {x.saisi_par_nom && <small>Saisi par {x.saisi_par_nom}{x.valide_par_nom ? ` · validé par ${x.valide_par_nom}` : ''}</small>}
      </div>
      <div className="action-labo">
        <Pastille ton={ton}>{libelle}</Pastille>
        {['PRELEVE', 'SAISI'].includes(x.statut) && <Action disabled={!val || val === x.resultat} faire={async () => { await api('POST', `/labo/${x.id}/resultat`, { resultat: val }); recharger(); }}>Enregistrer le résultat</Action>}
        {x.statut === 'SAISI' && <Action className="principal" faire={async () => { await api('POST', `/labo/${x.id}/valider`); recharger(); }}>Valider</Action>}
      </div>
    </div>
  );
}
