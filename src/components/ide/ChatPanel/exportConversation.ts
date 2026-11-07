// ─── Exportation intelligente de la conversation ────────────────────────────
//
// Génère des rapports techniques complets et formatés de la conversation
// Leanna dans trois formats :
//   • Markdown — document lisible, versionnable (en-tête, sommaire, sources)
//   • JSON     — données structurées exploitables par un outil tiers
//   • PDF      — rendu imprimable via une fenêtre dédiée + window.print()
//
// Toutes les fonctions sont pures côté construction : elles renvoient une
// chaîne. Le déclenchement du téléchargement / de l'impression est isolé dans
// `downloadBlob` et `openPrintable` pour rester testable et sans effet de bord
// caché.

import type { TranscriptEntry, ContextSource } from '../../../hooks/useTranscript.js';

export type ExportFormat = 'markdown' | 'json' | 'pdf';

/**
 * Entrée « fichier touché » exploitable par le rapport. Volontairement souple
 * (le `tool` n'est pas contraint à l'union stricte de `ModifiedFile`) pour
 * pouvoir être alimentée à partir de l'activité de session.
 */
export interface ExportedFile {
  path: string;
  tool: string;
  timestamp?: Date | string | number;
}

export interface ExportMeta {
  /** Nom affiché de l'assistante (ex. « Leanna »). */
  assistantName: string;
  /** Prénom de l'utilisateur, si renseigné. */
  userName?: string;
  /** Fichiers créés / modifiés pendant la session (déduits de l'activité). */
  modifiedFiles?: ExportedFile[];
  /** Espace de travail courant (chemin), pour contextualiser le rapport. */
  workspacePath?: string | null;
}

/** Étapes d'activité minimales nécessaires pour en déduire les fichiers touchés. */
interface ActivityLike {
  tool: string;
  label?: string;
  detail?: string;
  timestamp?: Date | string | number;
}

/** Outils d'écriture dont une étape d'activité signale un fichier touché. */
const WRITE_TOOLS = new Set<string>([
  'write_project_file', 'modify_project_file', 'patch_project_file',
  'rename_project_file', 'create_project_directory',
]);

/**
 * Déduit la liste dédupliquée des fichiers créés / modifiés à partir des
 * étapes d'activité de la session (dernière occurrence par chemin conservée).
 */
export function deriveModifiedFiles(activity: ActivityLike[]): ExportedFile[] {
  const seen = new Map<string, ExportedFile>();
  for (const step of activity) {
    if (!WRITE_TOOLS.has(step.tool)) continue;
    const path = String(step.detail || step.label || '').trim();
    if (!path) continue;
    seen.set(path, { path, tool: step.tool, timestamp: step.timestamp });
  }
  return Array.from(seen.values());
}

export interface ExportResult {
  /** Nom de fichier suggéré (sans effet si impression PDF). */
  filename: string;
  /** Type MIME du contenu (sans effet pour le PDF). */
  mimeType: string;
}

// ─── Helpers date / texte ────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Horodatage compact pour les noms de fichiers : AAAA-MM-JJ-HHMM. */
function fileStamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

/** Date lisible en français (ex. « jeudi 15 octobre 2026 à 14:03 »). */
function humanDate(d: Date): string {
  try {
    return d.toLocaleString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
}

/** Durée humaine entre deux instants (ex. « 12 min 30 s »). */
function humanDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s || parts.length === 0) parts.push(`${s} s`);
  return parts.join(' ');
}

