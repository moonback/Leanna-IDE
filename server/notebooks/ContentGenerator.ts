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
import type { GeneratedDocument, GeneratedDocType, AudioOverview } from "./types";

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
      default:
        throw new Error(`Type non supporté: ${type}`);
    }

    // Ajouter les instructions personnalisées au prompt si fournies
    if (options.customInstructions?.trim()) {
      prompt += `\n\n═══ INSTRUCTIONS SUPPLÉMENTAIRES DE L'UTILISATEUR ═══\n${options.customInstructions.trim()}`;
    }

    log.info(`📝 Génération ${type} pour notebook "${notebook.title}" (${sources.length} sources)`);

    let generatedText = "";

    if (options.onChunk) {
      // Mode streaming
      const { generateTextStream } = await import("../utils/textGeneration");
      generatedText = await generateTextStream({
        prompt,
        temperature: 0.5,
        maxOutputTokens: 8192,
        onChunk: options.onChunk,
      });
    } else {
      // Mode classique
      const result = await generateText({
        prompt,
        temperature: 0.5,
        maxOutputTokens: 8192,
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
}

export const contentGenerator = new ContentGenerator();
