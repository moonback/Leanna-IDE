/**
 * ContentGenerator — Génération de contenu dérivé des sources
 *
 * Responsable de :
 * - Résumés globaux multi-sources
 * - FAQ automatique
 * - Guides d'étude
 * - Briefing documents
 * - Scripts de podcast (Audio Overview)
 *
 * Refactor notes (voir résumé des changements en fin de fichier) :
 * - Le gros switch/case de `generate()` est remplacé par une table de
 *   dispatch construite une seule fois (DOC_TYPE_CONFIG), y compris pour
 *   les rapports spécialisés (report-*), auparavant gérés par un second
 *   mécanisme (buildReportPrompt + REPORT_STRUCTURES).
 * - `langInstruction()` et les deux constructeurs de contexte de sources
 *   ne sont plus dupliqués dans chaque méthode.
 * - `generateRoadmap()` (roadmap auto à la création) réutilise désormais
 *   `buildRoadmapPrompt()` au lieu de dupliquer un prompt quasi identique.
 * - `generateInfographic()` est découpée en petites étapes nommées.
 * - Les tokens magiques (8192, 16384, 500, 4096) sont centralisés.
 * - `suggestReports()` valide les types retournés par le LLM contre une
 *   liste blanche connue, pour éviter d'injecter un type de rapport
 *   inconnu côté UI.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger";
import { generateText } from "../utils/textGeneration";
import { notebookManager } from "../notebooks/NotebookManager";
import type { GeneratedDocument, GeneratedDocType, AudioOverview, ReportSuggestion, Source } from "../notebooks/types";

const log = createLogger("ContentGenerator");

// ═══════════════════════════════════════════════════════════════════════════════
// Constantes
// ═══════════════════════════════════════════════════════════════════════════════

const TOKENS = {
  standard: 8192,
  report: 16384,
  infographicPrompt: 500,
  suggestions: 4096,
  audio: 8192,
} as const;

const WORDS_PER_MINUTE = 150;
const DEFAULT_INFOGRAPHIC_ASPECT_RATIO = "9:16";

const REPORT_TYPE_PREFIX = "report-";

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers de prompt (purs, pas de dépendance à `this`)
// ═══════════════════════════════════════════════════════════════════════════════

function langInstruction(lang: string): string {
  return lang === "fr" ? "Réponds en français." : "Reply in English.";
}

/** Contexte détaillé (titre + résumé + extraits) — utilisé pour les documents texte. */
function buildFullSourcesContext(sources: any[]): string {
  return sources
    .map(
      (s) =>
        `## ${s.title}\n${s.summary}\n\nExtraits clés :\n${s.chunks
          .slice(0, 5)
          .map((c: any) => c.content)
          .join("\n\n")}`
    )
    .join("\n\n---\n\n");
}

/** Contexte condensé (titre + résumé + mots-clés) — utilisé pour l'audio overview. */
function buildCondensedSourcesContext(sources: any[]): string {
  return sources.map((s) => `## ${s.title}\n${s.summary}\n\nPoints clés :\n${s.keywords.join(", ")}`).join("\n\n---\n\n");
}

type PromptBuilder = (context: string, lang: string) => string;

function buildSummaryPrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Génère un résumé synthétique et structuré du contenu suivant. Le résumé doit :
- Capturer les points essentiels de CHAQUE source
- Être organisé avec des titres et sous-titres
- Inclure les conclusions ou recommandations clés
- Faire 500-1000 mots

SOURCES :
${context}

Génère le résumé en Markdown.`;
}

function buildFAQPrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Génère une FAQ complète (15-20 questions) basée sur le contenu suivant. Les questions doivent :
- Couvrir les concepts clés
- Varier entre questions basiques et avancées
- Avoir des réponses concises mais complètes
- Être organisées par thème

SOURCES :
${context}

Format Markdown avec ## pour chaque question et la réponse en dessous.`;
}

function buildStudyGuidePrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Crée un guide d'étude complet basé sur les sources suivantes. Le guide doit inclure :
- 📚 Concepts clés à maîtriser (avec définitions)
- 🔗 Liens entre les concepts
- ⚡ Points importants à retenir
- ❓ Questions d'auto-évaluation (avec réponses)
- 📝 Résumé en une page

SOURCES :
${context}

Génère le guide en Markdown structuré.`;
}

function buildBriefingPrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Crée un document de briefing exécutif basé sur les sources suivantes. Le briefing doit :
- Être concis et actionnable (max 2 pages)
- Commencer par les conclusions/recommandations clés
- Inclure le contexte nécessaire
- Identifier les risques ou points d'attention
- Proposer les prochaines étapes

SOURCES :
${context}

Génère le briefing en Markdown professionnel.`;
}

function buildTimelinePrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Extrais et organise les événements, dates et jalons mentionnés dans les sources suivantes sous forme de chronologie.
- Ordre chronologique
- Inclure le contexte de chaque événement
- Identifier les relations cause-effet
- Si les dates sont imprécises, utiliser des périodes approximatives

SOURCES :
${context}

Génère la chronologie en Markdown (format tableau ou liste).`;
}

function buildOutlinePrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Crée un plan structuré et détaillé qui synthétise l'ensemble des sources suivantes.
- Structure hiérarchique (I, A, 1, a)
- 3-4 niveaux de profondeur
- Couvrir TOUS les sujets abordés dans les sources
- Inclure des notes sous chaque point

SOURCES :
${context}

Génère le plan en Markdown.`;
}

function buildMindmapPrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Crée une carte mentale (mindmap) structurée qui organise visuellement les concepts des sources suivantes.

