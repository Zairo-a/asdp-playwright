import { test, expect } from '@playwright/test';
import { DATA, KeberangkatanListPage, MasterKapalPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — Kapal override harian (READ-ONLY, tidak menyimpan)
 * Halaman: detail keberangkatan → tab Kapasitas Operasional → dropdown "Kapal (override harian)"
 * ID: KA-K0x
 */

test.describe('Keberangkatan — Kapal override (read-only)', () => {
  test('[Positif] KA-K01 dropdown Kapal hanya berisi kapal AKTIF dari master Kapal', async ({ page }) => {
    const master = await new MasterKapalPage(page).daftar();
    const aktif = master.filter((k) => /^Aktif$/i.test(k.status)).map((k) => `${k.nama} (${k.kode})`);
    const nonaktif = master.filter((k) => !/^Aktif$/i.test(k.status)).map((k) => `${k.nama} (${k.kode})`);

    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.kapal.click();
    await expect(d.popover.getByRole('option').first()).toBeVisible();
    const opsi = (await d.popover.getByRole('option').allInnerTexts()).map((x) => x.trim());
    await page.keyboard.press('Escape');

    expect(opsi[0]).toContain('Pakai kapal default jadwal');
    const opsiKapal = opsi.slice(1);
    for (const n of nonaktif) expect(opsiKapal, `kapal nonaktif "${n}" tidak boleh muncul`).not.toContain(n);
    for (const a of opsiKapal) expect(aktif, `opsi "${a}" harus kapal aktif di master`).toContain(a);
  });

  test('[Positif] KA-K02 ganti kapal tanpa Simpan → angka belum berubah; Batal mengembalikan kapal default', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    const d = await list.bukaDetail(DATA.jadwalA);
    const kapalAwal = await d.kapalTerpilih();
    const totalAwal = await d.totalKuota();
    await expect(d.btnSimpan).toBeDisabled();

    await d.pilihKapal(DATA.kapalUji, new RegExp('^' + DATA.kapalUji));
    await expect(d.kapal).toContainText(DATA.kapalUji);
    await expect(d.btnSimpan).toBeEnabled();
    expect(await d.totalKuota()).toBe(totalAwal); // belum disimpan → belum berubah

    await d.btnBatal.click();
    await expect(d.kapal).toHaveText(kapalAwal);
    await expect(d.btnSimpan).toBeDisabled();
  });

  test('[Negatif] KA-K03 cari kapal yang tidak ada → tidak ada opsi', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.kapal.click();
    await d.popover.getByPlaceholder('Cari kapal').fill('ZZZ-KAPAL-TIDAK-ADA');
    await expect(d.popover.getByRole('option')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('[Positif] KA-K04 kapasitas fisik = min(SKKP − ABK, pelampung) sesuai keterangan di layar', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    const d = await list.bukaDetail(DATA.jadwalA);
    const r = await d.rumusFisik();
    expect(await d.kapasitasFisik()).toBe(Math.min(r.skkp - r.abk, r.pelampung));
  });

  test('[Temuan] KA-K05 kapasitas fisik di keberangkatan seharusnya sama dengan "Kap. Penumpang" di master Kapal [perlu konfirmasi]', async ({ page }) => {
    // 1. Baca master Kapal DULU, supaya halaman terakhir (untuk screenshot bukti) = detail keberangkatan
    const master = await new MasterKapalPage(page).daftar();

    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    const d = await list.bukaDetail(DATA.jadwalA);
    const fisik = await d.kapasitasFisik();
    const r = await d.rumusFisik();
    const namaKapal = (await d.infoHeader.innerText()).split('(')[0].trim();
    const k = master.find((x) => x.nama === namaKapal);
    test.skip(!k, `Kapal "${namaKapal}" tidak ditemukan di master`);

    await cekTemuan(page, {
      id: 'KA-K05',
      judul: 'Kapasitas fisik keberangkatan beda dengan Kap. Penumpang di master Kapal',
      langkah: [
        'Buka menu Kapal, catat "Kap. Penumpang" kapal ' + namaKapal,
        `Buka detail keberangkatan ${DATA.jadwalA} tanggal ${DATA.tanggalUji}`,
        'Lihat kartu "Kapasitas fisik penumpang"',
      ],
      ekspektasi: `Kapasitas fisik = Kap. Penumpang di master (${k!.kapPenumpang}), atau keterangan rumusnya dijelaskan`,
      aktual: `Kapasitas fisik ${fisik} = min(SKKP ${r.skkp} − ABK ${r.abk}, pelampung ${r.pelampung}); master Kap. Penumpang ${k!.kapPenumpang}`,
      cek: async () => expect(fisik).toBe(k!.kapPenumpang),
      fokus: d.main.getByText('Kapasitas fisik penumpang').locator('..'),
    });
  });
});