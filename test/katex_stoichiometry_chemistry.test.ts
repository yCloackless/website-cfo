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

test('CHEM-09b: \\boxed preserva o conteúdo matemático com texto', () => {
  const html = renderKatexToString(String.raw`\boxed{\text{Resposta: B}}`, true);

  assert.ok(html.includes('Resposta: B'), 'O conteúdo do quadro deve permanecer renderizado');
  assert.ok(!html.includes('$'), 'O delimitador de matemática não deve vazar para dentro do quadro');
  assert.ok(!html.includes('katex-error'), 'A caixa não deve gerar erro KaTeX');
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

test('CHEM-12: AnkiRenderer recupera dez formatos legados de flashcard', () => {
  const cards = [
    '\\{}n\\{}<strong>Dados:</strong>\\{}n\\{}\\n\\n\\{}nS_{\\{}\\{}text{total}}=2000\\{}\\{},\\{}\\{}text{m}, \\{}\\{}qquad N=5\\{}\\{}text{voltas}\\{}n\\{}',
    '\\textbf{Dados:}\\nS_{total}=2000\\,\\text{m}',
    '\\textbf{Dados:}\n\\nS_{total}=2000\\,\\text{m}',
    '\\{}n\\{}<strong>Dados:</strong>\\{}n\\{}\\n\\n\\{}nS_{\\{}\\{}text{volta}}=\\{}\\{}frac{2000}{5}=400\\{}\\{},\\{}\\{}text{m}\\{}n\\{}',
    '\\textbf{Dados:}\\n\\n2L+C=400',
    '\\textbf{Dados:}\\n\\nv_c=v',
    '\\textbf{Dados:}\\n\\nv_r=\\frac{3}{2}v',
    '&lt;strong&gt;Dados:&lt;/strong&gt;\\n\\nS_{total}=2000\\,\\text{m}',
    'Parágrafo real\\n\\nS_{volta}=\\frac{2000}{5}=400\\,\\text{m}',
    'Equação existente: $v=\\frac{d}{t}$',
  ];

  for (const [index, card] of cards.entries()) {
    const rendered = AnkiRenderer.renderMath(card);
    const sanitized = AnkiRenderer.sanitizeCardHtml(rendered);
    assert.ok(sanitized.includes('<strong>Dados:</strong>') || index === 8 || index === 9, `Formatação de título preservada no caso ${index + 1}`);
    assert.ok(sanitized.includes('class="katex'), `Fórmula convertida em KaTeX no caso ${index + 1}`);
    assert.ok(!sanitized.includes('\\n'), `Quebra literal removida no caso ${index + 1}: ${JSON.stringify(sanitized.slice(0, 500))}`);
    assert.ok(!sanitized.includes('\\{}'), `Escape corrompido removido no caso ${index + 1}`);
    assert.ok(!sanitized.includes('katex-error'), `Sem erro KaTeX no caso ${index + 1}`);
    if (index === 3) assert.ok(sanitized.includes('class="mfrac"'), 'Fração deve ser renderizada como estrutura matemática');
  }
});

test('CHEM-13: AnkiRenderer normaliza LaTeX e quebras com barras duplicadas', () => {
  const card = '\\\\n\\\\nDados:\\\\n\\\\v_r=\\\\frac{3}{2}v\\\\nA velocidade média:\\\\n\\\\v_m=\\\\frac{6}{5}v';
  const rendered = AnkiRenderer.sanitizeCardHtml(AnkiRenderer.renderMath(card));

  assert.equal((rendered.match(/class="katex"/g) || []).length, 2, 'As duas equações devem virar KaTeX');
  assert.equal((rendered.match(/class="mfrac"/g) || []).length, 2, 'As duas frações devem manter sua estrutura');
  assert.ok(rendered.includes('Dados:'), 'O texto do cartão deve continuar visível');
  assert.ok(!rendered.includes('\\\\n'), 'Marcadores duplicados de quebra não devem aparecer');
  assert.ok(!rendered.includes('\\\\frac'), 'Comandos LaTeX duplicados devem ser normalizados');
});

test('CHEM-14: AnkiRenderer recupera delimitadores duplicados do cartão QER autenticado', () => {
  const card = String.raw`\\[\n\\textbf{Dados:}\n\\]\n\n\\[\nS_{\\text{total}}=2000\\,\\text{m}, \\qquad N=5\\text{ voltas}\n\\]\n\n\\[\n\\boxed{L=100\\,\\text{m}}\n\\]\n\n\\[\n\\boxed{\\text{Resposta: B}}\n\\]\n\n\\]\\n\\nsubstituímos \\(C=2L\\):`;
  const rendered = AnkiRenderer.sanitizeCardHtml(AnkiRenderer.renderMath(card));

  assert.ok(rendered.includes('<strong>Dados:</strong>'), 'O título deve permanecer como texto destacado');
  assert.equal((rendered.match(/class="katex"/g) || []).length, 4, 'Equações em bloco e inline devem virar KaTeX uma vez cada');
  assert.ok(!rendered.includes('\\\\[') && !rendered.includes('\\\\]'), 'Delimitadores duplicados não devem aparecer');
  assert.ok(!rendered.includes('\\n'), 'Quebras escapadas do cartão não devem aparecer');
  assert.ok(!rendered.includes('spanclass'), 'HTML KaTeX gerado não deve ser renderizado novamente como matemática');
  assert.ok(rendered.includes('substituímos'), 'O texto após a equação deve continuar visível');
  assert.ok(!rendered.includes('\\n'), 'Marcadores logo após a equação devem virar quebra de linha');
  assert.ok(!rendered.includes('$'), 'O conteúdo de \\boxed não deve exibir delimitadores literais');
  assert.ok(rendered.includes('class="mord text"'), 'O conteúdo de texto dentro de \\boxed deve continuar em modo texto');
  assert.ok(!rendered.includes('katex-newline'), 'Comandos LaTeX escapados não devem virar quebras dentro das caixas');
  assert.ok(!rendered.includes('katex-error'), 'A equação não deve gerar erro KaTeX');
});

test('CHEM-15: AnkiRenderer preserva estilos numéricos de frações e delimitadores KaTeX', () => {
  const card = String.raw`\\[\n6\\left(C+\\frac{4L}{3}\\right)=5(2L+C)\n\\]`;
  const rendered = AnkiRenderer.sanitizeCardHtml(AnkiRenderer.renderMath(card));

  assert.match(rendered, /style="[^"]*top:/, 'O posicionamento vertical do KaTeX deve sobreviver à sanitização');
  assert.match(rendered, /style="[^"]*border-bottom-width:/, 'A barra da fração deve manter a espessura definida pelo KaTeX');
  assert.ok(!rendered.includes('katex-error'), 'A equação não deve gerar erro KaTeX');
});

