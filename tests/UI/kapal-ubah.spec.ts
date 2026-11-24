import { test, expect, type BrowserContextOptions, type Page } from '@playwright/test';
import { KapalPage, acak, bersihkanKapalQA, cariKapalAPI, detailKapalAPI, kartuFerizy, tglDepan, type DataKapal } from './pages/kapal.pages';
import { buatKapalQA } from './pages/golongan.pages';
import { RutePage } from './pages/rute.pages';
import { cekTemuan, angkaID } from './pages/kapasitas.pages';

/**
 * MASTER DATA — KAPAL — MENGUBAH DATA (butuh ALLOW_WRITE=1)
 * Hanya kapal uji milik QA (kode diawali "QAKP" + acak), dibuat lewat layar/API dan SELALU dibersihkan
 * di awal & akhir. Kapal asli tidak disentuh.
 * Pengecualian: KP-49 mengganti NAMA kapal QA "QAWTAXI01" sementara (untuk cek web) lalu dikembalikan.
 * Dampak yang diuji: pilihan "Kapal default" di form Jadwal (rute LMB-PGA, tidak disimpan) & web Ferizy.
 * ID: KP-4x, KP-T08..
 */

test.describe.configure({ mode: 'serial' });
test.skip(process.env.ALLOW_WRITE !== '1', 'Set ALLOW_WRITE=1 untuk menjalankan test yang mengubah data');

const AWALAN = 'QAKP';
const KODE = AWALAN + acak(4);
const NAMA = `QA AUTO KAPAL ${KODE}`;
const NAMA_BARU = `QA AUTO KAPAL & 'UJI' #${KODE.slice(-2)}`; // edge: karakter khusus
const RUTE = process.env.RJ_RUTE_KODE ?? 'LMB-PGA';
// IMO acak per run: IMO kapal yang sudah dihapus tetap terkunci (soft delete) → tidak bisa dipakai ulang
const IMO = String(1_000_000 + Math.floor(Math.random() * 9_000_000));
const KAPAL_WEB =process.env.KP_KAPAL_WEB ?? 'QAWTAXI01'; // kapal QA yang dipakai jadwal LMB-PGA-1500
const DATA: DataKapal = {
  kode: KODE, nama: NAMA, jenis: 'Water Taxi', grt: '150,5', imo: IMO, tahun: '2015',
  perusahaan: 'PT. Dharma Lautan Utama', pelabuhan: 'LEMBAR',
  abk: '6', pelampung: '120', noSkkp: 'QA-SKKP-' + KODE, maksSkkp: '100', skkpSampai: '2030-12-31',
  kuota: { EKONOMI: '60', BISNIS: '20' },
  totalSup: '12', golongan: { 'Mobil Penumpang': '2', 'Sepeda Motor (<500cc)': '10' },
  barang: { 'Hewan ternak': '0' },
};
let dibuat = false;
let dihapus = false;

async function apiCtx(playwright: any) {
  const u = test.info().project.use as BrowserContextOptions & { baseURL?: string };
  return playwright.request.newContext({ baseURL: u.baseURL, storageState: u.storageState as string });
}
test.beforeAll(async ({ playwright }) => {
  const req = await apiCtx(playwright);
  try { await bersihkanKapalQA(req, AWALAN); } finally { await req.dispose(); }
});
test.afterAll(async ({ playwright }) => {
  const req = await apiCtx(playwright);
  try { await bersihkanKapalQA(req, AWALAN); } finally { await req.dispose(); }
});

