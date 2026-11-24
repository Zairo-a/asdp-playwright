import { test, expect, type Page } from '@playwright/test';
import { DATA, TemplateAlokasiPage, cekTemuan, ruteRegex } from './pages/kapasitas.pages';

/**
 * TEMPLATE ALOKASI RUTE (menu) — halaman /capacity-templates, judul "Alokasi Kuota Jadwal" (READ-ONLY)
 * Keterangan di layar: "Mode B, rute dan jadwal wajib dipilih … Dipakai saat keberangkatan baru dibuat;
 * keberangkatan yang sudah ada tidak berubah." dan "Nilai awal dari Alokasi Kuota Jadwal (dalam %)".
 * ID: TA-0x (fungsi), TA-T0x (temuan)
 */

const POLA_ALOKASI = /\/capacity\/departures\/(\d{4}-\d{2}-\d{2})\/(\d+)\/allocations/;

async function bukaKosong(page: Page) {
  const tpl = new TemplateAlokasiPage(page);
  await page.goto('/capacity-templates');
  await expect(tpl.rute).toBeVisible();
  return tpl;
}

const LANGKAH = [
  'Buka menu Template Alokasi Rute',
  `Pilih Rute ${DATA.rute}`,
  `Pilih Jadwal ${DATA.jadwalA}`,
];

