import { test, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Page Object untuk modul Kapasitas di CMS ASDP:
 *  - Keberangkatan & Alokasi (list)      : /capacity-departures
 *  - Detail keberangkatan                : /capacity-departures/<YYYY-MM-DD>/<id>
 *  - Alokasi Kuota Jadwal (template)     : /capacity-templates
 *  - Web reservasi Ferizy (dampak)       : FERIZY_URL/book/schedules
 *
 * Semua data uji bisa diganti lewat .env (lihat DATA di bawah).
 */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const DATA = {
  /** Nama rute persis seperti di dropdown (tanpa kode dalam kurung). */
  rute: process.env.KA_RUTE ?? 'LEMBAR - PADANG BAI',
  /** Rute kedua, untuk test "ganti rute". */
  rute2: process.env.KA_RUTE_2 ?? 'PADANG BAI - LEMBAR',
  ruteId: process.env.KA_RUTE_ID ?? '82',
  /** Rute AKTIF yang belum punya jadwal (untuk uji tampilan kosong). Cek dulu di menu Rute kalau test KA-F13 gagal. */
  ruteTanpaJadwal: process.env.KA_RUTE_TANPA_JADWAL ?? 'SOLOR - WAIWERANG',
  /** Tanggal keberangkatan uji (jauh di depan, belum ada penjualan). */
  tanggalUji: process.env.KA_TANGGAL_UJI ?? '2027-05-02',
  /** Jadwal yang diubah-ubah oleh test *-ubah. */
  jadwalA: process.env.KA_JADWAL_A ?? 'LMB-PGA-2100',
  jadwalB: process.env.KA_JADWAL_B ?? 'LMB-PGA-1800',
  /** Kelas yang dipakai untuk test alokasi (nama kelasnya harus unik). */
  kelas: process.env.KA_KELAS ?? 'REGULER',
  /** Kapal pengganti untuk uji override (nama kapal, harus Aktif & beda dari default). */
  kapalUji: process.env.KA_KAPAL_UJI ?? 'KMP Naraya',
  ferizyUrl: process.env.FERIZY_URL ?? 'https://dev.asdpv2.garudakreasi.com',
  ferizyAsal: process.env.FERIZY_ASAL ?? '',
  ferizyTujuan: process.env.FERIZY_TUJUAN ?? '',
  ferizySiap: process.env.FERIZY_READY === '1',
};

export type Temuan = {
  /** ID test, mis. "KA-T01" */
  id: string;
  /** Ringkasan masalah satu kalimat */
  judul: string;
  /** Langkah reproduksi */
  langkah: string[];
  /** Hasil yang seharusnya */
  ekspektasi: string;
  /** Hasil yang terjadi — boleh fungsi supaya dibaca dari layar saat itu juga */
  aktual: string | (() => Promise<string>);
  /** Pemeriksaan: lolos = tidak ada bug */
  cek: () => Promise<void>;
  /** Bagian layar yang diberi garis merah di screenshot */
  fokus?: Locator;
};

/**
 * Jalankan pemeriksaan. Kalau TIDAK sesuai ekspektasi:
 *  - ambil screenshot bukti (bagian bermasalah diberi garis merah) → hasil\bukti\<ID>_<waktu>.png
 *  - catat temuan berformat Langkah / Ekspektasi / Aktual → tampil di "Temuan tercatat" di laporan
 * Test tetap lanjut/hijau.
 */
export async function cekTemuan(page: Page, t: Temuan) {
  try {
    await t.cek();
    return;
  } catch {
    let aktual: string;
    try {
      aktual = typeof t.aktual === 'string' ? t.aktual : await t.aktual();
    } catch {
      aktual = '(tidak bisa dibaca dari layar)';
    }

    const d = new Date();
    const dua = (n: number) => String(n).padStart(2, '0');
    const stempel = `${d.getFullYear()}${dua(d.getMonth() + 1)}${dua(d.getDate())}-${dua(d.getHours())}${dua(d.getMinutes())}${dua(d.getSeconds())}`;
    const relatif = `bukti/${t.id}_${stempel}.png`;
    const file = path.join(process.cwd(), 'hasil', relatif);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // Garis merah hanya kalau elemennya memang ada di halaman (jangan menunggu sampai timeout)
      if (t.fokus && (await t.fokus.count()) > 0) {
        const el = t.fokus.first();
        await el.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
        await el
          .evaluate(
            (n) => {
              (n as HTMLElement).style.outline = '3px solid red';
              (n as HTMLElement).style.outlineOffset = '3px';
            },
            undefined,
            { timeout: 2_000 },
          )
          .catch(() => {});
      }
      await page.screenshot({ path: file });
      await test.info().attach(`bukti ${t.id}`, { path: file, contentType: 'image/png' });
      test.info().annotations.push({ type: 'bukti', description: relatif });
    } catch {
      /* screenshot gagal tidak boleh menggagalkan test */
    }

    const teks =
      `${t.id} — ${t.judul}\n` +
      `Langkah:\n${t.langkah.map((l, i) => `  ${i + 1}. ${l}`).join('\n')}\n` +
      `Ekspektasi: ${t.ekspektasi}\n` +
      `Aktual: ${aktual}`;
    test.info().annotations.push({ type: 'temuan', description: teks });
    console.log(`[TEMUAN] ${teks}\n(bukti: hasil\\${relatif.replace('/', '\\')})`);
  }
}

