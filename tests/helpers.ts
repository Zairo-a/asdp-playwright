import { APIRequestContext } from '@playwright/test';

export async function login(request: APIRequestContext): Promise<string> {
  const r = await request.post('auth/login', {
    data: {
      grant_type: 'password',
      username: process.env.ASDP_USERNAME,
      password: process.env.ASDP_PASSWORD,
      device_address: process.env.ASDP_DEVICE,
    },
  });
  const body = await r.json();
  if (r.status() !== 200) {
    throw new Error(`Login gagal: ${r.status()} ${body.message}`);
  }
  return body.result.access_token;
}

let tokenCache: string | undefined;

export async function getToken(request: APIRequestContext): Promise<string> {
  if (!tokenCache) tokenCache = await login(request);
  return tokenCache;
}