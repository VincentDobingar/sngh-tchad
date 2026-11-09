// Données FICTIVES de démonstration : comptes par profil, 60 jours d'activité dans les 3 hôpitaux pilotes
// (admissions, consultations, examens, dispensations, facturation, hospitalisations) et la journée en cours
// (patients en attente, examens à valider, ordonnances à servir, factures à encaisser, lits occupés).
// Aucun de ces patients n'existe. Les noms sont tirés au hasard dans des listes de prénoms et de noms courants.
import bcrypt from 'bcryptjs';
import { tx } from './db.js';
import { genererIpun, cleRecherche, libelleDiagnostic, interpreter, EXAMENS } from './referentiels.js';
import { facturerActe, facturerExamen, ajouterLigne, facturerJournees } from './facturation.js';

const PRENOMS_H = ['Mahamat', 'Abakar', 'Moussa', 'Hassan', 'Idriss', 'Ahmat', 'Saleh', 'Adoum', 'Djibrine', 'Ali', 'Oumar', 'Brahim', 'Youssouf', 'Issa',
  'Ngaradoum', 'Ndilbé', 'Djimadoum', 'Nodjimbadem', 'Rimadjita', 'Nguéadoum', 'Allarassem', 'Mbainaissem', 'Doumbé', 'Kodbé', 'Béral', 'Masra'];
const PRENOMS_F = ['Fatimé', 'Achta', 'Halimé', 'Zara', 'Mariam', 'Kaltouma', 'Haoua', 'Amina', 'Khadija', 'Hadjé', 'Mahadié', 'Asta',
  'Nodjiel', 'Rémadji', 'Ndoasnan', 'Neloumta', 'Mbaïdedji', 'Larlem', 'Néné', 'Djénom', 'Solkem', 'Mbaïrassem'];
const NOMS = ['MAHAMAT', 'ABAKAR', 'NGARLEJY', 'DJIMTOLA', 'NDOH', 'BICHARA', 'NADJILEM', 'KOUMAYE', 'MBAIOREM', 'ALLARASSEM', 'YAYA', 'OUMAR', 'BRAHIM',
  'HISSEIN', 'TAHIR', 'DJIBRINE', 'NGARMBAYE', 'DOUMKEL', 'MOUSSA', 'ADOUM', 'NODJIRAM', 'GUELEM', 'SOUGUI', 'ACHEIKH', 'TOGOI', 'BEASSOUM', 'KASSIRE', 'NDJIKO'];
const QUARTIERS = { HGRN: ['Chagoua', 'Moursal', 'Farcha', 'Dembé', 'Walia', 'Goudji', 'Diguel', 'Atrone', 'Habbena'],
  HPMDO: ['Doumbeur', 'Quinze ans', 'Guelkoura', 'Dombao', 'Mbombaye', 'Haoussa'], HDBGR: ['Bongor centre', 'Koumi', 'Magao', 'Djogoye', 'Kim'] };

// Diagnostics par service, pondérés ; les examens et prescriptions suivent le diagnostic.
const PROFILS = {
  PED: [['B54', 28], ['B50.0', 8], ['A09', 15], ['J06.9', 12], ['J18.9', 9], ['E43', 6], ['E44.0', 6], ['D50.9', 4], ['D57.1', 3], ['R50.9', 5], ['A90', 2]],
  MED: [['B54', 28], ['A01.0', 8], ['N39.0', 7], ['I10', 10], ['E11.9', 6], ['J18.9', 6], ['A09', 6], ['A15.0', 2], ['B20', 2], ['D57.1', 2], ['R50.9', 5], ['A90', 4], ['J06.9', 6]],
  MAT: [['Z34.9', 52], ['O80', 28], ['O14.1', 5], ['B54', 10], ['N39.0', 5]],
  CHI: [['K35.8', 28], ['T14.9', 44], ['S06.9', 18], ['A09', 4], ['R50.9', 6]],
  URG: [['B50.0', 26], ['S06.9', 14], ['T14.9', 20], ['J18.9', 10], ['O14.1', 5], ['A09', 10], ['E43', 5], ['B54', 10]],
};
const EXAMENS_DIAG = { B54: ['GE'], 'B50.0': ['GE', 'HB', 'GLY'], 'R50.9': ['TDRP'], 'A01.0': ['WIDAL'], 'N39.0': ['ECBU'], 'D50.9': ['HB'], 'D57.1': ['HB'],
  'E11.9': ['GLY'], I10: ['CREA'], 'Z34.9': ['HB', 'GRS', 'VIH'], A90: ['NS1', 'HB'], 'O14.1': ['CREA'], 'E43': ['HB'], 'K35.8': ['HB', 'GRS'], 'B05.9': [] };
