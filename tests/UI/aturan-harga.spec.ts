import { test, expect } from '@playwright/test';
import { AturanHargaPage, hariDepan } from './pages/aturan-harga.pages';
import { cekTemuan } from './pages/kapasitas.pages';

/**
 * DISKON & DYNAMIC PRICE — ATURAN HARGA (/tariff-price-rules) — READ-ONLY
 * Wizard diisi sampai langkah 4 (Ringkasan) lalu DIBATALKAN.
 * TIDAK menekan "Simpan & ajukan", Setujui, Tolak, atau Nonaktifkan → tidak ada change set baru.
 * ID: AH-0x (daftar), AH-1x/2x/3x (wizard), AH-T0x (temuan)
 */

test.describe('Aturan Harga — daftar', () => {
  test('[Positif] AH-01 halaman tampil: tab Semua/Diskon/Markup/Campuran, filter, kolom', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    for (const t of ['Semua', 'Diskon', 'Markup', 'Campuran'] as const) await expect(p.tab(t)).toBeVisible();
    for (const f of [p.cari, p.fRute, p.fStatus, p.btnTambah]) await expect(f).toBeVisible();
    const h = (await p.tabel.locator('thead th').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    expect(h).toEqual(['Kode - Nama', 'Tipe', 'Kondisi', 'Cakupan', 'Penyesuaian', 'Periode', 'Prioritas', 'Status', 'Aksi']);
  });

  test('[Positif] AH-02 angka tab: Semua = Diskon + Markup + Campuran = total data', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    const [s, d, m, c] = [await p.angkaTab('Semua'), await p.angkaTab('Diskon'), await p.angkaTab('Markup'), await p.angkaTab('Campuran')];
    expect(d + m + c, `Diskon ${d} + Markup ${m} + Campuran ${c}`).toBe(s);
    expect(await p.totalData()).toBe(s);
  });

  test('[Positif] AH-03 tab Diskon/Markup → isi tabel sesuai tipe & jumlah sesuai angka tab', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    for (const t of ['Diskon', 'Markup'] as const) {
      const n = await p.angkaTab(t);
      await p.tab(t).click();
      await p.tunggu();
      expect(await p.totalData(), `tab ${t}`).toBe(n);
      for (const tipe of await p.kolom(2)) expect(tipe).toBe(t);
    }
  });

  test('[Positif] AH-04 filter Status: pilihan lengkap; "Aktif" → semua baris Aktif', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    expect(await p.opsi(p.fStatus)).toEqual(['Status: semua', 'Aktif', 'Terjadwal', 'Berakhir', 'Nonaktif', 'Menunggu', 'Ditolak']);
    await p.pilihFilter(p.fStatus, 'Aktif');
    for (const s of await p.kolom(8)) expect(s).toMatch(/^Aktif/);
  });

  test('[Positif] AH-05 filter Rute berisi rute LMB-PGA; memilih rute tidak menambah jumlah data', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    const semua = await p.totalData();
    const opsi = await p.opsi(p.fRute);
    expect(opsi.join(' | ')).toContain('LEMBAR - PADANG BAI (LMB-PGA)');
    await p.pilihFilter(p.fRute, 'LEMBAR - PADANG BAI (LMB-PGA)');
    expect(await p.totalData()).toBeLessThanOrEqual(semua);
  });

  test('[Positif] AH-06 cari kode aturan yang ada → ditemukan; [Negatif] kata acak → 0 data', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    test.skip((await p.totalData()) === 0, 'Belum ada aturan');
    const kode = (await p.kolom(1))[0].split(' ')[0];
    await p.cari.fill(kode);
    await p.page.waitForTimeout(1_500);
    await p.tunggu();
    for (const k of await p.kolom(1)) expect(k.toUpperCase()).toContain(kode.toUpperCase());
    await p.cari.fill('ZZQATIDAKADA');
    await p.page.waitForTimeout(1_500);
    await p.tunggu();
    expect(await p.totalData()).toBe(0);
  });

  test('[Positif] AH-07 menu baris: Ubah, Nonaktifkan (Setujui/Tolak hanya untuk yang menunggu)', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    test.skip((await p.totalData()) === 0, 'Belum ada aturan');
    await p.rows.first().getByRole('button', { name: 'Buka menu' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const items = (await menu.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
    await page.keyboard.press('Escape');
    expect(items).toEqual(expect.arrayContaining(['Ubah']));
    expect(items.some((x) => /Nonaktifkan|Aktifkan/.test(x))).toBe(true);
  });

  test('[Positif] AH-08 Ubah aturan yang ada → Kode terkunci, data terisi; ditutup tanpa mengajukan', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    test.skip((await p.totalData()) === 0, 'Belum ada aturan');
    const kode = (await p.kolom(1))[0].split(' ')[0];
    await p.rows.first().getByRole('button', { name: 'Buka menu' }).click();
    await page.getByRole('menuitem', { name: 'Ubah', exact: true }).click();
    await expect(p.form.getByRole('heading', { name: 'Ubah Aturan Harga' })).toBeVisible();
    await expect(p.kode).toHaveValue(kode);
    await expect(p.kode).toBeDisabled();
    await expect(p.nama).not.toHaveValue('');
    await p.tutup();
  });
});

