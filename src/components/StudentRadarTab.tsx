import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  Radar,
  Search,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { AppTheme, Subject } from '../types';
import { apiFetch } from '../services/apiFetch';
import { AnswerOption, SubjectScoreEntry } from '../utils/answerSheet';
import { AnswerSheetInput } from './AnswerSheetInput';
import type { ExamDiagnosisResult, RadarExamItem } from '../services/examRadarService';

interface StudentRadarTabProps {
  theme?: AppTheme;
  subjects?: Subject[];
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const StudentRadarTab: React.FC<StudentRadarTabProps> = ({
  theme = 'dark',
  subjects = [],
  showToast,
}) => {
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const [exams, setExams] = useState<RadarExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [diagnosingId, setDiagnosingId] = useState<string | null>(null);

  // Modal state para registrar/editar acertos + cartão-resposta
  const [editingExam, setEditingExam] = useState<RadarExamItem | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(90);
  const [manualCorrectCount, setManualCorrectCount] = useState(0);
  const [studentAnswers, setStudentAnswers] = useState<AnswerOption[]>([]);
  const [officialKey, setOfficialKey] = useState<AnswerOption[]>([]);
  const [subjectScores, setSubjectScores] = useState<SubjectScoreEntry[]>([]);
  const [isSavingAttempt, setIsSavingAttempt] = useState(false);

  const fetchRadarExams = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/exams/attempts');
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.exams || []) as RadarExamItem[];
      setExams(list);
      if (list.length > 0 && !selectedExamId) {
        const firstWithAttempt = list.find((e) => e.latestAttempt) || list[0];
        setSelectedExamId(firstWithAttempt.examPaperId);
      }
    } catch {
      showToast?.('Erro ao carregar provas do Radar.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRadarExams();
  }, []);

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return exams;
    return exams.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.institution.toLowerCase().includes(q) ||
        String(item.examYear).includes(q)
    );
  }, [exams, search]);

  const selectedExam = useMemo(
    () => exams.find((e) => e.examPaperId === selectedExamId) || filteredExams[0] || null,
    [exams, filteredExams, selectedExamId]
  );

  const stats = useMemo(() => {
    const withAttempts = exams.filter((e) => e.latestAttempt);
    const avgPct =
      withAttempts.length > 0
        ? Math.round(
            withAttempts.reduce((sum, e) => sum + (e.latestAttempt?.accuracyPct || 0), 0) /
              withAttempts.length
          )
        : 0;
    const diagnosedCount = withAttempts.filter((e) => e.latestAttempt?.aiDiagnosis).length;
    return { total: exams.length, answered: withAttempts.length, avgPct, diagnosedCount };
  }, [exams]);

  const openEditorForExam = (exam: RadarExamItem) => {
    const attempt = exam.latestAttempt;
    const count = attempt?.totalQuestions || exam.totalQuestions || 90;
    setEditingExam(exam);
    setTotalQuestions(count);
    setManualCorrectCount(attempt?.correctCount || 0);
    setStudentAnswers(attempt?.studentAnswers || []);
    setOfficialKey(attempt?.officialKey || []);
    setSubjectScores(attempt?.subjectScores || []);
  };

  const handleSaveAttempt = async () => {
    if (!editingExam) return;
    try {
      setIsSavingAttempt(true);
      const res = await apiFetch(`/api/exams/${editingExam.examPaperId}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalQuestions,
          correctCount: manualCorrectCount,
          studentAnswers,
          officialKey,
          subjectScores,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast?.(err.message || 'Falha ao salvar acertos da prova.', 'error');
        return;
      }
      showToast?.('Acertos e cartão-resposta salvos no Radar!', 'success');
      setSelectedExamId(editingExam.examPaperId);
      setEditingExam(null);
      await fetchRadarExams();
    } catch {
      showToast?.('Erro de conexão ao salvar acertos.', 'error');
    } finally {
      setIsSavingAttempt(false);
    }
  };

  const handleRunAIDiagnosis = async (exam: RadarExamItem) => {
    if (!exam.latestAttempt) {
      openEditorForExam(exam);
      showToast?.('Informe primeiro quantas acertou ou preencha o cartão-resposta.', 'info');
      return;
    }
    try {
      setDiagnosingId(exam.examPaperId);
      setSelectedExamId(exam.examPaperId);
      const res = await apiFetch(`/api/exams/${exam.examPaperId}/ai-diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: exam.latestAttempt.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.diagnosis) {
        showToast?.(data.message || 'Não foi possível gerar o diagnóstico da prova.', 'error');
        return;
      }
      showToast?.(
        data.diagnosis.source === 'gemini'
          ? 'IA concluiu a leitura da prova e mapeou seus erros!'
          : 'Diagnóstico gerado com base nos seus acertos por matéria.',
        'success'
      );
      await fetchRadarExams();
    } catch {
      showToast?.('Erro de conexão ao acionar a IA.', 'error');
    } finally {
      setDiagnosingId(null);
    }
  };

  const surface = isDark ? 'bg-[#111726] border-slate-800/90 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const subCard = isDark ? 'bg-slate-900/75 border-slate-800' : 'bg-slate-50 border-slate-200';
  const diagnosis: ExamDiagnosisResult | null = selectedExam?.latestAttempt?.aiDiagnosis || null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Cabeçalho Tático + KPIs */}
      <div className={`rounded-2xl border p-5 sm:p-6 shadow-xl ${surface}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 shrink-0">
              <Radar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">Radar de Provas Oficiais</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  Banco de Provas + IA Sob Demanda
                </span>
              </div>
              <p className={`text-xs mt-1 max-w-2xl leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Todas as provas enviadas no Banco de Provas aparecem aqui. Marque seu cartão-resposta ou acertos por matéria e acione a IA só quando quiser um raio-X completo da prova.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/banco-de-provas')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 cursor-pointer shrink-0"
          >
            <FileText className="w-4 h-4" />
            Gerenciar Banco de Provas
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 tabular-nums">
          <div className={`rounded-xl border p-3.5 ${subCard}`}>
            <span className="text-[10px] font-bold uppercase text-slate-400">Provas no Radar</span>
            <p className="text-2xl font-black mt-1">{stats.total}</p>
          </div>
          <div className={`rounded-xl border p-3.5 ${subCard}`}>
            <span className="text-[10px] font-bold uppercase text-emerald-400">Provas Corrigidas</span>
            <p className="text-2xl font-black mt-1">{stats.answered}</p>
          </div>
          <div className={`rounded-xl border p-3.5 ${subCard}`}>
            <span className="text-[10px] font-bold uppercase text-sky-400">Aproveitamento Médio</span>
            <p className="text-2xl font-black mt-1">{stats.avgPct}%</p>
          </div>
          <div className={`rounded-xl border p-3.5 ${subCard}`}>
            <span className="text-[10px] font-bold uppercase text-purple-400">Análises de IA</span>
            <p className="text-2xl font-black mt-1">{stats.diagnosedCount}</p>
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      {loading ? (
        <div className={`rounded-2xl border p-12 text-center text-sm ${surface}`}>
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-400" />
          Carregando provas do Radar...
        </div>
      ) : exams.length === 0 ? (
        <div className={`rounded-2xl border p-10 text-center space-y-3 ${surface}`}>
          <BookOpen className="w-10 h-10 mx-auto text-sky-400 opacity-80" />
          <h3 className="text-base font-bold">Nenhuma prova no Banco de Provas ainda</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Envie uma prova em PDF no Banco de Provas e ela aparecerá automaticamente aqui para você lançar seus acertos e analisar com a IA.
          </p>
          <button
            type="button"
            onClick={() => navigate('/banco-de-provas')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
          >
            Ir para Banco de Provas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Coluna Esquerda: Lista de Provas */}
          <div className="xl:col-span-5 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar prova por título, banca ou ano..."
                className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${
                  isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                }`}
              />
            </div>

            <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
              {filteredExams.map((exam) => {
                const isSelected = selectedExam?.examPaperId === exam.examPaperId;
                const att = exam.latestAttempt;
                const isAnalyzing = diagnosingId === exam.examPaperId;

                return (
                  <div
                    key={exam.examPaperId}
                    onClick={() => setSelectedExamId(exam.examPaperId)}
                    className={`rounded-2xl border p-4 transition-all cursor-pointer ${
                      isSelected
                        ? isDark
                          ? 'bg-sky-950/25 border-sky-500/60 shadow-lg shadow-sky-950/20'
                          : 'bg-sky-50/70 border-sky-400 shadow-md'
                        : `${surface} hover:border-slate-600`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold uppercase tracking-wider">
                          <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/25">
                            {exam.institution} • {exam.examYear}
                          </span>
                          {exam.hasPdf && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                              PDF Pronto
                            </span>
                          )}
                        </div>
                        <h3 className="mt-1.5 text-sm font-extrabold truncate">{exam.title}</h3>
                      </div>

                      {att && (
                        <span
                          className={`px-2.5 py-1 rounded-xl text-xs font-black tabular-nums shrink-0 ${
                            att.accuracyPct >= 75
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : att.accuracyPct >= 55
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-red-500/15 text-red-400'
                          }`}
                        >
                          {att.accuracyPct}%
                        </span>
                      )}
                    </div>

                    {att ? (
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
                          <span>
                            {att.correctCount}/{att.totalQuestions} acertos • {att.wrongCount} erros
                          </span>
                          <span>{exam.attemptsCount} tentativa(s)</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              att.accuracyPct >= 75
                                ? 'bg-emerald-500'
                                : att.accuracyPct >= 55
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${att.accuracyPct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">
                        Sem acertos registrados ainda. Lance o cartão-resposta para liberar a análise.
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditorForExam(exam);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          isDark
                            ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                            : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                        }`}
                      >
                        <ClipboardCheck className="w-3.5 h-3.5 text-sky-400" />
                        {att ? 'Editar Cartão / Acertos' : 'Lançar Acertos'}
                      </button>

                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRunAIDiagnosis(exam);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {isAnalyzing ? 'Lendo Prova...' : att?.aiDiagnosis ? 'Reanalisar com IA' : 'Analisar Prova com IA'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coluna Direita: Raio-X / Diagnóstico da Prova Selecionada */}
          <div className="xl:col-span-7">
            {selectedExam ? (
              <div className={`rounded-2xl border p-5 sm:p-6 space-y-5 shadow-xl ${surface}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/50">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                      Diagnóstico da Prova Selecionada
                    </span>
                    <h3 className="text-lg font-extrabold">{selectedExam.title}</h3>
                  </div>

                  <button
                    type="button"
                    disabled={diagnosingId === selectedExam.examPaperId}
                    onClick={() => void handleRunAIDiagnosis(selectedExam)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white shadow-md cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {diagnosingId === selectedExam.examPaperId ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {diagnosingId === selectedExam.examPaperId
                      ? 'Lendo PDF e Erros...'
                      : 'Ler Prova Inteira e Diagnosticar com IA'}
                  </button>
                </div>

                {diagnosis ? (
                  <div className="space-y-5">
                    <div className={`rounded-xl border p-4 ${subCard}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                          Visão Geral ({diagnosis.source === 'gemini' ? 'Leitura Completa Gemini AI' : 'Motor Tático'})
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(diagnosis.generatedAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed">{diagnosis.summary}</p>
                      {diagnosis.wrongQuestions.length > 0 && (
                        <p className="mt-2 text-xs text-red-400 font-semibold">
                          Questões erradas mapeadas: {diagnosis.wrongQuestions.map((q) => `Q${q}`).join(', ')}
                        </p>
                      )}
                    </div>

                    {diagnosis.prioritySubjects.length > 0 && (
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Target className="w-4 h-4 text-red-400" />
                          Matérias que Você Mais Precisa Estudar nesta Prova
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {diagnosis.prioritySubjects.map((sub, idx) => (
                            <div key={idx} className={`rounded-xl border p-3.5 ${subCard}`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold">{sub.subject}</span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    sub.priority === 'CRÍTICA'
                                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                      : sub.priority === 'ALTA'
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                  }`}
                                >
                                  {sub.priority}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1">{sub.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {diagnosis.weakTopics.length > 0 && (
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          Pontos Onde Você Mais Errou
                        </h4>
                        <div className="space-y-2">
                          {diagnosis.weakTopics.map((topic, idx) => (
                            <div key={idx} className={`rounded-xl border p-3.5 ${subCard}`}>
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-extrabold text-amber-400">
                                  {topic.subject} • {topic.topic}
                                </span>
                                {topic.questionNumbers?.length > 0 && (
                                  <span className="text-[11px] font-mono text-slate-400">
                                    {topic.questionNumbers.map((q) => `Q${q}`).join(', ')}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs mt-1">{topic.errorPattern}</p>
                              <p className="text-xs text-emerald-400 font-semibold mt-1">
                                Como corrigir: {topic.recommendation}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {diagnosis.studyPlan.length > 0 && (
                      <div className={`rounded-xl border p-4 space-y-2 ${subCard}`}>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          Plano de Ação Pós-Prova
                        </h4>
                        <ul className="space-y-1.5 text-xs">
                          {diagnosis.studyPlan.map((step, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="font-bold text-emerald-400">{i + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`rounded-2xl border border-dashed p-10 text-center space-y-3 ${subCard}`}>
                    <Sparkles className="w-8 h-8 mx-auto text-sky-400" />
                    <h4 className="text-sm font-bold">Pronta para leitura sob demanda</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      A IA não gasta chamadas automaticamente. Primeiro lance seus acertos/cartão-resposta e depois clique no botão acima quando quiser que a IA leia a prova e monte o diagnóstico.
                    </p>
                    <button
                      type="button"
                      onClick={() => openEditorForExam(selectedExam)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      Preencher Cartão / Acertos
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal Cartão-Resposta & Gabarito da Prova */}
      {editingExam && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border p-5 sm:p-6 space-y-4 shadow-2xl ${surface}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                  {editingExam.institution} • {editingExam.examYear}
                </span>
                <h3 className="text-lg font-extrabold">{editingExam.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingExam(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 cursor-pointer"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <AnswerSheetInput
              theme={theme}
              subjects={subjects}
              totalQuestions={totalQuestions}
              onChangeTotalQuestions={setTotalQuestions}
              studentAnswers={studentAnswers}
              onChangeStudentAnswers={setStudentAnswers}
              officialKey={officialKey}
              onChangeOfficialKey={setOfficialKey}
              subjectScores={subjectScores}
              onChangeSubjectScores={setSubjectScores}
              manualCorrectCount={manualCorrectCount}
              onChangeManualCorrectCount={setManualCorrectCount}
              showToast={showToast}
            />

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditingExam(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingAttempt}
                onClick={() => void handleSaveAttempt()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/25 cursor-pointer disabled:opacity-50"
              >
                {isSavingAttempt ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Salvar no Radar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
