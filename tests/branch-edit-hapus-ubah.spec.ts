import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getToken } from './helpers';

// Semua data uji berkode AUTO... dengan nama berawalan AUTO. Hanya yang seperti itu yang boleh diubah atau dihapus.
const PREFIX = 'AUTO';
const runId = Date.now().toString(36).toUpperCase().slice(-3);
let urut = 0;
const kodeBaru = () => `${PREFIX}${runId}${String(++urut).padStart(2, '0')}`;

// Pelabuhan yang terbukti tidak punya rute aktif (cabang uji bisa dihapus)
const PELABUHAN_AMAN = [3, 5, 6];
// Pelabuhan yang dicoba untuk mencari yang punya rute aktif (cabang uji tidak bisa dihapus)
const PELABUHAN_COBA_RUTE = [1, 2, 4, 7, 8, 9, 10, 11, 12];
const URL_CABANG = 'cms/branches';
const FILE_AWAL = path.join('hasil', 'awal-cabang-edit.json');

const jeda = (ms: number) => new Promise((s) => setTimeout(s, ms));

type Hdr = Record<string, string>;

// Hanya sidik jari (hash) yang disimpan, bukan telepon dan email cabang
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const sidik = (x: any) =>
  hash(JSON.stringify([x.id, x.code, x.name, x.company_code, x.phone, x.email, x.ports, x.status, x.is_active]));

