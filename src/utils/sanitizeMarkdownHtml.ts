/**
 * Shared HTML sanitizer for markdown content
 * 
 * This utility provides consistent HTML sanitization across all components
 * that render markdown content. It prevents XSS attacks by:
 * - Removing disallowed HTML tags
 * - Removing disallowed attributes
 * - Removing all event handlers (on*)
 * - Validating href schemes on anchor tags (only allows https?, mailto:, #, /)
 * 
 * Usage:
 *   import { sanitizeMarkdownHtml } from '../utils/sanitizeMarkdownHtml';
 *   const safeHtml = sanitizeMarkdownHtml(marked.parse(text));
 */
import { marked } from 'marked';

// Allowed HTML tags for markdown rendering
export const ALLOWED_TAGS = new Set([
  'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody',
  'td', 'th', 'thead', 'tr', 'ul', 'sup', 'sub', 'span',
]);

// Allowed attributes per tag
export const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  code: new Set(['class']),
  span: new Set(['style', 'class']),
};

/**
 * Validates that a URL scheme is safe for use in href attributes.
 * Only allows: https?, mailto:, relative paths (/), and hash fragments (#)
 * Explicitly blocks: javascript:, data:, vbscript:, and other dangerous schemes
 */
function isSafeHref(value: string): boolean {
  // Test against safe schemes
  const safeSchemePattern = /^(https?:|mailto:|#|\/)/i;
  if (safeSchemePattern.test(value)) {
    return true;
  }
  
  // Explicitly block dangerous schemes
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];
  const lowerValue = value.toLowerCase();
  for (const scheme of dangerousSchemes) {
    if (lowerValue.startsWith(scheme)) {
      return false;
    }
  }
  
  // If no scheme is present (relative URL), allow it
  // This handles cases like "path/to/page" or "./file.html"
  if (!value.includes(':')) {
    return true;
  }
  
  // Default: deny
  return false;
}

/**
 * Sanitizes HTML from markdown parsing to prevent XSS attacks.
 * 
 * @param html - The HTML string to sanitize (typically output from marked.parse)
 * @returns A safe HTML string with disallowed tags/attributes removed
 */
export function sanitizeMarkdownHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Create a template element to parse the HTML
  const template = document.createElement('template');
  template.innerHTML = html;

  // Process all elements in the parsed HTML
  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    const tagName = element.tagName.toLowerCase();

    // Remove disallowed tags, keeping their children
    if (!ALLOWED_TAGS.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    // Process attributes for allowed tags
    const allowedAttributes = ALLOWED_ATTRIBUTES[tagName] ?? new Set<string>();
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      // Remove any attribute that is not allowed or is an event handler
      if (!allowedAttributes.has(name) || name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }

      // Special handling for href attributes on anchor tags
      if (tagName === 'a' && name === 'href') {
        if (!isSafeHref(value)) {
          element.removeAttribute(attribute.name);
        }
      }
    }
  }

  // Add security attributes to all anchor tags
  for (const link of Array.from(template.content.querySelectorAll('a[href]'))) {
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('target', '_blank');
  }

  return template.innerHTML;
}

/**
 * Sanitizes and parses markdown content in one step.
 * This is a convenience function that combines marked.parse with sanitization.
 * 
 * @param markdown - The markdown text to parse and sanitize
 * @param options - Options to pass to marked.parse
 * @returns A safe HTML string
 */
export function safeMarkdownParse(markdown: string, options?: Parameters<typeof marked.parse>[1]): string {
  try {
    const html = marked.parse(markdown, options);
    return typeof html === 'string' ? sanitizeMarkdownHtml(html) : '';
  } catch {
    // If parsing fails, escape the original content as plain text
    const escaped = String(markdown)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<p>${escaped}</p>`;
  }
}
