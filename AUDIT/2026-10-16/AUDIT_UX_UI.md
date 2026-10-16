# Audit UX / UI — Leanna-IDE (16 octobre 2026)

## Périmètre réellement inspecté

- **Inspection visuelle réelle** dans le navigateur intégré, sur le serveur de dev déjà lancé par
  l'utilisateur (`http://127.0.0.1:4000`, viewport 1440×900), en lecture seule (aucun bouton qui
  modifie l'état n'a été cliqué) : `/ide` (accueil), `/settings` (Profil), `/pilotage` (tableau de bord),
  `/pilotage?tab=missions`.
- **Limites** : le serveur s'est arrêté pendant l'audit (AUDIT-029) ; les autres écrans (chat, notebooks,
  navigateur intégré, agents, observabilité, marketplace) ont été analysés **par le code uniquement**.
  Les fenêtres Electron (splash, tray, fenêtre orb) n'ont pas été lancées. Aucune mission n'existait :
  l'affichage des preuves d'une mission terminée n'a pas pu être vu. Le contraste n'a été mesuré que
  partiellement (tailles de police).
- **Mesures automatiques** : ESLint `jsx-a11y` (exécuté) : 70 `label-has-for`, 41
  `label-has-associated-control`, 32 `click-events-have-key-events`, 32 `no-static-element-interactions`,
  15 `no-autofocus`, 6 `interactive-supports-focus`.

## Constats

| ID | Écran | Problème | Priorité |
|---|---|---|---|
| AUDIT-018 | Pilotage | Missions autonomes lancées en un clic, sans aperçu ni confirmation, échecs muets | P1 |
| AUDIT-033 | Premier démarrage, Pilotage | Erreurs avalées : assistant de clés et « Diagnostiquer » échouent sans message | P1 |
| AUDIT-027 | Global | Texte majoritairement à 10,8 px ; deux barres de navigation différentes ; 20 icônes sans libellé | P2 |
| AUDIT-032 | Barre d'état | « Hors ligne » désigne la session vocale Gemini Live, pas le serveur | P2 |
| AUDIT-034 | Global | Accessibilité clavier et libellés de formulaires (mesures jsx-a11y) | P2 |
| AUDIT-019 / 020 | Pilotage | Indicateurs faux ou contradictoires (voir AUDIT_BUGS.md) | P2 |
| AUDIT-021 | Marketplace | Avis et téléchargements inventés (voir AUDIT_BUGS.md) | P2 |

---

## AUDIT-018 — Missions autonomes lancées en un clic, sans aperçu ni confirmation

