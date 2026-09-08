import React from 'react';

interface LandingPageProps {
  onOpenLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenLogin }) => {
  return (
    <div className="font-sans antialiased bg-[#070D18] text-white selection:bg-[#0056D2] selection:text-white min-h-screen w-full max-w-full min-w-0">
      <style>{`
        .bg-navy-950 { background-color: #070D18; }
        .bg-navy-900 { background-color: #0B1528; }
        .bg-navy-850 { background-color: #0F1D38; }
        .bg-navy-800 { background-color: #14274B; }
        .bg-navy-700 { background-color: #1C3970; }
        .bg-navy-600 { background-color: #0056D2; }
        .hover\\:bg-navy-850:hover { background-color: #0F1D38; }
        .hover\\:bg-navy-800:hover { background-color: #14274B; }
        .text-navy-950 { color: #070D18; }
        .text-navy-600 { color: #0056D2; }
        .hover\\:text-navy-950:hover { color: #070D18; }
        .hover\\:text-navy-600:hover { color: #0056D2; }
        .border-navy-600 { border-color: #0056D2; }
        .bg-fire-500 { background-color: #FF6B00; }
        .bg-fire-600 { background-color: #EA580C; }
        .bg-fire-700 { background-color: #C2410C; }
        .text-fire-500 { color: #FF6B00; }
        .border-fire-500 { border-color: #FF6B00; }
        .border-fire-500\\/30 { border-color: rgba(255, 107, 0, 0.3); }
        .border-fire-500\\/50 { border-color: rgba(255, 107, 0, 0.5); }
        .bg-fire-500\\/20 { background-color: rgba(255, 107, 0, 0.2); }
        .bg-fire-500\\/25 { background-color: rgba(255, 107, 0, 0.25); }
        .bg-fire-600\\/10 { background-color: rgba(234, 88, 12, 0.1); }
        .bg-navy-600\\/15 { background-color: rgba(0, 86, 210, 0.15); }
        .font-display { font-family: 'Space Grotesk', 'Plus Jakarta Sans', sans-serif; }
        .text-glow-blue { text-shadow: 0 0 25px rgba(0, 86, 210, 0.45); }
        .badge-police {
          background: linear-gradient(135deg, rgba(0,86,210,0.15) 0%, rgba(11,21,40,0.3) 100%);
          border: 1px solid rgba(0,86,210,0.35);
        }
        .badge-fire {
          background: linear-gradient(135deg, rgba(255,107,0,0.15) 0%, rgba(234,88,12,0.25) 100%);
          border: 1px solid rgba(255,107,0,0.4);
        }
      `}</style>

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm py-4">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between">
          
          {/* LOGO */}
          <a href="#inicio" className="flex items-center gap-3 group">
            <img
              src="/phoenix-logo-cropped.png"
              alt="Logo Fênix RUMO ao CFO"
              className="w-10 h-10 object-contain drop-shadow-sm"
            />
            <div className="flex flex-col">
              <span className="text-xl font-extrabold tracking-tight text-navy-950 font-display">
                RUMO <span className="text-navy-600">ao CFO</span>
              </span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold -mt-1">
                Academia &amp; Carreira
              </span>
            </div>
          </a>

          {/* NAVIGATION LINKS */}
          <nav className="hidden md:flex items-center gap-10">
            <a
              href="#inicio"
              className="text-sm font-semibold text-navy-950 hover:text-navy-600 transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-navy-600"
            >
              Início
            </a>
            <a
              href="#cursos"
              className="text-sm font-medium text-slate-600 hover:text-navy-950 transition-colors"
            >
              Cursos
            </a>
            <a
              href="#sobre"
              className="text-sm font-medium text-slate-600 hover:text-navy-950 transition-colors"
            >
              Sobre
            </a>
          </nav>

          {/* ACTIONS */}
          <div className="flex items-center gap-5">
            <button
              onClick={onOpenLogin}
              className="text-sm font-bold text-navy-950 hover:text-navy-600 transition-colors px-2 py-1 tracking-wide cursor-pointer"
            >
              ENTRAR
            </button>
            <button
              onClick={onOpenLogin}
              className="relative group inline-flex items-center justify-center px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-navy-950 hover:bg-navy-850 rounded-lg shadow-md transition-all duration-200 hover:shadow-lg active:scale-[0.98] cursor-pointer"
            >
              <span>COMEÇAR AGORA</span>
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-navy-600 via-white/80 to-fire-500 rounded-b-lg"></div>
            </button>
          </div>

        </div>
      </header>

      {/* HERO SECTION CINEMATOGRÁFICA */}
      <section id="inicio" className="relative min-h-[96vh] pt-24 pb-12 flex flex-col justify-center overflow-hidden bg-[#060B14]">
        
        {/* GRID COMPOSIÇÃO DE FUNDO: FAIXA AZUL | FAIXA BRANCA ESTREITA | FAIXA LARANJA */}
        <div className="absolute inset-0 z-0 flex w-full h-full pointer-events-none select-none">
          
          {/* FAIXA AZUL PROFUNDA (POLÍCIA MILITAR) - Proporção dominante ~56% */}
          <div className="relative h-full w-[56%] bg-gradient-to-br from-[#0B1528] via-[#0E1E38] to-[#081020] border-r border-blue-900/30 overflow-hidden">
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: 'radial-gradient(#FFFFFF 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 left-12 font-mono text-[10px] tracking-[0.3em] uppercase text-blue-300/25 hidden xl:block">
              CADETE DA POLÍCIA MILITAR • ACADEMIA BARRO BRANCO (APMBB)
            </div>
          </div>

          {/* FAIXA BRANCA ESTREITA DE TRANSIÇÃO (ESPAÇO NEGATIVO) ~6% */}
          <div className="relative h-full w-[6%] bg-gradient-to-b from-[#FFFFFF] via-[#F8FAFC] to-[#E2E8F0] shadow-2xl flex flex-col items-center justify-between py-24 z-10">
            <div className="w-px h-24 bg-slate-400/40"></div>
            <div className="rotate-90 origin-center text-[10px] font-extrabold tracking-[0.35em] text-slate-800 uppercase whitespace-nowrap opacity-60">
              EXCELÊNCIA • CFO
            </div>
            <div className="w-px h-24 bg-slate-400/40"></div>
          </div>

          {/* FAIXA LARANJA ESTRATÉGICA (CORPO DE BOMBEIROS) ~38% */}
          <div className="relative h-full w-[38%] bg-gradient-to-bl from-[#9A3412] via-[#C2410C] to-[#7C2D12] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30"></div>
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  'linear-gradient(0deg, #FFFFFF 1px, transparent 1px), linear-gradient(90deg, #FFFFFF 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            <div className="absolute top-1/4 right-0 w-80 h-80 bg-blue-500/25 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-10 right-12 font-mono text-[10px] tracking-[0.3em] uppercase text-blue-200/40 hidden xl:block">
              CADETE BOMBEIRO MILITAR • ABMDOM (CBMERJ)
            </div>
          </div>

        </div>

        {/* IMAGENS DOS PERSONAGENS (OVERFLOW & PROFUNDIDADE ASYMMETRICAL) */}
        <div className="absolute inset-0 z-10 max-w-7xl mx-auto px-6 lg:px-12 pointer-events-none flex items-end justify-between">
          
          {/* POLICIAL MILITAR (LADO ESQUERDO, ULTRA CRISP) */}
          <div className="relative w-[340px] md:w-[420px] lg:w-[480px] h-[82%] flex items-end ml-[-20px] lg:ml-0">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAT6_FntRj9BUDwxHoxdT8bEjErbwsLuuyMkONyJDZ7b2tb3NGt09yU_2ERRmc50UM2L_V1wYyj3IbTZBVHAHEkK_PI2bt-IEo8ZYPL2-7UxwyMaggSKas7HhntUXyePmqlRVHiPTcLL3s2f8XMf-wmIjOSqb6HNb3sfHFcgVmGS-SBY9PwbteXgSOPhh7obWSUWeZ70aiWvsgOwifcfLTgxuKH7MM_jy4gHmvKijf0o2UqflGQG9Xt"
              alt="Oficial da Polícia Militar de São Paulo - Rumo ao CFO"
              className="w-full h-full object-contain object-bottom drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] filter contrast-105"
            />
            <div className="absolute bottom-12 left-4 pointer-events-auto backdrop-blur-md bg-navy-950/80 border border-blue-500/30 rounded-lg p-3 hidden sm:flex items-center gap-3 shadow-xl">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
              <div>
                <div className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">Carreira PM</div>
                <div className="text-xs font-semibold text-slate-200">APMBB • CFO Polícia Militar</div>
              </div>
            </div>
          </div>

          {/* BOMBEIRO MILITAR (LADO DIREITO, ILUMINAÇÃO QUENTE) */}
          <div className="relative w-[320px] md:w-[390px] lg:w-[450px] h-[80%] flex items-end mr-[-20px] lg:mr-0">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBjPsP_tD3yzIt_Kjq8qCY4dW7rX_weQVkI5RubjES3FCw33spU4D3nGLW2q27pKkepO9zqkaHKyYcXzC7Cy76_MftoZDfK_TwwMnjwXAKOfkau8Yub1aNJpLXck0EHDIy2_6m4DzipDwB6eAJkU3Yz2BCU5jLXMih0PjtQYqI7bPncdoKt2RoBqXkcnLmryDxu1tK4WeQn1IKQ2zRl18jVSKxeUrE9x3TOJilTmaVYd-VJ-i9DMoJo"
              alt="Oficial do Corpo de Bombeiros Militar do Rio de Janeiro - Rumo ao CFO"
              className="w-full h-full object-contain object-bottom drop-shadow-[0_20px_50px_rgba(0,0,0,0.85)] filter contrast-105"
            />
            <div className="absolute bottom-12 right-4 pointer-events-auto backdrop-blur-md bg-stone-950/85 border border-fire-500/30 rounded-lg p-3 hidden sm:flex items-center gap-3 shadow-xl">
              <div className="w-2.5 h-2.5 rounded-full bg-fire-500 animate-pulse"></div>
              <div>
                <div className="text-[10px] uppercase font-bold text-fire-500 tracking-wider">Carreira CBM</div>
                <div className="text-xs font-semibold text-slate-200">ABMDOM • CFO Bombeiros</div>
              </div>
            </div>
          </div>

        </div>

        {/* CONTEÚDO EDITORIAL CENTRAL / HERO OVERLAY */}
        <div className="relative z-20 max-w-7xl mx-auto px-6 lg:px-12 w-full pt-10 pb-8 flex flex-col items-center text-center">
          
          {/* EYEBROW BADGE */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-navy-900/90 border border-blue-500/30 backdrop-blur-md mb-6 shadow-lg shadow-black/40">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span className="text-[11px] font-bold tracking-[0.25em] uppercase text-slate-200">
              RUMO AO CFO
            </span>
            <span className="text-slate-500 text-xs">•</span>
            <span className="text-[11px] font-semibold text-slate-400 tracking-wide">TURMAS OFICIAIS 2025</span>
          </div>

          {/* HEADLINE PRINCIPAL */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.08] font-display">
            Sua aprovação começa com{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-white to-sky-300 underline decoration-blue-500/40 decoration-4 underline-offset-8">
              direção.
            </span>
          </h1>

          {/* SUBHEADLINE CURTA */}
          <p className="mt-6 text-base sm:text-lg md:text-xl text-slate-300 font-normal max-w-2xl leading-relaxed drop-shadow-md">
            Prepare-se com estratégia, disciplina e conteúdo direcionado para conquistar sua vaga de oficial militar.
          </p>

          {/* CTAs DE ALTO IMPACTO */}
          <div className="mt-9 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            
            <button
              onClick={onOpenLogin}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 text-sm font-bold tracking-wider uppercase text-white bg-gradient-to-r from-blue-600 via-blue-700 to-navy-900 hover:from-blue-500 hover:to-navy-800 rounded-xl shadow-[0_10px_30px_rgba(0,86,210,0.4)] hover:shadow-[0_15px_35px_rgba(0,86,210,0.6)] transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 border border-blue-400/30 cursor-pointer"
            >
              <span>COMEÇAR AGORA</span>
              <svg className="w-4 h-4 text-blue-200 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>

            <button
              onClick={onOpenLogin}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 text-sm font-semibold tracking-wide text-slate-200 hover:text-white bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/80 backdrop-blur-md rounded-xl transition-all duration-200 cursor-pointer"
            >
              <span>JÁ SOU ALUNO</span>
              <span className="text-fire-500 font-bold">→</span>
            </button>

          </div>

          {/* PILARES DE AUTORIDADE SUB-HERO */}
          <div className="mt-14 pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-6 text-left max-w-4xl w-full">
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Foco Total</div>
              <div className="text-sm font-semibold text-white">Polícia &amp; Bombeiros</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Metodologia</div>
              <div className="text-sm font-semibold text-white">Engenharia Reversa</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Instrutores</div>
              <div className="text-sm font-semibold text-white">Oficiais Formados</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Índice Histórico</div>
              <div className="text-sm font-semibold text-blue-400 font-display font-bold">+84% no Top 50</div>
            </div>
          </div>

        </div>

      </section>

      {/* SEGUNDA E ÚLTIMA SEÇÃO: APRESENTAÇÃO & PILARES */}
      <section id="cursos" className="relative py-24 bg-[#0B1528] border-t border-slate-800/80 overflow-hidden">
        
        {/* Elemento sutil de background */}
        <div className="absolute -right-40 -top-40 w-96 h-96 bg-fire-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -left-40 -bottom-40 w-96 h-96 bg-navy-600/15 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10">
          
          {/* CABEÇALHO DA SEÇÃO */}
          <div className="max-w-2xl mb-16">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-0.5 bg-fire-500"></span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-fire-500">O Método Definitivo</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white font-display leading-tight">
              Do primeiro estudo até a aprovação.
            </h2>
          </div>

          {/* OS TRÊS PEQUENOS PILARES */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* PILAR 1 */}
            <div className="relative group p-8 rounded-2xl bg-gradient-to-b from-[#111F38] to-[#0D182C] border border-slate-700/60 hover:border-blue-500/50 transition-all duration-300 shadow-xl hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white tracking-wide uppercase font-display mb-3">
                CONTEÚDO DIRECIONADO
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Estude exatamente o que importa. Sem desperdício de tempo com editais inflados: cronogramas validados e assertivos para a prova do CFO.
              </p>
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center text-xs font-semibold text-blue-400">
                Filtro de editais PMESP &amp; CBMERJ
              </div>
            </div>

            {/* PILAR 2 */}
            <div className="relative group p-8 rounded-2xl bg-gradient-to-b from-[#111F38] to-[#0D182C] border border-slate-700/60 hover:border-slate-400/50 transition-all duration-300 shadow-xl hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-slate-700/30 border border-slate-500/30 flex items-center justify-center text-slate-200 mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white tracking-wide uppercase font-display mb-3">
                EVOLUÇÃO CONSTANTE
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Acompanhe seu progresso durante a preparação. Métricas preditivas de rendimento, banco de questões comentadas e simulados com ranking real.
              </p>
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center text-xs font-semibold text-slate-300">
                Painel analítico individualizado
              </div>
            </div>

            {/* PILAR 3 (COM ACENTO LARANJA BOMBEIROS) */}
            <div className="relative group p-8 rounded-2xl bg-gradient-to-b from-[#111F38] to-[#0D182C] border border-slate-700/60 hover:border-fire-500/50 transition-all duration-300 shadow-xl hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-fire-500/20 border border-fire-500/30 flex items-center justify-center text-fire-500 mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white tracking-wide uppercase font-display mb-3">
                FOCO NA APROVAÇÃO
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Uma plataforma construída para levar você ao próximo nível. Treinamento mental, redação com correção militar e preparação para o TAF.
              </p>
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center text-xs font-semibold text-fire-500">
                Etapas teórica, física e médica
              </div>
            </div>

          </div>

          {/* BOTÃO DA SEÇÃO */}
          <div className="mt-14 flex justify-center">
            <button
              onClick={onOpenLogin}
              className="inline-flex items-center gap-3 px-9 py-4 text-sm font-bold tracking-wider uppercase text-navy-950 bg-white hover:bg-slate-100 rounded-xl shadow-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.99] cursor-pointer"
            >
              <span>CONHECER A PLATAFORMA</span>
              <svg className="w-4 h-4 text-navy-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>

        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#070D18] border-t border-slate-800/60 py-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-6">
          
          {/* LOGO & BRAND */}
          <div className="flex items-center gap-3">
            <img
              src="https://lh3.googleusercontent.com/aida/AEtjO1WT6g9pUCc4sVuAau0tfC5rGGTPkxXvy7_61hGuvlEIBVg_j6FgW47KImLVQhXJWsCdtDzPhN-cr2JR5dhcaXymf0_e3L-0Ql4Zv4Zg_jtcK-bOkrnc2cwkBtguImHaY9gFk8ihhDg8BMQBcV_2agl6VSFGtH9BMh8KwNyH-KGBWlggcG12EU7jMtexwr_8XCMbgIUcSF3lDBkNcRoL21u9McKZcBDn17mHukoebJscVKsdPb06fVCY8Q"
              alt="Logo Fênix RUMO ao CFO"
              className="w-8 h-8 object-contain"
            />
            <span className="text-sm font-bold tracking-tight text-white font-display">
              RUMO ao CFO
            </span>
          </div>

          {/* COPYRIGHT & TEXTO INSTITUCIONAL */}
          <div className="text-xs text-slate-500 text-center md:text-right">
            © 2025 RUMO ao CFO Treinamento Educacional. Todos os direitos reservados.
            <br className="hidden sm:inline" /> Preparatório independente focado nas Academias de Oficiais Militares.
          </div>

        </div>
      </footer>
    </div>
  );
};
