import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  Clock,
  FileUp,
  GitCompareArrows,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { AppTheme } from '../../types';

interface BoardIntelligencePanelProps {
  theme: AppTheme;
  sessionToken: string | null;
  canWrite: boolean;
}

export const BoardIntelligencePanel: React.FC<BoardIntelligencePanelProps> = ({
  theme,
  sessionToken,
  canWrite,
}) => {
  const isDark = theme === 'dark';
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [overview, setOverview] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState('CEDERJ');
  const [importPayload, setImportPayload] = useState({
    title: 'CEDERJ 2026.1',
    examYear: new Date().getFullYear(),
    rawTextContent: 'Questão 1. Assinale a alternativa correta sobre porcentagem. A) 10% B) 20% C) 30% D) 40% E) 50%\nQuestão 2. Com base no texto, é correto afirmar que o planejamento melhora resultados. A) sim B) não C) nunca D) raramente E) impossível',
  });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  }), [sessionToken]);

  const loadProfiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/board-intelligence/profiles', { headers });
      const data = await res.json();
      if (data.success) {
        setProfiles(data.profiles || []);
        if (!selectedProfileId && data.profiles?.[0]?.id) setSelectedProfileId(data.profiles[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  }, [headers, selectedProfileId]);

  const loadOverview = useCallback(async () => {
    if (!selectedProfileId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/board-intelligence/profiles/${selectedProfileId}`, { headers });
      const data = await res.json();
      if (data.success) setOverview(data);
    } finally {
      setIsLoading(false);
    }
  }, [headers, selectedProfileId]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const createProfile = async () => {
    const res = await fetch('/api/admin/board-intelligence/profiles', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: newProfileName, institution: newProfileName, board: newProfileName, description: 'Perfil administrado e versionado da banca.' }),
    });
    const data = await res.json();
    setFeedback(data.success ? 'Perfil criado.' : data.message || 'Falha ao criar perfil.');
    if (data.success) {
      setSelectedProfileId(data.profile.id);
      await loadProfiles();
    }
  };

  const importExam = async () => {
    if (!selectedProfileId) return;
    const res = await fetch(`/api/admin/board-intelligence/profiles/${selectedProfileId}/import-exam`, {
      method: 'POST',
      headers,
      body: JSON.stringify(importPayload),
    });
    const data = await res.json();
    setFeedback(data.success ? `${data.questionsCount} questoes extraidas. Revisao obrigatoria.` : data.message || 'Falha ao importar prova.');
    await loadOverview();
  };

  const approveExam = async (examId: string) => {
    const res = await fetch(`/api/admin/board-intelligence/exams/${examId}/approve`, { method: 'POST', headers });
    const data = await res.json();
    setFeedback(data.success ? `Prova aprovada. Analises novas: ${data.analysesCreated}.` : data.message || 'Falha ao aprovar.');
    await loadOverview();
  };

  const generateVersion = async () => {
    if (!selectedProfileId) return;
    const res = await fetch(`/api/admin/board-intelligence/profiles/${selectedProfileId}/generate-version`, { method: 'POST', headers });
    const data = await res.json();
    setFeedback(data.success ? `Versao V${data.version.version} criada como DRAFT.` : data.message || 'Falha ao gerar versao.');
    await loadOverview();
  };

  const publishVersion = async (versionId: string) => {
    const res = await fetch(`/api/admin/board-intelligence/versions/${versionId}/publish`, { method: 'POST', headers });
    const data = await res.json();
    setFeedback(data.success ? `Versao V${data.version.version} publicada como ACTIVE.` : data.message || 'Falha ao publicar.');
    await loadOverview();
  };

  const activeProfile = overview?.profile;
  const stats = overview?.stats;

  return (
    <div className="space-y-4">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-cyan-400" />
            Inteligencia da Banca
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Laboratorio de provas com aprovacao, snapshots e versoes imutaveis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedProfileId}
            onChange={(event) => setSelectedProfileId(event.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white min-w-48"
          >
            <option value="">Selecione um perfil</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <button type="button" onClick={loadOverview} className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-200 bg-slate-900 hover:bg-slate-800">
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Atualizar
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">{feedback}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {[
          ['Provas analisadas', activeProfile?.examCount || 0, FileUp],
          ['Questoes aprovadas', activeProfile?.questionCount || 0, CheckCircle2],
          ['Periodo historico', activeProfile?.periodStart ? `${activeProfile.periodStart}-${activeProfile.periodEnd}` : 'sem dados', Clock],
          ['Confianca dos dados', stats ? `${Math.round((stats.sampleConfidence || 0) * 100)}%` : '0%', ShieldCheck],
          ['Versao ativa', activeProfile?.activeVersion ? `V${activeProfile.activeVersion}` : 'nenhuma', History],
        ].map(([label, value, Icon]: any) => (
          <div key={label} className="bg-[#0B1220] border border-slate-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
              <Icon className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-lg font-black text-white mt-2">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="bg-[#0B1220] border border-slate-800 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-bold text-white">Criar Perfil</h3>
          <input value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white" />
          <button disabled={!canWrite} onClick={createProfile} className="w-full px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-bold disabled:opacity-40">
            Criar perfil da banca
          </button>
        </section>

        <section className="xl:col-span-2 bg-[#0B1220] border border-slate-800 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Upload className="w-4 h-4 text-cyan-400" /> Adicionar Prova Antiga</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={importPayload.title} onChange={(e) => setImportPayload((p) => ({ ...p, title: e.target.value }))} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white" />
            <input type="number" value={importPayload.examYear} onChange={(e) => setImportPayload((p) => ({ ...p, examYear: Number(e.target.value) }))} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white" />
            <button disabled={!canWrite || !selectedProfileId} onClick={importExam} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-40">Importar e extrair</button>
          </div>
          <textarea rows={4} value={importPayload.rawTextContent} onChange={(e) => setImportPayload((p) => ({ ...p, rawTextContent: e.target.value }))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white" />
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-[#0B1220] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white">Revisao de Provas</h3>
            <button disabled={!canWrite || !stats?.examCount} onClick={generateVersion} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">
              Gerar nova versao
            </button>
          </div>
          <div className="space-y-2">
            {(overview?.exams || []).length === 0 ? <p className="text-xs text-slate-500 py-4">Nenhuma prova importada.</p> : overview.exams.map((exam: any) => (
              <div key={exam.id} className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-white">{exam.name}</p>
                  <p className="text-[11px] text-slate-400">{exam.examYear} - {exam.status}</p>
                </div>
                {exam.status !== 'APPROVED' && (
                  <button disabled={!canWrite} onClick={() => approveExam(exam.id)} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold disabled:opacity-40">
                    Aprovar para aprendizado
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#0B1220] border border-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><GitCompareArrows className="w-4 h-4 text-cyan-400" /> Versoes</h3>
          <div className="space-y-2">
            {(overview?.versions || []).length === 0 ? <p className="text-xs text-slate-500 py-4">Nenhuma versao gerada.</p> : overview.versions.map((version: any) => (
              <div key={version.id} className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-white">V{version.version} - {version.status}</p>
                  <p className="text-[11px] text-slate-400">{version.styleSummary}</p>
                </div>
                {version.status === 'DRAFT' && (
                  <button disabled={!canWrite} onClick={() => publishVersion(version.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-40">Publicar</button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-[#0B1220] border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-cyan-400" /> DNA da Banca</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          {Object.entries(stats?.dna || {}).map(([key, value]) => (
            <div key={key} className="rounded-lg bg-slate-900 border border-slate-800 p-3">
              <p className="text-[10px] text-slate-500 uppercase">{key}</p>
              <p className="text-lg text-white font-black">{String(value)}/100</p>
            </div>
          ))}
        </div>
        {isLoading && <p className="text-xs text-slate-500 mt-3">Carregando inteligencia...</p>}
        <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-2">
          <RotateCcw className="w-3.5 h-3.5" />
          Provas em REVIEW_REQUIRED, REJECTED ou nao aprovadas nunca entram no perfil ativo nem no retrieval.
        </p>
      </section>
    </div>
  );
};
