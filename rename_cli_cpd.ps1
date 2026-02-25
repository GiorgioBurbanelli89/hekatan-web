# Rename .cpd -> .hcalc in CLI Examples
$cliExamples = 'C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\Hekatan.Cli\Examples'
$count = 0
Get-ChildItem -Path $cliExamples -Recurse -Filter '*.cpd' | ForEach-Object {
    $newName = $_.Name -replace '\.cpd$','.hcalc'
    Rename-Item -Path $_.FullName -NewName $newName
    $count++
}
Write-Output "Renamed $count files in CLI Examples"

# Fix #include directives inside all .hcalc files in CLI Examples
$fixed = 0
Get-ChildItem -Path $cliExamples -Recurse -Filter '*.hcalc' | ForEach-Object {
    $content = Get-Content -Path $_.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -and $content -match '\.cpd') {
        $newContent = $content -replace '\.cpd', '.hcalc'
        Set-Content -Path $_.FullName -Value $newContent -NoNewline
        Write-Output "  Fixed includes in: $($_.Name)"
        $fixed++
    }
}
Write-Output "Fixed #include in $fixed files"

# Also fix #include in main Examples
$mainExamples = 'C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\Examples'
$fixed2 = 0
Get-ChildItem -Path $mainExamples -Recurse -Filter '*.hcalc' | ForEach-Object {
    $content = Get-Content -Path $_.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -and $content -match '#include.*\.cpd') {
        $newContent = $content -replace '\.cpd', '.hcalc'
        Set-Content -Path $_.FullName -Value $newContent -NoNewline
        Write-Output "  Fixed includes in: $($_.Name)"
        $fixed2++
    }
}
Write-Output "Fixed #include in $fixed2 files (main Examples)"
Write-Output "Done."
