import { test, expect } from '@playwright/test';
import { KapalPage, PESAN_KAPAL, detailKapalAPI, tglPanjang, kartuFerizy, tglDepan } from './pages/kapal.pages';
import { GolonganPage, KapalFormGolongan } from './pages/golongan.pages';
import { cekTemuan, angkaID } from './pages/kapasitas.pages';
import { bacaTeksFile } from './pages/baca-file';

/**
 * MASTER DATA — KAPAL (/vessels) — READ-ONLY
 * Form dibuka lalu DIBATALKAN; tidak ada data yang disimpan.
 * ID: KP-0x/1x/2x (fungsi), KP-T0x (temuan)
 * Kategori: [Positif] [Negatif] [Edge] [Dampak] [Temuan]
 */

const ADA = process.env.KP_KODE ?? 'QAWTAXI01'; // kapal QA yang sudah ada (dibuka saja)
const LANGKAH_TAMBAH = ['Buka menu Kapal', 'Klik "Tambah"'];
const VALID1 = { kode: 'QAXRO', nama: 'QA AUTO RO', jenis: 'Water Taxi', grt: '100', perusahaan: 'PT. Dharma Lautan Utama', pelabuhan: 'LEMBAR' };
const VALID2 = { abk: '5', pelampung: '100', noSkkp: 'QA-SKKP', maksSkkp: '80', skkpSampai: '2030-12-31' };
const VALID3 = { kuota: { EKONOMI: '50' } }; // total kuota harus > 0 supaya bisa lanjut ke langkah 4

