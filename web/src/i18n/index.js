// Traduction de l'interface : français (langue de référence), anglais, arabe littéraire.
// Le texte français sert de clé : t('Tableau de bord') renvoie la traduction de la langue choisie,
// ou le français s'il n'y a pas encore de traduction. Variables : t('{n} cas', { n: 12 }).
import en from './en.js';
import ar from './ar.js';

export const LANGUES = {
  fr: { nom: 'Français', court: 'FR', dir: 'ltr', locale: 'fr-FR' },
  en: { nom: 'English', court: 'EN', dir: 'ltr', locale: 'en-GB' },
  ar: { nom: 'العربية', court: 'ع', dir: 'rtl', locale: 'ar-TD-u-nu-latn' }, // chiffres latins, comme dans les registres
};
const DICOS = { en, ar };
const CLE = 'sngh.langue';

function initiale() {
  try { const l = localStorage.getItem(CLE); if (LANGUES[l]) return l; } catch { /* stockage indisponible */ }
  const n = (navigator.language || 'fr').slice(0, 2).toLowerCase();
  return LANGUES[n] ? n : 'fr';
}
let langue = initiale();
const abonnes = new Set();

export const langueCourante = () => langue;
export const locale = () => LANGUES[langue].locale;
export const abonner = f => { abonnes.add(f); return () => abonnes.delete(f); };

export function appliquerLangue() {
  document.documentElement.lang = langue;
  document.documentElement.dir = LANGUES[langue].dir;
  document.title = t('SNGH Tchad · Système National de Gestion Hospitalière');
}
export function changerLangue(l) {
  if (!LANGUES[l] || l === langue) return;
  langue = l;
  try { localStorage.setItem(CLE, l); } catch { /* rien */ }
  appliquerLangue();
  abonnes.forEach(f => f(l));
}

// En arabe, les valeurs en caractères latins (dates, codes, noms de formations, identifiants) sont isolées
// de gauche à droite, pour que « 2026-11-06 » ou « D7-2026-000123 » ne soient pas retournés.
const isoler = x => (langue === 'ar' && typeof x === 'string' && x && !/[\u0600-\u06FF]/.test(x) ? `\u2066${x}\u2069` : x);
const remplir = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] === undefined || v[k] === null ? m : isoler(String(v[k])))) : s);

// Messages composés reçus du serveur (ex. « Ce code d’échantillon est déjà attribué au cas D7-2026-000012. ») :
// les clés à variables du dictionnaire servent de modèles ; les valeurs capturées sont elles-mêmes traduites.
const modeles = {};
function parModele(s, d) {
  if (!modeles[langue]) {
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    modeles[langue] = Object.keys(d).filter(k => /\{\w+\}/.test(k)).map(k => {
      const noms = [...k.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      const re = new RegExp('^' + k.split(/\{\w+\}/).map(esc).join('(.+?)') + '$');
      return { re, noms, cible: d[k] };
    });
  }
  for (const m of modeles[langue]) {
    const r = s.match(m.re);
    if (!r) continue;
    const v = Object.fromEntries(m.noms.map((n, i) => [n, traduireValeur(r[i + 1], d)]));
    return remplir(m.cible, v);
  }
  return null;
}
// Une valeur capturée : traduite telle quelle, ou élément par élément si c'est une liste « a, b ».
const traduireValeur = (v, d) => d[v] ?? (v.includes(', ') ? v.split(', ').map(x => d[x] ?? x).join(langue === 'ar' ? '، ' : ', ') : v);

export function t(fr, vars) {
  if (fr === null || fr === undefined || fr === '') return fr;
  const s = String(fr);
  if (langue === 'fr') return remplir(s, vars);
  const d = DICOS[langue];
  const r = d[s] ?? parModele(s, d);
  return remplir(r ?? s, vars);
}

// Libellés des référentiels envoyés par le serveur (en français) : traduits une fois par langue.
export function traduireRef(ref) {
  if (!ref) return ref;
  const carte = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, t(v)]));
  return {
    ...ref,
    services: ref.services.map(s => ({ ...s, nom: t(s.nom) })),
    diagnostics: ref.diagnostics.map(([c, l]) => [c, t(l)]),
    examens: Object.fromEntries(Object.entries(ref.examens).map(([k, e]) => [k, { ...e, libelle: t(e.libelle) }])),
    triage: carte(ref.triage), categories: carte(ref.categories), modes: carte(ref.modes), types: carte(ref.types), roles: carte(ref.roles),
    droits: Object.fromEntries(Object.entries(ref.droits).map(([k, d]) => [k, { ...d, libelle: t(d.libelle) }])),
    mpe: Object.fromEntries(Object.entries(ref.mpe).map(([k, m]) => [k, { ...m, maladie: t(m.maladie) }])),
    indicateurs_carte: Object.fromEntries(Object.entries(ref.indicateurs_carte).map(([k, m]) => [k, { ...m, libelle: t(m.libelle) }])),
    etablissements: ref.etablissements.map(e => ({ ...e, nomFr: e.nom, nom: t(e.nom), ville: t(e.ville) })),
    medicaments: ref.medicaments.map(m => ({ ...m, dci: t(m.dci), forme: t(m.forme) })),
  };
}

appliquerLangue();
