// Carte sanitaire du Tchad : chaque province est colorée selon la maladie ou la situation choisie, d'après la province
// de résidence déclarée par le patient à l'admission. Les hôpitaux connectés sont placés sur la carte.
// Un clic sur une province ouvre son profil sanitaire.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import GEO from '../geo/provinces_td.json';
import { useApp } from '../App.jsx';
import { useCharger, Kpi } from '../components/ui.jsx';
import { ECHELLE_NIVEAU, Histogramme, BarresHorizontales } from '../components/Graphiques.jsx';
import { nombre } from '../format.js';

const VIDE = '#E9ECF3';

// Cinq classes de couleur : seuils arrondis entre 1 et le maximum observé.
function classes(valeurs, entiers) {
  const max = Math.max(...valeurs, 0);
  if (!max) return { seuils: [], couleur: () => VIDE };
  const arrondi = x => (entiers ? Math.max(1, Math.round(x)) : Math.round(x * 10) / 10);
  const seuils = max <= 5 && entiers ? [2, 3, 4, 5] : [1, 2, 3, 4].map(i => arrondi(max * i / 5));
  const couleur = v => (!v ? VIDE : ECHELLE_NIVEAU[Math.min(4, seuils.filter(s => v >= s).length)]);
  return { seuils, couleur };
}

export default function Carte() {
  const { u, ref } = useApp();
  const central = !u.etablissement_id;
  const [indicateur, setIndicateur] = useState('paludisme');
  const [jours, setJours] = useState(30);
  const [mesure, setMesure] = useState('n');
  const [etab, setEtab] = useState('');
  const [choisie, setChoisie] = useState(null);
  const [d, , err] = useCharger(`/carte?indicateur=${indicateur}&jours=${jours}${etab ? `&etablissement_id=${etab}` : ''}`);
  const [fiche] = useCharger(choisie ? `/carte/province/${encodeURIComponent(choisie)}?jours=${jours}${etab ? `&etablissement_id=${etab}` : ''}` : null);

  const parProvince = useMemo(() => Object.fromEntries((d?.provinces || []).map(p => [p.province, p])), [d]);
  const echelle = useMemo(() => classes((d?.provinces || []).map(p => (mesure === 'part' ? p.part || 0 : p.n)), mesure === 'n'), [d, mesure]);
  const touchees = d?.provinces.filter(p => p.n).length ?? 0;
  const premiere = d && [...d.provinces].sort((a, b) => b.n - a.n)[0];

  return (
    <>
      <div className="titre-page ligne">
        <div><h2>Carte sanitaire du Tchad</h2><p>Par province de résidence des patients · {jours} derniers jours · {d?.etablissements.length ?? '…'} hôpital(aux) connecté(s).</p></div>
        <div className="outils">
          <select value={indicateur} onChange={e => setIndicateur(e.target.value)} aria-label="Maladie ou situation">
            {Object.entries(ref.indicateurs_carte).map(([k, v]) => <option key={k} value={k}>{v.libelle}</option>)}</select>
          {central && <select value={etab} onChange={e => setEtab(e.target.value)}><option value="">Tous les hôpitaux</option>{ref.etablissements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}</select>}
          <select value={jours} onChange={e => setJours(Number(e.target.value))}>{[7, 30, 90].map(j => <option key={j} value={j}>{j} jours</option>)}</select>
        </div>
      </div>
      {err && <p className="bandeau erreur">{err}</p>}
      {d && <div className="kpis">
        <Kpi v={nombre(d.total)} l={d.libelle.toLowerCase()} ton="fort" />
        <Kpi v={`${touchees} / ${d.provinces.length}`} l="provinces concernées" />
        <Kpi v={premiere?.n ? premiere.province : '—'} l={premiere?.n ? `province la plus touchée (${nombre(premiere.n)})` : 'aucun cas'} />
        <Kpi v={nombre(d.provinces.reduce((a, p) => a + p.deces, 0))} l="décès associés" />
      </div>}
      <div className="carte-et-fiche">
        <div className="carte">
          <div className="onglets">
            <button className={mesure === 'n' ? 'actif' : ''} onClick={() => setMesure('n')}>Nombre de cas</button>
            <button className={mesure === 'part' ? 'actif' : ''} onClick={() => setMesure('part')} disabled={indicateur === 'visites'}>% des visites de la province</button>
          </div>
          {d && <CarteTchad parProvince={parProvince} etablissements={d.etablissements} echelle={echelle} mesure={mesure} choisie={choisie} onChoisir={setChoisie} libelle={d.libelle} />}
          {d && <div className="legende-carte">
            <span><i style={{ background: VIDE }} />aucun cas</span>
            {echelle.seuils.length > 0 && ECHELLE_NIVEAU.map((c, i) => {
              const S = echelle.seuils, u = mesure === 'part' ? ' %' : '';
              return <span key={i}><i style={{ background: c }} />{i === 0 ? `moins de ${nombre(S[0])}${u}` : i === 4 ? `${nombre(S[3])}${u} et plus` : `${nombre(S[i - 1])} à ${nombre(S[i])}${u}`}</span>;
            })}
            <span><b className="pt-hopital" />hôpital connecté</span>
          </div>}
          <p className="aide-champ">Limites des provinces : geoBoundaries, d’après OpenStreetMap (ODbL). Le lieu retenu est la province de résidence déclarée à l’admission. Pendant le pilote, seules les zones desservies par les 3 hôpitaux connectés apparaissent : les autres provinces seront couvertes avec les vagues de déploiement.</p>
        </div>
        <div className="carte fiche-province">
          {!choisie ? <p className="info">Cliquez sur une province pour afficher son profil sanitaire.</p> : !fiche ? <p className="info">Chargement…</p> : <>
            <div className="titre-page ligne"><div><h3>{fiche.province}</h3><p>{nombre(fiche.visites)} visites · {nombre(fiche.patients)} patients · {jours} jours</p></div><button className="lien" onClick={() => setChoisie(null)}>Fermer</button></div>
            {fiche.visites === 0 ? <p className="info">Aucun patient de cette province dans les hôpitaux connectés sur la période.</p> : <>
              <h4>Profil sanitaire</h4>
              <BarresHorizontales lignes={fiche.profil.filter(p => p.n).map(p => ({ nom: p.libelle, n: p.n, id: p.indicateur }))} ton="claire" />
              <h4>Diagnostics les plus fréquents</h4>
              <BarresHorizontales lignes={fiche.morbidite} />
              <h4>Hôpitaux fréquentés</h4>
              <BarresHorizontales lignes={fiche.etablissements} ton="moyenne" />
            </>}
          </>}
        </div>
      </div>
      {d?.semaines.length > 0 && <div className="carte">
        <h3>{d.libelle} : évolution par semaine</h3>
        <Histogramme serie={d.semaines} series={[{ cle: 'n', libelle: d.libelle, ton: 'claire' }]} aria={`${d.libelle} par semaine`} infobulle={(s, j) => `Semaine du ${j} : ${s.n}`} />
      </div>}
    </>
  );
}

