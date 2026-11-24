# Rekap test 24-11-2026 13:56

```
REKAP TEST 24-11-2026 13:56
Total test      : 30
Pemeriksaan     : lulus 29 | GAGAL 0 | dilewati 1
Dugaan          : lulus 0 | GAGAL 0 | dilewati 0
Eksplorasi      : 0 dijalankan (hanya mencetak, belum menilai sesuai atau tidak)
Temuan tercatat : 5
Lulus setelah ulang (koneksi tidak stabil): 0
```


## Temuan tercatat
- UI\kelas-penumpang-ubah.spec.ts > Kelas Penumpang — siklus data uji > [Negatif] KK-36 Hapus kelas yang DIPAKAI kapal → ditolak, kelas tetap ada: KK-T07 — Kelas penumpang yang masih dipakai kapal bisa dihapus
Langkah:
  1. Kapal QAKPKKTCX memakai kelas QAKPRN (kuota 5)
  2. Menu Kelas Penumpang → QAKPRN → ⋯ → Hapus Data → Hapus
Ekspektasi: Ditolak dengan pesan kelas masih dipakai kapal; kelas tetap ada
Aktual: Toast: "Kelas penumpang berhasil dihapus"; kelas terhapus
- UI\kelas-penumpang.spec.ts > Kelas Penumpang — dampak > [Dampak] KK-21 kelas di tabel Alokasi Keberangkatan ada di master Kelas Penumpang & Aktif: KK-T06 — Kelas yang Nonaktif / tidak ada di master masih dipakai di alokasi keberangkatan
Langkah:
  1. Keberangkatan & Alokasi → tanggal 2027-05-02 → LMB-PGA-2100 → tab Alokasi
  2. Bandingkan kolom kelas dengan menu Kelas Penumpang
Ekspektasi: Semua kelas di alokasi ada di master dan Aktif
Aktual: Kelas di alokasi: REGULER. Masalah: "REGULER" Nonaktif di master
- UI\kelas-penumpang.spec.ts > Kelas Penumpang — temuan > [Temuan] KK-T01 nama kelas seharusnya unik (tidak ada dua kelas bernama sama) [perlu konfirmasi]: KK-T01 — Ada beberapa kelas penumpang dengan nama yang sama
Langkah:
  1. Buka menu Kelas Penumpang (Limit 50)
  2. Lihat kolom Nama
Ekspektasi: Nama kelas unik, supaya pilihan kelas di Kapal/Keberangkatan/Tarif tidak membingungkan
Aktual: BISNIS: BIS (Nonaktif), BSN (Aktif); EKONOMI: EKO (Nonaktif), EKM (Aktif)
- UI\kelas-penumpang.spec.ts > Kelas Penumpang — temuan > [Temuan] KK-T02 label menu "Edit Data" seharusnya "Ubah Data" seperti menu master lain: KK-T02 — Menu baris Kelas Penumpang memakai "Edit Data", menu master lain "Ubah Data"
Langkah:
  1. Buka menu Kelas Penumpang
  2. Klik ⋯ pada kelas EKS
Ekspektasi: Label konsisten "Ubah Data"
Aktual: Menu: Edit Data, Nonaktifkan, Hapus Data
- UI\kelas-penumpang.spec.ts > Kelas Penumpang — temuan > [Temuan] KK-T03 kuota kelas NONAKTIF di kapal tidak terlihat di form Kapal tapi tetap dihitung di total [perlu konfirmasi]: KK-T03 — Kuota kelas yang sudah Nonaktif tidak bisa dilihat/diubah di form Kapal, tapi tetap masuk total kapasitas
Langkah:
  1. Kapal QAWTAXI01 menyimpan kuota kelas REGULER (200)
  2. Kelas itu Nonaktif di menu Kelas Penumpang
  3. Kapal → QAWTAXI01 → Ubah Data → langkah 3
Ekspektasi: Kuota kelas nonaktif ditampilkan (ditandai nonaktif) atau tidak dihitung lagi di total
Aktual: Baris kelas itu tidak tampil; Total 200



## Dilewati
- UI\kelas-penumpang-ubah.spec.ts > Kelas Penumpang — siklus data uji > [Positif] KK-38 Hapus Data → hilang dari daftar: KK-30 / KK-36 sudah menghapus kelas
