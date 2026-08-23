/**
 * Routes API â€” Notebooks (concurrent NotebookLM)
 *
 * Endpoints pour gÃ©rer les notebooks, sources, chat groundÃ©,
 * gÃ©nÃ©ration de contenu et audio overviews.
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { notebookManager, sourceIngester, groundedChat, contentGenerator, embeddingStore } from "../notebooks";
import { backupService } from "../notebooks/BackupService";
import { sourceProcessingQueue } from "../notebooks/ProcessingQueue";
import { chatResponseCache, ragSearchCache } from "../notebooks/ResponseCache";
import type { GeneratedDocType, ReportSuggestion } from "../notebooks/types";
import { getProjectRoot } from "../utils/pathUtils";
import { getSandboxRoot } from "../utils/sandbox";

// Configuration multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|txt|md|html|docx|doc|rtf|csv|json|yaml|yml|png|jpg|jpeg|gif|webp|bmp|svg)$/i;
    if (
      file.originalname.match(allowed) ||
      file.mimetype.startsWith("text/") ||
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/json"
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Type non supportÃ©: ${file.mimetype}`));
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVEAL.JS SLIDE GENERATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Thème CSS Jarvis dark — v2 pro */
const JARVIS_THEME_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  :root {
    --r-background-color: #080c14;
    --r-main-font: 'Inter', 'Segoe UI', system-ui, sans-serif;
    --r-main-font-size: 36px;
    --r-main-color: #cbd5e1;
    --r-block-margin: 16px;
    --r-heading-margin: 0 0 16px 0;
    --r-heading-font: 'Inter', 'Segoe UI', system-ui, sans-serif;
    --r-heading-color: #f1f5f9;
    --r-heading-line-height: 1.15;
    --r-heading-letter-spacing: -0.03em;
    --r-heading-text-transform: none;
    --r-heading-text-shadow: none;
    --r-heading-font-weight: 800;
    --r-h1-size: 1.9em;
    --r-h2-size: 1.3em;
    --r-h3-size: 1.0em;
    --r-link-color: #60a5fa;
    --r-link-color-hover: #93c5fd;
    --r-selection-background-color: rgba(99,102,241,0.35);
    --r-selection-color: #fff;
    --blue: #3b82f6;
    --purple: #8b5cf6;
    --cyan: #06b6d4;
    --glow: rgba(59,130,246,0.18);
  }

  /* ── Background ── */
  .reveal-viewport {
    background: #080c14;
    background-image:
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(59,130,246,0.12) 0%, transparent 60%),
      radial-gradient(ellipse 60% 40% at 80% 110%, rgba(139,92,246,0.10) 0%, transparent 55%);
  }
  .reveal { background: transparent; }

  /* SVG dot-grid overlay on every slide */
  .reveal .slides section::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(148,163,184,0.06) 1px, transparent 1px);
    background-size: 28px 28px;
    pointer-events: none;
    z-index: 0;
  }
  .reveal .slides section > * { position: relative; z-index: 1; }

  /* ── Global layout ── */
  .reveal .slides section {
    text-align: left;
    padding: 28px 44px;
    box-sizing: border-box;
    overflow: visible;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .reveal .slides section.title-slide {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 60px;
  }

  /* ── Typography ── */
  .reveal h1 {
    font-size: var(--r-h1-size);
    font-weight: 800;
    letter-spacing: -0.04em;
    background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #67e8f9 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.1;
    margin-bottom: 0;
  }
  .reveal h2 {
    font-size: var(--r-h2-size);
    font-weight: 700;
    color: #f1f5f9;
    letter-spacing: -0.03em;
    margin-bottom: 0;
  }
  .reveal h3 { font-size: var(--r-h3-size); font-weight: 600; color: #94a3b8; letter-spacing: -0.01em; margin-bottom: 8px; text-transform: uppercase; font-size: 0.6em; letter-spacing: 0.12em; }
  .reveal p { color: #94a3b8; font-size: 0.82em; line-height: 1.65; margin-bottom: 0.6em; }

  /* ── Lists ── */
  .reveal ul, .reveal ol { margin-left: 0; padding-left: 0; list-style: none; }
  .reveal ul li, .reveal ol li {
    color: #cbd5e1;
    font-size: 0.82em;
    line-height: 1.45;
    margin-bottom: 0.38em;
    padding-left: 1.4em;
    position: relative;
  }
  .reveal ul li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--blue), var(--purple));
  }
  .reveal ol { counter-reset: ol-counter; }
  .reveal ol li::before {
    content: counter(ol-counter);
    counter-increment: ol-counter;
    position: absolute;
    left: 0;
    top: 0.05em;
    width: 1.1em;
    height: 1.1em;
    border-radius: 50%;
    background: rgba(59,130,246,0.15);
    border: 1px solid rgba(59,130,246,0.35);
    color: #60a5fa;
    font-size: 0.72em;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  /* ── Inline code / pre ── */
  .reveal strong { color: #93c5fd; font-weight: 600; }
  .reveal em { color: #a78bfa; font-style: italic; }
  .reveal code {
    background: rgba(99,102,241,0.12);
    border: 1px solid rgba(99,102,241,0.28);
    border-radius: 5px;
    padding: 1px 7px;
    color: #c4b5fd;
    font-size: 0.82em;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  }
  .reveal pre {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 12px;
    padding: 20px 24px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04);
    margin: 12px 0;
  }
  .reveal pre code {
    background: transparent;
    border: none;
    padding: 0;
    color: #c9d1d9;
    font-size: 0.78em;
    display: block;
    line-height: 1.6;
  }

  /* ── Blockquote — callout style ── */
  .reveal blockquote {
    background: linear-gradient(135deg, rgba(59,130,246,0.07), rgba(139,92,246,0.05));
    border: 1px solid rgba(59,130,246,0.2);
    border-left: 3px solid var(--blue);
    border-radius: 0 10px 10px 0;
    padding: 14px 20px;
    color: #94a3b8;
    font-style: normal;
    font-size: 0.8em;
    margin: 12px 0;
    box-shadow: 0 2px 12px rgba(59,130,246,0.06);
  }
  .reveal blockquote::before {
    content: '"';
    display: block;
    font-size: 2em;
    line-height: 0.5;
    color: rgba(59,130,246,0.3);
    margin-bottom: 8px;
    font-family: Georgia, serif;
  }

  /* ── Progress & controls ── */
  .reveal .progress { background: rgba(255,255,255,0.05); height: 3px; }
  .reveal .progress span { background: linear-gradient(90deg, var(--blue), var(--purple)); transition: width 0.4s ease; }
  .reveal .controls button { color: rgba(99,130,190,0.7) !important; }
  .reveal .controls button:hover { color: var(--blue) !important; }
  .reveal .slide-number { color: rgba(148,163,184,0.4) !important; font-size: 11px !important; font-family: var(--r-main-font) !important; letter-spacing: 0.05em; }

  /* ── Custom elements ── */
  .accent-bar {
    width: 48px;
    height: 3px;
    background: linear-gradient(90deg, var(--blue), var(--purple));
    border-radius: 2px;
    margin: 10px 0 20px 0;
    box-shadow: 0 0 12px rgba(59,130,246,0.5);
  }
  .title-slide .accent-bar { margin: 10px auto 20px; }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(59,130,246,0.1);
    border: 1px solid rgba(59,130,246,0.25);
    color: #60a5fa;
    border-radius: 100px;
    padding: 4px 14px;
    font-size: 0.32em;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .tag::before { content: '●'; font-size: 0.8em; color: #3b82f6; }

  .slide-meta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    margin-top: 36px;
    font-size: 0.32em;
    color: rgba(148,163,184,0.45);
    letter-spacing: 0.06em;
  }
  .slide-meta span { display: flex; align-items: center; gap: 5px; }

  /* ── Section indicator (top-left corner badge) ── */
  .section-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15));
    border: 1px solid rgba(59,130,246,0.3);
    color: #60a5fa;
    font-size: 0.5em;
    font-weight: 700;
    margin-bottom: 12px;
    flex-shrink: 0;
  }
  .slide-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 4px; }
  .slide-header-text { flex: 1; }

  /* ── Transition polish ── */
  .reveal .slides section { will-change: transform, opacity; }
