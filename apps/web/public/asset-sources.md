# Asset sources

Built: 2026-08-11

## Brand derivatives

- Immutable source: `C:\Users\li\Pictures\Screenshots\屏幕截图 2025-12-24 221328.png` (1148 × 963).
- Crop rule: face-centred square crop `(left=220, top=120, right=800, bottom=700)` (580 × 580); resize with Lanczos for each output. The crop retains the character's face and both eyes at small icon sizes.
- Outputs: `brand/favicon.ico`, `brand/icon-32.png`, `brand/icon-64.png`, `brand/icon-180.png`, `brand/icon-192.png`, `brand/icon-512.png`, and `brand/brand.webp`.
- Encoding: PNG derivatives are RGB; `favicon.ico` packages the 256 px source image; `brand.webp` is a quality-82 RGB WebP at 512 px.

## Decorative motif sheet

- Immutable generated source: `C:\Users\li\.codex\generated_images\019fe6ee-0529-7880-8069-96b0973d706e\exec-d5ae8292-48d5-44b5-9197-dba903609e4c.png` (1536 × 1024).
- Built-in ImageGen prompt summary: a text-free 3 × 2 collection of ornate, navy-and-cream visual-novel UI emblems on an unbroken `#00ff00` chroma background: open book, rose portrait frame, microphone, hanging tag, ranking podium, and settings palette/gear. Keep all motifs isolated and centered.
- Generation date: 2026-08-11.
- Processing: remove `#00ff00` with `remove_chroma_key.py`, `--auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`; WebP retains alpha. The sheet uses 512 × 512 cells, sliced in reading order: top-left `decorations/lobby-knowledge.webp`, top-middle `decorations/entity-character.webp`, top-right `decorations/entity-staff.webp`, bottom-left `decorations/entity-tag.webp`, bottom-middle `decorations/lobby-ranking.webp`, and bottom-right `decorations/lobby-settings.webp`.
- Trimming: each alpha slice is cropped to its non-transparent bounds plus 16 px padding (clamped to its 512 px cell), then alpha-preserving WebP-compressed. `decorations/entity-icons.webp` is the full 1536 × 1024 alpha sheet.

The source files above remain outside the repository; only derived, optimized runtime assets are checked in.
