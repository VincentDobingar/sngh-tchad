import React from 'react';
import { t } from '../format.js';

// Graphiques communs à tous les rapports (tableau de bord, administration) : mêmes dimensions,
// mêmes axes, même grille, même palette. Toute nouvelle courbe passe par ces composants.

// Palette unique, aux couleurs de la charte graphique (bleu marine et orange) : bleu marine (donnée principale),
// bleu, orange, orange pâle (pêche), bleu ciel pour la courbe d'accent ; fond des barres horizontales en pêche (--piste).
export const TONS = { forte: '#1F2A6B', moyenne: '#3F72D6', claire: '#F04A10', pale: '#F9C1A4', accent: '#1FA2E0' };

// Échelles de la carte : progression (pêche → orange foncé) et évolution (bleu = baisse, orange = hausse).
export const ECHELLE_NIVEAU = ['#FDEBE3', '#F9C1A4', '#F58D60', '#F04A10', '#A8320A'];
export const ECHELLE_EVOLUTION = ['#1F2A6B', '#7C93D9', '#E4E6EF', '#F58D60', '#F04A10'];

const jourCourt = d => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
const echelle = max => {
  const m = Math.max(4, max);
  const pas = Math.pow(10, Math.floor(Math.log10(m)));
  const haut = Math.ceil(m / pas) * pas;
  return { haut, ticks: [0, haut / 2, haut] };
};

// Légende : un carré par série de barres, un trait pour une courbe.
export function Legende({ elements }) {
  return (
    <p className="legende">
      {elements.map(e => (
        <span key={e.libelle}><i className={e.trait ? 'pt trait' : 'pt'} style={{ background: TONS[e.ton] }} />{t(e.libelle)}</span>
      ))}
    </p>
  );
}

// Histogramme par jour.
// series : [{ cle, libelle, ton }] ; « superposer » dessine chaque série depuis zéro (ex. confirmés sur notifiés),
// sinon les séries sont empilées. ligne : { cle, libelle, ton } facultative, tracée par-dessus les barres.
export function Histogramme({ serie, series, superposer = false, ligne, aria, infobulle }) {
  const W = 720, H = 220, g = 36, b = 28, h = 12;
  const total = s => superposer ? Math.max(...series.map(x => s[x.cle] || 0)) : series.reduce((a, x) => a + (s[x.cle] || 0), 0);
  const { haut, ticks } = echelle(Math.max(...serie.map(total), ...(ligne ? serie.map(s => s[ligne.cle] || 0) : [0])));
  const y = v => H - b - (v / haut) * (H - b - h);
  const lb = (W - g - 8) / Math.max(serie.length, 1);
  const pasEtiquette = Math.max(1, Math.round(serie.length / 6));
  const points = ligne && serie.map((s, i) => `${g + i * lb + lb / 2},${y(s[ligne.cle] || 0)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="graphique" role="img" aria-label={t(aria)}>
      {ticks.map(v => <g key={v}><line x1={g} x2={W - 8} y1={y(v)} y2={y(v)} className="grille" /><text x={g - 6} y={y(v) + 4} textAnchor="end" className="axe">{v}</text></g>)}
      {serie.map((s, i) => {
        let cumul = 0;
        return (
          <g key={s.date}>
            {infobulle && <title>{infobulle(s, jourCourt(s.date))}</title>}
            {series.map(x => {
              const v = s[x.cle] || 0;
              if (!v) return null;
              const bas = superposer ? 0 : cumul;
              cumul += v;
              return <rect key={x.cle} x={g + i * lb + 1} y={y(bas + v)} width={Math.max(lb - 2, 1)} height={y(bas) - y(bas + v)} fill={TONS[x.ton]} />;
            })}
            {(i % pasEtiquette === 0 || i === serie.length - 1) && <text x={g + i * lb + lb / 2} y={H - 8} textAnchor="middle" className="axe">{jourCourt(s.date)}</text>}
          </g>
        );
      })}
      {ligne && <polyline points={points} fill="none" stroke={TONS[ligne.ton || 'accent']} strokeWidth="2.5" strokeLinejoin="round" />}
    </svg>
  );
}

// Courbe épidémique du tableau de bord : cas notifiés par jour, confirmés en surimpression.
export const SERIES_EPIDEMIE = [{ cle: 'cas', libelle: 'cas notifiés', ton: 'claire' }, { cle: 'confirmes', libelle: 'dont confirmés', ton: 'forte' }];
export function CourbeEpidemique({ serie }) {
  return <Histogramme serie={serie} series={SERIES_EPIDEMIE} superposer aria="Cas notifiés par jour"
    infobulle={(s, j) => t('{jour} : {cas} cas, dont {confirmes} confirmés', { jour: j, cas: s.cas, confirmes: s.confirmes })} />;
}

// Barres horizontales (quartiers, formations, districts, utilisateurs), avec évolution sur 7 jours en option.
export function BarresHorizontales({ lignes, valeur = 'n', libelle = 'nom', tendance, ton = 'forte', vide = 'Aucune donnée.' }) {
  if (!lignes.length) return <p className="info">{t(vide)}</p>;
  const max = Math.max(1, ...lignes.map(l => l[valeur]));
  return (
    <div className="barres-h">
      {lignes.map(l => {
        const ecart = tendance ? l.sept_jours - l.semaine_prec : 0;
        return (
          <div key={l.id ?? l[libelle]} className="ligne-barre">
            <span className="lib">{l[libelle]}</span>
            <span className="piste"><span className="remplie" style={{ width: `${(l[valeur] / max) * 100}%`, background: TONS[ton] }} /></span>
            <span className="val">{l[valeur]}</span>
            {tendance ? <span className={'tendance ' + (ecart > 0 ? 'hausse' : ecart < 0 ? 'baisse' : '')} title={t("7 derniers jours par rapport aux 7 précédents")}>{ecart > 0 ? `▲ ${ecart}` : ecart < 0 ? `▼ ${-ecart}` : '='}</span> : <span />}
          </div>
        );
      })}
    </div>
  );
}
