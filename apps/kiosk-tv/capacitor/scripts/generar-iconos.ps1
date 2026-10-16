# Genera los íconos del launcher (adaptativo, clásico y redondo) y el banner de 320x180 de Android TV
# a partir del escudo del kiosco (icono-kiosco.jpg, fondo blanco).
param(
  [string]$Logo = "$PSScriptRoot\icono-kiosco.jpg",
  [string]$Res = "$PSScriptRoot\..\android\app\src\main\res"
)
Add-Type -AssemblyName System.Drawing
$escudo = [System.Drawing.Image]::FromFile((Resolve-Path $Logo))

function Nuevo-Lienzo([int]$ancho, [int]$alto) {
  $b = New-Object System.Drawing.Bitmap $ancho, $alto
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::White)
  return @($b, $g)
}

# Dibuja el escudo centrado, contenido en un cuadrado de `lado` píxeles sin deformarlo.
function Dibujar-Escudo($g, [int]$ancho, [int]$alto, [double]$lado) {
  $escala = $lado / [Math]::Max($escudo.Width, $escudo.Height)
  $w = $escudo.Width * $escala; $h = $escudo.Height * $escala
  $g.DrawImage($escudo, ($ancho - $w) / 2, ($alto - $h) / 2, $w, $h)
}

function Guardar($bitmap, $g, $ruta) {
  New-Item -ItemType Directory -Force (Split-Path $ruta) | Out-Null
  $bitmap.Save($ruta, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bitmap.Dispose()
}

$densidades = @{ mdpi = 1; hdpi = 1.5; xhdpi = 2; xxhdpi = 3; xxxhdpi = 4 }
foreach ($d in $densidades.Keys) {
  $f = $densidades[$d]
  # Adaptativo: lienzo de 108dp, el escudo dentro de la zona segura (66dp) para que ninguna máscara lo recorte.
  $lado = [int](108 * $f)
  $b, $g = Nuevo-Lienzo $lado $lado
  Dibujar-Escudo $g $lado $lado (66 * $f)
  Guardar $b $g "$Res\mipmap-$d\ic_launcher_foreground.png"

  # Clásico (48dp) y redondo (48dp, recortado en círculo).
  $lado = [int](48 * $f)
  $b, $g = Nuevo-Lienzo $lado $lado
  Dibujar-Escudo $g $lado $lado ($lado * 0.92)
  Guardar $b $g "$Res\mipmap-$d\ic_launcher.png"

  $b, $g = Nuevo-Lienzo $lado $lado
  Dibujar-Escudo $g $lado $lado ($lado * 0.78)
  $redondo = New-Object System.Drawing.Bitmap $lado, $lado
  $gr = [System.Drawing.Graphics]::FromImage($redondo)
  $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gr.Clear([System.Drawing.Color]::Transparent)
  $ruta = New-Object System.Drawing.Drawing2D.GraphicsPath
  $ruta.AddEllipse(0, 0, $lado - 1, $lado - 1)
  $gr.SetClip($ruta)
  $gr.DrawImage($b, 0, 0, $lado, $lado)
  $g.Dispose(); $b.Dispose()
  Guardar $redondo $gr "$Res\mipmap-$d\ic_launcher_round.png"
}

# Banner de Android TV (320x180).
$b, $g = Nuevo-Lienzo 320 180
Dibujar-Escudo $g 320 180 164
Guardar $b $g "$Res\drawable-xhdpi\banner.png"

$escudo.Dispose()
Write-Host "Íconos y banner generados en $Res"
