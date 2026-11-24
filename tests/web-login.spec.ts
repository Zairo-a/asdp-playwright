import { test, expect } from '@playwright/test';

const WEB = 'https://dev.asdpv2.garudakreasi.com/api/auth';

test('web login berhasil: lookup lalu login-password', async ({ request }) => {
  const lookup = await request.post(`${WEB}/lookup`, {
    data: { channel: 'sms', identifier: process.env.ASDP_WEB_IDENTIFIER },
  });
  expect(lookup.status()).toBe(200);
  const l = await lookup.json();
  expect(l.ok).toBe(true);
  expect(l.registered).toBe(true);
  expect(l.auth).toBeTruthy();
  expect(l.randomUserId).toBeTruthy();

  const login = await request.post(`${WEB}/login-password`, {
    data: { auth: l.auth, randomUserId: l.randomUserId, password: process.env.ASDP_WEB_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const p = await login.json();
  expect(p.ok).toBe(true);

  // Hanya nama cookie, bukan isinya
  const state = await request.storageState();
  console.log('Nama cookie sesudah login:', state.cookies.map((c) => c.name));
});