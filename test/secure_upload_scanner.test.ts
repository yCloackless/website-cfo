import test from 'node:test';
import assert from 'node:assert/strict';
import { SecureUploadService } from '../src/services/secureUploadService';

test('production does not mark a file clean when ClamAV is not configured', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousClamHost = process.env.CLAMAV_HOST;

  process.env.NODE_ENV = 'production';
  delete process.env.CLAMAV_HOST;

  try {
    const service = Object.create(SecureUploadService.prototype) as SecureUploadService;
    const result = await service.scanForMalware(Buffer.from('benign test content'));

    assert.equal(result.isClean, false);
    assert.equal(result.scanner, 'ClamAVUnavailable');
    assert.equal(result.threatName, 'SCANNER_UNAVAILABLE');
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousClamHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = previousClamHost;
  }
});

test('Render runtime does not use the heuristic as a production clean result', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRenderServiceId = process.env.RENDER_SERVICE_ID;
  const previousClamHost = process.env.CLAMAV_HOST;

  process.env.NODE_ENV = 'test';
  process.env.RENDER_SERVICE_ID = 'test-render-service';
  delete process.env.CLAMAV_HOST;

  try {
    const service = Object.create(SecureUploadService.prototype) as SecureUploadService;
    const result = await service.scanForMalware(Buffer.from('benign test content'));

    assert.equal(result.isClean, false);
    assert.equal(result.scanner, 'ClamAVUnavailable');
    assert.equal(result.threatName, 'SCANNER_UNAVAILABLE');
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousRenderServiceId === undefined) delete process.env.RENDER_SERVICE_ID;
    else process.env.RENDER_SERVICE_ID = previousRenderServiceId;

    if (previousClamHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = previousClamHost;
  }
});
