# Brief untuk Rakha — Evergreen fase 2

Halo Rakha. Ini ringkasan fase 2 dan bagianmu di dalamnya. Detail lengkapnya ada di [`PHASE2-PLAN.md`](PHASE2-PLAN.md). File ini cukup untuk memulai.

## Fase 2 itu apa

SOW 1 sudah dikirim ke Kenny pada 1 Oktober. Fase 2 kita jalankan sendiri, tanpa SOW baru. Tujuannya adopsi nyata: Evergreen dipakai orang, bukan cuma dinilai.

Keputusan besarnya (sudah diputuskan Fatih, 2026-10-14):

- **Dashboard bisa dipakai siapa saja.**
  - Login dengan email (identitas) dan wallet (otoritas atas uang).
  - Watchlist pribadi, scan contract apa pun, dan extend.
- **Autopilot hosted berbayar, tapi non-kustodial.**
  - User menandatangani satu *allowance* XLM yang punya batas jumlah dan tanggal kedaluwarsa.
  - Engine menarik `rent + fee` setiap kali akan meng-extend.
  - Spike #297 membuktikan mekanisme ini bekerja di testnet, termasuk bahwa engine **tidak bisa** memperpanjang izinnya sendiri.
- **Fee persen per transaksi,** setiap kali ada XLM yang berpindah lewat infrastruktur kita.
  - CLI dan engine self-hosted tetap gratis dan MIT.
  - Ada opsi tip "Support Evergreen" yang sukarela.
- **Beta di testnet dulu** dengan 10–20 user, baru setelah itu mainnet.
- **Infrastruktur:** Cloudflare Workers (gratis dulu; paket Paid ~$5/bulan kalau engine tidak muat) dan Neon Postgres.
- **Treasury key terpisah dari engine key.** Treasury key tidak pernah ada di server.

## Peranmu: R, CER, WEBR

| Kode | Artinya |
|---|---|
| **R** | kamu langsung: **penanggung jawab utama publish npm** (Fatih punya akses juga, sebagai cadangan), kesiapan mainnet, dan custody engine key bersama Fatih |
| **CER** | agent CLI/engine-mu: engine, jalur tulis (`extend`), database, scheduler, dan seluruh autopilot hosted |
| **WEBR** | agent web-mu: semua layar tempat XLM berpindah (extend, allowance, halaman dukungan) |

## Kenapa pembagiannya begini

Pembagian ini diambil dari 61 PR-mu yang sudah merge, bukan tebakan. Riwayatmu terkumpul di:

- **Jalur tulis:** `extend` (#86), guarded execution (#122), bukti extend live (#105).
- **Engine dan alert:** threshold (#121), alert (#142–146), email channel (#137), consent temporary (#160).
- **Persistence:** spike (#52), Neon preflight (#261).
- **Release:** npm 0.1.0 dan 0.1.1, GitHub Release (#227, #241, #259, #263, #265, #270).
- **CI eksternal untuk Action:** #256, #257.

Jadi bagian yang memindahkan uang paling masuk akal ada di tanganmu. Fatih memegang core/scan, auth, spesifikasi API, ADR, dan UI dashboard.

**Bobotnya seimbang:** pekerjaan terjadwal Fatih 34,5 dan kamu 32,5; dengan backlog, 37,5 dan 39,5. Itu dihitung dari bobot task, bukan jam. **Tolong konfirmasi ketersediaan jammu ke Fatih**, karena angka bobot tidak berarti apa-apa tanpa itu.

## Risiko yang perlu kamu tahu dari awal

**Seluruh autopilot hosted (PH2-E4-01 sampai PH2-E4-05) ada di jalur kritismu.** Kalau bagian itu molor, pemasukan ikut molor. Kalau kamu melihat risiko itu mulai terjadi, bilang lebih awal. Jangan tunggu sampai tenggat.

## Cara menyerahkan pekerjaan ke agent-mu

1. `git pull`, lalu buka folder `phase-2/`.
2. Ke agent CLI/engine-mu, berikan **[`kickoff/CER.md`](kickoff/CER.md)**.
   - Tugas pertamanya bisa langsung jalan hari ini: **PH2-E2-01**, spike Cloudflare Workers. Ini menentukan apakah engine muat di free tier.
3. Ke agent web-mu, berikan **[`kickoff/WEBR.md`](kickoff/WEBR.md)**.
   - Tugas pertamanya juga bisa langsung jalan: **PH2-E3-06**, tes berapa kali Freighter meminta tanda tangan untuk `approve`.
4. Kedua kickoff itu sudah memuat aturan baku fase 2 (lewat `phase-2/README.md`): wilayah path masing-masing agent, testnet-only, bukti mutasi untuk jalur tulis, dan cara bertanya.

## Yang perlu kamu jawab ke Fatih

- ketersediaan jammu per minggu;
- apakah ada kartu yang menurutmu salah tempat atau bobotnya keliru;
- review spesifikasi API (PH2-E2-02) ketika sudah ditulis CEF dan WEBF, karena skema database dan engine-mu bergantung padanya.

Semua kartu sudah terdaftar di `BACKLOG.md` § Phase 2 dengan ID resmi (PH2-E0-07, 2026-10-15): label lama ditambah awalan `PH2-`, misalnya PH2-E4-02. Tiga kartu backlog memakai ID yang sudah ada: `B-D31-01`, `B-D31-02` dan `B-D31-03`.
