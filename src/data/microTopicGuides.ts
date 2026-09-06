export interface MicroTopicDetail {
  macroCategory?: string;
  examPattern: string; // Como a banca cobra
  commonTraps: string; // Pegadinhas comuns
  keyFormulaOrConcept: string; // Conceito ou fórmula chave (formatado em LaTeX com delimitadores $$ ... $$ ou $ ... $)
  recommendedAction: string; // Recomendação de estudo
}

// Rich tactical insights for CFO CBMERJ microtopics with professional LaTeX formulas
export const MICRO_TOPIC_INSIGHTS: Record<string, MicroTopicDetail> = {
  // === MATEMÁTICA ===
  'Área de Figuras Planas': {
    macroCategory: 'Geometria Plana',
    examPattern: 'A banca cobra cálculo de áreas hachuradas compostas (círculo inscrito em quadrado, setores circulares, coroas). Questões contextualizadas com plantas de edifícios e áreas de resgate.',
    commonTraps: 'Confundir raio com diâmetro ao calcular área do círculo ($A = \\pi r^2$); esquecer de subtrair áreas sobrepostas em figuras compostas.',
    keyFormulaOrConcept: '$$\\text{Triângulo: } A = \\frac{b \\cdot h}{2} = \\frac{l^2\\sqrt{3}}{4} \\text{ (equilátero)}; \\quad \\text{Círculo: } A = \\pi r^2; \\quad \\text{Trapézio: } A = \\frac{(B+b)h}{2}; \\quad \\text{Losango: } A = \\frac{D \\cdot d}{2}$$',
    recommendedAction: 'Treine 10 questões de áreas hachuradas de provas anteriores da FGV/UERJ.',
  },
  'Quadriláteros Notáveis': {
    macroCategory: 'Geometria Plana',
    examPattern: 'Propriedades de paralelogramos, losangos e trapézios aplicadas a problemas métricos e de ângulos alternos internos.',
    commonTraps: 'Achar que todo paralelogramo tem diagonais perpendiculares (isso é exclusivo do losango e do quadrado).',
    keyFormulaOrConcept: '$$\\text{Base Média do Trapézio: } B_m = \\frac{B + b}{2}; \\quad \\text{Losango: } A = \\frac{D \\cdot d}{2} \\quad (d_1 \\perp d_2); \\quad \\text{Paralelogramo: } A = b \\cdot h$$',
    recommendedAction: 'Revise o quadro comparativo de propriedades das diagonais dos quadriláteros.',
  },
  'Sistemas Lineares': {
    macroCategory: 'Matrizes, Sistemas e Determinantes',
    examPattern: 'Problemas contextualizados (mistura de produtos, quantidade de viaturas e bombeiros) resolvidos por escalonamento ou substituição.',
    commonTraps: 'Erros de sinal na matriz aumentada durante o escalonamento ou classificar incorretamente SPD vs SPI vs SI.',
    keyFormulaOrConcept: '$$\\text{Regra de Cramer: } D \\neq 0 \\implies \\text{SPD (única)}; \\quad D = 0 \\text{ e } (D_x = D_y = D_z = 0) \\implies \\text{SPI ou SI}$$',
    recommendedAction: 'Pratique montar o sistema a partir do enunciado em português sem pular etapas.',
  },
  'Triângulos e Semelhança': {
    macroCategory: 'Geometria Plana',
    examPattern: 'Teorema de Tales e semelhança de triângulos em problemas de projeção de sombras, alturas inacessíveis e escadas de salvamento.',
    commonTraps: 'Relacionar lados que não são homólogos (não opostos aos mesmos ângulos).',
    keyFormulaOrConcept: '$$\\text{Casos AA, LAL, LLL}. \\quad \\text{Razão } k: \\quad \\frac{P_1}{P_2} = k; \\quad \\frac{A_1}{A_2} = k^2; \\quad \\frac{V_1}{V_2} = k^3; \\quad \\text{Teorema de Tales: } \\frac{a}{b} = \\frac{c}{d}$$',
    recommendedAction: 'Identifique primeiro os ângulos congruentes antes de montar as proporções dos lados.',
  },
  'Círculo e Circunferência': {
    macroCategory: 'Geometria Plana',
    examPattern: 'Ângulos inscritos e centrais, segmentos tangentes e potência de ponto aplicados a problemas geométricos.',
    commonTraps: 'Confundir comprimento da circunferência ($2\\pi r$) com área ($\\pi r^2$); ângulo inscrito vale metade do arco central.',
    keyFormulaOrConcept: '$$\\text{Comprimento: } C = 2\\pi r; \\quad \\text{Área: } A = \\pi r^2; \\quad \\alpha_{\\text{inscrito}} = \\frac{\\widehat{AB}}{2}; \\quad \\text{Potência de Ponto: } \\overline{PA} \\cdot \\overline{PB} = \\overline{PC} \\cdot \\overline{PD}$$',
    recommendedAction: 'Desenhe sempre a circunferência destacando o centro e o raio perpendicular à reta tangente.',
  },
  'Combinação Simples': {
    macroCategory: 'Análise Combinatória',
    examPattern: 'Escolha de comissões, equipes de resgate, equipes de plantão onde a ordem dos elementos NÃO altera o grupo.',
    commonTraps: 'Usar Arranjo no lugar de Combinação. Se mudar a ordem gera a mesma equipe, é sempre Combinação.',
    keyFormulaOrConcept: '$$C_{n, p} = \\binom{n}{p} = \\frac{n!}{p!(n - p)!}; \\quad C_{7, 3} = \\frac{7 \\cdot 6 \\cdot 5}{3 \\cdot 2 \\cdot 1} = 35$$',
    recommendedAction: 'Pergunte-se sempre: "Se eu trocar a ordem das pessoas, muda o grupo?". Se não, divida pelo fatorial.',
  },
  'Função do 1º Grau (Afim)': {
    macroCategory: 'Funções',
    examPattern: 'Cálculo de tarifas, custos de operação e interpretação de taxas de variação linear a partir de gráficos.',
    commonTraps: 'Confundir coeficiente angular $a = \\frac{\\Delta y}{\\Delta x}$ com o coeficiente linear $b$ (onde o gráfico corta o eixo y).',
    keyFormulaOrConcept: '$$f(x) = ax + b; \\quad a = \\frac{\\Delta y}{\\Delta x} = \\tan(\\theta); \\quad x_0 = -\\frac{b}{a} \\quad (\\text{zero / raiz da função})$$',
    recommendedAction: 'Foque na interpretação física do coeficiente angular como taxa de velocidade/gasto.',
  },
  'Lei dos Cossenos': {
    macroCategory: 'Trigonometria',
    examPattern: 'Cálculo de distâncias em triângulos quaisquer quando se conhecem dois lados e o ângulo compreendido entre eles.',
    commonTraps: 'Esquecer o sinal de menos na fórmula: $a^2 = b^2 + c^2 - 2bc\\cos(\\hat{A})$. Atenção com cossenos no 2º quadrante (são negativos!).',
    keyFormulaOrConcept: '$$a^2 = b^2 + c^2 - 2bc\\cos(\\hat{A}); \\quad \\text{Lei dos Senos: } \\frac{a}{\\sin(\\hat{A})} = \\frac{b}{\\sin(\\hat{B})} = \\frac{c}{\\sin(\\hat{C})} = 2R$$',
    recommendedAction: 'Se o triângulo tiver 2 lados e 1 ângulo entre eles, aplique a Lei dos Cossenos diretamente.',
  },
  'Progressão Aritmética (PA)': {
    macroCategory: 'Progressões (PA e PG)',
    examPattern: 'Padrões de repetição, contagem em filas, rotinas de treinamento e soma dos termos.',
    commonTraps: 'Errar o número total de termos $n$ ao contar intervalos abertos vs fechados.',
    keyFormulaOrConcept: '$$a_n = a_1 + (n - 1)r; \\quad S_n = \\frac{(a_1 + a_n) \\cdot n}{2}; \\quad a_1 + a_n = a_2 + a_{n-1}$$',
    recommendedAction: 'Memorize a fórmula da soma e o macete de termos equidistantes.',
  },
  'Operações com Matrizes': {
    macroCategory: 'Matrizes, Sistemas e Determinantes',
    examPattern: 'Multiplicação de matrizes, cálculo de determinante 2x2 e 3x3 (Regra de Sarrus) e matriz inversa.',
    commonTraps: 'Multiplicação matricial NÃO é comutativa ($A \\cdot B \\neq B \\cdot A$) e só existe se colunas de $A$ = linhas de $B$.',
    keyFormulaOrConcept: '$$\\det(A \\cdot B) = \\det(A) \\cdot \\det(B); \\quad \\det(k \\cdot A) = k^n \\cdot \\det(A) \\quad (A_{m \\times p} \\cdot B_{p \\times n} \\implies C_{m \\times n})$$',
    recommendedAction: 'Revise o teorema de Binet e o cálculo do determinante de ordem 3 por Sarrus.',
  },
  'Média, Moda e Mediana': {
    macroCategory: 'Estatística Básica',
    examPattern: 'Cálculo de média aritmética simples e ponderada, identificação da moda e mediana em conjuntos de dados com números pares e ímpares.',
    commonTraps: 'Calcular a mediana sem ordenar previamente os dados em rol crescente.',
    keyFormulaOrConcept: '$$\\bar{x} = \\frac{\\sum_{i=1}^n x_i}{n}; \\quad \\bar{x}_{\\text{ponderada}} = \\frac{\\sum_{i=1}^n (x_i \\cdot p_i)}{\\sum_{i=1}^n p_i}; \\quad Md = \\begin{cases} x_{\\frac{n+1}{2}} & (n \\text{ ímpar}) \\\\[4pt] \\frac{x_{\\frac{n}{2}} + x_{\\frac{n}{2}+1}}{2} & (n \\text{ par}) \\end{cases}$$',
    recommendedAction: 'Coloque sempre os valores em ordem crescente antes de calcular a mediana.',
  },
  'Equação da Reta': {
    macroCategory: 'Geometria Analítica',
    examPattern: 'Retas perpendiculares e paralelas, distância de ponto a reta e equação reduzida $y = mx + q$.',
    commonTraps: 'Esquecer que retas perpendiculares têm $m_r \\cdot m_s = -1$ (coeficiente angular inverso e oposto).',
    keyFormulaOrConcept: '$$y - y_0 = m(x - x_0); \\quad d(P, r) = \\frac{|Ax_0 + By_0 + C|}{\\sqrt{A^2 + B^2}}; \\quad r \\perp s \\iff m_r \\cdot m_s = -1$$',
    recommendedAction: 'Treine encontrar a reta suporte de trajetórias e interseção de retas.',
  },

  // === PORTUGUÊS ===
  'Advérbio (Valor Semântico e Circunstâncias)': {
    macroCategory: 'Morfologia',
    examPattern: 'Identificar a circunstância expressa no texto (tempo, modo, intensidade, negação, concessão) e papel como modificador.',
    commonTraps: 'Classificar adjetivo como advérbio quando há concordância. Lembre-se: advérbio é classe invariável!',
    keyFormulaOrConcept: '$$\\text{Advérbio modifica: } [\\text{Verbo}] \\quad \\lor \\quad [\\text{Adjetivo}] \\quad \\lor \\quad [\\text{Outro Advérbio}] \\quad (\\text{Invariável})$$',
    recommendedAction: 'Analise o advérbio no contexto da oração, nunca isolado da frase.',
  },
  'Adjetivo (Relação e Caracterização)': {
    macroCategory: 'Morfologia',
    examPattern: 'Distinção entre valor restritivo vs explicativo e adjetivo relacional (que não admite intensificação com "muito").',
    commonTraps: 'Tentar colocar "muito" antes de adjetivo de relação (ex: "energia solar" - não existe "energia muito solar").',
    keyFormulaOrConcept: '$$\\text{Adjetivo de Relação: } \\text{Deriva de substantivo} + \\text{Posposto} + \\text{Objetivo} \\quad (\\nexists \\text{"muito"})$$',
    recommendedAction: 'Foque nas diferenças entre sentido objetivo vs subjetivo (ex: "grande homem" vs "homem grande").',
  },
  'Pronomes e Coesão Referencial': {
    macroCategory: 'Morfologia & Coesão',
    examPattern: 'Identificar o referente textual de pronomes anafóricos (retomam termos) e catáfóricos (antecipam termos).',
    commonTraps: 'Ambiguidade na retomada quando há dois substantivos do mesmo gênero no parágrafo.',
    keyFormulaOrConcept: '$$\\text{Este/Esta/Isto} \\implies \\text{Catafórico ou Anafórico Imediato}; \\quad \\text{Esse/Essa/Isso} \\implies \\text{Anafórico Geral}$$',
    recommendedAction: 'Rastreie o sujeito antecedente substituindo mentalmente o pronome pela palavra original.',
  },
  'Conjunção Coordenativa e Subordinativa': {
    macroCategory: 'Coordenação / Subordinação',
    examPattern: 'Substituição de conectivos mantendo o sentido original (adversativas vs concessivas, causais vs consecutivas).',
    commonTraps: 'Trocar "embora" (concessiva) por "porém" (adversativa) sem ajustar o modo do verbo do indicativo para o subjuntivo.',
    keyFormulaOrConcept: '$$\\text{Adversativa: } \\text{mas, porém, contudo, todavia} \\; (+\\text{indicativo}); \\quad \\text{Concessiva: } \\text{embora, conquanto} \\; (+\\text{subjuntivo})$$',
    recommendedAction: 'Tenha na ponta da língua a lista das 5 conjunções coordenativas e 10 subordinativas adverbiais.',
  },

  // === FÍSICA ===
  'Movimento Retilíneo Uniformemente Variado (MRUV)': {
    macroCategory: 'Cinemática',
    examPattern: 'Cálculo de tempo de frenagem de viaturas, queda livre de objetos e alcance com aceleração constante.',
    commonTraps: 'Errar os sinais da aceleração na subida ($a = -g$) ou confundir velocidade instantânea com média.',
    keyFormulaOrConcept: '$$v = v_0 + at; \\quad s = s_0 + v_0 t + \\frac{1}{2} a t^2; \\quad v^2 = v_0^2 + 2a\\Delta s \\quad (\\text{Equação de Torricelli})$$',
    recommendedAction: 'Se o enunciado não deu e nem pediu o tempo $t$, use a Equação de Torricelli diretamente.',
  },
  'Carga Elétrica e Lei de Coulomb': {
    macroCategory: 'Eletrostática',
    examPattern: 'Força de atração e repulsão entre cargas pontuais no vácuo, quantização da carga e conservação de carga em processos de eletrização.',
    commonTraps: 'Esquecer de elevar a distância ao quadrado ($d^2$) ou não converter centímetros/milímetros para metros.',
    keyFormulaOrConcept: '$$F_e = k_0 \\frac{|q_1 \\cdot q_2|}{d^2} \\quad \\left(k_0 = 9 \\times 10^9 \\, \\frac{\\text{N}\\cdot\\text{m}^2}{\\text{C}^2}\\right); \\quad Q = n \\cdot e \\quad (e = 1{,}6 \\times 10^{-19} \\, \\text{C})$$',
    recommendedAction: 'Converta sempre a distância $d$ para metros antes de elevar ao quadrado.',
  },
  'Dilatação Térmica (Linear, Superficial e Volumétrica)': {
    macroCategory: 'Termologia',
    examPattern: 'Dilatação de barras metálicas, trilhos, lâminas bimetálicas em alarmes de incêndio e dilatação aparente de líquidos.',
    commonTraps: 'Lembrar que orifícios e recipientes ocos se dilatam como se fossem sólidos maciços de mesmo material.',
    keyFormulaOrConcept: '$$\\Delta L = L_0 \\cdot \\alpha \\cdot \\Delta T; \\quad \\Delta A = A_0 \\cdot \\beta \\cdot \\Delta T \\; (\\beta = 2\\alpha); \\quad \\Delta V = V_0 \\cdot \\gamma \\cdot \\Delta T \\; (\\gamma = 3\\alpha)$$',
    recommendedAction: 'Atenção para lâmina bimetálica: a lâmina de maior coeficiente de dilatação encurva sobre a menor.',
  },
  'Leis de Newton e Aplicações': {
    macroCategory: 'Dinâmica',
    examPattern: 'Blocos conectados por fios, tração, força normal, elevadores e decomposição de forças.',
    commonTraps: 'Achar que Normal e Peso formam par de ação e reação (não formam: atuam no mesmo corpo e têm naturezas distintas).',
    keyFormulaOrConcept: '$$\\sum \\vec{F} = m \\cdot \\vec{a}; \\quad \\vec{F}_{A \\to B} = -\\vec{F}_{B \\to A}; \\quad P = m \\cdot g; \\quad N = P\\cos(\\theta) \\text{ (plano inclinado)}$$',
    recommendedAction: 'Isole sempre cada corpo individualmente e desenhe o diagrama de corpo livre com todas as forças.',
  },
  'Força de Atrito': {
    macroCategory: 'Dinâmica',
    examPattern: 'Atrito estático máximo para iminência de movimento vs atrito cinético durante o deslizamento em pisos secos e molhados.',
    commonTraps: 'Achar que o atrito estático é sempre igual a $\\mu_e \\cdot N$. Esse é apenas o valor máximo suportado antes de começar a mover!',
    keyFormulaOrConcept: '$$f_{\\text{at, estático}} \\le \\mu_e \\cdot N; \\quad f_{\\text{at, cinético}} = \\mu_c \\cdot N \\quad (\\mu_e > \\mu_c)$$',
    recommendedAction: 'Se o corpo estiver em repouso e a força aplicada for menor que o atrito máximo, $f_{\\text{at}} = F_{\\text{aplicada}}$.',
  },
  'Energia Mecânica (Cinética e Potencial)': {
    macroCategory: 'Energia e Trabalho',
    examPattern: 'Conservação da energia mecânica em montanha-russa, queda de água e trabalho de forças dissipativas (atrito).',
    commonTraps: 'Esquecer que o atrito retira energia mecânica: $E_{m,\\text{inicial}} - W_{\\text{atrito}} = E_{m,\\text{final}}$.',
    keyFormulaOrConcept: '$$E_c = \\frac{1}{2} m v^2; \\quad E_{pg} = m g h; \\quad E_{pel} = \\frac{1}{2} k x^2; \\quad E_m = E_c + E_p; \\quad W_{\\text{dissipativo}} = \\Delta E_m$$',
    recommendedAction: 'Verifique se há forças dissipativas no trajeto antes de igualar a energia inicial à final.',
  },
  'Calorimetria e Calor Específico': {
    macroCategory: 'Termologia',
    examPattern: 'Equilíbrio térmico entre água e corpos sólidos, potência térmica de aquecedores e quantidade de calor sensível vs latente.',
    commonTraps: 'Misturar calor sensível (mudança de temperatura: $Q = mc\\Delta T$) com calor latente (mudança de fase: $Q = mL$).',
    keyFormulaOrConcept: '$$Q = m \\cdot c \\cdot \\Delta T \\; (\\text{Sensível}); \\quad Q = m \\cdot L \\; (\\text{Latente}); \\quad P = \\frac{Q}{\\Delta t}; \\quad \\sum Q = 0$$',
    recommendedAction: 'Monte a tabela de equilíbrio térmico: quem cede calor ($Q < 0$) e quem absorve calor ($Q > 0$).',
  },
  'Circuitos Elétricos e Lei de Ohm': {
    macroCategory: 'Eletrodinâmica',
    examPattern: 'Associação de resistores em série e paralelo, cálculo de corrente total, potência dissipada e consumo de energia (kWh).',
    commonTraps: 'Calcular resistor equivalente em paralelo somando direto em vez de usar inverso: $1/R_{\\text{eq}} = 1/R_1 + 1/R_2$.',
    keyFormulaOrConcept: '$$U = R \\cdot i; \\quad P = U \\cdot i = R \\cdot i^2 = \\frac{U^2}{R}; \\quad R_{\\text{eq, paralelo}} = \\frac{R_1 \\cdot R_2}{R_1 + R_2}; \\quad E = P \\cdot \\Delta t$$',
    recommendedAction: 'Para dois resistores em paralelo, use o macete do produto pela soma: $R_{\\text{eq}} = \\frac{R_1 \\cdot R_2}{R_1 + R_2}$.',
  },
  'Termometria e Escalas Termométricas': {
    macroCategory: 'Termologia',
    examPattern: 'Conversão entre Celsius, Fahrenheit e Kelvin, e variação de temperatura em diferentes escalas.',
    commonTraps: 'Achar que uma variação de $1\\,°\\text{C}$ equivale a uma variação de $1{,}8\\,°\\text{F}$ e esquecer que $\\Delta T_C = \\Delta T_K$.',
    keyFormulaOrConcept: '$$\\frac{T_C}{5} = \\frac{T_F - 32}{9} = \\frac{T_K - 273}{5}; \\quad \\Delta T_C = \\Delta T_K = \\frac{5}{9}\\Delta T_F$$',
    recommendedAction: 'Para variações térmicas ($\\Delta T$), use a proporção direta $\\frac{\\Delta T_C}{5} = \\frac{\\Delta T_F}{9}$.',
  },
  'Equilíbrio Estático do Ponto Material e Corpo Extenso': {
    macroCategory: 'Estática',
    examPattern: 'Cálculo de torque (momento de uma força), forças em apoios, pontes e escadas apoiadas na parede.',
    commonTraps: 'Esquecer que o braço da alavanca é a distância perpendicular da linha de ação da força ao ponto de rotação.',
    keyFormulaOrConcept: '$$\\sum \\vec{F} = \\vec{0} \\quad (\\text{Equilíbrio de Translação}); \\quad \\sum \\vec{M}_O = \\vec{0} \\quad (\\text{Equilíbrio de Rotação: } M = F \\cdot d \\cdot \\sin\\theta)$$',
    recommendedAction: 'Escolha o ponto de apoio que contém mais forças incógnitas como polo de rotação para anulá-las na equação de momento.',
  },

  // === QUÍMICA ===
  'Atomística e Modelos Atômicos': {
    macroCategory: 'Química Geral',
    examPattern: 'Evolução dos modelos (Dalton, Thomson, Rutherford, Bohr) e semelhanças atômicas (isótopos, isóbaros, isótonos, isoeletrônicos).',
    commonTraps: 'Confundir o modelo de Thomson (pudim de passas) com Rutherford (sistema planetário) e Bohr (níveis quantizados de energia).',
    keyFormulaOrConcept: '$$A = Z + n; \\quad \\text{Isótopos } (Z_1 = Z_2); \\quad \\text{Isóbaros } (A_1 = A_2); \\quad \\text{Isótonos } (n_1 = n_2); \\quad \\Delta E = h \\cdot \\nu$$',
    recommendedAction: 'Lembre-se do salto quântico de Bohr: elétron absorve energia para subir e emite luz/fóton ao retornar.',
  },
  'Funções Inorgânicas (Ácidos, Bases, Sais, Óxidos)': {
    macroCategory: 'Química Geral',
    examPattern: 'Nomenclatura, reações de neutralização, óxidos ácidos (chuva ácida: $\\text{SO}_2, \\text{NO}_2$) e óxidos básicos em combate a incêndios.',
    commonTraps: 'Confundir óxidos anfóteros ($\\text{Al}_2\\text{O}_3, \\text{ZnO}$) com óxidos neutros/indiferentes ($\\text{CO}, \\text{NO}, \\text{N}_2\\text{O}$ - não reagem com água nem ácido/base).',
    keyFormulaOrConcept: '$$\\text{Ácido} + \\text{Base} \\longrightarrow \\text{Sal} + \\text{H}_2\\text{O}; \\quad \\text{Óxido Básico} + \\text{H}_2\\text{O} \\longrightarrow \\text{Base}; \\quad \\text{Óxido Ácido} + \\text{H}_2\\text{O} \\longrightarrow \\text{Ácido}$$',
    recommendedAction: 'Decore os 3 óxidos neutros clássicos de prova: $\\text{CO}, \\text{NO}$ e $\\text{N}_2\\text{O}$.',
  },
  'Ligações Químicas (Iônica, Covalente, Metálica)': {
    macroCategory: 'Química Geral',
    examPattern: 'Propriedades dos compostos iônicos (alto ponto de fusão, conduzem eletricidade fundidos ou em solução) vs covalentes vs metálicos.',
    commonTraps: 'Achar que compostos iônicos conduzem corrente elétrica no estado sólido (somente fundidos ou em solução aquosa!).',
    keyFormulaOrConcept: '$$\\text{Iônica: } \\Delta\\text{EN} \\ge 1{,}7 \\; (\\text{Metal} + \\text{Ametal}); \\quad \\text{Covalente: } \\Delta\\text{EN} < 1{,}7 \\; (\\text{Compartilhamento}); \\quad \\text{Metálica: Nuvem de Elétrons}$$',
    recommendedAction: 'Revise a geometria molecular (linear, angular, trigonal, piramidal, tetraédrica) e polaridade.',
  },
  'Cálculos Químicos e Mol': {
    macroCategory: 'Físico-Química',
    examPattern: 'Conversão de massa para número de mols, quantidade de partículas (constante de Avogadro) e volume molar nas CNTP.',
    commonTraps: 'Esquecer que nas CNTP ($0\\,°\\text{C}$ e $1\\,\\text{atm}$), $1\\,\\text{mol}$ de qualquer gás ideal ocupa $22{,}4\\,\\text{L}$.',
    keyFormulaOrConcept: '$$n = \\frac{m}{M}; \\quad N = n \\cdot N_A \\; (N_A = 6{,}02 \\times 10^{23} \\, \\text{mol}^{-1}); \\quad V = n \\cdot 22{,}4 \\, \\text{L (CNTP)}$$',
    recommendedAction: 'Monte a regra de três padronizada: $1\\,\\text{mol} = M\\,\\text{g} = 6{,}02 \\times 10^{23}\\,\\text{moléculas} = 22{,}4\\,\\text{L (CNTP)}$.',
  },
  'Estequiometria': {
    macroCategory: 'Físico-Química',
    examPattern: 'Reagente limitante e em excesso, pureza de reagentes e rendimento de reações químicas.',
    commonTraps: 'Não balancear a equação química antes de montar as proporções estequiométricas.',
    keyFormulaOrConcept: '$$aA + bB \\longrightarrow cC + dD; \\quad \\text{Rendimento: } \\eta = \\frac{m_{\\text{real}}}{m_{\\text{teórica}}} \\times 100\\%; \\quad \\text{Pureza: } p = \\frac{m_{\\text{puro}}}{m_{\\text{amostra}}} \\times 100\\%$$',
    recommendedAction: 'Passo 1: Balancear a equação; Passo 2: Converter dados para mols ou gramas; Passo 3: Identificar o reagente limitante.',
  },
  'Termoquímica (Entalpia)': {
    macroCategory: 'Físico-Química',
    examPattern: 'Lei de Hess, calor de combustão, entalpia de formação e quebra/formação de ligações químicas.',
    commonTraps: 'Esquecer que a quebra de ligação é um processo endotérmico ($\\Delta H > 0$) e a formação de ligação é exotérmica ($\\Delta H < 0$).',
    keyFormulaOrConcept: '$$\\Delta H = H_{\\text{produtos}} - H_{\\text{reagentes}}; \\quad \\Delta H_{\\text{reação}} = \\sum \\Delta H_{\\text{quebra}} - \\sum \\Delta H_{\\text{formação}}; \\quad \\text{Lei de Hess: } \\Delta H = \\Delta H_1 + \\Delta H_2$$',
    recommendedAction: 'Se inverter a reação, inverta o sinal de $\\Delta H$. Se multiplicar os coeficientes por $n$, multiplique $\\Delta H$ por $n$.',
  },

  // === BIOLOGIA ===
  'Organelas Celulares e Funções Vitais': {
    macroCategory: 'Citologia',
    examPattern: 'Função de mitocôndrias (respiração/ATP), ribossomos (proteínas), retículo liso (lipídios/desintoxicação) e lisossomos (digestão).',
    commonTraps: 'Confundir mitocôndria (células eucariotas em geral) com cloroplasto (exclusivo de autótrofos vegetais).',
    keyFormulaOrConcept: '$$\\text{Mitocôndria: Respiração celular (ATP)}; \\quad \\text{Complexo de Golgi: Secreção e acrossomo}; \\quad 2\\text{H}_2\\text{O}_2 \\xrightarrow{\\text{catalase}} 2\\text{H}_2\\text{O} + \\text{O}_2$$',
    recommendedAction: 'Associe organela à profissão celular: Mitocôndria é a usina, Ribossomo é o operário, Golgi é a agência dos correios.',
  },
  'Sistema Tegumentar (Pele e Queimaduras)': {
    macroCategory: 'Fisiologia Humana',
    examPattern: 'Camadas da pele (epiderme, derme, hipoderme), termorregulação (suor) e graus de queimaduras (1º, 2º e 3º grau).',
    commonTraps: 'Queimadura de 3º grau atinge terminações nervosas e pode ser indolor no local profundo da lesão, sendo a mais perigosa.',
    keyFormulaOrConcept: '$$\\text{Regra dos Nove de Wallace: } \\text{Cabeça: } 9\\%; \\; \\text{Membros Sup: } 2 \\times 9\\%; \\; \\text{Tronco: } 36\\%; \\; \\text{Membros Inf: } 2 \\times 18\\%; \\; \\text{Genitália: } 1\\%$$',
    recommendedAction: 'Tópico de altíssima afinidade com o CBMERJ. Memorize a Regra dos Nove para estimativa de Superfície Corporal Queimada (SCQ).',
  },
  'Hereditariedade e Primeira Lei de Mendel': {
    macroCategory: 'Genética',
    examPattern: 'Cruzamentos monoíbridos, probabilidade genética (regra do "E" e regra do "OU") e heredogramas familiares.',
    commonTraps: 'Confundir proporção fenotípica ($3:1$) com proporção genotípica ($1:2:1$) no cruzamento $Aa \\times Aa$.',
    keyFormulaOrConcept: '$$Aa \\times Aa \\implies 1\\,AA : 2\\,Aa : 1\\,aa \\quad \\left(\\text{Fenótipo: } \\frac{3}{4} \\text{ Dominante}, \\; \\frac{1}{4} \\text{ Recessivo}\\right); \\quad P(A \\cap B) = P(A) \\cdot P(B)$$',
    recommendedAction: 'Monte sempre o Quadro de Punnett e preste atenção se o enunciado pede a probabilidade de um sexo específico.',
  },
  'Respiração Celular e Fermentação': {
    macroCategory: 'Bioquímica e Bioenergética',
    examPattern: 'Fases da respiração aeróbica (Glicólise, Ciclo de Krebs e Fosforilação Oxidativa) e rendimento energético vs Fermentação.',
    commonTraps: 'Achar que a glicólise ocorre na mitocôndria. A glicólise ocorre exclusivamente no citosol (hialoplasma)!',
    keyFormulaOrConcept: '$$\\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\,\\text{O}_2 \\longrightarrow 6\\,\\text{CO}_2 + 6\\,\\text{H}_2\\text{O} + 30\\text{ a }32\\,\\text{ATP} \\quad (\\text{Fermentação: } 2\\,\\text{ATP})$$',
    recommendedAction: 'Lembre-se: o oxigênio atua como aceptor final de elétrons na cadeia respiratória, formando água.',
  },

  // === GEOGRAFIA ===
  'Geopolítica Social (Mundo e Conflitos)': {
    macroCategory: 'Geografia Geral',
    examPattern: 'Conflitos no Oriente Médio, expansão da OTAN, disputas por recursos hídricos e energéticos e crises de refugiados.',
    commonTraps: 'Confundir motivações estritamente religiosas com disputas geopolíticas estratégicas por controle territorial e petróleo.',
    keyFormulaOrConcept: '$$\\text{Multipolaridade Pós-Guerra Fria} \\implies \\text{Ascensão dos BRICS, Segurança Energética e Chokepoints (Ormuz, Malaca, Suez)}$$',
    recommendedAction: 'Acompanhe as atualidades dos últimos 18 meses relacionando aos conceitos geográficos clássicos.',
  },
  'Demografia e População Mundial': {
    macroCategory: 'Geografia Humana',
    examPattern: 'Transição demográfica, pirâmides etárias, envelhecimento populacional e cálculo de taxas demográficas.',
    commonTraps: 'Confundir país povoado (alta densidade demográfica: $\\text{hab/km}^2$) com país populoso (grande população absoluta).',
    keyFormulaOrConcept: '$$\\text{Densidade Demográfica} = \\frac{\\text{População Absoluta}}{\\text{Área (km}^2\\text{)}}; \\quad \\text{Crescimento Vegetativo (CV)} = \\text{Taxa de Natalidade} - \\text{Taxa de Mortalidade}$$',
    recommendedAction: 'Lembre-se que o Brasil é um país populoso (mais de 200 milhões), porém pouco povoado (cerca de $24\\,\\text{hab/km}^2$).',
  },
  'Domínios Morfoclimáticos do Brasil': {
    macroCategory: 'Geografia do Brasil',
    examPattern: 'Classificação de Aziz Ab’Sáber: Amazônico, Caatinga, Cerrado, Mares de Morros, Araucárias, Pradarias e faixas de transição.',
    commonTraps: 'Confundir Mares de Morros (relevo mamelonar e Mata Atlântica sujeito a deslizamentos) com o relevo da Caatinga.',
    keyFormulaOrConcept: '$$\\text{Mares de Morros: Relevo Mamelonar (Meias-Laranjas)} + \\text{Serra do Mar/RJ} + \\text{Intensa Suscetibilidade a Deslizamentos}$$',
    recommendedAction: 'Foco total no domínio dos Mares de Morros (RJ), suscetível a deslizamentos de terra na serra fluminense.',
  },

  // === HISTÓRIA ===
  'Segundo Reinado no Brasil (D. Pedro II)': {
    macroCategory: 'História do Brasil',
    examPattern: 'Economia cafeeira no Vale do Paraíba e Oeste Paulista, Guerra do Paraguai e leis abolicionistas graduais.',
    commonTraps: 'Achar que a abolição foi ato exclusivo da Princesa Isabel, desconsiderando a intensa resistência negra e quilombola.',
    keyFormulaOrConcept: '$$\\text{Parlamentarismo às Avessas} \\quad | \\quad \\text{Lei Eusébio de Queirós (1850)} \\longrightarrow \\text{Ventre Livre (1871)} \\longrightarrow \\text{Áurea (1888)}$$',
    recommendedAction: 'Entenda como a Guerra do Paraguai fortaleceu o Exército Brasileiro e acelerou a crise da Monarquia.',
  },
  '2ª Guerra Mundial (Causas, Fases e Consequências)': {
    macroCategory: 'História Geral',
    examPattern: 'Tratado de Versalhes, ascensão do nazi-fascismo, participação da FEB (Força Expedicionária Brasileira) na Itália e Guerra Fria.',
    commonTraps: 'Esquecer da Batalha de Monte Castelo protagonizada pelos pracinhas da FEB na campanha da Itália em 1944-1945.',
    keyFormulaOrConcept: '$$\\text{Eixo (Alemanha, Itália, Japão)} \\; \\text{vs} \\; \\text{Aliados (EUA, URSS, Reino Unido)}; \\quad \\text{FEB: Campanha da Itália (1944-1945)}$$',
    recommendedAction: 'Estude o papel do Brasil na 2ª Guerra e o impacto da vitória democrática no fim da Era Vargas.',
  },
};

/**
 * Helper to get detail for any microtopic, with smart fallback if not in the dictionary
 */
export function getMicroTopicDetail(
  subjectName: string,
  topicName: string,
  questionCount: number,
  totalSubjectQuestions: number
): MicroTopicDetail {
  if (MICRO_TOPIC_INSIGHTS[topicName]) {
    return MICRO_TOPIC_INSIGHTS[topicName];
  }

  // Smart heuristic generation for any other microtopic
  const pct = Math.round((questionCount / Math.max(totalSubjectQuestions, 1)) * 100);

  return {
    macroCategory: `${subjectName} Geral`,
    examPattern: `Este assunto possui ${questionCount} questões registradas (${pct}% da matéria). A banca cobra questões diretas de fixação conceitual e aplicação prática em situações-problema.`,
    commonTraps: 'Interpretação apressada do enunciado e desatenção às unidades de medida e exceções da regra.',
    keyFormulaOrConcept: `$$\\text{Conceito-Chave: } \\text{Estudo direcionado de } \\mathbf{${topicName}} \\; (${pct}\\% \\text{ de } ${subjectName})$$`,
    recommendedAction: `Resolva de 5 a 10 questões desse tópico para fixar o estilo de enunciado característico da banca do CBMERJ.`,
  };
}