/** Opsi "Kapal default" di form Tambah Jadwal rute LMB-PGA yang cocok dengan `cari` (form DITUTUP tanpa menyimpan). */
async function opsiKapalJadwal(page: Page, cari: string) {
  const r = new RutePage(page);
  await r.goto({ search: RUTE });
  const d = await r.bukaDetail(RUTE);
  await d.bukaFormJadwal();
  await d.ketikJam(d.jam, '2345');
  await d.pilihDiCombobox(d.unitBisnis, 'Travel', 'Travel / Shuttle');
  await d.lanjut();
  await expect(d.langkah()).toHaveText('2/5');
  await expect(async () => {
    if (!(await d.popover.isVisible())) await d.kapalDefault.click();
    await expect(d.popover).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  await d.popover.locator('input').first().fill(cari);
  await page.waitForTimeout(1_500);
  const opsi = (await d.popover.getByRole('option').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.includes(cari));
  await page.keyboard.press('Escape');
  await expect(d.popover).toBeHidden();
  await d.batalForm('Close');
  return opsi;
}

test.describe('Kapal — siklus data uji', () => {
  test('[Positif] KP-40 Tambah kapal lengkap 5 langkah → muncul di daftar dengan nilai yang benar & Aktif', async ({ page, request }) => {
    const p = new KapalPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.tambah(DATA);
    dibuat = true;
    await expect.poll(async () => { await p.goto(); return p.totalData(); }).toBe(awal + 1);
    await p.goto({ search: KODE });
    await expect(p.baris(KODE)).toHaveCount(1);
    expect(await p.sel(KODE, 'Nama Kapal')).toBe(NAMA);
    expect(await p.sel(KODE, 'Jenis Kapal')).toBe('Water Taxi');
    expect(angkaID(await p.sel(KODE, 'GRT'))).toBe(150.5);
    expect(await p.sel(KODE, 'IMO')).toBe(IMO);
    expect(angkaID(await p.sel(KODE, 'ABK'))).toBe(6);
    expect(angkaID(await p.sel(KODE, 'Pelampung'))).toBe(120);
    expect(angkaID(await p.sel(KODE, 'Kap. Penumpang'))).toBe(80); // 60 + 20
    expect(angkaID(await p.sel(KODE, 'Kap. SUP'))).toBe(12);
    expect(await p.sel(KODE, 'SKKP s.d.')).toContain('2030');
    expect(await p.sel(KODE, 'Status')).toBe('Aktif');
    // detail tersimpan (golongan & barang)
    const v = await detailKapalAPI(request, KODE);
    const gol = Object.fromEntries((v.vehicle_classes ?? []).map((g: any) => [g.name, Number(g.qty)]));
    expect(gol['Mobil Penumpang']).toBe(2);
    expect(gol['Sepeda Motor (<500cc)']).toBe(10);
    const ternak = (v.cargo_capacities ?? []).find((c: any) => /Hewan ternak/i.test(JSON.stringify(c)));
    expect(ternak, 'batas "Hewan ternak" = 0 tersimpan').toBeTruthy();
  });

  test('[Dampak] KP-41 kapal baru (Aktif, pangkalan Lembar) muncul di pilihan "Kapal default" form Jadwal rute LMB-PGA', async ({ page }) => {
    test.skip(!dibuat, 'KP-40 gagal');
    expect(await opsiKapalJadwal(page, NAMA)).toHaveLength(1);
  });

  test('[Negatif] KP-42 kode kapal yang sudah dipakai → ditolak, tidak ada data ganda', async ({ page }) => {
    test.skip(!dibuat, 'KP-40 gagal');
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ ...DATA, nama: NAMA + ' DUP' });
    await p.lanjut();
    await page.waitForTimeout(1_000);
    let pesan = '';
    if ((await p.langkah().innerText()).trim() === '1/5') {
      pesan = (await p.pesan()).join(' / ');
    } else {
      // tidak dicegat di langkah 1 → lanjut sampai simpan, server harus menolak
      await p.isiLangkah2(DATA); await p.lanjutKe('3/5');
      await p.isiLangkah3(DATA); await p.lanjutKe('4/5');
      await p.isiLangkah4({ totalSup: '5' }); await p.lanjutKe('5/5');
      pesan = await p.simpan();
    }
    expect(pesan).toMatch(/sudah ada|sudah digunakan|duplikat|exists/i);
    await p.tutupForm();
    await p.goto({ search: KODE });
    await expect.poll(() => p.totalData()).toBe(1);
    expect(await p.sel(KODE, 'Nama Kapal')).toBe(NAMA);
  });

  test('[Positif] KP-43 Ubah nama (karakter khusus), GRT & kuota → tabel ikut berubah; [Edge] nama dengan & \' # tersimpan utuh', async ({ page }) => {
    test.skip(!dibuat, 'KP-40 gagal');
    const p = new KapalPage(page);
    await p.goto({ search: KODE });
    const hasil = await p.ubah(KODE, { nama: NAMA_BARU, grt: '200', kuota: { EKONOMI: '70' } });
    expect(hasil).toMatch(/berhasil/i);
    await expect(p.form).toBeHidden();
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Nama Kapal')).toBe(NAMA_BARU);
    expect(angkaID(await p.sel(KODE, 'GRT'))).toBe(200);
    expect(angkaID(await p.sel(KODE, 'Kap. Penumpang'))).toBe(90); // 70 + 20
  });

  test('[Negatif] KP-44 Ubah lalu Batal (X) → konfirmasi → Ya, Batalkan → data tidak berubah', async ({ page }) => {
    test.skip(!dibuat, 'KP-40 gagal');
    const p = new KapalPage(page);
    await p.goto({ search: KODE });
    await p.bukaUbah(KODE);
    await p.nama.fill('QA SEHARUSNYA TIDAK TERSIMPAN');
    expect(await p.batalForm('Close', 'Ya, Batalkan')).toBe(true);
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Nama Kapal')).toBe(NAMA_BARU);
  });

  test('[Dampak] KP-45 Nonaktifkan → status Nonaktif & hilang dari "Kapal default" Jadwal; Aktifkan → muncul lagi', async ({ page }) => {
    test.skip(!dibuat, 'KP-40 gagal');
    const p = new KapalPage(page);
    await p.goto({ search: KODE });
    await p.ubahStatus(KODE, false);
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Status')).toBe('Nonaktif');
    expect(await p.daftarAksi(KODE)).toContain('Aktifkan');
    const saatNonaktif = await opsiKapalJadwal(page, NAMA_BARU);
    await p.goto({ search: KODE });
    await p.ubahStatus(KODE, true);
    await p.goto({ search: KODE });
    expect(await p.sel(KODE, 'Status')).toBe('Aktif');
    expect(saatNonaktif, 'kapal Nonaktif tidak boleh bisa dipilih di jadwal').toHaveLength(0);
    expect(await opsiKapalJadwal(page, NAMA_BARU), 'aktif lagi → bisa dipilih').toHaveLength(1);
  });

  test('[Positif] KP-46 Hapus Data → hilang dari daftar; [Dampak] tidak bisa dipilih lagi di Jadwal', async ({ page }) => {
    test.skip(!dibuat, 'KP-40 gagal');
    const p = new KapalPage(page);
    await p.goto({ search: KODE });
    await p.hapusKapal(KODE);
    dihapus = true;
    await p.goto({ search: KODE });
    await expect.poll(() => p.totalData()).toBe(0);
    expect(await opsiKapalJadwal(page, NAMA_BARU)).toHaveLength(0);
  });

  test('[Temuan] KP-T08 kode kapal yang sudah dihapus seharusnya bisa dipakai lagi [perlu konfirmasi]', async ({ page }) => {
    test.skip(!dihapus, 'KP-46 gagal');
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(DATA);
    await p.lanjut();
    await page.waitForTimeout(1_000);
    let hasil: string;
    if ((await p.langkah().innerText()).trim() === '1/5') {
      hasil = `Ditolak di langkah 1: ${(await p.pesan()).join(' / ')}`;
    } else {
      await p.isiLangkah2(DATA); await p.lanjutKe('3/5');
      await p.isiLangkah3(DATA); await p.lanjutKe('4/5');
      await p.isiLangkah4({ totalSup: '5' }); await p.lanjutKe('5/5');
      hasil = await p.simpan();
    }
    await p.tutupForm();
    await cekTemuan(page, {
      id: 'KP-T08',
      judul: 'Kode kapal & nomor IMO dari kapal yang sudah dihapus tidak bisa dipakai lagi (terkunci soft delete)',
      langkah: ['Menu Kapal → Tambah kapal kode ' + KODE + ' → Simpan', '⋯ → Hapus Data', 'Tambah lagi kapal dengan kode yang sama'],
      ekspektasi: 'Kode bisa dipakai lagi (data lama sudah dihapus), atau ada pilihan memulihkan data dari "Sampah"',
      aktual: hasil,
      cek: async () => expect(hasil).toMatch(/berhasil/i),
      fokus: p.toast.first(),
    });
  });

  test('[Positif] KP-47 Hapus massal 2 kapal uji (Pilih semua → Hapus (2)) → keduanya hilang', async ({ page, request }) => {
    const awalan = AWALAN + 'M' + acak(2);
    const kode = [awalan + '1', awalan + '2'];
    for (const k of kode) await buatKapalQA(request, k, 'IVA', KAPAL_WEB);
    const p = new KapalPage(page);
    await p.goto({ search: awalan });
    await expect.poll(() => p.totalData()).toBe(2);
    await p.tabel.getByRole('checkbox', { name: 'Pilih semua' }).check();
    await expect(p.btnHapusMassal).toHaveText('Hapus (2)');
    await p.btnHapusMassal.click();
    await expect(p.konfirmasi).toContainText(kode[0]);
    await p.konfirmasiKlik(/^(Hapus|Ya.*)$/);
    await p.expectToast(/berhasil/i);
    await p.goto({ search: awalan });
    await expect.poll(() => p.totalData()).toBe(0);
    expect(await cariKapalAPI(request, awalan)).toHaveLength(0);
  });
});

