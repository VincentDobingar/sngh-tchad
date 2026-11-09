// Facturation et caisse (M14) : factures alimentées automatiquement par le parcours (acte, examens, médicaments, séjour),
// gratuités ciblées appliquées d'office, encaissement en espèces, mobile money ou tiers payant, reçu, clôture du jour.
// Aucune suppression : une erreur se corrige par une annulation motivée, tracée dans le journal d'audit.
import React, { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { useCharger, Pastille, Modale, Champ, Kpi } from '../components/ui.jsx';
import { fcfa, nombre, heure, date, dateHeure } from '../format.js';

export default function Caisse() {
  const [onglet, setOnglet] = useState('A_PAYER');
  const [liste, recharger, err] = useCharger(onglet === 'journee' ? null : `/caisse/factures?statut=${onglet}`, 30000);
  const [encaisser, setEncaisser] = useState(null);
  const [annuler, setAnnuler] = useState(null);
  const [recu, setRecu] = useState(null);
  return (
    <>
      <div className="titre-page"><h2>Caisse</h2><p>Gratuités ciblées appliquées automatiquement (moins de 5 ans, grossesse, urgences). Une facture ne se supprime jamais : elle s’annule avec un motif.</p></div>
      <div className="onglets">
        {[['A_PAYER', 'À encaisser'], ['PAYEE', 'Payées'], ['PRISE_EN_CHARGE', 'Prises en charge'], ['ANNULEE', 'Annulées'], ['journee', 'Clôture du jour']].map(([k, l]) =>
          <button key={k} className={onglet === k ? 'actif' : ''} onClick={() => setOnglet(k)}>{l}</button>)}
      </div>
      {err && <p className="bandeau erreur">{err}</p>}
      {onglet === 'journee' ? <Journee /> : (
        <div className="factures">
          {liste?.length === 0 && <p className="info">Aucune facture.</p>}
          {liste?.map(f => (
            <div key={f.id} className={`carte facture ${f.statut.toLowerCase()}`}>
              <div className="titre-page ligne">
                <div><h3>{f.nom} {f.prenom}</h3><p><code>{f.numero}</code> · {f.service} {f.ticket} · {dateHeure(f.cree_le)}</p></div>
                <div className="montant"><strong>{fcfa(f.a_payer)}</strong>{f.prise_en_charge > 0 && <small>sur {fcfa(f.total)}</small>}</div>
              </div>
              <table className="tableau compact"><tbody>{f.lignes.map(l => <tr key={l.id}><td>{l.libelle}</td><td className="num">{l.quantite} × {nombre(l.prix_unitaire)}</td><td className="num">{nombre(l.montant)}</td></tr>)}</tbody></table>
              {f.motif_prise_en_charge && <p className="pec">Prise en charge : {f.motif_prise_en_charge} · {fcfa(f.prise_en_charge)}</p>}
              {f.statut === 'PAYEE' && <p className="aide-champ">Payée le {dateHeure(f.payee_le)} · {f.mode.replace('_', ' ').toLowerCase()} {f.reference_paiement || ''} · {f.caissier}</p>}
              {f.statut === 'ANNULEE' && <p className="aide-champ">Annulée : {f.motif_annulation}</p>}
              <div className="actions entre">
                {f.statut !== 'ANNULEE' ? <button className="lien" onClick={() => setAnnuler(f)}>Annuler la facture</button> : <span />}
                {f.statut === 'A_PAYER' && <button className="principal" onClick={() => setEncaisser(f)}>Encaisser {fcfa(f.a_payer)}</button>}
                {f.statut === 'PAYEE' && <button onClick={() => setRecu(f)}>Reçu</button>}
              </div>
            </div>))}
        </div>)}
      {encaisser && <Encaisser f={encaisser} onFerme={() => setEncaisser(null)} onFait={f => { setEncaisser(null); setRecu(f); recharger(); }} />}
      {annuler && <Annuler f={annuler} onFerme={() => setAnnuler(null)} onFait={() => { setAnnuler(null); recharger(); }} />}
      {recu && <Recu f={recu} onFerme={() => setRecu(null)} />}
    </>
  );
}

function Encaisser({ f, onFerme, onFait }) {
  const { ref } = useApp();
  const [mode, setMode] = useState('ESPECES');
  const [reference, setReference] = useState('');
  const [recu, setRecuMontant] = useState('');
  const [err, setErr] = useState({}); const [msg, setMsg] = useState('');
  const rendu = mode === 'ESPECES' && Number(recu) >= f.a_payer ? Number(recu) - f.a_payer : null;
  return (
    <Modale titre={`Encaisser ${fcfa(f.a_payer)}`} onFerme={onFerme}>
      <p>{f.nom} {f.prenom} · <code>{f.numero}</code></p>
      <Champ libelle="Mode de paiement" erreur={err.mode}><div className="choix colonne-mobile">{Object.entries(ref.modes).map(([k, l]) => <button key={k} type="button" className={mode === k ? 'choisi' : ''} onClick={() => setMode(k)}>{l}</button>)}</div></Champ>
      {mode === 'ESPECES' && <Champ libelle="Montant reçu" aide={rendu != null ? `Monnaie à rendre : ${fcfa(rendu)}` : null}><input type="number" value={recu} onChange={e => setRecuMontant(e.target.value)} /></Champ>}
      {mode !== 'ESPECES' && <Champ libelle={mode === 'TIERS_PAYANT' ? 'Numéro de prise en charge' : 'Référence de la transaction'} erreur={err.reference}><input value={reference} onChange={e => setReference(e.target.value)} placeholder={mode === 'TIERS_PAYANT' ? 'ex. CNPS-2026-…' : 'ex. AM12345678'} /></Champ>}
      {msg && <p className="bandeau erreur">{msg}</p>}
      <div className="actions"><button className="principal" onClick={async () => {
        setErr({}); setMsg('');
        try { onFait({ ...f, ...(await api('POST', `/caisse/factures/${f.id}/encaisser`, { mode, reference })) }); } catch (e) { setErr(e.details || {}); setMsg(e.message); }
      }}>Valider l’encaissement</button></div>
    </Modale>
  );
}

function Annuler({ f, onFerme, onFait }) {
  const [motif, setMotif] = useState(''); const [msg, setMsg] = useState('');
  return (
    <Modale titre="Annuler la facture" onFerme={onFerme}>
      <p>{f.numero} · {f.nom} {f.prenom} · {fcfa(f.a_payer)}</p>
      <Champ libelle="Motif (obligatoire, conservé dans le journal d’audit)"><input value={motif} onChange={e => setMotif(e.target.value)} /></Champ>
      {msg && <p className="bandeau erreur">{msg}</p>}
      <div className="actions"><button className="danger" onClick={async () => { try { await api('POST', `/caisse/factures/${f.id}/annuler`, { motif }); onFait(); } catch (e) { setMsg(e.message); } }}>Confirmer l’annulation</button></div>
    </Modale>
  );
}

function Recu({ f, onFerme }) {
  const { etab, ref } = useApp();
  return (
    <Modale titre="Reçu" onFerme={onFerme}>
      <div className="recu imprimable">
        <strong>{etab?.nom}</strong><small>Reçu de paiement · {f.numero}</small>
        <p>{f.nom} {f.prenom} · {f.ipun}</p>
        <table><tbody>{f.lignes.map(l => <tr key={l.id}><td>{l.libelle} ×{l.quantite}</td><td>{nombre(l.montant)}</td></tr>)}
          {f.prise_en_charge > 0 && <tr><td>Prise en charge</td><td>−{nombre(f.prise_en_charge)}</td></tr>}
          <tr className="total"><td>Payé ({ref.modes[f.mode] || f.mode})</td><td>{fcfa(f.a_payer)}</td></tr></tbody></table>
        <small>{dateHeure(f.payee_le)}{f.reference_paiement ? ` · réf. ${f.reference_paiement}` : ''}</small>
      </div>
      <div className="actions"><button className="principal" onClick={() => window.print()}>Imprimer</button></div>
    </Modale>
  );
}

function Journee() {
  const { ref } = useApp();
  const [jour, setJour] = useState(new Date().toISOString().slice(0, 10));
  const [d] = useCharger(`/caisse/journee?date=${jour}`);
  return (
    <>
      <div className="outils espace-bas"><input type="date" value={jour} max={new Date().toISOString().slice(0, 10)} onChange={e => setJour(e.target.value)} /></div>
      {d && <>
        <div className="kpis"><Kpi v={fcfa(d.total)} l={`encaissés le ${date(d.date)}`} ton="fort" /><Kpi v={fcfa(d.prises_en_charge.montant)} l={`pris en charge (${d.prises_en_charge.n} factures)`} /><Kpi v={d.annulees.n} l={`annulation(s) · ${fcfa(d.annulees.montant)}`} ton={d.annulees.n ? 'alerte' : ''} /></div>
        <div className="carte"><h3>Répartition par mode de paiement</h3>
          <table className="tableau"><thead><tr><th>Mode</th><th className="num">Nombre</th><th className="num">Montant</th></tr></thead>
            <tbody>{d.par_mode.map(m => <tr key={m.mode}><td>{ref.modes[m.mode]}</td><td className="num">{m.n}</td><td className="num">{fcfa(m.montant)}</td></tr>)}
              <tr className="total"><td>Total à reverser</td><td /><td className="num"><strong>{fcfa(d.total)}</strong></td></tr></tbody></table>
          <p className="aide-champ">Le montant en espèces doit correspondre au contenu de la caisse ; tout écart est justifié au procès-verbal de clôture.</p>
        </div>
      </>}
    </>
  );
}
