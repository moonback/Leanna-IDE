# 🗺️ Roadmap — Jarvis-OS

> **Jarvis-OS est un IDE universel piloté par l'IA.**
>
> Cette roadmap définit la vision produit, les jalons et les priorités pour faire de Jarvis-OS l'assistant de développement ultime — capable d'importer n'importe quel projet, de travailler dessus avec l'IA, et d'en changer à tout moment.

---

## 📌 Vision à long terme

**Jarvis-OS deviendra un système d'exploitation personnel au sein duquel l'IA agit comme un partenaire de confiance, capable de comprendre, d'apprendre et d'évoluer avec son utilisateur, tout en maintenant un contrôle humain strict et une sécurité maximale.**

---

## 🧭 Phases de développement

| Phase | Objectif | État | Période estimée |
|---|---|---|---|
| **V0.1** | Fondations (IDE, Gemini Live, skills de base) | ✅ Livrée | — |
| **V0.2** | Multi‑projets, sandbox, agents, knowledge system | ✅ Livrée | — |
| **V0.3** | Collaboration, visualisation, extensions | 🚧 En cours | < 2 mois |
| **V1.0** | Stabilisation, performances, documentation complète | 📋 Planifiée | 3‑6 mois |
| **V2+** | Écosystème, agents spécialisés, auto‑évolution autonome | 💡 Vision | > 6 mois |

---

## ✅ V0.2 — Livrée (version actuelle)

**Objectif :** Faire de Jarvis-OS un IDE universel multi-projets, sécurisé et piloté par l'IA.

| Domaine | Livrable | Statut |
|---|---|---|
| **IDE** | Explorateur de fichiers, éditeur Monaco, terminal intégré, barre d'état, thème clair/sombre | ✅ |
| **Multi-projets** | `SELF_ROOT` dynamique, import de projet externe, changement à chaud, modal de sélection au démarrage | ✅ |
| **Sandbox** | Bac à sable isolé, validation `tsc`, diff, acceptation/rejet fichier par fichier | ✅ |
| **Agents** | 6 rôles (test, docs, refactor, security, review, architect) + orchestration | ✅ |
| **Missions** | Planner, Executor, Reflection (planification, exécution, auto‑évaluation) | ✅ |
| **Knowledge System** | ProjectIndexer, KnowledgeGraph, DependencyGraph, ProjectMemory, SemanticSearch, ReasoningPipeline, ImpactAnalyzer, PlanningEngine, UnderstandingEngine, LearningEngine | ✅ |
| **MCP** | Bridge MCP avec support stdio/SSE, auto‑reconnexion, métriques | ✅ |
| **Mémoire** | Supabase (memories, conversations), recherche sémantique, RAG | ✅ |
| **Skills dynamiques** | Tier 1 / Tier 2, chargement paresseux, request_tools | ✅ |
| **Auto‑évolution** | Propositions, auto‑application (autonomie `manual`/`semi`/`autonomous`) | ✅ |
| **UI/UX** | Orb Hub, animations, feedback en temps réel, raccourcis clavier | ✅ |
| **Sécurité** | Authentification, chiffrement, rate limiting, validation post‑écriture | ✅ |

---

## 🚧 V0.3 — En cours / Court terme (< 2 mois)

**Objectif :** Rendre Jarvis-OS collaboratif, visuel et extensible pour une adoption plus large par les équipes de développement.

### 🎯 Thématiques

| Domaine | Livrable | État | Priorité |
|---|---|---|---|
| **Multi‑utilisateur** | Profils persistants (localStorage / Supabase) | 🔨 En cours | Haute |
| **Mode collaboratif** | Partage de session (screen share, co‑édition) | 📝 Planifié | Haute |
| **Workflows visuels** | Interface low‑code pour créer des workflows | ✅ Terminé | Moyenne |
| **Auto‑tests avancés** | Génération automatique de tests E2E (Puppeteer) | 🔨 En cours | Haute |
| **Plugins** | Architecture d'extensions (API de skills) | 📝 Planifié | Moyenne |
| **Performance** | Optimisation du chargement des skills, réduction de la latence | 🔨 En cours | Haute |
| **Documentation** | Amélioration du prompt de résumé (voir `docs/plans/plan_amelioration_prompt.md`) | ✅ Terminé | Moyenne |

### 📋 Détails techniques

