# Analyse Complete du Module Notebooks - Suggestions d'Ameliorations

## Table des Matieres

1. [Overview du Systeme Actuel](#1-overview-du-système-actuel)
2. [Points Forts](#2-points-forts)
3. [Ameliorations Fonctionnelles](#3-améliorations-fonctionnelles)
4. [Ameliorations UI/UX](#4-améliorations-uiux)
5. [Ameliorations Techniques](#5-améliorations-techniques)
6. [Nouveautes a Implémenter](#6-nouveautés-à-implémenter)
7. [Priorisation](#7-priorisation)
8. [Implementation Recommendations](#8-recommandations-dimplémentation)

---

## 1. Overview du Systeme Actuel

### Architecture

```
├── Frontend (React + TypeScript + Motion)
│   └── src/components/notebooks/
│       ├── NotebookList.tsx          # Liste des notebooks avec creation/suppression
│       ├── NotebookDetail.tsx        # Vue détaillée 3 colonnes
│       ├── NotebookChat.tsx          # Chat IA avec citations
│       ├── SourcePanel.tsx           # Gestion des sources
│       ├── SourceViewer.tsx          # Visualisation source
│       ├── GeneratePanel.tsx         # Generation de contenu (20+ types)
│       ├── NotesPanel.tsx            # Notes utilisateur
│       ├── AudioOverviewPanel.tsx    # Audio overview (podcast IA)
│       ├── HistoryPanel.tsx          # Historique des chats
│       ├── NotesCanvas.tsx           # Canvas pour notes visuelles
│       ├── SlidePreviewModal.tsx     # Previsualisation slides
│       └── MermaidDiagram.tsx        # Diagrammes Mermaid

├── Backend (Node.js + Express + TypeScript)
│   └── server/notebooks/
│       ├── NotebookManager.ts       # CRUD Notebooks
│       ├── SourceIngester.ts        # Ingestion documents
│       ├── RAGEngine.ts             # Recherche semantique
│       ├── GroundedChat.ts          # Chat avec citations
│       ├── ContentGenerator.ts      # Generation de contenu
│       ├── EmbeddingStore.ts        # Stockage embeddings
│       ├── ProcessingQueue.ts       # File d'attente
│       ├── ResponseCache.ts         # Cache reponses
│       ├── BackupService.ts         # Sauvegardes
│       └── types.ts                 # Typage TypeScript

└── Routes API
    └── server/routes/notebooks/
        ├── notebooksCrudRouter.ts   # CRUD
        ├── chatRouter.ts            # Chat + threads
        ├── contentRouter.ts         # Generation contenu
        ├── sourcesRouter.ts         # Sources
        ├── audioRouter.ts           # Audio
        ├── backupRouter.ts          # Backup
        ├── cacheRouter.ts           # Cache
        └── queueRouter.ts           # Queue
```

### Fonctionnalites Existantes

| Categorier | Fonctionnalites |
|------------|----------------|
| **Notebooks** | Creation, suppression, tri, recherche, couleurs/iconnes personnalisees |
| **Sources** | Upload PDF/URL/DOCX, extraction texte, decoupage chunks, embeddings |
| **Chat** | Q&A grounde, citations automatiques, streaming, historique, threads |
| **Generation** | 20+ types de documents (FAQ, SWOT, roadmap, rapports, etc.) |
| **Audio** | Overview audio (podcast IA), transcription |
| **Notes** | Notes utilisateur, epinglage, references aux sources |
| **UI** | Design moderne, animations fluides, layout 3 colonnes, responsive |

---

## 2. Points Forts

### ✅ Bonnes Pratiques Implementees

1. **Architecture Modulaire** : Separation claire frontend/backend, services bien decoupes
2. **TypeScript Strict** : Typage fort, interfaces bien definies
3. **Accessibilite** : Support reduced-motion, ARIA labels, keyboard shortcuts
4. **Performance** : Streaming SSE, cache reponses, file d'attente
5. **UX Avancee** : Animations fluides, feedback visuel, empty states
6. **RAG Hybride** : Combinaison embeddings + TF-IDF pour meilleure recherche
7. **Internationalisation** : Support multilingue (francais principal)
8. **Persistence** : Sauvegarde automatique, gestion fichier JSON
9. **Sandboxing** : Isolation des operations fichiers
10. **Backup System** : Sauvegardes automatiques configureables

---

## 3. Ameliorations Fonctionnelles

### 🎯 Chat et RAG

#### 3.1.1. Amelioration de la Recherche

**Problemes Identifies** :
- Recherche limitee a 8 chunks par defaut
- Pas de support pour la recherche multi-criteres
- Pas de filtrage par date/type de source
- Pas de recherche full-text dans les notes utilisateur

**Solutions** :

```typescript
// Ajouter dans RAGEngine.ts
interface AdvancedSearchOptions {
  maxChunks?: number;           // Actuellement 8
  minRelevance?: number;        // Actuellement 0.1
  sourceIds?: string[];         // Filtrer par sources
  sourceTypes?: SourceType[];   // Filtrer par type (pdf, url, etc.)
  dateRange?: {                 // Filtrer par date
    start?: Date;
    end?: Date;
  };
  includeNotes?: boolean;       // Inclure les notes dans la recherche
  semanticSearch?: boolean;     // Activer/désactiver embeddings
  exactMatch?: string;          // Recherche exacte
  // Nouveautes
  metadataFilter?: {            // Filtrer par metadata
    page?: number;
    section?: string;
    language?: string;
  };
  boost?: {                     // Booster certains critères
    recency?: number;           // Privilégier les sources récentes
    relevance?: number;         // Privilégier la pertinence
    sourceType?: Record<SourceType, number>; // Booster par type
  };
}
```

**Implementation** :
- Modifier `searchHybrid()` pour supporter ces options
- Ajouter endpoint `/api/notebooks/:id/search/advanced`
- Creer composant `AdvancedSearchBar.tsx` dans le chat

#### 3.1.2. Citations Ameliorees

**Problemes** :
- Citations au format `[SOURCE N]` peu intuitif
- Pas de preview des citations avant de cliquer
- Pas de navigation directe vers la source citee

**Solutions** :

```typescript
// Nouveau format de citation
interface EnhancedCitation {
  id: string;
  sourceId: string;
  sourceTitle: string;
  chunkId: string;
  excerpt: string;
  relevance: number;
  // Nouveaux champs
  position: {                // Position dans la source
    page?: number;
    startChar: number;
    endChar: number;
  };
  confidence: number;          // Confiance de l'IA (0-1)
  quote: string;              // Citation exacte
  // Pour l'UI
  displayFormat: 'inline' | 'footer' | 'sidebar' | 'popup';
}
```

**UI Improvements** :
- Remplacer `[SOURCE 1]` par des citations cliquables avec tooltip
- Ajouter un panneau lateral des citations utilisees
- Highlight automatique des citations dans le texte
- Navigation directe vers la source/le chunk cite

#### 3.1.3. Chat Contextuel Avance

**Nouveautes** :

```typescript
// Dans GroundedChat.ts
class GroundedChat {
  // ... existant
  
  async askWithContext(
    notebookId: string,
    question: string,
    options: {
      context?: string;         // Contexte additionnel
      persona?: 'expert' | 'beginner' | 'technical' | 'business';
      style?: 'concise' | 'detailed' | 'bullet-points' | 'essay';
      temperature?: number;     // 0-1 pour creativite
      useHistory?: boolean;      // Utiliser l'historique
      maxHistory?: number;       // Nombre de messages a inclure
    }
  ): Promise<ChatMessage> {
    // Implementation
  }
  
  // Chat comparatif entre sources
  async compareSources(
    notebookId: string,
    sourceIds: string[],
    question: string,
    onProgress: (stage: string, content: string) => void
  ): Promise<ChatMessage> {
    // Compare les sources et repond
  }
  
  // Analyse de documents
  async analyzeDocument(
    notebookId: string,
    sourceId: string,
    analysisType: 'summary' | 'keywords' | 'sentiment' | 'entities' | 'structure'
  ): Promise<AnalysisResult> {
    // Analyse approfondie d'une source
  }
}
```

#### 3.1.4. Suivi des Conversations

**Problemes** :
- Les threads ne sont pas persistes correctement
- Pas de systeme de favoris pour les conversations
- Pas de tags/categories pour les threads

**Solutions** :

```typescript
// Etendre ChatThread dans types.ts
interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  // Nouveaux champs
  isPinned: boolean;           // Epingle
  isFavorite: boolean;          // Favoris
  tags: string[];              // Tags utilisateur
  category?: string;           // Categorisation auto
  color?: string;              // Couleur pour l'UI
  metadata: {
    sourceIds: string[];        // Sources utilisees
    wordCount: number;          // Statistiques
    citationCount: number;
  };
}
```

**Nouveaux Endpoints** :
```typescript
// POST /api/notebooks/:id/chat/threads/:threadId/pin
// POST /api/notebooks/:id/chat/threads/:threadId/favorite
// POST /api/notebooks/:id/chat/threads/:threadId/tags
// GET /api/notebooks/:id/chat/threads/favorites
// GET /api/notebooks/:id/chat/threads/pinned
```

### 📄 Gestion des Sources

#### 3.2.1. Amelioration de l'Ingestion

**Problemes** :
- Pas de preview avant upload
- Pas de support pour les images/OCR
- Pas de detection automatique de la langue
- Pas de validation de la qualite du document

**Solutions** :

```typescript
// Dans SourceIngester.ts
class SourceIngester {
  async ingestWithPreview(
    file: Buffer,
    filename: string,
    options: {
      extractPreview?: boolean;      // Extraire preview
      previewLength?: number;        // Longueur du preview
      detectLanguage?: boolean;     // Detecter langue
      runOCR?: boolean;             // OCR pour images/PDF
      validateQuality?: boolean;    // Valider qualite
    }
  ): Promise<{
    source: Source;
    preview?: string;
    qualityScore: number;
    warnings: string[];
  }> {
    // Implementation
  }
  
  // Support pour plus de types
  async ingestFromImage(image: Buffer, filename: string): Promise<Source> {
    // OCR avec Tesseract.js ou API
  }
  
  async ingestFromAudio(audio: Buffer, filename: string): Promise<Source> {
    // Transcription audio -> texte
  }
  
  async ingestFromVideo(video: Buffer, filename: string): Promise<Source> {
    // Transcription video -> texte
  }
}
```

**Nouveaux Types de Sources** :
```typescript
export type SourceType = 
  'pdf' | 'text' | 'markdown' | 'url' | 'audio' | 'youtube' | 
  'docx' | 'html' | 'image' | 'video' | 'pptx' | 'xlsx' | 'csv' | 
  'epub' | 'notion' | 'google-drive' | 'github' | 'arxiv' | 'wikipedia';
```

#### 3.2.2. Traitement des Sources

**Problemes** :
- Decoupage en chunks basique (taille fixe)
- Pas de detection de structure (titres, sections)
- Pas de detection de tableaux/images

**Solutions** :

```typescript
// Amelioration du chunking dans SourceIngester.ts
interface ChunkingStrategy {
  type: 'fixed' | 'semantic' | 'structural' | 'hybrid';
  size?: number;                    // Pour fixed
  semanticThreshold?: number;      // Pour semantic
  preserveStructure?: boolean;     // Conserver titres/sections
  includeMetadata?: boolean;       // Inclure metadata
}

interface SourceChunk {
  id: string;
  sourceId: string;
  content: string;
  index: number;
  metadata: {
    page?: number;
    section?: string;
    startChar: number;
    endChar: number;
    // Nouveaux champs
    headingLevel?: number;          // Niveau de titre (h1, h2, etc.)
    isList?: boolean;               // Est-ce une liste
    isTable?: boolean;              // Est-ce un tableau
    isCode?: boolean;               // Est-ce du code
    language?: string;              // Langue du chunk
    entities?: string[];            // Entites detectees
    keywords?: string[];            // Mots-cles
  };
  tfidfVector?: Map<string, number>;
  // Nouveaux champs
  embedding?: number[];             // Vecteur d'embedding
  qualityScore?: number;           // Score de qualite
}
```

**Strategie de Chunking Hybride** :
1. **Structural** : Decouper par titres/sections
2. **Semantic** : Decouper par paragraphes cohérents
3. **Adaptatif** : Adapter la taille en fonction du contenu

#### 3.2.3. Synchronisation des Sources

**Problemes** :
- Pas de synchronisation automatique avec les sources externes (URL)
- Pas de detection de changement
- Pas de versioning des sources

**Solutions** :

```typescript
// Dans SourceIngester.ts
interface SourceSyncOptions {
  autoSync?: boolean;              // Synchronisation automatique
  syncInterval?: number;          // Intervalle en heures
  checkForChanges?: boolean;      // Verifier les changements
  versioning?: boolean;           // Versioning des sources
  notifyOnChange?: boolean;       // Notification de changement
}

class SourceIngester {
  async syncSource(source: Source): Promise<{
    changed: boolean;
    newVersion?: string;
    diff?: SourceDiff;             // Differences detectees
  }> {
    // Implementation
  }
  
  async checkSourceChanges(source: Source): Promise<boolean> {
    // Verifier si la source a change
  }
}

interface SourceDiff {
  addedChunks: SourceChunk[];
  modifiedChunks: SourceChunk[];
  removedChunks: string[];
  metadataChanges: Record<string, any>;
}
```

### 📝 Generation de Contenu

#### 3.3.1. Amelioration du ContentGenerator

**Problemes** :
- Generation parfois incoherente
- Pas de validation de la qualite
- Pas de personnalisation avancée

**Solutions** :

```typescript
// Dans ContentGenerator.ts
interface GenerationOptions {
  type: GeneratedDocType;
  sourceIds?: string[];
  language?: string;
  customInstructions?: string;
  imageModel?: string;
  // Nouveaux champs
  tone?: 'professional' | 'casual' | 'academic' | 'technical' | 'creative';
  length?: 'short' | 'medium' | 'long' | 'comprehensive';
  depth?: 'surface' | 'detailed' | 'expert';
  format?: 'markdown' | 'html' | 'pdf' | 'docx' | 'pptx';
  includeCitations?: boolean;
  citationStyle?: 'inline' | 'footnote' | 'endnote' | 'none';
  template?: string;                // Template personnalise
  qualityCheck?: boolean;           // Validation qualite
  iterate?: boolean;                // Iteration pour amelioration
  maxIterations?: number;
}

interface GenerationResult {
  document: GeneratedDocument;
  qualityScore: number;
  warnings: string[];
  suggestions: string[];
  metadata: {
    generationTime: number;
    tokensUsed: number;
    chunksUsed: number;
  };
}
```

#### 3.3.2. Nouveaux Types de Documents

**Types a Ajouter** :

```typescript
export type GeneratedDocType = 
  // Existants
  | 'summary' | 'faq' | 'study-guide' | 'briefing' | 'timeline' 
  | 'outline' | 'mindmap' | 'swot' | 'glossary' | 'infographic'
  | 'full-report' | 'report-business' | 'report-market' 
  | 'report-technical' | 'report-competitive' | 'report-financial'
  | 'report-marketing' | 'report-product' | 'report-risk' 
  | 'report-executive' | 'report-project' | 'roadmap'
  
  // Nouveaux - Analyse
  | 'sentiment-analysis'           // Analyse de sentiment
  | 'entity-extraction'            // Extraction d'entites
  | 'keyword-analysis'             // Analyse des mots-cles
  | 'topic-modeling'               // Modelisation de topics
  | 'competitive-intelligence'     // Intelligence concurrentielle
  
  // Nouveaux - Contenu
  | 'blog-post'                    // Article de blog
  | 'social-media-post'           // Post reseaux sociaux
  | 'email-draft'                  // Brouillon d'email
  | 'press-release'                // Communique de presse
  | 'whitepaper'                   // Livre blanc
  | 'case-study'                   // Etude de cas
  
  // Nouveaux - Technique
  | 'api-documentation'            // Documentation API
  | 'code-review'                  // Revue de code
  | 'technical-specs'              // Specifications techniques
  | 'architecture-diagram'        // Diagramme d'architecture
  | 'flowchart'                    // Organigramme
  
  // Nouveaux - Creatif
  | 'story'                        // Histoire/narratif
  | 'dialogue'                     // Dialogue
  | 'poem'                         // Poeme
  | 'song-lyrics'                  // Paroles de chanson
  
  // Nouveaux - Visuel
  | 'd3-chart'                     // Graphique D3.js
  | 'network-graph'                // Graphe de reseau
  | 'timeline-visual'              // Chronologie visuelle
  | 'word-cloud'                   // Nuage de mots
  | 'heatmap'                      // Carte thermique
  
  // Nouveaux - Educatif
  | 'quiz'                         // Quiz interactif
  | 'flashcards'                   // Cartes memoire
  | 'cheat-sheet'                  // Aide-memoire
  | 'tutorial'                     // Tutoriel
  | 'course-outline'               // Plan de cours
  
  // Nouveaux - Collaboratif
  | 'meeting-notes'                // Compte-rendu de reunion
  | 'action-items'                 // Elements d'action
  | 'decision-log'                 // Journal des decisions
  | 'project-charter'              // Charte de projet
  | 'stakeholder-analysis'         // Analyse des parties prenantes
```

#### 3.3.3. Generation Multi-Sources

**Problemes** :
- Pas de fusion intelligente de plusieurs sources
- Pas de detection de contradictions
- Pas de resolution de conflits

**Solutions** :

```typescript
// Dans ContentGenerator.ts
class ContentGenerator {
  async generateFromMultipleSources(
    notebookId: string,
    type: GeneratedDocType,
    options: GenerationOptions & {
      conflictResolution?: 'auto' | 'manual' | 'highlight';
      sourceWeighting?: Record<string, number>; // Poids par source
      mergeStrategy?: 'concatenate' | 'synthesize' | 'compare';
    }
  ): Promise<{
    document: GeneratedDocument;
    conflicts?: Conflict[];
    sourcesUsed: string[];
    confidenceScores: Record<string, number>;
  }> {
    // Implementation
  }
  
  async detectConflicts(
    notebookId: string,
    topic: string
  ): Promise<Conflict[]> {
    // Detecter les contradictions entre sources
    return [];
  }
}

interface Conflict {
  topic: string;
  source1: { id: string; excerpt: string; };
  source2: { id: string; excerpt: string; };
  type: 'contradiction' | 'different-opinion' | 'conflicting-data';
  severity: 'low' | 'medium' | 'high';
  resolutionSuggestion?: string;
}
```

### 🎵 Audio et Multimedia

#### 3.4.1. Amelioration de l'Audio Overview

**Problemes** :
- Generation basique (2 hotes)
- Pas de personnalisation des voix
- Pas de controle de la duree
- Pas d'export audio

**Solutions** :

```typescript
// Dans AudioOverviewPanel.tsx et server
interface AudioGenerationOptions {
  type: 'overview' | 'podcast' | 'interview' | 'narrative' | 'discussion';
  speakers?: number;                // Nombre d'intervenants (2-4)
  speakerSettings?: {             // Parametres des intervenants
    name: string;
    role: string;
    voice?: string;                // Voix TTS
    style?: 'formal' | 'casual' | 'enthusiastic';
  }[];
  duration?: {                     // Controle de la duree
    min?: number;                  // Minutes
    max?: number;
    target?: number;
  };
  scriptStyle?: 'natural' | 'structured' | 'conversational';
  include?: {
    introduction?: boolean;
    conclusion?: boolean;
    citations?: boolean;
    sourceReferences?: boolean;
  };
  backgroundMusic?: boolean;
  soundEffects?: boolean;
}

interface AudioOverview {
  id: string;
  notebookId: string;
  title: string;
  script: string;
  estimatedDuration: number;
  status: 'generating' | 'ready' | 'error';
  createdAt: string;
  // Nouveaux champs
  audioFile?: string;             // Chemin vers le fichier audio
  speakers: Speaker[];
  chapters: AudioChapter[];       // Chapitres/timestamps
  transcript?: string;           // Transcription complete
  metadata: {
    generationTime: number;
    tokensUsed: number;
  };
}

interface AudioChapter {
  id: string;
  title: string;
  startTime: number;              // En secondes
  endTime: number;
  speaker?: string;
  summary: string;
}
```

**Nouveaux Endpoints** :
```typescript
// POST /api/notebooks/:id/audio/generate
// GET /api/notebooks/:id/audio/:audioId/file      // Telecharger audio
// POST /api/notebooks/:id/audio/:audioId/export   // Exporter audio
// POST /api/notebooks/:id/audio/tts              // Text-to-speech
```

#### 3.4.2. Generation Video

**Nouvelle Fonctionnalite** :

```typescript
// Nouveau type
interface VideoOverview {
  id: string;
  notebookId: string;
  title: string;
  script: string;
  status: 'generating' | 'ready' | 'error';
  videoFile?: string;
  thumbnail?: string;
  duration: number;
  resolution: { width: number; height: number };
  createdAt: string;
}

// Nouveau service
class VideoGenerator {
  async generateVideo(
    notebookId: string,
    options: {
      type: 'summary' | 'presentation' | 'tutorial' | 'explanation';
      script?: string;                // Script personnalise
      voice?: string;                  // Voix pour narration
      style?: 'animated' | 'static' | 'slideshow';
      visualTheme?: string;
      includeSubtitles?: boolean;
      resolution?: '720p' | '1080p' | '4k';
    }
  ): Promise<VideoOverview> {
    // Generation avec tools comme Pika, Runway, ou local
  }
}
```

### 📊 Analytics et Insights

#### 3.5.1. Analytics des Notebooks

**Nouvelle Fonctionnalite** :

```typescript
// Nouveau service
class NotebookAnalytics {
  getNotebookStats(notebookId: string): NotebookStats {
    // Statistiques pour un notebook
  }
  
  getUsageAnalytics(notebookId: string): UsageAnalytics {
    // Analyse d'utilisation
  }
  
  getSourceAnalytics(notebookId: string, sourceId: string): SourceAnalytics {
    // Analyse d'une source
  }
}

interface NotebookStats {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  // Statistiques
  totalSources: number;
  totalNotes: number;
  totalChunks: number;
  totalWords: number;
  totalChatMessages: number;
  totalGeneratedDocs: number;
  totalAudioOverviews: number;
  // Metriques d'engagement
  lastUsed: string;
  usageFrequency: number;         // Nombre d'utilisations
  averageSessionDuration: number; // Duree moyenne des sessions
  // Qualite
  averageSourceQuality: number;
  averageCitationRelevance: number;
  // Top items
  topSources: SourceStat[];
  topTopics: TopicStat[];
  mostActiveDays: DayStat[];
}

interface SourceStat {
  sourceId: string;
  title: string;
  usageCount: number;
  citationCount: number;
  relevanceScore: number;
}

interface TopicStat {
  topic: string;
  frequency: number;
  sources: string[];
}

interface UsageAnalytics {
  period: {
    start: string;
    end: string;
  };
  totalSessions: number;
  totalMessages: number;
  totalGenerations: number;
  activeDays: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}
```

**Nouveaux Endpoints** :
```typescript
// GET /api/notebooks/:id/stats
// GET /api/notebooks/:id/analytics
// GET /api/notebooks/:id/sources/:sourceId/stats
// GET /api/analytics/overview
```

#### 3.5.2. Extraction d'Insights Automatiques

**Nouvelle Fonctionnalite** :

```typescript
// Dans ContentGenerator.ts ou nouveau service
class InsightExtractor {
  async extractInsights(
    notebookId: string,
    options?: {
      focus?: 'all' | 'key-findings' | 'trends' | 'patterns' | 'outliers';
      depth?: 'surface' | 'detailed' | 'comprehensive';
      sourceIds?: string[];
    }
  ): Promise<InsightReport> {
    // Extraction automatique d'insights
  }
  
  async detectTrends(
    notebookId: string,
    options?: {
      timeRange?: { start: Date; end: Date };
      granularity?: 'daily' | 'weekly' | 'monthly';
    }
  ): Promise<TrendReport> {
    // Detection de tendances
  }
  
  async identifyPatterns(
    notebookId: string
  ): Promise<PatternReport> {
    // Identification de motifs recurrents
  }
}

interface InsightReport {
  id: string;
  notebookId: string;
  generatedAt: string;
  sections: {
    keyFindings: Insight[];
    trends: Trend[];
    patterns: Pattern[];
    outliers: Outlier[];
    recommendations: Recommendation[];
  };
}

interface Insight {
  id: string;
  title: string;
  description: string;
  sources: SourceReference[];
  confidence: number;              // 0-1
  relevance: number;              // 0-1
  category: 'fact' | 'observation' | 'analysis' | 'prediction';
}

interface Trend {
  id: string;
  description: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  magnitude: number;
  sources: SourceReference[];
  timePeriod: { start: string; end: string };
}

interface Pattern {
  id: string;
  description: string;
  frequency: number;
  examples: Example[];
  sources: SourceReference[];
}
```

### 🔍 Recherche et Decouverte

#### 3.6.1. Recherche Globale

**Nouvelle Fonctionnalite** :

```typescript
// Nouveau service
class GlobalSearch {
  async search(
    query: string,
    options?: {
      type?: 'all' | 'notebooks' | 'sources' | 'notes' | 'chats' | 'documents';
      notebookIds?: string[];
      sourceTypes?: SourceType[];
      dateRange?: { start: Date; end: Date };
      tags?: string[];
      sortBy?: 'relevance' | 'date' | 'usage';
      limit?: number;
      offset?: number;
    }
  ): Promise<SearchResult> {
    // Recherche globale dans tous les notebooks
  }
}

interface SearchResult {
  query: string;
  totalResults: number;
  results: SearchItem[];
  suggestions: string[];
  filters: FilterOption[];
}

interface SearchItem {
  id: string;
  type: 'notebook' | 'source' | 'note' | 'chat' | 'document';
  title: string;
  excerpt: string;
  relevance: number;
  notebookId?: string;
  notebookTitle?: string;
  sourceId?: string;
  sourceTitle?: string;
  date: string;
  metadata: Record<string, any>;
}
```

**Nouveaux Endpoints** :
```typescript
// GET /api/search?q=query
// GET /api/search/suggestions?q=query
```

#### 3.6.2. Decouverte de Contenu

**Nouvelle Fonctionnalite** :

```typescript
// Nouveau service
class ContentDiscovery {
  async suggestRelated(
    notebookId: string,
    itemType: 'notebook' | 'source' | 'note',
    itemId: string
  ): Promise<RelatedItem[]> {
    // Suggester des elements similaires
  }
  
  async discoverSimilar(
    notebookId: string,
    sourceId: string
  ): Promise<SimilarSource[]> {
    // Trouver des sources similaires
  }
  
  async recommendContent(
    notebookId: string,
    userPreferences?: UserPreferences
  ): Promise<ContentRecommendation[]> {
    // Recommander du contenu pertinent
  }
}

interface RelatedItem {
  id: string;
  type: 'notebook' | 'source' | 'note' | 'document';
  title: string;
  similarityScore: number;        // 0-1
  reason: string;
  commonTopics: string[];
}

interface ContentRecommendation {
  id: string;
  type: GeneratedDocType;
  title: string;
  description: string;
  reason: string;
  expectedValue: number;          // Valeur attendez (0-100)
  estimatedTime: number;         // Temps de generation (minutes)
}
```

---

## 4. Ameliorations UI/UX

### 🎨 Design et Layout

#### 4.1.1. Amelioration du Layout Principal

**Problemes** :
- Layout 3 colonnes peut etre etroit sur les petits ecrans
- Pas de mode plein ecran pour les differents panneaux
- Navigation parfois confuse entre les onglets

**Solutions** :

```
### Nouveau Systeme de Layout

#### Layout Modes:
1. **Compact** (mobile/etroit):
   - 1 colonne principale
   - Panneaux lateraux en overlay
   - Navigation par onglets en bas

2. **Balanced** (tablette/desktop):
   - 2 colonnes (sources + chat/notes)
   - Studio en panneau glissant

3. **Wide** (large desktop):
   - 3 colonnes (sources + centre + studio)
   - Toutes les fonctionnalites visibles

4. **Fullscreen** (n'importe quel ecran):
   - Un seul panneau en plein ecran
   - Parfait pour la lecture/edition

#### Layout Customization:
- Redimensionnable: Utilisateur peut redimensionner les panneaux
- Dockable: Panneaux peuvent etre detaches en fenetres separes
- Persistent: Preferences sauvegardees
```

**Implementation** :
```typescript
// Nouveau composant LayoutManager.tsx
interface LayoutConfig {
  mode: 'compact' | 'balanced' | 'wide' | 'fullscreen';
  leftPanel: {
    visible: boolean;
    width: number;               // Pourcentage ou pixels
    collapsed: boolean;
    docked: boolean;             // En fenetre separee
  };
  centerPanel: {
    visible: boolean;
    fullscreen: boolean;
  };
  rightPanel: {
    visible: boolean;
    width: number;
    collapsed: boolean;
    docked: boolean;
  };
  //Preferences
  savePreferences: boolean;
  rememberLastState: boolean;
}

// Nouveau contexte
const LayoutContext = createContext<{
  config: LayoutConfig;
  setConfig: (config: Partial<LayoutConfig>) => void;
  togglePanel: (panel: 'left' | 'center' | 'right') => void;
  enterFullscreen: (panel: 'left' | 'center' | 'right') => void;
  exitFullscreen: () => void;
}>(null);
```

#### 4.1.2. Theme et Personnalisation

**Problemes** :
- Theme limite aux couleurs predefinies
- Pas de mode sombre/clair automatique
- Pas de personnalisation des couleurs par notebook

**Solutions** :

```typescript
// Theme avances
interface NotebookTheme {
  // Couleurs
  color: string;                    // Couleur principale
  accentColor: string;             // Couleur d'accentuation
  backgroundColor?: string;        // Couleur de fond
  textColor?: string;              // Couleur de texte
  
  // Styles
  fontFamily?: string;            // Police
  fontSize?: 'small' | 'medium' | 'large';
  borderRadius?: 'sharp' | 'rounded' | 'pill';
  
  // Effets
  glowEffect?: boolean;            // Effet de lueur
  shadowEffect?: boolean;          // Effet d'ombre
  animationStyle?: 'minimal' | 'fluid' | 'expressive';
  
  // Icones
  icon: string;                    // Icone du notebook
  iconStyle?: 'emoji' | 'symbol' | 'image';
  customIcon?: string;            // URL ou chemin vers une icone personnalisee
}

// Theme global
interface AppTheme {
  mode: 'light' | 'dark' | 'system';
  accentPrimary: string;
  accentSecondary: string;
  notebookDefaultTheme: NotebookTheme;
  customThemes: Record<string, NotebookTheme>;
  // Nouveaux
  useSystemTheme: boolean;
  followOSTheme: boolean;
  animateThemeTransition: boolean;
}

// Nouveau composant ThemePicker.tsx
// - Selecteur de theme (clair/sombre/system)
// - Personnalisation des couleurs
// - Preview du theme
// - Sauvegarde des preferences
```

**CSS Variables Ameliorees** :
```css
:root {
  /* Existantes */
  --accent-primary: #3b82f6;
  --accent-secondary: #8b5cf6;
  
  /* Nouveaux */
  --theme-mode: light;
  --notebook-color: var(--accent-primary);
  --notebook-accent: var(--accent-secondary);
  --notebook-bg: #ffffff;
  --notebook-surface: #f8fafc;
  --notebook-surface-muted: #f1f5f9;
  --notebook-border: #e2e8f0;
  
  /* Transitions */
  --transition-fast: 150ms;
  --transition-normal: 250ms;
  --transition-slow: 400ms;
  
  /* Effets */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  --shadow-xl: 0 20px 25px rgba(0,0,0,0.1);
  --glow-primary: 0 0 20px rgba(59, 130, 246, 0.3);
}

[data-theme="dark"] {
  --notebook-bg: #0f172a;
  --notebook-surface: #1e293b;
  --notebook-surface-muted: #334155;
  --notebook-border: #475569;
}
```

#### 4.1.3. Amelioration des Cards

**Problemes** :
- Cards notebook peu informatives
- Pas de preview du contenu
- Pas d'actions rapides

**Solutions** :

```tsx
// Nouveau design pour NotebookCard
const NotebookCard = ({ notebook, onSelect, onQuickAction }) => {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.995 }}
      className="notebook-card"
    >
      {/* Header avec gradient animé */}
      <div className="notebook-card-header">
        <div 
          className="notebook-card-accent"
          style={{ background: `linear-gradient(135deg, ${notebook.color}, ${notebook.accentColor})` }}
        />
        <div className="notebook-card-icon">
          {notebook.icon}
        </div>
        <div className="notebook-card-actions">
          <QuickActionButton icon={Star} onClick={() => onQuickAction('pin')} />
          <QuickActionButton icon={Share} onClick={() => onQuickAction('share')} />
          <QuickActionButton icon={MoreVertical} onClick={() => onQuickAction('menu')} />
        </div>
      </div>
      
      {/* Contenu */}
      <div className="notebook-card-content">
        <h3 className="notebook-card-title">{notebook.title}</h3>
        <p className="notebook-card-description">{notebook.description}</p>
        
        {/* Preview du contenu */}
        {notebook.preview && (
          <div className="notebook-card-preview">
            <p>{notebook.preview}</p>
            <span className="notebook-card-preview-label">Aperçu</span>
          </div>
        )}
        
        {/* Statistiques */}
        <div className="notebook-card-stats">
          <StatItem icon={FileText} value={notebook.sourcesCount} label="Sources" />
          <StatItem icon={MessageSquare} value={notebook.notesCount} label="Notes" />
          <StatItem icon={Clock} value={timeAgo(notebook.updatedAt)} label="Mis à jour" />
          <StatItem icon={TrendingUp} value={notebook.usageCount} label="Utilisations" />
        </div>
        
        {/* Tags */}
        {notebook.tags?.length > 0 && (
          <div className="notebook-card-tags">
            {notebook.tags.map(tag => (
              <Tag key={tag} color={getTagColor(tag)}>{tag}</Tag>
            ))}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="notebook-card-footer">
        <ProgressBar value={notebook.completionPercentage} />
        <span className="notebook-card-status">{getStatusText(notebook)}</span>
      </div>
    </motion.div>
  );
};
```

#### 4.1.4. Vue Kanban pour les Notebooks

**Nouvelle Vue** :

```tsx
// Nouveau composant NotebookKanban.tsx
const NotebookKanban = ({ notebooks, onNotebookAction }) => {
  const [columns, setColumns] = useState({
    'à-faire': { title: 'À faire', notebooks: [] },
    'en-cours': { title: 'En cours', notebooks: [] },
    'en-revue': { title: 'En revue', notebooks: [] },
    'terminé': { title: 'Terminé', notebooks: [] },
    'archivé': { title: 'Archivé', notebooks: [] },
  });
  
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    // Reorganiser les notebooks entre colonnes
  };
  
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="kanban-board">
        {Object.entries(columns).map(([columnId, column]) => (
          <Droppable key={columnId} droppableId={columnId}>
            {(provided) => (
              <div 
                className="kanban-column"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                <div className="kanban-column-header">
                  <h3>{column.title}</h3>
                  <span className="kanban-column-count">{column.notebooks.length}</span>
                </div>
                <div className="kanban-column-content">
                  {column.notebooks.map((notebook, index) => (
                    <Draggable key={notebook.id} draggableId={notebook.id} index={index}>
                      {(provided) => (
                        <NotebookCard
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          notebook={notebook}
                          onSelect={onNotebookAction}
                          showStatus
                        />
                      ))}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
                <button 
                  className="kanban-add-card"
                  onClick={() => onNotebookAction('create', { columnId })}
                >
                  <Plus className="kanban-add-icon" />
                  Ajouter un notebook
                </button>
              </div>
            ))}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
};
```

### 📱 Responsive et Mobile

#### 4.2.1. Amelioration Mobile

**Problemes** :
- Interface peu adaptee aux mobiles
- Touch targets parfois trop petits
- Navigation complexe sur petit ecran

**Solutions** :

```typescript
// Configuration responsive
const RESPONSIVE_BREAKPOINTS = {
  xs: 0,      // < 576px  - Mobile portrait
  sm: 576,    // >= 576px - Mobile landscape
  md: 768,    // >= 768px - Tablette
  lg: 992,    // >= 992px - Petit desktop
  xl: 1200,   // >= 1200px - Desktop
  xxl: 1400,  // >= 1400px - Grand desktop
};

// Touch targets minimums
const TOUCH_TARGETS = {
  button: { minWidth: 44, minHeight: 44 },
  input: { minHeight: 44 },
  card: { minTouchArea: 44 },
  icon: { minSize: 24 },
};
```

**Ameliorations Mobile** :

1. **Bottom Navigation Bar** :
   ```tsx
   // Pour mobile
   <BottomNavigation>
     <NavItem icon={Home} label="Accueil" active={activeTab === 'home'} />
     <NavItem icon={Search} label="Rechercher" active={activeTab === 'search'} />
     <NavItem icon={PlusCircle} label="Créer" onClick={handleCreate} />
     <NavItem icon={BookOpen} label="Notebooks" active={activeTab === 'notebooks'} />
     <NavItem icon={Settings} label="Paramètres" active={activeTab === 'settings'} />
   </BottomNavigation>
   ```

2. **Floating Action Button** :
   ```tsx
   <FAB 
     position="bottom-right"
     icon={Plus}
     onClick={handleCreate}
     tooltip="Créer un notebook"
   />
   ```

3. **Swipe Gestures** :
   ```tsx
   // Dans NotebookList.tsx
   <SwipeableList
     onSwipeLeft={(notebookId) => handleDelete(notebookId)}
     onSwipeRight={(notebookId) => handlePin(notebookId)}
   >
     {notebooks.map(notebook => (
       <SwipeableItem key={notebook.id}>
         <NotebookCard notebook={notebook} />
       </SwipeableItem>
     ))}
   </SwipeableList>
   ```

4. **Pull to Refresh** :
   ```tsx
   <PullToRefresh onRefresh={loadNotebooks}>
     <NotebookList />
   </PullToRefresh>
   ```

#### 4.2.2. Mode Tablette

**Layout Optimise pour Tablette** :

```tsx
// Layout pour tablette (2 colonnes)
const TabletLayout = ({ children }) => {
  return (
    <div className="tablet-layout">
      {/* Panneau gauche (sources) - reducible */}
      <ResizablePanel 
        position="left"
        defaultWidth={250}
        minWidth={200}
        maxWidth={400}
        collapsible
      >
        <SourcePanel />
      </ResizablePanel>
      
      {/* Panneau principal (centre) */}
      <MainPanel>
        {children}
      </MainPanel>
      
      {/* Panneau droit (studio) - glissant */}
      <SlidingPanel 
        position="right"
        defaultOpen={false}
        width={300}
      >
        <StudioPanel />
      </SlidingPanel>
    </div>
  );
};
```

### 🎯 Interactions et Feedback

#### 4.3.1. Amelioration des Animations

**Problemes** :
- Animations parfois trop rapides
- Pas de feedback visuel suffisant pour les actions

**Solutions** :

```typescript
// Configuration des animations
const ANIMATION_CONFIG = {
  // Spring presets
  spring: {
    type: 'spring',
    bounce: 0,
    duration: 0.3,
  },
  springBouncy: {
    type: 'spring',
    bounce: 0.2,
    duration: 0.4,
  },
  springStiff: {
    type: 'spring',
    bounce: 0,
    duration: 0.2,
    stiffness: 500,
  },
  
  // Easing presets
  easeInOut: [0.4, 0, 0.2, 1],
  easeOut: [0, 0, 0.2, 1],
  easeIn: [0.4, 0, 1, 1],
  
  // Durations
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  slower: 0.6,
  
  // Feedback visuel
  feedback: {
    tap: { scale: 0.95, opacity: 0.8 },
    hover: { scale: 1.02, y: -2 },
    press: { scale: 0.98 },
    focus: { boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.3)' },
  },
};
```

**Nouveaux Effets d'Animation** :

```tsx
// Animation de chargement amelioree
const EnhancedLoader = ({ message }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={ANIMATION_CONFIG.spring}
      className="enhanced-loader"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ 
          duration: 1,
          repeat: Infinity,
          ease: 'linear'
        }}
        className="loader-spinner"
      />
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {message}
      </motion.p>
      <motion.div
        className="loader-dots"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ 
          duration: 1.5,
          repeat: Infinity,
          delay: 0.2
        }}
      >
        <span>.</span><span>.</span><span>.</span>
      </motion.div>
    </motion.div>
  );
};
```

#### 4.3.2. Feedback Utilisateur

**Nouveau Systeme de Feedback** :

```typescript
// Types pour le feedback
interface Feedback {
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  icon?: React.ReactNode;
  duration?: number;              // Duree en ms (0 = manuel)
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
  progress?: boolean;             // Barre de progression
  progressValue?: number;        // 0-100
}

// Nouveau contexte de feedback
const FeedbackContext = createContext<{
  show: (feedback: Feedback) => string; // Retourne l'ID
  update: (id: string, updates: Partial<Feedback>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}>(null);

// Composant de feedback
const FeedbackCenter = () => {
  const { feedbacks, dismiss } = useFeedback();
  
  return (
    <div className="feedback-center">
      <AnimatePresence>
        {feedbacks.map(feedback => (
          <FeedbackToast 
            key={feedback.id}
            feedback={feedback}
            onDismiss={() => dismiss(feedback.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

// Toast ameliore
const FeedbackToast = ({ feedback, onDismiss }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      transition={ANIMATION_CONFIG.spring}
      className={`feedback-toast feedback-toast-${feedback.type}`}
    >
      <div className="feedback-icon">
        {feedback.icon || getIconForType(feedback.type)}
      </div>
      <div className="feedback-content">
        {feedback.title && <h4>{feedback.title}</h4>}
        <p>{feedback.message}</p>
        {feedback.progress && (
          <ProgressBar value={feedback.progressValue} />
        )}
      </div>
      {feedback.dismissible && (
        <button className="feedback-dismiss" onClick={onDismiss}>
          <X className="feedback-dismiss-icon" />
        </button>
      )}
      {feedback.action && (
        <button 
          className="feedback-action"
          onClick={feedback.action.onClick}
        >
          {feedback.action.label}
        </button>
      )}
    </motion.div>
  );
};
```

#### 4.3.3. Confirmation des Actions

**Nouveau Systeme de Confirmation** :

```typescript
// Types pour les confirmations
interface ConfirmationConfig {
  title: string;
  message: string | React.ReactNode;
  type?: 'default' | 'danger' | 'warning' | 'info';
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger' | 'success';
  cancelVariant?: 'secondary' | 'outline';
  icon?: React.ReactNode;
  // Options de comportement
  requireConfirmation?: boolean;    // Requiert confirmation texte
  confirmationText?: string;        // Texte a entrer
  showCancel?: boolean;
  autoClose?: boolean;
  closeOnConfirm?: boolean;
  closeOnCancel?: boolean;
  // Positionnement
  position?: 'center' | 'top' | 'bottom' | { x: number; y: number };
  // Animation
  animation?: 'fade' | 'slide' | 'scale' | 'none';
}

// Nouveau hook
const useConfirmation = () => {
  const [config, setConfig] = useState<ConfirmationConfig | null>(null);
  const [resolver, setResolver] = useState<(value: boolean) => void | null>(null);
  
  const confirm = (config: ConfirmationConfig): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfig(config);
      setResolver(() => resolve);
    });
  };
  
  const handleConfirm = () => {
    resolver?.(true);
    if (config?.closeOnConfirm) setConfig(null);
  };
  
  const handleCancel = () => {
    resolver?.(false);
    if (config?.closeOnCancel) setConfig(null);
  };
  
  return { confirm, config, handleConfirm, handleCancel, dismiss: () => setConfig(null) };
};

// Composant de confirmation
const ConfirmationDialog = ({ config, onConfirm, onCancel, onDismiss }) => {
  const [confirmationText, setConfirmationText] = useState('');
  const isConfirmed = !config.requireConfirmation || 
                    confirmationText === config.confirmationText;
  
  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
      exit={{ opacity: 0 }}
      className="confirmation-overlay"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`confirmation-dialog confirmation-dialog-${config.type}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="confirmation-header">
          <div className="confirmation-icon">
            {config.icon || getIconForType(config.type)}
          </div>
          <h3 className="confirmation-title">{config.title}</h3>
        </div>
        
        <div className="confirmation-content">
          {typeof config.message === 'string' ? (
            <p>{config.message}</p>
          ) : (
            config.message
          )}
          
          {config.requireConfirmation && (
            <div className="confirmation-input">
              <label>
                Entrez "{config.confirmationText}" pour confirmer:
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={e => setConfirmationText(e.target.value)}
                placeholder={`Entrez "${config.confirmationText}"`}
              />
            </div>
          )}
        </div>
        
        <div className="confirmation-actions">
          {config.showCancel && (
            <Button 
              variant={config.cancelVariant || 'outline'}
              onClick={onCancel}
            >
              {config.cancelLabel || 'Annuler'}
            </Button>
          )}
          <Button 
            variant={config.confirmVariant || 'primary'}
            onClick={onConfirm}
            disabled={config.requireConfirmation && !isConfirmed}
          >
            {config.confirmLabel || 'Confirmer'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};
```

### 🔍 Recherche et Filtres

#### 4.4.1. Barre de Recherche Amelioree

**Nouvelle Barre de Recherche** :

```tsx
const EnhancedSearchBar = ({ onSearch, onFilterChange }) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  
  // Recherche des suggestions
  useEffect(() => {
    if (query.length > 2) {
      const timer = setTimeout(() => {
        fetchSuggestions(query).then(setSuggestions);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSuggestions([]);
    }
  }, [query]);
  
  return (
    <motion.div
      className="enhanced-search-bar"
      animate={{ 
        scale: isFocused ? 1.02 : 1,
        boxShadow: isFocused 
          ? '0 4px 12px rgba(59, 130, 246, 0.15)' 
          : 'none'
      }}
    >
      <div className="search-input-wrapper">
        <Search className="search-icon" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Rechercher dans les notebooks..."
          className="search-input"
        />
        {query && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => setQuery('')}
            className="search-clear"
          >
            <X className="search-clear-icon" />
          </motion.button>
        )}
      </div>
      
      <AnimatePresence>
        {isFocused && (suggestions.length > 0 || activeFilter) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="search-dropdown"
          >
            {suggestions.length > 0 && (
              <div className="search-suggestions">
                <p className="search-suggestions-title">Suggestions</p>
                {suggestions.map(suggestion => (
                  <button
                    key={suggestion.id}
                    className="search-suggestion-item"
                    onClick={() => {
                      setQuery(suggestion.text);
                      onSearch(suggestion.text);
                    }}
                  >
                    {suggestion.highlighted}
                  </button>
                ))}
              </div>
            )}
            
            <div className="search-filters">
              <FilterButton 
                filter="type" 
                value="notebook" 
                active={activeFilter === 'type:notebook'}
                onClick={() => setActiveFilter('type:notebook')}
              >
                Notebooks
              </FilterButton>
              <FilterButton 
                filter="type" 
                value="source" 
                active={activeFilter === 'type:source'}
                onClick={() => setActiveFilter('type:source')}
              >
                Sources
              </FilterButton>
              <FilterButton 
                filter="type" 
                value="note" 
                active={activeFilter === 'type:note'}
                onClick={() => setActiveFilter('type:note')}
              >
                Notes
              </FilterButton>
              <FilterButton 
                filter="recent" 
                active={activeFilter === 'recent'}
                onClick={() => setActiveFilter('recent')}
              >
                Recents
              </FilterButton>
            </div>
            
            <div className="search-actions">
              <button className="search-action" onClick={() => onFilterChange('advanced')}>
                <Sliders className="search-action-icon" />
                Filtres avancés
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
```

#### 4.4.2. Filtres Avances

**Nouveau Panneau de Filtres** :

```tsx
const AdvancedFiltersPanel = ({ filters, onFilterChange, onClose }) => {
  const [expandedSections, setExpandedSections] = useState({
    type: true,
    date: false,
    tags: false,
    source: false,
    notebook: false,
  });
  
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      className="advanced-filters-panel"
    >
      <div className="filters-header">
        <h3>Filtres avancés</h3>
        <button className="filters-close" onClick={onClose}>
          <X className="filters-close-icon" />
        </button>
      </div>
      
      <div className="filters-content">
        {/* Type de contenu */}
        <FilterSection 
          title="Type de contenu" 
          expanded={expandedSections.type} 
          onToggle={() => toggleSection('type')}
        >
          <CheckboxGroup
            options={[
              { value: 'notebook', label: 'Notebooks', count: filters.counts?.notebooks },
              { value: 'source', label: 'Sources', count: filters.counts?.sources },
              { value: 'note', label: 'Notes', count: filters.counts?.notes },
              { value: 'chat', label: 'Messages', count: filters.counts?.chats },
              { value: 'document', label: 'Documents', count: filters.counts?.documents },
            ]}
            value={filters.type || []}
            onChange={values => onFilterChange({ type: values })}
          />
        </FilterSection>
        
        {/* Date */}
        <FilterSection 
          title="Date" 
          expanded={expandedSections.date} 
          onToggle={() => toggleSection('date')}
        >
          <DateRangePicker
            value={filters.dateRange}
            onChange={range => onFilterChange({ dateRange: range })}
            presets={[
              { label: 'Aujourd\'hui', value: { start: today, end: today } },
              { label: 'Cette semaine', value: { start: startOfWeek, end: endOfWeek } },
              { label: 'Ce mois', value: { start: startOfMonth, end: endOfMonth } },
              { label: '3 derniers mois', value: { start: threeMonthsAgo, end: today } },
              { label: 'Cette année', value: { start: startOfYear, end: today } },
              { label: 'Personnalisé', value: null },
            ]}
          />
        </FilterSection>
        
        {/* Tags */}
        <FilterSection 
          title="Tags" 
          expanded={expandedSections.tags} 
          onToggle={() => toggleSection('tags')}
        >
          <TagCloud
            tags={filters.availableTags || []}
            selected={filters.tags || []}
            onToggle={tag => {
              const current = filters.tags || [];
              onFilterChange({ 
                tags: current.includes(tag) 
                  ? current.filter(t => t !== tag) 
                  : [...current, tag]
              });
            }}
            colorScheme="category10" // 10 couleurs differentes
          />
        </FilterSection>
        
        {/* Source */}
        <FilterSection 
          title="Sources" 
          expanded={expandedSections.source} 
          onToggle={() => toggleSection('source')}
        >
          <SourceFilter
            sources={filters.availableSources || []}
            selected={filters.sources || []}
            onChange={sources => onFilterChange({ sources })}
          />
        </FilterSection>
        
        {/* Notebook */}
        <FilterSection 
          title="Notebooks" 
          expanded={expandedSections.notebook} 
          onToggle={() => toggleSection('notebook')}
        >
          <NotebookFilter
            notebooks={filters.availableNotebooks || []}
            selected={filters.notebooks || []}
            onChange={notebooks => onFilterChange({ notebooks })}
          />
        </FilterSection>
      </div>
      
      <div className="filters-footer">
        <button 
          className="filters-reset" 
          onClick={() => onFilterChange({ reset: true })}
        >
          Réinitialiser
        </button>
        <button 
          className="filters-apply" 
          onClick={onClose}
        >
          Appliquer
        </button>
      </div>
    </motion.div>
  );
};
```

---

## 5. Ameliorations Techniques

### 🏗️ Architecture

#### 5.1.1. Amelioration du NotebookManager

**Problemes** :
- Pas de gestion des erreurs centralisee
- Pas de logging structured
- Pas de metrics de performance

**Solutions** :

```typescript
// NotebookManager.ts ameliore
class NotebookManager {
  private notebooks: Map<string, Notebook> = new Map();
  private logger: Logger;
  private metrics: MetricsCollector;
  private cache: ResponseCache;
  
  constructor() {
    this.logger = createLogger('NotebookManager');
    this.metrics = new MetricsCollector();
    this.cache = new ResponseCache();
    this.loadAll();
    this.setupAutoSave();
  }
  
  // Auto-save periodique
  private setupAutoSave() {
    setInterval(() => {
      this.logger.debug('Auto-save des notebooks...');
      this.persistAll();
    }, 5 * 60 * 1000); // 5 minutes
  }
  
  // Sauvegarde de tous les notebooks
  private persistAll(): void {
    this.notebooks.forEach(notebook => this.persist(notebook));
  }
  
  // Validation avant sauvegarde
  private validateNotebook(notebook: Notebook): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!notebook.title?.trim()) {
      errors.push('Le titre est requis');
    }
    
    if (notebook.title.length > 200) {
      warnings.push('Le titre est trop long (max 200 caracteres)');
    }
    
    if (notebook.sources.length > 1000) {
      warnings.push('Nombre eleve de sources (>1000)');
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  // Transaction support
  async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await callback();
      this.metrics.record('transaction', {
        duration: Date.now() - startTime,
        success: true,
      });
      return result;
    } catch (error) {
      this.metrics.record('transaction', {
        duration: Date.now() - startTime,
        success: false,
        error: error.message,
      });
      throw error;
    }
  }
}
```

#### 5.1.2. Cache Ameliore

**Nouvelle Implementation du Cache** :

```typescript
// ResponseCache.ts ameliore
interface CacheOptions {
  ttl?: number;                    // Time to live en ms (defaut: 5 minutes)
  maxSize?: number;                // Nombre max d'entrees (defaut: 1000)
  maxMemory?: number;              // Taille max en Mo (defaut: 100Mo)
  strategy?: 'lru' | 'lfu' | 'fifo' | 'lru-ttl';
  persist?: boolean;               // Persistance sur disque
  encrypt?: boolean;               // Chiffrement
}

class EnhancedCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private options: CacheOptions;
  private accessCount: Map<string, number> = new Map();
  private diskCache?: DiskCache<T>;
  
  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: 5 * 60 * 1000,
      maxSize: 1000,
      maxMemory: 100,
      strategy: 'lru',
      ...options,
    };
    
    if (this.options.persist) {
      this.diskCache = new DiskCache<T>(options);
    }
  }
  
  async get(key: string): Promise<T | undefined> {
    // Verifier en memoire
    const entry = this.cache.get(key);
    if (entry && !this.isExpired(entry)) {
      this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
      return entry.value;
    }
    
    // Verifier sur disque
    if (this.diskCache) {
      const diskEntry = await this.diskCache.get(key);
      if (diskEntry && !this.isExpired(diskEntry)) {
        // Charger en memoire
        this.cache.set(key, diskEntry);
        return diskEntry.value;
      }
    }
    
    return undefined;
  }
  
  async set(key: string, value: T): Promise<void> {
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl: this.options.ttl,
      size: this.estimateSize(value),
    };
    
    // Sauvegarder en memoire
    this.cache.set(key, entry);
    this.accessCount.set(key, 1);
    
    // Sauvegarder sur disque si active
    if (this.diskCache) {
      await this.diskCache.set(key, entry);
    }
    
    // Eviction si necessaire
    this.evictIfNeeded();
  }
  
  private evictIfNeeded(): void {
    // Implementation selon la strategie
    switch (this.options.strategy) {
      case 'lru':
        this.evictLeastRecentlyUsed();
        break;
      case 'lfu':
        this.evictLeastFrequentlyUsed();
        break;
      case 'fifo':
        this.evictFirstInFirstOut();
        break;
      case 'lru-ttl':
        this.evictLeastRecentlyUsedWithTTL();
        break;
    }
  }
  
  // Estimation de la taille
  private estimateSize(value: T): number {
    return JSON.stringify(value).length;
  }
  
  // Nettoyage periodique
  startCleanupInterval(interval: number = 60 * 1000): void {
    setInterval(() => this.cleanupExpired(), interval);
  }
  
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.accessCount.delete(key);
      }
    }
  }
}
```

#### 5.1.3. Gestion des Erreurs

**Nouveau Systeme de Gestion des Erreurs** :

```typescript
// errorHandler.ts
class ErrorHandler {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  constructor() {
    this.logger = createLogger('ErrorHandler');
    this.metrics = new MetricsCollector();
  }
  
