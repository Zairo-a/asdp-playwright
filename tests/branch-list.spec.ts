import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getToken } from './helpers';

const URL = 'cms/branches';
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

type Pair = [string, any];

// Pasangan kunci-nilai, supaya companies[] dan status[] bisa diulang
function qs(pairs: Pair[] = []) {
  const p = new URLSearchParams();
  for (const [k, v] of pairs) p.append(k, String(v));
  return p;
}

async function auth(request: APIRequestContext) {
  return { Authorization: `Bearer ${await getToken(request)}`, Accept: 'application/json' };
}

// Cabang ada di result.content[0].rows, dan jumlahnya di result.content[0].pagination
async function panggil(request: APIRequestContext, headers: Record<string, string>, pairs: Pair[] = []) {
  const r = await ambil(request, URL, headers, qs(pairs));
  const b = await baca(r);
  const blok = b?.result?.content?.[0];
  return { r, b, blok, rows: (blok?.rows ?? []) as any[], pag: blok?.pagination };
}

const KUNCI_BARIS = ['id', 'code', 'name', 'company_code', 'company_name', 'phone', 'email',
  'ports', 'status', 'is_active', 'row_color', 'actions'];

// Tanpa telepon dan email
const ringkasBaris = (x: any) =>
  `${x.code} | ${x.name} | ${x.company_code} | ${x.company_name} | ${x.status} | aktif ${x.is_active}`
  + ` | pelabuhan ${Array.isArray(x.ports) ? x.ports.length : typeof x.ports}`;

// ---------- Pemeriksaan bentuk ----------

test('cabang: bentuk balasan benar', async ({ request }) => {
  const headers = await auth(request);
  const { r, b, blok, rows, pag } = await panggil(request, headers);
  expect(r.status()).toBe(200);
  expect(b.message).toBe('Success!');

  expect(typeof b.result.meta.title).toBe('string');
  expect(Array.isArray(b.result.filters)).toBe(true);
  for (const k of ['create', 'delete', 'export_csv']) {
    expect.soft(typeof b.result.permissions?.[k], `permissions.${k} harus boolean`).toBe('boolean');
  }

  expect(Array.isArray(b.result.content)).toBe(true);
  expect(blok, 'content[0] harus ada').toBeDefined();
  expect(Array.isArray(blok.columns)).toBe(true);
  expect(blok.columns.length).toBeGreaterThan(0);
  for (const c of blok.columns) {
    for (const k of ['key', 'label', 'sortable']) {
      expect.soft(c, `kolom ${c.key} harus punya ${k}`).toHaveProperty(k);
    }
  }

  expect(Array.isArray(blok.rows)).toBe(true);
  for (const x of rows) {
    for (const k of KUNCI_BARIS) expect.soft(x, `baris ${x.code} harus punya ${k}`).toHaveProperty(k);
  }
  for (const k of ['total', 'per_page', 'current_page', 'last_page']) {
    expect.soft(typeof pag?.[k], `pagination.${k} harus angka`).toBe('number');
  }
});

test('cabang: jumlah baris cocok dengan pagination (halaman pertama)', async ({ request }) => {
  const headers = await auth(request);
  const { rows, pag } = await panggil(request, headers);
  expect(pag.current_page).toBe(1);
  expect(rows.length, 'baris = terkecil antara total dan per_page').toBe(Math.min(pag.total, pag.per_page));
  expect(pag.last_page, 'last_page').toBe(Math.max(1, Math.ceil(pag.total / pag.per_page)));
});

test('cabang: filter yang dikirim server', async ({ request }) => {
  const headers = await auth(request);
  const { b } = await panggil(request, headers);
  const filter = (k: string) => b.result.filters.find((f: any) => f.key === k);

  for (const k of ['search', 'companies', 'status']) {
    expect.soft(filter(k), `filter ${k} harus ada`).toBeDefined();
  }
  expect.soft(filter('search')?.input_type, 'tipe filter search').toBe('text');
  for (const k of ['companies', 'status']) {
    const f = filter(k);
    expect.soft(f?.input_type, `tipe filter ${k}`).toBe('multi-select');
    expect.soft(Array.isArray(f?.options) && f.options.length > 0, `opsi filter ${k} tidak kosong`).toBe(true);
    for (const o of f?.options ?? []) {
      expect.soft(o, `opsi ${k} harus punya value`).toHaveProperty('value');
      expect.soft(o, `opsi ${k} harus punya label`).toHaveProperty('label');
    }
  }
  expect.soft(filter('status')?.options?.length, 'opsi status: aktif dan nonaktif').toBe(2);
});