INSTRUCTIONS :
- Identifie le THÈME CENTRAL qui relie toutes les sources (nom court, 1-3 mots)
- Crée 4-6 BRANCHES PRINCIPALES équilibrées (catégories/thèmes majeurs, noms courts)
- Chaque branche principale a 2-4 SOUS-BRANCHES (concepts clés, 2-4 mots max)
- Ajoute au plus 2 FEUILLES par sous-branche, uniquement lorsqu'elles apportent une information utile
- Limite le diagramme à 35 NŒUDS au total pour conserver une carte aérée et lisible
- Utilise 3 niveaux de profondeur uniquement pour les idées les plus importantes ; évite les chaînes de nœuds inutiles
- Répartis les branches de façon équilibrée : aucune branche ne doit contenir plus de 6 descendants
- Les noms de nœuds doivent être COURTS et CONCIS (pas de phrases longues)
- Utilise le format Mermaid mindmap pour la représentation visuelle
- Après le diagramme Mermaid, ajoute une section textuelle détaillée

FORMAT ATTENDU :
1. Un bloc \`\`\`mermaid avec le mindmap en utilisant l'indentation pour la hiérarchie

EXEMPLE DE STRUCTURE MERMAID :
\`\`\`mermaid
mindmap
  root((Thème Central))
    Branche 1
      Sous-branche 1A
        Détail 1
        Détail 2
      Sous-branche 1B
        Détail 3
    Branche 2
      Sous-branche 2A
        Détail 4
        Détail 5
      Sous-branche 2B
\`\`\`

2. Une section "## Détails par branche" qui développe chaque nœud avec des explications

IMPORTANT :
- Garde les labels COURTS (2-5 mots max par nœud)
- Assure-toi d'avoir au moins 3 niveaux de profondeur sur chaque branche
- Le résultat doit former un ARBRE large et profond, pas un simple schéma plat

SOURCES :
${context}

Génère la carte mentale complète.`;
}

function buildSWOTPrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Réalise une analyse SWOT (Forces, Faiblesses, Opportunités, Menaces) complète basée sur les sources suivantes.

INSTRUCTIONS :
- Identifie le SUJET principal de l'analyse (entreprise, projet, technologie, concept)
- Pour chaque quadrant, liste 5-8 éléments avec une brève explication
- Appuie chaque point sur des éléments concrets des sources
- Ajoute une section "Recommandations stratégiques" à la fin
- Inclus une matrice de priorisation si pertinent

FORMAT :
## 📊 Analyse SWOT — [Sujet]

### 💪 Forces (Strengths)
- ...

### ⚠️ Faiblesses (Weaknesses)
- ...

### 🚀 Opportunités (Opportunities)
- ...

### 🔴 Menaces (Threats)
- ...

### 🎯 Recommandations stratégiques
- ...

SOURCES :
${context}

Génère l'analyse SWOT complète en Markdown.`;
}

function buildGlossaryPrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Extrais et définis TOUS les termes techniques, acronymes, concepts spécialisés et jargon présents dans les sources suivantes.

INSTRUCTIONS :
- Organise alphabétiquement
- Pour chaque terme : définition concise (1-2 phrases) + contexte d'usage
- Identifie les ACRONYMES et donne leur forme complète
- Regroupe les termes par CATÉGORIE/DOMAINE si > 20 termes
- Ajoute des renvois entre termes liés (ex: "Voir aussi : X, Y")
- Inclus des exemples d'usage quand c'est utile pour la compréhension

FORMAT :
## 📖 Glossaire

### [Catégorie]

**Terme** — Définition. _Contexte ou exemple._ → Voir aussi : terme lié

SOURCES :
${context}

Génère le glossaire complet en Markdown.`;
}

function buildFullReportPrompt(context: string, lang: string): string {
  return `${langInstruction(lang)}

Tu es un analyste expert. Génère un RAPPORT COMPLET et professionnel basé sur l'ensemble des sources fournies.

Le rapport doit être exhaustif et structuré comme un vrai document professionnel. Il doit inclure :

## Structure attendue :

### 1. 📋 Résumé exécutif (Executive Summary)
- Synthèse en 3-5 paragraphes des points clés
- Conclusions principales
- Recommandations prioritaires

### 2. 📊 Contexte et périmètre
- Contexte du sujet / projet / domaine
- Périmètre d'analyse (ce qui est couvert et ce qui ne l'est pas)
- Méthodologie d'analyse

### 3. 🔍 Analyse détaillée
- Analyse approfondie de chaque thématique identifiée dans les sources
- Données et faits clés extraits
- Comparaisons et mises en perspective
- Forces et faiblesses identifiées

### 4. 📈 Constats et observations
- Tendances identifiées
- Points de convergence et divergence entre les sources
- Risques et opportunités

### 5. 💡 Recommandations
- Recommandations actionables (priorisées : court/moyen/long terme)
- Conditions de succès
- Points d'attention et risques associés

### 6. 📎 Annexes
- Glossaire des termes clés
- Références aux sources
- Tableau récapitulatif

RÈGLES :
- Être factuel et s'appuyer exclusivement sur le contenu des sources
- Citer les sources quand c'est pertinent
- Utiliser des tableaux, listes et mise en forme Markdown riche
- Viser 2000-4000 mots pour un rapport substantiel
- Ton professionnel et analytique
- Inclure des insights et connections que les sources ne font pas explicitement

SOURCES :
${context}

Génère le rapport complet en Markdown.`;
}

/**
 * Prompt de roadmap, réutilisé à la fois pour :
 * - le document "roadmap" généré à la demande depuis `generate()` (sources réelles disponibles)
 * - la roadmap auto-générée à la création du notebook (`generateRoadmap()`, sans sources)
 */
function buildRoadmapPrompt(title: string, description: string, sourcesContext: string, lang: string): string {
  const hasSources = sourcesContext.trim().length > 0;
  return `${langInstruction(lang)}

Tu es un consultant stratégique expert. On travaille sur un projet avec les informations suivantes :

TITRE DU PROJET : ${title}
DESCRIPTION : ${description || "(Pas de description fournie)"}

${hasSources ? `SOURCES DISPONIBLES :\n${sourcesContext}` : "Aucune source n'a encore été ajoutée à ce notebook : base-toi sur le titre et la description pour proposer une roadmap initiale, et indique les questions clés à valider avec de vraies sources."}

Génère une **ROADMAP COMPLÈTE** et détaillée pour ce projet${hasSources ? ", enrichie par les sources" : ""}. Elle doit inclure :

