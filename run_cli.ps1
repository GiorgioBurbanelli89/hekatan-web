$machinePath = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine')
$userPath = [System.Environment]::GetEnvironmentVariable('PATH', 'User')
$env:PATH = $machinePath + ';' + $userPath + ';C:\Program Files\R\R-4.5.2\bin'

# Debug: verify languages are reachable
Write-Output "=== PATH CHECK ==="
foreach ($cmd in @('go', 'ruby', 'php', 'Rscript', 'pwsh', 'bash')) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) { Write-Output "  $cmd -> $($found.Source)" }
    else { Write-Output "  $cmd -> NOT FOUND" }
}
Write-Output "=================="

$logFile = 'C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\cli_output.log'
Set-Location 'C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\Hekatan.Cli\bin\Release\net10.0'
& .\Hekatan.Cli.exe 'C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\Examples\Factor_DMF_Showcase.hcalc' html 2>&1 | Tee-Object -FilePath $logFile
Write-Output "=== CLI DONE ==="
