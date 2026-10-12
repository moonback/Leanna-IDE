import { memo, useEffect, useMemo, useRef } from 'react';
import { sanitizeMarkdownHtml } from '../../../utils/sanitizeMarkdownHtml.js';
import { renderChatMarkdown } from '../../../utils/chatMarkdown.js';

export interface ChatMarkdownProps {
  text: string;
}

/**
 * Rendu Markdown sécurisé pour les messages de l'assistant.
 *
 * La délégation du clic sur les boutons « Copier » des blocs de code se fait
 * sur le conteneur réel (et non via onClick JSX) : les vrais éléments
 * interactifs sont les <button> enfants, nativement focusables et activables
 * au clavier. Le texte brut est porté par data-code (restitué via dataset.code).
 */
export const ChatMarkdown = memo(function ChatMarkdown({ text }: ChatMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    try {
      return sanitizeMarkdownHtml(renderChatMarkdown(text));
    } catch {
      const escaped = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<p>${escaped}</p>`;
    }
  }, [text]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.code-copy-btn');
      if (!btn || !el.contains(btn)) return;
      const code = btn.dataset.code ?? '';
      navigator.clipboard.writeText(code).then(() => {
        const prev = btn.textContent;
        btn.textContent = 'Copié';
        btn.classList.add('is-copied');
        setTimeout(() => {
          btn.textContent = prev ?? 'Copier';
          btn.classList.remove('is-copied');
        }, 1600);
      }).catch(() => { /* presse-papiers indisponible : ignore silencieusement */ });
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="chat-markdown"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with sanitizeMarkdownHtml
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ color: 'var(--text-primary)' }}
    />
  );
});
