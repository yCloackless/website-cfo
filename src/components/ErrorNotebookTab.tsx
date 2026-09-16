import { apiFetch } from '../services/apiFetch';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Layers,
  Layers3,
  Sparkles,
  PlusCircle,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Flame,
  Trash2,
  BookOpen,
  ArrowLeft,
  Search,
  Check,
  X,
  Calendar,
  Image as ImageIcon,
  Upload,
  Edit3,
  Maximize2,
  FolderPlus,
  Folder,
  GraduationCap,
  Clock,
  Zap,
  ChevronRight,
  TrendingUp,
  BrainCircuit,
  Info,
  SlidersHorizontal,
  Download,
  UploadCloud,
  CalendarDays,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  Shuffle,
  BarChart3,
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

// Backward compatibility aliases
export type Deck = DeckWithStats;
export type Subject = SubjectWithStats;

interface ErrorNotebookTabProps {
  theme?: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Compactador automático de imagens para payloads otimizados
function compressImage(base64Str: string, maxWidth = 1000, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
}

const PALETTE_COLORS = [
  { name: 'Vermelho CBMERJ', value: 'red' },
  { name: 'Azul Tático', value: 'blue' },
  { name: 'Esmeralda', value: 'emerald' },
  { name: 'Âmbar', value: 'amber' },
  { name: 'Roxo / Índigo', value: 'indigo' },
  { name: 'Ciano', value: 'cyan' },
];

export const ErrorNotebookTab: React.FC<ErrorNotebookTabProps> = ({
  theme = 'dark',
  showToast,
}) => {
  const isDark = theme === 'dark';

  // Navegação Hierárquica: 'subjects' (Nível 1) -> 'decks' (Nível 2) -> 'cards' (Nível 3) -> 'study' (Nível 4)
  const [viewMode, setViewMode] = useState<'subjects' | 'decks' | 'cards' | 'study'>('subjects');

  // Seleções ativas de navegação
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
  const [loadingCards, setLoadingCards] = useState(false);

  // Busca e Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [cardFilter, setCardFilter] = useState<'ALL' | 'DUE' | 'LEECH' | 'new' | 'learning' | 'review' | 'mastered'>('ALL');

  // Modais de Criação e Edição
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectWithStats | null>(null);
  const [subjectFormName, setSubjectFormName] = useState('');
  const [subjectFormDesc, setSubjectFormDesc] = useState('');
  const [subjectFormColor, setSubjectFormColor] = useState('red');

  const [isDeckModalOpen, setIsDeckModalOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<DeckWithStats | null>(null);
  const [deckFormName, setDeckFormName] = useState('');
  const [deckFormDesc, setDeckFormDesc] = useState('');
  const [deckFormSubjectId, setDeckFormSubjectId] = useState('');

  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [cardFormFront, setCardFormFront] = useState('');
  const [cardFormBack, setCardFormBack] = useState('');
  const [cardFormFrontImage, setCardFormFrontImage] = useState<string | null>(null);
  const [cardFormBackImage, setCardFormBackImage] = useState<string | null>(null);

  // Modal de Exclusão com Confirmação e Contagem em Cascata
  const [deleteModal, setDeleteModal] = useState<{
    type: 'subject' | 'deck' | 'card';
    id: string;
    title: string;
    deckCount?: number;
    cardCount?: number;
  } | null>(null);

  // Modal Gerador IA
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiTopicInput, setAiTopicInput] = useState('');
  const [aiTargetSubjectId, setAiTargetSubjectId] = useState('');
  const [aiTargetDeckId, setAiTargetDeckId] = useState('');
  const [aiNewDeckTitle, setAiNewDeckTitle] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPreviewCards, setAiPreviewCards] = useState<Array<{ question: string; answer: string }>>([]);

