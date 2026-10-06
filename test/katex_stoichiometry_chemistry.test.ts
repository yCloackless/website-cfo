import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderKatexToString,
  sanitizeMathExpression,
  isDirectMathFormula,
} from '../src/utils/katexChemistry';
import { AnkiRenderer } from '../src/services/anki/ankiRenderer';

test('CHEM-01: Fórmulas químicas com subscritos (números pequenos e embaixo: H_2SO_4, CO_2, H_2O)', () => {
  const formulas = ['H_2SO_4', 'CO_2', 'H_2O', 'Ca(OH)_2', 'C_6H_12O_6'];

  for (const f of formulas) {
    const html = renderKatexToString(f, false);
    assert.ok(html.includes('class="katex"'), `${f} deve conter classe katex`);
    assert.ok(!html.includes('class="katex-error"'), `${f} não deve conter erro do KaTeX`);
    assert.ok(!html.includes('ParseError'), `${f} não deve conter ParseError`);
    // Verifica a presença de layout vertical (subscrito vlist do KaTeX)
    assert.ok(html.includes('vlist'), `${f} deve conter números rebaixados em subscrito (vlist)`);
  }
});

test('CHEM-02: Fórmulas químicas via mhchem (\\ce{H2SO4}, \\ce{Ca(OH)2}) sem necessidade de sublinhado', () => {
  const chemFormulasWithSubscripts = [
    '\\ce{H2SO4}',
    '\\ce{Ca(OH)2}',
    '\\ce{CuSO4 * 5 H2O}',
  ];

  for (const cf of chemFormulasWithSubscripts) {
    const html = renderKatexToString(cf, false);
    assert.ok(html.includes('class="katex"'), `${cf} deve conter classe katex`);
    assert.ok(!html.includes('class="katex-error"'), `${cf} não deve conter erro`);
    assert.ok(!html.includes('ParseError'), `${cf} não deve conter ParseError`);
    assert.ok(html.includes('vlist'), `${cf} deve conter layout de subscrito renderizado`);
  }

  // Fórmulas sem números (ex: NaCl) renderizam como elementos limpos sem erro
  const naclHtml = renderKatexToString('\\ce{NaCl}', false);
  assert.ok(naclHtml.includes('class="katex"'), 'NaCl deve conter classe katex');
  assert.ok(!naclHtml.includes('class="katex-error"'), 'NaCl não deve conter erro');
});

test('CHEM-03: Expoentes e cargas iônicas (números em cima: Fe^{3+}, SO_4^{2-}, H^+, Ca^{2+})', () => {
  const ions = ['Fe^{3+}', 'SO_4^{2-}', 'H^+', 'OH^-', 'Ca^{2+}', '\\ce{Fe^{3+}}', '\\ce{SO4^{2-}}'];

  for (const ion of ions) {
    const html = renderKatexToString(ion, false);
    assert.ok(html.includes('class="katex"'), `${ion} deve conter classe katex`);
    assert.ok(!html.includes('class="katex-error"'), `${ion} não deve conter erro`);
    assert.ok(!html.includes('ParseError'), `${ion} não deve conter ParseError`);
    assert.ok(html.includes('vlist'), `${ion} deve conter expoente/carga no topo`);
  }
});

test('CHEM-04: Isótopos com massa em cima e atômico embaixo (\\ce{^{14}_6C})', () => {
  const isotope = '\\ce{^{14}_6C}';
  const html = renderKatexToString(isotope, false);
  assert.ok(html.includes('class="katex"'), 'Isótopo deve renderizar classe katex');
  assert.ok(!html.includes('class="katex-error"'), 'Isótopo não deve conter erro');
  assert.ok(html.includes('14'), 'Deve conter número de massa 14');
  assert.ok(html.includes('6'), 'Deve conter número atômico 6');
});

test('CHEM-05: Ligações triplas em alcinos e compostos nitrogenados com "#" (\\ce{HC#CH}, \\ce{C#C})', () => {
  const alkynes = ['\\ce{HC#CH}', '\\ce{C#C}', '\\ce{N#N}', 'HC#CH'];

  for (const alkyne of alkynes) {
    const html = renderKatexToString(alkyne, false);
    assert.ok(html.includes('class="katex"'), `${alkyne} deve conter classe katex`);
    assert.ok(!html.includes('class="katex-error"'), `${alkyne} NUNCA deve lançar erro com "#"`);
    assert.ok(!html.includes('ParseError'), `${alkyne} não deve conter ParseError`);
  }

  // No mhchem, a ligação tripla é renderizada com o caractere unicode ≡ (\equiv)
  const mhchemHtml = renderKatexToString('\\ce{HC#CH}', false);
  assert.ok(
    mhchemHtml.includes('≡') || mhchemHtml.includes('&#x2261;') || mhchemHtml.includes('mrel'),
    'mhchem deve renderizar a ligação tripla ≡'
  );
});

test('CHEM-06: Notação de mols e contagem com "#" (n = # \\text{ mols})', () => {
  const countExpressions = [
    'n = # \\text{ mols}',
    '# \\text{de partículas} = n \\cdot N_A',
    '\\text{Questão #1}',
    '\\# \\text{amostras}',
  ];

  for (const expr of countExpressions) {
    const html = renderKatexToString(expr, false);
    assert.ok(html.includes('class="katex"'), `${expr} deve conter classe katex`);
    assert.ok(!html.includes('class="katex-error"'), `${expr} não deve quebrar com "#"`);
    assert.ok(!html.includes('ParseError'), `${expr} não deve acusar ParseError no modo matemático`);
  }
});

