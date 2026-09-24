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
  DefaultColorStyle,
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
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Palette,
} from 'lucide-react';
import { WhiteboardBackground, WhiteboardBackgroundType } from './WhiteboardBackground';
import { WhiteboardCaptureModal } from './WhiteboardCaptureModal';
import { WhiteboardListModal } from './WhiteboardListModal';
import { apiFetch } from '../../services/apiFetch';
import {
  saveBoardOffline,
  loadBoardOffline,
  markBoardSynced,
} from '../../utils/whiteboardOfflineCache';

interface WhiteboardWorkspaceProps {
  userId?: string;
  boardId?: string;
  onNavigateBack?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const PEN_COLORS = [
  { name: 'Branco', value: 'white', hex: '#ffffff' },
  { name: 'Preto', value: 'black', hex: '#000000' },
  { name: 'Vermelho', value: 'red', hex: '#ef4444' },
  { name: 'Azul', value: 'blue', hex: '#3b82f6' },
  { name: 'Verde', value: 'green', hex: '#10b981' },
  { name: 'Amarelo', value: 'yellow', hex: '#eab308' },
];

const BACKGROUND_OPTIONS: { type: WhiteboardBackgroundType; label: string; preview: string }[] = [
  { type: 'pure_black', label: 'Preto Puro', preview: '#000000' },
  { type: 'dark_gray', label: 'Cinza Escuro', preview: '#121214' },
  { type: 'white', label: 'Branco / Caderno', preview: '#ffffff' },
  { type: 'dots', label: 'Pontilhado', preview: '#222226' },
  { type: 'grid', label: 'Grade Padrão', preview: '#1e293b' },
  { type: 'large_grid', label: 'Grade Grande', preview: '#0f172a' },
  { type: 'ruled', label: 'Caderno Pautado', preview: '#18181b' },
];

const PEN_SIZES = [
  { name: 'Fina', value: 's', label: 'S' },
  { name: 'Média', value: 'm', label: 'M' },
  { name: 'Grossa', value: 'l', label: 'L' },
  { name: 'Marcador', value: 'xl', label: 'XL' },
];

import {
  isGenericStylusEvent,
  resolveStylusTargetTool,
  StylusDiagnostics,
} from '../../utils/whiteboardStylus';

export {
  isGenericStylusEvent,
  resolveStylusTargetTool,
  type StylusDiagnostics,
};

export const WhiteboardWorkspace: React.FC<WhiteboardWorkspaceProps> = ({
  userId: propUserId,
  boardId: propBoardId,
  onNavigateBack,
  showToast,
}) => {
  const isStylusDebugActive = typeof window !== 'undefined' && (
    import.meta.env.DEV || window.location.search.includes('stylus_debug=1')
  );

  // 1. Linha de base pura tldraw para isolamento de input
  if (typeof window !== 'undefined' && window.location.search.includes('pure_tldraw=1')) {
    return (
      <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 9999, backgroundColor: '#000' }}>
        <Tldraw
          onMount={(editor) => {
            editor.setCurrentTool('draw');
          }}
          autoFocus
        />
      </div>
    );
  }
  const [stylusDiag, setStylusDiag] = useState<StylusDiagnostics | null>(null);
  const resolvedUserId = propUserId || (typeof window !== 'undefined' ? localStorage.getItem('cfo_user_id') || 'default_cadet' : 'default_cadet');
  const [boardId, setBoardId] = useState<string>(propBoardId || '');
  const [boardTitle, setBoardTitle] = useState('Quadro Negro de Resolução');
  const [backgroundType, setBackgroundType] = useState<WhiteboardBackgroundType>('pure_black');
  const [serverVersion, setServerVersion] = useState<number>(1);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline' | 'pending' | 'error' | 'conflict'>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<string>('agora');
  const [isPenMode, setIsPenMode] = useState<boolean>(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [isBgPickerOpen, setIsBgPickerOpen] = useState(false);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>('draw');
  const selectedToolRef = useRef<string>(selectedTool);
  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);
  const [activePenColor, setActivePenColor] = useState('white');
  const [activePenSize, setActivePenSize] = useState('m');
  const [isLockedSelected, setIsLockedSelected] = useState<boolean | null>(null);

  const editorRef = useRef<Editor | null>(null);
  const hasPendingChangesRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef<string>('');
  const lastSavedVersionRef = useRef<number>(1);
  const lastSavedDocumentStateRef = useRef<string>('');
  const isApplyingRemoteRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);

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
      } finally {
        if (!isCancelled) {
          setBoardId((current) => current || 'default_offline_board');
        }
      }
    };

    initBoard();
    return () => {
      isCancelled = true;
    };
  }, [boardId]);

  // Função central de persistência para a nuvem com tolerância a falhas e auto-reconciliação
  const saveToCloud = useCallback(async (isForced = false) => {
    if (!editorRef.current || !boardId) return;
    if (!hasPendingChangesRef.current && !isForced) return;
    if (isSavingRef.current) return;

    const snapshot = getSnapshot(editorRef.current.store);
    const documentState = JSON.stringify(snapshot);

    // Evita upload redundante se nada mudou no documento
    if (!isForced && documentState === lastSavedDocumentStateRef.current) {
      hasPendingChangesRef.current = false;
      setSyncStatus('synced');
      return;
    }

    // Salva sempre no IndexedDB offline primeiro (garante que nada seja perdido se a página fechar)
    saveBoardOffline(resolvedUserId, boardId, {
      title: boardTitle,
      backgroundType,
      version: lastSavedVersionRef.current,
      documentState,
      hasPendingSync: true,
    }).catch(() => {});

    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }

    isSavingRef.current = true;
    setSyncStatus('saving');

    try {
      // Coleta chaves de assets ativos no documento para limpeza segura de órfãos
      const allRecords = editorRef.current.store.allRecords();
      const activeAssetKeys: string[] = [];
      for (const r of allRecords) {
        if (r.typeName === 'asset' && (r as any).props?.src) {
          const src = String((r as any).props.src);
          const match = src.match(/\/api\/whiteboards\/media\/([^?#]+)/);
          if (match) activeAssetKeys.push(match[1]);
        }
      }

      const res = await apiFetch(`/api/whiteboards/${boardId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentState,
          clientVersion: lastSavedVersionRef.current,
          deviceId: deviceIdRef.current,
          activeAssetKeys,
        }),
      });

      if (res.status === 409) {
        // Conflito de versão monotônica (edições concorrentes PC <-> Tablet)
        const conflictData = await res.json();
        setSyncStatus('conflict');
        const remoteVersion = conflictData.serverVersion;
        setServerVersion(remoteVersion);
        lastSavedVersionRef.current = remoteVersion;

        // Reconcilia registros remotos compartilhados preservando traços locais e histórico
        if (conflictData.currentDocumentState && editorRef.current) {
          try {
            const remoteSnap = JSON.parse(conflictData.currentDocumentState);
            const remoteRecords = remoteSnap.document?.records || remoteSnap.records || [];
            // Filtra exclusivamente registros de conteúdo (exclui câmera, cursor e sessão)
            const sharedRemoteRecords = Array.isArray(remoteRecords)
              ? remoteRecords.filter((r: any) => ['shape', 'asset', 'binding', 'page'].includes(r.typeName))
              : [];

            if (sharedRemoteRecords.length > 0) {
              isApplyingRemoteRef.current = true;
              editorRef.current.store.mergeRemoteChanges(() => {
                editorRef.current?.store.put(sharedRemoteRecords);
              });
              isApplyingRemoteRef.current = false;
            }
          } catch (e) {
            console.warn('[ConflictReconciliation]', e);
          }
        }

        // Imediatamente agenda novo salvamento com o estado combinado
        isSavingRef.current = false;
        hasPendingChangesRef.current = true;
        setTimeout(() => {
          saveToCloud(true);
        }, 200);
        return;
      }

      if (!res.ok) {
        throw new Error('SAVE_FAILED');
      }

      const data = await res.json();
      hasPendingChangesRef.current = false;
      setServerVersion(data.version);
      lastSavedVersionRef.current = data.version;
      lastSavedDocumentStateRef.current = documentState;
      setSyncStatus('synced');
      setLastSyncTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      // Marca o cache offline como sincronizado
      markBoardSynced(resolvedUserId, boardId, data.version).catch(() => {});
    } catch (err) {
      console.error('[WhiteboardSaveError]', err);
      // Mantém a flag de pendência para que nunca haja perda de trabalho
      hasPendingChangesRef.current = true;
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      isSavingRef.current = false;
    }
  }, [boardId, boardTitle, backgroundType, resolvedUserId]);

  // Agendar salvamento debounced (1500ms)
  const scheduleAutosave = useCallback(() => {
    hasPendingChangesRef.current = true;
    setSyncStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveToCloud();
    }, 1500);
  }, [saveToCloud]);

  // Carregar dados do quadro (com hidratação prévia de cache offline)
  const loadBoardData = useCallback(async (targetBoardId: string, editor: Editor) => {
    if (!targetBoardId) return;

    // 1. Hidratação instantânea do IndexedDB local
    try {
      const cached = await loadBoardOffline(resolvedUserId, targetBoardId);
      if (cached && cached.documentState && cached.documentState !== '{}') {
        const parsedCached = JSON.parse(cached.documentState);
        isApplyingRemoteRef.current = true;
        loadSnapshot(editor.store, parsedCached);
        isApplyingRemoteRef.current = false;
        editor.setCurrentTool(selectedToolRef.current || 'draw');
        lastSavedVersionRef.current = cached.version || 1;
        setServerVersion(cached.version || 1);
        if (cached.title) setBoardTitle(cached.title);
        if (cached.backgroundType) setBackgroundType(cached.backgroundType as WhiteboardBackgroundType);

        if (cached.hasPendingSync) {
          hasPendingChangesRef.current = true;
          setSyncStatus('pending');
        } else {
          setSyncStatus('synced');
        }
      }
    } catch (cacheErr) {
      console.warn('[OfflineCacheLoad]', cacheErr);
    }

    // 2. Se online, valida e reconcilia com a nuvem
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }

    try {
      const res = await apiFetch(`/api/whiteboards/${targetBoardId}`);
      if (!res.ok) return;

      const data = await res.json();
      setBoardTitle(data.board?.title || 'Quadro de Resolução');
      setBackgroundType((data.board?.background_type as WhiteboardBackgroundType) || 'pure_black');

      const remoteVer = data.board?.version || 1;

      if (data.document?.document_state && data.document.document_state !== '{}') {
        const parsedRemote = JSON.parse(data.document.document_state);

        if (hasPendingChangesRef.current) {
          // Se havia alterações locais pendentes no IndexedDB, mescla remotas sem sobrescrever
          const remoteRecords = parsedRemote.document?.records || parsedRemote.records || [];
          const sharedRecords = Array.isArray(remoteRecords)
            ? remoteRecords.filter((r: any) => ['shape', 'asset', 'binding', 'page'].includes(r.typeName))
            : [];

          if (sharedRecords.length > 0) {
            isApplyingRemoteRef.current = true;
            editor.store.mergeRemoteChanges(() => {
              editor.store.put(sharedRecords);
            });
            isApplyingRemoteRef.current = false;
          }
          // Sincroniza estado mesclado com a nuvem
          lastSavedVersionRef.current = remoteVer;
          setServerVersion(remoteVer);
          saveToCloud(true);
        } else {
          // Sem edições locais pendentes: hidrata com o estado oficial do servidor
          isApplyingRemoteRef.current = true;
          loadSnapshot(editor.store, parsedRemote);
          isApplyingRemoteRef.current = false;
          editor.setCurrentTool(selectedToolRef.current || 'draw');
          lastSavedVersionRef.current = remoteVer;
          lastSavedDocumentStateRef.current = data.document.document_state;
          setServerVersion(remoteVer);
          setSyncStatus('synced');
          markBoardSynced(resolvedUserId, targetBoardId, remoteVer).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[LoadBoardDataRemote]', err);
    }
  }, [resolvedUserId, saveToCloud]);

  // Configuração inicial e callbacks do tldraw editor
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Configurar preferências visuais de quadro negro
    editor.user.updateUserPreferences({
      colorScheme: 'dark',
      isSnapMode: false,
    });

    // Iniciar ferramenta caneta padrão
    editor.setCurrentTool('draw');
    setSelectedTool(editor.getCurrentToolId());

    // Modo Caneta desativado no início (mouse e desktop interagem livremente)
    editor.updateInstanceState({ isPenMode: false });
    setIsPenMode(false);

    // Carregar estado do banco se disponível
    if (boardId) {
      loadBoardData(boardId, editor);
    }

    // Escutar mudanças do store com persistência imediata no IndexedDB
    const cleanupListen = editor.store.listen((entry) => {
      if (isApplyingRemoteRef.current) return;
      if (entry.source === 'user') {
        scheduleAutosave();

        // Grava no IndexedDB de forma assíncrona imediata
        try {
          const snap = getSnapshot(editor.store);
          saveBoardOffline(resolvedUserId, boardId, {
            title: boardTitle,
            backgroundType,
            version: lastSavedVersionRef.current,
            documentState: JSON.stringify(snap),
            hasPendingSync: true,
          }).catch(() => {});
        } catch (_) {}
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

    // Sincronizar ferramenta ativa se o editor mudar internamente
    const handleEditorEvent = () => {
      const curTool = editor.getCurrentToolId();
      if (curTool && curTool !== selectedToolRef.current) {
        selectedToolRef.current = curTool;
        setSelectedTool(curTool);
      }
    };
    editor.on('event', handleEditorEvent);

    const cleanupInstanceSync = editor.sideEffects.registerAfterChangeHandler('instance', (prev, next) => {
      if (prev.isPenMode !== next.isPenMode) {
        setIsPenMode(next.isPenMode);
      }
    });

    return () => {
      cleanupListen();
      cleanupSelection();
      editor.off('event', handleEditorEvent);
      cleanupInstanceSync();
    };
  }, [boardId, boardTitle, backgroundType, resolvedUserId, loadBoardData, scheduleAutosave]);

  // Verificação ativa de atualizações remotas (Lifecycle: ao retornar de background/foco)
  const checkRemoteVersionAndReconcile = useCallback(async () => {
    if (!editorRef.current || !boardId || !navigator.onLine) return;

    try {
      const res = await apiFetch(`/api/whiteboards/${boardId}`);
      if (!res.ok) return;
      const data = await res.json();
      const remoteVer = data.board?.version || 1;

      // Se o servidor possui uma versão mais nova que a nossa base
      if (remoteVer > lastSavedVersionRef.current && data.document?.document_state) {
        const parsedRemote = JSON.parse(data.document.document_state);
        const remoteRecords = parsedRemote.document?.records || parsedRemote.records || [];
        const sharedRecords = Array.isArray(remoteRecords)
          ? remoteRecords.filter((r: any) => ['shape', 'asset', 'binding', 'page'].includes(r.typeName))
          : [];

        if (sharedRecords.length > 0) {
          isApplyingRemoteRef.current = true;
          editorRef.current.store.mergeRemoteChanges(() => {
            editorRef.current?.store.put(sharedRecords);
          });
          isApplyingRemoteRef.current = false;
        }

        lastSavedVersionRef.current = remoteVer;
        setServerVersion(remoteVer);

        // Se houver mudanças locais pendentes, envia novo salvamento com o estado combinado
        if (hasPendingChangesRef.current) {
          saveToCloud(true);
        } else {
          lastSavedDocumentStateRef.current = data.document.document_state;
          setSyncStatus('synced');
          markBoardSynced(resolvedUserId, boardId, remoteVer).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[CheckRemoteVersion]', e);
    }
  }, [boardId, resolvedUserId, saveToCloud]);

  // Listeners de Ciclo de Vida: Backgrounding móvel, aba oculta, foco e reconexão
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // App foi para background/minimizado: salva alterações pendentes
        if (hasPendingChangesRef.current) {
          saveToCloud(true);
        }
      } else if (document.visibilityState === 'visible') {
        // Retornou ao foreground: busca atualizações feitas em outro dispositivo
        checkRemoteVersionAndReconcile();
      }
    };

    const handleWindowFocus = () => {
      checkRemoteVersionAndReconcile();
    };

    const handleOnline = () => {
      if (hasPendingChangesRef.current) {
        saveToCloud(true);
      } else {
        checkRemoteVersionAndReconcile();
      }
    };

    const handleOffline = () => {
      setSyncStatus('offline');
    };

    const handleBeforeUnload = () => {
      if (editorRef.current && boardId && hasPendingChangesRef.current) {
        try {
          const snapshot = getSnapshot(editorRef.current.store);
          saveBoardOffline(resolvedUserId, boardId, {
            title: boardTitle,
            backgroundType,
            version: lastSavedVersionRef.current,
            documentState: JSON.stringify(snapshot),
            hasPendingSync: true,
          }).catch(() => {});
        } catch (_) {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [boardId, boardTitle, backgroundType, resolvedUserId, saveToCloud, checkRemoteVersionAndReconcile]);

  // Escutar eventos Pointer Events para auto-detectar Stylus e Mesas Digitalizadoras de forma passiva
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const editor = editorRef.current;
      const isStylus = isGenericStylusEvent(e);

      if (isStylus && editor) {
        // Ativar Pen Mode nativo dinamicamente apenas quando caneta real é detectada
        // Isso ativa rejeição de palma sem trocar a ferramenta ativa!
        if (!editor.getInstanceState()?.isPenMode) {
          editor.updateInstanceState({ isPenMode: true });
          setIsPenMode(true);
        }
      }

      // Telemetria em tempo real para Huawei M-Pencil, Mesas Digitalizadoras ou Toque
      if (isStylusDebugActive) {
        const curEditor = editorRef.current;
        setStylusDiag({
          eventType: e.type,
          pointerType: e.pointerType,
          pointerId: e.pointerId,
          pressure: Number(e.pressure.toFixed(3)),
          buttons: e.buttons,
          button: e.button,
          tiltX: e.tiltX ?? 0,
          tiltY: e.tiltY ?? 0,
          width: e.width ?? 0,
          height: e.height ?? 0,
          timestamp: Date.now(),
          isPen: curEditor?.inputs?.getIsPen?.() ?? (e.pointerType === 'pen'),
          currentToolId: curEditor?.getCurrentToolId() ?? 'draw',
          rootPath: (curEditor as any)?.root?.getPath?.() || (curEditor as any)?.getPath?.() || '',
          isPenMode: curEditor?.getInstanceState()?.isPenMode ?? false,
        });
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isStylusDebugActive) return;
      const curEditor = editorRef.current;
      setStylusDiag({
        eventType: e.type,
        pointerType: e.pointerType,
        pointerId: e.pointerId,
        pressure: Number(e.pressure.toFixed(3)),
        buttons: e.buttons,
        button: e.button,
        tiltX: e.tiltX ?? 0,
        tiltY: e.tiltY ?? 0,
        width: e.width ?? 0,
        height: e.height ?? 0,
        timestamp: Date.now(),
        isPen: curEditor?.inputs?.getIsPen?.() ?? (e.pointerType === 'pen'),
        currentToolId: curEditor?.getCurrentToolId() ?? 'draw',
        rootPath: (curEditor as any)?.root?.getPath?.() || (curEditor as any)?.getPath?.() || '',
        isPenMode: curEditor?.getInstanceState()?.isPenMode ?? isPenMode,
      });
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    if (isStylusDebugActive) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerup', handlePointerMove, { passive: true });
    }

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      if (isStylusDebugActive) {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerMove);
      }
    };
  }, [isPenMode, isStylusDebugActive]);

  // Listener global de colagem de imagem (Ctrl+V)
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
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
                if (!editorRef.current) continue;

                // Buscar estado atualizado
                const fetchRes = await apiFetch(`/api/whiteboards/${boardId}`);
                if (!fetchRes.ok) continue;
                const freshData = await fetchRes.json();

                if (freshData.document?.document_state) {
                  const remoteSnapshot = JSON.parse(freshData.document.document_state);
                  const remoteRecords = remoteSnapshot.document?.records || remoteSnapshot.records || [];
                  // Filtra apenas registros compartilhados do documento (exclui câmera e sessão)
                  const sharedRemoteRecords = Array.isArray(remoteRecords)
                    ? remoteRecords.filter((r: any) => ['shape', 'asset', 'binding', 'page'].includes(r.typeName))
                    : [];

                  if (sharedRemoteRecords.length > 0) {
                    isApplyingRemoteRef.current = true;
                    editorRef.current.store.mergeRemoteChanges(() => {
                      editorRef.current?.store.put(sharedRemoteRecords);
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

  // Componentes customizados do tldraw: Fundo dinâmico e supressão de menus redundantes padrão
  const customComponents: TLComponents = React.useMemo(() => {
    return {
      Background: () => <WhiteboardBackground backgroundType={backgroundType} />,
      Toolbar: null,
      NavigationPanel: null,
      PageMenu: null,
      MainMenu: null,
      StylePanel: null,
    };
  }, [backgroundType]);

  // Ações da Toolbar
  const handleSelectTool = (toolId: string) => {
    if (!editorRef.current) return;
    editorRef.current.setCurrentTool(toolId);
    setSelectedTool(editorRef.current.getCurrentToolId());
  };

  const handleSetColor = (colorName: string) => {
    setActivePenColor(colorName);
    if (!editorRef.current) return;
    const curTool = editorRef.current.getCurrentToolId();
    if (curTool !== 'draw' && curTool !== 'highlight') {
      editorRef.current.setCurrentTool('draw');
      setSelectedTool('draw');
    }
    editorRef.current.setStyleForNextShapes(DefaultColorStyle, colorName as any);
  };

  const handleTogglePenMode = () => {
    if (!editorRef.current) return;
    const nextMode = !isPenMode;
    editorRef.current.updateInstanceState({ isPenMode: nextMode });
    setIsPenMode(nextMode);
    showToast?.(nextMode ? '🖊️ Modo Caneta Ativado (Toque de dedos apenas navega e dá zoom)' : 'Modo Livre Ativado (Mouse/Toque podem desenhar)', 'info');
  };

  const handleZoomIn = () => {
    if (!editorRef.current) return;
    editorRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (!editorRef.current) return;
    editorRef.current.zoomOut();
  };

  const handleResetZoom = () => {
    if (!editorRef.current) return;
    editorRef.current.resetZoom();
  };

  const handleChangeBackground = useCallback(async (val: WhiteboardBackgroundType) => {
    setBackgroundType(val);
    if (!boardId) return;

    if (editorRef.current) {
      try {
        const snapshot = getSnapshot(editorRef.current.store);
        await saveBoardOffline(resolvedUserId, boardId, {
          title: boardTitle,
          backgroundType: val,
          version: lastSavedVersionRef.current,
          documentState: JSON.stringify(snapshot),
          hasPendingSync: true,
        });
      } catch (_) {}
    }

    try {
      await apiFetch(`/api/whiteboards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundType: val }),
      });
    } catch (err) {
      console.warn('[BackgroundSaveError]', err);
    }
  }, [boardId, boardTitle, resolvedUserId]);

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

          {/* Seletor de Tipo de Fundo (Responsivo para Desktop e Tablet) */}
          <select
            value={backgroundType}
            onChange={(e) => {
              const val = e.target.value as WhiteboardBackgroundType;
              handleChangeBackground(val);
            }}
            className="px-2 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-amber-400 cursor-pointer max-w-[110px] sm:max-w-none truncate"
            title="Escolha o Fundo do Quadro / Caderno"
          >
            {BACKGROUND_OPTIONS.map((bg) => (
              <option key={bg.type} value={bg.type}>
                {bg.label}
              </option>
            ))}
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
            {syncStatus === 'pending' && (
              <>
                <Cloud className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden lg:inline text-amber-300">Pendente</span>
              </>
            )}
            {syncStatus === 'offline' && (
              <>
                <CloudOff className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden lg:inline text-slate-300">Offline</span>
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
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                <span className="hidden lg:inline text-cyan-300">Reconciliando...</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Canvas Infinito do Tldraw */}
      <div className="relative flex-1 w-full h-full overflow-hidden bg-black">
        {boardId && (
          <Tldraw
            persistenceKey={`cfo_whiteboard_${resolvedUserId}_${boardId}`}
            components={customComponents}
            onMount={handleMount}
            autoFocus
          />
        )}

        {/* Painel de Diagnóstico em Tempo Real para Huawei M-Pencil / Stylus / Graphics Tablet */}
        {isStylusDebugActive && (
          <div className="absolute top-3 right-3 z-40 bg-[#0d0e12]/95 border border-slate-700/80 rounded-xl p-3 text-[11px] font-mono text-emerald-400 backdrop-blur-md shadow-2xl pointer-events-none select-none w-80 max-w-[calc(100vw-1.5rem)]">
            <div className="flex items-center justify-between text-amber-400 font-bold mb-1.5 border-b border-slate-800 pb-1">
              <span>🖊️ Telemetria Stylus / Graphics Tablet</span>
              <span className="text-[10px] text-slate-400 font-normal">W3C API</span>
            </div>
            {stylusDiag ? (
              <div className="space-y-1 text-slate-300">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">pointerType:</span>
                  <span className={`px-1.5 py-0.5 rounded font-bold ${
                    stylusDiag.pointerType === 'pen' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-slate-800 text-amber-300'
                  }`}>
                    {stylusDiag.pointerType}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">pressure:</span>
                  <span className="text-amber-300 font-bold">{stylusDiag.pressure.toFixed(3)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">buttons / button:</span>
                  <span className="text-white">{stylusDiag.buttons} / {stylusDiag.button}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">tiltX / tiltY:</span>
                  <span className="text-white">X={stylusDiag.tiltX}° | Y={stylusDiag.tiltY}°</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">inputs.getIsPen():</span>
                  <span className={stylusDiag.isPen ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    {String(stylusDiag.isPen)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">getCurrentToolId():</span>
                  <span className={stylusDiag.currentToolId === 'draw' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {stylusDiag.currentToolId}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">root.getPath():</span>
                  <span className="text-cyan-300 font-mono text-[10px] truncate max-w-[170px]" title={stylusDiag.rootPath}>
                    {stylusDiag.rootPath}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">isPenMode:</span>
                  <span className={stylusDiag.isPenMode ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {String(stylusDiag.isPenMode)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 pt-1.5 border-t border-slate-800/80 flex justify-between">
                  <span>ID: {stylusDiag.pointerId}</span>
                  <span>{stylusDiag.eventType}</span>
                  <span>{stylusDiag.width}x{stylusDiag.height}px</span>
                </div>
                {stylusDiag.pointerType === 'pen' && (
                  <div className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 rounded px-1.5 py-0.5 mt-1 text-center font-sans">
                    Caneta Detectada • Traço Ativo • Rejeição de Palma
                  </div>
                )}
                {stylusDiag.pointerType === 'touch' && (
                  <div className="text-[10px] text-cyan-400 bg-cyan-950/40 border border-cyan-900/50 rounded px-1.5 py-0.5 mt-1 text-center font-sans">
                    Toque de Dedo Detectado • Pan/Zoom (Sem Desenho)
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-400 italic text-[10px]">
                Toque a Huawei M-Pencil ou caneta da mesa digitalizadora na tela para inspecionar telemetria...
              </div>
            )}
          </div>
        )}

        {/* Barra de Ferramentas Flutuante Tática (Quadro Negro) */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 bottom-5 z-50 flex items-center gap-1 p-1.5 rounded-2xl border border-slate-800 bg-[#121216]/95 backdrop-blur-xl shadow-2xl transition-all duration-200 ${
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

          {/* Seletor Rápido de Fundo do Quadro */}
          <div className="relative">
            <button
              onClick={() => setIsBgPickerOpen((prev) => !prev)}
              title="Estilos de Fundo e Caderno"
              className={`p-2 rounded-xl transition-all ${
                isBgPickerOpen ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Palette className="w-4 h-4" />
            </button>
            {isBgPickerOpen && (
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-[#121216] border border-slate-700 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 min-w-[160px] z-50">
                <div className="text-[10px] font-semibold text-slate-400 px-2 py-0.5 uppercase tracking-wider">Fundo do Quadro</div>
                {BACKGROUND_OPTIONS.map((bg) => (
                  <button
                    key={bg.type}
                    onClick={() => {
                      handleChangeBackground(bg.type);
                      setIsBgPickerOpen(false);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      backgroundType === bg.type
                        ? 'bg-amber-500 text-black font-semibold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0"
                      style={{ backgroundColor: bg.preview }}
                    />
                    <span className="truncate">{bg.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-6 bg-slate-800 mx-1" />

          {/* Controles Oficiais de Zoom */}
          <button
            onClick={handleZoomIn}
            title="Aumentar Zoom (+)"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Diminuir Zoom (-)"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            title="Ajustar / Redefinir Zoom (100%)"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

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
