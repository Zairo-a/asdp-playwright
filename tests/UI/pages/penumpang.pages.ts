import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { MasterDataPage } from './master-data.pages';

/* ------------------------------------------------------------------ */
/* KELAS PENUMPANG — /services (Kode | Nama | Status)                  */
/* KATEGORI PENUMPANG — /passenger-categories                          */
/*   (Urutan | Kode | Nama | Deskripsi | Usia Min | Usia Maks |         */
/*    Pakai Kursi / Kuota | Wajib Identitas | Status)                  */
/* Form 1 halaman, tombol Simpan.                                      */
/* ------------------------------------------------------------------ */

export const acak = (n = 3) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

/** Bagian bersama: pesan form, simpan (+konfirmasi opsional), ubah status, hapus. */
class FormSatuHalaman extends MasterDataPage {
  /** Pesan validasi di form (unik). */
  async pesan() {
    const t = (await this.form.locator('[role=alert], [data-slot=form-message]').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    return [...new Set(t)];
  }

  /** Klik Simpan; kalau ada konfirmasi → setujui. Mengembalikan teks toast, atau pesan form kalau tidak ada toast. */
  async simpan(): Promise<string> {
    await this.btnForm('Simpan').click();
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(/^(Simpan|Ya.*)$/);
    const t = this.toast.first();
    const muncul = await t.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
    if (!muncul) return `Tidak ada toast; pesan form: "${(await this.pesan()).join(' / ')}"`;
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Menu baris "Ubah Data"/"Edit Data" (Kelas Penumpang memakai "Edit Data"). */
  async bukaUbah(kode: string) {
    await this.aksi(kode, /^(Ubah|Edit) Data$/);
    await expect(this.form).toBeVisible();
    await this.page.waitForTimeout(300);
  }

  /** Nonaktifkan / Aktifkan lewat menu baris (konfirmasi opsional). */
  async ubahStatus(kode: string, aktif: boolean) {
    await this.aksi(kode, aktif ? 'Aktifkan' : 'Nonaktifkan');
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(aktif ? /^(Aktifkan|Ya.*)$/ : /^(Nonaktifkan|Ya.*)$/);
    await this.expectToast(/berhasil/i);
  }

  /** Hapus lewat menu baris → teks toast (berhasil atau ditolak). */
  async hapusData(kode: string) {
    await this.aksi(kode, 'Hapus Data');
    await this.konfirmasiKlik(/^(Hapus|Ya.*)$/);
    const t = this.toast.first();
    await expect(t).toBeVisible({ timeout: 15_000 });
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Baris tabel sebagai objek { kolom: teks } untuk semua baris yang tampil. */
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
}

export type DataKelas = { kode?: string; nama?: string; aktif?: boolean };

export class KelasPage extends FormSatuHalaman {
  constructor(page: Page) {
    super(page, '/services', 'Kelas Penumpang');
  }
  get kode() { return this.form.getByRole('textbox', { name: 'Kode Kelas Penumpang' }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama Kelas Penumpang' }); }
  get status() { return this.form.getByRole('switch', { name: 'Status' }); }

  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Data Kelas Penumpang' })).toBeVisible();
    await expect(this.kode).toBeEditable();
    await this.page.waitForTimeout(300);
  }
  async isi(d: DataKelas) {
    if (d.kode !== undefined) await this.kode.fill(d.kode);
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.aktif !== undefined && (await this.status.getAttribute('aria-checked')) !== String(d.aktif)) await this.status.click();
  }
  async tambah(d: DataKelas) {
    await this.bukaTambah();
    await this.isi(d);
    const t = await this.simpan();
    expect(t, `simpan kelas ${d.kode}`).toMatch(/berhasil/i);
    await expect(this.form).toBeHidden();
  }
}

export type DataKategori = {
  urutan?: string; kode?: string; nama?: string; keterangan?: string; min?: string; maks?: string;
  pakaiKursi?: boolean; wajibIdentitas?: boolean; aktif?: boolean;
};

export class KategoriPage extends FormSatuHalaman {
  constructor(page: Page) {
    super(page, '/passenger-categories', 'Kategori Penumpang');
  }
  get urutan() { return this.form.getByRole('textbox', { name: 'Urutan' }); }
  get kode() { return this.form.getByRole('textbox', { name: 'Kode', exact: true }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama', exact: true }); }
  get keterangan() { return this.form.getByRole('textbox', { name: 'Keterangan' }); }
  get min() { return this.form.getByRole('textbox', { name: 'Min umur (tahun)' }); }
  get maks() { return this.form.getByRole('textbox', { name: 'Maks umur (tahun)' }); }
  get pakaiKursi() { return this.form.getByRole('switch', { name: 'Pakai kursi' }); }
  get wajibIdentitas() { return this.form.getByRole('switch', { name: 'Wajib identitas' }); }
  get status() { return this.form.getByRole('switch', { name: 'Status' }); }

  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Kategori Penumpang' })).toBeVisible();
    await expect(this.kode).toBeEditable();
    await this.page.waitForTimeout(300);
  }
  private async setSwitch(sw: Locator, nilai?: boolean) {
    if (nilai !== undefined && (await sw.getAttribute('aria-checked')) !== String(nilai)) await sw.click();
  }
  async isi(d: DataKategori) {
    if (d.urutan !== undefined) await this.urutan.fill(d.urutan);
    if (d.kode !== undefined) await this.kode.fill(d.kode);
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.keterangan !== undefined) await this.keterangan.fill(d.keterangan);
    if (d.min !== undefined) await this.min.fill(d.min);
    if (d.maks !== undefined) await this.maks.fill(d.maks);
    await this.setSwitch(this.pakaiKursi, d.pakaiKursi);
    await this.setSwitch(this.wajibIdentitas, d.wajibIdentitas);
    await this.setSwitch(this.status, d.aktif);
  }
  async tambah(d: DataKategori) {
    await this.bukaTambah();
    await this.isi(d);
    const t = await this.simpan();
    expect(t, `simpan kategori ${d.kode}`).toMatch(/berhasil/i);
    await expect(this.form).toBeHidden();
  }
}

/* ---------------- API bantu — hanya untuk menyiapkan & membersihkan data uji QA ---------------- */
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };

export async function barisAPI(request: APIRequestContext, path: '/services' | '/passenger-categories', cari = ''): Promise<any[]> {
  const r = await request.fetch(`/api/proxy/cms${path}?page=1&limit=100&search=${encodeURIComponent(cari)}`, { headers: H });
  const j: any = await r.json().catch(() => null);
  return j?.result?.content?.[0]?.rows ?? [];
}

/** Hapus semua data yang kodenya diawali `awalan` (data uji QA). Mengembalikan jumlah yang dihapus (-1 = gagal). */
export async function bersihkanQA(request: APIRequestContext, path: '/services' | '/passenger-categories', awalan: string) {
  const ids = (await barisAPI(request, path, awalan)).filter((x) => String(x.code).startsWith(awalan)).map((x) => x.id);
  if (!ids.length) return 0;
  for (const body of [{ action: 'delete', ids }, { action: 'delete', ids: ids.join(',') }]) {
    const d = await request.fetch(`/api/proxy/cms${path}/action`, { method: 'POST', headers: H, data: JSON.stringify(body) });
    if (d.status() < 400 && (await barisAPI(request, path, awalan)).filter((x) => String(x.code).startsWith(awalan)).length === 0) return ids.length;
  }
  return -1;
}

/* ---------------- Dampak: daftar kelas di form Kapal langkah 3 (form DITUTUP tanpa menyimpan) ---------------- */
import { KapalPage } from './kapal.pages';

/** Nama kelas yang ditawarkan di form Tambah Kapal langkah 3 ("Kuota <NAMA>"). */
export async function kelasDiFormKapal(page: Page) {
  const k = new KapalPage(page);
  await k.goto();
  await k.bukaTambah();
  await k.isiLangkah1({ kode: 'QAXKK', nama: 'QA AUTO KK', jenis: 'Water Taxi', grt: '100', perusahaan: 'PT. Dharma Lautan Utama', pelabuhan: 'LEMBAR' });
  await k.lanjutKe('2/5');
  await k.isiLangkah2({ abk: '5', pelampung: '100', noSkkp: 'QA-SKKP', maksSkkp: '80', skkpSampai: '2030-12-31' });
  await k.lanjutKe('3/5');
  // nama aksesibel input = "Kuota <NAMA>" → baca dari snapshot aksesibilitas tabel kuota
  const snap = await k.form.ariaSnapshot();
  const label = [...snap.matchAll(/textbox "Kuota ([^"]+)"/g)].map((m) => m[1]);
  await k.batalForm('Close', 'Ya, Batalkan');
  return label;
}
