import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { MasterDataPage } from './master-data.pages';
import { KapalFormGolongan } from './golongan.pages';

/* ------------------------------------------------------------------ */
/* KAPAL — /vessels (menu "Kapal")                                     */
/* Tabel: Kode | Nama Kapal | Jenis Kapal | GRT | IMO | ABK | Pelampung |*/
/*        Kap. Penumpang | Kap. SUP | SKKP s.d. | Status               */
/* Form 5 langkah (tombol lanjut "Berikutnya"):                        */
/*  1 Data Kapal · 2 ABK & Keselamatan · 3 Kapasitas Penumpang ·       */
/*  4 Kapasitas Kendaraan · 5 Barang & Hewan                           */
/* ------------------------------------------------------------------ */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
/** "2027-12-31" → "31 Desember 2027" (format tampilan tombol tanggal SKKP). */
export const tglPanjang = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};
export const acak = (n = 3) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

export type DataKapal = {
  kode?: string;
  nama?: string;
  jenis?: string; // teks opsi, mis. 'Water Taxi'
  grt?: string;
  imo?: string;
  tahun?: string;
  perusahaan?: string; // mis. 'PT. Dharma Lautan Utama'
  pelabuhan?: string; // mis. 'LEMBAR'
  abk?: string;
  pelampung?: string;
  noSkkp?: string;
  maksSkkp?: string;
  skkpSampai?: string; // ISO yyyy-mm-dd
  kuota?: Record<string, string>; // { EKONOMI: '50' }
  totalSup?: string;
  golongan?: Record<string, string>; // { 'Mobil Penumpang': '2' } (nama golongan → maks unit)
  barang?: Record<string, string>; // { 'Hewan ternak': '0' }
};

export const PESAN_KAPAL = {
  wajib: 'Wajib diisi',
  angkaPositif: 'Harus berupa angka lebih dari 0',
  imo: 'Nomor IMO harus 7 digit',
};

export class KapalPage extends MasterDataPage {
  constructor(page: Page) {
    super(page, '/vessels', 'Kapal');
  }

