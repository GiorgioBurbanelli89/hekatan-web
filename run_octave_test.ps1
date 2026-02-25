$ErrorActionPreference = 'SilentlyContinue'
$out = & octave-cli --quiet "C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\test_octave_png.m" 2>&1
$stdout = $out | Where-Object { $_ -is [string] -or $_.GetType().Name -ne 'ErrorRecord' } | Out-String
$stdout | Out-File -FilePath "C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\test_octave_out.txt" -Encoding utf8
Write-Output "Done. Output length: $($stdout.Length) chars"
