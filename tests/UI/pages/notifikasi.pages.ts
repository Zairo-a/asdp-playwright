import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { MasterDataPage } from './master-data.pages';

/* ------------------------------------------------------------------ */
/* MANAJEMEN NOTIFIKASI (grup menu "Notifikasi")                       */
/*   Kategori           /notification-categories  (Kode | Nama | Deskripsi | Template | Status)  */
/*   Template           /notification-templates   (Kode | Nama | Kategori | Kanal | Status | Diubah) */
/*   Kirim Notifikasi   /notification-campaigns   (Nama | Template | Kanal | Penerima | Jadwal | Status) */
/*   Trigger Otomatis   /notification-triggers    (Event | Template | Kanal | Penerima | Delay | Status) */
/* Rantai: Kategori (aktif) → Template (aktif) → Kirim Notifikasi / Trigger                         */
/* CATATAN AMAN: draft Kirim Notifikasi TIDAK BISA DIHAPUS (menu hanya Lanjutkan/Duplikat, API 405) */
/*   → automation TIDAK PERNAH menekan "Simpan draft" / "Konfirmasi Kirim".                         */
/* ------------------------------------------------------------------ */

export const unik = () => String(Date.now()).slice(-5);

class NotifPage extends MasterDataPage {
  /** Pesan validasi (role=alert) di form, unik. */
  async pesan() {
    const t = (await this.form.getByRole('alert').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    return [...new Set(t)];
  }
  barisTeks(teks: string) { return this.rows.filter({ hasText: teks }); }
  async bukaTambah() {
    await this.btnTambah.click();
    await expect(this.form).toBeVisible();
    await this.page.waitForTimeout(500);
  }
  async klikSimpan() { await this.btnForm('Simpan').click(); }
  /** Simpan → teks toast (atau pesan form kalau tidak ada toast). */
  async simpan(): Promise<string> {
    await this.klikSimpan();
    const t = this.toast.first();
    const muncul = await t.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
    if (!muncul) return `Tidak ada toast; pesan form: "${(await this.pesan()).join(' / ')}"`;
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }
  /** Pilih opsi pada combobox (Radix Select / popover). */
  async pilihOpsi(cb: Locator, opsi: string | RegExp) {
    await expect(async () => {
      if (!(await this.page.getByRole('option').first().isVisible())) await cb.click();
      await expect(this.page.getByRole('option').first()).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await this.page.getByRole('option', { name: opsi }).first().click();
    await this.page.waitForTimeout(400);
  }
  /** Daftar opsi combobox (popover ditutup lagi dengan Escape). */
  async opsi(cb: Locator) {
    await expect(async () => {
      if (!(await this.page.getByRole('option').first().isVisible())) await cb.click();
      await expect(this.page.getByRole('option').first()).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 }).catch(() => {});
    const o = (await this.page.getByRole('option').allInnerTexts()).map((x) => x.trim());
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('option')).toHaveCount(0, { timeout: 3_000 }).catch(() => {});
    return o;
  }
  async menuBaris(teks: string) {
    await this.barisTeks(teks).first().getByRole('button', { name: 'Buka menu' }).click();
    await expect(this.menu).toBeVisible();
    const items = (await this.menu.getByRole('menuitem').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    return items;
  }
  async aksiBaris(teks: string, item: string | RegExp) {
    await this.menuBaris(teks);
    await this.menu.getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item }).click();
  }
  /** Hapus lewat menu baris → { dialog, toast }. */
  async hapusBaris(teks: string) {
    await this.aksiBaris(teks, 'Hapus');
    await expect(this.konfirmasi).toBeVisible();
    const dialog = (await this.konfirmasi.innerText()).replace(/\s+/g, ' ');
    await this.konfirmasi.getByRole('button', { name: 'Hapus', exact: true }).click();
    const t = this.toast.first();
    await expect(t).toBeVisible({ timeout: 15_000 });
    return { dialog, toast: (await t.innerText()).replace(/\s+/g, ' ').trim() };
  }
  /** Nonaktifkan / Aktifkan lewat menu baris (konfirmasi opsional) → teks toast. */
  async ubahStatus(teks: string, aktif: boolean) {
    await this.aksiBaris(teks, aktif ? 'Aktifkan' : 'Nonaktifkan');
    if (await this.konfirmasi.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)) {
      await this.konfirmasi.getByRole('button', { name: aktif ? /^(Aktifkan|Ya.*)$/ : /^(Nonaktifkan|Ya.*)$/ }).click();
    }
    const t = this.toast.first();
    await expect(t).toBeVisible({ timeout: 15_000 });
    return (await t.innerText()).replace(/\s+/g, ' ').trim();
  }
}

