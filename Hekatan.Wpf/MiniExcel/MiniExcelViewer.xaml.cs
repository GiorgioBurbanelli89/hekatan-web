using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using Hekatan.OpenXml;

namespace Hekatan.Wpf.MiniExcel
{
    /// <summary>
    /// Visor de hojas de calculo Excel (.xlsx) integrado en Hekatan
    /// </summary>
    public partial class MiniExcelViewer : UserControl
    {
        private string _currentFilePath;
        private double _zoomLevel = 100;
        private XlsxReader _xlsxReader;
        private bool _webViewInitialized;
        private int _currentSheetIndex;
        private List<RadioButton> _sheetTabs = new List<RadioButton>();

        /// <summary>
        /// Evento que se dispara cuando el usuario quiere importar contenido a Hekatan
        /// </summary>
        public event EventHandler<ExcelImportEventArgs> ImportToHekatan;

        /// <summary>
        /// Ruta del archivo actual
        /// </summary>
        public string CurrentFilePath => _currentFilePath;

        public MiniExcelViewer()
        {
            InitializeComponent();
            InitializeWebView();

            // Permitir drag and drop
            AllowDrop = true;
            Drop += MiniExcelViewer_Drop;
            DragOver += MiniExcelViewer_DragOver;
        }

        private async void InitializeWebView()
        {
            try
            {
                await SpreadsheetWebView.EnsureCoreWebView2Async();
                _webViewInitialized = true;

                // Configurar WebView2
                SpreadsheetWebView.CoreWebView2.Settings.IsScriptEnabled = true;
                SpreadsheetWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                SpreadsheetWebView.CoreWebView2.Settings.IsZoomControlEnabled = true;

                // Escuchar mensajes del JavaScript
                SpreadsheetWebView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
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
                if (message.StartsWith("cell-selected:"))
                {
                    var cellRef = message.Substring("cell-selected:".Length);
                    CellReferenceText.Text = cellRef;
                }
                else if (message.StartsWith("selection-stats:"))
                {
                    var stats = message.Substring("selection-stats:".Length);
                    UpdateSelectionStats(stats);
                }
                else if (message.StartsWith("cell-value:"))
                {
                    var value = message.Substring("cell-value:".Length);
                    FormulaTextBox.Text = value;
                }
            }
            catch { }
        }

        private void UpdateSelectionStats(string stats)
        {
            try
            {
                var parts = stats.Split('|');
                if (parts.Length >= 2)
                {
                    SelectionInfoText.Text = parts[0]; // e.g., "5 celdas"
                    SumText.Text = parts[1]; // e.g., "Suma: 123.45"
                }
            }
            catch
            {
                SelectionInfoText.Text = "";
                SumText.Text = "";
            }
        }

        #region File Operations

        private void OpenButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog
            {
                Filter = "Archivos Excel (*.xlsx)|*.xlsx|Todos los archivos (*.*)|*.*",
                Title = "Abrir hoja de calculo Excel"
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
                StatusText.Text = "Cargando hoja de calculo...";
                _xlsxReader = new XlsxReader();
                var html = _xlsxReader.ReadToHtml(filePath, 0);

                // Agregar script de interactividad
                html = AddInteractiveScript(html);

                // Mostrar en WebView2
                if (_webViewInitialized)
                {
                    SpreadsheetWebView.NavigateToString(html);
                }

                _currentFilePath = filePath;
                _currentSheetIndex = 0;

                // Actualizar UI
                PlaceholderPanel.Visibility = Visibility.Collapsed;
                SpreadsheetWebView.Visibility = Visibility.Visible;
                SaveButton.IsEnabled = true;
                SaveAsButton.IsEnabled = true;
                ImportButton.IsEnabled = true;
                ImportAsMatrixButton.IsEnabled = true;
                ImportAsVectorButton.IsEnabled = true;
                FormulaTextBox.IsEnabled = true;

                // Crear tabs de hojas
                CreateSheetTabs();

                // Mostrar info en barra de estado
                ExcelVersionText.Text = _xlsxReader.ExcelVersion;
                SheetCountText.Text = $"{_xlsxReader.Sheets.Count} hoja(s)";
                StatusText.Text = $"Archivo cargado: {Path.GetFileName(filePath)}";

                // Mostrar advertencias si las hay
                if (_xlsxReader.Warnings.Count > 0)
                {
                    StatusText.Text += $" ({_xlsxReader.Warnings.Count} advertencias)";
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error abriendo archivo: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                StatusText.Text = "Error cargando archivo";
            }
        }

