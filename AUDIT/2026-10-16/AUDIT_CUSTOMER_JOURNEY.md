# Parcours client — état actuel et parcours cible (16 octobre 2026)

Méthode : lecture du code des étapes de démarrage et de configuration, inspection de quatre écrans
dans le serveur de dev, comparaison avec `README.md` (116 Ko) et `start.bat`. Le parcours
« installation depuis l'installateur sur une machine vierge » n'a **pas** été exécuté.

## 1. Parcours actuel, étape par étape

| # | Étape | Ce qui se passe réellement | Friction / risque d'abandon | Constats |
|---|---|---|---|---|
| 1 | Installation | Deux voies : installateur NSIS (251 Mo, 1 Go installé) ou dépôt + Node + `start.bat` (menu de 8 options, `npm install`, mode dev) | Taille ; la voie « dépôt » lance le **mode dev** (CSP permissive, Vite) | AUDIT-025, AUDIT-007 |
| 2 | Premier démarrage | Splash ≥ 5 s, puis fenêtre maximisée. En installation neuve : jeton serveur ≠ jeton embarqué → API en 401 | **Bloquant probable**, sans message | AUDIT-002 |
| 3 | Configuration des clés | `EnvSetupModal` s'ouvre si une clé requise manque. Sur erreur API, il ne s'ouvre pas. Une fois validé, `localStorage` empêche toute réapparition | L'utilisateur ne sait pas quelles clés manquent | AUDIT-033 |
| 4 | Ouverture d'un projet | Bouton « Changer de projet » (icône), clonage GitHub, scaffold. Sans projet, la sandbox et la détection de missions interrompues sont différées | Le `.leannaignore` du projet ouvert n'est pas appliqué | AUDIT-011 |
| 5 | Comprendre le produit | Accueil clair (« Démarrer Leanna », 4 cartes). Puis 20 icônes dans l'IDE, une autre barre en Pilotage, ~20 sections de paramètres | Surcharge, vocabulaire interne (Jev, swarm, contract-net, PM2, Smart Skills) | AUDIT-027 |
| 6 | Première tâche avec Leanna | « Démarrer Leanna » ouvre une session vocale/texte Gemini Live. Les actions passent par le handler direct | Actions sensibles sans confirmation (`node`, `npx`, Telegram) | AUDIT-003/004/005 |
| 7 | Tâche autonome | Pilotage → « Lancer » / « Automatiser » / « Diagnostiquer & créer » démarre immédiatement 1 à 5 missions en mode `auto` | Effets non anticipés, aucun aperçu | AUDIT-018, AUDIT-017 |
| 8 | Contrôle et preuves | Timeline des missions, onglet « Pourquoi ? », preuve opt-in. Statut « terminé » possible sans preuve | Confiance mal calibrée | AUDIT-013 |
| 9 | Reprise d'un travail interrompu | Détection des missions interrompues à la connexion du workspace, décision utilisateur (réactiver / effacer) | Bon principe ; rejoue les actions `in_progress` (constat 6 du 15/10 non revérifié) | — |
| 10 | Diagnostic | Écran Santé système, PM2, journaux. Indicateurs de santé partiellement faux | « Taille moyenne 12 324 lignes », compteurs contradictoires | AUDIT-019/020 |
| 11 | Mise à jour / incident | Installateur versionné (`latest.yml`), pas de mécanisme d'auto-update constaté dans `main.cjs` ; message de panne : « Redémarrez le backend avec npm run dev » | Message inadapté à l'application installée | AUDIT-033 |

## 2. Points de friction prioritaires par profil

- **Nouvel utilisateur** : installation lourde, premier démarrage probablement bloqué, assistant muet,
  jargon. Risque d'abandon maximal aux étapes 2-3.
- **Développeur régulier** : navigation à deux systèmes, texte petit, retours d'erreur absents,
  indicateurs de santé peu fiables qui génèrent des missions inutiles.
- **Utilisateur avancé** : croit gouverner l'autonomie (mode « suggest », `.leannaignore`, sandbox
  plugins, gate Jev) alors que ces réglages ne couvrent qu'une partie des chemins d'exécution
  (AUDIT-004/011/012/015).

## 3. Informations et contrôles nécessaires pour inspirer confiance

Sans surcharger l'interface, l'utilisateur doit voir à tout moment :
1. **Ce que Leanna peut faire maintenant** : un indicateur unique « Autonomie : Suggérer / Demander /
   Agir », appliqué à tous les chemins (voix, chat, missions, agents).
2. **Ce qui va se passer** avant toute écriture ou commande : liste des fichiers, commande exacte,
   environnement transmis.
3. **Ce qui s'est passé** après : diff, commandes et sorties, preuve (hash, tests) et statut honnête
   (`vérifié` / `non vérifié` / `échoué`).
4. **Comment annuler** : rollback de la sandbox ou du checkpoint en un clic.

## 4. Parcours cible proposé

1. **Installer** → l'application génère son jeton et sa clé maître (coffre de l'OS) au premier lancement.
2. **Configurer** → écran « Connecter un modèle » (une seule clé requise, test de connexion en direct,
   message clair en cas d'échec).
3. **Ouvrir un projet** → choix du dossier ; Leanna lit `.leannaignore`, indexe en arrière-plan avec
   une barre de progression, et affiche le mode d'autonomie par défaut **« Demander »**.
4. **Première tâche guidée** → suggestion d'une tâche sûre (« explique ce module », « écris un test »),
   aperçu du plan, approbation, exécution dans la sandbox, diff, bouton « Appliquer » ou « Jeter ».
5. **Missions** → toute proposition du tableau de bord passe par « Simuler » puis « Exécuter ».
6. **Reprise** → au redémarrage, une carte « 1 mission interrompue : reprendre depuis l'étape 3 /
   abandonner », avec ce qui a déjà été écrit.
7. **Incident** → écran de diagnostic unique (serveur, clés, quotas, sandbox, journaux), avec actions
   de réparation.

## 5. Non vérifié

Installation réelle sur machine vierge, mise à jour d'une version à l'autre, désinstallation,
comportement hors ligne (réseau coupé) de la session vocale, parcours au clavier uniquement.