test('cabang: perusahaan di tabel ada di daftar filter (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const headers = await auth(request);
  const { b, rows, pag } = await panggil(request, headers, [['limit', 100]]);
  const label = (b.result.filters.find((f: any) => f.key === 'companies')?.options ?? []).map((o: any) => String(o.label));
  const dalamTabel = [...new Set(rows.map((x) => String(x.company_name)))];
  console.log(`Perusahaan di tabel: ${dalamTabel.length} | opsi filter: ${label.length} | total cabang: ${pag.total}`);
  for (const nama of dalamTabel) {
    expect.soft(label, `perusahaan "${nama}" ada di opsi filter`).toContain(nama);
  }
});

test('cabang: isi kolom, filter, dan baris (lihat nilai)', async ({ request }) => {
  const headers = await auth(request);
  const { b, blok, rows, pag } = await panggil(request, headers);
  console.log(`Total di API: ${pag?.total} | per_page ${pag?.per_page} | from ${pag?.from} | to ${pag?.to} | baris di halaman: ${rows.length}`);
  console.log('Kolom: ' + blok.columns.map((c: any) =>
    `${c.key}(${c.label}, sortable ${c.sortable}${c.children?.length ? ', anak ' + c.children.length : ''})`).join(' | '));
  for (const f of b.result.filters) {
    console.log(`Filter ${f.key}: ${(f.options ?? []).map((o: any) => `${o.value}=${o.label}`).join(' | ') || '-'}`);
  }
  rows.forEach((x, i) => console.log(`Baris ${i + 1}: ${ringkasBaris(x)}`));
  const pasangan = new Set(rows.map((x) => `${x.status}/${x.is_active}`));
  console.log(`Pasangan status/is_active: ${[...pasangan].join(', ')}`);
  console.log(`Contoh row_color: ${JSON.stringify(rows[0]?.row_color)} | contoh actions: ${(JSON.stringify(rows[0]?.actions) ?? '-').slice(0, 200)}`);
});

// ---------- Halaman ----------

test('cabang: limit membatasi jumlah baris', async ({ request }) => {
  const headers = await auth(request);
  const { rows, pag } = await panggil(request, headers, [['limit', 1]]);
  expect(rows.length).toBe(Math.min(1, pag.total));
  expect(pag.per_page).toBe(1);
  expect(pag.last_page).toBe(Math.max(1, pag.total));
});

test('cabang: halaman kedua berisi data yang berbeda dari halaman pertama', async ({ request }) => {
  const headers = await auth(request);
  const satu = await panggil(request, headers, [['limit', 2], ['page', 1]]);
  const dua = await panggil(request, headers, [['limit', 2], ['page', 2]]);
  test.skip(satu.pag.total <= 2, 'Data terlalu sedikit untuk dua halaman');

  expect(dua.pag.current_page).toBe(2);
  expect(dua.rows.length).toBeGreaterThan(0);
  const idSatu = satu.rows.map((x) => x.id);
  for (const x of dua.rows) {
    expect.soft(idSatu, `baris ${x.code} tidak boleh ada di halaman 1 juga`).not.toContain(x.id);
  }
  expect(dua.pag.total, 'total sama di kedua halaman').toBe(satu.pag.total);
});

test('cabang: halaman di luar jangkauan memberi daftar kosong (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const headers = await auth(request);
  const { r, rows, pag } = await panggil(request, headers, [['page', 999]]);
  expect(r.status()).toBe(200);
  expect(rows.length).toBe(0);
  expect(pag.total, 'total tetap tercatat').toBeGreaterThan(0);
});

