import { test, expect, type Page } from '@playwright/test';
import { DATA, KeberangkatanListPage, DetailKeberangkatanPage, samaSUP } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — Alokasi KENDARAAN (MENGUBAH DATA → butuh ALLOW_WRITE=1)
 * Setiap test dipulihkan dengan tombol "Kembalikan semua ke jadwal"
 * (menghapus semua override alokasi keberangkatan uji: penumpang, kendaraan, barang).
 * ID: KV-1x
 */

test.describe.configure({ mode: 'serial' });

const G_KECIL = process.env.KV_GOL_KECIL ?? 'I';
const G_BESAR = process.env.KV_GOL_BESAR ?? 'IX';

async function bukaKendaraan(page: Page): Promise<DetailKeberangkatanPage> {
  const list = new KeberangkatanListPage(page);
  await list.gotoTanggal(DATA.tanggalUji);
  const d = await list.bukaDetail(DATA.jadwalA);
  await d.bukaTab('Alokasi');
  await d.bukaSubTab('Kendaraan');
  return d;
}
async function pulihkan(d: DetailKeberangkatanPage) {
  await d.page.reload();
  await d.tungguTermuat();
  await d.bukaTab('Alokasi');
  await d.pulihkanSemuaSubTab();
  await d.bukaSubTab('Kendaraan');
}

