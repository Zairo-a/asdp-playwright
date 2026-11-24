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

type Baris = { resource?: string; ref?: string; add_units?: number | string };

// lines[0][resource]=pax&lines[0][ref]=1&lines[0][add_units]=1
function qs(lines?: Baris[], lainnya: Record<string, string> = {}) {
  const p = new URLSearchParams();
  (lines ?? []).forEach((b, i) => {
    for (const [k, v] of Object.entries(b)) {
      if (v !== undefined) p.append(`lines[${i}][${k}]`, String(v));
    }
  });
  for (const [k, v] of Object.entries(lainnya)) p.append(k, v);
  return p;
}

const jalur = (date: string, id: number | string) =>
  `cms/capacity/departures/${date}/${id}/quota-increase/check`;

async function siap(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const b = await (await ambil(request, 'cms/capacity/departures', headers, {
    date: tanggal(1), per_page: 1,
  })).json();
  return { headers, row: b.result.rows[0] };
}

async function cek(request: APIRequestContext, headers: Record<string, string>, row: any, lines?: Baris[]) {
  const r = await ambil(request, jalur(row.date, row.schedule.id), headers, qs(lines));
  return { r, b: await baca(r) };
}

async function alokasi(request: APIRequestContext, headers: Record<string, string>, row: any, resource: string) {
  const r = await ambil(
    request, `cms/capacity/departures/${row.date}/${row.schedule.id}/allocations`, headers, { resource },
  );
  return (await baca(r)).result;
}

const kolomSama = ['resource', 'ref', 'name', 'quota', 'sold', 'held', 'remaining', 'tickets',
  'checked_in', 'open', 'failed', 'add_units'];
const kolomPax = [...kolomSama, 'seat_capacity'];
const kolomKendaraan = [...kolomSama, 'sup_per_unit', 'needed_sup'];

test('cek kuota: bentuk balasan benar', async ({ request }) => {
  const { headers, row } = await siap(request);
  const { r, b } = await cek(request, headers, row);
  expect(r.status()).toBe(200);
  expect(b.message).toBe('Success!');

  expect(typeof b.result.eligible).toBe('boolean');
  expect(Array.isArray(b.result.rows)).toBe(true);
  expect(b.result.rows.length).toBeGreaterThan(0);
  for (const x of b.result.rows) {
    const kolom = x.resource === 'vehicle' ? kolomKendaraan : kolomPax;
    for (const k of kolom) {
      expect.soft(x, `baris ${x.resource} ${x.ref} harus punya ${k}`).toHaveProperty(k);
    }
    expect.soft(Array.isArray(x.failed), `failed ${x.resource} ${x.ref}`).toBe(true);
  }
  for (const [grup, angka] of [['vehicle', ['free_sup', 'needed_sup']], ['pax', ['free_pax', 'needed_pax']]] as const) {
    expect.soft(typeof b.result.physical[grup].ok, `physical.${grup}.ok`).toBe('boolean');
    for (const a of angka) expect.soft(typeof b.result.physical[grup][a], `physical.${grup}.${a}`).toBe('number');
  }
});

test('cek kuota: baris sama dengan kelas dan golongan di alokasi', async ({ request }) => {
  const { headers, row } = await siap(request);
  const { b } = await cek(request, headers, row);
  const pax = await alokasi(request, headers, row, 'pax');
  const veh = await alokasi(request, headers, row, 'vehicle');

  const paxRows = b.result.rows.filter((x: any) => x.resource === 'pax');
  const vehRows = b.result.rows.filter((x: any) => x.resource === 'vehicle');
  expect(paxRows.length, 'jumlah baris pax = jumlah kelas').toBe(pax.classes.length);
  expect(vehRows.length, 'jumlah baris kendaraan = jumlah golongan').toBe(veh.golongan.length);

  for (const c of pax.classes) {
    const x = paxRows.find((p: any) => String(p.ref) === String(c.id));
    expect.soft(x, `kelas ${c.code} (id ${c.id}) harus ada di cek kuota`).toBeDefined();
    if (x) expect.soft(x.quota, `kuota kelas ${c.code}`).toBe(c.quota);
  }
  for (const g of veh.golongan) {
    const x = vehRows.find((v: any) => v.ref === g.code);
    expect.soft(x, `golongan ${g.code} harus ada di cek kuota`).toBeDefined();
  }
});

test('cek kuota: sisa = kuota - terjual - ditahan (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const { headers, row } = await siap(request);
  const { b } = await cek(request, headers, row);
  for (const x of b.result.rows) {
    expect.soft(x.remaining, `sisa ${x.resource} ${x.ref}`).toBe(x.quota - x.sold - x.held);
  }
});

test('cek kuota: syarat habis terjual (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const { headers, row } = await siap(request);
  const { b } = await cek(request, headers, row);

  for (const x of b.result.rows) {
    if (x.remaining > 0) {
      expect.soft(x.failed, `${x.resource} ${x.ref} masih ada sisa`).toContain('not_sold_out');
      expect.soft(x.open, `${x.resource} ${x.ref} tidak boleh terbuka`).toBe(false);
    }
  }
  if (b.result.rows.every((x: any) => x.failed.length > 0)) {
    expect.soft(b.result.eligible, 'semua baris gagal, jadi tidak eligible').toBe(false);
  }
});

