// Logique du quiz, sans aucune dépendance au DOM : testable avec `node --test`.
//
// Un seul format de question : un galon affiché, 4 propositions de texte.
// Objectif : le réflexe de DIRE le grade dès qu'on VOIT le galon.
//
// Deux modes de jeu, choisis à l'accueil :
//   - mode "grade"       : trouver le nom exact du grade
//       · "nom"    : Quel est ce grade ?               → 4 noms de grades
//       · "surnom" : Quel est le surnom de ce grade ?  → 4 surnoms (grades qui en ont un)
//   - mode "appellation" : savoir comment s'adresser au grade
//       · "appellation" : Comment l'appeler ?          → 4 appellations (Amiral, Commandant…)

export const QUESTIONS_PAR_PARTIE = 20;
export const NB_CHOIX = 4;
export const POINTS_MAX = 100;
export const PENALITE_ERREUR = -20;
export const REINJECTION_DELAI = 3; // un grade raté revient 3 questions plus tard
export const PROBA_SURNOM = 0.5; // quand le grade tiré a un surnom, 1 chance sur 2 de demander le surnom

export const TYPES = { NOM: "nom", SURNOM: "surnom", APPELLATION: "appellation" };
export const MODES = { GRADE: "grade", APPELLATION: "appellation" };

/** Points en jeu après `elapsedMs` : 100, moins 1 point par dixième de seconde, jamais négatif. */
export function pointsEnJeu(elapsedMs) {
  return Math.max(0, POINTS_MAX - Math.floor(elapsedMs / 100));
}

