import React, { useState, useRef } from 'react';
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

export const SecurityGate: React.FC<SecurityGateProps> = ({ onAuthenticated }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const codeInputRef = useRef<HTMLInputElement>(null);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(raw);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Informe o identificador de operador (admin).');
      return;
    }
    if (!password) {
      setErrorMsg('Informe a chave mestra de acesso.');
      return;
    }
    if (totpCode.length !== 6) {
      setErrorMsg('Digite o código de 6 dígitos do Google Authenticator.');
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

      // Salva sessão no localStorage
      localStorage.setItem('cfo_terminal_session', data.token);
      localStorage.setItem('cfo_terminal_expires_at', String(data.expiresAt));
      localStorage.setItem('cfo_terminal_user', data.username);

      onAuthenticated(data.token, data.expiresAt, true);
    } catch (err) {
      setErrorMsg('Falha de conexão com o terminal de segurança. Verifique se o backend está ativo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#050508] text-slate-100 flex flex-col justify-between overflow-x-hidden select-none font-sans">
      {/* Background: Absolute Black with Radial Crimson / Deep Wine Gradient */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(circle at 50% 18%, rgba(185, 28, 28, 0.3) 0%, rgba(127, 29, 29, 0.18) 28%, rgba(69, 10, 10, 0.09) 55%, #050508 85%),
            radial-gradient(circle at 20% 85%, rgba(153, 27, 27, 0.1) 0%, transparent 45%),
            radial-gradient(circle at 80% 85%, rgba(153, 27, 27, 0.1) 0%, transparent 45%),
            #050508
          `,
        }}
      />

      {/* Tactical Grid Pattern Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-15"
        style={{
          backgroundImage: `
            linear-gradient(rgba(239, 68, 68, 0.18) 1px, transparent 1px),
            linear-gradient(90deg, rgba(239, 68, 68, 0.18) 1px, transparent 1px)
          `,
          backgroundSize: '42px 42px',
        }}
      />

      {/* Dragon Glow & Keyframe Animations */}
      <style>{`
        @keyframes dragon-pulse {
          0%, 100% {
            filter: drop-shadow(0 0 16px rgba(220, 38, 38, 0.6)) drop-shadow(0 0 35px rgba(185, 28, 28, 0.4));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 30px rgba(239, 68, 68, 0.9)) drop-shadow(0 0 60px rgba(220, 38, 38, 0.6));
            transform: scale(1.025);
          }
        }
        @keyframes dragon-eyes {
          0%, 100% { fill: #f59e0b; filter: drop-shadow(0 0 4px #fbbf24); }
          50% { fill: #fef08a; filter: drop-shadow(0 0 12px #f59e0b); }
        }
        @keyframes aura-scan {
          0% { transform: translateY(-100%); opacity: 0; }
          50% { opacity: 0.35; }
          100% { transform: translateY(1000%); opacity: 0; }
        }
        @keyframes red-glow-pulse {
          0%, 100% { box-shadow: 0 0 22px -3px rgba(220, 38, 38, 0.55), inset 0 0 15px rgba(220, 38, 38, 0.2); }
          50% { box-shadow: 0 0 38px 2px rgba(239, 68, 68, 0.85), inset 0 0 25px rgba(239, 68, 68, 0.35); }
        }
      `}</style>

      {/* Top Status Bar */}
      <header className="relative z-10 w-full px-6 py-4 flex items-center justify-between border-b border-red-950/40 bg-black/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-red-500/90 font-bold">
            SECURITY GATE // CBMERJ BLINDADO
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-zinc-400">
          <span className="px-2 py-0.5 rounded border border-red-900/50 bg-red-950/30 text-red-400 font-semibold">
            TOTP SHA-1
          </span>
          <span className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/50 text-zinc-400">
            256-BIT HMAC
          </span>
        </div>
      </header>

      {/* Central Security Card with Red Dragon Centerpiece */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-4">
        <div className="w-full max-w-md relative">
          {/* Tactical Corner Reticles */}
          <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-red-500 pointer-events-none" />
          <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-red-500 pointer-events-none" />
          <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-red-500 pointer-events-none" />
          <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-red-500 pointer-events-none" />

          {/* Main Card Body */}
          <div className="relative bg-zinc-950/92 border border-red-900/50 rounded-2xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl shadow-red-950/70 overflow-hidden">
            {/* Holographic red scanline accent */}
            <div
              className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent pointer-events-none"
              style={{ animation: 'aura-scan 8s infinite linear' }}
            />

            {/* Imposing Red Dragon SVG Emblem */}
            <div className="flex flex-col items-center justify-center mb-6">
              <div
                className="relative w-28 h-28 sm:w-32 sm:h-32 mb-2 flex items-center justify-center"
                style={{ animation: 'dragon-pulse 4s infinite ease-in-out' }}
              >
                {/* Radial Dragon Halo */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-red-600/35 via-red-900/25 to-amber-600/20 blur-xl pointer-events-none" />

                {/* Highly Detailed Red Dragon Vector SVG */}
                <svg
                  viewBox="0 0 200 200"
                  className="w-full h-full relative z-10 drop-shadow-[0_4px_22px_rgba(220,38,38,0.75)]"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="dragonRed" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f87171" />
                      <stop offset="40%" stopColor="#dc2626" />
                      <stop offset="80%" stopColor="#991b1b" />
                      <stop offset="100%" stopColor="#450a0a" />
                    </linearGradient>
                    <linearGradient id="dragonHorn" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#fca5a5" />
                      <stop offset="60%" stopColor="#7f1d1d" />
                      <stop offset="100%" stopColor="#18181b" />
                    </linearGradient>
                    <linearGradient id="jawGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#b91c1c" />
                      <stop offset="100%" stopColor="#270404" />
                    </linearGradient>
                  </defs>

                  {/* Fiery Wing / Crest Backdrop */}
                  <path
                    d="M100 15 C85 30 45 40 30 75 C48 70 65 72 75 85 C55 95 40 120 48 145 C62 135 78 132 90 142 C92 120 100 105 100 105 C100 105 108 120 110 142 C122 132 138 135 152 145 C160 120 145 95 125 85 C135 72 152 70 170 75 C155 40 115 30 100 15 Z"
                    fill="url(#dragonRed)"
                    opacity="0.9"
                  />

                  {/* Left Horn */}
                  <path
                    d="M80 50 C65 25 35 15 15 22 C32 35 52 48 68 62 Z"
                    fill="url(#dragonHorn)"
                    stroke="#f87171"
                    strokeWidth="0.8"
                  />
                  {/* Right Horn */}
                  <path
                    d="M120 50 C135 25 165 15 185 22 C168 35 148 48 132 62 Z"
                    fill="url(#dragonHorn)"
                    stroke="#f87171"
                    strokeWidth="0.8"
                  />

                  {/* Dragon Skull Core / Forehead */}
                  <path
                    d="M100 42 C82 45 70 65 72 90 C72 105 82 120 100 126 C118 120 128 105 128 90 C130 65 118 45 100 42 Z"
                    fill="#7f1d1d"
                    stroke="#ef4444"
                    strokeWidth="1.2"
                  />

                  {/* Skull Ridge Plates */}
                  <path d="M100 44 L92 68 L100 78 L108 68 Z" fill="#b91c1c" stroke="#f87171" strokeWidth="0.8" />
                  <path d="M100 78 L90 98 L100 108 L110 98 Z" fill="#991b1b" />

                  {/* Snout and Upper Jaw */}
                  <path d="M85 92 L75 125 L100 145 L125 125 L115 92 Z" fill="url(#jawGradient)" stroke="#ef4444" strokeWidth="1" />

                  {/* Lower Jaw & Chin Horn */}
                  <path d="M88 132 L100 168 L112 132 Z" fill="#581c1c" stroke="#dc2626" strokeWidth="1" />

                  {/* Flaming Breath & Nostril Embers */}
                  <circle cx="93" cy="120" r="2.5" fill="#f59e0b" />
                  <circle cx="107" cy="120" r="2.5" fill="#f59e0b" />
                  <path d="M97 122 Q100 134 103 122" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />

                  {/* Glowing Amber / Golden Eyes */}
                  <polygon
                    points="76,82 88,88 84,94 72,87"
                    fill="#f59e0b"
                    style={{ animation: 'dragon-eyes 3s infinite alternate' }}
                  />
                  <line x1="80" y1="84" x2="82" y2="92" stroke="#000000" strokeWidth="1.5" />

                  <polygon
                    points="124,82 112,88 116,94 128,87"
                    fill="#f59e0b"
                    style={{ animation: 'dragon-eyes 3s infinite alternate' }}
                  />
                  <line x1="120" y1="84" x2="118" y2="92" stroke="#000000" strokeWidth="1.5" />

                  {/* Sharp White / Crimson Fangs */}
                  <polygon points="82,126 86,138 88,126" fill="#fef2f2" />
                  <polygon points="118,126 114,138 112,126" fill="#fef2f2" />
                  <polygon points="92,129 95,137 97,129" fill="#fef2f2" />
                  <polygon points="108,129 105,137 103,129" fill="#fef2f2" />

                  {/* Inner Dragon Fire Crest */}
                  <path d="M100 20 Q105 32 100 38 Q95 32 100 20" fill="#fbbf24" />
                </svg>
              </div>

              {/* Title & Subtitle */}
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-red-800/60 bg-red-950/40 text-[10px] font-mono uppercase tracking-widest text-red-400 font-bold mb-1.5">
                  <Flame className="w-3 h-3 text-red-500 animate-pulse" />
                  ACESSO RESTRITO // OFICIAL
                </div>
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white uppercase font-sans drop-shadow-[0_2px_12px_rgba(220,38,38,0.5)]">
                  RUMO AO CFO <span className="text-red-500 font-bold">- Área de Alunos</span>
                </h1>
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
              {/* Field: Usuário */}
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
                    placeholder="admin"
                    autoComplete="username"
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
                    autoComplete="current-password"
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

              {/* Field: Token Google Authenticator (6 dígitos) */}
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
                className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-red-700 via-red-600 to-red-800 hover:from-red-600 hover:via-red-500 hover:to-red-700 text-white font-mono font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 border border-red-400/40 transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  animation: !loading ? 'red-glow-pulse 2.5s infinite ease-in-out' : 'none',
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
