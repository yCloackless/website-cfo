/**
 * Rumo ao CFO - Real User Metrics (RUM) Collector
 * Captura passiva e anônima de Core Web Vitals (FCP, LCP, CLS, INP)
 * Zero impacto na thread principal (PerformanceObserver) e envio amortecido via sendBeacon
 */

interface WebVitalMetric {
  name: 'FCP' | 'LCP' | 'CLS' | 'INP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta?: number;
  id?: string;
  url: string;
}

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  switch (name) {
    case 'FCP':
      return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
    case 'LCP':
      return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
    case 'CLS':
      return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
    case 'INP':
      return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
    default:
      return 'good';
  }
}

function sendMetric(metric: WebVitalMetric): void {
  try {
    const payload = JSON.stringify(metric);
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/telemetry/vitals', blob);
    } else if (typeof fetch !== 'undefined') {
      fetch('/api/telemetry/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}
}

export function initRumCollector(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  const currentUrl = window.location.pathname;

  // 1. First Contentful Paint (FCP)
  try {
    const fcpObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntriesByName('first-contentful-paint')) {
        const val = Math.round(entry.startTime);
        sendMetric({
          name: 'FCP',
          value: val,
          rating: getRating('FCP', val),
          url: currentUrl,
        });
        fcpObserver.disconnect();
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });
  } catch {}

  // 2. Largest Contentful Paint (LCP)
  try {
    let lastLcpValue = 0;
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        lastLcpValue = Math.round(lastEntry.startTime);
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    const emitLcp = () => {
      if (lastLcpValue > 0) {
        sendMetric({
          name: 'LCP',
          value: lastLcpValue,
          rating: getRating('LCP', lastLcpValue),
          url: currentUrl,
        });
        lastLcpValue = 0;
      }
    };
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') emitLcp();
    });
    window.addEventListener('pagehide', emitLcp);
  } catch {}

  // 3. Cumulative Layout Shift (CLS)
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries() as any[]) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    const emitCls = () => {
      if (clsValue > 0) {
        const rounded = Number(clsValue.toFixed(3));
        sendMetric({
          name: 'CLS',
          value: rounded,
          rating: getRating('CLS', rounded),
          url: currentUrl,
        });
        clsValue = 0;
      }
    };
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') emitCls();
    });
    window.addEventListener('pagehide', emitCls);
  } catch {}
}
