import { test, expect, type BrowserContextOptions } from '@playwright/test';
import { PerusahaanPage, acak, bersihkanPerusahaanQA, perusahaanDiFormKapal } from './pages/perusahaan.pages';
import { buatKapalQA } from './pages/golongan.pages';
import { bersihkanKapalQA } from './pages/kapal.pages';
import { cekTemuan } from './pages/kapasitas.pages';

/**
 * MASTER DATA — PERUSAHAAN — MENGUBAH DATA (butuh ALLOW_WRITE=1)
 * Hanya perusahaan uji milik QA (kode diawali "QAPR" + acak), dibuat & dihapus lewat layar.
 * Kapal uji "QAKPPR…" dibuat lewat API untuk uji "Jumlah Kapal", kode terkunci & hapus ditolak, lalu dihapus.
 * Data uji SELALU dibersihkan di awal & akhir. Perusahaan asli tidak disentuh.
 * Dampak: perusahaan Aktif muncul di pilihan "Perusahaan" form Kapal, Nonaktif tidak; "Jumlah Kapal" ikut bertambah.
 * ID: PR-3x, PR-T07/T08
 */

test.describe.configure({ mode: 'serial' });
test.skip(process.env.ALLOW_WRITE !== '1', 'Set ALLOW_WRITE=1 untuk menjalankan test yang mengubah data');

const AWALAN = 'QAPR';
const KODE = AWALAN + acak(3);
const KODE_NON = AWALAN + acak(3);
const NAMA = `PT QA AUTO ${KODE}`;
const NAMA_BARU = `PT QA AUTO ${KODE} EDIT`;
const AWALAN_KAPAL = 'QAKPPR';
const KAPAL = AWALAN_KAPAL + acak(3);
const KAPAL_CONTOH = process.env.KP_KAPAL_WEB ?? 'QAWTAXI01';
let dibuat = false;

async function apiCtx(playwright: any) {
  const u = test.info().project.use as BrowserContextOptions & { baseURL?: string };
  return playwright.request.newContext({ baseURL: u.baseURL, storageState: u.storageState as string });
}
async function bersihkan(playwright: any) {
  const req = await apiCtx(playwright);
  try {
    await bersihkanKapalQA(req, AWALAN_KAPAL); // kapal dulu (masih memakai perusahaan uji)
    await bersihkanPerusahaanQA(req, AWALAN);
  } finally {
    await req.dispose();
  }
}
test.beforeAll(async ({ playwright }) => bersihkan(playwright));
test.afterAll(async ({ playwright }) => bersihkan(playwright));

const sel = async (p: PerusahaanPage, kode: string) => { await p.goto({ search: kode }); return (await p.semuaBaris()).find((r) => r.Kode === kode) ?? null; };

