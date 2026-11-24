import { test, expect } from '@playwright/test';

const user = process.env.ASDP_USERNAME;
const pass = process.env.ASDP_PASSWORD;
const dev = process.env.ASDP_DEVICE;

const dasar = { grant_type: 'password', username: user, password: pass, device_address: dev };

// Skenario negatif: [nama, data yang dikirim, status yang diharapkan, potongan pesan yang diharapkan]
const negatif = [
  ['password salah', { ...dasar, password: 'salah123' }, 400, 'Invalid username and password'],
  ['username tidak terdaftar', { ...dasar, username: 'tidak_ada_xyz' }, 400, 'Invalid username and password'],
  ['username kosong', { ...dasar, username: '' }, 422, 'username field is required'],
  ['password kosong', { ...dasar, password: '' }, 422, 'password field is required'],
  ['tanpa device_address', { grant_type: 'password', username: user, password: pass }, 422, 'device address field is required'],
  ['grant_type salah', { ...dasar, grant_type: 'abc' }, 422, 'grant type is invalid'],
  ['body kosong', {}, 422, 'grant type field is required'],
] as const;

test('login berhasil: data benar', async ({ request }) => {
  const r = await request.post('auth/login', { data: dasar });
  expect(r.status()).toBe(200);

  const body = await r.json();
  expect(body.message).toBe('Success!');
  expect(body.result.access_token).toBeTruthy();
  expect(body.result.refresh_token).toBeTruthy();
  expect(body.result.token_type).toBeTruthy();
});

for (const [nama, data, status, pesan] of negatif) {
  test(`login gagal: ${nama}`, async ({ request }) => {
    const r = await request.post('auth/login', { data });
    expect(r.status()).toBe(status);
    expect((await r.json()).message).toContain(pesan);
  });
}

test('akses profile tanpa token ditolak', async ({ request }) => {
  const r = await request.get('auth/profile');
  expect(r.status()).toBe(401);
});

test('akses profile dengan token ngawur ditolak', async ({ request }) => {
  const r = await request.get('auth/profile', {
    headers: { Authorization: 'Bearer token-ngawur-123' },
  });
  expect(r.status()).toBe(401);
});