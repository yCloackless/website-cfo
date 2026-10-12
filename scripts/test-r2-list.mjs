import crypto from 'node:crypto';
import { getConfig } from '../src/services/anki/ankiMediaStorage.ts';

const config = getConfig();
console.log('CONFIG:', { bucket: config.bucket, endpoint: config.endpoint.href, region: config.region });

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

async function listR2() {
  const url = new URL(config.endpoint.href);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/${encodeURIComponent(config.bucket)}`;
  url.searchParams.set('list-type', '2');

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update('').digest('hex');

  const headers = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  const canonicalHeaders = Object.entries({ ...headers, host: url.host })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}:${value.trim()}\n`)
    .join('');
  const signedHeaders = Object.keys({ ...headers, host: url.host }).sort().join(';');

  const canonicalQuery = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = ['GET', url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const dateKey = hmac(`AWS4${config.secretKey}`, date);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign).toString('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, { headers });
  console.log('STATUS:', res.status);
  const xml = await res.text();
  console.log('RESPONSE:', xml);
}
listR2().catch(console.error);
