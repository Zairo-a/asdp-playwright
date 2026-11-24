import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

// Semua data uji berkode AUTO... dan hanya kode berawalan AUTO yang pernah dihapus
const PREFIX = 'AUTO';
const runId = Date.now().toString(36).toUpperCase().slice(-3);
let urut = 0;
const kodeBaru = () => `${PREFIX}${runId}${String(++urut).padStart(2, '0')}`; // 9 karakter

const URL_CABANG = 'cms/branches';
const jeda = (ms: number) => new Promise((s) => setTimeout(s, ms));
const potong = (v: any, n = 200) => (JSON.stringify(v) ?? 'undefined').slice(0, n);

type Hdr = Record<string, string>;

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

// Permintaan yang mengubah data tidak pernah diulang otomatis
const simpan = (request: APIRequestContext, headers: Hdr, data: any) =>
  request.post(URL_CABANG, { headers, data });

const aksi = (request: APIRequestContext, headers: Hdr, action: string, ids: string[]) =>
  request.post(`${URL_CABANG}/action`, { headers, data: { action, ids } });

async function daftar(request: APIRequestContext, headers: Hdr, pairs: [string, any][] = []) {
  const p = new URLSearchParams();
  p.append('limit', '100');
  for (const [k, v] of pairs) p.append(k, String(v));
  const r = await ambil(request, URL_CABANG, headers, p);
  const b = await baca(r);
  const blok = b?.result?.content?.[0];
  return {
    r, b,
    rows: (blok?.rows ?? []) as any[],
    total: (blok?.pagination?.total ?? 0) as number,
    filters: (b?.result?.filters ?? []) as any[],
  };
}

async function cariKode(request: APIRequestContext, headers: Hdr, kode: string) {
  const { rows } = await daftar(request, headers, [['search', kode]]);
  return rows.find((x) => String(x.code).toUpperCase() === kode.toUpperCase());
}

// Hanya kode berawalan AUTO yang boleh dihapus
async function hapusKode(request: APIRequestContext, headers: Hdr, kode: string[]) {
  const target = [...new Set(kode)];
  if (target.some((k) => !k.toUpperCase().startsWith(PREFIX))) {
    throw new Error(`Hanya kode berawalan ${PREFIX} yang boleh dihapus: ${target.join(', ')}`);
  }
  const ids: string[] = [];
  for (const k of target) {
    const x = await cariKode(request, headers, k);
    if (x) ids.push(String(x.id));
  }
  if (!ids.length) return undefined;
  return aksi(request, headers, 'delete', ids);
}

