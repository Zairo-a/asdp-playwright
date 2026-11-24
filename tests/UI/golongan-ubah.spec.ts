import { test, expect, type BrowserContextOptions } from '@playwright/test';
import { GolonganPage, KapalFormGolongan, KATEGORI_TABEL, bersihkanGolonganQA, buatKapalQA, hapusKapalQA, type DataGolongan } from './pages/golongan.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import { bukaWeb, opsiGolonganWeb, tungguSinkron } from './pages/ferizy.pages';

/**
 * MASTER DATA — GOLONGAN KENDARAAN — MENGUBAH DATA (butuh ALLOW_WRITE=1)
 * Hanya golongan uji milik QA (kode diawali "QAG"), dibuat & dihapus lewat layar.
 * Data uji SELALU dibersihkan di awal & akhir. Golongan asli tidak disentuh.
 * Dampak: golongan Aktif muncul di form Master Kapal langkah 4 (Kapasitas Kendaraan), Nonaktif tidak.
 * Kapal uji "QAKAPALGK" dibuat lewat API hanya untuk GK-40 lalu langsung dihapus.
 * ID: GK-3x, GK-4x, GK-T03
 */

test.describe.configure({ mode: 'serial' });

const AWALAN = 'QAG';
const acak = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
const KODE = AWALAN + acak();
const KODE_SUP0 = AWALAN + acak();
const KAPAL = process.env.GK_KAPAL_KODE ?? 'DHARMAFERRY9'; // kapal yang form-nya dibuka (TIDAK disimpan)
const KAPAL_QA = 'QAKAPALGK' + acak(); // acak per run: kode kapal yang sudah dihapus tidak bisa dipakai ulang (soft delete di CMS)
const DATA: DataGolongan = {
  kode: KODE,
  nama: 'QA AUTO GOL',
  kategori: 'Kendaraan Penumpang',
  deskripsi: 'Data uji automation',
  panjang: '6',
  maxPenumpang: '8',
  sup: '1,5',
  urutan: '99',
};
let dibuat = false;

async function apiCtx(playwright: any) {
  const u = test.info().project.use as BrowserContextOptions & { baseURL?: string };
  return playwright.request.newContext({ baseURL: u.baseURL, storageState: u.storageState as string });
}
test.beforeAll(async ({ playwright }) => {
  const req = await apiCtx(playwright);
  try { await hapusKapalQA(req, KAPAL_QA); await bersihkanGolonganQA(req, AWALAN); } finally { await req.dispose(); }
});
test.afterAll(async ({ playwright }) => {
  const req = await apiCtx(playwright);
  try { await hapusKapalQA(req, KAPAL_QA); await bersihkanGolonganQA(req, AWALAN); } finally { await req.dispose(); }
});

/** Golongan dengan nama `nama` ada di form Master Kapal langkah 4? (form ditutup tanpa menyimpan) */
async function adaDiFormKapal(page: import('@playwright/test').Page, nama: string) {
  const k = new KapalFormGolongan(page);
  await k.bukaLangkahKendaraan(KAPAL);
  const n = await k.inputGolongan(nama).count();
  await k.batalForm('Close');
  return n > 0;
}

/** Golongan `kode` ada di pilihan golongan web? Ditunggu (maks ±1 menit) sampai sama dengan `harap`. */
async function diWebGolongan(browser: import('@playwright/test').Browser, kode: string, harap: boolean) {
  const { ctx, web } = await bukaWeb(browser);
  try {
    let ada = !harap;
    await tungguSinkron(async () => (ada = (await opsiGolonganWeb(web)).some((o) => o.kode === kode)) === harap);
    return ada;
  } finally {
    await ctx.close();
  }
}
const LANGKAH_WEB_GOL = 'Web Ferizy → beranda → "Kendaraan" → klik "Pilih golongan kendaraan" (tunggu ±1 menit)';