  // Modal Importação em Lote
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchInputText, setBatchInputText] = useState('');
  const [batchImporting, setBatchImporting] = useState(false);

  // Modal Visualização de Foto em Tela Cheia
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // =========================================================================
  // 🎮 ESTADO DO MODO DE ESTUDO (ANKI PLAYER / SM-2)
  // =========================================================================
  const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [studySessionFinished, setStudySessionFinished] = useState(false);
  const [studySessionStats, setStudySessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0, total: 0 });
  const [cramMode, setCramMode] = useState(false); // Modo Maratona (Treino livre sem alterar SM-2)

  // Refs para inputs de imagem
  const questionFileInputRef = useRef<HTMLInputElement | null>(null);
  const answerFileInputRef = useRef<HTMLInputElement | null>(null);

  // =========================================================================
  // 📡 CARREGAMENTO INICIAL E SINCRONIZAÇÃO COM O BACKEND
  // =========================================================================

  const fetchGlobalData = useCallback(async () => {
    try {
      setLoading(true);
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
    } catch (err) {
      showToast?.('Falha ao sincronizar flashcards com o servidor.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchGlobalData();
  }, [fetchGlobalData]);

  // Carrega baralhos da disciplina selecionada
  const fetchDecksForSubject = useCallback(async (subjectId: string) => {
    try {
      const res = await apiFetch(`/api/flashcards/decks?subjectId=${encodeURIComponent(subjectId)}`);
      if (res.ok) {
        const data = await res.json();
        setDecks(data.decks || []);
      }
    } catch {
      showToast?.('Erro ao carregar baralhos da disciplina.', 'error');
    }
  }, [showToast]);

  // Carrega flashcards do baralho selecionado
  const fetchCardsForDeck = useCallback(async (deckId: string) => {
    try {
      setLoadingCards(true);
      const res = await apiFetch(`/api/flashcards/decks/${encodeURIComponent(deckId)}/cards`);
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards || []);
      }
    } catch {
      showToast?.('Erro ao carregar flashcards deste baralho.', 'error');
    } finally {
      setLoadingCards(false);
    }
  }, [showToast]);

  // =========================================================================
  // 🧭 TRANSIÇÕES DE NAVEGAÇÃO
  // =========================================================================

  const handleOpenSubject = (subject: SubjectWithStats) => {
    setCurrentSubject(subject);
    setCurrentDeck(null);
    setViewMode('decks');
    setSearchQuery('');
    void fetchDecksForSubject(subject.id);
  };

  const handleOpenDeck = (deck: DeckWithStats) => {
    setCurrentDeck(deck);
    setViewMode('cards');
    setSearchQuery('');
    setCardFilter('ALL');
    void fetchCardsForDeck(deck.id);
  };

  const handleBackToSubjects = () => {
    setViewMode('subjects');
    setCurrentSubject(null);
    setCurrentDeck(null);
    setSearchQuery('');
    void fetchGlobalData();
  };

  const handleBackToDecks = () => {
    if (!currentSubject) {
      handleBackToSubjects();
      return;
    }
    setViewMode('decks');
    setCurrentDeck(null);
    setSearchQuery('');
    void fetchDecksForSubject(currentSubject.id);
    void fetchGlobalData();
  };

  // =========================================================================
  // 📚 CRUD DISCIPLINAS (SUBJECTS)
  // =========================================================================

  const handleOpenCreateSubject = () => {
    setEditingSubject(null);
    setSubjectFormName('');
    setSubjectFormDesc('');
    setSubjectFormColor('red');
    setIsSubjectModalOpen(true);
  };

  const handleOpenEditSubject = (sub: SubjectWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSubject(sub);
    setSubjectFormName(sub.name);
    setSubjectFormDesc(sub.description || '');
    setSubjectFormColor(sub.color || 'red');
    setIsSubjectModalOpen(true);
  };

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectFormName.trim()) {
      showToast?.('Informe o nome da disciplina.', 'error');
      return;
    }

    try {
      if (editingSubject) {
        const res = await apiFetch(`/api/flashcards/subjects/${editingSubject.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: subjectFormName.trim(),
            description: subjectFormDesc.trim() || null,
            color: subjectFormColor,
          }),
        });
        if (res.ok) {
          showToast?.('Disciplina atualizada com sucesso!', 'success');
          setIsSubjectModalOpen(false);
          void fetchGlobalData();
          if (currentSubject?.id === editingSubject.id) {
            setCurrentSubject((prev) => prev ? { ...prev, name: subjectFormName.trim(), description: subjectFormDesc.trim() || null, color: subjectFormColor } : null);
          }
        } else {
          showToast?.('Falha ao atualizar disciplina.', 'error');
        }
      } else {
        const res = await apiFetch('/api/flashcards/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: subjectFormName.trim(),
            description: subjectFormDesc.trim() || null,
            color: subjectFormColor,
          }),
        });
        if (res.ok) {
          showToast?.('Disciplina criada com sucesso!', 'success');
          setIsSubjectModalOpen(false);
          void fetchGlobalData();
        } else {
          showToast?.('Falha ao criar disciplina.', 'error');
        }
      }
    } catch {
      showToast?.('Erro de conexão com o servidor.', 'error');
    }
  };

  const handlePromptDeleteSubject = async (sub: SubjectWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/flashcards/subjects/${sub.id}/cascade-stats`);
      const data = res.ok ? await res.json() : { stats: { deckCount: sub.deckCount, cardCount: sub.cardCount } };
      setDeleteModal({
        type: 'subject',
        id: sub.id,
        title: sub.name,
        deckCount: data.stats?.deckCount ?? sub.deckCount,
        cardCount: data.stats?.cardCount ?? sub.cardCount,
      });
    } catch {
      setDeleteModal({
        type: 'subject',
        id: sub.id,
        title: sub.name,
        deckCount: sub.deckCount,
        cardCount: sub.cardCount,
      });
    }
  };

  // =========================================================================
  // 🗃️ CRUD BARALHOS (DECKS)
  // =========================================================================

  const handleOpenCreateDeck = () => {
    setEditingDeck(null);
    setDeckFormName('');
    setDeckFormDesc('');
    setDeckFormSubjectId(currentSubject ? currentSubject.id : (subjects[0]?.id || ''));
    setIsDeckModalOpen(true);
  };

  const handleOpenEditDeck = (deck: DeckWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDeck(deck);
    setDeckFormName(deck.name);
    setDeckFormDesc(deck.description || '');
    setDeckFormSubjectId(deck.subjectId);
    setIsDeckModalOpen(true);
  };

  const handleSaveDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckFormName.trim()) {
      showToast?.('Informe o nome do baralho.', 'error');
      return;
    }
    const targetSubId = deckFormSubjectId || currentSubject?.id;
    if (!targetSubId) {
      showToast?.('Selecione a disciplina do baralho.', 'error');
      return;
    }

    try {
      if (editingDeck) {
        const res = await apiFetch(`/api/flashcards/decks/${editingDeck.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: deckFormName.trim(),
            description: deckFormDesc.trim() || null,
            subjectId: targetSubId,
          }),
        });
        if (res.ok) {
          showToast?.('Baralho atualizado com sucesso!', 'success');
          setIsDeckModalOpen(false);
          if (currentSubject) void fetchDecksForSubject(currentSubject.id);
          void fetchGlobalData();
        } else {
          showToast?.('Falha ao atualizar baralho.', 'error');
        }
      } else {
        const res = await apiFetch('/api/flashcards/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjectId: targetSubId,
            name: deckFormName.trim(),
            description: deckFormDesc.trim() || null,
          }),
        });
        if (res.ok) {
          showToast?.('Baralho criado com sucesso!', 'success');
          setIsDeckModalOpen(false);
          if (currentSubject) void fetchDecksForSubject(currentSubject.id);
          void fetchGlobalData();
        } else {
          showToast?.('Falha ao criar baralho.', 'error');
        }
      }
    } catch {
      showToast?.('Erro de conexão ao salvar baralho.', 'error');
    }
  };

  const handlePromptDeleteDeck = async (deck: DeckWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/flashcards/decks/${deck.id}/cascade-stats`);
      const data = res.ok ? await res.json() : { stats: { cardCount: deck.cardCount } };
      setDeleteModal({
        type: 'deck',
        id: deck.id,
        title: deck.name,
        cardCount: data.stats?.cardCount ?? deck.cardCount,
      });
    } catch {
      setDeleteModal({
        type: 'deck',
        id: deck.id,
        title: deck.name,
        cardCount: deck.cardCount,
      });
    }
  };

  // =========================================================================
  // 🃏 CRUD FLASHCARDS
  // =========================================================================

  const handleOpenAddCardModal = () => {
    setEditingCard(null);
    setCardFormFront('');
    setCardFormBack('');
    setCardFormFrontImage(null);
    setCardFormBackImage(null);
    setIsCardModalOpen(true);
  };

  const handleOpenEditCardModal = (card: Flashcard, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCard(card);
    setCardFormFront(card.front);
    setCardFormBack(card.back);
    setCardFormFrontImage(card.frontImage || null);
    setCardFormBackImage(card.backImage || null);
    setIsCardModalOpen(true);
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardFormFront.trim() && !cardFormFrontImage) {
      showToast?.('Informe a pergunta ou cole uma foto na frente.', 'error');
      return;
    }
    if (!cardFormBack.trim() && !cardFormBackImage) {
      showToast?.('Informe a resposta ou cole uma foto no verso.', 'error');
      return;
    }
    if (!currentDeck) {
      showToast?.('Baralho não selecionado.', 'error');
      return;
    }

    try {
      if (editingCard) {
        const res = await apiFetch(`/api/flashcards/cards/${editingCard.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            front: cardFormFront.trim(),
            back: cardFormBack.trim(),
            frontImage: cardFormFrontImage,
            backImage: cardFormBackImage,
          }),
        });
        if (res.ok) {
          showToast?.('Flashcard atualizado!', 'success');
          setIsCardModalOpen(false);
          void fetchCardsForDeck(currentDeck.id);
          if (currentSubject) void fetchDecksForSubject(currentSubject.id);
        } else {
          showToast?.('Falha ao atualizar flashcard.', 'error');
        }
      } else {
        const res = await apiFetch('/api/flashcards/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deckId: currentDeck.id,
            front: cardFormFront.trim(),
            back: cardFormBack.trim(),
            frontImage: cardFormFrontImage,
            backImage: cardFormBackImage,
          }),
        });
        if (res.ok) {
          showToast?.('Flashcard adicionado ao baralho!', 'success');
          setIsCardModalOpen(false);
          void fetchCardsForDeck(currentDeck.id);
          if (currentSubject) void fetchDecksForSubject(currentSubject.id);
        } else {
          showToast?.('Falha ao criar flashcard.', 'error');
        }
      }
    } catch {
      showToast?.('Erro de conexão ao salvar cartão.', 'error');
    }
  };

  const handlePromptDeleteCard = (card: Flashcard, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteModal({
      type: 'card',
      id: card.id,
      title: card.front.slice(0, 40) || 'Flashcard',
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal) return;

    try {
      if (deleteModal.type === 'subject') {
        const res = await apiFetch(`/api/flashcards/subjects/${deleteModal.id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast?.('Disciplina e dependências excluídas.', 'success');
          setDeleteModal(null);
          if (currentSubject?.id === deleteModal.id) {
            handleBackToSubjects();
          } else {
            void fetchGlobalData();
          }
        }
      } else if (deleteModal.type === 'deck') {
        const res = await apiFetch(`/api/flashcards/decks/${deleteModal.id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast?.('Baralho excluído com sucesso.', 'success');
          setDeleteModal(null);
          if (currentDeck?.id === deleteModal.id) {
            handleBackToDecks();
          } else if (currentSubject) {
            void fetchDecksForSubject(currentSubject.id);
          }
        }
      } else if (deleteModal.type === 'card') {
        const res = await apiFetch(`/api/flashcards/cards/${deleteModal.id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast?.('Flashcard excluído.', 'success');
          setDeleteModal(null);
          if (currentDeck) void fetchCardsForDeck(currentDeck.id);
        }
      }
    } catch {
      showToast?.('Erro ao processar exclusão.', 'error');
    }
  };

  // =========================================================================
  // 📷 UPLOAD, COLAGEM E TRATAMENTO DE IMAGENS
  // =========================================================================

  const processImageFile = async (file: File, target: 'front' | 'back') => {
    if (!file.type.startsWith('image/')) {
      showToast?.('Apenas arquivos de imagem são aceitos.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawBase64 = event.target?.result as string;
      if (rawBase64) {
        const compressed = await compressImage(rawBase64);
        if (target === 'front') {
          setCardFormFrontImage(compressed);
        } else {
          setCardFormBackImage(compressed);
        }
        showToast?.('Foto anexada com sucesso!', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasteImage = (e: React.ClipboardEvent, target: 'front' | 'back') => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          void processImageFile(file, target);
          return;
        }
      }
    }
  };

  // =========================================================================
  // ⚡ GERADOR DE 20 FLASHCARDS COM IA
  // =========================================================================

  const handleOpenAiGenerator = () => {
    setAiTopicInput(currentDeck ? currentDeck.name : currentSubject ? currentSubject.name : '');
    setAiTargetSubjectId(currentSubject ? currentSubject.id : (subjects[0]?.id || ''));
    setAiTargetDeckId(currentDeck ? currentDeck.id : 'new_deck');
    setAiNewDeckTitle('');
    setAiPreviewCards([]);
    setIsAiModalOpen(true);
  };

  const handleGenerateWithAi = async () => {
    if (!aiTopicInput.trim()) {
      showToast?.('Por favor, informe a matéria ou tópico.', 'error');
      return;
    }

    setIsAiLoading(true);
    setAiPreviewCards([]);

    try {
      const response = await apiFetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectOrTopic: aiTopicInput.trim() }),
      });

      const data = await response.json();
      if (response.ok && data.cards && data.cards.length > 0) {
        setAiPreviewCards(data.cards);
        showToast?.(`IA gerou ${data.cards.length} flashcards de alta retenção!`, 'success');
      } else {
        showToast?.(data.message || 'Falha ao gerar flashcards pela IA.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao gerar com IA.', 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSaveAiCards = async () => {
    if (aiPreviewCards.length === 0) return;

    let targetDeckId = aiTargetDeckId;
    let targetSubId = aiTargetSubjectId || currentSubject?.id || subjects[0]?.id;

    if (!targetSubId) {
      showToast?.('Selecione ou crie uma disciplina primeiro.', 'error');
      return;
    }

    try {
      // Se optou por criar novo baralho
      if (targetDeckId === 'new_deck') {
        const deckTitle = aiNewDeckTitle.trim() || aiTopicInput.trim() || 'Novo Baralho IA';
        const deckRes = await apiFetch('/api/flashcards/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjectId: targetSubId,
            name: deckTitle,
            description: `Baralho gerado por IA com 20 flashcards bate-pronto.`,
          }),
        });

        if (!deckRes.ok) {
          showToast?.('Falha ao criar baralho de destino.', 'error');
          return;
        }
        const deckData = await deckRes.json();
        targetDeckId = deckData.deck.id;
      }

      // Salva cada cartão no backend
      let savedCount = 0;
      for (const c of aiPreviewCards) {
        const cardRes = await apiFetch('/api/flashcards/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deckId: targetDeckId,
            front: c.question,
            back: c.answer,
          }),
        });
        if (cardRes.ok) savedCount++;
      }

      showToast?.(`${savedCount} flashcards salvos com sucesso!`, 'success');
      setIsAiModalOpen(false);
      setAiPreviewCards([]);
      setAiTopicInput('');

      if (currentDeck && currentDeck.id === targetDeckId) {
        void fetchCardsForDeck(targetDeckId);
      } else if (currentSubject) {
        void fetchDecksForSubject(currentSubject.id);
      }
      void fetchGlobalData();
    } catch {
      showToast?.('Erro ao salvar cartões gerados pela IA.', 'error');
    }
  };

  // =========================================================================
  // 🎮 MODO DE ESTUDO FOCADO ESTILO ANKI (SM-2 SRS)
  // =========================================================================

  const handleStartStudySession = async (deck: DeckWithStats, isCram = false) => {
    try {
      setCramMode(isCram);
      const res = isCram
        ? await apiFetch(`/api/flashcards/decks/${deck.id}/cards`)
        : await apiFetch(`/api/flashcards/study-queue/${deck.id}`);

      if (!res.ok) {
        showToast?.('Falha ao carregar fila de estudo.', 'error');
        return;
      }
      const data = await res.json();
      const queue: Flashcard[] = isCram ? data.cards || [] : data.queue || [];

      if (queue.length === 0) {
        showToast?.(
          isCram
            ? 'Nenhum flashcard cadastrado neste baralho para praticar.'
            : 'Nenhum flashcard pendente para hoje neste baralho.',
          'info'
        );
        return;
      }

      setStudyQueue(queue);
      setCurrentCardIndex(0);
      setIsAnswerRevealed(false);
      setStudySessionFinished(false);
      setStudySessionStats({ again: 0, hard: 0, good: 0, easy: 0, total: queue.length });
      setCurrentDeck(deck);
      setViewMode('study');
    } catch {
      showToast?.('Erro de conexão ao iniciar estudo.', 'error');
    }
  };

  // Iniciar sessão de estudo de todos os baralhos de uma disciplina
  const handleStartSubjectStudySession = async (subject: SubjectWithStats) => {
    try {
      setCramMode(false);
      const res = await apiFetch(`/api/flashcards/study-queue/subject/${subject.id}`);
      if (!res.ok) {
        showToast?.('Falha ao carregar fila de estudo da disciplina.', 'error');
        return;
      }
      const data = await res.json();
      const queue: Flashcard[] = data.queue || [];

      if (queue.length === 0) {
        showToast?.('Nenhum cartão pendente para hoje nesta disciplina.', 'info');
        return;
      }

      setStudyQueue(queue);
      setCurrentCardIndex(0);
      setIsAnswerRevealed(false);
      setStudySessionFinished(false);
      setStudySessionStats({ again: 0, hard: 0, good: 0, easy: 0, total: queue.length });
      setCurrentSubject(subject);
      setCurrentDeck(null);
      setViewMode('study');
    } catch {
      showToast?.('Erro ao carregar estudo da disciplina.', 'error');
    }
  };

  // Importação em Lote
  const handleImportBatch = async () => {
    if (!currentDeck || !batchInputText.trim()) return;

    try {
      setBatchImporting(true);
      const lines = batchInputText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const parsedCards: Array<{ front: string; back: string }> = [];

      for (const line of lines) {
        let sep = ';';
        if (line.includes('\t')) sep = '\t';
        else if (line.includes('---')) sep = '---';
        else if (line.includes(';')) sep = ';';
        else if (line.includes('|')) sep = '|';

        const parts = line.split(sep);
        if (parts.length >= 2) {
          const front = parts[0].trim();
          const back = parts.slice(1).join(sep).trim();
          if (front && back) {
            parsedCards.push({ front, back });
          }
        }
      }

      if (parsedCards.length === 0) {
        showToast?.('Nenhum cartão válido encontrado. Separe a pergunta e a resposta com ";" ou Tabulação.', 'error');
        return;
      }

      const res = await apiFetch(`/api/flashcards/decks/${currentDeck.id}/cards/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: parsedCards }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast?.(errData.message || 'Falha ao importar cartões em lote.', 'error');
        return;
      }

      const data = await res.json();
      showToast?.(`${data.count || parsedCards.length} flashcards importados com sucesso!`, 'success');
      setIsBatchModalOpen(false);
      setBatchInputText('');
      void fetchCardsForDeck(currentDeck.id);
      void fetchGlobalData();
    } catch {
      showToast?.('Erro de conexão ao importar cartões.', 'error');
    } finally {
      setBatchImporting(false);
    }
  };

  // Exportação para CSV
  const handleExportCsv = (deck: DeckWithStats) => {
    if (cards.length === 0) {
      showToast?.('Nenhum cartão para exportar.', 'info');
      return;
    }

    const csvRows = ['Pergunta;Resposta;Status;IntervaloDias;Lapsos'];
    for (const c of cards) {
      const frontEsc = `"${(c.front || '').replace(/"/g, '""')}"`;
      const backEsc = `"${(c.back || '').replace(/"/g, '""')}"`;
      csvRows.push(`${frontEsc};${backEsc};${c.status};${c.intervalDays};${c.lapses}`);
    }

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flashcards_${deck.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast?.('Arquivo CSV exportado com sucesso!', 'success');
  };

  // Exportação para JSON
  const handleExportJson = (deck: DeckWithStats) => {
    if (cards.length === 0) {
      showToast?.('Nenhum cartão para exportar.', 'info');
      return;
    }

    const exportData = {
      deckName: deck.name,
      exportedAt: new Date().toISOString(),
      totalCards: cards.length,
      cards: cards.map((c) => ({
        front: c.front,
        back: c.back,
        frontImage: c.frontImage,
        backImage: c.backImage,
        status: c.status,
        intervalDays: c.intervalDays,
        easeFactor: c.easeFactor,
        lapses: c.lapses,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flashcards_${deck.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast?.('Backup JSON gerado!', 'success');
  };

  const handleRevealAnswer = useCallback(() => {
    setIsAnswerRevealed(true);
  }, []);

  const handleRateCard = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (!studyQueue[currentCardIndex]) return;

      const currentCard = studyQueue[currentCardIndex];

      try {
        // Se NÃO estiver no modo maratona, persiste a revisão SM-2 no backend
        if (!cramMode) {
          void apiFetch(`/api/flashcards/cards/${currentCard.id}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating }),
          });
        }

        setStudySessionStats((prev) => ({
          ...prev,
          again: rating === 1 ? prev.again + 1 : prev.again,
          hard: rating === 2 ? prev.hard + 1 : prev.hard,
          good: rating === 3 ? prev.good + 1 : prev.good,
          easy: rating === 4 ? prev.easy + 1 : prev.easy,
        }));

        // Se errou (rating 1), adiciona o cartão novamente ao final da fila para repetição na mesma sessão
        if (rating === 1) {
          setStudyQueue((prev) => [...prev, currentCard]);
        }

        if (currentCardIndex + 1 < studyQueue.length) {
          setCurrentCardIndex((prev) => prev + 1);
          setIsAnswerRevealed(false);
        } else {
          setStudySessionFinished(true);
        }
      } catch {
        showToast?.('Erro ao registrar avaliação de estudo.', 'error');
      }
    },
    [studyQueue, currentCardIndex, cramMode, showToast]
  );

  // Atalhos de teclado no modo estudo (Anki padrão)
  useEffect(() => {
    if (viewMode !== 'study' || studySessionFinished) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!isAnswerRevealed) {
        if (e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          handleRevealAnswer();
        }
      } else {
        if (e.key === '1') {
          e.preventDefault();
          void handleRateCard(1);
        } else if (e.key === '2') {
          e.preventDefault();
          void handleRateCard(2);
        } else if (e.key === '3') {
          e.preventDefault();
          void handleRateCard(3);
        } else if (e.key === '4') {
          e.preventDefault();
          void handleRateCard(4);
        }
      }

      if (e.key === 'Escape') {
        handleBackToDecks();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, isAnswerRevealed, studySessionFinished, handleRevealAnswer, handleRateCard]);

  // =========================================================================
  // 🔍 FILTRAGEM DE ITENS
  // =========================================================================

  const filteredSubjects = useMemo(() => {
    if (!searchQuery.trim()) return subjects;
    const q = searchQuery.toLowerCase();
    return subjects.filter((s) => s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q));
  }, [subjects, searchQuery]);

  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) return decks;
    const q = searchQuery.toLowerCase();
    return decks.filter((d) => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q));
  }, [decks, searchQuery]);

  const filteredCards = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return cards.filter((c) => {
      const matchesSearch =
        !searchQuery.trim() ||
        c.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.back.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesFilter = true;
      if (cardFilter === 'DUE') {
        matchesFilter = c.nextReviewAt <= today;
      } else if (cardFilter === 'LEECH') {
        matchesFilter = c.lapses >= 4;
      } else if (cardFilter !== 'ALL') {
        matchesFilter = c.status === cardFilter;
      }

      return matchesSearch && matchesFilter;
    });
  }, [cards, searchQuery, cardFilter]);

  // =========================================================================
  // 🎨 RENDERIZAÇÃO DA INTERFACE
  // =========================================================================

  return (
    <div className={`min-h-screen p-4 sm:p-6 lg:p-8 transition-colors duration-200 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ------------------------------------------------------------- */}
        {/* 🧭 BREADCRUMB & NAVEGAÇÃO SUPERIOR                            */}
        {/* ------------------------------------------------------------- */}
        {viewMode !== 'study' && (
          <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-800/40">
            <nav className="flex items-center space-x-2 text-xs uppercase tracking-wider font-mono">
              <button
                onClick={handleBackToSubjects}
                className={`flex items-center gap-1.5 transition-colors ${
                  viewMode === 'subjects'
                    ? 'text-red-500 font-bold'
                    : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                }`}
              >
                <Layers3 className="w-4 h-4" />
                <span>Disciplinas</span>
              </button>

              {currentSubject && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  <button
                    onClick={handleBackToDecks}
                    className={`transition-colors ${
                      viewMode === 'decks'
                        ? 'text-red-500 font-bold'
                        : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                    }`}
                  >
                    {currentSubject.name}
                  </button>
                </>
              )}

              {currentDeck && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  <span className="text-red-500 font-bold">
                    {currentDeck.name}
                  </span>
                </>
              )}
            </nav>

            {/* Ações Globais Rápidas */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenAiGenerator}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-red-600/20 via-amber-600/20 to-indigo-600/20 border border-red-500/30 text-amber-300 hover:text-white hover:border-red-500/50 transition-all shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Gerar com IA</span>
              </button>

              {viewMode === 'subjects' && (
                <button
                  onClick={handleOpenCreateSubject}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>+ Nova Disciplina</span>
                </button>
              )}

              {viewMode === 'decks' && (
                <div className="flex items-center gap-2">
                  {currentSubject && currentSubject.cardCount > 0 && (
                    <button
                      onClick={() => handleStartSubjectStudySession(currentSubject)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
                      title="Estudar todos os cartões desta matéria agendados para hoje"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Estudar Toda a Matéria</span>
                    </button>
                  )}
                  <button
                    onClick={handleOpenCreateDeck}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ Novo Baralho</span>
                  </button>
                </div>
              )}

              {viewMode === 'cards' && (
                <div className="flex flex-wrap items-center gap-2">
                  {currentDeck && currentDeck.cardCount > 0 && (
                    <>
                      <button
                        onClick={() => handleStartStudySession(currentDeck, false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
                        title="Revisar cartões de hoje com repetição espaçada SM-2"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Estudar Hoje</span>
                      </button>
                      <button
                        onClick={() => handleStartStudySession(currentDeck, true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600/90 hover:bg-amber-600 text-white transition-colors shadow-sm"
                        title="Modo Maratona: treine todos os cards do baralho sem alterar seus prazos de revisão"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Treino Livre</span>
                      </button>
                      <button
                        onClick={() => handleExportCsv(currentDeck)}
                        className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                        title="Exportar baralho para planilha CSV"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setIsBatchModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm"
                    title="Importar múltiplos cartões colando texto"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Importar Lote</span>
                  </button>
                  <button
                    onClick={handleOpenAddCardModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ Novo Card</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 📊 BARRA DE ESTATÍSTICAS E RESUMO                            */}
        {/* ------------------------------------------------------------- */}
        {viewMode !== 'study' && globalStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-white border-slate-200'}`}>
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
                <Folder className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Disciplinas</p>
                <p className="text-xl font-bold font-mono">{globalStats.totalSubjects}</p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-white border-slate-200'}`}>
              <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Baralhos</p>
                <p className="text-xl font-bold font-mono">{globalStats.totalDecks}</p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-white border-slate-200'}`}>
              <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Layers3 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Flashcards</p>
                <p className="text-xl font-bold font-mono">{globalStats.totalCards}</p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${isDark ? 'bg-red-950/20 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
              <div className="p-2.5 rounded-lg bg-red-500/20 text-red-500">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-red-400 font-mono">Para Revisar Hoje</p>
                <p className="text-xl font-bold font-mono text-red-500">{globalStats.dueToday}</p>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 📈 PREVISÃO DE REVISÕES & HEATMAP DE CONSTÂNCIA               */}
        {/* ------------------------------------------------------------- */}
        {viewMode !== 'study' && (forecastStats || heatmapStats.length > 0) && (
          <div className={`p-4 rounded-2xl border space-y-4 ${isDark ? 'bg-slate-900/40 border-slate-800/80' : 'bg-white border-slate-200'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-red-500" />
                <span className="text-xs font-bold tracking-wide font-mono uppercase">Previsão de Carga & Constância</span>
              </div>
              {forecastStats?.leechCount ? (
                <button
                  onClick={() => setCardFilter('LEECH')}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors cursor-pointer"
                  title="Clique para filtrar apenas cartões com alto índice de erro"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>{forecastStats.leechCount} {forecastStats.leechCount === 1 ? 'cartão sanguessuga (erros frequentes)' : 'cartões sanguessugas (erros frequentes)'}</span>
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Previsão de Dias */}
              {forecastStats && (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Vencimento de Revisões</p>
                  <div className="grid grid-cols-4 gap-2 text-center font-mono">
                    <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                      <p className="text-base font-bold text-red-400">{forecastStats.dueToday}</p>
                      <p className="text-[10px] text-slate-400">Hoje</p>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <p className="text-base font-bold text-amber-400">{forecastStats.dueTomorrow}</p>
                      <p className="text-[10px] text-slate-400">Amanhã</p>
                    </div>
                    <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <p className="text-base font-bold text-blue-400">{forecastStats.dueNext7Days}</p>
                      <p className="text-[10px] text-slate-400">7 Dias</p>
                    </div>
                    <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                      <p className="text-base font-bold text-purple-400">{forecastStats.dueNext30Days}</p>
                      <p className="text-[10px] text-slate-400">30 Dias</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Heatmap de Constância dos Últimos 30 Dias */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  <span>Histórico de Revisões (Últimos 30 Dias)</span>
                  <span className="text-slate-500 font-normal">
                    {heatmapStats.reduce((acc, curr) => acc + curr.count, 0)} concluídas
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-950/40 border border-slate-800/60 items-center justify-start min-h-[44px]">
                  {Array.from({ length: 30 }).map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (29 - i));
                    const dateStr = d.toISOString().split('T')[0];
                    const found = heatmapStats.find((h) => h.date === dateStr);
                    const count = found?.count || 0;
                    return (
                      <div
                        key={dateStr}
                        title={`${dateStr}: ${count} ${count === 1 ? 'revisão' : 'revisões'}`}
                        className={`w-3.5 h-3.5 rounded-sm transition-all cursor-pointer ${
                          count === 0
                            ? isDark
                              ? 'bg-slate-800/60 hover:bg-slate-700'
                              : 'bg-slate-200 hover:bg-slate-300'
                            : count < 5
                            ? 'bg-emerald-600/50 hover:bg-emerald-500/60'
                            : count < 15
                            ? 'bg-emerald-500 hover:bg-emerald-400'
                            : 'bg-emerald-400 shadow-sm shadow-emerald-500/50'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 🔍 BARRA DE PESQUISA                                          */}
        {/* ------------------------------------------------------------- */}
        {viewMode !== 'study' && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={
                viewMode === 'subjects'
                  ? 'Buscar por disciplina...'
                  : viewMode === 'decks'
                  ? `Buscar baralho em ${currentSubject?.name || 'tudo'}...`
                  : 'Buscar flashcards por pergunta ou resposta...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border transition-all ${
                isDark
                  ? 'bg-slate-900/60 border-slate-800 text-slate-100 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'bg-white border-slate-200 text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500'
              }`}
            />
          </div>
        )}

        {/* ============================================================= */}
        {/* 🏛️ NÍVEL 1: LISTAGEM DE DISCIPLINAS                           */}
        {/* ============================================================= */}
        {viewMode === 'subjects' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-red-500" />
                <span>Disciplinas de Estudo</span>
                <span className="text-xs font-mono font-normal text-slate-500">({filteredSubjects.length})</span>
              </h2>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((idx) => (
                  <div key={idx} className={`h-36 rounded-2xl border animate-pulse ${isDark ? 'bg-slate-900/40 border-slate-800/60' : 'bg-slate-100 border-slate-200'}`} />
                ))}
              </div>
            ) : filteredSubjects.length === 0 ? (
              <div className={`p-12 text-center rounded-2xl border ${isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center">
                  <FolderPlus className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold mb-1">Nenhuma disciplina encontrada</h3>
                <p className="text-xs text-slate-400 mb-6 max-w-md mx-auto">
                  Crie sua primeira disciplina para organizar seus tópicos e baralhos no estilo Anki para o CFO CBMERJ.
                </p>
                <button
                  onClick={handleOpenCreateSubject}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  Criar Primeira Disciplina
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSubjects.map((subject) => (
                  <div
                    key={subject.id}
                    onClick={() => handleOpenSubject(subject)}
                    className={`group relative p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                      isDark
                        ? 'bg-slate-900/50 border-slate-800/80 hover:border-red-500/50 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-red-950/20'
                        : 'bg-white border-slate-200 hover:border-red-400 hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm bg-red-500/10 text-red-400 border border-red-500/20`}>
                            {subject.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm group-hover:text-red-400 transition-colors line-clamp-1">
                              {subject.name}
                            </h3>
                            <p className="text-[11px] text-slate-400 line-clamp-1">
                              {subject.description || 'Sem descrição cadastrada'}
                            </p>
                          </div>
                        </div>

                        {/* Botões de Ação na Disciplina */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleOpenEditSubject(subject, e)}
                            title="Editar Disciplina"
                            className="p-1 rounded hover:bg-slate-700/40 text-slate-400 hover:text-slate-200"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handlePromptDeleteSubject(subject, e)}
                            title="Excluir Disciplina"
                            className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/40 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-3 text-slate-400">
                        <span>{subject.deckCount} {subject.deckCount === 1 ? 'baralho' : 'baralhos'}</span>
                        <span>•</span>
                        <span>{subject.cardCount} cards</span>
                      </div>

                      {subject.dueCount > 0 ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                          <Flame className="w-3 h-3" />
                          {subject.dueCount} para revisar
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Em dia
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* 🗃️ NÍVEL 2: BARALHOS / TÓPICOS DA DISCIPLINA                  */}
        {/* ============================================================= */}
        {viewMode === 'decks' && currentSubject && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border bg-slate-900/30 border-slate-800/80">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBackToSubjects}
                  className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 transition-colors"
                  title="Voltar às Disciplinas"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-lg font-bold">{currentSubject.name}</h2>
                  <p className="text-xs text-slate-400">
                    {currentSubject.description || 'Baralhos e tópicos de memorização ativa'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenCreateDeck}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Novo Baralho</span>
                </button>
              </div>
            </div>

            {filteredDecks.length === 0 ? (
              <div className={`p-12 text-center rounded-2xl border ${isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Layers className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold mb-1">Nenhum baralho cadastrado em {currentSubject.name}</h3>
                <p className="text-xs text-slate-400 mb-5 max-w-sm mx-auto">
                  Crie seu primeiro baralho de tópicos ou gere uma bateria de 20 flashcards com inteligência artificial.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    onClick={handleOpenCreateDeck}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                  >
                    Criar Baralho Manual
                  </button>
                  <button
                    onClick={handleOpenAiGenerator}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-indigo-600/30 border border-indigo-500/40 hover:bg-indigo-600/50 text-indigo-300 transition-colors flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Gerar 20 Cards com IA
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDecks.map((deck) => (
                  <div
                    key={deck.id}
                    onClick={() => handleOpenDeck(deck)}
                    className={`group p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                      isDark
                        ? 'bg-slate-900/50 border-slate-800/80 hover:border-red-500/40 hover:bg-slate-900/80 hover:shadow-lg'
                        : 'bg-white border-slate-200 hover:border-red-400 hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-bold text-sm group-hover:text-red-400 transition-colors line-clamp-1">
                          {deck.name}
                        </h3>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleOpenEditDeck(deck, e)}
                            title="Editar Baralho"
                            className="p-1 rounded hover:bg-slate-700/40 text-slate-400 hover:text-slate-200"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handlePromptDeleteDeck(deck, e)}
                            title="Excluir Baralho"
                            className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                        {deck.description || 'Sem descrição específica para este baralho.'}
                      </p>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-slate-800/40">
                      {/* Progresso de retenção */}
                      <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-mono">
                        <div className="p-1 rounded bg-blue-500/10 text-blue-400">
                          <p className="font-bold">{deck.newCount}</p>
                          <p className="text-[9px] text-slate-500">Novos</p>
                        </div>
                        <div className="p-1 rounded bg-amber-500/10 text-amber-400">
                          <p className="font-bold">{deck.learningCount}</p>
                          <p className="text-[9px] text-slate-500">Aprender</p>
                        </div>
                        <div className="p-1 rounded bg-purple-500/10 text-purple-400">
                          <p className="font-bold">{deck.reviewCount}</p>
                          <p className="text-[9px] text-slate-500">Revisão</p>
                        </div>
                        <div className="p-1 rounded bg-emerald-500/10 text-emerald-400">
                          <p className="font-bold">{deck.masteredCount}</p>
                          <p className="text-[9px] text-slate-500">Fixado</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-mono text-slate-400">
                          {deck.cardCount} cards
                        </span>

                        {deck.cardCount > 0 ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleStartStudySession(deck);
                            }}
                            className="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Estudar {deck.dueCount > 0 ? `(${deck.dueCount})` : ''}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Vazio</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* 🃏 NÍVEL 3: GERENCIAMENTO DE CARDS DO BARALHO                  */}
        {/* ============================================================= */}
        {viewMode === 'cards' && currentDeck && (
          <div className="space-y-4">
            {/* Cabeçalho do Baralho */}
            <div className="p-5 rounded-2xl border bg-slate-900/30 border-slate-800/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleBackToDecks}
                    className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 transition-colors"
                    title="Voltar aos Baralhos"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <span>{currentDeck.name}</span>
                      <span className="text-xs font-normal text-slate-400 font-mono">({cards.length} cards)</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Disciplina: <span className="font-semibold text-slate-300">{currentSubject?.name || currentDeck.subjectName}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {cards.length > 0 && (
                    <button
                      onClick={() => handleStartStudySession(currentDeck)}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Estudar Agora</span>
                    </button>
                  )}
                  <button
                    onClick={handleOpenAddCardModal}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Novo Card</span>
                  </button>
                </div>
              </div>

              {/* Filtro por estado do cartão */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/40">
                <button
                  onClick={() => setCardFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    cardFilter === 'ALL'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'bg-slate-800/40 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Todos ({cards.length})
                </button>
                <button
                  onClick={() => setCardFilter('DUE')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                    cardFilter === 'DUE'
                      ? 'bg-red-600 text-white font-bold'
                      : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                  }`}
                >
                  <Flame className="w-3 h-3" />
                  Para Revisar
                </button>
                <button
                  onClick={() => setCardFilter('new')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    cardFilter === 'new'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                  }`}
                >
                  Novos
                </button>
                <button
                  onClick={() => setCardFilter('learning')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    cardFilter === 'learning'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  }`}
                >
                  Aprendendo
                </button>
                <button
                  onClick={() => setCardFilter('review')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    cardFilter === 'review'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                  }`}
                >
                  Revisão
                </button>
                <button
                  onClick={() => setCardFilter('mastered')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    cardFilter === 'mastered'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                  }`}
                >
                  Dominados
                </button>
                <button
                  onClick={() => setCardFilter('LEECH')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                    cardFilter === 'LEECH'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                  }`}
                  title="Cartões com 4 ou mais erros"
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Sanguessugas</span>
                </button>
              </div>
            </div>

            {/* Listagem de Cartões */}
            {loadingCards ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-slate-800/40 animate-pulse border border-slate-800/60" />
                ))}
              </div>
            ) : filteredCards.length === 0 ? (
              <div className={`p-12 text-center rounded-2xl border ${isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                <p className="text-sm font-bold mb-1">Nenhum flashcard encontrado neste filtro</p>
                <p className="text-xs text-slate-400 mb-4">Adicione um novo cartão ou gere uma bateria com IA.</p>
                <button
                  onClick={handleOpenAddCardModal}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white"
                >
                  Criar Novo Card
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCards.map((card, idx) => (
                  <div
                    key={card.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isDark ? 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-0.5">
                            Pergunta #{idx + 1}
                          </span>
                          <div className="text-sm font-semibold text-slate-200">
                            <ClozeLatexCard text={card.front} isAnswer={false} />
                          </div>
                          {card.frontImage && (
                            <div className="mt-2 inline-block">
                              <img
                                src={card.frontImage}
                                alt="Pergunta"
                                onClick={() => setExpandedImage(card.frontImage || null)}
                                className="h-16 w-auto object-cover rounded-lg border border-slate-700 cursor-pointer hover:opacity-80"
                              />
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-800/40">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-500 block mb-0.5">
                            Resposta
                          </span>
                          <div className="text-sm text-slate-300">
                            <ClozeLatexCard text={card.back} isAnswer={true} />
                          </div>
                          {card.backImage && (
                            <div className="mt-2 inline-block">
                              <img
                                src={card.backImage}
                                alt="Resposta"
                                onClick={() => setExpandedImage(card.backImage || null)}
                                className="h-16 w-auto object-cover rounded-lg border border-slate-700 cursor-pointer hover:opacity-80"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Metadados e Ações */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {card.lapses >= 4 && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {card.lapses} erros
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                            card.status === 'mastered'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : card.status === 'learning'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : card.status === 'review'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}
                        >
                          {card.status}
                        </span>

                        <span className="text-[10px] font-mono text-slate-400">
                          Próx: {card.nextReviewAt}
                        </span>

                        <div className="flex items-center gap-1 mt-1">
                          <button
                            onClick={(e) => handleOpenEditCardModal(card, e)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                            title="Editar Card"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handlePromptDeleteCard(card, e)}
                            className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                            title="Excluir Card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* 🎮 NÍVEL 4: PLAYER DE ESTUDO ANKI (REPETIÇÃO ESPAÇADA SM-2)   */}
        {/* ============================================================= */}
        {viewMode === 'study' && (
          <div className="max-w-3xl mx-auto space-y-6 pt-4">
            {studySessionFinished ? (
              <div className={`p-8 text-center rounded-3xl border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'} space-y-6`}>
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-1">Sessão de Revisão Concluída!</h2>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Você revisou todos os cartões desta rodada. As novas datas de repetição espaçada foram calculadas e registradas.
                  </p>
                </div>

                {/* Resumo da Sessão */}
                <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto font-mono text-xs">
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    <p className="font-bold text-base">{studySessionStats.again}</p>
                    <p className="text-[10px]">Errei</p>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <p className="font-bold text-base">{studySessionStats.hard}</p>
                    <p className="text-[10px]">Difícil</p>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <p className="font-bold text-base">{studySessionStats.good}</p>
                    <p className="text-[10px]">Bom</p>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <p className="font-bold text-base">{studySessionStats.easy}</p>
                    <p className="text-[10px]">Fácil</p>
                  </div>
                </div>

                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={handleBackToDecks}
                    className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    Voltar ao Baralho
                  </button>
                  {currentDeck && (
                    <button
                      onClick={() => handleStartStudySession(currentDeck)}
                      className="px-5 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors"
                    >
                      Estudar Novamente
                    </button>
                  )}
                </div>
              </div>
            ) : (
              studyQueue[currentCardIndex] && (
                <div className="space-y-4">
                  {/* Barra Superior de Controles e Status do Estudo */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
                    <button
                      onClick={handleBackToDecks}
                      className="flex items-center gap-1 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Sair (Esc)</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCramMode(!cramMode)}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                          cramMode
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        }`}
                        title="Clique para alternar entre repetição espaçada e treino livre"
                      >
                        {cramMode ? (
                          <>
                            <Zap className="w-3 h-3 text-amber-400 fill-current" />
                            <span>Modo Maratona (Treino Livre)</span>
                          </>
                        ) : (
                          <>
                            <BrainCircuit className="w-3 h-3 text-emerald-400" />
                            <span>Repetição Espaçada SM-2</span>
                          </>
                        )}
                      </button>

                      {studyQueue[currentCardIndex]?.lapses >= 4 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> Sanguessuga ({studyQueue[currentCardIndex].lapses} erros)
                        </span>
                      )}
                    </div>

                    <span>
                      Cartão {currentCardIndex + 1} de {studyQueue.length}
                    </span>
                  </div>

                  {/* Barra de Progresso Visual */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-red-500 h-full transition-all duration-300"
                      style={{ width: `${((currentCardIndex + 1) / studyQueue.length) * 100}%` }}
                    />
                  </div>

                  {/* Cartão Flashcard Anki com Efeito 3D Flip */}
                  <div className="w-full min-h-[380px]" style={{ perspective: '1200px' }}>
                    <div
                      className="relative w-full min-h-[380px] rounded-3xl transition-transform duration-500"
                      style={{
                        transformStyle: 'preserve-3d',
                        transform: isAnswerRevealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
                      }}
                    >
                      {/* LADO FRENTE (PERGUNTA) */}
                      <div
                        className={`p-8 rounded-3xl border min-h-[380px] flex flex-col justify-between shadow-xl transition-all ${
                          isDark
                            ? 'bg-slate-900/90 border-slate-800 shadow-slate-950/40'
                            : 'bg-white border-slate-200 shadow-slate-200/50'
                        } ${isAnswerRevealed ? 'pointer-events-none' : ''}`}
                        style={{ backfaceVisibility: 'hidden' }}
                      >
                        <div className="space-y-4">
                          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-slate-500">
                            <span>Frente // Pergunta</span>
                            <span className="text-slate-400 font-bold">{currentDeck?.name || currentSubject?.name || 'Geral'}</span>
                          </div>

                          <div className="text-lg sm:text-xl font-semibold text-slate-100 leading-relaxed">
                            <ClozeLatexCard text={studyQueue[currentCardIndex].front} isAnswer={false} />
                          </div>

                          {studyQueue[currentCardIndex].frontImage && (
                            <div className="mt-3">
                              <img
                                src={studyQueue[currentCardIndex].frontImage!}
                                alt="Imagem da Pergunta"
                                onClick={() => setExpandedImage(studyQueue[currentCardIndex].frontImage || null)}
                                className="max-h-52 rounded-xl border border-slate-700 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            </div>
                          )}
                        </div>

                        <div className="pt-6 border-t border-slate-800/60 mt-6">
                          <button
                            type="button"
                            onClick={handleRevealAnswer}
                            className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-red-950/30 flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <span>Mostrar Resposta</span>
                            <kbd className="text-[10px] bg-red-800/60 px-1.5 py-0.5 rounded text-red-200 font-mono">
                              Espaço
                            </kbd>
                          </button>
                        </div>
                      </div>

                      {/* LADO VERSO (RESPOSTA - GIRADO 180 DEG) */}
                      <div
                        className={`p-8 rounded-3xl border min-h-[380px] flex flex-col justify-between shadow-xl transition-all absolute inset-0 ${
                          isDark
                            ? 'bg-slate-900/95 border-emerald-900/40 shadow-slate-950/50'
                            : 'bg-white border-emerald-200 shadow-slate-200/60'
                        } ${!isAnswerRevealed ? 'pointer-events-none' : ''}`}
                        style={{
                          backfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)',
                        }}
                      >
                        <div className="space-y-4">
                          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-emerald-400">
                            <span>Verso // Resposta</span>
                            <span className="text-slate-400 font-mono text-[10px]">
                              {cramMode
                                ? '⚡ Treino Livre (Sem alterar SM-2)'
                                : `Intervalo atual: ${studyQueue[currentCardIndex].intervalDays}d`}
                            </span>
                          </div>

                          <div className="text-base sm:text-lg text-slate-200 leading-relaxed">
                            <ClozeLatexCard text={studyQueue[currentCardIndex].back} isAnswer={true} />
                          </div>

                          {studyQueue[currentCardIndex].backImage && (
                            <div className="mt-3">
                              <img
                                src={studyQueue[currentCardIndex].backImage!}
                                alt="Imagem da Resposta"
                                onClick={() => setExpandedImage(studyQueue[currentCardIndex].backImage || null)}
                                className="max-h-52 rounded-xl border border-slate-700 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            </div>
                          )}
                        </div>

                        {/* 4 Botões Anki SM-2 */}
                        <div className="pt-6 border-t border-slate-800/60 mt-6">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button
                              type="button"
                              onClick={() => void handleRateCard(1)}
                              className="p-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 flex flex-col items-center gap-1 transition-all cursor-pointer"
                            >
                              <span className="text-xs font-bold">Errei</span>
                              <span className="text-[10px] font-mono opacity-80">{cramMode ? 'Rever' : '< 10m'}</span>
                              <kbd className="text-[9px] bg-rose-950/60 px-1.5 py-0.5 rounded mt-0.5">1</kbd>
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleRateCard(2)}
                              className="p-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 flex flex-col items-center gap-1 transition-all cursor-pointer"
                            >
                              <span className="text-xs font-bold">Difícil</span>
                              <span className="text-[10px] font-mono opacity-80">{cramMode ? 'Praticar' : '1 dia'}</span>
                              <kbd className="text-[9px] bg-amber-950/60 px-1.5 py-0.5 rounded mt-0.5">2</kbd>
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleRateCard(3)}
                              className="p-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 flex flex-col items-center gap-1 transition-all cursor-pointer"
                            >
                              <span className="text-xs font-bold">Bom</span>
                              <span className="text-[10px] font-mono opacity-80">{cramMode ? 'Acertei' : '3 dias'}</span>
                              <kbd className="text-[9px] bg-blue-950/60 px-1.5 py-0.5 rounded mt-0.5">3</kbd>
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleRateCard(4)}
                              className="p-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 flex flex-col items-center gap-1 transition-all cursor-pointer"
                            >
                              <span className="text-xs font-bold">Fácil</span>
                              <span className="text-[10px] font-mono opacity-80">{cramMode ? 'Dominado' : '6 dias'}</span>
                              <kbd className="text-[9px] bg-emerald-950/60 px-1.5 py-0.5 rounded mt-0.5">4</kbd>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* 🪟 MODAIS DE CRIAÇÃO, EDIÇÃO E EXCLUSÃO                       */}
        {/* ============================================================= */}

        {/* Modal Disciplina */}
        {isSubjectModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className={`w-full max-w-md p-6 rounded-2xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">
                  {editingSubject ? 'Editar Disciplina' : 'Nova Disciplina'}
                </h3>
                <button onClick={() => setIsSubjectModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveSubject} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Nome da Disciplina *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Matemática, Física, Português..."
                    value={subjectFormName}
                    onChange={(e) => setSubjectFormName(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border text-sm ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Descrição (Opcional)
                  </label>
                  <textarea
                    placeholder="Ex: Foco no edital do CFO CBMERJ..."
                    rows={3}
                    value={subjectFormDesc}
                    onChange={(e) => setSubjectFormDesc(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border text-sm resize-none ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                    Identidade Visual // Cor
                  </label>
                  <div className="flex gap-2">
                    {PALETTE_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setSubjectFormColor(c.value)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          subjectFormColor === c.value ? 'scale-110 border-white' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor:
                            c.value === 'red' ? '#ef4444' :
                            c.value === 'blue' ? '#3b82f6' :
                            c.value === 'emerald' ? '#10b981' :
                            c.value === 'amber' ? '#f59e0b' :
                            c.value === 'indigo' ? '#6366f1' : '#06b6d4'
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsSubjectModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white"
                  >
                    {editingSubject ? 'Salvar Alterações' : 'Criar Disciplina'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Baralho */}
        {isDeckModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className={`w-full max-w-md p-6 rounded-2xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">
                  {editingDeck ? 'Editar Baralho' : 'Novo Baralho / Tópico'}
                </h3>
                <button onClick={() => setIsDeckModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveDeck} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Disciplina Pertencente *
                  </label>
                  <select
                    value={deckFormSubjectId}
                    onChange={(e) => setDeckFormSubjectId(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border text-sm ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Nome do Baralho // Tópico *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Logaritmos, Citologia, Lei de Lavoisier..."
                    value={deckFormName}
                    onChange={(e) => setDeckFormName(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border text-sm ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Descrição (Opcional)
                  </label>
                  <textarea
                    placeholder="Ex: Conceitos mais cobrados em prova..."
                    rows={3}
                    value={deckFormDesc}
                    onChange={(e) => setDeckFormDesc(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border text-sm resize-none ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsDeckModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white"
                  >
                    {editingDeck ? 'Salvar Baralho' : 'Criar Baralho'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Flashcard (Frente / Verso / Fotos) */}
        {isCardModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className={`w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">
                  {editingCard ? 'Editar Flashcard' : 'Novo Flashcard'}
                </h3>
                <button onClick={() => setIsCardModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCard} className="space-y-4">
                {/* Frente */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      Frente (Pergunta)
                    </label>
                    <button
                      type="button"
                      onClick={() => questionFileInputRef.current?.click()}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Anexar Foto</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Escreva a pergunta ou cole uma foto diretamente (Ctrl+V)..."
                    value={cardFormFront}
                    onChange={(e) => setCardFormFront(e.target.value)}
                    onPaste={(e) => handlePasteImage(e, 'front')}
                    className={`w-full p-2.5 rounded-xl border text-sm resize-none ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                  />
                  <input
                    ref={questionFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void processImageFile(file, 'front');
                      e.target.value = '';
                    }}
                  />
                  {cardFormFrontImage && (
                    <div className="relative inline-block mt-2">
                      <img
                        src={cardFormFrontImage}
                        alt="Preview Frente"
                        className="h-20 rounded-lg border border-slate-700 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setCardFormFrontImage(null)}
                        className="absolute -top-2 -right-2 p-1 rounded-full bg-red-600 text-white text-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Verso */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      Verso (Resposta)
                    </label>
                    <button
                      type="button"
                      onClick={() => answerFileInputRef.current?.click()}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Anexar Foto</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Escreva a resposta ou cole uma foto diretamente (Ctrl+V)..."
                    value={cardFormBack}
                    onChange={(e) => setCardFormBack(e.target.value)}
                    onPaste={(e) => handlePasteImage(e, 'back')}
                    className={`w-full p-2.5 rounded-xl border text-sm resize-none ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                  />
                  <input
                    ref={answerFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void processImageFile(file, 'back');
                      e.target.value = '';
                    }}
                  />
                  {cardFormBackImage && (
                    <div className="relative inline-block mt-2">
                      <img
                        src={cardFormBackImage}
                        alt="Preview Verso"
                        className="h-20 rounded-lg border border-slate-700 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setCardFormBackImage(null)}
                        className="absolute -top-2 -right-2 p-1 rounded-full bg-red-600 text-white text-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCardModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white"
                  >
                    {editingCard ? 'Salvar Alterações' : 'Adicionar ao Baralho'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Importação em Lote */}
        {isBatchModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className={`w-full max-w-xl p-6 rounded-2xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} space-y-4 shadow-2xl`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-red-500" />
                  <h3 className="font-bold text-base">Importação em Lote para {currentDeck?.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Cole suas perguntas e respostas linha por linha. O sistema aceita como separador <strong>ponto-e-vírgula (;)</strong>, <strong>tabulação</strong> ou <strong>três traços (---)</strong>.
              </p>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-[11px] text-slate-400 leading-relaxed">
                <span className="text-slate-500 font-bold block mb-1">// Exemplo de formato:</span>
                Ano de criação do CBMERJ? ; 1856<br />
                Equação de Torricelli? ; v² = v0² + 2aΔs<br />
                Capital do Estado do RJ? ; Rio de Janeiro
              </div>

              <textarea
                rows={8}
                placeholder="Cole suas linhas aqui..."
                value={batchInputText}
                onChange={(e) => setBatchInputText(e.target.value)}
                className={`w-full p-3 rounded-xl border text-xs font-mono transition-all ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                    : 'bg-white border-slate-200 text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                }`}
              />

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-mono text-slate-400">
                  {batchInputText.split(/\r?\n/).filter((l) => l.trim().includes(';') || l.trim().includes('\t') || l.trim().includes('---')).length} cartões identificados
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBatchModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={batchImporting || !batchInputText.trim()}
                    onClick={handleImportBatch}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors cursor-pointer"
                  >
                    {batchImporting ? 'Importando...' : 'Importar Cartões'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Exclusão com Confirmação e Aviso em Cascata */}
        {deleteModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className={`w-full max-w-md p-6 rounded-2xl border ${isDark ? 'bg-slate-900 border-red-500/40' : 'bg-white border-red-300'} space-y-4 shadow-2xl`}>
              <div className="flex items-center gap-3 text-red-500">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <h3 className="font-bold text-base text-slate-100">
                  Excluir &quot;{deleteModal.title}&quot;?
                </h3>
              </div>

              <div className="text-xs text-slate-300 space-y-2">
                {deleteModal.type === 'subject' && (
                  <p className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 font-mono leading-relaxed">
                    <strong>{deleteModal.deckCount || 0} baralhos</strong> e <strong>{deleteModal.cardCount || 0} flashcards</strong> serão permanentemente removidos.
                  </p>
                )}
                {deleteModal.type === 'deck' && (
                  <p className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 font-mono leading-relaxed">
                    <strong>{deleteModal.cardCount || 0} flashcards</strong> contidos neste baralho serão permanentemente removidos.
                  </p>
                )}
                {deleteModal.type === 'card' && (
                  <p className="text-slate-400">
                    Este flashcard e seu histórico de revisões serão removidos do baralho.
                  </p>
                )}
                <p className="text-slate-400 text-[11px]">
                  Esta ação é irreversível e não poderá ser desfeita.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setDeleteModal(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white"
                >
                  Excluir Definitivamente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Gerador de Flashcards com IA */}
        {isAiModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className={`w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} space-y-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-base">Gerador Tático de 20 Flashcards IA</h3>
                </div>
                <button onClick={() => setIsAiModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Matéria ou Tópico de Estudo
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Leis Ponderais, Torricelli, Regência Verbal..."
                    value={aiTopicInput}
                    onChange={(e) => setAiTopicInput(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border text-sm ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                      Disciplina de Destino
                    </label>
                    <select
                      value={aiTargetSubjectId}
                      onChange={(e) => {
                        setAiTargetSubjectId(e.target.value);
                        void fetchDecksForSubject(e.target.value);
                      }}
                      className={`w-full p-2.5 rounded-xl border text-sm ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                    >
                      {subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                      Baralho de Destino
                    </label>
                    <select
                      value={aiTargetDeckId}
                      onChange={(e) => setAiTargetDeckId(e.target.value)}
                      className={`w-full p-2.5 rounded-xl border text-sm ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                    >
                      <option value="new_deck">+ Criar Novo Baralho com Este Tema</option>
                      {decks.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {aiTargetDeckId === 'new_deck' && (
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                      Título do Novo Baralho
                    </label>
                    <input
                      type="text"
                      placeholder={aiTopicInput.trim() || 'Nome do Baralho'}
                      value={aiNewDeckTitle}
                      onChange={(e) => setAiNewDeckTitle(e.target.value)}
                      className={`w-full p-2.5 rounded-xl border text-sm ${isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`}
                    />
                  </div>
                )}

                <button
                  type="button"
                  disabled={isAiLoading}
                  onClick={handleGenerateWithAi}
                  className="w-full py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-red-600 via-red-700 to-amber-600 hover:opacity-95 text-white transition-opacity flex items-center justify-center gap-2"
                >
                  {isAiLoading ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Gerando 20 Flashcards Bate-Pronto...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Gerar Bateria com IA Agora</span>
                    </>
                  )}
                </button>

                {aiPreviewCards.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
                        {aiPreviewCards.length} cards gerados com sucesso
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2 p-2 rounded-xl bg-slate-800/40 border border-slate-700/60">
                      {aiPreviewCards.map((c, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-slate-900/80 text-xs space-y-1">
                          <p className="font-bold text-slate-200">P: {c.question}</p>
                          <p className="text-emerald-400 font-mono">R: {c.answer}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsAiModalOpen(false)}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAiCards}
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Salvar Todos no Baralho
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de Foto Expandida em Tela Cheia */}
        {expandedImage && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setExpandedImage(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh]">
              <img
                src={expandedImage}
                alt="Expandida"
                className="max-h-[85vh] max-w-full object-contain rounded-xl border border-slate-700"
              />
              <button
                onClick={() => setExpandedImage(null)}
                className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ErrorNotebookTab;
