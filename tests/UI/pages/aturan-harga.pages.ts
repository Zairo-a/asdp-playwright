import { expect, type Locator, type Page } from '@playwright/test';

/* ------------------------------------------------------------------ */
/* DISKON & DYNAMIC PRICE — Aturan Harga /tariff-price-rules           */
/*   Tab: Semua N | Diskon N | Markup N | Campuran N                   */
/*   Filter: "Cari kode / nama", Rute, Status, "Berlaku pada"          */
/*   Kolom: Kode - Nama | Tipe | Kondisi | Cakupan | Penyesuaian | Periode | Prioritas | Status */
/*   Menu baris: Ubah · Setujui · Tolak · Nonaktifkan  (TIDAK ADA Hapus)                      */
/*   Wizard 4 langkah: 1 Umum & Waktu · 2 Komponen, Acuan & Nilai · 3 Cakupan & Penjualan ·   */
/*     4 Ringkasan → "Simpan & ajukan" (change set → Menunggu persetujuan)                    */
/*   AMAN: automation baca/validasi TIDAK PERNAH menekan "Simpan & ajukan" / Setujui / Tolak.  */
/* ------------------------------------------------------------------ */

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
/** "Selasa, 24 November 2026" (nama tombol hari di kalender). */
export const labelTanggal = (d: Date) => `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
export const hariDepan = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };

export class AturanHargaPage {
  readonly main: Locator;
  readonly tabel: Locator;
  readonly rows: Locator;
  readonly ringkasan: Locator;
  readonly form: Locator;
  readonly toast: Locator;
  readonly konfirmasiBatal: Locator;
  constructor(readonly page: Page) {
    this.main = page.locator('main:not(:has(main))');
    this.tabel = this.main.locator('table').first();
    this.rows = this.tabel.locator('tbody tr');
    this.ringkasan = this.main.getByText(/Menampilkan \d+-\d+ dari \d+ data/);
    this.form = page.locator('[data-slot="dialog-content"][data-state="open"]:visible, [data-slot="sheet-content"][data-state="open"]:visible');
    this.toast = page.locator('[data-sonner-toast]');
    this.konfirmasiBatal = page.locator('[role="alertdialog"], [role="dialog"]').filter({ has: page.getByRole('button', { name: /^Ya, batalkan$/i }) });
  }
  get cari() { return this.main.getByRole('searchbox', { name: 'Cari kode / nama' }); }
  get fRute() { return this.main.getByRole('combobox', { name: 'Rute' }); }
  get fStatus() { return this.main.getByRole('combobox', { name: 'Status' }); }
  get btnTambah() { return this.main.getByRole('button', { name: 'Tambah aturan' }); }
  tab(nama: 'Semua' | 'Diskon' | 'Markup' | 'Campuran') { return this.main.getByRole('tab', { name: new RegExp(`^${nama} \\d+$`) }); }
  async angkaTab(nama: 'Semua' | 'Diskon' | 'Markup' | 'Campuran') { return Number((await this.tab(nama).innerText()).match(/(\d+)/)![1]); }

  async goto(qs = '') {
    await this.page.goto('/tariff-price-rules' + qs);
    await expect(this.main.getByRole('heading', { name: 'Aturan Harga', exact: true })).toBeVisible({ timeout: 30_000 });
    await this.tunggu();
  }
  async tunggu() {
    await expect(this.ringkasan.or(this.tabel.getByText(/Belum ada|Tidak ada/i)).first()).toBeVisible({ timeout: 30_000 });
    await this.page.waitForTimeout(800);
  }
  async totalData() {
    if (!(await this.ringkasan.isVisible())) return 0;
    return Number((await this.ringkasan.innerText()).match(/dari (\d+) data/)![1]);
  }
  /** Isi kolom (index 0 = checkbox) untuk semua baris. */
  async kolom(i: number) { return (await this.rows.locator(`td:nth-child(${i + 1})`).allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()); }
  async pilihFilter(cb: Locator, opsi: string | RegExp) {
    await cb.click();
    await this.page.getByRole('option', { name: opsi }).first().click();
    await this.tunggu();
  }
  async opsi(cb: Locator) {
    await expect(async () => {
      if (!(await this.page.getByRole('option').first().isVisible())) await cb.click();
      await expect(this.page.getByRole('option').first()).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    const o = (await this.page.getByRole('option').allInnerTexts()).map((x) => x.trim());
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
    return o;
  }

  /* ---------------- wizard ---------------- */
  fBtn(nama: string) { return this.form.getByRole('button', { name: nama, exact: true }); }
  get kode() { return this.form.getByRole('textbox', { name: 'Kode', exact: true }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama', exact: true }); }
  get prioritas() { return this.form.getByRole('combobox', { name: 'Prioritas' }); }
  get nominal() { return this.form.getByRole('textbox', { name: 'Nominal' }).first(); }
  get langkah() { return this.form.getByText(/^\d\/4$/); }
  async pesan() {
    const t = (await this.form.getByRole('alert').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    return [...new Set(t)];
  }
  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Aturan Harga' })).toBeVisible();
    await this.page.waitForTimeout(500);
  }
  async berikutnya() { await this.fBtn('Berikutnya').click(); await this.page.waitForTimeout(800); }
  async sebelumnya() { await this.fBtn('Sebelumnya').click(); await this.page.waitForTimeout(600); }
  async pilihOpsiForm(cb: Locator, opsi: string | RegExp) {
    await expect(async () => {
      if (!(await this.page.getByRole('option').first().isVisible())) await cb.click();
      await expect(this.page.getByRole('option').first()).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await this.page.getByRole('option', { name: opsi }).first().click();
    await this.page.waitForTimeout(300);
    if (await this.page.getByRole('option').first().isVisible()) await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }
  /** Pilih tanggal pada tombol kalender (mis. "Berlaku dari"). */
  async pilihTanggal(tombol: string, d: Date) {
    await this.fBtn(tombol).click();
    const pop = this.page.locator('[data-slot="popover-content"]').last();
    await expect(pop).toBeVisible();
    const target = pop.getByRole('button', { name: new RegExp(`${labelTanggal(d)}$`) });
    for (let i = 0; i < 24 && !(await target.isVisible()); i++) {
      await pop.getByRole('button', { name: 'Ke bulan berikutnya' }).click();
      await this.page.waitForTimeout(200);
    }
    await target.click();
    await this.page.waitForTimeout(300);
    if (await pop.isVisible()) await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }
  /** Apakah tanggal `d` di kalender tombol `tombol` nonaktif (tidak bisa dipilih)? Kalender ditutup lagi. */
  async tanggalNonaktif(tombol: string, d: Date) {
    await this.fBtn(tombol).click();
    const pop = this.page.locator('[data-slot="popover-content"]').last();
    await expect(pop).toBeVisible();
    const target = pop.getByRole('button', { name: new RegExp(`${labelTanggal(d)}$`) });
    for (let i = 0; i < 24 && !(await target.isVisible()); i++) {
      await pop.getByRole('button', { name: 'Ke bulan sebelumnya' }).click();
      await this.page.waitForTimeout(200);
    }
    const nonaktif = await target.isDisabled();
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
    return nonaktif;
  }
  /** Langkah 1 valid minimal. */
  async isiLangkah1(d: { kode: string; nama: string; prioritas?: string; dari: Date; sampai?: Date }) {
    await this.kode.fill(d.kode);
    await this.nama.fill(d.nama);
    await this.pilihOpsiForm(this.prioritas, d.prioritas ?? 'Sangat Rendah');
    await this.pilihTanggal('Berlaku dari', d.dari);
    if (d.sampai) await this.pilihTanggal('Berlaku sampai', d.sampai);
  }
  /** Langkah 2 valid minimal: komponen + 1 baris nilai. */
  async isiLangkah2(d: { komponen?: string; nominal: string }) {
    await this.fBtn(d.komponen ?? 'Tarif Dasar').click();
    await this.nominal.fill(d.nominal);
  }
  async tutup() {
    if (!(await this.form.isVisible())) return;
    await this.form.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
    if (await this.konfirmasiBatal.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false)) {
      await this.konfirmasiBatal.getByRole('button', { name: /^Ya, batalkan$/i }).click();
    }
    await expect(this.form).toBeHidden();
  }
}
