import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';

// Menghapus warna terminal, token, email, dan nomor telepon supaya laporan aman dibagikan
const bersih = (s: string) =>
  s
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/Bearer\s+[^\s'"]+/gi, 'Bearer ***')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '***@***')
    .replace(/(?<![\d-])(?:\+?62|0)\d{8,12}(?!\d)/g, '***');

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dua = (n: number) => String(n).padStart(2, '0');

type Jenis = 'PEMERIKSAAN' | 'DUGAAN' | 'EKSPLORASI';

function jenisDari(nama: string): Jenis {
  if (/\(lihat |lihat struktur|lihat keadaan|lihat nilai|eksplorasi|yang dikirim server|\(menunggu/i.test(nama)) return 'EKSPLORASI';
  if (/dugaan/i.test(nama)) return 'DUGAAN';
  return 'PEMERIKSAAN';
}

type Status = 'LULUS' | 'LULUS SETELAH ULANG' | 'GAGAL' | 'DILEWATI';

type Baris = {
  no: number; berkas: string; nama: string; jenis: Jenis; status: Status;
  koneksi: boolean; detik: string; temuan: string[]; bukti: string[]; alasanLewat: string;
  pesan: string[]; cetakan: string;
};

class LaporanReporter implements Reporter {
  private suite?: Suite;
  private cetakan = new Map<string, string[]>();

  onBegin(_config: FullConfig, suite: Suite) {
    this.suite = suite;
  }

  onStdOut(chunk: string | Buffer, test?: TestCase) {
    if (!test) return;
    const daftar = this.cetakan.get(test.id) ?? [];
    daftar.push(chunk.toString());
    this.cetakan.set(test.id, daftar);
  }

  onEnd(_hasil: FullResult) {
    const tests = this.suite?.allTests() ?? [];

    const baris: Baris[] = tests.map((t, i) => {
      const jalur = t.titlePath();
      const idx = jalur.findIndex((x) => /\.spec\.ts$/.test(x));
      const nama = jalur.slice(idx + 1).join(' > ');
      const berkas = idx >= 0 ? jalur[idx] : path.basename(t.location.file);
      const akhir = t.results[t.results.length - 1];
      const hasil = t.outcome();

      let status: Status = 'LULUS';
      if (hasil === 'skipped') status = 'DILEWATI';
      else if (hasil === 'unexpected') status = 'GAGAL';
      else if (hasil === 'flaky') status = 'LULUS SETELAH ULANG';

      const pesan = hasil === 'unexpected'
        ? (akhir?.errors ?? [])
            .slice(0, 6)
            .map((e) => bersih(e.message ?? '').split('\n').filter((x) => x.trim()).slice(0, 5).join(' | '))
            .filter(Boolean)
        : [];
      const koneksi = pesan.length > 0 && pesan.every((p) => /ECONNRESET|socket hang up/i.test(p));

      const temuan = t.annotations
        .filter((a) => a.type === 'temuan' || a.type === 'fail')
        .map((a) => (a.type === 'fail' ? `Diketahui gagal: ${a.description ?? ''}` : a.description ?? ''));
      // Screenshot bukti temuan (path relatif terhadap folder "hasil", mis. bukti/KA-T01_....png)
      const bukti = t.annotations
        .filter((a) => a.type === 'bukti' && a.description)
        .map((a) => (a.description ?? '').replace(/\\/g, '/'));
      const alasanLewat = t.annotations
        .filter((a) => a.type === 'skip')
        .map((a) => a.description ?? '')
        .join(' | ');

      return {
        no: i + 1, berkas, nama, jenis: jenisDari(nama), status, koneksi,
        detik: ((akhir?.duration ?? 0) / 1000).toFixed(1),
        temuan: temuan.map(bersih), bukti, alasanLewat,
        pesan, cetakan: bersih((this.cetakan.get(t.id) ?? []).join('').trim()),
      };
    });

    const lulus = baris.filter((b) => b.status.startsWith('LULUS'));
    const gagalNyata = baris.filter((b) => b.status === 'GAGAL' && !b.koneksi);
    const gagalKoneksi = baris.filter((b) => b.status === 'GAGAL' && b.koneksi);
    const lewat = baris.filter((b) => b.status === 'DILEWATI');
    const adaTemuan = baris.filter((b) => b.temuan.length > 0);
    const eksplorasi = baris.filter((b) => b.jenis === 'EKSPLORASI' && b.status !== 'DILEWATI');

    const d = new Date();
    const waktu = `${dua(d.getDate())}-${dua(d.getMonth() + 1)}-${d.getFullYear()} ${dua(d.getHours())}:${dua(d.getMinutes())}`;
    const stempel = `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}_${dua(d.getHours())}-${dua(d.getMinutes())}-${dua(d.getSeconds())}`;

    const kartu = (judul: string, angka: number, kelas: string) =>
      `<div class="kartu ${kelas}"><div class="angka">${angka}</div><div>${judul}</div></div>`;

    const gambarBukti = (b: Baris) =>
      b.bukti.length
        ? `<div class="bukti">${b.bukti
            .map((src) => `<a href="${esc(src)}" target="_blank" title="Klik untuk memperbesar"><img src="${esc(src)}" alt="Bukti ${esc(src)}"></a>`)
            .join('')}<div class="bukti-ket">Bukti screenshot (klik untuk memperbesar) — file: hasil/${b.bukti.map(esc).join(', hasil/')}</div></div>`
        : '';

    const item = (b: Baris, label: string, kelas: string) => `
      <div class="bug">
        <div class="judul"><span class="lencana ${kelas}">${label}</span> ${esc(b.nama)}</div>
        <div class="berkas">${esc(b.berkas)} · ${b.jenis}</div>
        ${b.temuan.map((x) => `<p class="temuan">${esc(x)}</p>`).join('')}
        ${gambarBukti(b)}
        ${b.pesan.map((x) => `<p class="pesan">${esc(x)}</p>`).join('')}
        ${b.cetakan ? `<details open><summary>Cetakan test</summary><pre>${esc(b.cetakan)}</pre></details>` : ''}
      </div>`;

    const bagian = (judul: string, isi: string, kosong: string) =>
      `<h2>${judul}</h2>${isi || `<p class="kosong">${kosong}</p>`}`;

    const tabel = baris.map((b) => `
      <tr class="${b.status === 'GAGAL' ? (b.koneksi ? 'koneksi' : 'gagal') : b.status === 'DILEWATI' ? 'lewat' : b.temuan.length ? 'temuanbaris' : 'lulus'}">
        <td>${b.no}</td><td>${esc(b.berkas)}</td><td>${esc(b.nama)}</td>
        <td>${b.jenis}</td><td>${b.status}${b.koneksi ? ' (koneksi)' : ''}</td><td>${b.detik}</td>
      </tr>`).join('');

    const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan test ${waktu}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#1b1f23;background:#fafbfc}
  h1{margin:0 0 4px} h2{margin-top:32px;border-bottom:2px solid #e1e4e8;padding-bottom:6px}
  .catatan{background:#fff8c5;border:1px solid #d4a72c;padding:10px 14px;border-radius:6px;margin:14px 0}
  .kartu-baris{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
  .kartu{padding:12px 18px;border-radius:8px;min-width:130px;color:#fff}
  .kartu .angka{font-size:28px;font-weight:700}
  .k-total{background:#57606a}.k-lulus{background:#1a7f37}.k-gagal{background:#cf222e}
  .k-temuan{background:#bc4c00}.k-koneksi{background:#8250df}.k-lewat{background:#6e7781}
  .bug{background:#fff;border:1px solid #d0d7de;border-left:5px solid #cf222e;border-radius:6px;padding:10px 14px;margin:10px 0}
  .bug .judul{font-weight:600}.bug .berkas{color:#57606a;font-size:12px;margin:2px 0 6px}
  .lencana{display:inline-block;padding:1px 8px;border-radius:10px;color:#fff;font-size:12px;margin-right:6px}
  .l-temuan{background:#bc4c00}.l-gagal{background:#cf222e}.l-koneksi{background:#8250df}
  .temuan{color:#953800;margin:6px 0;white-space:pre-line;line-height:1.5}.pesan{color:#82071e;margin:6px 0;font-family:Consolas,monospace;font-size:13px}
  .bukti{margin:8px 0}.bukti img{max-width:min(100%,900px);border:1px solid #d0d7de;border-radius:6px;display:block;margin:6px 0}
  .bukti-ket{color:#57606a;font-size:12px}
  pre{background:#f6f8fa;padding:10px;border-radius:6px;overflow:auto;font-size:12px;white-space:pre-wrap}
  table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
  th,td{border:1px solid #d0d7de;padding:5px 8px;text-align:left}th{background:#f6f8fa}
  tr.lulus td:nth-child(5){color:#1a7f37}tr.gagal{background:#ffebe9}tr.koneksi{background:#fbefff}
  tr.lewat{color:#6e7781}tr.temuanbaris{background:#fff1e5}.kosong{color:#57606a}
</style></head><body>
<h1>Laporan test</h1>
<div>${waktu} · ${baris.length} test</div>
<div class="catatan"><b>Cara membaca:</b> laporan ini hanya menampilkan apa yang diperiksa test. <b>Hijau tidak berarti tidak ada bug.</b>
Test berjenis EKSPLORASI hanya mencetak isi balasan (${eksplorasi.length} test di run ini), jadi belum menilai sesuai atau tidak.
Masalah yang hanya terlihat di layar (tombol, tulisan, tata letak) tidak terdeteksi.</div>
<div class="kartu-baris">
  ${kartu('Total test', baris.length, 'k-total')}
  ${kartu('Lulus', lulus.length, 'k-lulus')}
  ${kartu('Gagal (perlu dicek)', gagalNyata.length, 'k-gagal')}
  ${kartu('Temuan tercatat', adaTemuan.length, 'k-temuan')}
  ${kartu('Gangguan koneksi', gagalKoneksi.length, 'k-koneksi')}
  ${kartu('Dilewati', lewat.length, 'k-lewat')}
</div>
${bagian('Temuan tercatat (diperkirakan bug)', adaTemuan.map((b) => item(b, 'TEMUAN', 'l-temuan')).join(''), 'Tidak ada temuan yang tercatat.')}
${bagian('Gagal (perlu dicek, belum tentu bug)', gagalNyata.map((b) => item(b, 'GAGAL', 'l-gagal')).join(''), 'Tidak ada test yang gagal.')}
${bagian('Gangguan koneksi (bukan bug fitur)', gagalKoneksi.map((b) => item(b, 'KONEKSI', 'l-koneksi')).join(''), 'Tidak ada gangguan koneksi.')}
${bagian('Hasil eksplorasi (isi cetakan, belum dinilai)', eksplorasi.map((b) => `<div class="bug" style="border-left-color:#8250df"><div class="judul">${esc(b.nama)}</div><div class="berkas">${esc(b.berkas)}</div><pre>${esc(b.cetakan || '(tidak ada cetakan)')}</pre></div>`).join(''), 'Tidak ada.')}
<h2>Semua test</h2>
<table><tr><th>No</th><th>Berkas</th><th>Test</th><th>Jenis</th><th>Status</th><th>Detik</th></tr>${tabel}</table>
${lewat.length ? `<h2>Dilewati</h2>${lewat.map((b) => `<p>${esc(b.nama)}: ${esc(b.alasanLewat || '-')}</p>`).join('')}` : ''}
</body></html>`;

    const folder = path.join(process.cwd(), 'hasil');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'laporan-terbaru.html'), html, 'utf8');
    fs.writeFileSync(path.join(folder, `laporan-${stempel}.html`), html, 'utf8');
    console.log(`\nLaporan bug tersimpan: hasil\\laporan-terbaru.html\n`);
  }
}

export default LaporanReporter;