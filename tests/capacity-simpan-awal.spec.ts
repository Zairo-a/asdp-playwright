import { test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

function tanggal(offsetHari: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetHari);
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

const jeda = (ms: number) => new Promise((s) => setTimeout(s, ms));

async function ambil(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
  params?: any,
) {
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

async function baca(r: any) {
  try { return await r.json(); } catch { return undefined; }
}

const potong = (v: any, n = 220) => (JSON.stringify(v) ?? 'undefined').slice(0, n);

test('simpan alokasi: lihat keadaan awal keberangkatan uji (hanya membaca)', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await getToken(request)}` };

  const tgl = tanggal(180);
  const list = await baca(await ambil(request, 'cms/capacity/departures', headers, { date: tgl, per_page: 1 }));
  const row = list.result.rows[0];
  console.log(`Keberangkatan uji: ${row.key} | status ${row.status} | terjual ${row.sold} | sisa ${row.remaining}`);

  const d = (await baca(await ambil(request, `cms/capacity/departures/${row.date}/${row.schedule.id}`, headers))).result;
  console.log(`has_overrides ${d.has_overrides} | pending_approval ${d.pending_approval === null ? 'null' : 'ada'} | permissions ${potong(d.permissions)}`);

  for (const resource of ['pax', 'vehicle', 'goods']) {
    const r = await ambil(request, `cms/capacity/departures/${row.date}/${row.schedule.id}/allocations`, headers, { resource });
    const a = (await baca(r)).result;
    console.log(`--- ${resource} | mode ${a.mode} | pending_approval ${a.pending_approval === null ? 'null' : 'ada'}`);

    if (resource === 'pax') {
      console.log('kelas:', a.classes.map((c: any) => `${c.id}:${c.code} kuota ${c.quota}/kapasitas ${c.capacity}`).join(' | '));
      for (const s of a.rows) {
        console.log(`saluran ${s.channel_group} | label ${s.label} | editable ${s.editable} | sel ${s.cells.length} | total ${potong(s.total)}`);
        console.log(`   sel[0]: ${potong(s.cells[0])}`);
      }
      console.log('totals:', potong(a.totals));
      console.log('outside_quota:', potong(a.outside_quota));
    }

    if (resource === 'vehicle') {
      console.log('composition:', potong(a.composition));
      console.log('golongan:', a.golongan.map((g: any) => `${g.code}:${g.type} unit ${g.quota_units} sumber ${g.source}`).join(' | '));
      for (const s of a.channel_rows) {
        console.log(`saluran ${s.channel_group} | label ${s.label} | editable ${s.editable} | sel ${s.cells.length}`);
        console.log(`   sel[0]: ${potong(s.cells[0])}`);
      }
      console.log('totals:', potong(a.totals));
    }

    if (resource === 'goods') {
      console.log(`kategori ${a.rows.length} | is_override true: ${a.rows.filter((x: any) => x.is_override).length}`);
      console.log(`   baris[0]: ${potong(a.rows[0], 300)}`);
    }
    await jeda(300);
  }
});