/** Angka format Indonesia ("1.234,56") → number */
export const angkaID = (s: string) => {
  const m = s.match(/-?[\d.]+(,\d+)?/);
  return m ? Number(m[0].replace(/\./g, '').replace(',', '.')) : NaN;
};
/** Bandingkan angka desimal SUP (toleransi pembulatan 0,01) */
export const samaSUP = (a: number, b: number) => Math.abs(a - b) < 0.011;

export const ruteRegex =(nama: string) => new RegExp('^' + esc(nama) + '\\b', 'i');
export const firstInt = (s: string) => {
  const m = s.replace(/\./g, '').match(/-?\d+/);
  return m ? Number(m[0]) : NaN;
};

/* ------------------------------------------------------------------ */
/* Bagian bersama: dropdown cmdk, dialog konfirmasi, toast             */
/* ------------------------------------------------------------------ */
class Base {
  readonly main: Locator;
  readonly popover: Locator;
  readonly dialog: Locator;
  readonly toast: Locator;

  constructor(readonly page: Page) {
    // Halaman CMS punya 2 <main> bertumpuk → ambil yang paling dalam (konten halaman)
    this.main = page.locator('main:not(:has(main))');
    this.popover = page.locator('[data-slot="popover-content"]');
    this.dialog = page.getByRole('dialog');
    this.toast = page.locator('[data-sonner-toast]');
  }

  /** Buka combobox, ketik di kolom cari, klik opsi pertama yang cocok. */
  async pilihCombobox(trigger: Locator, placeholderCari: string, kataKunci: string, opsi: RegExp) {
    await trigger.click();
    await expect(this.popover).toBeVisible();
    await this.popover.getByPlaceholder(placeholderCari).fill(kataKunci);
    const o = this.popover.getByRole('option', { name: opsi }).first();
    await expect(o).toBeVisible();
    await o.click();
    await expect(this.popover).toBeHidden();
  }

  async expectToast(teks: string | RegExp) {
    await expect(this.toast.filter({ hasText: teks }).first()).toBeVisible();
  }

  /** Konfirmasi dialog "…? / Alasan / Ya, lanjutkan". */
  async konfirmasiDialog(alasan?: string) {
    await expect(this.dialog).toBeVisible();
    if (alasan !== undefined) await this.dialog.getByPlaceholder('Tulis alasan perubahan').fill(alasan);
    await this.dialog.getByRole('button', { name: 'Ya, lanjutkan' }).click();
    await expect(this.dialog).toBeHidden();
    await this.expectToast('Aksi berhasil dijalankan');
  }

  /** Klik tombol; kalau muncul dialog konfirmasi, langsung dikonfirmasi. */
  async klikLaluKonfirmasiJikaAda(tombol: Locator, alasan?: string) {
    await tombol.click();
    const adaDialog = await this.dialog
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (adaDialog) await this.konfirmasiDialog(alasan);
  }
}

/* ------------------------------------------------------------------ */
/* List: Keberangkatan & Alokasi                                       */
/* ------------------------------------------------------------------ */
export class KeberangkatanListPage extends Base {
  readonly heading = this.page.getByRole('heading', { name: 'Keberangkatan & Alokasi' });
  readonly rute = this.page.getByRole('combobox', { name: 'Rute' });
  readonly jadwal = this.page.getByRole('combobox', { name: 'Jadwal' });
  readonly tanggal = this.page.getByRole('button', { name: 'Tanggal', exact: true });
  readonly filterBtn = this.page.getByRole('button', { name: /^Filter: Kapal, Status, Mode/ });
  readonly emptyPilihRute = this.page.getByText('Pilih rute untuk menampilkan data');
  readonly emptyFilter = this.page.getByText('Tidak ada keberangkatan untuk filter ini.');
  readonly table = this.page.locator('main table');
  readonly rows = this.page.locator('main table tbody tr');
  readonly pager = this.main.getByText(/^Menampilkan /);
  readonly btnSebelumnya = this.page.getByRole('button', { name: 'Sebelumnya' });
  readonly btnBerikutnya = this.page.getByRole('button', { name: 'Berikutnya' });
  readonly bulkInfo = this.page.getByText(/\d+ keberangkatan dipilih/);

