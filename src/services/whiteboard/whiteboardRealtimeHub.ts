import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type { Response } from 'express';

export interface WhiteboardRealtimeClient {
  id: string;
  userId: string;
  boardId: string;
  deviceId?: string;
  res: Response;
  connectedAt: string;
}

export interface WhiteboardVersionEvent {
  type: 'VERSION_UPDATE' | 'ASSET_ADDED';
  boardId: string;
  version: number;
  updatedAt: string;
  senderDeviceId?: string;
  assetId?: string;
}

export class WhiteboardRealtimeHub extends EventEmitter {
  private static instance: WhiteboardRealtimeHub | null = null;
  private clients = new Map<string, WhiteboardRealtimeClient>();
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(200);
    this.startKeepAlive();
  }

  public static getInstance(): WhiteboardRealtimeHub {
    if (!WhiteboardRealtimeHub.instance) {
      WhiteboardRealtimeHub.instance = new WhiteboardRealtimeHub();
    }
    return WhiteboardRealtimeHub.instance;
  }

  private startKeepAlive(): void {
    if (this.keepAliveInterval) return;
    this.keepAliveInterval = setInterval(() => {
      this.broadcastRaw(': keepalive\n\n');
    }, 20000);
    if (this.keepAliveInterval.unref) {
      this.keepAliveInterval.unref();
    }
  }

  public registerClient(client: {
    userId: string;
    boardId: string;
    deviceId?: string;
    res: Response;
  }): string {
    const id = crypto.randomUUID();
    const realtimeClient: WhiteboardRealtimeClient = {
      id,
      userId: client.userId,
      boardId: client.boardId,
      deviceId: client.deviceId,
      res: client.res,
      connectedAt: new Date().toISOString(),
    };

    this.clients.set(id, realtimeClient);

    // Enviar confirmação inicial de conexão
    client.res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId: id, boardId: client.boardId })}\n\n`);

    client.res.on('close', () => {
      this.clients.delete(id);
    });

    return id;
  }

  public unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  public broadcastToBoard(boardId: string, event: WhiteboardVersionEvent): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients.values()) {
      if (client.boardId === boardId) {
        // Não ecoar de volta para o dispositivo que acabou de enviar (se deviceId foi informado)
        if (event.senderDeviceId && client.deviceId && client.deviceId === event.senderDeviceId) {
          continue;
        }
        try {
          client.res.write(payload);
        } catch {
          this.clients.delete(client.id);
        }
      }
    }
  }

  public broadcastRaw(rawMessage: string): void {
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.write(rawMessage);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  public destroy(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {}
    }
    this.clients.clear();
  }
}

export const whiteboardRealtimeHub = WhiteboardRealtimeHub.getInstance();
