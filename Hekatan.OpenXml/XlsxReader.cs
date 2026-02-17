// XlsxReader.cs - Lector de archivos Excel (.xlsx) para MiniExcel
// Convierte hojas de cálculo XLSX a HTML para visualización en WebView2
// Basado en el patrón de XlsxConverter.cs para lectura de archivos Excel

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Xml.Linq;

namespace Hekatan.OpenXml
{
    /// <summary>
    /// Lector de archivos Excel (.xlsx) que convierte a HTML para visualización
    /// </summary>
    public class XlsxReader
    {
        // Namespaces de OpenXML para Excel
        private readonly XNamespace _ssNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        private readonly XNamespace _rNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private readonly XNamespace _relsNs = "http://schemas.openxmlformats.org/package/2006/relationships";

        private readonly List<string> _warnings = new List<string>();
        private string[] _sharedStrings = Array.Empty<string>();
        private Dictionary<string, string> _sheetRelationships = new Dictionary<string, string>();
        private Dictionary<int, CellStyle> _cellStyles = new Dictionary<int, CellStyle>();
        private Dictionary<int, NumberFormat> _numberFormats = new Dictionary<int, NumberFormat>();
        private List<CellFill> _fills = new List<CellFill>();
        private List<CellFont> _fonts = new List<CellFont>();
        private List<CellBorder> _borders = new List<CellBorder>();
        private string _excelVersion = "Desconocida";
        private string _workbookTitle = "";

        /// <summary>
        /// Advertencias generadas durante la lectura
        /// </summary>
        public IReadOnlyList<string> Warnings => _warnings.AsReadOnly();

        /// <summary>
        /// Versión de Excel detectada
        /// </summary>
        public string ExcelVersion => _excelVersion;

        /// <summary>
        /// Título del libro de trabajo
        /// </summary>
        public string Title => _workbookTitle;

        /// <summary>
        /// Información de las hojas disponibles
        /// </summary>
        public List<SheetInfo> Sheets { get; } = new List<SheetInfo>();

        /// <summary>
        /// Lee un archivo XLSX y retorna HTML para visualización
        /// </summary>
        /// <param name="xlsxPath">Ruta al archivo .xlsx</param>
        /// <param name="sheetIndex">Índice de la hoja a leer (0-based), -1 para todas</param>
        /// <returns>HTML representando la hoja de cálculo</returns>
        public string ReadToHtml(string xlsxPath, int sheetIndex = 0)
        {
            if (!File.Exists(xlsxPath))
                throw new FileNotFoundException($"Archivo no encontrado: {xlsxPath}");

            _warnings.Clear();
            Sheets.Clear();
            _sharedStrings = Array.Empty<string>();
            _sheetRelationships.Clear();
            _cellStyles.Clear();
            _numberFormats.Clear();
            _fills.Clear();
            _fonts.Clear();
            _borders.Clear();
            _workbookTitle = Path.GetFileNameWithoutExtension(xlsxPath);

            try
            {
                // Copiar a archivo temporal para evitar bloqueo
                string tempPath = Path.Combine(Path.GetTempPath(), "calcpad_xlsx_" + Guid.NewGuid().ToString("N") + ".xlsx");
                try
                {
                    File.Copy(xlsxPath, tempPath, true);
                }
                catch (IOException)
                {
                    tempPath = xlsxPath;
                }

                string html;
                using (var archive = ZipFile.OpenRead(tempPath))
                {
                    // Extraer metadatos
                    ExtractWorkbookProperties(archive);

                    // Cargar sharedStrings
                    LoadSharedStrings(archive);

                    // Cargar estilos
                    LoadStyles(archive);

                    // Cargar información de hojas
                    LoadSheetInfo(archive);

                    // Generar HTML
                    if (sheetIndex < 0)
                    {
                        // Todas las hojas
                        html = GenerateAllSheetsHtml(archive);
                    }
                    else if (sheetIndex < Sheets.Count)
                    {
                        // Hoja específica
                        html = GenerateSheetHtml(archive, Sheets[sheetIndex]);
                    }
                    else
                    {
                        html = "<p>Hoja no encontrada</p>";
                    }
                }

                // Limpiar archivo temporal
                if (tempPath != xlsxPath && File.Exists(tempPath))
                {
                    try { File.Delete(tempPath); } catch { }
                }

                return WrapInHtmlDocument(html);
            }
            catch (InvalidDataException)
            {
                throw new Exception("El archivo no es un archivo .xlsx válido");
            }
        }

