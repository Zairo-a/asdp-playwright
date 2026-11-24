import { test, expect } from '@playwright/test';

const WEB = 'https://dev.asdpv2.garudakreasi.com/api/auth';

async function baca(r: any) {
  try { return await r.json(); } catch { return {}; }
}
const pesanDari = (b: any) => String(b.pesan ?? b.message ?? '');

test('lookup gagal: identifier kosong', async ({ request }) => {
  const r = await request.post(`${WEB}/lookup`, { data: { channel: 'sms', identifier: '' } });
  expect(r.status()).toBe(400);
  expect(pesanDari(await baca(r))).toContain('Missing identifier');
});

test('lookup gagal: body kosong', async ({ request }) => {
  const r = await request.post(`${WEB}/lookup`, { data: {} });
  expect(r.status()).toBe(400);
  expect(pesanDari(await baca(r))).toContain('Missing identifier');
});

test('login-password gagal: auth dan randomUserId ngawur', async ({ request }) => {
  const r = await request.post(`${WEB}/login-password`, {
    data: { auth: 'ngawur', randomUserId: 'ngawur', password: 'apa-saja' },
  });
  expect(r.status()).toBe(200);
  const b = await baca(r);
  expect(b.ok).toBe(false);
  expect(b.code).toBe('auth_expired');
});

test('login-password gagal: body kosong', async ({ request }) => {
  const r = await request.post(`${WEB}/login-password`, { data: {} });
  expect(r.status()).toBe(400);
  expect(pesanDari(await baca(r))).toContain('Missing or invalid auth/password');
});

test('lookup: identifier ngawur (menunggu jawaban tim)', async ({ request }) => {
  const r = await request.post(`${WEB}/lookup`, { data: { channel: 'sms', identifier: 'abc' } });
  const b = await baca(r);
  console.log('status:', r.status(), '| ok:', b.ok, '| registered:', b.registered, '| field:', Object.keys(b));
  expect(r.status()).toBeLessThan(500);
});