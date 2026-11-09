import React from 'react';
import { LANGUES, langueCourante, changerLangue, t } from '../i18n/index.js';

// Choix de la langue : français, anglais, arabe. Le choix est mémorisé sur l'appareil.
export default function SelecteurLangue({ sombre }) {
  const l = langueCourante();
  return (
    <div className={'langues' + (sombre ? ' sombre' : '')} role="group" aria-label={t('Langue')}>
      {Object.entries(LANGUES).map(([k, v]) => (
        <button type="button" key={k} lang={k} className={k === l ? 'actif' : ''} aria-pressed={k === l} title={v.nom} onClick={() => changerLangue(k)}>{v.court}</button>
      ))}
    </div>
  );
}