const pesanDari = (b: any, galat: string) => String(b?.message ?? galat ?? '-');
const errorServer = (status: number) => status === 0 || status >= 500;
const daftarId = (v: any): number[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((y: any) => Number(typeof y === 'object' ? y?.id : y))
    .filter((n: number) => Number.isFinite(n))
    .sort((a: number, b: number) => a - b);

async function baca(r: any) {
  try { return await r.json(); } catch { return undefined; }
}

async function auth(request: APIRequestContext): Promise<Hdr> {
  return { Authorization: `Bearer ${await getToken(request)}`, Accept: 'application/json' };
}

// GET boleh diulang kalau koneksi diputus server
async function ambil(request: APIRequestContext, url: string, headers: Hdr, params?: any) {
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

async function daftar(request: APIRequestContext, headers: Hdr, pairs: [string, any][] = []) {
  const p = new URLSearchParams();
  p.append('limit', '100');
  for (const [k, v] of pairs) p.append(k, String(v));
  const r = await ambil(request, URL_CABANG, headers, p);
  const b = await baca(r);
  const blok = b?.result?.content?.[0];
  return { rows: (blok?.rows ?? []) as any[], total: (blok?.pagination?.total ?? 0) as number };
}

async function cariKode(request: APIRequestContext, headers: Hdr, kode: string) {
  const { rows } = await daftar(request, headers, [['search', kode]]);
  return rows.find((x) => String(x.code).toUpperCase() === kode.toUpperCase());
}

async function idKode(request: APIRequestContext, headers: Hdr, kode: string) {
  const x = await cariKode(request, headers, kode);
  return x ? String(x.id) : undefined;
}

// Data uji: kode DAN nama sama-sama berawalan AUTO
const uji = (x: any) =>
  String(x.code).toUpperCase().startsWith(PREFIX) && String(x.name).toUpperCase().startsWith('AUTO');

// POST simpan: kalau koneksi terputus, periksa dulu apakah datanya ternyata tersimpan, baru ulangi sekali
async function kirim(request: APIRequestContext, headers: Hdr, data: any) {
  let galat = '';
  for (let i = 0; i < 2; i++) {
    try {
      const r = await request.post(URL_CABANG, { headers, data });
      return { status: r.status(), b: await baca(r), galat: '' };
    } catch (e: any) {
      galat = String(e?.message ?? e).split('\n')[0];
      await jeda(500);
      if (!data?.id) {
        let ada: any;
        try { ada = data?.code ? await cariKode(request, headers, String(data.code)) : undefined; } catch { ada = undefined; }
        if (ada) return { status: 0, b: undefined as any, galat: `${galat} (data ternyata tersimpan)` };
      }
    }
  }
  return { status: 0, b: undefined as any, galat };
}

// POST action tidak pernah diulang otomatis
async function aksiMentah(request: APIRequestContext, headers: Hdr, data: any) {
  try {
    const r = await request.post(`${URL_CABANG}/action`, { headers, data });
    return { status: r.status(), b: await baca(r), galat: '' };
  } catch (e: any) {
    return { status: 0, b: undefined as any, galat: String(e?.message ?? e).split('\n')[0] };
  }
}
const aksi = (request: APIRequestContext, headers: Hdr, action: string, idList: string[]) =>
  aksiMentah(request, headers, { action, ids: idList });

// Menghapus satu cabang uji. Kalau ditolak 409 (pelabuhannya punya rute aktif),
// cabang dipindah ke pelabuhan yang aman, lalu dihapus.
async function hapusAman(request: APIRequestContext, headers: Hdr, kode: string): Promise<string> {
  if (!kode.toUpperCase().startsWith(PREFIX)) {
    throw new Error(`Hanya kode berawalan ${PREFIX} yang boleh dihapus: ${kode}`);
  }
  const x = await cariKode(request, headers, kode);
  if (!x) return 'tidak ada';
  if (!uji(x)) return 'dilewati: nama bukan AUTO';

  let h = await aksi(request, headers, 'delete', [String(x.id)]);
  if (h.status === 200) return 'terhapus';
  if (h.status !== 409) return `gagal ${h.status}`;

  for (const p of PELABUHAN_AMAN) {
    const r = await kirim(request, headers, {
      id: String(x.code), code: String(x.code), name: String(x.name),
      company_code: String(x.company_code), is_active: Number(x.is_active), port_ids: [p],
    });
    if (r.status !== 200) continue;
    h = await aksi(request, headers, 'delete', [String(x.id)]);
    if (h.status === 200) return `terhapus setelah dipindah ke pelabuhan ${p}`;
  }
  return 'gagal (409, tidak ada pelabuhan aman yang berhasil)';
}

const dibuat: string[] = [];
const dataKode = new Map<string, any>();

async function bersihkan(request: APIRequestContext, headers: Hdr) {
  const kode = [...new Set(dibuat.splice(0))];
  for (const k of kode) {
    const hasil = await hapusAman(request, headers, k);
    const baik = hasil.startsWith('terhapus') || hasil === 'tidak ada';
    if (!baik) console.log(`PEMBERSIHAN ${k}: ${hasil}`);
    expect.soft(baik, `pembersihan ${k}: ${hasil}`).toBe(true);
  }
}

const dasar = (ubahan: Record<string, any> = {}) => ({
  code: kodeBaru(),
  name: 'AUTO uji edit hapus',
  company_code: 'GKM',
  is_active: 1,
  port_ids: [PELABUHAN_AMAN[0]],
  ...ubahan,
});

// Kode dicatat SEBELUM dikirim, supaya tetap dibersihkan walaupun koneksi terputus
async function buat(request: APIRequestContext, headers: Hdr, ubahan: Record<string, any> = {}) {
  const data = dasar(ubahan);
  dibuat.push(String(data.code));
  const r = await kirim(request, headers, data);
  if (r.status === 200) dataKode.set(String(data.code), data);
  return { ...r, data };
}

// Edit: Save dengan id = kode yang sudah ada
async function edit(request: APIRequestContext, headers: Hdr, kode: string, ubahan: Record<string, any>) {
  const lama = dataKode.get(kode) ?? {};
  const data = { ...lama, id: kode, ...ubahan };
  const r = await kirim(request, headers, data);
  if (r.status === 200 && !('code' in ubahan)) dataKode.set(kode, { ...lama, ...ubahan });
  return { ...r, data };
}

// Mencari pelabuhan yang punya rute aktif: cabang uji dengan pelabuhan itu ditolak hapus (409)
let cacheRute: Promise<number | undefined> | undefined;
async function cariPelabuhanRute(request: APIRequestContext, headers: Hdr): Promise<number | undefined> {
  for (const p of PELABUHAN_COBA_RUTE) {
    const r = await buat(request, headers, { name: 'AUTO cari rute', port_ids: [p] });
    if (r.status !== 200) { await bersihkan(request, headers); continue; }
    const id = await idKode(request, headers, String(r.data.code));
    if (!id) { await bersihkan(request, headers); continue; }
    const h = await aksi(request, headers, 'delete', [id]);
    await bersihkan(request, headers);
    if (h.status === 409) return p;
  }
  return undefined;
}
const portRute = (request: APIRequestContext, headers: Hdr) => (cacheRute ??= cariPelabuhanRute(request, headers));

test.describe('cabang edit, aktifkan dan nonaktifkan, hapus (MENGUBAH DATA)', () => {
  test.skip(process.env.ALLOW_WRITE !== '1', 'Dilewati. Untuk menjalankan, set ALLOW_WRITE=1');
  test.describe.configure({ retries: 0 });

  test('siap: bersihkan sisa data uji dan catat keadaan awal cabang', async ({ request }) => {
    const headers = await auth(request);
    let { rows } = await daftar(request, headers);
    for (const x of rows.filter(uji)) {
      const h = await hapusAman(request, headers, String(x.code));
      console.log(`Sisa data uji ${x.code}: ${h}`);
    }
    ({ rows } = await daftar(request, headers));
    const awal: Record<string, string> = {};
    for (const x of rows.filter((y) => !uji(y))) awal[String(x.code)] = sidik(x);
    fs.mkdirSync('hasil', { recursive: true });
    fs.writeFileSync(FILE_AWAL, JSON.stringify(awal), 'utf8');
    console.log(`Cabang awal (bukan data uji): ${Object.keys(awal).length}`);
    expect(Object.keys(awal).length).toBeGreaterThan(0);
  });

  // ---------- EDIT ----------

  test('edit: nama, telepon, email, dan alamat tersimpan dan terbaca di daftar', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      expect(a.status, 'pembuatan').toBe(200);
      const kode = String(a.data.code);
      const sebelum = (await daftar(request, headers)).total;

      const ubahan = {
        name: 'AUTO nama baru',
        phone: '0211111111',
        email: `edit.${runId.toLowerCase()}@example.com`,
        address: 'Alamat edit AUTO',
      };
      const e = await edit(request, headers, kode, ubahan);
      expect(e.status, `edit: ${pesanDari(e.b, e.galat)}`).toBe(200);
      expect.soft(e.b?.result?.name, 'name di balasan').toBe(ubahan.name);
      expect.soft(e.b?.result?.phone, 'phone di balasan').toBe(ubahan.phone);
      expect.soft(e.b?.result?.email, 'email di balasan').toBe(ubahan.email);
      expect.soft(e.b?.result?.address, 'address di balasan').toBe(ubahan.address);

      const x = await cariKode(request, headers, kode);
      expect(x, 'cabang ada di daftar').toBeDefined();
      expect.soft(x.name, 'name di daftar').toBe(ubahan.name);
      expect.soft(x.phone, 'phone di daftar').toBe(ubahan.phone);
      expect.soft(x.email, 'email di daftar').toBe(ubahan.email);
      expect.soft(x.company_code, 'perusahaan tidak berubah').toBe('GKM');
      expect.soft(x.status, 'status tidak berubah').toBe('Active');
      expect.soft((await daftar(request, headers)).total, 'edit tidak menambah cabang').toBe(sebelum);
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('edit: kode tidak bisa diubah (dugaan, gagal belum tentu bug)', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      expect(a.status).toBe(200);
      const kode = String(a.data.code);
      const baru = kodeBaru();
      dibuat.push(baru);

      const e = await edit(request, headers, kode, { code: baru, name: 'AUTO kode diganti' });
      const lama = await cariKode(request, headers, kode);
      const adaBaru = await cariKode(request, headers, baru);
      console.log(`[ubah kode ${kode} jadi ${baru}] status ${e.status} | message: ${pesanDari(e.b, e.galat).slice(0, 80)} | kode lama masih ada: ${!!lama} | kode baru ada: ${!!adaBaru}`);
      expect.soft(errorServer(e.status), 'tidak boleh error server').toBe(false);
      expect.soft(lama, 'kode lama harus tetap ada').toBeDefined();
      expect.soft(adaBaru, 'tidak boleh muncul cabang dengan kode baru').toBeUndefined();
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('edit: ganti pelabuhan menggantikan seluruh daftar pelabuhan', async ({ request }) => {
    const headers = await auth(request);
    try {
      test.skip(PELABUHAN_AMAN.length < 3, 'butuh tiga pelabuhan aman');
      const a = await buat(request, headers, { port_ids: [PELABUHAN_AMAN[0]] });
      expect(a.status).toBe(200);
      const kode = String(a.data.code);

      const e = await edit(request, headers, kode, { port_ids: [PELABUHAN_AMAN[1], PELABUHAN_AMAN[2]] });
      expect(e.status, `edit: ${pesanDari(e.b, e.galat)}`).toBe(200);
      expect.soft(daftarId(e.b?.result?.port_ids), 'port_ids di balasan')
        .toEqual([PELABUHAN_AMAN[1], PELABUHAN_AMAN[2]].sort((m, n) => m - n));
      const x = await cariKode(request, headers, kode);
      expect.soft(Array.isArray(x?.ports) ? x.ports.length : -1, 'jumlah pelabuhan di daftar').toBe(2);
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('edit: nonaktifkan dan aktifkan lagi lewat edit', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      expect(a.status).toBe(200);
      const kode = String(a.data.code);

      const e1 = await edit(request, headers, kode, { is_active: 0 });
      expect(e1.status, `nonaktifkan: ${pesanDari(e1.b, e1.galat)}`).toBe(200);
      expect.soft((await cariKode(request, headers, kode))?.status, 'setelah dinonaktifkan').toBe('Inactive');

      const e2 = await edit(request, headers, kode, { is_active: 1 });
      expect(e2.status, `aktifkan: ${pesanDari(e2.b, e2.galat)}`).toBe(200);
      expect.soft((await cariKode(request, headers, kode))?.status, 'setelah diaktifkan lagi').toBe('Active');
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('edit: dua kali dengan data yang sama tidak membuat duplikat', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      expect(a.status).toBe(200);
      const kode = String(a.data.code);

      const e1 = await edit(request, headers, kode, { name: 'AUTO dua kali' });
      const sesudahSatu = await cariKode(request, headers, kode);
      const total = (await daftar(request, headers)).total;
      const e2 = await edit(request, headers, kode, { name: 'AUTO dua kali' });
      const sesudahDua = await cariKode(request, headers, kode);

      expect.soft(e1.status).toBe(200);
      expect.soft(e2.status).toBe(200);
      expect.soft((await daftar(request, headers)).total, 'jumlah cabang tidak berubah').toBe(total);
      expect.soft(sidik(sesudahDua), 'isi cabang sama').toBe(sidik(sesudahSatu));
    } finally {
      await bersihkan(request, headers);
    }
  });

  const editSalah: [string, Record<string, any>][] = [
    ['name kosong', { name: '' }],
    ['name 101 karakter', { name: 'n'.repeat(101) }],
    ['company_code tidak ada', { company_code: 'ZZZ99' }],
    ['port_ids kosong', { port_ids: [] }],
    ['port_ids tidak ada', { port_ids: [999999999] }],
    ['email format salah', { email: 'bukan-email' }],
    ['phone 31 karakter', { phone: '0'.repeat(31) }],
    ['is_active 2', { is_active: 2 }],
  ];

  for (const [nama, ubahan] of editSalah) {
    test(`edit gagal: ${nama}, dan data tidak berubah`, async ({ request }) => {
      const headers = await auth(request);
      try {
        const a = await buat(request, headers);
        expect(a.status).toBe(200);
        const kode = String(a.data.code);
        const sebelum = sidik(await cariKode(request, headers, kode));

        const e = await edit(request, headers, kode, ubahan);
        console.log(`[${nama}] status ${e.status} | message: ${pesanDari(e.b, e.galat).slice(0, 80)}`);
        expect(e.status).toBe(422);
        const sesudah = sidik(await cariKode(request, headers, kode));
        expect.soft(sesudah, 'isi cabang tidak boleh berubah').toBe(sebelum);
      } finally {
        await bersihkan(request, headers);
      }
    });
  }

  test('edit: id yang tidak ada (lihat hasil)', async ({ request }) => {
    const headers = await auth(request);
    try {
      const kode = kodeBaru();
      dibuat.push(kode);
      const e = await kirim(request, headers, {
        id: kode, code: kode, name: 'AUTO id tidak ada', company_code: 'GKM', is_active: 1, port_ids: [PELABUHAN_AMAN[0]],
      });
      const dibuatBaru = await cariKode(request, headers, kode);
      console.log(`[edit id tidak ada ${kode}] status ${e.status} | message: ${pesanDari(e.b, e.galat).slice(0, 80)} | berubah jadi cabang baru: ${!!dibuatBaru}`);
      expect.soft(errorServer(e.status), 'tidak boleh error server').toBe(false);
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('edit gagal: tanpa token ditolak', async ({ request }) => {
    const r = await request.post(URL_CABANG, {
      data: { id: 'AUTO-TIDAK-ADA', code: 'AUTO-TIDAK-ADA', name: 'AUTO tanpa token', company_code: 'GKM', is_active: 1, port_ids: [PELABUHAN_AMAN[0]] },
    });
    expect(r.status()).toBe(401);
  });

  // ---------- ACTION: validasi (tidak mengubah data) ----------

  const aksiSalah: [string, any][] = [
    ['body kosong', {}],
    ['tanpa action', { ids: ['AUTO-TIDAK-ADA'] }],
    ['tanpa ids', { action: 'delete' }],
    ['ids kosong', { action: 'delete', ids: [] }],
    ['ids bukan daftar', { action: 'delete', ids: 'abc' }],
    ['action ngawur', { action: 'abc', ids: ['AUTO-TIDAK-ADA'] }],
  ];

  for (const [nama, data] of aksiSalah) {
    test(`aksi gagal: ${nama}`, async ({ request }) => {
      const headers = await auth(request);
      const r = await aksiMentah(request, headers, data);
      console.log(`[${nama}] status ${r.status} | message: ${pesanDari(r.b, r.galat).slice(0, 80)}`);
      expect(r.status).toBe(422);
    });
  }

  test('aksi gagal: tanpa token ditolak', async ({ request }) => {
    const r = await request.post(`${URL_CABANG}/action`, { data: { action: 'delete', ids: ['AUTO-TIDAK-ADA'] } });
    expect(r.status()).toBe(401);
  });

  test('aksi gagal: token ngawur ditolak', async ({ request }) => {
    const r = await request.post(`${URL_CABANG}/action`, {
      data: { action: 'delete', ids: ['AUTO-TIDAK-ADA'] },
      headers: { Authorization: 'Bearer token-ngawur-123' },
    });
    expect(r.status()).toBe(401);
  });

  // ---------- AKTIFKAN DAN NONAKTIFKAN ----------

  test('aktifkan dan nonaktifkan: action activation membalik status (dugaan, gagal belum tentu bug)', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      expect(a.status).toBe(200);
      const kode = String(a.data.code);
      const id = (await idKode(request, headers, kode))!;

      const t1 = await aksi(request, headers, 'activation', [id]);
      expect.soft(t1.status, `activation pertama: ${pesanDari(t1.b, t1.galat)}`).toBe(200);
      expect.soft((await cariKode(request, headers, kode))?.status, 'setelah activation pertama').toBe('Inactive');
      const nonaktif = await daftar(request, headers, [['status[]', 'inactive']]);
      expect.soft(nonaktif.rows.map((x) => x.code), 'ada di filter nonaktif').toContain(kode);

      const t2 = await aksi(request, headers, 'activation', [id]);
      expect.soft(t2.status, `activation kedua: ${pesanDari(t2.b, t2.galat)}`).toBe(200);
      expect.soft((await cariKode(request, headers, kode))?.status, 'setelah activation kedua').toBe('Active');
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('aktifkan dan nonaktifkan: dua cabang sekaligus (dugaan, gagal belum tentu bug)', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      const c = await buat(request, headers);
      expect(a.status).toBe(200);
      expect(c.status).toBe(200);
      const kodeA = String(a.data.code);
      const kodeC = String(c.data.code);
      const idA = (await idKode(request, headers, kodeA))!;
      const idC = (await idKode(request, headers, kodeC))!;

      const t1 = await aksi(request, headers, 'activation', [idA, idC]);
      expect.soft(t1.status, `activation dua cabang: ${pesanDari(t1.b, t1.galat)}`).toBe(200);
      expect.soft((await cariKode(request, headers, kodeA))?.status, 'cabang A').toBe('Inactive');
      expect.soft((await cariKode(request, headers, kodeC))?.status, 'cabang B').toBe('Inactive');

      const t2 = await aksi(request, headers, 'activation', [idA, idC]);
      expect.soft(t2.status).toBe(200);
      expect.soft((await cariKode(request, headers, kodeA))?.status, 'cabang A lagi').toBe('Active');
      expect.soft((await cariKode(request, headers, kodeC))?.status, 'cabang B lagi').toBe('Active');
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('nonaktifkan cabang yang pelabuhannya punya rute aktif (lihat hasil)', async ({ request }) => {
    test.setTimeout(180_000);
    const headers = await auth(request);
    try {
      const p = await portRute(request, headers);
      test.skip(p === undefined, 'Tidak ketemu pelabuhan yang punya rute aktif');

      const a = await buat(request, headers, { port_ids: [p] });
      expect(a.status).toBe(200);
      const kode = String(a.data.code);
      const id = (await idKode(request, headers, kode))!;

      const t = await aksi(request, headers, 'activation', [id]);
      const status = (await cariKode(request, headers, kode))?.status;
      console.log(`[nonaktifkan, pelabuhan ${p} punya rute aktif] status ${t.status} | message: ${pesanDari(t.b, t.galat).slice(0, 80)} | status cabang sesudahnya: ${status}`);
      console.log(`   errors: ${JSON.stringify(t.b?.errors)?.slice(0, 150)}`);
      expect.soft(errorServer(t.status), 'tidak boleh error server').toBe(false);
    } finally {
      await bersihkan(request, headers);
    }
  });

  // ---------- HAPUS ----------

  test('hapus: satu cabang hilang dari daftar, pencarian, dan jumlahnya berkurang satu', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      expect(a.status).toBe(200);
      const kode = String(a.data.code);
      const id = (await idKode(request, headers, kode))!;
      const sebelum = (await daftar(request, headers)).total;

      const h = await aksi(request, headers, 'delete', [id]);
      expect(h.status, `hapus: ${pesanDari(h.b, h.galat)}`).toBe(200);
      expect.soft(await cariKode(request, headers, kode), 'tidak ada lagi di pencarian').toBeUndefined();
      const sesudah = await daftar(request, headers);
      expect.soft(sesudah.total, 'jumlah cabang berkurang satu').toBe(sebelum - 1);
      expect.soft(sesudah.rows.map((x) => x.code), 'tidak ada di daftar').not.toContain(kode);
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('hapus: tiga cabang sekaligus dalam satu permintaan', async ({ request }) => {
    const headers = await auth(request);
    try {
      const semua = [await buat(request, headers), await buat(request, headers), await buat(request, headers)];
      for (const s of semua) expect(s.status).toBe(200);
      const kode = semua.map((s) => String(s.data.code));
      const idList: string[] = [];
      for (const k of kode) idList.push((await idKode(request, headers, k))!);
      const sebelum = (await daftar(request, headers)).total;

      const h = await aksi(request, headers, 'delete', idList);
      expect(h.status, `hapus tiga: ${pesanDari(h.b, h.galat)}`).toBe(200);
      for (const k of kode) expect.soft(await cariKode(request, headers, k), `${k} sudah hilang`).toBeUndefined();
      expect.soft((await daftar(request, headers)).total, 'jumlah cabang berkurang tiga').toBe(sebelum - 3);
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('hapus: cabang nonaktif bisa dihapus (dugaan, gagal belum tentu bug)', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers, { is_active: 0 });
      expect(a.status).toBe(200);
      const kode = String(a.data.code);
      const id = (await idKode(request, headers, kode))!;
      const h = await aksi(request, headers, 'delete', [id]);
      expect.soft(h.status, `hapus cabang nonaktif: ${pesanDari(h.b, h.galat)}`).toBe(200);
      expect.soft(await cariKode(request, headers, kode), 'sudah hilang').toBeUndefined();
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('hapus: cabang yang sama dihapus dua kali (lihat hasil)', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      expect(a.status).toBe(200);
      const id = (await idKode(request, headers, String(a.data.code)))!;
      const h1 = await aksi(request, headers, 'delete', [id]);
      expect(h1.status).toBe(200);
      const total = (await daftar(request, headers)).total;

      const h2 = await aksi(request, headers, 'delete', [id]);
      console.log(`[hapus dua kali] status pertama ${h1.status} | status kedua ${h2.status} | message kedua: ${pesanDari(h2.b, h2.galat).slice(0, 80)}`);
      expect.soft(errorServer(h2.status), 'tidak boleh error server').toBe(false);
      expect.soft((await daftar(request, headers)).total, 'jumlah cabang tidak boleh berubah lagi').toBe(total);
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('hapus: id yang tidak ada (lihat hasil)', async ({ request }) => {
    const headers = await auth(request);
    const total = (await daftar(request, headers)).total;
    const h = await aksi(request, headers, 'delete', ['AUTO-TIDAK-ADA']);
    console.log(`[hapus id tidak ada] status ${h.status} | message: ${pesanDari(h.b, h.galat).slice(0, 80)}`);
    expect.soft(errorServer(h.status), 'tidak boleh error server').toBe(false);
    expect.soft((await daftar(request, headers)).total, 'jumlah cabang tidak boleh berubah').toBe(total);
  });

  test('hapus: satu id ada dan satu id tidak ada dalam satu permintaan (lihat hasil)', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      expect(a.status).toBe(200);
      const kode = String(a.data.code);
      const id = (await idKode(request, headers, kode))!;

      const h = await aksi(request, headers, 'delete', [id, 'AUTO-TIDAK-ADA']);
      const masihAda = !!(await cariKode(request, headers, kode));
      console.log(`[hapus campur ada dan tidak ada] status ${h.status} | message: ${pesanDari(h.b, h.galat).slice(0, 80)} | cabang yang valid masih ada: ${masihAda}`);
      expect.soft(errorServer(h.status), 'tidak boleh error server').toBe(false);
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('hapus cabang yang pelabuhannya punya rute aktif ditolak 409', async ({ request }) => {
    test.setTimeout(180_000);
    const headers = await auth(request);
    try {
      const p = await portRute(request, headers);
      test.skip(p === undefined, 'Tidak ketemu pelabuhan yang punya rute aktif');

      const a = await buat(request, headers, { port_ids: [p] });
      expect(a.status).toBe(200);
      const kode = String(a.data.code);
      const id = (await idKode(request, headers, kode))!;

      const h = await aksi(request, headers, 'delete', [id]);
      console.log(`[hapus, pelabuhan ${p} punya rute aktif] status ${h.status} | message: ${pesanDari(h.b, h.galat).slice(0, 80)}`);
      console.log(`   errors: ${JSON.stringify(h.b?.errors)?.slice(0, 150)}`);
      expect(h.status, 'dokumentasi: ditolak 409').toBe(409);
      expect.soft(pesanDari(h.b, h.galat), 'kode penolakan').toContain('FCAP-MASTER-IN-USE');
      expect.soft(await cariKode(request, headers, kode), 'cabang tetap ada').toBeDefined();
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('hapus: satu cabang aman dan satu cabang berrute aktif dalam satu permintaan (lihat hasil)', async ({ request }) => {
    test.setTimeout(180_000);
    const headers = await auth(request);
    try {
      const p = await portRute(request, headers);
      test.skip(p === undefined, 'Tidak ketemu pelabuhan yang punya rute aktif');

      const aman = await buat(request, headers, { port_ids: [PELABUHAN_AMAN[0]] });
      const rute = await buat(request, headers, { port_ids: [p] });
      expect(aman.status).toBe(200);
      expect(rute.status).toBe(200);
      const kodeAman = String(aman.data.code);
      const kodeRute = String(rute.data.code);
      const idAman = (await idKode(request, headers, kodeAman))!;
      const idRute = (await idKode(request, headers, kodeRute))!;

      const h = await aksi(request, headers, 'delete', [idAman, idRute]);
      const amanAda = !!(await cariKode(request, headers, kodeAman));
      const ruteAda = !!(await cariKode(request, headers, kodeRute));
      console.log(`[hapus campur aman dan berrute] status ${h.status} | cabang aman masih ada: ${amanAda} | cabang berrute masih ada: ${ruteAda}`);
      expect.soft(errorServer(h.status), 'tidak boleh error server').toBe(false);
      expect.soft(ruteAda, 'cabang berrute aktif tidak boleh terhapus').toBe(true);
    } finally {
      await bersihkan(request, headers);
    }
  });

  // ---------- PENUTUP ----------

  test('akhir: tidak ada data uji tersisa dan cabang asli utuh', async ({ request }) => {
    const headers = await auth(request);
    let { rows } = await daftar(request, headers);
    for (const x of rows.filter(uji)) {
      const h = await hapusAman(request, headers, String(x.code));
      console.log(`Sisa ${x.code}: ${h}`);
    }
    ({ rows } = await daftar(request, headers));
    expect.soft(rows.filter(uji).map((x) => String(x.code)), 'data uji yang masih tersisa').toEqual([]);

    if (!fs.existsSync(FILE_AWAL)) return;
    const awal: Record<string, string> = JSON.parse(fs.readFileSync(FILE_AWAL, 'utf8'));
    const berubah = Object.keys(awal).filter((k) => {
      const x = rows.find((y) => String(y.code) === k);
      return !x || sidik(x) !== awal[k];
    });
    expect.soft(berubah, 'cabang asli yang berubah atau hilang').toEqual([]);

    const baru = rows.filter((x) => !uji(x) && !(String(x.code) in awal)).map((x) => String(x.code));
    if (baru.length) console.log(`Cabang baru dari luar test selama run ini: ${baru.join(', ')}`);
  });
});