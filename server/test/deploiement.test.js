import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { openDb } from '../src/db.js';
import { seed } from '../src/seed.js';
import { creerApp } from '../src/app.js';
import { genererDemo } from '../src/donnees-demo.js';

test('CORS limité aux origines déclarées', async () => {
  process.env.SNGH_ORIGINES = 'https://sngh-tchad.vercel.app';
  const db = openDb(':memory:'); seed(db, { adminPassword: 'x'.repeat(12) });
  const srv = creerApp(db).listen(0); const base = `http://localhost:${srv.address().port}`;
  try {
    const ok = await fetch(base + '/api/auth/connexion', { method: 'OPTIONS', headers: { Origin: 'https://sngh-tchad.vercel.app', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), 'https://sngh-tchad.vercel.app');
    const ko = await fetch(base + '/api/auth/connexion', { method: 'OPTIONS', headers: { Origin: 'https://autre.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(ko.status, 403);
  } finally { srv.close(); delete process.env.SNGH_ORIGINES; }
});

test('données de démonstration cohérentes', () => {
  const db = openDb(':memory:'); seed(db, { adminPassword: 'x'.repeat(12) });
  const r = genererDemo(db, 'MotDePasseDemo1');
  assert.ok(r.visites > 3000 && r.patients > 2000);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM lots WHERE quantite < 0").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM lits WHERE statut = 'OCCUPE'").get().n, db.prepare('SELECT COUNT(*) n FROM sejours WHERE sortie IS NULL').get().n);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM factures WHERE total != prise_en_charge + a_payer").get().n, 0);
  // Stock = réceptions - sorties, lot par lot.
  assert.equal(db.prepare('SELECT COUNT(*) n FROM lots l WHERE l.quantite != (SELECT COALESCE(SUM(quantite), 0) FROM mouvements WHERE lot_id = l.id) AND EXISTS (SELECT 1 FROM mouvements WHERE lot_id = l.id)').get().n, 0);
});

test('en production, démarrage refusé sans mot de passe administrateur', () => {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.js'], { env: { ...process.env, NODE_ENV: 'production', SNGH_ADMIN_PASSWORD: '', SNGH_DB: ':memory:' }, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 1); assert.match(r.stderr, /SNGH_ADMIN_PASSWORD/);
});
