/**
 * ContentGenerator — Génération de contenu dérivé des sources
 *
 * Responsable de :
 * - Résumés globaux multi-sources
 * - FAQ automatique
 * - Guides d'étude
 * - Briefing documents
 * - Scripts de podcast (Audio Overview)
 */

import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger";
import { generateText } from "../utils/textGeneration";
import { notebookManager } from "./NotebookManager";
import type { GeneratedDocument, GeneratedDocType, AudioOverview, ReportSuggestion } from "./types";

const log = createLogger("ContentGenerator");

// ═══════════════════════════════════════════════════════════════════════════════

export class ContentGenerator {

  /**
   * Génère un document dérivé selon le type demandé.
   */
  async generate(
    notebookId: string,
    type: GeneratedDocType,
    options: { sourceIds?: string[]; language?: string; customInstructions?: string; onChunk?: (chunk: string) => void } = {}
  ): Promise<GeneratedDocument> {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) throw new Error("Notebook introuvable.");
    if (notebook.sources.length === 0) throw new Error("Aucune source dans ce notebook.");

    // Filtrer les sources si spécifié
    const sources = options.sourceIds
      ? notebook.sources.filter(s => options.sourceIds!.includes(s.id))
      : notebook.sources;

    if (sources.length === 0) throw new Error("Aucune source sélectionnée.");

    // Construire le contexte des sources
    const sourcesContext = sources.map(s =>
      `## ${s.title}\n${s.summary}\n\nExtraits clés :\n${s.chunks.slice(0, 5).map(c => c.content).join("\n\n")}`
    ).join("\n\n---\n\n");

    const lang = options.language || sources[0]?.language || "fr";
    let prompt = "";
    let title = "";

    switch (type) {
      case "summary":
        title = "Résumé synthétique";
        prompt = this.buildSummaryPrompt(sourcesContext, lang);
        break;
      case "faq":
        title = "FAQ — Questions fréquentes";
        prompt = this.buildFAQPrompt(sourcesContext, lang);
        break;
      case "study-guide":
        title = "Guide d'étude";
        prompt = this.buildStudyGuidePrompt(sourcesContext, lang);
        break;
      case "briefing":
        title = "Document de briefing";
        prompt = this.buildBriefingPrompt(sourcesContext, lang);
        break;
      case "timeline":
        title = "Chronologie";
        prompt = this.buildTimelinePrompt(sourcesContext, lang);
        break;
      case "outline":
        title = "Plan structuré";
        prompt = this.buildOutlinePrompt(sourcesContext, lang);
        break;
      case "mindmap":
        title = "Carte mentale";
        prompt = this.buildMindmapPrompt(sourcesContext, lang);
        break;
      case "swot":
        title = "Analyse SWOT";
        prompt = this.buildSWOTPrompt(sourcesContext, lang);
        break;
      case "glossary":
        title = "Glossaire";
        prompt = this.buildGlossaryPrompt(sourcesContext, lang);
        break;
      case "full-report":
        title = "Rapport complet";
        prompt = this.buildFullReportPrompt(sourcesContext, lang);
        break;
      case "report-business":
        title = "Business Plan";
        prompt = this.buildReportPrompt("business", sourcesContext, lang);
        break;
      case "report-market":
        title = "Étude de marché";
        prompt = this.buildReportPrompt("market", sourcesContext, lang);
        break;
      case "report-technical":
        title = "Rapport technique";
        prompt = this.buildReportPrompt("technical", sourcesContext, lang);
        break;
      case "report-competitive":
        title = "Analyse concurrentielle";
        prompt = this.buildReportPrompt("competitive", sourcesContext, lang);
        break;
      case "report-financial":
        title = "Rapport financier";
        prompt = this.buildReportPrompt("financial", sourcesContext, lang);
        break;
      case "report-marketing":
        title = "Plan marketing";
        prompt = this.buildReportPrompt("marketing", sourcesContext, lang);
        break;
      case "report-product":
        title = "Rapport produit";
        prompt = this.buildReportPrompt("product", sourcesContext, lang);
        break;
      case "report-risk":
        title = "Analyse des risques";
        prompt = this.buildReportPrompt("risk", sourcesContext, lang);
        break;
      case "report-executive":
        title = "Synthèse exécutive";
        prompt = this.buildReportPrompt("executive", sourcesContext, lang);
        break;
      case "report-project":
        title = "Rapport de projet";
        prompt = this.buildReportPrompt("project", sourcesContext, lang);
        break;
      default:
        throw new Error(`Type non supporté: ${type}`);
    }

