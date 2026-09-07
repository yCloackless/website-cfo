import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Lock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  Flame,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';

interface SecurityGateProps {
  onAuthenticated: (token: string, expiresAt: number, is2faActive: boolean) => void;
}

/**
 * Canvas de Ilusão de Ótica: Fogo Subindo em Chamas Vermelhas
 * e Transicionando para Azul Etéreo Suave no topo.
 */
const FireOpticalIllusionBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    interface FlameParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      maxLife: number;
      life: number;
      baseX: number;
      frequency: number;
      type: 'flame' | 'ember' | 'blueTip';
    }

    const particles: FlameParticle[] = [];
    const maxParticles = Math.min(180, Math.floor(width / 7));

    const createParticle = (): FlameParticle => {
      const isEmber = Math.random() < 0.35;
      const isBlueTip = Math.random() < 0.25;
      const x = Math.random() * width;
      return {
        x,
        baseX: x,
        y: height + Math.random() * 20,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(Math.random() * 2.8 + (isEmber ? 2.5 : 1.4)),
        size: isEmber ? Math.random() * 3 + 1.5 : Math.random() * 32 + 18,
        maxLife: Math.random() * 90 + 70,
        life: 0,
        frequency: Math.random() * 0.05 + 0.02,
        type: isEmber ? 'ember' : isBlueTip ? 'blueTip' : 'flame',
      };
    };

    // Preencher partículas iniciais
    for (let i = 0; i < maxParticles; i++) {
      const p = createParticle();
      p.y = height - Math.random() * height * 0.8;
      p.life = Math.random() * p.maxLife * 0.6;
      particles.push(p);
    }

    let time = 0;

    const render = () => {
      time += 0.025;
      ctx.clearRect(0, 0, width, height);

      // Efeito de mesclagem aditiva para dar brilho e ilusão de fusão de cores
      ctx.globalCompositeOperation = 'screen';

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life++;
        p.y += p.vy;
        p.x = p.baseX + Math.sin(time + p.life * p.frequency) * (20 + p.life * 0.2) + p.vx;

        const progress = p.life / p.maxLife; // 0 = base, 1 = topo

        if (p.life >= p.maxLife || p.y < -50) {
          particles[i] = createParticle();
          continue;
        }

        const alpha = Math.sin(progress * Math.PI) * (p.type === 'ember' ? 0.9 : 0.45);

        // ILUSÃO DE ÓTICA CROMÁTICA:
        // Base: Vermelho incandescente / Laranja fogo
        // Meio-Topo: Transição suave para Azul elétrico/ciano suave
        let r: number, g: number, b: number;
        let radius = p.size;

        if (progress < 0.38) {
          // Fase 1: Vermelho vivo e escarlate no nascimento
          const t = progress / 0.38;
          r = 245;
          g = Math.floor(40 + t * 70);
          b = Math.floor(10 + t * 20);
        } else if (progress < 0.7) {
          // Fase 2: Transição da chama (Vermelho -> Violeta/Índigo -> Azul)
          const t = (progress - 0.38) / 0.32;
          r = Math.floor(245 * (1 - t) + 40 * t);
          g = Math.floor(110 * (1 - t) + 120 * t);
          b = Math.floor(30 * (1 - t) + 250 * t);
          radius *= 1.1; // ligeira expansão óptica da chama
        } else {
          // Fase 3: Topo com azul suave, etéreo e hipnótico
          const t = (progress - 0.7) / 0.3;
          r = Math.floor(40 * (1 - t) + 20 * t);
          g = Math.floor(120 * (1 - t) + 180 * t);
          b = Math.floor(250 * (1 - t) + 255 * t);
          radius *= 1 - t * 0.3;
        }

        if (p.type === 'ember') {
          // Brilhos intensos (faíscas subindo)
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = progress < 0.5 ? `rgba(254, 215, 170, ${alpha})` : `rgba(186, 230, 253, ${alpha * 0.8})`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = progress < 0.5 ? '#ef4444' : '#38bdf8';
          ctx.fill();
        } else {
          // Labareda volumétrica suave em gradiente radial
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, radius));
          gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
          gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
          gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1, radius), 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      }

      animFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-80"
      style={{ filter: 'blur(1px)' }}
    />
  );
};

