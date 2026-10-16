# Fonctionnalités manquantes, inachevées et opportunités (16 octobre 2026)

Classement imposé : **A** = terminer ou corriger l'existant ; **B** = qualité et expérience ;
**C** = nouvelles fonctionnalités à forte valeur ; **D** = facultatif ou prématuré.
Chaque proposition est justifiée par un constat de cet audit, pas par comparaison avec un autre IDE.

## A. Terminer ou corriger l'existant

| # | Élément | État constaté | Pourquoi c'est prioritaire | Réf. |
|---|---|---|---|---|
| A1 | Point de passage unique des autorisations | `AuthorizationGate` écrit et testé, jamais instancié ; Live contourne `ToolRegistry` | C'est la condition de toutes les promesses de contrôle | AUDIT-004, 012 |
| A2 | Amorçage du jeton à l'exécution | Jeton figé au build | Installation neuve probablement inutilisable | AUDIT-001, 002 |
| A3 | Vérification par preuve par défaut | `EvidenceEngine` présent, désactivé par défaut | Évite les faux « terminé » | AUDIT-013 |
| A4 | `.leannaignore` par projet | Chargé une fois, racine figée | Garde-fou annoncé inopérant après changement de projet | AUDIT-011 |
| A5 | Garde anti-injection dans `AgenticRuntime` et `Executor` | Absent | Les agents sans humain sont les plus exposés | AUDIT-006 |
| A6 | Boucle d'apprentissage relue par le Planner | Playbooks et leçons écrits, non relus | La « mémoire inter-missions » n'a pas d'effet mesurable sur le plan | AUDIT-014 |
| A7 | Sandbox des plugins | `AgentLoader` non branché ; `SkillWorker` ne charge pas en dev | Drapeau `.env.example` sans effet | AUDIT-015 |
| A8 | Kernel supervisé | `runSupervisedAgenticMission` orphelin | Brancher ou supprimer | AUDIT-015 |
| A9 | Marketplace réelle ou libellée « démo » | Catalogue et avis fictifs | Signaux de confiance inventés | AUDIT-021 |
| A10 | Indicateurs de santé exacts | Taille moyenne fausse, compteurs contradictoires | Le diagnostic génère des missions inutiles | AUDIT-019, 020 |
| A11 | Isolation complète de l'état des tests | Écritures dans `.Leanna/` réel | Pollue les statistiques qui pilotent l'autonomie | AUDIT-035 |

## B. Qualité et expérience utilisateur

| # | Amélioration | Valeur pour Leanna | Réf. |
|---|---|---|---|
| B1 | « Simuler avant d'exécuter » systématique pour les missions proposées | Le simulateur existe déjà ; il devient la porte d'entrée | AUDIT-018 |
| B2 | Composant d'erreur commun + messages mode installé / mode dev | Supprime les échecs muets | AUDIT-033 |
| B3 | Navigation unique, 5-6 espaces, police ≥ 12 px | Découvrabilité, fatigue visuelle | AUDIT-027 |
| B4 | Indicateur d'autonomie global et persistant | L'utilisateur sait ce que Leanna peut faire | AUDIT-011, 012 |
| B5 | Statut honnête des missions : `vérifié` / `non vérifié` / `échoué` | Calibre la confiance | AUDIT-013 |
| B6 | CI (typecheck, tests, ESLint erreurs, build, scan de secrets dans `dist/`) | Barrière automatique absente aujourd'hui | AUDIT-022 |
| B7 | Libellés et clavier (jsx-a11y : 205 avertissements) | Accessibilité | AUDIT-034 |
| B8 | Serveur dans un `utilityProcess` Electron | Fenêtres réactives pendant l'indexation | AUDIT-025 |

## C. Nouvelles fonctionnalités à forte valeur

| # | Fonctionnalité | Justification | Prérequis |
|---|---|---|---|
| C1 | **Journal d'actions de l'IA consultable** (qui, quoi, quand, commande, fichiers, environnement, approbation) | Les briques existent (ledger, preuves, timeline) mais sont dispersées par moteur ; l'utilisateur n'a pas une vue unique « tout ce que l'IA a fait » | A1 |
| C2 | **Profil d'environnement des sous-processus** (variables transmises, réseau autorisé) visible et modifiable | Répond directement à AUDIT-003/008 et rend l'autonomie acceptable sur un projet sensible | A1 |
| C3 | **Écran de diagnostic de premier démarrage** (jeton, clés, quota, sandbox, port) avec réparation | Les causes d'abandon identifiées sont toutes à cette étape | A2 |
| C4 | **Test e2e « mission de référence »** exécuté en CI avec un modèle simulé déterministe | Valide la boucle plan → action → preuve → rapport de bout en bout ; aucun test de ce type aujourd'hui | B6 |

## D. Facultatif ou prématuré

| # | Élément | Raison de différer |
|---|---|---|
| D1 | Marketplace communautaire publique (publication, notation) | Pas de backend, risque de chaîne d'approvisionnement tant que la sandbox plugins n'existe pas |
| D2 | Nouvelles intégrations (canaux, fournisseurs) | 238 outils déjà enregistrés ; la priorité est d'en sécuriser l'exécution |
| D3 | Nouveaux rôles d'agents / swarm | La vérification et l'autorisation ne sont pas uniformes entre moteurs |
| D4 | Présence vocale proactive (`LEANNA_VOICE_PROACTIVE`) | Ajoute des déclenchements autonomes alors que le contrôle n'est pas unifié |
| D5 | Redis / bus d'événements distribué | Usage local mono-poste ; complexité sans besoin démontré |

## Fonctionnalités présentes mais peu accessibles depuis l'interface (relevé partiel)

- Simulateur de mission : onglet « Simulation » séparé du bouton « Lancer » (AUDIT-018).
- Mode d'autonomie : modifiable via `POST /api/missions/autonomy`, non persisté (AUDIT-011).
- Testeur d'outils `POST /api/skills/execute` : utile au diagnostic, mais exécute n'importe quel outil
  sans confirmation (à réserver à un mode développeur).
