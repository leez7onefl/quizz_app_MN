// Lancer avec : node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  createSession, nextQuestion, answer, isFinished, bilan, distracteurs, construireQuestion,
  pointsEnJeu, scorePour, TYPES, MODES, QUESTIONS_PAR_PARTIE, NB_CHOIX,
} from "../js/quiz.js";

const data = JSON.parse(readFileSync(new URL("../data/grades.json", import.meta.url), "utf8"));
const { grades, vocabulaire } = data;
const nouvelleSession = (rng) => createSession(grades, rng, vocabulaire);

// Générateur pseudo-aléatoire déterministe (mulberry32)
function rngFrom(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mauvais = (q) => q.choix.find((c) => c.id !== q.reponseId).id;

test("barème : 100 points moins 1 par dixième, 0 à 10 s, -20 si faux", () => {
  assert.equal(scorePour(true, 0), 100);
  assert.equal(scorePour(true, 99), 100);
  assert.equal(scorePour(true, 100), 99);
  assert.equal(scorePour(true, 2350), 77);
  assert.equal(scorePour(true, 10000), 0);
  assert.equal(scorePour(true, 11000), 0);
  assert.equal(scorePour(false, 500), -20);
  assert.equal(pointsEnJeu(5000), 50);
});

test("données : ids et rangs uniques, un fichier SVG par grade", () => {
  assert.equal(new Set(grades.map((g) => g.id)).size, grades.length);
  assert.equal(new Set(grades.map((g) => g.rang)).size, grades.length);
  for (const g of grades) {
    assert.ok(existsSync(new URL(`../galons/${g.id}.svg`, import.meta.url)), g.id);
  }
});

test("distracteurs : 3 grades différents de la cible, proches dans la hiérarchie", () => {
  const s = nouvelleSession(rngFrom(1));
  for (const cible of grades) {
    const d = distracteurs(s, cible);
    assert.equal(d.length, 3);
    assert.ok(d.every((g) => g.id !== cible.id));
    assert.equal(new Set(d.map((g) => g.id)).size, 3);
    assert.ok(d.every((g) => Math.abs(g.rang - cible.rang) <= 6), cible.id);
  }
});

test("une partie : 20 questions, un galon, 4 textes distincts, une seule bonne réponse", () => {
  const types = { nom: 0, surnom: 0 };
  for (let seed = 0; seed < 200; seed++) {
    const s = nouvelleSession(rngFrom(seed));
    const rng = rngFrom(seed + 1000);
    let n = 0, q;
    while ((q = nextQuestion(s))) {
      assert.ok(s.byId[q.cibleId], "le galon affiché est celui d'un grade");
      assert.equal(q.choix.length, NB_CHOIX);
      assert.equal(new Set(q.choix.map((c) => c.texte)).size, NB_CHOIX);
      assert.equal(q.choix.filter((c) => c.id === q.reponseId).length, 1);
      types[q.type]++;
      answer(s, q, rng() < 0.6 ? q.reponseId : q.choix[Math.floor(rng() * NB_CHOIX)].id, rng() * 12000);
      n++;
    }
    assert.equal(n, QUESTIONS_PAR_PARTIE);
    assert.ok(isFinished(s));
  }
  assert.ok(types.surnom > 0 && types.nom > types.surnom, JSON.stringify(types));
});

test("question surnom : bonne réponse = surnom du grade, pièges Pacha/Bidel possibles", () => {
  const s = nouvelleSession(rngFrom(5));
  const avecSurnom = grades.filter((g) => g.surnom);
  assert.ok(avecSurnom.length >= 5);
  let piegeVu = false;
  for (let k = 0; k < 50; k++) {
    for (const g of avecSurnom) {
      const q = construireQuestion(s, g.id, TYPES.SURNOM);
      assert.equal(q.reponseId, g.surnom.texte);
      assert.equal(q.choix.filter((c) => c.texte === g.surnom.texte).length, 1);
      if (q.choix.some((c) => vocabulaire.some((v) => v.terme === c.texte))) piegeVu = true;
    }
  }
  assert.ok(piegeVu);
});

test("les grades sans surnom ne reçoivent jamais de question surnom", () => {
  for (let seed = 0; seed < 100; seed++) {
    const s = nouvelleSession(rngFrom(seed));
    let q;
    while ((q = nextQuestion(s))) {
      if (q.type === TYPES.SURNOM) assert.ok(s.byId[q.cibleId].surnom);
      answer(s, q, q.reponseId, 1000);
    }
  }
});

test("un grade raté revient 3 questions plus tard, avec la même variante", () => {
  for (let seed = 0; seed < 100; seed++) {
    const s = nouvelleSession(rngFrom(seed));
    const q0 = nextQuestion(s);
    answer(s, q0, mauvais(q0), 1000);
    const suite = [];
    for (let i = 0; i < 3; i++) {
      const q = nextQuestion(s);
      suite.push(q);
      answer(s, q, q.reponseId, 1000);
    }
    assert.ok(suite[2].reinjection, `seed ${seed}`);
    assert.equal(suite[2].cibleId, q0.cibleId);
    assert.equal(suite[2].type, q0.type);
  }
});

test("pas deux fois de suite le même galon", () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = nouvelleSession(rngFrom(seed));
    const rng = rngFrom(seed + 7);
    let prev = null, q;
    while ((q = nextQuestion(s))) {
      if (prev) assert.notEqual(q.cibleId, prev.cibleId);
      answer(s, q, rng() < 0.5 ? q.reponseId : mauvais(q), 500);
      prev = q;
    }
  }
});

