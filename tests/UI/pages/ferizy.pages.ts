import { expect, type Browser, type Page } from '@playwright/test';

/* ------------------------------------------------------------------ */
/* WEB CUSTOMER FERIZY — dipakai untuk uji DAMPAK (side effect) CMS → web */
/* Dibuka sebagai pengunjung (tanpa sesi CMS). Hanya MEMBACA.          */
/* ------------------------------------------------------------------ */

export const FERIZY = process.env.FERIZY_URL ?? 'https://dev.asdpv2.garudakreasi.com';

/** Tanggal: hari ini + n hari (yyyy-mm-dd, waktu lokal). */
export const tglDepan = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Tab browser baru sebagai pengunjung web (tanpa cookie CMS). Jangan lupa `ctx.close()`. */
export async function bukaWeb(browser: Browser) {
  const ctx = await browser.newContext({ storageState: undefined });
  return { ctx, web: await ctx.newPage() };
}

export type Kartu = { teks: string; tersedia: number; jam: string; zona: string; kapal: string; jenis: string; harga: number };

/** Pecah teks kartu jadwal: "(208) RoPax Reguler 04.00 WITA … Estimasi 4 jam 30 menit KMP Surya 777 Estimasi tiba …". */
export function bacaKartu(teks: string): Kartu {
  const t = teks.replace(/\s+/g, ' ').trim();
  const jam = t.match(/\b(\d{2})\.(\d{2}) (WIB|WITA|WIT)\b/);
  const kapal = t.match(/Estimasi (?:\d+ (?:jam|menit) ?)+(.+?) Estimasi tiba/);
  return {
    teks: t,
    tersedia: Number(t.match(/^\((\d+)\)/)?.[1] ?? NaN),
    jam: jam ? `${jam[1]}:${jam[2]}` : '',
    zona: jam?.[3] ?? '',
    kapal: kapal?.[1]?.trim() ?? '',
    // "(208) RoPax Reguler 04.00 WITA …" → jenis kapal = teks antara "(N)" dan jam
    jenis: t.match(/^\(\d+\)\s*(.+?)\s+\d{2}\.\d{2} (?:WIB|WITA|WIT)/)?.[1]?.trim() ?? '',
    harga: Number((t.match(/Rp\s*([\d.]+)/)?.[1] ?? 'NaN').replace(/\./g, '')),
  };
}

/**
 * Buka hasil pencarian jadwal (asal/tujuan = id pelabuhan CMS) dan kembalikan semua kartu jadwal.
 * Satu kartu = potongan teks yang diawali "Tiket tersedia".
 */
