import { test, expect } from '@playwright/test';
import { RutePage } from './pages/rute.pages';
import { cekTemuan, KeberangkatanListPage, DATA as KA, firstInt } from './pages/kapasitas.pages';
import { bukaWeb, jadwalWeb, tglDepan } from './pages/ferizy.pages';

/**
 * MASTER DATA — RUTE & JADWAL (/routes, menu "Jadwal Rute") — READ-ONLY
 * Form dibuka lalu DIBATALKAN; tidak ada data yang disimpan.
 * ID: RJ-0x / RJ-1x / RJ-2x / RJ-4x / RJ-5x (fungsi), RJ-T0x / RJ-T1x (temuan)
 */

const RUTE = process.env.RJ_RUTE_KODE ?? 'LMB-PGA'; // rute aktif yang sudah punya jadwal
const ASAL = process.env.RJ_ASAL ?? 'LEMBAR';
const TUJUAN = process.env.RJ_TUJUAN ?? 'PADANG BAI';
const LANGKAH_TAMBAH = ['Buka menu Jadwal Rute (/routes)', 'Klik "Tambah"'];
const JADWAL_RO = process.env.RJ_JADWAL_KODE ?? `${RUTE}-1500`; // jadwal milik RUTE yang kapalnya punya golongan kendaraan (dibuka saja, tidak disimpan)
const LANGKAH_DETAIL = ['Buka menu Jadwal Rute', `Cari rute ${RUTE} → ⋯ → Edit Rute & Jadwal`];

test.describe('Rute — daftar', () => {
  test('[Positif] RJ-01 halaman tampil: judul, toolbar, kolom tabel, ringkasan data', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await expect(p.main).toContainText('Kelola rute & jadwal.');
    for (const b of [p.btnFilter, p.btnTampilan, p.btnExport, p.btnTambah]) await expect(b).toBeVisible();
    await expect(p.btnHapusMassal).toBeDisabled();
    const h = await p.header();
    for (const k of ['Kode', 'Outlet Asal', 'Outlet Tujuan', 'Jadwal Aktif', 'Status', 'Aktivasi']) expect(h.join(' | ')).toContain(k);
    expect(await p.totalData()).toBeGreaterThan(0);
  });

  test('[Positif] RJ-02 cari berdasarkan kode → hanya rute itu', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.cariData(RUTE);
    await expect(p.baris(RUTE)).toHaveCount(1);
    await expect(p.baris(RUTE)).toContainText(ASAL);
    await expect(p.baris(RUTE)).toContainText(TUJUAN);
  });

  test('[Negatif] RJ-03 cari kode yang tidak ada → "Belum ada rute", 0 data', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.cariData('ZZZ-TIDAK-ADA');
    await expect.poll(() => p.totalData()).toBe(0);
    await expect(p.main).toContainText('Belum ada rute');
  });

  test('[Positif] RJ-04 sort Kode: A→Z lalu Z→A', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    const naik = await p.sortBy('Kode');
    expect(naik).toEqual([...naik].sort());
    const turun = await p.sortBy('Kode');
    expect(turun).toEqual([...turun].sort().reverse());
  });

  test('[Positif] RJ-05 filter Aktivasi "Nonaktif" → semua baris Nonaktif', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    const st = await p.nilaiKolom('Aktivasi');
    expect(st.length).toBeGreaterThan(0);
    for (const s of st) expect(s).toBe('Nonaktif');
  });

  test('[Positif] RJ-06 klik "n Jadwal" → daftar jadwal rute tampil, jumlah sesuai', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const label = (await p.tombolJadwal(RUTE).innerText()).trim();
    const n = Number(label.match(/(\d+) Jadwal/)?.[1] ?? 0);
    test.skip(n === 0, `Rute ${RUTE} belum punya jadwal`);
    await p.tombolJadwal(RUTE).click();
    await expect(p.form.getByRole('heading')).toContainText(`(${RUTE})`);
    await expect(p.form).toContainText(new RegExp(`dari ${n} data`));
    const kode = (await p.form.locator('tbody tr td:nth-child(2)').allInnerTexts()).map((x) => x.trim());
    for (const k of kode) expect(k.startsWith(RUTE)).toBe(true);
  });

  test('[Positif] RJ-07 Edit Rute & Jadwal → halaman detail berisi info rute & daftar jadwal', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    await expect(d.tabInfo).toBeVisible();
    await expect(d.tabTarif).toBeVisible();
    await expect(d.main).toContainText(new RegExp(`Kode Rute\\s*${RUTE}`));
    await expect(d.main).toContainText(new RegExp(`Outlet Asal\\s*${ASAL}`));
    await expect(d.main).toContainText(new RegExp(`Outlet Tujuan\\s*${TUJUAN}`));
    await expect(d.btnUbahRute).toBeVisible();
    expect(await d.totalData()).toBeGreaterThan(0);
  });
});

