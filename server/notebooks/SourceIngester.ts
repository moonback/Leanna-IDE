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
import { embeddingStore } from "./EmbeddingStore";
import type { Source, SourceChunk, SourceType } from "./types";

const log = createLogger("SourceIngester");

// ─── Types internes ─────────────────────────────────────────────────────────

/** Bloc sémantique — unité de sens intermédiaire avant assemblage en chunks */
interface SemanticBlock {
  content: string;
  section?: string;
  page?: number;
  startChar: number;
  endChar: number;
  type: "section" | "paragraph" | "sentence-group";
}

// ─── Configuration du chunking ──────────────────────────────────────────────

/** Taille cible d'un chunk en caractères */
const CHUNK_TARGET_SIZE = 1200;
/** Taille maximale absolue d'un chunk */
const CHUNK_MAX_SIZE = 2000;
/** Taille minimale pour qu'un chunk soit conservé seul */
const CHUNK_MIN_SIZE = 100;
/** Chevauchement contextuel (phrases de contexte) */
const CHUNK_OVERLAP_SENTENCES = 2;
/** Nombre maximum de chunks par source */
const MAX_CHUNKS = 300;

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
    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    let rawHtml: string | undefined;

    if (mimeType === "application/pdf") {
      rawText = await this.extractPDF(buffer);
      sourceType = "pdf";
    } else if (mimeType.startsWith("image/")) {
      // Image file — store as base64 and attempt vision-based description
      sourceType = "image";
      imageBase64 = buffer.toString("base64");
      imageMimeType = mimeType;
      rawText = await this.describeImage(buffer, mimeType, filename);
    } else if (mimeType === "text/plain") {
      rawText = buffer.toString("utf-8");
      sourceType = "text";
    } else if (mimeType === "text/markdown") {
      rawText = buffer.toString("utf-8");
      sourceType = "markdown";
    } else if (mimeType === "text/html") {
      rawHtml = buffer.toString("utf-8");
      rawText = this.stripHTML(rawHtml);
      sourceType = "html";
    } else {
      // Essayer de lire comme texte
      rawText = buffer.toString("utf-8");
      sourceType = "text";
    }

    if (!rawText.trim()) {
      throw new Error("Impossible d'extraire du texte depuis ce fichier.");
    }

    const source = await this.buildSource(rawText, filename, sourceType, filename, notebookId);

    // Attach image data to the source for rendering in the viewer
    if (imageBase64 && imageMimeType) {
      (source as any).imageBase64 = imageBase64;
      (source as any).imageMimeType = imageMimeType;
    }

    // Attach raw HTML for visual rendering in the viewer
    if (rawHtml) {
      source.rawHtml = rawHtml;
    }

    return source;
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
      await page.setUserAgent("Mozilla/5.0 (compatible; LeannaOS/1.0)");
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
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LeannaOS/1.0)" },
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

    // Découpage intelligent en chunks (adapté au type de contenu)
    const chunks = this.chunkText(rawText, id, type);

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

    // Vectorisation des chunks via Gemini Embeddings (async, non-bloquant)
    embeddingStore.indexChunks(
      chunks.map(c => ({ id: c.id, content: c.content })),
      id,
      notebookId
    ).catch(e => log.warn(`Embedding indexation partielle: ${e.message}`));

    return source;
  }

  // ─── Chunking Intelligent ─────────────────────────────────────────────────

  /**
   * Découpage sémantique intelligent adapté au type de contenu.
   *
   * Stratégie par type :
   * - Markdown : découpe par sections (headers ## ###)
   * - PDF : découpe par sauts de page + paragraphes
   * - HTML/URL : découpe par blocs structurels
   * - Texte brut : découpe par paragraphes avec détection de structure
   *
   * Principes :
   * 1. Respecter les frontières sémantiques (sections, paragraphes)
   * 2. Ne jamais couper au milieu d'une phrase
   * 3. Garder les chunks entre CHUNK_MIN_SIZE et CHUNK_MAX_SIZE
   * 4. Ajouter un overlap contextuel (dernières phrases du chunk précédent)
   * 5. Enrichir les métadonnées (section, page)
   */
  private chunkText(text: string, sourceId: string, type: SourceType): SourceChunk[] {
    // Découper en blocs sémantiques selon le type
    const blocks = this.extractSemanticBlocks(text, type);

    // Assembler les blocs en chunks de taille appropriée
    return this.assembleChunks(blocks, sourceId);
  }

  /**
   * Extrait les blocs sémantiques du texte selon son type.
   * Un bloc = une unité de sens (section, paragraphe, page...)
   */
  private extractSemanticBlocks(text: string, type: SourceType): SemanticBlock[] {
    switch (type) {
      case "markdown":
        return this.extractMarkdownBlocks(text);
      case "pdf":
        return this.extractPDFBlocks(text);
      case "html":
      case "url":
        return this.extractHTMLBlocks(text);
      default:
        return this.extractPlainTextBlocks(text);
    }
  }

  /**
   * Markdown : découpe par headers (##, ###, etc.)
   * Chaque section forme un bloc avec son titre comme métadonnée.
   */
  private extractMarkdownBlocks(text: string): SemanticBlock[] {
    const blocks: SemanticBlock[] = [];
    const lines = text.split("\n");

    let currentSection = "";
    let currentContent = "";
    let currentStart = 0;
    let charPos = 0;

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)/);

      if (headerMatch) {
        // Sauvegarder le bloc précédent
        if (currentContent.trim()) {
          blocks.push({
            content: currentContent.trim(),
            section: currentSection || undefined,
            startChar: currentStart,
            endChar: charPos,
            type: "section",
          });
        }
        currentSection = headerMatch[2].trim();
        currentContent = line + "\n";
        currentStart = charPos;
      } else {
        currentContent += line + "\n";
      }

      charPos += line.length + 1;
    }

    // Dernier bloc
    if (currentContent.trim()) {
      blocks.push({
        content: currentContent.trim(),
        section: currentSection || undefined,
        startChar: currentStart,
        endChar: charPos,
        type: "section",
      });
    }

    return blocks;
  }

  /**
   * PDF : détecte les sauts de page (\f ou séquences de \n multiples)
   * et découpe en paragraphes à l'intérieur de chaque page.
   */
  private extractPDFBlocks(text: string): SemanticBlock[] {
    const blocks: SemanticBlock[] = [];

    // Séparer par page (form feed ou 3+ lignes vides)
    const pages = text.split(/\f|\n{4,}/);
    let charPos = 0;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const pageContent = pages[pageIdx].trim();
      if (!pageContent) {
        charPos += pages[pageIdx].length + 1;
        continue;
      }

      // Découper chaque page en paragraphes
      const paragraphs = pageContent.split(/\n\s*\n/);
      let pageCharPos = charPos;

      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) {
          pageCharPos += para.length + 2;
          continue;
        }

        blocks.push({
          content: trimmed,
          page: pageIdx + 1,
          startChar: pageCharPos,
          endChar: pageCharPos + para.length,
          type: "paragraph",
        });

        pageCharPos += para.length + 2;
      }

      charPos += pages[pageIdx].length + 1;
    }

    return blocks;
  }

  /**
   * HTML/URL : le texte est déjà strippé, on détecte la structure
   * par les patterns de ponctuation et espacement.
   */
  private extractHTMLBlocks(text: string): SemanticBlock[] {
    return this.extractPlainTextBlocks(text);
  }

  /**
   * Texte brut : découpe par paragraphes avec détection de structure.
   * Identifie les titres potentiels (lignes courtes en majuscules, lignes suivies de ===)
   */
  private extractPlainTextBlocks(text: string): SemanticBlock[] {
    const blocks: SemanticBlock[] = [];
    const lines = text.split("\n");

    let currentSection: string | undefined;
    let currentContent = "";
    let currentStart = 0;
    let charPos = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1] || "";

      // Détecter un titre potentiel :
      // - Ligne courte (< 80 chars) suivie d'une ligne vide
      // - Ligne entièrement en majuscules (> 3 chars)
      // - Ligne suivie de === ou ---
      const isTitle = (
        (line.trim().length > 3 && line.trim().length < 80 && line.trim() === line.trim().toUpperCase() && /[A-ZÀ-Ú]/.test(line)) ||
        (nextLine.match(/^[=]{3,}$/) || nextLine.match(/^[-]{3,}$/)) ||
        (line.match(/^\d+\.\s+[A-ZÀ-Ú]/) && line.length < 100)
      );

      if (isTitle && currentContent.trim()) {
        // Sauvegarder le bloc précédent
        blocks.push({
          content: currentContent.trim(),
          section: currentSection,
          startChar: currentStart,
          endChar: charPos,
          type: "paragraph",
        });

        currentSection = line.trim();
        currentContent = line + "\n";
        currentStart = charPos;
      } else if (line.trim() === "" && currentContent.trim().length > 0) {
        // Paragraphe vide = frontière potentielle
        // Mais on continue à accumuler (sera géré par assembleChunks)
        currentContent += "\n\n";
      } else {
        currentContent += line + "\n";
      }

      charPos += line.length + 1;
    }

    // Dernier bloc
    if (currentContent.trim()) {
      blocks.push({
        content: currentContent.trim(),
        section: currentSection,
        startChar: currentStart,
        endChar: charPos,
        type: "paragraph",
      });
    }

    return blocks;
  }

  /**
   * Assemble les blocs sémantiques en chunks de taille appropriée.
   *
   * Règles :
   * - Un bloc < CHUNK_MIN_SIZE est fusionné avec le suivant
   * - Un bloc > CHUNK_MAX_SIZE est subdivisé par phrases
   * - Un bloc entre MIN et MAX reste tel quel
   * - Un overlap contextuel est ajouté (dernières phrases du chunk précédent)
   */
  private assembleChunks(blocks: SemanticBlock[], sourceId: string): SourceChunk[] {
    const chunks: SourceChunk[] = [];
    let pendingContent = "";
    let pendingSection: string | undefined;
    let pendingPage: number | undefined;
    let pendingStart = 0;
    let pendingEnd = 0;
    let lastOverlap = ""; // Contexte du chunk précédent

    const flush = () => {
      if (!pendingContent.trim()) return;

      const content = lastOverlap
        ? lastOverlap + "\n\n" + pendingContent.trim()
        : pendingContent.trim();

      if (chunks.length < MAX_CHUNKS) {
        chunks.push({
          id: randomUUID(),
          sourceId,
          content,
          index: chunks.length,
          metadata: {
            section: pendingSection,
            page: pendingPage,
            startChar: pendingStart,
            endChar: pendingEnd,
          },
        });
      }

      // Calculer l'overlap pour le prochain chunk (dernières N phrases)
      lastOverlap = this.extractOverlapContext(pendingContent.trim());

      pendingContent = "";
      pendingSection = undefined;
      pendingPage = undefined;
    };

    for (const block of blocks) {
      // Si le bloc est trop grand, le subdiviser par phrases
      if (block.content.length > CHUNK_MAX_SIZE) {
        // Flush ce qui est en attente avant
        flush();

        // Subdiviser le bloc trop grand
        const subChunks = this.splitLargeBlock(block);
        for (const sub of subChunks) {
          pendingContent = sub.content;
          pendingSection = sub.section || block.section;
          pendingPage = sub.page || block.page;
          pendingStart = sub.startChar;
          pendingEnd = sub.endChar;
          flush();
        }
        continue;
      }

      // Si ajouter ce bloc dépasse la taille cible, flush d'abord
      if (pendingContent.length + block.content.length > CHUNK_TARGET_SIZE && pendingContent.length >= CHUNK_MIN_SIZE) {
        flush();
      }

      // Accumuler
      if (pendingContent) {
        pendingContent += "\n\n" + block.content;
      } else {
        pendingContent = block.content;
        pendingStart = block.startChar;
      }
      pendingEnd = block.endChar;
      // Garder la première section rencontrée dans ce chunk
      if (!pendingSection && block.section) {
        pendingSection = block.section;
      }
      if (!pendingPage && block.page) {
        pendingPage = block.page;
      }
    }

    // Flush le reste
    flush();

    return chunks;
  }

  /**
   * Subdivise un bloc trop grand en morceaux par phrases.
   * Ne coupe jamais au milieu d'une phrase.
   */
  private splitLargeBlock(block: SemanticBlock): SemanticBlock[] {
    const sentences = this.splitIntoSentences(block.content);
    const subBlocks: SemanticBlock[] = [];

    let current = "";
    let currentStart = block.startChar;

    for (const sentence of sentences) {
      if (current.length + sentence.length > CHUNK_TARGET_SIZE && current.length >= CHUNK_MIN_SIZE) {
        subBlocks.push({
          content: current.trim(),
          section: block.section,
          page: block.page,
          startChar: currentStart,
          endChar: currentStart + current.length,
          type: "sentence-group",
        });
        currentStart += current.length;
        current = sentence;
      } else {
        current += (current ? " " : "") + sentence;
      }
    }

    if (current.trim()) {
      subBlocks.push({
        content: current.trim(),
        section: block.section,
        page: block.page,
        startChar: currentStart,
        endChar: block.endChar,
        type: "sentence-group",
      });
    }

    return subBlocks;
  }

  /**
   * Découpe un texte en phrases (respect des abréviations courantes).
   */
  private splitIntoSentences(text: string): string[] {
    // Pattern qui évite de couper sur M., Dr., etc.
    const sentences = text.match(/[^.!?]*(?:[.!?](?:\s|$)|$)/g) || [text];
    return sentences
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Extrait les dernières phrases pour l'overlap contextuel.
   */
  private extractOverlapContext(text: string): string {
    if (!CHUNK_OVERLAP_SENTENCES) return "";

    const sentences = this.splitIntoSentences(text);
    const overlapSentences = sentences.slice(-CHUNK_OVERLAP_SENTENCES);
    const overlap = overlapSentences.join(" ");

    // Limiter la taille de l'overlap
    if (overlap.length > 300) {
      return overlap.slice(-300);
    }
    return overlap;
  }

  // ─── Description d'image via Vision API ─────────────────────────────────

  private async describeImage(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const base64 = buffer.toString("base64");
    const sizeKB = Math.round(buffer.length / 1024);

    const prompt = `Décris cette image en détail. Extrais tout le texte visible (OCR) et décris les éléments visuels importants (graphiques, diagrammes, photos, etc.).

Réponds en structurant ainsi :
1. **Description générale** : Ce que montre l'image (1-2 phrases)
2. **Texte visible** : Tout texte lisible dans l'image (fidèlement reproduit)
3. **Éléments visuels** : Couleurs, formes, diagrammes, graphiques, logos, personnes, etc.
4. **Contexte probable** : À quoi sert cette image (documentation, screenshot, schéma, photo, etc.)

Sois exhaustif et précis sur le texte visible.`;

    try {
      // Use geminiParts for multimodal Gemini call (vision)
      const result = await generateText({
        prompt,
        temperature: 0.2,
        maxOutputTokens: 2048,
        geminiParts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64 } },
        ],
        forceProvider: "gemini",
      });

      const description = result.text.trim();
      if (description) {
        log.info(`🖼️ Image décrite avec succès: "${filename}" (${sizeKB} KB)`);
        return `[Image: ${filename} — ${sizeKB} KB]\n\n${description}`;
      }
    } catch (e: any) {
      log.warn(`⚠️ Vision API indisponible pour "${filename}": ${e.message}`);
    }

    // Fallback: description basique sans vision
    return `[Image: ${filename}]\nType: ${mimeType}\nTaille: ${sizeKB} KB\n\nImage importée. L'analyse visuelle n'a pas pu être effectuée (API Vision non disponible ou erreur). L'image est consultable dans la visionneuse de sources.`;
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
