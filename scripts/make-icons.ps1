# Makes every LifeOS icon from one picture: docs/brand/lifeos-icon.png (see docs/brand.md).
# Run: npm run icons   (Windows; uses .NET's System.Drawing, no packages)
#  - rounded icon (transparent corners): PC/web icons, lifeos.ico, Android legacy icons
#  - edge-to-edge version for Android's icon shapes and the installable web app (maskable): the artwork
#    a little smaller, fading into the average colour of its own edges, so any mask shape looks right
# The small white icons (notification, themed icon) are simple drawings in res/drawable, not made here.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class IconArt {
    // The rounded square inside the picture (the outside is black): found by scanning the middle lines.
    public static Rectangle Tile(Bitmap src) {
        int w = src.Width, h = src.Height, cy = h / 2, cx = w / 2, l = 0, r = w - 1, t = 0, b = h - 1;
        Func<Color, bool> lit = c => c.R + c.G + c.B > 45;
        while (l < cx && !lit(src.GetPixel(l, cy))) l++;
        while (r > cx && !lit(src.GetPixel(r, cy))) r--;
        while (t < cy && !lit(src.GetPixel(cx, t))) t++;
        while (b > cy && !lit(src.GetPixel(cx, b))) b--;
        int side = Math.Min(r - l, b - t);
        return new Rectangle(l, t, side, side);
    }

    public static Bitmap Scale(Image src, Rectangle from, int size) {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(src, new Rectangle(0, 0, size, size), from, GraphicsUnit.Pixel);
        }
        return bmp;
    }

    // The tile at `size`, cut to a rounded square (radius as a share of the size) or a circle, with smooth edges.
    public static Bitmap Rounded(Bitmap src, Rectangle tile, int size, float radius, bool circle) {
        using (var art = Scale(src, tile, size)) {
            var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            using (var path = new GraphicsPath())
            using (var brush = new TextureBrush(art)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                if (circle) path.AddEllipse(0, 0, size - 1, size - 1);
                else {
                    float d = size * radius * 2;
                    path.AddArc(0, 0, d, d, 180, 90);
                    path.AddArc(size - 1 - d, 0, d, d, 270, 90);
                    path.AddArc(size - 1 - d, size - 1 - d, d, d, 0, 90);
                    path.AddArc(0, size - 1 - d, d, d, 90, 90);
                    path.CloseFigure();
                }
                g.FillPath(brush, path);
            }
            return bmp;
        }
    }

    // Edge to edge: the canvas is the average edge colour of the tile's inner square; the inner square sits
    // in the middle at `scale`, its edges fading into that colour.
    public static Bitmap FullBleed(Bitmap src, Rectangle tile, int size, float scale) {
        int inset = (int)(tile.Width * 0.075); // inside the rounded corners: no black
        var inner = new Rectangle(tile.X + inset, tile.Y + inset, tile.Width - 2 * inset, tile.Height - 2 * inset);
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(EdgeColour(src, inner));
            int s = (int)(size * scale);
            using (var art = Scale(src, inner, s)) {
                Feather(art, 0.2f);
                g.DrawImage(art, (size - s) / 2, (size - s) / 2, s, s);
            }
        }
        return bmp;
    }

    // The average colour along the edges of an area: the background the artwork fades into.
    static Color EdgeColour(Bitmap src, Rectangle r) {
        long red = 0, green = 0, blue = 0, n = 0;
        for (int i = 0; i < r.Width; i += 4)
            foreach (var p in new[] { new Point(r.X + i, r.Y + 2), new Point(r.X + i, r.Bottom - 3), new Point(r.X + 2, r.Y + i), new Point(r.Right - 3, r.Y + i) }) {
                var c = src.GetPixel(p.X, p.Y);
                red += c.R; green += c.G; blue += c.B; n++;
            }
        return Color.FromArgb((int)(red / n), (int)(green / n), (int)(blue / n));
    }

    static void Feather(Bitmap bmp, float edge) {
        int w = bmp.Width, h = bmp.Height;
        var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        var px = new byte[data.Stride * h];
        System.Runtime.InteropServices.Marshal.Copy(data.Scan0, px, 0, px.Length);
        float band = w * edge;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                float d = Math.Min(Math.Min(x, w - 1 - x), Math.Min(y, h - 1 - y));
                float a = Math.Min(1f, d / band);
                int i = y * data.Stride + x * 4 + 3;
                px[i] = (byte)(px[i] * a * a * (3 - 2 * a)); // smoothstep
            }
        System.Runtime.InteropServices.Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);
    }
}
'@

$repo = Split-Path -Parent $PSScriptRoot
$src = [Drawing.Bitmap]::FromFile((Join-Path $repo "docs\brand\lifeos-icon.png"))
$tile = [IconArt]::Tile($src)
$res = Join-Path $repo "android\app\src\main\res"
$web = Join-Path $repo "public\icons"
function Save($bmp, $path) { New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null; $bmp.Save($path, [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }
$R = 0.225 # corner radius of the rounded icon, as in the picture

# Web and PC
foreach ($s in 32, 192, 512) { Save ([IconArt]::Rounded($src, $tile, $s, $R, $false)) (Join-Path $web "icon-$s.png") }
Save ([IconArt]::FullBleed($src, $tile, 512, 0.8)) (Join-Path $web "maskable-512.png")

# Windows .ico: PNG images inside an icon directory
$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = foreach ($s in $sizes) {
  $ms = New-Object IO.MemoryStream
  $b = [IconArt]::Rounded($src, $tile, $s, $R, $false); $b.Save($ms, [Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
  , $ms.ToArray()
}
$out = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter($out)
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $w.Write([byte]($s % 256)); $w.Write([byte]($s % 256)); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$pngs[$i].Length); $w.Write([uint32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
[IO.File]::WriteAllBytes((Join-Path $web "lifeos.ico"), $out.ToArray())

# Android: adaptive icon layer (108dp) per density, and legacy icons (48dp) for Android 7
$dens = @{ mdpi = 1; hdpi = 1.5; xhdpi = 2; xxhdpi = 3; xxxhdpi = 4 }
foreach ($d in $dens.Keys) {
  $f = $dens[$d]
  # Launchers show about the middle 61% of this layer (and zoom it a little), so the artwork is 60% wide.
  Save ([IconArt]::FullBleed($src, $tile, [int](108 * $f), 0.6)) (Join-Path $res "drawable-$d\ic_launcher_art.png")
  Save ([IconArt]::Rounded($src, $tile, [int](48 * $f), $R, $false)) (Join-Path $res "mipmap-$d\ic_launcher.png")
  Save ([IconArt]::Rounded($src, $tile, [int](48 * $f), $R, $true)) (Join-Path $res "mipmap-$d\ic_launcher_round.png")
}
$src.Dispose()
"Icons written from docs/brand/lifeos-icon.png (tile $($tile.Width) px at $($tile.X),$($tile.Y))."