test.describe('Rute — form Tambah (tanpa menyimpan)', () => {
  test('[Negatif] RJ-10 langkah 1 kosong → Berikutnya → 3 pesan wajib diisi', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.bukaTambah();
    await p.lanjut();
    await expect(p.form).toContainText('Pelabuhan asal wajib diisi');
    await expect(p.form).toContainText('Pelabuhan tujuan wajib diisi');
    await expect(p.form).toContainText('Kode rute wajib diisi');
    await expect(p.langkah()).toHaveText('1/3');
  });

  test('[Negatif] RJ-11 pelabuhan tujuan tidak boleh sama dengan asal (tidak ditawarkan)', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.bukaTambah();
    await p.pilihPelabuhan(p.asal, ASAL);
    expect(await p.jumlahOpsiTujuan(ASAL)).toBe(0);
  });

  test('[Positif] RJ-12 pilih asal & tujuan → kode & nama rute terisi otomatis', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.bukaTambah();
    await p.pilihPelabuhan(p.asal, ASAL);
    await p.pilihPelabuhan(p.tujuan, TUJUAN);
    await expect(p.namaRute).toHaveValue(`${ASAL} - ${TUJUAN}`);
    await expect(p.kodeRute).toHaveValue(/^[A-Z]+-[A-Z]+/);
  });

  test('[Edge] RJ-13 pasangan pelabuhan yang sudah punya rute → kode otomatis tidak bentrok (diberi akhiran)', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.bukaTambah();
    await p.pilihPelabuhan(p.asal, ASAL);
    await p.pilihPelabuhan(p.tujuan, TUJUAN);
    await expect(p.kodeRute).not.toHaveValue('');
    expect(await p.kodeRute.inputValue()).not.toBe(RUTE);
  });

  test('[Negatif] RJ-14 batas online & go-show negatif → ditolak di langkah 2', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.bukaTambah();
    await p.pilihPelabuhan(p.asal, ASAL);
    await p.pilihPelabuhan(p.tujuan, TUJUAN);
    await p.lanjut();
    await p.batasOnline.fill('-5');
    await p.goShow.fill('-3');
    await p.lanjut();
    await expect(p.form).toContainText('Isi angka bulat 0 atau lebih');
    await expect(p.form).toContainText('Batas go-show harus berupa angka menit');
    await expect(p.langkah()).toHaveText('2/3');
  });

  test('[Negatif] RJ-15 kapasitas operasional 150% → ditolak "Isi persen 1 sampai 100"', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.bukaTambah();
    await p.pilihPelabuhan(p.asal, ASAL);
    await p.pilihPelabuhan(p.tujuan, TUJUAN);
    await p.lanjut();
    await p.kapasitas.fill('150');
    await p.lanjut();
    await expect(p.form).toContainText('Isi persen 1 sampai 100');
    await expect(p.langkah()).toHaveText('2/3');
  });

  test('[Positif] RJ-16 Batal menutup form tanpa menyimpan', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    const total = await p.totalData();
    await p.bukaTambah();
    await p.pilihPelabuhan(p.asal, ASAL);
    expect(await p.batalForm('Batal', 'Ya, Batalkan'), 'konfirmasi "Batalkan Pengisian Data?" harus muncul').toBe(true);
    expect(await p.totalData()).toBe(total);
  });

  test('[Negatif] RJ-16b Batal → "Batalkan Pengisian Data?" → Kembali → form tetap terbuka, pelabuhan asal tetap terpilih', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.bukaTambah();
    await p.pilihPelabuhan(p.asal, ASAL);
    expect(await p.batalForm('Batal', 'Kembali')).toBe(true);
    await expect(p.form).toBeVisible();
    await expect(p.asal).toContainText(ASAL);
    await p.batalForm('Close', 'Ya, Batalkan');
  });

  test('[Edge] RJ-16c form belum diisi → Batal langsung menutup tanpa konfirmasi', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.bukaTambah();
    expect(await p.batalForm('Batal'), 'form kosong tidak perlu konfirmasi').toBe(false);
  });

  /* ------------------ form Tambah JADWAL & Ubah rute (tanpa menyimpan) ------------------ */

  test('[Negatif] RJ-17 form jadwal kosong → "Jam keberangkatan" & "Unit bisnis" wajib, tetap di langkah 1', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    await d.bukaFormJadwal();
    await d.lanjut();
    const pesan = await d.pesanForm();
    expect(pesan).toContain('Jam keberangkatan wajib diisi');
    expect(pesan).toContain('Unit bisnis wajib dipilih');
    await expect(d.langkah()).toHaveText('1/5');
    await d.tutupForm();
  });

  test('[Positif] RJ-18 isi jam keberangkatan → kode jadwal terisi otomatis "<kode rute>-HHMM"', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    await d.bukaFormJadwal();
    await d.ketikJam(d.jam, '07:15');
    await expect(d.kodeJadwal).toHaveValue(new RegExp(`^${RUTE}-0715`));
    await d.tutupForm();
  });

  test('[Negatif] RJ-19 hari operasional dikosongkan → "Hari operasional wajib dipilih"', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    await d.bukaFormJadwal();
    await d.ketikJam(d.jam, '07:15');
    await d.pilihDiCombobox(d.unitBisnis, 'Travel', 'Travel / Shuttle');
    await expect(d.pilihSemuaHari).toBeChecked(); // default: semua hari
    await d.pilihSemuaHari.click();
    await d.lanjut();
    await expect.poll(() => d.pesanForm()).toContain('Hari operasional wajib dipilih');
    await expect(d.langkah()).toHaveText('1/5');
    await d.tutupForm();
  });

  test('[Negatif] RJ-20 langkah 2 tanpa kapal & tanpa denah kursi → "Layout kursi wajib dipilih"', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    await d.bukaFormJadwal();
    await d.ketikJam(d.jam, '07:15');
    await d.pilihDiCombobox(d.unitBisnis, 'Travel', 'Travel / Shuttle');
    await d.lanjut();
    await expect(d.langkah()).toHaveText('2/5');
    await d.lanjut();
    await expect.poll(() => d.pesanForm()).toContain('Layout kursi wajib dipilih');
    await expect(d.langkah()).toHaveText('2/5');
    await d.tutupForm();
  });

  test('[Negatif] RJ-21 kapasitas jadwal 150% → "Isi persen 1 sampai 100"; [Edge] 100% → boleh lanjut', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    await d.bukaFormJadwal();
    await d.ketikJam(d.jam, '07:15');
    await d.pilihDiCombobox(d.unitBisnis, 'Travel', 'Travel / Shuttle');
    await d.lanjut();
    await d.pilihDiCombobox(d.kapalDefault, 'Naraya', /^KMP Naraya/);
    await d.kapasitasJadwal.fill('150');
    await d.lanjut();
    await expect.poll(() => d.pesanForm()).toContain('Isi persen 1 sampai 100');
    await expect(d.langkah()).toHaveText('2/5');
    await d.kapasitasJadwal.fill('100');
    await d.lanjut();
    await expect(d.langkah()).toHaveText('3/5');
    await d.tutupForm();
  });

  test('[Positif] RJ-22a waktu tiba terisi otomatis dari jam berangkat + estimasi waktu tempuh rute', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    await d.tambahJadwal({ jam: '07:15', kapal: 'KMP Naraya', simpan: false });
    await expect(d.waktuTiba).not.toHaveValue('');
    await d.tutupForm();
  });

  test('[Negatif] RJ-22 langkah 5 waktu tiba dikosongkan → "Waktu tujuan wajib diisi", tidak muncul konfirmasi', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    await d.tambahJadwal({ jam: '07:15', kapal: 'KMP Naraya', simpan: false });
    await d.waktuTiba.fill(''); // bisa sudah terisi otomatis dari estimasi rute
    await d.btnForm('Simpan').click();
    await expect.poll(() => d.pesanForm()).toContain('Waktu tujuan wajib diisi');
    await expect(d.konfirmasi).toHaveCount(0);
    await d.tutupForm();
  });

  test('[Positif] RJ-23 Ubah rute yang sudah punya jadwal → pelabuhan asal & tujuan terkunci dengan keterangan', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    await d.btnUbahRute.click();
    await expect(d.form.getByRole('heading', { name: new RegExp(`^Ubah Data Rute · ${RUTE}`) })).toBeVisible();
    await expect(d.form.getByRole('combobox', { name: 'Pelabuhan asal' })).toBeDisabled();
    await expect(d.form.getByRole('combobox', { name: 'Pelabuhan tujuan' })).toBeDisabled();
    await expect(d.form).toContainText(/terkunci karena rute sudah punya \d+ jadwal aktif/);
    await d.tutupForm();
  });

  /* --------------------------------- TEMUAN --------------------------------- */

  test('[Temuan] RJ-T01 menu rute yang AKTIF seharusnya "Nonaktifkan", bukan "Aktifkan"', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    await expect(p.baris(RUTE)).toContainText(/Aktif/);
    const status = await p.sel(RUTE, 'Aktivasi');
    const menu = await p.bukaMenu(RUTE);
    const item = (await menu.getByRole('menuitem', { name: /^(Aktifkan|Nonaktifkan)$/ }).innerText()).trim();
    await cekTemuan(page, {
      id: 'RJ-T01',
      judul: 'Rute aktif menampilkan menu "Aktifkan"; mengkliknya justru MENONAKTIFKAN rute dengan pesan "Rute berhasil diaktifkan"',
      langkah: ['Buka menu Jadwal Rute', `Cari rute ${RUTE} (kolom Aktivasi: "${status}")`, 'Klik ⋯ (Buka menu) di baris itu'],
      ekspektasi: 'Rute yang Aktif menampilkan "Nonaktifkan" (dan dialog/toast "dinonaktifkan")',
      aktual: `Menu menampilkan "${item}". Dari eksplorasi: dialog "Aktifkan Data? … akan diaktifkan kembali" → toast "Rute berhasil diaktifkan", tetapi rute menjadi Tidak Aktif`,
      cek: async () => expect(status === 'Aktif' ? item : 'Nonaktifkan').toBe('Nonaktifkan'),
      fokus: menu,
    });
    await page.keyboard.press('Escape');
  });

  test('[Temuan] RJ-T02 detail rute AKTIF seharusnya menampilkan "Aktifasi: Aktif"', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const statusDaftar = await p.sel(RUTE, 'Aktivasi');
    const d = await p.bukaDetail(RUTE);
    const statusDetail = await d.info('Aktifasi');
    await cekTemuan(page, {
      id: 'RJ-T02',
      judul: 'Status aktivasi di halaman detail rute berbeda dengan di daftar (selalu "Tidak Aktif")',
      langkah: ['Buka menu Jadwal Rute', `Cari rute ${RUTE}, lihat kolom Aktivasi`, 'Klik ⋯ → Edit Rute & Jadwal, lihat bagian Informasi'],
      ekspektasi: `"Aktifasi" di detail sama dengan daftar ("${statusDaftar}"); ejaan seharusnya "Aktivasi"`,
      aktual: `Daftar: "${statusDaftar}", detail: "Aktifasi ${statusDetail}"`,
      cek: async () => expect(statusDetail).toBe(statusDaftar),
      fokus: d.main.getByText('Aktifasi').first(),
    });
  });

  test('[Temuan] RJ-T03 pesan "wajib diisi" seharusnya hilang setelah kolomnya diisi', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.bukaTambah();
    await p.lanjut(); // munculkan pesan wajib
    await p.pilihPelabuhan(p.asal, ASAL);
    await p.pilihPelabuhan(p.tujuan, TUJUAN);
    await expect(p.kodeRute).not.toHaveValue('');
    const sisa = ['Pelabuhan asal wajib diisi', 'Pelabuhan tujuan wajib diisi', 'Kode rute wajib diisi'];
    const masihTampil: string[] = [];
    for (const s of sisa) if (await p.form.getByText(s).isVisible()) masihTampil.push(s);
    await cekTemuan(page, {
      id: 'RJ-T03',
      judul: 'Pesan "wajib diisi" tetap tampil walau kolomnya sudah terisi',
      langkah: [...LANGKAH_TAMBAH, 'Klik Berikutnya dengan form kosong (muncul 3 pesan wajib)', `Pilih Pelabuhan asal ${ASAL} dan tujuan ${TUJUAN} (kode rute terisi otomatis)`],
      ekspektasi: 'Pesan wajib pada kolom yang sudah diisi langsung hilang',
      aktual: masihTampil.length ? `Masih tampil: ${masihTampil.map((x) => `"${x}"`).join(', ')}` : 'Semua pesan hilang',
      cek: async () => expect(masihTampil).toEqual([]),
      fokus: p.form,
    });
  });

  test('[Temuan] RJ-T04 pencarian rute seharusnya juga bisa dengan nama pelabuhan [perlu konfirmasi]', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto();
    await p.cari.fill(ASAL);
    await expect(p.page).toHaveURL(/search=/);
    await p.tungguData();
    await p.page.waitForTimeout(1_000);
    const n = await p.totalData();
    await cekTemuan(page, {
      id: 'RJ-T04',
      judul: 'Kotak "Cari data..." di Jadwal Rute hanya mencari kode rute, tidak nama pelabuhan',
      langkah: ['Buka menu Jadwal Rute', `Ketik "${ASAL}" di kotak Cari data...`],
      ekspektasi: `Rute yang asal/tujuannya ${ASAL} (mis. ${RUTE}) tampil`,
      aktual: `Hasil pencarian: ${n} data${n === 0 ? ' ("Belum ada rute")' : ''}`,
      cek: async () => expect(n).toBeGreaterThan(0),
      fokus: p.tabel,
    });
  });
});

