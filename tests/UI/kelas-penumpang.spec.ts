import { test, expect } from '@playwright/test';
import { KelasPage, kelasDiFormKapal } from './pages/penumpang.pages';
import { KapalPage, detailKapalAPI } from './pages/kapal.pages';
import { cekTemuan, DATA as KA, KeberangkatanListPage } from './pages/kapasitas.pages';
import { bacaTeksFile } from './pages/baca-file';

/**
 * MASTER DATA — KELAS PENUMPANG (/services) — READ-ONLY
 * Form dibuka lalu DIBATALKAN; tidak ada data yang disimpan.
 * ID: KK-0x/1x (fungsi), KK-2x (dampak), KK-T0x (temuan)
 */

const ADA = process.env.KK_KODE ?? 'EKS'; // kelas Aktif yang sudah ada (EKSEKUTIF)
const KAPAL_REG = process.env.KK_KAPAL ?? 'QAWTAXI01'; // kapal QA yang menyimpan kuota kelas REGULER

test.describe('Kelas Penumpang — daftar', () => {
  test('[Positif] KK-01 halaman tampil: judul, toolbar, kolom Kode | Nama | Status, ringkasan data', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    for (const b of [p.cari, p.btnFilter, p.btnTampilan, p.btnExport, p.btnTambah]) await expect(b).toBeVisible();
    expect(await p.header()).toEqual(['Kode', 'Nama', 'Status']);
    expect(await p.totalData()).toBeGreaterThan(0);
  });

  test('[Positif] KK-02 cari berdasarkan kode → kelas itu ada di hasil', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.cariData(ADA);
    await expect(p.baris(ADA)).toHaveCount(1);
  });

  test('[Positif] KK-03 cari berdasarkan nama (huruf kecil) → semua hasil mengandung kata itu', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.cariData('ekonomi');
    await expect.poll(() => p.totalData()).toBeGreaterThan(0);
    const [kode, nama] = [await p.nilaiKolom('Kode'), await p.nilaiKolom('Nama')];
    kode.forEach((k, i) => expect(`${k} ${nama[i]}`.toLowerCase()).toContain('ekonomi'));
  });

  test('[Negatif] KK-04 cari kata yang tidak ada → 0 data', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.cariData('ZZZTIDAKADA');
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Edge] KK-05 cari dengan karakter khusus (%\' <) → tidak error, 0 data', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.cari.fill("%' <");
    await page.waitForTimeout(1_000);
    await p.tungguData();
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Positif] KK-06 filter Aktif → semua Aktif; filter Nonaktif → semua Nonaktif', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.filterAktivasi('Aktif');
    await expect.poll(async () => (await p.nilaiKolom('Status')).every((s) => s === 'Aktif')).toBe(true);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    // beri waktu tabel memuat ulang (maks 10 detik) sebelum menyimpulkan
    const semuaNonaktif = await expect.poll(async () => (await p.nilaiKolom('Status')).every((s) => s === 'Nonaktif'), { timeout: 10_000 }).toBe(true).then(() => true, () => false);
    const st = await p.nilaiKolom('Status');
    await cekTemuan(page, {
      id: 'KK-T08',
      judul: 'Filter "Nonaktif" di Kelas Penumpang tidak menyaring data (kelas Aktif tetap tampil)',
      langkah: ['Buka menu Kelas Penumpang', 'Klik Filter → centang "Nonaktif"'],
      ekspektasi: 'Hanya kelas berstatus Nonaktif yang tampil',
      aktual: `Filter aktif (1), tapi tabel menampilkan ${st.length} baris: ${st.filter((s) => s === 'Aktif').length} Aktif, ${st.filter((s) => s === 'Nonaktif').length} Nonaktif`,
      cek: async () => expect(semuaNonaktif).toBe(true),
      fokus: p.tabel,
    });
  });

  test('[Positif] KK-07 sort Kode & Nama: klik kedua membalik urutan', async ({ page }) => {
    const p = new KelasPage(page);
    for (const kolom of ['Kode', 'Nama']) {
      await p.goto();
      await p.setLimit(50);
      const naik = await p.sortBy(kolom);
      const turun = await p.sortBy(kolom);
      // nama bisa dobel → bandingkan sebagai urutan nilai saja
      expect(turun, `sort ${kolom}`).toEqual([...naik].reverse());
    }
  });

  test('[Positif] KK-08 lebih dari 10 kelas → Berikutnya menampilkan sisanya', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    const total = await p.totalData();
    test.skip(total <= 10, `Hanya ${total} kelas`);
    await p.btnBerikutnya.click();
    await expect(p.ringkasan).toHaveText(new RegExp(`Menampilkan 11-${Math.min(20, total)} dari ${total} data`));
  });

  test('[Positif] KK-09 Export Ke Excel (hasil cari) → file berisi kode kelas', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto({ search: ADA });
    const dl = await p.exportExcel();
    expect(bacaTeksFile((await dl.path())!)).toContain(ADA);
  });

  test('[Positif] KK-10 menu ⋯: kelas Aktif → Nonaktifkan; kelas Nonaktif → Aktifkan (+ ubah & hapus)', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto({ search: ADA });
    const menu = await p.daftarAksi(ADA);
    expect(menu).toContain('Nonaktifkan');
    expect(menu).toContain('Hapus Data');
    expect(menu.some((m) => /^(Ubah|Edit) Data$/.test(m))).toBe(true);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    const kodeNon = (await p.nilaiKolom('Kode'))[0];
    test.skip(!kodeNon, 'Tidak ada kelas nonaktif');
    expect(await p.daftarAksi(kodeNon)).toContain('Aktifkan');
  });
});

