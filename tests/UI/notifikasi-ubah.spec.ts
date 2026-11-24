import { test, expect, type BrowserContextOptions } from '@playwright/test';
import { KategoriNotifPage, TemplateNotifPage, KirimNotifPage, TriggerNotifPage, bersihkanNotifQA, unik } from './pages/notifikasi.pages';
import { cekTemuan } from './pages/kapasitas.pages';

/**
 * MANAJEMEN NOTIFIKASI — MENGUBAH DATA (butuh ALLOW_WRITE=1) — DISETUJUI USER 24 Nov 2026
 * Data uji: kategori "QAN…" dan template "NTF-QA…" (kanal Push), trigger QA dengan "Trigger aktif" = OFF.
 * AMAN: TIDAK ADA notifikasi yang dikirim. Kirim Notifikasi hanya dicek sampai langkah Tinjau lalu DIBATALKAN
 *   (tidak menekan "Simpan draft" — draft tidak bisa dihapus, lihat NT-T01; tidak menekan "Konfirmasi Kirim").
 * Semua data uji dihapus di awal & akhir (trigger → template → kategori).
 * ID: NT-3x/4x
 */

test.describe.configure({ mode: 'serial' });
test.skip(process.env.ALLOW_WRITE !== '1', 'Set ALLOW_WRITE=1 untuk menjalankan test yang mengubah data');

const U = unik();
const AW_KAT = 'QAN';
const AW_TPL = 'NTF-QA';
const KAT = AW_KAT + U;
const KAT2 = AW_KAT + U + 'B';
const NAMA_KAT = 'QA Kategori ' + KAT;
const TPL = AW_TPL + U;
const TPL_RUTE = AW_TPL + U + '-R';
const NAMA_TPL = 'QA Template ' + TPL;
let katDibuat = false;
let tplDibuat = false;
let trgDibuat = false;

async function bersihkan(playwright: any) {
  const u = test.info().project.use as BrowserContextOptions & { baseURL?: string };
  const req = await playwright.request.newContext({ baseURL: u.baseURL, storageState: u.storageState as string });
  try {
    const sisa = await bersihkanNotifQA(req, AW_KAT, AW_TPL);
    if (sisa) console.log(`[PERINGATAN] ${sisa} data uji notifikasi QA belum terhapus`);
  } finally {
    await req.dispose();
  }
}
test.beforeAll(async ({ playwright }) => bersihkan(playwright));
test.afterAll(async ({ playwright }) => bersihkan(playwright));

test.describe('Notifikasi — Kategori', () => {
  test('[Positif] NT-30 tambah kategori QA → muncul di daftar: Aktif, Template 0', async ({ page }) => {
    const p = new KategoriNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: KAT, nama: NAMA_KAT, deskripsi: 'QA automation' });
    expect(await p.simpan()).toMatch(/berhasil ditambahkan/i);
    katDibuat = true;
    await expect(p.form).toBeHidden();
    await p.goto({ search: KAT });
    const r = p.barisTeks(KAT);
    await expect(r).toHaveCount(1);
    await expect(r).toContainText(NAMA_KAT);
    await expect(r).toContainText('Aktif');
    await expect(r.locator('td').nth(4)).toHaveText('0');
  });

  test('[Negatif] NT-31 kode kategori yang sudah dipakai → "Kode sudah dipakai.", tidak ada data ganda', async ({ page }) => {
    test.skip(!katDibuat, 'NT-30 gagal');
    const p = new KategoriNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: KAT, nama: 'QA dup ' + U });
    const h = await p.simpan();
    expect(h).not.toMatch(/berhasil/i);
    await expect.poll(() => p.pesan()).toContain('Kode sudah dipakai.');
    await p.batalForm('Close');
    await p.goto({ search: KAT });
    await expect(p.barisTeks(KAT)).toHaveCount(1);
  });

  test('[Negatif] NT-32 nama kategori yang sama (kode beda) → ditolak', async ({ page }) => {
    test.skip(!katDibuat, 'NT-30 gagal');
    const p = new KategoriNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: KAT2, nama: NAMA_KAT });
    const h = await p.simpan();
    const pesan = await p.pesan();
    if (await p.form.isVisible()) await p.batalForm('Close');
    expect(h, `toast: ${h}; pesan: ${pesan.join(' / ')}`).not.toMatch(/berhasil/i);
  });

  test('[Positif] NT-33 ubah nama & deskripsi kategori → tersimpan; kode tetap', async ({ page }) => {
    test.skip(!katDibuat, 'NT-30 gagal');
    const p = new KategoriNotifPage(page);
    await p.goto({ search: KAT });
    await p.aksiBaris(KAT, 'Ubah');
    await expect(p.form).toBeVisible();
    await expect(p.kode).toHaveValue(KAT);
    await p.isi({ deskripsi: 'QA automation diubah' });
    expect(await p.simpan()).toMatch(/berhasil/i);
    await p.goto({ search: KAT });
    await expect(p.barisTeks(KAT)).toContainText('QA automation diubah');
  });

  test('[Dampak] NT-34 kategori baru (Aktif) muncul di pilihan Kategori form Template', async ({ page }) => {
    test.skip(!katDibuat, 'NT-30 gagal');
    const p = new TemplateNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    expect(await p.opsi(p.kategori)).toContain(NAMA_KAT);
    await p.batalForm('Close');
  });
});