test.describe('Kapal — daftar', () => {
  test('[Positif] KP-01 halaman tampil: judul, toolbar, 11 kolom tabel, ringkasan data', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    for (const b of [p.cari, p.btnFilter, p.btnTampilan, p.btnExport, p.btnTambah]) await expect(b).toBeVisible();
    expect(await p.header()).toEqual(['Kode', 'Nama Kapal', 'Jenis Kapal', 'GRT', 'IMO', 'ABK', 'Pelampung', 'Kap. Penumpang', 'Kap. SUP', 'SKKP s.d.', 'Status']);
    expect(await p.totalData()).toBeGreaterThan(0);
    await expect(p.btnHapusMassal).toBeDisabled();
  });

  test('[Positif] KP-02 cari berdasarkan kode → hanya kapal itu', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.cariData(ADA);
    await expect.poll(() => p.totalData()).toBe(1);
    await expect(p.baris(ADA)).toHaveCount(1);
  });

  test('[Positif] KP-03 cari berdasarkan nama (huruf kecil) → semua hasil mengandung kata itu', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.cariData('taxi');
    await expect.poll(() => p.totalData()).toBeGreaterThan(0);
    // pencarian mencakup kode, nama, dan jenis kapal
    const [kode, nama, jenis] = [await p.nilaiKolom('Kode'), await p.nilaiKolom('Nama Kapal'), await p.nilaiKolom('Jenis Kapal')];
    kode.forEach((k, i) => expect(`${k} ${nama[i]} ${jenis[i]}`.toLowerCase(), `baris ${k}`).toContain('taxi'));
  });

  test('[Negatif] KP-04 cari kata yang tidak ada → 0 data', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.cariData('ZZZTIDAKADA');
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Edge] KP-05 cari dengan karakter khusus (%\' <) → tidak error, 0 data', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.cari.fill("%' <");
    await page.waitForTimeout(1_000);
    await p.tungguData();
    await expect.poll(() => p.totalData()).toBe(0);
  });

  test('[Positif] KP-06 filter Status "Nonaktif" → semua baris Nonaktif; "Aktif" → semua Aktif', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.filterAktivasi('Aktif');
    await expect.poll(async () => (await p.nilaiKolom('Status')).every((s) => s === 'Aktif')).toBe(true);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    const status = await p.nilaiKolom('Status');
    test.skip(status.length === 0, 'Tidak ada kapal nonaktif');
    for (const s of status) expect(s).toBe('Nonaktif');
  });

  test('[Positif] KP-07 sort GRT naik lalu turun', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    const naik = (await p.sortBy('GRT')).map(angkaID);
    expect(naik).toEqual([...naik].sort((a, b) => a - b));
    const turun = (await p.sortBy('GRT')).map(angkaID);
    expect(turun).toEqual([...turun].sort((a, b) => b - a));
  });

  test('[Positif] KP-08 sort Kode & Nama Kapal: klik kedua membalik urutan', async ({ page }) => {
    const p = new KapalPage(page);
    for (const kolom of ['Kode', 'Nama Kapal']) {
      await p.goto();
      await p.setLimit(100);
      const naik = await p.sortBy(kolom);
      const turun = await p.sortBy(kolom);
      expect(turun, `sort ${kolom}`).toEqual([...naik].reverse());
    }
  });

  test('[Positif] KP-09 limit 10 → pindah halaman Berikutnya menampilkan 11-20', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    const total = await p.totalData();
    test.skip(total <= 10, `Hanya ${total} kapal`);
    await p.btnBerikutnya.click();
    await expect(p.ringkasan).toHaveText(new RegExp(`Menampilkan 11-${Math.min(20, total)} dari ${total} data`));
    await p.btnSebelumnya.click();
    await expect(p.ringkasan).toHaveText(new RegExp(`Menampilkan 1-10 dari ${total} data`));
  });

  test('[Positif] KP-10 Tampilan: sembunyikan kolom IMO → hilang; tampilkan lagi → muncul', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.toggleKolom('IMO');
    await expect.poll(() => p.header()).not.toContain('IMO');
    await p.toggleKolom('IMO');
    await expect.poll(() => p.header()).toContain('IMO');
  });

  test('[Positif] KP-11 Export Ke Excel (hasil cari) → file berisi kode & nama kapal', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto({ search: ADA });
    const dl = await p.exportExcel();
    const isi = bacaTeksFile((await dl.path())!);
    expect(isi).toContain(ADA);
  });

  test('[Positif] KP-12 menu ⋯: kapal Aktif → Ubah Data, Nonaktifkan, Hapus Data; kapal Nonaktif → Aktifkan', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto({ search: ADA });
    expect(await p.daftarAksi(ADA)).toEqual(['Ubah Data', 'Nonaktifkan', 'Hapus Data']);
    await p.goto();
    await p.filterAktivasi('Nonaktif');
    const kodeNon = (await p.nilaiKolom('Kode'))[0];
    test.skip(!kodeNon, 'Tidak ada kapal nonaktif');
    expect(await p.daftarAksi(kodeNon)).toContain('Aktifkan');
  });

  test('[Negatif] KP-13 Hapus massal → Batal → data tetap ada', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto({ search: ADA });
    await p.baris(ADA).getByRole('checkbox').check();
    await expect(p.btnHapusMassal).toHaveText('Hapus (1)');
    await p.btnHapusMassal.click();
    await expect(p.konfirmasi).toBeVisible();
    await p.konfirmasiKlik(/^(Batal|Kembali)$/);
    await expect(p.baris(ADA)).toBeVisible();
  });

  test('[Positif] KP-14 isi tabel sama dengan data kapal (API): nama, ABK, pelampung, Kap. SUP, SKKP', async ({ page, request }) => {
    const v = await detailKapalAPI(request, ADA);
    const p = new KapalPage(page);
    await p.goto({ search: ADA });
    expect(await p.sel(ADA, 'Nama Kapal')).toBe(v.vessel_name);
    expect(angkaID(await p.sel(ADA, 'ABK'))).toBe(v.crew_count);
    expect(angkaID(await p.sel(ADA, 'Pelampung'))).toBe(v.lifejacket_count);
    expect(angkaID(await p.sel(ADA, 'Kap. SUP'))).toBe(Number(v.vehicle_capacity_sup));
    const [y, m, d] = v.skkp_expired_at.split('-').map(Number);
    expect(await p.sel(ADA, 'SKKP s.d.')).toContain(`${d} `);
    expect(await p.sel(ADA, 'SKKP s.d.')).toContain(String(y));
    void m;
  });
});