    // Ajouter les instructions personnalisées au prompt si fournies
    if (options.customInstructions?.trim()) {
      prompt += `\n\n═══ INSTRUCTIONS SUPPLÉMENTAIRES DE L'UTILISATEUR ═══\n${options.customInstructions.trim()}`;
    }

    log.info(`📝 Génération ${type} pour notebook "${notebook.title}" (${sources.length} sources)`);

    let generatedText = "";

    // Plus de tokens pour les rapports
    const maxTokens = (type === "full-report" || type.startsWith("report-")) ? 16384 : 8192;

    if (options.onChunk) {
      // Mode streaming
      const { generateTextStream } = await import("../utils/textGeneration");
      generatedText = await generateTextStream({
        prompt,
        temperature: 0.5,
        maxOutputTokens: maxTokens,
        onChunk: options.onChunk,
      });
    } else {
      // Mode classique
      const result = await generateText({
        prompt,
        temperature: 0.5,
        maxOutputTokens: maxTokens,
      });
      generatedText = result.text;
    }

    const doc: GeneratedDocument = {
      id: randomUUID(),
      notebookId,
      type,
      title,
      content: generatedText,
      sourceIds: sources.map(s => s.id),
      createdAt: new Date().toISOString(),
    };

    notebookManager.addGeneratedDocument(notebookId, doc);
    log.info(`✅ Document généré: "${title}" (${generatedText.length} chars)`);

    return doc;
  }

  /**
   * Génère un script de podcast (Audio Overview) — 2 hôtes discutent du contenu.
   */
  async generateAudioOverview(
    notebookId: string,
    options: {
      language?: string;
      duration?: 'short' | 'medium' | 'long';
      sourceIds?: string[];
      tone?: 'casual' | 'academic' | 'humorous' | 'professional';
      customInstructions?: string;
    } = {}
  ): Promise<AudioOverview> {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) throw new Error("Notebook introuvable.");
    if (notebook.sources.length === 0) throw new Error("Aucune source dans ce notebook.");

    // Filtrage des sources si spécifié
    const sources = options.sourceIds && options.sourceIds.length > 0
      ? notebook.sources.filter(s => options.sourceIds!.includes(s.id))
      : notebook.sources;

    if (sources.length === 0) throw new Error("Aucune source sélectionnée.");

    const lang = options.language || sources[0]?.language || "fr";
    const duration = options.duration || "medium";
    const durationMinutes = duration === "short" ? 5 : duration === "medium" ? 10 : 15;
    const tone = options.tone || "casual";

    // Mapping des tons
    const toneInstructions: Record<string, string> = {
      casual: "Ton : décontracté mais informatif, comme un podcast de vulgarisation entre amis",
      academic: "Ton : académique et rigoureux, comme une conférence universitaire en dialogue",
      humorous: "Ton : drôle et léger avec des blagues et analogies amusantes, tout en restant informatif",
      professional: "Ton : professionnel et structuré, comme un briefing entre collègues experts",
    };

    // Contexte condensé des sources
    const sourcesContext = sources.map(s =>
      `## ${s.title}\n${s.summary}\n\nPoints clés :\n${s.keywords.join(", ")}`
    ).join("\n\n---\n\n");

    const customPart = options.customInstructions
      ? `\n- Instructions supplémentaires de l'utilisateur : ${options.customInstructions}`
      : "";

    const prompt = `Tu es un scénariste de podcast éducatif. Génère un script de conversation entre deux hôtes (Alex et Sam) qui discutent du contenu des documents suivants.

SOURCES :
${sourcesContext}

INSTRUCTIONS :
- Durée cible : ~${durationMinutes} minutes de conversation (environ ${durationMinutes * 150} mots)
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

    // Sauvegarder en status "generating"
    notebookManager.addAudioOverview(notebookId, overview);

    try {
      const result = await generateText({
        prompt,
        temperature: 0.7,
        maxOutputTokens: 8192,
      });

      overview.script = result.text;
      overview.status = "ready";
      // Estimer la durée réelle basée sur le nombre de mots (~150 mots/min)
      const wordCount = result.text.split(/\s+/).length;
      overview.estimatedDuration = Math.round((wordCount / 150) * 60);
    } catch (e: any) {
      log.error(`Erreur génération podcast: ${e.message}`);
      overview.status = "error";
      overview.script = `Erreur: ${e.message}`;
    }

    return overview;
  }

  // ─── Prompts spécialisés ─────────────────────────────────────────────────

  private buildSummaryPrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

Génère un résumé synthétique et structuré du contenu suivant. Le résumé doit :
- Capturer les points essentiels de CHAQUE source
- Être organisé avec des titres et sous-titres
- Inclure les conclusions ou recommandations clés
- Faire 500-1000 mots

SOURCES :
${context}

Génère le résumé en Markdown.`;
  }

  private buildFAQPrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

