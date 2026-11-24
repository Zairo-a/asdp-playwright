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

// Ringkasan: golongan yang berubah dan saluran yang terisi
function ringkas(v: any) {
  const beda = v.golongan.filter((g: any) => {
    const a = cariGol(awal.vehicle, g.code);
    return g.type !== a.type || g.quota_units !== a.quota_units || g.source !== a.source;
  }).map((g: any) => `${g.code}:${g.type} unit ${g.quota_units} sumber ${g.source}`);

  const saluran = ['mitra', 'korporasi'].flatMap((s) =>
    (v.channel_rows.find((x: any) => x.channel_group === s)?.cells ?? [])
      .filter((c: any) => c.quota !== 0)
      .map((c: any) => `${s} ${c.code}=${c.quota}`));

  return `golongan berubah: ${beda.join(' | ') || '-'} | saluran terisi: ${saluran.join(', ') || '-'}`
    + ` | composition ${potong(v.composition, 110)} | totals ${potong(v.totals, 90)}`;
}

// Pemeriksaan kewajaran untuk setiap perubahan yang diterima server
function sehat(v: any, nama: string) {
  for (const g of v.golongan) {
    expect.soft(g.remaining, `sisa ${g.code} tidak negatif (${nama})`).toBeGreaterThanOrEqual(0);
    expect.soft(g.sup_equivalent, `sup ${g.code} = satuan x sup per satuan (${nama})`)
      .toBeCloseTo(g.quota_units * g.sup_per_unit, 2);
  }
  const retail = v.channel_rows.find((x: any) => x.channel_group === 'retail')?.cells ?? [];
  for (const c of retail) {
    expect.soft(c.quota, `retail ${c.code} tidak negatif (${nama})`).toBeGreaterThanOrEqual(0);
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

test.describe('capacity simpan kendaraan, golongan dan saluran (MENGUBAH DATA)', () => {
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
  });

  // ---------- Perilaku yang sudah teramati: dikunci jadi pemeriksaan keras ----------

  test('cells kendaraan tanpa quota_units ditolak dengan pesan yang jelas', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r, b, d } = await coba(request, headers, 'cells mitra I hanya quota',
      { cells: [{ channel_group: 'mitra', code: 'I', quota: 1 }] });
    expect(r.status()).toBe(422);
    expect(String(b?.message)).toContain('quota_units field is required when resource is vehicle');
    expect(d.has_overrides, 'tidak boleh ada yang tersimpan').toBe(false);
  });

  test('kode golongan ganda: yang terakhir dipakai', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r } = await coba(request, headers, 'kode ganda I (3 lalu 4)',
      { golongan: [{ code: 'I', quota_units: 3 }, { code: 'I', quota_units: 4 }] }, (v) => {
        expect.soft(cariGol(v, 'I').quota_units, 'yang terakhir dipakai').toBe(4);
        expect.soft(cariGol(v, 'I').type, 'tipe tanpa isian dianggap normal').toBe('normal');
        sehat(v, 'kode ganda');
      });
    expect(r.status()).toBe(200);
  });

  test('type null dianggap normal', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r } = await coba(request, headers, 'type null',
      { golongan: [{ code: 'I', type: null, quota_units: a.quota_units + 1 }] }, (v) => {
        expect.soft(cariGol(v, 'I').type, 'tipe I').toBe('normal');
        expect.soft(cariGol(v, 'I').quota_units, 'satuan I').toBe(a.quota_units + 1);
        sehat(v, 'type null');
      });
    expect(r.status()).toBe(200);
  });

  test('quota_units null mempertahankan satuan default dan hanya mengubah tipe', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r } = await coba(request, headers, 'quota_units null, tipe reserve',
      { golongan: [{ code: 'I', type: 'reserve', quota_units: null }] }, (v) => {
        expect.soft(cariGol(v, 'I').type, 'tipe I').toBe('reserve');
        expect.soft(cariGol(v, 'I').quota_units, 'satuan I tetap default').toBe(a.quota_units);
        expect.soft(v.composition.reserve, 'reserve = SUP golongan I').toBeCloseTo(a.sup_equivalent, 2);
        expect.soft(v.composition.normal, 'normal berkurang sebesar SUP golongan I')
          .toBeCloseTo(awal.vehicle.composition.normal - a.sup_equivalent, 2);
        sehat(v, 'quota_units null');
      });
    expect(r.status()).toBe(200);
  });

  test('hanya code tidak mengubah apa pun dan tidak membuat override', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r } = await coba(request, headers, 'hanya code I', { golongan: [{ code: 'I' }] }, (v, d) => {
      expect.soft(d.has_overrides, 'tidak ada override').toBe(false);
      expect.soft(v.golongan, 'golongan sama dengan keadaan awal').toEqual(awal.vehicle.golongan);
    });
    expect(r.status()).toBe(200);
  });

  test('kode golongan tidak dikenal ditolak', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r, b, d } = await coba(request, headers, 'kode ZZZ',
      { golongan: [{ code: 'ZZZ', type: 'normal', quota_units: 1 }] });
    expect(r.status()).toBe(422);
    expect(String(b?.message)).toContain('VALIDATION-ERROR');
    expect(d.has_overrides, 'tidak boleh ada yang tersimpan').toBe(false);
  });

  test('kode golongan kosong ditolak dengan pesan yang jelas', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r, b, d } = await coba(request, headers, 'kode kosong',
      { golongan: [{ code: '', type: 'normal', quota_units: 1 }] });
    expect(r.status()).toBe(422);
    expect(String(b?.message)).toContain('golongan.0.code field is required when golongan is present');
    expect(d.has_overrides, 'tidak boleh ada yang tersimpan').toBe(false);
  });

  // ---------- Alokasi saluran untuk kendaraan lewat cells (baru) ----------

  test('saluran mitra: satu golongan diisi, retail berkurang, total golongan tetap', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r } = await coba(request, headers, 'mitra I 1',
      { cells: [{ channel_group: 'mitra', code: 'I', quota_units: 1 }] }, (v, d) => {
        expect.soft(cariSelV(v, 'mitra', 'I')?.quota, 'mitra I').toBe(1);
        expect.soft(cariSelV(v, 'retail', 'I')?.quota, 'retail I = total - mitra').toBe(a.quota_units - 1);
        expect.soft(cariGol(v, 'I').quota_units, 'total satuan I tidak berubah').toBe(a.quota_units);
        expect.soft(v.composition, 'komposisi SUP tidak berubah').toEqual(awal.vehicle.composition);
        expect.soft(v.totals.sup_allocated, 'teralokasi tidak berubah').toBeCloseTo(awal.vehicle.totals.sup_allocated, 2);
        expect.soft(d.has_overrides, 'has_overrides').toBe(true);
        sehat(v, 'mitra I 1');
      });
    expect(r.status()).toBe(200);
  });

  test('beberapa golongan dan saluran sekaligus (dugaan, gagal belum tentu bug)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r } = await coba(request, headers, 'mitra I 1, korporasi II 2, mitra IVB 1', {
      cells: [
        { channel_group: 'mitra', code: 'I', quota_units: 1 },
        { channel_group: 'korporasi', code: 'II', quota_units: 2 },
        { channel_group: 'mitra', code: 'IVB', quota_units: 1 },
      ],
    }, (v) => {
      expect.soft(cariSelV(v, 'mitra', 'I')?.quota, 'mitra I').toBe(1);
      expect.soft(cariSelV(v, 'korporasi', 'II')?.quota, 'korporasi II').toBe(2);
      expect.soft(cariSelV(v, 'mitra', 'IVB')?.quota, 'mitra IVB').toBe(1);
      for (const [kode, pakai] of [['I', 1], ['II', 2], ['IVB', 1]] as const) {
        expect.soft(cariSelV(v, 'retail', kode)?.quota, `retail ${kode} = total - saluran lain`)
          .toBe(cariGol(awal.vehicle, kode).quota_units - pakai);
      }
      for (const g of awal.vehicle.golongan) {
        expect.soft(cariGol(v, g.code).quota_units, `total satuan ${g.code} tidak berubah`).toBe(g.quota_units);
      }
      expect.soft(v.composition, 'komposisi SUP tidak berubah').toEqual(awal.vehicle.composition);
      sehat(v, 'beberapa saluran');
    });
    expect.soft(r.status()).toBe(200);
  });

  test('mitra sama dengan total golongan diterima, retail menjadi 0 (dugaan)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r } = await coba(request, headers, `mitra I ${a.quota_units} (sama dengan total)`,
      { cells: [{ channel_group: 'mitra', code: 'I', quota_units: a.quota_units }] }, (v) => {
        expect.soft(cariSelV(v, 'mitra', 'I')?.quota, 'mitra I').toBe(a.quota_units);
        expect.soft(cariSelV(v, 'retail', 'I')?.quota, 'retail I').toBe(0);
        sehat(v, 'mitra I sama dengan total');
      });
    expect.soft(r.status()).toBe(200);
  });

  test('mitra melebihi total golongan harus ditolak (dugaan, merah di sini = temuan atau aturan lain)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r, b, d } = await coba(request, headers, `mitra I ${a.quota_units + 1} (melebihi total ${a.quota_units})`,
      { cells: [{ channel_group: 'mitra', code: 'I', quota_units: a.quota_units + 1 }] }, (v) => sehat(v, 'mitra melebihi'));
    console.log(`   kode penolakan: ${b?.message ?? '-'}`);
    expect.soft(r.status(), 'melebihi total satuan golongan harus ditolak 422').toBe(422);
    expect.soft(d.has_overrides, 'tidak boleh ada yang tersimpan').toBe(false);
  });

  const saluranDitolak: [string, string][] = [
    ['blok', 'saluran blok (hanya baca)'],
    ['retail', 'saluran retail (dihitung otomatis)'],
    ['abc', 'saluran tidak dikenal'],
  ];

  for (const [saluran, nama] of saluranDitolak) {
    test(`kendaraan cells ditolak (dugaan): ${nama}`, async ({ request }) => {
      perluAwal();
      const headers = await auth(request);
      const { r, b, d } = await coba(request, headers, nama,
        { cells: [{ channel_group: saluran, code: 'I', quota_units: 1 }] });
      console.log(`   kode penolakan: ${b?.message ?? '-'}`);
      expect.soft(r.status(), `${nama} harus ditolak 422`).toBe(422);
      expect.soft(d.has_overrides, 'tidak boleh ada yang tersimpan').toBe(false);
    });
  }

  test('cells kendaraan: quota_units negatif ditolak', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const { r, b, d } = await coba(request, headers, 'quota_units -1',
      { cells: [{ channel_group: 'mitra', code: 'I', quota_units: -1 }] });
    expect(r.status()).toBe(422);
    expect.soft(String(b?.message)).toContain('quota_units field must be at least 0');
    expect(d.has_overrides, 'tidak boleh ada yang tersimpan').toBe(false);
  });

  test('golongan dan cells dalam satu permintaan (dugaan, lihat balasan)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    const { r } = await coba(request, headers, 'golongan I jadi 4 dan mitra I 1', {
      golongan: [{ code: 'I', type: 'normal', quota_units: a.quota_units + 1 }],
      cells: [{ channel_group: 'mitra', code: 'I', quota_units: 1 }],
    }, (v) => {
      expect.soft(cariGol(v, 'I').quota_units, 'total satuan I').toBe(a.quota_units + 1);
      expect.soft(cariSelV(v, 'mitra', 'I')?.quota, 'mitra I').toBe(1);
      expect.soft(cariSelV(v, 'retail', 'I')?.quota, 'retail I = total baru - mitra').toBe(a.quota_units);
      sehat(v, 'golongan dan cells');
    });
    expect.soft(r.status()).toBe(200);
  });

  test('cells menggantikan override sebelumnya (dugaan)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    const a = cariGol(awal.vehicle, 'I');
    try {
      await ubah(request, headers, { resource: 'vehicle', cells: [{ channel_group: 'mitra', code: 'I', quota_units: 1 }] });
      const r = await ubah(request, headers, { resource: 'vehicle', cells: [{ channel_group: 'korporasi', code: 'II', quota_units: 1 }] });
      const v = await tampil(request, headers, 'vehicle');
      console.log(`[replaces cells] status ${r.status()} | ${ringkas(v)}`);
      expect.soft(r.status()).toBe(200);
      expect.soft(cariSelV(v, 'korporasi', 'II')?.quota, 'korporasi II tersimpan').toBe(1);
      expect.soft(cariSelV(v, 'mitra', 'I')?.quota, 'mitra I dari simpan pertama hilang').toBe(0);
      expect.soft(cariSelV(v, 'retail', 'I')?.quota, 'retail I kembali penuh').toBe(a.quota_units);
      sehat(v, 'replaces cells');
    } finally {
      const rr = await kembalikan(request, headers, 'vehicle');
      expect.soft(rr.status(), 'reset').toBe(200);
    }
  });

  test('cells kosong menghapus override saluran kendaraan (dugaan)', async ({ request }) => {
    perluAwal();
    const headers = await auth(request);
    try {
      await ubah(request, headers, { resource: 'vehicle', cells: [{ channel_group: 'mitra', code: 'I', quota_units: 1 }] });
      expect.soft((await detail(request, headers)).has_overrides, 'setelah simpan').toBe(true);

      const r = await ubah(request, headers, { resource: 'vehicle', cells: [] });
      const d = await detail(request, headers);
      console.log(`[cells kosong] status ${r.status()} | has_overrides ${d?.has_overrides}`);
      expect.soft(r.status(), 'cells kosong').toBe(200);
      expect.soft(d.has_overrides, 'setelah cells kosong').toBe(false);
      expect.soft((await tampil(request, headers, 'vehicle')).channel_rows, 'kembali seperti awal')
        .toEqual(awal.vehicle.channel_rows);
    } finally {
      const rr = await kembalikan(request, headers, 'vehicle');
      expect.soft(rr.status(), 'reset').toBe(200);
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