// Mise en forme commune (français, Tchad) et interpolation simple des textes.
export const t = (texte, vars) => (vars ? String(texte).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : texte);
const nf = new Intl.NumberFormat('fr-FR');
export const nombre = v => (v == null || Number.isNaN(Number(v)) ? '—' : nf.format(v));
export const fcfa = v => `${nombre(v)} FCFA`;
export const millions = v => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : nombre(v));
// Les horodatages du serveur sont en UTC (« AAAA-MM-JJ HH:MM:SS ») ; affichage à l'heure de N'Djamena.
const versDate = s => (s ? new Date(s.length > 10 ? s.replace(' ', 'T') + 'Z' : s + 'T00:00:00') : null);
export const date = s => (s ? versDate(s).toLocaleDateString('fr-FR', { timeZone: 'Africa/Ndjamena' }) : '—');
export const heure = s => (s ? versDate(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Ndjamena' }) : '—');
export const dateHeure = s => (s ? `${date(s)} ${heure(s)}` : '—');
export const age = dn => {
  if (!dn) return '—';
  const a = (Date.now() - new Date(dn)) / (365.25 * 864e5);
  return a < 1 ? `${Math.max(0, Math.floor(a * 12))} mois` : `${Math.floor(a)} ans`;
};
export const duree = min => (min == null ? '—' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);