- **Multi‑utilisateur** : Le profil utilisateur (`userName`, `userRole`, `responseStyle`, etc.) sera persisté dans `localStorage` et synchronisé avec Supabase. L'IA pourra adapter son comportement en fonction du profil actif.
- **Mode collaboratif** : Le partage d'écran et la co‑édition seront possibles via WebRTC / WebSocket. Les modifications seront broadcastées en temps réel aux participants.
- **Workflows visuels** : Un éditeur graphique permettra de créer, visualiser et modifier des workflows (`workflow_create`, `workflow_run`, `workflow_list`) sans écrire de code.
- **Plugins** : L'API de skills sera étendue pour permettre le chargement dynamique de compétences tierces (via npm ou fichier local).
- **Auto‑tests E2E** : L'IA pourra générer des tests E2E automatisés (Puppeteer) pour valider les flux critiques.

### 🧪 Métriques de succès

- [ ] L'utilisateur peut créer et basculer entre plusieurs profils.
- [ ] Le partage d'écran et la co‑édition fonctionnent en temps réel.
- [ ] L'éditeur de workflows visuel permet de créer un workflow sans écrire de code.
- [ ] L'IA génère des tests E2E pour les flux critiques.
- [ ] L'architecture de plugins est documentée et fonctionnelle.

---

## 📋 V1.0 — Moyen terme (3‑6 mois)

**Objectif :** Stabiliser, documenter et optimiser Jarvis-OS pour une utilisation en production, avec une gouvernance claire et une intégration continue.

### 🎯 Thématiques

| Domaine | Livrable | État | Priorité |
|---|---|---|---|
| **CI/CD intégré** | Builds automatiques, tests sur PR, déploiement continu | 📝 Planifié | Haute |
| **Monitoring** | Tableau de bord d'état (logs, métriques, santé du système) | 📝 Planifié | Haute |
| **Documentation interactive** | Génération automatique de documentation (JSDoc + Markdown) | 📝 Planifié | Haute |
| **Sécurité avancée** | Analyse SAST, vulnérabilités de dépendances, politique de sécurité | 📝 Planifié | Haute |
| **Mode hors‑ligne** | Fonctionnement sans connexion internet (utilisation de modèles locaux) | 📝 Planifié | Moyenne |
| **Performance** | Optimisation de la consommation mémoire, réduction du temps de démarrage | 📝 Planifié | Moyenne |
| **Internationalisation** | Support de plusieurs langues (anglais, français, espagnol, etc.) | 📝 Planifié | Basse |

### 📋 Détails techniques

