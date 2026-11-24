import { expect, type Locator, type Page } from '@playwright/test';

/**
 * KERANGKA BERSAMA untuk semua halaman MASTER DATA
 * (Pelabuhan, Rute & Jadwal, Golongan, Kendaraan, Layanan, Kategori, Perusahaan, Cabang, …)
 *
 * Pola layar yang sama di semua master data:
 *   toolbar  : "Cari data..." · Filter · Tampilan · Export Ke Excel · Hapus (massal) · Tambah
 *   tabel    : checkbox "Pilih semua"/"Pilih baris", kolom bisa di-sort, tombol "Buka menu" per baris
 *   menu     : Ubah Data · Nonaktifkan/Aktifkan · Hapus Data
 *   konfirmasi: alertdialog ("… Data?" / "Hapus …?") dengan tombol aksi
 *   pager    : "Menampilkan a-b dari N data" · "Limit 10" (10/25/50/100) · ← Sebelumnya / Berikutnya →
 */
export class MasterDataPage {
  readonly main: Locator;
  readonly heading: Locator;
  readonly cari: Locator;
  readonly btnFilter: Locator;
  readonly btnTampilan: Locator;
  readonly btnExport: Locator;
  readonly btnHapusMassal: Locator;
  readonly btnTambah: Locator;
  readonly tabel: Locator;
  readonly rows: Locator;
  readonly ringkasan: Locator;
  readonly btnLimit: Locator;
  readonly btnSebelumnya: Locator;
  readonly btnBerikutnya: Locator;
  readonly popover: Locator;
  readonly menu: Locator;
  readonly form: Locator;
  readonly konfirmasi: Locator;
  /** Konfirmasi "Batalkan Perubahan?" / "Batalkan Pengisian Data?" yang muncul saat menutup form yang sudah diisi. */
  readonly konfirmasiBatal: Locator;
  readonly toast: Locator;

  constructor(readonly page: Page, readonly path: string, readonly judul: string) {
    this.main = page.locator('main:not(:has(main))');
    this.heading = this.main.getByRole('heading', { name: judul, exact: true });
    this.cari = this.main.getByPlaceholder('Cari data...');
    this.btnFilter = this.main.getByRole('button', { name: 'Filter', exact: true });
    this.btnTampilan = this.main.getByRole('button', { name: 'Tampilan', exact: true });
    this.btnExport = this.main.getByRole('button', { name: 'Export Ke Excel' });
    this.btnHapusMassal = this.main.getByRole('button', { name: /^Hapus( \(\d+\))?$/ });
    this.btnTambah = this.main.getByRole('button', { name: 'Tambah', exact: true });
    this.tabel = this.main.locator('table').first();
    this.rows = this.tabel.locator('tbody tr');
    this.ringkasan = this.main.getByText(/Menampilkan \d+-\d+ dari \d+ data/);
    this.btnLimit = this.main.getByRole('button', { name: /^Limit \d+$/ });
    this.btnSebelumnya = this.main.getByRole('button', { name: /Sebelumnya/ });
    this.btnBerikutnya = this.main.getByRole('button', { name: /Berikutnya/ });
    this.popover = page.locator('[data-slot="popover-content"]');
    this.menu = page.getByRole('menu');
    // form = dialog/sheet shadcn yang SEDANG TAMPIL.
    // Bukan popover combobox (juga ber-role dialog) dan bukan dialog "Cari menu atau fitur" yang tersembunyi.
    // Pakai data-state="open": setelah ditutup, Radix memberi data-state="closed" (elemen bisa masih
    // menempel dengan opacity 0, dan Playwright tetap menganggap opacity 0 sebagai "visible").
    this.form = page.locator(
      '[data-slot="dialog-content"][data-state="open"]:visible, [data-slot="sheet-content"][data-state="open"]:visible',
    );
    this.konfirmasi = page.getByRole('alertdialog');
    // Judulnya beda per halaman (Pelabuhan "Batalkan Perubahan?", Rute "Batalkan Pengisian Data?", dst.),
    // tapi tombolnya sama: "Kembali" & "Ya, Batalkan" → kenali dari tombol "Ya, Batalkan".
    this.konfirmasiBatal = page
      .locator('[role="alertdialog"], [role="dialog"]')
      .filter({ has: page.getByRole('button', { name: 'Ya, Batalkan', exact: true }) });
    this.toast = page.locator('[data-sonner-toast]');
  }

  /* ----------------------------- navigasi ----------------------------- */

  async goto(query: Record<string, string> = {}) {
    const qs = new URLSearchParams(query).toString();
    await this.page.goto(this.path + (qs ? `?${qs}` : ''));
    await expect(this.heading).toBeVisible();
    await this.tungguData();
  }

