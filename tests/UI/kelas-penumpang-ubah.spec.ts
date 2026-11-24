import { test, expect, type BrowserContextOptions } from '@playwright/test';
import { KelasPage, acak, barisAPI, bersihkanQA, kelasDiFormKapal } from './pages/penumpang.pages';
import { buatKapalQA } from './pages/golongan.pages';
import { bersihkanKapalQA } from './pages/kapal.pages';
import { cekTemuan } from './pages/kapasitas.pages';

/**
 * MASTER DATA — KELAS PENUMPANG — MENGUBAH DATA (butuh ALLOW_WRITE=1)
 * Hanya kelas uji milik QA (kode diawali "QAK" + acak), dibuat & dihapus lewat layar.
 * Kapal uji "QAKPKK…" dibuat lewat API hanya untuk KK-36 (hapus kelas yang dipakai) lalu dihapus.
 * Data uji SELALU dibersihkan di awal & akhir. Kelas asli tidak disentuh.
 * Dampak: kelas Aktif muncul di form Kapal langkah 3 (Kapasitas Penumpang), Nonaktif tidak.
 * ID: KK-3x, KK-T04
 */

test.describe.configure({ mode: 'serial' });
test.skip(process.env.ALLOW_WRITE !== '1', 'Set ALLOW_WRITE=1 untuk menjalankan test yang mengubah data');

const AWALAN = 'QAK';
const KODE = AWALAN + acak(3);
const KODE_NON = AWALAN + acak(3);
const KODE_DUPNAMA = AWALAN + acak(3);
const NAMA = `QA KELAS ${KODE}`;
const NAMA_BARU = `QA KELAS ${KODE} EDIT`;
const AWALAN_KAPAL = 'QAKPKK';
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
    await bersihkanKapalQA(req, AWALAN_KAPAL); // kapal dulu (masih memakai kelas uji)
    await bersihkanQA(req, '/services', AWALAN);
  } finally {
    await req.dispose();
  }
}
test.beforeAll(async ({ playwright }) => bersihkan(playwright));
test.afterAll(async ({ playwright }) => bersihkan(playwright));

