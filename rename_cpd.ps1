Get-ChildItem -Path 'C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\Examples' -Recurse -Filter '*.cpd' | ForEach-Object {
    $newName = $_.Name -replace '\.cpd$','.hcalc'
    Rename-Item -Path $_.FullName -NewName $newName
    Write-Output "  $($_.Name) -> $newName"
}
Write-Output "Done."