test.describe('Kapal — form Tambah (tanpa menyimpan)', () => {
  test('[Negatif] KP-15 langkah 1 kosong → Berikutnya → 6 pesan "Wajib diisi", tetap di 1/5', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.lanjut();
    await expect.poll(async () => (await p.pesan()).filter((x) => x === PESAN_KAPAL.wajib).length).toBe(6);
    await expect(p.langkah()).toHaveText('1/5');
    for (const f of [p.kode, p.nama, p.jenis, p.grt, p.perusahaan, p.pelabuhan]) await expect(f).toHaveAttribute('aria-invalid', 'true');
    await expect(p.imo, 'IMO opsional').not.toHaveAttribute('aria-invalid', 'true');
    await p.batalForm('Close');
  });

  test('[Negatif] KP-16 GRT -5 / 0 / huruf → "Harus berupa angka lebih dari 0"', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    for (const v of ['-5', '0', 'abc']) {
      await p.grt.fill(v);
      await p.lanjut();
      const nilai = await p.grt.inputValue();
      if (nilai === '') continue; // huruf ditolak langsung oleh input → tidak bisa diketik (juga benar)
      await expect.poll(() => p.pesan(), `GRT "${v}"`).toContain(PESAN_KAPAL.angkaPositif);
    }
    await p.batalForm('Close');
  });

  test('[Negatif] KP-17 IMO 6 digit / berisi huruf → "Nomor IMO harus 7 digit"; [Edge] 8 digit dipotong jadi 7; 7 digit → pesan hilang', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.imo.fill('12345678');
    expect((await p.imo.inputValue()).length, 'IMO maks 7 karakter').toBeLessThanOrEqual(7);
    for (const v of ['123456', '12ab567']) {
      await p.imo.fill(v);
      await p.lanjut();
      await expect.poll(() => p.pesan(), `IMO "${v}" (terisi "${await p.imo.inputValue()}")`).toContain(PESAN_KAPAL.imo);
    }
    await p.imo.fill('1234567');
    await p.lanjut();
    await expect.poll(() => p.pesan()).not.toContain(PESAN_KAPAL.imo);
    await p.batalForm('Close');
  });

  test('[Edge] KP-18 kode 25 karakter → dibatasi maks 20', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.kode.fill('QA' + 'X'.repeat(23));
    expect((await p.kode.inputValue()).length).toBeLessThanOrEqual(20);
    await p.batalForm('Close');
  });

  test('[Positif] KP-19 combobox berisi data master: Jenis kapal, Perusahaan, Pelabuhan pangkalan', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    expect((await p.opsiCombobox(p.jenis)).join('|')).toMatch(/Water Taxi/);
    expect((await p.opsiCombobox(p.perusahaan)).join('|')).toMatch(/Dharma Lautan Utama/);
    expect(await p.opsiCombobox(p.pelabuhan, 'LEMBAR')).toContain('LEMBAR');
    await p.batalForm('Close');
  });

  test('[Negatif] KP-20 langkah 2 kosong → 5 pesan "Wajib diisi" (ABK, pelampung, No/maks/tanggal SKKP)', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.lanjut();
    await expect.poll(async () => (await p.pesan()).filter((x) => x === PESAN_KAPAL.wajib).length).toBe(5);
    await expect(p.langkah()).toHaveText('2/5');
    await p.batalForm('Close');
  });

  test('[Negatif] KP-21 ABK / pelampung / maks SKKP negatif atau huruf → ditolak, tetap di 2/5', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2({ ...VALID2, abk: '-1', pelampung: 'abc', maksSkkp: '-10' });
    await p.lanjut();
    await expect(p.langkah()).toHaveText('2/5');
    expect((await p.pesan()).length, `pesan: ${(await p.pesan()).join(' / ')}`).toBeGreaterThanOrEqual(2);
    await p.batalForm('Close');
  });

  test('[Positif] KP-22 Kembali antar langkah → isian langkah 1 & 2 tidak hilang', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2({ abk: '7', pelampung: '90' });
    await p.btnForm('Kembali').click();
    await expect(p.langkah()).toHaveText('1/5');
    await expect(p.kode).toHaveValue(VALID1.kode);
    await expect(p.nama).toHaveValue(VALID1.nama);
    await expect(p.jenis).toContainText(VALID1.jenis);
    await p.lanjutKe('2/5');
    await expect(p.abk).toHaveValue('7');
    await expect(p.pelampung).toHaveValue('90');
    await p.batalForm('Close');
  });

  test('[Positif] KP-23 Batal: form kosong langsung tertutup; form terisi → konfirmasi → Kembali → isian tetap', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    expect(await p.batalForm('Batal'), 'form kosong tidak perlu konfirmasi').toBe(false);
    await p.bukaTambah();
    await p.isiLangkah1({ kode: 'QAX', nama: 'QA AUTO X' });
    expect(await p.batalForm('Batal', 'Kembali')).toBe(true);
    await expect(p.kode).toHaveValue('QAX');
    expect(await p.batalForm('Close', 'Ya, Batalkan')).toBe(true);
  });

  test('[Edge] KP-24 langkah 3: kuota melebihi pelampung & maks SKKP → muncul peringatan batas keselamatan', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2(VALID2);
    await p.lanjutKe('3/5');
    const kelas = (await p.form.getByRole('textbox', { name: /^Kuota / }).first().getAttribute('aria-label'))?.replace(/^Kuota /, '') ?? '';
    await p.kuota(kelas).fill('50');
    await expect(p.form).toContainText('Di bawah batas keselamatan');
    await p.kuota(kelas).fill('500'); // > pelampung 100 & SKKP 80
    await expect(p.form).not.toContainText('Di bawah batas keselamatan');
    await expect(p.statusKeselamatan).toBeVisible();
    await p.batalForm('Close');
  });

  test('[Negatif] KP-25 langkah 4: Total SUP kosong → wajib diisi; maks unit golongan negatif → ditolak', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2(VALID2);
    await p.lanjutKe('3/5');
    await p.isiLangkah3(VALID3);
    await p.lanjutKe('4/5');
    await p.totalSup.fill('');
    await p.lanjut();
    await expect(p.langkah()).toHaveText('4/5');
    await expect.poll(async () => (await p.pesan()).length, 'ada pesan di Total SUP').toBeGreaterThan(0);
    await p.totalSup.fill('10');
    await p.semuaInputGolongan.first().fill('-2');
    const nilai = await p.semuaInputGolongan.first().inputValue();
    if (nilai.includes('-')) {
      await p.lanjut(); // minus tetap terketik → harus ditolak
      await expect(p.langkah(), `maks unit "${nilai}" seharusnya ditolak`).toHaveText('4/5');
    } else {
      expect(nilai, 'tanda minus dibuang oleh input').not.toContain('-');
    }
    await p.batalForm('Close');
  });

  test('[Edge] KP-26 langkah 4: "Setara SUP" = maks unit × SUP golongan, total ikut berubah', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2(VALID2);
    await p.lanjutKe('3/5');
    await p.isiLangkah3(VALID3);
    await p.lanjutKe('4/5');
    const baris = p.form.locator('tbody tr').filter({ has: page.getByRole('textbox', { name: KapalFormGolongan.labelGolongan('Mobil Penumpang') }) });
    const sup = angkaID(await baris.locator('td').nth(1).innerText());
    await p.golongan('Mobil Penumpang').fill('3');
    await expect.poll(async () => angkaID(await baris.locator('td').nth(3).innerText())).toBeCloseTo(3 * sup, 2);
    await p.batalForm('Close');
  });

  test('[Negatif] KP-27 langkah 5: maks barang/hewan negatif → ditolak; [Edge] 0 → diterima', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2(VALID2);
    await p.lanjutKe('3/5');
    await p.isiLangkah3(VALID3);
    await p.lanjutKe('4/5');
    await p.totalSup.fill('10');
    await p.lanjutKe('5/5');
    const input = p.form.getByRole('textbox', { name: /^Maks kapal \(opsional\)/ }).first();
    // TIDAK menekan Simpan (form tambah langsung menyimpan setelah konfirmasi)
    await input.fill('-3');
    await input.blur();
    const nilai = await input.inputValue();
    const negatifDitolak = !nilai.includes('-') || (await p.pesan()).length > 0;
    expect(negatifDitolak, `nilai "${nilai}" diterima tanpa pesan`).toBe(true);
    await input.fill('0');
    await input.blur();
    await expect.poll(() => p.pesan()).toEqual([]);
    await p.batalForm('Close');
  });

  test('[Negatif] KP-28 langkah 3 mode Seat tanpa memilih layout kursi → tidak bisa lanjut', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2(VALID2);
    await p.lanjutKe('3/5');
    await p.btnSeat.click();
    await expect(p.btnSeat).toHaveAttribute('aria-pressed', 'true');
    await p.lanjut();
    await expect(p.langkah()).toHaveText('3/5');
    await p.batalForm('Close');
  });

  test('[Negatif] KP-31 langkah 3 semua kuota kosong (total 0) → tidak bisa lanjut ke langkah 4; [Edge] kuota 1 → bisa', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2(VALID2);
    await p.lanjutKe('3/5');
    await p.lanjut();
    await page.waitForTimeout(800);
    await expect(p.langkah()).toHaveText('3/5');
    await p.isiLangkah3({ kuota: { EKONOMI: '1' } });
    await p.lanjutKe('4/5');
    await p.batalForm('Close');
  });
});