  /** Tunggu tabel selesai dimuat: ada ringkasan "Menampilkan …". */
  async tungguData() {
    await expect(this.ringkasan).toBeVisible({ timeout: 30_000 });
  }

  /* ----------------------------- membaca ------------------------------ */

  /** Total data dari "Menampilkan a-b dari N data". */
  async totalData() {
    const t = await this.ringkasan.innerText();
    return Number(t.match(/dari (\d+) data/)![1]);
  }

  /** [awal, akhir] dari "Menampilkan a-b …". */
  async rentang(): Promise<[number, number]> {
    const m = (await this.ringkasan.innerText()).match(/Menampilkan (\d+)-(\d+)/)!;
    return [Number(m[1]), Number(m[2])];
  }

  /** Nama kolom header (tanpa kolom checkbox & Aksi). */
  async header() {
    return (await this.tabel.locator('thead th').allInnerTexts()).map((x) => x.trim()).filter((x) => x && x !== 'Aksi');
  }

  /** Index kolom (0-based, termasuk kolom checkbox) berdasarkan teks header. */
  async idxKolom(nama: string) {
    const semua = (await this.tabel.locator('thead th').allInnerTexts()).map((x) => x.trim());
    const i = semua.findIndex((x) => x === nama);
    expect(i, `kolom "${nama}" harus ada`).toBeGreaterThanOrEqual(0);
    return i;
  }

  /** Isi satu kolom untuk semua baris yang tampil. */
  async nilaiKolom(nama: string) {
    const i = await this.idxKolom(nama);
    return (await this.rows.locator(`td:nth-child(${i + 1})`).allInnerTexts()).map((x) => x.trim());
  }

  /** Baris yang kolom pertamanya (kode) persis sama. */
  baris(kode: string) {
    return this.rows.filter({ has: this.page.locator('td').filter({ hasText: new RegExp(`^${kode}$`) }) });
  }

  /** Teks kolom tertentu pada baris kode. */
  async sel(kode: string, kolom: string) {
    const i = await this.idxKolom(kolom);
    return (await this.baris(kode).locator(`td:nth-child(${i + 1})`).innerText()).trim();
  }

  /* ----------------------------- toolbar ------------------------------ */

  async cariData(kata: string) {
    await this.cari.fill(kata);
    await expect(this.page).toHaveURL(kata ? new RegExp(`search=${encodeURIComponent(kata)}`) : /.*/);
    await this.tungguData();
  }

  /** Klik header untuk sort; kembalikan isi kolom setelah sort. */
  async sortBy(kolom: string) {
    // tunggu data hasil sort benar-benar datang dari server, baru baca kolomnya
    const datang = this.page.waitForResponse((r) => /\/api\/proxy\/cms\/.*[?&]sort=/.test(r.url()) && r.request().method() === 'GET', { timeout: 30_000 });
    await this.tabel.locator('thead').getByRole('button', { name: kolom, exact: true }).click();
    await expect(this.page).toHaveURL(/sort=/);
    await datang;
    await this.page.waitForTimeout(300); // beri waktu tabel menggambar ulang
    await this.tungguData();
    return this.nilaiKolom(kolom);
  }

  async setLimit(n: 10 | 25 | 50 | 100) {
    await this.btnLimit.click();
    await this.menu.getByRole('menuitemradio', { name: String(n), exact: true }).click();
    await expect(this.btnLimit).toHaveText(`Limit ${n}`);
    await this.tungguData();
  }

  /** Popover "Filter Aktivasi": centang Aktif / Nonaktif (sebelum 23 Nov 2026: "Tidak Aktif"). */
  async filterAktivasi(pilihan: 'Aktif' | 'Nonaktif' | 'Tidak Aktif' | 'Tersembunyi' | 'Sampah') {
    await this.btnFilter.click();
    await expect(this.popover).toBeVisible();
    await this.popover.getByRole('checkbox', { name: pilihan, exact: true }).click();
    await this.page.keyboard.press('Escape');
    await this.tungguData();
  }

  /** Menu "Tampilan": nyala/matikan kolom. */
  async toggleKolom(nama: string) {
    await this.btnTampilan.click();
    await this.menu.getByRole('menuitemcheckbox', { name: nama, exact: true }).click();
    await this.page.keyboard.press('Escape');
  }

  async exportExcel() {
    const [dl] = await Promise.all([this.page.waitForEvent('download', { timeout: 30_000 }), this.btnExport.click()]);
    return dl;
  }

  /* ------------------------ aksi per baris ------------------------ */

  async bukaMenu(kode: string) {
    await this.baris(kode).getByRole('button', { name: 'Buka menu' }).click();
    await expect(this.menu).toBeVisible();
    return this.menu;
  }

