import { test, expect } from '@playwright/test';
import { PerusahaanPage, jumlahCabangPerPerusahaan, jumlahKapalPerPerusahaan, perusahaanDiFormKapal } from './pages/perusahaan.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import { bacaTeksFile } from './pages/baca-file';

/**
 * MASTER DATA — PERUSAHAAN (/companies) — READ-ONLY
 * Form dibuka lalu DIBATALKAN; tidak ada data yang disimpan.
 * ID: PR-0x/1x (fungsi), PR-2x (dampak), PR-T0x (temuan)
 */

const ADA = process.env.PR_KODE ?? 'DLU'; // perusahaan Aktif yang sudah ada (PT. Dharma Lautan Utama)

async function semua(p: PerusahaanPage) {
  await p.goto();
  await p.setLimit(50);
  return p.semuaBaris();
}

test.describe('Perusahaan — daftar', () => {
  test('[Positif] PR-01 halaman tampil: judul, toolbar, 6 kolom, ringkasan data', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    for (const b of [p.cari, p.btnFilter, p.btnTampilan, p.btnExport, p.btnTambah]) await expect(b).toBeVisible();
    expect(await p.header()).toEqual(['Kode', 'Nama Perusahaan', 'Email', 'Jumlah Cabang', 'Jumlah Kapal', 'Status']);
    expect(await p.totalData()).toBeGreaterThan(0);
  });

  test('[Positif] PR-02 cari kode & nama (huruf kecil) → hasil sesuai', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    await p.cariData(ADA);
    await expect(p.baris(ADA)).toHaveCount(1);
    await p.cariData('dharma');
    await expect.poll(() => p.totalData()).toBeGreaterThan(0);
    const [kode, nama] = [await p.nilaiKolom('Kode'), await p.nilaiKolom('Nama Perusahaan')];
    kode.forEach((k, i) => expect(`${k} ${nama[i]}`.toLowerCase()).toContain('dharma'));
  });

  test('[Negatif] PR-03 cari kata yang tidak ada → 0 data; [Edge] karakter khusus → tidak error', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    await p.cariData('ZZZTIDAKADA');
    await expect.poll(() => p.totalData()).toBe(0);
    await p.cari.fill("%' <");
    await page.waitForTimeout(1_000);
    await p.tungguData();
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Positif] PR-04 filter Status Aktif → semua Aktif; Nonaktif → semua Nonaktif', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    await p.filterAktivasi('Aktif');
    await expect.poll(async () => (await p.nilaiKolom('Status')).every((s) => s === 'Aktif'), { timeout: 10_000 }).toBe(true);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    await expect.poll(async () => (await p.nilaiKolom('Status')).every((s) => s === 'Nonaktif'), { timeout: 10_000 }).toBe(true);
  });

  test('[Positif] PR-05 sort Kode & Nama Perusahaan: klik kedua membalik urutan', async ({ page }) => {
    const p = new PerusahaanPage(page);
    for (const kolom of ['Kode', 'Nama Perusahaan']) {
      await p.goto();
      await p.setLimit(50);
      const naik = await p.sortBy(kolom);
      const turun = await p.sortBy(kolom);
      expect(turun, `sort ${kolom}`).toEqual([...naik].reverse());
    }
  });

  test('[Positif] PR-06 lebih dari 10 perusahaan → Berikutnya menampilkan sisanya', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    const total = await p.totalData();
    test.skip(total <= 10, `Hanya ${total} perusahaan`);
    await p.btnBerikutnya.click();
    await expect(p.ringkasan).toHaveText(new RegExp(`Menampilkan 11-${Math.min(20, total)} dari ${total} data`));
  });

  test('[Positif] PR-07 Export Ke Excel → file berisi kode & nama perusahaan', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto({ search: ADA });
    const dl = await p.exportExcel();
    const isi = bacaTeksFile((await dl.path())!);
    expect(isi).toContain(ADA);
    expect(isi).toContain('Dharma Lautan Utama');
  });

  test('[Positif] PR-08 menu ⋯: Ubah Data, Nonaktifkan, Hapus Data', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto({ search: ADA });
    expect(await p.daftarAksi(ADA)).toEqual(['Ubah Data', 'Nonaktifkan', 'Hapus Data']);
  });
});