test('CHEM-16: AnkiRenderer converte ambientes de lista e comandos de espaçamento LaTeX', () => {
  const card = String.raw`Problema: Resolver o sistema: \[\begin{cases}x^2+7x+12=1\\x+y=6\end{cases}\] e determinar a soma de todos os valores.\vspace{0.5em}\hrule\vspace{0.5em}\textbf{Propriedade:} Uma igualdade do tipo $A^B=1$ ocorre em exatamente 3 casos: \begin{enumerate}\item B=0 com A diferente de 0\item A=1\item A=-1 com B inteiro e par\end{enumerate}\vspace{0.5em}\textbf{Resolução:}\begin{itemize}\item Caso 1: Exponente nulo ($x^2+7x+12=0$)\item Caso 2: Base unitária ($y=1$)\end{itemize}`;
  const rendered = AnkiRenderer.sanitizeCardHtml(AnkiRenderer.renderMath(card));

  assert.ok(rendered.includes('<ol>') && rendered.includes('</ol>'), 'enumerate deve virar lista ordenada');
  assert.ok(rendered.includes('<ul>') && rendered.includes('</ul>'), 'itemize deve virar lista não ordenada');
  assert.equal((rendered.match(/<li>/g) || []).length, 5, 'Cada comando item deve virar um item HTML');
  assert.ok(rendered.includes('<hr'), 'hrule deve virar uma linha horizontal');
  assert.ok(!/\\(?:begin|end|item|vspace|hrule)/.test(rendered), 'Comandos de estrutura não devem aparecer como texto');
  assert.ok((rendered.match(/class="katex"/g) || []).length >= 3, 'Equações do sistema e dos itens devem continuar em KaTeX');
  assert.ok(!rendered.includes('katex-error'), 'O conteúdo matemático não deve gerar erro KaTeX');
});
