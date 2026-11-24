import { test, expect } from '@playwright/test';
import { CabangPage } from './pages/cabang.pages';
import { PerusahaanPage } from './pages/perusahaan.pages';
import { PelabuhanPage } from './pages/master-data.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import { bacaTeksFile } from './pages/baca-file';
import { bukaWeb, teksPelabuhanWeb } from './pages/ferizy.pages';

/**
 * MASTER DATA — CABANG (/branches) — UI, READ-ONLY
 * Form dibuka lalu DIBATALKAN; tidak ada data yang disimpan.
 * Validasi server Cabang sudah diuji lewat API di tests/branch-*.spec.ts — file ini fokus ke layar & dampak.
 * ID: CB-0x/1x (fungsi), CB-2x (dampak), CB-T0x (temuan)
 */

const ADA = process.env.CB_KODE ?? 'TESS65'; // cabang Aktif yang sudah ada

async function semua(p: CabangPage) {
  await p.goto();
  await p.setLimit(50);
  return p.semuaBaris();
}

test.describe('Cabang — daftar', () => {
  test('[Positif] CB-01 halaman tampil: judul, toolbar, 7 kolom, ringkasan data', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    for (const b of [p.cari, p.btnFilter, p.btnTampilan, p.btnExport, p.btnTambah]) await expect(b).toBeVisible();
    expect(await p.header()).toEqual(['Kode', 'Nama Cabang', 'Perusahaan', 'Telepon', 'Email', 'Pelabuhan', 'Status']);
    expect(await p.totalData()).toBeGreaterThan(0);
  });

  test('[Positif] CB-02 cari kode → cabang itu; cari kata yang tidak ada → 0; [Edge] karakter khusus → tidak error', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    await p.cariData(ADA);
    await expect(p.baris(ADA)).toHaveCount(1);
    await p.cariData('ZZZTIDAKADA');
    await expect.poll(() => p.totalData()).toBe(0);
    await p.cari.fill("%' <");
    await page.waitForTimeout(1_000);
    await p.tungguData();
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Positif] CB-03 filter Perusahaan (pakai kolom cari di filter) → semua baris milik perusahaan itu', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    const target = (await p.nilaiKolom('Perusahaan'))[0];
    await p.btnFilter.click();
    await expect(p.popover).toBeVisible();
    await p.popover.getByRole('textbox', { name: 'Cari Perusahaan' }).fill(target.replace(/^PT\.? /, '').slice(0, 8));
    await p.popover.getByRole('checkbox', { name: target, exact: true }).click();
    await page.keyboard.press('Escape');
    await p.tungguData();
    await expect.poll(async () => (await p.nilaiKolom('Perusahaan')).every((x) => x === target), { timeout: 10_000 }).toBe(true);
  });

  test('[Positif] CB-04 filter Status Aktif → semua Aktif; Nonaktif → semua Nonaktif', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    await p.filterAktivasi('Aktif');
    await expect.poll(async () => (await p.nilaiKolom('Status')).every((s) => s === 'Aktif'), { timeout: 10_000 }).toBe(true);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    await expect.poll(async () => (await p.nilaiKolom('Status')).every((s) => s === 'Nonaktif'), { timeout: 10_000 }).toBe(true);
  });

  test('[Positif] CB-05 sort Kode & Nama Cabang: klik kedua membalik urutan', async ({ page }) => {
    const p = new CabangPage(page);
    for (const kolom of ['Kode', 'Nama Cabang']) {
      await p.goto();
      await p.setLimit(50);
      const naik = await p.sortBy(kolom);
      const turun = await p.sortBy(kolom);
      expect([...new Set(turun)], `sort ${kolom}`).toEqual([...new Set(naik)].reverse());
    }
  });

  test('[Positif] CB-06 lebih dari 10 cabang → Berikutnya menampilkan sisanya', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    const total = await p.totalData();
    test.skip(total <= 10, `Hanya ${total} cabang`);
    await p.btnBerikutnya.click();
    await expect(p.ringkasan).toHaveText(new RegExp(`Menampilkan 11-${Math.min(20, total)} dari ${total} data`));
  });

  test('[Positif] CB-07 Export Ke Excel → file berisi kode cabang', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto({ search: ADA });
    const dl = await p.exportExcel();
    expect(bacaTeksFile((await dl.path())!)).toContain(ADA);
  });

  test('[Positif] CB-08 menu ⋯: Ubah Data, Nonaktifkan, Hapus Data', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto({ search: ADA });
    expect(await p.daftarAksi(ADA)).toEqual(['Ubah Data', 'Nonaktifkan', 'Hapus Data']);
  });
});