/** Compte approximatif de mots d'un texte. */
function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function safeDate(value: Date | string | number | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Statistiques de la conversation ─────────────────────────────────────────

interface ConversationStats {
  total: number;
  userCount: number;
  assistantCount: number;
  words: number;
  sourceCount: number;
  firstAt: Date | null;
  lastAt: Date | null;
  durationMs: number;
}

function computeStats(transcript: TranscriptEntry[]): ConversationStats {
  let userCount = 0;
  let assistantCount = 0;
  let words = 0;
  let sourceCount = 0;
  let firstAt: Date | null = null;
  let lastAt: Date | null = null;

  for (const e of transcript) {
    if (e.role === 'user') userCount += 1; else assistantCount += 1;
    words += countWords(e.text ?? '');
    sourceCount += e.sources?.length ?? 0;
    const ts = safeDate(e.timestamp);
    if (ts) {
      if (!firstAt || ts < firstAt) firstAt = ts;
      if (!lastAt || ts > lastAt) lastAt = ts;
    }
  }

  return {
    total: transcript.length,
    userCount,
    assistantCount,
    words,
    sourceCount,
    firstAt,
    lastAt,
    durationMs: firstAt && lastAt ? lastAt.getTime() - firstAt.getTime() : 0,
  };
}

function roleLabel(role: TranscriptEntry['role'], assistantName: string, userName?: string): string {
  if (role === 'assistant') return assistantName;
  return userName || 'Utilisateur';
}

function formatSource(s: ContextSource): string {
  const loc = s.lines ? `${s.path}:${s.lines}` : s.path;
  const tool = s.tool ? ` _(${s.tool})_` : '';
  const excluded = s.excluded ? ' — exclu du contexte' : '';
  return `${loc}${tool}${excluded}`;
}

// ─── Génération Markdown ─────────────────────────────────────────────────────

export function buildMarkdown(
  transcript: TranscriptEntry[],
  meta: ExportMeta,
  now: Date = new Date(),
): string {
  const stats = computeStats(transcript);
  const lines: string[] = [];

  // En-tête / front-matter léger + titre
  lines.push(`# Rapport de conversation — ${meta.assistantName}`);
  lines.push('');
  lines.push('> Export généré automatiquement par Leanna IDE.');
  lines.push('');

  // Tableau de métadonnées
  lines.push('## Informations');
  lines.push('');
  lines.push('| Champ | Valeur |');
  lines.push('| --- | --- |');
  lines.push(`| Généré le | ${humanDate(now)} |`);
  lines.push(`| Assistante | ${meta.assistantName} |`);
  if (meta.userName) lines.push(`| Utilisateur | ${meta.userName} |`);
  if (meta.workspacePath) lines.push(`| Espace de travail | \`${meta.workspacePath}\` |`);
  lines.push(`| Messages | ${stats.total} (${stats.userCount} utilisateur · ${stats.assistantCount} ${meta.assistantName}) |`);
  lines.push(`| Mots | ${stats.words} |`);
  lines.push(`| Sources citées | ${stats.sourceCount} |`);
  if (stats.firstAt) lines.push(`| Début | ${humanDate(stats.firstAt)} |`);
  if (stats.lastAt) lines.push(`| Fin | ${humanDate(stats.lastAt)} |`);
  lines.push(`| Durée | ${humanDuration(stats.durationMs)} |`);
  lines.push('');

  // Fichiers modifiés pendant la session
  const files = meta.modifiedFiles ?? [];
  if (files.length > 0) {
    lines.push('## Fichiers créés / modifiés');
    lines.push('');
    lines.push('| Fichier | Opération | Horodatage |');
    lines.push('| --- | --- | --- |');
    for (const f of files) {
      const ts = safeDate(f.timestamp);
      lines.push(`| \`${f.path}\` | ${f.tool} | ${ts ? humanDate(ts) : '—'} |`);
    }
    lines.push('');
  }

  // Transcription complète
  lines.push('## Transcription');
  lines.push('');

  if (transcript.length === 0) {
    lines.push('_Aucun message dans cette conversation._');
    lines.push('');
  }

  transcript.forEach((e, i) => {
    const ts = safeDate(e.timestamp);
    const who = roleLabel(e.role, meta.assistantName, meta.userName);
    const stamp = ts ? ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    lines.push(`### ${i + 1}. ${who}${stamp ? ` · ${stamp}` : ''}`);
    lines.push('');

    if (e.pending === 'image') {
      lines.push('_[Génération d\'image en cours au moment de l\'export]_');
    } else if (e.pending === 'image-error') {
      lines.push(`_[Échec de génération d'image${e.imageError ? ` : ${e.imageError}` : ''}]_`);
    } else {
      // Le texte est déjà du markdown : on le conserve tel quel.
      lines.push((e.text ?? '').trim() || '_(message vide)_');
    }
    lines.push('');

    if (e.attachment) {
      lines.push('**Document joint et analysé :**');
      lines.push('');
      lines.push(`- Fichier : \`${e.attachment.fileName.replace(/[`\\\\]/g, '')}\``);
      lines.push(`- Type MIME : ${e.attachment.mimeType || 'inconnu'}`);
      lines.push(`- Texte extrait : ${e.attachment.extractedTextLength.toLocaleString('fr-FR')} caractères`);
      lines.push(`- Fournisseur : ${e.attachment.provider || 'non précisé'}`);
      if (e.attachment.summary) {
        lines.push('');
        lines.push('**Résumé de l’analyse :**');
        lines.push('');
        lines.push(e.attachment.summary);
      }
      lines.push('');
    }

    if (e.sources && e.sources.length > 0) {
      lines.push('**Sources :**');
      lines.push('');
      for (const s of e.sources) lines.push(`- ${formatSource(s)}`);
      lines.push('');
    }
  });

  lines.push('---');
  lines.push('');
  lines.push(`_Fin du rapport · ${meta.assistantName} · ${humanDate(now)}_`);
  lines.push('');

  return lines.join('\n');
}