// ---------- Pencarian ----------

test('cabang: pencarian yang tidak ada hasilnya memberi daftar kosong', async ({ request }) => {
  const headers = await auth(request);
  const { r, rows, pag } = await panggil(request, headers, [['search', 'TIDAK-ADA-XYZ']]);
  expect(r.status()).toBe(200);
  expect(rows.length).toBe(0);
  expect(pag.total).toBe(0);
});

test('cabang: pencarian kode yang ada menemukan cabang itu (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const headers = await auth(request);
  const semua = await panggil(request, headers, [['limit', 100]]);
  for (const x of semua.rows) {
    const { rows } = await panggil(request, headers, [['search', x.code]]);
    expect.soft(rows.map((y) => y.code), `cari kode "${x.code}"`).toContain(x.code);
    await jeda(300);
  }
});

test('cabang: pencarian tidak membedakan huruf besar dan kecil (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const headers = await auth(request);
  const semua = await panggil(request, headers, [['limit', 100]]);
  const nama = String(semua.rows[0].name);
  const kecil = await panggil(request, headers, [['search', nama.toLowerCase()]]);
  const besar = await panggil(request, headers, [['search', nama.toUpperCase()]]);
  console.log(`cari "${nama}": huruf kecil ${kecil.pag.total} hasil | huruf besar ${besar.pag.total} hasil`);
  expect(kecil.pag.total, 'harus menemukan cabang itu').toBeGreaterThan(0);
  expect(besar.pag.total).toBe(kecil.pag.total);
});

test('cabang: pencarian kosong sama dengan tanpa pencarian (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const headers = await auth(request);
  const tanpa = await panggil(request, headers);
  const kosong = await panggil(request, headers, [['search', '']]);
  expect(kosong.pag.total).toBe(tanpa.pag.total);
});

// ---------- Filter ----------

test('cabang: filter status memisahkan aktif dan nonaktif (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const headers = await auth(request);
  const semua = await panggil(request, headers, [['limit', 100]]);
  const aktif = await panggil(request, headers, [['status[]', 'active'], ['limit', 100]]);
  const nonaktif = await panggil(request, headers, [['status[]', 'inactive'], ['limit', 100]]);
  const keduanya = await panggil(request, headers, [['status[]', 'active'], ['status[]', 'inactive'], ['limit', 100]]);
  console.log(`total ${semua.pag.total} | aktif ${aktif.pag.total} | nonaktif ${nonaktif.pag.total} | keduanya ${keduanya.pag.total}`);

  for (const x of aktif.rows) expect.soft(Boolean(x.is_active), `cabang ${x.code} di filter aktif`).toBe(true);
  for (const x of nonaktif.rows) expect.soft(Boolean(x.is_active), `cabang ${x.code} di filter nonaktif`).toBe(false);
  expect.soft(aktif.pag.total + nonaktif.pag.total, 'aktif + nonaktif = total').toBe(semua.pag.total);
  expect.soft(keduanya.pag.total, 'dua status sekaligus = total').toBe(semua.pag.total);
});

test('cabang: filter perusahaan memberi cabang milik perusahaan itu (dugaan, gagal belum tentu bug)', async ({ request }) => {
  const headers = await auth(request);
  const dasar = await panggil(request, headers, [['limit', 100]]);
  const opsi = dasar.b.result.filters.find((f: any) => f.key === 'companies')?.options ?? [];
  let jumlah = 0;
  for (const o of opsi) {
    const { rows, pag } = await panggil(request, headers, [['companies[]', o.value], ['limit', 100]]);
    console.log(`[perusahaan ${o.label}] total ${pag.total}`);
    jumlah += pag.total;
    for (const x of rows) expect.soft(x.company_name, `cabang ${x.code} milik ${o.label}`).toBe(o.label);
    await jeda(300);
  }
  expect.soft(jumlah, 'jumlah per perusahaan = total semua').toBe(dasar.pag.total);
});

// ---------- Urutan ----------

