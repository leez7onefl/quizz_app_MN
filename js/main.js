import {
  createSession, nextQuestion, answer, isFinished, bilan, pointsEnJeu,
  QUESTIONS_PAR_PARTIE, POINTS_MAX, TYPES, MODES,
} from "./quiz.js?v=6"; // ?v= : changer le numéro à chaque mise à jour (voir README)

const $ = (sel) => document.querySelector(sel);
// Version intégrée (Streamlit) : streamlit_app.py injecte les données et les galons
// dans window.__QUIZ_EMBARQUE__, car la page ne peut pas charger de fichiers à côté d'elle.
const EMBARQUE = window.__QUIZ_EMBARQUE__ || null;
const galonSrc = (id) => EMBARQUE?.galons?.[id] ?? `galons/${id}.svg`;

let data = null;          // contenu de grades.json
let categories = {};      // id -> nom
let vocabulaire = {};     // terme -> { terme, sens, remarque }
let session = null;
let mode = MODES.GRADE;   // dernier mode choisi à l'accueil
let question = null;
let debut = 0;            // performance.now() à l'affichage de la question
let repondu = false;
let rafId = 0;

// ---------- Navigation ----------

function afficher(ecran) {
  for (const s of document.querySelectorAll(".ecran")) s.hidden = s.id !== `ecran-${ecran}`;
  window.scrollTo(0, 0);
}

// ---------- Chargement ----------

async function charger() {
  data = EMBARQUE?.data ?? (await (await fetch("data/grades.json")).json());
  categories = Object.fromEntries(data.categories.map((c) => [c.id, c.nom]));
  vocabulaire = Object.fromEntries((data.vocabulaire || []).map((v) => [v.terme, v]));
  // Précharge tous les galons pour que le chrono ne compte pas le téléchargement
  await Promise.all(
    data.grades.map((g) => {
      const img = new Image();
      img.src = galonSrc(g.id);
      return img.decode().catch(() => {});
    })
  );
}

// ---------- Partie ----------

const ENONCES = {
  [TYPES.NOM]: "Quel est ce grade ?",
  [TYPES.SURNOM]: "Quel est le surnom de ce grade ?",
  [TYPES.APPELLATION]: "Comment l'appelles-tu ?",
};

function nouvellePartie() {
  session = createSession(data.grades, Math.random, data.vocabulaire || [], mode);
  $("#score").textContent = "0";
  afficher("question");
  questionSuivante();
}

function imgGalon(id, cls = "") {
  const img = document.createElement("img");
  img.src = galonSrc(id);
  img.alt = "";
  if (cls) img.className = cls;
  return img;
}

async function questionSuivante() {
  if (isFinished(session)) return finDePartie();

  question = nextQuestion(session);
  repondu = false;
  $("#num-question").textContent = session.history.length + 1;
  $("#enonce").textContent = ENONCES[question.type];
  $("#feedback").hidden = true;

  // Le galon
  const sujet = $("#sujet");
  const carte = document.createElement("div");
  carte.className = "sujet-image";
  const image = imgGalon(question.cibleId);
  carte.append(image);
  sujet.replaceChildren(carte);

  // Les 4 propositions (noms ou surnoms)
  const choix = $("#choix");
  choix.replaceChildren();
  question.choix.forEach(({ id, texte }, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.id = id;
    b.dataset.touche = String(i + 1);
    b.textContent = texte;
    b.addEventListener("click", () => repondre(id));
    choix.append(b);
  });

  // Le chrono démarre quand tout est affiché
  await image.decode().catch(() => {});
  requestAnimationFrame(() => {
    debut = performance.now();
    majChrono();
  });
}

function majChrono() {
  if (repondu) return;
  const pts = pointsEnJeu(performance.now() - debut);
  $("#points-en-jeu").textContent = pts;
  $("#chrono-remplissage").style.transform = `scaleX(${pts / POINTS_MAX})`;
  $(".chrono").classList.toggle("epuise", pts === 0);
  rafId = requestAnimationFrame(majChrono);
}

function repondre(id) {
  if (repondu || !debut) return;
  const ecoule = performance.now() - debut;
  repondu = true;
  debut = 0;
  cancelAnimationFrame(rafId);

  const { correct, points } = answer(session, question, id, ecoule);
  $("#score").textContent = session.score;
  $("#points-en-jeu").textContent = correct ? points : 0;

  for (const b of document.querySelectorAll("#choix button")) {
    b.disabled = true;
    if (b.dataset.id === question.reponseId) b.classList.add("bonne");
    else if (b.dataset.id === id) b.classList.add("mauvaise");
    else b.classList.add("estompe");
  }
  afficherFeedback(correct, points, ecoule, id);
}