test.describe('Perusahaan — form (tanpa menyimpan)', () => {
  test('[Negatif] PR-10 Simpan form kosong → 2 pesan wajib; [Positif] status default Aktif', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    await p.bukaTambah();
    await expect(p.aktif).toHaveAttribute('aria-checked', 'true');
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesan()).toEqual(expect.arrayContaining(['Kode perusahaan wajib diisi', 'Nama perusahaan wajib diisi']));
    await expect(p.form).toBeVisible();
    await p.batalForm('Batal');
  });

  test('[Negatif] PR-11 email tidak valid ("abc@", "abc.com") → ditolak', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    await p.bukaTambah();
    const hasil: string[] = [];
    for (const e of ['abc@', 'abc.com']) {
      await p.isi({ kode: 'QAX', nama: 'QA X', email: e });
      const pesan = await p.cobaSimpan();
      hasil.push(`"${e}" → ${pesan.join(' / ') || 'tanpa pesan'}`);
    }
    await cekTemuan(page, {
      id: 'PR-T01',
      judul: 'Email perusahaan yang tidak valid tidak ditolak',
      langkah: ['Perusahaan → Tambah', 'Isi kode & nama, Email "abc@" lalu "abc.com"', 'Klik Simpan (lalu Batal)'],
      ekspektasi: 'Muncul pesan format email tidak valid',
      aktual: hasil.join('; '),
      cek: async () => expect(hasil.every((h) => /email/i.test(h))).toBe(true),
      fokus: p.email,
    });
    await p.batalForm('Batal', 'Ya, Batalkan');
  });

  test('[Negatif] PR-12 telepon berisi huruf ("08abc") → tidak bisa diketik atau ditolak', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'QAX', nama: 'QA X', telepon: '08abc' });
    const nilai = await p.telepon.inputValue();
    const pesan = /[a-z]/i.test(nilai) ? (await p.cobaSimpan()).join(' / ') : '';
    await cekTemuan(page, {
      id: 'PR-T02',
      judul: 'Telepon perusahaan menerima huruf',
      langkah: ['Perusahaan → Tambah', 'Isi kode & nama, Telepon "08abc"', 'Klik Simpan (lalu Batal)'],
      ekspektasi: 'Huruf tidak bisa diketik, atau muncul pesan format telepon',
      aktual: `Telepon terisi "${nilai}"; pesan: ${pesan || '(tidak ada)'}`,
      cek: async () => expect(!/[a-z]/i.test(nilai) || /telepon/i.test(pesan)).toBe(true),
      fokus: p.telepon,
    });
    await p.batalForm('Batal', 'Ya, Batalkan');
  });

  test('[Edge] PR-13 kode 30 karakter / huruf kecil / simbol & nama 150 karakter → dibatasi atau ditolak', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'qa kode-!@#' + 'X'.repeat(19), nama: 'N'.repeat(150) });
    const [kode, nama] = [await p.kode.inputValue(), await p.nama.inputValue()];
    const pesan = (await p.cobaSimpan()).join(' / ');
    await cekTemuan(page, {
      id: 'PR-T03',
      judul: 'Kode perusahaan menerima huruf kecil, spasi, simbol & panjang tanpa batas',
      langkah: ['Perusahaan → Tambah', 'Kode "qa kode-!@#XXXXXXXXXXXXXXXXXXX" (30 karakter), Nama 150 karakter', 'Klik Simpan (lalu Batal)'],
      ekspektasi: 'Kode dibatasi panjang & hanya huruf besar/angka (seperti ASDP, DLU, JEMLA); nama dibatasi',
      aktual: `Kode "${kode}" (${kode.length}), nama ${nama.length} karakter; pesan: ${pesan || '(tidak ada)'}`,
      cek: async () => expect(pesan.length > 0 || (kode === kode.toUpperCase() && kode.length <= 20)).toBe(true),
      fokus: p.kode,
    });
    await p.batalForm('Batal', 'Ya, Batalkan');
  });

  test('[Positif] PR-14 Batal: form terisi → konfirmasi → Kembali → isian tetap', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'QAX', nama: 'QA AUTO X' });
    expect(await p.batalForm('Batal', 'Kembali')).toBe(true);
    await expect(p.kode).toHaveValue('QAX');
    expect(await p.batalForm('Batal', 'Ya, Batalkan')).toBe(true);
  });

  test('[Positif] PR-15 Ubah Data: isian sama dengan tabel; kode perusahaan yang SUDAH DIPAKAI kapal terkunci', async ({ page }) => {
    const p = new PerusahaanPage(page);
    await p.goto({ search: ADA });
    const r = (await p.semuaBaris()).find((x) => x.Kode === ADA)!;
    await p.bukaUbah(ADA);
    await expect(p.kode).toHaveValue(ADA);
    await expect(p.nama).toHaveValue(r['Nama Perusahaan']);
    if (r.Email && r.Email !== '-') await expect(p.email).toHaveValue(r.Email);
    const bisa = await p.kode.isEditable();
    await cekTemuan(page, {
      id: 'PR-T04',
      judul: 'Kode perusahaan yang sudah dipakai kapal masih bisa diubah (bertentangan dengan keterangan form)',
      langkah: ['Perusahaan', `${ADA} (Jumlah Kapal ${r['Jumlah Kapal']}) → ⋯ → Ubah Data`, 'Klik field Kode perusahaan'],
      ekspektasi: 'Kode terkunci: "Unik, tidak bisa diubah setelah dipakai"',
      aktual: bisa ? 'Field Kode bisa diketik' : 'Terkunci',
      cek: async () => expect(bisa).toBe(false),
      fokus: p.kode,
    });
    expect(await p.batalForm('Batal')).toBe(false);
  });
});