test.describe('Kelas Penumpang — form (tanpa menyimpan)', () => {
  test('[Negatif] KK-11 Simpan form kosong → "Kode … wajib diisi" & "Nama … wajib diisi", form tetap terbuka', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesan()).toEqual(expect.arrayContaining(['Kode Kelas Penumpang wajib diisi', 'Nama Kelas Penumpang wajib diisi']));
    await expect(p.form).toBeVisible();
    await p.batalForm('Close');
  });

  test('[Positif] KK-12 status default form Tambah = Aktif', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.bukaTambah();
    await expect(p.status).toHaveAttribute('aria-checked', 'true');
    await p.batalForm('Batal'); // tombol X saat fokus di field memicu validasi dulu → pakai Batal
  });

  test('[Edge] KK-13 kode 30 karakter / huruf kecil / simbol → dibatasi atau ditolak (tidak tersimpan apa adanya)', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'qa kode-!@#' + 'X'.repeat(20), nama: 'QA X' });
    const nilai = await p.kode.inputValue();
    await p.btnForm('Simpan').click();
    // JANGAN sampai tersimpan: kalau muncul konfirmasi → Batal
    if (await p.konfirmasi.isVisible().catch(() => false)) await p.konfirmasiKlik(/^(Batal|Kembali)$/);
    await page.waitForTimeout(800);
    const pesan = (await p.pesan()).join(' / ');
    const aman = nilai.length <= 20 || pesan.length > 0;
    await cekTemuan(page, {
      id: 'KK-T05',
      judul: 'Kode kelas penumpang menerima 31 karakter, huruf kecil, spasi & simbol tanpa validasi',
      langkah: ['Buka menu Kelas Penumpang', 'Klik Tambah', 'Isi kode "qa kode-!@#XXXXXXXXXXXXXXXXXXXX", nama "QA X"', 'Klik Simpan (lalu Batal di konfirmasi)'],
      ekspektasi: 'Kode dibatasi panjangnya dan hanya huruf besar/angka (seperti kode lain: BIS, EKS, QAVIP)',
      aktual: `Kode terisi "${nilai}" (${nilai.length} karakter); pesan: ${pesan || '(tidak ada)'}`,
      cek: async () => expect(aman && (pesan.length > 0 || nilai === nilai.toUpperCase())).toBe(true),
      fokus: p.kode,
    });
    if (await p.form.isVisible()) await p.batalForm('Close', 'Ya, Batalkan');
  });

  test('[Positif] KK-14 Batal: form kosong langsung tertutup; form terisi → konfirmasi → Kembali → isian tetap', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.bukaTambah();
    expect(await p.batalForm('Batal'), 'form kosong tidak perlu konfirmasi').toBe(false);
    await p.bukaTambah();
    await p.isi({ kode: 'QAX', nama: 'QA AUTO X' });
    expect(await p.batalForm('Batal', 'Kembali')).toBe(true);
    await expect(p.kode).toHaveValue('QAX');
    expect(await p.batalForm('Close', 'Ya, Batalkan')).toBe(true);
  });

  test('[Positif] KK-15 Ubah/Edit Data: isian sama dengan baris di tabel; tutup tanpa perubahan → tanpa konfirmasi', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto({ search: ADA });
    const nama = await p.sel(ADA, 'Nama');
    const aktif = (await p.sel(ADA, 'Status')) === 'Aktif';
    await p.bukaUbah(ADA);
    await expect(p.kode).toHaveValue(ADA);
    await expect(p.nama).toHaveValue(nama);
    await expect(p.status).toHaveAttribute('aria-checked', String(aktif));
    expect(await p.batalForm('Close')).toBe(false);
  });
});

