/**
 * Rendu markdown des messages de chat. Extrait de NotebookChat ; styles
 * alignés sur les tokens notebooks.
 */

import { type JSX } from 'react';
import { MermaidDiagram } from '../MermaidDiagram.js';

/** Rich markdown rendering for chat messages */
export function renderMessageContent(content: string): JSX.Element {
  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3, -3).split('\n');
          const lang = lines[0]?.trim().toLowerCase() || '';
          const code = (lang ? lines.slice(1) : lines).join('\n').trim();

          // Render Mermaid diagrams
          if (lang === 'mermaid') {
            return <MermaidDiagram key={i} code={code} id={`chat-${i}`} />;
          }

          return (
            <div key={i} className="overflow-hidden rounded-xl border border-[var(--notebook-border)]">
              {/* Code block header with language tag */}
              {lang && (
                <div className="flex items-center justify-between border-b border-[var(--notebook-border)] bg-[var(--notebook-surface-muted)] px-3 py-1">
                  <span className="font-mono text-xs font-medium uppercase tracking-wider text-[var(--text-dimmed)]">
                    {lang}
                  </span>
                </div>
              )}
              <pre className="m-0 overflow-x-auto bg-[var(--notebook-canvas)] px-4 py-3 font-mono text-xs leading-relaxed">
                <code className="text-[var(--text-secondary)]">{code}</code>
              </pre>
            </div>
          );
        }

        // Process block-level markdown
        const lines = part.split('\n');
        const blocks: JSX.Element[] = [];
        let blockIdx = 0;
        let inBlockquote = false;
        let blockquoteLines: string[] = [];
        let inTable = false;
        let tableRows: string[] = [];

        const flushBlockquote = () => {
          if (blockquoteLines.length > 0) {
            blocks.push(
              <blockquote
                key={`bq-${blockIdx++}`}
                className="my-1 rounded-r-lg border-l-[3px] border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)] py-2 pl-3"
              >
                {blockquoteLines.map((line, j) => (
                  <p key={j} className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {renderInlineMarkdown(line)}
                  </p>
                ))}
              </blockquote>
            );
            blockquoteLines = [];
          }
          inBlockquote = false;
        };

        const flushTable = () => {
          if (tableRows.length > 0) {
            const headerRow = tableRows[0].split('|').filter(c => c.trim());
            const dataRows = tableRows.slice(2).map(row => row.split('|').filter(c => c.trim()));

            blocks.push(
              <div key={`tbl-${blockIdx++}`} className="my-2 overflow-x-auto rounded-lg border border-[var(--notebook-border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--notebook-surface-muted)]">
                      {headerRow.map((cell, ci) => (
                        <th key={ci} className="border-b border-[var(--notebook-border)] px-3 py-2 text-left font-semibold text-[var(--text-primary)]">
                          {cell.trim()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((row, ri) => (
                      <tr key={ri} className="border-b border-[var(--notebook-border)] last:border-b-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-[var(--text-secondary)]">
                            {renderInlineMarkdown(cell.trim())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
            tableRows = [];
          }
          inTable = false;
        };

        for (let j = 0; j < lines.length; j++) {
          const line = lines[j];

          // Table detection
          if (line.includes('|') && line.trim().startsWith('|')) {
            if (!inTable) {
              flushBlockquote();
              inTable = true;
            }
            tableRows.push(line);
            continue;
          } else if (inTable) {
            flushTable();
          }

          // Blockquote
          if (line.startsWith('>')) {
            if (!inBlockquote) {
              inBlockquote = true;
            }
            blockquoteLines.push(line.replace(/^>\s?/, ''));
            continue;
          } else if (inBlockquote) {
            flushBlockquote();
          }

          // Empty line
          if (!line.trim()) {
            blocks.push(<div key={`sp-${blockIdx++}`} className="h-2" />);
            continue;
          }

          // Horizontal rule
          if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
            blocks.push(
              <hr key={`hr-${blockIdx++}`} className="my-3 h-px border-none bg-[var(--notebook-border)]" />
            );
            continue;
          }

          // Headers
          if (line.startsWith('#### ')) {
            blocks.push(
              <h4 key={`h4-${blockIdx++}`} className="mb-1 mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {renderInlineMarkdown(line.slice(5))}
              </h4>
            );
            continue;
          }
          if (line.startsWith('### ')) {
            blocks.push(
              <h3 key={`h3-${blockIdx++}`} className="mb-1 mt-3 text-sm font-bold text-[var(--text-primary)]">
                {renderInlineMarkdown(line.slice(4))}
              </h3>
            );
            continue;
          }
          if (line.startsWith('## ')) {
            blocks.push(
              <h2 key={`h2-${blockIdx++}`} className="mb-2 mt-4 text-base font-bold text-[var(--text-primary)]">
                {renderInlineMarkdown(line.slice(3))}
              </h2>
            );
            continue;
          }
          if (line.startsWith('# ')) {
            blocks.push(
              <h1 key={`h1-${blockIdx++}`} className="mb-2 mt-4 text-base font-bold text-[var(--text-primary)]">
                {renderInlineMarkdown(line.slice(2))}
              </h1>
            );
            continue;
          }

          // Unordered lists
          if (line.match(/^[-*]\s/)) {
            blocks.push(
              <div key={`ul-${blockIdx++}`} className="my-0.5 flex gap-2 pl-2">
                <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--notebook-accent)] opacity-70" />
                <span className="flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {renderInlineMarkdown(line.slice(2))}
                </span>
              </div>
            );
            continue;
          }

          // Ordered lists
          if (line.match(/^\d+\.\s/)) {
            const num = line.match(/^(\d+)\./)?.[1];
            blocks.push(
              <div key={`ol-${blockIdx++}`} className="my-0.5 flex gap-2 pl-2">
                <span className="min-w-4 flex-shrink-0 text-center text-sm font-bold leading-relaxed text-[var(--notebook-accent)]">
                  {num}
                </span>
                <span className="flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {renderInlineMarkdown(line.replace(/^\d+\.\s/, ''))}
                </span>
              </div>
            );
            continue;
          }

          // Regular paragraph
          blocks.push(
            <p key={`p-${blockIdx++}`} className="text-sm leading-[1.7] text-[var(--text-secondary)]">
              {renderInlineMarkdown(line)}
            </p>
          );
        }

        // Flush remaining
        if (inBlockquote) flushBlockquote();
        if (inTable) flushTable();

        return <div key={i}>{blocks}</div>;
      })}
    </div>
  );
}

/** Render inline markdown: **bold**, *italic*, `code`, [links](url) */
export function renderInlineMarkdown(text: string): (string | JSX.Element)[] {
  const tokens: (string | JSX.Element)[] = [];
  // Regex to match inline elements
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    // Push text before this match
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      tokens.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold text-[var(--text-primary)]">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      tokens.push(
        <em key={`i-${keyIdx++}`} className="italic text-[var(--text-secondary)]">
          {match[4]}
        </em>
      );
    } else if (match[5]) {
      // `inline code`
      tokens.push(
        <code
          key={`c-${keyIdx++}`}
          className="rounded border border-[var(--notebook-border)] bg-[var(--notebook-surface-muted)] px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      // [text](url)
      tokens.push(
        <a
          key={`a-${keyIdx++}`}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--notebook-accent)] underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          {match[8]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens.length > 0 ? tokens : [text];
}
