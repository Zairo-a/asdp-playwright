import * as fs from 'fs';
import * as zlib from 'zlib';

/**
 * Baca isi file unduhan sebagai teks.
 * - CSV/teks biasa → dibaca apa adanya.
 * - XLSX (zip) → gabungan teks dari semua file XML di dalamnya (sharedStrings, sheet, dll.),
 *   cukup untuk mengecek "file berisi data X". Tanpa pustaka tambahan (pakai zlib bawaan Node).
 */
export function bacaTeksFile(path: string): string {
  const buf = fs.readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x04034b50) return buf.toString('utf8'); // bukan zip
  // Cari End Of Central Directory dari belakang
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return buf.toString('utf8');
  const jumlah = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const hasil: string[] = [];
  for (let n = 0; n < jumlah; n++) {
    const metode = buf.readUInt16LE(p + 10);
    const ukuranZip = buf.readUInt32LE(p + 20);
    const panjangNama = buf.readUInt16LE(p + 28);
    const panjangExtra = buf.readUInt16LE(p + 30);
    const panjangKomentar = buf.readUInt16LE(p + 32);
    const offsetLokal = buf.readUInt32LE(p + 42);
    const nama = buf.toString('utf8', p + 46, p + 46 + panjangNama);
    p += 46 + panjangNama + panjangExtra + panjangKomentar;
    if (!nama.endsWith('.xml')) continue;
    const awalData = offsetLokal + 30 + buf.readUInt16LE(offsetLokal + 26) + buf.readUInt16LE(offsetLokal + 28);
    const data = buf.subarray(awalData, awalData + ukuranZip);
    const isi = metode === 8 ? zlib.inflateRawSync(data) : data;
    hasil.push(isi.toString('utf8'));
  }
  return hasil.join('\n');
}
