import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

// Keberangkatan uji khusus untuk test yang mengubah data
const TANGGAL = '2027-05-02';
const JADWAL = 1;
const BASE = `cms/capacity/departures/${TANGGAL}/${JADWAL}`;

const jeda = (ms: number) => new Promise((s) => setTimeout(s, ms));
const potong = (v: any, n = 240) => (JSON.stringify(v) ?? 'undefined').slice(0, n);

async function baca(r: any) {
  try { return await r.json(); } catch { return undefined; }
}

async function auth(request: APIRequestContext) {
  return { Authorization: `Bearer ${await getToken(request)}`, Accept: 'application/json' };
}

// GET boleh diulang kalau koneksi diputus server
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

async function detail(request: APIRequestContext, headers: Record<string, string>) {
  return (await baca(await ambil(request, BASE, headers)))?.result;
}

async function tampil(request: APIRequestContext, headers: Record<string, string>, resource: string) {
  return (await baca(await ambil(request, `${BASE}/allocations`, headers, { resource })))?.result;
}

// Permintaan yang mengubah data tidak pernah diulang otomatis
function ubah(request: APIRequestContext, headers: Record<string, string>, data: any) {
  return request.put(`${BASE}/allocations`, { headers, data });
}

function kembalikan(request: APIRequestContext, headers: Record<string, string>, resource: string) {
  return request.post(`${BASE}/allocations/reset`, { headers, data: { resource } });
}

async function syaratAwal(request: APIRequestContext, headers: Record<string, string>) {
  const d = await detail(request, headers);
  const alasan: string[] = [];
  if (d?.key !== `${TANGGAL}|${JADWAL}`) alasan.push(`key ${d?.key}`);
  if (d?.status !== 'open') alasan.push(`status ${d?.status}`);
  if (d?.has_overrides !== false) alasan.push(`has_overrides ${d?.has_overrides}`);
  if (d?.pending_approval !== null) alasan.push('ada pending_approval');
  if (d?.permissions?.update !== true) alasan.push('akun tidak punya izin update');
  if ((d?.summary?.pax?.sold ?? 1) !== 0) alasan.push('sudah ada penjualan');
  if ((d?.summary?.pax?.held ?? 1) !== 0) alasan.push('ada kursi yang ditahan');
  return alasan;
}

