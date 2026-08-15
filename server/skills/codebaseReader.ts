import fs from "fs";
import path from "path";
import { generateText } from "../utils/textGeneration";
import { markFileModified } from "../utils/sandbox";
import {
  getProjectRoot,
  normalizeProjectPath,
  resolveWritePath,
  checkWorkspace,
  EXCLUDED_DIRS,
  EXCLUDED_FILES,
  TEXT_FILE_EXT,
  MAX_PREVIEW_SIZE,
  buildTreeMarkdown,
  buildFilePreview,
  buildPackageSummary,
  extractFileOutline,
  buildAnalysisPrompt
} from "./codebaseHelpers";

async function walkDirectory(dir: string, relativeBase: string, files: string[]) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const entryPath = path.join(dir, entry.name);
    const relativePath = path.join(relativeBase, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(entryPath, relativePath, files);
    } else if (entry.isFile() && !EXCLUDED_FILES.has(entry.name)) {
      files.push(relativePath);
    }
  }
}

async function analyzeCodebaseWithOpenRouter(codebaseMarkdown: string): Promise<string | null> {
  try {
    const response = await generateText({
      prompt: buildAnalysisPrompt(codebaseMarkdown),
      systemPrompt: "Tu es un analyste de codebase. Reponds en Markdown clair, concis et structure.",
      temperature: 0.3,
    });
    return response.text.trim() || null;
  } catch (e: any) {
    console.error(`[Codebase] Erreur analyse IA: ${e.message}`);
    return null;
  }
}

// ─── Reader Handlers ──────────────────────────────────────────────────────────

export async function handleGenerateCodebaseMarkdown(args: any) {
  const codebasePath = resolveWritePath("codebase.md");
  if (!codebasePath) {
    return { error: "Sandbox indisponible : génération de codebase.md refusée tant que le sandbox n'est pas READY." };
  }

  const includePreview = args.includePreview !== false;
  const analyzeWithOpenRouter = args.analyzeWithOpenRouter !== false;
  const files: string[] = [];
  await walkDirectory(getProjectRoot(), ".", files);
  const treeMarkdown = buildTreeMarkdown(files);
  const packageSummary = await buildPackageSummary(getProjectRoot());

  const header = [
    "# Codebase du projet",
    "",
    `Genere le ${new Date().toISOString()}.`,
    "",
    "## Structure des fichiers",
    "",
    treeMarkdown,
    "",
    packageSummary,
    "",
    "## Detail des fichiers",
    "",
  ].join("\n");

  const fileDetails: string[] = [];
  for (const relativePath of files) {
    fileDetails.push(`### ${relativePath}`);
    try {
      const absolutePath = path.join(getProjectRoot(), relativePath);
      const stats = await fs.promises.stat(absolutePath);
      fileDetails.push(`- Taille: ${stats.size} octets`);
      if (includePreview && TEXT_FILE_EXT.test(relativePath) && stats.size <= MAX_PREVIEW_SIZE) {
        fileDetails.push("", "```", await buildFilePreview(relativePath, getProjectRoot()), "```");
      } else {
        fileDetails.push("- Apercu non inclus (binaire ou trop volumineux).");
      }
      fileDetails.push("");
    } catch (error: any) {
      fileDetails.push(`- Erreur: ${error.message}`, "");
    }
  }

  let markdown = header + fileDetails.join("\n");
  let analysis: string | null = null;
  let analysisStatus = "disabled";
  if (analyzeWithOpenRouter) {
    try {
      analysis = await analyzeCodebaseWithOpenRouter(markdown);
      analysisStatus = analysis ? "success" : "missing-api-key";
      if (analysis) markdown += "\n\n## Analyse OpenRouter\n\n" + analysis;
    } catch (error: any) {
      analysisStatus = `error:${error.message}`;
    }
  }
  const finalCodebasePath = resolveWritePath("codebase.md");
  if (!finalCodebasePath || finalCodebasePath !== codebasePath) {
    return { error: "Le sandbox a changé d'état pendant la génération ; codebase.md n'a pas été écrit." };
  }
  await fs.promises.writeFile(finalCodebasePath, markdown, "utf-8");
  markFileModified("codebase.md");
  return { status: "success", path: "codebase.md", fileCount: files.length, analysis, analysisStatus };
}

