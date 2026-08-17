/**
 * GroundedChat — Chat Q&A ancré sur les sources du notebook
 *
 * Utilise le RAGEngine pour retrouver le contexte pertinent,
 * puis génère une réponse avec citations via Gemini/OpenRouter.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger";
import { generateText } from "../utils/textGeneration";
import { ragEngine } from "./RAGEngine";
import { notebookManager } from "./NotebookManager";
import type { ChatMessage, Citation } from "./types";

const log = createLogger("GroundedChat");

// ─── System Prompt pour le chat groundé ──────────────────────────────────────

const GROUNDED_SYSTEM_PROMPT = `Tu es un assistant de recherche intelligent. Tu réponds aux questions de l'utilisateur en te basant EXCLUSIVEMENT sur les sources fournies dans le contexte.

RÈGLES STRICTES :
1. Base tes réponses UNIQUEMENT sur le contenu des sources fournies.
2. Cite tes sources en utilisant le format [SOURCE N] dans ta réponse (N = numéro de la source).
3. Si l'information n'est pas dans les sources, dis-le clairement : "Cette information n'est pas couverte par vos sources."
4. Ne fabrique JAMAIS d'informations. Reste factuel.
5. Structure tes réponses avec des paragraphes clairs et des bullet points si approprié.
6. Réponds dans la même langue que la question de l'utilisateur.
7. Si plusieurs sources se contredisent, mentionne-le et cite les deux.

FORMAT DE RÉPONSE :
- Réponse structurée et concise
- Citations [SOURCE N] intégrées dans le texte
- Section "Sources citées" en fin de réponse si > 2 citations`;

// ═══════════════════════════════════════════════════════════════════════════════

export class GroundedChat {

  /**
   * Envoie une question au notebook et retourne une réponse groundée avec citations.
   */
  async ask(notebookId: string, question: string): Promise<ChatMessage> {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook) {
      throw new Error("Notebook introuvable.");
    }

    if (notebook.sources.length === 0) {
      return this.buildMessage(
        "assistant",
        "Ce notebook ne contient aucune source. Ajoutez des documents (PDF, textes, URLs) pour pouvoir poser des questions.",
        []
      );
    }

    // 1. Sauvegarder le message utilisateur
    const userMessage: ChatMessage = this.buildMessage("user", question, []);
    notebookManager.addChatMessage(notebookId, userMessage);

    // 2. Recherche RAG dans les chunks des sources
    const ragResults = ragEngine.search(question, notebook.sources, {
      maxChunks: 8,
      minRelevance: 0.1,
    });

    // 3. Construire le contexte groundé
    const context = ragEngine.buildContext(ragResults);

    // 4. Construire le prompt avec l'historique récent
    const recentHistory = notebook.chatHistory.slice(-6).map(msg =>
      `${msg.role === "user" ? "Utilisateur" : "Assistant"}: ${msg.content}`
    ).join("\n\n");

    const fullPrompt = `${GROUNDED_SYSTEM_PROMPT}

═══ CONTEXTE DES SOURCES ═══

${context}

═══ HISTORIQUE RÉCENT ═══

${recentHistory || "(première question)"}

═══ QUESTION DE L'UTILISATEUR ═══

${question}

Réponds en te basant sur les sources ci-dessus. Cite tes sources avec [SOURCE N].`;

    // 5. Génération de la réponse
    let responseText = "";
    try {
      const result = await generateText({
        prompt: fullPrompt,
        temperature: 0.4,
        maxOutputTokens: 4096,
      });
      responseText = result.text;
    } catch (e: any) {
      log.error(`Erreur génération réponse: ${e.message}`);
      responseText = "Désolé, une erreur est survenue lors de la génération de la réponse. Veuillez réessayer.";
    }

    // 6. Extraire les citations
    const citations = ragEngine.extractCitations(responseText, ragResults);

    // 7. Construire et sauvegarder le message assistant
    const assistantMessage = this.buildMessage("assistant", responseText, citations);
    notebookManager.addChatMessage(notebookId, assistantMessage);

    return assistantMessage;
  }

  /**
   * Chat multi-turn : prend en compte le contexte conversationnel.
   */
  async askWithContext(
    notebookId: string,
    question: string,
    additionalContext?: string
  ): Promise<ChatMessage> {
    if (additionalContext) {
      const enrichedQuestion = `${question}\n\nContexte additionnel: ${additionalContext}`;
      return this.ask(notebookId, enrichedQuestion);
    }
    return this.ask(notebookId, question);
  }

  /**
   * Suggère des questions pertinentes basées sur le contenu des sources.
   */
  async suggestQuestions(notebookId: string): Promise<string[]> {
    const notebook = notebookManager.getNotebook(notebookId);
    if (!notebook || notebook.sources.length === 0) return [];

    // Prendre un échantillon des résumés des sources
    const summaries = notebook.sources
      .map(s => `- "${s.title}": ${s.summary}`)
      .slice(0, 5)
      .join("\n");

    try {
      const result = await generateText({
        prompt: `Voici les résumés de documents dans un notebook de recherche :

${summaries}

Génère exactement 5 questions intéressantes et pertinentes que l'utilisateur pourrait poser sur ces documents. Les questions doivent être variées (compréhension, comparaison, synthèse, détail).

Réponds en JSON strict :
["question 1", "question 2", "question 3", "question 4", "question 5"]`,
        temperature: 0.7,
        maxOutputTokens: 512,
      });

      const match = result.text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed.slice(0, 5);
      }
    } catch (e: any) {
      log.warn(`Erreur suggestion questions: ${e.message}`);
    }

    return [];
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private buildMessage(role: "user" | "assistant", content: string, citations: Citation[]): ChatMessage {
    return {
      id: randomUUID(),
      role,
      content,
      citations,
      timestamp: new Date().toISOString(),
    };
  }
}

export const groundedChat = new GroundedChat();
