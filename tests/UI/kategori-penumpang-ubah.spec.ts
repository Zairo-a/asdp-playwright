import { test, expect, type BrowserContextOptions } from '@playwright/test';
import { KategoriPage, acak, bersihkanQA, type DataKategori } from './pages/penumpang.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import { bukaWeb, opsiPenumpangWeb, tungguSinkron } from './pages/ferizy.pages';

/**
 * MASTER DATA — KATEGORI PENUMPANG — MENGUBAH DATA (butuh ALLOW_WRITE=1)
 * Hanya kategori uji milik QA (kode diawali "QG" + acak), dibuat & dihapus lewat layar.
 * Data uji SELALU dibersihkan di awal & akhir. Kategori asli (Dewasa/Lansia/Anak/Bayi) tidak disentuh.
 * Catatan: selama test berjalan (beberapa menit) kategori uji bisa TERLIHAT di pilihan penumpang web dev.
 * Dampak: kategori Aktif tampil di pilihan "Penumpang" web Ferizy, Nonaktif tidak.
 * ID: KG-3x, KG-T05
 */

test.describe.configure({ mode: 'serial' });
test.skip(process.env.ALLOW_WRITE !== '1', 'Set ALLOW_WRITE=1 untuk menjalankan test yang mengubah data');

const AWALAN = 'QG';
const KODE = AWALAN + acak(3);
const KODE_TUMPUK = AWALAN + acak(3);
const NAMA = `QA Kategori ${KODE}`;
const NAMA_BARU = `QA Kategori ${KODE} Edit`;
const DATA: DataKategori = {
  urutan: '99', kode: KODE, nama: NAMA, keterangan: 'Usia 71–80 tahun (data uji)', min: '71', maks: '80',
  pakaiKursi: false, wajibIdentitas: false, // edge: kategori gratis tanpa kursi & tanpa identitas
};
let dibuat = false;
let tampilDiWeb = false; // diisi KG-31: kategori baru tampil di web? (kalau tidak, cek "nonaktif → hilang dari web" tidak bermakna)

async function apiCtx(playwright: any) {
  const u = test.info().project.use as BrowserContextOptions & { baseURL?: string };
  return playwright.request.newContext({ baseURL: u.baseURL, storageState: u.storageState as string });
}
async function bersihkan(playwright: any) {
  const req = await apiCtx(playwright);
  try { await bersihkanQA(req, '/passenger-categories', AWALAN); } finally { await req.dispose(); }
}
test.beforeAll(async ({ playwright }) => bersihkan(playwright));
test.afterAll(async ({ playwright }) => bersihkan(playwright));

/** Kategori `nama` tampil di pilihan Penumpang web? Ditunggu (maks ±1 menit) sampai sama dengan `harap`. */
async function diWeb(browser: import('@playwright/test').Browser, nama: string, harap: boolean) {
  const { ctx, web } = await bukaWeb(browser);
  try {
    let ada = !harap;
    await tungguSinkron(async () => (ada = (await opsiPenumpangWeb(web)).some((o) => o.nama === nama)) === harap);
    return ada;
  } finally {
    await ctx.close();
  }
}
const LANGKAH_WEB = 'Web Ferizy → beranda → klik "Penumpang" (tunggu ±1 menit)';