test.describe('Cabang — form (tanpa menyimpan)', () => {
  test('[Negatif] CB-10 Simpan form kosong → "Kode cabang wajib diisi"; isi Kode lalu Simpan → Perusahaan & Pelabuhan wajib (validasi bertahap)', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    await p.bukaTambah();
    await expect(p.aktif).toHaveAttribute('aria-checked', 'true');
    await p.btnForm('Simpan').click();
    await expect.poll(() => p.pesan()).toContain('Kode cabang wajib diisi');
    await p.isi({ kode: 'QAX' });
    const pesan = await p.cobaSimpan();
    expect(pesan.join(' / ')).toMatch(/Perusahaan wajib/);
    expect(pesan.join(' / ')).toMatch(/pelabuhan/i);
    const namaWajib = pesan.some((x) => /nama/i.test(x));
    await cekTemuan(page, {
      id: 'CB-T01',
      judul: 'Nama cabang tidak wajib diisi (cabang bisa dibuat tanpa nama)',
      langkah: ['Buka menu Cabang → Tambah', 'Isi hanya Kode "QAX"', 'Klik Simpan (lalu Batal)'],
      ekspektasi: 'Muncul pesan "Nama cabang wajib diisi" bersama pesan Perusahaan & Pelabuhan',
      aktual: `Pesan: ${pesan.join(' / ')}`,
      cek: async () => expect(namaWajib).toBe(true),
      fokus: p.nama,
    });
    await p.batalForm('Batal', 'Ya, Batalkan');
  });

  test('[Negatif] CB-11 email tidak valid ("abc@") → ditolak', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'QAX', nama: 'QA X', email: 'abc@' });
    const pesan = (await p.cobaSimpan()).join(' / ');
    await cekTemuan(page, {
      id: 'CB-T05',
      judul: 'Email cabang yang tidak valid tidak ditolak di form',
      langkah: ['Cabang → Tambah', 'Isi kode & nama, Email "abc@"', 'Klik Simpan (lalu Batal)'],
      ekspektasi: 'Muncul pesan format email tidak valid',
      aktual: pesan || '(tidak ada pesan)',
      cek: async () => expect(pesan).toMatch(/email/i),
      fokus: p.email,
    });
    await p.batalForm('Batal', 'Ya, Batalkan');
  });

  test('[Negatif] CB-12 telepon berisi huruf ("08abc") → tidak bisa diketik atau ditolak', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'QAX', nama: 'QA X', telepon: '08abc' });
    const nilai = await p.telepon.inputValue();
    const pesan = /[a-z]/i.test(nilai) ? (await p.cobaSimpan()).join(' / ') : '';
    await cekTemuan(page, {
      id: 'CB-T02',
      judul: 'Telepon cabang menerima huruf (di daftar ada "safgasfdgsdfg", "abcxyz")',
      langkah: ['Cabang → Tambah', 'Isi kode & nama, Telepon "08abc"', 'Klik Simpan (lalu Batal)'],
      ekspektasi: 'Huruf tidak bisa diketik, atau muncul pesan format telepon',
      aktual: `Telepon terisi "${nilai}"; pesan: ${pesan || '(tidak ada)'}`,
      cek: async () => expect(!/[a-z]/i.test(nilai) || /telepon/i.test(pesan)).toBe(true),
      fokus: p.telepon,
    });
    await p.batalForm('Batal', 'Ya, Batalkan');
  });

  test('[Edge] CB-13 kode 30 karakter huruf kecil/simbol & nama 150 karakter → dibatasi atau ditolak', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'qa kode-!@#' + 'X'.repeat(19), nama: 'N'.repeat(150) });
    const [kode, nama] = [await p.kode.inputValue(), await p.nama.inputValue()];
    const pesan = (await p.cobaSimpan()).join(' / ');
    test.info().annotations.push({ type: 'info', description: `kode "${kode}" (${kode.length}), nama ${nama.length}; pesan: ${pesan || '-'}` });
    expect(pesan.length > 0 || (kode.length <= 20 && nama.length <= 100), 'kode/nama kepanjangan diterima tanpa pesan').toBe(true);
    await p.batalForm('Batal', 'Ya, Batalkan');
  });

  test('[Positif] CB-14 Batal: form terisi → konfirmasi → Kembali → isian tetap', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'QAX', nama: 'QA AUTO X' });
    expect(await p.batalForm('Batal', 'Kembali')).toBe(true);
    await expect(p.kode).toHaveValue('QAX');
    expect(await p.batalForm('Batal', 'Ya, Batalkan')).toBe(true);
  });

  test('[Positif] CB-15 Ubah Data: isian (nama, perusahaan, pelabuhan) sama dengan baris di tabel; tanpa perubahan → tanpa konfirmasi', async ({ page }) => {
    const p = new CabangPage(page);
    const r = (await p.barisKode(ADA))!;
    await p.bukaUbah(ADA);
    await expect(p.kode).toHaveValue(ADA);
    await expect(p.nama).toHaveValue(r['Nama Cabang']);
    await expect(p.perusahaan).toContainText(r.Perusahaan);
    for (const pel of r.Pelabuhan.split(',').map((x) => x.trim()).filter(Boolean)) await expect(p.form, `pelabuhan ${pel}`).toContainText(pel);
    expect(await p.batalForm('Batal')).toBe(false);
  });
});