  async goto(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    await this.page.goto('/capacity-departures' + (qs ? `?${qs}` : ''));
    await expect(this.heading).toBeVisible();
  }

  /** Buka list langsung lewat URL untuk rute + tanggal tertentu, tunggu data. */
  async gotoTanggal(dari: string, sampai = dari, ruteId = DATA.ruteId) {
    await this.goto({ route_id: ruteId, date_from: dari, date_to: sampai });
    await this.tungguData();
  }

  /** Tunggu tabel selesai dimuat (ada baris data atau pesan kosong). */
  async tungguData() {
    // Tunggu sampai ada baris data (punya link jadwal) ATAU pesan kosong — bukan baris loading
    await expect(
      this.rows.filter({ has: this.page.getByRole('link') }).first().or(this.emptyFilter),
    ).toBeVisible({ timeout: 15_000 });
  }

  async pilihRute(nama = DATA.rute) {
    await this.pilihCombobox(this.rute, 'Cari rute', nama, ruteRegex(nama));
    await expect(this.rute).toContainText(nama);
  }

  async pilihJadwal(kode?: string) {
    await this.jadwal.click();
    await expect(this.popover).toBeVisible();
    const opsi = kode
      ? this.popover.getByRole('option', { name: new RegExp('^' + esc(kode)) })
      : this.popover.getByRole('option');
    const o = opsi.first();
    const label = (await o.innerText()).trim();
    await o.click();
    await expect(this.popover).toBeHidden();
    return label.split(' ')[0];
  }

  /** Format data-day react-day-picker: D/M/YYYY */
  static dataDay(d: Date) {
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }

  async pilihRentangTanggal(dari: Date, sampai: Date) {
    await this.tanggal.click();
    await expect(this.popover).toBeVisible();
    await this.popover.locator(`button[data-day="${KeberangkatanListPage.dataDay(dari)}"]`).click();
    await this.popover.locator(`button[data-day="${KeberangkatanListPage.dataDay(sampai)}"]`).click();
    await expect(this.popover).toBeHidden();
  }

  /* ---------- filter Kapal/Status/Mode ---------- */
  async bukaFilter() {
    await this.filterBtn.click();
    await expect(this.popover).toBeVisible();
  }
  /**
   * Klik elemen di popover filter. Popover bisa lebih tinggi dari layar dan tidak bisa di-scroll
   * (lihat temuan KA-T06), jadi kalau klik biasa gagal karena elemen di luar layar → klik lewat event.
   */
  private async klikDiPopover(el: Locator) {
    await expect(el).toBeEnabled();
    try {
      await el.click({ timeout: 3_000 });
    } catch {
      await el.dispatchEvent('click');
    }
  }
  async centangFilter(nama: string) {
    if (!(await this.popover.isVisible())) await this.bukaFilter();
    await this.klikDiPopover(this.popover.getByRole('checkbox', { name: nama, exact: true }));
  }
  async resetFilter() {
    if (!(await this.popover.isVisible())) await this.bukaFilter();
    await this.klikDiPopover(this.popover.getByRole('button', { name: 'Reset filter' }));
  }
  async tutupPopover() {
    await this.page.keyboard.press('Escape');
    await expect(this.popover).toBeHidden();
  }

  /** Total data dari teks "Menampilkan a–b dari N data". */
  async totalData() {
    const t = await this.pager.innerText();
    const m = t.match(/dari\s+(\d+)/);
    return m ? Number(m[1]) : NaN;
  }

  /* ---------- baris tabel ---------- */
  baris(kode: string) {
    return this.rows.filter({ has: this.page.getByRole('link', { name: kode, exact: true }) });
  }
  sel(kode: string, kolom: 'tanggal' | 'jadwal' | 'kapal' | 'kuota' | 'teralokasi' | 'sisa' | 'status' | 'aktif' | 'penjualan') {
    const idx = { tanggal: 1, jadwal: 2, kapal: 3, kuota: 4, teralokasi: 5, sisa: 6, status: 7, aktif: 8, penjualan: 9 }[kolom];
    return this.baris(kode).locator('td').nth(idx);
  }
  async kuota(kode: string) {
    return firstInt(await this.sel(kode, 'kuota').innerText());
  }
  switchAktif(kode: string) {
    return this.baris(kode).getByRole('switch', { name: 'Aktif' });
  }
  btnOnline(kode: string) {
    return this.baris(kode).getByRole('button', { name: 'Online', exact: true });
  }
  btnOffline(kode: string) {
    return this.baris(kode).getByRole('button', { name: 'Offline', exact: true });
  }
  checkbox(kode: string) {
    return this.baris(kode).getByRole('checkbox', { name: 'Pilih baris' });
  }
  async expectOnline(kode: string, online: boolean) {
    await expect(this.btnOnline(kode)).toHaveAttribute('aria-pressed', String(online));
    await expect(this.btnOffline(kode)).toHaveAttribute('aria-pressed', String(!online));
  }
  async expectAktif(kode: string, aktif: boolean) {
    await expect(this.switchAktif(kode)).toHaveAttribute('aria-checked', String(aktif));
  }