  handle(error: Error, context: ErrorContext): ErrorResponse {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();
    
    // Classifier l'erreur
    const classification = this.classifyError(error);
    
    // Logger
    this.logger.error(`[${errorId}] ${error.message}`, {
      ...context,
      error: {
        name: error.name,
        stack: error.stack,
        message: error.message,
      },
      classification,
      timestamp,
    });
    
    // Metriques
    this.metrics.record('error', {
      type: classification.type,
      severity: classification.severity,
      context: context.module,
      timestamp,
    });
    
    // Retirer des informations sensibles
    const safeError = this.sanitizeError(error, context);
    
    // Creer la reponse
    const response: ErrorResponse = {
      error: {
        id: errorId,
        message: this.getUserFriendlyMessage(error, classification),
        type: classification.type,
        timestamp,
        ...(context.includeStack && { stack: error.stack }),
      },
    };
    
    // Notifier si critique
    if (classification.severity === 'critical') {
      this.notifyAdmins(errorId, error, context);
    }
    
    return response;
  }
  
  private classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    
    // Classification par type
    let type: ErrorType = 'unknown';
    let severity: ErrorSeverity = 'medium';
    
    if (message.includes('not found') || message.includes('introuvable')) {
      type = 'not_found';
      severity = 'low';
    } else if (message.includes('permission') || message.includes('access')) {
      type = 'permission_error';
      severity = 'medium';
    } else if (message.includes('timeout') || message.includes('trop long')) {
      type = 'timeout';
      severity = 'medium';
    } else if (message.includes('network') || message.includes('reseau')) {
      type = 'network_error';
      severity = 'medium';
    } else if (name.includes('validation') || message.includes('invalid')) {
      type = 'validation_error';
      severity = 'low';
    } else if (message.includes('rate limit') || message.includes('limite depassee')) {
      type = 'rate_limit';
      severity = 'high';
    } else if (name.includes('database') || message.includes('bdd')) {
      type = 'database_error';
      severity = 'high';
    } else if (message.includes('internal server') || message.includes('erreur interne')) {
      type = 'internal_error';
      severity = 'critical';
    }
    
