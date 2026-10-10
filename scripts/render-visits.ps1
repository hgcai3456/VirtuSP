param(
  [Parameter(Mandatory = $true)][string]$JobPath
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Speech

$json = [IO.File]::ReadAllText($JobPath, [Text.Encoding]::UTF8)
$job = $json | ConvertFrom-Json

function Parse-Pos([string]$pos) {
  $fy = 0.22
  if ($pos -match '(\d+(?:\.\d+)?)%') {
    $fy = [double]$Matches[1] / 100
  }
  return @{ X = 0.5; Y = $fy }
}

function Wrap-Text($g, [string]$text, $font, [single]$width) {
  $lines = New-Object System.Collections.Generic.List[string]
  $cur = ''
  foreach ($word in ($text -split '\s+')) {
    if (-not $word) { continue }
    $try = if ($cur) { "$cur $word" } else { $word }
    if ($g.MeasureString($try, $font).Width -gt $width -and $cur) {
      $lines.Add($cur)
      $cur = $word
    } else {
      $cur = $try
    }
  }
  if ($cur) { $lines.Add($cur) }
  if ($lines.Count -eq 0) { $lines.Add('') }
  return $lines
}

function Draw-Cover($g, $img, $rect, $fx, $fy) {
  $scale = [Math]::Max($rect.Width / $img.Width, $rect.Height / $img.Height)
  $dw = $img.Width * $scale
  $dh = $img.Height * $scale
  $dx = $rect.X + ($rect.Width * $fx) - ($dw * $fx)
  $dy = $rect.Y + ($rect.Height * $fy) - ($dh * $fy)
  $g.SetClip($rect)
  $g.DrawImage($img, [single]$dx, [single]$dy, [single]$dw, [single]$dh)
  $g.ResetClip()
}

function Wav-Seconds([string]$path) {
  $fs = [IO.File]::OpenRead($path)
  $br = New-Object IO.BinaryReader($fs)
  try {
    $fs.Position = 24
    $rate = $br.ReadInt32()
    $fs.Position = 28
    $byteRate = $br.ReadInt32()
    $fs.Position = 40
    $data = $br.ReadInt32()
    if ($byteRate -le 0) { return 2.5 }
    return [Math]::Max(1.4, $data / $byteRate)
  } finally {
    $br.Dispose()
    $fs.Dispose()
  }
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fontName = 'Segoe UI'
$titleFont = New-Object System.Drawing.Font($fontName, 34, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$kickerFont = New-Object System.Drawing.Font($fontName, 16, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = New-Object System.Drawing.Font($fontName, 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$labelFont = New-Object System.Drawing.Font($fontName, 14, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$bg = [System.Drawing.Color]::FromArgb(255, 16, 34, 38)
$ink = [System.Drawing.Color]::FromArgb(255, 231, 244, 242)
$muted = [System.Drawing.Color]::FromArgb(255, 168, 196, 194)
$studentBg = [System.Drawing.Color]::FromArgb(255, 28, 52, 56)
$patientBg = [System.Drawing.Color]::FromArgb(255, 14, 78, 78)
$chartBg = [System.Drawing.Color]::FromArgb(255, 48, 36, 18)
$chartInk = [System.Drawing.Color]::FromArgb(255, 246, 173, 85)

foreach ($patient in $job.patients) {
  $dir = Join-Path $job.out $patient.id
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $img = [System.Drawing.Image]::FromFile($patient.photo)
  $focus = Parse-Pos $patient.photoPos
  $beats = @(@{ w = 'Title'; t = "$($patient.name), $($patient.age). $($patient.diagnosis)." }) + @($patient.lines)
  $manifest = @()
  $shown = @()

  for ($i = 0; $i -lt $beats.Count; $i++) {
    $beat = $beats[$i]
    $tag = '{0:D2}' -f $i
    $png = Join-Path $dir "$tag.png"
    $bmp = New-Object System.Drawing.Bitmap 1280, 720
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.Clear($bg)
    $photoRect = New-Object System.Drawing.Rectangle 0, 0, 500, 720
    Draw-Cover $g $img $photoRect $focus.X $focus.Y
    $shade = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 8, 16, 18))
    $g.FillRectangle($shade, 0, 560, 500, 160)
    $shade.Dispose()
    $white = New-Object System.Drawing.SolidBrush $ink
    $soft = New-Object System.Drawing.SolidBrush $muted
    $g.DrawString('VirtuSP', $kickerFont, $soft, 28, 28)
    $g.DrawString($patient.name, $titleFont, $white, 28, 590)
    $g.DrawString("$($patient.age) - $($patient.diagnosis)", $kickerFont, $soft, 28, 636)

    if ($beat.w -eq 'Title') {
      $g.DrawString('Sample teaching conversation', $bodyFont, $white, 540, 300)
    } else {
      $shown += $beat
      $visible = @($shown | Select-Object -Last 4)
      $wrapped = New-Object System.Collections.Generic.List[object]
      foreach ($line in $visible) {
        $textLines = @(Wrap-Text $g $line.t $bodyFont 680)
        $wrapped.Add([pscustomobject]@{
          w = [string]$line.w
          lines = $textLines
          h = 28 + ($textLines.Count * 30) + 22
        })
      }
      $total = 0
      foreach ($item in $wrapped) { $total += $item.h }
      if ($wrapped.Count -gt 1) { $total += ($wrapped.Count - 1) * 12 }
      $y = 688 - $total
      if ($y -lt 96) { $y = 96 }
      $current = $visible.Count - 1
      for ($n = 0; $n -lt $wrapped.Count; $n++) {
        $item = $wrapped[$n]
        $fill = $studentBg
        $color = $ink
        if ($item.w -eq 'Patient') { $fill = $patientBg }
        if ($item.w -eq 'Chart') { $fill = $chartBg; $color = $chartInk }
        $brush = New-Object System.Drawing.SolidBrush $fill
        $g.FillRectangle($brush, 528, $y, 720, $item.h)
        $brush.Dispose()
        if ($n -eq $current) {
          $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 79, 209, 197), 3)
          $g.DrawRectangle($pen, 528, $y, 720, $item.h)
          $pen.Dispose()
        }
        $label = New-Object System.Drawing.SolidBrush $(if ($item.w -eq 'Chart') { $chartInk } else { $muted })
        $g.DrawString($item.w.ToUpper(), $labelFont, $label, 548, ($y + 10))
        $label.Dispose()
        $textBrush = New-Object System.Drawing.SolidBrush $color
        $ty = $y + 32
        foreach ($textLine in $item.lines) {
          $g.DrawString($textLine, $bodyFont, $textBrush, 548, $ty)
          $ty += 30
        }
        $textBrush.Dispose()
        $y += $item.h + 12
      }
    }

    $white.Dispose()
    $soft.Dispose()
    $g.Dispose()
    $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    $entry = @{ file = $png; silent = $true; seconds = 2.6 }
    if ($beat.w -eq 'Student' -or $beat.w -eq 'Patient') {
      $wav = Join-Path $dir "$tag.wav"
      $voice = if ($beat.w -eq 'Patient') { $patient.patientVoice } else { $patient.studentVoice }
      $rate = if ($beat.w -eq 'Patient') { [int]$patient.patientRate } else { 0 }
      $synth.SelectVoice($voice)
      $synth.Rate = $rate
      $synth.SetOutputToWaveFile($wav)
      $synth.Speak($beat.t)
      $synth.SetOutputToNull()
      $entry.silent = $false
      $entry.wav = $wav
      $entry.seconds = [Math]::Round((Wav-Seconds $wav) + 0.45, 2)
    } elseif ($beat.w -eq 'Chart') {
      $entry.seconds = 3.2
    }
    $manifest += $entry
    Write-Host "$($patient.id) $tag $($beat.w)"
  }

  $img.Dispose()
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $dir 'manifest.json')
}

$synth.Dispose()
$titleFont.Dispose()
$kickerFont.Dispose()
$bodyFont.Dispose()
$labelFont.Dispose()
Write-Host 'frames ready'