        /// <summary>
        /// Lee un XLSX desde un Stream
        /// </summary>
        public string ReadToHtml(Stream stream, int sheetIndex = 0)
        {
            // Copiar stream a archivo temporal
            string tempPath = Path.Combine(Path.GetTempPath(), "calcpad_xlsx_" + Guid.NewGuid().ToString("N") + ".xlsx");
            using (var fileStream = File.Create(tempPath))
            {
                stream.CopyTo(fileStream);
            }

            try
            {
                return ReadToHtml(tempPath, sheetIndex);
            }
            finally
            {
                try { File.Delete(tempPath); } catch { }
            }
        }

        /// <summary>
        /// Obtiene los nombres de las hojas sin cargar todo el contenido
        /// </summary>
        public static List<string> GetSheetNames(string xlsxPath)
        {
            var result = new List<string>();
            try
            {
                using (var archive = ZipFile.OpenRead(xlsxPath))
                {
                    var wbEntry = archive.GetEntry("xl/workbook.xml");
                    if (wbEntry == null) return result;

                    XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
                    using (var stream = wbEntry.Open())
                    {
                        var doc = XDocument.Load(stream);
                        var sheets = doc.Descendants(ns + "sheet");
                        foreach (var sheet in sheets)
                        {
                            var name = sheet.Attribute("name")?.Value;
                            if (!string.IsNullOrEmpty(name))
                                result.Add(name);
                        }
                    }
                }
            }
            catch { }
            return result;
        }

        private void ExtractWorkbookProperties(ZipArchive archive)
        {
            // Buscar core.xml para metadatos
            var coreEntry = archive.Entries.FirstOrDefault(e =>
                e.FullName.Equals("docProps/core.xml", StringComparison.OrdinalIgnoreCase));

            if (coreEntry != null)
            {
                try
                {
                    using (var stream = coreEntry.Open())
                    {
                        var doc = XDocument.Load(stream);
                        XNamespace dcNs = "http://purl.org/dc/elements/1.1/";

                        var titleElement = doc.Descendants(dcNs + "title").FirstOrDefault();
                        if (titleElement != null && !string.IsNullOrWhiteSpace(titleElement.Value))
                        {
                            _workbookTitle = titleElement.Value;
                        }
                    }
                }
                catch { }
            }

            // Buscar app.xml para versión de Excel
            var appEntry = archive.Entries.FirstOrDefault(e =>
                e.FullName.Equals("docProps/app.xml", StringComparison.OrdinalIgnoreCase));

            if (appEntry != null)
            {
                try
                {
                    using (var stream = appEntry.Open())
                    {
                        var doc = XDocument.Load(stream);
                        var ns = doc.Root.GetDefaultNamespace();

                        var appVersion = doc.Descendants(ns + "AppVersion").FirstOrDefault();
                        var application = doc.Descendants(ns + "Application").FirstOrDefault();

                        if (application != null)
                        {
                            _excelVersion = application.Value;
                            if (appVersion != null)
                            {
                                _excelVersion += " " + appVersion.Value;
                            }
                        }
                    }
                }
                catch { }
            }
        }

