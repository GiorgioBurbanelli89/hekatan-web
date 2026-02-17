using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Wpf;

namespace Hekatan.Wpf
{
    /// <summary>
    /// Integración de Jupyter Notebook en Hekatan
    /// Permite abrir y ejecutar notebooks .ipynb dentro de WebView2
    /// </summary>
    public class JupyterIntegration
    {
        private Process _jupyterProcess;
        private int _port;
        private string _token;
        private WebView2 _webView;
        private bool _isRunning = false;

        public enum NotebookMode
        {
            ReadOnly,      // Solo visualización con nbconvert
            Interactive,   // Servidor Jupyter completo
            Embedded       // JupyterLite (futuro)
        }

        public NotebookMode CurrentMode { get; private set; }
        public bool IsJupyterRunning => _isRunning;
        public string ServerUrl => _isRunning ? $"http://localhost:{_port}" : null;

        public JupyterIntegration(WebView2 webView)
        {
            _webView = webView ?? throw new ArgumentNullException(nameof(webView));
        }

        /// <summary>
        /// Encuentra un puerto TCP libre
        /// </summary>
        private static int FindFreePort()
        {
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return port;
        }

        /// <summary>
        /// Navega el WebView2 a la URL de Jupyter
        /// </summary>
        public async Task NavigateToJupyter()
        {
            if (!_isRunning || _webView == null) return;
            await _webView.EnsureCoreWebView2Async();
            _webView.CoreWebView2.Navigate($"http://localhost:{_port}/?token={_token}");
        }

        /// <summary>
        /// Abre un notebook de Jupyter (.ipynb)
        /// </summary>
        public async Task<bool> OpenNotebook(string ipynbPath)
        {
            if (string.IsNullOrEmpty(ipynbPath) || !File.Exists(ipynbPath))
            {
                MessageBox.Show("Archivo .ipynb no encontrado.", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }

            try
            {
                // Detectar modo disponible
                if (await CheckJupyterAvailable())
                {
                    CurrentMode = NotebookMode.Interactive;
                    return await OpenInteractive(ipynbPath);
                }
                else if (await CheckNbconvertAvailable())
                {
                    CurrentMode = NotebookMode.ReadOnly;
                    return await OpenReadOnly(ipynbPath);
                }
                else
                {
                    // Ofrecer instalar Jupyter
                    var result = MessageBox.Show(
                        "Jupyter no está instalado.\n\n" +
                        "¿Deseas instalar Python + Jupyter?\n\n" +
                        "Esto permitirá ejecutar código Python dentro de Hekatan.",
                        "Jupyter Integration",
                        MessageBoxButton.YesNo,
                        MessageBoxImage.Question);

                    if (result == MessageBoxResult.Yes)
                    {
                        ShowInstallInstructions();
                    }
                    return false;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al abrir notebook:\n{ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }
        }

        /// <summary>
        /// Inicia el servidor Jupyter
        /// </summary>
        public async Task<bool> StartJupyterServer(string notebookDir = null)
        {
            // DEBUG LOG
            string logFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Documents", "Hekatan-7.5.7", "Hekatan.Wpf", "DebugLogs", "jupyter-debug.log");
            try { Directory.CreateDirectory(Path.GetDirectoryName(logFile)); } catch { }
            File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] StartJupyterServer INICIADO\n");

            if (_isRunning)
            {
                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Ya está corriendo, re-navegando...\n");
                // Re-navegar al WebView2 en lugar de solo mostrar mensaje
                await NavigateToJupyter();
                return true;
            }

            // Crear ventana de progreso
            var progressWindow = new JupyterProgressWindow();
            progressWindow.Show();
            var stopwatch = Stopwatch.StartNew();

            try
            {
                progressWindow.UpdateMessage($"Verificando Jupyter... (0 ms)");
                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Verificando Jupyter...\n");

                if (!await CheckJupyterAvailable())
                {
                    File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Jupyter NO disponible\n");
                    progressWindow.Close();
                    MessageBox.Show("Jupyter no está instalado. Por favor instala Python + Jupyter primero.",
                        "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    return false;
                }

                progressWindow.UpdateMessage($"Jupyter disponible ({stopwatch.ElapsedMilliseconds} ms)");
                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Jupyter disponible OK\n");

                // Usar directorio especificado o UserProfile por defecto
                string workDir = notebookDir ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] WorkDir: {workDir}\n");

                // Generar token fijo para esta sesión
                _token = Guid.NewGuid().ToString("N");

                // Encontrar puerto libre para evitar conflictos
                _port = FindFreePort();
                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Puerto libre: {_port}, Token: {_token}\n");

                progressWindow.UpdateMessage($"Iniciando servidor Jupyter... ({stopwatch.ElapsedMilliseconds} ms)");

                // Iniciar servidor Jupyter con token y puerto explícitos
                _jupyterProcess = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "python",
                        Arguments = $"-m jupyter notebook --no-browser --port={_port} --ServerApp.token=\"{_token}\" --NotebookApp.token=\"{_token}\"",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true,
                        WorkingDirectory = workDir
                    }
                };

                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Iniciando proceso jupyter...\n");
                _jupyterProcess.Start();

                // Capturar output y detectar puerto real desde stderr
                int detectedPort = _port;
                _jupyterProcess.OutputDataReceived += (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                        File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] STDOUT: {e.Data}\n");
                };

                _jupyterProcess.ErrorDataReceived += (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] STDERR: {e.Data}\n");
                        // Detectar si Jupyter cambió de puerto
                        var portMatch = Regex.Match(e.Data, @"http://localhost:(\d+)/");
                        if (portMatch.Success)
                            detectedPort = int.Parse(portMatch.Groups[1].Value);
                    }
                };