/* =========================================================================================
 * Daftar jadwal, menu rute (Duplikasi / Atur Tarif), Ubah rute, Ubah & Duplikasi jadwal,
 * tanggal mulai/akhir, alokasi kuota, transit — SEMUA DIBATALKAN, tidak ada yang disimpan.
 * ========================================================================================= */
test.describe('Rute & Jadwal — menu lain, ubah & duplikasi (tanpa menyimpan)', () => {
  async function detail(page: import('@playwright/test').Page) {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const d = await p.bukaDetail(RUTE);
    return { p, d };
  }

  /* ------------------------------ daftar jadwal ------------------------------ */

  test('[Positif] RJ-08 cari jadwal berdasarkan kode → hanya jadwal itu', async ({ page }) => {
    const { d } = await detail(page);
    await d.cari.fill(JADWAL_RO);
    await expect.poll(() => d.totalData()).toBe(1);
    await expect(d.baris(JADWAL_RO)).toHaveCount(1);
  });

  test('[Negatif] RJ-09 cari jadwal yang tidak ada → 0 data', async ({ page }) => {
    const { d } = await detail(page);
    await d.cari.fill('ZZZ-TIDAK-ADA');
    await expect.poll(() => d.totalData()).toBe(0);
  });

  test('[Positif] RJ-24 sort Jam Berangkat: naik lalu turun', async ({ page }) => {
    const { d } = await detail(page);
    let r = await d.sortJadwal('Jam Berangkat');
    if (r.arah !== 'ascending') r = await d.sortJadwal('Jam Berangkat');
    expect(r.arah).toBe('ascending');
    expect(r.nilai).toEqual([...r.nilai].sort());
    r = await d.sortJadwal('Jam Berangkat');
    expect(r.arah).toBe('descending');
    expect(r.nilai).toEqual([...r.nilai].sort().reverse());
  });

  test('[Positif] RJ-25 jadwal lebih dari 10 → Berikutnya menampilkan sisanya', async ({ page }) => {
    const { d } = await detail(page);
    const total = await d.totalData();
    test.skip(total <= 10, `Rute ${RUTE} hanya punya ${total} jadwal`);
    await d.btnBerikutnya.click();
    await expect(d.ringkasan).toHaveText(new RegExp(`Menampilkan 11-${Math.min(20, total)} dari ${total} data`));
    await expect(d.rows).toHaveCount(Math.min(10, total - 10));
  });

  /* ------------------------------ menu rute ------------------------------ */

  test('[Positif] RJ-26 menu ⋯ rute berisi Edit Rute & Jadwal, Duplikasi, Atur Tarif, Sembunyikan, Aktivasi, Hapus Data', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const items = await p.daftarAksi(RUTE);
    for (const x of ['Edit Rute & Jadwal', 'Duplikasi', 'Atur Tarif', 'Sembunyikan', 'Hapus Data']) expect(items).toContain(x);
    expect(items.some((x) => /^(Aktifkan|Nonaktifkan)$/.test(x))).toBe(true);
  });

  test('[Positif] RJ-27 Atur Tarif → halaman detail rute dengan tab "Tarif Dasar" terbuka', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    await p.aksi(RUTE, 'Atur Tarif');
    await expect(page).toHaveURL(/\/routes\/\d+\/schedules\?tab=tarif/);
    await expect(p.main.getByRole('tab', { name: 'Tarif Dasar' })).toHaveAttribute('aria-selected', 'true');
    await expect(p.main).toContainText(`(${RUTE})`);
  });

  test('[Positif] RJ-28 Duplikasi rute → form Tambah terisi pelabuhan & nama, kode kosong; [Negatif] lanjut tanpa kode → "Kode rute wajib diisi"', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    await p.aksi(RUTE, 'Duplikasi');
    await expect(p.form.getByRole('heading', { name: 'Tambah Data Rute' })).toBeVisible();
    await expect(p.asal).toContainText(ASAL);
    await expect(p.tujuan).toContainText(TUJUAN);
    await expect(p.namaRute).toHaveValue(`${ASAL} - ${TUJUAN}`);
    await expect(p.kodeRute).toHaveValue('');
    await p.lanjut();
    await expect(p.form.getByText('Kode rute wajib diisi')).toBeVisible();
    await expect(p.langkah()).toHaveText('1/3');
    await p.batalForm('Close');
  });

  test('[Edge] RJ-29 Duplikasi rute menyalin pengaturan langkah 2 (batas online sama dengan rute asal)', async ({ page }) => {
    const p = new RutePage(page);
    await p.goto({ search: RUTE });
    const asli = (await p.sel(RUTE, 'Batas Booking Online')).match(/-?\d+/)?.[0] ?? '';
    await p.aksi(RUTE, 'Duplikasi');
    await expect(p.kodeRute).toBeEditable();
    await p.kodeRute.fill('QA-DUP-CEK');
    await p.lanjut();
    await expect(p.langkah()).toHaveText('2/3');
    await expect(p.batasOnline).toHaveValue(asli);
    await p.batalForm('Close');
  });

  /* ------------------------------ ubah rute ------------------------------ */

  test('[Edge] RJ-43 Ubah rute lalu tutup tanpa mengubah apa pun → langsung tertutup tanpa konfirmasi', async ({ page }) => {
    const { p, d } = await detail(page);
    await d.btnUbahRute.click();
    await expect(p.kodeRute).toHaveValue(RUTE);
    expect(await d.batalForm('Close'), 'form tanpa perubahan tidak perlu konfirmasi batal').toBe(false);
  });

  test('[Negatif] RJ-44 Ubah rute: kode rute dikosongkan → "Kode rute wajib diisi", tetap di langkah 1', async ({ page }) => {
    const { p, d } = await detail(page);
    await d.btnUbahRute.click();
    await expect(p.kodeRute).toHaveValue(RUTE);
    await p.kodeRute.fill('');
    await d.lanjut();
    await expect(d.form.getByText('Kode rute wajib diisi')).toBeVisible();
    await expect(d.langkah()).toHaveText('1/3');
    await d.batalForm('Close');
  });

  test('[Negatif] RJ-45 Ubah rute: kapasitas operasional 0% → "Isi persen 1 sampai 100", tidak bisa lanjut', async ({ page }) => {
    const { p, d } = await detail(page);
    await d.btnUbahRute.click();
    await d.lanjut();
    await expect(d.langkah()).toHaveText('2/3');
    await p.kapasitas.fill('0');
    await d.lanjut();
    await expect(d.form.getByText('Isi persen 1 sampai 100')).toBeVisible();
    await expect(d.langkah()).toHaveText('2/3');
    await d.batalForm('Close');
  });

  /* ------------------------------ ubah & duplikasi jadwal ------------------------------ */

  test('[Positif] RJ-50 Edit Jadwal → form "Ubah Jadwal" 5 langkah berisi jam, kode, dan kapal jadwal itu', async ({ page }) => {
    const { d } = await detail(page);
    const jamDaftar = await d.sel(JADWAL_RO, 'Jam Berangkat');
    await d.bukaEditJadwal(JADWAL_RO);
    await expect(d.langkah()).toHaveText('1/5');
    await expect(d.kodeJadwal).toHaveValue(JADWAL_RO);
    await expect(d.jam).toHaveValue(jamDaftar);
    await d.keLangkah('2/5');
    await expect(d.kapalDefault).not.toHaveText(/Pilih/);
    await d.batalForm('Close');
  });

  test('[Negatif] RJ-51 Edit Jadwal: kode jadwal dikosongkan → ada pesan wajib, tetap di langkah 1', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.kodeJadwal.fill('');
    await d.lanjut();
    await expect.poll(async () => (await d.pesanForm()).join(' ')).toMatch(/kode/i);
    await expect(d.langkah()).toHaveText('1/5');
    await d.batalForm('Close');
  });

  test('[Negatif] RJ-52 Tanggal Akhir tidak bisa sebelum Tanggal Mulai; [Edge] tanggal yang sama boleh', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.pilihTanggal(d.tglMulai, '2027-05-10');
    await expect(d.tglMulai).toContainText('10 Mei 2027');
    const kunci = await d.tanggalTerkunci(d.tglAkhir, '2027-05');
    expect(kunci, 'tanggal 1–9 Mei harus terkunci').toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(kunci, 'tanggal 10 Mei (sama dengan mulai) boleh dipilih').not.toContain(10);
    expect(kunci).not.toContain(11);
    await d.batalForm('Close');
  });

  test('[Negatif] RJ-53 Tanggal Mulai tidak bisa setelah Tanggal Akhir', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.pilihTanggal(d.tglAkhir, '2027-05-20');
    await expect(d.tglAkhir).toContainText('20 Mei 2027');
    const kunci = await d.tanggalTerkunci(d.tglMulai, '2027-05');
    expect(kunci, 'tanggal 21–31 Mei harus terkunci').toEqual(expect.arrayContaining([21, 25, 31]));
    expect(kunci).not.toContain(20);
    expect(kunci).not.toContain(19);
    await d.batalForm('Close');
  });

  test('[Negatif] RJ-54 alokasi kuota: golongan I tipe Reserve tanpa nilai → "wajib diisi dan lebih dari 0", tetap di langkah 3', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.keLangkah('3/5');
    const gol = await d.golonganPertama(); // LMB-PGA-1500 kini pakai kapal QA WATER TAXI 01 (tanpa golongan I)
    await d.aturAlokasi(gol, 'Reserve');
    await d.lanjut();
    await expect(d.form.getByText(`Nilai alokasi golongan ${gol} wajib diisi dan lebih dari 0`)).toBeVisible();
    await expect(d.langkah()).toHaveText('3/5');
    await d.batalForm('Close');
  });

  test('[Positif] RJ-55 alokasi kuota: Reserve melebihi kuota kendaraan → tanda "Melebihi kuota" tampil', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.keLangkah('3/5');
    const gol = await d.golonganPertama(); // LMB-PGA-1500 kini pakai kapal QA WATER TAXI 01 (tanpa golongan I)
    await d.aturAlokasi(gol, 'Reserve', '9999');
    await expect(d.form.getByText('Melebihi kuota')).toBeVisible();
    await d.batalForm('Close');
  });

  test('[Positif] RJ-56 Duplikasi jadwal → jam disalin, kode otomatis "<kode>-2"', async ({ page }) => {
    const { d } = await detail(page);
    const jamDaftar = await d.sel(JADWAL_RO, 'Jam Berangkat');
    await d.bukaDuplikasiJadwal(JADWAL_RO);
    await expect(d.jam).toHaveValue(jamDaftar);
    await expect(d.kodeJadwal).toHaveValue(`${JADWAL_RO}-2`);
    await d.batalForm('Close');
  });

  test('[Positif] RJ-57 klik "n Transit" → dialog titik naik/turun: asal = Naik, tujuan = Turun; Simpan nonaktif tanpa perubahan', async ({ page }) => {
    const { d } = await detail(page);
    await d.btnTransit(JADWAL_RO).click();
    await expect(d.form.getByRole('heading', { name: `Transit Jadwal ${JADWAL_RO}` })).toBeVisible();
    await expect(d.form).toContainText(ASAL);
    await expect(d.form).toContainText(TUJUAN);
    await expect(d.btnForm('Simpan')).toBeDisabled();
    await d.batalForm('Batal');
  });

  /* ------------------------------ temuan ------------------------------ */

  test('[Temuan] RJ-T12 konfirmasi batal di form "Ubah Jadwal" seharusnya bukan "Batalkan Penambahan Data?"', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.pilihSemuaHari.click(); // ada perubahan → konfirmasi muncul
    await d.form.getByRole('button', { name: 'Close' }).click();
    await expect(d.konfirmasiBatal).toBeVisible();
    const judul = (await d.konfirmasiBatal.getByRole('heading').first().innerText()).trim();
    await cekTemuan(page, {
      id: 'RJ-T12',
      judul: 'Form "Ubah Jadwal" menampilkan konfirmasi "Batalkan Penambahan Data?" padahal sedang mengubah',
      langkah: [...LANGKAH_DETAIL, `Di jadwal ${JADWAL_RO} klik ⋯ → Edit Jadwal`, 'Ubah sesuatu (mis. hapus centang "Pilih semua" hari)', 'Klik X'],
      ekspektasi: 'Judul konfirmasi sesuai konteks, mis. "Batalkan Perubahan?"',
      aktual: `Judul konfirmasi: "${judul}"`,
      cek: async () => expect(judul).not.toMatch(/Penambahan/),
      fokus: d.konfirmasiBatal,
    });
    await d.konfirmasiBatal.getByRole('button', { name: 'Ya, Batalkan', exact: true }).click();
    await expect(d.form).toBeHidden();
  });

  test('[Temuan] RJ-T13 judul form duplikasi jadwal seharusnya bahasa Indonesia ("Duplikasi Jadwal")', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaDuplikasiJadwal(JADWAL_RO);
    const judul = (await d.form.getByRole('heading').first().innerText()).trim();
    await cekTemuan(page, {
      id: 'RJ-T13',
      judul: 'Judul form duplikasi jadwal memakai bahasa Inggris "Duplicate Jadwal" (menu bertuliskan "Duplikasi")',
      langkah: [...LANGKAH_DETAIL, `Di jadwal ${JADWAL_RO} klik ⋯ → Duplikasi`],
      ekspektasi: 'Judul "Duplikasi Jadwal", sama dengan nama menu',
      aktual: `Judul form: "${judul}"`,
      cek: async () => expect(judul).toBe('Duplikasi Jadwal'),
      fokus: d.form.getByRole('heading').first(),
    });
    await d.batalForm('Close');
  });
  test('[Temuan] RJ-T16 menu jadwal yang AKTIF seharusnya "Nonaktifkan", bukan "Aktifkan"', async ({ page }) => {
    const { d } = await detail(page);
    const status = await d.sel(JADWAL_RO, 'Aktivasi');
    const items = await d.daftarAksi(JADWAL_RO);
    const item = items.find((x) => /^(Aktifkan|Nonaktifkan)$/.test(x)) ?? '(tidak ada)';
    await cekTemuan(page, {
      id: 'RJ-T16',
      judul: 'Jadwal aktif menampilkan menu "Aktifkan" (sama seperti RJ-T01 di level rute)',
      langkah: [...LANGKAH_DETAIL, `Di jadwal ${JADWAL_RO} (kolom Aktivasi: "${status}") klik ⋯`],
      ekspektasi: 'Jadwal yang Aktif menampilkan "Nonaktifkan"',
      aktual: `Menu menampilkan "${item}"`,
      cek: async () => expect(status === 'Aktif' ? item : 'Nonaktifkan').toBe('Nonaktifkan'),
      fokus: d.baris(JADWAL_RO),
    });
  });
  /* ------------------------------ alokasi: Restrict, basis %, daftar jadwal lain ------------------------------ */

  test('[Positif] RJ-62 tipe Restrict → "Jika habis: Tolak (tidak ambil Normal)"; Reserve → "Ambil dari sisa Normal"', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.keLangkah('3/5');
    const gol = await d.golonganPertama(); // LMB-PGA-1500 kini pakai kapal QA WATER TAXI 01 (tanpa golongan I)
    await d.aturAlokasi(gol, 'Restrict');
    await expect(d.barisAlokasi(gol)).toContainText('Tolak (tidak ambil Normal)');
    await d.aturAlokasi(gol, 'Reserve');
    await expect(d.barisAlokasi(gol)).toContainText('Ambil dari sisa Normal');
    await d.batalForm('Close');
  });

  test('[Negatif] RJ-63 tipe Restrict tanpa nilai → pesan wajib diisi, tetap di langkah 3', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.keLangkah('3/5');
    const gol = await d.golonganPertama(); // LMB-PGA-1500 kini pakai kapal QA WATER TAXI 01 (tanpa golongan I)
    await d.aturAlokasi(gol, 'Restrict');
    await d.lanjut();
    await expect(d.form.getByText(new RegExp(`Nilai alokasi golongan ${gol} wajib diisi`))).toBeVisible();
    await expect(d.langkah()).toHaveText('3/5');
    await d.batalForm('Close');
  });

  test('[Negatif] RJ-64 basis % dengan nilai 150 → "Nilai persen golongan I maksimal 100"; [Edge] 100 → pesan hilang', async ({ page }) => {
    const { d } = await detail(page);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.keLangkah('3/5');
    const gol = await d.golonganPertama(); // LMB-PGA-1500 kini pakai kapal QA WATER TAXI 01 (tanpa golongan I)
    await d.aturAlokasi(gol, 'Restrict');
    await d.aturBasis(gol, '%');
    await d.nilaiAlokasi(gol).fill('150');
    await d.lanjut();
    await expect(d.form.getByText(`Nilai persen golongan ${gol} maksimal 100.`)).toBeVisible();
    await expect(d.langkah()).toHaveText('3/5');
    await d.nilaiAlokasi(gol).fill('100');
    await d.lanjut();
    await expect(d.form.getByText(`Nilai persen golongan ${gol} maksimal 100.`)).toHaveCount(0);
    await d.batalForm('Close');
  });

  test('[Temuan] RJ-T17 pilihan "Terapkan juga ke jadwal lain" seharusnya berisi SEMUA jadwal rute, bukan hanya halaman pertama', async ({ page }) => {
    const { d } = await detail(page);
    const total = await d.totalData();
    test.skip(total <= 10, `Rute ${RUTE} hanya punya ${total} jadwal (masalah hanya terlihat bila > 10)`);
    await d.bukaEditJadwal(JADWAL_RO);
    await d.keLangkah('3/5');
    const pilihan = d.form.getByRole('checkbox', { name: new RegExp(`^${RUTE}-\\d{4} · `) });
    const n = await pilihan.count();
    await cekTemuan(page, {
      id: 'RJ-T17',
      judul: 'Daftar "Terapkan juga ke jadwal lain" (dan "Salin dari") hanya berisi jadwal di halaman pertama tabel',
      langkah: [...LANGKAH_DETAIL, `Rute punya ${total} jadwal (tabel 10 per halaman)`, `Jadwal ${JADWAL_RO} → ⋯ → Edit Jadwal → Selanjutnya ke langkah 3`, 'Lihat bagian "Terapkan juga ke jadwal lain"'],
      ekspektasi: `${total - 1} jadwal lain bisa dipilih`,
      aktual: `Hanya ${n} jadwal yang bisa dipilih`,
      cek: async () => expect(n).toBe(total - 1),
      fokus: d.form.getByText(/Terapkan juga ke jadwal lain/),
    });
    await d.batalForm('Close');
  });
});
/* ------------------- DAMPAK ke web Ferizy (hanya membaca CMS & web) ------------------- */
type BerangkatCms = { kode: string; jam: string; kapal: string; kuota: number; aktif: boolean; online: boolean };

