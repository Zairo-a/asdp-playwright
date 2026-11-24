import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { MasterDataPage } from './master-data.pages';

/* ------------------------------------------------------------------ */
/* CABANG — /branches                                                  */
/* Tabel: Kode | Nama Cabang | Perusahaan | Telepon | Email | Pelabuhan | Status */
/* Form 1 halaman: Kode cabang, Nama cabang, Perusahaan (combobox),    */
/* Telepon, Email, Alamat, Pelabuhan yang dikelola* (pilih banyak), Aktif. */
/* "Nonaktif … Ditolak bila cabang masih punya rute atau jadwal aktif." */
/* (Validasi server sudah diuji di tests/branch-*.spec.ts — di sini UI & dampak.) */
/* ------------------------------------------------------------------ */

export const acak = (n = 3) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

export type DataCabang = {
  kode?: string; nama?: string; perusahaan?: string; telepon?: string; email?: string; alamat?: string;
  pelabuhan?: string[]; aktif?: boolean;
};

export class CabangPage extends MasterDataPage {
  constructor(page: Page) {
    super(page, '/branches', 'Cabang');
  }
  get kode() { return this.form.getByRole('textbox', { name: 'Kode cabang' }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama cabang' }); }
  get perusahaan() { return this.form.getByRole('combobox', { name: 'Perusahaan' }); }
  get telepon() { return this.form.getByRole('textbox', { name: 'Telepon' }); }
  get email() { return this.form.getByRole('textbox', { name: 'Email' }); }
  get alamat() { return this.form.getByRole('textbox', { name: 'Alamat' }); }
  get pelabuhan() { return this.form.getByRole('combobox', { name: 'Pelabuhan yang dikelola' }); }
  get aktif() { return this.form.getByRole('switch', { name: 'Aktif' }); }

  async pesan() {
    const t = (await this.form.locator('[role=alert], [data-slot=form-message]').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    return [...new Set(t)];
  }
  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Cabang' })).toBeVisible();
    await expect(this.kode).toBeEditable();
    await this.page.waitForTimeout(300);
  }
  async bukaUbah(kode: string) {
    await this.aksi(kode, /^(Ubah|Edit) Data$/);
    await expect(this.form).toBeVisible();
    await expect(this.nama).not.toHaveValue('');
  }

  /** Daftar opsi combobox (popover ditutup lagi). `cari` diketik bila ada kolom cari. */
  async opsi(cb: import('@playwright/test').Locator, cari = '') {
    // form baru terbuka masih beranimasi → klik pertama bisa "hilang"; ulangi sampai popover terbuka
    await expect(async () => {
      if (!(await this.popover.isVisible())) await cb.click();
      await expect(this.popover).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    const o = this.page.getByRole('option');
    const inp = this.popover.locator('input');
    if (cari && (await inp.count())) await inp.first().fill(cari);
    await expect(o.first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
    await this.page.waitForTimeout(400);
    const t = (await o.allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    await this.page.keyboard.press('Escape');
    await expect(this.popover).toBeHidden().catch(() => {});
    return t;
  }
  /** Buka popover combobox dengan percobaan ulang (klik pertama saat form beranimasi bisa "hilang"). */
  private async bukaPopover(cb: import('@playwright/test').Locator) {
    await expect(async () => {
      if (!(await this.popover.isVisible())) await cb.click();
      await expect(this.popover).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
  }
  async pilihPerusahaan(nama: string) {
    await this.bukaPopover(this.perusahaan);
    const inp = this.popover.locator('input');
    if (await inp.count()) await inp.first().fill(nama.replace(/^PT\.? /, ''));
    await this.page.getByRole('option', { name: nama, exact: true }).click();
    if (await this.popover.isVisible()) await this.page.keyboard.press('Escape');
    await expect(this.perusahaan).toContainText(nama);
    await expect(this.popover).toBeHidden(); // tunggu popover selesai menutup sebelum membuka combobox lain
  }
  /** Pilih beberapa pelabuhan (multi-select). */
  async pilihPelabuhan(daftar: string[]) {
    for (const p of daftar) {
      await this.bukaPopover(this.pelabuhan);
      const inp = this.popover.locator('input');
      if (await inp.count()) await inp.first().fill(p);
      await this.page.waitForTimeout(500); // tunggu daftar tersaring
      await this.page.getByRole('option', { name: p, exact: true }).click();
    }
    if (await this.popover.isVisible()) {
      await this.page.keyboard.press('Escape');
      await expect(this.popover).toBeHidden();
    }
  }
  async isi(d: DataCabang) {
    if (d.kode !== undefined) await this.kode.fill(d.kode);
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.perusahaan) await this.pilihPerusahaan(d.perusahaan);
    if (d.telepon !== undefined) await this.telepon.fill(d.telepon);
    if (d.email !== undefined) await this.email.fill(d.email);
    if (d.alamat !== undefined) await this.alamat.fill(d.alamat);
    if (d.pelabuhan) await this.pilihPelabuhan(d.pelabuhan);
    if (d.aktif !== undefined && (await this.aktif.getAttribute('aria-checked')) !== String(d.aktif)) await this.aktif.click();
  }
  async simpan(): Promise<string> {
    await this.btnForm('Simpan').click();
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(/^(Simpan|Ya.*)$/);
    const t = this.toast.first();
    const muncul = await t.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
    if (!muncul) return `Tidak ada toast; pesan form: "${(await this.pesan()).join(' / ')}"`;
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }
  /** Klik Simpan tanpa menyetujui konfirmasi (uji validasi): konfirmasi → Batal. Mengembalikan pesan form. */
  async cobaSimpan() {
    await this.btnForm('Simpan').click();
    if (await this.konfirmasi.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false)) await this.konfirmasiKlik(/^(Batal|Kembali)$/);
    await this.page.waitForTimeout(600);
    return this.pesan();
  }
  async tambah(d: DataCabang) {
    await this.bukaTambah();
    await this.isi(d);
    const t = await this.simpan();
    expect(t, `simpan cabang ${d.kode}`).toMatch(/berhasil/i);
    await expect(this.form).toBeHidden();
  }
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
  async barisKode(kode: string) {
    await this.goto({ search: kode });
    return (await this.semuaBaris()).find((r) => r.Kode === kode) ?? null;
  }
  /** Nonaktifkan/Aktifkan lewat menu → teks toast (berhasil ATAU ditolak). */
  async ubahStatus(kode: string, aktif: boolean) {
    await this.aksi(kode, aktif ? 'Aktifkan' : 'Nonaktifkan');
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(aktif ? /^(Aktifkan|Ya.*)$/ : /^(Nonaktifkan|Ya.*)$/);
    const t = this.toast.first();
    await expect(t).toBeVisible({ timeout: 15_000 });
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }
  async hapusData(kode: string) {
    await this.aksi(kode, 'Hapus Data');
    await this.konfirmasiKlik(/^(Hapus|Ya.*)$/);
    const t = this.toast.first();
    await expect(t).toBeVisible({ timeout: 15_000 });
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }
}

/* ---------------- API bantu — hanya untuk membersihkan data uji QA ---------------- */
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };
export async function cabangAPI(request: APIRequestContext, cari = ''): Promise<any[]> {
  const r = await request.fetch(`/api/proxy/cms/branches?page=1&limit=100&search=${encodeURIComponent(cari)}`, { headers: H });
  return ((await r.json().catch(() => null)) as any)?.result?.content?.[0]?.rows ?? [];
}
/** Hapus semua cabang yang kodenya diawali `awalan` (data uji QA). Cabang yang ditolak (punya rute aktif) dilepas dulu pelabuhannya lewat layar oleh test. */
export async function bersihkanCabangQA(request: APIRequestContext, awalan: string) {
  const ids = (await cabangAPI(request, awalan)).filter((x) => String(x.code).startsWith(awalan)).map((x) => x.id);
  if (!ids.length) return 0;
  for (const body of [{ action: 'delete', ids }, { action: 'delete', ids: ids.join(',') }]) {
    const d = await request.fetch('/api/proxy/cms/branches/action', { method: 'POST', headers: H, data: JSON.stringify(body) });
    if (d.status() < 400 && !(await cabangAPI(request, awalan)).some((x) => String(x.code).startsWith(awalan))) return ids.length;
  }
  return -1;
}
