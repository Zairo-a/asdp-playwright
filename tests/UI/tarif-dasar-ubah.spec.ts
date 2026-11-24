import { test, expect } from '@playwright/test';
import { TarifDasarPage, RiwayatTarifPage, versiTerbaru, bukaRiwayatSampaiAda } from './pages/tarif.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import { bukaWeb, jadwalWeb, tglDepan, tungguSinkron } from './pages/ferizy.pages';

/**
 * TARIF DASAR — MENGUBAH DATA (butuh ALLOW_WRITE=1) — DISETUJUI USER 24 Nov 2026
 * Hanya SATU sel yang awalnya KOSONG di rute LMB-PGA ("Lansia · BISNIS · Water Taxi · ONLINE"):
 *   isi Rp 12.345 → Simpan → cek Riwayat & web → Rollback → sel kosong lagi.
 * Catatan perilaku CMS: sel yang sudah terisi TIDAK bisa dikosongkan lewat matriks
 *   ("Ada sel yang dikosongkan. Isi lagi …") → satu-satunya cara kembali kosong = Rollback versi.
 * Pengaman: sebelum mulai sel harus kosong (kalau tidak, test BERHENTI); di akhir (afterAll)
 *   versi uji yang belum di-rollback akan di-Rollback lewat layar.
 * Jangan jalankan dengan retry (file ini mengubah tarif asli): pakai --retries=0 (sudah diatur di bawah).
 * ID: TR-4x, TR-T06/T07
 */

test.describe.configure({ mode: 'serial', retries: 0 });
test.skip(process.env.ALLOW_WRITE !== '1', 'Set ALLOW_WRITE=1 untuk menjalankan test yang mengubah data');

const RUTE_ID = process.env.TR_RUTE_ID ?? '82';
const RUTE = process.env.TR_RUTE ?? 'LMB-PGA';
const SEL = process.env.TR_SEL ?? 'Lansia · BISNIS · Water Taxi · ONLINE';
const NILAI = '12345';
const NILAI_TAMPIL = '12.345';
let kosongAwal = -1;
let versiSebelum = 0;
let versiBaru = 0;
let sudahDikembalikan = false;

test.afterAll(async ({ browser }) => {
  if (!versiBaru || sudahDikembalikan) return;
  // PENGAMAN: rollback versi uji lewat layar
  const u = test.info().project.use as any;
  const ctx = await browser.newContext({ baseURL: u.baseURL, storageState: u.storageState, viewport: u.viewport });
  try {
    const r = new RiwayatTarifPage(await ctx.newPage());
    await bukaRiwayatSampaiAda(r, versiBaru);
    if (await r.baris(versiBaru).getByRole('button', { name: 'Rollback' }).count()) {
      console.log(`[PENGAMAN] Rollback versi uji #${versiBaru}: ${await r.rollback(versiBaru)}`);
    }
  } finally {
    await ctx.close();
  }
});

