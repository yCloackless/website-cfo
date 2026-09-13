import React from 'react';
import { X, Scale, BookOpen, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface TermsOfUseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TermsOfUseModal: React.FC<TermsOfUseModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 id="terms-modal-title" className="text-lg font-bold text-white tracking-tight">
                Termos de Uso da Plataforma
              </h2>
              <p className="text-xs text-slate-400">Condições de acesso ao ambiente pedagógico do CFO CBMERJ • Versão 1.0</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm leading-relaxed text-slate-300">
          <div className="rounded-xl border border-amber-900/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Aviso de Independência Institucional:</strong> A plataforma <em>Rumo ao CFO CBMERJ</em> é um ambiente pedagógico preparatório independente desenvolvido para apoio a candidatos. Não possuímos vínculo administrativo, societário ou oficial com o Corpo de Bombeiros Militar do Estado do Rio de Janeiro (CBMERJ) ou com a banca examinadora do concurso.
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-amber-400">1</span>
              Objeto e Finalidade Educacional
            </h3>
            <p>
              Estes Termos de Uso regulam o acesso e a utilização dos serviços oferecidos na plataforma, que compreendem cronograma semanal horizontal de estudos, Bizuário tático de alta precisão com fórmulas KaTeX, caderno de erros, banco de questões comentadas, simulados cronometrados e análises pedagógicas com auxílio de inteligência artificial.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-amber-400">2</span>
              Cadastro, Acesso e Política de Sessão Única Exclusiva
            </h3>
            <p>
              O acesso ao sistema é pessoal, intransferível e individual. Para resguardar a integridade pedagógica e a segurança das credenciais:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-400 pl-2">
              <li><strong>Sessão Exclusiva:</strong> Cada aluno tem direito a utilizar o sistema em 1 (um) dispositivo por vez. O início de uma nova sessão desconecta automaticamente a sessão anterior.</li>
              <li><strong>Proibição de Compartilhamento:</strong> É expressamente proibido ceder, alugar, sublicenciar ou compartilhar senhas e credenciais com terceiros.</li>
              <li><strong>Proteção Contra Abusos:</strong> Tentativas anômalas de múltiplos acessos simultâneos acarretam bloqueios automáticos temporários de segurança e investigação pelo administrador.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-amber-400">3</span>
              Propriedade Intelectual e Uso Adequado
            </h3>
            <p>
              Todos os elementos da plataforma, incluindo código-fonte, arquitetura, design visual, organização do Bizuário, sínteses teóricas e resoluções comentadas de questões são protegidos pela legislação de direitos autorais e propriedade intelectual (Lei nº 9.610/1998 e Lei nº 9.609/1998).
            </p>
            <p className="text-xs text-slate-400">
              O aluno compromete-se a não realizar engenharia reversa, raspagem de dados (scraping), ataques de injeção ou distribuição não autorizada do material sob pena de rescisão imediata e responsabilização civil e criminal.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-amber-400">4</span>
              Disponibilidade, Manutenção e Atualizações
            </h3>
            <p>
              Empregamos esforços contínuos para manter a plataforma disponível 24 horas por dia, 7 dias por semana. No entanto, intervenções programadas para melhorias de segurança, atualizações pedagógicas ou manutenções de infraestrutura de nuvem podem ocorrer, sendo previamente sinalizadas no painel do aluno sempre que viável.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-amber-400">5</span>
              Política de Cancelamento e Reembolsos
            </h3>
            <p>
              Nos termos do Art. 49 do Código de Defesa do Consumidor (Lei nº 8.078/1990), o consumidor tem direito ao arrependimento no prazo de 7 (sete) dias corridos a contar da data de contratação, com reembolso integral do valor pago.
            </p>
            <p className="text-xs text-slate-400">
              As solicitações de reembolso devem ser submetidas pelo canal oficial e passam por validação administrativa prévia contra requisições duplicadas ou fraudes antes do processamento definitivo pelo gateway financeiro.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-amber-400">6</span>
              Legislação Aplicável e Foro
            </h3>
            <p>
              Estes Termos são regidos e interpretados de acordo com as leis da República Federativa do Brasil, em especial a Constituição Federal, o Código de Defesa do Consumidor, o Marco Civil da Internet e a Lei Geral de Proteção de Dados (LGPD).
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/80 px-6 py-4">
          <span className="text-xs text-slate-400">Versão dos Termos: 1.0 (Setembro de 2026)</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-600/20 hover:bg-amber-500 transition"
          >
            Entendi e Concordo
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsOfUseModal;