test('CHEM-07: Rendimento e Pureza com "%" desescapado (100% não deve ser engolido como comentário)', () => {
  const yieldFormulas = [
    '\\eta = \\frac{m_{\\text{real}}}{m_{\\text{teórica}}} \\times 100%',
    '\\text{Pureza: } p = 95%',
    '100%',
    '100\\%',
  ];

  for (const yf of yieldFormulas) {
    const sanitized = sanitizeMathExpression(yf);
    assert.ok(sanitized.includes('\\%'), `Sanitização deve converter % em \\%: ${sanitized}`);

    const html = renderKatexToString(yf, false);
    assert.ok(html.includes('class="katex"'), `${yf} deve renderizar classe katex`);
    assert.ok(!html.includes('class="katex-error"'), `${yf} não deve conter erro`);
    assert.ok(!html.includes('ParseError'), `${yf} não deve conter ParseError`);
  }
});

test('CHEM-08: Reações estequiométricas com setas (\\ce{2 H2 + O2 -> 2 H2O} e reversíveis <=>)', () => {
  const reactions = [
    '\\ce{2 H2 + O2 -> 2 H2O}',
    '\\ce{N2 + 3 H2 <=> 2 NH3}',
    '\\ce{CaCO3 -> CaO + CO2 ^}',
    '2 H_2 + O_2 -> 2 H_2O',
    'N_2 + 3 H_2 <=> 2 NH_3',
  ];

  for (const rx of reactions) {
    const html = renderKatexToString(rx, false);
    assert.ok(html.includes('class="katex"'), `${rx} deve renderizar classe katex`);
    assert.ok(!html.includes('class="katex-error"'), `${rx} não deve conter erro`);
    assert.ok(!html.includes('ParseError'), `${rx} não deve conter ParseError`);
  }
});

test('CHEM-09: Fórmulas com "&" e "$" sem quebrar KaTeX', () => {
  const safeTests = [
    'A & B',
    '\\text{Reagentes} & \\text{Produtos}',
    'R$ 50',
    '\\begin{matrix} a & b \\\\ c & d \\end{matrix}',
  ];

  for (const st of safeTests) {
    const html = renderKatexToString(st, false);
    assert.ok(html.includes('class="katex"'), `${st} deve conter classe katex`);
    assert.ok(!html.includes('class="katex-error"'), `${st} não deve conter erro`);
    assert.ok(!html.includes('ParseError'), `${st} não deve conter ParseError`);
  }
});

test('CHEM-10: isDirectMathFormula detecta fórmulas químicas puras e rejeita cabeçalhos Markdown', () => {
  // Fórmulas diretas válidas
  assert.equal(isDirectMathFormula('H_2SO_4'), true, 'H_2SO_4 deve ser detectado como fórmula');
  assert.equal(isDirectMathFormula('Fe^{3+}'), true, 'Fe^{3+} deve ser detectado como fórmula');
  assert.equal(isDirectMathFormula('SO_4^{2-}'), true, 'SO_4^{2-} deve ser detectado como fórmula');
  assert.equal(isDirectMathFormula('\\ce{H2SO4}'), true, '\\ce deve ser detectado como fórmula');
  assert.equal(isDirectMathFormula('2 H_2 + O_2 -> 2 H_2O'), true, 'Reação com seta deve ser fórmula');

  // Textos e cabeçalhos Markdown NÃO devem ser fórmulas matemáticas diretas
  assert.equal(isDirectMathFormula('# Estequiometria'), false, '# Estequiometria não é fórmula matemática');
  assert.equal(isDirectMathFormula('## Reagente Limitante'), false, '## Reagente Limitante não é fórmula');
  assert.equal(isDirectMathFormula('Este é um texto comum sobre química.'), false, 'Texto comum não é fórmula');
  assert.equal(isDirectMathFormula('# Tópico 1 - Resumo\n\nTexto longo com várias linhas'), false, 'Documento longo não é fórmula');
});

test('CHEM-11: AnkiRenderer.renderMath renderiza fórmulas químicas e KaTeX sem erro nos flashcards', () => {
  const flashcardInputs = [
    'Qual a fórmula do ácido sulfúrico? $H_2SO_4$',
    'Reação do ferro: $Fe^{3+}$ e $\\ce{H2SO4}$',
    'Equação: $$\\ce{HC#CH + 2 H2 -> CH3-CH3}$$',
    'Rendimento teórico: $\\eta = 100%$',
    'Fórmula com Cloze: {{c1::$H_2SO_4$}}',
  ];

  for (const fi of flashcardInputs) {
    const rendered = AnkiRenderer.renderMath(fi);
    assert.ok(!rendered.includes('class="katex-error"'), `Anki card não deve conter erro: ${fi}`);
    assert.ok(!rendered.includes('ParseError'), `Anki card não deve conter ParseError: ${fi}`);
    assert.ok(rendered.includes('class="katex"'), `Anki card deve conter classe katex: ${fi}`);
  }
});
