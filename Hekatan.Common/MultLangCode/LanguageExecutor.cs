#nullable enable
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Executes code in external languages (Python, Octave, C++, etc.)
    /// </summary>
    public class LanguageExecutor
    {
        private readonly MultLangConfig _config;
        private readonly string _tempDir;
        private ExecutionTracker? _tracker;

        public LanguageExecutor(ExecutionTracker? tracker = null)
        {
            _config = MultLangManager.Config;
            _tempDir = Path.Combine(Path.GetTempPath(), _config.Settings.TempDirectory);
            Directory.CreateDirectory(_tempDir);
            _tracker = tracker;
        }

        /// <summary>
        /// Executes a code block and returns the result
        /// </summary>
        /// <param name="block">Code block to execute</param>
        /// <param name="variables">Variables to inject</param>
        /// <param name="progressCallback">Callback for progress updates (e.g., "Compilando... 5ms")</param>
        public ExecutionResult Execute(CodeBlock block, Dictionary<string, object>? variables = null, Action<string>? progressCallback = null)
        {
            _tracker?.EnterMethod("LanguageExecutor", "Execute", $"Language: {block.Language}");

            // Extract base language and custom filename from patterns like "ts:getColorMap"
            // Also handle patterns like "vite C:/path/to/project" where we only want "vite"
            var languageName = block.Language;
            string? customFilename = null;

            // Check for space first (e.g., "vite C:/path/to/project")
            var spaceIndex = languageName.IndexOf(' ');
            if (spaceIndex > 0)
            {
                // Extract only the language name before the space
                languageName = languageName.Substring(0, spaceIndex);
                _tracker?.ReportStep($"Detected space in language, extracted base: '{languageName}'");
            }

            // Then check for colon pattern (e.g., "ts:getColorMap")
            var colonIndex = languageName.IndexOf(':');
            if (colonIndex > 0)
            {
                customFilename = languageName.Substring(colonIndex + 1);
                languageName = languageName.Substring(0, colonIndex);
                _tracker?.ReportStep($"Detected custom filename pattern: base='{languageName}', filename='{customFilename}'");
            }

            _tracker?.ReportStep($"Checking if language '{languageName}' is configured");
            if (!_config.Languages.TryGetValue(languageName, out var langDef))
            {
                _tracker?.ReportStep($"ERROR: Language '{languageName}' not found in config");
                return new ExecutionResult
                {
                    Success = false,
                    Error = $"Language '{languageName}' not configured"
                };
            }

            _tracker?.ReportStep($"Language configured: Command={langDef.Command}, Extension={langDef.Extension}");

            // Special handling for XAML, WPF, Avalonia, C#, CSS, and HTML
            var language = languageName.ToLower();
            if (language == "xaml" || language == "wpf")
            {
                _tracker?.ReportStep("Detected WPF project, routing to ExecuteWpfProject");
                return ExecuteWpfProject(block);
            }
            if (language == "avalonia")
            {
                _tracker?.ReportStep("Detected Avalonia project, routing to ExecuteAvaloniaProject");
                return ExecuteAvaloniaProject(block);
            }
            if (language == "csharp")
            {
                _tracker?.ReportStep("Detected C# project, routing to ExecuteCSharpProject");
                return ExecuteCSharpProject(block);
            }

            // Prepare code with variable injection if needed (before CSS/HTML check)
            var code = block.Code;
            if (_config.Settings.ShareVariables && variables != null)
            {
                code = InjectVariables(code, variables, langDef);
            }

            // Special handling for Three.js Viewer (awatif-style structure)
            if (language == "three")
            {
                _tracker?.ReportStep("Detected Three.js block, generating 3D viewer HTML");
                return ExecuteThreeCode(code);
            }

            // Special handling for Vite (runs TypeScript projects with Vite dev server)
            if (language == "vite")
            {
                _tracker?.ReportStep("Detected vite block, executing project with Vite");
                return ExecuteViteProject(code, block.StartDirective);
            }

            // Special handling for CSS and HTML (no command execution needed)
            if (language == "css")
            {
                _tracker?.ReportStep("Detected CSS block, saving to styles.css");
                // CSS: Just save to file, don't execute
                var cssPath = Path.Combine(_tempDir, "styles.css");
                File.WriteAllText(cssPath, code);
                _tracker?.ReportStep($"CSS saved to: {cssPath}");
                return new ExecutionResult
                {
                    Success = true,
                    Output = $"CSS saved to: {cssPath}"
                };
            }

            if (language == "html" || language == "html:embed")
            {
                // HTML: Save and inject references to CSS and JS if they exist
                var htmlPath = Path.Combine(_tempDir, "index.html");
                var modifiedHtml = InjectCssAndJsReferences(code, _tempDir);
                File.WriteAllText(htmlPath, modifiedHtml);

                // If html:embed, return the HTML as an iframe with srcdoc for embedding
                if (language == "html:embed" || block.Language.ToLower() == "html:embed")
                {
                    _tracker?.ReportStep("HTML embed mode - returning iframe with srcdoc");
                    // Escape quotes and special chars for srcdoc attribute
                    var escapedHtml = modifiedHtml
                        .Replace("&", "&amp;")
                        .Replace("\"", "&quot;")
                        .Replace("<", "&lt;")
                        .Replace(">", "&gt;");

                    // Return an iframe that will display the HTML inline
                    var iframeHtml = $"<iframe srcdoc=\"{escapedHtml}\" style=\"width:100%; height:500px; border:1px solid #ccc; border-radius:4px;\"></iframe>";

                    return new ExecutionResult
                    {
                        Success = true,
                        Output = iframeHtml,
                        IsHtmlOutput = true
                    };
                }

                // Regular html - Open HTML in default browser
                try
                {
                    var process = new Process
                    {
                        StartInfo = new ProcessStartInfo(htmlPath)
                        {
                            UseShellExecute = true
                        }
                    };
                    process.Start();

                    return new ExecutionResult
                    {
                        Success = true,
                        Output = $"HTML opened in browser: {htmlPath}"
                    };
                }
                catch (Exception ex)
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"Failed to open HTML: {ex.Message}"
                    };
                }
            }

            // Now check if language is available in PATH (for languages that need execution)
            _tracker?.ReportStep($"Checking if '{languageName}' is available in PATH");
            if (!MultLangManager.IsLanguageAvailable(languageName))
            {
                _tracker?.ReportStep($"ERROR: '{languageName}' not found in PATH");
                return new ExecutionResult
                {
                    Success = false,
                    Error = $"Language '{languageName}' not found in PATH. Please install {langDef.Command}"
                };
            }

            _tracker?.ReportStep($"'{languageName}' is available in PATH");

            // Special handling for TypeScript with custom filename: @{ts:filename} or @{typescript:filename}
            if (language == "ts" || language == "typescript")
            {
                // Use the customFilename extracted earlier, or default to "script"
                var customName = !string.IsNullOrEmpty(customFilename) ? customFilename : "script";
                // Sanitize filename
                customName = System.Text.RegularExpressions.Regex.Replace(customName, @"[^\w\-]", "_");

                var tsPath = Path.Combine(_tempDir, $"{customName}.ts");
                var jsPath = Path.Combine(_tempDir, $"{customName}.js");

                _tracker?.ReportStep($"TypeScript file: {customName}.ts");
                File.WriteAllText(tsPath, code);

                // Check if this is a module (has exports but no direct execution code)
                // Modules with only exports don't need to be executed directly
                var isModuleOnly = code.Contains("export ") &&
                                   !code.Contains("console.log") &&
                                   !code.Contains("document.") &&
                                   customName != "main";

                if (isModuleOnly)
                {
                    // Just save the file, don't execute - it will be imported by main.ts
                    _tracker?.ReportStep($"Module saved: {customName}.ts (will be imported)");
                    return new ExecutionResult
                    {
                        Success = true,
                        Output = $"Module saved: {tsPath}\nReady for import from other TypeScript files."
                    };
                }

                // Execute with tsx (this will compile and run, supporting imports)
                var result = ExecuteFile(tsPath, langDef, progressCallback);

                // After execution, if main.ts was executed successfully, generate HTML for WebView2
                if (result.Success && customName == "main")
                {
                    try
                    {
                        // Find all .ts files in temp directory
                        var tsFiles = Directory.GetFiles(_tempDir, "*.ts");
                        _tracker?.ReportStep($"Found {tsFiles.Length} TypeScript files");

                        // Compile all TypeScript files to JavaScript with esbuild (faster) or tsc
                        var allJsFiles = new List<string>();
                        foreach (var tsFile in tsFiles)
                        {
                            var jsFile = Path.ChangeExtension(tsFile, ".js");
                            var tsFileName = Path.GetFileName(tsFile);

                            // Use esbuild for fast bundling (if available), otherwise tsc
                            var esbuildResult = RunProcess("npx",
                                $"esbuild \"{tsFile}\" --bundle --format=esm --outfile=\"{jsFile}\" --platform=browser",
                                $"Compilando {tsFileName}", progressCallback);

                            if (!esbuildResult.Success)
                            {
                                // Fallback to tsc
                                var tscResult = RunProcess("tsc",
                                    $"\"{tsFile}\" --outDir \"{_tempDir}\" --target ES2020 --module ES2020 --moduleResolution node",
                                    $"Compilando {tsFileName} con tsc", progressCallback);
                            }

                            if (File.Exists(jsFile))
                            {
                                allJsFiles.Add(jsFile);
                            }
                        }

                        // Generate index.html with importmap for browser
                        var htmlPath = Path.Combine(_tempDir, "index.html");
                        var htmlContent = GenerateModuleHtml(allJsFiles, _tempDir);
                        File.WriteAllText(htmlPath, htmlContent);

                        _tracker?.ReportStep($"Generated index.html with {allJsFiles.Count} modules");
                        result.Output += $"\n\nGenerated browser-ready HTML: {htmlPath}";
                        result.Output += $"\nModules compiled: {string.Join(", ", allJsFiles.Select(Path.GetFileName))}";
                    }
                    catch (Exception ex)
                    {
                        _tracker?.ReportStep($"Error generating HTML: {ex.Message}");
                    }
                }

                return result;
            }

            // Write code to temp file
            var fileName = $"hekatan_{Guid.NewGuid():N}{langDef.Extension}";
            var filePath = Path.Combine(_tempDir, fileName);

            try
            {
                // Normalize line endings to \n to avoid \r\r\n issues that break R, PHP, etc.
                code = code.Replace("\r\n", "\n").Replace("\r", "\n");
                // Use BOM-free UTF-8 to avoid breaking R, PowerShell and other interpreters
                File.WriteAllText(filePath, code, new UTF8Encoding(false));

                // Execute
                return ExecuteFile(filePath, langDef, progressCallback);
            }
            finally
            {
                // Cleanup (pero no borrar CSS, HTML, JS para que estén disponibles)
                if (language != "css" && language != "html" && language != "typescript" && language != "ts")
                {
                    if (File.Exists(filePath))
                        File.Delete(filePath);
                }
            }
        }

        /// <summary>
        /// Executes a file with the appropriate interpreter/compiler
        /// </summary>
        private ExecutionResult ExecuteFile(string filePath, LanguageDefinition langDef, Action<string>? progressCallback)
        {
            var result = new ExecutionResult();

            try
            {
                // Compiled languages (C++, C, Rust, etc.)
                if (langDef.RequiresCompilation)
                {
                    return ExecuteCompiledLanguage(filePath, langDef, progressCallback);
                }
                else
                {
                    // Interpreted languages (Python, PowerShell, etc.)
                    return ExecuteInterpretedLanguage(filePath, langDef, progressCallback);
                }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Error = ex.Message;
            }

            return result;
        }

        /// <summary>
        /// Executes a compiled language (compile then run)
        /// </summary>
        private ExecutionResult ExecuteCompiledLanguage(string filePath, LanguageDefinition langDef, Action<string>? progressCallback)
        {
            var exePath = Path.ChangeExtension(filePath, ".exe");

            try
            {
                // Build compile arguments
                var compileArgs = langDef.CompileArgs
                    .Replace("{input}", $"\"{filePath}\"")
                    .Replace("{output}", $"\"{exePath}\"");

                // If no compile args defined, use default for g++
                if (string.IsNullOrEmpty(compileArgs))
                {
                    compileArgs = $"\"{filePath}\" -o \"{exePath}\"";
                }

                // Step 1: Compile
                var compileResult = RunProcess(langDef.Command, compileArgs, "Compilando", progressCallback);

                // g++ returns exit code 0 on success but may have warnings in stderr
                if (!compileResult.Success && compileResult.ExitCode != 0)
                {
                    // Return compilation error
                    var errorMsg = !string.IsNullOrEmpty(compileResult.Error)
                        ? compileResult.Error
                        : compileResult.Output;
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"Compilation failed:\n{errorMsg}"
                    };
                }

                // Verify executable was created
                if (!File.Exists(exePath))
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"Compilation succeeded but executable not found at: {exePath}"
                    };
                }

                // Wait a moment for the compiler to fully release the file
                // This prevents "Access denied" errors on Windows
                System.Threading.Thread.Sleep(500);

                // Resolve the compiler's bin directory so the compiled exe can find runtime DLLs
                // (e.g., libstdc++-6.dll, libgcc_s_seh-1.dll for MinGW compiled executables)
                string? compilerBinDir = null;
                try
                {
                    var compilerCommand = langDef.Command;
                    // Try to find the full path of the compiler using 'where' on Windows
                    if (OperatingSystem.IsWindows())
                    {
                        var whereResult = RunProcess("where", compilerCommand, "Buscando compilador");
                        if (whereResult.Success && !string.IsNullOrWhiteSpace(whereResult.Output))
                        {
                            var firstLine = whereResult.Output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                            if (!string.IsNullOrEmpty(firstLine) && File.Exists(firstLine.Trim()))
                            {
                                compilerBinDir = Path.GetDirectoryName(firstLine.Trim());
                            }
                        }
                    }
                    else
                    {
                        var whichResult = RunProcess("which", compilerCommand, "Buscando compilador");
                        if (whichResult.Success && !string.IsNullOrWhiteSpace(whichResult.Output))
                        {
                            var firstLine = whichResult.Output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                            if (!string.IsNullOrEmpty(firstLine))
                            {
                                compilerBinDir = Path.GetDirectoryName(firstLine.Trim());
                            }
                        }
                    }
                }
                catch { /* Ignore - static linking should handle most cases */ }

                // Step 2: Execute compiled binary
                // For GUI applications (Qt, GTK, etc.), start without waiting
                if (langDef.IsGuiApplication)
                {
                    return RunGuiProcess(exePath, langDef, progressCallback);
                }

                // For console applications, wait for completion with retry logic
                ExecutionResult runResult = null;
                int maxRetries = 3;
                int retryCount = 0;

                while (retryCount < maxRetries)
                {
                    try
                    {
                        runResult = RunProcess(exePath, "", "Ejecutando", progressCallback, extraPathDir: compilerBinDir);

                        // If successful or not an access denied error, break
                        if (runResult.Success || !runResult.Error?.Contains("Access") == true)
                            break;

                        // Access denied - wait and retry
                        retryCount++;
                        if (retryCount < maxRetries)
                        {
                            System.Threading.Thread.Sleep(1000);
                        }
                    }
                    catch (System.ComponentModel.Win32Exception ex) when (ex.Message.Contains("Access"))
                    {
                        retryCount++;
                        if (retryCount >= maxRetries)
                        {
                            return new ExecutionResult
                            {
                                Success = false,
                                Error = $"Access denied after {maxRetries} retries. Windows may be blocking the executable. Try disabling antivirus temporarily or adding an exception for the temp folder."
                            };
                        }
                        System.Threading.Thread.Sleep(1000);
                    }
                }

                return runResult;
            }
            finally
            {
                // Cleanup executable
                // Don't delete immediately - may be locked by Windows Defender scan
                // Let Windows clean up temp files automatically
                // if (File.Exists(exePath))
                //     File.Delete(exePath);
            }
        }

        /// <summary>
        /// Executes an interpreted language
        /// </summary>
        private ExecutionResult ExecuteInterpretedLanguage(string filePath, LanguageDefinition langDef, Action<string>? progressCallback)
        {
            var effectivePath = filePath;
            var effectiveCommand = langDef.Command;

            // On Windows, bash requires special path handling.
            // Prefer Git Bash or MSYS2 over WSL bash because they handle /c/ paths
            // and don't require a separate Linux distro to be installed.
            if (OperatingSystem.IsWindows() &&
                (langDef.Command.Equals("bash", StringComparison.OrdinalIgnoreCase) ||
                 langDef.Command.Contains("/sh", StringComparison.OrdinalIgnoreCase)))
            {
                // Resolve bash: prefer Git Bash > MSYS2 > system (WSL)
                var gitBash = @"C:\Program Files\Git\bin\bash.exe";
                var msysBash = @"C:\msys64\usr\bin\bash.exe";
                bool useWsl = false;

                if (File.Exists(gitBash))
                    effectiveCommand = gitBash;
                else if (File.Exists(msysBash))
                    effectiveCommand = msysBash;
                else
                    useWsl = true; // System bash is likely WSL

                // Convert path to POSIX format
                effectivePath = filePath.Replace("\\", "/");
                if (effectivePath.Length >= 2 && effectivePath[1] == ':')
                {
                    var driveLetter = char.ToLower(effectivePath[0]);
                    if (useWsl)
                        effectivePath = $"/mnt/{driveLetter}{effectivePath.Substring(2)}";
                    else
                        effectivePath = $"/{driveLetter}{effectivePath.Substring(2)}";
                }
            }

            var arguments = langDef.RunArgs.Replace("{file}", effectivePath);

            // If RunArgs is empty, use default
            if (string.IsNullOrEmpty(langDef.RunArgs))
            {
                arguments = $"\"{effectivePath}\"";
            }

            // Debug: Log the command being executed
            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hekatan-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] ExecuteInterpretedLanguage: {effectiveCommand} {arguments}\n");
            }
            catch { }

            return RunProcess(effectiveCommand, arguments, "Ejecutando", progressCallback);
        }

        /// <summary>
        /// Runs a GUI process without waiting for it to complete
        /// Used for Qt, GTK, WPF and other GUI applications
        /// </summary>
        private ExecutionResult RunGuiProcess(string exePath, LanguageDefinition langDef, Action<string>? progressCallback)
        {
            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hekatan-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] RunGuiProcess START: {exePath}\n");

                // For Qt applications, we need to set PATH to include Qt DLLs
                var startInfo = new ProcessStartInfo
                {
                    FileName = exePath,
                    UseShellExecute = false,
                    CreateNoWindow = false,
                    RedirectStandardOutput = false,
                    RedirectStandardError = false
                };

                // Add Qt/library paths to environment
                var currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
                var qtPaths = "C:\\msys64\\ucrt64\\bin;C:\\msys64\\mingw64\\bin";
                startInfo.Environment["PATH"] = $"{qtPaths};{currentPath}";

                var process = Process.Start(startInfo);

                if (process != null)
                {
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss}] RunGuiProcess: Started PID {process.Id}\n");

                    // Give the window time to appear
                    System.Threading.Thread.Sleep(500);

                    return new ExecutionResult
                    {
                        Success = true,
                        Output = $"GUI application started (PID: {process.Id})\nWindow should be visible now.",
                        ExitCode = 0
                    };
                }
                else
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = "Failed to start GUI process"
                    };
                }
            }
            catch (Exception ex)
            {
                return new ExecutionResult
                {
                    Success = false,
                    Error = $"Error starting GUI process: {ex.Message}"
                };
            }
        }

        /// <summary>
        /// Runs a process and captures output
        /// </summary>
        /// <param name="command">Command to execute</param>
        /// <param name="arguments">Arguments for the command</param>
        /// <param name="actionPrefix">Prefix for progress messages (e.g., "Compilando", "Ejecutando")</param>
        /// <param name="progressCallback">Callback to report progress</param>
        private ExecutionResult RunProcess(string command, string arguments, string actionPrefix = "Ejecutando", Action<string>? progressCallback = null, string? extraPathDir = null)
        {
            // Debug: Log the command being executed
            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hekatan-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] RunProcess START: {command} {arguments}\n");
            }
            catch { }

            var result = new ExecutionResult();
            var output = new StringBuilder();
            var error = new StringBuilder();

            try
            {
                var fileName = command;
                var args = arguments;

                var startInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = args,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = !command.Contains("octave-gui", StringComparison.OrdinalIgnoreCase),
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };

                // Tell pyhekatan (and other Hekatan-aware libs) to emit @@HEKATAN markers
                startInfo.EnvironmentVariables["HEKATAN_RENDER"] = "1";

                // Add DLL paths to PATH for compiled executables
                if (command.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                {
                    var qtPath = @"C:\msys64\ucrt64\bin";
                    var gtkPath = @"C:\Program Files (x86)\GTK2-Runtime\bin";
                    var currentPath = startInfo.EnvironmentVariables["PATH"] ?? Environment.GetEnvironmentVariable("PATH") ?? "";
                    var extraPath = !string.IsNullOrEmpty(extraPathDir) ? $"{extraPathDir};" : "";
                    startInfo.EnvironmentVariables["PATH"] = $"{extraPath}{qtPath};{gtkPath};{currentPath}";
                }

                if (!command.Contains("octave", StringComparison.OrdinalIgnoreCase) &&
                    !command.Contains("OpenSees", StringComparison.OrdinalIgnoreCase))
                {
                    startInfo.EnvironmentVariables["QT_QPA_PLATFORM"] = "offscreen";
                }

                using var process = new Process { StartInfo = startInfo };

                process.OutputDataReceived += (s, e) =>
                {
                    if (e.Data != null)
                        output.AppendLine(e.Data);
                };

                process.ErrorDataReceived += (s, e) =>
                {
                    if (e.Data != null)
                        error.AppendLine(e.Data);
                };

                // Try to start the process directly first.
                // If it fails (Win32Exception = file not found for .cmd wrappers like tsx, npx),
                // retry with cmd.exe /c wrapping on Windows.
                bool processStarted = false;
                int retryCount = 0;
                int maxRetries = command.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? 3 : 1;

                while (!processStarted && retryCount < maxRetries)
                {
                    try
                    {
                        try
                        {
                            var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hekatan-debug.txt");
                            System.IO.File.AppendAllText(debugPath,
                                $"[{DateTime.Now:HH:mm:ss}] Attempting to start process (attempt {retryCount + 1}/{maxRetries}): {startInfo.FileName} {startInfo.Arguments}\n");
                        }
                        catch { }

                        process.Start();
                        processStarted = true;

                        try
                        {
                            var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hekatan-debug.txt");
                            System.IO.File.AppendAllText(debugPath,
                                $"[{DateTime.Now:HH:mm:ss}] Process started successfully!\n");
                        }
                        catch { }
                    }
                    catch (System.ComponentModel.Win32Exception ex) when (ex.Message.Contains("Access") && retryCount < maxRetries - 1)
                    {
                        retryCount++;
                        try
                        {
                            var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hekatan-debug.txt");
                            System.IO.File.AppendAllText(debugPath,
                                $"[{DateTime.Now:HH:mm:ss}] Access denied! Retry {retryCount}/{maxRetries}. Waiting 1s...\n");
                        }
                        catch { }
                        System.Threading.Thread.Sleep(1000);
                    }
                    catch (System.ComponentModel.Win32Exception ex) when (
                        OperatingSystem.IsWindows() &&
                        !command.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) &&
                        !System.IO.Path.IsPathRooted(command) &&
                        startInfo.FileName != "cmd.exe")
                    {
                        // Command not found directly (e.g., tsx is a .cmd wrapper on Windows).
                        // Fallback: retry with cmd.exe /c wrapping.
                        try
                        {
                            var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hekatan-debug.txt");
                            System.IO.File.AppendAllText(debugPath,
                                $"[{DateTime.Now:HH:mm:ss}] Direct start failed ({ex.Message}), retrying with cmd.exe /c {command}\n");
                        }
                        catch { }

                        startInfo.FileName = "cmd.exe";
                        startInfo.Arguments = $"/c {command} {arguments}";
                        // Don't increment retryCount - this is a different strategy, not a retry
                    }
                    catch (Exception ex)
                    {
                        try
                        {
                            var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hekatan-debug.txt");
                            System.IO.File.AppendAllText(debugPath,
                                $"[{DateTime.Now:HH:mm:ss}] Unexpected exception: {ex.GetType().Name}: {ex.Message}\n");
                        }
                        catch { }

                        throw;
                    }
                }

                if (!processStarted)
                {
                    throw new System.ComponentModel.Win32Exception("Could not start process after retries.");
                }
                var startTime = Stopwatch.StartNew();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                // Poll with progress updates instead of simple WaitForExit
                const int pollInterval = 50; // Check every 50ms
                var timeout = _config.Settings.Timeout;
                bool completed = false;

                while (!completed && startTime.ElapsedMilliseconds < timeout)
                {
                    completed = process.WaitForExit(pollInterval);

                    // Report progress every poll
                    if (!completed && progressCallback != null)
                    {
                        var elapsedMs = startTime.ElapsedMilliseconds;
                        progressCallback($"{actionPrefix}... {elapsedMs}ms");
                    }
                }

                if (!completed)
                {
                    process.Kill();
                    result.Success = false;
                    result.Error = $"Execution timed out after {_config.Settings.Timeout}ms";
                    return result;
                }

                // Wait for async output/error streams to complete
                // This is necessary because WaitForExit(timeout) can return before async handlers finish
                process.WaitForExit();

                result.Success = process.ExitCode == 0;
                result.Output = output.ToString().TrimEnd();
                result.Error = error.ToString().TrimEnd();
                result.ExitCode = process.ExitCode;

                // Special handling for programs like OpenSees that write everything to stderr
                // If stdout is empty but stderr contains HTML output (not just error messages),
                // extract the HTML content from stderr as the actual output
                if (string.IsNullOrWhiteSpace(result.Output) && !string.IsNullOrWhiteSpace(result.Error) && result.Success)
                {
                    // Check if stderr contains HTML tags (like <p>, <ul>, <li>, etc.)
                    var stderrContent = result.Error;
                    if (stderrContent.Contains("<p>") || stderrContent.Contains("<ul>") ||
                        stderrContent.Contains("<li>") || stderrContent.Contains("<strong>"))
                    {
                        // Extract lines that look like HTML output (not banner/header text)
                        var lines = stderrContent.Split('\n');
                        var htmlOutput = new StringBuilder();
                        foreach (var line in lines)
                        {
                            var trimmed = line.Trim();
                            if (trimmed.StartsWith("<") && !string.IsNullOrWhiteSpace(trimmed))
                            {
                                htmlOutput.AppendLine(trimmed);
                            }
                        }
                        if (htmlOutput.Length > 0)
                        {
                            result.Output = htmlOutput.ToString().TrimEnd();
                            // Keep the banner/non-HTML parts as error for debugging
                            // but don't treat it as an error condition
                        }
                    }
                }

                // Debug: Log execution result
                try
                {
                    var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hekatan-debug.txt");
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss}] RunProcess RESULT: ExitCode={process.ExitCode}, Success={result.Success}\n");
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss}] RunProcess OUTPUT: {result.Output.Substring(0, Math.Min(200, result.Output.Length))}\n");
                    if (!string.IsNullOrEmpty(result.Error))
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] RunProcess ERROR: {result.Error.Substring(0, Math.Min(200, result.Error.Length))}\n");
                }
                catch { }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Error = ex.Message;
            }

            return result;
        }

        /// <summary>
        /// Injects CSS and JS references into HTML if the files exist
        /// </summary>
        private string InjectCssAndJsReferences(string html, string tempDir)
        {
            var cssPath = Path.Combine(tempDir, "styles.css");
            var jsPath = Path.Combine(tempDir, "script.js");

            var injections = new StringBuilder();

            // Inject CSS reference if file exists
            if (File.Exists(cssPath))
            {
                injections.AppendLine("    <link rel=\"stylesheet\" href=\"styles.css\">");
            }

            // Inject JS reference if file exists
            if (File.Exists(jsPath))
            {
                injections.AppendLine("    <script src=\"script.js\"></script>");
            }

            // If nothing to inject, return original HTML
            if (injections.Length == 0)
                return html;

            // Try to inject before </head> tag
            if (html.Contains("</head>", StringComparison.OrdinalIgnoreCase))
            {
                var closeHeadIndex = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
                return html.Insert(closeHeadIndex, injections.ToString());
            }

            // If no </head>, try to inject after <head>
            if (html.Contains("<head>", StringComparison.OrdinalIgnoreCase))
            {
                var openHeadIndex = html.IndexOf("<head>", StringComparison.OrdinalIgnoreCase) + 6;
                return html.Insert(openHeadIndex, "\n" + injections.ToString());
            }

            // If no <head> at all, inject at the beginning
            return injections.ToString() + html;
        }

        /// <summary>
        /// Injects Hekatan variables into the code.
        /// For interpreted languages (Python, Julia, R, Octave, Bash, etc.) variables go at the top.
        /// For compiled languages (C, C++, Fortran, Rust, D, etc.) variables are inserted AFTER
        /// the first opening brace/program statement so they don't break compilation.
        /// </summary>
        private string InjectVariables(string code, Dictionary<string, object> variables, LanguageDefinition langDef)
        {
            if (variables == null || variables.Count == 0)
                return code;

            // Build variable declarations in correct syntax for the target language
            var varLines = new List<string>();
            var comment = langDef.CommentPrefix ?? "//";
            varLines.Add($"{comment} Variables from Hekatan:");

            // Languages that require float literals (6.0 not 6) for typed float variables
            bool needsFloatLiteral = langDef.Extension is ".rs" or ".f90" or ".f95" or ".f03" or ".f"
                or ".c" or ".cpp" or ".cc" or ".cxx" or ".d" or ".cs";

            foreach (var (name, value) in variables)
            {
                // Only inject simple numeric variables - skip everything else:

                // 1. Skip non-ASCII names (Greek letters like ν, α, β)
                if (name.Any(ch => ch > 127))
                    continue;

                // 2. Skip internal/system variables (start with _ or contain __)
                if (name.StartsWith("_") || name.Contains("__"))
                    continue;

                // 3. Skip triangle mesh data (tri_x_0, tri_e0_1, tri_nNodes, etc.)
                if (name.StartsWith("tri_"))
                    continue;

                // 4. Only inject numeric values (double, int, float) - skip objects, strings, lists
                if (value is not (double or int or float or long or decimal))
                    continue;

                // 5. Skip variables already declared in the user's code
                if (IsVariableDeclaredInCode(code, name, langDef.Extension))
                    continue;

                var fmtVal = needsFloatLiteral ? FormatFloatValue(value) : FormatValue(value);
                var varLine = langDef.Extension switch
                {
                    ".py" => $"{name} = {fmtVal}",
                    ".m" => $"{name} = {fmtVal};",
                    ".jl" => $"{name} = {fmtVal}",
                    ".R" or ".r" => $"{name} <- {fmtVal}",
                    ".js" => $"var {name} = {fmtVal};",  // var avoids TDZ with let/const
                    ".ts" => $"var {name}: number = {fmtVal};",
                    ".lua" => $"local {name} = {fmtVal}",
                    ".pl" => $"my ${name} = {fmtVal};",
                    ".rb" => $"{name} = {fmtVal}",
                    ".php" => $"${name} = {fmtVal};",
                    ".sh" => $"{name}={fmtVal}",  // bash: no spaces around =
                    ".ps1" => $"${name} = {fmtVal}",  // PowerShell variables use $
                    ".cpp" or ".cc" or ".cxx" => $"auto {name} = {fmtVal};",
                    ".c" => $"double {name} = {fmtVal};",
                    ".f90" or ".f95" or ".f03" or ".f" => $"real(8) :: {name} = {fmtVal}",
                    ".rs" => $"let {name}: f64 = {fmtVal};",
                    ".d" => $"double {name} = {fmtVal};",
                    ".cs" => $"double {name} = {fmtVal};",
                    ".go" => $"var {name} float64 = {fmtVal}",
                    ".hs" => $"{name} = {fmtVal}",
                    _ => $"{name} = {fmtVal}"
                };
                varLines.Add(varLine);
            }

            var varBlock = string.Join("\n", varLines) + "\n";

            // For interpreted languages: prepend at top (safe)
            if (!langDef.RequiresCompilation)
            {
                return varBlock + "\n" + code;
            }

            // For compiled languages: insert AFTER the entry point to avoid breaking compilation.
            // Each compiled language has a different entry point pattern.
            return langDef.Extension switch
            {
                ".f90" or ".f95" or ".f03" or ".f" => InjectAfterPattern(code, varBlock,
                    new[] { "implicit none", "program " }, insertAfterLine: true),
                ".c" => InjectAfterPattern(code, varBlock,
                    new[] { "int main" }, insertAfterLine: true, skipOpenBrace: true),
                ".cpp" or ".cc" or ".cxx" => InjectAfterPattern(code, varBlock,
                    new[] { "int main" }, insertAfterLine: true, skipOpenBrace: true),
                ".rs" => InjectAfterPattern(code, varBlock,
                    new[] { "fn main()" }, insertAfterLine: true, skipOpenBrace: true),
                ".d" => InjectAfterPattern(code, varBlock,
                    new[] { "void main()", "{" }, insertAfterLine: true),
                ".cs" => InjectAfterPattern(code, varBlock,
                    new[] { "static void Main", "{" }, insertAfterLine: true),
                _ => varBlock + "\n" + code  // fallback: prepend
            };
        }

        /// <summary>
        /// Inserts a variable block AFTER the first line matching one of the patterns.
        /// Patterns are searched BY PRIORITY: the entire code is scanned for patterns[0] first,
        /// then patterns[1], etc. This ensures e.g. Fortran injects after "implicit none" when
        /// present, falling back to "program " only if "implicit none" isn't found.
        /// </summary>
        private static string InjectAfterPattern(string code, string varBlock, string[] patterns,
            bool insertAfterLine, bool skipOpenBrace = false)
        {
            var lines = code.Split('\n');
            int insertIdx = -1;

            // Search by pattern priority: check ALL lines for patterns[0], then patterns[1], etc.
            foreach (var pat in patterns)
            {
                for (int i = 0; i < lines.Length; i++)
                {
                    var trimmed = lines[i].TrimEnd('\r').Trim().ToLower();
                    if (trimmed.Contains(pat.ToLower()))
                    {
                        insertIdx = i;
                        // If we need to skip past the opening brace (e.g., Rust "fn main() {")
                        if (skipOpenBrace)
                        {
                            if (!trimmed.Contains("{"))
                            {
                                // Look for the opening brace on subsequent lines
                                for (int j = i + 1; j < lines.Length; j++)
                                {
                                    if (lines[j].TrimEnd('\r').Trim().StartsWith("{"))
                                    {
                                        insertIdx = j;
                                        break;
                                    }
                                }
                            }
                        }
                        goto found;
                    }
                }
            }

        found:
            if (insertIdx < 0)
            {
                // Pattern not found - prepend (best effort)
                return varBlock + "\n" + code;
            }

            // Insert after the matched line
            var sb = new StringBuilder();
            for (int i = 0; i <= insertIdx; i++)
                sb.AppendLine(lines[i].TrimEnd('\r'));
            sb.AppendLine(varBlock);
            for (int i = insertIdx + 1; i < lines.Length; i++)
            {
                if (i < lines.Length - 1)
                    sb.AppendLine(lines[i].TrimEnd('\r'));
                else
                    sb.Append(lines[i].TrimEnd('\r')); // no trailing newline on last line
            }

            return sb.ToString();
        }

        /// <summary>
        /// Formats a value for the target language
        /// </summary>
        private static string FormatValue(object value)
        {
            return value switch
            {
                double d => d.ToString(System.Globalization.CultureInfo.InvariantCulture),
                int i => i.ToString(),
                bool b => b.ToString().ToLower(),
                string s => $"\"{s}\"",
                _ => value.ToString() ?? "null"
            };
        }

        /// <summary>
        /// Formats a numeric value ensuring it always has a decimal point.
        /// Required for statically-typed languages (C, Rust, Fortran) where 6 != 6.0.
        /// </summary>
        private static string FormatFloatValue(object value)
        {
            double num = value switch
            {
                double d => d,
                int i => (double)i,
                float f => (double)f,
                _ => 0.0
            };
            var s = num.ToString(System.Globalization.CultureInfo.InvariantCulture);
            // Ensure decimal point (e.g., "6" → "6.0", but "3.14" stays "3.14")
            if (!s.Contains('.') && !s.Contains('E') && !s.Contains('e'))
                s += ".0";
            return s;
        }

        /// <summary>
        /// Checks if a variable name is already declared in the user's source code.
        /// Prevents redeclaration errors (e.g., JS "var r" + "const r" → SyntaxError).
        /// </summary>
        private static bool IsVariableDeclaredInCode(string code, string varName, string extension)
        {
            var esc = Regex.Escape(varName);

            // Build regex patterns for common declaration forms by language family
            var patterns = extension switch
            {
                ".js" or ".ts" => new[] {
                    $@"\b(const|let|var)\s+{esc}\b",        // const x = ...
                    $@"\b(const|let|var)\s+.*,\s*{esc}\b"   // const a = 1, x = 2
                },
                ".rs" => new[] { $@"\blet\s+(mut\s+)?{esc}\b" },
                ".c" or ".cpp" or ".cc" or ".cxx" or ".d" => new[] {
                    $@"\b(int|double|float|long|short|char|auto|unsigned)\s+{esc}\b",  // double t
                    $@"\b(int|double|float|long|short|char|auto|unsigned)\s+\w+.*,\s*{esc}\b"  // double E, t
                },
                ".cs" => new[] {
                    $@"\b(int|double|float|var|decimal|long)\s+{esc}\b",
                    $@"\b(int|double|float|var|decimal|long)\s+\w+.*,\s*{esc}\b"
                },
                ".f90" or ".f95" or ".f03" or ".f" => new[] {
                    $@"\b(integer|real|double\s+precision|character|logical)\b.*::\s*{esc}\b",
                    $@"::\s*\w+.*,\s*{esc}\b"  // :: a, b, t
                },
                ".py" => new[] { $@"^{esc}\s*=" },
                ".m" => new[] { $@"^{esc}\s*=" },  // Octave
                ".pl" => new[] { $@"\bmy\s+\${esc}\b", $@"\${esc}\s*=" },
                ".lua" => new[] { $@"\blocal\s+{esc}\b" },
                ".go" => new[] { $@"\bvar\s+{esc}\b", $@"{esc}\s*:=" },
                ".rb" => new[] { $@"^{esc}\s*=" },
                ".php" => new[] { $@"\${esc}\s*=" },
                ".sh" => new[] { $@"^{esc}=" },  // bash: name=value (no spaces)
                ".ps1" => new[] { $@"\${esc}\s*=" },  // PowerShell: $name = value
                _ => Array.Empty<string>()
            };

            foreach (var pat in patterns)
            {
                if (Regex.IsMatch(code, pat, RegexOptions.Multiline | RegexOptions.IgnoreCase))
                    return true;
            }
            return false;
        }

        /// <summary>
        /// Executes a C# console project
        /// </summary>
        private ExecutionResult ExecuteCSharpProject(CodeBlock block)
        {
            var projectName = $"CSharpTemp_{Guid.NewGuid():N}";
            var projectDir = Path.Combine(_tempDir, projectName);

            try
            {
                // Create console project
                var createResult = RunProcess("dotnet", $"new console -n {projectName} -o \"{projectDir}\"");
                if (!createResult.Success)
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"Failed to create C# project:\n{createResult.Error}"
                    };
                }

                // Modify .csproj to disable implicit usings and top-level statements
                var csprojPath = Path.Combine(projectDir, $"{projectName}.csproj");
                if (File.Exists(csprojPath))
                {
                    var csprojContent = File.ReadAllText(csprojPath);
                    csprojContent = csprojContent.Replace("</PropertyGroup>",
                        "    <ImplicitUsings>disable</ImplicitUsings>\n  </PropertyGroup>");
                    File.WriteAllText(csprojPath, csprojContent);
                }

                // Replace Program.cs with user code
                var programCsPath = Path.Combine(projectDir, "Program.cs");
                File.WriteAllText(programCsPath, block.Code);

                // Build project
                var buildResult = RunProcess("dotnet", $"build \"{projectDir}\" --configuration Release");
                if (!buildResult.Success || buildResult.ExitCode != 0)
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"Build failed:\n{buildResult.Error}\n{buildResult.Output}"
                    };
                }

                // Run project
                var runResult = RunProcess("dotnet", $"run --project \"{projectDir}\" --configuration Release --no-build");

                return new ExecutionResult
                {
                    Success = runResult.ExitCode == 0,
                    Output = runResult.Output,
                    Error = runResult.Error,
                    ExitCode = runResult.ExitCode
                };
            }
            catch (Exception ex)
            {
                return new ExecutionResult
                {
                    Success = false,
                    Error = $"C# execution failed: {ex.Message}"
                };
            }
            finally
            {
                // Cleanup project directory
                try
                {
                    if (Directory.Exists(projectDir))
                        Directory.Delete(projectDir, true);
                }
                catch { }
            }
        }

        /// <summary>
        /// Executes an Avalonia UI project
        /// </summary>
        private ExecutionResult ExecuteAvaloniaProject(CodeBlock block)
        {
            _tracker?.ReportStep("Executing Avalonia/C# code");
            var fileName = $"temp_avalonia_{Guid.NewGuid():N}";
            var sourceFile = Path.Combine(_tempDir, fileName + ".cs");
            var exeFile = Path.Combine(_tempDir, fileName + ".exe");

            try
            {
                // Write user code to file
                _tracker?.ReportStep($"Writing code to {sourceFile}");
                File.WriteAllText(sourceFile, block.Code);

                // Compile using C# compiler (simple console app approach)
                _tracker?.ReportStep("Compiling C# code");
                var compileArgs = $"/out:\"{exeFile}\" \"{sourceFile}\"";

                // Try csc first (if available)
                var compileResult = RunProcess("csc", compileArgs);

                if (!compileResult.Success || compileResult.ExitCode != 0)
                {
                    // Fallback to dotnet if csc fails
                    _tracker?.ReportStep("csc not found, trying dotnet build");

                    // Create a minimal .csproj for dotnet
                    var projectFile = Path.Combine(_tempDir, fileName + ".csproj");
                    var csprojContent = $@"<Project Sdk=""Microsoft.NET.Sdk"">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include=""{fileName}.cs"" />
  </ItemGroup>
</Project>";
                    File.WriteAllText(projectFile, csprojContent);

                    compileResult = RunProcess("dotnet", $"build \"{projectFile}\" -c Release -o \"{_tempDir}\"");

                    if (!compileResult.Success || compileResult.ExitCode != 0)
                    {
                        return new ExecutionResult
                        {
                            Success = false,
                            Error = $"Compilation failed:\n\n{compileResult.Error}\n\n{compileResult.Output}"
                        };
                    }

                    exeFile = Path.Combine(_tempDir, fileName + ".exe");
                }

                // Run the compiled executable
                _tracker?.ReportStep("Running compiled program");
                var runResult = RunProcess(exeFile, "", "Ejecutando");

                return new ExecutionResult
                {
                    Success = true,
                    Output = $"{runResult.Output}\n\n{runResult.Error}".Trim()
                };
            }
            catch (Exception ex)
            {
                _tracker?.ReportStep($"ERROR in execution: {ex.Message}");
                return new ExecutionResult
                {
                    Success = false,
                    Error = $"Execution failed: {ex.Message}"
                };
            }
            finally
            {
                // Clean up
                try
                {
                    if (File.Exists(sourceFile)) File.Delete(sourceFile);
                    if (File.Exists(exeFile)) File.Delete(exeFile);
                }
                catch { }
            }
        }

        /// <summary>
        /// Executes a WPF/XAML project with automatic screenshot
        /// </summary>
        private ExecutionResult ExecuteWpfProject(CodeBlock block)
        {
            var projectName = $"WpfTemp_{Guid.NewGuid():N}";
            var projectDir = Path.Combine(_tempDir, projectName);

            try
            {
                // Create WPF project
                var createResult = RunProcess("dotnet", $"new wpf -n {projectName} -o \"{projectDir}\"");
                if (!createResult.Success)
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"Failed to create WPF project:\n{createResult.Error}"
                    };
                }

                // Parse XAML and C# code (for #wpf)
                string xamlCode;
                string? csharpCode = null;

                var language = block.Language.ToLower();
                if (language == "wpf")
                {
                    // Parse block to extract XAML and C# sections
                    (xamlCode, csharpCode) = ParseWpfBlock(block.Code);
                }
                else
                {
                    // Just XAML
                    xamlCode = block.Code.Trim();
                }

                // Replace MainWindow.xaml
                // Ensure x:Class attribute exists
                if (!xamlCode.Contains("x:Class="))
                {
                    xamlCode = xamlCode.Replace("<Window ", $"<Window x:Class=\"{projectName}.MainWindow\" ");
                }
                var mainWindowXamlPath = Path.Combine(projectDir, "MainWindow.xaml");
                File.WriteAllText(mainWindowXamlPath, xamlCode);

                // If C# code provided, handle based on whether it has Main()
                if (!string.IsNullOrWhiteSpace(csharpCode))
                {
                    var hasMainMethod = csharpCode.Contains("static void Main");

                    if (hasMainMethod)
                    {
                        // Transform the code: extract Main() body and run it in MainWindow constructor
                        var transformedCode = TransformMainToConstructor(csharpCode, projectName);
                        var mainWindowCsPath = Path.Combine(projectDir, "MainWindow.xaml.cs");
                        File.WriteAllText(mainWindowCsPath, transformedCode);
                    }
                    else
                    {
                        // No Main method, safe to put in MainWindow.xaml.cs
                        var mainWindowCsPath = Path.Combine(projectDir, "MainWindow.xaml.cs");
                        File.WriteAllText(mainWindowCsPath, csharpCode);
                    }
                }

                // DON'T modify App.xaml.cs - leave the window open for user interaction
                // (Opción A: Usuario puede interactuar con la ventana WPF)

                // Build project
                var buildResult = RunProcess("dotnet", $"build \"{projectDir}\" --configuration Release");
                if (!buildResult.Success || buildResult.ExitCode != 0)
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"Build failed:\n{buildResult.Error}\n{buildResult.Output}"
                    };
                }

                // Launch WPF application in the background (user can interact)
                var exePath = Path.Combine(projectDir, "bin", "Release", "net10.0-windows", $"{projectName}.exe");
                if (!File.Exists(exePath))
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"WPF executable not found at: {exePath}"
                    };
                }

                // Start the WPF app without waiting (user can interact)
                var startInfo = new ProcessStartInfo
                {
                    FileName = exePath,
                    UseShellExecute = true,  // Allow window to show
                    CreateNoWindow = false,  // Show the window
                    WindowStyle = ProcessWindowStyle.Normal
                };

                Process.Start(startInfo);

                return new ExecutionResult
                {
                    Success = true,
                    Output = $"WPF application launched successfully. You can interact with the window.\n(Close the window manually when done)"
                };
            }
            catch (Exception ex)
            {
                return new ExecutionResult
                {
                    Success = false,
                    Error = $"WPF execution failed: {ex.Message}"
                };
            }
            finally
            {
                // DON'T cleanup project directory for WPF - the app is still running
                // User will close it manually, temp files will be cleaned by OS eventually
                // (Para Opción A: la ventana WPF sigue abierta, no podemos borrar los archivos)
            }
        }

        /// <summary>
        /// Parses a #wpf block to extract XAML and C# sections
        /// </summary>
        private (string xaml, string csharp) ParseWpfBlock(string code)
        {
            var trimmedCode = code.Trim();

            // Auto-detect if code is pure C# (no XAML)
            var hasXmlTags = trimmedCode.Contains("<Window") || trimmedCode.Contains("<UserControl") ||
                            trimmedCode.Contains("<?xml") || trimmedCode.Contains("<Application");
            var hasCsharpKeywords = trimmedCode.Contains("using System") || trimmedCode.Contains("class ") ||
                                   trimmedCode.Contains("namespace ") || trimmedCode.Contains("static void Main");

            // If it's pure C# without XAML, generate a default XAML and return C# code
            if (!hasXmlTags && hasCsharpKeywords)
            {
                var defaultXaml = @"<Window xmlns=""http://schemas.microsoft.com/winfx/2006/xaml/presentation""
        xmlns:x=""http://schemas.microsoft.com/winfx/2006/xaml""
        Title=""WPF Application"" Height=""450"" Width=""800"">
    <Grid>
        <TextBlock Text=""WPF Application Running - Check Console Output""
                   HorizontalAlignment=""Center""
                   VerticalAlignment=""Center""
                   FontSize=""16""/>
    </Grid>
</Window>";
                return (defaultXaml, trimmedCode);
            }

            var lines = code.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var xamlBuilder = new StringBuilder();
            var csharpBuilder = new StringBuilder();
            var currentSection = "xaml"; // Default to XAML first

            foreach (var line in lines)
            {
                var trimmed = line.Trim();

                // Detect section markers
                if (trimmed.StartsWith("// C#", StringComparison.OrdinalIgnoreCase) ||
                    trimmed.StartsWith("//C#", StringComparison.OrdinalIgnoreCase) ||
                    trimmed.Equals("---CSHARP---", StringComparison.OrdinalIgnoreCase))
                {
                    currentSection = "csharp";
                    continue;
                }
                else if (trimmed.StartsWith("<!-- XAML", StringComparison.OrdinalIgnoreCase) ||
                         trimmed.Equals("---XAML---", StringComparison.OrdinalIgnoreCase))
                {
                    currentSection = "xaml";
                    continue;
                }

                // Add to appropriate section
                if (currentSection == "xaml")
                    xamlBuilder.AppendLine(line);
                else
                    csharpBuilder.AppendLine(line);
            }

            return (xamlBuilder.ToString().Trim(), csharpBuilder.ToString().Trim());
        }

        /// <summary>
        /// Transforms user code with Main() into MainWindow code-behind
        /// </summary>
        private string TransformMainToConstructor(string csharpCode, string projectName)
        {
            // Extract using statements
            var usingStatements = new List<string>();
            var lines = csharpCode.Split(new[] { '\r', '\n' }, StringSplitOptions.None);

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith("using ") && trimmed.EndsWith(";"))
                {
                    usingStatements.Add(line);
                }
            }

            // Extract Main() method body
            var mainMethodPattern = @"static\s+void\s+Main\s*\([^)]*\)\s*\{";
            var match = System.Text.RegularExpressions.Regex.Match(csharpCode, mainMethodPattern);

            if (!match.Success)
            {
                // Fallback: just wrap the whole code
                return GenerateMainWindowCodeBehind(projectName, usingStatements, csharpCode);
            }

            // Find the body of Main() method
            var startIndex = match.Index + match.Length;
            var braceCount = 1;
            var endIndex = startIndex;

            for (int i = startIndex; i < csharpCode.Length && braceCount > 0; i++)
            {
                if (csharpCode[i] == '{') braceCount++;
                else if (csharpCode[i] == '}') braceCount--;
                endIndex = i;
            }

            var mainBody = csharpCode.Substring(startIndex, endIndex - startIndex).Trim();

            return GenerateMainWindowCodeBehind(projectName, usingStatements, mainBody);
        }

        private string GenerateMainWindowCodeBehind(string projectName, List<string> usingStatements, string mainBody)
        {
            var usingsText = string.Join("\n", usingStatements);
            if (!usingsText.Contains("using System.Windows"))
            {
                usingsText = "using System.Windows;\n" + usingsText;
            }

            return $@"{usingsText}

namespace {projectName}
{{
    public partial class MainWindow : Window
    {{
        public MainWindow()
        {{
            InitializeComponent();

            // Execute user code
            ExecuteUserCode();
        }}

        private void ExecuteUserCode()
        {{
            {mainBody}
        }}
    }}
}}";
        }

        /// <summary>
        /// Modifies App.xaml.cs to automatically take screenshot and exit
        /// </summary>
        private void ModifyAppXamlCs(string projectDir)
        {
            var appXamlCsPath = Path.Combine(projectDir, "App.xaml.cs");

            var appCode = @"using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace " + Path.GetFileName(projectDir) + @"
{
    public partial class App : Application
    {
        protected override async void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Wait for window to render
            await Task.Delay(2000);

            if (MainWindow != null)
            {
                try
                {
                    // Take screenshot
                    var screenshot = CaptureWindow(MainWindow);
                    var screenshotPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ""../../../screenshot.png"");
                    SaveImage(screenshot, screenshotPath);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($""Screenshot failed: {ex.Message}"");
                }
            }

            // Exit application
            Shutdown();
        }

        private RenderTargetBitmap CaptureWindow(Window window)
        {
            var width = (int)window.ActualWidth;
            var height = (int)window.ActualHeight;

            var renderBitmap = new RenderTargetBitmap(
                width,
                height,
                96,
                96,
                PixelFormats.Pbgra32);

            renderBitmap.Render(window);
            return renderBitmap;
        }

        private void SaveImage(RenderTargetBitmap bitmap, string path)
        {
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(bitmap));

            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                Directory.CreateDirectory(directory);

            using var stream = File.Create(path);
            encoder.Save(stream);
        }
    }
}";

            File.WriteAllText(appXamlCsPath, appCode);
        }

        /// <summary>
        /// Saves generated web files (CSS, HTML, TypeScript, JavaScript) to a specified directory
        /// </summary>
        /// <param name="destinationDir">Directory where files should be saved</param>
        /// <returns>List of saved file paths</returns>
        public List<string> SaveWebFilesToDirectory(string destinationDir)
        {
            var savedFiles = new List<string>();

            try
            {
                // Create destination directory if it doesn't exist
                Directory.CreateDirectory(destinationDir);

                // Files to copy from temp directory
                var filesToCopy = new[]
                {
                    "styles.css",
                    "script.ts",
                    "script.js",
                    "index.html"
                };

                foreach (var fileName in filesToCopy)
                {
                    var sourcePath = Path.Combine(_tempDir, fileName);
                    if (File.Exists(sourcePath))
                    {
                        var destPath = Path.Combine(destinationDir, fileName);
                        File.Copy(sourcePath, destPath, overwrite: true);
                        savedFiles.Add(destPath);
                    }
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to save web files: {ex.Message}", ex);
            }

            return savedFiles;
        }

        /// <summary>
        /// Gets the path to the temporary directory where generated files are stored
        /// </summary>
        public string GetTempDirectory()
        {
            return _tempDir;
        }

        /// <summary>
        /// Checks if web files (CSS, HTML, JS) exist in the temporary directory
        /// </summary>
        public Dictionary<string, bool> GetGeneratedWebFilesStatus()
        {
            return new Dictionary<string, bool>
            {
                ["styles.css"] = File.Exists(Path.Combine(_tempDir, "styles.css")),
                ["script.ts"] = File.Exists(Path.Combine(_tempDir, "script.ts")),
                ["script.js"] = File.Exists(Path.Combine(_tempDir, "script.js")),
                ["index.html"] = File.Exists(Path.Combine(_tempDir, "index.html"))
            };
        }

        /// <summary>
        /// Generates an HTML file with importmap for loading TypeScript modules in the browser
        /// </summary>
        private string GenerateModuleHtml(List<string> jsFiles, string tempDir)
        {
            var sb = new StringBuilder();

            // Build importmap for local modules
            var importMapEntries = new List<string>();
            foreach (var jsFile in jsFiles)
            {
                var moduleName = "./" + Path.GetFileNameWithoutExtension(jsFile);
                var fileName = Path.GetFileName(jsFile);
                importMapEntries.Add($"      \"{moduleName}\": \"./{fileName}\"");
            }

            // Check if styles.css exists
            var cssPath = Path.Combine(tempDir, "styles.css");
            var hasCss = File.Exists(cssPath);

            sb.AppendLine("<!DOCTYPE html>");
            sb.AppendLine("<html lang=\"en\">");
            sb.AppendLine("<head>");
            sb.AppendLine("  <meta charset=\"UTF-8\">");
            sb.AppendLine("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
            sb.AppendLine("  <title>Hekatan - TypeScript Modules</title>");

            if (hasCss)
            {
                sb.AppendLine("  <link rel=\"stylesheet\" href=\"styles.css\">");
            }

            // Add importmap for external libraries (Three.js, Tweakpane, VanJS)
            sb.AppendLine("  <script type=\"importmap\">");
            sb.AppendLine("  {");
            sb.AppendLine("    \"imports\": {");
            sb.AppendLine("      \"three\": \"https://unpkg.com/three@0.160.0/build/three.module.js\",");
            sb.AppendLine("      \"three/addons/\": \"https://unpkg.com/three@0.160.0/examples/jsm/\",");
            sb.AppendLine("      \"tweakpane\": \"https://unpkg.com/tweakpane@4.0.3/dist/tweakpane.min.js\",");
            sb.AppendLine("      \"vanjs-core\": \"https://unpkg.com/vanjs-core@1.5.0/src/van.js\",");

            // Add local module mappings
            if (importMapEntries.Count > 0)
            {
                sb.AppendLine(string.Join(",\n", importMapEntries));
            }

            sb.AppendLine("    }");
            sb.AppendLine("  }");
            sb.AppendLine("  </script>");

            sb.AppendLine("  <style>");
            sb.AppendLine("    body { margin: 0; background: #1a1a2e; color: white; font-family: Arial, sans-serif; }");
            sb.AppendLine("    #container { width: 100%; height: 100vh; }");
            sb.AppendLine("  </style>");
            sb.AppendLine("</head>");
            sb.AppendLine("<body>");
            sb.AppendLine("  <div id=\"container\"></div>");

            // Load main.js as module
            var mainJs = jsFiles.FirstOrDefault(f => Path.GetFileNameWithoutExtension(f) == "main");
            if (mainJs != null)
            {
                sb.AppendLine($"  <script type=\"module\" src=\"{Path.GetFileName(mainJs)}\"></script>");
            }
            else if (jsFiles.Count > 0)
            {
                // If no main.js, load the first one
                sb.AppendLine($"  <script type=\"module\" src=\"{Path.GetFileName(jsFiles[0])}\"></script>");
            }

            sb.AppendLine("</body>");
            sb.AppendLine("</html>");

            return sb.ToString();
        }

        /// <summary>
        /// Executes Three.js code - generates HTML with 3D viewer components (awatif-style)
        /// </summary>
        private ExecutionResult ExecuteThreeCode(string userCode)
        {
            try
            {
                // Generate Three.js HTML with user's code embedded
                var html = GenerateThreeHtml(userCode);

                // Save to temp directory
                var htmlPath = Path.Combine(_tempDir, "three-viewer.html");
                File.WriteAllText(htmlPath, html);

                _tracker?.ReportStep($"Three.js HTML generated: {htmlPath}");

                // Return as embedded iframe
                var escapedHtml = html
                    .Replace("&", "&amp;")
                    .Replace("\"", "&quot;")
                    .Replace("<", "&lt;")
                    .Replace(">", "&gt;");

                var iframeHtml = $"<iframe srcdoc=\"{escapedHtml}\" style=\"width:100%; height:600px; border:none; border-radius:4px;\"></iframe>";

                return new ExecutionResult
                {
                    Success = true,
                    Output = iframeHtml,
                    IsHtmlOutput = true
                };
            }
            catch (Exception ex)
            {
                return new ExecutionResult
                {
                    Success = false,
                    Error = $"Error generating Three.js viewer: {ex.Message}"
                };
            }
        }

        /// <summary>
        /// Generates HTML with Three.js viewer components and user's code
        /// </summary>
        private string GenerateThreeHtml(string userCode)
        {
            return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>Hekatan - Three.js Viewer</title>
    <style>
        * {{ box-sizing: border-box; }}
        body {{ margin: 0; background: #000; font-family: Arial, sans-serif; overflow: hidden; }}
        #viewer {{ width: 100%; height: 100vh; position: relative; }}
        #viewer canvas {{ width: 100% !important; height: 100% !important; }}
        #settings {{ position: absolute; top: 10px; right: 10px; z-index: 100; }}
        #parameters {{ position: absolute; top: 10px; left: 10px; z-index: 100; }}
        #legend {{
            width: 20px; height: 200px;
            background: linear-gradient(#ff0000, #ffff00 25%, #00ff00 50%, #00ffff 75%, #0000ff);
            position: absolute; right: 50px; bottom: 50px; z-index: 2;
        }}
        #legend .marker {{ width: 10px; height: 1px; margin-left: 20px; background: white; position: relative; }}
        #legend .marker span {{ position: absolute; color: white; font-size: 11px; top: -6px; left: 12px; font-family: monospace; }}
        #toolbar {{ position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 100; display: flex; gap: 5px; }}
        #toolbar button {{ padding: 8px 16px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; cursor: pointer; }}
        #toolbar button:hover {{ background: #444; }}
        #report {{ position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 4px; z-index: 100; }}
    </style>
    <script type=""importmap"">
    {{
        ""imports"": {{
            ""three"": ""https://unpkg.com/three@0.169.0/build/three.module.js"",
            ""three/addons/"": ""https://unpkg.com/three@0.169.0/examples/jsm/"",
            ""tweakpane"": ""https://unpkg.com/tweakpane@4.0.4/dist/tweakpane.min.js"",
            ""vanjs-core"": ""https://unpkg.com/vanjs-core@1.5.2/src/van.js""
        }}
    }}
    </script>
</head>
<body>
    <div id=""app""></div>
    <script type=""module"">
        import * as THREE from 'three';
        import {{ OrbitControls }} from 'three/addons/controls/OrbitControls.js';
        import {{ Lut }} from 'three/addons/math/Lut.js';
        import van from 'vanjs-core';

        // Make available globally
        window.van = van;
        window.THREE = THREE;
        window.OrbitControls = OrbitControls;
        window.Lut = Lut;

        // ========== AWATIF-UI COMPONENTS ==========

        // getColorMap - Creates mesh with vertex colors
        window.getColorMap = function(nodes, elements, values) {{
            const lut = new Lut('rainbow', 512);
            lut.setMin(Math.min(...values));
            lut.setMax(Math.max(...values));

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(nodes.flat(), 3));
            geometry.setIndex(new THREE.Uint16BufferAttribute(elements.filter(e => e.length !== 2).flat(), 1));

            const colors = new Float32Array(nodes.length * 3);
            for (let i = 0; i < values.length; i++) {{
                const c = lut.getColor(values[i]) || new THREE.Color(0, 0, 0);
                colors[i * 3] = c.r * 0.8;
                colors[i * 3 + 1] = c.g * 0.8;
                colors[i * 3 + 2] = c.b * 0.8;
            }}
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({{ vertexColors: true, side: THREE.DoubleSide }}));
        }};

        // getLegend - Creates color legend
        window.getLegend = function(values, numMarkers = 5) {{
            const legend = document.createElement('div');
            legend.id = 'legend';
            const min = Math.min(...values);
            const max = Math.max(...values);

            for (let i = 0; i < numMarkers; i++) {{
                const ratio = i / (numMarkers - 1);
                const value = (max - (max - min) * ratio).toFixed(2);
                const marker = document.createElement('div');
                marker.className = 'marker';
                marker.style.marginTop = i === 0 ? '0' : `${{(200 / (numMarkers - 1)) - 1}}px`;
                const span = document.createElement('span');
                span.textContent = value;
                marker.appendChild(span);
                legend.appendChild(marker);
            }}
            return legend;
        }};

        // getViewer - Creates 3D viewer with Three.js
        window.getViewer = function(config = {{}}) {{
            const {{ mesh, objects3D, gridSize = 20 }} = config;
            THREE.Object3D.DEFAULT_UP = new THREE.Vector3(0, 0, 1);

            const viewer = document.createElement('div');
            viewer.id = 'viewer';

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x000000);

            const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2e6);
            camera.position.set(gridSize * 0.5, -gridSize * 0.8, gridSize * 0.5);
            camera.up.set(0, 0, 1);

            const renderer = new THREE.WebGLRenderer({{ antialias: true }});
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(window.innerWidth, window.innerHeight);
            viewer.appendChild(renderer.domElement);

            const controls = new OrbitControls(camera, renderer.domElement);
            controls.target.set(gridSize * 0.5, gridSize * 0.5, 0);
            controls.update();

            // Grid
            const grid = new THREE.GridHelper(gridSize, gridSize, 0x444444, 0x222222);
            grid.rotation.x = Math.PI / 2;
            scene.add(grid);
            scene.add(new THREE.AxesHelper(gridSize * 0.2));

            // Add mesh wireframe
            if (mesh && mesh.nodes && mesh.elements) {{
                const nodes = mesh.nodes.val || mesh.nodes;
                const elements = mesh.elements.val || mesh.elements;
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(nodes.flat(), 3));
                geom.setIndex(new THREE.Uint16BufferAttribute(elements.flat(), 1));
                scene.add(new THREE.LineSegments(new THREE.WireframeGeometry(geom), new THREE.LineBasicMaterial({{ color: 0x00ff00 }})));
            }}

            // Add custom objects
            if (objects3D) {{
                const objs = objects3D.val || objects3D;
                objs.forEach(obj => scene.add(obj));
            }}

            function animate() {{ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }}
            animate();

            window.addEventListener('resize', () => {{
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            }});

            viewer._scene = scene;
            viewer._camera = camera;
            viewer._renderer = renderer;
            viewer._controls = controls;

            return viewer;
        }};

        // getParameters - Creates parameter panel with Tweakpane
        window.getParameters = async function(params) {{
            const {{ Pane }} = await import('tweakpane');
            const container = document.createElement('div');
            container.id = 'parameters';
            const pane = new Pane({{ title: 'Parameters', container }});

            const tweakParams = {{}};
            Object.entries(params).forEach(([key, config]) => {{
                tweakParams[key] = config.value.val !== undefined ? config.value.val : config.value;
            }});

            Object.entries(params).forEach(([key, config]) => {{
                pane.addBinding(tweakParams, key, {{
                    min: config.min || 0,
                    max: config.max || 100,
                    step: config.step || 1,
                    label: config.label || key
                }});
            }});

            pane.on('change', (e) => {{
                const param = params[e.target.key];
                if (param && param.value.val !== undefined) {{ param.value.val = e.value; }}
            }});

            return container;
        }};

        // getToolbar
        window.getToolbar = function(buttons) {{
            const toolbar = document.createElement('div');
            toolbar.id = 'toolbar';
            buttons.forEach(btn => {{
                const button = document.createElement('button');
                button.textContent = btn.label || btn.text;
                button.onclick = btn.onClick || btn.action;
                toolbar.appendChild(button);
            }});
            return toolbar;
        }};

        // getReport
        window.getReport = function(data) {{
            const report = document.createElement('div');
            report.id = 'report';
            if (typeof data === 'string') {{ report.innerHTML = data; }}
            else {{ report.innerHTML = Object.entries(data).map(([k, v]) => `<strong>${{k}}:</strong> ${{v}}`).join(' | '); }}
            return report;
        }};

        // ========== USER CODE ==========
        {userCode}
    </script>