test.describe('Perusahaan — dampak', () => {
  test('[Dampak] PR-20 kolom "Jumlah Kapal" = jumlah kapal di master Kapal per perusahaan', async ({ page, request }) => {
    test.setTimeout(240_000);
    const p = new PerusahaanPage(page);
    const daftar = await semua(p);
    const hitung = await jumlahKapalPerPerusahaan(request);
    const beda = daftar.filter((r) => Number(r['Jumlah Kapal']) !== (hitung[r.Kode] ?? 0)).map((r) => `${r.Kode}: tabel ${r['Jumlah Kapal']}, master Kapal ${hitung[r.Kode] ?? 0}`);
    await cekTemuan(page, {
      id: 'PR-T05',
      judul: '"Jumlah Kapal" di Perusahaan tidak sama dengan jumlah kapal di master Kapal',
      langkah: ['Perusahaan → lihat kolom Jumlah Kapal', 'Kapal → hitung kapal per perusahaan (Ubah Data → Perusahaan)'],
      ekspektasi: 'Angka sama untuk setiap perusahaan',
      aktual: beda.join('; '),
      cek: async () => expect(beda).toEqual([]),
      fokus: p.tabel,
    });
  });

  test('[Dampak] PR-21 kolom "Jumlah Cabang" = jumlah cabang di menu Cabang per perusahaan', async ({ page, request }) => {
    const p = new PerusahaanPage(page);
    const daftar = await semua(p);
    const hitung = await jumlahCabangPerPerusahaan(request);
    test.skip(Object.keys(hitung).length === 0, 'Data Cabang tidak terbaca dari /branches');
    const beda = daftar.filter((r) => Number(r['Jumlah Cabang']) !== (hitung[r.Kode] ?? 0)).map((r) => `${r.Kode}: tabel ${r['Jumlah Cabang']}, menu Cabang ${hitung[r.Kode] ?? 0}`);
    await cekTemuan(page, {
      id: 'PR-T06',
      judul: '"Jumlah Cabang" di Perusahaan tidak sama dengan jumlah cabang di menu Cabang',
      langkah: ['Perusahaan → lihat kolom Jumlah Cabang', 'Cabang → hitung cabang per perusahaan'],
      ekspektasi: 'Angka sama untuk setiap perusahaan',
      aktual: beda.join('; '),
      cek: async () => expect(beda).toEqual([]),
      fokus: p.tabel,
    });
  });

  test('[Dampak] PR-22 pilihan "Perusahaan" di form Kapal = perusahaan Aktif', async ({ page }) => {
    const p = new PerusahaanPage(page);
    const daftar = await semua(p);
    const opsi = await perusahaanDiFormKapal(page);
    for (const r of daftar.filter((x) => x.Status === 'Aktif')) expect(opsi, `perusahaan aktif "${r['Nama Perusahaan']}"`).toContain(r['Nama Perusahaan']);
    for (const r of daftar.filter((x) => x.Status !== 'Aktif')) expect(opsi, `perusahaan nonaktif "${r['Nama Perusahaan']}"`).not.toContain(r['Nama Perusahaan']);
  });
});
