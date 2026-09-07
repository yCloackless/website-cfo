import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { AppTheme } from '../types';

export interface Flashcard {
  id: string;
  deckId: string;
  question: string;
  answer: string;
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
  // 10 Cards de Estequiometria
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
    id: 'c_q_06',
    deckId: 'deck_quimica_estequio',
    question: 'Quando aplicar o rendimento no cálculo estequiométrico?',
    answer: 'No final, sobre o produto teórico esperado.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_q_07',
    deckId: 'deck_quimica_estequio',
    question: 'O que é reagente limitante?',
    answer: 'O reagente que acaba primeiro e determina a quantidade máxima de produto.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_q_08',
    deckId: 'deck_quimica_estequio',
    question: 'Fórmula de concentração comum (C)?',
    answer: 'C = m_soluto / V_solução (em g/L).',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_q_09',
    deckId: 'deck_quimica_estequio',
    question: 'Fórmula da diluição de soluções?',
    answer: 'C1 * V1 = C2 * V2.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_q_10',
    deckId: 'deck_quimica_estequio',
    question: 'Qual a pegadinha clássica em estequiometria?',
    answer: 'Esquecer de balancear a equação química antes de cruzar os dados.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },

  // 10 Cards de Cinemática
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
  {
    id: 'c_f_04',
    deckId: 'deck_fisica_cinematica',
    question: 'Como converter km/h para m/s?',
    answer: 'Dividir o valor por 3,6.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_f_05',
    deckId: 'deck_fisica_cinematica',
    question: 'O que representa a área do gráfico v x t?',
    answer: 'O deslocamento escalar (Δs).',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_f_06',
    deckId: 'deck_fisica_cinematica',
    question: 'Em lançamento oblíquo, qual o movimento no eixo X?',
    answer: 'Movimento Uniforme (MU com velocidade constante vx).',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_f_07',
    deckId: 'deck_fisica_cinematica',
    question: 'Em lançamento oblíquo, qual o movimento no eixo Y?',
    answer: 'Movimento Uniformemente Variado (MUV sob aceleração g).',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_f_08',
    deckId: 'deck_fisica_cinematica',
    question: 'Qual ângulo garante alcance horizontal máximo no chão plano?',
    answer: '45 graus.',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_f_09',
    deckId: 'deck_fisica_cinematica',
    question: 'Fórmula da velocidade ao tocar o solo em queda livre?',
    answer: 'v = √(2 * g * h).',
    createdAt: '2026-05-01T10:00:00Z',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    nextReviewDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'c_f_10',
    deckId: 'deck_fisica_cinematica',
    question: 'O que define um movimento acelerado?',
    answer: 'Velocidade e aceleração apontam para o mesmo sentido (mesmo sinal).',
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
      const saved = localStorage.getItem('cfo_anki_decks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_DECKS;
  });

  // 2. Estado dos Flashcards
  const [cards, setCards] = useState<Flashcard[]>(() => {
    try {
      const saved = localStorage.getItem('cfo_anki_cards');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_CARDS;
  });

  // Salva no localStorage sempre que houver alteração
  useEffect(() => {
    try {
      localStorage.setItem('cfo_anki_decks', JSON.stringify(decks));
    } catch {}
  }, [decks]);

  useEffect(() => {
    try {
      localStorage.setItem('cfo_anki_cards', JSON.stringify(cards));
    } catch {}
  }, [cards]);

  // Filtros de Baralhos
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('TODOS');

  // Modais e Estados de Visualização
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isCreateDeckModalOpen, setIsCreateDeckModalOpen] = useState(false);
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [activeDeckForAdd, setActiveDeckForAdd] = useState<string>('');

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

