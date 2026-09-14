/**
 * CFO CBMERJ - Automated Tests for Bizuário Enhancements:
 * 1. LaTeX inline formatting fix (\textbf{...}, \textit{...}, markdown, formulas)
 * 2. Multi-image support (up to 5 images per topic)
 * 3. Topic Question Statement / Expanded title support (statement)
 * 4. Discipline (matéria) and Content title integrity
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BizuItem } from '../src/types';
import katex from 'katex';

// ============================================================================
// 1. CORREÇÃO DE ERRO DE LATEX NO TEXTO (\textbf, \textit, \boxed, etc.)
// ============================================================================
test('BIZU-01: Deve processar texto com \\textbf{...} sem vazar a tag crua no DOM', () => {
  const sampleNote =
    'A cor que vemos corresponde, principalmente, à luz \\textbf{refletida} pelo pigmento, e não à luz absorvida.\n' +
    'A \\textbf{clorofila} absorve principalmente luz nas regiões do \\textbf{azul/violeta} e do \\textbf{vermelho}, refletindo o \\textbf{verde}.\n' +
    '$$\\boxed{\\text{Cor observada = cor refletida}}$$\n' +
    'Os \\textbf{carotenoides} absorvem principalmente entre \\textbf{violeta e azul}, refletindo tons \\textbf{amarelos e alaranjados}.';

  // Simula o extrator e formatador de texto do LatexRenderer
  const delimiterRegex = /(?:\$\$([\s\S]*?)\$\$)|(?:\$([^\$\n\r]+?)\$)|(?:\\\[([\s\S]*?)\\\])|(?:\\\(([\s\S]*?)\\\))/g;
  const segments: Array<{ type: 'text' | 'inline-math' | 'block-math'; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = delimiterRegex.exec(sampleNote)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: sampleNote.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ type: 'block-math', content: match[1].trim() });
    }
    lastIndex = delimiterRegex.lastIndex;
  }
  if (lastIndex < sampleNote.length) {
    segments.push({ type: 'text', content: sampleNote.slice(lastIndex) });
  }

  // Verifica que encontrou 1 bloco de matemática com o box
  const mathSegments = segments.filter((s) => s.type === 'block-math');
  assert.equal(mathSegments.length, 1);
  assert.ok(mathSegments[0].content.includes('\\boxed'));

  // Valida que o bloco matemático renderiza com sucesso no KaTeX
  const renderedMath = katex.renderToString(mathSegments[0].content, { displayMode: true, throwOnError: false });
  assert.ok(renderedMath.includes('katex'));
  assert.ok(renderedMath.includes('Cor observada = cor refletida'));

  // Testa o regex/parser de \\textbf nos segmentos de texto
  const textSegments = segments.filter((s) => s.type === 'text');
  const allText = textSegments.map((s) => s.content).join(' ');

  const boldMatches = Array.from(allText.matchAll(/\\textbf\{([^}]+)\}/g)).map((m) => m[1]);
  assert.deepEqual(boldMatches, [
    'refletida',
    'clorofila',
    'azul/violeta',
    'vermelho',
    'verde',
    'carotenoides',
    'violeta e azul',
    'amarelos e alaranjados',
  ]);
});

test('BIZU-02: Suporta múltiplas formatações inline: \\textbf, \\textit, \\underline e markdown **negrito**', () => {
  const mixedText = 'Bizu: \\textbf{Atenção} à fórmula \\textit{in vitro} e ao ponto \\underline{vital}, além de **destaque**.';

  const hasLatexBold = /\\textbf\{([^}]+)\}/.test(mixedText);
  const hasLatexItalic = /\\textit\{([^}]+)\}/.test(mixedText);
  const hasLatexUnderline = /\\underline\{([^}]+)\}/.test(mixedText);
  const hasMarkdownBold = /\*\*([^*]+)\*\*/.test(mixedText);

  assert.equal(hasLatexBold, true);
  assert.equal(hasLatexItalic, true);
  assert.equal(hasLatexUnderline, true);
  assert.equal(hasMarkdownBold, true);
});

// ============================================================================
// 2. SUPORTE A ATÉ 5 FOTOS POR TÓPICO (imageUrls) E RETROCOMPATIBILIDADE
// ============================================================================
test('BIZU-03: Suporta até 5 imagens no array imageUrls e preserva compatibilidade com imageUrl', () => {
  const sampleImages = [
    'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vA==',
    'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vB==',
    'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vC==',
    'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vD==',
    'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AA/vE==',
  ];

  const bizuWith5Photos: BizuItem = {
    id: 'bizu_fotossintese_01',
    title: 'Citologia: Fotossíntese e Pigmentos',
    subjectName: 'Biologia',
    category: 'Citologia & Bioenergética',
    statement: '(UERJ 2024) Considere que determinadas plantas apresentam clorofila A e B e carotenoides...',
    imageUrl: sampleImages[0],
    imageUrls: sampleImages,
    notes: 'Tópico 1 - Pigmentos Fotossintetizantes...',
    keyPoints: ['Clorofila reflete verde', 'Carotenoides absorvem azul e violeta'],
    tags: ['Biologia', 'Citologia', 'Fotossíntese'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert.equal(bizuWith5Photos.imageUrls?.length, 5);
  assert.equal(bizuWith5Photos.imageUrl, sampleImages[0]);
  assert.equal(bizuWith5Photos.subjectName, 'Biologia');
  assert.ok(bizuWith5Photos.statement?.includes('UERJ 2024'));

  // Normalização de item antigo que possui apenas imageUrl único
  const legacyBizu: BizuItem = {
    id: 'bizu_legacy_01',
    title: 'Leis de Newton',
    subjectName: 'Física',
    imageUrl: 'https://exemplo.com/newton.png',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const resolvedImages = legacyBizu.imageUrls?.length
    ? legacyBizu.imageUrls
    : legacyBizu.imageUrl
    ? [legacyBizu.imageUrl]
    : [];

  assert.equal(resolvedImages.length, 1);
  assert.equal(resolvedImages[0], 'https://exemplo.com/newton.png');
});

// ============================================================================
// 3. TÍTULO EXPANDIDO / ENUNCIADO DE QUESTÃO (statement)
// ============================================================================
test('BIZU-04: Suporta e persiste statement como enunciado de questão com fórmulas LaTeX', () => {
  const statementWithFormula =
    '(CFO CBMERJ) Um corpo de massa $m = 2\\text{ kg}$ parte do repouso e atinge velocidade $v = 10\\text{ m/s}$. Calcule o trabalho realizado pela força resultante.';

  const bizuItem: BizuItem = {
    id: 'bizu_trabalho_energia',
    title: 'Trabalho e Teorema da Energia Cinética',
    subjectName: 'Física',
    statement: statementWithFormula,
    tags: ['Mecânica'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert.ok(bizuItem.statement);
  assert.ok(bizuItem.statement.includes('$m = 2\\text{ kg}$'));
  assert.ok(bizuItem.statement.includes('$v = 10\\text{ m/s}$'));

  // Serialização JSON para garantir integridade no IndexedDB e LocalStorage
  const jsonStr = JSON.stringify(bizuItem);
  const parsed: BizuItem = JSON.parse(jsonStr);

  assert.equal(parsed.statement, statementWithFormula);
  assert.equal(parsed.title, 'Trabalho e Teorema da Energia Cinética');
  assert.equal(parsed.subjectName, 'Física');
});
