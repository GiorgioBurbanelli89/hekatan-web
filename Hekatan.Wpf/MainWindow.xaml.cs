using Hekatan.Common;
using Hekatan.Core;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace Hekatan.Wpf
{
    public partial class MainWindow : Window
    {
        //Culture
        private static readonly string _currentCultureName = "en"; //en, bg or zh

        //Static resources
        private static readonly char[] GreekLetters = ['α', 'β', 'χ', 'δ', 'ε', 'φ', 'γ', 'η', 'ι', 'ø', 'κ', 'λ', 'μ', 'ν', 'ο', 'π', 'θ', 'ρ', 'σ', 'τ', 'υ', 'ϑ', 'ω', 'ξ', 'ψ', 'ζ'];
        private static readonly char[] LatinLetters = ['a', 'b', 'g', 'd', 'e', 'z', 'h', 'q', 'i', 'k', 'l', 'm', 'n', 'x', 'o', 'p', 'r', 's', 's', 't', 'u', 'f', 'c', 'y', 'w'];
        private static readonly Regex HtmlAnchorHrefRegex = new(@"(?<=<a\b[^>]*?\bhref\s*=\s*"")(?!#)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex HtmlAnchorTargetRegex = new(@"\s+\btarget\b\s*=\s*""\s*_\w+\s*""", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex HtmlImgPrevRegex = new(@"src\s*=\s*""\s*\.\.", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex HtmlImgCurRegex = new(@"src\s*=\s*""\s*\.", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex HtmlImgAnyRegex = new(@"src\s*=\s*""\s*\.\.?(.+?)""", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        internal readonly struct AppInfo
        {
            static AppInfo()
            {
                Path = AppDomain.CurrentDomain.BaseDirectory;
                Name = AppDomain.CurrentDomain.FriendlyName + ".exe";
                FullName = System.IO.Path.Combine(Path, Name);
                Version = Assembly.GetExecutingAssembly().GetName().Version.ToString();
                Title = " Hekatan Calc " + Version[0..(Version.LastIndexOf('.'))];
                DocPath = Path + "doc";
                if (!Directory.Exists(DocPath))
                    DocPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData) + "\\Hekatan";
            }
            internal static readonly string Path;
            internal static readonly string Name;
            internal static readonly string FullName;
            internal static readonly string Version;
            internal static readonly string Title;
            internal static readonly string DocPath;
        }
        private const double AutoIndentStep = 28.0;

        //Find and Replace
        private readonly FindReplace _findReplace = new();
        private FindReplaceWindow _findReplaceWindow;

        //Parsers
        private readonly ExpressionParser _parser;
        private readonly HekatanProcessor _calcpadProcessor; // Orchestrates MultLang → Macro → Expression
        private readonly HighLighter _highlighter;

        //Html strings
        private readonly string _htmlWorksheet;
        private readonly string _htmlParsingPath;
        private readonly string _htmlParsingUrl;
        private readonly string _htmlHelpPath;
        private readonly string _htmlSource;
        private string _htmlUnwarpedCode;

        //RichTextBox Document
        private readonly FlowDocument _document;
        private Paragraph _currentParagraph;
        private Paragraph _lastModifiedParagraph;

        private readonly StringBuilder _stringBuilder = new(10000);
        private readonly UndoManager _undoMan;
        private readonly WebView2Wrapper _wv2Warper;
        private readonly InsertManager _insertManager;
        private readonly AutoCompleteManager _autoCompleteManager;
        private readonly AvalonEditAutoComplete _avalonEditAutoComplete;

        private readonly string _readmeFileName;
        private string DocumentPath { get; set; }
        private string _cfn;
        private string _tempDir;
        private string CurrentFileName
        {
            get => _cfn;
            set
            {
                _cfn = value;
                if (string.IsNullOrEmpty(value))
                {
                    _tempDir = Path.GetRandomFileName() + '\\';
                    Title = AppInfo.Title;
                }
                else
                {
                    var path = Path.GetDirectoryName(value);
                    if (string.IsNullOrWhiteSpace(path))
                        _cfn = Path.Combine(DocumentPath, value);
                    else
                        SetCurrentDirectory(path);
                    Title = AppInfo.Title + " - " + Path.GetFileName(value);
                    _tempDir = Path.GetFileNameWithoutExtension(value) + '\\';
                }
            }
        }
        //State variables
        private readonly string _svgTyping;
        private bool _isSaving;
        private bool _isSaved;
        private bool _isParsing;
        private readonly SemaphoreSlim _parsingSemaphore = new(1, 1); // Thread-safe parser access
        private bool _isPasting;
        private bool _isTextChangedEnabled;
        private readonly double _inputHeight;
        private bool _mustPromptUnlock;
        private bool _forceHighlight;
        private int _countKeys = int.MinValue;
        private bool _forceBackSpace;
        private int _pasteOffset;
        private int _currentLineNumber;
        private int _currentOffset;
        private TextPointer _pasteEnd;
        private bool _scrollOutput;
        private double _scrollY;
        private bool _autoRun;
        private double _screenScaleFactor;
        private bool _calculateOnActivate;
        private bool _isWebView2Focused;
        private Brush _borderBrush;

        //MathEditor synchronization
        private enum EditorMode { Code, Visual }
        private EditorMode _currentEditorMode = EditorMode.Code;
        private bool _isSyncingBetweenModes = false;

        //Code Editor toggle (RichTextBox ⇄ AvalonEdit)
        private bool _isAvalonEditActive = true; // AvalonEdit is default
        private bool _isSyncingEditors = false;

        //Private properites
        private bool IsComplex => _parser.Settings.Math.IsComplex;
        internal bool IsSaved
        {
            get => _isSaved;
            private set
            {
                SaveButton.IsEnabled = !value;
                MenuSave.IsEnabled = !value;
                _isSaved = value;
            }
        }

        private bool IsWebForm
        {
            get => WebFormButton.Tag.ToString() == "T";
            set => SetWebForm(value);
        }
        private string InputText
        {
            get
            {
                // Read from active editor
                if (_isAvalonEditActive && TextEditor != null)
                {
                    // AvalonEdit uses \n, normalize to \r\n for Hekatan
                    var text = TextEditor.Text ?? string.Empty;
                    // Replace \r\n with \n first (in case there are mixed line endings)
                    text = text.Replace("\r\n", "\n");
                    // Then replace all \n with \r\n
                    text = text.Replace("\n", "\r\n");
                    return text;
                }
                else
                    return new TextRange(_document.ContentStart, _document.ContentEnd).Text;
            }
        }
        private int InputTextLength
        {
            get
            {
                if (_isAvalonEditActive && TextEditor != null)
                    return TextEditor.Text?.Length ?? 0;
                else
                    return _document.ContentEnd.GetOffsetToPosition(_document.ContentStart);
            }
        }
        private SpanLineEnumerator InputTextLines => InputText.EnumerateLines();
        private bool IsCalculated
        {
            get => CalcButton.Tag.ToString() == "T";
            set
            {
                // Check if we have text in either RichTextBox or AvalonEdit
                bool hasText = InputTextLength != 0 || (TextEditor != null && TextEditor.Text.Length > 0);
                SetButton(CalcButton, value && hasText);
                if (IsWebForm)
                {
                    WebFormButton.IsEnabled = !IsCalculated;
                    MenuWebForm.IsEnabled = WebFormButton.IsEnabled;
                }
                MenuCalculate.Icon = IsCalculated ? "  ✓" : null;
            }
        }

        private bool IsWebView2Focused
        {
            get => _isWebView2Focused;
            set
            {
                if (value == _isWebView2Focused) return;
                _isWebView2Focused = value;
                _findReplace.IsWebView2Focused = value;
                InputFrame.BorderBrush = value ? _borderBrush : SystemColors.ActiveBorderBrush;
                OutputFrame.BorderBrush = value ? SystemColors.ActiveBorderBrush : _borderBrush;
            }
        }
        private bool DisplayUnwarpedCode => CodeCheckBorder.Visibility == Visibility.Visible && CodeCheckBox.IsChecked.Value;
        private bool IsUnwarpedCode => WebViewer.Tag is bool b && b;
        public MainWindow()
        {
            _parser = new();
            _highlighter = new();
            Thread.CurrentThread.CurrentUICulture = new CultureInfo(_currentCultureName);

            // Force reload MultLang config to ensure csharp/xaml/wpf are available
            Hekatan.Common.MultLangCode.MultLangManager.ReloadConfig();

            InitializeComponent();

            // Initialize telemetry for real-time monitoring
            HekatanTelemetry.LogEvent("STARTUP", "MainWindow constructor started");
            HekatanTelemetry.LogEvent("STARTUP", $"Telemetry file: {HekatanTelemetry.GetTelemetryFilePath()}");

            // Show telemetry file path to user (for debugging/monitoring)
            System.Diagnostics.Debug.WriteLine($"═══════════════════════════════════════════════════");
            System.Diagnostics.Debug.WriteLine($"CALCPAD TELEMETRY: {HekatanTelemetry.GetTelemetryFilePath()}");
            System.Diagnostics.Debug.WriteLine($"═══════════════════════════════════════════════════");

            _borderBrush = OutputFrame.BorderBrush;
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            _inputHeight = InputGrid.RowDefinitions[1].Height.Value;
            ToolTipService.InitialShowDelayProperty.OverrideMetadata(
                typeof(DependencyObject),
                new FrameworkPropertyMetadata(500));
            HighLighter.IncludeClickEventHandler = Include_Click;
            UserDefined.Include = Include;
            LineNumbers.ClipToBounds = true;
            SetCurrentDirectory();
            var docPath = AppInfo.DocPath;
            var docUrl = $"file:///{docPath.Replace("\\", "/")}";
            var htmlExt = AddCultureExt("html");
            _htmlWorksheet = ReadTextFromFile($"{docPath}\\template{htmlExt}").Replace("https://calcpad.local", docUrl);
            _htmlParsingPath = $"{docPath}\\parsing{htmlExt}";
            _htmlParsingUrl = $"{docUrl}/parsing{htmlExt}";
            _htmlHelpPath = GetHelp(MainWindowResources.calcpad_download_help_html);
            _htmlSource = ReadTextFromFile($"{docPath}\\source.html");
            _svgTyping = $"<img style=\"height:1em;\" src=\"{docUrl}/typing.gif\" alt=\"...\">";
            _readmeFileName = $"{docPath}\\readme{htmlExt}";
            InvButton.Tag = false;
            HypButton.Tag = false;
            RichTextBox.AddHandler(ScrollViewer.ScrollChangedEvent, new ScrollChangedEventHandler(RichTextBox_Scroll));
            DataObject.AddPastingHandler(RichTextBox, RichTextBox_Paste);
            _document = RichTextBox.Document;

            // CRITICAL: Configure FlowDocument to preserve spaces
            _document.SetValue(System.Windows.Markup.XmlAttributeProperties.XmlSpaceProperty, "preserve");

            // Initialize AvalonEdit with code folding
            InitializeAvalonEdit();

            // Subscribe to MathEditor events
            MathEditorControl.SwitchToCodeModeRequested += MathEditor_SwitchToCodeModeRequested;
            // Note: ContentChanged is already subscribed in XAML

            _currentParagraph = _document.Blocks.FirstBlock as Paragraph;
            _currentLineNumber = 1;
            HighLighter.Clear(_currentParagraph);
            _undoMan = new UndoManager();
            Record();
            _wv2Warper = new WebView2Wrapper(WebViewer, $"{docPath}\\blank.html");

            // Log UI Automation properties
            HekatanTelemetry.LogUIAutomation("InputFrame", !string.IsNullOrEmpty(System.Windows.Automation.AutomationProperties.GetAutomationId(InputFrame)), System.Windows.Automation.AutomationProperties.GetAutomationId(InputFrame));
            HekatanTelemetry.LogUIAutomation("OutputFrame", !string.IsNullOrEmpty(System.Windows.Automation.AutomationProperties.GetAutomationId(OutputFrame)), System.Windows.Automation.AutomationProperties.GetAutomationId(OutputFrame));
            HekatanTelemetry.LogUIAutomation("WebViewer", !string.IsNullOrEmpty(System.Windows.Automation.AutomationProperties.GetAutomationId(WebViewer)), System.Windows.Automation.AutomationProperties.GetAutomationId(WebViewer));
            HekatanTelemetry.LogUIAutomation("RichTextBox", !string.IsNullOrEmpty(System.Windows.Automation.AutomationProperties.GetAutomationId(RichTextBox)), System.Windows.Automation.AutomationProperties.GetAutomationId(RichTextBox));

            // Initialize the central processor (reads MultLangConfig.json automatically)
            _calcpadProcessor = new HekatanProcessor(Include);
            _insertManager = new(RichTextBox);
            _autoCompleteManager = new(RichTextBox, AutoCompleteListBox, Dispatcher, _insertManager);
            _avalonEditAutoComplete = new(TextEditor, AutoCompleteListBox, Dispatcher);
            _cfn = string.Empty;
            _isTextChangedEnabled = false;
            IsSaved = true;
            _findReplace.RichTextBox = RichTextBox;
            _findReplace.TextEditor = TextEditor;
            _findReplace.WebViewer = WebViewer;
            _findReplace.IsAvalonEditActive = _isAvalonEditActive;
            _findReplace.BeginSearch += FindReplace_BeginSearch;
            _findReplace.EndSearch += FindReplace_EndSearch;
            _findReplace.EndReplace += FindReplace_EndReplace;
            _isTextChangedEnabled = true;
        }

        private static string AddCultureExt(string ext) => string.Equals(_currentCultureName, "en", StringComparison.Ordinal) ?
                $".{ext}" :
                $".{_currentCultureName}.{ext}";

        public bool SaveStateAndRestart(string tempFile)
        {
            var text = InputText;
            Clipboard.SetText(text);
            File.WriteAllText(tempFile, text);
            Properties.Settings.Default.TempFile = tempFile;
            Properties.Settings.Default.FileName = CurrentFileName;
            Properties.Settings.Default.Save();
            _isSaved = true;
            Execute(AppInfo.FullName);
            return true;
        }

        private void TryRestoreState()
        {
            var tempFile = Properties.Settings.Default.TempFile;
            if (string.IsNullOrEmpty(tempFile)) return;
            var fileName = Properties.Settings.Default.FileName;
            Properties.Settings.Default.TempFile = null;
            Properties.Settings.Default.FileName = null;
            Properties.Settings.Default.Save();
            var message = MainWindowResources.TryRestoreState_Recovered_SavePrompt;
            var result = MessageBox.Show(
                message,
                "Hekatan",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            if (result != MessageBoxResult.Yes) return;
            try
            {
                FileOpen(tempFile);
                CurrentFileName = fileName;
            }
            catch (Exception ex)
            {
                ShowErrorMessage(
                    string.Format(MainWindowResources.TryRestoreState_Failed, ex.Message, tempFile)
                );
                IsSaved = true;
                Command_New(this, null);
            }
        }

        private void SetCurrentDirectory(string path = null)
        {
            if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
            {
                DocumentPath = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments) + "\\Hekatan";
                if (!Directory.Exists(DocumentPath))
                    Directory.CreateDirectory(DocumentPath);
            }
            else
                DocumentPath = path;

            Directory.SetCurrentDirectory(DocumentPath);
        }

        private void ForceHighlight()
        {
            if (_forceHighlight)
            {
                RichTextBox.CaretPosition = _document.ContentStart;
                HighLightAll();
                SetAutoIndent();
                _forceHighlight = false;
            }
        }

        private static void SetButton(Control b, bool on)
        {
            if (on)
            {
                b.Tag = "T";
                b.BorderBrush = Brushes.SteelBlue;
                b.Background = Brushes.LightBlue;
            }
            else
            {
                b.Tag = "F";
                b.BorderBrush = Brushes.Transparent;
                b.Background = Brushes.Transparent;
            }
        }

        private void SetUILock(bool locked)
        {
            var enabled = !locked;
            CopyButton.IsEnabled = enabled;
            PasteButton.IsEnabled = enabled;
            UndoButton.IsEnabled = enabled;
            RedoButton.IsEnabled = enabled;
            ImageButton.IsEnabled = enabled;
            KeyPadButton.IsEnabled = enabled;
            MenuEdit.IsEnabled = enabled;
            MenuInsert.IsEnabled = enabled;
            FindButton.IsEnabled = enabled;
        }

        private void SetOutputFrameHeader(bool isWebForm)
        {
            OutputFrame.Header = isWebForm ? MainWindowResources.Input : MainWindowResources.Output;
        }
        private void RichTextBox_Scroll(object sender, ScrollChangedEventArgs e)
        {
            if (e.VerticalChange != 0 && !_sizeChanged && !IsWebForm)
            {
                _autoCompleteManager.MoveAutoComplete();
                _avalonEditAutoComplete.MoveAutoComplete();
                DispatchLineNumbers();
                if (e.VerticalChange > 0 && _lastModifiedParagraph is not null)
                {
                    Rect r = _lastModifiedParagraph.ContentStart.GetCharacterRect(LogicalDirection.Forward);
                    if (r.Top < 0.8 * RichTextBox.ActualHeight)
                        DispatchHighLightFromCurrent();
                }
            }
        }

        private void Button_Click(object sender, RoutedEventArgs e)
        {
            var element = (FrameworkElement)sender;
            var tag = element.Tag.ToString();
            var index = tag.IndexOf('␣') + 1;
            if (index > 0)
            {
                if (MarkdownCheckBox.IsChecked.Value == true)
                    tag = tag[index..];
                else
                    tag = tag[..(index - 1)];
            }
            RichTextBox.BeginChange();
            if (tag.Contains('‖'))
            {
                if (tag.StartsWith("‖#"))
                    _insertManager.InsertMarkdownHeading(tag);
                else if (tag.StartsWith("<p>", StringComparison.OrdinalIgnoreCase) ||
                    tag.StartsWith("<h", StringComparison.OrdinalIgnoreCase) &&
                    !tag.Equals("<hr/>‖", StringComparison.OrdinalIgnoreCase))
                    _insertManager.InsertHtmlHeading(tag);
                else if (!_insertManager.InsertInline(tag))
                    Dispatcher.InvokeAsync(() =>
                    MessageBox.Show(
                        MainWindowResources.Inline_Html_elements_must_not_cross_text_lines,
                        "Hekatan", MessageBoxButton.OK, MessageBoxImage.Stop));
            }
            else if (tag.Contains('§'))
                InsertLines(tag, "§", false);
            else switch (tag)
                {
                    case null or "": break;
                    case "AC": RemoveLine(); break;
                    case "C": _insertManager.RemoveChar(); break;
                    case "Enter": _insertManager.InsertLine(); break;
                    default:
                        if (tag[0] == '#' ||
                            tag[0] == '$' && (
                                tag.StartsWith("$plot", StringComparison.OrdinalIgnoreCase) ||
                                tag.StartsWith("$map", StringComparison.OrdinalIgnoreCase)
                            ))
                        {
                            var p = RichTextBox.Selection.End.Paragraph;
                            if (p is not null && p.ContentStart?.GetOffsetToPosition(p.ContentEnd) > 0)
                            {
                                var tp = p.ContentEnd.InsertParagraphBreak();
                                tp.InsertTextInRun(tag);
                                p = tp.Paragraph;
                                var lineNumber = GetLineNumber(p);
                                _highlighter.Parse(p, IsComplex, lineNumber, true);
                                SetAutoIndent();
                                tp = p.ContentEnd;
                                RichTextBox.Selection.Select(tp, tp);
                            }
                            else
                                _insertManager.InsertText(tag);
                        }
                        else
                            _insertManager.InsertText(tag);
                        break;
                }
            if (tag == "Enter")
                CalculateAsync();

            RichTextBox.EndChange();
            RichTextBox.Focus();
            Keyboard.Focus(RichTextBox);
        }

        private void InsertLines(string tag, string delimiter, bool comment)
        {
            var parts = tag.Split(delimiter);
            var p = RichTextBox.Selection.Start.Paragraph;
            var selLength = RichTextBox.Selection.Text.Length;
            TextPointer tp = selLength > 0 ? p.ContentStart : p.ContentEnd;
            var pararaphLength = new TextRange(p.ContentStart, p.ContentEnd).Text.Length;
            if (pararaphLength > 0)
            {
                tp = tp.InsertParagraphBreak();
                if (selLength > 0)
                {
                    p = tp.Paragraph;
                    if (tp  is not null)
                        tp = p.PreviousBlock.ContentEnd;
                }
            }
            p = tp.Paragraph;
            var lineNumber = GetLineNumber(p);
            InsertPart(0);
            if (selLength > 0)
                tp = RichTextBox.Selection.End;

            for (int i = 1, len = parts.Length; i < len; ++i)
            {
                p = tp.Paragraph;
                if (p is not null) tp = p.ContentEnd;
                tp = tp.InsertParagraphBreak();
                ++lineNumber;
                InsertPart(i);
            }
            SetAutoIndent();
            p = tp.Paragraph;
            if (p is not null)
            {
                tp = tp.Paragraph.ContentEnd;
                RichTextBox.Selection.Select(tp, tp);
            }

            void InsertPart(int i)
            {
                var s = parts[i];
                if (comment && !s.StartsWith('\''))
                    s = '\'' + s;

                tp.InsertTextInRun(s);
                _highlighter.Defined.Get(s, lineNumber);
                _highlighter.Parse(p, IsComplex, lineNumber, i == 1);
            }
        }

        private async Task AutoRun(bool syncScroll = false)
        {
            if (_isParsing)
                return;

            IsCalculated = true;
            if (syncScroll)
                _scrollOutput = true;

            _scrollY = await _wv2Warper.GetScrollYAsync();
            CalculateAsync();
        }

        private void RemoveLine()
        {
            _isTextChangedEnabled = false;
            RichTextBox.BeginChange();
            if (_document.Blocks.Count <= 1)
            {
                _currentParagraph = _document.Blocks.FirstBlock as Paragraph;
                _currentParagraph.Inlines.Clear();
            }
            else
            {
                _document.Blocks.Remove(RichTextBox.Selection.Start.Paragraph);
                _currentParagraph = RichTextBox.Selection.Start.Paragraph;
            }
            _currentLineNumber = GetLineNumber(_currentParagraph);
            HighLighter.Clear(_currentParagraph);
            RichTextBox.EndChange();
            _isTextChangedEnabled = true;
            if (IsAutoRun)
                AutoRun();
        }

        private int _scrollOutputToLine;
        private double _scrollOffset;
        private async void LineClicked(string data)
        {
            if (int.TryParse(data, out var line) && line > 0)
            {
                if (_highlighter.Defined.HasMacros && !IsUnwarpedCode)
                {
                    _scrollOffset = await _wv2Warper.GetVerticalPositionAsync(line);
                    _scrollOutputToLine = line;
                    await _wv2Warper.NavigateToStringAsync(_htmlUnwarpedCode);
                    WebViewer.Tag = true;
                    CodeCheckBox.IsChecked = true;
                }
                else if (line <= _document.Blocks.Count)
                {
                    var block = _document.Blocks.ElementAt(line - 1);
                    if (!ReferenceEquals(block, _currentParagraph))
                    {
                        var y = block.ContentEnd.GetCharacterRect(LogicalDirection.Forward).Y -
                            _document.ContentStart.GetCharacterRect(LogicalDirection.Forward).Y -
                            await _wv2Warper.GetVerticalPositionAsync(line) +
                            (RichTextBox.Margin.Top - WebViewer.Margin.Top);
                        RichTextBox.ScrollToVerticalOffset(y);
                        RichTextBox.CaretPosition = block.ContentEnd;
                    }
                }
            }
            RichTextBox.Focus();
            Keyboard.Focus(RichTextBox);
        }

        private void LinkClicked(string data)
        {
            RichTextBox.Selection.Text = string.Empty;
            var lines = data.Split(Environment.NewLine);
            var p = RichTextBox.Selection.Start.Paragraph;
            if (lines.Length == 1)
            {
                if ((data[0] == '#' || data[0] == '$') && !p.ContentEnd.IsAtLineStartPosition)
                {
                    var tp = p.ContentEnd.InsertParagraphBreak();
                    RichTextBox.Selection.Select(tp, tp);
                }
                _insertManager.InsertText(data);
            }
            else
            {
                var tp = p.ContentStart;
                _isTextChangedEnabled = false;
                RichTextBox.BeginChange();
                var start = true;
                foreach (var line in lines)
                {
                    if (!p.ContentEnd.IsAtLineStartPosition)
                        p = p.ContentEnd.InsertParagraphBreak().Paragraph;
                    p.Inlines.Add(line);
                    _highlighter.Parse(p, IsComplex, GetLineNumber(p), start);
                    start = false;
                }
                RichTextBox.Selection.Select(tp, tp);
                RichTextBox.EndChange();
                _isTextChangedEnabled = true;
                DispatchAutoIndent();
                Record();
            }
            RichTextBox.Focus();
            Keyboard.Focus(RichTextBox);
        }
        private void CalcButton_Click(object sender, RoutedEventArgs e) => Command_Calculate(null, null);
        private async void Command_Calculate(object sender, ExecutedRoutedEventArgs e)
        {
            if (IsCalculated)
                _scrollY = await _wv2Warper.GetScrollYAsync();

            Calculate();
            if (IsCalculated)
                await _wv2Warper.SetScrollYAsync(_scrollY);
        }

        private void Calculate()
        {
            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-calculate-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss.fff}] Calculate() INICIO - IsCalculated={IsCalculated}, _isParsing={_isParsing}, IsPaused={_parser.IsPaused}, IsWebForm={IsWebForm}\n");
            }
            catch { }

            if (_parser.IsPaused)
            {
                try
                {
                    var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-calculate-debug.txt");
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss.fff}] Calculate() - Parser pausado, llamando AutoRun()\n");
                }
                catch { }
                AutoRun();
            }
            else
            {
                IsCalculated = !IsCalculated;

                try
                {
                    var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-calculate-debug.txt");
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss.fff}] Calculate() - Después de toggle: IsCalculated={IsCalculated}\n");
                }
                catch { }

                if (IsWebForm)
                {
                    try
                    {
                        var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-calculate-debug.txt");
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss.fff}] Calculate() - Llamando CalculateAsync(!IsCalculated={!IsCalculated})\n");
                    }
                    catch { }
                    CalculateAsync(!IsCalculated);
                }
                else if (IsCalculated)
                {
                    try
                    {
                        var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-calculate-debug.txt");
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss.fff}] Calculate() - Llamando CalculateAsync(), reseteando _isParsing a false primero\n");
                    }
                    catch { }
                    // Reset parsing flag to ensure we can execute
                    _isParsing = false;
                    CalculateAsync();
                }
                else
                {
                    try
                    {
                        var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-calculate-debug.txt");
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss.fff}] Calculate() - Llamando ShowHelp()\n");
                    }
                    catch { }
                    ShowHelp();
                }
            }
        }

        private void Command_New(object senter, ExecutedRoutedEventArgs e)
        {
            var r = PromptSave();
            if (r == MessageBoxResult.Cancel)
                return;

            // Limpiar estado de edición IFC si estaba activo
            ClearIfcViewerState();

            if (_isParsing)
                _parser.Cancel();

            _parser.ShowWarnings = true;
            CurrentFileName = string.Empty;

            // Clear content based on active editor
            if (_isAvalonEditActive && TextEditor != null)
            {
                TextEditor.Text = string.Empty;
                TextEditor.CaretOffset = 0;
            }
            else
            {
                _document.Blocks.Clear();
                RichTextBox.CaretPosition = _document.ContentStart;
            }

            _highlighter.Defined.Clear(IsComplex);

            if (IsWebForm)
            {
                _mustPromptUnlock = false;
                IsWebForm = false;

                if (_isAvalonEditActive && TextEditor != null)
                    TextEditor.Focus();
                else
                    RichTextBox.Focus();

                WebFormButton.Visibility = Visibility.Visible;
                MenuWebForm.Visibility = Visibility.Visible;
            }
            ShowHelp();
            SaveButton.Tag = null;
            _undoMan.Reset();
            Record();
        }

        private void Command_Open(object sender, ExecutedRoutedEventArgs e)
        {
            var r = PromptSave();
            if (r == MessageBoxResult.Cancel)
                return;

            var s = ".hcalc";
            if (!string.IsNullOrWhiteSpace(CurrentFileName))
                s = Path.GetExtension(CurrentFileName).ToLowerInvariant();

            var dlg = new OpenFileDialog
            {
                DefaultExt = s,
                //FileName = '*' + s,
                InitialDirectory = File.Exists(CurrentFileName) ? Path.GetDirectoryName(CurrentFileName) : DocumentPath,
                CheckFileExists = true,
                Multiselect = false,
                Filter = s == ".txt"
                    ? MainWindowResources.Command_Open_Text_File
                    : MainWindowResources.Command_Open_Hekatan_Worksheet
            };

            var result = (bool)dlg.ShowDialog();
            if (result)
                FileOpen(dlg.FileName);
        }

        private void Command_Save(object sender, ExecutedRoutedEventArgs e)
        {
            if ((string)SaveButton.Tag == "S" || string.IsNullOrWhiteSpace(CurrentFileName))
                FileSaveAs();
            else
                FileSave(CurrentFileName);
        }

        private void ReadSettings()
        {
            ReadRecentFiles();
            var settings = Properties.Settings.Default;
            Real.IsChecked = settings.Numbers == 'R';
            Complex.IsChecked = settings.Numbers == 'C';
            AutoRunCheckBox.IsChecked = settings.AutoRun;
            Deg.IsChecked = settings.Angles == 'D';
            Rad.IsChecked = settings.Angles == 'R';
            Gra.IsChecked = settings.Angles == 'G';
            UK.IsChecked = settings.Units == 'K';
            US.IsChecked = settings.Units == 'S';
            Professional.IsChecked = settings.Equations == 'P';
            Inline.IsChecked = settings.Equations == 'I';
            DecimalsTextBox.Text = settings.Decimals.ToString();
            SubstituteCheckBox.IsChecked = settings.Substitute;
            AdaptiveCheckBox.IsChecked = settings.Adaptive;
            ShadowsCheckBox.IsChecked = settings.Shadows;
            LightDirectionComboBox.SelectedIndex = settings.Direction;
            ColorScaleComboBox.SelectedIndex = settings.Palette;
            SmoothCheckBox.IsChecked = settings.Smooth;
            ExternalBrowserComboBox.SelectedIndex = settings.Browser;
            ZeroSmallMatrixElementsCheckBox.IsChecked = settings.ZeroSmallMatrixElements;
            MaxOutputCountTextBox.Text = settings.MaxOutputCount.ToString();
            EmbedCheckBox.IsChecked = settings.Embed;
            if (settings.WindowLeft > 0) Left = settings.WindowLeft;
            if (settings.WindowTop > 0) Top = settings.WindowTop;

            // Validate window size - ensure minimum reasonable size (400x300)
            const double MIN_WIDTH = 800;
            const double MIN_HEIGHT = 600;
            if (settings.WindowWidth >= MIN_WIDTH)
                Width = settings.WindowWidth;
            else
                Width = 1200; // Default width
            if (settings.WindowHeight >= MIN_HEIGHT)
                Height = settings.WindowHeight;
            else
                Height = 800; // Default height

            // Validate WindowState (0=Normal, 1=Minimized, 2=Maximized)
            if (settings.WindowState >= 0 && settings.WindowState <= 2)
                this.WindowState = (WindowState)settings.WindowState;
            else
                this.WindowState = WindowState.Normal;

            ExpressionParser.IsUs = US.IsChecked ?? false;
            var math = _parser.Settings.Math;
            math.FormatEquations = Professional.IsChecked ?? false;
            math.IsComplex = Complex.IsChecked ?? false;
            math.Degrees = Deg.IsChecked ?? false ? 0 :
                           Rad.IsChecked ?? false ? 1 : 2;
            math.Substitute = SubstituteCheckBox.IsChecked ?? false;
            math.ZeroSmallMatrixElements = ZeroSmallMatrixElementsCheckBox.IsChecked ?? false;
            math.MaxOutputCount = int.TryParse(MaxOutputCountTextBox.Text, out int i) ? i : 20;
            var plot = _parser.Settings.Plot;
            plot.ImagePath = string.Empty;
            plot.ImageUri = string.Empty;
            plot.VectorGraphics = false;
            plot.ScreenScaleFactor = _screenScaleFactor;
            plot.IsAdaptive = AdaptiveCheckBox.IsChecked ?? false;
            plot.Shadows = ShadowsCheckBox.IsChecked ?? false;
            plot.SmoothScale = SmoothCheckBox.IsChecked ?? false;
            plot.ColorScale = (PlotSettings.ColorScales)ColorScaleComboBox.SelectedIndex;
            plot.LightDirection = (PlotSettings.LightDirections)LightDirectionComboBox.SelectedIndex;
        }

        private void ReadRecentFiles()
        {
            MenuRecent.Items.Clear();
            var list = Properties.Settings.Default.RecentFileList;
            var j = 0;
            if (list is not null)
            {
                foreach (var fileName in list)
                {
                    if (string.IsNullOrWhiteSpace(fileName) || !File.Exists(fileName))
                        continue;

                    ++j;
                    var menu = new MenuItem()
                    {
                        ToolTip = fileName,
                        Icon = $"   {j}",
                        Header = GetRecentFileName(fileName),
                    };
                    menu.Click += RecentFileList_Click;
                    MenuRecent.Items.Add(menu);
                }
                if (MenuRecent.Items.Count > 0 && (string.IsNullOrEmpty(CurrentFileName) || !File.Exists(CurrentFileName)))
                {
                    var firstMenu = (MenuItem)MenuRecent.Items[0];
                    var path = Path.GetDirectoryName((string)firstMenu.ToolTip);
                    SetCurrentDirectory(path);
                }
            }
            MenuRecent.IsEnabled = j > 0;
            CloneRecentFilesList();
        }

        private string GetRecentFileName(string fileName) => Path.GetFileName(fileName).Replace("_", "__");

        private void WriteSettings()
        {
            try
            {
                WriteRecentFiles();
                var settings = Properties.Settings.Default;
                settings.Numbers = Real.IsChecked ?? false ? 'R' : 'C';
                settings.AutoRun = AutoRunCheckBox.IsChecked ?? false;
                settings.Angles = Deg.IsChecked ?? false ? 'D' :
                                  Rad.IsChecked ?? false ? 'R' : 'G';
                settings.Units = UK.IsChecked ?? false ? 'K' : 'S';
                settings.Equations = Professional.IsChecked ?? false ? 'P' : 'I';
                settings.Decimals = byte.TryParse(DecimalsTextBox.Text, out byte b) ? b : (byte)2;
                settings.Substitute = SubstituteCheckBox.IsChecked ?? false;
                settings.Adaptive = AdaptiveCheckBox.IsChecked ?? false;
                settings.Shadows = ShadowsCheckBox.IsChecked ?? false;
                settings.Direction = (byte)LightDirectionComboBox.SelectedIndex;
                settings.Direction = (byte)LightDirectionComboBox.SelectedIndex;
                settings.Palette = (byte)ColorScaleComboBox.SelectedIndex;
                settings.Smooth = SmoothCheckBox.IsChecked ?? false;
                settings.Browser = (byte)ExternalBrowserComboBox.SelectedIndex;
                settings.ZeroSmallMatrixElements = ZeroSmallMatrixElementsCheckBox.IsChecked ?? false;
                settings.MaxOutputCount = int.TryParse(MaxOutputCountTextBox.Text, out int i) ? i : (int)20;
                settings.Embed = EmbedCheckBox.IsChecked ?? false;
                settings.WindowLeft = Left;
                settings.WindowTop = Top;
                settings.WindowWidth = Width;
                settings.WindowHeight = Height;
                settings.WindowState = (byte)this.WindowState;
                settings.Save();
            }
            catch (System.Configuration.ConfigurationException ex)
            {
                // El archivo de configuración del usuario puede estar corrupto
                // Intentar resetear la configuración
                try
                {
                    Properties.Settings.Default.Reset();
                    Properties.Settings.Default.Save();
                }
                catch
                {
                    // Si aún falla, intentar eliminar el archivo de configuración corrupto
                    try
                    {
                        var configPath = System.Configuration.ConfigurationManager.OpenExeConfiguration(
                            System.Configuration.ConfigurationUserLevel.PerUserRoamingAndLocal).FilePath;
                        if (System.IO.File.Exists(configPath))
                        {
                            System.IO.File.Delete(configPath);
                        }
                    }
                    catch { }
                }
                System.Diagnostics.Debug.WriteLine($"Error al guardar configuración: {ex.Message}");
            }
            catch (System.ArgumentException ex)
            {
                // Error de parámetro inválido en configuración
                try
                {
                    Properties.Settings.Default.Reset();
                }
                catch { }
                System.Diagnostics.Debug.WriteLine($"Error de configuración: {ex.Message}");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error inesperado al guardar configuración: {ex.Message}");
            }
        }


        private void WriteRecentFiles()
        {
            var n = MenuRecent.Items.Count;
            if (n == 0)
                return;

            var list =
                Properties.Settings.Default.RecentFileList ??
                [];

            list.Clear();
            for (int i = 0; i < n; ++i)
            {
                var menu = (MenuItem)MenuRecent.Items[i];
                var value = (string)menu.ToolTip;
                list.Add(value);
            }

            Properties.Settings.Default.RecentFileList = list;
        }

        private void AddRecentFile(string fileName)
        {
            if (!File.Exists(fileName))
                return;

            var n = MenuRecent.Items.Count;
            for (int i = 0; i < n; ++i)
            {
                var menu = (MenuItem)MenuRecent.Items[i];
                if (!fileName.Equals((string)menu.ToolTip))
                    continue;

                for (int j = i; j > 0; --j)
                {
                    menu = (MenuItem)MenuRecent.Items[j];
                    var previousMenu = (MenuItem)MenuRecent.Items[j - 1];
                    menu.Header = previousMenu.Header;
                    menu.ToolTip = previousMenu.ToolTip;
                }
                var first = (MenuItem)MenuRecent.Items[0];
                first.Header = GetRecentFileName(fileName);
                first.ToolTip = fileName;
                CloneRecentFilesList();
                return;
            }
            if (n >= 9)
            {
                MenuRecent.Items.RemoveAt(n - 1);
                --n;
            }
            var newMenu = new MenuItem()
            {
                ToolTip = fileName,
                Icon = "   1",
                Header = GetRecentFileName(fileName),
            };
            newMenu.Click += RecentFileList_Click;
            MenuRecent.Items.Insert(0, newMenu);
            for (int i = 1; i <= n; ++i)
            {
                var menu = (MenuItem)MenuRecent.Items[i];
                menu.Icon = $"   {i + 1}";
            }
            MenuRecent.IsEnabled = n >= 0;
            CloneRecentFilesList();
        }


        private void CloneRecentFilesList()
        {
            RecentFliesListButton.IsEnabled = MenuRecent.IsEnabled;
            if (!RecentFliesListButton.IsEnabled)
                return;

            RecentFilesListContextMenu.Items.Clear();
            foreach (MenuItem menu in MenuRecent.Items)
            {
                var contextMenuItem = new MenuItem()
                {
                    Header = menu.Header,
                    Icon = menu.Icon,
                    ToolTip = menu.ToolTip,
                };
                contextMenuItem.Click += RecentFileList_Click;
                RecentFilesListContextMenu.Items.Add(contextMenuItem);
            }
        }

        private void RecentFliesListButton_Click(object sender, RoutedEventArgs e)
        {
            RecentFilesListContextMenu.PlacementTarget = RecentFliesListButton;
            RecentFilesListContextMenu.Placement = System.Windows.Controls.Primitives.PlacementMode.Relative;
            var margin = RecentFilesListContextMenu.Margin;
            margin.Left = RecentFliesListButton.Margin.Left;
            RecentFilesListContextMenu.Margin = margin;
            RecentFilesListContextMenu.StaysOpen = true;
            RecentFilesListContextMenu.IsOpen = true;
        }

        private void RecentFileList_Click(object sender, RoutedEventArgs e)
        {
            RecentFilesListContextMenu.IsOpen = false;
            var r = PromptSave();
            if (r == MessageBoxResult.Cancel)
                return;

            var fileName = (string)((MenuItem)sender).ToolTip;
            if (File.Exists(fileName))
                FileOpen(fileName);
        }

        private void Command_SaveAs(object sender, ExecutedRoutedEventArgs e) => FileSaveAs();

        private bool FileSaveAs()
        {
            string s;
            if (!string.IsNullOrWhiteSpace(CurrentFileName))
                s = Path.GetExtension(CurrentFileName).ToLowerInvariant();
            else
                s = ".hcalc";

            var dlg = new SaveFileDialog
            {
                FileName = Path.GetFileName(CurrentFileName),
                InitialDirectory = File.Exists(CurrentFileName) ? Path.GetDirectoryName(CurrentFileName) : DocumentPath,
                DefaultExt = s,
                OverwritePrompt = true,
                Filter = s switch
                {
                    ".txt" => MainWindowResources.Command_Open_Text_File,
                    ".hcalcz" or ".cpdz" => MainWindowResources.FileSaveAs_Hekatan_Compiled,
                    _ => MainWindowResources.Command_Open_Hekatan_Worksheet
                }
            };

            var result = dlg.ShowDialog();
            if (result != true)
                return false;

            var fileName = dlg.FileName;
            if (IsCompiled(s) && !IsCompiledFile())
                fileName = Path.ChangeExtension(fileName, s);

            _parser.ShowWarnings = !IsCompiledFile();
            CopyLocalImages(fileName);
            FileSave(fileName);
            AddRecentFile(fileName);
            return true;

            bool IsCompiledFile()
            {
                var ext = Path.GetExtension(fileName);
                return string.Equals(ext, ".hcalcz", StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(ext, ".cpdz", StringComparison.OrdinalIgnoreCase);
            }
            static bool IsCompiled(string ext) => ext is ".hcalcz" or ".cpdz";
        }

        private void CopyLocalImages(string newFileName)
        {
            var images = GetLocalImages(InputText);
            if (images is not null)
            {
                var sourcePath = Path.GetDirectoryName(CurrentFileName);
                var targetPath = Path.GetDirectoryName(newFileName);
                if (sourcePath != targetPath && Directory.Exists(targetPath))
                {
                    var sourceParent = Directory.GetDirectoryRoot(sourcePath);
                    var targetParent = Directory.GetDirectoryRoot(targetPath);
                    if (!string.Equals(sourceParent, sourcePath, StringComparison.OrdinalIgnoreCase))
                        sourceParent = Directory.GetParent(sourcePath).FullName;
                    if (!string.Equals(targetParent, targetPath, StringComparison.OrdinalIgnoreCase))
                        targetParent = Directory.GetParent(targetPath).FullName;
                    var regexString = @"src\s*=\s*""\s*\.\./";
                    for (int i = 0; i < 2; ++i)
                    {
                        foreach (var image in images)
                        {
                            var m = Regex.Match(image, regexString, RegexOptions.IgnoreCase);
                            if (m.Success)
                            {
                                var n = m.Length;
                                var imageFileName = image[n..^1];
                                var imageSourceFile = Path.Combine(sourceParent, imageFileName);
                                if (File.Exists(imageSourceFile))
                                {
                                    var imageTargetFile = Path.Combine(targetParent, imageFileName);
                                    var imageTargetPath = Path.GetDirectoryName(imageTargetFile);
                                    Directory.CreateDirectory(imageTargetPath);
                                    try
                                    {
                                        File.Copy(imageSourceFile, imageTargetFile, true);
                                    }
                                    catch (Exception e)
                                    {
                                        ShowErrorMessage(e.Message);
                                        break;
                                    }
                                }
                            }
                        }
                        regexString = @"src\s*=\s*""\s*\./";
                        if (string.Equals(sourceParent, sourcePath, StringComparison.OrdinalIgnoreCase)
                        && string.Equals(targetParent, targetPath, StringComparison.OrdinalIgnoreCase))
                            return;

                        sourceParent = sourcePath;
                        targetParent = targetPath;
                    }
                }
            }
        }

        private async void FileSave(string fileName)
        {
            if (IsWebForm)
                SetAutoIndent();

            _calcpadProcessor.MacroParser.Parse(InputText, out var outputText, null, 0, false);
            var hasInputFields = MacroParser.HasInputFields(outputText);
            if (hasInputFields && IsWebForm)
            {
                if (IsCalculated)
                {
                    CalculateAsync(true);
                    IsCalculated = false;
                    _isSaving = true;
                    return;
                }
                if (!await GetAndSetInputFieldsAsync())
                    return;
            }

            // Save referenced IFC files alongside the .cpd file
            string inputText = GetInputText();
            inputText = SaveReferencedIfcFiles(inputText, fileName);

            var extSave = Path.GetExtension(fileName);
            var isZip = string.Equals(extSave, ".cpdz", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(extSave, ".hcalcz", StringComparison.OrdinalIgnoreCase);
            if (isZip)
            {
                if (hasInputFields)
                    _calcpadProcessor.MacroParser.Parse(inputText, out outputText, null, 0, false);

                WriteFile(fileName, outputText, true);
                FileOpen(fileName);
            }
            else
            {
                WriteFile(fileName, inputText);
                CurrentFileName = fileName;
            }
            SaveButton.Tag = null;
            IsSaved = true;
        }

        /// <summary>
        /// Save IFC files referenced in the code alongside the .cpd file
        /// Updates references from https://calcpad.ifc/temp_xxx.ifc to local filenames
        /// </summary>
        private string SaveReferencedIfcFiles(string inputText, string cpdFileName)
        {
            try
            {
                string cpdDirectory = Path.GetDirectoryName(cpdFileName) ?? "";
                string appIfcPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "resources", "ifc");

                // Find all IFC file references: https://calcpad.ifc/xxx.ifc
                var ifcUrlPattern = new System.Text.RegularExpressions.Regex(
                    @"https://calcpad\.ifc/([^'""\s<>]+\.ifc)",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);

                var matches = ifcUrlPattern.Matches(inputText);
                if (matches.Count == 0) return inputText;

                string updatedText = inputText;
                var copiedFiles = new System.Collections.Generic.HashSet<string>();

                foreach (System.Text.RegularExpressions.Match match in matches)
                {
                    string ifcFileName = match.Groups[1].Value;
                    string sourceFile = Path.Combine(appIfcPath, ifcFileName);

                    if (File.Exists(sourceFile) && !copiedFiles.Contains(ifcFileName))
                    {
                        // Determine target filename - use original name or create from temp name
                        string targetFileName = ifcFileName;

                        // If it's a temp file (temp_xxx.ifc), try to use a cleaner name
                        if (ifcFileName.StartsWith("temp_", StringComparison.OrdinalIgnoreCase))
                        {
                            // Keep the temp name but user can rename later
                            targetFileName = ifcFileName;
                        }

                        string targetFile = Path.Combine(cpdDirectory, targetFileName);

                        // Copy the IFC file to the same directory as the .cpd
                        if (!File.Exists(targetFile) || !FilesAreEqual(sourceFile, targetFile))
                        {
                            File.Copy(sourceFile, targetFile, true);
                            System.Diagnostics.Debug.WriteLine($"Copied IFC file: {sourceFile} -> {targetFile}");
                        }

                        // Update the reference in the text to use relative path
                        // Keep using https://calcpad.ifc/ but now it will look in the cpd directory too
                        copiedFiles.Add(ifcFileName);
                    }
                }

                return updatedText;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error saving IFC files: {ex.Message}");
                return inputText;
            }
        }

        /// <summary>
        /// Compare two files for equality
        /// </summary>
        private static bool FilesAreEqual(string file1, string file2)
        {
            try
            {
                var info1 = new FileInfo(file1);
                var info2 = new FileInfo(file2);
                return info1.Length == info2.Length;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Load IFC files from the cpd directory to resources/ifc when opening a file
        /// This restores IFC files that were saved alongside the .cpd
        /// </summary>
        private void LoadReferencedIfcFiles(string cpdFileName)
        {
            try
            {
                string cpdDirectory = Path.GetDirectoryName(cpdFileName) ?? "";
                string appIfcPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "resources", "ifc");

                // Ensure the ifc directory exists
                if (!Directory.Exists(appIfcPath))
                    Directory.CreateDirectory(appIfcPath);

                // Find all IFC files in the cpd directory
                if (!Directory.Exists(cpdDirectory)) return;

                var ifcFiles = Directory.GetFiles(cpdDirectory, "*.ifc", SearchOption.TopDirectoryOnly);
                foreach (var ifcFile in ifcFiles)
                {
                    string fileName = Path.GetFileName(ifcFile);
                    string targetFile = Path.Combine(appIfcPath, fileName);

                    // Copy if not exists or if different
                    if (!File.Exists(targetFile) || !FilesAreEqual(ifcFile, targetFile))
                    {
                        File.Copy(ifcFile, targetFile, true);
                        System.Diagnostics.Debug.WriteLine($"Loaded IFC file: {ifcFile} -> {targetFile}");
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error loading IFC files: {ex.Message}");
            }
        }

        private void Command_Help(object sender, ExecutedRoutedEventArgs e)
        {
            if (File.Exists(_readmeFileName))
                Execute(_readmeFileName);
            else
                ShowHelp();
        }

        private void Command_Close(object sender, ExecutedRoutedEventArgs e) => Application.Current.Shutdown();

        private void Command_Copy(object sender, ExecutedRoutedEventArgs e)
        {
            if (_isWebView2Focused)
                WebViewer.ExecuteScriptAsync("document.execCommand('copy');");
            else
                RichTextBox.Copy();
        }

        private void Command_Paste(object sender, ExecutedRoutedEventArgs e)
        {
            if (_isWebView2Focused)
            {
                var text = Clipboard.GetText();
                if (!string.IsNullOrEmpty(text))
                {
                    // Escape for JavaScript template literal
                    var escaped = text.Replace("\\", "\\\\").Replace("`", "\\`").Replace("${", "\\${");
                    WebViewer.CoreWebView2.ExecuteScriptAsync(
                        $"document.execCommand('insertText', false, `{escaped}`);");
                }
            }
            else if(InputFrame.Visibility == Visibility.Visible)
            {
                RichTextBox.Paste();
                RichTextBox.Focus();
                Keyboard.Focus(RichTextBox);
            }
        }

        private void Command_Undo(object sender, ExecutedRoutedEventArgs e)
        {
            if (_undoMan.Undo())
                RestoreUndoData();
        }

        private void Command_Redo(object sender, ExecutedRoutedEventArgs e)
        {
            if (_undoMan.Redo())
                RestoreUndoData();
        }

        private void Command_Print(object sender, ExecutedRoutedEventArgs e)
        {
            if (!_isParsing)
                _wv2Warper.PrintPreviewAsync();
        }

        private void Command_Find(object sender, ExecutedRoutedEventArgs e) =>
            CommandFindReplace(FindReplace.Modes.Find);

        private void Command_Replace(object sender, ExecutedRoutedEventArgs e) =>
            CommandFindReplace(FindReplace.Modes.Replace);

        private async void CommandFindReplace(FindReplace.Modes mode)
        {
            if (_isWebView2Focused)
                _findReplace.Mode = FindReplace.Modes.Find;
            else
                _findReplace.Mode = mode;

            // Actualizar el estado de AvalonEdit activo
            _findReplace.IsAvalonEditActive = _isAvalonEditActive;

            // Obtener texto seleccionado según el editor activo
            string s;
            if (_isWebView2Focused)
                s = await _wv2Warper.GetSelectedTextAsync();
            else if (_isAvalonEditActive && TextEditor != null)
                s = TextEditor.SelectedText;
            else
                s = RichTextBox.Selection.Text;

            if (!(string.IsNullOrEmpty(s) || s.Contains(Environment.NewLine)))
                _findReplace.SearchString = s;

            // Inicializar posición de búsqueda en AvalonEdit
            if (_isAvalonEditActive && TextEditor != null)
                _findReplace.InitPosition();

            if (_findReplaceWindow is null || !_findReplaceWindow.IsVisible)
                _findReplaceWindow = new()
                {
                    Owner = this,
                    FindReplace = _findReplace
                };
            else
                _findReplaceWindow.Hide();

            bool isSelection = s is not null && s.Length > 5;
            _findReplaceWindow.SelectionCheckbox.IsEnabled = isSelection;
            _isTextChangedEnabled = false;
            _findReplaceWindow.Show();
        }

        private void Command_FindNext(object sender, ExecutedRoutedEventArgs e) =>
            _findReplace.Find();

        private void FileOpen(string fileName)
        {
            try
            {
                if (_isParsing)
                    _parser.Cancel();

                // Clear previous output when opening new file
                _wv2Warper.NavigateToBlank();
                IsCalculated = false;

                var ext = Path.GetExtension(fileName).ToLowerInvariant();
                CurrentFileName = fileName;

                // Copy IFC files from the cpd directory to resources/ifc if they exist
                try
                {
                    LoadReferencedIfcFiles(fileName);
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[FileOpen] Error loading IFC files: {ex.Message}");
                    // Continue loading the file even if IFC loading fails
                }

                // If it's a source code file (.py, .cpp, etc.), wrap content in @{lang}...@{end lang}
                var langDirective = GetLanguageDirectiveForExtension(ext);
                if (langDirective != null)
                {
                    var rawCode = File.ReadAllText(fileName);
                    var wrappedContent = $"\"{Path.GetFileName(fileName)}\n@{{{langDirective}}}\n{rawCode}\n@{{end {langDirective}}}";
                    // Load wrapped content into the active editor
                    if (_isAvalonEditActive && TextEditor != null)
                        TextEditor.Text = wrappedContent;
                    else
                        new TextRange(_document.ContentStart, _document.ContentEnd).Text = wrappedContent;
                    // Treat as a new unsaved hcalc
                    CurrentFileName = string.Empty;
                    WebFormButton.Visibility = Visibility.Visible;
                    MenuWebForm.Visibility = Visibility.Visible;
                    SaveButton.Tag = "S";
                    Title = Path.GetFileName(fileName) + " - Hekatan";
                    return;
                }

                var hasForm = GetInputTextFromFile();
                if (!hasForm && string.IsNullOrEmpty(InputText))
                {
                    // File loading failed or was cancelled
                    System.Diagnostics.Debug.WriteLine("[FileOpen] File loading failed or cancelled");
                    ShowHelp();
                    return;
                }

                _parser.ShowWarnings = ext != ".cpdz" && ext != ".hcalcz";

            if (ext == ".cpdz" || ext == ".hcalcz")
            {
                if (IsWebForm)
                    Dispatcher.InvokeAsync(() => CalculateAsync(true), DispatcherPriority.Background);
                else
                    RunWebForm();
                WebFormButton.Visibility = Visibility.Hidden;
                MenuWebForm.Visibility = Visibility.Collapsed;
                SaveButton.Tag = "S";
            }
            else
            {
                WebFormButton.Visibility = Visibility.Visible;
                MenuWebForm.Visibility = Visibility.Visible;
                if (hasForm)
                {
                    if (!IsWebForm)
                        RunWebForm();
                    else
                    {
                        IsCalculated = false;
                        Dispatcher.InvokeAsync(() => CalculateAsync(true), DispatcherPriority.Background);
                    }
                    SaveButton.Tag = "S";
                }
                else
                {
                    if (IsWebForm)
                        IsWebForm = false;
                    else
                    {
                        DispatchLineNumbers();
                        ForceHighlight();
                    }
                    SaveButton.Tag = null;
                    if (IsAutoRun)
                    {
                        IsCalculated = true;
                        Dispatcher.InvokeAsync(() => CalculateAsync(), DispatcherPriority.Background);
                    }
                    else
                    {
                        IsCalculated = false;
                        ShowHelp();
                    }
                }
            }
            _mustPromptUnlock = IsWebForm;
            if (ext != ".tmp")
            {
                IsSaved = true;
                AddRecentFile(CurrentFileName);
            }
            }
            catch (OutOfMemoryException)
            {
                MessageBox.Show(
                    "El archivo es demasiado grande para abrirlo.\n" +
                    "Por favor, divídalo en archivos más pequeños.",
                    "Error de memoria",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                ShowHelp();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[FileOpen] Error: {ex.Message}\n{ex.StackTrace}");
                MessageBox.Show(
                    $"Error al abrir el archivo:\n{ex.Message}",
                    "Hekatan Calc",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                ShowHelp();
            }
        }

        private MessageBoxResult PromptSave()
        {
            var result = MessageBoxResult.No;
            if (!IsSaved)
                result = MessageBox.Show(MainWindowResources.SavePrompt, "Hekatan", MessageBoxButton.YesNoCancel);
            if (result == MessageBoxResult.Yes)
            {
                if (string.IsNullOrWhiteSpace(CurrentFileName))
                {
                    var success = FileSaveAs();
                    if (!success)
                        return MessageBoxResult.Cancel;
                }
                else
                    FileSave(CurrentFileName);
            }
            return result;
        }

        private void GetMathSettings()
        {
            var mathSettings = _parser.Settings.Math;   
            if (double.TryParse(DecimalsTextBox.Text, out var d))
            {
                var i = (int)Math.Floor(d);
                mathSettings.Decimals = i;
                DecimalsTextBox.Text = mathSettings.Decimals.ToString();
                DecimalsTextBox.Foreground = Brushes.Black;
            }
            else
                DecimalsTextBox.Foreground = Brushes.Red;

            if (double.TryParse(MaxOutputCountTextBox.Text, out var m))
            {
                var i = (int)Math.Floor(m);
                mathSettings.MaxOutputCount = i;
                MaxOutputCountTextBox.Text = mathSettings.MaxOutputCount.ToString();
                MaxOutputCountTextBox.Foreground = Brushes.Black;
            }
            else
                MaxOutputCountTextBox.Foreground = Brushes.Red;

            mathSettings.Substitute = SubstituteCheckBox.IsChecked ?? false;
            mathSettings.ZeroSmallMatrixElements = ZeroSmallMatrixElementsCheckBox.IsChecked ?? false;
        }

        private void GetPlotSettings()
        {
            var plotSettings = _parser.Settings.Plot;
            plotSettings.ColorScale = (PlotSettings.ColorScales)ColorScaleComboBox.SelectedIndex;
            plotSettings.Shadows = ShadowsCheckBox.IsChecked ?? false;
            plotSettings.SmoothScale = SmoothCheckBox.IsChecked ?? false;
            plotSettings.LightDirection = (PlotSettings.LightDirections)LightDirectionComboBox.SelectedIndex;
            if (EmbedCheckBox.IsChecked ?? false)
            {
                plotSettings.ImagePath = string.Empty;
                plotSettings.ImageUri = string.Empty;
            }
            else
            {
                string imagePath;
                if (string.IsNullOrEmpty(_cfn))
                    imagePath = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
                else
                    imagePath = Path.GetDirectoryName(_cfn);

                imagePath += "\\Hekatan Plots\\" + _tempDir;
                if (Directory.Exists(imagePath))
                    ClearTempFolder(imagePath);

                plotSettings.ImagePath = imagePath;
                plotSettings.ImageUri = "file:///" + imagePath.Replace('\\', '/');
            }
        }

        private static void ClearTempFolder(string path)
        {
            try
            {
                var dir = new DirectoryInfo(path);
                foreach (var f in dir.GetFiles())
                    f.Delete();
            }
            catch (Exception e)
            {
                ShowErrorMessage(e.Message);
            }
        }

        private async void CalculateAsync(bool toWebForm = false)
        {
            var sw = HekatanTelemetry.BeginOperation("CalculateAsync", new { ToWebForm = toWebForm });

            // Thread-safe check: try to acquire semaphore without blocking
            if (!await _parsingSemaphore.WaitAsync(0))
            {
                HekatanTelemetry.LogEvent("CALCULATE", "Skipped - already parsing (semaphore busy)");
                return;
            }

            try
            {
            // Legacy flag for UI state tracking
            if (_isParsing)
            {
                HekatanTelemetry.LogEvent("CALCULATE", "Skipped - already parsing");
                _parsingSemaphore.Release();
                return;
            }

            GetMathSettings();
            GetPlotSettings();
            if (IsWebForm && !toWebForm && !await GetAndSetInputFieldsAsync())
            {
                HekatanTelemetry.LogEvent("CALCULATE", "Cancelled - GetAndSetInputFieldsAsync returned false");
                return;
            }

            // Process through HekatanProcessor (MultLang → Macros → Expression)
            // Use editor content directly - AvalonEdit preserves spaces correctly
            string inputCode = InputText;
            HekatanTelemetry.LogEvent("CALCULATE", "Starting calculation", new { InputCodeLength = inputCode.Length });

            // STEP 1: Pre-process and show text/headings (lines with ' and ") immediately with dynamic progress
            var initialContentBuilder = new System.Text.StringBuilder();
            var lines = inputCode.Split('\n');
            int lineCount = 0;

            foreach (var line in lines)
            {
                lineCount++;
                var trimmed = line.Trim();

                // Process lines starting with " (headings)
                if (trimmed.StartsWith("\"") && trimmed.Length > 1)
                {
                    var headingText = trimmed.Substring(1).Trim('"');
                    initialContentBuilder.AppendLine($"<h3>{System.Web.HttpUtility.HtmlEncode(headingText)}</h3>");
                }
                // Process lines starting with ' (text/HTML)
                else if (trimmed.StartsWith("'") && trimmed.Length > 1)
                {
                    var content = trimmed.Substring(1); // Remove leading '

                    // Check if it's HTML (starts with <)
                    if (content.TrimStart().StartsWith("<"))
                    {
                        // It's HTML - render directly
                        initialContentBuilder.AppendLine(content);
                    }
                    else
                    {
                        // It's text - wrap in paragraph
                        initialContentBuilder.AppendLine($"<p style='color:#333;'>{System.Web.HttpUtility.HtmlEncode(content)}</p>");
                    }
                }

                // Stop after 100 lines to avoid blocking
                if (lineCount >= 100)
                    break;
            }

            // Show initial content with a progress message
            var initialHtml = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{
            font-family: 'Segoe UI', Arial, sans-serif;
            padding: 20px;
            background: #f5f5f5;
        }}
        .progress-indicator {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px;
            margin: 20px 0;
            position: sticky;
            top: 20px;
            animation: pulse 2s ease-in-out infinite;
        }}
        @keyframes pulse {{
            0%, 100% {{ opacity: 1; }}
            50% {{ opacity: 0.8; }}
        }}
        .progress-indicator::before {{
            content: '⏳ ';
            font-size: 18px;
        }}
    </style>
</head>
<body>
{initialContentBuilder}
    <div id='progress-message' class='progress-indicator'>Ejecutando...</div>
</body>
</html>";

            if (initialContentBuilder.Length > 0)
            {
                HekatanTelemetry.LogWebViewNavigation("Initial parsed content", initialHtml.Length);
                HekatanTelemetry.SaveOutputHtml(initialHtml, "initial");
                WebViewer.NavigateToString(initialHtml);
            }

            // STEP 2: Create progress callback to update progress message dynamically
            Action<string> progressCallback = (message) =>
            {
                // Update UI on UI thread
                Dispatcher.Invoke(() =>
                {
                    try
                    {
                        // Update progress message using JavaScript
                        var script = $"document.getElementById('progress-message').textContent = '{message.Replace("'", "\\'")}';";
                        _wv2Warper.ExecuteScriptAsync(script);

                        HekatanTelemetry.LogEvent("PROGRESS", $"Progress update: {message}");
                    }
                    catch (Exception ex)
                    {
                        HekatanTelemetry.LogError("PROGRESS", ex, "Error during progress callback");
                    }
                });
            };

            // STEP 2.5: Create partial result callback to show HTML results WHILE processing
            var partialHtmlBuilder = new System.Text.StringBuilder();
            if (initialContentBuilder.Length > 0)
            {
                // Add initial content to the accumulator
                partialHtmlBuilder.Append(initialContentBuilder.ToString());
            }

            Action<string> partialResultCallback = (htmlChunk) =>
            {
                try
                {
                    var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss}] MainWindow partialResultCallback CALLED! (chunk length: {htmlChunk?.Length ?? 0})\n");
                }
                catch { }

                // Update UI on UI thread
                Dispatcher.Invoke(() =>
                {
                    try
                    {
                        // Append new HTML chunk to accumulator
                        partialHtmlBuilder.AppendLine(htmlChunk);

                        // Update OUTPUT with accumulated HTML + progress indicator
                        var currentHtml = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{
            font-family: 'Segoe UI', Arial, sans-serif;
            padding: 20px;
            background: #f5f5f5;
        }}
        .progress-indicator {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px;
            margin: 20px 0;
            position: sticky;
            top: 20px;
            animation: pulse 2s ease-in-out infinite;
        }}
        @keyframes pulse {{
            0%, 100% {{ opacity: 1; }}
            50% {{ opacity: 0.8; }}
        }}
        .progress-indicator::before {{
            content: '⏳ ';
            font-size: 18px;
        }}
    </style>
</head>
<body>
{partialHtmlBuilder}
    <div id='progress-message' class='progress-indicator'>Procesando...</div>
</body>
</html>";

                        // If HTML contains IFC viewer, save to file and navigate via Virtual Host
                        if (currentHtml.Contains("calcpad.ifc/"))
                        {
                            var ifcHtmlPath = System.IO.Path.Combine(AppInfo.Path, "resources", "ifc", "_output.html");

                            // Replace file:// URLs with https://calcpad.local/ Virtual Host URLs
                            var docUrl = $"file:///{AppInfo.DocPath.Replace("\\", "/")}";
                            var ifcCurrentHtml = currentHtml.Replace(docUrl, "https://calcpad.local");

                            System.IO.File.WriteAllText(ifcHtmlPath, ifcCurrentHtml, System.Text.Encoding.UTF8);
                            WebViewer.CoreWebView2.Navigate("https://calcpad.ifc/_output.html");
                        }
                        else
                        {
                            WebViewer.NavigateToString(currentHtml);
                        }
                        HekatanTelemetry.LogEvent("PARTIAL_RESULT", $"Updated OUTPUT with partial result (length: {htmlChunk.Length})");
                    }
                    catch (Exception ex)
                    {
                        HekatanTelemetry.LogError("PARTIAL_RESULT", ex, "Error during partialResultCallback");
                    }
                });
            };

            // STEP 3: Process through the pipeline ASYNCHRONOUSLY
            // IMPORTANT: addLineNumbers=false for now because line numbers break mixed mode processing
            var processingResult = await _calcpadProcessor.ProcessCodeAsync(inputCode, addLineNumbers: false, progressCallback: progressCallback, partialResultCallback: partialResultCallback);

            HekatanTelemetry.LogEvent("PROCESS", "ProcessCode completed", new
            {
                Success = processingResult.Success,
                MultilangProcessed = processingResult.MultilangProcessed,
                HasMacroErrors = processingResult.HasMacroErrors,
                ProcessedCodeLength = processingResult.ProcessedCode?.Length ?? 0
            });

            if (!processingResult.Success)
            {
                HekatanTelemetry.LogError("PROCESS", new Exception(processingResult.ErrorMessage), "ProcessCode failed");
                ShowErrorMessage($"Processing error: {processingResult.ErrorMessage}");
                return;
            }

            string outputText = processingResult.ProcessedCode;

            // Don't process image paths or macros if external code was executed
            // (output is already complete HTML)
            if (!processingResult.MultilangProcessed)
            {
                if (_highlighter.Defined.HasMacros)
                {
                    outputText = SetImageLocalPath(outputText);
                    _htmlUnwarpedCode = processingResult.HasMacroErrors || DisplayUnwarpedCode ?
                        CodeToHtml(outputText) :
                        string.Empty;
                }
                else
                {
                    outputText = SetImageLocalPath(outputText);  // FIX: use outputText (processed) not inputCode (original)
                    _htmlUnwarpedCode = string.Empty;
                }
            }
            string htmlResult;

            // Use centralized HekatanOutputProcessor for MultilangProcessed and macro error paths.
            // The normal Hekatan parsing path stays here because it needs WPF-specific async UI flow.
            if (processingResult.MultilangProcessed || processingResult.HasMacroErrors)
            {
                // Centralized decision tree (shared with CLI)
                var outputResult = HekatanOutputProcessor.Process(
                    processingResult,
                    // Inline executor: reuses WPF's _parser for shared variable state
                    inlineExecutor: calcpadCode =>
                    {
                        _parser.Parse(calcpadCode, false);
                        var htmlSnippet = _parser.HtmlResult;
                        // Extract inner content from <p> wrapper
                        var match = System.Text.RegularExpressions.Regex.Match(htmlSnippet, @"<p[^>]*>(.*?)</p>", System.Text.RegularExpressions.RegexOptions.Singleline);
                        return match.Success ? match.Groups[1].Value : htmlSnippet;
                    },
                    // Full parser: not used in this path (MultilangProcessed=true or HasMacroErrors=true)
                    fullParser: code => (_parser.HtmlResult, new System.Collections.Generic.List<string>())
                );

                WebViewer.Tag = false;
                htmlResult = HtmlApplyWorksheet(outputResult.HtmlContent);
                SetOutputFrameHeader(IsWebForm);
                IsCalculated = true;
            }
            else if (!string.IsNullOrEmpty(_htmlUnwarpedCode) && !(IsWebForm || toWebForm))
            {
                WebViewer.Tag = true;
                htmlResult = _htmlUnwarpedCode;
                if (toWebForm)
                    IsWebForm = false;
                OutputFrame.Header = MainWindowResources.Unwarped_code;
                CodeCheckBox.IsChecked = true;
            }
            else
            {
                // Normal Hekatan processing - use ExpressionParser
                // This path stays WPF-specific because of async UI (parsing indicator, thread offloading)
                _parser.Debug = !IsWebForm;
                WebViewer.Tag = false;
                if (toWebForm)
                    _parser.Parse(outputText, false);
                else
                {
                    _isParsing = true;
                    WebFormButton.IsEnabled = false;
                    MenuWebForm.IsEnabled = false;
                    FreezeOutputButtons(true);
                    try
                    {
                        var delayScript = $"setTimeout(function(){{window.location.replace(\"{_htmlParsingUrl}\");}},1000);";
                        await WebViewer.ExecuteScriptAsync(delayScript);
                    }
                    catch
                    {
                        _wv2Warper.Navigate(_htmlParsingPath);
                    }
                    void parse() => _parser.Parse(outputText);
                    await Task.Run(parse);
                    if (!IsWebForm)
                    {
                        MenuWebForm.IsEnabled = true;
                        WebFormButton.IsEnabled = true;
                    }
                    FreezeOutputButtons(false);
                    IsCalculated = !_parser.IsPaused;
                }

                htmlResult = HtmlApplyWorksheet(FixHref(_parser.HtmlResult));

                // Process MULTILANG_OUTPUT markers (from mixed mode external code execution)
                htmlResult = Hekatan.Common.GlobalParser.ProcessMultilangOutputMarkers(htmlResult);

                SetOutputFrameHeader(IsWebForm);
            }
            _autoRun = false;
            try
            {
                if (!string.IsNullOrEmpty(htmlResult))
                {
                    HekatanTelemetry.LogWebViewNavigation("Final HTML result", htmlResult.Length);
                    HekatanTelemetry.LogEvent("OUTPUT", "Rendering final HTML to WebViewer", new { HtmlLength = htmlResult.Length, MultilangProcessed = processingResult.MultilangProcessed });
                    HekatanTelemetry.SaveOutputHtml(htmlResult, "final");

                    // If HTML contains IFC viewer (uses calcpad.ifc virtual host), save to file and navigate
                    // This is necessary because NavigateToString uses file:// origin which can't access https://calcpad.ifc/
                    if (htmlResult.Contains("calcpad.ifc/"))
                    {
                        var ifcHtmlPath = System.IO.Path.Combine(AppInfo.Path, "resources", "ifc", "_output.html");

                        // Replace file:// URLs with https://calcpad.local/ Virtual Host URLs
                        // This is necessary because file:// protocol doesn't work from https://calcpad.ifc/ context
                        var docUrl = $"file:///{AppInfo.DocPath.Replace("\\", "/")}";
                        var ifcHtmlResult = htmlResult.Replace(docUrl, "https://calcpad.local");

                        System.IO.File.WriteAllText(ifcHtmlPath, ifcHtmlResult, System.Text.Encoding.UTF8);
                        WebViewer.CoreWebView2.Navigate("https://calcpad.ifc/_output.html");
                        HekatanTelemetry.LogEvent("OUTPUT", "Navigated to IFC HTML via Virtual Host");
                    }
                    else
                    {
                        await _wv2Warper.NavigateToStringAsync(htmlResult);
                    }
                }
            }
            catch (Exception e)
            {
                HekatanTelemetry.LogError("OUTPUT", e, "Error navigating to final HTML");
                ShowErrorMessage(e.Message);
            }
            if (IsWebForm)
                OutputFrame.Header = toWebForm ? MainWindowResources.Input : MainWindowResources.Output;
            if (_highlighter.Defined.HasMacros && string.IsNullOrEmpty(_htmlUnwarpedCode))
                _htmlUnwarpedCode = CodeToHtml(outputText);

            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-calculate-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss.fff}] CalculateAsync() FIN - IsCalculated={IsCalculated}, MultilangProcessed={processingResult.MultilangProcessed}\n");
            }
            catch { }

            HekatanTelemetry.EndOperation("CalculateAsync", sw, new { Success = true });
            }
            finally
            {
                // Always reset parsing flag and release the semaphore when done
                _isParsing = false;
                _parsingSemaphore.Release();
            }
        }

        private void FreezeOutputButtons(bool freeze)
        {
            var isEnabled = !freeze;
            MenuOutput.IsEnabled = isEnabled;
            CalcButton.IsEnabled = isEnabled;
            PdfButton.IsEnabled = isEnabled;
            WordButton.IsEnabled = isEnabled;
            CopyOutputButton.IsEnabled = isEnabled;
            SaveOutputButton.IsEnabled = isEnabled;
            PrintButton.IsEnabled = isEnabled;
            if (freeze)
                Cursor = Cursors.Wait;
            else
                Cursor = Cursors.Arrow;
        }

        private static string FixHref(string text)
        {
            var s = HtmlAnchorHrefRegex.Replace(text, @"#0"" data-text=""");
            s = HtmlAnchorTargetRegex.Replace(s, "");
            return s;
        }

        private string SetImageLocalPath(string s)
        {
            if (string.IsNullOrWhiteSpace(CurrentFileName))
                return s;

            var path = Path.GetDirectoryName(CurrentFileName);
            var s1 = s;
            var parent = Directory.GetDirectoryRoot(path);
            if (!string.Equals(parent, path, StringComparison.OrdinalIgnoreCase))
            {
                parent = Directory.GetParent(path).FullName;
                parent = "file:///" + parent.Replace('\\', '/');
                s1 = HtmlImgPrevRegex.Replace(s, @"src=""" + parent);
            }
            path = "file:///" + path.Replace('\\', '/');
            var s2 = HtmlImgCurRegex.Replace(s1, @"src=""" + path);
            return s2;
        }

        private string CodeToHtml(string code)
        {
            var ErrorString = AppMessages.ErrorString;
            var highlighter = new HighLighter();
            var errors = new Queue<int>();
            _stringBuilder.Clear();
            _stringBuilder.Append(_htmlSource);
            var lines = code.EnumerateLines();
            _stringBuilder.AppendLine("<div class=\"code\">");
            highlighter.Defined.Get(lines, IsComplex);
            var indent = 0.0;
            var lineNumber = 0;
            foreach (var line in lines)
            {
                ++lineNumber;
                var i = line.IndexOf('\v');
                var lineText = i < 0 ? line : line[..i];
                var sourceLine = i < 0 ? lineNumber.ToString() : line[(i + 1)..];
                _stringBuilder.Append($"<p class=\"line-text\" id=\"line-{lineNumber}\"><a class=\"line-num\" href=\"#0\" data-text=\"{sourceLine}\" title=\"Source line {sourceLine}\">{lineNumber}</a>");
                if (line.StartsWith(ErrorString))
                {
                    errors.Enqueue(lineNumber);
                    _stringBuilder.Append($"<span class=\"error\">{lineText}</span>");
                }
                else
                {
                    var p = new Paragraph();
                    highlighter.Parse(p, IsComplex, lineNumber, true, lineText.ToString());
                    if (!UpdateIndent(p, ref indent))
                        p.TextIndent = indent;

                    var steps = 4 * p.TextIndent / AutoIndentStep;
                    for (int j = 0; j < steps; ++j)
                        _stringBuilder.Append("&nbsp;");

                    foreach (var inline in p.Inlines)
                    {
                        if (inline is not Run r)
                            continue;

                        var cls = HighLighter.GetCSSClassFromColor(r.Foreground);
                        if (r.Background is SolidColorBrush brush && 
                            brush.Color.R > brush.Color.G)
                                cls = "error";

                        var htmlEncodedText = HttpUtility.HtmlEncode(r.Text);
                        if (string.IsNullOrEmpty(cls))
                            _stringBuilder.Append(htmlEncodedText);
                        else
                            _stringBuilder.Append($"<span class=\"{cls}\">{htmlEncodedText}</span>");
                    }
                }
                _stringBuilder.Append("</p>");
            }
            _stringBuilder.Append("</div>");
            if (errors.Count != 0 && lineNumber > 30)
            {
                _stringBuilder.AppendLine(string.Format(MainWindowResources.Found_Errors_In_Modules_And_Macros, errors.Count));
                var count = 0;
                while (errors.Count != 0 && ++count < 20)
                {
                    var line = errors.Dequeue();
                    _stringBuilder.Append($" <span class=\"roundBox\" data-line=\"{line}\">{line}</span>");
                }
                if (errors.Count > 0)
                    _stringBuilder.Append(" ...");

                _stringBuilder.Append("</div>");
                _stringBuilder.AppendLine("<style>body {padding-top:1.1em;}</style>");
            }
            _stringBuilder.Append("</body></html>");
            return _stringBuilder.ToString();
        }

        private static string[] GetLocalImages(string s)
        {
            MatchCollection matches = HtmlImgAnyRegex.Matches(s);
            var n = matches.Count;
            if (n == 0)
                return null;

            string[] images = new string[n];
            for (int i = 0; i < n; ++i)
                images[i] = matches[i].Value;

            return images;
        }

        private string HtmlApplyWorksheet(string s)
        {
            _stringBuilder.Clear();
            var ssf = Math.Round(0.9 * Math.Sqrt(_screenScaleFactor), 2).ToString(CultureInfo.InvariantCulture);
            _stringBuilder.Append(_htmlWorksheet.Replace("var(--screen-scale-factor)", ssf));
            _stringBuilder.Append(s);
            if (_scrollY > 0)
            {
                _stringBuilder.Append($"<script>window.onload = function() {{ window.scrollTo(0, {_scrollY}); }};</script>");
                _scrollY = 0;
            }
            _stringBuilder.Append(" </body></html>");
            return _stringBuilder.ToString();
        }

        private void ShowHelp()
        {
            if (!_isParsing)
            {
                _wv2Warper.Navigate(_htmlHelpPath);
                // Reset parsing flag since we're navigating away from results
                _isParsing = false;
            }
        }

        private static string GetHelp(string helpURL)
        {
            var fileName = $"{AppInfo.DocPath}\\help.{_currentCultureName}.html";
            if (!File.Exists(fileName))
                fileName = $"{AppInfo.DocPath}\\help.html";

            return fileName;
        }

        /// <summary>
        /// Checks if a file has a compressed Hekatan format (.hcalcz or .cpdz)
        /// </summary>
        private static bool IsCompressedFormat(string fileName)
        {
            var ext = Path.GetExtension(fileName);
            return string.Equals(ext, ".hcalcz", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(ext, ".cpdz", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Checks if a file is a Hekatan worksheet (.hcalc, .cpd, .hcalcz, .cpdz, .txt)
        /// </summary>
        /// <summary>
        /// Returns the @{} directive name for a source code file extension, or null if not a code file.
        /// Used to wrap .py, .cpp, etc. files in @{lang}...@{end lang} when opened.
        /// </summary>
        private static string? GetLanguageDirectiveForExtension(string ext) => ext switch
        {
            ".py" => "python",
            ".cpp" or ".cc" or ".cxx" => "cpp",
            ".c" => "c",
            ".js" => "js",
            ".ts" or ".tsx" => "ts",
            ".f90" or ".f95" or ".f03" or ".f" => "fortran",
            ".rs" => "rust",
            ".cs" => "csharp",
            ".go" => "go",
            ".lua" => "lua",
            ".rb" => "ruby",
            ".pl" => "perl",
            ".php" => "php",
            ".sh" => "bash",
            ".ps1" => "powershell",
            ".m" => "octave",
            ".jl" => "julia",
            ".r" => "r",
            ".hs" => "haskell",
            ".d" => "d",
            ".html" or ".htm" => "html",
            ".md" => "markdown",
            ".css" => "css",
            ".tcl" => "opensees",
            _ => null
        };

        private static bool IsHekatanFile(string fileName)
        {
            var ext = Path.GetExtension(fileName).ToLowerInvariant();
            return ext is ".hcalc" or ".cpd" or ".hcalcz" or ".cpdz" or ".txt";
        }

        private static string ReadTextFromFile(string fileName)
        {
            try
            {
                if (IsCompressedFormat(fileName))
                {
                    if (Zip.IsComposite(fileName))
                        return Zip.DecompressWithImages(fileName);

                    var f = new FileInfo(fileName)
                    {
                        IsReadOnly = false
                    };
                    using var fs = f.OpenRead();
                    return Zip.DecompressToString(fs);
                }
                else
                {
                    using var sr = new StreamReader(fileName, Encoding.UTF8);
                    return sr.ReadToEnd();
                }
            }
            catch (Exception ex)
            {
                ShowErrorMessage(ex.Message);
                return string.Empty;
            }
        }

        private static async Task<string> ReadTextFromFileAsync(string fileName)
        {
            try
            {
                if (IsCompressedFormat(fileName))
                {
                    if (Zip.IsComposite(fileName))
                        return Zip.DecompressWithImages(fileName);

                    var f = new FileInfo(fileName)
                    {
                        IsReadOnly = false
                    };
                    using var fs = f.OpenRead();
                    return Zip.DecompressToString(fs);
                }
                else
                {
                    using var sr = new StreamReader(fileName, Encoding.UTF8);
                    return await sr.ReadToEndAsync();
                }
            }
            catch (Exception ex)
            {
                ShowErrorMessage(ex.Message);
                return string.Empty;
            }
        }

        private static SpanLineEnumerator ReadLines(string fileName)
        {
            var lines = new SpanLineEnumerator();
            try
            {
                if (IsCompressedFormat(fileName))
                {
                    if (Zip.IsComposite(fileName))
                        lines = Zip.DecompressWithImages(fileName).EnumerateLines();
                    else
                    {
                        var f = new FileInfo(fileName)
                        {
                            IsReadOnly = false
                        };
                        using var fs = f.OpenRead();
                        lines = Zip.Decompress(fs);
                    }
                }
                else
                {
                    return File.ReadAllText(fileName, Encoding.UTF8).EnumerateLines();
                }
            }
            catch (Exception ex)
            {
                ShowErrorMessage(ex.Message);
            }
            return lines;
        }

        private static void WriteFile(string fileName, string s, bool zip = false)
        {
            try
            {
                if (zip)
                {
                    var images = GetLocalImages(s);
                    Zip.CompressWithImages(s, images, fileName);
                }
                else
                {
                    using var sw = new StreamWriter(fileName);
                    sw.Write(s);
                }
            }
            catch (Exception ex)
            {
                ShowErrorMessage(ex.Message);
            }
        }

        private bool GetInputTextFromFile()
        {
            System.Diagnostics.Debug.WriteLine($"[GetInputTextFromFile] _isAvalonEditActive={_isAvalonEditActive}, _currentEditorMode={_currentEditorMode}");

            // FIXED: Check if MathEditor is VISIBLE (not just the mode flag)
            // This ensures files load correctly even if mode flag is stale
            if (MathEditorControl != null && MathEditorControl.Visibility == Visibility.Visible)
            {
                System.Diagnostics.Debug.WriteLine("[GetInputTextFromFile] MathEditor is VISIBLE, loading to MathEditor");
                return GetInputTextFromFile_MathEditor();
            }

            // OPTIMIZATION: If AvalonEdit is active, load file directly to AvalonEdit
            // This prevents loading the file twice (RichTextBox + AvalonEdit sync)
            if (_isAvalonEditActive && TextEditor != null && TextEditor.Visibility == Visibility.Visible)
            {
                System.Diagnostics.Debug.WriteLine("[GetInputTextFromFile] AvalonEdit is VISIBLE, loading to AvalonEdit");
                return GetInputTextFromFile_AvalonEdit();
            }

            System.Diagnostics.Debug.WriteLine("[GetInputTextFromFile] Loading to RichTextBox");

            // Read lines directly from file like GitHub version - this prevents space collapsing
            var lines = ReadLines(CurrentFileName);

            _isTextChangedEnabled = false;
            RichTextBox.BeginChange();
            _document.Blocks.Clear();
            SetCodeCheckBoxVisibility();
            _highlighter.Defined.Get(lines, IsComplex);

            var hasForm = false;

            // Check if this is an external language file
            var isExternalLanguage = false;
            foreach (var checkLine in lines)
            {
                var trimmed = checkLine.Trim().ToString();
                if (!string.IsNullOrEmpty(trimmed))
                {
                    // Check if it starts with a language directive (new syntax @{language})
                    // Use MultLangManager.DetectDirective for proper detection including @{ts:filename} syntax
                    var (isDirective, _, _) = Hekatan.Common.MultLangCode.MultLangManager.DetectDirective(trimmed);
                    if (isDirective)
                    {
                        isExternalLanguage = true;
                        break; // Found external language directive, stop searching
                    }
                }
            }

            // Enable external language mode (no operator replacement)
            _highlighter.DisableOperatorReplacement = isExternalLanguage;

            foreach (var line in lines)
            {
                ReadOnlySpan<char> s;
                if (line.Contains('\v'))
                {
                    hasForm = true;
                    var n = line.IndexOf('\v');
                    if (n == 0)
                    {
                        SetInputFieldsFromFile(line[1..].EnumerateSplits('\t'));
                        break;
                    }
                    else
                    {
                        SetInputFieldsFromFile(line[(n + 1)..].EnumerateSplits('\t'));
                        s = line[..n];
                    }
                }
                else
                {
                    // Don't apply Hekatan operator transformations to external languages
                    if (isExternalLanguage)
                    {
                        s = line.TrimStart('\t');
                    }
                    else
                    {
                        s = ReplaceCStyleOperators(line.TrimStart('\t'));
                        if (!hasForm)
                            hasForm = MacroParser.HasInputFields(s);
                    }
                }

                // Create Run with xml:space="preserve" to prevent space collapsing
                var run = new Run(s.ToString());
                run.SetValue(System.Windows.Markup.XmlAttributeProperties.XmlSpaceProperty, "preserve");
                _document.Blocks.Add(new Paragraph(run));
            }
            if (_document.Blocks.Count == 0)
                _document.Blocks.Add(new Paragraph(new Run()));

            var b = _document.Blocks.LastBlock;
            if (b.ContentStart.GetOffsetToPosition(b.ContentEnd) == 0)
                _document.Blocks.Remove(b);

            _currentParagraph = RichTextBox.Selection.Start.Paragraph;
            _currentLineNumber = GetLineNumber(_currentParagraph);
            _undoMan.Reset();
            Record();
            RichTextBox.EndChange();
            _isTextChangedEnabled = true;
            _forceHighlight = true;

            // Sync content to AvalonEdit if it's active
            if (_isAvalonEditActive && TextEditor != null)
            {
                SyncContentToAvalonEdit();
            }

            return hasForm;
        }

        /// <summary>
        /// Fast file loading for AvalonEdit - bypasses RichTextBox completely
        /// Supports large files with wait cursor
        /// </summary>
        private bool GetInputTextFromFile_AvalonEdit()
        {
            bool hasForm = false;
            string fileContent = string.Empty;

            try
            {
                // Read file content directly as string
                fileContent = ReadTextFromFile(CurrentFileName);
                System.Diagnostics.Debug.WriteLine($"[GetInputTextFromFile_AvalonEdit] File: {CurrentFileName}, Content length: {fileContent?.Length ?? 0}");

                if (string.IsNullOrEmpty(fileContent))
                {
                    System.Diagnostics.Debug.WriteLine("[GetInputTextFromFile_AvalonEdit] File is empty or null");
                    return false;
                }

                hasForm = fileContent.Contains('\v') || fileContent.Contains("? {");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[GetInputTextFromFile_AvalonEdit] Error reading file: {ex.Message}");
                MessageBox.Show($"Error al leer el archivo:\n{ex.Message}", "Hekatan Calc", MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }

            // Check file size for optimizations
            var isLargeFile = fileContent.Length > 50_000; // > 50KB
            var isVeryLargeFile = fileContent.Length > 150_000; // > 150KB
            var isExtremelyLargeFile = fileContent.Length > 400_000; // > 400KB - handle with extra care

            // Show wait cursor for large files
            if (isLargeFile)
            {
                Mouse.OverrideCursor = Cursors.Wait;
            }

            // For extremely large files, show a warning and give option to cancel
            if (isExtremelyLargeFile)
            {
                var result = MessageBox.Show(
                    $"El archivo tiene {fileContent.Length / 1024} KB y puede tardar en cargar.\n" +
                    "Se desactivarán algunas funciones de edición para mejorar el rendimiento.\n\n" +
                    "¿Desea continuar?",
                    "Archivo muy grande",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning);
                if (result == MessageBoxResult.No)
                {
                    Mouse.OverrideCursor = null;
                    return false;
                }
            }

            try
            {
                _isSyncingEditors = true;
                _isTextChangedEnabled = false;

                // For large files, disable highlighting and folding during load
                var transformers = TextEditor?.TextArea?.TextView?.LineTransformers;
                HekatanHighlighter highlighter = null;

                if (transformers != null)
                {
                    highlighter = transformers.FirstOrDefault(t => t is HekatanHighlighter) as HekatanHighlighter;

                    if (isLargeFile && highlighter != null)
                        transformers.Remove(highlighter);
                }

                if (isLargeFile && _foldingManager != null)
                {
                    try
                    {
                        ICSharpCode.AvalonEdit.Folding.FoldingManager.Uninstall(_foldingManager);
                    }
                    catch { /* Ignore folding errors */ }
                    _foldingManager = null;
                }

                // Load text with BeginUpdate/EndUpdate to minimize UI updates
                if (TextEditor?.Document != null)
                {
                    TextEditor.Document.BeginUpdate();
                    try
                    {
                        TextEditor.Document.Text = fileContent;
                    }
                    finally
                    {
                        TextEditor.Document.EndUpdate();
                    }
                }

                // Re-enable features for large (but not very large) files
                if (transformers != null && isLargeFile && !isVeryLargeFile)
                {
                    // Re-add highlighter
                    if (highlighter != null && !transformers.Contains(highlighter))
                        transformers.Add(highlighter);

                    // Re-install folding
                    if (_foldingManager == null && TextEditor?.TextArea != null)
                        _foldingManager = ICSharpCode.AvalonEdit.Folding.FoldingManager.Install(TextEditor.TextArea);

                    UpdateFoldingsInternal();
                }
                // For very large files, leave features disabled

                TextEditor?.TextArea?.TextView?.Redraw();
            }
            catch (OutOfMemoryException)
            {
                MessageBox.Show(
                    "El archivo es demasiado grande para cargarlo.\n" +
                    "Por favor, divídalo en archivos más pequeños.",
                    "Error de memoria",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                return false;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[GetInputTextFromFile_AvalonEdit] Error loading to editor: {ex.Message}");
                MessageBox.Show($"Error al cargar el archivo en el editor:\n{ex.Message}", "Hekatan Calc", MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }
            finally
            {
                _isSyncingEditors = false;
                _isTextChangedEnabled = true;
                if (isLargeFile)
                    Mouse.OverrideCursor = null;
            }

            _undoMan.Reset();
            return hasForm;
        }

        private async Task GetInputTextFromFile_AvalonEditAsync()
        {
            var fileName = CurrentFileName;
            System.Diagnostics.Debug.WriteLine($"[GetInputTextFromFile_AvalonEditAsync] Starting async load: {fileName}");

            // Check file size to determine if we need special handling for large files
            var fileInfo = new FileInfo(fileName);
            var isLargeFile = fileInfo.Exists && fileInfo.Length > 50_000; // > 50KB = large file
            var isVeryLargeFile = fileInfo.Exists && fileInfo.Length > 150_000; // > 150KB = very large (NO highlighting)

            // Read file asynchronously in background thread FIRST
            string fileContent = await Task.Run(() => ReadTextFromFile(fileName));

            System.Diagnostics.Debug.WriteLine($"[GetInputTextFromFile_AvalonEditAsync] File read: {fileContent?.Length ?? 0} chars, isLarge: {isLargeFile}, isVeryLarge: {isVeryLargeFile}");

            // Quick scan for input fields
            var hasForm = fileContent.Contains('\v') || fileContent.Contains("? {");

            // Load to AvalonEdit on UI thread with optimizations
            System.Diagnostics.Debug.WriteLine("[DIAG] Starting Dispatcher.InvokeAsync for text load...");
            var loadStopwatch = System.Diagnostics.Stopwatch.StartNew();
            await Dispatcher.InvokeAsync(() =>
            {
                try
                {
                    System.Diagnostics.Debug.WriteLine("[DIAG] Inside Dispatcher - setting flags");
                    _isSyncingEditors = true;
                    _isTextChangedEnabled = false;

                    // OPTIMIZATION: For large files, disable ALL visual features during load
                    var transformers = TextEditor.TextArea.TextView.LineTransformers;
                    var highlighter = transformers.FirstOrDefault(t => t is HekatanHighlighter);
                    System.Diagnostics.Debug.WriteLine($"[DIAG] Highlighter found: {highlighter != null}");

                    // Remove highlighter for large files
                    if (isLargeFile && highlighter != null)
                    {
                        transformers.Remove(highlighter);
                        System.Diagnostics.Debug.WriteLine("[DIAG] Highlighter removed for large file");
                    }

                    // Uninstall folding for large files
                    if (isLargeFile && _foldingManager != null)
                    {
                        ICSharpCode.AvalonEdit.Folding.FoldingManager.Uninstall(_foldingManager);
                        _foldingManager = null;
                        System.Diagnostics.Debug.WriteLine("[DIAG] Folding manager uninstalled");
                    }

                    // CRITICAL: Use Document.BeginUpdate/EndUpdate to batch all changes
                    System.Diagnostics.Debug.WriteLine("[DIAG] Starting Document.BeginUpdate...");
                    TextEditor.Document.BeginUpdate();
                    try
                    {
                        // Clear and replace in one operation
                        System.Diagnostics.Debug.WriteLine($"[DIAG] Setting Document.Text ({fileContent.Length} chars)...");
                        TextEditor.Document.Text = fileContent;
                        System.Diagnostics.Debug.WriteLine("[DIAG] Document.Text set successfully");
                    }
                    finally
                    {
                        System.Diagnostics.Debug.WriteLine("[DIAG] Calling Document.EndUpdate...");
                        TextEditor.Document.EndUpdate();
                        System.Diagnostics.Debug.WriteLine("[DIAG] Document.EndUpdate completed");
                    }

                    // For very large files, don't re-enable features automatically
                    // User can manually enable them or wait for gradual enabling
                    if (isVeryLargeFile)
                    {
                        System.Diagnostics.Debug.WriteLine("[GetInputTextFromFile_AvalonEditAsync] Very large file - features disabled");
                        // Don't re-enable highlighter or folding for very large files
                        // User experience is better with plain text than with frozen UI
                    }
                    else if (isLargeFile)
                    {
                        // For large (but not very large) files, re-enable after delay
                        Dispatcher.InvokeAsync(async () =>
                        {
                            // Wait a bit for UI to settle
                            await Task.Delay(500);

                            // Re-add highlighter
                            if (highlighter != null && !transformers.Contains(highlighter))
                                transformers.Add(highlighter);

                            // Re-install folding
                            if (_foldingManager == null)
                            {
                                _foldingManager = ICSharpCode.AvalonEdit.Folding.FoldingManager.Install(TextEditor.TextArea);
                            }

                            UpdateFoldingsInternal();
                            TextEditor.TextArea.TextView.Redraw();
                            System.Diagnostics.Debug.WriteLine("[GetInputTextFromFile_AvalonEditAsync] Large file features re-enabled");
                        }, System.Windows.Threading.DispatcherPriority.Background);
                    }
                    else
                    {
                        // Normal file - apply features immediately
                        TextEditor.TextArea.TextView.Redraw();
                        UpdateFoldingsInternal();
                    }
                }
                finally
                {
                    _isSyncingEditors = false;
                    _isTextChangedEnabled = true;
                }
            }, System.Windows.Threading.DispatcherPriority.Render);

            // Reset undo
            await Dispatcher.InvokeAsync(() => _undoMan.Reset());
        }

        /// <summary>
        /// Fast file loading for MathEditor - loads directly to MathEditor
        /// </summary>
        private bool GetInputTextFromFile_MathEditor()
        {
            // Read file content directly as string
            var fileContent = ReadTextFromFile(CurrentFileName);
            var hasForm = false;

            // Quick scan for input fields
            hasForm = fileContent.Contains('\v') || fileContent.Contains("? {");

            // Load directly to MathEditor
            _isSyncingBetweenModes = true;
            _isTextChangedEnabled = false;

            try
            {
                // Load content to MathEditor using FromHekatan
                MathEditorControl.FromHekatan(fileContent);

                // Also sync to the background editor (AvalonEdit or RichTextBox) for when switching modes
                if (_isAvalonEditActive && TextEditor != null)
                {
                    TextEditor.Text = fileContent;
                }
                else
                {
                    // Sync to RichTextBox in background (will be ready when switching modes)
                    Dispatcher.InvokeAsync(() =>
                    {
                        SetInputText(fileContent);
                    }, System.Windows.Threading.DispatcherPriority.Background);
                }
            }
            finally
            {
                _isSyncingBetweenModes = false;
                _isTextChangedEnabled = true;
            }

            // Reset undo
            _undoMan.Reset();

            return hasForm;
        }

        private string ReplaceCStyleOperators(ReadOnlySpan<char> s)
        {
            if (s.IsEmpty)
                return string.Empty;

            _stringBuilder.Clear();
            var commentEnumerator = s.EnumerateComments();
            foreach (var item in commentEnumerator)
            {
                if (!item.IsEmpty && item[0] != '"' && item[0] != '\'')
                {
                    foreach (var c in item)
                    {
                        if (c == '=')
                        {
                            var n = _stringBuilder.Length - 1;
                            if (n < 0)
                            {
                                _stringBuilder.Append(c);
                                break;
                            }
                            switch (_stringBuilder[n])
                            {
                                case '=':
                                    _stringBuilder[n] = '≡';
                                    break;
                                case '!':
                                    _stringBuilder[n] = '≠';
                                    break;
                                case '>':
                                    _stringBuilder[n] = '≥';
                                    break;
                                case '<':
                                    _stringBuilder[n] = '≤';
                                    break;
                                default:
                                    _stringBuilder.Append(c);
                                    break;
                            }
                        }
                        else if (c == '%')
                        {
                            var n = _stringBuilder.Length - 1;
                            if (n >= 0 && _stringBuilder[n] == '%')
                                _stringBuilder[n] = '⦼';
                            else
                                _stringBuilder.Append(c);
                        }
                        else if (c == '&')
                        {
                            var n = _stringBuilder.Length - 1;
                            if (n >= 0 && _stringBuilder[n] == '&')
                                _stringBuilder[n] = '∧';
                            else
                                _stringBuilder.Append(c);
                        }
                        else if (c == '|')
                        {
                            var n = _stringBuilder.Length - 1;
                            if (n >= 0 && _stringBuilder[n] == '|')
                                _stringBuilder[n] = '∨';
                            else
                                _stringBuilder.Append(c);
                        }
                        else
                            _stringBuilder.Append(c);
                    }
                }
                else
                    _stringBuilder.Append(item);
            }
            return _stringBuilder.ToString();
        }

        private string RevertHekatanOperators(string input)
        {
            if (string.IsNullOrEmpty(input))
                return input;

            // Revert all Hekatan operator transformations to original C-style operators
            // This is CRITICAL for external code (C++, Python, etc.) to compile/run correctly
            // Also revert smart quotes that WPF RichTextBox automatically converts
            return input
                .Replace("∠", "<<")   // Revert angle operator back to left shift/stream insertion
                .Replace("≡", "==")   // Revert equivalence back to equality
                .Replace("≠", "!=")   // Revert not equal back to C-style
                .Replace("≥", ">=")   // Revert greater or equal
                .Replace("≤", "<=")   // Revert less or equal
                .Replace("⦼", "%%")   // Revert modulo operator
                .Replace("∧", "&&")   // Revert logical AND
                .Replace("∨", "||")   // Revert logical OR
                .Replace('\u201C', '"')   // Revert left double quote (smart quote)
                .Replace('\u201D', '"')   // Revert right double quote (smart quote)
                .Replace('\u2018', '\'')  // Revert left single quote (smart quote)
                .Replace('\u2019', '\''); // Revert right single quote (smart quote)
        }

        private void Button_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            ResetText();
            DispatchLineNumbers();
            if (IsAutoRun)
                AutoRun();
        }

        private void ResetText()
        {
            _isTextChangedEnabled = false;
            RichTextBox.BeginChange();
            _document.Blocks.Clear();
            _currentParagraph = new Paragraph();
            _currentLineNumber = 1;
            _document.Blocks.Add(_currentParagraph);
            HighLighter.Clear(_currentParagraph);
            RichTextBox.EndChange();
            _isTextChangedEnabled = true;
        }

        const string Tabs = "\t\t\t\t\t\t\t\t\t\t\t\t";
        private string GetInputText()
        {
            // FIXED: Read from AvalonEdit when active (fixes SaveAs not working)
            if (_isAvalonEditActive && TextEditor != null && TextEditor.Visibility == Visibility.Visible)
            {
                return TextEditor.Text ?? string.Empty;
            }

            // Fallback to RichTextBox
            _stringBuilder.Clear();
            var b = _document.Blocks.FirstBlock;
            while (b is not null)
            {
                var n = (int)((b as Paragraph).TextIndent / AutoIndentStep);
                if (n > 12)
                    n = 12;
                var line = new TextRange(b.ContentStart, b.ContentEnd).Text;
                if (n == 0)
                    _stringBuilder.AppendLine(line);
                else
                    _stringBuilder.AppendLine(Tabs[..n] + line);
                b = b.NextBlock;
            }
            _stringBuilder.RemoveLastLineIfEmpty();
            return _stringBuilder.ToString();
        }

        /// <summary>
        /// Extracts text from a block preserving ALL spaces (not collapsed)
        /// </summary>
        private string GetTextFromBlock(System.Windows.Documents.Block block)
        {
            var paragraph = block as System.Windows.Documents.Paragraph;
            if (paragraph == null)
                return string.Empty;

            var sb = new StringBuilder();
            var inlines = paragraph.Inlines;

            foreach (var inline in inlines)
            {
                if (inline is System.Windows.Documents.Run run)
                {
                    // GetTextInRun preserves all spaces
                    var textPointer = run.ContentStart;
                    var text = textPointer.GetTextInRun(System.Windows.Documents.LogicalDirection.Forward);
                    // Convert non-breaking spaces back to regular spaces when saving
                    text = text.Replace("\u00A0", " ");
                    sb.Append(text);
                }
                else if (inline is System.Windows.Documents.LineBreak)
                {
                    // Don't add line breaks here, they're handled by paragraph separation
                }
                else if (inline is System.Windows.Documents.InlineUIContainer)
                {
                    // Skip UI elements
                }
            }

            return sb.ToString();
        }

        private async void HtmlFileSave()
        {
            var dlg = new SaveFileDialog
            {
                DefaultExt = ".html",
                Filter = "Html Files (*.html)|*.html",
                FileName = Path.ChangeExtension(Path.GetFileName(CurrentFileName), "html"),
                InitialDirectory = File.Exists(CurrentFileName) ? Path.GetDirectoryName(CurrentFileName) : DocumentPath,
                OverwritePrompt = true
            };
            var result = (bool)dlg.ShowDialog();
            if (result)
            {
                string html = await _wv2Warper.GetContentsAsync();
                WriteFile(dlg.FileName, html);
                new Process
                {
                    StartInfo = new ProcessStartInfo(dlg.FileName)
                    {
                        UseShellExecute = true
                    }
                }.Start();
            }
        }

        private void CopyOutputButton_Click(object sender, RoutedEventArgs e)
        {
            if (!_isParsing)
                _wv2Warper.ClipboardCopyAsync();
        }

        private async void WordButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isParsing) return;
            var isOutput = IsCalculated || IsWebForm || _parser.IsPaused;
            var isDoc = (Professional.IsChecked ?? false) && isOutput;
            var fileExt = isDoc ? "docx" : "html";
            string fileName;
            if (isOutput)
            {
                if (string.IsNullOrEmpty(CurrentFileName))
                    fileName = Path.GetTempPath() + "Hekatan\\Output." + fileExt;
                else
                    fileName = Path.ChangeExtension(CurrentFileName, fileExt);
            }
            else
            {
                fileName = $"{AppInfo.DocPath}\\help.{_currentCultureName}.docx";
                if (!File.Exists(fileName))
                    fileName = $"{AppInfo.DocPath}\\help.docx";
            }
            try
            {
                if (isOutput)
                {
                    if (isDoc)
                    {
                        fileName = PromtSaveDoc(fileName);
                        var logString = await _wv2Warper.ExportOpenXmlAsync(fileName, _parser.OpenXmlExpressions);
                        if (logString.Length > 0)
                        {
                            string message = MainWindowResources.Error_Exporting_Docx_File;
                            if (MessageBox.Show(message, "Hekatan", MessageBoxButton.YesNo, MessageBoxImage.Error) == MessageBoxResult.Yes)
                            {
                                var logFile = fileName + "_validation.log";
                                WriteFile(logFile, logString);
                                RunExternalApp("NOTEPAD", logFile);
                            }
                        }
                    }
                    else
                    {
                        var html = await _wv2Warper.GetContentsAsync();
                        WriteFile(fileName, html);
                    }
                }
                if (RunExternalApp("WINWORD", fileName) is null)
                    RunExternalApp("SOFFICE", fileName);
            }
            catch (Exception ex)
            {
                ShowErrorMessage(ex.Message);
            }
        }

        private static Process RunExternalApp(string appName, string fileName)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = appName
            };
            if (fileName is not null)
                startInfo.Arguments =
                    fileName.Contains(' ') ?
                    '\"' + fileName + '\"' :
                    fileName;

            startInfo.UseShellExecute = true;
            if (appName != "NOTEPAD")
                startInfo.WindowStyle = ProcessWindowStyle.Maximized;

            try
            {
                return Process.Start(startInfo);
            }
            catch
            {
                return null;
            }
        }

        private string PromtSaveDoc(string fileName)
        {
            var dlg = new SaveFileDialog
            {
                FileName = Path.GetFileName(fileName),
                InitialDirectory =
                    File.Exists(CurrentFileName) ? Path.GetDirectoryName(CurrentFileName) : DocumentPath,
                DefaultExt = "docx",
                OverwritePrompt = true,
                Filter = "Microsoft Word Document (*.docx)|*.docx"
            };

            var result = (bool)dlg.ShowDialog();
            return result ? dlg.FileName : fileName;
        }

        private void RestoreUndoData()
        {
            var offset = _undoMan.RestoreOffset;
            var currentLine = _undoMan.RestoreLine;
            var lines = _undoMan.RestoreText.AsSpan().EnumerateLines();
            _highlighter.Defined.Get(lines, IsComplex);
            SetCodeCheckBoxVisibility();
            _isTextChangedEnabled = false;
            RichTextBox.BeginChange();
            var blocks = _document.Blocks;
            int j = 1, n = blocks.Count;
            var indent = 0d;
            var b = blocks.FirstBlock;
            foreach (var line in lines)
            {
                if (j < n)
                {
                    var s = new TextRange(b.ContentStart, b.ContentEnd).Text;
                    if (line.SequenceEqual(s))
                    {
                        if (_currentParagraph == b)
                            _highlighter.Parse(_currentParagraph, IsComplex, j,false);

                        var bp = b as Paragraph;
                        if (!UpdateIndent(bp, ref indent))
                            bp.TextIndent = indent;

                        b = b.NextBlock;
                        ++j;
                        continue;
                    }
                }
                var p = b is not null ? b as Paragraph : new Paragraph();
                _highlighter.Parse(p, IsComplex, j, true, line.ToString());
                if (!UpdateIndent(p, ref indent))
                    p.TextIndent = indent;

                if (b is null)
                    blocks.Add(p);
                else
                    b = b.NextBlock;
                ++j;
            }

            blocks.Remove(blocks.LastBlock);
            while (j < n)
            {
                blocks.Remove(blocks.LastBlock);
                --n;
            }
            n = blocks.Count;
            if (currentLine < 1)
                currentLine = 1;
            else if (currentLine > n)
                currentLine = n;
            _currentParagraph = blocks.ElementAt(currentLine - 1) as Paragraph;
            _currentLineNumber = currentLine;
            var pointer = HighLighter.FindPositionAtOffset(_currentParagraph, offset);
            RichTextBox.Selection.Select(pointer, pointer);
            HighLighter.Clear(_currentParagraph);
            RichTextBox.EndChange();
            _isTextChangedEnabled = true;
            DispatchLineNumbers();
            if (IsAutoRun)
                AutoRun();
        }

        private void WebFormButton_Click(object sender, RoutedEventArgs e) => RunWebForm();

        private void Command_WebForm(object sender, ExecutedRoutedEventArgs e)
        {
            if (WebFormButton.IsEnabled)
                RunWebForm();
        }

        private void RunWebForm()
        {
            if (IsWebForm && WebFormButton.Visibility != Visibility.Visible)
                return;

            if (_mustPromptUnlock && IsWebForm)
            {
                string message = MainWindowResources.Are_you_sure_you_want_to_unlock_the_source_code_for_editing;
                if (MessageBox.Show(message, "Hekatan", MessageBoxButton.YesNo) == MessageBoxResult.No)
                    return;

                _mustPromptUnlock = false;
            }
            IsWebForm = !IsWebForm;
            IsCalculated = false;
            if (IsWebForm)
                CalculateAsync(true);
            else
            {
                //GetAndSetInputFields();
                RichTextBox.Focus();
                if (IsAutoRun)
                {
                    CalculateAsync();
                    IsCalculated = true;
                }
                else
                    ShowHelp();
            }
        }

        private void SetWebForm(bool value)
        {
            SetButton(WebFormButton, value);
            SetUILock(value);
            if (value)
            {
                InputFrame.Visibility = Visibility.Hidden;
                FramesGrid.ColumnDefinitions[0].Width = new GridLength(0);
                FramesGrid.ColumnDefinitions[1].Width = new GridLength(0);
                WebFormButton.ToolTip = MainWindowResources.Open_source_code_for_editing__F4;
                MenuWebForm.Icon = "  ✓";
                AutoRunCheckBox.Visibility = Visibility.Hidden;
                _findReplaceWindow?.Close();
                IsWebView2Focused = true;
            }
            else
            {
                var cursor = WebViewer.Cursor;
                WebViewer.Cursor = Cursors.Wait;
                DispatchLineNumbers();
                ForceHighlight();
                InputFrame.Visibility = Visibility.Visible;
                FramesGrid.ColumnDefinitions[0].Width = new GridLength(1, GridUnitType.Star);
                FramesGrid.ColumnDefinitions[1].Width = new GridLength(5);
                FramesGrid.ColumnDefinitions[2].Width = new GridLength(1, GridUnitType.Star);
                WebFormButton.ToolTip = MainWindowResources.Compile_to_input_form_F4;
                MenuWebForm.Icon = null;
                WebViewer.Cursor = cursor;
                AutoRunCheckBox.Visibility = Visibility.Visible;
                SetOutputFrameHeader(false);
                IsWebView2Focused = false;
            }
        }

        private async Task<bool> GetAndSetInputFieldsAsync()
        {
            if (InputText.Contains("%u", StringComparison.Ordinal))
            {
                try
                {
                    _parser.Settings.Units = await _wv2Warper.GetUnitsAsync();
                }
                catch
                {
                    ShowErrorMessage(MainWindowResources.Error_getting_units);
                }
            }
            else
                _parser.Settings.Units = "m";

            if (!SetInputFields(await _wv2Warper.GetInputFieldsAsync()))
            {
                ShowErrorMessage(MainWindowResources.Error_Invalid_number_Please_correct_and_then_try_again);
                IsCalculated = false;
                WebViewer.Focus();
                return false;
            }
            return true;
        }

        private void SetUnits()
        {
            if (InputText.Contains("%u", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    _wv2Warper.SetUnitsAsync(_parser.Settings.Units);
                }
                catch
                {
                    ShowErrorMessage(MainWindowResources.Error_setting_units);
                }
            }
        }

        private void SubstituteCheckBox_Click(object sender, RoutedEventArgs e) => ClearOutput();
        private void DecimalsTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            ClearOutput(false);
            if (IsInitialized && int.TryParse(DecimalsTextBox.Text, out int n))
                DecimalScrollBar.Value = 15 - n;
        }

        private async void ClearOutput(bool focus = true)
        {
            if (IsInitialized)
            {
                if (IsCalculated)
                {
                    IsCalculated = false;
                    if (IsWebForm)
                        CalculateAsync(true);
                    else if (IsAutoRun)
                    {
                        _scrollY = await _wv2Warper.GetScrollYAsync();
                        Calculate();
                    }
                    else
                        ShowHelp();
                }
                if (focus)
                {
                    RichTextBox.Focus();
                    Keyboard.Focus(RichTextBox);
                }
            }
        }

        private void ImageButton_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                DefaultExt = ".png",
                Filter = "Image Files (*.bmp, *.png, *.gif, *.jpeg *.jpg)|*.bmp; *.png; *.gif; *.jpeg; *.jpg",
                CheckFileExists = true,
                Multiselect = false
            };
            var result = (bool)dlg.ShowDialog();
            if (result)
                InsertImage(dlg.FileName);
        }

        private void ImportMathcadButton_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                DefaultExt = ".mcdx",
                Filter = "Mathcad Prime Files (*.mcdx)|*.mcdx|All Files (*.*)|*.*",
                Title = "Importar archivo Mathcad Prime",
                CheckFileExists = true,
                Multiselect = false
            };
            var result = (bool)dlg.ShowDialog();
            if (result)
            {
                try
                {
                    var converter = new Hekatan.Common.McdxConverter();
                    string convertedContent = converter.Convert(dlg.FileName);

                    // Preguntar si crear nuevo archivo o insertar
                    var msgResult = MessageBox.Show(
                        "¿Desea crear un nuevo archivo con el contenido importado?\n\n" +
                        "Sí = Crear nuevo archivo\n" +
                        "No = Insertar en documento actual",
                        "Importar Mathcad",
                        MessageBoxButton.YesNoCancel,
                        MessageBoxImage.Question);

                    if (msgResult == MessageBoxResult.Yes)
                    {
                        // Crear nuevo archivo - limpiar contenido
                        if (_isParsing)
                            _parser.Cancel();

                        _parser.ShowWarnings = true;

                        // Limpiar contenido basado en editor activo
                        if (_isAvalonEditActive && TextEditor != null)
                        {
                            TextEditor.Text = convertedContent;
                            TextEditor.CaretOffset = 0;
                        }
                        else
                        {
                            _document.Blocks.Clear();
                            // Insertar el contenido convertido
                            foreach (var line in convertedContent.Split('\n'))
                            {
                                var p = new Paragraph();
                                p.Inlines.Add(new Run(line.TrimEnd('\r')));
                                _highlighter.Parse(p, IsComplex, GetLineNumber(p), true);
                                _document.Blocks.Add(p);
                            }
                            RichTextBox.CaretPosition = _document.ContentStart;
                        }

                        _highlighter.Defined.Clear(IsComplex);

                        // Sugerir nombre de archivo
                        var suggestedName = Path.ChangeExtension(dlg.FileName, ".cpd");
                        CurrentFileName = suggestedName;
                        Title = Path.GetFileName(suggestedName) + " - Hekatan";
                    }
                    else if (msgResult == MessageBoxResult.No)
                    {
                        // Insertar en posición actual
                        InsertTextAtCursor(convertedContent);
                    }

                    // Mostrar advertencias si las hay
                    if (converter.Warnings.Count > 0)
                    {
                        var warnings = string.Join("\n", converter.Warnings.Take(10));
                        if (converter.Warnings.Count > 10)
                            warnings += $"\n... y {converter.Warnings.Count - 10} más";

                        MessageBox.Show(
                            $"Conversión completada con {converter.Warnings.Count} advertencia(s):\n\n{warnings}",
                            "Advertencias de importación",
                            MessageBoxButton.OK,
                            MessageBoxImage.Warning);
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        $"Error al importar archivo Mathcad:\n\n{ex.Message}",
                        "Error de importación",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                }
            }
        }

        /// <summary>
        /// Import from Mathcad Prime (.mcdx) - new button handler
        /// </summary>
        private void ImportMathcadPrime_Click(object sender, RoutedEventArgs e)
        {
            // Reuse existing ImportMathcadButton_Click logic
            ImportMathcadButton_Click(sender, e);
        }

        /// <summary>
        /// Export to Mathcad Prime (.mcdx) with version selection
        /// </summary>
        private void ExportMathcadPrime_Click(object sender, RoutedEventArgs e)
        {
            // Create version selection dialog
            var versionDialog = new Window
            {
                Title = "Exportar a Mathcad Prime",
                Width = 350,
                Height = 250,
                WindowStartupLocation = WindowStartupLocation.CenterOwner,
                Owner = this,
                ResizeMode = ResizeMode.NoResize,
                ShowInTaskbar = false
            };

            var stackPanel = new StackPanel { Margin = new Thickness(20) };

            var titleLabel = new TextBlock
            {
                Text = "Seleccione la versión de Mathcad Prime:",
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 15)
            };
            stackPanel.Children.Add(titleLabel);

            var versionCombo = new ComboBox
            {
                Margin = new Thickness(0, 0, 0, 15),
                FontSize = 14
            };
            // Add Mathcad Prime versions (6.0 through 11.0)
            versionCombo.Items.Add("Mathcad Prime 6.0");
            versionCombo.Items.Add("Mathcad Prime 7.0");
            versionCombo.Items.Add("Mathcad Prime 8.0");
            versionCombo.Items.Add("Mathcad Prime 9.0");
            versionCombo.Items.Add("Mathcad Prime 10.0 (Recomendado)");
            versionCombo.Items.Add("Mathcad Prime 11.0");
            versionCombo.SelectedIndex = 4; // Default to version 10.0
            stackPanel.Children.Add(versionCombo);

            var noteLabel = new TextBlock
            {
                Text = "Nota: Versiones más recientes tienen mejor soporte\npara funciones avanzadas de Hekatan.",
                Foreground = new SolidColorBrush(Color.FromRgb(100, 100, 100)),
                FontSize = 11,
                Margin = new Thickness(0, 0, 0, 20),
                TextWrapping = TextWrapping.Wrap
            };
            stackPanel.Children.Add(noteLabel);

            var buttonPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right
            };

            var exportButton = new Button
            {
                Content = "Exportar",
                Width = 80,
                Height = 30,
                Margin = new Thickness(0, 0, 10, 0),
                IsDefault = true
            };
            var cancelButton = new Button
            {
                Content = "Cancelar",
                Width = 80,
                Height = 30,
                IsCancel = true
            };

            int? selectedVersion = null;
            exportButton.Click += (s, args) =>
            {
                selectedVersion = versionCombo.SelectedIndex + 6; // 6, 7, 8, 9, 10, 11
                versionDialog.DialogResult = true;
            };
            cancelButton.Click += (s, args) =>
            {
                versionDialog.DialogResult = false;
            };

            buttonPanel.Children.Add(exportButton);
            buttonPanel.Children.Add(cancelButton);
            stackPanel.Children.Add(buttonPanel);

            versionDialog.Content = stackPanel;

            if (versionDialog.ShowDialog() == true && selectedVersion.HasValue)
            {
                // Show save file dialog
                var saveDialog = new SaveFileDialog
                {
                    DefaultExt = ".mcdx",
                    Filter = "Mathcad Prime Files (*.mcdx)|*.mcdx",
                    Title = $"Exportar como Mathcad Prime {selectedVersion.Value}.0",
                    FileName = !string.IsNullOrEmpty(CurrentFileName)
                        ? Path.GetFileNameWithoutExtension(CurrentFileName) + ".mcdx"
                        : "documento.mcdx"
                };

                if (saveDialog.ShowDialog() == true)
                {
                    try
                    {
                        // Get current document content
                        string content = InputText;

                        // TODO: Implement actual McdxExporter when available
                        // For now, show placeholder message with version info
                        MessageBox.Show(
                            $"Exportación a Mathcad Prime {selectedVersion.Value}.0\n\n" +
                            $"Archivo: {saveDialog.FileName}\n" +
                            $"Versión seleccionada: {selectedVersion.Value}.0\n\n" +
                            "La funcionalidad de exportación completa estará disponible\n" +
                            "en una próxima versión.",
                            "Exportación en desarrollo",
                            MessageBoxButton.OK,
                            MessageBoxImage.Information);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show(
                            $"Error al exportar: {ex.Message}",
                            "Error de exportación",
                            MessageBoxButton.OK,
                            MessageBoxImage.Error);
                    }
                }
            }
        }

        /// <summary>
        /// Import from SMath Studio (.sm)
        /// </summary>
        private void ImportSMath_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                DefaultExt = ".sm",
                Filter = "SMath Studio Files (*.sm)|*.sm|All Files (*.*)|*.*",
                Title = "Importar archivo SMath Studio",
                CheckFileExists = true,
                Multiselect = false
            };
            var result = (bool)dlg.ShowDialog();
            if (result)
            {
                try
                {
                    var converter = new Hekatan.Common.SMathConverter();
                    string convertedContent = converter.Convert(dlg.FileName);

                    // Preguntar si crear nuevo archivo o insertar
                    var msgResult = MessageBox.Show(
                        "¿Desea crear un nuevo archivo con el contenido importado?\n\n" +
                        "Sí = Crear nuevo archivo\n" +
                        "No = Insertar en documento actual",
                        "Importar SMath Studio",
                        MessageBoxButton.YesNoCancel,
                        MessageBoxImage.Question);

                    if (msgResult == MessageBoxResult.Yes)
                    {
                        // Crear nuevo archivo - limpiar contenido
                        if (_isParsing)
                            _parser.Cancel();

                        _parser.ShowWarnings = true;

                        // Limpiar contenido basado en editor activo
                        if (_isAvalonEditActive && TextEditor != null)
                        {
                            TextEditor.Text = convertedContent;
                            TextEditor.CaretOffset = 0;
                        }
                        else
                        {
                            _document.Blocks.Clear();
                            // Insertar el contenido convertido
                            foreach (var line in convertedContent.Split('\n'))
                            {
                                var p = new Paragraph();
                                p.Inlines.Add(new Run(line.TrimEnd('\r')));
                                _highlighter.Parse(p, IsComplex, GetLineNumber(p), true);
                                _document.Blocks.Add(p);
                            }
                            RichTextBox.CaretPosition = _document.ContentStart;
                        }

                        _highlighter.Defined.Clear(IsComplex);

                        // Sugerir nombre de archivo
                        var suggestedName = Path.ChangeExtension(dlg.FileName, ".cpd");
                        CurrentFileName = suggestedName;
                        Title = Path.GetFileName(suggestedName) + " - Hekatan";
                    }
                    else if (msgResult == MessageBoxResult.No)
                    {
                        // Insertar en posición actual
                        InsertTextAtCursor(convertedContent);
                    }

                    // Mostrar advertencias si las hay
                    if (converter.Warnings.Count > 0)
                    {
                        var warnings = string.Join("\n", converter.Warnings.Take(10));
                        if (converter.Warnings.Count > 10)
                            warnings += $"\n... y {converter.Warnings.Count - 10} más";

                        MessageBox.Show(
                            $"Conversión completada con {converter.Warnings.Count} advertencia(s):\n\n{warnings}",
                            "Advertencias de importación",
                            MessageBoxButton.OK,
                            MessageBoxImage.Warning);
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        $"Error al importar archivo SMath Studio:\n\n{ex.Message}",
                        "Error de importación",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                }
            }
        }

        /// <summary>
        /// Export to SMath Studio (.sm) - placeholder for future implementation
        /// </summary>
        private void ExportSMath_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show(
                "Exportar a SMath Studio (.sm) estará disponible en una versión futura.\n\n" +
                "Esta función convertirá el archivo .cpd actual al formato SMath Studio.",
                "Función en desarrollo",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
        }

        /// <summary>
        /// Mathcad button click - opens context menu
        /// </summary>
        private void MathcadBtn_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.ContextMenu != null)
            {
                btn.ContextMenu.PlacementTarget = btn;
                btn.ContextMenu.IsOpen = true;
            }
        }

        /// <summary>
        /// SMath button click - opens context menu
        /// </summary>
        private void SMathBtn_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.ContextMenu != null)
            {
                btn.ContextMenu.PlacementTarget = btn;
                btn.ContextMenu.IsOpen = true;
            }
        }

        /// <summary>
        /// Excel button click - opens context menu
        /// </summary>
        private void ExcelBtn_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.ContextMenu != null)
            {
                btn.ContextMenu.PlacementTarget = btn;
                btn.ContextMenu.IsOpen = true;
            }
        }

        /// <summary>
        /// Import from Microsoft Excel (.xlsx)
        /// </summary>
        private void ImportExcel_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                DefaultExt = ".xlsx",
                Filter = "Excel Files (*.xlsx)|*.xlsx|All Files (*.*)|*.*",
                Title = "Importar archivo Excel",
                CheckFileExists = true,
                Multiselect = false
            };
            var result = (bool)dlg.ShowDialog();
            if (result)
            {
                try
                {
                    var converter = new Hekatan.Common.XlsxConverter();
                    string convertedContent = converter.Convert(dlg.FileName);

                    // Mostrar información de conversión
                    var info = $"Archivo: {Path.GetFileName(dlg.FileName)}\n" +
                               $"Hojas: {string.Join(", ", converter.SheetNames.Values)}\n";
                    if (converter.Warnings.Count > 0)
                        info += $"Advertencias: {converter.Warnings.Count}";

                    // Preguntar si crear nuevo archivo o insertar
                    var msgResult = MessageBox.Show(
                        "¿Desea crear un nuevo archivo con el contenido importado?\n\n" +
                        "Sí = Crear nuevo archivo\n" +
                        "No = Insertar en documento actual\n\n" +
                        info,
                        "Importar Excel",
                        MessageBoxButton.YesNoCancel,
                        MessageBoxImage.Question);

                    if (msgResult == MessageBoxResult.Yes)
                    {
                        // Crear nuevo archivo - cancelar parsing si está activo
                        if (_isParsing)
                            _parser.Cancel();

                        _parser.ShowWarnings = true;

                        // Insertar contenido convertido según editor activo
                        if (_isAvalonEditActive && TextEditor != null)
                        {
                            TextEditor.Text = convertedContent;
                            TextEditor.CaretOffset = 0;
                        }
                        else
                        {
                            _document.Blocks.Clear();
                            foreach (var line in convertedContent.Split('\n'))
                            {
                                var p = new Paragraph();
                                p.Inlines.Add(new Run(line.TrimEnd('\r')));
                                _highlighter.Parse(p, IsComplex, GetLineNumber(p), true);
                                _document.Blocks.Add(p);
                            }
                            RichTextBox.CaretPosition = _document.ContentStart;
                        }

                        _highlighter.Defined.Clear(IsComplex);

                        // Sugerir nombre basado en el archivo Excel
                        var suggestedName = Path.ChangeExtension(dlg.FileName, ".cpd");
                        CurrentFileName = suggestedName;
                        Title = Path.GetFileName(suggestedName) + " - Hekatan";
                    }
                    else if (msgResult == MessageBoxResult.No)
                    {
                        // Insertar en posición actual
                        InsertTextAtCursor(convertedContent);
                    }

                    // Mostrar advertencias si las hay
                    if (converter.Warnings.Count > 0)
                    {
                        var warningsText = string.Join("\n", converter.Warnings.Take(10));
                        if (converter.Warnings.Count > 10)
                            warningsText += $"\n... y {converter.Warnings.Count - 10} más";

                        MessageBox.Show(
                            $"La conversión generó {converter.Warnings.Count} advertencias:\n\n{warningsText}",
                            "Advertencias de conversión",
                            MessageBoxButton.OK,
                            MessageBoxImage.Warning);
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        $"Error al importar archivo Excel:\n\n{ex.Message}",
                        "Error de importación",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                }
            }
        }

        private void InsertImage(string filePath)
        {
            var fileName = Path.GetFileName(filePath);
            var size = GetImageSize(filePath);
            var fileDir = Path.GetDirectoryName(filePath);
            string src;
            if (!string.IsNullOrEmpty(CurrentFileName) &&
                string.Equals(Path.GetDirectoryName(CurrentFileName), fileDir, StringComparison.OrdinalIgnoreCase))
                src = "./" + fileName;
            else
                src = filePath.Replace('\\', '/');
            var p = new Paragraph();
            p.Inlines.Add(new Run($"'<img style=\"height:{size.Height}pt; width:{size.Width}pt;\" src=\"{src}\" alt=\"{fileName}\">"));
            _highlighter.Parse(p, IsComplex, GetLineNumber(p), true);
            _document.Blocks.InsertBefore(_currentParagraph ?? _document.Blocks.FirstBlock, p);
        }

        private static Size GetImageSize(string fileName)
        {
            using var imageStream = File.OpenRead(fileName);
            var decoder = BitmapDecoder.Create(imageStream,
                BitmapCreateOptions.IgnoreColorProfile,
                BitmapCacheOption.Default);
            return new Size
            {
                Height = Math.Round(0.75 * decoder.Frames[0].Height),
                Width = Math.Round(0.75 * decoder.Frames[0].Width)
            };
        }

        private void KeyPadButton_Click(object sender, RoutedEventArgs e)
        {
            if (KeyPadGrid.Visibility == Visibility.Hidden)
            {
                KeyPadGrid.Visibility = Visibility.Visible;
                InputGrid.RowDefinitions[1].Height = new GridLength(_inputHeight);
            }
            else
            {
                KeyPadGrid.Visibility = Visibility.Hidden;
                InputGrid.RowDefinitions[1].Height = new GridLength(0);
            }
            SetButton(KeyPadButton, KeyPadGrid.Visibility == Visibility.Visible);
        }

        private void GreekLetter_MouseUp(object sender, MouseButtonEventArgs e)
        {
            var tb = (TextBlock)sender;
            _insertManager.InsertText(tb.Text);
        }

        private void EquationRadioButton_Checked(object sender, RoutedEventArgs e)
        {
            if (IsInitialized)
            {
                var pro = ReferenceEquals(sender, Professional);
                _parser.Settings.Math.FormatEquations = pro;
                Professional.IsChecked = pro;
                Inline.IsChecked = !pro;
            }
            ClearOutput();
        }

        private void AngleRadioButton_Checked(object sender, RoutedEventArgs e)
        {
            if (IsInitialized)
            {
                var deg = ReferenceEquals(sender, Deg) ? 0 :
                          ReferenceEquals(sender, Rad) ? 1 : 2;
                _parser.Settings.Math.Degrees = deg;
                Deg.IsChecked = deg == 0;
                Rad.IsChecked = deg == 1;
                Gra.IsChecked = deg == 2;
            }
            ClearOutput();
        }

        private void ModeRadioButton_Checked(object sender, RoutedEventArgs e)
        {
            if (IsInitialized)
            {
                var complex = ReferenceEquals(sender, Complex);
                _parser.Settings.Math.IsComplex = complex;
                Complex.IsChecked = complex;
                Real.IsChecked = !complex;
                _highlighter.Defined.Get(InputText.AsSpan().EnumerateLines(), IsComplex);
                if (!IsWebForm)
                    Task.Run(() => Dispatcher.InvokeAsync(HighLightAll, DispatcherPriority.Send));
            }
            ClearOutput();
        }

        private void SaveOutputButton_Click(object sender, RoutedEventArgs e)
        {
            if (!_isParsing)
                HtmlFileSave();
        }

        private void TryOpenOnStartup()
        {
            try
            {
                var args = Environment.GetCommandLineArgs();
                var n = args.Length;
                if (n > 1)
                {
                    var s = string.Join(" ", args, 1, n - 1);
                    if (File.Exists(s))
                    {
                        var ex = Path.GetExtension(s).ToLowerInvariant();
                        if (ex == ".hcalc" || ex == ".cpd" || ex == ".hcalcz" || ex == ".cpdz")
                        {
                            _parser.ShowWarnings = ex != ".cpdz" && ex != ".hcalcz";
                            CurrentFileName = s;
                            var hasForm = GetInputTextFromFile() || ex == ".cpdz" || ex == ".hcalcz";
                            SetButton(WebFormButton, false);
                            if (hasForm)
                            {
                                RunWebForm();
                                _mustPromptUnlock = true;
                                if (ex == ".cpdz" || ex == ".hcalcz")
                                    WebFormButton.Visibility = Visibility.Hidden;
                            }
                            else
                            {
                                ForceHighlight();
                                IsCalculated = true;
                                _wv2Warper.NavigateToBlank();
                                Dispatcher.InvokeAsync(() => CalculateAsync(), DispatcherPriority.ApplicationIdle);
                            }
                            AddRecentFile(CurrentFileName);
                            return;
                        }
                    }
                }
                ShowHelp();
                DispatchLineNumbers();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[TryOpenOnStartup] Error: {ex.Message}");
                ShowHelp();
                DispatchLineNumbers();
            }
        }

        private void Window_Closing(object sender, CancelEventArgs e)
        {
            var r = PromptSave();
            if (r == MessageBoxResult.Cancel)
            {
                e.Cancel = true;
            }
            else
            {
                // Close telemetry session
                HekatanTelemetry.EndSession();

                // Cleanup Jupyter
                CleanupJupyterOnExit();
            }

            WriteSettings();
        }

        private async Task ScrollOutput()
        {   
            var offset = RichTextBox.CaretPosition.GetCharacterRect(LogicalDirection.Forward).Top +
                RichTextBox.Margin.Top - WebViewer.Margin.Top;
            await ScrollOutputToLine(
                _highlighter.Defined.HasMacros
                    ? _calcpadProcessor.MacroParser.GetUnwarpedLineNumber(_currentLineNumber)
                    : _currentLineNumber, offset);

            _scrollOutput = false;
        }

        private async Task ScrollOutputToLine(int lineNumber, double offset)
        {
            var tempScrollY = await _wv2Warper.GetScrollYAsync();
            await _wv2Warper.ScrollAsync(lineNumber, offset);
            if (tempScrollY == await _wv2Warper.GetScrollYAsync())
                await _wv2Warper.SetScrollYAsync(_scrollY);
        }

        private bool IsAutoRun =>
            AutoRunCheckBox.Visibility == Visibility.Visible &&
            (AutoRunCheckBox.IsChecked ?? false);

        private void RichTextBox_KeyUp(object sender, KeyEventArgs e)
        {
            if (_forceBackSpace && RichTextBox.CaretPosition.IsAtLineStartPosition)
            {
                _forceBackSpace = false;
                var p = RichTextBox.CaretPosition.Paragraph;
                if (p is not null)
                {
                    var pp = p.PreviousBlock as Paragraph;
                    if (pp is not null)
                    {
                        _isTextChangedEnabled = false;
                        RichTextBox.CaretPosition = pp.ContentEnd;
                        var s = new TextRange(p.ContentStart, p.ContentEnd).Text;
                        pp.Inlines.Add(s);
                        _document.Blocks.Remove(p);
                        _isTextChangedEnabled = true;
                    }
                }
            }
            else if (e.Key == Key.G && e.KeyboardDevice.Modifiers == ModifierKeys.Control)
            {
                var cp = RichTextBox.Selection.End;
                if (!cp.IsAtLineStartPosition)
                {
                    var sel = RichTextBox.Selection;
                    sel.Select(cp.GetPositionAtOffset(-1), cp);
                    string s = sel.Text;
                    if (s.Length == 1)
                    {
                        char c = LatinGreekChar(s[0]);
                        if (c != s[0])
                            _insertManager.InsertText(c.ToString());
                        else
                            sel.Select(cp, cp);
                    }
                }
            }
            else if (e.Key == Key.Back && !_autoCompleteManager.IsInComment())
                Task.Run(() => Dispatcher.InvokeAsync(_autoCompleteManager.RestoreAutoComplete));
        }

        private int GetLineNumber(Block block)
        {
            var blocks = _document.Blocks;
            var i = blocks.Count;
            if (_currentLineNumber > i / 2)
            {
                var b = blocks.LastBlock;
                while (b is not null)
                {
                    if (ReferenceEquals(b, block))
                        return i;
                    --i;
                    b = b.PreviousBlock;
                }
            }
            else
            {
                i = 1;
                var b = blocks.FirstBlock;
                while (b is not null)
                {
                    if (ReferenceEquals(b, block))
                        return i;
                    ++i;
                    b = b.NextBlock;
                }
            }
            return -1;
        }

        private async void RichTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_isTextChangedEnabled)
            {
                if (_document.Blocks.Count == 0)
                    ResetText();

                if (IsAutoRun)
                {
                    var p = RichTextBox.Selection.End.Paragraph;
                    if (p is not null)
                    {
                        var len = p.ContentStart.GetOffsetToPosition(p.ContentEnd);
                        if (IsCalculated && len > 2 && !_highlighter.Defined.HasMacros)
                            _wv2Warper.SetContentAsync(_currentLineNumber, _svgTyping);
                    }
                    _autoRun = true;
                }

                if (_isPasting)
                {
                    _highlighter.Defined.Get(InputTextLines, IsComplex);
                    SetCodeCheckBoxVisibility();

                    // Detect external language when pasting - check ALL lines
                    var text = InputText;
                    var isExternal = false;
                    foreach (var line in text.EnumerateLines())
                    {
                        var trimmed = line.Trim().ToString();
                        if (trimmed.StartsWith("#python") || trimmed.StartsWith("#octave") ||
                            trimmed.StartsWith("#julia") || trimmed.StartsWith("#powershell") ||
                            trimmed.StartsWith("#csharp") || trimmed.StartsWith("#cpp") ||
                            trimmed.StartsWith("#bash") || trimmed.StartsWith("#cmd") ||
                            trimmed.StartsWith("#r ") || trimmed.StartsWith("#xaml") ||
                            trimmed.StartsWith("#wpf") || trimmed.StartsWith("#c ") ||
                            trimmed.StartsWith("#fortran") || trimmed.StartsWith("#markdown") ||
                            trimmed.StartsWith("#avalonia") || trimmed.StartsWith("#qt") ||
                            trimmed.StartsWith("#gtk") || trimmed.StartsWith("#html"))
                        {
                            isExternal = true;
                            break;
                        }
                    }
                    _highlighter.DisableOperatorReplacement = isExternal;

                    await Dispatcher.InvokeAsync(HighLightPastedText, DispatcherPriority.Background);
                    SetAutoIndent();
                    var p = RichTextBox.Selection.End.Paragraph;
                    if (p is not null)
                        RichTextBox.CaretPosition = HighLighter.FindPositionAtOffset(p, _pasteOffset);
                    _isPasting = false;
                }
                Record();
                IsSaved = false;
                if (IsCalculated)
                {
                    if (!IsAutoRun)
                    {
                        IsCalculated = false;
                        ShowHelp();
                    }
                }
                if (!_isPasting)
                {
                    _highlighter.Defined.Get(InputTextLines, IsComplex);
                    SetCodeCheckBoxVisibility();

                    // Detect external language and enable passthrough mode - check ALL lines
                    var text = InputText;
                    var isExternal = false;
                    foreach (var line in text.EnumerateLines())
                    {
                        var trimmed = line.Trim().ToString();
                        if (trimmed.StartsWith("#python") || trimmed.StartsWith("#octave") ||
                            trimmed.StartsWith("#julia") || trimmed.StartsWith("#powershell") ||
                            trimmed.StartsWith("#csharp") || trimmed.StartsWith("#cpp") ||
                            trimmed.StartsWith("#bash") || trimmed.StartsWith("#cmd") ||
                            trimmed.StartsWith("#r ") || trimmed.StartsWith("#xaml") ||
                            trimmed.StartsWith("#wpf") || trimmed.StartsWith("#c ") ||
                            trimmed.StartsWith("#fortran") || trimmed.StartsWith("#markdown") ||
                            trimmed.StartsWith("#avalonia") || trimmed.StartsWith("#qt") ||
                            trimmed.StartsWith("#gtk") || trimmed.StartsWith("#html"))
                        {
                            isExternal = true;
                            break;
                        }
                    }
                    _highlighter.DisableOperatorReplacement = isExternal;

                    await Task.Run(DispatchAutoIndent);
                }
                await Task.Run(DispatchLineNumbers);
                _lastModifiedParagraph = _currentParagraph;
            }
        }

        private async void RichTextBox_SelectionChanged(object sender, RoutedEventArgs e)
        {
            var tps = RichTextBox.Selection.Start;
            var tpe = RichTextBox.Selection.End;

            var p = tps.Paragraph;
            p ??= tpe.Paragraph;
            if (p is null)
                return;

            if (!ReferenceEquals(_currentParagraph, tps.Paragraph) &&
                !ReferenceEquals(_currentParagraph, tpe.Paragraph))
            {
                _isTextChangedEnabled = false;
                RichTextBox.BeginChange();
                _highlighter.Parse(_currentParagraph, IsComplex, _currentLineNumber, true, null, p);
                if (p is not null)
                {
                    _currentParagraph = p;
                    _currentLineNumber = GetLineNumber(_currentParagraph);
                    HighLighter.Clear(_currentParagraph);
                    _autoCompleteManager.FillAutoComplete(_highlighter.Defined, _currentLineNumber);
                    _avalonEditAutoComplete.FillAutoComplete(_highlighter.Defined, _currentLineNumber);
                }
                e.Handled = true;
                RichTextBox.EndChange();
                _isTextChangedEnabled = true;
                if (_autoRun)
                {
                    var offset = RichTextBox.CaretPosition.GetOffsetToPosition(_document.ContentEnd);
                    await AutoRun(offset <= 2);
                }
                DispatchHighLightFromCurrent();
            }
            if (tps.Paragraph is null)
                return;

            _currentOffset = new TextRange(tps, tps.Paragraph.ContentEnd).Text.Length;
            if (p is not null && tpe.GetOffsetToPosition(tps) == 0)
            {
                _isTextChangedEnabled = false;
                RichTextBox.BeginChange();
                var tr = new TextRange(p.ContentStart, p.ContentEnd);
                tr.ApplyPropertyValue(TextElement.FontWeightProperty, FontWeights.Normal);
                tr.ApplyPropertyValue(TextElement.ForegroundProperty, Brushes.Black);
                tr = new TextRange(p.ContentStart, tpe);
                var len = tr.Text.Length;
                HighLighter.HighlightBrackets(p, len);
                RichTextBox.EndChange();
                _isTextChangedEnabled = true;
            }
        }

        private void RichTextBox_LostKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e) =>
            Dispatcher.InvokeAsync(DisableInputWindowAsync, DispatcherPriority.ApplicationIdle);

        private async void DisableInputWindowAsync()
        {
            await Task.Delay(200);
            if (RichTextBox.IsKeyboardFocused ||
                AutoCompleteListBox.Visibility == Visibility.Visible ||
                await _wv2Warper.CheckIsContextMenuAsync())
                return;

            if (_autoRun && IsCalculated)
                AutoRun();
        }

        private void RichTextBox_Paste(object sender, DataObjectPastingEventArgs e)
        {
            var formats = e.DataObject.GetFormats();
            var hasImage = formats.Any(x => x.Contains("Bitmap"));
            if (formats.Contains("UnicodeText") && !hasImage)
            {
                e.FormatToApply = "UnicodeText";
                _isPasting = true;
                GetPasteOffset();
            }
            else
            {
                e.CancelCommand();
                if (hasImage && Clipboard.ContainsImage())
                {
                    string name = null;
                    if (formats.Contains("FileName"))
                    {
                        string[] fn = (string[])e.DataObject.GetData("FileName");
                        name = fn[0];
                        name = Path.GetFileNameWithoutExtension(name) + ".png";
                    }
                    Dispatcher.InvokeAsync(() => PasteImage(name), DispatcherPriority.ApplicationIdle);
                }
            }
        }

        private void PasteImage(string name)
        {
            // Show dialog with 3 options
            var dialog = new PasteImageDialog();
            dialog.Owner = this;
            var result = dialog.ShowDialog();

            if (result != true)
                return;

            switch (dialog.SelectedOption)
            {
                case PasteImageOption.Base64:
                    PasteImageAsBase64();
                    break;
                case PasteImageOption.LocalFile:
                    PasteImageAsFile(name);
                    break;
                case PasteImageOption.Imgur:
                    PasteImageToImgur(dialog.ImgurClientId);
                    break;
            }
        }

        /// <summary>
        /// Paste image from clipboard as Base64 embedded in the document
        /// </summary>
        private void PasteImageAsBase64()
        {
            try
            {
                if (!Clipboard.ContainsImage())
                {
                    ShowErrorMessage("No hay imagen en el portapapeles");
                    return;
                }

                var bitmapSource = Clipboard.GetImage();
                if (bitmapSource == null)
                {
                    ShowErrorMessage("No se pudo obtener la imagen del portapapeles");
                    return;
                }

                // Convert BitmapSource to PNG bytes
                var encoder = new PngBitmapEncoder();
                encoder.Frames.Add(BitmapFrame.Create(bitmapSource));

                using var memoryStream = new MemoryStream();
                encoder.Save(memoryStream);
                var imageBytes = memoryStream.ToArray();

                // Convert to Base64
                var base64String = Convert.ToBase64String(imageBytes);

                // Create the @{image} block
                var imageBlock = $"@{{image png base64}}\n{base64String}\n@{{end image}}";

                // Insert into editor
                InsertTextAtCursor(imageBlock);
            }
            catch (Exception ex)
            {
                ShowErrorMessage($"Error al pegar imagen como Base64: {ex.Message}");
            }
        }

        /// <summary>
        /// Paste image from clipboard by uploading to Imgur and inserting URL
        /// </summary>
        /// <param name="clientId">Imgur API Client-ID provided by user</param>
        private async void PasteImageToImgur(string clientId)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(clientId))
                {
                    ShowErrorMessage("Se requiere un Client-ID de Imgur.\n\nRegistre una aplicación gratuita en:\nhttps://api.imgur.com/oauth2/addclient");
                    return;
                }

                if (!Clipboard.ContainsImage())
                {
                    ShowErrorMessage("No hay imagen en el portapapeles");
                    return;
                }

                var bitmapSource = Clipboard.GetImage();
                if (bitmapSource == null)
                {
                    ShowErrorMessage("No se pudo obtener la imagen del portapapeles");
                    return;
                }

                // Show progress message
                Mouse.OverrideCursor = Cursors.Wait;

                // Convert BitmapSource to PNG bytes
                var encoder = new PngBitmapEncoder();
                encoder.Frames.Add(BitmapFrame.Create(bitmapSource));

                using var memoryStream = new MemoryStream();
                encoder.Save(memoryStream);
                var imageBytes = memoryStream.ToArray();
                var base64Image = Convert.ToBase64String(imageBytes);

                // Upload to Imgur using user's Client-ID
                using var httpClient = new System.Net.Http.HttpClient();
                httpClient.Timeout = TimeSpan.FromSeconds(30);

                // Use user-provided Client-ID
                httpClient.DefaultRequestHeaders.Add("Authorization", $"Client-ID {clientId}");

                var formContent = new System.Net.Http.FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("image", base64Image),
                    new KeyValuePair<string, string>("type", "base64")
                });

                var response = await httpClient.PostAsync("https://api.imgur.com/3/image", formContent);
                var responseString = await response.Content.ReadAsStringAsync();

                Mouse.OverrideCursor = null;

                if (response.IsSuccessStatusCode)
                {
                    // Parse JSON response to get the image URL
                    var linkMatch = System.Text.RegularExpressions.Regex.Match(
                        responseString, @"""link""\s*:\s*""([^""]+)""");

                    if (linkMatch.Success)
                    {
                        var imageUrl = linkMatch.Groups[1].Value.Replace("\\/", "/");

                        // Insert as HTML image tag
                        var imageTag = $"'<img src=\"{imageUrl}\" alt=\"Imagen Imgur\">'";
                        InsertTextAtCursor(imageTag);

                        MessageBox.Show($"Imagen subida exitosamente:\n{imageUrl}", "Imgur", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                    else
                    {
                        ShowErrorMessage($"No se pudo obtener la URL.\nRespuesta: {responseString.Substring(0, Math.Min(200, responseString.Length))}");
                    }
                }
                else
                {
                    ShowErrorMessage($"Error Imgur ({response.StatusCode}):\n{responseString.Substring(0, Math.Min(300, responseString.Length))}");
                }
            }
            catch (System.Net.Http.HttpRequestException ex)
            {
                Mouse.OverrideCursor = null;
                ShowErrorMessage($"Error de conexión a Imgur:\n{ex.Message}\n\nVerifique su conexión a Internet.");
            }
            catch (TaskCanceledException)
            {
                Mouse.OverrideCursor = null;
                ShowErrorMessage("Tiempo de espera agotado al subir a Imgur.\nIntente de nuevo.");
            }
            catch (Exception ex)
            {
                Mouse.OverrideCursor = null;
                ShowErrorMessage($"Error al subir imagen a Imgur:\n{ex.GetType().Name}: {ex.Message}");
            }
        }

        /// <summary>
        /// Paste image from clipboard as external file (original behavior)
        /// </summary>
        private void PasteImageAsFile(string name)
        {
            try
            {
                if (string.IsNullOrEmpty(name))
                {
                    Random rand = new();
                    name = $"image_{rand.NextInt64()}";
                    InputBox.Show("Hekatan", "Image name:", ref name);
                    name += ".png";
                }
                string path;
                if (!string.IsNullOrEmpty(CurrentFileName))
                    path = Path.GetDirectoryName(CurrentFileName) + "\\Images\\";
                else
                    path = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures) + "\\Hekatan\\";

                if (!Directory.Exists(path))
                    Directory.CreateDirectory(path);

                path += name;

                BitmapPaster.PasteImageFromClipboard(path);

                // Build image tag - use InsertTextAtCursor for AvalonEdit compatibility
                var fileName = Path.GetFileName(path);
                var size = GetImageSize(path);
                var fileDir = Path.GetDirectoryName(path);
                string src;
                if (!string.IsNullOrEmpty(CurrentFileName) &&
                    string.Equals(Path.GetDirectoryName(CurrentFileName), fileDir, StringComparison.OrdinalIgnoreCase))
                    src = "./" + fileName;
                else
                    src = path.Replace('\\', '/');

                var imageTag = $"'<img style=\"height:{size.Height}pt; width:{size.Width}pt;\" src=\"{src}\" alt=\"{fileName}\">'";
                InsertTextAtCursor(imageTag);
            }
            catch (Exception ex)
            {
                ShowErrorMessage($"Error al guardar imagen: {ex.Message}");
            }
        }

        private void GetPasteOffset()
        {
            _pasteEnd = RichTextBox.Selection.End;
            var p = _pasteEnd.Paragraph;
            _pasteOffset = p is not null ? new TextRange(_pasteEnd, p.ContentEnd).Text.Length : 0;
        }

        private DispatcherOperation _lineNumbersDispatcherOperation;
        private void DispatchLineNumbers()
        {
            _lineNumbersDispatcherOperation?.Abort();
            if (_lineNumbersDispatcherOperation?.Status != DispatcherOperationStatus.Executing)
                _lineNumbersDispatcherOperation =
                    Dispatcher.InvokeAsync(DrawLineNumbers, DispatcherPriority.Render);
        }

        private void DrawLineNumbers()
        {
            if (_document.Blocks.Count == 0)
            {
                LineNumbers.Children.Clear();
                return;
            }
            int j = 0, n = LineNumbers.Children.Count;
            var ff = _document.FontFamily;
            var sz = _document.FontSize - 1;
            var topMax = -sz;
            var tp = RichTextBox.GetPositionFromPoint(new Point(sz, sz), true);
            var b = (Block)tp.Paragraph;
            var i = 0;
            foreach (var block in _document.Blocks)
            {
                ++i;
                if (ReferenceEquals(block, b))
                    break;
            }
            while (b is not null)
            {
                var top = b.ElementStart.GetCharacterRect(LogicalDirection.Forward).Top + 1;
                if (top >= topMax)
                {
                    if (top > LineNumbers.ActualHeight)
                        break;
                    if (j < n)
                    {
                        var tb = (TextBlock)LineNumbers.Children[j];
                        tb.FontSize = sz;
                        tb.Margin = new Thickness(0, top, 0, 0);
                        tb.Text = (i).ToString();
                    }
                    else
                    {
                        var tb = new TextBlock
                        {
                            TextAlignment = TextAlignment.Right,
                            Width = 35,
                            FontSize = sz,
                            FontFamily = ff,
                            Foreground = Brushes.DarkCyan,
                            Margin = new Thickness(0, top, 0, 0),
                            Text = (i).ToString()
                        };
                        LineNumbers.Children.Add(tb);
                    }
                    ++j;
                }
                b = b.NextBlock;
                ++i;
            }
            if (j < n)
                LineNumbers.Children.RemoveRange(j, n - j);
            _sizeChanged = false;
        }

        private void RichTextBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            IsWebView2Focused = false;
            var modifiers = e.KeyboardDevice.Modifiers;
            var isCtrl = modifiers == ModifierKeys.Control;
            var isCtrlShift = modifiers == (ModifierKeys.Control | ModifierKeys.Shift);
            if (e.Key == Key.V && isCtrlShift)
            {
                PasteAsCommentMenu_Click(PasteAsCommentMenu, e);
                e.Handled = true;
            }
            if (e.Key == Key.Q && isCtrl)
            {
                CommentUncomment(true);
                e.Handled = true;
            }
            if (e.Key == Key.Q && isCtrlShift)
            {
                CommentUncomment(false);
                e.Handled = true;
            }
            else if ((e.Key == Key.D3 || e.Key == Key.NumPad3) && isCtrl)
            {
                Button_Click(H3Button, e);
                e.Handled = true;
            }
            else if ((e.Key == Key.D4 || e.Key == Key.NumPad4) && isCtrl)
            {
                Button_Click(H4Button, e);
                e.Handled = true;
            }
            else if ((e.Key == Key.D5 || e.Key == Key.NumPad5) && isCtrl)
            {
                Button_Click(H5Button, e);
                e.Handled = true;
            }
            else if ((e.Key == Key.D6 || e.Key == Key.NumPad6) && isCtrl)
            {
                Button_Click(H6Button, e);
                e.Handled = true;
            }
            else if (e.Key == Key.L && isCtrl)
            {
                Button_Click(ParagraphMenu, e);
                e.Handled = true;
            }
            else if (e.Key == Key.R && isCtrl)
            {
                Button_Click(LineBreakMenu, e);
                e.Handled = true;
            }
            else if (e.Key == Key.B && isCtrl)
            {
                Button_Click(BoldButton, e);
                e.Handled = true;
            }
            else if (e.Key == Key.I && isCtrl)
            {
                Button_Click(ItalicButton, e);
                e.Handled = true;
            }
            else if (e.Key == Key.U && isCtrl)
            {
                Button_Click(UnderlineButton, e);
                e.Handled = true;
            }
            else if (e.Key == Key.L && isCtrlShift)
            {
                Button_Click(BulletsMenu, e);
                e.Handled = true;
            }
            else if (e.Key == Key.N && isCtrlShift)
            {
                Button_Click(NumberingMenu, e);
                e.Handled = true;
            }
            else if (e.Key == Key.OemPlus)
            {
                if (isCtrl)
                {
                    Button_Click(SubscriptButton, e);
                    e.Handled = true;
                }
                else if (isCtrlShift)
                {
                    Button_Click(SuperscriptButton, e);
                    e.Handled = true;
                }
            }
            else if (e.Key == Key.Enter)
            {
                if (isCtrl)
                {
                    AutoRun(true);
                    e.Handled = true;
                }
                else
                    RichTextBox.Selection.ApplyPropertyValue(TextElement.ForegroundProperty, Brushes.Black);
            }
            else if (e.Key == Key.Back)
            {
                var tp = RichTextBox.Selection.Start;
                var selLength = tp.GetOffsetToPosition(RichTextBox.Selection.End);
                _forceBackSpace = tp.IsAtLineStartPosition && tp.Paragraph?.TextIndent > 0 && selLength == 0;
            }
            else
                _forceBackSpace = false;

            if (AutoCompleteListBox.Visibility == Visibility.Visible)
                _autoCompleteManager.PreviewKeyDown(e);
        }

        private DispatcherOperation _autoIndentDispatcherOperation;

        private void DispatchAutoIndent()
        {
            _autoIndentDispatcherOperation?.Abort();
            if (_autoIndentDispatcherOperation?.Status != DispatcherOperationStatus.Executing)
                _autoIndentDispatcherOperation =
                    Dispatcher.InvokeAsync(AutoIndent, DispatcherPriority.ApplicationIdle);
        }

        private void AutoIndent()
        {
            var p = RichTextBox.Selection.End.Paragraph;
            if (p is null)
                p = _document.Blocks.FirstBlock as Paragraph;
            else if (p.PreviousBlock is not null)
                p = p.PreviousBlock as Paragraph;

            if (p is null)
            {
                p = new Paragraph(new Run());
                _document.Blocks.Add(p);
            }
            var indent = 0.0;
            var i = 0;
            var pp = (p.PreviousBlock as Paragraph);
            if (pp is not null)
            {
                indent = pp.TextIndent;
                var s = new TextRange(pp.ContentStart, pp.ContentEnd).Text.Trim().ToLowerInvariant();
                if (s.Length > 3 && s[0] == '#')
                {
                    var span = s.AsSpan(1);
                    if (IsIndentStart(span) || span.StartsWith("else"))
                        indent += AutoIndentStep;
                }
            }
            _isTextChangedEnabled = false;
            RichTextBox.BeginChange();
            while (p is not null)
            {
                if (!UpdateIndent(p, ref indent))
                {
                    if (p.TextIndent == indent)
                    {
                        ++i;
                        if (i > 5)
                            break;
                    }
                    else
                    {
                        p.TextIndent = indent;
                        i = 0;
                    }
                }
                p = p.NextBlock as Paragraph;
            }
            RichTextBox.EndChange();
            _isTextChangedEnabled = true;
        }

        private void SetAutoIndent()
        {
            var indent = 0.0;
            var p = _document.Blocks.FirstBlock as Paragraph;

            _isTextChangedEnabled = false;
            RichTextBox.BeginChange();
            while (p is not null)
            {
                if (!UpdateIndent(p, ref indent))
                    p.TextIndent = indent;

                p = p.NextBlock as Paragraph;
            }
            RichTextBox.EndChange();
            _isTextChangedEnabled = true;
        }

        private static bool UpdateIndent(Paragraph p, ref double indent)
        {
            var s = new TextRange(p.ContentStart, p.ContentEnd).Text.ToLowerInvariant().Trim();
            if (s.Length > 3 && s[0] == '#')
            {
                var span = s.AsSpan(1);
                if (!IsIndent(span))
                    return false;
                else if (IsIndentStart(span))
                {
                    p.TextIndent = indent;
                    indent += AutoIndentStep;
                }
                else if (IsIndentEnd(span))
                {
                    indent -= AutoIndentStep;
                    if (indent < 0)
                        indent = 0;
                    p.TextIndent = indent;
                }
                else
                    p.TextIndent = Math.Max(indent - AutoIndentStep, 0);

                return true;
            }
            return false;
        }

        private static bool IsIndent(ReadOnlySpan<char> s) =>
            s.StartsWith("if") ||
            s.StartsWith("el") ||
            s.StartsWith("en") ||
            s.StartsWith("re") ||
            s.StartsWith("fo") ||
            s.StartsWith("wh") ||
            s.StartsWith("lo") ||
            s.StartsWith("def") &&
            !s.Contains('=');

        private static bool IsIndentStart(ReadOnlySpan<char> s) =>
            s.StartsWith("if") ||
            s.StartsWith("repeat") ||
            s.StartsWith("for ") ||
            s.StartsWith("while") ||
            s.StartsWith("def") &&
            !s.Contains('=');

        private static bool IsIndentEnd(ReadOnlySpan<char> s) =>
            s.StartsWith("end") || s.StartsWith("loop");

        private void HighLightAll()
        {
            _isTextChangedEnabled = false;
            Cursor = Cursors.Wait;
            RichTextBox.BeginChange();
            _highlighter.Defined.Get(InputTextLines, IsComplex);
            SetCodeCheckBoxVisibility();
            var p = _document.Blocks.FirstBlock as Paragraph;
            var i = 1;
            while (p is not null)
            {
                if (_forceHighlight)
                    _highlighter.Parse(p, IsComplex, i, false, new TextRange(p.ContentStart, p.ContentEnd).Text.TrimStart('\t'));
                else
                    _highlighter.Parse(p, IsComplex, i, false);
                p = p.NextBlock as Paragraph;
                ++i;
            }
            _currentParagraph = RichTextBox.Selection.Start.Paragraph;
            _currentLineNumber = GetLineNumber(_currentParagraph);
            HighLighter.Clear(_currentParagraph);
            RichTextBox.EndChange();
            Cursor = Cursors.Arrow;
            _isTextChangedEnabled = true;
        }

        private DispatcherOperation _highLightFromCurrentDispatcherOperation;

        private async void DispatchHighLightFromCurrent()
        {
            _highLightFromCurrentDispatcherOperation?.Abort();
            var currentkeyDownCount = _countKeys;
            await Task.Delay(250).ContinueWith(delegate
            {
                if (currentkeyDownCount == _countKeys &&
                    _highLightFromCurrentDispatcherOperation?.Status != DispatcherOperationStatus.Executing)
                    _highLightFromCurrentDispatcherOperation =
                        Dispatcher.BeginInvoke(HighLightFromCurrent, DispatcherPriority.ApplicationIdle);
            });
        }

        private void HighLightFromCurrent()
        {
            if (_lastModifiedParagraph is null)
                return;

            _isTextChangedEnabled = false;
            RichTextBox.BeginChange();
            var p = _lastModifiedParagraph.NextBlock as Paragraph;
            var lineNumber = GetLineNumber(p);
            var maxNumber = lineNumber + 35;
            while (p is not null)
            {
                if (!ReferenceEquals(p, _currentParagraph))
                    p = _highlighter.CheckHighlight(p, ref lineNumber);

                if (p is null)
                    break;

                p = p.NextBlock as Paragraph;
                lineNumber++;
                if (lineNumber >= maxNumber)
                    break;
            }
            _lastModifiedParagraph = p;
            RichTextBox.EndChange();
            _isTextChangedEnabled = true;
        }

        private void HighLightPastedText()
        {
            _isTextChangedEnabled = false;
            RichTextBox.BeginChange();
            var p = _pasteEnd.Paragraph;
            _currentParagraph = RichTextBox.Selection.Start.Paragraph;
            p ??= _document.Blocks.FirstBlock as Paragraph;

            var lineNumber = GetLineNumber(p);
            while (p != _currentParagraph && p != null)
            {
                _highlighter.Parse(p, IsComplex, lineNumber++, false);
                p = p.NextBlock as Paragraph;
            }
            _currentLineNumber = GetLineNumber(_currentParagraph);
            HighLighter.Clear(_currentParagraph);
            RichTextBox.EndChange();
            _isTextChangedEnabled = true;
        }

        private void RichTextBox_PreviewDrop(object sender, DragEventArgs e)
        {
            _isPasting = true;
            GetPasteOffset();
        }

        private void RichTextBox_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
        {
            if (IsControlDown)
            {
                e.Handled = true;
                var d = RichTextBox.FontSize + Math.CopySign(2, e.Delta);
                if (d > 4 && d < 42)
                {
                    RichTextBox.FontSize = d;
                    DispatchLineNumbers();
                }
            }
        }

        private static bool IsControlDown => (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control;
        private static bool IsAltDown => (Keyboard.Modifiers & ModifierKeys.Alt) == ModifierKeys.Alt;

        private void InvHypButton_Click(object sender, RoutedEventArgs e)
        {
            var b = (Button)sender;
            b.Tag = !(bool)b.Tag;
            if ((bool)b.Tag)
                b.Foreground = Brushes.Red;
            else
                b.Foreground = SystemColors.ControlTextBrush;

            bool inv = (bool)InvButton.Tag, hyp = (bool)HypButton.Tag;
            string pref = string.Empty, post = string.Empty;
            if (inv)
                pref = "a";

            if (hyp)
                post = "h";

            double fs = inv && hyp ? 14d : 15d;
            FontFamily ff;
            if (inv || hyp)
                ff = new FontFamily("Arial Nova Cond");
            else
                ff = new FontFamily("Roboto");

            SetTrigButton(SinButton, pref + "sin" + post, fs, ff);
            SetTrigButton(CosButton, pref + "cos" + post, fs, ff);
            SetTrigButton(TanButton, pref + "tan" + post, fs, ff);
            SetTrigButton(CscButton, pref + "csc" + post, fs, ff);
            SetTrigButton(SecButton, pref + "sec" + post, fs, ff);
            SetTrigButton(CotButton, pref + "cot" + post, fs, ff);
            PowButton.Visibility = inv ? Visibility.Hidden : Visibility.Visible;
            SqrButton.Visibility = inv ? Visibility.Hidden : Visibility.Visible;
            CubeButton.Visibility = inv ? Visibility.Hidden : Visibility.Visible;
            ExpButton.Visibility = inv ? Visibility.Hidden : Visibility.Visible;
            RootButton.Visibility = inv ? Visibility.Visible : Visibility.Hidden;
            SqrtButton.Visibility = inv ? Visibility.Visible : Visibility.Hidden;
            CbrtButton.Visibility = inv ? Visibility.Visible : Visibility.Hidden;
            LnButton.Visibility = inv ? Visibility.Visible : Visibility.Hidden;
        }

        private static void SetTrigButton(Button btn, string s, double fontSize, FontFamily fontFamily)
        {
            btn.Content = s;
            btn.Tag = s + "(x)";
            btn.FontSize = fontSize;
            btn.FontFamily = fontFamily;
            btn.FontStretch = fontFamily.Source.Contains("Cond") ?
                FontStretches.Condensed :
                FontStretches.Normal;

            btn.FontWeight = fontFamily.Source.Contains("Light") ?
                FontWeights.Light :
                FontWeights.Normal;

            btn.ToolTip = s switch
            {
                "sin" => MathResources.Sine,
                "cos" => MathResources.Cosine,
                "tan" => MathResources.Tangent,
                "csc" => MathResources.Cosecant,
                "sec" => MathResources.Secant,
                "cot" => MathResources.Cotangent,

                "asin" => MathResources.InverseSine,
                "acos" => MathResources.InverseCosine,
                "atan" => MathResources.InverseTangent,
                "acsc" => MathResources.InverseCosecant,
                "asec" => MathResources.InverseSecant,
                "acot" => MathResources.InverseCotangent,

                "sinh" => MathResources.HyperbolicSine,
                "cosh" => MathResources.HyperbolicCosine,
                "tanh" => MathResources.HyperbolicTangent,
                "csch" => MathResources.HyperbolicCosecant,
                "sech" => MathResources.HyperbolicSecant,
                "coth" => MathResources.HyperbolicCotangent,

                "asinh" => MathResources.InverseHyperbolicSine,
                "acosh" => MathResources.InverseHyperbolicCosine,
                "atanh" => MathResources.InverseHyperbolicTangent,
                "acsch" => MathResources.InverseHyperbolicCosecant,
                "asech" => MathResources.InverseHyperbolicSecant,
                "acoth" => MathResources.InverseHyperbolicCotangent,
                _ => null
            };
        }

        private void ColorScaleComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            ClearOutput();
        }

        private void LightDirectionComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            ClearOutput();
        }


        private void ShadowsCheckBox_Click(object sender, RoutedEventArgs e)
        {
            ClearOutput();
        }

        private void SmoothCheckBox_Click(object sender, RoutedEventArgs e)
        {
            ClearOutput();
        }

        private void EmbedCheckBox_Click(object sender, RoutedEventArgs e)
        {
            ClearOutput();
        }

        private void AdaptiveCheckBox_Click(object sender, RoutedEventArgs e)
        {
            _parser.Settings.Plot.IsAdaptive = AdaptiveCheckBox.IsChecked ?? false;
            ClearOutput();
        }

        private void Window_KeyUp(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                if (_isParsing)
                {
                    _autoRun = false;
                    Cancel();
                }
                else if (_parser.IsPaused)
                    Cancel();
            }
            else if (e.Key == Key.Pause || e.Key == Key.P && IsControlDown && IsAltDown)
            {
                if (_isParsing)
                    Pause();
            }
            else if (e.Key == Key.F12)
            {
                // Cycle through themes with F12
                Themes.ThemeManager.CycleTheme();
                UpdateThemeMenuCheckmarks();
            }
        }

        private void Cancel()
        {
            bool isPaused = _parser.IsPaused;
            _parser.Cancel();
            if (isPaused)
            {
                if (IsWebForm)
                    CalculateAsync(true);
                else
                    ShowHelp();
            }
        }

        private void Pause() => _parser.Pause();

        bool _sizeChanged;
        private void RichTextBox_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            _sizeChanged = true;
            _autoCompleteManager.MoveAutoComplete();
            _avalonEditAutoComplete.MoveAutoComplete();
            _lineNumbersDispatcherOperation?.Abort();
            _lineNumbersDispatcherOperation = Dispatcher.InvokeAsync(DrawLineNumbers, DispatcherPriority.ApplicationIdle);
        }

        private void Window_Unloaded(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            _screenScaleFactor = ScreenMetrics.GetWindowsScreenScalingFactor();
            ReadSettings();
            InitializeTheme(); // Initialize theme from saved settings
            if (Top < 0)
                Top = 0;

            var h = SystemParameters.PrimaryScreenHeight;
            if (Height > h)
                Height = h;
        }

        private async void Include_Click(object sender, MouseButtonEventArgs e)
        {
            if (e.LeftButton == MouseButtonState.Pressed)
            {
                var r = (Run)sender;
                var fileName = r?.Text.Trim();
                if (File.Exists(fileName))
                {
                    Mouse.SetCursor(Cursors.Wait);
                    var tt = (ToolTip)r.ToolTip;
                    if (tt is not null)
                        tt.Visibility = Visibility.Hidden;
                    var ext = Path.GetExtension(fileName).ToLowerInvariant();
                    var path = Path.GetFullPath(fileName);
                    Process process;
                    if (ext == ".txt")
                        process = RunExternalApp("NOTEPAD++", path);
                    else
                    {
                        process = RunExternalApp(AppInfo.FullName, path);
                        process ??= RunExternalApp("NOTEPAD++", path);
                    }
                    process ??= RunExternalApp("NOTEPAD", path);
                    if (tt is not null)
                        tt.Visibility = Visibility.Visible;

                    if (process is not null)
                    {
                        _calculateOnActivate = true;
                        if (tt is not null)
                        {
                            string s = Include(fileName, null);
                            tt.Content = HighLighter.GetPartialSource(s);
                        }
                        if (IsCalculated)
                        {
                            if (IsAutoRun)
                            {
                                _isTextChangedEnabled = false;
                                await AutoRun();
                                _isTextChangedEnabled = true;
                            }
                            else
                            {
                                ShowHelp();
                                IsCalculated = false;
                            }
                        }
                        e.Handled = true;
                    }
                }
            }
        }

        private string Include(string fileName, Queue<string> fields)
        {
            var isLocal = false;
            var s = ReadTextFromFile(fileName);
            var j = s.IndexOf('\v');
            var hasForm = j > 0;
            var lines = (hasForm ? s[..j] : s).EnumerateLines();
            var getLines = new List<string>();
            var sf = hasForm ? s[(j + 1)..] : default;
            Queue<string> getFields = GetFields(sf, fields);
            foreach (var line in lines)
            {
                if (Validator.IsKeyword(line, "#local"))
                    isLocal = true;
                else if (Validator.IsKeyword(line, "#global"))
                    isLocal = false;
                else
                {
                    if (!isLocal)
                    {
                        if (Validator.IsKeyword(line, "#include"))
                        {
                            var includeFileName = UserDefined.GetFileName(line);
                            var includeFilePath = Path.GetFullPath(Environment.ExpandEnvironmentVariables(includeFileName));
                            if (!File.Exists(includeFilePath))
                                throw new FileNotFoundException($"{Core.Messages.File_not_found}: {includeFileName}.");

                            getLines.Add(fields is null
                                    ? Include(includeFilePath, null)
                                    : Include(includeFilePath, new()));
                        }
                        else
                            getLines.Add(line.ToString());
                    }
                }
            }
            if (hasForm && string.IsNullOrWhiteSpace(getLines[^1]))
                getLines.RemoveAt(getLines.Count - 1);

            var len = getLines.Count;
            if (len > 0)
            {
                _stringBuilder.Clear();
                for (int i = 0; i < len; ++i)
                {
                    if (getFields is not null && getFields.Count != 0)
                    {
                        if (MacroParser.SetLineInputFields(getLines[i].TrimEnd(), _stringBuilder, getFields, false))
                            getLines[i] = _stringBuilder.ToString();

                        _stringBuilder.Clear();
                    }
                }
            }
            return string.Join(Environment.NewLine, getLines);
        }

        private static Queue<string> GetFields(ReadOnlySpan<char> s, Queue<string> fields)
        {
            if (fields is null)
                return null;

            if (fields.Count != 0)
            {
                if (!s.IsEmpty)
                {
                    var getFields = MacroParser.GetFields(s, '\t');
                    if (fields.Count < getFields.Count)
                    {
                        for (int i = 0; i < fields.Count; ++i)
                            getFields.Dequeue();

                        while (getFields.Count != 0)
                            fields.Enqueue(getFields.Dequeue());
                    }
                }
                return fields;
            }
            else if (!s.IsEmpty)
                return MacroParser.GetFields(s, '\t');
            else
                return null;
        }

        private bool ValidateInputFields(string[] fields)
        {
            for (int i = 0, len = fields.Length; i < len; ++i)
            {
                var s = fields[i].AsSpan();
                if (s.Length > 0)
                {
                    var j = s.IndexOf(':');
                    if (j > 0)
                        s = s[(j + 1)..];
                }
                if (s.Length == 0 || s[0] == '+' || !double.TryParse(s, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var _))
                {
                    _wv2Warper.ReportInputFieldError(i);
                    return false;
                }
            }
            return true;
        }


        private bool SetInputFields(string[] fields)
        {
            if (fields is null ||
                fields.Length == 0 ||
                fields.Length == 1 && string.IsNullOrEmpty(fields[0]))
                return true;

            if (!ValidateInputFields(fields))
                return false;

            var p = _document.Blocks.FirstBlock;
            var i = 0;
            var line = 0;
            var fline = 0;
            _stringBuilder.Clear();
            var values = new Queue<string>();
            _isTextChangedEnabled = false;
            RichTextBox.BeginChange();
            while (p is not null && i < fields.Length)
            {
                ++line;
                values.Clear();
                while (i < fields.Length)
                {
                    var s = fields[i].AsSpan();
                    if (s.Length > 0)
                    {
                        var j = s.IndexOf(':');
                        if (j < 0 || !int.TryParse(s[..j], out fline))
                            fline = 0;

                        if (fline > line)
                            break;

                        values.Enqueue(s[(j + 1)..].ToString().Trim());
                    }
                    ++i;
                }
                if (values.Count != 0)
                {
                    var r = new TextRange(p.ContentStart, p.ContentEnd);
                    if (MacroParser.SetLineInputFields(r.Text.TrimEnd(), _stringBuilder, values, true))
                    {
                        if (_forceHighlight)
                            r.Text = _stringBuilder.ToString();
                        else
                            _highlighter.Parse(p as Paragraph, IsComplex, line, true, _stringBuilder.ToString());
                    }
                    _stringBuilder.Clear();
                }
                if (fline > line)
                {
                    line = fline - 1;
                    p = _document.Blocks.ElementAt(line);
                }
                else
                    p = p.NextBlock;
            }
            RichTextBox.EndChange();
            _isTextChangedEnabled = true;
            return true;
        }

        private void SetInputFieldsFromFile(SplitEnumerator fields)
        {
            if (fields.IsEmpty)
                return;

            var p = _document.Blocks.FirstOrDefault();
            _stringBuilder.Clear();
            var values = new Queue<string>();
            foreach (var s in fields)
                values.Enqueue(s.ToString());

            while (p is not null && values.Count != 0)
            {
                var r = new TextRange(p.ContentStart, p.ContentEnd);
                if (MacroParser.SetLineInputFields(r.Text.TrimEnd(), _stringBuilder, values, false))
                    r.Text = _stringBuilder.ToString();

                _stringBuilder.Clear();
                p = p.NextBlock;
            }
        }

        private void Logo_MouseUp(object sender, MouseButtonEventArgs e)
        {
            try
            {
                var info = new ProcessStartInfo
                {
                    FileName = "https://calcpad.eu",
                    UseShellExecute = true
                };
                Process.Start(info);
            }
            catch { }
        }

        private void PdfButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isParsing)
                return;

            if (IsCalculated || IsWebForm || _parser.IsPaused)
            {
                var fileName = PromtSavePdf();
                if (fileName is not null)
                    SavePdf(fileName);
            }
            else
            {
                var fileName = _currentCultureName == "en" ?
                    $"{AppInfo.DocPath}\\help.pdf" :
                    $"{AppInfo.DocPath}\\help.{_currentCultureName}.pdf";
                if (!File.Exists(fileName))
                    fileName = $"{AppInfo.DocPath}doc\\help.pdf";

                StartPdf(fileName);
            }
        }

        private string PromtSavePdf()
        {
            var dlg = new SaveFileDialog
            {
                DefaultExt = ".pdf",
                Filter = "Pdf File (*.pdf)|*.pdf",
                FileName = Path.ChangeExtension(Path.GetFileName(CurrentFileName), "pdf"),
                InitialDirectory = File.Exists(CurrentFileName) ? Path.GetDirectoryName(CurrentFileName) : DocumentPath,
                OverwritePrompt = true
            };
            var result = (bool)dlg.ShowDialog();
            return result ? dlg.FileName : null;
        }

        private async void SavePdf(string pdfFileName)
        {
            var settings = _wv2Warper.CreatePrintSettings();
            await WebViewer.CoreWebView2.PrintToPdfAsync(pdfFileName, settings);
            StartPdf(pdfFileName);
        }

        private static void StartPdf(string pdfFileName)
        {
            var process = new Process()
            {
                StartInfo = new ProcessStartInfo(pdfFileName)
                {
                    UseShellExecute = true
                }
            };
            process.Start();
        }

        private void UnitsRadioButton_Checked(object sender, RoutedEventArgs e)
        {
            ExpressionParser.IsUs = ReferenceEquals(sender, US);
            ClearOutput();
        }
        private async void WebViewer_NavigationCompleted(object sender, Microsoft.Web.WebView2.Core.CoreWebView2NavigationCompletedEventArgs e)
        {
           if (!await _wv2Warper.CheckIsReportAsync())
                return;

            _isParsing = false;
            if (_isSaving)
            {
                var zip = IsCompressedFormat(CurrentFileName);
                if (zip)
                {
                    _calcpadProcessor.MacroParser.Parse(InputText, out var outputText, null, 0, false);
                    WriteFile(CurrentFileName, outputText, true);
                }
                else
                    WriteFile(CurrentFileName, GetInputText());

                _isSaving = false;
                IsSaved = true;
            }
            else if (IsWebForm || IsCalculated || _parser.IsPaused)
            {
                SetUnits();
                if (IsCalculated || _parser.IsPaused)
                {
                    if (_scrollOutput)
                        await ScrollOutput();
                    else if (_scrollY > 0)
                    {
                        await _wv2Warper.SetScrollYAsync(_scrollY);
                        _scrollY = 0;
                    }
                }
            }
            if (_scrollOutputToLine > 0)
            {
                await ScrollOutputToLine(_scrollOutputToLine, _scrollOffset);
                _scrollOutputToLine = 0;
            }
        }

        private void WebViewer_KeyUp(object sender, KeyEventArgs e)
        {
            if (e.Key >= Key.D0 && e.Key <= Key.D9 || e.Key >= Key.NumPad0 && e.Key <= Key.NumPad9)
                IsSaved = false;
        }
        internal static bool Execute(string fileName, string args = "")
        {
            var proc = new Process();
            var psi = new ProcessStartInfo
            {
                UseShellExecute = true,
                FileName = fileName,
                Arguments = args
            };
            proc.StartInfo = psi;
            try
            {
                return proc.Start();
            }
            catch (Exception ex)
            {
                ShowErrorMessage(ex.Message);
                return false;
            }
        }

        private void DecimalScrollBar_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e) =>
            DecimalsTextBox.Text = (15 - e.NewValue).ToString(CultureInfo.InvariantCulture);

        private void Record() =>
            _undoMan.Record(
                InputText,
                _currentLineNumber,
                _currentOffset
            );

        private void ChangeCaseButton_Click(object sender, RoutedEventArgs e)
        {
            foreach (FrameworkElement element in GreekLettersWarpPanel.Children)
            {
                if (element is TextBlock tb)
                {
                    char c = tb.Text[0];
                    const int delta = 'Α' - 'α';
                    if (c == 'ς')
                        c = 'Σ';
                    else if (c == 'ϑ')
                        c = '∡';
                    else if (c == '∡')
                        c = 'ϑ';
                    else if (c == 'ø')
                        c = 'Ø';
                    else if (c == 'Ø')
                        c = 'ø';
                    else if (c >= 'α' && c <= 'ω')
                        c = (char)(c + delta);
                    else if ((c == 'Σ') && tb.Tag is string s)
                        c = s[0];
                    else if (c >= 'Α' && c <= 'Ω')
                        c = (char)(c - delta);
                    else if (c == '′')
                        c = '‴';
                    else if (c == '″')
                        c = '⁗';
                    else if (c == '‴')
                        c = '′';
                    else if (c == '⁗')
                        c = '″';
                    else if (c == '‰')
                        c = '‱';
                    else if (c == '‱')
                        c = '‰';
                    tb.Text = c.ToString();
                }
            }
        }

        private static char LatinGreekChar(char c) => c switch
        {
            >= 'a' and <= 'z' => GreekLetters[c - 'a'],
            'V' => '∡',
            'J' => 'Ø',
            >= 'A' and <= 'Z' => (char)(GreekLetters[c - 'A'] + 'Α' - 'α'),
            >= 'α' and <= 'ω' => LatinLetters[c - 'α'],
            >= 'Α' and <= 'Ω' => (char)(LatinLetters[c - 'Α'] + 'A' - 'a'),
            'ϑ' => 'v',
            'ø' => 'j',
            'Ø' => 'J',
            '∡' => 'V',
            '@' => '°',
            '\'' => '′',
            '"' => '″',
            '°' => '@',
            '′' => '\'',
            '″' => '"',
            _ => c
        };

        private async void RichTextBox_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (IsCalculated)
            {
                _scrollY = await _wv2Warper.GetScrollYAsync();
                await ScrollOutput();
            }
        }

        private void WebViewer_GotFocus(object sender, RoutedEventArgs e)
        {
            IsWebView2Focused = true;
        }

        private async void WebViewer_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.F5)
            {
                // Usar Command_Calculate para soportar modo IFC
                Command_Calculate(null, null);
                e.Handled = true;
            }
            else if (e.Key == Key.O && Keyboard.Modifiers == ModifierKeys.Control)
            {
                Command_Open(this, null);
                e.Handled = true;
            }
            else if (e.Key == Key.L && Keyboard.Modifiers == ModifierKeys.Control)
            {
                // Ctrl+L: Dump WebView2 HTML to log.html for debugging
                await DumpWebViewToLogHtml();
                e.Handled = true;
            }
        }

        private async System.Threading.Tasks.Task DumpWebViewToLogHtml()
        {
            try
            {
                if (WebViewer.CoreWebView2 == null) return;
                var html = await WebViewer.CoreWebView2.ExecuteScriptAsync("document.documentElement.outerHTML");
                // Result comes as JSON string, unescape it
                html = System.Text.Json.JsonSerializer.Deserialize<string>(html);
                var logPath = System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Documents", "Hekatan-7.5.7", "Hekatan.Wpf", "DebugLogs", "log.html");
                System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(logPath));
                System.IO.File.WriteAllText(logPath, html);
                // Open in default browser
                Process.Start(new ProcessStartInfo { FileName = logPath, UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error dumping log.html:\n{ex.Message}", "Debug",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void AutoRunCheckBox_Checked(object sender, RoutedEventArgs e)
        {
            if (IsInitialized)
            {
                if (IsAutoRun && !IsCalculated)
                    Calculate();

                RichTextBox.Focus();
                Keyboard.Focus(RichTextBox);
            }
        }

        private void AutoRunCheckBox_Unchecked(object sender, RoutedEventArgs e)
        {
            RichTextBox.Focus();
            Keyboard.Focus(RichTextBox);
        }

        private void RichTextBox_PreviewMouseDown(object sender, MouseButtonEventArgs e)
        {
            IsWebView2Focused = false;
            _isTextChangedEnabled = false;
            RichTextBox.Selection.ApplyPropertyValue(TextElement.BackgroundProperty, null);
            AutoCompleteListBox.Visibility = Visibility.Hidden;
            _isTextChangedEnabled = true;
        }

        private void FindReplace_BeginSearch(object sender, EventArgs e)
        {
            _autoRun = false;
            _isTextChangedEnabled = false;
        }

        private void FindReplace_EndSearch(object sender, EventArgs e)
        {
            _isTextChangedEnabled = true;
        }

        private void FindReplace_EndReplace(object sender, EventArgs e)
        {
            Task.Run(() => Dispatcher.InvokeAsync(
                HighLightAll,
                DispatcherPriority.Send));
            Task.Run(() => Dispatcher.InvokeAsync(SetAutoIndent, DispatcherPriority.Normal));
        }

        private void RichTextBox_PreviewTextInput(object sender, TextCompositionEventArgs e)
        {
            if (_countKeys == int.MaxValue)
                _countKeys = int.MinValue;

            ++_countKeys;
            if (!_autoCompleteManager.IsInComment())
            {
                Task.Run(() => Dispatcher.InvokeAsync(() => _autoCompleteManager.InitAutoComplete(e.Text, _currentParagraph), DispatcherPriority.Send));
            }
        }

        private void Window_Activated(object sender, EventArgs e)
        {
            if (_calculateOnActivate)
            {
                if (IsAutoRun)
                    CalculateAsync();
                else
                    Calculate();
                _calculateOnActivate = false;
            }
        }

        private void CodeCheckBox_Click(object sender, RoutedEventArgs e)
        {
            ClearOutput();
        }

        private void SetCodeCheckBoxVisibility() =>
            CodeCheckBorder.Visibility = _highlighter.Defined.HasMacros ? Visibility.Visible : Visibility.Hidden;


        private static void ShowErrorMessage(string message) =>
            MessageBox.Show(message, "Hekatan", MessageBoxButton.OK, MessageBoxImage.Error);

        private async void Window_ContentRendered(object sender, EventArgs e)
        {
            try
            {
                await InitializeWebViewer();
                TryOpenOnStartup();
                TryRestoreState();
                RichTextBox.Focus();
                Keyboard.Focus(RichTextBox);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[Window_ContentRendered] Error: {ex.Message}\n{ex.StackTrace}");
                MessageBox.Show(
                    $"Error durante la inicialización:\n{ex.Message}",
                    "Hekatan Calc",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
        }

        private async Task InitializeWebViewer()
        {
            var options = new CoreWebView2EnvironmentOptions("--allow-file-access-from-files");
            var env = await CoreWebView2Environment.CreateAsync(
                null,
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HekatanWebView2"),
                options
            );
            await WebViewer.EnsureCoreWebView2Async(env);
            RichTextBox.IsEnabled = true;
            WebViewer.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "calcpad.local",
                 AppInfo.DocPath,
                CoreWebView2HostResourceAccessKind.Allow);

            // Map IFC resources to virtual host for WebView2 security
            // Maps https://calcpad.ifc/ to {AppInfo.Path}/resources/ifc/
            var ifcResourcePath = System.IO.Path.Combine(AppInfo.Path, "resources", "ifc");

            // Debug: Verify directory exists and contains required files
            if (!System.IO.Directory.Exists(ifcResourcePath))
            {
                System.IO.Directory.CreateDirectory(ifcResourcePath);
            }

            // Log mapping for debug
            var debugLog = $"IFC Virtual Host Mapping:\n" +
                          $"Host: calcpad.ifc\n" +
                          $"Path: {ifcResourcePath}\n" +
                          $"Exists: {System.IO.Directory.Exists(ifcResourcePath)}\n" +
                          $"Files: {string.Join(", ", System.IO.Directory.GetFiles(ifcResourcePath).Select(f => System.IO.Path.GetFileName(f)))}";
            System.Diagnostics.Debug.WriteLine(debugLog);

            WebViewer.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "calcpad.ifc",
                ifcResourcePath,
                CoreWebView2HostResourceAccessKind.Allow);

            WebViewer.CoreWebView2.Settings.AreDevToolsEnabled = true;
            WebViewer.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            WebViewer.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = true;
        }

        private void MenuCli_Click(object sender, RoutedEventArgs e)
        {
            Execute(AppInfo.Path + "Cli.exe");
        }

        private void ZeroSmallMatrixElementsCheckBox_Click(object sender, RoutedEventArgs e) => ClearOutput();

        private void MaxOutputCountTextBox_KeyUp(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
                ClearOutput(false);
        }

        private void MaxOutputCountTextBox_LostFocus(object sender, RoutedEventArgs e) => ClearOutput(false);

        private void PasteAsCommentMenu_Click(object sender, RoutedEventArgs e)
        {
            RichTextBox.BeginChange();
            RichTextBox.Selection.Text = string.Empty;
            InsertLines(Clipboard.GetText(), Environment.NewLine, true);
            RichTextBox.EndChange();
            RichTextBox.Focus();
        }

        private void CommentUncomment(bool comment)
        {
            // Check if using AvalonEdit
            if (_isAvalonEditActive && TextEditor != null)
            {
                CommentUncommentAvalonEdit(comment);
                return;
            }

            var ss = RichTextBox.Selection.Start;
            var ps = ss.Paragraph;
            var se = RichTextBox.Selection.End;
            var pe = se.Paragraph;
            var lineNumber = GetLineNumber(ps);

            // Detect current language block to use correct comment character
            string commentChar = DetectCommentCharacter(lineNumber);

            bool matches;
            RichTextBox.BeginChange();
            var start = true;
            do
            {
                if (ps is null)
                    break;
                var tr = new TextRange(ps.ContentStart, ps.ContentEnd);
                var text = tr.Text;

                // Check if line is commented with any known comment character
                var isComment = text.StartsWith('\'') ||
                    text.StartsWith('"') ||
                    text.StartsWith("//") ||
                    text.StartsWith('#');

                if (comment != isComment)
                {
                    if (comment)
                        tr.Text = commentChar + text;
                    else
                    {
                        // Remove the comment character(s)
                        if (text.StartsWith("//"))
                            tr.Text = text[2..];
                        else if (text.StartsWith('\'') || text.StartsWith('"') || text.StartsWith('#'))
                            tr.Text = text[1..];
                    }
                }
                _highlighter.Defined.Get(tr.Text, lineNumber);
                _highlighter.Parse(ps, IsComplex, lineNumber, start);
                start = false;
                matches = ReferenceEquals(ps, pe);
                ps = ps.NextBlock as Paragraph;
            } while (!matches);
            _currentParagraph = pe;
            HighLighter.Clear(_currentParagraph);
            SetAutoIndent();
            RichTextBox.Selection.Select(ss, se);
            RichTextBox.EndChange();
            RichTextBox.Focus();
        }

        /// <summary>
        /// Detect the comment character based on the current language block
        /// </summary>
        private string DetectCommentCharacter(int lineNumber)
        {
            // Get all text to analyze which block we're in
            string allText = _isAvalonEditActive && TextEditor != null
                ? TextEditor.Text
                : new TextRange(_document.ContentStart, _document.ContentEnd).Text;

            var lines = allText.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            if (lineNumber < 0 || lineNumber >= lines.Length)
                return "'"; // Default to Hekatan

            // Search backwards to find the opening directive
            string currentLanguage = "calcpad"; // Default
            for (int i = lineNumber; i >= 0; i--)
            {
                var line = lines[i].Trim().ToLowerInvariant();

                // Check for opening directives
                if (line.StartsWith("@{html-ifc}") || line.StartsWith("@{html}"))
                    { currentLanguage = "html"; break; }
                if (line.StartsWith("@{javascript}") || line.StartsWith("@{js}") || line.StartsWith("@{typescript}") || line.StartsWith("@{ts}"))
                    { currentLanguage = "javascript"; break; }
                if (line.StartsWith("@{python}") || line.StartsWith("@{py}"))
                    { currentLanguage = "python"; break; }
                if (line.StartsWith("@{csharp}") || line.StartsWith("@{cs}") || line.StartsWith("@{c}") || line.StartsWith("@{cpp}"))
                    { currentLanguage = "csharp"; break; }
                if (line.StartsWith("@{powershell}") || line.StartsWith("@{ps}"))
                    { currentLanguage = "powershell"; break; }
                if (line.StartsWith("@{bash}") || line.StartsWith("@{sh}"))
                    { currentLanguage = "bash"; break; }
                if (line.StartsWith("@{sql}"))
                    { currentLanguage = "sql"; break; }
                if (line.StartsWith("@{octave}") || line.StartsWith("@{matlab}"))
                    { currentLanguage = "octave"; break; }
                if (line.StartsWith("@{r}"))
                    { currentLanguage = "r"; break; }
                if (line.StartsWith("@{rust}"))
                    { currentLanguage = "rust"; break; }
                if (line.StartsWith("@{go}"))
                    { currentLanguage = "go"; break; }
                if (line.StartsWith("@{ucode}") || line.StartsWith("@{code}"))
                    { currentLanguage = "ucode"; break; }

                // Check for closing directives (means we're outside)
                if (line.StartsWith("@{end "))
                    { currentLanguage = "calcpad"; break; }
            }

            // Return the appropriate comment character
            return currentLanguage switch
            {
                "html" or "javascript" or "csharp" or "cpp" or "c" or "go" or "rust" or "typescript" or "ucode" => "// ",
                "python" or "bash" or "powershell" or "r" or "octave" => "# ",
                "sql" => "-- ",
                _ => "'" // Hekatan default
            };
        }

        /// <summary>
        /// Comment/Uncomment for AvalonEdit
        /// </summary>
        private void CommentUncommentAvalonEdit(bool comment)
        {
            if (TextEditor == null) return;

            var document = TextEditor.Document;
            var selection = TextEditor.TextArea.Selection;
            int startLine, endLine;

            if (selection.IsEmpty)
            {
                // No selection, use current line
                startLine = endLine = TextEditor.TextArea.Caret.Line;
            }
            else
            {
                startLine = selection.StartPosition.Line;
                endLine = selection.EndPosition.Line;
            }

            // Detect comment character based on current position
            string commentChar = DetectCommentCharacter(startLine - 1); // 0-based for DetectCommentCharacter

            document.BeginUpdate();
            try
            {
                for (int lineNum = startLine; lineNum <= endLine; lineNum++)
                {
                    var line = document.GetLineByNumber(lineNum);
                    string lineText = document.GetText(line.Offset, line.Length);
                    string trimmedText = lineText.TrimStart();

                    if (comment)
                    {
                        // Add comment
                        int insertOffset = line.Offset + (lineText.Length - trimmedText.Length);
                        document.Insert(insertOffset, commentChar);
                    }
                    else
                    {
                        // Remove comment - check for various comment styles
                        if (trimmedText.StartsWith("// "))
                        {
                            int commentStart = line.Offset + lineText.IndexOf("// ");
                            document.Remove(commentStart, 3);
                        }
                        else if (trimmedText.StartsWith("//"))
                        {
                            int commentStart = line.Offset + lineText.IndexOf("//");
                            document.Remove(commentStart, 2);
                        }
                        else if (trimmedText.StartsWith("# "))
                        {
                            int commentStart = line.Offset + lineText.IndexOf("# ");
                            document.Remove(commentStart, 2);
                        }
                        else if (trimmedText.StartsWith("#"))
                        {
                            int commentStart = line.Offset + lineText.IndexOf("#");
                            document.Remove(commentStart, 1);
                        }
                        else if (trimmedText.StartsWith("-- "))
                        {
                            int commentStart = line.Offset + lineText.IndexOf("-- ");
                            document.Remove(commentStart, 3);
                        }
                        else if (trimmedText.StartsWith("--"))
                        {
                            int commentStart = line.Offset + lineText.IndexOf("--");
                            document.Remove(commentStart, 2);
                        }
                        else if (trimmedText.StartsWith("'"))
                        {
                            int commentStart = line.Offset + lineText.IndexOf("'");
                            document.Remove(commentStart, 1);
                        }
                    }
                }
            }
            finally
            {
                document.EndUpdate();
            }
        }

        private void CommentMenu_Click(object sender, RoutedEventArgs e) =>
            CommentUncomment(true);


        private void WebViewer_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            var message = e.TryGetWebMessageAsString();
            if (message == "clicked")
                WebViewer_LinkClicked();
            else if (message == "focused")
                IsWebView2Focused = true;
            else
            {
                // Try to parse as JSON for updateEditor messages
                try
                {
                    var json = System.Text.Json.JsonDocument.Parse(message);
                    if (json.RootElement.TryGetProperty("type", out var typeElement))
                    {
                        var messageType = typeElement.GetString();

                        if (messageType == "updateEditor")
                        {
                            if (json.RootElement.TryGetProperty("content", out var contentElement))
                            {
                                var code = contentElement.GetString();
                                if (!string.IsNullOrEmpty(code))
                                {
                                    Dispatcher.Invoke(() => UpdateEditorWithConvertedCode(code));
                                }
                            }
                        }
                        else if (messageType == "updateEditorFull")
                        {
                            // Reemplazar TODO el contenido del editor con el HTML completo
                            if (json.RootElement.TryGetProperty("content", out var contentElement))
                            {
                                var fullHtml = contentElement.GetString();
                                if (!string.IsNullOrEmpty(fullHtml))
                                {
                                    Dispatcher.Invoke(() => UpdateEditorFullContent(fullHtml));
                                }
                            }
                        }
                    }
                }
                catch
                {
                    // Not a JSON message, ignore
                }
            }
        }

        /// <summary>
        /// Reemplaza TODO el contenido del editor con el HTML completo del visor IFC modificado
        /// </summary>
        private void UpdateEditorFullContent(string fullHtml)
        {
            try
            {
                // Agregar DOCTYPE si no está presente
                string htmlContent = fullHtml;
                if (!htmlContent.TrimStart().StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase))
                {
                    htmlContent = "<!DOCTYPE html>\n" + htmlContent;
                }

                // Actualizar el editor con el HTML completo
                if (_isAvalonEditActive && TextEditor != null)
                {
                    TextEditor.Text = htmlContent;
                }
                else
                {
                    SetInputText(htmlContent);
                }

                IsSaved = false;
                System.Diagnostics.Debug.WriteLine($"[UpdateEditorFullContent] Editor actualizado con {htmlContent.Length} caracteres");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[UpdateEditorFullContent] Error: {ex.Message}");
                ShowErrorMessage($"Error actualizando editor: {ex.Message}");
            }
        }

        /// <summary>
        /// Update the editor with converted code from IFC viewer
        /// Replaces the current @{ucode} or @{code} block with the new code
        /// </summary>
        private void UpdateEditorWithConvertedCode(string newCode)
        {
            try
            {
                string currentText = _isAvalonEditActive && TextEditor != null
                    ? TextEditor.Text
                    : new TextRange(_document.ContentStart, _document.ContentEnd).Text;

                // Find and replace the current @{ucode} or @{code} block
                var ucodePattern = new System.Text.RegularExpressions.Regex(
                    @"@\{ucode\}[\s\S]*?@\{end\s+ucode\}",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                var codePattern = new System.Text.RegularExpressions.Regex(
                    @"@\{code\}[\s\S]*?@\{end\s+code\}",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);

                string updatedText = currentText;
                bool replaced = false;

                // Try to replace @{ucode} block first
                if (ucodePattern.IsMatch(currentText))
                {
                    updatedText = ucodePattern.Replace(currentText, newCode, 1);
                    replaced = true;
                }
                // Then try @{code} block
                else if (codePattern.IsMatch(currentText))
                {
                    updatedText = codePattern.Replace(currentText, newCode, 1);
                    replaced = true;
                }

                if (replaced)
                {
                    if (_isAvalonEditActive && TextEditor != null)
                    {
                        TextEditor.Text = updatedText;
                    }
                    else
                    {
                        SetInputText(updatedText);
                    }
                    System.Diagnostics.Debug.WriteLine("Código convertido y actualizado en el editor");
                }
                else
                {
                    // No block found, copy to clipboard
                    System.Windows.Clipboard.SetText(newCode);
                    System.Diagnostics.Debug.WriteLine("Código copiado al portapapeles");
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error updating editor: {ex.Message}");
            }
        }

        private async void WebViewer_LinkClicked()
        {
            var s = await _wv2Warper.GetLinkDataAsync();
            if (s is null)
                return;

            if (Uri.IsWellFormedUriString(s, UriKind.Absolute))
            {
                // Validar que haya un navegador externo configurado
                var browser = ExternalBrowserComboBox.Text?.Trim().ToLower();
                if (!string.IsNullOrEmpty(browser))
                {
                    Execute(browser + ".exe", s);
                }
                else
                {
                    // Usar navegador predeterminado del sistema
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = s,
                            UseShellExecute = true
                        });
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Error al abrir navegador:\n{ex.Message}", "Error",
                            MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                }
            }
            else
            {
                var fileName = s.Replace('/', '\\');
                var path = Path.GetFullPath(fileName);
                if (File.Exists(path))
                {
                    fileName = path;
                    var ext = Path.GetExtension(fileName).ToLowerInvariant();
                    if (ext == ".hcalc" || ext == ".cpd" || ext == ".hcalcz" || ext == ".cpdz" || ext == ".txt")
                    {
                        var r = PromptSave();
                        if (r != MessageBoxResult.Cancel)
                            FileOpen(fileName);
                    }
                    else if (ext == ".htm" ||
                        ext == ".html" ||
                        ext == ".png" ||
                        ext == ".jpg" ||
                        ext == ".jpeg" ||
                        ext == ".gif" ||
                        ext == ".bmp")
                    {
                        // Validar que haya un navegador externo configurado
                        var browser = ExternalBrowserComboBox.Text?.Trim().ToLower();
                        if (!string.IsNullOrEmpty(browser))
                        {
                            Execute(browser + ".exe", s);
                        }
                        else
                        {
                            // Usar navegador predeterminado del sistema
                            try
                            {
                                Process.Start(new ProcessStartInfo
                                {
                                    FileName = s,
                                    UseShellExecute = true
                                });
                            }
                            catch (Exception ex)
                            {
                                MessageBox.Show($"Error al abrir navegador:\n{ex.Message}", "Error",
                                    MessageBoxButton.OK, MessageBoxImage.Error);
                            }
                        }
                    }
                }
                else if (s == "continue")
                    await AutoRun();
                else if (s == "cancel")
                    Cancel();
                else if (IsCalculated || _parser.IsPaused)
                    LineClicked(s);
                else if (!IsWebForm)
                    LinkClicked(s);
            }
        }

        private void MarkdownCheckBox_Checked(object sender, RoutedEventArgs e)
        {
            var blocks = _document.Blocks;
            if (MarkdownCheckBox.IsChecked == true)
            {
                var n1 = LastIndexOfParagraphContaining("#md");
                var n2 = LastIndexOfParagraphContaining("#md off");
                var n3 = LastIndexOfParagraphContaining("#md on");
                n1 = Math.Max(n1, n3);
                if (n1 < 0)
                {
                    n2 = n2 < 0 ? 0 : _currentLineNumber;
                    var p = new Paragraph(new Run("#md on") { Foreground = HighLighter.KeywordBrush });
                    var b = blocks.ElementAt(n2);
                    if (b is not null)
                        blocks.InsertBefore(b, p);
                }
                else if (n2 > n1)
                {
                    var p = new Paragraph(new Run("#md on") { Foreground = HighLighter.KeywordBrush });
                    if (_currentParagraph is not null)
                        blocks.InsertBefore(_currentParagraph, p);
                }
            }

            int LastIndexOfParagraphContaining(string s)
            {
                var i = _currentLineNumber;
                var p = _currentParagraph;
                while (p is not null && i >= 0)
                {
                    var text = new TextRange(p.ContentStart, p.ContentEnd).Text;
                    if (text.Trim() == s)
                        return i;
                    --i;
                    p = p.PreviousBlock as Paragraph;
                }
                return -1;
            }
        }

        private void UncommentMenu_Click(object sender, RoutedEventArgs e) =>
            CommentUncomment(false);

        private void RichTextBox_GotKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
        {
            IsWebView2Focused = false;
        }

        #region MultilangCode Menu Handlers

        private void ConfigurePythonPath_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("Python path configuration will be implemented here.",
                          "Configure Python", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void OpenPythonPowerShell_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error opening PowerShell:\n{ex.Message}", "Error",
                              MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void PipInstallPackage_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("pip install package dialog will be implemented here.",
                          "pip install", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void PipInstallRequirements_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("pip install requirements.txt will be implemented here.",
                          "pip install", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void PipListPackages_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("pip list will be implemented here.",
                          "pip list", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void PipUpgradePip_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("pip upgrade will be implemented here.",
                          "pip upgrade", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void InsertPythonDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{python}\n\n@{end python}\n");
        }

        private void InsertCSharpDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{csharp}\n\n@{end csharp}\n");
        }

        private void InsertCppDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{cpp}\n\n@{end cpp}\n");
        }

        private void InsertCDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{c}\n\n@{end c}\n");
        }

        private void InsertFortranDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{fortran}\n\n@{end fortran}\n");
        }

        private void InsertJuliaDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{julia}\n\n@{end julia}\n");
        }

        private void InsertRDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{r}\n\n@{end r}\n");
        }

        private void ConfigureOctavePath_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("Octave path configuration will be implemented here.",
                          "Configure Octave", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void OpenOctavePowerShell_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error opening PowerShell:\n{ex.Message}", "Error",
                              MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void InsertOctaveDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{octave}\n\n@{end octave}\n");
        }

        private void InsertOpenSeesDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{opensees}\n\n@{end opensees}\n");
        }

        private void InsertPowerShellDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{powershell}\n\n@{end powershell}\n");
        }

        private void InsertBashDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{bash}\n\n@{end bash}\n");
        }

        private void InsertCmdDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{cmd}\n\n@{end cmd}\n");
        }

        private void InsertXamlDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{xaml}\n\n@{end xaml}\n");
        }

        private void InsertWpfDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{wpf}\n\n@{end wpf}\n");
        }

        private void InsertAvaloniaDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{avalonia}\n\n@{end avalonia}\n");
        }

        private void InsertQtDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{qt}\n\n@{end qt}\n");
        }

        private void InsertGtkDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{gtk}\n\n@{end gtk}\n");
        }

        private void InsertHtmlDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{html}\n\n@{end html}\n");
        }

        private void InsertMarkdownDirective_Click(object sender, RoutedEventArgs e)
        {
            InsertTextAtCursor("@{markdown}\n\n@{end markdown}\n");
        }

        private void InsertTextAtCursor(string text)
        {
            try
            {
                // If in MathEditor mode, switch to Code mode first
                if (_currentEditorMode == EditorMode.Visual)
                {
                    SwitchToCodeEditorMode();
                }

                // ALWAYS prefer AvalonEdit (TextEditor) if it exists and is visible
                if (TextEditor != null && TextEditor.Visibility == Visibility.Visible && TextEditor.Document != null)
                {
                    // Insert into AvalonEdit
                    TextEditor.Focus();
                    int caretOffset = TextEditor.CaretOffset;

                    // Ensure caret is within valid range
                    if (caretOffset < 0) caretOffset = 0;
                    if (caretOffset > TextEditor.Document.TextLength) caretOffset = TextEditor.Document.TextLength;

                    TextEditor.Document.Insert(caretOffset, text);
                    // Move caret to end of inserted text
                    TextEditor.CaretOffset = caretOffset + text.Length;

                    // Sync to RichTextBox to keep them in sync
                    try { SyncContentToRichTextBox(); } catch { }
                    return;
                }

                // Fallback to RichTextBox only if AvalonEdit is not available
                if (RichTextBox.Visibility != Visibility.Visible)
                {
                    RichTextBox.Visibility = Visibility.Visible;
                }

                RichTextBox.Focus();

                // Use a safer method to insert text
                var selection = RichTextBox.Selection;
                if (selection != null && !selection.IsEmpty)
                {
                    // Replace selected text
                    selection.Text = text;
                }
                else
                {
                    // Insert at caret position using TextPointer
                    var caretPosition = RichTextBox.CaretPosition;
                    if (caretPosition != null)
                    {
                        var run = new Run(text);
                        caretPosition.Paragraph?.Inlines.Add(run);
                    }
                    else
                    {
                        // Append to document
                        var paragraph = new Paragraph(new Run(text));
                        _document.Blocks.Add(paragraph);
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"InsertTextAtCursor error: {ex.Message}");
                // Last resort: just set the text
                try
                {
                    if (_isAvalonEditActive && TextEditor != null)
                    {
                        TextEditor.Text += "\n" + text;
                    }
                }
                catch { }
            }
        }

        #endregion

        #region MathEditor Handlers

        private void ToggleModeButton_Click(object sender, RoutedEventArgs e)
        {
            // Toggle between Code and MathEditor
            if (_currentEditorMode == EditorMode.Code)
            {
                SwitchToMathEditorMode();
            }
            else
            {
                SwitchToCodeEditorMode();
            }
        }

        /// <summary>
        /// Toggle between RichTextBox and AvalonEdit code editors
        /// </summary>
        private void EditorToggleButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isSyncingEditors) return;

            try
            {
                _isSyncingEditors = true;

                // Hide autocomplete when switching editors
                AutoCompleteListBox.Visibility = Visibility.Hidden;
                _avalonEditAutoComplete.Hide();

                if (_isAvalonEditActive)
                {
                    // Switch from AvalonEdit to RichTextBox
                    SyncContentToRichTextBox();
                    TextEditor.Visibility = Visibility.Collapsed;
                    RichTextBox.Visibility = Visibility.Visible;
                    _isAvalonEditActive = false;
                    _findReplace.IsAvalonEditActive = false;
                    EditorToggleButton.ToolTip = "Switch to AvalonEdit (Advanced Editor)";
                    RichTextBox.Focus();
                }
                else
                {
                    // Switch from RichTextBox to AvalonEdit
                    SyncContentToAvalonEdit();
                    RichTextBox.Visibility = Visibility.Collapsed;
                    TextEditor.Visibility = Visibility.Visible;
                    _isAvalonEditActive = true;
                    _findReplace.IsAvalonEditActive = true;
                    EditorToggleButton.ToolTip = "Switch to RichTextBox (Classic Editor)";
                    TextEditor.Focus();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Error al alternar editores: {ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                _isSyncingEditors = false;
            }
        }

        /// <summary>
        /// Sync content from AvalonEdit to RichTextBox
        /// </summary>
        private void SyncContentToRichTextBox()
        {
            if (TextEditor != null && RichTextBox != null && !_isSyncingEditors)
            {
                try
                {
                    _isSyncingEditors = true;
                    string text = TextEditor.Text;
                    SetInputText(text);
                }
                finally
                {
                    _isSyncingEditors = false;
                }
            }
        }

        /// <summary>
        /// Sync content from RichTextBox to AvalonEdit (async to prevent UI freeze)
        /// </summary>
        private void SyncContentToAvalonEdit()
        {
            if (RichTextBox != null && TextEditor != null && !_isSyncingEditors)
            {
                _isSyncingEditors = true;
                // Read directly from RichTextBox, not InputText (which reads from active editor)
                string text = new TextRange(_document.ContentStart, _document.ContentEnd).Text;

                // Use async loading to prevent UI freeze on large files with external code
                Dispatcher.InvokeAsync(() =>
                {
                    try
                    {
                        TextEditor.Text = text;
                        UpdateFoldings();
                    }
                    finally
                    {
                        _isSyncingEditors = false;
                    }
                }, System.Windows.Threading.DispatcherPriority.Background);
            }
        }

        private void SwitchToMathEditorMode()
        {
            try
            {
                _isSyncingBetweenModes = true;

                // 1. Get current code from active editor
                string currentCode = InputText;

                // 2. Load into MathEditor
                MathEditorControl.FromHekatan(currentCode);

                // 3. Change visibility - hide the active editor
                if (_isAvalonEditActive && TextEditor != null)
                {
                    TextEditor.Visibility = Visibility.Collapsed;
                }
                else
                {
                    RichTextBox.Visibility = Visibility.Collapsed;
                }
                MathEditorControl.Visibility = Visibility.Visible;
                LineNumbers.Visibility = Visibility.Collapsed;

                // 4. Update state
                _currentEditorMode = EditorMode.Visual;
                ToggleModeButton.Content = "Code";
                ToggleModeButton.Background = new SolidColorBrush(
                    Color.FromRgb(0x22, 0xc5, 0x5e));

                // 5. Give focus to MathEditor
                MathEditorControl.Focus();

                _isSyncingBetweenModes = false;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Error al cambiar a Editor Visual: {ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                _isSyncingBetweenModes = false;
            }
        }

        private void SwitchToCodeEditorMode()
        {
            try
            {
                _isSyncingBetweenModes = true;

                // 1. Get code from MathEditor
                string mathCode = MathEditorControl.ToHekatan();

                // 2. Update the active editor (AvalonEdit or RichTextBox)
                _isTextChangedEnabled = false;
                if (_isAvalonEditActive && TextEditor != null)
                {
                    TextEditor.Text = mathCode;
                }
                else
                {
                    SetInputText(mathCode);
                }
                _isTextChangedEnabled = true;

                // 3. Change visibility - show the active editor
                MathEditorControl.Visibility = Visibility.Collapsed;
                if (_isAvalonEditActive && TextEditor != null)
                {
                    TextEditor.Visibility = Visibility.Visible;
                }
                else
                {
                    RichTextBox.Visibility = Visibility.Visible;
                }
                LineNumbers.Visibility = Visibility.Visible;

                // 4. Update state
                _currentEditorMode = EditorMode.Code;
                ToggleModeButton.Content = "mathCAD";
                ToggleModeButton.Background = new SolidColorBrush(
                    Color.FromRgb(0x66, 0x7e, 0xea));

                // 5. Give focus to active editor
                if (_isAvalonEditActive && TextEditor != null)
                {
                    TextEditor.Focus();
                }
                else
                {
                    RichTextBox.Focus();
                }

                _isSyncingBetweenModes = false;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Error al cambiar a Editor Código: {ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                _isSyncingBetweenModes = false;
            }
        }

        private void SetInputText(string text)
        {
            var textRange = new System.Windows.Documents.TextRange(
                _document.ContentStart,
                _document.ContentEnd
            );
            textRange.Text = text;
            HighLightAll();
        }

        private void MathEditorControl_ContentChanged(object sender, EventArgs e)
        {
            if (_isSyncingBetweenModes) return;

            try
            {
                _isSyncingBetweenModes = true;

                // 1. Get code from MathEditor
                string mathCode = MathEditorControl.ToHekatan();

                // 2. Update the active editor (AvalonEdit or RichTextBox)
                _isTextChangedEnabled = false;
                if (_isAvalonEditActive && TextEditor != null)
                {
                    TextEditor.Text = mathCode;
                }
                else
                {
                    SetInputText(mathCode);
                }
                _isTextChangedEnabled = true;

                // 3. Execute calculation if AutoRun is active
                if (AutoRunCheckBox.IsChecked == true)
                {
                    Dispatcher.InvokeAsync(
                        () => CalculateAsync(false),
                        DispatcherPriority.ApplicationIdle);
                }

                Dispatcher.InvokeAsync(
                    () => { _isSyncingBetweenModes = false; },
                    DispatcherPriority.Background);
            }
            catch
            {
                _isSyncingBetweenModes = false;
            }
        }

        private void OpenMathEditor_Click(object sender, RoutedEventArgs e)
        {
            // Switch to MathEditor mode directly
            if (_currentEditorMode == EditorMode.Code)
            {
                SwitchToMathEditorMode();
            }
        }

        /// <summary>
        /// Handler para cuando el usuario hace doble-click en un bloque externo en MathEditor
        /// Cambia automáticamente al modo Code para editar el bloque
        /// </summary>
        private void MathEditor_SwitchToCodeModeRequested(object sender, int lineIndex)
        {
            if (_currentEditorMode != EditorMode.Code)
            {
                // Cambiar a modo Code
                SwitchToCodeEditorMode();

                // Posicionar cursor en la línea del bloque externo
                Dispatcher.InvokeAsync(() =>
                {
                    if (_isAvalonEditActive && TextEditor != null)
                    {
                        // Posicionar en la línea especificada (lineIndex es 0-based)
                        var line = TextEditor.Document.GetLineByNumber(Math.Min(lineIndex + 1, TextEditor.Document.LineCount));
                        TextEditor.TextArea.Caret.Line = line.LineNumber;
                        TextEditor.TextArea.Caret.Column = 1;
                        TextEditor.ScrollTo(line.LineNumber, 1);
                        TextEditor.Focus();
                    }
                }, DispatcherPriority.Background);
            }
        }

        private void OpenMathEditorTest_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var testWindow = new MathEditor.MathEditorTestWindow();
                testWindow.Owner = this;
                testWindow.Show();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error opening Math Editor Test Window:\n{ex.Message}",
                              "Error",
                              MessageBoxButton.OK,
                              MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Abre el editor visual de MathCad Prime con rejilla
        /// </summary>
        private void OpenMathcadPrimeEditor_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                MathcadPrimeEditor.MathcadPrimeEditorWindow editorWindow = null;
                string action = null;

                // Check if clicked from context menu
                if (sender is MenuItem menuItem && menuItem.Tag != null)
                {
                    action = menuItem.Tag.ToString();
                }
                else if (sender is Button btn && btn.ContextMenu != null)
                {
                    // Show context menu
                    btn.ContextMenu.PlacementTarget = btn;
                    btn.ContextMenu.IsOpen = true;
                    return;
                }

                // Handle action
                if (action == "new")
                {
                    // Crear nuevo documento
                    editorWindow = new MathcadPrimeEditor.MathcadPrimeEditorWindow();
                }
                else if (action == "open")
                {
                    // Abrir archivo existente
                    var dlg = new Microsoft.Win32.OpenFileDialog
                    {
                        Filter = "MathCad Prime (*.mcdx)|*.mcdx|Todos los archivos (*.*)|*.*",
                        Title = "Abrir archivo MathCad Prime"
                    };

                    if (dlg.ShowDialog() == true)
                    {
                        editorWindow = new MathcadPrimeEditor.MathcadPrimeEditorWindow(dlg.FileName);
                    }
                }
                else
                {
                    // Fallback: show dialog
                    var result = MessageBox.Show(
                        "¿Desea abrir un archivo .mcdx existente?\n\n" +
                        "Sí = Abrir archivo\n" +
                        "No = Crear nuevo documento",
                        "MathCad Prime Editor",
                        MessageBoxButton.YesNoCancel,
                        MessageBoxImage.Question);

                    if (result == MessageBoxResult.Yes)
                    {
                        var dlg = new Microsoft.Win32.OpenFileDialog
                        {
                            Filter = "MathCad Prime (*.mcdx)|*.mcdx|Todos los archivos (*.*)|*.*",
                            Title = "Abrir archivo MathCad Prime"
                        };

                        if (dlg.ShowDialog() == true)
                        {
                            editorWindow = new MathcadPrimeEditor.MathcadPrimeEditorWindow(dlg.FileName);
                        }
                    }
                    else if (result == MessageBoxResult.No)
                    {
                        editorWindow = new MathcadPrimeEditor.MathcadPrimeEditorWindow();
                    }
                }

                if (editorWindow != null)
                {
                    editorWindow.Owner = this;
                    editorWindow.Show();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al abrir MathCad Prime Editor:\n{ex.Message}",
                              "Error",
                              MessageBoxButton.OK,
                              MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Word button click - opens context menu
        /// </summary>
        private void WordBtn_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.ContextMenu != null)
            {
                btn.ContextMenu.PlacementTarget = btn;
                btn.ContextMenu.IsOpen = true;
            }
        }

        /// <summary>
        /// Open MiniWord viewer window
        /// </summary>
        private void OpenMiniWord_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                DefaultExt = ".docx",
                Filter = "Word Documents (*.docx)|*.docx|All Files (*.*)|*.*",
                Title = "Abrir documento Word en MiniWord",
                CheckFileExists = true,
                Multiselect = false
            };

            if (dlg.ShowDialog() == true)
            {
                try
                {
                    var window = new MiniWord.MiniWordWindow(dlg.FileName);
                    window.Owner = this;
                    window.ImportToHekatan += MiniWord_ImportToHekatan;
                    window.Show();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        $"Error abriendo documento:\n\n{ex.Message}",
                        "Error",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                }
            }
        }

        /// <summary>
        /// Handle import from MiniWord to Hekatan
        /// </summary>
        private void MiniWord_ImportToHekatan(object sender, MiniWord.ImportToHekatanEventArgs e)
        {
            if (string.IsNullOrEmpty(e.Content)) return;

            // Convert text content to Hekatan syntax (comments)
            var lines = e.Content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
            var calcpadContent = string.Join(Environment.NewLine, lines.Select(l => "'" + l)) + Environment.NewLine;

            // Insert at cursor position using existing helper
            InsertTextAtCursor(calcpadContent);

            MessageBox.Show(
                "Contenido importado como comentarios.\n\nPuedes editar las lineas para convertirlas en expresiones Hekatan.",
                "Importado desde MiniWord",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
        }

        /// <summary>
        /// Open MiniExcel viewer window
        /// </summary>
        private void OpenMiniExcel_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                DefaultExt = ".xlsx",
                Filter = "Excel Files (*.xlsx)|*.xlsx|All Files (*.*)|*.*",
                Title = "Abrir archivo Excel en MiniExcel",
                CheckFileExists = true,
                Multiselect = false
            };

            if (dlg.ShowDialog() == true)
            {
                try
                {
                    var window = new MiniExcel.MiniExcelWindow(dlg.FileName);
                    window.Owner = this;
                    window.ImportToHekatan += MiniExcel_ImportToHekatan;
                    window.Show();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        $"Error abriendo archivo:\n\n{ex.Message}",
                        "Error",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                }
            }
        }

        /// <summary>
        /// Handle import from MiniExcel to Hekatan
        /// </summary>
        private void MiniExcel_ImportToHekatan(object sender, MiniExcel.ExcelImportEventArgs e)
        {
            if (string.IsNullOrEmpty(e.Content)) return;

            // Add comment header
            var header = $"' Importado desde Excel: {Path.GetFileName(e.SourceFile ?? "")}" +
                        (string.IsNullOrEmpty(e.SheetName) ? "" : $" - Hoja: {e.SheetName}");
            var content = header + Environment.NewLine + e.Content + Environment.NewLine;

            // Insert at cursor position using existing helper
            InsertTextAtCursor(content);

            var formatInfo = e.Format switch
            {
                MiniExcel.ImportFormat.Matrix => "matriz",
                MiniExcel.ImportFormat.Vector => "vector",
                _ => "valores"
            };

            MessageBox.Show(
                $"Datos importados como {formatInfo}.",
                "Importado desde MiniExcel",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
        }

        #endregion

        #region Jupyter Integration

        private JupyterIntegration _jupyterIntegration;

        #endregion

        #region IFC Integration

        private string _currentIfcHtmlPath;
        private string _currentIfcHtmlName;
        private bool _wasAutoRunEnabled;
        private bool _isIfcEditMode => !string.IsNullOrEmpty(_currentIfcHtmlPath);

        /// <summary>
        /// Inicializa la integración de Jupyter
        /// </summary>
        private void InitializeJupyterIntegration()
        {
            try
            {
                _jupyterIntegration = new JupyterIntegration(WebViewer);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al inicializar Jupyter:\n{ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Handler: Abrir Jupyter Notebook
        /// </summary>
        private async void MenuJupyterOpen_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dialog = new OpenFileDialog
                {
                    Filter = "Jupyter Notebooks (*.ipynb)|*.ipynb|All files (*.*)|*.*",
                    Title = "Open Jupyter Notebook"
                };

                if (dialog.ShowDialog() == true)
                {
                    if (_jupyterIntegration == null)
                        InitializeJupyterIntegration();

                    await _jupyterIntegration.OpenNotebook(dialog.FileName);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al abrir notebook:\n{ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Handler: Iniciar servidor Jupyter
        /// </summary>
        private async void MenuJupyterStart_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (_jupyterIntegration == null)
                    InitializeJupyterIntegration();

                await _jupyterIntegration.StartJupyterServer();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al iniciar servidor:\n{ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Handler: Actualizar editor desde el visor IFC
        /// Ejecuta JavaScript en WebView2 para obtener el HTML actualizado y lo pone en AvalonEdit
        /// </summary>
        private async void UpdateIfcEditorButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (WebViewer?.CoreWebView2 == null)
                {
                    MessageBox.Show("El visor IFC no está activo. Primero abre un archivo IFC.",
                        "Visor IFC no activo", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                // Ejecutar JavaScript para capturar el estado y enviar el HTML actualizado
                string jsCode = @"
                    (function() {
                        // Actualizar valores de sliders de transparencia
                        document.querySelectorAll('.trans-slider').forEach(function(slider) {
                            slider.setAttribute('value', slider.value);
                        });

                        // Actualizar estado de checkboxes de filtros
                        document.querySelectorAll('.filter-cb').forEach(function(cb) {
                            if (cb.checked) {
                                cb.setAttribute('checked', 'checked');
                            } else {
                                cb.removeAttribute('checked');
                            }
                        });

                        // Guardar posición de cámara si existe
                        var viewerContainer = document.querySelector('.ifc-viewer-container');
                        if (viewerContainer && typeof camera !== 'undefined' && camera) {
                            viewerContainer.setAttribute('data-camera-x', camera.position.x.toFixed(2));
                            viewerContainer.setAttribute('data-camera-y', camera.position.y.toFixed(2));
                            viewerContainer.setAttribute('data-camera-z', camera.position.z.toFixed(2));
                            if (typeof controls !== 'undefined' && controls) {
                                viewerContainer.setAttribute('data-target-x', controls.target.x.toFixed(2));
                                viewerContainer.setAttribute('data-target-y', controls.target.y.toFixed(2));
                                viewerContainer.setAttribute('data-target-z', controls.target.z.toFixed(2));
                            }
                        }

                        // Guardar nivel actual si existe
                        if (typeof levelDisplay !== 'undefined' && levelDisplay && typeof nivelActual !== 'undefined') {
                            levelDisplay.setAttribute('data-nivel-actual', nivelActual);
                        }

                        // Retornar HTML completo
                        return document.documentElement.outerHTML;
                    })();
                ";

                var result = await WebViewer.CoreWebView2.ExecuteScriptAsync(jsCode);

                // El resultado viene como string JSON escapado
                if (!string.IsNullOrEmpty(result) && result != "null")
                {
                    // Deserializar el string JSON
                    string htmlContent = System.Text.Json.JsonSerializer.Deserialize<string>(result);

                    if (!string.IsNullOrEmpty(htmlContent))
                    {
                        // Agregar DOCTYPE si no está presente
                        if (!htmlContent.TrimStart().StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase))
                        {
                            htmlContent = "<!DOCTYPE html>\n" + htmlContent;
                        }

                        // Envolver en @{code}...@{end code} para que Hekatan no intente parsear el HTML como fórmulas
                        string wrappedContent = $"@{{code}}\r\n@{{html-ifc}}\r\n{htmlContent}\r\n@{{end html-ifc}}\r\n@{{end code}}";

                        // Actualizar el editor
                        if (_isAvalonEditActive && TextEditor != null)
                        {
                            TextEditor.Text = wrappedContent;
                        }
                        else
                        {
                            SetInputText(wrappedContent);
                        }

                        IsSaved = false;
                        System.Diagnostics.Debug.WriteLine($"[UpdateIfcEditorButton_Click] Editor actualizado con {wrappedContent.Length} caracteres");
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[UpdateIfcEditorButton_Click] Error: {ex.Message}");
                MessageBox.Show($"Error actualizando editor: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Handler: Abrir archivo IFC en visor 3D
        /// Genera el HTML completo del visor IFC en el editor para poder editarlo
        /// El visor se muestra en el output y el código HTML queda disponible para modificar
        /// </summary>
        private async void IfcButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dialog = new Microsoft.Win32.OpenFileDialog
                {
                    Filter = "IFC Files (*.ifc)|*.ifc|All files (*.*)|*.*",
                    Title = "Abrir archivo IFC"
                };

                if (dialog.ShowDialog() == true)
                {
                    string ifcFilePath = dialog.FileName;
                    string fileName = System.IO.Path.GetFileName(ifcFilePath);
                    long fileSizeMB = new System.IO.FileInfo(ifcFilePath).Length / (1024 * 1024);

                    // Preguntar al usuario qué modo desea
                    var result = MessageBox.Show(
                        $"Archivo: {fileName} ({fileSizeMB} MB)\n\n" +
                        "¿Qué modo de carga desea usar?\n\n" +
                        "SÍ = EMBEBIDO (IFC dentro del HTML, sin copiar archivos)\n" +
                        "NO = REFERENCIA (copia IFC a resources/ifc)",
                        "Modo de carga IFC",
                        MessageBoxButton.YesNoCancel,
                        MessageBoxImage.Question);

                    if (result == MessageBoxResult.Cancel) return;
                    bool useEmbeddedMode = (result == MessageBoxResult.Yes);

                    string wrappedCode;

                    if (useEmbeddedMode)
                    {
                        // NUEVO: Modo embebido - IFC como Base64 dentro del HTML
                        // No necesita copiar archivos, funciona desde cualquier ubicación
                        string viewerHtml = Hekatan.Common.MultLangCode.IfcLanguageHandler.GenerateEmbeddedViewer(ifcFilePath, fileName);
                        wrappedCode = $"@{{code}}\r\n@{{html-ifc}}\r\n{viewerHtml}\r\n@{{end code}}";
                    }
                    else
                    {
                        // Modo tradicional: copiar archivo a resources/ifc
                        string ifcResourcePath = System.IO.Path.Combine(AppInfo.Path, "resources", "ifc");
                        if (!System.IO.Directory.Exists(ifcResourcePath))
                        {
                            System.IO.Directory.CreateDirectory(ifcResourcePath);
                        }
                        string tempIfcName = $"temp_{Guid.NewGuid():N}.ifc";
                        string destIfcPath = System.IO.Path.Combine(ifcResourcePath, tempIfcName);
                        System.IO.File.Copy(ifcFilePath, destIfcPath, true);

                        string viewerHtml = Hekatan.Common.MultLangCode.IfcLanguageHandler.GenerateSimpleViewer(tempIfcName, fileName);
                        wrappedCode = $"@{{code}}\r\n@{{html-ifc}}\r\n{viewerHtml}\r\n@{{end code}}";
                    }

                    // Mostrar el código HTML en AvalonEdit para edición
                    if (_isAvalonEditActive && TextEditor != null)
                    {
                        TextEditor.Text = wrappedCode;
                    }
                    else
                    {
                        _document.Blocks.Clear();
                        _document.Blocks.Add(new Paragraph(new Run(wrappedCode)));
                    }

                    // El autorun procesará @{html-ifc} que usa Virtual Host para el visor
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al abrir archivo IFC:\n{ex.Message}\n\nStack: {ex.StackTrace}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Recarga el visor IFC con el HTML editado en el editor
        /// Se llama cuando presionas F5 mientras editas HTML de IFC
        /// </summary>
        private async Task ReloadIfcViewer()
        {
            try
            {
                if (string.IsNullOrEmpty(_currentIfcHtmlPath))
                {
                    MessageBox.Show("No hay visor IFC activo para recargar.",
                        "Info", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                // Guardar el HTML editado directamente (ya es HTML puro, sin wrapper)
                string editedHtml = InputText;
                System.IO.File.WriteAllText(_currentIfcHtmlPath, editedHtml);

                // Recargar en WebView2
                if (WebViewer.CoreWebView2 == null)
                {
                    await InitializeWebViewer();
                }

                // Navegar de nuevo para forzar recarga
                WebViewer.CoreWebView2.Navigate($"https://calcpad.ifc/{_currentIfcHtmlName}");

                // Mostrar mensaje de confirmación en la barra de estado si existe
                Title = $" Hekatan - IFC Viewer recargado";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al recargar visor IFC:\n{ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Limpia la referencia al visor IFC actual (para volver al modo normal)
        /// Restaura AutoRun si estaba habilitado antes
        /// </summary>
        private void ClearIfcViewerState()
        {
            if (_isIfcEditMode && _wasAutoRunEnabled)
            {
                AutoRunCheckBox.IsChecked = true;
            }
            _currentIfcHtmlPath = null;
            _currentIfcHtmlName = null;
            _wasAutoRunEnabled = false;
        }

        /// <summary>
        /// Handler: Detener servidor Jupyter
        /// </summary>
        private void MenuJupyterStop_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (_jupyterIntegration == null)
                {
                    MessageBox.Show("El servidor no está en ejecución.", "Info",
                        MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                _jupyterIntegration.StopJupyterServer();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al detener servidor:\n{ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Handler: Mostrar estado de Jupyter
        /// </summary>
        private async void MenuJupyterStatus_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (_jupyterIntegration == null)
                    InitializeJupyterIntegration();

                await _jupyterIntegration.ShowStatus();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al obtener estado:\n{ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Limpieza de Jupyter al cerrar ventana
        /// </summary>
        private void CleanupJupyterOnExit()
        {
            try
            {
                _jupyterIntegration?.Dispose();
            }
            catch { }
        }

        #endregion

        #region Theme Management

        /// <summary>
        /// Applies Hekatan Dark theme (Egyptian Gold on dark background)
        /// </summary>
        private void MenuThemeHekatanDark_Click(object sender, RoutedEventArgs e)
        {
            ApplyTheme(Themes.ThemeManager.Theme.HekatanDark);
        }

        /// <summary>
        /// Applies Hekatan Light theme (Gold accents on light background)
        /// </summary>
        private void MenuThemeHekatanLight_Click(object sender, RoutedEventArgs e)
        {
            ApplyTheme(Themes.ThemeManager.Theme.HekatanLight);
        }

        /// <summary>
        /// Applies Classic theme (Original Hekatan style)
        /// </summary>
        private void MenuThemeClassic_Click(object sender, RoutedEventArgs e)
        {
            ApplyTheme(Themes.ThemeManager.Theme.Classic);
        }

        /// <summary>
        /// Cycles through available themes
        /// </summary>
        private void MenuCycleTheme_Click(object sender, RoutedEventArgs e)
        {
            Themes.ThemeManager.CycleTheme();
            UpdateThemeMenuCheckmarks();
        }

        /// <summary>
        /// Applies the specified theme and updates UI
        /// </summary>
        private void ApplyTheme(Themes.ThemeManager.Theme theme)
        {
            // Ensure window is registered
            Themes.ThemeManager.RegisterWindow(this);
            Themes.ThemeManager.ApplyTheme(theme);
            Themes.ThemeManager.SaveThemePreference();
            UpdateThemeMenuCheckmarks();
        }

        /// <summary>
        /// Updates theme menu checkmarks to reflect current theme
        /// </summary>
        private void UpdateThemeMenuCheckmarks()
        {
            var currentTheme = Themes.ThemeManager.CurrentTheme;
            MenuThemeHekatanDark.IsChecked = currentTheme == Themes.ThemeManager.Theme.HekatanDark;
            MenuThemeHekatanLight.IsChecked = currentTheme == Themes.ThemeManager.Theme.HekatanLight;
            MenuThemeClassic.IsChecked = currentTheme == Themes.ThemeManager.Theme.Classic;
        }

        /// <summary>
        /// Initializes theme from saved settings
        /// </summary>
        private void InitializeTheme()
        {
            // Register this window with the theme manager
            Themes.ThemeManager.RegisterWindow(this);
            Themes.ThemeManager.Initialize();
            UpdateThemeMenuCheckmarks();
        }

        /// <summary>
        /// Opens a color picker dialog to choose the title/header color
        /// </summary>
        private void MenuChooseTitleColor_Click(object sender, RoutedEventArgs e)
        {
            var colorDialog = new System.Windows.Forms.ColorDialog
            {
                AllowFullOpen = true,
                AnyColor = true,
                FullOpen = true,
                Color = System.Drawing.Color.FromArgb(
                    Themes.ThemeManager.GetCurrentPrimaryColor().R,
                    Themes.ThemeManager.GetCurrentPrimaryColor().G,
                    Themes.ThemeManager.GetCurrentPrimaryColor().B)
            };

            // Add some gold/warm presets
            colorDialog.CustomColors = new int[]
            {
                ColorToInt(196, 160, 53),   // #C4A035 - Warm gold
                ColorToInt(212, 175, 55),   // #D4AF37 - Classic gold
                ColorToInt(255, 215, 0),    // #FFD700 - Bright gold
                ColorToInt(184, 150, 12),   // #B8960C - Dark gold
                ColorToInt(244, 208, 63),   // #F4D03F - Light gold
                ColorToInt(218, 165, 32),   // #DAA520 - Goldenrod
                ColorToInt(255, 193, 37),   // #FFC125 - Yellow gold
                ColorToInt(205, 133, 63),   // #CD853F - Peru/bronze
                ColorToInt(0, 255, 170),    // #00FFAA - Green accent
                ColorToInt(0, 212, 170),    // #00D4AA - Teal
                ColorToInt(70, 130, 180),   // #4682B4 - Steel blue
                ColorToInt(100, 149, 237),  // #6495ED - Cornflower blue
                ColorToInt(255, 99, 71),    // #FF6347 - Tomato red
                ColorToInt(60, 179, 113),   // #3CB371 - Medium sea green
                ColorToInt(147, 112, 219),  // #9370DB - Medium purple
                ColorToInt(255, 140, 0),    // #FF8C00 - Dark orange
            };

            if (colorDialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                var selectedColor = System.Windows.Media.Color.FromRgb(
                    colorDialog.Color.R,
                    colorDialog.Color.G,
                    colorDialog.Color.B);

                Themes.ThemeManager.SetCustomPrimaryColor(selectedColor);
                Themes.ThemeManager.ApplyTheme(Themes.ThemeManager.CurrentTheme);
                Themes.ThemeManager.SaveThemePreference();
            }
        }

        /// <summary>
        /// Converts RGB to int for ColorDialog.CustomColors
        /// </summary>
        private static int ColorToInt(byte r, byte g, byte b)
        {
            return r | (g << 8) | (b << 16);
        }

        #endregion
    }
}