  // langkah 1
  get kode() { return this.form.getByRole('textbox', { name: 'Kode kapal' }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama kapal' }); }
  get jenis() { return this.form.getByRole('combobox', { name: 'Jenis kapal' }); }
  get grt() { return this.form.getByRole('textbox', { name: 'GRT' }); }
  get imo() { return this.form.getByRole('textbox', { name: 'Nomor IMO' }); }
  get tahun() { return this.form.getByRole('textbox', { name: 'Tahun pembuatan' }); }
  get perusahaan() { return this.form.getByRole('combobox', { name: 'Perusahaan' }); }
  get pelabuhan() { return this.form.getByRole('combobox', { name: 'Pelabuhan pangkalan' }); }
  // langkah 2
  get abk() { return this.form.getByRole('textbox', { name: 'Jumlah ABK' }); }
  get pelampung() { return this.form.getByRole('textbox', { name: 'Jumlah pelampung' }); }
  get noSkkp() { return this.form.getByRole('textbox', { name: 'No. SKKP' }); }
  get maksSkkp() { return this.form.getByRole('textbox', { name: 'Penumpang maks SKKP' }); }
  get tglSkkp() { return this.form.getByRole('button', { name: 'Masa berlaku SKKP' }); }
  // langkah 3
  get btnPax() { return this.form.getByRole('button', { name: 'Pax', exact: true }); }
  get btnSeat() { return this.form.getByRole('button', { name: 'Seat', exact: true }); }
  kuota(kelas: string) { return this.form.getByRole('textbox', { name: `Kuota ${kelas}`, exact: true }); }
  /** Teks status batas keselamatan di langkah 3 (mis. "Di bawah batas keselamatan"). */
  get statusKeselamatan() { return this.form.getByText(/batas keselamatan|melebihi/i).last(); }
  // langkah 4
  get totalSup() { return this.form.getByRole('textbox', { name: 'Total SUP kapal' }); }
  golongan(nama: string) { return this.form.getByRole('textbox', { name: KapalFormGolongan.labelGolongan(nama) }); }
  /** Semua input "Maks unit (opsional) …" (urutan tabel). */
  get semuaInputGolongan() { return this.form.getByRole('textbox', { name: /^Maks unit \(opsional\)/ }); }
  // langkah 5
  barang(nama: string) { return this.form.getByRole('textbox', { name: `Maks kapal (opsional) ${nama}`, exact: true }); }

  /** Pesan validasi di form (urutan tampil, boleh dobel). */
  async pesan() {
    return (await this.form.getByRole('alert').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
  }

  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Kapal' })).toBeVisible();
    await expect(this.kode).toBeEditable();
    await this.page.waitForTimeout(300); // animasi dialog
  }

  async bukaUbah(kode: string) {
    await this.aksi(kode, 'Ubah Data');
    await expect(this.form.getByRole('heading', { name: 'Ubah Kapal' })).toBeVisible();
    await expect(this.nama).not.toHaveValue('');
  }

  /** Pilih opsi pada combobox ber-popover (ketik `cari`, pilih opsi yang diawali `opsi`). */
  async pilih(cb: Locator, cari: string, opsi = cari) {
    await this.pilihDiCombobox(cb, cari, new RegExp('^' + esc(opsi)));
  }

  /** Daftar teks opsi sebuah combobox (popover ditutup lagi). */
  async opsiCombobox(cb: Locator, cari = '') {
    await expect(async () => {
      if (!(await this.popover.isVisible())) await cb.click();
      await expect(this.popover).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    if (cari) await this.popover.locator('input').first().fill(cari);
    // opsi dimuat dari server → tunggu sampai ada (maks 10 detik)
    await expect(this.popover.getByRole('option').first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
    await this.page.waitForTimeout(300);
    const t =(await this.popover.getByRole('option').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    await this.page.keyboard.press('Escape');
    await expect(this.popover).toBeHidden(); // tunggu benar-benar tertutup sebelum membuka combobox lain
    return t;
  }

  /** Klik "Berikutnya" lalu pastikan pindah ke langkah `target` (mis. '2/5'). */
  async lanjutKe(target: string) {
    await this.lanjut();
    await expect(this.langkah()).toHaveText(target);
  }

  /** Pilih tanggal SKKP (ISO) di kalender. */
  async pilihTanggalSkkp(iso: string) {
    const [y, m, d] = iso.split('-').map(Number);
    await this.tglSkkp.click();
    const kal = this.popover.filter({ has: this.page.getByRole('button', { name: 'Ke bulan berikutnya' }) });
    await expect(kal).toBeVisible();
    const target = `${BULAN[m - 1]} ${y}`;
    for (let i = 0; i < 120; i++) {
      const sekarang = (await kal.getByRole('status').innerText()).trim();
      if (sekarang === target) break;
      const [bln, thn] = sekarang.split(' ');
      const maju = Number(thn) * 12 + BULAN.indexOf(bln) < y * 12 + (m - 1);
      await kal.getByRole('button', { name: maju ? 'Ke bulan berikutnya' : 'Ke bulan sebelumnya' }).click();
    }
    await kal.getByRole('button', { name: new RegExp(`^\\S+, ${d} ${BULAN[m - 1]} ${y}$`) }).first().click();
    await expect(this.tglSkkp).toContainText(tglPanjang(iso));
    // kalender biasanya menutup sendiri; Escape hanya kalau masih terbuka (Escape saat kalender sudah tutup = menutup form!)
    const tutup = await kal.waitFor({ state: 'hidden', timeout: 2_000 }).then(() => true, () => false);
    if (!tutup) await this.page.keyboard.press('Escape');
  }

  async isiLangkah1(d: DataKapal) {
    if (d.kode !== undefined) await this.kode.fill(d.kode);
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.jenis) await this.pilih(this.jenis, d.jenis);
    if (d.grt !== undefined) await this.grt.fill(d.grt);
    if (d.imo !== undefined) await this.imo.fill(d.imo);
    if (d.tahun !== undefined) await this.tahun.fill(d.tahun);
    if (d.perusahaan) await this.pilih(this.perusahaan, d.perusahaan.replace(/^PT\.? /, ''), d.perusahaan);
    if (d.pelabuhan) await this.pilih(this.pelabuhan, d.pelabuhan);
  }
  async isiLangkah2(d: DataKapal) {
    if (d.abk !== undefined) await this.abk.fill(d.abk);
    if (d.pelampung !== undefined) await this.pelampung.fill(d.pelampung);
    if (d.noSkkp !== undefined) await this.noSkkp.fill(d.noSkkp);
    if (d.maksSkkp !== undefined) await this.maksSkkp.fill(d.maksSkkp);
    if (d.skkpSampai) await this.pilihTanggalSkkp(d.skkpSampai);
  }
  async isiLangkah3(d: DataKapal) {
    for (const [k, v] of Object.entries(d.kuota ?? {})) await this.kuota(k).fill(v);
  }
  async isiLangkah4(d: DataKapal) {
    if (d.totalSup !== undefined) await this.totalSup.fill(d.totalSup);
    for (const [g, v] of Object.entries(d.golongan ?? {})) await this.golongan(g).fill(v);
  }
  async isiLangkah5(d: DataKapal) {
    for (const [b, v] of Object.entries(d.barang ?? {})) await this.barang(b).fill(v);
  }

  /** Isi langkah 1..5 (berhenti di 5/5, belum disimpan). */
  async isiSemua(d: DataKapal) {
    await this.isiLangkah1(d);
    await this.lanjutKe('2/5');
    await this.isiLangkah2(d);
    await this.lanjutKe('3/5');
    await this.isiLangkah3(d);
    await this.lanjutKe('4/5');
    await this.isiLangkah4(d);
    await this.lanjutKe('5/5');
    await this.isiLangkah5(d);
  }

  /** Klik Simpan (+ konfirmasi bila ada). Mengembalikan teks toast, atau pesan form kalau tidak ada toast. */
  async simpan(): Promise<string> {
    await this.btnForm('Simpan').click();
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(/^(Simpan|Ya.*)$/);
    const t = this.toast.first();
    const muncul = await t.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
    if (!muncul) return `Tidak ada toast; pesan form: "${(await this.pesan()).join(' / ')}"`;
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Tambah kapal lengkap lewat 5 langkah; berhasil = toast "berhasil" & form tertutup. */
  async tambah(d: DataKapal) {
    await this.bukaTambah();
    await this.isiSemua(d);
    const hasil = await this.simpan();
    expect(hasil, `simpan kapal ${d.kode}`).toMatch(/berhasil/i);
    await expect(this.form).toBeHidden();
  }

  /** Ubah Data → (isi langkah 1) → telusuri sampai 5/5 → Simpan. */
  async ubah(kode: string, d: DataKapal) {
    await this.bukaUbah(kode);
    await this.isiSemua(d);
    return this.simpan();
  }

  /** Nonaktifkan/Aktifkan lewat menu baris (konfirmasi opsional). */
  async ubahStatus(kode: string, aktif: boolean) {
    await this.aksi(kode, aktif ? 'Aktifkan' : 'Nonaktifkan');
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(aktif ? /^(Aktifkan|Ya.*)$/ : /^(Nonaktifkan|Ya.*)$/);
    await this.expectToast(/berhasil/i);
  }

  /** Hapus lewat menu baris. */
  async hapusKapal(kode: string) {
    await this.aksi(kode, 'Hapus Data');
    await this.konfirmasiKlik(/^(Hapus|Ya.*)$/);
    await this.expectToast(/berhasil/i);
  }
}

/* ---------------- API bantu — hanya untuk menyiapkan & membersihkan data uji QA ---------------- */
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };

export async function detailKapalAPI(request: APIRequestContext, kode: string): Promise<any> {
  const r = await request.fetch(`/api/proxy/cms/vessels/${encodeURIComponent(kode)}`, { headers: H });
  return (await r.json().catch(() => null))?.result ?? null;
}

/** Baris kapal dari API daftar (search). */
export async function cariKapalAPI(request: APIRequestContext, kata: string): Promise<any[]> {
  const r = await request.fetch(`/api/proxy/cms/vessels?page=1&limit=100&search=${encodeURIComponent(kata)}`, { headers: H });
  const j: any = await r.json().catch(() => null);
  return j?.result?.content?.[0]?.rows ?? [];
}

/** Hapus semua kapal yang kodenya diawali `awalan` (data uji QA). Mengembalikan jumlah yang dihapus. */
export async function bersihkanKapalQA(request: APIRequestContext, awalan: string) {
  const ids = (await cariKapalAPI(request, awalan)).map((x) => String(x.vehicle_code)).filter((k) => k.startsWith(awalan));
  if (!ids.length) return 0;
  await request.fetch('/api/proxy/cms/vessels/action', { method: 'POST', headers: H, data: JSON.stringify({ action: 'delete', ids }) });
  return ids.length;
}

/* ---------------- Web Ferizy — dipindah ke ferizy.pages.ts (diekspor ulang supaya import lama tetap jalan) ---------------- */
export { FERIZY, tglDepan, kartuFerizy } from './ferizy.pages';
