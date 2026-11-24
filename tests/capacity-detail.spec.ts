import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

function bentuk(v: any): string {
  if (Array.isArray(v)) return `array(${v.length})`;
  if (v && typeof v === 'object') return `objek{${Object.keys(v).join(', ')}}`;
  return `${typeof v}: ${JSON.stringify(v)?.slice(0, 60)}`;
}

async function baca(r: any) {
  try { return await r.json(); } catch { return {}; }
}

async function ambilSatuData(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const list = await (await request.get('cms/capacity/departures', {
    headers, params: { per_page: 1 },
  })).json();
  return { headers, row: list.result.rows[0] };
}

test('capacity detail: berhasil dan cocok dengan data di daftar', async ({ request }) => {
  const { headers, row } = await ambilSatuData(request);
  const r = await request.get(`cms/capacity/departures/${row.date}/${row.schedule.id}`, { headers });
  expect(r.status()).toBe(200);

  const b = await baca(r);
  expect(b.message).toBe('Success!');
  expect(b.result.key).toBe(row.key);
  expect(b.result.date).toBe(row.date);
  for (const f of ['schedule', 'route', 'vessel', 'capacity', 'summary', 'permissions']) {
    expect(b.result[f], `field ${f} harus ada`).toBeDefined();
  }
});

test('capacity detail: lihat bentuk isi (untuk langkah berikutnya)', async ({ request }) => {
  const { headers, row } = await ambilSatuData(request);
  const r = await request.get(`cms/capacity/departures/${row.date}/${row.schedule.id}`, { headers });
  const b = await baca(r);
  for (const f of ['schedule', 'route', 'status', 'is_active', 'sales', 'vessel', 'capacity', 'summary', 'has_overrides', 'pending_approval', 'warnings', 'permissions']) {
    console.log(`${f} ->`, bentuk(b.result?.[f]));
  }
  expect(r.status()).toBe(200);
});

test('capacity detail gagal: scheduleId tidak ada', async ({ request }) => {
  const { headers, row } = await ambilSatuData(request);
  const r = await request.get(`cms/capacity/departures/${row.date}/999999999`, { headers });
  expect(r.status()).toBe(404);
  expect((await baca(r)).result).toBeNull();
});

test('capacity detail gagal: format date salah', async ({ request }) => {
  const { headers } = await ambilSatuData(request);
  const r = await request.get('cms/capacity/departures/bukan-tanggal/1', { headers });
  expect(r.status()).toBe(404);
});

test('capacity detail gagal: tanpa token ditolak', async ({ request }) => {
  const r = await request.get('cms/capacity/departures/2026-11-02/1');
  expect(r.status()).toBe(401);
});