        private string AddInteractiveScript(string html)
        {
            var script = @"
<script>
    var selectedCells = [];
    var lastClickedCell = null;

    document.addEventListener('DOMContentLoaded', function() {
        var cells = document.querySelectorAll('td[data-cell]');
        cells.forEach(function(cell) {
            cell.addEventListener('click', function(e) {
                handleCellClick(cell, e);
            });
        });
    });

    function handleCellClick(cell, e) {
        var cellRef = cell.getAttribute('data-cell');

        if (e.ctrlKey) {
            // Multi-select con Ctrl
            toggleCellSelection(cell);
        } else if (e.shiftKey && lastClickedCell) {
            // Range select con Shift
            selectRange(lastClickedCell, cell);
        } else {
            // Single select
            clearSelection();
            selectCell(cell);
        }

        lastClickedCell = cell;

        // Notificar a WPF
        window.chrome.webview.postMessage('cell-selected:' + cellRef);
        window.chrome.webview.postMessage('cell-value:' + (cell.title || cell.textContent));

        // Calcular estadisticas
        calculateSelectionStats();
    }

    function selectCell(cell) {
        cell.classList.add('selected');
        selectedCells.push(cell);
    }

    function toggleCellSelection(cell) {
        if (cell.classList.contains('selected')) {
            cell.classList.remove('selected');
            selectedCells = selectedCells.filter(c => c !== cell);
        } else {
            selectCell(cell);
        }
    }

    function clearSelection() {
        selectedCells.forEach(function(cell) {
            cell.classList.remove('selected');
        });
        selectedCells = [];
    }

    function selectRange(startCell, endCell) {
        clearSelection();

        var startRef = startCell.getAttribute('data-cell');
        var endRef = endCell.getAttribute('data-cell');

        var startCol = getColFromRef(startRef);
        var startRow = getRowFromRef(startRef);
        var endCol = getColFromRef(endRef);
        var endRow = getRowFromRef(endRef);

        var minCol = Math.min(startCol, endCol);
        var maxCol = Math.max(startCol, endCol);
        var minRow = Math.min(startRow, endRow);
        var maxRow = Math.max(startRow, endRow);

        for (var r = minRow; r <= maxRow; r++) {
            for (var c = minCol; c <= maxCol; c++) {
                var ref = getColLetter(c) + r;
                var cell = document.querySelector('td[data-cell=""' + ref + '""]');
                if (cell) selectCell(cell);
            }
        }
    }

    function getColFromRef(ref) {
        var col = 0;
        for (var i = 0; i < ref.length; i++) {
            var c = ref.charCodeAt(i);
            if (c >= 65 && c <= 90) {
                col = col * 26 + (c - 64);
            } else break;
        }
        return col;
    }

    function getRowFromRef(ref) {
        var match = ref.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
    }

    function getColLetter(num) {
        var result = '';
        while (num > 0) {
            var mod = (num - 1) % 26;
            result = String.fromCharCode(65 + mod) + result;
            num = Math.floor((num - mod - 1) / 26);
        }
        return result;
    }

    function calculateSelectionStats() {
        var count = selectedCells.length;
        var sum = 0;
        var numericCount = 0;

        selectedCells.forEach(function(cell) {
            var val = parseFloat(cell.textContent.replace(/[^0-9.-]/g, ''));
            if (!isNaN(val)) {
                sum += val;
                numericCount++;
            }
        });

        var statsText = count + ' celda(s)';
        var sumText = numericCount > 0 ? 'Suma: ' + sum.toFixed(2) : '';

        window.chrome.webview.postMessage('selection-stats:' + statsText + '|' + sumText);
    }

    function getSelectedData() {
        if (selectedCells.length === 0) return '';

        // Ordenar celdas por fila y columna
        selectedCells.sort(function(a, b) {
            var refA = a.getAttribute('data-cell');
            var refB = b.getAttribute('data-cell');
            var rowA = getRowFromRef(refA);
            var rowB = getRowFromRef(refB);
            if (rowA !== rowB) return rowA - rowB;
            return getColFromRef(refA) - getColFromRef(refB);
        });

        var data = [];
        var currentRow = -1;
        var rowData = [];

        selectedCells.forEach(function(cell) {
            var ref = cell.getAttribute('data-cell');
            var row = getRowFromRef(ref);

            if (currentRow !== row) {
                if (rowData.length > 0) data.push(rowData);
                rowData = [];
                currentRow = row;
            }

            rowData.push(cell.textContent.trim());
        });

        if (rowData.length > 0) data.push(rowData);

        return JSON.stringify(data);
    }
</script>
<style>
    td.selected {
        background-color: #cce5ff !important;
        outline: 2px solid #0078d4;
    }
    td:hover {
        background-color: #f0f0f0;
    }
</style>
";
            // Insertar antes de </body>
            return html.Replace("</body>", script + "</body>");
        }