## Structure attendue :

### 📋 1. Résumé du projet
- Vision et objectif principal
- Public cible
- Proposition de valeur

### 📊 2. Étude de marché${hasSources ? "" : " (à compléter)"}
- Analyse du marché${hasSources ? " basée sur les sources" : " — questions clés à explorer"}
- Segments ${hasSources ? "identifiés" : "à analyser"}
- Concurrents et positionnement
- Tendances du secteur

### 💼 3. Business Plan${hasSources ? "" : " (grandes lignes)"}
- Modèle économique
- Sources de revenus
- Structure de coûts
- Objectifs financiers à 6/12/24 mois

### 🎯 4. Roadmap de développement
- **Phase 1 — Validation (Mois 1-2)** : Recherche, validation, premiers retours
- **Phase 2 — MVP (Mois 2-4)** : Produit minimum viable
- **Phase 3 — Lancement (Mois 4-6)** : Go-to-market, premiers utilisateurs
- **Phase 4 — Croissance (Mois 6-12)** : Scaling, optimisation

### 📢 5. Stratégie marketing & acquisition
- Canaux recommandés
- Actions prioritaires
- Budget indicatif

### ⚠️ 6. Risques et points d'attention
- Risques principaux
- Hypothèses à valider
- Plans de contingence

### ✅ 7. Prochaines actions immédiates
- 5-10 actions concrètes priorisées par impact

${hasSources ? "" : `---

⚡ **NOTE** : Cette roadmap a été auto-générée par l'IA à la création du notebook. Ajoutez des sources (PDF, URLs, documents) au notebook pour affiner et enrichir cette roadmap avec des données réelles de votre marché.

`}RÈGLES :
- Adapte au contexte du projet
- Sois concret et actionnable
- Format Markdown riche avec emojis
- Vise 1500-2500 mots`;
}

// ─── Rapports spécialisés (report-*) ──────────────────────────────────────────

interface ReportStructureConfig {
  title: string;
  structure: string;
}

const REPORT_STRUCTURES: Record<string, ReportStructureConfig> = {
  business: {
    title: "Business Plan",
    structure: `## Structure attendue :

### 1. 📋 Résumé exécutif
- Vision et mission du projet
- Proposition de valeur unique
- Objectifs à court et long terme

### 2. 🎯 Problème & Solution
- Problème identifié et sa magnitude
- Solution proposée
- Avantage concurrentiel

### 3. 📊 Modèle économique
- Sources de revenus
- Structure de coûts
- Pricing et marges
- Projections de rentabilité

### 4. 👥 Marché cible
- Segments de clientèle
- Taille du marché adressable (TAM, SAM, SOM)
- Personas et besoins

### 5. 🚀 Stratégie de mise en marché
- Canaux d'acquisition
- Partenariats clés
- Roadmap de lancement

### 6. ⚠️ Risques et mitigation
- Risques principaux identifiés
- Plans de contingence
- Hypothèses à valider

### 7. 📈 Métriques de succès
- KPIs de suivi
- Jalons et objectifs chiffrés`,
  },
  market: {
    title: "Étude de marché",
    structure: `## Structure attendue :

### 1. 📋 Synthèse de l'étude
- Conclusions clés
- Opportunités majeures identifiées

### 2. 📊 Taille et dynamique du marché
- Taille actuelle et projections de croissance
- Tendances structurelles
- Facteurs de croissance et freins

### 3. 👥 Segmentation
- Segments de marché identifiés
- Profils types (personas)
- Besoins et attentes par segment
- Comportements d'achat

### 4. 🏢 Paysage concurrentiel
- Acteurs principaux et parts de marché
- Positionnement des concurrents
- Barrières à l'entrée

### 5. 💡 Opportunités et menaces
- Niches non exploitées
- Évolutions réglementaires
- Disruptions potentielles

