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

// Query string, termasuk state[] yang boleh berulang
function qs(obj: Record<string, any> = {}, state: string[] = []) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) p.append(k, String(v));
  for (const s of state) p.append('state[]', s);
  return p;
}

async function satuKeberangkatan(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const b = await (await ambil(request, 'cms/capacity/departures', headers, {
    date: tanggal(1), per_page: 1,
  })).json();
  return { headers, row: b.result.rows[0] };
}

const jalur = (date: string, id: number | string) => `cms/capacity/departures/${date}/${id}/transactions`;

test('transaksi: bentuk balasan benar', async ({ request }) => {
  const { headers, row } = await satuKeberangkatan(request);
  const r = await ambil(request, jalur(row.date, row.schedule.id), headers);
  expect(r.status()).toBe(200);

  const b = await baca(r);
  expect(b.message).toBe('Success!');
  expect(Array.isArray(b.result.rows)).toBe(true);
  for (const f of ['page', 'per_page', 'total', 'last_page']) {
    expect(typeof b.result.pagination[f], `pagination.${f} harus angka`).toBe('number');
  }
});

test('transaksi: halaman konsisten', async ({ request }) => {
  const { headers, row } = await satuKeberangkatan(request);
  const r = await ambil(request, jalur(row.date, row.schedule.id), headers, qs({ per_page: 1 }));
  expect(r.status()).toBe(200);

  const p = (await baca(r)).result.pagination;
  const rows = (await baca(r)).result.rows;
  expect(p.per_page).toBe(1);
  expect(rows.length).toBeLessThanOrEqual(1);
  expect(p.total).toBeGreaterThanOrEqual(rows.length);
});

test('transaksi: semua filter yang sah diterima', async ({ request }) => {
  const { headers, row } = await satuKeberangkatan(request);
  const url = jalur(row.date, row.schedule.id);

  const semua = (await baca(await ambil(request, url, headers))).result.pagination.total;

  const variasi: [string, Record<string, any>, string[]][] = [
    ['source online', { source: 'online' }, []],
    ['source offline', { source: 'offline' }, []],
    ['state held', {}, ['held']],
    ['state sold', {}, ['sold']],
    ['state released', {}, ['released']],
    ['state expired', {}, ['expired']],
    ['state refunded', {}, ['refunded']],
    ['state rescheduled', {}, ['rescheduled']],
    ['state sold + held', {}, ['sold', 'held']],
    ['q kode yang tidak ada', { q: 'TIDAK-ADA-XYZ' }, []],
  ];

  for (const [nama, params, state] of variasi) {
    const r = await ambil(request, url, headers, qs(params, state));
    expect.soft(r.status(), `status ${nama}`).toBe(200);
    const total = (await baca(r)).result?.pagination?.total;
    expect.soft(total, `total ${nama} tidak melebihi total tanpa filter`).toBeLessThanOrEqual(semua);
    await jeda(300);
  }
});

test('transaksi: online + offline = total (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const { headers, row } = await satuKeberangkatan(request);
  const url = jalur(row.date, row.schedule.id);
  const total = async (params: Record<string, any>) =>
    (await baca(await ambil(request, url, headers, qs(params)))).result.pagination.total;

  const semua = await total({});
  expect(await total({ source: 'online' }) + await total({ source: 'offline' })).toBe(semua);
});

const negatif: [string, Record<string, any>, string[], string][] = [
  ['per_page 0', { per_page: 0 }, [], 'at least 1'],
  ['per_page 101', { per_page: 101 }, [], 'not be greater than 100'],
  ['page 0', { page: 0 }, [], 'at least 1'],
  ['source ngawur', { source: 'abc' }, [], 'selected source is invalid'],
  ['state ngawur', {}, ['abc'], 'is invalid'],
  ['q 51 karakter', { q: 'x'.repeat(51) }, [], 'not be greater than 50'],
  ['bucket 41 karakter', { bucket: 'x'.repeat(41) }, [], 'not be greater than 40'],
  ['channel 11 karakter', { channel: 'x'.repeat(11) }, [], 'not be greater than 10'],
];

for (const [nama, params, state, pesan] of negatif) {
  test(`transaksi gagal: ${nama}`, async ({ request }) => {
    const { headers, row } = await satuKeberangkatan(request);
    const r = await ambil(request, jalur(row.date, row.schedule.id), headers, qs(params, state));
    expect(r.status()).toBe(422);
    expect(String((await baca(r)).message)).toContain(pesan);
  });
}

test('transaksi gagal: scheduleId tidak ada', async ({ request }) => {
  const { headers, row } = await satuKeberangkatan(request);
  const r = await ambil(request, jalur(row.date, 999999999), headers);
  expect(r.status()).toBe(404);
});

test('transaksi gagal: format date salah', async ({ request }) => {
  const { headers } = await satuKeberangkatan(request);
  const r = await ambil(request, jalur('bukan-tanggal', 1), headers);
  expect(r.status()).toBe(404);
});

test('transaksi gagal: tanpa token ditolak', async ({ request }) => {
  const r = await request.get(jalur(tanggal(1), 1));
  expect(r.status()).toBe(401);
});