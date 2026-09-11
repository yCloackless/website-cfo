import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BarChart3, BookOpen, CalendarDays, CheckCircle2, Flame,
  Home, Search, Settings, ShieldCheck, Target, Trophy,
} from 'lucide-react';
import FibonacciSphere from './FibonacciSphere';

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
          <div className="hero-sphere-stage" aria-hidden="true"><FibonacciSphere className="hero-sphere" pointColor="#ffffff" /></div>
          <div className="blue-panel"><small>DISCIPLINA<br />PROTEGE<br />SONHOS</small><b /><img src="/pm-officer.jpg" alt="Oficial da Polícia Militar" /></div>
          <div className="orange-panel"><small>CORAGEM<br />TAMBÉM<br />SALVA VIDAS</small><img src="/bombeiro-officer.jpg" alt="Oficial do Corpo de Bombeiros" /></div>
          <DashboardMockup />
        </div>
      </div>
    </section>
    <FloriaDiscovery />

    <section id="resultados" className="stats"><div className="landing-container stats-inner"><h2>Uma preparação construída para quem leva a <span>aprovação a sério.</span></h2><Stat icon={<BookOpen />} title="+10 mil questões" text="Atualizadas e comentadas por especialistas." /><Stat icon={<CalendarDays />} title="Cronograma inteligente" text="Estude com foco, no seu ritmo e com mais produtividade." /><Stat icon={<BarChart3 />} title="Análise de desempenho" text="Identifique seus pontos fortes e evolua de forma constante." /></div></section>

    <section id="plataforma" className="platform"><div className="landing-container"><div className="section-heading"><label>RUMO AO CFO</label><h2>Tudo que você precisa.<br /><em>Sem distrações.</em></h2><p>Uma plataforma criada para transformar preparação em execução, constância e evolução.</p></div><div className="benefit-grid"><Benefit icon={<CalendarDays />} title="Cronograma inteligente" text="Saiba exatamente o que estudar todos os dias e adapte sua rotina de preparação." /><Benefit icon={<Target />} title="Questões direcionadas" text="Treine com questões organizadas por disciplina, assunto e nível de dificuldade." /><Benefit icon={<BarChart3 />} title="Evolução mensurável" text="Acompanhe seus acertos, erros, constância e conteúdos que precisam de revisão." /></div></div></section>
    <section id="sobre" className="final-cta"><div className="landing-container cta-card"><Flame size={30} /><h2>Você não precisa estudar mais.<br /><span>Precisa estudar melhor.</span></h2><p>Organize sua preparação, acompanhe sua evolução e esteja cada vez mais perto do oficialato.</p><button className="cta-btn" onClick={onOpenLogin}>Começar minha preparação <ArrowRight size={18} /></button></div></section>
  </main>
);

