# 🗺️ Roadmap — Jarvis-OS

> Feuille de route pour transformer Jarvis-OS en plateforme IA complète : IDE intelligent, notebooks RAG, agents autonomes et gestion documentaire.

---

## 📌 Vision

Faire de Jarvis-OS un **OS IA desktop tout-en-un** : un outil qui comprend, génère, organise et améliore tous les documents et le code d'un projet — avec un minimum d'effort humain.

---

## Phase 1 — Fondations (v0.4.0) ✅

> Objectif : Architecture de base et IDE fonctionnel.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| IDE Monaco Editor | ✅ | Éditeur complet avec syntaxe, multi-onglets, recherche |
| Explorateur de fichiers | ✅ | Arbre interactif avec CRUD |
| Terminal intégré | ✅ | Exécution de commandes depuis l'UI |
| Intégration Git | ✅ | Branches, commits, diff visuel |
| Sandbox IA | ✅ | Environnement isolé pour modifications sûres |
| Authentification token | ✅ | Sécurisation des endpoints API |
| Chiffrement des secrets | ✅ | AES sur les clés stockées (.env, .gemini-keys) |

---

## Phase 2 — Assistant Multimodal (v0.4.5) ✅

> Objectif : Communication riche avec l'IA via Gemini Live.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Chat textuel streaming (SSE) | ✅ | Réponses en temps réel avec historique |
| Voix en temps réel | ✅ | Dictée et réponses audio via Gemini Live |
| Vision webcam | ✅ | Analyse de documents physiques et schémas |
| Partage d'écran | ✅ | Capture et interprétation du contenu affiché |
| Orb flottant | ✅ | Interface minimale accessible partout |
| Pool de clés Gemini | ✅ | Rotation round-robin + retry sur 429 |

---

## Phase 3 — Notebooks RAG (v0.5.0) ✅

> Objectif : Système de notebooks concurrent de NotebookLM.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Ingestion de sources (PDF, TXT, MD, HTML, DOCX) | ✅ | Upload multi-fichiers + drag & drop |
| Ingestion d'URLs (Puppeteer) | ✅ | Extraction web automatique |
| **Support images (PNG, JPG, WebP)** | ✅ | Upload + analyse Vision IA (OCR + description) |
| **Rendu HTML visuel** | ✅ | Iframe sandboxée avec toggle Visuel/Texte |
| Chunking sémantique intelligent | ✅ | Adapté par type (Markdown, PDF, texte) |
| Embeddings Gemini | ✅ | Vectorisation `gemini-embedding-001` |
| Recherche hybride (embeddings + TF-IDF + RRF) | ✅ | 5 stratégies de parsing |
| Re-ranking LLM | ✅ | Score de pertinence via Gemini |
| Chat groundé avec citations | ✅ | Q&A avec références précises aux sources |
| Conversations multiples (threads) | ✅ | Switch instantané, titrage auto |
| Deep Dive mode | ✅ | Exploration approfondie multi-étapes |
| Comparaison de sources | ✅ | Similitudes, différences, contradictions |
| Extraction d'insights | ✅ | Tendances, connexions, alertes |
| Mode Focus Sources | ✅ | Sélection de sources par question |
| 6 personnalités IA | ✅ | Standard, Académique, Vulgarisateur, Concis, Détaillé, Créatif |
| Commandes slash | ✅ | `/résume`, `/compare`, `/quiz`, `/insights`, `/glossaire`, `/plan` |
| Génération de contenu (9 types) | ✅ | Résumé, FAQ, Guide, Briefing, Timeline, Plan, Mind Map, SWOT, Glossaire |
| Infographies IA | ✅ | Génération d'images via OpenRouter |
| Audio Overview (podcast IA) | ✅ | Script 2 hôtes, karaoké, vitesse variable |
| Notes avancées | ✅ | Templates, Canvas 2D, backlinks, épinglage |
| **Suppression de sources (UI compact)** | ✅ | Icône poubelle au hover dans la sidebar |
| **Résumé global automatique** | ✅ | Synthèse LLM de toutes les sources combinées |
| Backup automatique | ✅ | Incrémental 30min, rotation 10 max |
| Queue de processing | ✅ | Concurrence ×2, retry exponentiel, priorités |
| Cache intelligent | ✅ | LRU + TTL + Jaccard similarity matching |
| Voice input (Web Speech API) | ✅ | Dictée vocale français |
| TTS réponses | ✅ | Lecture audio avec play/stop |
| Token counter | ✅ | Estimation temps réel |
| Feedback thumbs up/down | ✅ | Évaluation qualité des réponses |

---

## Phase 4 — Multi-Agents Documentaires (v0.5.5) ✅

> Objectif : Équipe d'agents IA spécialisés avec orchestration.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| 7 agents spécialisés | ✅ | Rédacteur, Correcteur, Recherche, Traducteur, Mise en forme, Synthèse, Planificateur |
| Patterns de collaboration | ✅ | document-complet, traduction-vérifiée, recherche-rédaction |
| Boucle autonome | ✅ | Exécution multi-itérations avec validation |
| Délégation intelligente | ✅ | DelegationParser + matrice de compétences |
| Persistence d'agents | ✅ | État et historique sauvegardés |
| Agent Repair Loop | ✅ | Auto-correction sur erreurs |
| Message Bus inter-agents | ✅ | Communication async entre agents |

---

## Phase 5 — Moteur de Connaissances (v0.5.5) ✅

