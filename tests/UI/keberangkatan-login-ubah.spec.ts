import { test, expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { DATA, KeberangkatanListPage } from './pages/kapasitas.pages';

/**
 * SESI — LOGIN DI TEMPAT LAIN (butuh ALLOW_WRITE=1 karena bisa mengakhiri sesi lain)
 *
 * Kredensial dibaca dari .env (TIDAK pernah dicetak):
 *   QA_CMS_USER=...   QA_CMS_PASS=...
 * Test dilewati otomatis kalau dua variabel itu belum diisi.
 *
 * Pengaman: setelah login baru, sesi baru itu DISIMPAN ke auth.json, supaya test berikutnya
 * tetap punya sesi yang valid walaupun ternyata login baru menendang sesi lama.
 * ID: KL-0x
 */

test.describe.configure({ mode: 'serial' });

const USER = process.env.QA_CMS_USER ?? '';
const PASS = process.env.QA_CMS_PASS ?? '';

function opsiContext(denganSesi: boolean): BrowserContextOptions {
  const u = test.info().project.use as BrowserContextOptions;
  return {
    baseURL: u.baseURL,
    storageState: denganSesi ? u.storageState : undefined,
    viewport: u.viewport,
    timezoneId: u.timezoneId,
    locale: u.locale,
    userAgent: u.userAgent,
  };
}

/** Halaman login CMS: "Username / Email", kolom kata sandi, tombol "Log in". */
async function login(page: Page, user: string, pass: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Username / Email' }).fill(user);
  await page.locator('input[type="password"]').fill(pass);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

async function sesiMasihAktif(page: Page) {
  const list = new KeberangkatanListPage(page);
  await list.goto({ route_id: DATA.ruteId, date_from: DATA.tanggalUji, date_to: DATA.tanggalUji });
  const ok = list.rows.filter({ has: page.getByRole('link') }).first();
  const berakhir = page.getByText(/Sesi (Berakhir|habis)|login kembali/i).first();
  const diLogin = page.getByRole('textbox', { name: 'Username / Email' });
  await expect(ok.or(berakhir).or(diLogin).first()).toBeVisible({ timeout: 30_000 });
  return ok.isVisible();
}

async function contextBaru(browser: Browser, denganSesi: boolean) {
  const ctx = await browser.newContext(opsiContext(denganSesi));
  return { ctx, page: await ctx.newPage() };
}

test.describe('Sesi — login di tempat lain', () => {
  test.skip(!USER || !PASS, 'Isi QA_CMS_USER dan QA_CMS_PASS di .env untuk menjalankan test ini');

  test('[Negatif] KL-01 password salah → tetap di halaman login & muncul pesan kesalahan', async ({ browser }) => {
    const { ctx, page } = await contextBaru(browser, false);
    try {
      await login(page, USER, PASS + '-salah-qa');
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
      await expect(
        page.getByRole('alert').or(page.getByText(/salah|tidak valid|gagal|invalid|incorrect/i)).first(),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test('[Positif] KL-02 login dengan akun yang benar → masuk ke CMS (keluar dari halaman login)', async ({ browser }) => {
    const { ctx, page } = await contextBaru(browser, false);
    try {
      await login(page, USER, PASS);
      await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
      // simpan sesi baru ini → auth.json tetap valid untuk test berikutnya
      await ctx.storageState({ path: 'auth.json' });
    } finally {
      await ctx.close();
    }
  });

  test('[Eksplorasi] KL-03 apakah login di tempat lain mengakhiri sesi yang sedang dipakai? (satu akun satu sesi)', async ({ browser }) => {
    // Sesi "lama" = auth.json saat ini
    const lama = await contextBaru(browser, true);
    const aktifSebelum = await sesiMasihAktif(lama.page);
    expect(aktifSebelum, 'sesi auth.json harus aktif sebelum uji dimulai').toBe(true);

    // Login baru di "perangkat lain"
    const baru = await contextBaru(browser, false);
    await login(baru.page, USER, PASS);
    await expect(baru.page).not.toHaveURL(/\/login/, { timeout: 30_000 });

    // Cek sesi lama
    const aktifSesudah = await sesiMasihAktif(lama.page);
    const hasil = aktifSesudah
      ? 'Sesi lama TETAP AKTIF setelah login di tempat lain → akun yang sama bisa dipakai bersamaan (tidak ada aturan satu sesi).'
      : 'Sesi lama BERAKHIR setelah login di tempat lain → berlaku aturan SATU AKUN SATU SESI. Jangan login/buka CMS dengan akun yang sama saat test berjalan.';
    console.log(`[EKSPLORASI] KL-03: ${hasil}`);
    test.info().annotations.push({ type: 'hasil', description: hasil });

    // Pengaman: simpan sesi yang PASTI valid (yang baru) ke auth.json
    await baru.ctx.storageState({ path: 'auth.json' });
    await lama.ctx.close();
    await baru.ctx.close();
  });
}); 