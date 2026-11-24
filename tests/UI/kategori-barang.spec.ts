import { test, expect } from '@playwright/test';
import { BarangPage, barangDiFormKapal } from './pages/barang.pages';
import { cekTemuan, DATA as KA, KeberangkatanListPage } from './pages/kapasitas.pages';
import { bacaTeksFile } from './pages/baca-file';
import { bukaWeb, FERIZY } from './pages/ferizy.pages';

/**
 * MASTER DATA — KATEGORI BARANG & HEWAN (/cargo-categories) — READ-ONLY
 * Form dibuka lalu DIBATALKAN; tidak ada data yang disimpan.
 * ID: KB-0x/1x (fungsi), KB-2x (dampak), KB-T0x (temuan)
 */

const ADA = process.env.KB_KODE ?? 'PK'; // kategori Aktif yang sudah ada (Paket kiriman)

/** Semua kategori (maks 50) dari tabel. */
async function semua(p: BarangPage) {
  await p.goto();
  await p.setLimit(50);
  return p.semuaBaris();
}

test.describe('Kategori Barang & Hewan — daftar', () => {
  test('[Positif] KB-01 halaman tampil: judul, toolbar, 7 kolom, ringkasan data', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    for (const b of [p.cari, p.btnFilter, p.btnTampilan, p.btnExport, p.btnTambah]) await expect(b).toBeVisible();
    expect(await p.header()).toEqual(['Kode', 'Nama Kategori', 'Tipe', 'Satuan', 'Curah', 'Go-show Saja', 'Status']);
    expect(await p.totalData()).toBeGreaterThan(0);
  });

  test('[Positif] KB-02 cari kode & nama (huruf kecil) → hasil sesuai', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.cariData(ADA);
    await expect(p.baris(ADA)).toHaveCount(1);
    await p.cariData('hewan');
    await expect.poll(() => p.totalData()).toBeGreaterThan(0);
    // pencarian mencakup nama & tipe
    const [nama, tipe] = [await p.nilaiKolom('Nama Kategori'), await p.nilaiKolom('Tipe')];
    nama.forEach((n, i) => expect(`${n} ${tipe[i]}`.toLowerCase()).toContain('hewan'));
  });

  test('[Negatif] KB-03 cari kata yang tidak ada → 0 data; [Edge] karakter khusus → tidak error', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.cariData('ZZZTIDAKADA');
    await expect.poll(() => p.totalData()).toBe(0);
    await p.cari.fill("%' <");
    await page.waitForTimeout(1_000);
    await p.tungguData();
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Positif] KB-04 filter Tipe "Hewan" → semua Hewan; "Barang" → semua Barang', async ({ page }) => {
    const p = new BarangPage(page);
    for (const t of ['Hewan', 'Barang']) {
      await p.goto();
      await p.btnFilter.click();
      await expect(p.popover).toBeVisible();
      await p.popover.getByRole('checkbox', { name: t, exact: true }).click();
      await page.keyboard.press('Escape');
      await p.tungguData();
      await expect.poll(async () => (await p.nilaiKolom('Tipe')).every((x) => x === t), { message: `filter ${t}`, timeout: 10_000 }).toBe(true);
      expect((await p.nilaiKolom('Tipe')).length).toBeGreaterThan(0);
    }
  });

  test('[Positif] KB-05 filter Status Aktif → semua Aktif', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.filterAktivasi('Aktif');
    await expect.poll(async () => (await p.nilaiKolom('Status')).every((s) => s === 'Aktif'), { timeout: 10_000 }).toBe(true);
  });

  test('[Positif] KB-06 sort Nama Kategori & Tipe: klik kedua membalik urutan', async ({ page }) => {
    const p = new BarangPage(page);
    for (const kolom of ['Nama Kategori', 'Tipe']) {
      await p.goto();
      await p.setLimit(50);
      const naik = await p.sortBy(kolom);
      const turun = await p.sortBy(kolom);
      expect([...new Set(turun)], `sort ${kolom}`).toEqual([...new Set(naik)].reverse());
    }
  });

  test('[Positif] KB-07 Export Ke Excel → file berisi kode & nama kategori', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto({ search: ADA });
    const dl = await p.exportExcel();
    const isi = bacaTeksFile((await dl.path())!);
    expect(isi).toContain('Paket kiriman');
  });

  test('[Positif] KB-08 menu ⋯: Ubah Data, Nonaktifkan, Hapus Data', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto({ search: ADA });
    expect(await p.daftarAksi(ADA)).toEqual(['Ubah Data', 'Nonaktifkan', 'Hapus Data']);
  });
});

