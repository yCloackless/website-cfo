import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { AppTheme } from '../../types';
import {
  BoardProfile,
  BoardOverview,
  FeedbackMessage,
} from './board-intelligence/types';
import { BoardHeader } from './board-intelligence/BoardHeader';
import { BoardMetricsBar } from './board-intelligence/BoardMetricsBar';
import { BoardImportExamCard } from './board-intelligence/BoardImportExamCard';
import { BoardExamReviewTable } from './board-intelligence/BoardExamReviewTable';
import { BoardVersionsHistory } from './board-intelligence/BoardVersionsHistory';
import { BoardDnaAnalytics } from './board-intelligence/BoardDnaAnalytics';
import { BoardProfileModal } from './board-intelligence/BoardProfileModal';

interface BoardIntelligencePanelProps {
  theme: AppTheme;
  sessionToken: string | null;
  canWrite: boolean;
}

export const BoardIntelligencePanel: React.FC<BoardIntelligencePanelProps> = ({
  sessionToken,
  canWrite,
}) => {
  const [profiles, setProfiles] = useState<BoardProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [overview, setOverview] = useState<BoardOverview | null>(null);

  // Estados de feedback & loading granular
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [approvingExamId, setApprovingExamId] = useState<string | null>(null);
  const [isGeneratingVersion, setIsGeneratingVersion] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Payload do formulário de importação
  const [importPayload, setImportPayload] = useState({
    title: 'CEDERJ 2026.1',
    examYear: new Date().getFullYear(),
    rawTextContent:
      'Questão 1. Assinale a alternativa correta sobre porcentagem sucessiva. A) 10% B) 20% C) 30% D) 40% E) 50%\nQuestão 2. Com base no texto, é correto afirmar que o planejamento melhora resultados. A) sim B) não C) nunca D) raramente E) impossível',
  });

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    }),
    [sessionToken]
  );

  const loadProfiles = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/board-intelligence/profiles', { headers });
      const data = await res.json();
      if (data.success) {
        const loadedProfiles: BoardProfile[] = data.profiles || [];
        setProfiles(loadedProfiles);
        if (!selectedProfileId && loadedProfiles[0]?.id) {
          setSelectedProfileId(loadedProfiles[0].id);
        }
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao carregar perfis de banca.' });
    } finally {
      setIsRefreshing(false);
    }
  }, [headers, selectedProfileId]);

  const loadOverview = useCallback(async () => {
    if (!selectedProfileId) {
      setOverview(null);
      return;
    }
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/admin/board-intelligence/profiles/${selectedProfileId}`, { headers });
      const data = await res.json();
      if (data.success) {
        setOverview(data);
      } else {
        setOverview(null);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao carregar inteligência do perfil selecionado.' });
    } finally {
      setIsRefreshing(false);
    }
  }, [headers, selectedProfileId]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleCreateProfile = async (name: string) => {
    setIsCreatingProfile(true);
    try {
      const res = await fetch('/api/admin/board-intelligence/profiles', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name,
          institution: name,
          board: name,
          description: 'Perfil administrado e versionado da banca.',
        }),
      });
      const data = await res.json();
      if (data.success && data.profile) {
        setFeedback({ type: 'success', message: `Perfil "${name}" criado com sucesso!` });
        setSelectedProfileId(data.profile.id);
        await loadProfiles();
      } else {
        throw new Error(data.message || 'Falha ao criar perfil.');
      }
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const handleImportExam = async () => {
    if (!selectedProfileId || !canWrite) return;
    setIsImporting(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/admin/board-intelligence/profiles/${selectedProfileId}/import-exam`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(importPayload),
        }
      );
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: `${data.questionsCount} questões extraídas com sucesso. Homologação obrigatória.`,
        });
        await loadOverview();
      } else {
        setFeedback({
          type: 'error',
          message: data.message || 'Falha ao importar caderno de questões.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Erro de comunicação ao importar prova.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleApproveExam = async (examId: string) => {
    if (!canWrite) return;
    setApprovingExamId(examId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/board-intelligence/exams/${examId}/approve`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: `Prova homologada. ${data.analysesCreated || 0} novas análises integradas ao perfil estatístico.`,
        });
        await loadOverview();
      } else {
        setFeedback({
          type: 'error',
          message: data.message || 'Falha ao homologar prova.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Erro de comunicação ao homologar prova.',
      });
    } finally {
      setApprovingExamId(null);
    }
  };

  const handleGenerateVersion = async () => {
    if (!selectedProfileId || !canWrite) return;
    setIsGeneratingVersion(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/admin/board-intelligence/profiles/${selectedProfileId}/generate-version`,
        {
          method: 'POST',
          headers,
        }
      );
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: `Snapshot imutável V${data.version.version} gerado como Rascunho (DRAFT).`,
        });
        await loadOverview();
      } else {
        setFeedback({
          type: 'error',
          message: data.message || 'Falha ao gerar nova versão.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Erro de comunicação ao gerar versão.',
      });
    } finally {
      setIsGeneratingVersion(false);
    }
  };

  const handlePublishVersion = async (versionId: string) => {
    if (!canWrite) return;
    setPublishingVersionId(versionId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/board-intelligence/versions/${versionId}/publish`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: `Versão V${data.version.version} publicada com sucesso como Ativa!`,
        });
        await loadOverview();
      } else {
        setFeedback({
          type: 'error',
          message: data.message || 'Falha ao publicar versão.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Erro de comunicação ao publicar versão.',
      });
    } finally {
      setPublishingVersionId(null);
    }
  };

  const activeProfile = overview?.profile || profiles.find((p) => p.id === selectedProfileId);
  const stats = overview?.stats;
  const exams = overview?.exams || [];
  const versions = overview?.versions || [];

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. CABEÇALHO TÁTICO */}
      <BoardHeader
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onSelectProfile={(id) => setSelectedProfileId(id)}
        onRefresh={loadOverview}
        onOpenCreateProfile={() => setIsProfileModalOpen(true)}
        isRefreshing={isRefreshing}
      />

      {/* 2. ALERTA DE FEEDBACK DA AÇÃO */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-medium transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-md hover:bg-slate-800/60 text-slate-400 hover:text-white transition-colors"
            title="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. BARRA COMPACTA DE MÉTRICAS */}
      <BoardMetricsBar profile={activeProfile} stats={stats} />

      {/* 4. ÁREA NOBRE: IMPORTAR PROVA HISTÓRICA */}
      <BoardImportExamCard
        title={importPayload.title}
        examYear={importPayload.examYear}
        rawTextContent={importPayload.rawTextContent}
        onChangeTitle={(title) => setImportPayload((p) => ({ ...p, title }))}
        onChangeYear={(examYear) => setImportPayload((p) => ({ ...p, examYear }))}
        onChangeContent={(rawTextContent) => setImportPayload((p) => ({ ...p, rawTextContent }))}
        onSubmit={handleImportExam}
        isImporting={isImporting}
        canWrite={canWrite}
        selectedProfileId={selectedProfileId}
        selectedProfileName={activeProfile?.name}
      />

      {/* 5. HOMOLOGAÇÃO DE PROVAS & HISTÓRICO DE VERSÕES */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <BoardExamReviewTable
          exams={exams}
          onApproveExam={handleApproveExam}
          approvingExamId={approvingExamId}
          canWrite={canWrite}
        />

        <BoardVersionsHistory
          versions={versions}
          stats={stats}
          onGenerateVersion={handleGenerateVersion}
          onPublishVersion={handlePublishVersion}
          isGeneratingVersion={isGeneratingVersion}
          publishingVersionId={publishingVersionId}
          canWrite={canWrite}
        />
      </div>

      {/* 6. DNA DA BANCA & ANÁLISE COGNITIVA */}
      <BoardDnaAnalytics stats={stats} isLoading={isRefreshing} />

      {/* 7. MODAL DE CRIAÇÃO DE PERFIL */}
      <BoardProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onCreateProfile={handleCreateProfile}
        isCreating={isCreatingProfile}
        canWrite={canWrite}
      />
    </div>
  );
};