    return { type, severity };
  }
  
  private getUserFriendlyMessage(error: Error, classification: ErrorClassification): string {
    const messages = {
      not_found: 'Ressource introuvable',
      permission_error: 'Permission refusée',
      timeout: 'La requête a pris trop de temps',
      network_error: 'Erreur réseau. Veuillez vérifier votre connexion.',
      validation_error: 'Données invalides',
      rate_limit: 'Trop de requêtes. Veuillez patienter.',
      database_error: 'Erreur de base de données',
      internal_error: 'Une erreur interne est survenue',
      unknown: 'Une erreur est survenue',
    };
    
    return messages[classification.type] || messages.unknown;
  }
}

type ErrorType = 
  | 'not_found'
  | 'permission_error'
  | 'timeout'
  | 'network_error'
  | 'validation_error'
  | 'rate_limit'
  | 'database_error'
  | 'internal_error'
  | 'unknown';

type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ErrorClassification {
  type: ErrorType;
  severity: ErrorSeverity;
}

interface ErrorContext {
  module: string;
  method: string;
  userId?: string;
  notebookId?: string;
  sourceId?: string;
  requestId?: string;
  includeStack?: boolean;
  [key: string]: any;
}

interface ErrorResponse {
  error: {
    id: string;
    message: string;
    type: ErrorType;
    timestamp: string;
    stack?: string;
  };
}
```

### ⚡ Performance

#### 5.2.1. Optimisation du RAG

**Problemes** :
- Recherche parfois lente
- Pas de cache des embeddings
- Pas de pre-chargement

**Solutions** :

```typescript
// RAGEngine.ts ameliore
class EnhancedRAGEngine {
  private embeddingStore: EmbeddingStore;
  private tfidfIndex: TFIDFIndex;
  private cache: EnhancedCache;
  private preloadQueue: PreloadQueue;
  
