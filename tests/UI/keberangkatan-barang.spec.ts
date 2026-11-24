import { test, expect, type Page } from '@playwright/test';
import { DATA, KeberangkatanListPage, DetailKeberangkatanPage, cekTemuan } from './pages/kapasitas.pages';

/**
 * KEBERANGKATAN — Alokasi BARANG & HEWAN (READ-ONLY: semua perubahan di-"Buang Perubahan")
 * Halaman: detail keberangkatan → tab Alokasi → sub-tab "Barang & Hewan"
 * Aturan di layar:
 *  - Barang & hewan tidak dibatasi kuota; target hanya informasi (transaksi tetap dijual saat target terlampaui)
 *  - Barang curah hanya dijual go-show di loket, bersifat loss (tanpa target)
 *  - Kosongkan target untuk kembali ke nilai jadwal
 * ID: KB-0x, KB-T0x
 */

const KAT = process.env.KB_KATEGORI ?? 'Hewan kecil (kucing, anjing)';

async function bukaBarang(page: Page): Promise<DetailKeberangkatanPage> {
  const list = new KeberangkatanListPage(page);
  await list.gotoTanggal(DATA.tanggalUji);
  const d = await list.bukaDetail(DATA.jadwalA);
  await d.bukaTab('Alokasi');
  await d.bukaSubTab('Barang & Hewan');
  await expect(d.tabelBarang).toBeVisible();
  return d;
}
 
const LANGKAH = [
  'Buka menu Keberangkatan & Alokasi',
  `Pilih rute ${DATA.rute}, tanggal ${DATA.tanggalUji}`,
  `Klik jadwal ${DATA.jadwalA} → tab Alokasi → sub-tab Barang & Hewan`,
];

test.describe('Keberangkatan — Barang & Hewan (read-only)', () => {
  test('[Positif] KB-01 tabel & aturan tampil lengkap', async ({ page }) => {
    const d = await bukaBarang(page);
    for (const h of ['Kategori', 'Tipe', 'Satuan', 'Channel jual', 'Target informasi', 'Batas fisik kapal', 'Terjual', 'Sisa target', 'Status']) {
      await expect(d.tabelBarang.locator('thead')).toContainText(h);
    }
    await expect(d.main).toContainText('Barang & hewan tidak dibatasi kuota');
    await expect(d.main).toContainText('Barang curah hanya dijual go-show di loket');
    await expect(d.main).toContainText('Kosongkan target untuk kembali ke nilai jadwal');
    expect((await d.daftarKategoriBarang()).length).toBeGreaterThan(0);
  });

  test('[Positif] KB-02 kategori curah (loket go-show): tanpa input target & status "Loss · tidak dibatasi"; kategori lain punya input', async ({ page }) => {
    const d = await bukaBarang(page);
    for (const k of await d.daftarKategoriBarang()) {
      const b = await d.barang(k);
      if (/curah, tidak ada target/.test(String(b.target))) {
        expect(b.punyaInput, `${k}: kategori curah tidak boleh punya input target`).toBe(false);
        expect(b.channel, `${k}: kategori curah hanya Loket (go-show)`).toContain('Loket');
        expect(b.status, `${k}`).toContain('Loss');
      } else {
        expect(b.punyaInput, `${k}: kategori non-curah harus punya input target`).toBe(true);
      }
    }
  });

  test('[Positif] KB-03 isi target 10 → Sisa target = 10 − terjual (preview), Simpan aktif; Buang mengembalikan', async ({ page }) => {
    const d = await bukaBarang(page);
    const awal = await d.barang(KAT);
    await expect(d.btnSimpan).toBeDisabled();
    await d.isiTarget(KAT, '10');
    await expect.poll(async () => (await d.barang(KAT)).sisaTarget).toBe(String(10 - awal.terjual));
    await expect(d.btnSimpan).toBeEnabled();
    await d.btnBuang.click();
    await expect(d.inputTarget(KAT)).toHaveValue(String(awal.target));
    await expect(d.btnSimpan).toBeDisabled();
  });

  test('[Negatif] KB-04 input target: negatif → 0, desimal → bilangan bulat, huruf ditolak', async ({ page }) => {
    const d = await bukaBarang(page);
    const inp = d.inputTarget(KAT);
    const ketik = async (v: string) => {
      await inp.click();
      await inp.press('Control+A');
      await inp.pressSequentially(v);
      await inp.press('Tab');
    };
    await ketik('-5');
    await expect(inp).toHaveValue('0');
    await ketik('2,5');
    await expect(inp).toHaveValue(/^\d+$/);
    const sebelum = await inp.inputValue();
    await ketik('abc');
    await expect(inp).toHaveValue(sebelum);
    if (await d.btnBuang.isEnabled()) await d.btnBuang.click();
  });

  test('[Temuan] KB-T01 kategori "Barang curah" seharusnya mengikuti aturan curah (go-show loket, tanpa target) [perlu konfirmasi]', async ({ page }) => {
    const d = await bukaBarang(page);
    const ada = (await d.daftarKategoriBarang()).includes('Barang curah');
    test.skip(!ada, 'Kategori "Barang curah" tidak ada di keberangkatan uji');
    const b = await d.barang('Barang curah');
    await cekTemuan(page, {
      id: 'KB-T01',
      judul: 'Kategori "Barang curah" tidak mengikuti aturan barang curah',
      langkah: [...LANGKAH, 'Lihat baris kategori "Barang curah"', 'Baca keterangan "Barang curah hanya dijual go-show di loket dan bersifat loss"'],
      ekspektasi: 'Channel jual "Loket (go-show)", tanpa target ("— (curah, tidak ada target)"), status "Loss · tidak dibatasi"',
      aktual: `Channel jual "${b.channel}", ${b.punyaInput ? 'ada input target' : 'tanpa target'}, status "${b.status}"`,
      cek: async () => {
        expect(b.channel).toContain('Loket');
        expect(b.punyaInput).toBe(false);
      },
      fokus: d.barisBarang('Barang curah'),
    });
  });
});