using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using Microsoft.Win32;

namespace Hekatan.AiAgent
{
    public partial class MainWindow : Window
    {
        private readonly GroqClient _groq;
        private string? _loadedImageBase64;
        private string? _loadedImageMime;
        private string? _loadedImageName;
        private bool _cadReady;

        public MainWindow()
        {
            InitializeComponent();
            _groq = new GroqClient();

            AgregarChat("Sistema",
                "Hekatan AI Agent - Generador CAD\n" +
                "Describe lo que quieres dibujar.\n" +
                "Los comandos se ejecutan en el preview CAD.\n" +
                "AI Review: revisa el resultado y corrige.\n" +
                "Ctrl+V para pegar imagen del portapapeles.");

            // Drag & Drop
            AllowDrop = true;
            Drop += MainWindow_Drop;
            DragOver += MainWindow_DragOver;

            // Ctrl+V global
            PreviewKeyDown += MainWindow_PreviewKeyDown;

            // Initialize WebView2
            InitWebView();
        }

        // ═══════════════════════════════════════════════
        // WEBVIEW2: Preview CAD
        // ═══════════════════════════════════════════════
        private async void InitWebView()
        {
            try
            {
                await webCad.EnsureCoreWebView2Async();

                var projectRoot = FindProjectRoot();

                // Use ifc/cad-agent.html - standalone CAD with 2D+3D+oblique
                var cadHtmlPath = projectRoot != null
                    ? Path.Combine(projectRoot, "ifc", "cad-agent.html")
                    : "";

                if (File.Exists(cadHtmlPath))
                {
                    webCad.CoreWebView2.Navigate(new Uri(Path.GetFullPath(cadHtmlPath)).AbsoluteUri);
                    webCad.CoreWebView2.NavigationCompleted += (s, e) =>
                    {
                        _cadReady = e.IsSuccess;
                        lblPreviewInfo.Text = _cadReady
                            ? "Hekatan CAD listo (2D+3D+oblicua)"
                            : "Error al cargar CAD Preview";
                    };
                }
                else
                {
                    lblPreviewInfo.Text = "No se encontro CAD";
                    AgregarChat("Error",
                        $"No se encontro ifc/cad-agent.html.\n" +
                        $"Buscado en: {cadHtmlPath}");
                }
            }
            catch (Exception ex)
            {
                lblPreviewInfo.Text = $"WebView2 error: {ex.Message}";
                AgregarChat("Error", $"WebView2: {ex.Message}\nInstalar WebView2 Runtime si no esta instalado.");
            }
        }

        private static string? FindProjectRoot()
        {
            var dir = AppDomain.CurrentDomain.BaseDirectory;
            for (int i = 0; i < 8; i++)
            {
                var parent = Directory.GetParent(dir);
                if (parent == null) break;
                dir = parent.FullName;
                if (Directory.Exists(Path.Combine(dir, "ifc", "js", "cad")))
                    return dir;
            }
            // Fallback: check known location
            var known = @"C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0";
            if (Directory.Exists(Path.Combine(known, "ifc", "js", "cad")))
                return known;
            return null;
        }

        // ═══════════════════════════════════════════════
        // GENERAR: Enviar a AI
        // ═══════════════════════════════════════════════
        private async void btnEnviar_Click(object sender, RoutedEventArgs e)
        {
            await Generar();
        }