                _jupyterProcess.BeginOutputReadLine();
                _jupyterProcess.BeginErrorReadLine();

                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Proceso iniciado, esperando servidor...\n");

                // Esperar activamente hasta que el servidor responda (max 30 segundos)
                progressWindow.UpdateMessage($"Esperando servidor... ({stopwatch.ElapsedMilliseconds} ms)");
                bool serverReady = false;
                using (var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) })
                {
                    for (int i = 0; i < 60; i++) // 60 × 500ms = 30 segundos max
                    {
                        // Intentar con el puerto detectado (puede cambiar si el original estaba ocupado)
                        try
                        {
                            var response = await httpClient.GetAsync($"http://localhost:{detectedPort}/api?token={_token}");
                            if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.Forbidden)
                            {
                                _port = detectedPort; // Actualizar al puerto real
                                serverReady = true;
                                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Servidor respondió OK en puerto {_port} (intento {i + 1})\n");
                                break;
                            }
                        }
                        catch { /* servidor aún no listo */ }

                        await Task.Delay(500);
                        progressWindow.UpdateMessage($"Esperando servidor... ({stopwatch.ElapsedMilliseconds} ms)");
                    }
                }

                if (!serverReady)
                {
                    File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] TIMEOUT: servidor no respondió en 30s\n");
                    progressWindow.Close();
                    MessageBox.Show("El servidor Jupyter no respondió a tiempo.\nIntenta nuevamente.",
                        "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                    StopJupyterServer();
                    return false;
                }

                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Servidor listo en puerto {_port}!\n");

                _isRunning = true;
                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Inicializando WebView2...\n");

                progressWindow.UpdateMessage($"Inicializando WebView2... ({stopwatch.ElapsedMilliseconds} ms)");

                // Navegar a Jupyter
                await _webView.EnsureCoreWebView2Async();
                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] WebView2 OK, navegando...\n");

                // Interceptar nuevas ventanas para mantenerlas dentro del WebView2
                _webView.CoreWebView2.NewWindowRequested += (sender, args) =>
                {
                    File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] NewWindow interceptado: {args.Uri}\n");
                    args.Handled = true;
                    _webView.CoreWebView2.Navigate(args.Uri);
                };

                _webView.CoreWebView2.Navigate($"http://localhost:{_port}/?token={_token}");
                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] Navegación iniciada a puerto {_port}\n");

                stopwatch.Stop();
                progressWindow.UpdateMessage($"Completado! ({stopwatch.ElapsedMilliseconds} ms)");
                await Task.Delay(500);
                progressWindow.Close();

                MessageBox.Show($"Servidor Jupyter iniciado en {stopwatch.ElapsedMilliseconds} ms.\n\nDirectorio: {workDir}\nURL: http://localhost:{_port}",
                    "Jupyter Server", MessageBoxButton.OK, MessageBoxImage.Information);

                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] TODO OK ({stopwatch.ElapsedMilliseconds} ms total)\n");
                return true;
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                progressWindow.Close();
                File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss.fff}] EXCEPTION: {ex.Message}\n{ex.StackTrace}\n");
                MessageBox.Show($"Error al iniciar Jupyter:\n{ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                _isRunning = false;
                return false;
            }
        }

        /// <summary>
        /// Detiene el servidor Jupyter
        /// </summary>
        public void StopJupyterServer()
        {
            try
            {
                if (_jupyterProcess != null && !_jupyterProcess.HasExited)
                {
                    _jupyterProcess.Kill(true);
                    _jupyterProcess.Dispose();
                    _jupyterProcess = null;
                }

                _isRunning = false;
                _token = null;

                MessageBox.Show("Servidor Jupyter detenido.", "Info",
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al detener Jupyter:\n{ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Verifica si Jupyter está instalado
        /// </summary>
        private async Task<bool> CheckJupyterAvailable()
        {
            try
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "python",
                        Arguments = "-m jupyter --version",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                await process.WaitForExitAsync();

                return process.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Verifica si nbconvert está instalado
        /// </summary>
        private async Task<bool> CheckNbconvertAvailable()
        {
            try
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "python",
                        Arguments = "-m nbconvert --version",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                await process.WaitForExitAsync();

                return process.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Abre notebook en modo interactivo (con servidor)
        /// </summary>
        private async Task<bool> OpenInteractive(string ipynbPath)
        {
            try
            {
                // Obtener directorio del archivo
                string notebookDir = Path.GetDirectoryName(ipynbPath);
                string fileName = Path.GetFileName(ipynbPath);

                // Iniciar servidor si no está corriendo
                if (!_isRunning)
                {
                    var started = await StartJupyterServer(notebookDir);
                    if (!started)
                        return false;
                }

                // Navegar al notebook
                string url = $"http://localhost:{_port}/notebooks/{fileName}?token={_token}";

                await _webView.EnsureCoreWebView2Async();
                _webView.CoreWebView2.Navigate(url);

                MessageBox.Show($"Abriendo notebook en Jupyter...\n\nURL: {url}",
                    "Jupyter", MessageBoxButton.OK, MessageBoxImage.Information);

                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error en modo interactivo:\n{ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }
        }

        /// <summary>
        /// Abre notebook en modo solo lectura (nbconvert)
        /// </summary>
        private async Task<bool> OpenReadOnly(string ipynbPath)
        {
            try
            {
                // Convertir a HTML usando nbconvert
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "python",
                        Arguments = $"-m nbconvert --to html --stdout \"{ipynbPath}\"",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                string html = await process.StandardOutput.ReadToEndAsync();
                await process.WaitForExitAsync();

                if (process.ExitCode != 0)
                {
                    string error = await process.StandardError.ReadToEndAsync();
                    throw new Exception($"nbconvert falló:\n{error}");
                }

                // Mostrar en WebView2
                await _webView.EnsureCoreWebView2Async();
                _webView.NavigateToString(html);

                MessageBox.Show("Notebook abierto en modo solo lectura.\n\n" +
                    "Para ejecutar código, instala Jupyter Server.",
                    "Modo Solo Lectura", MessageBoxButton.OK, MessageBoxImage.Information);

                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error en modo solo lectura:\n{ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }
        }

        /// <summary>
        /// Muestra instrucciones de instalación
        /// </summary>
        private void ShowInstallInstructions()
        {
            string instructions = @"Para usar Jupyter en Hekatan, instala Python + Jupyter:

1. Instalar Python:
   - Descarga: https://www.python.org/downloads/
   - Marca 'Add Python to PATH' durante instalación

2. Instalar Jupyter:
   Abre cmd y ejecuta:

   python -m pip install jupyter

3. Instalar paquetes útiles (opcional):

   python -m pip install numpy pandas matplotlib

4. Verificar instalación:

   python -m jupyter --version

Después de instalar, reinicia Hekatan.";

            MessageBox.Show(instructions, "Cómo instalar Jupyter",
                MessageBoxButton.OK, MessageBoxImage.Information);

            // Abrir URL de Python
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "https://www.python.org/downloads/",
                    UseShellExecute = true
                });
            }
            catch { }
        }

        /// <summary>
        /// Muestra el estado actual de Jupyter
        /// </summary>
        public async Task ShowStatus()
        {
            bool hasJupyter = await CheckJupyterAvailable();
            bool hasNbconvert = await CheckNbconvertAvailable();

            string status = "Estado de Jupyter:\n\n";
            status += $"Servidor corriendo: {(_isRunning ? "SÍ" : "NO")}\n";
            status += $"Jupyter instalado: {(hasJupyter ? "SÍ" : "NO")}\n";
            status += $"nbconvert instalado: {(hasNbconvert ? "SÍ" : "NO")}\n";

            if (_isRunning)
            {
                status += $"\nURL: http://localhost:{_port}\n";
                status += $"Token: {_token}";
            }

            MessageBox.Show(status, "Jupyter Status",
                MessageBoxButton.OK, MessageBoxImage.Information);
        }

        /// <summary>
        /// Limpieza al cerrar
        /// </summary>
        public void Dispose()
        {
            if (_isRunning)
            {
                StopJupyterServer();
            }
        }
    }
}
