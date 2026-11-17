import type { DatabaseSync } from 'node:sqlite';

export interface MilitaryRankDef {
  id: string;
  order: number;
  name: string;
  shortName: string;
  badgeColor: string;
  minEffectiveHours: number;
  minStreakDays: number;
  targetDailyHours: number;
}

export const MILITARY_RANKS: MilitaryRankDef[] = [
  { id: 'recruta', order: 0, name: 'Recruta', shortName: 'Recruta', badgeColor: '#64748b', minEffectiveHours: 0, minStreakDays: 0, targetDailyHours: 0 },
  { id: 'soldado', order: 1, name: 'Soldado', shortName: 'Sd', badgeColor: '#94a3b8', minEffectiveHours: 0.45, minStreakDays: 1, targetDailyHours: 1 },
  { id: 'cabo', order: 2, name: 'Cabo', shortName: 'Cb', badgeColor: '#38bdf8', minEffectiveHours: 1.5, minStreakDays: 5, targetDailyHours: 2 },
  { id: 'sargento_3', order: 3, name: '3º Sargento', shortName: '3º Sgt', badgeColor: '#22d3ee', minEffectiveHours: 2.4, minStreakDays: 7, targetDailyHours: 3 },
  { id: 'sargento_1', order: 4, name: '1º Sargento', shortName: '1º Sgt', badgeColor: '#34d399', minEffectiveHours: 3.4, minStreakDays: 10, targetDailyHours: 4 },
  { id: 'subtenente', order: 5, name: 'Subtenente', shortName: 'Subten', badgeColor: '#10b981', minEffectiveHours: 4.4, minStreakDays: 14, targetDailyHours: 5 },
  { id: 'aspirante', order: 6, name: 'Aspirante a Oficial', shortName: 'Asp Of', badgeColor: '#a78bfa', minEffectiveHours: 5.5, minStreakDays: 18, targetDailyHours: 6.5 },
  { id: 'tenente', order: 7, name: 'Tenente', shortName: 'Ten', badgeColor: '#f59e0b', minEffectiveHours: 6.8, minStreakDays: 21, targetDailyHours: 8 },
  { id: 'capitao', order: 8, name: 'Capitão', shortName: 'Cap', badgeColor: '#f97316', minEffectiveHours: 8.3, minStreakDays: 25, targetDailyHours: 9.5 },
  { id: 'major', order: 9, name: 'Major', shortName: 'Maj', badgeColor: '#ef4444', minEffectiveHours: 9.5, minStreakDays: 28, targetDailyHours: 10.5 },
  { id: 'coronel', order: 10, name: 'Coronel Comandante', shortName: 'Cel Cmd', badgeColor: '#eab308', minEffectiveHours: 11.5, minStreakDays: 30, targetDailyHours: 12 },
];

export const QUALIFYING_DAY_SECONDS = 1800; // 30 minutes
export const MAX_ICE_SHIELDS = 3;
export const SHIELD_MILESTONE_DAYS = 14;
export const MAX_DAILY_HOURS_CAP = 12;

export interface ShieldSaveEvent {
  savedStreakDays: number;
  missedDates: string[];
  remainingShields: number;
  activatedAt: string;
}

export interface NextRankProgress {
  id: string;
  name: string;
  targetDailyHours: number;
  minStreakDays: number;
  daysRemaining: number;
  hoursDeficitPerDay: number;
}

export interface GamificationStatus {
  currentStreakDays: number;
  bestStreakDays: number;
  iceShields: number;
  maxIceShields: number;
  nextShieldInDays: number;
  studiedTodaySeconds: number;
  qualifiedToday: boolean;
  avgDailyHours14d: number;
  effectiveDailyPaceHours: number;
  consistencyFactor: number;
  rank: MilitaryRankDef;
  nextRank: NextRankProgress | null;
  pendingShieldEvent: ShieldSaveEvent | null;
  todayStr: string;
}

function resolveDateStr(now?: Date | string): string {
  if (typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now)) return now;
  const target = now instanceof Date ? now : new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.APP_TIME_ZONE || 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDaysISO(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays);
  return new Date(utc).toISOString().slice(0, 10);
}

