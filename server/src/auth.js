import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { journaliser } from './db.js';
import { ROLES_ETABLISSEMENT, DROITS, peut } from './droits.js';

// Clé de signature des sessions : variable d'environnement, sinon fichier jwt.secret créé au premier démarrage
// dans le dossier de la base (data/ en local, volume persistant en ligne : les sessions survivent aux redéploiements).
function cle() {
  if (process.env.SNGH_JWT_SECRET) return process.env.SNGH_JWT_SECRET;
  if (process.env.NODE_TEST_CONTEXT) return randomBytes(32).toString('hex');
  const base = process.env.SNGH_DB;
  const dossier = base && base !== ':memory:' ? dirname(base) : 'data';
  const f = join(dossier, 'jwt.secret');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  mkdirSync(dossier, { recursive: true });
  const k = randomBytes(32).toString('hex');
  writeFileSync(f, k, { mode: 0o600 });
  return k;
}
const SECRET = cle();
const DUREE = '12h';

export class ErreurHttp extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export function signer(u) {
  return jwt.sign({ id: u.id, role: u.role, etablissement_id: u.etablissement_id ?? null, nom: u.nom }, SECRET, { expiresIn: DUREE });
}

// Limite simple des tentatives de connexion : 10 échecs par login et par 15 minutes.
const echecs = new Map();
function trop(login) {
  const e = echecs.get(login);
  if (!e) return false;
  if (Date.now() - e.debut > 15 * 60 * 1000) { echecs.delete(login); return false; }
  return e.n >= 10;
}
function noterEchec(login) {
  const e = echecs.get(login);
  if (!e || Date.now() - e.debut > 15 * 60 * 1000) echecs.set(login, { n: 1, debut: Date.now() });
  else e.n++;
}

export function connecter(db, login, motDePasse) {
  if (!login || !motDePasse) throw new ErreurHttp(400, 'Identifiant et mot de passe requis.');
  if (trop(login)) throw new ErreurHttp(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
  const u = db.prepare('SELECT * FROM utilisateurs WHERE login = ?').get(login);
  if (!u || !bcrypt.compareSync(motDePasse, u.mot_de_passe)) {
    noterEchec(login);
    journaliser(db, u, 'ECHEC_CONNEXION', 'utilisateurs', u?.id, { login: String(login).slice(0, 40) });
    throw new ErreurHttp(401, 'Identifiant ou mot de passe incorrect.');
  }
  echecs.delete(login);
  if (!u.actif) {
    journaliser(db, u, 'CONNEXION_REFUSEE', 'utilisateurs', u.id, { motif: 'compte suspendu' });
    throw new ErreurHttp(403, 'Votre compte est suspendu. Contactez l’administrateur du site.');
  }
  db.prepare("UPDATE utilisateurs SET derniere_connexion = datetime('now') WHERE id = ?").run(u.id);
  journaliser(db, u, 'CONNEXION', 'utilisateurs', u.id);
  return { token: signer(u), utilisateur: { id: u.id, nom: u.nom, role: u.role, etablissement_id: u.etablissement_id } };
}

export function authentifier(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new ErreurHttp(401, 'Connexion requise.'));
  try { req.utilisateur = jwt.verify(token, SECRET); next(); }
  catch { next(new ErreurHttp(401, 'Session expirée. Reconnectez-vous.')); }
}

// À chaque requête : le compte doit exister et être actif ; rôle et formation relus en base,
// pour qu'une suspension ou un changement de rôle s'applique immédiatement, sans attendre la fin de la session.
export const compteActif = db => (req, _res, next) => {
  const u = db.prepare('SELECT id, nom, role, etablissement_id, actif FROM utilisateurs WHERE id = ?').get(req.utilisateur.id);
  if (!u || !u.actif) return next(new ErreurHttp(401, 'Votre compte est suspendu. Contactez l’administrateur du site.'));
  req.utilisateur = { id: u.id, nom: u.nom, role: u.role, etablissement_id: u.etablissement_id ?? null };
  next();
};

export const autoriser = (...roles) => (req, _res, next) =>
  roles.includes(req.utilisateur.role) ? next() : next(new ErreurHttp(403, 'Action non autorisée pour votre rôle.'));

// Établissement imposé par le compte : les rôles rattachés ne voient que leur établissement.
export const portee = u => (ROLES_ETABLISSEMENT.includes(u.role) ? u.etablissement_id : null);
// Vérifie un droit de la matrice, sinon 403.
export const exiger = droit => (req, _res, next) => peut(req.utilisateur.role, droit) ? next()
  : next(new ErreurHttp(403, `Action non autorisée pour votre profil : ${DROITS[droit].libelle}.`));
