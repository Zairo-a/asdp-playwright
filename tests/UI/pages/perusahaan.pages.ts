import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { MasterDataPage } from './master-data.pages';
import { KapalPage } from './kapal.pages';

/* ------------------------------------------------------------------ */
/* PERUSAHAAN — /companies                                             */
/* Tabel: Kode | Nama Perusahaan | Email | Jumlah Cabang | Jumlah Kapal | Status */
/* Form 1 halaman: Kode perusahaan ("Unik, tidak bisa diubah setelah dipakai"), */
/* Nama perusahaan, Telepon, Email, Alamat, switch Aktif               */
/* ("Nonaktif = tidak muncul di pilihan perusahaan baru").             */
/* ------------------------------------------------------------------ */

export const acak = (n = 3) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

export type DataPerusahaan = { kode?: string; nama?: string; telepon?: string; email?: string; alamat?: string; aktif?: boolean };

export class PerusahaanPage extends MasterDataPage {
  constructor(page: Page) {
    super(page, '/companies', 'Perusahaan');
  }
  get kode() { return this.form.getByRole('textbox', { name: 'Kode perusahaan' }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama perusahaan' }); }
  get telepon() { return this.form.getByRole('textbox', { name: 'Telepon' }); }
  get email() { return this.form.getByRole('textbox', { name: 'Email' }); }
  get alamat() { return this.form.getByRole('textbox', { name: 'Alamat' }); }
  get aktif() { return this.form.getByRole('switch', { name: 'Aktif' }); }

  async pesan() {
    const t = (await this.form.locator('[role=alert], [data-slot=form-message]').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    return [...new Set(t)];
  }
  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Perusahaan' })).toBeVisible();
    await expect(this.kode).toBeEditable();
    await this.page.waitForTimeout(300);
  }
  async bukaUbah(kode: string) {
    await this.aksi(kode, /^(Ubah|Edit) Data$/);
    await expect(this.form).toBeVisible();
    await expect(this.nama).not.toHaveValue('');
  }
  async isi(d: DataPerusahaan) {
    if (d.kode !== undefined) await this.kode.fill(d.kode);
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.telepon !== undefined) await this.telepon.fill(d.telepon);
    if (d.email !== undefined) await this.email.fill(d.email);
    if (d.alamat !== undefined) await this.alamat.fill(d.alamat);
    if (d.aktif !== undefined && (await this.aktif.getAttribute('aria-checked')) !== String(d.aktif)) await this.aktif.click();
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
  /** Klik Simpan tanpa menyetujui konfirmasi (untuk uji validasi): kalau muncul konfirmasi → Batal. Mengembalikan pesan form. */
  async cobaSimpan() {
    await this.btnForm('Simpan').click();
    if (await this.konfirmasi.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false)) await this.konfirmasiKlik(/^(Batal|Kembali)$/);
    await this.page.waitForTimeout(600);
    return this.pesan();
  }
  async tambah(d: DataPerusahaan) {
    await this.bukaTambah();
    await this.isi(d);
    const t = await this.simpan();
    expect(t, `simpan perusahaan ${d.kode}`).toMatch(/berhasil/i);
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

/** Pilihan "Perusahaan" di form Tambah Kapal langkah 1 yang cocok dengan `cari` (form DITUTUP tanpa menyimpan). */
export async function perusahaanDiFormKapal(page: Page, cari = '') {
  const k = new KapalPage(page);
  await k.goto();
  await k.bukaTambah();
  const opsi = await k.opsiCombobox(k.perusahaan, cari);
  await k.batalForm('Close');
  return opsi;
}

/* ---------------- API bantu — membaca jumlah & membersihkan data uji QA ---------------- */
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };
const rowsDari = (j: any): any[] => j?.result?.content?.[0]?.rows ?? j?.result?.rows ?? (Array.isArray(j?.result) ? j.result : []);

export async function perusahaanAPI(request: APIRequestContext, cari = ''): Promise<any[]> {
  const r = await request.fetch(`/api/proxy/cms/companies?page=1&limit=100&search=${encodeURIComponent(cari)}`, { headers: H });
  return rowsDari(await r.json().catch(() => null));
}

/** Jumlah kapal per kode perusahaan, dihitung dari master Kapal (detail tiap kapal). */
export async function jumlahKapalPerPerusahaan(request: APIRequestContext) {
  const r = await request.fetch('/api/proxy/cms/vessels?page=1&limit=200', { headers: H });
  const kapal = rowsDari(await r.json().catch(() => null));
  const hitung: Record<string, number> = {};
  for (const v of kapal) {
    const d = await request.fetch(`/api/proxy/cms/vessels/${encodeURIComponent(v.vehicle_code)}`, { headers: H });
    const kode = ((await d.json().catch(() => null)) as any)?.result?.company_code;
    if (kode) hitung[kode] = (hitung[kode] ?? 0) + 1;
  }
  return hitung;
}

/** Jumlah cabang per kode perusahaan, dari menu Cabang (/branches). */
export async function jumlahCabangPerPerusahaan(request: APIRequestContext) {
  const r = await request.fetch('/api/proxy/cms/branches?page=1&limit=200', { headers: H });
  const hitung: Record<string, number> = {};
  for (const b of rowsDari(await r.json().catch(() => null))) if (b.company_code) hitung[b.company_code] = (hitung[b.company_code] ?? 0) + 1;
  return hitung;
}

/** Hapus semua perusahaan yang kodenya diawali `awalan` (data uji QA). */
export async function bersihkanPerusahaanQA(request: APIRequestContext, awalan: string) {
  const ids = (await perusahaanAPI(request, awalan)).filter((x) => String(x.code).startsWith(awalan)).map((x) => x.id);
  if (!ids.length) return 0;
  for (const body of [{ action: 'delete', ids }, { action: 'delete', ids: ids.join(',') }]) {
    const d = await request.fetch('/api/proxy/cms/companies/action', { method: 'POST', headers: H, data: JSON.stringify(body) });
    if (d.status() < 400 && !(await perusahaanAPI(request, awalan)).some((x) => String(x.code).startsWith(awalan))) return ids.length;
  }
  return -1;
}
