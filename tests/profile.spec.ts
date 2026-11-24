import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('token bisa dipakai: GET profile', async ({ request }) => {
  const token = await login(request);

  const r = await request.get('auth/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log('Status HTTP:', r.status());
  console.log('message:', (await r.json()).message);
  expect(r.status()).toBe(200);
});