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
  if ((d?.summary?.pax?.sold ?? 1) !== 0) alasan.push('sudah ada penjualan penumpang');
  if ((d?.summary?.pax?.held ?? 1) !== 0) alasan.push('ada kursi yang ditahan');
  if ((d?.summary?.vehicle?.sold_sup ?? 1) !== 0) alasan.push('sudah ada penjualan kendaraan');
  if ((d?.summary?.vehicle?.held_sup ?? 1) !== 0) alasan.push('ada kendaraan yang ditahan');
  return alasan;
}

const awal: any = {};

const cariGol = (v: any, code: string) => v.golongan.find((g: any) => g.code === code);
const cariSelV = (v: any, saluran: string, code: string) =>
  v.channel_rows.find((x: any) => x.channel_group === saluran)?.cells.find((c: any) => c.code === code);
const supTipe = (v: any, tipe: string) =>
  v.golongan.filter((g: any) => g.type === tipe).reduce((n: number, g: any) => n + g.sup_equivalent, 0);

// Hanya golongan yang berbeda dari keadaan awal
function ringkas(v: any) {
  const beda = v.golongan.filter((g: any) => {
    const a = cariGol(awal.vehicle, g.code);
    return g.type !== a.type || g.quota_units !== a.quota_units || g.source !== a.source;
  }).map((g: any) => `${g.code}:${g.type} unit ${g.quota_units} sumber ${g.source}`);
  return `berubah: ${beda.join(' | ') || '-'} | composition ${potong(v.composition, 110)} | totals ${potong(v.totals, 90)}`;
}

// Pemeriksaan kewajaran untuk setiap perubahan yang diterima server
function sehat(v: any, nama: string) {
  for (const g of v.golongan) {
    expect.soft(g.remaining, `sisa ${g.code} tidak negatif (${nama})`).toBeGreaterThanOrEqual(0);
    expect.soft(g.sup_equivalent, `sup ${g.code} = satuan x sup per satuan (${nama})`)
      .toBeCloseTo(g.quota_units * g.sup_per_unit, 2);
  }
  expect.soft(v.totals.matches_quota, `teralokasi tidak melebihi operasional (${nama})`).toBe(true);
}

// Simpan, baca hasilnya, periksa, lalu SELALU reset
async function coba(
  request: APIRequestContext,
  headers: Record<string, string>,
  nama: string,
  isi: any,
  periksa?: (v: any, d: any) => void,
) {
  let r: any;
  let b: any;
  let v: any;
  let d: any;
  try {
    r = await ubah(request, headers, { resource: 'vehicle', ...isi });
    b = await baca(r);
    v = await tampil(request, headers, 'vehicle');
    d = await detail(request, headers);
    console.log(`[${nama}] status ${r.status()} | message: ${b?.message ?? '-'} | has_overrides ${d?.has_overrides}`);
    if (r.status() === 200) console.log(`   ${ringkas(v)}`);
    expect.soft(r.status(), `${nama}: tidak boleh error server`).toBeLessThan(500);
    if (periksa && r.status() === 200) periksa(v, d);
  } finally {
    const rr = await kembalikan(request, headers, 'vehicle');
    expect.soft(rr.status(), `reset setelah ${nama}`).toBe(200);
  }
  return { r, b, v, d };
}

