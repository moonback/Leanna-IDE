import { Skill } from "./base";
import fs from "fs";
import { normalizeProjectPath } from "./codebaseHelpers";

import {
  handleGenerateCodebaseMarkdown,
  handleListProjectFiles,
  handleReadProjectFile,
  handleReadFileOutline,
  handleSearchInFiles,
  handleAnalyzeProjectFile,
  handleGetWorkspaceInfo
} from "./codebaseReader";

import {
  handleWriteProjectFile,
  handleModifyProjectFile,
  handlePatchProjectFile,
  handleApplyPatch,
  handleRenameProjectFile,
  handleDeleteProjectFile,
  handleCreateProjectDirectory
} from "./codebaseWriter";

export const codebaseSkill: Skill = {
  name: "codebase",
  declarations: [
    {
      name: "generate_codebase_markdown",
      description: "Generates or updates the codebase.md file with the project structure and code excerpts. Optionally analyzes it via OpenRouter.",
      parameters: {
        type: "OBJECT",
        properties: {
          includePreview: { type: "BOOLEAN", description: "Include code excerpts in codebase.md. Default true." },
          analyzeWithOpenRouter: { type: "BOOLEAN", description: "Analyze with OpenRouter Free model. Default true." },
        },
      },
    },
    {
      name: "open_ide",
      description: "Opens the IDE interface in the application. Call this before file operations when the IDE is not yet visible.",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "open_project_file",
      description: "Opens a file in the IDE and positions the cursor at a specific line. Use this to show a file visually after editing it.",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative path from project root (e.g. src/App.tsx)." },
          line: { type: "NUMBER", description: "Line number to jump to (optional, 1-based)." },
          column: { type: "NUMBER", description: "Column number (optional, 1-based)." },
        },
        required: ["path"],
      },
    },
    {
      name: "list_project_files",
      description: "Lists files and folders in a project directory. Use this to explore the structure before reading or editing files.",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative directory path to list (e.g. src/components). Use '.' for root." },
          recursive: { type: "BOOLEAN", description: "Recursively list all subdirectories. Default false." },
        },
      },
    },
    {
      name: "read_project_file",
      description: "Reads a file from the project workspace. For large files, use startLine/endLine to read only the relevant section, OR set full=true to force reading the entire file. Use read_file_outline first to identify which lines to read.",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative path from project root (e.g. src/App.tsx)." },
          startLine: { type: "NUMBER", description: "First line to read (1-based). Use this for large files to avoid reading everything." },
          endLine: { type: "NUMBER", description: "Last line to read (1-based). Recommended: read ±20 lines around the area to modify." },
          full: { type: "BOOLEAN", description: "Si true, retourne le fichier complet même s'il est volumineux. Utile quand on a besoin de tout le contenu pour une modification." },
        },
        required: ["path"],
      },
    },
    {
      name: "read_file_outline",
      description: "Returns the structure of a file: exports, functions, classes, interfaces, and their line numbers. Use this BEFORE read_project_file to identify which section to read. Much cheaper in tokens than reading the full file.",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative path from project root (e.g. src/App.tsx)." },
        },
        required: ["path"],
      },
    },
    {
      name: "search_in_files",
      description: "Searches for text or a pattern across project files. Returns matching files with surrounding context. Use to find where a function, class or variable is used. By default, the query is treated as literal text (special characters are auto-escaped). Set regex:true to use a regular expression.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "Text or regex pattern to search for. Treated as literal text by default (parentheses, brackets, etc. are auto-escaped)." },
          path: { type: "STRING", description: "Directory to search in (optional, defaults to project root)." },
          extensions: { type: "STRING", description: "Comma-separated file extensions to filter (e.g. 'ts,tsx,js'). Optional." },
          caseSensitive: { type: "BOOLEAN", description: "Case-sensitive search. Default false." },
          regex: { type: "BOOLEAN", description: "If true, treat query as a regular expression. Default false (literal text search)." },
          maxResults: { type: "NUMBER", description: "Maximum number of results. Default 20." },
        },
        required: ["query"],
      },
    },
    {
      name: "analyze_project_file",
      description: "Analyzes a file and returns metadata (line count, size, extension) and a content preview.",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative path from project root (e.g. src/App.tsx)." },
        },
        required: ["path"],
      },
    },
    {
      name: "write_project_file",
      description: "Crée ou écrase un fichier. L'assistant peut l'appeler directement uniquement pour créer ou écrire un fichier .md explicitement demandé par l'utilisateur. Pour toute autre modification, utilise agent_delegate(role='coder'). L'agent coder peut aussi appeler cet outil.",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative path from project root (e.g. src/newFile.ts)." },
          content: { type: "STRING", description: "Full file content to write." },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "modify_project_file",
      description: "⚠️ RÉSERVÉ AUX AGENTS — Ne PAS appeler directement. Utilise agent_delegate(role='coder') pour toute modification de fichier. Cet outil modifie un fichier par remplacement de texte exact. Il est appelé automatiquement par l'agent coder. Deux modes: 1) searchText exact (copié depuis read_project_file), 2) startMarker/endMarker (le backend extrait le bloc).",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative path of the file to modify." },
          searchText: { type: "STRING", description: "Exact text to find and replace (whitespace and indentation must match exactly). Si absent, utiliser startMarker/endMarker." },
          replaceText: { type: "STRING", description: "New text to replace searchText with. Vide '' pour supprimer." },
          replaceAll: { type: "BOOLEAN", description: "If true, replaces all occurrences. Default false (first occurrence only)." },
          startMarker: { type: "STRING", description: "Alternative à searchText: première ligne/texte identifiable qui COMMENCE le bloc à remplacer. Le backend lit le fichier et extrait le bloc entre startMarker et endMarker." },
          endMarker: { type: "STRING", description: "Alternative à searchText: dernière ligne/texte identifiable qui TERMINE le bloc à remplacer." },
        },
        required: ["path", "replaceText"],
      },
    },
    {
      name: "apply_patch",
      description: "⚠️ RÉSERVÉ AUX AGENTS — Applique un diff unifié vérifié sur un fichier. Le contexte des hunks doit correspondre exactement au contenu courant.",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Chemin relatif du fichier cible." },
          patch: { type: "STRING", description: "Diff unifié complet avec lignes ---/+++/@@." },
        },
        required: ["path", "patch"],
      },
    },
    {
      name: "patch_project_file",
      description: "⚠️ RÉSERVÉ AUX AGENTS — Ne PAS appeler directement. Utilise agent_delegate(role='coder') pour toute modification de fichier. Cet outil patche un fichier via des opérations par ligne. Il est appelé automatiquement par l'agent coder. NOTE: operations are internally reordered and applied bottom-to-top (by startLine descending) so line numbers stay stable during the patch; operation ranges must NOT overlap.",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative path of the file to modify." },
          operations: {
            type: "ARRAY",
            description: "Array of patch operations to apply in order. Each operation has: type ('replace'|'insert'|'delete'), startLine (1-based), endLine (for replace/delete), content (for replace/insert).",
            items: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING", description: "'replace' (replace lines startLine-endLine), 'insert' (insert after startLine), 'delete' (delete lines startLine-endLine)." },
                startLine: { type: "NUMBER", description: "Starting line number (1-based)." },
                endLine: { type: "NUMBER", description: "Ending line number (1-based, inclusive). Required for replace and delete." },
                content: { type: "STRING", description: "New content (for replace: replaces the lines; for insert: inserted after startLine). Each line separated by \\n." },
              },
              required: ["type", "startLine"],
            },
          },
        },
        required: ["path", "operations"],
      },
    },
    {
      name: "rename_project_file",
      description: "Renames or moves a file or directory within the project workspace.",
      parameters: {
        type: "OBJECT",
        properties: {
          oldPath: { type: "STRING", description: "Current relative path of the file or directory." },
          newPath: { type: "STRING", description: "New relative path (can include a directory change to move the file)." },
        },
        required: ["oldPath", "newPath"],
      },
    },
    {
      name: "delete_project_file",
      description: "Deletes a file from the project workspace.",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative path of the file to delete." },
        },
        required: ["path"],
      },
    },
    {
      name: "create_project_directory",
      description: "Creates a directory in the project workspace (including parent directories if needed).",
      parameters: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING", description: "Relative path of the directory to create (e.g. src/components/new)." },
        },
        required: ["path"],
      },
    },
    {
      name: "get_workspace_info",
      description: "Gets info about the current workspace: absolute path, status, detected config files (package.json, tsconfig, etc).",
      parameters: { type: "OBJECT", properties: {} },
    },
  ],

  handleToolCall: async (name, args, context?: any) => {
    const toolContext = context || {};

    switch (name) {
      case "generate_codebase_markdown":
        return await handleGenerateCodebaseMarkdown(args);

      case "open_ide":
        toolContext.emitIdeAction?.({ type: "open-ide" });
        return { status: "success", action: "open-ide", message: "IDE ouvert." };

      case "open_project_file": {
        const requestedPath = String(args.path || "").trim();
        if (!requestedPath) return { error: "Le chemin de fichier est requis." };
        const normalized = normalizeProjectPath(requestedPath);
        if (!normalized) return { error: "Chemin invalide ou en dehors du workspace." };
        if (!fs.existsSync(normalized)) return { error: "Fichier introuvable." };
        const stats = await fs.promises.stat(normalized);
        if (!stats.isFile()) return { error: "Le chemin doit pointer vers un fichier." };
        const line = typeof args.line === "number" ? args.line : undefined;
        const column = typeof args.column === "number" ? args.column : undefined;
        toolContext.emitIdeAction?.({ type: "open-file", path: requestedPath, line, column });
        const raw = await fs.promises.readFile(normalized, "utf-8");
        const contentPreview = raw.length > 4000 ? raw.slice(0, 4000) + "\n... [tronque]" : raw;
        return { status: "success", action: "open-file", path: requestedPath, line, column, contentPreview, sizeBytes: stats.size };
      }

      case "list_project_files":
        return await handleListProjectFiles(args);

      case "read_project_file":
        return await handleReadProjectFile(args);

      case "read_file_outline":
        return await handleReadFileOutline(args);

      case "search_in_files":
        return await handleSearchInFiles(args);

      case "analyze_project_file":
        return await handleAnalyzeProjectFile(args, toolContext);

      case "write_project_file":
        return await handleWriteProjectFile(args, toolContext);

      case "modify_project_file":
        return await handleModifyProjectFile(args, toolContext);

      case "apply_patch":
        return await handleApplyPatch(args, toolContext);

      case "patch_project_file":
        return await handlePatchProjectFile(args, toolContext);

      case "rename_project_file":
        return await handleRenameProjectFile(args, toolContext);

      case "delete_project_file":
        return await handleDeleteProjectFile(args, toolContext);

      case "create_project_directory":
        return await handleCreateProjectDirectory(args);

      case "get_workspace_info":
        return await handleGetWorkspaceInfo();

      default:
        return { error: `Outil inconnu: ${name}` };
    }
  },
};

export { buildAnalysisPrompt } from "./codebaseHelpers";