  // Estado do Criador de Card Manual
  const [manualQuestion, setManualQuestion] = useState('');
  const [manualAnswer, setManualAnswer] = useState('');

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
  // 🎮 MODO DE TREINO (PLAYER ESTILO ANKI COM SRS)
  // =========================================================================
  const handleStartStudySession = (deckId: string) => {
    const deckCards = cards.filter((c) => c.deckId === deckId);
    if (deckCards.length === 0) {
      showToast?.('Este baralho ainda não tem flashcards.', 'info');
      return;
    }

    // Embaralha para revisão ativa
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

  // Avaliação Anki: 1 = Difícil/Errei, 2 = Bom, 3 = Fácil
  const handleRateCard = useCallback(
    (rating: 1 | 2 | 3) => {
      if (!studyQueue[currentCardIndex]) return;

      const currentCard = studyQueue[currentCardIndex];
      const today = new Date().toISOString().split('T')[0];

      let nextState: 'new' | 'learning' | 'review' | 'mastered' = currentCard.state;
      let nextRepetitions = currentCard.repetitions;
      let nextIntervalDays = currentCard.intervalDays;

      if (rating === 1) {
        // Errei / Difícil: repete na sessão
        nextState = 'learning';
        nextRepetitions = 0;
        nextIntervalDays = 0;
      } else if (rating === 2) {
        // Bom
        nextState = 'review';
        nextRepetitions += 1;
        nextIntervalDays = nextRepetitions === 1 ? 1 : Math.round(nextIntervalDays * 1.5) || 2;
      } else {
        // Fácil
        nextState = 'mastered';
        nextRepetitions += 1;
        nextIntervalDays = nextRepetitions === 1 ? 3 : Math.round(nextIntervalDays * 2.5) || 4;
      }

      // Calcula próxima data
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + Math.max(1, nextIntervalDays));
      const nextReviewDate = targetDate.toISOString().split('T')[0];

      // Atualiza card no estado global
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

      // Se errou (rating 1), re-enfileira no final da sessão para memorização garantida
      if (rating === 1) {
        setStudyQueue((prev) => [...prev, currentCard]);
      }

      // Avança para o próximo card ou finaliza
      if (currentCardIndex + 1 < studyQueue.length) {
        setCurrentCardIndex((prev) => prev + 1);
        setIsAnswerRevealed(false);
      } else {
        setStudySessionFinished(true);
      }
    },
    [studyQueue, currentCardIndex]
  );

