import { apiFetch } from '../services/apiFetch';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Layers,
  Sparkles,
  PlusCircle,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Flame,
  Trash2,
  BookOpen,
  ArrowLeft,
  Search,
  Check,
  X,
  Upload,
  Edit3,
  FolderPlus,
  Folder,
  Zap,
  ChevronRight,
  BrainCircuit,
  Settings,
  RefreshCw,
  FileSpreadsheet,
  Shuffle,
  BarChart3,
  Calendar,
  Award,
  BookMarked,
  Share2,
  HelpCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { AppTheme } from '../types';
import { ClozeLatexCard } from './flashcards/ClozeLatexCard';

export interface SubjectWithStats {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
  deckCount: number;
  cardCount: number;
  dueCount: number;
}

export interface DeckWithStats {
  id: string;
  userId: string;
  subjectId: string;
  subjectName?: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  cardCount: number;
  dueCount: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  masteredCount: number;
}

export interface Flashcard {
  id: string;
  userId: string;
  subjectId: string;
  deckId: string;
  front: string;
  back: string;
  frontImage?: string | null;
  backImage?: string | null;
  lastReviewedAt?: string | null;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  reviewCount: number;
  lapses: number;
  status: 'new' | 'learning' | 'review' | 'mastered';
  createdAt: string;
  updatedAt: string;
}

export type Deck = DeckWithStats;
export type Subject = SubjectWithStats;

interface ErrorNotebookTabProps {
  theme?: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Matérias Oficiais do Concurso CFO CBMERJ
const OFFICIAL_CBMERJ_SUBJECTS = [
  { name: 'Matemática', topics: ['Análise Combinatória', 'Probabilidade', 'Geometria Espacial', 'Funções e Gráficos', 'Trigonometria'] },
  { name: 'Física', topics: ['Termodinâmica e Calor', 'Eletrodinâmica', 'Óptica Geométrica', 'Cinemática Vetorial', 'Ondulatória'] },
  { name: 'Química', topics: ['Estequiometria', 'Termoquímica', 'Equilíbrio Químico', 'Funções Orgânicas', 'Cinética Química'] },
  { name: 'Biologia', topics: ['Citologia e Membrana', 'Genética Mendeliana', 'Ecologia e Biomas', 'Fisiologia Humana', 'Evolução'] },
  { name: 'Português', topics: ['Sintaxe de Concordância', 'Crase e Regência', 'Interpretação de Texto', 'Figuras de Linguagem', 'Coesão'] },
  { name: 'História', topics: ['Brasil Colônia', 'Era Vargas', 'Ditadura Militar', 'Revolução Francesa', 'Primeira República'] },
  { name: 'Geografia', topics: ['Geopolítica Mundial', 'Urbanização Brasileira', 'Climatologia', 'Cartografia', 'Agronegócio'] },
  { name: 'Inglês', topics: ['Reading Comprehension', 'Modal Verbs', 'Conditionals', 'Vocabulary & Phrasal Verbs', 'Connectors'] },
];

export const ErrorNotebookTab: React.FC<ErrorNotebookTabProps> = ({
  theme = 'dark',
  showToast,
}) => {
  const isDark = theme === 'dark';

  // Navegação: 'anki_main' (Tabela Geral de Baralhos) | 'subject_detail' (Matéria com IA topo + cards baixo) | 'stats' (Estatísticas e Heatmap)
  const [viewMode, setViewMode] = useState<'anki_main' | 'subject_detail' | 'stats'>('anki_main');
  const [activeNavTab, setActiveNavTab] = useState<'decks' | 'add' | 'stats' | 'sync'>('decks');

  // Matéria e Baralho selecionados
  const [currentSubject, setCurrentSubject] = useState<SubjectWithStats | null>(null);
  const [currentDeck, setCurrentDeck] = useState<DeckWithStats | null>(null);

  // Dados do Servidor
  const [subjects, setSubjects] = useState<SubjectWithStats[]>([]);
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [forecastStats, setForecastStats] = useState<{
    dueToday: number;
    dueTomorrow: number;
    dueNext7Days: number;
    dueNext30Days: number;
    leechCount: number;
    totalMastered: number;
  } | null>(null);
  const [heatmapStats, setHeatmapStats] = useState<Array<{ date: string; count: number }>>([]);

  // Estados de Carregamento
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);

  // Busca e Filtros
  const [searchQuery, setSearchQuery] = useState('');

  // 🎮 ESTADO DO RESOLVEDOR DE FLASHCARDS (EMBAIXO NA MATÉRIA)
  const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [randomSeed, setRandomSeed] = useState(1);

  // ⚡ GERADOR DE +20 CARDS POR IA (EM CIMA NA MATÉRIA)
  const [aiTopicInput, setAiTopicInput] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // Modais de Criação e Edição
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectWithStats | null>(null);
  const [subjectFormName, setSubjectFormName] = useState('');
  const [subjectFormDesc, setSubjectFormDesc] = useState('');

