import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';

// Menghapus warna terminal, token, email, dan nomor telepon supaya aman dibagikan
const bersih = (s: string) =>
  s
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/Bearer\s+[^\s'"]+/gi, 'Bearer ***')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '***@***')
    .replace(/(?<![\d-])(?:\+?62|0)\d{8,12}(?!\d)/g, '***');

const dua = (n: number) => String(n).padStart(2, '0');

type Jenis = 'PEMERIKSAAN' | 'DUGAAN' | 'EKSPLORASI';

function jenisDari(nama: string): Jenis {
  if (/\(lihat |lihat struktur|lihat keadaan|lihat nilai|eksplorasi|yang dikirim server|\(menunggu/i.test(nama)) return 'EKSPLORASI';
  if (/dugaan/i.test(nama)) return 'DUGAAN';
  return 'PEMERIKSAAN';
}

type Baris = {
  no: number; berkas: string; nama: string; jenis: Jenis; status: string;
  ms: number; temuan: string; alasanLewat: string; pesan: string;
};

class RekapReporter implements Reporter {
  private suite?: Suite;
  private cetakan = new Map<string, string[]>();

  onBegin(_config: FullConfig, suite: Suite) {
    this.suite = suite;
  }

  onStdOut(chunk: string | Buffer, test?: TestCase | void) {
    if (!test) return;
    const daftar = this.cetakan.get(test.id) ?? [];
    daftar.push(bersih(chunk.toString()));
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

      let status = 'LULUS';
      if (hasil === 'skipped') status = 'DILEWATI';
      else if (hasil === 'unexpected') status = akhir?.status === 'timedOut' ? 'GAGAL (waktu habis)' : 'GAGAL';
      else if (hasil === 'flaky') status = 'LULUS SETELAH ULANG';

      const temuan = t.annotations
        .filter((a) => a.type === 'temuan' || a.type === 'fail')
        .map((a) => (a.type === 'fail' ? `Diketahui gagal: ${a.description ?? ''}` : a.description ?? ''))
        .join(' | ');
      const alasanLewat = t.annotations
        .filter((a) => a.type === 'skip')
        .map((a) => a.description ?? '')
        .join(' | ');

      const pesan = hasil === 'unexpected'
        ? (akhir?.errors ?? [])
            .slice(0, 5)
            .map((e) => bersih(e.message ?? '').split('\n').find((x) => x.trim()) ?? '')
            .join(' | ')
            .slice(0, 300)
        : '';

      return {
        no: i + 1, berkas, nama, jenis: jenisDari(nama), status,
        ms: akhir?.duration ?? 0, temuan, alasanLewat, pesan,
      };
    });

    const lulus = (b: Baris) => b.status.startsWith('LULUS');
    const gagal = (b: Baris) => b.status.startsWith('GAGAL');
    const lewat = (b: Baris) => b.status === 'DILEWATI';
    const hitung = (jenis: Jenis, f: (b: Baris) => boolean) => baris.filter((b) => b.jenis === jenis && f(b)).length;

    const d = new Date();
    const waktu = `${dua(d.getDate())}-${dua(d.getMonth() + 1)}-${d.getFullYear()} ${dua(d.getHours())}:${dua(d.getMinutes())}`;
    const stempel = `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}_${dua(d.getHours())}-${dua(d.getMinutes())}-${dua(d.getSeconds())}`;

    const ringkas = [
      `REKAP TEST ${waktu}`,
      `Total test      : ${baris.length}`,
      `Pemeriksaan     : lulus ${hitung('PEMERIKSAAN', lulus)} | GAGAL ${hitung('PEMERIKSAAN', gagal)} | dilewati ${hitung('PEMERIKSAAN', lewat)}`,
      `Dugaan          : lulus ${hitung('DUGAAN', lulus)} | GAGAL ${hitung('DUGAAN', gagal)} | dilewati ${hitung('DUGAAN', lewat)}`,
      `Eksplorasi      : ${baris.filter((b) => b.jenis === 'EKSPLORASI' && !lewat(b)).length} dijalankan (hanya mencetak, belum menilai sesuai atau tidak)`,
      `Temuan tercatat : ${baris.filter((b) => b.temuan).length}`,
      `Lulus setelah ulang (koneksi tidak stabil): ${baris.filter((b) => b.status === 'LULUS SETELAH ULANG').length}`,
    ].join('\n');

    const sel = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      'No;Berkas;Test;Jenis;Status;Durasi (detik);Catatan;Pesan error',
      ...baris.map((b) =>
        [b.no, b.berkas, b.nama, b.jenis, b.status, (b.ms / 1000).toFixed(1), b.temuan || b.alasanLewat, b.pesan]
          .map(sel).join(';')),
    ].join('\r\n');

    const daftar = (judul: string, isi: string[]) =>
      isi.length ? `\n## ${judul}\n${isi.map((x) => `- ${x}`).join('\n')}\n` : '';

    const md = [
      `# Rekap test ${waktu}`,
      '',
      '```',
      ringkas,
      '```',
      daftar('Gagal (perlu dicek)', baris.filter(gagal).map((b) => `[${b.jenis}] ${b.berkas} > ${b.nama}: ${b.pesan || '-'}`)),
      daftar('Temuan tercatat', baris.filter((b) => b.temuan).map((b) => `${b.berkas} > ${b.nama}: ${b.temuan}`)),
      daftar('Lulus setelah diulang', baris.filter((b) => b.status === 'LULUS SETELAH ULANG').map((b) => `${b.berkas} > ${b.nama}`)),
      daftar('Dilewati', baris.filter(lewat).map((b) => `${b.berkas} > ${b.nama}: ${b.alasanLewat || '-'}`)),
    ].join('\n');

    // Cetakan (console.log) setiap test, sebagai bukti isi balasan server
    const log = tests.map((t, i) => {
      const isi = (this.cetakan.get(t.id) ?? []).join('').trim();
      return `=== [${baris[i].jenis}] ${baris[i].berkas} > ${baris[i].nama}\nStatus: ${baris[i].status}\n${isi || '(tidak ada cetakan)'}\n`;
    }).join('\n');

    const folder = path.join(process.cwd(), 'hasil');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `rekap-${stempel}.csv`), '\ufeff' + csv, 'utf8');
    fs.writeFileSync(path.join(folder, 'rekap-terbaru.csv'), '\ufeff' + csv, 'utf8');
    fs.writeFileSync(path.join(folder, 'rekap-terbaru.md'), md, 'utf8');
    fs.writeFileSync(path.join(folder, 'log-terbaru.txt'), log, 'utf8');

    console.log(`\n${ringkas}\nRekap tersimpan di folder "hasil": rekap-terbaru.csv (Excel), rekap-terbaru.md, dan log-terbaru.txt (isi cetakan tiap test)\n`);
  }
}

export default RekapReporter;