- **Catégorie** : UX / contrôle des actions de l'IA
- **Gravité** : élevée · **Statut** : confirmé (code + écran) · **Confiance** : élevée
- **Écran** : `/pilotage`, cartes « Insights » (bouton « Lancer »), « Opportunités » (« Automatiser »),
  bouton « Diagnostiquer & créer » (plan d'amélioration en 5 missions).
- **Fichiers** : `src/views/MissionControlView.tsx:86-101` (`POST /api/missions/doctor/create`,
  `max: 5`), `:343-353` (`POST /api/missions`), `server/skills/mission.ts:323-341` (démarrage immédiat),
  `server.ts:416-420` (mode d'autonomie par défaut `auto`)
- **Problème** : un seul clic crée et démarre une mission qui modifie le code (« Casser les cycles de
  dépendance », « Refactoriser vers des unités plus petites »). Le simulateur de mission existe
  (onglet « Simulation », `MissionSimulator`) mais n'est pas proposé avant le lancement.
- **Impact** : modifications massives non anticipées ; plusieurs missions concurrentes (AUDIT-017) ;
  les propositions viennent d'un diagnostic partiellement faux (AUDIT-019).
- **Solution** : bouton principal « Simuler » ; « Exécuter » seulement depuis le résultat de la
  simulation, avec la liste des fichiers visés et le mode d'autonomie rappelé.
- **Critères d'acceptation** : aucune mission d'écriture ne démarre sans écran de confirmation.
- **Test** : test RTL de `InsightsCard` : clic « Lancer » → ouvre la simulation, aucun `POST /api/missions`.

## AUDIT-033 — Erreurs avalées dans des parcours essentiels

- **Gravité** : élevée · **Statut** : confirmé (code) · **Confiance** : élevée
- **Cas 1** : `src/components/EnvSetupModal.tsx:54-58` — si `GET /api/env` échoue (401, 500), l'assistant
  de configuration ne s'ouvre pas et rien n'est affiché (voir AUDIT-002).
- **Cas 2** : `src/views/MissionControlView.tsx:91-101` — `diagnose()` n'a pas de branche d'erreur :
  en cas d'échec, le bouton redevient actif sans message.
- **Cas 3** : intercepteur global `src/main.tsx` — après 12 échecs réseau, toutes les requêtes reçoivent
  un 503 synthétique pendant 8 s avec l'indice « Redémarrez le backend avec "npm run dev" », message
  inadapté à un utilisateur de l'application installée.
- **Solution** : composant d'erreur commun (titre, cause en langage clair, action : « Réessayer »,
  « Ouvrir le diagnostic », « Voir les journaux ») ; messages différents en mode installé et en mode dev.

## AUDIT-027 — Lisibilité et architecture de navigation

- **Gravité** : moyenne · **Statut** : confirmé (mesure dans l'interface) · **Confiance** : moyenne
- **Mesures** :
  - Onglet Missions : 8 éléments de texte sur 15 à **10,8 px**, 6 à 14,4 px (mesure `getComputedStyle`).
    À 1440×900, la majorité des libellés secondaires du tableau de bord sont visuellement de cette taille.
  - L'écran IDE comporte une barre d'activité de **20 boutons icônes** (Explorateur, Recherche, Terminal,
    GitHub, Sandbox, CI/CD, Prévisualisation, Knowledge, Notebooks, Santé système, PM2, Agent Builder,
    Marketplace, Docs Skills, Caméra, Partage écran, Agents, Présence vocale, Changer de projet,
    Paramètres). Les libellés n'existent qu'en `aria-label`/infobulle.
  - `/pilotage` affiche **une autre** barre latérale (11 icônes, ensemble différent). L'utilisateur
    change de modèle de navigation selon l'écran.
  - Les Paramètres comptent environ 20 sections réparties en 4 groupes, dont l'édition brute des
    variables `.env`.
- **Impact** : découvrabilité faible, fatigue visuelle, courbe d'apprentissage élevée.
- **Solution** : une seule barre de navigation globale ; regrouper les 20 entrées en 5 à 6 espaces
  (Code, Agents & missions, Connaissance, Outils, Système) avec libellés visibles au survol prolongé ou
  en mode étendu ; police minimale de 12 px pour le texte informatif ; déplacer l'édition `.env` dans
  une section « Avancé ».

## AUDIT-032 — « Hors ligne » ambigu dans la barre d'état

- **Gravité** : moyenne · **Statut** : confirmé (observé) · **Confiance** : élevée
- **Observation** : la barre d'état affiche « Hors ligne » alors que le serveur répondait et que le
  bouton voisin indiquait « MCP: ok » et « Sandbox actif ». L'arbre d'accessibilité précise
  « Statut Gemini Live : Hors ligne » : il s'agit de la session vocale, non démarrée.
- **Impact** : l'utilisateur croit l'application déconnectée.
- **Solution** : libellé « Voix : inactive » ; réserver « Hors ligne » à la perte du backend (déjà gérée
  par `ConnectionBanner`).

## AUDIT-034 — Accessibilité clavier et formulaires

- **Gravité** : moyenne · **Statut** : confirmé (mesure statique) · **Confiance** : moyenne
- **Mesures ESLint** : 111 avertissements de libellés non associés, 32 éléments cliquables sans
  gestion clavier, 32 éléments statiques interactifs, 15 `autoFocus`.
- **Non vérifié** : parcours clavier complet, visibilité du focus, lecteurs d'écran.
- **Solution** : traiter les 64 éléments cliquables non accessibles (remplacer par `<button>`) ; associer
  chaque `<label>` ; ajouter un test axe-core sur les écrans principaux.

## Forces observées

- Thème sombre cohérent, hiérarchie claire sur l'accueil (« Démarrer Leanna » mis en avant, raccourci
  Ctrl+L affiché), quatre cartes d'entrée explicites (Agents, Missions, Notebooks, Navigateur).
- Boutons d'icônes dotés d'un `aria-label` explicite (relevé via l'arbre d'accessibilité).
- États vides présents (« Aucune mission. Lancez une mission pour voir sa timeline. »,
  « Sélectionnez une mission pour afficher sa timeline. »).
- Paramètres dotés d'une recherche (`/`) et d'un aperçu du profil.

## Écrans non inspectés visuellement (analyse par le code seulement ou non auditée)

Chat et composeur, notebooks, navigateur intégré, agents et swarm, observabilité, marketplace,
historique, GitHub, documents, splash Electron, fenêtre orb, tray, comportement en petite fenêtre
(< 1024 px), thème clair.
