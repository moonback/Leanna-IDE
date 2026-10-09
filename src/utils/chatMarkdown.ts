/**
 * Rendu markdown enrichi pour les bulles de chat de l'assistant.
 *
 * Objectifs :
 *  - Blocs de code avec en-tête (langage + bouton « copier »)
 *  - Coloration syntaxique légère, sans dépendance externe, pour les langages
 *    les plus courants dans un IDE (js/ts, json, html/xml, css, shell, python…)
 *  - Cases à cocher GFM (`- [ ]` / `- [x]`) rendues en vrai markup accessible
 *
 * Tout le HTML produit ici passe ensuite par `sanitizeMarkdownHtml`, qui n'autorise
 * qu'une liste restreinte de balises/attributs. Les classes et `data-*` utilisés
 * ci-dessous doivent donc être explicitement autorisés côté sanitizer.
 */
import { marked, type Tokens } from 'marked';

// ─── Échappement HTML ───────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Coloration syntaxique légère ───────────────────────────────────────────

// Normalise les alias de langage vers une famille de règles de coloration.
function normalizeLang(lang: string): string {
  const l = lang.trim().toLowerCase();
  switch (l) {
    case 'js':
    case 'jsx':
    case 'javascript':
    case 'ts':
    case 'tsx':
    case 'typescript':
    case 'mjs':
    case 'cjs':
      return 'js';
    case 'json':
    case 'jsonc':
      return 'json';
    case 'html':
    case 'xml':
    case 'svg':
    case 'vue':
      return 'markup';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'sh':
    case 'bash':
    case 'shell':
    case 'zsh':
    case 'console':
    case 'powershell':
    case 'ps1':
      return 'shell';
    case 'py':
    case 'python':
      return 'python';
    default:
      return '';
  }
}

interface HighlightRule {
  // Nom de token -> classe CSS `tok-<name>`
  name: string;
  pattern: RegExp;
}

