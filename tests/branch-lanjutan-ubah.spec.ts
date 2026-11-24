import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

// Semua data uji berkode AUTO... dengan nama berawalan AUTO. Hanya yang seperti itu yang boleh dihapus.
const PREFIX = 'AUTO';
const runId = Date.now().toString(36).toUpperCase().slice(-3);
let urut = 0;
const kodeBaru = () => `${PREFIX}${runId}${String(++urut).padStart(2, '0')}`; // 9 karakter

// Pelabuhan yang pada run sebelumnya terbukti tidak punya rute aktif (cabang uji bisa dihapus)
const PELABUHAN_AMAN = [3, 5, 6];
const URL_CABANG = 'cms/branches';

const jeda = (ms: number) => new Promise((s) => setTimeout(s, ms));

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

// Permintaan yang mengubah data tidak pernah diulang otomatis.
// Kalau koneksi terputus, hasilnya status 0 dan test tetap berjalan.
async function kirim(request: APIRequestContext, headers: Hdr, data: any) {
  try {
    const r = await request.post(URL_CABANG, { headers, data });
    return { status: r.status(), b: await baca(r), galat: '' };
  } catch (e: any) {
    return { status: 0, b: undefined as any, galat: String(e?.message ?? e).split('\n')[0] };
  }
}

const aksi = (request: APIRequestContext, headers: Hdr, action: string, ids: string[]) =>
  request.post(`${URL_CABANG}/action`, { headers, data: { action, ids } });

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

// Data uji: kode DAN nama sama-sama berawalan AUTO
const uji = (x: any) =>
  String(x.code).toUpperCase().startsWith(PREFIX) && String(x.name).toUpperCase().startsWith('AUTO');

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
  if (h.status() === 200) return 'terhapus';
  if (h.status() !== 409) return `gagal ${h.status()}`;

  for (const p of PELABUHAN_AMAN) {
    const r = await kirim(request, headers, {
      id: String(x.code), code: String(x.code), name: String(x.name),
      company_code: String(x.company_code), is_active: Number(x.is_active), port_ids: [p],
    });
    if (r.status !== 200) continue;
    h = await aksi(request, headers, 'delete', [String(x.id)]);
    if (h.status() === 200) return `terhapus setelah dipindah ke pelabuhan ${p}`;
  }
  return 'gagal (409, tidak ada pelabuhan aman yang berhasil)';
}

const dibuat: string[] = [];

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
  name: 'AUTO uji lanjutan',
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
  return { ...r, data };
}

const pesanDari = (b: any, galat: string) => String(b?.message ?? galat ?? '-');
const errorServer = (status: number) => status === 0 || status >= 500;