const PRESCRIPTIONS = {
  B54: [['ALU', 24, '4 cp matin et soir pendant 3 jours'], ['PARA', 12, '1 cp 3 fois par jour']],
  'B50.0': [['ARTS', 6, '2,4 mg/kg à H0, H12, H24 puis 1 fois par jour'], ['SG5', 2, '1 flacon en 8 h'], ['PARA', 12, '1 cp 3 fois par jour']],
  A09: [['SRO', 4, 'à volonté après chaque selle'], ['ZINC', 10, '1 cp par jour pendant 10 jours']],
  'J06.9': [['PARA', 12, '1 cp 3 fois par jour'], ['AMOX', 15, '1 gél 3 fois par jour pendant 5 jours']],
  'J18.9': [['AMOX', 21, '1 gél 3 fois par jour pendant 7 jours'], ['PARA', 12, '1 cp 3 fois par jour']],
  E43: [['ATPE', 42, '2 sachets par jour pendant 3 semaines'], ['AMOX', 14, '1 gél 2 fois par jour']], 'E44.0': [['ATPE', 28, '1 sachet par jour']],
  'A01.0': [['CEFT', 7, '1 g par jour en IV pendant 7 jours'], ['PARA', 12, '1 cp 3 fois par jour']], 'N39.0': [['COTRI', 10, '2 cp 2 fois par jour pendant 5 jours']],
  'D50.9': [['FAF', 30, '1 cp par jour']], 'D57.1': [['FAF', 30, '1 cp par jour'], ['PARA', 12, 'si douleur']], I10: [['AMLO', 30, '1 cp par jour']],
  'E11.9': [['METF', 60, '1 cp matin et soir']], 'Z34.9': [['FAF', 30, '1 cp par jour'], ['ALB', 1, 'dose unique']], O80: [['OCYT', 1, '10 UI IM après expulsion']],
  'O14.1': [['MGSO4', 4, 'protocole de Zuspan']], 'K35.8': [['CEFT', 5, '1 g par jour'], ['METRO', 15, '1 cp 3 fois par jour'], ['PARA', 12, '1 cp 3 fois par jour']],
  'T14.9': [['IBU', 12, '1 cp 3 fois par jour'], ['PARA', 12, '1 cp 3 fois par jour']], 'S06.9': [['PARA', 12, '1 cp 3 fois par jour']],
  'A15.0': [['COTRI', 30, '1 cp par jour']], B20: [['COTRI', 30, '1 cp par jour']], A90: [['PARA', 12, '1 cp 3 fois par jour'], ['RL', 2, '1 flacon en 4 h']],
  'B05.9': [['PARA', 12, '1 cp 3 fois par jour'], ['AMOX', 15, '1 gél 3 fois par jour']], 'R50.9': [['PARA', 12, '1 cp 3 fois par jour']],
};
const HOSPITALISE = { 'B50.0': 0.85, E43: 0.6, O80: 0.9, 'O14.1': 0.9, 'K35.8': 0.9, 'S06.9': 0.35, 'J18.9': 0.3, A90: 0.25, 'A01.0': 0.15 };
const MOTIFS = { B54: 'Fièvre depuis 3 jours', 'B50.0': 'Fièvre, convulsions', 'R50.9': 'Fièvre', A90: 'Fièvre, douleurs articulaires', A09: 'Diarrhée et vomissements',
  'J06.9': 'Toux, rhume', 'J18.9': 'Toux et fièvre', E43: 'Perte de poids, refus alimentaire', 'E44.0': 'Retard de croissance', 'Z34.9': 'Consultation prénatale',
  O80: 'Travail en cours', 'O14.1': 'Céphalées, œdèmes, grossesse', 'K35.8': 'Douleur fosse iliaque droite', 'T14.9': 'Accident de la circulation',
  'S06.9': 'Chute, choc à la tête', I10: 'Suivi tension', 'E11.9': 'Suivi diabète', 'N39.0': 'Brûlures mictionnelles', 'D57.1': 'Crise douloureuse',
  'D50.9': 'Fatigue, pâleur', 'A01.0': 'Fièvre prolongée', 'A15.0': 'Toux depuis 3 semaines', B20: 'Suivi', 'B05.9': 'Fièvre et éruption', 'A39.0': 'Fièvre, raideur de la nuque' };