test.describe('Kapal — form Ubah (tanpa menyimpan)', () => {
  test('[Positif] KP-29 Ubah Data: isian 5 langkah sama dengan data kapal (API); tutup tanpa perubahan → tanpa konfirmasi', async ({ page, request }) => {
    const v = await detailKapalAPI(request, ADA);
    const p = new KapalPage(page);
    await p.goto({ search: ADA });
    await p.bukaUbah(ADA);
    await expect(p.kode).toHaveValue(v.vehicle_code);
    await expect(p.nama).toHaveValue(v.vessel_name);
    await expect(p.jenis).toContainText(v.vessel_type_name);
    expect(angkaID(await p.grt.inputValue())).toBe(Number(v.grt));
    await expect(p.perusahaan).toContainText(v.company_name);
    await p.lanjutKe('2/5');
    await expect(p.abk).toHaveValue(String(v.crew_count));
    await expect(p.pelampung).toHaveValue(String(v.lifejacket_count));
    await expect(p.noSkkp).toHaveValue(v.skkp_number);
    await expect(p.maksSkkp).toHaveValue(String(v.skkp_max_persons));
    await expect(p.tglSkkp).toContainText(tglPanjang(v.skkp_expired_at));
    await p.lanjutKe('3/5');
    const totalKuota = (v.class_quotas ?? []).reduce((s: number, c: any) => s + Number(c.quota), 0);
    await expect(p.form.getByRole('row', { name: /^Total / })).toContainText(String(totalKuota));
    await p.lanjutKe('4/5');
    expect(angkaID(await p.totalSup.inputValue())).toBe(Number(v.vehicle_capacity_sup));
    for (const g of v.vehicle_classes ?? []) await expect(p.golongan(g.name), `maks unit ${g.code}`).toHaveValue(String(g.qty));
    expect(await p.batalForm('Close')).toBe(false);
  });

  test('[Dampak] KP-30 langkah 4 hanya menampilkan golongan AKTIF dari master Golongan Kendaraan', async ({ page }) => {
    const g = new GolonganPage(page);
    await g.goto();
    await g.setLimit(50);
    const nama = await g.nilaiKolom('Nama');
    const status = await g.nilaiKolom('Status');
    const aktif = nama.filter((_, i) => status[i] === 'Aktif');
    const nonaktif = nama.filter((_, i) => status[i] !== 'Aktif');
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2(VALID2);
    await p.lanjutKe('3/5');
    await p.isiLangkah3(VALID3);
    await p.lanjutKe('4/5');
    for (const n of aktif) await expect(p.golongan(n), `golongan aktif "${n}"`).toHaveCount(1);
    for (const n of nonaktif) await expect(p.golongan(n), `golongan nonaktif "${n}"`).toHaveCount(0);
    await p.batalForm('Close');
  });
});

