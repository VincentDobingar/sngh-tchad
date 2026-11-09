// Accueil et admission (M01) : rechercher le patient (tolérant aux variantes d'orthographe), l'enregistrer s'il est nouveau,
// détecter les doublons, puis ouvrir la visite et remettre le ticket de file d'attente. Carte patient avec QR code.
import React, { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { Champ, Modale, Pastille } from '../components/ui.jsx';
import { date, age, heure, t } from '../format.js';

const VIDE = { nom: '', prenom: '', sexe: '', date_naissance: '', age_annees: '', telephone: '', nom_pere: '', nom_mere: '', adresse: '', province: '', categorie: 'PAYANT', assureur: '', allergies: '' };

export default function Accueil() {
  const { ref, etab } = useApp();
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState(null);
  const [choisi, setChoisi] = useState(null);
  const [nouveau, setNouveau] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [carte, setCarte] = useState(null);
  const [dernieres, setDernieres] = useState([]);

  useEffect(() => {
    if (q.trim().length < 2) { setResultats(null); return undefined; }
    const id = setTimeout(() => api('GET', `/patients?q=${encodeURIComponent(q)}`).then(setResultats).catch(() => setResultats([])), 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <>
      <div className="titre-page ligne">
        <div><h2>{t("Accueil et admission")}</h2><p>{t('{etab} · recherchez toujours le patient avant de créer une fiche.', { etab: etab?.nom })}</p></div>
        <button className="principal" onClick={() => { setNouveau(true); setChoisi(null); }}>{t("Nouveau patient")}</button>
      </div>
      <div className="carte">
        <Champ libelle="Rechercher un patient" aide="Nom et prénom (les variantes d’orthographe sont tolérées : Mahamat / Mahammat, Achta / Ashta…), téléphone ou IPUN.">
          <input className="recherche" value={q} onChange={e => setQ(e.target.value)} placeholder={t("ex. Fatimé Abakar, 66 12 34 56, TD-2026-…")} autoFocus />
        </Champ>
        {resultats && (resultats.length === 0
          ? <p className="info">{t("Aucun patient trouvé.")} <button className="lien" onClick={() => setNouveau(true)}>{t("Enregistrer un nouveau patient")}</button></p>
          : <table className="tableau cliquable espace-haut">
              <thead><tr><th>{t("Patient")}</th><th>{t("IPUN")}</th><th>{t("Âge")}</th><th>{t("Téléphone")}</th><th>{t("Adresse")}</th><th>{t("Dernière visite")}</th></tr></thead>
              <tbody>{resultats.map(p => (
                <tr key={p.id} onClick={() => setChoisi(p)} className={choisi?.id === p.id ? 'choisie' : ''}>
                  <td><strong>{p.nom} {p.prenom}</strong> <small>{t(p.sexe === 'F' ? 'F' : 'M')}</small>{p.categorie !== 'PAYANT' && <Pastille ton="vert">{ref.categories[p.categorie].split(' (')[0]}</Pastille>}</td>
                  <td><code>{p.ipun}</code></td><td>{age(p.date_naissance)}{p.age_estime ? ` ${t('(estimé)')}` : ''}</td><td>{p.telephone || '—'}</td><td>{p.adresse || '—'}</td><td>{date(p.derniere_visite)}</td>
                </tr>))}</tbody>
            </table>)}
      </div>

      {choisi && <OuvrirVisite patient={choisi} onCarte={() => setCarte(choisi)} onOuverte={v => { setTicket(v); setDernieres(d => [v, ...d].slice(0, 8)); setChoisi(null); setQ(''); }} />}
      {nouveau && <NouveauPatient onAnnule={() => setNouveau(false)} onCree={p => { setNouveau(false); setChoisi(p); setCarte(p); }} onExistant={p => { setNouveau(false); setChoisi(p); }} />}

      {dernieres.length > 0 && (
        <div className="carte">
          <h3>{t("Admissions de cette session")}</h3>
          <table className="tableau"><thead><tr><th>{t("Ticket")}</th><th>{t("Patient")}</th><th>{t("Service")}</th><th>{t("Heure")}</th></tr></thead>
            <tbody>{dernieres.map(v => <tr key={v.id}><td><strong>{v.ticket}</strong></td><td>{v.patient.nom} {v.patient.prenom}</td><td>{t(v.service)}</td><td>{heure(v.arrivee)}</td></tr>)}</tbody></table>
        </div>)}
      {ticket && <Ticket v={ticket} etab={etab} onFerme={() => setTicket(null)} />}
      {carte && <CartePatient p={carte} etab={etab} onFerme={() => setCarte(null)} />}
    </>
  );
}

function OuvrirVisite({ patient: p, onOuverte, onCarte }) {
  const { ref } = useApp();
  const [f, setF] = useState({ type: 'CONSULTATION', service_code: '', triage: '', motif: '' });
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const ouvrir = async () => {
    setErr({}); setMsg('');
    try { onOuverte(await api('POST', '/visites', { ...f, patient_id: p.id })); }
    catch (e) { setErr(e.details || {}); setMsg(e.message); }
  };
  return (
    <div className="carte accent">
      <div className="titre-page ligne">
        <div><h3>{t('Ouvrir une visite · {patient}', { patient: `${p.nom} ${p.prenom}` })}</h3><p><code>{p.ipun}</code> · {t(p.sexe === 'F' ? 'Femme' : 'Homme')}, {age(p.date_naissance)} · {ref.categories[p.categorie]}{p.allergies && <> · <Pastille ton="rouge">{t('Allergie : {x}', { x: p.allergies })}</Pastille></>}</p></div>
        <button onClick={onCarte}>{t("Carte patient")}</button>
      </div>
      <div className="choix large">
        {[['CONSULTATION', 'Consultation externe'], ['URGENCE', 'Urgence']].map(([k, l]) => <button key={k} type="button" className={f.type === k ? 'choisi' : ''} onClick={() => set('type', k)}>{t(l)}</button>)}
      </div>
      <div className="grille espace-haut">
        {f.type === 'CONSULTATION'
          ? <Champ libelle="Service" erreur={err.service_code}><select value={f.service_code} onChange={e => set('service_code', e.target.value)}>
              <option value="">{t("Choisir…")}</option>{ref.services.filter(s => s.code !== 'URG').map(s => <option key={s.code} value={s.code}>{s.nom}</option>)}</select></Champ>
          : <Champ libelle="Triage (échelle de gravité)" erreur={err.triage}><div className="choix triage-choix">
              {Object.entries(ref.triage).map(([k, l]) => <button key={k} type="button" title={l} className={`t-${k.toLowerCase()} ${f.triage === k ? 'choisi' : ''}`} onClick={() => set('triage', k)}>{t(l)}</button>)}</div></Champ>}
        <Champ libelle="Motif de venue"><input value={f.motif} onChange={e => set('motif', e.target.value)} placeholder={t("ex. fièvre depuis 3 jours")} /></Champ>
      </div>
      {msg && <p className="bandeau erreur">{msg}</p>}
      <div className="actions"><button className="principal" onClick={ouvrir}>{t("Ouvrir la visite et imprimer le ticket")}</button></div>
    </div>
  );
}

function NouveauPatient({ onAnnule, onCree, onExistant }) {
  const { ref, etab } = useApp();
  const [f, setF] = useState({ ...VIDE, province: etab?.province || '' });
  const [ageConnu, setAgeConnu] = useState(true);
  const [err, setErr] = useState({});
  const [doublons, setDoublons] = useState(null);
  const [msg, setMsg] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const enregistrer = async forcer => {
    setErr({}); setMsg('');
    try { onCree(await api('POST', '/patients', { ...f, ...(ageConnu ? { age_annees: '' } : { date_naissance: '' }), forcer })); }
    catch (e) {
      if (e.status === 409 && e.corps?.doublons) { setDoublons(e.corps.doublons); return; }
      setErr(e.details || {}); setMsg(e.message);
    }
  };
  return (
    <div className="carte accent">
      <h3>{t("Nouveau patient")}</h3>
      <div className="grille">
        <Champ libelle="Nom" erreur={err.nom}><input value={f.nom} onChange={e => set('nom', e.target.value)} /></Champ>
        <Champ libelle="Prénom" erreur={err.prenom}><input value={f.prenom} onChange={e => set('prenom', e.target.value)} /></Champ>
        <Champ libelle="Sexe" erreur={err.sexe}><div className="choix">{[['F', 'Féminin'], ['M', 'Masculin']].map(([k, l]) => <button key={k} type="button" className={f.sexe === k ? 'choisi' : ''} onClick={() => set('sexe', k)}>{t(l)}</button>)}</div></Champ>
        {ageConnu
          ? <Champ libelle="Date de naissance" erreur={err.date_naissance} aide={<button type="button" className="lien" onClick={() => setAgeConnu(false)}>{t("Date inconnue : saisir un âge estimé")}</button>}>
              <input type="date" value={f.date_naissance} max={new Date().toISOString().slice(0, 10)} onChange={e => set('date_naissance', e.target.value)} /></Champ>
          : <Champ libelle="Âge estimé (années)" erreur={err.age_annees || err.date_naissance} aide={<button type="button" className="lien" onClick={() => setAgeConnu(true)}>{t("Saisir la date de naissance")}</button>}>
              <input type="number" min="0" max="120" value={f.age_annees} onChange={e => set('age_annees', e.target.value)} /></Champ>}
        <Champ libelle="Téléphone"><input type="tel" value={f.telephone} onChange={e => set('telephone', e.target.value)} placeholder={t("+235 6X XX XX XX")} /></Champ>
        <Champ libelle="Nom du père"><input value={f.nom_pere} onChange={e => set('nom_pere', e.target.value)} /></Champ>
        <Champ libelle="Nom de la mère"><input value={f.nom_mere} onChange={e => set('nom_mere', e.target.value)} /></Champ>
        <Champ libelle="Quartier ou village"><input value={f.adresse} onChange={e => set('adresse', e.target.value)} /></Champ>
        <Champ libelle="Province"><select value={f.province} onChange={e => set('province', e.target.value)}><option value="">—</option>{ref.provinces.map(p => <option key={p} value={p}>{t(p)}</option>)}</select></Champ>
        <Champ libelle="Catégorie de prise en charge" aide="Les gratuités ciblées (moins de 5 ans, grossesse, urgences) s’appliquent automatiquement.">
          <select value={f.categorie} onChange={e => set('categorie', e.target.value)}>{Object.entries(ref.categories).filter(([k]) => k !== 'GRATUITE').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Champ>
        {f.categorie === 'ASSURE' && <Champ libelle="Organisme"><input value={f.assureur} onChange={e => set('assureur', e.target.value)} placeholder={t("CNPS, mutuelle…")} /></Champ>}
        <Champ libelle="Allergies connues"><input value={f.allergies} onChange={e => set('allergies', e.target.value)} /></Champ>
      </div>
      {msg && <p className="bandeau erreur">{msg}</p>}
      {doublons && (
        <div className="bandeau attente colonne">
          <strong>{t("Ce patient semble déjà enregistré. Vérifiez avant de créer une nouvelle fiche :")}</strong>
          <ul className="liste">{doublons.map(d => <li key={d.id}><button className="lien" onClick={() => onExistant(d)}>{d.nom} {d.prenom} · {d.ipun} · {age(d.date_naissance)} · {d.telephone || t('sans téléphone')} · {d.adresse || ''}</button></li>)}</ul>
          <button onClick={() => enregistrer(true)}>{t("Ce n’est pas la même personne : créer quand même")}</button>
        </div>)}
      <div className="actions entre"><button onClick={onAnnule}>{t("Annuler")}</button><button className="principal" onClick={() => enregistrer(false)}>{t("Enregistrer le patient")}</button></div>
    </div>
  );
}

function Ticket({ v, etab, onFerme }) {
  return (
    <Modale titre="Ticket de file d’attente" onFerme={onFerme}>
      <div className="ticket imprimable">
        <small>{etab?.nom}</small>
        <strong className="numero">{v.ticket}</strong>
        <span>{t(v.service)}{v.triage ? ` · ${t('triage {niveau}', { niveau: t(v.triage) })}` : ''}</span>
        <span>{v.patient.nom} {v.patient.prenom}</span>
        <small>{t('{date} à {heure} · {n} personne(s) avant vous', { date: date(v.arrivee), heure: heure(v.arrivee), n: v.devant })}</small>
      </div>
      <div className="actions"><button className="principal" onClick={() => window.print()}>{t("Imprimer")}</button></div>
    </Modale>
  );
}

function CartePatient({ p, etab, onFerme }) {
  const ref = useRef(null);
  useEffect(() => {
    const qr = qrcode(0, 'M'); qr.addData(p.ipun); qr.make();
    ref.current.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  }, [p.ipun]);
  return (
    <Modale titre="Carte patient" onFerme={onFerme}>
      <div className="carte-patient imprimable">
        <div className="cp-tete"><img src="/logo-sngh.svg" alt="" /><span>{t("République du Tchad · Carte patient")}</span></div>
        <div className="cp-corps">
          <div className="cp-qr" ref={ref} />
          <div>
            <strong>{p.nom} {p.prenom}</strong>
            <span>{t(p.sexe === 'F' ? 'Féminin' : 'Masculin')} · {p.age_estime ? t('né(e) vers {annee}', { annee: p.date_naissance?.slice(0, 4) }) : t('né(e) le {date}', { date: date(p.date_naissance) })}</span>
            <code>{p.ipun}</code>
            <small>{t('Délivrée par {etab}', { etab: etab?.nom })}</small>
          </div>
        </div>
      </div>
      <div className="actions"><button className="principal" onClick={() => window.print()}>{t("Imprimer la carte")}</button></div>
    </Modale>
  );
}
