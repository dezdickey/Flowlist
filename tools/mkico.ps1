# Pack PNGs into a Windows .ico.
#
# The format is a six-byte header, a sixteen-byte directory entry per
# image, then the images themselves. Since Vista an entry may hold a PNG
# as-is rather than a bitmap, which is why no conversion is needed here.
# A width or height byte of 0 means 256 — the field is one byte, so that
# is the only way to say it.
param(
  [string]$Dir = (Join-Path $PSScriptRoot "ico"),
  [string]$Out = (Join-Path (Split-Path $PSScriptRoot -Parent) "Flowlist.ico")
)
$sizes = @(16, 32, 48, 256)
$imgs = foreach ($s in $sizes) { ,([IO.File]::ReadAllBytes((Join-Path $Dir "$s.png"))) }

$ms = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter($ms)
$w.Write([UInt16]0)               # reserved
$w.Write([UInt16]1)               # type: icon
$w.Write([UInt16]$sizes.Count)

$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $w.Write([Byte]($(if ($s -ge 256) { 0 } else { $s })))   # width
  $w.Write([Byte]($(if ($s -ge 256) { 0 } else { $s })))   # height
  $w.Write([Byte]0)               # palette colours: none
  $w.Write([Byte]0)               # reserved
  $w.Write([UInt16]1)             # colour planes
  $w.Write([UInt16]32)            # bits per pixel
  $w.Write([UInt32]$imgs[$i].Length)
  $w.Write([UInt32]$offset)
  $offset += $imgs[$i].Length
}
foreach ($img in $imgs) { $w.Write($img) }
$w.Flush()
[IO.File]::WriteAllBytes($Out, $ms.ToArray())
$w.Dispose(); $ms.Dispose()
"wrote $Out ({0} bytes)" -f (Get-Item $Out).Length
