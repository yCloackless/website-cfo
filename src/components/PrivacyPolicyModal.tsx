import React from 'react';
import { X, Shield, Lock, FileText, CheckCircle2, AlertCircle, Database, Eye } from 'lucide-react';
import { AppAppearance, AppTheme } from '../types';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: AppTheme;
  appearance?: AppAppearance;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  isOpen,
  onClose,
  theme = 'dark',
  appearance = 'default',
}) => {
  if (!isOpen) return null;
  const isDark = theme === 'dark';
  const isNotion = appearance === 'notion';

  const modalShell = isNotion
    ? isDark
      ? 'border-white/[0.08] bg-[#202020] text-[#e6e6e4]'
      : 'border-[#e6e6e3] bg-white text-[#37352f]'
    : 'border-slate-700/60 bg-slate-900 text-slate-100';
  const headerFooter = isNotion
    ? isDark
      ? 'border-white/[0.08] bg-[#191919]'
      : 'border-[#e6e6e3] bg-[#fbfbfa]'
    : 'border-slate-800 bg-slate-950/60';
  const headingText = isNotion ? (isDark ? 'text-[#e6e6e4]' : 'text-[#37352f]') : 'text-white';
  const bodyText = isNotion ? (isDark ? 'text-[#e6e6e4]/90' : 'text-[#37352f]') : 'text-slate-300';
  const mutedText = isNotion ? (isDark ? 'text-[#b4b4b0]' : 'text-[#5c5b57]') : 'text-slate-400';
  const cardSurface = isNotion
    ? isDark
      ? 'border-white/[0.08] bg-[#191919]'
      : 'border-[#e6e6e3] bg-[#fbfbfa]'
    : 'border-slate-800 bg-slate-950/40';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className={`relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${modalShell}`}>
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-6 py-4 ${headerFooter}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isNotion ? (isDark ? 'bg-[#262626] text-[#e6e6e4] border-white/[0.08]' : 'bg-[#f1f1ef] text-[#37352f] border-[#e6e6e3]') : 'bg-blue-600/20 text-blue-400 border-blue-500/30'}`}>
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 id="privacy-modal-title" className={`text-lg font-bold tracking-tight ${headingText}`}>
                Política de Privacidade & Proteção de Dados
              </h2>
              <p className={`text-xs ${mutedText}`}>Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018) • Versão 1.0</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg p-2 transition cursor-pointer ${isNotion ? (isDark ? 'text-[#b4b4b0] hover:bg-[#262626] hover:text-white' : 'text-[#5c5b57] hover:bg-[#ececeb] hover:text-[#37352f]') : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className={`flex-1 overflow-y-auto p-6 space-y-6 text-sm leading-relaxed ${bodyText}`}>
          <div className={`rounded-xl border p-4 text-xs flex items-start gap-3 ${isNotion ? cardSurface : 'border-blue-900/40 bg-blue-950/30 text-blue-200'}`}>
            <CheckCircle2 className={`h-5 w-5 shrink-0 mt-0.5 ${isNotion ? headingText : 'text-blue-400'}`} />
            <div>
              <strong>Compromisso de Transparência e Defesa em Profundidade:</strong> Esta política descreve de forma clara e objetiva o tratamento de dados realizado pela plataforma <strong>Rumo ao CFO CBMERJ</strong>. Nós respeitamos rigorosamente a sua privacidade e aplicamos o princípio da minimização da coleta em todos os recursos.
            </div>
          </div>

          {/* Seção 1 */}
          <section className="space-y-2">
            <h3 className={`text-base font-semibold flex items-center gap-2 ${headingText}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isNotion ? (isDark ? 'bg-[#262626] text-[#e6e6e4]' : 'bg-[#f1f1ef] text-[#37352f]') : 'bg-slate-800 text-blue-400'}`}>1</span>
              Controlador e Encarregado de Dados (DPO)
            </h3>
            <p>
              O controlador dos dados pessoais no âmbito desta aplicação é a equipe de gestão da plataforma educacional <strong>Rumo ao CFO CBMERJ</strong>.
            </p>
            <p className={`text-xs ${mutedText}`}>
              Para esclarecimentos, dúvidas ou requisições relativas aos seus dados pessoais, você pode acionar nosso canal do Encarregado pelo e-mail: <span className={`font-mono ${isNotion ? headingText : 'text-blue-400'}`}>privacidade@rumoaocfo.com.br</span> ou diretamente na aba <em>Privacidade & LGPD</em> do painel Minha Conta.
            </p>
          </section>

          {/* Seção 2 */}
          <section className="space-y-2">
            <h3 className={`text-base font-semibold flex items-center gap-2 ${headingText}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isNotion ? (isDark ? 'bg-[#262626] text-[#e6e6e4]' : 'bg-[#f1f1ef] text-[#37352f]') : 'bg-slate-800 text-blue-400'}`}>2</span>
              Quais Dados Coletamos e Por Quê
            </h3>
            <div className="grid gap-3 pt-1">
              <div className={`rounded-lg border p-3 ${cardSurface}`}>
                <div className={`font-semibold text-xs flex items-center gap-2 ${headingText}`}>
                  <Lock className="h-4 w-4 text-amber-500" />
                  Credenciais e Identificação de Conta
                </div>
                <p className={`text-xs mt-1 ${mutedText}`}>
                  <strong>Dados:</strong> Nome de usuário, e-mail e hash criptográfico de senha (bcrypt).<br />
                  <strong>Finalidade:</strong> Autenticação segura, controle de acesso e recuperação de conta.<br />
                  <strong>Base Legal:</strong> Execução de Contrato (Art. 7º, V da LGPD).
                </p>
              </div>

              <div className={`rounded-lg border p-3 ${cardSurface}`}>
                <div className={`font-semibold text-xs flex items-center gap-2 ${headingText}`}>
                  <Eye className="h-4 w-4 text-blue-500" />
                  Perfil do Aluno e Preferências Pedagógicas
                </div>
                <p className={`text-xs mt-1 ${mutedText}`}>
                  <strong>Dados:</strong> Nome completo, telefone (opcional), concurso-alvo, minibiografia e foto de avatar.<br />
                  <strong>Finalidade:</strong> Personalização do cronograma e suporte individualizado ao candidato.<br />
                  <strong>Base Legal:</strong> Execução de Contrato (Art. 7º, V da LGPD).
                </p>
              </div>

              <div className={`rounded-lg border p-3 ${cardSurface}`}>
                <div className={`font-semibold text-xs flex items-center gap-2 ${headingText}`}>
                  <Database className="h-4 w-4 text-emerald-500" />
                  Métricas de Estudo e Desempenho
                </div>
                <p className={`text-xs mt-1 ${mutedText}`}>
                  <strong>Dados:</strong> Horas estudadas, matérias cronometradas, resoluções de questões e simulados.<br />
                  <strong>Finalidade:</strong> Cálculo de índices de retenção e gráficos de rendimento pedagógico.<br />
                  <strong>Base Legal:</strong> Execução de Contrato (Art. 7º, V da LGPD).
                </p>
              </div>

              <div className={`rounded-lg border p-3 ${cardSurface}`}>
                <div className={`font-semibold text-xs flex items-center gap-2 ${headingText}`}>
                  <Shield className="h-4 w-4 text-red-500" />
                  Segurança, Registros de Conexão e Sessão Exclusiva
                </div>
                <p className={`text-xs mt-1 ${mutedText}`}>
                  <strong>Dados:</strong> Endereço IP mascarado, tipo de navegador (user-agent), identificadores de sessão criptografada e logs de auditoria.<br />
                  <strong>Finalidade:</strong> Prevenção de ataques de força bruta, garantia de sessão exclusiva por dispositivo e cumprimento legal do Art. 15 do Marco Civil da Internet.<br />
                  <strong>Base Legal:</strong> Cumprimento de Obrigação Legal (Art. 7º, II) e Legítimo Interesse (Art. 7º, IX da LGPD).
                </p>
              </div>
            </div>
          </section>

          {/* Seção 3 */}
          <section className="space-y-2">
            <h3 className={`text-base font-semibold flex items-center gap-2 ${headingText}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isNotion ? (isDark ? 'bg-[#262626] text-[#e6e6e4]' : 'bg-[#f1f1ef] text-[#37352f]') : 'bg-slate-800 text-blue-400'}`}>3</span>
              Dados Não Coletados (Minimização de Dados)
            </h3>
            <p>
              Em obediência ao princípio da necessidade (Art. 6º, III da LGPD), nós <strong>NUNCA</strong> solicitamos ou armazenamos:
            </p>
            <ul className={`list-disc list-inside space-y-1 text-xs pl-2 ${mutedText}`}>
              <li>Dados de cartão de crédito ou códigos de segurança (processados diretamente pelo gateway certificado);</li>
              <li>Dados biométricos ou dados sensíveis de saúde, filiação ou crença (Art. 5º, II da LGPD);</li>
              <li>Geolocalização exata em tempo real via GPS;</li>
              <li>Histórico de navegação em websites externos ou rastreadores de publicidade de terceiros.</li>
            </ul>
          </section>

          {/* Seção 4 */}
          <section className="space-y-2">
            <h3 className={`text-base font-semibold flex items-center gap-2 ${headingText}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isNotion ? (isDark ? 'bg-[#262626] text-[#e6e6e4]' : 'bg-[#f1f1ef] text-[#37352f]') : 'bg-slate-800 text-blue-400'}`}>4</span>
              Compartilhamento com Prestadores e Provedores Essenciais
            </h3>
            <p>
              Seus dados pessoais somente são acessados por serviços estritamente indispensáveis ao funcionamento da infraestrutura:
            </p>
            <ul className={`space-y-1.5 text-xs pl-2 ${mutedText}`}>
              <li>• <strong>Render Inc.:</strong> Hospedagem da aplicação e do banco de dados relacional com isolamento lógico.</li>
              <li>• <strong>Cloudflare:</strong> Defesa perimetral contra negação de serviço (DDoS) e desafio anti-robô (Turnstile).</li>
              <li>• <strong>Resend:</strong> Envio de e-mails transacionais (como recuperação de senha e alertas de segurança).</li>
              <li>• <strong>Google Gemini API:</strong> Quando você clica voluntariamente em <em>Análise Pedagógica por IA</em>, enviamos apenas o resumo de disciplinas e minutos estudados para gerar o feedback educacional. Nenhum dado de identidade, credencial ou senha é transmitido ao modelo de IA.</li>
            </ul>
          </section>

          {/* Seção 5 */}
          <section className="space-y-2">
            <h3 className={`text-base font-semibold flex items-center gap-2 ${headingText}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isNotion ? (isDark ? 'bg-[#262626] text-[#e6e6e4]' : 'bg-[#f1f1ef] text-[#37352f]') : 'bg-slate-800 text-blue-400'}`}>5</span>
              Seus Direitos como Titular (Art. 18 da LGPD)
            </h3>
            <p>
              A LGPD assegura a você os seguintes direitos fundamentais, exercíveis a qualquer momento:
            </p>
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs ${bodyText}`}>
              <div className={`p-2.5 rounded-lg border ${cardSurface}`}>
                <strong>I. Confirmação e Acesso:</strong> Saber se tratamos seus dados e solicitar cópia estruturada.
              </div>
              <div className={`p-2.5 rounded-lg border ${cardSurface}`}>
                <strong>II. Retificação:</strong> Corrigir dados incompletos, inexatos ou desatualizados no painel Minha Conta.
              </div>
              <div className={`p-2.5 rounded-lg border ${cardSurface}`}>
                <strong>III. Anonimização ou Bloqueio:</strong> Solicitar a desvinculação de dados pessoais desnecessários.
              </div>
              <div className={`p-2.5 rounded-lg border ${cardSurface}`}>
                <strong>IV. Portabilidade (Exportação):</strong> Baixar seus dados em formato JSON portátil através do sistema.
              </div>
              <div className={`p-2.5 rounded-lg border ${cardSurface}`}>
                <strong>V. Eliminação:</strong> Solicitar a exclusão definitiva dos dados tratados, ressalvadas as obrigações legais de guarda.
              </div>
              <div className={`p-2.5 rounded-lg border ${cardSurface}`}>
                <strong>VI. Revogação de Consentimento:</strong> Retirar consentimentos facultativos a qualquer momento.
              </div>
            </div>
          </section>

          {/* Seção 6 */}
          <section className="space-y-2">
            <h3 className={`text-base font-semibold flex items-center gap-2 ${headingText}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isNotion ? (isDark ? 'bg-[#262626] text-[#e6e6e4]' : 'bg-[#f1f1ef] text-[#37352f]') : 'bg-slate-800 text-blue-400'}`}>6</span>
              Prazos de Retenção e Descarte Seguro
            </h3>
            <p>
              Os dados de perfil e progresso de estudo permanecem ativos durante a vigência de sua preparação acadêmica. Em caso de inatividade prolongada ou pedido de exclusão:
            </p>
            <ul className={`list-disc list-inside space-y-1 text-xs pl-2 ${mutedText}`}>
              <li>Registros de conexão de segurança são mantidos pelo prazo de 6 meses em cumprimento estrito ao Art. 15 da Lei nº 12.965/2014 (Marco Civil da Internet);</li>
              <li>Registros fiscais de aquisição de acesso são mantidos pelo prazo prescricional de 5 anos (Código Civil e Código Tributário Nacional);</li>
              <li>Após o processamento de exclusão, as informações de identidade são irreversivelmente anonimizadas, impossibilitando qualquer identificação retroativa.</li>
            </ul>
          </section>

          {/* Seção 7 */}
          <section className="space-y-2">
            <h3 className={`text-base font-semibold flex items-center gap-2 ${headingText}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isNotion ? (isDark ? 'bg-[#262626] text-[#e6e6e4]' : 'bg-[#f1f1ef] text-[#37352f]') : 'bg-slate-800 text-blue-400'}`}>7</span>
              Medidas Técnicas de Segurança
            </h3>
            <p>
              Empregamos padrões internacionais de segurança da informação (defesa em profundidade):
            </p>
            <p className={`text-xs ${mutedText}`}>
              Tráfego 100% criptografado com TLS/HTTPS, Content Security Policy (CSP) restritiva, cabeçalhos anti-clickjacking, senhas com algoritmo bcrypt de alto custo (fator 12), cookies HttpOnly com prefixo seguro <code>__Host-</code> inacessíveis via JavaScript, isolamento de sessão por aluno e auditoria de eventos críticos.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between border-t px-6 py-4 ${headerFooter}`}>
          <span className={`text-xs ${mutedText}`}>Última atualização: 13 de Setembro de 2026</span>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl px-5 py-2 text-xs font-semibold shadow-lg transition cursor-pointer ${isNotion ? (isDark ? 'bg-[#2f2f2f] hover:bg-[#3a3a3a] text-white border border-white/[0.12]' : 'bg-[#37352f] hover:bg-[#262521] text-white') : 'bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-500'}`}
          >
            Fechar e Continuar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyModal;