test.describe('Kategori Penumpang — siklus data uji', () => {
  test('[Positif] KG-30 Tambah kategori (gratis tanpa kursi, tanpa identitas) → muncul di daftar dengan nilai benar', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.tambah(DATA);
    dibuat = true;
    await expect.poll(async () => { await p.goto(); return p.totalData(); }).toBe(awal + 1);
    await p.goto({ search: KODE });
    const r = (await p.semuaBaris()).find((x) => x.Kode === KODE)!;
    expect(r, 'baris kategori uji').toBeTruthy();
    expect(r.Nama).toBe(NAMA);
    expect(r.Deskripsi).toBe(DATA.keterangan);
    expect(r['Usia Min']).toBe('71');
    expect(r['Usia Maks']).toBe('80');
    expect(r['Pakai Kursi / Kuota']).not.toBe('Ya');
    expect(r.Status).toBe('Aktif');
  });

  test('[Dampak] KG-31 kategori baru (Aktif) tampil di pilihan "Penumpang" web', async ({ page, browser }) => {
    test.skip(!dibuat, 'KG-30 gagal');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    const ada = await diWeb(browser, NAMA, true);
    tampilDiWeb = ada;
    await cekTemuan(page, {
      id: 'KG-T21',
      judul: 'Kategori penumpang baru di CMS tidak tampil di pilihan penumpang web',
      langkah: [`CMS → Kategori Penumpang → Tambah "${NAMA}" (Aktif)`, LANGKAH_WEB],
      ekspektasi: `"${NAMA}" tampil di pilihan penumpang`,
      aktual: ada ? 'Tampil' : 'Tidak tampil',
      cek: async () => expect(ada).toBe(true),
    });
  });

  test('[Negatif] KG-32 kode kategori yang sudah dipakai → ditolak, tidak ada data ganda', async ({ page }) => {
    test.skip(!dibuat, 'KG-30 gagal');
    const p = new KategoriPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ ...DATA, nama: NAMA + ' DUP', urutan: '98' });
    const hasil = await p.simpan();
    expect(hasil).not.toMatch(/berhasil/i);
    await p.tutupForm();
    await p.goto({ search: KODE });
    expect((await p.semuaBaris()).filter((x) => x.Kode === KODE)).toHaveLength(1);
  });

  test('[Temuan] KG-T05 rentang usia yang tumpang-tindih dengan kategori lain seharusnya ditolak [perlu konfirmasi]', async ({ page }) => {
    test.skip(!dibuat, 'KG-30 gagal');
    const p = new KategoriPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ urutan: '97', kode: KODE_TUMPUK, nama: `QA Kategori ${KODE_TUMPUK}`, min: '10', maks: '20', aktif: false });
    const hasil = await p.simpan();
    await p.tutupForm();
    await cekTemuan(page, {
      id: 'KG-T05',
      judul: 'Kategori penumpang dengan rentang usia yang bertumpuk dengan Dewasa (10–20) bisa disimpan',
      langkah: ['Kategori Penumpang → Tambah', `Kode "${KODE_TUMPUK}", Min umur 10, Maks umur 20 (Dewasa 6–59), status Nonaktif`, 'Simpan'],
      ekspektasi: 'Ditolak: rentang usia bertumpuk dengan kategori lain (penumpang jadi bisa masuk 2 kategori/tarif)',
      aktual: hasil,
      cek: async () => expect(hasil).not.toMatch(/berhasil/i),
      fokus: p.toast.first(),
    });
  });

  test('[Positif] KG-33 Ubah nama & maks umur → daftar ikut berubah', async ({ page }) => {
    test.skip(!dibuat, 'KG-30 gagal');
    const p = new KategoriPage(page);
    await p.goto({ search: KODE });
    await p.bukaUbah(KODE);
    await expect(p.kode).toHaveValue(KODE);
    await p.isi({ nama: NAMA_BARU, maks: '85' });
    expect(await p.simpan()).toMatch(/berhasil/i);
    await p.goto({ search: KODE });
    const r = (await p.semuaBaris()).find((x) => x.Kode === KODE)!;
    expect(r.Nama).toBe(NAMA_BARU);
    expect(r['Usia Maks']).toBe('85');
  });

  test('[Dampak] KG-34 Nonaktifkan → Status "Nonaktif"; hilang dari pilihan penumpang web', async ({ page, browser }) => {
    test.skip(!dibuat, 'KG-30 gagal');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    const p = new KategoriPage(page);
    await p.goto({ search: KODE });
    await p.ubahStatus(KODE, false);
    await p.goto({ search: KODE });
    expect((await p.semuaBaris()).find((x) => x.Kode === KODE)?.Status).toBe('Nonaktif');
    expect(await p.daftarAksi(KODE)).toContain('Aktifkan');
    if (!tampilDiWeb) {
      test.info().annotations.push({ type: 'info', description: 'Cek web dilewati: kategori uji tidak pernah tampil di web (lihat temuan KG-T21), jadi "hilang dari web" tidak bisa diuji' });
      return;
    }
    const ada = await diWeb(browser, NAMA_BARU, false);
    await cekTemuan(page, {
      id: 'KG-T22',
      judul: 'Kategori penumpang yang dinonaktifkan di CMS masih bisa dipilih di web',
      langkah: [`CMS → Kategori Penumpang → ${KODE} → Nonaktifkan`, LANGKAH_WEB],
      ekspektasi: 'Kategori nonaktif tidak tampil (sesuai keterangan form: "Nonaktif = tidak bisa dipilih saat pesan")',
      aktual: ada ? 'Masih tampil' : 'Tidak tampil',
      cek: async () => expect(ada).toBe(false),
    });
  });

  test('[Dampak] KG-35 Aktifkan kembali → Status "Aktif"; tampil lagi di web dengan nama baru', async ({ page, browser }) => {
    test.skip(!dibuat, 'KG-30 gagal');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    const p = new KategoriPage(page);
    await p.goto({ search: KODE });
    await p.ubahStatus(KODE, true);
    await p.goto({ search: KODE });
    expect((await p.semuaBaris()).find((x) => x.Kode === KODE)?.Status).toBe('Aktif');
    const ada = await diWeb(browser, NAMA_BARU, true);
    await cekTemuan(page, {
      id: 'KG-T23',
      judul: 'Kategori penumpang yang diaktifkan lagi / diganti nama di CMS tidak tampil di web',
      langkah: [`CMS → Kategori Penumpang → ${KODE}: ganti nama "${NAMA_BARU}" lalu Aktifkan`, LANGKAH_WEB],
      ekspektasi: `"${NAMA_BARU}" tampil di pilihan penumpang`,
      aktual: ada ? 'Tampil' : 'Tidak tampil',
      cek: async () => expect(ada).toBe(true),
    });
  });

  test('[Positif] KG-36 Hapus Data → hilang dari daftar, total kembali seperti semula', async ({ page }) => {
    test.skip(!dibuat, 'KG-30 gagal');
    const p = new KategoriPage(page);
    await p.goto({ search: KODE });
    expect(await p.hapusData(KODE)).toMatch(/berhasil/i);
    await p.goto({ search: KODE });
    expect((await p.semuaBaris()).filter((x) => x.Kode === KODE)).toHaveLength(0);
  });
});
