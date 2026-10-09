import React, { useMemo } from 'react';
import { sanitizeMarkdownHtml } from '../../utils/sanitizeMarkdownHtml.js';
import { renderChatMarkdown } from '../../utils/chatMarkdown.js';

interface MarkdownPreviewProps {
  content: string;
}

export const MarkdownPreview = React.memo(function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    try {
      // On réutilise exactement le même pipeline que les bulles de chat
      // (renderChatMarkdown → sanitizeMarkdownHtml) : rendu synchrone forcé
      // ({ async: false }) et renderer custom correctement configuré via
      // marked.use(). Appeler marked.parse() directement ici configurait le
      // singleton marked différemment (setOptions concurrent) et pouvait casser
      // le binding `this.parser` du renderer listitem → « Erreur de rendu ».
      return sanitizeMarkdownHtml(renderChatMarkdown(content));
    } catch {
      return '<p>Erreur lors du rendu Markdown.</p>';
    }
  }, [content]);

  return (
    <div
      className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar px-8 py-6"
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      <div
        className="markdown-body max-w-[1024px] mx-auto w-full"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with sanitizeMarkdownHtml
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
});