test.describe('Golongan Kendaraan — siklus data uji', () => {
  test('[Positif] GK-30 Tambah golongan → muncul di daftar dengan nama, kategori, SUP & status Aktif', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.tambah(DATA);
    dibuat = true;
    await expect.poll(async () => { await p.goto(); return p.totalData(); }).toBe(awal + 1);
    await p.goto({ search: KODE });
    await expect(p.baris(KODE)).toHaveCount(1);
    expect(await p.sel(KODE, 'Nama')).toBe(DATA.nama);
    expect(await p.sel(KODE, 'Kategori')).toBe(KATEGORI_TABEL[DATA.kategori!]);
    expect(await p.sel(KODE, 'Nilai SUP')).toBe('1,5');
    expect(await p.sel(KODE, 'Status')).toBe('Aktif');
  });

  test('[Positif] GK-31 dampak: golongan Aktif muncul di form Master Kapal langkah "Kapasitas Kendaraan"', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    expect(await adaDiFormKapal(page, DATA.nama)).toBe(true);
  });

  test('[Dampak] GK-51a golongan baru (Aktif) muncul di pilihan golongan web', async ({ page, browser }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    const ada = await diWebGolongan(browser, KODE, true);
    await cekTemuan(page, {
      id: 'GK-T21',
      judul: 'Golongan baru di CMS tidak muncul di pilihan golongan web',
      langkah: [`CMS → Golongan Kendaraan → Tambah ${KODE} (Aktif)`, LANGKAH_WEB_GOL],
      ekspektasi: 'Golongan baru tampil di web',
      aktual: ada ? `Golongan ${KODE} tampil di web` : `Golongan ${KODE} tidak tampil di web`,
      cek: async () => expect(ada).toBe(true),
    });
  });

  test('[Negatif] GK-32 kode golongan yang sudah dipakai → ditolak, tidak ada data ganda', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ ...DATA, nama: 'QA AUTO GOL DUPLIKAT' });
    const hasil = await p.simpan();
    test.info().annotations.push({ type: 'info', description: `Hasil simpan kode ganda: ${hasil}` });
    expect(hasil).not.toMatch(/berhasil/i);
    if (await p.form.isVisible()) await p.batalForm('Close');
    await p.goto({ search: KODE });
    await expect(p.baris(KODE)).toHaveCount(1);
  });

  test('[Temuan] GK-T03 Nilai SUP 0 untuk kategori kendaraan seharusnya ditolak (keterangan: "Wajib > 0 untuk golongan kendaraan")', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: KODE_SUP0, nama: 'QA AUTO GOL SUP0', kategori: 'Kendaraan Barang', sup: '0' });
    const hasil = await p.simpan();
    if (await p.form.isVisible()) await p.batalForm('Close');
    await p.goto({ search: KODE_SUP0 });
    const tersimpan = (await p.baris(KODE_SUP0).count()) > 0;
    await cekTemuan(page, {
      id: 'GK-T03',
      judul: 'Golongan kendaraan dengan Nilai SUP 0 bisa disimpan',
      langkah: ['Buka menu Golongan Kendaraan → Tambah', `Isi Golongan ${KODE_SUP0}, Nama, Kategori "Kendaraan Barang", Nilai SUP 0`, 'Simpan'],
      ekspektasi: 'Ditolak: Nilai SUP wajib > 0 untuk golongan kendaraan (sesuai keterangan di bawah field)',
      aktual: `${hasil}; golongan ${tersimpan ? 'TERSIMPAN' : 'tidak tersimpan'}`,
      cek: async () => expect(tersimpan).toBe(false),
      fokus: tersimpan ? p.baris(KODE_SUP0) : p.tabel,
    });
    if (tersimpan) {
      // bersihkan lewat layar
      await p.aksi(KODE_SUP0, 'Hapus Data');
      await p.konfirmasiKlik(/^(Hapus|Ya.*)$/);
      await p.expectToast(/berhasil/i);
    }
  });

  test('[Positif] GK-33 Ubah nama & Nilai SUP → daftar ikut berubah', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const p = new GolonganPage(page);
    await p.goto({ search: KODE });
    await p.bukaUbah(KODE);
    DATA.nama = 'QA AUTO GOL UBAH';
    await p.isi({ nama: DATA.nama, sup: '2,25' });
    expect(await p.simpan()).toMatch(/berhasil/i);
    await expect(p.form).toBeHidden();
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Nama')).toBe(DATA.nama);
    expect(await p.sel(KODE, 'Nilai SUP')).toBe('2,25');
  });

  test('[Positif] GK-41 dampak: Nilai SUP baru (2,25) tampil di kolom "SUP golongan" form Master Kapal', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const k = new KapalFormGolongan(page);
    await k.bukaLangkahKendaraan(KAPAL);
    const baris = k.form.locator('tbody tr').filter({ has: page.getByRole('textbox', { name: KapalFormGolongan.labelGolongan(DATA.nama) }) });
    await expect(baris).toHaveCount(1);
    await expect(baris).toContainText('2,25');
    await k.batalForm('Close');
  });

  test('[Negatif] GK-34 Ubah: Nilai SUP dikosongkan → "Nilai SUP wajib diisi", data lama tetap', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const p = new GolonganPage(page);
    await p.goto({ search: KODE });
    await p.bukaUbah(KODE);
    await p.sup.fill('');
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesanForm()).toContain('Nilai SUP wajib diisi');
    await p.batalForm('Close');
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Nilai SUP')).toBe('2,25');
  });

  test('[Positif] GK-35 Nonaktifkan → Status "Nonaktif", menu jadi "Aktifkan", muncul di filter Nonaktif, hilang dari form kapal', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const p = new GolonganPage(page);
    await p.goto({ search: KODE });
    await p.ubahStatus(KODE, false);
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Status')).toBe('Nonaktif');
    expect(await p.daftarAksi(KODE)).toContain('Aktifkan');
    await p.goto({ search: KODE });
    await p.filterAktivasi('Nonaktif');
    await expect(p.baris(KODE)).toHaveCount(1);
    expect(await adaDiFormKapal(page, DATA.nama), 'golongan nonaktif tidak boleh muncul di data kapal').toBe(false);
  });

  test('[Dampak] GK-51b golongan Nonaktif → hilang dari pilihan golongan web', async ({ page, browser }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    const ada = await diWebGolongan(browser, KODE, false);
    await cekTemuan(page, {
      id: 'GK-T22',
      judul: 'Golongan yang dinonaktifkan di CMS masih bisa dipilih di web',
      langkah: [`CMS → Golongan Kendaraan → ${KODE} → Nonaktifkan`, LANGKAH_WEB_GOL],
      ekspektasi: 'Golongan nonaktif tidak tampil di web',
      aktual: ada ? `Golongan ${KODE} tampil di web` : `Golongan ${KODE} tidak tampil di web`,
      cek: async () => expect(ada).toBe(false),
    });
  });

  test('[Negatif] GK-36 Aktifkan → Batal di konfirmasi → tetap Nonaktif', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const p = new GolonganPage(page);
    await p.goto({ search: KODE });
    await p.aksi(KODE, 'Aktifkan');
    const ada = await p.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    test.skip(!ada, 'Aktifkan langsung jalan tanpa konfirmasi — tidak ada tombol Batal');
    await p.konfirmasiKlik('Batal');
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Status')).toBe('Nonaktif');
  });

  test('[Positif] GK-37 Aktifkan kembali → Status "Aktif", muncul lagi di form kapal; [Edge] nama & SUP tidak berubah setelah nonaktif → aktif', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const p = new GolonganPage(page);
    await p.goto({ search: KODE });
    if ((await p.sel(KODE, 'Status')) !== 'Aktif') await p.ubahStatus(KODE, true);
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Status')).toBe('Aktif');
    expect(await p.sel(KODE, 'Nama')).toBe(DATA.nama);
    expect(await p.sel(KODE, 'Nilai SUP')).toBe('2,25');
    expect(await adaDiFormKapal(page, DATA.nama)).toBe(true);
  });

  test('[Dampak] GK-51c golongan Aktif lagi → muncul lagi di pilihan golongan web', async ({ page, browser }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    const ada = await diWebGolongan(browser, KODE, true);
    await cekTemuan(page, {
      id: 'GK-T23',
      judul: 'Golongan yang diaktifkan lagi di CMS tidak muncul lagi di web',
      langkah: [`CMS → Golongan Kendaraan → ${KODE} → Aktifkan`, LANGKAH_WEB_GOL],
      ekspektasi: 'Golongan tampil lagi di web',
      aktual: ada ? `Golongan ${KODE} tampil di web` : `Golongan ${KODE} tidak tampil di web`,
      cek: async () => expect(ada).toBe(true),
    });
  });

  test('[Negatif] GK-40 Hapus golongan yang DIPAKAI kapal → ditolak, golongan tetap ada', async ({ page, playwright }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const req = await apiCtx(playwright);
    try {
      await buatKapalQA(req, KAPAL_QA, KODE, KAPAL);
      const p = new GolonganPage(page);
      await p.goto({ search: KODE });
      await p.aksi(KODE, 'Hapus Data');
      await p.konfirmasiKlik(/^(Hapus|Ya.*)$/);
      const t = p.toast.first();
      await expect(t).toBeVisible({ timeout: 15_000 });
      const pesan = (await t.innerText()).replace(/\s+/g, ' ').trim();
      test.info().annotations.push({ type: 'info', description: `Pesan hapus golongan yang dipakai kapal: "${pesan}"` });
      await p.goto({ search: KODE });
      const masihAda = (await p.baris(KODE).count()) > 0;
      await cekTemuan(page, {
        id: 'GK-T05',
        judul: 'Golongan yang masih dipakai kapal bisa dihapus',
        langkah: [`Kapal uji ${KAPAL_QA} memakai golongan ${KODE} (2 unit)`, `Menu Golongan Kendaraan → ${KODE} → ⋯ → Hapus Data → Hapus`],
        ekspektasi: 'Ditolak dengan pesan bahwa golongan masih dipakai kapal; golongan tetap ada',
        aktual: `Toast "${pesan}"; golongan ${masihAda ? 'masih ada' : 'TERHAPUS'}`,
        cek: async () => expect(masihAda).toBe(true),
        fokus: masihAda ? p.baris(KODE) : p.tabel,
      });
      if (!masihAda) dibuat = false;
    } finally {
      await hapusKapalQA(req, KAPAL_QA);
      await req.dispose();
    }
  });

  test('[Negatif] GK-38 Hapus → Batal di konfirmasi → data tetap ada', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const p = new GolonganPage(page);
    await p.goto({ search: KODE });
    await p.aksi(KODE, 'Hapus Data');
    await p.konfirmasiKlik('Batal');
    await p.goto({ search: KODE });
    await expect(p.baris(KODE)).toHaveCount(1);
  });

  test('[Positif] GK-39 Hapus Data → hilang dari daftar, total berkurang 1', async ({ page }) => {
    test.skip(!dibuat, 'GK-30 gagal');
    const p = new GolonganPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.goto({ search: KODE });
    await p.aksi(KODE, 'Hapus Data');
    await p.konfirmasiKlik(/^(Hapus|Ya.*)$/);
    await p.expectToast(/berhasil/i);
    await p.goto({ search: KODE });
    expect(await p.totalData()).toBe(0);
    await p.goto();
    expect(await p.totalData()).toBe(awal - 1);
  });
}); 