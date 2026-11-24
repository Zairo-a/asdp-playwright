import { test, expect, type BrowserContextOptions, type Page } from '@playwright/test';
import { RutePage, DetailRutePage, buatPelabuhanQA, bersihkanQA } from './pages/rute.pages';
import { PelabuhanPage } from './pages/master-data.pages';
import { DATA, KeberangkatanListPage, cekTemuan } from './pages/kapasitas.pages';
import { bukaWeb, jadwalWeb, ruteDikenalWeb, tglDepan, tungguSinkron, type Kartu } from './pages/ferizy.pages';

/**
 * MASTER DATA — RUTE & JADWAL — MENGUBAH DATA (butuh ALLOW_WRITE=1)
 * Semua perubahan hanya pada data uji milik QA:
 *   2 pelabuhan "QA AUTO RUTE A/B" (dibuat otomatis di awal), rute A → B, dan 1 jadwal.
 * Data uji SELALU dihapus di awal & akhir (jadwal → rute → pelabuhan). Data asli tidak disentuh.
 * Termasuk PL-39 & PL-40 (dampak Pelabuhan ↔ Rute) yang ditunda dari modul Pelabuhan.
 * ID: RJ-3x / RJ-4x / RJ-5x / RJ-6x, PL-39, PL-40, RJ-T05/T06/T10/T11/T14/T15
 */

test.describe.configure({ mode: 'serial' });

const AWALAN = 'QA AUTO RUTE';
// Kode unik tiap run (waktu + huruf acak): kode pelabuhan yang sudah dihapus tetap terkunci (soft delete),
// jadi 2 huruf acak saja terlalu mudah bentrok dengan kode uji lama.
const UNIK = Date.now().toString(36).slice(-3).toUpperCase() + String.fromCharCode(65 + Math.floor(Math.random() * 26));
const PEL_A = { kode: 'QA' + UNIK, nama: `${AWALAN} A` };
const PEL_B = { kode: 'QB' + UNIK, nama: `${AWALAN} B` };
const JADWAL = { jam: '10:00', kapal: process.env.RJ_KAPAL ?? 'KMP Naraya', tiba: '11:00', jarakKm: '10' };

let kodeRute = '';
let routeId = '';
let kodeJadwal = '';
const pesanTolak: string[] = [];
let dupDibuat = false;
let golAlokasi = '';
const kodeDup = () => `${kodeRute}-D`;
let fisik = 0; // kapasitas fisik kapal uji (dari keberangkatan berkapasitas 100%)
// Tanggal uji: Minggu & Senin (DATA.tanggalUji default 2027-05-02 = Minggu)
const MINGGU = process.env.RJ_TGL_MINGGU ?? '2027-05-02';
const SENIN = process.env.RJ_TGL_SENIN ?? '2027-05-03';

// id pelabuhan uji (untuk URL pencarian web Ferizy: ?asal=<idA>&tujuan=<idB>)
let idA = '';
let idB = '';
let webKenalRute = false; // diisi RJ-71: rute uji dikenal web? (kalau tidak, RJ-71b/72/74 tidak bisa diuji)
const TGL_WEB = process.env.KP_TGL_WEB ?? tglDepan(11);
const KAPAL2 = process.env.RJ_KAPAL_2 ?? 'QA FAST FERRY 01'; // kapal pengganti sementara untuk RJ-72
const LANGKAH_WEB = () => `Web Ferizy → buka /book/schedules?asal=${idA}&tujuan=${idB}&tgl=${TGL_WEB} (rute uji ${PEL_A.nama} → ${PEL_B.nama})`;

/** Kartu jadwal rute uji di web; ditunggu (maks ±1 menit) sampai `cocok(kartu)` true. Mengembalikan kartu terakhir. */
async function kartuRuteQA(browser: import('@playwright/test').Browser, cocok: (k: Kartu[]) => boolean) {
  const { ctx, web } = await bukaWeb(browser);
  try {
    let kartu: Kartu[] = [];
    await tungguSinkron(async () => cocok((kartu = await jadwalWeb(web, idA, idB, TGL_WEB))));
    return kartu;
  } finally {
    await ctx.close();
  }
}
const jam10 = (k: Kartu[]) => k.find((x) => x.jam === JADWAL.jam);

/** Klik Simpan di langkah terakhir: kalau muncul konfirmasi → Simpan; kalau ada pesan error → kembalikan pesannya. */
async function simpanJikaBisa(d: DetailRutePage): Promise<string> {
  await d.btnForm('Simpan').click();
  const ada = await d.konfirmasi.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
  if (!ada) {
    const pesan = (await d.pesanForm()).join(' / ');
    await d.tutupForm();
    return `Ditolak di form: "${pesan}"`;
  }
  await d.konfirmasiKlik('Simpan');
  const t = d.toast.first();
  await expect(t).toBeVisible({ timeout: 15_000 });
  const teks = (await t.innerText()).replace(/\s+/g, ' ').trim();
  // form biasanya menutup sendiri setelah tersimpan (beranimasi) → tunggu, baru tutup manual kalau masih terbuka
  const tertutup = await d.form.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true).catch(() => false);
  if (!tertutup) await d.tutupForm();
  return `Toast: "${teks}"`;
}

async function apiCtx(playwright: any) {
  const u = test.info().project.use as BrowserContextOptions & { baseURL?: string };
  return playwright.request.newContext({ baseURL: u.baseURL, storageState: u.storageState as string });
}

test.beforeAll(async ({ playwright }) => {
  const req = await apiCtx(playwright);
  try {
    await bersihkanQA(req, AWALAN);
    idA = await buatPelabuhanQA(req, PEL_A.kode, PEL_A.nama);
    idB = await buatPelabuhanQA(req, PEL_B.kode, PEL_B.nama);
  } finally {
    await req.dispose();
  }
});

test.afterAll(async ({ playwright }) => {
  const req = await apiCtx(playwright);
  try {
    await bersihkanQA(req, AWALAN);
  } finally {
    await req.dispose();
  }
});

