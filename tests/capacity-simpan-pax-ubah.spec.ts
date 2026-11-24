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

// Kelas: 1 EXP, 2 REG, 3 BIS, 4 BSN989, 5 VIP, 6 TES
const sel = (channel_group: string, class_id: number, quota: number, lainnya: object = {}) =>
  ({ channel_group, class_id, quota, ...lainnya });

const cariSel = (p: any, saluran: string, kelas: number) =>
  p.rows.find((x: any) => x.channel_group === saluran)?.cells.find((c: any) => c.class_id === kelas);

function ringkasan(p: any) {
  return p.classes.map((c: any) => {
    const q = (s: string) => cariSel(p, s, c.id)?.quota;
    return `${c.code}[retail ${q('retail')} mitra ${q('mitra')} korporasi ${q('korporasi')}]`;
  }).join(' ');
}

// Pemeriksaan kewajaran untuk setiap perubahan yang diterima server
function sehat(p: any, nama: string) {
  for (const c of p.classes) {
    expect.soft(cariSel(p, 'retail', c.id)?.quota, `retail ${c.code} tidak boleh negatif (${nama})`)
      .toBeGreaterThanOrEqual(0);
  }
  expect.soft(p.totals.matches_quota, `matches_quota (${nama})`).toBe(true);
}

// Simpan, baca hasilnya, periksa, lalu SELALU reset
async function coba(
  request: APIRequestContext,
  headers: Record<string, string>,
  nama: string,
  cells: any[],
  periksa?: (p: any, d: any, r: any, b: any) => void,
) {
  let r: any;
  let b: any;
  let p: any;
  let d: any;
  try {
    r = await ubah(request, headers, { resource: 'pax', cells });
    b = await baca(r);
    p = await tampil(request, headers, 'pax');
    d = await detail(request, headers);
    console.log(`[${nama}] status ${r.status()} | message: ${b?.message ?? '-'} | has_overrides ${d?.has_overrides}`);
    if (r.status() === 200) console.log(`   ${ringkasan(p)} | totals ${potong(p.totals, 90)}`);
    expect.soft(r.status(), `${nama}: tidak boleh error server`).toBeLessThan(500);
    if (periksa) periksa(p, d, r, b);
  } finally {
    const rr = await kembalikan(request, headers, 'pax');
    expect.soft(rr.status(), `reset setelah ${nama}`).toBe(200);
  }
  return { r, b, p, d };
}

