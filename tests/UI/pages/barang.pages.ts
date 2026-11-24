import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { MasterDataPage } from './master-data.pages';
import { KapalPage } from './kapal.pages';

/* ------------------------------------------------------------------ */
/* KATEGORI BARANG & HEWAN — /cargo-categories                         */
/* Tabel: Kode | Nama Kategori | Tipe | Satuan | Curah | Go-show Saja | Status */
/* Form 1 halaman: Nama, Tipe (radio Barang/Hewan), Satuan (combobox),  */
/* switch Barang curah, Hanya dijual di loket (go-show), Aktif.        */
/* Kode TIDAK diisi — dibuat otomatis oleh sistem.                     */
/* Aturan: Curah On → go-show otomatis On & terkunci (tidak dijual online). */
/* ------------------------------------------------------------------ */

export const acak = (n = 3) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

export type DataBarang = { nama?: string; tipe?: 'Barang' | 'Hewan'; satuan?: string; curah?: boolean; goShow?: boolean; aktif?: boolean };

export class BarangPage extends MasterDataPage {
  constructor(page: Page) {
    super(page, '/cargo-categories', 'Kategori Barang & Hewan');
  }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama', exact: true }); }
  tipe(t: 'Barang' | 'Hewan') { return this.form.getByRole('radio', { name: t, exact: true }); }
  get satuan() { return this.form.getByRole('combobox', { name: 'Satuan' }); }
  get curah() { return this.form.getByRole('switch', { name: 'Barang curah' }); }
  get goShow() { return this.form.getByRole('switch', { name: 'Hanya dijual di loket (go-show)' }); }
  get aktif() { return this.form.getByRole('switch', { name: 'Aktif', exact: true }); }

  async pesan() {
    const t = (await this.form.locator('[role=alert], [data-slot=form-message]').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    return [...new Set(t)];
  }

  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Kategori Barang & Hewan' })).toBeVisible();
    await expect(this.nama).toBeEditable();
    await this.page.waitForTimeout(300);
  }
  async bukaUbah(kode: string) {
    await this.aksi(kode, /^(Ubah|Edit) Data$/);
    await expect(this.form).toBeVisible();
    await expect(this.nama).not.toHaveValue('');
  }

  /** Opsi combobox Satuan (popover ditutup lagi). */
  async opsiSatuan() {
    await this.satuan.click();
    const opsi = this.page.getByRole('option');
    await expect(opsi.first()).toBeVisible();
    const t = (await opsi.allInnerTexts()).map((x) => x.trim());
    await this.page.keyboard.press('Escape');
    return t;
  }
  async pilihSatuan(s: string) {
    await this.satuan.click();
    await this.page.getByRole('option', { name: s, exact: true }).click();
    await expect(this.satuan).toContainText(s);
  }
  private async setSwitch(sw: import('@playwright/test').Locator, nilai?: boolean) {
    if (nilai !== undefined && (await sw.getAttribute('aria-checked')) !== String(nilai)) await sw.click();
  }
  async isi(d: DataBarang) {
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.tipe) await this.tipe(d.tipe).check();
    if (d.satuan) await this.pilihSatuan(d.satuan);
    await this.setSwitch(this.curah, d.curah);
    if (!d.curah) await this.setSwitch(this.goShow, d.goShow); // saat curah On, go-show terkunci
    await this.setSwitch(this.aktif, d.aktif);
  }

  /** Klik Simpan (+konfirmasi opsional) → teks toast, atau pesan form kalau tidak ada toast. */
  async simpan(): Promise<string> {
    await this.btnForm('Simpan').click();
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(/^(Simpan|Ya.*)$/);
    const t = this.toast.first();
    const muncul = await t.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
    if (!muncul) return `Tidak ada toast; pesan form: "${(await this.pesan()).join(' / ')}"`;
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }
  async tambah(d: DataBarang) {
    await this.bukaTambah();
    await this.isi(d);
    const t = await this.simpan();
    expect(t, `simpan kategori ${d.nama}`).toMatch(/berhasil/i);
    await expect(this.form).toBeHidden();
  }

  /** Semua baris yang tampil sebagai objek { kolom: teks }. */
  async semuaBaris() {
    const h = (await this.tabel.locator('thead th').allInnerTexts()).map((x) => x.trim());
    const hasil: Record<string, string>[] = [];
    for (const r of await this.rows.all()) {
      const c = (await r.locator('td').allInnerTexts()).map((x) => x.trim());
      if (c.length < 2) continue;
      hasil.push(Object.fromEntries(h.map((k, i) => [k, c[i] ?? ''])));
    }
    return hasil;
  }
  /** Baris berdasarkan nama persis (cari dulu). */
  async barisNama(nama: string) {
    await this.goto({ search: nama });
    return (await this.semuaBaris()).find((r) => r['Nama Kategori'] === nama) ?? null;
  }

  async ubahStatus(kode: string, aktif: boolean) {
    await this.aksi(kode, aktif ? 'Aktifkan' : 'Nonaktifkan');
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(aktif ? /^(Aktifkan|Ya.*)$/ : /^(Nonaktifkan|Ya.*)$/);
    await this.expectToast(/berhasil/i);
  }
  async hapusData(kode: string) {
    await this.aksi(kode, 'Hapus Data');
    await this.konfirmasiKlik(/^(Hapus|Ya.*)$/);
    const t = this.toast.first();
    await expect(t).toBeVisible({ timeout: 15_000 });
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }
}