`;

/** Échappe les caractères HTML sensibles */
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convertit du Markdown inline en HTML (bold, italic, code) — sans escaper les balises produites */
function processInlineTitle(str: string): string {
  // Escape HTML special chars first on plain text, then apply inline Markdown
  return escapeHtml(str)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** Convertit du Markdown simple en HTML basique pour les slides */
function mdToHtml(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let inList = false;
  let inOl = false;
  let inCode = false;
  let codeLines: string[] = [];
  let codeLang = "";

  const closeList = () => {
    if (inList) { html.push("</ul>"); inList = false; }
    if (inOl) { html.push("</ol>"); inOl = false; }
  };

  const processInline = (s: string): string =>
    s.replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Code blocks
    if (line.startsWith("```")) {
      if (!inCode) {
        closeList();
        inCode = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        inCode = false;
        html.push(`<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
      }
      continue;
    }
    if (inCode) { codeLines.push(rawLine); continue; }

    // Headings (h3/h4 inside slides)
    if (line.startsWith("### ")) { closeList(); html.push(`<h3>${processInline(line.slice(4))}</h3>`); continue; }
    if (line.startsWith("#### ")) { closeList(); html.push(`<h4>${processInline(line.slice(5))}</h4>`); continue; }

    // Blockquote
    if (line.startsWith("> ")) { closeList(); html.push(`<blockquote>${processInline(line.slice(2))}</blockquote>`); continue; }

    // Horizontal rule (skip — already used as separator)
    if (/^---+$/.test(line.trim())) { closeList(); continue; }

    // Unordered list
    if (/^[\-\*] /.test(line)) {
      if (inOl) { html.push("</ol>"); inOl = false; }
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${processInline(line.slice(2))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      if (inList) { html.push("</ul>"); inList = false; }
      if (!inOl) { html.push("<ol>"); inOl = true; }
      html.push(`<li>${processInline(line.replace(/^\d+\. /, ""))}</li>`);
      continue;
    }

    // Empty line
    if (!line.trim()) { closeList(); html.push(""); continue; }

    // Paragraph
    closeList();
    html.push(`<p>${processInline(line)}</p>`);
  }
  closeList();
  return html.join("\n");
}

/** Découpe le Markdown en slides — chaque slide = { title, body, isTitle, subtitle? } */
function parseMarkdownToSlides(
  markdown: string,
  docTitle: string,
  density: "compact" | "normal" | "detailed" = "normal"
): Array<{ title: string; body: string; isTitle: boolean; subtitle?: string }> {
  const slides: Array<{ title: string; body: string; isTitle: boolean; subtitle?: string }> = [];

  const lines = markdown.split("\n");
  let currentTitle = "";
  let currentLines: string[] = [];
  let titleSlideSubtitle = "";
  let seenFirstHeading = false;

  // Scan the opening paragraph before any heading as subtitle for title slide
  const preambleLines: string[] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("#")) break;
    if (/^---/.test(l.trim())) break;
    preambleLines.push(l);
  }
  titleSlideSubtitle = preambleLines.join(" ").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
  // Keep it to one clean sentence (≤120 chars)
  if (titleSlideSubtitle.length > 120) {
    titleSlideSubtitle = titleSlideSubtitle.slice(0, 117) + "…";
  }

  // Title slide — subtitle comes from preamble
  slides.push({ title: docTitle, body: "", isTitle: true, subtitle: titleSlideSubtitle });

  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (currentTitle || body) {
      const chunks = splitBodyIntoSlideChunks(body, density);
      chunks.forEach((chunk, idx) => {
        const partSuffix = chunks.length > 1 ? ` (${idx + 1}/${chunks.length})` : "";
        slides.push({
          title: currentTitle ? `${currentTitle}${partSuffix}` : (partSuffix.trim() || docTitle),
          body: chunk,
          isTitle: false,
        });
      });
    }
    currentTitle = "";
    currentLines = [];
  };

  for (; i < lines.length; i++) {
    const line = lines[i];

    // Séparateur explicite
    if (line.trim() === "---") {
      flush();
      continue;
    }

    // Titre h1 — nouvelle slide
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      flush();
      seenFirstHeading = true;
      currentTitle = line.slice(2).trim();
      continue;
    }

    // Titre h2 — nouvelle slide section
    if (line.startsWith("## ")) {
      flush();
      seenFirstHeading = true;
      currentTitle = line.slice(3).trim();
      continue;
    }

    // Titre h3 — nouvelle slide (sous-point)
    if (line.startsWith("### ") && !line.startsWith("#### ")) {
      flush();
      seenFirstHeading = true;
      currentTitle = line.slice(4).trim();
      continue;
    }

    // FAQ : **Question** ou Q: / Question :
    const faqMatch = line.match(/^(?:\*\*(.+?)\*\*|(?:Q(?:uestion)?)\s*[:：]\s*(.+))$/i);
    if (faqMatch) {
      flush();
      seenFirstHeading = true;
      currentTitle = (faqMatch[1] || faqMatch[2] || "").replace(/\*\*/g, "").trim();
      continue;
    }

    // Skip preamble lines already consumed above (safety)
    if (!seenFirstHeading && preambleLines.includes(line)) continue;

    currentLines.push(line);
  }
  flush();

  return slides;
}

/**
 * Limites par slide — le contenu excédentaire est découpé en slides suivantes
 * plutôt que tronqué ou masqué.
 */
function getSlideLimits(density: "compact" | "normal" | "detailed") {
  return {
    compact:  { bullets: 3, paras: 1, code: 1, h3: 1, paraChars: 110 },
    normal:   { bullets: 4, paras: 1, code: 1, h3: 2, paraChars: 150 },
    detailed: { bullets: 5, paras: 2, code: 1, h3: 2, paraChars: 200 },
  }[density];
}

type BodyBlock =
  | { kind: "bullet"; text: string }
  | { kind: "ordered"; text: string }
  | { kind: "para"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "h4"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "blank" };

function parseBodyBlocks(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  const lines = body.split("\n");
  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        blocks.push({ kind: "code", lang: codeLang, lines: codeLines });
        inCode = false;
      }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }
    if (!line.trim()) { blocks.push({ kind: "blank" }); continue; }
    if (line.startsWith("### ")) { blocks.push({ kind: "h3", text: line }); continue; }
    if (line.startsWith("#### ")) { blocks.push({ kind: "h4", text: line }); continue; }
    if (line.startsWith("> ")) { blocks.push({ kind: "quote", text: line }); continue; }
    if (/^[\-\*] /.test(line)) { blocks.push({ kind: "bullet", text: line }); continue; }
    if (/^\d+\. /.test(line)) { blocks.push({ kind: "ordered", text: line }); continue; }
    blocks.push({ kind: "para", text: line });
  }
  if (inCode) blocks.push({ kind: "code", lang: codeLang, lines: codeLines });
  return blocks;
}

function blockToMarkdown(block: BodyBlock): string {
  switch (block.kind) {
    case "bullet":
    case "ordered":
    case "h3":
    case "h4":
    case "quote":
    case "para":
      return block.text;
    case "code":
      return "```" + block.lang + "\n" + block.lines.join("\n") + "\n```";
    case "blank":
      return "";
  }
}

/** Découpe un body Markdown en plusieurs chunks — aucun contenu n'est perdu */
function splitBodyIntoSlideChunks(body: string, density: "compact" | "normal" | "detailed" = "normal"): string[] {
  if (!body.trim()) return [""];

  const limits = getSlideLimits(density);
  const blocks = parseBodyBlocks(body);
  const chunks: string[] = [];
  let currentBlocks: BodyBlock[] = [];
  let counts = { bullets: 0, paras: 0, code: 0, h3: 0 };

  const resetCounts = () => { counts = { bullets: 0, paras: 0, code: 0, h3: 0 }; };

  const flush = () => {
    const md = currentBlocks.map(blockToMarkdown).filter(Boolean).join("\n").trim();
    if (md) chunks.push(md);
    currentBlocks = [];
    resetCounts();
  };

  const canAdd = (block: BodyBlock): boolean => {
    if (block.kind === "blank") return true;
    if (block.kind === "bullet" || block.kind === "ordered") return counts.bullets < limits.bullets;
    if (block.kind === "para") {
      const text = block.text.replace(/^#+\s*/, "").trim();
      if (text.length > limits.paraChars) return false;
      return counts.paras < limits.paras;
    }
    if (block.kind === "h3" || block.kind === "h4") return counts.h3 < limits.h3;
    if (block.kind === "quote") return counts.paras < limits.paras;
    if (block.kind === "code") return counts.code < limits.code;
    return true;
  };

  const addBlock = (block: BodyBlock) => {
    if (block.kind === "bullet" || block.kind === "ordered") counts.bullets++;
    else if (block.kind === "para" || block.kind === "quote") counts.paras++;
    else if (block.kind === "h3" || block.kind === "h4") counts.h3++;
    else if (block.kind === "code") counts.code++;
    currentBlocks.push(block);
  };

  for (const block of blocks) {
    if (block.kind === "blank") {
      if (currentBlocks.length) currentBlocks.push(block);
      continue;
    }

    if (block.kind === "para") {
      const text = block.text.replace(/^#+\s*/, "").trim();
      if (text.length > limits.paraChars) {
        flush();
        const sentences = text
          .split(/(?<=[.!?])\s+/)
          .map(s => s.trim())
          .filter(s => s.length > 8);
        for (const sent of sentences) {
          const bulletBlock: BodyBlock = { kind: "bullet", text: `- ${sent}` };
          if (!canAdd(bulletBlock)) flush();
          addBlock(bulletBlock);
        }
        continue;
      }
    }

    if (!canAdd(block)) flush();
    addBlock(block);
  }
  flush();
  return chunks.length ? chunks : [""];
}

/** Compte le nombre de slides que produira le Markdown */
function countSlides(markdown: string, density: "compact" | "normal" | "detailed" = "normal"): number {
  return parseMarkdownToSlides(markdown, "", density).length;
}

/** Construit la présentation Reveal.js HTML complète */
function buildRevealPresentation(
  title: string,
  markdown: string,
  opts: { theme: string; transition: string; ratio: string; density?: string }
): string {
  const { theme, transition, ratio, density = "normal" } = opts;
  const isJarvisTheme = theme === "jarvis";

  // Dimensions
  const [rw, rh] = ratio === "4:3" ? [960, 720] : [1280, 720];

  const themeLink = isJarvisTheme
    ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/black.css">`
    : `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/${theme}.css">`;

  const customStyle = isJarvisTheme ? `<style>${JARVIS_THEME_CSS}</style>` : "";

  const densityLevel = (density === "compact" || density === "detailed") ? density : "normal";
  const slides = parseMarkdownToSlides(markdown, title, densityLevel);
  const totalSlides = slides.length;
  const dateStr = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });

  // Count content slides for section numbering (skip title slide at i=0)
  let sectionCounter = 0;

  const slidesHtml = slides.map((s, i) => {

    // ── Title slide ──────────────────────────────────────────────────────────
    if (i === 0 && s.isTitle) {
      // Only show subtitle if it's a short, clean sentence (not a wall of text)
      const rawSub = (s.subtitle || "").trim();
      const firstSentence = rawSub.split(/[.!?。]/)[0].trim();
      const subtitle = firstSentence && firstSentence.length <= 100 && firstSentence.length >= 10
        ? `<p class="title-subtitle">${escapeHtml(firstSentence)}.</p>`
        : "";
      return `    <section class="title-slide" data-transition="zoom-in fade-out">
      <div class="tag">Jarvis OS&nbsp;&nbsp;·&nbsp;&nbsp;Notebook</div>
      <h1>${processInlineTitle(s.title)}</h1>
      <div class="accent-bar"></div>
      ${subtitle}
      <div class="slide-meta">
        <span>📅 ${dateStr}</span>
        <span>·</span>
        <span>📊 ${totalSlides} slides</span>
      </div>
    </section>`;
    }

    // ── Content slide ─────────────────────────────────────────────────────────
    sectionCounter++;
    const numBadge = isJarvisTheme
      ? `<div class="section-num">${sectionCounter}</div>`
      : "";

    let heading = "";
    if (s.title) {
      if (isJarvisTheme) {
        heading = `<div class="slide-header">
        ${numBadge}
        <div class="slide-header-text">
          <h2>${processInlineTitle(s.title)}</h2>
          <div class="accent-bar"></div>
        </div>
      </div>`;
      } else {
        heading = `<h2>${processInlineTitle(s.title)}</h2><div class="accent-bar"></div>`;
      }
    }

    const body = s.body ? mdToHtml(s.body) : "";

    return `    <section data-transition="${transition}">
      ${heading}
      <div class="slide-content">${body}</div>
    </section>`;
  }).join("\n\n");

  const closingSlide = isJarvisTheme
    ? `    <section class="title-slide closing-slide" data-transition="fade">
      <div class="tag">Jarvis OS&nbsp;&nbsp;·&nbsp;&nbsp;Notebook</div>
      <h2>Merci</h2>
      <div class="accent-bar"></div>
      <p class="title-subtitle">Questions &amp; discussion</p>
      <div class="slide-meta">
        <span>📅 ${dateStr}</span>
      </div>
    </section>`
    : `    <section class="title-slide closing-slide" data-transition="fade">
      <h2>Merci</h2>
      <p class="title-subtitle">Questions &amp; discussion</p>
    </section>`;

  // Global polish styles applied to ALL themes (Jarvis overrides these in JARVIS_THEME_CSS)
  const globalStyles = `
    .reveal .slides section {
      box-sizing: border-box;
      overflow: visible;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .reveal .slides section .slide-content {
      flex: 1 1 auto;
      min-height: 0;
      overflow: visible;
    }
    .reveal .slides section .slide-content.slide-scrollable {
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
    }
    .reveal h1, .reveal h2 { letter-spacing: -0.02em; }
    .reveal h2 { margin-bottom: 0.15em; font-size: 1.05em; }
    .reveal ul, .reveal ol { font-size: 0.72em; line-height: 1.45; margin: 0; padding-left: 1.1em; }
    .reveal ul li, .reveal ol li { margin-bottom: 0.28em; }
    .reveal pre { font-size: 0.52em; border-radius: 10px; max-height: 280px; overflow: auto; }
    .reveal p { font-size: 0.72em; line-height: 1.45; margin-bottom: 0.35em; }
    .reveal blockquote { font-size: 0.68em; margin: 8px 0; padding: 10px 14px; }
    .reveal h3 { font-size: 0.62em; margin-bottom: 6px; }
    /* Accent bar */
    .accent-bar {
      width: 48px; height: 3px;
      background: currentColor;
      border-radius: 2px;
      margin: 6px 0 14px 0;
      opacity: 0.35;
    }
    .title-slide .accent-bar { margin: 8px auto 18px; }
    /* Tag badge on title slide */
    .reveal .tag {
      display: inline-block;
      border: 1px solid currentColor;
      border-radius: 100px;
      padding: 3px 14px;
      font-size: 0.32em;
      opacity: 0.55;
      margin-bottom: 18px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 600;
    }
    /* Title subtitle */
    .title-subtitle {
      font-size: 0.46em !important;
      opacity: 0.65;
      max-width: 72%;
      margin: 0 auto;
      line-height: 1.5 !important;
    }
    /* Slide meta (date + count) */
    .slide-meta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      margin-top: 28px;
      font-size: 0.3em;
      opacity: 0.4;
      letter-spacing: 0.05em;
    }
    /* Section number badge */
    .section-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px; height: 26px;
      border-radius: 7px;
      border: 1px solid currentColor;
      font-size: 0.48em;
      font-weight: 700;
      opacity: 0.45;
      flex-shrink: 0;
      margin-top: 4px;
    }
    .slide-header { display: flex; align-items: flex-start; gap: 12px; flex-shrink: 0; }
    .slide-header-text { flex: 1; }
    .closing-slide h2 {
      font-size: 1.6em;
      font-weight: 800;
      background: none;
      -webkit-text-fill-color: inherit;
      color: inherit;
    }
  `;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reset.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.css">
  ${themeLink}
  <style>${globalStyles}</style>
  ${customStyle}
