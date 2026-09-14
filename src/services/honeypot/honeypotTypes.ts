/**
 * Tipos e interfaces da Camada de Decepção Defensiva (Honeypot & Honeytokens)
 * Rumo ao CFO - Aplicação Defensiva Isolada
 */

export type HoneypotEventType =
  | 'HONEYPOT_ROUTE_ACCESSED'
  | 'HONEYPOT_LOGIN_ATTEMPT'
  | 'HONEYTOKEN_TRIGGERED'
  | 'DECOY_RESOURCE_ACCESSED'
  | 'AUTOMATED_ENUMERATION_SUSPECTED';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type HoneypotAction =
  | 'LOGGED'
  | 'THROTTLED'
  | 'SOURCE_TEMPORARILY_BLOCKED'
  | 'SESSION_INVALIDATED'
  | 'PENTEST_BYPASS';

export interface DbDeceptionEvent {
  id: string;
  eventType: HoneypotEventType;
  honeypotId: string;
  requestPath: string;
  method: string;
  riskScore: number;
  userId: string | null;
  ipHash: string | null;
  userAgentSummary: string;
  actionTaken: HoneypotAction;
  createdAt: string;
}

export interface HoneytokenDefinition {
  id: string;
  tokenIdentifier: string;
  tokenValue: string;
  tokenType: 'api_key' | 'service_account' | 'system_token' | 'db_user';
  description: string;
  plantedLocation: string;
}

export interface HoneypotMetrics {
  totalEvents: number;
  events24h: number;
  highRiskEvents24h: number;
  activeTemporaryBlocks: number;
  eventsByType: Record<string, number>;
  topTargetedDecoys: Array<{ path: string; count: number }>;
}

export interface RiskEvaluationResult {
  riskScore: number;
  riskLevel: RiskLevel;
  action: HoneypotAction;
  shouldBlockSource: boolean;
  shouldInvalidateSession: boolean;
  blockDurationHours: number;
}