test.describe('Aturan Harga — wizard langkah 1 (Umum & Waktu)', () => {
  test('[Negatif] AH-10 Berikutnya dengan form kosong → Kode, Nama, Prioritas, Awal periode berlaku wajib', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.berikutnya();
    await expect.poll(() => p.pesan()).toEqual(expect.arrayContaining(['Kode wajib diisi', 'Nama wajib diisi', 'Prioritas wajib dipilih', 'Awal periode berlaku wajib diisi']));
    await expect(p.langkah).toHaveText('1/4');
    await p.tutup();
  });

  test('[Positif] AH-11 Prioritas berisi 11 tingkat (Sangat Rendah … Ekstra Tinggi 5)', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    await p.bukaTambah();
    const o = await p.opsi(p.prioritas);
    expect(o[0]).toBe('Sangat Rendah');
    expect(o.at(-1)).toBe('Ekstra Tinggi 5');
    expect(o).toHaveLength(11);
    await p.tutup();
  });

  test('[Edge] AH-12 kode huruf kecil → otomatis huruf besar', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.kode.fill('qa_dyn_x');
    await expect(p.kode).toHaveValue('QA_DYN_X');
    await p.tutup();
  });

  test('[Positif] AH-13 hari "Pilih semua" → 7 hari tertekan; klik lagi → kosong', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    await p.bukaTambah();
    const semua = p.form.getByRole('checkbox', { name: 'Pilih semua' });
    const hari = p.form.locator('button[aria-pressed="true"]');
    await semua.click();
    await expect(hari).toHaveCount(7);
    await semua.click();
    await expect(hari).toHaveCount(0);
    await p.tutup();
  });

  test('[Negatif] AH-14 kalender "Berlaku sampai": tanggal sebelum "Berlaku dari" nonaktif (tidak bisa dipilih)', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QA_DYN_Z', nama: 'QA tidak diajukan', dari: hariDepan(30) });
    expect(await p.tanggalNonaktif('Berlaku sampai', hariDepan(20)), 'H+20 nonaktif').toBe(true);
    await p.tutup();
  });

  test('[Negatif] AH-15 kalender "Berangkat sampai": tanggal sebelum "Berangkat dari" nonaktif', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QA_DYN_Z', nama: 'QA tidak diajukan', dari: hariDepan(1) });
    await p.pilihTanggal('Berangkat dari', hariDepan(40));
    expect(await p.tanggalNonaktif('Berangkat sampai', hariDepan(35)), 'H+35 nonaktif').toBe(true);
    await p.tutup();
  });

  test('[Edge] AH-16 "Berlaku sampai" kosong (berlaku terus) → boleh lanjut ke langkah 2', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QA_DYN_Z', nama: 'QA tidak diajukan', dari: hariDepan(1) });
    await p.berikutnya();
    await expect(p.langkah).toHaveText('2/4');
    await p.tutup();
  });
});

