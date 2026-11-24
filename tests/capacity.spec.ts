import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

async function panggil(request: APIRequestContext, params: Record<string, any> = {}, pakaiToken = true) {
  const headers: Record<string, string> = {};
  if (pakaiToken) headers.Authorization = `Bearer ${await getToken(request)}`;
  return request.get('cms/capacity/departures', { headers, params });
}

test('capacity: default berhasil dan bentuk datanya benar', async ({ request }) => {
  const r = await panggil(request);
  expect(r.status()).toBe(200);

  const body = await r.json();
  expect(body.message).toBe('Success!');
  expect(Array.isArray(body.result.rows)).toBe(true);
  expect(body.result.rows.length).toBeLessThanOrEqual(25);
  expect(body.result.pagination.total).toBeGreaterThan(0);

  for (const x of body.result.rows) {
    expect(typeof x.sold).toBe('number');
    expect(typeof x.remaining).toBe('number');
    expect(x.remaining_pct).toBeGreaterThanOrEqual(0);
    expect(x.remaining_pct).toBeLessThanOrEqual(100);
  }
});

test('capacity: per_page 2 hanya mengembalikan 2 data', async ({ request }) => {
  const body = await (await panggil(request, { per_page: 2 })).json();
  expect(body.result.rows.length).toBe(2);
  expect(body.result.pagination.per_page).toBe(2);
});

test('capacity: page 2 benar-benar halaman 2', async ({ request }) => {
  const body = await (await panggil(request, { page: 2, per_page: 2 })).json();
  expect(body.result.pagination.page).toBe(2);
});

test('capacity: filter date hanya mengembalikan tanggal itu', async ({ request }) => {
  const awal = await (await panggil(request, { per_page: 1 })).json();
  const tgl = awal.result.rows[0].date;

  const body = await (await panggil(request, { date: tgl })).json();
  expect(body.result.rows.length).toBeGreaterThan(0);
  for (const x of body.result.rows) expect(x.date).toBe(tgl);
});

test('capacity: mode seat dan pax berhasil', async ({ request }) => {
  for (const mode of ['seat', 'pax']) {
    const r = await panggil(request, { mode });
    expect(r.status()).toBe(200);
  }
});

const negatif: [string, Record<string, any>, string][] = [
  ['per_page 0', { per_page: 0 }, 'at least 1'],
  ['per_page 101', { per_page: 101 }, 'greater than 100'],
  ['page 0', { page: 0 }, 'at least 1'],
  ['mode ngawur', { mode: 'abc' }, 'mode is invalid'],
  ['date format salah', { date: 'bukan-tanggal' }, 'Y-m-d'],
  ['date_from lebih besar dari date_to', { date_from: '2026-12-31', date_to: '2026-01-01' }, 'after or equal'],
];

for (const [nama, params, pesan] of negatif) {
  test(`capacity gagal: ${nama}`, async ({ request }) => {
    const r = await panggil(request, params);
    expect(r.status()).toBe(422);
    expect((await r.json()).message).toContain(pesan);
  });
}

test('capacity gagal: tanpa token ditolak', async ({ request }) => {
  const r = await panggil(request, {}, false);
  expect(r.status()).toBe(401);
});