test.describe('Kelas Penumpang — dampak', () => {
  test('[Dampak] KK-20 form Kapal langkah 3 hanya menawarkan kelas AKTIF dari master Kelas Penumpang', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.setLimit(50);
    const semua = await p.semuaBaris();
    const aktif = new Set(semua.filter((r) => r.Status === 'Aktif').map((r) => r.Nama));
    const nonaktifSaja = [...new Set(semua.filter((r) => r.Status !== 'Aktif').map((r) => r.Nama))].filter((n) => !aktif.has(n));
    const diKapal = await kelasDiFormKapal(page);
    for (const n of aktif) expect(diKapal, `kelas aktif "${n}" ada di form kapal`).toContain(n);
    for (const n of nonaktifSaja) expect(diKapal, `kelas nonaktif "${n}" tidak boleh ada`).not.toContain(n);
    for (const n of diKapal) expect([...aktif], `"${n}" di form kapal ada di master (Aktif)`).toContain(n);
  });

  test('[Dampak] KK-21 kelas di tabel Alokasi Keberangkatan ada di master Kelas Penumpang & Aktif', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.setLimit(50);
    const semua = await p.semuaBaris();
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(KA.tanggalUji);
    const d = await list.bukaDetail(KA.jadwalA);
    await d.bukaTab('Alokasi');
    const head = (await d.tabelAlokasi.locator('tr').first().locator('th, td').allInnerTexts()).map((x) => x.trim().split('\n')[0].trim());
    const kelas = (await d.kolomKelas()).map((i) => head[i]);
    test.skip(kelas.length === 0, 'Tabel alokasi tanpa kolom kelas');
    const salah: string[] = [];
    for (const k of kelas) {
      const m = semua.filter((r) => r.Nama.toUpperCase() === k.toUpperCase());
      if (!m.length) salah.push(`"${k}" tidak ada di master`);
      else if (!m.some((r) => r.Status === 'Aktif')) salah.push(`"${k}" Nonaktif di master`);
    }
    await cekTemuan(page, {
      id: 'KK-T06',
      judul: 'Kelas yang Nonaktif / tidak ada di master masih dipakai di alokasi keberangkatan',
      langkah: [`Keberangkatan & Alokasi → tanggal ${KA.tanggalUji} → ${KA.jadwalA} → tab Alokasi`, 'Bandingkan kolom kelas dengan menu Kelas Penumpang'],
      ekspektasi: 'Semua kelas di alokasi ada di master dan Aktif',
      aktual: `Kelas di alokasi: ${kelas.join(', ')}. Masalah: ${salah.join('; ')}`,
      cek: async () => expect(salah).toEqual([]),
      fokus: d.tabelAlokasi,
    });
  });
});

