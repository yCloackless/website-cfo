declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        params: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: (errorCode?: string) => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

import React, { useState, useRef, useEffect } from 'react';

interface SecurityGateProps {
  onAuthenticated: (token: string, expiresAt: number, is2faActive: boolean) => void;
  onBackToLanding?: () => void;
}

interface SecurityStatusData {
  // clientIp e isAdminIp removidos do backend por segurança (não expõe lógica interna de bypass)
  turnstileRequired: boolean;
  siteKey: string;
}

export const SecurityGate: React.FC<SecurityGateProps> = ({ onAuthenticated, onBackToLanding }) => {
  const [step, setStep] = useState<'credentials' | 'forgot' | 'reset'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [loginChallenge, setLoginChallenge] = useState('');
  const [secondFactor, setSecondFactor] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  // Estados de Recuperação de Senha
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Turnstile e Segurança Geográfica
  const [securityStatus, setSecurityStatus] = useState<SecurityStatusData | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isBanned, setIsBanned] = useState(false);
  const [banDetails, setBanDetails] = useState<{ message?: string; clientIp?: string; location?: string } | null>(null);

  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  // 1. Checa status de segurança (IP do Admin vs IP comum) e se o IP já está banido
  useEffect(() => {
    let isMounted = true;

    async function checkSecurity() {
      try {
        const res = await fetch('/api/auth/security-status');
        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          if (isMounted) {
            setIsBanned(true);
            setBanDetails({
              message: errData.message || 'IP permanentemente banido do sistema por violação de segurança.',
              clientIp: errData.clientIp,
            });
          }
          return;
        }

        const data: SecurityStatusData = await res.json();
        if (isMounted) {
          setSecurityStatus(data);

          // Se for IP de Admin (você), Turnstile NÃO roda!
          if (!data.turnstileRequired) {
            console.log('[SECURITY GATE] IP de Administrador reconhecido. Turnstile ignorado com sucesso.');
            return;
          }

          // Se for IP externo comum, carrega o Turnstile
          loadTurnstileScript(data.siteKey);
        }
      } catch (err) {
        console.warn('[SECURITY GATE] Não foi possível obter security-status:', err);
      }
    }

    checkSecurity();

    return () => {
      isMounted = false;
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {}
      }
    };
  }, []);

  // Carrega e renderiza o widget da Cloudflare se for necessário
  const loadTurnstileScript = (siteKey: string) => {
    if (window.turnstile) {
      renderTurnstile(siteKey);
      return;
    }

    const scriptId = 'cf-turnstile-script';
    if (!document.getElementById(scriptId)) {
      window.onloadTurnstileCallback = () => {
        renderTurnstile(siteKey);
      };

      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          renderTurnstile(siteKey);
        }
      }, 200);
    }
  };

  const renderTurnstile = (siteKey: string) => {
    if (!turnstileContainerRef.current || !window.turnstile) return;
    if (turnstileWidgetIdRef.current) {
      try {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      } catch {}
    }

    try {
      const widgetId = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: siteKey,
        theme: 'light',
        callback: (token: string) => {
          setTurnstileToken(token);
          setErrorMsg(null);
        },
        'expired-callback': () => {
          setTurnstileToken(null);
        },
        'error-callback': () => {
          setErrorMsg('Falha na validação do Cloudflare Turnstile. Recarregue a página.');
        },
      });
      turnstileWidgetIdRef.current = widgetId;
    } catch (e) {
      console.error('Erro ao renderizar Turnstile:', e);
    }
  };

  // Validação de E-mail e Senha (Login Direto Sem 2FA)
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = email.trim();
    const cleanPass = password.trim();
    if (!requiresTotp && !cleanUser) {
      setErrorMsg('Por favor, informe seu usuário ou e-mail de acesso.');
      return;
    }
    if (!requiresTotp && !cleanPass) {
      setErrorMsg('Por favor, informe sua senha.');
      return;
    }

    // Se o Turnstile for obrigatório para este IP e ainda não foi resolvido
    if (securityStatus?.turnstileRequired && !turnstileToken) {
      setErrorMsg('Por favor, complete a verificação de segurança Cloudflare Turnstile.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      if (requiresTotp && !secondFactor.trim()) {
        setErrorMsg(useRecoveryCode ? 'Informe seu codigo de recuperacao.' : 'Informe o codigo de 6 digitos do autenticador.');
        setLoading(false);
        return;
      }

      const res = await fetch(requiresTotp ? '/api/auth/verify-2fa' : '/api/auth/check-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanUser,
          password: cleanPass,
          turnstileToken,
          rememberMe,
          ...(requiresTotp ? { [useRecoveryCode ? 'recoveryCode' : 'token']: secondFactor.trim() } : {}),
          ...(requiresTotp ? { challenge: loginChallenge } : {}),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success && data.requireTotp) {
        setRequiresTotp(true);
        setLoginChallenge(data.challenge || '');
        setSecondFactor('');
        setSuccessMsg('Credenciais confirmadas. Digite o segundo fator para concluir.');
        setLoading(false);
        return;
      }

      // Checa se tomou ban imediato
      if (res.status === 403 || data.error === 'IP_BANNED_UNAUTHORIZED_GEO' || data.error === 'IP_BANNED') {
        setIsBanned(true);
        setBanDetails({
          message: data.message || 'ACESSO BLOQUEADO: Tentativa de login a partir de localização não autorizada. Seu IP foi banido.',
          clientIp: data.clientIp,
          location: data.geo ? `${data.geo.city || ''}, ${data.geo.region || ''} (${data.geo.country || ''})` : undefined,
        });
        setLoading(false);
        return;
      }

      if (!res.ok || !data.success || !data.token) {
        setErrorMsg(data.message || 'Usuário/e-mail ou senha incorretos.');
        if (turnstileWidgetIdRef.current && window.turnstile) {
          window.turnstile.reset(turnstileWidgetIdRef.current);
          setTurnstileToken(null);
        }
        setLoading(false);
        return;
      }

      // Login direto concluído
      // The raw bearer token is held only in the HttpOnly cookie set by the server.
      localStorage.setItem('cfo_terminal_session', 'cookie');
      localStorage.setItem('cfo_terminal_expires_at', String(data.expiresAt));
      localStorage.setItem('cfo_terminal_user', data.username || cleanUser);
      localStorage.setItem('cfo_terminal_role', data.role || 'admin');
      localStorage.setItem('cfo_can_access_notion', String(Boolean(data.canAccessNotion ?? (data.role === 'admin'))));
      onAuthenticated('cookie', data.expiresAt, Boolean(data.is2faActive));
      return;
    } catch (err) {
      setErrorMsg('Falha de conexão com o servidor. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Solicitar Código de Recuperação de Senha
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = resetEmail.trim();
    if (!clean) {
      setErrorMsg('Informe seu e-mail cadastrado.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      });
      const data = await res.json();
      setSuccessMsg(data.message || 'Se este e-mail estiver cadastrado, um código foi gerado.');
      setStep('reset');
    } catch {
      setErrorMsg('Falha ao processar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Confirmar Código e Definir Nova Senha
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = resetEmail.trim();
    const cleanCode = resetCode.trim();
    if (!cleanEmail || !cleanCode || !newPassword) {
      setErrorMsg('Preencha todos os campos obrigatórios.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          code: cleanCode,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Código de recuperação inválido ou expirado.');
        setLoading(false);
        return;
      }

      setSuccessMsg('Senha redefinida com sucesso! Faça login com sua nova senha.');
      setEmail(cleanEmail);
      setPassword('');
      setStep('credentials');
    } catch {
      setErrorMsg('Erro de conexão ao redefinir senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen min-h-[100dvh] w-full max-w-full flex flex-col items-center justify-between p-3 min-[380px]:p-4 sm:p-6 py-4 sm:py-8 text-slate-800 select-none font-sans overflow-y-auto overflow-x-hidden"
      style={{
        backgroundColor: '#f1f4f9',
        backgroundImage: `
          radial-gradient(circle at 10% 20%, rgba(219, 234, 254, 0.45) 0%, transparent 45%),
          radial-gradient(circle at 95% 45%, rgba(254, 215, 170, 0.28) 0%, transparent 40%),
          radial-gradient(circle at 50% 100%, rgba(226, 232, 240, 0.4) 0%, transparent 60%)
        `,
      }}
    >
      <div className="w-full flex-1 flex items-center justify-center my-auto">
        {/* BEGIN: MainLoginWrapper */}
        <main className="w-full flex items-center justify-center min-w-0" data-purpose="login-viewport-container">
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
            <div className="px-4 min-[380px]:px-6 sm:px-11 pt-5 sm:pt-8 pb-6 sm:pb-10 flex flex-col items-center relative w-full min-w-0">
              {onBackToLanding && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="absolute top-5 left-5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#164491] transition-colors cursor-pointer group"
                  title="Voltar à página inicial"
                >
                  <svg
                    className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Início</span>
                </button>
              )}

              {/* BANNED SCREEN: Se o IP foi banido por violação de segurança ou geolocalização do Admin */}
              {isBanned ? (
                <div className="w-full flex flex-col items-center text-center py-4 space-y-4 animate-fade-in" data-purpose="banned-lockout-screen">
                  {/* Warning Red Shield */}
                  <div className="w-20 h-20 rounded-full bg-red-100 border-2 border-red-500/30 flex items-center justify-center text-red-600 shadow-inner relative">
                    <span className="absolute inset-0 rounded-full bg-red-500/10 animate-ping" />
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>

                  <div>
                    <span className="text-[11px] font-mono font-bold tracking-[0.2em] text-red-600 uppercase bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                      DEFCON 1 • PERÍMETRO VIOLADO
                    </span>
                    <h2 className="text-[20px] font-black text-slate-900 tracking-tight mt-3">
                      ACESSO BLOQUEADO & IP BANIDO
                    </h2>
                    <p className="text-[13px] text-slate-600 mt-1 max-w-sm">
                      {banDetails?.message || 'Tentativa de acesso não autorizada a partir de localização fora do Rio de Janeiro/Brasil. Este IP foi bloqueado permanentemente.'}
                    </p>
                  </div>

                  <div className="w-full bg-slate-900 text-slate-200 p-4 rounded-xl text-left font-mono text-xs space-y-1.5 border border-slate-800 shadow-lg">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                      <span className="text-slate-400">REGISTRO DE AUDITORIA:</span>
                      <span className="text-red-400 font-bold">PERMANENT_BAN</span>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="text-slate-400">IP DE ORIGEM:</span>
                      <span className="text-amber-400 font-semibold">{banDetails?.clientIp || securityStatus?.clientIp || 'DETECTADO'}</span>
                    </div>
                    {banDetails?.location && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">LOCALIZAÇÃO:</span>
                        <span className="text-red-300">{banDetails.location}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">POLÍTICA ADMIN:</span>
                      <span className="text-emerald-400">Exclusivo RJ / Brasil</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 text-center pt-2">
                    Se você é o proprietário legítimo e trocou de rede, acesse através do IP autorizado ou libere o IP no servidor.
                  </div>
                </div>
              ) : (
                <>
                  {/* BEGIN: BrandHeader */}
                  <header className="flex flex-col items-center text-center w-full" data-purpose="brand-presentation">
                    {/* Blue Phoenix Emblem */}
                    <div
                      className="w-16 h-16 mb-2 flex items-center justify-center transition-transform hover:scale-105 duration-200"
                      data-purpose="brand-logo"
                    >
                      <img
                        src="/phoenix-logo-cropped.png"
                        alt="Logo Fênix RUMO ao CFO"
                        className="w-full h-full object-contain drop-shadow-[0_8px_20px_rgba(0,86,210,0.35)]"
                      />
                    </div>

                    {/* Brand Sub-Texts */}
                    <span className="text-[13px] font-bold tracking-[0.14em] text-[#164491] uppercase leading-tight font-display">
                      RUMO
                    </span>
                    <span className="text-[10.5px] font-semibold tracking-wider text-slate-400 mt-[-1px]">
                      ao CFO
                    </span>

                    {/* Main Welcome Title & Subtitle */}
                    {step === 'credentials' && (
                      <>
                        <h1 className="text-[23px] sm:text-[24px] font-bold text-[#0f172a] tracking-tight mt-6 mb-1.5 font-sans">
                          Bem-vindo de volta
                        </h1>
                        <p className="text-[13.5px] font-normal text-[#64748b] leading-relaxed">
                          Entre para continuar seus estudos.
                        </p>
                      </>
                    )}

                    {step === 'forgot' && (
                      <>
                        <h1 className="text-[22px] sm:text-[23px] font-bold text-[#0f172a] tracking-tight mt-6 mb-1.5 font-sans">
                          Recuperar Acesso
                        </h1>
                        <p className="text-[13px] font-normal text-[#64748b] leading-relaxed">
                          Informe seu e-mail cadastrado para receber o código de recuperação.
                        </p>
                      </>
                    )}
                    {step === 'reset' && (
                      <>
                        <h1 className="text-[22px] sm:text-[23px] font-bold text-[#0f172a] tracking-tight mt-6 mb-1.5 font-sans">
                          Redefinir Senha
                        </h1>
                        <p className="text-[13px] font-normal text-[#64748b] leading-relaxed">
                          Digite o código de 6 dígitos e escolha sua nova senha de acesso.
                        </p>
                      </>
                    )}
                  </header>
                  {/* END: BrandHeader */}

                  {/* Success Message Alert */}
                  {successMsg && (
                    <div className="w-full mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5 min-w-0 break-words">
                      <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="leading-relaxed font-medium min-w-0 break-words">{successMsg}</span>
                    </div>
                  )}

                  {/* Error Message Alert */}
                  {errorMsg && (
                    <div className="w-full mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 min-w-0 break-words">
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
                      <span className="leading-relaxed font-medium min-w-0 break-words">{errorMsg}</span>
                    </div>
                  )}

                  {/* STEP 1: CREDENTIALS FORM */}
                  {step === 'credentials' && (
                    <form
                      className="w-full mt-7 flex flex-col space-y-4"
                      data-purpose="credentials-form"
                      onSubmit={handleCredentialsSubmit}
                    >
                      {/* Admin IP Bypass Badge removido — não expor lógica interna de bypass para o frontend */}
                  {/* Input Group: Usuário ou E-mail */}
                  <div className="flex flex-col space-y-1.5" data-purpose="email-field-group">
                    <div className="flex justify-between items-center px-0.5">
                      <label
                        className="text-[11px] font-bold uppercase tracking-wider text-[#64748b]"
                        htmlFor="email-input"
                      >
                        USUÁRIO OU E-MAIL
                      </label>
                      <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                        Apenas usuário ou e-mail
                      </span>
                    </div>
                    <div className="relative flex items-center rounded-xl border border-[#e2e8f0] bg-white transition duration-150 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15">
                      {/* User Icon */}
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
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
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
                        placeholder="Digite seu usuário ou e-mail cadastrado"
                        autoComplete="username"
                        required
                        className="w-full pl-10 pr-4 py-2.5 sm:py-3 text-base sm:text-[14px] text-slate-800 placeholder:text-[#94a3b8] placeholder:font-normal bg-transparent border-0 rounded-xl focus:ring-0 focus:outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 px-1">
                      Acesso restrito: utilize exclusivamente seu usuário ou e-mail cadastrado.
                    </p>
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
                        className="w-full pl-10 pr-10 py-2.5 sm:py-3 text-base sm:text-[14px] text-slate-800 placeholder:text-[#94a3b8] placeholder:font-normal bg-transparent border-0 rounded-xl focus:ring-0 focus:outline-none"
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

                  {requiresTotp && (
                    <div className="flex flex-col space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#164491]" htmlFor="second-factor-input">
                        {useRecoveryCode ? 'CODIGO DE RECUPERACAO' : 'CODIGO DO AUTENTICADOR'}
                      </label>
                      <input
                        id="second-factor-input"
                        type="text"
                        inputMode={useRecoveryCode ? 'text' : 'numeric'}
                        autoComplete="one-time-code"
                        maxLength={useRecoveryCode ? 64 : 6}
                        value={secondFactor}
                        onChange={(event) => setSecondFactor(useRecoveryCode ? event.target.value : event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder={useRecoveryCode ? 'Codigo de uso unico' : '000000'}
                        className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-center font-mono text-lg tracking-widest text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => { setUseRecoveryCode((value) => !value); setSecondFactor(''); setErrorMsg(null); }}
                        className="text-left text-[11px] font-semibold text-[#164491] hover:underline"
                      >
                        {useRecoveryCode ? 'Usar o aplicativo autenticador' : 'Usar um codigo de recuperacao'}
                      </button>
                    </div>
                  )}

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

                  {/* Cloudflare Turnstile Container (apenas para IPs não-administradores) */}
                  {securityStatus?.turnstileRequired && !requiresTotp && (
                    <div className="pt-2 flex flex-col items-center justify-center overflow-hidden max-w-full">
                      <div className="transform scale-[0.82] min-[380px]:scale-100 origin-center max-w-full">
                        <div
                          ref={turnstileContainerRef}
                          id="turnstile-container"
                          className="flex justify-center min-h-[65px] w-full"
                        />
                      </div>
                      <span className="text-[10.5px] text-slate-400 mt-1 flex items-center gap-1.5 font-medium">
                        <svg className="w-3.5 h-3.5 text-[#f38020]" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.8 11.2c-.4-3.1-3.1-5.5-6.3-5.5-2.7 0-5.1 1.7-6 4.2C3.7 10.4 1.5 12.7 1.5 15.5c0 3.3 2.7 6 6 6h11.2c2.6 0 4.8-2.1 4.8-4.8 0-2.5-1.9-4.6-4.4-4.8l-.3-.7z" />
                        </svg>
                        Protegido por Cloudflare Turnstile
                      </span>
                    </div>
                  )}

                    {/* Submit CTA Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={loading || (!requiresTotp && securityStatus?.turnstileRequired && !turnstileToken) || (requiresTotp && !secondFactor.trim())}
                        data-purpose="submit-login-button"
                        className="w-full py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl bg-[#164491] hover:bg-[#12397a] active:bg-[#0e2b5c] text-white font-bold text-xs sm:text-[13px] tracking-[0.08em] uppercase transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#164491] focus:ring-offset-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        {loading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>VERIFICANDO...</span>
                          </>
                        ) : (
                          <span>{requiresTotp ? 'VALIDAR 2FA' : 'ENTRAR'}</span>
                        )}
                      </button>
                    </div>

                    {/* Esqueci minha senha Link */}
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (requiresTotp) {
                            setRequiresTotp(false);
                            setLoginChallenge('');
                            setSecondFactor('');
                            setSuccessMsg(null);
                            setErrorMsg(null);
                            return;
                          }
                          setResetEmail(email);
                          setErrorMsg(null);
                          setSuccessMsg(null);
                          setStep('forgot');
                        }}
                        className="text-[12.5px] font-medium text-[#164491] hover:text-[#0e2b5c] hover:underline transition-colors cursor-pointer"
                      >
                        {requiresTotp ? 'Voltar e trocar as credenciais' : 'Esqueceu sua senha?'}
                      </button>
                    </div>
                  </form>
                )}

                {/* STEP: ESQUECEU SUA SENHA (FORGOT PASSWORD) */}
                {step === 'forgot' && (
                  <form
                    className="w-full mt-6 flex flex-col space-y-4"
                    onSubmit={handleRequestReset}
                  >
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] px-0.5" htmlFor="reset-email-input">
                        E-MAIL CADASTRADO
                      </label>
                      <input
                        id="reset-email-input"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => {
                          setResetEmail(e.target.value);
                          setErrorMsg(null);
                        }}
                        placeholder="seu@email.com"
                        required
                        className="w-full px-4 py-2.5 sm:py-3 text-base sm:text-[14px] text-slate-800 border border-[#e2e8f0] rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !resetEmail.trim()}
                      className="w-full py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl bg-[#164491] hover:bg-[#12397a] text-white font-bold text-xs sm:text-[13px] tracking-wider uppercase transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>ENVIANDO...</span>
                        </>
                      ) : (
                        <span>ENVIAR CÓDIGO DE RECUPERAÇÃO</span>
                      )}
                    </button>

                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setStep('credentials');
                          setErrorMsg(null);
                          setSuccessMsg(null);
                        }}
                        className="text-[12.5px] font-medium text-[#64748b] hover:text-[#164491] transition-colors cursor-pointer"
                      >
                        ← Voltar ao login
                      </button>
                    </div>
                  </form>
                )}

                {/* STEP: REDEFINIR SENHA COM CÓDIGO (RESET PASSWORD) */}
                {step === 'reset' && (
                  <form
                    className="w-full mt-6 flex flex-col space-y-4"
                    onSubmit={handleConfirmReset}
                  >
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] px-0.5">
                        CÓDIGO DE RECUPERAÇÃO (6 DÍGITOS)
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        required
                        className="w-full px-2 min-[360px]:px-4 py-2.5 sm:py-3 text-center font-mono font-bold text-base sm:text-lg text-slate-900 border border-[#e2e8f0] rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 outline-none tracking-[0.12em] min-[360px]:tracking-[0.2em]"
                      />
                    </div>

                    <div className="flex flex-col space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] px-0.5">
                        NOVA SENHA (MÍNIMO 8 CARACTERES)
                      </label>
                      <div className="relative flex items-center rounded-xl border border-[#e2e8f0] bg-white">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="w-full px-4 py-2.5 sm:py-3 pr-10 text-base sm:text-[14px] text-slate-800 rounded-xl outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                        >
                          {showNewPassword ? 'Ocultar' : 'Mostrar'}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || resetCode.length !== 6 || newPassword.length < 8}
                      className="w-full py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl bg-[#164491] hover:bg-[#12397a] text-white font-bold text-xs sm:text-[13px] tracking-wider uppercase transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>SALVANDO...</span>
                        </>
                      ) : (
                        <span>DEFINIR NOVA SENHA</span>
                      )}
                    </button>

                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setStep('forgot');
                          setErrorMsg(null);
                        }}
                        className="text-[12.5px] font-medium text-[#64748b] hover:text-[#164491] transition-colors cursor-pointer"
                      >
                        ← Reenviar código
                      </button>
                    </div>
                  </form>
                )}


                </>
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
