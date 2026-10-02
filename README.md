# Grades de la Marine

Quiz web pour apprendre les galons d'épaule de la Marine nationale.
Site statique (HTML, CSS, JavaScript)

## Règles du quiz

- 20 questions, 4 choix, une seule bonne réponse.
- Bonne réponse : 100 points, moins 1 point par dixième de seconde (0 point à partir de 10 s).
- Mauvaise réponse : −20 points.
- Le score n'est pas sauvegardé : fermer ou recharger l'onglet le remet à zéro.

Un seul format : **un galon affiché, 4 propositions de texte**. Deux modes au choix sur l'accueil :

- **Nom du grade** : « Quel est ce grade ? », 4 noms de grades. Quand le grade tiré a un surnom,
  une question sur deux devient « Quel est le surnom de ce grade ? » (second maître « Chef »,
  maître et premier maître « Patron », maître principal « Cipal », aspirant « Midship »).
  « Pacha » et « Bidel » servent de pièges : ce sont des fonctions, pas des grades.
- **Comment l'appeler** : « Comment l'appelles-tu ? », 4 appellations (Amiral, Commandant,
  Capitaine, Lieutenant, Maître…). La correction rappelle les autres grades qui partagent la même appellation.

Les mauvaises réponses proposées sont des grades voisins (même catégorie, rang proche).
Un grade raté revient 3 questions plus tard, avec la même question.
Après chaque réponse, le bon galon s'affiche avec l'appellation (« On dit : Commandant »).

## Structure

```
index.html            page unique (accueil, question, fin, planche de révision)
style.css
js/quiz.js            logique pure : tirage, distracteurs, points (aucun DOM)
js/main.js            interface : affichage, chrono, clavier
data/grades.json      les 22 grades : nom, appellation, catégorie, rang, description du galon
galons/*.svg          galons générés (ne pas modifier à la main)
tools/generate_galons.py   génère les SVG depuis grades.json
tests/quiz.test.js    tests de la logique
main.py               lancement local : python main.py (serveur sans cache + navigateur)
streamlit_app.py      version Streamlit : assemble le quiz en une page et l'affiche
.streamlit/config.toml  thème Streamlit aux couleurs du quiz
requirements.txt      streamlit (seulement pour streamlit_app.py)
```

## Lancer en local

Le navigateur refuse de charger `grades.json` si on ouvre `index.html` en double-clic.
Il faut un petit serveur.

```bash
python main.py
```

Il régénère les galons, démarre un serveur sans cache et ouvre le navigateur. Ctrl+C l'arrête.
Aucune dépendance : bibliothèque standard de Python uniquement.

## Version Streamlit

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

Le quiz reste en HTML/CSS/JS. `streamlit_app.py` assemble tout en une seule page (CSS, JS,
données et galons intégrés) et l'affiche avec `st.components.v1.html`, car ce cadre ne peut pas
charger de fichiers à côté de lui. Rien n'est à maintenir en double : modifier `js/`, `style.css`
ou `grades.json` met à jour les deux versions.

**Mettre en ligne sur Streamlit Community Cloud** : pousser le dépôt sur GitHub, puis sur
share.streamlit.io créer une app depuis ce dépôt avec `streamlit_app.py` comme fichier principal.
L'app se met en veille après une période sans visite : le premier visiteur attend son réveil.

## Cache du navigateur

Le navigateur garde en mémoire les fichiers JS et CSS. Si une ancienne version de `quiz.js`
reste en cache alors que `main.js` est neuf, l'affichage casse (par exemple des boutons vides).

- **En local**, `main.py` désactive le cache. La version Streamlit intègre tout dans la page, elle n'est pas concernée.
- **En ligne**, à chaque mise à jour de `js/` ou `style.css`, augmente le numéro `?v=` à trois endroits :
  `style.css?v=` et `js/main.js?v=` dans `index.html`, et `./quiz.js?v=` en haut de `js/main.js`.

## Modifier un galon

1. Modifier la description dans `data/grades.json` (champ `galon`).
2. Régénérer : `python tools/generate_galons.py` (aucune dépendance).
3. Vérifier dans l'application, écran « Revoir tous les galons ».

Le script refuse de générer si deux grades ont un galon identique.

Les surnoms sont dans le champ `surnom` de chaque grade, et le vocabulaire du bord (Pacha, Bidel)
dans `vocabulaire`, en fin de fichier. La planche « Revoir tous les galons » affiche les deux.

## Tests

```bash
node --test
```

## Source

Surnoms et vocabulaire : Cols Bleus, Wikipédia.
Grades, galons et appellations d'après la planche « Grades et appellations — Marine nationale »
de lamarinerecrute.fr. Les galons SVG sont des dessins simplifiés.
