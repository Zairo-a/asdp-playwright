import { test, expect } from '@playwright/test';
import { GolonganPage, PESAN } from './pages/golongan.pages';
import { cekTemuan, DATA as KA, KeberangkatanListPage } from './pages/kapasitas.pages';
import { RutePage } from './pages/rute.pages';
import { bukaWeb, opsiGolonganWeb } from './pages/ferizy.pages';

/**
 * MASTER DATA — GOLONGAN KENDARAAN (/vehicle-classes) — READ-ONLY
 * Form dibuka lalu DIBATALKAN; tidak ada data yang disimpan.
 * ID: GK-0x / GK-1x (fungsi), GK-T0x (temuan)
 */

const ADA = process.env.GK_KODE ?? 'IVA'; // golongan aktif yang sudah ada
const NAMA_ADA = process.env.GK_NAMA ?? 'Mobil Penumpang';
const LANGKAH_TAMBAH = ['Buka menu Golongan Kendaraan', 'Klik "Tambah"'];
const angka = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const RUTE = process.env.RJ_RUTE_KODE ?? 'LMB-PGA';
const JADWAL = process.env.RJ_JADWAL_KODE ?? `${RUTE}-1500`; // jadwal yang kapalnya membawa golongan kendaraan (dibuka saja)

/** Nilai SUP master untuk tiap kode golongan (semua halaman). */
async function supMaster(p: GolonganPage) {
  await p.goto();
  const total = await p.totalData();
  await p.setLimit(50);
  await expect(p.rows).toHaveCount(Math.min(total, 50));
  const kode = await p.nilaiKolom('Golongan');
  const sup = await p.nilaiKolom('Nilai SUP');
  const status = await p.nilaiKolom('Status');
  return Object.fromEntries(kode.map((k, i) => [k, { sup: angka(sup[i]), aktif: status[i] === 'Aktif' }]));
}

test.describe('Golongan Kendaraan — daftar', () => {
  test('[Positif] GK-01 halaman tampil: judul, toolbar, kolom tabel, ringkasan data', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    for (const b of [p.cari, p.btnFilter, p.btnTampilan, p.btnExport, p.btnTambah]) await expect(b).toBeVisible();
    const h = await p.header();
    for (const k of ['Urutan', 'Golongan', 'Nama', 'Kategori', 'Nilai SUP', 'Status']) expect(h).toContain(k);
    expect(await p.totalData()).toBeGreaterThan(0);
  });

  test('[Positif] GK-02 cari berdasarkan kode → hanya golongan itu', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.cariData(ADA);
    await expect.poll(() => p.totalData()).toBe(1);
    await expect(p.baris(ADA)).toHaveCount(1);
  });

  test('[Positif] GK-03 cari berdasarkan nama (huruf kecil) → semua hasil mengandung kata itu', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.cariData('truk');
    await expect.poll(() => p.totalData()).toBeGreaterThan(0);
    for (const n of await p.nilaiKolom('Nama')) expect(n.toLowerCase()).toContain('truk');
  });

  test('[Negatif] GK-04 cari kata yang tidak ada → 0 data', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.cariData('ZZZTIDAKADA');
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Positif] GK-05 sort Nilai SUP: naik lalu turun', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    const naik = (await p.sortBy('Nilai SUP')).map(angka);
    expect(naik).toEqual([...naik].sort((a, b) => a - b));
    const turun = (await p.sortBy('Nilai SUP')).map(angka);
    expect(turun).toEqual([...turun].sort((a, b) => b - a));
  });

  test('[Positif] GK-06 filter Status "Nonaktif" → semua baris Nonaktif', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    const status = await p.nilaiKolom('Status');
    test.skip(status.length === 0, 'Tidak ada golongan nonaktif');
    for (const s of status) expect(s).toBe('Nonaktif');
  });

  test('[Positif] GK-07 filter Kategori "Kendaraan Barang" → semua baris kategori itu', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.btnFilter.click();
    await expect(p.popover).toBeVisible();
    await p.popover.getByRole('checkbox', { name: 'Kendaraan Barang', exact: true }).click();
    await page.keyboard.press('Escape');
    await p.tungguData();
    await expect.poll(async () => (await p.nilaiKolom('Kategori')).every((k) => k === 'Kendaraan Barang')).toBe(true);
    expect((await p.nilaiKolom('Kategori')).length).toBeGreaterThan(0);
  });

  test('[Positif] GK-08 lebih dari 10 golongan → Berikutnya menampilkan sisanya', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    const total = await p.totalData();
    test.skip(total <= 10, `Hanya ${total} golongan`);
    await p.btnBerikutnya.click();
    await expect(p.ringkasan).toHaveText(new RegExp(`Menampilkan 11-${Math.min(20, total)} dari ${total} data`));
  });

  test('[Positif] GK-09 menu ⋯: golongan Aktif → "Nonaktifkan", golongan Nonaktif → "Aktifkan"', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto({ search: ADA });
    const menuAktif = await p.daftarAksi(ADA);
    expect(menuAktif).toEqual(expect.arrayContaining(['Ubah Data', 'Nonaktifkan', 'Hapus Data']));
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    const kodeNon = (await p.nilaiKolom('Golongan'))[0];
    test.skip(!kodeNon, 'Tidak ada golongan nonaktif');
    expect(await p.daftarAksi(kodeNon)).toContain('Aktifkan');
  });
});

