import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Layers,
  MoreVertical,
  Check,
  AlertCircle,
  Maximize2,
  Minimize2,
  Filter,
  Camera,
  Image as ImageIcon,
  FolderOpen,
  HelpCircle,
  Eye,
  Trash2,
  X,
  Loader2,
  Zap,
  Crop,
} from 'lucide-react';
import { AppTheme } from '../types';
import { Latex } from './LatexRenderer';
import { QuestionCropReviewModal } from './QuestionCropReviewModal';

interface ExamOption {
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
}

interface AISolutionStep {
  stepNumber: number;
  title: string;
  explanation: string;
  latex?: string;
}

interface AISolutionPayload {
  selectedOption: 'A' | 'B' | 'C' | 'D' | 'E';
  steps: AISolutionStep[];
  concepts: string[];
  explanationSummary: string;
  calculatedDifficulty: 'Fácil' | 'Médio' | 'Difícil';
  confidencePercent: number;
}

interface ExamQuestion {
  id: string;
  examId: string;
  questionNumber: number;
  statement: string;
  supportText?: string | null;
  optionsJson: string;
  correctOption?: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  discipline: string;
  topic: string;
  subtopic: string;
  difficulty: 'Fácil' | 'Médio' | 'Difícil';
  difficultyScore: number;
  confidenceScore: number;
  imagesJson?: string | null;
  aiSolutionJson?: string | null;
  status: string;
}

interface ExamPaper {
  id: string;
  title: string;
  institution: string;
  examYear: number;
  totalQuestions: number;
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'ERROR' | 'NEEDS_REVIEW';
  fileId?: string | null;
  primaryDisciplinesJson?: string | null;
  createdAt: string;
}

interface ExamStats {
  totalPapers: number;
  totalQuestions: number;
  resolvedQuestions: number;
  successRatePercent: number;
  averageTimeMinutes: number;
}

