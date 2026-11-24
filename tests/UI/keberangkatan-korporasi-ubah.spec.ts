import { test, expect, type Page } from '@playwright/test';
import { DATA, KeberangkatanListPage, DetailKeberangkatanPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — Alokasi KORPORASI (MENGUBAH DATA → butuh ALLOW_WRITE=1)
 * Sebelum & sesudah setiap test: semua override dihapus ("Kembalikan semua ke jadwal" di semua sub-tab).
 * ID: KK-1x, KK-T0x
 */

test.describe.configure({ mode: 'serial' });

const G1 = process.env.KV_GOL_KECIL ?? 'I';
const G2 = process.env.KV_GOL_KEDUA ?? 'II';
// Kelas kedua untuk uji "Simpan berikutnya". Kapal rute uji hanya punya kelas REGULER,
// jadi default = kelas yang sama (channel berbeda). Isi KA_KELAS_2 di .env kalau ada kelas lain.
const KELAS2 = process.env.KA_KELAS_2 ?? DATA.kelas;

async function bukaAlokasi(page: Page): Promise<DetailKeberangkatanPage> {
  const list = new KeberangkatanListPage(page);
  await list.gotoTanggal(DATA.tanggalUji);
  const d = await list.bukaDetail(DATA.jadwalA);
  await d.bukaTab('Alokasi');
  return d;
}
async function bersihkan(d: DetailKeberangkatanPage) {
  await d.page.reload();
  await d.tungguTermuat();
  await d.bukaTab('Alokasi');
  await d.pulihkanSemuaSubTab();
  await d.bukaSubTab('Penumpang');
}

const LANGKAH = [
  'Buka menu Keberangkatan & Alokasi',
  `Pilih rute ${DATA.rute}, tanggal ${DATA.tanggalUji}`,
  `Klik jadwal ${DATA.jadwalA} → tab Alokasi`,
];

test.describe('Keberangkatan — Alokasi Korporasi (ubah data + restore)', () => {
  test.beforeEach(async ({ page }) => {
    const d = await bukaAlokasi(page);
    await d.pulihkanSemuaSubTab();
  });

  test('[Positif] KK-10 simpan Korporasi 3 → Retail berkurang 3, sumber "Override", bertahan setelah reload', async ({ page }) => {
    const d = await bukaAlokasi(page);
    const retail = await d.nilai('Retail', DATA.kelas);
    test.skip(retail < 3, `Retail ${DATA.kelas} kurang dari 3`);
    try {
      await d.isiKorporasi(DATA.kelas, '3');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect.poll(() => d.nilai('Retail', DATA.kelas)).toBe(retail - 3);
      await expect.poll(() => d.sumber('Korporasi')).toContain('Override');
      await expect(d.tabelAlokasi).toContainText('Sesuai kuota');

      await d.reloadAlokasi();
      await expect(d.inputKorporasi(DATA.kelas)).toHaveValue('3');
      expect(await d.nilai('Retail', DATA.kelas)).toBe(retail - 3);
    } finally {
      await bersihkan(d);
    }
    await expect(d.inputKorporasi(DATA.kelas)).toHaveValue('0');
    await expect.poll(() => d.sumber('Korporasi')).toContain('Jadwal');
  });

  test('[Edge] KK-11 Korporasi = tepat kuota kelas (batas) → tersimpan, Retail kelas 0', async ({ page }) => {
    const d = await bukaAlokasi(page);
    const kuota = await d.kuotaKelas(DATA.kelas);
    try {
      await d.isiKorporasi(DATA.kelas, String(kuota));
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect.poll(() => d.nilai('Retail', DATA.kelas)).toBe(0);
      await expect(d.tabelAlokasi).toContainText('Sesuai kuota');
    } finally {
      await bersihkan(d);
    }
  });

  test('[Positif] KK-12 Mitra 2 + Korporasi 3 dalam SEKALI Simpan → keduanya tersimpan, Retail berkurang 5', async ({ page }) => {
    const d = await bukaAlokasi(page);
    const retail = await d.nilai('Retail', DATA.kelas);
    test.skip(retail < 5, `Retail ${DATA.kelas} kurang dari 5`);
    try {
      await d.isiMitra(DATA.kelas, '2');
      await d.isiKorporasi(DATA.kelas, '3');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await d.reloadAlokasi();
      await expect(d.inputMitra(DATA.kelas)).toHaveValue('2');
      await expect(d.inputKorporasi(DATA.kelas)).toHaveValue('3');
      expect(await d.nilai('Retail', DATA.kelas)).toBe(retail - 5);
    } finally {
      await bersihkan(d);
    }
  });

  test('[Negatif] KK-13 Mitra + Korporasi melebihi kuota kelas (sekali Simpan) → tidak boleh tersimpan melebihi', async ({ page }) => {
    const d = await bukaAlokasi(page);
    const kuota = await d.kuotaKelas(DATA.kelas);
    const mitra = Math.ceil(kuota / 2) + 1;
    const korp = Math.ceil(kuota / 2) + 1; // mitra + korp > kuota, tapi masing-masing ≤ kuota
    try {
      await d.isiMitra(DATA.kelas, String(mitra));
      await d.isiKorporasi(DATA.kelas, String(korp));
      await d.simpanAlokasi();
      await expect(d.toast.filter({ hasText: /Gagal|berhasil/ }).first()).toBeVisible();
      await d.reloadAlokasi();
      const m = Number(await d.inputMitra(DATA.kelas).inputValue());
      const k = Number(await d.inputKorporasi(DATA.kelas).inputValue());
      expect(m + k, `tersimpan Mitra ${m} + Korporasi ${k}, kuota kelas ${kuota}`).toBeLessThanOrEqual(kuota);
    } finally {
      await bersihkan(d);
    }
  });

  test('[Positif] KK-14 Kendaraan: simpan Korporasi golongan 1 unit → Retail golongan berkurang 1, bertahan setelah reload', async ({ page }) => {
    const d = await bukaAlokasi(page);
    await d.bukaSubTab('Kendaraan');
    const retail = await d.nilaiChannelKendaraan('Retail', G1);
    test.skip(retail < 1, `Retail golongan ${G1} kosong`);
    try {
      await d.isiKorporasiGol(G1, '1');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await d.reloadAlokasi('Kendaraan');
      await expect(d.inputKorporasiGol(G1)).toHaveValue('1');
      expect(await d.nilaiChannelKendaraan('Retail', G1)).toBe(retail - 1);
    } finally {
      await bersihkan(d);
    }
  });

  /* ------------------------------ TEMUAN ------------------------------ */

  test('[Temuan] KK-T02 (Penumpang) Simpan berikutnya seharusnya TIDAK menghapus override yang sudah tersimpan', async ({ page }) => {
    const d = await bukaAlokasi(page);
    try {
      // 1. simpan Korporasi kelas A
      await d.isiKorporasi(DATA.kelas, '3');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await d.reloadAlokasi();
      await expect(d.inputKorporasi(DATA.kelas)).toHaveValue('3');

      // 2. simpan Mitra kelas lain
      await d.isiMitra(KELAS2, '1');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');

      // 3. cek data yang benar-benar tersimpan
      await d.reloadAlokasi();
      const korp = await d.inputKorporasi(DATA.kelas).inputValue();
      const mitra = await d.inputMitra(KELAS2).inputValue();
      await cekTemuan(page, {
        id: 'KK-T02',
        judul: 'Override alokasi yang sudah tersimpan hilang diam-diam saat Simpan berikutnya (Penumpang)',
        langkah: [
          ...LANGKAH,
          `Isi Korporasi kelas ${DATA.kelas} = 3 → Simpan (toast "Alokasi berhasil disimpan") → reload: Korporasi = 3`,
          `Isi Mitra kelas ${KELAS2} = 1 → Simpan (toast "Alokasi berhasil disimpan")`,
          'Reload halaman, lihat baris Korporasi',
        ],
        ekspektasi: `Korporasi ${DATA.kelas} tetap 3 dan Mitra ${KELAS2} = 1 (kedua override tersimpan)`,
        aktual: `Korporasi ${DATA.kelas} = ${korp}, Mitra ${KELAS2} = ${mitra} — override sebelumnya terhapus tanpa pemberitahuan`,
        cek: async () => expect(korp).toBe('3'),
        fokus: d.tabelAlokasi,
      });
    } finally {
      await bersihkan(d);
    }
  });

  test('[Temuan] KK-T03 (Kendaraan) Simpan berikutnya seharusnya TIDAK menghapus override yang sudah tersimpan', async ({ page }) => {
    const d = await bukaAlokasi(page);
    await d.bukaSubTab('Kendaraan');
    try {
      await d.isiMitraGol(G1, '1');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await d.reloadAlokasi('Kendaraan');
      await expect(d.inputMitraGol(G1)).toHaveValue('1');

      await d.isiKorporasiGol(G2, '1');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');

      await d.reloadAlokasi('Kendaraan');
      const mitra = await d.inputMitraGol(G1).inputValue();
      const korp = await d.inputKorporasiGol(G2).inputValue();
      await cekTemuan(page, {
        id: 'KK-T03',
        judul: 'Override alokasi kendaraan yang sudah tersimpan hilang diam-diam saat Simpan berikutnya',
        langkah: [
          ...LANGKAH,
          'Buka sub-tab Kendaraan',
          `Isi Mitra golongan ${G1} = 1 → Simpan → reload: Mitra = 1`,
          `Isi Korporasi golongan ${G2} = 1 → Simpan (toast "Alokasi berhasil disimpan")`,
          'Reload halaman, lihat baris Mitra',
        ],
        ekspektasi: `Mitra golongan ${G1} tetap 1 dan Korporasi golongan ${G2} = 1`,
        aktual: `Mitra golongan ${G1} = ${mitra}, Korporasi golongan ${G2} = ${korp} — override sebelumnya terhapus tanpa pemberitahuan`,
        cek: async () => expect(mitra).toBe('1'),
        fokus: d.tabelChannelKendaraan,
      });
    } finally {
      await bersihkan(d);
    }
  });
});