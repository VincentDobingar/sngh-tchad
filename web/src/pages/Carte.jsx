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
import { nombre, t } from '../format.js';

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
  const lib = d ? t(d.libelle) : '';
  const touchees = d?.provinces.filter(p => p.n).length ?? 0;
  const premiere = d && [...d.provinces].sort((a, b) => b.n - a.n)[0];

  return (
    <>
      <div className="titre-page ligne">
        <div><h2>{t("Carte sanitaire du Tchad")}</h2><p>{t('Par province de résidence des patients · {j} derniers jours · {n} hôpital(aux) connecté(s).', { j: jours, n: d?.etablissements.length ?? '…' })}</p></div>
        <div className="outils">
          <select value={indicateur} onChange={e => setIndicateur(e.target.value)} aria-label={t("Maladie ou situation")}>
            {Object.entries(ref.indicateurs_carte).map(([k, v]) => <option key={k} value={k}>{v.libelle}</option>)}</select>
          {central && <select value={etab} onChange={e => setEtab(e.target.value)}><option value="">{t("Tous les hôpitaux")}</option>{ref.etablissements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}</select>}
          <select value={jours} onChange={e => setJours(Number(e.target.value))}>{[7, 30, 90].map(j => <option key={j} value={j}>{t('{n} jours', { n: j })}</option>)}</select>
        </div>
      </div>
      {err && <p className="bandeau erreur">{err}</p>}
      {d && <div className="kpis">
        <Kpi v={nombre(d.total)} l={lib.toLowerCase()} ton="fort" />
        <Kpi v={`${nombre(touchees)} / ${nombre(d.provinces.length)}`} l="provinces concernées" />
        <Kpi v={premiere?.n ? t(premiere.province) : '—'} l={premiere?.n ? t('province la plus touchée ({n})', { n: nombre(premiere.n) }) : 'aucun cas'} />
        <Kpi v={nombre(d.provinces.reduce((a, p) => a + p.deces, 0))} l="décès associés" />
      </div>}
      <div className="carte-et-fiche">
        <div className="carte">
          <div className="onglets">
            <button className={mesure === 'n' ? 'actif' : ''} onClick={() => setMesure('n')}>{t("Nombre de cas")}</button>
            <button className={mesure === 'part' ? 'actif' : ''} onClick={() => setMesure('part')} disabled={indicateur === 'visites'}>{t("% des visites de la province")}</button>
          </div>
          {d && <CarteTchad parProvince={parProvince} etablissements={d.etablissements} echelle={echelle} mesure={mesure} choisie={choisie} onChoisir={setChoisie} libelle={lib} />}
          {d && <div className="legende-carte">
            <span><i style={{ background: VIDE }} />{t("aucun cas")}</span>
            {echelle.seuils.length > 0 && ECHELLE_NIVEAU.map((c, i) => {
              const S = echelle.seuils, u = mesure === 'part' ? ' %' : '';
              return <span key={i}><i style={{ background: c }} />{i === 0 ? t('moins de {n}', { n: nombre(S[0]) + u }) : i === 4 ? t('{n} et plus', { n: nombre(S[3]) + u }) : t('{a} à {b}', { a: nombre(S[i - 1]), b: nombre(S[i]) + u })}</span>;
            })}
            <span><b className="pt-hopital" />{t("hôpital connecté")}</span>
          </div>}
          <p className="aide-champ">{t("Limites des provinces : geoBoundaries, d’après OpenStreetMap (ODbL). Le lieu retenu est la province de résidence déclarée à l’admission. Pendant le pilote, une province n’apparaît que si ses habitants consultent dans l’un des 3 hôpitaux connectés ; la couverture deviendra complète avec les vagues de déploiement.")}</p>
        </div>
        <div className="carte fiche-province">
          {!choisie ? <ListeProvinces provinces={d?.provinces || []} mesure={mesure} echelle={echelle} libelle={lib} onChoisir={setChoisie} /> : !fiche ? <p className="info">{t("Chargement…")}</p> : <>
            <div className="titre-page ligne"><div><h3>{t(fiche.province)}</h3><p>{t('{v} visites · {p} patients · {j} jours', { v: nombre(fiche.visites), p: nombre(fiche.patients), j: jours })}</p></div><button className="lien" onClick={() => setChoisie(null)}>{t("Toutes les provinces")}</button></div>
            {fiche.visites === 0 ? <p className="info">{t("Aucun patient de cette province dans les hôpitaux connectés sur la période.")}</p> : <>
              <div className="chiffres">
                <div className="chiffre fort"><strong>{nombre(parProvince[fiche.province]?.n)}</strong><span>{lib.toLowerCase()}</span></div>
                <div className="chiffre"><strong>{parProvince[fiche.province]?.part != null ? `${nombre(parProvince[fiche.province].part)} %` : '—'}</strong><span>{t("des visites de la province")}</span></div>
              </div>
              <h4>{t("Profil sanitaire")}</h4>
              <BarresHorizontales lignes={fiche.profil.filter(p => p.n).map(p => ({ nom: t(p.libelle), n: p.n, id: p.indicateur }))} ton="claire" />
              <h4>{t("Diagnostics les plus fréquents")}</h4>
              <BarresHorizontales lignes={fiche.morbidite.map(m => ({ ...m, nom: t(m.nom) }))} />
              <h4>{t("Hôpitaux fréquentés")}</h4>
              <BarresHorizontales lignes={fiche.etablissements.map(e => ({ ...e, nom: t(e.nom) }))} ton="moyenne" />
            </>}
          </>}
        </div>
      </div>
      {d?.semaines.length > 0 && <div className="carte">
        <h3>{t('{x} : évolution par semaine', { x: lib })}</h3>
        <Histogramme serie={d.semaines} series={[{ cle: 'n', libelle: lib, ton: 'claire' }]} aria={t('{x} par semaine', { x: lib })} infobulle={(s, j) => t('Semaine du {j} : {n}', { j, n: s.n })} />
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
      zone.bindTooltip(`<strong>${t(nom)}</strong><br>${libelle} : ${nombre(p.n)}${p.part != null && mesure === 'part' ? ` (${t('{n} % des visites', { n: nombre(p.part) })})` : ''}`, { sticky: true });
      zone.addTo(g);
    }
    const max = Math.max(1, ...etablissements.map(e => e.n));
    for (const e of etablissements) if (e.lat)
      L.circleMarker([e.lat, e.lon], { radius: 5 + 6 * Math.sqrt(e.n / max), color: '#fff', weight: 2, fillColor: '#1F2A6B', fillOpacity: 0.95 })
        .bindTooltip(`<strong>${t(e.nom)}</strong><br>${t(e.ville)} · ${libelle} : ${nombre(e.n)} (${t('patients de toutes provinces')})`, { direction: 'top' }).on('click', () => onChoisir(e.province)).addTo(g);
    couches.current = g;
  }, [parProvince, etablissements, echelle, mesure, choisie, libelle, onChoisir]);
  return <div ref={boite} className="carte-tchad" role="img" aria-label={t('Carte du Tchad : {x} par province', { x: libelle })} />;
}

// Liste de toutes les provinces, classées : accès direct à chaque province, même petite ou masquée par un hôpital.
function ListeProvinces({ provinces, mesure, echelle, libelle, onChoisir }) {
  const v = p => (mesure === 'part' ? p.part || 0 : p.n);
  const triees = [...provinces].sort((a, b) => v(b) - v(a) || a.province.localeCompare(b.province));
  const max = Math.max(1, ...triees.map(v));
  return (
    <>
      <h3>{t('{x} par province', { x: libelle })}</h3>
      <p className="aide-champ">{t("Cliquez sur une province (ici ou sur la carte) pour son profil sanitaire.")}</p>
      <ul className="liste-provinces">{triees.map(p => (
        <li key={p.province}><button onClick={() => onChoisir(p.province)} className={v(p) ? '' : 'vide'}>
          <i style={{ background: echelle.couleur(v(p)) }} />
          <span className="nom">{t(p.province)}</span>
          <span className="piste"><span className="remplie" style={{ width: `${(v(p) / max) * 100}%`, background: echelle.couleur(v(p)) }} /></span>
          <b>{v(p) ? `${nombre(v(p))}${mesure === 'part' ? ' %' : ''}` : '—'}</b>
        </button></li>))}</ul>
    </>
  );
}
