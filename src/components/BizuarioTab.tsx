import { apiFetch } from '../services/apiFetch';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Bookmark,
  Image as ImageIcon,
  Upload,
  Link as LinkIcon,
  Trash2,
  Edit3,
  Maximize2,
  X,
  Tag,
  Star,
  BookOpen,
  Filter,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  AlertCircle,
  FileText,
  Sparkles,
  Zap,
  ArrowLeft,
  Eye,
} from 'lucide-react';
import { BizuItem, Subject, AppTheme } from '../types';
import { addBizuItem, updateBizuItem, deleteBizuItem, saveBizuItems } from '../utils/bizuarioStorage';
import { compressImageFile, compressBase64Image } from '../utils/imageCompressor';
import { Latex } from './LatexRenderer';
import { formatNotesToSeparatedTopics } from '../utils/bizuFormatter';
import { BizuTopicViewer } from './BizuTopicViewer';

// Quick subjects and topics based on CFO CBMERJ high-yield statistics
const CFO_QUICK_SUBJECTS = [
  'Geografia',
  'Física',
  'Matemática',
  'Química',
  'História',
  'Língua Portuguesa',
  'Biologia',
];

const QUICK_TOPIC_SUGGESTIONS: Record<string, string[]> = {
  'Geografia': [
    'Cartografia, escalas e curvas de nível',
    'Fusos horários e projeções cartográficas',
    'Domínios morfoclimáticos do Brasil',
    'Climas do Brasil e fenômenos meteorológicos',
    'Geopolítica do petróleo e Oriente Médio',
    'Industrialização e urbanização brasileira',
  ],
  'Física': [
    'Termologia, calorimetria e trocas de calor',
    'Cinemática: MUV, gráficos e queda livre',
    'Trabalho, energia mecânica e potência',
    'Eletrodinâmica: circuitos e Lei de Ohm',
    'Óptica geométrica e refração da luz',
    'Hidrostática: empuxo e Teorema de Pascal',
  ],
  'Matemática': [
    'Área de figuras planas e círculos',
    'Análise combinatória: arranjos e combinações',
    'Função do 1º e 2º grau e gráficos',
    'Trigonometria no triângulo retângulo e ciclo',
    'Geometria espacial: prismas, cilindros e cones',
    'Probabilidade simples e condicional',
  ],
  'Química': [
    'Estequiometria, pureza e rendimento',
    'Termoquímica e Lei de Hess',
    'Funções orgânicas e nomenclatura',
    'Soluções: concentração comum e molaridade',
    'Cinética química e equilíbrio',
  ],
  'História': [
    'Revolução Francesa e Iluminismo',
    'Brasil Colônia: Ciclo do Ouro e sociedade mineradora',
    'Era Vargas: Estado Novo e direitos trabalhistas',
    'Ditadura Militar no Brasil (1964-1985)',
    'Guerra Fria e bipolarização mundial',
  ],
  'Língua Portuguesa': [
    'Orações subordinadas adjetivas e adverbiais',
    'Crase: casos obrigatórios, proibidos e facultativos',
    'Concordância verbal com partícula "se"',
    'Pontuação: emprego da vírgula',
    'Figuras de linguagem mais cobradas',
  ],
  'Biologia': [
    'Fisiologia humana: sistema circulatório e respiração',
    'Ecologia: ciclos biogeoquímicos e teias alimentares',
    'Genética: 1ª Lei de Mendel e grupos sanguíneos',
    'Citologia: respiração celular e fotossíntese',
  ],
};

interface BizuarioTabProps {
  bizuItems: BizuItem[];
  onRefreshBizuItems: () => void;
  subjects: Subject[];
  theme: AppTheme;
  showToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  presetTopicToCreate?: { subject: string; title: string } | null;
  onClearPresetTopic?: () => void;
}