  /* ---------- aksi (mengubah data) ---------- */
  async setAktif(kode: string, aktif: boolean, alasan = 'QA automation') {
    const sw = this.switchAktif(kode);
    if ((await sw.getAttribute('aria-checked')) === String(aktif)) return;
    await sw.click();
    await this.konfirmasiDialog(alasan);
    await this.expectAktif(kode, aktif);
  }
  async setOnline(kode: string, online: boolean, alasan?: string) {
    const target = online ? this.btnOnline(kode) : this.btnOffline(kode);
    if ((await target.getAttribute('aria-pressed')) === 'true') return;
    await this.klikLaluKonfirmasiJikaAda(target, alasan);
    await this.expectOnline(kode, online);
  }
  async aksiMassal(nama: 'Set Online' | 'Set Offline' | 'Aktifkan' | 'Nonaktifkan', alasan = 'QA automation massal') {
    await this.page.getByRole('button', { name: nama, exact: true }).click();
    await this.konfirmasiDialog(alasan);
  }

  async bukaDetail(kode: string) {
    await this.baris(kode).getByRole('link', { name: kode, exact: true }).click();
    await expect(this.page).toHaveURL(/\/capacity-departures\/\d{4}-\d{2}-\d{2}\/\d+/);
    const d = new DetailKeberangkatanPage(this.page);
    await d.tungguTermuat();
    await expect(d.main).toContainText(kode);
    return d;
  }
}

/* ------------------------------------------------------------------ */
/* Detail keberangkatan                                                */
/* ------------------------------------------------------------------ */
export class DetailKeberangkatanPage extends Base {
  readonly kapasitasInput = this.page.locator('#capacity-percent');
  readonly btnSimpan = this.main.getByRole('button', { name: 'Simpan', exact: true });
  readonly btnBatal = this.main.getByRole('button', { name: 'Batal', exact: true });
  readonly btnBuang = this.main.getByRole('button', { name: 'Buang Perubahan' });
  readonly kapal = this.page.getByRole('combobox', { name: 'Kapal (override harian)' });
  readonly tabelAlokasi = this.page.locator('main table').filter({ hasText: 'Kelompok channel' });

  tab(nama: 'Kapasitas Operasional' | 'Alokasi' | 'Transaksi') {
    return this.page.getByRole('tab', { name: nama, exact: true });
  }

  /**
   * Tunggu detail termuat. Kalau server dev sesekali gagal ("Gagal memuat detail
   * keberangkatan"), klik "Coba lagi" maks. 2x. Kejadiannya dicatat di laporan.
   */
  async tungguTermuat() {
    const tabOk = this.tab('Kapasitas Operasional');
    const gagal = this.main.getByText('Gagal memuat detail keberangkatan').first();
    for (let percobaan = 0; percobaan <= 2; percobaan++) {
      await expect(tabOk.or(gagal)).toBeVisible({ timeout: 15_000 });
      if (await tabOk.isVisible()) return;
      test.info().annotations.push({
        type: 'peringatan',
        description: `Server gagal memuat detail (percobaan ${percobaan + 1}) — ${this.page.url()}`,
      });
      if (percobaan < 2) await this.main.getByRole('button', { name: 'Coba lagi' }).click();
    }
    throw new Error(
      'Halaman detail tetap "Gagal memuat detail keberangkatan" setelah 3x percobaan. ' +
        'Cek tab Network di trace: 401 = sesi login habis (ulangi codegen), 5xx = server dev bermasalah.',
    );
  }
  async bukaTab(nama: 'Kapasitas Operasional' | 'Alokasi' | 'Transaksi') {
    await this.tab(nama).click();
    if (nama === 'Alokasi') await expect(this.tabelAlokasi).toBeVisible();
    if (nama === 'Kapasitas Operasional') await expect(this.kapasitasInput).toBeVisible();
  }