export async function kartuFerizy(page: Page, asal: string, tujuan: string, tgl: string, pengguna?: 'kendaraan') {
  const q = new URLSearchParams({ asal, tujuan, tgl });
  if (pengguna) q.set('jenis', pengguna);
  await page.goto(`${FERIZY}/book/schedules?${q}`);
  const judul = page.getByRole('heading', { name: /Jadwal & Tiket Penyeberangan/ });
  // Rute yang tidak dikenal web → halaman "Mau berangkat ke mana?" (tanpa daftar jadwal) → anggap 0 jadwal
  await expect(judul.or(TIDAK_DIKENAL(page)).first()).toBeVisible({ timeout: 30_000 });
  if (!(await judul.isVisible())) return [];
  // tunggu daftar selesai dimuat: ada kartu, atau tidak ada kartu sama sekali setelah beberapa detik
  await page.getByText(/Tiket tersedia/).first().waitFor({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  const teks = await page.locator('main').innerText();
  return teks.split(/Tiket tersedia/).slice(1).map((k) => k.replace(/\s+/g, ' ').trim());
}

const TIDAK_DIKENAL = (page: Page) => page.getByText('Mau berangkat ke mana?');

/** Rute asal → tujuan dikenal web? (false = web menampilkan "Mau berangkat ke mana?" tanpa daftar jadwal) */
export async function ruteDikenalWeb(page: Page, asal: string, tujuan: string, tgl: string) {
  await page.goto(`${FERIZY}/book/schedules?${new URLSearchParams({ asal, tujuan, tgl })}`);
  const judul = page.getByRole('heading', { name: /Jadwal & Tiket Penyeberangan/ });
  await expect(judul.or(TIDAK_DIKENAL(page)).first()).toBeVisible({ timeout: 30_000 });
  return judul.isVisible();
}

/** Kartu jadwal yang sudah dipecah (lihat bacaKartu). */
export async function jadwalWeb(page: Page, asal: string, tujuan: string, tgl: string) {
  return (await kartuFerizy(page, asal, tujuan, tgl)).map(bacaKartu);
}

/** Opsi "Berangkat dari" di beranda web: [{ nama, kota }] (mis. { nama: 'LEMBAR', kota: 'Kab. Lombok Barat' }). */
export async function opsiAsalWeb(page: Page) {
  await page.goto(FERIZY + '/');
  const btn = page.getByRole('button', { name: 'Berangkat dari' });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await btn.click();
  const opsi = page.getByRole('listbox').getByRole('option');
  await expect(opsi.first()).toBeVisible({ timeout: 15_000 });
  const hasil: { nama: string; kota: string }[] = [];
  for (const o of await opsi.all()) {
    const nama = (await o.locator('strong').innerText()).trim();
    const semua = (await o.innerText()).replace(/\s+/g, ' ').trim();
    hasil.push({ nama, kota: semua.slice(nama.length).trim() });
  }
  await page.keyboard.press('Escape');
  return hasil;
}

export type GolonganWeb = { kode: string; nama: string; maks: number | null; grup: string };

/** Opsi "Golongan kendaraan" di beranda web (pilih "Kendaraan" dulu). */
export async function opsiGolonganWeb(page: Page): Promise<GolonganWeb[]> {
  await page.goto(FERIZY + '/');
  await expect(page.getByRole('radio', { name: 'Kendaraan' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('radio', { name: 'Kendaraan' }).click({ force: true });
  await page.getByRole('button', { name: 'Pilih golongan kendaraan' }).click();
  const lb = page.getByRole('listbox');
  await expect(lb.getByRole('option').first()).toBeVisible({ timeout: 15_000 });
  // teks listbox per baris: "<judul grup>", "<Nama> — Golongan <KODE>", "Maks. N penumpang. <deskripsi>", …
  const baris = (await lb.innerText()).split('\n').map((x) => x.trim()).filter(Boolean);
  const hasil: GolonganWeb[] = [];
  let grup = '';
  baris.forEach((b, i) => {
    const m = b.match(/^(.*) — Golongan (\S+)$/);
    if (m) {
      const maks = (baris[i + 1] ?? '').match(/^Maks\. (\d+) penumpang/);
      hasil.push({ nama: m[1].trim(), kode: m[2], maks: maks ? Number(maks[1]) : null, grup });
    } else if (/— Golongan/.test(baris[i + 1] ?? '') && !/^Maks\./.test(b) && !/^(.*) — Golongan/.test(baris[i - 1] ?? '')) {
      grup = b; // baris sebelum opsi yang bukan keterangan opsi sebelumnya = judul grup
    }
  });
  await page.keyboard.press('Escape');
  return hasil;
}

/** Pilihan "Penumpang" di beranda web: [{ nama, keterangan }] sesuai urutan tampil. */
export async function opsiPenumpangWeb(page: Page) {
  await page.goto(FERIZY + '/');
  const btn = page.getByRole('button', { name: /^Penumpang/ });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await btn.click();
  const dlg = page.getByRole('dialog', { name: 'Penumpang' });
  await expect(dlg.getByRole('button', { name: 'Selesai' })).toBeVisible({ timeout: 15_000 });
  const nama = (await dlg.locator('strong').allInnerTexts()).map((x) => x.trim());
  const baris = (await dlg.innerText()).split('\n').map((x) => x.trim()).filter(Boolean);
  const hasil = nama.map((n) => {
    const i = baris.indexOf(n);
    const ket = baris[i + 1] && !/^\d+$/.test(baris[i + 1]) && !nama.includes(baris[i + 1]) ? baris[i + 1] : '';
    return { nama: n, keterangan: ket };
  });
  await page.keyboard.press('Escape');
  return hasil;
}

/** Teks halaman web "Pelabuhan" (/outlets) — huruf kecil, spasi dirapikan. */
export async function teksPelabuhanWeb(page: Page) {
  await page.goto(FERIZY + '/outlets');
  await expect(page.getByText(/pelabuhan ditemukan/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ').toLowerCase();
}

/** Tunggu (maks ±1 menit) sampai `cek()` bernilai true — untuk memberi waktu sinkron CMS → web. */
export async function tungguSinkron(cek: () => Promise<boolean>, kali = 4, jeda = 15_000) {
  for (let i = 0; i < kali; i++) {
    if (await cek()) return true;
    if (i < kali - 1) await new Promise((r) => setTimeout(r, jeda));
  }
  return false;
}
