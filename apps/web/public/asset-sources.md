# Asset sources

Built: 2026-08-11

## Brand derivatives

- Immutable source: `C:\Users\li\Pictures\Screenshots\屏幕截图 2025-12-24 221328.png` (1148 × 963).
- Crop rule: face-centred square crop `(left=220, top=120, right=800, bottom=700)` (580 × 580); resize with Lanczos for each output. The crop retains the character's face and both eyes at small icon sizes.
- Outputs: `brand/favicon.ico`, `brand/icon-32.png`, `brand/icon-64.png`, `brand/icon-180.png`, `brand/icon-192.png`, `brand/icon-512.png`, and `brand/brand.webp`.
- Encoding: PNG derivatives are RGB; `favicon.ico` packages the 256 px source image; `brand.webp` is a quality-82 RGB WebP at 512 px.

### Reproduction commands

Run from an ImageMagick 7 shell. These commands read the immutable screenshot and write only the listed repository derivatives (replace `$out` if the repository is checked out elsewhere).

```powershell
$source = 'C:\Users\li\Pictures\Screenshots\屏幕截图 2025-12-24 221328.png'
$out = 'C:\Users\li\Desktop\sdxx-exp1\new1\.worktrees\dev\apps\web\public\brand'
$crop = '580x580+220+120'
magick $source -crop $crop +repage -resize 32x32 -colorspace sRGB "$out\icon-32.png"
magick $source -crop $crop +repage -resize 64x64 -colorspace sRGB "$out\icon-64.png"
magick $source -crop $crop +repage -resize 180x180 -colorspace sRGB "$out\icon-180.png"
magick $source -crop $crop +repage -resize 192x192 -colorspace sRGB "$out\icon-192.png"
magick $source -crop $crop +repage -resize 512x512 -colorspace sRGB "$out\icon-512.png"
magick $source -crop $crop +repage -resize 512x512 -colorspace sRGB -quality 82 "$out\brand.webp"
magick $source -crop $crop +repage -resize 256x256 -colorspace sRGB "$out\favicon.ico"
```

## Decorative motif sheet

- Immutable generated source: `C:\Users\li\.codex\generated_images\019fe6ee-0529-7880-8069-96b0973d706e\exec-d5ae8292-48d5-44b5-9197-dba903609e4c.png` (1536 × 1024).
- Built-in ImageGen prompt summary: a text-free 3 × 2 collection of ornate, navy-and-cream visual-novel UI emblems on an unbroken `#00ff00` chroma background: open book, rose portrait frame, microphone, hanging tag, ranking podium, and settings palette/gear. Keep all motifs isolated and centered.
- Generation date: 2026-08-11.
- Processing: remove `#00ff00` with `remove_chroma_key.py`, `--auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`; WebP retains alpha. The sheet uses 512 × 512 cells, sliced in reading order: top-left `decorations/lobby-knowledge.webp`, top-middle `decorations/entity-character.webp`, top-right `decorations/entity-staff.webp`, bottom-left `decorations/entity-tag.webp`, bottom-middle `decorations/lobby-ranking.webp`, and bottom-right `decorations/lobby-settings.webp`.
- Trimming: each alpha slice is cropped to its non-transparent bounds plus 16 px padding (clamped to its 512 px cell), then alpha-preserving WebP-compressed. `decorations/entity-icons.webp` is the full 1536 × 1024 alpha sheet.

### Reproduction commands

The generated sheet is the immutable input. Set `$out` to the public decorations directory when reproducing from another checkout. The chroma helper is intentionally invoked with its full installed path and all matte/despill arguments.

```powershell
$sheet = 'C:\Users\li\.codex\generated_images\019fe6ee-0529-7880-8069-96b0973d706e\exec-d5ae8292-48d5-44b5-9197-dba903609e4c.png'
$alphaSheet = 'C:\Users\li\Desktop\sdxx-exp1\new1\.worktrees\dev\output\tmp\decorations-alpha.png'
$helper = 'C:\Users\li\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py'
$out = 'C:\Users\li\Desktop\sdxx-exp1\new1\.worktrees\dev\apps\web\public\decorations'
python $helper --input $sheet --out $alphaSheet --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
magick $alphaSheet -quality 82 "$out\entity-icons.webp"
```

For each named slice, first crop the 512 × 512 cell from `$alphaSheet`, then trim its alpha bounds, add 16 px transparent padding without exceeding the original cell, and write alpha WebP at quality 82. The `cropAndPadWithinCell` placeholder below must preserve alpha and clamp the padded bounds to the source cell; it is deliberately explicit because plain `-trim -border 16` can grow beyond its cell.

```powershell
cropAndPadWithinCell -input $alphaSheet -crop '512x512+0+0'       -padding 16 -max-size 512x512 -webp-quality 82 -output "$out\lobby-knowledge.webp"
cropAndPadWithinCell -input $alphaSheet -crop '512x512+512+0'     -padding 16 -max-size 512x512 -webp-quality 82 -output "$out\entity-character.webp"
cropAndPadWithinCell -input $alphaSheet -crop '512x512+1024+0'    -padding 16 -max-size 512x512 -webp-quality 82 -output "$out\entity-staff.webp"
cropAndPadWithinCell -input $alphaSheet -crop '512x512+0+512'     -padding 16 -max-size 512x512 -webp-quality 82 -output "$out\entity-tag.webp"
cropAndPadWithinCell -input $alphaSheet -crop '512x512+512+512'   -padding 16 -max-size 512x512 -webp-quality 82 -output "$out\lobby-ranking.webp"
cropAndPadWithinCell -input $alphaSheet -crop '512x512+1024+512'  -padding 16 -max-size 512x512 -webp-quality 82 -output "$out\lobby-settings.webp"
```

Slice mapping is reading order: `(0,0)` knowledge/open-book, `(512,0)` character/portrait-frame, `(1024,0)` staff/microphone, `(0,512)` Tag/hanging-tag, `(512,512)` ranking/podium, `(1024,512)` settings/palette-and-gear.

The source files above remain outside the repository; only derived, optimized runtime assets are checked in.
