/**
 * Rumo ao CFO - Telemetry & RUM (Real User Metrics) Service
 * Coleta e agrega Core Web Vitals com anonimização estrita conforme a LGPD.
 * Zero armazenamento de IP, geolocalização exata, cookies ou dados pessoais.
 */

export interface WebVitalPayload {
  name: 'FCP' | 'LCP' | 'CLS' | 'INP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta?: number;
  id?: string;
  url: string;
}

interface AggregatedMetric {
  count: number;
  sum: number;
  min: number;
  max: number;
  goodCount: number;
  needsImprovementCount: number;
  poorCount: number;
}

class TelemetryService {
  private metricsMap = new Map<string, AggregatedMetric>();
  private readonly maxTrackedUrls = 50;

  public recordVital(data: WebVitalPayload): boolean {
    if (!data || typeof data.name !== 'string' || typeof data.value !== 'number') {
      return false;
    }

    const validNames = ['FCP', 'LCP', 'CLS', 'INP', 'TTFB'];
    if (!validNames.includes(data.name)) return false;

    // Sanitização de rota para evitar vazamento ou poluição de chaves
    const cleanUrl = (data.url || '/').split('?')[0].slice(0, 100);
    const key = `${data.name}:${cleanUrl}`;

    if (!this.metricsMap.has(key)) {
      if (this.metricsMap.size >= this.maxTrackedUrls) {
        return false;
      }
      this.metricsMap.set(key, {
        count: 0,
        sum: 0,
        min: data.value,
        max: data.value,
        goodCount: 0,
        needsImprovementCount: 0,
        poorCount: 0,
      });
    }

    const stat = this.metricsMap.get(key)!;
    stat.count++;
    stat.sum += data.value;
    stat.min = Math.min(stat.min, data.value);
    stat.max = Math.max(stat.max, data.value);

    if (data.rating === 'good') stat.goodCount++;
    else if (data.rating === 'needs-improvement') stat.needsImprovementCount++;
    else if (data.rating === 'poor') stat.poorCount++;

    return true;
  }

  public getSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    for (const [key, stat] of this.metricsMap.entries()) {
      summary[key] = {
        samples: stat.count,
        avg: stat.count > 0 ? Number((stat.sum / stat.count).toFixed(2)) : 0,
        min: stat.min,
        max: stat.max,
        p75Distribution: {
          goodPercent: stat.count > 0 ? Math.round((stat.goodCount / stat.count) * 100) : 0,
          poorPercent: stat.count > 0 ? Math.round((stat.poorCount / stat.count) * 100) : 0,
        },
      };
    }
    return summary;
  }
}

export const telemetryService = new TelemetryService();
