$W = 650; $H = 400
$ml = 55; $mr = 25; $mt = 30; $mb = 45
$pw = $W - $ml - $mr; $ph = $H - $mt - $mb
function sx($v) { $script:ml + $v / 3.0 * $script:pw }
function sy($v) { $script:mt + $script:ph - $v / 4.5 * $script:ph }
$xi = @(0.125, 0.2, 0.25, 0.5, 0.707, 1.0, 2.0)
$colors = @('#E53935','#7CB342','#1E88E5','#FFB300','#C2185B','#00C853','#7B1FA2')
$svg = "<svg xmlns='http://www.w3.org/2000/svg' width='$W' height='$H' style='background:#fff;font-family:sans-serif'>`n"
$svg += "<rect x='$ml' y='$mt' width='$pw' height='$ph' fill='none' stroke='#999'/>`n"
$svg += "<text x='$($W/2)' y='18' text-anchor='middle' font-size='13' font-weight='bold'>PowerShell SVG</text>`n"
for ($k = 0; $k -lt $xi.Count; $k++) {
    $pts = ""
    for ($i = 0; $i -lt 300; $i++) {
        $r = 0.01 + $i * 2.99 / 299
        $d = [Math]::Pow(1 - $r*$r, 2) + [Math]::Pow(2*$xi[$k]*$r, 2)
        $D = if ($d -gt 1e-12) { [Math]::Min(1/[Math]::Sqrt($d), 4.5) } else { 4.5 }
        $pts += "$(([Math]::Round((sx $r),1))),$(([Math]::Round((sy $D),1))) "
    }
    $da = if ($k -gt 3) { " stroke-dasharray='8,4'" } else { "" }
    $lw = if ($k -lt 4) { "2" } else { "1.5" }
    $svg += "<polyline points='$pts' fill='none' stroke='$($colors[$k])' stroke-width='$lw'$da/>`n"
}
$lx = $ml + $pw - 110
$svg += "<rect x='$($lx-5)' y='$($mt+6)' width='115' height='$($xi.Count*16+8)' rx='3' fill='white' fill-opacity='0.9' stroke='#ddd'/>`n"
for ($k = 0; $k -lt $xi.Count; $k++) {
    $ly = $mt + 20 + $k * 16
    $da = if ($k -gt 3) { " stroke-dasharray='6,3'" } else { "" }
    $svg += "<line x1='$lx' y1='$ly' x2='$($lx+22)' y2='$ly' stroke='$($colors[$k])' stroke-width='2'$da/>`n"
    $svg += "<text x='$($lx+27)' y='$($ly+4)' font-size='10'>$($xi[$k])</text>`n"
}
$svg += "</svg>"
Write-Output $svg
