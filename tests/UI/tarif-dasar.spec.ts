import { test, expect } from '@playwright/test';
import { TarifDasarPage, RiwayatTarifPage } from './pages/tarif.pages';
import { KategoriPage, KelasPage } from './pages/penumpang.pages';
import { GolonganPage } from './pages/golongan.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import { bukaWeb, jadwalWeb, tglDepan } from './pages/ferizy.pages';

/**
 * TARIF — TARIF DASAR (tab di detail rute) & RIWAYAT PERUBAHAN TARIF — READ-ONLY
 * Sel diketik untuk uji validasi tapi TIDAK PERNAH disimpan (halaman dimuat ulang tanpa Simpan).
 * Rute uji: LMB-PGA (route id 82).
 * ID: TR-0x/1x (fungsi), TR-2x (dampak), TR-T0x (temuan)
 */

const RUTE_ID = process.env.TR_RUTE_ID ?? '82';
const RUTE = process.env.TR_RUTE ?? 'LMB-PGA';
const SEL_KOSONG = process.env.TR_SEL ?? 'Lansia · BISNIS · Water Taxi · ONLINE';
const bagian = (nama: string) => nama.split(' · ').map((x) => x.trim());

test.describe('Tarif Dasar — tampilan matriks', () => {
  test('[Positif] TR-01 tab Tarif Dasar rute: judul, 3 sub-tab, tombol, tabel segmen & matriks', async ({ page }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    for (const n of ['Pejalan Kaki', 'Kendaraan', 'Barang'] as const) await expect(t.tab(n)).toBeVisible();
    await expect(t.btnUnduh).toBeVisible();
    await expect(t.panel.getByRole('button', { name: 'Unggah (Import)' })).toBeVisible();
    await expect(t.btnSimpan, 'Simpan nonaktif sebelum ada perubahan').toBeDisabled();
    await expect(t.tabelSegmen).toContainText('LEMBAR');
    expect((await t.semuaSel()).length).toBeGreaterThan(0);
  });

  test('[Positif] TR-02 menu "Tarif Dasar" (/tariff-fares): pilih rute dulu, lalu matriks tampil', async ({ page }) => {
    await page.goto('/tariff-fares');
    await expect(page.getByRole('heading', { name: 'Tarif Dasar', level: 1 })).toBeVisible();
    await expect(page.getByText('Pilih rute untuk mengisi tarif dasarnya.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simpan', exact: true })).toBeDisabled();
    const cb = page.getByRole('combobox', { name: 'Rute' });
    await cb.click();
    const pop = page.locator('[data-slot="popover-content"]');
    await expect(pop).toBeVisible();
    if (await pop.locator('input').count()) await pop.locator('input').first().fill(RUTE);
    await page.getByRole('option', { name: new RegExp(RUTE) }).first().click();
    await expect(page.getByRole('textbox', { name: SEL_KOSONG, exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test('[Positif] TR-03 "N sel belum diisi" di tabel segmen = jumlah sel kosong di matriks (per tab)', async ({ page }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    for (const tab of ['Pejalan Kaki', 'Kendaraan'] as const) {
      await t.pilihTab(tab);
      const kosong = (await t.semuaSel()).filter((s) => s.nilai === 0).length;
      expect(await t.selBelumDiisi(), `tab ${tab}`).toBe(kosong);
    }
  });

  test('[Positif] TR-04 Unduh Template → file terunduh', async ({ page }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), t.btnUnduh.click()]);
    expect(dl.suggestedFilename()).toMatch(/\.(xlsx|csv)$/i);
  });
});

test.describe('Tarif Dasar — isian sel (TIDAK disimpan)', () => {
  test('[Negatif] TR-10 huruf ditolak, tanda minus dibuang; Simpan aktif hanya bila ada perubahan', async ({ page }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    const s = t.sel(SEL_KOSONG);
    await expect(s).toHaveValue('');
    await s.fill('abc');
    await expect(s).toHaveValue('');
    await expect(t.btnSimpan).toBeDisabled();
    await s.fill('-5');
    expect(await s.inputValue()).not.toContain('-');
    await expect(t.btnSimpan).toBeEnabled();
    await s.fill('');
    await s.blur();
    await expect(t.btnSimpan, 'dikosongkan lagi → tidak ada perubahan').toBeDisabled();
    await page.reload(); // buang isian (tidak disimpan)
  });

  test('[Edge] TR-11 angka diberi pemisah ribuan otomatis (1000000 → 1.000.000)', async ({ page }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    const s = t.sel(SEL_KOSONG);
    await s.fill('1000000');
    await s.blur();
    await expect(s).toHaveValue('1.000.000');
    await page.reload();
  });

  test('[Temuan] TR-T03 tarif berdesimal & sangat besar seharusnya ditolak/dibatasi [perlu konfirmasi]', async ({ page }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    const s = t.sel(SEL_KOSONG);
    const hasil: string[] = [];
    for (const v of ['12,5', '999999999']) {
      await s.fill(v);
      await s.blur();
      await page.waitForTimeout(300);
      const pesan = (await t.panel.getByRole('alert').allInnerTexts()).join(' / ');
      hasil.push(`"${v}" → terisi "${await s.inputValue()}", Simpan ${(await t.btnSimpan.isEnabled()) ? 'aktif' : 'nonaktif'}${pesan ? `, pesan: ${pesan}` : ''}`);
    }
    const ditolak = hasil.every((h) => /nonaktif|pesan/.test(h));
    await cekTemuan(page, {
      id: 'TR-T03',
      judul: 'Sel tarif menerima nilai desimal (Rp 12,5) dan sangat besar (Rp 999.999.999) tanpa peringatan',
      langkah: [`Jadwal Rute → ${RUTE} → tab Tarif Dasar → Pejalan Kaki`, `Isi sel "${SEL_KOSONG}" dengan 12,5 lalu 999999999`],
      ekspektasi: 'Tarif rupiah bulat & ada batas wajar (atau peringatan); riwayat #90 berisi Rp 999.999.999 yang lolos',
      aktual: hasil.join('; '),
      cek: async () => expect(ditolak).toBe(true),
      fokus: s,
    });
    await page.reload(); // buang isian
  });
});

test.describe('Tarif Dasar — dampak (konsistensi dengan master)', () => {
  test('[Temuan] TR-T01/T02 baris Pejalan Kaki seharusnya = kategori penumpang AKTIF (termasuk Dewasa); kelas = kelas AKTIF', async ({ page }) => {
    const kg = new KategoriPage(page);
    await kg.goto();
    const kategori = (await kg.semuaBaris()).filter((r) => r.Status === 'Aktif').map((r) => r.Nama);
    const kk = new KelasPage(page);
    await kk.goto();
    await kk.setLimit(50);
    const kelas = [...new Set((await kk.semuaBaris()).filter((r) => r.Status === 'Aktif').map((r) => r.Nama))];
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    const sel = await t.semuaSel();
    const katMatriks = [...new Set(sel.map((s) => bagian(s.nama)[0]))];
    const kelasMatriks = [...new Set(sel.map((s) => bagian(s.nama)[1]))];
    const hilang = kategori.filter((k) => !katMatriks.includes(k));
    const asing = katMatriks.filter((k) => !kategori.includes(k));
    const kelasHilang = kelas.filter((k) => !kelasMatriks.includes(k));
    const kelasAsing = kelasMatriks.filter((k) => !kelas.includes(k));
    await cekTemuan(page, {
      id: 'TR-T01',
      judul: 'Baris matriks tarif Pejalan Kaki tidak sesuai master Kategori/Kelas Penumpang (kategori Dewasa tidak bisa diberi tarif)',
      langkah: ['Kategori Penumpang & Kelas Penumpang: catat yang Aktif', `Jadwal Rute → ${RUTE} → tab Tarif Dasar → Pejalan Kaki`],
      ekspektasi: `Baris = kategori Aktif (${kategori.join(', ')}) × kelas Aktif (${kelas.join(', ')})`,
      aktual: `Kategori tidak ada di matriks: ${hilang.join(', ') || '-'}; kategori asing: ${asing.join(', ') || '-'}; kelas tidak ada: ${kelasHilang.join(', ') || '-'}; kelas asing: ${kelasAsing.join(', ') || '-'}`,
      cek: async () => expect([...hilang, ...asing, ...kelasHilang, ...kelasAsing]).toEqual([]),
      fokus: t.matriks,
    });
  });

  test('[Temuan] TR-T08 kategori di matriks Pejalan Kaki seharusnya SAMA setiap kali dibuka (Dewasa selalu ada)', async ({ page }) => {
    test.setTimeout(240_000);
    const t = new TarifDasarPage(page);
    const hasil: string[][] = [];
    const kosong: number[] = [];
    for (let i = 0; i < 4; i++) {
      await t.buka(RUTE_ID);
      hasil.push([...new Set((await t.semuaSel()).map((s) => bagian(s.nama)[0]))]);
      kosong.push(await t.selBelumDiisi());
    }
    const unik = [...new Set(hasil.map((h) => h.join(', ')))];
    const tanpaDewasa = hasil.filter((h) => !h.includes('Dewasa')).length;
    await cekTemuan(page, {
      id: 'TR-T08',
      judul: 'Matriks Tarif Dasar tidak konsisten: kadang baris "Dewasa" hilang dan muncul kategori "tess710" (tidak ada di master); hitungan "sel belum diisi" ikut berubah',
      langkah: [`Jadwal Rute → ${RUTE} → tab Tarif Dasar → Pejalan Kaki`, 'Muat ulang halaman beberapa kali, perhatikan kategori di kolom pertama & angka "sel belum diisi"'],
      ekspektasi: 'Kategori selalu sama (Dewasa, Lansia, Anak, Bayi) dan angka "sel belum diisi" tetap',
      aktual: `${hasil.length}× dibuka: ${unik.map((u) => `[${u}]`).join(' / ')}; Dewasa tidak ada ${tanpaDewasa}×; sel belum diisi: ${kosong.join(', ')}`,
      cek: async () => { expect(unik).toHaveLength(1); expect(tanpaDewasa).toBe(0); },
      fokus: t.matriks,
    });
  });

  test('[Dampak] TR-21 baris tab Kendaraan = golongan kendaraan AKTIF', async ({ page }) => {
    const g = new GolonganPage(page);
    await g.goto();
    await g.setLimit(50);
    const [nama, status] = [await g.nilaiKolom('Nama'), await g.nilaiKolom('Status')];
    const aktif = nama.filter((_, i) => status[i] === 'Aktif');
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    await t.pilihTab('Kendaraan');
    const diMatriks = [...new Set((await t.semuaSel()).map((s) => bagian(s.nama)[0]))];
    const hilang = aktif.filter((n) => !diMatriks.some((m) => m === n || m.endsWith(n)));
    expect(hilang, 'golongan aktif yang tidak ada di matriks').toEqual([]);
    expect(diMatriks.length).toBeGreaterThan(0);
  });

  test('[Temuan] TR-T04 tab Barang: semua kategori barang Aktif seharusnya sudah punya tarif di rute utama', async ({ page }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    await t.pilihTab('Barang');
    const kosong = await t.selBelumDiisi();
    const teks = (await t.tabelSegmen.innerText()).replace(/\s+/g, ' ');
    await cekTemuan(page, {
      id: 'TR-T04',
      judul: `Tarif Barang & Hewan rute ${RUTE} belum diisi sama sekali`,
      langkah: [`Jadwal Rute → ${RUTE} → tab Tarif Dasar → Barang`],
      ekspektasi: 'Kategori barang & hewan yang dijual punya tarif',
      aktual: teks,
      cek: async () => expect(kosong).toBe(0),
      fokus: t.tabelSegmen,
    });
  });

  test('[Dampak] TR-22 harga "Rp … / orang" di kartu web = salah satu tarif ONLINE jenis kapal itu di matriks [perlu konfirmasi aturan]', async ({ page, browser }) => {
    const t = new TarifDasarPage(page);
    await t.buka(RUTE_ID);
    const online = (await t.semuaSel()).filter((s) => s.nilai > 0 && bagian(s.nama)[3] === 'ONLINE');
    const perJenis: Record<string, number[]> = {};
    for (const s of online) (perJenis[bagian(s.nama)[2]] ??= []).push(s.nilai);
    const tgl = process.env.KP_TGL_WEB ?? tglDepan(11);
    const { ctx, web } = await bukaWeb(browser);
    try {
      const kartu = await jadwalWeb(web, '49', '67', tgl);
      test.skip(kartu.length === 0, `Tidak ada jadwal di web untuk ${tgl}`);
      const beda: string[] = [];
      for (const k of kartu) {
        const ada = perJenis[k.jenis] ?? [];
        if (!ada.includes(k.harga)) beda.push(`${k.jam} ${k.jenis}: web Rp ${k.harga.toLocaleString('id-ID')}, tarif ONLINE di CMS [${[...new Set(ada)].map((x) => x.toLocaleString('id-ID')).join(', ') || 'kosong'}]`);
      }
      test.info().annotations.push({ type: 'info', description: `Harga web per jenis: ${[...new Set(kartu.map((k) => `${k.jenis} Rp ${k.harga.toLocaleString('id-ID')}`))].join('; ')}` });
      await cekTemuan(web, {
        id: 'TR-T05',
        judul: 'Harga di kartu jadwal web tidak ada di tarif dasar ONLINE CMS untuk jenis kapal itu',
        langkah: [`CMS → ${RUTE} → Tarif Dasar → Pejalan Kaki (kolom ONLINE)`, `Web Ferizy → Lembar → Padang Bai tanggal ${tgl}`],
        ekspektasi: 'Harga "Rp … / orang" sama dengan tarif ONLINE di matriks untuk jenis kapal kartu itu',
        aktual: beda.join('; '),
        cek: async () => expect(beda).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Riwayat Perubahan Tarif', () => {
  test('[Positif] TR-30 daftar versi terbaru di atas; detail versi menampilkan tarif lama → baru & arah', async ({ page }) => {
    const r = new RiwayatTarifPage(page);
    await r.buka();
    const daftar = await r.daftar();
    expect(daftar.length).toBeGreaterThan(0);
    const nomor = daftar.map((d) => d.versi);
    expect(nomor, 'urut versi menurun').toEqual([...nomor].sort((a, b) => b - a));
    const det = await r.detail(daftar[0].versi);
    for (const kata of ['Sumber', 'Status', 'Pemohon', 'Perubahan tarif', 'Lama', 'Baru']) expect(det).toContain(kata);
  });

  test('[Positif] TR-31 filter Rute → hanya versi rute itu', async ({ page }) => {
    const r = new RiwayatTarifPage(page);
    await r.buka();
    await page.getByRole('combobox', { name: 'Rute' }).click();
    const pop = page.locator('[data-slot="popover-content"]');
    if (await pop.locator('input').count()) await pop.locator('input').first().fill(RUTE);
    await page.getByRole('option', { name: new RegExp(RUTE) }).first().click();
    await page.waitForTimeout(2_000);
    const daftar = await r.daftar();
    test.skip(daftar.length === 0, `Belum ada versi untuk ${RUTE}`);
    for (const d of daftar) expect(d.teks, `versi #${d.versi}`).toContain(RUTE);
  });
});