test.describe('Notifikasi — Template', () => {
  test('[Positif] NT-35 tambah template QA (Push, "Halo {nama}") → muncul: kategori QA, Push, Aktif', async ({ page }) => {
    test.skip(!katDibuat, 'NT-30 gagal');
    const p = new TemplateNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kategori: NAMA_KAT, kode: TPL, nama: NAMA_TPL, judul: 'QA Judul', isi: 'Halo {nama}' });
    await expect(p.pratinjau).toContainText('Halo Budi');
    expect(await p.simpan()).toMatch(/berhasil disimpan/i);
    tplDibuat = true;
    await p.goto({ search: TPL });
    const r = p.barisTeks(TPL);
    await expect(r.first()).toContainText(NAMA_TPL);
    await expect(r.first()).toContainText(NAMA_KAT);
    await expect(r.first()).toContainText('Push');
    await expect(r.first()).toContainText('Aktif');
  });

  test('[Dampak] NT-36 kolom "Template" di Kategori QA jadi 1', async ({ page }) => {
    test.skip(!tplDibuat, 'NT-35 gagal');
    const p = new KategoriNotifPage(page);
    await p.goto({ search: KAT });
    await expect(p.barisTeks(KAT).locator('td').nth(4)).toHaveText('1');
  });

  test('[Negatif] NT-37 kode + kanal yang sama (Push) → "sudah punya varian Push"', async ({ page }) => {
    test.skip(!tplDibuat, 'NT-35 gagal');
    const p = new TemplateNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kategori: NAMA_KAT, kode: TPL, nama: 'QA dup', isi: 'dup' });
    expect(await p.simpan()).not.toMatch(/berhasil/i);
    await expect.poll(() => p.pesan()).toContain(`${TPL} sudah punya varian Push.`);
    await p.batalForm('Close');
  });

  test('[Positif] NT-38 Ubah template → kode terkunci (tidak bisa diedit)', async ({ page }) => {
    test.skip(!tplDibuat, 'NT-35 gagal');
    const p = new TemplateNotifPage(page);
    await p.goto({ search: TPL });
    const menu = await p.menuBaris(TPL);
    expect(menu).toEqual(expect.arrayContaining(['Ubah', 'Pratinjau', 'Nonaktifkan', 'Hapus']));
    await p.menu.getByRole('menuitem', { name: 'Ubah', exact: true }).click();
    await expect(p.form).toBeVisible();
    await expect(p.kode).toHaveValue(TPL);
    await expect(p.kode).not.toBeEditable();
    await p.batalForm('Close');
  });

  test('[Dampak] NT-39 template baru (Aktif) muncul di pilihan Template Kirim Notifikasi & Trigger', async ({ page }) => {
    test.skip(!tplDibuat, 'NT-35 gagal');
    const k = new KirimNotifPage(page);
    await k.goto();
    await k.bukaTambah();
    expect((await k.opsi(k.template)).join(' | ')).toContain(TPL);
    await k.batalForm('Close');
    const t = new TriggerNotifPage(page);
    await t.goto();
    await t.bukaTambah();
    expect((await t.opsi(t.template)).join(' | ')).toContain(TPL);
    await t.batalForm('Close');
  });
});