export const BizuarioTab: React.FC<BizuarioTabProps> = ({
  bizuItems,
  onRefreshBizuItems,
  subjects,
  theme,
  showToast,
  presetTopicToCreate,
  onClearPresetTopic,
}) => {
  const isDark = theme === 'dark';

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingBizu, setEditingBizu] = useState<BizuItem | null>(null);

  // Lightbox / Image Zoom Viewer state
  const [viewingImage, setViewingImage] = useState<{
    url: string;
    title: string;
    subject: string;
  } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Full Expanded Reading Modal for Bizu Notes
  const [viewingNotesBizu, setViewingNotesBizu] = useState<BizuItem | null>(null);

  // Form Fields State
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formKeyPointInput, setFormKeyPointInput] = useState('');
  const [formKeyPoints, setFormKeyPoints] = useState<string[]>([]);
  const [formTagInput, setFormTagInput] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formIsFavorite, setFormIsFavorite] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Creation Mode: 'ai_direct' (fast single-click generation) vs 'manual' (full editor)
  const [modalMode, setModalMode] = useState<'ai_direct' | 'manual'>('ai_direct');
  const [directSubject, setDirectSubject] = useState<string>('Geografia');
  const [directTopicContent, setDirectTopicContent] = useState<string>('');
  const [previewNotesLatex, setPreviewNotesLatex] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quickFileInputRef = useRef<HTMLInputElement | null>(null);
  const [quickTargetBizuId, setQuickTargetBizuId] = useState<string | null>(null);

  // Distinct subjects present in bizus & app subjects
  const availableSubjectNames = useMemo(() => {
    const set = new Set<string>();
    subjects.forEach((s) => set.add(s.name));
    bizuItems.forEach((b) => set.add(b.subjectName));
    return Array.from(set).sort();
  }, [subjects, bizuItems]);

  // Distinct tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    bizuItems.forEach((b) => b.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [bizuItems]);

  // Handle AI generation for Bizu Notes using Gemini
  const handleGenerateAINotes = async (overrideTitle?: string, overrideSubject?: string) => {
    const targetTitle = (overrideTitle ?? formTitle).trim();
    const targetSubject = (overrideSubject ?? formSubject).trim();

    if (!targetTitle && !targetSubject) {
      showToast('Por favor, informe ao menos o Título ou a Matéria para o Gemini gerar anotações.', 'info');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const resp = await apiFetch('/api/ai/bizu-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: targetTitle,
          subject: targetSubject,
          category: formCategory,
          existingNotes: formNotes,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Erro na API (${resp.status})`);
      }

      const resData = await resp.json();
      if (resData?.data) {
        const aiData = resData.data;
        if (aiData.notes) {
          const separatedNotes = formatNotesToSeparatedTopics(aiData.notes);
          if (formNotes.trim() && !overrideTitle) {
            setFormNotes((prev) => `${prev}\n\n--- [BIZU ADICIONAL GEMINI AI] ---\n${separatedNotes}`);
          } else {
            setFormNotes(separatedNotes);
          }
        }
        if (Array.isArray(aiData.keyPoints) && aiData.keyPoints.length > 0) {
          setFormKeyPoints((prev) => {
            const set = new Set([...prev, ...aiData.keyPoints]);
            return Array.from(set);
          });
        }
        if (Array.isArray(aiData.tags) && aiData.tags.length > 0) {
          setFormTags((prev) => {
            const set = new Set([...prev, ...aiData.tags]);
            return Array.from(set);
          });
        }
        if (aiData.category && (!formCategory || formCategory === 'Geopolítica' || formCategory === 'Geral')) {
          setFormCategory(aiData.category);
        }
        showToast('✨ Anotações, bizus mnemônicos e pontos-chave gerados pelo Gemini AI!', 'success');
      }
    } catch (err: any) {
      console.error('Falha ao gerar anotações com IA:', err);
      showToast('Não foi possível gerar anotações com o Gemini AI neste momento.', 'error');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Direct AI Generation: Takes only Subject + Content, creates notes like Cartografia, and saves directly!
  const handleGenerateAndSaveDirectly = async () => {
    const targetSubject = directSubject.trim();
    const targetContent = directTopicContent.trim();

    if (!targetSubject) {
      showToast('Por favor, informe ou selecione a matéria.', 'error');
      return;
    }
    if (!targetContent) {
      showToast('Por favor, informe qual conteúdo você deseja abordar.', 'error');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const resp = await apiFetch('/api/ai/bizu-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: targetSubject,
          title: targetContent,
          promptHint: 'Geração direta estilo Cartografia e Alta Incidência do CFO CBMERJ com fórmulas LaTeX',
        }),
      });

      if (!resp.ok) {
        throw new Error(`Erro na API (${resp.status})`);
      }

      const resData = await resp.json();
      const aiData = resData?.data;

      if (!aiData || !aiData.notes) {
        throw new Error('Resposta incompleta do Gemini AI');
      }

      const generatedTitle = aiData.refinedTitle || targetContent;
      const generatedCategory =
        aiData.category ||
        (targetSubject === 'Geografia'
          ? 'Geopolítica & Cartografia'
          : targetSubject === 'Física'
          ? 'Física & Fenômenos'
          : targetSubject === 'Matemática'
          ? 'Matemática & Geometria'
          : 'Edital CFO CBMERJ');
      const generatedKeyPoints =
        Array.isArray(aiData.keyPoints) && aiData.keyPoints.length > 0 ? aiData.keyPoints : [];
      const generatedTags =
        Array.isArray(aiData.tags) && aiData.tags.length > 0
          ? aiData.tags
          : [targetSubject, 'CFO-CBMERJ', 'Bizu-Direto'];

      // Add directly to persistent storage (IndexedDB)
      const formattedNotes = formatNotesToSeparatedTopics(aiData.notes);
      addBizuItem({
        title: generatedTitle,
        subjectName: targetSubject,
        category: generatedCategory,
        notes: formattedNotes,
        keyPoints: generatedKeyPoints,
        tags: generatedTags,
        isFavorite: true,
      });

      onRefreshBizuItems();
      setIsFormModalOpen(false);
      showToast(`✨ Bizu tático "${generatedTitle}" gerado e salvo com sucesso!`, 'success');
    } catch (err: any) {
      console.error('Falha na geração direta do Bizu:', err);
      showToast('Erro ao gerar anotação com IA. Tente novamente.', 'error');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Direct AI Generation with review: populates all fields and opens the review/edit view
  const handleGenerateAndReview = async () => {
    const targetSubject = directSubject.trim();
    const targetContent = directTopicContent.trim();

    if (!targetSubject) {
      showToast('Por favor, informe ou selecione a matéria.', 'error');
      return;
    }
    if (!targetContent) {
      showToast('Por favor, informe qual conteúdo você deseja abordar.', 'error');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const resp = await apiFetch('/api/ai/bizu-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: targetSubject,
          title: targetContent,
          promptHint: 'Geração direta estilo Cartografia e Alta Incidência do CFO CBMERJ com fórmulas LaTeX',
        }),
      });

      if (!resp.ok) {
        throw new Error(`Erro na API (${resp.status})`);
      }

      const resData = await resp.json();
      const aiData = resData?.data;

      if (!aiData || !aiData.notes) {
        throw new Error('Resposta incompleta do Gemini AI');
      }

      setFormTitle(aiData.refinedTitle || targetContent);
      setFormSubject(targetSubject);
      setFormCategory(
        aiData.category ||
          (targetSubject === 'Geografia'
            ? 'Geopolítica & Cartografia'
            : targetSubject === 'Física'
            ? 'Física & Fenômenos'
            : 'Edital CFO CBMERJ')
      );
      setFormNotes(formatNotesToSeparatedTopics(aiData.notes));
      setFormKeyPoints(Array.isArray(aiData.keyPoints) ? aiData.keyPoints : []);
      setFormTags(
        Array.isArray(aiData.tags) && aiData.tags.length > 0
          ? aiData.tags
          : [targetSubject, 'CFO-CBMERJ']
      );
      setFormIsFavorite(true);

      // Switch to manual review mode with LaTeX formula preview
      setModalMode('manual');
      setPreviewNotesLatex(true);
      showToast('✨ Anotação detalhada gerada! Revise abaixo e anexe foto se desejar.', 'success');
    } catch (err: any) {
      console.error('Falha ao gerar e revisar:', err);
      showToast('Erro ao gerar anotação com IA. Tente novamente.', 'error');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Watch for external preset topic to create (e.g. from High-Yield tab)
  useEffect(() => {
    if (presetTopicToCreate) {
      setEditingBizu(null);
      setFormTitle(presetTopicToCreate.title);
      setFormSubject(presetTopicToCreate.subject);
      setFormCategory('Edital CFO CBMERJ');
      setFormImageUrl('');
      setFormNotes('');
      setFormKeyPoints([]);
      setFormKeyPointInput('');
      setFormTags([presetTopicToCreate.subject, 'CFO-CBMERJ']);
      setFormTagInput('');
      setFormIsFavorite(true);
      setIsFormModalOpen(true);
      if (onClearPresetTopic) onClearPresetTopic();
      handleGenerateAINotes(presetTopicToCreate.title, presetTopicToCreate.subject);
    }
  }, [presetTopicToCreate]);

  // Filtered Bizus
  const filteredBizus = useMemo(() => {
    return bizuItems.filter((item) => {
      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(query);
        const matchSubject = item.subjectName.toLowerCase().includes(query);
        const matchNotes = item.notes?.toLowerCase().includes(query) || false;
        const matchTags = item.tags?.some((t) => t.toLowerCase().includes(query)) || false;
        const matchKeyPoints = item.keyPoints?.some((k) => k.toLowerCase().includes(query)) || false;

        if (!matchTitle && !matchSubject && !matchNotes && !matchTags && !matchKeyPoints) {
          return false;
        }
      }

      // Subject filter
      if (selectedSubjectFilter !== 'all' && item.subjectName !== selectedSubjectFilter) {
        return false;
      }

      // Tag filter
      if (selectedTagFilter !== 'all' && !item.tags?.includes(selectedTagFilter)) {
        return false;
      }

      // Favorites only
      if (onlyFavorites && !item.isFavorite) {
        return false;
      }

      return true;
    });
  }, [bizuItems, searchTerm, selectedSubjectFilter, selectedTagFilter, onlyFavorites]);

  // Open Form for New Bizu (defaults to AI Direct mode as requested)
  const handleOpenNewModal = (
    presetSubject?: string,
    initialTopic?: string,
    mode: 'ai_direct' | 'manual' = 'ai_direct'
  ) => {
    setEditingBizu(null);
    setModalMode(mode);
    const chosenSubject = presetSubject || availableSubjectNames[0] || 'Geografia';
    setDirectSubject(chosenSubject);
    setDirectTopicContent(initialTopic || '');
    setFormTitle(initialTopic || '');
    setFormSubject(chosenSubject);
    setFormCategory('Geopolítica');
    setFormImageUrl('');
    setFormNotes('');
    setFormKeyPoints([]);
    setFormKeyPointInput('');
    setFormTags(['Cartografia', 'CFO-CBMERJ']);
    setFormTagInput('');
    setFormIsFavorite(false);
    setPreviewNotesLatex(false);
    setIsFormModalOpen(true);
  };

  // Open Form for Editing Bizu (opens directly in full manual editor)
  const handleOpenEditModal = (bizu: BizuItem) => {
    setEditingBizu(bizu);
    setModalMode('manual');
    setFormTitle(bizu.title);
    setFormSubject(bizu.subjectName);
    setFormCategory(bizu.category || '');
    setFormImageUrl(bizu.imageUrl || '');
    setFormNotes(bizu.notes || '');
    setFormKeyPoints(bizu.keyPoints ? [...bizu.keyPoints] : []);
    setFormKeyPointInput('');
    setFormTags(bizu.tags ? [...bizu.tags] : []);
    setFormTagInput('');
    setFormIsFavorite(!!bizu.isFavorite);
    setPreviewNotesLatex(false);
    setIsFormModalOpen(true);
  };

  // Handle Image File Selection & Conversion with automatic high-performance compression
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, forQuickBizuId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Soft notice if file is unusually large
    if (file.size > 15 * 1024 * 1024) {
      showToast('A imagem selecionada é muito pesada (máximo 15MB recomendado).', 'error');
      return;
    }

    setIsUploadingImage(true);
    try {
      // Compress to optimal study diagram/photo dimensions and format (~80-140KB)
      const compressedBase64 = await compressImageFile(file, 1280, 0.82);

      if (forQuickBizuId) {
        // Direct update on card
        updateBizuItem(forQuickBizuId, { imageUrl: compressedBase64 });
        onRefreshBizuItems();
        showToast('Foto do Bizu otimizada e salva com sucesso!', 'success');
      } else {
        // In form
        setFormImageUrl(compressedBase64);
        showToast('Foto otimizada e pronta para salvar!', 'success');
      }
    } catch (err) {
      console.warn('Falha na compressão da imagem:', err);
      showToast('Erro ao processar imagem selecionada.', 'error');
    } finally {
      setIsUploadingImage(false);
      // Reset input value so same file can be selected again if needed
      e.target.value = '';
    }
  };

  // Add Key Point
  const handleAddKeyPoint = () => {
    if (!formKeyPointInput.trim()) return;
    setFormKeyPoints((prev) => [...prev, formKeyPointInput.trim()]);
    setFormKeyPointInput('');
  };

  const handleRemoveKeyPoint = (index: number) => {
    setFormKeyPoints((prev) => prev.filter((_, i) => i !== index));
  };

  // Add Tag
  const handleAddTag = () => {
    if (!formTagInput.trim()) return;
    const cleanTag = formTagInput.trim().replace(/^#/, '');
    if (!formTags.includes(cleanTag)) {
      setFormTags((prev) => [...prev, cleanTag]);
    }
    setFormTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  // Save Bizu (Create or Edit)
  const handleSaveBizu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('Por favor, informe o título do Bizu.', 'error');
      return;
    }
    if (!formSubject.trim()) {
      showToast('Por favor, informe a matéria correspondente.', 'error');
      return;
    }

    let processedImageUrl = formImageUrl.trim() || undefined;
    if (processedImageUrl && processedImageUrl.startsWith('data:image/') && processedImageUrl.length > 150000) {
      try {
        processedImageUrl = await compressBase64Image(processedImageUrl);
      } catch {
        // mantém original em caso de exceção isolada
      }
    }

    const cleanNotes = formNotes.trim() ? formatNotesToSeparatedTopics(formNotes.trim()) : undefined;

    if (editingBizu) {
      updateBizuItem(editingBizu.id, {
        title: formTitle.trim(),
        subjectName: formSubject.trim(),
        category: formCategory.trim() || undefined,
        imageUrl: processedImageUrl,
        notes: cleanNotes,
        keyPoints: formKeyPoints,
        tags: formTags,
        isFavorite: formIsFavorite,
      });
      showToast('Bizu tático atualizado com sucesso!', 'success');
    } else {
      addBizuItem({
        title: formTitle.trim(),
        subjectName: formSubject.trim(),
        category: formCategory.trim() || undefined,
        imageUrl: processedImageUrl,
        imageAlt: formTitle.trim(),
        notes: cleanNotes,
        keyPoints: formKeyPoints,
        tags: formTags,
        isFavorite: formIsFavorite,
      });
      showToast('Novo Bizu adicionado ao seu repositório!', 'success');
    }

    setIsFormModalOpen(false);
    onRefreshBizuItems();
  };

  // Toggle Favorite
  const handleToggleFavorite = (bizu: BizuItem) => {
    updateBizuItem(bizu.id, { isFavorite: !bizu.isFavorite });
    onRefreshBizuItems();
    showToast(
      !bizu.isFavorite ? 'Marcado como Bizu prioritário!' : 'Prioridade removida.',
      'info'
    );
  };

  // Delete Bizu
  const handleDeleteBizu = (bizu: BizuItem) => {
    if (confirm(`Deseja realmente excluir o bizu "${bizu.title}"?`)) {
      deleteBizuItem(bizu.id);
      onRefreshBizuItems();
      showToast('Bizu excluído com sucesso.', 'info');
    }
  };

  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Export Bizus as JSON
  const handleExportBizus = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(bizuItems, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `bizuario_cfocbmerj_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Backup do Bizuário exportado com sucesso!', 'success');
  };

  // Import Bizus from JSON
  const handleImportBizus = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0) {
          saveBizuItems(parsed);
          onRefreshBizuItems();
          showToast(`${parsed.length} Bizus importados com sucesso!`, 'success');
        } else {
          showToast('Arquivo JSON inválido ou vazio.', 'error');
        }
      } catch {
        showToast('Erro ao ler arquivo de backup.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input for backup import */}
      <input
        type="file"
        ref={importInputRef}
        accept="application/json"
        className="hidden"
        onChange={handleImportBizus}
      />
      {/* Hidden File Input for quick photo replace */}
      <input
        type="file"
        ref={quickFileInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (quickTargetBizuId) {
            handleFileChange(e, quickTargetBizuId);
          }
        }}
      />

      {/* Top Banner & Introduction */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-slate-900/90 to-blue-950/40 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-gradient-to-r from-white via-blue-50/40 to-indigo-50/30 border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-600/20 text-blue-400 border border-blue-500/30">
                Memória Visual &amp; Macetes
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-600/20 text-red-400 border border-red-500/30">
                CFO CBMERJ
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-blue-500" />
              Bizuário de Matérias &amp; Fotos
            </h2>
            <p
              className={`text-xs sm:text-sm max-w-2xl leading-relaxed ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              Guarde esquemas táticos, mapas mentais, infográficos, fórmulas e fotos de questões
              estratégicas para cada disciplina. Pesquise por matéria ou palavra-chave para revisar
              instantaneamente antes da prova.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleExportBizus}
              title="Baixar backup dos Bizus em JSON"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-950/80 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-850'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Exportar Backup</span>
            </button>

            <button
              onClick={() => importInputRef.current?.click()}
              title="Importar backup de Bizus em JSON"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-950/80 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-850'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Importar</span>
            </button>

            <button
              onClick={() => handleOpenNewModal(undefined, undefined, 'ai_direct')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 via-blue-600 to-indigo-600 hover:from-amber-400 hover:via-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-950/40 transition-all hover:scale-102 cursor-pointer active:scale-98"
              title="Criar anotação tática e mnemônicos informando apenas a matéria e o conteúdo"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>⚡ Criar Bizu com IA</span>
            </button>

            <button
              onClick={() => handleOpenNewModal(undefined, undefined, 'manual')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-950/80 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-850'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
              }`}
              title="Adicionar bizu preenchendo todos os campos manualmente"
            >
              <Plus className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Adicionar Manual</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 pt-4 border-t border-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Total de Bizus</p>
              <p className="text-base font-black text-slate-200">{bizuItems.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Com Imagens</p>
              <p className="text-base font-black text-emerald-400">
                {bizuItems.filter((b) => !!b.imageUrl).length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Star className="w-4 h-4 fill-amber-400/20" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Favoritos / Alta Relevância</p>
              <p className="text-base font-black text-amber-400">
                {bizuItems.filter((b) => b.isFavorite).length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Disciplinas Mapeadas</p>
              <p className="text-base font-black text-purple-400">
                {new Set(bizuItems.map((b) => b.subjectName)).size}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar & Subject Filter Controls */}
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Main Search Input */}
          <div className="relative w-full md:flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por matéria (ex: Geografia), mares, canais, tópicos ou tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-9 py-2.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none'
              }`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick toggle favorites */}
          <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
            <button
              onClick={() => setOnlyFavorites((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                onlyFavorites
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                  : isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  onlyFavorites ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
                }`}
              />
              <span>Apenas Favoritos</span>
            </button>
          </div>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[11px] font-bold text-slate-500 shrink-0 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Matéria:
          </span>
          <button
            onClick={() => setSelectedSubjectFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 transition-all ${
              selectedSubjectFilter === 'all'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : isDark
                ? 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas ({bizuItems.length})
          </button>

          {availableSubjectNames.map((subjName) => {
            const count = bizuItems.filter((b) => b.subjectName === subjName).length;
            const isSelected = selectedSubjectFilter === subjName;
            return (
              <button
                key={subjName}
                onClick={() => setSelectedSubjectFilter(subjName)}
                className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : isDark
                    ? 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                {subjName} {count > 0 && <span className="opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Optional Tag Filter Pills */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-800/40 text-[11px]">
            <span className="text-slate-500 shrink-0 flex items-center gap-1 font-semibold">
              <Tag className="w-2.5 h-2.5" />
              Tags:
            </span>
            <button
              onClick={() => setSelectedTagFilter('all')}
              className={`px-2 py-0.5 rounded-md shrink-0 transition-all ${
                selectedTagFilter === 'all'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTagFilter(tag === selectedTagFilter ? 'all' : tag)}
                className={`px-2 py-0.5 rounded-md shrink-0 border transition-all ${
                  selectedTagFilter === tag
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
                    : isDark
                    ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid of Bizu Cards */}
      {filteredBizus.length === 0 ? (
        <div
          className={`p-12 text-center rounded-2xl border ${
            isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <BookOpen className="w-12 h-12 mx-auto text-slate-500 mb-3 opacity-60" />
          <h3 className="text-base font-bold text-slate-300">Nenhum Bizu encontrado</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {searchTerm || selectedSubjectFilter !== 'all'
              ? 'Tente alterar os filtros de matéria ou o termo pesquisado.'
              : 'Você ainda não cadastrou bizus nessa categoria. Clique abaixo para cadastrar seu primeiro bizu com foto!'}
          </p>
          <button
            onClick={() => handleOpenNewModal(selectedSubjectFilter !== 'all' ? selectedSubjectFilter : undefined)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Bizu Agora</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredBizus.map((bizu) => (
            <div
              key={bizu.id}
              className={`rounded-2xl border overflow-hidden transition-all duration-200 flex flex-col shadow-md ${
                isDark
                  ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Card Header: Subject Pill & Actions */}
              <div className="p-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-800/40">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-blue-600/20 text-blue-400 border border-blue-500/30">
                      {bizu.subjectName}
                    </span>
                    {bizu.category && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        • {bizu.category}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-100 tracking-tight leading-snug">
                    {bizu.title}
                  </h3>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      handleOpenEditModal(bizu);
                      handleGenerateAINotes(bizu.title, bizu.subjectName);
                    }}
                    title="Enriquecer anotações com Gemini AI"
                    className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 border border-transparent hover:bg-amber-500/10 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleToggleFavorite(bizu)}
                    title={bizu.isFavorite ? 'Remover favorito' : 'Marcar favorito'}
                    className={`p-1.5 rounded-lg border transition-all ${
                      bizu.isFavorite
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${bizu.isFavorite ? 'fill-amber-400' : ''}`} />
                  </button>

                  <button
                    onClick={() => handleOpenEditModal(bizu)}
                    title="Editar Bizu"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-800 transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteBizu(bizu)}
                    title="Excluir Bizu"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 border border-transparent hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Image Section */}
              {bizu.imageUrl ? (
                <div className="relative group bg-slate-950 overflow-hidden border-b border-slate-800/60 aspect-16/9 flex items-center justify-center">
                  <img
                    src={bizu.imageUrl}
                    alt={bizu.imageAlt || bizu.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102 cursor-pointer"
                    onClick={() =>
                      setViewingImage({
                        url: bizu.imageUrl!,
                        title: bizu.title,
                        subject: bizu.subjectName,
                      })
                    }
                  />

                  {/* Overlay Controls */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                    <button
                      onClick={() =>
                        setViewingImage({
                          url: bizu.imageUrl!,
                          title: bizu.title,
                          subject: bizu.subjectName,
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900/90 text-white border border-slate-700 shadow-md hover:bg-slate-800 transition-colors"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Ver em Tela Cheia / Zoom</span>
                    </button>

                    <button
                      onClick={() => {
                        setQuickTargetBizuId(bizu.id);
                        quickFileInputRef.current?.click();
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/90 hover:bg-blue-600 text-white shadow-md transition-colors"
                      title="Substituir foto por arquivo local"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Trocar Foto</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Empty Image Placeholder with Direct Upload */
                <div
                  onClick={() => {
                    setQuickTargetBizuId(bizu.id);
                    quickFileInputRef.current?.click();
                  }}
                  className="p-8 border-b border-slate-800/40 bg-slate-950/40 text-center cursor-pointer hover:bg-slate-950/70 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-300">
                    Anexar foto ou esquema visual
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Clique para selecionar imagem do seu dispositivo
                  </p>
                </div>
              )}

              {/* Card Body: Key Points & Notes */}
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  {/* Key Points (Bullets) */}
                  {bizu.keyPoints && bizu.keyPoints.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wider font-extrabold text-blue-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-blue-500" />
                        Pontos Estratégicos &amp; Bizus:
                      </p>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {bizu.keyPoints.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                            <div className="leading-snug">
                              <Latex content={point} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Detailed Notes Separated into Structured Topics */}
                  {bizu.notes && (
                    <div className="pt-2 border-t border-slate-800/40">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5">
                          <FileText className="w-3 h-3 text-blue-400" />
                          Tópicos &amp; Anotações Táticas:
                        </p>
                        <button
                          type="button"
                          onClick={() => setViewingNotesBizu(bizu)}
                          className="text-[10px] font-bold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                          title="Abrir tópicos completos em janela expandida de estudo"
                        >
                          <Maximize2 className="w-2.5 h-2.5" />
                          <span>Expandir</span>
                        </button>
                      </div>
                      <BizuTopicViewer notes={bizu.notes} isDark={isDark} />
                    </div>
                  )}
                </div>

                {/* Footer Tags */}
                {bizu.tags && bizu.tags.length > 0 && (
                  <div className="pt-3 border-t border-slate-800/40 flex items-center gap-1.5 flex-wrap">
                    {bizu.tags.map((tag) => (
                      <span
                        key={tag}
                        onClick={() => setSelectedTagFilter(tag)}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: ADD / EDIT BIZU */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl max-h-[92vh] flex flex-col overflow-hidden ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    {editingBizu ? 'Editar Bizu Tático' : 'Adicionar Novo Bizu com Foto'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Insira as informações, escolha a matéria e anexe a imagem de estudo
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher: AI Direct vs Manual Form */}
            {!editingBizu && (
              <div className="px-6 py-2.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalMode('ai_direct')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modalMode === 'ai_direct'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>⚡ Gerador Direto com IA</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      Rápido
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalMode('manual')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      modalMode === 'manual'
                        ? 'bg-slate-800 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Formulário Completo / Manual</span>
                  </button>
                </div>

                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  {modalMode === 'ai_direct' ? 'Apenas Matéria + Conteúdo' : 'Preenchimento livre com foto'}
                </span>
              </div>
            )}

            {/* VIEW 1: STREAMLINED AI DIRECT CREATOR */}
            {modalMode === 'ai_direct' && !editingBizu ? (
              <div className="p-6 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
                {/* Tactical Callout */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/60 via-slate-900 to-indigo-950/40 border border-blue-500/25 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                      <Zap className="w-3 h-3 text-amber-400" />
                      Padrão Cartografia CFO CBMERJ
                    </span>
                    <span className="text-[11px] text-blue-300 font-medium">
                      LaTeX Formulas ($...$) + Mnemônicos
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">
                    Crie anotações profundas informando apenas Matéria e Conteúdo
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    A IA gerará a estrutura tática completa idêntica às fichas de Cartografia: Conceitos Essenciais, Fórmulas com notação matemática limpa, Mnemônicos práticos, Pegadinhas clássicas das bancas (UERJ/FGV/IDECAN) e Dicas de Resolução Rápida.
                  </p>
                </div>

                {/* Field 1: Subject (Matéria) */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-200 flex items-center justify-between">
                    <span>1. Título da Matéria / Disciplina *</span>
                    <span className="text-[10px] font-normal text-slate-400">Clique para selecionar rápido</span>
                  </label>

                  {/* Quick Select Subject Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {CFO_QUICK_SUBJECTS.map((subj) => {
                      const isSelected = directSubject.toLowerCase() === subj.toLowerCase();
                      return (
                        <button
                          key={subj}
                          type="button"
                          onClick={() => {
                            setDirectSubject(subj);
                            if (!directTopicContent && QUICK_TOPIC_SUGGESTIONS[subj]?.[0]) {
                              setDirectTopicContent(QUICK_TOPIC_SUGGESTIONS[subj][0]);
                            }
                          }}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40 scale-102 border border-blue-400'
                              : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                          }`}
                        >
                          {subj}
                        </button>
                      );
                    })}
                  </div>

                  {/* Subject Input with datalist */}
                  <input
                    type="text"
                    required
                    list="direct-subjects-datalist"
                    placeholder="Ou digite o nome da matéria..."
                    value={directSubject}
                    onChange={(e) => setDirectSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                  <datalist id="direct-subjects-datalist">
                    {availableSubjectNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>

                {/* Field 2: Conteúdo / Tópico que quero falar */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-200 flex items-center justify-between">
                    <span>2. Qual conteúdo você quer falar? *</span>
                    <span className="text-[10px] font-normal text-blue-400">Assunto específico do edital</span>
                  </label>

                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Ex: Cartografia, escalas e curvas de nível / Termologia e trocas de calor..."
                    value={directTopicContent}
                    onChange={(e) => setDirectTopicContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isGeneratingAI && directTopicContent.trim()) {
                        e.preventDefault();
                        handleGenerateAndSaveDirectly();
                      }
                    }}
                    className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none shadow-inner"
                  />

                  {/* High Yield Suggestion Chips for Selected Subject */}
                  {QUICK_TOPIC_SUGGESTIONS[directSubject] && QUICK_TOPIC_SUGGESTIONS[directSubject].length > 0 && (
                    <div className="pt-1.5 space-y-1.5">
                      <p className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        Tópicos com alta incidência em {directSubject}:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_TOPIC_SUGGESTIONS[directSubject].map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => setDirectTopicContent(sug)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-blue-300 hover:border-blue-500/40 hover:bg-slate-900 transition-colors text-left cursor-pointer"
                          >
                            + {sug}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Controls */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setFormTitle(directTopicContent);
                        setFormSubject(directSubject);
                        setModalMode('manual');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 transition-colors text-center sm:text-left cursor-pointer"
                    >
                      Prefere digitar manualmente ou anexar fotos? <span className="underline text-blue-400">Abrir Formulário Completo</span>
                    </button>

                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={handleGenerateAndReview}
                        disabled={isGeneratingAI || !directTopicContent.trim()}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        title="Gera a anotação detalhada e abre o formulário para você revisar ou anexar imagem antes de salvar"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span>Gerar e Revisar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleGenerateAndSaveDirectly}
                        disabled={isGeneratingAI || !directTopicContent.trim()}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 via-blue-600 to-indigo-600 hover:from-amber-400 hover:via-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-950/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:scale-102 active:scale-98"
                        title="Gera a anotação padrão Cartografia e salva imediatamente no Bizuário"
                      >
                        {isGeneratingAI ? (
                          <>
                            <Sparkles className="w-4 h-4 text-amber-200 animate-spin" />
                            <span>Gerando Anotação Detalhada...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 text-amber-300" />
                            <span>⚡ Gerar e Salvar Direto</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* VIEW 2: MANUAL / FULL EDIT FORM */
              <form onSubmit={handleSaveBizu} className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-thin">
                {!editingBizu && (
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => setModalMode('ai_direct')}
                      className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar ao Gerador Direto com IA (Apenas Matéria + Conteúdo)</span>
                    </button>
                  </div>
                )}
              {/* Row 1: Title & Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Título do Bizu / Assunto *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Mares, Canais e Estreitos da Europa"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Nome da Matéria / Disciplina *
                  </label>
                  <input
                    type="text"
                    required
                    list="subjects-datalist"
                    placeholder="Ex: Geografia, História, Física..."
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                  <datalist id="subjects-datalist">
                    {availableSubjectNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Row 2: Category & Favorite */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Subcategoria / Eixo Temático (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Geopolítica, Cartografia, Termodinâmica"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={formIsFavorite}
                      onChange={(e) => setFormIsFavorite(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-0"
                    />
                    <span className="flex items-center gap-1 text-amber-400">
                      <Star className={`w-3.5 h-3.5 ${formIsFavorite ? 'fill-amber-400' : ''}`} />
                      Marcar como Bizu Prioritário (Favorito)
                    </span>
                  </label>
                </div>
              </div>

              {/* Image Upload Area */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  Foto / Imagem do Bizu (Mapa, Esquema, Questão, Tabela)
                </label>

                {formImageUrl ? (
                  <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden aspect-16/9 flex items-center justify-center group">
                    <img
                      src={formImageUrl}
                      alt="Preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                      >
                        Trocar Imagem
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormImageUrl('')}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-6 text-center cursor-pointer bg-slate-950/50 hover:bg-slate-950 transition-all group"
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileChange(e)}
                    />
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-200">
                      Clique para selecionar ou arraste uma foto do seu computador/celular
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      PNG, JPG, WEBP, GIF (salvo diretamente no seu navegador)
                    </p>
                  </div>
                )}

                {/* Alternative: URL input */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-500 shrink-0 flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" />
                    Ou insira URL web:
                  </span>
                  <input
                    type="url"
                    placeholder="https://exemplo.com/imagem-mapa.png"
                    value={formImageUrl.startsWith('data:') ? '' : formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-slate-950 border border-slate-800 text-slate-300 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Key Points (Bullets) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  Pontos Estratégicos Rápidos (Bizus em Tópicos)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: Estreito de Ormuz liga o Golfo Pérsico ao Mar de Omã"
                    value={formKeyPointInput}
                    onChange={(e) => setFormKeyPointInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyPoint();
                      }
                    }}
                    className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyPoint}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    Adicionar
                  </button>
                </div>

                {formKeyPoints.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {formKeyPoints.map((point, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300"
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                          <span>{point}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyPoint(index)}
                          className="text-slate-500 hover:text-red-400 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detailed Notes / Textarea with KaTeX Formula Preview & Gemini AI Button */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-bold text-slate-300">
                      Anotações Detalhadas &amp; Macetes Mnemônicos
                    </label>
                    {formNotes.trim() && (
                      <button
                        type="button"
                        onClick={() => setPreviewNotesLatex(!previewNotesLatex)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                          previewNotesLatex
                            ? 'bg-blue-600/30 text-blue-300 border-blue-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        <span>{previewNotesLatex ? 'Voltar ao Editor' : 'Ver Fórmulas (KaTeX)'}</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateAINotes()}
                    disabled={isGeneratingAI}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isGeneratingAI ? 'animate-spin' : 'animate-pulse'}`} />
                    <span>{isGeneratingAI ? 'Gerando com Gemini AI...' : '✨ Gerar Anotações com Gemini AI'}</span>
                  </button>
                </div>
                {previewNotesLatex && formNotes.trim() ? (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans max-h-60 overflow-y-auto scrollbar-thin">
                    <Latex content={formNotes} />
                  </div>
                ) : (
                  <textarea
                    rows={6}
                    placeholder="Escreva dicas mnemônicas, resumo, fórmulas, pegadinhas... Ou use o Gerador Direto com IA!"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none scrollbar-thin"
                  />
                )}
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  Palavras-chave &amp; Tags
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: Mares, Geopolítica, Estreitos (pressione Enter)"
                    value={formTagInput}
                    onChange={(e) => setFormTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    + Tag
                  </button>
                </div>

                {formTags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {formTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-red-400 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950/40 transition-colors cursor-pointer"
                >
                  {editingBizu ? 'Salvar Alterações' : 'Cadastrar Bizu'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )}

      {/* FULLSCREEN IMAGE LIGHTBOX / ZOOM VIEWER */}
      {viewingImage && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md animate-fade-in">
          {/* Lightbox Header */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-black/40">
            <div className="space-y-0.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-blue-600/30 text-blue-400 border border-blue-500/30">
                {viewingImage.subject}
              </span>
              <h4 className="text-base font-bold text-white">{viewingImage.title}</h4>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                  title="Diminuir Zoom"
                  className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono font-bold text-slate-300 px-2">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                  title="Aumentar Zoom"
                  className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  title="Resetar Zoom"
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Close Button */}
              <button
                onClick={() => {
                  setViewingImage(null);
                  setZoomLevel(1);
                }}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-red-600 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Content Area */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 select-none">
            <img
              src={viewingImage.url}
              alt={viewingImage.title}
              referrerPolicy="no-referrer"
              style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.15s ease-out' }}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* FULL EXPANDED READING MODAL FOR BIZU TOPICS */}
      {viewingNotesBizu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border ${
              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            } overflow-hidden`}
          >
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'
            }`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-600/20 text-blue-400 border border-blue-500/30">
                    {viewingNotesBizu.subjectName}
                  </span>
                  {viewingNotesBizu.category && (
                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      • {viewingNotesBizu.category}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-black tracking-tight">{viewingNotesBizu.title}</h3>
              </div>
              <button
                onClick={() => setViewingNotesBizu(null)}
                className={`p-2 rounded-xl transition-colors ${
                  isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 scrollbar-thin">
              {/* Optional Diagram Thumbnail */}
              {viewingNotesBizu.imageUrl && (
                <div
                  onClick={() => {
                    setViewingImage({
                      url: viewingNotesBizu.imageUrl!,
                      title: viewingNotesBizu.title,
                      subject: viewingNotesBizu.subjectName,
                    });
                    setZoomLevel(1);
                  }}
                  className={`relative rounded-xl overflow-hidden cursor-pointer group border ${
                    isDark ? 'border-slate-800 bg-black/40' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <img
                    src={viewingNotesBizu.imageUrl}
                    alt={viewingNotesBizu.title}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-60 object-contain mx-auto transition-transform group-hover:scale-[1.02]"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 text-white font-bold text-xs transition-opacity">
                    <Maximize2 className="w-4 h-4" />
                    <span>Clique para ampliar esquema</span>
                  </div>
                </div>
              )}

              {/* Separated Topics Viewer */}
              {viewingNotesBizu.notes && (
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-blue-400 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Tópicos Estruturados &amp; Relações Conceituais
                  </h4>
                  <BizuTopicViewer notes={viewingNotesBizu.notes} isDark={isDark} />
                </div>
              )}

              {/* Keypoints */}
              {viewingNotesBizu.keyPoints && viewingNotesBizu.keyPoints.length > 0 && (
                <div className={`p-4 rounded-xl border ${
                  isDark ? 'bg-slate-950/40 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                }`}>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2.5 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    Pontos de Revisão de Véspera (Alta Incidência):
                  </h4>
                  <ul className="space-y-1.5 text-xs">
                    {viewingNotesBizu.keyPoints.map((pt, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        <div className="leading-relaxed">
                          <Latex content={pt} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tags */}
              {viewingNotesBizu.tags && viewingNotesBizu.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-2">
                  {viewingNotesBizu.tags.map((t) => (
                    <span
                      key={t}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                        isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className={`px-6 py-3.5 border-t flex items-center justify-between ${
              isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'
            }`}>
              <button
                type="button"
                onClick={() => {
                  if (viewingNotesBizu.notes) {
                    navigator.clipboard.writeText(viewingNotesBizu.notes);
                    showToast('Anotação copiada para a área de transferência!', 'success');
                  }
                }}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                  isDark
                    ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                    : 'border-slate-300 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Copiar Texto</span>
              </button>

              <button
                type="button"
                onClick={() => setViewingNotesBizu(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
