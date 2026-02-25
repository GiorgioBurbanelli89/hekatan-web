using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Hekatan.Wpf
{
    /// <summary>
    /// Gestiona un proceso Vite dev server para carpetas con package.json.
    /// Detecta si hay package.json, ejecuta npm install + npm run dev,
    /// captura el puerto del stdout, y permite navegar WebView2 a localhost.
    /// </summary>
    internal class ViteProcessManager : IDisposable
    {
        private Process _viteProcess;
        private string _folderPath;
        private int _port;
        private bool _isRunning;
        private readonly Action<string> _log;

        internal string FolderPath => _folderPath;
        internal int Port => _port;
        internal bool IsRunning => _isRunning;
        internal string LocalUrl => _port > 0 ? $"http://localhost:{_port}" : null;

        internal ViteProcessManager(Action<string> log = null)
        {
            _log = log ?? (msg => Debug.WriteLine($"[Vite] {msg}"));
        }

        /// <summary>
        /// Verifica si una carpeta tiene package.json con script "dev"
        /// </summary>
        internal static bool HasViteProject(string folderPath)
        {
            if (string.IsNullOrEmpty(folderPath) || !Directory.Exists(folderPath))
                return false;

            var packageJson = Path.Combine(folderPath, "package.json");
            if (!File.Exists(packageJson))
                return false;

            // Verificar que tiene script "dev" (para Vite)
            var content = File.ReadAllText(packageJson);
            return content.Contains("\"dev\"");
        }

        /// <summary>
        /// Verifica si una carpeta tiene index.html (proyecto estatico sin Vite)
        /// </summary>
        internal static bool HasStaticProject(string folderPath)
        {
            if (string.IsNullOrEmpty(folderPath) || !Directory.Exists(folderPath))
                return false;

            return File.Exists(Path.Combine(folderPath, "index.html"));
        }

        /// <summary>
        /// Inicia el proceso: npm install (si no hay node_modules) + npm run dev
        /// Retorna el puerto cuando Vite esta listo, o -1 si falla.
        /// </summary>
        internal async Task<int> StartAsync(string folderPath, CancellationToken ct = default)
        {
            if (_isRunning)
                await StopAsync();

            _folderPath = folderPath;
            _port = -1;

            // npm install si no hay node_modules
            var nodeModules = Path.Combine(folderPath, "node_modules");
            if (!Directory.Exists(nodeModules))
            {
                _log("Ejecutando npm install...");
                var installOk = await RunNpmInstallAsync(folderPath, ct);
                if (!installOk)
                {
                    _log("ERROR: npm install fallo");
                    return -1;
                }
                _log("npm install completado");
            }

            // Iniciar Vite dev server
            _log("Iniciando Vite dev server...");
            var port = await StartViteDevAsync(folderPath, ct);
            if (port > 0)
            {
                _port = port;
                _isRunning = true;
                _log($"Vite listo en http://localhost:{port}");
            }
            else
            {
                _log("ERROR: No se pudo detectar el puerto de Vite");
            }

            return _port;
        }

        /// <summary>
        /// Detiene el proceso Vite
        /// </summary>
        internal async Task StopAsync()
        {
            if (_viteProcess != null && !_viteProcess.HasExited)
            {
                _log("Deteniendo Vite...");
                try
                {
                    // Intentar cierre graceful primero
                    _viteProcess.Kill(entireProcessTree: true);
                    await _viteProcess.WaitForExitAsync();
                }
                catch (Exception ex)
                {
                    _log($"Error al detener Vite: {ex.Message}");
                }
            }
            _viteProcess?.Dispose();
            _viteProcess = null;
            _isRunning = false;
            _port = -1;
        }

        private async Task<bool> RunNpmInstallAsync(string folder, CancellationToken ct)
        {
            var npmPath = FindNpm();
            if (npmPath == null)
            {
                _log("ERROR: npm no encontrado en PATH");
                return false;
            }

            var psi = new ProcessStartInfo
            {
                FileName = npmPath,
                Arguments = "install",
                WorkingDirectory = folder,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using var proc = Process.Start(psi);
            if (proc == null) return false;

            try
            {
                await proc.WaitForExitAsync(ct);
                return proc.ExitCode == 0;
            }
            catch (OperationCanceledException)
            {
                proc.Kill();
                return false;
            }
        }

        private async Task<int> StartViteDevAsync(string folder, CancellationToken ct)
        {
            var npmPath = FindNpm();
            if (npmPath == null) return -1;

            var psi = new ProcessStartInfo
            {
                FileName = npmPath,
                Arguments = "run dev",
                WorkingDirectory = folder,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                Environment = { ["FORCE_COLOR"] = "0" } // Sin colores ANSI
            };

            _viteProcess = Process.Start(psi);
            if (_viteProcess == null) return -1;

            // Leer stdout hasta encontrar el puerto de Vite
            // Vite imprime algo como: "Local:   http://localhost:5170/"
            var tcs = new TaskCompletionSource<int>();
            var portRegex = new Regex(@"localhost:(\d+)", RegexOptions.Compiled);

            _viteProcess.OutputDataReceived += (s, e) =>
            {
                if (e.Data == null) return;
                _log($"[stdout] {e.Data}");

                var match = portRegex.Match(e.Data);
                if (match.Success && int.TryParse(match.Groups[1].Value, out int port))
                {
                    tcs.TrySetResult(port);
                }
            };

            _viteProcess.ErrorDataReceived += (s, e) =>
            {
                if (e.Data == null) return;
                _log($"[stderr] {e.Data}");

                // Vite a veces escribe en stderr
                var match = portRegex.Match(e.Data);
                if (match.Success && int.TryParse(match.Groups[1].Value, out int port))
                {
                    tcs.TrySetResult(port);
                }
            };

            _viteProcess.BeginOutputReadLine();
            _viteProcess.BeginErrorReadLine();

            // Timeout de 30 segundos para que Vite arranque
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);

            try
            {
                linked.Token.Register(() => tcs.TrySetResult(-1));
                return await tcs.Task;
            }
            catch
            {
                return -1;
            }
        }

        /// <summary>
        /// Busca npm.cmd en PATH (Windows) o npm (Linux/Mac)
        /// </summary>
        private static string FindNpm()
        {
            // En Windows, npm es npm.cmd
            var npmName = Environment.OSVersion.Platform == PlatformID.Win32NT ? "npm.cmd" : "npm";

            // Buscar en PATH
            var pathDirs = Environment.GetEnvironmentVariable("PATH")?.Split(Path.PathSeparator) ?? Array.Empty<string>();
            foreach (var dir in pathDirs)
            {
                var fullPath = Path.Combine(dir, npmName);
                if (File.Exists(fullPath))
                    return fullPath;
            }

            // Fallback: ubicaciones comunes en Windows
            var commonPaths = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", npmName),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "fnm_multishells", npmName),
                @"C:\Program Files\nodejs\" + npmName,
            };

            foreach (var path in commonPaths)
            {
                if (File.Exists(path))
                    return path;
            }

            return null;
        }

        public void Dispose()
        {
            StopAsync().GetAwaiter().GetResult();
            GC.SuppressFinalize(this);
        }
    }
}
