import { test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

function tanggal(offsetHari: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetHari);
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

const jeda = (ms: number) => new Promise((s) => setTimeout(s, ms));

async function ambil(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
  params?: any,
) {
  let galat: any;
  for (let i = 0; i < 3; i++) {
    try {
      return await request.get(url, { headers, params });
    } catch (e) {
      galat = e;
      await jeda(1000);
    }
  }
  throw galat;
}

async function baca(r: any) {
  try { return await r.json(); } catch { return undefined; }
}

test('tanggal jauh: keberangkatan apa yang ada (hanya membaca)', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };

  for (const offset of [7, 14, 21, 30, 45, 60, 90, 120, 180]) {
    const tgl = tanggal(offset);
    const b = await baca(await ambil(request, 'cms/capacity/departures', headers, { date: tgl, per_page: 1 }));
    const total = b?.result?.pagination?.total ?? '-';
    const row = b?.result?.rows?.[0];
    const contoh = row ? `${row.key} | status ${row.status} | terjual ${row.sold} | sisa ${row.remaining}` : '-';
    console.log(`${tgl} (+${offset} hari) | total ${total} | contoh: ${contoh}`);
    await jeda(300);
  }
});