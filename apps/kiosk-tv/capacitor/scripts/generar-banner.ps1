# Genera el banner de 320x180 que muestra el launcher de Android TV, a partir del escudo del kiosco.
param(
  [string]$Logo = "$PSScriptRoot\..\..\..\kiosk\public\branding\adrenalina-gym-bg.png",
  [string]$Salida = "$PSScriptRoot\..\android\app\src\main\res\drawable-xhdpi\banner.png"
)
Add-Type -AssemblyName System.Drawing
$escudo = [System.Drawing.Image]::FromFile((Resolve-Path $Logo))
$lienzo = New-Object System.Drawing.Bitmap 320, 180
$g = [System.Drawing.Graphics]::FromImage($lienzo)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#0a0d07"))
$lado = 170
$g.DrawImage($escudo, (320 - $lado) / 2, (180 - $lado) / 2, $lado, $lado)
New-Item -ItemType Directory -Force (Split-Path $Salida) | Out-Null
$lienzo.Save($Salida, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $lienzo.Dispose(); $escudo.Dispose()
Write-Host "Banner generado: $Salida"
