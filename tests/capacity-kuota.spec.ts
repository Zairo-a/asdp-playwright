import { test, expect } from '@playwright/test';
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
  try { return await r.json(); } catch { return {}; }
}

function qs(obj: Record<string, any> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) p.append(k, String(v));
  return p;
}

const URL = 'cms/capacity/quota-increase';

async function siap(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const b = await (await ambil(request, 'cms/capacity/departures', headers, {
    date: tanggal(1), per_page: 1,
  })).json();
  return { headers, row: b.result.rows[0] };
}

const totalDari = (b: any) => b.result?.pagination?.total;

test('kuota naik: bentuk balasan benar', async ({ request }) => {
  const { headers } = await siap(request);
  const r = await ambil(request, URL, headers);
  expect(r.status()).toBe(200);

  const b = await baca(r);
  expect(b.message).toBe('Success!');
  expect(Array.isArray(b.result.rows)).toBe(true);
  for (const f of ['page', 'per_page', 'total', 'last_page']) {
    expect(typeof b.result.pagination[f], `pagination.${f} harus angka`).toBe('number');
  }
});

test('kuota naik: halaman konsisten', async ({ request }) => {
  const { headers } = await siap(request);
  const r = await ambil(request, URL, headers, qs({ per_page: 1 }));
  expect(r.status()).toBe(200);

  const b = await baca(r);
  expect(b.result.pagination.per_page).toBe(1);
  expect(b.result.rows.length).toBeLessThanOrEqual(1);
  expect(b.result.pagination.total).toBeGreaterThanOrEqual(b.result.rows.length);
});

test('kuota naik: semua filter yang sah diterima', async ({ request }) => {
  const { headers, row } = await siap(request);
  const semua = totalDari(await baca(await ambil(request, URL, headers)));

  const variasi: [string, Record<string, any>][] = [
    ['status pending', { status: 'pending' }],
    ['status applied', { status: 'applied' }],
    ['status failed', { status: 'failed' }],
    ['status rejected', { status: 'rejected' }],
    ['date besok', { date: tanggal(1) }],
    ['date hari ini', { date: tanggal(0) }],
    ['schedule_id keberangkatan besok', { schedule_id: row.schedule.id }],
  ];
  if (row.route?.id) variasi.push(['route_id keberangkatan besok', { route_id: row.route.id }]);

  for (const [nama, params] of variasi) {
    const r = await ambil(request, URL, headers, qs(params));
    expect.soft(r.status(), `status ${nama}`).toBe(200);
    expect.soft(totalDari(await baca(r)), `total ${nama} tidak melebihi total tanpa filter`)
      .toBeLessThanOrEqual(semua);
    await jeda(300);
  }
});

test('kuota naik: schedule_id yang tidak ada dibalas 200 kosong', async ({ request }) => {
  const { headers } = await siap(request);
  const r = await ambil(request, URL, headers, qs({ schedule_id: 999999999 }));
  expect(r.status()).toBe(200);
  const b = await baca(r);
  expect(b.result.rows.length).toBe(0);
  expect(totalDari(b)).toBe(0);
});

test('kuota naik: pending_approval di detail cocok dengan daftar pending', async ({ request }) => {
  const { headers, row } = await siap(request);
  const d = (await (await ambil(request, `cms/capacity/departures/${row.date}/${row.schedule.id}`, headers)).json()).result;
  const b = await baca(await ambil(request, URL, headers, qs({ status: 'pending', schedule_id: row.schedule.id })));

  if (d.pending_approval === null) {
    expect(totalDari(b), 'detail tidak punya pending, daftar juga harus kosong').toBe(0);
  } else {
    expect(totalDari(b), 'detail punya pending, daftar harus berisi').toBeGreaterThan(0);
  }
});

const negatif: [string, Record<string, any>, string][] = [
  ['per_page 0', { per_page: 0 }, 'at least 1'],
  ['per_page 101', { per_page: 101 }, 'not be greater than 100'],
  ['page 0', { page: 0 }, 'at least 1'],
  ['status ngawur', { status: 'abc' }, 'selected status is invalid'],
  ['date format salah', { date: 'bukan-tanggal' }, 'Y-m-d'],
  ['route_id bukan angka', { route_id: 'abc' }, 'must be an integer'],
  ['schedule_id bukan angka', { schedule_id: 'abc' }, 'must be an integer'],
];

for (const [nama, params, pesan] of negatif) {
  test(`kuota naik gagal: ${nama}`, async ({ request }) => {
    const { headers } = await siap(request);
    const r = await ambil(request, URL, headers, qs(params));
    expect(r.status()).toBe(422);
    expect(String((await baca(r)).message)).toContain(pesan);
  });
}

test('kuota naik gagal: tanpa token ditolak', async ({ request }) => {
  const r = await request.get(URL);
  expect(r.status()).toBe(401);
});