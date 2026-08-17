/**
 * SourceIngester — Ingestion, extraction et chunking des sources
 *
 * Responsable de :
 * - Extraction du texte depuis PDF, texte, URL, etc.
 * - Découpage en chunks pour le RAG
 * - Génération de résumés automatiques
 * - Extraction de mots-clés
 */

import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger";
import { generateText } from "../utils/textGeneration";
import type { Source, SourceChunk, SourceType } from "./types";

const log = createLogger("SourceIngester");

// ─── Configuration du chunking ──────────────────────────────────────────────

/** Taille cible d'un chunk en caractères */
const CHUNK_SIZE = 1500;
/** Chevauchement entre chunks pour le contexte */
const CHUNK_OVERLAP = 200;
/** Nombre maximum de chunks par source */
const MAX_CHUNKS = 200;

// ═══════════════════════════════════════════════════════════════════════════════

export class SourceIngester {

  // ─── Ingestion depuis un Buffer (upload de fichier) ──────────────────────

  async ingestFromBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    notebookId: string
  ): Promise<Source> {
    log.info(`📥 Ingestion: "${filename}" (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB)`);

    let rawText = "";
    let sourceType: SourceType = "text";

    if (mimeType === "application/pdf") {
      rawText = await this.extractPDF(buffer);
      sourceType = "pdf";
    } else if (mimeType === "text/plain") {
      rawText = buffer.toString("utf-8");
      sourceType = "text";
    } else if (mimeType === "text/markdown") {
      rawText = buffer.toString("utf-8");
      sourceType = "markdown";
    } else if (mimeType === "text/html") {
      rawText = this.stripHTML(buffer.toString("utf-8"));
      sourceType = "html";
    } else {
      // Essayer de lire comme texte
      rawText = buffer.toString("utf-8");
      sourceType = "text";
    }

    if (!rawText.trim()) {
      throw new Error("Impossible d'extraire du texte depuis ce fichier.");
    }

    return this.buildSource(rawText, filename, sourceType, filename, notebookId);
  }

  // ─── Ingestion depuis une URL ────────────────────────────────────────────

  async ingestFromURL(url: string, notebookId: string): Promise<Source> {
    log.info(`🌐 Ingestion URL: ${url}`);

    let rawText = "";
    let title = url;
    let sourceType: SourceType = "url";

    // YouTube detection
    if (url.match(/youtube\.com\/watch|youtu\.be\//)) {
      sourceType = "youtube";
      // Pour YouTube, on extrait la description/metadata via fetch simple
      // (transcription nécessiterait une API dédiée)
    }

    try {
      // Extraction via Puppeteer pour les pages web
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (compatible; JarvisOS/1.0)");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      title = await page.title() || url;

      // Extraire le texte principal
      rawText = await page.evaluate(() => {
        // Retirer scripts, styles, nav, footer
        const elementsToRemove = document.querySelectorAll(
          "script, style, nav, footer, header, aside, .ad, .advertisement, .sidebar"
        );
        elementsToRemove.forEach(el => el.remove());

        // Préférer article > main > body
        const article = document.querySelector("article");
        const main = document.querySelector("main");
        const target = article || main || document.body;

        return target?.innerText || "";
      });

      await browser.close();
    } catch (e: any) {
      log.warn(`Puppeteer failed, fallback fetch: ${e.message}`);
      // Fallback: fetch simple
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JarvisOS/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      const html = await response.text();
      title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || url;
      rawText = this.stripHTML(html);
    }

    if (!rawText.trim()) {
      throw new Error("Impossible d'extraire du contenu depuis cette URL.");
    }

    return this.buildSource(rawText, title, sourceType, url, notebookId);
  }

  // ─── Construction de la source (commun) ──────────────────────────────────

  private async buildSource(
    rawText: string,
    title: string,
    type: SourceType,
    origin: string,
    notebookId: string
  ): Promise<Source> {
    const id = randomUUID();

    // Découpage en chunks
    const chunks = this.chunkText(rawText, id);

    // Comptage de mots
    const wordCount = rawText.split(/\s+/).filter(w => w.length > 0).length;

    // Détection de langue simple
    const language = this.detectLanguage(rawText);

    // Génération du résumé et mots-clés via LLM
    const { summary, keywords } = await this.generateSummaryAndKeywords(rawText, title);

    const source: Source = {
      id,
      notebookId,
      title,
      type,
      origin,
      rawText: rawText.slice(0, 500_000), // Limite à 500K chars
      summary,
      keywords,
      chunks,
      wordCount,
      language,
      addedAt: new Date().toISOString(),
      originalSize: Buffer.byteLength(rawText, "utf-8"),
    };

    log.info(`✅ Source créée: "${title}" — ${wordCount} mots, ${chunks.length} chunks`);
    return source;
  }

  // ─── Chunking ────────────────────────────────────────────────────────────

  /**
   * Découpe le texte en chunks avec chevauchement.
   * Essaie de couper aux limites de paragraphes/phrases.
   */
  private chunkText(text: string, sourceId: string): SourceChunk[] {
    const chunks: SourceChunk[] = [];
    const paragraphs = text.split(/\n\s*\n/);
    let currentChunk = "";
    let currentStart = 0;
    let charPos = 0;

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > CHUNK_SIZE && currentChunk.length > 0) {
        // Sauvegarder le chunk actuel
        chunks.push({
          id: randomUUID(),
          sourceId,
          content: currentChunk.trim(),
          index: chunks.length,
          metadata: {
            startChar: currentStart,
            endChar: charPos,
          },
        });

        if (chunks.length >= MAX_CHUNKS) break;

        // Chevauchement : garder la fin du chunk précédent
        const overlapText = currentChunk.slice(-CHUNK_OVERLAP);
        currentChunk = overlapText + "\n\n" + paragraph;
        currentStart = charPos - CHUNK_OVERLAP;
      } else {
        if (currentChunk) {
          currentChunk += "\n\n" + paragraph;
        } else {
          currentChunk = paragraph;
          currentStart = charPos;
        }
      }
      charPos += paragraph.length + 2; // +2 pour le \n\n
    }

    // Dernier chunk
    if (currentChunk.trim() && chunks.length < MAX_CHUNKS) {
      chunks.push({
        id: randomUUID(),
        sourceId,
        content: currentChunk.trim(),
        index: chunks.length,
        metadata: {
          startChar: currentStart,
          endChar: charPos,
        },
      });
    }

    return chunks;
  }

  // ─── Extraction PDF ──────────────────────────────────────────────────────

  private async extractPDF(buffer: Buffer): Promise<string> {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      return result.text || "";
    } catch (e: any) {
      log.error(`Erreur extraction PDF: ${e.message}`);
      throw new Error(`Impossible de lire le PDF: ${e.message}`);
    }
  }

  // ─── Strip HTML ──────────────────────────────────────────────────────────

  private stripHTML(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ─── Détection de langue ─────────────────────────────────────────────────

  private detectLanguage(text: string): string {
    const sample = text.slice(0, 2000).toLowerCase();
    const frenchWords = ["le", "la", "les", "de", "du", "des", "un", "une", "est", "sont", "dans", "pour", "avec", "qui", "que"];
    const englishWords = ["the", "is", "are", "and", "or", "for", "with", "that", "this", "from", "have", "has"];

    const frCount = frenchWords.filter(w => sample.includes(` ${w} `)).length;
    const enCount = englishWords.filter(w => sample.includes(` ${w} `)).length;

    return frCount > enCount ? "fr" : "en";
  }

  // ─── Génération résumé + mots-clés via LLM ──────────────────────────────

  private async generateSummaryAndKeywords(
    text: string,
    title: string
  ): Promise<{ summary: string; keywords: string[] }> {
    try {
      const textSample = text.slice(0, 30_000);
      const prompt = `Analyse ce document intitulé "${title}".

TEXTE :
${textSample}

Réponds en JSON strict avec :
{
  "summary": "Résumé concis en 3-5 phrases des points clés du document.",
  "keywords": ["mot-clé 1", "mot-clé 2", ..., "mot-clé 10"]
}

Pas d'explication supplémentaire, uniquement le JSON.`;

      const result = await generateText({
        prompt,
        temperature: 0.3,
        maxOutputTokens: 1024,
      });

      // Parser le JSON de la réponse
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || "Résumé non disponible.",
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10) : [],
        };
      }
    } catch (e: any) {
      log.warn(`Erreur génération résumé: ${e.message}`);
    }

    // Fallback : résumé basique
    const firstSentences = text.split(/[.!?]\s/).slice(0, 3).join(". ") + ".";
    return {
      summary: firstSentences.slice(0, 500),
      keywords: [],
    };
  }
}

export const sourceIngester = new SourceIngester();
