// Facturation et caisse (M14) : factures alimentées automatiquement par le parcours (acte, examens, médicaments, séjour),
// gratuités ciblées appliquées d'office, encaissement en espèces, mobile money ou tiers payant, reçu, clôture du jour.
// Aucune suppression : une erreur se corrige par une annulation motivée, tracée dans le journal d'audit.
import React, { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { useCharger, Pastille, Modale, Champ, Kpi } from '../components/ui.jsx';
import { fcfa, nombre, heure, date, dateHeure } from '../format.js';

export default function Caisse() {
  const { ref } = useApp();
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
              {f.statut === 'PAYEE' && <p className="aide-champ">Reçu <code>{f.numero_recu}</code> · payée le {dateHeure(f.payee_le)} · {ref.modes[f.mode] || f.mode} {f.reference_paiement || ''} · {f.caissier}</p>}
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
  const [tel, setTel] = useState(f.telephone || '');
  const [reference, setReference] = useState('');
  const [manuel, setManuel] = useState(false);
  const [recu, setRecuMontant] = useState('');
  const [demande, setDemande] = useState(null);
  const [err, setErr] = useState({}); const [msg, setMsg] = useState('');
  const mobile = !!ref.operateurs[mode];
  const rendu = mode === 'ESPECES' && Number(recu) >= f.a_payer ? Number(recu) - f.a_payer : null;

  // Suivi de la demande mobile money toutes les 2 secondes jusqu'à la réponse de l'opérateur.
  useEffect(() => {
    if (demande?.statut !== 'EN_ATTENTE') return undefined;
    const id = setInterval(async () => {
      try {
        const p = await api('GET', `/caisse/paiements/${demande.id}`);
        setDemande(d => ({ ...d, ...p }));
        if (p.statut === 'CONFIRME') { clearInterval(id); setTimeout(() => onFait(p.facture), 900); }
        if (p.statut !== 'EN_ATTENTE') clearInterval(id);
      } catch (e) { setMsg(e.message); clearInterval(id); }
    }, 2000);
    return () => clearInterval(id);
  }, [demande?.id, demande?.statut]);

  const valider = async () => {
    setErr({}); setMsg('');
    try {
      if (mobile && !manuel) setDemande(await api('POST', `/caisse/factures/${f.id}/paiement-mobile`, { operateur: mode, telephone: tel }));
      else onFait(await api('POST', `/caisse/factures/${f.id}/encaisser`, { mode, reference }));
    } catch (e) { setErr(e.details || {}); setMsg(e.message); }
  };

  if (demande) {
    const op = ref.operateurs[demande.operateur];
    return (
      <Modale titre={`Paiement ${op.nom}`} onFerme={onFerme}>
        <div className={`attente-paiement ${demande.statut.toLowerCase()}`} style={{ '--op': op.couleur }}>
          <strong className="op">{op.nom}</strong>
          <span className="montant-op">{fcfa(demande.montant)}</span>
          <span>{demande.telephone}</span>
          {demande.statut === 'EN_ATTENTE' && <><span className="roue" aria-hidden="true" /><p>Demande envoyée. Le patient valide le paiement sur son téléphone avec son code secret…</p></>}
          {demande.statut === 'CONFIRME' && <p className="ok">Paiement confirmé · réf. {demande.reference_operateur}</p>}
          {['ECHEC', 'EXPIRE'].includes(demande.statut) && <p className="ko">{demande.motif || 'Paiement non abouti.'}</p>}
        </div>
        {ref.passerelle === 'simulation' && <p className="aide-champ">Passerelle de démonstration : aucun argent réel n’est débité. La validation arrive au bout de quelques secondes ; un numéro finissant par 00 simule un refus.</p>}
        <div className="actions entre">
          {demande.statut === 'EN_ATTENTE' ? <button className="lien" onClick={async () => { await api('POST', `/caisse/paiements/${demande.id}/abandonner`); setDemande(d => ({ ...d, statut: 'ECHEC', motif: 'Demande abandonnée.' })); }}>Abandonner la demande</button> : <span />}
          {['ECHEC', 'EXPIRE'].includes(demande.statut) && <button className="principal" onClick={() => setDemande(null)}>Réessayer</button>}
        </div>
      </Modale>
    );
  }
  return (
    <Modale titre={`Encaisser ${fcfa(f.a_payer)}`} onFerme={onFerme}>
      <p>{f.nom} {f.prenom} · <code>{f.numero}</code></p>
      <Champ libelle="Mode de paiement" erreur={err.mode || err.operateur}>
        <div className="modes-paiement">{Object.entries(ref.modes).map(([k, l]) => (
          <button key={k} type="button" className={`mode ${mode === k ? 'choisi' : ''}`} style={ref.operateurs[k] ? { '--op': ref.operateurs[k].couleur } : undefined} onClick={() => { setMode(k); setManuel(false); }}>
            {ref.operateurs[k] && <i className="pastille-op" />}{l}</button>))}</div>
      </Champ>
      {mode === 'ESPECES' && <Champ libelle="Montant reçu" aide={rendu != null ? `Monnaie à rendre : ${fcfa(rendu)}` : null}><input type="number" value={recu} onChange={e => setRecuMontant(e.target.value)} /></Champ>}
      {mobile && !manuel && <Champ libelle={`Numéro ${ref.operateurs[mode].nom} du payeur`} erreur={err.telephone} aide={<button type="button" className="lien" onClick={() => setManuel(true)}>Passerelle indisponible : saisir la référence reçue par SMS</button>}>
        <input type="tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="+235 6X XX XX XX" /></Champ>}
      {(mode === 'TIERS_PAYANT' || (mobile && manuel)) && <Champ libelle={mode === 'TIERS_PAYANT' ? 'Numéro de prise en charge' : `Référence de la transaction ${ref.operateurs[mode].nom}`} erreur={err.reference}
        aide={mobile ? 'Saisie manuelle tracée comme telle dans le journal ; à réserver aux pannes de la passerelle.' : null}>
        <input value={reference} onChange={e => setReference(e.target.value)} placeholder={mode === 'TIERS_PAYANT' ? 'ex. CNPS-2026-…' : 'référence du SMS de confirmation'} /></Champ>}
      {msg && <p className="bandeau erreur">{msg}</p>}
      <div className="actions"><button className="principal" onClick={valider}>{mobile && !manuel ? `Envoyer la demande de paiement ${ref.operateurs[mode].nom}` : 'Valider l’encaissement'}</button></div>
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

function Recu({ f: f0, onFerme }) {
  const { ref } = useApp();
  const [f, setF] = useState(f0.lignes && f0.etablissement ? f0 : null);
  const [sms, setSms] = useState(null);
  const qr = useRef(null);
  useEffect(() => { if (!f) api('GET', `/caisse/factures/${f0.id}`).then(setF).catch(() => setF(f0)); }, [f0.id]);
  useEffect(() => {
    if (!f?.numero_recu || !qr.current) return;
    const q = qrcode(0, 'M'); q.addData(`${location.origin}/#verifier/${f.numero_recu}`); q.make();
    qr.current.innerHTML = q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  }, [f?.numero_recu]);
  if (!f) return <Modale titre="Reçu" onFerme={onFerme}><p className="info">Chargement…</p></Modale>;
  const op = ref.operateurs[f.mode];
  return (
    <Modale titre="Reçu de paiement" onFerme={onFerme}>
      <div className="recu imprimable">
        <div className="recu-tete"><img src="/logo-sngh.svg" alt="" /><div><strong>{f.etablissement}</strong><small>{f.ville} · République du Tchad</small></div></div>
        <div className="recu-numero"><span>Reçu n°</span><strong>{f.numero_recu}</strong><small>Facture {f.numero}</small></div>
        <p className="recu-patient">{f.nom} {f.prenom} · <code>{f.ipun}</code><br /><small>{f.service} {f.ticket}</small></p>
        <table><tbody>{f.lignes.map(l => <tr key={l.id}><td>{l.libelle} ×{l.quantite}</td><td>{nombre(l.montant)}</td></tr>)}
          <tr className="sous-total"><td>Total</td><td>{nombre(f.total)}</td></tr>
          {f.prise_en_charge > 0 && <tr><td>{f.motif_prise_en_charge || 'Prise en charge'}</td><td>−{nombre(f.prise_en_charge)}</td></tr>}
          <tr className="total"><td>Payé</td><td>{fcfa(f.a_payer)}</td></tr></tbody></table>
        <div className="recu-paiement">
          <span className={`mode-recu ${op ? 'op' : ''}`} style={op ? { '--op': op.couleur } : undefined}>{ref.modes[f.mode] || f.mode}</span>
          {f.paiement && <small>{f.paiement.telephone}</small>}
          {f.reference_paiement && <small>Réf. {f.reference_paiement}</small>}
        </div>
        <div className="recu-pied">
          <div ref={qr} className="recu-qr" />
          <small>Le {dateHeure(f.payee_le)} · caisse : {f.caissier}<br />Reçu valable sans signature. Authenticité vérifiable en scannant le code QR ou sur {location.host}/#verifier.</small>
        </div>
      </div>
      {sms && <div className="bandeau succes colonne"><strong>SMS {sms.envoye === 'simulation' ? '(simulation)' : ''} au {sms.telephone} :</strong><span>{sms.texte}</span></div>}
      <div className="actions entre">
        <button onClick={async () => { try { setSms(await api('POST', `/caisse/factures/${f.id}/recu-sms`, {})); } catch (e) { setSms({ telephone: '', texte: e.message, envoye: '' }); } }}>Envoyer par SMS</button>
        <button className="principal" onClick={() => window.print()}>Imprimer</button>
      </div>
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
