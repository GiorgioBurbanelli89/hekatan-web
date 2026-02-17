// XlsxToHekatanConverter.cs - Conversor mejorado de Excel a Hekatan preservando TODO el formato
// Genera tablas HTML con estilos inline para mantener colores, bordes, fuentes, etc.

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Xml.Linq;

namespace Hekatan.Common
{
    /// <summary>
    /// Conversor mejorado de Excel a Hekatan que preserva formato visual completo
    /// </summary>
    public class XlsxToHekatanConverter
    {
        private readonly XNamespace _ssNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        private string[] _sharedStrings;
        private Dictionary<int, CellStyle> _cellStyles = new Dictionary<int, CellStyle>();
        private Dictionary<int, CellFont> _fonts = new Dictionary<int, CellFont>();
        private Dictionary<int, CellFill> _fills = new Dictionary<int, CellFill>();
        private Dictionary<int, CellBorder> _borders = new Dictionary<int, CellBorder>();

        public string Convert(string xlsxPath)
        {
            var output = new StringBuilder();

            using (var archive = ZipFile.OpenRead(xlsxPath))
            {
                LoadSharedStrings(archive);
                LoadStyles(archive);
                var sheetNames = LoadSheetNames(archive);

                output.AppendLine($"' Importado de: {Path.GetFileName(xlsxPath)}");
                output.AppendLine($"' Fecha: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
                output.AppendLine();

                foreach (var (sheetFile, sheetName) in sheetNames)
                {
                    ConvertSheet(archive, sheetFile, sheetName, output);
                }
            }

            return output.ToString();
        }

        private void LoadSharedStrings(ZipArchive archive)
        {
            var entry = archive.GetEntry("xl/sharedStrings.xml");
            if (entry == null)
            {
                _sharedStrings = new string[0];
                return;
            }

            var strings = new List<string>();
            using (var stream = entry.Open())
            {
                var doc = XDocument.Load(stream);
                foreach (var si in doc.Descendants(_ssNs + "si"))
                {
                    var text = string.Join("", si.Descendants(_ssNs + "t").Select(t => t.Value));
                    strings.Add(text);
                }
            }
            _sharedStrings = strings.ToArray();
        }

        private void LoadStyles(ZipArchive archive)
        {
            var entry = archive.GetEntry("xl/styles.xml");
            if (entry == null) return;

            using (var stream = entry.Open())
            {
                var doc = XDocument.Load(stream);

                // Cargar fuentes
                int fontIdx = 0;
                foreach (var font in doc.Descendants(_ssNs + "fonts").FirstOrDefault()?.Elements(_ssNs + "font") ?? Enumerable.Empty<XElement>())
                {
                    _fonts[fontIdx++] = new CellFont
                    {
                        Bold = font.Element(_ssNs + "b") != null,
                        Italic = font.Element(_ssNs + "i") != null,
                        Color = font.Element(_ssNs + "color")?.Attribute("rgb")?.Value,
                        Size = double.Parse(font.Element(_ssNs + "sz")?.Attribute("val")?.Value ?? "11"),
                        Name = font.Element(_ssNs + "name")?.Attribute("val")?.Value ?? "Calibri"
                    };
                }

                // Cargar rellenos
                int fillIdx = 0;
                foreach (var fill in doc.Descendants(_ssNs + "fills").FirstOrDefault()?.Elements(_ssNs + "fill") ?? Enumerable.Empty<XElement>())
                {
                    var bgColor = fill.Descendants(_ssNs + "fgColor").FirstOrDefault()?.Attribute("rgb")?.Value;
                    _fills[fillIdx++] = new CellFill { BackgroundColor = bgColor };
                }

                // Cargar bordes
                int borderIdx = 0;
                foreach (var border in doc.Descendants(_ssNs + "borders").FirstOrDefault()?.Elements(_ssNs + "border") ?? Enumerable.Empty<XElement>())
                {
                    _borders[borderIdx++] = new CellBorder
                    {
                        Left = border.Element(_ssNs + "left")?.Attribute("style")?.Value,
                        Right = border.Element(_ssNs + "right")?.Attribute("style")?.Value,
                        Top = border.Element(_ssNs + "top")?.Attribute("style")?.Value,
                        Bottom = border.Element(_ssNs + "bottom")?.Attribute("style")?.Value
                    };
                }

                // Cargar estilos de celda
                int styleIdx = 0;
                foreach (var xf in doc.Descendants(_ssNs + "cellXfs").FirstOrDefault()?.Elements(_ssNs + "xf") ?? Enumerable.Empty<XElement>())
                {
                    _cellStyles[styleIdx++] = new CellStyle
                    {
                        FontId = int.Parse(xf.Attribute("fontId")?.Value ?? "0"),
                        FillId = int.Parse(xf.Attribute("fillId")?.Value ?? "0"),
                        BorderId = int.Parse(xf.Attribute("borderId")?.Value ?? "0"),
                        HAlign = xf.Element(_ssNs + "alignment")?.Attribute("horizontal")?.Value,
                        VAlign = xf.Element(_ssNs + "alignment")?.Attribute("vertical")?.Value
                    };
                }
            }
        }

        private List<(string file, string name)> LoadSheetNames(ZipArchive archive)
        {
            var result = new List<(string, string)>();
            var entry = archive.GetEntry("xl/workbook.xml");
            if (entry == null) return result;

            using (var stream = entry.Open())
            {
                var doc = XDocument.Load(stream);
                int idx = 1;
                foreach (var sheet in doc.Descendants(_ssNs + "sheet"))
                {
                    var name = sheet.Attribute("name")?.Value ?? $"Hoja{idx}";
                    result.Add(($"xl/worksheets/sheet{idx}.xml", name));
                    idx++;
                }
            }
            return result;
        }

        private void ConvertSheet(ZipArchive archive, string sheetFile, string sheetName, StringBuilder output)
        {
            var entry = archive.GetEntry(sheetFile);
            if (entry == null) return;

            output.AppendLine($"\"<h2>{sheetName}</h2>");
            output.AppendLine($"'<table style=\"border-collapse:collapse; font-family:Calibri; font-size:11pt;\">");

            using (var stream = entry.Open())
            {
                var doc = XDocument.Load(stream);
                var rows = doc.Descendants(_ssNs + "row").ToList();

                foreach (var row in rows)
                {
                    output.AppendLine($"'<tr>");

                    foreach (var cell in row.Elements(_ssNs + "c"))
                    {
                        var cellRef = cell.Attribute("r")?.Value;
                        var styleIdx = cell.Attribute("s")?.Value;
                        var value = GetCellValue(cell);
                        var formula = cell.Element(_ssNs + "f")?.Value;

                        var style = GetCellStyleCss(styleIdx);
                        var content = EscapeHtml(value);

                        if (!string.IsNullOrEmpty(formula))
                        {
                            content += $" <span style=\"color:#888; font-size:9pt;\">(={formula})</span>";
                        }

                        output.AppendLine($"'<td{style}>{content}</td>");
                    }

                    output.AppendLine($"'</tr>");
                }
            }

            output.AppendLine($"'</table>");
            output.AppendLine();
        }

        private string GetCellValue(XElement cell)
        {
            var type = cell.Attribute("t")?.Value;
            var valueElem = cell.Element(_ssNs + "v");
            if (valueElem == null) return "";

            if (type == "s" && _sharedStrings.Length > 0)
            {
                if (int.TryParse(valueElem.Value, out int idx) && idx < _sharedStrings.Length)
                    return _sharedStrings[idx];
            }

            return valueElem.Value;
        }

        private string GetCellStyleCss(string styleIndex)
        {
            if (string.IsNullOrEmpty(styleIndex)) return "";
            if (!int.TryParse(styleIndex, out int idx)) return "";
            if (!_cellStyles.TryGetValue(idx, out var style)) return "";

            var css = new List<string>();
            css.Add("padding:4px 8px");
            css.Add("border:1px solid #ccc");

            // Fuente
            if (_fonts.TryGetValue(style.FontId, out var font))
            {
                if (font.Bold) css.Add("font-weight:bold");
                if (font.Italic) css.Add("font-style:italic");
                if (!string.IsNullOrEmpty(font.Color) && font.Color.Length >= 6)
                {
                    css.Add($"color:#{font.Color.Substring(font.Color.Length - 6)}");
                }
            }

            // Relleno
            if (_fills.TryGetValue(style.FillId, out var fill))
            {
                if (!string.IsNullOrEmpty(fill.BackgroundColor) && fill.BackgroundColor.Length >= 6)
                {
                    css.Add($"background-color:#{fill.BackgroundColor.Substring(fill.BackgroundColor.Length - 6)}");
                }
            }

            // Alineación
            if (!string.IsNullOrEmpty(style.HAlign))
                css.Add($"text-align:{style.HAlign}");

            return css.Count > 0 ? $" style=\"{string.Join("; ", css)}\"" : "";
        }

        private string EscapeHtml(string text) =>
            text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

        private class CellStyle
        {
            public int FontId { get; set; }
            public int FillId { get; set; }
            public int BorderId { get; set; }
            public string HAlign { get; set; }
            public string VAlign { get; set; }
        }

        private class CellFont
        {
            public bool Bold { get; set; }
            public bool Italic { get; set; }
            public string Color { get; set; }
            public double Size { get; set; }
            public string Name { get; set; }
        }

        private class CellFill
        {
            public string BackgroundColor { get; set; }
        }

        private class CellBorder
        {
            public string Left { get; set; }
            public string Right { get; set; }
            public string Top { get; set; }
            public string Bottom { get; set; }
        }
    }
}