export async function handleListProjectFiles(args: any) {
  const dirPath = String(args.path || ".").trim();
  const recursive = args.recursive === true;
  const normalized = normalizeProjectPath(dirPath);
  if (!normalized) return { error: "Chemin invalide ou en dehors du workspace." };
  if (!fs.existsSync(normalized)) return { error: "Dossier introuvable." };
  const stats = await fs.promises.stat(normalized);
  if (!stats.isDirectory()) return { error: "Le chemin doit pointer vers un dossier." };

  if (recursive) {
    const files: string[] = [];
    await walkDirectory(normalized, dirPath === "." ? "." : dirPath, files);
    return { status: "success", path: dirPath, recursive: true, count: files.length, files };
  }

  const entries = await fs.promises.readdir(normalized, { withFileTypes: true });
  const result = await Promise.all(
    entries
      .filter((e) => !EXCLUDED_DIRS.has(e.name))
      .map(async (e) => {
        const fullPath = path.join(normalized, e.name);
        const s = await fs.promises.stat(fullPath);
        return {
          name: e.name,
          path: dirPath === "." ? e.name : `${dirPath}/${e.name}`,
          type: e.isDirectory() ? "directory" : "file",
          sizeBytes: e.isFile() ? s.size : undefined,
        };
      })
  );
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { status: "success", path: dirPath, recursive: false, count: result.length, entries: result };
}

export async function handleReadProjectFile(args: any) {
  const requestedPath = String(args.path || "").trim();
  if (!requestedPath) return { error: "Le chemin de fichier est requis." };
  const normalized = normalizeProjectPath(requestedPath);
  if (!normalized) return { error: "Chemin invalide ou en dehors du workspace." };
  if (!fs.existsSync(normalized)) return { error: "Fichier introuvable." };
  const stats = await fs.promises.stat(normalized);
  if (!stats.isFile()) return { error: "Le chemin doit pointer vers un fichier." };
  const raw = await fs.promises.readFile(normalized, "utf-8");
  const lines = raw.split(/\r?\n/);
  const startLine = typeof args.startLine === "number" ? Math.max(1, args.startLine) : 1;
  const endLine = typeof args.endLine === "number" ? Math.min(lines.length, args.endLine) : lines.length;
  const selectedLines = lines.slice(startLine - 1, endLine);
  const content = selectedLines.join("\n");

  const forceFullContent = args.full === true || args.forceFullContent === true;
  const SMART_LIMIT = 8000;
  const noRangeSpecified = typeof args.startLine !== "number" && typeof args.endLine !== "number";
  if (!forceFullContent && noRangeSpecified && content.length > SMART_LIMIT) {
    const preview = lines.slice(0, 50).join("\n");
    return {
      status: "partial",
      path: requestedPath,
      totalLines: lines.length,
      sizeBytes: stats.size,
      content: preview,
      warning: `Fichier volumineux (${lines.length} lignes, ${stats.size} octets). Seules les 50 premières lignes sont affichées. Utilise startLine/endLine pour lire une section spécifique, ou read_project_file avec full=true pour le fichier complet.`,
      hint: "Pour lire le fichier en entier, rappelle read_project_file avec full: true.",
    };
  }

  const maxLength = 200_000;
  const truncated = content.length > maxLength;

  // Si lecture complète (full: true), ajouter les numéros de ligne pour faciliter patch_project_file
  const addLineNumbers = (args.full === true || args.forceFullContent === true) && !truncated && lines.length > 30;
  const formattedContent = addLineNumbers
    ? selectedLines.map((line, i) => `${(startLine + i).toString().padStart(4, ' ')}| ${line}`).join("\n")
    : (truncated ? content.slice(0, maxLength) + "\n... [tronque]" : content);

  return {
    status: "success",
    path: requestedPath,
    totalLines: lines.length,
    startLine,
    endLine,
    content: formattedContent,
    lineNumbered: addLineNumbers,
    truncated,
    sizeBytes: stats.size,
    hint: addLineNumbers ? "Les numéros de ligne sont inclus (format: '  42| code'). Utilise patch_project_file avec startLine/endLine pour modifier." : undefined,
  };
}