  const [isDeckModalOpen, setIsDeckModalOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<DeckWithStats | null>(null);
  const [deckFormName, setDeckFormName] = useState('');
  const [deckFormDesc, setDeckFormDesc] = useState('');
  const [deckFormSubjectId, setDeckFormSubjectId] = useState('');

  // Modal Anki Adicionar Flashcard
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [cardFormSubjectId, setCardFormSubjectId] = useState('');
  const [cardFormDeckId, setCardFormDeckId] = useState('');
  const [cardFormFront, setCardFormFront] = useState('');
  const [cardFormBack, setCardFormBack] = useState('');
  const [cardFormTags, setCardFormTags] = useState('');
  const [cardFormNewSubjectName, setCardFormNewSubjectName] = useState('');
  const [cardFormNewDeckName, setCardFormNewDeckName] = useState('');
  const [isSavingCard, setIsSavingCard] = useState(false);

  // Modal de Exclusão
  const [deleteModal, setDeleteModal] = useState<{
    type: 'subject' | 'deck' | 'card';
    id: string;
    title: string;
  } | null>(null);

  // Modal Importação em Lote
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchInputText, setBatchInputText] = useState('');
  const [batchImporting, setBatchImporting] = useState(false);

  // =========================================================================
  // 📡 SINCRONIZAÇÃO DE DADOS COM O BACKEND
  // =========================================================================

  const fetchGlobalData = useCallback(async (isManualSync = false) => {
    try {
      if (isManualSync) setIsSyncing(true);
      else setLoading(true);

      const [subjectsRes, statsRes, forecastRes, heatmapRes] = await Promise.all([
        apiFetch('/api/flashcards/subjects'),
        apiFetch('/api/flashcards/stats'),
        apiFetch('/api/flashcards/stats/forecast'),
        apiFetch('/api/flashcards/stats/heatmap?days=30'),
      ]);

      if (subjectsRes.ok) {
        const data = await subjectsRes.json();
        setSubjects(data.subjects || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setGlobalStats(data.stats || null);
      }
      if (forecastRes.ok) {
        const fData = await forecastRes.json();
        setForecastStats(fData.forecast || null);
      }
      if (heatmapRes.ok) {
        const hData = await heatmapRes.json();
        setHeatmapStats(hData.heatmap || []);
      }

      if (isManualSync) {
        showToast?.('Baralhos e flashcards sincronizados!', 'success');
      }
    } catch {
      showToast?.('Erro ao carregar dados do Anki com o servidor.', 'error');
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchGlobalData();
  }, [fetchGlobalData]);

  // Carrega cartões da matéria e alimenta a fila de resolução aleatória
  const loadCardsForSubject = useCallback(async (subjectId: string) => {
    try {
      setLoadingCards(true);
      const res = await apiFetch(`/api/flashcards/cards?subjectId=${encodeURIComponent(subjectId)}&limit=200`);
      if (res.ok) {
        const data = await res.json();
        const loadedCards: Flashcard[] = data.cards || [];
        setCards(loadedCards);

        // Embaralha aleatoriamente para resolução
        const shuffled = [...loadedCards].sort(() => 0.5 - Math.random());
        setStudyQueue(shuffled);
        setCurrentCardIndex(0);
        setIsAnswerRevealed(false);
      }
    } catch {
      showToast?.('Erro ao carregar flashcards desta matéria.', 'error');
    } finally {
      setLoadingCards(false);
    }
  }, [showToast]);

  // Carrega baralhos de uma matéria
  const loadDecksForSubject = useCallback(async (subjectId: string) => {
    try {
      const res = await apiFetch(`/api/flashcards/decks?subjectId=${encodeURIComponent(subjectId)}`);
      if (res.ok) {
        const data = await res.json();
        setDecks(data.decks || []);
        if (data.decks && data.decks.length > 0) {
          setCurrentDeck(data.decks[0]);
        }
      }
    } catch {
      // Silencioso
    }
  }, []);

  // =========================================================================
  // 🧭 TRANSIÇÃO AO CLICAR EM UMA MATÉRIA
  // =========================================================================

  const handleOpenSubject = async (subjectName: string, existingSubject?: SubjectWithStats) => {
    let targetSubject = existingSubject;

    // Se a matéria ainda não foi criada no banco, provisiona transparentemente
    if (!targetSubject) {
      try {
        const createRes = await apiFetch('/api/flashcards/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: subjectName,
            description: `Matéria oficial do edital CFO CBMERJ: ${subjectName}`,
          }),
        });
        if (createRes.ok) {
          const createData = await createRes.json();
          targetSubject = createData.subject;
          void fetchGlobalData();
        }
      } catch {
        showToast?.('Erro ao abrir matéria.', 'error');
        return;
      }
    }

    if (!targetSubject) return;