test.describe('capacity simpan pax (MENGUBAH DATA)', () => {
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
  });

  test('retail menyesuaikan otomatis saat mitra diisi', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r } = await coba(request, headers, 'mitra EXP 1', [sel('mitra', 1, 1)], (p, d) => {
      const kelas = p.classes.find((c: any) => c.id === 1);
      expect.soft(cariSel(p, 'mitra', 1)?.quota, 'mitra EXP').toBe(1);
      expect.soft(cariSel(p, 'mitra', 1)?.source, 'sumber mitra EXP').toBe('override');
      expect.soft(cariSel(p, 'retail', 1)?.quota, 'retail EXP = kuota kelas - mitra').toBe(kelas.quota - 1);
      expect.soft(p.totals.quota, 'total kuota tetap').toBe(awal.pax.totals.quota);
      expect.soft(p.mode, 'mode berubah menjadi override').toBe('override');
      expect.soft(d.has_overrides, 'has_overrides menjadi true').toBe(true);
      sehat(p, 'mitra EXP 1');
    });
    expect(r.status()).toBe(200);
  });

  test('beberapa sel sekaligus: retail = kuota kelas - mitra - korporasi', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r } = await coba(
      request, headers, 'empat sel',
      [sel('mitra', 1, 1), sel('korporasi', 2, 2), sel('mitra', 3, 1), sel('korporasi', 5, 1)],
      (p) => {
        for (const c of p.classes) {
          const m = cariSel(p, 'mitra', c.id)?.quota ?? 0;
          const k = cariSel(p, 'korporasi', c.id)?.quota ?? 0;
          expect.soft(cariSel(p, 'retail', c.id)?.quota, `retail ${c.code}`).toBe(c.quota - m - k);
        }
        expect.soft(cariSel(p, 'mitra', 1)?.quota).toBe(1);
        expect.soft(cariSel(p, 'korporasi', 2)?.quota).toBe(2);
        expect.soft(cariSel(p, 'mitra', 3)?.quota).toBe(1);
        expect.soft(cariSel(p, 'korporasi', 5)?.quota).toBe(1);
        expect.soft(p.totals.quota, 'total kuota tetap').toBe(awal.pax.totals.quota);
        sehat(p, 'empat sel');
      },
    );
    expect(r.status()).toBe(200);
  });

  test('menyimpan nilai default tidak membuat override (sesuai dokumentasi)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    await coba(request, headers, 'mitra EXP 0 (sama dengan default)', [sel('mitra', 1, 0)], (p, d) => {
      expect.soft(d.has_overrides, 'nilai yang sama dengan default tidak disimpan').toBe(false);
    });
  });

  test('menyimpan dua kali memberi hasil yang sama', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    try {
      const a = await ubah(request, headers, { resource: 'pax', cells: [sel('mitra', 1, 1)] });
      const p1 = await tampil(request, headers, 'pax');
      const b = await ubah(request, headers, { resource: 'pax', cells: [sel('mitra', 1, 1)] });
      const p2 = await tampil(request, headers, 'pax');
      console.log(`simpan dua kali: ${a.status()} dan ${b.status()}`);
      expect.soft(a.status()).toBe(200);
      expect.soft(b.status()).toBe(200);
      expect(p2).toEqual(p1);
    } finally {
      const rr = await kembalikan(request, headers, 'pax');
      expect.soft(rr.status(), 'reset').toBe(200);
    }
  });

  test('menyimpan menggantikan seluruh override sebelumnya (Replaces)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    try {
      await ubah(request, headers, { resource: 'pax', cells: [sel('mitra', 1, 1), sel('korporasi', 2, 2)] });
      const r = await ubah(request, headers, { resource: 'pax', cells: [sel('mitra', 3, 1)] });
      const p = await tampil(request, headers, 'pax');
      console.log(`[replaces] status ${r.status()} | ${ringkasan(p)}`);
      expect.soft(r.status()).toBe(200);
      expect.soft(cariSel(p, 'mitra', 3)?.quota, 'mitra BIS tersimpan').toBe(1);
      expect.soft(cariSel(p, 'mitra', 1)?.quota, 'mitra EXP dari simpan pertama hilang').toBe(0);
      expect.soft(cariSel(p, 'korporasi', 2)?.quota, 'korporasi REG dari simpan pertama hilang').toBe(0);
      sehat(p, 'replaces');
    } finally {
      const rr = await kembalikan(request, headers, 'pax');
      expect.soft(rr.status(), 'reset').toBe(200);
    }
  });

  test('cells kosong menghapus semua override pax', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    try {
      await ubah(request, headers, { resource: 'pax', cells: [sel('mitra', 1, 1)] });
      expect((await detail(request, headers)).has_overrides, 'setelah simpan').toBe(true);

      const r = await ubah(request, headers, { resource: 'pax', cells: [] });
      expect(r.status()).toBe(200);
      expect((await detail(request, headers)).has_overrides, 'setelah cells kosong').toBe(false);
      expect((await tampil(request, headers, 'pax')).rows).toEqual(awal.pax.rows);
    } finally {
      const rr = await kembalikan(request, headers, 'pax');
      expect.soft(rr.status(), 'reset').toBe(200);
    }
  });

  test('mitra sama dengan seluruh kuota kelas diterima, retail menjadi 0', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r } = await coba(request, headers, 'mitra EXP 2', [sel('mitra', 1, 2)], (p) => {
      expect.soft(cariSel(p, 'mitra', 1)?.quota, 'mitra EXP').toBe(2);
      expect.soft(cariSel(p, 'retail', 1)?.quota, 'retail EXP').toBe(0);
      sehat(p, 'mitra EXP 2');
    });
    expect(r.status()).toBe(200);
  });

  const melebihi: [string, any[]][] = [
    ['mitra EXP 3 (kuota kelas 2)', [sel('mitra', 1, 3)]],
    ['mitra 1 + korporasi 2 di EXP', [sel('mitra', 1, 1), sel('korporasi', 1, 2)]],
    ['mitra EXP 999999', [sel('mitra', 1, 999999)]],
    ['sel ganda mitra EXP 1 lalu 2 (dijumlahkan)', [sel('mitra', 1, 1), sel('mitra', 1, 2)]],
  ];

  for (const [nama, cells] of melebihi) {
    test(`pax ditolak karena melebihi kuota: ${nama}`, async ({ request }) => {
      perluAwal();
      const headers = await auth(request);
      const { r, b, d } = await coba(request, headers, nama, cells);
      expect(r.status()).toBe(422);
      expect(String(b?.message)).toContain('FCAP-ALLOCATION-EXCEEDS-QUOTA');
      expect(d.has_overrides, 'tidak boleh ada yang tersimpan').toBe(false);
    });
  }

  const ditolak: [string, any[], string][] = [
    ['saluran blok (hanya baca)', [sel('blok', 1, 1)], 'FCAP-BLOCK-READONLY'],
    ['saluran retail (dihitung otomatis)', [sel('retail', 1, 1)], 'VALIDATION-ERROR'],
    ['saluran tidak dikenal', [sel('abc', 1, 1)], 'VALIDATION-ERROR'],
    ['class_id tidak ada', [sel('mitra', 999, 1)], 'VALIDATION-ERROR'],
  ];

  for (const [nama, cells, kode] of ditolak) {
    test(`pax ditolak: ${nama}`, async ({ request }) => {
      perluAwal();
      const headers = await auth(request);
      const { r, b, d } = await coba(request, headers, nama, cells);
      expect(r.status()).toBe(422);
      expect(String(b?.message)).toContain(kode);
      expect(d.has_overrides, 'tidak boleh ada yang tersimpan').toBe(false);
    });
  }

  test('perilaku teramati: quota_units diabaikan untuk pax', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r } = await coba(request, headers, 'quota 1 tapi quota_units 3', [sel('mitra', 1, 1, { quota_units: 3 })], (p) => {
      expect.soft(cariSel(p, 'mitra', 1)?.quota, 'yang dipakai adalah quota, bukan quota_units').toBe(1);
      sehat(p, 'quota_units');
    });
    expect(r.status()).toBe(200);
  });

  test('perilaku teramati: code tidak dicocokkan dengan class_id', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r } = await coba(request, headers, 'code REG untuk kelas 1 (EXP)', [sel('mitra', 1, 1, { code: 'REG' })], (p) => {
      expect.soft(cariSel(p, 'mitra', 1)?.quota, 'yang dipakai adalah class_id (EXP)').toBe(1);
      expect.soft(cariSel(p, 'mitra', 2)?.quota, 'kelas REG tidak terpengaruh').toBe(0);
      sehat(p, 'code tidak cocok');
    });
    expect(r.status()).toBe(200);
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