import { test, expect, type Browser, type BrowserContextOptions } from '@playwright/test';
import { PelabuhanPage } from './pages/master-data.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import { KapalPage } from './pages/kapal.pages';
import { bukaWeb, teksPelabuhanWeb, tungguSinkron } from './pages/ferizy.pages';

/**
 * MASTER DATA — PELABUHAN (/outlets) — MENGUBAH DATA (butuh ALLOW_WRITE=1)
 * Siklus lengkap pada pelabuhan UJI milik QA: Tambah → Ubah → Nonaktifkan → Aktifkan → Hapus.
 * Data uji selalu dibersihkan (dihapus) di awal dan akhir, berdasarkan nama "QA AUTO PELABUHAN".
 * Pelabuhan asli TIDAK pernah diubah/dihapus.
 * ID: PL-3x, PL-T1x (temuan)
 */

test.describe.configure({ mode: 'serial' });

const NAMA = 'QA AUTO PELABUHAN';
const NAMA_EDIT = 'QA AUTO PELABUHAN EDIT';
const KODE = 'QA' + Date.now().toString(36).slice(-4).toUpperCase(); // unik tiap run, mis. QA7K2M
const KOTA = { kotaCari: 'Cilegon', kota: 'Kota Cilegon' };
const LANGKAH_TAMBAH = ['Buka menu Master data → Pelabuhan (/outlets)', 'Klik "Tambah"'];

async function bersihkan(browser: Browser) {
  const u = test.info().project.use as BrowserContextOptions;
  const ctx = await browser.newContext({ baseURL: u.baseURL, storageState: u.storageState, viewport: u.viewport, timezoneId: u.timezoneId, locale: u.locale });
  try {
    await new PelabuhanPage(await ctx.newPage()).hapusSemuaHasilCari(NAMA);
  } finally {
    await ctx.close();
  }
}

test.beforeAll(async ({ browser }) => bersihkan(browser));
test.afterAll(async ({ browser }) => bersihkan(browser));

/** Pelabuhan `nama` ada di pilihan "Pelabuhan pangkalan" form Tambah Kapal? (form ditutup tanpa menyimpan) */
async function adaDiPangkalanKapal(page: import('@playwright/test').Page, nama: string) {
  const k = new KapalPage(page);
  await k.goto();
  await k.bukaTambah();
  const opsi = await k.opsiCombobox(k.pelabuhan, nama);
  await k.batalForm('Close');
  return opsi.some((o) => o.toUpperCase() === nama.toUpperCase());
}

/** Pelabuhan `nama` tampil di halaman web "Pelabuhan"? Ditunggu sampai ±1 menit sampai sama dengan `harap`. */
async function diWebPelabuhan(browser: Browser, nama: string, harap: boolean) {
  const { ctx, web } = await bukaWeb(browser);
  try {
    let ada = !harap;
    await tungguSinkron(async () => {
      ada = (await teksPelabuhanWeb(web)).includes(`pelabuhan ${nama.toLowerCase()}`);
      return ada === harap;
    });
    return ada;
  } finally {
    await ctx.close();
  }
}

