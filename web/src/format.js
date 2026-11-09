// Mise en forme commune dans la langue choisie (français, anglais, arabe à chiffres latins), heure de N'Djamena.
import { t, locale } from './i18n/index.js';
export { t };
export const nombre = v => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString(locale()));
export const fcfa = v => t('{n} FCFA', { n: nombre(v) });
export const millions = v => (Math.abs(v) >= 1e6 ? t('{n} M', { n: (v / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1 }) }) : nombre(v));
// Les horodatages du serveur sont en UTC (« AAAA-MM-JJ HH:MM:SS ») ; affichage à l'heure de N'Djamena.
const versDate = s => (s ? new Date(s.length > 10 ? s.replace(' ', 'T') + 'Z' : s + 'T00:00:00') : null);
export const date = s => (s ? versDate(s).toLocaleDateString(locale(), { timeZone: 'Africa/Ndjamena', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const heure = s => (s ? versDate(s).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Ndjamena' }) : '—');
export const dateHeure = s => (s ? `${date(s)} ${heure(s)}` : '—');
export const age = dn => {
  if (!dn) return '—';
  const a = (Date.now() - new Date(dn)) / (365.25 * 864e5);
  const m = Math.max(0, Math.floor(a * 12)), n = Math.floor(a);
  return a < 1 ? t(m === 1 ? '1 mois' : '{n} mois', { n: m }) : t(n === 1 ? '1 an' : '{n} ans', { n });
};
export const duree = min => (min == null ? '—' : min < 60 ? t('{n} min', { n: min }) : t('{h} h {m}', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') }));
