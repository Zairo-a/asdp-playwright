import { test, expect } from '@playwright/test';
import { PelabuhanPage } from './pages/master-data.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import * as fs from 'fs';
import { bacaTeksFile } from './pages/baca-file';
import { bukaWeb, jadwalWeb, opsiAsalWeb, teksPelabuhanWeb, tglDepan } from './pages/ferizy.pages';

/**
 * MASTER DATA — PELABUHAN (/outlets) — READ-ONLY (tidak menyimpan data apa pun)
 * Form dibuka lalu DIBATALKAN, dialog hapus dibuka lalu DIBATALKAN.
 * ID: PL-0x (daftar), PL-1x (form), PL-T0x (temuan)
 */

const KODE_ADA = 'ADN'; // pelabuhan yang pasti ada (ADONARA)
const LANGKAH_TAMBAH = ['Buka menu Master data → Pelabuhan (/outlets)', 'Klik "Tambah"'];

test.describe('Pelabuhan — daftar', () => {
  test('[Positif] PL-01 halaman tampil: judul, toolbar, kolom tabel, ringkasan data', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await expect(p.main).toContainText('Kelola pelabuhan beserta kapasitas dan dermaganya.');
    for (const b of [p.btnFilter, p.btnTampilan, p.btnExport, p.btnTambah]) await expect(b).toBeVisible();
    await expect(p.btnHapusMassal).toBeDisabled();
    expect(await p.header()).toEqual(['Kode', 'Nama Pelabuhan', 'Kota', 'Zona Waktu', 'Mode Kapasitas', 'Dermaga', 'Aktif']);
    expect(await p.totalData()).toBeGreaterThan(0);
    await expect(p.rows).toHaveCount(10);
  });

  test('[Positif] PL-02 cari berdasarkan kode → hanya baris yang cocok', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.cariData(KODE_ADA);
    await expect(p.baris(KODE_ADA)).toHaveCount(1);
    await expect(p.baris(KODE_ADA)).toContainText('ADONARA');
  });

  test('[Positif] PL-03 cari berdasarkan nama (huruf kecil) → tetap ketemu', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.cariData('adonara');
    await expect(p.baris(KODE_ADA)).toBeVisible();
  });

  test('[Negatif] PL-04 cari kata yang tidak ada → tabel kosong, 0 data', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.cariData('ZZZXQ-TIDAK-ADA');
    await expect.poll(() => p.totalData(), { message: 'tunggu hasil pencarian' }).toBe(0);
    await expect(p.main).toContainText('Belum ada pelabuhan');
  });

  test('[Edge] PL-05 cari dengan karakter khusus → tidak error, 0 data', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.cari.fill(`%'"<>`);
    await expect(p.page).toHaveURL(/search=/);
    await expect.poll(() => p.totalData(), { message: 'tunggu hasil pencarian' }).toBe(0);
    await expect(p.toast.filter({ hasText: /gagal|error/i })).toHaveCount(0);
  });

  test('[Positif] PL-06 sort Kode: klik 1x A→Z, klik 2x Z→A', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    const naik = await p.sortBy('Kode');
    expect(naik).toEqual([...naik].sort());
    const turun = await p.sortBy('Kode');
    expect(turun).toEqual([...turun].sort().reverse());
  });

  test('[Positif] PL-07 Limit 25 → 25 baris & ringkasan 1-25', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.setLimit(25);
    await expect(p.rows).toHaveCount(25);
    expect(await p.rentang()).toEqual([1, 25]);
  });

  test('[Positif] PL-08 pindah halaman: Berikutnya → 11-20, Sebelumnya aktif', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await expect(p.btnSebelumnya).toBeDisabled();
    const awal = await p.nilaiKolom('Kode');
    await p.btnBerikutnya.click();
    await expect(p.ringkasan).toContainText('Menampilkan 11-20');
    await expect(p.btnSebelumnya).toBeEnabled();
    const hal2 = await p.nilaiKolom('Kode');
    expect(hal2.filter((k) => awal.includes(k)), 'tidak ada data dobel antar halaman').toEqual([]);
  });

  test('[Positif] PL-09 filter Nonaktif → semua baris "Nonaktif"', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    const status = await p.nilaiKolom('Aktif');
    for (const s of status) expect(s).toBe('Nonaktif');
  });

  test('[Positif] PL-10 filter Aktif → tidak ada baris "Nonaktif"', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.filterAktivasi('Aktif');
    expect(await p.nilaiKolom('Aktif')).not.toContain('Nonaktif');
  });

  test('[Positif] PL-11 Tampilan: sembunyikan kolom Kota → kolom hilang', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.toggleKolom('Kota');
    expect(await p.header()).not.toContain('Kota');
  });

  test('[Positif] PL-12 Export → file terunduh & berisi data pelabuhan', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    const dl = await p.exportExcel();
    expect(dl.suggestedFilename()).toMatch(/^outlets_export_.*\.(csv|xlsx?)$/i);
    const isi = bacaTeksFile((await dl.path())!); // sejak 23 Nov 2026 file berupa .xlsx
    expect(isi).toContain('ADONARA');
  });

  test('[Temuan] PL-T02 tombol "Export Ke Excel" seharusnya menghasilkan file Excel (.xlsx)', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    const dl = await p.exportExcel();
    const nama = dl.suggestedFilename();
    await cekTemuan(page, {
      id: 'PL-T02',
      judul: 'Tombol "Export Ke Excel" mengunduh file CSV, bukan Excel [perlu konfirmasi]',
      langkah: ['Buka menu Master data → Pelabuhan (/outlets)', 'Klik "Export Ke Excel"'],
      ekspektasi: 'File yang terunduh berformat Excel (.xlsx), sesuai label tombol',
      aktual: `File yang terunduh: "${nama}"`,
      cek: async () => expect(nama).toMatch(/\.xlsx?$/i),
      fokus: p.btnExport,
    });
  });

  test('[Positif] PL-13 zona waktu sesuai provinsi (contoh: NTT = WITA, Sumut = WIB)', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    expect(await p.sel('ADN', 'Zona Waktu')).toContain('WITA');
    expect(await p.sel('AJB', 'Zona Waktu')).toContain('WIB');
  });

  test('[Negatif] PL-14 Hapus massal → Batal → data tetap ada', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto({ search: KODE_ADA });
    await p.baris(KODE_ADA).getByRole('checkbox').check();
    await expect(p.btnHapusMassal).toHaveText('Hapus (1)');
    await p.btnHapusMassal.click();
    await expect(p.konfirmasi).toContainText(`${KODE_ADA} - ADONARA`);
    await p.konfirmasiKlik('Batal');
    await expect(p.baris(KODE_ADA)).toBeVisible();
  });
});