### 6. 🎯 Recommandations de positionnement
- Positionnement optimal
- Différenciation recommandée
- Stratégie d'entrée`,
  },
  technical: {
    title: "Rapport technique",
    structure: `## Structure attendue :

### 1. 📋 Résumé technique
- Objectif du document
- Décisions techniques clés
- Stack et architecture retenue

### 2. 🏗️ Architecture
- Architecture globale (schéma)
- Composants principaux et responsabilités
- Flux de données
- Intégrations

### 3. ⚙️ Choix techniques
- Technologies retenues et justification
- Alternatives évaluées et raisons du rejet
- Trade-offs acceptés

### 4. 📐 Spécifications
- Modèle de données
- APIs et interfaces
- Contraintes de performance
- Exigences de sécurité

### 5. 🚀 Plan d'implémentation
- Phases de développement
- Dépendances techniques
- Risques techniques et mitigation

### 6. 📊 Métriques et monitoring
- KPIs techniques
- Stratégie de monitoring
- Seuils d'alerte`,
  },
  competitive: {
    title: "Analyse concurrentielle",
    structure: `## Structure attendue :

### 1. 📋 Vue d'ensemble du paysage concurrentiel
- Nombre et types de concurrents
- Dynamique du marché

### 2. 🏢 Profil des concurrents
Pour chaque concurrent identifié :
- Positionnement et proposition de valeur
- Forces et faiblesses
- Pricing et modèle économique
- Parts de marché estimées

### 3. 📊 Matrice comparative
- Tableau comparatif multi-critères
- Scoring par dimension

### 4. 🎯 Analyse de positionnement
- Carte de positionnement (axes différenciants)
- Espaces non occupés
- Facteurs clés de succès du marché

### 5. 💡 Avantages concurrentiels
- Avantages identifiés vs chaque concurrent
- Vulnérabilités à couvrir
- Stratégie de différenciation recommandée

### 6. 📈 Recommandations stratégiques
- Quick wins
- Investissements stratégiques
- Veille à maintenir`,
  },
  financial: {
    title: "Rapport financier",
    structure: `## Structure attendue :

### 1. 📋 Synthèse financière
- Chiffres clés
- Rentabilité et viabilité

### 2. 💰 Structure de revenus
- Sources de revenus détaillées
- Projections à 12/24/36 mois
- Hypothèses de croissance

### 3. 📉 Structure de coûts
- Coûts fixes et variables
- Coûts d'acquisition client (CAC)
- Burn rate

### 4. 📊 Projections financières
- Compte de résultat prévisionnel
- Seuil de rentabilité (break-even)
- Trésorerie prévisionnelle

### 5. 📈 Métriques financières
- LTV (Lifetime Value)
- Ratio LTV/CAC
- Marge brute et nette
- MRR/ARR si applicable

### 6. ⚠️ Sensibilité et risques
- Scénarios (optimiste, réaliste, pessimiste)
- Variables de sensibilité
- Besoins de financement`,
  },
  marketing: {
    title: "Plan marketing",
    structure: `## Structure attendue :

### 1. 📋 Résumé du plan
- Objectifs marketing
- Budget et timeline

### 2. 🎯 Cibles et personas
- Segments prioritaires
- Personas détaillés
- Parcours client (customer journey)

### 3. 💬 Messaging et positionnement
- Proposition de valeur
- Messages clés par persona
- Ton et personnalité de marque

### 4. 📢 Stratégie d'acquisition
- Canaux organiques (SEO, content, social)
- Canaux payants (Ads, partnerships)
- Stratégie de conversion

### 5. 📊 Funnel et métriques
- Funnel d'acquisition
- KPIs par étape
- Objectifs chiffrés

### 6. 🗓️ Plan d'action
- Actions à 30/60/90 jours
- Ressources nécessaires
- Budget par canal`,
  },
  product: {
    title: "Rapport produit",
    structure: `## Structure attendue :

### 1. 📋 Vision produit
- Vision à long terme
- Problèmes résolus
- Proposition de valeur

### 2. 🎯 Fonctionnalités
- Fonctionnalités core identifiées
- Priorisation (MoSCoW ou RICE)
- MVP vs versions futures

### 3. 👥 Utilisateurs
- Personas utilisateurs
- Jobs-to-be-done
- Parcours utilisateur clés

### 4. 🗺️ Roadmap
- Phase 1 (MVP) : scope et timeline
- Phase 2 : enrichissements
- Phase 3 : scale

### 5. 📐 Spécifications UX
- Principes d'expérience
- Flows critiques
- Contraintes d'accessibilité

### 6. 📊 Métriques produit
- North Star metric
- KPIs de suivi
- Critères de succès par feature`,
  },
  risk: {
    title: "Analyse des risques",
    structure: `## Structure attendue :

### 1. 📋 Synthèse des risques
- Nombre de risques identifiés par catégorie
- Niveau de risque global

### 2. ⚠️ Inventaire des risques
Pour chaque risque :
- Description et impact potentiel
- Probabilité (faible/moyenne/élevée)
- Sévérité (faible/moyenne/critique)
- Score de risque

### 3. 📊 Matrice de risques
- Matrice probabilité × impact
- Classification par priorité
- Risques critiques nécessitant une action immédiate

### 4. 🛡️ Plans de mitigation
- Actions préventives par risque
- Plans de contingence
- Responsables et délais

### 5. 📈 Suivi et monitoring
- Indicateurs d'alerte précoce
- Fréquence de réévaluation
- Processus d'escalade

### 6. 💡 Recommandations
- Actions prioritaires
- Investissements de protection
- Acceptation de risque résiduel`,
  },
  executive: {
    title: "Synthèse exécutive",
    structure: `## Structure attendue :

### 1. 🎯 L'essentiel en 30 secondes
- 3-5 bullet points des conclusions majeures
- Décision requise (si applicable)

### 2. 📊 Contexte
- Situation actuelle (2-3 phrases)
- Enjeux clés

### 3. 💡 Conclusions et recommandations
- Recommandation principale
- Alternatives considérées
- Risques de l'inaction

### 4. 📈 Impact attendu
- Bénéfices quantifiés
- Timeline de réalisation
- Ressources nécessaires

### 5. ➡️ Prochaines étapes
- Actions immédiates
- Responsables
- Points de décision

RÈGLE SPÉCIALE : Ce document doit être CONCIS (max 2 pages). Chaque mot compte. Prioriser la clarté et l'impact.`,
  },
  project: {
    title: "Rapport de projet",
    structure: `## Structure attendue :

### 1. 📋 Résumé du projet
- Objectif du projet
- Statut global (sur les rails / à risque / en retard)
- Faits marquants

### 2. 📊 Avancement
- Progression globale (%)
- Livrables complétés
- Livrables en cours
- Livrables à venir

### 3. 🗓️ Timeline et jalons
- Jalons atteints
- Prochains jalons
- Écarts par rapport au planning initial

### 4. ⚠️ Risques et blocages
- Problèmes actuels
- Risques identifiés
- Actions correctives en cours

### 5. 👥 Ressources
- Équipe et rôles
- Charge de travail
- Besoins non couverts

### 6. ➡️ Prochaines étapes
- Actions prioritaires pour la prochaine période
- Décisions à prendre
- Dépendances externes`,
  },
};

function buildReportPrompt(reportType: string, context: string, lang: string): string {
  const config = REPORT_STRUCTURES[reportType];
  if (!config) return buildFullReportPrompt(context, lang);

  return `${langInstruction(lang)}

Tu es un expert en rédaction de rapports professionnels. Génère un **${config.title}** complet et structuré basé sur les sources fournies.

${config.structure}

RÈGLES :
- S'appuyer EXCLUSIVEMENT sur le contenu des sources fournies
- Être factuel, précis et professionnel
- Utiliser des tableaux, listes et mise en forme Markdown riche
- Viser 2000-4000 mots pour un rapport substantiel
- Ton professionnel et analytique
- Si des informations manquent dans les sources, le signaler clairement avec [Information non disponible dans les sources]
- Inclure des insights et connexions entre les différentes sources

SOURCES :
${context}

Génère le ${config.title} complet en Markdown.`;
}

// ─── Table de dispatch unifiée pour generate() ────────────────────────────────

