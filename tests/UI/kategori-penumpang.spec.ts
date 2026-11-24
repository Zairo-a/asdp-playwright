import { test, expect } from '@playwright/test';
import { KategoriPage } from './pages/penumpang.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import { bacaTeksFile } from './pages/baca-file';
import { bukaWeb, opsiPenumpangWeb } from './pages/ferizy.pages';

/**
 * MASTER DATA — KATEGORI PENUMPANG (/passenger-categories) — READ-ONLY
 * Form dibuka lalu DIBATALKAN; tidak ada data yang disimpan.
 * ID: KG-0x/1x (fungsi), KG-2x (dampak), KG-T0x (temuan)
 */

const ADA = process.env.KG_KODE ?? 'DWS'; // kategori Aktif yang sudah ada (Dewasa)
const angka = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s.trim()) : null);

test.describe('Kategori Penumpang — daftar', () => {
  test('[Positif] KG-01 halaman tampil: judul, toolbar, 9 kolom, ringkasan data', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    for (const b of [p.cari, p.btnFilter, p.btnTampilan, p.btnExport, p.btnTambah]) await expect(b).toBeVisible();
    expect(await p.header()).toEqual(['Urutan', 'Kode', 'Nama', 'Deskripsi', 'Usia Min', 'Usia Maks', 'Pakai Kursi / Kuota', 'Wajib Identitas', 'Status']);
    expect(await p.totalData()).toBeGreaterThan(0);
  });

  test('[Positif] KG-02 cari kode & nama (huruf kecil) → hanya kategori itu', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    await p.cariData(ADA);
    await expect(p.baris(ADA)).toHaveCount(1);
    await p.cariData('dewasa');
    await expect.poll(() => p.totalData()).toBeGreaterThan(0);
    for (const n of await p.nilaiKolom('Nama')) expect(n.toLowerCase()).toContain('dewasa');
  });

  test('[Negatif] KG-03 cari kata yang tidak ada → 0 data; [Edge] karakter khusus → tidak error', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    await p.cariData('ZZZTIDAKADA');
    await expect.poll(() => p.totalData()).toBe(0);
    await p.cari.fill("%' <");
    await page.waitForTimeout(1_000);
    await p.tungguData();
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Positif] KG-04 filter Status Aktif → semua Aktif', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    await p.filterAktivasi('Aktif');
    await expect.poll(async () => (await p.nilaiKolom('Status')).every((s) => s === 'Aktif')).toBe(true);
  });

  test('[Positif] KG-05 urutan default mengikuti kolom Urutan (naik)', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    const u = (await p.nilaiKolom('Urutan')).map(Number);
    expect(u).toEqual([...u].sort((a, b) => a - b));
  });

  test('[Positif] KG-06 sort Usia Min: naik lalu turun', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    const naik = (await p.sortBy('Usia Min')).map(Number);
    expect(naik).toEqual([...naik].sort((a, b) => a - b));
    const turun = (await p.sortBy('Usia Min')).map(Number);
    expect(turun).toEqual([...turun].sort((a, b) => b - a));
  });

  test('[Positif] KG-07 Export Ke Excel → file berisi kode kategori', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    const dl = await p.exportExcel();
    expect(bacaTeksFile((await dl.path())!)).toContain(ADA);
  });

  test('[Positif] KG-08 menu ⋯ kategori Aktif: ubah, Nonaktifkan, Hapus Data', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto({ search: ADA });
    const menu = await p.daftarAksi(ADA);
    expect(menu).toContain('Nonaktifkan');
    expect(menu).toContain('Hapus Data');
    expect(menu.some((m) => /^(Ubah|Edit) Data$/.test(m))).toBe(true);
  });
});