> Objectif : Comprendre le workspace en profondeur.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Indexation automatique du workspace | ✅ | Fichiers, code, dépendances |
| Graphe de relations | ✅ | Entités et connexions inter-fichiers |
| Recherche sémantique locale | ✅ | Sans API externe |
| Analyse d'impact | ✅ | Évaluation avant modification |
| Mémoire projet | ✅ | Conventions, préférences de style |
| Détection de contradictions | ✅ | Entre documents |

---

## Phase 6 — Automatisation & MCP (v0.5.5) ✅

> Objectif : Workflows et connexion d'outils externes.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Tâches planifiées (cron) | ✅ | Déclencheurs temporels |
| Workflows documentaires | ✅ | Pipelines séquentiels/parallèles |
| Missions autonomes | ✅ | Planification IA avec multi-étapes |
| Navigation web (Puppeteer) | ✅ | Automatisation browser |
| Passerelle MCP (stdio & SSE) | ✅ | Connexion à chaud de serveurs d'outils |
| Interface de gestion MCP | ✅ | UI intégrée |

---

## Phase 7 — Templates & UX (v0.6.0) 🚧

> Objectif : Bibliothèque de modèles et amélioration de l'expérience.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Template MVP | ✅ | Structure : vision, problème, solution, métriques |
| Template Rapport de Conception | 🔲 | Architecture, choix techniques, contraintes |
| Template Cahier des Charges | 🔲 | Exigences fonctionnelles/non-fonctionnelles |
| Template Spécification Technique | 🔲 | API, schémas, protocoles |
| Template Plan de Projet | 🔲 | Objectifs, jalons, livrables, risques |
| Système de variables dynamiques | 🔲 | Placeholders (nom projet, date, auteur) |
| UI de sélection de template | 🔲 | Panneau avec preview et personnalisation |
| Thèmes visuels multiples | 🔲 | Dark, Light, Custom |
| Responsive mobile | 🔲 | Adaptation tablette/mobile |

---

## Phase 8 — Import/Export Avancé (v0.7.0)

> Objectif : Interopérabilité totale avec les outils existants.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Export PDF professionnel | 🔲 | Mise en page soignée avec pagination |
| Export DOCX | 🔲 | Compatible Microsoft Word / Google Docs |
| Export HTML publiable | 🔲 | Version web standalone |
| Import PDF intelligent (extraction structurée) | 🔲 | Titres, paragraphes, tableaux |
| Import DOCX fidèle | 🔲 | Préservation mise en forme |
| Export Notion / Confluence | 🔲 | Intégration wikis d'équipe |

---

## Phase 9 — Intelligence Documentaire (v0.8.0)

> Objectif : Analyse avancée et insights sur la base documentaire.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Score de complétude | 🔲 | Évaluer si un document couvre tous les aspects |
| Score de clarté | 🔲 | Mesurer la lisibilité |
| Analyse de couverture | 🔲 | Identifier les sujets non documentés |
| Tableau de bord documentaire | 🔲 | Vue d'ensemble de la santé du projet |
| Suggestions proactives | 🔲 | L'IA propose de créer/mettre à jour des docs |
| Rapports automatiques périodiques | 🔲 | Synthèses d'avancement |

---

## Phase 10 — Multimodal Avancé (v0.9.0)

> Objectif : Exploiter pleinement les capacités multimodales.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Dictée de documents complets | 🔲 | Rédiger par la voix |
| OCR de documents physiques | 🔲 | Scanner via webcam |
| Analyse de schémas manuscrits | 🔲 | Interprétation et conversion |
| Brainstorming vocal → document | 🔲 | Transcription structurée |
| Vidéo → résumé documentaire | 🔲 | Extraction de contenu vidéo |

---

## Phase 11 — Écosystème & Intégrations (v1.0.0)

> Objectif : Connecter Jarvis-OS à l'écosystème professionnel.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Intégration Google Drive | 🔲 | Sync bidirectionnelle |
| Intégration Notion | 🔲 | Import/export et sync |
| Intégration Slack | 🔲 | Notifications et commandes |
| Intégration GitHub Issues → Specs | 🔲 | Générer des specs depuis les issues |
| API publique REST | 🔲 | Pour intégration externe |
| Marketplace MCP | 🔲 | Plugins communautaires |
| Multi-utilisateurs | 🔲 | Comptes et permissions |

---

## Phase 12 — Autonomie Complète (v2.0.0)

> Objectif : L'IA gère de manière autonome toute la documentation et le code.

| Tâche | Statut | Description |
| :--- | :---: | :--- |
| Auto-documentation | 🔲 | Génération auto de docs à partir de changements |
| Maintenance proactive | 🔲 | Mise à jour automatique des docs obsolètes |
| Apprentissage continu | 🔲 | Adaptation au style de l'équipe |
| Multi-projets | 🔲 | Gestion simultanée de plusieurs workspaces |
| Autonomie supervisée | 🔲 | L'IA propose, l'humain valide |
| Self-improvement | 🔲 | L'IA améliore son propre code source |

---

## 📊 Métriques de Succès

| Métrique | Cible |
| :--- | :--- |
| Temps de création d'un document MVP | < 5 minutes |
| Couverture documentaire projet | > 80% |
| Score de cohérence inter-documents | > 90% |
| Satisfaction utilisateur (rédaction assistée) | > 4.5/5 |
| Documents générés sans correction manuelle | > 60% |
| Temps d'ingestion d'une source (10 pages) | < 15 secondes |
| Pertinence des réponses RAG (top-3) | > 85% |
| Uptime système | > 99.5% |

---

## 🏷️ Légende

| Icône | Signification |
| :---: | :--- |
| ✅ | Terminé |
| 🚧 | En cours |
| 🔲 | Planifié |
| ❌ | Abandonné |

---

*Dernière mise à jour : Août 2025*