Génère une FAQ complète (15-20 questions) basée sur le contenu suivant. Les questions doivent :
- Couvrir les concepts clés
- Varier entre questions basiques et avancées
- Avoir des réponses concises mais complètes
- Être organisées par thème

SOURCES :
${context}

Format Markdown avec ## pour chaque question et la réponse en dessous.`;
  }

  private buildStudyGuidePrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

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

  private buildBriefingPrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

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

  private buildTimelinePrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

Extrais et organise les événements, dates et jalons mentionnés dans les sources suivantes sous forme de chronologie.
- Ordre chronologique
- Inclure le contexte de chaque événement
- Identifier les relations cause-effet
- Si les dates sont imprécises, utiliser des périodes approximatives

SOURCES :
${context}

Génère la chronologie en Markdown (format tableau ou liste).`;
  }

  private buildOutlinePrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

Crée un plan structuré et détaillé qui synthétise l'ensemble des sources suivantes.
- Structure hiérarchique (I, A, 1, a)
- 3-4 niveaux de profondeur
- Couvrir TOUS les sujets abordés dans les sources
- Inclure des notes sous chaque point

SOURCES :
${context}

Génère le plan en Markdown.`;
  }

  private buildMindmapPrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

Crée une carte mentale (mindmap) structurée qui organise visuellement les concepts des sources suivantes.

INSTRUCTIONS :
- Identifie le THÈME CENTRAL qui relie toutes les sources
- Crée 4-6 BRANCHES PRINCIPALES (catégories/thèmes majeurs)
- Chaque branche a 3-5 SOUS-BRANCHES (concepts, détails)
- Ajoute des CONNEXIONS entre branches quand des liens existent
- Utilise le format Mermaid mindmap pour la représentation visuelle
- Après le diagramme Mermaid, ajoute une section textuelle détaillée

