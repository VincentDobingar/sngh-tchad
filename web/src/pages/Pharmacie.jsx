// Pharmacie et stocks (M12) : ordonnances à servir (sortie FEFO des lots), état du stock avec consommation moyenne
// mensuelle, mois de stock et alertes (rupture, sous le seuil, péremption), réception des livraisons de la CPA.
import React, { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { useCharger, Pastille, Action, Champ, Kpi } from '../components/ui.jsx';
import { date, heure, nombre } from '../format.js';
import { peut } from '../droits.js';

const ALERTES = { RUPTURE: ['Rupture', 'rouge'], SOUS_SEUIL: ['Sous le seuil', 'orange'], PEREMPTION: ['Péremption < 90 j', 'jaune'] };

export default function Pharmacie() {
  const { u } = useApp();
  const pharmacien = peut(u.role, 'pharmacie');
  const [onglet, setOnglet] = useState(pharmacien ? 'ordonnances' : 'stock');
  return (
    <>
      <div className="titre-page"><h2>Pharmacie</h2><p>Les lots qui périment le plus tôt sortent en premier (FEFO) ; un lot périmé ne sort jamais.</p></div>
      <div className="onglets">
        {pharmacien && <button className={onglet === 'ordonnances' ? 'actif' : ''} onClick={() => setOnglet('ordonnances')}>Ordonnances à servir</button>}
        <button className={onglet === 'stock' ? 'actif' : ''} onClick={() => setOnglet('stock')}>État du stock</button>
        {pharmacien && <button className={onglet === 'reception' ? 'actif' : ''} onClick={() => setOnglet('reception')}>Réception d’une livraison</button>}
      </div>
      {onglet === 'ordonnances' && <Ordonnances />}
      {onglet === 'stock' && <Stock />}
      {onglet === 'reception' && <Reception onFait={() => setOnglet('stock')} />}
    </>
  );
}

function Ordonnances() {
  const [liste, recharger, err] = useCharger('/pharmacie/ordonnances', 30000);
  const [servi, setServi] = useState('');
  // Regroupées par patient.
  const groupes = Object.values((liste || []).reduce((g, x) => { (g[x.ipun + x.cree_le] ||= { ...x, lignes: [] }).lignes.push(x); return g; }, {}));
  return (
    <>
      {err && <p className="bandeau erreur">{err}</p>}
      {servi && <p className="bandeau succes">{servi}</p>}
      {liste?.length === 0 && <p className="info">Aucune ordonnance en attente.</p>}
      {groupes.map(g => (
        <div key={g.ipun + g.cree_le} className="carte">
          <div className="titre-page ligne"><div><h3>{g.nom} {g.prenom}</h3><p><code>{g.ipun}</code> · {g.service} {g.ticket} · prescrit par {g.medecin} à {heure(g.cree_le)}</p></div></div>
          <table className="tableau">
            <thead><tr><th>Médicament</th><th>Posologie</th><th className="num">Quantité</th><th className="num">Stock</th><th className="num">Prix</th><th /></tr></thead>
            <tbody>{g.lignes.map(x => (
              <tr key={x.id} className={x.disponible < x.quantite ? 'alerte' : ''}>
                <td><strong>{x.dci}</strong> {x.dosage} <small>{x.forme}</small>{x.programme && <Pastille ton="vert">programme {x.programme}, gratuit</Pastille>}</td>
                <td>{x.posologie}</td><td className="num">{x.quantite}</td><td className="num">{nombre(x.disponible)}</td><td className="num">{x.programme ? '—' : nombre(x.prix * x.quantite)}</td>
                <td className="actions-cellule">{x.disponible >= x.quantite
                  ? <Action className="principal petit" faire={async () => { const r = await api('POST', `/pharmacie/ordonnances/${x.id}/dispenser`); setServi(`${x.dci} servi à ${x.nom} ${x.prenom} : lot ${r.lots.map(l => `${l.numero} (exp. ${date(l.peremption)})`).join(', ')}.`); recharger(); }}>Servir</Action>
                  : <Action className="danger petit" faire={async () => { await api('POST', `/pharmacie/ordonnances/${x.id}/rupture`); recharger(); }}>Déclarer la rupture</Action>}</td>
              </tr>))}</tbody>
          </table>
        </div>))}
    </>
  );
}

function Stock() {
  const { u, ref } = useApp();
  const [etab, setEtab] = useState(ref.etablissements[0]?.id);
  const central = !u.etablissement_id;
  const [liste, , err] = useCharger(`/pharmacie/stock${central ? `?etablissement_id=${etab}` : ''}`);
  const [ouvert, setOuvert] = useState(null);
  const [filtre, setFiltre] = useState('');
  const n = a => liste?.filter(x => x.alerte === a).length ?? 0;
  const lignes = (liste || []).filter(x => !filtre || x.alerte === filtre);
  return (
    <>
      {central && <div className="outils espace-bas"><select value={etab} onChange={e => setEtab(e.target.value)}>{ref.etablissements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></div>}
      {err && <p className="bandeau erreur">{err}</p>}
      {liste && <div className="kpis">
        <button className={`kpi onglet ${filtre === '' ? 'actif' : ''}`} onClick={() => setFiltre('')}><strong>{liste.length}</strong><span>références suivies</span></button>
        <button className={`kpi onglet ${filtre === 'RUPTURE' ? 'actif' : ''} ${n('RUPTURE') ? 'alerte' : ''}`} onClick={() => setFiltre('RUPTURE')}><strong>{n('RUPTURE')}</strong><span>en rupture</span></button>
        <button className={`kpi onglet ${filtre === 'SOUS_SEUIL' ? 'actif' : ''}`} onClick={() => setFiltre('SOUS_SEUIL')}><strong>{n('SOUS_SEUIL')}</strong><span>sous le seuil (1 mois)</span></button>
        <button className={`kpi onglet ${filtre === 'PEREMPTION' ? 'actif' : ''}`} onClick={() => setFiltre('PEREMPTION')}><strong>{n('PEREMPTION')}</strong><span>lots périmant sous 90 jours</span></button>
        <Kpi v={liste.reduce((a, x) => a + (x.perimes > 0 ? 1 : 0), 0)} l="références avec lots périmés à détruire" /></div>}
      <div className="carte sans-marge">
        <table className="tableau cliquable">
          <thead><tr><th>Médicament</th><th className="num">Stock utilisable</th><th className="num">CMM</th><th className="num">Mois de stock</th><th className="num">Seuil</th><th>Prochaine péremption</th><th>Alerte</th></tr></thead>
          <tbody>{lignes.map(x => (
            <React.Fragment key={x.id}>
              <tr onClick={() => setOuvert(ouvert === x.id ? null : x.id)} className={x.alerte === 'RUPTURE' ? 'alerte' : ''}>
                <td><strong>{x.dci}</strong> {x.dosage} <small>{x.forme}</small>{x.programme && <Pastille ton="vert">{x.programme}</Pastille>}</td>
                <td className="num">{nombre(x.quantite)}</td><td className="num">{nombre(x.cmm)}</td>
                <td className="num"><span className={x.mois_stock != null && x.mois_stock < 1 ? 'texte-rouge' : ''}>{x.mois_stock != null ? nombre(x.mois_stock) : '—'}</span></td>
                <td className="num">{nombre(x.seuil)}</td><td>{date(x.prochaine_peremption)}</td>
                <td>{x.alerte && <Pastille ton={ALERTES[x.alerte][1]}>{ALERTES[x.alerte][0]}</Pastille>}{x.perimes > 0 && <Pastille ton="rouge">{x.perimes} périmés</Pastille>}</td>
              </tr>
              {ouvert === x.id && <tr className="detail"><td colSpan="7">{x.lots.length ? x.lots.map(l => <span key={l.id} className="lot">Lot {l.numero} · {nombre(l.quantite)} · exp. {date(l.peremption)}</span>) : 'Aucun lot en stock.'}</td></tr>}
            </React.Fragment>))}</tbody>
        </table>
      </div>
      <p className="aide-champ">CMM : consommation moyenne mensuelle sur les 3 derniers mois. Seuil d’alerte : 1 mois de consommation. Cliquez sur une ligne pour voir les lots.</p>
    </>
  );
}

function Reception({ onFait }) {
  const { ref } = useApp();
  const [f, setF] = useState({ medicament_id: '', numero: '', peremption: '', quantite: '', motif: 'Livraison CPA' });
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <div className="carte">
      <h3>Réception d’un lot</h3>
      <div className="grille">
        <Champ libelle="Médicament" erreur={err.medicament_id}><select value={f.medicament_id} onChange={e => set('medicament_id', e.target.value)}><option value="">Choisir…</option>{ref.medicaments.map(m => <option key={m.id} value={m.id}>{m.dci} {m.dosage} ({m.forme})</option>)}</select></Champ>
        <Champ libelle="Numéro de lot" erreur={err.numero}><input value={f.numero} onChange={e => set('numero', e.target.value)} /></Champ>
        <Champ libelle="Date de péremption" erreur={err.peremption}><input type="date" value={f.peremption} onChange={e => set('peremption', e.target.value)} /></Champ>
        <Champ libelle="Quantité reçue" erreur={err.quantite}><input type="number" min="1" value={f.quantite} onChange={e => set('quantite', e.target.value)} /></Champ>
        <Champ libelle="Origine"><input value={f.motif} onChange={e => set('motif', e.target.value)} /></Champ>
      </div>
      {msg && <p className="bandeau erreur">{msg}</p>}
      <div className="actions"><button className="principal" onClick={async () => {
        setErr({}); setMsg('');
        try { await api('POST', '/pharmacie/lots', f); onFait(); } catch (e) { setErr(e.details || {}); setMsg(e.message); }
      }}>Enregistrer la réception</button></div>
    </div>
  );
}