  constructor() {
    this.embeddingStore = embeddingStore;
    this.tfidfIndex = new TFIDFIndex();
    this.cache = new EnhancedCache({
      ttl: 10 * 60 * 1000, // 10 minutes
      maxSize: 5000,
      strategy: 'lru',
    });
    this.preloadQueue = new PreloadQueue();
    this.preloadCommonQueries();
  }
  
  // Pre-chargement des requetes courantes
  private async preloadCommonQueries() {
    const commonQueries = [
      'resume', 'summary', 'quelle est', 'quels sont', 'comment',
      'pourquoi', 'quand', 'ou', 'qui', 'combien', 'analyse',
      'comparaison', 'differences', 'similarites', 'recommandations'
    ];
    
    for (const query of commonQueries) {
      await this.preloadQueue.add(query);
    }
  }
  
  // Recherche hybride optimisee
  async searchHybrid(
    query: string,
    sources: Source[],
    options: RAGSearchOptions = {}
  ): Promise<RAGSearchResult[]> {
    const cacheKey = this.generateCacheKey(query, sources, options);
    
    // Verifier le cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Recherche par embeddings
    const embeddingResults = await this.searchByEmbeddings(query, sources, options);
    
    // Recherche TF-IDF
    const tfidfResults = await this.searchByTFIDF(query, sources, options);
    
    // Fusion des resultats
    const results = this.mergeResults(embeddingResults, tfidfResults, options);
    
    // Mettre en cache
    await this.cache.set(cacheKey, results, {
      ttl: options.cacheTTL || 5 * 60 * 1000,
    });
    
    return results;
  }
  
  // Recherche par embeddings avec cache
  private async searchByEmbeddings(
    query: string,
    sources: Source[],
    options: RAGSearchOptions
  ): Promise<RAGSearchResult[]> {
    // Calculer l'embedding de la requete (avec cache)
    const queryEmbedding = await this.getOrComputeEmbedding(query);
    
    // Recherche dans les embeddings
    const results = await this.embeddingStore.search(
      queryEmbedding,
      sources,
      options.maxChunks || 10,
      options.minRelevance || 0.1
    );
    
    return results;
  }
  
  // Cache des embeddings
  private embeddingCache: Map<string, number[]> = new Map();
  
  private async getOrComputeEmbedding(query: string): Promise<number[]> {
    const cacheKey = `embedding:${query}`;
    
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }
    
    const embedding = await this.computeEmbedding(query);
    this.embeddingCache.set(cacheKey, embedding);
    
    // Limiter la taille du cache
    if (this.embeddingCache.size > 1000) {
      this.embeddingCache.clear();
    }
    
    return embedding;
  }
  
  // Pre-chargement intelligent
  async preload(query: string, sources: Source[]): Promise<void> {
    await this.getOrComputeEmbedding(query);
    
    for (const source of sources) {
      await this.preloadSourceEmbeddings(source);
    }
  }
  
  private async preloadSourceEmbeddings(source: Source): Promise<void> {
    for (const chunk of source.chunks) {
      if (!chunk.embedding) {
        chunk.embedding = await this.computeEmbedding(chunk.content);
        // Sauvegarder
        await this.embeddingStore.updateChunk(source.id, chunk.id, { embedding: chunk.embedding });
      }
    }
  }
}
```

#### 5.2.2. Indexation Optimisee

**Nouvelle Implementation de l'Indexation** :

```typescript
// Indexation optimisee dans SourceIngester.ts
class OptimizedIndexer {
  private indexQueue: ProcessingQueue;
  private indexingProgress: Map<string, IndexingStatus> = new Map();
  
  constructor() {
    this.indexQueue = new ProcessingQueue({
      concurrency: 4, // 4 sources en parallele
      retryAttempts: 3,
      retryDelay: 1000,
    });
  }
  
  // Indexer une source avec priorite
  async indexSource(
    source: Source,
    options: {
      priority?: 'low' | 'normal' | 'high';
      notebookId: string;
      onProgress?: (progress: number) => void;
    } = { priority: 'normal' }
  ): Promise<void> {
    const taskId = `${source.id}-${Date.now()}`;
    
    this.indexingProgress.set(taskId, {
      id: taskId,
      sourceId: source.id,
      notebookId: options.notebookId,
      status: 'queued',
      progress: 0,
      chunksProcessed: 0,
      totalChunks: source.chunks.length,
      startTime: Date.now(),
    });
    
    await this.indexQueue.add({
      id: taskId,
      priority: this.getPriorityValue(options.priority),
      task: async (updateProgress) => {
        this.updateProgress(taskId, { status: 'processing' });
        
        // Decoupage en chunks
        const chunks = await this.chunkSource(source, (progress) => {
          updateProgress(progress * 0.4); // 40% du travail
          this.updateProgress(taskId, {
            progress: progress * 0.4,
            chunksProcessed: Math.floor(progress * source.chunks.length),
          });
        });
        
        // Calcul des embeddings
        await this.computeEmbeddings(chunks, (progress) => {
          updateProgress(0.4 + progress * 0.4); // 40% suivant
          this.updateProgress(taskId, {
            progress: 0.4 + progress * 0.4,
            chunksProcessed: Math.floor(0.4 * chunks.length + progress * chunks.length),
          });
        });
        
        // Indexation TF-IDF
        await this.computeTFIDF(chunks, (progress) => {
          updateProgress(0.8 + progress * 0.2); // 20% final
          this.updateProgress(taskId, {
            progress: 0.8 + progress * 0.2,
            chunksProcessed: chunks.length,
          });
        });
        
        // Sauvegarde
        this.updateProgress(taskId, { status: 'completed', progress: 100 });
        this.indexingProgress.delete(taskId);
      },
      onError: (error) => {
        this.updateProgress(taskId, { status: 'error', error: error.message });
        this.indexingProgress.delete(taskId);
      },
    });
  }
  
  // Decoupage optimise
  private async chunkSource(
    source: Source,
    onProgress: (progress: number) => void
  ): Promise<SourceChunk[]> {
    const text = source.rawText;
    const chunks: SourceChunk[] = [];
    const totalLength = text.length;
    let processedLength = 0;
    
    // Strategie de chunking intelligente
    const strategy = this.determineChunkingStrategy(source);
    
    switch (strategy) {
      case 'structural':
        // Decouper par structure (titres, sections)
        chunks.push(...await this.chunkByStructure(text, source));
        break;
      case 'semantic':
        // Decouper par paragraphes semantiques
        chunks.push(...await this.chunkBySemantics(text, source));
        break;
      default:
        // Decoupage fixe
        chunks.push(...this.chunkBySize(text, source));
    }
    
    // Calculer la progression
    processedLength = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    onProgress(processedLength / totalLength);
    
    return chunks;
  }
  
  // Calcul des embeddings en batch
  private async computeEmbeddings(
    chunks: SourceChunk[],
    onProgress: (progress: number) => void
  ): Promise<void> {
    const batchSize = 10; // Taille du batch
    const totalBatches = Math.ceil(chunks.length / batchSize);
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      // Calculer les embeddings pour le batch
      const embeddings = await this.embeddingStore.computeBatchEmbeddings(
        batch.map(c => c.content)
      );
      
      // Assigner les embeddings
      for (let j = 0; j < batch.length; j++) {
        batch[j].embedding = embeddings[j];
      }
      
      // Mise a jour de la progression
      const batchProgress = (i + batchSize) / chunks.length;
      onProgress(batchProgress);
    }
  }
  
  private determineChunkingStrategy(source: Source): ChunkingStrategy {
    // Determiner la strategie en fonction du type et du contenu
    if (source.type === 'pdf' || source.type === 'docx') {
      return 'structural';
    } else if (source.type === 'url' || source.type === 'html') {
      return 'semantic';
    } else if (source.rawText.length > 50000) {
      return 'semantic';
    }
    return 'fixed';
  }
}

type ChunkingStrategy = 'fixed' | 'structural' | 'semantic' | 'hybrid';
```

#### 5.2.3. Streaming Optimise

**Amelioration du Streaming** :

```typescript
// Streaming optimise dans GroundedChat.ts
class StreamingGroundedChat extends GroundedChat {
  private streamingControllers: Map<string, AbortController> = new Map();
  