  async daftarAksi(kode: string) {
    const m = await this.bukaMenu(kode);
    const items = (await m.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
    await this.page.keyboard.press('Escape');
    return items;
  }

  async aksi(kode: string, item: string | RegExp) {
    const m = await this.bukaMenu(kode);
    await m.getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item }).click();
  }

  /** Klik tombol di alertdialog konfirmasi (mis. "Simpan", "Hapus", "Nonaktifkan", "Batal"). */
  async konfirmasiKlik(tombol: string | RegExp) {
    await expect(this.konfirmasi).toBeVisible();
    await this.konfirmasi.getByRole('button', typeof tombol === 'string' ? { name: tombol, exact: true } : { name: tombol }).click();
    await expect(this.konfirmasi).toBeHidden();
  }

  async expectToast(teks: string | RegExp) {
    await expect(this.toast.filter({ hasText: teks }).first()).toBeVisible({ timeout: 15_000 });
  }

  async setAktif(kode: string, aktif: boolean) {
    await this.aksi(kode, aktif ? 'Aktifkan' : 'Nonaktifkan');
    await this.konfirmasiKlik(aktif ? 'Aktifkan' : 'Nonaktifkan');
    await this.expectToast(/berhasil/i);
    if (aktif) await expect(this.baris(kode)).not.toContainText(/Nonaktif|Tidak Aktif/);
    else await expect(this.baris(kode)).toContainText(/Nonaktif|Tidak Aktif/);
  }

  async hapus(kode: string) {
    await this.aksi(kode, 'Hapus Data');
    await this.konfirmasiKlik('Hapus');
    await this.expectToast(/berhasil dihapus/i);
  }

  /** Hapus semua baris hasil pencarian `kata` (dipakai untuk bersih-bersih data uji). */
  async hapusSemuaHasilCari(kata: string) {
    await this.goto({ search: kata });
    for (let i = 0; i < 20 && (await this.totalData()) > 0; i++) {
      const kode = (await this.rows.first().locator('td').nth(1).innerText()).trim();
      await this.hapus(kode);
      await this.goto({ search: kata });
    }
  }

  /* ------------------------ form (dialog/wizard) ------------------------ */

  /** Pesan error di bawah field pada form. */
  get errorForm() {
    return this.form.getByRole('alert');
  }

  btnForm(nama: string) {
    return this.form.getByRole('button', { name: nama, exact: true });
  }

  /** Tutup form lewat tombol X (ada di semua langkah; tombol "Batal" hanya ada di langkah 1). */
  async tutupForm() {
    if (!(await this.form.isVisible())) return; // sudah tertutup sendiri
    await this.batalForm('Close');
  }

  /**
   * Tutup form lewat tombol "Batal" (langkah 1) atau X ("Close").
   * Kalau form sudah diisi, aplikasi menampilkan konfirmasi "Batalkan Perubahan?"
   * dengan tombol "Kembali" / "Ya, Batalkan" → dijawab sesuai `jawab`.
   * Mengembalikan true kalau konfirmasi itu muncul.
   */
  async batalForm(tombol: 'Batal' | 'Close' = 'Batal', jawab: 'Ya, Batalkan' | 'Kembali' = 'Ya, Batalkan') {
    // form yang sedang menutup (animasi) bisa "lepas" dari halaman saat diklik → abaikan, cukup pastikan tertutup
    await this.form.getByRole('button', { name: tombol, exact: true }).click({ timeout: 10_000 }).catch(() => {});
    const muncul = await this.konfirmasiBatal
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true, () => false);
    if (muncul) {
      await this.konfirmasiBatal.getByRole('button', { name: jawab, exact: true }).click();
      await expect(this.konfirmasiBatal).toBeHidden();
    }
    if (jawab === 'Ya, Batalkan') await expect(this.form).toBeHidden();
    return muncul;
  }

  /** Tombol lanjut wizard ("Selanjutnya" atau "Berikutnya", tergantung halaman). */
  async lanjut() {
    await this.form.getByRole('button', { name: /^(Selanjutnya|Berikutnya)$/ }).click();
  }

  /** Teks langkah wizard, mis. "1/3". */
  langkah() {
    return this.form.getByText(/^\d\/\d$/);
  }

  /** Combobox dengan kolom cari di popover: ketik lalu pilih opsi persis. */
  async pilihDiCombobox(trigger: Locator, cari: string, opsi: string | RegExp) {
    // form baru terbuka masih beranimasi → klik pertama bisa "hilang"; ulangi sampai popover terbuka
    await expect(async () => {
      if (!(await this.popover.isVisible())) await trigger.click();
      await expect(this.popover).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await this.popover.locator('input').first().fill(cari);
    await this.popover.getByRole('option', { name: opsi }).first().click();
    await expect(this.popover).toBeHidden();
  }
}

/* ------------------------------------------------------------------ */
/* PELABUHAN — /outlets (menu "Outlet", judul "Pelabuhan")             */
/* Form 3 langkah: 1 Data Pelabuhan · 2 Kapasitas Pelabuhan · 3 Dermaga */
/* ------------------------------------------------------------------ */
export type DataPelabuhan = {
  kode?: string;
  nama?: string;
  kotaCari?: string; // kata kunci di combobox, mis. 'Cilegon'
  kota?: string; // opsi persis, mis. 'Kota Cilegon'
  alamat?: string;
  mode?: 'Per kapal' | 'Pelabuhan 24 jam';
  kapPenumpangHarian?: string;
  kapKendaraanHarian?: string;
  kuotaGratis?: string;
  dermaga?: string[]; // nama dermaga yang ditambahkan
};

export class PelabuhanPage extends MasterDataPage {
  constructor(page: Page) {
    super(page, '/outlets', 'Pelabuhan');
  }

  // langkah 1
  get kode() { return this.form.getByRole('textbox', { name: 'Kode pelabuhan' }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama pelabuhan' }); }
  get kota() { return this.form.getByRole('combobox', { name: 'Kota / Kabupaten' }); }
  get alamat() { return this.form.getByRole('textbox', { name: 'Alamat' }); }
  get infoZona() { return this.form.getByText(/zona waktu mengikuti kota/i).last(); }
  // langkah 2
  modeRadio(mode: 'Per kapal' | 'Pelabuhan 24 jam') {
    return this.form.locator(`input[type=radio][value=${mode === 'Per kapal' ? 'per_vessel' : 'port_24h'}]`);
  }
  modeKartu(mode: 'Per kapal' | 'Pelabuhan 24 jam') {
    return this.form.getByText(mode, { exact: true });
  }
  get kapPenumpangHarian() { return this.form.getByLabel('Kapasitas penumpang harian', { exact: true }); }
  get kapKendaraanHarian() { return this.form.getByLabel('Kapasitas kendaraan harian (SUP)', { exact: true }); }
  get kuotaGratis() { return this.form.getByLabel('Kuota penumpang gratis per keberangkatan', { exact: true }); }
  // langkah 3
  get btnTambahDermaga() { return this.form.getByRole('button', { name: 'Tambah dermaga' }); }
  get barisDermaga() { return this.form.locator('table tbody tr').filter({ has: this.page.getByRole('textbox', { name: 'Nama dermaga' }) }); }

  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Pelabuhan' })).toBeVisible();
    await expect(this.kode).toBeEditable();
  }

  async bukaUbah(kode: string) {
    await this.aksi(kode, 'Ubah Data');
    await expect(this.form.getByRole('heading', { name: /^Ubah Pelabuhan/ })).toBeVisible();
  }

  async lanjut() {
    await this.btnForm('Selanjutnya').click();
  }

  async isiLangkah1(d: DataPelabuhan) {
    if (d.kode !== undefined) await this.kode.fill(d.kode);
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.kotaCari) await this.pilihDiCombobox(this.kota, d.kotaCari, d.kota ?? new RegExp(d.kotaCari, 'i'));
    if (d.alamat !== undefined) await this.alamat.fill(d.alamat);
  }

  async isiLangkah2(d: DataPelabuhan) {
    if (d.mode) await this.modeKartu(d.mode).click();
    if (d.kapPenumpangHarian !== undefined) await this.kapPenumpangHarian.fill(d.kapPenumpangHarian);
    if (d.kapKendaraanHarian !== undefined) await this.kapKendaraanHarian.fill(d.kapKendaraanHarian);
    if (d.kuotaGratis !== undefined) await this.kuotaGratis.fill(d.kuotaGratis);
  }

  async isiLangkah3(d: DataPelabuhan) {
    for (const nm of d.dermaga ?? []) {
      await this.btnTambahDermaga.click();
      await this.barisDermaga.last().getByRole('textbox', { name: 'Nama dermaga' }).fill(nm);
    }
  }

  /** Isi semua langkah lalu Simpan + konfirmasi "Simpan". Tidak menunggu toast (bisa sukses/gagal). */
  async isiDanSimpan(d: DataPelabuhan) {
    await this.isiLangkah1(d);
    await this.lanjut();
    await expect(this.langkah()).toHaveText('2/3');
    await this.isiLangkah2(d);
    await this.lanjut();
    await expect(this.langkah()).toHaveText('3/3');
    await this.isiLangkah3(d);
    await this.btnForm('Simpan').click();
    await this.konfirmasiKlik('Simpan');
  }

  async tambah(d: DataPelabuhan) {
    await this.bukaTambah();
    await this.isiDanSimpan(d);
    await this.expectToast('Pelabuhan berhasil ditambahkan');
    await expect(this.form).toBeHidden();
  }
}