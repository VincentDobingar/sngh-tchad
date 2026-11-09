// Vérification publique d'un reçu, ouverte en scannant le code QR imprimé : permet à un contrôleur, un assureur
// ou au patient de s'assurer qu'un reçu a bien été émis par le SNGH et n'a pas été annulé.
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fcfa, dateHeure } from '../format.js';

const MODES = { ESPECES: 'Espèces', AIRTEL_MONEY: 'Airtel Money', MOOV_MONEY: 'Moov Money', KONOOM: 'Konoom', TIERS_PAYANT: 'Tiers payant' };

export default function VerifierRecu({ numero }) {
  const [saisie, setSaisie] = useState(numero || '');
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const verifier = n => { setErr(''); setR(null); if (n) api('GET', `/recus/${encodeURIComponent(n.trim())}`).then(setR).catch(e => setErr(e.message)); };
  useEffect(() => { setSaisie(numero || ''); verifier(numero); }, [numero]);
  return (
    <div className="page-connexion">
      <div className="carte connexion verif">
        <img src="/logo-sngh.svg" alt="SNGH" className="logo" />
        <h1>Vérification d’un reçu</h1>
        <form className="ligne-verif" onSubmit={e => { e.preventDefault(); location.hash = `verifier/${saisie.trim()}`; }}>
          <input value={saisie} onChange={e => setSaisie(e.target.value.toUpperCase())} placeholder="R-HGRN-2026-000123" aria-label="Numéro du reçu" />
          <button className="principal">Vérifier</button>
        </form>
        {err && <p className="bandeau erreur">{err}</p>}
        {r && (
          <div className={`resultat-verif ${r.valide ? 'ok' : 'ko'}`}>
            <strong>{r.valide ? 'Reçu authentique' : r.statut === 'ANNULEE' ? 'Reçu ANNULÉ' : 'Reçu non valide'}</strong>
            <dl className="details">
              <dt>Reçu</dt><dd><code>{r.numero_recu}</code></dd>
              <dt>Montant</dt><dd>{fcfa(r.montant)}</dd>
              <dt>Payé le</dt><dd>{dateHeure(r.payee_le)}</dd>
              <dt>Mode</dt><dd>{MODES[r.mode] || r.mode}</dd>
              <dt>Établissement</dt><dd>{r.etablissement}, {r.ville}</dd>
              <dt>Patient</dt><dd>{r.patient}</dd>
            </dl>
          </div>)}
        <p className="aide-champ centre"><a href="#">Retour à la connexion</a></p>
      </div>
    </div>
  );
}