test.describe('Kelas Penumpang — siklus data uji', () => {
  test('[Positif] KK-30 Tambah kelas → muncul di daftar dengan nama & status Aktif', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.tambah({ kode: KODE, nama: NAMA });
    dibuat = true;
    await expect.poll(async () => { await p.goto(); return p.totalData(); }).toBe(awal + 1);
    await p.goto({ search: KODE });
    await expect(p.baris(KODE)).toHaveCount(1);
    expect(await p.sel(KODE, 'Nama')).toBe(NAMA);
    expect(await p.sel(KODE, 'Status')).toBe('Aktif');
  });

  test('[Dampak] KK-31 kelas baru (Aktif) muncul di form Kapal langkah 3 "Kuota per kelas penumpang"', async ({ page }) => {
    test.skip(!dibuat, 'KK-30 gagal');
    expect(await kelasDiFormKapal(page)).toContain(NAMA);
  });

  test('[Negatif] KK-32 kode kelas yang sudah dipakai → ditolak, tidak ada data ganda', async ({ page }) => {
    test.skip(!dibuat, 'KK-30 gagal');
    const p = new KelasPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: KODE, nama: NAMA + ' DUP' });
    const hasil = await p.simpan();
    expect(hasil).not.toMatch(/berhasil/i);
    expect(hasil).toMatch(/sudah ada|sudah digunakan|duplikat|exists|unik/i);
    await p.tutupForm();
    await p.goto({ search: KODE });
    await expect.poll(() => p.totalData()).toBe(1);
  });

  test('[Temuan] KK-T04 nama kelas yang sama dengan kelas lain (kode beda) seharusnya ditolak [perlu konfirmasi]', async ({ page }) => {
    test.skip(!dibuat, 'KK-30 gagal');
    const p = new KelasPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: KODE_DUPNAMA, nama: NAMA });
    const hasil = await p.simpan();
    await p.tutupForm();
    await cekTemuan(page, {
      id: 'KK-T04',
      judul: 'Kelas penumpang baru boleh memakai nama yang sudah dipakai kelas lain',
      langkah: ['Buka menu Kelas Penumpang → Tambah', `Kode "${KODE_DUPNAMA}", nama "${NAMA}" (sama dengan kelas ${KODE})`, 'Simpan'],
      ekspektasi: 'Ditolak: nama kelas sudah dipakai',
      aktual: hasil,
      cek: async () => expect(hasil).not.toMatch(/berhasil/i),
      fokus: p.toast.first(),
    });
  });

  test('[Positif] KK-33 Ubah nama → daftar ikut berubah; [Dampak] nama baru tampil di form Kapal', async ({ page }) => {
    test.skip(!dibuat, 'KK-30 gagal');
    const p = new KelasPage(page);
    await p.goto({ search: KODE });
    await p.bukaUbah(KODE);
    await expect(p.kode).toHaveValue(KODE);
    await p.isi({ nama: NAMA_BARU });
    expect(await p.simpan()).toMatch(/berhasil/i);
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Nama')).toBe(NAMA_BARU);
    const diKapal = await kelasDiFormKapal(page);
    expect(diKapal).toContain(NAMA_BARU);
    expect(diKapal).not.toContain(NAMA);
  });

  test('[Dampak] KK-34 Nonaktifkan → Status "Nonaktif", menu jadi "Aktifkan", hilang dari form Kapal', async ({ page }) => {
    test.skip(!dibuat, 'KK-30 gagal');
    const p = new KelasPage(page);
    await p.goto({ search: KODE });
    await p.ubahStatus(KODE, false);
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Status')).toBe('Nonaktif');
    expect(await p.daftarAksi(KODE)).toContain('Aktifkan');
    expect(await kelasDiFormKapal(page)).not.toContain(NAMA_BARU);
  });

  test('[Dampak] KK-35 Aktifkan kembali → Status "Aktif", muncul lagi di form Kapal; [Edge] nama tidak berubah', async ({ page }) => {
    test.skip(!dibuat, 'KK-30 gagal');
    const p = new KelasPage(page);
    await p.goto({ search: KODE });
    await p.ubahStatus(KODE, true);
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Status')).toBe('Aktif');
    expect(await p.sel(KODE, 'Nama')).toBe(NAMA_BARU);
    expect(await kelasDiFormKapal(page)).toContain(NAMA_BARU);
  });

  test('[Negatif] KK-36 Hapus kelas yang DIPAKAI kapal → ditolak, kelas tetap ada', async ({ page, request }) => {
    test.skip(!dibuat, 'KK-30 gagal');
    const id = (await barisAPI(request, '/services', KODE)).find((x) => x.code === KODE)?.id;
    expect(id, 'id kelas uji').toBeTruthy();
    await buatKapalQA(request, KAPAL, 'IVA', KAPAL_CONTOH, 2, [{ service_id: Number(id), quota: 5 }]);
    try {
      const p = new KelasPage(page);
      await p.goto({ search: KODE });
      const hasil = await p.hapusData(KODE);
      await p.goto({ search: KODE });
      const masih = await p.baris(KODE).count();
      await cekTemuan(page, {
        id: 'KK-T07',
        judul: 'Kelas penumpang yang masih dipakai kapal bisa dihapus',
        langkah: [`Kapal ${KAPAL} memakai kelas ${KODE} (kuota 5)`, `Menu Kelas Penumpang → ${KODE} → ⋯ → Hapus Data → Hapus`],
        ekspektasi: 'Ditolak dengan pesan kelas masih dipakai kapal; kelas tetap ada',
        aktual: `Toast: "${hasil}"; kelas ${masih ? 'masih ada' : 'terhapus'}`,
        cek: async () => expect(masih).toBe(1),
        fokus: p.toast.first(),
      });
      if (!masih) dibuat = false; // sudah terhapus → test berikutnya dilewati
    } finally {
      await bersihkanKapalQA(request, AWALAN_KAPAL);
    }
  });

  test('[Edge] KK-37 Tambah kelas dengan status Nonaktif sejak awal → tersimpan Nonaktif, tidak ditawarkan di form Kapal', async ({ page }) => {
    const p = new KelasPage(page);
    const nama = `QA KELAS ${KODE_NON}`;
    await p.goto();
    await p.tambah({ kode: KODE_NON, nama, aktif: false });
    await p.goto({ search: KODE_NON });
    expect(await p.sel(KODE_NON, 'Status')).toBe('Nonaktif');
    expect(await kelasDiFormKapal(page)).not.toContain(nama);
  });

  test('[Positif] KK-38 Hapus Data → hilang dari daftar', async ({ page }) => {
    test.skip(!dibuat, 'KK-30 / KK-36 sudah menghapus kelas');
    const p = new KelasPage(page);
    await p.goto({ search: KODE });
    const hasil = await p.hapusData(KODE);
    expect(hasil).toMatch(/berhasil/i);
    await p.goto({ search: KODE });
    await expect.poll(() => p.totalData()).toBe(0);
  });
});
