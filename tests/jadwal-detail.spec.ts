import { test } from '@playwright/test';
import { login } from './helpers';

function tanggalNanti(hariKeDepan: number): string {
  const d = new Date();
  d.setDate(d.getDate() + hariKeDepan);
  return d.toISOString().slice(0, 10);
}

test('isi jadwal Adonara ke Larantuka', async ({ request }) => {
  const token = await login(request);
  const tanggal = tanggalNanti(3);

  const r = await request.get('cms/reservation/schedules', {
    headers: { Authorization: `Bearer ${token}` },
    params: { date: tanggal, pickup_outlet_id: 1, dropoff_outlet_id: 48 },
  });
  const body = await r.json();
  const daftar = body.result[0].schedules;

  console.log('Tanggal:', tanggal);
  console.log('Kode rute:', body.result[0].route_code);
  console.log('Jumlah jadwal:', daftar.length);
  console.log('Contoh jadwal pertama:');
  console.log(JSON.stringify(daftar[0], null, 2));
});