function ligne(cls, texte) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = texte;
  return d;
}

function fiche(id, { cible = false, remarque = false } = {}) {
  const gr = (session ? session.byId : Object.fromEntries(data.grades.map((g) => [g.id, g])))[id];
  const el = document.createElement("div");
  el.className = "fiche" + (cible ? " cible" : "");
  el.append(imgGalon(id));
  const txt = document.createElement("div");
  txt.append(
    ligne("fiche-nom", gr.nom),
    ligne("fiche-info", `On dit : « ${gr.appellation} » · ${categories[gr.categorie]}`)
  );
  if (gr.surnom) {
    txt.append(ligne("fiche-surnom", `Surnom : « ${gr.surnom.texte} »`));
    if (remarque) txt.append(ligne("fiche-info", gr.surnom.remarque));
  }
  el.append(txt);
  return el;
}

/** Fiche du mode « Comment l'appeler » : l'appellation d'abord, puis les grades qui la partagent. */
function ficheAppellation(id, { cible = false } = {}) {
  const gr = session.byId[id];
  const el = document.createElement("div");
  el.className = "fiche" + (cible ? " cible" : "");
  el.append(imgGalon(id));
  const txt = document.createElement("div");
  txt.append(ligne("fiche-nom", `On dit : « ${gr.appellation} »`), ligne("fiche-info", gr.nom));
  const memes = data.grades
    .filter((g) => g.appellation === gr.appellation && g.id !== id)
    .sort((a, b) => a.rang - b.rang)
    .map((g) => g.nom);
  if (memes.length) txt.append(ligne("fiche-info", `Pareil pour : ${memes.join(", ")}`));
  el.append(txt);
  return el;
}

/** Carte pour un terme du vocabulaire du bord (Pacha, Bidel…). */
function ficheVocabulaire(v) {
  const el = document.createElement("div");
  el.className = "vocab";
  el.append(
    ligne("fiche-nom", `« ${v.terme} » = ${v.sens}`),
    ligne("fiche-info", v.remarque)
  );
  return el;
}

