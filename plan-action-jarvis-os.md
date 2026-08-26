# Plan d'action — Jarvis OS

*Basé sur l'analyse complète du dépôt (v0.4.0). Organisé en 4 sprints par ordre de priorité, avec critères d'acceptation pour chaque chantier.*

---

## Vue d'ensemble

| Sprint | Thème | Durée estimée | Objectif |
|---|---|---|---|
| Sprint 0 | Nettoyage rapide | 0,5 jour | Éliminer les risques et confusions à coût nul |
| Sprint 1 | Découpage de `server.ts` | 3-5 jours | Réduire le point de défaillance unique |
| Sprint 2 | Unification `mission/` vs `runtime/` | 4-7 jours | Une seule source de vérité pour l'orchestration |
| Sprint 3 | Durcissement sécurité & tests | 3-5 jours | Fermer les gaps identifiés |
| Sprint 4 | Roadmap produit (Phase 8+) | Continu | Reprendre l'avancement fonctionnel |

**Total estimé avant reprise de la roadmap produit : ~2-3 semaines** à un rythme projet perso/petite équipe.

---

## Sprint 0 — Nettoyage rapide (0,5 jour)

Aucune dépendance, à faire immédiatement, avant tout refactor.

- [ ] **`.env.example`** : supprimer la ligne `JARVIS_SELF_ROOT_OVERRIDE="C:\chemin\vers\autre\repo" npm run dev` (résidu de copier-coller — la variable doit être documentée seule, pas concaténée à une commande)
- [ ] **`.env.example`** : supprimer ou corriger la ligne orpheline `NODE_ENV === 'test'` en bas de fichier (comparaison au lieu d'assignation, aucun effet actuel mais source de confusion)
- [ ] Relire l'intégralité de `.env.example` une fois ces deux lignes retirées, pour vérifier qu'aucune autre valeur n'a été collée par erreur
- [ ] Vérifier en CI/local que `npm run lint` (`scripts/lint.cjs`) passe toujours après ce nettoyage
- [ ] Committer séparément (`chore: nettoyage .env.example`) pour ne pas polluer les commits de refactor suivants

**Critère de sortie** : `.env.example` ne contient plus que des déclarations `VAR=""` valides et commentées.

---

## Sprint 1 — Découpage de `server.ts` (3 470 → cible < 500 lignes)

`server.ts` concentre aujourd'hui : montage de ~30 routeurs, ~40 routes définies inline, toute la logique WebSocket Gemini Live, et le bootstrap serveur. C'est le fichier le plus à risque du projet.

### 1.1 — Cartographier avant de toucher
- [ ] Lister toutes les routes inline restantes (déjà identifiées à date : `/api/agent-builder/*`, `/api/custom-agents/*`, `/api/gemini-keys/*`, `/api/sandbox/*`, `/api/checkpoint/*`, `/api/ide/*`, `/api/browser/*`)
- [ ] Pour chacune, noter ses dépendances directes (imports utilisés uniquement par cette route)

### 1.2 — Extraire les routeurs manquants (suivre le pattern existant de `server/routes/`)
- [ ] Créer `server/routes/sandbox.ts` → déplacer `/api/sandbox/status`, `/init`, `/activate`, `/deactivate`, `/validate`, `/sync`, `/accept-file`, `/reject-file`, `/discard`, `/reset`, `/diff`, `/file-diff`
- [ ] Créer `server/routes/checkpoint.ts` → déplacer `/api/checkpoint/create`, `/rollback`, `/list`, `/validate`
- [ ] Créer/étendre `server/routes/ide.ts` (existe déjà ? vérifier s'il faut fusionner) → déplacer `/api/ide/tree*`, `/file*`, `/create-file`, `/create-directory`, `/rename`, `/copy`, `/search`, `/delete`
- [ ] Créer `server/routes/browser.ts` → déplacer `/api/browser/content-result`, `/action-result`
- [ ] Créer `server/routes/custom-agents.ts` (existe déjà comme fichier skill, vérifier collision de nom) → déplacer `/api/agent-builder/*`, `/api/custom-agents/*`
- [ ] Créer `server/routes/gemini-keys.ts` → déplacer `/api/gemini-keys/*`
- [ ] Chaque routeur exporte une factory `createXRouter(deps)` suivant le pattern déjà utilisé par `createGithubRouter`, `createAgentsRouter`, etc. (cohérence avec l'existant)

### 1.3 — Isoler le WebSocket Gemini Live
- [ ] Créer `server/live/LiveSocketHandler.ts` (ou `server/websocket/`)
- [ ] Déplacer toute la logique `WebSocketServer`, `authenticateToken` sur query param, et le pont vers `@google/genai` Live API
- [ ] `server.ts` ne garde que l'instanciation : `attachLiveWebSocket(server, deps)`

### 1.4 — Résultat cible
- [ ] `server.ts` final : imports, montage des routeurs (`app.use(...)`), configuration Express (compression, rate limit, static), `app.listen`, et rien d'autre
- [ ] Ajouter un test de fumée (`server/server-bootstrap.test.ts`) qui démarre le serveur sur un port de test et vérifie que `GET /api/health` répond `200`

**Critère de sortie** : `server.ts` < 500 lignes, chaque route vit dans un routeur dédié testable indépendamment, aucune régression sur `npm test`.

---

## Sprint 2 — Unifier `server/mission/` et `server/runtime/`

Ces deux modules semblent couvrir un territoire fonctionnel proche (planification + exécution de tâches IA), avec une couche de compatibilité (`runtime/compat/LegacyBridge.ts`, `SkillManagerV2.ts`) qui suggère une migration inachevée.

### 2.1 — Audit de recouvrement
- [ ] Lister les responsabilités de `mission/` : `Executor.ts`, `Planner.ts`, `Reflection.ts`, `SkillScorer.ts`
- [ ] Lister les responsabilités de `runtime/` : `AgentRuntime.ts`, `WorkflowEngine.ts`, `StateMachine.ts`, `ToolRegistry.ts`, `PromptRegistry.ts`
- [ ] Identifier pour chaque paire (ex. `mission/Planner.ts` vs `runtime/agents/planner.agent.ts`) : lequel est actuellement appelé en production (tracer les imports depuis `server.ts` / routeurs), lequel est mort ou en transition
- [ ] Documenter le résultat dans `docs/generated/architecture-orchestration.md` (nouveau fichier) : qui appelle quoi, qui est legacy

### 2.2 — Décision d'architecture
- [ ] Trancher explicitement : `runtime/` devient la cible unique (nom générique, `ToolRegistry`/`WorkflowEngine` suggèrent une conception plus aboutie), `mission/` est soit absorbé soit supprimé — **ou l'inverse si `mission/` est en réalité la version la plus récente**. Décision à valider en relisant les dates de dernière modification et les commits git associés.
- [ ] Écrire une courte ADR (Architecture Decision Record) dans `docs/plans/` justifiant le choix

### 2.3 — Migration
- [ ] Migrer les appelants de l'implémentation abandonnée vers l'implémentation retenue, un routeur à la fois
- [ ] Supprimer `runtime/compat/LegacyBridge.ts` et `SkillManagerV2.ts` une fois qu'il n'y a plus d'appelant de l'ancien chemin (vérifier par recherche globale)
- [ ] Supprimer le module abandonné (`mission/` ou l'équivalent runtime) une fois la bascule terminée
- [ ] Mettre à jour `server/runtime/INTEGRATION_GUIDE.md` pour refléter l'état final

**Critère de sortie** : un seul système d'orchestration de tâches IA, documenté, sans couche de compatibilité résiduelle.

---

## Sprint 3 — Durcissement sécurité & tests

### 3.1 — Chiffrement (faible risque réel, correction peu coûteuse)
- [ ] Migrer `server/utils/crypto.ts` de `aes-256-cbc` vers `aes-256-gcm` (authentifie le ciphertext, empêche la falsification silencieuse)
- [ ] Ajouter une fonction de migration : au premier `decrypt()` réussi sur un ancien format CBC, ré-encrypter en GCM et réécrire la valeur (migration transparente, sans script séparé à faire courir manuellement)
- [ ] Ajouter un test `crypto.test.ts` couvrant : chiffrement/déchiffrement round-trip, rejet d'un ciphertext altéré (doit lever une erreur explicite en GCM, contrairement au comportement silencieux actuel en CBC)

### 3.2 — Authentification
- [ ] Documenter clairement dans le README (section Sécurité) que l'auth est désactivée par défaut et n'est utile que si `JARVIS_API_TOKEN` est défini
- [ ] Ajouter un avertissement console au démarrage si `apiToken` n'est pas défini même en écoute locale (`127.0.0.1`), pour sensibiliser sans bloquer (le blocage existe déjà pour `0.0.0.0`)

### 3.3 — Couverture de tests
- [ ] Prioriser les tests de routes HTTP sur les modules les plus sensibles en premier : `routes/sandbox.ts` (nouveau, issu du Sprint 1), `routes/ide.ts` (accès fichiers), `routes/github.ts` (token GitHub)
- [ ] Ajouter des tests d'intégration légers avec `supertest` (ou équivalent) pour chaque nouveau routeur extrait au Sprint 1, en réutilisant les cas déjà couverts implicitement par les tests `skills/*.test.ts`
- [ ] Objectif raisonnable : couvrir au moins le chemin nominal + un cas d'erreur (auth, path traversal) par routeur sensible, pas une couverture à 100 %

**Critère de sortie** : `aes-256-gcm` en place avec migration transparente, section sécurité du README à jour, routeurs sensibles couverts par au moins un test d'intégration.

---

## Sprint 4 — Reprise de la roadmap produit

Une fois les sprints 0-3 terminés, la base de code est plus saine pour attaquer les phases suivantes du `ROADMAP.md`. Ordre de reprise suggéré, par valeur/effort :

| Ordre | Phase | Pourquoi en premier |
|---|---|---|
| 1 | **Phase 8 — Export PDF/DOCX** | Valeur utilisateur immédiate, périmètre technique borné, s'appuie sur des libs déjà présentes (`pdf-parse`, potentiel `docx` npm) |
| 2 | **Phase 9 — Score de complétude/clarté documentaire** | Réutilise directement le `knowledge/` déjà mature (pas de nouvelle infra) |
| 3 | **Phase 11 (partiel) — API publique REST** | Prérequis technique pour Google Drive/Notion/Slack ; à faire *après* le découpage de `server.ts` (Sprint 1), sinon l'API publique hériterait de la même dette |
| 4 | **Phase 10 — Multimodal avancé (OCR, vidéo)** | Plus gros effort, dépend de fournisseurs externes supplémentaires |
| 5 | **Phase 12 — Autonomie complète / self-improvement** | À n'attaquer qu'une fois Sprint 2 terminé — un système qui modifie son propre code doit d'abord avoir une orchestration unifiée et non ambiguë |

Pour chaque phase reprise, appliquer la même discipline déjà en place dans le projet : fichier `.test.ts` à côté de chaque nouveau module, mise à jour de `ROADMAP.md` (passage de 🔲 à 🚧 puis ✅), et documentation dans `docs/generated/`.

---

## Suivi

Un moyen simple de suivre ce plan sans outillage supplémentaire : copier les cases à cocher de chaque sprint dans une issue GitHub par sprint, et cocher au fur et à mesure. Le fichier `docs/generated/architecture-orchestration.md` et l'ADR du Sprint 2 servent de trace pérenne des décisions prises, utile si le projet accueille un jour d'autres contributeurs — ou si l'IA elle-même doit un jour raisonner sur sa propre architecture (cf. Phase 12).
