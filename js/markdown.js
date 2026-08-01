/**
 * VaultMarkdown — tiny, dependency-free markdown renderer.
 * Escapes HTML first so note content can never inject markup.
 * Supports: # ## ### headings, **bold**, *italic*, `code`, - lists, links, line breaks.
 */
(function (global) {
  'use strict';

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function render(md) {
    if (!md) return '';
    const lines = escapeHTML(md).split('\n');
    let html = '';
    let inList = false;

    const inline = (line) =>
      line
        .replace(/`([^`]+?)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    for (const raw of lines) {
      const line = raw.trimEnd();
      const listMatch = /^\s*[-*]\s+(.*)$/.exec(line);

      if (listMatch) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${inline(listMatch[1])}</li>`;
        continue;
      }
      if (inList) { html += '</ul>'; inList = false; }

      if (/^###\s+/.test(line)) { html += `<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`; continue; }
      if (/^##\s+/.test(line)) { html += `<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`; continue; }
      if (/^#\s+/.test(line)) { html += `<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`; continue; }
      if (line.trim() === '') { html += '<br>'; continue; }

      html += `<p>${inline(line)}</p>`;
    }
    if (inList) html += '</ul>';
    return html;
  }

  global.VaultMarkdown = { render, escapeHTML };
})(window);
