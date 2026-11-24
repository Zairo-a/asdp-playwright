import { expect, type Locator, type Page } from '@playwright/test';

/* ------------------------------------------------------------------ */
/* TARIF DASAR — tab "Tarif Dasar" di detail rute (/routes/{id}/schedules?tab=tarif) */
/*   atau menu /tariff-fares (pilih rute dulu).                         */
/*   Sub-tab: Pejalan Kaki | Kendaraan | Barang                         */
/*   Tabel 1 = segmen (Kelengkapan tarif: "N sel belum diisi")          */
/*   Tabel 2 = matriks; sel = textbox "Kategori · KELAS · Jenis kapal · OFFLINE|ONLINE" */
/* RIWAYAT PERUBAHAN TARIF — /tariff-change-sets (versi #N, detail, Rollback) */
/* ------------------------------------------------------------------ */

export const angka = (s: string) => Number(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
export const rupiah = (n: number) => n.toLocaleString('id-ID');

export class TarifDasarPage {
  readonly panel: Locator;
  readonly toast: Locator;
  constructor(readonly page: Page) {
    this.panel = page.getByRole('tabpanel', { name: 'Tarif Dasar' });
    this.toast = page.locator('[data-sonner-toast]');
  }
  /** Tombol "Simpan" — setelah ada isian berubah jadi "Simpan (N perubahan)". */
  get btnSimpan() { return this.panel.getByRole('button', { name: /^Simpan( \(\d+ perubahan\))?$/ }); }
  /** Jumlah perubahan yang belum disimpan (dari label tombol Simpan). */
  async jumlahPerubahan() { return Number((await this.btnSimpan.innerText()).match(/\((\d+) perubahan\)/)?.[1] ?? 0); }
  get btnUnduh() { return this.panel.getByRole('button', { name: 'Unduh Template' }); }
  get tabelSegmen() { return this.panel.locator('table').first(); }
  get matriks() { return this.panel.locator('table').last(); }
  tab(nama: 'Pejalan Kaki' | 'Kendaraan' | 'Barang') { return this.panel.getByRole('tab', { name: nama, exact: true }); }
  sel(nama: string) { return this.panel.getByRole('textbox', { name: nama, exact: true }); }

  /** Buka tab Tarif Dasar rute (id) dan tunggu matriks tampil. */
  async buka(routeId: string | number) {
    await this.page.goto(`/routes/${routeId}/schedules?tab=tarif`);
    await expect(this.panel).toBeVisible({ timeout: 30_000 });
    await expect(this.matriks).toBeVisible({ timeout: 30_000 });
    await this.page.waitForTimeout(1_500);
  }
  async pilihTab(nama: 'Pejalan Kaki' | 'Kendaraan' | 'Barang') {
    await this.tab(nama).click();
    await expect(this.tab(nama)).toHaveAttribute('aria-selected', 'true');
    await this.page.waitForTimeout(2_000);
  }
  /** Semua sel matriks: { nama, nilai } (nilai angka, 0 = kosong). */
  async semuaSel() {
    return this.panel.getByRole('textbox').evaluateAll((els) =>
      els.map((e) => ({ nama: e.getAttribute('aria-label') ?? '', teks: (e as HTMLInputElement).value })),
    ).then((x) => x.filter((s) => s.nama.includes(' · ')).map((s) => ({ nama: s.nama, teks: s.teks, nilai: Number(s.teks.replace(/\./g, '').replace(',', '.')) || 0 })));
  }
  /** "N sel belum diisi" di tabel segmen (0 kalau lengkap, -1 kalau "Belum ada tarif"). */
  async selBelumDiisi() {
    const t = (await this.tabelSegmen.innerText()).replace(/\s+/g, ' ');
    if (/Belum ada tarif/i.test(t)) return -1;
    const m = t.match(/(\d+) sel belum diisi/);
    return m ? Number(m[1]) : 0;
  }
  /** Teks kolom pertama tiap baris matriks (nama kategori/golongan/barang, tanpa keterangan). */
  async namaBaris() {
    return (await this.matriks.locator('tbody tr td:first-child').allInnerTexts())
      .map((x) => x.split('\n')[0].trim())
      .filter((x) => x && !/^(BISNIS|EKONOMI|EKSEKUTIF|VIP|QA VIP|TESS|REGULER)$/.test(x));
  }
  /** Judul kolom jenis kapal di matriks. */
  async jenisKolom() {
    const h = (await this.matriks.locator('thead tr').first().locator('th').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    return h.filter((x) => !/^(Kategori penumpang|Golongan kendaraan|Jenis barang|Satuan|Tarif \(Rp\)|.*Kelas layanan.*|Pilih semua sel)$/i.test(x));
  }

  /** Simpan perubahan: Simpan → (dialog konfirmasi/catatan bila ada) → toast. Mengembalikan teks toast. */
  async simpan(catatan = 'QA automation') {
    await this.btnSimpan.click();
    const dlg = this.page.locator('[role=alertdialog], [role=dialog]').filter({ has: this.page.getByRole('button', { name: /^(Simpan|Terapkan|Ya.*|Kirim|Ajukan|Lanjutkan)$/ }) }).last();
    if (await dlg.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true, () => false)) {
      const area = dlg.locator('textarea');
      if (await area.count()) await area.first().fill(catatan);
      await dlg.getByRole('button', { name: /^(Simpan|Terapkan|Ya.*|Kirim|Ajukan|Lanjutkan)$/ }).last().click();
    }
    const t = this.toast.first();
    await expect(t).toBeVisible({ timeout: 20_000 });
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }
}

export class RiwayatTarifPage {
  readonly tabel: Locator;
  readonly toast: Locator;
  constructor(readonly page: Page) {
    this.tabel = page.locator('main table').first();
    this.toast = page.locator('[data-sonner-toast]');
  }
  async buka() {
    await this.page.goto('/tariff-change-sets');
    await expect(this.page.getByRole('heading', { name: 'Riwayat Perubahan Tarif' })).toBeVisible({ timeout: 30_000 });
    await expect(this.tabel.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
  }
  /** Baris versi: { versi, teks } dari atas (terbaru dulu). */
  async daftar() {
    const rows = this.tabel.locator('tbody tr');
    const hasil: { versi: number; teks: string }[] = [];
    for (const r of await rows.all()) {
      const t = (await r.innerText()).replace(/\s+/g, ' ').trim();
      const m = t.match(/#(\d+)/);
      if (m) hasil.push({ versi: Number(m[1]), teks: t });
    }
    return hasil;
  }
  baris(versi: number) { return this.tabel.locator('tbody tr').filter({ has: this.page.getByRole('button', { name: `Buka detail versi #${versi}`, exact: true }) }); }
  /** Buka detail versi → teks dialog (dialog ditutup lagi). */
  async detail(versi: number) {
    await this.page.getByRole('button', { name: `Buka detail versi #${versi}`, exact: true }).click();
    const d = this.page.getByRole('dialog', { name: `Detail versi #${versi}` });
    await expect(d).toBeVisible();
    await expect(d.getByRole('table')).toBeVisible({ timeout: 15_000 });
    const teks = (await d.innerText()).replace(/\s+/g, ' ');
    await d.getByRole('button', { name: 'Close' }).click();
    await expect(d).toBeHidden();
    return teks;
  }
  /** Klik Rollback pada versi → konfirmasi → teks toast. */
  async rollback(versi: number) {
    await this.baris(versi).getByRole('button', { name: 'Rollback' }).click();
    const dlg = this.page.locator('[role=alertdialog], [role=dialog]').filter({ has: this.page.getByRole('button', { name: /^(Rollback|Ya.*|Lanjutkan|Kembalikan)$/ }) }).last();
    await expect(dlg).toBeVisible({ timeout: 5_000 });
    const area = dlg.locator('textarea');
    if (await area.count()) await area.first().fill('QA automation rollback');
    await dlg.getByRole('button', { name: /^(Rollback|Ya.*|Lanjutkan|Kembalikan)$/ }).last().click();
    const t = this.toast.first();
    await expect(t).toBeVisible({ timeout: 20_000 });
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }
}

/* ---------------- API bantu (baca) — versi tarif terbaru ---------------- */
/** Versi tarif terbaru dari API: { id, source, status, summary, applied_at } (atau null). */
export async function versiTerbaru(request: import('@playwright/test').APIRequestContext) {
  const r = await request.fetch('/api/proxy/cms/tariff/rates/versions?page=1&limit=5', { headers: { Accept: 'application/json' } });
  const items: any[] = ((await r.json().catch(() => null)) as any)?.result?.items ?? [];
  return items.sort((a, b) => b.id - a.id)[0] ?? null;
}

/** Buka Riwayat dan muat ulang sampai baris versi `versi` tampil (daftar kadang terlambat ter-refresh). */
export async function bukaRiwayatSampaiAda(r: RiwayatTarifPage, versi: number) {
  await expect(async () => {
    await r.buka();
    await expect(r.baris(versi)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
}