  async askStream(
    notebookId: string,
    question: string,
    onChunk: (chunk: string) => void,
    options: {
      signal?: AbortSignal;
      onProgress?: (stage: string, progress: number) => void;
      onMetadata?: (metadata: StreamMetadata) => void;
    } = {}
  ): Promise<ChatMessage> {
    const controller = new AbortController();
    const streamId = `stream-${notebookId}-${Date.now()}`;
    
    // Stocker le controller pour pouvoir annuler
    this.streamingControllers.set(streamId, controller);
    
    // Fusionner les signaux
    const mergedSignal = this.mergeAbortSignals(options.signal, controller.signal);
    
    try {
      mergedSignal.addEventListener('abort', () => {
        controller.abort();
        this.streamingControllers.delete(streamId);
      });
      
      // Notification du debut
      options.onMetadata?.({ 
        stage: 'starting',
        progress: 0,
        timestamp: Date.now(),
      });
      
      // Recherche RAG (avec cache)
      options.onProgress?.('searching', 0.1);
      const ragResults = await this.searchWithProgress(question, notebookId, (progress) => {
        options.onProgress?.('searching', 0.1 + progress * 0.3);
      });
      
      // Construction du contexte
      options.onProgress?.('building_context', 0.4);
      const context = this.buildContextWithProgress(ragResults, (progress) => {
        options.onProgress?.('building_context', 0.4 + progress * 0.2);
      });
      
      // Generation du prompt
      options.onProgress?.('preparing_prompt', 0.6);
      const { prompt, userMessage } = this.preparePromptWithProgress(
        question, context, notebookId, (progress) => {
          options.onProgress?.('preparing_prompt', 0.6 + progress * 0.1);
        }
      );
      
      // Sauvegarder le message utilisateur
      notebookManager.addChatMessage(notebookId, userMessage);
      
      // Generation en streaming
      options.onProgress?.('generating', 0.7);
      options.onMetadata?.({ 
        stage: 'generating',
        progress: 0.7,
        metadata: {
          promptLength: prompt.length,
          contextLength: context.length,
        },
      });
      
      let responseText = '';
      let chunksReceived = 0;
      
      await generateTextStream({
        prompt,
        temperature: 0.4,
        maxOutputTokens: 4096,
        signal: mergedSignal,
        onChunk: (chunk, isFirst, isLast) => {
          chunksReceived++;
          responseText += chunk;
          
          // Envoyer le chunk
          onChunk(chunk);
          
          // Mise a jour de la progression
          const chunkProgress = 0.7 + (chunksReceived / 50) * 0.3; // Estimation
          options.onProgress?.('generating', Math.min(chunkProgress, 0.95));
        },
      });
      
      // Extraire les citations
      options.onProgress?.('extracting_citations', 0.95);
      const citations = this.extractCitationsWithProgress(responseText, ragResults, (progress) => {
        options.onProgress?.('extracting_citations', 0.95 + progress * 0.05);
      });
      
      // Construire et sauvegarder le message assistant
      const assistantMessage = this.buildMessage('assistant', responseText, citations);
      notebookManager.addChatMessage(notebookId, assistantMessage);
      
      options.onProgress?.('completed', 1);
      options.onMetadata?.({ 
        stage: 'completed',
        progress: 1,
        timestamp: Date.now(),
        metadata: {
          chunksReceived,
          citationsCount: citations.length,
          responseLength: responseText.length,
        },
      });
      
      return assistantMessage;
    } finally {
      this.streamingControllers.delete(streamId);
    }
  }
  
  // Annuler un stream
  cancelStream(notebookId: string): boolean {
    for (const [streamId, controller] of this.streamingControllers) {
      if (streamId.startsWith(`stream-${notebookId}`)) {
        controller.abort();
        this.streamingControllers.delete(streamId);
        return true;
      }
    }
    return false;
  }
  
  // Fusionner les signaux d'annulation
  private mergeAbortSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
    const controller = new AbortController();
    
    for (const signal of signals) {
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }
    }
    
    return controller.signal;
  }
}

interface StreamMetadata {
  stage: string;
  progress: number;
  timestamp: number;
  metadata?: Record<string, any>;
}
```

### 🔒 Securite

#### 5.3.1. Validation des Entrees

**Nouveau Systeme de Validation** :

```typescript
// validation.ts
class InputValidator {
  private schemas: Record<string, z.ZodSchema>;
  private sanitizers: Record<string, (input: any) => any>;
  
  constructor() {
    this.schemas = {
      notebook: this.createNotebookSchema(),
      source: this.createSourceSchema(),
      note: this.createNoteSchema(),
      chatMessage: this.createChatMessageSchema(),
      searchQuery: this.createSearchQuerySchema(),
      generationOptions: this.createGenerationOptionsSchema(),
    };
    
    this.sanitizers = {
      string: this.sanitizeString,
      html: this.sanitizeHtml,
      filename: this.sanitizeFilename,
      path: this.sanitizePath,
      url: this.sanitizeUrl,
    };
  }
  
  validate<T>(type: string, input: unknown): T {
    const schema = this.schemas[type];
    if (!schema) {
      throw new ValidationError(`No schema defined for type: ${type}`);
    }
    
    return schema.parse(input);
  }
  
  validateAndSanitize<T>(type: string, input: unknown, sanitizer?: string): T {
    const validated = this.validate<T>(type, input);
    
    if (sanitizer && this.sanitizers[sanitizer]) {
      return this.sanitizers[sanitizer](validated);
    }
    
    return validated;
  }
  
  private createNotebookSchema(): z.ZodSchema<Notebook> {
    return z.object({
      id: z.string().uuid().optional(),
      title: z.string()
        .min(1, 'Le titre est requis')
        .max(200, 'Le titre ne peut pas depasser 200 caracteres'),
      description: z.string()
        .max(1000, 'La description ne peut pas depasser 1000 caracteres')
        .optional(),
      color: z.string()
        .regex(/^#([0-9A-F]{3}){1,2}$/i, 'Couleur invalide')
        .optional(),
      icon: z.string()
        .max(10, 'L\'icone ne peut pas depasser 10 caracteres')
        .optional(),
      sources: z.array(this.createSourceSchema()).optional(),
      notes: z.array(this.createNoteSchema()).optional(),
      // ... autres champs
    });
  }
  
  private createSourceSchema(): z.ZodSchema<Source> {
    return z.object({
      id: z.string().uuid().optional(),
      notebookId: z.string().uuid(),
      title: z.string()
        .min(1, 'Le titre est requis')
        .max(500, 'Le titre ne peut pas depasser 500 caracteres'),
      type: z.enum([
        'pdf', 'text', 'markdown', 'url', 'audio', 'youtube', 
        'docx', 'html', 'image', 'video', 'pptx', 'xlsx', 'csv',
        'epub', 'notion', 'google-drive', 'github', 'arxiv', 'wikipedia'
      ]),
      origin: z.string()
        .max(2000, 'L\'origine ne peut pas depasser 2000 caracteres'),
      rawText: z.string()
        .max(10000000, 'Le texte ne peut pas depasser 10 Mo'),
      rawHtml: z.string().max(10000000).optional(),
      summary: z.string().max(5000).optional(),
      keywords: z.array(z.string().max(100)).optional(),
      chunks: z.array(this.createChunkSchema()).optional(),
      wordCount: z.number().int().nonnegative().optional(),
      language: z.string().length(2).optional(),
      addedAt: z.string().datetime().optional(),
      originalSize: z.number().int().nonnegative().optional(),
    });
  }
  
  private sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Controle characters
      .replace(/\s+/g, ' ') // Multiple spaces
      .normalize('NFKC'); // Normalisation Unicode
  }
  
  private sanitizeHtml(input: string): string {
    // Utiliser DOMPurify ou equivalent
    const clean = DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'code', 'pre'],
      ALLOWED_ATTR: ['href', 'title', 'class'],
    });
    return clean;
  }
  
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9-_\.]/g, '_')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')
      .substring(0, 255);
  }
  
  private sanitizePath(path: string): string {
    // Empecher directory traversal
    const normalized = path.normalize();
    if (normalized.includes('..') || normalized.startsWith('/')) {
      throw new ValidationError('Chemin invalide');
    }
    return normalized;
  }
  
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Verifier les schemas autorises
      const allowedSchemes = ['http:', 'https:', 'ftp:', 'file:'];
      if (!allowedSchemes.includes(parsed.protocol)) {
        throw new ValidationError(`Schema non autorise: ${parsed.protocol}`);
      }
      return parsed.toString();
    } catch {
      throw new ValidationError('URL invalide');
    }
  }
}

class ValidationError extends Error {
  constructor(message: string, public details?: Record<string, string[]>) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

#### 5.3.2. Controle d'Acces

**Nouveau Systeme de Controle d'Acces** :

```typescript
// accessControl.ts
class AccessControl {
  private permissions: Map<string, PermissionSet> = new Map();
  private logger: Logger;
  
  constructor() {
    this.logger = createLogger('AccessControl');
    this.loadPermissions();
  }
  
  // Verifier l'acces a un notebook
  canAccessNotebook(userId: string, notebookId: string, action: NotebookAction): boolean {
    // Vérifier si l'utilisateur a l'acces
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) return false;
    
    // Si c'est le propriétaire
    if (notebook.ownerId === userId) {
      return true;
    }
    
    // Vérifier les permissions partagées
    const permission = this.permissions.get(`${userId}:${notebookId}`);
    if (!permission) return false;
    
    return this.checkPermission(permission, action);
  }
  
  // Partager un notebook
  shareNotebook(
    notebookId: string,
    userId: string,
    permissions: PermissionSet,
    options: { expireAt?: Date } = {}
  ): boolean {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) return false;
    
    const permissionKey = `${userId}:${notebookId}`;
    this.permissions.set(permissionKey, {
      ...permissions,
      grantedAt: new Date(),
      grantedBy: notebook.ownerId,
      expireAt: options.expireAt,
    });
    
    this.logger.info(`Notebook ${notebookId} partagé avec ${userId}`, { permissions });
    return true;
  }
  
  // Revoquer l'acces
  revokeAccess(notebookId: string, userId: string): boolean {
    const permissionKey = `${userId}:${notebookId}`;
    if (this.permissions.has(permissionKey)) {
      this.permissions.delete(permissionKey);
      this.logger.info(`Acces révoqué pour ${userId} sur ${notebookId}`);
      return true;
    }
    return false;
  }
  
  // Verifier si une action est autorisée
  private checkPermission(permission: PermissionSet, action: NotebookAction): boolean {
    const actionPermissions: Record<NotebookAction, string> = {
      read: 'read',
      write: 'write',
      delete: 'delete',
      share: 'share',
      export: 'export',
      manage: 'manage',
      admin: 'admin',
    };
    
    const requiredPermission = actionPermissions[action];
    if (!requiredPermission) return false;
    
    // Vérifier selon la hiérarchie
    const hierarchy: Record<string, string[]> = {
      admin: ['admin', 'manage', 'share', 'delete', 'write', 'read'],
      manage: ['manage', 'share', 'delete', 'write', 'read'],
      share: ['share', 'write', 'read'],
      write: ['write', 'read'],
      read: ['read'],
    };
    
    const userPermissions = permission.permissions || [];
    
    // Si l'utilisateur a un niveau superieur ou egal
    for (const userPermission of userPermissions) {
      if (hierarchy[userPermission]?.includes(requiredPermission)) {
        return true;
      }
    }
    
    return false;
  }
}

type NotebookAction = 'read' | 'write' | 'delete' | 'share' | 'export' | 'manage' | 'admin';

type PermissionLevel = 'read' | 'write' | 'delete' | 'share' | 'manage' | 'admin';

interface PermissionSet {
  permissions: PermissionLevel[];
  grantedAt?: Date;
  grantedBy?: string;
  expireAt?: Date;
}
```

#### 5.3.3. Chiffrement des Donnees

**Nouveau Systeme de Chiffrement** :

```typescript
// encryption.ts
class DataEncryptor {
  private algorithm: string;
  private key: CryptoKey;
  private ivLength: number;
  
  constructor(password?: string) {
    this.algorithm = 'AES-GCM';
    this.ivLength = 12; // 96 bits pour GCM
    
    if (password) {
      this.key = this.deriveKey(password);
    } else {
      this.key = this.generateRandomKey();
    }
  }
  
  // Chiffrer des données
  async encrypt(data: string | object): Promise<EncryptedData> {
    const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
    const encodedData = new TextEncoder().encode(jsonData);
    
    // Générer un IV aléatoire
    const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
    
    // Chiffrer
    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv,
      },
      this.key,
      encodedData
    );
    
    return {
      data: this.arrayBufferToBase64(encrypted),
      iv: this.arrayBufferToBase64(iv),
      algorithm: this.algorithm,
      version: 1,
    };
  }
  
  // Dechiffrer des données
  async decrypt(encryptedData: EncryptedData): Promise<string> {
    const data = this.base64ToArrayBuffer(encryptedData.data);
    const iv = this.base64ToArrayBuffer(encryptedData.iv);
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: this.algorithm,
        iv,
      },
      this.key,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  }
  
  // Chiffrer un fichier
  async encryptFile(file: Buffer, filename: string): Promise<EncryptedFile> {
    const encryptedData = await this.encrypt(file);
    
    return {
      ...encryptedData,
      filename: this.encryptFilename(filename),
      originalSize: file.length,
      encryptedSize: encryptedData.data.length,
    };
  }
  
  // Dechiffrer un fichier
  async decryptFile(encryptedFile: EncryptedFile): Promise<Buffer> {
    const decrypted = await this.decrypt(encryptedFile);
    return Buffer.from(decrypted);
  }
  
  // Deriver une clé à partir d'un mot de passe
  private async deriveKey(password: string): Promise<CryptoKey> {
    const encodedPassword = new TextEncoder().encode(password);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encodedPassword,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: this.algorithm, length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  // Générer une clé aléatoire
  private async generateRandomKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: this.algorithm, length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
  
  // Exporter la clé
  async exportKey(): Promise<string> {
    const exported = await crypto.subtle.exportKey('raw', this.key);
    return this.arrayBufferToBase64(exported);
  }
  
  // Importer une clé
  async importKey(base64Key: string): Promise<void> {
    const keyData = this.base64ToArrayBuffer(base64Key);
    this.key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: this.algorithm },
      true,
      ['encrypt', 'decrypt']
    );
  }
  
  // Utilitaires
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    return Buffer.from(buffer).toString('base64');
  }
  
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    return Buffer.from(base64, 'base64');
  }
  
  private encryptFilename(filename: string): string {
    // Simple XOR encryption pour le nom de fichier
    return filename.split('').map(c => 
      String.fromCharCode(c.charCodeAt(0) ^ 0x55)
    ).join('');
  }
}

interface EncryptedData {
  data: string;           // Données chiffrées (base64)
  iv: string;            // Vecteur d'initialisation (base64)
  algorithm: string;     // Algorithme utilisé
  version: number;       // Version du format
}

interface EncryptedFile extends EncryptedData {
  filename: string;      // Nom de fichier chiffré
  originalSize: number;  // Taille originale
  encryptedSize: number; // Taille chiffrée
}
```

---

## 6. Nouveautes a Implémenter

### 🌟 Fonctionnalites Innovantes

#### 6.1.1. Mode Collaboratif

**Nouvelle Fonctionnalite** :

```typescript
// Collaboration en temps reel
class CollaborationManager {
  private websocketServer: WebSocket.Server;
  private activeSessions: Map<string, CollaborationSession> = new Map();
  
  constructor(server: http.Server) {
    this.websocketServer = new WebSocket.Server({ server, path: '/collab' });
    this.setupWebSocket();
  }
  
  private setupWebSocket() {
    this.websocketServer.on('connection', (ws, req) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const notebookId = url.searchParams.get('notebookId');
      const userId = url.searchParams.get('userId');
      
      if (!notebookId || !userId) {
        ws.close(1008, 'Missing parameters');
        return;
      }
      
      this.handleConnection(ws, notebookId, userId);
    });
  }
  
  private handleConnection(ws: WebSocket, notebookId: string, userId: string) {
    // Vérifier l'acces
    if (!accessControl.canAccessNotebook(userId, notebookId, 'write')) {
      ws.close(1008, 'Access denied');
      return;
    }
    
    // Rejoindre la session
    const session = this.getOrCreateSession(notebookId);
    session.addParticipant(userId, ws);
    
    // Envoyer l'état actuel
    this.sendSessionState(ws, session);
    
    // Notifier les autres participants
    this.broadcastParticipantJoined(session, userId);
    
    // Gérer les messages
    ws.on('message', (data) => {
      this.handleMessage(session, userId, data);
    });
    
    ws.on('close', () => {
      session.removeParticipant(userId);
      this.broadcastParticipantLeft(session, userId);
      
      // Fermer la session si vide
      if (session.participants.size === 0) {
        this.activeSessions.delete(notebookId);
      }
    });
  }
  
  private handleMessage(
    session: CollaborationSession,
    userId: string,
    data: WebSocket.RawData
  ) {
    try {
      const message = JSON.parse(data.toString()) as CollaborationMessage;
      
      // Appliquer les changements
      this.applyChange(session, userId, message);
      
      // Broadcast aux autres participants
      this.broadcastMessage(session, userId, message);
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }
  
  private applyChange(
    session: CollaborationSession,
    userId: string,
    message: CollaborationMessage
  ) {
    const notebook = notebookManager.getNotebook(session.notebookId);
    if (!notebook) return;
    
    switch (message.type) {
      case 'chat_message':
        notebookManager.addChatMessage(session.notebookId, {
          id: message.id,
          role: message.role,
          content: message.content,
          citations: message.citations || [],
          timestamp: new Date().toISOString(),
          author: userId,
        });
        break;
        
      case 'note_update':
        notebookManager.updateNote(
          session.notebookId,
          message.noteId,
          { content: message.content }
        );
        break;
        
      case 'source_add':
        notebookManager.addSource(session.notebookId, message.source);
        break;
        
      case 'cursor_position':
        // Mettre à jour la position du curseur
        session.updateCursor(userId, message.position);
        break;
        
      case 'selection':
        // Mettre à jour la selection
        session.updateSelection(userId, message.selection);
        break;
    }
    
    // Sauvegarder les changements
    notebookManager.persistNotebook(session.notebookId);
  }
}

interface CollaborationSession {
  id: string;
  notebookId: string;
  participants: Map<string, WebSocket>;
  cursors: Map<string, { position: number; timestamp: number }>;
  selections: Map<string, { start: number; end: number; timestamp: number }>;
  
  addParticipant(userId: string, ws: WebSocket): void;
  removeParticipant(userId: string): void;
  updateCursor(userId: string, position: number): void;
  updateSelection(userId: string, selection: { start: number; end: number }): void;
}

type CollaborationMessageType = 
  | 'chat_message'
  | 'note_update'
  | 'source_add'
  | 'source_remove'
  | 'cursor_position'
  | 'selection'
  | 'presence';

interface CollaborationMessage {
  type: CollaborationMessageType;
  id: string;
  timestamp: number;
  userId: string;
  // Type-specific fields
  role?: 'user' | 'assistant';
  content?: string;
  citations?: Citation[];
  noteId?: string;
  source?: Source;
  position?: number;
  selection?: { start: number; end: number };
}
```

**UI pour la Collaboration** :

```tsx
// Nouveau composant CollaborativeNotebook.tsx
const CollaborativeNotebook = ({ notebookId }) => {
  const [session, setSession] = useState<CollaborationSession | null>(null);
  const [participants, setParticipants] = useState<Map<string, ParticipantInfo>>(new Map());
  const [cursors, setCursors] = useState<Map<string, CursorInfo>>(new Map());
  const [selections, setSelections] = useState<Map<string, SelectionInfo>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  
  // Connexion WebSocket
  useEffect(() => {
    const ws = new WebSocket(`/collab?notebookId=${notebookId}&userId=${user.id}`);
    
    ws.onopen = () => setIsConnected(true);
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as CollaborationEvent;
      this.handleCollaborationEvent(message);
    };
    
    ws.onclose = () => setIsConnected(false);
    
    return () => ws.close();
  }, [notebookId]);
  
  const handleCollaborationEvent = (event: CollaborationEvent) => {
    switch (event.type) {
      case 'session_state':
        setSession(event.session);
        setParticipants(new Map(Object.entries(event.participants)));
        break;
        
      case 'participant_joined':
        setParticipants(prev => new Map(prev).set(event.userId, event.participant)));
        break;
        
      case 'participant_left':
        setParticipants(prev => {
          const newMap = new Map(prev);
          newMap.delete(event.userId);
          return newMap;
        });
        setCursors(prev => {
          const newMap = new Map(prev);
          newMap.delete(event.userId);
          return newMap;
        });
        break;
        
      case 'cursor_update':
        setCursors(prev => new Map(prev).set(event.userId, event.cursor));
        break;
        
      case 'selection_update':
        setSelections(prev => new Map(prev).set(event.userId, event.selection));
        break;
        
      case 'message':
        // Appliquer le changement localement
        this.applyRemoteChange(event.message);
        break;
    }
  };
  
  const sendMessage = (message: CollaborationMessage) => {
    const ws = this.getWebSocket();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };
  
  const sendCursorPosition = (position: number) => {
    this.sendMessage({
      type: 'cursor_position',
      id: `cursor-${Date.now()}`,
      userId: user.id,
      timestamp: Date.now(),
      position,
    });
  };
  
  // Affichage des curseurs des autres participants
  const renderCollaborationOverlays = () => {
    return Array.from(cursors.entries()).map(([userId, cursor]) => (
      <CollaborationCursor
        key={userId}
        userId={userId}
        position={cursor.position}
        color={getUserColor(userId)}
        name={participants.get(userId)?.name || 'Anonyme'}
      />
    ));
  };
  
  // Affichage des selections
  const renderCollaborationSelections = () => {
    return Array.from(selections.entries()).map(([userId, selection]) => (
      <CollaborationSelection
        key={userId}
        userId={userId}
        selection={selection}
        color={getUserColor(userId)}
        name={participants.get(userId)?.name || 'Anonyme'}
      />
    ));
  };
  
  return (
    <div className="collaborative-notebook">
      {/* Indicateur de collaboration */}
      {participants.size > 1 && (
        <CollaborationIndicator
          participants={Array.from(participants.values())}
          isConnected={isConnected}
        />
      )}
      
      {/* Contenu du notebook */}
      <div className="notebook-content">
        {renderCollaborationOverlays()}
        {renderCollaborationSelections()}
        
        <NotebookDetail
          notebookId={notebookId}
          onCursorChange={sendCursorPosition}
          onSelectionChange={(selection) => {
            this.sendMessage({
              type: 'selection',
              id: `selection-${Date.now()}`,
              userId: user.id,
              timestamp: Date.now(),
              selection,
            });
          }}
        />
      </div>
      
      {/* Panneau des participants */}
      <CollaborationSidebar
        participants={Array.from(participants.values())}
        cursors={cursors}
      />
    </div>
  );
};

// Composant pour afficher le curseur d'un autre participant
const CollaborationCursor = ({ userId, position, color, name }) => {
  return (
    <motion.div
      className="collaboration-cursor"
      initial={{ opacity: 0, transform: 'translateY(-10px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      exit={{ opacity: 0 }}
      style={{
        left: position.x,
        top: position.y,
        '--cursor-color': color,
      }}
    >
      <svg 
        className="cursor-svg"
        viewBox="0 0 24 36"
        fill="none"
        stroke="var(--cursor-color)"
        strokeWidth="2"
      >
        <path d="M12 2L14 8H18L13 14L14 20H12L8 8H12Z" />
      </svg>
      <span className="cursor-label" style={{ backgroundColor: color }}>
        {name}
      </span>
    </motion.div>
  );
};

// Composant pour afficher la selection d'un autre participant
const CollaborationSelection = ({ userId, selection, color, name }) => {
  const rect = this.calculateSelectionRect(selection);
  
  return (
    <motion.div
      className="collaboration-selection"
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.3 }}
      exit={{ opacity: 0 }}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        backgroundColor: color,
      }}
    />
  );
};

// Indicateur de collaboration
const CollaborationIndicator = ({ participants, isConnected }) => {
  return (
    <div className="collaboration-indicator">
      <div className="collaboration-avatars">
        {participants.slice(0, 3).map(participant => (
          <Avatar
            key={participant.userId}
            user={participant}
            size="xs"
          />
        ))}
        {participants.length > 3 && (
          <span className="collaboration-count">+{participants.length - 3}</span>
        )}
      </div>
      <span className="collaboration-status">
        {isConnected 
          ? `${participants.length} participant${participants.length > 1 ? 's' : ''} en ligne`
          : 'Déconnecté'}
      </span>
    </div>
  );
};
```

#### 6.1.2. Versioning des Notebooks

**Nouvelle Fonctionnalite** :

```typescript
// VersionControl.ts
class NotebookVersionControl {
  private versionStore: Map<string, NotebookVersion[]> = new Map();
  private currentVersions: Map<string, string> = new Map(); // notebookId -> versionId
  
  constructor() {
    this.loadVersions();
  }
  
  // Creer une nouvelle version
  createVersion(notebookId: string, message?: string): string {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) {
      throw new Error('Notebook introuvable');
    }
    
    const versionId = `v${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const version: NotebookVersion = {
      id: versionId,
      notebookId,
      data: this.deepClone(notebook),
      createdAt: new Date().toISOString(),
      createdBy: 'system', // A remplacer par userId
      message: message || `Version automatique ${versionId}`,
      parentId: this.currentVersions.get(notebookId) || null,
      tags: [],
    };
    
    // Sauvegarder la version
    this.saveVersion(version);
    
    // Mettre à jour la version courante
    this.currentVersions.set(notebookId, versionId);
    
    return versionId;
  }
  