test.describe('Keberangkatan — Alokasi Kendaraan (ubah data + restore)', () => {
  test.beforeEach(async ({ page }) => {
    // Prasyarat: keberangkatan uji mengikuti alokasi jadwal (tanpa override)
    const d = await bukaKendaraan(page);
    await d.pulihkanSemuaSubTab();
  });

  test('[Positif] KV-10 simpan Mitra 1 → Retail berkurang, label "override", bertahan setelah reload; Kembalikan semua → pulih', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const retail = await d.nilaiChannelKendaraan('Retail', G_KECIL);
    test.skip(retail < 1, `Retail golongan ${G_KECIL} kosong`);
    try {
      await d.isiMitraGol(G_KECIL, '1');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect(d.labelOverride).toBeVisible();
      await expect(d.btnKembalikanSemua).toBeVisible();

      await d.page.reload();
      await d.tungguTermuat();
      await d.bukaTab('Alokasi');
      await d.bukaSubTab('Kendaraan');
      await expect(d.inputMitraGol(G_KECIL)).toHaveValue('1');
      expect(await d.nilaiChannelKendaraan('Retail', G_KECIL)).toBe(retail - 1);
    } finally {
      await pulihkan(d);
    }
    await expect(d.inputMitraGol(G_KECIL)).toHaveValue('0');
    expect(await d.nilaiChannelKendaraan('Retail', G_KECIL)).toBe(retail);
    await expect(d.labelJadwal).toBeVisible();
  });

  test('[Edge] KV-11 Mitra = tepat kuota golongan (batas) → tersimpan, Retail golongan jadi 0', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const kuota = (await d.golongan(G_KECIL)).unit;
    try {
      await d.isiMitraGol(G_KECIL, String(kuota));
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect.poll(() => d.nilaiChannelKendaraan('Retail', G_KECIL)).toBe(0);
      expect(await d.nilaiChannelKendaraan('Total', G_KECIL)).toBe(kuota);
    } finally {
      await pulihkan(d);
    }
  });

  test('[Negatif] KV-12 Mitra melebihi kuota golongan → tidak boleh tersimpan melebihi', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const kuota = (await d.golongan(G_KECIL)).unit;
    try {
      await d.isiMitraGol(G_KECIL, String(kuota + 2));
      await d.simpanAlokasi();
      await expect(d.toast.filter({ hasText: /Gagal|berhasil/ }).first()).toBeVisible();
      await d.page.reload();
      await d.tungguTermuat();
      await d.bukaTab('Alokasi');
      await d.bukaSubTab('Kendaraan');
      const tersimpan = Number(await d.inputMitraGol(G_KECIL).inputValue());
      expect(tersimpan, `Mitra golongan ${G_KECIL} tersimpan ${tersimpan} padahal kuota ${kuota}`).toBeLessThanOrEqual(kuota);
    } finally {
      await pulihkan(d);
    }
  });

  test('[Negatif] KV-13 kuota golongan melebihi kuota operasional SUP → ditolak server, data tidak berubah', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const x = await d.golongan(G_BESAR);
    const kuotaOp = await d.kuotaOperasionalSUP();
    try {
      await d.isiKuotaGol(G_BESAR, String(x.unit + Math.ceil(kuotaOp / x.supPerUnit)));
      await d.simpanAlokasi();
      await d.expectToast('Gagal menyimpan alokasi');
      await d.page.reload();
      await d.tungguTermuat();
      await d.bukaTab('Alokasi');
      await d.bukaSubTab('Kendaraan');
      await expect(d.inputKuotaGol(G_BESAR)).toHaveValue(String(x.unit));
    } finally {
      await pulihkan(d);
    }
  });

  test('[Positif] KV-14 kurangi kuota golongan 1 unit → Setara SUP & total turun sebesar SUP/unit', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const x = await d.golongan(G_BESAR);
    const r = await d.ringkasanSUP();
    test.skip(x.unit < 1, `Kuota golongan ${G_BESAR} sudah 0`);
    try {
      await d.isiKuotaGol(G_BESAR, String(x.unit - 1));
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      const y = await d.golongan(G_BESAR);
      expect(samaSUP(y.setaraSUP, (x.unit - 1) * x.supPerUnit)).toBe(true);
      expect(samaSUP((await d.ringkasanSUP()).total, r.total - x.supPerUnit)).toBe(true);
    } finally {
      await pulihkan(d);
    }
    expect(samaSUP((await d.ringkasanSUP()).total, r.total)).toBe(true);
  });

  test('[Positif] KV-15 tipe Restrict disimpan → "Jika habis" = Tolak; Normal → "Ambil sisa golongan Normal lain"', async ({ page }) => {
    const d = await bukaKendaraan(page);
    expect((await d.golongan(G_BESAR)).jikaHabis).toMatch(/Ambil sisa golongan Normal/);
    try {
      await d.tipeGol(G_BESAR).selectOption('restrict');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect.poll(async () => (await d.golongan(G_BESAR)).jikaHabis).toMatch(/Tolak/);
      await expect(d.tipeGol(G_BESAR)).toHaveValue('restrict');
    } finally {
      await pulihkan(d);
    }
    await expect(d.tipeGol(G_BESAR)).toHaveValue('normal');
    expect((await d.golongan(G_BESAR)).jikaHabis).toMatch(/Ambil sisa golongan Normal/);
  });

  test('[Positif] KV-16 "Kembalikan semua ke jadwal" dari sub-tab Kendaraan juga memulihkan override Penumpang', async ({ page }) => {
    const d = await bukaKendaraan(page);
    const retail = await d.nilaiChannelKendaraan('Retail', G_KECIL);
    test.skip(retail < 1, `Retail golongan ${G_KECIL} kosong`);
    try {
      // override Penumpang
      await d.bukaSubTab('Penumpang');
      const awalPax = await d.inputMitra(DATA.kelas).inputValue();
      await d.isiMitra(DATA.kelas, String(Number(awalPax) + 1));
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect(d.labelOverride).toBeVisible();

      // override Kendaraan, lalu Kembalikan semua dari sub-tab Kendaraan
      await d.bukaSubTab('Kendaraan');
      await d.isiMitraGol(G_KECIL, '1');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect(d.labelOverride).toBeVisible();
      expect(await d.kembalikanSemuaKeJadwal(), 'tombol Kembalikan semua harus ada di sub-tab Kendaraan').toBe(true);
      await expect(d.inputMitraGol(G_KECIL)).toHaveValue('0');

      // Penumpang ikut pulih
      await d.bukaSubTab('Penumpang');
      await expect(d.inputMitra(DATA.kelas)).toHaveValue(awalPax);
      await expect.poll(() => d.sumber('Mitra')).toContain('Jadwal');
      await expect(d.labelJadwal).toBeVisible();
    } finally {
      await pulihkan(d);
    }
  });
});