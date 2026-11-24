import { test, expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { DATA, KeberangkatanListPage, DetailKeberangkatanPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — EDIT BERSAMAAN oleh 2 petugas (MENGUBAH DATA → butuh ALLOW_WRITE=1)
 * Petugas A = `page` bawaan test; Petugas B = browser context kedua dengan sesi login yang sama (auth.json).
 * Skenario: B membuka halaman SEBELUM A menyimpan (data B "basi"), lalu B menyimpan perubahannya sendiri.
 * Yang diharapkan sistem yang aman: perubahan A tidak hilang, ATAU B diberi peringatan konflik.
 * ID: KC-0x (positif), KC-T0x (temuan)
 */

test.describe.configure({ mode: 'serial' });

// Kelas kedua untuk uji "Simpan berikutnya". Kapal rute uji hanya punya kelas REGULER,
// jadi default = kelas yang sama (channel berbeda). Isi KA_KELAS_2 di .env kalau ada kelas lain.
const KELAS2 = process.env.KA_KELAS_2 ?? DATA.kelas;

async function bukaDetail(page: Page): Promise<DetailKeberangkatanPage> {
  const list = new KeberangkatanListPage(page);
  await list.gotoTanggal(DATA.tanggalUji);
  return list.bukaDetail(DATA.jadwalA);
}

/** Petugas B: context baru dengan opsi project yang sama (baseURL, storageState, viewport, dll). */
async function petugasB(browser: Browser): Promise<Page> {
  const u = test.info().project.use as BrowserContextOptions;
  // Hanya opsi context yang relevan (opsi runner seperti trace/screenshot tidak diteruskan)
  const ctx = await browser.newContext({
    baseURL: u.baseURL,
    storageState: u.storageState,
    viewport: u.viewport,
    timezoneId: u.timezoneId,
    locale: u.locale,
    userAgent: u.userAgent,
  });
  return ctx.newPage();
}

/** Kembalikan alokasi, kapal, dan kapasitas % keberangkatan uji ke kondisi awal. */
async function pulihkanSemua(d: DetailKeberangkatanPage, persenAwal: number) {
  await d.page.reload();
  await d.tungguTermuat();
  if (!(await d.kapalTerpilih()).includes('Pakai kapal default')) {
    await d.pilihKapalDefault();
    await d.simpanKapal();
  }
  if ((await d.persenKapasitas()) !== persenAwal) await d.simpanKapasitas(persenAwal);
  await d.bukaTab('Alokasi');
  await d.pulihkanSemuaSubTab();
}

const LANGKAH_AWAL = [
  `Petugas A dan Petugas B sama-sama membuka detail keberangkatan ${DATA.jadwalA} tanggal ${DATA.tanggalUji} (dua browser/tab)`,
];

test.describe('Keberangkatan — edit bersamaan 2 petugas', () => {
  let persenAwal = 80;

  test.beforeAll(async ({ browser }) => {
    const p = await petugasB(browser);
    const d = await bukaDetail(p);
    persenAwal = await d.persenKapasitas();
    await pulihkanSemua(d, persenAwal);
    await p.context().close();
  });

  test('[Positif] KC-01 setelah A menyimpan, B yang me-reload melihat data terbaru', async ({ page, browser }) => {
    const a = await bukaDetail(page);
    const pb = await petugasB(browser);
    const b = await bukaDetail(pb);
    try {
      await a.bukaTab('Alokasi');
      await a.isiMitra(DATA.kelas, '2');
      await a.simpanAlokasi();
      await a.expectToast('Alokasi berhasil disimpan');

      await b.reloadAlokasi();
      await expect(b.inputMitra(DATA.kelas)).toHaveValue('2');
    } finally {
      await pb.context().close();
      await pulihkanSemua(a, persenAwal);
    }
  });

  test('[Temuan] KC-T01 alokasi: simpanan B (halaman lama) seharusnya tidak menghapus perubahan A tanpa peringatan', async ({ page, browser }) => {
    const a = await bukaDetail(page);
    const pb = await petugasB(browser);
    const b = await bukaDetail(pb);
    try {
      await a.bukaTab('Alokasi');
      await b.bukaTab('Alokasi'); // B sudah membuka tab Alokasi SEBELUM A menyimpan

      // A menyimpan
      await a.isiMitra(DATA.kelas, '2');
      await a.simpanAlokasi();
      await a.expectToast('Alokasi berhasil disimpan');

      // B (tanpa reload) mengubah kolom LAIN lalu menyimpan
      await b.isiKorporasi(KELAS2, '1');
      await b.simpanAlokasi();
      const toastB = b.toast.first();
      await expect(toastB).toBeVisible();
      const pesanB = (await toastB.innerText()).replace(/\n/g, ' / ');
      const bBerhasil = /berhasil/i.test(pesanB);

      await a.reloadAlokasi();
      const mitraA = await a.inputMitra(DATA.kelas).inputValue();
      const korpB = await a.inputKorporasi(KELAS2).inputValue();

      await cekTemuan(page, {
        id: 'KC-T01',
        judul: 'Dua petugas mengedit alokasi bersamaan: perubahan petugas pertama hilang tanpa peringatan',
        langkah: [
          ...LANGKAH_AWAL,
          'Keduanya membuka tab Alokasi',
          `Petugas A: isi Mitra kelas ${DATA.kelas} = 2 → Simpan (berhasil)`,
          `Petugas B (tanpa reload): isi Korporasi kelas ${KELAS2} = 1 → Simpan`,
          'Reload halaman',
        ],
        ekspektasi: `Mitra ${DATA.kelas} tetap 2 dan Korporasi ${KELAS2} = 1, ATAU Petugas B diberi peringatan "data sudah diubah, muat ulang"`,
        aktual: `Toast B: "${pesanB}"; setelah reload Mitra ${DATA.kelas} = ${mitraA}, Korporasi ${KELAS2} = ${korpB} — perubahan A ${mitraA === '2' ? 'tetap ada' : 'hilang'}`,
        cek: async () => expect(mitraA === '2' || !bBerhasil, 'perubahan A hilang tanpa peringatan').toBe(true),
        fokus: a.tabelAlokasi,
      });
    } finally {
      await pb.context().close();
      await pulihkanSemua(a, persenAwal);
    }
  });

  test('[Temuan] KC-T02 kapasitas: B ganti kapal di halaman lama seharusnya tidak menimpa kapasitas % yang baru disimpan A', async ({ page, browser }) => {
    const a = await bukaDetail(page);
    const pb = await petugasB(browser);
    const b = await bukaDetail(pb); // B melihat kapasitas lama
    const persenBaru = persenAwal === 50 ? 60 : 50;
    try {
      // A menyimpan kapasitas baru
      await a.simpanKapasitas(persenBaru);

      // B (tanpa reload) hanya mengganti kapal lalu menyimpan
      await b.pilihKapal(DATA.kapalUji, new RegExp('^' + DATA.kapalUji));
      const persenDiLayarB = await b.persenKapasitas();
      await b.btnSimpan.click();
      const toastB = b.toast.first();
      await expect(toastB).toBeVisible();
      const pesanB = (await toastB.innerText()).replace(/\n/g, ' / ');
      const bBerhasil = /berhasil/i.test(pesanB);

      await a.page.reload();
      await a.tungguTermuat();
      const persenAkhir = await a.persenKapasitas();
      const kapalAkhir = await a.kapalTerpilih();

      await cekTemuan(page, {
        id: 'KC-T02',
        judul: 'Dua petugas mengedit kapasitas bersamaan: kapasitas % dari petugas pertama tertimpa nilai lama',
        langkah: [
          ...LANGKAH_AWAL,
          `Petugas A: ubah Kapasitas operasional ${persenAwal}% → ${persenBaru}% → Simpan (berhasil)`,
          `Petugas B (tanpa reload, layar masih ${persenDiLayarB}%): hanya ganti Kapal ke "${DATA.kapalUji}" → Simpan`,
          'Reload halaman',
        ],
        ekspektasi: `Kapasitas tetap ${persenBaru}% (hanya kapal yang berubah), ATAU Petugas B diberi peringatan konflik`,
        aktual: `Toast B: "${pesanB}"; setelah reload kapasitas ${persenAkhir}%, kapal "${kapalAkhir}" — kapasitas dari A ${persenAkhir === persenBaru ? 'tetap' : 'tertimpa ' + persenAkhir + '%'}`,
        cek: async () => expect(persenAkhir === persenBaru || !bBerhasil, 'kapasitas A tertimpa tanpa peringatan').toBe(true),
        fokus: a.kapasitasInput,
      });
    } finally {
      await pb.context().close();
      await pulihkanSemua(a, persenAwal);
    }
  });
});