/** Pilihan rute di halaman Keberangkatan & Alokasi berisi kode rute ini? */
async function adaDiPilihanKeberangkatan(page: Page, kode: string) {
  const list = new KeberangkatanListPage(page);
  await list.goto();
  await list.rute.click();
  await expect(list.popover).toBeVisible();
  await list.popover.getByPlaceholder('Cari rute').fill(kode);
  await page.waitForTimeout(800);
  const n = await list.popover.getByRole('option', { name: new RegExp(`\\(${kode}\\)`) }).count();
  await page.keyboard.press('Escape');
  return n > 0;
}

/** Kalau muncul dialog konfirmasi, klik tombol yang cocok. */
async function konfirmasiJikaAda(p: RutePage | DetailRutePage, tombol: RegExp) {
  const ada = await p.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
  if (ada) await p.konfirmasiKlik(tombol);
  return ada;
}

/** Keberangkatan jadwal `kode` pada tanggal `tgl` tampil di Keberangkatan & Alokasi? */
async function adaKeberangkatan(page: Page, tgl: string, kode: string, kodeLain: string) {
  const list = new KeberangkatanListPage(page);
  await list.goto({ route_id: routeId, date_from: tgl, date_to: tgl });
  await expect(list.baris(kode).or(list.baris(kodeLain)).or(list.emptyFilter).first()).toBeVisible({ timeout: 30_000 });
  return (await list.baris(kode).count()) > 0;
}