- **CI/CD** : Intégration de GitHub Actions (ou équivalent) pour exécuter les tests, le lint et la build à chaque push. Déploiement automatique vers un environnement de staging/production.
- **Monitoring** : Agrégation des logs (`audit.ts`), métriques de performance (temps de réponse, taux d'erreur) et santé du système (mémoire, CPU, connexions). Tableau de bord accessible depuis l'interface.
- **Documentation interactive** : Extraction automatique des JSDoc, commentaires et fichiers Markdown pour générer une documentation centralisée, consultable depuis l'IDE.
- **Sécurité avancée** : Analyse statique du code (SAST) pour détecter les vulnérabilités (injection, path traversal, etc.). Vérification régulière des dépendances (npm audit).
- **Mode hors‑ligne** : Utilisation de modèles LLM locaux (Ollama, llama.cpp) ou de modèles plus légers pour les tâches simples, avec synchronisation différée.

### 🧪 Métriques de succès

- [ ] Les builds et les tests s'exécutent automatiquement sur chaque PR.
- [ ] Un tableau de bord de monitoring est accessible depuis l'interface.
- [ ] La documentation est générée automatiquement et consultable.
- [ ] Aucune vulnérabilité critique n'est détectée dans les dépendances.
- [ ] L'application est utilisable hors‑ligne (modèles locaux).

---

## 💡 V2+ — Vision long terme

**Objectif :** Faire de Jarvis-OS un écosystème vivant, où l'IA évolue de manière autonome et collaborative, et où l'utilisateur interagit avec un partenaire de confiance.

### 🎯 Thématiques

| Domaine | Vision | État |
|---|---|---|
| **Agents spécialisés** | Plusieurs IA (code, vie, design) collaborant entre elles | 💡 Idée |
| **Auto‑hébergement décentralisé** | Partage de connaissances entre instances (P2P) | 💡 Idée |
| **Création de plugins par l'IA** | L'IA écrit ses propres extensions et outils | 💡 Idée |
| **Évolution autonome** | L'IA propose et applique des refactorisations majeures sans intervention humaine (avec garde‑fous) | 💡 Idée |
| **Interface conversationnelle avancée** | L'IA comprend le langage naturel et les intentions de manière contextuelle | 💡 Idée |
| **Analyse prédictive** | Anticipation des besoins de l'utilisateur (proactivité) | 💡 Idée |

### 📋 Vision détaillée

- **Agents spécialisés** : Chaque agent (test, docs, refactor, etc.) deviendra une IA indépendante, capable de communiquer avec les autres agents et de déléguer des tâches de manière autonome.
- **Auto‑hébergement décentralisé** : Les connaissances (ProjectMemory, faits, décisions) seront partagées entre plusieurs instances de Jarvis-OS, permettant une amélioration collective.
- **Création de plugins par l'IA** : L'IA pourra écrire du code pour étendre ses propres capacités (nouveaux skills, nouvelles intégrations) sans intervention humaine.
- **Évolution autonome** : L'IA analysera en continu le code, détectera les opportunités d'amélioration et proposera des refactorisations majeures (ex: migration d'une architecture, réécriture d'un module). L'utilisateur gardera un droit de veto.
- **Proactivité** : L'IA apprendra les habitudes de l'utilisateur (horaires de travail, préférences de codage, sujets d'intérêt) pour anticiper ses besoins et agir en conséquence.

### 🧪 Métriques de succès

- [ ] Les agents spécialisés communiquent entre eux de manière autonome.
- [ ] Les connaissances sont partagées entre instances.
- [ ] L'IA écrit des plugins et des skills sans intervention humaine.
- [ ] L'IA propose des refactorisations majeures et les applique avec validation.

---

## 📅 Calendrier indicatif

| Phase | Période | Jalons clés |
|---|---|---|
| **V0.2** | Terminée | Livraison de l'IDE universel multi-projets |
| **V0.3** | T0 → T0 + 2 mois | Multi‑utilisateur, workflows visuels, plugins |
| **V1.0** | T0 + 3 mois → T0 + 6 mois | CI/CD, monitoring, documentation interactive |
| **V2+** | T0 + 6 mois → … | Agents spécialisés, auto‑hébergement décentralisé, évolution autonome |

---

## 🎯 Priorités et critères de succès

### Critères de succès — V0.3

- [ ] L'utilisateur peut créer et basculer entre plusieurs profils.
- [ ] Le partage d'écran et la co‑édition fonctionnent en temps réel.
- [ ] L'éditeur de workflows visuel permet de créer un workflow sans écrire de code.
- [ ] L'IA génère des tests E2E pour les flux critiques.
- [ ] L'architecture de plugins est documentée et fonctionnelle.

### Critères de succès — V1.0

- [ ] Les builds et les tests s'exécutent automatiquement sur chaque PR.
- [ ] Un tableau de bord de monitoring est accessible depuis l'interface.
- [ ] La documentation est générée automatiquement et consultable.
- [ ] Aucune vulnérabilité critique n'est détectée dans les dépendances.
- [ ] L'application est utilisable hors‑ligne (modèles locaux).

### Critères de succès — V2+

- [ ] Les agents spécialisés communiquent entre eux de manière autonome.
- [ ] Les connaissances sont partagées entre instances.
- [ ] L'IA écrit des plugins et des skills sans intervention humaine.
- [ ] L'IA propose des refactorisations majeures et les applique avec validation.

---

## 📝 Conclusion

La roadmap de Jarvis-OS est ambitieuse mais réaliste. Elle repose sur une vision claire : **un IDE universel, piloté par l'IA, capable de travailler sur n'importe quel projet, sécurisé et évolutif**.

Les livraisons successives (V0.2, V0.3, V1.0, V2+) permettront d'ajouter des fonctionnalités de manière incrémentale, tout en maintenant une haute qualité logicielle et une sécurité irréprochable.

**Contribuez à la roadmap** en proposant des fonctionnalités, en signalant des bugs ou en participant au développement. Ensemble, faisons de Jarvis-OS l'assistant de développement ultime.

---

*Dernière mise à jour : Juillet 2026*