/** Keberangkatan rute LMB-PGA (route id KA.ruteId) pada tanggal `tgl` dari menu Keberangkatan & Alokasi. */
async function keberangkatanCms(page: import('@playwright/test').Page, tgl: string): Promise<BerangkatCms[]> {
  const list = new KeberangkatanListPage(page);
  await list.gotoTanggal(tgl);
  const hasil: BerangkatCms[] = [];
  for (const r of await list.rows.filter({ has: page.getByRole('link') }).all()) {
    const kode = (await r.getByRole('link').first().innerText()).trim();
    const td = r.locator('td');
    const jadwal = (await td.nth(2).innerText()).trim().split('\n').map((x) => x.trim());
    hasil.push({
      kode,
      jam: jadwal.find((x) => /^\d{2}:\d{2}$/.test(x)) ?? kode.slice(-4, -2) + ':' + kode.slice(-2),
      kapal: (await td.nth(3).innerText()).trim().split('\n')[0].trim(),
      kuota: firstInt(await td.nth(4).innerText()),
      aktif: (await list.switchAktif(kode).getAttribute('aria-checked')) === 'true',
      online: (await list.btnOnline(kode).getAttribute('aria-pressed')) === 'true',
    });
  }
  return hasil;
}

test.describe('Rute & Jadwal — dampak ke web Ferizy', () => {
  const TGL = process.env.KP_TGL_WEB ?? tglDepan(11);
  const LANGKAH_WEB = [`CMS → Keberangkatan & Alokasi → rute ${ASAL} - ${TUJUAN}, tanggal ${TGL}`, `Web Ferizy → cari ${ASAL} → ${TUJUAN} tanggal ${TGL}`];

  test('[Dampak] RJ-70 jadwal di web = keberangkatan Aktif + Online di CMS (jumlah, jam, kapal)', async ({ page, browser }) => {
    const cms = (await keberangkatanCms(page, TGL)).filter((k) => k.aktif && k.online);
    const { ctx, web } = await bukaWeb(browser);
    try {
      const kartu = await jadwalWeb(web, '49', '67', TGL);
      const jamWeb = kartu.map((k) => k.jam);
      const beda: string[] = [];
      for (const c of cms) {
        const k = kartu.find((x) => x.jam === c.jam);
        if (!k) beda.push(`${c.kode} (${c.jam}) tidak tampil di web`);
        else if (k.kapal !== c.kapal) beda.push(`${c.jam}: kapal web "${k.kapal}" ≠ CMS "${c.kapal}"`);
      }
      for (const j of jamWeb) if (!cms.some((c) => c.jam === j)) beda.push(`${j} ada di web tapi tidak Aktif/Online di CMS`);
      await cekTemuan(web, {
        id: 'RJ-T20',
        judul: 'Daftar jadwal di web tidak sama dengan keberangkatan Aktif & Online di CMS',
        langkah: [...LANGKAH_WEB, 'Bandingkan jam & nama kapal'],
        ekspektasi: `${cms.length} jadwal (${cms.map((c) => c.jam).join(', ')}) dengan kapal yang sama`,
        aktual: `Web ${kartu.length} jadwal. ${beda.join('; ')}`,
        cek: async () => expect(beda).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });

  test('[Dampak] RJ-73 "Tiket tersedia (N)" di web = Kuota keberangkatan di CMS (belum ada penjualan)', async ({ page, browser }) => {
    const cms = (await keberangkatanCms(page, TGL)).filter((k) => k.aktif && k.online);
    const { ctx, web } = await bukaWeb(browser);
    try {
      const kartu = await jadwalWeb(web, '49', '67', TGL);
      test.skip(kartu.length === 0, `Tidak ada jadwal di web untuk ${TGL}`);
      const beda = cms
        .map((c) => ({ c, k: kartu.find((x) => x.jam === c.jam) }))
        .filter(({ c, k }) => k && k.tersedia !== c.kuota)
        .map(({ c, k }) => `${c.jam}: web ${k!.tersedia}, CMS ${c.kuota}`);
      await cekTemuan(web, {
        id: 'RJ-T21',
        judul: 'Sisa tiket di web berbeda dengan kuota keberangkatan di CMS',
        langkah: [...LANGKAH_WEB, 'Bandingkan "Tiket tersedia (N)" dengan kolom Kuota'],
        ekspektasi: 'Angka sama untuk setiap jam',
        aktual: beda.join('; '),
        cek: async () => expect(beda).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });

  test('[Edge] RJ-75 hari ini: jadwal yang jam berangkatnya sudah lewat batas penjualan online tidak dijual di web', async ({ page, browser }) => {
    const r = new RutePage(page);
    await r.goto({ search: RUTE });
    const d = await r.bukaDetail(RUTE);
    const batas = firstInt((await d.info('Batas online')) || '0') || 0; // menit sebelum berangkat
    const tgl = tglDepan(0);
    const { ctx, web } = await bukaWeb(browser);
    try {
      const kartu = await jadwalWeb(web, '49', '67', tgl);
      test.skip(kartu.length === 0, 'Tidak ada jadwal di web hari ini');
      const wita = new Date(Date.now() + 8 * 3_600_000); // jam sekarang di WITA (Lembar)
      const sekarang = wita.getUTCHours() * 60 + wita.getUTCMinutes();
      const lewat = kartu.filter((k) => {
        const [h, m] = k.jam.split(':').map(Number);
        return h * 60 + m - sekarang < batas;
      }).map((k) => k.jam);
      await cekTemuan(web, {
        id: 'RJ-T22',
        judul: 'Jadwal yang sudah lewat batas penjualan online masih dijual di web',
        langkah: [`CMS → Jadwal Rute → ${RUTE}: batas online ${batas} menit`, `Web Ferizy → ${ASAL} → ${TUJUAN} hari ini (${tgl})`],
        ekspektasi: `Hanya jadwal yang berangkat ≥ ${batas} menit dari sekarang (WITA) yang tampil`,
        aktual: `Masih tampil: ${lewat.join(', ')}`,
        cek: async () => expect(lewat).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });
});