// Les règles sont appliquées dans l'ordre ; la première qui matche gagne.
// On travaille sur du texte DÉJÀ échappé HTML, donc les patterns ciblent les
// entités (&quot; &lt; …) le cas échéant.
const RULES: Record<string, HighlightRule[]> = {
  js: [
    { name: 'comment', pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
    { name: 'string', pattern: /&quot;(?:[^&\\]|\\.|&(?!quot;))*&quot;|&#39;(?:[^&\\]|\\.|&(?!#39;))*&#39;|`(?:[^`\\]|\\.)*`/y },
    { name: 'number', pattern: /\b0x[\da-fA-F]+\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y },
    { name: 'keyword', pattern: /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|import|export|from|default|async|await|yield|try|catch|finally|throw|typeof|instanceof|in|of|void|delete|null|undefined|true|false|interface|type|enum|implements|public|private|protected|readonly|static|as|namespace)\b/y },
    { name: 'function', pattern: /\b[A-Za-z_$][\w$]*(?=\s*\()/y },
    { name: 'punct', pattern: /[{}()[\];,.]/y },
  ],
  json: [
    { name: 'property', pattern: /&quot;(?:[^&\\]|\\.|&(?!quot;))*&quot;(?=\s*:)/y },
    { name: 'string', pattern: /&quot;(?:[^&\\]|\\.|&(?!quot;))*&quot;/y },
    { name: 'number', pattern: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y },
    { name: 'keyword', pattern: /\b(?:true|false|null)\b/y },
    { name: 'punct', pattern: /[{}[\]:,]/y },
  ],
  markup: [
    { name: 'comment', pattern: /&lt;!--[\s\S]*?--&gt;/y },
    { name: 'tag', pattern: /&lt;\/?[A-Za-z][\w-]*/y },
    { name: 'attr', pattern: /\b[A-Za-z-][\w-]*(?==)/y },
    { name: 'string', pattern: /&quot;[^&]*?&quot;|&#39;[^&]*?&#39;/y },
    { name: 'tag', pattern: /\/?&gt;/y },
  ],
  css: [
    { name: 'comment', pattern: /\/\*[\s\S]*?\*\//y },
    { name: 'string', pattern: /&quot;[^&]*?&quot;|&#39;[^&]*?&#39;/y },
    { name: 'property', pattern: /[-A-Za-z]+(?=\s*:)/y },
    { name: 'number', pattern: /#[\da-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/y },
    { name: 'punct', pattern: /[{}();:,]/y },
  ],
  shell: [
    { name: 'comment', pattern: /#[^\n]*/y },
    { name: 'string', pattern: /&quot;[^&]*?&quot;|&#39;[^&]*?&#39;/y },
    { name: 'keyword', pattern: /\b(?:if|then|else|fi|for|in|do|done|while|case|esac|function|return|export|cd|echo|sudo|npm|node|git|yarn|pnpm)\b/y },
    { name: 'variable', pattern: /\$\w+|\$\{[^}]+\}|\$env:\w+/y },
    { name: 'number', pattern: /\b\d+\b/y },
  ],
  python: [
    { name: 'comment', pattern: /#[^\n]*/y },
    { name: 'string', pattern: /&quot;(?:[^&\\]|\\.|&(?!quot;))*&quot;|&#39;(?:[^&\\]|\\.|&(?!#39;))*&#39;/y },
    { name: 'keyword', pattern: /\b(?:def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|global|nonlocal|in|is|not|and|or|None|True|False|self|async|await)\b/y },
    { name: 'function', pattern: /\b[A-Za-z_]\w*(?=\s*\()/y },
    { name: 'number', pattern: /\b\d+(?:\.\d+)?\b/y },
  ],
};

/**
 * Applique une coloration syntaxique sur du code DÉJÀ échappé en HTML.
 * Renvoie du HTML contenant des `<span class="tok-…">`. Si le langage n'est pas
 * reconnu, le texte est renvoyé tel quel (déjà échappé).
 */
function highlight(escaped: string, lang: string): string {
  const family = normalizeLang(lang);
  const rules = RULES[family];
  if (!rules) return escaped;

  let out = '';
  let i = 0;
  const n = escaped.length;

  outer: while (i < n) {
    for (const rule of rules) {
      rule.pattern.lastIndex = i;
      const m = rule.pattern.exec(escaped);
      if (m && m.index === i && m[0].length > 0) {
        out += `<span class="tok-${rule.name}">${m[0]}</span>`;
        i += m[0].length;
        continue outer;
      }
    }
    // Aucun token : on avance d'un caractère brut.
    out += escaped[i];
    i += 1;
  }
  return out;
}

// ─── Renderer marked custom ─────────────────────────────────────────────────

const renderer: Parameters<typeof marked.use>[0]['renderer'] = {
  code({ text, lang }: Tokens.Code): string {
    const rawLang = (lang ?? '').trim();
    const label = rawLang ? escapeHtml(rawLang.split(/\s+/)[0]) : 'texte';
    const escaped = escapeHtml(text);
    const highlighted = highlight(escaped, rawLang);
    // `data-code` porte le texte brut pour le bouton « copier » (lu côté React).
    const encoded = escapeHtml(text);
    return (
      `<pre class="code-block" data-lang="${label}">` +
        `<span class="code-block-header">` +
          `<span class="code-block-lang">${label}</span>` +
          `<button type="button" class="code-copy-btn" data-code="${encoded}" aria-label="Copier le code">Copier</button>` +
        `</span>` +
        `<code class="code-block-body language-${label}">${highlighted}</code>` +
      `</pre>`
    );
  },

  checkbox({ checked }: Tokens.Checkbox): string {
    return (
      `<span class="task-checkbox${checked ? ' is-checked' : ''}" aria-hidden="true">` +
        (checked ? '&#10003;' : '') +
      `</span>`
    );
  },

  listitem(item: Tokens.ListItem): string {
    const body = this.parser.parseInline(item.tokens);
    if (item.task) {
      const box = this.checkbox({ checked: !!item.checked } as Tokens.Checkbox);
      return `<li class="task-item">${box}<span class="task-text">${body}</span></li>\n`;
    }
    return `<li>${body}</li>\n`;
  },
};

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  marked.use({ gfm: true, breaks: true, renderer });
  configured = true;
}

/**
 * Convertit du markdown en HTML enrichi (non sanitisé).
 * L'appelant DOIT passer le résultat dans `sanitizeMarkdownHtml`.
 */
export function renderChatMarkdown(text: string): string {
  ensureConfigured();
  const result = marked.parse(text, { async: false });
  return typeof result === 'string' ? result : '';
}
