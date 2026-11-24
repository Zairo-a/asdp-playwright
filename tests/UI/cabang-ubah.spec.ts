import { test, expect, type BrowserContextOptions } from '@playwright/test';
import { CabangPage, acak, bersihkanCabangQA } from './pages/cabang.pages';
import { PerusahaanPage } from './pages/perusahaan.pages';
import { cekTemuan } from './pages/kapasitas.pages';
import { bukaWeb, teksPelabuhanWeb, tungguSinkron } from './pages/ferizy.pages';

/**
 * MASTER DATA — CABANG — UI, MENGUBAH DATA (butuh ALLOW_WRITE=1)
 * Hanya cabang uji milik QA (kode diawali "QACB" + acak), dibuat & dihapus lewat layar.
 * Pelabuhan uji dipilih yang TIDAK punya rute (AMPANA, BABANG, BAKALANG) supaya cabang uji bisa dihapus.
 * CB-36 memakai LEMBAR (punya rute aktif LMB-PGA) untuk uji "nonaktif/hapus ditolak", lalu LEMBAR dilepas lagi.
 * Data uji SELALU dibersihkan di awal & akhir. Cabang & pelabuhan asli tidak diubah.
 * ID: CB-3x, CB-T06..T09
 */

test.describe.configure({ mode: 'serial' });
test.skip(process.env.ALLOW_WRITE !== '1', 'Set ALLOW_WRITE=1 untuk menjalankan test yang mengubah data');

const AWALAN = 'QACB';
const KODE = AWALAN + acak(3);
const KODE_RUTE = AWALAN + acak(3);
const KODE_NON = AWALAN + acak(3);
const NAMA = `QA AUTO CABANG ${KODE}`;
const NAMA_BARU = `QA AUTO CABANG ${KODE} EDIT`;
const PERUSAHAAN = process.env.CB_PERUSAHAAN ?? 'PT. Dharma Lautan Utama';
const KODE_PERUSAHAAN = process.env.CB_KODE_PERUSAHAAN ?? 'DLU';
let dibuat = false;
let jumlahCabangAwal = -1;

async function apiCtx(playwright: any) {
  const u = test.info().project.use as BrowserContextOptions & { baseURL?: string };
  return playwright.request.newContext({ baseURL: u.baseURL, storageState: u.storageState as string });
}
async function bersihkan(playwright: any) {
  const req = await apiCtx(playwright);
  try { await bersihkanCabangQA(req, AWALAN); } finally { await req.dispose(); }
}
test.beforeAll(async ({ playwright }) => bersihkan(playwright));
test.afterAll(async ({ playwright }) => bersihkan(playwright));

async function jumlahCabang(page: import('@playwright/test').Page) {
  const pr = new PerusahaanPage(page);
  await pr.goto({ search: KODE_PERUSAHAAN });
  return Number((await pr.semuaBaris()).find((r) => r.Kode === KODE_PERUSAHAAN)?.['Jumlah Cabang'] ?? NaN);
}

