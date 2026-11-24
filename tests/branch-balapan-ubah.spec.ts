import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

// Semua data uji berkode AUTO... dengan nama berawalan AUTO. Hanya yang seperti itu yang boleh dihapus.
const PREFIX = 'AUTO';
const runId = Date.now().toString(36).toUpperCase().slice(-3);
let urut = 0;
const kodeBaru = () => `${PREFIX}${runId}${String(++urut).padStart(2, '0')}`;

// Pelabuhan yang terbukti tidak punya rute aktif (cabang uji bisa dihapus)
const PELABUHAN_AMAN = [3, 5, 6];
const URL_CABANG = 'cms/branches';

const jeda = (ms: number) => new Promise((s) => setTimeout(s, ms));

type Hdr = Record<string, string>;

async function baca(r: any) {
  try { return await r.json(); } catch { return undefined; }
}

async function auth(request: APIRequestContext): Promise<Hdr> {
  return { Authorization: `Bearer ${await getToken(request)}`, Accept: 'application/json' };
}

// GET boleh diulang kalau koneksi diputus server
async function ambil(request: APIRequestContext, url: string, headers: Hdr, params?: any) {
  let galat: any;
  for (let i = 0; i < 3; i++) {
    try {
      return await request.get(url, { headers, params });
    } catch (e) {
      galat = e;
      await jeda(1000);
    }
  }
  throw galat;
}

async function daftar(request: APIRequestContext, headers: Hdr, pairs: [string, any][] = []) {
  const p = new URLSearchParams();
  p.append('limit', '100');
  for (const [k, v] of pairs) p.append(k, String(v));
  const r = await ambil(request, URL_CABANG, headers, p);
  const b = await baca(r);
  const blok = b?.result?.content?.[0];
  return { rows: (blok?.rows ?? []) as any[] };
}

// Data uji: kode DAN nama sama-sama berawalan AUTO
const uji = (x: any) =>
  String(x.code).toUpperCase().startsWith(PREFIX) && String(x.name).toUpperCase().startsWith('AUTO');

// Satu POST tanpa pengulangan. Status 0 berarti koneksi terputus.
async function kirimSatu(request: APIRequestContext, headers: Hdr, data: any): Promise<number> {
  try {
    const r = await request.post(URL_CABANG, { headers, data });
    return r.status();
  } catch {
    return 0;
  }
}

async function hapusIds(request: APIRequestContext, headers: Hdr, ids: string[]): Promise<number> {
  try {
    const r = await request.post(`${URL_CABANG}/action`, { headers, data: { action: 'delete', ids } });
    return r.status();
  } catch {
    return 0;
  }
}

// Semua baris data uji dengan kode itu (bisa lebih dari satu kalau ada cabang kembar)
async function barisUji(request: APIRequestContext, headers: Hdr, kode: string) {
  const { rows } = await daftar(request, headers, [['search', kode]]);
  return rows.filter((x) => String(x.code).toUpperCase() === kode.toUpperCase() && uji(x));
}

async function hapusKode(request: APIRequestContext, headers: Hdr, kode: string): Promise<string> {
  if (!kode.toUpperCase().startsWith(PREFIX)) {
    throw new Error(`Hanya kode berawalan ${PREFIX} yang boleh dihapus: ${kode}`);
  }
  for (let i = 0; i < 3; i++) {
    const ada = await barisUji(request, headers, kode);
    if (!ada.length) return 'terhapus';
    const ids = [...new Set(ada.map((x) => String(x.id)))];
    await hapusIds(request, headers, ids);
    await jeda(300);
  }
  const sisa = (await barisUji(request, headers, kode)).length;
  return sisa ? `gagal, masih ada ${sisa} baris` : 'terhapus';
}

// [jumlah permintaan bersamaan, jumlah putaran]
const rencana: [number, number][] = [[2, 6], [5, 4]];

test.describe('cabang balapan (MENGUBAH DATA)', () => {
  test.skip(process.env.ALLOW_WRITE !== '1', 'Dilewati. Untuk menjalankan, set ALLOW_WRITE=1');
  test.describe.configure({ retries: 0 });

  test('permintaan bersamaan dengan kode yang sama tidak boleh membuat cabang kembar', async ({ request }) => {
    test.setTimeout(240_000);
    const headers = await auth(request);
    const dibuat: string[] = [];
    let kembar = 0;
    let total = 0;
    try {
      for (const [jumlah, ulang] of rencana) {
        for (let i = 1; i <= ulang; i++) {
          const data = {
            code: kodeBaru(), name: 'AUTO balapan', company_code: 'GKM',
            is_active: 1, port_ids: [PELABUHAN_AMAN[0]],
          };
          const kode = String(data.code);
          dibuat.push(kode);

          const status = await Promise.all(
            Array.from({ length: jumlah }, () => kirimSatu(request, headers, data)),
          );
          await jeda(300);
          const baris = await barisUji(request, headers, kode);
          total++;
          const dobel = baris.length > 1;
          if (dobel) kembar++;
          console.log(
            `[${jumlah} permintaan bersamaan, putaran ${i}] status ${status.join(', ')} | cabang dengan kode itu: ${baris.length}${dobel ? ' <-- KEMBAR' : ''}`,
          );
          expect.soft(
            baris.length,
            `${jumlah} permintaan bersamaan, putaran ${i}: jumlah cabang dengan kode ${kode}`,
          ).toBeLessThanOrEqual(1);

          const h = await hapusKode(request, headers, kode);
          if (!h.startsWith('terhapus')) console.log(`PEMBERSIHAN ${kode}: ${h}`);
        }
      }
      console.log(`Putaran yang menghasilkan cabang kembar: ${kembar} dari ${total}`);
      if (kembar > 0) {
        test.info().annotations.push({
          type: 'temuan',
          description: `Permintaan bersamaan dengan kode yang sama menghasilkan cabang kembar (kode ganda) pada ${kembar} dari ${total} percobaan`,
        });
      }
    } finally {
      for (const k of [...new Set(dibuat)]) {
        const h = await hapusKode(request, headers, k);
        expect.soft(h.startsWith('terhapus'), `pembersihan ${k}: ${h}`).toBe(true);
      }
    }
  });

  test('akhir: tidak ada data uji tersisa', async ({ request }) => {
    const headers = await auth(request);
    let { rows } = await daftar(request, headers);
    for (const kode of [...new Set(rows.filter(uji).map((x) => String(x.code)))]) {
      const h = await hapusKode(request, headers, kode);
      console.log(`Sisa ${kode}: ${h}`);
    }
    ({ rows } = await daftar(request, headers));
    expect.soft(rows.filter(uji).map((x) => String(x.code)), 'data uji yang masih tersisa').toEqual([]);
  });
});