interface ExamBankTabProps {
  theme: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

function getAuthToken(): string | null {
  return localStorage.getItem('cfo_terminal_session') || localStorage.getItem('cfo_terminal_token') || null;
}

export const ExamBankTab: React.FC<ExamBankTabProps> = ({ theme, showToast }) => {
  const isDark = theme === 'dark';

  // Estados principais
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [selectedQuestionIdsForSolve, setSelectedQuestionIdsForSolve] = useState<string[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D' | 'E'>>({});
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>([]);
  const [activeDisciplineFilter, setActiveDisciplineFilter] = useState<string>('Todas');
  const [activeTabFilter, setActiveTabFilter] = useState<'mine' | 'recent' | 'popular'>('mine');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('all');
  const [selectedResolutionTab, setSelectedResolutionTab] = useState<'ai' | 'gabarito' | 'concepts'>('ai');

  // Estados de Carregamento e Operação
  const [isLoadingPapers, setIsLoadingPapers] = useState(true);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isSolvingAI, setIsSolvingAI] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [stats, setStats] = useState<ExamStats | null>(null);

  // Modais
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Form State para Novo Upload
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadInstitution, setUploadInstitution] = useState('VUNESP');
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear());
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Visualização Mobile Drill-down
  const [mobileView, setMobileView] = useState<'papers' | 'questions' | 'detail'>('papers');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenOriginalPdf = async () => {
    if (!selectedPaper?.fileId) return;
    const popup = window.open('', '_blank');
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/files/${selectedPaper.fileId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error('PDF indisponível');
      const url = URL.createObjectURL(await response.blob());
      if (popup) popup.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      popup?.close();
      showToast?.('Não foi possível abrir o PDF original.', 'error');
    }
  };

  // Carrega Provas e Estatísticas
  const fetchPapersAndStats = async () => {
    try {
      setIsLoadingPapers(true);
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [papersRes, statsRes] = await Promise.all([
        fetch('/api/exams', { headers }),
        fetch('/api/exams/stats', { headers }),
      ]);

      if (papersRes.ok) {
        const data = await papersRes.json();
        const paperList: ExamPaper[] = data.papers || [];
        setPapers(paperList);
        if (paperList.length > 0 && !selectedPaperId) {
          setSelectedPaperId(paperList[0].id);
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }
    } catch (err) {
      console.warn('Falha ao carregar banco de provas:', err);
    } finally {
      setIsLoadingPapers(false);
    }
  };

  useEffect(() => {
    fetchPapersAndStats();
  }, []);

  // Carrega Questões da Prova
  const fetchQuestionsForPaper = async (paperId: string, keepSelectedId = false) => {
    try {
      setIsLoadingQuestions(true);
      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/exams/${paperId}/questions`, { headers });
      if (res.ok) {
        const data = await res.json();
        const qList: ExamQuestion[] = data.questions || [];
        setQuestions(qList);
        if (!keepSelectedId) {
          if (qList.length > 0) {
            setSelectedQuestionId(qList[0].id);
          } else {
            setSelectedQuestionId(null);
          }
          setSelectedQuestionIdsForSolve([]);
          setActiveDisciplineFilter('Todas');
        }
      }
    } catch (err) {
      console.warn('Falha ao carregar questões da prova:', err);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  useEffect(() => {
    if (!selectedPaperId) {
      setQuestions([]);
      setSelectedQuestionId(null);
      return;
    }

    fetchQuestionsForPaper(selectedPaperId);
  }, [selectedPaperId]);

  // Prova Selecionada Atual
  const selectedPaper = useMemo(() => {
    return papers.find((p) => p.id === selectedPaperId) || papers[0] || null;
  }, [papers, selectedPaperId]);

  // Questão Selecionada Atual
  const selectedQuestion = useMemo(() => {
    return questions.find((q) => q.id === selectedQuestionId) || questions[0] || null;
  }, [questions, selectedQuestionId]);

  // Disciplinas Disponíveis na Prova Selecionada com contagens
  const availableDisciplines = useMemo(() => {
    const map = new Map<string, number>();
    questions.forEach((q) => {
      const disc = q.discipline || 'Geral';
      map.set(disc, (map.get(disc) || 0) + 1);
    });

    const list: { name: string; count: number }[] = [{ name: 'Todas', count: questions.length }];
    map.forEach((count, name) => {
      list.push({ name, count });
    });
    return list;
  }, [questions]);

  // Questões Filtradas pela Disciplina Ativa
  const filteredQuestions = useMemo(() => {
    if (activeDisciplineFilter === 'Todas') return questions;
    return questions.filter((q) => q.discipline === activeDisciplineFilter);
  }, [questions, activeDisciplineFilter]);

  // Provas Filtradas
  const filteredPapers = useMemo(() => {
    return papers.filter((paper) => {
      const matchesSearch =
        searchQuery === '' ||
        paper.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        paper.institution.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesYear =
        selectedYearFilter === 'all' || String(paper.examYear) === selectedYearFilter;

      return matchesSearch && matchesYear;
    });
  }, [papers, searchQuery, selectedYearFilter]);

  // Anos Únicos Disponíveis
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(papers.map((p) => Number(p.examYear)))).sort((a: number, b: number) => b - a);
    return years;
  }, [papers]);

  // Alternativas da Questão Selecionada
  const selectedQuestionOptions: ExamOption[] = useMemo(() => {
    if (!selectedQuestion) return [];
    try {
      return JSON.parse(selectedQuestion.optionsJson);
    } catch {
      return [];
    }
  }, [selectedQuestion]);

  const selectedQuestionImages: string[] = useMemo(() => {
    if (!selectedQuestion?.imagesJson) return [];
    try {
      const parsed = JSON.parse(selectedQuestion.imagesJson);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch { return []; }
  }, [selectedQuestion]);

  // Solução de IA da Questão Selecionada
  const selectedQuestionAISolution: AISolutionPayload | null = useMemo(() => {
    if (!selectedQuestion || !selectedQuestion.aiSolutionJson) return null;
    try {
      return JSON.parse(selectedQuestion.aiSolutionJson);
    } catch {
      return null;
    }
  }, [selectedQuestion]);

  // Toggle de Seleção de Questão para Correção com IA (Trava em 10)
  const handleToggleQuestionForSolve = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    setSelectedQuestionIdsForSolve((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        if (prev.length >= 10) {
          if (showToast) {
            showToast('Você pode corrigir até 10 questões por vez.', 'warning');
          }
          return prev;
        }
        return [...prev, id];
      }
    });
  };

  // Correção com IA das Questões Selecionadas
  const handleSolveSelectedWithAI = async () => {
    if (selectedQuestionIdsForSolve.length === 0) return;
    if (selectedQuestionIdsForSolve.length > 10) {
      showToast?.('Você pode corrigir até 10 questões por vez.', 'error');
      return;
    }

    try {
      setIsSolvingAI(true);
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/exams/solve-with-ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          questionIds: selectedQuestionIdsForSolve,
          idempotencyKey: `solve-${Date.now()}-${selectedQuestionIdsForSolve.join('-')}`,
        }),
      });

      const data = await res.json().catch(() => ({ message: `Servidor respondeu com HTTP ${res.status}.` }));

      if (res.ok && data.success) {
        showToast?.(`✅ ${data.totalSolved} questões corrigidas com sucesso pela IA!`, 'success');
        // Recarrega as questões
        if (selectedPaperId) {
          const qRes = await fetch(`/api/exams/${selectedPaperId}/questions`, { headers });
          if (qRes.ok) {
            const qData = await qRes.json();
            setQuestions(qData.questions || []);
          }
        }
        // Atualiza estatísticas reais
        const statsRes = await fetch('/api/exams/stats', { headers });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.stats);
        }
        setSelectedQuestionIdsForSolve([]);
      } else {
        showToast?.(data.message || 'Falha ao corrigir questões com IA.', 'error');
      }
    } catch (err: any) {
      showToast?.('Erro de conexão durante a resolução por IA.', 'error');
    } finally {
      setIsSolvingAI(false);
    }
  };

  // Upload e Processamento de Nova Prova
  const handleProcessUpload = async (fileToUpload?: File) => {
    const file = fileToUpload || selectedFile;
    if (!uploadTitle.trim() && !file) {
      showToast?.('Informe o título da prova ou selecione um arquivo.', 'warning');
      return;
    }

    try {
      setIsUploading(true);
      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let base64Content: string | undefined;
      let declaredMime: string | undefined;
      let fileName: string | undefined;

      if (file) {
        fileName = file.name;
        declaredMime = file.type || 'application/pdf';
        const buffer = await file.arrayBuffer();
        base64Content = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
      }

      const res = await fetch('/api/exams/upload-and-process', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: uploadTitle.trim() || file?.name.replace(/\.[^/.]+$/, '') || 'Prova CFO CBMERJ',
          institution: uploadInstitution,
          examYear: uploadYear,
          fileName,
          declaredMime,
          contentBase64: base64Content,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast?.('Prova recebida. A leitura continuará em segundo plano.', 'info');
        setIsUploadModalOpen(false);
        setUploadTitle('');
        setSelectedFile(null);
        await fetchPapersAndStats();
        if (data.jobId) {
          const poll = window.setInterval(async () => {
            try {
              const token = getAuthToken();
              const jobRes = await fetch(`/api/exams/jobs/${data.jobId}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
              const jobData = await jobRes.json();
              if (jobData.job?.status === 'completed' || jobData.job?.status === 'failed') {
                window.clearInterval(poll);
                if (jobData.job.status === 'completed' && jobData.job.resultSummaryJson) {
                  try {
                    const summary = JSON.parse(jobData.job.resultSummaryJson);
                    if (summary.paperId) setSelectedPaperId(summary.paperId);
                  } catch { /* resumo opcional */ }
                }
                await fetchPapersAndStats();
                showToast?.(jobData.job.status === 'completed' ? 'Prova processada. As questões já estão disponíveis.' : 'A leitura da prova falhou. Ela ficou disponível para revisão.', jobData.job.status === 'completed' ? 'success' : 'warning');
              }
            } catch { /* tenta novamente */ }
          }, 2500);
          window.setTimeout(() => window.clearInterval(poll), 30 * 60 * 1000);
        }
      } else {
        showToast?.(data.message || 'Falha no processamento da prova.', 'error');
      }
    } catch (err: any) {
      showToast?.(`Erro ao enviar prova para o servidor: ${err?.message || 'verifique sua conexão.'}`, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Handler de Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setIsUploadModalOpen(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setIsUploadModalOpen(true);
    }
  };

  // Render do Badge de Dificuldade
  const renderDifficultyBadge = (difficulty: 'Fácil' | 'Médio' | 'Difícil') => {
    switch (difficulty) {
      case 'Fácil':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Fácil
          </span>
        );
      case 'Médio':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Médio
          </span>
        );
      case 'Difícil':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Difícil
          </span>
        );
    }
  };

  // Disciplinas Parseadas para a Prova
  const parsePrimaryDisciplines = (json?: string | null): string[] => {
    if (!json) return ['Geral'];
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : ['Geral'];
    } catch {
      return ['Geral'];
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. CABEÇALHO DA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0056D2] via-blue-600 to-[#0056D2] text-white flex items-center justify-center shadow-lg shadow-blue-950/40">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className={`text-2xl font-black tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Provas
            </h1>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Envie provas, separe as questões, classifique por disciplina e corrija com IA.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setUploadTitle('');
            setSelectedFile(null);
            setIsUploadModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-[#0056D2] hover:bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-950/30 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer self-start sm:self-auto"
        >
          <span className="text-base font-black leading-none">+</span>
          <span>Adicionar prova</span>
        </button>
      </div>

      {/* 2. CARDS SUPERIORES DE RESUMO */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Provas Enviadas */}
        <div
          className={`p-4 rounded-2xl border transition-all shadow-xl flex items-center justify-between ${
            isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <span className={`text-2xl font-black tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {stats ? stats.totalPapers : 0}
            </span>
            <p className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Provas enviadas
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-[#0056D2] dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Questões Processadas */}
        <div
          className={`p-4 rounded-2xl border transition-all shadow-xl flex items-center justify-between ${
            isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <span className={`text-2xl font-black tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {stats ? stats.totalQuestions : 0}
            </span>
            <p className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Questões processadas
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Taxa de Sucesso */}
        <div
          className={`p-4 rounded-2xl border transition-all shadow-xl flex items-center justify-between ${
            isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <span className={`text-2xl font-black tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {stats ? `${stats.successRatePercent}%` : '0%'}
            </span>
            <p className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Taxa de sucesso
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Tempo Médio */}
        <div
          className={`p-4 rounded-2xl border transition-all shadow-xl flex items-center justify-between ${
            isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <span className={`text-2xl font-black tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {stats && stats.totalPapers > 0 ? `${stats.averageTimeMinutes} min` : '--'}
            </span>
            <p className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Tempo médio
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 5: Segurança & Privacidade */}
        <div
          className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border transition-all shadow-xl flex items-center justify-between ${
            isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <span className="text-sm font-black text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Seguro
            </span>
            <p className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Seus dados protegidos
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. ÁREA DE UPLOAD + DICAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dropzone Principal */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`lg:col-span-2 p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center group ${
            dragActive
              ? 'border-[#0056D2] bg-blue-500/10 scale-[0.99]'
              : isDark
              ? 'border-slate-800 hover:border-slate-700 bg-[#0B1528]/60 hover:bg-[#0B1528]'
              : 'border-slate-300 hover:border-slate-400 bg-slate-50/70 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-[#0056D2] dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-6 h-6" />
          </div>
          <h3 className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
            Arraste e solte sua prova aqui
          </h3>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            ou clique para selecionar
          </p>
          <span className={`text-[10px] mt-2 px-2.5 py-0.5 rounded-full border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-200/60 border-slate-300 text-slate-600'}`}>
            PDF, JPG, PNG, WEBP (máx. 20 MB)
          </span>

          {/* Botões Rápidos */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-sm mt-4 pt-3 border-t border-slate-800/40" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                isDark ? 'bg-[#111218] border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Arquivo</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                isDark ? 'bg-[#111218] border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>Tirar foto</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                isDark ? 'bg-[#111218] border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
              <span>Usar câmera</span>
            </button>
          </div>
        </div>

        {/* Card de Dicas Pedagógicas */}
        <div
          className={`p-5 rounded-2xl border transition-all shadow-xl flex flex-col justify-between ${
            isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <div className="flex items-center gap-2 text-amber-400 mb-3">
              <Sparkles className="w-4 h-4" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Dicas Táticas</h4>
            </div>
            <ul className="space-y-2.5 text-xs">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  A IA vai identificar e separar as questões automaticamente.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  Suporta provas de múltipla escolha e discursivas.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  Preserva imagens, tabelas, gráficos e fórmulas em LaTeX.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  Você poderá revisar e corrigir <strong>até 10 questões</strong> por vez.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 4. BARRA DE FILTROS */}
      <div
        className={`p-2.5 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xl ${
          isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200'
        }`}
      >
        {/* Tabs de Filtro */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          <button
            onClick={() => setActiveTabFilter('mine')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTabFilter === 'mine'
                ? 'bg-[#0056D2] text-white shadow-sm'
                : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Minhas provas
          </button>
          <button
            onClick={() => setActiveTabFilter('recent')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTabFilter === 'recent'
                ? 'bg-[#0056D2] text-white shadow-sm'
                : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Provas recentes
          </button>
          <button
            onClick={() => setActiveTabFilter('popular')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTabFilter === 'popular'
                ? 'bg-[#0056D2] text-white shadow-sm'
                : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Mais acessadas
          </button>
        </div>

        {/* Busca e Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Input de Busca */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar provas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border outline-none transition-all ${
                isDark
                  ? 'bg-[#111218] border-slate-800 text-slate-200 placeholder-slate-500 focus:border-[#0056D2]'
                  : 'bg-slate-50 border-slate-300 text-slate-800 placeholder-slate-400 focus:border-[#0056D2]'
              }`}
            />
          </div>

          {/* Select de Ano */}
          <select
            value={selectedYearFilter}
            onChange={(e) => setSelectedYearFilter(e.target.value)}
            className={`px-2.5 py-1.5 text-xs rounded-xl border outline-none cursor-pointer ${
              isDark ? 'bg-[#111218] border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          >
            <option value="all">Todos os anos</option>
            {availableYears.map((yr) => (
              <option key={yr} value={String(yr)}>
                {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 5. TRÊS ÁREAS PRINCIPAIS (DESKTOP) / DRILL-DOWN (MOBILE) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ============================================================== */}
        {/* COLUNA 1: LISTA DAS PROVAS (lg:col-span-4)                     */}
        {/* ============================================================== */}
        <div
          className={`lg:col-span-3 rounded-2xl border p-3.5 space-y-3 shadow-xl ${
            isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between px-1">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Provas Cadastradas ({filteredPapers.length})
            </h3>
          </div>

          {isLoadingPapers ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#0056D2]" />
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Carregando provas...</span>
            </div>
          ) : filteredPapers.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <FileText className="w-8 h-8 mx-auto text-slate-500/50" />
              <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Nenhuma prova encontrada.
              </p>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="text-xs font-bold text-[#0056D2] hover:underline cursor-pointer"
              >
                + Enviar primeira prova
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[650px] overflow-y-auto pr-1">
              {filteredPapers.map((paper) => {
                const isSelected = paper.id === selectedPaperId;
                const disciplines = parsePrimaryDisciplines(paper.primaryDisciplinesJson);
                const displayDisciplines = disciplines.slice(0, 3);
                const remaining = disciplines.length - 3;

                return (
                  <div
                    key={paper.id}
                    onClick={() => {
                      setSelectedPaperId(paper.id);
                      setMobileView('questions');
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                      isSelected
                        ? isDark
                          ? 'bg-[#15233e] border-[#0056D2] shadow-md shadow-blue-950/40'
                          : 'bg-blue-50/80 border-blue-400 shadow-sm'
                        : isDark
                        ? 'bg-[#111218] border-slate-800/80 hover:border-slate-700 hover:bg-[#131724]'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Miniatura do Documento */}
                      <div className="w-11 h-14 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center justify-center shrink-0 shadow-inner p-1">
                        <FileText className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" />
                        <span className="text-[8px] font-black text-slate-500 uppercase mt-1">CFO</span>
                      </div>

                      {/* Informações da Prova */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className={`text-xs font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            {paper.title}
                          </h4>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${paper.status === 'READY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                            {paper.status === 'READY' ? 'Processada' : 'Revisão necessária'}
                          </span>
                        </div>

                        <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {paper.totalQuestions} questões • {paper.institution} • {paper.examYear}
                        </p>

                        {/* Badges de Disciplinas */}
                        <div className="flex items-center gap-1 flex-wrap mt-2">
                          {displayDisciplines.map((disc, idx) => (
                            <span
                              key={idx}
                              className={`px-2 py-0.5 rounded-md text-[9px] font-semibold border ${
                                isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              {disc}
                            </span>
                          ))}
                          {remaining > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-semibold ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                              +{remaining}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* COLUNA 2: QUESTÕES DA PROVA SELECIONADA (lg:col-span-4)         */}
        {/* ============================================================== */}
        <div
          className={`lg:col-span-3 rounded-2xl border p-3.5 space-y-3 shadow-xl ${
            isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200'
          }`}
        >
          {/* Topo da Prova Selecionada */}
          <div className="flex items-center justify-between px-1">
            <div className="min-w-0">
              <h3 className={`text-xs font-black truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {selectedPaper ? selectedPaper.title : 'Selecione uma prova'}
              </h3>
              <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {questions.length} questões detectadas
              </p>
            </div>
            <button
              onClick={() => showToast?.('Todas as questões e classificações estão validadas.', 'info')}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                isDark ? 'bg-indigo-950/60 border-indigo-800/60 text-indigo-300 hover:bg-indigo-900/60' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>Revisar prova</span>
            </button>
            {selectedPaper?.fileId && (
              <button
                onClick={handleOpenOriginalPdf}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${isDark ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                title="Abrir o arquivo original da prova"
              >
                <Eye className="w-3 h-3" />
                <span>Ver PDF</span>
              </button>
            )}
          </div>

          {/* Tabs de Disciplinas Dinâmicas */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
            {availableDisciplines.map((d) => {
              const isActive = activeDisciplineFilter === d.name;
              return (
                <button
                  key={d.name}
                  onClick={() => setActiveDisciplineFilter(d.name)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[#0056D2] text-white shadow-xs'
                      : isDark
                      ? 'bg-[#111218] text-slate-400 hover:text-slate-200 border border-slate-800'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  {d.name} ({d.count})
                </button>
              );
            })}
          </div>

          {/* Lista das Questões */}
          {isLoadingQuestions ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#0056D2]" />
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Carregando questões...</span>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Nenhuma questão nesta disciplina.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredQuestions.map((q) => {
                const isSelected = q.id === selectedQuestionId;
                const isChecked = selectedQuestionIdsForSolve.includes(q.id);

                return (
                  <div
                    key={q.id}
                    onClick={() => {
                      setSelectedQuestionId(q.id);
                      setMobileView('detail');
                    }}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? isDark
                          ? 'bg-[#15233e] border-[#0056D2]'
                          : 'bg-blue-50/80 border-blue-400'
                        : isDark
                        ? 'bg-[#111218] border-slate-800/70 hover:border-slate-700'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Checkbox de Seleção */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleQuestionForSolve(q.id, e)}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                        isChecked
                          ? 'bg-[#0056D2] border-[#0056D2] text-white'
                          : isDark
                          ? 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
                          : 'border-slate-300 bg-white hover:border-slate-400'
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>

                    {/* Dados da Questão */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                          Questão {q.questionNumber}
                        </span>
                        {q.aiSolutionJson && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Resolvida com IA" />
                        )}
                      </div>
                      <p className={`text-[10px] truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {q.discipline} &gt; {q.topic} &gt; {q.subtopic}
                      </p>
                    </div>

                    {/* Badge de Dificuldade */}
                    <div className="shrink-0">{renderDifficultyBadge(q.difficulty)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Rodapé da Lista: Barra de Ação de Correção com IA */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between gap-2 pt-2.5 mt-2 ${
              isDark ? 'bg-[#111218] border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {selectedQuestionIdsForSolve.length} questões selecionadas
            </span>

            <button
              disabled={selectedQuestionIdsForSolve.length === 0 || isSolvingAI}
              onClick={handleSolveSelectedWithAI}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md ${
                selectedQuestionIdsForSolve.length > 0 && !isSolvingAI
                  ? 'bg-gradient-to-r from-blue-600 to-[#0056D2] hover:brightness-110 text-white cursor-pointer active:scale-95'
                  : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
              }`}
            >
              {isSolvingAI ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Corrigindo...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Corrigir com IA ({selectedQuestionIdsForSolve.length}/10)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUNA 3: PAINEL DA QUESTÃO E RESOLUÇÃO IA (lg:col-span-4)       */}
        {/* ============================================================== */}
        <div
          className={`lg:col-span-6 rounded-2xl border p-5 space-y-5 shadow-xl ${
            isDark ? 'bg-[#0B1528] border-slate-800/90' : 'bg-white border-slate-200'
          }`}
        >
          {selectedQuestion ? (
            <>
              {/* Topo do Painel */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                    Questão {selectedQuestion.questionNumber} de {questions.length}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {renderDifficultyBadge(selectedQuestion.difficulty)}
                </div>
              </div>

              {/* Tags de Classificação Canônica & Ações de Recorte */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#0056D2]/20 text-blue-300 border border-blue-500/30">
                    {selectedQuestion.discipline}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                    {selectedQuestion.topic}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                    {selectedQuestion.subtopic}
                  </span>
                </div>

                {selectedPaper?.fileId && (
                  <button
                    type="button"
                    onClick={() => setIsCropModalOpen(true)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      selectedQuestion.status === 'NEEDS_REVIEW'
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                        : isDark
                        ? 'bg-slate-850 border-slate-700 text-blue-400 hover:bg-slate-800'
                        : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                    }`}
                    title="Ajustar coordenadas e re-recortar a imagem original da questão"
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Ajustar Recorte Original</span>
                  </button>
                )}
              </div>

              {/* Texto de Apoio / Suporte Compartilhado */}
              {selectedQuestion.supportText && (
                <div
                  className={`p-3 rounded-xl border text-xs leading-relaxed ${
                    isDark ? 'bg-slate-950/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <p className="font-bold text-[11px] text-amber-400 mb-1">Texto de Apoio</p>
                  <p className="whitespace-pre-wrap">{selectedQuestion.supportText}</p>
                </div>
              )}

              {/* Enunciado da Questão com KaTeX / LaTeX */}
              {selectedQuestionImages.length > 0 && (
                <div className={`rounded-2xl border p-3 space-y-2 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-[10px] font-black uppercase tracking-wider text-blue-400">Imagem da prova</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedQuestionImages.map((image, index) => (
                      <button key={`${image}-${index}`} type="button" onClick={() => setZoomedImage(image)} className="group relative rounded-xl overflow-hidden border border-slate-700/70 bg-black/20 cursor-zoom-in">
                        <img src={image} alt={`Imagem da questão ${selectedQuestion.questionNumber} ${index + 1}`} className="w-full max-h-80 object-contain group-hover:scale-[1.02] transition-transform" />
                        <span className="absolute bottom-2 right-2 rounded-lg bg-[#0056D2]/90 px-2 py-1 text-[10px] font-bold text-white"><Maximize2 className="inline w-3 h-3 mr-1" />Ampliar</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={`text-sm leading-7 font-normal ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                <Latex content={selectedQuestion.statement} />
              </div>

              {/* Lista de Alternativas (A, B, C, D, E) */}
              <div className="space-y-1.5 pt-1">
                {selectedQuestionOptions.map((opt) => {
                  const isCorrect = selectedQuestion.correctOption
                    ? selectedQuestion.correctOption === opt.letter
                    : selectedQuestionAISolution?.selectedOption === opt.letter;

                  return (
                    <button
                      key={opt.letter}
                      type="button"
                      onClick={() => setUserAnswers((prev) => ({ ...prev, [selectedQuestion.id]: opt.letter }))}
                      className={`p-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                        userAnswers[selectedQuestion.id] === opt.letter
                          ? selectedQuestion.correctOption === opt.letter ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-medium' : 'bg-rose-500/10 border-rose-500/40 text-rose-300 font-medium'
                          : isCorrect
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-medium'
                          : isDark
                          ? 'bg-[#111218] border-slate-800/70 text-slate-300 hover:border-slate-700'
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                          isCorrect
                            ? 'bg-emerald-500 text-white'
                            : isDark
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {opt.letter}
                      </span>
                      <div className="text-xs leading-tight flex-1 pt-0.5">
                        <Latex content={opt.text} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {userAnswers[selectedQuestion.id] && !answeredQuestionIds.includes(selectedQuestion.id) && (
                <button type="button" onClick={() => setAnsweredQuestionIds((prev) => [...prev, selectedQuestion.id])} className="w-full rounded-xl bg-[#0056D2] hover:bg-blue-600 px-4 py-3 text-sm font-black text-white transition-colors cursor-pointer">Responder</button>
              )}

              {userAnswers[selectedQuestion.id] && answeredQuestionIds.includes(selectedQuestion.id) && (
                <div className={`rounded-xl border p-3 text-xs ${selectedQuestion.correctOption && userAnswers[selectedQuestion.id] === selectedQuestion.correctOption ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : selectedQuestion.correctOption ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                  {!selectedQuestion.correctOption ? 'Resposta registrada. O gabarito ainda não foi localizado.' : userAnswers[selectedQuestion.id] === selectedQuestion.correctOption ? 'Você acertou!' : `Você errou. A alternativa correta é ${selectedQuestion.correctOption}.`}
                </div>
              )}

              {/* Abas Inferiores de Correção */}
              <div className="border-t border-slate-800/60 pt-3 space-y-3">
                <div className="flex items-center gap-1 border-b border-slate-800/60 pb-1">
                  <button
                    onClick={() => setSelectedResolutionTab('ai')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      selectedResolutionTab === 'ai'
                        ? 'bg-[#0056D2] text-white shadow-xs'
                        : isDark
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Resolução (IA)
                  </button>
                  <button
                    onClick={() => setSelectedResolutionTab('gabarito')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      selectedResolutionTab === 'gabarito'
                        ? 'bg-[#0056D2] text-white shadow-xs'
                        : isDark
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Gabarito
                  </button>
                  <button
                    onClick={() => setSelectedResolutionTab('concepts')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      selectedResolutionTab === 'concepts'
                        ? 'bg-[#0056D2] text-white shadow-xs'
                        : isDark
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Conceitos
                  </button>
                </div>

                {/* Conteúdo da Aba Resolução IA */}
                {selectedResolutionTab === 'ai' && (
                  <div className="space-y-3">
                    {selectedQuestionAISolution ? (
                      <>
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            Passo a passo da resolução
                          </p>
                          {selectedQuestionAISolution.steps.map((step) => (
                            <div
                              key={step.stepNumber}
                              className={`p-3 rounded-xl border space-y-1.5 ${
                                isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-[#0056D2] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {step.stepNumber}
                                </span>
                                <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                  {step.title}
                                </span>
                              </div>
                              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                <Latex content={step.explanation} />
                              </p>
                              {step.latex && (
                                <div className="mt-1">
                                  <Latex content={step.latex} block />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Card Final Verde da IA */}
                        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 flex items-center justify-between gap-3 shadow-md shadow-emerald-950/20">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                              <Check className="w-5 h-5 stroke-[3]" />
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-emerald-400/90 uppercase tracking-wide">
                                Resposta da IA
                              </p>
                              <p className="text-sm font-black text-white">
                                Alternativa {selectedQuestionAISolution.selectedOption}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] text-emerald-400/90 font-medium">
                              Confiança: <span className="font-bold text-white">{selectedQuestionAISolution.confidencePercent}%</span>
                            </p>
                            <p className="text-[10px] text-emerald-400/90 font-medium">
                              Nível: <span className="font-bold text-white">{selectedQuestionAISolution.calculatedDifficulty}</span>
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="py-6 text-center space-y-2">
                        <Sparkles className="w-6 h-6 mx-auto text-amber-400" />
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Esta questão ainda não foi corrigida pela IA.
                        </p>
                        <button
                          onClick={() => {
                            setSelectedQuestionIdsForSolve([selectedQuestion.id]);
                            handleSolveSelectedWithAI();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#0056D2] hover:bg-blue-600 text-white font-bold text-xs shadow-sm cursor-pointer"
                        >
                          Corrigir agora com IA
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Conteúdo da Aba Gabarito */}
                {selectedResolutionTab === 'gabarito' && (
                  <div className={`p-3.5 rounded-xl border space-y-2 text-xs ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Gabarito Oficial:</span>
                      <span className="font-black text-[#0056D2] text-sm">
                        {selectedQuestion.correctOption ? `Alternativa ${selectedQuestion.correctOption}` : 'Em processamento'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-800/40 pt-2">
                      <span className="font-bold">Resposta da IA:</span>
                      <span className="font-black text-emerald-400 text-sm">
                        {selectedQuestionAISolution ? `Alternativa ${selectedQuestionAISolution.selectedOption}` : 'Pendente'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Conteúdo da Aba Conceitos */}
                {selectedResolutionTab === 'concepts' && (
                  <div className={`p-3.5 rounded-xl border space-y-2 text-xs ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <p className="font-bold text-blue-400">Conceitos Fundamentais:</p>
                    {selectedQuestionAISolution?.concepts ? (
                      <ul className="list-disc list-inside space-y-1 text-slate-300">
                        {selectedQuestionAISolution.concepts.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-400">Tópico: {selectedQuestion.topic} ({selectedQuestion.subtopic})</p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-20 text-center space-y-2">
              <HelpCircle className="w-8 h-8 mx-auto text-slate-500/50" />
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Selecione uma questão ao lado para visualizar a resolução.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 6. MODAL DE UPLOAD / CADASTRO DE PROVA */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-3xl border p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200 ${
              isDark ? 'bg-[#0B1528] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0056D2] text-white flex items-center justify-center">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold">Adicionar Prova ao Banco</h3>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Título da Prova / Concurso</label>
                <input
                  type="text"
                  placeholder="Ex: CFO CBMERJ 2025 - 1º Dia"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className={`w-full px-3.5 py-2.5 text-xs rounded-xl border outline-none ${
                    isDark ? 'bg-[#111218] border-slate-800 text-slate-100 focus:border-[#0056D2]' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-[#0056D2]'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Banca Examinadora</label>
                  <select
                    value={uploadInstitution}
                    onChange={(e) => setUploadInstitution(e.target.value)}
                    className={`w-full px-3.5 py-2.5 text-xs rounded-xl border outline-none ${
                      isDark ? 'bg-[#111218] border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="FUNRIO">FUNRIO</option>
                    <option value="VUNESP">VUNESP</option>
                    <option value="FGV">FGV</option>
                    <option value="CESPE / Cebraspe">CESPE / Cebraspe</option>
                    <option value="IDECAN">IDECAN</option>
                    <option value="IBADE">IBADE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Ano da Prova</label>
                  <input
                    type="number"
                    value={uploadYear}
                    onChange={(e) => setUploadYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                    className={`w-full px-3.5 py-2.5 text-xs rounded-xl border outline-none ${
                      isDark ? 'bg-[#111218] border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {selectedFile ? (
                <div className={`p-3.5 rounded-xl border flex items-center justify-between ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                    <span className="text-xs font-bold truncate">{selectedFile.name}</span>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-xs text-rose-400 hover:underline cursor-pointer"
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-4 rounded-xl border-2 border-dashed text-center cursor-pointer ${
                    isDark ? 'border-slate-800 hover:border-slate-700 bg-[#111218]' : 'border-slate-300 hover:border-slate-400 bg-slate-50'
                  }`}
                >
                  <UploadCloud className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                  <p className="text-xs font-semibold">Selecione o arquivo PDF ou foto da prova</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Até 20MB</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/60">
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isDark ? 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                Cancelar
              </button>
              <button
                disabled={isUploading}
                onClick={() => handleProcessUpload()}
                className="px-4 py-2 rounded-xl bg-[#0056D2] hover:bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-950/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Extraindo questões...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Cadastrar & Extrair com IA</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {zoomedImage && (
        <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}>
          <button type="button" onClick={() => setZoomedImage(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#0B1528] border border-slate-700 text-slate-200 flex items-center justify-center cursor-pointer" aria-label="Fechar imagem ampliada"><X className="w-5 h-5" /></button>
          <img src={zoomedImage} alt="Imagem ampliada da prova" className="max-w-full max-h-[92vh] object-contain rounded-xl" onClick={(event) => event.stopPropagation()} />
        </div>
      )}

      {/* Modal de Revisão e Ajuste de Recorte Original */}
      {selectedPaper && (
        <QuestionCropReviewModal
          isOpen={isCropModalOpen}
          onClose={() => setIsCropModalOpen(false)}
          theme={theme}
          paperId={selectedPaper.id}
          question={selectedQuestion}
          onCropSaved={() => {
            if (selectedPaperId) {
              fetchQuestionsForPaper(selectedPaperId, true);
            }
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};