export async function handleReadFileOutline(args: any) {
  const requestedPath = String(args.path || "").trim();
  if (!requestedPath) return { error: "Le chemin de fichier est requis." };
  const normalized = normalizeProjectPath(requestedPath);
  if (!normalized) return { error: "Chemin invalide ou en dehors du workspace." };
  if (!fs.existsSync(normalized)) return { error: "Fichier introuvable." };
  const stats = await fs.promises.stat(normalized);
  if (!stats.isFile()) return { error: "Le chemin doit pointer vers un fichier." };
  const raw = await fs.promises.readFile(normalized, "utf-8");
  const lines = raw.split(/\r?\n/);
  const ext = path.extname(requestedPath).toLowerCase();

  const outline = extractFileOutline(lines, ext);

  return {
    status: "success",
    path: requestedPath,
    totalLines: lines.length,
    sizeBytes: stats.size,
    outline,
    hint: "Utilise ces numéros de ligne avec read_project_file(startLine, endLine) pour lire uniquement la section nécessaire.",
  };
}

export async function handleSearchInFiles(args: any) {
  const query = String(args.query || "").trim();
  if (!query) return { error: "Le terme de recherche est requis." };
  const searchPath = String(args.path || ".").trim();
  const normalized = normalizeProjectPath(searchPath);
  if (!normalized) return { error: "Chemin invalide ou en dehors du workspace." };
  const extensions = args.extensions ? String(args.extensions).split(",").map((e: string) => e.trim().replace(/^\./, "")) : null;
  const caseSensitive = args.caseSensitive === true;
  const isRegex = args.regex === true;
  const maxResults = typeof args.maxResults === "number" ? args.maxResults : 20;
  const allFiles: string[] = [];

  // Si le path pointe vers un fichier, chercher uniquement dedans
  const pathStats = await fs.promises.stat(normalized).catch(() => null);
  if (pathStats && pathStats.isFile()) {
    allFiles.push(searchPath);
  } else {
    await walkDirectory(normalized, searchPath === "." ? "." : searchPath, allFiles);
  }

  const results: Array<{ file: string; line: number; content: string }> = [];

  // Mode littéral par défaut : échapper les caractères spéciaux regex
  // Mode regex explicite : utiliser la query telle quelle
  let pattern: string;
  if (isRegex) {
    pattern = query;
  } else {
    pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
  } catch (e: any) {
    return { error: `Expression régulière invalide: ${e.message}. Utilisez regex: false ou échappez les caractères spéciaux.` };
  }
  for (const filePath of allFiles) {
    if (results.length >= maxResults) break;
    if (extensions) {
      const ext = path.extname(filePath).replace(/^\./, "");
      if (!extensions.includes(ext)) continue;
    }
    if (!TEXT_FILE_EXT.test(filePath)) continue;
    try {
      const absolutePath = path.join(getProjectRoot(), filePath);
      const s = await fs.promises.stat(absolutePath);
      if (s.size > MAX_PREVIEW_SIZE) continue;
      const content = await fs.promises.readFile(absolutePath, "utf-8");
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        if (regex.test(lines[i])) {
          results.push({ file: filePath, line: i + 1, content: lines[i].trim() });
        }
        regex.lastIndex = 0;
      }
    } catch { /* skip unreadable files */ }
  }
  return { status: "success", query, count: results.length, results };
}

export async function handleAnalyzeProjectFile(args: any, toolContext: any) {
  const requestedPath = String(args.path || "").trim();
  if (!requestedPath) return { error: "Le chemin de fichier est requis." };
  const normalized = normalizeProjectPath(requestedPath);
  if (!normalized) return { error: "Chemin invalide ou en dehors du workspace." };
  if (!fs.existsSync(normalized)) return { error: "Fichier introuvable." };
  const stats = await fs.promises.stat(normalized);
  if (!stats.isFile()) return { error: "Le chemin doit pointer vers un fichier." };
  const raw = await fs.promises.readFile(normalized, "utf-8");
  const lines = raw.split(/\r?\n/);
  const ext = path.extname(requestedPath).toLowerCase();
  toolContext.emitIdeAction?.({ type: "open-file", path: requestedPath });
  return {
    status: "success",
    path: requestedPath,
    extension: ext || "none",
    sizeBytes: stats.size,
    totalLines: lines.length,
    nonEmptyLines: lines.filter((l) => l.trim()).length,
    preview: lines.slice(0, 20).join("\n"),
  };
}

export async function handleGetWorkspaceInfo() {
  const configFiles = ["package.json", "tsconfig.json", ".env", "vite.config.ts", "vite.config.js", "next.config.js", "README.md"];
  const detected: string[] = [];
  for (const f of configFiles) {
    if (fs.existsSync(path.join(getProjectRoot(), f))) detected.push(f);
  }
  return {
    status: "success",
    workspace: getProjectRoot(),
    exists: checkWorkspace().exists,
    detectedConfigFiles: detected,
    message: checkWorkspace().message,
  };
}