  private async angkaSetelah(label: string) {
    const t = await this.main.innerText();
    const m = t.match(new RegExp(esc(label) + '\\s+(-?[\\d.]+)'));
    return m ? Number(m[1].replace(/\./g, '')) : NaN;
  }
  totalKuota() {
    return this.angkaSetelah('Total kuota');
  }
  kapasitasFisik() {
    return this.angkaSetelah('Kapasitas fisik penumpang');
  }
  async persenKapasitas() {
    return Number((await this.kapasitasInput.inputValue()).replace(',', '.'));
  }

  /** Simpan kapasitas operasional (%) lalu tunggu toast sukses. */
  async simpanKapasitas(persen: number) {
    await this.bukaTab('Kapasitas Operasional');
    await this.kapasitasInput.fill(String(persen));
    await this.btnSimpan.click();
    await this.expectToast('Override kapasitas berhasil disimpan');
  }

  /* ---------- kapal override ---------- */
  /** Baris info di bawah judul, mis. "orange (kapal daily) · Seat · Kapasitas fisik 45 · SUP fisik 52,80 Open" */
  readonly infoHeader = this.page.getByRole('heading', { level: 1 }).locator('..').locator('p').first();

  async pilihKapal(kataKunci: string, opsi: RegExp) {
    await this.bukaTab('Kapasitas Operasional');
    await this.pilihCombobox(this.kapal, 'Cari kapal', kataKunci, opsi);
  }
  async pilihKapalDefault() {
    await this.pilihKapal('Pakai kapal default', /Pakai kapal default/);
  }
  async simpanKapal() {
    await this.btnSimpan.click();
    await this.expectToast('Override kapasitas berhasil disimpan');
  }
  async kapalTerpilih() {
    return (await this.kapal.innerText()).trim();
  }
  /** Angka dari keterangan "min(SKKP 50 – ABK 3, pelampung 45)" */
  async rumusFisik() {
    const t = await this.main.innerText();
    const m = t.match(/min\(SKKP\s+(\d+)\s*[–-]\s*ABK\s+(\d+),\s*pelampung\s+(\d+)\)/);
    if (!m) throw new Error('Keterangan rumus kapasitas fisik tidak ditemukan');
    return { skkp: Number(m[1]), abk: Number(m[2]), pelampung: Number(m[3]) };
  }
  async modeKeberangkatan() {
    const t = await this.infoHeader.innerText();
    return /\bSeat\b/.test(t) ? 'Seat' : /\bPax\b/.test(t) ? 'Pax' : '?';
  }
  /** Jumlah kuota semua kelas di header tabel alokasi (tab Alokasi harus terbuka). */
  async jumlahKuotaKelas() {
    let n = 0;
    for (const k of await this.kolomKelas()) n += await this.kuotaKelas(k);
    return n;
  }

  /* ---------- tab Alokasi: sub-tab Penumpang / Kendaraan / Barang & Hewan ---------- */
  subTab(nama: 'Penumpang' | 'Kendaraan' | 'Barang & Hewan') {
    return this.main.getByRole('button', { name: new RegExp('^' + esc(nama)) });
  }
  async bukaSubTab(nama: 'Penumpang' | 'Kendaraan' | 'Barang & Hewan') {
    await this.subTab(nama).click();
    await expect(this.subTab(nama)).toHaveAttribute('aria-pressed', 'true');
    if (nama === 'Kendaraan') await expect(this.tabelGolongan).toBeVisible();
  }
  readonly labelJadwal = this.main.getByText('Mengikuti alokasi jadwal');
  readonly labelOverride = this.main.getByText(/Mode ubah · override untuk keberangkatan ini/);
  readonly btnKembalikanSemua = this.main.getByRole('button', { name: 'Kembalikan semua ke jadwal' });

