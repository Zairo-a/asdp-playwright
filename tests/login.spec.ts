import { test } from '@playwright/test';

test('coba login', async ({ request }) => {
  const r = await request.post('auth/login', {
    data: {
      grant_type: 'password',
      username: process.env.ASDP_USERNAME,
      password: process.env.ASDP_PASSWORD,
      device_address: process.env.ASDP_DEVICE,
    },
  });

  const body = await r.json();
  console.log('Status HTTP:', r.status());
  console.log('code:', body.code);
  console.log('message:', body.message);
  console.log('field di result:', body.result ? Object.keys(body.result) : null);
});