import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Flame,
  Smartphone,
  Copy,
  Check,
  AlertTriangle,
  Lock,
} from 'lucide-react';

interface Setup2FAModalProps {
  isOpen: boolean;
  sessionToken: string | null;
  onActivated: () => void;
}

export const Setup2FAModal: React.FC<Setup2FAModalProps> = ({
  isOpen,
  sessionToken,
  onActivated,
}) => {
  const [setupData, setSetupData] = useState<{
    secret: string;
    qrCode: string;
    otpauthUrl: string;
  } | null>(null);

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !sessionToken) return;

    const fetchSetup = async () => {
      try {
        const res = await fetch('/api/auth/2fa-setup', {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setSetupData(data);
        }
      } catch (err) {
        console.warn('Falha ao carregar setup 2FA:', err);
      }
    };

    fetchSetup();
  }, [isOpen, sessionToken]);

  useEffect(() => {
    if (isOpen && setupData) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [isOpen, setupData]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
    setErrorMsg(null);
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setErrorMsg('Digite o código completo de 6 dígitos gerado no app.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/activate-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ token: code }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Código incorreto. Verifique o relógio do celular.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onActivated();
      }, 1800);
    } catch (err: any) {
      setErrorMsg('Falha na ativação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto select-none font-sans">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-red-900/60 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-red-950/80 my-8">
        {/* Tactical Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-red-700/60 bg-red-950/50 text-[10px] font-mono uppercase tracking-widest text-red-400 font-bold mb-2">
            <Flame className="w-3.5 h-3.5 text-red-500 animate-pulse" />
            PRIMEIRO ACESSO • ATIVAÇÃO OBRIGATÓRIA
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight uppercase">
            VINCULAR GOOGLE AUTHENTICATOR
          </h2>
          <p className="text-xs text-zinc-400 mt-1.5 max-w-md mx-auto leading-relaxed">
            Escaneie o QR Code abaixo no app <strong>Google Authenticator</strong> no seu celular para registrar a chave.
            Após a confirmação, este QR Code <strong>nunca mais será exibido</strong> para ninguém.
          </p>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3 animate-fadeIn">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-950/80 border border-emerald-500 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/60">
              <ShieldCheck className="w-9 h-9 animate-bounce" />
            </div>
            <h3 className="text-lg font-bold text-emerald-400 font-mono">
              BLINDAGEM 2FA ATIVADA COM SUCESSO!
            </h3>
            <p className="text-xs text-zinc-300 font-mono max-w-xs mx-auto">
              O QR Code foi destruído do sistema. Nos próximos acessos, utilize apenas o código de 6 dígitos gerado no seu celular.
            </p>
          </div>
        ) : (
          <>
            {/* QR Code & Manual Key */}
            {setupData?.qrCode ? (
              <div className="flex flex-col items-center justify-center mb-6">
                <div className="p-3 bg-black rounded-xl border border-red-700/60 shadow-xl shadow-red-950/50 mb-3.5">
                  <img
                    src={setupData.qrCode}
                    alt="QR Code 2FA"
                    className="w-48 h-48 sm:w-52 sm:h-52 rounded-lg"
                  />
                </div>

                <div className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg bg-black/60 border border-zinc-800 text-xs font-mono">
                  <div className="truncate">
                    <span className="text-zinc-500 mr-2 text-[10px] uppercase">Chave Manual:</span>
                    <span className="text-red-300 font-bold select-all">{setupData.secret}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-2.5 py-1 rounded bg-red-950 hover:bg-red-900 border border-red-800/60 text-red-300 flex items-center gap-1 shrink-0 text-[11px] transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-400" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs font-mono text-zinc-500 flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                <span>Carregando chave de segurança...</span>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-red-950/70 border border-red-600 text-red-300 text-xs flex items-start gap-2 animate-shake">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Verification Form */}
            <form onSubmit={handleConfirm} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                  Digite o Código de 6 Dígitos do App para Confirmar:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                    <Smartphone className="w-4 h-4 text-red-500" />
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={handleCodeChange}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-black border border-red-900/80 focus:border-red-500 focus:ring-2 focus:ring-red-500/40 text-white text-center font-mono text-xl tracking-[0.4em] placeholder:tracking-normal placeholder-zinc-700 font-bold transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-700 via-red-600 to-red-800 hover:from-red-600 hover:via-red-500 hover:to-red-700 text-white font-mono font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 border border-red-500/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-950/60"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>VALIDANDO COM O GOOGLE AUTHENTICATOR...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>CONFIRMAR E ATIVAR BLINDAGEM 2FA</span>
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