test.describe('capacity simpan (MENGUBAH DATA)', () => {
  test.skip(process.env.ALLOW_WRITE !== '1', 'Dilewati. Untuk menjalankan, set ALLOW_WRITE=1');
  test.describe.configure({ mode: 'serial', retries: 0 });

  const awal: any = {};
  const perluAwal = () => test.skip(!awal.pax, 'Syarat awal tidak terpenuhi, jadi test ini dilewati');

  test('syarat awal terpenuhi dan catat keadaan awal', async ({ request }) => {
    const headers = await auth(request);
    const alasan = await syaratAwal(request, headers);
    console.log(`Keberangkatan uji ${TANGGAL}|${JADWAL}: ${alasan.length ? 'TIDAK AMAN (' + alasan.join(', ') + ')' : 'aman dipakai'}`);
    test.skip(alasan.length > 0, `Syarat awal tidak terpenuhi: ${alasan.join(', ')}`);

    awal.pax = await tampil(request, headers, 'pax');
    awal.vehicle = await tampil(request, headers, 'vehicle');
    awal.goods = await tampil(request, headers, 'goods');
    expect(awal.pax).toBeDefined();
    expect(awal.vehicle).toBeDefined();
    expect(awal.goods).toBeDefined();
  });

  test('isi yang salah ditolak 422 dan tidak menyimpan apa pun', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const sel = (ubahan: any) => ({
      resource: 'pax',
      cells: [{ channel_group: 'mitra', class_id: 1, quota: 1, ...ubahan }],
    });

    const salah: [string, any][] = [
      ['tanpa resource', {}],
      ['resource ngawur', { resource: 'abc' }],
      ['cells bukan daftar', { resource: 'pax', cells: 'abc' }],
      ['channel_group 21 karakter', sel({ channel_group: 'x'.repeat(21) })],
      ['quota negatif', sel({ quota: -1 })],
      ['quota bukan angka', sel({ quota: 'abc' })],
      ['code 11 karakter', sel({ code: 'x'.repeat(11) })],
      ['quota_units negatif', sel({ quota_units: -1 })],
      ['golongan type ngawur', { resource: 'vehicle', golongan: [{ code: 'I', type: 'abc', quota_units: 1 }] }],
      ['golongan quota_units negatif', { resource: 'vehicle', golongan: [{ code: 'I', type: 'normal', quota_units: -1 }] }],
      ['golongan code 11 karakter', { resource: 'vehicle', golongan: [{ code: 'x'.repeat(11), type: 'normal', quota_units: 1 }] }],
      ['targets target negatif', { resource: 'goods', targets: [{ category_id: 1, target: -1 }] }],
    ];

    try {
      for (const [nama, data] of salah) {
        const r = await ubah(request, headers, data);
        const b = await baca(r);
        console.log(`[${nama}] status ${r.status()} | message: ${b?.message ?? '-'}`);
        expect.soft(r.status(), `status ${nama}`).toBe(422);
        await jeda(300);
      }
      const d = await detail(request, headers);
      expect(d.has_overrides, 'tidak boleh ada override yang tersimpan').toBe(false);
    } finally {
      await kembalikan(request, headers, 'all');
    }
  });

  test('percobaan pax: bentuk isi yang diterima (selalu dikembalikan lewat reset)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);

    const varian: [string, any][] = [
      ['a: channel_group, class_id, quota', { channel_group: 'mitra', class_id: 1, quota: 1 }],
      ['b: ditambah code', { channel_group: 'mitra', class_id: 1, quota: 1, code: 'EXP' }],
      ['c: ditambah quota_units', { channel_group: 'mitra', class_id: 1, quota: 1, code: 'EXP', quota_units: 1 }],
    ];

    for (const [nama, sel] of varian) {
      try {
        const r = await ubah(request, headers, { resource: 'pax', cells: [sel] });
        const b = await baca(r);
        console.log(`[${nama}] status ${r.status()} | message: ${b?.message ?? '-'} | result: ${potong(b?.result, 120)}`);

        const p = await tampil(request, headers, 'pax');
        const baris = (nama: string) => p.rows.find((x: any) => x.channel_group === nama);
        const exp = (nama: string) => baris(nama)?.cells.find((c: any) => c.class_id === 1);
        console.log(`   mitra EXP: ${potong(exp('mitra'))}`);
        console.log(`   retail EXP: ${potong(exp('retail'))}`);
        console.log(`   totals: ${potong(p.totals)} | has_override: ${(await detail(request, headers))?.has_overrides}`);
      } finally {
        const rr = await kembalikan(request, headers, 'pax');
        console.log(`   reset pax: status ${rr.status()}`);
        expect.soft(rr.status(), `reset setelah ${nama}`).toBe(200);
      }
      await jeda(300);
    }
  });

  test('reset: bisa diulang, dan isi yang salah ditolak', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);

    const r1 = await kembalikan(request, headers, 'pax');
    const r2 = await kembalikan(request, headers, 'pax');
    console.log(`reset pax dua kali berturut-turut: ${r1.status()} dan ${r2.status()}`);
    expect.soft(r1.status()).toBe(200);
    expect.soft(r2.status()).toBe(200);
    expect((await tampil(request, headers, 'pax')).rows).toEqual(awal.pax.rows);

    const ngawur = await kembalikan(request, headers, 'abc');
    expect(ngawur.status()).toBe(422);
    const tanpa = await request.post(`${BASE}/allocations/reset`, { headers, data: {} });
    expect(tanpa.status()).toBe(422);
  });

  test('tanpa token ditolak 401', async ({ request }) => {
    const put = await request.put(`${BASE}/allocations`, {
      data: { resource: 'goods', targets: [{ category_id: 1, target: -1 }] },
    });
    const post = await request.post(`${BASE}/allocations/reset`, { data: { resource: 'all' } });
    expect(put.status()).toBe(401);
    expect(post.status()).toBe(401);
  });

  test('reset: scheduleId tidak ada dan date salah (lihat balasan)', async ({ request }) => {
    const headers = await auth(request);
    const a = await request.post(`cms/capacity/departures/${TANGGAL}/999999999/allocations/reset`, {
      headers, data: { resource: 'pax' },
    });
    console.log(`[reset scheduleId tidak ada] status ${a.status()} | message: ${(await baca(a))?.message ?? '-'}`);
    const b = await request.post('cms/capacity/departures/bukan-tanggal/1/allocations/reset', {
      headers, data: { resource: 'pax' },
    });
    console.log(`[reset date salah] status ${b.status()} | message: ${(await baca(b))?.message ?? '-'}`);
  });

  test('akhir: keadaan kembali persis seperti awal', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const d = await detail(request, headers);
    expect(d.has_overrides).toBe(false);
    expect(await tampil(request, headers, 'pax')).toEqual(awal.pax);
    expect(await tampil(request, headers, 'vehicle')).toEqual(awal.vehicle);
    expect(await tampil(request, headers, 'goods')).toEqual(awal.goods);
  });
});