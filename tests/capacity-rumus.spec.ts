import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

async function ambil(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
  params?: Record<string, any>,
) {
  let galat: any;
  for (let i = 0; i < 3; i++) {
    try {
      return await request.get(url, { headers, params });
    } catch (e) {
      galat = e;
      await new Promise((s) => setTimeout(s, 1000));
    }
  }
  throw galat;
}

test('capacity: rumus kuota berlaku di semua data daftar', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };

  const pola: Record<string, number> = {};
  let diperiksa = 0;
  let halaman = 1;
  let terakhir = 1;

  do {
    const r = await ambil(request, 'cms/capacity/departures', headers, { page: halaman, per_page: 100 });
    expect(r.status()).toBe(200);
    const b = await r.json();
    terakhir = b.result.pagination.last_page;

    for (const row of b.result.rows) {
      const q = row.quota;
      const dugaan = Math.round((q.physical * q.pct) / 100);
      expect.soft(q.total, `kuota ${row.key}: ${q.physical} x ${q.pct}%`).toBe(dugaan);

      const kunci = `fisik ${q.physical} | pct ${q.pct} | total ${q.total} | sumber ${q.pct_source}`;
      pola[kunci] = (pola[kunci] ?? 0) + 1;
      diperiksa++;
    }
    halaman++;
    await new Promise((s) => setTimeout(s, 300));
  } while (halaman <= terakhir);

  console.log(`Data diperiksa: ${diperiksa}`);
  for (const [k, n] of Object.entries(pola)) console.log(`   ${n}x ${k}`);
});