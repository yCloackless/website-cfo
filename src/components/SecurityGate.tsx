import React, { useState, useRef } from 'react';
import {
  Mail,
  HelpCircle,
  Headphones,
  ShieldCheck,
  KeyRound,
  AlertTriangle,
  ArrowLeft,
  Smartphone,
} from 'lucide-react';

interface SecurityGateProps {
  onAuthenticated: (token: string, expiresAt: number, is2faActive: boolean) => void;
}

export const SecurityGate: React.FC<SecurityGateProps> = ({ onAuthenticated }) => {
  const [step, setStep] = useState<'login' | 'totp'>('login');
  const [email, setEmail] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const codeInputRef = useRef<HTMLInputElement>(null);

  // Step 1: Initial Login with E-mail only (No password)
  const handleInitialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Por favor, informe seu e-mail de acesso.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/initial-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'E-mail não autorizado para acesso.');
        setLoading(false);
        return;
      }

      // Transition to inside the site: ask for Authenticator 2FA code
      setStep('totp');
      setLoading(false);
      setTimeout(() => {
        codeInputRef.current?.focus();
      }, 100);
    } catch (err) {
      setErrorMsg('Falha ao conectar com o servidor. Tente novamente.');
      setLoading(false);
    }
  };

  // Step 2: Verification of Google Authenticator code
  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) {
      setErrorMsg('Digite o código completo de 6 dígitos do Google Authenticator.');
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
          email: email.trim(),
          token: totpCode,
          rememberMe,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Código Authenticator incorreto ou expirado.');
        setLoading(false);
        return;
      }

      // Save session for 30 days
      localStorage.setItem('cfo_terminal_session', data.token);
      localStorage.setItem('cfo_terminal_expires_at', String(data.expiresAt));
      localStorage.setItem('cfo_terminal_user', data.username);

      onAuthenticated(data.token, data.expiresAt, true);
    } catch (err) {
      setErrorMsg('Falha de validação do código. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(raw);
    setErrorMsg(null);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#080707] text-white flex flex-col justify-between overflow-x-hidden select-none font-sans">
      {/* Background: Cinematic Airfield with Jet Silhouettes at Dusk */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700"
        style={{
          backgroundImage: `url('/login-bg.jpg')`,
          filter: step === 'totp' ? 'blur(8px) brightness(0.4)' : 'brightness(0.75)',
        }}
      />

      {/* Deep Dark Vignette Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(ellipse at 50% 100%, rgba(255, 77, 21, 0.22) 0%, rgba(180, 40, 0, 0.08) 35%, transparent 70%),
            radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.85) 100%),
            linear-gradient(to top, rgba(8, 7, 7, 0.95) 0%, rgba(8, 7, 7, 0.5) 50%, rgba(8, 7, 7, 0.9) 100%)
          `,
        }}
      />

      {/* Floating Fiery Ember Particles Keyframes */}
      <style>{`
        @keyframes ember-rise {
          0% { transform: translateY(100%) scale(0.6); opacity: 0; }
          20% { opacity: 0.8; }
          80% { opacity: 0.6; }
          100% { transform: translateY(-300px) scale(1.2); opacity: 0; }
        }
        @keyframes phoenix-glow {
          0%, 100% {
            filter: drop-shadow(0 0 16px rgba(255, 85, 17, 0.6)) drop-shadow(0 0 35px rgba(255, 140, 0, 0.35));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 28px rgba(255, 100, 25, 0.85)) drop-shadow(0 0 50px rgba(255, 180, 0, 0.5));
            transform: scale(1.03);
          }
        }
        @keyframes orange-pulse {
          0%, 100% {
            box-shadow: 0 0 25px rgba(255, 77, 21, 0.55), 0 0 50px rgba(255, 77, 21, 0.25);
          }
          50% {
            box-shadow: 0 0 38px rgba(255, 95, 35, 0.85), 0 0 70px rgba(255, 77, 21, 0.45);
          }
        }
      `}</style>

      {/* Top Header Placeholder for perfect vertical balance */}
      <div className="h-4 sm:h-8" />

      {/* Central Interactive Container */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full max-w-lg mx-auto">
        {step === 'login' ? (
          /* ========================================================================= */
          /* STAGE 1: Identical Design from Screenshot (Sem Senha)                     */
          /* ========================================================================= */
          <div className="w-full flex flex-col items-center animate-fadeIn">
            {/* Fiery Phoenix Crest */}
            <div
              className="relative w-16 h-16 sm:w-20 sm:h-20 mb-3 flex items-center justify-center cursor-default"
              style={{ animation: 'phoenix-glow 3.5s infinite ease-in-out' }}
            >
              <svg
                viewBox="0 0 200 200"
                className="w-full h-full"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="phoenixGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#dc2626" />
                    <stop offset="35%" stopColor="#ff4d15" />
                    <stop offset="70%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#fef08a" />
                  </linearGradient>
                  <radialGradient id="phoenixAura" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff5511" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#ff5511" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Ambient Fiery Aura */}
                <circle cx="100" cy="100" r="75" fill="url(#phoenixAura)" />

                {/* Phoenix Body & Wings Rising in Flight */}
                <path
                  d="M100 35 C90 60 70 85 40 100 C65 95 85 102 95 118 C85 130 65 145 75 165 C88 152 98 148 100 132 C102 148 112 152 125 165 C135 145 115 130 105 118 C115 102 135 95 160 100 C130 85 110 60 100 35 Z"
                  fill="url(#phoenixGrad)"
                />

                {/* Phoenix Left Wing Pinions */}
                <path
                  d="M95 55 C75 75 45 92 25 112 C45 110 65 114 78 126 C68 105 82 85 95 55 Z"
                  fill="url(#phoenixGrad)"
                  opacity="0.9"
                />

                {/* Phoenix Right Wing Pinions */}
                <path
                  d="M105 55 C125 75 155 92 175 112 C155 110 135 114 122 126 C132 105 118 85 105 55 Z"
                  fill="url(#phoenixGrad)"
                  opacity="0.9"
                />

                {/* Crown Flame Crest */}
                <path
                  d="M100 20 Q106 32 100 40 Q94 32 100 20"
                  fill="#fef08a"
                />
                <circle cx="100" cy="30" r="3" fill="#ffffff" />
              </svg>
            </div>

            {/* Title: RUMO AO CFO - Área de Alunos */}
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-sans drop-shadow-[0_2px_12px_rgba(255,94,31,0.4)]">
                <span className="text-white">RUMO AO CFO</span>{' '}
                <span className="text-[#ff5e1f] font-bold">- Área de Alunos</span>
              </h1>
            </div>

            {/* Main Obsidian Login Card */}
            <div className="w-full max-w-[420px] bg-[#120f0e]/85 border border-[#2d231e]/80 rounded-2xl p-7 sm:p-8 backdrop-blur-2xl shadow-2xl shadow-black/90">
              {/* Error Alert */}
              {errorMsg && (
                <div className="mb-5 p-3 rounded-xl bg-red-950/70 border border-red-600/80 text-red-200 text-xs flex items-start gap-2.5 animate-shake">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed font-medium">{errorMsg}</div>
                </div>
              )}

              <form onSubmit={handleInitialLogin} className="space-y-4">
                {/* Field: E-MAIL */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    E-MAIL
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setErrorMsg(null);
                      }}
                      placeholder="seu@email.com"
                      autoComplete="email"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1a1614] border border-[#2d2420] focus:border-[#ff5511] focus:ring-1 focus:ring-[#ff5511] text-white placeholder-zinc-500 text-sm outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Big Vibrant Button: ENTRAR E EVOLUIR */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-5 py-3.5 px-5 rounded-xl font-black text-sm tracking-wider uppercase text-white bg-gradient-to-r from-[#ff4d15] to-[#ff3500] hover:from-[#ff5e26] hover:to-[#ff4510] transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                  style={{ animation: !loading ? 'orange-pulse 3s infinite ease-in-out' : 'none' }}
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>INICIANDO ACESSO...</span>
                    </>
                  ) : (
                    <span>ENTRAR E EVOLUIR</span>
                  )}
                </button>
              </form>

              {/* Auxiliary Links Row: Esqueceu a senha? | Suporte */}
              <div className="flex items-center justify-between pt-5 text-xs text-zinc-400">
                <button
                  type="button"
                  onClick={() => alert('Para recuperação de acesso ao CFO CBMERJ, contate o administrador: nord3093.')}
                  className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Esqueceu a senha?</span>
                </button>

                <button
                  type="button"
                  onClick={() => alert('Suporte técnico tático via Discord: nord3093.')}
                  className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <Headphones className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Suporte</span>
                </button>
              </div>

              {/* Card Footer: Não possui conta? Criar conta */}
              <div className="mt-6 pt-5 border-t border-[#261e1a] text-center text-xs text-zinc-400">
                <span>Não possui conta? </span>
                <button
                  type="button"
                  onClick={() => alert('Matrículas exclusivas para o CFO CBMERJ. Contate o administrador.')}
                  className="text-[#ff7a3d] hover:text-[#ff925e] font-semibold cursor-pointer transition-colors"
                >
                  Criar conta
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* STAGE 2: "DENTRO DO SITE", pede o autenticador (o código de 6 dígitos)   */
          /* ========================================================================= */
          <div className="w-full max-w-[440px] bg-[#120f0e]/95 border border-[#ff5511]/40 rounded-2xl p-7 sm:p-8 backdrop-blur-2xl shadow-2xl shadow-black animate-fadeIn">
            {/* Header with Back Button */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => {
                  setStep('login');
                  setErrorMsg(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Trocar e-mail</span>
              </button>

              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ff4d15]/15 border border-[#ff4d15]/30 text-[10px] font-mono uppercase text-[#ff7a3d] font-bold">
                <Smartphone className="w-3 h-3" /> 2FA ATIVO
              </div>
            </div>

            {/* Title & Explanatory Subtitle */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#ff4d15] to-[#f59e0b] mx-auto mb-3 flex items-center justify-center text-white shadow-lg shadow-[#ff4d15]/40">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-lg sm:text-xl font-black uppercase text-white tracking-wide font-sans">
                AUTENTICAÇÃO EM DUAS ETAPAS
              </h2>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Insira o código de 6 dígitos gerado pelo seu <strong className="text-zinc-200">Google Authenticator</strong> para liberar o cronograma.
              </p>
              <div className="mt-2 inline-block px-3 py-1 rounded-lg bg-[#1c1614] border border-[#332620] text-[11px] font-mono text-[#ff8a50]">
                {email}
              </div>
            </div>

            {/* Error Alert */}
            {errorMsg && (
              <div className="mb-5 p-3 rounded-xl bg-red-950/70 border border-red-600/80 text-red-200 text-xs flex items-start gap-2.5 animate-shake">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed font-medium">{errorMsg}</div>
              </div>
            )}

            {/* 6-Digit TOTP Form */}
            <form onSubmit={handleVerifyTotp} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2 text-center">
                  CÓDIGO DE 6 DÍGITOS
                </label>
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
                  autoFocus
                  required
                  className="w-full py-3.5 px-4 rounded-xl bg-[#1c1714] border border-[#ff5511]/50 focus:border-[#ff5511] focus:ring-2 focus:ring-[#ff5511]/50 text-white text-center font-mono text-2xl tracking-[0.45em] placeholder:tracking-normal placeholder-zinc-600 transition-all font-bold outline-none shadow-inner"
                />
              </div>

              {/* Checkbox: Lembrar este dispositivo por 30 dias */}
              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-[#ff4d15] focus:ring-[#ff4d15]/40 focus:ring-offset-0 transition cursor-pointer accent-[#ff4d15]"
                  />
                  <span className="text-xs text-zinc-300 group-hover:text-white transition-colors">
                    Lembrar este dispositivo por 30 dias
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-3 py-3.5 px-5 rounded-xl font-black text-sm tracking-wider uppercase text-white bg-gradient-to-r from-[#ff4d15] to-[#ff3500] hover:from-[#ff5e26] hover:to-[#ff4510] transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(255,77,21,0.55)]"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>VALIDANDO CÓDIGO...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>CONFIRMAR E LIBERAR ACESSO</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Mandatory Required Footer in exact style of screenshot */}
      <footer className="relative z-10 w-full py-6 text-center text-xs font-mono text-zinc-500 space-y-1 select-text">
        <div className="tracking-wider uppercase text-[11px]">
          © 2026 FÊNIX CONCURSOS MILITARES • DISCIPLINA • CONSTÂNCIA
        </div>
        <div className="text-[10px] text-zinc-600">
          Criado por Meifode • discord: nord3093
        </div>
      </footer>
    </div>
  );
};