export const SecurityGate: React.FC<SecurityGateProps> = ({ onAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const codeInputRef = useRef<HTMLInputElement>(null);

  // Format TOTP code input: allow only digits, max 6
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(raw);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Informe o identificador de operador.');
      return;
    }
    if (!password) {
      setErrorMsg('Informe a chave de acesso mestra.');
      return;
    }
    if (totpCode.length !== 6) {
      setErrorMsg('Digite o código Authenticator completo de 6 dígitos.');
      codeInputRef.current?.focus();
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          token: totpCode,
          rememberMe,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Código Authenticator ou credenciais incorretas.');
        setLoading(false);
        return;
      }

      // Salva a sessão no localStorage
      localStorage.setItem('cfo_terminal_session', data.token);
      localStorage.setItem('cfo_terminal_expires_at', String(data.expiresAt));
      localStorage.setItem('cfo_terminal_user', data.username);

      onAuthenticated(data.token, data.expiresAt, Boolean(data.is2faActive));
    } catch (err: any) {
      setErrorMsg('Falha de conexão com o terminal de segurança. Verifique se o backend está ativo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#050508] text-slate-100 flex flex-col justify-between overflow-x-hidden select-none font-sans">
      {/* Dynamic Optical Illusion Fire Canvas Background */}
      <FireOpticalIllusionBackground />

      {/* Layered Ambience: Deep Dark Base with Red-to-Blue Thermal Aura */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(ellipse at 50% 100%, rgba(220, 38, 38, 0.35) 0%, rgba(153, 27, 27, 0.18) 35%, transparent 70%),
            radial-gradient(circle at 50% 15%, rgba(59, 130, 246, 0.12) 0%, rgba(30, 58, 138, 0.05) 45%, transparent 70%),
            linear-gradient(to top, rgba(10, 2, 2, 0.9) 0%, rgba(5, 5, 10, 0.85) 60%, rgba(2, 2, 5, 0.95) 100%)
          `,
        }}
      />

      {/* Tactical Grid Pattern Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-15"
        style={{
          backgroundImage: `
            linear-gradient(rgba(239, 68, 68, 0.2) 1px, transparent 1px),
            linear-gradient(90deg, rgba(239, 68, 68, 0.2) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px',
        }}
      />

      {/* High-Tech Tactical Animations */}
      <style>{`
        @keyframes emblem-pulse {
          0%, 100% {
            filter: drop-shadow(0 0 20px rgba(239, 68, 68, 0.7)) drop-shadow(0 0 35px rgba(220, 38, 38, 0.4));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 32px rgba(249, 115, 22, 0.85)) drop-shadow(0 0 50px rgba(59, 130, 246, 0.4));
            transform: scale(1.03);
          }
        }
        @keyframes aura-scan {
          0% { transform: translateY(-100%); opacity: 0; }
          50% { opacity: 0.4; }
          100% { transform: translateY(1000%); opacity: 0; }
        }
        @keyframes fire-glow-pulse {
          0%, 100% {
            box-shadow: 0 0 25px -2px rgba(220, 38, 38, 0.6), 0 0 45px -10px rgba(59, 130, 246, 0.25), inset 0 0 15px rgba(220, 38, 38, 0.2);
          }
          50% {
            box-shadow: 0 0 40px 4px rgba(239, 68, 68, 0.85), 0 0 65px -5px rgba(59, 130, 246, 0.4), inset 0 0 25px rgba(239, 68, 68, 0.35);
          }
        }
      `}</style>

      {/* Top Tactical Status Bar */}
      <header className="relative z-10 w-full px-6 py-4 flex items-center justify-between border-b border-red-950/40 bg-black/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-red-500/90 font-bold">
            TERMINAL DE SEGURANÇA // CBMERJ BLINDADO
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-zinc-400">
          <span className="px-2 py-0.5 rounded border border-red-900/50 bg-red-950/30 text-red-400 font-semibold">
            2FA TOTP ATIVO
          </span>
          <span className="px-2 py-0.5 rounded border border-blue-900/50 bg-blue-950/30 text-blue-400 font-semibold">
            HMAC-SHA256
          </span>
        </div>
      </header>

      {/* Central Security Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-4">
        <div className="w-full max-w-md relative">
          {/* Tactical Corner Reticles with Fire Red / Cyan Accents */}
          <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-red-500 pointer-events-none" />
          <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-blue-500 pointer-events-none" />
          <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-red-500 pointer-events-none" />
          <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-blue-500 pointer-events-none" />

          {/* Main Card Body */}
          <div className="relative bg-zinc-950/92 border border-red-900/50 rounded-2xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl shadow-red-950/70 overflow-hidden">
            {/* Holographic red scanline accent */}
            <div
              className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent pointer-events-none"
              style={{ animation: 'aura-scan 7s infinite linear' }}
            />

            {/* Firefighter Dalmatian Emblem Centerpiece */}
            <div className="flex flex-col items-center justify-center mb-6">
              <div
                className="relative w-32 h-32 sm:w-36 sm:h-36 mb-3 flex items-center justify-center cursor-default"
                style={{ animation: 'emblem-pulse 4s infinite ease-in-out' }}
              >
                {/* Multi-layered Fiery Halo (Red to Cyan Glow) */}
                <div className="absolute -inset-3 rounded-2xl bg-gradient-to-tr from-red-600/40 via-amber-600/30 to-blue-500/20 blur-xl pointer-events-none" />

                {/* Tactical Emblem Badge */}
                <div className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-red-600/80 shadow-[0_0_35px_rgba(220,38,38,0.7)] bg-black flex items-center justify-center">
                  <img
                    src="/fire-dalmatian.jpg"
                    alt="CBMERJ K9 Firefighter"
                    className="w-full h-full object-cover select-none transform hover:scale-105 transition-transform duration-500"
                    draggable={false}
                  />
                  {/* Subtle Tactical Grid Highlight & Reflection */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-red-500/20 pointer-events-none" />
                  <div className="absolute bottom-1.5 inset-x-0 text-center">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-white/90 bg-red-950/80 px-2 py-0.5 rounded border border-red-600/60 shadow">
                      CFO • CBMERJ
                    </span>
                  </div>
                </div>
              </div>

              {/* Tactical Title */}
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-red-800/60 bg-red-950/40 text-[10px] font-mono uppercase tracking-widest text-red-400 font-bold mb-1.5">
                  <Flame className="w-3 h-3 text-red-500 animate-pulse" />
                  SISTEMA DE DEFESA // BLOQUEADO
                </div>
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white uppercase font-mono">
                  TERMINAL DE ACESSO RESTRITO
                </h1>
                <p className="text-xs text-red-500 font-mono tracking-wider font-semibold">
                  • CORPO DE BOMBEIROS MILITAR •
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 max-w-xs">
                  Autenticação obrigatória com credenciais mestras e token Google Authenticator.
                </p>
              </div>
            </div>

            {/* Error Alert Message */}
            {errorMsg && (
              <div className="mb-5 p-3 rounded-lg bg-red-950/70 border border-red-600/80 text-red-200 text-xs flex items-start gap-2.5 animate-shake">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed font-medium">{errorMsg}</div>
              </div>
            )}

            {/* Security Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Field: Usuário (Visually Empty) */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  Operador Autorizado
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                    <User className="w-4 h-4 text-red-500/70" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder=""
                    autoComplete="off"
                    required
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-black/70 border border-zinc-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-white placeholder-zinc-600 font-mono text-sm transition-all"
                  />
                </div>
              </div>

              {/* Field: Senha */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  Chave Mestra de Acesso
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                    <Lock className="w-4 h-4 text-red-500/70" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="off"
                    required
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-black/70 border border-zinc-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-white placeholder-zinc-600 font-mono text-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Field: Código Authenticator (6 dígitos) - SEMPRE OBRIGATÓRIO */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                    Token Google Authenticator (6 Dígitos)
                  </label>
                  <span className="text-[10px] font-mono text-red-400 flex items-center gap-1">
                    <Smartphone className="w-3 h-3" /> TOTP
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                    <KeyRound className="w-4 h-4 text-red-500" />
                  </div>
                  <input
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={totpCode}
                    onChange={handleCodeChange}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                    className="w-full pl-9 pr-3 py-3 rounded-lg bg-black/85 border border-red-900/60 focus:border-red-500 focus:ring-2 focus:ring-red-500/50 text-white text-center font-mono text-xl tracking-[0.4em] placeholder:tracking-normal placeholder-zinc-700 transition-all font-bold shadow-inner"
                  />
                </div>
              </div>

              {/* Checkbox: Lembrar este dispositivo por 30 dias */}
              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-red-600 focus:ring-red-500/40 focus:ring-offset-0 transition cursor-pointer accent-red-600"
                  />
                  <span className="text-xs font-mono text-zinc-300 group-hover:text-white transition-colors">
                    Lembrar este dispositivo por 30 dias
                  </span>
                </label>
              </div>

              {/* Submit Button with Pulsing Fire Aura */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-red-700 via-red-600 to-red-800 hover:from-red-600 hover:via-red-500 hover:to-red-700 text-white font-mono font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 border border-red-400/40 transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  animation: !loading ? 'fire-glow-pulse 2.5s infinite ease-in-out' : 'none',
                }}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>VALIDANDO CÓDIGO...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>DESTRAVAR TERMINAL</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Mandatory Required Footer */}
      <footer className="relative z-10 w-full py-6 text-center text-xs font-mono text-red-500/70 border-t border-red-950/30 bg-black/50 backdrop-blur-sm space-y-0.5 select-text">
        <div>Criado por Meifode</div>
        <div className="text-[11px] text-red-400/50">discord: nord3093</div>
      </footer>
    </div>
  );
};
