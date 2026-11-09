// Client de l'API du SNGH.
const CLE_SESSION = 'sngh.session';
// Adresse du serveur : vide = même domaine (serveur local) ; en ligne, VITE_API_URL (ex. https://sngh-api.up.railway.app).
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '') + '/api';

const lire = () => { try { return JSON.parse(localStorage.getItem(CLE_SESSION)); } catch { return null; } };
export const session = {
  lire,
  ecrire: s => { try { localStorage.setItem(CLE_SESSION, JSON.stringify(s)); } catch { /* stockage indisponible */ } },
  effacer: () => { try { localStorage.removeItem(CLE_SESSION); } catch { /* rien */ } },
};

export class ErreurApi extends Error {
  constructor(status, message, details, corps) { super(message); this.status = status; this.details = details; this.corps = corps; }
}

export async function api(methode, chemin, corps) {
  const s = lire();
  let r;
  try {
    r = await fetch(BASE + chemin, {
      method: methode,
      headers: { 'Content-Type': 'application/json', ...(s?.token ? { Authorization: `Bearer ${s.token}` } : {}) },
      body: corps ? JSON.stringify(corps) : undefined,
    });
  } catch { throw new ErreurApi(0, 'Serveur injoignable. Vérifiez la connexion.'); }
  if (r.status === 401 && chemin !== '/auth/connexion') { session.effacer(); window.dispatchEvent(new Event('sngh:deconnexion')); }
  const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new ErreurApi(r.status, data?.erreur || 'Erreur inattendue.', data?.details, data);
  return data;
}
