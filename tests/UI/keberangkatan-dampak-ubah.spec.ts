import { test, expect } from '@playwright/test';
import {
  DATA,
  KeberangkatanListPage,
  DetailKeberangkatanPage,
  TemplateAlokasiPage,
  FerizyPage,
} from './pages/kapasitas.pages';

/**
 * DAMPAK LINTAS HALAMAN dari Keberangkatan & Alokasi (MENGUBAH DATA → butuh ALLOW_WRITE=1)
 *
 *  KA-X01..02  Alokasi Kuota Jadwal (template)  ↔  keberangkatan yang sudah ada
 *  KA-X10..13  Web reservasi Ferizy             ↔  Aktif/Nonaktif & Online/Offline
 *
 * Test Ferizy hanya jalan kalau FERIZY_READY=1 dan FERIZY_ASAL / FERIZY_TUJUAN diisi
 * (ambil dari URL Ferizy setelah mencari Merak → Bakauheni: ...?asal=XX&tujuan=YY&tgl=...).
 */

test.describe.configure({ mode: 'serial' });

test.describe('Dampak ke Alokasi Kuota Jadwal (template)', () => {
  // CATATAN: halaman Template ternyata mengubah keberangkatan HARI INI (lihat TA-T10 di template-alokasi-ubah.spec.ts).
  // Test ini hanya membuktikan keberangkatan tanggal LAIN (DATA.tanggalUji) tidak ikut berubah.
  test('[Positif] KA-X01 ubah template jadwal TIDAK mengubah keberangkatan tanggal lain (tanggal uji)', async ({ page }) => {
    // Aturan di layar template: "Dipakai saat keberangkatan baru dibuat; keberangkatan yang sudah ada tidak berubah."
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    let d = await list.bukaDetail(DATA.jadwalA);
    await d.bukaTab('Alokasi');
    const mitraKeberangkatan = await d.inputMitra(DATA.kelas).inputValue();
    const detailUrl = page.url();

    const tpl = new TemplateAlokasiPage(page);
    await tpl.buka(DATA.rute, DATA.jadwalA);
    const awalTpl = await tpl.inputMitra(DATA.kelas).inputValue();
    try {
      await tpl.isiMitra(DATA.kelas, String(Number(awalTpl) + 1));
      await tpl.simpanAlokasi();
      await expect(tpl.toast.filter({ hasText: /berhasil/i }).first()).toBeVisible();

      await page.goto(detailUrl);
      d = new DetailKeberangkatanPage(page);
      await d.bukaTab('Alokasi');
      await expect(d.inputMitra(DATA.kelas)).toHaveValue(mitraKeberangkatan);
    } finally {
      await tpl.buka(DATA.rute, DATA.jadwalA);
      if ((await tpl.inputMitra(DATA.kelas).inputValue()) !== awalTpl) {
        await tpl.isiMitra(DATA.kelas, awalTpl);
        await tpl.simpanAlokasi();
        await expect(tpl.toast.filter({ hasText: /berhasil/i }).first()).toBeVisible();
      }
    }
  });

  test('[Negatif] KA-X02 template: Mitra melebihi kuota kelas → ditolak', async ({ page }) => {
    const tpl = new TemplateAlokasiPage(page);
    await tpl.buka(DATA.rute, DATA.jadwalA);
    const awal = await tpl.inputMitra(DATA.kelas).inputValue();
    try {
      await tpl.isiMitra(DATA.kelas, String((await tpl.kuotaKelas(DATA.kelas)) + 50));
      await tpl.simpanAlokasi();
      await expect(tpl.toast.filter({ hasText: /gagal/i }).first()).toBeVisible();
    } finally {
      await tpl.buka(DATA.rute, DATA.jadwalA);
      if ((await tpl.inputMitra(DATA.kelas).inputValue()) !== awal) {
        await tpl.isiMitra(DATA.kelas, awal);
        await tpl.simpanAlokasi();
      }
    }
  });
});

test.describe('Dampak ke web reservasi Ferizy', () => {
  test.skip(!DATA.ferizySiap || !DATA.ferizyAsal || !DATA.ferizyTujuan,
    'Set FERIZY_READY=1, FERIZY_ASAL, FERIZY_TUJUAN di .env setelah integrasi reservasi siap');

  test('[Positif] KA-X10 keberangkatan Aktif + Online di CMS → muncul di pencarian Ferizy', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    await list.centangFilter('Online');
    await list.tutupPopover();
    const onlineDiCms = await list.totalData();
    const ferizy = new FerizyPage(page);
    expect(await ferizy.jumlahJadwal(DATA.tanggalUji)).toBe(onlineDiCms);
  });

  test('[Positif] KA-X11 Set Offline di CMS → hilang dari Ferizy; Online lagi → muncul lagi', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    const ferizy = new FerizyPage(page);
    const awal = await ferizy.jumlahJadwal(DATA.tanggalUji);
    try {
      await list.gotoTanggal(DATA.tanggalUji);
      await list.setOnline(DATA.jadwalA, false);
      await expect.poll(() => ferizy.jumlahJadwal(DATA.tanggalUji), { timeout: 60_000 }).toBe(awal - 1);
    } finally {
      await list.gotoTanggal(DATA.tanggalUji);
      await list.setOnline(DATA.jadwalA, true);
    }
    await expect.poll(() => ferizy.jumlahJadwal(DATA.tanggalUji), { timeout: 60_000 }).toBe(awal);
  });

  test('[Positif] KA-X12 Nonaktifkan di CMS → hilang dari Ferizy; Aktifkan → muncul lagi', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    const ferizy = new FerizyPage(page);
    const awal = await ferizy.jumlahJadwal(DATA.tanggalUji);
    try {
      await list.gotoTanggal(DATA.tanggalUji);
      await list.setAktif(DATA.jadwalA, false, 'QA cek dampak Ferizy');
      await expect.poll(() => ferizy.jumlahJadwal(DATA.tanggalUji), { timeout: 60_000 }).toBe(awal - 1);
    } finally {
      await list.gotoTanggal(DATA.tanggalUji);
      await list.setAktif(DATA.jadwalA, true, 'QA restore');
    }
    await expect.poll(() => ferizy.jumlahJadwal(DATA.tanggalUji), { timeout: 60_000 }).toBe(awal);
  });

  test('[Edge] KA-X13 kapasitas diturunkan di CMS → sisa kuota di Ferizy ikut turun', async ({ page }) => {
    test.fixme(true, 'Butuh selector kartu jadwal & teks "sisa kuota" di Ferizy — lengkapi setelah halaman hasil reservasi final');
  });
});