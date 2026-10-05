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

test('Anki strips malformed and encoded active content while keeping lists, tables and safe media', () => {
  const dirty = [
    '<ScRiPt>scriptMarker()</ScRiPt>',
    '<img src="/api/anki/media/photo.png" ONERROR="eventMarker()">',
    '<svg onload="svgMarker()"><text>svgMarker</text></svg>',
    '<a href="j&#x61;vascript:linkMarker()">unsafe link</a>',
    '<img src="data:text/html;base64,PHNjcmlwdD4=">',
    '<img src="//example.invalid/remote.svg">',
    '<span style="color:expression(styleMarker());background-image:url(javascript:styleMarker())">text</span>',
    '<iframe src="https://example.invalid">frameMarker</iframe>',
    '<object data="https://example.invalid">objectMarker</object><embed src="https://example.invalid">',
    '<form action="https://example.invalid"><input name="secret"></form>',
    '<meta http-equiv="refresh" content="0;url=https://example.invalid">',
    '<div><script>nestedMarker()</script><p>safe paragraph</p></div>',
    '&lt;img src=x onerror=encodedMarker()&gt;',
    '<strong>bold</strong><em>italic</em>',
    '<ul><li>one</li><li>two</li></ul>',
    '<table><tbody><tr><td>cell</td></tr></tbody></table>',
  ].join('');
  const clean = AnkiRenderer.sanitizeCardHtml(dirty);
  assert.doesNotMatch(clean, /<(?:script|svg|iframe|object|embed|form|input|meta)\b/i);
  assert.doesNotMatch(clean, /<[^>]+\bon\w+\s*=|javascript:|data:text\/html|styleMarker\(|scriptMarker\(|svgMarker|frameMarker|objectMarker|nestedMarker\(|url\s*\(/i);
  assert.doesNotMatch(clean, /src="\/\/example\.invalid/i);
  assert.match(clean, /src="\/api\/anki\/media\/photo\.png"/);
  assert.match(clean, /<strong>bold<\/strong><em>italic<\/em>/);
  assert.match(clean, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(clean, /<table><tbody><tr><td>cell<\/td><\/tr><\/tbody><\/table>/);
  assert.match(clean, /<p>safe paragraph<\/p>/);
  assert.match(clean, /&lt;img src=x onerror=encodedMarker\(\)&gt;/);
});