test.describe('Kategori Barang & Hewan — form (tanpa menyimpan)', () => {
  test('[Negatif] KB-10 Simpan form kosong → "Nama wajib diisi"; [Positif] default Tipe Barang, Satuan Item, Aktif', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.bukaTambah();
    await expect(p.tipe('Barang')).toBeChecked();
    await expect(p.satuan).toContainText('Item');
    await expect(p.aktif).toHaveAttribute('aria-checked', 'true');
    await expect(p.curah).toHaveAttribute('aria-checked', 'false');
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesan()).toContain('Nama wajib diisi');
    await expect(p.form).toBeVisible();
    await p.batalForm('Batal');
  });

  test('[Positif] KB-11 pilihan Satuan berisi Item, Kg, Ekor', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.bukaTambah();
    const opsi = await p.opsiSatuan();
    for (const s of ['Item', 'Kg', 'Ekor']) expect(opsi, `satuan ${s}`).toContain(s);
    await p.batalForm('Batal');
  });

  test('[Edge] KB-12 aturan curah: Curah On → go-show otomatis On & terkunci; Curah Off → go-show bisa diubah lagi', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.bukaTambah();
    await expect(p.goShow).toHaveAttribute('aria-checked', 'false');
    await p.curah.click();
    await expect(p.curah).toHaveAttribute('aria-checked', 'true');
    await expect(p.goShow).toHaveAttribute('aria-checked', 'true');
    await expect(p.goShow).toBeDisabled();
    await p.curah.click();
    await expect(p.goShow).toBeEnabled();
    const sebelum = await p.goShow.getAttribute('aria-checked'); // saat curah dimatikan, go-show ikut kembali Off
    await p.goShow.click();
    await expect(p.goShow, 'go-show bisa diubah lagi').toHaveAttribute('aria-checked', sebelum === 'true' ? 'false' : 'true');
    await p.batalForm('Batal', 'Ya, Batalkan');
  });

  test('[Edge] KB-13 nama 120 karakter dengan karakter khusus → dibatasi atau ada pesan (tidak disimpan)', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.nama.fill(`QA <b>&'"` + 'N'.repeat(111));
    const panjang = (await p.nama.inputValue()).length;
    await p.btnForm('Simpan').click();
    // JANGAN simpan: kalau muncul konfirmasi → Batal
    if (await p.konfirmasi.isVisible().catch(() => false)) await p.konfirmasiKlik(/^(Batal|Kembali)$/);
    await page.waitForTimeout(800);
    const pesan = (await p.pesan()).join(' / ');
    test.info().annotations.push({ type: 'info', description: `panjang nama terisi ${panjang}, pesan: ${pesan || '-'}` });
    expect(panjang <= 100 || pesan.length > 0, `nama ${panjang} karakter diterima tanpa pesan`).toBe(true);
    if (await p.form.isVisible()) await p.batalForm('Batal', 'Ya, Batalkan');
  });

  test('[Positif] KB-14 Batal: form terisi → konfirmasi → Kembali → isian tetap', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ nama: 'QA AUTO X', tipe: 'Hewan' });
    expect(await p.batalForm('Batal', 'Kembali')).toBe(true);
    await expect(p.nama).toHaveValue('QA AUTO X');
    await expect(p.tipe('Hewan')).toBeChecked();
    expect(await p.batalForm('Batal', 'Ya, Batalkan')).toBe(true);
  });

  test('[Positif] KB-15 Ubah Data: isian sama dengan baris di tabel; tutup tanpa perubahan → tanpa konfirmasi', async ({ page }) => {
    const p = new BarangPage(page);
    await p.goto({ search: ADA });
    const r = (await p.semuaBaris()).find((x) => x.Kode === ADA)!;
    await p.bukaUbah(ADA);
    await expect(p.nama).toHaveValue(r['Nama Kategori']);
    await expect(p.tipe(r.Tipe as 'Barang' | 'Hewan')).toBeChecked();
    await expect(p.satuan).toContainText(r.Satuan);
    await expect(p.curah).toHaveAttribute('aria-checked', String(r.Curah === 'Ya'));
    await expect(p.goShow).toHaveAttribute('aria-checked', String(r['Go-show Saja'] === 'Ya'));
    expect(await p.batalForm('Batal')).toBe(false);
  });
});