test.describe('Cabang — dampak', () => {
  test('[Dampak] CB-20 pilihan "Perusahaan" di form Cabang = perusahaan Aktif', async ({ page }) => {
    const pr = new PerusahaanPage(page);
    await pr.goto();
    await pr.setLimit(50);
    const daftar = await pr.semuaBaris();
    const p = new CabangPage(page);
    await p.goto();
    await p.bukaTambah();
    const opsi = await p.opsi(p.perusahaan);
    await p.batalForm('Batal');
    for (const r of daftar.filter((x) => x.Status === 'Aktif')) expect(opsi, `aktif "${r['Nama Perusahaan']}"`).toContain(r['Nama Perusahaan']);
    for (const r of daftar.filter((x) => x.Status !== 'Aktif')) expect(opsi, `nonaktif "${r['Nama Perusahaan']}"`).not.toContain(r['Nama Perusahaan']);
  });

  test('[Dampak] CB-21 pilihan "Pelabuhan yang dikelola" hanya pelabuhan Aktif', async ({ page }) => {
    const pl = new PelabuhanPage(page);
    await pl.goto();
    await pl.filterAktivasi('Nonaktif');
    const nonaktif = (await pl.nilaiKolom('Nama Pelabuhan')).slice(0, 10);
    test.skip(nonaktif.length === 0, 'Tidak ada pelabuhan nonaktif');
    const p = new CabangPage(page);
    await p.goto();
    await p.bukaTambah();
    const muncul: string[] = [];
    for (const n of nonaktif) if ((await p.opsi(p.pelabuhan, n)).includes(n)) muncul.push(n);
    await p.batalForm('Batal');
    expect(muncul, 'pelabuhan nonaktif ditawarkan').toEqual([]);
  });

  test('[Temuan] CB-T03 nama CABANG seharusnya tidak tampil sebagai "Pelabuhan" di web Ferizy', async ({ page, browser, request }) => {
    const p = new CabangPage(page);
    const cabang = (await semua(p)).map((r) => r['Nama Cabang']);
    // nama pelabuhan asli (lewat API, semua halaman) — nama cabang yang kebetulan sama dengan pelabuhan tidak dihitung
    const pelabuhan = new Set<string>();
    for (const c of cabang) {
      const j: any = await (await request.fetch(`/api/proxy/cms/outlets?page=1&limit=50&search=${encodeURIComponent(c)}`, { headers: { Accept: 'application/json' } })).json().catch(() => null);
      // pelabuhan ASLI punya zona waktu; baris "pelabuhan" hasil cabang tidak punya kota/zona (lihat CB-T09)
      for (const o of j?.result?.content?.[0]?.rows ?? []) if (o.timezone) pelabuhan.add(String(o.name).toLowerCase());
    }
    const { ctx, web } = await bukaWeb(browser);
    try {
      const teks = await teksPelabuhanWeb(web);
      // hanya nama cabang yang BUKAN nama pelabuhan (supaya tidak salah tuduh)
      const tampil = cabang.filter((c) => !pelabuhan.has(c.toLowerCase()) && teks.includes(`pelabuhan ${c.toLowerCase()}`));
      await cekTemuan(web, {
        id: 'CB-T03',
        judul: 'Nama cabang tampil sebagai "Pelabuhan" di halaman Pelabuhan web Ferizy',
        langkah: ['CMS → Cabang: lihat nama cabang (mis. "QA Cabang Test 01", "hyuk")', 'Web Ferizy → menu "Pelabuhan" (/outlets)'],
        ekspektasi: 'Halaman Pelabuhan web hanya menampilkan pelabuhan, bukan cabang',
        aktual: `Tampil sebagai pelabuhan: ${tampil.map((t) => `"Pelabuhan ${t}"`).join(', ')}`,
        cek: async () => expect(tampil).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });

  test('[Temuan] CB-T09 cabang seharusnya TIDAK ikut masuk master Pelabuhan (CMS → Pelabuhan)', async ({ page, request }) => {
    const p = new CabangPage(page);
    const cabang = await semua(p);
    const masuk: string[] = [];
    for (const c of cabang) {
      const j: any = await (await request.fetch(`/api/proxy/cms/outlets?page=1&limit=20&search=${encodeURIComponent(c.Kode)}`, { headers: { Accept: 'application/json' } })).json().catch(() => null);
      const o = (j?.result?.content?.[0]?.rows ?? []).find((x: any) => x.code === c.Kode && String(x.name).toLowerCase() === c['Nama Cabang'].toLowerCase());
      if (o) masuk.push(`${c.Kode} "${c['Nama Cabang']}" (kota "${String(o.city).trim()}", zona ${o.timezone ?? '-'})`);
    }
    const pl = new PelabuhanPage(page);
    if (masuk.length) await pl.goto({ search: cabang.find((c) => masuk[0].startsWith(c.Kode))!.Kode });
    await cekTemuan(page, {
      id: 'CB-T09',
      judul: 'Setiap cabang ikut tersimpan sebagai data di master Pelabuhan (tanpa kota & zona waktu) — lalu tampil sebagai pelabuhan di web',
      langkah: ['CMS → Cabang: catat kode & nama cabang', 'CMS → Pelabuhan: cari kode cabang itu'],
      ekspektasi: 'Cabang hanya ada di menu Cabang; master Pelabuhan hanya berisi pelabuhan',
      aktual: `Ada di master Pelabuhan: ${masuk.join('; ')}`,
      cek: async () => expect(masuk).toEqual([]),
      fokus: pl.tabel,
    });
  });

  test('[Temuan] CB-T04 nama cabang berisi tag HTML seharusnya ditolak/dibersihkan [perlu konfirmasi]', async ({ page }) => {
    const p = new CabangPage(page);
    const html = (await semua(p)).filter((r) => /<[a-z/][^>]*>/i.test(r['Nama Cabang']));
    test.skip(html.length === 0, 'Tidak ada nama cabang ber-tag HTML');
    await cekTemuan(page, {
      id: 'CB-T04',
      judul: 'Nama cabang berisi tag HTML tersimpan apa adanya',
      langkah: ['Buka menu Cabang (Limit 50)', 'Lihat kolom Nama Cabang'],
      ekspektasi: 'Tag HTML ditolak saat simpan (atau dibersihkan)',
      aktual: html.map((r) => `${r.Kode}: "${r['Nama Cabang']}"`).join('; '),
      cek: async () => expect(html).toEqual([]),
      fokus: p.tabel,
    });
  });
});