</body>
</html>";
        }

        /// <summary>
        /// Executes a Vite project - writes main.ts, starts Vite dev server and returns iframe for WebView2
        /// Format: @{vite C:/path/to/awatif-ui} followed by main.ts code
        /// </summary>
        private ExecutionResult ExecuteViteProject(string code, string startDirective)
        {
            try
            {
                // Extract project path from directive: @{vite C:/path/to/awatif-ui}
                string projectPath = "";
                string subFolder = "src/calcpad"; // Default subfolder for calcpad examples

                // Parse directive to get path
                // Format: @{vite C:/path/to/project} or @{vite C:/path/to/project src/viewer}
                var match = System.Text.RegularExpressions.Regex.Match(
                    startDirective,
                    @"@\{vite\s+([^\s\}]+)(?:\s+([^\}]+))?\}?",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);

                if (match.Success)
                {
                    projectPath = match.Groups[1].Value.Trim();
                    if (match.Groups[2].Success)
                    {
                        subFolder = match.Groups[2].Value.Trim();
                    }
                }

                // If no path in directive, check if code starts with a path
                if (string.IsNullOrEmpty(projectPath))
                {
                    var lines = code.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    if (lines.Length > 0 && (lines[0].Contains(":/") || lines[0].Contains(":\\")))
                    {
                        projectPath = lines[0].Trim();
                        code = string.Join("\n", lines.Skip(1));
                    }
                }

                if (string.IsNullOrEmpty(projectPath))
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = "No project path specified. Use: @{vite C:/path/to/awatif-ui}"
                    };
                }

                // Normalize path
                projectPath = projectPath.Replace("\\", "/").TrimEnd('/');

                // Validate path exists
                if (!Directory.Exists(projectPath))
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"Project directory not found: {projectPath}"
                    };
                }

                _tracker?.ReportStep($"Project path: {projectPath}");
                _tracker?.ReportStep($"Subfolder: {subFolder}");

                // Create subfolder for calcpad examples if it doesn't exist
                var exampleDir = Path.Combine(projectPath, subFolder.Replace("/", Path.DirectorySeparatorChar.ToString()));
                Directory.CreateDirectory(exampleDir);

                // Write main.ts from the code block
                var mainTsPath = Path.Combine(exampleDir, "main.ts");
                var mainTsCode = code.Trim();

                // If code is empty, create a default main.ts
                if (string.IsNullOrWhiteSpace(mainTsCode))
                {
                    mainTsCode = @"import van from 'vanjs-core';
import { getViewer } from '../viewer/getViewer';
import { Node } from 'awatif-fem';

// Ejemplo básico de viewer
const nodes = van.state([
  [0, 0, 0],
  [5, 0, 0],
  [5, 5, 0],
  [0, 5, 0],
] as Node[]);

const elements = van.state([
  [0, 1, 2],
  [0, 2, 3],
]);

const viewerElm = getViewer({
  mesh: { nodes, elements },
  settingsObj: { nodes: true, elements: true },
});

document.body.appendChild(viewerElm);
";
                }

                File.WriteAllText(mainTsPath, mainTsCode);
                _tracker?.ReportStep($"Written main.ts to: {mainTsPath}");

                // Create index.html if it doesn't exist
                var indexHtmlPath = Path.Combine(exampleDir, "index.html");
                if (!File.Exists(indexHtmlPath))
                {
                    var indexHtml = @"<!DOCTYPE html>
<html lang=""en"">
  <head>
    <meta charset=""UTF-8"" />
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />
    <title>Hekatan - Awatif Viewer</title>
  </head>
  <body>
    <script type=""module"" src=""main.ts""></script>
  </body>
</html>";
                    File.WriteAllText(indexHtmlPath, indexHtml);
                    _tracker?.ReportStep($"Created index.html at: {indexHtmlPath}");
                }

                // Start Vite dev server using cmd.exe (npx is a batch script on Windows)
                // --no-open: don't open browser automatically (overrides vite.config.ts open setting)
                // --host: allow access from any host (needed for WebView2)
                var psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c npx vite --host --no-open",
                    WorkingDirectory = projectPath,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                var process = new Process { StartInfo = psi };
                var output = new StringBuilder();
                var error = new StringBuilder();
                string serverUrl = "http://127.0.0.1:4600"; // awatif-ui uses port 4600 by default

                process.OutputDataReceived += (s, e) =>
                {
                    if (e.Data != null)
                    {
                        output.AppendLine(e.Data);
                        // Parse URL from Vite output: "Local:   http://localhost:5173/"
                        // Replace localhost with 127.0.0.1 for WebView2 compatibility
                        if (e.Data.Contains("Local:") && e.Data.Contains("http"))
                        {
                            var urlStart = e.Data.IndexOf("http");
                            if (urlStart >= 0)
                            {
                                serverUrl = e.Data.Substring(urlStart).Trim().TrimEnd('/')
                                    .Replace("localhost", "127.0.0.1");
                            }
                        }
                    }
                };
                process.ErrorDataReceived += (s, e) => { if (e.Data != null) error.AppendLine(e.Data); };

                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                // Wait for Vite to start
                int waitTime = 0;
                while (waitTime < 15000 && !output.ToString().Contains("Local:"))
                {
                    System.Threading.Thread.Sleep(500);
                    waitTime += 500;
                }

                // Check if process is still running
                if (!process.HasExited)
                {
                    // Build full URL with subfolder
                    string fullUrl = $"{serverUrl}/{subFolder}/";

                    _tracker?.ReportStep($"Vite server running at: {fullUrl}");

                    // Return iframe for WebView2
                    var iframeHtml = $"<iframe src=\"{fullUrl}\" style=\"width:100%; height:600px; border:none; border-radius:4px;\"></iframe>";

                    return new ExecutionResult
                    {
                        Success = true,
                        Output = iframeHtml,
                        IsHtmlOutput = true
                    };
                }
                else
                {
                    return new ExecutionResult
                    {
                        Success = false,
                        Error = $"Vite failed to start:\n{error}\n{output}"
                    };
                }
            }
            catch (Exception ex)
            {
                return new ExecutionResult
                {
                    Success = false,
                    Error = $"Error: {ex.Message}"
                };
            }
        }

        /// <summary>
        /// Cleans up temporary files
        /// </summary>
        public void Cleanup()
        {
            try
            {
                if (Directory.Exists(_tempDir))
                {
                    Directory.Delete(_tempDir, true);
                }
            }
            catch { }
        }
    }

    /// <summary>
    /// Result of code execution
    /// </summary>
    public class ExecutionResult
    {
        public bool Success { get; set; }
        public string Output { get; set; } = string.Empty;
        public string Error { get; set; } = string.Empty;
        public int ExitCode { get; set; }

        /// <summary>
        /// If true, Output contains raw HTML that should be inserted directly
        /// without escaping (e.g., for embedded iframes)
        /// </summary>
        public bool IsHtmlOutput { get; set; } = false;

        /// <summary>
        /// Gets formatted output for display
        /// </summary>
        public string GetDisplayOutput()
        {
            if (!Success && !string.IsNullOrEmpty(Error))
                return $"Error: {Error}";

            return Output;
        }
    }
}
