// ─── Directives d'édition inline dans les messages de l'assistant ────────────
//
// L'assistante peut proposer une modification de fichier directement dans sa
// réponse à l'aide d'un bloc de code balisé :
//
//     ```edit path=src/foo.ts
//     <contenu complet proposé pour le fichier>
//     ```
//
// Variantes acceptées pour l'info-string du bloc :
//   • ```edit path=src/foo.ts
//   • ```edit src/foo.ts
//   • ```edit path="src/with space.ts" lang=ts
//   • ```edit:src/foo.ts            (séparateur deux-points)
//
// Ce module découpe le texte brut d'un message en segments ordonnés : des
// portions de prose (markdown classique) entrecoupées de blocs d'édition. Le
// rendu (ChatMessage) affiche la prose via ChatMarkdown et chaque bloc via
// l'éditeur diff inline (InlineDiffEditor).
//
// Fonction PURE : aucune dépendance DOM/React, facilement testable.

export interface ProseSegment {
  kind: 'prose';
  text: string;
}

export interface EditSegment {
  kind: 'edit';
  /** Identifiant stable (dérivé de l'index) pour les clés React. */
  id: string;
  /** Chemin du fichier cible, relatif à l'espace de travail. */
  path: string;
  /** Langage éventuel déclaré (sert d'indice de coloration). */
  language?: string;
  /** Contenu complet proposé pour le fichier. */
  content: string;
}

export type MessageSegment = ProseSegment | EditSegment;

// Capture un bloc de code dont l'info-string commence par « edit ».
// Groupe 1 : info-string après « edit » (ex. ` path=src/a.ts`, `:src/a.ts`…)
// Groupe 2 : contenu du bloc.
const EDIT_BLOCK = /^[ \t]*```[ \t]*edit\b([^\n]*)\n([\s\S]*?)\n[ \t]*```[ \t]*$/gm;

/** Retire d'éventuels guillemets entourant une valeur. */
function unquote(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Extrait le chemin et le langage de l'info-string d'un bloc `edit`.
 * Renvoie `null` si aucun chemin exploitable n'est trouvé (le bloc sera alors
 * rendu comme un bloc de code normal, pas comme un éditeur d'édition).
 */
function parseInfoString(info: string): { path: string; language?: string } | null {
  let rest = info.trim();
  let path: string | undefined;
  let language: string | undefined;

  // Forme « :chemin » collée au mot-clé.
  if (rest.startsWith(':')) {
    rest = rest.slice(1).trim();
  }

  // Jetons clé=valeur (path=…, lang=…) dans un ordre quelconque.
  const tokens = rest.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const positional: string[] = [];

  for (const tok of tokens) {
    const eq = tok.indexOf('=');
    if (eq > 0) {
      const key = tok.slice(0, eq).toLowerCase();
      const val = unquote(tok.slice(eq + 1));
      if (key === 'path' || key === 'file') path = val;
      else if (key === 'lang' || key === 'language') language = val;
      continue;
    }
    positional.push(unquote(tok));
  }

  // Pas de clé explicite : le premier jeton positionnel sert de chemin.
  if (!path && positional.length > 0) path = positional[0];
  // Un éventuel deuxième jeton positionnel sert d'indice de langage.
  if (!language && positional.length > 1) language = positional[1];

  if (!path) return null;
  return { path, language };
}

/** Devine un langage à partir de l'extension du fichier (repli). */
export function languageFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'ts': case 'tsx': case 'mts': case 'cts': return 'typescript';
    case 'js': case 'jsx': case 'mjs': case 'cjs': return 'javascript';
    case 'json': case 'jsonc': return 'json';
    case 'css': case 'scss': case 'less': return 'css';
    case 'html': case 'htm': case 'xml': case 'svg': case 'vue': return 'html';
    case 'md': case 'markdown': return 'markdown';
    case 'py': return 'python';
    case 'sh': case 'bash': case 'zsh': return 'shell';
    case 'yml': case 'yaml': return 'yaml';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'java': return 'java';
    case 'c': case 'h': return 'c';
    case 'cpp': case 'cc': case 'hpp': return 'cpp';
    case 'sql': return 'sql';
    default: return 'plaintext';
  }
}

/**
 * Découpe le texte d'un message en segments ordonnés (prose + blocs d'édition).
 *
 * Les blocs `edit` dont l'info-string ne contient pas de chemin exploitable
 * sont laissés dans la prose (ils seront rendus comme des blocs de code
 * ordinaires), afin de ne jamais perdre de contenu.
 */
export function parseMessageSegments(text: string): MessageSegment[] {
  if (!text || !text.includes('```')) {
    return text ? [{ kind: 'prose', text }] : [];
  }

  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  let editIndex = 0;

  // Important : la regex est globale ; on la réinitialise pour l'idempotence.
  EDIT_BLOCK.lastIndex = 0;

  for (let m = EDIT_BLOCK.exec(text); m !== null; m = EDIT_BLOCK.exec(text)) {
    const [full, info, content] = m;
    const parsed = parseInfoString(info ?? '');

    // Bloc `edit` sans chemin : on le conserve tel quel dans la prose.
    if (!parsed) continue;

    // Prose précédant le bloc.
    const before = text.slice(lastIndex, m.index);
    if (before.trim()) segments.push({ kind: 'prose', text: before });

    segments.push({
      kind: 'edit',
      id: `edit-${editIndex}`,
      path: parsed.path,
      language: parsed.language || languageFromPath(parsed.path),
      content,
    });
    editIndex += 1;
    lastIndex = m.index + full.length;
  }

  // Reste de la prose après le dernier bloc.
  const tail = text.slice(lastIndex);
  if (tail.trim()) segments.push({ kind: 'prose', text: tail });

  // Aucun bloc d'édition détecté → un seul segment de prose.
  if (segments.length === 0) return [{ kind: 'prose', text }];
  return segments;
}

/** Indique rapidement si un message contient au moins une directive d'édition. */
export function hasInlineEdits(text: string): boolean {
  if (!text || !text.includes('```')) return false;
  EDIT_BLOCK.lastIndex = 0;
  for (let m = EDIT_BLOCK.exec(text); m !== null; m = EDIT_BLOCK.exec(text)) {
    if (parseInfoString(m[1] ?? '')) return true;
  }
  return false;
}
