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
  HelpCircle,
  Flame,
  Trash2,
  BookOpen,
  ArrowLeft,
  Search,
  Filter,
  Eye,
  Check,
  X,
  Volume2,
  Calendar,
  Shuffle,
  Tag,
  Zap,
  Image as ImageIcon,
  Upload,
  Edit3,
  Maximize2,
} from 'lucide-react';
import { AppTheme } from '../types';
import { getUserStorageKey } from '../utils/userStorage';

export interface Flashcard {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  questionImage?: string; // Data URL Base64 da imagem da pergunta
  answerImage?: string; // Data URL Base64 da imagem da resposta
  createdAt: string;
  lastReviewedAt?: string;
  state: 'new' | 'learning' | 'review' | 'mastered';
  repetitions: number;
  intervalDays: number;
  nextReviewDate: string; // YYYY-MM-DD
}

export interface Deck {
  id: string;
  title: string;
  subject: string;
  description?: string;
  createdAt: string;
}

interface ErrorNotebookTabProps {
  theme?: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Compactador automático de imagens para não estourar o localStorage
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

// Baralhos iniciais de alta retenção para o CFO CBMERJ
const INITIAL_DECKS: Deck[] = [
  {
    id: 'deck_quimica_estequio',
    title: 'Química // Estequiometria & Soluções',
    subject: 'Química',
    description: 'Leis ponderais, proporção molar, pureza e rendimento.',
    createdAt: '2026-05-01T10:00:00Z',
  },
  {
    id: 'deck_fisica_cinematica',
    title: 'Física // Cinemática & Torricelli',
    subject: 'Física',
    description: 'Equações horárias, Torricelli, lançamentos e gráficos.',
    createdAt: '2026-05-01T10:00:00Z',
  },
];

const INITIAL_CARDS: Flashcard[] = [
  {
    id: 'c_q_01',
    deckId: 'deck_quimica_estequio',
    question: 'O que diz a Lei de Lavoisier?',
    answer: 'Na natureza nada se cria, tudo se transforma (conservação da massa total).',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_q_02',
    deckId: 'deck_quimica_estequio',
    question: 'O que diz a Lei de Proust?',
    answer: 'Proporção em massa entre reagentes e produtos é sempre fixa e constante.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_q_03',
    deckId: 'deck_quimica_estequio',
    question: 'Qual o valor do volume molar nas CNTP?',
    answer: '22,4 L/mol para qualquer gás ideal.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_q_04',
    deckId: 'deck_quimica_estequio',
    question: 'Qual o valor do número de Avogadro?',
    answer: '6,02 x 10²³ entidades por mol.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_q_05',
    deckId: 'deck_quimica_estequio',
    question: 'Quando aplicar a pureza no cálculo estequiométrico?',
    answer: 'Logo no início, sobre a massa do reagente bruto impuro.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_f_01',
    deckId: 'deck_fisica_cinematica',
    question: 'Qual a Equação de Torricelli?',
    answer: 'v² = v₀² + 2 * a * Δs.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_f_02',
    deckId: 'deck_fisica_cinematica',
    question: 'Quando usar a Equação de Torricelli?',
    answer: 'Sempre que o tempo (t) não for fornecido nem requisitado.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_f_03',
    deckId: 'deck_fisica_cinematica',
    question: 'Qual a aceleração no topo de um lançamento vertical?',
    answer: 'Gravidade (g = 10 m/s² orientada para baixo).',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
];

export const ErrorNotebookTab: React.FC<ErrorNotebookTabProps> = ({
  theme = 'dark',
  showToast,
}) => {
  const isDark = theme === 'dark';

  // 1. Estado dos Baralhos (Decks)
  const [decks, setDecks] = useState<Deck[]>(() => {
    try {
      const storageKey = getUserStorageKey('cfo_anki_decks');
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_DECKS;
  });

  // 2. Estado dos Flashcards (Conta nova de cadete começa limpa)
  const [cards, setCards] = useState<Flashcard[]>(() => {
    try {
      const storageKey = getUserStorageKey('cfo_anki_cards');
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    const isMasterAdmin = !localStorage.getItem('cfo_terminal_user') || localStorage.getItem('cfo_terminal_user') === 'admin';
    return isMasterAdmin ? INITIAL_CARDS : [];
  });

  // Salva no localStorage
  useEffect(() => {
    try {
      const storageKey = getUserStorageKey('cfo_anki_decks');
      localStorage.setItem(storageKey, JSON.stringify(decks));
    } catch {}
  }, [decks]);

  useEffect(() => {
    try {
      const storageKey = getUserStorageKey('cfo_anki_cards');
      localStorage.setItem(storageKey, JSON.stringify(cards));
    } catch (err) {
      console.warn('LocalStorage limit reached for cards:', err);
    }
  }, [cards]);

  // Filtros de Baralhos
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('TODOS');

  // Modais e Estados de Visualização
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isCreateDeckModalOpen, setIsCreateDeckModalOpen] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [activeDeckForAdd, setActiveDeckForAdd] = useState<string>('');

  // Modal para expandir imagem em tela cheia
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // Modo de Treino (Anki Player)
  const [activeStudyingDeckId, setActiveStudyingDeckId] = useState<string | null>(null);
  const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [studySessionFinished, setStudySessionFinished] = useState(false);

  // Visualização de Lista de Cards do Baralho
  const [inspectingDeckId, setInspectingDeckId] = useState<string | null>(null);

  // Estado do Gerador com IA
  const [aiTopicInput, setAiTopicInput] = useState('');
  const [aiTargetDeckId, setAiTargetDeckId] = useState<string>('new_deck');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPreviewCards, setAiPreviewCards] = useState<Array<{ question: string; answer: string }>>([]);

  // Estado do Criador de Baralho Manual
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckSubject, setNewDeckSubject] = useState('Geral');

  // Estado do Criador/Editor de Card Manual (com fotos e múltiplas linhas)
  const [manualQuestion, setManualQuestion] = useState('');
  const [manualAnswer, setManualAnswer] = useState('');
  const [manualQuestionImage, setManualQuestionImage] = useState<string | null>(null);
  const [manualAnswerImage, setManualAnswerImage] = useState<string | null>(null);

  // Refs de arquivo
  const questionFileInputRef = useRef<HTMLInputElement | null>(null);
  const answerFileInputRef = useRef<HTMLInputElement | null>(null);

  // Matérias disponíveis para filtro
  const availableSubjects = useMemo(() => {
    const subs = new Set<string>();
    decks.forEach((d) => {
      if (d.subject) subs.add(d.subject);
    });
    return ['TODOS', ...Array.from(subs)];
  }, [decks]);

  // Estatísticas por Baralho
  const deckStats = useMemo(() => {
    const map: Record<
      string,
      { total: number; newCount: number; learningCount: number; masteredCount: number }
    > = {};

    decks.forEach((deck) => {
      const deckCards = cards.filter((c) => c.deckId === deck.id);
      map[deck.id] = {
        total: deckCards.length,
        newCount: deckCards.filter((c) => c.state === 'new').length,
        learningCount: deckCards.filter((c) => c.state === 'learning' || c.state === 'review')
          .length,
        masteredCount: deckCards.filter((c) => c.state === 'mastered').length,
      };
    });

    return map;
  }, [decks, cards]);

  // Baralhos filtrados
  const filteredDecks = useMemo(() => {
    return decks.filter((d) => {
      const matchesSearch =
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.subject.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSubject =
        selectedSubjectFilter === 'TODOS' || d.subject === selectedSubjectFilter;
      return matchesSearch && matchesSubject;
    });
  }, [decks, searchQuery, selectedSubjectFilter]);

  // =========================================================================
  // 📷 CAPTURA E COLAGEM DE IMAGENS (CLIPBOARD E ARQUIVO)
  // =========================================================================
  const processImageFile = async (file: File, target: 'question' | 'answer') => {
    if (!file.type.startsWith('image/')) {
      showToast?.('Apenas arquivos de imagem são aceitos.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawBase64 = event.target?.result as string;
      if (rawBase64) {
        const compressed = await compressImage(rawBase64);
        if (target === 'question') {
          setManualQuestionImage(compressed);
        } else {
          setManualAnswerImage(compressed);
        }
        showToast?.('Foto anexada com sucesso!', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasteImage = (e: React.ClipboardEvent, target: 'question' | 'answer') => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          processImageFile(file, target);
          return;
        }
      }
    }
  };

  const handleFileInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'question' | 'answer'
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file, target);
    }
    e.target.value = '';
  };

  // =========================================================================
  // 🎮 MODO DE TREINO (PLAYER ESTILO ANKI COM SRS)
  // =========================================================================
  const handleStartStudySession = (deckId: string) => {
    const deckCards = cards.filter((c) => c.deckId === deckId);
    if (deckCards.length === 0) {
      showToast?.('Este baralho ainda não tem flashcards.', 'info');
      return;
    }

    const shuffled = [...deckCards].sort(() => Math.random() - 0.5);
    setStudyQueue(shuffled);
    setCurrentCardIndex(0);
    setIsAnswerRevealed(false);
    setStudySessionFinished(false);
    setActiveStudyingDeckId(deckId);
  };

  const handleRevealAnswer = useCallback(() => {
    setIsAnswerRevealed(true);
  }, []);

  const handleRateCard = useCallback(
    (rating: 1 | 2 | 3) => {
      if (!studyQueue[currentCardIndex]) return;

      const currentCard = studyQueue[currentCardIndex];
      const today = new Date().toISOString().split('T')[0];

      let nextState: 'new' | 'learning' | 'review' | 'mastered' = currentCard.state;
      let nextRepetitions = currentCard.repetitions;
      let nextIntervalDays = currentCard.intervalDays;

      if (rating === 1) {
        nextState = 'learning';
        nextRepetitions = 0;
        nextIntervalDays = 0;
      } else if (rating === 2) {
        nextState = 'review';
        nextRepetitions += 1;
        nextIntervalDays = nextRepetitions === 1 ? 1 : Math.round(nextIntervalDays * 1.5) || 2;
      } else {
        nextState = 'mastered';
        nextRepetitions += 1;
        nextIntervalDays = nextRepetitions === 1 ? 3 : Math.round(nextIntervalDays * 2.5) || 4;
      }

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + Math.max(1, nextIntervalDays));
      const nextReviewDate = targetDate.toISOString().split('T')[0];

      setCards((prev) =>
        prev.map((c) =>
          c.id === currentCard.id
            ? {
                ...c,
                state: nextState,
                repetitions: nextRepetitions,
                intervalDays: nextIntervalDays,
                lastReviewedAt: today,
                nextReviewDate,
              }
            : c
        )
      );

      if (rating === 1) {
        setStudyQueue((prev) => [...prev, currentCard]);
      }

      if (currentCardIndex + 1 < studyQueue.length) {
        setCurrentCardIndex((prev) => prev + 1);
        setIsAnswerRevealed(false);
      } else {
        setStudySessionFinished(true);
      }
    },
    [studyQueue, currentCardIndex]
  );

  // Atalhos de teclado no modo estudo
  useEffect(() => {
    if (!activeStudyingDeckId || studySessionFinished) return;

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
          handleRateCard(1);
        } else if (e.key === '2') {
          e.preventDefault();
          handleRateCard(2);
        } else if (e.key === '3') {
          e.preventDefault();
          handleRateCard(3);
        }
      }

      if (e.key === 'Escape') {
        setActiveStudyingDeckId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeStudyingDeckId, isAnswerRevealed, studySessionFinished, handleRevealAnswer, handleRateCard]);

  // =========================================================================
  // ⚡ GERADOR DE 20 FLASHCARDS COM IA (Rigorosamente 1 linha)
  // =========================================================================
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
        showToast?.(`IA gerou ${data.cards.length} flashcards bate-pronto!`, 'success');
      } else {
        showToast?.(data.message || 'Falha ao gerar flashcards pela IA.', 'error');
      }
    } catch (err: any) {
      showToast?.('Erro de conexão ao gerar com IA.', 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSaveAiCards = () => {
    if (aiPreviewCards.length === 0) return;

    let targetDeckId = aiTargetDeckId;
    const topicTitle = aiTopicInput.trim();

    if (targetDeckId === 'new_deck') {
      const newDeck: Deck = {
        id: `deck_${Date.now()}`,
        title: topicTitle,
        subject: topicTitle.includes('Química')
          ? 'Química'
          : topicTitle.includes('Física')
          ? 'Física'
          : topicTitle.includes('Português')
          ? 'Português'
          : 'Geral',
        description: `Baralho gerado por IA com 20 flashcards bate-pronto.`,
        createdAt: new Date().toISOString(),
      };
      setDecks((prev) => [newDeck, ...prev]);
      targetDeckId = newDeck.id;
    }

    const today = new Date().toISOString().split('T')[0];

    const newCards: Flashcard[] = aiPreviewCards.map((c, idx) => ({
      id: `card_${Date.now()}_${idx}`,
      deckId: targetDeckId,
      question: c.question,
      answer: c.answer,
      createdAt: new Date().toISOString(),
      state: 'new',
      repetitions: 0,
      intervalDays: 0,
      nextReviewDate: today,
    }));

    setCards((prev) => [...newCards, ...prev]);
    setIsAiModalOpen(false);
    setAiPreviewCards([]);
    setAiTopicInput('');

    showToast?.(`${newCards.length} flashcards adicionados ao baralho!`, 'success');
  };

  // =========================================================================
  // ➕ CRIAR BARALHO MANUAL
  // =========================================================================
  const handleCreateDeck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckTitle.trim()) return;

    const newDeck: Deck = {
      id: `deck_${Date.now()}`,
      title: newDeckTitle.trim(),
      subject: newDeckSubject.trim() || 'Geral',
      createdAt: new Date().toISOString(),
    };

    setDecks((prev) => [newDeck, ...prev]);
    setNewDeckTitle('');
    setIsCreateDeckModalOpen(false);
    showToast?.('Baralho criado com sucesso!', 'success');
  };

  // =========================================================================
  // ➕ SALVAR / EDITAR FLASHCARD MANUAL (COM FOTOS E MÚLTIPLAS LINHAS)
  // =========================================================================
  const handleOpenAddCardModal = (deckId: string) => {
    setActiveDeckForAdd(deckId);
    setEditingCardId(null);
    setManualQuestion('');
    setManualAnswer('');
    setManualQuestionImage(null);
    setManualAnswerImage(null);
    setIsCardModalOpen(true);
  };

  const handleOpenEditCardModal = (card: Flashcard) => {
    setActiveDeckForAdd(card.deckId);
    setEditingCardId(card.id);
    setManualQuestion(card.question);
    setManualAnswer(card.answer);
    setManualQuestionImage(card.questionImage || null);
    setManualAnswerImage(card.answerImage || null);
    setIsCardModalOpen(true);
  };

  const handleSaveManualCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuestion.trim() && !manualQuestionImage) {
      showToast?.('Informe a pergunta ou cole uma foto.', 'error');
      return;
    }
    if (!manualAnswer.trim() && !manualAnswerImage) {
      showToast?.('Informe a resposta ou cole uma foto.', 'error');
      return;
    }

    if (editingCardId) {
      // Edição de card existente
      setCards((prev) =>
        prev.map((c) =>
          c.id === editingCardId
            ? {
                ...c,
                question: manualQuestion.trim(),
                answer: manualAnswer.trim(),
                questionImage: manualQuestionImage || undefined,
                answerImage: manualAnswerImage || undefined,
              }
            : c
        )
      );
      showToast?.('Flashcard atualizado!', 'success');
    } else {
      // Criação de novo card
      const newCard: Flashcard = {
        id: `card_${Date.now()}`,
        deckId: activeDeckForAdd,
        question: manualQuestion.trim(),
        answer: manualAnswer.trim(),
        questionImage: manualQuestionImage || undefined,
        answerImage: manualAnswerImage || undefined,
        createdAt: new Date().toISOString(),
        state: 'new',
        repetitions: 0,
        intervalDays: 0,
        nextReviewDate: new Date().toISOString().split('T')[0],
      };
      setCards((prev) => [newCard, ...prev]);
      showToast?.('Flashcard adicionado ao baralho!', 'success');
    }

    setIsCardModalOpen(false);
    setEditingCardId(null);
    setManualQuestion('');
    setManualAnswer('');
    setManualQuestionImage(null);
    setManualAnswerImage(null);
  };

  // =========================================================================
  // 🗑️ EXCLUSÕES
  // =========================================================================
  const handleDeleteDeck = (deckId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Deseja excluir este baralho e todos os flashcards contidos nele?')) {
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
      setCards((prev) => prev.filter((c) => c.deckId !== deckId));
      if (inspectingDeckId === deckId) setInspectingDeckId(null);
      showToast?.('Baralho excluído.', 'info');
    }
  };

  const handleDeleteCard = (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    showToast?.('Card excluído.', 'info');
  };

  const activeStudyingDeck = decks.find((d) => d.id === activeStudyingDeckId);
  const activeInspectingDeck = decks.find((d) => d.id === inspectingDeckId);

  // =========================================================================
  // 📺 RENDERIZAÇÃO: MODO DE TREINO (ANKI PLAYER COM FOTOS)
  // =========================================================================
  if (activeStudyingDeckId && activeStudyingDeck) {
    const currentCard = studyQueue[currentCardIndex];

    return (
      <div className="space-y-6 max-w-3xl mx-auto animate-in zoom-in-95 duration-200 pb-12">
        {/* Topo do Modo de Estudo */}
        <div className="flex items-center justify-between border-b pb-4 border-slate-700/60">
          <button
            type="button"
            onClick={() => setActiveStudyingDeckId(null)}
            className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                : 'bg-white border-slate-300 text-slate-700 hover:text-black'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar aos Baralhos (Esc)</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-slate-400">
              {currentCardIndex + 1} de {studyQueue.length}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-950/80 text-red-400 border border-red-800/50">
              {activeStudyingDeck.subject}
            </span>
          </div>
        </div>

        {/* Barra de Progresso Superior */}
        <div
          className={`h-2 w-full rounded-full overflow-hidden border ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300'
          }`}
        >
          <div
            className="h-full bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500 transition-all duration-300"
            style={{
              width: `${Math.round(((currentCardIndex + 1) / studyQueue.length) * 100)}%`,
            }}
          />
        </div>

        {/* Conclusão da Sessão */}
        {studySessionFinished ? (
          <div
            className={`p-10 rounded-2xl border text-center space-y-5 shadow-2xl ${
              isDark ? 'bg-[#0B1528] border-slate-800' : 'bg-white border-slate-300'
            }`}
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2
                className={`text-xl font-black uppercase tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-950'
                }`}
              >
                Missão Cumprida!
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Você revisou todos os {studyQueue.length} flashcards deste baralho com foco em memorização ativa.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3 flex-wrap">
              <button
                type="button"
                onClick={() => handleStartStudySession(activeStudyingDeck.id)}
                className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-red-700 hover:bg-red-600 text-white shadow-lg transition-all cursor-pointer flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Revisar Novamente</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStudyingDeckId(null)}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                    : 'bg-slate-100 border-slate-300 text-slate-800 hover:text-black'
                }`}
              >
                Voltar aos Baralhos
              </button>
            </div>
          </div>
        ) : (
          /* O Card de Treino Ativo */
          <div className="space-y-5">
            <div
              onClick={!isAnswerRevealed ? handleRevealAnswer : undefined}
              className={`p-6 sm:p-10 rounded-3xl border shadow-2xl transition-all duration-300 min-h-[340px] flex flex-col justify-between relative overflow-hidden select-none cursor-pointer ${
                isDark
                  ? 'bg-gradient-to-br from-[#0B1528] via-slate-950 to-black border-slate-800 shadow-black/60'
                  : 'bg-white border-slate-300 shadow-slate-200/80'
              }`}
            >
              {/* Top Card Info */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-red-400">
                  {activeStudyingDeck.title}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                    currentCard.state === 'mastered'
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                      : currentCard.state === 'learning'
                      ? 'bg-amber-950/80 text-amber-400 border-amber-800/60'
                      : 'bg-blue-950/80 text-blue-400 border-blue-800/60'
                  }`}
                >
                  {currentCard.state === 'mastered'
                    ? 'Dominado'
                    : currentCard.state === 'learning'
                    ? 'Em Treino'
                    : 'Novo'}
                </span>
              </div>

              {/* Corpo da Pergunta / Resposta */}
              <div className="space-y-6 my-auto text-center py-4">
                {/* Pergunta (Texto Multilinha + Foto opcional) */}
                <div className="space-y-3">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Pergunta
                  </span>
                  {currentCard.question && (
                    <h3
                      className={`text-base sm:text-lg font-black leading-relaxed max-w-xl mx-auto whitespace-pre-line text-left sm:text-center ${
                        isDark ? 'text-white' : 'text-slate-950'
                      }`}
                    >
                      {currentCard.question}
                    </h3>
                  )}

                  {/* Foto da Pergunta */}
                  {currentCard.questionImage && (
                    <div className="pt-2">
                      <img
                        src={currentCard.questionImage}
                        alt="Foto da Pergunta"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedImage(currentCard.questionImage!);
                        }}
                        className="max-h-60 sm:max-h-72 mx-auto rounded-2xl border border-slate-700 object-contain shadow-lg hover:opacity-95 transition-opacity"
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">
                        (Clique na imagem para ampliar)
                      </span>
                    </div>
                  )}
                </div>

                {/* Resposta Revelada (Texto Multilinha + Foto opcional) */}
                {isAnswerRevealed && (
                  <div className="animate-in fade-in zoom-in-95 duration-200 pt-5 border-t border-slate-700/40 space-y-3">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Resposta
                    </span>

                    {currentCard.answer && (
                      <div
                        className={`text-sm sm:text-base font-bold max-w-xl mx-auto px-4 py-3 rounded-2xl border leading-relaxed shadow-lg whitespace-pre-line text-left sm:text-center ${
                          isDark
                            ? 'bg-slate-900/90 text-emerald-300 border-emerald-500/30'
                            : 'bg-emerald-50 text-emerald-950 border-emerald-300'
                        }`}
                      >
                        {currentCard.answer}
                      </div>
                    )}

                    {/* Foto da Resposta */}
                    {currentCard.answerImage && (
                      <div className="pt-2">
                        <img
                          src={currentCard.answerImage}
                          alt="Foto da Resposta"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedImage(currentCard.answerImage!);
                          }}
                          className="max-h-60 sm:max-h-72 mx-auto rounded-2xl border border-emerald-600/40 object-contain shadow-lg hover:opacity-95 transition-opacity"
                        />
                        <span className="text-[10px] text-slate-500 block mt-1">
                          (Clique na imagem para ampliar)
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Dica de clique na base do card */}
              {!isAnswerRevealed && (
                <div className="text-center pt-4 text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span>Clique no card ou aperte [Espaço] para revelar a resposta</span>
                </div>
              )}
            </div>

            {/* Controles Estilo Anki: 3 Botões de Avaliação */}
            {isAnswerRevealed ? (
              <div className="space-y-2 animate-in slide-in-from-bottom-3 duration-200">
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleRateCard(1)}
                    className="p-3.5 rounded-2xl bg-red-950/80 hover:bg-red-900/90 text-red-300 border border-red-700 font-black text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer flex flex-col items-center gap-1"
                  >
                    <span className="text-sm">❌ Errei / Difícil</span>
                    <span className="text-[10px] font-mono text-red-400 font-normal">
                      Rever hoje [Tecla 1]
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRateCard(2)}
                    className="p-3.5 rounded-2xl bg-amber-950/80 hover:bg-amber-900/90 text-amber-300 border border-amber-700 font-black text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer flex flex-col items-center gap-1"
                  >
                    <span className="text-sm">⚠️ Bom</span>
                    <span className="text-[10px] font-mono text-amber-400 font-normal">
                      Rever em 1d [Tecla 2]
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRateCard(3)}
                    className="p-3.5 rounded-2xl bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-700 font-black text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer flex flex-col items-center gap-1"
                  >
                    <span className="text-sm">✅ Fácil</span>
                    <span className="text-[10px] font-mono text-emerald-400 font-normal">
                      Dominado [Tecla 3]
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRevealAnswer}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-700 via-red-800 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-black tracking-widest text-xs uppercase shadow-xl transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />
                <span>Mostrar Resposta (Espaço)</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 📋 RENDERIZAÇÃO: LISTA DE CARDS DO BARALHO (INSPEÇÃO COM FOTOS)
  // =========================================================================
  if (inspectingDeckId && activeInspectingDeck) {
    const deckCards = cards.filter((c) => c.deckId === inspectingDeckId);

    return (
      <div className="space-y-6 animate-in fade-in duration-200 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4 border-slate-700/60">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setInspectingDeckId(null)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:text-black'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2
                className={`text-lg font-black uppercase tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-950'
                }`}
              >
                {activeInspectingDeck.title}
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {deckCards.length} flashcards cadastrados neste baralho
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleOpenAddCardModal(activeInspectingDeck.id)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Adicionar Card (Texto/Foto)</span>
            </button>
            <button
              type="button"
              onClick={() => handleStartStudySession(activeInspectingDeck.id)}
              className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-red-700 hover:bg-red-600 text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Estudar Baralho (Anki)</span>
            </button>
          </div>
        </div>

        {deckCards.length === 0 ? (
          <div
            className={`p-10 rounded-2xl border text-center space-y-3 ${
              isDark ? 'border-slate-800 bg-[#0B1528]' : 'border-slate-200 bg-white'
            }`}
          >
            <HelpCircle className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm font-bold text-slate-400">Nenhum card neste baralho ainda.</p>
            <button
              type="button"
              onClick={() => handleOpenAddCardModal(activeInspectingDeck.id)}
              className="text-xs text-red-400 font-bold hover:underline cursor-pointer"
            >
              + Adicionar primeiro card manual com texto ou foto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deckCards.map((card, idx) => (
              <div
                key={card.id}
                className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between space-y-3 relative overflow-hidden ${
                  isDark
                    ? 'bg-[#0B1528] border-slate-800'
                    : 'bg-white border-slate-300 shadow-slate-200/50'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500">#{idx + 1}</span>
                    <span
                      className={`text-[9.5px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                        card.state === 'mastered'
                          ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                          : card.state === 'learning'
                          ? 'bg-amber-950/80 text-amber-400 border-amber-800/60'
                          : 'bg-blue-950/80 text-blue-400 border-blue-800/60'
                      }`}
                    >
                      {card.state}
                    </span>
                  </div>

                  {/* Pergunta */}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-blue-400 block mb-0.5">
                      P: Pergunta
                    </span>
                    {card.question && (
                      <p
                        className={`text-xs font-black whitespace-pre-line ${
                          isDark ? 'text-white' : 'text-slate-950'
                        }`}
                      >
                        {card.question}
                      </p>
                    )}
                    {card.questionImage && (
                      <div className="mt-1.5">
                        <img
                          src={card.questionImage}
                          alt="Foto da Pergunta"
                          onClick={() => setExpandedImage(card.questionImage!)}
                          className="max-h-32 rounded-lg border border-slate-700 object-contain cursor-pointer hover:opacity-90"
                        />
                      </div>
                    )}
                  </div>

                  {/* Resposta */}
                  <div className="pt-2 border-t border-slate-800/40">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-0.5">
                      R: Resposta
                    </span>
                    {card.answer && (
                      <p
                        className={`text-xs font-semibold whitespace-pre-line ${
                          isDark ? 'text-emerald-300' : 'text-emerald-800'
                        }`}
                      >
                        {card.answer}
                      </p>
                    )}
                    {card.answerImage && (
                      <div className="mt-1.5">
                        <img
                          src={card.answerImage}
                          alt="Foto da Resposta"
                          onClick={() => setExpandedImage(card.answerImage!)}
                          className="max-h-32 rounded-lg border border-emerald-700/50 object-contain cursor-pointer hover:opacity-90"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Rodapé do Card na Lista: Editar e Excluir */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                  <span className="text-[10px] font-mono text-slate-500">
                    Revisões: {card.repetitions}x
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditCardModal(card)}
                      className="text-slate-400 hover:text-blue-400 text-xs flex items-center gap-1 cursor-pointer"
                      title="Editar card"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCard(card.id)}
                      className="text-slate-400 hover:text-red-400 text-xs flex items-center gap-1 cursor-pointer"
                      title="Excluir card"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 📚 RENDERIZAÇÃO: LISTA DE BARALHOS (DECKS GRID)
  // =========================================================================
  return (
    <div className="space-y-7 animate-in fade-in duration-300 pb-12">
      {/* Cabeçalho do Caderno de Erros & Flashcards */}
      <div
        className={`p-6 rounded-2xl border transition-colors shadow-xl relative overflow-hidden ${
          isDark
            ? 'bg-gradient-to-br from-[#0B1528] via-slate-950 to-black border-slate-800'
            : 'bg-white border-slate-200 shadow-slate-200/60'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-indigo-950 border border-blue-500/30 flex items-center justify-center text-white shadow-lg shadow-blue-950/60 shrink-0">
              <Layers className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1
                  className={`text-xl font-black tracking-tight uppercase flex items-center gap-2 ${
                    isDark ? 'text-white' : 'text-slate-950'
                  }`}
                >
                  Caderno de Erros & Flashcards
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-blue-950/80 text-blue-300 border border-blue-800/60">
                  SRS // ANKI STYLE
                </span>
              </div>
              <p
                className={`text-xs mt-1 max-w-2xl leading-relaxed ${
                  isDark ? 'text-slate-400' : 'text-slate-700 font-medium'
                }`}
              >
                Organize seus baralhos por matéria, anexe prints e fotos de questões ou resoluções com Ctrl+V,
                escreva quantas linhas precisar e gere baterias de 20 flashcards "bate e pronto" com IA.
              </p>
            </div>
          </div>

          {/* Botões de Ação Principal */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 text-white shadow-lg shadow-blue-950/50 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-blue-200" />
              <span>Gerar 20 Cards com IA</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCreateDeckModalOpen(true)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                isDark
                  ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Novo Baralho</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por baralho ou matéria..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full text-xs rounded-xl pl-9 pr-3 py-2.5 border transition-colors ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-500 focus:border-blue-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-600'
            }`}
          />
        </div>

        {/* Filtros por Matéria */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {availableSubjects.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSelectedSubjectFilter(sub)}
              className={`text-xs px-3 py-1.5 rounded-xl border font-bold transition-colors cursor-pointer ${
                selectedSubjectFilter === sub
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                  : isDark
                  ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  : 'bg-white border-slate-300 text-slate-700 hover:text-black'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Baralhos (Estilo Anki) */}
      {filteredDecks.length === 0 ? (
        <div
          className={`p-10 rounded-2xl border text-center space-y-3 ${
            isDark ? 'border-slate-800 bg-[#0B1528]' : 'border-slate-200 bg-white'
          }`}
        >
          <Layers className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-300">Nenhum baralho encontrado.</p>
          <p className="text-xs text-slate-500">
            Crie um baralho manual ou gere uma bateria de 20 flashcards com a IA.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDecks.map((deck) => {
            const stats = deckStats[deck.id] || {
              total: 0,
              newCount: 0,
              learningCount: 0,
              masteredCount: 0,
            };

            return (
              <div
                key={deck.id}
                className={`p-5 rounded-2xl border shadow-xl flex flex-col justify-between space-y-4 relative overflow-hidden transition-all duration-200 hover:scale-[1.01] ${
                  isDark
                    ? 'bg-[#0B1528] border-slate-800 hover:border-blue-500/50 shadow-black/50'
                    : 'bg-white border-slate-300 hover:border-blue-500 shadow-slate-200/60'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-blue-950/80 text-blue-400 border border-blue-800/50">
                      {deck.subject}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteDeck(deck.id, e)}
                      className="text-slate-500 hover:text-red-400 p-1 text-xs cursor-pointer"
                      title="Excluir baralho"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <h3
                      className={`text-base font-black leading-snug ${
                        isDark ? 'text-white' : 'text-slate-950'
                      }`}
                    >
                      {deck.title}
                    </h3>
                    {deck.description && (
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {deck.description}
                      </p>
                    )}
                  </div>

                  {/* Placar de Cards Estilo Anki (Novos, Aprendendo, Dominados) */}
                  <div
                    className={`p-2.5 rounded-xl border grid grid-cols-3 gap-2 text-center text-xs font-mono ${
                      isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] text-blue-400 block font-bold">Novos</span>
                      <span className="font-bold text-blue-400">{stats.newCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-amber-400 block font-bold">Revisar</span>
                      <span className="font-bold text-amber-400">{stats.learningCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-400 block font-bold">Dominados</span>
                      <span className="font-bold text-emerald-400">{stats.masteredCount}</span>
                    </div>
                  </div>
                </div>

                {/* Botões de Ação do Card */}
                <div className="space-y-2 pt-2 border-t border-slate-800/60">
                  <button
                    type="button"
                    onClick={() => handleStartStudySession(deck.id)}
                    disabled={stats.total === 0}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Estudar Agora ({stats.total})</span>
                  </button>

                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => setInspectingDeckId(deck.id)}
                      className="text-slate-400 hover:text-white font-semibold cursor-pointer"
                    >
                      Ver todos os cards
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAddCardModal(deck.id)}
                      className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer flex items-center gap-1"
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>+ Card (Texto/Foto)</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🔮 MODAL: GERADOR COM IA (PROMPT DO USUÁRIO - APENAS 1 LINHA) */}
      {/* ========================================================================= */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div
            className={`w-full max-w-2xl rounded-3xl border p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200 ${
              isDark ? 'bg-[#0B1528] border-slate-800' : 'bg-white border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className={`text-base font-black uppercase tracking-tight ${
                      isDark ? 'text-white' : 'text-slate-950'
                    }`}
                  >
                    Gerador Tático de 20 Flashcards
                  </h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Prompt oficial de revisão bate e pronto (respostas de no máximo 1 linha tipo post-it)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  className={`block text-xs font-black uppercase tracking-wider mb-1.5 ${
                    isDark ? 'text-slate-300' : 'text-slate-800'
                  }`}
                >
                  Qual Matéria ou Tópico você quer revisar?
                </label>
                <input
                  type="text"
                  placeholder="Ex: Estequiometria, Cinemática e Torricelli, Crase, Era Vargas..."
                  value={aiTopicInput}
                  onChange={(e) => setAiTopicInput(e.target.value)}
                  className={`w-full text-xs rounded-xl px-3.5 py-3 border transition-colors ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-blue-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-600'
                  }`}
                />
              </div>

              {/* Sugestões Rápidas */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase font-bold text-slate-500">Sugestões:</span>
                {[
                  'Estequiometria',
                  'Cinemática & Torricelli',
                  'Termologia & Calorimetria',
                  'Crase & Regência',
                  'Funções & Logaritmos',
                  'Revolução Francesa',
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setAiTopicInput(s)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
                  >
                    + {s}
                  </button>
                ))}
              </div>

              {/* Onde salvar os cards */}
              <div>
                <label
                  className={`block text-xs font-black uppercase tracking-wider mb-1.5 ${
                    isDark ? 'text-slate-300' : 'text-slate-800'
                  }`}
                >
                  Destino dos Flashcards
                </label>
                <select
                  value={aiTargetDeckId}
                  onChange={(e) => setAiTargetDeckId(e.target.value)}
                  className={`w-full text-xs rounded-xl px-3.5 py-2.5 border transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-200'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="new_deck">✨ Criar um Novo Baralho com o nome do tópico</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      📁 Adicionar ao baralho: {d.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Botão de Disparo */}
              <button
                type="button"
                onClick={handleGenerateWithAi}
                disabled={isAiLoading || !aiTopicInput.trim()}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 text-white font-black text-xs uppercase tracking-wider shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isAiLoading ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin text-blue-200" />
                    <span>Aplicando prompt tático e gerando 20 flashcards (1 linha)...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Gerar 20 Flashcards Agora</span>
                  </>
                )}
              </button>

              {/* Preview dos Cards Gerados */}
              {aiPreviewCards.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-700/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-400">
                      ✅ {aiPreviewCards.length} Cards Prontos (Linha Única)
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveAiCards}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer"
                    >
                      Salvar no Baralho
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {aiPreviewCards.map((c, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                          isDark
                            ? 'bg-slate-900/90 border-slate-800 text-slate-300'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <p className="font-black text-blue-400">
                          {i + 1}. P: {c.question}
                        </p>
                        <p className="font-semibold text-emerald-400">R: {c.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📁 MODAL: CRIAR BARALHO MANUAL */}
      {/* ========================================================================= */}
      {isCreateDeckModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div
            className={`w-full max-w-md rounded-3xl border p-6 space-y-4 shadow-2xl ${
              isDark ? 'bg-[#0B1528] border-slate-800' : 'bg-white border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-700/60">
              <h3
                className={`text-sm font-black uppercase tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-950'
                }`}
              >
                Novo Baralho
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateDeckModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDeck} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Nome do Baralho
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Física // Eletrodinâmica"
                  value={newDeckTitle}
                  onChange={(e) => setNewDeckTitle(e.target.value)}
                  className={`w-full text-xs rounded-xl px-3 py-2.5 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Matéria / Disciplina
                </label>
                <input
                  type="text"
                  placeholder="Ex: Física, Química, Português..."
                  value={newDeckSubject}
                  onChange={(e) => setNewDeckSubject(e.target.value)}
                  className={`w-full text-xs rounded-xl px-3 py-2.5 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider cursor-pointer"
                >
                  Criar Baralho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ➕ MODAL: ADICIONAR / EDITAR CARD MANUAL (COM FOTOS E MÚLTIPLAS LINHAS) */}
      {/* ========================================================================= */}
      {isCardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div
            className={`w-full max-w-xl rounded-3xl border p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200 ${
              isDark ? 'bg-[#0B1528] border-slate-800' : 'bg-white border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-700/60">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3
                  className={`text-sm font-black uppercase tracking-tight ${
                    isDark ? 'text-white' : 'text-slate-950'
                  }`}
                >
                  {editingCardId ? 'Editar Flashcard' : 'Novo Flashcard (Texto & Foto)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCardModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualCard} className="space-y-4">
              {/* BLOCO DA PERGUNTA */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <span>1. Pergunta (P:)</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      (várias linhas permitidas)
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={questionFileInputRef}
                      onChange={(e) => handleFileInputChange(e, 'question')}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => questionFileInputRef.current?.click()}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-700 text-blue-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span>Anexar Foto</span>
                    </button>
                  </div>
                </div>

                <div
                  onPaste={(e) => handlePasteImage(e, 'question')}
                  className="relative"
                >
                  <textarea
                    rows={3}
                    placeholder="Digite sua pergunta ou cole um print com Ctrl+V aqui dentro..."
                    value={manualQuestion}
                    onChange={(e) => setManualQuestion(e.target.value)}
                    className={`w-full text-xs rounded-xl p-3 border leading-relaxed transition-colors ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-blue-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-600'
                    }`}
                  />
                  <span className="absolute right-3 bottom-2 text-[10px] text-slate-500 pointer-events-none">
                    Suporta Ctrl+V para colar imagem
                  </span>
                </div>

                {/* Preview da Imagem da Pergunta */}
                {manualQuestionImage && (
                  <div className="relative inline-block rounded-xl border border-blue-500/40 p-1 bg-black/40">
                    <img
                      src={manualQuestionImage}
                      alt="Preview Pergunta"
                      className="max-h-36 rounded-lg object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setManualQuestionImage(null)}
                      className="absolute -top-2 -right-2 p-1 rounded-full bg-red-600 text-white shadow-md hover:bg-red-500 cursor-pointer"
                      title="Remover foto"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* BLOCO DA RESPOSTA */}
              <div className="space-y-2 pt-2 border-t border-slate-700/40">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span>2. Resposta (R:)</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      (várias linhas permitidas)
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={answerFileInputRef}
                      onChange={(e) => handleFileInputChange(e, 'answer')}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => answerFileInputRef.current?.click()}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span>Anexar Foto</span>
                    </button>
                  </div>
                </div>

                <div
                  onPaste={(e) => handlePasteImage(e, 'answer')}
                  className="relative"
                >
                  <textarea
                    rows={4}
                    placeholder="Digite a resposta com quantas linhas precisar, bizus, fórmulas ou cole um print da resolução com Ctrl+V..."
                    value={manualAnswer}
                    onChange={(e) => setManualAnswer(e.target.value)}
                    className={`w-full text-xs rounded-xl p-3 border leading-relaxed transition-colors ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-emerald-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600'
                    }`}
                  />
                  <span className="absolute right-3 bottom-2 text-[10px] text-slate-500 pointer-events-none">
                    Suporta Ctrl+V para colar imagem
                  </span>
                </div>

                {/* Preview da Imagem da Resposta */}
                {manualAnswerImage && (
                  <div className="relative inline-block rounded-xl border border-emerald-500/40 p-1 bg-black/40">
                    <img
                      src={manualAnswerImage}
                      alt="Preview Resposta"
                      className="max-h-36 rounded-lg object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setManualAnswerImage(null)}
                      className="absolute -top-2 -right-2 p-1 rounded-full bg-red-600 text-white shadow-md hover:bg-red-500 cursor-pointer"
                      title="Remover foto"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-700 via-red-800 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-black text-xs uppercase tracking-wider shadow-xl transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-red-200" />
                  <span>{editingCardId ? 'Atualizar Flashcard' : 'Salvar no Baralho'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🔍 LIGHTBOX PARA VISUALIZAR FOTO EM TELA CHEIA */}
      {/* ========================================================================= */}
      {expandedImage && (
        <div
          onClick={() => setExpandedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-red-400 p-2 text-sm flex items-center gap-1 font-bold cursor-pointer"
            >
              <X className="w-5 h-5" />
              <span>Fechar</span>
            </button>
            <img
              src={expandedImage}
              alt="Imagem Expandida"
              className="max-w-full max-h-[85vh] rounded-2xl border border-slate-700 object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorNotebookTab;
