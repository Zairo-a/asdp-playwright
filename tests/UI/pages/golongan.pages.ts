import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { MasterDataPage } from './master-data.pages';

/* ------------------------------------------------------------------ */
/* GOLONGAN KENDARAAN — /vehicle-classes (menu "Golongan Kendaraan")   */
/* Form 1 halaman: Golongan (kode), Nama, Kategori, Deskripsi,         */
/* Panjang maksimal, Max penumpang, Nilai SUP, Urutan, Status Aktif.   */
/* Daftar: Urutan | Golongan | Nama | Kategori | Deskripsi |           */
/*         Panjang Maks (m) | Maks Penumpang | Nilai SUP | Status      */
/* ------------------------------------------------------------------ */

export type Kategori = 'Kendaraan Roda Dua/Tiga' | 'Kendaraan Penumpang' | 'Kendaraan Barang';
/** Nama kategori di tabel & filter (sejak 23 Nov 2026 sama dengan form, Bahasa Indonesia — GK-T01 tidak muncul lagi). */
export const KATEGORI_TABEL: Record<Kategori, string> = {
  'Kendaraan Roda Dua/Tiga': 'Kendaraan Roda Dua/Tiga',
  'Kendaraan Penumpang': 'Kendaraan Penumpang',
  'Kendaraan Barang': 'Kendaraan Barang',
};

export type DataGolongan = {
  kode: string;
  nama: string;
  kategori?: Kategori;
  deskripsi?: string;
  panjang?: string;
  maxPenumpang?: string;
  sup?: string;
  urutan?: string;
};

export const PESAN = {
  kodeWajib: 'Kode wajib diisi',
  namaWajib: 'Nama wajib diisi',
  kategoriWajib: 'Kategori wajib dipilih',
  supWajib: 'Nilai SUP wajib diisi',
  kodeFormat: 'Kode hanya boleh huruf besar dan angka',
  angka: 'Harus berupa angka 0 sampai 999,99 dengan maksimal 2 desimal',
  bulat: 'Harus bilangan bulat minimal 1',
};

export class GolonganPage extends MasterDataPage {
  constructor(page: Page) {
    super(page, '/vehicle-classes', 'Golongan Kendaraan');
  }