test('cek kuota: add_units melebihi kapasitas kursi memicu seat_capacity', async ({ request }) => {
  const { headers, row } = await siap(request);
  const awal = await cek(request, headers, row);
  const paxRows = awal.b.result.rows.filter(
    (x: any) => x.resource === 'pax' && typeof x.seat_capacity === 'number' && typeof x.quota === 'number',
  );
  expect(paxRows.length).toBeGreaterThan(0);

  const lines = paxRows.map((x: any) => ({
    resource: 'pax', ref: String(x.ref), add_units: x.seat_capacity - x.quota + 1,
  }));
  const { r, b } = await cek(request, headers, row, lines);
  expect(r.status()).toBe(200);

  for (const l of lines) {
    const x = b.result.rows.find((p: any) => p.resource === 'pax' && String(p.ref) === l.ref);
    expect.soft(x?.add_units, `add_units tercatat ${l.ref}`).toBe(l.add_units);
    expect.soft(x?.failed, `kelas ${l.ref} melebihi kapasitas kursi`).toContain('seat_capacity');
  }
});

test('cek kuota: add_units 0 tidak memicu seat_capacity', async ({ request }) => {
  const { headers, row } = await siap(request);
  const awal = await cek(request, headers, row);
  const lines = awal.b.result.rows
    .filter((x: any) => x.resource === 'pax')
    .map((x: any) => ({ resource: 'pax', ref: String(x.ref), add_units: 0 }));

  const { b } = await cek(request, headers, row, lines);
  for (const x of b.result.rows) {
    expect.soft(x.failed, `${x.resource} ${x.ref} tanpa tambahan`).not.toContain('seat_capacity');
  }
});

test('cek kuota: batas fisik sama dengan alokasi dan detail (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const { headers, row } = await siap(request);
  const { b } = await cek(request, headers, row);
  const pax = await alokasi(request, headers, row, 'pax');
  const d = (await (await ambil(request, `cms/capacity/departures/${row.date}/${row.schedule.id}`, headers)).json()).result;

  expect.soft(b.result.physical.pax.free_pax, 'free_pax = di luar kuota (kendaraan) di alokasi')
    .toBe(pax.outside_quota.in_vehicle.quota);
  expect.soft(b.result.physical.vehicle.free_sup, 'free_sup = kapasitas fisik kendaraan di detail')
    .toBe(d.capacity.vehicle_sup_physical);
});

test('cek kuota gagal: ref pax berupa kode kelas ditolak', async ({ request }) => {
  const { headers, row } = await siap(request);
  const { r, b } = await cek(request, headers, row, [{ resource: 'pax', ref: 'EXP', add_units: 1 }]);
  expect(r.status()).toBe(422);
  expect(b.result).toBeNull();
});

test('cek kuota gagal: ref kendaraan berupa angka ditolak', async ({ request }) => {
  const { headers, row } = await siap(request);
  const { r, b } = await cek(request, headers, row, [{ resource: 'vehicle', ref: '1', add_units: 1 }]);
  expect(r.status()).toBe(422);
  expect(b.result).toBeNull();
});

test('cek kuota: ref kendaraan berupa kode golongan diterima', async ({ request }) => {
  const { headers, row } = await siap(request);
  const veh = await alokasi(request, headers, row, 'vehicle');
  const { r } = await cek(request, headers, row, [
    { resource: 'vehicle', ref: veh.golongan[0].code, add_units: 1 },
  ]);
  expect(r.status()).toBe(200);
});

const negatif: [string, Baris[], Record<string, string>, string][] = [
  ['resource ngawur', [{ resource: 'abc', ref: '1', add_units: 1 }], {}, 'selected lines.0.resource is invalid'],
  ['tanpa resource', [{ ref: '1', add_units: 1 }], {}, 'lines.0.resource field is required'],
  ['tanpa ref', [{ resource: 'pax', add_units: 1 }], {}, 'lines.0.ref field is required'],
  ['tanpa add_units', [{ resource: 'pax', ref: '1' }], {}, 'lines.0.add_units field is required'],
  ['add_units negatif', [{ resource: 'pax', ref: '1', add_units: -1 }], {}, 'must be at least 0'],
  ['add_units bukan angka', [{ resource: 'pax', ref: '1', add_units: 'abc' }], {}, 'must be an integer'],
  ['ref 11 karakter', [{ resource: 'pax', ref: 'x'.repeat(11), add_units: 1 }], {}, 'not be greater than 10 characters'],
  ['lines bukan daftar', [], { lines: 'abc' }, 'lines field must be an array'],
];

for (const [nama, lines, lainnya, pesan] of negatif) {
  test(`cek kuota gagal: ${nama}`, async ({ request }) => {
    const { headers, row } = await siap(request);
    const r = await ambil(request, jalur(row.date, row.schedule.id), headers, qs(lines, lainnya));
    expect(r.status()).toBe(422);
    expect(String((await baca(r)).message)).toContain(pesan);
  });
}

test('cek kuota gagal: scheduleId tidak ada', async ({ request }) => {
  const { headers, row } = await siap(request);
  const r = await ambil(request, jalur(row.date, 999999999), headers);
  expect(r.status()).toBe(404);
});

test('cek kuota gagal: format date salah', async ({ request }) => {
  const { headers } = await siap(request);
  const r = await ambil(request, jalur('bukan-tanggal', 1), headers);
  expect(r.status()).toBe(404);
});

test('cek kuota gagal: tanpa token ditolak', async ({ request }) => {
  const r = await request.get(jalur(tanggal(1), 1));
  expect(r.status()).toBe(401);
});