import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { MasterDataPage } from './master-data.pages';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/* ------------------------------------------------------------------ */
/* RUTE — /routes (menu "Jadwal Rute")                                 */
/* Form rute 3 langkah: Data Rute · Penjualan & Kapasitas · Booking &   */
/* Paid Index. Tombol lanjut = "Berikutnya".                           */
/* ------------------------------------------------------------------ */
export class RutePage extends MasterDataPage {
  constructor(page: Page) {
    super(page, '/routes', 'Jadwal Rute');
  }

  // form rute
  get asal() { return this.form.getByRole('combobox', { name: 'Pelabuhan asal' }); }
  get tujuan() { return this.form.getByRole('combobox', { name: 'Pelabuhan tujuan' }); }
  get kodeRute() { return this.form.getByRole('textbox', { name: 'Kode rute' }); }
  get namaRute() { return this.form.getByRole('textbox', { name: 'Nama rute' }); }
  get batasOnline() { return this.form.getByRole('textbox', { name: 'Nilai batas online' }); }
  get goShow() { return this.form.getByRole('textbox', { name: 'Batas penjualan loket (go-show)' }); }
  get kapasitas() { return this.form.getByRole('textbox', { name: 'Kapasitas operasional default' }); }

  /** Tombol "Jadwal" di baris (mis. "13 Jadwal", atau "Tambahkan" kalau belum ada jadwal). */
  tombolJadwal(kode: string) {
    return this.baris(kode).getByRole('button', { name: /\d+ Jadwal|Tambahkan/ });
  }

  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Data Rute' })).toBeVisible();
    await expect(this.asal).toBeEnabled();
  }

  /** Pilih pelabuhan di combobox asal/tujuan (opsi diawali nama pelabuhan). */
  async pilihPelabuhan(cb: Locator, nama: string) {
    await this.pilihDiCombobox(cb, nama, new RegExp('^' + esc(nama)));
  }

  /** Buka combobox tujuan, ketik nama → kembalikan jumlah opsi yang cocok (lalu tutup). */
  async jumlahOpsiTujuan(nama: string) {
    await this.tujuan.click();
    await expect(this.popover).toBeVisible();
    await this.popover.locator('input').first().fill(nama);
    await this.page.waitForTimeout(800); // tunggu daftar tersaring
    const n = await this.popover.getByRole('option', { name: new RegExp('^' + esc(nama)) }).count();
    await this.page.keyboard.press('Escape');
    return n;
  }

  /** Tambah rute asal → tujuan lewat form (nilai default lainnya). Mengembalikan kode rute. */
  async tambahRute(asal: string, tujuan: string) {
    await this.bukaTambah();
    await this.pilihPelabuhan(this.asal, asal);
    await this.pilihPelabuhan(this.tujuan, tujuan);
    await expect(this.kodeRute).not.toHaveValue('');
    const kode = await this.kodeRute.inputValue();
    await this.lanjut();
    await expect(this.langkah()).toHaveText('2/3');
    await this.lanjut();
    await expect(this.langkah()).toHaveText('3/3');
    await this.btnForm('Simpan').click();
    await this.konfirmasiKlik('Simpan');
    await this.expectToast(/berhasil/i);
    await expect(this.form).toBeHidden();
    return kode;
  }

  /** Menu baris → "Edit Rute & Jadwal" → halaman detail /routes/{id}/schedules. */
  async bukaDetail(kode: string) {
    await this.aksi(kode, 'Edit Rute & Jadwal');
    await expect(this.page).toHaveURL(/\/routes\/\d+\/schedules/);
    const d = new DetailRutePage(this.page);
    await d.tungguTermuat(kode);
    return d;
  }

  /** Menu aktivasi rute. Labelnya saat ini selalu "Aktifkan" (temuan RJ-T01), jadi terima keduanya. */
  async klikAktivasi(kode: string) {
    await this.aksi(kode, /^(Aktifkan|Nonaktifkan)$/);
    await this.konfirmasiKlik(/^(Aktifkan|Nonaktifkan)$/);
    await this.expectToast(/berhasil/i);
  }
}

/* ------------------------------------------------------------------ */
/* DETAIL RUTE — /routes/{id}/schedules (tab Info & Tarif Dasar)       */
/* Form jadwal 5 langkah, tombol lanjut = "Selanjutnya".               */
/* ------------------------------------------------------------------ */
export class DetailRutePage extends MasterDataPage {
  constructor(page: Page) {
    super(page, '', '');
  }
  get judulRute() { return this.main.getByText(/\([A-Z0-9-]+\)$/).first(); }
  get btnUbahRute() { return this.main.getByRole('button', { name: 'Ubah rute' }); }
  get tabInfo() { return this.main.getByRole('tab', { name: 'Info' }); }
  get tabTarif() { return this.main.getByRole('tab', { name: 'Tarif Dasar' }); }