    setCurrentSubject(targetSubject);
    setViewMode('subject_detail');
    setSearchQuery('');
    setAiTopicInput('');
    void loadDecksForSubject(targetSubject.id);
    void loadCardsForSubject(targetSubject.id);
  };

  const handleBackToAnkiMain = () => {
    setViewMode('anki_main');
    setCurrentSubject(null);
    setCurrentDeck(null);
    setIsAnswerRevealed(false);
    void fetchGlobalData();
  };

  // Re-embaralhar cartões aleatórios
  const handleShuffleQueue = () => {
    if (cards.length === 0) return;
    const shuffled = [...cards].sort(() => 0.5 - Math.random());
    setStudyQueue(shuffled);
    setCurrentCardIndex(0);
    setIsAnswerRevealed(false);
    setRandomSeed(prev => prev + 1);
    showToast?.('Flashcards embaralhados em ordem aleatória!', 'info');
  };

  // Revelar resposta do cartão ativo
  const handleRevealAnswer = () => {
    setIsAnswerRevealed(true);
  };

  // Avaliação Anki SM-2 (1: De novo, 2: Difícil, 3: Bom, 4: Fácil)
  const handleRateCard = async (rating: 1 | 2 | 3 | 4) => {
    const card = studyQueue[currentCardIndex];
    if (!card) return;

    try {
      const res = await apiFetch(`/api/flashcards/cards/${card.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });

      if (res.ok) {
        // Se errou (rating 1), reapresenta o cartão no fim da fila
        if (rating === 1) {
          setStudyQueue(prev => [...prev, card]);
        }

        // Avança para o próximo cartão
        if (currentCardIndex + 1 < studyQueue.length) {
          setCurrentCardIndex(prev => prev + 1);
          setIsAnswerRevealed(false);
        } else {
          // Concluiu a rodada
          showToast?.('Todos os flashcards da rodada foram resolvidos!', 'success');
          // Recarrega cartões para atualizar status e intervalos
          if (currentSubject) void loadCardsForSubject(currentSubject.id);
        }
      }
    } catch {
      showToast?.('Erro ao registrar resposta do flashcard.', 'error');
    }
  };

  // Atalhos de teclado (Espaço para mostrar resposta, 1-4 para avaliar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora se estiver digitando em input ou textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      if (viewMode === 'subject_detail' && studyQueue.length > 0) {
        if (e.code === 'Space') {
          e.preventDefault();
          if (!isAnswerRevealed) handleRevealAnswer();
        } else if (isAnswerRevealed) {
          if (e.key === '1') { e.preventDefault(); void handleRateCard(1); }
          else if (e.key === '2') { e.preventDefault(); void handleRateCard(2); }
          else if (e.key === '3') { e.preventDefault(); void handleRateCard(3); }
          else if (e.key === '4') { e.preventDefault(); void handleRateCard(4); }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, studyQueue, currentCardIndex, isAnswerRevealed]);

  // =========================================================================
  // ⚡ GERAÇÃO DE +20 FLASHCARDS POR IA (TOPO NA MATÉRIA)
  // =========================================================================

  const handleGenerate20CardsWithAi = async () => {
    if (!currentSubject) return;

    const topic = aiTopicInput.trim() || currentSubject.name;
    setIsAiGenerating(true);

    try {
      const response = await apiFetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectOrTopic: `${currentSubject.name}: ${topic}`,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.cards || data.cards.length === 0) {
        showToast?.(data.message || 'Falha ao gerar flashcards por IA.', 'error');
        return;
      }

      // Garante baralho de destino
      let targetDeck = currentDeck;
      if (!targetDeck) {
        const deckRes = await apiFetch('/api/flashcards/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjectId: currentSubject.id,
            name: topic.length > 40 ? topic.slice(0, 40) : topic,
            description: `Baralho gerado por IA para ${currentSubject.name}`,
          }),
        });
        if (deckRes.ok) {
          const deckData = await deckRes.json();
          targetDeck = deckData.deck;
          setCurrentDeck(targetDeck);
        }
      }

      if (!targetDeck) {
        showToast?.('Erro ao associar baralho aos cartões gerados.', 'error');
        return;
      }

      // Salva os 20 cards em lote no backend via endpoint batch
      const batchPayload = data.cards.map((c: any) => ({
        front: c.question,
        back: c.answer,
      }));

      const saveRes = await apiFetch(`/api/flashcards/decks/${targetDeck.id}/cards/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: batchPayload }),
      });

      if (saveRes.ok) {
        showToast?.(`⚡ +20 flashcards gerados com sucesso em ${currentSubject.name}!`, 'success');
        setAiTopicInput('');
        void loadCardsForSubject(currentSubject.id);
        void fetchGlobalData();
      } else {
        showToast?.('Erro ao salvar flashcards gerados.', 'error');
      }
    } catch {
      showToast?.('Erro de comunicação ao gerar flashcards com IA.', 'error');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // =========================================================================
  // 💾 CRUD DE FLASHCARDS / MATÉRIAS
  // =========================================================================

  const handleOpenAddCardModal = () => {
    setEditingCard(null);
    setCardFormFront('');
    setCardFormBack('');
    setCardFormTags('');
    setCardFormSubjectId(currentSubject?.id || (subjects[0]?.id || ''));
    setCardFormDeckId(currentDeck?.id || '');
    setIsAddCardModalOpen(true);
  };

  const handleOpenEditCard = (card: Flashcard) => {
    setEditingCard(card);
    setCardFormFront(card.front);
    setCardFormBack(card.back);
    setCardFormTags('');
    setCardFormSubjectId(card.subjectId);
    setCardFormDeckId(card.deckId);
    setIsAddCardModalOpen(true);
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardFormFront.trim() || !cardFormBack.trim()) {
      showToast?.('Preencha a Frente e o Verso do flashcard.', 'error');
      return;
    }

    setIsSavingCard(true);
    try {
      let targetSubId = cardFormSubjectId;
      if (targetSubId === '__new__' && cardFormNewSubjectName.trim()) {
        const subRes = await apiFetch('/api/flashcards/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cardFormNewSubjectName.trim() }),
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          targetSubId = subData.subject.id;
        }
      }

      let targetDeckId = cardFormDeckId;
      if (!targetDeckId || targetDeckId === '__new__') {
        const deckName = cardFormNewDeckName.trim() || 'Geral';
        const deckRes = await apiFetch('/api/flashcards/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId: targetSubId, name: deckName }),
        });
        if (deckRes.ok) {
          const deckData = await deckRes.json();
          targetDeckId = deckData.deck.id;
        }
      }

      if (editingCard) {
        const res = await apiFetch(`/api/flashcards/cards/${editingCard.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            front: cardFormFront.trim(),
            back: cardFormBack.trim(),
          }),
        });
        if (res.ok) {
          showToast?.('Flashcard atualizado com sucesso!', 'success');
          setIsAddCardModalOpen(false);
          if (currentSubject) void loadCardsForSubject(currentSubject.id);
        }
      } else {
        const res = await apiFetch('/api/flashcards/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deckId: targetDeckId,
            front: cardFormFront.trim(),
            back: cardFormBack.trim(),
          }),
        });
        if (res.ok) {
          showToast?.('Flashcard adicionado ao baralho!', 'success');
          setIsAddCardModalOpen(false);
          setCardFormFront('');
          setCardFormBack('');
          if (currentSubject) void loadCardsForSubject(currentSubject.id);
          void fetchGlobalData();
        }
      }
    } catch {
      showToast?.('Erro ao salvar flashcard.', 'error');
    } finally {
      setIsSavingCard(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      const res = await apiFetch(`/api/flashcards/cards/${cardId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast?.('Flashcard excluído.', 'info');
        if (currentSubject) void loadCardsForSubject(currentSubject.id);
        void fetchGlobalData();
      }
    } catch {
      showToast?.('Erro ao excluir cartão.', 'error');
    }
  };

  // Lista unificada das Matérias para a Tabela Anki Principal
  const ankiDeckRows = useMemo(() => {
    const map = new Map<string, { subject?: SubjectWithStats; name: string; newCount: number; learnCount: number; dueCount: number }>();

    // Insere matérias oficiais com contagens padrão 0
    OFFICIAL_CBMERJ_SUBJECTS.forEach((off) => {
      map.set(off.name.toLowerCase(), {
        name: off.name,
        newCount: 0,
        learnCount: 0,
        dueCount: 0,
      });
    });

    // Mescla dados reais do banco
    subjects.forEach((sub) => {
      const key = sub.name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.subject = sub;
        existing.dueCount = sub.dueCount || 0;
        existing.newCount = sub.cardCount - (sub.dueCount || 0) > 0 ? sub.cardCount - (sub.dueCount || 0) : 0;
      } else {
        map.set(key, {
          subject: sub,
          name: sub.name,
          newCount: sub.cardCount - (sub.dueCount || 0) > 0 ? sub.cardCount - (sub.dueCount || 0) : 0,
          learnCount: 0,
          dueCount: sub.dueCount || 0,
        });
      }
    });

    const rows = Array.from(map.values());
    if (!searchQuery.trim()) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(searchQuery.toLowerCase().trim()));
  }, [subjects, searchQuery]);

  const currentSubjectTopics = useMemo(() => {
    if (!currentSubject) return [];
    const found = OFFICIAL_CBMERJ_SUBJECTS.find(s => s.name.toLowerCase() === currentSubject.name.toLowerCase());
    return found ? found.topics : ['Conceitos Básicos', 'Fórmulas e Leis', 'Questões Clássicas', 'Pegadinhas de Prova'];
  }, [currentSubject]);

  // =========================================================================
  // 🎨 RENDERIZAÇÃO DA INTERFACE (ANKI AUTHENTIC & MINIMALISTA)
  // =========================================================================

  return (
    <div className={`min-h-screen py-4 px-3 sm:px-6 transition-colors font-sans ${isDark ? 'bg-[#18181b] text-zinc-100' : 'bg-[#f4f4f5] text-zinc-900'}`}>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ------------------------------------------------------------- */}
        {/* 🧭 NAVEGAÇÃO SUPERIOR ANKI (PRINT 3 & 5)                      */}
        {/* ------------------------------------------------------------- */}
        <div className="flex items-center justify-center border-b border-zinc-800/80 pb-3">
          <nav className="inline-flex items-center gap-1 sm:gap-2 p-1 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs font-semibold">
            <button
              onClick={() => { setActiveNavTab('decks'); handleBackToAnkiMain(); }}
              className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeNavTab === 'decks' && viewMode !== 'stats'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              Baralhos
            </button>
            <button
              onClick={() => { setActiveNavTab('add'); handleOpenAddCardModal(); }}
              className="px-3.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors cursor-pointer"
            >
              Adicionar
            </button>
            <button
              onClick={() => { setActiveNavTab('stats'); setViewMode('stats'); }}
              className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'stats'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              Estatísticas
            </button>
            <button
              onClick={() => void fetchGlobalData(true)}
              disabled={isSyncing}
              className="px-3.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Sincronizar com a nuvem"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-400' : ''}`} />
              <span>Sincronizar</span>
            </button>
          </nav>
        </div>

        {/* ============================================================= */}
        {/* 📊 PAINEL DE ESTATÍSTICAS E HEATMAP ANKI                       */}
        {/* ============================================================= */}
        {viewMode === 'stats' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h2 className="text-base font-bold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-sky-400" />
                <span>Estatísticas de Retenção & Repetição Espaçada</span>
              </h2>
              <button
                onClick={() => setViewMode('anki_main')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
              >
                ← Voltar aos Baralhos
              </button>
            </div>

            {forecastStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-400">Hoje</p>
                  <p className="text-xl font-bold text-sky-400 font-mono mt-1">{forecastStats.dueToday}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-400">Amanhã</p>
                  <p className="text-xl font-bold text-amber-400 font-mono mt-1">{forecastStats.dueTomorrow}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-400">Próximos 7 dias</p>
                  <p className="text-xl font-bold text-emerald-400 font-mono mt-1">{forecastStats.dueNext7Days}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-400">Próximos 30 dias</p>
                  <p className="text-xl font-bold text-indigo-400 font-mono mt-1">{forecastStats.dueNext30Days}</p>
                </div>
              </div>
            )}

            {/* Heatmap */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Constância de Estudo Diário (Últimos 30 Dias)</span>
                <span>{heatmapStats.reduce((acc, curr) => acc + curr.count, 0)} revisões registradas</span>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-zinc-950 border border-zinc-800/80">
                {Array.from({ length: 30 }).map((_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - (29 - i));
                  const dateStr = d.toISOString().split('T')[0];
                  const found = heatmapStats.find((h) => h.date === dateStr);
                  const count = found?.count || 0;
                  return (
                    <div
                      key={dateStr}
                      title={`${dateStr}: ${count} cartões revisados`}
                      className={`w-3.5 h-3.5 rounded-sm transition-all ${
                        count === 0
                          ? 'bg-zinc-800/60'
                          : count < 5
                          ? 'bg-emerald-600/60'
                          : count < 15
                          ? 'bg-emerald-500'
                          : 'bg-emerald-400 shadow-sm shadow-emerald-500/40'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* 📚 VISÃO 1: TABELA GERAL ANKI DE BARALHOS (PRINT 3)            */}
        {/* ============================================================= */}
        {viewMode === 'anki_main' && (
          <div className="space-y-4">
            {/* Gamification / Banner Superior Anki */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800/90 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                {/* User Level */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center font-bold font-mono text-sky-400">
                    1
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-100">Anki Starter</p>
                    <p className="text-[11px] text-zinc-400 font-mono">Cadete CBMERJ</p>
                  </div>
                </div>

                {/* Sequência */}
                <div className="border-t md:border-t-0 md:border-l border-zinc-800 pt-2 md:pt-0 md:pl-4">
                  <p className="text-[11px] font-semibold text-zinc-400">Sequência</p>
                  <p className="text-sm font-bold font-mono text-zinc-100 mt-0.5">0 Dias</p>
                </div>

                {/* Desafio Diário */}
                <div className="border-t md:border-t-0 md:border-l border-zinc-800 pt-2 md:pt-0 md:pl-4">
                  <p className="text-[11px] font-semibold text-zinc-400">Desafio diário</p>
                  <p className="text-xs text-zinc-300 mt-0.5 flex items-center gap-1">
                    <span>Aprenda 10 cartões novos hoje.</span>
                  </p>
                </div>

                {/* Próximo Nível / XP */}
                <div className="border-t md:border-t-0 md:border-l border-zinc-800 pt-2 md:pt-0 md:pl-4">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-1">
                    <span>Próximo nível</span>
                    <span>restantes: 60 XP</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="bg-sky-500 h-full w-[40%] rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Informações: Plano de Estudos & Bizu do Dia */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-300 mb-1">
                  <span>Plano de estudos</span>
                  <span className="text-[11px] font-mono text-zinc-500 font-normal">Dom 20.09.26</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Nenhum plano de estudos configurado ainda.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-300 mb-1">
                  <span>Fato geral do dia</span>
                  <span className="text-[11px] font-mono text-sky-400 font-normal">💡 Bizu</span>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-2">
                  Os tubarões existiram antes das árvores — cerca de 50 milhões de anos antes.
                </p>
              </div>
            </div>

            {/* TABELA DE BARALHOS / MATÉRIAS ANKI (PRINT 3) */}
            <div className="rounded-2xl bg-zinc-900/95 border border-zinc-800 overflow-hidden shadow-sm">
              <div className="grid grid-cols-12 px-4 py-2.5 bg-zinc-950/80 border-b border-zinc-800 text-xs font-bold text-zinc-400 font-mono tracking-wider">
                <div className="col-span-6 sm:col-span-7">Baralho</div>
                <div className="col-span-2 sm:col-span-1 text-center text-sky-400">Novo</div>
                <div className="col-span-2 sm:col-span-2 text-center text-amber-500">Aprender</div>
                <div className="col-span-2 sm:col-span-2 text-center text-emerald-400">Revisar</div>
              </div>

              <div className="divide-y divide-zinc-800/60">
                {ankiDeckRows.map((row) => (
                  <div
                    key={row.name}
                    onClick={() => void handleOpenSubject(row.name, row.subject)}
                    className="grid grid-cols-12 px-4 py-3 items-center hover:bg-zinc-800/50 transition-colors cursor-pointer group text-sm"
                  >
                    <div className="col-span-6 sm:col-span-7 font-medium text-zinc-200 group-hover:text-white flex items-center gap-2">
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                      <span>{row.name}</span>
                    </div>
                    <div className="col-span-2 sm:col-span-1 text-center font-mono text-xs font-bold text-sky-400">
                      {row.newCount}
                    </div>
                    <div className="col-span-2 sm:col-span-2 text-center font-mono text-xs font-bold text-amber-500">
                      {row.learnCount}
                    </div>
                    <div className="col-span-2 sm:col-span-2 text-center font-mono text-xs font-bold text-emerald-400 flex items-center justify-center gap-2">
                      <span>{row.dueCount}</span>
                      <Settings className="w-3.5 h-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Estatísticas Inferiores Anki */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-[11px] text-zinc-400 font-semibold mb-1">Consistência</p>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden max-w-[120px] mx-auto">
                    <div className="bg-sky-500 h-full w-[20%]" />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-400 font-semibold mb-1">Eficiência</p>
                  <p className="text-xs font-mono text-zinc-300">Normal</p>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-400 font-semibold mb-1">Retenção</p>
                  <p className="text-sm font-bold font-mono text-zinc-100">0%</p>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-400 font-semibold mb-1">Novos cartões</p>
                  <p className="text-sm font-bold font-mono text-zinc-100">0%</p>
                </div>
              </div>
              <p className="text-center text-xs font-mono text-zinc-500 mt-3 pt-3 border-t border-zinc-800/60">
                Estudado(s) 0 cartão em 0 segundo hoje (0s/card)
              </p>
            </div>

            {/* Ações na Base (Estilo Anki) */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={handleOpenAddCardModal}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
              >
                + Adicionar Flashcard
              </button>
              <button
                onClick={() => {
                  setSubjectFormName('');
                  setSubjectFormDesc('');
                  setEditingSubject(null);
                  setIsSubjectModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
              >
                Criar Baralho
              </button>
              <button
                onClick={() => setIsBatchModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
              >
                Importar arquivo
              </button>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* 📖 VISÃO 2: MATÉRIA COM IA NO TOPO E RESOLUÇÃO EMBAIXO        */}
        {/* ============================================================= */}
        {viewMode === 'subject_detail' && currentSubject && (
          <div className="space-y-5">
            {/* Barra de Retorno da Matéria */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBackToAnkiMain}
                  className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Baralhos</span>
                </button>
                <span className="text-zinc-600 font-mono">/</span>
                <span className="font-bold text-sm text-zinc-100">{currentSubject.name}</span>
                <span className="text-xs font-mono text-zinc-500">({cards.length} flashcards)</span>
              </div>

              <button
                onClick={handleOpenAddCardModal}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5 text-sky-400" />
                <span>+ Novo Card</span>
              </button>
            </div>

            {/* ----------------------------------------------------------- */}
            {/* ⚡ PARTE DE CIMA: GERADOR DE +20 FLASHCARDS POR IA           */}
            {/* ----------------------------------------------------------- */}
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">
                      Gerar +20 Flashcards com IA em {currentSubject.name}
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Gere instantaneamente uma bateria com repetição espaçada focada no edital CFO CBMERJ.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tópicos Sugeridos para 1 Clique */}
              {currentSubjectTopics.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 mr-1">Tópicos:</span>
                  {currentSubjectTopics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setAiTopicInput(topic)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                        aiTopicInput === topic
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 font-semibold'
                          : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              )}

              {/* Input e Disparo do Gerador */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  type="text"
                  placeholder={`Digite o assunto ou tópico específico de ${currentSubject.name}...`}
                  value={aiTopicInput}
                  onChange={(e) => setAiTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isAiGenerating) void handleGenerate20CardsWithAi();
                  }}
                  className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleGenerate20CardsWithAi}
                  disabled={isAiGenerating}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                  <span>{isAiGenerating ? 'Gerando 20 flashcards...' : 'Gerar +20 Flashcards por IA'}</span>
                </button>
              </div>
            </div>

            {/* ----------------------------------------------------------- */}
            {/* 🎯 PARTE DE BAIXO: RESOLVER FLASHCARDS ALEATÓRIOS            */}
            {/* ----------------------------------------------------------- */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-zinc-200">
                    Flashcards para Resolver
                  </h3>
                  {studyQueue.length > 0 && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                      Cartão {currentCardIndex + 1} de {studyQueue.length}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {cards.length > 1 && (
                    <button
                      onClick={handleShuffleQueue}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Embaralhar flashcards em ordem aleatória"
                    >
                      <Shuffle className="w-3 h-3 text-sky-400" />
                      <span>Embaralhar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* RESOLVEDOR ATIVO ESTILO ANKI (PRINT 5) */}
              {loadingCards ? (
                <div className="p-12 text-center rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs">
                  Carregando flashcards da matéria...
                </div>
              ) : studyQueue.length > 0 && studyQueue[currentCardIndex] ? (
                <div className="rounded-2xl bg-zinc-900/95 border border-zinc-800 shadow-md p-5 sm:p-8 flex flex-col justify-between min-h-[360px]">
                  {/* FRENTE (PERGUNTA) */}
                  <div className="space-y-5 text-center">
                    <div className="text-base sm:text-lg font-medium text-zinc-100 leading-relaxed max-w-2xl mx-auto">
                      <ClozeLatexCard text={studyQueue[currentCardIndex].front} isAnswer={false} />
                    </div>

                    {/* VERSO (RESPOSTA) QUANDO REVELADO */}
                    {isAnswerRevealed && (
                      <div className="pt-6 border-t border-zinc-800/80 animate-in fade-in duration-200 max-w-2xl mx-auto">
                        <div className="text-sm sm:text-base text-zinc-300 leading-relaxed font-normal">
                          <ClozeLatexCard text={studyQueue[currentCardIndex].back} isAnswer={true} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CONTROLES / BOTÕES NA BASE (PRINT 5) */}
                  <div className="pt-6 border-t border-zinc-800/80 mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                    {/* Botão Editar no canto esquerdo */}
                    <div>
                      <button
                        onClick={() => handleOpenEditCard(studyQueue[currentCardIndex])}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Editar
                      </button>
                    </div>

                    {/* Centro: Mostrar Resposta ou os 4 Botões Anki SM-2 */}
                    {!isAnswerRevealed ? (
                      <button
                        onClick={handleRevealAnswer}
                        className="w-full sm:w-auto min-w-[220px] py-2.5 px-6 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-xs tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Mostrar Resposta</span>
                        <kbd className="text-[10px] bg-zinc-950 px-1.5 py-0.5 rounded text-zinc-400 font-mono">
                          Espaço
                        </kbd>
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {/* < 1min De novo */}
                        <button
                          onClick={() => void handleRateCard(1)}
                          className="px-3.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 text-rose-300 flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
                        >
                          <span className="text-[10px] font-mono text-rose-400/80">&lt; 1min(s)</span>
                          <span className="text-xs font-bold">De novo</span>
                        </button>

                        {/* < 10min Difícil */}
                        <button
                          onClick={() => void handleRateCard(2)}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/60 text-amber-300 flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
                        >
                          <span className="text-[10px] font-mono text-amber-400/80">&lt; 10min(s)</span>
                          <span className="text-xs font-bold">Difícil</span>
                        </button>

                        {/* 1 dia Bom */}
                        <button
                          onClick={() => void handleRateCard(3)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 text-emerald-300 flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
                        >
                          <span className="text-[10px] font-mono text-emerald-400/80">1dia(s)</span>
                          <span className="text-xs font-bold">Bom</span>
                        </button>

                        {/* 4 dias Fácil */}
                        <button
                          onClick={() => void handleRateCard(4)}
                          className="px-3.5 py-1.5 rounded-xl bg-sky-950/40 hover:bg-sky-900/50 border border-sky-800/60 text-sky-300 flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
                        >
                          <span className="text-[10px] font-mono text-sky-400/80">4dia(s)</span>
                          <span className="text-xs font-bold">Fácil</span>
                        </button>
                      </div>
                    )}

                    <div className="w-[60px] hidden sm:block" />
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <BookOpen className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                  <p className="text-sm font-bold text-zinc-200">Nenhum flashcard nesta matéria ainda</p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                    Utilize o gerador acima para criar +20 flashcards por IA ou adicione manualmente seus erros do simulado.
                  </p>
                </div>
              )}

              {/* LISTA TABULAR DE FLASHCARDS DA MATÉRIA */}
              {cards.length > 0 && (
                <div className="space-y-2 pt-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                    <span>Todos os Flashcards Cadastrados ({cards.length})</span>
                  </div>

                  <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden divide-y divide-zinc-800/80">
                    {cards.map((c, index) => (
                      <div key={c.id} className="p-3 flex items-start justify-between gap-3 text-xs hover:bg-zinc-800/40 transition-colors">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="font-semibold text-zinc-200 line-clamp-2">
                            <span className="text-zinc-500 font-mono mr-1.5">#{index + 1}</span>
                            {c.front}
                          </div>
                          <div className="text-zinc-400 line-clamp-2 text-[11px]">
                            {c.back}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleOpenEditCard(c)}
                            title="Editar"
                            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => void handleDeleteCard(c.id)}
                            title="Excluir"
                            className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* 🪟 MODAL ANKI: ADICIONAR / EDITAR FLASHCARD (PRINT 4)         */}
        {/* ============================================================= */}
        {isAddCardModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Topo do Modal estilo Anki */}
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-sky-500/80" />
                  <span className="text-xs font-bold text-zinc-200">
                    {editingCard ? 'Editar Flashcard' : 'Adicionar Flashcard'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddCardModalOpen(false)}
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveCard} className="p-4 sm:p-5 space-y-4">
                {/* Seletores Tipo e Matéria */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Tipo</label>
                    <select
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs outline-none"
                    >
                      <option value="basic">Básico</option>
                      <option value="cloze">Omissão de Palavras (Cloze)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Baralho / Matéria</label>
                    <select
                      value={cardFormSubjectId}
                      onChange={(e) => setCardFormSubjectId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs outline-none"
                    >
                      {OFFICIAL_CBMERJ_SUBJECTS.map((s) => (
                        <option key={s.name} value={subjects.find(sub => sub.name.toLowerCase() === s.name.toLowerCase())?.id || s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Toolbar de Formatação Rápida */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs">
                  <button
                    type="button"
                    onClick={() => setCardFormFront(prev => prev + ' **texto**')}
                    className="px-2 py-0.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 font-bold"
                    title="Negrito"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardFormFront(prev => prev + ' *texto*')}
                    className="px-2 py-0.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 italic font-serif"
                    title="Itálico"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardFormFront(prev => prev + ' {{c1::termo}}')}
                    className="px-2 py-0.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 font-mono text-[11px]"
                    title="Cloze Deletion"
                  >
                    [...c1]
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardFormFront(prev => prev + ' $fórmula$')}
                    className="px-2 py-0.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 font-mono text-[11px]"
                    title="Fórmula KaTeX"
                  >
                    $fx$
                  </button>
                </div>

                {/* Frente (Pergunta) */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300">Frente</label>
                  <textarea
                    rows={3}
                    placeholder="O que é um Conto? / Enunciado da questão com erro..."
                    value={cardFormFront}
                    onChange={(e) => setCardFormFront(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs placeholder-zinc-500 focus:outline-none focus:border-sky-500 transition-colors resize-y"
                  />
                </div>

                {/* Verso (Resposta) */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300">Verso</label>
                  <textarea
                    rows={4}
                    placeholder="Narrativa curta, concisa, com pouquíssimos personagens... / Gabarito e explicação comentada..."
                    value={cardFormBack}
                    onChange={(e) => setCardFormBack(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs placeholder-zinc-500 focus:outline-none focus:border-sky-500 transition-colors resize-y"
                  />
                </div>

                {/* Etiquetas (Tags) */}
                <div className="space-y-1">
                  <label className="block text-xs text-zinc-400">Etiquetas (Tags opcionais)</label>
                  <input
                    type="text"
                    placeholder="ex: uerj2024 cinematica formula"
                    value={cardFormTags}
                    onChange={(e) => setCardFormTags(e.target.value)}
                    className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Botões na Base (Print 4) */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => setIsAddCardModalOpen(false)}
                    className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCard}
                    className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSavingCard ? 'Salvando...' : editingCard ? 'Salvar Cartão' : 'Adicionar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Criação Manual de Disciplina */}
        {isSubjectModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-zinc-100">Criar Novo Baralho / Matéria</h3>
                <button onClick={() => setIsSubjectModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Nome da Matéria</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Legislação Militar, Química Orgânica..."
                    value={subjectFormName}
                    onChange={(e) => setSubjectFormName(e.target.value)}
                    className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsSubjectModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!subjectFormName.trim()) return;
                      try {
                        const res = await apiFetch('/api/flashcards/subjects', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: subjectFormName.trim() }),
                        });
                        if (res.ok) {
                          showToast?.('Baralho criado!', 'success');
                          setIsSubjectModalOpen(false);
                          void fetchGlobalData();
                        }
                      } catch {
                        showToast?.('Erro ao criar baralho.', 'error');
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
                  >
                    Criar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Importação em Lote */}
        {isBatchModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-2xl bg-zinc-900 border border-zinc-700 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-zinc-100">Importar Flashcards (Arquivo / Texto)</h3>
                <button onClick={() => setIsBatchModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-zinc-400">
                  Cole seus flashcards separados por ponto-e-vírgula (<code className="text-sky-400">Pergunta;Resposta</code>) ou tabulação, um por linha:
                </p>

                <textarea
                  rows={6}
                  placeholder={`O que é termodinâmica?;Estudo das transformações de calor em trabalho\nQual a fórmula da velocidade média?;Vm = ΔS / Δt`}
                  value={batchInputText}
                  onChange={(e) => setBatchInputText(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono resize-y"
                />

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsBatchModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={batchImporting || !batchInputText.trim()}
                    onClick={async () => {
                      const lines = batchInputText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                      if (lines.length === 0) return;
                      setBatchImporting(true);
                      try {
                        let targetSubId = subjects[0]?.id;
                        if (!targetSubId) {
                          const subRes = await apiFetch('/api/flashcards/subjects', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: 'Importados' }),
                          });
                          const subData = await subRes.json();
                          targetSubId = subData.subject.id;
                        }

                        let targetDeckId = decks[0]?.id;
                        if (!targetDeckId) {
                          const deckRes = await apiFetch('/api/flashcards/decks', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ subjectId: targetSubId, name: 'Geral' }),
                          });
                          const deckData = await deckRes.json();
                          targetDeckId = deckData.deck.id;
                        }

                        const parsedCards = lines.map(line => {
                          const parts = line.split(/[;\t]/);
                          return {
                            front: parts[0]?.trim() || '',
                            back: parts.slice(1).join(';')?.trim() || '',
                          };
                        }).filter(c => c.front && c.back);

                        const res = await apiFetch(`/api/flashcards/decks/${targetDeckId}/cards/batch`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ cards: parsedCards }),
                        });

                        if (res.ok) {
                          showToast?.(`${parsedCards.length} flashcards importados com sucesso!`, 'success');
                          setIsBatchModalOpen(false);
                          setBatchInputText('');
                          void fetchGlobalData();
                        }
                      } catch {
                        showToast?.('Erro ao importar flashcards.', 'error');
                      } finally {
                        setBatchImporting(false);
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {batchImporting ? 'Importando...' : 'Importar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ErrorNotebookTab;
