# Roadmap Jarvis OS

## Sommaire

- [Etapes de developpement](#-etapes-de-developpement)
- [MVP (v0.5.0) - Actuel](#-mvp-v050---actuel)
- [V1.0 - Prochaine version majeure](#-v10---prochaine-version-majeure)
- [Futur - Vision long terme](#-futur---vision-long-terme)
- [TODOs identifies dans le code](#-todos-identifies-dans-le-code)
- [Limitations connues](#-limitations-connues)

---

## Etapes de developpement

```
Phase 1: Fondations (v0.1-v0.2) ✅ Terminee
├── IDE basique avec Monaco Editor
├── Systeme de fichiers
├── Integration Gemini API
└── Chat IA de base

Phase 2: Auto-referentiel (v0.3-v0.4) ✅ Terminee
├── Acces direct au code source
├── Sandbox isole
├── Checkpoints Git
├── Modification autonome
└── Systeme multi-agents (14 agents)

Phase 3: Notebooks RAG (v0.4-v0.5) ✅ Terminee
├── Notebooks RAG (style NotebookLM)
├── Ingestion de sources multiples
├── Recherche hybride (embeddings + TF-IDF)
├── Chat avec citations
└── Generation de contenu

Phase 4: Maturation (v0.5-v1.0) 🚧 En cours
├── Architecture modulaire
├── Documentation complete
├── Tests unitaires
└── Stabilisation

Phase 5: Production (v1.0+) 📋 Planifiee
├── Version stable
├── Documentation utilisateur
├── CI/CD
└── Support multi-plateforme
```

---

## MVP (v0.5.0) - Actuel

### Fonctionnalites implementees

#### Core
- [x] IDE auto-referentiel avec Monaco Editor
- [x] Systeme multi-agents (14 roles specialises)
- [x] Sandbox isole pour les modifications
- [x] Checkpoints Git automatiques
- [x] Validation TypeScript avant merge
- [x] Systeme de skills IA (22+ skills)
- [x] Delegation de taches aux agents

#### Notebooks
- [x] Ingestion de sources (PDF, DOCX, MD, HTML, images, CSV, JSON)
- [x] Recherche hybride (embeddings + TF-IDF + RRF)
- [x] Chat avec citations precis
- [x] Generation de contenu (resumes, FAQ, guides, etc.)
- [x] Audio Overview (podcast IA)
- [x] Notes avec vue Canvas 2D
- [x] Backlinks entre notes
- [x] Backup automatique incrementale

#### IA & Multimodal
- [x] Chat texte avec historique
- [x] Voix en temps reel (dictée, commandes)
- [x] Vision webcam (analyse visuelle)
- [x] Partage d'ecran
- [x] TTS (synthese vocale)
- [x] Streaming des reponses

#### Automatisation
- [x] Taches planifiees (cron-like)
- [x] Missions autonomes
- [x] Navigation web automatisee (Puppeteer)
- [x] Workflows documentaires

#### Integration
- [x] Supabase (PostgreSQL) pour la persistance
- [x] Git pour le versionnage
- [x] OpenRouter pour les modeles alternatifs
- [x] MCP (Model Context Protocol)
- [x] GitHub integration

---

## V1.0 - Prochaine version majeure

### Objectifs principaux

#### 1. Stabilisation et Performance
- [ ] Amelioration des performances de l'indexation
- [ ] Optimisation de la consommation memoire
- [ ] Reduction de la latence WebSocket
- [ ] Gestion des erreurs plus robuste
- [ ] Retry intelligent pour les appels API
- [ ] Circuit breaker plus sophistique

#### 2. Architecture
- [ ] Finalisation de la refactorisation des routeurs
- [ ] Extraction complete de la logique metier des routes
- [ ] Separation claire Frontend/Backend
- [x] Runtime V2 (debut d'implementation)
- [ ] Migration complete vers Runtime V2
- [ ] Systeme de plugins pour les skills

#### 3. Securite
- [ ] Audit de securite complet
- [ ] Protection contre les prompt injections
- [ ] Validation plus stricte des entrees
- [ ] Amelioration du systeme de sandbox
- [ ] Isolation plus forte des agents
- [ ] Journalisation plus detaillee (audit trail)

#### 4. Tests
- [ ] Coverage de test >= 80%
- [ ] Tests d'integration pour les workflows
- [ ] Tests E2E pour les fonctionnalites principales
- [ ] Tests de performance
- [ ] Tests de securite

#### 5. Documentation
- [ ] Documentation technique complete (ce document)
- [ ] Documentation utilisateur
- [ ] Guide de contribution
- [ ] API Reference complete
- [ ] Tutorials et exemples

#### 6. Configuration et Deployement
- [ ] Configuration simplifiee
- [ ] Support Docker
- [ ] Scripts de deployement
- [ ] Configuration CI/CD
- [ ] Support multi-environnements

---

## Futur - Vision long terme

### V2.0 - Systeme Multi-Utilisateurs
- Systeme de comptes utilisateurs
- Gestion des permissions (RBAC)
- Partage de projets entre utilisateurs
- Collaboration en temps reel
- Historique des modifications par utilisateur

### V2.5 - Cloud & Collaboration
- Version SaaS (Jarvis OS Cloud)
- Synchronisation multi-appareils
- Espace de travail partagé
- Integration avec les outils DevOps
- Marketplace de skills et agents

### V3.0 - IA Autonome Complete
- Agent IA capable de developper des features completes
- Generation automatique de tests
- Review de code autonome
- Deployment automatique
- Monitoring et auto-reparation

### Fonctionnalites futurues
- Support de plusieurs langages (Python, Go, Java, etc.)
- Integration avec VS Code en tant qu'extension
- Plugin system pour etendre les fonctionnalites
- Support offline avec synchronisation differée
- Interface CLI
- Integration avec les outils CI/CD (GitHub Actions, GitLab CI)
- Support des bases de donnees externes
- Generation de documentation automatique
- Traduction automatique des projets
- Analyse de securite approfondie
- Detection automatique des bugs
- Suggestions d'optimisation
- Refactorisation automatique

---

## TODOs identifies dans le code

### Server/Skills

Les fichiers suivants contiennent des commentaires TODO :

- `server/skills/SkillManager.ts` :
  - TODO: Implement auto-discovery of custom skills
  - TODO: Add skill versioning
  - TODO: Implement skill dependencies

- `server/skills/codebase.ts` :
  - TODO: Add support for more file types (Python, Go, etc.)
  - TODO: Implement advanced search with AST parsing

- `server/skills/verify.ts` :
  - TODO: Add more security rules
  - TODO: Implement custom lint rules

### Server/Agents

- `server/agents/AgentOrchestrator.ts` :
  - TODO: Implement priority queue for tasks
  - TODO: Add resource limits per agent
  - TODO: Implement agent health checks

- `server/agents/AgentPersistence.ts` :
  - TODO: Add pagination for task history
  - TODO: Implement task cleanup (TTL)

### Server/Knowledge

- `server/knowledge/KnowledgeGraph.ts` :
  - TODO: Implement incremental updates
  - TODO: Add cache for frequent queries

- `server/knowledge/ProjectIndexer.ts` :
  - TODO: Add watcher for external changes
  - TODO: Implement partial re-indexing

### Server/Notebooks

- `server/notebooks/RAGEngine.ts` :
  - TODO: Implement hybrid search with weights
  - TODO: Add query expansion

- `server/notebooks/BackupService.ts` :
  - TODO: Implement cloud backup (S3, etc.)
  - TODO: Add compression for backups

---

## Limitations connues

### Performances

1. **Indexation du projet** : Peut etre lente pour les gros projets (>10k fichiers)
   - Solution prevue : Indexation incrementale, cache

2. **Embeddings** : Consommation memoire elevee pour les notebooks avec beaucoup de sources
   - Solution prevue : Stockage externe, pagination

3. **WebSocket** : Latence possible avec beaucoup de clients connectes
   - Solution prevue : Optimisation, batching

### Fonctionnalites

1. **Git integration** : Actuellement desactivee (retourne 404)
   - Cause : Refactorisation en cours
   - Solution prevue : Re-implementation dans v1.0

2. **Custom Skills** : Implementation partielle
   - Limitation : Pas de systeme de validation complet
   - Solution prevue : Amelioration dans v1.0

3. **MCP** : Support experimental
   - Limitation : Connexion basique, pas de gestion avancée
   - Solution prevue : Support complet dans v1.5

### Securite

1. **Sandbox** : Protection de base, mais peut etre contournee
   - Solution prevue : Isolation plus forte (containers, VM)

2. **Prompt Injection** : Protection basique
   - Solution prevue : Systeme de detection plus sophistique

3. **Rate Limiting** : Configuration de base
   - Solution prevue : Adaptatif base sur l utilisation

### Compatibilite

1. **Multiplateforme** : Principalement testé sur Windows
   - Solution prevue : Tests sur Linux et MacOS

2. **Electron** : Configuration specifique Electron
   - Solution prevue : Abstraction de la couche Electron

---

## Priorites de developpement

### Courte terme (v0.5.1-v0.5.5)
1. Correction des bugs critiques
2. Amelioration de la stabilite
3. Documentation technique
4. Tests unitaires
5. Optimisation des performances

### Moyenne terme (v0.6-v0.9)
1. Migration vers Runtime V2
2. Systeme de plugins
3. Support multi-langages
4. Amelioration de la securite
5. Support Docker

### Long terme (v1.0+)
1. Version stable
2. Documentation complete
3. CI/CD
4. Support multi-utilisateurs
5. Version SaaS

---

## Comment contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les directives de contribution.

Les priorites sont :
1. Correction des bugs marques comme **critical** ou **high**
2. Implementation des TODOs dans le code
3. Ajout de tests pour les fonctionnalites existantes
4. Amelioration de la documentation
5. Nouvelles fonctionnalites (apres validation)

---

## Historique des versions

| Version | Date | Changements principaux |
|---------|------|----------------------|
| v0.5.0 | 2025-08 | IDE auto-referentiel, Notebooks RAG, Multi-agents |
| v0.4.0 | 2025-07 | Systeme multi-agents, Knowledge Engine |
| v0.3.0 | 2025-06 | Sandbox, Checkpoints, Skills IA |
| v0.2.0 | 2025-05 | Chat IA, Integration Gemini |
| v0.1.0 | 2025-04 | IDE basique, Monaco Editor |