  /**
   * Tekan "Kembalikan semua ke jadwal" di sub-tab yang SEDANG terbuka (kalau tombolnya ada).
   * Catatan: label & tombol ini per sub-tab — override di Penumpang tidak terlihat dari sub-tab Kendaraan.
   * Mengembalikan true kalau tombol ditekan.
   */
  async kembalikanSemuaKeJadwal() {
    // Tunggu TOMBOLNYA (bukan label): sesaat setelah Simpan, label lama "Mengikuti alokasi jadwal"
    // masih tampil sebelum berganti jadi "Mode ubah · override".
    const adaTombol = await this.btnKembalikanSemua
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!adaTombol) return false;
    await this.btnKembalikanSemua.click();
    const dlg = this.page.getByRole('alertdialog');
    await expect(dlg).toContainText('Kembalikan semua ke jadwal');
    await dlg.getByRole('button', { name: 'Kembalikan', exact: true }).click();
    await this.expectToast('Alokasi dikembalikan ke jadwal');
    await expect(this.labelJadwal).toBeVisible();
    return true;
  }

  /** Pastikan TIDAK ADA override di sub-tab mana pun (Penumpang, Kendaraan, Barang & Hewan). */
  async pulihkanSemuaSubTab() {
    for (const nama of ['Penumpang', 'Kendaraan', 'Barang & Hewan'] as const) {
      if (!(await this.subTab(nama).isVisible())) continue;
      await this.subTab(nama).click();
      await expect(this.subTab(nama)).toHaveAttribute('aria-pressed', 'true');
      await this.kembalikanSemuaKeJadwal();
    }
  }

  /* ---------- Barang & Hewan ---------- */
  readonly tabelBarang = this.page.locator('main table').filter({ hasText: 'Target informasi' });
  inputTarget(kategori: string) {
    return this.page.getByRole('textbox', { name: `Target informasi ${kategori}`, exact: true });
  }
  barisBarang(kategori: string) {
    return this.tabelBarang.locator('tbody tr').filter({ hasText: new RegExp('^\\s*' + esc(kategori)) });
  }
  /** Isi satu baris Barang & Hewan sebagai objek */
  async barang(kategori: string) {
    const c = (await this.barisBarang(kategori).first().locator('td').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    const inp = this.inputTarget(kategori);
    return {
      kategori: c[0], tipe: c[1], satuan: c[2], channel: c[3],
      punyaInput: (await inp.count()) > 0,
      target: (await inp.count()) ? await inp.inputValue() : c[4],
      batasFisik: c[5], terjual: angkaID(c[6]), sisaTarget: c[7], status: c[8],
    };
  }
  async daftarKategoriBarang() {
    return (await this.tabelBarang.locator('tbody tr td:first-child').allInnerTexts()).map((x) => x.trim());
  }
  async isiTarget(kategori: string, nilai: string) {
    const i = this.inputTarget(kategori);
    await i.fill(nilai);
    await i.press('Tab');
  }

  /* ---------- Kendaraan: tabel 1 "Kuota per golongan" ---------- */
  readonly tabelGolongan = this.page.locator('main table').filter({ hasText: 'SUP / unit' });
  /** Tabel 2 "Alokasi kelompok channel × golongan" (header berisi "… unit") */
  readonly tabelChannelKendaraan = this.page
    .locator('main table')
    .filter({ hasText: 'Kelompok channel' })
    .filter({ hasText: /\d+ unit/ });

  inputKuotaGol(g: string) {
    return this.page.getByRole('textbox', { name: `Kuota golongan ${g}`, exact: true });
  }
  inputMitraGol(g: string) {
    return this.page.getByRole('textbox', { name: `Kuota Mitra golongan ${g}`, exact: true });
  }
  inputKorporasiGol(g: string) {
    return this.page.getByRole('textbox', { name: `Kuota Korporasi golongan ${g}`, exact: true });
  }
  tipeGol(g: string) {
    return this.page.getByLabel(`Tipe golongan ${g}`, { exact: true });
  }
  private barisGol(g: string) {
    return this.tabelGolongan.locator('tbody tr').filter({ has: this.inputKuotaGol(g) });
  }
  /** Kode golongan urut sesuai tabel, mis. ["I","II","III","IVB",...] */
  async daftarGolongan() {
    const labels = await this.tabelGolongan.locator('input[aria-label^="Kuota golongan "]').evaluateAll((els) =>
      els.map((e) => (e.getAttribute('aria-label') ?? '').replace('Kuota golongan ', '')),
    );
    return labels;
  }
  async golongan(g: string) {
    const c = await this.barisGol(g).locator('td').allInnerTexts();
    return {
      supPerUnit: angkaID(c[1]),
      unit: Number(await this.inputKuotaGol(g).inputValue()),
      setaraSUP: angkaID(c[4]),
      jikaHabis: (c[c.length - 1] ?? '').trim(),
    };
  }
  async isiKuotaGol(g: string, nilai: string) {
    const i = this.inputKuotaGol(g);
    await i.fill(nilai);
    await i.press('Tab');
  }
  async isiMitraGol(g: string, nilai: string) {
    const i = this.inputMitraGol(g);
    await i.fill(nilai);
    await i.press('Tab');
  }
  /** Ringkasan "Normal x + Reserve y + Restrict z SUP  total" */
  async ringkasanSUP() {
    const t = await this.main.innerText();
    const m = t.match(/Normal\s+([\d.,]+)\s*\+\s*Reserve\s+([\d.,]+)\s*\+\s*Restrict\s+([\d.,]+)\s*SUP\s+([\d.,]+)/);
    if (!m) throw new Error('Ringkasan Normal/Reserve/Restrict tidak ditemukan');
    return { normal: angkaID(m[1]), reserve: angkaID(m[2]), restrict: angkaID(m[3]), total: angkaID(m[4]) };
  }
  /** Kuota operasional kendaraan dari teks "Kuota operasional 80,00 SUP" */
  async kuotaOperasionalSUP() {
    const t = await this.main.innerText();
    const m = t.match(/Kuota operasional\s+([\d.,]+)\s*SUP/);
    return m ? angkaID(m[1]) : NaN;
  }
  /** Nilai sel di tabel channel × golongan, mis. nilaiChannelKendaraan('Retail','I') */
  async nilaiChannelKendaraan(baris: 'Retail' | 'Mitra' | 'Korporasi' | 'Total', g: string) {
    const head = await this.tabelChannelKendaraan.locator('tr').first().locator('th, td').allInnerTexts();
    const idx = head.findIndex((h) => h.trim().split(/\s|\n/)[0] === g);
    if (idx < 0) throw new Error(`Golongan ${g} tidak ada di tabel channel kendaraan`);
    const cell = this.tabelChannelKendaraan.locator('tr').filter({ hasText: new RegExp('^\\s*' + baris) }).locator('th, td').nth(idx);
    const inp = cell.locator('input');
    if (await inp.count()) return Number(await inp.inputValue());
    return firstInt(await cell.innerText());
  }
  async totalSUPChannel(baris: 'Retail' | 'Mitra' | 'Korporasi' | 'Total') {
    const cell = this.tabelChannelKendaraan.locator('tr').filter({ hasText: new RegExp('^\\s*' + baris) }).locator('th, td').last();
    return angkaID(await cell.innerText());
  }

  /* ---------- tabel alokasi ---------- */
  private barisAlokasi(label: 'Retail' | 'Mitra' | 'Korporasi' | 'Blok' | 'SKPT' | 'Total') {
    return this.tabelAlokasi.locator('tr').filter({ hasText: new RegExp('^\\s*' + label) });
  }
  async namaKelas() {
    const h = await this.tabelAlokasi.locator('tr').first().locator('th, td').allInnerTexts();
    return h.slice(1, -2).map((x) => x.split(/\s|\n/)[0].trim());
  }
  /** Indeks kolom tiap kelas (1..n) — aman walau ada nama kelas kembar. */
  async kolomKelas() {
    const n = await this.tabelAlokasi.locator('tr').first().locator('th, td').count();
    return Array.from({ length: n - 3 }, (_, i) => i + 1);
  }
  private async idxKelas(kelas: string | number) {
    if (typeof kelas === 'number') return kelas;
    const h = await this.tabelAlokasi.locator('tr').first().locator('th, td').allInnerTexts();
    const i = h.findIndex((x) => x.trim().toUpperCase().startsWith(kelas.toUpperCase()));
    if (i < 0) throw new Error(`Kelas ${kelas} tidak ada di tabel alokasi`);
    return i;
  }
  async kuotaKelas(kelas: string | number) {
    const h = await this.tabelAlokasi.locator('tr').first().locator('th, td').nth(await this.idxKelas(kelas)).innerText();
    const m = h.match(/kuota\s+(\d+)/i);
    return m ? Number(m[1]) : NaN;
  }
  async nilai(label: 'Retail' | 'Mitra' | 'Korporasi' | 'Total', kelas: string | number) {
    const cell = this.barisAlokasi(label).locator('th, td').nth(await this.idxKelas(kelas));
    const inp = cell.locator('input');
    if (await inp.count()) return firstInt(await inp.inputValue());
    return firstInt(await cell.innerText());
  }
  async totalBaris(label: 'Retail' | 'Mitra' | 'Korporasi' | 'Total') {
    const cells = this.barisAlokasi(label).locator('th, td');
    const n = await cells.count();
    return firstInt(await cells.nth(n - 2).innerText());
  }
  async sumber(label: 'Retail' | 'Mitra' | 'Korporasi' | 'Total') {
    return (await this.barisAlokasi(label).locator('th, td').last().innerText()).trim();
  }
  inputMitra(kelas: string) {
    return this.page.getByRole('textbox', { name: `Kuota Mitra kelas ${kelas}` }).first();
  }
  inputKorporasi(kelas: string) {
    return this.page.getByRole('textbox', { name: `Kuota Korporasi kelas ${kelas}` }).first();
  }
  async isiKorporasi(kelas: string, nilai: string) {
    const i = this.inputKorporasi(kelas);
    await i.fill(nilai);
    await i.press('Tab');
  }
  async isiKorporasiGol(g: string, nilai: string) {
    const i = this.inputKorporasiGol(g);
    await i.fill(nilai);
    await i.press('Tab');
  }
  /** Muat ulang detail & buka tab Alokasi (+ sub-tab) — untuk cek nilai yang BENAR-BENAR tersimpan. */
  async reloadAlokasi(sub: 'Penumpang' | 'Kendaraan' | 'Barang & Hewan' = 'Penumpang') {
    await this.page.reload();
    await this.tungguTermuat();
    await this.bukaTab('Alokasi');
    if (sub !== 'Penumpang') await this.bukaSubTab(sub);
  }
  async isiMitra(kelas: string, nilai: string) {
    const i = this.inputMitra(kelas);
    await i.fill(nilai);
    await i.press('Tab');
  }
  async simpanAlokasi() {
    await this.btnSimpan.click();
  }
}