test.describe('Aturan Harga — wizard langkah 2–4', () => {
  async function keLangkah2(p: AturanHargaPage) {
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QA_DYN_Z', nama: 'QA tidak diajukan', dari: hariDepan(1) });
    await p.berikutnya();
    await expect(p.langkah).toHaveText('2/4');
  }

  test('[Negatif] AH-20 langkah 2 kosong → "Pilih minimal satu komponen" & "Baris 1: nominal wajib diisi"', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await keLangkah2(p);
    await p.berikutnya();
    await expect.poll(() => p.pesan()).toEqual(expect.arrayContaining(['Pilih minimal satu komponen', 'Baris 1: nominal wajib diisi']));
    await expect(p.langkah).toHaveText('2/4');
    await p.tutup();
  });

  test('[Positif] AH-21 Acuan 5 pilihan (default Tanpa acuan); Tipe Diskon/Markup; Satuan %/Rp', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await keLangkah2(p);
    const acuan = p.form.getByRole('radiogroup', { name: 'Acuan' }).getByRole('radio');
    await expect(acuan).toHaveCount(5);
    await expect(p.form.getByRole('radio', { name: /^Tanpa acuan/ })).toBeChecked();
    expect(await p.opsi(p.form.getByRole('combobox', { name: 'Tipe' }).first())).toEqual(['Diskon', 'Markup']);
    expect(await p.opsi(p.form.getByRole('combobox', { name: 'Satuan' }).first())).toEqual(['%', 'Rp']);
    await p.tutup();
  });

  for (const [id, nilai, lolos] of [['AH-22', '150', false], ['AH-23', '100', false], ['AH-24', '0', false], ['AH-25', '99,99', true], ['AH-26', '12,5', true]] as const) {
    test(`[${lolos ? 'Edge' : 'Negatif'}] ${id} Diskon ${nilai}% → ${lolos ? 'diterima (lanjut ke 3/4)' : 'ditolak "lebih dari 0 dan maksimal 99,99"'}`, async ({ page }) => {
      const p = new AturanHargaPage(page);
      await keLangkah2(p);
      await p.isiLangkah2({ nominal: nilai });
      await p.berikutnya();
      if (lolos) await expect(p.langkah).toHaveText('3/4');
      else {
        await expect.poll(() => p.pesan()).toContain('Baris 1: persen harus lebih dari 0 dan maksimal 99,99');
        await expect(p.langkah).toHaveText('2/4');
      }
      await p.tutup();
    });
  }

  test('[Negatif] AH-30 langkah 3 "Per pelabuhan" tanpa pelabuhan → "Pilih minimal satu pelabuhan"', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await keLangkah2(p);
    await p.isiLangkah2({ nominal: '1' });
    await p.berikutnya();
    await expect(p.langkah).toHaveText('3/4');
    await expect(p.form.getByRole('radio', { name: /^Per pelabuhan/ })).toBeChecked();
    await p.berikutnya();
    await expect.poll(() => p.pesan()).toContain('Pilih minimal satu pelabuhan');
    await expect(p.langkah).toHaveText('3/4');
    await p.tutup();
  });

  test('[Dampak] AH-31 langkah 3: pilihan Pelabuhan berisi LEMBAR & PADANG BAI (master Pelabuhan); "Per rute" menampilkan Rute & Jadwal', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await keLangkah2(p);
    await p.isiLangkah2({ nominal: '1' });
    await p.berikutnya();
    const pel = await p.opsi(p.form.getByRole('combobox', { name: 'Pelabuhan' }));
    expect(pel).toEqual(expect.arrayContaining(['LEMBAR', 'PADANG BAI']));
    await p.form.getByRole('radio', { name: /^Per rute/ }).click();
    await expect(p.form.getByRole('combobox', { name: 'Rute' })).toBeVisible();
    await expect(p.form.getByRole('combobox', { name: 'Jadwal' })).toBeVisible();
    await expect(p.form.getByRole('combobox', { name: 'Pelabuhan' })).toBeHidden();
    await p.tutup();
  });

  test('[Positif] AH-32 langkah 4 Ringkasan menampilkan isian (kode, diskon 1%, LEMBAR) + tombol "Simpan & ajukan" (TIDAK diklik)', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await keLangkah2(p);
    await p.isiLangkah2({ nominal: '1' });
    await p.berikutnya();
    await p.pilihOpsiForm(p.form.getByRole('combobox', { name: 'Pelabuhan' }), 'LEMBAR');
    await p.berikutnya();
    await expect(p.langkah).toHaveText('4/4');
    const r = p.form.getByRole('table');
    await expect(r).toContainText('QA_DYN_Z · QA tidak diajukan');
    await expect(r).toContainText('Diskon 1%');
    await expect(r).toContainText('Tarif Dasar');
    await expect(r).toContainText('LEMBAR');
    await expect(p.form.getByText(/Menunggu persetujuan/)).toBeVisible();
    await expect(p.fBtn('Simpan & ajukan')).toBeVisible();
    await p.tutup();
  });

  test('[Temuan] AH-T03 "Per rute" tanpa memilih rute → seharusnya ditolak (kalau tidak, diskon berlaku ke SEMUA rute)', async ({ page }) => {
    const p = new AturanHargaPage(page);
    await keLangkah2(p);
    await p.isiLangkah2({ nominal: '1' });
    await p.berikutnya();
    await p.form.getByRole('radio', { name: /^Per rute/ }).click();
    await p.berikutnya();
    const langkah = await p.langkah.innerText();
    const rute = langkah === '4/4' ? (await p.form.getByRole('row', { name: /^Rute / }).innerText()).replace(/\s+/g, ' ') : '';
    await cekTemuan(page, {
      id: 'AH-T03',
      judul: 'Cakupan "Per rute" bisa diajukan tanpa memilih rute → aturan berlaku untuk semua rute [perlu konfirmasi]',
      langkah: ['Aturan Harga → Tambah aturan → isi langkah 1–2', 'Langkah 3: pilih "Per rute", Rute dibiarkan kosong', 'Berikutnya'],
      ekspektasi: 'Diminta memilih minimal satu rute (seperti "Per pelabuhan" yang wajib memilih pelabuhan)',
      aktual: `Lanjut ke langkah ${langkah}${rute ? `; ringkasan "${rute}"` : ''}`,
      cek: async () => expect(langkah).toBe('3/4'),
    });
    await p.tutup();
  });
});