test.describe('Pelabuhan — siklus data uji', () => {
  test('[Positif] PL-30 Tambah pelabuhan (Per kapal + 1 dermaga) → muncul di daftar dengan zona waktu otomatis', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    const total = await p.totalData();
    await p.tambah({ kode: KODE, nama: NAMA, ...KOTA, alamat: 'Jl. Uji Otomatis', kuotaGratis: '0', dermaga: ['QA DERMAGA 1'] });
    await expect.poll(() => p.totalData(), { message: 'tunggu daftar diperbarui' }).toBe(total + 1);
    await p.cariData(KODE);
    await expect(p.baris(KODE)).toHaveCount(1);
    expect(await p.sel(KODE, 'Nama Pelabuhan')).toBe(NAMA);
    expect(await p.sel(KODE, 'Kota')).toBe('Kota Cilegon - Banten');
    expect(await p.sel(KODE, 'Zona Waktu')).toContain('WIB');
    expect(await p.sel(KODE, 'Mode Kapasitas')).toBe('Per kapal');
    expect(await p.sel(KODE, 'Dermaga')).toBe('1');
    expect(await p.sel(KODE, 'Aktif')).toBe('Aktif');
  });

  test('[Dampak] PL-45 pelabuhan baru (Aktif) muncul di pilihan "Pelabuhan pangkalan" form Kapal', async ({ page }) => {
    expect(await adaDiPangkalanKapal(page, NAMA)).toBe(true);
  });

  test('[Dampak] PL-46 pelabuhan baru (Aktif) tampil di halaman web "Pelabuhan"', async ({ page, browser }) => {
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    const ada = await diWebPelabuhan(browser, NAMA, true);
    await cekTemuan(page, {
      id: 'PL-T24',
      judul: 'Pelabuhan baru di CMS tidak tampil di halaman Pelabuhan web',
      langkah: [`CMS → Pelabuhan → Tambah "${NAMA}" (Aktif)`, 'Web Ferizy → menu "Pelabuhan" (tunggu ±1 menit)'],
      ekspektasi: `Tampil "Pelabuhan ${NAMA}"`,
      aktual: ada ? 'Tampil' : 'Tidak tampil',
      cek: async () => expect(ada).toBe(true),
    });
  });

  test('[Negatif] PL-31 kode yang sudah dipakai → ditolak "sudah ada", tidak ada data baru', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    const total = await p.totalData();
    await p.bukaTambah();
    // Sejak 23 Nov 2026 kode duplikat langsung ditolak di langkah 1 ("Kode sudah ada sebelumnya"), tanpa sampai Simpan
    await p.isiLangkah1({ kode: KODE, nama: NAMA + ' DUP', ...KOTA });
    await p.lanjut();
    await expect(p.form).toContainText(/sudah ada/i);
    await expect(p.langkah()).toHaveText('1/3');
    await p.tutupForm();
    await p.goto();
    expect(await p.totalData()).toBe(total);
  });

  test('[Negatif] PL-32 mode Pelabuhan 24 jam tanpa kapasitas harian → gagal simpan', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiDanSimpan({ kode: KODE + 'B', nama: NAMA + ' 24J', ...KOTA, mode: 'Pelabuhan 24 jam' });
    await p.expectToast('Gagal menyimpan pelabuhan');
    await p.tutupForm();
    await p.goto({ search: KODE + 'B' });
    expect(await p.totalData()).toBe(0);
  });

  test('[Positif] PL-33 Ubah nama → konfirmasi menampilkan perubahan lama → baru, daftar ikut berubah', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto({ search: KODE });
    await p.bukaUbah(KODE);
    await expect(p.kode).toBeDisabled();
    await p.nama.fill(NAMA_EDIT);
    await p.lanjut();
    await p.lanjut();
    await p.btnForm('Simpan').click();
    await expect(p.konfirmasi).toContainText('1 field akan diperbarui');
    await expect(p.konfirmasi).toContainText(`${NAMA} → ${NAMA_EDIT}`);
    await p.konfirmasiKlik('Simpan');
    await p.expectToast('Pelabuhan berhasil diperbarui');
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Nama Pelabuhan')).toBe(NAMA_EDIT);
  });

  test('[Edge] PL-34 Ubah tanpa mengubah apa pun → tidak ada perubahan yang tersimpan', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto({ search: KODE });
    await p.bukaUbah(KODE);
    await p.lanjut();
    await p.lanjut();
    await p.btnForm('Simpan').click();
    // boleh: tombol tidak melakukan apa-apa, atau konfirmasi "0 field"/info "tidak ada perubahan"
    const adaKonfirmasi = await p.konfirmasi.isVisible().catch(() => false);
    if (adaKonfirmasi) {
      await expect(p.konfirmasi).not.toContainText(/[1-9]\d* field akan diperbarui/);
      await p.konfirmasiKlik('Batal');
    }
    await p.page.keyboard.press('Escape');
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Nama Pelabuhan')).toBe(NAMA_EDIT);
  });

  test('[Positif] PL-35 Nonaktifkan → status "Nonaktif", menu berubah jadi "Aktifkan", muncul di filter Nonaktif', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto({ search: KODE });
    await p.aksi(KODE, 'Nonaktifkan');
    await expect(p.konfirmasi).toContainText(`${KODE} - ${NAMA_EDIT}`);
    await p.konfirmasiKlik('Nonaktifkan');
    await p.expectToast(/berhasil/i);
    await expect(p.baris(KODE)).toContainText('Nonaktif');
    expect(await p.daftarAksi(KODE)).toEqual(['Ubah Data', 'Aktifkan', 'Hapus Data']);
    await p.filterAktivasi('Nonaktif');
    await expect(p.baris(KODE)).toBeVisible();
  });

  test('[Negatif] PL-36 Aktifkan → Batal → status tetap "Nonaktif"', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto({ search: KODE });
    await p.aksi(KODE, 'Aktifkan');
    await p.konfirmasiKlik('Batal');
    await expect(p.baris(KODE)).toContainText('Nonaktif');
  });

  test('[Dampak] PL-47 pelabuhan Nonaktif → hilang dari "Pelabuhan pangkalan" form Kapal & dari halaman web "Pelabuhan"', async ({ page, browser }) => {
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    expect(await adaDiPangkalanKapal(page, NAMA_EDIT), 'pelabuhan nonaktif tidak boleh bisa dipilih jadi pangkalan kapal').toBe(false);
    const ada = await diWebPelabuhan(browser, NAMA_EDIT, false);
    await cekTemuan(page, {
      id: 'PL-T25',
      judul: 'Pelabuhan yang dinonaktifkan di CMS masih tampil di halaman Pelabuhan web',
      langkah: [`CMS → Pelabuhan → "${NAMA_EDIT}" → Nonaktifkan`, 'Web Ferizy → menu "Pelabuhan" (tunggu ±1 menit)'],
      ekspektasi: 'Pelabuhan nonaktif tidak tampil di web',
      aktual: ada ? 'Masih tampil' : 'Tidak tampil',
      cek: async () => expect(ada).toBe(false),
    });
  });

  test('[Positif] PL-37 Aktifkan kembali → status "Aktif"', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto({ search: KODE });
    await p.setAktif(KODE, true);
    expect(await p.daftarAksi(KODE)).toEqual(['Ubah Data', 'Nonaktifkan', 'Hapus Data']);
  });

  test('[Dampak] PL-48 pelabuhan Aktif lagi → muncul lagi di "Pelabuhan pangkalan" form Kapal', async ({ page }) => {
    expect(await adaDiPangkalanKapal(page, NAMA_EDIT)).toBe(true);
  });

  test('[Positif] PL-38 Hapus Data → hilang dari daftar, total berkurang 1', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    const total = await p.totalData();
    await p.goto({ search: KODE });
    await p.aksi(KODE, 'Hapus Data');
    await expect(p.konfirmasi).toContainText('dihapus secara permanen');
    await p.konfirmasiKlik('Hapus');
    await p.expectToast('Pelabuhan berhasil dihapus');
    await p.goto({ search: KODE });
    expect(await p.totalData()).toBe(0);
    await p.goto();
    expect(await p.totalData()).toBe(total - 1);
  });

  /* ------------------------- DAMPAK & TEMUAN ------------------------- */

  test('[Positif] PL-39 dampak: pelabuhan nonaktif tidak muncul di pilihan rute baru', async () => {
    test.fixme(true, 'Dilengkapi saat modul Rute & Jadwal dibuat (butuh selector form Tambah Rute)');
  });

  test('[Negatif] PL-40 pelabuhan yang dipakai jadwal aktif → Hapus ditolak', async () => {
    test.fixme(true, 'Butuh pelabuhan uji yang dipakai rute uji — dibuat bersama modul Rute & Jadwal, supaya pelabuhan asli tidak pernah tersentuh');
  });

  test('[Temuan] PL-T10 pesan error simpan memakai nama field bahasa Inggris', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    // Mode 24 jam tanpa kapasitas harian → server mengembalikan pesan error saat Simpan.
    // (Sejak 23 Nov 2026 kode duplikat seperti "ADN" sudah ditolak di langkah 1, jadi pakai kode uji baru yang unik.)
    await p.isiDanSimpan({ kode: KODE + 'E', nama: NAMA + ' ERR', ...KOTA, mode: 'Pelabuhan 24 jam' });
    const t = p.toast.filter({ hasText: 'Gagal menyimpan pelabuhan' }).first();
    await expect(t).toBeVisible();
    const pesan = (await t.innerText()).replace(/\s+/g, ' ').trim();
    await cekTemuan(page, {
      id: 'PL-T10',
      judul: 'Pesan error dari server memakai nama field Inggris ("Daily passenger capacity", "Daily vehicle sup")',
      langkah: [...LANGKAH_TAMBAH, `Isi Kode baru "${KODE}E", Nama, Kota`, 'Pilih mode "Pelabuhan 24 jam", kapasitas harian kosong', 'Simpan → konfirmasi Simpan'],
      ekspektasi: 'Pesan memakai label di layar: "Kapasitas penumpang harian wajib diisi", "Kapasitas kendaraan harian (SUP) wajib diisi"',
      aktual: `Toast: "${pesan}"`,
      cek: async () => expect(pesan).not.toMatch(/\bCode\b|Daily passenger|Daily vehicle/),
      fokus: t,
    });
    await p.tutupForm();
  });
});