test.describe('Kategori Barang & Hewan — dampak', () => {
  test('[Dampak] KB-20 form Kapal langkah 5 = kategori AKTIF di master (nama, tipe, satuan)', async ({ page }) => {
    const p = new BarangPage(page);
    const master = await semua(p);
    const aktif = master.filter((r) => r.Status === 'Aktif');
    const diKapal = await barangDiFormKapal(page);
    for (const r of aktif) {
      const k = diKapal.find((x) => x.nama === r['Nama Kategori']);
      expect(k, `kategori aktif "${r['Nama Kategori']}" ada di form kapal`).toBeTruthy();
      expect(k!.tipe, `tipe ${r['Nama Kategori']}`).toBe(r.Tipe);
      expect(k!.satuan, `satuan ${r['Nama Kategori']}`).toBe(r.Satuan);
    }
    for (const r of master.filter((x) => x.Status !== 'Aktif')) expect(diKapal.map((x) => x.nama), `nonaktif "${r['Nama Kategori']}"`).not.toContain(r['Nama Kategori']);
  });

  test('[Dampak] KB-21 sub-tab "Barang & Hewan" di Keberangkatan: kategori ada di master & Aktif; go-show tidak dijual online', async ({ page }) => {
    const p = new BarangPage(page);
    const master = await semua(p);
    const list = new KeberangkatanListPage(page);
    await list.gotoTanggal(KA.tanggalUji);
    const d = await list.bukaDetail(KA.jadwalA);
    await d.bukaTab('Alokasi');
    await d.bukaSubTab('Barang & Hewan');
    const daftar = await d.daftarKategoriBarang();
    test.skip(daftar.length === 0, 'Keberangkatan uji tanpa kategori barang');
    const masalah: string[] = [];
    const rinci: string[] = [];
    for (const nama of daftar) {
      const m = master.find((r) => r['Nama Kategori'] === nama);
      const b = await d.barang(nama);
      rinci.push(`${nama}: channel "${b.channel}"`);
      if (!m) { masalah.push(`"${nama}" tidak ada di master`); continue; }
      if (m.Status !== 'Aktif') masalah.push(`"${nama}" Nonaktif di master`);
      if (m.Tipe !== b.tipe || m.Satuan !== b.satuan) masalah.push(`"${nama}": tipe/satuan ${b.tipe}/${b.satuan} ≠ master ${m.Tipe}/${m.Satuan}`);
      if (m['Go-show Saja'] === 'Ya' && /online|semua/i.test(b.channel) && !/loket|go-?show/i.test(b.channel)) masalah.push(`"${nama}" go-show saja tapi channel "${b.channel}"`);
    }
    await cekTemuan(page, {
      id: 'KB-T04',
      judul: 'Kategori barang & hewan di keberangkatan tidak sesuai master (status/tipe/satuan/channel)',
      langkah: [`Keberangkatan & Alokasi → ${KA.tanggalUji} → ${KA.jadwalA} → tab Alokasi → Barang & Hewan`, 'Bandingkan dengan menu Kategori Barang & Hewan'],
      ekspektasi: 'Semua kategori ada di master & Aktif, tipe/satuan sama, kategori go-show saja hanya dijual di loket',
      aktual: `${masalah.join('; ')} (${rinci.join(', ')})`,
      cek: async () => expect(masalah).toEqual([]),
    });
  });

  test('[Dampak] KB-22 web Ferizy: kategori barang yang boleh dijual online seharusnya bisa dipesan (Barang Lepas) — FRC-01-05', async ({ page, browser }) => {
    const p = new BarangPage(page);
    const online = (await semua(p)).filter((r) => r.Status === 'Aktif' && r['Go-show Saja'] !== 'Ya').map((r) => r['Nama Kategori']);
    const { ctx, web } = await bukaWeb(browser);
    try {
      await web.goto(FERIZY + '/');
      const grup = web.getByRole('group', { name: 'Jenis pengguna jasa' });
      await expect(grup).toBeVisible({ timeout: 30_000 });
      const pilihan = (await grup.getByRole('radio').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.closest('label')?.textContent ?? ''))).map((x) => x.trim());
      const teks = await grup.innerText();
      const adaBarang = /barang|hewan/i.test(teks);
      await cekTemuan(web, {
        id: 'KB-T05',
        judul: 'Kategori barang & hewan yang dijual online belum bisa dipesan di web (tidak ada pilihan Barang Lepas)',
        langkah: ['CMS → Kategori Barang & Hewan: kategori Aktif dan bukan go-show saja', 'Web Ferizy → beranda → "Jenis pengguna jasa"'],
        ekspektasi: `Ada pilihan untuk memesan barang/hewan (${online.slice(0, 5).join(', ')}…)`,
        aktual: `Pilihan jenis pengguna jasa: ${teks.replace(/\s+/g, ' ').trim()}${pilihan.length ? '' : ''}`,
        cek: async () => expect(online.length === 0 || adaBarang).toBe(true),
        fokus: grup,
      });
    } finally {
      await ctx.close();
    }
  });
});

