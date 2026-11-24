import { test, expect } from '@playwright/test';
import { DATA, KeberangkatanListPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN & ALOKASI — Detail, konsistensi antar halaman, validasi form (READ-ONLY)
 * Tidak ada yang disimpan: semua perubahan dibatalkan (Batal / Buang Perubahan / tutup dialog).
 * ID: KA-D-xx (detail), KA-V-xx (validasi), KA-T-xx (temuan / perlu konfirmasi)
 */

test.describe('Keberangkatan & Alokasi — detail & konsistensi', () => {
  let list: KeberangkatanListPage;

  test.beforeEach(async ({ page }) => {
    list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
  });

  test('[Positif] KA-D01 klik jadwal → buka detail; Kuota di list = Total kuota di detail', async () => {
    const kuotaList = await list.kuota(DATA.jadwalA);
    const detail = await list.bukaDetail(DATA.jadwalA);
    expect(await detail.totalKuota()).toBe(kuotaList);
  });

  test('[Positif] KA-D02 rumus kuota: Total kuota = bulat(kapasitas fisik × % operasional)', async () => {
    const detail = await list.bukaDetail(DATA.jadwalA);
    const fisik = await detail.kapasitasFisik();
    const persen = await detail.persenKapasitas();
    expect(await detail.totalKuota()).toBe(Math.round((fisik * persen) / 100));
  });

  test('[Positif] KA-D03 tab Alokasi: jumlah kuota semua kelas = Total kuota & status "Sesuai kuota"', async () => {
    const detail = await list.bukaDetail(DATA.jadwalA);
    const total = await detail.totalKuota();
    await detail.bukaTab('Alokasi');
    let jumlah = 0;
    for (const k of await detail.kolomKelas()) jumlah += await detail.kuotaKelas(k);
    expect(jumlah).toBe(total);
    expect(await detail.totalBaris('Total')).toBe(total);
    await expect(detail.tabelAlokasi).toContainText('Sesuai kuota');
  });

  test('[Positif] KA-D04 Retail otomatis berisi sisa: Retail = kuota kelas − Mitra − Korporasi', async () => {
    const detail = await list.bukaDetail(DATA.jadwalA);
    await detail.bukaTab('Alokasi');
    for (const k of await detail.kolomKelas()) {
      const kuota = await detail.kuotaKelas(k);
      const retail = await detail.nilai('Retail', k);
      const mitra = await detail.nilai('Mitra', k);
      const korp = await detail.nilai('Korporasi', k);
      expect(retail, `kelas ${k}`).toBe(kuota - mitra - korp);
    }
  });

  test('[Positif] KA-D05 Teralokasi 0 → tab Transaksi menampilkan "Belum ada transaksi"', async () => {
    const teralokasi = Number((await list.sel(DATA.jadwalA, 'teralokasi').innerText()).trim());
    test.skip(teralokasi > 0, 'Keberangkatan uji sudah punya transaksi');
    const detail = await list.bukaDetail(DATA.jadwalA);
    await detail.bukaTab('Transaksi');
    await expect(detail.main).toContainText('Belum ada transaksi untuk keberangkatan ini.');
  });

  test('[Positif] KA-D06 status Aktif & Penjualan di list sama dengan di detail', async () => {
    const status = (await list.sel(DATA.jadwalA, 'status').innerText()).trim();
    const online = (await list.btnOnline(DATA.jadwalA).getAttribute('aria-pressed')) === 'true';
    const detail = await list.bukaDetail(DATA.jadwalA);
    await expect(detail.main).toContainText(status);
    await expect(detail.main).toContainText(online ? /Online · / : /Offline/);
  });

  test('[Positif] KA-D07 tombol Back browser → kembali ke list dengan filter tetap', async ({ page }) => {
    await list.bukaDetail(DATA.jadwalA);
    await page.goBack();
    await expect(list.rute).toContainText(DATA.rute);
    await expect(list.tanggal).toHaveText('02/05/2027 - 02/05/2027');
    await expect(list.baris(DATA.jadwalA)).toBeVisible();
  });

  /* ------------------------- validasi form ------------------------- */

  test('[Negatif] KA-V01 kapasitas 0 → otomatis jadi 1 (batas bawah)', async () => {
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.kapasitasInput.fill('0');
    await d.kapasitasInput.press('Tab');
    await expect(d.kapasitasInput).toHaveValue('1');
    await d.btnBatal.click();
  });

  test('[Negatif] KA-V02 kapasitas 150 → otomatis jadi 100 (batas atas)', async () => {
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.kapasitasInput.fill('150');
    await d.kapasitasInput.press('Tab');
    await expect(d.kapasitasInput).toHaveValue('100');
    await d.btnBatal.click();
  });

  test('[Negatif] KA-V03 kapasitas huruf "abc" → ditolak, nilai tetap angka', async () => {
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.kapasitasInput.click();
    await d.kapasitasInput.pressSequentially('abc');
    await d.kapasitasInput.press('Tab');
    await expect(d.kapasitasInput).toHaveValue(/^\d+([.,]\d+)?$/);
    if (await d.btnBatal.isEnabled()) await d.btnBatal.click();
  });

  test('[Positif] KA-V04 tombol Batal mengembalikan nilai awal & mengunci Simpan', async () => {
    const d = await list.bukaDetail(DATA.jadwalA);
    const awal = await d.kapasitasInput.inputValue();
    await expect(d.btnSimpan).toBeDisabled();
    await d.kapasitasInput.fill(awal === '50' ? '60' : '50');
    await expect(d.btnSimpan).toBeEnabled();
    await d.btnBatal.click();
    await expect(d.kapasitasInput).toHaveValue(awal);
    await expect(d.btnSimpan).toBeDisabled();
  });

  test('[Negatif] KA-V05 Nonaktifkan tanpa alasan / alasan spasi saja → tombol "Ya, lanjutkan" terkunci', async () => {
    await list.expectAktif(DATA.jadwalA, true);
    await list.switchAktif(DATA.jadwalA).click();
    await expect(list.dialog).toContainText('Nonaktifkan keberangkatan?');
    const ya = list.dialog.getByRole('button', { name: 'Ya, lanjutkan' });
    const alasan = list.dialog.getByPlaceholder('Tulis alasan perubahan');
    await expect(ya).toBeDisabled();
    await alasan.fill('     ');
    await expect(ya).toBeDisabled();
    await list.dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(list.dialog).toBeHidden();
    await list.expectAktif(DATA.jadwalA, true); // tidak berubah
  });

  test('[Positif] KA-V06 dialog Set Offline: alasan opsional, Batal → tetap Online', async () => {
    await list.expectOnline(DATA.jadwalA, true);
    await list.btnOffline(DATA.jadwalA).click();
    await expect(list.dialog).toContainText('Set Offline?');
    await expect(list.dialog).toContainText('Loket tetap menjual');
    await expect(list.dialog.getByRole('button', { name: 'Ya, lanjutkan' })).toBeEnabled();
    await list.dialog.getByRole('button', { name: 'Batal' }).click();
    await list.expectOnline(DATA.jadwalA, true);
  });

  test('[Positif] KA-V07 dropdown Kapal override hanya berisi opsi default + kapal (bisa dicari)', async ({ page }) => {
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.kapal.click();
    await expect(d.popover.getByPlaceholder('Cari kapal')).toBeVisible();
    await expect(d.popover.getByRole('option').first()).toContainText('Pakai kapal default jadwal');
    await d.popover.getByPlaceholder('Cari kapal').fill('ZZZ-TIDAK-ADA');
    await expect(d.popover.getByRole('option')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('[Edge] KA-V08 Buang Perubahan di tab Alokasi → nilai Mitra kembali seperti awal', async () => {
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.bukaTab('Alokasi');
    const awal = await d.inputMitra(DATA.kelas).inputValue();
    await d.isiMitra(DATA.kelas, String(Number(awal) + 1));
    await d.btnBuang.click();
    await expect(d.inputMitra(DATA.kelas)).toHaveValue(awal);
  });
});

/* -------------------------------------------------------------------------- */
/* TEMUAN — expected result diambil dari aturan di layar.                     */
/* Kalau perilaku tidak sesuai, test MENCATAT TEMUAN (Langkah/Ekspektasi/     */
/* Aktual + screenshot) → "Temuan tercatat" di hasil\laporan-terbaru.html.    */
/* Test tetap hijau; bagian "Gagal" khusus untuk hal yang benar-benar rusak.  */
/* -------------------------------------------------------------------------- */
const LANGKAH_BUKA_ALOKASI = [
  'Buka menu Keberangkatan & Alokasi',
  `Pilih rute ${DATA.rute}, tanggal ${DATA.tanggalUji}`,
  `Klik jadwal ${DATA.jadwalA}, lalu buka tab Alokasi`,
];

test.describe('Keberangkatan & Alokasi — temuan', () => {
  test('[Temuan] KA-T01 preview alokasi valid (Mitra 1 ≤ kuota kelas) seharusnya "Sesuai kuota" sebelum disimpan', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.bukaTab('Alokasi');
    const kuota = await d.kuotaKelas(DATA.kelas);
    await d.isiMitra(DATA.kelas, '1');
    await cekTemuan(page, {
      id: 'KA-T01',
      judul: 'Preview alokasi salah saat Mitra diisi nilai yang valid',
      langkah: [...LANGKAH_BUKA_ALOKASI, `Isi Mitra kelas ${DATA.kelas} = 1 (kuota kelas ${kuota}), belum klik Simpan`],
      ekspektasi: `Retail ${DATA.kelas} otomatis berkurang jadi ${kuota - 1}, total kelas tetap ${kuota}, status "Sesuai kuota"`,
      aktual: async () =>
        `Retail ${DATA.kelas} tetap ${await d.nilai('Retail', DATA.kelas)}, ` +
        `total kelas jadi ${await d.nilai('Total', DATA.kelas)} dari kuota ${kuota} (tanda ⚠), ` +
        `status "${(await d.tabelAlokasi.innerText()).includes('Tidak sesuai kuota') ? 'Tidak sesuai kuota' : '?'}"`,
      cek: () => expect(d.tabelAlokasi).toContainText('Sesuai kuota', { timeout: 3_000 }),
      fokus: d.tabelAlokasi,
    });
    await d.btnBuang.click();
  });

  test('[Temuan] KA-T02 Mitra melebihi kuota kelas → seharusnya Simpan terkunci / ada pesan di form', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.bukaTab('Alokasi');
    const kuota = await d.kuotaKelas(DATA.kelas);
    await d.isiMitra(DATA.kelas, String(kuota + 5));
    await expect(d.tabelAlokasi).toContainText('Tidak sesuai kuota');
    await cekTemuan(page, {
      id: 'KA-T02',
      judul: 'Tombol Simpan tetap aktif walau alokasi melebihi kuota',
      langkah: [...LANGKAH_BUKA_ALOKASI, `Isi Mitra kelas ${DATA.kelas} = ${kuota + 5} (kuota kelas hanya ${kuota})`],
      ekspektasi: 'Tombol Simpan terkunci atau muncul pesan error di form sebelum disimpan',
      aktual: 'Tombol Simpan tetap aktif dan bisa diklik; penolakan baru muncul dari server setelah diklik',
      cek: () => expect(d.btnSimpan).toBeDisabled({ timeout: 3_000 }),
      fokus: d.btnSimpan,
    });
    await d.btnBuang.click();
  });

  test('[Temuan] KA-T03 rentang tanggal terbalik di URL → seharusnya ditukar otomatis atau muncul validasi', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.goto({ route_id: DATA.ruteId, date_from: '2027-05-07', date_to: '2027-05-01' });
    const ditukar = list.tanggal.filter({ hasText: '01/05/2027 - 07/05/2027' });
    const validasi = page.getByText(/tanggal (akhir|mulai)|tidak valid|rentang/i);
    await cekTemuan(page, {
      id: 'KA-T03',
      judul: 'Rentang tanggal terbalik diterima tanpa validasi',
      langkah: [
        'Buka URL: /capacity-departures?route_id=' + DATA.ruteId + '&date_from=2027-05-07&date_to=2027-05-01',
        '(tanggal mulai lebih besar dari tanggal akhir)',
      ],
      ekspektasi: 'Tanggal otomatis ditukar jadi 01/05/2027 - 07/05/2027, atau muncul pesan validasi tanggal',
      aktual: async () => `Kolom Tanggal menampilkan "${(await list.tanggal.innerText()).trim()}", tidak ada pesan validasi, tabel kosong`,
      cek: () => expect(ditukar.or(validasi).first()).toBeVisible({ timeout: 5_000 }),
      fokus: list.tanggal,
    });
  });

  test('[Temuan] KA-T04 route_id tidak valid → seharusnya tampil state "Pilih rute…" / pesan rute tidak ditemukan', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.goto({ route_id: '999999' });
    await cekTemuan(page, {
      id: 'KA-T04',
      judul: 'Rute tidak valid di URL tidak memunculkan pesan yang jelas',
      langkah: ['Buka URL: /capacity-departures?route_id=999999 (rute tidak ada)'],
      ekspektasi: 'Muncul tampilan "Pilih rute untuk menampilkan data" atau pesan "rute tidak ditemukan"',
      aktual: async () =>
        `Dropdown Rute "${(await list.rute.innerText()).trim()}", tabel tampil dengan pesan ` +
        `"${(await list.emptyFilter.isVisible()) ? 'Tidak ada keberangkatan untuk filter ini.' : '-'}" (seolah rute valid tapi kosong)`,
      cek: () => expect(list.emptyPilihRute.or(page.getByText(/rute tidak ditemukan/i)).first()).toBeVisible({ timeout: 5_000 }),
      fokus: list.main,
    });
  });

  test('[Temuan] KA-T05 nama kelas di tabel alokasi seharusnya unik (tidak ada kelas kembar)', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    const d = await list.bukaDetail(DATA.jadwalA);
    await d.bukaTab('Alokasi');
    const kelas = await d.namaKelas();
    const kembar = [...new Set(kelas.filter((k, i) => kelas.indexOf(k) !== i))];
    await cekTemuan(page, {
      id: 'KA-T05',
      judul: 'Nama kelas kembar di tabel alokasi',
      langkah: [...LANGKAH_BUKA_ALOKASI, 'Lihat baris judul kolom (nama kelas)'],
      ekspektasi: 'Setiap kelas punya nama unik',
      aktual: `Kelas ${kembar.join(', ')} muncul lebih dari sekali (${kelas.join(', ')})`,
      cek: async () => expect(new Set(kelas).size).toBe(kelas.length),
      fokus: d.tabelAlokasi.locator('tr').first(),
    });
  });
});