  // Restorer une version
  restoreVersion(notebookId: string, versionId: string): boolean {
    const version = this.getVersion(notebookId, versionId);
    if (!version) return false;
    
    const notebook = version.data;
    notebook.id = notebookId; // S'assurer que l'ID est correct
    notebook.updatedAt = new Date().toISOString();
    
    // Remplacer le notebook courant
    notebookManager.notebooks.set(notebookId, notebook);
    notebookManager.persist(notebook);
    
    // Mettre à jour la version courante
    this.currentVersions.set(notebookId, versionId);
    
    return true;
  }
  
  // Lister les versions d'un notebook
  getVersions(notebookId: string): NotebookVersion[] {
    return this.versionStore.get(notebookId) || [];
  }
  
  // Comparer deux versions
  compareVersions(
    notebookId: string,
    versionId1: string,
    versionId2: string
  ): VersionDiff {
    const version1 = this.getVersion(notebookId, versionId1);
    const version2 = this.getVersion(notebookId, versionId2);
    
    if (!version1 || !version2) {
      throw new Error('Version introuvable');
    }
    
    return this.diffVersions(version1.data, version2.data);
  }
  
  // Diff entre deux versions
  private diffVersions(oldVersion: Notebook, newVersion: Notebook): VersionDiff {
    const diff: VersionDiff = {
      notebook: {},
      sources: {
        added: [],
        removed: [],
        modified: [],
      },
      notes: {
        added: [],
        removed: [],
        modified: [],
      },
      // ... autres champs
    };
    
    // Comparer les champs principaux
    if (oldVersion.title !== newVersion.title) {
      diff.notebook.title = {
        old: oldVersion.title,
        new: newVersion.title,
      };
    }
    
    if (oldVersion.description !== newVersion.description) {
      diff.notebook.description = {
        old: oldVersion.description,
        new: newVersion.description,
      };
    }
    
    // Comparer les sources
    const oldSourceIds = new Set(oldVersion.sources.map(s => s.id));
    const newSourceIds = new Set(newVersion.sources.map(s => s.id));
    
    // Sources ajoutees
    for (const source of newVersion.sources) {
      if (!oldSourceIds.has(source.id)) {
        diff.sources.added.push(source);
      }
    }
    
    // Sources supprimees
    for (const source of oldVersion.sources) {
      if (!newSourceIds.has(source.id)) {
        diff.sources.removed.push(source);
      }
    }
    
    // Sources modifiees
    for (const newSource of newVersion.sources) {
      const oldSource = oldVersion.sources.find(s => s.id === newSource.id);
      if (oldSource && JSON.stringify(oldSource) !== JSON.stringify(newSource)) {
        diff.sources.modified.push({
          id: newSource.id,
          changes: this.diffObjects(oldSource, newSource),
        });
      }
    }
    
    // Comparaison similaire pour les notes, documents, etc.
    
    return diff;
  }
  
  // Auto-save des versions
  startAutoVersioning(interval: number = 30 * 60 * 1000): void {
    setInterval(() => {
      // Creer une version pour chaque notebook non sauvegardé
      for (const notebook of notebookManager.getAllNotebooks()) {
        if (this.hasUnsavedChanges(notebook.id)) {
          this.createVersion(notebook.id, 'Auto-save');
        }
      }
    }, interval);
  }
  
  private hasUnsavedChanges(notebookId: string): boolean {
    const currentVersionId = this.currentVersions.get(notebookId);
    if (!currentVersionId) return true; // Pas de version, donc non sauvegardé
    
    const currentVersion = this.getVersion(notebookId, currentVersionId);
    if (!currentVersion) return true;
    
    const currentNotebook = notebookManager.getNotebook(notebookId);
    if (!currentNotebook) return false;
    
    // Comparer rapidement
    return JSON.stringify(currentVersion.data) !== JSON.stringify(currentNotebook);
  }
  
  // Sauvegarder une version sur disque
  private saveVersion(version: NotebookVersion): void {
    if (!this.versionStore.has(version.notebookId)) {
      this.versionStore.set(version.notebookId, []);
    }
    
    const versions = this.versionStore.get(version.notebookId)!;
    versions.push(version);
    
    // Limiter à 100 versions par notebook
    if (versions.length > 100) {
      versions.shift();
    }
    
    // Sauvegarder sur disque
    this.persistVersion(version);
  }
}

interface NotebookVersion {
  id: string;
  notebookId: string;
  data: Notebook;
  createdAt: string;
  createdBy: string;
  message: string;
  parentId: string | null;
  tags: string[];
}

interface VersionDiff {
  notebook: Record<string, { old: any; new: any }>;
  sources: {
    added: Source[];
    removed: Source[];
    modified: { id: string; changes: Record<string, { old: any; new: any }> }[];
  };
  notes: {
    added: NotebookNote[];
    removed: NotebookNote[];
    modified: { id: string; changes: Record<string, { old: any; new: any }> }[];
  };
  generatedDocuments: {
    added: GeneratedDocument[];
    removed: GeneratedDocument[];
    modified: { id: string; changes: Record<string, { old: any; new: any }> }[];
  };
  chatHistory: {
    added: ChatMessage[];
    removed: ChatMessage[];
  };
}
```

**Nouveaux Endpoints** :
```typescript
// GET /api/notebooks/:id/versions                    // Lister les versions
// POST /api/notebooks/:id/versions                  // Creer une version manuelle
// GET /api/notebooks/:id/versions/:versionId        // Obtenir une version
// POST /api/notebooks/:id/versions/:versionId/restore // Restorer une version
// DELETE /api/notebooks/:id/versions/:versionId    // Supprimer une version
// GET /api/notebooks/:id/versions/:versionId1/../versions/:versionId2/diff // Comparer deux versions
```

#### 6.1.3. Integration avec des Outils Externes

**Nouvelle Fonctionnalite** :

```typescript
// Integrations.ts
class ExternalIntegrations {
  private integrations: Map<string, Integration> = new Map();
  
  constructor() {
    this.registerIntegrations();
  }
  
  private registerIntegrations() {
    // Notion
    this.integrations.set('notion', {
      name: 'Notion',
      icon: 'notion',
      enabled: true,
      auth: {
        type: 'oauth2',
        clientId: process.env.NOTION_CLIENT_ID,
        clientSecret: process.env.NOTION_CLIENT_SECRET,
        scopes: ['read:pages', 'write:pages'],
      },
      actions: {
        import: this.importFromNotion,
        export: this.exportToNotion,
        sync: this.syncWithNotion,
      },
    });
    
    // Google Drive
    this.integrations.set('google-drive', {
      name: 'Google Drive',
      icon: 'google-drive',
      enabled: true,
      auth: {
        type: 'oauth2',
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        scopes: ['https://www.googleapis.com/auth/drive.readonly',
                 'https://www.googleapis.com/auth/drive.file'],
      },
      actions: {
        import: this.importFromGoogleDrive,
        export: this.exportToGoogleDrive,
        sync: this.syncWithGoogleDrive,
      },
    });
    
    // GitHub
    this.integrations.set('github', {
      name: 'GitHub',
      icon: 'github',
      enabled: true,
      auth: {
        type: 'oauth2',
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        scopes: ['repo', 'read:org'],
      },
      actions: {
        import: this.importFromGitHub,
        export: this.exportToGitHub,
      },
    });
    
    // ArXiv
    this.integrations.set('arxiv', {
      name: 'arXiv',
      icon: 'arxiv',
      enabled: true,
      auth: { type: 'none' },
      actions: {
        import: this.importFromArXiv,
      },
    });
    
    // Wikipedia
    this.integrations.set('wikipedia', {
      name: 'Wikipedia',
      icon: 'wikipedia',
      enabled: true,
      auth: { type: 'none' },
      actions: {
        import: this.importFromWikipedia,
      },
    });
    
    // YouTube
    this.integrations.set('youtube', {
      name: 'YouTube',
      icon: 'youtube',
      enabled: true,
      auth: {
        type: 'api-key',
        key: process.env.YOUTUBE_API_KEY,
      },
      actions: {
        import: this.importFromYouTube,
      },
    });
  }
  
  // Lister les integrations disponibles
  getAvailableIntegrations(): Integration[] {
    return Array.from(this.integrations.values())
      .filter(i => i.enabled)
      .map(i => ({
        ...i,
        connected: this.isConnected(i.name),
      }));
  }
  
  // Connecter une integration
  async connect(integrationName: string, authCode?: string): Promise<boolean> {
    const integration = this.integrations.get(integrationName);
    if (!integration) return false;
    
    try {
      if (integration.auth.type === 'oauth2') {
        await this.authenticateOAuth2(integration, authCode);
      }
      
      integration.connected = true;
      return true;
    } catch (error) {
      console.error(`Erreur de connexion à ${integrationName}:`, error);
      return false;
    }
  }
  
  // Importer depuis une integration
  async import(
    integrationName: string,
    resourceId: string,
    options?: ImportOptions
  ): Promise<ImportResult> {
    const integration = this.integrations.get(integrationName);
    if (!integration || !integration.actions.import) return null;
    
    return integration.actions.import(resourceId, options);
  }
  
  // Exporter vers une integration
  async export(
    integrationName: string,
    notebookId: string,
    options?: ExportOptions
  ): Promise<ExportResult> {
    const integration = this.integrations.get(integrationName);
    if (!integration || !integration.actions.export) return null;
    
    return integration.actions.export(notebookId, options);
  }
  
  // Synchronisation
  async sync(
    integrationName: string,
    notebookId: string,
    options?: SyncOptions
  ): Promise<SyncResult> {
    const integration = this.integrations.get(integrationName);
    if (!integration || !integration.actions.sync) return null;
    
    return integration.actions.sync(notebookId, options);
  }
  
