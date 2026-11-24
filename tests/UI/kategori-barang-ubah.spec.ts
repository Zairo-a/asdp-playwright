import { test, expect, type BrowserContextOptions } from '@playwright/test';
import { BarangPage, acak, barangDiFormKapal, bersihkanBarangQA } from './pages/barang.pages';
import { KapalPage, bersihkanKapalQA } from './pages/kapal.pages';
import { cekTemuan } from './pages/kapasitas.pages';

/**
 * MASTER DATA — KATEGORI BARANG & HEWAN — MENGUBAH DATA (butuh ALLOW_WRITE=1)
 * Hanya kategori uji milik QA (nama diawali "QA BARANG"), dibuat & dihapus lewat layar.
 * Kapal uji "QAKPKB…" dibuat lewat layar hanya untuk KB-35 (hapus kategori yang dipakai) lalu dihapus.
 * Data uji SELALU dibersihkan di awal & akhir. Kategori asli tidak disentuh.
 * Dampak: kategori Aktif muncul di form Kapal langkah 5 (Barang & Hewan), Nonaktif tidak.
 * ID: KB-3x, KB-T06/T07
 */

test.describe.configure({ mode: 'serial' });
test.skip(process.env.ALLOW_WRITE !== '1', 'Set ALLOW_WRITE=1 untuk menjalankan test yang mengubah data');

const AWALAN = 'QA BARANG';
const X = acak(3);
const NAMA = `${AWALAN} ${X}`;
const NAMA_BARU = `${AWALAN} ${X} EDIT`;
const NAMA_HEWAN = `${AWALAN} ${X} CURAH`; // dicoba sebagai Hewan dulu (curah terkunci), disimpan sebagai Barang curah
const NAMA_NON = `${AWALAN} ${X} NONAKTIF`;
const AWALAN_KAPAL = 'QAKPKB';
const KAPAL = AWALAN_KAPAL + acak(3);
let kode = '';

async function apiCtx(playwright: any) {
  const u = test.info().project.use as BrowserContextOptions & { baseURL?: string };
  return playwright.request.newContext({ baseURL: u.baseURL, storageState: u.storageState as string });
}
async function bersihkan(playwright: any) {
  const req = await apiCtx(playwright);
  try {
    await bersihkanKapalQA(req, AWALAN_KAPAL); // kapal dulu (masih memakai kategori uji)
    await bersihkanBarangQA(req, AWALAN);
  } finally {
    await req.dispose();
  }
}
test.beforeAll(async ({ playwright }) => bersihkan(playwright));
test.afterAll(async ({ playwright }) => bersihkan(playwright));

const namaDiKapal = async (page: import('@playwright/test').Page) => (await barangDiFormKapal(page)).map((x) => x.nama);

