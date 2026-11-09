// Petits composants communs : chargement, champs avec erreur, indicateurs, fenêtres, étiquettes.
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { t } from '../i18n/index.js';

// Charge une ressource et la recharge à la demande (et toutes les « periode » ms si précisé).
export function useCharger(chemin, periode) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const recharger = useCallback(() => {
    if (!chemin) return Promise.resolve();
    return api('GET', chemin).then(d => { setData(d); setErreur(''); }).catch(e => setErreur(e.message));
  }, [chemin]);
  useEffect(() => {
    recharger();
    if (!periode) return undefined;
    const id = setInterval(recharger, periode);
    return () => clearInterval(id);
  }, [recharger, periode]);
  return [data, recharger, erreur];
}

export const Champ = ({ libelle, erreur, children, aide, className = '' }) => (
  <label className={`${className} ${erreur ? 'invalide' : ''}`}>{t(libelle)}{children}{aide && <span className="aide-champ">{typeof aide === 'string' ? t(aide) : aide}</span>}{erreur && <span className="erreur">{t(erreur)}</span>}</label>
);

export const Kpi = ({ v, l, ton }) => <div className={'kpi ' + (ton || '')}><strong>{v}</strong><span>{t(l)}</span></div>;
export const Pastille = ({ ton = 'gris', children }) => <span className={`etiquette ${ton}`}>{children}</span>;

export function Modale({ titre, onFerme, children, large }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onFerme();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFerme]);
  return (
    <div className="voile centre" onMouseDown={e => e.target === e.currentTarget && onFerme()}>
      <div className={'carte fenetre' + (large ? ' large' : '')} role="dialog" aria-modal="true" aria-label={t(titre)}>
        <div className="titre-page ligne"><h3>{t(titre)}</h3><button className="lien" onClick={onFerme}>{t("Fermer")}</button></div>
        {children}
      </div>
    </div>
  );
}

// Bouton qui exécute une action asynchrone, désactivé pendant l'appel ; l'erreur est remontée.
export function Action({ faire, children, className, onErreur, ...rest }) {
  const [enCours, setEnCours] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      <button {...rest} className={className} disabled={enCours || rest.disabled} onClick={async () => {
        setEnCours(true); setErr('');
        try { await faire(); } catch (e) { onErreur ? onErreur(e) : setErr(e.message); } finally { setEnCours(false); }
      }}>{children}</button>
      {err && <span className="erreur action-erreur">{t(err)}</span>}
    </>
  );
}

export const TRIAGE_TON = { ROUGE: 'rouge', ORANGE: 'orange', JAUNE: 'jaune', VERT: 'vert' };
export const Triage = ({ niveau }) => (niveau ? <span className={`triage-puce ${TRIAGE_TON[niveau]}`}>{niveau}</span> : null);