        private void CreateSheetTabs()
        {
            SheetTabsContainer.Children.Clear();
            _sheetTabs.Clear();

            if (_xlsxReader.Sheets.Count <= 1)
            {
                SheetTabsPanel.Visibility = Visibility.Collapsed;
                return;
            }

            SheetTabsPanel.Visibility = Visibility.Visible;

            foreach (var sheet in _xlsxReader.Sheets)
            {
                var tab = new RadioButton
                {
                    Content = sheet.Name,
                    GroupName = "SheetTabs",
                    Style = (Style)FindResource(typeof(RadioButton)),
                    Padding = new Thickness(10, 5, 10, 5),
                    Margin = new Thickness(0, 0, 2, 0),
                    Tag = sheet.Index,
                    IsChecked = sheet.Index == _currentSheetIndex
                };

                tab.Checked += SheetTab_Checked;
                SheetTabsContainer.Children.Add(tab);
                _sheetTabs.Add(tab);
            }
        }

        private void SheetTab_Checked(object sender, RoutedEventArgs e)
        {
            var tab = sender as RadioButton;
            if (tab?.Tag is int index && index != _currentSheetIndex)
            {
                LoadSheet(index);
            }
        }

        private void LoadSheet(int index)
        {
            if (_xlsxReader == null || index < 0 || index >= _xlsxReader.Sheets.Count)
                return;

            try
            {
                StatusText.Text = $"Cargando hoja {_xlsxReader.Sheets[index].Name}...";
                var html = _xlsxReader.ReadToHtml(_currentFilePath, index);
                html = AddInteractiveScript(html);

                if (_webViewInitialized)
                {
                    SpreadsheetWebView.NavigateToString(html);
                }

                _currentSheetIndex = index;
                StatusText.Text = $"Hoja: {_xlsxReader.Sheets[index].Name}";
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Error: {ex.Message}";
            }
        }

        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            SaveAsButton_Click(sender, e);
        }

        private void SaveAsButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new SaveFileDialog
            {
                Filter = "HTML (*.html)|*.html|CSV (*.csv)|*.csv",
                Title = "Guardar como",
                FileName = Path.GetFileNameWithoutExtension(_currentFilePath ?? "hoja")
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
                    var html = await SpreadsheetWebView.ExecuteScriptAsync("document.documentElement.outerHTML");
                    html = System.Text.Json.JsonSerializer.Deserialize<string>(html);
                    File.WriteAllText(filePath, html);
                }
                else if (filePath.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
                {
                    // Exportar datos a CSV - usando script simple sin regex problemático
                    var script = @"(function() {
                        var rows = document.querySelectorAll('.excel-table tbody tr');
                        var csv = [];
                        rows.forEach(function(row) {
                            var cells = row.querySelectorAll('td');
                            var rowData = [];
                            cells.forEach(function(cell) {
                                var text = cell.textContent || '';
                                text = text.split('""').join('""""');
                                rowData.push('""' + text + '""');
                            });
                            csv.push(rowData.join(','));
                        });
                        return csv.join(String.fromCharCode(10));
                    })()";