  // Importer depuis Notion
  private async importFromNotion(
    pageId: string,
    options?: ImportOptions
  ): Promise<ImportResult> {
    const page = await this.fetchNotionPage(pageId);
    
    const source: Source = {
      id: `notion-${pageId}`,
      notebookId: options?.notebookId || '',
      title: page.properties.Name?.title?.[0]?.plain_text || 'Notion Page',
      type: 'notion',
      origin: `https://notion.so/${pageId}`,
      rawText: this.extractNotionContent(page),
      summary: page.properties.Summary?.rich_text?.[0]?.plain_text || '',
      keywords: page.properties.Tags?.multi_select?.map(t => t.name) || [],
      chunks: [],
      wordCount: this.countWords(this.extractNotionContent(page)),
      language: 'fr',
      addedAt: new Date().toISOString(),
      originalSize: 0,
    };
    
    // Ajouter au notebook
    if (options?.notebookId) {
      notebookManager.addSource(options.notebookId, source);
    }
    
    return {
      success: true,
      source,
      type: 'page',
      name: source.title,
    };
  }
  
  // Importer depuis arXiv
  private async importFromArXiv(paperId: string): Promise<ImportResult> {
    const paper = await this.fetchArXivPaper(paperId);
    
    const source: Source = {
      id: `arxiv-${paperId}`,
      notebookId: '',
      title: paper.title,
      type: 'arxiv',
      origin: `https://arxiv.org/abs/${paperId}`,
      rawText: paper.abstract + '\n\n' + paper.fullText,
      summary: paper.abstract,
      keywords: paper.tags || [],
      chunks: [],
      wordCount: this.countWords(paper.abstract + paper.fullText),
      language: 'en',
      addedAt: new Date().toISOString(),
      originalSize: paper.pdfSize || 0,
    };
    
    return {
      success: true,
      source,
      type: 'paper',
      name: paper.title,
      metadata: {
        authors: paper.authors,
        publishedAt: paper.publishedAt,
        doi: paper.doi,
      },
    };
  }
  
  // Importer depuis Wikipedia
  private async importFromWikipedia(pageTitle: string): Promise<ImportResult> {
    const page = await this.fetchWikipediaPage(pageTitle);
    
    const source: Source = {
      id: `wikipedia-${page.pageid}`,
      notebookId: '',
      title: page.title,
      type: 'wikipedia',
      origin: `https://fr.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`,
      rawText: page.extract,
      rawHtml: page.html,
      summary: page.description,
      keywords: page.categories || [],
      chunks: [],
      wordCount: this.countWords(page.extract),
      language: page.lang || 'fr',
      addedAt: new Date().toISOString(),
      originalSize: 0,
    };
    
    return {
      success: true,
      source,
      type: 'article',
      name: page.title,
      metadata: {
        categories: page.categories,
        links: page.links,
      },
    };
  }
  
  // Importer depuis YouTube
  private async importFromYouTube(videoId: string): Promise<ImportResult> {
    const transcript = await this.fetchYouTubeTranscript(videoId);
    const videoInfo = await this.fetchYouTubeVideoInfo(videoId);
    
    const source: Source = {
      id: `youtube-${videoId}`,
      notebookId: '',
      title: videoInfo.title,
      type: 'youtube',
      origin: `https://youtu.be/${videoId}`,
      rawText: transcript,
      summary: videoInfo.description || '',
      keywords: videoInfo.tags || [],
      chunks: [],
      wordCount: this.countWords(transcript),
      language: videoInfo.language || 'en',
      addedAt: new Date().toISOString(),
      originalSize: 0,
      metadata: {
        duration: videoInfo.duration,
        publishedAt: videoInfo.publishedAt,
        channel: videoInfo.channel,
      },
    };
    
    return {
      success: true,
      source,
      type: 'video',
      name: videoInfo.title,
      metadata: {
        duration: videoInfo.duration,
        thumbnail: videoInfo.thumbnail,
      },
    };
  }
}

interface Integration {
  name: string;
  icon: string;
  enabled: boolean;
  connected?: boolean;
  auth: {
    type: 'none' | 'api-key' | 'oauth2';
    clientId?: string;
    clientSecret?: string;
    key?: string;
    scopes?: string[];
  };
  actions: {
    import?: (resourceId: string, options?: ImportOptions) => Promise<ImportResult>;
    export?: (notebookId: string, options?: ExportOptions) => Promise<ExportResult>;
    sync?: (notebookId: string, options?: SyncOptions) => Promise<SyncResult>;
  };
}

interface ImportOptions {
  notebookId?: string;
  asType?: SourceType;
  include?: string[];
  exclude?: string[];
}

interface ImportResult {
  success: boolean;
  source?: Source;
  type?: string;
  name?: string;
  metadata?: Record<string, any>;
  error?: string;
}

interface ExportOptions {
  format?: 'markdown' | 'pdf' | 'html' | 'notion';
  include?: string[];
  folderId?: string;
}

interface ExportResult {
  success: boolean;
  url?: string;
  fileId?: string;
  error?: string;
}

interface SyncOptions {
  direction?: 'import' | 'export' | 'both';
  interval?: number; // En heures
}

interface SyncResult {
  success: boolean;
  imported?: Source[];
  exported?: string[];
  conflicts?: any[];
  error?: string;
}
```

**Nouveaux Endpoints** :
```typescript
// GET /api/integrations                          // Lister les integrations
// GET /api/integrations/:name/auth              // URL pour l'authentification OAuth
// POST /api/integrations/:name/connect           // Connecter avec code OAuth
// POST /api/integrations/:name/disconnect        // Deconnecter
// POST /api/integrations/:name/import            // Importer depuis
// POST /api/integrations/:name/export            // Exporter vers
// POST /api/integrations/:name/sync              // Synchroniser
```

#### 6.1.4. Systeme de Plugins

**Nouvelle Fonctionnalite** :

```typescript
// PluginManager.ts
class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private pluginDir: string;
  
  constructor() {
    this.pluginDir = path.join(
      process.env.JARVIS_CONFIG_PATH || process.cwd(),
      '.jarvis',
      'plugins'
    );
    this.ensurePluginDir();
    this.loadPlugins();
  }
  
  private ensurePluginDir() {
    if (!fs.existsSync(this.pluginDir)) {
      fs.mkdirSync(this.pluginDir, { recursive: true });
    }
  }
  
  private loadPlugins() {
    try {
      const files = fs.readdirSync(this.pluginDir);
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          this.loadPlugin(file);
        }
      }
    } catch (error) {
      console.error('Erreur de chargement des plugins:', error);
    }
  }
  
  private loadPlugin(filename: string) {
    try {
      const filePath = path.join(this.pluginDir, filename);
      const plugin = require(filePath);
      
      if (this.isValidPlugin(plugin)) {
        this.plugins.set(plugin.name, plugin);
        console.log(`Plugin chargé: ${plugin.name} v${plugin.version}`);
      }
    } catch (error) {
      console.error(`Erreur de chargement du plugin ${filename}:`, error);
    }
  }
  
  private isValidPlugin(plugin: any): plugin is Plugin {
    return plugin &&
      typeof plugin.name === 'string' &&
      typeof plugin.version === 'string' &&
      typeof plugin.description === 'string' &&
      typeof plugin.author === 'string' &&
      Array.isArray(plugin.features) &&
      typeof plugin.initialize === 'function' &&
      typeof plugin.execute === 'function';
  }
  
  // Lister les plugins disponibles
  getAvailablePlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      version: p.version,
      description: p.description,
      author: p.author,
      features: p.features,
      enabled: this.loadedPlugins.has(p.name),
    }));
  }
  
  // Charger un plugin
  loadPlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    
    try {
      plugin.initialize();
      this.loadedPlugins.set(name, {
        plugin,
        loadedAt: new Date(),
        status: 'loaded',
      });
      return true;
    } catch (error) {
      this.loadedPlugins.set(name, {
        plugin,
        loadedAt: new Date(),
        status: 'error',
        error: error.message,
      });
      return false;
    }
  }
  
  // Desactiver un plugin
  unloadPlugin(name: string): boolean {
    const loaded = this.loadedPlugins.get(name);
    if (!loaded) return false;
    
    try {
      if (loaded.plugin.cleanup) {
        loaded.plugin.cleanup();
      }
      this.loadedPlugins.delete(name);
      return true;
    } catch (error) {
      console.error(`Erreur de desactivation du plugin ${name}:`, error);
      return false;
    }
  }
  
  // Executer un plugin
  async executePlugin(
    name: string,
    action: string,
    params?: Record<string, any>
  ): Promise<PluginResult> {
    const loaded = this.loadedPlugins.get(name);
    if (!loaded || loaded.status !== 'loaded') {
      return { success: false, error: 'Plugin non chargé' };
    }
    
    try {
      const result = await loaded.plugin.execute(action, params);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // Installer un plugin depuis un fichier
  async installPlugin(filePath: string): Promise<boolean> {
    try {
      const destination = path.join(this.pluginDir, path.basename(filePath));
      await fs.promises.copyFile(filePath, destination);
      this.loadPlugin(path.basename(filePath));
      return true;
    } catch (error) {
      console.error('Erreur d\'installation du plugin:', error);
      return false;
    }
  }
  
  // Desinstaller un plugin
  async uninstallPlugin(name: string): Promise<boolean> {
    try {
      this.unloadPlugin(name);
      this.plugins.delete(name);
      
      const pluginFile = path.join(this.pluginDir, `${name}.js`);
      if (fs.existsSync(pluginFile)) {
        await fs.promises.unlink(pluginFile);
      }
      
      const pluginTsFile = path.join(this.pluginDir, `${name}.ts`);
      if (fs.existsSync(pluginTsFile)) {
        await fs.promises.unlink(pluginTsFile);
      }
      
      return true;
    } catch (error) {
      console.error(`Erreur de desinstallation du plugin ${name}:`, error);
      return false;
    }
  }
}

interface Plugin {
  name: string;
  version: string;
  description: string;
  author: string;
  features: PluginFeature[];
  
  initialize(): void | Promise<void>;
  execute(action: string, params?: Record<string, any>): any | Promise<any>;
  cleanup?(): void | Promise<void>;
}

type PluginFeature = 
  | 'source-importer'
  | 'content-generator'
  | 'chat-enhancer'
  | 'analyzer'
  | 'exporter'
  | 'ui-component'
  | 'api-endpoint';

interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  features: PluginFeature[];
  enabled: boolean;
}

interface LoadedPlugin {
  plugin: Plugin;
  loadedAt: Date;
  status: 'loaded' | 'error';
  error?: string;
}

