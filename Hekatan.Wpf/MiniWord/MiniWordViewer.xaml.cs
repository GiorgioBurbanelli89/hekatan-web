using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using Hekatan.OpenXml;

namespace Hekatan.Wpf.MiniWord
{
    /// <summary>
    /// Visor y editor de documentos Word (.docx) integrado en Hekatan
    /// </summary>
    public partial class MiniWordViewer : UserControl
    {
        private string _currentFilePath;
        private bool _isModified;
        private double _zoomLevel = 100;
        private bool _isEditMode;
        private DocxReader _docxReader;
        private bool _webViewInitialized;

        /// <summary>
        /// Evento que se dispara cuando el usuario quiere importar contenido a Hekatan
        /// </summary>
        public event EventHandler<ImportToHekatanEventArgs> ImportToHekatan;

        /// <summary>
        /// Ruta del archivo actual
        /// </summary>
        public string CurrentFilePath => _currentFilePath;

        /// <summary>
        /// Indica si el documento ha sido modificado
        /// </summary>
        public bool IsModified => _isModified;

        public MiniWordViewer()
        {
            InitializeComponent();
            InitializeWebView();

            // Permitir drag and drop
            AllowDrop = true;
            Drop += MiniWordViewer_Drop;
            DragOver += MiniWordViewer_DragOver;
        }

        private async void InitializeWebView()
        {
            try
            {
                await DocumentWebView.EnsureCoreWebView2Async();
                _webViewInitialized = true;

                // Configurar WebView2
                DocumentWebView.CoreWebView2.Settings.IsScriptEnabled = true;
                DocumentWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                DocumentWebView.CoreWebView2.Settings.IsZoomControlEnabled = true;

                // Escuchar mensajes del JavaScript
                DocumentWebView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Error inicializando WebView2: {ex.Message}";
            }
        }