                    var csv = await SpreadsheetWebView.ExecuteScriptAsync(script);
                    csv = System.Text.Json.JsonSerializer.Deserialize<string>(csv);
                    File.WriteAllText(filePath, csv, System.Text.Encoding.UTF8);
                }

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

        #region Import to Hekatan

        private async void ImportButton_Click(object sender, RoutedEventArgs e)
        {
            await ImportSelectedData(ImportFormat.Values);
        }

        private async void ImportAsMatrixButton_Click(object sender, RoutedEventArgs e)
        {
            await ImportSelectedData(ImportFormat.Matrix);
        }

        private async void ImportAsVectorButton_Click(object sender, RoutedEventArgs e)
        {
            await ImportSelectedData(ImportFormat.Vector);
        }

        private async System.Threading.Tasks.Task ImportSelectedData(ImportFormat format)
        {
            if (!_webViewInitialized) return;

            try
            {
                var json = await SpreadsheetWebView.ExecuteScriptAsync("getSelectedData()");
                json = System.Text.Json.JsonSerializer.Deserialize<string>(json);

                if (string.IsNullOrEmpty(json) || json == "[]")
                {
                    MessageBox.Show("Selecciona celdas para importar", "Informacion",
                        MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                var data = System.Text.Json.JsonSerializer.Deserialize<string[][]>(json);

                string calcpadCode = format switch
                {
                    ImportFormat.Matrix => ConvertToMatrix(data),
                    ImportFormat.Vector => ConvertToVector(data),
                    _ => ConvertToValues(data)
                };

                ImportToHekatan?.Invoke(this, new ExcelImportEventArgs
                {
                    Content = calcpadCode,
                    SourceFile = _currentFilePath,
                    SheetName = _xlsxReader?.Sheets[_currentSheetIndex]?.Name,
                    Format = format
                });

                StatusText.Text = "Datos importados a Hekatan";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error importando: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private string ConvertToMatrix(string[][] data)
        {
            if (data.Length == 0) return "";

            var rows = new List<string>();
            foreach (var row in data)
            {
                var values = row.Select(v =>
                {
                    if (double.TryParse(v, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out double d))
                        return d.ToString(System.Globalization.CultureInfo.InvariantCulture);
                    return "0";
                });
                rows.Add(string.Join("; ", values));
            }

            return $"M = [{string.Join(" | ", rows)}]";
        }

        private string ConvertToVector(string[][] data)
        {
            var values = new List<string>();
            foreach (var row in data)
            {
                foreach (var cell in row)
                {
                    if (double.TryParse(cell, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out double d))
                        values.Add(d.ToString(System.Globalization.CultureInfo.InvariantCulture));
                }
            }

            return $"V = [{string.Join("; ", values)}]";
        }

        private string ConvertToValues(string[][] data)
        {
            var lines = new List<string>();
            int varIndex = 1;

            foreach (var row in data)
            {
                foreach (var cell in row)
                {
                    if (double.TryParse(cell, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out double d))
                    {
                        lines.Add($"v{varIndex} = {d.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
                        varIndex++;
                    }
                }
            }

            return string.Join(Environment.NewLine, lines);
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
                SpreadsheetWebView.ZoomFactor = _zoomLevel / 100.0;
            }
        }

        #endregion

        #region Formula Bar

        private void FormulaTextBox_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == System.Windows.Input.Key.Enter)
            {
                // TODO: Aplicar formula/valor a celda seleccionada
                e.Handled = true;
            }
        }

        #endregion

        #region Drag and Drop

        private void MiniExcelViewer_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (files.Length > 0 && files[0].EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
                {
                    e.Effects = DragDropEffects.Copy;
                    e.Handled = true;
                    return;
                }
            }
            e.Effects = DragDropEffects.None;
            e.Handled = true;
        }

        private void MiniExcelViewer_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (files.Length > 0 && files[0].EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
                {
                    OpenDocument(files[0]);
                }
            }
        }

        #endregion

        #region Helpers

        private void SpreadsheetWebView_NavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess)
            {
                StatusText.Text = "Error cargando hoja en WebView";
            }
        }

        #endregion
    }

    /// <summary>
    /// Formato de importacion a Hekatan
    /// </summary>
    public enum ImportFormat
    {
        Values,
        Matrix,
        Vector
    }

    /// <summary>
    /// Argumentos para el evento ImportToHekatan de Excel
    /// </summary>
    public class ExcelImportEventArgs : EventArgs
    {
        public string Content { get; set; }
        public string SourceFile { get; set; }
        public string SheetName { get; set; }
        public ImportFormat Format { get; set; }
    }
}
