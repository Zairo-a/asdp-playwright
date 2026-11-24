import { test, expect, type Page } from '@playwright/test';
import { DATA, KeberangkatanListPage, DetailKeberangkatanPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — Alokasi KORPORASI (READ-ONLY: semua perubahan di-"Buang Perubahan")
 * Halaman: detail keberangkatan → tab Alokasi → baris "Korporasi" (sub-tab Penumpang & Kendaraan)
 * Aturan di layar: "Mitra/Korporasi habis → ambil sisa Retail; Retail habis → ditolak."
 * ID: KK-0x, KK-T0x
 */

const G = process.env.KV_GOL_KECIL ?? 'I';

async function bukaAlokasi(page: Page): Promise<DetailKeberangkatanPage> {
  const list = new KeberangkatanListPage(page);
  await list.gotoTanggal(DATA.tanggalUji);
  const d = await list.bukaDetail(DATA.jadwalA);
  await d.bukaTab('Alokasi');
  return d;
}

const LANGKAH = [
  'Buka menu Keberangkatan & Alokasi',
  `Pilih rute ${DATA.rute}, tanggal ${DATA.tanggalUji}`,
  `Klik jadwal ${DATA.jadwalA} → tab Alokasi`,
];

test.describe('Keberangkatan — Alokasi Korporasi (read-only)', () => {
  test('[Positif] KK-01 baris Korporasi (Penumpang) punya input untuk setiap kelas & sumber awal "Jadwal"', async ({ page }) => {
    const d = await bukaAlokasi(page);
    const kelas = await d.namaKelas();
    expect(kelas.length).toBeGreaterThan(0);
    for (const k of new Set(kelas)) await expect(d.inputKorporasi(k)).toBeVisible();
    expect(await d.sumber('Korporasi')).toContain('Jadwal');
  });

  test('[Positif] KK-02 aturan kelompok channel tampil di layar', async ({ page }) => {
    const d = await bukaAlokasi(page);
    await expect(d.main).toContainText('Mitra/Korporasi habis → ambil sisa Retail');
    await expect(d.main).toContainText('Retail habis → ditolak');
  });

  test('[Negatif] KK-03 input Korporasi (Penumpang): negatif & huruf tidak menghasilkan nilai negatif/teks', async ({ page }) => {
    const d = await bukaAlokasi(page);
    const inp = d.inputKorporasi(DATA.kelas);
    await inp.click();
    await inp.press('Control+A');
    await inp.pressSequentially('-3');
    await inp.press('Tab');
    expect(Number(await inp.inputValue())).toBeGreaterThanOrEqual(0);

    await inp.click();
    await inp.press('Control+A');
    await inp.pressSequentially('abc');
    await inp.press('Tab');
    await expect(inp).toHaveValue(/^\d*$/);
    if (await d.btnBuang.isEnabled()) await d.btnBuang.click();
  });

  test('[Positif] KK-04 Kendaraan: isi Korporasi 1 → Retail golongan langsung berkurang 1 (preview)', async ({ page }) => {
    const d = await bukaAlokasi(page);
    await d.bukaSubTab('Kendaraan');
    const retail = await d.nilaiChannelKendaraan('Retail', G);
    test.skip(retail < 1, `Retail golongan ${G} kosong`);
    await d.isiKorporasiGol(G, '1');
    await expect.poll(() => d.nilaiChannelKendaraan('Retail', G)).toBe(retail - 1);
    await d.btnBuang.click();
    await expect(d.inputKorporasiGol(G)).toHaveValue('0');
  });

  test('[Positif] KK-05 Buang Perubahan mengembalikan Korporasi (Penumpang)', async ({ page }) => {
    const d = await bukaAlokasi(page);
    const awal = await d.inputKorporasi(DATA.kelas).inputValue();
    await d.isiKorporasi(DATA.kelas, String(Number(awal) + 2));
    await expect(d.btnSimpan).toBeEnabled();
    await d.btnBuang.click();
    await expect(d.inputKorporasi(DATA.kelas)).toHaveValue(awal);
    await expect(d.btnSimpan).toBeDisabled();
  });

  test('[Temuan] KK-T01 preview Korporasi valid (Penumpang) seharusnya mengurangi Retail sebelum disimpan', async ({ page }) => {
    const d = await bukaAlokasi(page);
    const kuota = await d.kuotaKelas(DATA.kelas);
    const retail = await d.nilai('Retail', DATA.kelas);
    await d.isiKorporasi(DATA.kelas, '3');
    await cekTemuan(page, {
      id: 'KK-T01',
      judul: 'Preview alokasi salah saat Korporasi diisi nilai yang valid',
      langkah: [...LANGKAH, `Isi Korporasi kelas ${DATA.kelas} = 3 (kuota kelas ${kuota}), belum klik Simpan`],
      ekspektasi: `Retail ${DATA.kelas} otomatis jadi ${retail - 3}, total kelas tetap ${kuota}, status "Sesuai kuota"`,
      aktual: async () =>
        `Retail ${DATA.kelas} tetap ${await d.nilai('Retail', DATA.kelas)}, total kelas jadi ${await d.nilai('Total', DATA.kelas)} dari kuota ${kuota} (⚠), status "Tidak sesuai kuota"`,
      cek: () => expect(d.tabelAlokasi).toContainText('Sesuai kuota', { timeout: 3_000 }),
      fokus: d.tabelAlokasi,
    });
    await d.btnBuang.click();
  });
});