  /** id rute dari URL. */
  routeId() {
    return this.page.url().match(/\/routes\/(\d+)\/schedules/)![1];
  }

  async tungguTermuat(kode: string) {
    await expect(this.main).toContainText(`(${kode})`, { timeout: 30_000 });
    await this.tungguData();
  }

  /** Nilai satu baris info, mis. info('Aktifasi') → "Tidak Aktif". */
  async info(label: string) {
    const teks = (await this.main.innerText()).replace(/\s+/g, ' ');
    const m = teks.match(new RegExp(esc(label) + ' (.+?) (Status|Batas|Outlet|Aktifasi|Go-show|Kap\\.|Form|Paid|Jeda|Jadwal) '));
    return m ? m[1].trim() : '';
  }

  // form jadwal (5 langkah)
  jamKe(n: number) { return this.form.getByRole('textbox', { name: `Jam Keberangkatan ${n}` }); }
  kodeJadwalKe(n: number) { return this.form.getByRole('textbox', { name: `Kode Jadwal ${n}` }); }
  get jam() { return this.jamKe(1); }
  get kodeJadwal() { return this.kodeJadwalKe(1); }
  get btnTambahJam() { return this.form.getByRole('button', { name: 'Tambah', exact: true }); }
  get unitBisnis() { return this.form.getByRole('combobox', { name: 'Unit Bisnis' }); }
  get pilihSemuaHari() { return this.form.getByRole('checkbox', { name: 'Pilih semua' }); }
  hari(nama: 'Sen' | 'Sel' | 'Rab' | 'Kam' | 'Jum' | 'Sab' | 'Min') { return this.form.getByRole('button', { name: nama, exact: true }); }
  get kapalDefault() { return this.form.getByRole('combobox', { name: 'Kapal default' }); }
  get kapasitasJadwal() { return this.form.getByRole('textbox', { name: 'Persen kapasitas operasional jadwal' }); }
  get hariKeTujuan() { return this.form.locator('input[aria-label="Hari ke Tujuan"]'); } // input angka (role spinbutton)
  get waktuTiba() { return this.form.getByRole('textbox', { name: 'Waktu Tiba' }); }
  get jarak() { return this.form.locator('input[placeholder="Masukkan jumlah"]:visible').first(); } // kolom "Jarak Tempuh" (label tidak terhubung ke input)
  /** Pesan kesalahan yang tampil di form (unik, berurutan). */
  async pesanForm() {
    const t = (await this.form.getByRole('alert').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    return [...new Set(t)];
  }

  /** Isi jam "HH:MM" pada input waktu (diketik angka saja, mis. 1000). */
  async ketikJam(input: Locator, hhmm: string) {
    await input.click();
    await this.page.keyboard.type(hhmm.replace(':', ''));
  }

  async bukaFormJadwal() {
    await this.btnTambah.click();
    await expect(this.form.getByRole('heading', { name: 'Tambah Jadwal' })).toBeVisible();
    await expect(this.jam).toBeEditable();
  }

  /**
   * Tambah jadwal lewat form. `jam` boleh lebih dari satu (baris jadwal di langkah 1).
   * `hari` = hanya hari tertentu (default semua hari). `kapasitas` = override % jadwal.
   * `simpan:false` → berhenti di langkah 5 (untuk uji validasi).
   */
  async tambahJadwal(opsi: {
    jam: string | string[]; kapal: string; tiba?: string; jarakKm?: string;
    hari?: ('Sen' | 'Sel' | 'Rab' | 'Kam' | 'Jum' | 'Sab' | 'Min')[]; kapasitas?: string; simpan?: boolean;
  }) {
    await this.bukaFormJadwal();
    const daftarJam = Array.isArray(opsi.jam) ? opsi.jam : [opsi.jam];
    for (let i = 0; i < daftarJam.length; i++) {
      if (i > 0) await this.btnTambahJam.click();
      await this.ketikJam(this.jamKe(i + 1), daftarJam[i]);
    }
    await this.pilihDiCombobox(this.unitBisnis, 'Travel', 'Travel / Shuttle');
    if (opsi.hari) {
      if (await this.pilihSemuaHari.isChecked()) await this.pilihSemuaHari.click();
      for (const h of opsi.hari) await this.hari(h).click();
    }
    await this.lanjut();
    await expect(this.langkah()).toHaveText('2/5');
    await this.pilihDiCombobox(this.kapalDefault, opsi.kapal, new RegExp('^' + esc(opsi.kapal)));
    if (opsi.kapasitas) await this.kapasitasJadwal.fill(opsi.kapasitas);
    for (const n of ['3/5', '4/5', '5/5']) {
      await this.lanjut();
      await expect(this.langkah()).toHaveText(n);
    }
    // Waktu Tiba bisa sudah terisi otomatis (jam berangkat + estimasi rute) → timpa dengan fill
    if (opsi.tiba) await this.waktuTiba.fill(opsi.tiba);
    if (opsi.jarakKm) await this.jarak.fill(opsi.jarakKm);
    if (opsi.simpan === false) return;
    await this.btnForm('Simpan').click();
    await this.konfirmasiKlik('Simpan');
    await this.expectToast(/berhasil/i);
    await expect(this.form).toBeHidden();
  }

  /** Kode semua jadwal di tabel detail (halaman ini). */
  async kodeJadwalSemua() {
    return (await this.rows.locator('td:nth-child(2)').allInnerTexts()).map((x) => x.trim()).filter((x) => x && x !== 'Belum ada jadwal');
  }

  /** Ubah rute lewat tombol "Ubah rute": kapasitas % dan/atau batas online (menit). Mengembalikan teks konfirmasi. */
  async ubahRute(opsi: { kapasitas?: string; batasOnline?: string }) {
    await this.btnUbahRute.click();
    await expect(this.form.getByRole('heading', { name: /^Ubah Data Rute/ })).toBeVisible();
    await this.lanjut();
    await expect(this.langkah()).toHaveText('2/3');
    if (opsi.kapasitas !== undefined) await this.form.getByRole('textbox', { name: 'Kapasitas operasional default' }).fill(opsi.kapasitas);
    if (opsi.batasOnline !== undefined) await this.form.getByRole('textbox', { name: 'Nilai batas online' }).fill(opsi.batasOnline);
    await this.lanjut();
    await expect(this.langkah()).toHaveText('3/3');
    await this.btnForm('Simpan').click();
    await expect(this.konfirmasi).toBeVisible();
    const ringkas = (await this.konfirmasi.innerText()).replace(/\s+/g, ' ');
    await this.konfirmasiKlik('Simpan');
    await this.expectToast(/berhasil/i);
    await expect(this.form).toBeHidden();
    return ringkas;
  }

  /* ------------------- jadwal: ubah, duplikasi, tanggal, alokasi, transit ------------------- */

  get tglMulai() { return this.form.getByRole('button', { name: 'Tanggal Mulai Jadwal' }); }
  get tglAkhir() { return this.form.getByRole('button', { name: 'Tanggal Akhir Jadwal' }); }
  /** Popover kalender yang sedang terbuka. */
  get kalender() { return this.popover.filter({ has: this.page.getByRole('button', { name: 'Ke bulan berikutnya' }) }); }
  /** Kode golongan pertama yang ada di tabel alokasi langkah 3 (mis. "II"). Kapal jadwal bisa berganti, jadi jangan dipatok "I". */
  async golonganPertama() {
    const label = await this.form.getByRole('combobox', { name: /^Tipe \S+$/ }).first().getAttribute('aria-label');
    return (label ?? '').replace(/^Tipe /, '');
  }
  tipeAlokasi(gol: string) { return this.form.getByRole('combobox', { name: `Tipe ${gol}`, exact: true }); }
  nilaiAlokasi(gol: string) { return this.form.getByRole('textbox', { name: `Nilai ${gol}`, exact: true }); }
  /** Tombol "n Transit" di baris jadwal. */
  btnTransit(kodeJadwal: string) { return this.baris(kodeJadwal).getByRole('button', { name: /\d+ Transit/ }); }

  /** Menu baris jadwal → "Edit Jadwal" → form "Ubah Jadwal" langkah 1/5. */
  async bukaEditJadwal(kodeJadwal: string) {
    await this.aksi(kodeJadwal, 'Edit Jadwal');
    await expect(this.form.getByRole('heading', { name: 'Ubah Jadwal' })).toBeVisible();
    await expect(this.jam).toBeEditable();
  }

  /** Menu baris jadwal → "Duplikasi" → form duplikasi (judul saat ini "Duplicate Jadwal"). */
  async bukaDuplikasiJadwal(kodeJadwal: string) {
    await this.aksi(kodeJadwal, 'Duplikasi');
    await expect(this.form.getByRole('heading', { name: /^(Duplicate|Duplikasi) Jadwal$/ })).toBeVisible();
    await expect(this.jam).toBeEditable();
  }

  /** Klik Selanjutnya sampai langkah tertentu, mis. '5/5'. */
  async keLangkah(target: string) {
    for (let i = 0; i < 6 && (await this.langkah().innerText()).trim() !== target; i++) {
      const sebelum = (await this.langkah().innerText()).trim();
      await this.lanjut();
      await expect(this.langkah()).not.toHaveText(sebelum);
    }
    await expect(this.langkah()).toHaveText(target);
  }

  /** Simpan form jadwal: Simpan → konfirmasi Simpan → toast berhasil → form tertutup. */
  async simpanForm() {
    await this.btnForm('Simpan').click();
    await this.konfirmasiKlik('Simpan');
    await this.expectToast(/berhasil/i);
    await expect(this.form).toBeHidden();
  }

  /** Buka kalender dari tombol tanggal lalu pindah ke bulan `yyyy-mm`. Kalender dibiarkan terbuka. */
  async bukaKalender(tombol: Locator, yyyymm: string) {
    const [y, m] = yyyymm.split('-').map(Number);
    await tombol.click();
    await expect(this.kalender).toBeVisible();
    for (let i = 0; i < 48; i++) {
      const cap = (await this.kalender.innerText()).match(new RegExp(`(${BULAN.join('|')}) (\\d{4})`));
      if (!cap) throw new Error('Judul bulan di kalender tidak terbaca');
      const sekarang = Number(cap[2]) * 12 + BULAN.indexOf(cap[1]) + 1;
      if (sekarang === y * 12 + m) return;
      await this.kalender.getByRole('button', { name: sekarang < y * 12 + m ? 'Ke bulan berikutnya' : 'Ke bulan sebelumnya' }).click();
      await expect(this.kalender).not.toContainText(cap[0]);
    }
    throw new Error(`Bulan ${yyyymm} tidak tercapai di kalender`);
  }

  /** Tombol hari di kalender yang terbuka, mis. hariKalender('2027-05-03'). */
  hariKalender(iso: string) {
    const [y, m, d] = iso.split('-').map(Number);
    return this.kalender.getByRole('button', { name: new RegExp(`(^|, )${d} ${BULAN[m - 1]} ${y}$`) });
  }

  /** Pilih tanggal `yyyy-mm-dd` lewat kalender. */
  async pilihTanggal(tombol: Locator, iso: string) {
    await this.bukaKalender(tombol, iso.slice(0, 7));
    await this.hariKalender(iso).click();
    await this.page.waitForTimeout(400);
    if (await this.kalender.isVisible()) await this.page.keyboard.press('Escape'); // hanya menutup kalender
    await expect(this.kalender).toBeHidden();
  }

  /** Tanggal (angka) di bulan `yyyy-mm` yang TIDAK bisa dipilih. Kalender ditutup lagi. */
  async tanggalTerkunci(tombol: Locator, yyyymm: string) {
    await this.bukaKalender(tombol, yyyymm);
    const [y, m] = yyyymm.split('-').map(Number);
    const label = await this.kalender.locator('button:disabled').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    await this.page.keyboard.press('Escape');
    await expect(this.kalender).toBeHidden();
    const re = new RegExp(`(\\d{1,2}) ${BULAN[m - 1]} ${y}$`);
    return label.map((l) => l.match(re)?.[1]).filter(Boolean).map(Number);
  }

  /** Baris tabel alokasi untuk golongan tertentu (langkah 3). */
  barisAlokasi(gol: string) {
    // locator di dalam `has` dicari RELATIF terhadap baris → jangan diawali this.form
    return this.form.locator('tbody tr').filter({ has: this.page.getByRole('combobox', { name: `Tipe ${gol}`, exact: true }) });
  }
  basisAlokasi(gol: string) { return this.form.getByRole('combobox', { name: `Basis ${gol}`, exact: true }); }

  /** Langkah 3: ganti basis nilai alokasi (Unit / %). */
  async aturBasis(gol: string, basis: 'Unit' | '%') {
    await this.basisAlokasi(gol).click();
    await this.page.getByRole('option', { name: basis, exact: true }).click();
    await expect(this.basisAlokasi(gol)).toHaveText(new RegExp(basis === '%' ? '%' : 'Unit'));
  }

  /** Langkah 3: centang jadwal lain di "Terapkan juga ke jadwal lain". */
  cekTerapkan(kodeJadwal: string) {
    return this.form.getByRole('checkbox', { name: new RegExp('^' + esc(kodeJadwal) + ' · ') });
  }

  /** Langkah 3: ubah tipe alokasi golongan (Normal / Reserve / Restrict), opsional isi nilai. */
  async aturAlokasi(gol: string, tipe: 'Normal' | 'Reserve' | 'Restrict', nilai?: string) {
    await this.tipeAlokasi(gol).click();
    await this.page.getByRole('option', { name: tipe, exact: true }).click();
    await expect(this.tipeAlokasi(gol)).toHaveText(new RegExp(tipe));
    if (nilai !== undefined) await this.nilaiAlokasi(gol).fill(nilai);
  }

  /** Sort tabel jadwal lewat header; tunggu aria-sort berubah. Mengembalikan isi kolom. */
  async sortJadwal(kolom: string) {
    const th = this.tabel.locator('thead th').filter({ has: this.page.getByRole('button', { name: kolom, exact: true }) });
    const sebelum = await th.getAttribute('aria-sort');
    await th.getByRole('button', { name: kolom, exact: true }).click();
    await expect.poll(() => th.getAttribute('aria-sort')).not.toBe(sebelum);
    await this.page.waitForTimeout(800);
    await this.tungguData();
    return { arah: await th.getAttribute('aria-sort'), nilai: await this.nilaiKolom(kolom) };
  }

  async hapusJadwal(kodeJadwal: string) {
    await this.aksi(kodeJadwal, 'Hapus Data');
    await this.konfirmasiKlik('Hapus');
    await this.expectToast(/berhasil/i);
  }

  /** Centang "Pilih semua" di tabel jadwal → tombol "Hapus (n)" → konfirmasi Hapus. */
  async hapusMassalJadwal() {
    await this.tabel.getByRole('checkbox', { name: 'Pilih semua' }).check();
    await expect(this.btnHapusMassal).toHaveText(/^Hapus \(\d+\)$/);
    const n = Number((await this.btnHapusMassal.innerText()).match(/\d+/)![0]);
    await this.btnHapusMassal.click();
    await this.konfirmasiKlik('Hapus');
    await this.expectToast(/berhasil/i);
    return n;
  }
}

/* ------------------------------------------------------------------ */
/* API bantu — HANYA untuk menyiapkan & membersihkan data uji QA       */
/* (yang diuji tetap lewat layar).                                     */
/* ------------------------------------------------------------------ */
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };

