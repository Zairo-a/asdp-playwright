import { test, expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';
import { DATA, KeberangkatanListPage, DetailKeberangkatanPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — SESI LOGIN HABIS saat mengedit (MENGUBAH DATA → butuh ALLOW_WRITE=1)
 *
 * Cara simulasi: cookie sesi di browser test diganti token tidak valid (cookie httpOnly; nilai asli
 * tidak pernah dibaca/dicetak). Sesi asli di auth.json tidak tersentuh, jadi test lain tetap jalan.
 * Pengecekan data di server memakai browser kedua dengan sesi yang masih valid.
 *
 * ID: KS-0x (positif), KS-T0x (temuan / perlu konfirmasi)
 */

test.describe.configure({ mode: 'serial' });

const COOKIE_DIKECUALIKAN = ['device_id']; // bukan cookie sesi

function opsiContext(): BrowserContextOptions {
  const u = test.info().project.use as BrowserContextOptions;
  return { baseURL: u.baseURL, storageState: u.storageState, viewport: u.viewport, timezoneId: u.timezoneId, locale: u.locale, userAgent: u.userAgent };
}
async function contextValid(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext(opsiContext());
  return ctx.newPage();
}
/** Ganti semua cookie sesi di context ini dengan token tidak valid → server menganggap sesi berakhir. */
async function habiskanSesi(ctx: BrowserContext) {
  const semua = await ctx.cookies();
  const sesi = semua.filter((c) => !COOKIE_DIKECUALIKAN.includes(c.name));
  expect(sesi.length, 'tidak ada cookie sesi di browser test — cek auth.json').toBeGreaterThan(0);
  await ctx.clearCookies();
  await ctx.addCookies([
    ...semua.filter((c) => COOKIE_DIKECUALIKAN.includes(c.name)),
    ...sesi.map((c) => ({ ...c, value: 'token-tidak-valid-qa' })),
  ]);
}
async function bukaAlokasi(page: Page): Promise<DetailKeberangkatanPage> {
  const list = new KeberangkatanListPage(page);
  await list.gotoTanggal(DATA.tanggalUji);
  const d = await list.bukaDetail(DATA.jadwalA);
  await d.bukaTab('Alokasi');
  return d;
}
/** Dialog "Sesi Berakhir" (atau halaman login) */
function tandaSesiBerakhir(page: Page) {
  return page
    .getByRole('dialog')
    .or(page.getByRole('alertdialog'))
    .filter({ hasText: /Sesi (Berakhir|habis)|login kembali/i })
    .first();
}

const LANGKAH = [
  `Buka detail keberangkatan ${DATA.jadwalA} tanggal ${DATA.tanggalUji} → tab Alokasi`,
  `Isi Mitra kelas ${DATA.kelas} = 1 (belum Simpan)`,
  'Sesi login berakhir (mis. login di perangkat lain / token kedaluwarsa)',
  'Klik Simpan',
];

test.describe('Keberangkatan — sesi login habis saat mengedit', () => {
  let mitraAwal = '0';

  test.beforeAll(async ({ browser }) => {
    const p = await contextValid(browser);
    const d = await bukaAlokasi(p);
    await d.pulihkanSemuaSubTab();
    await d.bukaSubTab('Penumpang');
    mitraAwal = await d.inputMitra(DATA.kelas).inputValue();
    await p.context().close();
  });

  test.afterAll(async ({ browser }) => {
    const p = await contextValid(browser);
    const d = await bukaAlokasi(p);
    await d.pulihkanSemuaSubTab();
    await p.context().close();
  });

  test('[Positif] KS-01 Simpan saat sesi habis → muncul pemberitahuan sesi berakhir, bukan "berhasil"', async ({ page, context }) => {
    const d = await bukaAlokasi(page);
    await d.isiMitra(DATA.kelas, String(Number(mitraAwal) + 1));
    await habiskanSesi(context);
    await d.simpanAlokasi();

    await expect(tandaSesiBerakhir(page).or(page.locator('form').filter({ hasText: /password|kata sandi/i })).first()).toBeVisible({ timeout: 15_000 });
    await expect(d.toast.filter({ hasText: 'Alokasi berhasil disimpan' })).toHaveCount(0);
  });

  test('[Positif] KS-02 perubahan yang dikirim saat sesi habis TIDAK tersimpan di server', async ({ page, context, browser }) => {
    const d = await bukaAlokasi(page);
    await d.isiMitra(DATA.kelas, String(Number(mitraAwal) + 1));
    await habiskanSesi(context);
    await d.simpanAlokasi();
    await expect(tandaSesiBerakhir(page)).toBeVisible({ timeout: 15_000 });

    const p2 = await contextValid(browser);
    const d2 = await bukaAlokasi(p2);
    await expect(d2.inputMitra(DATA.kelas)).toHaveValue(mitraAwal);
    await p2.context().close();
  });

  test('[Positif] KS-03 membuka halaman saat sesi habis → dialog sesi berakhir, data tidak ditampilkan', async ({ page, context }) => {
    await bukaAlokasi(page);
    await habiskanSesi(context);
    await page.reload();
    await expect(tandaSesiBerakhir(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: 'Alokasi', exact: true })).toHaveCount(0);
  });

  test('[Positif] KS-04 tombol Login di dialog sesi berakhir membuka halaman login', async ({ page, context }) => {
    await bukaAlokasi(page);
    await habiskanSesi(context);
    await page.reload();
    const dlg = tandaSesiBerakhir(page);
    await expect(dlg).toBeVisible({ timeout: 20_000 });
    await dlg.getByRole('button', { name: /login|masuk/i }).click();
    await expect(page).toHaveURL(/login/i, { timeout: 15_000 });
  });

  /* --------------------------- TEMUAN / PERLU KONFIRMASI --------------------------- */

  test('[Temuan] KS-T01 saat sesi habis, pengguna seharusnya diberi tahu bahwa perubahannya BELUM tersimpan [perlu konfirmasi]', async ({ page, context }) => {
    const d = await bukaAlokasi(page);
    await d.isiMitra(DATA.kelas, String(Number(mitraAwal) + 1));
    await habiskanSesi(context);
    await d.simpanAlokasi();
    const dlg = tandaSesiBerakhir(page);
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    const teks = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
    await cekTemuan(page, {
      id: 'KS-T01',
      judul: 'Dialog sesi berakhir tidak memberi tahu bahwa perubahan alokasi belum tersimpan',
      langkah: LANGKAH,
      ekspektasi: 'Dialog menyebut bahwa perubahan belum tersimpan (atau menyimpan draf), supaya petugas tahu harus mengisi ulang setelah login',
      aktual: `Dialog: "${teks}" — tidak ada keterangan soal perubahan yang belum tersimpan`,
      cek: async () => expect(teks).toMatch(/belum (di)?simpan|tidak tersimpan|perubahan/i),
      fokus: dlg,
    });
  });

  test('[Temuan] KS-T02 setelah login ulang, pengguna seharusnya kembali ke halaman yang sedang dibuka [perlu konfirmasi]', async ({ page, context }) => {
    const d = await bukaAlokasi(page);
    const urlDetail = new URL(page.url()).pathname;
    await habiskanSesi(context);
    await page.reload();
    const dlg = tandaSesiBerakhir(page);
    await expect(dlg).toBeVisible({ timeout: 20_000 });
    await dlg.getByRole('button', { name: /login|masuk/i }).click();
    await expect(page).toHaveURL(/login/i, { timeout: 15_000 });
    const urlLogin = page.url();
    const adaTujuan = decodeURIComponent(urlLogin).includes(urlDetail);
    await cekTemuan(page, {
      id: 'KS-T02',
      judul: 'Halaman login tidak mengingat halaman terakhir (setelah login, petugas tidak kembali ke keberangkatan yang sedang diedit)',
      langkah: [`Buka detail keberangkatan ${DATA.jadwalA}`, 'Sesi login berakhir → muncul dialog "Sesi Berakhir"', 'Klik Login'],
      ekspektasi: `URL halaman login membawa alamat tujuan (mis. ?redirect=${urlDetail}) supaya setelah login kembali ke halaman ini`,
      aktual: `URL login: ${new URL(urlLogin).pathname}${new URL(urlLogin).search ? ' (+ parameter)' : ''} — ${adaTujuan ? 'membawa' : 'tidak membawa'} alamat halaman terakhir`,
      cek: async () => expect(adaTujuan).toBe(true),
    });
    void d;
  });
});