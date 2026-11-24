import { test, expect } from '@playwright/test';

test('server dev bisa dijangkau', async ({ request }) => {
  const r = await request.get('internal/test');
  console.log('Status:', r.status());
  console.log('Isi balasan:', await r.text());
  expect(r.status()).toBeLessThan(500);
});