interface DocTypeConfig {
  title: string;
  build: PromptBuilder;
  maxTokens: number;
}

/** Types texte "simples" (hors rapports spécialisés et hors infographie, gérée à part). */
const SIMPLE_DOC_TYPES: Record<string, { title: string; build: PromptBuilder }> = {
  summary: { title: "Résumé synthétique", build: buildSummaryPrompt },
  faq: { title: "FAQ — Questions fréquentes", build: buildFAQPrompt },
  "study-guide": { title: "Guide d'étude", build: buildStudyGuidePrompt },
  briefing: { title: "Document de briefing", build: buildBriefingPrompt },
  timeline: { title: "Chronologie", build: buildTimelinePrompt },
  outline: { title: "Plan structuré", build: buildOutlinePrompt },
  mindmap: { title: "Carte mentale", build: buildMindmapPrompt },
  swot: { title: "Analyse SWOT", build: buildSWOTPrompt },
  glossary: { title: "Glossaire", build: buildGlossaryPrompt },
  "full-report": { title: "Rapport complet", build: buildFullReportPrompt },
};

const REPORT_TYPE_TITLES: Record<string, string> = {
  business: "Business Plan",
  market: "Étude de marché",
  technical: "Rapport technique",
  competitive: "Analyse concurrentielle",
  financial: "Rapport financier",
  marketing: "Plan marketing",
  product: "Rapport produit",
  risk: "Analyse des risques",
  executive: "Synthèse exécutive",
  project: "Rapport de projet",
};

/**
 * Construit la table complète { type -> config } au chargement du module.
 * `roadmap` et `infographic` restent gérés séparément car ils ont besoin
 * du titre/description du notebook (roadmap) ou d'une pipeline dédiée
 * (infographie = image, pas texte).
 */
function buildDocTypeConfig(): Record<string, DocTypeConfig> {
  const config: Record<string, DocTypeConfig> = {};

  for (const [type, { title, build }] of Object.entries(SIMPLE_DOC_TYPES)) {
    config[type] = { title, build, maxTokens: type === "full-report" ? TOKENS.report : TOKENS.standard };
  }

  for (const [key, title] of Object.entries(REPORT_TYPE_TITLES)) {
    const type = `${REPORT_TYPE_PREFIX}${key}`;
    config[type] = {
      title,
      build: (context, lang) => buildReportPrompt(key, context, lang),
      maxTokens: TOKENS.report,
    };
  }

  return config;
}

const DOC_TYPE_CONFIG = buildDocTypeConfig();

// ═══════════════════════════════════════════════════════════════════════════════
// Image generation (OpenRouter)
// ═══════════════════════════════════════════════════════════════════════════════

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux-1.1-pro";

export interface ImageGenerationOptions {
  model?: string;
  style?: string;
  resolution?: string;
  aspectRatio?: string;
  quality?: string;
}

export interface ImageGenerationResult {
  imageBase64: string;
  mediaType: string;
  model: string;
  cost: number;
}

/**
 * Generates an image via OpenRouter's image generation API.
 * Returns base64-encoded image data along with metadata.
 * Imported by `notebooks/ContentGenerator.ts` via `import("../utils/imageGeneration")`.
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<ImageGenerationResult | null> {
  const apiKey =
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_FREE_API_KEY;

  if (!apiKey) {
    log.error("generateImage: aucune clé API OpenRouter disponible (OPENROUTER_API_KEY manquante).");
    return null;
  }

  const model = options.model || DEFAULT_IMAGE_MODEL;

  // Build the full prompt incorporating style/quality hints
  const styleHint = options.style ? ` Style: ${options.style}.` : "";
  const qualityHint = options.quality === "high" ? " Ultra high quality, detailed." : "";
  const fullPrompt = `${prompt}${styleHint}${qualityHint}`.trim();

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://jarvis-os.local",
        "X-Title": process.env.OPENROUTER_TITLE || "Jarvis-OS",
      },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        n: 1,
        response_format: "b64_json",
        ...(options.aspectRatio ? { size: options.aspectRatio } : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      log.error(`generateImage: OpenRouter HTTP ${response.status} — ${errText.slice(0, 300)}`);
      return null;
    }

    const data: any = await response.json();
    const b64 = data?.data?.[0]?.b64_json as string | undefined;
    if (!b64) {
      log.error("generateImage: réponse OpenRouter sans b64_json.");
      return null;
    }

    return {
      imageBase64: b64,
      mediaType: "image/png",
      model: data.model || model,
      cost: data.usage?.total_cost ?? 0,
    };
  } catch (e: any) {
    log.error(`generateImage: erreur réseau — ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

export interface GenerateOptions {
  sourceIds?: string[];
  language?: string;
  customInstructions?: string;
  onChunk?: (chunk: string) => void;
  imageModel?: string;
  /** Ratio d'aspect explicite pour les infographies (ex: "9:16", "16:9"). */
  aspectRatio?: string;
}

export class ContentGenerator {
  /**
   * Génère un document dérivé selon le type demandé.
   */
  async generate(notebookId: string, type: GeneratedDocType, options: GenerateOptions = {}): Promise<GeneratedDocument> {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) throw new Error("Notebook introuvable.");
    if (notebook.sources.length === 0) throw new Error("Aucune source dans ce notebook.");

    const sources = options.sourceIds ? notebook.sources.filter((s: Source) => options.sourceIds!.includes(s.id)) : notebook.sources;
    if (sources.length === 0) throw new Error("Aucune source sélectionnée.");

    const lang = options.language || sources[0]?.language || "fr";
    const sourcesContext = buildFullSourcesContext(sources);

    if (type === "infographic") {
      return this.generateInfographic(notebookId, sourcesContext, sources, lang, options);
    }

    if (type === "roadmap") {
      const title = `🗺️ Roadmap — ${notebook.title}`;
      const prompt = this.withCustomInstructions(
        buildRoadmapPrompt(notebook.title, notebook.description, sourcesContext, lang),
        options.customInstructions
      );
      return this.runTextGeneration(notebookId, type, title, prompt, TOKENS.report, sources, options.onChunk);
    }