/* --------------------------------- TEMUAN --------------------------------- */
test.describe('Kapal — temuan', () => {
  test('[Temuan] KP-T01 filter "Jenis Kapal" seharusnya berisi daftar jenis kapal', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.btnFilter.click();
    await expect(p.popover).toBeVisible();
    const grup = p.popover.getByRole('group', { name: 'Jenis Kapal' });
    await page.waitForTimeout(1_000);
    const jumlah = await grup.getByRole('checkbox').count();
    await cekTemuan(page, {
      id: 'KP-T01',
      judul: 'Filter "Jenis Kapal" kosong ("Tidak ditemukan") padahal jenis kapal ada',
      langkah: ['Buka menu Kapal', 'Klik "Filter"', 'Lihat bagian "Jenis Kapal"'],
      ekspektasi: 'Muncul pilihan jenis kapal (Fast Ferry, Water Taxi, PCTC, RoPax, dll.) seperti di form Tambah Kapal',
      aktual: async () => `Isi bagian Jenis Kapal: "${(await grup.innerText()).replace(/\s+/g, ' ').trim()}"`,
      cek: async () => expect(jumlah).toBeGreaterThan(0),
      fokus: grup,
    });
    await page.keyboard.press('Escape');
  });

  test('[Temuan] KP-T02 kode kapal huruf kecil/spasi/simbol seharusnya ditolak (atau dijadikan kapital) [perlu konfirmasi]', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1({ ...VALID1, kode: 'qa kode-!@#' });
    const nilai = await p.kode.inputValue();
    await p.lanjut();
    await page.waitForTimeout(800);
    const langkah = (await p.langkah().innerText()).trim();
    const pesan = (await p.pesan()).join(' / ');
    if (langkah !== '1/5') await p.btnForm('Kembali').click();
    await cekTemuan(page, {
      id: 'KP-T02',
      judul: 'Kode kapal menerima huruf kecil, spasi, dan simbol tanpa validasi',
      langkah: [...LANGKAH_TAMBAH, 'Isi Kode kapal "qa kode-!@#" dan field wajib lainnya', 'Klik Berikutnya'],
      ekspektasi: 'Kode hanya huruf besar/angka/tanda hubung (seperti contoh "KMP-CB01"); input lain ditolak dengan pesan, atau otomatis kapital',
      aktual: `Kode terisi "${nilai}", form lanjut ke langkah ${langkah}${pesan ? `, pesan: ${pesan}` : ' tanpa pesan'}`,
      cek: async () => expect(nilai === nilai.toUpperCase() && !/[ !@#]/.test(nilai) || langkah === '1/5').toBe(true),
      fokus: p.kode,
    });
    await p.batalForm('Close');
  });

  test('[Temuan] KP-T03 tahun pembuatan di masa depan / tidak wajar seharusnya ditolak', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    const hasil: string[] = [];
    for (const t of ['3000', '12']) {
      await p.isiLangkah1({ ...(hasil.length ? {} : VALID1), tahun: t });
      await p.lanjut();
      await page.waitForTimeout(800);
      const langkah = (await p.langkah().innerText()).trim();
      hasil.push(`"${t}" → ${langkah === '1/5' ? 'ditolak: ' + (await p.pesan()).join(' / ') : 'diterima (lanjut ke ' + langkah + ')'}`);
      if (langkah !== '1/5') await p.btnForm('Kembali').click();
      await expect(p.langkah()).toHaveText('1/5');
    }
    await cekTemuan(page, {
      id: 'KP-T03',
      judul: 'Tahun pembuatan kapal menerima tahun di masa depan (3000) / 2 digit',
      langkah: [...LANGKAH_TAMBAH, 'Isi field wajib, Tahun pembuatan "3000"', 'Klik Berikutnya', 'Ulangi dengan "12"'],
      ekspektasi: 'Tahun di luar rentang wajar (mis. > tahun ini atau bukan 4 digit) ditolak dengan pesan',
      aktual: hasil.join('; '),
      cek: async () => expect(hasil.every((h) => h.includes('ditolak'))).toBe(true),
      fokus: p.tahun,
    });
    await p.batalForm('Close');
  });

  test('[Temuan] KP-T04 kapal dengan SKKP kedaluwarsa seharusnya ditandai di daftar', async ({ page, request }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.setLimit(100);
    const kode = await p.nilaiKolom('Kode');
    let kedaluwarsa = '';
    for (const k of kode) {
      const v = await detailKapalAPI(request, k);
      if (v?.skkp_expired) { kedaluwarsa = k; break; }
    }
    test.skip(!kedaluwarsa, 'Tidak ada kapal dengan SKKP kedaluwarsa');
    const i = await p.idxKolom('SKKP s.d.');
    const sel = p.baris(kedaluwarsa).locator(`td:nth-child(${i + 1})`);
    const teks = (await sel.innerText()).trim();
    const html = await sel.innerHTML();
    const ditandai = /kedaluwarsa|expired|habis/i.test(teks) || /text-(red|destructive)|bg-(red|destructive)|badge/i.test(html);
    await cekTemuan(page, {
      id: 'KP-T04',
      judul: 'SKKP yang sudah lewat masa berlakunya tidak ditandai di daftar kapal',
      langkah: ['Buka menu Kapal (Limit 100)', `Lihat kolom "SKKP s.d." kapal ${kedaluwarsa}`],
      ekspektasi: 'Kapal dengan SKKP kedaluwarsa diberi tanda (warna merah/label "Kedaluwarsa") agar tidak dioperasikan',
      aktual: `Kolom SKKP s.d. kapal ${kedaluwarsa}: "${teks}" tanpa tanda kedaluwarsa`,
      cek: async () => expect(ditandai).toBe(true),
      fokus: sel,
    });
  });

  test('[Temuan] KP-T05 masa berlaku SKKP tanggal lampau seharusnya ditolak/diberi peringatan [perlu konfirmasi]', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isiLangkah1(VALID1);
    await p.lanjutKe('2/5');
    await p.isiLangkah2({ ...VALID2, skkpSampai: '2025-01-15' });
    await p.lanjut();
    await page.waitForTimeout(800);
    const langkah = (await p.langkah().innerText()).trim();
    const pesan = (await p.pesan()).join(' / ');
    if (langkah !== '2/5') await p.btnForm('Kembali').click();
    await cekTemuan(page, {
      id: 'KP-T05',
      judul: 'Masa berlaku SKKP yang sudah lewat diterima tanpa peringatan',
      langkah: [...LANGKAH_TAMBAH, 'Isi langkah 1', 'Langkah 2: isi semua, Masa berlaku SKKP = 15 Januari 2025', 'Klik Berikutnya'],
      ekspektasi: 'Muncul peringatan/penolakan bahwa SKKP sudah kedaluwarsa',
      aktual: `Form lanjut ke langkah ${langkah}${pesan ? `, pesan: ${pesan}` : ' tanpa pesan apa pun'}`,
      cek: async () => expect(langkah === '2/5' || /kedaluwarsa|lewat|berlaku/i.test(pesan)).toBe(true),
      fokus: p.tglSkkp,
    });
    await p.batalForm('Close');
  });

  test('[Temuan] KP-T06 kode kapal di form Ubah seharusnya terkunci [perlu konfirmasi]', async ({ page }) => {
    const p = new KapalPage(page);
    await p.goto({ search: ADA });
    await p.bukaUbah(ADA);
    const bisa = await p.kode.isEditable();
    await cekTemuan(page, {
      id: 'KP-T06',
      judul: 'Kode kapal (kunci data, dipakai jadwal & keberangkatan) masih bisa diubah di form Ubah',
      langkah: ['Buka menu Kapal', `Kapal ${ADA} → ⋯ → Ubah Data`, 'Klik field Kode kapal'],
      ekspektasi: 'Kode kapal terkunci (read-only) seperti kode di master Golongan',
      aktual: bisa ? 'Field Kode kapal bisa diketik' : 'Terkunci',
      cek: async () => expect(bisa).toBe(false),
      fokus: p.kode,
    });
    await p.batalForm('Close');
  });
});

