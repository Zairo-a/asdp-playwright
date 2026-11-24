import { test, expect } from '@playwright/test';
import { KategoriNotifPage, TemplateNotifPage, KirimNotifPage, TriggerNotifPage } from './pages/notifikasi.pages';
import { cekTemuan } from './pages/kapasitas.pages';

/**
 * MANAJEMEN NOTIFIKASI — READ-ONLY (Kategori, Template, Kirim Notifikasi, Trigger Otomatis)
 * Semua form dibuka lalu DITUTUP tanpa menyimpan. Tidak ada notifikasi yang dikirim.
 * ID: NT-0x/1x/2x (fungsi), NT-T0x (temuan)
 */

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

test.describe('Notifikasi — daftar', () => {
  test('[Positif] NT-01 4 halaman tampil dengan kolom yang benar', async ({ page }) => {
    const cek: [any, string[]][] = [
      [new KategoriNotifPage(page), ['Pilih semua', 'Kode', 'Nama', 'Deskripsi', 'Template', 'Status']],
      [new TemplateNotifPage(page), ['Kode', 'Nama', 'Kategori', 'Kanal', 'Status', 'Diubah']],
      [new KirimNotifPage(page), ['Nama', 'Template', 'Kanal', 'Penerima', 'Jadwal', 'Status']],
      [new TriggerNotifPage(page), ['Pilih semua', 'Event', 'Template', 'Kanal', 'Penerima', 'Delay', 'Status']],
    ];
    for (const [p, kolom] of cek) {
      await p.goto();
      for (const b of [p.cari, p.btnFilter, p.btnTampilan, p.btnTambah]) await expect(b).toBeVisible();
      const h = (await p.tabel.locator('thead th').allInnerTexts()).map((x: string) => x.trim()).filter((x: string) => x && x !== 'Aksi');
      expect(h.filter((x: string) => x !== 'Pilih semua'), `kolom ${p.path}`).toEqual(kolom.filter((x) => x !== 'Pilih semua'));
    }
  });

  test('[Negatif] NT-02 cari kata yang tidak ada → 0 data & pesan "tidak/belum ada … cocok" di 4 halaman', async ({ page }) => {
    for (const p of [new KategoriNotifPage(page), new TemplateNotifPage(page), new KirimNotifPage(page), new TriggerNotifPage(page)]) {
      await p.goto();
      await p.cariData('ZZQATIDAKADA');
      await expect.poll(() => p.totalData(), { timeout: 15_000 }).toBe(0);
      await expect(p.tabel).toContainText(/(Belum|Tidak) ada .* cocok/i);
    }
  });

  test('[Positif] NT-03 Filter Kirim Notifikasi berisi status Draft/Terjadwal/Berjalan/Dijeda/Selesai/Dibatalkan', async ({ page }) => {
    const p = new KirimNotifPage(page);
    await p.goto();
    await p.btnFilter.click();
    await expect(p.popover).toBeVisible();
    for (const s of ['Draft', 'Terjadwal', 'Berjalan', 'Dijeda', 'Selesai', 'Dibatalkan']) await expect(p.popover).toContainText(s);
    await page.keyboard.press('Escape');
  });
});

test.describe('Notifikasi — validasi form Kategori', () => {
  test('[Negatif] NT-04 Simpan form kosong → Kode & Nama "Wajib diisi"', async ({ page }) => {
    const p = new KategoriNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.klikSimpan();
    await expect.poll(() => p.pesan()).toEqual(['Wajib diisi']);
    await expect(p.kode).toHaveAttribute('aria-invalid', 'true');
    await expect(p.nama).toHaveAttribute('aria-invalid', 'true');
    await p.batalForm('Batal');
  });

  test('[Negatif] NT-05 kode berisi tanda hubung/spasi → "Huruf besar, angka, atau garis bawah"; huruf kecil otomatis jadi besar', async ({ page }) => {
    const p = new KategoriNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'qa-x 1', nama: 'QA tidak disimpan' });
    await expect(p.kode).toHaveValue('QA-X 1');
    await p.klikSimpan();
    await expect.poll(() => p.pesan()).toContain('Huruf besar, angka, atau garis bawah');
    await expect(p.form).toBeVisible();
    await p.batalForm('Batal');
  });

  test('[Edge] NT-06 kode 26 karakter → dibatasi 20 karakter di kolom (form TIDAK disimpan)', async ({ page }) => {
    const p = new KategoriNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.kode.fill('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect((await p.kode.inputValue()).length).toBeLessThanOrEqual(20);
    await p.batalForm('Batal');
  });

  test('[Negatif] NT-07 tutup form yang sudah diisi (X) → form tertutup, data tidak tersimpan', async ({ page }) => {
    const p = new KategoriNotifPage(page);
    await p.goto();
    const awal = await p.totalData();
    await p.bukaTambah();
    await p.isi({ kode: 'QAZBATAL', nama: 'QA batal' });
    await p.batalForm('Close');
    await p.goto();
    expect(await p.totalData()).toBe(awal);
  });
});

