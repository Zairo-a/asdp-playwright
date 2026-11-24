import { test, expect } from '@playwright/test';
import { DATA, KeberangkatanListPage, DetailKeberangkatanPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN & ALOKASI — Aksi yang MENGUBAH DATA di server dev.
 * Hanya jalan kalau ALLOW_WRITE=1 (nama file berakhiran -ubah.spec.ts).
 * Semua test mengembalikan data ke kondisi awal (blok finally).
 *
 * Target: rute DATA.rute, tanggal DATA.tanggalUji, jadwal DATA.jadwalA / DATA.jadwalB.
 * ID: KA-U-xx
 */

test.describe.configure({ mode: 'serial' });

test.describe('Keberangkatan & Alokasi — ubah data (dengan restore)', () => {
  let list: KeberangkatanListPage;
  const A = DATA.jadwalA;
  const B = DATA.jadwalB;

  test.beforeEach(async ({ page }) => {
    list = new KeberangkatanListPage(page);
    await list.gotoTanggal(DATA.tanggalUji);
    // Prasyarat: keberangkatan uji dalam kondisi normal (Aktif + Online)
    await list.setAktif(A, true, 'QA restore prasyarat');
    await list.setOnline(A, true);
  });

  /* ------------------------------ Aktif / Nonaktif ------------------------------ */

  test('[Positif] KA-U01 Nonaktifkan dengan alasan → status Nonaktif, otomatis Offline, alasan tampil; lalu Aktifkan kembali', async () => {
    const alasan = `QA automation ${Date.now()}`;
    try {
      await list.switchAktif(A).click();
      await list.konfirmasiDialog(alasan);
      await list.expectAktif(A, false);
      await expect(list.sel(A, 'status')).toHaveText('Nonaktif');
      await list.expectOnline(A, false);
      await expect(list.btnOnline(A)).toBeDisabled(); // tidak bisa Online selama nonaktif
      await expect(list.sel(A, 'penjualan')).toContainText(alasan);

      // dampak ke halaman detail
      const d = await list.bukaDetail(A);
      await expect(d.main).toContainText('Nonaktif');
      await list.page.goBack();
      await list.tungguData();
    } finally {
      await list.setAktif(A, true, 'QA restore');
    }
    await expect(list.sel(A, 'status')).toHaveText(/Open|Closed/);
    await list.expectOnline(A, true);
  });

  /* ------------------------------ Online / Offline ------------------------------ */

  test('[Positif] KA-U02 Set Offline (tanpa alasan) → Penjualan Offline di list & detail; lalu Online kembali', async () => {
    try {
      await list.btnOffline(A).click();
      await list.konfirmasiDialog(); // alasan opsional
      await list.expectOnline(A, false);
      await list.expectAktif(A, true); // tetap aktif (loket tetap menjual)
      const d = await list.bukaDetail(A);
      await expect(d.main).toContainText('Offline');
      await list.page.goBack();
      await list.tungguData();
    } finally {
      await list.setOnline(A, true);
    }
  });

  test('[Positif] KA-U03 aksi massal: pilih 2 keberangkatan → Set Offline → keduanya Offline; lalu Set Online', async () => {
    await list.setOnline(B, true);
    try {
      await list.checkbox(A).click();
      await list.checkbox(B).click();
      await expect(list.bulkInfo).toHaveText('2 keberangkatan dipilih');
      await list.aksiMassal('Set Offline');
      await list.expectOnline(A, false);
      await list.expectOnline(B, false);
    } finally {
      if (await list.bulkInfo.isVisible()) await list.page.getByRole('button', { name: 'Batal pilih' }).click();
      await list.checkbox(A).click();
      await list.checkbox(B).click();
      await list.aksiMassal('Set Online');
    }
    await list.expectOnline(A, true);
    await list.expectOnline(B, true);
  });

  test('[Edge] KA-U04 Offline → Nonaktifkan → Aktifkan: Penjualan seharusnya kembali ke Offline (keadaan sebelum) [perlu konfirmasi]', async () => {
    try {
      await list.setOnline(A, false);
      await list.setAktif(A, false, 'QA edge offline-nonaktif');
      await list.setAktif(A, true, 'QA edge aktifkan');
      await list.expectOnline(A, false);
    } finally {
      await list.setAktif(A, true, 'QA restore');
      await list.setOnline(A, true);
    }
  });

  /* ---------------------------- Kapasitas operasional --------------------------- */

  async function ujiKapasitas(persen: number) {
    const d = await list.bukaDetail(A);
    const awal = await d.persenKapasitas();
    const fisik = await d.kapasitasFisik();
    const harapan = Math.round((fisik * persen) / 100);
    try {
      await d.simpanKapasitas(persen);
      await expect.poll(() => d.totalKuota()).toBe(harapan);

      // dampak ke tab Alokasi: total kelas = kuota baru & tetap "Sesuai kuota"
      await d.bukaTab('Alokasi');
      expect(await d.totalBaris('Total')).toBe(harapan);
      await expect(d.tabelAlokasi).toContainText('Sesuai kuota');

      // dampak ke list: kolom Kuota ikut berubah
      await list.gotoTanggal(DATA.tanggalUji);
      expect(await list.kuota(A)).toBe(harapan);
    } finally {
      await list.gotoTanggal(DATA.tanggalUji);
      const d2 = await list.bukaDetail(A);
      if ((await d2.persenKapasitas()) !== awal) await d2.simpanKapasitas(awal);
      await expect.poll(() => d2.totalKuota()).toBe(Math.round((fisik * awal) / 100));
    }
  }

  test('[Positif] KA-U05 kapasitas 50% → Total kuota, Alokasi, dan Kuota di list ikut berubah', async () => {
    await ujiKapasitas(50);
  });

  test('[Edge] KA-U06 kapasitas 100% (batas atas) → kuota = kapasitas fisik', async () => {
    await ujiKapasitas(100);
  });

  test('[Edge] KA-U07 kapasitas 1% (batas bawah) → kuota = bulat(fisik × 1%)', async () => {
    await ujiKapasitas(1);
  });

  /* ---------------------------------- Alokasi ---------------------------------- */

  async function bukaAlokasi(): Promise<DetailKeberangkatanPage> {
    const d = await list.bukaDetail(A);
    await d.bukaTab('Alokasi');
    return d;
  }
  async function pulihkanMitra(d: DetailKeberangkatanPage, awal: string) {
    await d.page.reload();
    await d.bukaTab('Alokasi');
    if ((await d.inputMitra(DATA.kelas).inputValue()) !== awal) {
      await d.isiMitra(DATA.kelas, awal);
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
    }
  }

  test('[Positif] KA-U08 alokasi Mitra 1 → tersimpan, Retail berkurang 1, sumber "Override"; data bertahan setelah reload', async () => {
    const d = await bukaAlokasi();
    const awal = await d.inputMitra(DATA.kelas).inputValue();
    const retailAwal = await d.nilai('Retail', DATA.kelas);
    const mitraAwal = Number(awal);
    try {
      await d.isiMitra(DATA.kelas, String(mitraAwal + 1));
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect.poll(() => d.nilai('Retail', DATA.kelas)).toBe(retailAwal - 1);
      await expect.poll(() => d.sumber('Mitra')).toContain('Override');
      await expect(d.tabelAlokasi).toContainText('Sesuai kuota');

      await d.page.reload();
      await d.bukaTab('Alokasi');
      await expect(d.inputMitra(DATA.kelas)).toHaveValue(String(mitraAwal + 1));
    } finally {
      await pulihkanMitra(d, awal);
    }
    if (awal === '0') {
      // tunggu layar diperbarui setelah restore (data di server sudah benar)
      await d.page.reload();
      await d.bukaTab('Alokasi');
      await expect.poll(() => d.sumber('Mitra'), { timeout: 10_000 }).toContain('Jadwal');
    }
  });

  test('[Edge] KA-U09 alokasi Mitra = tepat kuota kelas (batas) → tersimpan, Retail kelas jadi 0', async () => {
    const d = await bukaAlokasi();
    const awal = await d.inputMitra(DATA.kelas).inputValue();
    const kuota = await d.kuotaKelas(DATA.kelas);
    const korp = await d.nilai('Korporasi', DATA.kelas);
    try {
      await d.isiMitra(DATA.kelas, String(kuota - korp));
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect.poll(() => d.nilai('Retail', DATA.kelas)).toBe(0);
      await expect(d.tabelAlokasi).toContainText('Sesuai kuota');
    } finally {
      await pulihkanMitra(d, awal);
    }
  });

  test('[Negatif] KA-U10 alokasi Mitra melebihi kuota kelas → ditolak server, data tidak berubah', async () => {
    const d = await bukaAlokasi();
    const awal = await d.inputMitra(DATA.kelas).inputValue();
    const kuota = await d.kuotaKelas(DATA.kelas);
    try {
      await d.isiMitra(DATA.kelas, String(kuota + 5));
      await d.simpanAlokasi();
      await d.expectToast('Gagal menyimpan alokasi');
      await d.page.reload();
      await d.bukaTab('Alokasi');
      await expect(d.inputMitra(DATA.kelas)).toHaveValue(awal);
    } finally {
      await pulihkanMitra(d, awal);
    }
  });

  test('[Negatif] KA-U11 alokasi Mitra negatif (-1) → tidak boleh tersimpan negatif', async () => {
    const d = await bukaAlokasi();
    const awal = await d.inputMitra(DATA.kelas).inputValue();
    try {
      await d.isiMitra(DATA.kelas, '-1');
      if (await d.btnSimpan.isEnabled()) await d.simpanAlokasi();
      await d.page.reload();
      await d.bukaTab('Alokasi');
      const v = Number(await d.inputMitra(DATA.kelas).inputValue());
      expect(v).toBeGreaterThanOrEqual(0);
    } finally {
      await pulihkanMitra(d, awal);
    }
  });

  test('[Temuan] KA-U12 pesan gagal simpan alokasi seharusnya bahasa manusia, bukan kode "FCAP-…"', async () => {
    const d = await bukaAlokasi();
    const awal = await d.inputMitra(DATA.kelas).inputValue();
    try {
      await d.isiMitra(DATA.kelas, String((await d.kuotaKelas(DATA.kelas)) + 5));
      await d.simpanAlokasi();
      const t = d.toast.filter({ hasText: 'Gagal menyimpan alokasi' }).first();
      await expect(t).toBeVisible();
      // Simpan teksnya segera — toast hilang sendiri setelah beberapa detik
      const pesan = (await t.innerText()).replace(/\n/g, ' / ');
      await cekTemuan(d.page, {
        id: 'KA-U12',
        judul: 'Pesan gagal simpan alokasi berupa kode teknis',
        langkah: [
          'Buka detail keberangkatan, tab Alokasi',
          `Isi Mitra kelas ${DATA.kelas} melebihi kuota kelas`,
          'Klik Simpan',
        ],
        ekspektasi: 'Pesan yang mudah dipahami, mis. "Alokasi melebihi kuota kelas REGULER (maks. 8)"',
        aktual: `Toast menampilkan "${pesan}"`,
        cek: async () => expect(pesan).not.toMatch(/FCAP-[A-Z-]+/),
        fokus: t,
      });
    } finally {
      await pulihkanMitra(d, awal);
    }
  });
});