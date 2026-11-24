import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('daftar pelabuhan asal', async ({ request }) => {
  const token = await login(request);

  const r = await request.get('cms/reservation/outlet-pickup', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await r.json();
  console.log('Status HTTP:', r.status());
  console.log('Jumlah pelabuhan:', body.result?.length);

  for (const o of (body.result ?? []).slice(0, 30)) {
    console.log(`value=${o.value} | label=${o.label} | group=${o.group}`);
  }

  expect(r.status()).toBe(200);
});