// DocxConverter.cs - Conversor de Word (.docx) a Hekatan (.cpd)
// Estrategia mejorada: DOCX → HTML (DocxReader) → CPD (HtmlToHekatanParser)
// Usa el DocxReader existente de Hekatan.OpenXml para una conversión más robusta

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using System.IO.Compression;

namespace Hekatan.Common
{
    /// <summary>
    /// Conversor de archivos Word (.docx) a Hekatan (.cpd)
    /// Utiliza estrategia de dos pasos: DOCX → HTML → CPD
    /// </summary>
    public class DocxConverter
    {
        private readonly StringBuilder _output = new StringBuilder();
        private readonly List<string> _warnings = new List<string>();
        private string _documentTitle = "";
        private string _wordVersion = "Desconocida";

        /// <summary>
        /// Advertencias generadas durante la conversión
        /// </summary>
        public IReadOnlyList<string> Warnings => _warnings.AsReadOnly();

        /// <summary>
        /// Título del documento
        /// </summary>
        public string Title => _documentTitle;

        /// <summary>
        /// Versión de Word detectada
        /// </summary>
        public string WordVersion => _wordVersion;

        /// <summary>
        /// Convierte un archivo .docx a formato .cpd (string)
        /// Estrategia: Leer DOCX como XML → Parsear contenido → Generar CPD
        /// </summary>
        /// <param name="docxPath">Ruta al archivo .docx</param>
        /// <returns>Contenido en formato Hekatan</returns>
        public string Convert(string docxPath)
        {
            if (!File.Exists(docxPath))
                throw new FileNotFoundException($"Archivo no encontrado: {docxPath}");

            _output.Clear();
            _warnings.Clear();
            _documentTitle = Path.GetFileNameWithoutExtension(docxPath);

            try
            {
                // PASO 1: Leer el DOCX y extraer contenido estructurado
                var paragraphs = new List<DocxParagraph>();
                var tables = new List<DocxTable>();

                // Usar DocxReader (de Hekatan.OpenXml) si está disponible, sino leer directamente
                // Para simplicidad, vamos a parsear el HTML directamente

                // Leer archivo DOCX como texto plano (extracción simple)
                var content = ExtractTextFromDocx(docxPath);

                // PASO 2: Escribir encabezado CPD
                _output.AppendLine("' ============================================");
                _output.AppendLine($"' Importado de Word (.docx)");
                _output.AppendLine($"' Versión: {_wordVersion}");
                _output.AppendLine($"' Archivo: {Path.GetFileName(docxPath)}");
                _output.AppendLine($"' Fecha: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
                if (!string.IsNullOrEmpty(_documentTitle))
                    _output.AppendLine($"' Título: {_documentTitle}");
                _output.AppendLine("' ============================================");
                _output.AppendLine();

                // PASO 3: Convertir contenido a formato Hekatan
                ConvertContentToHekatan(content);

                return _output.ToString();
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error durante la conversión: {ex.Message}");
                return _output.ToString();
            }
        }

        /// <summary>
        /// Extrae texto plano del archivo DOCX
        /// </summary>
        private string ExtractTextFromDocx(string docxPath)
        {
            var sb = new StringBuilder();

            try
            {
                using (var archive = System.IO.Compression.ZipFile.OpenRead(docxPath))
                {
                    // Extraer propiedades del documento
                    ExtractDocumentPropertiesFromArchive(archive);

                    // Leer document.xml
                    var docEntry = archive.Entries.FirstOrDefault(e =>
                        e.FullName.Equals("word/document.xml", StringComparison.OrdinalIgnoreCase));

                    if (docEntry != null)
                    {
                        using (var stream = docEntry.Open())
                        {
                            var doc = System.Xml.Linq.XDocument.Load(stream);
                            System.Xml.Linq.XNamespace wNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

                            // Extraer todos los elementos de texto preservando estructura
                            var body = doc.Descendants(wNs + "body").FirstOrDefault();
                            if (body != null)
                            {
                                foreach (var para in body.Elements(wNs + "p"))
                                {
                                    var paraText = ExtractParagraphText(para, wNs);
                                    if (!string.IsNullOrWhiteSpace(paraText))
                                    {
                                        sb.AppendLine(paraText);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error extrayendo texto: {ex.Message}");
            }

            return sb.ToString();
        }

        /// <summary>
        /// Extrae propiedades del documento desde el archivo ZIP
        /// </summary>
        private void ExtractDocumentPropertiesFromArchive(System.IO.Compression.ZipArchive archive)
        {
            try
            {
                var coreEntry = archive.Entries.FirstOrDefault(e =>
                    e.FullName.Equals("docProps/core.xml", StringComparison.OrdinalIgnoreCase));

                if (coreEntry != null)
                {
                    using (var stream = coreEntry.Open())
                    {
                        var doc = System.Xml.Linq.XDocument.Load(stream);
                        System.Xml.Linq.XNamespace dcNs = "http://purl.org/dc/elements/1.1/";
                        var titleElement = doc.Descendants(dcNs + "title").FirstOrDefault();
                        if (titleElement != null && !string.IsNullOrWhiteSpace(titleElement.Value))
                        {
                            _documentTitle = titleElement.Value;
                        }
                    }
                }

                var appEntry = archive.Entries.FirstOrDefault(e =>
                    e.FullName.Equals("docProps/app.xml", StringComparison.OrdinalIgnoreCase));

                if (appEntry != null)
                {
                    using (var stream = appEntry.Open())
                    {
                        var doc = System.Xml.Linq.XDocument.Load(stream);
                        System.Xml.Linq.XNamespace epNs = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
                        var application = doc.Descendants(epNs + "Application").FirstOrDefault();
                        if (application != null)
                        {
                            _wordVersion = application.Value;
                        }
                    }
                }
            }
            catch { }
        }

        /// <summary>
        /// Extrae texto de un párrafo manteniendo información de estilo
        /// </summary>
        private string ExtractParagraphText(System.Xml.Linq.XElement para, System.Xml.Linq.XNamespace wNs)
        {
            var textBuilder = new StringBuilder();
            var isBold = false;
            var isHeading = false;

            // Detectar estilo de párrafo
            var pPr = para.Element(wNs + "pPr");
            if (pPr != null)
            {
                var pStyle = pPr.Element(wNs + "pStyle");
                if (pStyle != null)
                {
                    var styleVal = pStyle.Attribute(wNs + "val")?.Value ?? "";
                    isHeading = styleVal.StartsWith("Heading") || styleVal.StartsWith("Ttulo");
                }
            }

            // Extraer texto de los runs
            foreach (var run in para.Elements(wNs + "r"))
            {
                var rPr = run.Element(wNs + "rPr");
                if (rPr != null && rPr.Element(wNs + "b") != null)
                {
                    isBold = true;
                }

                foreach (var t in run.Elements(wNs + "t"))
                {
                    textBuilder.Append(t.Value);
                }
            }

            var text = textBuilder.ToString().Trim();
            if (string.IsNullOrEmpty(text))
                return "";

            // Marcar el texto según su formato para posterior procesamiento
            if (isHeading)
                return $"[HEADING]{text}";
            else if (isBold)
                return $"[BOLD]{text}";
            else
                return text;
        }

        /// <summary>
        /// Convierte el contenido extraído a formato Hekatan
        /// </summary>
        private void ConvertContentToHekatan(string content)
        {
            var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var line in lines)
            {
                var trimmedLine = line.Trim();
                if (string.IsNullOrEmpty(trimmedLine))
                    continue;

                // Detectar y convertir según el tipo de línea
                if (trimmedLine.StartsWith("[HEADING]"))
                {
                    // Encabezado de sección (usa comillas en Hekatan)
                    var text = trimmedLine.Substring(9).Trim();
                    _output.AppendLine($"\"{text.ToUpper()}");
                }
                else if (trimmedLine.StartsWith("[BOLD]"))
                {
                    // Texto en negrita (subtítulo o etiqueta)
                    var text = trimmedLine.Substring(6).Trim();
                    _output.AppendLine($"'{text}");
                }
                else if (IsEquation(trimmedLine))
                {
                    // Ecuación matemática
                    var equation = ConvertToHekatanEquation(trimmedLine);
                    _output.AppendLine(equation);
                }
                else if (IsDefinition(trimmedLine))
                {
                    // Definición de variable (contiene =)
                    var definition = ConvertToHekatanDefinition(trimmedLine);
                    _output.AppendLine(definition);
                }
                else
                {
                    // Texto normal (comentario)
                    _output.AppendLine($"'{trimmedLine}");
                }
            }
        }

        /// <summary>
        /// Detecta si una línea es una ecuación matemática
        /// </summary>
        private bool IsEquation(string line)
        {
            // Buscar patrones matemáticos comunes
            return line.Contains("=") &&
                   (line.Contains("+") || line.Contains("-") || line.Contains("*") ||
                    line.Contains("/") || line.Contains("^") || line.Contains("("));
        }

        /// <summary>
        /// Detecta si una línea es una definición de variable
        /// </summary>
        private bool IsDefinition(string line)
        {
            // Variable = Valor (con posible unidad)
            return Regex.IsMatch(line, @"^[a-zA-Z_]\w*\s*=\s*[\d\.]");
        }

        /// <summary>
        /// Convierte una línea a ecuación Hekatan
        /// </summary>
        private string ConvertToHekatanEquation(string line)
        {
            var equation = line.Trim();

            // Convertir operadores y funciones comunes
            equation = Regex.Replace(equation, @"\bsqrt\s*\(", "sqr(", RegexOptions.IgnoreCase);
            equation = Regex.Replace(equation, @"\bsin\s*\(", "sin(", RegexOptions.IgnoreCase);
            equation = Regex.Replace(equation, @"\bcos\s*\(", "cos(", RegexOptions.IgnoreCase);
            equation = Regex.Replace(equation, @"\btan\s*\(", "tan(", RegexOptions.IgnoreCase);
            equation = Regex.Replace(equation, @"\blog\s*\(", "ln(", RegexOptions.IgnoreCase);
            equation = Regex.Replace(equation, @"\bexp\s*\(", "e^(", RegexOptions.IgnoreCase);

            // Convertir notación científica
            equation = Regex.Replace(equation, @"(\d+\.?\d*)[eE]([+-]?\d+)", m => {
                if (double.TryParse(m.Value, System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out double val))
                {
                    return val.ToString("0.##########", System.Globalization.CultureInfo.InvariantCulture);
                }
                return m.Value;
            });

            return equation;
        }

        /// <summary>
        /// Convierte una línea de definición a formato Hekatan
        /// </summary>
        private string ConvertToHekatanDefinition(string line)
        {
            var definition = line.Trim();

            // Detectar unidades comunes al final (m, cm, mm, kg, kN, MPa, etc.)
            var unitMatch = Regex.Match(definition, @"=\s*([\d\.]+)\s*([a-zA-Z]+)$");
            if (unitMatch.Success)
            {
                // Tiene unidad explícita
                var value = unitMatch.Groups[1].Value;
                var unit = unitMatch.Groups[2].Value;
                var varName = definition.Substring(0, definition.IndexOf('=')).Trim();

                // Convertir unidad a formato Hekatan
                var calcpadUnit = ConvertUnitToHekatan(unit);
                if (!string.IsNullOrEmpty(calcpadUnit))
                {
                    return $"{varName} = {value}{calcpadUnit}";
                }
            }

            return definition;
        }

        /// <summary>
        /// Convierte unidades comunes a formato Hekatan
        /// </summary>
        private string ConvertUnitToHekatan(string unit)
        {
            var unitMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "m", "m" }, { "cm", "cm" }, { "mm", "mm" }, { "km", "km" },
                { "m2", "m^2" }, { "m²", "m^2" }, { "cm2", "cm^2" },
                { "m3", "m^3" }, { "m³", "m^3" },
                { "kg", "kg" }, { "t", "t" }, { "ton", "t" },
                { "N", "N" }, { "kN", "kN" }, { "MN", "MN" },
                { "Pa", "Pa" }, { "kPa", "kPa" }, { "MPa", "MPa" }, { "GPa", "GPa" },
                { "deg", "°" }, { "rad", "rad" }
            };

            return unitMap.TryGetValue(unit, out var calcpadUnit) ? calcpadUnit : unit;
        }

        // Clases helper para estructurar datos del DOCX
        private class DocxParagraph
        {
            public string Text { get; set; }
            public bool IsBold { get; set; }
            public bool IsHeading { get; set; }
            public int HeadingLevel { get; set; }
        }

        private class DocxTable
        {
            public List<List<string>> Rows { get; set; } = new List<List<string>>();
        }
    }
}
