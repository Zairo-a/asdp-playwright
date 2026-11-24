import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

function tanggal(offsetHari: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetHari);
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

// GET yang diulang sampai 3 kali kalau koneksi diputus server
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

const jeda = (ms: number) => new Promise((s) => setTimeout(s, ms));

test('capacity: daftar dan detail menunjukkan angka yang sama', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const list = await (await ambil(request, 'cms/capacity/departures', headers, { per_page: 10 })).json();

  for (const row of list.result.rows) {
    const r = await ambil(request, `cms/capacity/departures/${row.date}/${row.schedule.id}`, headers);
    expect.soft(r.status(), `detail ${row.key}`).toBe(200);
    const x = (await r.json()).result;

    expect.soft(x.key, `key ${row.key}`).toBe(row.key);
    expect.soft(x.status, `status ${row.key}`).toBe(row.status);
    expect.soft(x.summary.quota.total, `kuota total ${row.key}`).toBe(row.quota.total);
    expect.soft(x.summary.quota.allocated, `allocated ${row.key}`).toBe(row.allocated);
    expect.soft(x.summary.quota.remaining, `remaining ${row.key}`).toBe(row.remaining);
    expect.soft(x.summary.pax.sold, `sold ${row.key}`).toBe(row.sold);
    expect.soft(x.capacity.pax_quota, `pax_quota ${row.key}`).toBe(row.quota.total);
    expect.soft(row.remaining, `remaining dalam batas ${row.key}`).toBeGreaterThanOrEqual(0);
    expect.soft(row.remaining, `remaining tidak melebihi total ${row.key}`).toBeLessThanOrEqual(row.quota.total);
    await jeda(300);
  }
});

test('capacity: dugaan rumus kuota (hasil gagal belum tentu bug)', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const list = await (await ambil(request, 'cms/capacity/departures', headers, { per_page: 10 })).json();

  for (const row of list.result.rows) {
    const x = (await (await ambil(
      request, `cms/capacity/departures/${row.date}/${row.schedule.id}`, headers,
    )).json()).result;
    const c = x.capacity;
    const sf = c.safety_formula;

    expect.soft(c.physical_pax, `fisik = min(skkp - crew, lifejacket) ${row.key}`)
      .toBe(Math.min(sf.skkp - sf.crew, sf.lifejacket));
    expect.soft(c.pax_quota, `kuota = fisik x pct ${row.key}`)
      .toBe(Math.round((c.physical_pax * c.pct) / 100));
    await jeda(300);
  }
});

test('capacity: peringatan di keberangkatan yang masih open', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const tgl = tanggal(1);
  const list = await (await ambil(request, 'cms/capacity/departures', headers, { date: tgl, per_page: 3 })).json();

  for (const row of list.result.rows) {
    const x = (await (await ambil(
      request, `cms/capacity/departures/${row.date}/${row.schedule.id}`, headers,
    )).json()).result;
    console.log(`${row.key} | status ${x.status} | warnings ${JSON.stringify(x.warnings)}`);
    await jeda(300);
  }
});