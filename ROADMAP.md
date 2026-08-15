# 🗺️ Plan de développement (Roadmap) — Jarvis-OS

Cette roadmap trace les étapes clés du développement de Jarvis-OS, depuis les fondations existantes jusqu'à la vision à long terme.

---

## 🧭 Tableau Synthétique des Jalons

| Jalon | Statut | Cible | Focus principal |
| :--- | :--- | :--- | :--- |
| **V0** | ✅ Fait | Déjà livré | Fondations de l'IDE, Sandbox, Gemini Live, Knowledge Graph local et MCP. |
| **V1** | 🚧 En cours | < 3 mois | Stabilisation multi-utilisateurs, tests avancés, optimisations performances et plugins. |
| **V2+** | 📋 Planifié | > 6 mois | Mode hors-ligne, multi-agents distribués, auto-évolution supervisée par l'utilisateur. |
| **Backlog** | 💡 Idée | Indéfini | Idées d'améliorations et de nouvelles fonctionnalités à qualifier. |

---

## ✅ V0 — Fonctionnalités Livrées (Version Actuelle)

Les fondations et les briques technologiques de base sont entièrement implémentées et fonctionnelles.

- **Interface IDE intégrée** : Explorateur de fichiers virtuel, éditeur Monaco (diff interactif, coloration), terminal PTY (`node-pty`) et panneau Git.
- **Gestion dynamique de projets** : Mécanisme `SELF_ROOT` pour charger, basculer ou scaffolder (React, Next.js, etc.) des projets locaux à chaud.
- **Sécurité & Sandbox** : Répertoire sandbox sécurisé (`.jarvis/sandbox/`), vérification de build (`tsc`), et système de rollback via checkpoints Git locaux.
- **Assistant vocal & Multimodal** : Session audio et vision temps réel WebSocket (`/live`) avec function calling Gemini Live.
- **Knowledge System (Graphe de Connaissance)** : Indexation syntaxique globale, modélisation des graphes de dépendances, mémoire sémantique projet locale.
- **Support MCP (Model Context Protocol)** : Intégration de serveurs d'outils externes (stdio/SSE) exposés comme des compétences de l'IA.
- **Persistance DB** : Intégration de Supabase pour les mémoires utilisateur (RAG), conversations, listes de tâches et configurations.

---

## 🚧 V1 — Améliorations Court Terme (< 3 mois)

L'accent est mis sur les besoins immédiats des développeurs, l'extension des fonctionnalités et l'optimisation des performances.

### 💻 Fonctionnalités Ultra-Développeur
- [ ] **Persistance des profils utilisateurs** : Sauvegarde des configurations et styles de réponse de l'IA via localStorage et Supabase. (🚧 En cours)
- [ ] **Co-édition et partage de session** : Permettre la co-édition et le partage d'écran en temps réel via WebRTC. (📋 Planifié)
- [ ] **Génération de tests automatisée** : Agent de test autonome capable d'écrire et de lancer des scénarios de test E2E (Puppeteer). (🚧 En cours)
- [ ] **Architecture d'extensions (Plugins)** : Définition d'une API permettant de charger dynamiquement des compétences tierces locales ou npm. (📋 Planifié)
- [ ] **Optimisation de la latence du Live** : Amélioration du pipeline WebSocket et de la mise en cache des descriptions d'outils. (🚧 En cours)
- [ ] **Interface visuelle low-code** : Éditeur graphique de workflows et pipelines de skills. (✅ Terminé)

---

## 📋 V2+ — Vision Long Terme (> 6 mois)

Des innovations majeures pour transformer Jarvis-OS en un véritable assistant auto-apprenant.

- **Mode Hors-ligne complet (Offline Models)** : Support de modèles de langage hébergés localement (via Ollama ou Llama.cpp) pour les tâches courantes. (📋 Planifié)
- **Auto-évolution logicielle** : Moteur d'auto-refactorisation supervisé capable de réécrire des modules entiers et de s'auto-corriger. (💡 Idée)
- **Multi-agents distribués (P2P)** : Collaboration et échange de connaissances décentralisés entre plusieurs instances distantes de Jarvis-OS. (💡 Idée)
- **CI/CD natif de proximité** : Lancement de pipelines de compilation et de conteneurisation isolés pour tester les builds en conditions réelles. (📋 Planifié)

---

## 💡 Backlog (Idées non planifiées)

Propositions d'améliorations ouvertes aux contributions.

- **Interface vocale hors-ligne** : Reconnaissance et synthèse vocale locales (Whisper/Coqui TTS) pour s'affranchir des API cloud.
- **Intégration d'outils de design** : Analyse de maquettes (Figma) par vision par ordinateur pour générer directement des squelettes de composants React/Tailwind.
- **Tableau de bord de monitoring système** : Visualisation graphique de l'utilisation CPU/RAM du sandbox et des métriques d'exécution de l'IA.
- **Internationalisation (i18n)** : Traduction complète de l'interface IDE et des invites système dans d'autres langues.