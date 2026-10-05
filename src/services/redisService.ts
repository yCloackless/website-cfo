/**
 * Rumo ao CFO - Redis Service Distribuído com Fallback Transparente
 * Suporte a instâncias múltiplas, rate limiting com RedisStore e controle de sessão de 5h.
 * Em ausência de REDIS_URL, opera silenciosamente com store em memória local sem degradar o sistema.
 */

import Redis from 'ioredis';
import { RedisStore } from 'rate-limit-redis';

let redisClient: Redis | null = null;
let isConnected = false;

const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;

if (redisUrl) {
  try {
    const isTls = redisUrl.startsWith('rediss://');
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
      tls: isTls ? (process.env.REDIS_TLS_CA ? { ca: process.env.REDIS_TLS_CA } : {}) : undefined,
      retryStrategy: (times) => {
        if (times > 10) return null; // Para de tentar após 10 falhas contínuas
        return Math.min(times * 200, 3000);
      },
    });

    redisClient.on('connect', () => {
      isConnected = true;
      console.log('⚡ [Redis] Conectado com sucesso para rate limiting e sessões distribuídas.');
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      console.warn('⚠️ [Redis] Falha transitória na conexão:', err.message);
    });

    redisClient.on('close', () => {
      isConnected = false;
    });
  } catch (err) {
    console.warn('⚠️ [Redis] Não foi possível instanciar o cliente Redis, usando fallback local:', (err as Error).message);
    redisClient = null;
  }
} else {
  // Modo de desenvolvimento, suíte de testes e instâncias sem Redis dedicado
  // As sessões de autenticação dos usuários e travas de segurança persistem de forma ACID no banco de dados.
  if (process.env.NODE_ENV !== 'test') {
    console.info('ℹ️ [Redis] REDIS_URL não configurada; rate limiting operando com MemoryStore local (sessões e segurança persistem no banco de dados).');
  }
}

export function isRedisAvailable(): boolean {
  return isConnected && redisClient !== null;
}

export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * Cria store distribuído para o express-rate-limit quando o Redis está disponível.
 * Se Redis não estiver disponível, retorna undefined para que o rate limiter use seu MemoryStore nativo.
 */
export function createRateLimitRedisStore(prefix: string) {
  if (!redisClient) return undefined;

  return new RedisStore({
    sendCommand: (...args: string[]) => (redisClient as any).call(...args),
    prefix: `rl:${prefix}:`,
  });
}

/**
 * Trava de Sessão Exclusiva de 5 Horas do Cadete no Redis
 */
export async function setCadetLockInRedis(userId: string, sessionId: string, ttlSeconds: number = 18000): Promise<void> {
  if (!isRedisAvailable() || !redisClient) return;
  try {
    await redisClient.set(`cadet:lock:${userId}`, sessionId, 'EX', ttlSeconds);
  } catch (err) {
    console.warn('⚠️ [Redis] Falha ao gravar trava do cadete:', (err as Error).message);
  }
}

export async function getCadetLockFromRedis(userId: string): Promise<string | null> {
  if (!isRedisAvailable() || !redisClient) return null;
  try {
    return await redisClient.get(`cadet:lock:${userId}`);
  } catch {
    return null;
  }
}

export async function clearCadetLockInRedis(userId: string): Promise<void> {
  if (!isRedisAvailable() || !redisClient) return;
  try {
    await redisClient.del(`cadet:lock:${userId}`);
  } catch {}
}

/**
 * Encerramento gracioso da conexão Redis
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
    }
  }
}

if (typeof process !== 'undefined') {
  const handleShutdown = () => {
    void closeRedisConnection();
  };
  process.once('SIGTERM', handleShutdown);
  process.once('SIGINT', handleShutdown);
}
