import React, { useState, useRef } from 'react';

interface SecurityGateProps {
  onAuthenticated: (token: string, expiresAt: number, is2faActive: boolean) => void;
}

export const SecurityGate: React.FC<SecurityGateProps> = ({ onAuthenticated }) => {
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totpInputRef = useRef<HTMLInputElement>(null);

  // Manipulador do código TOTP de 6 dígitos
  const handleTotpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(raw);
    setErrorMsg(null);
  };

  // Passo 1: Validação de E-mail e Senha
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = email.trim();
    if (!cleanUser) {
      setErrorMsg('Por favor, informe seu e-mail de acesso.');
      return;
    }
    if (!password) {
      setErrorMsg('Por favor, informe sua senha.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/check-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanUser,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'E-mail ou senha incorretos.');
        setLoading(false);
        return;
      }

      // Avança para o passo 2 (Google Authenticator)
      setStep('totp');
      setTimeout(() => {
        totpInputRef.current?.focus();
      }, 150);
    } catch (err) {
      // Se não conseguiu checar, permite avançar para validação final via 2fa
      setStep('totp');
      setTimeout(() => {
        totpInputRef.current?.focus();
      }, 150);
    } finally {
      setLoading(false);
    }
  };

  // Passo 2: Validação com Google Authenticator
  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) {
      setErrorMsg('Digite o código de 6 dígitos do Google Authenticator.');
      totpInputRef.current?.focus();
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: email.trim(),
          password,
          token: totpCode,
          rememberMe,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Código Authenticator inválido ou expirado.');
        setLoading(false);
        return;
      }

      // Salva sessão no localStorage
      localStorage.setItem('cfo_terminal_session', data.token);
      localStorage.setItem('cfo_terminal_expires_at', String(data.expiresAt));
      localStorage.setItem('cfo_terminal_user', data.username);

      onAuthenticated(data.token, data.expiresAt, true);
    } catch (err) {
      setErrorMsg('Falha de conexão com o servidor. Verifique se o backend está ativo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-between p-4 sm:p-6 text-slate-800 select-none font-sans"
      style={{
        backgroundColor: '#f1f4f9',
        backgroundImage: `
          radial-gradient(circle at 10% 20%, rgba(219, 234, 254, 0.45) 0%, transparent 45%),
          radial-gradient(circle at 95% 45%, rgba(254, 215, 170, 0.28) 0%, transparent 40%),
          radial-gradient(circle at 50% 100%, rgba(226, 232, 240, 0.4) 0%, transparent 60%)
        `,
      }}
    >
      <div className="w-full flex-1 flex items-center justify-center">
        {/* BEGIN: MainLoginWrapper */}
        <main className="w-full flex items-center justify-center" data-purpose="login-viewport-container">
          {/* BEGIN: LoginCard */}
          <div
            className="w-full max-w-[448px] bg-white rounded-[22px] overflow-hidden flex flex-col relative transition-all duration-300"
            data-purpose="login-main-card"
            style={{
              boxShadow: `
                0 24px 50px -12px rgba(15, 35, 75, 0.09),
                0 8px 20px -6px rgba(0, 0, 0, 0.03),
                0 0 1px 1px rgba(0, 0, 0, 0.015)
              `,
            }}
          >
            {/* Top subtle multi-tone accent indicator matching reference */}
            <div
              aria-hidden="true"
              className="w-full"
              style={{
                height: '3.5px',
                background: 'linear-gradient(90deg, #103774 0%, #1d4ed8 48%, #c2410c 90%, #ea580c 100%)',
              }}
            />

            {/* Card Inner Body Container */}
            <div className="px-8 sm:px-11 pt-8 pb-10 flex flex-col items-center">
              {/* BEGIN: BrandHeader */}
              <header className="flex flex-col items-center text-center w-full" data-purpose="brand-presentation">
                {/* Blue Phoenix Emblem */}
                <div
                  className="w-14 h-14 mb-2 flex items-center justify-center transition-transform hover:scale-105 duration-200"
                  data-purpose="brand-logo"
                >
                  <svg
                    className="w-full h-full drop-shadow-sm"
                    fill="none"
                    viewBox="0 0 500 500"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <defs>
                      <linearGradient id="blueGlow" x1="0%" x2="100%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="40%" stopColor="#0284c7" />
                        <stop offset="80%" stopColor="#0056d2" />
                        <stop offset="100%" stopColor="#0f172a" />
                      </linearGradient>
                      <linearGradient id="cyanAccent" x1="0%" x2="50%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#e0f2fe" />
                        <stop offset="40%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0369a1" />
                      </linearGradient>
                      <linearGradient id="metallicWing" x1="20%" x2="80%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="30%" stopColor="#1d4ed8" />
                        <stop offset="70%" stopColor="#00359e" />
                        <stop offset="100%" stopColor="#0c1e4a" />
                      </linearGradient>
                      <linearGradient id="spineWhite" x1="0%" x2="100%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#ffffff" />
                        <stop offset="50%" stopColor="#dbeafe" />
                        <stop offset="100%" stopColor="#93c5fd" />
                      </linearGradient>
                      <filter height="120%" id="cleanDrop" width="120%" x="-10%" y="-10%">
                        <feDropShadow dx="0" dy="6" floodColor="#0056d2" floodOpacity="0.35" stdDeviation="8" />
                      </filter>
                    </defs>
                    <g filter="url(#cleanDrop)">
                      {/* Left Wing Feathers */}
                      <path
                        d="M250,330 C200,280 80,180 60,35 C80,120 120,200 175,260 C140,190 125,120 120,70 C140,150 180,225 225,275 C195,215 180,150 178,110 C200,180 235,245 250,290 Z"
                        fill="url(#metallicWing)"
                      />
                      <path
                        d="M60,35 C75,100 115,180 175,240 C145,170 125,105 120,70 C95,55 75,45 60,35 Z"
                        fill="url(#cyanAccent)"
                        opacity="0.9"
                      />
                      <path
                        d="M250,340 C210,295 130,220 90,140 C115,200 160,265 210,310 C180,260 160,205 155,170 C180,230 218,285 248,325 Z"
                        fill="url(#blueGlow)"
                      />
                      <path
                        d="M250,365 C220,325 160,265 125,205 C145,250 185,295 230,338 C205,305 185,265 178,240 C200,285 228,325 248,355 Z"
                        fill="url(#metallicWing)"
                      />
                      <path
                        d="M250,390 C230,355 190,305 160,260 C180,295 210,335 242,370 Z"
                        fill="url(#cyanAccent)"
                      />
                      {/* Right Wing Feathers */}
                      <path
                        d="M250,330 C300,280 420,180 440,35 C420,120 380,200 325,260 C360,190 375,120 380,70 C360,150 320,225 275,275 C305,215 320,150 322,110 C300,180 265,245 250,290 Z"
                        fill="url(#metallicWing)"
                      />
                      <path
                        d="M440,35 C425,100 385,180 325,240 C355,170 375,105 380,70 C405,55 425,45 440,35 Z"
                        fill="url(#cyanAccent)"
                        opacity="0.9"
                      />
                      <path
                        d="M250,340 C290,295 370,220 410,140 C385,200 340,265 290,310 C320,260 340,205 345,170 C320,230 282,285 252,325 Z"
                        fill="url(#blueGlow)"
                      />
                      <path
                        d="M250,365 C280,325 340,265 375,205 C355,250 315,295 270,338 C295,305 315,265 322,240 C300,285 272,325 252,355 Z"
                        fill="url(#metallicWing)"
                      />
                      <path
                        d="M250,390 C270,355 310,305 340,260 C320,295 290,335 258,370 Z"
                        fill="url(#cyanAccent)"
                      />
                      {/* Tail Feathers */}
                      <path
                        d="M250,470 C240,420 230,370 240,330 C250,370 260,420 250,470 Z"
                        fill="url(#cyanAccent)"
                      />
                      <path
                        d="M250,455 C230,400 215,360 210,335 C225,370 238,410 250,455 Z"
                        fill="url(#blueGlow)"
                      />
                      <path
                        d="M250,455 C270,400 285,360 290,335 C275,370 262,410 250,455 Z"
                        fill="url(#blueGlow)"
                      />
                      {/* Body & Torso */}
                      <path
                        d="M250,195 C225,235 218,290 250,380 C282,290 275,235 250,195 Z"
                        fill="url(#metallicWing)"
                      />
                      <path
                        d="M242,210 C228,255 232,310 250,370 C255,310 248,255 242,210 Z"
                        fill="url(#spineWhite)"
                      />
                      {/* Head & Crest */}
                      <path
                        d="M245,205 C238,175 242,150 260,135 C275,122 295,120 308,125 C295,135 292,148 305,152 C318,156 325,160 312,175 C302,186 288,195 270,202 C258,206 250,208 245,205 Z"
                        fill="url(#blueGlow)"
                      />
                      <path
                        d="M298,168 C312,172 320,175 316,182 C306,184 296,185 288,181 Z"
                        fill="url(#cyanAccent)"
                      />
                      <ellipse cx="282" cy="162" fill="#ffffff" rx="4" ry="2.5" />
                      <ellipse cx="282" cy="162" fill="#38bdf8" rx="2" ry="1.2" />
                      <path
                        d="M255,145 C230,115 205,108 190,102 C212,120 228,140 236,160 Z"
                        fill="url(#cyanAccent)"
                      />
                      <path
                        d="M242,165 C220,145 200,138 190,135 C208,150 222,165 230,180 Z"
                        fill="url(#metallicWing)"
                      />
                    </g>
                  </svg>
                </div>

                {/* Brand Sub-Texts */}
                <span className="text-[13px] font-bold tracking-[0.14em] text-[#164491] uppercase leading-tight font-display">
                  RUMO
                </span>
                <span className="text-[10.5px] font-semibold tracking-wider text-slate-400 mt-[-1px]">
                  ao CFO
                </span>

                {/* Main Welcome Title & Subtitle */}
                {step === 'credentials' ? (
                  <>
                    <h1 className="text-[23px] sm:text-[24px] font-bold text-[#0f172a] tracking-tight mt-6 mb-1.5 font-sans">
                      Bem-vindo de volta
                    </h1>
                    <p className="text-[13.5px] font-normal text-[#64748b] leading-relaxed">
                      Entre para continuar seus estudos.
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="text-[22px] sm:text-[23px] font-bold text-[#0f172a] tracking-tight mt-6 mb-1.5 font-sans">
                      Autenticação 2FA
                    </h1>
                    <p className="text-[13px] font-normal text-[#64748b] leading-relaxed">
                      Digite o código de 6 dígitos gerado pelo Google Authenticator.
                    </p>
                  </>
                )}
              </header>
              {/* END: BrandHeader */}

              {/* Error Message Alert */}
              {errorMsg && (
                <div className="w-full mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-red-500 shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span className="leading-relaxed font-medium">{errorMsg}</span>
                </div>
              )}

              {/* STEP 1: CREDENTIALS FORM */}
              {step === 'credentials' && (
                <form
                  className="w-full mt-7 flex flex-col space-y-4"
                  data-purpose="credentials-form"
                  onSubmit={handleCredentialsSubmit}
                >
                  {/* Input Group: E-mail */}
                  <div className="flex flex-col space-y-1.5" data-purpose="email-field-group">
                    <label
                      className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] px-0.5"
                      htmlFor="email-input"
                    >
                      E-MAIL
                    </label>
                    <div className="relative flex items-center rounded-xl border border-[#e2e8f0] bg-white transition duration-150 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15">
                      {/* Envelope Icon */}
                      <span
                        aria-hidden="true"
                        className="absolute left-3.5 flex items-center pointer-events-none text-[#94a3b8]"
                      >
                        <svg
                          className="w-[18px] h-[18px]"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <rect height="16" rx="2" width="20" x="2" y="4" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                      </span>
                      <input
                        id="email-input"
                        type="text"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setErrorMsg(null);
                        }}
                        placeholder="seu@email.com"
                        autoComplete="email"
                        required
                        className="w-full pl-10 pr-4 py-3 text-[14px] text-slate-800 placeholder:text-[#94a3b8] placeholder:font-normal bg-transparent border-0 rounded-xl focus:ring-0 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Input Group: Senha */}
                  <div className="flex flex-col space-y-1.5 pt-0.5" data-purpose="password-field-group">
                    <label
                      className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] px-0.5"
                      htmlFor="password-input"
                    >
                      SENHA
                    </label>
                    <div className="relative flex items-center rounded-xl border border-[#e2e8f0] bg-white transition duration-150 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15">
                      {/* Lock Icon */}
                      <span
                        aria-hidden="true"
                        className="absolute left-3.5 flex items-center pointer-events-none text-[#94a3b8]"
                      >
                        <svg
                          className="w-[18px] h-[18px]"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <rect height="11" rx="2" ry="2" width="18" x="3" y="11" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                      <input
                        id="password-input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setErrorMsg(null);
                        }}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                        className="w-full pl-10 pr-10 py-3 text-[14px] text-slate-800 placeholder:text-[#94a3b8] placeholder:font-normal bg-transparent border-0 rounded-xl focus:ring-0 focus:outline-none"
                      />
                      {/* Password Eye Toggle Button */}
                      <button
                        type="button"
                        aria-label="Alternar visualização da senha"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 flex items-center text-[#94a3b8] hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                        id="toggle-password-visibility"
                      >
                        {showPassword ? (
                          /* Crossed Eye Icon */
                          <svg
                            className="w-[18px] h-[18px]"
                            fill="none"
                            id="eye-icon-closed"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                            <line x1="2" x2="22" y1="2" y2="22" />
                          </svg>
                        ) : (
                          /* Default Eye Icon */
                          <svg
                            className="w-[18px] h-[18px]"
                            fill="none"
                            id="eye-icon-open"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Checkbox: Lembrar este dispositivo por 30 dias */}
                  <div className="pt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-[#164491] focus:ring-[#164491]/20 transition cursor-pointer accent-[#164491]"
                      />
                      <span className="text-[12.5px] text-[#64748b] hover:text-slate-700 transition-colors">
                        Lembrar este dispositivo por 30 dias
                      </span>
                    </label>
                  </div>

                  {/* Submit CTA Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      data-purpose="submit-login-button"
                      className="w-full py-3.5 px-4 rounded-xl bg-[#164491] hover:bg-[#12397a] active:bg-[#0e2b5c] text-white font-bold text-[13px] tracking-[0.08em] uppercase transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#164491] focus:ring-offset-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>VERIFICANDO...</span>
                        </>
                      ) : (
                        <span>ENTRAR</span>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 2: TOTP GOOGLE AUTHENTICATOR FORM */}
              {step === 'totp' && (
                <form
                  className="w-full mt-6 flex flex-col space-y-4"
                  data-purpose="totp-form"
                  onSubmit={handleTotpSubmit}
                >
                  <div className="flex flex-col space-y-1.5">
                    <div className="flex items-center justify-between px-0.5">
                      <label
                        className="text-[11px] font-bold uppercase tracking-wider text-[#64748b]"
                        htmlFor="totp-input"
                      >
                        CÓDIGO DE 6 DÍGITOS
                      </label>
                      <span className="text-[10.5px] font-semibold text-[#164491] bg-blue-50 px-2 py-0.5 rounded-full">
                        Google Authenticator
                      </span>
                    </div>

                    <div className="relative flex items-center rounded-xl border border-[#e2e8f0] bg-white transition duration-150 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15">
                      {/* Shield/Key Icon */}
                      <span
                        aria-hidden="true"
                        className="absolute left-3.5 flex items-center pointer-events-none text-[#94a3b8]"
                      >
                        <svg
                          className="w-[18px] h-[18px]"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                          <line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                      </span>
                      <input
                        ref={totpInputRef}
                        id="totp-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={totpCode}
                        onChange={handleTotpChange}
                        placeholder="000000"
                        autoComplete="one-time-code"
                        required
                        className="w-full pl-10 pr-4 py-3.5 text-center text-[20px] font-mono font-bold tracking-[0.35em] placeholder:tracking-normal text-slate-900 placeholder:text-[#94a3b8] bg-transparent border-0 rounded-xl focus:ring-0 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Submit CTA Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading || totpCode.length !== 6}
                      className="w-full py-3.5 px-4 rounded-xl bg-[#164491] hover:bg-[#12397a] active:bg-[#0e2b5c] text-white font-bold text-[13px] tracking-[0.08em] uppercase transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#164491] focus:ring-offset-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>VALIDANDO ACESSO...</span>
                        </>
                      ) : (
                        <span>CONFIRMAR E ENTRAR</span>
                      )}
                    </button>
                  </div>

                  {/* Voltar às credenciais */}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('credentials');
                        setErrorMsg(null);
                      }}
                      className="text-[12.5px] font-medium text-[#64748b] hover:text-[#164491] transition-colors cursor-pointer"
                    >
                      ← Alterar e-mail ou senha
                    </button>
                  </div>
                </form>
              )}
            </div>
            {/* Card Inner Body Container End */}
          </div>
          {/* END: LoginCard */}
        </main>
        {/* END: MainLoginWrapper */}
      </div>

      {/* Mandatory Credit Footer */}
      <footer className="w-full py-4 text-center text-xs font-sans text-slate-500 space-y-0.5 select-text">
        <div className="font-semibold text-slate-600">Criado por Meifode</div>
        <div className="text-[11px] text-slate-400">discord: nord3093</div>
      </footer>
    </div>
  );
};
