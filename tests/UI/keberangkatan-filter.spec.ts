import { test, expect } from '@playwright/test';
import { DATA, KeberangkatanListPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN & ALOKASI — Filter, pencarian, navigasi (READ-ONLY, tidak mengubah data)
 * ID: KA-F-xx   Jenis: [Positif] [Negatif] [Edge]
 */

const RENTANG_7_HARI = { dari: '2027-05-01', sampai: '2027-05-07' };

test.describe('Keberangkatan & Alokasi — filter & navigasi', () => {
  let list: KeberangkatanListPage;
  const barisData = () => list.rows.filter({ has: list.page.getByRole('link') });

  test.beforeEach(async ({ page }) => {
    list = new KeberangkatanListPage(page);
  });

  test('[Positif] KA-F01 state awal: empty state, Jadwal terkunci, placeholder benar', async () => {
    await list.goto();
    await expect(list.emptyPilihRute).toBeVisible();
    await expect(list.table).toHaveCount(0);
    await expect(list.rute).toHaveText(/Pilih rute/);
    await expect(list.jadwal).toHaveText(/Semua jadwal/);
    await expect(list.jadwal).toBeDisabled();
    await expect(list.tanggal).toHaveText(/Pilih rentang tanggal/);
    await expect(list.filterBtn).toBeVisible();
  });

  test('[Positif] KA-F02 pilih rute → data tampil, route_id tersimpan di URL, Jadwal aktif', async ({ page }) => {
    await list.goto();
    await list.pilihRute();
    await expect(page).toHaveURL(new RegExp(`route_id=${DATA.ruteId}`));
    await expect(list.emptyPilihRute).toBeHidden();
    await expect(barisData().first()).toBeVisible();
    for (const h of ['Tanggal', 'Jadwal', 'Kapal', 'Kuota', 'Teralokasi', 'Sisa', 'Status', 'Aktif', 'Penjualan']) {
      await expect(list.table.locator('thead')).toContainText(h);
    }
    await expect(list.jadwal).toBeEnabled();
  });

  test('[Positif] KA-F03 deep link URL (rute + tanggal) → filter terisi otomatis & data sesuai tanggal', async () => {
    await list.gotoTanggal(DATA.tanggalUji);
    await expect(list.rute).toContainText(DATA.rute);
    await expect(list.tanggal).toHaveText('02/05/2027 - 02/05/2027');
    const tanggal = await barisData().locator('td:nth-child(2)').allInnerTexts();
    expect(tanggal.length).toBeGreaterThan(0);
    for (const t of tanggal) expect(t).toContain('2 Mei');
  });

  test('[Positif] KA-F04 filter Jadwal → hanya jadwal terpilih yang tampil', async () => {
    await list.gotoTanggal(DATA.tanggalUji);
    const kode = await list.pilihJadwal(DATA.jadwalA);
    await expect(list.jadwal).toContainText(kode);
    await expect
      .poll(async () => {
        const r = await barisData().allInnerTexts();
        return r.length > 0 && r.every((x) => x.includes(kode));
      }, { timeout: 15_000 })
      .toBe(true);
  });

  test('[Positif] KA-F05 rentang tanggal lewat kalender → URL date_from & date_to', async ({ page }) => {
    await list.goto({ route_id: DATA.ruteId });
    await list.tungguData();
    const dari = new Date();
    const sampai = new Date();
    sampai.setDate(dari.getDate() + 2);
    await list.pilihRentangTanggal(dari, sampai);
    await expect(page).toHaveURL(/date_from=\d{4}-\d{2}-\d{2}/);
    await expect(page).toHaveURL(/date_to=\d{4}-\d{2}-\d{2}/);
  });

  test('[Positif] KA-F06 filter Status "Open" → semua baris berstatus Open, badge filter = 1', async ({ page }) => {
    await list.gotoTanggal(RENTANG_7_HARI.dari, RENTANG_7_HARI.sampai);
    await list.centangFilter('Open');
    await list.tutupPopover();
    await expect(page).toHaveURL(/status=/);
    await expect(list.filterBtn).toHaveText(/1\s*$/);
    await expect
      .poll(async () => {
        const s = await barisData().locator('td:nth-child(8)').allInnerTexts();
        return s.length > 0 && s.every((x) => x.trim() === 'Open');
      }, { timeout: 15_000 })
      .toBe(true);
  });

  test('[Positif] KA-F07 Reset filter → badge hilang & jumlah data kembali seperti awal', async ({ page }) => {
    await list.gotoTanggal(RENTANG_7_HARI.dari, RENTANG_7_HARI.sampai);
    const awal = await list.totalData();
    await list.centangFilter('Closed');
    await list.resetFilter();
    await list.tutupPopover();
    await expect(page).not.toHaveURL(/status=/);
    await expect(list.filterBtn).toHaveText(/Mode\s*$/);
    await expect.poll(() => list.totalData()).toBe(awal);
  });

  test('[Positif] KA-F08 filter Mode "Pax" → semua baris mode Pax', async () => {
    await list.gotoTanggal(DATA.tanggalUji);
    await list.centangFilter('Pax');
    await list.tutupPopover();
    await expect
      .poll(async () => {
        const k = await barisData().locator('td:nth-child(4)').allInnerTexts();
        return k.length > 0 && k.every((x) => x.includes('Pax'));
      })
      .toBe(true);
  });

  test('[Positif] KA-F09 filter Penjualan "Online" → semua baris Online', async () => {
    await list.gotoTanggal(DATA.tanggalUji);
    await list.centangFilter('Online');
    await list.tutupPopover();
    await expect(barisData().first()).toBeVisible();
    const tombol = barisData().getByRole('button', { name: 'Online', exact: true });
    const n = await tombol.count();
    for (let i = 0; i < n; i++) await expect(tombol.nth(i)).toHaveAttribute('aria-pressed', 'true');
  });

  test('[Negatif] KA-F10 cari rute yang tidak ada → "Tidak ditemukan", tidak ada opsi', async () => {
    await list.goto();
    await list.rute.click();
    await list.popover.getByPlaceholder('Cari rute').fill('ZZZXQ-TIDAK-ADA');
    await expect(list.popover.getByText('Tidak ditemukan')).toBeVisible();
    await expect(list.popover.getByRole('option')).toHaveCount(0);
    await list.tutupPopover();
    await expect(list.emptyPilihRute).toBeVisible();
  });

  test('[Edge] KA-F11 cari rute huruf kecil semua → tetap ketemu (tidak case-sensitive)', async () => {
    await list.goto();
    await list.rute.click();
    await list.popover.getByPlaceholder('Cari rute').fill(DATA.rute.toLowerCase());
    await expect(list.popover.getByRole('option').first()).toContainText(DATA.rute);
    await list.tutupPopover();
  });

  test('[Edge] KA-F12 kombinasi filter yang mustahil (Nonaktif + Online) → 0 data & pesan kosong', async () => {
    await list.gotoTanggal(DATA.tanggalUji);
    await list.centangFilter('Nonaktif');
    await list.centangFilter('Online');
    await list.tutupPopover();
    await expect(list.emptyFilter).toBeVisible();
    await expect(list.pager).toContainText('dari 0 data');
  });

  test('[Edge] KA-F13 rute tanpa jadwal → pesan kosong "0 data", tidak error', async () => {
    // Catatan: keberangkatan di dev ada untuk tanggal berapa pun (2020 s.d. 2030),
    // jadi kondisi "kosong" diuji pakai rute yang belum punya jadwal.
    await list.goto();
    await list.pilihRute(DATA.ruteTanpaJadwal);
    await expect(list.emptyFilter).toBeVisible();
    await expect(list.pager).toContainText('dari 0 data');
    await expect(list.toast.filter({ hasText: /gagal|error/i })).toHaveCount(0);
  });

  test('[Edge] KA-F14 pagination: Sebelumnya terkunci di hal. 1, Berikutnya pindah ke hal. 2, terakhir terkunci', async ({ page }) => {
    await list.gotoTanggal(RENTANG_7_HARI.dari, RENTANG_7_HARI.sampai);
    const total = await list.totalData();
    test.skip(total <= 25, `Data cuma ${total}, pagination tidak bisa diuji`);
    await expect(list.pager).toContainText(`Menampilkan 1–25 dari ${total} data`);
    await expect(list.btnSebelumnya).toBeDisabled();
    await list.btnBerikutnya.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(list.pager).toContainText(`26–${Math.min(50, total)} dari ${total}`);
    await expect(list.btnSebelumnya).toBeEnabled();
    // lompat ke halaman terakhir
    // klik satu per satu dan tunggu ringkasan berubah (jangan klik beruntun sebelum halaman termuat)
    for (let i = 0; i < 50 && (await list.btnBerikutnya.isEnabled()); i++) {
      const sebelum = await list.pager.innerText();
      await list.btnBerikutnya.click();
      await expect(list.pager).not.toHaveText(sebelum);
    }
    await expect(list.pager).toContainText(`–${total} dari ${total}`);
    await expect(list.btnBerikutnya).toBeDisabled();
  });

  test('[Edge] KA-F15 ubah filter saat di halaman 2 → kembali ke halaman 1', async ({ page }) => {
    await list.gotoTanggal(RENTANG_7_HARI.dari, RENTANG_7_HARI.sampai);
    test.skip((await list.totalData()) <= 25, 'Data kurang dari 2 halaman');
    await list.btnBerikutnya.click();
    await expect(page).toHaveURL(/page=2/);
    await list.centangFilter('Open');
    await list.tutupPopover();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(list.pager).toContainText(/Menampilkan (1|0)–/);
  });

  test('[Edge] KA-F16 ganti rute → pilihan Jadwal ter-reset ke "Semua jadwal"', async () => {
    await list.gotoTanggal(DATA.tanggalUji);
    await list.pilihJadwal(DATA.jadwalA);
    await list.pilihRute(DATA.rute2);
    await expect(list.jadwal).toHaveText(/Semua jadwal/);
  });

  test('[Positif] KA-F17 reload halaman → rute, tanggal, & filter tetap (tersimpan di URL)', async ({ page }) => {
    await list.gotoTanggal(DATA.tanggalUji);
    await list.centangFilter('Open');
    await list.tutupPopover();
    await page.reload();
    await expect(list.rute).toContainText(DATA.rute);
    await expect(list.tanggal).toHaveText('02/05/2027 - 02/05/2027');
    await expect(list.filterBtn).toHaveText(/1\s*$/);
  });

  test('[Positif] KA-F18 pilih semua → bar aksi massal muncul dengan jumlah benar; Batal pilih menutupnya', async ({ page }) => {
    await list.gotoTanggal(DATA.tanggalUji);
    await expect(barisData().first()).toBeVisible();
    const n = await barisData().count();
    expect(n).toBeGreaterThan(0);
    await page.getByRole('checkbox', { name: 'Pilih semua' }).click();
    await expect(list.bulkInfo).toHaveText(`${n} keberangkatan dipilih`);
    for (const b of ['Set Online', 'Set Offline', 'Aktifkan', 'Nonaktifkan']) {
      await expect(page.getByRole('button', { name: b, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Batal pilih' }).click();
    await expect(list.bulkInfo).toBeHidden();
  });

  test('[Negatif] KA-F19 route_id tidak valid di URL → tidak crash, tidak ada data', async () => {
    await list.goto({ route_id: '999999' });
    await expect(list.rute).toHaveText(/Pilih rute/);
    await expect(list.rows.filter({ has: list.page.getByRole('link') })).toHaveCount(0);
    await expect(list.toast.filter({ hasText: /error|500/i })).toHaveCount(0);
  });

  /* --------------------------------- TEMUAN --------------------------------- */

  test('[Temuan] KA-T06 popover Filter seharusnya muat di layar / bisa di-scroll (tombol "Reset filter" terjangkau)', async ({ page }) => {
    await list.gotoTanggal(RENTANG_7_HARI.dari, RENTANG_7_HARI.sampai);
    await list.bukaFilter();
    const reset = list.popover.getByRole('button', { name: 'Reset filter' });
    const tinggiLayar = page.viewportSize()!.height;
    const kotak = await reset.boundingBox();
    const bawahReset = Math.round((kotak?.y ?? 0) + (kotak?.height ?? 0));
    const bisaScroll = await list.popover.evaluate((el) => {
      let e: HTMLElement | null = el as HTMLElement;
      while (e) {
        const oy = getComputedStyle(e).overflowY;
        if (/(auto|scroll)/.test(oy) && e.scrollHeight > e.clientHeight) return true;
        e = e.querySelector(':scope > *') as HTMLElement | null;
      }
      return false;
    });
    const jumlahKapal = await list.popover.getByRole('checkbox').count();
    await cekTemuan(page, {
      id: 'KA-T06',
      judul: 'Popover Filter lebih tinggi dari layar dan tidak bisa di-scroll — "Reset filter" & sebagian kapal tidak terjangkau',
      langkah: [
        'Buka menu Keberangkatan & Alokasi di layar laptop (1366×768)',
        `Pilih rute ${DATA.rute}, tanggal ${RENTANG_7_HARI.dari} s.d. ${RENTANG_7_HARI.sampai}`,
        'Klik tombol "Filter: Kapal, Status, Mode"',
        'Coba scroll ke tombol "Reset filter" di bagian bawah popover',
      ],
      ekspektasi: 'Seluruh isi popover terlihat atau popover bisa di-scroll, sehingga semua kapal dan tombol "Reset filter" bisa diklik',
      aktual: `Popover berisi ${jumlahKapal} pilihan; tombol "Reset filter" berada di y=${bawahReset}px, di luar layar (tinggi ${tinggiLayar}px), dan popover ${bisaScroll ? 'bisa' : 'TIDAK bisa'} di-scroll`,
      cek: async () => expect(bisaScroll || bawahReset <= tinggiLayar).toBe(true),
      fokus: list.popover,
    });
    await page.keyboard.press('Escape');
  });
});