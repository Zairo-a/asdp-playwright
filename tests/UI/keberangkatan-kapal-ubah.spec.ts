import { test, expect } from '@playwright/test';
import { DATA, KeberangkatanListPage, MasterKapalPage, DetailKeberangkatanPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — Kapal override harian (MENGUBAH DATA → butuh ALLOW_WRITE=1)
 * Mengganti kapal keberangkatan uji ke DATA.kapalUji, cek dampaknya, lalu
 * SELALU dikembalikan ke "Pakai kapal default jadwal".
 * ID: KA-K1x
 *
 * "Ditolak bila kuota baru < hold + terjual" belum bisa diuji (keberangkatan uji belum punya penjualan/hold);
 * sebagai gantinya KA-K14 menguji kuota baru < alokasi Mitra yang sudah tersimpan.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Keberangkatan — Kapal override (ubah data + restore)', () => {
  const A = DATA.jadwalA;

  async function kembalikanDefault(d: DetailKeberangkatanPage) {
    await d.page.reload();
    await d.tungguTermuat();
    if (!(await d.kapalTerpilih()).includes('Pakai kapal default')) {
      await d.pilihKapalDefault();
      await d.simpanKapal();
    }
    await expect(d.kapal).toContainText('Pakai kapal default');
  }

  test('[Positif] KA-K10 ganti kapal → kapasitas fisik, kuota, SUP, mode, & list ikut berubah; lalu kembali ke default', async ({ page }) => {
    const master = await new MasterKapalPage(page).daftar();
    const kapal = master.find((k) => k.nama === DATA.kapalUji);
    test.skip(!kapal || !/^Aktif$/i.test(kapal.status), `Kapal uji "${DATA.kapalUji}" tidak ada / tidak aktif`);

    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    let d = await list.bukaDetail(A);
    const awal = {
      fisik: await d.kapasitasFisik(),
      total: await d.totalKuota(),
      mode: await d.modeKeberangkatan(),
      persen: await d.persenKapasitas(),
    };
    const urlDetail = page.url();

    try {
      await d.pilihKapal(DATA.kapalUji, new RegExp('^' + DATA.kapalUji));
      await d.simpanKapal();

      // 1. Header & kartu di detail
      await expect(d.infoHeader).toContainText(`${DATA.kapalUji} (kapal daily)`);
      const r = await d.rumusFisik();
      expect(r.abk, 'ABK di rumus = ABK di master kapal').toBe(kapal!.abk);
      expect(r.pelampung, 'pelampung di rumus = pelampung di master kapal').toBe(kapal!.pelampung);
      const fisik = Math.min(r.skkp - r.abk, r.pelampung);
      await expect.poll(() => d.kapasitasFisik()).toBe(fisik);
      const totalBaru = Math.round((fisik * awal.persen) / 100);
      expect(await d.totalKuota()).toBe(totalBaru);

      // 2. Mode (Pax/Seat) mengikuti kapal baru
      expect(await d.modeKeberangkatan()).toBe(kapal!.mode);

      // 3. Halaman list: kolom Kapal & Kuota ikut berubah
      await list.gotoTanggal(DATA.tanggalUji);
      await expect(list.sel(A, 'kapal')).toContainText(DATA.kapalUji);
      await expect(list.sel(A, 'kapal')).toContainText('kapal daily');
      expect(await list.kuota(A)).toBe(totalBaru);

      // 4. Filter Kapal di list mengenali kapal baru
      await list.centangFilter(DATA.kapalUji);
      await list.tutupPopover();
      await expect(list.baris(A)).toBeVisible();
      const semuaKapal = await list.rows.filter({ has: page.getByRole('link') }).locator('td:nth-child(4)').allInnerTexts();
      for (const k of semuaKapal) expect(k).toContain(DATA.kapalUji);
    } finally {
      await page.goto(urlDetail);
      d = new DetailKeberangkatanPage(page);
      await kembalikanDefault(d);
    }

    // 5. Setelah kembali ke default, semua angka pulih
    await expect.poll(() => d.kapasitasFisik()).toBe(awal.fisik);
    expect(await d.totalKuota()).toBe(awal.total);
    expect(await d.modeKeberangkatan()).toBe(awal.mode);
  });

  test('[Temuan] KA-K11 setelah ganti kapal, jumlah kuota semua kelas di Alokasi seharusnya = Total kuota', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    let d = await list.bukaDetail(A);
    const urlDetail = page.url();
    try {
      await d.pilihKapal(DATA.kapalUji, new RegExp('^' + DATA.kapalUji));
      await d.simpanKapal();
      const total = await d.totalKuota();
      await d.bukaTab('Alokasi');
      const jumlah = await d.jumlahKuotaKelas();
      const status = (await d.tabelAlokasi.innerText()).includes('Tidak sesuai kuota') ? 'Tidak sesuai kuota' : 'Sesuai kuota';
      await cekTemuan(page, {
        id: 'KA-K11',
        judul: 'Setelah ganti kapal, kuota per kelas tidak menjumlah ke Total kuota',
        langkah: [
          `Buka detail keberangkatan ${A} tanggal ${DATA.tanggalUji}`,
          `Tab Kapasitas Operasional → Kapal (override harian) pilih "${DATA.kapalUji}" → Simpan`,
          'Buka tab Alokasi, jumlahkan "kuota" di judul setiap kolom kelas',
        ],
        ekspektasi: `Jumlah kuota semua kelas = Total kuota (${total})`,
        aktual: `Jumlah kuota kelas ${jumlah}, Total kuota ${total} (selisih ${total - jumlah} kursi tidak teralokasi), status tetap "${status}"`,
        cek: async () => expect(jumlah).toBe(total),
        fokus: d.tabelAlokasi.locator('tr').first(),
      });
    } finally {
      await page.goto(urlDetail);
      d = new DetailKeberangkatanPage(page);
      await kembalikanDefault(d);
    }
  });

  test('[Positif] KA-K12 kembali ke kapal default → alokasi per kelas pulih seperti awal', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    let d = await list.bukaDetail(A);
    const urlDetail = page.url();
    await d.bukaTab('Alokasi');
    const kolom = await d.kolomKelas();
    const kuotaAwal: number[] = [];
    for (const k of kolom) kuotaAwal.push(await d.kuotaKelas(k));

    try {
      await d.pilihKapal(DATA.kapalUji, new RegExp('^' + DATA.kapalUji));
      await d.simpanKapal();
    } finally {
      await page.goto(urlDetail);
      d = new DetailKeberangkatanPage(page);
      await kembalikanDefault(d);
    }
    await d.bukaTab('Alokasi');
    const kuotaAkhir: number[] = [];
    for (const k of await d.kolomKelas()) kuotaAkhir.push(await d.kuotaKelas(k));
    expect(kuotaAkhir).toEqual(kuotaAwal);
    await expect(d.tabelAlokasi).toContainText('Sesuai kuota');
  });

  test('[Edge] KA-K13 kapal default jadwal tidak ditawarkan lagi sebagai kapal pengganti (hanya lewat "Pakai kapal default jadwal")', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    const d = await list.bukaDetail(A);
    const header = await d.infoHeader.innerText();
    const kapalDefault = header.match(/^(.+?) \(kapal default\)/)?.[1]?.trim();
    test.skip(!kapalDefault, `Header tidak menampilkan kapal default: "${header}"`);
    await d.bukaTab('Kapasitas Operasional');
    await d.kapal.click();
    await expect(d.popover).toBeVisible();
    const opsi = (await d.popover.getByRole('option').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    await page.keyboard.press('Escape');
    expect(opsi[0], 'opsi pertama = pakai kapal default').toContain(`Pakai kapal default jadwal (${kapalDefault})`);
    const kembar = opsi.filter((o) => o.startsWith(`${kapalDefault} (`));
    expect(kembar, `kapal default "${kapalDefault}" tidak boleh muncul lagi sebagai pilihan pengganti`).toEqual([]);
  });

  test('[Negatif] KA-K14 ganti kapal saat alokasi Mitra tersimpan lebih besar dari kuota kapal baru → seharusnya ditolak', async ({ page }) => {
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    let d = await list.bukaDetail(A);
    const urlDetail = page.url();
    let mitra = 0;
    try {
      // 1. Mitra kelas uji = tepat kuota kelas (kapal default)
      await d.bukaTab('Alokasi');
      mitra = await d.kuotaKelas(DATA.kelas);
      await d.isiMitra(DATA.kelas, String(mitra));
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');

      // 2. Ganti ke kapal uji
      await page.reload();
      await d.tungguTermuat();
      await d.pilihKapal(DATA.kapalUji, new RegExp('^' + DATA.kapalUji));
      await d.btnSimpan.click();
      const t = d.toast.first();
      await expect(t).toBeVisible({ timeout: 15_000 });
      const pesan = (await t.innerText()).replace(/\s+/g, ' ').trim();

      // 3. Keadaan sesudahnya
      await page.reload();
      await d.tungguTermuat();
      const kapalSekarang = await d.kapalTerpilih();
      const berganti = kapalSekarang.includes(DATA.kapalUji);
      await d.bukaTab('Alokasi');
      const kuotaBaru = await d.kuotaKelas(DATA.kelas);
      const mitraSekarang = Number(await d.inputMitra(DATA.kelas).inputValue());
      test.skip(berganti && kuotaBaru >= mitra, `Kuota kelas di ${DATA.kapalUji} (${kuotaBaru}) tidak lebih kecil dari Mitra ${mitra} → kasus ini tidak terjadi`);
      await cekTemuan(page, {
        id: 'KA-K15',
        judul: 'Kapal bisa diganti walau kuota kapal baru lebih kecil dari alokasi Mitra yang sudah tersimpan',
        langkah: [
          `Buka detail keberangkatan ${A} tanggal ${DATA.tanggalUji} → tab Alokasi`,
          `Isi Mitra kelas ${DATA.kelas} = ${mitra} (tepat kuota kelas) → Simpan`,
          `Tab Kapasitas Operasional → Kapal (override harian) = ${DATA.kapalUji} → Simpan`,
        ],
        ekspektasi: 'Ditolak (seperti aturan "ditolak bila kuota baru < hold + terjual"), atau alokasi Mitra disesuaikan ≤ kuota baru',
        aktual: `Toast "${pesan}"; kapal sekarang "${kapalSekarang}"; kuota kelas ${DATA.kelas} = ${kuotaBaru}, Mitra = ${mitraSekarang}`,
        cek: async () => expect(!berganti || mitraSekarang <= kuotaBaru).toBe(true),
        fokus: d.tabelAlokasi,
      });
    } finally {
      await page.goto(urlDetail);
      d = new DetailKeberangkatanPage(page);
      await kembalikanDefault(d);
      await d.bukaTab('Alokasi');
      await d.pulihkanSemuaSubTab();
    }
  });
});