function Logo() { return <div className="logo-mark"><img className="brand-phoenix" src="/phoenix-logo-cropped.png" alt="Fênix Rumo ao CFO" /><div><strong>RUMO AO <span>CFO</span></strong><small>DISCIPLINA HOJE. OFICIAL AMANHÃ.</small></div></div>; }
function FloriaDiscovery() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const section = sectionRef.current;
        if (!section) return;
        const travel = Math.max(1, section.offsetHeight - window.innerHeight);
        setProgress(Math.min(1, Math.max(0, -section.getBoundingClientRect().top / travel)));
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const viewportScale = Math.max(1, Math.max(window.innerWidth / 220, window.innerHeight / 391) * 1.08);
  const imageScale = 0.62 + (viewportScale - 0.62) * Math.min(1, progress / 0.92);
  const textProgress = Math.min(1, Math.max(0, (progress - 0.1) / 0.54));

  return (
    <section ref={sectionRef} className="floria-discovery" aria-label="Descoberta FLORIA">
      <div className="floria-sticky">
        <div className="floria-orbit floria-orbit-one" />
        <div className="floria-orbit floria-orbit-two" />
        <div className="floria-image-wrap" style={{ transform: `translate3d(-50%, -50%, 0) scale(${imageScale})` }}>
          <img src="/update-black-hole.png" alt="Imagem da experiência FLORIA" />
        </div>
        <div className="floria-copy" style={{ opacity: 1 - textProgress, pointerEvents: textProgress > 0.8 ? 'none' : 'auto' }}>
          <span className="floria-note note-top" style={{ transform: `translate3d(${textProgress * -34}px, ${textProgress * -20}px, 0) rotate(-7deg) scale(${1 - textProgress * .18})` }}>01 / PRESENÇA</span>
          <span className="floria-note note-right" style={{ transform: `translate3d(${textProgress * 42}px, ${textProgress * 18}px, 0) rotate(9deg) scale(${1 - textProgress * .26})` }}>a matéria encontra<br />o silêncio</span>
          <span className="floria-note note-left" style={{ transform: `translate3d(${textProgress * -28}px, ${textProgress * 14}px, 0) rotate(4deg) scale(${1 - textProgress * .2})` }}>FLORIA<br /><i>estudo como ritual</i></span>
          <span className="floria-note note-bottom" style={{ transform: `translate3d(${textProgress * 32}px, ${textProgress * 30}px, 0) rotate(-3deg) scale(${1 - textProgress * .24})` }}>campo de atenção<br /><b>∞</b></span>
          <span className="floria-note note-micro" style={{ transform: `translate3d(${textProgress * 18}px, ${textProgress * -32}px, 0) rotate(16deg) scale(${1 - textProgress * .3})` }}>observe / respire / continue</span>
        </div>
        <div className="floria-scroll-mark" style={{ opacity: Math.max(0, 1 - progress * 3) }} aria-hidden="true"><span>deslize para descobrir</span><i /></div>
      </div>
    </section>
  );
}

function Stat({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="stat"><div className="stat-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div></div>; }
function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <article className="benefit"><div className="benefit-icon">{icon}</div><CheckCircle2 size={18} className="benefit-check" /><h3>{title}</h3><p>{text}</p><a href="#inicio">Saiba mais <ArrowRight size={15} /></a></article>; }
function DashboardMockup() {
  return (
    <div className="dashboard">
      <div className="dash-top"><strong>RUMO AO <span>CFO</span></strong><div className="search"><Search size={11} /> Buscar uma disciplina...</div><b>JP</b></div>
      <div className="dash-body">
        <aside><DashItem icon={<Home />} text="Início" active /><DashItem icon={<BookOpen />} text="Questões" /><DashItem icon={<ShieldCheck />} text="Simulados" /><DashItem icon={<CalendarDays />} text="Cronograma" /><DashItem icon={<Target />} text="Revisões" /><DashItem icon={<BarChart3 />} text="Desempenho" /><div className="dash-spacer" /><DashItem icon={<Settings />} text="Configurações" /></aside>
        <div className="dash-content"><h3>Boa tarde, futuro oficial! 👋</h3><small>Disciplina hoje. Oficial amanhã.</small>
          <div className="metrics"><Metric icon={<BookOpen />} title="Questões resolvidas" value="2.847" /><Metric icon={<BarChart3 />} title="Taxa de acerto" value="78%" green /><Metric icon={<Flame />} title="Dias de estudo" value="42" orange /></div>
          <div className="dash-bottom"><div className="chart"><b>Seu progresso</b><svg viewBox="0 0 400 120"><path d="M5 100 C50 82 65 95 100 75 S150 85 190 70 S230 65 270 50 S330 50 395 12" /></svg><div>Jan　 Fev　 Mar　 Abr　 Mai　 Jun</div></div><div className="week"><b>Cronograma da semana</b>{['Seg  12 questões','Ter  30 questões','Qua  Revisão','Qui  Simulado','Sex  Revisão de erros'].map(x => <span key={x}>{x}</span>)}</div></div>
        </div>
      </div>
      <div className="laptop-base" />
    </div>
  );
}
function DashItem({ icon, text, active }: { icon: React.ReactNode; text: string; active?: boolean }) { return <span className={active ? 'active' : ''}>{icon}{text}</span>; }
function Metric({ icon, title, value, green, orange }: { icon: React.ReactNode; title: string; value: string; green?: boolean; orange?: boolean }) { return <div className="metric"><div className={green ? 'metric-icon green' : orange ? 'metric-icon orange' : 'metric-icon'}>{icon}</div><small>{title}</small><strong>{value}</strong><em className={green ? 'green-text' : ''}>+12% na última semana</em></div>; }
