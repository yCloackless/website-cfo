import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  Clock,
  Search,
  ArrowUpDown,
  Filter,
  Eye,
  Download,
  Trash2,
  X,
  Loader2,
  Sparkles,
  Award,
  BookOpen,
  Calendar,
  Pencil,
  Check,
  Flame,
  Plus,
  RotateCcw,
  Maximize2
} from 'lucide-react';
import { AppTheme } from '../types';
import { apiFetch } from '../services/apiFetch';
import { PdfViewer } from './provas/PdfViewer';

export interface ExamPaper {
  id: string;
  title: string;
  institution: string;
  examYear: number;
  totalQuestions?: number;
  status: string;
  fileId?: string | null;
  createdAt: string;
  updatedAt?: string;
  metadataJson?: string | null;
}

interface ExamBankTabProps {
  theme: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type SortOption = 'name_asc' | 'name_desc' | 'year_desc' | 'year_asc' | 'recent';

const POPULAR_INSTITUTIONS = ['VUNESP', 'UERJ', 'FGV', 'CFO CBMERJ', 'CEPERJ', 'IBADE', 'IFRJ', 'ENEM'];

function getAuthToken(): string | null {
  return localStorage.getItem('cfo_terminal_session') || localStorage.getItem('cfo_terminal_token') || null;
}

export const ExamBankTab: React.FC<ExamBankTabProps> = ({ theme, showToast }) => {
  const isDark = theme === 'dark';

  // Lista de provas
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros e Ordenação
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [selectedInstitution, setSelectedInstitution] = useState<string>('Todas');
  const [selectedYear, setSelectedYear] = useState<string>('Todos');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending'>('all');

  // Modal de Upload
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadInstitution, setUploadInstitution] = useState('VUNESP');
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear());
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Modal de Edição de Nome / Ano
  const [editingPaper, setEditingPaper] = useState<ExamPaper | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editYear, setEditYear] = useState(new Date().getFullYear());
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Modal de Exclusão
  const [deletingPaper, setDeletingPaper] = useState<ExamPaper | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Visualizador de PDF Embutido
  const [viewingPaper, setViewingPaper] = useState<ExamPaper | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Detecta se a URL atual aponta para uma prova específica: /banco-de-provas/:id ou ?prova=:id
  const routeExamId = useMemo(() => {
    const pathMatch = location.pathname.match(/^\/banco-de-provas\/([a-zA-Z0-9_-]+)/);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
    const params = new URLSearchParams(location.search);
    return params.get('prova') || params.get('id') || null;
  }, [location.pathname, location.search]);

  // Carrega as provas do backend com apiFetch
  const fetchPapers = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/exams?limit=100');
      if (res.ok) {
        const data = await res.json();
        setPapers(data.papers || []);
      } else {
        showToast?.('Não foi possível carregar as provas.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao buscar provas.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, []);

  // Sincronização automática com a URL: se a rota possuir ID (ex: F5 ou link direto), abre o leitor
  useEffect(() => {
    if (!routeExamId) {
      if (viewingPaper && !location.pathname.startsWith('/banco-de-provas/')) {
        setViewingPaper(null);
      }
      return;
    }

    if (viewingPaper?.id === routeExamId) return;

    // Busca na lista local primeiro
    const localPaper = papers.find((p) => p.id === routeExamId);
    if (localPaper) {
      setViewingPaper(localPaper);
      return;
    }

    // Se não estiver na lista local (ex: refresh ou acesso direto por URL), busca os dados na API
    let isMounted = true;
    const fetchDirect = async () => {
      try {
        const res = await apiFetch(`/api/exams/${routeExamId}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.paper) {
            setViewingPaper(data.paper);
          }
        }
      } catch (err) {
        console.warn('[Direct Exam Route Fetch Error]:', err);
      }
    };
    fetchDirect();

    return () => {
      isMounted = false;
    };
  }, [routeExamId, papers, viewingPaper, location.pathname]);

  // Helper para verificar se a prova foi marcada como concluída/resolvida
  const isPaperCompleted = (paper: ExamPaper): boolean => {
    if (!paper.metadataJson) return false;
    try {
      const meta = JSON.parse(paper.metadataJson);
      return Boolean(meta?.completed);
    } catch {
      return false;
    }
  };

  // Alterna status de concluída da prova
  const togglePaperCompleted = async (paper: ExamPaper, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      let currentMeta: Record<string, any> = {};
      try {
        if (paper.metadataJson) currentMeta = JSON.parse(paper.metadataJson);
      } catch {}

      const newCompleted = !currentMeta.completed;
      const updatedMeta = { ...currentMeta, completed: newCompleted, completedAt: newCompleted ? new Date().toISOString() : null };

      const res = await apiFetch(`/api/exams/${paper.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: updatedMeta }),
      });

      if (res.ok) {
        setPapers((prev) =>
          prev.map((p) => (p.id === paper.id ? { ...p, metadataJson: JSON.stringify(updatedMeta) } : p))
        );
        showToast?.(
          newCompleted ? `"${paper.title}" marcada como concluída!` : `"${paper.title}" marcada como pendente.`,
          'success'
        );
      }
    } catch {
      showToast?.('Erro ao atualizar status da prova.', 'error');
    }
  };

  // Upload da Prova
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectUploadFile(e.dataTransfer.files[0]);
    }
  };

  const selectUploadFile = (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast?.('Por favor, selecione um arquivo em formato PDF.', 'warning');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast?.('O arquivo excede o limite de 50 MB.', 'warning');
      return;
    }
    setUploadFile(file);
    if (!uploadTitle.trim()) {
      // Sugere título limpo a partir do nome do arquivo
      const cleanName = file.name
        .replace(/\.pdf$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      setUploadTitle(cleanName);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim()) {
      showToast?.('Informe o nome da prova.', 'warning');
      return;
    }
    if (!uploadFile) {
      showToast?.('Selecione o arquivo PDF da prova.', 'warning');
      return;
    }

    try {
      setIsUploading(true);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });

      const res = await apiFetch('/api/exams/upload-and-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: uploadTitle.trim(),
          institution: uploadInstitution.trim() || 'Banca Examinadora',
          examYear: Number(uploadYear) || new Date().getFullYear(),
          fileName: uploadFile.name,
          declaredMime: 'application/pdf',
          contentBase64: base64,
        }),
      });

      if (res.ok) {
        showToast?.('Prova adicionada com sucesso ao acervo!', 'success');
        setIsUploadModalOpen(false);
        setUploadTitle('');
        setUploadFile(null);
        fetchPapers();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast?.(data.message || 'Falha ao salvar a prova.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao enviar o arquivo.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Edição de Prova
  const handleSaveEdit = async () => {
    if (!editingPaper || !editTitle.trim()) return;
    try {
      setIsSavingEdit(true);
      const res = await apiFetch(`/api/exams/${editingPaper.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          institution: editInstitution.trim() || 'Banca',
          examYear: Number(editYear),
        }),
      });

      if (res.ok) {
        showToast?.('Prova atualizada com sucesso.', 'success');
        setPapers((prev) =>
          prev.map((p) =>
            p.id === editingPaper.id
              ? { ...p, title: editTitle.trim(), institution: editInstitution.trim(), examYear: Number(editYear) }
              : p
          )
        );
        setEditingPaper(null);
      } else {
        showToast?.('Falha ao atualizar a prova.', 'error');
      }
    } catch {
      showToast?.('Erro ao salvar alterações.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Exclusão de Prova
  const handleDeleteConfirm = async () => {
    if (!deletingPaper) return;
    try {
      setIsDeleting(true);
      const res = await apiFetch(`/api/exams/${deletingPaper.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast?.('Prova removida do acervo.', 'success');
        setPapers((prev) => prev.filter((p) => p.id !== deletingPaper.id));
        setDeletingPaper(null);
        if (viewingPaper?.id === deletingPaper.id) {
          closePdfViewer();
        }
      } else {
        showToast?.('Não foi possível excluir a prova.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao excluir prova.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Abertura do Leitor de PDF Nativo e Navegação na URL
  const handleOpenPdf = (paper: ExamPaper) => {
    if (!paper.fileId) {
      showToast?.('Esta prova não possui arquivo PDF anexado.', 'warning');
      return;
    }
    setViewingPaper(paper);
    navigate(`/banco-de-provas/${paper.id}`);
  };

  const closePdfViewer = () => {
    setViewingPaper(null);
    navigate('/banco-de-provas');
  };

  // Download Seguro do PDF Original
  const handleDownloadPdf = async (paper: ExamPaper, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!paper.fileId) {
      showToast?.('Arquivo não disponível para download.', 'warning');
      return;
    }
    try {
      const res = await apiFetch(`/api/exams/${paper.id}/pdf`);
      if (!res.ok) throw new Error('Download falhou');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paper.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${paper.examYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      showToast?.('Download iniciado com sucesso.', 'info');
    } catch {
      showToast?.('Erro ao baixar arquivo da prova.', 'error');
    }
  };

  // Filtragem e Ordenação
  const availableInstitutions = useMemo(() => {
    const list = Array.from(new Set(papers.map((p) => p.institution).filter(Boolean)));
    return ['Todas', ...list.sort()];
  }, [papers]);

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(papers.map((p) => p.examYear).filter(Boolean)));
    return ['Todos', ...years.sort((a, b) => b - a).map(String)];
  }, [papers]);

  const filteredAndSortedPapers = useMemo(() => {
    return papers
      .filter((p) => {
        // Busca por texto
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.institution.toLowerCase().includes(q) ||
          String(p.examYear).includes(q);

        // Filtro por Instituição / Banca
        const matchesInst = selectedInstitution === 'Todas' || p.institution.toLowerCase() === selectedInstitution.toLowerCase();

        // Filtro por Ano
        const matchesYear = selectedYear === 'Todos' || String(p.examYear) === selectedYear;

        // Filtro por Status
        const completed = isPaperCompleted(p);
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'completed' && completed) ||
          (statusFilter === 'pending' && !completed);

        return matchesQuery && matchesInst && matchesYear && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'name_asc') {
          return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
        }
        if (sortBy === 'name_desc') {
          return b.title.localeCompare(a.title, 'pt-BR', { sensitivity: 'base' });
        }
        if (sortBy === 'year_desc') {
          return (b.examYear || 0) - (a.examYear || 0);
        }
        if (sortBy === 'year_asc') {
          return (a.examYear || 0) - (b.examYear || 0);
        }
        // recent
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [papers, searchQuery, selectedInstitution, selectedYear, statusFilter, sortBy]);

  // Estatísticas do Acervo
  const stats = useMemo(() => {
    const total = papers.length;
    const completedCount = papers.filter(isPaperCompleted).length;
    const institutionsCount = new Set(papers.map((p) => p.institution)).size;
    const yearsCount = new Set(papers.map((p) => p.examYear)).size;
    const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    return { total, completedCount, institutionsCount, yearsCount, percent };
  }, [papers]);

  return (
    <div className={`min-h-screen pb-16 ${isDark ? 'bg-[#0b0f17] text-gray-100' : 'bg-slate-50 text-gray-900'}`}>
      {/* HERO BANNER REVOLUCIONÁRIO COM GRADIENTE CFO CBMERJ */}
      <div className="relative overflow-hidden border-b border-rose-500/20 bg-gradient-to-r from-red-950/60 via-amber-950/40 to-slate-950 px-4 py-10 sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-rose-600/5 to-transparent pointer-events-none" />
        
        <div className="relative max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-gradient-to-r from-rose-500/20 to-amber-500/20 border border-rose-500/30 text-rose-300">
                <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Acervo Tático de Provas</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-white via-rose-100 to-amber-200 bg-clip-text text-transparent">
                  Banco de Provas Anteriores
                </span>
              </h1>
              <p className="text-sm sm:text-base text-gray-400 max-w-2xl">
                Deposite aqui as provas completas para o CFO CBMERJ e principais vestibulares. Organize por nome, filtre por banca e abra o PDF diretamente para simular o dia da prova.
              </p>
            </div>

            {/* Ação de Adicionar Prova */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setUploadTitle('');
                  setUploadFile(null);
                  setIsUploadModalOpen(true);
                }}
                className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm text-white shadow-lg shadow-rose-600/20 bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Nova Prova</span>
              </button>
            </div>
          </div>

          {/* Cards de Métricas em Destaque */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-8">
            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
                <BookOpen className="w-4 h-4" />
                <span>Total de Provas</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black mt-2 text-white">{stats.total}</div>
              <span className="text-[11px] text-gray-400">cadastradas no acervo</span>
            </div>

            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <Award className="w-4 h-4" />
                <span>Bancas Cobertas</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black mt-2 text-white">{stats.institutionsCount}</div>
              <span className="text-[11px] text-gray-400">VUNESP, UERJ, FGV...</span>
            </div>

            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-semibold text-orange-300">
                <Calendar className="w-4 h-4" />
                <span>Anos de Edição</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black mt-2 text-white">{stats.yearsCount}</div>
              <span className="text-[11px] text-gray-400">histórico completo</span>
            </div>

            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                <span>Provas Resolvidas</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black mt-2 text-white">
                {stats.completedCount} <span className="text-xs font-normal text-gray-400">({stats.percent}%)</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${stats.percent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ÁREA DE CONTROLES E LISTA DE PROVAS */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-8 space-y-6">
        {/* BARRA DE PESQUISA, FILTROS E ORDENAÇÃO */}
        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#111722]/80 border-white/10' : 'bg-white border-slate-200 shadow-sm'} backdrop-blur-md`}>
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
            {/* Campo de Busca por Nome */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar prova por nome (ex.: CFO CBMERJ 2024, UERJ 2023...)"
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border outline-none transition-all ${
                  isDark
                    ? 'bg-[#080d14] border-white/10 text-white placeholder-gray-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                    : 'bg-slate-50 border-slate-300 text-gray-900 placeholder-gray-400 focus:border-rose-600 focus:ring-1 focus:ring-rose-600'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Ordenação por Nome / Ano */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                <ArrowUpDown className="w-3.5 h-3.5 text-rose-400" />
                <span>Organizar:</span>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border outline-none cursor-pointer ${
                  isDark ? 'bg-[#080d14] border-white/10 text-gray-200' : 'bg-slate-50 border-slate-300 text-gray-800'
                }`}
              >
                <option value="name_asc">Nome (A → Z)</option>
                <option value="name_desc">Nome (Z → A)</option>
                <option value="year_desc">Ano (Mais recente)</option>
                <option value="year_asc">Ano (Mais antigo)</option>
                <option value="recent">Recém-adicionadas</option>
              </select>

              {/* Filtro por Ano */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border outline-none cursor-pointer ${
                  isDark ? 'bg-[#080d14] border-white/10 text-gray-200' : 'bg-slate-50 border-slate-300 text-gray-800'
                }`}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y === 'Todos' ? 'Todos os Anos' : `Ano ${y}`}
                  </option>
                ))}
              </select>

              {/* Filtro de Conclusão */}
              <div className="inline-flex rounded-xl p-0.5 border border-white/10 bg-black/20 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
                    statusFilter === 'all' ? 'bg-rose-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
                    statusFilter === 'pending' ? 'bg-rose-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Pendentes
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('completed')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
                    statusFilter === 'completed' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Resolvidas
                </button>
              </div>
            </div>
          </div>

          {/* Chips de Bancas / Instituições */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">
              Bancas:
            </span>
            {availableInstitutions.map((inst) => {
              const isSelected = selectedInstitution.toLowerCase() === inst.toLowerCase();
              return (
                <button
                  type="button"
                  key={inst}
                  onClick={() => setSelectedInstitution(inst)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-sm shadow-rose-500/30'
                      : isDark
                      ? 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                      : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                  }`}
                >
                  {inst}
                </button>
              );
            })}
          </div>
        </div>

        {/* LISTAGEM DE PROVAS EM CARDS DE ALTA DEFINIÇÃO */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
            <span className="text-sm font-semibold text-gray-400">Carregando acervo de provas...</span>
          </div>
        ) : filteredAndSortedPapers.length === 0 ? (
          <div className={`py-20 px-6 rounded-2xl border text-center ${isDark ? 'border-white/10 bg-[#111722]/50' : 'border-slate-200 bg-white'}`}>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Nenhuma prova encontrada</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
              {searchQuery || selectedInstitution !== 'Todas' || selectedYear !== 'Todos'
                ? 'Nenhum resultado corresponde aos filtros selecionados. Tente limpar os filtros de busca.'
                : 'Seu acervo de provas anteriores ainda está vazio. Adicione sua primeira prova em PDF com 1 clique!'}
            </p>
            {searchQuery || selectedInstitution !== 'Todas' || selectedYear !== 'Todos' ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedInstitution('Todas');
                  setSelectedYear('Todos');
                  setStatusFilter('all');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-white/20 hover:bg-white/5 transition-all text-gray-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar Filtros</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-lg hover:brightness-110"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Primeira Prova</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredAndSortedPapers.map((paper) => {
              const completed = isPaperCompleted(paper);
              return (
                <div
                  key={paper.id}
                  className={`group relative rounded-2xl border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden flex flex-col justify-between ${
                    isDark
                      ? completed
                        ? 'bg-[#111c1d]/90 border-emerald-500/30 hover:border-emerald-500/50'
                        : 'bg-[#111722]/80 border-white/10 hover:border-rose-500/40 hover:shadow-rose-950/20'
                      : completed
                      ? 'bg-emerald-50/50 border-emerald-300'
                      : 'bg-white border-slate-200 shadow-sm hover:border-rose-400'
                  }`}
                >
                  {/* Topo do Card: Badges e Status */}
                  <div className="p-5 pb-3">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      {/* Badge do Ano com Gradiente Metálico */}
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase bg-gradient-to-r from-amber-500/20 to-rose-500/20 border border-amber-500/30 text-amber-300">
                        {paper.examYear}
                      </span>

                      {/* Tag da Banca */}
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        isDark ? 'bg-white/5 text-gray-300' : 'bg-slate-100 text-gray-700'
                      }`}>
                        {paper.institution}
                      </span>

                      {/* Botão de Concluída / Resolvida */}
                      <button
                        type="button"
                        onClick={(e) => togglePaperCompleted(paper, e)}
                        title={completed ? 'Prova já resolvida (clique para desmarcar)' : 'Marcar como resolvida'}
                        className={`ml-auto p-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                          completed
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                      >
                        <CheckCircle2 className={`w-4 h-4 ${completed ? 'text-emerald-400' : 'text-gray-500'}`} />
                        <span className="text-[11px]">{completed ? 'Resolvida' : 'Pendente'}</span>
                      </button>
                    </div>

                    {/* Nome da Prova */}
                    <h3 className="text-base font-extrabold line-clamp-2 leading-snug group-hover:text-rose-400 transition-colors">
                      {paper.title}
                    </h3>

                    <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-500" />
                        {new Date(paper.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                      {paper.fileId && (
                        <span className="inline-flex items-center gap-1 text-rose-400/90 font-medium">
                          <FileText className="w-3 h-3" />
                          PDF Pronto
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Barra de Ações Rápidas no Rodapé do Card */}
                  <div className={`px-5 py-3.5 border-t flex items-center justify-between gap-2 ${
                    isDark ? 'border-white/5 bg-black/20' : 'border-slate-100 bg-slate-50'
                  }`}>
                    <div className="flex items-center gap-2">
                      {/* Abrir Visualizador de PDF */}
                      <button
                        type="button"
                        onClick={() => handleOpenPdf(paper)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 shadow-sm transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Abrir Prova</span>
                      </button>

                      {/* Download do PDF */}
                      <button
                        type="button"
                        onClick={(e) => handleDownloadPdf(paper, e)}
                        title="Baixar PDF Original"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Renomear / Editar Prova */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPaper(paper);
                          setEditTitle(paper.title);
                          setEditInstitution(paper.institution);
                          setEditYear(paper.examYear);
                        }}
                        title="Editar nome ou ano da prova"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {/* Excluir Prova */}
                      <button
                        type="button"
                        onClick={() => setDeletingPaper(paper)}
                        title="Remover prova do acervo"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE UPLOAD DE NOVA PROVA (SIMPLES E DIRETO) */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div
            className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden ${
              isDark ? 'bg-[#0e1420] border-white/10 text-white' : 'bg-white border-slate-200 text-gray-900'
            }`}
          >
            {/* Cabeçalho do Modal com Gradiente */}
            <div className="p-6 pb-4 border-b border-white/10 bg-gradient-to-r from-rose-950/40 to-amber-950/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-amber-600 flex items-center justify-center text-white shadow-md">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold leading-tight">Adicionar Prova ao Acervo</h3>
                  <p className="text-xs text-gray-400">Insira o PDF completo e organize por nome e banca</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              {/* Zona de Arraste de Arquivo PDF */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Arquivo PDF da Prova *
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-6 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-all ${
                    dragActive
                      ? 'border-rose-500 bg-rose-500/10'
                      : uploadFile
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : isDark
                      ? 'border-white/10 bg-[#080d14] hover:border-white/20'
                      : 'border-slate-300 bg-slate-50 hover:border-slate-400'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => e.target.files?.[0] && selectUploadFile(e.target.files[0])}
                    className="hidden"
                  />
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText className="w-8 h-8 text-emerald-400" />
                      <div className="text-left">
                        <div className="text-sm font-bold text-emerald-400 line-clamp-1">{uploadFile.name}</div>
                        <div className="text-xs text-gray-400">{(uploadFile.size / (1024 * 1024)).toFixed(2)} MB · PDF pronto</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <UploadCloud className="w-8 h-8 mx-auto text-rose-400 mb-2" />
                      <div className="text-sm font-bold text-gray-200">Arraste seu PDF aqui ou clique para buscar</div>
                      <div className="text-xs text-gray-400">PDFs completos de até 50 MB</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Nome da Prova */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Nome da Prova *
                </label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Ex.: CFO CBMERJ 2024 - Oficial Bombeiro Militar"
                  className={`w-full px-4 py-2.5 rounded-xl text-sm border outline-none ${
                    isDark ? 'bg-[#080d14] border-white/10 text-white focus:border-rose-500' : 'bg-slate-50 border-slate-300 text-gray-900'
                  }`}
                />
              </div>

              {/* Banca Organizadora com Chips Rápidos */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Banca / Instituição
                </label>
                <input
                  type="text"
                  value={uploadInstitution}
                  onChange={(e) => setUploadInstitution(e.target.value)}
                  placeholder="Ex.: VUNESP, UERJ, FGV, CEPERJ..."
                  className={`w-full px-4 py-2 rounded-xl text-sm border outline-none mb-2 ${
                    isDark ? 'bg-[#080d14] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-gray-900'
                  }`}
                />
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_INSTITUTIONS.map((inst) => (
                    <button
                      type="button"
                      key={inst}
                      onClick={() => setUploadInstitution(inst)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        uploadInstitution === inst
                          ? 'bg-rose-600 text-white'
                          : isDark
                          ? 'bg-white/5 text-gray-400 hover:bg-white/10'
                          : 'bg-slate-100 text-gray-700'
                      }`}
                    >
                      {inst}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ano da Prova */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Ano da Prova
                </label>
                <input
                  type="number"
                  min="1990"
                  max={new Date().getFullYear() + 1}
                  value={uploadYear}
                  onChange={(e) => setUploadYear(Number(e.target.value))}
                  className={`w-full px-4 py-2 rounded-xl text-sm border outline-none ${
                    isDark ? 'bg-[#080d14] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-gray-900'
                  }`}
                />
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={isUploading}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:brightness-110 shadow-lg disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando no Acervo...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Prova</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE PROVA (RENOMEAR) */}
      {editingPaper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-4 ${
            isDark ? 'bg-[#0e1420] border-white/10 text-white' : 'bg-white border-slate-200 text-gray-900'
          }`}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold">Editar Dados da Prova</h3>
              <button
                type="button"
                onClick={() => setEditingPaper(null)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Nome da Prova</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-sm border outline-none ${
                    isDark ? 'bg-[#080d14] border-white/10 text-white' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Banca Organizadora</label>
                <input
                  type="text"
                  value={editInstitution}
                  onChange={(e) => setEditInstitution(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-sm border outline-none ${
                    isDark ? 'bg-[#080d14] border-white/10 text-white' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Ano</label>
                <input
                  type="number"
                  value={editYear}
                  onChange={(e) => setEditYear(Number(e.target.value))}
                  className={`w-full px-3 py-2 rounded-xl text-sm border outline-none ${
                    isDark ? 'bg-[#080d14] border-white/10 text-white' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditingPaper(null)}
                className="px-3 py-2 text-xs font-bold text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit || !editTitle.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {deletingPaper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-sm rounded-3xl border shadow-2xl p-6 text-center space-y-4 ${
            isDark ? 'bg-[#0e1420] border-white/10 text-white' : 'bg-white border-slate-200 text-gray-900'
          }`}>
            <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold">Excluir Prova?</h3>
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                Tem certeza que deseja remover <strong>"{deletingPaper.title}"</strong> do seu acervo?
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPaper(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VISUALIZADOR DE PDF NATIVO EM TELA CHEIA / MODAL IMERSIVO */}
      {viewingPaper && (
        <PdfViewer
          pdfUrl={viewingPaper.fileId ? `/api/exams/${viewingPaper.id}/pdf` : ''}
          title={viewingPaper.title}
          institution={viewingPaper.institution}
          examYear={viewingPaper.examYear}
          theme={theme}
          onClose={closePdfViewer}
          onDownload={() => handleDownloadPdf(viewingPaper)}
        />
      )}
    </div>
  );
};
