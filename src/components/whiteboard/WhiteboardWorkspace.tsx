import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Tldraw,
  Editor,
  TLComponents,
  AssetRecordType,
  getSnapshot,
  loadSnapshot,
  TLRecord,
  createShapeId,
} from 'tldraw';
import 'tldraw/tldraw.css';
import {
  Pen,
  Highlighter,
  Eraser,
  MousePointer,
  Hand,
  Undo2,
  Redo2,
  Lock,
  Unlock,
  RefreshCw,
  Plus,
  Maximize2,
  Minimize2,
  ChevronDown,
  Layers,
  ChevronLeft,
  CheckCircle2,
  Cloud,
  CloudOff,
  AlertTriangle,
  FolderOpen,
  Camera,
  FileImage,
} from 'lucide-react';
import { WhiteboardBackground, WhiteboardBackgroundType } from './WhiteboardBackground';
import { WhiteboardCaptureModal } from './WhiteboardCaptureModal';
import { WhiteboardListModal } from './WhiteboardListModal';
import { apiFetch } from '../../services/apiFetch';

interface WhiteboardWorkspaceProps {
  boardId?: string;
  onNavigateBack?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const PEN_COLORS = [
  { name: 'Branco', value: 'white', hex: '#ffffff' },
  { name: 'Vermelho', value: 'red', hex: '#ef4444' },
  { name: 'Azul', value: 'blue', hex: '#3b82f6' },
  { name: 'Verde', value: 'green', hex: '#10b981' },
  { name: 'Amarelo', value: 'yellow', hex: '#eab308' },
];

const PEN_SIZES = [
  { name: 'Fina', value: 's', label: 'S' },
  { name: 'Média', value: 'm', label: 'M' },
  { name: 'Grossa', value: 'l', label: 'L' },
  { name: 'Marcador', value: 'xl', label: 'XL' },
];

export const WhiteboardWorkspace: React.FC<WhiteboardWorkspaceProps> = ({
  boardId: propBoardId,
  onNavigateBack,
  showToast,
}) => {
  const [boardId, setBoardId] = useState<string>(propBoardId || '');
  const [boardTitle, setBoardTitle] = useState('Quadro Negro de Resolução');
  const [backgroundType, setBackgroundType] = useState<WhiteboardBackgroundType>('pure_black');
  const [serverVersion, setServerVersion] = useState<number>(1);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline' | 'error' | 'conflict'>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<string>('agora');
  const [isPenMode, setIsPenMode] = useState<boolean>(true);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>('draw');
  const [activePenColor, setActivePenColor] = useState('white');
  const [activePenSize, setActivePenSize] = useState('m');
  const [isLockedSelected, setIsLockedSelected] = useState<boolean | null>(null);

  const editorRef = useRef<Editor | null>(null);
  const hasPendingChangesRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef<string>('');
  const lastSavedVersionRef = useRef<number>(1);
  const isApplyingRemoteRef = useRef<boolean>(false);

  // Inicializar Device ID para neutralizar ecos de SSE
  useEffect(() => {
    let devId = sessionStorage.getItem('cfo_whiteboard_device_id');
    if (!devId) {
      devId = `dev_${crypto.randomUUID().slice(0, 8)}`;
      sessionStorage.setItem('cfo_whiteboard_device_id', devId);
    }
    deviceIdRef.current = devId;
  }, []);

  // Buscar ou provisionar quadro inicial se nenhum for passado
  useEffect(() => {
    let isCancelled = false;
    const initBoard = async () => {
      try {
        if (boardId) {
          const res = await apiFetch(`/api/whiteboards/${boardId}`);
          if (res.ok) {
            const data = await res.json();
            if (!isCancelled) {
              setBoardTitle(data.board?.title || 'Quadro de Resolução');
              setBackgroundType((data.board?.background_type as WhiteboardBackgroundType) || 'pure_black');
              setServerVersion(data.board?.version || 1);
              lastSavedVersionRef.current = data.board?.version || 1;
            }
            return;
          }
        }

        // Se não houver boardId ou não foi encontrado, busca o mais recente ou cria um padrão
        const listRes = await apiFetch('/api/whiteboards');
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.boards && listData.boards.length > 0) {
            const latest = listData.boards[0];
            if (!isCancelled) {
              setBoardId(latest.id);
              setBoardTitle(latest.title);
              setBackgroundType((latest.background_type as WhiteboardBackgroundType) || 'pure_black');
              setServerVersion(latest.version);
              lastSavedVersionRef.current = latest.version;
            }
            return;
          }
        }

        // Cria o primeiro quadro caso usuário não tenha nenhum
        const createRes = await apiFetch('/api/whiteboards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Resolução de Questões CFO CBMERJ',
            backgroundType: 'pure_black',
          }),
        });
        if (createRes.ok) {
          const createData = await createRes.json();
          if (!isCancelled && createData.board) {
            setBoardId(createData.board.id);
            setBoardTitle(createData.board.title);
            setBackgroundType((createData.board.background_type as WhiteboardBackgroundType) || 'pure_black');
            setServerVersion(createData.board.version);
            lastSavedVersionRef.current = createData.board.version;
          }
        }
      } catch (err) {
        console.error('[WhiteboardInit]', err);
      }
    };

    initBoard();
    return () => {
      isCancelled = true;
    };
  }, [boardId]);

  // Função central de persistência para a nuvem
  const saveToCloud = useCallback(async (isForced = false) => {
    if (!editorRef.current || !boardId) return;
    if (!hasPendingChangesRef.current && !isForced) return;

    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('saving');
    try {
      const snapshot = getSnapshot(editorRef.current.store);
      const documentState = JSON.stringify(snapshot);

      const res = await apiFetch(`/api/whiteboards/${boardId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentState,
          clientVersion: lastSavedVersionRef.current,
          deviceId: deviceIdRef.current,
        }),
      });

      if (res.status === 409) {
        // Conflito de versão: outro dispositivo salvou antes
        const conflictData = await res.json();
        setSyncStatus('conflict');
        setServerVersion(conflictData.serverVersion);

        // Se houver snapshot do servidor, reconcilia sem descartar rabiscos locais
        if (conflictData.currentDocumentState && editorRef.current) {
          try {
            const remoteSnap = JSON.parse(conflictData.currentDocumentState);
            const remoteRecords = remoteSnap.document?.records || remoteSnap.records || [];
            if (Array.isArray(remoteRecords) && remoteRecords.length > 0) {
              isApplyingRemoteRef.current = true;
              editorRef.current.store.mergeRemoteChanges(() => {
                editorRef.current?.store.put(remoteRecords);
              });
              isApplyingRemoteRef.current = false;
            }
          } catch (e) {
            console.warn('[ConflictReconciliation]', e);
          }
        }
        showToast?.('Alterações remotas integradas ao seu quadro.', 'info');
        return;
      }

      if (!res.ok) {
        throw new Error('SAVE_FAILED');
      }

      const data = await res.json();
      hasPendingChangesRef.current = false;
      setServerVersion(data.version);
      lastSavedVersionRef.current = data.version;
      setSyncStatus('synced');
      setLastSyncTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('[WhiteboardSaveError]', err);
      setSyncStatus('error');
    }
  }, [boardId, showToast]);

  // Agendar salvamento debounced (1500ms)
  const scheduleAutosave = useCallback(() => {
    hasPendingChangesRef.current = true;
    setSyncStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveToCloud();
    }, 1500);
  }, [saveToCloud]);

  // Carregar dados remotos do quadro no editor
  const loadBoardData = useCallback(async (targetBoardId: string, editor: Editor) => {
    if (!targetBoardId) return;
    try {
      const res = await apiFetch(`/api/whiteboards/${targetBoardId}`);
      if (!res.ok) return;

      const data = await res.json();
      setBoardTitle(data.board?.title || 'Quadro de Resolução');
      setBackgroundType((data.board?.background_type as WhiteboardBackgroundType) || 'pure_black');
      setServerVersion(data.board?.version || 1);
      lastSavedVersionRef.current = data.board?.version || 1;

      if (data.document?.document_state && data.document.document_state !== '{}') {
        const parsed = JSON.parse(data.document.document_state);
        isApplyingRemoteRef.current = true;
        loadSnapshot(editor.store, parsed);
        isApplyingRemoteRef.current = false;
        hasPendingChangesRef.current = false;
        setSyncStatus('synced');
      }
    } catch (err) {
      console.error('[LoadBoardData]', err);
    }
  }, []);

  // Configuração inicial e callbacks do tldraw editor
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Configurar preferências visuais de quadro negro
    editor.user.updateUserPreferences({
      colorScheme: 'dark',
      isSnapMode: false,
    });

    // Iniciar no estilo quadro negro padrão
    editor.setCurrentTool('draw');
    setSelectedTool('draw');

    // Ativar Pen Mode nativo por padrão (tablet-first)
    editor.updateInstanceState({ isPenMode: true });
    setIsPenMode(true);

    // Carregar estado do banco se disponível
    if (boardId) {
      loadBoardData(boardId, editor);
    }

    // Escutar mudanças do store com guarda anti-echo de mudanças remotas
    const cleanupListen = editor.store.listen((entry) => {
      if (isApplyingRemoteRef.current) return;
      if (entry.source === 'user') {
        scheduleAutosave();
      }
    });

    // Rastrear seleção atual para habilitar botão de travar/destravar questão
    const cleanupSelection = editor.sideEffects.registerAfterChangeHandler('instance_page_state', () => {
      const selectedShapes = editor.getSelectedShapes();
      if (selectedShapes.length === 1) {
        setIsLockedSelected(Boolean(selectedShapes[0].isLocked));
      } else {
        setIsLockedSelected(null);
      }
    });

    return () => {
      cleanupListen();
      cleanupSelection();
    };
  }, [boardId, loadBoardData, scheduleAutosave]);

  // Escutar eventos de tela/caneta Pointer Events para auto-detectar Stylus
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'pen' && editorRef.current) {
        if (!isPenMode) {
          editorRef.current.updateInstanceState({ isPenMode: true });
          setIsPenMode(true);
        }
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isPenMode]);

  // Listener global de colagem de imagem (Ctrl+V)
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Ignora se estiver focado em um input de texto comum
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '')) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              if (base64) {
                // Dimensões estimadas ou extraídas da imagem
                const img = new Image();
                img.onload = () => {
                  handleInsertQuestionAsset(base64, img.naturalWidth || 800, img.naturalHeight || 600);
                };
                img.src = base64;
              }
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [boardId]);

  // Listener de reconexão de internet (Offline -> Online)
  useEffect(() => {
    const handleOnline = () => {
      if (hasPendingChangesRef.current) {
        saveToCloud(true);
      } else {
        setSyncStatus('synced');
      }
    };
    const handleOffline = () => {
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [saveToCloud]);

  // Conexão SSE para sincronização instantânea entre dispositivos (Desktop <-> Tablet)
  useEffect(() => {
    if (!boardId) return;

    let isSubscribed = true;
    const abortController = new AbortController();

    const connectEvents = async () => {
      try {
        const token = localStorage.getItem('cfo_terminal_session') || localStorage.getItem('cfo_terminal_token');
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`/api/whiteboards/${boardId}/events?deviceId=${deviceIdRef.current}`, {
          headers,
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (isSubscribed && !abortController.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
            if (!dataLine) continue;

            try {
              const event = JSON.parse(dataLine.slice(5).trim());

              // Ignora eventos enviados por este mesmo dispositivo
              if (event.senderDeviceId === deviceIdRef.current) continue;

              if (event.type === 'VERSION_UPDATE' || event.type === 'ASSET_ADDED') {
                // Dispositivo remoto atualizou o quadro!
                if (!editorRef.current) continue;

                // Buscar estado atualizado
                const fetchRes = await apiFetch(`/api/whiteboards/${boardId}`);
                if (!fetchRes.ok) continue;
                const freshData = await fetchRes.json();

                if (freshData.document?.document_state) {
                  const remoteSnapshot = JSON.parse(freshData.document.document_state);
                  const remoteRecords = remoteSnapshot.document?.records || remoteSnapshot.records || [];

                  if (Array.isArray(remoteRecords) && remoteRecords.length > 0) {
                    isApplyingRemoteRef.current = true;
                    editorRef.current.store.mergeRemoteChanges(() => {
                      editorRef.current?.store.put(remoteRecords);
                    });
                    isApplyingRemoteRef.current = false;
                  }
                }

                setServerVersion(freshData.board?.version || event.version);
                lastSavedVersionRef.current = freshData.board?.version || event.version;
                setSyncStatus('synced');
                setLastSyncTime('agora');
                showToast?.('Quadro atualizado pelo outro dispositivo.', 'info');
              }
            } catch (jsonErr) {
              console.warn('[SSEParseError]', jsonErr);
            }
          }
        }
      } catch (err: any) {
        if (!abortController.signal.aborted && isSubscribed) {
          // Tentativa de reconexão em 5 segundos
          setTimeout(connectEvents, 5000);
        }
      }
    };

    connectEvents();

    return () => {
      isSubscribed = false;
      abortController.abort();
    };
  }, [boardId, showToast]);

  // Inserção da Imagem da Questão (com trava automática de enunciado)
  const handleInsertQuestionAsset = async (base64: string, naturalW: number, naturalH: number) => {
    if (!editorRef.current || !boardId) return;

    try {
      showToast?.('Enviando questão para armazenamento persistente...', 'info');

      // Upload para o Cloudflare R2 / S3
      const res = await apiFetch(`/api/whiteboards/${boardId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64,
          filename: `question_${Date.now()}.png`,
          width: naturalW,
          height: naturalH,
          deviceId: deviceIdRef.current,
        }),
      });

      if (!res.ok) {
        throw new Error('FALHA_NO_UPLOAD_DO_ENUNCIADO');
      }

      const { asset } = await res.json();
      const editor = editorRef.current;

      // Calcular posição central no viewport do aluno
      const viewportBounds = editor.getViewportPageBounds();
      const center = viewportBounds.center;

      // Dimensionar responsivamente no canvas (máx 720px de largura mantendo proporção)
      const maxW = Math.min(720, Math.max(300, viewportBounds.width * 0.7));
      const scale = naturalW > maxW ? maxW / naturalW : 1;
      const finalW = Math.round(naturalW * scale);
      const finalH = Math.round(naturalH * scale);

      const assetId = AssetRecordType.createId();

      // 1. Criar Asset no tldraw store
      editor.createAssets([
        {
          id: assetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: asset.filename,
            src: asset.url,
            w: finalW,
            h: finalH,
            mimeType: asset.mime_type || 'image/png',
            isAnimated: false,
          },
          meta: {},
        },
      ]);

      // 2. Criar Shape travado no canvas (evita mover acidentalmente enquanto o aluno escreve)
      const shapeId = createShapeId();
      editor.createShape({
        id: shapeId,
        type: 'image',
        x: Math.round(center.x - finalW / 2),
        y: Math.round(center.y - finalH / 2),
        isLocked: true, // Fixado por padrão
        props: {
          assetId,
          w: finalW,
          h: finalH,
        },
      });

      // Mudar ferramenta ativa de volta para caneta para o aluno começar a resolver
      editor.setCurrentTool('draw');
      setSelectedTool('draw');

      showToast?.('Questão fixada no quadro! Você já pode resolver.', 'success');
      saveToCloud(true);
    } catch (err: any) {
      console.error('[InsertQuestionAssetError]', err);
      showToast?.('Falha ao inserir questão no quadro.', 'error');
    }
  };

  // Travar / Destravar questão selecionada
  const toggleLockSelected = () => {
    if (!editorRef.current) return;
    const selected = editorRef.current.getSelectedShapes();
    if (selected.length === 0) return;

    const currentLock = Boolean(selected[0].isLocked);
    editorRef.current.updateShapes(
      selected.map((s) => ({
        id: s.id,
        type: s.type,
        isLocked: !currentLock,
      }))
    );
    setIsLockedSelected(!currentLock);
    showToast?.(!currentLock ? 'Questão travada (não moverá enquanto você escreve).' : 'Questão destravada para mover/redimensionar.', 'info');
    scheduleAutosave();
  };

  // Componentes customizados do tldraw: Fundo dinâmico
  const customComponents: TLComponents = React.useMemo(() => {
    return {
      Background: () => <WhiteboardBackground backgroundType={backgroundType} />,
    };
  }, [backgroundType]);

  // Ações da Toolbar
  const handleSelectTool = (toolId: string) => {
    if (!editorRef.current) return;
    editorRef.current.setCurrentTool(toolId);
    setSelectedTool(toolId);
  };

  const handleSetColor = (colorName: string) => {
    setActivePenColor(colorName);
    if (!editorRef.current) return;
    editorRef.current.setCurrentTool('draw');
    setSelectedTool('draw');
    (editorRef.current as any).setStyleForNextShapes?.('color', colorName);
  };

  const handleTogglePenMode = () => {
    if (!editorRef.current) return;
    const nextMode = !isPenMode;
    editorRef.current.updateInstanceState({ isPenMode: nextMode });
    setIsPenMode(nextMode);
    showToast?.(nextMode ? '🖊️ Modo Caneta Ativado (Toque de dedos apenas navega e dá zoom)' : 'Modo Toque Livre Ativado', 'info');
  };

  return (
    <div className="relative w-full h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-4.5rem)] flex flex-col bg-black overflow-hidden select-none">
      {/* Barra de Topo Tática */}
      <header className="h-12 border-b border-slate-800 bg-[#0d0e12] flex items-center justify-between px-3 sm:px-4 z-20 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          {onNavigateBack && (
            <button
              onClick={onNavigateBack}
              title="Voltar ao Cronograma"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={() => setIsListModalOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 hover:border-amber-400/80 text-white text-xs font-semibold max-w-[200px] sm:max-w-[320px] transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{boardTitle}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {/* Seletor de Tipo de Fundo */}
          <select
            value={backgroundType}
            onChange={(e) => {
              const val = e.target.value as WhiteboardBackgroundType;
              setBackgroundType(val);
              apiFetch(`/api/whiteboards/${boardId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backgroundType: val }),
              }).catch(() => {});
            }}
            className="hidden sm:block px-2 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            <option value="pure_black">Preto Puro</option>
            <option value="dark_gray">Cinza Escuro</option>
            <option value="dots">Pontilhado</option>
            <option value="grid">Grade Padrão</option>
            <option value="large_grid">Grade Grande</option>
            <option value="ruled">Caderno Pautado</option>
          </select>
        </div>

        {/* Controles da Direita */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Indicador e Botão Pen Mode / Palm Rejection */}
          <button
            onClick={handleTogglePenMode}
            title={isPenMode ? 'Modo Caneta/Stylus ATIVO (Dedos apenas dão zoom/pan)' : 'Clique para ativar rejeição de palma'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              isPenMode
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            <Pen className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{isPenMode ? 'Stylus Ativo' : 'Toque Livre'}</span>
          </button>

          {/* Botão Adicionar Questão (Captura / Upload / Colar) */}
          <button
            onClick={() => setIsCaptureModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-md shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Adicionar Questão</span>
            <span className="sm:hidden">Questão</span>
          </button>

          {/* Status de Sincronização & Botão Sincronizar Agora */}
          <button
            onClick={() => saveToCloud(true)}
            title={`Clique para sincronizar agora (v${serverVersion})`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 hover:border-slate-600 text-xs transition-colors"
          >
            {syncStatus === 'synced' && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline text-slate-300">Sincronizado</span>
              </>
            )}
            {syncStatus === 'saving' && (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="hidden lg:inline text-amber-300">Salvando...</span>
              </>
            )}
            {syncStatus === 'offline' && (
              <>
                <CloudOff className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden lg:inline text-red-300">Offline</span>
              </>
            )}
            {syncStatus === 'error' && (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden lg:inline text-red-300">Erro sync</span>
              </>
            )}
            {syncStatus === 'conflict' && (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden lg:inline text-cyan-300">Atualizado</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Canvas Infinito do Tldraw */}
      <div className="relative flex-1 w-full h-full overflow-hidden bg-black">
        {boardId && (
          <Tldraw
            persistenceKey={`cfo_whiteboard_${boardId}`}
            components={customComponents}
            onMount={handleMount}
            autoFocus
          />
        )}

        {/* Barra de Ferramentas Flutuante Tática (Quadro Negro) */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 bottom-5 z-30 flex items-center gap-1 p-1.5 rounded-2xl border border-slate-800 bg-[#121216]/95 backdrop-blur-xl shadow-2xl transition-all duration-200 ${
            isToolbarCollapsed ? 'translate-y-16 opacity-30 hover:opacity-100 hover:translate-y-0' : 'opacity-100'
          }`}
        >
          {/* Caneta */}
          <button
            onClick={() => handleSelectTool('draw')}
            title="Caneta Stylus"
            className={`p-2 rounded-xl transition-all ${
              selectedTool === 'draw'
                ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Pen className="w-4 h-4" />
          </button>

          {/* Marca-texto */}
          <button
            onClick={() => handleSelectTool('highlight')}
            title="Marca-texto"
            className={`p-2 rounded-xl transition-all ${
              selectedTool === 'highlight'
                ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Highlighter className="w-4 h-4" />
          </button>

          {/* Borracha */}
          <button
            onClick={() => handleSelectTool('eraser')}
            title="Borracha"
            className={`p-2 rounded-xl transition-all ${
              selectedTool === 'eraser'
                ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Eraser className="w-4 h-4" />
          </button>

          {/* Selecionar / Mover */}
          <button
            onClick={() => handleSelectTool('select')}
            title="Seleção de Objetos"
            className={`p-2 rounded-xl transition-all ${
              selectedTool === 'select'
                ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MousePointer className="w-4 h-4" />
          </button>

          {/* Mão / Pan */}
          <button
            onClick={() => handleSelectTool('hand')}
            title="Mão para Arrastar o Canvas"
            className={`p-2 rounded-xl transition-all ${
              selectedTool === 'hand'
                ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Hand className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-6 bg-slate-800 mx-1" />

          {/* Paleta de Cores Rápidas */}
          <div className="flex items-center gap-1">
            {PEN_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => handleSetColor(c.value)}
                title={`Cor ${c.name}`}
                className={`w-6 h-6 rounded-full border transition-all ${
                  activePenColor === c.value ? 'scale-110 border-white ring-2 ring-amber-400' : 'border-slate-700/60 opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>

          <div className="w-[1px] h-6 bg-slate-800 mx-1" />

          {/* Travar/Destravar Elemento Selecionado */}
          {isLockedSelected !== null && (
            <button
              onClick={toggleLockSelected}
              title={isLockedSelected ? 'Destravar Questão Selecionada' : 'Travar Questão Selecionada (evita mover enquanto rabisca)'}
              className={`p-2 rounded-xl transition-all ${
                isLockedSelected ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {isLockedSelected ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
          )}

          {/* Desfazer / Refazer */}
          <button
            onClick={() => editorRef.current?.undo()}
            title="Desfazer (Ctrl+Z)"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => editorRef.current?.redo()}
            title="Refazer (Ctrl+Y)"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-6 bg-slate-800 mx-1" />

          {/* Recolher / Expandir Barra */}
          <button
            onClick={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
            title={isToolbarCollapsed ? 'Expandir Barra de Ferramentas' : 'Ocultar Barra para tela limpa'}
            className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg transition-colors"
          >
            {isToolbarCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Modal de Captura / Upload / Recorte de Questão */}
      <WhiteboardCaptureModal
        isOpen={isCaptureModalOpen}
        onClose={() => setIsCaptureModalOpen(false)}
        onCapture={handleInsertQuestionAsset}
      />

      {/* Modal de Gestão de Múltiplos Quadros */}
      <WhiteboardListModal
        isOpen={isListModalOpen}
        onClose={() => setIsListModalOpen(false)}
        currentBoardId={boardId}
        onSelectBoard={(selectedId) => {
          setBoardId(selectedId);
          if (editorRef.current) {
            loadBoardData(selectedId, editorRef.current);
          }
        }}
        showToast={showToast}
      />
    </div>
  );
};
