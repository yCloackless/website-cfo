import React, { lazy, Suspense, useState, useEffect } from 'react';
import {
  ArrowRight, BarChart3, BookOpen, CalendarDays, CheckCircle2, Flame, Target, Trophy,
} from 'lucide-react';

const FibonacciSphere = lazy(() => import('./FibonacciSphere'));

function DeferredFibonacciSphere() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Em viewports móveis estreitos (< 640px), o texto do Hero ocupa a tela inteira.
    // Evita inicialização de WebGL na carga inicial mobile.
    if (window.innerWidth < 640) return;

    const activate = () => {
      setShouldRender(true);
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener('scroll', activate);
      window.removeEventListener('pointerdown', activate);
      window.removeEventListener('pointermove', activate);
      window.removeEventListener('touchstart', activate);
      window.removeEventListener('keydown', activate);
    };

    window.addEventListener('scroll', activate, { passive: true, once: true });
    window.addEventListener('pointerdown', activate, { passive: true, once: true });
    window.addEventListener('pointermove', activate, { passive: true, once: true });
    window.addEventListener('touchstart', activate, { passive: true, once: true });
    window.addEventListener('keydown', activate, { passive: true, once: true });

    return cleanup;
  }, []);

  if (!shouldRender) return null;

  return (
    <Suspense fallback={null}>
      <FibonacciSphere className="hero-sphere" pointColor="#ffffff" />
    </Suspense>
  );
}

interface LandingPageProps { onOpenLogin: () => void; }

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenLogin }) => (
  <main className="landing min-h-screen overflow-hidden bg-[#fbfcfe] text-[#08172d]">
    <header className="landing-header">
      <div className="landing-container nav-inner">
        <a href="#inicio" className="brand"><Logo /></a>
        <nav className="main-nav"><a href="#metodo">Método</a><a href="#plataforma">Plataforma</a><a href="#resultados">Resultados</a><a href="#sobre">Sobre</a></nav>
        <div className="nav-actions"><button className="login-btn" onClick={onOpenLogin}>Entrar</button><button className="primary-btn small" onClick={onOpenLogin}>Começar agora</button></div>
      </div>
    </header>

    <section id="inicio" className="hero">
      <div className="hero-grid" />
      <div className="landing-container hero-inner">
        <div className="hero-copy">
          <div className="eyebrow"><Trophy size={16} /> Preparação de alto nível para quem quer chegar ao oficialato</div>
          <h1>Seu caminho até o <span>CFO</span> começa aqui.</h1>
          <p>Estude com estratégia, acompanhe sua evolução e transforme cada dia de preparação em progresso real.</p>
          <div className="hero-actions"><button className="primary-btn" onClick={onOpenLogin}>Começar agora <ArrowRight size={18} /></button><a className="secondary-btn" href="#plataforma">Conhecer a plataforma <ArrowRight size={18} /></a></div>
          <div className="hero-links"><span>Questões</span><i /> <span>Cronograma</span><i /> <span>Desempenho</span><i /> <span>Revisões</span></div>
          <div className="motto">“Disciplina hoje.<br />Oficial amanhã.” <b /></div>
        </div>
        <div className="hero-art">
          <div className="hero-sphere-stage" aria-hidden="true"><DeferredFibonacciSphere /></div>
        </div>
      </div>
    </section>

    <section id="resultados" className="stats"><div className="landing-container stats-inner"><h2>Uma preparação construída para quem leva a <span>aprovação a sério.</span></h2><Stat icon={<BookOpen />} title="+10 mil questões" text="Atualizadas e comentadas por especialistas." /><Stat icon={<CalendarDays />} title="Cronograma inteligente" text="Estude com foco, no seu ritmo e com mais produtividade." /><Stat icon={<BarChart3 />} title="Análise de desempenho" text="Identifique seus pontos fortes e evolua de forma constante." /></div></section>

    <section id="plataforma" className="platform"><div className="landing-container"><div className="section-heading"><label>RUMO AO CFO</label><h2>Tudo que você precisa.<br /><em>Sem distrações.</em></h2><p>Uma plataforma criada para transformar preparação em execução, constância e evolução.</p></div><div className="benefit-grid"><Benefit icon={<CalendarDays />} title="Cronograma inteligente" text="Saiba exatamente o que estudar todos os dias e adapte sua rotina de preparação." /><Benefit icon={<Target />} title="Questões direcionadas" text="Treine com questões organizadas por disciplina, assunto e nível de dificuldade." /><Benefit icon={<BarChart3 />} title="Evolução mensurável" text="Acompanhe seus acertos, erros, constância e conteúdos que precisam de revisão." /></div></div></section>
    <section id="sobre" className="final-cta"><div className="landing-container cta-card"><Flame size={30} /><h2>Você não precisa estudar mais.<br /><span>Precisa estudar melhor.</span></h2><p>Organize sua preparação, acompanhe sua evolução e esteja cada vez mais perto do oficialato.</p><button className="cta-btn" onClick={onOpenLogin}>Começar minha preparação <ArrowRight size={18} /></button></div></section>
  </main>
);

function Logo() {
  return (
    <div className="logo-mark">
      <picture>
        <source srcSet="/phoenix-logo-header.webp" type="image/webp" />
        <img className="brand-phoenix" src="/phoenix-logo-header.png" alt="Fênix Rumo ao CFO" width="38" height="38" decoding="async" />
      </picture>
      <div><strong>RUMO AO <span>CFO</span></strong><small>DISCIPLINA HOJE. OFICIAL AMANHÃ.</small></div>
    </div>
  );
}
function Stat({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="stat"><div className="stat-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div></div>; }
function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <article className="benefit"><div className="benefit-icon">{icon}</div><CheckCircle2 size={18} className="benefit-check" /><h3>{title}</h3><p>{text}</p><a href="#inicio">Saiba mais <ArrowRight size={15} /></a></article>; }