/* ------------------------------------------------------------------ */
/* Alokasi Kuota Jadwal (template)                                     */
/* ------------------------------------------------------------------ */
export class TemplateAlokasiPage extends DetailKeberangkatanPage {
  readonly rute = this.page.getByRole('combobox', { name: 'Rute' });
  readonly jadwal = this.page.getByRole('combobox', { name: 'Jadwal' });

  async buka(rute = DATA.rute, jadwal = DATA.jadwalA) {
    await this.page.goto('/capacity-templates');
    await this.pilihCombobox(this.rute, 'Cari rute', rute, ruteRegex(rute));
    await this.pilihCombobox(this.jadwal, 'Cari jadwal', jadwal, new RegExp('^' + esc(jadwal)));
    await expect(this.tabelAlokasi).toBeVisible();
  }
}

/* ------------------------------------------------------------------ */
/* Ferizy (web reservasi)                                              */
/* ------------------------------------------------------------------ */
export class FerizyPage {
  constructor(readonly page: Page) {}
  async jumlahJadwal(tanggal: string) {
    const qs = new URLSearchParams({ asal: DATA.ferizyAsal, tujuan: DATA.ferizyTujuan, tgl: tanggal });
    await this.page.goto(`${DATA.ferizyUrl}/book/schedules?${qs}`);
    const info = this.page.getByText(/\d+ jadwal ditemukan/);
    await expect(info).toBeVisible({ timeout: 20_000 });
    return firstInt(await info.innerText());
  }
}

