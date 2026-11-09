import express from 'express';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connecter, authentifier, compteActif } from './auth.js';
import routesParcours from './routes/parcours.js';
import routesPlateau from './routes/plateau.js';
import routesPilotage from './routes/pilotage.js';

export function creerApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '200kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  // Interface hébergée sur un autre domaine (Vercel) : origines autorisées dans SNGH_ORIGINES (séparées par des virgules).
  const origines = (process.env.SNGH_ORIGINES || '').split(',').map(o => o.trim().replace(/\/$/, '')).filter(Boolean);
  app.use('/api', (req, res, next) => {
    const o = req.headers.origin;
    const ok = o && origines.includes(o);
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', o);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(ok ? 204 : 403);
    next();
  });

  const api = express.Router();
  api.get('/sante', (_req, res) => res.json({ ok: true, service: 'SNGH Tchad (prototype)', version: '0.1.0' }));
  api.post('/auth/connexion', (req, res) => res.json(connecter(db, req.body?.login, req.body?.mot_de_passe)));
  api.use(authentifier);
  api.use(compteActif(db));
  api.get('/auth/moi', (req, res) => res.json(req.utilisateur));
  api.use(routesPilotage(db));
  api.use(routesParcours(db));
  api.use(routesPlateau(db));
  api.use((_req, res) => res.status(404).json({ erreur: 'Ressource introuvable.' }));
  app.use('/api', api);

  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  } else app.get('/', (_req, res) => res.json({ service: 'API SNGH Tchad', sante: '/api/sante' }));

  app.use((err, _req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({ erreur: status === 500 ? 'Erreur interne du serveur.' : err.message, details: err.details });
  });
  return app;
}
