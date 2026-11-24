import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

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

const jalur = (id: string | number) => `cms/capacity/quota-increase/${id}/attachment`;

// id yang cocok dengan pola alamat tapi tidak ada datanya
const idTidakAda: [string, string | number][] = [
  ['id 1', 1],
  ['id 2', 2],
  ['id 999999999', 999999999],
  ['id 0', 0],
];

for (const [nama, id] of idTidakAda) {
  test(`bukti gagal: ${nama} tidak ada, dibalas 404`, async ({ request }) => {
    const headers = { Authorization: `Bearer ${await getToken(request)}` };
    const r = await ambil(request, jalur(id), headers);
    expect(r.status()).toBe(404);
    const b = await baca(r);
    expect(b, 'balasan 404 harus JSON').toBeDefined();
    expect(typeof b.message).toBe('string');
  });
}

// id yang bentuknya tidak cocok dengan alamat
const idAneh: [string, string][] = [
  ['id negatif', '-1'],
  ['id huruf', 'abc'],
  ['id desimal', '1.5'],
];

for (const [nama, id] of idAneh) {
  test(`bukti gagal: ${nama} dibalas 404 dan bukan error server`, async ({ request }) => {
    const headers = { Authorization: `Bearer ${await getToken(request)}` };
    const r = await ambil(request, jalur(id), headers);
    expect(r.status()).toBe(404);
  });
}

test('bukti: id nyata dari daftar permintaan (dilewati kalau daftar kosong)', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const daftar = await baca(await ambil(request, 'cms/capacity/quota-increase', headers, { per_page: 5 }));
  const rows = daftar?.result?.rows ?? [];
  test.skip(rows.length === 0, 'Belum ada permintaan kenaikan kuota di dev, jadi belum ada id nyata');

  for (const x of rows.slice(0, 3)) {
    const r = await ambil(request, jalur(x.id), headers);
    const tipe = r.headers()['content-type'] ?? '-';
    const ukuran = (await r.body()).length;
    // Hanya status, jenis berkas, dan ukuran. Isi berkas tidak dicetak.
    console.log(`[id nyata ${x.id}] status ${r.status()} | tipe ${tipe} | ukuran ${ukuran} byte`);
    expect.soft([200, 404], `id nyata ${x.id}: 200 kalau ada lampiran, 404 kalau tidak`).toContain(r.status());
    await jeda(300);
  }
});

test('bukti gagal: tanpa token ditolak', async ({ request }) => {
  const r = await request.get(jalur(1));
  expect(r.status()).toBe(401);
});

test('bukti gagal: token ngawur ditolak', async ({ request }) => {
  const r = await request.get(jalur(1), { headers: { Authorization: 'Bearer token-ngawur-123' } });
  expect(r.status()).toBe(401);
});