// ─── Génération JSON ─────────────────────────────────────────────────────────

export function buildJson(
  transcript: TranscriptEntry[],
  meta: ExportMeta,
  now: Date = new Date(),
): string {
  const stats = computeStats(transcript);

  const payload = {
    schema: 'leanna.conversation-report',
    version: 2,
    generatedAt: now.toISOString(),
    assistant: meta.assistantName,
    user: meta.userName || null,
    workspace: meta.workspacePath || null,
    stats: {
      messages: stats.total,
      userMessages: stats.userCount,
      assistantMessages: stats.assistantCount,
      words: stats.words,
      sources: stats.sourceCount,
      firstAt: stats.firstAt?.toISOString() ?? null,
      lastAt: stats.lastAt?.toISOString() ?? null,
      durationMs: stats.durationMs,
      durationLabel: humanDuration(stats.durationMs),
    },
    modifiedFiles: (meta.modifiedFiles ?? []).map(f => ({
      path: f.path,
      tool: f.tool,
      timestamp: safeDate(f.timestamp)?.toISOString() ?? null,
    })),
    messages: transcript.map((e, index) => ({
      index: index + 1,
      id: e.id,
      role: e.role,
      author: roleLabel(e.role, meta.assistantName, meta.userName),
      content: e.text ?? '',
      words: countWords(e.text ?? ''),
      timestamp: safeDate(e.timestamp)?.toISOString() ?? null,
      pending: e.pending ?? null,
      imageError: e.imageError ?? null,
      attachment: e.attachment ? {
        fileName: e.attachment.fileName,
        mimeType: e.attachment.mimeType,
        extractedTextLength: e.attachment.extractedTextLength,
        provider: e.attachment.provider ?? null,
        summary: e.attachment.summary,
      } : null,
      sources: (e.sources ?? []).map(s => ({
        id: s.id,
        path: s.path,
        tool: s.tool,
        lines: s.lines ?? null,
        excluded: !!s.excluded,
      })),
    })),
  };

  return JSON.stringify(payload, null, 2);
}

// ─── Génération HTML imprimable (PDF) ────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rendu markdown « minimal mais robuste » → HTML, suffisant pour un rapport
 * imprimable (titres, listes, code inline/bloc, gras/italique, liens).
 * Volontairement sans dépendance externe.
 */