  // Atalhos de teclado no modo estudo (Espaço / Enter para virar, 1, 2, 3 para classificar)
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
  // ⚡ GERADOR DE 20 FLASHCARDS COM IA
  // =========================================================================
  const handleGenerateWithAi = async () => {
    if (!aiTopicInput.trim()) {
      showToast?.('Por favor, informe a matéria ou tópico.', 'error');
      return;
    }

    setIsAiLoading(true);
    setAiPreviewCards([]);

    try {
      const response = await fetch('/api/ai/flashcards', {
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

    // Se escolheu criar um novo baralho com o nome do tópico
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

    // Converte os cards em Flashcards
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
  // ➕ ADICIONAR CARD MANUAL
  // =========================================================================
  const handleAddManualCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuestion.trim() || !manualAnswer.trim() || !activeDeckForAdd) return;

    const newCard: Flashcard[] = [
      {
        id: `card_${Date.now()}`,
        deckId: activeDeckForAdd,
        question: manualQuestion.trim(),
        answer: manualAnswer.trim(),
        createdAt: new Date().toISOString(),
        state: 'new',
        repetitions: 0,
        intervalDays: 0,
        nextReviewDate: new Date().toISOString().split('T')[0],
      },
    ];

    setCards((prev) => [...newCard, ...prev]);
    setManualQuestion('');
    setManualAnswer('');
    setIsAddCardModalOpen(false);
    showToast?.('Flashcard adicionado ao baralho!', 'success');
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
  // 📺 RENDERIZAÇÃO: MODO DE TREINO (ANKI PLAYER)
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
              className={`p-8 sm:p-12 rounded-3xl border shadow-2xl transition-all duration-300 min-h-[300px] sm:min-h-[360px] flex flex-col justify-between relative overflow-hidden select-none cursor-pointer ${
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
                {/* Pergunta */}
                <div className="space-y-2">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Pergunta
                  </span>
                  <h3
                    className={`text-lg sm:text-xl font-black leading-snug max-w-xl mx-auto ${
                      isDark ? 'text-white' : 'text-slate-950'
                    }`}
                  >
                    {currentCard.question}
                  </h3>
                </div>

                {/* Resposta Revelada (Post-it Bate e Pronto) */}
                {isAnswerRevealed && (
                  <div className="animate-in fade-in zoom-in-95 duration-200 pt-4 border-t border-slate-700/40">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-2">
                      Resposta Direta
                    </span>
                    <p
                      className={`text-base sm:text-lg font-bold max-w-xl mx-auto px-4 py-3 rounded-2xl border leading-relaxed shadow-lg ${
                        isDark
                          ? 'bg-slate-900/90 text-emerald-300 border-emerald-500/30'
                          : 'bg-emerald-50 text-emerald-950 border-emerald-300'
                      }`}
                    >
                      {currentCard.answer}
                    </p>
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
                  {/* [1] Errei / Difícil */}
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

                  {/* [2] Bom */}
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

                  {/* [3] Fácil */}
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
  // 📋 RENDERIZAÇÃO: LISTA DE CARDS DO BARALHO (INSPEÇÃO)
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
              onClick={() => {
                setActiveDeckForAdd(activeInspectingDeck.id);
                setIsAddCardModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Adicionar Card</span>
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
              onClick={() => {
                setActiveDeckForAdd(activeInspectingDeck.id);
                setIsAddCardModalOpen(true);
              }}
              className="text-xs text-red-400 font-bold hover:underline"
            >
              + Adicionar primeiro card manual
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
                <div className="space-y-2">
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

                  <div>
                    <span className="text-[10px] uppercase font-bold text-blue-400 block mb-0.5">
                      P:
                    </span>
                    <p
                      className={`text-xs font-black ${
                        isDark ? 'text-white' : 'text-slate-950'
                      }`}
                    >
                      {card.question}
                    </p>
                  </div>

                  <div className="pt-1 border-t border-slate-800/40">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-0.5">
                      R:
                    </span>
                    <p
                      className={`text-xs font-semibold ${
                        isDark ? 'text-emerald-300' : 'text-emerald-800'
                      }`}
                    >
                      {card.answer}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                  <span className="text-[10px] font-mono text-slate-500">
                    Revisões: {card.repetitions}x
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCard(card.id)}
                    className="text-slate-500 hover:text-red-400 p-1 text-xs cursor-pointer"
                    title="Excluir card"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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
                Organize seus baralhos por matéria e gere baterias de 20 flashcards "bate e pronto" com IA
                usando perguntas diretas e respostas no formato post-it para retenção máxima.
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
                      onClick={() => {
                        setActiveDeckForAdd(deck.id);
                        setIsAddCardModalOpen(true);
                      }}
                      className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer flex items-center gap-1"
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>+ Card</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🔮 MODAL: GERADOR COM IA (PROMPT DO USUÁRIO) */}
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
                    Prompt focado em revisão bate e pronto (perguntas diretas e respostas post-it)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
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
                    <span>Aplicando prompt tático e gerando 20 flashcards...</span>
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
                      ✅ {aiPreviewCards.length} Cards Prontos para Uso
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
                className="text-slate-400 hover:text-white"
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
      {/* ➕ MODAL: ADICIONAR CARD MANUAL */}
      {/* ========================================================================= */}
      {isAddCardModalOpen && (
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
                Adicionar Flashcard Manual
              </h3>
              <button
                type="button"
                onClick={() => setIsAddCardModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddManualCard} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Pergunta (P:)
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Pergunta direta e objetiva..."
                  value={manualQuestion}
                  onChange={(e) => setManualQuestion(e.target.value)}
                  className={`w-full text-xs rounded-xl p-3 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Resposta Curta (R: máx 1 linha)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Resposta post-it, seca e direta..."
                  value={manualAnswer}
                  onChange={(e) => setManualAnswer(e.target.value)}
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
                  className="w-full py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white font-black text-xs uppercase tracking-wider cursor-pointer"
                >
                  Salvar Flashcard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorNotebookTab;