        private void CoreWebView2_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                var message = e.TryGetWebMessageAsString();
                if (message == "content-changed")
                {
                    SetModified(true);
                }
            }
            catch { }
        }

        #region File Operations

        private void OpenButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog
            {
                Filter = "Documentos Word (*.docx)|*.docx|Todos los archivos (*.*)|*.*",
                Title = "Abrir documento Word"
            };

            if (dialog.ShowDialog() == true)
            {
                OpenDocument(dialog.FileName);
            }
        }

        public void OpenDocument(string filePath)
        {
            if (!File.Exists(filePath))
            {
                MessageBox.Show($"Archivo no encontrado: {filePath}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            try
            {
                StatusText.Text = "Cargando documento...";
                _docxReader = new DocxReader();
                var html = _docxReader.ReadToHtml(filePath);

                // Envolver el contenido en HTML completo con estilos
                var fullHtml = WrapContentInHtml(html);

                // Mostrar en WebView2
                if (_webViewInitialized)
                {
                    DocumentWebView.NavigateToString(fullHtml);
                }

                _currentFilePath = filePath;
                SetModified(false);

                // Actualizar UI
                PlaceholderPanel.Visibility = Visibility.Collapsed;
                DocumentWebView.Visibility = Visibility.Visible;
                FormatToolbar.Visibility = Visibility.Visible;
                SaveButton.IsEnabled = true;
                SaveAsButton.IsEnabled = true;
                ImportButton.IsEnabled = true;

                // Mostrar info en barra de estado
                WordVersionText.Text = _docxReader.WordVersion;
                StatusText.Text = $"Documento cargado: {Path.GetFileName(filePath)}";

                // Mostrar advertencias si las hay
                if (_docxReader.Warnings.Count > 0)
                {
                    StatusText.Text += $" ({_docxReader.Warnings.Count} advertencias)";
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error abriendo documento: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                StatusText.Text = "Error cargando documento";
            }
        }

        private string WrapContentInHtml(string bodyContent)
        {
            var editableAttr = _isEditMode ? "contenteditable=\"true\"" : "";
            var editScript = _isEditMode ? @"
                <script>
                    document.body.addEventListener('input', function() {
                        window.chrome.webview.postMessage('content-changed');
                    });
                </script>" : "";

            return $@"<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1"">
    <style>
        body {{
            font-family: 'Calibri', 'Segoe UI', sans-serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #333;
            max-width: 800px;
            margin: 20px auto;
            padding: 20px 40px;
            background: white;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            min-height: 100vh;
            box-sizing: border-box;
        }}
        h1 {{ font-size: 24pt; color: #2B579A; margin: 20px 0; }}
        h2 {{ font-size: 18pt; color: #2B579A; margin: 18px 0; }}
        h3 {{ font-size: 14pt; color: #2B579A; margin: 14px 0; }}
        h4 {{ font-size: 12pt; color: #2B579A; margin: 12px 0; }}
        p {{ margin: 10px 0; }}
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 10px 0;
        }}
        th, td {{
            border: 1px solid #ccc;
            padding: 8px;
            text-align: left;
        }}
        th {{ background-color: #f0f0f0; }}
        img {{
            max-width: 100%;
            height: auto;
        }}
        a {{ color: #2B579A; }}
        ul, ol {{ margin: 10px 0; padding-left: 30px; }}
        blockquote {{
            border-left: 3px solid #2B579A;
            margin: 10px 0;
            padding-left: 15px;
            color: #666;
        }}
        .page-break {{
            page-break-after: always;
            border-top: 2px dashed #ccc;
            margin: 30px 0;
        }}
        @media print {{
            body {{
                box-shadow: none;
                margin: 0;
                padding: 0;
            }}
        }}
    </style>
</head>
<body {editableAttr}>
{bodyContent}
{editScript}
</body>
</html>";
        }

        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(_currentFilePath))
            {
                SaveAsButton_Click(sender, e);
                return;
            }

            SaveDocument(_currentFilePath);
        }

        private void SaveAsButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new SaveFileDialog
            {
                Filter = "Documento Word (*.docx)|*.docx|HTML (*.html)|*.html",
                Title = "Guardar documento como",
                FileName = Path.GetFileNameWithoutExtension(_currentFilePath ?? "documento")
            };

            if (dialog.ShowDialog() == true)
            {
                SaveDocument(dialog.FileName);
            }
        }

        private async void SaveDocument(string filePath)
        {
            try
            {
                StatusText.Text = "Guardando...";

                if (filePath.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
                {
                    // Obtener HTML del WebView
                    var html = await DocumentWebView.ExecuteScriptAsync("document.documentElement.outerHTML");
                    // Remover comillas del JSON
                    html = System.Text.Json.JsonSerializer.Deserialize<string>(html);
                    File.WriteAllText(filePath, html);
                }
                else
                {
                    // TODO: Implementar guardado a DOCX usando OpenXmlWriter
                    MessageBox.Show("Guardado a DOCX aun no implementado. Use HTML por ahora.",
                        "Informacion", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                _currentFilePath = filePath;
                SetModified(false);
                StatusText.Text = $"Guardado: {Path.GetFileName(filePath)}";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error guardando: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                StatusText.Text = "Error guardando";
            }
        }

        #endregion

        #region Edit Operations

        private void UndoButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('undo')");
            }
        }

        private void RedoButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('redo')");
            }
        }

        private void BoldButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized && _isEditMode)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('bold')");
            }
        }

        private void ItalicButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized && _isEditMode)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('italic')");
            }
        }

        private void UnderlineButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized && _isEditMode)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('underline')");
            }
        }

        private void FontSizeCombo_Changed(object sender, SelectionChangedEventArgs e)
        {
            if (!_webViewInitialized || !_isEditMode) return;

            var item = FontSizeCombo.SelectedItem as ComboBoxItem;
            if (item != null)
            {
                var size = item.Content.ToString();
                DocumentWebView.ExecuteScriptAsync($"document.execCommand('fontSize', false, '{size}')");
            }
        }

        private void AlignLeftButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized && _isEditMode)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('justifyLeft')");
            }
        }

        private void AlignCenterButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized && _isEditMode)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('justifyCenter')");
            }
        }

        private void AlignRightButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized && _isEditMode)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('justifyRight')");
            }
        }

        private void BulletListButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized && _isEditMode)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('insertUnorderedList')");
            }
        }

        private void NumberListButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webViewInitialized && _isEditMode)
            {
                DocumentWebView.ExecuteScriptAsync("document.execCommand('insertOrderedList')");
            }
        }

        private void EditModeCheckBox_Changed(object sender, RoutedEventArgs e)
        {
            _isEditMode = EditModeCheckBox.IsChecked == true;

            // Recargar documento con/sin contenteditable
            if (!string.IsNullOrEmpty(_currentFilePath) && _docxReader != null)
            {
                var html = _docxReader.ReadToHtml(_currentFilePath);
                var fullHtml = WrapContentInHtml(html);
                DocumentWebView.NavigateToString(fullHtml);
            }

            // Habilitar/deshabilitar botones de edicion
            UndoButton.IsEnabled = _isEditMode;
            RedoButton.IsEnabled = _isEditMode;
        }

        #endregion

        #region Zoom

        private void ZoomInButton_Click(object sender, RoutedEventArgs e)
        {
            SetZoom(_zoomLevel + 10);
        }

        private void ZoomOutButton_Click(object sender, RoutedEventArgs e)
        {
            SetZoom(_zoomLevel - 10);
        }

        private void ZoomResetButton_Click(object sender, RoutedEventArgs e)
        {
            SetZoom(100);
        }

        private void SetZoom(double level)
        {
            _zoomLevel = Math.Max(25, Math.Min(400, level));
            ZoomLevelText.Text = $"{_zoomLevel}%";

            if (_webViewInitialized)
            {
                DocumentWebView.ZoomFactor = _zoomLevel / 100.0;
            }
        }

        #endregion

        #region Import to Hekatan

        private async void ImportButton_Click(object sender, RoutedEventArgs e)
        {
            if (!_webViewInitialized) return;

            try
            {
                // Obtener texto seleccionado o todo el contenido
                var script = @"
                    (function() {
                        var selection = window.getSelection();
                        if (selection && selection.toString().trim().length > 0) {
                            return selection.toString();
                        } else {
                            return document.body.innerText;
                        }
                    })()";

                var result = await DocumentWebView.ExecuteScriptAsync(script);
                var text = System.Text.Json.JsonSerializer.Deserialize<string>(result);

                if (!string.IsNullOrWhiteSpace(text))
                {
                    ImportToHekatan?.Invoke(this, new ImportToHekatanEventArgs
                    {
                        Content = text,
                        SourceFile = _currentFilePath
                    });

                    StatusText.Text = "Contenido importado a Hekatan";
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error importando: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        #endregion

        #region Drag and Drop

        private void MiniWordViewer_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (files.Length > 0 && files[0].EndsWith(".docx", StringComparison.OrdinalIgnoreCase))
                {
                    e.Effects = DragDropEffects.Copy;
                    e.Handled = true;
                    return;
                }
            }
            e.Effects = DragDropEffects.None;
            e.Handled = true;
        }

        private void MiniWordViewer_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (files.Length > 0 && files[0].EndsWith(".docx", StringComparison.OrdinalIgnoreCase))
                {
                    OpenDocument(files[0]);
                }
            }
        }

        #endregion

        #region Helpers

        private void SetModified(bool modified)
        {
            _isModified = modified;
            ModifiedIndicator.Text = modified ? "Modificado" : "";
        }

        private void DocumentWebView_NavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess)
            {
                StatusText.Text = "Error cargando documento en WebView";
            }
        }

        #endregion
    }

    /// <summary>
    /// Argumentos para el evento ImportToHekatan
    /// </summary>
    public class ImportToHekatanEventArgs : EventArgs
    {
        public string Content { get; set; }
        public string SourceFile { get; set; }
    }
}