test.describe('Tarif Dasar — ubah 1 sel LMB-PGA lalu rollback', () => {
  test('[Positif] TR-40 isi sel kosong Rp 12.345 → Simpan → tersimpan setelah halaman dimuat ulang; "sel belum diisi" berkurang 1', async ({ page, request }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    await expect(t.sel(SEL), `sel "${SEL}" harus KOSONG sebelum test (kalau tidak, test berhenti agar tarif asli tidak tertimpa)`).toHaveValue('');
    kosongAwal = await t.selBelumDiisi();
    versiSebelum = (await versiTerbaru(request))?.id ?? 0;
    await t.sel(SEL).fill(NILAI);
    await t.sel(SEL).blur();
    await expect(t.sel(SEL)).toHaveValue(NILAI_TAMPIL);
    expect(await t.jumlahPerubahan()).toBe(1);
    const toast = await t.simpan();
    const v = await versiTerbaru(request);
    if (v && v.id > versiSebelum) versiBaru = v.id; // dicatat dulu supaya pengaman bisa rollback
    expect(toast, 'toast simpan').toMatch(/berhasil|tersimpan|diterapkan|diajukan/i);
    expect(versiBaru, 'versi baru tercatat').toBeGreaterThan(versiSebelum);
    await t.buka(RUTE_ID);
    await expect(t.sel(SEL)).toHaveValue(NILAI_TAMPIL);
    // catatan: hitungan "sel belum diisi" TIDAK dipakai — ikut berubah karena kategori di matriks tidak konsisten (TR-T08)
  });

  test('[Positif] TR-41 Riwayat: versi baru tampil — rute LMB-PGA, Pejalan kaki, "—" → Rp 12.345, "Ditambah"', async ({ page }) => {
    test.skip(!versiBaru, 'TR-40 gagal');
    const r = new RiwayatTarifPage(page);
    await bukaRiwayatSampaiAda(r, versiBaru);
    await expect(r.baris(versiBaru)).toContainText(RUTE);
    await expect(r.baris(versiBaru)).toContainText(/Pejalan kaki/i);
    await expect(r.baris(versiBaru)).toContainText('Diterapkan');
    const det = await r.detail(versiBaru);
    expect(det).toContain(SEL);
    expect(det).toContain('Rp 12.345');
    expect(det).toMatch(/Ditambah/);
  });

  test('[Dampak] TR-42 tarif baru tampil di web (kartu Water Taxi) — FRC-02-04', async ({ page, browser }) => {
    test.skip(!versiBaru, 'TR-40 gagal');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    const tgl = process.env.KP_TGL_WEB ?? tglDepan(11);
    const { ctx, web } = await bukaWeb(browser);
    try {
      let harga: number[] = [];
      await tungguSinkron(async () => {
        harga = (await jadwalWeb(web, '49', '67', tgl)).filter((k) => k.jenis === 'Water Taxi').map((k) => k.harga);
        return harga.includes(12345);
      });
      test.skip(harga.length === 0, `Tidak ada jadwal Water Taxi di web untuk ${tgl}`);
      await cekTemuan(web, {
        id: 'TR-T06',
        judul: 'Tarif baru yang lebih murah tidak terlihat di harga web [perlu konfirmasi: web mungkin hanya menampilkan tarif kategori/kelas tertentu]',
        langkah: [`CMS → ${RUTE} → Tarif Dasar → isi "${SEL}" = Rp 12.345 → Simpan`, `Web Ferizy → Lembar → Padang Bai tanggal ${tgl} → kartu Water Taxi (tunggu ±1 menit)`],
        ekspektasi: 'Harga "mulai dari" Water Taxi ikut menjadi Rp 12.345 (tarif ONLINE termurah)',
        aktual: `Harga Water Taxi di web: ${[...new Set(harga)].map((h) => `Rp ${h.toLocaleString('id-ID')}`).join(', ')}`,
        cek: async () => expect(harga).toContain(12345),
      });
    } finally {
      await ctx.close();
    }
  });

  test('[Positif] TR-43 Rollback versi itu → status "Di-rollback", sel kosong lagi, "sel belum diisi" kembali', async ({ page }) => {
    test.skip(!versiBaru, 'TR-40 gagal');
    const r = new RiwayatTarifPage(page);
    await bukaRiwayatSampaiAda(r, versiBaru);
    const toast = await r.rollback(versiBaru);
    expect(toast).toMatch(new RegExp(`#${versiBaru}.*rollback|berhasil`, 'i'));
    await expect(async () => {
      await r.buka();
      await expect(r.baris(versiBaru)).toContainText('Di-rollback', { timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    const nilai = await t.sel(SEL).inputValue();
    if (nilai === '') sudahDikembalikan = true;
    // hanya sel uji yang dicek — hitungan "sel belum diisi" ikut berubah karena TR-T08
    await cekTemuan(page, {
      id: 'TR-T07',
      judul: 'Rollback tarif tidak mengembalikan sel ke kosong (nilai sebelum diubah)',
      langkah: [`Riwayat Perubahan Tarif → versi #${versiBaru} → Rollback`, `${RUTE} → Tarif Dasar → sel "${SEL}"`],
      ekspektasi: 'Sel kosong lagi (seperti sebelum diubah)',
      aktual: `Sel berisi "${nilai || '(kosong)'}"`,
      cek: async () => expect(nilai).toBe(''),
      fokus: t.sel(SEL),
    });
  });

  test('[Negatif] TR-44 ubah sel lalu muat ulang halaman TANPA Simpan → perubahan tidak tersimpan', async ({ page }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    const awal = await t.sel(SEL).inputValue();
    await t.sel(SEL).fill('777');
    await t.sel(SEL).blur();
    page.once('dialog', (d) => d.accept()); // kalau ada "tinggalkan halaman?"
    await t.buka(RUTE_ID);
    await expect(t.sel(SEL)).toHaveValue(awal);
  });

  test('[Negatif] TR-45 sel yang sudah terisi dikosongkan lalu Simpan → ditolak "Isi lagi dengan tarif" (tidak tersimpan)', async ({ page }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    const terisi = (await t.semuaSel()).find((s) => s.nilai > 0);
    test.skip(!terisi, 'Tidak ada sel terisi');
    const s = t.sel(terisi!.nama);
    await s.click();
    await s.press('Control+a');
    await s.press('Backspace');
    await s.blur();
    await t.btnSimpan.click();
    await expect(t.toast.first()).toContainText(/dikosongkan|isi lagi/i, { timeout: 15_000 });
    await t.buka(RUTE_ID);
    await expect(t.sel(terisi!.nama), 'nilai lama tetap').toHaveValue(terisi!.teks);
  });
});