test('cabang: urutan hasil untuk tiap kolom yang bisa diurutkan (lihat urutan)', async ({ request }) => {
  const headers = await auth(request);
  const dasar = await panggil(request, headers, [['limit', 100]]);
  const kolom: string[] = dasar.blok.columns.filter((c: any) => c.sortable).map((c: any) => c.key);
  console.log(`Kolom yang bisa diurutkan: ${kolom.join(', ') || '-'}`);
  console.log(`Urutan awal (kode): ${dasar.rows.map((x) => x.code).join(' > ')}`);

  for (const k of kolom) {
    for (const nilai of [k, `-${k}`, `${k}:asc`, `${k}:desc`]) {
      const { r, rows } = await panggil(request, headers, [['sort', nilai], ['limit', 100]]);
      console.log(`[sort ${nilai}] status ${r.status()} | kode: ${rows.map((x) => x.code).join(' > ')}`);
      expect.soft(r.status(), `sort ${nilai}: tidak boleh error server`).toBeLessThan(500);
      await jeda(300);
    }
  }
});

// ---------- Parameter yang salah ----------

const salah: [string, Pair[], string | null][] = [
  ['limit 0', [['limit', 0]], 'at least 1'],
  ['limit -1', [['limit', -1]], 'at least 1'],
  ['limit abc', [['limit', 'abc']], null],
  ['page 0', [['page', 0]], 'at least 1'],
  ['page abc', [['page', 'abc']], null],
  ['status ngawur', [['status[]', 'abc']], 'selected status.0 is invalid'],
];

for (const [nama, pairs, pesan] of salah) {
  test(`cabang gagal: ${nama}`, async ({ request }) => {
    const headers = await auth(request);
    const { r, b } = await panggil(request, headers, pairs);
    expect(r.status()).toBe(422);
    if (pesan) expect(String(b?.message)).toContain(pesan);

    if (nama.endsWith('abc') && !nama.startsWith('status')) {
      const teks = String(b?.message);
      if (!/integer|number|numeric|angka/i.test(teks)) {
        test.info().annotations.push({
          type: 'temuan',
          description: `${nama}: pesan "${teks}" tidak menyebut bahwa nilainya harus angka (pesan kurang tepat, tingkat rendah)`,
        });
      }
    }
  });
}

// ---------- Batas dan karakter khusus ----------

test('cabang: batas ekstrem (lihat nilai)', async ({ request }) => {
  const headers = await auth(request);
  const kasus: [string, Pair[]][] = [
    ['limit 101', [['limit', 101]]],
    ['limit 1000000', [['limit', 1000000]]],
    ['search 300 karakter', [['search', 'x'.repeat(300)]]],
    ['search kosong', [['search', '']]],
  ];
  for (const [nama, pairs] of kasus) {
    const { r, rows, pag } = await panggil(request, headers, pairs);
    console.log(`[${nama}] status ${r.status()} | per_page ${pag?.per_page ?? '-'} | baris ${rows.length} | total ${pag?.total ?? '-'}`);
    expect.soft(r.status(), `${nama}: tidak boleh error server`).toBeLessThan(500);
    await jeda(300);
  }
});

test('cabang: karakter khusus pada pencarian tidak membuat error server', async ({ request }) => {
  const headers = await auth(request);
  const aneh = ["'", '"', '%', '_', '\\', '<script>x</script>', "' OR '1'='1", ' ', '😀'];
  for (const s of aneh) {
    const { r } = await panggil(request, headers, [['search', s]]);
    console.log(`[search ${JSON.stringify(s)}] status ${r.status()}`);
    expect.soft(r.status(), `search ${JSON.stringify(s)}: tidak boleh error server`).toBeLessThan(500);
    await jeda(300);
  }
});

// ---------- Akses ----------

test('cabang gagal: tanpa token ditolak', async ({ request }) => {
  const r = await request.get(URL);
  expect(r.status()).toBe(401);
});

test('cabang gagal: token ngawur ditolak', async ({ request }) => {
  const r = await request.get(URL, { headers: { Authorization: 'Bearer token-ngawur-123' } });
  expect(r.status()).toBe(401);
});