test.describe('cabang lanjutan (MENGUBAH DATA)', () => {
  test.skip(process.env.ALLOW_WRITE !== '1', 'Dilewati. Untuk menjalankan, set ALLOW_WRITE=1');
  test.describe.configure({ retries: 0 });

  test('pulihkan: hapus sisa data uji dari run sebelumnya dan catat cabang yang ada', async ({ request }) => {
    const headers = await auth(request);
    const { rows } = await daftar(request, headers);
    const sisa = rows.filter(uji).map((x) => String(x.code));
    console.log(`Sisa data uji: ${sisa.join(', ') || '-'}`);

    for (const k of sisa) {
      const hasil = await hapusAman(request, headers, k);
      console.log(`  ${k}: ${hasil}`);
      expect.soft(hasil.startsWith('terhapus') || hasil === 'tidak ada', `pulihkan ${k}: ${hasil}`).toBe(true);
    }

    const akhir = await daftar(request, headers);
    console.log(`Cabang yang ada: ${akhir.rows.length} (total ${akhir.total})`);
    for (const x of akhir.rows) console.log(`  ${x.code} | ${x.name} | ${x.company_code} | ${x.status}`);
  });

  test('telepon: panjang berapa yang benar-benar diterima (dokumentasi: maksimal 30)', async ({ request }) => {
    const headers = await auth(request);
    const hasil: [number, number][] = [];
    try {
      for (const n of [10, 15, 20, 25, 30]) {
        const r = await buat(request, headers, { phone: '0'.repeat(n) });
        const pesan = pesanDari(r.b, r.galat);
        const kolom = pesan.match(/column '([^']+)'/)?.[1] ?? '-';
        console.log(`[telepon ${n} karakter] status ${r.status} | kolom bermasalah: ${kolom} | message: ${pesan.slice(0, 70)}`);
        hasil.push([n, r.status]);
        expect.soft(errorServer(r.status), `telepon ${n} karakter: tidak boleh error server`).toBe(false);
        await jeda(300);
      }
      const gagal = hasil.filter(([, s]) => s >= 500).map(([n]) => n);
      if (gagal.length) {
        test.info().annotations.push({
          type: 'temuan',
          description: `Telepon ${gagal.join(', ')} karakter menyebabkan error server (500), padahal dokumentasi mengizinkan sampai 30. Pesan error memuat nama tabel, kolom, dan database`,
        });
      }
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('batas tiap isian satu per satu: nama, email, alamat, kode', async ({ request }) => {
    const headers = await auth(request);
    const kasus: [string, Record<string, any>][] = [
      ['name 100 karakter', { name: `AUTO ${'n'.repeat(95)}` }],
      ['email 100 karakter', { email: `${'a'.repeat(60)}@${'b'.repeat(35)}.com` }],
      ['address 255 karakter', { address: 'a'.repeat(255) }],
      ['code 10 karakter', { code: `${PREFIX}${runId}X${String(++urut).padStart(2, '0')}` }],
    ];
    const bermasalah: string[] = [];
    try {
      for (const [nama, ubahan] of kasus) {
        const r = await buat(request, headers, ubahan);
        const pesan = pesanDari(r.b, r.galat);
        const kolom = pesan.match(/column '([^']+)'/)?.[1] ?? '-';
        console.log(`[${nama}] status ${r.status} | kolom bermasalah: ${kolom} | message: ${pesan.slice(0, 70)}`);
        if (errorServer(r.status)) bermasalah.push(nama);
        expect.soft(errorServer(r.status), `${nama}: tidak boleh error server`).toBe(false);
        await jeda(300);
      }
      if (bermasalah.length) {
        test.info().annotations.push({
          type: 'temuan',
          description: `Isian tepat di batas dokumentasi menyebabkan error server: ${bermasalah.join(', ')}`,
        });
      }
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('port_ids berisi nol diulang tiga kali (dugaan, gagal belum tentu bug)', async ({ request }) => {
    const headers = await auth(request);
    const status: number[] = [];
    try {
      for (let i = 1; i <= 3; i++) {
        const r = await buat(request, headers, { port_ids: [0] });
        console.log(`[port_ids [0], percobaan ${i}] status ${r.status} | message: ${pesanDari(r.b, r.galat).slice(0, 80)}`);
        status.push(r.status);
        expect.soft(r.status, `percobaan ${i}: harus ditolak 422`).toBe(422);
        await jeda(500);
      }
      if (status.every((s) => s === 0)) {
        test.info().annotations.push({
          type: 'temuan',
          description: 'port_ids [0] membuat koneksi terputus tiga kali berturut-turut (bukan 422)',
        });
      }
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('kode huruf kecil yang benar-benar baru (lihat hasil)', async ({ request }) => {
    const headers = await auth(request);
    const kode = `auto${runId.toLowerCase()}l${String(++urut).padStart(2, '0')}`;
    try {
      const r = await buat(request, headers, { code: kode });
      const tersimpan = r.b?.result?.code;
      console.log(`[kode huruf kecil ${kode}] status ${r.status} | message: ${pesanDari(r.b, r.galat).slice(0, 80)} | tersimpan sebagai: ${tersimpan ?? '-'}`);
      expect.soft(errorServer(r.status), 'tidak boleh error server').toBe(false);
      if (r.status === 200 && tersimpan === kode) {
        test.info().annotations.push({
          type: 'temuan',
          description: 'Kode huruf kecil diterima dan disimpan apa adanya, padahal dokumentasi mensyaratkan huruf besar, angka, garis bawah, dan strip',
        });
      }
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('kode bekas cabang yang sudah dihapus: bisa dipakai lagi atau tidak (lihat hasil)', async ({ request }) => {
    const headers = await auth(request);
    try {
      const a = await buat(request, headers);
      expect(a.status, 'pembuatan pertama').toBe(200);
      const kode = String(a.data.code);

      const h = await hapusAman(request, headers, kode);
      console.log(`[hapus ${kode}] ${h}`);
      expect(h.startsWith('terhapus'), 'cabang uji harus bisa dihapus').toBe(true);

      const c = await kirim(request, headers, { ...a.data, name: 'AUTO pakai ulang' });
      console.log(`[buat lagi dengan kode yang sama setelah dihapus] status ${c.status} | message: ${pesanDari(c.b, c.galat).slice(0, 80)}`);
      expect.soft(errorServer(c.status), 'tidak boleh error server').toBe(false);
    } finally {
      await bersihkan(request, headers);
    }
  });

  test('akhir: tidak ada data uji tersisa', async ({ request }) => {
    const headers = await auth(request);
    let { rows } = await daftar(request, headers);
    for (const x of rows.filter(uji)) {
      const h = await hapusAman(request, headers, String(x.code));
      console.log(`Sisa ${x.code}: ${h}`);
    }
    ({ rows } = await daftar(request, headers));
    expect.soft(rows.filter(uji).map((x) => String(x.code)), 'data uji yang masih tersisa').toEqual([]);
  });
});