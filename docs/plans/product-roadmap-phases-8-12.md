# Feuille de Route Produit — Phases 8 à 12 (Post-Assainissement)

## Introduction

À la suite de la réalisation des Sprints 0 à 3 du plan d'assainissement technique (nettoyage configuration, découpage de `server.ts` en 8 routeurs modulaires, audit et ADR d'unification de l'orchestration, chiffrement AES-256-GCM et 219 tests automatisés au vert), le socle de Jarvis-OS est prêt pour la reprise ordonnée de la feuille de route fonctionnelle.

Ce document détaille la planification opérationnelle des phases 8 à 12 par ordre de priorité valeur/effort.

---

## 1. Phase 8 — Import/Export Avancé (v0.7.0)

> **Priorité** : 1 (Valeur utilisateur immédiate, périmètre technique borné)

### Objectifs
- Permettre l'exportation des notebooks et documents générés en formats professionnels (PDF paginé, DOCX, HTML autonome).
- Améliorer l'ingestion de PDF et DOCX complexes (conservation de la structure, des tableaux et des métadonnées).

### Tâches Techniques & Livrables
1. **Module d'Export PDF** (`server/export/pdfExporter.ts`) :
   - Génération PDF via moteur Chromium headless (Puppeteer existant) ou moteur de rendu léger avec CSS print (`@page`, en-têtes, pieds de page, numérotation).
   - Test unitaire : `server/export/pdfExporter.test.ts`.
2. **Module d'Export DOCX** (`server/export/docxExporter.ts`) :
   - Conversion Markdown / AST vers format OpenXML (`docx`).
   - Test unitaire : `server/export/docxExporter.test.ts`.
3. **Routeur Export** (`server/routes/export.ts`) :
   - `POST /api/export/pdf`
   - `POST /api/export/docx`
   - `POST /api/export/html`

### Critères d'Acceptation
- [ ] L'utilisateur peut exporter un document ou une note en PDF avec une mise en page soignée (titres, tableaux, blocs de code syntaxés).
- [ ] L'export DOCX s'ouvre sans erreur dans Microsoft Word et Google Docs.
- [ ] Tests automatisés validant la génération des buffers binaires.

---

## 2. Phase 9 — Intelligence Documentaire (v0.8.0)

> **Priorité** : 2 (Réutilise le module `server/knowledge/` déjà mature)

### Objectifs
- Évaluer automatiquement la complétude, la clarté et la fraîcheur documentaire du workspace.
- Proposer des actions proactives de documentation là où des lacunes sont détectées dans le graphe de connaissances.

### Tâches Techniques & Livrables
1. **Moteur d'Analyse Documentaire** (`server/knowledge/DocumentHealthAnalyzer.ts`) :
   - Calcul du score de complétude (analyse des sections requises par type de document).
   - Calcul de l'indice de lisibilité (Flesch-Kincaid / Gunning-Fog adapté au français et à l'anglais technique).
   - Analyse de couverture croisée (comparaison entre les entités du code et les entités documentées dans le graphe).
2. **Routeur d'Intelligence Documentaire** :
   - `GET /api/knowledge/health/documents`
   - `POST /api/knowledge/suggestions/generate`

### Critères d'Acceptation
- [ ] Le dashboard de santé affiche un score global de santé documentaire du workspace.
- [ ] Les fichiers de code sans documentation associée sont mis en évidence dans l'UI.

---

## 3. Phase 11 (Partielle) — API Publique REST & Intégrations (v1.0.0)

> **Priorité** : 3 (Prérequis technique pour Notion, Google Drive, Slack)

### Objectifs
- Exposer une API REST documentée et versionnée `/api/v1/*` avec authentification par clé d'API révocable.
- Connecteurs externes sécurisés (Google Drive, Notion, Slack).

### Tâches Techniques & Livrables
1. **Spécification OpenAPI / Swagger** (`docs/api/openapi.json`).
2. **Système de Clés d'API Publiques** (`server/security/apiKeyManager.ts`).
3. **Connecteurs Cloud** (`server/integrations/googleDrive.ts`, `server/integrations/notion.ts`).

### Critères d'Acceptation
- [ ] Documentation interactive Swagger accessible en dev.
- [ ] Les clés d'API tierces peuvent être générées et révoquées depuis les Paramètres.

---

## 4. Phase 10 — Multimodal Avancé (v0.9.0)

> **Priorité** : 4 (Effort important, dépendance aux flux vidéo/OCR)

### Objectifs
- Dictée vocale de documents longs avec structuration automatique par IA.
- OCR de documents via capture webcam haute résolution.
- Résumé automatique de vidéos et enregistrements de réunions.

---

## 5. Phase 12 — Autonomie Complète & Auto-Amélioration (v2.0.0)

> **Priorité** : 5 (Nécessite le socle consolidé et l'ADR-001)

### Objectifs
- Maintenance proactive et mise à jour automatique des documentations lors de modifications de code.
- Auto-amélioration supervisée du code de Jarvis-OS via la boucle de sandbox sécurisée.
- Mémoire d'apprentissage continu des préférences de l'utilisateur.

---

## Tableau Récapitulatif d'Avancement

| Phase | Statut | Version Cible | Effort Estimé |
|---|---|---|---|
| Phase 1 — Fondations | ✅ Terminé | v0.4.0 | - |
| Phase 2 — Assistant Multimodal | ✅ Terminé | v0.4.5 | - |
| Phase 3 — Notebooks RAG | ✅ Terminé | v0.5.0 | - |
| Phase 4 — Multi-Agents Documentaires | ✅ Terminé | v0.5.5 | - |
| Phase 5 — Moteur de Connaissances | ✅ Terminé | v0.5.5 | - |
| Phase 6 — Automatisation & MCP | ✅ Terminé | v0.5.5 | - |
| Phase 7 — Templates & UX | ✅ Terminé | v0.6.0 | - |
| **Phase 8 — Import/Export Avancé** | 🚧 Prêt pour démarrage | v0.7.0 | Moyen (1-2 sem.) |
| **Phase 9 — Intelligence Documentaire** | 🔲 Planifié | v0.8.0 | Faible (1 sem.) |
| **Phase 10 — Multimodal Avancé** | 🔲 Planifié | v0.9.0 | Élevé (2-3 sem.) |
| **Phase 11 — Écosystème & API** | 🔲 Planifié | v1.0.0 | Moyen (2 sem.) |
| **Phase 12 — Autonomie Complète** | 🔲 Planifié | v2.0.0 | Élevé (3+ sem.) |
