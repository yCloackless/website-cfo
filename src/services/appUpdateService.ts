/**
 * Rumo ao CFO - Serviço de Sincronização e Atualização em Tempo Real (Zero-Downtime)
 * Inspirado na arquitetura da Amazon, Gmail e Figma:
 * - Detecta deploys de backend e novos bundles de frontend sem necessidade de F5 manual forçado.
 * - Monitora Service Worker em background e checagens leves periódicas em /api/version.
 * - Permite atualização suave e graciosa sem interrupção de estudos ou cronômetros.
 */

export interface VersionInfo {
  version: string;
  startedAt: number;
  timestamp: number;
}

export type UpdateListener = (hasUpdate: boolean, versionInfo?: VersionInfo) => void;

class AppUpdateService {
  private initialVersion: VersionInfo | null = null;
  private waitingWorker: ServiceWorker | null = null;
  private hasUpdate = false;
  private updateInfo: VersionInfo | null = null;
  private listeners = new Set<UpdateListener>();
  private checkIntervalId: number | null = null;
  private isChecking = false;

  public init(): void {
    if (typeof window === 'undefined') return;

    // 1. Obter a versão inicial de boot do sistema
    void this.fetchCurrentVersion().then((version) => {
      if (version) {
        this.initialVersion = version;
      }
    });

    // 2. Monitorar o ciclo de vida do Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          this.attachRegistrationListeners(reg);
        }
      }).catch(() => {
        // Ignora silenciosamente em ambientes sem suporte ou com restrições
      });
    }

    // 3. Checagem periódica a cada 5 minutos
    if (!this.checkIntervalId) {
      this.checkIntervalId = window.setInterval(() => {
        void this.checkForUpdate();
      }, 5 * 60 * 1000);
    }

    // 4. Checar imediatamente quando a aba volta a ganhar foco do usuário
    window.addEventListener('focus', () => {
      void this.checkForUpdate();
    });

    // 5. Checar ao restabelecer conexão de rede
    window.addEventListener('online', () => {
      void this.checkForUpdate();
    });
  }

  public registerServiceWorkerRegistration(reg: ServiceWorkerRegistration): void {
    this.attachRegistrationListeners(reg);
  }

  private attachRegistrationListeners(reg: ServiceWorkerRegistration): void {
    if (reg.waiting) {
      this.waitingWorker = reg.waiting;
      void this.fetchCurrentVersion().then((info) => this.notifyUpdateAvailable(info || undefined));
    }

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // Se o novo worker foi instalado e já existe um controlador ativo, temos um deploy novo!
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          this.waitingWorker = newWorker;
          void this.fetchCurrentVersion().then((info) => this.notifyUpdateAvailable(info || undefined));
        }
      });
    });
  }

  public async checkForUpdate(): Promise<boolean> {
    if (this.isChecking) return this.hasUpdate;
    this.isChecking = true;

    try {
      // 1. Pede ao Service Worker para buscar atualizações de hash no servidor
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update().catch(() => {});
          if (reg.waiting) {
            this.waitingWorker = reg.waiting;
            const info = await this.fetchCurrentVersion();
            this.notifyUpdateAvailable(info || undefined);
            return true;
          }
        }
      }

      // 2. Consulta a rota de telemetria /api/version
      const latest = await this.fetchCurrentVersion();
      if (latest && this.initialVersion) {
        const versionChanged = latest.version !== this.initialVersion.version;
        const serverRestarted = latest.startedAt !== this.initialVersion.startedAt;

        if (versionChanged || serverRestarted) {
          this.notifyUpdateAvailable(latest);
          return true;
        }
      }
    } catch {
      // Falha temporária de rede; tentará novamente na próxima janela
    } finally {
      this.isChecking = false;
    }

    return false;
  }

  private async fetchCurrentVersion(): Promise<VersionInfo | null> {
    try {
      const res = await fetch(`/api/version?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      return (await res.json()) as VersionInfo;
    } catch {
      return null;
    }
  }

  private notifyUpdateAvailable(info?: VersionInfo): void {
    this.hasUpdate = true;
    if (info) this.updateInfo = info;
    this.listeners.forEach((listener) => {
      try {
        listener(true, this.updateInfo || undefined);
      } catch {
        // Evita que erros em listeners degradem a execução
      }
    });
  }

  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    if (this.hasUpdate) {
      listener(true, this.updateInfo || undefined);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isUpdateAvailable(): boolean {
    return this.hasUpdate;
  }

  /**
   * Aplica a nova versão de forma graciosa e instantânea:
   * - Envia SKIP_WAITING para o Service Worker novo assumir o controle.
   * - Quando o controlador mudar, executa reload suave.
   */
  public applyAppUpdate(): void {
    if (typeof window === 'undefined') return;

    if (this.waitingWorker) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloaded) {
          reloaded = true;
          window.location.reload();
        }
      });

      this.waitingWorker.postMessage({ type: 'SKIP_WAITING' });

      // Fallback de segurança: se o evento de controller não disparar em 1200ms, força o reload
      setTimeout(() => {
        if (!reloaded) {
          reloaded = true;
          window.location.reload();
        }
      }, 1200);
      return;
    }

    // Sem worker esperando (ex.: deploy de backend puro ou atualização de cache)
    window.location.reload();
  }
}

export const appUpdateService = new AppUpdateService();