function idDari(p: any): number | undefined {
  if (typeof p === 'number' && Number.isFinite(p)) return p;
  if (typeof p === 'string' && /^\d+$/.test(p.trim())) return Number(p);
  if (p && typeof p === 'object') {
    for (const k of ['id', 'value', 'outlet_id', 'port_id']) {
      const v = idDari(p[k]);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

function daftarId(v: any): number[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return arr.map(idDari).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
}

const sidikJari = (x: any) =>
  JSON.stringify([x.id, x.code, x.name, x.company_code, x.phone, x.email, x.ports, x.status, x.is_active]);

// ---------- Persiapan: perusahaan dan pelabuhan yang cabang ujinya bisa dihapus ----------

type Siap = {
  headers: Hdr;
  perusahaan: string;
  labelPerusahaan: string;
  aman: number[];
  tersisa?: string;
  alasanSkip: string;
  awal: Map<string, string>;
};

async function kandidatPelabuhan(request: APIRequestContext, headers: Hdr, rows: any[]) {
  const dariDaftar = [...new Set(
    rows.flatMap((x) => (Array.isArray(x.ports) ? x.ports : []).map(idDari))
      .filter((v): v is number => v !== undefined),
  )];
  if (dariDaftar.length) return { sumber: 'daftar cabang', ids: dariDaftar };

  for (const jalur of ['cms/option/port', 'cms/options/port']) {
    const r = await ambil(request, jalur, headers);
    if (r.status() !== 200) continue;
    const b = await baca(r);
    const isi: any[] = Array.isArray(b?.result) ? b.result : (b?.result?.options ?? b?.result?.data ?? []);
    const ids = [...new Set(isi.map(idDari).filter((v): v is number => v !== undefined))];
    if (ids.length) return { sumber: jalur, ids };
  }
  return { sumber: 'tidak ketemu', ids: [] as number[] };
}

async function cariPelabuhanAman(request: APIRequestContext, headers: Hdr, perusahaan: string, kandidat: number[]) {
  const aman: number[] = [];
  let kode: string | undefined;
  let dicoba = 0;
  let ditolak409 = 0;
  let alasan = '';

  for (const p of kandidat) {
    if (aman.length >= 3 || dicoba >= 25) break;
    dicoba++;

    const isi: any = { name: 'AUTO cari pelabuhan', company_code: perusahaan, is_active: 1, port_ids: [p] };
    if (!kode) {
      const baru = kodeBaru();
      const r = await simpan(request, headers, { code: baru, ...isi });
      if (r.status() !== 200) {
        if (!alasan) alasan = `buat ${r.status()} ${potong(await baca(r), 160)}`;
        continue;
      }
      kode = baru;
    } else {
      const r = await simpan(request, headers, { id: kode, code: kode, ...isi });
      if (r.status() !== 200) {
        if (!alasan) alasan = `ubah ${r.status()} ${potong(await baca(r), 160)}`;
        continue;
      }
    }

    const h = await hapusKode(request, headers, [kode]);
    if (h?.status() === 200) {
      aman.push(p);
      kode = undefined;
    } else if (h?.status() === 409) {
      ditolak409++;
    } else {
      alasan = alasan || `hapus ${h?.status() ?? 'cabang tidak ketemu di daftar'}`;
      break;
    }
    await jeda(200);
  }
  return { aman, tersisa: kode, dicoba, ditolak409, alasan };
}

async function bangun(request: APIRequestContext): Promise<Siap> {
  const headers = await auth(request);
  let { rows, filters } = await daftar(request, headers);

  const sisa = rows.filter((x) => String(x.code).toUpperCase().startsWith(PREFIX)).map((x) => String(x.code));
  if (sisa.length) {
    const h = await hapusKode(request, headers, sisa);
    console.log(`Sisa data uji dari run sebelumnya: ${sisa.length} | hapus: ${h?.status() ?? '-'}`);
    ({ rows, filters } = await daftar(request, headers));
  }

  const awal = new Map<string, string>();
  for (const x of rows) {
    if (!String(x.code).toUpperCase().startsWith(PREFIX)) awal.set(String(x.code), sidikJari(x));
  }

  const opsi: any[] = filters.find((f) => f.key === 'companies')?.options ?? [];
  const pilih = opsi.find((o) => o.value === 'GKM') ?? opsi[0];
  const perusahaan = String(pilih?.value ?? '');
  const labelPerusahaan = String(pilih?.label ?? '');
  console.log(`Perusahaan uji: ${perusahaan} (${labelPerusahaan}) | cabang awal: ${awal.size}`);

  const urutan = [...rows].sort((a, b) => (a.ports?.length ?? 0) - (b.ports?.length ?? 0));
  const kand = await kandidatPelabuhan(request, headers, urutan);
  console.log(`Kandidat pelabuhan: ${kand.ids.length} dari ${kand.sumber} | bentuk satu pelabuhan di daftar: ${potong(rows[0]?.ports?.[0])}`);

  let alasanSkip = '';
  let aman: number[] = [];
  let tersisa: string | undefined;
  if (!perusahaan) {
    alasanSkip = 'daftar perusahaan di filter kosong';
  } else if (!kand.ids.length) {
    alasanSkip = 'tidak ada id pelabuhan di daftar cabang maupun di option/port';
  } else {
    const hasil = await cariPelabuhanAman(request, headers, perusahaan, kand.ids);
    aman = hasil.aman;
    tersisa = hasil.tersisa;
    console.log(
      `Pelabuhan tanpa rute aktif: ${aman.join(', ') || '-'} | dicoba ${hasil.dicoba} | cabang uji ditolak hapus (409): ${hasil.ditolak409}` +
      (hasil.alasan ? ` | catatan: ${hasil.alasan}` : ''),
    );
    if (tersisa) console.log(`PERHATIAN: cabang ${tersisa} tersisa dan tidak bisa dihapus, hapus manual di layar Cabang`);
    if (!aman.length) alasanSkip = `tidak ada pelabuhan tanpa rute aktif (${hasil.alasan || 'semua ditolak hapus'})`;
  }
  return { headers, perusahaan, labelPerusahaan, aman, tersisa, alasanSkip, awal };
}

let siapCache: Promise<Siap> | undefined;
function siap(request: APIRequestContext) {
  if (!siapCache) siapCache = bangun(request);
  return siapCache;
}

// ---------- Pembantu untuk test ----------

const dibuat: string[] = [];

function isi(s: Siap, ubahan: Record<string, any> = {}) {
  return {
    code: kodeBaru(),
    name: 'AUTO uji cabang',
    company_code: s.perusahaan,
    is_active: 1,
    port_ids: [s.aman[0]],
    ...ubahan,
  };
}

async function buat(request: APIRequestContext, s: Siap, ubahan: Record<string, any> = {}) {
  const data = isi(s, ubahan);
  const r = await simpan(request, s.headers, data);
  const b = await baca(r);
  if (r.status() === 200 && data.code) dibuat.push(String(data.code));
  return { r, b, data, kode: String(data.code) };
}

async function bersihkan(request: APIRequestContext, s: Siap) {
  const kode = [...new Set(dibuat.splice(0))];
  if (!kode.length) return;
  const h = await hapusKode(request, s.headers, kode);
  if (h?.status() !== 200) console.log(`PEMBERSIHAN GAGAL (${h?.status() ?? '-'}): ${kode.join(', ')} masih ada, hapus manual`);
  expect.soft(h?.status(), `pembersihan ${kode.join(', ')}`).toBe(200);
}

async function dengan(request: APIRequestContext, jalankan: (s: Siap) => Promise<void>) {
  const s = await siap(request);
  test.skip(s.aman.length === 0, s.alasanSkip || 'tidak ada pelabuhan yang aman dipakai');
  try {
    await jalankan(s);
  } finally {
    await bersihkan(request, s);
  }
}

const pelabuhan = (s: Siap) => [s.aman[0]];

test.describe('cabang tambah (MENGUBAH DATA)', () => {
  test.skip(process.env.ALLOW_WRITE !== '1', 'Dilewati. Untuk menjalankan, set ALLOW_WRITE=1');
  test.describe.configure({ retries: 0 });

  test('siap: syarat awal dan pelabuhan untuk data uji', async ({ request }) => {
    test.setTimeout(300_000);
    const s = await siap(request);
    expect(s.perusahaan, 'perusahaan untuk data uji').toBeTruthy();
    expect(s.aman.length, s.alasanSkip || 'harus ada pelabuhan tanpa rute aktif').toBeGreaterThan(0);
  });

  // ---------- Positif ----------

  test('tambah: data minimal valid berhasil dan muncul di daftar', async ({ request }) => {
    await dengan(request, async (s) => {
      const sebelum = (await daftar(request, s.headers)).total;
      const { r, b, kode, data } = await buat(request, s);
      expect(r.status()).toBe(200);
      expect.soft(b?.message, 'message').toBe('Data saved successfully');

      const h = b?.result;
      expect.soft(h?.code, 'code').toBe(kode);
      expect.soft(h?.name, 'name').toBe(data.name);
      expect.soft(h?.company_code, 'company_code').toBe(s.perusahaan);
      expect.soft(h?.company_name, 'company_name').toBe(s.labelPerusahaan);
      expect.soft(Boolean(h?.is_active), 'is_active').toBe(true);
      expect.soft(daftarId(h?.port_ids), 'port_ids').toEqual(pelabuhan(s));

      const sesudah = await daftar(request, s.headers);
      expect.soft(sesudah.total, 'jumlah cabang bertambah satu').toBe(sebelum + 1);
      const baris = await cariKode(request, s.headers, kode);
      expect(baris, 'cabang baru ada di daftar').toBeDefined();
      expect.soft(baris.name, 'nama di daftar').toBe(data.name);
      expect.soft(baris.company_code, 'perusahaan di daftar').toBe(s.perusahaan);
      expect.soft(baris.status, 'status di daftar').toBe('Active');
      expect.soft(Array.isArray(baris.ports) ? baris.ports.length : -1, 'jumlah pelabuhan di daftar').toBe(1);
    });
  });

  test('tambah: semua isian (telepon, email, alamat) tersimpan', async ({ request }) => {
    await dengan(request, async (s) => {
      const lengkap = {
        phone: '0210000000',
        email: `auto.${runId.toLowerCase()}@example.com`,
        address: 'Alamat uji AUTO',
      };
      const { r, b, kode } = await buat(request, s, lengkap);
      expect(r.status()).toBe(200);
      const h = b?.result;
      expect.soft(h?.phone, 'phone').toBe(lengkap.phone);
      expect.soft(h?.email, 'email').toBe(lengkap.email);
      expect.soft(h?.address, 'address').toBe(lengkap.address);

      const baris = await cariKode(request, s.headers, kode);
      expect(baris).toBeDefined();
      expect.soft(baris.phone, 'phone di daftar').toBe(lengkap.phone);
      expect.soft(baris.email, 'email di daftar').toBe(lengkap.email);
    });
  });

  test('tambah: beberapa pelabuhan sekaligus', async ({ request }) => {
    await dengan(request, async (s) => {
      test.skip(s.aman.length < 2, 'Hanya ditemukan satu pelabuhan tanpa rute aktif');
      const { r, b, kode } = await buat(request, s, { port_ids: s.aman });
      expect(r.status()).toBe(200);
      expect.soft(daftarId(b?.result?.port_ids), 'port_ids').toEqual([...s.aman].sort((a, c) => a - c));
      if (Array.isArray(b?.result?.ports)) {
        expect.soft(b.result.ports.length, 'jumlah pelabuhan di balasan').toBe(s.aman.length);
      }
      const baris = await cariKode(request, s.headers, kode);
      expect.soft(Array.isArray(baris?.ports) ? baris.ports.length : -1, 'jumlah pelabuhan di daftar').toBe(s.aman.length);
    });
  });

  test('tambah: nonaktif (is_active 0) muncul sebagai Inactive dan terfilter', async ({ request }) => {
    await dengan(request, async (s) => {
      const { r, b, kode } = await buat(request, s, { is_active: 0 });
      expect(r.status()).toBe(200);
      expect.soft(Boolean(b?.result?.is_active), 'is_active di balasan').toBe(false);

      const baris = await cariKode(request, s.headers, kode);
      expect(baris).toBeDefined();
      expect.soft(baris.status, 'status di daftar').toBe('Inactive');

      const nonaktif = await daftar(request, s.headers, [['status[]', 'inactive']]);
      const aktif = await daftar(request, s.headers, [['status[]', 'active']]);
      expect.soft(nonaktif.rows.map((x) => x.code), 'ada di filter nonaktif').toContain(kode);
      expect.soft(aktif.rows.map((x) => x.code), 'tidak ada di filter aktif').not.toContain(kode);
    });
  });

  test('tambah: kode dengan garis bawah dan strip diterima', async ({ request }) => {
    await dengan(request, async (s) => {
      const kode = `${PREFIX}-${runId}_`;
      const { r } = await buat(request, s, { code: kode });
      expect(r.status()).toBe(200);
      expect(await cariKode(request, s.headers, kode), 'ada di daftar').toBeDefined();
    });
  });

  test('tambah: semua isian tepat di batas panjang diterima (dugaan, gagal belum tentu bug)', async ({ request }) => {
    await dengan(request, async (s) => {
      const batas = {
        code: `${PREFIX}${runId}B${String(++urut).padStart(2, '0')}`, // 10 karakter
        name: `AUTO ${'n'.repeat(95)}`,                                // 100 karakter
        phone: '0'.repeat(30),                                         // 30 karakter
        email: `${'a'.repeat(60)}@${'b'.repeat(35)}.com`,              // 100 karakter
        address: 'a'.repeat(255),                                      // 255 karakter
      };
      expect(batas.code.length).toBe(10);
      expect(batas.name.length).toBe(100);
      expect(batas.email.length).toBe(100);

      const { r, b } = await buat(request, s, batas);
      console.log(`[batas panjang] status ${r.status()} | message: ${b?.message ?? '-'}`);
      expect(r.status()).toBe(200);
      expect.soft(b?.result?.name, 'name tersimpan utuh').toBe(batas.name);
      expect.soft(b?.result?.phone, 'phone tersimpan utuh').toBe(batas.phone);
      expect.soft(b?.result?.email, 'email tersimpan utuh').toBe(batas.email);
      expect.soft(b?.result?.address, 'address tersimpan utuh').toBe(batas.address);
    });
  });

  test('tambah: telepon dan email boleh sama dengan cabang lain (dugaan, gagal belum tentu bug)', async ({ request }) => {
    await dengan(request, async (s) => {
      const sama = { phone: '0210000001', email: `sama.${runId.toLowerCase()}@example.com` };
      const a = await buat(request, s, sama);
      const c = await buat(request, s, sama);
      console.log(`[telepon dan email sama] status ${a.r.status()} dan ${c.r.status()} | message kedua: ${c.b?.message ?? '-'}`);
      expect.soft(a.r.status(), 'cabang pertama').toBe(200);
      expect.soft(c.r.status(), 'cabang kedua dengan telepon dan email yang sama').toBe(200);
    });
  });

  test('tambah: pelabuhan yang sama boleh dipakai beberapa cabang', async ({ request }) => {
    await dengan(request, async (s) => {
      const a = await buat(request, s);
      const c = await buat(request, s);
      expect(a.r.status()).toBe(200);
      expect(c.r.status(), 'dokumentasi: satu pelabuhan bisa milik beberapa cabang').toBe(200);
      expect(daftarId(c.b?.result?.port_ids)).toEqual(pelabuhan(s));
    });
  });

  test('tambah: kode yang hanya beda angka nol di depan dianggap berbeda', async ({ request }) => {
    await dengan(request, async (s) => {
      const nol = `${PREFIX}${runId}Z07`;
      const tanpaNol = `${PREFIX}${runId}Z7`;
      const a = await buat(request, s, { code: nol });
      const c = await buat(request, s, { code: tanpaNol });
      expect(a.r.status()).toBe(200);
      expect(c.r.status()).toBe(200);
      expect(await cariKode(request, s.headers, nol), `${nol} ada`).toBeDefined();
      expect(await cariKode(request, s.headers, tanpaNol), `${tanpaNol} ada`).toBeDefined();
    });
  });

  test('tambah: spasi di awal dan akhir nama (lihat hasil)', async ({ request }) => {
    await dengan(request, async (s) => {
      const { r, b } = await buat(request, s, { name: '  AUTO spasi  ' });
      console.log(`[spasi di nama] status ${r.status()} | nama tersimpan: ${JSON.stringify(b?.result?.name)}`);
      expect.soft(r.status(), 'tidak boleh error server').toBeLessThan(500);
    });
  });

  test('tambah: karakter khusus dan emoji pada nama (lihat hasil)', async ({ request }) => {
    await dengan(request, async (s) => {
      const nama = ['AUTO <b>x</b>', `AUTO 'kutip' "ganda"`, 'AUTO emoji 😀', 'AUTO %_ \\ /', 'AUTO <script>x</script>'];
      for (const n of nama) {
        const { r, b } = await buat(request, s, { name: n });
        const sama = r.status() === 200 ? b?.result?.name === n : '-';
        console.log(`[nama ${JSON.stringify(n)}] status ${r.status()} | tersimpan sama persis: ${sama}`);
        expect.soft(r.status(), `nama ${JSON.stringify(n)}: tidak boleh error server`).toBeLessThan(500);
        await jeda(200);
      }
    });
  });

  test('tambah: kode yang sama dikirim dua kali, yang kedua ditolak dan tidak menimpa', async ({ request }) => {
    await dengan(request, async (s) => {
      const pertama = await buat(request, s, { name: 'AUTO pertama' });
      expect(pertama.r.status()).toBe(200);

      const kedua = await buat(request, s, { code: pertama.kode, name: 'AUTO kedua' });
      console.log(`[kode sama] status ${kedua.r.status()} | message: ${kedua.b?.message ?? '-'}`);
      expect([409, 422], 'kode yang sudah ada harus ditolak').toContain(kedua.r.status());

      const baris = await cariKode(request, s.headers, pertama.kode);
      expect.soft(baris?.name, 'data pertama tidak boleh tertimpa').toBe('AUTO pertama');
      const { rows } = await daftar(request, s.headers, [['search', pertama.kode]]);
      expect.soft(rows.filter((x) => x.code === pertama.kode).length, 'hanya satu cabang dengan kode itu').toBe(1);
    });
  });

  test('tambah: dua permintaan bersamaan dengan kode yang sama (dugaan, gagal belum tentu bug)', async ({ request }) => {
    await dengan(request, async (s) => {
      const data = isi(s, { name: 'AUTO bersamaan' });
      const [a, c] = await Promise.all([simpan(request, s.headers, data), simpan(request, s.headers, data)]);
      const status = [a.status(), c.status()].sort();
      if (status.includes(200)) dibuat.push(String(data.code));
      console.log(`[bersamaan] status ${status.join(' dan ')}`);

      const { rows } = await daftar(request, s.headers, [['search', String(data.code)]]);
      expect.soft(rows.filter((x) => x.code === data.code).length, 'hanya satu cabang dengan kode itu').toBe(1);
      expect.soft(status.filter((x) => x === 200).length, 'hanya satu permintaan yang berhasil').toBe(1);
      expect.soft(Math.max(...status), 'tidak boleh error server').toBeLessThan(500);
    });
  });

  test('tambah: pelabuhan yang sama dua kali dalam satu permintaan (lihat hasil)', async ({ request }) => {
    await dengan(request, async (s) => {
      const { r, b } = await buat(request, s, { port_ids: [s.aman[0], s.aman[0]] });
      console.log(`[port_ids ganda] status ${r.status()} | port_ids tersimpan: ${potong(b?.result?.port_ids, 80)}`);
      expect.soft(r.status(), 'tidak boleh error server').toBeLessThan(500);
    });
  });

  test('tambah: telepon berisi huruf (lihat hasil)', async ({ request }) => {
    await dengan(request, async (s) => {
      const { r, b } = await buat(request, s, { phone: 'abc-telepon' });
      console.log(`[telepon huruf] status ${r.status()} | message: ${b?.message ?? '-'} | tersimpan: ${JSON.stringify(b?.result?.phone)}`);
      expect.soft(r.status(), 'tidak boleh error server').toBeLessThan(500);
    });
  });

  // ---------- Negatif ----------

  const negatif: [string, (s: Siap) => Record<string, any>][] = [
    ['tanpa code', () => ({ code: undefined })],
    ['code kosong', () => ({ code: '' })],
    ['code 11 karakter', () => ({ code: `${PREFIX}${runId}0000` })],
    ['code huruf kecil', () => ({ code: `auto${runId.toLowerCase()}01` })],
    ['code berisi spasi', () => ({ code: `${PREFIX} ${runId}` })],
    ['code karakter khusus', () => ({ code: `${PREFIX}@${runId}` })],
    ['tanpa name', () => ({ name: undefined })],
    ['name kosong', () => ({ name: '' })],
    ['name hanya spasi (dugaan)', () => ({ name: '   ' })],
    ['name 101 karakter', () => ({ name: 'n'.repeat(101) })],
    ['tanpa company_code', () => ({ company_code: undefined })],
    ['company_code kosong', () => ({ company_code: '' })],
    ['company_code tidak ada', () => ({ company_code: 'ZZZ99' })],
    ['phone 31 karakter', () => ({ phone: '0'.repeat(31) })],
    ['email format salah', () => ({ email: 'bukan-email' })],
    ['email 101 karakter', () => ({ email: `${'a'.repeat(60)}@${'b'.repeat(36)}.com` })],
    ['address 256 karakter', () => ({ address: 'a'.repeat(256) })],
    ['tanpa is_active', () => ({ is_active: undefined })],
    ['is_active 2', () => ({ is_active: 2 })],
    ['is_active huruf', () => ({ is_active: 'abc' })],
    ['is_active -1', () => ({ is_active: -1 })],
    ['tanpa port_ids', () => ({ port_ids: undefined })],
    ['port_ids kosong', () => ({ port_ids: [] })],
    ['port_ids bukan daftar', () => ({ port_ids: 'abc' })],
    ['port_ids berisi huruf', () => ({ port_ids: ['abc'] })],
    ['port_ids tidak ada', () => ({ port_ids: [999999999] })],
    ['port_ids nol (dugaan)', () => ({ port_ids: [0] })],
  ];

  for (const [nama, ubahan] of negatif) {
    test(`tambah gagal: ${nama}`, async ({ request }) => {
      await dengan(request, async (s) => {
        const sebelum = (await daftar(request, s.headers)).total;
        const { r, b } = await buat(request, s, ubahan(s));
        console.log(`[${nama}] status ${r.status()} | message: ${b?.message ?? '-'}`);
        expect(r.status()).toBe(422);
        const sesudah = (await daftar(request, s.headers)).total;
        expect.soft(sesudah, 'jumlah cabang tidak boleh berubah').toBe(sebelum);
      });
    });
  }

  test('tambah gagal: body kosong', async ({ request }) => {
    await dengan(request, async (s) => {
      const sebelum = (await daftar(request, s.headers)).total;
      const r = await simpan(request, s.headers, {});
      console.log(`[body kosong] status ${r.status()} | message: ${(await baca(r))?.message ?? '-'}`);
      expect(r.status()).toBe(422);
      expect.soft((await daftar(request, s.headers)).total, 'jumlah cabang tidak boleh berubah').toBe(sebelum);
    });
  });

  test('tambah gagal: tanpa token ditolak', async ({ request }) => {
    await dengan(request, async (s) => {
      const data = isi(s);
      const r = await request.post(URL_CABANG, { data });
      if (r.status() === 200) dibuat.push(String(data.code));
      expect(r.status()).toBe(401);
    });
  });

  test('tambah gagal: token ngawur ditolak', async ({ request }) => {
    await dengan(request, async (s) => {
      const data = isi(s);
      const r = await request.post(URL_CABANG, { data, headers: { Authorization: 'Bearer token-ngawur-123' } });
      if (r.status() === 200) dibuat.push(String(data.code));
      expect(r.status()).toBe(401);
    });
  });

  // ---------- Penutup ----------

  test('akhir: tidak ada data uji tersisa dan cabang awal utuh', async ({ request }) => {
    const s = await siap(request);
    let { rows } = await daftar(request, s.headers);

    const sisa = rows.filter((x) => String(x.code).toUpperCase().startsWith(PREFIX)).map((x) => String(x.code));
    if (sisa.length) {
      const h = await hapusKode(request, s.headers, sisa);
      console.log(`Sisa data uji dibersihkan: ${sisa.join(', ')} | hapus ${h?.status() ?? '-'}`);
      ({ rows } = await daftar(request, s.headers));
    }
    expect.soft(sisa, 'data uji yang masih tersisa di akhir').toEqual([]);

    const berubah = [...s.awal.keys()].filter((k) => {
      const x = rows.find((y) => String(y.code) === k);
      return !x || sidikJari(x) !== s.awal.get(k);
    });
    expect.soft(berubah, 'cabang awal yang berubah atau hilang').toEqual([]);

    const asing = rows.filter((x) => !s.awal.has(String(x.code))).map((x) => String(x.code));
    expect.soft(asing, 'cabang yang tidak ada di keadaan awal').toEqual([]);
  });
});