/* ------------------------------------------------------------------ */
/* Master Kapal                                                        */
/* ------------------------------------------------------------------ */
export type Kapal = { kode: string; nama: string; abk: number; pelampung: number; kapPenumpang: number; mode: string; status: string };

export class MasterKapalPage {
  constructor(readonly page: Page) {}
  async daftar(): Promise<Kapal[]> {
    await this.page.goto('/vessels?limit=100'); // semua kapal dalam 1 halaman
    const main = this.page.locator('main:not(:has(main))');
    // Tunggu data asli (bukan baris loading): baris yang kolom Status-nya berisi Aktif/Nonaktif
    const baris = main.locator('tbody tr').filter({ hasText: /Aktif|Nonaktif/ }); // tanpa \b: teks sel menempel, mis. "2026Aktif"
    await expect(baris.first()).toBeVisible({ timeout: 15_000 });
    await expect(main.getByText(/^Menampilkan .* dari \d+ data/)).toBeVisible({ timeout: 15_000 });
    const head = (await main.locator('thead th').allInnerTexts()).map((h) => h.trim());
    const col = (nama: string) => {
      const i = head.findIndex((h) => h.toLowerCase().startsWith(nama.toLowerCase()));
      if (i < 0) throw new Error(`Kolom "${nama}" tidak ada di halaman Kapal`);
      return i;
    };
    const [iKode, iNama, iAbk, iPel, iKap, iStatus] = [col('Kode'), col('Nama Kapal'), col('ABK'), col('Pelampung'), col('Kap. Penumpang'), col('Status')];
    const hasil: Kapal[] = [];
    for (const r of await baris.all()) {
      const c = (await r.locator('td').allInnerTexts()).map((x) => x.trim());
      const kap = c[iKap] ?? '';
      hasil.push({
        kode: c[iKode], nama: c[iNama], abk: firstInt(c[iAbk]), pelampung: firstInt(c[iPel]),
        kapPenumpang: firstInt(kap), mode: /Seat/i.test(kap) ? 'Seat' : 'Pax', status: c[iStatus],
      });
    }
    if (!hasil.some((k) => k.nama)) throw new Error('Daftar kapal di halaman /vessels terbaca kosong');
    return hasil;
  }
}