/**
 * Armazenamento offline resiliente e isolado por usuário para o Whiteboard.
 * Utiliza IndexedDB nativo com chave composta ${userId}::${boardId} para
 * garantir isolamento estrito entre usuários no mesmo navegador (zero data leak).
 */

export interface OfflineBoardRecord {
  id: string; // `${userId}::${boardId}`
  userId: string;
  boardId: string;
  title: string;
  backgroundType: string;
  version: number;
  documentState: string;
  updatedAt: string;
  hasPendingSync: boolean;
}

const DB_NAME = 'cfo_whiteboard_offline_v1';
const DB_VERSION = 1;
const STORE_NAME = 'boards';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('INDEXEDDB_UNAVAILABLE'));
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('hasPendingSync', 'hasPendingSync', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('FAILED_TO_OPEN_INDEXEDDB'));
  });
}

/**
 * Salva ou atualiza um quadro no cache offline do IndexedDB.
 */
export async function saveBoardOffline(
  userId: string,
  boardId: string,
  data: {
    title?: string;
    backgroundType?: string;
    version?: number;
    documentState?: string;
    hasPendingSync?: boolean;
  }
): Promise<void> {
  if (!userId || !boardId) return;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const compositeId = `${userId}::${boardId}`;

      const getReq = store.get(compositeId);
      getReq.onsuccess = () => {
        const existing: OfflineBoardRecord = getReq.result || {
          id: compositeId,
          userId,
          boardId,
          title: 'Quadro de Resolução',
          backgroundType: 'pure_black',
          version: 1,
          documentState: '{}',
          updatedAt: new Date().toISOString(),
          hasPendingSync: false,
        };

        const updated: OfflineBoardRecord = {
          ...existing,
          title: data.title !== undefined ? data.title : existing.title,
          backgroundType: data.backgroundType !== undefined ? data.backgroundType : existing.backgroundType,
          version: data.version !== undefined ? data.version : existing.version,
          documentState: data.documentState !== undefined ? data.documentState : existing.documentState,
          hasPendingSync: data.hasPendingSync !== undefined ? data.hasPendingSync : existing.hasPendingSync,
          updatedAt: new Date().toISOString(),
        };

        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('[OfflineCache] Falha ao gravar no IndexedDB:', err);
  }
}

/**
 * Recupera o quadro salvo offline para o usuário autenticado.
 */
export async function loadBoardOffline(
  userId: string,
  boardId: string
): Promise<OfflineBoardRecord | null> {
  if (!userId || !boardId) return null;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const compositeId = `${userId}::${boardId}`;

      const req = store.get(compositeId);
      req.onsuccess = () => {
        const result: OfflineBoardRecord | undefined = req.result;
        // Validação estrita de isolamento: nunca retornar dados de outro usuário
        if (result && result.userId === userId) {
          resolve(result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineCache] Falha ao ler do IndexedDB:', err);
    return null;
  }
}

/**
 * Marca um quadro como sincronizado na nuvem (limpa flag de pendência).
 */
export async function markBoardSynced(
  userId: string,
  boardId: string,
  newVersion: number
): Promise<void> {
  if (!userId || !boardId) return;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const compositeId = `${userId}::${boardId}`;

      const getReq = store.get(compositeId);
      getReq.onsuccess = () => {
        if (!getReq.result) return resolve();
        const record: OfflineBoardRecord = getReq.result;
        record.hasPendingSync = false;
        record.version = newVersion;
        record.updatedAt = new Date().toISOString();

        const putReq = store.put(record);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('[OfflineCache] Falha ao marcar sincronizado:', err);
  }
}

/**
 * Remove todo o cache local de um usuário específico (chamado no Logout).
 * Garante que um segundo usuário na mesma máquina não acesse o cache anterior.
 */
export async function clearUserOfflineCache(userId: string): Promise<void> {
  if (!userId) return;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('userId');
      const req = index.openCursor(IDBKeyRange.only(userId));

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineCache] Falha ao limpar cache de usuário:', err);
  }
}
