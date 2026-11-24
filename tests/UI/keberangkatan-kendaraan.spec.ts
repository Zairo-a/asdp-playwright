import { test, expect } from '@playwright/test';
import { DATA, KeberangkatanListPage, DetailKeberangkatanPage, cekTemuan, samaSUP } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — Alokasi KENDARAAN (SUP) (READ-ONLY: semua perubahan di-"Buang Perubahan")
 * Halaman: detail keberangkatan → tab Alokasi → sub-tab "Kendaraan"
 *  Tabel 1: Kuota per golongan (unit, Tipe Normal/Reserve/Restrict, Setara SUP, Jika habis)
 *  Tabel 2: Alokasi kelompok channel × golongan (Retail otomatis, Mitra/Korporasi diisi, unit)
 * ID: KV-0x (fungsi), KV-T0x (temuan)
 */

const G_KECIL = process.env.KV_GOL_KECIL ?? 'I'; // golongan untuk uji Mitra
const G_BESAR = process.env.KV_GOL_BESAR ?? 'IX'; // golongan untuk uji tipe & kelebihan kuota

async function bukaKendaraan(page: import('@playwright/test').Page): Promise<DetailKeberangkatanPage> {
  const list = new KeberangkatanListPage(page);
  await list.gotoTanggal(DATA.tanggalUji);
  const d = await list.bukaDetail(DATA.jadwalA);
  await d.bukaTab('Alokasi');
  await d.bukaSubTab('Kendaraan');
  return d;
}

const LANGKAH = [
  'Buka menu Keberangkatan & Alokasi',
  `Pilih rute ${DATA.rute}, tanggal ${DATA.tanggalUji}`,
  `Klik jadwal ${DATA.jadwalA} → tab Alokasi → sub-tab Kendaraan`,
];