interface PluginResult {
  success: boolean;
  result?: any;
  error?: string;
}
```

**Exemple de Plugin** :

```typescript
// Exemple: Plugin pour importer depuis Twitter (X)
module.exports = {
  name: 'twitter-importer',
  version: '1.0.0',
  description: 'Importer des tweets et threads depuis Twitter',
  author: 'Jarvis Team',
  features: ['source-importer'],
  
  initialize() {
    console.log('Twitter Importer Plugin initialisé');
  },
  
  async execute(action, params) {
    switch (action) {
      case 'import-tweet':
        return this.importTweet(params.tweetId);
      
      case 'import-thread':
        return this.importThread(params.tweetId);
      
      case 'search-tweets':
        return this.searchTweets(params.query, params.options);
      
      default:
        throw new Error(`Action inconnue: ${action}`);
    }
  },
  
  cleanup() {
    console.log('Twitter Importer Plugin nettoyé');
  },
  
  async importTweet(tweetId: string) {
    const tweet = await this.fetchTweet(tweetId);
    
    return {
      source: {
        id: `twitter-${tweetId}`,
        type: 'twitter',
        title: `Tweet de @${tweet.author.screen_name}`,
        origin: `https://twitter.com/${tweet.author.screen_name}/status/${tweetId}`,
        rawText: tweet.text,
        summary: tweet.text.substring(0, 200),
        keywords: this.extractHashtags(tweet.text),
        metadata: {
          author: tweet.author,
          likes: tweet.likes,
          retweets: tweet.retweets,
          replies: tweet.replies,
          createdAt: tweet.created_at,
        },
      },
    };
  },
  
  async importThread(tweetId: string) {
    const thread = await this.fetchThread(tweetId);
    
    // Combiner tous les tweets du thread
    const combinedText = thread.map(t => t.text).join('\n\n---\n\n');
    
    return {
      source: {
        id: `twitter-thread-${tweetId}`,
        type: 'twitter',
        title: `Thread Twitter: ${thread[0].text.substring(0, 50)}...`,
        origin: `https://twitter.com/${thread[0].author.screen_name}/status/${tweetId}`,
        rawText: combinedText,
        summary: thread[0].text,
        keywords: this.extractHashtags(combinedText),
        metadata: {
          author: thread[0].author,
          tweetCount: thread.length,
          createdAt: thread[0].created_at,
          lastTweetAt: thread[thread.length - 1].created_at,
        },
      },
    };
  },
  
  async searchTweets(query: string, options: { limit?: number; since?: string }) {
    const tweets = await this.searchTweetsApi(query, options);
    
    return tweets.map(tweet => ({
      source: {
        id: `twitter-${tweet.id_str}`,
        type: 'twitter',
        title: `Tweet de @${tweet.user.screen_name}`,
        origin: `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
        rawText: tweet.text,
        summary: tweet.text.substring(0, 200),
        keywords: this.extractHashtags(tweet.text),
        metadata: {
          author: tweet.user,
          likes: tweet.favorite_count,
          retweets: tweet.retweet_count,
          createdAt: tweet.created_at,
        },
      },
    }));
  },
  
  private extractHashtags(text: string): string[] {
    return text.match(/#\w+/g) || [];
  },
  
  private async fetchTweet(tweetId: string) {
    // Appel à l'API Twitter
    // ... implementation
  },
  
  private async fetchThread(tweetId: string) {
    // Appel à l'API Twitter pour recuperer tout le thread
    // ... implementation
  },
  
  private async searchTweetsApi(query: string, options: any) {
    // Recherche via l'API Twitter
    // ... implementation
  },
};
```

**Nouveaux Endpoints** :
```typescript
// GET /api/plugins                              // Lister les plugins
// POST /api/plugins/:name/load                 // Charger un plugin
// POST /api/plugins/:name/unload               // Decharger un plugin
// POST /api/plugins/install                     // Installer un plugin
// POST /api/plugins/:name/uninstall           // Desinstaller un plugin
// POST /api/plugins/:name/execute              // Executer un plugin
```

#### 6.1.5. AI Personnalisee

**Nouvelle Fonctionnalite** :

```typescript
// AIPersona.ts
class AIPersonaManager {
  private personas: Map<string, AIPersona> = new Map();
  private currentPersona: string | null = null;
  
  constructor() {
    this.loadDefaultPersonas();
    this.loadUserPersonas();
  }
  
  private loadDefaultPersonas() {
    const defaults: AIPersona[] = [
      {
        id: 'default',
        name: 'Assistant par défaut',
        description: 'Assistant généraliste pour toutes les tâches',
        systemPrompt: GROUNDED_SYSTEM_PROMPT,
        temperature: 0.4,
        maxOutputTokens: 4096,
        capabilities: ['chat', 'summarize', 'answer-questions', 'generate-content'],
        limitations: [],
        voice: 'neutral',
        avatar: '🤖',
        color: '#3b82f6',
        isDefault: true,
      },
      {
        id: 'expert-technique',
        name: 'Expert Technique',
        description: 'Spécialisé dans les questions techniques et le développement',
        systemPrompt: `Tu es un expert technique senior. Tu réponds aux questions de développement,
        d'architecture et de technologie avec précision. Utilise un langage technique
        et fournis des exemples de code lorsque c'est pertinent.`,
        temperature: 0.3,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'code-review', 'architecture-design', 'debugging'],
        limitations: ['non-creative', 'technical-only'],
        voice: 'technical',
        avatar: '👨‍💻',
        color: '#8b5cf6',
        isDefault: false,
      },
      {
        id: 'business-analyst',
        name: 'Analyste Business',
        description: 'Expert en analyse business, stratégie et gestion de projet',
        systemPrompt: `Tu es un analyste business expérimenté. Tu excelles dans l'analyse de données,
        la création de rapports, l'identification de tendances et la formulation de
        recommandations stratégiques.`,
        temperature: 0.4,
        maxOutputTokens: 6000,
        capabilities: ['chat', 'data-analysis', 'report-writing', 'strategy'],
        limitations: ['business-context-only'],
        voice: 'professional',
        avatar: '👔',
        color: '#06b6d4',
        isDefault: false,
      },
      {
        id: 'creative-writer',
        name: 'Écrivain Créatif',
        description: 'Spécialisé dans la création de contenu créatif et engageant',
        systemPrompt: `Tu es un écrivain créatif et talentueux. Tu excelles dans la création de
        contenu engageant, d'histoires captivantes et de textes persuasifs.`,
        temperature: 0.8,
        maxOutputTokens: 4096,
        capabilities: ['chat', 'story-writing', 'content-creation', 'copywriting'],
        limitations: ['creative-only'],
        voice: 'creative',
        avatar: '✍️',
        color: '#f59e0b',
        isDefault: false,
      },
      {
        id: 'educator',
        name: 'Pédagogue',
        description: 'Expert dans l\'explication de concepts complexes de manière simple',
        systemPrompt: `Tu es un excellent pédagogue. Tu expliques les concepts complexes de manière
        claire et accessible, avec des exemples concrets et des analogies utiles.`,
        temperature: 0.4,
        maxOutputTokens: 5000,
        capabilities: ['chat', 'teaching', 'explaining', 'tutoring'],
        limitations: ['educational-context'],
        voice: 'patient',
        avatar: '👩‍🏫',
        color: '#10b981',
        isDefault: false,
      },
    ];
    
    for (const persona of defaults) {
      this.personas.set(persona.id, persona);
    }
  }
  
  // Creer une persona personnalisée
  createPersona(persona: Partial<AIPersona> & { name: string }): AIPersona {
    const id = `custom-${Date.now()}`;
    const newPersona: AIPersona = {
      id,
      name: persona.name,
      description: persona.description || '',
      systemPrompt: persona.systemPrompt || GROUNDED_SYSTEM_PROMPT,
      temperature: persona.temperature || 0.4,
      maxOutputTokens: persona.maxOutputTokens || 4096,
      capabilities: persona.capabilities || [],
      limitations: persona.limitations || [],
      voice: persona.voice || 'neutral',
      avatar: persona.avatar || '🤖',
      color: persona.color || '#3b82f6',
      isDefault: false,
      createdAt: new Date().toISOString(),
      createdBy: 'user',
    };
    
    this.personas.set(id, newPersona);
    this.saveUserPersona(newPersona);
    
    return newPersona;
  }
  
  // Mettre à jour une persona
  updatePersona(id: string, updates: Partial<AIPersona>): boolean {
    const persona = this.personas.get(id);
    if (!persona || persona.isDefault) return false;
    
    const updatedPersona = { ...persona, ...updates };
    this.personas.set(id, updatedPersona);
    this.saveUserPersona(updatedPersona);
    
    return true;
  }
  
  // Supprimer une persona
  deletePersona(id: string): boolean {
    const persona = this.personas.get(id);
    if (!persona || persona.isDefault) return false;
    
    this.personas.delete(id);
    this.deleteUserPersona(id);
    
    // Changer de persona si c'était la persona courante
    if (this.currentPersona === id) {
      this.currentPersona = null;
    }
    
    return true;
  }
  
  // Selectionner une persona
  selectPersona(id: string): boolean {
    if (this.personas.has(id)) {
      this.currentPersona = id;
      return true;
    }
    return false;
  }
  
  // Obtenir la persona courante
  getCurrentPersona(): AIPersona | null {
    if (!this.currentPersona) {
      return this.personas.get('default') || null;
    }
    return this.personas.get(this.currentPersona) || null;
  }
  
  // Obtenir une persona par ID
  getPersona(id: string): AIPersona | null {
    return this.personas.get(id) || null;
  }
  
  // Lister toutes les personas
  getAllPersonas(): AIPersona[] {
    return Array.from(this.personas.values());
  }
  
  // Générer une réponse avec une persona spécifique
  async generateResponse(
    query: string,
    context: string,
    personaId?: string
  ): Promise<string> {
    const persona = personaId 
      ? this.personas.get(personaId)
      : this.getCurrentPersona();
    
    if (!persona) {
      throw new Error('Persona introuvable');
    }
    
    const fullPrompt = `${persona.systemPrompt}

═══ CONTEXTE ═══

${context}

═══ QUESTION ═══

${query}

Réponds en adoptant le style et l'expertise de ${persona.name}.`;
    
    const result = await generateText({
      prompt: fullPrompt,
      temperature: persona.temperature,
      maxOutputTokens: persona.maxOutputTokens,
    });
    
    return result.text;
  }
}

interface AIPersona {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  temperature: number;           // 0-1
  maxOutputTokens: number;
  capabilities: AICapability[];
  limitations: string[];
  voice: AIVoice;
  avatar: string;
  color: string;
  isDefault: boolean;
  createdAt?: string;
  createdBy?: string;
}

type AICapability = 
  | 'chat'
  | 'summarize'
  | 'answer-questions'
  | 'generate-content'
  | 'code-review'
  | 'architecture-design'
  | 'debugging'
  | 'data-analysis'
  | 'report-writing'
  | 'strategy'
  | 'story-writing'
  | 'content-creation'
  | 'copywriting'
  | 'teaching'
  | 'explaining'
  | 'tutoring';

type AIVoice = 
  | 'neutral'
  | 'professional'
  | 'technical'
  | 'creative'
  | 'patient'
  | 'enthusiastic'
  | 'friendly'
  | 'formal'
  | 'casual';
```

**Nouveaux Endpoints** :
```typescript
// GET /api/personas                              // Lister les personas
// GET /api/personas/:id                         // Obtenir une persona
// POST /api/personas                            // Creer une persona
// PUT /api/personas/:id                         // Mettre à jour une persona
// DELETE /api/personas/:id                      // Supprimer une persona
// POST /api/personas/:id/select                 // Selectionner une persona
// GET /api/personas/current                      // Obtenir la persona courante
// POST /api/personas/:id/generate                // Generer avec une persona
```

### 🌐 API Externe et Webhooks

#### 6.2.1. API REST Amelioree

**Nouveaux Endpoints** :

```typescript
// Dans server/routes/notebooks/index.ts
router.use('/analytics', createAnalyticsRouter());
router.use('/insights', createInsightsRouter());
router.use('/collaboration', createCollaborationRouter());
router.use('/versions', createVersionsRouter());
router.use('/integrations', createIntegrationsRouter());
router.use('/plugins', createPluginsRouter());
router.use('/personas', createPersonasRouter());
router.use('/search', createSearchRouter());
```

**Nouveaux Routers** :

```typescript
// analyticsRouter.ts
function createAnalyticsRouter(): Router {
  const router = Router();
  
  router.get('/overview', (req, res) => {
    const stats = notebookManager.getStats();
    res.json({ status: 'success', stats });
  });
  
  router.get('/:id/stats', (req, res) => {
    const notebook = notebookManager.getNotebook(req.params.id);
    if (!notebook) {
      res.status(404).json({ error: 'Notebook introuvable' });
      return;
    }
    const stats = calculateNotebookStats(notebook);
    res.json({ status: 'success', stats });
  });
  
  router.get('/:id/usage', (req, res) => {
    const usage = getUsageAnalytics(req.params.id);
    res.json({ status: 'success', usage });
  });
  
  return router;
}

// insightsRouter.ts
function createInsightsRouter(): Router {
  const router = Router();
  
  router.post('/:id/extract', async (req, res) => {
    try {
      const insights = await insightExtractor.extractInsights(
        req.params.id,
        req.body.options
      );
      res.json({ status: 'success', insights });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  
  router.post('/:id/trends', async (req, res) => {
    try {
      const trends = await insightExtractor.detectTrends(
        req.params.id,
        req.body.options
      );
      res.json({ status: 'success', trends });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  
  return router;
}
```

#### 6.2.2. Webhooks

**Nouvelle Fonctionnalite** :

```typescript
// WebhookManager.ts
class WebhookManager {
  private webhooks: Map<string, Webhook> = new Map();
  private httpClient: AxiosInstance;
  
  constructor() {
    this.httpClient = axios.create({
      timeout: 10000,
      headers: { 'User-Agent': 'Jarvis-Webhook/1.0' },
    });
    this.loadWebhooks();
  }
  
  private loadWebhooks() {
    // Charger les webhooks depuis la configuration
  }
  
  // Creer un webhook
  createWebhook(config: WebhookConfig): Webhook {
    const id = randomUUID();
    const webhook: Webhook = {
      id,
      url: config.url,
      events: config.events,
      secret: config.secret || randomUUID(),
      active: true,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      lastSuccess: null,
      lastError: null,
      retryCount: 0,
    };
    
    this.webhooks.set(id, webhook);
    this.saveWebhook(webhook);
    
    return webhook;
  }
  
  // Supprimer un webhook
  deleteWebhook(id: string): boolean {
    if (this.webhooks.has(id)) {
      this.webhooks.delete(id);
      this.removeWebhook(id);
      return true;
    }
    return false;
  }
  
  // Activer/desactiver un webhook
  toggleWebhook(id: string, active: boolean): boolean {
    const webhook = this.webhooks.get(id);
    if (!webhook) return false;
    
    webhook.active = active;
    this.saveWebhook(webhook);
    
    return true;
  }
  
  // Declencher un webhook
  async triggerWebhook(event: WebhookEvent, payload: any): Promise<void> {
    for (const [id, webhook] of this.webhooks) {
      if (!webhook.active) continue;
      if (!webhook.events.includes(event)) continue;
      
      try {
        const signature = this.generateSignature(webhook.secret, payload);
        
        const response = await this.httpClient.post(webhook.url, payload, {
          headers: {
            'X-Jarvis-Event': event,
            'X-Jarvis-Signature': signature,
            'X-Jarvis-Webhook-Id': id,
          },
        });
        
        webhook.lastTriggered = new Date().toISOString();
        webhook.lastSuccess = new Date().toISOString();
        webhook.retryCount = 0;
        this.saveWebhook(webhook);
        
        console.log(`Webhook ${id} declenché avec succès pour ${event}`);
      } catch (error: any) {
        webhook.lastTriggered = new Date().toISOString();
        webhook.lastError = error.message;
        webhook.retryCount++;
        this.saveWebhook(webhook);
        
        console.error(`Erreur webhook ${id} pour ${event}: ${error.message}`);
        
        // Reessayer jusqu'à 3 fois
        if (webhook.retryCount < 3) {
          setTimeout(() => this.triggerWebhook(event, payload), 1000 * webhook.retryCount);
        }
      }
    }
  }
  
  // Generer une signature
  private generateSignature(secret: string, payload: any): string {
    const data = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    return 'sha256=' + hmac.digest('hex');
  }
  
  // Verifier une signature
  verifySignature(secret: string, payload: any, signature: string): boolean {
    const expectedSignature = this.generateSignature(secret, payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

type WebhookEvent = 
  | 'notebook.created'
  | 'notebook.updated'
  | 'notebook.deleted'
  | 'source.added'
  | 'source.removed'
  | 'note.created'
  | 'note.updated'
  | 'note.deleted'
  | 'chat.message'
  | 'document.generated'
  | 'version.created'
  | 'collaboration.started'
  | 'collaboration.ended'
  | 'backup.created'
  | 'error';

interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdAt: string;
  lastTriggered: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  retryCount: number;
}

interface WebhookConfig {
  url: string;
  events: WebhookEvent[];
  secret?: string;
}

// Nouveaux endpoints
// GET /api/webhooks                          // Lister les webhooks
// POST /api/webhooks                         // Creer un webhook
// GET /api/webhooks/:id                      // Obtenir un webhook
// PUT /api/webhooks/:id                      // Mettre à jour un webhook
// DELETE /api/webhooks/:id                   // Supprimer un webhook
// POST /api/webhooks/:id/trigger             // Declencher manuellement
// POST /api/webhooks/verify                  // Verifier un webhook
```

---

## 7. Priorisation

### 📌 Roadmap des Ameliorations

#### Phase 1: Ameliorations Critiques (0-2 mois)

| Priorite | Fonctionnalite | Impact | Effort | Dependances |
|----------|---------------|--------|--------|--------------|
| P0 | Amelioration des performances du RAG | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Aucune |
| P0 | Cache des embeddings | ⭐⭐⭐⭐⭐ | ⭐⭐ | RAGEngine |
| P0 | Validation des entrees | ⭐⭐⭐⭐ | ⭐⭐⭐ | Aucune |
| P0 | Gestion des erreurs centralisee | ⭐⭐⭐⭐ | ⭐⭐ | Aucune |
| P0 | Tests unitaires | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Aucune |
| P1 | Recherche avancee | ⭐⭐⭐⭐ | ⭐⭐⭐ | RAGEngine |
| P1 | Citations ameliorees | ⭐⭐⭐⭐ | ⭐⭐⭐ | Frontend |
| P1 | Layout responsive ameliore | ⭐⭐⭐ | ⭐⭐⭐⭐ | Design |
| P1 | Theme personnalisable | ⭐⭐⭐ | ⭐⭐⭐ | CSS |

#### Phase 2: Fonctionnalites Avancees (2-4 mois)

| Priorite | Fonctionnalite | Impact | Effort | Dependances |
|----------|---------------|--------|--------|--------------|
| P1 | Versioning des notebooks | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Backend |
| P1 | Analytics des notebooks | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Backend |
| P1 | Generation de contenu amelioree | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ContentGenerator |
| P1 | Systeme de recherche globale | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Backend |
| P2 | Mode collaboratif | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | WebSocket |
| P2 | Integration avec outils externes | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | OAuth |
| P2 | Systeme de plugins | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Architecture |

#### Phase 3: Fonctionnalites Innovantes (4-6 mois)

| Priorite | Fonctionnalite | Impact | Effort | Dependances |
|----------|---------------|--------|--------|--------------|
| P2 | AI Personnalisee | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | LLM |
| P2 | Generation audio amelioree | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | TTS |
| P2 | Generation video | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | API externe |
| P3 | Extraction d'insights | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ContentGenerator |
| P3 | Decouverte de contenu | ⭐⭐⭐ | ⭐⭐⭐⭐ | Embeddings |
| P3 | Webhooks | ⭐⭐⭐⭐ | ⭐⭐⭐ | Backend |

#### Phase 4: UI/UX Avancees (6-8 mois)

| Priorite | Fonctionnalite | Impact | Effort | Dependances |
|----------|---------------|--------|--------|--------------|
| P2 | Vue Kanban | ⭐⭐⭐ | ⭐⭐⭐⭐ | Frontend |
| P2 | Layout personnalisable | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | CSS/JS |
| P2 | Feedback utilisateur ameliore | ⭐⭐⭐ | ⭐⭐⭐ | UI |
| P3 | Confirmations avancées | ⭐⭐ | ⭐⭐⭐ | UI |
| P3 | Animations avancées | ⭐⭐⭐ | ⭐⭐⭐⭐ | Motion |
| P3 | Mode mobile optimise | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Responsive |

---

## 8. Recommandations d'Implementation

### 🎯 Methodologie

#### 8.1.1. Approche Incrementale

1. **Commencer par le Backend** :
   - Ameliorer le RAG et le caching
   - Ajouter la validation des entrees
   - Implémenter la gestion des erreurs
   - Créer les APIs pour les nouvelles fonctionnalites

2. **Ensuite le Frontend** :
   - Ameliorer l'UI existante
   - Ajouter les nouveaux composants
   - Implémenter les interactions

3. **Enfin les Fonctionnalites Avancees** :
   - Collaboration
   - Plugins
   - Integrations externes

#### 8.1.2. Branching Strategy

```
main (protegee)
├── develop
│   ├── feature/rag-optimization
│   ├── feature/advanced-search
│   ├── feature/citation-improvements
│   ├── feature/versioning
│   ├── feature/collaboration
│   ├── feature/integrations
│   ├── feature/plugins
│   ├── fix/performance
│   ├── fix/bugs
│   └── refactor/cache
└── release/v1.1
    └── hotfix/... (si necessaire)
```

#### 8.1.3. Tests et Validation

**Strategie de Test** :

1. **Tests Unitaires** (Jest/Vitest) :
   - Tester chaque fonction individuallement
   - Couverture de code > 80%

2. **Tests d'Integration** :
   - Tester les interactions entre composants
   - Tester les endpoints API

3. **Tests End-to-End** (Cypress/Playwright) :
   - Tester les flux utilisateurs complets
   - Tester sur differentes tailles d'ecran

4. **Tests de Performance** :
   - Mesurer les temps de reponse
   - Identifier les goulots d'etranglement

5. **Tests de Securite** :
   - Verifier la validation des entrees
   - Tester les permissions
   - Verifier le chiffrement

**Exemple de Test Unitaire** :

```typescript
// __tests__/notebookManager.test.ts
describe('NotebookManager', () => {
  let notebookManager: NotebookManager;
  
  beforeEach(() => {
    notebookManager = new NotebookManager();
  });
  
  describe('createNotebook', () => {
    it('should create a notebook with valid data', () => {
      const notebook = notebookManager.createNotebook('Mon Notebook', 'Description');
      
      expect(notebook).toBeDefined();
      expect(notebook.title).toBe('Mon Notebook');
      expect(notebook.description).toBe('Description');
      expect(notebook.id).toBeDefined();
      expect(notebook.color).toBeDefined();
      expect(notebook.icon).toBeDefined();
      expect(notebook.createdAt).toBeDefined();
      expect(notebook.updatedAt).toBeDefined();
    });
    
    it('should throw an error for empty title', () => {
      expect(() => notebookManager.createNotebook('', 'Description'))
        .toThrow('Le titre est requis');
    });
    
    it('should generate unique IDs', () => {
      const notebook1 = notebookManager.createNotebook('Notebook 1');
      const notebook2 = notebookManager.createNotebook('Notebook 2');
      
      expect(notebook1.id).not.toBe(notebook2.id);
    });
  });
  
  describe('deleteNotebook', () => {
    it('should delete a notebook', () => {
      const notebook = notebookManager.createNotebook('Test');
      const result = notebookManager.deleteNotebook(notebook.id);
      
      expect(result).toBe(true);
      expect(notebookManager.getNotebook(notebook.id)).toBeUndefined();
    });
    
    it('should return false for non-existent notebook', () => {
      const result = notebookManager.deleteNotebook('non-existent');
      expect(result).toBe(false);
    });
  });
});
```

**Exemple de Test E2E** :

```typescript
// e2e/notebooks.spec.ts
describe('Notebooks', () => {
  beforeEach(() => {
    cy.visit('/notebooks');
    cy.clearLocalStorage();
  });
  
  it('should create a new notebook', () => {
    cy.get('[data-testid=