function miniMarkdownToHtml(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let inList = false;
  const codeBuffer: string[] = [];

  const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  const inline = (t: string): string => escapeHtml(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  for (const raw of lines) {
    const line = raw;

    if (line.trim().startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer.length = 0;
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuffer.push(line); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }

    if (line.trim() === '---') { flushList(); out.push('<hr/>'); continue; }
    if (line.trim() === '') { flushList(); continue; }

    // Tableaux markdown : rendus en texte préformaté (lisibles tels quels).
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList();
      out.push(`<p class="tbl">${inline(line)}</p>`);
      continue;
    }

    flushList();
    out.push(`<p>${inline(line)}</p>`);
  }

  if (inCode && codeBuffer.length) {
    out.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }
  flushList();
  return out.join('\n');
}

export function buildPrintableHtml(
  transcript: TranscriptEntry[],
  meta: ExportMeta,
  now: Date = new Date(),
): string {
  const markdown = buildMarkdown(transcript, meta, now);
  const body = miniMarkdownToHtml(markdown);
  const title = `Rapport ${meta.assistantName} — ${fileStamp(now)}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a; line-height: 1.6; max-width: 820px; margin: 0 auto; padding: 40px 32px;
  }
  h1 { font-size: 24px; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; }
  h2 { font-size: 18px; margin-top: 28px; color: #4f46e5; }
  h3 { font-size: 15px; margin-top: 20px; color: #111; }
  blockquote { color: #666; border-left: 3px solid #ddd; margin: 12px 0; padding: 2px 14px; }
  code { font-family: 'SFMono-Regular', Consolas, monospace; background: #f3f3f5; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #1e1e2e; color: #e4e4ef; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
  pre code { background: transparent; color: inherit; padding: 0; }
  ul { padding-left: 22px; }
  a { color: #4f46e5; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 28px 0; }
  .tbl { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.82em; white-space: pre-wrap; margin: 2px 0; color: #333; }
  @media print {
    body { padding: 0; max-width: none; }
    h2, h3 { break-after: avoid; }
    pre, blockquote { break-inside: avoid; }
  }
</style>
</head>
<body>
${body}
<script>
  // Lance l'impression dès le rendu ; l'utilisateur choisit « Enregistrer en PDF ».
  window.addEventListener('load', function () {
    setTimeout(function () { window.focus(); window.print(); }, 150);
  });
</script>
</body>
</html>`;
}

// ─── Déclencheurs (effets de bord isolés) ────────────────────────────────────

/** Télécharge un contenu texte sous forme de fichier. */
export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Laisse le temps au navigateur de démarrer le téléchargement.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Ouvre le rapport dans une fenêtre dédiée et déclenche l'impression.
 * Renvoie `false` si le popup a été bloqué (l'appelant peut alors informer
 * l'utilisateur).
 */
export function openPrintable(html: string): boolean {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

// ─── Point d'entrée unique ───────────────────────────────────────────────────

/**
 * Exporte la conversation dans le format demandé.
 * Renvoie les métadonnées du fichier généré, ou `null` si l'export PDF a été
 * bloqué (popup refusé) afin que l'appelant adapte le retour utilisateur.
 */
export function exportConversation(
  format: ExportFormat,
  transcript: TranscriptEntry[],
  meta: ExportMeta,
  now: Date = new Date(),
): ExportResult | null {
  const stamp = fileStamp(now);
  const base = `leanna-conversation-${stamp}`;

  switch (format) {
    case 'markdown': {
      const content = buildMarkdown(transcript, meta, now);
      const filename = `${base}.md`;
      downloadBlob(content, filename, 'text/markdown;charset=utf-8');
      return { filename, mimeType: 'text/markdown' };
    }
    case 'json': {
      const content = buildJson(transcript, meta, now);
      const filename = `${base}.json`;
      downloadBlob(content, filename, 'application/json;charset=utf-8');
      return { filename, mimeType: 'application/json' };
    }
    case 'pdf': {
      const html = buildPrintableHtml(transcript, meta, now);
      const ok = openPrintable(html);
      if (!ok) return null;
      return { filename: `${base}.pdf`, mimeType: 'application/pdf' };
    }
    default:
      return null;
  }
}
