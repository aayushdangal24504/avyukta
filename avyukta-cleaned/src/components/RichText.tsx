/**
 * RichText — minimal Markdown-ish renderer for admin-editable copy.
 *
 * Supported syntax:
 *   ==highlighted text==     →  soft rose highlight (like a marker)
 *   **bold text**            →  bold
 *   *italic text*            →  italic
 *
 * Preserves line breaks. Everything else renders as plain text — no HTML
 * injection possible (we never use dangerouslySetInnerHTML).
 *
 * Usage:
 *   <RichText text={getSetting('some_message')} />
 *   <RichText text="A normal line.\n==This is highlighted.==" />
 */

import React from 'react';

interface Token {
  type: 'text' | 'highlight' | 'bold' | 'italic';
  value: string;
}

/** Parse a single line into tokens. Innermost match wins for nested-looking input. */
function parseLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let buf = '';
  const flush = () => { if (buf) { tokens.push({ type: 'text', value: buf }); buf = ''; } };

  while (i < line.length) {
    // ==highlight==
    if (line[i] === '=' && line[i + 1] === '=') {
      const end = line.indexOf('==', i + 2);
      if (end !== -1) {
        flush();
        tokens.push({ type: 'highlight', value: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // **bold**
    if (line[i] === '*' && line[i + 1] === '*') {
      const end = line.indexOf('**', i + 2);
      if (end !== -1) {
        flush();
        tokens.push({ type: 'bold', value: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // *italic*  (single star, but not part of a **bold**)
    if (line[i] === '*' && line[i + 1] !== '*') {
      const end = line.indexOf('*', i + 1);
      if (end !== -1 && line[end + 1] !== '*') {
        flush();
        tokens.push({ type: 'italic', value: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    buf += line[i];
    i++;
  }
  flush();
  return tokens;
}

function renderTokens(tokens: Token[], keyPrefix: string): React.ReactNode {
  return tokens.map((t, i) => {
    const k = `${keyPrefix}-${i}`;
    switch (t.type) {
      case 'highlight':
        return (
          <mark
            key={k}
            className="rounded-md bg-gradient-to-r from-[#fcd5ce] to-[#f8b4c0] px-1.5 py-0.5 font-semibold text-[#7f4c5a] shadow-sm"
          >
            {t.value}
          </mark>
        );
      case 'bold':
        return <strong key={k} className="font-semibold text-[#5d4954]">{t.value}</strong>;
      case 'italic':
        return <em key={k}>{t.value}</em>;
      default:
        return <React.Fragment key={k}>{t.value}</React.Fragment>;
    }
  });
}

export function RichText({ text, className = '' }: { text: string; className?: string }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {renderTokens(parseLine(line), `l${i}`)}
          {i < lines.length - 1 && '\n'}
        </React.Fragment>
      ))}
    </span>
  );
}