</head>
<body>
  <div class="reveal">
    <div class="slides">
${slidesHtml}

${closingSlide}
    </div>
  </div>
  <script type="module">
    import Reveal from 'https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.esm.js';
    import Highlight from 'https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/highlight/highlight.esm.js';
    import Notes from 'https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/notes/notes.esm.js';

    function fitSlideContent(section) {
      if (!section || section.classList.contains('title-slide')) return;
      const content = section.querySelector('.slide-content');
      if (!content) return;

      content.classList.remove('slide-scrollable');
      content.style.fontSize = '';
      content.style.lineHeight = '';

      const header = section.querySelector('.slide-header, h2');
      const headerH = header ? header.getBoundingClientRect().height + 12 : 0;
      const maxH = Math.max(section.clientHeight - headerH - 36, 120);

      let scale = 1;
      while (content.scrollHeight > maxH && scale > 0.38) {
        scale -= 0.025;
        content.style.fontSize = (scale * 100) + '%';
        content.style.lineHeight = scale < 0.65 ? '1.3' : '1.42';
      }

      if (content.scrollHeight > maxH) {
        content.style.maxHeight = maxH + 'px';
        content.classList.add('slide-scrollable');
      } else {
        content.style.maxHeight = '';
      }
    }

    function fitAllSlides() {
      document.querySelectorAll('.reveal .slides section').forEach(fitSlideContent);
    }

    Reveal.initialize({
      hash: true,
      transition: '${transition}',
      transitionSpeed: 'default',
      backgroundTransition: 'fade',
      width: ${rw},
      height: ${rh},
      margin: 0.06,
      minScale: 0.2,
      maxScale: 2.0,
      slideNumber: 'c/t',
      showSlideNumber: 'all',
      center: false,
      touch: true,
      loop: false,
      fragments: false,
      autoPlayMedia: false,
      plugins: [Highlight, Notes],
      highlight: { highlightOnLoad: true },
    }).then(() => {
      fitAllSlides();
      Reveal.on('slidechanged', (event) => fitSlideContent(event.currentSlide));
      window.addEventListener('resize', () => fitAllSlides());
    });
  </script>