test.describe('Pelabuhan — form Tambah (tanpa menyimpan)', () => {
  test('[Negatif] PL-15 langkah 1 kosong → Selanjutnya → 3 pesan wajib diisi', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.lanjut();
    await expect(p.form).toContainText('Kode pelabuhan wajib diisi');
    await expect(p.form).toContainText('Nama pelabuhan wajib diisi');
    await expect(p.form).toContainText('Kota / kabupaten wajib dipilih');
    await expect(p.langkah()).toHaveText('1/3');
  });

  test('[Edge] PL-16 batas panjang: Kode 50, Nama 100, Alamat 150 karakter', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.kode.fill('K'.repeat(60));
    await p.nama.fill('N'.repeat(120));
    await p.alamat.fill('A'.repeat(200));
    expect((await p.kode.inputValue()).length).toBeLessThanOrEqual(50);
    expect((await p.nama.inputValue()).length).toBeLessThanOrEqual(100);
    expect((await p.alamat.inputValue()).length).toBeLessThanOrEqual(150);
  });

  test('[Positif] PL-17 pilih kota → provinsi tampil di keterangan', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kotaCari: 'Cilegon', kota: 'Kota Cilegon' });
    await expect(p.kota).toContainText('Kota Cilegon');
    await expect(p.form).toContainText('Provinsi (Banten)');
  });

  test('[Negatif] PL-18 kuota penumpang gratis negatif → ditolak', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QAX', nama: 'QA AUTO X', kotaCari: 'Cilegon', kota: 'Kota Cilegon' });
    await p.lanjut();
    await p.kuotaGratis.fill('-5');
    await p.lanjut();
    await expect(p.form).toContainText('Isi dengan bilangan bulat 0 atau lebih');
    await expect(p.langkah()).toHaveText('2/3');
  });

  test('[Positif] PL-19 mode default "Per kapal"; pilih "Pelabuhan 24 jam" → muncul 2 kolom kapasitas harian', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QAX', nama: 'QA AUTO X', kotaCari: 'Cilegon', kota: 'Kota Cilegon' });
    await p.lanjut();
    await expect(p.modeRadio('Per kapal')).toBeChecked();
    await expect(p.kapPenumpangHarian).toHaveCount(0);
    await p.modeKartu('Pelabuhan 24 jam').click();
    await expect(p.kapPenumpangHarian).toBeVisible();
    await expect(p.kapKendaraanHarian).toBeVisible();
  });

  test('[Positif] PL-20 Batal menutup form tanpa menyimpan', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    const total = await p.totalData();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QAX', nama: 'QA AUTO X' });
    // form sudah diisi → harus muncul konfirmasi "Batalkan Perubahan?" → Ya, Batalkan
    expect(await p.batalForm('Batal', 'Ya, Batalkan'), 'konfirmasi "Batalkan Perubahan?" harus muncul').toBe(true);
    expect(await p.totalData()).toBe(total);
  });

  test('[Negatif] PL-20b Batal → "Batalkan Perubahan?" → Kembali → form tetap terbuka & isian tidak hilang', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QAX', nama: 'QA AUTO X' });
    expect(await p.batalForm('Batal', 'Kembali')).toBe(true);
    await expect(p.form).toBeVisible();
    await expect(p.kode).toHaveValue('QAX');
    await expect(p.nama).toHaveValue('QA AUTO X');
    await p.batalForm('Close', 'Ya, Batalkan');
  });

  test('[Edge] PL-20c form belum diisi → Batal langsung menutup tanpa konfirmasi', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    expect(await p.batalForm('Batal'), 'form kosong tidak perlu konfirmasi').toBe(false);
  });

  test('[Positif] PL-21 dermaga baru: kode otomatis ber-awalan kode pelabuhan, nama wajib', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QAX', nama: 'QA AUTO X', kotaCari: 'Cilegon', kota: 'Kota Cilegon' });
    await p.lanjut();
    await p.lanjut();
    await expect(p.langkah()).toHaveText('3/3');
    await expect(p.form).toContainText('Belum ada dermaga');
    await p.btnTambahDermaga.click();
    await expect(p.barisDermaga).toHaveCount(1);
    await expect(p.barisDermaga.first()).toContainText('QAX-'); // awalan = kode pelabuhan
    await expect(p.barisDermaga.first().getByRole('textbox', { name: 'Kode' })).toHaveValue('D1');
    // nama dermaga kosong → Simpan → ditolak di tempat (tidak muncul konfirmasi)
    await p.btnForm('Simpan').click();
    await expect(p.form).toContainText('Nama dermaga wajib diisi');
    await expect(p.konfirmasi).toHaveCount(0);
  });

  test('[Positif] PL-22 Ubah Data: kode terkunci, judul memuat nama pelabuhan', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto({ search: KODE_ADA });
    await p.bukaUbah(KODE_ADA);
    await expect(p.form.getByRole('heading').first()).toContainText('ADONARA');
    await expect(p.kode).toBeDisabled();
    await expect(p.kode).toHaveValue(KODE_ADA);
    await p.batalForm('Batal');
  });

  /* --------------------------------- TEMUAN --------------------------------- */

  test('[Temuan] PL-T01 mode "Pelabuhan 24 jam": kapasitas harian kosong seharusnya ditolak di langkah 2', async ({ page }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QAX', nama: 'QA AUTO X', kotaCari: 'Cilegon', kota: 'Kota Cilegon' });
    await p.lanjut();
    await p.modeKartu('Pelabuhan 24 jam').click();
    await p.lanjut();
    const langkah = (await p.langkah().innerText()).trim();
    await cekTemuan(page, {
      id: 'PL-T01',
      judul: 'Mode Pelabuhan 24 jam bisa lanjut ke langkah 3 walau kapasitas harian kosong',
      langkah: [...LANGKAH_TAMBAH, 'Isi Kode, Nama, Kota → Selanjutnya', 'Pilih mode "Pelabuhan 24 jam", biarkan kapasitas harian kosong → Selanjutnya'],
      ekspektasi: 'Tetap di langkah 2/3 dengan pesan wajib diisi pada Kapasitas penumpang harian & Kapasitas kendaraan harian (SUP)',
      aktual: `Pindah ke langkah ${langkah}; error baru muncul setelah klik Simpan di langkah terakhir`,
      cek: async () => expect(langkah).toBe('2/3'),
      fokus: p.form,
    });
  });
});
/* ------------------- DAMPAK ke web Ferizy (hanya membaca CMS & web) ------------------- */
/** Baris pelabuhan di CMS berdasarkan nama persis: { kode, kota, zona, aktif } (null kalau tidak ada). */
async function pelabuhanCms(p: PelabuhanPage, nama: string) {
  await p.goto({ search: nama });
  const namaKol = await p.nilaiKolom('Nama Pelabuhan');
  const i = namaKol.findIndex((n) => n.toUpperCase() === nama.toUpperCase());
  if (i < 0) return null;
  const ambil = async (k: string) => (await p.nilaiKolom(k))[i];
  return { kode: await ambil('Kode'), kota: await ambil('Kota'), zona: await ambil('Zona Waktu'), aktif: await ambil('Aktif') };
}