/** Kategori yang ditawarkan di form Tambah Kapal langkah 5: [{ nama, tipe, satuan }] (form DITUTUP tanpa menyimpan). */
export async function barangDiFormKapal(page: Page) {
  const k = new KapalPage(page);
  await k.goto();
  await k.bukaTambah();
  await k.isiLangkah1({ kode: 'QAXKB', nama: 'QA AUTO KB', jenis: 'Water Taxi', grt: '100', perusahaan: 'PT. Dharma Lautan Utama', pelabuhan: 'LEMBAR' });
  await k.lanjutKe('2/5');
  await k.isiLangkah2({ abk: '5', pelampung: '100', noSkkp: 'QA-SKKP', maksSkkp: '80', skkpSampai: '2030-12-31' });
  await k.lanjutKe('3/5');
  await k.isiLangkah3({ kuota: { EKONOMI: '50' } });
  await k.lanjutKe('4/5');
  await k.isiLangkah4({ totalSup: '10' });
  await k.lanjutKe('5/5');
  const hasil: { nama: string; tipe: string; satuan: string }[] = [];
  for (const r of await k.form.locator('tbody tr').all()) {
    const c = (await r.locator('td').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    if (c.length >= 3) hasil.push({ nama: c[0], tipe: c[1], satuan: c[2] });
  }
  await k.batalForm('Close', 'Ya, Batalkan');
  return hasil;
}

/* ---------------- API bantu — hanya untuk membersihkan data uji QA ---------------- */
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };
export async function barisBarangAPI(request: APIRequestContext, cari = ''): Promise<any[]> {
  const r = await request.fetch(`/api/proxy/cms/cargo-categories?page=1&limit=100&search=${encodeURIComponent(cari)}`, { headers: H });
  return ((await r.json().catch(() => null)) as any)?.result?.content?.[0]?.rows ?? [];
}
/** Hapus semua kategori yang NAMANYA diawali `awalanNama` (data uji QA). */
export async function bersihkanBarangQA(request: APIRequestContext, awalanNama: string) {
  const ids = (await barisBarangAPI(request, awalanNama)).filter((x) => String(x.name).startsWith(awalanNama)).map((x) => x.id);
  if (!ids.length) return 0;
  for (const body of [{ action: 'delete', ids }, { action: 'delete', ids: ids.join(',') }]) {
    const d = await request.fetch('/api/proxy/cms/cargo-categories/action', { method: 'POST', headers: H, data: JSON.stringify(body) });
    if (d.status() < 400 && !(await barisBarangAPI(request, awalanNama)).some((x) => String(x.name).startsWith(awalanNama))) return ids.length;
  }
  return -1;
}