</body>
</html>`;
}

export function createNotebooksRouter(): Router {
  const router = Router();

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NOTEBOOKS CRUD
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // GET /api/notebooks â€” Liste tous les notebooks
  router.get("/", (_req: Request, res: Response) => {
    try {
      const notebooks = notebookManager.getAllNotebooks();
      const light = notebooks.map(nb => ({
        id: nb.id,
        title: nb.title,
        description: nb.description,
        sourcesCount: nb.sources.length,
        notesCount: nb.notes.length,
        color: nb.color,
        icon: nb.icon,
        createdAt: nb.createdAt,
        updatedAt: nb.updatedAt,
      }));
      res.json({ status: "success", notebooks: light });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks â€” CrÃ©e un nouveau notebook
  router.post("/", (req: Request, res: Response) => {
    try {
      const { title, description } = req.body;
      if (!title || typeof title !== "string") {
        res.status(400).json({ error: "Le champ 'title' est requis." });
        return;
      }
      const notebook = notebookManager.createNotebook(title.trim(), description || "");

      // Lancer la génération automatique de la roadmap IA en arrière-plan
      contentGenerator.generateRoadmap(notebook.id, title.trim(), description || "").catch(() => {});

      res.json({ status: "success", notebook });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id â€” DÃ©tail d'un notebook
  router.get("/:id", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      // Retourner sans le rawText des sources (trop volumineux)
      const light = {
        ...notebook,
        sources: notebook.sources.map(s => ({
          id: s.id,
          title: s.title,
          type: s.type,
          origin: s.origin,
          summary: s.summary,
          keywords: s.keywords,
          wordCount: s.wordCount,
          language: s.language,
          addedAt: s.addedAt,
          chunksCount: s.chunks.length,
        })),
      };
      res.json({ status: "success", notebook: light });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/notebooks/:id â€” Mise Ã  jour d'un notebook
  router.patch("/:id", (req: Request, res: Response) => {
    try {
      const { title, description, color, icon } = req.body;
      const updated = notebookManager.updateNotebook(req.params.id, { title, description, color, icon });
      if (!updated) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", notebook: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id â€” Supprime un notebook
  router.delete("/:id", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteNotebook(req.params.id);
      if (!success) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", message: "Notebook supprimÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/stats â€” Statistiques globales
  router.get("/stats/global", (_req: Request, res: Response) => {
    try {
      const stats = notebookManager.getStats();
      res.json({ status: "success", stats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SOURCES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/sources/upload â€” Upload un fichier comme source
  router.post("/:id/sources/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Aucun fichier fourni." });
        return;
      }

      const source = await sourceIngester.ingestFromBuffer(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        notebookId
      );

      notebookManager.addSource(notebookId, source);

      res.json({
        status: "success",
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          summary: source.summary,
          keywords: source.keywords,
          wordCount: source.wordCount,
          chunksCount: source.chunks.length,
          language: source.language,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/upload-multi â€” Upload plusieurs fichiers simultanÃ©ment
  router.post("/:id/sources/upload-multi", upload.array("files", 20), async (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: "Aucun fichier fourni." });
        return;
      }

      // IngÃ©rer chaque fichier (sÃ©quentiellement pour Ã©viter les rate limits API)
      const results: Array<{
        filename: string;
        status: "success" | "error";
        source?: any;
        error?: string;
      }> = [];

      for (const file of files) {
        try {
          const source = await sourceIngester.ingestFromBuffer(
            file.buffer,
            file.originalname,
            file.mimetype,
            notebookId
          );
          notebookManager.addSource(notebookId, source);

          results.push({
            filename: file.originalname,
            status: "success",
            source: {
              id: source.id,
              title: source.title,
              type: source.type,
              summary: source.summary,
              keywords: source.keywords,
              wordCount: source.wordCount,
              chunksCount: source.chunks.length,
              language: source.language,
            },
          });
        } catch (e: any) {
          results.push({
            filename: file.originalname,
            status: "error",
            error: e.message,
          });
        }
      }

      const successCount = results.filter(r => r.status === "success").length;
      const errorCount = results.filter(r => r.status === "error").length;

      res.json({
        status: errorCount === 0 ? "success" : (successCount > 0 ? "partial" : "error"),
        total: files.length,
        successCount,
        errorCount,
        results,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/upload-queued â€” Upload via la queue de processing (non-bloquant)
  router.post("/:id/sources/upload-queued", upload.array("files", 20), (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: "Aucun fichier fourni." });
        return;
      }

      const priority = (req.body.priority as "urgent" | "normal" | "low") || "normal";
      const taskIds: string[] = [];

      for (const file of files) {
        const taskId = `src-${notebookId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const task = sourceProcessingQueue.enqueue(
          taskId,
          "source-ingest",
          {
            notebookId,
            fileName: file.originalname,
            mimeType: file.mimetype,
            buffer: file.buffer,
          },
          { priority }
        );

        if (task) {
          taskIds.push(task.id);
        }
      }

      res.json({
        status: "success",
        message: `${taskIds.length} fichier(s) ajoutÃ©(s) Ã  la queue de processing.`,
        taskIds,
        queueStats: sourceProcessingQueue.getStats(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/url â€” IngÃ¨re une URL comme source
  router.post("/:id/sources/url", async (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const { url } = req.body;
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "Le champ 'url' est requis." });
        return;
      }

      const source = await sourceIngester.ingestFromURL(url, notebookId);
      notebookManager.addSource(notebookId, source);

      res.json({
        status: "success",
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          summary: source.summary,
          keywords: source.keywords,
          wordCount: source.wordCount,
          chunksCount: source.chunks.length,
          language: source.language,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/text â€” Ajoute du texte brut comme source
  router.post("/:id/sources/text", async (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const { title, content } = req.body;
      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "Le champ 'content' est requis." });
        return;
      }

      const buffer = Buffer.from(content, "utf-8");
      const source = await sourceIngester.ingestFromBuffer(
        buffer,
        title || "Note collÃ©e",
        "text/plain",
        notebookId
      );
      notebookManager.addSource(notebookId, source);

      res.json({
        status: "success",
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          summary: source.summary,
          keywords: source.keywords,
          wordCount: source.wordCount,
          chunksCount: source.chunks.length,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/sources/:sourceId â€” Supprime une source
  router.delete("/:id/sources/:sourceId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.removeSource(req.params.id, req.params.sourceId);
      if (!success) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }
      res.json({ status: "success", message: "Source supprimÃ©e." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });


  // POST /api/notebooks/:id/sources/codebase — Importer le codebase du workspace en Markdown
  router.post("/:id/sources/codebase", async (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const {
        extensions,
        excludeDirs = [],
        maxFileSizeKb = 100,
        includeConfig = true,
        title,
      } = req.body as {
        extensions?: string[];
        excludeDirs?: string[];
        maxFileSizeKb?: number;
        includeConfig?: boolean;
        title?: string;
      };

      const { getProjectRoot: getProjRoot, EXCLUDED_DIRS, TEXT_FILE_EXT } = await import("../skills/codebaseHelpers");
      const workspaceRoot = getProjRoot();

      if (!fs.existsSync(workspaceRoot)) {
        res.status(400).json({ error: `Workspace introuvable: ${workspaceRoot}` });
        return;
      }

      const allowedExtensions = extensions && extensions.length > 0
        ? new Set(extensions.map((e: string) => e.toLowerCase().replace(/^\.?/, ".")))
        : null;

      const excludedDirsSet = new Set([
        ...EXCLUDED_DIRS,
        ".jarvis", ".aionrs", ".kiro", ".github", ".husky", ".vscode",
        "coverage", ".nyc_output", "tmp", "temp", ".cache",
        ...excludeDirs.map((d: string) => d.toLowerCase()),
      ]);

      const configFiles = new Set(["package.json", "tsconfig.json", ".env.example", "vite.config.ts", "vite.config.js"]);
      const maxBytes = maxFileSizeKb * 1024;
      const collectedFiles: { rel: string; content: string }[] = [];
      let totalChars = 0;
      const MAX_TOTAL_CHARS = 2_000_000;

      function walk(dir: string, relBase: string) {
        if (totalChars >= MAX_TOTAL_CHARS) return;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }

        for (const entry of entries) {
          const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (excludedDirsSet.has(entry.name.toLowerCase())) continue;
            walk(path.join(dir, entry.name), relPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const isConfig = includeConfig && configFiles.has(entry.name);
            const isTextFile = TEXT_FILE_EXT.test(entry.name);
            const isAllowed = allowedExtensions ? allowedExtensions.has(ext) : isTextFile;
            if (!isAllowed && !isConfig) continue;

            let stats: fs.Stats;
            try { stats = fs.statSync(path.join(dir, entry.name)); } catch { continue; }
            if (stats.size > maxBytes) continue;
            if (totalChars + stats.size > MAX_TOTAL_CHARS) continue;

            try {
              const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
              collectedFiles.push({ rel: relPath, content });
              totalChars += content.length;
            } catch { /* fichier non lisible */ }
          }
        }
      }

      walk(workspaceRoot, "");

      if (collectedFiles.length === 0) {
        res.status(400).json({ error: "Aucun fichier texte trouvé dans le workspace." });
        return;
      }

      const EXT_TO_LANG: Record<string, string> = {
        ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
        py: "python", json: "json", md: "markdown", html: "html",
        css: "css", scss: "scss", yaml: "yaml", yml: "yaml",
        sh: "bash", sql: "sql", cjs: "javascript", mjs: "javascript",
        env: "bash", txt: "text",
      };

      const workspaceName = path.basename(workspaceRoot);
      const now = new Date().toLocaleString("fr-FR");
      const mdLines: string[] = [
        `# Codebase : ${workspaceName}`,
        ``,
        `> Exporté le ${now} — ${collectedFiles.length} fichier(s) — ${Math.round(totalChars / 1024)} Ko de texte`,
        ``,
        `## Arborescence`,
        ``,
        "```",
        ...collectedFiles.map(f => f.rel),
        "```",
        ``,
        `---`,
        ``,
      ];

      for (const { rel, content } of collectedFiles) {
        const ext = path.extname(rel).replace(".", "") || "text";
        const lang = EXT_TO_LANG[ext] || ext;
        mdLines.push(`## \`${rel}\``);
        mdLines.push(``);
        mdLines.push("```" + lang);
        mdLines.push(content.trimEnd());
        mdLines.push("```");
        mdLines.push(``);
      }

      const markdown = mdLines.join("\n");
      const sourceTitle = title?.trim() || `Codebase — ${workspaceName}`;
      const buffer = Buffer.from(markdown, "utf-8");
      const source = await sourceIngester.ingestFromBuffer(
        buffer,
        sourceTitle,
        "text/markdown",
        notebookId
      );
      notebookManager.addSource(notebookId, source);

      res.json({
        status: "success",
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          summary: source.summary,
          keywords: source.keywords,
          wordCount: source.wordCount,
          chunksCount: source.chunks.length,
        },
        stats: {
          filesCollected: collectedFiles.length,
          totalChars,
          workspaceRoot,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  // POST /api/notebooks/:id/sources/:sourceId/reindex â€” Re-indexer une source
  router.post("/:id/sources/:sourceId/reindex", async (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const source = notebook.sources.find(s => s.id === req.params.sourceId);
      if (!source) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }

      // Re-index: remove old embeddings and re-embed the chunks
      const { embeddingStore } = await import("../notebooks/EmbeddingStore.js");
      embeddingStore.removeSource(req.params.sourceId, req.params.id);

      // Re-embed all chunks of this source
      const chunks = source.chunks || [];
      if (chunks.length > 0) {
        await embeddingStore.indexChunks(
          chunks.map((c: any) => ({ id: c.id, content: c.content })),
          req.params.sourceId,
          req.params.id
        );
      }

      res.json({ status: "success", chunksCount: chunks.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/sources/:sourceId/content â€” Contenu brut d'une source
  router.get("/:id/sources/:sourceId/content", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const source = notebook.sources.find(s => s.id === req.params.sourceId);
      if (!source) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }
      // For image sources, return both the description text and the image data
      if (source.type === "image") {
        const imageBase64 = (source as any).imageBase64 || "";
        const imageMimeType = (source as any).imageMimeType || "image/png";
        const content = source.rawText
          || (source.chunks && source.chunks.length > 0
            ? source.chunks.sort((a, b) => a.index - b.index).map(c => c.content).join("\n\n")
            : source.summary || "Contenu non disponible.");
        res.json({ status: "success", content, type: "image", imageBase64, imageMimeType });
        return;
      }

      // For HTML sources, return both stripped text and raw HTML for visual rendering
      if (source.type === "html" && (source as any).rawHtml) {
        const content = source.rawText
          || (source.chunks && source.chunks.length > 0
            ? source.chunks.sort((a, b) => a.index - b.index).map(c => c.content).join("\n\n")
            : source.summary || "Contenu non disponible.");
        res.json({ status: "success", content, type: "html", rawHtml: (source as any).rawHtml });
        return;
      }

      // Return the raw content (stored in source or reconstructed from chunks)
      const content = source.rawText
        || (source.chunks && source.chunks.length > 0
          ? source.chunks.sort((a, b) => a.index - b.index).map(c => c.content).join("\n\n")
          : source.summary || "Contenu non disponible.");
      res.json({ status: "success", content });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/:sourceId/tags â€” Ajouter un tag
  router.post("/:id/sources/:sourceId/tags", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const source = notebook.sources.find(s => s.id === req.params.sourceId);
      if (!source) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }
      const { tag } = req.body;
      if (!tag || typeof tag !== "string") {
        res.status(400).json({ error: "Le champ 'tag' est requis." });
        return;
      }
      if (!source.keywords.includes(tag.trim())) {
        source.keywords.push(tag.trim());
        notebook.updatedAt = new Date().toISOString();
        notebookManager.persistNotebook(req.params.id);
      }
      res.json({ status: "success", keywords: source.keywords });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/sources/:sourceId/tags â€” Supprimer un tag
  router.delete("/:id/sources/:sourceId/tags", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const source = notebook.sources.find(s => s.id === req.params.sourceId);
      if (!source) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }
      const { tag } = req.body;
      source.keywords = source.keywords.filter(k => k !== tag);
      notebook.updatedAt = new Date().toISOString();
      notebookManager.persistNotebook(req.params.id);
      res.json({ status: "success", keywords: source.keywords });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RÃ‰SUMÃ‰ GLOBAL DES SOURCES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // GET /api/notebooks/:id/sources-summary â€” RÃ©sumÃ© synthÃ©tique de toutes les sources
  router.get("/:id/sources-summary", async (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      if (notebook.sources.length === 0) {
        res.json({ status: "success", summary: null, message: "Aucune source." });
        return;
      }

      // VÃ©rifier si le rÃ©sumÃ© est en cache et Ã  jour
      const cached = (notebook as any)._sourcesSummaryCache as { hash: string; summary: string } | undefined;
      const currentHash = notebook.sources.map(s => s.id).sort().join("|");

      if (cached && cached.hash === currentHash) {
        res.json({ status: "success", summary: cached.summary, cached: true });
        return;
      }

      // Construire le contexte Ã  partir des rÃ©sumÃ©s individuels de chaque source
      const sourcesContext = notebook.sources.map(s =>
        `### ðŸ“„ ${s.title} (${s.type})\n**RÃ©sumÃ© :** ${s.summary}\n**Mots-clÃ©s :** ${s.keywords.join(", ")}\n**Volume :** ${s.wordCount} mots`
      ).join("\n\n");

      const lang = notebook.sources[0]?.language || "fr";
      const langInstruction = lang === "fr" ? "RÃ©ponds en franÃ§ais." : "Reply in English.";

      const prompt = `${langInstruction}

Tu es un assistant de synthÃ¨se documentaire. GÃ©nÃ¨re un rÃ©sumÃ© global et structurÃ© qui combine les informations de TOUTES les sources ci-dessous en un encart cohÃ©rent.

Le rÃ©sumÃ© doit :
- ÃŠtre un paragraphe de synthÃ¨se (3-6 phrases) qui capture l'essence de l'ensemble des sources
- Suivi de bullet-points des points clÃ©s (max 8 points)
- Terminer avec les thÃ¨mes/mots-clÃ©s transversaux

Format Markdown court et lisible (pas de titres # principaux, utilise ** pour le gras et - pour les listes).

SOURCES (${notebook.sources.length}) :
${sourcesContext}

GÃ©nÃ¨re le rÃ©sumÃ© global maintenant.`;

      const { generateText: genText } = await import("../utils/textGeneration");
      const result = await genText({
        prompt,
        temperature: 0.3,
        maxOutputTokens: 1024,
      });

      // Mettre en cache dans le notebook
      (notebook as any)._sourcesSummaryCache = { hash: currentHash, summary: result.text };
      notebookManager.persistNotebook(req.params.id);

      res.json({ status: "success", summary: result.text, cached: false });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/sources-summary â€” Invalide le cache du rÃ©sumÃ© (force recalcul)
  router.delete("/:id/sources-summary", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      delete (notebook as any)._sourcesSummaryCache;
      notebookManager.persistNotebook(req.params.id);
      res.json({ status: "success", message: "Cache du rÃ©sumÃ© invalidÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CHAT GROUNDÃ‰ (Q&A avec citations)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/chat â€” Poser une question
  router.post("/:id/chat", async (req: Request, res: Response) => {
    try {
      const { question } = req.body;
      if (!question || typeof question !== "string") {
        res.status(400).json({ error: "Le champ 'question' est requis." });
        return;
      }

      const message = await groundedChat.ask(req.params.id, question.trim());
      res.json({ status: "success", message });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/stream â€” Poser une question (SSE streaming)
  router.post("/:id/chat/stream", async (req: Request, res: Response) => {
    try {
      const { question, threadId } = req.body;
      if (!question || typeof question !== "string") {
        res.status(400).json({ error: "Le champ 'question' est requis." });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Envoyer un event "start" pour confirmer la connexion
      res.write(`event: start\ndata: ${JSON.stringify({ status: "streaming" })}\n\n`);

      // Stream la rÃ©ponse chunk par chunk
      const message = await groundedChat.askStream(
        req.params.id,
        question.trim(),
        (chunk: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      );

      // Si un threadId est fourni, sauvegarder aussi dans le thread
      if (threadId) {
        const notebook = notebookManager.getNotebook(req.params.id);
        if (notebook?.chatThreads) {
          const thread = notebook.chatThreads.find((t: any) => t.id === threadId);
          if (thread) {
            // Ajouter la question utilisateur et la rÃ©ponse
            thread.messages.push({
              id: `msg-${Date.now()}-u`,
              role: 'user',
              content: question.trim(),
              citations: [],
              timestamp: new Date().toISOString(),
            });
            thread.messages.push(message);
            // Mettre Ã  jour le titre du thread si c'est le premier message
            if (thread.messages.length <= 2) {
              thread.title = question.trim().slice(0, 50) + (question.length > 50 ? '...' : '');
            }
            notebookManager.persistNotebook(req.params.id);
          }
        }
      }

      // GÃ©nÃ©rer les follow-ups en parallÃ¨le
      let followUps: string[] = [];
      try {
        followUps = await groundedChat.generateFollowUps(req.params.id);
      } catch { /* ignore */ }

      // Envoyer le message final complet avec citations et follow-ups
      res.write(`event: done\ndata: ${JSON.stringify({ message, followUps })}\n\n`);
      res.end();
    } catch (e: any) {
      // Si les headers SSE sont dÃ©jÃ  envoyÃ©s, envoyer l'erreur en event
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // GET /api/notebooks/:id/chat/follow-ups â€” Questions de suivi contextuelles
  router.get("/:id/chat/follow-ups", async (req: Request, res: Response) => {
    try {
      const followUps = await groundedChat.generateFollowUps(req.params.id);
      res.json({ status: "success", followUps });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/deep-dive â€” Mode exploration approfondie (SSE)
  router.post("/:id/chat/deep-dive", async (req: Request, res: Response) => {
    try {
      const { question } = req.body;
      if (!question || typeof question !== "string") {
        res.status(400).json({ error: "Le champ 'question' est requis." });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ mode: "deep-dive" })}\n\n`);

      const message = await groundedChat.deepDive(
        req.params.id,
        question.trim(),
        (stage: string, content: string) => {
          res.write(`event: progress\ndata: ${JSON.stringify({ stage, content })}\n\n`);
        }
      );

      // Follow-ups aprÃ¨s deep dive
      let followUps: string[] = [];
      try {
        followUps = await groundedChat.generateFollowUps(req.params.id);
      } catch { /* ignore */ }

      res.write(`event: done\ndata: ${JSON.stringify({ message, followUps })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // GET /api/notebooks/:id/chat/history â€” Historique du chat
  router.get("/:id/chat/history", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const threadId = req.query.threadId as string | undefined;
      if (threadId && notebook.chatThreads) {
        const thread = notebook.chatThreads.find((t: any) => t.id === threadId);
        res.json({ status: "success", messages: thread?.messages || [] });
      } else {
        res.json({ status: "success", messages: notebook.chatHistory });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/threads â€” Liste des threads
  router.get("/:id/chat/threads", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const threads = (notebook.chatThreads || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        createdAt: t.createdAt,
      }));
      res.json({ status: "success", threads });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/threads â€” CrÃ©er un thread
  router.post("/:id/chat/threads", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      if (!notebook.chatThreads) notebook.chatThreads = [];

      const thread = {
        id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: req.body.title || `Conversation ${notebook.chatThreads.length + 1}`,
        messages: [],
        createdAt: new Date().toISOString(),
      };
      notebook.chatThreads.push(thread);
      notebook.updatedAt = new Date().toISOString();
      notebookManager.persistNotebook(req.params.id);

      res.json({ status: "success", thread: { id: thread.id, title: thread.title, createdAt: thread.createdAt } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/chat/threads/:threadId â€” Supprimer un thread
  router.delete("/:id/chat/threads/:threadId", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      if (notebook.chatThreads) {
        notebook.chatThreads = notebook.chatThreads.filter((t: any) => t.id !== req.params.threadId);
        notebook.updatedAt = new Date().toISOString();
        notebookManager.persistNotebook(req.params.id);
      }
      res.json({ status: "success" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/feedback â€” Feedback thumbs up/down
  router.post("/:id/chat/feedback", (req: Request, res: Response) => {
    try {
      const { messageId, feedback } = req.body;
      // Store feedback (for now just acknowledge â€” could persist for analytics)
      res.json({ status: "success", messageId, feedback });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/chat/history â€” Effacer l'historique
  router.delete("/:id/chat/history", (req: Request, res: Response) => {
    try {
      notebookManager.clearChatHistory(req.params.id);
      res.json({ status: "success", message: "Historique effacÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/suggestions â€” Questions suggÃ©rÃ©es
  router.get("/:id/chat/suggestions", async (req: Request, res: Response) => {
    try {
      const suggestions = await groundedChat.suggestQuestions(req.params.id);
      res.json({ status: "success", suggestions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/export â€” Exporter la conversation en Markdown
  router.get("/:id/chat/export", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      if (notebook.chatHistory.length === 0) {
        res.status(400).json({ error: "Aucun message Ã  exporter." });
        return;
      }

      const format = (req.query.format as string) || "markdown";

      // Construire le Markdown
      const lines: string[] = [];
      lines.push(`# Chat â€” ${notebook.title}`);
      lines.push(`> ExportÃ© le ${new Date().toLocaleString("fr-FR")}`);
      lines.push(`> ${notebook.chatHistory.length} messages\n`);
      lines.push("---\n");

      for (const msg of notebook.chatHistory) {
        const role = msg.role === "user" ? "ðŸ§‘ **Utilisateur**" : "ðŸ¤– **Assistant**";
        const time = new Date(msg.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        lines.push(`### ${role} â€” ${time}\n`);
        lines.push(msg.content);

        if (msg.citations.length > 0) {
          lines.push("\n<details><summary>ðŸ“š Citations</summary>\n");
          for (const cit of msg.citations) {
            lines.push(`- **${cit.sourceTitle}** (pertinence: ${(cit.relevance * 100).toFixed(0)}%)`);
            lines.push(`  > ${cit.excerpt}\n`);
          }
          lines.push("</details>");
        }
        lines.push("\n---\n");
      }

      const markdown = lines.join("\n");

      if (format === "markdown") {
        const filename = `chat-${notebook.title.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 40)}-${Date.now()}.md`;
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(markdown);
      } else {
        // JSON fallback (le frontend peut convertir en PDF cÃ´tÃ© client)
        res.json({ status: "success", markdown, title: notebook.title });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/chunk/:chunkId â€” RÃ©cupÃ©rer le contenu complet d'un chunk (pour hover citations)
  // GET /api/notebooks/sandbox/folders - Lister les dossiers de la sandbox pour le picker
  router.get("/sandbox/folders", (req: Request, res: Response) => {
    try {
      const sandboxRoot = getSandboxRoot();

      if (!fs.existsSync(sandboxRoot)) {
        fs.mkdirSync(sandboxRoot, { recursive: true });
      }

      // Lister recursivement les dossiers (max 2 niveaux)
      function listDirs(dir: string, base: string, depth: number): { path: string; name: string; depth: number }[] {
        const results: { path: string; name: string; depth: number }[] = [];
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            // Ignorer les dossiers cachés et node_modules
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const relPath = base ? `${base}/${entry.name}` : entry.name;
            results.push({ path: relPath, name: entry.name, depth });
            if (depth < 2) {
              results.push(...listDirs(path.join(dir, entry.name), relPath, depth + 1));
            }
          }
        } catch { /* ignore unreadable dirs */ }
        return results;
      }

      const folders = [
        { path: "", name: "/ (racine sandbox)", depth: 0 },
        ...listDirs(sandboxRoot, "", 1),
      ];

      res.json({ status: "success", sandboxRoot, folders });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  // POST /api/notebooks/:id/chat/save-message - Sauvegarder un message en .md dans le workspace
  router.post("/:id/chat/save-message", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const { messageId, filename: customFilename, folder } = req.body as {
        messageId?: string;
        filename?: string;
        folder?: string;
      };

      // Trouver le message dans l'historique (ou dans les threads)
      let msg = notebook.chatHistory.find(m => m.id === messageId);
      if (!msg && notebook.chatThreads) {
        for (const thread of notebook.chatThreads) {
          msg = thread.messages.find(m => m.id === messageId);
          if (msg) break;
        }
      }

      if (!msg) {
        res.status(404).json({ error: "Message introuvable." });
        return;
      }

      // Construire le contenu Markdown
      const role = msg.role === "user" ? "Utilisateur" : "Assistant";
      const time = new Date(msg.timestamp).toLocaleString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const lines: string[] = [];
      lines.push(`# ${role} - ${notebook.title}`);
      lines.push(`> ${time}`);
      lines.push(`> Notebook : **${notebook.title}**\n`);
      lines.push("---\n");
      lines.push(msg.content);

      if (msg.citations && msg.citations.length > 0) {
        lines.push("\n\n---\n");
        lines.push("## Citations\n");
        for (const cit of msg.citations) {
          lines.push(`### ${cit.sourceTitle}`);
          lines.push(`- **Pertinence :** ${(cit.relevance * 100).toFixed(0)}%`);
          lines.push(`\n> ${cit.excerpt}\n`);
        }
      }

      const markdown = lines.join("\n");

      // Sauvegarder dans la sandbox (dossier chat-exports a la racine sandbox)
      const sandboxRoot = getSandboxRoot();
      const targetFolder = folder
        ? path.join(sandboxRoot, folder.replace(/\.\./g, ""))
        : path.join(sandboxRoot, "chat-exports");

      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      // Nom de fichier sur
      const timestamp = new Date(msg.timestamp).getTime();
      const roleSlug = msg.role === "user" ? "user" : "assistant";
      const contentSlug = msg.content
        .slice(0, 40)
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      const safeFilename = customFilename
        ? customFilename.replace(/[^a-zA-Z0-9\-_.]/g, "_") + (customFilename.endsWith(".md") ? "" : ".md")
        : `${roleSlug}-${timestamp}-${contentSlug || "message"}.md`;

      const filePath = path.join(targetFolder, safeFilename);
      fs.writeFileSync(filePath, markdown, "utf-8");

      res.json({
        status: "success",
        filePath: path.relative(sandboxRoot, filePath).replace(/\\/g, "/"),
        filename: safeFilename,
        destination: "sandbox",
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/:id/chat/chunk/:chunkId", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const chunkId = req.params.chunkId;

      // Chercher le chunk dans toutes les sources
      for (const source of notebook.sources) {
        const chunk = source.chunks.find(c => c.id === chunkId);
        if (chunk) {
          res.json({
            status: "success",
            chunk: {
              id: chunk.id,
              content: chunk.content,
              sourceTitle: source.title,
              sourceId: source.id,
              index: chunk.index,
              metadata: chunk.metadata,
            },
          });
          return;
        }
      }

      res.status(404).json({ error: "Chunk introuvable." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/compare â€” Comparer des sources entre elles (SSE)
  router.post("/:id/chat/compare", async (req: Request, res: Response) => {
    try {
      const { sourceIds } = req.body;
      if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length < 2) {
        res.status(400).json({ error: "Au moins 2 sourceIds sont requis." });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ mode: "compare" })}\n\n`);

      const message = await groundedChat.compareSources(
        req.params.id,
        sourceIds,
        (chunk: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      );

      let followUps: string[] = [];
      try {
        followUps = await groundedChat.generateFollowUps(req.params.id);
      } catch { /* ignore */ }

      res.write(`event: done\ndata: ${JSON.stringify({ message, followUps })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // POST /api/notebooks/:id/chat/insights â€” Extraire les insights des sources (SSE)
  router.post("/:id/chat/insights", async (req: Request, res: Response) => {
    try {
      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ mode: "insights" })}\n\n`);

      const message = await groundedChat.extractInsights(
        req.params.id,
        (chunk: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      );

      let followUps: string[] = [];
      try {
        followUps = await groundedChat.generateFollowUps(req.params.id);
      } catch { /* ignore */ }

      res.write(`event: done\ndata: ${JSON.stringify({ message, followUps })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NOTES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/notes â€” CrÃ©er une note
  router.post("/:id/notes", (req: Request, res: Response) => {
    try {
      const { title, content } = req.body;
      if (!title) {
        res.status(400).json({ error: "Le champ 'title' est requis." });
        return;
      }
      const note = notebookManager.addNote(req.params.id, title, content || "");
      if (!note) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", note });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/notebooks/:id/notes/:noteId â€” Modifier une note
  router.patch("/:id/notes/:noteId", (req: Request, res: Response) => {
    try {
      const { title, content, pinned } = req.body;
      const note = notebookManager.updateNote(req.params.id, req.params.noteId, { title, content, pinned });
      if (!note) {
        res.status(404).json({ error: "Note introuvable." });
        return;
      }
      res.json({ status: "success", note });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/notes/:noteId â€” Supprimer une note
  router.delete("/:id/notes/:noteId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteNote(req.params.id, req.params.noteId);
      if (!success) {
        res.status(404).json({ error: "Note introuvable." });
        return;
      }
      res.json({ status: "success", message: "Note supprimÃ©e." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // GÃ‰NÃ‰RATION DE CONTENU
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/generate â€” GÃ©nÃ©rer un document dÃ©rivÃ©
  router.post("/:id/generate", async (req: Request, res: Response) => {
    try {
      const { type, sourceIds, language, customInstructions, imageModel } = req.body;
      const validTypes: GeneratedDocType[] = ["summary", "faq", "study-guide", "briefing", "timeline", "outline", "mindmap", "swot", "glossary", "infographic", "full-report", "report-business", "report-market", "report-technical", "report-competitive", "report-financial", "report-marketing", "report-product", "report-risk", "report-executive", "report-project", "roadmap"];

      if (!type || !validTypes.includes(type)) {
        res.status(400).json({
          error: `Le champ 'type' doit être l'un de: ${validTypes.join(", ")}`,
        });
        return;
      }

      const doc = await contentGenerator.generate(req.params.id, type, { sourceIds, language, customInstructions, imageModel });
      res.json({ status: "success", document: doc });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/generate/stream â€” GÃ©nÃ©rer un document dÃ©rivÃ© (SSE streaming)
  router.post("/:id/generate/stream", async (req: Request, res: Response) => {
    try {
      const { type, sourceIds, language, customInstructions, imageModel } = req.body;
      const validTypes: GeneratedDocType[] = ["summary", "faq", "study-guide", "briefing", "timeline", "outline", "mindmap", "swot", "glossary", "infographic", "full-report", "report-business", "report-market", "report-technical", "report-competitive", "report-financial", "report-marketing", "report-product", "report-risk", "report-executive", "report-project", "roadmap"];

      if (!type || !validTypes.includes(type)) {
        res.status(400).json({
          error: `Le champ 'type' doit être l'un de: ${validTypes.join(", ")}`,
        });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ type, status: "generating" })}\n\n`);

      const doc = await contentGenerator.generate(req.params.id, type, {
        sourceIds,
        language,
        customInstructions,
        imageModel,
        onChunk: (chunk: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        },
      });

      res.write(`event: done\ndata: ${JSON.stringify({ document: doc })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // GET /api/notebooks/:id/generated â€” Liste des documents gÃ©nÃ©rÃ©s
  router.get("/:id/generated", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", documents: notebook.generatedDocuments });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/generated/:docId â€” Supprimer un document gÃ©nÃ©rÃ©
  router.delete("/:id/generated/:docId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteGeneratedDocument(req.params.id, req.params.docId);
      if (!success) {
        res.status(404).json({ error: "Document introuvable." });
        return;
      }
      res.json({ status: "success", message: "Document supprimé." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/generated/:docId/slides — Générer une présentation Reveal.js depuis un document
  router.post("/:id/generated/:docId/slides", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const doc = notebook.generatedDocuments.find((d: any) => d.id === req.params.docId);
      if (!doc) {
        res.status(404).json({ error: "Document introuvable." });
        return;
      }

      const {
        theme = "black",
        transition = "slide",
        ratio = "16:9",
        density = "normal",
      } = req.body as { theme?: string; transition?: string; ratio?: string; density?: string };

      const html = buildRevealPresentation(doc.title, doc.content, { theme, transition, ratio, density });

      res.json({ status: "success", html, slidesCount: countSlides(doc.content, density as any) + 1 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/report-suggestions — Suggestions de rapports basées sur les sources
  router.get("/:id/report-suggestions", async (req: Request, res: Response) => {
    try {
      const suggestions: ReportSuggestion[] = await contentGenerator.suggestReports(req.params.id);
      res.json({ status: "success", suggestions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AUDIO OVERVIEW (Podcast)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/audio-overview â€” GÃ©nÃ©rer un podcast
  router.post("/:id/audio-overview", async (req: Request, res: Response) => {
    try {
      const { language, duration, sourceIds, tone, customInstructions } = req.body;
      const overview = await contentGenerator.generateAudioOverview(req.params.id, {
        language, duration, sourceIds, tone, customInstructions,
      });
      res.json({ status: "success", overview });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/audio-overviews/:overviewId/tts â€” GÃ©nÃ©rer l'audio TTS du podcast (SSE streaming)
  router.post("/:id/audio-overviews/:overviewId/tts", async (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const overview = notebook.audioOverviews?.find((o: any) => o.id === req.params.overviewId);
      if (!overview || overview.status !== "ready") {
        res.status(404).json({ error: "Audio overview introuvable ou pas prÃªt." });
        return;
      }

      const { generateSpeech } = await import("../utils/geminiTTS");

      // Voix naturelles Kokoro pour les deux hÃ´tes
      // ff_siwis = voix fÃ©minine franÃ§aise (Alex)
      // am_adam = voix masculine anglaise naturelle (Sam) â€” ou af_jessica pour fÃ©minine
      const alexVoice = req.body.alexVoice || "ff_siwis";
      const samVoice = req.body.samVoice || "Puck";

      // DÃ©couper le script en rÃ©pliques
      const lines = overview.script.split("\n").filter((l: string) => l.trim());
      const dialogueLines: { speaker: string; text: string }[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        const isAlex = trimmed.startsWith("Alex:") || trimmed.startsWith("Alex :");
        const isSam = trimmed.startsWith("Sam:") || trimmed.startsWith("Sam :");

        if (isAlex) {
          dialogueLines.push({ speaker: "alex", text: trimmed.replace(/^Alex\s*:\s*/i, "") });
        } else if (isSam) {
          dialogueLines.push({ speaker: "sam", text: trimmed.replace(/^Sam\s*:\s*/i, "") });
        } else if (trimmed) {
          // Narration / didascalie â€” on la donne Ã  Alex par dÃ©faut
          dialogueLines.push({ speaker: "alex", text: trimmed });
        }
      }

      if (dialogueLines.length === 0) {
        res.status(400).json({ error: "Le script ne contient aucune rÃ©plique." });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ total: dialogueLines.length })}\n\n`);

      for (let i = 0; i < dialogueLines.length; i++) {
        const { speaker, text } = dialogueLines[i];
        const voice = speaker === "alex" ? alexVoice : samVoice;

        try {
          const audioBase64 = await generateSpeech(text, { voiceName: voice });
          if (audioBase64) {
            res.write(`event: chunk\ndata: ${JSON.stringify({
              index: i,
              speaker,
              text,
              audio: audioBase64,
            })}\n\n`);
          } else {
            res.write(`event: skip\ndata: ${JSON.stringify({ index: i, speaker, reason: "no audio" })}\n\n`);
          }
        } catch (ttsErr: any) {
          res.write(`event: skip\ndata: ${JSON.stringify({ index: i, speaker, reason: ttsErr.message })}\n\n`);
        }
      }

      res.write(`event: done\ndata: ${JSON.stringify({ totalGenerated: dialogueLines.length })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // GET /api/notebooks/:id/audio-overviews â€” Liste des audio overviews
  router.get("/:id/audio-overviews", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", overviews: notebook.audioOverviews });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/audio-overviews/:overviewId â€” Supprimer un audio overview
  router.delete("/:id/audio-overviews/:overviewId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteAudioOverview(req.params.id, req.params.overviewId);
      if (!success) {
        res.status(404).json({ error: "Audio overview introuvable." });
        return;
      }
      res.json({ status: "success", message: "Audio overview supprimÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/audio-overviews/:overviewId/export â€” Exporter le script audio en Markdown
  router.get("/:id/audio-overviews/:overviewId/export", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const overview = notebook.audioOverviews?.find((o: any) => o.id === req.params.overviewId);
      if (!overview) {
        res.status(404).json({ error: "Audio overview introuvable." });
        return;
      }

      // Construire le Markdown
      const lines: string[] = [];
      lines.push(`# ðŸŽ™ï¸ ${overview.title}`);
      lines.push("");
      lines.push(`> ExportÃ© le ${new Date().toLocaleString("fr-FR")}`);
      lines.push(`> DurÃ©e estimÃ©e : ${Math.floor(overview.estimatedDuration / 60)}:${(overview.estimatedDuration % 60).toString().padStart(2, "0")}`);
      lines.push("");
      lines.push("---");
      lines.push("");

      // Formater le script
      const scriptLines = overview.script.split("\n");
      for (const line of scriptLines) {
        const trimmed = line.trim();
        if (!trimmed) {
          lines.push("");
          continue;
        }

        const isAlex = trimmed.startsWith("Alex:") || trimmed.startsWith("Alex :");
        const isSam = trimmed.startsWith("Sam:") || trimmed.startsWith("Sam :");

        if (isAlex) {
          const text = trimmed.replace(/^Alex\s*:\s*/i, "");
          lines.push(`**ðŸ§‘ Alex :** ${text}`);
          lines.push("");
        } else if (isSam) {
          const text = trimmed.replace(/^Sam\s*:\s*/i, "");
          lines.push(`**ðŸ¤– Sam :** ${text}`);
          lines.push("");
        } else {
          lines.push(`*${trimmed}*`);
          lines.push("");
        }
      }

      lines.push("---");
      lines.push("");
      lines.push(`*Script gÃ©nÃ©rÃ© le ${new Date(overview.createdAt).toLocaleString("fr-FR")}*`);

      const markdown = lines.join("\n");

      const saveToWorkspace = req.query.save === "true" || req.query.save === "sandbox";
      const saveToSandbox = req.query.save === "sandbox";

      if (saveToWorkspace) {
        // DÃ©terminer le rÃ©pertoire cible
        const targetRoot = saveToSandbox ? getSandboxRoot() : getProjectRoot();

        const filename = `audio-script-${overview.title.replace(/[^a-zA-Z0-9Ã Ã¢Ã¤Ã©Ã¨ÃªÃ«Ã¯Ã®Ã´Ã¹Ã»Ã¼Ã¿Ã§Ã€Ã‚Ã„Ã‰ÃˆÃŠÃ‹ÃÃŽÃ”Ã™Ã›ÃœÅ¸Ã‡ ]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50)}.md`;
        const filePath = path.join(targetRoot, filename);
        // CrÃ©er le rÃ©pertoire si nÃ©cessaire (sandbox peut ne pas exister)
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, markdown, "utf-8");

        res.json({
          status: "success",
          message: saveToSandbox ? `Script audio sauvegardÃ© dans la sandbox` : `Script sauvegardÃ© dans le workspace`,
          filePath: filename,
          destination: saveToSandbox ? "sandbox" : "workspace",
          markdown,
        });
      } else {
        // TÃ©lÃ©chargement direct
        const filename = `audio-script-${overview.title.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 40)}-${Date.now()}.md`;
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(markdown);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EMBEDDINGS (gestion des vecteurs)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/embeddings/reindex â€” Re-vectoriser toutes les sources
  router.post("/:id/embeddings/reindex", async (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      let totalIndexed = 0;
      for (const source of notebook.sources) {
        const indexed = await embeddingStore.indexChunks(
          source.chunks.map(c => ({ id: c.id, content: c.content })),
          source.id,
          notebook.id
        );
        totalIndexed += indexed;
      }

      res.json({
        status: "success",
        message: `${totalIndexed} chunks vectorisÃ©s sur ${notebook.sources.reduce((acc, s) => acc + s.chunks.length, 0)} total.`,
        indexed: totalIndexed,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/embeddings/stats â€” Stats des embeddings
  router.get("/:id/embeddings/stats", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const stats = embeddingStore.getStats(req.params.id);
      const totalChunks = notebook.sources.reduce((acc, s) => acc + s.chunks.length, 0);

      res.json({
        status: "success",
        stats: {
          indexed: stats.total,
          totalChunks,
          coverage: totalChunks > 0 ? Math.round((stats.total / totalChunks) * 100) : 0,
          bySource: Object.fromEntries(stats.bySource),
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/embeddings/memory â€” Stats mÃ©moire globales des embeddings
  router.get("/embeddings/memory", (_req: Request, res: Response) => {
    try {
      const memStats = embeddingStore.getMemoryStats();
      res.json({ status: "success", memory: memStats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // BACKUP (sauvegarde & restauration)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/backup/run â€” Lancer un backup manuel
  router.post("/backup/run", async (_req: Request, res: Response) => {
    try {
      const metadata = await backupService.runBackup();
      if (!metadata) {
        res.json({ status: "success", message: "Aucune modification Ã  sauvegarder." });
        return;
      }
      res.json({ status: "success", backup: metadata });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/backup/list â€” Lister les backups disponibles
  router.get("/backup/list", (_req: Request, res: Response) => {
    try {
      const backups = backupService.listBackups();
      res.json({ status: "success", backups });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/backup/restore â€” Restaurer depuis un backup
  router.post("/backup/restore", (req: Request, res: Response) => {
    try {
      const { backupId, notebookId } = req.body;
      if (!backupId || typeof backupId !== "string") {
        res.status(400).json({ error: "Le champ 'backupId' est requis." });
        return;
      }

      if (notebookId) {
        // Restaurer un seul notebook
        const success = backupService.restoreNotebook(backupId, notebookId);
        if (!success) {
          res.status(404).json({ error: "Backup ou notebook introuvable." });
          return;
        }
        res.json({ status: "success", message: `Notebook ${notebookId} restaurÃ©.` });
      } else {
        // Restaurer tous les notebooks du backup
        const result = backupService.restoreAll(backupId);
        res.json({ status: "success", ...result });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/backup/config â€” Configuration des backups
  router.get("/backup/config", (_req: Request, res: Response) => {
    try {
      res.json({ status: "success", config: backupService.getConfig() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/notebooks/backup/config â€” Modifier la configuration
  router.patch("/backup/config", (req: Request, res: Response) => {
    try {
      const { intervalMs, maxBackups, enabled } = req.body;
      backupService.updateConfig({ intervalMs, maxBackups, enabled });
      res.json({ status: "success", config: backupService.getConfig() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // QUEUE (file d'attente de processing)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // GET /api/notebooks/queue/stats â€” Statistiques de la queue
  router.get("/queue/stats", (_req: Request, res: Response) => {
    try {
      const stats = sourceProcessingQueue.getStats();
      res.json({ status: "success", stats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/queue/pending â€” TÃ¢ches en attente
  router.get("/queue/pending", (_req: Request, res: Response) => {
    try {
      const pending = sourceProcessingQueue.getPending().map(t => ({
        id: t.id,
        type: t.type,
        priority: t.priority,
        status: t.status,
        attempts: t.attempts,
        createdAt: t.createdAt,
        progress: t.progress,
      }));
      res.json({ status: "success", tasks: pending });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/queue/processing â€” TÃ¢ches en cours
  router.get("/queue/processing", (_req: Request, res: Response) => {
    try {
      const processing = sourceProcessingQueue.getProcessing().map(t => ({
        id: t.id,
        type: t.type,
        priority: t.priority,
        status: t.status,
        attempts: t.attempts,
        startedAt: t.startedAt,
        progress: t.progress,
      }));
      res.json({ status: "success", tasks: processing });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/queue/task/:taskId â€” Statut d'une tÃ¢che
  router.get("/queue/task/:taskId", (req: Request, res: Response) => {
    try {
      const task = sourceProcessingQueue.getTask(req.params.taskId);
      if (!task) {
        res.status(404).json({ error: "TÃ¢che introuvable." });
        return;
      }
      res.json({
        status: "success",
        task: {
          id: task.id,
          type: task.type,
          priority: task.priority,
          status: task.status,
          attempts: task.attempts,
          maxAttempts: task.maxAttempts,
          progress: task.progress,
          error: task.error,
          createdAt: task.createdAt,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/queue/task/:taskId â€” Annuler une tÃ¢che
  router.delete("/queue/task/:taskId", (req: Request, res: Response) => {
    try {
      const success = sourceProcessingQueue.cancel(req.params.taskId);
      if (!success) {
        res.status(404).json({ error: "TÃ¢che introuvable ou dÃ©jÃ  en cours." });
        return;
      }
      res.json({ status: "success", message: "TÃ¢che annulÃ©e." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/queue/clear â€” Vider la queue
  router.delete("/queue/clear", (_req: Request, res: Response) => {
    try {
      sourceProcessingQueue.clear();
      res.json({ status: "success", message: "Queue vidÃ©e." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CACHE (statistiques & contrÃ´le)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // GET /api/notebooks/cache/stats â€” Statistiques du cache
  router.get("/cache/stats", (_req: Request, res: Response) => {
    try {
      const chatStats = chatResponseCache.getStats();
      const ragStats = ragSearchCache.getStats();
      res.json({
        status: "success",
        chat: chatStats,
        rag: ragStats,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/cache/clear â€” Vider le cache
  router.delete("/cache/clear", (_req: Request, res: Response) => {
    try {
      chatResponseCache.clear();
      ragSearchCache.clear();
      res.json({ status: "success", message: "Cache vidÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/cache/:notebookId â€” Invalider le cache d'un notebook
  router.delete("/cache/:notebookId", (req: Request, res: Response) => {
    try {
      const chatInvalidated = chatResponseCache.invalidateNotebook(req.params.notebookId);
      const ragInvalidated = ragSearchCache.invalidateNotebook(req.params.notebookId);
      res.json({
        status: "success",
        invalidated: { chat: chatInvalidated, rag: ragInvalidated },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