test.describe('Cabang — siklus data uji', () => {
  test('[Positif] CB-30 Tambah cabang (2 pelabuhan) → muncul Aktif dengan perusahaan & pelabuhan yang benar', async ({ page }) => {
    jumlahCabangAwal = await jumlahCabang(page);
    const p = new CabangPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.tambah({ kode: KODE, nama: NAMA, perusahaan: PERUSAHAAN, telepon: '081234567890', email: 'qa.cabang@example.com', alamat: 'Jl. Uji', pelabuhan: ['AMPANA', 'BABANG'] });
    dibuat = true;
    await expect.poll(async () => { await p.goto(); return p.totalData(); }).toBe(awal + 1);
    const r = await p.barisKode(KODE);
    expect(r?.['Nama Cabang']).toBe(NAMA);
    expect(r?.Perusahaan).toBe(PERUSAHAAN);
    expect(r?.Pelabuhan).toContain('AMPANA');
    expect(r?.Pelabuhan).toContain('BABANG');
    expect(r?.Status).toBe('Aktif');
  });

  test('[Dampak] CB-31 "Jumlah Cabang" perusahaan bertambah 1', async ({ page }) => {
    test.skip(!dibuat, 'CB-30 gagal');
    expect(await jumlahCabang(page)).toBe(jumlahCabangAwal + 1);
  });

  test('[Dampak] CB-32 cabang baru seharusnya TIDAK tampil sebagai "Pelabuhan" di web', async ({ page, browser }) => {
    test.skip(!dibuat, 'CB-30 gagal');
    test.setTimeout(300_000); // menunggu sinkron CMS → web
    const { ctx, web } = await bukaWeb(browser);
    let tampil = false;
    try {
      // tunggu ±1 menit: kalau memang ikut tersinkron sebagai pelabuhan, akan terlihat
      await tungguSinkron(async () => (tampil = (await teksPelabuhanWeb(web)).includes(`pelabuhan ${NAMA.toLowerCase()}`)));
      await cekTemuan(web, {
        id: 'CB-T06',
        judul: 'Cabang baru di CMS ikut tampil sebagai "Pelabuhan" di web Ferizy',
        langkah: [`CMS → Cabang → Tambah "${NAMA}"`, 'Web Ferizy → menu "Pelabuhan" (tunggu ±1 menit)'],
        ekspektasi: 'Cabang tidak tampil di halaman Pelabuhan web',
        aktual: tampil ? `Tampil "Pelabuhan ${NAMA}"` : 'Tidak tampil',
        cek: async () => expect(tampil).toBe(false),
      });
    } finally {
      await ctx.close();
    }
  });

  test('[Negatif] CB-33 kode cabang yang sudah dipakai → ditolak, tidak ada data ganda', async ({ page }) => {
    test.skip(!dibuat, 'CB-30 gagal');
    const p = new CabangPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: KODE, nama: NAMA + ' DUP', perusahaan: PERUSAHAAN, pelabuhan: ['BAKALANG'] });
    expect(await p.simpan()).not.toMatch(/berhasil/i);
    await p.tutupForm();
    await p.goto({ search: KODE });
    expect((await p.semuaBaris()).filter((r) => r.Kode === KODE)).toHaveLength(1);
  });

  test('[Positif] CB-34 Ubah nama, telepon & pelabuhan (lepas BABANG, tambah BAKALANG) → daftar ikut berubah; [Edge] kode terkunci', async ({ page }) => {
    test.skip(!dibuat, 'CB-30 gagal');
    const p = new CabangPage(page);
    await p.goto({ search: KODE });
    await p.bukaUbah(KODE);
    const kodeBisa = await p.kode.isEditable();
    await p.isi({ nama: NAMA_BARU, telepon: '0219876543', pelabuhan: ['BABANG', 'BAKALANG'] }); // klik BABANG lagi = dilepas
    expect(await p.simpan()).toMatch(/berhasil/i);
    const r = await p.barisKode(KODE);
    expect(r?.['Nama Cabang']).toBe(NAMA_BARU);
    expect(r?.Pelabuhan).toContain('AMPANA');
    expect(r?.Pelabuhan).toContain('BAKALANG');
    expect(r?.Pelabuhan).not.toContain('BABANG');
    test.info().annotations.push({ type: 'info', description: `Kode cabang di form Ubah ${kodeBisa ? 'BISA diketik' : 'terkunci'} (cabang belum dipakai rute)` });
  });

  test('[Positif] CB-35 Nonaktifkan → "Nonaktif", menu "Aktifkan"; Aktifkan lagi → "Aktif"', async ({ page }) => {
    test.skip(!dibuat, 'CB-30 gagal');
    const p = new CabangPage(page);
    await p.goto({ search: KODE });
    expect(await p.ubahStatus(KODE, false)).toMatch(/berhasil/i);
    expect((await p.barisKode(KODE))?.Status).toBe('Nonaktif');
    expect(await p.daftarAksi(KODE)).toContain('Aktifkan');
    expect(await p.ubahStatus(KODE, true)).toMatch(/berhasil/i);
    expect((await p.barisKode(KODE))?.Status).toBe('Aktif');
  });

  test('[Negatif] CB-36 cabang yang mengelola LEMBAR (punya rute aktif) → Nonaktifkan & Hapus ditolak', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    await p.tambah({ kode: KODE_RUTE, nama: `QA AUTO CABANG ${KODE_RUTE} RUTE`, perusahaan: PERUSAHAAN, pelabuhan: ['LEMBAR'] });
    try {
      await p.goto({ search: KODE_RUTE });
      const nonaktif = await p.ubahStatus(KODE_RUTE, false);
      const statusSetelah = (await p.barisKode(KODE_RUTE))?.Status;
      await cekTemuan(page, {
        id: 'CB-T07',
        judul: 'Cabang yang pelabuhannya punya rute aktif bisa dinonaktifkan (keterangan form: harus ditolak)',
        langkah: [`Cabang → Tambah ${KODE_RUTE} dengan pelabuhan LEMBAR (rute LMB-PGA aktif)`, '⋯ → Nonaktifkan'],
        ekspektasi: 'Ditolak: "cabang masih punya rute atau jadwal aktif"; status tetap Aktif',
        aktual: `Toast: "${nonaktif}"; status: ${statusSetelah}`,
        cek: async () => expect(statusSetelah).toBe('Aktif'),
        fokus: p.toast.first(),
      });
      if (statusSetelah !== 'Aktif') { await p.goto({ search: KODE_RUTE }); await p.ubahStatus(KODE_RUTE, true); }
      await p.goto({ search: KODE_RUTE });
      const hapus = await p.hapusData(KODE_RUTE);
      const masih = !!(await p.barisKode(KODE_RUTE));
      await cekTemuan(page, {
        id: 'CB-T08',
        judul: 'Cabang yang pelabuhannya punya rute aktif bisa dihapus',
        langkah: [`Cabang ${KODE_RUTE} (pelabuhan LEMBAR, rute LMB-PGA aktif)`, '⋯ → Hapus Data → Hapus'],
        ekspektasi: 'Ditolak; cabang tetap ada',
        aktual: `Toast: "${hapus}"; cabang ${masih ? 'masih ada' : 'terhapus'}`,
        cek: async () => expect(masih).toBe(true),
        fokus: p.toast.first(),
      });
    } finally {
      // lepas LEMBAR (ganti BAKALANG) supaya cabang uji bisa dibersihkan
      if (await p.barisKode(KODE_RUTE)) {
        await p.bukaUbah(KODE_RUTE);
        await p.isi({ pelabuhan: ['LEMBAR', 'BAKALANG'] });
        await p.simpan();
        await p.tutupForm();
        await p.goto({ search: KODE_RUTE });
        await p.hapusData(KODE_RUTE);
      }
    }
  });

  test('[Edge] CB-37 Tambah cabang dengan status Nonaktif sejak awal → tersimpan Nonaktif', async ({ page }) => {
    const p = new CabangPage(page);
    await p.goto();
    await p.tambah({ kode: KODE_NON, nama: `QA AUTO CABANG ${KODE_NON}`, perusahaan: PERUSAHAAN, pelabuhan: ['BAKALANG'], aktif: false });
    expect((await p.barisKode(KODE_NON))?.Status).toBe('Nonaktif');
  });

  test('[Positif] CB-38 Hapus Data → hilang dari daftar; [Dampak] "Jumlah Cabang" perusahaan kembali', async ({ page }) => {
    test.skip(!dibuat, 'CB-30 gagal');
    const p = new CabangPage(page);
    await p.goto({ search: KODE });
    expect(await p.hapusData(KODE)).toMatch(/berhasil/i);
    expect(await p.barisKode(KODE)).toBeNull();
    // cabang nonaktif dari CB-37 masih ada (+1) — hitung ulang setelah dihapus juga
    await p.goto({ search: KODE_NON });
    if (await p.barisKode(KODE_NON)) { await p.goto({ search: KODE_NON }); await p.hapusData(KODE_NON); }
    expect(await jumlahCabang(page)).toBe(jumlahCabangAwal);
  });
});