test.describe('Notifikasi — validasi form Template', () => {
  test('[Negatif] NT-10 Simpan form kosong → Kode (min. 3), Nama & Isi wajib diisi', async ({ page }) => {
    const p = new TemplateNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.klikSimpan();
    await expect.poll(() => p.pesan()).toEqual(expect.arrayContaining(['Huruf besar, angka, atau tanda hubung (min. 3)', 'Wajib diisi']));
    await expect(p.isiPesan).toHaveAttribute('aria-invalid', 'true');
    await p.batalForm('Batal');
  });

  test('[Edge] NT-11 kode 2 karakter "NT" → ditolak (min. 3); kode huruf kecil otomatis jadi besar', async ({ page }) => {
    const p = new TemplateNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.kode.fill('ntf-qa');
    await expect(p.kode).toHaveValue('NTF-QA');
    await p.isi({ kode: 'NT', nama: 'QA tidak disimpan', isi: 'Halo' });
    await p.klikSimpan();
    await expect.poll(() => p.pesan()).toContain('Huruf besar, angka, atau tanda hubung (min. 3)');
    await p.batalForm('Batal');
  });

  test('[Negatif] NT-12 Isi memakai placeholder yang tidak ada di daftar → "Placeholder tidak dikenal: {salah}"', async ({ page }) => {
    const p = new TemplateNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ kode: 'NTF-QAZ', nama: 'QA tidak disimpan', isi: 'Halo {nama} {salah}' });
    await p.klikSimpan();
    await expect.poll(() => p.pesan()).toContain('Placeholder tidak dikenal: {salah}');
    await expect(p.form).toBeVisible();
    await p.batalForm('Batal');
  });

  test('[Positif] NT-13 tombol Sisipkan {rute} masuk ke Isi & Pratinjau mengganti dengan data contoh', async ({ page }) => {
    const p = new TemplateNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.isi({ judul: 'QA Judul', isi: 'Rute ' });
    await p.sisip('{rute}').click();
    await expect(p.isiPesan).toHaveValue(/Rute \{rute\}/);
    await expect(p.pratinjau).toContainText('QA Judul');
    await expect(p.pratinjau).toContainText('Rute MRK-BKH');
    await p.batalForm('Batal');
  });

  test('[Positif] NT-14 pilihan Kanal: Push, In-App, Email, SMS, WhatsApp, Pop-up, Carousel', async ({ page }) => {
    const p = new TemplateNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    expect(await p.opsi(p.kanal)).toEqual(['Push', 'In-App', 'Email', 'SMS', 'WhatsApp', 'Pop-up', 'Carousel']);
    await p.batalForm('Batal');
  });

  test('[Temuan] NT-T03 tanggal di Pratinjau = hari ini (bukan tanggal tetap)', async ({ page }) => {
    const p = new TemplateNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    const d = new Date();
    const hariIni = `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
    const teks = (await p.pratinjau.innerText()).replace(/\s+/g, ' ');
    const tampil = teks.match(/(Minggu|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu), \d+ \w+/)?.[0] ?? '(tidak ada tanggal)';
    await cekTemuan(page, {
      id: 'NT-T03',
      judul: 'Pratinjau template menampilkan tanggal tetap, bukan tanggal hari ini [minor]',
      langkah: ['CMS → Notifikasi → Template → Tambah', 'Lihat panel Pratinjau (tampilan layar HP)'],
      ekspektasi: `Tanggal di pratinjau = hari ini (${hariIni})`,
      aktual: `Tanggal di pratinjau: "${tampil}"`,
      cek: async () => expect(tampil).toBe(hariIni),
      fokus: p.pratinjau,
    });
    await p.batalForm('Batal');
  });
});

test.describe('Notifikasi — validasi Kirim Notifikasi & Trigger', () => {
  test('[Negatif] NT-20 Kirim Notifikasi langkah 1 kosong → Berikutnya ditolak: nama wajib, pilih template, pilih kanal', async ({ page }) => {
    const p = new KirimNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await expect(p.form.getByText('1/4', { exact: true })).toBeVisible();
    await p.berikutnya();
    await expect.poll(() => p.pesan()).toEqual(expect.arrayContaining(['Wajib diisi', 'Pilih template', 'Pilih minimal satu kanal']));
    await expect(p.form.getByText('1/4', { exact: true })).toBeVisible();
    await expect(p.form.getByRole('link', { name: 'Buat template baru' })).toHaveAttribute('href', /\/notification-templates/);
    await p.batalForm('Batal');
  });

  test('[Negatif] NT-21 Trigger kosong → Simpan ditolak: pilih event, pilih template, pilih kanal', async ({ page }) => {
    const p = new TriggerNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await expect(p.aktif).toHaveAttribute('aria-checked', 'true');
    await expect(p.delay).toHaveValue('0');
    await p.klikSimpan();
    await expect.poll(() => p.pesan()).toEqual(expect.arrayContaining(['Pilih event', 'Pilih template', 'Pilih minimal satu kanal']));
    await p.batalForm('Batal');
  });

  test('[Edge] NT-22 Delay 10081 menit → "Isi 0–10080 menit"; 10080 diterima (tanpa pesan delay)', async ({ page }) => {
    const p = new TriggerNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.delay.fill('10081');
    await p.klikSimpan();
    await expect.poll(() => p.pesan()).toContain('Isi 0–10080 menit');
    await p.delay.fill('10080');
    await p.klikSimpan();
    await expect.poll(() => p.pesan()).not.toContain('Isi 0–10080 menit');
    await p.batalForm('Close');
  });

  test('[Edge] NT-23 Delay negatif "-5" → tidak diterima sebagai -5', async ({ page }) => {
    const p = new TriggerNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.delay.fill('-5').catch(() => {});
    await p.klikSimpan();
    const v = await p.delay.inputValue();
    const pesan = await p.pesan();
    expect(v === '-5' ? pesan.includes('Isi 0–10080 menit') : true, `nilai "${v}", pesan ${pesan.join(' / ')}`).toBe(true);
    await p.batalForm('Close');
  });

  test('[Temuan] NT-T04 event "(belum tersedia)" seharusnya tidak bisa dipilih', async ({ page }) => {
    const p = new TriggerNotifPage(page);
    await p.goto();
    await p.bukaTambah();
    await p.event.click();
    const opsi = page.getByRole('option', { name: /belum tersedia/i });
    await expect(page.getByRole('option').first()).toBeVisible();
    const n = await opsi.count();
    test.skip(n === 0, 'Tidak ada event "(belum tersedia)"');
    const aktif: string[] = [];
    for (const o of await opsi.all()) {
      const dis = (await o.getAttribute('aria-disabled')) === 'true' || (await o.getAttribute('data-disabled')) !== null;
      if (!dis) aktif.push((await o.innerText()).trim());
    }
    await cekTemuan(page, {
      id: 'NT-T04',
      judul: 'Event Trigger yang "(belum tersedia)" tetap bisa dipilih',
      langkah: ['CMS → Notifikasi → Trigger Otomatis → Tambah', 'Buka pilihan Event'],
      ekspektasi: 'Event bertanda "(belum tersedia)" nonaktif / tidak bisa dipilih',
      aktual: `Bisa dipilih: ${aktif.join(', ')}`,
      cek: async () => expect(aktif).toEqual([]),
      fokus: opsi.first(),
    });
    await page.keyboard.press('Escape');
    await p.batalForm('Close');
  });
});

test.describe('Notifikasi — draft Kirim Notifikasi (baca saja)', () => {
  test('[Temuan] NT-T01 draft Kirim Notifikasi seharusnya bisa dihapus/dibatalkan', async ({ page }) => {
    const p = new KirimNotifPage(page);
    await p.goto();
    const draft = p.rows.filter({ hasText: 'Draft' });
    test.skip((await draft.count()) === 0, 'Tidak ada draft di daftar');
    const nama = (await draft.first().locator('td').first().innerText()).trim();
    const menu = await p.menuBaris(nama);
    await cekTemuan(page, {
      id: 'NT-T01',
      judul: 'Draft Kirim Notifikasi tidak bisa dihapus / dibatalkan (menu hanya "Lanjutkan" & "Duplikat")',
      langkah: ['CMS → Notifikasi → Kirim Notifikasi → Tambah → isi → "Simpan draft"', `Daftar → baris draft "${nama}" → Buka menu`],
      ekspektasi: 'Ada aksi "Hapus" atau "Batalkan" untuk draft yang tidak jadi dikirim',
      aktual: `Menu: ${menu.join(', ')} (API DELETE → 405 "Method not allowed")`,
      cek: async () => expect(menu.some((m) => /Hapus|Batal/i.test(m))).toBe(true),
      fokus: p.menu,
    });
    await page.keyboard.press('Escape');
  });

  test('[Temuan] NT-T02 template yang masih dipakai draft seharusnya tidak bisa dihapus', async ({ page }) => {
    const p = new KirimNotifPage(page);
    await p.goto();
    const yatim = p.rows.filter({ hasText: 'Draft' }).filter({ has: page.locator('td:nth-child(2)', { hasText: /^—$/ }) });
    const n = await yatim.count();
    test.skip((await p.rows.filter({ hasText: 'Draft' }).count()) === 0, 'Tidak ada draft di daftar');
    const nama = n ? (await yatim.first().locator('td').first().innerText()).trim() : '';
    await cekTemuan(page, {
      id: 'NT-T02',
      judul: 'Template yang masih dipakai draft Kirim Notifikasi bisa dihapus → draft kehilangan template ("—")',
      langkah: ['Buat Template → Kirim Notifikasi → pilih template itu → "Simpan draft"', 'Template → hapus template tersebut (berhasil)', 'Kirim Notifikasi → lihat kolom Template draft'],
      ekspektasi: 'Template yang dipakai draft/kampanye ditolak saat dihapus (atau draft ikut ditandai tidak valid)',
      aktual: `${n} draft tanpa template ("—")${nama ? `, mis. "${nama}"` : ''}`,
      cek: async () => expect(n).toBe(0),
      fokus: yatim.first(),
    });
  });
});
