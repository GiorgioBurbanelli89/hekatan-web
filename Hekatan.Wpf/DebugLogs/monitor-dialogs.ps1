# Monitor de Diálogos - Captura CONTENIDO completo
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$logFile = "C:\Users\j-b-j\Documents\Calcpad-7.5.7\Calcpad.Wpf\DebugLogs\dialog-content.log"
"=== Monitor de Contenido de Diálogos iniciado: $(Get-Date) ===" | Out-File -FilePath $logFile -Encoding UTF8

Write-Host "=== MONITOR DE CONTENIDO ===" -ForegroundColor Cyan
Write-Host "Capturando texto dentro de diálogos..." -ForegroundColor Yellow
Write-Host ""

$proc = Get-Process | Where-Object { $_.ProcessName -like "*Calcpad*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1

if (-not $proc) {
    Write-Host "ERROR: Calcpad no encontrado" -ForegroundColor Red
    exit 1
}

$dialogsFound = @{}

while ($true) {
    try {
        $proc.Refresh()
        if ($proc.HasExited) { break }

        $root = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)

        # Buscar ventanas hijas (diálogos)
        $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Window
        )

        $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $windowCondition)

        $mainTitle = $root.Current.Name

        foreach ($window in $windows) {
            try {
                $dialogTitle = $window.Current.Name

                if ($dialogTitle -and $dialogTitle -ne $mainTitle) {
                    $key = "Dialog_$dialogTitle"

                    if (-not $dialogsFound.ContainsKey($key)) {
                        $timestamp = Get-Date -Format "HH:mm:ss.fff"

                        Write-Host ""
                        Write-Host "[$timestamp] ========================================" -ForegroundColor Cyan
                        Write-Host "[$timestamp] DIÁLOGO DETECTADO: $dialogTitle" -ForegroundColor Yellow
                        Write-Host "[$timestamp] ========================================" -ForegroundColor Cyan

                        "[$timestamp] ========================================"  | Out-File -FilePath $logFile -Append -Encoding UTF8
                        "[$timestamp] DIÁLOGO: $dialogTitle" | Out-File -FilePath $logFile -Append -Encoding UTF8
                        "[$timestamp] ========================================" | Out-File -FilePath $logFile -Append -Encoding UTF8

                        # Buscar TODO el texto dentro del diálogo
                        $allCondition = [System.Windows.Automation.Condition]::TrueCondition
                        $allElements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $allCondition)

                        foreach ($element in $allElements) {
                            try {
                                $elemName = $element.Current.Name
                                $elemType = $element.Current.ControlType.ProgrammaticName -replace "ControlType.", ""
                                $elemId = $element.Current.AutomationId

                                # Capturar texto
                                if ($elemName -and $elemName.Length -gt 0) {
                                    $info = "  [$elemType]"
                                    if ($elemId) { $info += " ID='$elemId'" }
                                    $info += " -> $elemName"

                                    Write-Host $info -ForegroundColor White
                                    $info | Out-File -FilePath $logFile -Append -Encoding UTF8
                                }

                                # Intentar obtener texto con TextPattern
                                try {
                                    $textPattern = $element.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
                                    if ($textPattern) {
                                        $text = $textPattern.DocumentRange.GetText(1000)
                                        if ($text -and $text.Length -gt 0) {
                                            Write-Host "  [TEXT PATTERN] -> $text" -ForegroundColor Cyan
                                            "  [TEXT PATTERN] -> $text" | Out-File -FilePath $logFile -Append -Encoding UTF8
                                        }
                                    }
                                }
                                catch { }

                                # Intentar obtener valor con ValuePattern
                                try {
                                    $valuePattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                                    if ($valuePattern) {
                                        $value = $valuePattern.Current.Value
                                        if ($value -and $value.Length -gt 0) {
                                            Write-Host "  [VALUE PATTERN] -> $value" -ForegroundColor Green
                                            "  [VALUE PATTERN] -> $value" | Out-File -FilePath $logFile -Append -Encoding UTF8
                                        }
                                    }
                                }
                                catch { }
                            }
                            catch { }
                        }

                        Write-Host "[$timestamp] ========================================" -ForegroundColor Cyan
                        Write-Host ""

                        "[$timestamp] ========================================" | Out-File -FilePath $logFile -Append -Encoding UTF8
                        "" | Out-File -FilePath $logFile -Append -Encoding UTF8

                        $dialogsFound[$key] = $true
                    }
                }
            }
            catch { }
        }

        # Limpiar diálogos que ya no existen
        $keysToRemove = @()
        foreach ($key in $dialogsFound.Keys) {
            $dialogName = $key.Substring(7)
            $found = $false
            foreach ($window in $windows) {
                if ($window.Current.Name -eq $dialogName) {
                    $found = $true
                    break
                }
            }
            if (-not $found) {
                $keysToRemove += $key
            }
        }
        foreach ($key in $keysToRemove) {
            $dialogsFound.Remove($key)
        }

        Start-Sleep -Milliseconds 50
    }
    catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Start-Sleep -Milliseconds 200
    }
}

Write-Host "Monitor detenido" -ForegroundColor Yellow
