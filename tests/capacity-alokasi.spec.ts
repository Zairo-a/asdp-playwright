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
const jumlah = (a: number[]) => a.reduce((x, y) => x + y, 0);

async function ambil(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
  params?: Record<string, any>,
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

// Sampel: keberangkatan besok yang berpola khusus (persentase atau kapasitas berbeda) + 2 yang biasa
let sampelCache: { headers: Record<string, string>; rows: any[] } | undefined;

async function sampel(request: APIRequestContext) {
  if (sampelCache) return sampelCache;
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const khusus: any[] = [];
  const biasa: any[] = [];
  let halaman = 1;
  let terakhir = 1;
  do {
    const b = await (await ambil(request, 'cms/capacity/departures', headers, {
      date: tanggal(1), page: halaman, per_page: 100,
    })).json();
    terakhir = b.result.pagination.last_page;
    for (const row of b.result.rows) {
      if (row.quota.pct_source !== 'global' || row.quota.physical !== 36) khusus.push(row);
      else if (biasa.length < 2) biasa.push(row);
    }
    halaman++;
    await jeda(300);
  } while (halaman <= terakhir);
  sampelCache = { headers, rows: [...khusus.slice(0, 6), ...biasa] };
  return sampelCache;
}

async function detail(request: APIRequestContext, headers: Record<string, string>, row: any) {
  const r = await ambil(request, `cms/capacity/departures/${row.date}/${row.schedule.id}`, headers);
  return (await r.json()).result;
}

function alokasi(request: APIRequestContext, headers: Record<string, string>, row: any, resource: string) {
  return ambil(request, `cms/capacity/departures/${row.date}/${row.schedule.id}/allocations`, headers, { resource });
}

// ---------- PAX ----------

test('alokasi pax: bentuk dan angka konsisten dengan detail', async ({ request }) => {
  const { headers, rows } = await sampel(request);
  console.log(`Sampel: ${rows.length} keberangkatan`);
  for (const row of rows) {
    console.log(`  ${row.key} | fisik ${row.quota.physical} | pct ${row.quota.pct} | sumber ${row.quota.pct_source}`);
  }

  for (const row of rows) {
    const r = await alokasi(request, headers, row, 'pax');
    expect.soft(r.status(), `status ${row.key}`).toBe(200);
    const p = (await baca(r)).result;
    if (!p) { expect.soft(p, `result ${row.key}`).toBeDefined(); continue; }
    const d = await detail(request, headers, row);

    expect.soft(p.resource, `resource ${row.key}`).toBe('pax');
    expect.soft(p.classes.length, `jumlah kelas ${row.key}`).toBeGreaterThan(0);
    expect.soft(p.rows.length, `jumlah saluran ${row.key}`).toBeGreaterThan(0);
    for (const s of p.rows) {
      expect.soft(s.cells.length, `sel per saluran ${s.channel_group} ${row.key}`).toBe(p.classes.length);
    }
    expect.soft(p.totals.quota, `total kuota ${row.key}`).toBe(d.summary.quota.total);
    expect.soft(p.totals.sold, `total terjual ${row.key}`).toBe(d.summary.pax.sold);
    expect.soft(p.totals.sold, `terjual tidak negatif ${row.key}`).toBeGreaterThanOrEqual(0);
    await jeda(300);
  }
});

test('alokasi pax: baris dan kolom saling cocok, dan hitungan di luar kuota', async ({ request }) => {
  const { headers, rows } = await sampel(request);
  for (const row of rows) {
    const p = (await baca(await alokasi(request, headers, row, 'pax'))).result;
    if (!p) continue;
    const d = await detail(request, headers, row);

    expect.soft(jumlah(p.rows.map((s: any) => s.total.quota)), `jumlah per saluran = jumlah per kelas ${row.key}`)
      .toBe(jumlah(p.classes.map((c: any) => c.quota)));
    expect.soft(p.outside_quota.in_vehicle.quota, `di luar kuota (kendaraan) = fisik - kuota ${row.key}`)
      .toBe(d.capacity.physical_pax - d.capacity.pax_quota);
    await jeda(300);
  }
});

test('alokasi pax: jumlah alokasi sama dengan kuota total (TEMUAN: gagal di kapal kapasitas 45)', async ({ request }) => {
  test.fail(true, 'Diketahui: di kapal kapasitas 45 jumlah alokasi 32, padahal kuota total 36');
  const { headers, rows } = await sampel(request);
  for (const row of rows) {
    const p = (await baca(await alokasi(request, headers, row, 'pax'))).result;
    if (!p) continue;
    expect.soft(jumlah(p.classes.map((c: any) => c.quota)), `jumlah alokasi = kuota total ${row.key}`)
      .toBe(p.totals.quota);
    await jeda(300);
  }
});

// ---------- VEHICLE ----------

test('alokasi vehicle: bentuk dan angka konsisten dengan detail', async ({ request }) => {
  const { headers, rows } = await sampel(request);
  for (const row of rows) {
    const r = await alokasi(request, headers, row, 'vehicle');
    expect.soft(r.status(), `status ${row.key}`).toBe(200);
    const v = (await baca(r)).result;
    if (!v) { expect.soft(v, `result ${row.key}`).toBeDefined(); continue; }
    const d = await detail(request, headers, row);

    expect.soft(v.resource, `resource ${row.key}`).toBe('vehicle');
    expect.soft(v.golongan.length, `jumlah golongan ${row.key}`).toBeGreaterThan(0);
    for (const s of v.channel_rows) {
      expect.soft(s.cells.length, `sel per saluran ${s.channel_group} ${row.key}`).toBe(v.golongan.length);
    }
    for (const g of v.golongan) {
      expect.soft(g.sup_equivalent, `sup golongan ${g.code} ${row.key}`)
        .toBeCloseTo(g.quota_units * g.sup_per_unit, 2);
      expect.soft(g.remaining, `sisa golongan ${g.code} tidak negatif ${row.key}`).toBeGreaterThanOrEqual(0);
    }
    expect.soft(v.composition.operational_sup, `operational_sup = kuota kendaraan di detail ${row.key}`)
      .toBe(d.capacity.vehicle_sup_quota);

    console.log(
      `${row.key} | operational ${v.composition.operational_sup} | normal ${v.composition.normal}` +
      ` | reserve ${v.composition.reserve} | restrict ${v.composition.restrict}` +
      ` | teralokasi ${v.totals.sup_allocated} | matches_quota ${v.totals.matches_quota}`,
    );
    await jeda(300);
  }
});

test('alokasi vehicle: hitungan SUP dan sisa per golongan', async ({ request }) => {
  const { headers, rows } = await sampel(request);
  for (const row of rows) {
    const v = (await baca(await alokasi(request, headers, row, 'vehicle'))).result;
    if (!v) continue;

    const totalSup = jumlah(v.golongan.map((g: any) => g.sup_equivalent));
    expect.soft(totalSup, `jumlah sup golongan = teralokasi ${row.key}`).toBeCloseTo(v.totals.sup_allocated, 2);
    // restrict selalu 0 di data kita, jadi belum bisa dipastikan apakah ia ikut dihitung
    expect.soft(v.totals.sup_allocated, `teralokasi = normal + reserve + restrict ${row.key}`)
      .toBeCloseTo(v.composition.normal + v.composition.reserve + v.composition.restrict, 2);
    for (const g of v.golongan) {
      expect.soft(g.remaining, `sisa = unit - terjual - ditahan, golongan ${g.code} ${row.key}`)
        .toBe(g.quota_units - g.sold - g.held);
    }
    await jeda(300);
  }
});

test('alokasi vehicle: alokasi tidak melebihi operasional (TEMUAN: gagal di kapal kapasitas 45)', async ({ request }) => {
  test.fail(true, 'Diketahui: di kapal kapasitas 45 alokasi 44,55 melebihi operasional 42,24 dan matches_quota false');
  const { headers, rows } = await sampel(request);
  for (const row of rows) {
    const v = (await baca(await alokasi(request, headers, row, 'vehicle'))).result;
    if (!v) continue;
    expect.soft(v.totals.sup_allocated, `teralokasi <= operasional ${row.key}`)
      .toBeLessThanOrEqual(v.composition.operational_sup);
    expect.soft(v.totals.matches_quota, `matches_quota ${row.key}`).toBe(true);
    await jeda(300);
  }
});

// ---------- GOODS ----------

test('alokasi goods: informasi saja dan bentuk baris benar', async ({ request }) => {
  const { headers, rows } = await sampel(request);
  const hitung: Record<string, number> = {};
  for (const row of rows) {
    const r = await alokasi(request, headers, row, 'goods');
    expect.soft(r.status(), `status ${row.key}`).toBe(200);
    const g = (await baca(r)).result;
    if (!g) { expect.soft(g, `result ${row.key}`).toBeDefined(); continue; }

    expect.soft(g.informational, `informational ${row.key}`).toBe(true);
    expect.soft(g.rows.length, `jumlah kategori ${row.key}`).toBeGreaterThan(0);
    for (const k of g.rows) {
      expect.soft(k.category_id, `category_id ${row.key}`).toBeDefined();
      expect.soft(k.code, `code ${row.key}`).toBeTruthy();
      expect.soft(k.name, `name ${row.key}`).toBeTruthy();
      const kunci = `status ${k.status} | target ${k.target === null ? 'kosong' : 'ada'}`;
      hitung[kunci] = (hitung[kunci] ?? 0) + 1;
    }
    await jeda(300);
  }
  for (const [k, n] of Object.entries(hitung)) console.log(`   ${n}x ${k}`);
});

// ---------- NEGATIF ----------

const jalur = () => `cms/capacity/departures/${tanggal(1)}/1/allocations`;

test('alokasi gagal: tanpa resource ditolak', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const r = await ambil(request, jalur(), headers);
  expect(r.status()).toBe(422);
  expect(String((await baca(r)).message)).toContain('resource field is required');
});

test('alokasi gagal: resource ngawur ditolak', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const r = await ambil(request, jalur(), headers, { resource: 'abc' });
  expect(r.status()).toBe(422);
  expect(String((await baca(r)).message)).toContain('selected resource is invalid');
});

test('alokasi gagal: scheduleId tidak ada', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const r = await ambil(request, `cms/capacity/departures/${tanggal(1)}/999999999/allocations`, headers, { resource: 'pax' });
  expect(r.status()).toBe(404);
});

test('alokasi gagal: format date salah', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };
  const r = await ambil(request, 'cms/capacity/departures/bukan-tanggal/1/allocations', headers, { resource: 'pax' });
  expect(r.status()).toBe(404);
});

test('alokasi gagal: tanpa token ditolak', async ({ request }) => {
  const r = await request.get(jalur(), { params: { resource: 'pax' } });
  expect(r.status()).toBe(401);
});