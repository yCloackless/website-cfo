process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-cal-sync-'));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = path.join(tempDir, 'test.db');
process.env.SESSION_SECRET = 'test-session-secret-for-calendar-sync-32ch';
process.env.DATA_ENCRYPTION_KEY = 'test-data-key-for-calendar-sync-32chars';

test('Calendar Sync & Decryption Recovery Integration Suite', async (t) => {
  const { app } = await import('../server');
  const { getDb } = await import('../src/db/database');
  const { SystemIntegrationRepository } = await import('../src/db/repositories');
  const { encryptStoredJson } = await import('../src/utils/storedJsonCrypto');

  const db = getDb().getRawDb();
  const repo = new SystemIntegrationRepository(db);

  // Create an admin session token directly in terminal_sessions or via HMAC cookie/token?
  // Let's check: create a user + sign in via /api/auth/login or use test admin token
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Login as admin to obtain valid admin session token
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const loginResp = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUser, password: adminPass }),
  });
  const loginJson: any = await loginResp.json();
  const token = loginJson.token;
  assert.ok(token, 'Admin login must succeed in test environment');

  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')) {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'gcal_evt_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    await t.test('1. Valid encrypted session returns connected: true and syncs events', async () => {
      const validPayload = encryptStoredJson({
        access_token: 'valid_access_token',
        refresh_token: 'valid_refresh_token',
        expiry_date: Date.now() + 3600_000,
        email: 'admin@cbmerj.rj.gov.br',
        name: 'Admin CBMERJ',
        updatedAt: new Date().toISOString(),
      });
      repo.set('google_calendar', validPayload);

      const statusRes = await fetch(`${baseUrl}/api/calendar/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(statusRes.status, 200);
      const statusData: any = await statusRes.json();
      assert.equal(statusData.connected, true);
      assert.equal(statusData.permanent, true);
      assert.equal(statusData.email, 'admin@cbmerj.rj.gov.br');
      assert.equal(statusData.apiOperational, true);

      const syncRes = await fetch(`${baseUrl}/api/calendar/batch-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          studyEvent: {
            summary: 'Física - Termodinâmica',
            dateStr: '2026-11-17',
          },
          revisions: [],
        }),
      });
      assert.equal(syncRes.status, 200);
      const syncData: any = await syncRes.json();
      assert.equal(syncData.studyEventId, 'gcal_evt_123');
    });

    await t.test('2. Unreadable encrypted session returns needsReconnect: true and preserves DB record', async () => {
      const badIv = crypto.randomBytes(12).toString('base64');
      const badTag = crypto.randomBytes(16).toString('base64');
      const badData = crypto.randomBytes(32).toString('base64');
      const corruptedPayload = JSON.stringify({
        version: 2,
        algorithm: 'aes-256-gcm',
        iv: badIv,
        tag: badTag,
        data: badData,
      });
      repo.set('google_calendar', corruptedPayload);

      const statusRes = await fetch(`${baseUrl}/api/calendar/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(statusRes.status, 200);
      const statusData: any = await statusRes.json();
      assert.equal(statusData.connected, false);
      assert.equal(statusData.needsReconnect, true);
      assert.equal(statusData.reconnectReason, 'KEY_MISMATCH_OR_CORRUPTED');

      // Ensure DB record was NOT deleted or overwritten
      const preserved = repo.get('google_calendar');
      assert.equal(preserved?.encryptedPayload, corruptedPayload);
    });
  } finally {
    global.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
