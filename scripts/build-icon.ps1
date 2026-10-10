$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot '..\public\icons\ChatGPT Image Oct 6, 2026, 09_59_38 AM.png'
$targetPath = Join-Path $PSScriptRoot '..\public\icons\icon.ico'
$source = [System.Drawing.Image]::FromFile($sourcePath)
$sizes = @(256, 128, 64, 48, 32, 16)
$images = @()

try {
  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap(
      $size,
      $size,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $stream = New-Object System.IO.MemoryStream
    $imageWriter = New-Object System.IO.BinaryWriter($stream)

    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, 0, 0, $size, $size)

      $imageWriter.Write([UInt32]40)
      $imageWriter.Write([Int32]$size)
      $imageWriter.Write([Int32]($size * 2))
      $imageWriter.Write([UInt16]1)
      $imageWriter.Write([UInt16]32)
      $imageWriter.Write([UInt32]0)
      $imageWriter.Write([UInt32]($size * $size * 4))
      $imageWriter.Write([Int32]0)
      $imageWriter.Write([Int32]0)
      $imageWriter.Write([UInt32]0)
      $imageWriter.Write([UInt32]0)

      for ($y = $size - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $size; $x++) {
          $pixel = $bitmap.GetPixel($x, $y)
          $imageWriter.Write([Byte]$pixel.B)
          $imageWriter.Write([Byte]$pixel.G)
          $imageWriter.Write([Byte]$pixel.R)
          $imageWriter.Write([Byte]$pixel.A)
        }
      }

      $maskStride = [Math]::Ceiling($size / 32) * 4
      $imageWriter.Write((New-Object Byte[] ($maskStride * $size)))
      $imageWriter.Flush()
      $images += [PSCustomObject]@{ Size = $size; Data = $stream.ToArray() }
    } finally {
      $imageWriter.Dispose()
      $stream.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $source.Dispose()
}

$output = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($output)
$offset = 6 + 16 * $images.Count

try {
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$images.Count)

  foreach ($image in $images) {
    $dimension = if ($image.Size -eq 256) { 0 } else { $image.Size }
    $writer.Write([Byte]$dimension)
    $writer.Write([Byte]$dimension)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$image.Data.Length)
    $writer.Write([UInt32]$offset)
    $offset += $image.Data.Length
  }

  foreach ($image in $images) {
    $writer.Write($image.Data)
  }

  [System.IO.File]::WriteAllBytes($targetPath, $output.ToArray())
} finally {
  $writer.Dispose()
  $output.Dispose()
}

$icon = [System.Drawing.Icon]::new($targetPath)
$preview = $icon.ToBitmap()
try {
  Write-Output "Created $targetPath with $($images.Count) sizes; Windows reads $($preview.Width)x$($preview.Height)."
} finally {
  $preview.Dispose()
  $icon.Dispose()
}