FORMAT ATTENDU :
1. Un bloc \`\`\`mermaid avec le mindmap
2. Une section "## Détails par branche" qui développe chaque nœud

SOURCES :
${context}

Génère la carte mentale complète.`;
  }

  private buildSWOTPrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

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

  private buildGlossaryPrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

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

  private buildFullReportPrompt(context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";
    return `${langInstruction}

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
   * Génère un prompt spécialisé par type de rapport
   */
  private buildReportPrompt(reportType: string, context: string, lang: string): string {
    const langInstruction = lang === "fr" ? "Réponds en français." : "Reply in English.";

    const reportPrompts: Record<string, { title: string; structure: string }> = {
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

    const reportConfig = reportPrompts[reportType];
    if (!reportConfig) {
      return this.buildFullReportPrompt(context, lang);
    }

    return `${langInstruction}

Tu es un expert en rédaction de rapports professionnels. Génère un **${reportConfig.title}** complet et structuré basé sur les sources fournies.

${reportConfig.structure}

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

Génère le ${reportConfig.title} complet en Markdown.`;
  }

  // ─── Suggestions intelligentes de rapports ──────────────────────────────────

  /**
   * Analyse les sources d'un notebook et suggère les rapports les plus pertinents à générer.
   */
  async suggestReports(notebookId: string): Promise<ReportSuggestion[]> {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) throw new Error("Notebook introuvable.");
    if (notebook.sources.length === 0) return [];

    const sourcesInfo = notebook.sources.map(s => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
      keywords: s.keywords,
      wordCount: s.wordCount,
      type: s.type,
      language: s.language,
    }));

    const alreadyGenerated = notebook.generatedDocuments.map(d => d.type);

    const prompt = `Tu es un assistant qui analyse des documents et recommande des rapports à générer.

Voici les sources disponibles dans un notebook :
${sourcesInfo.map((s, i) => `${i + 1}. "${s.title}" (${s.type}, ${s.wordCount} mots) — ${s.summary}\n   Mots-clés: ${s.keywords.join(", ")}`).join("\n\n")}

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
      const result = await generateText({
        prompt,
        temperature: 0.3,
        maxOutputTokens: 4096,
      });

      // Parser le JSON de la réponse
      let suggestions: ReportSuggestion[] = [];
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
        // Valider et nettoyer
        suggestions = suggestions
          .filter(s => s.type && s.title && s.description && s.reason)
          .map(s => ({
            ...s,
            relevance: Math.min(100, Math.max(0, s.relevance || 50)),
            recommendedSourceIds: (s.recommendedSourceIds || []).filter(
              id => notebook.sources.some(src => src.id === id)
            ),
          }));
      }

      log.info(`💡 ${suggestions.length} suggestions de rapports pour "${notebook.title}"`);
      return suggestions;
    } catch (e: any) {
      log.error(`Erreur suggestions rapports: ${e.message}`);
      // Fallback : suggestions basiques basées sur les sources
      return this.getDefaultSuggestions(notebook.sources, alreadyGenerated);
    }
  }

  /**
   * Suggestions par défaut si l'appel IA échoue
   */
  private getDefaultSuggestions(sources: any[], alreadyGenerated: string[]): ReportSuggestion[] {
    const suggestions: ReportSuggestion[] = [];
    const sourceIds = sources.map(s => s.id);

    if (!alreadyGenerated.includes("report-business")) {
      suggestions.push({
        type: "report-business",
        title: "Business Plan",
        description: "Vision, modèle économique, stratégie et projections",
        reason: "Un business plan structure vos idées et valide la viabilité de votre projet",
        relevance: 90,
        recommendedSourceIds: sourceIds,
      });
    }

    if (!alreadyGenerated.includes("report-product")) {
      suggestions.push({
        type: "report-product",
        title: "Rapport produit",
        description: "Roadmap, fonctionnalités prioritaires et parcours utilisateurs",
        reason: "Clarifie la vision produit et priorise les développements",
        relevance: 85,
        recommendedSourceIds: sourceIds,
      });
    }

    if (!alreadyGenerated.includes("report-market")) {
      suggestions.push({
        type: "report-market",
        title: "Étude de marché",
        description: "Taille du marché, segments, tendances et concurrence",
        reason: "Valide le potentiel marché et identifie les opportunités",
        relevance: 80,
        recommendedSourceIds: sourceIds,
      });
    }

    if (!alreadyGenerated.includes("report-executive")) {
      suggestions.push({
        type: "report-executive",
        title: "Synthèse exécutive",
        description: "Résumé décisionnel concis pour les parties prenantes",
        reason: "Permet de communiquer rapidement les points essentiels",
        relevance: 75,
        recommendedSourceIds: sourceIds,
      });
    }

    if (!alreadyGenerated.includes("report-risk")) {
      suggestions.push({
        type: "report-risk",
        title: "Analyse des risques",
        description: "Risques identifiés, probabilité et plans de mitigation",
        reason: "Anticipe les problèmes et prépare des plans de contingence",
        relevance: 70,
        recommendedSourceIds: sourceIds,
      });
    }

    return suggestions.slice(0, 5);
  }
}


export const contentGenerator = new ContentGenerator();