    const docConfig = DOC_TYPE_CONFIG[type];
    if (!docConfig) throw new Error(`Type non supporté: ${type}`);

    const prompt = this.withCustomInstructions(docConfig.build(sourcesContext, lang), options.customInstructions);

    log.info(`📝 Génération ${type} pour notebook "${notebook.title}" (${sources.length} sources)`);

    return this.runTextGeneration(notebookId, type, docConfig.title, prompt, docConfig.maxTokens, sources, options.onChunk);
  }

  private withCustomInstructions(prompt: string, customInstructions?: string): string {
    if (!customInstructions?.trim()) return prompt;
    return `${prompt}\n\n═══ INSTRUCTIONS SUPPLÉMENTAIRES DE L'UTILISATEUR ═══\n${customInstructions.trim()}`;
  }

  private async runTextGeneration(
    notebookId: string,
    type: GeneratedDocType,
    title: string,
    prompt: string,
    maxTokens: number,
    sources: any[],
    onChunk?: (chunk: string) => void
  ): Promise<GeneratedDocument> {
    let generatedText: string;

    if (onChunk) {
      const { generateTextStream } = await import("../utils/textGeneration");
      generatedText = await generateTextStream({ prompt, temperature: 0.5, maxOutputTokens: maxTokens, onChunk });
    } else {
      const result = await generateText({ prompt, temperature: 0.5, maxOutputTokens: maxTokens });
      generatedText = result.text;
    }

    const doc: GeneratedDocument = {
      id: randomUUID(),
      notebookId,
      type,
      title,
      content: generatedText,
      sourceIds: sources.map((s) => s.id),
      createdAt: new Date().toISOString(),
    };

    notebookManager.addGeneratedDocument(notebookId, doc);
    log.info(`✅ Document généré: "${title}" (${generatedText.length} chars)`);

    return doc;
  }

  // ─── Infographie ────────────────────────────────────────────────────────────

  /**
   * Génère une infographie à partir des sources du notebook.
   * Utilise l'API d'image pour créer un visuel professionnel et le
   * sauvegarde directement dans la sandbox.
   */
  private async generateInfographic(
    notebookId: string,
    sourcesContext: string,
    sources: Source[],
    _lang: string,
    options: GenerateOptions
  ): Promise<GeneratedDocument> {
    options.onChunk?.("🎨 Analyse des sources pour créer l'infographie...\n\n");
    const imagePrompt = await this.buildInfographicImagePrompt(sourcesContext, options.customInstructions);

    options.onChunk?.(`📐 Prompt de l'infographie :\n> ${imagePrompt.slice(0, 200)}...\n\n`);
    options.onChunk?.("🖼️ Génération de l'image en cours...\n\n");

    const aspectRatio = this.resolveInfographicAspectRatio(options);
    const imageResult = await generateImage(imagePrompt, {
      model: options.imageModel || undefined,
      style: "infographic",
      resolution: "2K",
      aspectRatio,
      quality: "high",
    });

    if (!imageResult) {
      throw new Error("Échec de la génération de l'infographie. Vérifiez votre clé OpenRouter.");
    }

    const { relativePath, filePath, sizeKB } = await this.saveInfographicFile(imageResult.imageBase64);

    log.info(`📁 Infographie sauvegardée: ${filePath} (${sizeKB}KB)`);
    options.onChunk?.(`✅ Infographie sauvegardée dans la sandbox : ${relativePath}\n\n`);
    options.onChunk?.(`![Infographie](data:${imageResult.mediaType};base64,${imageResult.imageBase64})\n`);

    const content = JSON.stringify({
      type: "infographic-image",
      filePath: relativePath,
      fullPath: filePath,
      mediaType: imageResult.mediaType,
      imageBase64: imageResult.imageBase64,
      model: imageResult.model,
      prompt: imagePrompt,
      cost: imageResult.cost,
      sizeKB,
    });

    const doc: GeneratedDocument = {
      id: randomUUID(),
      notebookId,
      type: "infographic",
      title: "Infographie",
      content,
      sourceIds: sources.map((s: any) => s.id),
      createdAt: new Date().toISOString(),
    };

    notebookManager.addGeneratedDocument(notebookId, doc);
    log.info(`✅ Infographie générée (${imageResult.model}) → ${relativePath}`);

    return doc;
  }

  private async buildInfographicImagePrompt(sourcesContext: string, customInstructions?: string): Promise<string> {
    const promptResult = await generateText({
      prompt: `Analyse le contenu suivant et génère un prompt concis (en anglais, max 200 mots) pour créer une infographie professionnelle qui résume visuellement les points clés.

Le prompt doit décrire :
- Le titre principal de l'infographie
- Les 3-5 sections/blocs principaux avec leurs données clés
- Le style visuel souhaité (couleurs, icônes, mise en page)
- Les chiffres/statistiques importants à mettre en avant

SOURCES :
${sourcesContext.slice(0, 4000)}

${customInstructions ? `INSTRUCTIONS UTILISATEUR : ${customInstructions}` : ""}

Réponds UNIQUEMENT avec le prompt pour le générateur d'images, sans explication supplémentaire.`,
      temperature: 0.7,
      maxOutputTokens: TOKENS.infographicPrompt,
    });

    return promptResult.text.trim();
  }

  /**
   * Résout le ratio d'aspect à utiliser : priorité à `options.aspectRatio`
   * (façon explicite et recommandée), avec repli sur l'ancien format
   * "Orientation: X:Y" dans `customInstructions` pour compatibilité
   * ascendante avec les appelants existants.
   */
  private resolveInfographicAspectRatio(options: GenerateOptions): string {
    if (options.aspectRatio) return options.aspectRatio;

    const legacyMatch = options.customInstructions?.match(/Orientation\s*:\s*([\d:]+)/i);
    return legacyMatch?.[1] || DEFAULT_INFOGRAPHIC_ASPECT_RATIO;
  }

  private async saveInfographicFile(imageBase64: string): Promise<{ relativePath: string; filePath: string; sizeKB: number }> {
    const { getSandboxRoot } = await import("../utils/sandbox");
    const fs = await import("fs");
    const path = await import("path");

    const sandboxRoot = getSandboxRoot();
    const infographicsDir = path.join(sandboxRoot, "infographies");
    if (!fs.existsSync(infographicsDir)) {
      fs.mkdirSync(infographicsDir, { recursive: true });
    }

    const filename = `infographie-${Date.now()}.png`;
    const filePath = path.join(infographicsDir, filename);
    const relativePath = `infographies/${filename}`;

    const imageBuffer = Buffer.from(imageBase64, "base64");
    fs.writeFileSync(filePath, imageBuffer);

    return { relativePath, filePath, sizeKB: Math.round(imageBuffer.length / 1024) };
  }

  // ─── Audio overview ─────────────────────────────────────────────────────────

  /**
   * Génère un script de podcast (Audio Overview) — 2 hôtes discutent du contenu.
   */
  async generateAudioOverview(
    notebookId: string,
    options: {
      language?: string;
      duration?: "short" | "medium" | "long";
      sourceIds?: string[];
      tone?: "casual" | "academic" | "humorous" | "professional";
      customInstructions?: string;
    } = {}
  ): Promise<AudioOverview> {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) throw new Error("Notebook introuvable.");
    if (notebook.sources.length === 0) throw new Error("Aucune source dans ce notebook.");

    const sources: Source[] =
      options.sourceIds && options.sourceIds.length > 0
        ? notebook.sources.filter((s: Source) => options.sourceIds!.includes(s.id))
        : notebook.sources;
    if (sources.length === 0) throw new Error("Aucune source sélectionnée.");

    const lang = options.language || sources[0]?.language || "fr";
    const duration = options.duration || "medium";
    const durationMinutes = duration === "short" ? 5 : duration === "medium" ? 10 : 15;
    const tone = options.tone || "casual";

    const toneInstructions: Record<string, string> = {
      casual: "Ton : décontracté mais informatif, comme un podcast de vulgarisation entre amis",
      academic: "Ton : académique et rigoureux, comme une conférence universitaire en dialogue",
      humorous: "Ton : drôle et léger avec des blagues et analogies amusantes, tout en restant informatif",
      professional: "Ton : professionnel et structuré, comme un briefing entre collègues experts",
    };

    const sourcesContext = buildCondensedSourcesContext(sources);
    const customPart = options.customInstructions ? `\n- Instructions supplémentaires de l'utilisateur : ${options.customInstructions}` : "";

    const prompt = `Tu es un scénariste de podcast éducatif. Génère un script de conversation entre deux hôtes (Alex et Sam) qui discutent du contenu des documents suivants.

SOURCES :
${sourcesContext}

INSTRUCTIONS :
- Durée cible : ~${durationMinutes} minutes de conversation (environ ${durationMinutes * WORDS_PER_MINUTE} mots)
- ${toneInstructions[tone]}
- Alex pose des questions, fait des analogies. Sam explique en profondeur.
- Commencer par une introduction engageante du sujet
- Couvrir les points clés de TOUTES les sources
- Terminer par un résumé et les points à retenir
- Langue : ${lang === "fr" ? "français" : "anglais"}
- Format : dialogue avec "Alex:" et "Sam:" comme préfixes${customPart}

Génère le script complet du podcast.`;

    log.info(`🎙️ Génération Audio Overview pour "${notebook.title}" (~${durationMinutes}min, ton=${tone})`);

    const overview: AudioOverview = {
      id: randomUUID(),
      notebookId,
      title: `Podcast — ${notebook.title}`,
      script: "",
      estimatedDuration: durationMinutes * 60,
      status: "generating",
      createdAt: new Date().toISOString(),
    };

    notebookManager.addAudioOverview(notebookId, overview);

    try {
      const result = await generateText({ prompt, temperature: 0.7, maxOutputTokens: TOKENS.audio });
      overview.script = result.text;
      overview.status = "ready";
      const wordCount = result.text.split(/\s+/).length;
      overview.estimatedDuration = Math.round((wordCount / WORDS_PER_MINUTE) * 60);
    } catch (e: any) {
      log.error(`Erreur génération podcast: ${e.message}`);
      overview.status = "error";
      overview.script = `Erreur: ${e.message}`;
    }

    return overview;
  }

  // ─── Suggestions intelligentes de rapports ──────────────────────────────────

  /**
   * Analyse les sources d'un notebook et suggère les rapports les plus pertinents à générer.
   */
  async suggestReports(notebookId: string): Promise<ReportSuggestion[]> {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) throw new Error("Notebook introuvable.");
    if (notebook.sources.length === 0) return [];

    const sourcesInfo = notebook.sources.map((s: Source) => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
      keywords: s.keywords,
      wordCount: s.wordCount,
      type: s.type,
      language: s.language,
    }));

    const alreadyGenerated = notebook.generatedDocuments.map((d: GeneratedDocument) => d.type);

    const knownTypes = [...Object.keys(REPORT_TYPE_TITLES).map((k) => `${REPORT_TYPE_PREFIX}${k}`), "full-report"];

    const prompt = `Tu es un assistant qui analyse des documents et recommande des rapports à générer.

Voici les sources disponibles dans un notebook :
${sourcesInfo.map((s: { id: string; title: string; type: string; wordCount: number; summary: string; keywords: string[] }, i: number) => `${i + 1}. "${s.title}" (${s.type}, ${s.wordCount} mots) — ${s.summary}\n   Mots-clés: ${s.keywords.join(", ")}`).join("\n\n")}

Documents déjà générés : ${alreadyGenerated.length > 0 ? alreadyGenerated.join(", ") : "aucun"}

Types de rapports disponibles :
- "report-business" : Business Plan (vision, modèle économique, stratégie, projections)
- "report-market" : Étude de marché (taille, segments, tendances, concurrence)
- "report-technical" : Rapport technique (architecture, choix technos, spécifications)
- "report-competitive" : Analyse concurrentielle (positionnement, benchmark, différenciation)
- "report-financial" : Rapport financier (projections, coûts, rentabilité, KPIs)
- "report-marketing" : Plan marketing (acquisition, canaux, messaging, personas)
- "report-product" : Rapport produit (roadmap, fonctionnalités, priorisation, UX)
- "report-risk" : Analyse des risques (identification, probabilité, mitigation)
- "report-executive" : Synthèse exécutive (résumé décisionnel pour dirigeants)
- "report-project" : Rapport de projet (avancement, livrables, jalons, blocages)
- "full-report" : Rapport complet généraliste (résumé exécutif, analyse, recommandations)

INSTRUCTIONS :
- Analyse le contenu et la nature des sources
- Suggère les 3-5 rapports les PLUS PERTINENTS par rapport au contenu réel des sources
- Par exemple : si les sources parlent d'un MVP et de fonctionnalités → suggère business plan, rapport produit, étude de marché
- Ne suggère PAS un rapport qui n'a pas de sens par rapport aux sources
- Priorise par pertinence
- Explique POURQUOI chaque rapport serait utile pour ces sources spécifiques

Réponds UNIQUEMENT en JSON valide avec ce format exact :
[
  {
    "type": "report-business",
    "title": "Titre descriptif personnalisé du rapport",
    "description": "Ce que le rapport contiendra spécifiquement pour ces sources",
    "reason": "Pourquoi ce rapport est pertinent pour ces sources",
    "relevance": 95,
    "recommendedSourceIds": ["id1", "id2"]
  }
]

Génère entre 3 et 5 suggestions, triées par pertinence décroissante.`;

    try {
      const result = await generateText({ prompt, temperature: 0.3, maxOutputTokens: TOKENS.suggestions });
      const suggestions = this.parseSuggestions(result.text, notebook.sources, knownTypes);

      log.info(`💡 ${suggestions.length} suggestions de rapports pour "${notebook.title}"`);
      return suggestions;
    } catch (e: any) {
      log.error(`Erreur suggestions rapports: ${e.message}`);
      return this.getDefaultSuggestions(notebook.sources, alreadyGenerated);
    }
  }

  /**
   * Parse et valide la réponse JSON du LLM :
   * - ignore les suggestions dont le type n'est pas dans la liste blanche connue
   * - clamp `relevance` entre 0 et 100
   * - ne garde que les `recommendedSourceIds` qui existent réellement dans le notebook
   */
  private parseSuggestions(rawText: string, sources: any[], knownTypes: string[]): ReportSuggestion[] {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    let parsed: any[];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      log.error("Réponse LLM non parsable en JSON pour les suggestions de rapports.");
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((s) => s?.type && s?.title && s?.description && s?.reason && knownTypes.includes(s.type))
      .map((s) => ({
        ...s,
        relevance: Math.min(100, Math.max(0, s.relevance || 50)),
        recommendedSourceIds: (s.recommendedSourceIds || []).filter((id: string) => sources.some((src) => src.id === id)),
      }));
  }

  /**
   * Suggestions par défaut si l'appel IA échoue
   */
  private getDefaultSuggestions(sources: any[], alreadyGenerated: string[]): ReportSuggestion[] {
    const sourceIds = sources.map((s) => s.id);

    const candidates: ReportSuggestion[] = [
      {
        type: "report-business",
        title: "Business Plan",
        description: "Vision, modèle économique, stratégie et projections",
        reason: "Un business plan structure vos idées et valide la viabilité de votre projet",
        relevance: 90,
        recommendedSourceIds: sourceIds,
      },
      {
        type: "report-product",
        title: "Rapport produit",
        description: "Roadmap, fonctionnalités prioritaires et parcours utilisateurs",
        reason: "Clarifie la vision produit et priorise les développements",
        relevance: 85,
        recommendedSourceIds: sourceIds,
      },
      {
        type: "report-market",
        title: "Étude de marché",
        description: "Taille du marché, segments, tendances et concurrence",
        reason: "Valide le potentiel marché et identifie les opportunités",
        relevance: 80,
        recommendedSourceIds: sourceIds,
      },
      {
        type: "report-executive",
        title: "Synthèse exécutive",
        description: "Résumé décisionnel concis pour les parties prenantes",
        reason: "Permet de communiquer rapidement les points essentiels",
        relevance: 75,
        recommendedSourceIds: sourceIds,
      },
      {
        type: "report-risk",
        title: "Analyse des risques",
        description: "Risques identifiés, probabilité et plans de mitigation",
        reason: "Anticipe les problèmes et prépare des plans de contingence",
        relevance: 70,
        recommendedSourceIds: sourceIds,
      },
    ];

    return candidates.filter((c) => !alreadyGenerated.includes(c.type)).slice(0, 5);
  }

  // ─── Roadmap automatique à la création ───────────────────────────────────

  /**
   * Génère une roadmap complète pour un notebook nouvellement créé,
   * basée uniquement sur le titre et la description du projet.
   * Réutilise `buildRoadmapPrompt` (sans contexte de sources) au lieu de
   * dupliquer le prompt de roadmap.
   */
  async generateRoadmap(notebookId: string, title: string, description: string): Promise<GeneratedDocument | null> {
    try {
      const prompt = buildRoadmapPrompt(title, description, "", "fr");

      log.info(`🗺️ Génération roadmap automatique pour "${title}" (notebook: ${notebookId})`);

      const result = await generateText({ prompt, temperature: 0.6, maxOutputTokens: TOKENS.report });

      const doc: GeneratedDocument = {
        id: randomUUID(),
        notebookId,
        type: "roadmap" as GeneratedDocType,
        title: `🗺️ Roadmap — ${title}`,
        content: result.text,
        sourceIds: [],
        createdAt: new Date().toISOString(),
      };

      notebookManager.addGeneratedDocument(notebookId, doc);
      log.info(`✅ Roadmap auto-générée pour "${title}" (${result.text.length} chars)`);

      return doc;
    } catch (e: any) {
      log.error(`❌ Erreur génération roadmap pour "${title}": ${e.message}`);
      return null;
    }
  }
}

export const contentGenerator = new ContentGenerator();