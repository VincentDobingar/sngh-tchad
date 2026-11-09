// File d'attente (M03, M04) et consultation : le médecin appelle le patient, consulte son dossier, saisit constantes,
// diagnostic CIM-10, prescriptions et examens, puis oriente (sortie, hospitalisation, transfert…).
import React, { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { useCharger, Champ, Pastille, Triage, Action } from '../components/ui.jsx';
import Dossier from '../components/Dossier.jsx';
import { age, duree, heure, t } from '../format.js';
import { peut } from '../droits.js';

export default function FileAttente() {
  const { u, ref } = useApp();
  const [service, setService] = useState('');
  const [file, recharger, err] = useCharger(`/visites/file${service ? `?service=${service}` : ''}`, 30000);
  const [ouverte, setOuverte] = useState(null);
  const [fait, setFait] = useState('');
  const medecin = peut(u.role, 'consulter');

  if (ouverte) return <Consultation v={ouverte} onFin={m => { setOuverte(null); setFait(m); recharger(); }} onRetour={() => { setOuverte(null); recharger(); }} />;
  return (
    <>
      <div className="titre-page ligne">
        <div><h2>{t("File d’attente")}</h2><p>{t("Urgences d’abord (par gravité), puis par ordre d’arrivée. Mise à jour toutes les 30 secondes.")}</p></div>
        <div className="outils"><select value={service} onChange={e => setService(e.target.value)}><option value="">{t("Tous les services")}</option>{ref.services.map(s => <option key={s.code} value={s.code}>{s.nom}</option>)}</select></div>
      </div>
      {fait && <p className="bandeau succes">{fait}</p>}
      {err && <p className="bandeau erreur">{err}</p>}
      <div className="carte sans-marge">
        <table className="tableau">
          <thead><tr><th>{t("Ticket")}</th><th>{t("Patient")}</th><th>{t("Âge")}</th><th>{t("Service")}</th><th>{t("Motif")}</th><th>{t("Attente")}</th><th>{t("État")}</th><th /></tr></thead>
          <tbody>
            {file?.length === 0 && <tr><td colSpan="8" className="info">{t("Aucun patient en attente.")}</td></tr>}
            {file?.map(v => (
              <tr key={v.id} className={v.triage === 'ROUGE' ? 'alerte' : ''}>
                <td><strong>{v.ticket}</strong> <Triage niveau={v.triage} /></td>
                <td>{v.nom} {v.prenom}<br /><small><code>{v.ipun}</code></small>{v.allergies && <Pastille ton="rouge">{t("Allergie")}</Pastille>}</td>
                <td>{age(v.date_naissance)}</td><td>{t(v.service)}</td><td>{v.motif ? t(v.motif) : <small>—</small>}</td>
                <td className={v.attente_min > 60 ? 'retard' : ''}>{duree(v.attente_min)}<br /><small>{t('arrivé à {heure}', { heure: heure(v.arrivee) })}</small></td>
                <td>{v.statut === 'EN_COURS' ? <Pastille ton="orange">{t("en consultation")}</Pastille> : <Pastille ton="gris">{t("en attente")}</Pastille>}</td>
                <td>{medecin && <Action className="principal petit" faire={async () => { if (v.statut === 'ATTENTE') await api('POST', `/visites/${v.id}/appeler`); setOuverte(v); }}>{t(v.statut === 'ATTENTE' ? 'Appeler' : 'Reprendre')}</Action>}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const CONSTANTES = [['temperature', 'Température (°C)', '0.1'], ['ta_sys', 'TA systolique'], ['ta_dia', 'TA diastolique'], ['pouls', 'Pouls (/min)'], ['spo2', 'SpO₂ (%)'], ['poids', 'Poids (kg)', '0.1'], ['taille', 'Taille (cm)'], ['pb', 'Périmètre brachial (mm)']];
const ISSUES = [['SORTIE', 'Retour à domicile'], ['HOSPITALISATION', 'Hospitalisation'], ['TRANSFERT', 'Référence / transfert'], ['DECES', 'Décès']];

function Consultation({ v, onFin, onRetour }) {
  const { ref } = useApp();
  const [f, setF] = useState({ anamnese: v.motif || '', examen: '', diagnostic_code: '', conduite: '', issue: 'SORTIE' });
  const [presc, setPresc] = useState([]);
  const [examens, setExamens] = useState([]);
  const [filtreDiag, setFiltreDiag] = useState('');
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState('');
  const set = (k, val) => setF(x => ({ ...x, [k]: val }));
  const diagnostics = useMemo(() => ref.diagnostics.filter(([c, l]) => !filtreDiag || `${c} ${l}`.toLowerCase().includes(filtreDiag.toLowerCase())), [filtreDiag, ref]);
  const mpe = ref.mpe[f.diagnostic_code];
  const enfant = v.date_naissance && (Date.now() - new Date(v.date_naissance)) / 31557600000 < 5;

  const valider = async () => {
    setErr({}); setMsg('');
    try {
      await api('POST', `/visites/${v.id}/consultation`, { ...f, prescriptions: presc, examens });
      onFin([t('Consultation de {patient} enregistrée.', { patient: `${v.nom} ${v.prenom}` }), examens.length ? t('{n} examen(s) transmis au laboratoire.', { n: examens.length }) : '', presc.length ? t('Ordonnance transmise à la pharmacie.') : ''].filter(Boolean).join(' '));
    } catch (e) { setErr(e.details || {}); setMsg(e.message); }
  };

  return (
    <>
      <div className="titre-page ligne">
        <div><h2>{t('Consultation · {ticket}', { ticket: v.ticket })}</h2><p>{t('{service} · arrivé à {heure}', { service: t(v.service), heure: heure(v.arrivee) })}{v.motif ? ` · ${t('motif : {x}', { x: t(v.motif) })}` : ''}</p></div>
        <button onClick={onRetour}>{t("Retour à la file")}</button>
      </div>
      <div className="consultation">
        <div className="carte"><Dossier patientId={v.patient_id} compact /></div>
        <div>
          <div className="carte">
            <h3>{t("Constantes")}</h3>
            <div className="grille petite">{CONSTANTES.map(([k, l, pas]) => (k !== 'pb' || enfant) && (
              <Champ key={k} libelle={l} erreur={err[k]}><input type="number" step={pas || '1'} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} /></Champ>))}</div>
          </div>
          <div className="carte">
            <h3>{t("Examen clinique et diagnostic")}</h3>
            <Champ libelle="Anamnèse"><textarea rows="2" value={f.anamnese} onChange={e => set('anamnese', e.target.value)} /></Champ>
            <Champ libelle="Examen physique"><textarea rows="2" value={f.examen} onChange={e => set('examen', e.target.value)} /></Champ>
            <div className="grille espace-haut">
              <Champ libelle="Rechercher un diagnostic"><input value={filtreDiag} onChange={e => setFiltreDiag(e.target.value)} placeholder={t("paludisme, B54…")} /></Champ>
              <Champ libelle="Diagnostic principal (CIM-10)" erreur={err.diagnostic_code}>
                <select value={f.diagnostic_code} onChange={e => set('diagnostic_code', e.target.value)}><option value="">{t("Choisir…")}</option>
                  {diagnostics.map(([c, l]) => <option key={c} value={c}>{c} · {l}</option>)}</select></Champ>
            </div>
            {mpe && <p className="bandeau erreur">{t('Maladie à potentiel épidémique ({maladie}) : la déclaration est transmise automatiquement à la surveillance (SIMR).', { maladie: mpe.maladie })}</p>}
          </div>
          <div className="carte">
            <h3>{t("Prescriptions")}</h3>
            {presc.map((x, i) => (
              <div key={i} className="ligne-presc">
                <select value={x.medicament_id} onChange={e => setPresc(p => p.map((y, j) => j === i ? { ...y, medicament_id: e.target.value } : y))}>
                  <option value="">{t("Médicament…")}</option>{ref.medicaments.map(m => <option key={m.id} value={m.id}>{m.dci} {m.dosage} ({m.forme}){m.programme ? ` · ${t('programme')}` : ''}</option>)}</select>
                <input placeholder={t("Posologie")} value={x.posologie} onChange={e => setPresc(p => p.map((y, j) => j === i ? { ...y, posologie: e.target.value } : y))} />
                <input type="number" min="1" placeholder={t("Qté")} value={x.quantite} onChange={e => setPresc(p => p.map((y, j) => j === i ? { ...y, quantite: e.target.value } : y))} />
                <button className="lien" onClick={() => setPresc(p => p.filter((_, j) => j !== i))}>{t("Retirer")}</button>
                {err[`prescription_${i}`] && <span className="erreur">{err[`prescription_${i}`]}</span>}
              </div>))}
            <button onClick={() => setPresc(p => [...p, { medicament_id: '', posologie: '', quantite: '' }])}>{t("Ajouter un médicament")}</button>
          </div>
          <div className="carte">
            <h3>{t("Examens de laboratoire")}</h3>
            <div className="cases">{Object.entries(ref.examens).map(([c, e]) => (
              <label key={c} className={examens.includes(c) ? 'coche' : ''}><input type="checkbox" checked={examens.includes(c)} onChange={() => setExamens(x => x.includes(c) ? x.filter(y => y !== c) : [...x, c])} />{e.libelle}</label>))}</div>
          </div>
          <div className="carte">
            <h3>{t("Orientation")}</h3>
            <div className="choix">{ISSUES.map(([k, l]) => <button key={k} type="button" className={f.issue === k ? 'choisi' : ''} onClick={() => set('issue', k)}>{t(l)}</button>)}</div>
            <Champ libelle="Conduite à tenir / compte rendu" className="espace-haut"><textarea rows="2" value={f.conduite} onChange={e => set('conduite', e.target.value)} /></Champ>
            {msg && <p className="bandeau erreur espace-haut">{msg}</p>}
            <div className="actions"><button className="principal" onClick={valider}>{t("Clôturer la consultation")}</button></div>
          </div>
        </div>
      </div>
    </>
  );
}
