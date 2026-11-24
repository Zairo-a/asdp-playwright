import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('capacity: daftar departures', async ({ request }) => {
  const token = await login(request);

  const r = await request.get('cms/capacity/departures', {
    headers: { Authorization: `Bearer ${token}` },
    params: { per_page: 5 },
  });

  const body = await r.json();
  const hasil = body.result;

  console.log('Status HTTP:', r.status());
  console.log('Tipe result:', Array.isArray(hasil) ? 'array' : typeof hasil);

  if (hasil && typeof hasil === 'object') {
    for (const [nama, nilai] of Object.entries(hasil)) {
      if (Array.isArray(nilai)) {
        console.log(`- ${nama}: array berisi ${nilai.length} data`);
        if (nilai.length > 0 && typeof nilai[0] === 'object') {
          console.log(`  field di satu data: ${Object.keys(nilai[0]).join(', ')}`);
        }
      } else if (nilai && typeof nilai === 'object') {
        console.log(`- ${nama}: objek dengan field ${Object.keys(nilai).join(', ')}`);
      } else {
        console.log(`- ${nama}: ${nilai}`);
      }
    }
  }

  expect(r.status()).toBe(200);
});