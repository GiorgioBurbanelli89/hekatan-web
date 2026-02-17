using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Hekatan.Core;
using Microsoft.Web.WebView2.Core;
using ICSharpCode.AvalonEdit;

namespace Hekatan.Wpf.MathEditor
{
    public partial class MathEditorControl : UserControl
    {
        // Lista de líneas, cada línea es una lista de elementos
        private List<List<MathElement>> _lines = new List<List<MathElement>>();
        private int _currentLineIndex = 0;
        private MathElement _currentElement;

        // DEBUG: Archivo de log para monitoreo en tiempo real
        private static readonly string LogFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
            "matheditor_debug.log");

        private void DebugLog(string message)
        {
            try
            {
                var timestamp = DateTime.Now.ToString("HH:mm:ss.fff");
                var elementInfo = _currentElement != null
                    ? $"[{_currentElement.GetType().Name}] Parent={_currentElement.Parent?.GetType().Name ?? "null"}"
                    : "[null]";
                var cursorInfo = $"CursorPos={GetCurrentCursorPosition()}, TextLen={GetCurrentTextLength()}";
                var lineInfo = $"Line={_currentLineIndex}, Elements={CurrentLine?.Count ?? 0}";

                var logLine = $"{timestamp} | {lineInfo} | {elementInfo} | {cursorInfo} | {message}";
                File.AppendAllText(LogFile, logLine + Environment.NewLine);
            }
            catch { }
        }

        // Tamaño de fuente base (11pt ≈ 14.67px) y zoom
        private const double BaseFontSize = 14.67;
        private const double BaseLineHeight = 22;
        private double _zoomLevel = 1.0;
        private double _fontSize = BaseFontSize;
        private double _lineHeight = BaseLineHeight;

        private DispatcherTimer _cursorTimer;
        private bool _cursorVisible = true;
        private bool _isTextMode = false;

        // Optimización: evitar renders innecesarios durante carga de archivos grandes
        private bool _isLoading = false;

        // Selección de texto con mouse y Shift+Arrow
        private bool _isSelecting = false;
        private MathElement _selectionStartElement;
        private int _selectionStartPosition = -1;
        private int _selectionStartLineIndex = -1;
        private int _selectionStartElementIndex = -1;

        // Selección de estructuras completas (vector, matriz)
        private MathElement _selectedStructure = null;

        // Selección de línea completa o múltiples elementos
        private bool _hasLineSelection = false;
        private int _lineSelectionStartLine = -1;
        private int _lineSelectionEndLine = -1;
        private int _lineSelectionStartElemIdx = -1;
        private int _lineSelectionEndElemIdx = -1;
        private List<MathElement> _selectedElements = new List<MathElement>();

        // Autocompletado
        private MathAutoComplete _autoComplete;
        private string _autoCompleteBuffer = "";

        // Modo Visual (WebView2 para renderizar HTML)
        private bool _isVisualMode = false;
        private bool _webView2Initialized = false;
        private ExpressionParser _visualParser;

        // Preview AvalonEdit para mostrar línea actual con syntax highlighting
        // DEPRECATED: Ahora usamos PreviewEditor del XAML directamente
        // private TextEditor _previewEditor;

        // Evento para notificar cambios de contenido
        public event EventHandler ContentChanged;

        // Evento para solicitar cambio a modo Code (al hacer doble-click en bloque externo)
        public event EventHandler<int> SwitchToCodeModeRequested;

        public MathEditorControl()
        {
            InitializeComponent();

            // Inicializar con una línea vacía
            var initialLine = new List<MathElement>();
            var initialText = new MathText();
            initialText.IsCursorHere = true;
            initialLine.Add(initialText);
            _lines.Add(initialLine);
            _currentElement = initialText;

            // Timer para parpadeo del cursor
            _cursorTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(500)
            };
            _cursorTimer.Tick += (s, e) =>
            {
                _cursorVisible = !_cursorVisible;
                // Optimización: evitar render completo en archivos grandes
                if (!_isLoading && _lines.Count < 100)
                {
                    Render();
                }
                else
                {
                    // Solo actualizar el elemento actual del cursor
                    UpdateCursorOnly();
                }
            };

            Loaded += (s, e) =>
            {
                // Inicializar preview AvalonEdit compacto
                // DEPRECATED: PreviewEditor se inicializa automáticamente desde XAML
                // InitializePreviewEditor();

                Render();
                _cursorTimer.Start();
                Focus();

                // Inicializar autocompletado
                _autoComplete = new MathAutoComplete(AutoCompletePopup, AutoCompleteListBox);
                _autoComplete.SetInsertCallback(InsertAutoCompleteText);
            };

            // FIX: Detener timers cuando el control se descarga (evitar memory leak)
            Unloaded += (s, e) =>
            {
                _cursorTimer?.Stop();
                _previewEditorProtectionTimer?.Stop();
            };

            PreviewKeyDown += MathEditorControl_PreviewKeyDown;
            PreviewTextInput += MathEditorControl_PreviewTextInput;

            // Inicializar parser para modo Visual
            _visualParser = new ExpressionParser();
            _visualParser.Settings = new Settings();