test.describe('Kategori Penumpang — form (tanpa menyimpan)', () => {
  test('[Negatif] KG-10 Simpan form kosong → "Kode/Nama/Min umur wajib diisi"; [Edge] Urutan otomatis = jumlah data + 1', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    const total = await p.totalData();
    await p.bukaTambah();
    await expect(p.urutan).toHaveValue(String(total + 1));
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesan()).toEqual(expect.arrayContaining(['Kode wajib diisi', 'Nama wajib diisi', 'Min umur wajib diisi']));
    await expect(p.form).toBeVisible();
    await p.batalForm('Close');
  });

  test('[Positif] KG-11 nilai default switch: Pakai kursi = Ya, Wajib identitas = Ya, Status = Aktif', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    await p.bukaTambah();
    for (const sw of [p.pakaiKursi, p.wajibIdentitas, p.status]) await expect(sw).toHaveAttribute('aria-checked', 'true');
    await p.batalForm('Close');
  });

  test('[Negatif] KG-12 Min umur lebih besar dari Maks umur → ditolak', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'QX', nama: 'QA X', min: '50', maks: '10' });
    await p.btnForm('Simpan').click();
    if (await p.konfirmasi.isVisible().catch(() => false)) await p.konfirmasiKlik(/^(Batal|Kembali)$/); // JANGAN simpan
    await page.waitForTimeout(800);
    const pesan = (await p.pesan()).join(' / ');
    await cekTemuan(page, {
      id: 'KG-T04',
      judul: 'Form Kategori Penumpang tidak menolak Min umur > Maks umur',
      langkah: ['Kategori Penumpang → Tambah', 'Kode "QX", Nama "QA X", Min umur 50, Maks umur 10', 'Klik Simpan (lalu Batal)'],
      ekspektasi: 'Pesan: Maks umur harus ≥ Min umur; tidak bisa disimpan',
      aktual: pesan ? `Pesan: ${pesan}` : 'Tidak ada pesan (lanjut ke konfirmasi simpan)',
      cek: async () => expect(pesan).not.toBe(''),
      fokus: p.maks,
    });
    if (await p.form.isVisible()) await p.batalForm('Close', 'Ya, Batalkan');
  });

  test('[Negatif] KG-13 umur negatif / huruf → tidak bisa diketik atau ditolak', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'QX', nama: 'QA X', min: '-5', maks: 'abc' });
    const [min, maks] = [await p.min.inputValue(), await p.maks.inputValue()];
    if (min.includes('-') || /[a-z]/i.test(maks)) {
      await p.btnForm('Simpan').click();
      if (await p.konfirmasi.isVisible().catch(() => false)) await p.konfirmasiKlik(/^(Batal|Kembali)$/);
      await expect.poll(async () => (await p.pesan()).length, `min "${min}", maks "${maks}" harus ditolak`).toBeGreaterThan(0);
    } else {
      expect(min).not.toContain('-');
      expect(maks).not.toMatch(/[a-z]/i);
    }
    await p.batalForm('Close', 'Ya, Batalkan');
  });

  test('[Positif] KG-14 Batal: form terisi → konfirmasi → Kembali → isian tetap', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'QX', nama: 'QA AUTO X' });
    expect(await p.batalForm('Batal', 'Kembali')).toBe(true);
    await expect(p.kode).toHaveValue('QX');
    expect(await p.batalForm('Close', 'Ya, Batalkan')).toBe(true);
  });

  test('[Positif] KG-15 Ubah Data: isian sama dengan baris di tabel; tutup tanpa perubahan → tanpa konfirmasi', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto({ search: ADA });
    const r = (await p.semuaBaris()).find((x) => x.Kode === ADA)!;
    await p.bukaUbah(ADA);
    await expect(p.kode).toHaveValue(ADA);
    await expect(p.nama).toHaveValue(r.Nama);
    await expect(p.min).toHaveValue(r['Usia Min']);
    await expect(p.maks).toHaveValue(r['Usia Maks']);
    await expect(p.pakaiKursi).toHaveAttribute('aria-checked', String(r['Pakai Kursi / Kuota'] === 'Ya'));
    expect(await p.batalForm('Close')).toBe(false);
  });
});

