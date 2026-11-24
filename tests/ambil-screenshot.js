const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

(async () => {
  const folder = path.join(process.cwd(), 'hasil');
  const html = path.join(folder, 'laporan-terbaru.html');
  if (!fs.existsSync(html)) {
    console.log('Laporan belum ada: ' + html);
    return;
  }

  const bukti = path.join(folder, 'bukti');
  fs.rmSync(bukti, { recursive: true, force: true });
  fs.mkdirSync(bukti, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('file:///' + html.replace(/\\/g, '/'));

  // Buka semua cetakan supaya ikut terlihat di gambar
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));

  await page.screenshot({ path: path.join(folder, 'laporan-terbaru.png'), fullPage: true });

  const kartu = await page.locator('.bug').all();
  let n = 0;
  for (const k of kartu) {
    n++;
    const judul = (await k.locator('.judul').innerText()).replace(/[^\w]+/g, '-').slice(0, 60);
    await k.screenshot({ path: path.join(bukti, `${String(n).padStart(2, '0')}-${judul}.png`) });
  }

  await browser.close();
  console.log(`Screenshot: hasil\\laporan-terbaru.png dan ${n} gambar bukti di hasil\\bukti`);
})();