            // Inicializar WebView2 para modo Visual
            InitializeVisualWebView();
        }

        /// <summary>
        /// Inicializa AvalonEdit compacto para preview de la línea actual
        /// DEPRECATED: Ahora usamos PreviewEditor del XAML directamente
        /// </summary>
        /*
        private void InitializePreviewEditor()
        {
            if (PreviewEditorContainer == null) return;

            _previewEditor = new TextEditor
            {
                FontFamily = new FontFamily("Consolas"),
                FontSize = 10,
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                IsReadOnly = true,
                HorizontalScrollBarVisibility = System.Windows.Controls.ScrollBarVisibility.Hidden,
                VerticalScrollBarVisibility = System.Windows.Controls.ScrollBarVisibility.Hidden,
                ShowLineNumbers = false,
                WordWrap = false,
                Padding = new Thickness(0, -2, 0, 0),  // Ajuste vertical para alinear con "Hekatan:"
                Margin = new Thickness(0),
                VerticalAlignment = System.Windows.VerticalAlignment.Center
            };

            // Ocultar el margen de folding y otros
            _previewEditor.TextArea.LeftMargins.Clear();

            // Cargar syntax highlighting de Hekatan si existe
            try
            {
                var xshdPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Hekatan.xshd");
                if (System.IO.File.Exists(xshdPath))
                {
                    using (var reader = new System.Xml.XmlTextReader(xshdPath))
                    {
                        _previewEditor.SyntaxHighlighting = ICSharpCode.AvalonEdit.Highlighting.Xshd.HighlightingLoader.Load(reader,
                            ICSharpCode.AvalonEdit.Highlighting.HighlightingManager.Instance);
                    }
                }
            }
            catch { }

            PreviewEditorContainer.Child = _previewEditor;
        }
        */

        #region Modo Visual (HTML Preview)

        /// <summary>
        /// Inicializa WebView2 para preview HTML secundario
        /// NOTA: El modo Visual ahora usa el Canvas editable directamente
        /// El WebView2 es solo para generar preview HTML opcional
        /// </summary>
        private async void InitializeVisualWebView()
        {
            try
            {
                await VisualWebView.EnsureCoreWebView2Async();
                _webView2Initialized = true;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error initializing WebView2: {ex.Message}");
            }
        }

        /// <summary>
        /// Maneja el cambio entre vista Código y Visual
        /// IMPORTANTE: Ambos modos usan el Canvas editable para permitir clicks
        /// El modo Visual muestra el Canvas SIN el preview del código Hekatan
        /// El modo Código muestra el Canvas CON el preview del código Hekatan
        /// </summary>
        private void ViewModeRadio_Checked(object sender, RoutedEventArgs e)
        {
            if (CodeViewRadio == null || VisualViewRadio == null) return;

            _isVisualMode = VisualViewRadio.IsChecked == true;

            // SIEMPRE mostrar el Canvas editable (CodeViewBorder) para permitir clicks
            // El modo solo afecta la visibilidad de elementos auxiliares
            CodeViewBorder.Visibility = Visibility.Visible;
            VisualViewBorder.Visibility = Visibility.Collapsed;

            if (_isVisualMode)
            {
                // Modo Visual: Ocultar la barra de preview del código Hekatan y números de línea
                // El canvas sigue siendo editable con clicks
                if (PreviewTextBlock != null)
                    PreviewTextBlock.Visibility = Visibility.Collapsed;
                if (PreviewEditorContainer != null)
                    PreviewEditorContainer.Visibility = Visibility.Collapsed;
                if (LineNumberBorder != null)
                    LineNumberBorder.Visibility = Visibility.Collapsed;

                // También actualizar el WebView2 como preview secundario (opcional)
                UpdateVisualView();
            }
            else
            {
                // Modo Código: Mostrar todos los elementos de ayuda
                if (PreviewTextBlock != null)
                    PreviewTextBlock.Visibility = Visibility.Visible;
                if (LineNumberBorder != null)
                    LineNumberBorder.Visibility = Visibility.Visible;
            }

            // Siempre mantener el cursor activo y re-renderizar
            _cursorTimer.Start();
            Render();
            Focus();
        }

        /// <summary>
        /// Actualiza la vista Visual con el HTML renderizado
        /// OPTIMIZACIÓN: Usamos GenerateVisualHtml directamente (más rápido)
        /// en lugar del parser completo que es lento
        /// </summary>
        private void UpdateVisualView()
        {
            if (!_webView2Initialized || VisualWebView?.CoreWebView2 == null) return;

            try
            {
                var calcpadCode = ToHekatan();

                // Usar el método rápido de generación de HTML
                // El parser completo es muy lento y no aporta valor en preview
                var html = GenerateVisualHtml(calcpadCode);
                VisualWebView.NavigateToString(html);
            }
            catch (Exception ex)
            {
                var errorHtml = $"<html><body><pre style='color:red;'>Error: {System.Net.WebUtility.HtmlEncode(ex.Message)}</pre></body></html>";
                VisualWebView.NavigateToString(errorHtml);
            }
        }
        
        /// <summary>
        /// Envuelve el HTML del parser en un documento completo con estilos
        /// </summary>
        private string WrapHtmlWithStyles(string htmlContent)
        {
            return $@"<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <style>
        body {{
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            padding: 15px;
            margin: 0;
            color: #333;
        }}
        h1 {{ font-size: 2.1em; color: #333; margin: 0.5em 0 0.3em 0; }}
        h2 {{ font-size: 1.7em; color: #333; margin: 0.5em 0 0.3em 0; }}
        h3 {{ font-size: 1.4em; color: #333; margin: 0.5em 0 0.3em 0; }}
        h4 {{ font-size: 1.2em; color: #333; margin: 0.5em 0 0.3em 0; }}
        p {{ margin: 0.3em 0; }}
        hr {{ border: none; border-top: 1px solid #ccc; margin: 0.5em 0; }}
        .eq {{ font-family: 'Georgia Pro', 'Times New Roman', serif; }}
        var {{ color: #06d; font-style: italic; }}
        sub {{ font-size: 80%; vertical-align: -18%; }}
        sup {{ font-size: 75%; }}
        .dvc {{ display: inline-block; text-align: center; vertical-align: middle; }}
        .dvl {{ display: block; height: 1px; background: #333; margin: 2px 0; }}
        img {{ max-width: 100%; }}
        table {{ border-collapse: collapse; margin: 0.5em 0; }}
        td, th {{ padding: 4px 8px; }}
    </style>
</head>
<body>
{htmlContent}
</body>
</html>";
        }

        /// <summary>
        /// Genera HTML para la vista Visual (sin ejecutar cálculos, solo formato)
        /// Usa los mismos estilos que template.html de Hekatan para consistencia visual
        /// </summary>
        private string GenerateVisualHtml(string calcpadCode)
        {
            var sb = new StringBuilder();

            // HTML header con estilos IDÉNTICOS a template.html de Hekatan
            sb.AppendLine(@"<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <style>
        body {
            font-size: 11pt;
            font-family: 'Segoe UI', 'Arial Nova', Helvetica, sans-serif;
            margin-left: 5mm;
            max-width: 190mm;
        }
        h1, h2, h3, h4, h5, h6 {
            font-family: 'Arial Nova', Helvetica, sans-serif;
            margin: 0.5em 0 0.5em 0;
            padding: 0;
            line-height: 150%;
        }
        h1 { font-size: 2.1em; }
        h2 { font-size: 1.7em; }
        h3 { font-size: 1.4em; }
        h4 { font-size: 1.2em; }
        h5 { font-size: 1.1em; }
        h6 { font-size: 1em; }
        p, li {
            margin: 0.3em 0 0.3em 0;
            padding: 0;
            line-height: 150%;
        }
        .eq, input[type='text'], table.matrix {
            font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif;
        }
        .eq var {
            color: #06d;
            font-size: 105%;
        }
        .eq i {
            color: #086;
            font-style: normal;
            font-size: 90%;
        }
        .eq sub {
            font-family: Calibri, Candara, Corbel, sans-serif;
            font-size: 80%;
            vertical-align: -18%;
        }
        .eq sup {
            display: inline-block;
            margin-left: 1pt;
            margin-top: -3pt;
            font-size: 75%;
        }
        hr { border: none; border-top: 1px solid #ccc; margin: 0.5em 0; }
        table { border-collapse: collapse; }
        table.bordered { margin-top: 1em; }
        table.bordered th { background-color: #F0F0F0; border: solid 1pt #AAAAAA; }
        table.bordered td { border: solid 1pt #CCCCCC; }
        td, th { padding: 2pt 4pt 2pt 4pt; vertical-align: top; }
        .dvc, .dvr, .dvs {
            display: inline-block;
            vertical-align: middle;
            white-space: nowrap;
        }
        .dvc { padding-left: 2pt; padding-right: 2pt; text-align: center; line-height: 110%; }
        .dvl { display: block; border-bottom: solid 1pt black; margin-top: 1pt; margin-bottom: 1pt; }
        .err { color: Crimson; background-color: #FEE; }
        .ok { color: Green; background-color: #F0FFF0; }
        .math-line { margin: 3px 0; line-height: 150%; }
        .comment { }
        .title { font-weight: bold; }
        .side { float: right; max-width: 50%; }
        img { max-width: 100%; }
    </style>
</head>
<body>");

            // Procesar cada línea del código Hekatan
            var lines = calcpadCode.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            foreach (var line in lines)
            {
                var htmlLine = ConvertHekatanLineToHtml(line);
                sb.AppendLine(htmlLine);
            }

            sb.AppendLine("</body></html>");
            return sb.ToString();
        }

        /// <summary>
        /// Convierte una línea de código Hekatan a HTML para preview
        /// </summary>
        private string ConvertHekatanLineToHtml(string line)
        {
            if (string.IsNullOrWhiteSpace(line))
                return "<br/>";

            // Detectar y manejar directivas de control de visibilidad
            var trimmedLine = line.TrimStart();
            if (trimmedLine.StartsWith("#"))
            {
                // Keywords de control - aplicar pero no mostrar
                var keyword = trimmedLine.ToLowerInvariant();
                if (keyword.StartsWith("#hide") || keyword.StartsWith("#show") ||
                    keyword.StartsWith("#pre") || keyword.StartsWith("#post") ||
                    keyword.StartsWith("#val") || keyword.StartsWith("#equ") ||
                    keyword.StartsWith("#noc") || keyword.StartsWith("#nosub") ||
                    keyword.StartsWith("#novar") || keyword.StartsWith("#varsub") ||
                    keyword.StartsWith("#split") || keyword.StartsWith("#wrap") ||
                    keyword.StartsWith("#round") || keyword.StartsWith("#format") ||
                    keyword.StartsWith("#md") || keyword.StartsWith("#deg") ||
                    keyword.StartsWith("#rad") || keyword.StartsWith("#gra"))
                {
                    // Mostrar directivas como texto gris pequeño
                    return $"<div style='color:#999;font-size:0.9em;'>{System.Net.WebUtility.HtmlEncode(trimmedLine)}</div>";
                }
            }

            var sb = new StringBuilder();
            int i = 0;

            while (i < line.Length)
            {
                // Título con comillas dobles: "..."
                if (line[i] == '"')
                {
                    i++;
                    int start = i;
                    while (i < line.Length && line[i] != '"')
                        i++;
                    var titleContent = line.Substring(start, i - start);
                    if (i < line.Length) i++; // Skip closing quote

                    // El contenido ya puede tener HTML (h1, h2, etc.)
                    // Verificar si es un tag HTML válido
                    if (titleContent.TrimStart().StartsWith("<"))
                    {
                        sb.Append(titleContent);
                    }
                    else
                    {
                        // Texto plano - envolver en span de título
                        sb.Append($"<span class='title'>{System.Net.WebUtility.HtmlEncode(titleContent)}</span>");
                    }
                    continue;
                }

                // Comentario con comilla simple: '...
                if (line[i] == '\'')
                {
                    i++;
                    int start = i;
                    // Buscar comilla de cierre o fin de línea
                    while (i < line.Length && line[i] != '\'')
                        i++;
                    var commentContent = line.Substring(start, i - start);
                    if (i < line.Length && line[i] == '\'') i++; // Skip closing quote

                    // El comentario puede tener HTML directo (como <hr/>, <b>, etc.)
                    // Verificar si contiene HTML
                    if (commentContent.Contains("<"))
                    {
                        // Contiene HTML - usar directamente
                        sb.Append(commentContent);
                    }
                    else
                    {
                        // Texto plano - mostrar como comentario con estilo
                        sb.Append($"<span class='comment'>{System.Net.WebUtility.HtmlEncode(commentContent)}</span>");
                    }
                    continue;
                }

                // Código/expresión matemática
                sb.Append(System.Net.WebUtility.HtmlEncode(line[i].ToString()));
                i++;
            }

            var result = sb.ToString().Trim();
            if (string.IsNullOrEmpty(result))
                return "<br/>";

            // Si no tiene tags de bloque, envolver en div
            if (!result.StartsWith("<h") && !result.StartsWith("<p") &&
                !result.StartsWith("<table") && !result.StartsWith("<hr") &&
                !result.StartsWith("<div") && !result.StartsWith("<br"))
            {
                return $"<div class='math-line'>{result}</div>";
            }

            return result;
        }

        #endregion

        /// <summary>
        /// Inserta texto desde el autocompletado
        /// </summary>
        private void InsertAutoCompleteText(string text)
        {
            if (_currentElement is MathText textElement)
            {
                foreach (char c in text)
                {
                    if (c == '\n')
                    {
                        InsertNewLine();
                    }
                    else if (c == '\t')
                    {
                        textElement.InsertChar(' ');
                        textElement.InsertChar(' ');
                        textElement.InsertChar(' ');
                        textElement.InsertChar(' ');
                    }
                    else
                    {
                        textElement.InsertChar(c);
                    }
                }
                _autoCompleteBuffer = "";
                _cursorVisible = true;
                Render();
                OnContentChanged();
                Focus();
            }
        }

        private void OnContentChanged()
        {
            ContentChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Obtiene el código Hekatan del contenido actual
        /// </summary>
        public string ToHekatan()
        {
            var result = new System.Text.StringBuilder();
            for (int i = 0; i < _lines.Count; i++)
            {
                foreach (var element in _lines[i])
                {
                    result.Append(element.ToHekatan());
                }
                if (i < _lines.Count - 1)
                    result.AppendLine(); // Agregar salto de línea entre líneas
            }
            return result.ToString();
        }

        /// <summary>
        /// Carga código Hekatan en el editor
        /// </summary>
        public void FromHekatan(string code)
        {
            System.Diagnostics.Debug.WriteLine($"[MathEditor] FromHekatan called with code length: {code?.Length ?? 0}");
            _isLoading = true;
            _lines.Clear();

            if (string.IsNullOrEmpty(code))
            {
                var emptyLine = new List<MathElement>();
                var emptyText = new MathText();
                emptyText.IsCursorHere = true;
                emptyLine.Add(emptyText);
                _lines.Add(emptyLine);
                _currentElement = emptyText;
                _currentLineIndex = 0;
            }
            else
            {
                // NUEVA LÓGICA: Detectar bloques externos antes de parsear líneas
                var lines = code.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
                int i = 0;

                while (i < lines.Length)
                {
                    var lineText = lines[i];
                    var trimmed = lineText.Trim();

                    // Detectar inicio de bloque de columnas: #columns N o @{columns N}
                    bool isColumnsBlock = trimmed.StartsWith("#columns ") ||
                                         (trimmed.StartsWith("@{columns ") && trimmed.EndsWith("}")) ||
                                         (trimmed.StartsWith("@{columns") && trimmed.EndsWith("}"));
                    if (isColumnsBlock)
                    {
                        // Collect the block content until @{end columns}
                        var blockContent = new System.Text.StringBuilder();
                        i++;
                        while (i < lines.Length)
                        {
                            var blockLine = lines[i].Trim();
                            if (blockLine == "#end columns" || blockLine == "@{end columns}")
                                break;
                            blockContent.AppendLine(lines[i]);
                            i++;
                        }

                        // Use shared ColumnsParser (same logic as CLI)
                        var columnsData = Hekatan.Common.ColumnsParser.Parse(trimmed, blockContent.ToString());
                        var mathColumns = new MathColumns(columnsData.ColumnCount);

                        // Convert parsed segments to WPF MathElements (WPF-specific rendering)
                        for (int col = 0; col < columnsData.Columns.Count; col++)
                        {
                            foreach (var segment in columnsData.Columns[col])
                            {
                                switch (segment.Type)
                                {
                                    case Hekatan.Common.ColumnsParser.SegmentType.ExternalBlock:
                                        var externalBlock = new MathExternalBlock(segment.Language, segment.Content, collapsed: true);
                                        mathColumns.AddElementToColumn(col, externalBlock);
                                        break;

                                    case Hekatan.Common.ColumnsParser.SegmentType.PlainText:
                                        // Split plain text into lines for WPF rendering
                                        var ptLines = segment.Content.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
                                        foreach (var ptLine in ptLines)
                                        {
                                            var ptTrimmed = ptLine.Trim();
                                            if (string.IsNullOrWhiteSpace(ptTrimmed))
                                                continue;

                                            // HTML lines → MathComment (prevents WPF from parsing as Hekatan)
                                            if (ptTrimmed.StartsWith("<") || ptTrimmed.StartsWith("'<"))
                                            {
                                                var htmlText = ptTrimmed.StartsWith("'") ? ptTrimmed.Substring(1) : ptTrimmed;
                                                mathColumns.AddElementToColumn(col, new MathComment(htmlText));
                                            }
                                            else
                                            {
                                                var parsedElems = ParseHekatan(ptLine);
                                                foreach (var elem in parsedElems)
                                                    mathColumns.AddElementToColumn(col, elem);
                                            }
                                        }
                                        break;
                                }
                            }
                        }

                        var columnsLine = new List<MathElement>();
                        columnsLine.Add(mathColumns);
                        _lines.Add(columnsLine);

                        i++; // Saltar la línea #end columns
                        continue;
                    }

                    // Detectar inicio de bloque externo: @{language}
                    if (trimmed.StartsWith("@{") && !trimmed.StartsWith("@{end") && !trimmed.StartsWith("@{calcpad"))
                    {
                        // Extraer el nombre del lenguaje
                        int endIdx = trimmed.IndexOf('}');
                        if (endIdx > 2)
                        {
                            string language = trimmed.Substring(2, endIdx - 2).Trim();

                            // Buscar el @{end language} correspondiente y recolectar código
                            var codeBuilder = new System.Text.StringBuilder();
                            i++; // Saltar la línea @{language}

                            while (i < lines.Length)
                            {
                                var blockLine = lines[i];
                                var blockTrimmed = blockLine.Trim();

                                // Verificar si es el cierre del bloque
                                if (blockTrimmed.StartsWith($"@{{end {language}}}") ||
                                    blockTrimmed.StartsWith($"@{{end{language}}}") ||
                                    blockTrimmed == "@{end}")
                                {
                                    break; // Encontramos el final
                                }

                                codeBuilder.AppendLine(blockLine);
                                i++;
                            }

                            // Crear elemento MathExternalBlock con folding
                            var blockLine2 = new List<MathElement>();
                            var externalBlock = new MathExternalBlock(language, codeBuilder.ToString().TrimEnd(), collapsed: true);
                            blockLine2.Add(externalBlock);
                            _lines.Add(blockLine2);

                            i++; // Saltar la línea @{end language}
                            continue;
                        }
                    }

                    // Línea normal de Hekatan - parsear como ecuación
                    var normalLine = new List<MathElement>();
                    var parsed = ParseHekatan(lineText);
                    normalLine.AddRange(parsed);
                    if (normalLine.Count == 0)
                        normalLine.Add(new MathText());
                    _lines.Add(normalLine);

                    i++;
                }

                if (_lines.Count == 0)
                {
                    var emptyLine = new List<MathElement>();
                    emptyLine.Add(new MathText());
                    _lines.Add(emptyLine);
                }

                _currentLineIndex = 0;
                _currentElement = _lines[0][0];
                if (_currentElement is MathText mt)
                {
                    mt.IsCursorHere = true;
                    mt.CursorPosition = 0;
                }
                else if (_currentElement is MathCode mc)
                {
                    mc.IsCursorHere = true;
                    mc.CursorPosition = 0;
                }
                else if (_currentElement is MathExternalBlock eb)
                {
                    eb.IsCursorHere = true;
                    eb.CursorPosition = 0;
                    eb.CursorLine = 0;
                }
            }

            _isLoading = false;
            System.Diagnostics.Debug.WriteLine($"[MathEditor] FromHekatan completed. Lines: {_lines.Count}, CurrentElement: {_currentElement?.GetType().Name ?? "null"}");
            Render();
        }

        private List<MathElement> ParseHekatan(string code)
        {
            var elements = new List<MathElement>();
            if (string.IsNullOrEmpty(code))
            {
                elements.Add(new MathText());
                return elements;
            }

            int i = 0;
            var currentText = new System.Text.StringBuilder();

            while (i < code.Length)
            {
                // Detectar títulos con "texto"
                if (code[i] == '"')
                {
                    if (currentText.Length > 0)
                    {
                        elements.Add(new MathText(currentText.ToString()));
                        currentText.Clear();
                    }

                    i++; // Saltar la comilla inicial
                    int titleStart = i;
                    while (i < code.Length && code[i] != '"' && code[i] != '\n')
                        i++;

                    // Extraer solo el contenido (sin comillas)
                    var titleText = code.Substring(titleStart, i - titleStart);
                    if (i < code.Length && code[i] == '"')
                        i++; // Saltar la comilla final

                    // NO agregar espacio extra - igual que escritura en tiempo real
                    elements.Add(new MathTitle(titleText));
                    continue;
                }

                // Detectar comentarios con 'texto (hasta fin de línea, sin comilla de cierre)
                if (code[i] == '\'')
                {
                    if (currentText.Length > 0)
                    {
                        elements.Add(new MathText(currentText.ToString()));
                        currentText.Clear();
                    }

                    i++; // Saltar la comilla inicial
                    int commentStart = i;
                    // Buscar comilla de cierre O fin de linea (lo que venga primero)
                    while (i < code.Length && code[i] != '\'' && code[i] != '\n')
                        i++;

                    // Extraer el contenido del comentario
                    var commentText = code.Substring(commentStart, i - commentStart);

                    // Verificar si hay comilla de cierre
                    bool wasClosed = (i < code.Length && code[i] == '\'');
                    if (wasClosed)
                        i++;

                    // Crear comentario con IsClosed según si tenía comilla de cierre
                    var comment = new MathComment(commentText);
                    comment.IsClosed = wasClosed;
                    elements.Add(comment);
                    continue;
                }

                // Detectar fracciones: /
                if (code[i] == '/' && i > 0 && i < code.Length - 1)
                {
                    if (currentText.Length > 0)
                    {
                        elements.Add(new MathText(currentText.ToString()));
                        currentText.Clear();
                    }

                    var numText = ExtractNumerator(elements);
                    i++;
                    var denText = ExtractDenominator(code, ref i);

                    var fraction = new MathFraction(
                        new MathText(numText),
                        new MathText(denText)
                    );
                    elements.Add(fraction);
                    continue;
                }

                // Detectar potencias: ^
                if (code[i] == '^' && i < code.Length - 1)
                {
                    if (currentText.Length > 0)
                    {
                        var baseText = currentText.ToString();
                        currentText.Clear();

                        i++;
                        var expText = ExtractExponent(code, ref i);

                        var power = new MathPower(
                            new MathText(baseText),
                            new MathText(expText)
                        );
                        elements.Add(power);
                        continue;
                    }
                }

                // Detectar subscriptos: variable_subscript (ej: n_a -> n con subindice a)
                if (code[i] == '_' && i < code.Length - 1 && currentText.Length > 0)
                {
                    // Extraer el ultimo identificador (base) del texto actual
                    var text = currentText.ToString();
                    var lastWordStart = text.Length - 1;
                    while (lastWordStart > 0 && char.IsLetterOrDigit(text[lastWordStart - 1]))
                        lastWordStart--;

                    // Si hay texto antes del identificador, agregarlo como elemento separado
                    if (lastWordStart > 0)
                    {
                        elements.Add(new MathText(text.Substring(0, lastWordStart)));
                    }

                    var baseText = text.Substring(lastWordStart);
                    currentText.Clear();

                    i++; // Saltar el _
                    var subText = ExtractSubscript(code, ref i);

                    var subscript = new MathSubscript(
                        new MathText(baseText),
                        new MathText(subText)
                    );
                    elements.Add(subscript);
                    continue;
                }

                // Detectar raices: sqrt(x)
                if (i < code.Length - 4 && code.Substring(i, 4).ToLower() == "sqrt")
                {
                    if (currentText.Length > 0)
                    {
                        elements.Add(new MathText(currentText.ToString()));
                        currentText.Clear();
                    }

                    i += 4;
                    if (i < code.Length && code[i] == '(')
                    {
                        i++;
                        var radicandText = ExtractParenthesisContent(code, ref i);
                        var root = new MathRoot(new MathText(radicandText));
                        elements.Add(root);
                        continue;
                    }
                }

                // DESACTIVADO: Mantener [...] como texto plano para ser igual que escritura en tiempo real
                // La deteccion de matrices causaba diferencias visuales entre MathEditor y Output
                // Los corchetes ahora se procesan como caracteres normales

                currentText.Append(code[i]);
                i++;
            }

            if (currentText.Length > 0)
            {
                elements.Add(new MathText(currentText.ToString()));
            }

            return elements.Count > 0 ? elements : new List<MathElement> { new MathText() };
        }

        private string ExtractNumerator(List<MathElement> elements)
        {
            if (elements.Count == 0) return "";
            var lastElement = elements[elements.Count - 1];
            if (lastElement is MathText mt)
            {
                elements.RemoveAt(elements.Count - 1);
                return mt.Text;
            }
            return "";
        }

        private string ExtractDenominator(string code, ref int i)
        {
            var result = new System.Text.StringBuilder();
            if (i < code.Length && code[i] == '(')
            {
                i++;
                while (i < code.Length && code[i] != ')')
                {
                    result.Append(code[i]);
                    i++;
                }
                if (i < code.Length) i++;
            }
            else
            {
                while (i < code.Length && char.IsLetterOrDigit(code[i]))
                {
                    result.Append(code[i]);
                    i++;
                }
            }
            return result.ToString();
        }

        private string ExtractExponent(string code, ref int i)
        {
            var result = new System.Text.StringBuilder();
            while (i < code.Length && (char.IsLetterOrDigit(code[i]) || code[i] == '.'))
            {
                result.Append(code[i]);
                i++;
            }
            return result.ToString();
        }

        private string ExtractSubscript(string code, ref int i)
        {
            var result = new System.Text.StringBuilder();
            // El subscripto puede ser una letra, numero, o varios caracteres alfanumericos
            while (i < code.Length && char.IsLetterOrDigit(code[i]))
            {
                result.Append(code[i]);
                i++;
            }
            return result.ToString();
        }

        private string ExtractParenthesisContent(string code, ref int i)
        {
            var result = new System.Text.StringBuilder();
            int depth = 1;
            while (i < code.Length && depth > 0)
            {
                if (code[i] == '(') depth++;
                else if (code[i] == ')')
                {
                    depth--;
                    if (depth == 0) { i++; break; }
                }
                if (depth > 0) result.Append(code[i]);
                i++;
            }
            return result.ToString();
        }

        /// <summary>
        /// Parsea el contenido de una matriz [a;b|c;d] y crea un MathMatrix
        /// </summary>
        private MathMatrix ParseMatrixContent(string content)
        {
            // Dividir por | para obtener filas
            var rowStrings = content.Split('|');
            var rows = new List<List<MathElement>>();

            foreach (var rowStr in rowStrings)
            {
                // Dividir por ; para obtener columnas
                var colStrings = rowStr.Split(';');
                var row = new List<MathElement>();
                foreach (var colStr in colStrings)
                {
                    row.Add(new MathText(colStr.Trim()));
                }
                rows.Add(row);
            }

            if (rows.Count == 0) return null;

            // Determinar el número de columnas (máximo de todas las filas)
            int maxCols = 0;
            foreach (var row in rows)
                maxCols = Math.Max(maxCols, row.Count);

            var matrix = new MathMatrix(rows.Count, maxCols);
            for (int i = 0; i < rows.Count; i++)
            {
                for (int j = 0; j < rows[i].Count; j++)
                {
                    matrix.SetCell(i, j, rows[i][j]);
                }
            }

            return matrix;
        }

        /// <summary>
        /// Actualiza solo el cursor sin re-renderizar todo el canvas (optimización)
        /// </summary>
        private void UpdateCursorOnly()
        {
            // Solo invalidar el elemento actual para parpadeo del cursor
            if (_currentElement != null)
            {
                _currentElement.IsCursorHere = _cursorVisible;
                // No llamar Render() completo - solo invalidar visual del elemento actual
            }
        }

        private void Render()
        {
            System.Diagnostics.Debug.WriteLine($"[MathEditor] Render called. _isLoading={_isLoading}, _lines.Count={_lines.Count}");
            // Optimización: saltar render durante carga
            if (_isLoading) return;

            // Debug: mostrar contenido de cada línea
            for (int i = 0; i < _lines.Count; i++)
            {
                var parts = new System.Collections.Generic.List<string>();
                foreach (var e in _lines[i])
                    parts.Add($"{e.GetType().Name}[W={e.Width:F0},H={e.Height:F0}]");
                var lineInfo = string.Join(", ", parts);
                System.Diagnostics.Debug.WriteLine($"[MathEditor] Line {i}: {lineInfo}");
            }

            EditorCanvas.Children.Clear();
            LineNumberCanvas.Children.Clear();

            double y = 4;  // Padding mínimo arriba - alineado con "Hekatan:" header
            double maxLineWidth = 0;     // Para calcular ancho del canvas basado en contenido

            for (int lineIndex = 0; lineIndex < _lines.Count; lineIndex++)
            {
                var line = _lines[lineIndex];
                double x = 2;  // Padding izquierdo mínimo
                double maxHeight = _lineHeight;

                // Medir elementos de esta línea y encontrar la baseline máxima para alinear
                // (Como hace HTML: todos los elementos se alinean por su baseline, no por centro)
                double maxBaseline = 0;
                double maxHeightBelowBaseline = 0;
                foreach (var element in line)
                {
                    element.Measure(_fontSize);
                    maxBaseline = Math.Max(maxBaseline, element.Baseline);
                    maxHeightBelowBaseline = Math.Max(maxHeightBelowBaseline, element.Height - element.Baseline);
                }
                maxHeight = Math.Max(_lineHeight, maxBaseline + maxHeightBelowBaseline);

                // Renderizar número de línea
                var lineNumber = new TextBlock
                {
                    Text = (lineIndex + 1).ToString(),
                    FontFamily = new FontFamily("Consolas"),
                    FontSize = 12,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x99, 0x99, 0x99)),
                    TextAlignment = TextAlignment.Right,
                    Width = 35
                };
                Canvas.SetLeft(lineNumber, 5);
                Canvas.SetTop(lineNumber, y + (maxHeight - 14) / 2);  // Sin offset - scroll sincronizado
                LineNumberCanvas.Children.Add(lineNumber);

                // Renderizar elementos de la línea, alineados por baseline
                foreach (var element in line)
                {
                    // Posicionar de manera que todas las baselines se alineen en la misma Y
                    double elementY = y + (maxBaseline - element.Baseline);

                    if (_cursorVisible || element != _currentElement)
                    {
                        element.Render(EditorCanvas, x, elementY, _fontSize);
                    }
                    else
                    {
                        var wasCursor = element.IsCursorHere;
                        element.IsCursorHere = false;
                        element.Render(EditorCanvas, x, elementY, _fontSize);
                        element.IsCursorHere = wasCursor;
                    }

                    x += element.Width;
                }

                // Registrar el ancho máximo de esta línea
                maxLineWidth = Math.Max(maxLineWidth, x + 20); // +20 padding derecho

                y += maxHeight + 4; // Espacio entre líneas
            }

            // Ajustar tamaño del canvas basado en contenido real (no ventana)
            EditorCanvas.Width = Math.Max(400, maxLineWidth);
            EditorCanvas.Height = Math.Max(200, y + 50);
            LineNumberCanvas.Height = EditorCanvas.Height;

            // Actualizar preview con el código Hekatan de la línea actual
            UpdatePreview();

            // Actualizar indicador de modo
            UpdateModeIndicator();
        }

        /// <summary>
        /// Actualiza la barra de preview con el código Hekatan de la línea actual
        /// Muestra el cursor (|) en la posición actual dentro del texto
        /// </summary>
        private void UpdatePreview()
        {
            if (PreviewTextBlock == null) return;

            // Caso especial: MathExternalBlock - mostrar solo la línea actual del código
            if (_currentElement is MathExternalBlock externalBlock)
            {
                UpdatePreviewForExternalBlock(externalBlock);
                return;
            }

            var beforeCursor = new System.Text.StringBuilder();
            var afterCursor = new System.Text.StringBuilder();
            bool foundCursor = false;

            foreach (var element in CurrentLine)
            {
                if (element == _currentElement && !foundCursor)
                {
                    // Este es el elemento con el cursor
                    var elementText = element.ToHekatan();
                    int cursorPos = GetCurrentCursorPosition();

                    // Para MathComment y MathTitle, el CursorPosition es relativo al texto interno,
                    // pero ToHekatan() incluye el prefijo (') o (") respectivamente.
                    // Necesitamos ajustar la posición para incluir el prefijo.
                    if (element is MathComment)
                    {
                        // El prefijo es ' (1 caracter)
                        cursorPos += 1;
                    }
                    else if (element is MathTitle)
                    {
                        // El prefijo es " (1 caracter)
                        cursorPos += 1;
                    }

                    // Asegurar que cursorPos esté dentro del rango válido
                    if (cursorPos < 0) cursorPos = 0;
                    if (cursorPos > elementText.Length) cursorPos = elementText.Length;

                    beforeCursor.Append(elementText.Substring(0, cursorPos));
                    afterCursor.Append(elementText.Substring(cursorPos));
                    foundCursor = true;
                }
                else if (!foundCursor)
                {
                    beforeCursor.Append(element.ToHekatan());
                }
                else
                {
                    afterCursor.Append(element.ToHekatan());
                }
            }

            // Actualizar TextBlock simple - perfectamente alineado
            var lineText = beforeCursor.ToString() + "|" + afterCursor.ToString();
            PreviewTextBlock.Text = lineText;

            // NO actualizar PreviewEditor aquí porque el | es solo visual para TextBlock
            // PreviewEditor se actualiza solo cuando el usuario hace click en PreviewTextBlock
        }

        /// <summary>
        /// Actualiza el preview para un bloque externo, mostrando solo la línea actual del código
        /// con el cursor en la posición correcta
        /// </summary>
        private void UpdatePreviewForExternalBlock(MathExternalBlock externalBlock)
        {
            var lines = externalBlock.GetCodeLines();
            int lineIdx = externalBlock.CursorLine;
            int cursorPos = externalBlock.CursorPosition;

            // Asegurar que lineIdx está en rango
            if (lineIdx < 0) lineIdx = 0;
            if (lineIdx >= lines.Length) lineIdx = lines.Length - 1;

            string currentLine = lines.Length > 0 ? lines[lineIdx] : "";

            // Asegurar que cursorPos está en rango
            if (cursorPos < 0) cursorPos = 0;
            if (cursorPos > currentLine.Length) cursorPos = currentLine.Length;

            // Construir el texto con cursor
            string beforeCursor = currentLine.Substring(0, cursorPos);
            string afterCursor = currentLine.Substring(cursorPos);

            // Formato: @{LANG} Ln X: beforeCursor|afterCursor
            string lineText = $"@{{{externalBlock.Language.ToLower()}}} Ln {lineIdx + 1}: {beforeCursor}|{afterCursor}";

            PreviewTextBlock.Text = lineText;

            // NO actualizar PreviewEditor aquí porque el | es solo visual para TextBlock
            // PreviewEditor se actualiza solo cuando el usuario hace click en PreviewTextBlock
        }

        /// <summary>
        /// Actualiza el indicador de modo (Expresión/Texto/Código Externo)
        /// </summary>
        private void UpdateModeIndicator()
        {
            if (ModeIndicatorBorder == null || ModeIndicatorText == null) return;

            bool isTextMode = _currentElement is MathComment || _currentElement is MathTitle;
            bool isExternalBlock = _currentElement is MathExternalBlock;

            if (isExternalBlock)
            {
                // Modo Código Externo - naranja/marrón
                var externalBlock = _currentElement as MathExternalBlock;
                ModeIndicatorBorder.Background = new SolidColorBrush(Color.FromRgb(0xFF, 0xF3, 0xE0)); // Light orange
                ModeIndicatorBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(0xE6, 0x51, 0x00)); // Orange
                ModeIndicatorText.Text = externalBlock?.Language ?? "Código";
                ModeIndicatorText.Foreground = new SolidColorBrush(Color.FromRgb(0xE6, 0x51, 0x00));
            }
            else if (isTextMode)
            {
                // Modo Texto - verde
                ModeIndicatorBorder.Background = new SolidColorBrush(Color.FromRgb(0xE8, 0xF5, 0xE9)); // Light green
                ModeIndicatorBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(0x38, 0x8E, 0x3C)); // Green
                ModeIndicatorText.Text = "Texto";
                ModeIndicatorText.Foreground = new SolidColorBrush(Color.FromRgb(0x38, 0x8E, 0x3C));
            }
            else
            {
                // Modo Expresión - azul
                ModeIndicatorBorder.Background = new SolidColorBrush(Color.FromRgb(0xE3, 0xF2, 0xFD)); // Light blue
                ModeIndicatorBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(0x19, 0x76, 0xD2)); // Blue
                ModeIndicatorText.Text = "Expresión";
                ModeIndicatorText.Foreground = new SolidColorBrush(Color.FromRgb(0x19, 0x76, 0xD2));
            }
        }

        private void EditorScrollViewer_ScrollChanged(object sender, ScrollChangedEventArgs e)
        {
            // Sincronizar scroll de números de línea con el editor
            if (LineNumberScrollViewer != null && EditorScrollViewer != null)
            {
                LineNumberScrollViewer.ScrollToVerticalOffset(EditorScrollViewer.VerticalOffset);
            }
        }

        private List<MathElement> CurrentLine => _lines[_currentLineIndex];

        private void MathEditorControl_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            // Si el autocompletado está visible, manejar las teclas de navegación
            if (_autoComplete != null && _autoComplete.IsVisible)
            {
                switch (e.Key)
                {
                    case Key.Up:
                        _autoComplete.SelectPrevious();
                        e.Handled = true;
                        return;

                    case Key.Down:
                        _autoComplete.SelectNext();
                        e.Handled = true;
                        return;

                    case Key.Enter:
                    case Key.Tab:
                        _autoComplete.ConfirmSelection();
                        e.Handled = true;
                        return;

                    case Key.Escape:
                        _autoComplete.Hide();
                        _autoCompleteBuffer = "";
                        e.Handled = true;
                        return;
                }
            }

            // Ctrl+Plus/Minus para zoom, Ctrl+V para pegar, Ctrl+A para seleccionar todo
            if (Keyboard.Modifiers == ModifierKeys.Control)
            {
                if (e.Key == Key.Add || e.Key == Key.OemPlus)
                {
                    SetZoom(_zoomLevel + 0.1);
                    e.Handled = true;
                    return;
                }
                if (e.Key == Key.Subtract || e.Key == Key.OemMinus)
                {
                    SetZoom(_zoomLevel - 0.1);
                    e.Handled = true;
                    return;
                }
                if (e.Key == Key.D0 || e.Key == Key.NumPad0)
                {
                    SetZoom(1.0);
                    e.Handled = true;
                    return;
                }
                // Ctrl+V: Pegar texto del portapapeles
                if (e.Key == Key.V)
                {
                    PasteFromClipboard();
                    e.Handled = true;
                    return;
                }
                // Ctrl+C: Copiar contenido al portapapeles
                if (e.Key == Key.C)
                {
                    CopyToClipboard();
                    e.Handled = true;
                    return;
                }
                // Ctrl+A: Seleccionar todo
                if (e.Key == Key.A)
                {
                    SelectAll();
                    e.Handled = true;
                    return;
                }
            }

            // Shift+Home: Seleccionar hasta inicio de línea
            if ((Keyboard.Modifiers & ModifierKeys.Shift) == ModifierKeys.Shift && e.Key == Key.Home)
            {
                SelectToLineStart();
                e.Handled = true;
                return;
            }

            // Shift+End: Seleccionar hasta final de línea
            if ((Keyboard.Modifiers & ModifierKeys.Shift) == ModifierKeys.Shift && e.Key == Key.End)
            {
                SelectToLineEnd();
                e.Handled = true;
                return;
            }

            // Home sin Shift: Ir al inicio de la línea
            if (e.Key == Key.Home && Keyboard.Modifiers == ModifierKeys.None)
            {
                ClearAllSelections();
                var line = CurrentLine;
                if (line != null && line.Count > 0)
                {
                    if (_currentElement != null)
                        _currentElement.IsCursorHere = false;
                    _currentElement = FindFirstEditableElement(line[0]) ?? line[0];
                    _currentElement.IsCursorHere = true;
                    SetCursorPositionOnElement(_currentElement, 0);
                    Render();
                }
                e.Handled = true;
                return;
            }

            // End sin Shift: Ir al final de la línea
            if (e.Key == Key.End && Keyboard.Modifiers == ModifierKeys.None)
            {
                ClearAllSelections();
                var line = CurrentLine;
                if (line != null && line.Count > 0)
                {
                    if (_currentElement != null)
                        _currentElement.IsCursorHere = false;
                    var lastElem = line[line.Count - 1];
                    _currentElement = FindLastEditableElement(lastElem) ?? lastElem;
                    _currentElement.IsCursorHere = true;
                    SetCursorOnElement(_currentElement);
                    Render();
                }
                e.Handled = true;
                return;
            }

            switch (e.Key)
            {
                case Key.Up:
                    // Manejo especial para MathExternalBlock
                    if (_currentElement is MathExternalBlock externalBlockUp)
                    {
                        externalBlockUp.MoveCursorUp();
                        Render();
                        e.Handled = true;
                        break;
                    }

                    // Si estamos en una matriz, navegar a la fila anterior
                    if (_currentElement?.Parent is MathMatrix)
                    {
                        if (!NavigateToRowAboveInMatrix())
                        {
                            // Si no hay fila arriba, salir de la matriz
                            if (_currentLineIndex > 0)
                                MoveCursorToLine(_currentLineIndex - 1);
                            else
                                NavigateUp();
                        }
                    }
                    else if (_currentLineIndex > 0)
                    {
                        MoveCursorToLine(_currentLineIndex - 1);
                    }
                    else
                    {
                        NavigateUp();
                    }
                    e.Handled = true;
                    break;

                case Key.Down:
                    // Manejo especial para MathExternalBlock
                    if (_currentElement is MathExternalBlock externalBlockDown)
                    {
                        externalBlockDown.MoveCursorDown();
                        Render();
                        e.Handled = true;
                        break;
                    }

                    // Si estamos en una matriz, navegar a la fila siguiente
                    if (_currentElement?.Parent is MathMatrix)
                    {
                        if (!NavigateToRowBelowInMatrix())
                        {
                            // Si no hay fila abajo, salir de la matriz
                            if (_currentLineIndex < _lines.Count - 1)
                                MoveCursorToLine(_currentLineIndex + 1);
                            else
                                NavigateDown();
                        }
                    }
                    else if (_currentLineIndex < _lines.Count - 1)
                    {
                        MoveCursorToLine(_currentLineIndex + 1);
                    }
                    else
                    {
                        NavigateDown();
                    }
                    e.Handled = true;
                    break;

                case Key.Tab:
                    NavigateNext();
                    e.Handled = true;
                    break;
            }

            // Manejar teclas para elementos de texto (MathText, MathComment, MathTitle)
            var cursorPos = GetCurrentCursorPosition();
            var textLength = GetCurrentTextLength();
            var currentText = GetCurrentText();

            DebugLog($"KEY: {e.Key} - cursorPos={cursorPos}, textLen={textLength}, text='{currentText}'");

            switch (e.Key)
            {
                case Key.Left:
                    DebugLog($"LEFT: cursorPos={cursorPos} > 0? {cursorPos > 0}");

                    // Manejo especial para MathExternalBlock
                    if (_currentElement is MathExternalBlock externalBlockLeft)
                    {
                        ClearAllSelections();
                        externalBlockLeft.MoveCursorLeft();
                        Render();
                        e.Handled = true;
                        break;
                    }

                    // Manejo de Shift+Left para selección
                    if ((Keyboard.Modifiers & ModifierKeys.Shift) == ModifierKeys.Shift)
                    {
                        HandleShiftLeftSelection(cursorPos);
                    }
                    else
                    {
                        // Limpiar selección si no se presiona Shift
                        ClearAllSelections();

                        if (cursorPos > 0)
                        {
                            SetCurrentCursorPosition(cursorPos - 1);
                            DebugLog($"LEFT: Moved cursor to {cursorPos - 1}");
                        }
                        else
                        {
                            // Si estamos en una matriz o vector, intentar ir a la celda anterior
                            if (_currentElement?.Parent is MathMatrix)
                            {
                                DebugLog($"LEFT: In matrix, trying NavigateToPreviousCellInMatrix");
                                if (!NavigateToPreviousCellInMatrix())
                                {
                                    // Salir de la matriz
                                    DebugLog($"LEFT: Exiting matrix");
                                    ExitVectorOrMatrixToPrevious();
                                }
                            }
                            else if (_currentElement?.Parent is MathVector)
                            {
                                DebugLog($"LEFT: In vector, trying NavigateToPreviousCellInVector");
                                if (!NavigateToPreviousCellInVector())
                                {
                                    // Salir del vector
                                    DebugLog($"LEFT: Exiting vector");
                                    ExitVectorOrMatrixToPrevious();
                                }
                            }
                            else
                            {
                                DebugLog($"LEFT: NavigateToPreviousElement");
                                NavigateToPreviousElement();
                            }
                        }
                    }
                    e.Handled = true;
                    break;

                case Key.Right:
                    DebugLog($"RIGHT: cursorPos={cursorPos} < textLen={textLength}? {cursorPos < textLength}");

                    // Manejo especial para MathExternalBlock
                    if (_currentElement is MathExternalBlock externalBlockRight)
                    {
                        ClearAllSelections();
                        externalBlockRight.MoveCursorRight();
                        Render();
                        e.Handled = true;
                        break;
                    }

                    // Manejo de Shift+Right para selección
                    if ((Keyboard.Modifiers & ModifierKeys.Shift) == ModifierKeys.Shift)
                    {
                        HandleShiftRightSelection(cursorPos, textLength);
                    }
                    else
                    {
                        // Limpiar selección si no se presiona Shift
                        ClearAllSelections();

                        if (cursorPos < textLength)
                        {
                            SetCurrentCursorPosition(cursorPos + 1);
                            DebugLog($"RIGHT: Moved cursor to {cursorPos + 1}");
                        }
                        else
                        {
                            // Si estamos en una matriz o vector, intentar ir a la celda siguiente
                            if (_currentElement?.Parent is MathMatrix)
                            {
                                DebugLog($"RIGHT: In matrix, trying NavigateToNextCellInMatrix");
                                if (!NavigateToNextCellInMatrix())
                                {
                                    // Salir de la matriz
                                    DebugLog($"RIGHT: Exiting matrix");
                                    ExitVectorOrMatrixToNext();
                                }
                            }
                            else if (_currentElement?.Parent is MathVector)
                            {
                                DebugLog($"RIGHT: In vector, trying NavigateToNextCellInVector");
                                if (!NavigateToNextCellInVector())
                                {
                                    // Salir del vector
                                    DebugLog($"RIGHT: Exiting vector");
                                    ExitVectorOrMatrixToNext();
                                }
                            }
                            else
                            {
                                DebugLog($"RIGHT: ExitStructureOrNavigateNext");
                                ExitStructureOrNavigateNext();
                            }
                        }
                    }
                    e.Handled = true;
                    break;

                case Key.Back:
                    // Si hay selección de línea/múltiples elementos, eliminarlos
                    if (_hasLineSelection && _selectedElements.Count > 0)
                    {
                        DeleteSelectedElements();
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                    }
                    // Si hay una estructura seleccionada (vector/matriz), eliminarla
                    else if (_selectedStructure != null)
                    {
                        DeleteSelectedStructure();
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                    }
                    // Si hay texto seleccionado, eliminarlo primero
                    else if (_currentElement is MathText backTextElem && backTextElem.HasSelection)
                    {
                        DeleteSelectedText();
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                    }
                    else if (cursorPos > 0)
                    {
                        DeleteCharFromCurrent();
                        OnContentChanged();

                        // Actualizar buffer de autocompletado
                        if (_autoCompleteBuffer.Length > 0)
                        {
                            _autoCompleteBuffer = _autoCompleteBuffer.Substring(0, _autoCompleteBuffer.Length - 1);
                            if (_autoCompleteBuffer.Length > 0 && _autoComplete != null)
                            {
                                UpdateAutoComplete();
                            }
                            else
                            {
                                _autoComplete?.Hide();
                            }
                        }
                    }
                    else if (cursorPos == 0 && string.IsNullOrEmpty(currentText))
                    {
                        // Primero intentar reabrir un comentario cerrado precedente (ej: '&nbsp;')
                        if (TryReopenPrecedingComment())
                        {
                            OnContentChanged();
                        }
                        // Si la línea está vacía y hay más líneas, borrar esta línea
                        else if (_lines.Count > 1 && CurrentLine.Count == 1)
                        {
                            DeleteCurrentLine();
                        }
                        // Verificar si estamos en una celda de vector/matriz
                        else if (TryDeleteVectorCell())
                        {
                            // Celda eliminada exitosamente
                            OnContentChanged();
                        }
                        else
                        {
                            DeleteCurrentStructure();
                        }
                    }
                    else if (cursorPos == 0)
                    {
                        // Intentar reabrir un comentario cerrado precedente
                        if (TryReopenPrecedingComment())
                        {
                            OnContentChanged();
                        }
                        else
                        {
                            NavigateToPreviousElement();
                        }
                    }
                    e.Handled = true;
                    break;

                case Key.Delete:
                    // Si hay selección de línea/múltiples elementos, eliminarlos
                    if (_hasLineSelection && _selectedElements.Count > 0)
                    {
                        DeleteSelectedElements();
                    }
                    // Si hay una estructura seleccionada (vector/matriz), eliminarla
                    else if (_selectedStructure != null)
                    {
                        DeleteSelectedStructure();
                    }
                    // Si hay texto seleccionado, eliminarlo primero
                    else if (_currentElement is MathText delTextElem && delTextElem.HasSelection)
                    {
                        DeleteSelectedText();
                    }
                    else if (cursorPos < textLength)
                    {
                        SetCurrentCursorPosition(cursorPos + 1);
                        DeleteCharFromCurrent();
                        OnContentChanged();
                    }
                    else if (cursorPos == textLength && TryReopenCurrentComment())
                    {
                        // Delete al final de un MathComment cerrado → reabrir (quitar comilla de cierre)
                        OnContentChanged();
                    }
                    else if (string.IsNullOrEmpty(currentText))
                    {
                        // Primero intentar reabrir comentario precedente
                        if (TryReopenPrecedingComment())
                        {
                            OnContentChanged();
                        }
                        else
                        {
                            DeleteCurrentStructure();
                        }
                    }
                    e.Handled = true;
                    break;

                case Key.Enter:
                    InsertNewLine();
                    e.Handled = true;
                    break;

                case Key.Space:
                    if (_currentElement?.Parent != null && cursorPos == textLength)
                    {
                        ExitStructureAndContinue();
                        e.Handled = true;
                    }
                    break;
            }

            // Atajos con Ctrl
            if (Keyboard.Modifiers == ModifierKeys.Control)
            {
                switch (e.Key)
                {
                    case Key.R:
                        InsertRoot();
                        e.Handled = true;
                        break;
                    case Key.I:
                        InsertIntegral(false);
                        e.Handled = true;
                        break;
                    case Key.D:
                        InsertDerivative(1);
                        e.Handled = true;
                        break;
                    case Key.M:
                        InsertMatrix(2, 2);
                        e.Handled = true;
                        break;
                    case Key.Space:
                        // Ctrl+Space: insertar &nbsp; en cualquier contexto
                        InsertNbsp();
                        e.Handled = true;
                        break;
                }
            }

            if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
            {
                switch (e.Key)
                {
                    case Key.I:
                        InsertIntegral(true);
                        e.Handled = true;
                        break;
                    case Key.D:
                        InsertDerivative(2);
                        e.Handled = true;
                        break;
                }
            }

            if (e.Handled)
            {
                _cursorVisible = true;
                Render();
            }
        }

        private void MathEditorControl_PreviewTextInput(object sender, TextCompositionEventArgs e)
        {
            // Si hay selección de línea/múltiples elementos, eliminarlos antes de insertar texto
            if (_hasLineSelection && _selectedElements.Count > 0)
            {
                DeleteSelectedElements();
            }

            // Si hay una estructura seleccionada, eliminarla antes de insertar texto
            if (_selectedStructure != null)
            {
                DeleteSelectedStructure();
            }

            // Si hay texto seleccionado, eliminarlo antes de insertar nuevo texto
            if (_currentElement is MathText selectedTextElem && selectedTextElem.HasSelection)
            {
                selectedTextElem.DeleteSelection();
                ClearAllSelections();
                OnContentChanged();
            }

            // Manejar entrada de texto para MathText, MathComment y MathTitle
            foreach (char c in e.Text)
            {
                System.Diagnostics.Debug.WriteLine($"TextInput: char='{c}' _currentElement={_currentElement?.GetType().Name ?? "null"}");
                // Cerrar comentario cuando se escribe ' dentro de MathComment
                if (_currentElement is MathComment comment && c == '\'')
                {
                    ExitCommentMode(comment);
                    _autoCompleteBuffer = "";
                    _autoComplete?.Hide();
                    continue;
                }

                // En MathTitle: espacios siempre normales (los títulos no se mezclan con expresiones)
                if (_currentElement is MathTitle titleElement && c == ' ')
                {

                    titleElement.Text = titleElement.Text.Insert(titleElement.CursorPosition, " ");
                    titleElement.CursorPosition += 1;
                    _autoCompleteBuffer = "";
                    _autoComplete?.Hide();
                    Render();
                    OnContentChanged();
                    continue;
                }

                // En MathComment: siempre insertar espacio normal
                // El usuario puede usar Ctrl+Space para &nbsp; si lo necesita
                if (_currentElement is MathComment commentElement && c == ' ')
                {
                    commentElement.Text = commentElement.Text.Insert(commentElement.CursorPosition, " ");
                    commentElement.CursorPosition += 1;
                    _autoCompleteBuffer = "";
                    _autoComplete?.Hide();
                    Render();
                    OnContentChanged();
                    continue;
                }

                // Manejar entrada en MathExternalBlock (bloques de código externos)
                if (_currentElement is MathExternalBlock externalBlock)
                {
                    // Asegurar que el bloque esté expandido para editar
                    if (externalBlock.IsCollapsed)
                    {
                        externalBlock.IsCollapsed = false;
                        externalBlock.CursorLine = 0;
                        externalBlock.CursorPosition = 0;
                    }
                    externalBlock.InsertChar(c);
                    Render();
                    OnContentChanged();
                    continue;
                }

                // Funciones especiales solo para MathText
                if (_currentElement is MathText textElement)
                {
                    if (c == '/')
                    {
                        CreateFractionFromPrevious(textElement);
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                        continue;
                    }
                    if (c == '^')
                    {
                        CreatePowerFromPrevious(textElement);
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                        continue;
                    }
                    if (c == '_')
                    {
                        CreateSubscriptFromPrevious(textElement);
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                        continue;
                    }
                    if (c == '\'')
                    {
                        ToggleTextMode(textElement);
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                        continue;
                    }
                    // En MathText (modo expresión): " crea un título
                    if (c == '"')
                    {
                        CreateTitleAtCursor(textElement);
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                        continue;
                    }
                    // En MathText (modo expresión): espacio
                    if (c == ' ')
                    {
                        // Si el texto empieza con # (directiva), insertar espacio normal en el MathText
                        if (textElement.Text.TrimStart().StartsWith("#"))
                        {
                            textElement.Text = textElement.Text.Insert(textElement.CursorPosition, " ");
                            textElement.CursorPosition++;
                            _autoCompleteBuffer = "";
                            _autoComplete?.Hide();
                            Render();
                            OnContentChanged();
                            continue;
                        }

                        int currentIndex = CurrentLine.IndexOf(textElement);
                        MathComment previousComment = null;

                        // Si el MathText está vacío, verificar el elemento anterior
                        if (currentIndex > 0 && string.IsNullOrEmpty(textElement.Text))
                        {
                            var prevElement = CurrentLine[currentIndex - 1];
                            if (prevElement is MathComment mc)
                            {
                                previousComment = mc;
                            }
                        }

                        if (previousComment != null)
                        {
                            // Hay comentario antes: añadir &nbsp; al final
                            previousComment.Text += "&nbsp;";
                        }
                        else
                        {
                            // Crear nuevo comentario con &nbsp;
                            int originalIndex = CurrentLine.IndexOf(textElement);
                            bool wasEmpty = string.IsNullOrEmpty(textElement.Text);

                            ToggleTextMode(textElement);
                            if (_currentElement is MathComment newComment)
                            {
                                newComment.Text = "&nbsp;";
                                newComment.CursorPosition = 6;
                                ExitCommentMode(newComment);

                                // Si el MathText original estaba vacío, eliminarlo
                                // para evitar elementos vacíos innecesarios
                                if (wasEmpty && originalIndex >= 0 && originalIndex < CurrentLine.Count)
                                {
                                    var origElement = CurrentLine[originalIndex];
                                    if (origElement is MathText mt && string.IsNullOrEmpty(mt.Text))
                                    {
                                        CurrentLine.RemoveAt(originalIndex);
                                    }
                                }
                            }
                        }
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                        Render();
                        OnContentChanged();
                        continue;
                    }
                    // Detectar apertura de vector [
                    if (c == '[')
                    {
                        CreateHorizontalVectorAtCursor(textElement);
                        _autoCompleteBuffer = "";
                        _autoComplete?.Hide();
                        continue;
                    }
                    // Detectar ; para agregar celda a la derecha en vector/matriz
                    if (c == ';')
                    {
                        if (TryAddCellToRight())
                        {
                            _autoCompleteBuffer = "";
                            _autoComplete?.Hide();
                            continue;
                        }
                    }
                    // Detectar | para agregar fila abajo (convertir vector a matriz si es necesario)
                    if (c == '|')
                    {
                        if (TryAddRowBelow())
                        {
                            _autoCompleteBuffer = "";
                            _autoComplete?.Hide();
                            continue;
                        }
                    }
                    // Detectar cierre de vector/matriz ]
                    if (c == ']')
                    {
                        if (IsInsideVectorOrMatrix())
                        {
                            ExitVectorOrMatrix();
                            _autoCompleteBuffer = "";
                            _autoComplete?.Hide();
                            continue;
                        }
                    }

                    // Si estamos dentro de una estructura (Parent != null) y es un operador,
                    // salir de la estructura primero
                    if (textElement.Parent != null && IsOperatorChar(c))
                    {
                        ExitStructureAndContinue();
                    }
                }

                // Insertar carácter en el elemento actual (MathText, MathComment o MathTitle)
                InsertCharToCurrent(c);

                // Actualizar buffer de autocompletado
                if (ShouldTriggerAutoComplete(c))
                {
                    _autoCompleteBuffer += c;
                    UpdateAutoComplete();
                }
                else if (IsAutoCompleteBreakChar(c))
                {
                    _autoCompleteBuffer = "";
                    _autoComplete?.Hide();
                }
                else if (_autoCompleteBuffer.Length > 0)
                {
                    _autoCompleteBuffer += c;
                    UpdateAutoComplete();
                }
            }
            _cursorVisible = true;
            Render();
            OnContentChanged();
            e.Handled = true;
        }

        /// <summary>
        /// Determina si un carácter debe iniciar el autocompletado
        /// </summary>
        private bool ShouldTriggerAutoComplete(char c)
        {
            // Activar con # (directivas), $ (funciones especiales), o letras (funciones/variables)
            if (c == '#' || c == '$' || char.IsLetter(c))
                return true;

            // Activar con [ para Vector/Matrix, pero solo si NO estamos en modo texto
            if (c == '[')
            {
                // No activar si estamos en un comentario o título
                if (_currentElement is MathComment || _currentElement is MathTitle)
                    return false;
                return true;
            }

            return false;
        }

        /// <summary>
        /// Determina si un carácter rompe la secuencia de autocompletado
        /// </summary>
        private bool IsAutoCompleteBreakChar(char c)
        {
            // Números y guiones bajos no rompen la secuencia (para funciones como log_2, norm_p)
            if (char.IsDigit(c) || c == '_')
                return false;

            // [ no rompe la secuencia si estamos en modo expresión (es un trigger)
            // pero sí rompe si estamos en modo texto
            if (c == '[')
            {
                return _currentElement is MathComment || _currentElement is MathTitle;
            }

            return c == ' ' || c == '\n' || c == '\r' || c == '\t' ||
                   c == '(' || c == ')' || c == ']' ||
                   c == '{' || c == '}' || c == '=' || c == '+' ||
                   c == '-' || c == '*' || c == '/' || c == '^' ||
                   c == '<' || c == '>' || c == ',' || c == ';';
        }

        /// <summary>
        /// Actualiza la lista de autocompletado basado en el buffer actual
        /// </summary>
        private void UpdateAutoComplete()
        {
            if (_autoComplete == null || string.IsNullOrEmpty(_autoCompleteBuffer))
                return;

            // Para letras, mostrar solo después de 2+ caracteres (excepto #, $ y [)
            if (_autoCompleteBuffer.Length < 2 &&
                !_autoCompleteBuffer.StartsWith("#") &&
                !_autoCompleteBuffer.StartsWith("$") &&
                !_autoCompleteBuffer.StartsWith("["))
                return;

            // Calcular posición del cursor
            double cursorX = 2; // Padding inicial mínimo
            double cursorY = 5 + (_currentLineIndex * (_lineHeight + 4));

            // Sumar el ancho de los elementos anteriores en la línea actual
            foreach (var element in CurrentLine)
            {
                if (element == _currentElement)
                {
                    if (_currentElement is MathText mt)
                    {
                        // Agregar offset hasta el cursor
                        var typeface = new Typeface(MathStyles.EquationFont, FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
                        var formattedText = new FormattedText(
                            mt.Text.Substring(0, Math.Min(mt.CursorPosition, mt.Text.Length)),
                            System.Globalization.CultureInfo.CurrentCulture,
                            FlowDirection.LeftToRight,
                            typeface,
                            _fontSize,
                            Brushes.Black,
                            GetDpiScale());
                        cursorX += formattedText.Width;
                    }
                    break;
                }
                element.Measure(_fontSize);
                cursorX += element.Width;
            }

            _autoComplete.Show(_autoCompleteBuffer, cursorX, cursorY);
        }

        /// <summary>
        /// Determina si un carácter es un operador que debe salir de estructuras automáticamente
        /// </summary>
        private bool IsOperatorChar(char c)
        {
            // Operadores matemáticos que deben salir de estructuras
            return c == '+' || c == '-' || c == '*' || c == '=' ||
                   c == '<' || c == '>' || c == '(' || c == ')' ||
                   c == '[' || c == ']' || c == '{' || c == '}' ||
                   c == ',' || c == ';' || c == ':' || c == '|' ||
                   c == '&' || c == '%' || c == '!' || c == '?' ||
                   c == ' '; // Espacio también sale de la estructura
        }

        #region Helper methods para cursor y texto

        /// <summary>
        /// Obtiene el DPI scale de forma segura sin causar excepciones
        /// </summary>
        /// <returns>PixelsPerDip, o 1.0 si no se puede obtener</returns>
        private double GetDpiScale()
        {
            try
            {
                if (Application.Current?.MainWindow != null)
                {
                    return VisualTreeHelper.GetDpi(Application.Current.MainWindow).PixelsPerDip;
                }
            }
            catch
            {
                // Fallback silencioso
            }
            return 1.0;
        }

        /// <summary>
        /// Obtiene la posición del cursor del elemento actual
        /// </summary>
        private int GetCurrentCursorPosition()
        {
            if (_currentElement is MathText mt) return mt.CursorPosition;
            if (_currentElement is MathComment mc) return mc.CursorPosition;
            if (_currentElement is MathTitle mtl) return mtl.CursorPosition;
            if (_currentElement is MathExternalBlock eb) return eb.CursorPosition;
            if (_currentElement is MathCode code) return code.CursorPosition;
            return 0;
        }

        /// <summary>
        /// Establece la posición del cursor del elemento actual
        /// </summary>
        private void SetCurrentCursorPosition(int position)
        {
            if (_currentElement is MathText mt) mt.CursorPosition = position;
            else if (_currentElement is MathComment mc) mc.CursorPosition = position;
            else if (_currentElement is MathTitle mtl) mtl.CursorPosition = position;
            else if (_currentElement is MathExternalBlock eb) eb.CursorPosition = position;
            else if (_currentElement is MathCode code) code.CursorPosition = position;
        }

        /// <summary>
        /// Obtiene la longitud del texto del elemento actual
        /// </summary>
        private int GetCurrentTextLength()
        {
            if (_currentElement is MathText mt) return mt.Text.Length;
            if (_currentElement is MathComment mc) return mc.Text.Length;
            if (_currentElement is MathTitle mtl) return mtl.Text.Length;
            if (_currentElement is MathExternalBlock eb) return eb.GetCurrentLine().Length;
            if (_currentElement is MathCode code) return code.Code.Length;
            return 0;
        }

        /// <summary>
        /// Obtiene el texto del elemento actual
        /// </summary>
        private string GetCurrentText()
        {
            if (_currentElement is MathText mt) return mt.Text;
            if (_currentElement is MathComment mc) return mc.Text;
            if (_currentElement is MathTitle mtl) return mtl.Text;
            if (_currentElement is MathExternalBlock eb) return eb.GetCurrentLine();
            if (_currentElement is MathCode code) return code.Code;
            return "";
        }

        /// <summary>
        /// Elimina un carácter del elemento actual
        /// </summary>
        private void DeleteCharFromCurrent()
        {
            if (_currentElement is MathText mt) mt.DeleteChar();
            else if (_currentElement is MathComment mc) mc.DeleteChar();
            else if (_currentElement is MathTitle mtl) mtl.DeleteChar();
            else if (_currentElement is MathExternalBlock eb) eb.DeleteChar();
            else if (_currentElement is MathCode code) code.DeleteChar();
        }

        /// <summary>
        /// Inserta un carácter en el elemento actual
        /// </summary>
        private void InsertCharToCurrent(char c)
        {
            if (_currentElement is MathText mt) mt.InsertChar(c);
            else if (_currentElement is MathComment mc) mc.InsertChar(c);
            else if (_currentElement is MathTitle mtl) mtl.InsertChar(c);
            else if (_currentElement is MathExternalBlock eb) eb.InsertChar(c);
            else if (_currentElement is MathCode code) code.InsertChar(c);
        }

        /// <summary>
        /// Calcula la posición del cursor dentro de un elemento basado en la posición X del click
        /// </summary>
        private int CalculateCursorPositionInElement(MathElement element, double relativeX, double fontSize)
        {
            string text = "";
            Typeface typeface = MathStyles.EquationTypeface;

            if (element is MathText mt)
            {
                text = mt.Text;
                typeface = MathStyles.EquationTypeface;
            }
            else if (element is MathComment mc)
            {
                text = mc.Text;
                typeface = new Typeface(new FontFamily("Segoe UI, Arial Nova, Helvetica, sans-serif"),
                    FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
            }
            else if (element is MathTitle mtl)
            {
                text = mtl.Text;
                fontSize *= 1.4;  // TitleSizeRatio
                typeface = new Typeface(new FontFamily("Arial Nova, Helvetica, sans-serif"),
                    FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
            }
            else if (element is MathCode code)
            {
                text = code.Code;
                fontSize *= 0.85; // Código usa fuente más pequeña
                typeface = new Typeface(new FontFamily("Consolas"),
                    FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
            }

            if (string.IsNullOrEmpty(text))
                return 0;

            // Buscar la posición del carácter más cercana al click
            double accumulatedWidth = 0;
            for (int i = 0; i <= text.Length; i++)
            {
                if (i < text.Length)
                {
                    var charText = text.Substring(0, i + 1);
                    var formattedText = new FormattedText(
                        charText,
                        System.Globalization.CultureInfo.CurrentCulture,
                        FlowDirection.LeftToRight,
                        typeface,
                        fontSize,
                        Brushes.Black,
                        GetDpiScale());

                    double charEndX = formattedText.Width;
                    double charMidX = (accumulatedWidth + charEndX) / 2;

                    if (relativeX < charMidX)
                        return i;

                    accumulatedWidth = charEndX;
                }
            }

            return text.Length;
        }

        /// <summary>
        /// Establece la posición del cursor en un elemento específico
        /// </summary>
        private void SetCursorPositionOnElement(MathElement element, int position)
        {
            if (element is MathText mt)
            {
                mt.CursorPosition = Math.Min(position, mt.Text.Length);
            }
            else if (element is MathComment mc)
            {
                mc.CursorPosition = Math.Min(position, mc.Text.Length);
            }
            else if (element is MathTitle mtl)
            {
                mtl.CursorPosition = Math.Min(position, mtl.Text.Length);
            }
            else if (element is MathCode code)
            {
                code.CursorPosition = Math.Min(position, code.Code.Length);
            }
        }

        /// <summary>
        /// Encuentra el primer elemento editable dentro de un elemento compuesto
        /// </summary>
        private MathElement FindFirstEditableElement(MathElement element)
        {
            if (element is MathText || element is MathComment || element is MathTitle)
                return element;

            if (element is MathMatrix matrix)
            {
                if (matrix.Rows > 0 && matrix.Cols > 0)
                    return FindFirstEditableElement(matrix.GetCell(0, 0));
            }
            else if (element is MathVector vector)
            {
                if (vector.Length > 0)
                    return FindFirstEditableElement(vector.GetElement(0));
            }
            else if (element is MathFraction fraction)
            {
                return FindFirstEditableElement(fraction.Numerator);
            }
            else if (element is MathRoot root)
            {
                return FindFirstEditableElement(root.Radicand);
            }
            else if (element is MathPower power)
            {
                return FindFirstEditableElement(power.Base);
            }
            else if (element is MathSubscript subscript)
            {
                return FindFirstEditableElement(subscript.Base);
            }
            else if (element is MathIntegral integral)
            {
                return FindFirstEditableElement(integral.Integrand);
            }
            else if (element is MathDerivative derivative)
            {
                return FindFirstEditableElement(derivative.Function);
            }

            return null;
        }

        /// <summary>
        /// Encuentra el último elemento editable dentro de un elemento compuesto
        /// </summary>
        private MathElement FindLastEditableElement(MathElement element)
        {
            if (element is MathText || element is MathComment || element is MathTitle)
                return element;

            if (element is MathMatrix matrix)
            {
                if (matrix.Rows > 0 && matrix.Cols > 0)
                    return FindLastEditableElement(matrix.GetCell(matrix.Rows - 1, matrix.Cols - 1));
            }
            else if (element is MathVector vector)
            {
                if (vector.Length > 0)
                    return FindLastEditableElement(vector.GetElement(vector.Length - 1));
            }
            else if (element is MathFraction fraction)
            {
                return FindLastEditableElement(fraction.Denominator);
            }
            else if (element is MathRoot root)
            {
                return FindLastEditableElement(root.Radicand);
            }
            else if (element is MathPower power)
            {
                return FindLastEditableElement(power.Exponent);
            }
            else if (element is MathSubscript subscript)
            {
                return FindLastEditableElement(subscript.Subscript);
            }
            else if (element is MathIntegral integral)
            {
                return FindLastEditableElement(integral.Integrand);
            }
            else if (element is MathDerivative derivative)
            {
                return FindLastEditableElement(derivative.Variable);
            }

            return null;
        }

        /// <summary>
        /// Encuentra la posición (fila, columna) de un elemento dentro de una matriz
        /// </summary>
        private (int row, int col) FindCellPositionInMatrix(MathMatrix matrix, MathElement element)
        {
            for (int i = 0; i < matrix.Rows; i++)
            {
                for (int j = 0; j < matrix.Cols; j++)
                {
                    var cell = matrix.GetCell(i, j);
                    if (cell == element || IsDescendantOf(element, cell))
                        return (i, j);
                }
            }
            return (-1, -1);
        }

        /// <summary>
        /// Navega a la celda anterior en una matriz
        /// </summary>
        private bool NavigateToPreviousCellInMatrix()
        {
            // Buscar la matriz padre
            var current = _currentElement;
            MathMatrix matrix = null;
            while (current != null)
            {
                if (current.Parent is MathMatrix m)
                {
                    matrix = m;
                    break;
                }
                current = current.Parent;
            }

            if (matrix == null) return false;

            var (row, col) = FindCellPositionInMatrix(matrix, _currentElement);
            if (row < 0) return false;

            DebugLog($"MATRIX_NAV_PREV: Currently at ({row}, {col})");

            if (col > 0)
            {
                // Ir a celda anterior en la misma fila
                DebugLog($"MATRIX_NAV_PREV: Moving to ({row}, {col - 1})");
                MoveCursorToEnd(matrix.GetCell(row, col - 1));
                Render();
                return true;
            }
            else if (row > 0)
            {
                // Ir a última celda de fila anterior
                DebugLog($"MATRIX_NAV_PREV: Moving to ({row - 1}, {matrix.Cols - 1})");
                MoveCursorToEnd(matrix.GetCell(row - 1, matrix.Cols - 1));
                Render();
                return true;
            }

            // Estamos en la primera celda, salir de la matriz
            DebugLog($"MATRIX_NAV_PREV: At first cell, exiting matrix");
            return false;
        }

        /// <summary>
        /// Navega a la celda siguiente en una matriz
        /// </summary>
        private bool NavigateToNextCellInMatrix()
        {
            // Buscar la matriz padre
            var current = _currentElement;
            MathMatrix matrix = null;
            while (current != null)
            {
                if (current.Parent is MathMatrix m)
                {
                    matrix = m;
                    break;
                }
                current = current.Parent;
            }

            if (matrix == null) return false;

            var (row, col) = FindCellPositionInMatrix(matrix, _currentElement);
            if (row < 0) return false;

            DebugLog($"MATRIX_NAV_NEXT: Currently at ({row}, {col})");

            if (col < matrix.Cols - 1)
            {
                // Ir a celda siguiente en la misma fila
                DebugLog($"MATRIX_NAV_NEXT: Moving to ({row}, {col + 1})");
                MoveCursorTo(matrix.GetCell(row, col + 1));
                Render();
                return true;
            }
            else if (row < matrix.Rows - 1)
            {
                // Ir a primera celda de fila siguiente
                DebugLog($"MATRIX_NAV_NEXT: Moving to ({row + 1}, 0)");
                MoveCursorTo(matrix.GetCell(row + 1, 0));
                Render();
                return true;
            }

            // Estamos en la última celda, salir de la matriz
            DebugLog($"MATRIX_NAV_NEXT: At last cell, exiting matrix");
            return false;
        }

        /// <summary>
        /// Navega a la fila de arriba en una matriz (misma columna)
        /// </summary>
        private bool NavigateToRowAboveInMatrix()
        {
            // Buscar la matriz padre
            var current = _currentElement;
            MathMatrix matrix = null;
            while (current != null)
            {
                if (current.Parent is MathMatrix m)
                {
                    matrix = m;
                    break;
                }
                current = current.Parent;
            }

            if (matrix == null) return false;

            var (row, col) = FindCellPositionInMatrix(matrix, _currentElement);
            if (row < 0) return false;

            DebugLog($"MATRIX_NAV_UP: Currently at ({row}, {col})");

            if (row > 0)
            {
                // Ir a la misma columna en la fila de arriba
                DebugLog($"MATRIX_NAV_UP: Moving to ({row - 1}, {col})");
                MoveCursorTo(matrix.GetCell(row - 1, col));
                Render();
                return true;
            }

            // Estamos en la primera fila, no hay fila arriba
            DebugLog($"MATRIX_NAV_UP: At first row, exiting matrix");
            return false;
        }

        /// <summary>
        /// Navega a la celda anterior en un vector
        /// </summary>
        private bool NavigateToPreviousCellInVector()
        {
            if (_currentElement?.Parent is MathVector vector)
            {
                int currentIndex = vector.Elements.IndexOf(_currentElement);
                if (currentIndex > 0)
                {
                    DebugLog($"VECTOR_NAV_PREV: Moving from {currentIndex} to {currentIndex - 1}");
                    MoveCursorToEnd(vector.Elements[currentIndex - 1]);
                    Render();
                    return true;
                }
            }
            DebugLog($"VECTOR_NAV_PREV: At first cell, cannot go back");
            return false;
        }

        /// <summary>
        /// Navega a la celda siguiente en un vector
        /// </summary>
        private bool NavigateToNextCellInVector()
        {
            if (_currentElement?.Parent is MathVector vector)
            {
                int currentIndex = vector.Elements.IndexOf(_currentElement);
                if (currentIndex >= 0 && currentIndex < vector.Length - 1)
                {
                    DebugLog($"VECTOR_NAV_NEXT: Moving from {currentIndex} to {currentIndex + 1}");
                    MoveCursorTo(vector.Elements[currentIndex + 1]);
                    Render();
                    return true;
                }
            }
            DebugLog($"VECTOR_NAV_NEXT: At last cell, cannot go forward");
            return false;
        }

        /// <summary>
        /// Sale del vector/matriz hacia el elemento anterior
        /// </summary>
        private void ExitVectorOrMatrixToPrevious()
        {
            // Encontrar el contenedor (vector o matriz)
            MathElement container = null;
            if (_currentElement?.Parent is MathVector v) container = v;
            else if (_currentElement?.Parent is MathMatrix m) container = m;

            if (container == null) return;

            int containerIndex = CurrentLine.IndexOf(container);
            if (containerIndex < 0) return;

            DebugLog($"ExitVectorOrMatrixToPrevious: containerIndex={containerIndex}");

            // Quitar cursor del elemento actual
            if (_currentElement != null)
                _currentElement.IsCursorHere = false;

            if (containerIndex > 0)
            {
                // Ir al elemento anterior al contenedor
                var prevElement = CurrentLine[containerIndex - 1];
                var editable = FindLastEditableElement(prevElement);
                if (editable != null)
                {
                    _currentElement = editable;
                    editable.IsCursorHere = true;
                    SetCursorPositionOnElement(editable, GetTextLengthOfElement(editable));
                    DebugLog($"ExitVectorOrMatrixToPrevious: Moved to previous element");
                }
            }
            else
            {
                // No hay elemento anterior, crear uno
                var newText = new MathText();
                CurrentLine.Insert(0, newText);
                _currentElement = newText;
                newText.IsCursorHere = true;
                newText.CursorPosition = 0;
                DebugLog($"ExitVectorOrMatrixToPrevious: Created new element before");
            }
            Render();
        }

        /// <summary>
        /// Sale del vector/matriz hacia el elemento siguiente
        /// </summary>
        private void ExitVectorOrMatrixToNext()
        {
            // Encontrar el contenedor (vector o matriz)
            MathElement container = null;
            if (_currentElement?.Parent is MathVector v) container = v;
            else if (_currentElement?.Parent is MathMatrix m) container = m;

            if (container == null) return;

            int containerIndex = CurrentLine.IndexOf(container);
            if (containerIndex < 0) return;

            DebugLog($"ExitVectorOrMatrixToNext: containerIndex={containerIndex}");

            // Quitar cursor del elemento actual
            if (_currentElement != null)
                _currentElement.IsCursorHere = false;

            if (containerIndex + 1 < CurrentLine.Count)
            {
                // Ir al elemento siguiente al contenedor
                var nextElement = CurrentLine[containerIndex + 1];
                var editable = FindFirstEditableElement(nextElement);
                if (editable != null)
                {
                    _currentElement = editable;
                    editable.IsCursorHere = true;
                    SetCursorPositionOnElement(editable, 0);
                    DebugLog($"ExitVectorOrMatrixToNext: Moved to next element");
                }
            }
            else
            {
                // No hay elemento siguiente, crear uno
                var newText = new MathText();
                CurrentLine.Add(newText);
                _currentElement = newText;
                newText.IsCursorHere = true;
                newText.CursorPosition = 0;
                DebugLog($"ExitVectorOrMatrixToNext: Created new element after");
            }
            Render();
        }

        /// <summary>
        /// Navega a la fila de abajo en una matriz (misma columna)
        /// </summary>
        private bool NavigateToRowBelowInMatrix()
        {
            // Buscar la matriz padre
            var current = _currentElement;
            MathMatrix matrix = null;
            while (current != null)
            {
                if (current.Parent is MathMatrix m)
                {
                    matrix = m;
                    break;
                }
                current = current.Parent;
            }

            if (matrix == null) return false;

            var (row, col) = FindCellPositionInMatrix(matrix, _currentElement);
            if (row < 0) return false;

            DebugLog($"MATRIX_NAV_DOWN: Currently at ({row}, {col})");

            if (row < matrix.Rows - 1)
            {
                // Ir a la misma columna en la fila de abajo
                DebugLog($"MATRIX_NAV_DOWN: Moving to ({row + 1}, {col})");
                MoveCursorTo(matrix.GetCell(row + 1, col));
                Render();
                return true;
            }

            // Estamos en la última fila, no hay fila abajo
            DebugLog($"MATRIX_NAV_DOWN: At last row, exiting matrix");
            return false;
        }

        #endregion

        #region Creación de Matrices/Vectores desde texto

        /// <summary>
        /// Intenta crear una matriz o vector desde el texto actual cuando se escribe ]
        /// Retorna true si se creó exitosamente, false si no es una matriz/vector válido
        /// </summary>
        private bool TryCreateMatrixFromText(MathText textElement)
        {
            string text = textElement.Text;
            int cursorPos = textElement.CursorPosition;

            // Buscar el [ correspondiente hacia atrás desde la posición del cursor
            int bracketStart = -1;
            int bracketCount = 1; // Ya tenemos el ] que se está escribiendo

            for (int i = cursorPos - 1; i >= 0; i--)
            {
                if (text[i] == ']') bracketCount++;
                else if (text[i] == '[')
                {
                    bracketCount--;
                    if (bracketCount == 0)
                    {
                        bracketStart = i;
                        break;
                    }
                }
            }

            // Si no encontró [, no es una matriz
            if (bracketStart < 0)
            {
                DebugLog($"TryCreateMatrix: No opening bracket found");
                return false;
            }

            // Extraer el contenido entre [ y ]
            string matrixContent = text.Substring(bracketStart + 1, cursorPos - bracketStart - 1);
            DebugLog($"TryCreateMatrix: Content = '{matrixContent}'");

            // Verificar si tiene separadores de matriz/vector
            if (!matrixContent.Contains(';') && !matrixContent.Contains('|'))
            {
                DebugLog($"TryCreateMatrix: No separators found, not a matrix/vector");
                return false;
            }

            // Determinar si es matriz (tiene |) o vector (solo ;)
            bool isMatrix = matrixContent.Contains('|');

            MathElement newElement;
            if (isMatrix)
            {
                // Crear matriz
                var matrix = ParseMatrixContent(matrixContent);
                if (matrix == null)
                {
                    DebugLog($"TryCreateMatrix: Failed to parse matrix");
                    return false;
                }
                newElement = matrix;
                DebugLog($"TryCreateMatrix: Created matrix {matrix.Rows}x{matrix.Cols}");
            }
            else
            {
                // Crear vector horizontal (fila) - así es como Hekatan muestra vectores
                var elements = matrixContent.Split(';');
                var vector = new MathVector(elements.Length, false); // Vector fila (horizontal)
                for (int i = 0; i < elements.Length; i++)
                {
                    var cellText = new MathText(elements[i].Trim());
                    cellText.Parent = vector;
                    vector.SetElement(i, cellText);
                }
                newElement = vector;
                DebugLog($"TryCreateMatrix: Created vector of length {elements.Length}");
            }

            // Obtener el texto antes del [ y después de la posición del cursor
            string textBefore = text.Substring(0, bracketStart);
            string textAfter = cursorPos < text.Length ? text.Substring(cursorPos) : "";

            DebugLog($"TryCreateMatrix: textBefore='{textBefore}', textAfter='{textAfter}'");

            // Reemplazar en la línea actual
            int elementIndex = CurrentLine.IndexOf(textElement);
            if (elementIndex < 0)
            {
                DebugLog($"TryCreateMatrix: textElement not found in CurrentLine");
                return false;
            }

            // Quitar el elemento de texto actual
            CurrentLine.RemoveAt(elementIndex);

            // Si hay texto antes, agregarlo como MathText
            if (!string.IsNullOrEmpty(textBefore))
            {
                var beforeText = new MathText(textBefore);
                CurrentLine.Insert(elementIndex, beforeText);
                elementIndex++;
            }

            // Agregar la matriz/vector
            CurrentLine.Insert(elementIndex, newElement);
            int matrixIndex = elementIndex;
            elementIndex++;

            // Si hay texto después, agregarlo como MathText
            if (!string.IsNullOrEmpty(textAfter))
            {
                var afterText = new MathText(textAfter);
                CurrentLine.Insert(elementIndex, afterText);
            }

            // Mover el cursor a la primera celda de la matriz/vector
            textElement.IsCursorHere = false;
            var firstEditable = FindFirstEditableElement(newElement);
            if (firstEditable != null)
            {
                _currentElement = firstEditable;
                firstEditable.IsCursorHere = true;
                SetCursorPositionOnElement(firstEditable, 0);
            }

            Render();
            OnContentChanged();
            return true;
        }

        /// <summary>
        /// Crea un vector horizontal de 1 elemento cuando se escribe [
        /// </summary>
        private void CreateHorizontalVectorAtCursor(MathText textElement)
        {
            DebugLog("CreateHorizontalVectorAtCursor: Creating new horizontal vector");

            // Crear vector horizontal (fila) de 1 elemento
            var vector = new MathVector(1, false); // false = horizontal
            var firstCell = vector.GetElement(0) as MathText;

            // Obtener el texto antes y después del cursor
            string textBefore = textElement.Text.Substring(0, textElement.CursorPosition);
            string textAfter = textElement.Text.Substring(textElement.CursorPosition);

            // Encontrar posición en la línea
            int elementIndex = CurrentLine.IndexOf(textElement);
            if (elementIndex < 0) return;

            // Remover elemento actual
            CurrentLine.RemoveAt(elementIndex);

            // Agregar texto antes si existe
            if (!string.IsNullOrEmpty(textBefore))
            {
                var beforeText = new MathText(textBefore);
                CurrentLine.Insert(elementIndex, beforeText);
                elementIndex++;
            }

            // Agregar el vector
            CurrentLine.Insert(elementIndex, vector);
            elementIndex++;

            // Agregar texto después si existe
            if (!string.IsNullOrEmpty(textAfter))
            {
                var afterText = new MathText(textAfter);
                CurrentLine.Insert(elementIndex, afterText);
            }

            // Mover cursor a la primera celda del vector
            textElement.IsCursorHere = false;
            _currentElement = firstCell;
            firstCell.IsCursorHere = true;
            firstCell.CursorPosition = 0;

            DebugLog("CreateHorizontalVectorAtCursor: Vector created, cursor in first cell");

            // Marcar la variable antes del = como vector
            MarkPrecedingVariableAsVector();

            Render();
            OnContentChanged();
        }

        /// <summary>
        /// Busca la variable que precede al signo = y la marca como vector
        /// </summary>
        private void MarkPrecedingVariableAsVector()
        {
            // Buscar hacia atrás en la línea actual para encontrar el patrón "variable ="
            for (int i = CurrentLine.Count - 1; i >= 0; i--)
            {
                var element = CurrentLine[i];
                if (element is MathText text)
                {
                    // Buscar el patrón: texto que termina con = o contiene =
                    string content = text.Text.Trim();
                    int equalsIndex = content.LastIndexOf('=');

                    if (equalsIndex >= 0)
                    {
                        // Encontramos el =, ahora buscar la variable antes
                        string beforeEquals = content.Substring(0, equalsIndex).Trim();

                        if (!string.IsNullOrEmpty(beforeEquals))
                        {
                            // La variable está en el mismo MathText, antes del =
                            // Necesitamos buscar en el elemento anterior
                            DebugLog($"MarkPrecedingVariableAsVector: Found variable '{beforeEquals}' in same element");
                        }

                        // Buscar el elemento anterior que contiene la variable
                        for (int j = i - 1; j >= 0; j--)
                        {
                            if (CurrentLine[j] is MathText varText && !string.IsNullOrWhiteSpace(varText.Text))
                            {
                                // Verificar si es un nombre de variable válido (no operador)
                                string varName = varText.Text.Trim();
                                if (varName.Length > 0 && (char.IsLetter(varName[0]) || varName[0] == '_'))
                                {
                                    varText.IsVector = true;
                                    DebugLog($"MarkPrecedingVariableAsVector: Marked '{varName}' as vector");
                                    return;
                                }
                            }
                        }

                        // Si la variable está en el mismo elemento antes del =
                        if (!string.IsNullOrEmpty(beforeEquals) &&
                            (char.IsLetter(beforeEquals[0]) || beforeEquals[0] == '_'))
                        {
                            // El nombre de variable está dentro del mismo MathText
                            // Necesitamos dividirlo para poder marcar solo la variable
                            text.IsVector = true; // Por ahora marcamos todo el elemento
                            DebugLog($"MarkPrecedingVariableAsVector: Marked element containing '{beforeEquals}' as vector");
                            return;
                        }

                        return; // Ya procesamos el =, no seguir buscando
                    }
                }
            }
        }

        /// <summary>
        /// Verifica si el cursor está dentro de un vector o matriz
        /// </summary>
        private bool IsInsideVectorOrMatrix()
        {
            var current = _currentElement;
            while (current != null)
            {
                if (current.Parent is MathVector || current.Parent is MathMatrix)
                    return true;
                current = current.Parent;
            }
            return false;
        }

        /// <summary>
        /// Sale del vector/matriz actual cuando se escribe ]
        /// </summary>
        private void ExitVectorOrMatrix()
        {
            DebugLog("ExitVectorOrMatrix: Exiting vector/matrix");

            // Encontrar el vector o matriz padre
            var current = _currentElement;
            MathElement container = null;
            while (current != null)
            {
                if (current.Parent is MathVector || current.Parent is MathMatrix)
                {
                    container = current.Parent;
                    break;
                }
                current = current.Parent;
            }

            if (container == null) return;

            // Encontrar la posición del contenedor en la línea
            int containerIndex = CurrentLine.IndexOf(container);
            if (containerIndex < 0) return;

            // Quitar cursor del elemento actual
            if (_currentElement != null)
                _currentElement.IsCursorHere = false;

            // Si hay un elemento después del contenedor, ir ahí
            if (containerIndex + 1 < CurrentLine.Count)
            {
                var nextElement = CurrentLine[containerIndex + 1];
                var editable = FindFirstEditableElement(nextElement);
                if (editable != null)
                {
                    _currentElement = editable;
                    editable.IsCursorHere = true;
                    SetCursorPositionOnElement(editable, 0);
                }
            }
            else
            {
                // Crear un nuevo MathText después del contenedor
                var newText = new MathText();
                CurrentLine.Add(newText);
                _currentElement = newText;
                newText.IsCursorHere = true;
                newText.CursorPosition = 0;
            }

            DebugLog("ExitVectorOrMatrix: Exited successfully");
            Render();
            OnContentChanged();
        }

        /// <summary>
        /// Agrega una celda a la derecha cuando se escribe ; (en vector o matriz)
        /// </summary>
        private bool TryAddCellToRight()
        {
            // Buscar si estamos en un vector o matriz
            var current = _currentElement;
            while (current != null)
            {
                if (current.Parent is MathVector vector)
                {
                    DebugLog($"TryAddCellToRight: Adding element to vector (current length: {vector.Length})");

                    // Encontrar índice actual
                    int currentIndex = vector.Elements.IndexOf(current);
                    if (currentIndex < 0) currentIndex = vector.Length - 1;

                    // Agregar nuevo elemento después del actual
                    var newElement = new MathText();
                    newElement.Parent = vector;
                    vector.Elements.Insert(currentIndex + 1, newElement);

                    // Mover cursor al nuevo elemento
                    if (_currentElement != null)
                        _currentElement.IsCursorHere = false;
                    _currentElement = newElement;
                    newElement.IsCursorHere = true;
                    newElement.CursorPosition = 0;

                    DebugLog($"TryAddCellToRight: Vector now has {vector.Length} elements");
                    Render();
                    OnContentChanged();
                    return true;
                }
                else if (current.Parent is MathMatrix matrix)
                {
                    DebugLog($"TryAddCellToRight: In matrix, moving to next cell or adding column");

                    // Encontrar posición actual en la matriz
                    var (row, col) = FindCellPositionInMatrix(matrix, _currentElement);
                    if (row < 0) return false;

                    // Si hay celda a la derecha, ir ahí; si no, agregar columna
                    if (col + 1 < matrix.Cols)
                    {
                        // Ir a la celda existente a la derecha
                        if (_currentElement != null)
                            _currentElement.IsCursorHere = false;

                        var nextCell = matrix.GetCell(row, col + 1);
                        var editable = FindFirstEditableElement(nextCell);
                        if (editable != null)
                        {
                            _currentElement = editable;
                            editable.IsCursorHere = true;
                            SetCursorPositionOnElement(editable, 0);
                        }
                    }
                    else
                    {
                        // Agregar nueva columna
                        matrix.AddColumn(col + 1);

                        if (_currentElement != null)
                            _currentElement.IsCursorHere = false;

                        var newCell = matrix.GetCell(row, col + 1);
                        var editable = FindFirstEditableElement(newCell);
                        if (editable != null)
                        {
                            _currentElement = editable;
                            editable.IsCursorHere = true;
                            SetCursorPositionOnElement(editable, 0);
                        }
                    }

                    DebugLog($"TryAddCellToRight: Matrix now {matrix.Rows}x{matrix.Cols}");
                    Render();
                    OnContentChanged();
                    return true;
                }
                current = current.Parent;
            }
            return false;
        }

        /// <summary>
        /// Agrega una fila abajo (o convierte vector a matriz) cuando se escribe |
        /// </summary>
        private bool TryAddRowBelow()
        {
            var current = _currentElement;
            while (current != null)
            {
                if (current.Parent is MathVector vector)
                {
                    DebugLog($"TryAddRow: Converting vector to matrix");

                    // Convertir vector a matriz
                    int numCols = vector.Length;
                    var matrix = new MathMatrix(2, numCols);

                    // Copiar elementos del vector a la primera fila
                    for (int j = 0; j < numCols; j++)
                    {
                        var elem = vector.GetElement(j);
                        if (elem is MathText mt)
                        {
                            var newCell = new MathText(mt.Text);
                            newCell.Parent = matrix;
                            matrix.SetCell(0, j, newCell);
                        }
                    }

                    // Crear celdas vacías para la segunda fila
                    for (int j = 0; j < numCols; j++)
                    {
                        var newCell = new MathText();
                        newCell.Parent = matrix;
                        matrix.SetCell(1, j, newCell);
                    }

                    // Reemplazar vector con matriz en la línea
                    int vectorIndex = CurrentLine.IndexOf(vector);
                    if (vectorIndex >= 0)
                    {
                        CurrentLine[vectorIndex] = matrix;
                    }

                    // Mover cursor a la primera celda de la nueva fila
                    if (_currentElement != null)
                        _currentElement.IsCursorHere = false;

                    var firstCellNewRow = matrix.GetCell(1, 0);
                    var editable = FindFirstEditableElement(firstCellNewRow);
                    if (editable != null)
                    {
                        _currentElement = editable;
                        editable.IsCursorHere = true;
                        SetCursorPositionOnElement(editable, 0);
                    }

                    DebugLog($"TryAddRow: Converted to {matrix.Rows}x{matrix.Cols} matrix");
                    Render();
                    OnContentChanged();
                    return true;
                }
                else if (current.Parent is MathMatrix matrix)
                {
                    DebugLog($"TryAddRow: Adding row to matrix");

                    // Encontrar posición actual
                    var (row, col) = FindCellPositionInMatrix(matrix, _currentElement);
                    if (row < 0) return false;

                    // Agregar fila después de la actual
                    matrix.AddRow(row + 1);

                    // Mover cursor a la primera celda de la nueva fila
                    if (_currentElement != null)
                        _currentElement.IsCursorHere = false;

                    var newCell = matrix.GetCell(row + 1, 0);
                    var editable = FindFirstEditableElement(newCell);
                    if (editable != null)
                    {
                        _currentElement = editable;
                        editable.IsCursorHere = true;
                        SetCursorPositionOnElement(editable, 0);
                    }

                    DebugLog($"TryAddRow: Matrix now {matrix.Rows}x{matrix.Cols}");
                    Render();
                    OnContentChanged();
                    return true;
                }
                current = current.Parent;
            }
            return false;
        }

        #endregion

        /// <summary>
        /// Establece el cursor en el elemento especificado
        /// </summary>
        private void SetCursorOnElement(MathElement element)
        {
            element.IsCursorHere = true;
            if (element is MathText mt)
            {
                mt.CursorPosition = mt.Text.Length;
            }
            else if (element is MathComment mc)
            {
                mc.CursorPosition = mc.Text.Length;
            }
            else if (element is MathTitle mtl)
            {
                mtl.CursorPosition = mtl.Text.Length;
            }
        }

        private void MoveCursorToLine(int newLineIndex)
        {
            if (newLineIndex < 0 || newLineIndex >= _lines.Count) return;

            if (_currentElement != null)
                _currentElement.IsCursorHere = false;

            _currentLineIndex = newLineIndex;
            var newLine = _lines[newLineIndex];

            // Ir al primer elemento de la nueva línea
            _currentElement = newLine[0];
            _currentElement.IsCursorHere = true;
            if (_currentElement is MathText mt)
            {
                mt.CursorPosition = 0;
            }
            else if (_currentElement is MathComment mc)
            {
                mc.CursorPosition = 0;
            }
            else if (_currentElement is MathTitle mtl)
            {
                mtl.CursorPosition = 0;
            }
        }

        private void DeleteCurrentLine()
        {
            if (_lines.Count <= 1) return;

            int lineToDelete = _currentLineIndex;

            if (_currentElement != null)
                _currentElement.IsCursorHere = false;

            _lines.RemoveAt(lineToDelete);

            // Mover a la línea anterior o siguiente
            if (lineToDelete > 0)
            {
                _currentLineIndex = lineToDelete - 1;
            }
            else
            {
                _currentLineIndex = 0;
            }

            var line = _lines[_currentLineIndex];
            _currentElement = line[line.Count - 1];
            if (_currentElement is MathText mt)
            {
                mt.IsCursorHere = true;
                mt.CursorPosition = mt.Text.Length;
            }

            Render();
            OnContentChanged();
        }

        private void CreateFractionFromPrevious(MathText textElement)
        {
            string prevToken = ExtractPreviousToken(textElement);

            var numerator = new MathText(prevToken);
            var denominator = new MathText();
            var fraction = new MathFraction(numerator, denominator);

            int index = CurrentLine.IndexOf(textElement);
            if (index >= 0)
            {
                if (string.IsNullOrEmpty(textElement.Text))
                {
                    CurrentLine[index] = fraction;
                }
                else
                {
                    CurrentLine.Insert(index + 1, fraction);
                }
            }

            textElement.IsCursorHere = false;
            _currentElement = denominator;
            denominator.IsCursorHere = true;
            denominator.CursorPosition = 0;
        }

        private void CreatePowerFromPrevious(MathText textElement)
        {
            string prevToken = ExtractPreviousToken(textElement);

            var baseEl = new MathText(prevToken);
            var exponent = new MathText();
            var power = new MathPower(baseEl, exponent);

            int index = CurrentLine.IndexOf(textElement);
            if (index >= 0)
            {
                if (string.IsNullOrEmpty(textElement.Text))
                {
                    CurrentLine[index] = power;
                }
                else
                {
                    CurrentLine.Insert(index + 1, power);
                }
            }

            textElement.IsCursorHere = false;
            _currentElement = exponent;
            exponent.IsCursorHere = true;
            exponent.CursorPosition = 0;
        }

        private void CreateSubscriptFromPrevious(MathText textElement)
        {
            string prevToken = ExtractPreviousToken(textElement);

            var baseEl = new MathText(prevToken);
            var subscript = new MathText();
            var sub = new MathSubscript(baseEl, subscript);

            int index = CurrentLine.IndexOf(textElement);
            if (index >= 0)
            {
                if (string.IsNullOrEmpty(textElement.Text))
                {
                    CurrentLine[index] = sub;
                }
                else
                {
                    CurrentLine.Insert(index + 1, sub);
                }
            }

            textElement.IsCursorHere = false;
            _currentElement = subscript;
            subscript.IsCursorHere = true;
            subscript.CursorPosition = 0;
        }

        private string ExtractPreviousToken(MathText textElement)
        {
            string text = textElement.Text;
            int pos = textElement.CursorPosition;

            if (pos == 0 || string.IsNullOrEmpty(text))
                return "";

            int start = pos - 1;
            while (start > 0 && (char.IsLetterOrDigit(text[start - 1]) || text[start - 1] == '.'))
            {
                start--;
            }

            string token = text.Substring(start, pos - start);
            textElement.Text = text.Substring(0, start) + text.Substring(pos);
            textElement.CursorPosition = start;

            return token;
        }

        private void ToggleTextMode(MathText textElement)
        {
            // Cuando se escribe ', crear un MathComment para el texto que sigue
            // En Hekatan, ' marca el inicio de un comentario hasta fin de línea

            int elementIndex = CurrentLine.IndexOf(textElement);
            if (elementIndex < 0) return;

            // Si hay texto después del cursor, dividirlo
            string textBefore = textElement.Text.Substring(0, textElement.CursorPosition);
            string textAfter = textElement.Text.Substring(textElement.CursorPosition);

            // Actualizar el texto actual con solo lo que está antes del cursor
            textElement.Text = textBefore;
            textElement.CursorPosition = textBefore.Length;
            textElement.IsCursorHere = false;

            // Crear el MathComment
            var comment = new MathComment(textAfter);
            comment.CursorPosition = 0; // Cursor al inicio del comentario
            comment.IsCursorHere = true;

            // Insertar el comentario después del elemento actual
            CurrentLine.Insert(elementIndex + 1, comment);

            // Mover el cursor al comentario
            _currentElement = comment;
            _isTextMode = true;
        }

        /// <summary>
        /// Sale del modo comentario cuando se escribe ' dentro de un MathComment.
        /// Cierra el comentario y crea un nuevo MathText para el código que sigue.
        /// </summary>
        private void ExitCommentMode(MathComment comment)
        {
            int elementIndex = CurrentLine.IndexOf(comment);
            if (elementIndex < 0) return;

            // Si hay texto después del cursor en el comentario, dividirlo
            string textBefore = comment.Text.Substring(0, comment.CursorPosition);
            string textAfter = comment.Text.Substring(comment.CursorPosition);

            // Actualizar el comentario con solo lo que está antes del cursor
            comment.Text = textBefore;
            comment.CursorPosition = textBefore.Length;
            comment.IsCursorHere = false;
            comment.IsClosed = true; // Marcar como cerrado programáticamente

            // Crear un nuevo MathText para el código que sigue después del comentario cerrado
            var newText = new MathText(textAfter);
            newText.CursorPosition = 0; // Cursor al inicio del nuevo texto
            newText.IsCursorHere = true;

            // Insertar el nuevo MathText después del comentario
            CurrentLine.Insert(elementIndex + 1, newText);

            // Mover el cursor al nuevo MathText (modo código)
            _currentElement = newText;
            _isTextMode = false;

            DebugLog($"ExitCommentMode: Closed comment, created new MathText");
            Render();
            OnContentChanged();
        }

        /// <summary>
        /// Intenta reabrir un MathComment cerrado que precede al elemento actual.
        /// Se usa cuando el usuario presiona Backspace al inicio de un MathText
        /// que sigue a un comentario cerrado, para poder editar/eliminar la comilla de cierre.
        /// </summary>
        private bool TryReopenPrecedingComment()
        {
            if (_currentElement == null) return false;

            // Solo aplica si estamos en un MathText al inicio (posición 0)
            if (!(_currentElement is MathText currentText)) return false;
            if (currentText.CursorPosition != 0) return false;

            int currentIndex = CurrentLine.IndexOf(currentText);
            if (currentIndex <= 0) return false;

            // Verificar si el elemento anterior es un MathComment cerrado
            var prevElement = CurrentLine[currentIndex - 1];
            if (!(prevElement is MathComment comment)) return false;
            if (!comment.IsClosed) return false;

            // Reabrir el comentario: quitar el flag IsClosed
            comment.IsClosed = false;

            // Mover el texto del MathText actual al final del comentario (si hay)
            if (!string.IsNullOrEmpty(currentText.Text))
            {
                comment.Text += currentText.Text;
            }

            // Mover el cursor al final del comentario (antes del texto movido)
            comment.CursorPosition = comment.Text.Length - (currentText.Text?.Length ?? 0);
            comment.IsCursorHere = true;

            // Eliminar el MathText vacío o el que se fusionó
            CurrentLine.RemoveAt(currentIndex);

            // Actualizar elemento actual
            currentText.IsCursorHere = false;
            _currentElement = comment;
            _isTextMode = true;

            DebugLog($"TryReopenPrecedingComment: Reopened comment, IsClosed=false");
            Render();
            return true;
        }

        /// <summary>
        /// Intenta reabrir el MathComment actual si está cerrado y el cursor está al final.
        /// Se usa cuando el usuario presiona Delete al final de un comentario cerrado.
        /// </summary>
        private bool TryReopenCurrentComment()
        {
            if (_currentElement == null) return false;

            // Solo aplica si estamos en un MathComment cerrado al final
            if (!(_currentElement is MathComment comment)) return false;
            if (!comment.IsClosed) return false;
            if (comment.CursorPosition != comment.Text.Length) return false;

            // Reabrir el comentario: quitar el flag IsClosed
            comment.IsClosed = false;

            // Buscar si hay un MathText siguiente y fusionarlo
            int currentIndex = CurrentLine.IndexOf(comment);
            if (currentIndex >= 0 && currentIndex < CurrentLine.Count - 1)
            {
                var nextElement = CurrentLine[currentIndex + 1];
                if (nextElement is MathText nextText)
                {
                    // Fusionar el texto del MathText siguiente al comentario
                    comment.Text += nextText.Text;
                    // Eliminar el MathText siguiente
                    CurrentLine.RemoveAt(currentIndex + 1);
                }
            }

            DebugLog($"TryReopenCurrentComment: Reopened comment at end, IsClosed=false");
            Render();
            return true;
        }

        #region Zoom Controls

        private void ZoomToggleButton_Click(object sender, RoutedEventArgs e)
        {
            // Mostrar/ocultar el popup de zoom
            if (ZoomPopup != null)
            {
                ZoomPopup.IsOpen = !ZoomPopup.IsOpen;
            }
        }

        private void ZoomInButton_Click(object sender, RoutedEventArgs e)
        {
            SetZoom(_zoomLevel + 0.1);
        }

        private void ZoomOutButton_Click(object sender, RoutedEventArgs e)
        {
            SetZoom(_zoomLevel - 0.1);
        }

        private void ZoomResetButton_Click(object sender, RoutedEventArgs e)
        {
            SetZoom(1.0);
        }

        private void SetZoom(double newZoom)
        {
            // Limitar zoom entre 50% y 200%
            _zoomLevel = Math.Max(0.5, Math.Min(2.0, newZoom));
            _fontSize = BaseFontSize * _zoomLevel;
            _lineHeight = BaseLineHeight * _zoomLevel;

            // Actualizar texto del nivel de zoom
            ZoomLevelText.Text = $"{(int)(_zoomLevel * 100)}%";

            Render();
            Focus();
        }

        /// <summary>
        /// Obtiene o establece el nivel de zoom actual (1.0 = 100%)
        /// </summary>
        public double ZoomLevel
        {
            get => _zoomLevel;
            set => SetZoom(value);
        }

        #endregion

        #region Clipboard Operations

        /// <summary>
        /// Pega texto del portapapeles. Si es multilínea, recarga todo el contenido.
        /// Si es una sola línea, lo inserta en la posición actual.
        /// </summary>
        private void PasteFromClipboard()
        {
            try
            {
                if (!Clipboard.ContainsText())
                    return;

                string clipboardText = Clipboard.GetText();
                if (string.IsNullOrEmpty(clipboardText))
                    return;

                // Si el texto tiene múltiples líneas, recargar todo el contenido
                if (clipboardText.Contains('\n') || clipboardText.Contains('\r'))
                {
                    // Obtener contenido actual y agregar el texto pegado
                    string currentContent = ToHekatan();

                    // Insertar en la posición del cursor
                    // Para simplificar, recargar todo con el texto pegado agregado
                    string newContent = currentContent + "\n" + clipboardText;
                    FromHekatan(newContent);
                }
                else
                {
                    // Una sola línea: procesar carácter por carácter para manejar ' y " correctamente
                    foreach (char c in clipboardText)
                    {
                        // Cerrar comentario cuando se pega ' dentro de MathComment
                        if (_currentElement is MathComment comment && c == '\'')
                        {
                            ExitCommentMode(comment);
                            continue;
                        }

                        if (_currentElement is MathText textElement)
                        {
                            // Manejar caracteres especiales igual que en PreviewTextInput
                            if (c == '\'')
                            {
                                ToggleTextMode(textElement);
                                continue;
                            }
                            if (c == '"')
                            {
                                // Crear título
                                CreateTitleAtCursor(textElement);
                                continue;
                            }
                            if (c == '[')
                            {
                                CreateHorizontalVectorAtCursor(textElement);
                                continue;
                            }
                        }

                        // Insertar carácter normal
                        InsertCharToCurrent(c);
                    }
                }

                _cursorVisible = true;
                Render();
                OnContentChanged();
            }
            catch (Exception ex)
            {
                DebugLog($"PasteFromClipboard error: {ex.Message}");
            }
        }

        /// <summary>
        /// Copia el contenido actual al portapapeles en formato Hekatan
        /// </summary>
        private void CopyToClipboard()
        {
            try
            {
                string content = ToHekatan();
                if (!string.IsNullOrEmpty(content))
                {
                    Clipboard.SetText(content);
                }
            }
            catch (Exception ex)
            {
                DebugLog($"CopyToClipboard error: {ex.Message}");
            }
        }

        /// <summary>
        /// Crea un MathTitle en la posición actual del cursor
        /// </summary>
        private void CreateTitleAtCursor(MathText textElement)
        {
            int elementIndex = CurrentLine.IndexOf(textElement);
            if (elementIndex < 0) return;

            // Dividir texto si hay algo después del cursor
            string textBefore = textElement.Text.Substring(0, textElement.CursorPosition);
            string textAfter = textElement.Text.Substring(textElement.CursorPosition);

            textElement.Text = textBefore;
            textElement.CursorPosition = textBefore.Length;
            textElement.IsCursorHere = false;

            // Crear el MathTitle
            var title = new MathTitle(textAfter);
            title.CursorPosition = 0;
            title.IsCursorHere = true;

            CurrentLine.Insert(elementIndex + 1, title);
            _currentElement = title;
        }

        #endregion

        /// <summary>
        /// Handler para selección con clic en el autocompletado
        /// </summary>
        private void AutoCompleteListBox_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            _autoComplete?.ConfirmSelection();
            Focus();
        }

        /// <summary>
        /// Handler para teclas en el autocompletado
        /// </summary>
        private void AutoCompleteListBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter || e.Key == Key.Tab)
            {
                _autoComplete?.ConfirmSelection();
                Focus();
                e.Handled = true;
            }
            else if (e.Key == Key.Escape)
            {
                _autoComplete?.Hide();
                _autoCompleteBuffer = "";
                Focus();
                e.Handled = true;
            }
        }

        #region Preview Editor Event Handlers

        // Campo para evitar recursión en sincronización preview
        private bool _isApplyingPreviewEdit = false;
        private bool _previewEditorJustOpened = false;
        private DispatcherTimer _previewEditorProtectionTimer;

        /// <summary>
        /// Handler para click en preview bar - abre el editor de la línea actual
        /// </summary>
        private void PreviewTextBlock_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (_currentElement is MathExternalBlock externalBlock)
            {
                var lines = externalBlock.GetCodeLines();
                if (externalBlock.CursorLine >= 0 && externalBlock.CursorLine < lines.Length)
                {
                    string currentLine = lines[externalBlock.CursorLine];
                    string prefix = $"@{{{externalBlock.Language.ToLower()}}} Ln {externalBlock.CursorLine + 1}: ";
                    string fullText = prefix + currentLine;

                    // Mostrar editor, ocultar TextBlock
                    PreviewTextBlock.Visibility = Visibility.Collapsed;
                    PreviewEditorContainer.Visibility = Visibility.Visible;
                    PreviewEditor.Text = fullText;

                    // Marcar que el editor acaba de abrirse
                    _previewEditorJustOpened = true;

                    // Establecer cursor después de que se renderice el control
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        int caretPos = prefix.Length + externalBlock.CursorPosition;
                        if (caretPos >= 0 && caretPos <= PreviewEditor.Text.Length)
                        {
                            PreviewEditor.CaretOffset = caretPos;
                        }
                        PreviewEditor.Focus();

                        // Desmarcar después de 500ms usando un timer
                        // FIX: Usar campo para poder hacer cleanup en Unloaded
                        _previewEditorProtectionTimer?.Stop();
                        _previewEditorProtectionTimer = new DispatcherTimer
                        {
                            Interval = TimeSpan.FromMilliseconds(500)
                        };
                        _previewEditorProtectionTimer.Tick += (s, args) =>
                        {
                            _previewEditorJustOpened = false;
                            _previewEditorProtectionTimer.Stop();
                        };
                        _previewEditorProtectionTimer.Start();
                    }), System.Windows.Threading.DispatcherPriority.Loaded);
                }
            }
        }

        /// <summary>
        /// Handler para cambios de texto en preview editor - sincroniza en tiempo real
        /// </summary>
        private void PreviewEditor_TextChanged(object sender, EventArgs e)
        {
            if (_isApplyingPreviewEdit) return;
            if (PreviewEditor == null || !PreviewEditor.IsFocused) return;
            ApplyPreviewEditFromAvalonEdit(finalApply: false);
        }

        /// <summary>
        /// Handler para teclas en preview editor - detecta Enter para cerrar
        /// </summary>
        private void PreviewEditor_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                ApplyPreviewEditFromAvalonEdit(finalApply: true);
                e.Handled = true;
            }
            else if (e.Key == Key.Escape)
            {
                // Cancelar edición y cerrar
                PreviewEditorContainer.Visibility = Visibility.Collapsed;
                PreviewTextBlock.Visibility = Visibility.Visible;
                EditorCanvas.Focus();
                e.Handled = true;
            }
        }

        /// <summary>
        /// Handler para perder foco en preview editor - cierra el editor
        /// </summary>
        private void PreviewEditor_LostFocus(object sender, RoutedEventArgs e)
        {
            // Ignorar LostFocus si el editor acaba de abrirse (prevenir cierre inmediato)
            if (_previewEditorJustOpened)
            {
                // Devolver el foco al editor
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (PreviewEditorContainer.Visibility == Visibility.Visible)
                    {
                        PreviewEditor.Focus();
                    }
                }), System.Windows.Threading.DispatcherPriority.Background);
                return;
            }

            ApplyPreviewEditFromAvalonEdit(finalApply: true);
        }

        /// <summary>
        /// Aplica los cambios del preview editor al modelo y canvas
        /// </summary>
        /// <param name="finalApply">true para Render completo y cerrar, false para actualización ligera</param>
        private void ApplyPreviewEditFromAvalonEdit(bool finalApply = true)
        {
            if (_isApplyingPreviewEdit) return;
            if (_currentElement is not MathExternalBlock externalBlock) return;

            _isApplyingPreviewEdit = true;

            try
            {
                // Extraer texto sin prefijo "@{lang} Ln X: "
                string fullText = PreviewEditor.Text;
                string pattern = @"^@\{[^\}]+\}\s+Ln\s+\d+:\s*";
                string newText = System.Text.RegularExpressions.Regex.Replace(fullText, pattern, "");

                // Actualizar modelo
                externalBlock.SetCurrentLine(newText);

                // Actualizar posición del cursor
                string prefix = fullText.Substring(0, fullText.Length - newText.Length);
                int caretInText = Math.Max(0, PreviewEditor.CaretOffset - prefix.Length);
                externalBlock.CursorPosition = Math.Max(0, Math.Min(caretInText, newText.Length));

                if (finalApply)
                {
                    // Render completo
                    Render();

                    // Cerrar editor después de que Render termine
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        PreviewEditorContainer.Visibility = Visibility.Collapsed;
                        PreviewTextBlock.Visibility = Visibility.Visible;
                        EditorCanvas.Focus();
                    }), System.Windows.Threading.DispatcherPriority.Loaded);
                }
                else
                {
                    // Actualización ligera sin parseo completo
                    UpdateCurrentElementInCanvas();
                }
            }
            finally
            {
                _isApplyingPreviewEdit = false;
            }
        }

        /// <summary>
        /// Actualiza el canvas actual sin hacer Render completo (ligero)
        /// </summary>
        private void UpdateCurrentElementInCanvas()
        {
            if (_currentElement != null)
            {
                EditorCanvas.InvalidateVisual();
            }
        }

        // Handlers deprecated para TextBox antiguo (evitar errores de compilación)
        private void PreviewEditTextBox_KeyDown(object sender, KeyEventArgs e) { }
        private void PreviewEditTextBox_LostFocus(object sender, RoutedEventArgs e) { }
        private void PreviewEditTextBox_TextChanged(object sender, TextChangedEventArgs e) { }

        #endregion

        private void EditorCanvas_MouseDown(object sender, MouseButtonEventArgs e)
        {
            var pos = e.GetPosition(EditorCanvas);
            DebugLog($"=== MOUSE CLICK === pos=({pos.X:F1}, {pos.Y:F1})");

            // Determinar en qué línea está el clic
            // IMPORTANTE: Usar el mismo offset que Render()
            double y = 4;  // Padding mínimo arriba (igual que Render)

            for (int lineIndex = 0; lineIndex < _lines.Count; lineIndex++)
            {
                var line = _lines[lineIndex];

                // Calcular altura de la línea igual que en Render()
                double maxBaseline = 0;
                double maxHeightBelowBaseline = 0;
                foreach (var elem in line)
                {
                    elem.Measure(_fontSize);
                    maxBaseline = Math.Max(maxBaseline, elem.Baseline);
                    maxHeightBelowBaseline = Math.Max(maxHeightBelowBaseline, elem.Height - elem.Baseline);
                }
                double maxHeight = Math.Max(_lineHeight, maxBaseline + maxHeightBelowBaseline);

                if (pos.Y >= y && pos.Y < y + maxHeight + 4)  // +4 para incluir espacio entre líneas
                {
                    DebugLog($"CLICK: Found line {lineIndex}, y={y:F1}, maxHeight={maxHeight:F1}");

                    // Clic en esta línea
                    if (_currentElement != null)
                        _currentElement.IsCursorHere = false;

                    _currentLineIndex = lineIndex;

                    // Buscar el elemento en la posición X del click
                    double x = 2;  // Padding izquierdo mínimo
                    MathElement foundElement = null;
                    int foundCursorPos = 0;

                    // Calcular elementY igual que en Render para alineación de baseline
                    double maxBaseline2 = 0;
                    foreach (var elem2 in line)
                    {
                        elem2.Measure(_fontSize);
                        maxBaseline2 = Math.Max(maxBaseline2, elem2.Baseline);
                    }

                    foreach (var element in line)
                    {
                        element.Measure(_fontSize);

                        // Establecer X, Y del elemento para hit testing correcto
                        // Para MathExternalBlock, usar Y = y directamente (sin ajuste de baseline)
                        // porque el bloque se renderiza desde y, no ajustado por baseline
                        double elementY;
                        if (element is MathExternalBlock)
                        {
                            elementY = y;  // MathExternalBlock se renderiza desde y directamente
                        }
                        else
                        {
                            elementY = y + (maxBaseline2 - element.Baseline);
                        }
                        element.X = x;
                        element.Y = elementY;

                        DebugLog($"CLICK: Checking element {element.GetType().Name} at x={x:F1}, y={elementY:F1}, width={element.Width:F1}, height={element.Height:F1}");

                        if (pos.X >= x && pos.X < x + element.Width)
                        {
                            DebugLog($"CLICK: HIT on {element.GetType().Name}");

                            // NUEVO: MathExternalBlock - Toggle collapse/expand o editar
                            if (element is MathExternalBlock externalBlock)
                            {
                                // Click en header: verificar si es en [+] o [-]
                                if (externalBlock.IsClickOnHeader(pos.X, pos.Y, _fontSize))
                                {
                                    // Click en header: toggle collapse/expand
                                    DebugLog($"CLICK: External block header {externalBlock.Language}, toggling collapse");
                                    externalBlock.ToggleCollapse();
                                    Render();
                                    break;
                                }
                                else if (!externalBlock.IsCollapsed)
                                {
                                    // Click en área de código (expandido): posicionar cursor para editar
                                    externalBlock.SetCursorFromClick(pos.X, pos.Y, _fontSize, element.X, element.Y);
                                    externalBlock.IsCursorHere = true;
                                    _currentElement = externalBlock;
                                    // NO continuar - ya establecimos el cursor correctamente
                                    break;
                                }
                                else
                                {
                                    // Click en bloque colapsado (fuera del header): expandir
                                    DebugLog($"CLICK: External block collapsed {externalBlock.Language}, expanding");
                                    externalBlock.ToggleCollapse();
                                    Render();
                                    break;
                                }
                            }

                            // Para elementos compuestos (matrices, vectores, fracciones, columnas, etc.), usar HitTest
                            if (element is MathMatrix || element is MathVector ||
                                element is MathFraction || element is MathRoot ||
                                element is MathPower || element is MathSubscript ||
                                element is MathColumns)
                            {
                                DebugLog($"CLICK: Composite element, using HitTest");
                                // El elemento ya tiene X, Y del render anterior
                                // Usar HitTest para encontrar el sub-elemento
                                var hitElement = element.HitTest(pos.X, pos.Y);
                                DebugLog($"CLICK: HitTest returned {hitElement?.GetType().Name ?? "null"}, X={hitElement?.X:F1}, Y={hitElement?.Y:F1}");

                                if (hitElement != null && hitElement != element)
                                {
                                    // Click dentro de una celda - limpiar selección de estructura
                                    ClearStructureSelection();

                                    // NUEVO: Si el hit es un MathExternalBlock dentro de MathColumns, manejarlo especialmente
                                    if (hitElement is MathExternalBlock externalBlockInColumns)
                                    {
                                        DebugLog($"CLICK: MathExternalBlock inside MathColumns: {externalBlockInColumns.Language}");

                                        // Click en header: verificar si es en [+] o [-]
                                        if (externalBlockInColumns.IsClickOnHeader(pos.X, pos.Y, _fontSize))
                                        {
                                            DebugLog($"CLICK: External block header in columns {externalBlockInColumns.Language}, toggling collapse");
                                            externalBlockInColumns.ToggleCollapse();
                                            Render();
                                            break;
                                        }
                                        else if (!externalBlockInColumns.IsCollapsed)
                                        {
                                            // Click en área de código (expandido): posicionar cursor para editar
                                            externalBlockInColumns.SetCursorFromClick(pos.X, pos.Y, _fontSize, hitElement.X, hitElement.Y);
                                            externalBlockInColumns.IsCursorHere = true;
                                            _currentElement = externalBlockInColumns;
                                            DebugLog($"CLICK: Set cursor in external block inside columns");
                                            break;
                                        }
                                        else
                                        {
                                            // Click en bloque colapsado (fuera del header): expandir
                                            DebugLog($"CLICK: External block collapsed in columns {externalBlockInColumns.Language}, expanding");
                                            externalBlockInColumns.ToggleCollapse();
                                            Render();
                                            break;
                                        }
                                    }

                                    foundElement = hitElement;
                                    // Calcular posición del cursor dentro del sub-elemento
                                    double relX = pos.X - hitElement.X;
                                    foundCursorPos = CalculateCursorPositionInElement(hitElement, relX, _fontSize);
                                    DebugLog($"CLICK: Sub-element found, relX={relX:F1}, cursorPos={foundCursorPos}");
                                }
                                else
                                {
                                    // Click en el borde/bracket del vector o matriz - seleccionar toda la estructura
                                    if (element is MathVector || element is MathMatrix)
                                    {
                                        SelectStructure(element);
                                        DebugLog($"CLICK: Selected entire structure: {element.GetType().Name}");
                                        // No establecer foundElement para que no cambie el cursor
                                        break;
                                    }
                                    else
                                    {
                                        // Para otras estructuras, ir al primer elemento editable
                                        foundElement = FindFirstEditableElement(element);
                                        foundCursorPos = 0;
                                        DebugLog($"CLICK: No sub-element, using first editable: {foundElement?.GetType().Name}");
                                    }
                                }
                            }
                            else
                            {
                                foundElement = element;
                                // Calcular posición del cursor dentro del elemento
                                foundCursorPos = CalculateCursorPositionInElement(element, pos.X - x, _fontSize);
                                DebugLog($"CLICK: Simple element, cursorPos={foundCursorPos}");
                            }
                            break;
                        }
                        x += element.Width;
                    }

                    // Si encontró elemento, posicionar cursor
                    // NOTA: Para MathExternalBlock, _currentElement ya fue establecido directamente
                    if (foundElement != null)
                    {
                        _currentElement = foundElement;
                        _currentElement.IsCursorHere = true;
                        SetCursorPositionOnElement(_currentElement, foundCursorPos);
                        DebugLog($"CLICK: Set cursor on {foundElement.GetType().Name}, pos={foundCursorPos}");
                    }
                    else if (_currentElement is MathExternalBlock)
                    {
                        // MathExternalBlock ya fue manejado - no hacer nada más
                        DebugLog($"CLICK: MathExternalBlock already handled");
                    }
                    else
                    {
                        // Determinar si el clic está antes del primer elemento o después del último
                        double firstElementX = 2;  // Padding izquierdo mínimo
                        if (pos.X < firstElementX)
                        {
                            // Clic antes del primer elemento - ir al inicio
                            var firstElement = line[0];
                            _currentElement = FindFirstEditableElement(firstElement) ?? firstElement;
                            _currentElement.IsCursorHere = true;
                            SetCursorPositionOnElement(_currentElement, 0);
                            DebugLog($"CLICK: Before first element, cursor at start: {_currentElement?.GetType().Name}");
                        }
                        else
                        {
                            // Clic después de todos los elementos - ir al final
                            var lastElement = line[line.Count - 1];
                            _currentElement = FindLastEditableElement(lastElement) ?? lastElement;
                            _currentElement.IsCursorHere = true;
                            SetCursorOnElement(_currentElement);
                            DebugLog($"CLICK: After last element, cursor at end: {_currentElement?.GetType().Name}");
                        }
                    }

                    break;
                }

                y += maxHeight + 4;  // Espacio entre líneas (igual que Render)
            }

            // Iniciar seguimiento de selección con mouse
            _isSelecting = true;
            _selectionStartElement = _currentElement;
            _selectionStartPosition = GetCurrentCursorPosition();
            _selectionStartLineIndex = _currentLineIndex;
            _selectionStartElementIndex = CurrentLine?.IndexOf(_currentElement) ?? 0;

            if (_currentElement is MathText textElem)
            {
                textElem.ClearSelection();
            }
            EditorCanvas.CaptureMouse();
            DebugLog($"MOUSE: Started selection at line {_selectionStartLineIndex}, elem {_selectionStartElementIndex}, pos {_selectionStartPosition}");

            Focus();
            _cursorVisible = true;
            Render();
        }

        /// <summary>
        /// Actualiza el cursor cuando está sobre bloques externos clickeables
        /// </summary>
        private void UpdateCursorForExternalBlocks(Point pos)
        {
            bool overClickableArea = false;

            // IMPORTANTE: Usar el mismo offset que Render() y EditorCanvas_MouseDown
            double y = 4;  // Padding mínimo arriba (igual que Render)
            for (int lineIndex = 0; lineIndex < _lines.Count; lineIndex++)
            {
                var line = _lines[lineIndex];

                // Calcular altura de línea y baseline (igual que en Render y MouseDown)
                double maxBaseline = 0;
                double maxHeightBelowBaseline = 0;
                foreach (var elem in line)
                {
                    elem.Measure(_fontSize);
                    maxBaseline = Math.Max(maxBaseline, elem.Baseline);
                    maxHeightBelowBaseline = Math.Max(maxHeightBelowBaseline, elem.Height - elem.Baseline);
                }
                double maxHeight = Math.Max(_lineHeight, maxBaseline + maxHeightBelowBaseline);

                if (pos.Y >= y && pos.Y < y + maxHeight + 4)
                {
                    // Buscar si hay MathExternalBlock en esta línea
                    double x = 2;
                    foreach (var element in line)
                    {
                        element.Measure(_fontSize);

                        // IMPORTANTE: Establecer X, Y del elemento para hit testing correcto
                        // Para MathExternalBlock, usar Y = y directamente (sin ajuste de baseline)
                        double elementY;
                        if (element is MathExternalBlock)
                        {
                            elementY = y;
                        }
                        else
                        {
                            elementY = y + (maxBaseline - element.Baseline);
                        }
                        element.X = x;
                        element.Y = elementY;

                        if (element is MathExternalBlock externalBlock)
                        {
                            // Verificar si está sobre el header clickeable
                            if (externalBlock.IsClickOnHeader(pos.X, pos.Y, _fontSize))
                            {
                                overClickableArea = true;
                                break;
                            }
                        }
                        // NUEVO: Verificar MathExternalBlock dentro de MathColumns
                        else if (element is MathColumns mathColumns)
                        {
                            // Usar HitTest para encontrar el elemento bajo el cursor
                            var hitElement = mathColumns.HitTest(pos.X, pos.Y);
                            if (hitElement is MathExternalBlock externalBlockInColumns)
                            {
                                // Verificar si está sobre el header clickeable
                                if (externalBlockInColumns.IsClickOnHeader(pos.X, pos.Y, _fontSize))
                                {
                                    overClickableArea = true;
                                    break;
                                }
                            }
                        }
                        x += element.Width;
                    }
                    break;
                }
                y += maxHeight + 4;
            }

            // Cambiar cursor según si está sobre área clickeable
            EditorCanvas.Cursor = overClickableArea ? System.Windows.Input.Cursors.Hand : System.Windows.Input.Cursors.IBeam;
        }

        private void EditorCanvas_MouseMove(object sender, MouseEventArgs e)
        {
            var pos = e.GetPosition(EditorCanvas);

            // NUEVO: Cambiar cursor si está sobre un bloque externo clickeable
            if (e.LeftButton != MouseButtonState.Pressed)
            {
                UpdateCursorForExternalBlocks(pos);
            }

            if (!_isSelecting || e.LeftButton != MouseButtonState.Pressed)
                return;

            // Encontrar en qué línea y elemento está el mouse
            int targetLineIndex = -1;
            int targetElemIndex = -1;
            MathElement targetElement = null;

            double y = _lineHeight + 4;
            for (int lineIndex = 0; lineIndex < _lines.Count; lineIndex++)
            {
                var line = _lines[lineIndex];
                double maxBaseline = 0;
                double maxHeightBelowBaseline = 0;
                foreach (var elem in line)
                {
                    elem.Measure(_fontSize);
                    maxBaseline = Math.Max(maxBaseline, elem.Baseline);
                    maxHeightBelowBaseline = Math.Max(maxHeightBelowBaseline, elem.Height - elem.Baseline);
                }
                double maxHeight = Math.Max(_lineHeight, maxBaseline + maxHeightBelowBaseline);

                if (pos.Y >= y && pos.Y < y + maxHeight + 4)
                {
                    targetLineIndex = lineIndex;
                    double x = 2;
                    for (int elemIdx = 0; elemIdx < line.Count; elemIdx++)
                    {
                        var elem = line[elemIdx];
                        if (pos.X >= x && pos.X < x + elem.Width)
                        {
                            targetElemIndex = elemIdx;
                            targetElement = elem;
                            break;
                        }
                        x += elem.Width;
                    }
                    // Si no encontró elemento, usar el último
                    if (targetElemIndex < 0 && line.Count > 0)
                    {
                        targetElemIndex = pos.X < 2 ? 0 : line.Count - 1;
                        targetElement = line[targetElemIndex];
                    }
                    break;
                }
                y += maxHeight + 4;
            }

            // Si no encontró línea, usar la primera o última
            if (targetLineIndex < 0 && _lines.Count > 0)
            {
                targetLineIndex = pos.Y < _lineHeight ? 0 : _lines.Count - 1;
                var line = _lines[targetLineIndex];
                if (line.Count > 0)
                {
                    targetElemIndex = pos.X < 2 ? 0 : line.Count - 1;
                    targetElement = line[targetElemIndex];
                }
            }

            // Si no hay elemento válido, salir
            if (targetElement == null || targetLineIndex < 0 || targetElemIndex < 0)
                return;

            // Determinar si es selección de texto simple o multi-elemento
            if (targetLineIndex == _selectionStartLineIndex && targetElemIndex == _selectionStartElementIndex)
            {
                // Mismo elemento - selección de texto dentro del elemento
                ClearLineSelection();
                if (_currentElement is MathText textElem && _selectionStartElement is MathText)
                {
                    int newCursorPos = CalculateCursorPositionFromMouse(textElem, pos.X);
                    if (newCursorPos >= 0)
                    {
                        SetCurrentCursorPosition(newCursorPos);
                        textElem.SetSelection(_selectionStartPosition, newCursorPos);
                        DebugLog($"MOUSE MOVE: Text selection from {_selectionStartPosition} to {newCursorPos}");
                    }
                }
            }
            else
            {
                // Diferente elemento o línea - selección de múltiples elementos
                ClearLineSelection();

                // Determinar dirección de selección (puede ser en cualquier dirección)
                int startLine, endLine, startElem, endElem;

                bool forwardSelection = (targetLineIndex > _selectionStartLineIndex) ||
                                        (targetLineIndex == _selectionStartLineIndex && targetElemIndex >= _selectionStartElementIndex);

                if (forwardSelection)
                {
                    // Selección hacia adelante (izquierda a derecha, arriba a abajo)
                    startLine = _selectionStartLineIndex;
                    endLine = targetLineIndex;
                    startElem = _selectionStartElementIndex;
                    endElem = targetElemIndex;
                }
                else
                {
                    // Selección hacia atrás (derecha a izquierda, abajo a arriba)
                    startLine = targetLineIndex;
                    endLine = _selectionStartLineIndex;
                    startElem = targetElemIndex;
                    endElem = _selectionStartElementIndex;
                }

                _hasLineSelection = true;
                _lineSelectionStartLine = startLine;
                _lineSelectionEndLine = endLine;
                _lineSelectionStartElemIdx = startElem;
                _lineSelectionEndElemIdx = endElem;

                _selectedElements.Clear();
                // FIX: Validar que lineIdx no exceda el tamaño de _lines
                for (int lineIdx = startLine; lineIdx <= endLine && lineIdx < _lines.Count; lineIdx++)
                {
                    var line = _lines[lineIdx];
                    int fromElem, toElem;

                    if (startLine == endLine)
                    {
                        // Misma línea - usar los elementos ordenados
                        fromElem = startElem;
                        toElem = endElem;
                    }
                    else if (lineIdx == startLine)
                    {
                        // Primera línea - desde startElem hasta el final
                        fromElem = startElem;
                        toElem = line.Count - 1;
                    }
                    else if (lineIdx == endLine)
                    {
                        // Última línea - desde el inicio hasta endElem
                        fromElem = 0;
                        toElem = endElem;
                    }
                    else
                    {
                        // Línea intermedia - toda la línea
                        fromElem = 0;
                        toElem = line.Count - 1;
                    }

                    for (int elemIdx = fromElem; elemIdx <= toElem && elemIdx < line.Count; elemIdx++)
                    {
                        var elem = line[elemIdx];
                        elem.IsSelected = true;
                        _selectedElements.Add(elem);
                    }
                }

                DebugLog($"MOUSE MOVE: Multi-element selection ({(forwardSelection ? "forward" : "backward")}), {_selectedElements.Count} elements");
            }

            Render();
        }

        private void EditorCanvas_MouseUp(object sender, MouseButtonEventArgs e)
        {
            if (_isSelecting)
            {
                EditorCanvas.ReleaseMouseCapture();
                _isSelecting = false;

                // Si no hay selección de línea y no hay selección de texto, limpiar
                if (!_hasLineSelection && _currentElement is MathText textElem && !textElem.HasSelection)
                {
                    ClearAllSelections();
                }

                DebugLog($"MOUSE UP: Selection ended, hasLineSelection={_hasLineSelection}, selectedElements={_selectedElements.Count}");
                Render();
            }
        }

        /// <summary>
        /// Calcula la posición del cursor en un elemento de texto basándose en la posición X del mouse
        /// </summary>
        private int CalculateCursorPositionFromMouse(MathText textElem, double mouseX)
        {
            if (textElem == null) return 0;

            // Obtener la posición X del elemento
            double elementX = textElem.X;
            double relativeX = mouseX - elementX;

            if (relativeX < 0) return 0;

            // Calcular posición del cursor midiendo el texto
            string text = textElem.Text;
            if (string.IsNullOrEmpty(text)) return 0;

            var typeface = new Typeface(MathStyles.EquationFont, FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);

            for (int i = 0; i <= text.Length; i++)
            {
                string substr = System.Net.WebUtility.HtmlDecode(text.Substring(0, i));
                var formattedText = new FormattedText(
                    substr,
                    System.Globalization.CultureInfo.CurrentCulture,
                    FlowDirection.LeftToRight,
                    typeface,
                    _fontSize,
                    Brushes.Black,
                    GetDpiScale());

                if (formattedText.Width >= relativeX)
                {
                    // Decidir si ir antes o después del carácter
                    if (i > 0)
                    {
                        string prevSubstr = System.Net.WebUtility.HtmlDecode(text.Substring(0, i - 1));
                        var prevFormatted = new FormattedText(
                            prevSubstr,
                            System.Globalization.CultureInfo.CurrentCulture,
                            FlowDirection.LeftToRight,
                            typeface,
                            _fontSize,
                            Brushes.Black,
                            GetDpiScale());

                        double midPoint = (prevFormatted.Width + formattedText.Width) / 2;
                        if (relativeX < midPoint)
                            return i - 1;
                    }
                    return i;
                }
            }

            return text.Length;
        }

        #region Selección de Texto

        /// <summary>
        /// Selecciona una estructura completa (vector, matriz)
        /// </summary>
        private void SelectStructure(MathElement structure)
        {
            ClearAllSelections();
            ClearStructureSelection();

            _selectedStructure = structure;
            structure.IsSelected = true;
            Render();
            DebugLog($"SELECT STRUCTURE: {structure.GetType().Name}");
        }

        /// <summary>
        /// Extiende la selección para incluir el elemento especificado
        /// </summary>
        /// <param name="element">El elemento a incluir en la selección</param>
        /// <param name="forward">true si la selección se extiende hacia adelante (derecha), false si hacia atrás (izquierda)</param>
        private void ExtendSelectionToElement(MathElement element, bool forward)
        {
            if (element == null) return;

            var line = CurrentLine;
            if (line == null) return;

            int currentElemIdx = line.IndexOf(_currentElement);
            int targetElemIdx = line.IndexOf(element);
            if (currentElemIdx < 0 || targetElemIdx < 0) return;

            // Inicializar la selección de línea si no existe
            if (!_hasLineSelection)
            {
                _hasLineSelection = true;
                _lineSelectionStartLine = _currentLineIndex;
                _lineSelectionEndLine = _currentLineIndex;

                if (forward)
                {
                    _lineSelectionStartElemIdx = currentElemIdx;
                    _lineSelectionEndElemIdx = targetElemIdx;
                }
                else
                {
                    _lineSelectionStartElemIdx = targetElemIdx;
                    _lineSelectionEndElemIdx = currentElemIdx;
                }
            }
            else
            {
                // Extender la selección existente
                if (forward)
                {
                    _lineSelectionEndElemIdx = Math.Max(_lineSelectionEndElemIdx, targetElemIdx);
                }
                else
                {
                    _lineSelectionStartElemIdx = Math.Min(_lineSelectionStartElemIdx, targetElemIdx);
                }
            }

            // Marcar todos los elementos en el rango como seleccionados
            _selectedElements.Clear();
            int fromIdx = Math.Min(_lineSelectionStartElemIdx, _lineSelectionEndElemIdx);
            int toIdx = Math.Max(_lineSelectionStartElemIdx, _lineSelectionEndElemIdx);

            for (int i = fromIdx; i <= toIdx && i < line.Count; i++)
            {
                line[i].IsSelected = true;
                _selectedElements.Add(line[i]);
            }

            Render();
            DebugLog($"EXTEND SELECTION: from {fromIdx} to {toIdx}, {_selectedElements.Count} elements");
        }

        /// <summary>
        /// Maneja Shift+Left para selección continua
        /// </summary>
        private void HandleShiftLeftSelection(int cursorPos)
        {
            if (!(_currentElement is MathText textElem)) return;

            var line = CurrentLine;
            if (line == null || line.Count == 0) return;

            // Encontrar el índice real del elemento en la línea (considerando estructuras)
            int elemIdx = FindElementIndexInLine(_currentElement, line);

            // Iniciar selección si no hay una activa
            if (_selectionStartPosition < 0)
            {
                _selectionStartPosition = cursorPos;
                _selectionStartElement = _currentElement;
                _selectionStartLineIndex = _currentLineIndex;
                _selectionStartElementIndex = elemIdx;
                DebugLog($"SHIFT+LEFT: Started selection at pos {cursorPos}, elemIdx={elemIdx}");
            }

            // Si estamos dentro de una estructura (vector/matriz), saltar al elemento anterior
            if (_currentElement.Parent is MathVector || _currentElement.Parent is MathMatrix)
            {
                // Seleccionar la estructura completa y mover al elemento anterior
                int structIdx = line.IndexOf(_currentElement.Parent);
                if (structIdx > 0)
                {
                    var prevElem = line[structIdx - 1];
                    _currentElement = GetLastEditableElement(prevElem);
                    if (_currentElement is MathText pt)
                        SetCurrentCursorPosition(pt.Text.Length);

                    // Actualizar rango de selección
                    _hasLineSelection = true;
                    _lineSelectionStartLine = _currentLineIndex;
                    _lineSelectionEndLine = _currentLineIndex;
                    int currentIdx = FindElementIndexInLine(_currentElement, line);
                    _lineSelectionStartElemIdx = Math.Min(currentIdx, _selectionStartElementIndex);
                    _lineSelectionEndElemIdx = Math.Max(currentIdx, _selectionStartElementIndex);

                    // Marcar elementos seleccionados
                    _selectedElements.Clear();
                    for (int i = _lineSelectionStartElemIdx; i <= _lineSelectionEndElemIdx && i < line.Count; i++)
                    {
                        line[i].IsSelected = true;
                        _selectedElements.Add(line[i]);
                    }
                    Render();
                    DebugLog($"SHIFT+LEFT: Jumped out of structure, selection from {_lineSelectionStartElemIdx} to {_lineSelectionEndElemIdx}");
                }
                return;
            }

            // Si podemos movernos hacia la izquierda dentro del texto
            if (cursorPos > 0)
            {
                SetCurrentCursorPosition(cursorPos - 1);

                // Si seguimos en el mismo elemento, actualizar selección de texto
                if (_currentElement == _selectionStartElement)
                {
                    textElem.SetSelection(_selectionStartPosition, cursorPos - 1);
                    DebugLog($"SHIFT+LEFT: Text selection from {_selectionStartPosition} to {cursorPos - 1}");
                }
                else
                {
                    // Cambió el elemento, actualizar selección de línea
                    UpdateContinuousSelection();
                }
            }
            else
            {
                // Estamos al inicio del texto actual - ir al elemento anterior
                if (elemIdx > 0)
                {
                    var prevElem = line[elemIdx - 1];
                    _currentElement = GetLastEditableElement(prevElem);
                    if (_currentElement is MathText pt)
                        SetCurrentCursorPosition(pt.Text.Length);
                    UpdateContinuousSelection();
                    Render();
                }
                else
                {
                    DebugLog($"SHIFT+LEFT: At line start, cannot extend further");
                }
            }
        }

        /// <summary>
        /// Navega al elemento anterior manteniendo la selección
        /// </summary>
        private bool NavigateToPreviousElementWithSelection()
        {
            var line = CurrentLine;
            if (line == null || line.Count == 0) return false;

            // Si estamos dentro de un vector, intentar ir a la celda anterior
            if (_currentElement?.Parent is MathVector vector)
            {
                int cellIdx = vector.Elements.IndexOf(_currentElement);
                if (cellIdx > 0)
                {
                    // Ir a la celda anterior
                    _currentElement = vector.Elements[cellIdx - 1];
                    if (_currentElement is MathText prevText)
                    {
                        SetCurrentCursorPosition(prevText.Text.Length);
                    }
                    UpdateContinuousSelection();
                    Render();
                    return true;
                }
                else
                {
                    // Salir del vector hacia el elemento anterior
                    int vectorIdx = line.IndexOf(vector);
                    if (vectorIdx > 0)
                    {
                        var prevElem = line[vectorIdx - 1];
                        _currentElement = GetLastEditableElement(prevElem);
                        if (_currentElement is MathText prevText)
                        {
                            SetCurrentCursorPosition(prevText.Text.Length);
                        }
                        UpdateContinuousSelection();
                        Render();
                        return true;
                    }
                }
            }
            else if (_currentElement?.Parent is MathMatrix matrix)
            {
                // Encontrar la celda actual en la matriz (buscar en todas las filas)
                int rowIdx = -1, colIdx = -1;
                for (int r = 0; r < matrix.Cells.Count && rowIdx < 0; r++)
                {
                    for (int c = 0; c < matrix.Cells[r].Count; c++)
                    {
                        if (matrix.Cells[r][c] == _currentElement)
                        {
                            rowIdx = r;
                            colIdx = c;
                            break;
                        }
                    }
                }

                if (rowIdx >= 0 && colIdx >= 0)
                {
                    // Calcular celda anterior (moverse por columnas, luego por filas)
                    if (colIdx > 0)
                    {
                        _currentElement = matrix.Cells[rowIdx][colIdx - 1];
                    }
                    else if (rowIdx > 0)
                    {
                        _currentElement = matrix.Cells[rowIdx - 1][matrix.Cells[rowIdx - 1].Count - 1];
                    }
                    else
                    {
                        // Salir de la matriz hacia el elemento anterior
                        int matrixIdx = line.IndexOf(matrix);
                        if (matrixIdx > 0)
                        {
                            var prevElem = line[matrixIdx - 1];
                            _currentElement = GetLastEditableElement(prevElem);
                        }
                        else
                        {
                            return false;
                        }
                    }

                    if (_currentElement is MathText prevText)
                    {
                        SetCurrentCursorPosition(prevText.Text.Length);
                    }
                    UpdateContinuousSelection();
                    Render();
                    return true;
                }
            }
            else
            {
                // No estamos en vector/matriz - buscar elemento anterior en la línea
                int elemIdx = line.IndexOf(_currentElement);
                if (elemIdx > 0)
                {
                    var prevElem = line[elemIdx - 1];
                    _currentElement = GetLastEditableElement(prevElem);
                    if (_currentElement is MathText prevText)
                    {
                        SetCurrentCursorPosition(prevText.Text.Length);
                    }
                    UpdateContinuousSelection();
                    Render();
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Obtiene el último elemento editable de una estructura
        /// </summary>
        private MathElement GetLastEditableElement(MathElement elem)
        {
            if (elem is MathVector vector && vector.Elements.Count > 0)
            {
                return vector.Elements[vector.Elements.Count - 1];
            }
            else if (elem is MathMatrix matrix && matrix.Cells.Count > 0)
            {
                // Última celda de la última fila
                var lastRow = matrix.Cells[matrix.Cells.Count - 1];
                if (lastRow.Count > 0)
                    return lastRow[lastRow.Count - 1];
            }
            return elem;
        }

        /// <summary>
        /// Obtiene el primer elemento editable de una estructura
        /// </summary>
        private MathElement GetFirstEditableElement(MathElement elem)
        {
            if (elem is MathVector vector && vector.Elements.Count > 0)
            {
                return vector.Elements[0];
            }
            else if (elem is MathMatrix matrix && matrix.Cells.Count > 0 && matrix.Cells[0].Count > 0)
            {
                return matrix.Cells[0][0];
            }
            return elem;
        }

        /// <summary>
        /// Encuentra el índice de un elemento en la línea, considerando que puede estar dentro de una estructura
        /// </summary>
        private int FindElementIndexInLine(MathElement elem, List<MathElement> line)
        {
            // Si el elemento está directamente en la línea
            int idx = line.IndexOf(elem);
            if (idx >= 0) return idx;

            // Si está dentro de una estructura, buscar la estructura padre
            if (elem.Parent != null)
            {
                return line.IndexOf(elem.Parent);
            }

            return -1;
        }

        /// <summary>
        /// Actualiza la selección continua basada en la posición actual del cursor
        /// </summary>
        private void UpdateContinuousSelection()
        {
            var line = CurrentLine;
            if (line == null || line.Count == 0) return;

            // Limpiar selecciones de texto anteriores
            foreach (var elem in line)
            {
                if (elem is MathText t) t.ClearSelection();
                if (elem is MathVector v)
                {
                    foreach (var c in v.Elements)
                        if (c is MathText ct) ct.ClearSelection();
                }
                if (elem is MathMatrix m)
                {
                    foreach (var row in m.Cells)
                        foreach (var c in row)
                            if (c is MathText ct) ct.ClearSelection();
                }
            }

            // Encontrar índices de inicio y actual
            int startIdx = FindElementIndexInLine(_selectionStartElement, line);
            int currentIdx = FindElementIndexInLine(_currentElement, line);

            if (startIdx < 0 || currentIdx < 0) return;

            // Configurar selección de línea
            _hasLineSelection = true;
            _lineSelectionStartLine = _currentLineIndex;
            _lineSelectionEndLine = _currentLineIndex;
            _lineSelectionStartElemIdx = Math.Min(startIdx, currentIdx);
            _lineSelectionEndElemIdx = Math.Max(startIdx, currentIdx);

            // Marcar elementos como seleccionados
            _selectedElements.Clear();
            for (int i = _lineSelectionStartElemIdx; i <= _lineSelectionEndElemIdx && i < line.Count; i++)
            {
                line[i].IsSelected = true;
                _selectedElements.Add(line[i]);
            }

            DebugLog($"CONTINUOUS SELECTION: from {_lineSelectionStartElemIdx} to {_lineSelectionEndElemIdx}");
        }

        /// <summary>
        /// Extiende la selección hacia la izquierda al elemento anterior
        /// </summary>
        private void ExtendSelectionLeft(int currentElemIdx)
        {
            var line = CurrentLine;
            if (line == null || line.Count == 0 || currentElemIdx <= 0 || currentElemIdx > line.Count) return;

            var prevElem = line[currentElemIdx - 1];

            // Inicializar la selección de línea si no existe
            if (!_hasLineSelection)
            {
                _hasLineSelection = true;
                _lineSelectionStartLine = _currentLineIndex;
                _lineSelectionEndLine = _currentLineIndex;
                _lineSelectionStartElemIdx = currentElemIdx - 1;
                _lineSelectionEndElemIdx = _selectionStartElementIndex >= 0 ? _selectionStartElementIndex : currentElemIdx;
            }
            else
            {
                // Extender hacia la izquierda
                _lineSelectionStartElemIdx = Math.Min(_lineSelectionStartElemIdx, currentElemIdx - 1);
            }

            // Marcar elementos en el rango como seleccionados
            UpdateLineSelection();

            // Mover el cursor al inicio del elemento anterior
            _currentElement = prevElem;
            if (prevElem is MathText prevText)
            {
                SetCurrentCursorPosition(prevText.Text.Length);
            }

            Render();
            DebugLog($"SHIFT+LEFT: Extended to element {currentElemIdx - 1}");
        }

        /// <summary>
        /// Actualiza la selección de elementos en la línea
        /// </summary>
        private void UpdateLineSelection()
        {
            var line = CurrentLine;
            if (line == null || line.Count == 0) return;

            // Limpiar selecciones anteriores
            foreach (var elem in _selectedElements)
            {
                elem.IsSelected = false;
            }
            _selectedElements.Clear();

            // Marcar elementos en el rango
            int fromIdx = Math.Max(0, Math.Min(_lineSelectionStartElemIdx, _lineSelectionEndElemIdx));
            int toIdx = Math.Min(line.Count - 1, Math.Max(_lineSelectionStartElemIdx, _lineSelectionEndElemIdx));

            for (int i = fromIdx; i <= toIdx && i < line.Count; i++)
            {
                line[i].IsSelected = true;
                _selectedElements.Add(line[i]);
            }
        }

        /// <summary>
        /// Maneja Shift+Right para selección continua
        /// </summary>
        private void HandleShiftRightSelection(int cursorPos, int textLength)
        {
            if (!(_currentElement is MathText textElem)) return;

            var line = CurrentLine;
            if (line == null || line.Count == 0) return;

            // Encontrar el índice real del elemento en la línea (considerando estructuras)
            int elemIdx = FindElementIndexInLine(_currentElement, line);

            // Iniciar selección si no hay una activa
            if (_selectionStartPosition < 0)
            {
                _selectionStartPosition = cursorPos;
                _selectionStartElement = _currentElement;
                _selectionStartLineIndex = _currentLineIndex;
                _selectionStartElementIndex = elemIdx;
                DebugLog($"SHIFT+RIGHT: Started selection at pos {cursorPos}, elemIdx={elemIdx}");
            }

            // Si estamos dentro de una estructura (vector/matriz), saltar al elemento siguiente
            if (_currentElement.Parent is MathVector || _currentElement.Parent is MathMatrix)
            {
                // Seleccionar la estructura completa y mover al elemento siguiente
                int structIdx = line.IndexOf(_currentElement.Parent);
                if (structIdx >= 0 && structIdx < line.Count - 1)
                {
                    var nextElem = line[structIdx + 1];
                    _currentElement = GetFirstEditableElement(nextElem);
                    SetCurrentCursorPosition(0);

                    // Actualizar rango de selección
                    _hasLineSelection = true;
                    _lineSelectionStartLine = _currentLineIndex;
                    _lineSelectionEndLine = _currentLineIndex;
                    int currentIdx = FindElementIndexInLine(_currentElement, line);
                    _lineSelectionStartElemIdx = Math.Min(currentIdx, _selectionStartElementIndex);
                    _lineSelectionEndElemIdx = Math.Max(currentIdx, _selectionStartElementIndex);

                    // Marcar elementos seleccionados
                    _selectedElements.Clear();
                    for (int i = _lineSelectionStartElemIdx; i <= _lineSelectionEndElemIdx && i < line.Count; i++)
                    {
                        line[i].IsSelected = true;
                        _selectedElements.Add(line[i]);
                    }
                    Render();
                    DebugLog($"SHIFT+RIGHT: Jumped out of structure, selection from {_lineSelectionStartElemIdx} to {_lineSelectionEndElemIdx}");
                }
                return;
            }

            // Si podemos movernos hacia la derecha dentro del texto
            if (cursorPos < textLength)
            {
                SetCurrentCursorPosition(cursorPos + 1);

                // Si seguimos en el mismo elemento, actualizar selección de texto
                if (_currentElement == _selectionStartElement)
                {
                    textElem.SetSelection(_selectionStartPosition, cursorPos + 1);
                    DebugLog($"SHIFT+RIGHT: Text selection from {_selectionStartPosition} to {cursorPos + 1}");
                }
                else
                {
                    // Cambió el elemento, actualizar selección de línea
                    UpdateContinuousSelection();
                }
            }
            else
            {
                // Estamos al final del texto actual - ir al elemento siguiente
                if (elemIdx < line.Count - 1)
                {
                    var nextElem = line[elemIdx + 1];
                    _currentElement = GetFirstEditableElement(nextElem);
                    SetCurrentCursorPosition(0);
                    UpdateContinuousSelection();
                    Render();
                }
                else
                {
                    DebugLog($"SHIFT+RIGHT: At line end, cannot extend further");
                }
            }
        }

        /// <summary>
        /// Navega al elemento siguiente manteniendo la selección
        /// </summary>
        private bool NavigateToNextElementWithSelection()
        {
            var line = CurrentLine;
            if (line == null || line.Count == 0) return false;

            // Si estamos dentro de un vector, intentar ir a la celda siguiente
            if (_currentElement?.Parent is MathVector vector)
            {
                int cellIdx = vector.Elements.IndexOf(_currentElement);
                if (cellIdx >= 0 && cellIdx < vector.Elements.Count - 1)
                {
                    // Ir a la celda siguiente
                    _currentElement = vector.Elements[cellIdx + 1];
                    SetCurrentCursorPosition(0);
                    UpdateContinuousSelection();
                    Render();
                    return true;
                }
                else
                {
                    // Salir del vector hacia el elemento siguiente
                    int vectorIdx = line.IndexOf(vector);
                    if (vectorIdx >= 0 && vectorIdx < line.Count - 1)
                    {
                        var nextElem = line[vectorIdx + 1];
                        _currentElement = GetFirstEditableElement(nextElem);
                        SetCurrentCursorPosition(0);
                        UpdateContinuousSelection();
                        Render();
                        return true;
                    }
                }
            }
            else if (_currentElement?.Parent is MathMatrix matrix)
            {
                // Encontrar la celda actual en la matriz (buscar en todas las filas)
                int rowIdx = -1, colIdx = -1;
                for (int r = 0; r < matrix.Cells.Count && rowIdx < 0; r++)
                {
                    for (int c = 0; c < matrix.Cells[r].Count; c++)
                    {
                        if (matrix.Cells[r][c] == _currentElement)
                        {
                            rowIdx = r;
                            colIdx = c;
                            break;
                        }
                    }
                }

                if (rowIdx >= 0 && colIdx >= 0)
                {
                    // Calcular celda siguiente (moverse por columnas, luego por filas)
                    if (colIdx < matrix.Cells[rowIdx].Count - 1)
                    {
                        _currentElement = matrix.Cells[rowIdx][colIdx + 1];
                    }
                    else if (rowIdx < matrix.Cells.Count - 1)
                    {
                        _currentElement = matrix.Cells[rowIdx + 1][0];
                    }
                    else
                    {
                        // Salir de la matriz hacia el elemento siguiente
                        int matrixIdx = line.IndexOf(matrix);
                        if (matrixIdx >= 0 && matrixIdx < line.Count - 1)
                        {
                            var nextElem = line[matrixIdx + 1];
                            _currentElement = GetFirstEditableElement(nextElem);
                        }
                        else
                        {
                            return false;
                        }
                    }

                    SetCurrentCursorPosition(0);
                    UpdateContinuousSelection();
                    Render();
                    return true;
                }
            }
            else
            {
                // No estamos en vector/matriz - buscar elemento siguiente en la línea
                int elemIdx = line.IndexOf(_currentElement);
                if (elemIdx >= 0 && elemIdx < line.Count - 1)
                {
                    var nextElem = line[elemIdx + 1];
                    _currentElement = GetFirstEditableElement(nextElem);
                    SetCurrentCursorPosition(0);
                    UpdateContinuousSelection();
                    Render();
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Extiende la selección hacia la derecha al elemento siguiente
        /// </summary>
        private void ExtendSelectionRight(int currentElemIdx)
        {
            var line = CurrentLine;
            if (line == null || line.Count == 0 || currentElemIdx < 0 || currentElemIdx >= line.Count - 1) return;

            var nextElem = line[currentElemIdx + 1];

            // Inicializar la selección de línea si no existe
            if (!_hasLineSelection)
            {
                _hasLineSelection = true;
                _lineSelectionStartLine = _currentLineIndex;
                _lineSelectionEndLine = _currentLineIndex;
                _lineSelectionStartElemIdx = _selectionStartElementIndex >= 0 ? _selectionStartElementIndex : currentElemIdx;
                _lineSelectionEndElemIdx = currentElemIdx + 1;
            }
            else
            {
                // Extender hacia la derecha
                _lineSelectionEndElemIdx = Math.Max(_lineSelectionEndElemIdx, currentElemIdx + 1);
            }

            // Marcar elementos en el rango como seleccionados
            UpdateLineSelection();

            // Mover el cursor al inicio del elemento siguiente
            _currentElement = nextElem;
            SetCurrentCursorPosition(0);

            Render();
            DebugLog($"SHIFT+RIGHT: Extended to element {currentElemIdx + 1}");
        }

        /// <summary>
        /// Limpia la selección de estructura
        /// </summary>
        private void ClearStructureSelection()
        {
            if (_selectedStructure != null)
            {
                _selectedStructure.IsSelected = false;
                _selectedStructure = null;
            }
        }

        /// <summary>
        /// Elimina la estructura seleccionada
        /// </summary>
        private void DeleteSelectedStructure()
        {
            if (_selectedStructure == null) return;

            // Encontrar la línea que contiene la estructura
            for (int lineIdx = 0; lineIdx < _lines.Count; lineIdx++)
            {
                var line = _lines[lineIdx];
                int elemIdx = line.IndexOf(_selectedStructure);
                if (elemIdx >= 0)
                {
                    // Encontrar el elemento anterior o siguiente para mover el cursor
                    MathElement newCurrentElement = null;

                    if (elemIdx > 0)
                    {
                        // Hay elemento anterior
                        var prevElem = line[elemIdx - 1];
                        newCurrentElement = FindLastEditableElement(prevElem) ?? prevElem;
                    }
                    else if (elemIdx < line.Count - 1)
                    {
                        // Hay elemento siguiente
                        var nextElem = line[elemIdx + 1];
                        newCurrentElement = FindFirstEditableElement(nextElem) ?? nextElem;
                    }
                    else
                    {
                        // Es el único elemento - crear uno nuevo vacío
                        var newText = new MathText();
                        line.Add(newText);
                        newCurrentElement = newText;
                    }

                    // Eliminar la estructura
                    line.Remove(_selectedStructure);
                    _selectedStructure = null;

                    // Establecer nuevo elemento actual
                    if (_currentElement != null)
                        _currentElement.IsCursorHere = false;
                    _currentElement = newCurrentElement;
                    if (_currentElement != null)
                    {
                        _currentElement.IsCursorHere = true;
                        SetCursorOnElement(_currentElement);
                    }
                    _currentLineIndex = lineIdx;

                    Render();
                    OnContentChanged();
                    DebugLog($"DELETE STRUCTURE: Deleted and moved to {_currentElement?.GetType().Name}");
                    return;
                }
            }
        }

        /// <summary>
        /// Selecciona todos los elementos de todas las líneas (Ctrl+A)
        /// </summary>
        private void SelectAll()
        {
            ClearAllSelections();

            _hasLineSelection = true;
            _lineSelectionStartLine = 0;
            _lineSelectionEndLine = _lines.Count - 1;
            _lineSelectionStartElemIdx = 0;
            _lineSelectionEndElemIdx = _lines[_lines.Count - 1].Count - 1;

            _selectedElements.Clear();
            foreach (var line in _lines)
            {
                foreach (var elem in line)
                {
                    elem.IsSelected = true;
                    _selectedElements.Add(elem);
                }
            }

            Render();
            DebugLog($"SELECT ALL: {_selectedElements.Count} elements selected");
        }

        /// <summary>
        /// Selecciona desde el cursor hasta el inicio de la línea (Shift+Home)
        /// </summary>
        private void SelectToLineStart()
        {
            ClearLineSelection();

            var line = CurrentLine;
            if (line == null) return;

            int currentElemIdx = line.IndexOf(_currentElement);
            if (currentElemIdx < 0) return;

            _hasLineSelection = true;
            _lineSelectionStartLine = _currentLineIndex;
            _lineSelectionEndLine = _currentLineIndex;
            _lineSelectionStartElemIdx = 0;
            _lineSelectionEndElemIdx = currentElemIdx;

            _selectedElements.Clear();
            for (int i = 0; i <= currentElemIdx; i++)
            {
                line[i].IsSelected = true;
                _selectedElements.Add(line[i]);
            }

            Render();
            DebugLog($"SELECT TO START: {_selectedElements.Count} elements");
        }

        /// <summary>
        /// Selecciona desde el cursor hasta el final de la línea (Shift+End)
        /// </summary>
        private void SelectToLineEnd()
        {
            ClearLineSelection();

            var line = CurrentLine;
            if (line == null) return;

            int currentElemIdx = line.IndexOf(_currentElement);
            if (currentElemIdx < 0) return;

            _hasLineSelection = true;
            _lineSelectionStartLine = _currentLineIndex;
            _lineSelectionEndLine = _currentLineIndex;
            _lineSelectionStartElemIdx = currentElemIdx;
            _lineSelectionEndElemIdx = line.Count - 1;

            _selectedElements.Clear();
            for (int i = currentElemIdx; i < line.Count; i++)
            {
                line[i].IsSelected = true;
                _selectedElements.Add(line[i]);
            }

            Render();
            DebugLog($"SELECT TO END: {_selectedElements.Count} elements");
        }

        /// <summary>
        /// Selecciona una línea completa
        /// </summary>
        private void SelectLine(int lineIndex)
        {
            if (lineIndex < 0 || lineIndex >= _lines.Count) return;

            ClearLineSelection();

            var line = _lines[lineIndex];
            _hasLineSelection = true;
            _lineSelectionStartLine = lineIndex;
            _lineSelectionEndLine = lineIndex;
            _lineSelectionStartElemIdx = 0;
            _lineSelectionEndElemIdx = line.Count - 1;

            _selectedElements.Clear();
            foreach (var elem in line)
            {
                elem.IsSelected = true;
                _selectedElements.Add(elem);
            }

            Render();
            DebugLog($"SELECT LINE {lineIndex}: {_selectedElements.Count} elements");
        }

        /// <summary>
        /// Limpia la selección de línea/múltiples elementos
        /// </summary>
        private void ClearLineSelection()
        {
            foreach (var elem in _selectedElements)
            {
                elem.IsSelected = false;
            }
            _selectedElements.Clear();
            _hasLineSelection = false;
            _lineSelectionStartLine = -1;
            _lineSelectionEndLine = -1;
            _lineSelectionStartElemIdx = -1;
            _lineSelectionEndElemIdx = -1;
        }

        /// <summary>
        /// Elimina todos los elementos seleccionados
        /// </summary>
        private void DeleteSelectedElements()
        {
            if (!_hasLineSelection || _selectedElements.Count == 0) return;

            // Si está todo seleccionado, limpiar y dejar una línea vacía
            if (_lineSelectionStartLine == 0 && _lineSelectionEndLine == _lines.Count - 1 &&
                _lineSelectionStartElemIdx == 0 && _lineSelectionEndElemIdx == _lines[_lines.Count - 1].Count - 1)
            {
                _lines.Clear();
                var newLine = new List<MathElement>();
                var newText = new MathText();
                newText.IsCursorHere = true;
                newLine.Add(newText);
                _lines.Add(newLine);
                _currentElement = newText;
                _currentLineIndex = 0;
                ClearLineSelection();
                Render();
                OnContentChanged();
                return;
            }

            // Eliminar elementos seleccionados
            for (int lineIdx = _lineSelectionEndLine; lineIdx >= _lineSelectionStartLine; lineIdx--)
            {
                var line = _lines[lineIdx];
                int startIdx = (lineIdx == _lineSelectionStartLine) ? _lineSelectionStartElemIdx : 0;
                int endIdx = (lineIdx == _lineSelectionEndLine) ? _lineSelectionEndElemIdx : line.Count - 1;

                for (int i = endIdx; i >= startIdx; i--)
                {
                    if (i < line.Count)
                        line.RemoveAt(i);
                }

                // Si la línea quedó vacía y no es la única, eliminarla
                if (line.Count == 0 && _lines.Count > 1)
                {
                    _lines.RemoveAt(lineIdx);
                }
            }

            // Asegurar que haya al menos una línea con un elemento
            if (_lines.Count == 0)
            {
                var newLine = new List<MathElement>();
                var newText = new MathText();
                newLine.Add(newText);
                _lines.Add(newLine);
            }

            foreach (var line in _lines)
            {
                if (line.Count == 0)
                {
                    var newText = new MathText();
                    line.Add(newText);
                }
            }

            // Posicionar cursor
            _currentLineIndex = Math.Min(_lineSelectionStartLine, _lines.Count - 1);
            var currentLine = _lines[_currentLineIndex];
            int elemIdx = Math.Min(_lineSelectionStartElemIdx, currentLine.Count - 1);
            if (elemIdx < 0) elemIdx = 0;

            if (_currentElement != null)
                _currentElement.IsCursorHere = false;
            _currentElement = currentLine[elemIdx];
            _currentElement.IsCursorHere = true;
            SetCursorPositionOnElement(_currentElement, 0);

            ClearLineSelection();
            Render();
            OnContentChanged();
            DebugLog($"DELETE SELECTED: Done, now at line {_currentLineIndex}");
        }

        /// <summary>
        /// Limpia todas las selecciones de texto y resetea el estado de selección
        /// </summary>
        private void ClearAllSelections()
        {
            _selectionStartPosition = -1;
            _selectionStartElement = null;
            _isSelecting = false;

            // También limpiar selección de estructura
            ClearStructureSelection();

            // Limpiar selección de línea
            ClearLineSelection();

            // Limpiar selección en todos los elementos de todas las líneas
            foreach (var line in _lines)
            {
                foreach (var elem in line)
                {
                    if (elem is MathText textElem)
                    {
                        textElem.ClearSelection();
                    }
                    // Para elementos compuestos, limpiar sus hijos
                    ClearSelectionInElement(elem);
                }
            }
        }

        /// <summary>
        /// Limpia la selección recursivamente en elementos compuestos
        /// </summary>
        private void ClearSelectionInElement(MathElement elem)
        {
            if (elem is MathMatrix matrix)
            {
                for (int i = 0; i < matrix.Rows; i++)
                {
                    for (int j = 0; j < matrix.Cols; j++)
                    {
                        var cell = matrix.GetCell(i, j);
                        if (cell is MathText t) t.ClearSelection();
                        else ClearSelectionInElement(cell);
                    }
                }
            }
            else if (elem is MathVector vector)
            {
                for (int i = 0; i < vector.Length; i++)
                {
                    var cell = vector.GetElement(i);
                    if (cell is MathText t) t.ClearSelection();
                    else ClearSelectionInElement(cell);
                }
            }
            else if (elem is MathFraction frac)
            {
                if (frac.Numerator is MathText nt) nt.ClearSelection();
                else ClearSelectionInElement(frac.Numerator);
                if (frac.Denominator is MathText dt) dt.ClearSelection();
                else ClearSelectionInElement(frac.Denominator);
            }
            else if (elem is MathRoot root)
            {
                if (root.Index is MathText it) it.ClearSelection();
                else ClearSelectionInElement(root.Index);
                if (root.Radicand is MathText rt) rt.ClearSelection();
                else ClearSelectionInElement(root.Radicand);
            }
            else if (elem is MathPower power)
            {
                if (power.Base is MathText bt) bt.ClearSelection();
                else ClearSelectionInElement(power.Base);
                if (power.Exponent is MathText et) et.ClearSelection();
                else ClearSelectionInElement(power.Exponent);
            }
            else if (elem is MathSubscript subscript)
            {
                if (subscript.Base is MathText bt) bt.ClearSelection();
                else ClearSelectionInElement(subscript.Base);
                if (subscript.Subscript is MathText st) st.ClearSelection();
                else ClearSelectionInElement(subscript.Subscript);
            }
        }

        /// <summary>
        /// Obtiene el texto seleccionado del elemento actual
        /// </summary>
        public string GetSelectedText()
        {
            if (_currentElement is MathText textElem && textElem.HasSelection)
            {
                return textElem.GetSelectedText();
            }
            return "";
        }

        /// <summary>
        /// Elimina el texto seleccionado del elemento actual
        /// </summary>
        private void DeleteSelectedText()
        {
            if (_currentElement is MathText textElem && textElem.HasSelection)
            {
                textElem.DeleteSelection();
                ClearAllSelections();
                Render();
                OnContentChanged();
            }
        }

        #endregion

        #region Inserción de Elementos

        /// <summary>
        /// Inserta &nbsp; en el elemento actual (funciona en MathComment y MathText)
        /// </summary>
        private void InsertNbsp()
        {
            if (_currentElement is MathComment comment)
            {
                // Insertar &nbsp; en MathComment
                comment.Text = comment.Text.Insert(comment.CursorPosition, "&nbsp;");
                comment.CursorPosition += 6;
                Render();
                OnContentChanged();
            }
            else if (_currentElement is MathText textElement)
            {
                // En MathText: crear un comentario con &nbsp;
                int currentIndex = CurrentLine.IndexOf(textElement);
                if (currentIndex < 0) return;

                // Guardar si el MathText original estaba vacío
                bool wasEmpty = string.IsNullOrEmpty(textElement.Text);
                int originalIndex = currentIndex;

                // Dividir texto si hay contenido
                string textBefore = textElement.Text.Substring(0, textElement.CursorPosition);
                string textAfter = textElement.Text.Substring(textElement.CursorPosition);

                // Actualizar el elemento actual con el texto antes del cursor
                textElement.Text = textBefore;
                textElement.IsCursorHere = false;

                // Crear comentario con &nbsp;
                var nbspComment = new MathComment("&nbsp;");
                nbspComment.IsClosed = true;
                CurrentLine.Insert(currentIndex + 1, nbspComment);

                // Crear nuevo MathText para el texto después
                var afterText = new MathText(textAfter);
                afterText.CursorPosition = 0;
                afterText.IsCursorHere = true;
                CurrentLine.Insert(currentIndex + 2, afterText);
                _currentElement = afterText;

                // Si el MathText original estaba vacío, eliminarlo
                if (wasEmpty && originalIndex >= 0 && originalIndex < CurrentLine.Count)
                {
                    var origElement = CurrentLine[originalIndex];
                    if (origElement is MathText mt && string.IsNullOrEmpty(mt.Text))
                    {
                        CurrentLine.RemoveAt(originalIndex);
                    }
                }

                Render();
                OnContentChanged();
            }
        }

        private void InsertRoot()
        {
            var root = new MathRoot();
            InsertElement(root);

            _currentElement.IsCursorHere = false;
            _currentElement = root.Radicand;
            if (_currentElement is MathText mt)
                mt.IsCursorHere = true;

            Render();
            OnContentChanged();
        }

        private void InsertElement(MathElement element)
        {
            int index = CurrentLine.IndexOf(_currentElement);
            if (index < 0) index = CurrentLine.Count - 1;

            if (_currentElement is MathText mt && string.IsNullOrEmpty(mt.Text))
            {
                CurrentLine[index] = element;
            }
            else
            {
                CurrentLine.Insert(index + 1, element);
            }
        }

        /// <summary>
        /// Inserta texto en la posición actual del cursor
        /// </summary>
        public void InsertText(string text)
        {
            if (string.IsNullOrEmpty(text)) return;

            var textElement = _currentElement as MathText;
            if (textElement == null)
            {
                textElement = new MathText();
                int index = CurrentLine.Count > 0 ? CurrentLine.IndexOf(_currentElement) + 1 : 0;
                if (index < 0) index = 0;
                CurrentLine.Insert(index, textElement);
                _currentElement = textElement;
                textElement.IsCursorHere = true;
            }

            foreach (char c in text)
            {
                // Manejar caracteres especiales
                if (c == '/')
                {
                    CreateFractionFromPrevious(textElement);
                    textElement = _currentElement as MathText;
                    continue;
                }
                if (c == '^')
                {
                    CreatePowerFromPrevious(textElement);
                    textElement = _currentElement as MathText;
                    continue;
                }
                if (c == '_')
                {
                    CreateSubscriptFromPrevious(textElement);
                    textElement = _currentElement as MathText;
                    continue;
                }

                if (textElement != null)
                    textElement.InsertChar(c);
            }

            _cursorVisible = true;
            Render();
            OnContentChanged();
        }

        public void InsertIntegral(bool withLimits = false)
        {
            var integral = new MathIntegral(withLimits);
            InsertElement(integral);

            _currentElement.IsCursorHere = false;
            _currentElement = integral.Integrand;
            if (_currentElement is MathText mt)
                mt.IsCursorHere = true;

            Render();
            OnContentChanged();
        }

        public void InsertDerivative(int order = 1)
        {
            var derivative = new MathDerivative(order);
            InsertElement(derivative);

            _currentElement.IsCursorHere = false;
            _currentElement = derivative.Function;
            if (_currentElement is MathText mt)
                mt.IsCursorHere = true;

            Render();
            OnContentChanged();
        }

        public void InsertMatrix(int rows = 2, int cols = 2)
        {
            var matrix = new MathMatrix(rows, cols);
            InsertElement(matrix);

            _currentElement.IsCursorHere = false;
            _currentElement = matrix.GetCell(0, 0);
            if (_currentElement is MathText mt)
                mt.IsCursorHere = true;

            Render();
            OnContentChanged();
        }

        public void InsertVector(int length = 3, bool isColumn = true)
        {
            var vector = new MathVector(length, isColumn);
            InsertElement(vector);

            _currentElement.IsCursorHere = false;
            _currentElement = vector.GetElement(0);
            if (_currentElement is MathText mt)
                mt.IsCursorHere = true;

            Render();
            OnContentChanged();
        }

        #endregion

        #region Navegación

        private void NavigateUp()
        {
            if (_currentElement?.Parent is MathFraction fraction)
            {
                if (_currentElement == fraction.Denominator ||
                    IsDescendantOf(_currentElement, fraction.Denominator))
                {
                    MoveCursorTo(fraction.Numerator);
                    Render();
                    return;
                }
            }

            if (_currentElement?.Parent is MathSubscript subscript)
            {
                if (_currentElement == subscript.Subscript ||
                    IsDescendantOf(_currentElement, subscript.Subscript))
                {
                    MoveCursorTo(subscript.Base);
                    Render();
                    return;
                }
            }

            if (_currentElement?.Parent is MathPower power)
            {
                if (_currentElement == power.Exponent ||
                    IsDescendantOf(_currentElement, power.Exponent))
                {
                    MoveCursorTo(power.Base);
                    Render();
                    return;
                }
            }
        }

        private void NavigateDown()
        {
            if (_currentElement?.Parent is MathFraction fraction)
            {
                if (_currentElement == fraction.Numerator ||
                    IsDescendantOf(_currentElement, fraction.Numerator))
                {
                    MoveCursorTo(fraction.Denominator);
                    Render();
                    return;
                }
            }

            if (_currentElement?.Parent is MathSubscript subscript)
            {
                if (_currentElement == subscript.Base ||
                    IsDescendantOf(_currentElement, subscript.Base))
                {
                    MoveCursorTo(subscript.Subscript);
                    Render();
                    return;
                }
            }

            if (_currentElement?.Parent is MathPower power)
            {
                if (_currentElement == power.Base ||
                    IsDescendantOf(_currentElement, power.Base))
                {
                    MoveCursorTo(power.Exponent);
                    Render();
                    return;
                }
            }
        }

        private void NavigateNext()
        {
            if (_currentElement?.Parent is MathFraction fraction)
            {
                if (_currentElement == fraction.Numerator ||
                    IsDescendantOf(_currentElement, fraction.Numerator))
                {
                    MoveCursorTo(fraction.Denominator);
                    Render();
                    return;
                }
            }

            if (_currentElement?.Parent is MathPower power)
            {
                if (_currentElement == power.Base ||
                    IsDescendantOf(_currentElement, power.Base))
                {
                    MoveCursorTo(power.Exponent);
                    Render();
                    return;
                }
            }

            if (_currentElement?.Parent is MathSubscript subscript)
            {
                if (_currentElement == subscript.Base ||
                    IsDescendantOf(_currentElement, subscript.Base))
                {
                    MoveCursorTo(subscript.Subscript);
                    Render();
                    return;
                }
            }
        }

        private bool IsDescendantOf(MathElement element, MathElement ancestor)
        {
            var current = element?.Parent;
            while (current != null)
            {
                if (current == ancestor) return true;
                current = current.Parent;
            }
            return false;
        }

        private void MoveCursorTo(MathElement target)
        {
            if (_currentElement != null)
                _currentElement.IsCursorHere = false;

            // Buscar primer elemento editable (MathText, MathComment, MathTitle)
            var editableTarget = FindFirstEditableElement(target);
            if (editableTarget != null)
            {
                _currentElement = editableTarget;
                editableTarget.IsCursorHere = true;
                SetCursorPositionOnElement(editableTarget, 0);
                DebugLog($"MoveCursorTo: Set cursor on {editableTarget.GetType().Name}, pos=0");
            }
            else
            {
                DebugLog($"MoveCursorTo: FindFirstEditableElement returned null for {target?.GetType().Name}");
            }
        }

        private MathText FindFirstMathText(MathElement element)
        {
            if (element is MathText mt) return mt;
            if (element is MathFraction frac) return FindFirstMathText(frac.Numerator);
            if (element is MathPower pow) return FindFirstMathText(pow.Base);
            if (element is MathRoot root) return FindFirstMathText(root.Radicand);
            if (element is MathSubscript sub) return FindFirstMathText(sub.Base);
            if (element is MathMatrix matrix && matrix.Rows > 0 && matrix.Cols > 0)
                return FindFirstMathText(matrix.GetCell(0, 0));
            if (element is MathVector vector && vector.Length > 0)
                return FindFirstMathText(vector.GetElement(0));
            if (element is MathIntegral integral)
                return FindFirstMathText(integral.Integrand);
            if (element is MathDerivative derivative)
                return FindFirstMathText(derivative.Function);
            return null;
        }

        private void NavigateToPreviousElement()
        {
            var rootElement = GetRootElement(_currentElement);
            int index = CurrentLine.IndexOf(rootElement);
            DebugLog($"NAV_PREV: rootElement={rootElement?.GetType().Name}, index={index}");

            if (index > 0)
            {
                var prevElement = CurrentLine[index - 1];
                DebugLog($"NAV_PREV: Moving to prev element: {prevElement?.GetType().Name}");
                MoveCursorToEnd(prevElement);
                Render();
            }
            else if (_currentLineIndex > 0)
            {
                // Ir a la línea anterior
                DebugLog($"NAV_PREV: Moving to previous line {_currentLineIndex - 1}");
                MoveCursorToLine(_currentLineIndex - 1);
                var prevLine = _lines[_currentLineIndex];
                MoveCursorToEnd(prevLine[prevLine.Count - 1]);
                Render();
            }
            else
            {
                DebugLog($"NAV_PREV: At beginning, can't go further");
            }
        }

        private void NavigateToNextElement()
        {
            var rootElement = GetRootElement(_currentElement);
            int index = CurrentLine.IndexOf(rootElement);
            DebugLog($"NAV_NEXT: rootElement={rootElement?.GetType().Name}, index={index}, lineCount={CurrentLine.Count}");

            if (index >= 0 && index < CurrentLine.Count - 1)
            {
                var nextElement = CurrentLine[index + 1];
                DebugLog($"NAV_NEXT: Moving to next element: {nextElement?.GetType().Name}");
                MoveCursorTo(nextElement);
                Render();
            }
            else if (_currentLineIndex < _lines.Count - 1)
            {
                // Ir a la línea siguiente
                DebugLog($"NAV_NEXT: Moving to next line {_currentLineIndex + 1}");
                MoveCursorToLine(_currentLineIndex + 1);
                Render();
            }
            else
            {
                DebugLog($"NAV_NEXT: At end, can't go further");
            }
        }

        private void DeleteCurrentStructure()
        {
            var structureToDelete = GetRootElement(_currentElement);

            if (structureToDelete == null || !CurrentLine.Contains(structureToDelete))
                return;

            int index = CurrentLine.IndexOf(structureToDelete);

            if (CurrentLine.Count == 1)
            {
                var newText = new MathText();
                newText.IsCursorHere = true;
                CurrentLine[0] = newText;
                _currentElement = newText;
            }
            else
            {
                CurrentLine.RemoveAt(index);
                if (index > 0)
                {
                    MoveCursorToEnd(CurrentLine[index - 1]);
                }
                else if (CurrentLine.Count > 0)
                {
                    MoveCursorTo(CurrentLine[0]);
                }
            }

            Render();
            OnContentChanged();
        }

        public void DeleteElement()
        {
            DeleteCurrentStructure();
        }

        /// <summary>
        /// Intenta eliminar una celda vacía de un vector/matriz.
        /// Devuelve true si se eliminó una celda, false si no estamos en un vector o es la última celda.
        /// </summary>
        private bool TryDeleteVectorCell()
        {
            if (_currentElement == null) return false;

            // Verificar si el elemento actual está dentro de un MathVector
            if (_currentElement.Parent is MathVector vector)
            {
                int cellIndex = vector.IndexOf(_currentElement);
                if (cellIndex >= 0 && vector.Length > 1)
                {
                    // Eliminar la celda actual
                    vector.RemoveElement(cellIndex);

                    // Mover el cursor a la celda anterior (o la primera si era la primera)
                    int newIndex = cellIndex > 0 ? cellIndex - 1 : 0;
                    var newElement = vector.GetElement(newIndex);
                    if (newElement != null)
                    {
                        MoveCursorToEnd(newElement);
                    }

                    Render();
                    return true;
                }
            }

            // Verificar si el elemento actual está dentro de un MathMatrix
            if (_currentElement.Parent is MathMatrix matrix)
            {
                // Encontrar la fila y columna actual
                for (int row = 0; row < matrix.Rows; row++)
                {
                    for (int col = 0; col < matrix.Cols; col++)
                    {
                        if (matrix.GetCell(row, col) == _currentElement)
                        {
                            // Si hay más de una columna, eliminar la columna
                            if (matrix.Cols > 1)
                            {
                                matrix.RemoveColumn(col);
                                int newCol = col > 0 ? col - 1 : 0;
                                var newElement = matrix.GetCell(row, newCol);
                                if (newElement != null)
                                {
                                    MoveCursorToEnd(newElement);
                                }
                                Render();
                                return true;
                            }
                            // Si es la única columna pero hay más de una fila, eliminar la fila
                            else if (matrix.Rows > 1)
                            {
                                matrix.RemoveRow(row);
                                int newRow = row > 0 ? row - 1 : 0;
                                var newElement = matrix.GetCell(newRow, 0);
                                if (newElement != null)
                                {
                                    MoveCursorToEnd(newElement);
                                }
                                Render();
                                return true;
                            }
                        }
                    }
                }
            }

            return false;
        }

        private MathElement GetRootElement(MathElement element)
        {
            var current = element;
            while (current?.Parent != null && !CurrentLine.Contains(current))
            {
                current = current.Parent;
            }
            return current;
        }

        private void MoveCursorToEnd(MathElement target)
        {
            if (_currentElement != null)
                _currentElement.IsCursorHere = false;

            // Buscar último elemento editable (MathText, MathComment, MathTitle)
            var editableTarget = FindLastEditableElement(target);
            if (editableTarget != null)
            {
                _currentElement = editableTarget;
                editableTarget.IsCursorHere = true;
                var textLen = GetTextLengthOfElement(editableTarget);
                SetCursorPositionOnElement(editableTarget, textLen);
                DebugLog($"MoveCursorToEnd: Set cursor on {editableTarget.GetType().Name}, pos={textLen}");
            }
            else
            {
                DebugLog($"MoveCursorToEnd: FindLastEditableElement returned null for {target?.GetType().Name}");
            }
        }

        /// <summary>
        /// Obtiene la longitud del texto de cualquier elemento editable
        /// </summary>
        private int GetTextLengthOfElement(MathElement element)
        {
            if (element is MathText mt) return mt.Text.Length;
            if (element is MathComment mc) return mc.Text.Length;
            if (element is MathTitle mtl) return mtl.Text.Length;
            return 0;
        }

        private MathText FindLastMathText(MathElement element)
        {
            if (element is MathText mt) return mt;
            if (element is MathFraction frac) return FindLastMathText(frac.Denominator);
            if (element is MathPower pow) return FindLastMathText(pow.Exponent);
            if (element is MathRoot root) return FindLastMathText(root.Radicand);
            if (element is MathSubscript sub) return FindLastMathText(sub.Subscript);
            if (element is MathMatrix matrix && matrix.Rows > 0 && matrix.Cols > 0)
                return FindLastMathText(matrix.GetCell(matrix.Rows - 1, matrix.Cols - 1));
            if (element is MathVector vector && vector.Length > 0)
                return FindLastMathText(vector.GetElement(vector.Length - 1));
            if (element is MathIntegral integral)
                return FindLastMathText(integral.Integrand);
            if (element is MathDerivative derivative)
                return FindLastMathText(derivative.Variable);
            return null;
        }

        private void InsertNewLine()
        {
            if (_currentElement != null)
                _currentElement.IsCursorHere = false;

            // Crear nueva línea vacía
            var newLine = new List<MathElement>();
            var newText = new MathText();
            newText.IsCursorHere = true;
            newLine.Add(newText);

            // Insertar después de la línea actual
            _lines.Insert(_currentLineIndex + 1, newLine);
            _currentLineIndex++;
            _currentElement = newText;

            Render();
            OnContentChanged();
        }

        private void ExitStructureOrNavigateNext()
        {
            DebugLog($"EXIT_OR_NEXT: Parent={_currentElement?.Parent?.GetType().Name ?? "null"}");
            if (_currentElement?.Parent != null)
            {
                DebugLog($"EXIT_OR_NEXT: Has parent, calling ExitStructureAndContinue");
                ExitStructureAndContinue();
            }
            else
            {
                DebugLog($"EXIT_OR_NEXT: No parent, calling NavigateToNextElement");
                NavigateToNextElement();
            }
        }

        private void ExitStructureAndContinue()
        {
            var rootElement = GetRootElement(_currentElement);
            int index = CurrentLine.IndexOf(rootElement);
            DebugLog($"EXIT_STRUCTURE: rootElement={rootElement?.GetType().Name}, index={index}, lineCount={CurrentLine.Count}");

            if (index >= 0)
            {
                MathElement nextElement;

                if (index + 1 < CurrentLine.Count)
                {
                    nextElement = CurrentLine[index + 1];
                    DebugLog($"EXIT_STRUCTURE: Moving to next element: {nextElement?.GetType().Name}");
                }
                else
                {
                    var newText = new MathText();
                    CurrentLine.Add(newText);
                    nextElement = newText;
                    DebugLog($"EXIT_STRUCTURE: Created new MathText at end of line");
                }

                if (_currentElement != null)
                    _currentElement.IsCursorHere = false;

                var textTarget = FindFirstMathText(nextElement);
                if (textTarget != null)
                {
                    _currentElement = textTarget;
                    textTarget.IsCursorHere = true;
                    textTarget.CursorPosition = 0;
                    DebugLog($"EXIT_STRUCTURE: Set cursor on {textTarget.GetType().Name}, pos=0");
                }
                else
                {
                    DebugLog($"EXIT_STRUCTURE: FindFirstMathText returned null!");
                }

                Render();
            }
            else
            {
                DebugLog($"EXIT_STRUCTURE: rootElement not found in CurrentLine!");
            }
        }

        /// <summary>
        /// Limpia todo el contenido del editor
        /// </summary>
        public void Clear()
        {
            _lines.Clear();
            var emptyLine = new List<MathElement>();
            var emptyText = new MathText();
            emptyText.IsCursorHere = true;
            emptyLine.Add(emptyText);
            _lines.Add(emptyLine);
            _currentElement = emptyText;
            _currentLineIndex = 0;
            Render();
        }

        #endregion
    }
}