test.describe('Notifikasi — Kirim Notifikasi (TANPA menyimpan / mengirim)', () => {
  test('[Positif] NT-40 wizard 4 langkah: Pesan → Penerima (Broadcast) → Jadwal → Tinjau (ada "Konfirmasi Kirim") → Batal, tidak ada data baru', async ({ page }) => {
    test.skip(!tplDibuat, 'NT-35 gagal');
    const p = new KirimNotifPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.bukaTambah();
    await p.namaNotif.fill('QA Kampanye ' + U);
    await p.pilihOpsi(p.template, new RegExp(TPL));
    await expect(p.form.getByRole('checkbox', { name: 'Push' })).toBeChecked();
    await p.berikutnya();
    await expect(p.form.getByText('2/4', { exact: true })).toBeVisible();
    await expect(p.form.getByRole('radio', { name: /^Broadcast/ })).toBeChecked();
    await p.berikutnya();
    await expect(p.form.getByText('3/4', { exact: true })).toBeVisible();
    await expect(p.form.getByRole('radiogroup', { name: 'Waktu kirim' })).toBeVisible();
    await expect(p.form.getByRole('radio', { name: /^Kirim sekarang/ })).toBeChecked();
    await p.berikutnya();
    await expect(p.form.getByText('4/4', { exact: true })).toBeVisible();
    await expect(p.form.getByRole('heading', { name: 'Ringkasan' })).toBeVisible();
    await expect(p.btnKirim).toBeVisible(); // TIDAK diklik
    await p.batalForm('Batal');
    await p.goto();
    expect(await p.totalData(), 'tidak ada kampanye/draft baru').toBe(awal);
  });

  test('[Negatif] NT-41 template memakai {rute} + Broadcast → peringatan "Pilih mode Tertarget …"', async ({ page }) => {
    test.skip(!katDibuat, 'NT-30 gagal');
    const t = new TemplateNotifPage(page);
    await t.goto();
    await t.bukaTambah();
    await t.isi({ kategori: NAMA_KAT, kode: TPL_RUTE, nama: 'QA Template Rute ' + U, judul: 'QA', isi: 'Jadwal {rute} berubah' });
    expect(await t.simpan()).toMatch(/berhasil/i);
    const p = new KirimNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.namaNotif.fill('QA Kampanye Rute ' + U);
    await p.pilihOpsi(p.template, new RegExp(TPL_RUTE));
    await p.berikutnya();
    await expect(p.form.getByRole('alert').filter({ hasText: /\{rute\}.*Tertarget/ })).toBeVisible();
    await p.batalForm('Close');
  });
});

test.describe('Notifikasi — Trigger Otomatis (nonaktif)', () => {
  test('[Positif] NT-42 tambah trigger QA "Tarif berubah" dengan Trigger aktif OFF → muncul di daftar, status Nonaktif', async ({ page }) => {
    test.skip(!tplDibuat, 'NT-35 gagal');
    const p = new TriggerNotifPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.bukaTambah();
    await p.pilihOpsi(p.event, 'Tarif berubah');
    await p.pilihOpsi(p.template, new RegExp(TPL));
    await expect(p.form.getByRole('checkbox', { name: 'Push' })).toBeChecked();
    if (await p.role.isVisible()) await p.pilihOpsi(p.role, /./);
    await p.aktif.click();
    await expect(p.aktif).toHaveAttribute('aria-checked', 'false');
    const h = await p.simpan();
    expect(h, `pesan: ${(await p.pesan()).join(' / ')}`).toMatch(/berhasil/i);
    trgDibuat = true;
    await p.goto();
    expect(await p.totalData()).toBe(awal + 1);
    const r = p.barisTeks(TPL);
    await expect(r).toHaveCount(1);
    await expect(r).toContainText('Tarif berubah');
    await expect(r).toContainText(/Nonaktif/);
  });
});