  get kode() { return this.form.getByRole('textbox', { name: 'Golongan', exact: true }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama', exact: true }); }
  get kategori() { return this.form.getByRole('combobox', { name: 'Kategori' }); }
  get deskripsi() { return this.form.getByRole('textbox', { name: 'Deskripsi' }); }
  get panjang() { return this.form.getByRole('textbox', { name: 'Panjang maksimal (m)' }); }
  get maxPenumpang() { return this.form.getByRole('textbox', { name: 'Max penumpang' }); }
  get sup() { return this.form.getByRole('textbox', { name: 'Nilai SUP' }); }
  get urutan() { return this.form.getByRole('textbox', { name: 'Urutan', exact: true }); }

  /** Pesan-pesan validasi yang tampil di form. */
  async pesanForm() {
    const t = (await this.form.locator('[role=alert], [data-slot=form-message]').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    return [...new Set(t)];
  }

  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Golongan Kendaraan' })).toBeVisible();
    await expect(this.kode).toBeEditable();
  }

  async bukaUbah(kode: string) {
    await this.aksi(kode, 'Ubah Data');
    await expect(this.form.getByRole('heading', { name: new RegExp(`^Ubah · Golongan ${kode}\\b`) })).toBeVisible();
  }

  async pilihKategori(k: Kategori) {
    await this.kategori.click();
    await this.page.getByRole('option', { name: k, exact: true }).click();
    await expect(this.kategori).toContainText(k);
  }

  async isi(d: Partial<DataGolongan>) {
    if (d.kode !== undefined) await this.kode.fill(d.kode);
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.kategori) await this.pilihKategori(d.kategori);
    if (d.deskripsi !== undefined) await this.deskripsi.fill(d.deskripsi);
    if (d.panjang !== undefined) await this.panjang.fill(d.panjang);
    if (d.maxPenumpang !== undefined) await this.maxPenumpang.fill(d.maxPenumpang);
    if (d.sup !== undefined) await this.sup.fill(d.sup);
    if (d.urutan !== undefined) await this.urutan.fill(d.urutan);
  }

  /** Klik Simpan; kalau muncul dialog konfirmasi → Simpan. Mengembalikan teks toast pertama (atau pesan form). */
  async simpan(): Promise<string> {
    await this.btnForm('Simpan').click();
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(/^(Simpan|Ya.*)$/);
    const t = this.toast.first();
    const muncul = await t.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
    if (!muncul) return `Tidak ada toast; pesan form: "${(await this.pesanForm()).join(' / ')}"`;
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Tambah lewat form; berhasil = toast "berhasil" & form tertutup. */
  async tambah(d: DataGolongan) {
    await this.bukaTambah();
    await this.isi(d);
    const hasil = await this.simpan();
    expect(hasil, `simpan golongan ${d.kode}`).toMatch(/berhasil/i);
    await expect(this.form).toBeHidden();
  }

  /** Nonaktifkan / Aktifkan lewat menu baris. Status di tabel: "Aktif" / "Nonaktif". */
  async ubahStatus(kode: string, aktif: boolean) {
    await this.aksi(kode, aktif ? 'Aktifkan' : 'Nonaktifkan');
    const ada = await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (ada) await this.konfirmasiKlik(aktif ? /^(Aktifkan|Ya.*)$/ : /^(Nonaktifkan|Ya.*)$/);
    await this.expectToast(/berhasil/i);
  }
}

/* ---------------- Form kapal (Master Kapal) langkah 4 — untuk uji dampak ---------------- */
export class KapalFormGolongan extends MasterDataPage {
  constructor(page: Page) {
    super(page, '/vessels', 'Kapal');
  }
  /** Buka "Ubah Data" kapal (berdasarkan kode) lalu ke langkah 4/5 "Kapasitas Kendaraan". */
  async bukaLangkahKendaraan(kodeKapal: string) {
    await this.goto({ search: kodeKapal });
    await this.aksi(kodeKapal, 'Ubah Data');
    await expect(this.form.getByRole('heading', { name: /^Ubah Kapal/ })).toBeVisible();
    for (const n of ['2/5', '3/5', '4/5']) {
      await this.form.getByRole('button', { name: 'Berikutnya', exact: true }).click();
      await expect(this.langkah()).toHaveText(n);
    }
    await expect(this.form.getByText('Kapasitas SUP kendaraan')).toBeVisible();
  }
  /**
   * Input "Maks unit (opsional) [<kode>] <nama golongan>" di langkah 4.
   * Sejak 23 Nov 2026 label diawali kode golongan (mis. "IVA Mobil Penumpang"); format lama tanpa kode tetap dikenali.
   */
  inputGolongan(nama: string) {
    return this.form.getByRole('textbox', { name: KapalFormGolongan.labelGolongan(nama) });
  }
  /** Pola label input golongan (dipakai juga untuk filter `has` di baris tabel). */
  static labelGolongan(nama: string) {
    const aman = nama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^Maks unit \\(opsional\\) (\\S+ )?${aman}$`);
  }
}

/* ---------------- API bantu — hanya untuk membersihkan data uji QA ---------------- */
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };

/** Hapus semua golongan yang kodenya diawali `awalanKode` (data uji QA). */
export async function bersihkanGolonganQA(request: APIRequestContext, awalanKode: string) {
  const r = await request.fetch(`/api/proxy/cms/vehicle-classes?page=1&limit=100&search=${encodeURIComponent(awalanKode)}`, { headers: H });
  const j: any = await r.json().catch(() => null);
  const rows: any[] = j?.result?.content?.[0]?.rows ?? j?.result?.rows ?? (Array.isArray(j?.result) ? j.result : []);
  const ids = rows.filter((x) => String(x.code ?? x.class_code ?? x.golongan ?? '').startsWith(awalanKode)).map((x) => x.id);
  if (!ids.length) return 0;
  for (const body of [{ action: 'delete', ids }, { action: 'delete', ids: ids.join(',') }]) {
    const d = await request.fetch('/api/proxy/cms/vehicle-classes/action', { method: 'POST', headers: H, data: JSON.stringify(body) });
    if (d.status() < 400) return ids.length;
  }
  return -1; // gagal dibersihkan lewat API — test hapus lewat layar tetap membersihkan
}

/**
 * Buat kapal uji QA lewat API (meniru kapal `kodeContoh` untuk jenis/perusahaan/pelabuhan/kelas),
 * dengan satu golongan kendaraan `kodeGolongan` (qty unit). Hanya untuk uji dampak; SELALU hapus dengan hapusKapalQA.
 */
export async function buatKapalQA(
  request: APIRequestContext, kodeKapal: string, kodeGolongan: string, kodeContoh: string, qty = 2,
  /** Kuota per kelas penumpang (service_id = id kelas). Default: meniru kelas kapal contoh, kuota 10. */
  kuotaKelas?: { service_id: number; quota: number }[],
  /** Kode perusahaan pemilik kapal. Default: sama dengan kapal contoh. */
  kodePerusahaan?: string,
) {
  const g = await request.fetch(`/api/proxy/cms/vessels/${encodeURIComponent(kodeContoh)}`, { headers: H });
  const v: any = (await g.json().catch(() => null))?.result;
  expect(v, `kapal contoh ${kodeContoh} tidak ditemukan`).toBeTruthy();
  const body = {
    vehicle_code: kodeKapal, vessel_name: `QA AUTO KAPAL ${kodeKapal}`, vessel_type_id: v.vessel_type_id, company_code: kodePerusahaan ?? v.company_code,
    imo_number: null, grt: 100, manufacture_year: null, outlet_id: v.outlet_id, crew_count: 2, lifejacket_count: 50,
    skkp_number: 'QA-SKKP', skkp_max_persons: 50, skkp_expired_at: '2030-12-31', capacity_mode: 'pax', vehicle_capacity_sup: 10,
    seat_layout_id: null, class_quotas: kuotaKelas ?? (v.class_quotas ?? []).map((c: any) => ({ service_id: c.service_id, quota: 10 })),
    vehicle_classes: [{ code: kodeGolongan, qty }], is_active: 1,
  };
  const r = await request.fetch('/api/proxy/cms/vessels', { method: 'POST', headers: H, data: JSON.stringify(body) });
  const j: any = await r.json().catch(() => null);
  expect(r.status(), `gagal membuat kapal uji: ${JSON.stringify(j)?.slice(0, 300)}`).toBeLessThan(400);
  return j?.result;
}

/** Hapus kapal uji QA (abaikan kalau sudah tidak ada). */
export async function hapusKapalQA(request: APIRequestContext, kodeKapal: string) {
  await request.fetch('/api/proxy/cms/vessels/action', { method: 'POST', headers: H, data: JSON.stringify({ action: 'delete', ids: [kodeKapal] }) });
}