test.describe('Rute & Jadwal — siklus data uji', () => {
  test('[Positif] RJ-30 Tambah rute A → B → muncul di daftar: Aktif, Online, belum ada jadwal', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    kodeRute = await p.tambahRute(PEL_A.nama, PEL_B.nama);
    expect(kodeRute).toBe(`${PEL_A.kode}-${PEL_B.kode}`);
    await p.goto({ search: kodeRute });
    await expect(p.baris(kodeRute)).toHaveCount(1);
    await expect(p.baris(kodeRute)).toContainText(PEL_A.nama);
    await expect(p.baris(kodeRute)).toContainText(PEL_B.nama);
    await expect(p.tombolJadwal(kodeRute)).toHaveText(/Tambahkan/);
    expect(await p.sel(kodeRute, 'Aktivasi')).toBe('Aktif');
    expect(await p.sel(kodeRute, 'Status')).toBe('Online');
  });

  test('[Positif] RJ-31 Tambah jadwal 10:00 (kapal default) di detail rute → tampil di detail & daftar "1 Jadwal"', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    routeId = d.routeId();
    await d.tambahJadwal(JADWAL);
    await expect.poll(() => d.totalData()).toBe(1);
    const baris = d.rows.first();
    kodeJadwal = (await baris.locator('td').nth(1).innerText()).trim();
    expect(kodeJadwal.startsWith(kodeRute)).toBe(true);
    await expect(baris).toContainText(JADWAL.jam);
    await expect(baris).toContainText(JADWAL.kapal);
    await p.goto({ search: kodeRute });
    await expect(p.tombolJadwal(kodeRute)).toHaveText(/1 Jadwal/);
  });

  test('[Positif] RJ-32 dampak: rute baru muncul di Keberangkatan & Alokasi dengan keberangkatan + kapal dari jadwal', async ({ page }) => {
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    expect(await adaDiPilihanKeberangkatan(page, kodeRute)).toBe(true);
    const list = new KeberangkatanListPage(page);
    await list.goto({ route_id: routeId, date_from: DATA.tanggalUji, date_to: DATA.tanggalUji });
    await expect(list.baris(kodeJadwal)).toBeVisible({ timeout: 30_000 });
    await expect(list.baris(kodeJadwal)).toContainText(JADWAL.kapal);
  });

  test('[Dampak] RJ-71 jadwal baru rute uji (10:00) tampil di web Ferizy dengan kapal yang sama', async ({ page, browser }) => {
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    test.skip(!(await adaKeberangkatan(page, TGL_WEB, kodeJadwal, kodeJadwal)), `Tidak ada keberangkatan ${kodeJadwal} di CMS untuk ${TGL_WEB}`);
    const { ctx, web } = await bukaWeb(browser);
    try {
      let kenal = false;
      let kartu: Kartu[] = [];
      await tungguSinkron(async () => {
        kenal = await ruteDikenalWeb(web, idA, idB, TGL_WEB);
        if (kenal) kartu = await jadwalWeb(web, idA, idB, TGL_WEB);
        return kenal && !!jam10(kartu);
      });
      webKenalRute = kenal;
      const k = jam10(kartu);
      await cekTemuan(web, { // screenshot = halaman web
        id: 'RJ-T23',
        judul: 'Rute & jadwal baru di CMS tidak tampil di web Ferizy',
        langkah: [`CMS → buat rute uji ${kodeRute} (${PEL_A.nama} → ${PEL_B.nama}) + jadwal 10:00 kapal ${JADWAL.kapal}`, LANGKAH_WEB(), 'Tunggu ±1 menit'],
        ekspektasi: `Halaman jadwal rute itu tampil dengan kartu jam 10.00 kapal "${JADWAL.kapal}"`,
        aktual: !kenal ? 'Rute tidak dikenal web: tampil "Mau berangkat ke mana? Pilih kota asal dan tujuan…" tanpa daftar jadwal'
          : k ? `Tampil, kapal "${k.kapal}"` : `Jam 10.00 tidak tampil (web: ${kartu.length} jadwal)`,
        cek: async () => { expect(kenal).toBe(true); expect(k?.kapal).toBe(JADWAL.kapal); },
      });
    } finally {
      await ctx.close();
    }
  });

  test('[Edge] RJ-37 jadwal hanya hari Senin + kapasitas jadwal 100% → keberangkatan hanya di hari Senin, kuota = kapasitas fisik', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.tambahJadwal({ jam: '14:00', kapal: JADWAL.kapal, tiba: '15:00', hari: ['Sen'], kapasitas: '100' });
    const kode = `${kodeRute}-1400`;
    await expect.poll(() => d.kodeJadwalSemua()).toContain(kode);
    const list = new KeberangkatanListPage(page);
    await list.goto({ route_id: routeId, date_from: SENIN, date_to: SENIN });
    await expect(list.baris(kode)).toBeVisible({ timeout: 30_000 });
    fisik = await list.kuota(kode); // 100% = kapasitas fisik kapal
    expect(fisik).toBeGreaterThan(0);
    await list.goto({ route_id: routeId, date_from: MINGGU, date_to: MINGGU });
    await expect(list.baris(kodeJadwal).or(list.emptyFilter).first()).toBeVisible({ timeout: 30_000 });
    await expect(list.baris(kode), 'jadwal khusus Senin tidak boleh muncul di hari Minggu').toHaveCount(0);
  });

  test('[Positif] RJ-39 Ubah rute: kapasitas 70% & batas online 30 menit → konfirmasi, detail, dan kuota keberangkatan ikut berubah', async ({ page }) => {
    test.skip(!kodeJadwal || !fisik, 'RJ-31 / RJ-37 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    const ringkas = await d.ubahRute({ kapasitas: '70', batasOnline: '30' });
    expect(ringkas).toMatch(/Kapasitas operasional default.*70%/);
    expect(ringkas).toMatch(/Batas pemesanan online.*30 menit/);
    await page.reload();
    await d.tungguTermuat(kodeRute);
    expect(await d.info('Kap. operasional')).toMatch(/^70%/);
    expect(await d.info('Batas Waktu Pemesanan Online')).toBe('30 menit');
    // jadwal 10:00 tidak punya override → ikut rute 70%
    const list = new KeberangkatanListPage(page);
    await list.goto({ route_id: routeId, date_from: DATA.tanggalUji, date_to: DATA.tanggalUji });
    await expect(list.baris(kodeJadwal)).toBeVisible({ timeout: 30_000 });
    const k = await list.kuota(kodeJadwal);
    expect(Math.abs(k - fisik * 0.7), `kuota ${k} ≈ ${fisik} × 70%`).toBeLessThanOrEqual(1);
  });

  test('[Edge] RJ-40 Ubah rute: kapasitas tepat 1% (batas bawah) → tersimpan', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.ubahRute({ kapasitas: '1' });
    await page.reload();
    await d.tungguTermuat(kodeRute);
    expect(await d.info('Kap. operasional')).toMatch(/^1%/);
  });

  /* ---------------- ubah jadwal, tanggal, duplikasi, aktivasi jadwal, alokasi ---------------- */

  test('[Positif] RJ-41 Ubah jadwal 14:00 (hanya Senin): tambah hari Minggu → keberangkatan hari Minggu ikut muncul', async ({ page }) => {
    test.skip(!fisik, 'RJ-37 gagal');
    const kode = `${kodeRute}-1400`;
    expect(await adaKeberangkatan(page, MINGGU, kode, kodeJadwal), 'sebelum diubah: tidak ada di hari Minggu').toBe(false);
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.bukaEditJadwal(kode);
    await d.hari('Min').click();
    await d.keLangkah('5/5');
    await d.simpanForm();
    expect(await adaKeberangkatan(page, MINGGU, kode, kodeJadwal), 'sesudah diubah: muncul di hari Minggu').toBe(true);
    expect(await adaKeberangkatan(page, SENIN, kode, kodeJadwal), 'hari Senin tetap ada').toBe(true);
  });

  test('[Edge] RJ-42 Ubah jadwal: Tanggal Akhir = Minggu → keberangkatan Minggu masih ada (inklusif), Senin sesudahnya hilang', async ({ page }) => {
    test.skip(!fisik, 'RJ-37 gagal');
    const kode = `${kodeRute}-1400`;
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.bukaEditJadwal(kode);
    await d.pilihTanggal(d.tglAkhir, MINGGU);
    await d.keLangkah('5/5');
    await d.simpanForm();
    expect(await adaKeberangkatan(page, MINGGU, kode, kodeJadwal), `tanggal akhir ${MINGGU} masih berlaku`).toBe(true);
    expect(await adaKeberangkatan(page, SENIN, kode, kodeJadwal), `${SENIN} sudah lewat tanggal akhir`).toBe(false);
  });

  test('[Positif] RJ-46 Duplikasi jadwal 10:00 → jadwal baru "<kode>-2" tersimpan dengan jam & kapal yang sama', async ({ page }) => {
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.bukaDuplikasiJadwal(kodeJadwal);
    await expect(d.kodeJadwal).toHaveValue(`${kodeJadwal}-2`);
    await d.keLangkah('5/5');
    await d.simpanForm();
    await expect.poll(() => d.kodeJadwalSemua()).toContain(`${kodeJadwal}-2`);
    const baris = d.baris(`${kodeJadwal}-2`);
    await expect(baris).toContainText(JADWAL.jam);
    await expect(baris).toContainText(JADWAL.kapal);
  });

  test('[Temuan] RJ-T14 duplikasi jadwal dengan kode yang sudah dipakai seharusnya ditolak', async ({ page }) => {
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.bukaDuplikasiJadwal(kodeJadwal);
    await d.kodeJadwal.fill(kodeJadwal);
    await d.lanjut();
    let hasil: string;
    if ((await d.langkah().innerText()).trim() === '1/5') {
      hasil = `Ditolak di langkah 1: "${(await d.pesanForm()).join(' / ')}"`;
      await d.batalForm('Close');
    } else {
      await d.keLangkah('5/5');
      hasil = await simpanJikaBisa(d);
    }
    await page.reload();
    await d.tungguTermuat(kodeRute);
    const jumlah = (await d.kodeJadwalSemua()).filter((x) => x === kodeJadwal).length;
    await cekTemuan(page, {
      id: 'RJ-T14',
      judul: 'Duplikasi jadwal bisa disimpan dengan kode jadwal yang sudah dipakai jadwal lain',
      langkah: [`Buka detail rute uji ${kodeRute}`, `Jadwal ${kodeJadwal} → ⋯ → Duplikasi`, `Ganti Kode Jadwal menjadi "${kodeJadwal}" (kode yang sudah ada)`, 'Selanjutnya sampai langkah 5 → Simpan'],
      ekspektasi: 'Ditolak: kode jadwal sudah dipakai',
      aktual: `${hasil}; jumlah jadwal berkode ${kodeJadwal}: ${jumlah}`,
      cek: async () => expect(jumlah).toBeLessThanOrEqual(1),
      fokus: d.tabel,
    });
  });

  test('[Temuan] RJ-T11 alokasi Reserve yang melebihi kuota kendaraan seharusnya tidak bisa disimpan', async ({ page }) => {
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.bukaEditJadwal(kodeJadwal);
    await d.keLangkah('3/5');
    const tipe = d.form.getByRole('combobox', { name: /^Tipe / });
    test.skip((await tipe.count()) === 0, `Kapal ${JADWAL.kapal} tidak punya golongan kendaraan`);
    const gol = (await tipe.first().getAttribute('aria-label'))!.replace(/^Tipe /, '');
    await d.aturAlokasi(gol, 'Reserve', '9999');
    await expect(d.form.getByText('Melebihi kuota')).toBeVisible();
    await d.lanjut();
    let hasil: string;
    if ((await d.langkah().innerText()).trim() === '3/5') {
      hasil = `Ditolak di langkah 3: "${(await d.pesanForm()).join(' / ')}"`;
      await d.batalForm('Close');
    } else {
      await d.keLangkah('5/5');
      hasil = await simpanJikaBisa(d);
    }
    const tersimpan = /berhasil/i.test(hasil);
    await cekTemuan(page, {
      id: 'RJ-T11',
      judul: 'Alokasi Reserve melebihi kuota kendaraan ("Melebihi kuota") tetap bisa lanjut dan disimpan',
      langkah: [`Buka detail rute uji ${kodeRute}`, `Jadwal ${kodeJadwal} → ⋯ → Edit Jadwal → Selanjutnya ke langkah 3`, `Golongan ${gol}: Tipe Reserve, Nilai 9999 unit (muncul tanda "Melebihi kuota")`, 'Selanjutnya sampai langkah 5 → Simpan'],
      ekspektasi: 'Tidak bisa lanjut/disimpan selama alokasi melebihi kuota',
      aktual: hasil,
      cek: async () => expect(tersimpan).toBe(false),
      fokus: d.tabel,
    });
  });

  test('[Positif] RJ-61 nonaktifkan jadwal 10:00 → tidak ada keberangkatannya; aktifkan lagi → kembali', async ({ page }) => {
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const kodeLain = `${kodeJadwal}-2`;
    const p = new RutePage(page);
    const buka = async () => {
      await p.goto({ search: kodeRute });
      return p.bukaDetail(kodeRute);
    };
    // Label menu saat ini selalu "Aktifkan" (RJ-T16). Aktivasi jadwal bisa langsung jalan tanpa dialog konfirmasi.
    const ubahAktivasi = async (d: DetailRutePage) => {
      await d.aksi(kodeJadwal, /^(Aktifkan|Nonaktifkan)$/);
      await konfirmasiJikaAda(d, /^(Aktifkan|Nonaktifkan|Ya.*|Lanjutkan)$/);
      await d.expectToast(/berhasil/i);
    };
    let d = await buka();
    await ubahAktivasi(d);
    try {
      await page.reload();
      await d.tungguTermuat(kodeRute);
      expect(await d.sel(kodeJadwal, 'Aktivasi')).toBe('Nonaktif');
      expect(await adaKeberangkatan(page, DATA.tanggalUji, kodeJadwal, kodeLain), 'jadwal nonaktif tidak boleh punya keberangkatan').toBe(false);
    } finally {
      d = await buka();
      if ((await d.sel(kodeJadwal, 'Aktivasi')) !== 'Aktif') await ubahAktivasi(d);
    }
    d = await buka();
    expect(await d.sel(kodeJadwal, 'Aktivasi')).toBe('Aktif');
    expect(await adaKeberangkatan(page, DATA.tanggalUji, kodeJadwal, kodeLain)).toBe(true);
  });

  test('[Dampak] RJ-71b nonaktifkan jadwal 10:00 → hilang dari web; aktifkan lagi → tampil lagi', async ({ page, browser }) => {
    test.skip(!webKenalRute, 'Rute uji tidak dikenal web Ferizy (lihat temuan RJ-T23) — dampak ke web tidak bisa diuji');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const p = new RutePage(page);
    const buka = async () => { await p.goto({ search: kodeRute }); return p.bukaDetail(kodeRute); };
    const ubahAktivasi = async (d: DetailRutePage) => {
      await d.aksi(kodeJadwal, /^(Aktifkan|Nonaktifkan)$/);
      await konfirmasiJikaAda(d, /^(Aktifkan|Nonaktifkan|Ya.*|Lanjutkan)$/);
      await d.expectToast(/berhasil/i);
    };
    let d = await buka();
    test.skip((await d.sel(kodeJadwal, 'Aktivasi')) !== 'Aktif', 'Jadwal 10:00 tidak Aktif');
    await ubahAktivasi(d);
    let saatNonaktif: Kartu[] = [];
    try {
      saatNonaktif = await kartuRuteQA(browser, (k) => !jam10(k));
    } finally {
      d = await buka();
      if ((await d.sel(kodeJadwal, 'Aktivasi')) !== 'Aktif') await ubahAktivasi(d);
    }
    const saatAktif = await kartuRuteQA(browser, (k) => !!jam10(k));
    await cekTemuan(page, {
      id: 'RJ-T24',
      judul: 'Status jadwal (nonaktif/aktif) di CMS tidak tersinkron ke web Ferizy',
      langkah: [`CMS → rute uji ${kodeRute} → jadwal ${kodeJadwal} → Nonaktifkan`, LANGKAH_WEB(), `Aktifkan lagi jadwal ${kodeJadwal}`, 'Cek web lagi'],
      ekspektasi: 'Saat nonaktif jam 10.00 hilang dari web; setelah aktif tampil lagi',
      aktual: `Saat nonaktif: ${jam10(saatNonaktif) ? 'masih tampil' : 'hilang'}; setelah aktif: ${jam10(saatAktif) ? 'tampil' : 'tidak tampil'}`,
      cek: async () => { expect(jam10(saatNonaktif)).toBeFalsy(); expect(jam10(saatAktif)).toBeTruthy(); },
    });
  });

  test('[Dampak] RJ-72 ganti kapal default jadwal 10:00 → nama kapal di web ikut berubah (dikembalikan setelahnya)', async ({ page, browser }) => {
    test.skip(!webKenalRute, 'Rute uji tidak dikenal web Ferizy (lihat temuan RJ-T23) — dampak ke web tidak bisa diuji');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const p = new RutePage(page);
    const gantiKapal = async (kapal: string) => {
      await p.goto({ search: kodeRute });
      const d = await p.bukaDetail(kodeRute);
      await d.bukaEditJadwal(kodeJadwal);
      await d.keLangkah('2/5');
      await d.pilihDiCombobox(d.kapalDefault, kapal, new RegExp('^' + kapal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await d.keLangkah('5/5');
      const hasil = await simpanJikaBisa(d);
      expect(hasil, `ganti kapal ke ${kapal}`).toMatch(/berhasil/i);
    };
    await gantiKapal(KAPAL2);
    let kartu: Kartu[] = [];
    try {
      kartu = await kartuRuteQA(browser, (k) => jam10(k)?.kapal === KAPAL2);
    } finally {
      await gantiKapal(JADWAL.kapal);
    }
    const k = jam10(kartu);
    await cekTemuan(page, {
      id: 'RJ-T25',
      judul: 'Ganti kapal default jadwal di CMS tidak tersinkron ke web Ferizy',
      langkah: [`CMS → rute uji ${kodeRute} → jadwal ${kodeJadwal} → Edit Jadwal → langkah 2: Kapal default "${KAPAL2}" → Simpan`, LANGKAH_WEB(), 'Tunggu ±1 menit'],
      ekspektasi: `Kartu jam 10.00 menampilkan kapal "${KAPAL2}"`,
      aktual: k ? `Kapal di web: "${k.kapal}"` : 'Jadwal 10.00 tidak tampil di web',
      cek: async () => expect(k?.kapal).toBe(KAPAL2),
    });
  });

  /* ---------------- alokasi: terapkan ke jadwal lain, salin dari; sembunyikan jadwal ---------------- */

  test('[Positif] RJ-65 alokasi Reserve 1 unit + "Terapkan juga ke jadwal lain" → jadwal "-2" ikut memakai alokasi yang sama', async ({ page }) => {
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const dua = `${kodeJadwal}-2`;
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    let d = await p.bukaDetail(kodeRute);
    test.skip((await d.baris(dua).count()) === 0, 'RJ-46 gagal (jadwal -2 tidak ada)');
    await d.bukaEditJadwal(kodeJadwal);
    await d.keLangkah('3/5');
    const tipe = d.form.getByRole('combobox', { name: /^Tipe / });
    test.skip((await tipe.count()) === 0, `Kapal ${JADWAL.kapal} tidak punya golongan kendaraan`);
    golAlokasi = (await tipe.first().getAttribute('aria-label'))!.replace(/^Tipe /, '');
    await d.aturAlokasi(golAlokasi, 'Reserve', '1');
    await d.cekTerapkan(dua).click();
    await expect(d.cekTerapkan(dua)).toBeChecked();
    await d.keLangkah('5/5');
    await d.simpanForm();
    await page.reload();
    d = new DetailRutePage(page);
    await d.tungguTermuat(kodeRute);
    await d.bukaEditJadwal(dua);
    await d.keLangkah('3/5');
    await expect(d.tipeAlokasi(golAlokasi)).toHaveText(/Reserve/);
    await expect(d.nilaiAlokasi(golAlokasi)).toHaveValue('1');
    await d.batalForm('Close');
  });

  test('[Positif] RJ-66 "Salin dari" jadwal lain → alokasi kendaraan tersalin ke form (tidak disimpan)', async ({ page }) => {
    test.skip(!golAlokasi || !fisik, 'RJ-65 / RJ-37 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.bukaEditJadwal(`${kodeRute}-1400`);
    await d.keLangkah('3/5');
    await expect(d.tipeAlokasi(golAlokasi)).toHaveText(/Normal/);
    await d.form.getByRole('combobox', { name: 'Salin dari' }).click();
    await page.getByRole('option', { name: new RegExp('^' + kodeJadwal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' · ') }).click();
    await expect(d.tipeAlokasi(golAlokasi)).toHaveText(/Reserve/);
    await expect(d.nilaiAlokasi(golAlokasi)).toHaveValue('1');
    await d.batalForm('Close');
  });

  test('[Positif] RJ-67 Sembunyikan jadwal "-2" → tampil di filter "Tersembunyi"; Hapus → masuk filter "Sampah"', async ({ page }) => {
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const dua = `${kodeJadwal}-2`;
    const p = new RutePage(page);
    const buka = async () => {
      await p.goto({ search: kodeRute });
      return p.bukaDetail(kodeRute);
    };
    let d = await buka();
    test.skip((await d.baris(dua).count()) === 0, 'RJ-46 gagal (jadwal -2 tidak ada)');
    await d.aksi(dua, 'Sembunyikan');
    await konfirmasiJikaAda(d, /^(Sembunyikan|Ya.*|Lanjutkan)$/);
    await d.expectToast(/berhasil/i);
    d = await buka();
    const diDaftarBiasa = await d.baris(dua).count();
    const adaBerangkat = await adaKeberangkatan(page, DATA.tanggalUji, dua, kodeJadwal);
    test.info().annotations.push({ type: 'info', description: `Jadwal tersembunyi: tampil di tabel tanpa filter = ${diDaftarBiasa > 0 ? 'ya' : 'tidak'}; keberangkatan ${DATA.tanggalUji} = ${adaBerangkat ? 'masih ada' : 'tidak ada'}` });
    d = await buka();
    await d.filterAktivasi('Tersembunyi');
    await expect(d.baris(dua)).toHaveCount(1);
    // bersihkan sekaligus uji hapus dari tampilan Tersembunyi
    await d.aksi(dua, 'Hapus Data');
    await d.konfirmasiKlik('Hapus');
    await d.expectToast(/berhasil/i);
    d = await buka();
    await d.filterAktivasi('Sampah');
    await expect(d.baris(dua), 'jadwal yang dihapus masuk ke Sampah').toHaveCount(1);
  });

  /* ---------------- rute: duplikasi, sembunyikan, sampah, batal nonaktif, kode bentrok ---------------- */

  test('[Positif] RJ-58 Duplikasi rute uji → rute baru tersimpan dengan pengaturan yang sama (kapasitas operasional)', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const kapAsli = (await p.sel(kodeRute, 'Kap. Operasional')).match(/\d+%/)?.[0];
    await p.aksi(kodeRute, 'Duplikasi');
    await p.kodeRute.fill(kodeDup());
    await p.lanjut();
    await expect(p.langkah()).toHaveText('2/3');
    await p.lanjut();
    await expect(p.langkah()).toHaveText('3/3');
    await p.btnForm('Simpan').click();
    await p.konfirmasiKlik('Simpan');
    await p.expectToast(/berhasil/i);
    await expect(p.form).toBeHidden();
    await p.goto({ search: kodeDup() });
    await expect(p.baris(kodeDup())).toHaveCount(1);
    expect(await p.sel(kodeDup(), 'Kap. Operasional')).toContain(kapAsli ?? '%');
    dupDibuat = true;
  });

  test('[Positif] RJ-59 Sembunyikan rute (duplikat) → muncul di filter Aktivasi "Tersembunyi"', async ({ page }) => {
    test.skip(!dupDibuat, 'RJ-58 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeDup() });
    await p.aksi(kodeDup(), 'Sembunyikan');
    await konfirmasiJikaAda(p, /^(Sembunyikan|Ya.*|Lanjutkan)$/);
    await p.expectToast(/berhasil/i);
    await p.goto({ search: kodeDup() });
    const diDaftarBiasa = await p.baris(kodeDup()).count();
    await p.filterAktivasi('Tersembunyi');
    await expect(p.baris(kodeDup())).toHaveCount(1);
    const menu = await p.daftarAksi(kodeDup());
    test.info().annotations.push({ type: 'info', description: `Rute tersembunyi: tampil di daftar tanpa filter = ${diDaftarBiasa > 0 ? 'ya' : 'tidak'}; menu: ${menu.join(', ')}` });
  });

  test('[Positif] RJ-60 Hapus rute (duplikat) → hilang dari daftar dan masuk filter "Sampah"', async ({ page }) => {
    test.skip(!dupDibuat, 'RJ-58 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeDup() });
    if ((await p.baris(kodeDup()).count()) === 0) await p.filterAktivasi('Tersembunyi'); // rute tersembunyi mungkin tidak tampil tanpa filter
    await p.aksi(kodeDup(), 'Hapus Data');
    await p.konfirmasiKlik('Hapus');
    await p.expectToast(/berhasil/i);
    await p.goto({ search: kodeDup() });
    await expect(p.baris(kodeDup())).toHaveCount(0);
    await p.filterAktivasi('Sampah');
    await expect(p.baris(kodeDup())).toHaveCount(1);
  });

  test('[Negatif] RJ-47 Nonaktifkan rute → Batal di konfirmasi → status tetap "Aktif"', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    expect(await p.sel(kodeRute, 'Aktivasi')).toBe('Aktif');
    await p.aksi(kodeRute, /^(Aktifkan|Nonaktifkan)$/);
    await p.konfirmasiKlik('Batal');
    await p.goto({ search: kodeRute });
    expect(await p.sel(kodeRute, 'Aktivasi')).toBe('Aktif');
  });

  test('[Negatif] RJ-48 Ubah rute: kode diganti dengan kode rute lain yang sudah ada → ditolak', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const LAIN = process.env.RJ_RUTE_KODE ?? 'LMB-PGA';
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    const ubahKode = async (baru: string) => {
      await d.btnUbahRute.click();
      await expect(p.kodeRute).toBeEditable();
      await p.kodeRute.fill(baru);
      await d.lanjut();
      await page.waitForTimeout(800);
      if ((await d.langkah().innerText()).trim() === '1/3') {
        const pesan = (await d.pesanForm()).join(' / ');
        await d.batalForm('Close');
        return `Ditolak di langkah 1: "${pesan}"`;
      }
      await d.keLangkah('3/3');
      return simpanJikaBisa(d);
    };
    const hasil = await ubahKode(LAIN);
    await page.reload();
    const judul = await d.main.getByText(/\([A-Z0-9-]+\)$/).first().innerText();
    const berubah = judul.includes(`(${LAIN})`);
    if (berubah) {
      // KEMBALIKAN segera supaya kode rute asli tidak dobel
      await d.tungguTermuat(LAIN);
      await ubahKode(kodeRute);
      await page.reload();
    }
    await d.tungguTermuat(kodeRute);
    await cekTemuan(page, {
      id: 'RJ-T15',
      judul: 'Ubah rute bisa menyimpan kode rute yang sudah dipakai rute lain',
      langkah: [`Buka detail rute uji ${kodeRute} → Ubah rute`, `Ganti Kode rute menjadi "${LAIN}" (kode rute lain yang sudah ada)`, 'Berikutnya sampai langkah 3 → Simpan'],
      ekspektasi: 'Ditolak: kode rute sudah dipakai',
      aktual: `${hasil}${berubah ? ' — kode rute uji sempat menjadi ' + LAIN + ' (sudah dikembalikan)' : ''}`,
      cek: async () => expect(berubah).toBe(false),
    });
  });

  test('[Temuan] RJ-T05 dua jam yang sama di satu form seharusnya ditolak (bukan 2 jadwal berkode sama)', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.tambahJadwal({ jam: ['16:00', '16:00'], kapal: JADWAL.kapal, tiba: '17:00', simpan: false });
    const hasil = await simpanJikaBisa(d);
    await page.reload();
    await d.tungguTermuat(kodeRute);
    const kode = `${kodeRute}-1600`;
    const jumlah = (await d.kodeJadwalSemua()).filter((x) => x === kode).length;
    await cekTemuan(page, {
      id: 'RJ-T05',
      judul: 'Form Tambah Jadwal menerima jam yang sama dua kali → 2 jadwal dengan kode yang SAMA',
      langkah: [
        `Buka detail rute uji ${kodeRute} → Tambah (jadwal)`,
        'Isi Jam Keberangkatan 1 = 16:00, klik Tambah, isi Jam Keberangkatan 2 = 16:00 (kode keduanya otomatis sama)',
        `Unit Bisnis Travel / Shuttle → kapal ${JADWAL.kapal} → waktu tiba 17:00 → Simpan`,
      ],
      ekspektasi: 'Ditolak dengan pesan "jam/kode jadwal sudah dipakai", atau hanya 1 jadwal yang tersimpan',
      aktual: `${hasil}; jumlah jadwal berkode ${kode} sekarang: ${jumlah}`,
      cek: async () => expect(jumlah).toBeLessThanOrEqual(1),
      fokus: d.tabel,
    });
  });

  test('[Temuan] RJ-T06 waktu tiba lebih awal dari jam berangkat (hari yang sama) seharusnya ditolak', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    await d.tambahJadwal({ jam: '18:00', kapal: JADWAL.kapal, tiba: '17:00', simpan: false });
    const hariKe = await d.hariKeTujuan.inputValue();
    const hasil = await simpanJikaBisa(d);
    await page.reload();
    await d.tungguTermuat(kodeRute);
    const kode = `${kodeRute}-1800`;
    const baris = d.baris(kode);
    const tersimpan = (await baris.count()) > 0;
    const estimasi = tersimpan ? (await baris.first().innerText()).match(/-?\s*\d+ jam[^\n]*/)?.[0] ?? '' : '';
    await cekTemuan(page, {
      id: 'RJ-T06',
      judul: 'Jadwal dengan waktu tiba sebelum jam berangkat (hari ke tujuan = 1) bisa disimpan; estimasi waktu jadi negatif',
      langkah: [
        `Buka detail rute uji ${kodeRute} → Tambah (jadwal)`,
        `Jam Keberangkatan 18:00, Unit Bisnis Travel / Shuttle → kapal ${JADWAL.kapal}`,
        `Langkah 5: Hari ke Tujuan = ${hariKe}, Waktu Tiba = 17:00 → Simpan`,
      ],
      ekspektasi: 'Ditolak: waktu tiba harus setelah jam berangkat (atau hari ke tujuan otomatis jadi 2)',
      aktual: tersimpan ? `${hasil}; jadwal ${kode} tersimpan${estimasi ? `, estimasi "${estimasi.trim()}"` : ''}` : hasil,
      cek: async () => expect(tersimpan).toBe(false),
      fokus: tersimpan ? baris.first() : d.tabel,
    });
  });

  test('[Negatif] RJ-33 Hapus rute yang masih punya jadwal → ditolak, rute tetap ada', async ({ page }) => {
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    await p.aksi(kodeRute, 'Hapus Data');
    await p.konfirmasiKlik('Hapus');
    const t = p.toast.filter({ hasText: /Gagal/ }).first();
    await expect(t).toBeVisible({ timeout: 15_000 });
    pesanTolak.push(`Hapus rute: "${(await t.innerText()).replace(/\s+/g, ' ').trim()}"`);
    await p.goto({ search: kodeRute });
    await expect(p.baris(kodeRute)).toHaveCount(1);
  });

  test('[Negatif] PL-40 Hapus pelabuhan yang dipakai rute → ditolak, pelabuhan tetap ada', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new PelabuhanPage(page);
    await p.goto({ search: PEL_A.kode });
    await p.aksi(PEL_A.kode, 'Hapus Data');
    await p.konfirmasiKlik('Hapus');
    const t = p.toast.filter({ hasText: /Gagal/ }).first();
    await expect(t).toBeVisible({ timeout: 15_000 });
    pesanTolak.push(`Hapus pelabuhan: "${(await t.innerText()).replace(/\s+/g, ' ').trim()}"`);
    await p.goto({ search: PEL_A.kode });
    await expect(p.baris(PEL_A.kode)).toHaveCount(1);
  });

  test('[Positif] PL-39 pelabuhan Nonaktif tidak ditawarkan di form Tambah rute; Aktif lagi → ditawarkan', async ({ page }) => {
    const pel = new PelabuhanPage(page);
    await pel.goto({ search: PEL_B.kode });
    await pel.setAktif(PEL_B.kode, false);
    try {
      const r = new RutePage(page);
      await r.goto();
      await r.bukaTambah();
      await r.pilihPelabuhan(r.asal, PEL_A.nama);
      expect(await r.jumlahOpsiTujuan(PEL_B.nama), 'pelabuhan nonaktif tidak boleh ditawarkan').toBe(0);
      await r.tutupForm();
    } finally {
      await pel.goto({ search: PEL_B.kode });
      await pel.setAktif(PEL_B.kode, true);
    }
    const r = new RutePage(page);
    await r.goto();
    await r.bukaTambah();
    await r.pilihPelabuhan(r.asal, PEL_A.nama);
    expect(await r.jumlahOpsiTujuan(PEL_B.nama), 'setelah diaktifkan lagi harus ditawarkan').toBeGreaterThan(0);
    await r.tutupForm();
  });

  test('[Positif] RJ-34 nonaktifkan rute → "Nonaktif" & hilang dari pilihan rute Keberangkatan; aktifkan lagi → kembali', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    await p.klikAktivasi(kodeRute); // aktif → nonaktif
    try {
      await p.goto({ search: kodeRute });
      expect(await p.sel(kodeRute, 'Aktivasi')).toBe('Nonaktif');
      expect(await adaDiPilihanKeberangkatan(page, kodeRute), 'rute nonaktif tidak boleh bisa dipilih').toBe(false);
    } finally {
      await p.goto({ search: kodeRute });
      if ((await p.sel(kodeRute, 'Aktivasi')) !== 'Aktif') await p.klikAktivasi(kodeRute);
    }
    await p.goto({ search: kodeRute });
    expect(await p.sel(kodeRute, 'Aktivasi')).toBe('Aktif');
    expect(await adaDiPilihanKeberangkatan(page, kodeRute)).toBe(true);
  });

  test('[Negatif] RJ-74 rute uji Nonaktif → jadwalnya tidak bisa ditemukan di web; Aktif lagi → tampil lagi', async ({ page, browser }) => {
    test.skip(!webKenalRute, 'Rute uji tidak dikenal web Ferizy (lihat temuan RJ-T23) — dampak ke web tidak bisa diuji');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    test.skip(!kodeRute || !kodeJadwal, 'RJ-30/31 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    test.skip((await p.sel(kodeRute, 'Aktivasi')) !== 'Aktif', 'Rute uji tidak Aktif');
    await p.klikAktivasi(kodeRute); // aktif → nonaktif
    let saatNonaktif: Kartu[] = [];
    try {
      saatNonaktif = await kartuRuteQA(browser, (k) => k.length === 0);
    } finally {
      await p.goto({ search: kodeRute });
      if ((await p.sel(kodeRute, 'Aktivasi')) !== 'Aktif') await p.klikAktivasi(kodeRute);
    }
    const saatAktif = await kartuRuteQA(browser, (k) => !!jam10(k));
    await cekTemuan(page, {
      id: 'RJ-T26',
      judul: 'Rute yang dinonaktifkan di CMS masih bisa dicari & dijual di web Ferizy',
      langkah: [`CMS → Jadwal Rute → ${kodeRute} → Nonaktifkan`, LANGKAH_WEB(), 'Aktifkan lagi rute → cek web lagi'],
      ekspektasi: 'Saat nonaktif tidak ada jadwal di web; setelah aktif jadwal 10.00 tampil lagi',
      aktual: `Saat nonaktif: ${saatNonaktif.length} jadwal di web; setelah aktif: ${jam10(saatAktif) ? 'jam 10.00 tampil' : 'jam 10.00 tidak tampil'}`,
      cek: async () => { expect(saatNonaktif).toHaveLength(0); expect(jam10(saatAktif)).toBeTruthy(); },
    });
  });

  test('[Positif] RJ-35 Hapus 1 jadwal (10:00) → hilang dari detail, jumlah berkurang 1', async ({ page }) => {
    test.skip(!kodeJadwal, 'RJ-31 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    const awal = await d.totalData();
    await d.hapusJadwal(kodeJadwal);
    await expect.poll(() => d.totalData()).toBe(awal - 1);
    expect(await d.kodeJadwalSemua()).not.toContain(kodeJadwal);
  });

  test('[Positif] RJ-36 Hapus massal (Pilih semua → Hapus) → semua jadwal hilang, daftar rute kembali "Tambahkan"', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    const d = await p.bukaDetail(kodeRute);
    const awal = await d.totalData();
    test.skip(awal === 0, 'Tidak ada jadwal tersisa untuk dihapus massal');
    const n = await d.hapusMassalJadwal();
    expect(n).toBe(Math.min(awal, 10));
    await expect.poll(() => d.totalData()).toBe(awal - n);
    if (awal - n > 0) await d.hapusMassalJadwal(); // jaga-jaga lebih dari 1 halaman
    await expect.poll(() => d.totalData()).toBe(0);
    await p.goto({ search: kodeRute });
    await expect(p.tombolJadwal(kodeRute)).toHaveText(/Tambahkan/);
  });

  test('[Positif] RJ-38 Hapus rute tanpa jadwal → hilang dari daftar', async ({ page }) => {
    test.skip(!kodeRute, 'RJ-30 gagal');
    const p = new RutePage(page);
    await p.goto({ search: kodeRute });
    await p.aksi(kodeRute, 'Hapus Data');
    await p.konfirmasiKlik('Hapus');
    await p.expectToast(/berhasil/i);
    await p.goto({ search: kodeRute });
    expect(await p.totalData()).toBe(0);
    await p.filterAktivasi('Sampah');
    await expect(p.baris(kodeRute), 'rute yang dihapus masuk ke Sampah').toHaveCount(1);
  });

  /* --------------------------------- TEMUAN --------------------------------- */

  test('[Temuan] RJ-T10 pesan tolak hapus seharusnya bahasa pengguna, bukan nama tabel ("schedules", "pickupRoutes")', async ({ page }) => {
    test.skip(pesanTolak.length === 0, 'RJ-33 / PL-40 tidak menghasilkan pesan');
    await cekTemuan(page, {
      id: 'RJ-T10',
      judul: 'Pesan penolakan hapus memakai nama tabel/relasi teknis',
      langkah: [
        `Hapus rute uji yang masih punya jadwal (menu Jadwal Rute → ⋯ → Hapus Data → Hapus)`,
        `Hapus pelabuhan uji yang dipakai rute (menu Pelabuhan → ⋯ → Hapus Data → Hapus)`,
      ],
      ekspektasi: 'Pesan jelas, mis. "Rute tidak bisa dihapus karena masih punya 1 jadwal" / "Pelabuhan dipakai rute QA-QB"',
      aktual: pesanTolak.join(' | '),
      cek: async () => expect(pesanTolak.join(' ')).not.toMatch(/schedules|pickupRoutes|dropoffRoutes/),
    });
  });
});