function diffDaysISO(fromDateStr: string, toDateStr: string): number {
  const [y1, m1, d1] = fromDateStr.split('-').map(Number);
  const [y2, m2, d2] = toDateStr.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class GamificationService {
  constructor(private readonly db: DatabaseSync) {}

  public getStatus(userId: string, now?: Date | string): GamificationStatus {
    return this.evaluate(userId, now, false);
  }

  public recomputeFromSessions(userId: string, now?: Date | string): GamificationStatus {
    return this.evaluate(userId, now, true);
  }

  public acknowledgeShieldEvent(userId: string, now?: Date | string): GamificationStatus {
    const updatedAt = new Date().toISOString();
    this.db.prepare(
      'UPDATE user_gamification_state SET pending_shield_event_json = NULL, updated_at = ? WHERE user_id = ?'
    ).run(updatedAt, userId);
    return this.getStatus(userId, now);
  }

  private evaluate(userId: string, now: Date | string | undefined, isSessionMutation: boolean): GamificationStatus {
    const todayStr = resolveDateStr(now);
    const yesterdayStr = addDaysISO(todayStr, -1);

    const rows = this.db.prepare(
      `SELECT date_str, SUM(duration_seconds) AS total_seconds
       FROM study_sessions
       WHERE user_id = ?
       GROUP BY date_str
       ORDER BY date_str ASC`
    ).all(userId) as Array<{ date_str: string; total_seconds: number }>;

    const dailyMap = new Map<string, number>();
    let firstStudiedDate: string | null = null;
    for (const row of rows) {
      const secs = Math.max(0, Math.round(Number(row.total_seconds) || 0));
      if (secs > 0) {
        dailyMap.set(row.date_str, secs);
        if (!firstStudiedDate) firstStudiedDate = row.date_str;
      }
    }

    const row = this.db.prepare('SELECT * FROM user_gamification_state WHERE user_id = ?').get(userId) as any;

    let iceShields = row ? Number(row.ice_shields ?? 1) : 1;
    let bestStreak = row ? Number(row.best_streak ?? 0) : 0;
    let lastEvaluatedDate: string = row?.last_evaluated_date || yesterdayStr;
    let lastMilestone = row ? Number(row.last_shield_milestone_streak ?? 0) : 0;
    const shieldedDates = new Set<string>(parseJsonSafe<string[]>(row?.shielded_dates_json, []));
    let pendingShieldEvent = parseJsonSafe<ShieldSaveEvent | null>(row?.pending_shield_event_json, null);

    // 1. Reembolsa escudos automaticamente se sessões retroativas preencherem um dia que estava congelado
    if (isSessionMutation && shieldedDates.size > 0) {
      for (const sDate of Array.from(shieldedDates)) {
        if ((dailyMap.get(sDate) || 0) >= QUALIFYING_DAY_SECONDS) {
          shieldedDates.delete(sDate);
          if (iceShields < MAX_ICE_SHIELDS) {
            iceShields += 1;
          }
          if (pendingShieldEvent) {
            pendingShieldEvent.missedDates = pendingShieldEvent.missedDates.filter((d) => d !== sDate);
            pendingShieldEvent.remainingShields = iceShields;
            if (pendingShieldEvent.missedDates.length === 0) {
              pendingShieldEvent = null;
            }
          }
        }
      }
    }

    // 2. Backfill inicial para usuário sem registro prévio (não gera modal retroativo)
    if (!row) {
      bestStreak = Math.max(bestStreak, this.computeHistoricalBestStreak(dailyMap, shieldedDates));
      const initialStreak = this.computeCurrentStreak(todayStr, dailyMap, shieldedDates);
      lastMilestone = Math.floor(initialStreak / SHIELD_MILESTONE_DAYS) * SHIELD_MILESTONE_DAYS;
      lastEvaluatedDate = yesterdayStr;
    } else if (lastEvaluatedDate < yesterdayStr) {
      // 3. Avalia dias já encerrados desde a última checagem até ontem
      let cursor = addDaysISO(lastEvaluatedDate, 1);
      const newlySavedDates: string[] = [];

      while (cursor <= yesterdayStr) {
        const secs = dailyMap.get(cursor) || 0;
        const streakIntoPrev = this.computeStreakEndingAt(addDaysISO(cursor, -1), dailyMap, shieldedDates);
        if (secs < QUALIFYING_DAY_SECONDS && !shieldedDates.has(cursor)) {
          if (streakIntoPrev > 0 && iceShields > 0) {
            iceShields -= 1;
            shieldedDates.add(cursor);
            newlySavedDates.push(cursor);
          } else {
            // Falha sem escudo quebra a sequência: reseta marco futuro proporcionalmente
            lastMilestone = 0;
          }
        }
        cursor = addDaysISO(cursor, 1);
      }

      if (newlySavedDates.length > 0) {
        const savedStreak = this.computeCurrentStreak(todayStr, dailyMap, shieldedDates);
        const existingMissed = pendingShieldEvent?.missedDates || [];
        pendingShieldEvent = {
          savedStreakDays: savedStreak,
          missedDates: Array.from(new Set([...existingMissed, ...newlySavedDates])),
          remainingShields: iceShields,
          activatedAt: new Date().toISOString(),
        };
      }
      lastEvaluatedDate = yesterdayStr;
    }

    // 4. Recalcula ofensiva atual de forma determinística
    const currentStreak = this.computeCurrentStreak(todayStr, dailyMap, shieldedDates);
    bestStreak = Math.max(bestStreak, currentStreak, this.computeHistoricalBestStreak(dailyMap, shieldedDates));

    // Recompensa de 1 escudo a cada 14 dias consecutivos
    if (currentStreak === 0) {
      lastMilestone = 0;
    } else {
      while (currentStreak >= lastMilestone + SHIELD_MILESTONE_DAYS) {
        lastMilestone += SHIELD_MILESTONE_DAYS;
        if (iceShields < MAX_ICE_SHIELDS) {
          iceShields += 1;
        }
      }
    }

    // 5. Calcula carga média móvel de 14 dias (teto 12h/dia) e patente CBMERJ (sem zerar)
    const windowStart = addDaysISO(todayStr, -13);
    let totalSeconds14d = 0;
    for (const [dStr, secs] of dailyMap.entries()) {
      if (dStr >= windowStart && dStr <= todayStr) {
        totalSeconds14d += secs;
      }
    }
    const daysSinceFirst = firstStudiedDate
      ? Math.max(1, Math.min(14, diffDaysISO(firstStudiedDate, todayStr) + 1))
      : 1;
    const avgDailyHours14d = Math.min(MAX_DAILY_HOURS_CAP, Number((totalSeconds14d / 3600 / daysSinceFirst).toFixed(2)));
    const consistencyFactor = Number((0.55 + 0.45 * Math.min(1, currentStreak / 30)).toFixed(3));
    const effectiveDailyPaceHours = Number((avgDailyHours14d * consistencyFactor).toFixed(2));
    const hasHistory = dailyMap.size > 0;
    const rank = this.resolveRank(effectiveDailyPaceHours, currentStreak, hasHistory);
    const nextRankDef = MILITARY_RANKS.find((r) => r.order === rank.order + 1) || null;
    const nextRank: NextRankProgress | null = nextRankDef
      ? {
          id: nextRankDef.id,
          name: nextRankDef.name,
          targetDailyHours: nextRankDef.targetDailyHours,
          minStreakDays: nextRankDef.minStreakDays,
          daysRemaining: Math.max(0, nextRankDef.minStreakDays - currentStreak),
          hoursDeficitPerDay: Number(Math.max(0, nextRankDef.targetDailyHours - avgDailyHours14d).toFixed(1)),
        }
      : null;

    const qualifiedDates = Array.from(dailyMap.entries())
      .filter(([, secs]) => secs >= QUALIFYING_DAY_SECONDS)
      .map(([dStr]) => dStr)
      .sort();
    const lastStudiedDate = qualifiedDates.at(-1) || null;
    const nowIso = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO user_gamification_state (
        user_id, current_streak, best_streak, ice_shields, last_studied_date,
        last_evaluated_date, last_shield_milestone_streak, shielded_dates_json,
        pending_shield_event_json, rank_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        current_streak = excluded.current_streak,
        best_streak = excluded.best_streak,
        ice_shields = excluded.ice_shields,
        last_studied_date = excluded.last_studied_date,
        last_evaluated_date = excluded.last_evaluated_date,
        last_shield_milestone_streak = excluded.last_shield_milestone_streak,
        shielded_dates_json = excluded.shielded_dates_json,
        pending_shield_event_json = excluded.pending_shield_event_json,
        rank_id = excluded.rank_id,
        updated_at = excluded.updated_at
    `).run(
      userId,
      currentStreak,
      bestStreak,
      iceShields,
      lastStudiedDate,
      lastEvaluatedDate,
      lastMilestone,
      JSON.stringify(Array.from(shieldedDates).sort().slice(-60)),
      pendingShieldEvent ? JSON.stringify(pendingShieldEvent) : null,
      rank.id,
      nowIso
    );

    const studiedTodaySeconds = dailyMap.get(todayStr) || 0;
    const nextMilestoneAt = lastMilestone + SHIELD_MILESTONE_DAYS;

    return {
      currentStreakDays: currentStreak,
      bestStreakDays: bestStreak,
      iceShields,
      maxIceShields: MAX_ICE_SHIELDS,
      nextShieldInDays: Math.max(1, nextMilestoneAt - currentStreak),
      studiedTodaySeconds,
      qualifiedToday: studiedTodaySeconds >= QUALIFYING_DAY_SECONDS,
      avgDailyHours14d,
      effectiveDailyPaceHours,
      consistencyFactor,
      rank,
      nextRank,
      pendingShieldEvent,
      todayStr,
    };
  }

  private computeCurrentStreak(todayStr: string, dailyMap: Map<string, number>, shieldedDates: Set<string>): number {
    const todayQualified = (dailyMap.get(todayStr) || 0) >= QUALIFYING_DAY_SECONDS;
    const anchor = todayQualified ? todayStr : addDaysISO(todayStr, -1);
    return this.computeStreakEndingAt(anchor, dailyMap, shieldedDates);
  }

  private computeStreakEndingAt(anchorDateStr: string, dailyMap: Map<string, number>, shieldedDates: Set<string>): number {
    let cursor = anchorDateStr;
    let count = 0;
    let safety = 0;
    while (safety < 1500) {
      safety += 1;
      const secs = dailyMap.get(cursor) || 0;
      if (secs >= QUALIFYING_DAY_SECONDS) {
        count += 1;
      } else if (!shieldedDates.has(cursor)) {
        break;
      }
      cursor = addDaysISO(cursor, -1);
    }
    return count;
  }

  private computeHistoricalBestStreak(dailyMap: Map<string, number>, shieldedDates: Set<string>): number {
    const allDates = Array.from(new Set([...dailyMap.keys(), ...shieldedDates])).sort();
    if (allDates.length === 0) return 0;
    let best = 0;
    let current = 0;
    let prevDate: string | null = null;

    for (const dStr of allDates) {
      const qualifies = (dailyMap.get(dStr) || 0) >= QUALIFYING_DAY_SECONDS;
      const isShielded = shieldedDates.has(dStr);
      if (!qualifies && !isShielded) continue;

      if (prevDate && diffDaysISO(prevDate, dStr) === 1) {
        if (qualifies) current += 1;
      } else {
        current = qualifies ? 1 : 0;
      }
      prevDate = dStr;
      if (current > best) best = current;
    }
    return best;
  }

  private resolveRank(effectiveDailyPaceHours: number, streakDays: number, hasHistory: boolean): MilitaryRankDef {
    let matched = MILITARY_RANKS[0];
    for (const rank of MILITARY_RANKS) {
      if (rank.order === 0) continue;
      if (effectiveDailyPaceHours >= rank.minEffectiveHours && streakDays >= rank.minStreakDays) {
        matched = rank;
      }
    }
    if (matched.order === 0 && hasHistory) {
      return MILITARY_RANKS[1]; // Piso permanente Soldado após ter estudo registrado
    }
    return matched;
  }
}