test.describe('capacity simpan kendaraan (MENGUBAH DATA)', () => {
  test.skip(process.env.ALLOW_WRITE !== '1', 'Dilewati. Untuk menjalankan, set ALLOW_WRITE=1');
  test.describe.configure({ mode: 'serial', retries: 0 });

  const perluAwal = () => test.skip(!awal.vehicle, 'Syarat awal tidak terpenuhi, jadi test ini dilewati');

  test('syarat awal terpenuhi dan catat keadaan awal', async ({ request }) => {
    const headers = await auth(request);
    const alasan = await syaratAwal(request, headers);
    console.log(`Keberangkatan uji ${TANGGAL}|${JADWAL}: ${alasan.length ? 'TIDAK AMAN (' + alasan.join(', ') + ')' : 'aman dipakai'}`);
    test.skip(alasan.length > 0, `Syarat awal tidak terpenuhi: ${alasan.join(', ')}`);

    awal.pax = await tampil(request, headers, 'pax');
    awal.vehicle = await tampil(request, headers, 'vehicle');
    awal.goods = await tampil(request, headers, 'goods');
    expect(awal.vehicle).toBeDefined();
    console.log(`Golongan: ${awal.vehicle.golongan.map((g: any) => `${g.code} unit ${g.quota_units} (${g.sup_per_unit} sup)`).join(' | ')}`);
  });

  test('satuan satu golongan ditambah: SUP dan retail ikut berubah', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r } = await coba(request, headers, `I ${a.quota_units} jadi ${a.quota_units + 1}`,
      { golongan: [{ code: 'I', type: 'normal', quota_units: a.quota_units + 1 }] }, (v, d) => {
        const g = cariGol(v, 'I');
        expect.soft(g.quota_units, 'satuan I').toBe(a.quota_units + 1);
        expect.soft(g.source, 'sumber I').toBe('override');
        expect.soft(g.sup_equivalent, 'sup I').toBeCloseTo((a.quota_units + 1) * g.sup_per_unit, 2);
        expect.soft(v.composition.normal, 'normal bertambah satu satuan').toBeCloseTo(awal.vehicle.composition.normal + g.sup_per_unit, 2);
        expect.soft(cariSelV(v, 'retail', 'I')?.quota, 'retail I mengikuti total satuan (dugaan)').toBe(a.quota_units + 1);
        expect.soft(d.has_overrides, 'has_overrides menjadi true').toBe(true);
        for (const lain of awal.vehicle.golongan.filter((x: any) => x.code !== 'I')) {
          expect.soft(cariGol(v, lain.code).quota_units, `golongan ${lain.code} tidak berubah`).toBe(lain.quota_units);
        }
        sehat(v, 'I tambah satu');
      });
    expect(r.status()).toBe(200);
  });

  test('satuan satu golongan dijadikan 0', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r } = await coba(request, headers, 'I jadi 0',
      { golongan: [{ code: 'I', type: 'normal', quota_units: 0 }] }, (v) => {
        const g = cariGol(v, 'I');
        expect.soft(g.quota_units, 'satuan I').toBe(0);
        expect.soft(g.sup_equivalent, 'sup I').toBeCloseTo(0, 2);
        expect.soft(g.remaining, 'sisa I').toBe(0);
        expect.soft(v.composition.normal, 'normal berkurang').toBeCloseTo(awal.vehicle.composition.normal - a.sup_equivalent, 2);
        sehat(v, 'I jadi 0');
      });
    expect(r.status()).toBe(200);
  });

  test('tipe diubah ke reserve (SUP berpindah dari normal)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r } = await coba(request, headers, 'I jadi reserve',
      { golongan: [{ code: 'I', type: 'reserve', quota_units: a.quota_units }] }, (v, d) => {
        const g = cariGol(v, 'I');
        expect.soft(g.type, 'tipe I').toBe('reserve');
        expect.soft(g.source, 'sumber I').toBe('override');
        expect.soft(v.composition.reserve, 'reserve = SUP golongan bertipe reserve (dugaan)').toBeCloseTo(supTipe(v, 'reserve'), 2);
        expect.soft(v.composition.normal, 'normal = SUP golongan bertipe normal (dugaan)').toBeCloseTo(supTipe(v, 'normal'), 2);
        expect.soft(d.has_overrides, 'has_overrides').toBe(true);
        sehat(v, 'I reserve');
      });
    expect(r.status()).toBe(200);
  });

  test('tipe diubah ke restrict', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r } = await coba(request, headers, 'I jadi restrict',
      { golongan: [{ code: 'I', type: 'restrict', quota_units: a.quota_units }] }, (v, d) => {
        const g = cariGol(v, 'I');
        expect.soft(g.type, 'tipe I').toBe('restrict');
        expect.soft(v.composition.restrict, 'restrict = SUP golongan bertipe restrict (dugaan)').toBeCloseTo(supTipe(v, 'restrict'), 2);
        expect.soft(v.composition.normal, 'normal = SUP golongan bertipe normal (dugaan)').toBeCloseTo(supTipe(v, 'normal'), 2);
        expect.soft(d.has_overrides, 'has_overrides').toBe(true);
        sehat(v, 'I restrict');
      });
    expect(r.status()).toBe(200);
  });

  test('menyimpan nilai default tidak membuat override (sesuai dokumentasi)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    await coba(request, headers, 'I sama dengan default',
      { golongan: [{ code: 'I', type: 'normal', quota_units: a.quota_units }] }, (v, d) => {
        expect.soft(d.has_overrides, 'nilai yang sama dengan default tidak disimpan').toBe(false);
        expect.soft(cariGol(v, 'I').source, 'sumber I tetap template').toBe('template');
      });
  });

  test('menyimpan menggantikan seluruh override sebelumnya (Replaces)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a1 = cariGol(awal.vehicle, 'I');
    const a2 = cariGol(awal.vehicle, 'II');
    try {
      await ubah(request, headers, { resource: 'vehicle', golongan: [{ code: 'I', type: 'normal', quota_units: a1.quota_units + 1 }] });
      const r = await ubah(request, headers, { resource: 'vehicle', golongan: [{ code: 'II', type: 'normal', quota_units: a2.quota_units + 1 }] });
      const v = await tampil(request, headers, 'vehicle');
      console.log(`[replaces] status ${r.status()} | ${ringkas(v)}`);
      expect.soft(r.status()).toBe(200);
      expect.soft(cariGol(v, 'II').quota_units, 'II tersimpan').toBe(a2.quota_units + 1);
      expect.soft(cariGol(v, 'I').quota_units, 'I dari simpan pertama kembali ke default').toBe(a1.quota_units);
      expect.soft(cariGol(v, 'I').source, 'sumber I').toBe('template');
      sehat(v, 'replaces');
    } finally {
      const rr = await kembalikan(request, headers, 'vehicle');
      expect.soft(rr.status(), 'reset').toBe(200);
    }
  });

  test('golongan kosong menghapus semua override kendaraan', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    try {
      await ubah(request, headers, { resource: 'vehicle', golongan: [{ code: 'I', type: 'normal', quota_units: a.quota_units + 1 }] });
      expect((await detail(request, headers)).has_overrides, 'setelah simpan').toBe(true);

      const r = await ubah(request, headers, { resource: 'vehicle', golongan: [] });
      expect(r.status()).toBe(200);
      expect((await detail(request, headers)).has_overrides, 'setelah golongan kosong').toBe(false);
      expect((await tampil(request, headers, 'vehicle')).golongan).toEqual(awal.vehicle.golongan);
    } finally {
      const rr = await kembalikan(request, headers, 'vehicle');
      expect.soft(rr.status(), 'reset').toBe(200);
    }
  });

  test('melebihi kapasitas operasional harus ditolak (merah di sini = temuan)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r, b, d } = await coba(request, headers, 'VB 1000 satuan',
      { golongan: [{ code: 'VB', type: 'normal', quota_units: 1000 }] }, (v) => sehat(v, 'VB 1000 satuan'));
    console.log(`   kode penolakan: ${b?.message ?? '-'}`);
    expect.soft(r.status(), 'melebihi operasional harus ditolak 422').toBe(422);
    expect.soft(d.has_overrides, 'tidak boleh ada yang tersimpan').toBe(false);
  });

  test('batas dan isi aneh (lihat balasan, tidak boleh error server)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');

    const kasus: [string, any][] = [
      ['kode tidak dikenal ZZZ', { golongan: [{ code: 'ZZZ', type: 'normal', quota_units: 1 }] }],
      ['kode kosong', { golongan: [{ code: '', type: 'normal', quota_units: 1 }] }],
      ['kode ganda I (satuan 3 lalu 4)', { golongan: [{ code: 'I', quota_units: 3 }, { code: 'I', quota_units: 4 }] }],
      ['type kosong (null)', { golongan: [{ code: 'I', type: null, quota_units: a.quota_units + 1 }] }],
      ['quota_units kosong (null)', { golongan: [{ code: 'I', type: 'reserve', quota_units: null }] }],
      ['hanya code', { golongan: [{ code: 'I' }] }],
    ];

    for (const [nama, isi] of kasus) {
      await coba(request, headers, nama, isi, (v) => sehat(v, nama));
      await jeda(300);
    }
  });

  test('cells untuk kendaraan (eksplorasi, lihat balasan)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);

    const kasus: [string, any][] = [
      ['cells mitra I quota 1', { cells: [{ channel_group: 'mitra', code: 'I', quota: 1 }] }],
      ['cells mitra I quota_units 1', { cells: [{ channel_group: 'mitra', code: 'I', quota_units: 1 }] }],
      ['cells retail I (otomatis)', { cells: [{ channel_group: 'retail', code: 'I', quota: 1 }] }],
    ];

    for (const [nama, isi] of kasus) {
      await coba(request, headers, nama, isi, (v) => {
        console.log(`   mitra I: ${potong(cariSelV(v, 'mitra', 'I'))} | retail I: ${potong(cariSelV(v, 'retail', 'I'))}`);
      });
      await jeda(300);
    }
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