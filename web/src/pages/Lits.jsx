// Hospitalisation et gestion des lits (M05) : cartographie des lits par service en temps réel, patients en attente de lit,
// admission dans un lit libre, sortie (guérison, transfert, décès, contre avis médical) avec facturation des journées.
import React, { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { useCharger, Modale, Kpi, Pastille, Action } from '../components/ui.jsx';
import { date } from '../format.js';
import { peut } from '../droits.js';

const STATUTS = { LIBRE: 'Libre', OCCUPE: 'Occupé', NETTOYAGE: 'Nettoyage', HORS_SERVICE: 'Hors service' };
const SORTIES = [['GUERISON', 'Guérison / amélioration'], ['TRANSFERT', 'Transfert'], ['CONTRE_AVIS', 'Contre avis médical'], ['DECES', 'Décès']];

export default function Lits() {
  const { u } = useApp();
  const [d, recharger, err] = useCharger('/lits', 30000);
  const [aPlacer, setAPlacer] = useState(null);
  const [lit, setLit] = useState(null);
  const gerer = peut(u.role, 'lits');
  if (err) return <p className="bandeau erreur">{err}</p>;
  if (!d) return <p className="info">Chargement…</p>;
  const tous = d.services.flatMap(s => s.lits);
  const n = st => tous.filter(l => l.statut === st).length;
  return (
    <>
      <div className="titre-page"><h2>Lits et hospitalisation</h2><p>{aPlacer ? `Choisissez un lit libre pour ${aPlacer.nom} ${aPlacer.prenom}.` : 'Statut des lits en temps réel. Cliquez sur un lit pour agir.'}</p></div>
      <div className="kpis">
        <Kpi v={`${Math.round(n('OCCUPE') / tous.length * 100)} %`} l={`taux d’occupation (${n('OCCUPE')} / ${tous.length})`} ton="fort" />
        <Kpi v={n('LIBRE')} l="lits libres" /><Kpi v={n('NETTOYAGE')} l="en nettoyage" /><Kpi v={n('HORS_SERVICE')} l="hors service" />
        <Kpi v={d.attente.length} l="patients en attente de lit" ton={d.attente.length ? 'alerte' : ''} />
      </div>
      {d.attente.length > 0 && (
        <div className="carte">
          <h3>En attente d’un lit</h3>
          <ul className="attention">{d.attente.map(v => (
            <li key={v.id} className={aPlacer?.id === v.id ? 'rouge' : ''}>
              <button className="lien" disabled={!gerer} onClick={() => setAPlacer(aPlacer?.id === v.id ? null : v)}>
                {v.nom} {v.prenom} · {v.service} · {v.diagnostic_libelle || 'diagnostic à préciser'} · admis le {date(v.arrivee)} {aPlacer?.id === v.id ? '· choisissez un lit ci-dessous' : '· placer'}
              </button></li>))}</ul>
        </div>)}
      {d.services.map(s => (
        <div key={s.id} className="carte">
          <h3>{s.nom} <small>{s.lits.filter(l => l.statut === 'OCCUPE').length} / {s.lits.length} occupés</small></h3>
          <div className="lits">{s.lits.map(l => (
            <button key={l.id} className={`lit ${l.statut.toLowerCase()} ${aPlacer && l.statut === 'LIBRE' ? 'cible' : ''}`} disabled={!gerer}
              onClick={async () => {
                if (aPlacer && l.statut === 'LIBRE') { try { await api('POST', `/lits/${l.id}/admettre`, { visite_id: aPlacer.id }); setAPlacer(null); recharger(); } catch (e) { setLit({ ...l, erreur: e.message }); } }
                else setLit(l);
              }}>
              <b>{l.numero}</b>
              {l.statut === 'OCCUPE' ? <><span>{l.nom} {l.prenom?.[0]}.</span><small>depuis le {date(l.entree)}</small></> : <span>{STATUTS[l.statut]}</span>}
            </button>))}</div>
        </div>))}
      {lit && <ActionLit l={lit} onFerme={() => setLit(null)} onFait={() => { setLit(null); recharger(); }} />}
    </>
  );
}

function ActionLit({ l, onFerme, onFait }) {
  const [mode, setMode] = useState('');
  return (
    <Modale titre={`Lit ${l.numero}`} onFerme={onFerme}>
      {l.erreur && <p className="bandeau erreur">{l.erreur}</p>}
      {l.statut === 'OCCUPE' ? <>
        <p><strong>{l.nom} {l.prenom}</strong> · <code>{l.ipun}</code><br />{l.diagnostic_libelle} · entré le {date(l.entree)}</p>
        <div className="choix colonne-mobile">{SORTIES.map(([k, t]) => <button key={k} className={mode === k ? 'choisi' : ''} onClick={() => setMode(k)}>{t}</button>)}</div>
        <div className="actions"><Action className="principal" disabled={!mode} faire={async () => { await api('POST', `/lits/${l.id}/sortie`, { mode_sortie: mode }); onFait(); }}>Enregistrer la sortie</Action></div>
        <p className="aide-champ">Les journées d’hospitalisation sont ajoutées à la facture ; le lit passe en nettoyage.</p>
      </> : <>
        <p>Statut actuel : <Pastille>{STATUTS[l.statut]}</Pastille></p>
        <div className="actions entre">
          {l.statut !== 'LIBRE' && <Action className="principal" faire={async () => { await api('POST', `/lits/${l.id}/statut`, { statut: 'LIBRE' }); onFait(); }}>Marquer libre</Action>}
          {l.statut !== 'HORS_SERVICE' && <Action faire={async () => { await api('POST', `/lits/${l.id}/statut`, { statut: 'HORS_SERVICE' }); onFait(); }}>Mettre hors service</Action>}
        </div>
      </>}
    </Modale>
  );
}