/* --------------------------------- TEMUAN --------------------------------- */
test.describe('Kategori Barang & Hewan — temuan', () => {
  test('[Temuan] KB-T01 konsistensi data: nama "curah" seharusnya Curah = Ya; Curah = Ya seharusnya Go-show = Ya', async ({ page }) => {
    const p = new BarangPage(page);
    const master = await semua(p);
    const salah: string[] = [];
    for (const r of master) {
      if (/curah/i.test(r['Nama Kategori']) && r.Curah !== 'Ya') salah.push(`${r.Kode} "${r['Nama Kategori']}" Curah = ${r.Curah}`);
      if (r.Curah === 'Ya' && r['Go-show Saja'] !== 'Ya') salah.push(`${r.Kode} "${r['Nama Kategori']}" Curah Ya tapi Go-show ${r['Go-show Saja']}`);
    }
    await cekTemuan(page, {
      id: 'KB-T01',
      judul: 'Data kategori barang tidak konsisten dengan aturan curah',
      langkah: ['Buka menu Kategori Barang & Hewan (Limit 50)', 'Lihat kolom Nama, Curah, Go-show Saja'],
      ekspektasi: 'Kategori bernama "curah" berstatus Curah = Ya; setiap Curah = Ya juga Go-show = Ya',
      aktual: salah.join('; '),
      cek: async () => expect(salah).toEqual([]),
      fokus: p.tabel,
    });
  });

  test('[Temuan] KB-T02 kategori Hewan seharusnya bersatuan Ekor, dan nama kategori wajar [perlu konfirmasi]', async ({ page }) => {
    const p = new BarangPage(page);
    const aktif = (await semua(p)).filter((r) => r.Status === 'Aktif');
    const aneh: string[] = [];
    for (const r of aktif) {
      if (r.Tipe === 'Hewan' && r.Satuan !== 'Ekor') aneh.push(`${r.Kode} "${r['Nama Kategori']}": Hewan dengan satuan ${r.Satuan}`);
      if (r.Tipe === 'Barang' && r.Satuan === 'Ekor') aneh.push(`${r.Kode} "${r['Nama Kategori']}": Barang dengan satuan Ekor`);
      if (/^(box|super admin|test|tes+)$/i.test(r['Nama Kategori'])) aneh.push(`${r.Kode} "${r['Nama Kategori']}" (${r.Tipe}) — nama tidak wajar, tampil di form Kapal & keberangkatan`);
    }
    await cekTemuan(page, {
      id: 'KB-T02',
      judul: 'Ada kategori barang & hewan Aktif dengan data tidak wajar (kemungkinan data uji yang belum dibersihkan)',
      langkah: ['Buka menu Kategori Barang & Hewan (Limit 50)', 'Lihat kategori Aktif: nama, tipe, satuan'],
      ekspektasi: 'Kategori Aktif hanya data asli; tipe Hewan bersatuan Ekor',
      aktual: aneh.join('; '),
      cek: async () => expect(aneh).toEqual([]),
      fokus: p.tabel,
    });
  });
});