test.describe('Pelabuhan — dampak ke web Ferizy', () => {
  test('[Dampak] PL-41 web "Berangkat dari": setiap pelabuhan ada di CMS, Aktif, dengan nama & kota yang sama', async ({ page, browser }) => {
    const { ctx, web } = await bukaWeb(browser);
    try {
      const opsi = await opsiAsalWeb(web);
      expect(opsi.length, 'web punya pilihan pelabuhan asal').toBeGreaterThan(0);
      const p = new PelabuhanPage(page);
      const salah: string[] = [];
      for (const o of opsi) {
        const c = await pelabuhanCms(p, o.nama);
        if (!c) salah.push(`${o.nama}: tidak ada di CMS`);
        else if (c.aktif !== 'Aktif') salah.push(`${o.nama}: di CMS "${c.aktif}"`);
        else if (c.kota.split(' - ')[0].trim() !== o.kota) salah.push(`${o.nama}: kota web "${o.kota}" ≠ CMS "${c.kota}"`);
      }
      await cekTemuan(web, {
        id: 'PL-T20',
        judul: 'Pilihan "Berangkat dari" di web tidak sesuai master Pelabuhan CMS',
        langkah: ['Web Ferizy → beranda → klik "Berangkat dari"', 'Bandingkan tiap pelabuhan dengan menu Pelabuhan di CMS (nama, kota, status)'],
        ekspektasi: 'Semua pelabuhan di web ada di CMS, berstatus Aktif, nama & kota sama',
        aktual: salah.join('; '),
        cek: async () => expect(salah).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });

  test('[Dampak] PL-42 zona waktu di kartu jadwal web (LEMBAR → PADANG BAI) = zona pelabuhan asal di CMS', async ({ page, browser }) => {
    const c = await pelabuhanCms(new PelabuhanPage(page), 'LEMBAR');
    test.skip(!c, 'Pelabuhan LEMBAR tidak ada di CMS');
    const tgl = process.env.KP_TGL_WEB ?? tglDepan(11);
    const { ctx, web } = await bukaWeb(browser);
    try {
      const kartu = await jadwalWeb(web, '49', '67', tgl);
      test.skip(kartu.length === 0, `Tidak ada jadwal di web untuk ${tgl}`);
      const zonaWeb = [...new Set(kartu.map((k) => k.zona))];
      await cekTemuan(web, {
        id: 'PL-T21',
        judul: 'Zona waktu jam berangkat di web berbeda dengan zona pelabuhan asal di CMS',
        langkah: [`Web Ferizy → Lembar → Padang Bai tanggal ${tgl}`, 'Lihat zona di jam berangkat tiap kartu', 'CMS → Pelabuhan → LEMBAR → kolom Zona Waktu'],
        ekspektasi: `Zona di web sama dengan CMS ("${c!.zona}")`,
        aktual: `Web: ${zonaWeb.join(', ')}; CMS: ${c!.zona}`,
        cek: async () => { for (const z of zonaWeb) expect(c!.zona).toContain(z); },
      });
    } finally {
      await ctx.close();
    }
  });

  test('[Dampak] PL-43 halaman web "Pelabuhan" menampilkan pelabuhan Aktif dari CMS (sampel 15 pertama)', async ({ page, browser }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.filterAktivasi('Aktif');
    const nama = (await p.nilaiKolom('Nama Pelabuhan')).slice(0, 15);
    const { ctx, web } = await bukaWeb(browser);
    try {
      const teks = await teksPelabuhanWeb(web);
      const hilang = nama.filter((n) => !teks.includes(`pelabuhan ${n.toLowerCase()}`));
      await cekTemuan(web, {
        id: 'PL-T22',
        judul: 'Pelabuhan Aktif di CMS tidak tampil di halaman Pelabuhan web',
        langkah: ['CMS → Pelabuhan → filter Aktif (halaman 1)', 'Web Ferizy → menu "Pelabuhan" (/outlets)', 'Cari nama tiap pelabuhan'],
        ekspektasi: 'Semua pelabuhan Aktif di CMS tampil di web',
        aktual: `Tidak tampil: ${hilang.join(', ')}`,
        cek: async () => expect(hilang).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });

  test('[Negatif] PL-44 pelabuhan NONAKTIF di CMS tidak muncul di web (halaman Pelabuhan & "Berangkat dari")', async ({ page, browser }) => {
    const p = new PelabuhanPage(page);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    const nama = (await p.nilaiKolom('Nama Pelabuhan')).slice(0, 15);
    test.skip(nama.length === 0, 'Tidak ada pelabuhan nonaktif');
    const { ctx, web } = await bukaWeb(browser);
    try {
      const teks = await teksPelabuhanWeb(web);
      const asal = (await opsiAsalWeb(web)).map((o) => o.nama.toUpperCase());
      const muncul = nama.filter((n) => teks.includes(`pelabuhan ${n.toLowerCase()}`) || asal.includes(n.toUpperCase()));
      await cekTemuan(web, {
        id: 'PL-T23',
        judul: 'Pelabuhan yang Nonaktif di CMS masih tampil di web',
        langkah: ['CMS → Pelabuhan → filter Nonaktif', 'Web Ferizy → menu "Pelabuhan" dan pilihan "Berangkat dari"'],
        ekspektasi: 'Pelabuhan nonaktif tidak ditampilkan ke pelanggan',
        aktual: `Masih tampil: ${muncul.join(', ')}`,
        cek: async () => expect(muncul).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });
});