test.describe('Kategori Penumpang — dampak ke web Ferizy', () => {
  test('[Dampak] KG-20 pilihan "Penumpang" di web = kategori Aktif di CMS (nama, keterangan, urutan)', async ({ page, browser }) => {
    const p = new KategoriPage(page);
    await p.goto();
    const aktif = (await p.semuaBaris()).filter((r) => r.Status === 'Aktif').sort((a, b) => Number(a.Urutan) - Number(b.Urutan));
    const { ctx, web } = await bukaWeb(browser);
    try {
      const opsi = await opsiPenumpangWeb(web);
      const beda: string[] = [];
      const namaCms = aktif.map((r) => r.Nama);
      const namaWeb = opsi.map((o) => o.nama);
      if (JSON.stringify(namaCms) !== JSON.stringify(namaWeb)) beda.push(`urutan/nama web [${namaWeb.join(', ')}] ≠ CMS [${namaCms.join(', ')}]`);
      for (const r of aktif) {
        const o = opsi.find((x) => x.nama === r.Nama);
        if (o && o.keterangan !== r.Deskripsi) beda.push(`${r.Nama}: keterangan web "${o.keterangan}" ≠ CMS "${r.Deskripsi}"`);
      }
      await cekTemuan(web, {
        id: 'KG-T20',
        judul: 'Pilihan penumpang di web tidak sama dengan kategori Aktif di CMS',
        langkah: ['Web Ferizy → beranda → klik "Penumpang"', 'Bandingkan dengan menu Kategori Penumpang di CMS (Aktif, urut kolom Urutan)'],
        ekspektasi: 'Nama, keterangan, dan urutan sama',
        aktual: beda.join('; '),
        cek: async () => expect(beda).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });
});

/* --------------------------------- TEMUAN --------------------------------- */
test.describe('Kategori Penumpang — temuan', () => {
  test('[Temuan] KG-T01 deskripsi kategori seharusnya sesuai Usia Min / Maks', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    const salah: string[] = [];
    for (const r of await p.semuaBaris()) {
      const [min, maks, d] = [angka(r['Usia Min']), angka(r['Usia Maks']), r.Deskripsi];
      let m: RegExpMatchArray | null;
      if ((m = d.match(/Usia (\d+) tahun ke atas/)) && Number(m[1]) !== min) salah.push(`${r.Nama}: "${d}" tapi Usia Min ${min}`);
      if ((m = d.match(/Usia (\d+)\s*[–-]\s*(\d+) tahun/)) && (Number(m[1]) !== min || Number(m[2]) !== maks)) salah.push(`${r.Nama}: "${d}" tapi usia ${min}–${maks}`);
      if ((m = d.match(/[Dd]i bawah (\d+) tahun/)) && maks !== null && Number(m[1]) !== maks + 1) salah.push(`${r.Nama}: "${d}" tapi Usia Maks ${maks}`);
      if (/ke atas/.test(d) && maks !== null) salah.push(`${r.Nama}: "${d}" (tanpa batas atas) tapi Usia Maks ${maks}`);
    }
    await cekTemuan(page, {
      id: 'KG-T01',
      judul: 'Deskripsi kategori penumpang tidak sesuai dengan rentang usianya (deskripsi ini tampil ke pelanggan di web)',
      langkah: ['Buka menu Kategori Penumpang', 'Bandingkan kolom Deskripsi dengan Usia Min & Usia Maks'],
      ekspektasi: 'Angka di deskripsi sama dengan Usia Min/Maks',
      aktual: salah.join('; '),
      cek: async () => expect(salah).toEqual([]),
      fokus: p.tabel,
    });
  });

  test('[Temuan] KG-T02 rentang usia kategori Aktif seharusnya menutup semua umur (0 → tanpa batas), tanpa tumpang-tindih', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    const r = (await p.semuaBaris()).filter((x) => x.Status === 'Aktif')
      .map((x) => ({ nama: x.Nama, min: angka(x['Usia Min']) ?? 0, maks: angka(x['Usia Maks']) }))
      .sort((a, b) => a.min - b.min);
    const masalah: string[] = [];
    if (r[0]?.min !== 0) masalah.push(`umur 0 tidak tercakup (min terkecil ${r[0]?.min})`);
    for (let i = 1; i < r.length; i++) {
      const sblm = r[i - 1].maks;
      if (sblm === null) { masalah.push(`${r[i - 1].nama} tanpa batas atas tapi ada ${r[i].nama} sesudahnya`); continue; }
      if (r[i].min > sblm + 1) masalah.push(`umur ${sblm + 1}–${r[i].min - 1} tidak masuk kategori mana pun`);
      if (r[i].min <= sblm) masalah.push(`${r[i - 1].nama} (${r[i - 1].min}–${sblm}) tumpang-tindih dengan ${r[i].nama} (mulai ${r[i].min})`);
    }
    const akhir = r[r.length - 1];
    if (akhir && akhir.maks !== null) masalah.push(`umur di atas ${akhir.maks} tahun tidak masuk kategori mana pun (${akhir.nama} maks ${akhir.maks})`);
    await cekTemuan(page, {
      id: 'KG-T02',
      judul: 'Ada umur penumpang yang tidak masuk kategori mana pun (atau rentang usia tumpang-tindih)',
      langkah: ['Buka menu Kategori Penumpang', 'Urutkan kategori Aktif menurut Usia Min, cek sambungan Usia Maks → Usia Min berikutnya'],
      ekspektasi: 'Rentang menyambung dari 0 sampai tanpa batas atas, tidak ada celah atau tumpang-tindih',
      aktual: masalah.join('; '),
      cek: async () => expect(masalah).toEqual([]),
      fokus: p.tabel,
    });
  });

  test('[Temuan] KG-T03 kolom "Wajib Identitas" seharusnya Ya/Tidak, bukan 1/0', async ({ page }) => {
    const p = new KategoriPage(page);
    await p.goto();
    const nilai = [...new Set(await p.nilaiKolom('Wajib Identitas'))];
    await cekTemuan(page, {
      id: 'KG-T03',
      judul: 'Kolom "Wajib Identitas" menampilkan angka 1/0',
      langkah: ['Buka menu Kategori Penumpang', 'Lihat kolom Wajib Identitas'],
      ekspektasi: 'Ditampilkan "Ya" / "Tidak" (seperti kolom Pakai Kursi)',
      aktual: `Nilai: ${nilai.join(', ')}`,
      cek: async () => expect(nilai.every((v) => /^(Ya|Tidak)$/.test(v))).toBe(true),
      fokus: p.tabel,
    });
  });
});