test("bilan : score cumulé et grades ratés", () => {
  const s = nouvelleSession(rngFrom(3));
  let q, total = 0;
  while ((q = nextQuestion(s))) {
    const juste = s.history.length % 2 === 0;
    total += answer(s, q, juste ? q.reponseId : mauvais(q), 2000).points;
  }
  const b = bilan(s);
  assert.equal(b.score, total);
  assert.equal(b.justes, 10);
  assert.equal(b.score, 10 * 80 + 10 * -20);
  assert.ok(b.rates.length > 0 && b.rates.every((g) => g.id));
});

test("mode appellation : 20 questions « comment l'appeler », une seule bonne appellation", () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = createSession(grades, rngFrom(seed), vocabulaire, MODES.APPELLATION);
    const rng = rngFrom(seed + 99);
    let n = 0, q;
    while ((q = nextQuestion(s))) {
      assert.equal(q.type, TYPES.APPELLATION);
      assert.equal(q.reponseId, s.byId[q.cibleId].appellation);
      assert.equal(q.choix.length, NB_CHOIX);
      assert.equal(new Set(q.choix.map((c) => c.texte)).size, NB_CHOIX, "4 appellations différentes");
      assert.equal(q.choix.filter((c) => c.id === q.reponseId).length, 1);
      answer(s, q, rng() < 0.6 ? q.reponseId : mauvais(q), 1500);
      n++;
    }
    assert.equal(n, QUESTIONS_PAR_PARTIE);
  }
});

test("mode appellation : tous les officiers généraux s'appellent « Amiral »", () => {
  const s = createSession(grades, rngFrom(1), vocabulaire, MODES.APPELLATION);
  for (const id of ["ca", "va", "vae", "amiral"]) {
    const q = construireQuestion(s, id, TYPES.APPELLATION);
    assert.equal(q.reponseId, "Amiral");
  }
  for (const id of ["cc", "cf", "cv"]) {
    assert.equal(construireQuestion(s, id, TYPES.APPELLATION).reponseId, "Commandant");
  }
});

test("mode grade : jamais de question d'appellation", () => {
  for (let seed = 0; seed < 50; seed++) {
    const s = nouvelleSession(rngFrom(seed));
    let q;
    while ((q = nextQuestion(s))) {
      assert.notEqual(q.type, TYPES.APPELLATION);
      answer(s, q, q.reponseId, 1000);
    }
  }
});
