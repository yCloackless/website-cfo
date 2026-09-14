/**
 * Registro de Honeytokens e Detecção de Canários
 * Rumo ao CFO - Camada de Decepção Defensiva
 * 
 * Honeytokens são artefatos criptograficamente gerados, totalmente falsos e inválidos,
 * plantados exclusivamente em recursos decoy (ex: /.env.backup, /admin-export.json).
 * O uso de qualquer um desses tokens indica atividade maliciosa ou varredura não autorizada.
 */

import crypto from 'crypto';
import { HoneytokenDefinition } from './honeypotTypes';

export const REGISTERED_HONEYTOKENS: HoneytokenDefinition[] = [
  {
    id: 'ht_api_key_01',
    tokenIdentifier: 'canary_api_key_legacy',
    tokenValue: 'cfo_canary_key_8f3a9e2d7c1b5046294e8b01',
    tokenType: 'api_key',
    description: 'Chave de API falsa plantada em backups de configuração (.env.backup)',
    plantedLocation: '/.env.backup',
  },
  {
    id: 'ht_svc_account_01',
    tokenIdentifier: 'canary_service_account_backup',
    tokenValue: 'svc-decoy-backup@cbmerj-internal.iam.gserviceaccount.com',
    tokenType: 'service_account',
    description: 'Conta de serviço falsa plantada em arquivos de configuração antigos (config.old)',
    plantedLocation: '/config.old',
  },
  {
    id: 'ht_system_token_01',
    tokenIdentifier: 'canary_system_token_export',
    tokenValue: 'cfo_canary_tok_7a9f82d4e61b3c8a912d547f',
    tokenType: 'system_token',
    description: 'Token de sincronização interna falso em admin-export.json',
    plantedLocation: '/admin-export.json',
  },
  {
    id: 'ht_db_user_01',
    tokenIdentifier: 'canary_db_user_dump',
    tokenValue: 'cfo_canary_operator_sec',
    tokenType: 'db_user',
    description: 'Usuário de banco falso em dump SQL canário (database.sql)',
    plantedLocation: '/database.sql',
  },
  {
    id: 'ht_archive_canary_01',
    tokenIdentifier: 'canary_archive_zip_meta',
    tokenValue: 'cfo_canary_zip_f37d1e84c90b6a22',
    tokenType: 'system_token',
    description: 'Token canário embutido em backup.zip README',
    plantedLocation: '/backup.zip',
  },
];

// Mapa rápido para busca O(1)
const HONEYTOKEN_VALUES_MAP = new Map<string, HoneytokenDefinition>();
for (const ht of REGISTERED_HONEYTOKENS) {
  HONEYTOKEN_VALUES_MAP.set(ht.tokenValue.toLowerCase(), ht);
}

/**
 * Inspeciona valores arbitrários (headers, query, payload seguro) buscando ocorrências de honeytokens.
 */
export function detectHoneytoken(text: string): { found: boolean; token?: HoneytokenDefinition } {
  if (!text || typeof text !== 'string') return { found: false };
  const lower = text.toLowerCase();

  for (const [val, def] of HONEYTOKEN_VALUES_MAP.entries()) {
    if (lower.includes(val)) {
      return { found: true, token: def };
    }
  }

  // Regex para detecção de qualquer padrão canário com prefixo canônico 'cfo_canary_'
  if (lower.includes('cfo_canary_')) {
    return {
      found: true,
      token: {
        id: 'ht_generic_pattern',
        tokenIdentifier: 'generic_cfo_canary_pattern',
        tokenValue: 'cfo_canary_pattern_matched',
        tokenType: 'system_token',
        description: 'Padrão com prefixo canário detectado',
        plantedLocation: 'unknown',
      },
    };
  }

  return { found: false };
}