/** Points gagnés (ou perdus) pour une réponse. */
export function scorePour(correct, elapsedMs) {
  return correct ? pointsEnJeu(elapsedMs) : PENALITE_ERREUR;
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Tous les surnoms proposables : ceux des grades, plus le vocabulaire du bord
 * (« Pacha », « Bidel »), qui sert de piège : ce sont des fonctions, pas des grades.
 */
export function poolSurnoms(grades, vocabulaire = []) {
  const s = new Set();
  for (const g of grades) if (g.surnom) s.add(g.surnom.texte);
  for (const v of vocabulaire) s.add(v.terme);
  return [...s];
}

export function createSession(grades, rng = Math.random, vocabulaire = [], mode = MODES.GRADE) {
  if (!Object.values(MODES).includes(mode)) throw new Error(`Mode inconnu : ${mode}`);
  return {
    mode,
    grades,
    byId: Object.fromEntries(grades.map((g) => [g.id, g])),
    surnoms: poolSurnoms(grades, vocabulaire),
    rng,
    deck: shuffle(grades.map((g) => g.id), rng),
    reinjections: [], // { id, type, due }
    history: [], // { question, choiceId, correct, points, elapsedMs }
    score: 0,
  };
}

export function isFinished(session) {
  return session.history.length >= QUESTIONS_PAR_PARTIE;
}

/**
 * Distracteurs plausibles : grades voisins dans la hiérarchie, de préférence
 * dans la même catégorie. On tire 3 grades parmi les 5 plus proches.
 */
export function distracteurs(session, cible, n = NB_CHOIX - 1) {
  const { grades, rng } = session;
  const proches = grades
    .filter((g) => g.id !== cible.id)
    .map((g) => ({
      g,
      d: Math.abs(g.rang - cible.rang) + (g.categorie === cible.categorie ? 0 : 3) + rng() * 0.5,
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n + 2)
    .map((x) => x.g);
  return shuffle(proches, rng).slice(0, n);
}

function dernierGrade(session) {
  const last = session.history[session.history.length - 1];
  return last ? last.question.cibleId : null;
}

/**
 * Appellations proposées en piège : celles des grades voisins (différentes de la bonne),
 * tirées parmi les 5 plus proches. Plusieurs grades partagent la même appellation
 * (tous les officiers généraux → « Amiral »), d'où le dédoublonnage.
 */
export function appellationsVoisines(session, cible, n = NB_CHOIX - 1) {
  const { grades, rng } = session;
  const vues = new Set([cible.appellation]);
  const proches = [];
  const tries = grades
    .map((g) => ({ g, d: Math.abs(g.rang - cible.rang) + rng() * 0.5 }))
    .sort((a, b) => a.d - b.d);
  for (const { g } of tries) {
    if (!vues.has(g.appellation)) {
      vues.add(g.appellation);
      proches.push(g.appellation);
    }
    if (proches.length >= n + 2) break;
  }
  return shuffle(proches, rng).slice(0, n);
}

/** Construit une question. `choix` : [{ id, texte }], une seule bonne réponse. */
export function construireQuestion(session, cibleId, type = TYPES.NOM, reinjection = false) {
  const cible = session.byId[cibleId];
  const { rng } = session;

  if (type === TYPES.APPELLATION) {
    const bon = cible.appellation;
    const autres = appellationsVoisines(session, cible).slice(0, NB_CHOIX - 1);
    const choix = shuffle([bon, ...autres], rng).map((a) => ({ id: a, texte: a }));
    return { type, cibleId, choix, reponseId: bon, reinjection };
  }

  if (type === TYPES.SURNOM) {
    const bon = cible.surnom.texte;
    const autres = shuffle(session.surnoms.filter((s) => s !== bon), rng).slice(0, NB_CHOIX - 1);
    const choix = shuffle([bon, ...autres], rng).map((s) => ({ id: s, texte: s }));
    return { type, cibleId, choix, reponseId: bon, reinjection };
  }

  const choix = shuffle([cible, ...distracteurs(session, cible)], rng).map((g) => ({ id: g.id, texte: g.nom }));
  return { type: TYPES.NOM, cibleId, choix, reponseId: cibleId, reinjection };
}

function prochainDuDeck(session) {
  const last = dernierGrade(session);
  if (session.deck.length === 0) session.deck = shuffle(session.grades.map((g) => g.id), session.rng);
  // On évite le grade précédent et ceux qui attendent déjà leur réinjection
  const enAttente = new Set(session.reinjections.map((r) => r.id));
  let idx = session.deck.length - 1;
  while (idx > 0 && (session.deck[idx] === last || enAttente.has(session.deck[idx]))) idx -= 1;
  return session.deck.splice(idx, 1)[0];
}

export function nextQuestion(session) {
  if (isFinished(session)) return null;
  const i = session.history.length;
  const last = dernierGrade(session);

  // 1. Un grade raté qui doit revenir maintenant (même variante de question)
  const due = session.reinjections
    .filter((r) => r.due <= i && r.id !== last)
    .sort((a, b) => a.due - b.due)[0];
  if (due) {
    session.reinjections = session.reinjections.filter((r) => r !== due);
    return construireQuestion(session, due.id, due.type, true);
  }

  // 2. Sinon, le prochain grade du paquet mélangé
  const id = prochainDuDeck(session);
  if (session.mode === MODES.APPELLATION) return construireQuestion(session, id, TYPES.APPELLATION);
  const aUnSurnom = Boolean(session.byId[id].surnom) && session.surnoms.length >= NB_CHOIX;
  const type = aUnSurnom && session.rng() < PROBA_SURNOM ? TYPES.SURNOM : TYPES.NOM;
  return construireQuestion(session, id, type);
}

export function answer(session, q, choiceId, elapsedMs) {
  const correct = choiceId === q.reponseId;
  const points = scorePour(correct, elapsedMs);
  session.score += points;
  session.history.push({ question: q, choiceId, correct, points, elapsedMs });

  if (!correct && !session.reinjections.some((r) => r.id === q.cibleId)) {
    // Le grade raté revient quelques questions plus tard
    session.reinjections.push({ id: q.cibleId, type: q.type, due: session.history.length + REINJECTION_DELAI - 1 });
  }
  return { correct, points };
}

/** Bilan de fin de partie. */
export function bilan(session) {
  const h = session.history;
  const justes = h.filter((x) => x.correct);
  const ratesIds = [...new Set(h.filter((x) => !x.correct).map((x) => x.question.cibleId))];
  const tempsMoyen = justes.length ? justes.reduce((s, x) => s + x.elapsedMs, 0) / justes.length : 0;
  return {
    score: session.score,
    justes: justes.length,
    total: h.length,
    tempsMoyenMs: tempsMoyen,
    rates: ratesIds.map((id) => session.byId[id]).sort((a, b) => a.rang - b.rang),
  };
}