const VOLUME = { HGRN: 34, HPMDO: 22, HDBGR: 14 };
const JOURS = 60;

export function genererDemo(db, motDePasse) {
  if (!motDePasse) throw new Error('Mot de passe des comptes de démonstration manquant.');
  // Générateur pseudo-aléatoire reproductible (mulberry32, calcul entier exact).
  let graine = 20261109;
  const alea = () => { graine = (graine + 0x6D2B79F5) | 0; let t = Math.imul(graine ^ (graine >>> 15), 1 | graine); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const choisir = l => l[Math.floor(alea() * l.length)];
  const pondere = l => { const t = l.reduce((a, x) => a + x[1], 0); let r = alea() * t; for (const x of l) { r -= x[1]; if (r < 0) return x[0]; } return l[0][0]; };
  const entre = (a, b) => a + Math.floor(alea() * (b - a + 1));
  const maintenant = Date.now();
  const horodatage = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const jourMs = d => maintenant - d * 864e5;

  const hash = bcrypt.hashSync(motDePasse, 10);
  const etabs = db.prepare('SELECT * FROM etablissements ORDER BY id').all();
  const meds = Object.fromEntries(db.prepare('SELECT * FROM medicaments').all().map(m => [m.code, m]));
  const st = {
    user: db.prepare('INSERT INTO utilisateurs (nom, login, mot_de_passe, role, etablissement_id, derniere_connexion) VALUES (?, ?, ?, ?, ?, ?)'),
    patient: db.prepare(`INSERT INTO patients (nom, prenom, cle_recherche, sexe, date_naissance, age_estime, telephone, nom_pere, nom_mere, adresse, province, categorie, assureur, allergies, etablissement_id, cree_par, cree_le)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    ipun: db.prepare('UPDATE patients SET ipun = ? WHERE id = ?'),
    visite: db.prepare('INSERT INTO visites (patient_id, etablissement_id, service_id, type, ticket, triage, motif, statut, issue, arrivee, debut_prise_en_charge, fin, cree_par) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    consult: db.prepare(`INSERT INTO consultations (visite_id, medecin_id, temperature, ta_sys, ta_dia, pouls, poids, taille, spo2, anamnese, diagnostic_code, diagnostic_libelle, conduite, cree_le)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    presc: db.prepare('INSERT INTO prescriptions (consultation_id, medicament_id, posologie, quantite, statut, dispense_par, dispense_le) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    examen: db.prepare('INSERT INTO examens (visite_id, consultation_id, code, statut, resultat, anormal, critique, demande_le, saisi_par, saisi_le, valide_par, valide_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    sejour: db.prepare('INSERT INTO sejours (visite_id, lit_id, entree, sortie, mode_sortie) VALUES (?, ?, ?, ?, ?)'),
    journal: db.prepare('INSERT INTO journal (utilisateur_id, etablissement_id, action, objet, objet_id, le) VALUES (?, ?, ?, ?, ?, ?)'),
  };

  return tx(db, () => {
    // ---------- Comptes ----------
    const comptes = {};
    const creer = (nom, login, role, e) => {
      const id = Number(st.user.run(nom, login, hash, role, e?.id ?? null, horodatage(maintenant - entre(1, 20) * 36e5)).lastInsertRowid);
      (comptes[e?.code || 'CENTRAL'] ||= {})[login.split('.')[0]] = id;
      return id;
    };
    creer('Direction générale des activités sanitaires', 'decideur.minsante', 'decideur', null);
    for (const e of etabs) {
      const c = e.code.toLowerCase();
      creer(`Directeur, ${e.nom}`, `directeur.${c}`, 'directeur', e);
      creer(`Accueil, ${e.ville}`, `accueil.${c}`, 'accueil', e);
      creer(`Dr ${choisir(PRENOMS_H)} ${choisir(NOMS)}`, `medecin.${c}`, 'medecin', e);
      creer(`Infirmier major, ${e.ville}`, `infirmier.${c}`, 'infirmier', e);
      creer(`Laborantin, ${e.ville}`, `labo.${c}`, 'laborantin', e);
      creer(`Biologiste, ${e.ville}`, `bio.${c}`, 'laborantin', e);
      creer(`Pharmacien, ${e.ville}`, `pharma.${c}`, 'pharmacien', e);
      creer(`Caisse principale, ${e.ville}`, `caisse.${c}`, 'caissier', e);
    }

    // ---------- Patients et visites ----------
    let nPatients = 0, nVisites = 0;
    const demande = {}; // (etab, med) -> prescriptions à dispenser dans l'ordre chronologique
    const aPayer = [];   // factures à solder en fin de génération
    for (const e of etabs) {
      const u = comptes[e.code];
      const services = Object.fromEntries(db.prepare('SELECT * FROM services WHERE etablissement_id = ?').all(e.id).map(s => [s.code, s]));
      const lits = db.prepare(`SELECT l.*, s.code AS service_code FROM lits l JOIN services s ON s.id = l.service_id WHERE s.etablissement_id = ?`).all(e.id);
      const occupe = new Map(); // lit -> date de fin d'occupation (ms)
      const habitues = [];
      const tickets = {};

      for (let d = JOURS; d >= 0; d--) {
        const aujourdHui = d === 0;
        // Saison des pluies finissante : pic de paludisme ; rougeole récente à Bongor ; dengue en hausse à N'Djamena.
        let n = Math.round(VOLUME[e.code] * (0.8 + 0.4 * alea()) * (1 + 0.25 * Math.sin((JOURS - d) / 9)));
        if (aujourdHui) n = Math.round(n * 0.55); // journée en cours
        for (let i = 0; i < n; i++) {
          const svc = pondere([['MED', 34], ['PED', 26], ['MAT', 16], ['CHI', 9], ['URG', 15]]);
          // Patient : nouveau ou déjà connu (suivi).
          let p;
          if (habitues.length > 30 && alea() < 0.22) p = choisir(habitues);
          if (!p || (svc === 'PED' && p.age >= 15) || (svc === 'MAT' && (p.sexe !== 'F' || p.age < 15 || p.age > 45)) || (svc !== 'PED' && svc !== 'URG' && p.age < 15)) {
            const sexe = svc === 'MAT' ? 'F' : alea() < 0.52 ? 'F' : 'M';
            const age = svc === 'PED' ? (alea() < 0.65 ? alea() * 5 : 5 + alea() * 10) : svc === 'MAT' ? 16 + alea() * 26 : svc === 'URG' ? (alea() < 0.3 ? alea() * 5 : 15 + alea() * 55) : 15 + alea() * 60;
            const prenom = choisir(sexe === 'F' ? PRENOMS_F : PRENOMS_H), nom = choisir(NOMS);
            const naissance = horodatage(jourMs(d) - age * 365.25 * 864e5).slice(0, 10);
            const estime = age > 15 && alea() < 0.35;
            const categorie = alea() < 0.08 ? 'ASSURE' : alea() < 0.03 ? 'INDIGENT' : 'PAYANT';
            const pid = Number(st.patient.run(nom, prenom, cleRecherche(`${nom} ${prenom}`), sexe, estime ? `${naissance.slice(0, 4)}-07-01` : naissance, estime ? 1 : 0,
              alea() < 0.75 ? `+235 6${entre(0, 9)} ${entre(10, 99)} ${entre(10, 99)} ${entre(10, 99)}` : null, `${choisir(PRENOMS_H)} ${nom}`, `${choisir(PRENOMS_F)} ${choisir(NOMS)}`,
              choisir(QUARTIERS[e.code]), e.province, categorie, categorie === 'ASSURE' ? choisir(['CNPS', 'Mutuelle des enseignants', 'STAR Nationale']) : null,
              alea() < 0.05 ? choisir(['Pénicilline', 'Sulfamides', 'Aspirine']) : null, e.id, u.accueil, horodatage(jourMs(d) + 7 * 36e5)).lastInsertRowid);
            st.ipun.run(genererIpun(pid, 2026), pid);
            p = { id: pid, sexe, age, categorie }; nPatients++;
            if (alea() < 0.5) habitues.push(p);
          }
          // Diagnostic.
          let diag = pondere(PROFILS[svc]);
          if (diag === 'A90' && e.code !== 'HGRN') diag = 'B54';
          if (e.code === 'HGRN' && svc === 'MED' && d < 14 && alea() < 0.06) diag = 'A90';
          if (e.code === 'HDBGR' && svc === 'PED' && d < 9 && alea() < 0.08) diag = 'B05.9';
          if (e.code === 'HPMDO' && d === 3 && i === 2) diag = 'A39.0';
          if (svc === 'PED' && diag === 'E43' && p.age > 5) diag = 'A09';
          if (svc === 'URG' && diag === 'O14.1' && (p.sexe !== 'F' || p.age < 15)) diag = 'T14.9';

          // Journées passées : arrivées entre 7 h et 17 h ; journée en cours : sur les 4 dernières heures.
          const arrivee = aujourdHui ? maintenant - (5 + alea() * 235) * 6e4 : jourMs(d) - (maintenant % 864e5) + (6 + alea() * 10) * 36e5;
          const type = svc === 'URG' ? 'URGENCE' : 'CONSULTATION';
          const triage = type === 'URGENCE' ? pondere([['ROUGE', 12], ['ORANGE', 28], ['JAUNE', 35], ['VERT', 25]]) : null;
          const cleT = `${svc}-${d}`; tickets[cleT] = (tickets[cleT] || 0) + 1;
          const ticket = `${svc}-${String(tickets[cleT]).padStart(3, '0')}`;
          const attenteMin = type === 'URGENCE' ? entre(2, 25) : entre(15, 110);
          const debut = arrivee + attenteMin * 6e4;
          // Journée en cours : les derniers arrivés attendent encore.
          const enAttente = aujourdHui && (debut > maintenant - 20 * 6e4 || (type === 'URGENCE' && arrivee > maintenant - 150 * 6e4 && alea() < 0.4));
          const hospit = alea() < (HOSPITALISE[diag] ?? (type === 'URGENCE' ? 0.35 : 0.04));
          const deces = (diag === 'B50.0' && alea() < 0.05) || (type === 'URGENCE' && triage === 'ROUGE' && alea() < 0.12);
          const issue = enAttente ? null : hospit ? 'HOSPITALISATION' : 'SORTIE';
          const statut = enAttente ? (alea() < 0.2 ? 'EN_COURS' : 'ATTENTE') : hospit ? 'HOSPITALISE' : 'TERMINEE';
          const vid = Number(st.visite.run(p.id, e.id, services[svc].id, type, ticket, triage, MOTIFS[diag] || null, statut, issue, horodatage(arrivee),
            statut === 'ATTENTE' ? null : horodatage(debut), statut === 'TERMINEE' ? horodatage(debut + 20 * 6e4) : null, u.accueil).lastInsertRowid);
          nVisites++;
          facturerActe(db, vid, type);
          if (enAttente) continue;

          // Consultation.
          const fievre = ['B54', 'B50.0', 'R50.9', 'A01.0', 'A90', 'J18.9', 'B05.9', 'A39.0'].includes(diag);
          const adulte = p.age >= 15;
          const cid = Number(st.consult.run(vid, u.medecin, Math.round((fievre ? 38.2 + alea() * 1.8 : 36.5 + alea() * 0.8) * 10) / 10,
            adulte ? (diag === 'I10' || diag === 'O14.1' ? entre(150, 190) : entre(105, 140)) : null, adulte ? (diag === 'I10' || diag === 'O14.1' ? entre(95, 115) : entre(65, 90)) : null,
            entre(70, 115), Math.round((adulte ? 48 + alea() * 35 : 3 + p.age * 2.6 + alea() * 3) * 10) / 10, adulte ? entre(150, 185) : null, entre(diag === 'J18.9' ? 88 : 95, 99),
            null, diag, libelleDiagnostic(diag), null, horodatage(debut + 10 * 6e4)).lastInsertRowid);
          // Examens.
          for (const code of EXAMENS_DIAG[diag] || []) {
            const fait = !aujourdHui || alea() < 0.5;
            const res = resultat(code, diag, alea);
            const { anormal, critique } = interpreter(code, res);
            const valide = fait && (!aujourdHui || alea() < 0.6);
            st.examen.run(vid, cid, code, !fait ? (alea() < 0.5 ? 'DEMANDE' : 'PRELEVE') : valide ? 'VALIDE' : 'SAISI', fait ? res : null, fait ? anormal : 0, fait ? critique : 0,
              horodatage(debut + 12 * 6e4), fait ? u.labo : null, fait ? horodatage(debut + entre(40, 150) * 6e4) : null, valide ? u.bio : null, valide ? horodatage(debut + entre(160, 300) * 6e4) : null);
            facturerExamen(db, vid, code);
          }
          // Prescriptions (dispensées plus tard dans la simulation de stock).
          for (const [code, q, poso] of PRESCRIPTIONS[diag] || []) {
            const quantite = !adulte && ['comprimé', 'gélule'].includes(meds[code].forme) ? Math.ceil(q / 2) : q;
            const prid = Number(st.presc.run(cid, meds[code].id, poso, quantite, 'A_DISPENSER', null, null).lastInsertRowid);
            if (!aujourdHui || alea() < 0.45) ((demande[`${e.id}:${code}`] ||= [])).push({ prid, vid, quantite, le: debut + 40 * 6e4 });
          }
          // Hospitalisation : un lit libre du service (pédiatrie ou médecine pour les urgences).
          if (hospit) {
            const svcLit = svc === 'URG' ? (p.age < 15 ? 'PED' : diag === 'O14.1' ? 'MAT' : ['S06.9', 'T14.9'].includes(diag) ? 'CHI' : 'MED') : svc;
            const duree = (diag === 'O80' ? entre(1, 2) : diag === 'K35.8' ? entre(3, 6) : entre(2, 7)) * 864e5;
            const entree = debut + 60 * 6e4;
            const lit = lits.find(l => l.service_code === svcLit && (occupe.get(l.id) || 0) < entree);
            if (!lit) {
              // Pas de lit : le patient attend aujourd'hui, sinon il est transféré.
              if (!aujourdHui && d > 1) db.prepare("UPDATE visites SET statut = 'TERMINEE', issue = 'TRANSFERT', fin = ? WHERE id = ?").run(horodatage(entree), vid);
            } else {
              const sortie = entree + duree;
              occupe.set(lit.id, sortie);
              if (sortie < maintenant) {
                st.sejour.run(vid, lit.id, horodatage(entree), horodatage(sortie), deces ? 'DECES' : 'GUERISON');
                db.prepare("UPDATE visites SET statut = 'TERMINEE', issue = ?, fin = ? WHERE id = ?").run(deces ? 'DECES' : 'SORTIE', horodatage(sortie), vid);
                facturerJournees(db, vid, Math.ceil(duree / 864e5));
              } else {
                st.sejour.run(vid, lit.id, horodatage(entree), null, null);
                db.prepare("UPDATE lits SET statut = 'OCCUPE' WHERE id = ?").run(lit.id);
              }
            }
          } else if (deces) db.prepare("UPDATE visites SET issue = 'DECES' WHERE id = ?").run(vid);
          if (!aujourdHui || alea() < 0.5) aPayer.push({ vid, le: debut + entre(30, 90) * 6e4 });
        }
        // Connexions quotidiennes des comptes de l'établissement.
        if (!aujourdHui) for (const id of Object.values(u)) if (alea() < 0.9) st.journal.run(id, e.id, 'CONNEXION', 'utilisateurs', id, horodatage(jourMs(d) - (maintenant % 864e5) + 7.5 * 36e5));
      }
      // Un lit hors service et deux en nettoyage, pour la cartographie.
      const libres = db.prepare("SELECT l.id FROM lits l JOIN services s ON s.id = l.service_id WHERE s.etablissement_id = ? AND s.code != 'URG' AND l.statut = 'LIBRE' ORDER BY l.id").all(e.id);
      if (libres.length > 4) {
        db.prepare("UPDATE lits SET statut = 'HORS_SERVICE' WHERE id = ?").run(libres[1].id);
        db.prepare("UPDATE lits SET statut = 'NETTOYAGE' WHERE id IN (?, ?)").run(libres[3].id, libres[libres.length - 1].id);
      }
    }

    // ---------- Stocks : réceptions, dispensations FEFO, seuils = 1 mois de consommation ----------
    for (const e of etabs) {
      const u = comptes[e.code];
      for (const m of Object.values(meds)) {
        const file = (demande[`${e.id}:${m.code}`] || []).sort((a, b) => a.le - b.le);
        const total = file.reduce((a, x) => a + x.quantite, 0);
        const cmm = Math.max(10, Math.round(total / 2));
        // Situations de démonstration : ruptures et stocks sous le seuil.
        const cas = { 'HDBGR:AMOX': 'rupture', 'HPMDO:ATPE': 'rupture', 'HGRN:RL': 'bas', 'HDBGR:ALU': 'bas', 'HPMDO:CEFT': 'bas', 'HGRN:FAF': 'bas' }[`${e.code}:${m.code}`];
        const reste = cas === 'rupture' ? 0 : cas === 'bas' ? Math.round(cmm * 0.45) : Math.round(cmm * (1.4 + alea() * 1.6));
        const fourni = cas === 'rupture' ? Math.round(total * 0.93) : total + reste;
        const lots = [
          { numero: `${m.code}-${entre(2400, 2599)}A`, peremption: horodatage(maintenant + entre(200, 700) * 864e5).slice(0, 10), q: Math.round(fourni * 0.55), recu: JOURS + 15 },
          { numero: `${m.code}-${entre(2600, 2699)}B`, peremption: horodatage(maintenant + entre(300, 800) * 864e5).slice(0, 10), q: fourni - Math.round(fourni * 0.55), recu: 28 },
        ].map(l => {
          const id = Number(db.prepare('INSERT INTO lots (etablissement_id, medicament_id, numero, peremption, quantite, recu_le) VALUES (?, ?, ?, ?, ?, ?)')
            .run(e.id, m.id, l.numero, l.peremption, 0, horodatage(jourMs(l.recu))).lastInsertRowid);
          return { ...l, id, dispo: 0 };
        });
        // Les réceptions et les sorties sont rejouées dans l'ordre chronologique.
        const evenements = [...lots.map(l => ({ le: jourMs(l.recu), lot: l })), ...file.map(x => ({ le: x.le, presc: x }))].sort((a, b) => a.le - b.le);
        for (const ev of evenements) {
          if (ev.lot) {
            ev.lot.dispo += ev.lot.q;
            db.prepare("INSERT INTO mouvements (lot_id, type, quantite, motif, utilisateur_id, le) VALUES (?, 'RECEPTION', ?, 'Livraison CPA', ?, ?)").run(ev.lot.id, ev.lot.q, u.pharma, horodatage(ev.le));
            continue;
          }
          const x = ev.presc;
          const dispo = lots.reduce((a, l) => a + l.dispo, 0);
          if (dispo < x.quantite) {
            db.prepare("UPDATE prescriptions SET statut = 'RUPTURE', dispense_par = ?, dispense_le = ? WHERE id = ?").run(u.pharma, horodatage(x.le), x.prid);
            continue;
          }
          let r = x.quantite;
          for (const l of [...lots].sort((a, b) => a.peremption.localeCompare(b.peremption))) {
            const q = Math.min(r, l.dispo); if (!q) continue;
            l.dispo -= q; r -= q;
            db.prepare("INSERT INTO mouvements (lot_id, type, quantite, prescription_id, utilisateur_id, le) VALUES (?, 'DISPENSATION', ?, ?, ?, ?)").run(l.id, -q, x.prid, u.pharma, horodatage(x.le));
          }
          db.prepare("UPDATE prescriptions SET statut = 'DISPENSEE', dispense_par = ?, dispense_le = ? WHERE id = ?").run(u.pharma, horodatage(x.le), x.prid);
          ajouterLigne(db, x.vid, 'MEDICAMENT', `${m.dci} ${m.dosage}${m.programme ? ' (programme, gratuit)' : ''}`, x.quantite, m.prix);
        }
        // Rupture : le reliquat est sorti par un ajustement d'inventaire (avarie), le stock tombe à zéro.
        if (cas === 'rupture') for (const l of lots) if (l.dispo > 0) {
          db.prepare("INSERT INTO mouvements (lot_id, type, quantite, motif, utilisateur_id, le) VALUES (?, 'AJUSTEMENT', ?, 'Inventaire : cartons endommagés', ?, ?)").run(l.id, -l.dispo, u.pharma, horodatage(maintenant - 2 * 864e5));
          l.dispo = 0;
        }
        for (const l of lots) db.prepare('UPDATE lots SET quantite = ? WHERE id = ?').run(l.dispo, l.id);
        db.prepare('UPDATE seuils SET seuil = ? WHERE etablissement_id = ? AND medicament_id = ?').run(cmm, e.id, m.id);
        // Lots proches de la péremption et un lot périmé, pour les alertes.
        if (cas !== 'rupture' && alea() < 0.18) db.prepare('INSERT INTO lots (etablissement_id, medicament_id, numero, peremption, quantite, recu_le) VALUES (?, ?, ?, ?, ?, ?)')
          .run(e.id, m.id, `${m.code}-${entre(2200, 2299)}P`, horodatage(maintenant + entre(20, 80) * 864e5).slice(0, 10), Math.round(cmm * 0.2) + 5, horodatage(jourMs(200)));
      }
      const para = db.prepare("SELECT id FROM medicaments WHERE code = 'PARA'").get().id;
      db.prepare('INSERT INTO lots (etablissement_id, medicament_id, numero, peremption, quantite, recu_le) VALUES (?, ?, ?, ?, ?, ?)')
        .run(e.id, para, 'PARA-2119X', horodatage(maintenant - 20 * 864e5).slice(0, 10), 240, horodatage(jourMs(400)));
    }

    // ---------- Encaissements ----------
    const modes = [['ESPECES', 62], ['AIRTEL_MONEY', 22], ['MOOV_MONEY', 11]];
    for (const { vid, le } of aPayer) {
      for (const f of db.prepare("SELECT f.*, e.code FROM factures f JOIN etablissements e ON e.id = f.etablissement_id WHERE f.visite_id = ? AND f.statut = 'A_PAYER'").all(vid)) {
        const caisse = comptes[f.code].caisse;
        const quand = horodatage(Math.min(le, maintenant - 6e4));
        if (alea() < 0.008) { db.prepare("UPDATE factures SET statut = 'ANNULEE', annulee_par = ?, motif_annulation = 'Erreur de saisie : visite enregistrée en double' WHERE id = ?").run(caisse, f.id); continue; }
        const p = db.prepare('SELECT p.categorie FROM visites v JOIN patients p ON p.id = v.patient_id WHERE v.id = ?').get(vid);
        const mode = p.categorie === 'ASSURE' && alea() < 0.5 ? 'TIERS_PAYANT' : pondere(modes);
        db.prepare('UPDATE factures SET statut = ?, mode = ?, reference_paiement = ?, caissier_id = ?, payee_le = ? WHERE id = ?')
          .run('PAYEE', mode, mode.endsWith('MONEY') ? `${mode === 'AIRTEL_MONEY' ? 'AM' : 'MM'}${entre(10000000, 99999999)}` : null, caisse, quand, f.id);
      }
    }
    return { patients: nPatients, visites: nVisites, comptes: Object.values(comptes).reduce((a, c) => a + Object.keys(c).length, 0) };
  });
}

// Résultat plausible selon l'examen et le diagnostic.
function resultat(code, diag, alea) {
  const e = EXAMENS[code];
  if (code === 'GE') return ['B54', 'B50.0'].includes(diag) ? e.choix[1 + Math.floor(alea() * 3)] : 'Négatif';
  if (code === 'TDRP') return alea() < 0.3 ? 'Positif' : 'Négatif';
  if (code === 'WIDAL') return alea() < 0.6 ? 'Positif' : 'Négatif';
  if (code === 'ECBU') return alea() < 0.7 ? 'Infection' : 'Stérile';
  if (code === 'NS1') return alea() < 0.55 ? 'Positif' : 'Négatif';
  if (code === 'VIH') return alea() < 0.02 ? 'Positif' : 'Négatif';
  if (code === 'GRS') return ['O+', 'O+', 'A+', 'B+', 'AB+', 'O-', 'A+', 'B+'][Math.floor(alea() * 8)];
  if (code === 'HB') return String(Math.round(((diag === 'B50.0' || diag === 'D57.1' || diag === 'D50.9' || diag === 'E43') ? 5 + alea() * 6 : 10 + alea() * 5) * 10) / 10);
  if (code === 'GLY') return String(Math.round((diag === 'E11.9' ? 1.3 + alea() * 1.9 : diag === 'B50.0' && alea() < 0.15 ? 0.35 + alea() * 0.2 : 0.75 + alea() * 0.4) * 100) / 100);
  if (code === 'CREA') return String(Math.round(diag === 'O14.1' ? 10 + alea() * 25 : 6 + alea() * 12));
  return e.choix ? e.choix[0] : '0';
}