export class KategoriNotifPage extends NotifPage {
  constructor(page: Page) { super(page, '/notification-categories', 'Kategori'); }
  get kode() { return this.form.getByRole('textbox', { name: 'Kode', exact: true }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama', exact: true }); }
  get deskripsi() { return this.form.getByRole('textbox', { name: 'Deskripsi', exact: true }); }
  get aktif() { return this.form.getByRole('switch', { name: 'Aktif' }); }
  async isi(d: { kode?: string; nama?: string; deskripsi?: string }) {
    if (d.kode !== undefined) await this.kode.fill(d.kode);
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.deskripsi !== undefined) await this.deskripsi.fill(d.deskripsi);
  }
}

export class TemplateNotifPage extends NotifPage {
  constructor(page: Page) { super(page, '/notification-templates', 'Template'); }
  get kode() { return this.form.getByRole('textbox', { name: 'Kode', exact: true }); }
  get nama() { return this.form.getByRole('textbox', { name: 'Nama', exact: true }); }
  get kategori() { return this.form.getByRole('combobox', { name: 'Kategori' }); }
  get kanal() { return this.form.getByRole('combobox', { name: 'Kanal' }); }
  get judulPesan() { return this.form.getByRole('textbox', { name: 'Judul', exact: true }); }
  get isiPesan() { return this.form.getByRole('textbox', { name: 'Isi', exact: true }); }
  get pratinjau() { return this.form.getByRole('complementary', { name: 'Pratinjau' }); }
  sisip(ph: string) { return this.form.getByRole('button', { name: ph, exact: true }); }
  async isi(d: { kode?: string; nama?: string; kategori?: string | RegExp; judul?: string; isi?: string }) {
    if (d.kategori !== undefined) await this.pilihOpsi(this.kategori, d.kategori);
    if (d.kode !== undefined) await this.kode.fill(d.kode);
    if (d.nama !== undefined) await this.nama.fill(d.nama);
    if (d.judul !== undefined) await this.judulPesan.fill(d.judul);
    if (d.isi !== undefined) await this.isiPesan.fill(d.isi);
  }
}

export class KirimNotifPage extends NotifPage {
  constructor(page: Page) { super(page, '/notification-campaigns', 'Kirim Notifikasi'); }
  get namaNotif() { return this.form.getByRole('textbox', { name: 'Nama notifikasi' }); }
  get template() { return this.form.getByRole('combobox', { name: 'Template' }); }
  /** Tombol berbahaya — TIDAK PERNAH diklik oleh automation. */
  get btnKirim() { return this.form.getByRole('button', { name: 'Konfirmasi Kirim' }); }
  get btnDraft() { return this.form.getByRole('button', { name: 'Simpan draft' }); }
  async berikutnya() {
    await this.form.getByRole('button', { name: 'Berikutnya', exact: true }).click();
    await this.page.waitForTimeout(800);
  }
}

export class TriggerNotifPage extends NotifPage {
  constructor(page: Page) { super(page, '/notification-triggers', 'Trigger Otomatis'); }
  get event() { return this.form.getByRole('combobox', { name: 'Event' }); }
  get template() { return this.form.getByRole('combobox', { name: 'Template' }); }
  get role() { return this.form.getByRole('combobox', { name: 'Role penerima' }); }
  get delay() { return this.form.getByRole('spinbutton', { name: 'Delay' }); }
  get aktif() { return this.form.getByRole('switch', { name: 'Trigger aktif' }); }
  penerima(nama: RegExp) { return this.form.getByRole('radio', { name: nama }); }
}

/* ---------------- API bantu — baca & bersihkan data uji QA ---------------- */
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = '/api/proxy/cms/notifications-management';
type Jenis = 'categories' | 'templates' | 'triggers' | 'campaigns';

export async function barisNotif(request: APIRequestContext, jenis: Jenis, cari = ''): Promise<any[]> {
  const r = await request.fetch(`${BASE}/${jenis}?page=1&limit=100${cari ? `&search=${encodeURIComponent(cari)}` : ''}`, { headers: H });
  const j: any = await r.json().catch(() => null);
  return j?.result?.content?.[0]?.rows ?? [];
}

/** Hapus data uji QA: trigger (template QA) → template (kode awalan) → kategori (kode awalan). Draft kampanye tidak bisa dihapus. */
export async function bersihkanNotifQA(request: APIRequestContext, awalanKat: string, awalanTpl: string) {
  const del = async (jenis: Jenis, ids: number[]) => {
    if (!ids.length) return;
    await request.fetch(`${BASE}/${jenis}/action`, { method: 'POST', headers: H, data: JSON.stringify({ action: 'delete', ids }) });
  };
  const trg = (await barisNotif(request, 'triggers')).filter((x) => JSON.stringify(x).includes(awalanTpl));
  await del('triggers', trg.map((x) => x.id));
  const tpl = (await barisNotif(request, 'templates')).filter((x) => String(x.code ?? '').startsWith(awalanTpl));
  await del('templates', tpl.map((x) => x.id));
  const kat = (await barisNotif(request, 'categories')).filter((x) => String(x.code ?? '').startsWith(awalanKat));
  await del('categories', kat.map((x) => x.id));
  const sisa = [
    ...(await barisNotif(request, 'triggers')).filter((x) => JSON.stringify(x).includes(awalanTpl)),
    ...(await barisNotif(request, 'templates')).filter((x) => String(x.code ?? '').startsWith(awalanTpl)),
    ...(await barisNotif(request, 'categories')).filter((x) => String(x.code ?? '').startsWith(awalanKat)),
  ];
  return sisa.length;
}
