import test from 'node:test';
import assert from 'node:assert/strict';
import { AnkiRenderer } from '../src/services/anki/ankiRenderer';

test('Anki render sanitizes imported markup and retains ordinary card formatting', () => {
  const dirty = [
    '<p class="card">safe <strong>bold</strong> <em>italic</em></p>',
    '<script>script-proof</script><iframe>frame-proof</iframe><object>object-proof</object><embed>',
    '<svg><text>svg-proof</text></svg>',
    '<img src="/api/anki/media/card.png" onerror="event-proof" onload="event-proof">',
    '<a href="javascript:link-proof" target="_blank">link</a>',
    '<img src="data:image/svg+xml,data-proof">',
    '<span style="font-size:1.2em;background-image:url(https://example.invalid/proof)">styled</span>',
  ].join('');

  const clean = AnkiRenderer.sanitizeCardHtml(dirty);
  assert.match(clean, /<strong>bold<\/strong>/);
  assert.match(clean, /<em>italic<\/em>/);
  assert.match(clean, /src="\/api\/anki\/media\/card\.png"/);
  assert.doesNotMatch(clean, /<(script|iframe|object|embed|svg)\b/i);
  assert.doesNotMatch(clean, /on(error|load)\s*=/i);
  assert.doesNotMatch(clean, /javascript:|data:/i);
  assert.doesNotMatch(clean, /url\s*\(/i);
  assert.doesNotMatch(clean, /script-proof|frame-proof|object-proof|svg-proof|event-proof|data-proof|link-proof/i);
  assert.doesNotMatch(clean, /background-image/i);
});

test('Anki MathJax/KaTeX class markup survives sanitization', () => {
  const math = AnkiRenderer.renderMath('$x^2 + 1$');
  const clean = AnkiRenderer.sanitizeCardHtml(math);
  assert.match(clean, /class="katex"/);
  assert.match(clean, /x/);
});
