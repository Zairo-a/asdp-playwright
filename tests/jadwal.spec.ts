import { test } from '@playwright/test';
import { login } from './helpers';

function tanggalNanti(hariKeDepan: number): string {
  const d = new Date();
  d.setDate(d.getDate() + hariKeDepan);
  return d.toISOString().slice(0, 10);
}

test('cari jadwal dari Adonara', async ({ request }) => {
  const token = await login(request);
  const auth = { Authorization: `Bearer ${token}` };
  const tanggal = tanggalNanti(3);
  console.log('Tanggal dicari:', tanggal);

  const resTujuan = await request.get('cms/reservation/outlet-dropoff', {
    headers: auth,
    params: { pickup_outlet_id: 1 },
  });
  const tujuan = await resTujuan.json();

  let contohTercetak = false;
  for (const t of tujuan.result) {
    const r = await request.get('cms/reservation/schedules', {
      headers: auth,
      params: { date: tanggal, pickup_outlet_id: 1, dropoff_outlet_id: t.value },
    });
    const body = await r.json();
    const jumlahRute = body.result?.length ?? 0;
    const jumlahJadwal = (body.result ?? []).reduce(
      (n, g) => n + (g.schedules?.length ?? 0), 0);

    console.log(`${t.label} (id=${t.value}): status ${r.status()}, rute ${jumlahRute}, jadwal ${jumlahJadwal}`);

    if (!contohTercetak && jumlahJadwal > 0) {
      console.log('Field di satu jadwal:', Object.keys(body.result[0].schedules[0]));
      contohTercetak = true;
    }
  }
});