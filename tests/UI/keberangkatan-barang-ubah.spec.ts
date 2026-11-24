import { test, expect, type Page } from '@playwright/test';
import { DATA, KeberangkatanListPage, DetailKeberangkatanPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — Alokasi BARANG & HEWAN (MENGUBAH DATA → butuh ALLOW_WRITE=1)
 * Sebelum & sesudah setiap test: semua override dihapus ("Kembalikan semua ke jadwal" di semua sub-tab).
 * ID: KB-1x, KB-T0x
 */

test.describe.configure({ mode: 'serial' });

const KAT = process.env.KB_KATEGORI ?? 'Hewan kecil (kucing, anjing)';
const KAT2 = process.env.KB_KATEGORI_2 ?? 'Barang bawaan';

async function bukaBarang(page: Page): Promise<DetailKeberangkatanPage> {
  const list = new KeberangkatanListPage(page);
  await list.gotoTanggal(DATA.tanggalUji);
  const d = await list.bukaDetail(DATA.jadwalA);
  await d.bukaTab('Alokasi');
  await d.bukaSubTab('Barang & Hewan');
  await expect(d.tabelBarang).toBeVisible();
  return d;
}
async function bersihkan(d: DetailKeberangkatanPage) {
  await d.page.reload();
  await d.tungguTermuat();
  await d.bukaTab('Alokasi');
  await d.pulihkanSemuaSubTab();
  await d.bukaSubTab('Barang & Hewan');
}
async function simpanDanTunggu(d: DetailKeberangkatanPage) {
  const resp = d.page.waitForResponse((r) => /\/allocations/.test(r.url()) && r.request().method() === 'PUT', { timeout: 20_000 });
  await d.simpanAlokasi();
  return resp;
}

const LANGKAH = [
  'Buka menu Keberangkatan & Alokasi',
  `Pilih rute ${DATA.rute}, tanggal ${DATA.tanggalUji}`,
  `Klik jadwal ${DATA.jadwalA} → tab Alokasi → sub-tab Barang & Hewan`,
];

test.describe('Keberangkatan — Barang & Hewan (ubah data + restore)', () => {
  test.beforeEach(async ({ page }) => {
    const d = await bukaBarang(page);
    await d.pulihkanSemuaSubTab();
  });

  test('[Positif] KB-10 simpan target 10 → label "override", Sisa target 10, bertahan setelah reload', async ({ page }) => {
    const d = await bukaBarang(page);
    const terjual = (await d.barang(KAT)).terjual;
    try {
      await d.isiTarget(KAT, '10');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await expect(d.labelOverride).toBeVisible();

      await d.reloadAlokasi('Barang & Hewan');
      await expect(d.inputTarget(KAT)).toHaveValue('10');
      expect((await d.barang(KAT)).sisaTarget).toBe(String(10 - terjual));
    } finally {
      await bersihkan(d);
    }
    await expect(d.inputTarget(KAT)).toHaveValue('');
    await expect(d.labelJadwal).toBeVisible();
  });

  test('[Positif] KB-11 kosongkan target lalu Simpan → kembali ke nilai jadwal', async ({ page }) => {
    const d = await bukaBarang(page);
    try {
      await d.isiTarget(KAT, '10');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await d.reloadAlokasi('Barang & Hewan');

      await d.inputTarget(KAT).fill('');
      await d.inputTarget(KAT).press('Tab');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');

      await d.reloadAlokasi('Barang & Hewan');
      await expect(d.inputTarget(KAT)).toHaveValue('');
      await expect(d.labelJadwal).toBeVisible();
    } finally {
      await bersihkan(d);
    }
  });

  test('[Edge] KB-12 target 1 (nilai terkecil yang bermakna) → tersimpan', async ({ page }) => {
    const d = await bukaBarang(page);
    try {
      await d.isiTarget(KAT, '1');
      const r = await simpanDanTunggu(d);
      expect(r.status()).toBeLessThan(400);
      await d.reloadAlokasi('Barang & Hewan');
      await expect(d.inputTarget(KAT)).toHaveValue('1');
    } finally {
      await bersihkan(d);
    }
  });

  test('[Negatif] KB-13 target negatif (-5) lalu Simpan → yang tersimpan tidak boleh negatif', async ({ page }) => {
    const d = await bukaBarang(page);
    try {
      await d.isiTarget(KAT, '-5');
      const diForm = await d.inputTarget(KAT).inputValue();
      const r = await simpanDanTunggu(d);
      await d.reloadAlokasi('Barang & Hewan');
      const tersimpan = await d.inputTarget(KAT).inputValue();
      test.info().annotations.push({ type: 'info', description: `Form menampilkan "${diForm}", HTTP ${r.status()}, tersimpan "${tersimpan}"` });
      expect(tersimpan.startsWith('-'), `target tersimpan "${tersimpan}"`).toBe(false);
    } finally {
      await bersihkan(d);
    }
  });

  test('[Edge] KB-14 target 0 → tersimpan sebagai 0 (bukan dianggap kosong / tanpa batas)', async ({ page }) => {
    const d = await bukaBarang(page);
    try {
      await d.isiTarget(KAT, '0');
      const r = await simpanDanTunggu(d);
      await d.reloadAlokasi('Barang & Hewan');
      const tersimpan = await d.inputTarget(KAT).inputValue();
      const status = (await d.barang(KAT)).status;
      await cekTemuan(page, {
        id: 'KB-T04',
        judul: 'Target barang/hewan 0 tidak tersimpan sebagai 0 [perlu konfirmasi]',
        langkah: [...LANGKAH, `Isi Target informasi "${KAT}" = 0 → Simpan`, 'Muat ulang halaman, buka lagi sub-tab Barang & Hewan'],
        ekspektasi: 'Target tersimpan 0 (tidak ada kuota untuk kategori ini), berbeda dengan kosong yang berarti tidak dibatasi',
        aktual: `HTTP ${r.status()}; setelah reload target = "${tersimpan}", status "${status}"`,
        cek: async () => expect(tersimpan).toBe('0'),
        fokus: d.barisBarang(KAT),
      });
    } finally {
      await bersihkan(d);
    }
  });

  /* ------------------------------ TEMUAN ------------------------------ */

  test('[Temuan] KB-T02 target sangat besar seharusnya ditolak dengan pesan validasi, bukan error server (HTTP 500)', async ({ page }) => {
    const d = await bukaBarang(page);
    try {
      await d.isiTarget(KAT, '999999999999');
      const r = await simpanDanTunggu(d);
      const toast = d.toast.first();
      await expect(toast).toBeVisible();
      const pesan = (await toast.innerText()).replace(/\n/g, ' / ');
      await cekTemuan(page, {
        id: 'KB-T02',
        judul: 'Target barang/hewan sangat besar menyebabkan error server (HTTP 500)',
        langkah: [...LANGKAH, `Isi Target informasi "${KAT}" = 999999999999`, 'Klik Simpan'],
        ekspektasi: 'Ditolak dengan pesan validasi yang jelas (mis. "Target maksimal …"), server membalas 4xx (bukan 500)',
        aktual: `Server membalas HTTP ${r.status()}, toast: "${pesan}" (tanpa alasan)`,
        cek: async () => expect(r.status()).toBeLessThan(500),
        fokus: d.inputTarget(KAT),
      });
    } finally {
      await bersihkan(d);
    }
  });

  test('[Temuan] KB-T03 Simpan berikutnya seharusnya TIDAK menghapus target yang sudah tersimpan', async ({ page }) => {
    const d = await bukaBarang(page);
    try {
      await d.isiTarget(KAT, '10');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');
      await d.reloadAlokasi('Barang & Hewan');
      await expect(d.inputTarget(KAT)).toHaveValue('10');

      await d.isiTarget(KAT2, '5');
      await d.simpanAlokasi();
      await d.expectToast('Alokasi berhasil disimpan');

      await d.reloadAlokasi('Barang & Hewan');
      const t1 = await d.inputTarget(KAT).inputValue();
      const t2 = await d.inputTarget(KAT2).inputValue();
      await cekTemuan(page, {
        id: 'KB-T03',
        judul: 'Target barang/hewan yang sudah tersimpan hilang diam-diam saat Simpan berikutnya',
        langkah: [
          ...LANGKAH,
          `Isi target "${KAT}" = 10 → Simpan → reload: target = 10`,
          `Isi target "${KAT2}" = 5 → Simpan (toast "Alokasi berhasil disimpan")`,
          'Reload halaman',
        ],
        ekspektasi: `Target "${KAT}" tetap 10 dan "${KAT2}" = 5`,
        aktual: `Target "${KAT}" = "${t1 || '(kosong)'}", "${KAT2}" = "${t2 || '(kosong)'}" — target sebelumnya terhapus tanpa pemberitahuan`,
        cek: async () => expect(t1).toBe('10'),
        fokus: d.tabelBarang,
      });
    } finally {
      await bersihkan(d);
    }
  });
});