function afficherFeedback(correct, points, ecoule, choisi) {
  const fb = $("#feedback");
  fb.classList.toggle("juste", correct);
  fb.classList.toggle("faux", !correct);
  const secondes = (ecoule / 1000).toFixed(1).replace(".", ",");
  $("#feedback-titre").textContent = correct
    ? `Bonne réponse · +${points} (${secondes} s)`
    : `Raté · ${points}`;

  const detail = $("#feedback-detail");
  detail.replaceChildren(
    question.type === TYPES.APPELLATION
      ? ficheAppellation(question.cibleId, { cible: true })
      : fiche(question.cibleId, { cible: true, remarque: question.type === TYPES.SURNOM })
  );
  // Piège « Pacha » / « Bidel » : on explique pourquoi ce n'est pas le surnom d'un grade
  if (!correct && vocabulaire[choisi]) detail.append(ficheVocabulaire(vocabulaire[choisi]));

  const dernier = isFinished(session);
  $("#btn-suivant").textContent = dernier ? "Voir mon score" : "Suivant";
  fb.hidden = false;
  $("#btn-suivant").focus({ preventScroll: true });
  fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function finDePartie() {
  const b = bilan(session);
  $("#fin-score").textContent = b.score;
  const moy = b.justes ? (b.tempsMoyenMs / 1000).toFixed(1).replace(".", ",") : "—";
  $("#fin-stats").innerHTML =
    `${b.justes} bonne${b.justes > 1 ? "s" : ""} réponse${b.justes > 1 ? "s" : ""} sur ${b.total}<br>` +
    `Temps moyen d'une bonne réponse : ${moy} s`;

  const rates = $("#fin-rates");
  rates.replaceChildren();
  if (b.rates.length) {
    const h = document.createElement("h3");
    h.textContent = "À revoir";
    const f = session.mode === MODES.APPELLATION ? ficheAppellation : fiche;
    rates.append(h, ...b.rates.map((g) => f(g.id)));
  } else {
    const ok = document.createElement("div");
    ok.className = "bravo";
    ok.textContent = "Aucune erreur. Bravo !";
    rates.append(ok);
  }
  afficher("fin");
}

// ---------- Planche de révision ----------

function construirePlanche() {
  const planche = $("#planche");
  planche.replaceChildren();
  // Du plus haut au plus bas, comme la planche officielle
  for (const cat of [...data.categories].reverse()) {
    const bloc = document.createElement("section");
    bloc.className = "categorie";
    const h = document.createElement("h3");
    h.textContent = cat.nom;
    const grille = document.createElement("div");
    grille.className = "planche-grille";
    data.grades
      .filter((g) => g.categorie === cat.id)
      .sort((a, b) => b.rang - a.rang)
      .forEach((g) => {
        const item = document.createElement("div");
        item.className = "planche-item";
        item.append(imgGalon(g.id));
        const txt = document.createElement("div");
        txt.append(ligne("fiche-nom", g.nom), ligne("fiche-info", `On dit : « ${g.appellation} »`));
        if (g.surnom) txt.append(ligne("fiche-surnom", `Surnom : « ${g.surnom.texte} »`));
        item.append(txt);
        grille.append(item);
      });
    bloc.append(h, grille);
    planche.append(bloc);
  }
  // Vocabulaire du bord : fonctions, pas des grades, donc pas de galon
  if (data.vocabulaire?.length) {
    const bloc = document.createElement("section");
    bloc.className = "categorie";
    const h = document.createElement("h3");
    h.textContent = "Vocabulaire du bord";
    const grille = document.createElement("div");
    grille.className = "planche-grille";
    grille.append(...data.vocabulaire.map(ficheVocabulaire));
    bloc.append(h, grille);
    planche.append(bloc);
  }

  const src = document.createElement("p");
  src.className = "source";
  src.textContent = `Grades : ${data.source}. ${data.source_surnoms || ""}`;
  planche.append(src);
}

let retourPlanche = "accueil";
function ouvrirPlanche(depuis) {
  retourPlanche = depuis;
  afficher("planche");
}

// ---------- Événements ----------

for (const b of document.querySelectorAll(".mode")) {
  b.addEventListener("click", () => {
    mode = b.dataset.mode;
    nouvellePartie();
  });
}
$("#btn-rejouer").addEventListener("click", nouvellePartie);
$("#btn-changer-mode").addEventListener("click", () => afficher("accueil"));
$("#btn-suivant").addEventListener("click", questionSuivante);
$("#btn-planche").addEventListener("click", () => ouvrirPlanche("accueil"));
$("#btn-planche-fin").addEventListener("click", () => ouvrirPlanche("fin"));
$("#btn-retour").addEventListener("click", () => afficher(retourPlanche));
// Quitter : deux appuis (pas de confirm(), souvent bloqué dans un cadre intégré)
let quitterTimer = 0;
$("#btn-quitter").addEventListener("click", () => {
  const btn = $("#btn-quitter");
  if (!btn.classList.contains("armer")) {
    btn.classList.add("armer");
    btn.setAttribute("aria-label", "Appuie encore pour quitter");
    btn.title = "Appuie encore pour quitter";
    clearTimeout(quitterTimer);
    quitterTimer = setTimeout(() => btn.classList.remove("armer"), 2500);
    return;
  }
  btn.classList.remove("armer");
  clearTimeout(quitterTimer);
  cancelAnimationFrame(rafId);
  repondu = true;
  afficher("accueil");
});

// Clavier : 1–4 pour répondre, Entrée pour continuer
document.addEventListener("keydown", (e) => {
  if ($("#ecran-question").hidden) return;
  if (!repondu && /^[1-4]$/.test(e.key)) {
    const id = question?.choix[Number(e.key) - 1]?.id;
    if (id) repondre(id);
  } else if (repondu && e.key === "Enter" && !$("#feedback").hidden && document.activeElement !== $("#btn-suivant")) {
    questionSuivante();
  }
});

charger()
  .then(() => {
    construirePlanche();
    for (const b of document.querySelectorAll(".mode")) b.disabled = false;
  })
  .catch((err) => {
    console.error(err);
    document.querySelector(".accroche").textContent =
      "Impossible de charger les données. Ouvre la page via un serveur (voir README).";
  });

$("#num-question").parentElement.lastChild.textContent = `/${QUESTIONS_PAR_PARTIE}`;
