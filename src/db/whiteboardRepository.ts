import type { DatabaseSync } from 'node:sqlite';
import type { PostgresSyncDatabase } from './postgresSync';
import { getDb } from './database';

export interface DbWhiteboard {
  id: string;
  user_id: string;
  title: string;
  background_type: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DbWhiteboardDocument {
  whiteboard_id: string;
  user_id: string;
  document_state: string;
  version: number;
  updated_at: string;
}

export interface DbWhiteboardAsset {
  id: string;
  whiteboard_id: string;
  user_id: string;
  filename: string;
  storage_key: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface SaveDocumentResult {
  success: boolean;
  conflict?: boolean;
  version: number;
  updatedAt: string;
  currentDocumentState?: string;
}

export class WhiteboardRepository {
  private db: DatabaseSync | PostgresSyncDatabase;

  constructor(customDb?: DatabaseSync | PostgresSyncDatabase) {
    this.db = customDb || getDb().getRawDb();
  }

  public listWhiteboards(userId: string): DbWhiteboard[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, title, background_type, version, created_at, updated_at
      FROM whiteboards
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `);
    return stmt.all(userId) as unknown as DbWhiteboard[];
  }

  public getWhiteboard(userId: string, boardId: string): {
    board: DbWhiteboard;
    document: DbWhiteboardDocument | null;
    assets: DbWhiteboardAsset[];
  } | null {
    const boardStmt = this.db.prepare(`
      SELECT id, user_id, title, background_type, version, created_at, updated_at
      FROM whiteboards
      WHERE id = ? AND user_id = ?
    `);
    const board = boardStmt.get(boardId, userId) as unknown as DbWhiteboard | undefined;
    if (!board) return null;

    const docStmt = this.db.prepare(`
      SELECT whiteboard_id, user_id, document_state, version, updated_at
      FROM whiteboard_documents
      WHERE whiteboard_id = ? AND user_id = ?
    `);
    const doc = docStmt.get(boardId, userId) as unknown as DbWhiteboardDocument | undefined;

    const assetsStmt = this.db.prepare(`
      SELECT id, whiteboard_id, user_id, filename, storage_key, mime_type, file_size, width, height, created_at
      FROM whiteboard_assets
      WHERE whiteboard_id = ? AND user_id = ?
      ORDER BY created_at ASC
    `);
    const assets = assetsStmt.all(boardId, userId) as unknown as DbWhiteboardAsset[];

    return {
      board,
      document: doc || null,
      assets,
    };
  }

  public createWhiteboard(
    userId: string,
    id: string,
    title: string,
    backgroundType = 'pure_black',
    initialDocumentState = '{}'
  ): DbWhiteboard {
    const now = new Date().toISOString();
    const cleanTitle = (title || 'Novo Quadro').trim().slice(0, 100);

    const insertBoard = this.db.prepare(`
      INSERT INTO whiteboards (id, user_id, title, background_type, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);
    insertBoard.run(id, userId, cleanTitle, backgroundType, now, now);

    const insertDoc = this.db.prepare(`
      INSERT INTO whiteboard_documents (whiteboard_id, user_id, document_state, version, updated_at)
      VALUES (?, ?, ?, 1, ?)
    `);
    insertDoc.run(id, userId, initialDocumentState, now);

    return {
      id,
      user_id: userId,
      title: cleanTitle,
      background_type: backgroundType,
      version: 1,
      created_at: now,
      updated_at: now,
    };
  }