test.describe('Kapal — dampak ke web Ferizy (hanya membaca)', () => {
  test('[Dampak] KP-32 web Ferizy LMB→PGA: nama & jenis kapal di kartu jadwal = data master Kapal di CMS', async ({ browser, request }) => {
    const tgl = process.env.KP_TGL_WEB ?? tglDepan(11);
    const kapalQA = ['QAFERRY01', 'QAROPAXEXP01', 'QABUSAIR01', 'QAWTAXI01'];
    const ctx = await browser.newContext({ storageState: undefined }); // pengunjung web (tanpa sesi CMS)
    const web = await ctx.newPage();
    try {
      const kartu = await kartuFerizy(web, '49', '67', tgl);
      test.skip(kartu.length === 0, `Tidak ada jadwal di web untuk ${tgl}`);
      const salah: string[] = [];
      for (const kode of kapalQA) {
        const v = await detailKapalAPI(request, kode);
        if (!v) continue;
        const k = kartu.find((x) => x.includes(v.vessel_name));
        if (!k) salah.push(`${v.vessel_name} (${kode}) tidak tampil`);
        else if (!k.includes(v.vessel_type_name)) salah.push(`${v.vessel_name}: jenis di web bukan "${v.vessel_type_name}"`);
      }
      await cekTemuan(web, {
        id: 'KP-T07',
        judul: 'Nama/jenis kapal di web Ferizy tidak sesuai master Kapal di CMS',
        langkah: [`Web Ferizy → cari Lembar → Padang Bai tanggal ${tgl}`, `Bandingkan nama & jenis kapal tiap kartu dengan menu Kapal di CMS (${kapalQA.join(', ')})`],
        ekspektasi: 'Setiap kapal default jadwal tampil dengan nama & jenis kapal yang sama seperti di CMS',
        aktual: salah.join('; '),
        cek: async () => expect(salah).toEqual([]),
      });
    } finally {
      await ctx.close();
    }
  });
});