function CarteTchad({ parProvince, etablissements, echelle, mesure, choisie, onChoisir, libelle }) {
  const boite = useRef(null);
  const carte = useRef(null);
  const couches = useRef(null);
  useEffect(() => {
    const m = L.map(boite.current, { zoomSnap: 0.25, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, opacity: 0.35, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · geoBoundaries' }).addTo(m);
    m.fitBounds(L.geoJSON(GEO).getBounds(), { padding: [8, 8] });
    carte.current = m;
    const redim = new ResizeObserver(() => m.invalidateSize());
    redim.observe(boite.current);
    return () => { redim.disconnect(); m.remove(); };
  }, []);
  useEffect(() => {
    const m = carte.current; if (!m) return;
    couches.current?.remove();
    const g = L.layerGroup().addTo(m);
    for (const f of GEO.features) {
      const nom = f.properties.province, p = parProvince[nom] || { n: 0 };
      const v = mesure === 'part' ? p.part || 0 : p.n;
      const actif = choisie === nom;
      const zone = L.geoJSON(f, { style: { color: actif ? '#F04A10' : '#1F2A6B', weight: actif ? 3 : 0.8, fillColor: echelle.couleur(v), fillOpacity: 0.85 } });
      zone.on('click', () => onChoisir(nom));
      zone.bindTooltip(`<strong>${nom}</strong><br>${libelle} : ${nombre(p.n)}${p.part != null && mesure === 'part' ? ` (${nombre(p.part)} % des visites)` : ''}`, { sticky: true });
      zone.addTo(g);
    }
    const max = Math.max(1, ...etablissements.map(e => e.n));
    for (const e of etablissements) if (e.lat)
      L.circleMarker([e.lat, e.lon], { radius: 5 + 6 * Math.sqrt(e.n / max), color: '#fff', weight: 2, fillColor: '#1F2A6B', fillOpacity: 0.95 })
        .bindTooltip(`<strong>${e.nom}</strong><br>${e.ville} · ${libelle} : ${nombre(e.n)}`, { direction: 'top' }).addTo(g);
    couches.current = g;
  }, [parProvince, etablissements, echelle, mesure, choisie, libelle, onChoisir]);
  return <div ref={boite} className="carte-tchad" role="img" aria-label={`Carte du Tchad : ${libelle} par province`} />;
}