        private void LoadSharedStrings(ZipArchive archive)
        {
            var ssEntry = archive.GetEntry("xl/sharedStrings.xml");
            if (ssEntry == null) return;

            var strings = new List<string>();
            using (var stream = ssEntry.Open())
            {
                var doc = XDocument.Load(stream);
                foreach (var si in doc.Descendants(_ssNs + "si"))
                {
                    // El texto puede estar en <t> directamente o en múltiples <r><t>
                    var t = si.Element(_ssNs + "t");
                    if (t != null)
                    {
                        strings.Add(t.Value);
                    }
                    else
                    {
                        // Concatenar todos los <r><t>
                        var text = string.Join("", si.Descendants(_ssNs + "t").Select(x => x.Value));
                        strings.Add(text);
                    }
                }
            }
            _sharedStrings = strings.ToArray();
        }

        private void LoadStyles(ZipArchive archive)
        {
            var stylesEntry = archive.GetEntry("xl/styles.xml");
            if (stylesEntry == null) return;

            try
            {
                using (var stream = stylesEntry.Open())
                {
                    var doc = XDocument.Load(stream);

                    // Cargar formatos de número personalizados
                    var numFmts = doc.Descendants(_ssNs + "numFmt");
                    foreach (var fmt in numFmts)
                    {
                        var id = int.Parse(fmt.Attribute("numFmtId")?.Value ?? "0");
                        var code = fmt.Attribute("formatCode")?.Value ?? "";
                        _numberFormats[id] = new NumberFormat { Id = id, FormatCode = code };
                    }

                    // Cargar fuentes
                    var fonts = doc.Descendants(_ssNs + "fonts").FirstOrDefault()?.Elements(_ssNs + "font");
                    if (fonts != null)
                    {
                        foreach (var font in fonts)
                        {
                            var cellFont = new CellFont();
                            var bold = font.Element(_ssNs + "b");
                            var italic = font.Element(_ssNs + "i");
                            var underline = font.Element(_ssNs + "u");
                            var color = font.Element(_ssNs + "color");
                            var sz = font.Element(_ssNs + "sz");
                            var name = font.Element(_ssNs + "name");

                            cellFont.Bold = bold != null;
                            cellFont.Italic = italic != null;
                            cellFont.Underline = underline != null;

                            if (color != null)
                            {
                                var rgb = color.Attribute("rgb")?.Value;
                                if (!string.IsNullOrEmpty(rgb) && rgb.Length >= 6)
                                {
                                    cellFont.Color = "#" + rgb.Substring(rgb.Length - 6);
                                }
                            }

                            if (sz != null)
                            {
                                double.TryParse(sz.Attribute("val")?.Value, out double size);
                                cellFont.Size = size;
                            }

                            if (name != null)
                            {
                                cellFont.FontName = name.Attribute("val")?.Value;
                            }

                            _fonts.Add(cellFont);
                        }
                    }

                    // Cargar rellenos (fills)
                    var fills = doc.Descendants(_ssNs + "fills").FirstOrDefault()?.Elements(_ssNs + "fill");
                    if (fills != null)
                    {
                        foreach (var fill in fills)
                        {
                            var cellFill = new CellFill();
                            var patternFill = fill.Element(_ssNs + "patternFill");
                            if (patternFill != null)
                            {
                                var fgColor = patternFill.Element(_ssNs + "fgColor");
                                var bgColor = patternFill.Element(_ssNs + "bgColor");
                                var pattern = patternFill.Attribute("patternType")?.Value;

                                if (fgColor != null)
                                {
                                    var rgb = fgColor.Attribute("rgb")?.Value;
                                    if (!string.IsNullOrEmpty(rgb) && rgb.Length >= 6)
                                    {
                                        cellFill.BackgroundColor = "#" + rgb.Substring(rgb.Length - 6);
                                    }
                                }
                                else if (bgColor != null && pattern != "none")
                                {
                                    var rgb = bgColor.Attribute("rgb")?.Value;
                                    if (!string.IsNullOrEmpty(rgb) && rgb.Length >= 6)
                                    {
                                        cellFill.BackgroundColor = "#" + rgb.Substring(rgb.Length - 6);
                                    }
                                }
                            }
                            _fills.Add(cellFill);
                        }
                    }

                    // Cargar bordes
                    var bordersEl = doc.Descendants(_ssNs + "borders").FirstOrDefault()?.Elements(_ssNs + "border");
                    if (bordersEl != null)
                    {
                        foreach (var border in bordersEl)
                        {
                            var cellBorder = new CellBorder();
                            var left = border.Element(_ssNs + "left");
                            var right = border.Element(_ssNs + "right");
                            var top = border.Element(_ssNs + "top");
                            var bottom = border.Element(_ssNs + "bottom");

                            cellBorder.HasLeft = left?.Attribute("style") != null;
                            cellBorder.HasRight = right?.Attribute("style") != null;
                            cellBorder.HasTop = top?.Attribute("style") != null;
                            cellBorder.HasBottom = bottom?.Attribute("style") != null;

                            _borders.Add(cellBorder);
                        }
                    }

                    // Cargar estilos de celda (cellXfs)
                    var cellXfs = doc.Descendants(_ssNs + "cellXfs").FirstOrDefault()?.Elements(_ssNs + "xf");
                    if (cellXfs != null)
                    {
                        int index = 0;
                        foreach (var xf in cellXfs)
                        {
                            var style = new CellStyle();
                            style.FontId = int.Parse(xf.Attribute("fontId")?.Value ?? "0");
                            style.FillId = int.Parse(xf.Attribute("fillId")?.Value ?? "0");
                            style.BorderId = int.Parse(xf.Attribute("borderId")?.Value ?? "0");
                            style.NumberFormatId = int.Parse(xf.Attribute("numFmtId")?.Value ?? "0");

                            var alignment = xf.Element(_ssNs + "alignment");
                            if (alignment != null)
                            {
                                style.HorizontalAlignment = alignment.Attribute("horizontal")?.Value;
                                style.VerticalAlignment = alignment.Attribute("vertical")?.Value;
                                style.WrapText = alignment.Attribute("wrapText")?.Value == "1";
                            }

                            _cellStyles[index] = style;
                            index++;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error cargando estilos: {ex.Message}");
            }
        }

        private void LoadSheetInfo(ZipArchive archive)
        {
            // Cargar relaciones del workbook
            var relsEntry = archive.GetEntry("xl/_rels/workbook.xml.rels");
            if (relsEntry != null)
            {
                using (var stream = relsEntry.Open())
                {
                    var doc = XDocument.Load(stream);
                    foreach (var rel in doc.Descendants(_relsNs + "Relationship"))
                    {
                        var id = rel.Attribute("Id")?.Value;
                        var target = rel.Attribute("Target")?.Value;
                        if (!string.IsNullOrEmpty(id) && !string.IsNullOrEmpty(target))
                        {
                            _sheetRelationships[id] = target;
                        }
                    }
                }
            }

            // Cargar información de hojas
            var wbEntry = archive.GetEntry("xl/workbook.xml");
            if (wbEntry == null) return;

            using (var stream = wbEntry.Open())
            {
                var doc = XDocument.Load(stream);
                var sheets = doc.Descendants(_ssNs + "sheet");
                int index = 0;
                foreach (var sheet in sheets)
                {
                    var name = sheet.Attribute("name")?.Value ?? $"Hoja{index + 1}";
                    var sheetId = sheet.Attribute("sheetId")?.Value;
                    var rId = sheet.Attribute(_rNs + "id")?.Value;

                    string filePath = null;
                    if (!string.IsNullOrEmpty(rId) && _sheetRelationships.TryGetValue(rId, out var target))
                    {
                        filePath = "xl/" + target;
                    }
                    else
                    {
                        filePath = $"xl/worksheets/sheet{index + 1}.xml";
                    }

                    Sheets.Add(new SheetInfo
                    {
                        Index = index,
                        Name = name,
                        SheetId = sheetId,
                        FilePath = filePath
                    });
                    index++;
                }
            }
        }

        private string GenerateAllSheetsHtml(ZipArchive archive)
        {
            var html = new StringBuilder();
            foreach (var sheet in Sheets)
            {
                html.AppendLine($"<h2>{System.Web.HttpUtility.HtmlEncode(sheet.Name)}</h2>");
                html.AppendLine(GenerateSheetHtml(archive, sheet));
                html.AppendLine("<hr/>");
            }
            return html.ToString();
        }

        private string GenerateSheetHtml(ZipArchive archive, SheetInfo sheetInfo)
        {
            var entry = archive.Entries.FirstOrDefault(e =>
                e.FullName.Equals(sheetInfo.FilePath, StringComparison.OrdinalIgnoreCase));

            if (entry == null)
            {
                return $"<p>Hoja '{sheetInfo.Name}' no encontrada en el archivo</p>";
            }

            var html = new StringBuilder();
            html.AppendLine("<div class=\"sheet-container\">");
            html.AppendLine("<table class=\"excel-table\">");

            using (var stream = entry.Open())
            {
                var doc = XDocument.Load(stream);

                // Obtener información de columnas para anchos
                var cols = doc.Descendants(_ssNs + "col").ToList();
                var colWidths = new Dictionary<int, double>();
                foreach (var col in cols)
                {
                    var min = int.Parse(col.Attribute("min")?.Value ?? "1");
                    var max = int.Parse(col.Attribute("max")?.Value ?? "1");
                    var width = double.Parse(col.Attribute("width")?.Value ?? "8.43",
                        System.Globalization.CultureInfo.InvariantCulture);

                    for (int i = min; i <= max; i++)
                    {
                        colWidths[i] = width;
                    }
                }

                // Obtener todas las filas
                var rows = doc.Descendants(_ssNs + "row").ToList();
                if (rows.Count == 0)
                {
                    html.AppendLine("<tr><td>Hoja vacía</td></tr>");
                }
                else
                {
                    // Determinar el rango de columnas usado
                    int maxCol = 1;
                    foreach (var row in rows)
                    {
                        foreach (var cell in row.Elements(_ssNs + "c"))
                        {
                            var cellRef = cell.Attribute("r")?.Value;
                            if (!string.IsNullOrEmpty(cellRef))
                            {
                                int col = GetColumnNumber(cellRef);
                                if (col > maxCol) maxCol = col;
                            }
                        }
                    }

                    // Limitar para evitar problemas de rendimiento
                    maxCol = Math.Min(maxCol, 50);
                    int maxRow = Math.Min(rows.Count, 500);

                    // Header con letras de columna
                    html.AppendLine("<thead><tr><th class=\"row-header\"></th>");
                    for (int c = 1; c <= maxCol; c++)
                    {
                        var colLetter = GetColumnLetter(c);
                        var width = colWidths.ContainsKey(c) ? colWidths[c] * 7 : 60;
                        html.AppendLine($"<th class=\"col-header\" style=\"width:{width}px\">{colLetter}</th>");
                    }
                    html.AppendLine("</tr></thead>");

                    // Cuerpo de la tabla
                    html.AppendLine("<tbody>");

                    int currentRow = 1;
                    int rowsProcessed = 0;
                    foreach (var row in rows)
                    {
                        if (rowsProcessed >= maxRow) break;

                        var rowIndex = int.Parse(row.Attribute("r")?.Value ?? currentRow.ToString());

                        // Insertar filas vacías si hay saltos
                        while (currentRow < rowIndex && rowsProcessed < maxRow)
                        {
                            html.Append($"<tr><th class=\"row-header\">{currentRow}</th>");
                            for (int c = 1; c <= maxCol; c++)
                            {
                                html.Append("<td></td>");
                            }
                            html.AppendLine("</tr>");
                            currentRow++;
                            rowsProcessed++;
                        }

                        if (rowsProcessed >= maxRow) break;

                        // Altura de fila
                        var rowHeight = row.Attribute("ht")?.Value;
                        var heightStyle = !string.IsNullOrEmpty(rowHeight)
                            ? $" style=\"height:{rowHeight}pt\""
                            : "";

                        html.Append($"<tr{heightStyle}><th class=\"row-header\">{rowIndex}</th>");

                        // Procesar celdas de la fila
                        var cells = row.Elements(_ssNs + "c").ToList();
                        var cellMap = new Dictionary<int, XElement>();
                        foreach (var cell in cells)
                        {
                            var cellRef = cell.Attribute("r")?.Value;
                            if (!string.IsNullOrEmpty(cellRef))
                            {
                                int col = GetColumnNumber(cellRef);
                                cellMap[col] = cell;
                            }
                        }

                        for (int c = 1; c <= maxCol; c++)
                        {
                            if (cellMap.TryGetValue(c, out var cell))
                            {
                                var cellHtml = ProcessCell(cell);
                                html.Append(cellHtml);
                            }
                            else
                            {
                                html.Append("<td></td>");
                            }
                        }

                        html.AppendLine("</tr>");
                        currentRow = rowIndex + 1;
                        rowsProcessed++;
                    }

                    html.AppendLine("</tbody>");
                }
            }

            html.AppendLine("</table>");
            html.AppendLine("</div>");

            return html.ToString();
        }

        private string ProcessCell(XElement cell)
        {
            var cellRef = cell.Attribute("r")?.Value ?? "";
            var type = cell.Attribute("t")?.Value;
            var styleIndex = cell.Attribute("s")?.Value;

            // Obtener valor
            var valueElem = cell.Element(_ssNs + "v");
            var formulaElem = cell.Element(_ssNs + "f");
            string value = "";
            string formula = formulaElem?.Value;

            if (valueElem != null)
            {
                if (type == "s" && _sharedStrings.Length > 0)
                {
                    if (int.TryParse(valueElem.Value, out int ssIndex) && ssIndex < _sharedStrings.Length)
                    {
                        value = _sharedStrings[ssIndex];
                    }
                }
                else if (type == "b")
                {
                    value = valueElem.Value == "1" ? "VERDADERO" : "FALSO";
                }
                else if (type == "e")
                {
                    value = valueElem.Value; // Error value like #DIV/0!
                }
                else
                {
                    value = valueElem.Value;
                }
            }
            else if (type == "inlineStr")
            {
                var is_ = cell.Element(_ssNs + "is");
                if (is_ != null)
                {
                    value = string.Join("", is_.Descendants(_ssNs + "t").Select(t => t.Value));
                }
            }

            // Aplicar formato de número si es necesario
            if (!string.IsNullOrEmpty(styleIndex) && int.TryParse(styleIndex, out int sIdx))
            {
                if (_cellStyles.TryGetValue(sIdx, out var style))
                {
                    value = FormatCellValue(value, style.NumberFormatId);
                }
            }

            // Generar estilo CSS
            var cssStyle = GetCellStyle(styleIndex);

            // Escapar HTML
            value = System.Web.HttpUtility.HtmlEncode(value);

            // Tooltip con fórmula si existe
            var title = !string.IsNullOrEmpty(formula)
                ? $" title=\"={System.Web.HttpUtility.HtmlAttributeEncode(formula)}\""
                : "";

            return $"<td data-cell=\"{cellRef}\"{title}{cssStyle}>{value}</td>";
        }

        private string FormatCellValue(string value, int numFmtId)
        {
            if (string.IsNullOrEmpty(value) || !double.TryParse(value,
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out double numValue))
            {
                return value;
            }

            // Formatos predefinidos de Excel
            switch (numFmtId)
            {
                case 0: // General
                    return numValue.ToString("G", System.Globalization.CultureInfo.CurrentCulture);
                case 1: // 0
                    return numValue.ToString("0");
                case 2: // 0.00
                    return numValue.ToString("0.00");
                case 3: // #,##0
                    return numValue.ToString("#,##0");
                case 4: // #,##0.00
                    return numValue.ToString("#,##0.00");
                case 9: // 0%
                    return (numValue * 100).ToString("0") + "%";
                case 10: // 0.00%
                    return (numValue * 100).ToString("0.00") + "%";
                case 11: // 0.00E+00
                    return numValue.ToString("0.00E+00");
                case 14: // m/d/yyyy (fecha)
                case 15:
                case 16:
                case 17:
                case 22:
                    try
                    {
                        var date = DateTime.FromOADate(numValue);
                        return date.ToString("dd/MM/yyyy");
                    }
                    catch
                    {
                        return value;
                    }
                case 18:
                case 19:
                case 20:
                case 21:
                    try
                    {
                        var date = DateTime.FromOADate(numValue);
                        return date.ToString("HH:mm:ss");
                    }
                    catch
                    {
                        return value;
                    }
                default:
                    // Formato personalizado - intentar aplicar
                    if (_numberFormats.TryGetValue(numFmtId, out var fmt))
                    {
                        // Simplificación: detectar si es porcentaje o fecha
                        if (fmt.FormatCode.Contains("%"))
                        {
                            return (numValue * 100).ToString("0.00") + "%";
                        }
                        if (fmt.FormatCode.Contains("yy") || fmt.FormatCode.Contains("mm") ||
                            fmt.FormatCode.Contains("dd"))
                        {
                            try
                            {
                                var date = DateTime.FromOADate(numValue);
                                return date.ToString("dd/MM/yyyy");
                            }
                            catch { }
                        }
                    }
                    return numValue.ToString("G", System.Globalization.CultureInfo.CurrentCulture);
            }
        }

        private string GetCellStyle(string styleIndex)
        {
            if (string.IsNullOrEmpty(styleIndex) || !int.TryParse(styleIndex, out int sIdx))
                return "";

            if (!_cellStyles.TryGetValue(sIdx, out var style))
                return "";

            var css = new List<string>();

            // Aplicar fuente
            if (style.FontId >= 0 && style.FontId < _fonts.Count)
            {
                var font = _fonts[style.FontId];
                if (font.Bold) css.Add("font-weight:bold");
                if (font.Italic) css.Add("font-style:italic");
                if (font.Underline) css.Add("text-decoration:underline");
                if (!string.IsNullOrEmpty(font.Color)) css.Add($"color:{font.Color}");
                if (font.Size > 0) css.Add($"font-size:{font.Size}pt");
                if (!string.IsNullOrEmpty(font.FontName)) css.Add($"font-family:'{font.FontName}'");
            }

            // Aplicar relleno
            if (style.FillId >= 0 && style.FillId < _fills.Count)
            {
                var fill = _fills[style.FillId];
                if (!string.IsNullOrEmpty(fill.BackgroundColor))
                    css.Add($"background-color:{fill.BackgroundColor}");
            }

            // Aplicar bordes
            if (style.BorderId >= 0 && style.BorderId < _borders.Count)
            {
                var border = _borders[style.BorderId];
                if (border.HasLeft) css.Add("border-left:1px solid #000");
                if (border.HasRight) css.Add("border-right:1px solid #000");
                if (border.HasTop) css.Add("border-top:1px solid #000");
                if (border.HasBottom) css.Add("border-bottom:1px solid #000");
            }

            // Aplicar alineación
            if (!string.IsNullOrEmpty(style.HorizontalAlignment))
            {
                var align = style.HorizontalAlignment switch
                {
                    "center" => "center",
                    "right" => "right",
                    "left" => "left",
                    "justify" => "justify",
                    _ => ""
                };
                if (!string.IsNullOrEmpty(align)) css.Add($"text-align:{align}");
            }

            if (!string.IsNullOrEmpty(style.VerticalAlignment))
            {
                var vAlign = style.VerticalAlignment switch
                {
                    "center" => "middle",
                    "top" => "top",
                    "bottom" => "bottom",
                    _ => ""
                };
                if (!string.IsNullOrEmpty(vAlign)) css.Add($"vertical-align:{vAlign}");
            }

            if (style.WrapText) css.Add("white-space:normal;word-wrap:break-word");

            if (css.Count == 0) return "";
            return $" style=\"{string.Join(";", css)}\"";
        }

        private string WrapInHtmlDocument(string bodyContent)
        {
            return $@"<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1"">
    <title>{System.Web.HttpUtility.HtmlEncode(_workbookTitle)}</title>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 10px;
            background-color: #f5f5f5;
        }}
        .sheet-container {{
            overflow: auto;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
        }}
        .excel-table {{
            border-collapse: collapse;
            font-size: 11px;
            white-space: nowrap;
        }}
        .excel-table th, .excel-table td {{
            border: 1px solid #e0e0e0;
            padding: 2px 5px;
            min-width: 20px;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        .excel-table th {{
            background-color: #f0f0f0;
            font-weight: normal;
            color: #333;
            position: sticky;
            top: 0;
            z-index: 1;
        }}
        .row-header {{
            background-color: #f0f0f0;
            text-align: center;
            min-width: 40px;
            position: sticky;
            left: 0;
            z-index: 2;
        }}
        .col-header {{
            text-align: center;
        }}
        thead th {{
            background-color: #e8e8e8;
        }}
        tbody tr:hover td {{
            background-color: #f8f8f8;
        }}
        td[title] {{
            cursor: help;
        }}
        h2 {{
            color: #217346;
            margin: 10px 0;
            font-size: 16px;
        }}
        hr {{
            border: none;
            border-top: 1px solid #ccc;
            margin: 20px 0;
        }}
    </style>
</head>
<body>
{bodyContent}
</body>
</html>";
        }

        private int GetColumnNumber(string cellRef)
        {
            int col = 0;
            foreach (char c in cellRef)
            {
                if (char.IsLetter(c))
                {
                    col = col * 26 + (char.ToUpper(c) - 'A' + 1);
                }
                else
                {
                    break;
                }
            }
            return col;
        }

        private string GetColumnLetter(int colNumber)
        {
            var result = "";
            while (colNumber > 0)
            {
                int modulo = (colNumber - 1) % 26;
                result = Convert.ToChar('A' + modulo) + result;
                colNumber = (colNumber - modulo - 1) / 26;
            }
            return result;
        }

        #region Helper Classes

        public class SheetInfo
        {
            public int Index { get; set; }
            public string Name { get; set; }
            public string SheetId { get; set; }
            public string FilePath { get; set; }
        }

        private class CellStyle
        {
            public int FontId { get; set; }
            public int FillId { get; set; }
            public int BorderId { get; set; }
            public int NumberFormatId { get; set; }
            public string HorizontalAlignment { get; set; }
            public string VerticalAlignment { get; set; }
            public bool WrapText { get; set; }
        }

        private class CellFont
        {
            public bool Bold { get; set; }
            public bool Italic { get; set; }
            public bool Underline { get; set; }
            public string Color { get; set; }
            public double Size { get; set; }
            public string FontName { get; set; }
        }

        private class CellFill
        {
            public string BackgroundColor { get; set; }
        }

        private class CellBorder
        {
            public bool HasLeft { get; set; }
            public bool HasRight { get; set; }
            public bool HasTop { get; set; }
            public bool HasBottom { get; set; }
        }

        private class NumberFormat
        {
            public int Id { get; set; }
            public string FormatCode { get; set; }
        }

        #endregion
    }
}