export async function cms(request: APIRequestContext, method: 'GET' | 'POST', path: string, data?: unknown) {
  const r = await request.fetch('/api/proxy/cms' + path, { method, headers: H, data: data === undefined ? undefined : JSON.stringify(data) });
  const json = await r.json().catch(() => null);
  return { status: r.status(), json };
}

/** Buat pelabuhan uji (kota Cilegon, mode Per kapal). Mengembalikan id. */
export async function buatPelabuhanQA(request: APIRequestContext, kode: string, nama: string) {
  const r = await cms(request, 'POST', '/outlets', {
    code: kode, name: nama, is_active: 1, is_port: 1, city_code: '3672', address: 'QA automation',
    latitude: null, longitude: null, capacity_mode: 'per_vessel', daily_passenger_capacity: null,
    daily_vehicle_sup: null, free_passenger_quota: 0, docks: [],
  });
  expect(r.status, `gagal membuat pelabuhan uji ${kode}: ${JSON.stringify(r.json)}`).toBe(200);
  return String(r.json.result.id);
}

/**
 * Hapus SEMUA data uji yang namanya mengandung `awalanNama`:
 * jadwal → rute → pelabuhan (urutan ini wajib, karena data yang masih dipakai tidak bisa dihapus).
 */
export async function bersihkanQA(request: APIRequestContext, awalanNama: string) {
  const routes = (await cms(request, 'GET', '/route?page=1&limit=500')).json?.result?.content?.[0]?.rows ?? [];
  const ruteQA = routes.filter((r: any) => [r.pickup_outlet?.name, r.dropoff_outlet?.name].some((n: string) => n?.includes(awalanNama)));
  for (const r of ruteQA) {
    const s = (await cms(request, 'GET', `/route/schedule?page=1&limit=200&route_ids%5B%5D=${r.id}`)).json?.result?.content?.[0]?.rows ?? [];
    if (s.length) await cms(request, 'POST', '/route/schedule/action', { action: 'delete', ids: s.map((x: any) => x.id) });
    await cms(request, 'POST', '/route/action', { action: 'delete', ids: [r.id] });
  }
  const outlets = (await cms(request, 'GET', `/outlets?search=${encodeURIComponent(awalanNama)}&limit=50`)).json?.result?.content?.[0]?.rows ?? [];
  const ids = outlets.filter((o: any) => String(o.name ?? '').includes(awalanNama)).map((o: any) => o.id);
  if (ids.length) await cms(request, 'POST', '/outlets/action', { action: 'delete', ids: ids.join(',') });
}