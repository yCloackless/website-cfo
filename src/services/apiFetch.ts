/** Adds the terminal session only to same-origin API calls, never to provider URLs. */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!target.startsWith('/api/')) return fetch(input, init);
  const headers = new Headers(init.headers);
  const session = localStorage.getItem('cfo_terminal_session');
  const previous = headers.get('Authorization');
  if (target.startsWith('/api/calendar/') && previous && previous !== `Bearer ${session}`) {
    headers.set('X-Google-Access-Token', previous.replace(/^Bearer /, ''));
  }
  if (session) headers.set('Authorization', `Bearer ${session}`);
  else headers.delete('Authorization');
  return fetch(input, { ...init, headers });
}