test.describe('Notifikasi — dampak status & hapus', () => {
  test('[Dampak] NT-43 kategori yang masih dipakai template → menu Hapus diganti "N template" (nonaktif), kategori tetap ada', async ({ page }) => {
    test.skip(!tplDibuat, 'NT-35 gagal');
    const p = new KategoriNotifPage(page);
    await p.goto({ search: KAT });
    const menu = await p.menuBaris(KAT);
    await page.keyboard.press('Escape');
    expect(menu).not.toContain('Hapus');
    const item = p.menu.getByRole('menuitem', { name: /^\d+ template$/ });
    await p.menuBaris(KAT);
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(p.barisTeks(KAT)).toHaveCount(1);
  });

  test('[Dampak] NT-44 template Nonaktif → hilang dari pilihan Kirim Notifikasi & Trigger', async ({ page }) => {
    test.skip(!tplDibuat, 'NT-35 gagal');
    const t = new TemplateNotifPage(page);
    await t.goto({ search: TPL });
    expect(await t.ubahStatus(TPL, false)).toMatch(/berhasil|dinonaktifkan/i);
    await t.goto({ search: TPL });
    await expect(t.barisTeks(TPL).filter({ hasNotText: TPL_RUTE }).first()).toContainText(/Nonaktif/);
    const k = new KirimNotifPage(page);
    await k.goto();
    await k.bukaTambah();
    const opsiK = (await k.opsi(k.template)).filter((x) => !x.includes(TPL_RUTE));
    await k.batalForm('Close');
    const g = new TriggerNotifPage(page);
    await g.goto();
    await g.bukaTambah();
    const opsiT = (await g.opsi(g.template)).filter((x) => !x.includes(TPL_RUTE));
    await g.batalForm('Close');
    expect(opsiK.join(' | '), 'Kirim Notifikasi').not.toContain(TPL);
    expect(opsiT.join(' | '), 'Trigger').not.toContain(TPL);
  });

  test('[Dampak] NT-45 kategori Nonaktif → hilang dari pilihan Kategori form Template', async ({ page }) => {
    test.skip(!katDibuat, 'NT-30 gagal');
    const p = new KategoriNotifPage(page);
    await p.goto({ search: KAT });
    expect(await p.ubahStatus(KAT, false)).toMatch(/berhasil|dinonaktifkan/i);
    const t = new TemplateNotifPage(page);
    await t.goto();
    await t.bukaTambah();
    expect(await t.opsi(t.kategori)).not.toContain(NAMA_KAT);
    await t.batalForm('Close');
  });

  test('[Positif] NT-46 hapus trigger → template → kategori QA lewat layar → semuanya hilang dari daftar', async ({ page }) => {
    test.skip(!katDibuat, 'NT-30 gagal');
    if (trgDibuat) {
      const g = new TriggerNotifPage(page);
      await g.goto();
      expect((await g.hapusBaris(TPL)).toast).toMatch(/berhasil/i);
      await g.goto();
      await expect(g.barisTeks(TPL)).toHaveCount(0);
    }
    const t = new TemplateNotifPage(page);
    for (const kode of [TPL_RUTE, TPL]) {
      await t.goto({ search: kode });
      if (await t.rows.filter({ has: page.locator('td').first().filter({ hasText: new RegExp(`^${kode}$`) }) }).count()) {
        await t.barisTeks(kode).first().getByRole('button', { name: 'Buka menu' }).click();
        await t.menu.getByRole('menuitem', { name: 'Hapus', exact: true }).click();
        await t.konfirmasi.getByRole('button', { name: 'Hapus', exact: true }).click();
        await t.expectToast(/berhasil dihapus/i);
      }
    }
    await t.goto({ search: TPL });
    await expect.poll(() => t.totalData()).toBe(0);
    const k = new KategoriNotifPage(page);
    await k.goto({ search: KAT });
    expect((await k.hapusBaris(KAT)).toast).toMatch(/berhasil dihapus/i);
    await k.goto({ search: KAT });
    await expect.poll(() => k.totalData()).toBe(0);
  });
});