test.describe('Perusahaan — siklus data uji', () => {
  test('[Positif] PR-30 Tambah perusahaan → muncul Aktif dengan Jumlah Cabang 0 & Jumlah Kapal 0', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.tambah({ kode: KODE, nama: NAMA, telepon: '081234567890', email: 'qa.auto@example.com', alamat: 'Jl. Uji Otomatis' });
    dibuat = true;
    await expect.poll(async () => { await p.goto(); return p.totalData(); }).toBe(awal + 1);
    const r = await sel(p, KODE);
    expect(r?.['Nama Perusahaan']).toBe(NAMA);
    expect(r?.Email).toBe('qa.auto@example.com');
    expect(r?.['Jumlah Cabang']).toBe('0');
    expect(r?.['Jumlah Kapal']).toBe('0');
    expect(r?.Status).toBe('Aktif');
  });

  test('[Dampak] PR-31 perusahaan baru (Aktif) muncul di pilihan "Perusahaan" form Kapal', async ({ page }) => {
    test.skip(!dibuat, 'PR-30 gagal');
    expect(await perusahaanDiFormKapal(page, KODE)).toContain(NAMA);
  });

  test('[Negatif] PR-32 kode perusahaan yang sudah dipakai → ditolak, tidak ada data ganda', async ({ page }) => {
    test.skip(!dibuat, 'PR-30 gagal');
    const p = new PerusahaanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: KODE, nama: NAMA + ' DUP' });
    const hasil = await p.simpan();
    expect(hasil).not.toMatch(/berhasil/i);
    await p.tutupForm();
    await p.goto({ search: KODE });
    expect((await p.semuaBaris()).filter((r) => r.Kode === KODE)).toHaveLength(1);
  });

  test('[Positif] PR-33 Ubah nama, telepon & email → daftar ikut berubah; [Dampak] nama baru di form Kapal', async ({ page }) => {
    test.skip(!dibuat, 'PR-30 gagal');
    const p = new PerusahaanPage(page);
    await p.goto({ search: KODE });
    await p.bukaUbah(KODE);
    await p.isi({ nama: NAMA_BARU, telepon: '0219876543', email: 'qa.edit@example.com' });
    expect(await p.simpan()).toMatch(/berhasil/i);
    const r = await sel(p, KODE);
    expect(r?.['Nama Perusahaan']).toBe(NAMA_BARU);
    expect(r?.Email).toBe('qa.edit@example.com');
    const opsi = await perusahaanDiFormKapal(page, KODE);
    expect(opsi).toContain(NAMA_BARU);
  });

  test('[Dampak] PR-34 Nonaktifkan → Status "Nonaktif", menu "Aktifkan", hilang dari pilihan Perusahaan form Kapal', async ({ page }) => {
    test.skip(!dibuat, 'PR-30 gagal');
    const p = new PerusahaanPage(page);
    await p.goto({ search: KODE });
    await p.ubahStatus(KODE, false);
    expect((await sel(p, KODE))?.Status).toBe('Nonaktif');
    expect(await p.daftarAksi(KODE)).toContain('Aktifkan');
    expect(await perusahaanDiFormKapal(page, KODE)).not.toContain(NAMA_BARU);
  });

  test('[Dampak] PR-35 Aktifkan kembali → Status "Aktif", muncul lagi di form Kapal', async ({ page }) => {
    test.skip(!dibuat, 'PR-30 gagal');
    const p = new PerusahaanPage(page);
    await p.goto({ search: KODE });
    await p.ubahStatus(KODE, true);
    expect((await sel(p, KODE))?.Status).toBe('Aktif');
    expect(await perusahaanDiFormKapal(page, KODE)).toContain(NAMA_BARU);
  });

  test('[Dampak] PR-36 kapal baru memakai perusahaan uji → "Jumlah Kapal" jadi 1; kode perusahaan terkunci; hapus ditolak', async ({ page, request, playwright }) => {
    test.skip(!dibuat, 'PR-30 gagal');
    await buatKapalQA(request, KAPAL, 'IVA', KAPAL_CONTOH, 2, undefined, KODE);
    try {
      const p = new PerusahaanPage(page);
      await expect.poll(async () => (await sel(p, KODE))?.['Jumlah Kapal'], { timeout: 20_000 }).toBe('1');
      // kode terkunci setelah dipakai (keterangan form: "Unik, tidak bisa diubah setelah dipakai")
      await p.goto({ search: KODE });
      await p.bukaUbah(KODE);
      const bisa = await p.kode.isEditable();
      await cekTemuan(page, {
        id: 'PR-T07',
        judul: 'Kode perusahaan yang sudah dipakai kapal masih bisa diubah',
        langkah: [`Kapal ${KAPAL} memakai perusahaan ${KODE}`, `Perusahaan → ${KODE} → ⋯ → Ubah Data`, 'Klik field Kode perusahaan'],
        ekspektasi: 'Kode terkunci (read-only)',
        aktual: bisa ? 'Field Kode bisa diketik' : 'Terkunci',
        cek: async () => expect(bisa).toBe(false),
        fokus: p.kode,
      });
      await p.batalForm('Batal');
      // hapus perusahaan yang dipakai kapal → harus ditolak
      await p.goto({ search: KODE });
      const hasil = await p.hapusData(KODE);
      const masih = !!(await sel(p, KODE));
      await cekTemuan(page, {
        id: 'PR-T08',
        judul: 'Perusahaan yang masih dipakai kapal bisa dihapus',
        langkah: [`Kapal ${KAPAL} memakai perusahaan ${KODE}`, `Perusahaan → ${KODE} → ⋯ → Hapus Data → Hapus`],
        ekspektasi: 'Ditolak dengan pesan perusahaan masih dipakai kapal; perusahaan tetap ada',
        aktual: `Toast: "${hasil}"; perusahaan ${masih ? 'masih ada' : 'terhapus'}`,
        cek: async () => expect(masih).toBe(true),
        fokus: p.toast.first(),
      });
      if (!masih) dibuat = false;
    } finally {
      const req = await apiCtx(playwright);
      try { await bersihkanKapalQA(req, AWALAN_KAPAL); } finally { await req.dispose(); }
    }
  });

  test('[Edge] PR-37 Tambah perusahaan dengan status Nonaktif sejak awal → tersimpan Nonaktif, tidak ada di form Kapal', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    const nama = `PT QA AUTO ${KODE_NON}`;
    await p.tambah({ kode: KODE_NON, nama, aktif: false });
    expect((await sel(p, KODE_NON))?.Status).toBe('Nonaktif');
    expect(await perusahaanDiFormKapal(page, KODE_NON)).not.toContain(nama);
  });

  test('[Positif] PR-38 Hapus Data (tidak dipakai kapal lagi) → hilang dari daftar', async ({ page }) => {
    test.skip(!dibuat, 'PR-30 gagal atau perusahaan sudah terhapus di PR-36');
    const p = new PerusahaanPage(page);
    await p.goto({ search: KODE });
    const hasil = await p.hapusData(KODE);
    test.info().annotations.push({ type: 'info', description: `Toast hapus: ${hasil}` });
    expect(hasil).toMatch(/berhasil/i);
    expect(await sel(p, KODE)).toBeNull();
  });
});
