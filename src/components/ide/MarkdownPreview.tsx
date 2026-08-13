import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownPreviewProps {
  content: string;
}

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

const ALLOWED_TAGS = new Set([
  'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody',
  'td', 'th', 'thead', 'tr', 'ul',
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  code: new Set(['class']),
};

function sanitizeMarkdownHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;

  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    const tagName = element.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const allowedAttributes = ALLOWED_ATTRIBUTES[tagName] ?? new Set<string>();
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (!allowedAttributes.has(name) || name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (tagName === 'a' && name === 'href' && !/^(https?:|mailto:|#|\/)/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const link of Array.from(template.content.querySelectorAll('a[href]'))) {
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('target', '_blank');
  }

  return template.innerHTML;
}

export const MarkdownPreview = React.memo(function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    try {
      // marked.parse is synchronous when no async extensions are used
      const result = marked.parse(content);
      return typeof result === 'string' ? sanitizeMarkdownHtml(result) : '';
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
        // biome-ignore lint/security/noDangerouslySetInnerHtml: controlled HTML from markdown parser
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
});