test.describe('Kategori Barang & Hewan — siklus data uji', () => {
  test('[Positif] KB-30 Tambah kategori Barang (satuan Kg) → muncul Aktif dengan kode otomatis', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.tambah({ nama: NAMA, tipe: 'Barang', satuan: 'Kg' });
    await expect.poll(async () => { await p.goto(); return p.totalData(); }).toBe(awal + 1);
    const r = await p.barisNama(NAMA);
    expect(r, 'baris kategori uji').toBeTruthy();
    kode = r!.Kode;
    expect(kode, 'kode dibuat otomatis').not.toBe('');
    expect(r!.Tipe).toBe('Barang');
    expect(r!.Satuan).toBe('Kg');
    expect(r!.Curah).toBe('Tidak');
    expect(r!['Go-show Saja']).toBe('Tidak');
    expect(r!.Status).toBe('Aktif');
  });

  test('[Dampak] KB-31 kategori baru (Aktif) muncul di form Kapal langkah 5 dengan tipe & satuan yang sama', async ({ page }) => {
    test.skip(!kode, 'KB-30 gagal');
    const k = (await barangDiFormKapal(page)).find((x) => x.nama === NAMA);
    expect(k, 'ada di form kapal').toBeTruthy();
    expect(k!.tipe).toBe('Barang');
    expect(k!.satuan).toBe('Kg');
  });

  test('[Temuan] KB-T06 nama kategori yang sudah dipakai seharusnya ditolak [perlu konfirmasi]', async ({ page }) => {
    test.skip(!kode, 'KB-30 gagal');
    const p = new BarangPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ nama: NAMA, tipe: 'Barang', satuan: 'Kg' });
    const hasil = await p.simpan();
    await p.tutupForm();
    await cekTemuan(page, {
      id: 'KB-T06',
      judul: 'Kategori barang & hewan dengan nama yang sudah ada bisa disimpan lagi (data ganda)',
      langkah: ['Kategori Barang & Hewan → Tambah', `Nama "${NAMA}" (sudah ada), tipe Barang, satuan Kg`, 'Simpan'],
      ekspektasi: 'Ditolak: nama kategori sudah dipakai',
      aktual: hasil,
      cek: async () => expect(hasil).not.toMatch(/berhasil/i),
      fokus: p.toast.first(),
    });
  });

  test('[Positif] KB-32 Ubah nama & satuan → daftar ikut berubah; kode tetap; [Dampak] form Kapal ikut berubah', async ({ page }) => {
    test.skip(!kode, 'KB-30 gagal');
    const p = new BarangPage(page);
    await p.goto({ search: kode });
    await p.bukaUbah(kode);
    await p.isi({ nama: NAMA_BARU, satuan: 'Item' });
    expect(await p.simpan()).toMatch(/berhasil/i);
    const r = await p.barisNama(NAMA_BARU);
    expect(r?.Kode).toBe(kode);
    expect(r?.Satuan).toBe('Item');
    const k = (await barangDiFormKapal(page)).find((x) => x.nama === NAMA_BARU);
    expect(k?.satuan).toBe('Item');
  });

  test('[Dampak] KB-33 Nonaktifkan → Status "Nonaktif", menu jadi "Aktifkan", hilang dari form Kapal', async ({ page }) => {
    test.skip(!kode, 'KB-30 gagal');
    const p = new BarangPage(page);
    await p.goto({ search: kode });
    await p.ubahStatus(kode, false);
    expect((await p.barisNama(NAMA_BARU))?.Status).toBe('Nonaktif');
    await p.goto({ search: kode });
    expect(await p.daftarAksi(kode)).toContain('Aktifkan');
    expect(await namaDiKapal(page)).not.toContain(NAMA_BARU);
  });

  test('[Dampak] KB-34 Aktifkan kembali → Status "Aktif", muncul lagi di form Kapal', async ({ page }) => {
    test.skip(!kode, 'KB-30 gagal');
    const p = new BarangPage(page);
    await p.goto({ search: kode });
    await p.ubahStatus(kode, true);
    expect((await p.barisNama(NAMA_BARU))?.Status).toBe('Aktif');
    expect(await namaDiKapal(page)).toContain(NAMA_BARU);
  });

  test('[Negatif] KB-35 Hapus kategori yang DIPAKAI kapal → ditolak, kategori tetap ada', async ({ page, playwright }) => {
    test.skip(!kode, 'KB-30 gagal');
    test.setTimeout(240_000);
    const k = new KapalPage(page);
    await k.goto();
    await k.tambah({
      kode: KAPAL, nama: `QA AUTO KAPAL ${KAPAL}`, jenis: 'Water Taxi', grt: '100', imo: String(1_000_000 + Math.floor(Math.random() * 9_000_000)),
      perusahaan: 'PT. Dharma Lautan Utama', pelabuhan: 'LEMBAR',
      abk: '5', pelampung: '100', noSkkp: 'QA-SKKP-' + KAPAL, maksSkkp: '80', skkpSampai: '2030-12-31',
      kuota: { EKONOMI: '50' }, totalSup: '10', barang: { [NAMA_BARU]: '5' },
    });
    try {
      const p = new BarangPage(page);
      await p.goto({ search: kode });
      const hasil = await p.hapusData(kode);
      const masih = !!(await p.barisNama(NAMA_BARU));
      await cekTemuan(page, {
        id: 'KB-T07',
        judul: 'Kategori barang & hewan yang masih dipakai kapal bisa dihapus',
        langkah: [`Kapal ${KAPAL} memakai kategori "${NAMA_BARU}" (maks 5)`, `Kategori Barang & Hewan → ${kode} → ⋯ → Hapus Data → Hapus`],
        ekspektasi: 'Ditolak dengan pesan kategori masih dipakai kapal; kategori tetap ada',
        aktual: `Toast: "${hasil}"; kategori ${masih ? 'masih ada' : 'terhapus'}`,
        cek: async () => expect(masih).toBe(true),
        fokus: p.toast.first(),
      });
      if (!masih) kode = ''; // sudah terhapus → KB-38 dilewati
    } finally {
      const req = await apiCtx(playwright);
      try { await bersihkanKapalQA(req, AWALAN_KAPAL); } finally { await req.dispose(); }
    }
  });

  test('[Edge] KB-36 Tipe Hewan → switch Curah terkunci & satuan Ekor; Barang (Kg) + Curah On → tersimpan Curah Ya & Go-show Ya', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ nama: NAMA_HEWAN, tipe: 'Hewan' });
    await expect(p.curah, 'hewan tidak bisa curah').toBeDisabled();
    await expect(p.satuan).toContainText('Ekor');
    await p.isi({ tipe: 'Barang', satuan: 'Kg', curah: true });
    await expect(p.goShow).toHaveAttribute('aria-checked', 'true');
    expect(await p.simpan()).toMatch(/berhasil/i);
    await expect(p.form).toBeHidden();
    const r = await p.barisNama(NAMA_HEWAN);
    expect(r?.Tipe).toBe('Barang');
    expect(r?.Satuan).toBe('Kg');
    expect(r?.Curah).toBe('Ya');
    expect(r?.['Go-show Saja'], 'curah → go-show otomatis').toBe('Ya');
  });

  test('[Edge] KB-37 Tambah kategori dengan status Nonaktif sejak awal → tersimpan Nonaktif, tidak ada di form Kapal', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.tambah({ nama: NAMA_NON, aktif: false });
    expect((await p.barisNama(NAMA_NON))?.Status).toBe('Nonaktif');
    expect(await namaDiKapal(page)).not.toContain(NAMA_NON);
  });

  test('[Positif] KB-38 Hapus Data → hilang dari daftar', async ({ page }) => {
    test.skip(!kode, 'KB-30 gagal atau kategori sudah terhapus di KB-35');
    const p = new BarangPage(page);
    await p.goto({ search: kode });
    expect(await p.hapusData(kode)).toMatch(/berhasil/i);
    expect(await p.barisNama(NAMA_BARU)).toBeNull();
  });
});