        private async void txtMensaje_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && !Keyboard.Modifiers.HasFlag(ModifierKeys.Shift))
            {
                e.Handled = true;
                await Generar();
            }
        }

        private async Task Generar()
        {
            var mensaje = txtMensaje.Text.Trim();
            var apiKey = txtApiKey.Password.Trim();

            if (string.IsNullOrEmpty(mensaje) && _loadedImageBase64 == null)
                return;

            if (string.IsNullOrEmpty(apiKey))
            {
                MessageBox.Show("Ingresa tu API Key de Groq.\nObtener gratis: https://console.groq.com/keys",
                    "API Key requerida", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            // Config
            _groq.ApiKey = apiKey;
            _groq.Model = ((System.Windows.Controls.ComboBoxItem)cboModelo.SelectedItem).Content.ToString()!;

            // Detectar modo
            var modoIndex = cboModo.SelectedIndex;
            var mode = modoIndex switch
            {
                0 => GenerationMode.CadCli,
                1 => GenerationMode.Svg,
                2 => GenerationMode.ThreeJs,
                3 => GenerationMode.Css,
                4 => GenerationMode.Calc,
                _ => GenerationMode.CadCli
            };

            // Si tiene imagen, usar vision
            if (_loadedImageBase64 != null && mode == GenerationMode.CadCli)
                mode = GenerationMode.CadCliVision;

            var systemPrompt = HekatanPrompts.GetPrompt(mode);

            // UI
            var displayMsg = string.IsNullOrEmpty(mensaje) ? "(imagen cargada)" : mensaje;
            if (_loadedImageBase64 != null)
                displayMsg += $" [+ imagen: {_loadedImageName}]";

            AgregarChat("Tu", displayMsg);
            txtMensaje.Clear();
            SetUIGenerando(true);
            lblStatus.Text = $"Enviando a Groq ({_groq.Model})...";

            try
            {
                string respuesta;

                if (_loadedImageBase64 != null)
                {
                    var visionMsg = string.IsNullOrEmpty(mensaje)
                        ? "Replica este dibujo/diagrama usando comandos CAD CLI. Genera los comandos completos."
                        : mensaje + "\n\nReplica esto usando comandos CAD CLI.";

                    respuesta = await _groq.SendImageAsync(systemPrompt, visionMsg,
                        _loadedImageBase64, _loadedImageMime ?? "image/png");
                }
                else
                {
                    respuesta = await _groq.SendTextAsync(systemPrompt, mensaje);
                }

                // Extraer comandos CAD limpios
                string code;
                if (mode == GenerationMode.CadCli || mode == GenerationMode.CadCliVision)
                {
                    code = HekatanCodeExtractor.ExtractCadCommands(respuesta);
                    if (string.IsNullOrWhiteSpace(code))
                    {
                        // Fallback: usar extraccion normal
                        var result = HekatanCodeExtractor.Extract(respuesta);
                        code = result.Code;
                    }
                }
                else
                {
                    var result = HekatanCodeExtractor.Extract(respuesta);
                    code = result.Code;
                }

                var lineCount = code.Split('\n').Length;
                AgregarChat($"AI ({_groq.Model})", $"Generado: {lineCount} lineas");

                // Poner codigo en editor
                txtCodigo.Text = code;
                lblInfo.Text = $"{lineCount} lineas generadas";

                // Auto-ejecutar en CAD preview
                if ((mode == GenerationMode.CadCli || mode == GenerationMode.CadCliVision) && _cadReady)
                {
                    await EjecutarEnCAD(code, true);
                }

                // Limpiar imagen
                _loadedImageBase64 = null;
                _loadedImageMime = null;
                _loadedImageName = null;
                lblImagen.Text = "";
                imgPreview.Source = null;
                imgPreview.Visibility = Visibility.Collapsed;
                btnQuitarImagen.Visibility = Visibility.Collapsed;

                lblStatus.Text = "Codigo generado y ejecutado en preview.";

                // Auto-review si esta activado
                if (chkAutoReview.IsChecked == true && _cadReady &&
                    (mode == GenerationMode.CadCli || mode == GenerationMode.CadCliVision))
                {
                    await ReviewConAI();
                }
            }
            catch (Exception ex)
            {
                AgregarChat("Error", ex.Message);
                lblStatus.Text = "Error: " + ex.Message;
            }
            finally
            {
                SetUIGenerando(false);
            }
        }

        // ═══════════════════════════════════════════════
        // EJECUTAR: Correr comandos en el CAD preview
        // ═══════════════════════════════════════════════
        private async void btnEjecutar_Click(object sender, RoutedEventArgs e)
        {
            if (!_cadReady || string.IsNullOrWhiteSpace(txtCodigo.Text))
                return;

            await EjecutarEnCAD(txtCodigo.Text, true);
        }

        private async Task EjecutarEnCAD(string commands, bool fresh)
        {
            if (!_cadReady) return;

            try
            {
                // Escape the commands for JavaScript
                var escaped = commands
                    .Replace("\\", "\\\\")
                    .Replace("\"", "\\\"")
                    .Replace("\r\n", "\\n")
                    .Replace("\r", "\\n")
                    .Replace("\n", "\\n");

                var jsFunc = fresh ? "runFresh" : "runCommands";
                var result = await webCad.CoreWebView2.ExecuteScriptAsync(
                    $"{jsFunc}(\"{escaped}\")");

                // Parse result
                if (result != null)
                {
                    var clean = result.Trim('"').Replace("\\\"", "\"");
                    if (clean.Contains("\"ok\":true"))
                    {
                        // Extract shape count
                        var match = System.Text.RegularExpressions.Regex.Match(clean, @"""shapes"":(\d+)");
                        var shapes = match.Success ? match.Groups[1].Value : "?";
                        lblShapes.Text = $"{shapes} formas";
                        lblPreviewInfo.Text = $"Ejecutado: {shapes} formas en canvas";
                    }
                    else
                    {
                        lblPreviewInfo.Text = "Error al ejecutar comandos";
                    }
                }
            }
            catch (Exception ex)
            {
                lblPreviewInfo.Text = $"Error: {ex.Message}";
            }
        }

        // ═══════════════════════════════════════════════
        // AI REVIEW: Screenshot → AI → Correccion
        // ═══════════════════════════════════════════════
        private async void btnReviewAI_Click(object sender, RoutedEventArgs e)
        {
            await ReviewConAI();
        }

        private async Task ReviewConAI()
        {
            if (!_cadReady) return;

            var apiKey = txtApiKey.Password.Trim();
            if (string.IsNullOrEmpty(apiKey))
            {
                AgregarChat("Sistema", "Se necesita API Key para AI Review");
                return;
            }

            lblStatus.Text = "Tomando screenshot del CAD...";
            SetUIGenerando(true);

            try
            {
                // 1. Tomar screenshot del canvas
                var screenshotDataUrl = await webCad.CoreWebView2.ExecuteScriptAsync("getScreenshot()");

                if (screenshotDataUrl == null || screenshotDataUrl == "null")
                {
                    AgregarChat("Error", "No se pudo capturar screenshot");
                    return;
                }

                // Remove quotes and extract base64
                var dataUrl = screenshotDataUrl.Trim('"').Replace("\\u002F", "/");
                var base64Prefix = "data:image/png;base64,";
                if (!dataUrl.StartsWith(base64Prefix))
                {
                    AgregarChat("Error", "Screenshot no es PNG base64");
                    return;
                }

                var base64Image = dataUrl.Substring(base64Prefix.Length);
                var currentCommands = txtCodigo.Text;

                // 2. Enviar al AI para review
                _groq.ApiKey = apiKey;
                _groq.Model = "meta-llama/llama-4-scout-17b-16e-instruct"; // Vision model

                var reviewPrompt = HekatanPrompts.CadCliPrompt + @"

MODO REVIEW: Estoy revisando un dibujo generado.
Compara la imagen del resultado con los comandos que generaron el dibujo.
Si hay errores o mejoras necesarias, genera los comandos COMPLETOS corregidos.
Si el dibujo se ve bien, responde exactamente: DIBUJO_OK

Los comandos actuales son:
" + currentCommands;

                lblStatus.Text = "AI revisando el dibujo...";
                AgregarChat("Sistema", "AI Review: analizando screenshot del CAD...");

                var reviewResponse = await _groq.SendImageAsync(
                    reviewPrompt,
                    "Revisa este dibujo CAD. Esta correcto? Si no, genera los comandos corregidos.",
                    base64Image, "image/png");

                if (reviewResponse.Contains("DIBUJO_OK") || reviewResponse.Contains("dibujo_ok"))
                {
                    AgregarChat("AI Review", "El dibujo se ve correcto. No se necesitan correcciones.");
                    lblStatus.Text = "AI Review: dibujo aprobado.";
                }
                else
                {
                    // Extraer comandos corregidos
                    var correctedCode = HekatanCodeExtractor.ExtractCadCommands(reviewResponse);
                    if (string.IsNullOrWhiteSpace(correctedCode))
                    {
                        var result = HekatanCodeExtractor.Extract(reviewResponse);
                        correctedCode = result.Code;
                    }

                    if (!string.IsNullOrWhiteSpace(correctedCode) && correctedCode.Length > 10)
                    {
                        var lineCount = correctedCode.Split('\n').Length;
                        AgregarChat("AI Review", $"Corrigiendo dibujo: {lineCount} lineas");

                        txtCodigo.Text = correctedCode;
                        await EjecutarEnCAD(correctedCode, true);
                        lblStatus.Text = "AI Review: dibujo corregido y ejecutado.";
                    }
                    else
                    {
                        AgregarChat("AI Review", reviewResponse.Length > 200
                            ? reviewResponse[..200] + "..."
                            : reviewResponse);
                        lblStatus.Text = "AI Review: respuesta recibida.";
                    }
                }
            }
            catch (Exception ex)
            {
                AgregarChat("Error Review", ex.Message);
                lblStatus.Text = "Error en review: " + ex.Message;
            }
            finally
            {
                SetUIGenerando(false);
            }
        }

        // ═══════════════════════════════════════════════
        // CLEAR CAD
        // ═══════════════════════════════════════════════
        private async void btnClearCAD_Click(object sender, RoutedEventArgs e)
        {
            if (!_cadReady) return;
            await webCad.CoreWebView2.ExecuteScriptAsync("runFresh('')");
            lblShapes.Text = "0 formas";
            lblPreviewInfo.Text = "CAD limpiado";
        }

        // ═══════════════════════════════════════════════
        // PEGAR IMAGEN: Ctrl+V
        // ═══════════════════════════════════════════════
        private void MainWindow_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.V && Keyboard.Modifiers == ModifierKeys.Control)
            {
                if (txtMensaje.IsFocused && !Clipboard.ContainsImage() && !Clipboard.ContainsFileDropList())
                    return;

                if (PegarImagenDesdeClipboard())
                {
                    e.Handled = true;
                }
            }
        }

        private bool PegarImagenDesdeClipboard()
        {
            try
            {
                if (Clipboard.ContainsImage())
                {
                    var bitmapSource = Clipboard.GetImage();
                    if (bitmapSource != null)
                    {
                        var encoder = new PngBitmapEncoder();
                        encoder.Frames.Add(BitmapFrame.Create(bitmapSource));

                        using var ms = new MemoryStream();
                        encoder.Save(ms);
                        var bytes = ms.ToArray();

                        _loadedImageBase64 = Convert.ToBase64String(bytes);
                        _loadedImageMime = "image/png";
                        _loadedImageName = $"clipboard_{DateTime.Now:HHmmss}.png";

                        MostrarImagenCargada(bytes.Length);
                        MostrarPreview(bitmapSource);
                        return true;
                    }
                }

                if (Clipboard.ContainsFileDropList())
                {
                    var files = Clipboard.GetFileDropList();
                    foreach (string? file in files)
                    {
                        if (file != null && EsImagen(file))
                        {
                            CargarImagenDesdeArchivo(file);
                            return true;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                lblStatus.Text = $"Error al pegar imagen: {ex.Message}";
            }

            return false;
        }

        // ═══════════════════════════════════════════════
        // DRAG & DROP
        // ═══════════════════════════════════════════════
        private void MainWindow_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                e.Effects = files.Any(EsImagen) ? DragDropEffects.Copy : DragDropEffects.None;
            }
            else
            {
                e.Effects = DragDropEffects.None;
            }
            e.Handled = true;
        }

        private void MainWindow_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                var imagen = files.FirstOrDefault(EsImagen);
                if (imagen != null)
                {
                    CargarImagenDesdeArchivo(imagen);
                }
            }
        }

        // ═══════════════════════════════════════════════
        // CARGAR IMAGEN
        // ═══════════════════════════════════════════════
        private void btnCargarImagen_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog
            {
                Title = "Cargar imagen para replicar",
                Filter = "Imagenes|*.png;*.jpg;*.jpeg;*.bmp;*.gif;*.webp|Todos|*.*"
            };

            if (dialog.ShowDialog() == true)
            {
                CargarImagenDesdeArchivo(dialog.FileName);
            }
        }

        private void CargarImagenDesdeArchivo(string filePath)
        {
            try
            {
                var bytes = File.ReadAllBytes(filePath);
                _loadedImageBase64 = Convert.ToBase64String(bytes);
                _loadedImageName = Path.GetFileName(filePath);

                var ext = Path.GetExtension(filePath).ToLower();
                _loadedImageMime = ext switch
                {
                    ".png" => "image/png",
                    ".jpg" or ".jpeg" => "image/jpeg",
                    ".gif" => "image/gif",
                    ".webp" => "image/webp",
                    ".bmp" => "image/bmp",
                    _ => "image/png"
                };

                MostrarImagenCargada(bytes.Length);

                var bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.UriSource = new Uri(filePath);
                bitmap.DecodePixelWidth = 150;
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.EndInit();
                MostrarPreview(bitmap);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al cargar imagen: {ex.Message}");
            }
        }

        private void MostrarImagenCargada(int sizeBytes)
        {
            lblImagen.Text = $"{_loadedImageName} ({sizeBytes / 1024}KB)";
            lblStatus.Text = $"Imagen lista: {_loadedImageName}";

            // Auto-switch a modelo vision
            var currentModel = ((System.Windows.Controls.ComboBoxItem)cboModelo.SelectedItem).Content.ToString()!;
            if (!currentModel.Contains("scout"))
            {
                cboModelo.SelectedIndex = 1;
                AgregarChat("Sistema", "Modelo cambiado a Llama 4 Scout (vision)");
            }
        }

        private void MostrarPreview(BitmapSource bitmap)
        {
            imgPreview.Source = bitmap;
            imgPreview.Visibility = Visibility.Visible;
            btnQuitarImagen.Visibility = Visibility.Visible;
        }

        private void btnQuitarImagen_Click(object sender, RoutedEventArgs e)
        {
            _loadedImageBase64 = null;
            _loadedImageMime = null;
            _loadedImageName = null;
            lblImagen.Text = "";
            imgPreview.Source = null;
            imgPreview.Visibility = Visibility.Collapsed;
            btnQuitarImagen.Visibility = Visibility.Collapsed;
            lblStatus.Text = "Imagen removida.";
        }

        private static bool EsImagen(string path)
        {
            var ext = Path.GetExtension(path).ToLower();
            return ext is ".png" or ".jpg" or ".jpeg" or ".bmp" or ".gif" or ".webp";
        }

        // ═══════════════════════════════════════════════
        // COPIAR / GUARDAR
        // ═══════════════════════════════════════════════
        private void btnCopiar_Click(object sender, RoutedEventArgs e)
        {
            if (!string.IsNullOrWhiteSpace(txtCodigo.Text))
            {
                Clipboard.SetText(txtCodigo.Text);
                lblStatus.Text = "Comandos copiados al portapapeles.";
            }
        }

        private void btnGuardar_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(txtCodigo.Text))
                return;

            var dialog = new SaveFileDialog
            {
                Title = "Guardar comandos CAD",
                Filter = "CAD Commands|*.cad|Text|*.txt|Todos|*.*",
                DefaultExt = ".cad",
                FileName = "ai-generated.cad"
            };

            if (dialog.ShowDialog() == true)
            {
                File.WriteAllText(dialog.FileName, txtCodigo.Text);
                lblStatus.Text = $"Guardado: {dialog.FileName}";
            }
        }

        // ═══════════════════════════════════════════════
        // HELPERS UI
        // ═══════════════════════════════════════════════
        private void SetUIGenerando(bool generando)
        {
            btnEnviar.IsEnabled = !generando;
            btnEnviar.Content = generando ? "..." : "Generar";
            btnReviewAI.IsEnabled = !generando;
            btnEjecutar.IsEnabled = !generando;
        }

        private void AgregarChat(string remitente, string mensaje)
        {
            var hora = DateTime.Now.ToString("HH:mm:ss");
            txtChat.Text += $"\n[{hora}] {remitente}:\n{mensaje}\n{"".PadLeft(40, '\u2500')}\n";
            scrollChat.ScrollToEnd();
        }
    }
}