/* --------------------------------- TEMUAN --------------------------------- */
test.describe('Kelas Penumpang — temuan', () => {
  test('[Temuan] KK-T01 nama kelas seharusnya unik (tidak ada dua kelas bernama sama) [perlu konfirmasi]', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto();
    await p.setLimit(50);
    const semua = await p.semuaBaris();
    const hitung = new Map<string, string[]>();
    for (const r of semua) hitung.set(r.Nama.toUpperCase(), [...(hitung.get(r.Nama.toUpperCase()) ?? []), `${r.Kode} (${r.Status})`]);
    const dobel = [...hitung].filter(([, v]) => v.length > 1).map(([n, v]) => `${n}: ${v.join(', ')}`);
    await cekTemuan(page, {
      id: 'KK-T01',
      judul: 'Ada beberapa kelas penumpang dengan nama yang sama',
      langkah: ['Buka menu Kelas Penumpang (Limit 50)', 'Lihat kolom Nama'],
      ekspektasi: 'Nama kelas unik, supaya pilihan kelas di Kapal/Keberangkatan/Tarif tidak membingungkan',
      aktual: dobel.join('; '),
      cek: async () => expect(dobel).toEqual([]),
      fokus: p.tabel,
    });
  });

  test('[Temuan] KK-T02 label menu "Edit Data" seharusnya "Ubah Data" seperti menu master lain', async ({ page }) => {
    const p = new KelasPage(page);
    await p.goto({ search: ADA });
    const menu = await p.daftarAksi(ADA);
    await cekTemuan(page, {
      id: 'KK-T02',
      judul: 'Menu baris Kelas Penumpang memakai "Edit Data", menu master lain "Ubah Data"',
      langkah: ['Buka menu Kelas Penumpang', `Klik ⋯ pada kelas ${ADA}`],
      ekspektasi: 'Label konsisten "Ubah Data"',
      aktual: `Menu: ${menu.join(', ')}`,
      cek: async () => expect(menu).toContain('Ubah Data'),
    });
  });

  test('[Temuan] KK-T03 kuota kelas NONAKTIF di kapal tidak terlihat di form Kapal tapi tetap dihitung di total [perlu konfirmasi]', async ({ page, request }) => {
    const v = await detailKapalAPI(request, KAPAL_REG);
    test.skip(!v, `Kapal ${KAPAL_REG} tidak ada`);
    const p = new KelasPage(page);
    await p.goto();
    await p.setLimit(50);
    const semua = await p.semuaBaris();
    const aktif = new Set(semua.filter((r) => r.Status === 'Aktif').map((r) => r.Nama.toUpperCase()));
    const tersembunyi = (v.class_quotas ?? []).filter((c: any) => !aktif.has(String(c.service_name).toUpperCase()));
    test.skip(tersembunyi.length === 0, `Kapal ${KAPAL_REG} tidak memakai kelas nonaktif`);
    const k = new KapalPage(page);
    await k.goto({ search: KAPAL_REG });
    await k.bukaUbah(KAPAL_REG);
    await k.lanjutKe('2/5');
    await k.lanjutKe('3/5');
    const total = (await k.form.getByRole('row', { name: /^Total / }).innerText()).replace(/\s+/g, ' ');
    const terlihat = await Promise.all(tersembunyi.map(async (c: any) => (await k.kuota(c.service_name).count()) > 0));
    await cekTemuan(page, {
      id: 'KK-T03',
      judul: 'Kuota kelas yang sudah Nonaktif tidak bisa dilihat/diubah di form Kapal, tapi tetap masuk total kapasitas',
      langkah: [`Kapal ${KAPAL_REG} menyimpan kuota kelas ${tersembunyi.map((c: any) => `${c.service_name} (${c.quota})`).join(', ')}`, 'Kelas itu Nonaktif di menu Kelas Penumpang', `Kapal → ${KAPAL_REG} → Ubah Data → langkah 3`],
      ekspektasi: 'Kuota kelas nonaktif ditampilkan (ditandai nonaktif) atau tidak dihitung lagi di total',
      aktual: `Baris kelas itu ${terlihat.some(Boolean) ? 'tampil' : 'tidak tampil'}; ${total}`,
      cek: async () => expect(terlihat.every(Boolean)).toBe(true),
      fokus: k.form.getByRole('row', { name: /^Total / }),
    });
    await k.batalForm('Close');
  });
});