test.describe('Template Alokasi Rute — read-only', () => {
  test('[Positif] TA-01 state awal: Rute wajib, Jadwal terkunci, pesan "Pilih rute terlebih dahulu"', async ({ page }) => {
    const tpl = await bukaKosong(page);
    await expect(tpl.main).toContainText('Rute *');
    await expect(tpl.main).toContainText('Jadwal *');
    await expect(tpl.rute).toHaveText(/Pilih rute/);
    await expect(tpl.jadwal).toBeDisabled();
    await expect(tpl.main).toContainText('Pilih rute terlebih dahulu');
  });

  test('[Positif] TA-02 pilih rute → Jadwal aktif & hanya berisi jadwal rute tersebut', async ({ page }) => {
    const tpl = await bukaKosong(page);
    await tpl.pilihCombobox(tpl.rute, 'Cari rute', DATA.rute, ruteRegex(DATA.rute));
    await expect(tpl.jadwal).toBeEnabled();
    await expect(tpl.main).toContainText('Pilih jadwal untuk memuatnya');
    await tpl.jadwal.click();
    const opsi = (await tpl.popover.getByRole('option').allInnerTexts()).map((x) => x.trim());
    await page.keyboard.press('Escape');
    expect(opsi.length).toBeGreaterThan(0);
    const kode = DATA.jadwalA.split('-').slice(0, 2).join('-'); // mis. MRK-BKH
    for (const o of opsi) expect(o, 'jadwal harus milik rute terpilih').toContain(kode);
  });

  test('[Positif] TA-03 pilih rute + jadwal → tabel alokasi tampil, sub-tab Penumpang & Kendaraan tersedia', async ({ page }) => {
    const tpl = new TemplateAlokasiPage(page);
    await tpl.buka(DATA.rute, DATA.jadwalA);
    await expect(tpl.tabelAlokasi).toBeVisible();
    await expect(tpl.subTab('Penumpang')).toBeVisible();
    await expect(tpl.subTab('Kendaraan')).toBeVisible();
    await tpl.bukaSubTab('Kendaraan');
    await expect(tpl.tabelGolongan).toBeVisible();
  });

  test('[Negatif] TA-04 cari rute yang tidak ada → "Tidak ditemukan"', async ({ page }) => {
    const tpl = await bukaKosong(page);
    await tpl.rute.click();
    await tpl.popover.getByPlaceholder('Cari rute').fill('ZZZXQ-TIDAK-ADA');
    await expect(tpl.popover.getByText('Tidak ditemukan')).toBeVisible();
    await expect(tpl.popover.getByRole('option')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(tpl.jadwal).toBeDisabled();
  });

  test('[Edge] TA-05 ganti rute setelah jadwal dipilih → pilihan jadwal ter-reset', async ({ page }) => {
    const tpl = new TemplateAlokasiPage(page);
    await tpl.buka(DATA.rute, DATA.jadwalA);
    await tpl.pilihCombobox(tpl.rute, 'Cari rute', DATA.rute2, ruteRegex(DATA.rute2));
    await expect(tpl.jadwal).not.toContainText(DATA.jadwalA);
  });

  /* --------------------------------- TEMUAN --------------------------------- */

  test('[Temuan] TA-T01 halaman Template seharusnya memuat data TEMPLATE, bukan keberangkatan hari ini', async ({ page }) => {
    const tpl = new TemplateAlokasiPage(page);
    const req = page.waitForRequest((r) => /\/allocations/.test(r.url()), { timeout: 30_000 });
    await tpl.buka(DATA.rute, DATA.jadwalA);
    const url = (await req).url();
    const m = url.match(POLA_ALOKASI);
    await cekTemuan(page, {
      id: 'TA-T01',
      judul: 'Halaman "Template Alokasi Rute" memuat alokasi keberangkatan hari ini, bukan template jadwal',
      langkah: [...LANGKAH, 'Lihat data yang dimuat (Network: …/allocations)'],
      ekspektasi: 'Halaman memuat template alokasi jadwal (nilai awal, dalam %), bukan data satu keberangkatan',
      aktual: m
        ? `Data dimuat dari keberangkatan tanggal ${m[1]} (id ${m[2]}): ${new URL(url).pathname}; tabel menampilkan kolom "terjual" milik keberangkatan itu`
        : `Data dimuat dari ${new URL(url).pathname}`,
      cek: async () => expect(url).not.toMatch(POLA_ALOKASI),
      fokus: tpl.tabelAlokasi,
    });
  });

  test('[Temuan] TA-T02 nilai template seharusnya dalam % sesuai keterangan di layar [perlu konfirmasi]', async ({ page }) => {
    const tpl = new TemplateAlokasiPage(page);
    await tpl.buka(DATA.rute, DATA.jadwalA);
    const teks = await tpl.main.innerText();
    const adaPersen = /\d+\s*%/.test(await tpl.tabelAlokasi.innerText());
    const adaTerjual = /terjual/i.test(await tpl.tabelAlokasi.innerText());
    await cekTemuan(page, {
      id: 'TA-T02',
      judul: 'Keterangan menyebut nilai template "dalam %", tetapi tabel menampilkan kursi dan kolom "terjual"',
      langkah: [...LANGKAH, 'Baca keterangan di atas tabel, bandingkan dengan isi tabel'],
      ekspektasi: 'Tabel template menampilkan persentase per kelompok channel/kelas, tanpa angka terjual',
      aktual: `Keterangan: "${(teks.match(/Nilai awal dari[^.]*\./) ?? [''])[0]}"; tabel ${adaPersen ? 'berisi' : 'tidak berisi'} nilai %, ${adaTerjual ? 'berisi' : 'tidak berisi'} kolom "terjual"`,
      cek: async () => {
        expect(adaPersen).toBe(true);
        expect(adaTerjual).toBe(false);
      },
      fokus: tpl.tabelAlokasi,
    });
  });

  test('[Temuan] TA-T03 pilihan rute & jadwal seharusnya tetap setelah reload (seperti halaman Keberangkatan)', async ({ page }) => {
    const tpl = new TemplateAlokasiPage(page);
    await tpl.buka(DATA.rute, DATA.jadwalA);
    await page.reload();
    await expect(tpl.rute).toBeVisible();
    const rute = (await tpl.rute.innerText()).trim();
    const jadwal = (await tpl.jadwal.innerText()).trim();
    await cekTemuan(page, {
      id: 'TA-T03',
      judul: 'Pilihan rute & jadwal di Template hilang setelah reload',
      langkah: [...LANGKAH, 'Tekan F5 / reload halaman'],
      ekspektasi: `Rute "${DATA.rute}" dan jadwal "${DATA.jadwalA}" tetap terpilih (tersimpan di URL, seperti halaman Keberangkatan & Alokasi)`,
      aktual: `Setelah reload: Rute "${rute}", Jadwal "${jadwal}" — pilihan hilang, URL tanpa parameter`,
      cek: async () => expect(rute).toContain(DATA.rute),
      fokus: tpl.rute,
    });
  });
});