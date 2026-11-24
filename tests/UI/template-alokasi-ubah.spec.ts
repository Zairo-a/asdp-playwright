import { test, expect } from '@playwright/test';
import { DATA, TemplateAlokasiPage, DetailKeberangkatanPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * TEMPLATE ALOKASI RUTE — Simpan (MENGUBAH DATA → butuh ALLOW_WRITE=1)
 * Membuktikan apa yang sebenarnya diubah tombol Simpan di halaman Template.
 * Data yang tersentuh SELALU dikembalikan ("Kembalikan semua ke jadwal" di keberangkatan yang terdampak).
 * ID: TA-1x, TA-T1x
 */

test.describe.configure({ mode: 'serial' });

const POLA = /\/capacity\/departures\/(\d{4}-\d{2}-\d{2})\/(\d+)\/allocations/;

test.describe('Template Alokasi Rute — simpan', () => {
  test('[Negatif] TA-10 Mitra melebihi kuota kelas di Template → ditolak', async ({ page }) => {
    const tpl = new TemplateAlokasiPage(page);
    await tpl.buka(DATA.rute, DATA.jadwalA);
    const awal = await tpl.inputMitra(DATA.kelas).inputValue();
    await tpl.isiMitra(DATA.kelas, String((await tpl.kuotaKelas(DATA.kelas)) + 50));
    await tpl.simpanAlokasi();
    await expect(tpl.toast.filter({ hasText: /gagal/i }).first()).toBeVisible();
    await tpl.btnBuang.click();
    await expect(tpl.inputMitra(DATA.kelas)).toHaveValue(awal);
  });

  test('[Temuan] TA-T10 Simpan di Template seharusnya TIDAK mengubah keberangkatan yang sudah ada (hari ini)', async ({ page }) => {
    const tpl = new TemplateAlokasiPage(page);
    const muat = page.waitForRequest((r) => POLA.test(r.url()), { timeout: 30_000 });
    await tpl.buka(DATA.rute, DATA.jadwalA);
    const m = (await muat).url().match(POLA);
    test.skip(!m, 'Halaman Template tidak lagi memuat data keberangkatan — temuan sudah diperbaiki');
    const [, tanggal, id] = m!;
    const urlDetail = `/capacity-departures/${tanggal}/${id}`;

    // kondisi awal keberangkatan terdampak
    const detail = new DetailKeberangkatanPage(page);
    await page.goto(urlDetail);
    await detail.tungguTermuat();
    await detail.bukaTab('Alokasi');
    await detail.pulihkanSemuaSubTab();
    await detail.bukaSubTab('Penumpang');
    const awal = await detail.inputMitra(DATA.kelas).inputValue();

    let putUrl = '';
    try {
      // Simpan dari halaman Template
      await tpl.buka(DATA.rute, DATA.jadwalA);
      const put = page.waitForRequest((r) => r.method() === 'PUT' && /\/allocations/.test(r.url()), { timeout: 20_000 });
      await tpl.isiMitra(DATA.kelas, String(Number(awal) + 1));
      await tpl.simpanAlokasi();
      putUrl = new URL((await put).url()).pathname;
      await tpl.expectToast('Alokasi berhasil disimpan');

      // Cek keberangkatan yang sudah ada
      await page.goto(urlDetail);
      await detail.tungguTermuat();
      await detail.bukaTab('Alokasi');
      const sesudah = await detail.inputMitra(DATA.kelas).inputValue();
      const label = (await detail.labelOverride.isVisible()) ? 'Mode ubah · override untuk keberangkatan ini' : 'Mengikuti alokasi jadwal';

      await cekTemuan(page, {
        id: 'TA-T10',
        judul: 'Simpan di halaman Template langsung mengubah keberangkatan hari ini (bukan template)',
        langkah: [
          'Buka menu Template Alokasi Rute',
          `Pilih Rute ${DATA.rute}, Jadwal ${DATA.jadwalA}`,
          `Isi Mitra kelas ${DATA.kelas} = ${Number(awal) + 1} → Simpan (toast "Alokasi berhasil disimpan")`,
          `Buka detail keberangkatan ${DATA.jadwalA} tanggal ${tanggal} → tab Alokasi`,
        ],
        ekspektasi: `Keberangkatan tanggal ${tanggal} yang sudah ada TIDAK berubah (sesuai keterangan "keberangkatan yang sudah ada tidak berubah"); template dipakai untuk keberangkatan baru`,
        aktual: `Simpan mengirim PUT ${putUrl}; keberangkatan ${tanggal} kini Mitra ${DATA.kelas} = ${sesudah} (sebelumnya ${awal}), label "${label}"`,
        cek: async () => expect(sesudah).toBe(awal),
        fokus: detail.tabelAlokasi,
      });
    } finally {
      // Pulihkan keberangkatan yang terdampak
      await page.goto(urlDetail);
      await detail.tungguTermuat();
      await detail.bukaTab('Alokasi');
      await detail.pulihkanSemuaSubTab();
      await detail.bukaSubTab('Penumpang');
      await expect(detail.inputMitra(DATA.kelas)).toHaveValue(awal);
    }
  });

  /**
   * Simpan di Template saat ini menulis ke keberangkatan yang dimuat halaman itu (lihat TA-T10).
   * Helper ini mencatat keberangkatan tersebut supaya bisa DIPULIHKAN setelah test.
   */
  async function bukaDanCatat(page: import('@playwright/test').Page) {
    const tpl = new TemplateAlokasiPage(page);
    const muat = page.waitForRequest((r) => POLA.test(r.url()), { timeout: 30_000 }).catch(() => null);
    await tpl.buka(DATA.rute, DATA.jadwalA);
    const m = (await muat)?.url().match(POLA);
    return { tpl, urlDetail: m ? `/capacity-departures/${m[1]}/${m[2]}` : '' };
  }
  async function pulihkan(page: import('@playwright/test').Page, urlDetail: string, mitraAwal: string) {
    if (urlDetail) {
      const detail = new DetailKeberangkatanPage(page);
      await page.goto(urlDetail);
      await detail.tungguTermuat();
      await detail.bukaTab('Alokasi');
      await detail.pulihkanSemuaSubTab();
    }
    // Kalau Simpan Template sudah benar-benar menyimpan ke template (TA-T10 diperbaiki), kembalikan nilainya.
    const tpl = new TemplateAlokasiPage(page);
    await tpl.buka(DATA.rute, DATA.jadwalA);
    if ((await tpl.inputMitra(DATA.kelas).inputValue()) !== mitraAwal) {
      await tpl.isiMitra(DATA.kelas, mitraAwal);
      await tpl.simpanAlokasi();
      await tpl.expectToast('Alokasi berhasil disimpan');
    }
  }

  test('[Positif] TA-11 Simpan Mitra di Template → "Alokasi berhasil disimpan", nilai bertahan saat Template dibuka lagi', async ({ page }) => {
    let { tpl, urlDetail } = await bukaDanCatat(page);
    const awalTeks = await tpl.inputMitra(DATA.kelas).inputValue();
    const awal = Number(awalTeks);
    try {
      await tpl.isiMitra(DATA.kelas, String(awal + 1));
      await tpl.simpanAlokasi();
      await tpl.expectToast('Alokasi berhasil disimpan');
      ({ tpl } = await bukaDanCatat(page));
      await expect(tpl.inputMitra(DATA.kelas)).toHaveValue(String(awal + 1));
    } finally {
      await pulihkan(page, urlDetail, awalTeks);
    }
  });

  test('[Edge] TA-12 Mitra di Template = tepat kuota kelas (batas atas) → tersimpan', async ({ page }) => {
    let { tpl, urlDetail } = await bukaDanCatat(page);
    const kuota = await tpl.kuotaKelas(DATA.kelas);
    const awalTeks = await tpl.inputMitra(DATA.kelas).inputValue();
    try {
      await tpl.isiMitra(DATA.kelas, String(kuota));
      await tpl.simpanAlokasi();
      await tpl.expectToast('Alokasi berhasil disimpan');
      ({ tpl } = await bukaDanCatat(page));
      await expect(tpl.inputMitra(DATA.kelas)).toHaveValue(String(kuota));
    } finally {
      await pulihkan(page, urlDetail, awalTeks);
    }
  });

  test('[Positif] TA-13 ubah Mitra di Template lalu "Buang Perubahan" → nilai kembali, tidak ada yang tersimpan', async ({ page }) => {
    let { tpl } = await bukaDanCatat(page);
    const awal = await tpl.inputMitra(DATA.kelas).inputValue();
    await tpl.isiMitra(DATA.kelas, String(Number(awal) + 2));
    await tpl.btnBuang.click();
    await expect(tpl.inputMitra(DATA.kelas)).toHaveValue(awal);
    ({ tpl } = await bukaDanCatat(page));
    await expect(tpl.inputMitra(DATA.kelas)).toHaveValue(awal);
  });
});