import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('daftar pelabuhan tujuan dari Adonara', async ({ request }) => {
  const token = await login(request);

  const r = await request.get('cms/reservation/outlet-dropoff', {
    headers: { Authorization: `Bearer ${token}` },
    params: { pickup_outlet_id: 1 },
  });

  const body = await r.json();
  console.log('Status HTTP:', r.status());
  console.log('Jumlah pelabuhan tujuan:', body.result?.length);

  for (const o of (body.result ?? []).slice(0, 30)) {
    console.log(`value=${o.value} | label=${o.label} | group=${o.group}`);
  }

  expect(r.status()).toBe(200);
});