test.describe('Kapal — dampak ke web Ferizy', () => {
  test('[Dampak] KP-49 ganti nama kapal di CMS → nama di web Ferizy ikut berubah (nama dikembalikan setelahnya)', async ({ page, browser, request }) => {
    test.setTimeout(300_000);
    const v = await detailKapalAPI(request, KAPAL_WEB);
    test.skip(!v, `Kapal ${KAPAL_WEB} tidak ada`);
    const asli = v.vessel_name as string;
    const baru = `${asli} QA`;
    const tgl = process.env.KP_TGL_WEB ?? tglDepan(11);
    const p = new KapalPage(page);
    const ctx = await browser.newContext({ storageState: undefined });
    const web = await ctx.newPage();
    try {
      await p.goto({ search: KAPAL_WEB });
      expect(await p.ubah(KAPAL_WEB, { nama: baru })).toMatch(/berhasil/i);
      let kartu: string[] = [];
      for (let i = 0; i < 3; i++) { // beri waktu sinkron (maks ±1 menit)
        kartu = await kartuFerizy(web, '49', '67', tgl);
        if (kartu.some((k) => k.includes(baru))) break;
        await web.waitForTimeout(20_000);
      }
      const tampil = kartu.find((k) => k.includes(asli)) ?? '';
      await cekTemuan(web, {
        id: 'KP-T09',
        judul: 'Perubahan nama kapal di CMS tidak tersinkron ke web Ferizy',
        langkah: [`CMS → Kapal → ${KAPAL_WEB} → Ubah Data → nama "${baru}" → Simpan`, `Web Ferizy → Lembar → Padang Bai tanggal ${tgl} (tunggu ±1 menit)`],
        ekspektasi: `Kartu jadwal menampilkan nama baru "${baru}"`,
        aktual: kartu.some((k) => k.includes(baru)) ? 'Sudah berubah' : `Masih "${asli}"${tampil ? '' : ' / kapal tidak tampil'}`,
        cek: async () => expect(kartu.some((k) => k.includes(baru))).toBe(true),
      });
    } finally {
      await ctx.close();
      await p.goto({ search: KAPAL_WEB });
      expect(await p.ubah(KAPAL_WEB, { nama: asli }), 'nama kapal dikembalikan').toMatch(/berhasil/i);
      const akhir = await detailKapalAPI(request, KAPAL_WEB);
      expect(akhir.vessel_name).toBe(asli);
      // pastikan simpan lewat form tidak mengubah data lain kapal ini (kuota kelas & golongan)
      const ringkas = (x: any) => JSON.stringify({
        kuota: (x.class_quotas ?? []).map((c: any) => [c.service_id, Number(c.quota)]).sort(),
        gol: (x.vehicle_classes ?? []).map((g: any) => [g.code, Number(g.qty)]).sort(),
        sup: Number(x.vehicle_capacity_sup), abk: x.crew_count, pel: x.lifejacket_count,
      });
      expect(ringkas(akhir), 'data lain kapal tidak berubah').toBe(ringkas(v));
    }
  });
});