test.describe('Golongan Kendaraan — form (tanpa menyimpan)', () => {
  test('[Negatif] GK-10 Simpan form kosong → 4 pesan wajib diisi', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesanForm()).toEqual(expect.arrayContaining([PESAN.kodeWajib, PESAN.namaWajib, PESAN.kategoriWajib, PESAN.supWajib]));
    await expect(p.form).toBeVisible();
    await p.batalForm('Close');
  });

  test('[Negatif] GK-11 kode huruf kecil & simbol → otomatis kapital, maks 10 karakter, pesan format', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.kode.fill('ab-1 x!12345678');
    const v = await p.kode.inputValue();
    expect(v, 'otomatis huruf kapital').toBe(v.toUpperCase());
    expect(v.length, 'maks 10 karakter').toBeLessThanOrEqual(10);
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesanForm()).toContain(PESAN.kodeFormat);
    await p.batalForm('Close');
  });

  test('[Negatif] GK-12 SUP -1, panjang -3 → "angka 0 sampai 999,99"; max penumpang -2 → "bilangan bulat minimal 1"', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ sup: '-1', panjang: '-3', maxPenumpang: '-2' });
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesanForm()).toEqual(expect.arrayContaining([PESAN.angka, PESAN.bulat]));
    expect((await p.form.getByText(PESAN.angka).count()), 'pesan di SUP & panjang').toBe(2);
    await p.batalForm('Close');
  });

  test('[Negatif] GK-13 SUP 1000 → ditolak; [Edge] SUP 999,99 (batas atas) → pesan hilang', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ sup: '1000' });
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesanForm()).toContain(PESAN.angka);
    await p.isi({ sup: '999,99' });
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesanForm()).not.toContain(PESAN.angka);
    await p.batalForm('Close');
  });

  test('[Negatif] GK-14 SUP dengan 3 desimal (1,234) → ditolak', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ sup: '1,234' });
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesanForm()).toContain(PESAN.angka);
    await p.batalForm('Close');
  });

  test('[Edge] GK-15 nama 51 karakter → dibatasi 50 (atau ada pesan maks 50)', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.nama.fill('N'.repeat(51));
    const panjang = (await p.nama.inputValue()).length;
    await p.btnForm('Simpan').click();
    const pesan = (await p.pesanForm()).join(' ');
    expect(panjang <= 50 || /50/.test(pesan), `panjang nama ${panjang}, pesan "${pesan}"`).toBe(true);
    await p.batalForm('Close');
  });

  test('[Positif] GK-16 Batal: form kosong langsung tertutup; form terisi → "Batalkan Perubahan?" → Kembali → isian tetap', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    expect(await p.batalForm('Batal'), 'form kosong tidak perlu konfirmasi').toBe(false);
    await p.bukaTambah();
    await p.isi({ kode: 'QAX', nama: 'QA AUTO X' });
    expect(await p.batalForm('Batal', 'Kembali')).toBe(true);
    await expect(p.kode).toHaveValue('QAX');
    await expect(p.nama).toHaveValue('QA AUTO X');
    expect(await p.batalForm('Close', 'Ya, Batalkan')).toBe(true);
  });

  test('[Positif] GK-17 Ubah Data: kode terkunci, isian sama dengan baris di tabel; tutup tanpa perubahan → tanpa konfirmasi', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto({ search: ADA });
    const supTabel = await p.sel(ADA, 'Nilai SUP');
    await p.bukaUbah(ADA);
    await expect(p.kode).toHaveValue(ADA);
    await expect(p.kode).not.toBeEditable();
    await expect(p.nama).toHaveValue(NAMA_ADA);
    expect(angka(await p.sup.inputValue())).toBe(angka(supTabel));
    expect(await p.batalForm('Close')).toBe(false);
  });

  test('[Edge] GK-18 cari dengan karakter khusus (%\' <) → tidak error, 0 data', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.cari.fill("%' <");
    await page.waitForTimeout(1_000);
    await p.tungguData();
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Positif] GK-19 dampak: "SUP / unit" di alokasi kendaraan JADWAL rute = Nilai SUP di master Golongan', async ({ page }) => {
    const master = await supMaster(new GolonganPage(page));
    const r = new RutePage(page);
    await r.goto({ search: RUTE });
    const d = await r.bukaDetail(RUTE);
    await d.bukaEditJadwal(JADWAL);
    await d.keLangkah('3/5');
    const label = await d.form.getByRole('combobox', { name: /^Tipe / }).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? '').replace(/^Tipe /, '')));
    test.skip(label.length === 0, `Kapal jadwal ${JADWAL} tidak membawa golongan kendaraan`);
    for (const g of label) {
      if (!master[g]) continue;
      const sup = angka((await d.barisAlokasi(g).locator('td').nth(1).innerText()).trim());
      expect(sup, `SUP / unit golongan ${g}`).toBe(master[g].sup);
    }
    await d.batalForm('Close');
  });

  test('[Positif] GK-20 dampak: "SUP / unit" di Keberangkatan (sub-tab Kendaraan) = Nilai SUP di master Golongan', async ({ page }) => {
    const master = await supMaster(new GolonganPage(page));
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(KA.tanggalUji);
    const d = await list.bukaDetail(KA.jadwalA);
    await d.bukaTab('Alokasi');
    await d.bukaSubTab('Kendaraan');
    const daftar = await d.daftarGolongan();
    test.skip(daftar.length === 0, 'Keberangkatan uji tidak punya golongan kendaraan');
    for (const g of daftar) {
      if (!master[g]) continue;
      expect((await d.golongan(g)).supPerUnit, `SUP / unit golongan ${g}`).toBe(master[g].sup);
    }
  });

  test('[Temuan] GK-T04 golongan NONAKTIF seharusnya tidak muncul di alokasi kendaraan jadwal [perlu konfirmasi]', async ({ page }) => {
    const master = await supMaster(new GolonganPage(page));
    const nonaktif = Object.keys(master).filter((k) => !master[k].aktif);
    test.skip(nonaktif.length === 0, 'Tidak ada golongan nonaktif');
    const r = new RutePage(page);
    await r.goto({ search: RUTE });
    const d = await r.bukaDetail(RUTE);
    await d.bukaEditJadwal(JADWAL);
    await d.keLangkah('3/5');
    const label = await d.form.getByRole('combobox', { name: /^Tipe / }).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? '').replace(/^Tipe /, '')));
    const muncul = label.filter((g) => nonaktif.includes(g));
    await cekTemuan(page, {
      id: 'GK-T04',
      judul: 'Golongan yang sudah Nonaktif masih muncul (dan bisa diatur) di alokasi kendaraan jadwal',
      langkah: [
        `Menu Golongan Kendaraan: golongan ${nonaktif.join(', ')} berstatus Nonaktif (tidak muncul di form Master Kapal)`,
        `Menu Jadwal Rute → ${RUTE} → Edit Rute & Jadwal → jadwal ${JADWAL} → ⋯ → Edit Jadwal → langkah 3`,
      ],
      ekspektasi: 'Golongan nonaktif tidak ditampilkan (konsisten dengan form Master Kapal), atau ditandai nonaktif',
      aktual: muncul.length ? `Masih muncul: ${muncul.join(', ')} (kapal masih menyimpan golongan ini, tapi tidak bisa diubah lagi di form kapal)` : 'Tidak muncul',
      cek: async () => expect(muncul).toEqual([]),
      fokus: muncul.length ? d.barisAlokasi(muncul[0]) : undefined,
    });
    await d.batalForm('Close');
  });

  /* --------------------------------- TEMUAN --------------------------------- */

  test('[Temuan] GK-T01 nama kategori di form (Indonesia) seharusnya sama dengan di tabel & filter (Inggris)', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto({ search: ADA });
    const diTabel = await p.sel(ADA, 'Kategori');
    await p.bukaUbah(ADA);
    const diForm = (await p.kategori.innerText()).trim();
    await cekTemuan(page, {
      id: 'GK-T01',
      judul: 'Nama kategori golongan berbeda bahasa antara form dan tabel/filter',
      langkah: ['Buka menu Golongan Kendaraan', `Lihat kolom Kategori golongan ${ADA}`, '⋯ → Ubah Data, lihat isian Kategori'],
      ekspektasi: 'Nama kategori sama di form, tabel, dan filter (mis. semuanya "Kendaraan Penumpang")',
      aktual: `Tabel/filter: "${diTabel}", form: "${diForm}"`,
      cek: async () => expect(diForm).toBe(diTabel),
      fokus: p.kategori,
    });
    await p.batalForm('Close');
  });

  test('[Temuan] GK-T02 pesan wajib untuk field "Golongan" seharusnya menyebut "Golongan", bukan "Kode"', async ({ page }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.btnForm('Simpan').click();
    await expect.poll(async () => (await p.pesanForm()).length).toBeGreaterThan(0);
    const pesan = await p.pesanForm();
    const pesanKode = pesan.find((x) => /^(Kode|Golongan) wajib/.test(x)) ?? '(tidak ada)';
    await cekTemuan(page, {
      id: 'GK-T02',
      judul: 'Field berlabel "Golongan" memunculkan pesan "Kode wajib diisi"',
      langkah: [...LANGKAH_TAMBAH, 'Klik Simpan tanpa mengisi apa pun'],
      ekspektasi: 'Pesan memakai nama field yang terlihat: "Golongan wajib diisi"',
      aktual: `Pesan: "${pesanKode}"`,
      cek: async () => expect(pesanKode).toMatch(/^Golongan/),
      fokus: p.kode,
    });
    await p.batalForm('Close');
  });
});
/* ------------------- DAMPAK ke web Ferizy (hanya membaca CMS & web) ------------------- */
test.describe('Golongan Kendaraan — dampak ke web Ferizy', () => {
  test('[Dampak] GK-50 pilihan "Golongan kendaraan" di web = golongan Aktif di CMS (kode, nama, maks penumpang)', async ({ page, browser }) => {
    const p = new GolonganPage(page);
    await p.goto();
    await p.setLimit(50);
    const [kode, nama, maks, status] = [await p.nilaiKolom('Golongan'), await p.nilaiKolom('Nama'), await p.nilaiKolom('Maks Penumpang'), await p.nilaiKolom('Status')];
    const cms = kode.map((k, i) => ({ kode: k, nama: nama[i], maks: /^\d+$/.test(maks[i]) ? Number(maks[i]) : null, aktif: status[i] === 'Aktif' }));
    const { ctx, web } = await bukaWeb(browser);
    try {
      const opsi = await opsiGolonganWeb(web);
      expect(opsi.length, 'web punya pilihan golongan').toBeGreaterThan(0);
      const beda: string[] = [];
      for (const c of cms.filter((x) => x.aktif)) {
        const w = opsi.find((o) => o.kode === c.kode);
        if (!w) beda.push(`${c.kode} (Aktif) tidak ada di web`);
        else {
          if (w.nama !== c.nama) beda.push(`${c.kode}: nama web "${w.nama}" ≠ CMS "${c.nama}"`);
          if (c.maks !== null && w.maks !== c.maks) beda.push(`${c.kode}: maks penumpang web ${w.maks ?? '-'} ≠ CMS ${c.maks}`);
        }
      }
      for (const o of opsi) {
        const c = cms.find((x) => x.kode === o.kode);
        if (!c) beda.push(`${o.kode} ada di web tapi tidak ada di CMS`);
        else if (!c.aktif) beda.push(`${o.kode} Nonaktif di CMS tapi masih ada di web`);
      }
      await cekTemuan(web, {
        id: 'GK-T20',
        judul: 'Pilihan golongan kendaraan di web tidak sama dengan master Golongan Kendaraan CMS',
        langkah: ['Web Ferizy → beranda → Jenis pengguna jasa "Kendaraan" → klik "Pilih golongan kendaraan"', 'Bandingkan dengan menu Golongan Kendaraan di CMS (Limit 50)'],
        ekspektasi: 'Semua golongan Aktif tampil dengan kode, nama, dan maks penumpang yang sama; golongan Nonaktif tidak tampil',
        aktual: beda.join('; '),
        cek: async () => expect(beda).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });
});