test.describe('Keberangkatan — Alokasi Kendaraan (read-only)', () => {
  test('[Positif] KV-01 Setara SUP = kuota unit × SUP/unit untuk setiap golongan', async ({ page }) => {
    const d = await bukaKendaraan(page);
    for (const g of await d.daftarGolongan()) {
      const x = await d.golongan(g);
      expect(samaSUP(x.setaraSUP, x.unit * x.supPerUnit), `golongan ${g}: ${x.unit} × ${x.supPerUnit} = ${x.setaraSUP}`).toBe(true);
    }
  });

  test('[Positif] KV-02 ringkasan Normal + Reserve + Restrict = jumlah Setara SUP semua golongan', async ({ page }) => {
    const d = await bukaKendaraan(page);
    let jumlah = 0;
    for (const g of await d.daftarGolongan()) jumlah += (await d.golongan(g)).setaraSUP;
    const r = await d.ringkasanSUP();
    expect(samaSUP(r.normal + r.reserve + r.restrict, r.total)).toBe(true);
    expect(samaSUP(r.total, jumlah), `ringkasan ${r.total} vs jumlah ${jumlah}`).toBe(true);
    expect(samaSUP(await d.totalSUPChannel('Total'), r.total), 'Total SUP tabel channel = ringkasan').toBe(true);
  });

  test('[Positif] KV-03 Retail = kuota golongan − Mitra − Korporasi; Total kolom = kuota golongan', async ({ page }) => {
    const d = await bukaKendaraan(page);
    for (const g of await d.daftarGolongan()) {
      const kuota = (await d.golongan(g)).unit;
      const retail = await d.nilaiChannelKendaraan('Retail', g);
      const mitra = await d.nilaiChannelKendaraan('Mitra', g);
      const korp = await d.nilaiChannelKendaraan('Korporasi', g);
      expect(retail, `golongan ${g}`).toBe(Math.max(0, kuota - mitra - korp));
      expect(await d.nilaiChannelKendaraan('Total', g), `total golongan ${g}`).toBe(kuota);
    }
  });

  test('[Positif] KV-04 preview: isi Mitra 1 → Retail golongan langsung berkurang 1 (belum disimpan)', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const retail = await d.nilaiChannelKendaraan('Retail', G_KECIL);
    test.skip(retail < 1, `Retail golongan ${G_KECIL} kosong`);
    await d.isiMitraGol(G_KECIL, '1');
    await expect.poll(() => d.nilaiChannelKendaraan('Retail', G_KECIL)).toBe(retail - 1);
    await expect(d.btnSimpan).toBeEnabled();
    await d.btnBuang.click();
    await expect(d.inputMitraGol(G_KECIL)).toHaveValue('0');
  });

  test('[Negatif] KV-05 input Mitra: negatif → 0, desimal → bilangan bulat, huruf ditolak', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const inp = d.inputMitraGol(G_KECIL);

    await inp.click();
    await inp.press('Control+A');
    await inp.pressSequentially('-2');
    await inp.press('Tab');
    await expect(inp).toHaveValue('0');

    await inp.click();
    await inp.press('Control+A');
    await inp.pressSequentially('1,5');
    await inp.press('Tab');
    await expect(inp).toHaveValue(/^\d+$/);

    const sebelum = await inp.inputValue();
    await inp.click();
    await inp.press('Control+A');
    await inp.pressSequentially('abc');
    await inp.press('Tab');
    await expect(inp).toHaveValue(/^\d+$/);
    expect(await inp.inputValue()).toBe(sebelum);

    if (await d.btnBuang.isEnabled()) await d.btnBuang.click();
  });

  test('[Positif] KV-06 ubah Tipe ke Reserve/Restrict → ringkasan SUP berpindah kategori (belum disimpan)', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const awal = await d.ringkasanSUP();
    const sup = (await d.golongan(G_BESAR)).setaraSUP;
    test.skip((await d.tipeGol(G_BESAR).inputValue()) !== 'normal', `Golongan ${G_BESAR} bukan Normal`);

    await d.tipeGol(G_BESAR).selectOption('reserve');
    await expect.poll(async () => (await d.ringkasanSUP()).reserve).toBeCloseTo(awal.reserve + sup, 2);
    expect((await d.ringkasanSUP()).normal).toBeCloseTo(awal.normal - sup, 2);

    await d.tipeGol(G_BESAR).selectOption('restrict');
    await expect.poll(async () => (await d.ringkasanSUP()).restrict).toBeCloseTo(awal.restrict + sup, 2);
    expect((await d.ringkasanSUP()).total).toBeCloseTo(awal.total, 2); // total tetap

    await d.btnBuang.click();
    await expect(d.tipeGol(G_BESAR)).toHaveValue('normal');
  });

  test('[Positif] KV-07 Buang Perubahan mengembalikan kuota golongan & ringkasan', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const unit = await d.inputKuotaGol(G_BESAR).inputValue();
    const r = await d.ringkasanSUP();
    await d.isiKuotaGol(G_BESAR, String(Number(unit) + 1));
    await expect.poll(async () => (await d.ringkasanSUP()).total).not.toBeCloseTo(r.total, 2);
    await d.btnBuang.click();
    await expect(d.inputKuotaGol(G_BESAR)).toHaveValue(unit);
    expect((await d.ringkasanSUP()).total).toBeCloseTo(r.total, 2);
  });

  /* --------------------------------- TEMUAN --------------------------------- */

  test('[Temuan] KV-T01 kuota golongan melebihi kuota operasional SUP → seharusnya Simpan terkunci', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const kuotaOp = await d.kuotaOperasionalSUP();
    const x = await d.golongan(G_BESAR);
    const unitBaru = x.unit + Math.ceil(kuotaOp / x.supPerUnit); // pasti melebihi
    await d.isiKuotaGol(G_BESAR, String(unitBaru));
    const r = await d.ringkasanSUP();
    await cekTemuan(page, {
      id: 'KV-T01',
      judul: 'Tombol Simpan tetap aktif walau alokasi kendaraan melebihi kuota operasional SUP',
      langkah: [...LANGKAH, `Isi Kuota golongan ${G_BESAR} = ${unitBaru} unit`],
      ekspektasi: `Tombol Simpan terkunci / ada pesan, karena total ${r.total.toFixed(2)} SUP > kuota operasional ${kuotaOp.toFixed(2)} SUP`,
      aktual: `Total jadi ${r.total.toFixed(2)} SUP (tanda ⚠), tombol Simpan tetap aktif; baru ditolak server ("FCAP-ALLOCATION-EXCEEDS-QUOTA") setelah diklik`,
      cek: () => expect(d.btnSimpan).toBeDisabled({ timeout: 3_000 }),
      fokus: d.btnSimpan,
    });
    await d.btnBuang.click();
  });

  test('[Temuan] KV-T02 tipe Restrict: kolom "Jika habis" seharusnya langsung "Tolak" sebelum disimpan', async ({ page }) => {
    const d = await bukaKendaraan(page);
    await d.tipeGol(G_BESAR).selectOption('restrict');
    const jikaHabis = (await d.golongan(G_BESAR)).jikaHabis;
    await cekTemuan(page, {
      id: 'KV-T02',
      judul: 'Kolom "Jika habis" tidak ikut berubah saat Tipe diganti (sebelum Simpan)',
      langkah: [...LANGKAH, `Ubah Tipe golongan ${G_BESAR} menjadi Restrict (belum klik Simpan)`],
      ekspektasi: 'Kolom "Jika habis" langsung menampilkan "Tolak (tidak ambil Normal)" sesuai keterangan "Restrict … habis → ditolak"',
      aktual: `Kolom "Jika habis" masih "${jikaHabis}" (baru berubah setelah disimpan)`,
      cek: async () => expect(jikaHabis).toMatch(/Tolak/i),
      fokus: d.tipeGol(G_BESAR).locator('xpath=ancestor::tr'),
    });
    await d.btnBuang.click();
  });

  test('[Temuan] KV-T03 total alokasi SUP seharusnya = kuota operasional kendaraan [perlu konfirmasi]', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const kuotaOp = await d.kuotaOperasionalSUP();
    const r = await d.ringkasanSUP();
    await cekTemuan(page, {
      id: 'KV-T03',
      judul: 'Total alokasi kendaraan lebih kecil dari kuota operasional SUP',
      langkah: [...LANGKAH, 'Bandingkan baris ringkasan "Normal + Reserve + Restrict" dengan "Kuota operasional … SUP"'],
      ekspektasi: `Total alokasi = kuota operasional (${kuotaOp.toFixed(2)} SUP), atau sisa SUP ditampilkan/dijelaskan`,
      aktual: `Total alokasi ${r.total.toFixed(2)} SUP, kuota operasional ${kuotaOp.toFixed(2)} SUP → ${(kuotaOp - r.total).toFixed(2)} SUP tidak teralokasi ke golongan mana pun`,
      cek: async () => expect(samaSUP(r.total, kuotaOp)).toBe(true),
      fokus: d.main.getByText(/Kuota operasional\s+[\d.,]+\s*SUP/).first(),
    });
  });

  test('[Temuan] KV-T04 keterangan "golongan disatukan (VA/VB …)" seharusnya sesuai isi tabel [perlu konfirmasi]', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const gol = await d.daftarGolongan();
    const pasangan = [['IVA', 'IVB'], ['VA', 'VB'], ['VIA', 'VIB']].filter(([a, b]) => gol.includes(a) && gol.includes(b));
    await cekTemuan(page, {
      id: 'KV-T04',
      judul: 'Keterangan menyebut golongan disatukan, tapi tabel menampilkannya terpisah',
      langkah: [...LANGKAH, 'Baca keterangan "Golongan disatukan per angka romawi … (IVA/IVB, VA/VB, VIA/VIB)"', 'Lihat daftar golongan di tabel'],
      ekspektasi: 'Pasangan golongan dengan SUP sama tampil sebagai satu baris (mis. "VA/VB")',
      aktual: `Tabel berisi ${gol.join(', ')}; pasangan yang tampil terpisah: ${pasangan.map((p) => p.join(' & ')).join(', ') || '-'}`,
      cek: async () => expect(pasangan).toEqual([]),
      fokus: d.tabelGolongan,
    });
  });
});