import crypto from 'node:crypto';
import path from 'node:path';
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { WhiteboardRepository } from '../db/whiteboardRepository';
import {
  validateWhiteboardImageBuffer,
  putWhiteboardMedia,
  getWhiteboardMedia,
  deleteWhiteboardMedia,
} from '../services/whiteboard/whiteboardStorage';
import { whiteboardRealtimeHub } from '../services/whiteboard/whiteboardRealtimeHub';
import { getDb } from '../db/database';

export function createWhiteboardRouter(
  requireAuthMiddleware: any,
  repoFactory?: () => WhiteboardRepository
): Router {
  const router = Router();
  const getRepo = repoFactory || (() => new WhiteboardRepository(getDb().getRawDb()));

  const whiteboardLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600, // 600 requests per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Muitas requisições no quadro branco. Aguarde alguns instantes.',
      });
    },
  });

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120, // 120 uploads per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Muitos uploads de imagem em pouco tempo.',
      });
    },
  });

  // 1. Listar quadros do usuário
  router.get('/whiteboards', requireAuthMiddleware, whiteboardLimiter, (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const repo = getRepo();
      const boards = repo.listWhiteboards(userId);
      res.json({ boards });
    } catch (err: any) {
      res.status(500).json({ error: 'FAILED_TO_LIST_WHITEBOARDS', message: err.message });
    }
  });

  // 2. Criar novo quadro
  router.post('/whiteboards', requireAuthMiddleware, whiteboardLimiter, (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const { title, backgroundType } = req.body || {};
      const id = crypto.randomUUID();
      const repo = getRepo();

      const board = repo.createWhiteboard(userId, id, title || 'Novo Quadro', backgroundType || 'pure_black');
      res.status(201).json({ board });
    } catch (err: any) {
      res.status(500).json({ error: 'FAILED_TO_CREATE_WHITEBOARD', message: err.message });
    }
  });

  // 3. Obter dados e estado do quadro
  router.get('/whiteboards/:id', requireAuthMiddleware, whiteboardLimiter, (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const { id } = req.params;
      const repo = getRepo();
      const result = repo.getWhiteboard(userId, id);
      if (!result) {
        return res.status(404).json({ error: 'WHITEBOARD_NOT_FOUND' });
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'FAILED_TO_GET_WHITEBOARD', message: err.message });
    }
  });

  // 4. Atualizar título ou fundo do quadro
  router.patch('/whiteboards/:id', requireAuthMiddleware, whiteboardLimiter, (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const { id } = req.params;
      const { title, backgroundType } = req.body || {};
      const repo = getRepo();

      const updated = repo.updateWhiteboard(userId, id, { title, backgroundType });
      if (!updated) {
        return res.status(404).json({ error: 'WHITEBOARD_NOT_FOUND' });
      }

      res.json({ board: updated });
    } catch (err: any) {
      res.status(500).json({ error: 'FAILED_TO_UPDATE_WHITEBOARD', message: err.message });
    }
  });

  // 5. Excluir quadro
  router.delete('/whiteboards/:id', requireAuthMiddleware, whiteboardLimiter, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const { id } = req.params;
      const repo = getRepo();
      const { success, assetStorageKeys } = repo.deleteWhiteboard(userId, id);
      if (!success) {
        return res.status(404).json({ error: 'WHITEBOARD_NOT_FOUND' });
      }

      // Limpeza assíncrona das imagens no Cloudflare R2
      for (const key of assetStorageKeys) {
        deleteWhiteboardMedia(key).catch((err) => {
          console.warn(`[WhiteboardStorage] Falha ao deletar asset ${key}:`, err);
        });
      }

      res.json({ success: true, message: 'WHITEBOARD_DELETED' });
    } catch (err: any) {
      res.status(500).json({ error: 'FAILED_TO_DELETE_WHITEBOARD', message: err.message });
    }
  });

  // 6. Salvar documento com proteção contra conflitos (versão monotônica)
  router.post('/whiteboards/:id/save', requireAuthMiddleware, whiteboardLimiter, (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const { id } = req.params;
      const { documentState, clientVersion, deviceId } = req.body || {};

      if (!documentState) {
        return res.status(400).json({ error: 'DOCUMENT_STATE_REQUIRED' });
      }

      const stringifiedState = typeof documentState === 'string' ? documentState : JSON.stringify(documentState);
      const repo = getRepo();

      const saveResult = repo.saveDocument(userId, id, stringifiedState, clientVersion);

      if (saveResult.conflict) {
        return res.status(409).json({
          error: 'VERSION_CONFLICT',
          message: 'O quadro foi atualizado em outro dispositivo. Reconciliação necessária.',
          serverVersion: saveResult.version,
          updatedAt: saveResult.updatedAt,
          currentDocumentState: saveResult.currentDocumentState,
        });
      }

      // Disparar broadcast em tempo real para os demais dispositivos
      whiteboardRealtimeHub.broadcastToBoard(id, {
        type: 'VERSION_UPDATE',
        boardId: id,
        version: saveResult.version,
        updatedAt: saveResult.updatedAt,
        senderDeviceId: deviceId,
      });

      res.json({
        success: true,
        version: saveResult.version,
        updatedAt: saveResult.updatedAt,
      });
    } catch (err: any) {
      if (err.message === 'WHITEBOARD_NOT_FOUND') {
        return res.status(404).json({ error: 'WHITEBOARD_NOT_FOUND' });
      }
      res.status(500).json({ error: 'FAILED_TO_SAVE_DOCUMENT', message: err.message });
    }
  });

  // 7. Upload de Imagem / Screenshot de Questão
  router.post('/whiteboards/:id/assets', requireAuthMiddleware, uploadLimiter, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const { id: boardId } = req.params;
      const repo = getRepo();
      const existing = repo.getWhiteboard(userId, boardId);
      if (!existing) {
        return res.status(404).json({ error: 'WHITEBOARD_NOT_FOUND' });
      }

      const { base64, filename, width, height, deviceId } = req.body || {};
      if (!base64 || typeof base64 !== 'string') {
        return res.status(400).json({ error: 'BASE64_IMAGE_REQUIRED' });
      }

      // Remover prefixo data:image/...;base64, se presente
      const cleanBase64 = base64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
      const rawBuffer = Buffer.from(cleanBase64, 'base64');

      const validated = validateWhiteboardImageBuffer(rawBuffer);
      const assetId = crypto.randomUUID();
      const safeFilename = (filename || `question_${Date.now()}.${validated.extension}`)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 100);

      // Chave estruturada e durável de objeto no S3 / Cloudflare R2
      const storageKey = `whiteboard-assets/${userId}/${boardId}/${assetId}.${validated.extension}`;

      await putWhiteboardMedia(storageKey, validated.buffer, validated.mimeType);

      const dbAsset = repo.createAsset({
        id: assetId,
        whiteboardId: boardId,
        userId,
        filename: safeFilename,
        storageKey,
        mimeType: validated.mimeType,
        fileSize: validated.size,
        width: typeof width === 'number' ? width : null,
        height: typeof height === 'number' ? height : null,
      });

      const servingUrl = `/api/whiteboard/assets/${assetId}`;

      // Notificar outros dispositivos abertos
      whiteboardRealtimeHub.broadcastToBoard(boardId, {
        type: 'ASSET_ADDED',
        boardId,
        version: existing.board.version,
        updatedAt: new Date().toISOString(),
        senderDeviceId: deviceId,
        assetId,
      });

      res.status(201).json({
        asset: {
          ...dbAsset,
          url: servingUrl,
        },
      });
    } catch (err: any) {
      console.error('[WhiteboardAssetUpload]', err);
      res.status(500).json({ error: 'FAILED_TO_UPLOAD_ASSET', message: err.message });
    }
  });

  // 8. Servir arquivo de mídia autenticado (Zero IDOR, Multi-tenant)
  router.get('/whiteboard/assets/:assetId', requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const { assetId } = req.params;
      const repo = getRepo();
      const asset = repo.getAsset(userId, assetId);

      if (!asset) {
        return res.status(404).json({ error: 'ASSET_NOT_FOUND' });
      }

      const media = await getWhiteboardMedia(asset.storage_key);
      if (!media) {
        return res.status(404).json({ error: 'MEDIA_FILE_NOT_FOUND' });
      }

      res.setHeader('Content-Type', asset.mime_type || media.contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
      res.send(media.buffer);
    } catch (err: any) {
      res.status(500).json({ error: 'FAILED_TO_SERVE_ASSET', message: err.message });
    }
  });

  // 9. Stream de eventos em tempo real SSE
  router.get('/whiteboards/:id/events', requireAuthMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const { id: boardId } = req.params;
    const deviceId = req.query.deviceId as string | undefined;

    const repo = getRepo();
    const existing = repo.getWhiteboard(userId, boardId);
    if (!existing) {
      return res.status(404).json({ error: 'WHITEBOARD_NOT_FOUND' });
    }

    // Configurar cabeçalhos SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    whiteboardRealtimeHub.registerClient({
      userId,
      boardId,
      deviceId,
      res,
    });
  });

  return router;
}
