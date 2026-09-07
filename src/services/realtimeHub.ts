/**
 * CFO CBMERJ - Admin Realtime Hub (Server-Sent Events)
 * 
 * Gerenciador centralizado de streaming realtime de eventos de segurança e
 * gestão administrativa para dashboards conectados com baixa latência.
 */

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type { Response } from 'express';

export type AdminRealtimeEventType =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'LOGIN_FAILED'
  | 'ADMIN_LOGIN_FAILED'
  | 'ACCOUNT_SUSPENDED'
  | 'SESSION_REVOKED'
  | 'SECURITY_ALERT'
  | 'METRICS_UPDATED';

export interface RealtimeEvent {
  id: string;
  type: AdminRealtimeEventType;
  timestamp: string;
  data: Record<string, any>;
}

interface RealtimeClient {
  id: string;
  res: Response;
  adminUsername: string;
  connectedAt: string;
  isAuthorized?: () => boolean;
}

export class AdminRealtimeHub extends EventEmitter {
  private static instance: AdminRealtimeHub | null = null;
  private clients = new Map<string, RealtimeClient>();
  private recentEvents: RealtimeEvent[] = [];
  private readonly maxRecentEvents = 50;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(100);
    this.startKeepAlive();
  }

  public static getInstance(): AdminRealtimeHub {
    if (!AdminRealtimeHub.instance) {
      AdminRealtimeHub.instance = new AdminRealtimeHub();
    }
    return AdminRealtimeHub.instance;
  }

  /**
   * Inicia o timer de keep-alive a cada 20 segundos para evitar que
   * proxies reversos como Nginx ou Cloudflare encerrem a conexão SSE inativa.
   */
  private startKeepAlive(): void {
    if (this.keepAliveInterval) return;
    this.keepAliveInterval = setInterval(() => {
      this.broadcastRaw(': keepalive\n\n');
    }, 20000);
    if (this.keepAliveInterval.unref) {
      this.keepAliveInterval.unref();
    }
  }

  /**
   * Registra um novo cliente SSE administrativo autenticado.
   */
  public addClient(res: Response, adminUsername: string, lastEventId?: string, isAuthorized?: () => boolean): string {
    const clientId = crypto.randomUUID();
    const now = new Date().toISOString();

    const client: RealtimeClient = {
      id: clientId,
      res,
      adminUsername,
      connectedAt: now,
      isAuthorized,
    };

    this.clients.set(clientId, client);

    // Envia evento de handshake inicial
    this.sendEventToClient(res, {
      id: crypto.randomUUID(),
      type: 'METRICS_UPDATED',
      timestamp: now,
      data: {
        status: 'CONNECTED',
        clientId,
        connectedAt: now,
        activeAdminsCount: this.clients.size,
      },
    });

    // Se o cliente forneceu Last-Event-ID, entrega eventos perdidos
    if (lastEventId) {
      const missedEvents = this.getMissedEvents(lastEventId);
      for (const event of missedEvents) {
        this.sendEventToClient(res, event);
      }
    }

    return clientId;
  }

  /**
   * Remove cliente desconectado
   */
  public removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * Retorna a quantidade de clientes administrativos conectados no momento.
   */
  public getActiveClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Publica um evento administrativo para todos os clientes ativos.
   */
  public publish(type: AdminRealtimeEventType, data: Record<string, any>): RealtimeEvent {
    const event: RealtimeEvent = {
      id: crypto.randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      data,
    };

    // Adiciona ao buffer circular de últimos eventos
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
    }

    // Transmite para todos os clientes conectados
    const payload = this.formatSseMessage(event);
    this.broadcastRaw(payload);

    this.emit('event_published', event);
    return event;
  }

  /**
   * Formata objeto de evento no padrão oficial Server-Sent Events (SSE)
   */
  private formatSseMessage(event: RealtimeEvent): string {
    return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  }

  /**
   * Envia evento para um cliente específico
   */
  private sendEventToClient(res: Response, event: RealtimeEvent): void {
    try {
      res.write(this.formatSseMessage(event));
    } catch {
      // Falha de escrita tratada no close handler
    }
  }

  /**
   * Transmite string raw para todos os clientes conectados
   */
  private broadcastRaw(data: string): void {
    for (const [clientId, client] of this.clients.entries()) {
      try {
        if (client.isAuthorized && !client.isAuthorized()) {
          client.res.end();
          this.clients.delete(clientId);
          continue;
        }
        client.res.write(data);
      } catch {
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Recupera eventos ocorridos após determinado Last-Event-ID
   */
  public getMissedEvents(lastEventId: string): RealtimeEvent[] {
    const idx = this.recentEvents.findIndex((e) => e.id === lastEventId);
    if (idx === -1) {
      return this.recentEvents.slice(-10); // Retorna os últimos 10 se o ID for desconhecido
    }
    return this.recentEvents.slice(idx + 1);
  }

  /**
   * Limpeza de timers para testes ou shutdown gracioso
   */
  public destroy(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.clients.clear();
    this.recentEvents = [];
    this.removeAllListeners();
  }
}

export const adminRealtimeHub = AdminRealtimeHub.getInstance();