  public updateWhiteboard(
    userId: string,
    boardId: string,
    updates: { title?: string; backgroundType?: string }
  ): DbWhiteboard | null {
    const existing = this.getWhiteboard(userId, boardId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const newTitle = updates.title !== undefined ? updates.title.trim().slice(0, 100) : existing.board.title;
    const newBg = updates.backgroundType !== undefined ? updates.backgroundType : existing.board.background_type;

    const stmt = this.db.prepare(`
      UPDATE whiteboards
      SET title = ?, background_type = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    stmt.run(newTitle, newBg, now, boardId, userId);

    return {
      ...existing.board,
      title: newTitle,
      background_type: newBg,
      updated_at: now,
    };
  }

  public saveDocument(
    userId: string,
    boardId: string,
    documentState: string,
    clientVersion?: number
  ): SaveDocumentResult {
    const existing = this.getWhiteboard(userId, boardId);
    if (!existing) {
      throw new Error('WHITEBOARD_NOT_FOUND');
    }

    const currentDoc = existing.document;
    const currentVersion = currentDoc ? currentDoc.version : existing.board.version;

    // Conflito: versão enviada é anterior à versão mais recente do banco
    if (clientVersion !== undefined && clientVersion < currentVersion) {
      return {
        success: false,
        conflict: true,
        version: currentVersion,
        updatedAt: currentDoc?.updated_at || existing.board.updated_at,
        currentDocumentState: currentDoc?.document_state,
      };
    }

    const nextVersion = currentVersion + 1;
    const now = new Date().toISOString();

    if (currentDoc) {
      const updateDoc = this.db.prepare(`
        UPDATE whiteboard_documents
        SET document_state = ?, version = ?, updated_at = ?
        WHERE whiteboard_id = ? AND user_id = ?
      `);
      updateDoc.run(documentState, nextVersion, now, boardId, userId);
    } else {
      const insertDoc = this.db.prepare(`
        INSERT INTO whiteboard_documents (whiteboard_id, user_id, document_state, version, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertDoc.run(boardId, userId, documentState, nextVersion, now);
    }

    const updateBoard = this.db.prepare(`
      UPDATE whiteboards
      SET version = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    updateBoard.run(nextVersion, now, boardId, userId);

    return {
      success: true,
      conflict: false,
      version: nextVersion,
      updatedAt: now,
    };
  }

  public deleteWhiteboard(userId: string, boardId: string): { success: boolean; assetStorageKeys: string[] } {
    const existing = this.getWhiteboard(userId, boardId);
    if (!existing) return { success: false, assetStorageKeys: [] };

    const potentialKeys = existing.assets.map((a) => a.storage_key);

    const del = this.db.prepare(`DELETE FROM whiteboards WHERE id = ? AND user_id = ?`);
    del.run(boardId, userId);

    // Retorna apenas chaves de assets que não possuem mais nenhuma referência
    const safeToDeleteKeys: string[] = [];
    for (const key of potentialKeys) {
      const refCheck = this.db.prepare(`SELECT COUNT(*) as count FROM whiteboard_assets WHERE storage_key = ?`).get(key) as any;
      const count = Number(refCheck?.count ?? refCheck?.['count(*)'] ?? 0);
      if (count === 0) {
        safeToDeleteKeys.push(key);
      }
    }

    return { success: true, assetStorageKeys: safeToDeleteKeys };
  }

  public cleanupUnreferencedAssets(userId: string, boardId: string, activeStorageKeys: string[]): string[] {
    const existing = this.getWhiteboard(userId, boardId);
    if (!existing) return [];

    const deletedKeys: string[] = [];
    const activeSet = new Set(activeStorageKeys);

    for (const asset of existing.assets) {
      if (!activeSet.has(asset.storage_key)) {
        // Deleta o registro órfão deste quadro
        const delAsset = this.db.prepare(`DELETE FROM whiteboard_assets WHERE id = ? AND user_id = ?`);
        delAsset.run(asset.id, userId);

        // Se nenhuma outra linha referenciar a mesma chave, agenda exclusão no R2
        const refCheck = this.db.prepare(`SELECT COUNT(*) as count FROM whiteboard_assets WHERE storage_key = ?`).get(asset.storage_key) as any;
        const count = Number(refCheck?.count ?? refCheck?.['count(*)'] ?? 0);
        if (count === 0) {
          deletedKeys.push(asset.storage_key);
        }
      }
    }

    return deletedKeys;
  }

  public createAsset(asset: {
    id: string;
    whiteboardId: string;
    userId: string;
    filename: string;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    width?: number | null;
    height?: number | null;
  }): DbWhiteboardAsset {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO whiteboard_assets (
        id, whiteboard_id, user_id, filename, storage_key, mime_type, file_size, width, height, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      asset.id,
      asset.whiteboardId,
      asset.userId,
      asset.filename,
      asset.storageKey,
      asset.mimeType,
      asset.fileSize,
      asset.width ?? null,
      asset.height ?? null,
      now
    );

    return {
      id: asset.id,
      whiteboard_id: asset.whiteboardId,
      user_id: asset.userId,
      filename: asset.filename,
      storage_key: asset.storageKey,
      mime_type: asset.mimeType,
      file_size: asset.fileSize,
      width: asset.width ?? null,
      height: asset.height ?? null,
      created_at: now,
    };
  }

  public getAsset(userId: string, assetId: string): DbWhiteboardAsset | null {
    const stmt = this.db.prepare(`
      SELECT id, whiteboard_id, user_id, filename, storage_key, mime_type, file_size, width, height, created_at
      FROM whiteboard_assets
      WHERE id = ? AND user_id = ?
    `);
    const asset = stmt.get(assetId, userId) as unknown as DbWhiteboardAsset | undefined;
    return asset || null;
  }

  public deleteAsset(userId: string, assetId: string): DbWhiteboardAsset | null {
    const asset = this.getAsset(userId, assetId);
    if (!asset) return null;

    const stmt = this.db.prepare(`
      DELETE FROM whiteboard_assets
      WHERE id = ? AND user_id = ?
    `);
    stmt.run(assetId, userId);
    return asset;
  }
}
