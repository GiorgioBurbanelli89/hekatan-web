// DocxReader.cs - Lector de archivos Word (.docx) para MiniWord
// Convierte documentos DOCX a HTML para visualización en WebView2
// Basado en el patrón de McdxConverter.cs para lectura de archivos Office (ZIP+XML)

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Xml.Linq;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Hekatan.OpenXml
{
    /// <summary>
    /// Lector de archivos Word (.docx) que convierte a HTML para visualización
    /// </summary>
    public class DocxReader
    {
        // Namespaces de OpenXML para documentos Word
        private readonly XNamespace _wNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        private readonly XNamespace _rNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private readonly XNamespace _aNs = "http://schemas.openxmlformats.org/drawingml/2006/main";
        private readonly XNamespace _wpNs = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
        private readonly XNamespace _picNs = "http://schemas.openxmlformats.org/drawingml/2006/picture";
        private readonly XNamespace _relsNs = "http://schemas.openxmlformats.org/package/2006/relationships";

        private readonly List<string> _warnings = new List<string>();
        private Dictionary<string, string> _imageRelationships = new Dictionary<string, string>();
        private Dictionary<string, (string format, string base64)> _imageBase64Data = new Dictionary<string, (string, string)>();
        private Dictionary<string, string> _hyperlinkRelationships = new Dictionary<string, string>();
        private string _documentTitle = "";
        private string _wordVersion = "Desconocida";

        /// <summary>
        /// Advertencias generadas durante la lectura
        /// </summary>
        public IReadOnlyList<string> Warnings => _warnings.AsReadOnly();

        /// <summary>
        /// Título del documento extraído de las propiedades
        /// </summary>
        public string Title => _documentTitle;

        /// <summary>
        /// Versión de Word detectada
        /// </summary>
        public string WordVersion => _wordVersion;

        /// <summary>
        /// Imágenes extraídas en formato Base64
        /// </summary>
        public IReadOnlyDictionary<string, (string format, string base64)> Images => _imageBase64Data;

        /// <summary>
        /// Lee un archivo DOCX y retorna HTML para visualización
        /// </summary>
        /// <param name="docxPath">Ruta al archivo .docx</param>
        /// <returns>HTML representando el documento</returns>
        public string ReadToHtml(string docxPath)
        {
            if (!File.Exists(docxPath))
                throw new FileNotFoundException($"Archivo no encontrado: {docxPath}");

            _warnings.Clear();
            _imageRelationships.Clear();
            _imageBase64Data.Clear();
            _hyperlinkRelationships.Clear();
            _documentTitle = Path.GetFileNameWithoutExtension(docxPath);

            try
            {
                // Copiar a archivo temporal para evitar bloqueo
                string tempPath = Path.Combine(Path.GetTempPath(), "calcpad_docx_" + Guid.NewGuid().ToString("N") + ".docx");
                try
                {
                    File.Copy(docxPath, tempPath, true);
                }
                catch (IOException)
                {
                    tempPath = docxPath;
                }

                string html;
                using (var archive = ZipFile.OpenRead(tempPath))
                {
                    // Extraer metadatos
                    ExtractDocumentProperties(archive);

                    // Cargar relaciones (imágenes, hipervínculos)
                    LoadRelationships(archive);

                    // Extraer imágenes a Base64
                    if (_imageRelationships.Count > 0)
                    {
                        ExtractImagesToBase64(archive);
                    }

                    // Procesar document.xml
                    html = ProcessDocument(archive);
                }

                // Limpiar archivo temporal
                if (tempPath != docxPath && File.Exists(tempPath))
                {
                    try { File.Delete(tempPath); } catch { }
                }

                return html;
            }
            catch (InvalidDataException)
            {
                throw new Exception("El archivo no es un archivo .docx válido");
            }
        }

        /// <summary>
        /// Lee un DOCX desde un Stream
        /// </summary>
        public string ReadToHtml(Stream stream)
        {
            _warnings.Clear();
            _imageRelationships.Clear();
            _imageBase64Data.Clear();
            _hyperlinkRelationships.Clear();

            // Copiar stream a archivo temporal
            string tempPath = Path.Combine(Path.GetTempPath(), "calcpad_docx_" + Guid.NewGuid().ToString("N") + ".docx");
            using (var fileStream = File.Create(tempPath))
            {
                stream.CopyTo(fileStream);
            }

            try
            {
                return ReadToHtml(tempPath);
            }
            finally
            {
                try { File.Delete(tempPath); } catch { }
            }
        }

        /// <summary>
        /// Extrae propiedades del documento (título, autor, versión)
        /// </summary>
        private void ExtractDocumentProperties(ZipArchive archive)
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
                        XNamespace cpNs = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";

                        var titleElement = doc.Descendants(dcNs + "title").FirstOrDefault();
                        if (titleElement != null && !string.IsNullOrWhiteSpace(titleElement.Value))
                        {
                            _documentTitle = titleElement.Value;
                        }
                    }
                }
                catch { }
            }

            // Buscar app.xml para versión de Word
            var appEntry = archive.Entries.FirstOrDefault(e =>
                e.FullName.Equals("docProps/app.xml", StringComparison.OrdinalIgnoreCase));

            if (appEntry != null)
            {
                try
                {
                    using (var stream = appEntry.Open())
                    {
                        var doc = XDocument.Load(stream);
                        XNamespace epNs = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";

                        var appVersion = doc.Descendants(epNs + "AppVersion").FirstOrDefault();
                        var application = doc.Descendants(epNs + "Application").FirstOrDefault();

                        if (application != null)
                        {
                            _wordVersion = application.Value;
                            if (appVersion != null)
                            {
                                _wordVersion += " " + appVersion.Value;
                            }
                        }
                    }
                }
                catch { }
            }
        }

        /// <summary>
        /// Carga relaciones del documento (imágenes, hipervínculos)
        /// </summary>
        private void LoadRelationships(ZipArchive archive)
        {
            var relsEntry = archive.Entries.FirstOrDefault(e =>
                e.FullName.Equals("word/_rels/document.xml.rels", StringComparison.OrdinalIgnoreCase));

            if (relsEntry == null) return;

            try
            {
                using (var stream = relsEntry.Open())
                {
                    var doc = XDocument.Load(stream);

                    foreach (var rel in doc.Descendants(_relsNs + "Relationship"))
                    {
                        var id = rel.Attribute("Id")?.Value;
                        var type = rel.Attribute("Type")?.Value ?? "";
                        var target = rel.Attribute("Target")?.Value;

                        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(target)) continue;

                        if (type.Contains("image"))
                        {
                            // Normalizar path de imagen
                            if (!target.StartsWith("/"))
                                target = "word/" + target;
                            else
                                target = target.TrimStart('/');

                            _imageRelationships[id] = target;
                        }
                        else if (type.Contains("hyperlink"))
                        {
                            _hyperlinkRelationships[id] = target;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error cargando relaciones: {ex.Message}");
            }
        }

        /// <summary>
        /// Extrae imágenes del archivo DOCX y las convierte a Base64
        /// </summary>
        private void ExtractImagesToBase64(ZipArchive archive)
        {
            foreach (var kvp in _imageRelationships)
            {
                var relId = kvp.Key;
                var imagePath = kvp.Value;

                var imageEntry = archive.Entries.FirstOrDefault(e =>
                    e.FullName.Equals(imagePath, StringComparison.OrdinalIgnoreCase));

                if (imageEntry == null)
                {
                    // Intentar sin "word/" prefix
                    var altPath = imagePath.Replace("word/", "");
                    imageEntry = archive.Entries.FirstOrDefault(e =>
                        e.FullName.EndsWith(altPath, StringComparison.OrdinalIgnoreCase));
                }

                if (imageEntry != null)
                {
                    try
                    {
                        using (var stream = imageEntry.Open())
                        using (var ms = new MemoryStream())
                        {
                            stream.CopyTo(ms);
                            var bytes = ms.ToArray();
                            var base64 = Convert.ToBase64String(bytes);

                            // Determinar formato por extensión
                            var ext = Path.GetExtension(imageEntry.Name).ToLowerInvariant().TrimStart('.');
                            var mimeType = ext switch
                            {
                                "png" => "image/png",
                                "jpg" or "jpeg" => "image/jpeg",
                                "gif" => "image/gif",
                                "bmp" => "image/bmp",
                                "tiff" or "tif" => "image/tiff",
                                "wmf" => "image/x-wmf",
                                "emf" => "image/x-emf",
                                _ => "image/png"
                            };

                            _imageBase64Data[relId] = (mimeType, base64);
                        }
                    }
                    catch (Exception ex)
                    {
                        _warnings.Add($"Error extrayendo imagen {relId}: {ex.Message}");
                    }
                }
            }
        }

        /// <summary>
        /// Procesa el documento principal y genera HTML
        /// </summary>
        private string ProcessDocument(ZipArchive archive)
        {
            var docEntry = archive.Entries.FirstOrDefault(e =>
                e.FullName.Equals("word/document.xml", StringComparison.OrdinalIgnoreCase));

            if (docEntry == null)
                throw new Exception("No se encontró document.xml en el archivo DOCX");

            var html = new StringBuilder();

            using (var stream = docEntry.Open())
            {
                var doc = XDocument.Load(stream);
                var body = doc.Descendants(_wNs + "body").FirstOrDefault();

                if (body == null)
                {
                    _warnings.Add("No se encontró el body del documento");
                    return "<p>Documento vacío</p>";
                }

                foreach (var element in body.Elements())
                {
                    var elementHtml = ProcessElement(element);
                    if (!string.IsNullOrEmpty(elementHtml))
                    {
                        html.AppendLine(elementHtml);
                    }
                }
            }

            return html.ToString();
        }

        /// <summary>
        /// Procesa un elemento XML y retorna su HTML equivalente
        /// </summary>
        private string ProcessElement(XElement element)
        {
            var localName = element.Name.LocalName;

            return localName switch
            {
                "p" => ProcessParagraph(element),
                "tbl" => ProcessTable(element),
                "sectPr" => "", // Propiedades de sección - ignorar
                _ => ""
            };
        }

        /// <summary>
        /// Procesa un párrafo y genera HTML
        /// </summary>
        private string ProcessParagraph(XElement para)
        {
            var html = new StringBuilder();
            var pPr = para.Element(_wNs + "pPr");

            // Determinar estilo del párrafo
            string tag = "p";
            string style = "";
            string cssClass = "";

            if (pPr != null)
            {
                // Detectar encabezados
                var pStyle = pPr.Element(_wNs + "pStyle");
                if (pStyle != null)
                {
                    var styleVal = pStyle.Attribute(_wNs + "val")?.Value ?? "";
                    if (styleVal.StartsWith("Heading") || styleVal.StartsWith("Ttulo"))
                    {
                        // Extraer nivel del encabezado
                        var level = styleVal.Last();
                        if (char.IsDigit(level) && level >= '1' && level <= '6')
                        {
                            tag = "h" + level;
                        }
                    }
                    cssClass = $"class=\"{styleVal}\"";
                }

                // Alineación
                var jc = pPr.Element(_wNs + "jc");
                if (jc != null)
                {
                    var align = jc.Attribute(_wNs + "val")?.Value;
                    if (!string.IsNullOrEmpty(align))
                    {
                        var cssAlign = align switch
                        {
                            "center" => "center",
                            "right" => "right",
                            "both" or "justify" => "justify",
                            _ => "left"
                        };
                        style += $"text-align:{cssAlign};";
                    }
                }

                // Detectar listas
                var numPr = pPr.Element(_wNs + "numPr");
                if (numPr != null)
                {
                    // Es un item de lista - por ahora lo tratamos como párrafo con bullet
                    style += "margin-left:20px;";
                }
            }

            // Procesar contenido del párrafo
            var content = new StringBuilder();
            foreach (var child in para.Elements())
            {
                var childName = child.Name.LocalName;
                switch (childName)
                {
                    case "r":
                        content.Append(ProcessRun(child));
                        break;
                    case "hyperlink":
                        content.Append(ProcessHyperlink(child));
                        break;
                    case "bookmarkStart":
                    case "bookmarkEnd":
                        // Ignorar marcadores
                        break;
                }
            }

            // Si el párrafo está vacío, agregar espacio
            var text = content.ToString();
            if (string.IsNullOrWhiteSpace(text))
            {
                text = "&nbsp;";
            }

            // Construir tag HTML
            var styleAttr = !string.IsNullOrEmpty(style) ? $" style=\"{style}\"" : "";
            var classAttr = !string.IsNullOrEmpty(cssClass) ? $" {cssClass}" : "";

            return $"<{tag}{classAttr}{styleAttr}>{text}</{tag}>";
        }

        /// <summary>
        /// Procesa un "run" (fragmento de texto con formato)
        /// </summary>
        private string ProcessRun(XElement run)
        {
            var html = new StringBuilder();
            var rPr = run.Element(_wNs + "rPr");

            // Detectar formato
            bool isBold = false, isItalic = false, isUnderline = false, isStrike = false;
            bool isSuperscript = false, isSubscript = false;
            string color = null;
            string bgColor = null;
            string fontSize = null;
            string fontFamily = null;

            if (rPr != null)
            {
                isBold = rPr.Element(_wNs + "b") != null;
                isItalic = rPr.Element(_wNs + "i") != null;
                isUnderline = rPr.Element(_wNs + "u") != null;
                isStrike = rPr.Element(_wNs + "strike") != null;

                var vertAlign = rPr.Element(_wNs + "vertAlign");
                if (vertAlign != null)
                {
                    var val = vertAlign.Attribute(_wNs + "val")?.Value;
                    isSuperscript = val == "superscript";
                    isSubscript = val == "subscript";
                }

                var colorEl = rPr.Element(_wNs + "color");
                if (colorEl != null)
                {
                    var val = colorEl.Attribute(_wNs + "val")?.Value;
                    if (!string.IsNullOrEmpty(val) && val != "auto")
                    {
                        color = "#" + val;
                    }
                }

                var highlight = rPr.Element(_wNs + "highlight");
                if (highlight != null)
                {
                    var val = highlight.Attribute(_wNs + "val")?.Value;
                    if (!string.IsNullOrEmpty(val))
                    {
                        bgColor = ConvertHighlightColor(val);
                    }
                }

                var sz = rPr.Element(_wNs + "sz");
                if (sz != null)
                {
                    var val = sz.Attribute(_wNs + "val")?.Value;
                    if (int.TryParse(val, out int halfPoints))
                    {
                        fontSize = (halfPoints / 2.0) + "pt";
                    }
                }

                var rFonts = rPr.Element(_wNs + "rFonts");
                if (rFonts != null)
                {
                    fontFamily = rFonts.Attribute(_wNs + "ascii")?.Value ??
                                rFonts.Attribute(_wNs + "hAnsi")?.Value;
                }
            }

            // Procesar contenido
            foreach (var child in run.Elements())
            {
                var childName = child.Name.LocalName;
                switch (childName)
                {
                    case "t":
                        var text = child.Value;
                        // Escapar caracteres HTML
                        text = System.Web.HttpUtility.HtmlEncode(text);
                        html.Append(text);
                        break;
                    case "br":
                        html.Append("<br/>");
                        break;
                    case "tab":
                        html.Append("&emsp;");
                        break;
                    case "drawing":
                        html.Append(ProcessDrawing(child));
                        break;
                    case "pict":
                        // Imagen antigua (VML) - intentar procesar
                        html.Append(ProcessVmlPicture(child));
                        break;
                }
            }

            if (html.Length == 0) return "";

            // Aplicar formato con tags HTML
            var result = html.ToString();

            // Construir estilo inline
            var styles = new List<string>();
            if (!string.IsNullOrEmpty(color)) styles.Add($"color:{color}");
            if (!string.IsNullOrEmpty(bgColor)) styles.Add($"background-color:{bgColor}");
            if (!string.IsNullOrEmpty(fontSize)) styles.Add($"font-size:{fontSize}");
            if (!string.IsNullOrEmpty(fontFamily)) styles.Add($"font-family:'{fontFamily}'");

            if (styles.Count > 0)
            {
                result = $"<span style=\"{string.Join(";", styles)}\">{result}</span>";
            }

            // Aplicar formato con tags
            if (isBold) result = $"<strong>{result}</strong>";
            if (isItalic) result = $"<em>{result}</em>";
            if (isUnderline) result = $"<u>{result}</u>";
            if (isStrike) result = $"<s>{result}</s>";
            if (isSuperscript) result = $"<sup>{result}</sup>";
            if (isSubscript) result = $"<sub>{result}</sub>";

            return result;
        }

        /// <summary>
        /// Procesa un hipervínculo
        /// </summary>
        private string ProcessHyperlink(XElement hyperlink)
        {
            var relId = hyperlink.Attribute(_rNs + "id")?.Value;
            var anchor = hyperlink.Attribute(_wNs + "anchor")?.Value;

            string href = "#";
            if (!string.IsNullOrEmpty(relId) && _hyperlinkRelationships.TryGetValue(relId, out var url))
            {
                href = url;
            }
            else if (!string.IsNullOrEmpty(anchor))
            {
                href = "#" + anchor;
            }

            var content = new StringBuilder();
            foreach (var run in hyperlink.Elements(_wNs + "r"))
            {
                content.Append(ProcessRun(run));
            }

            return $"<a href=\"{System.Web.HttpUtility.HtmlAttributeEncode(href)}\" target=\"_blank\">{content}</a>";
        }

        /// <summary>
        /// Procesa una tabla
        /// </summary>
        private string ProcessTable(XElement table)
        {
            var html = new StringBuilder();
            html.AppendLine("<table style=\"border-collapse:collapse;width:100%;\">");

            foreach (var row in table.Elements(_wNs + "tr"))
            {
                html.AppendLine("<tr>");

                foreach (var cell in row.Elements(_wNs + "tc"))
                {
                    var cellHtml = ProcessTableCell(cell);
                    html.AppendLine(cellHtml);
                }

                html.AppendLine("</tr>");
            }

            html.AppendLine("</table>");
            return html.ToString();
        }

        /// <summary>
        /// Procesa una celda de tabla
        /// </summary>
        private string ProcessTableCell(XElement cell)
        {
            var html = new StringBuilder();
            var tcPr = cell.Element(_wNs + "tcPr");

            // Detectar propiedades de celda
            string style = "border:1px solid #ccc;padding:4px;";
            int colspan = 1;
            int rowspan = 1;

            if (tcPr != null)
            {
                var gridSpan = tcPr.Element(_wNs + "gridSpan");
                if (gridSpan != null)
                {
                    int.TryParse(gridSpan.Attribute(_wNs + "val")?.Value, out colspan);
                }

                var vMerge = tcPr.Element(_wNs + "vMerge");
                if (vMerge != null)
                {
                    var val = vMerge.Attribute(_wNs + "val")?.Value;
                    if (val != "restart")
                    {
                        // Celda continuación de merge vertical - no renderizar
                        return "";
                    }
                }

                // Color de fondo
                var shd = tcPr.Element(_wNs + "shd");
                if (shd != null)
                {
                    var fill = shd.Attribute(_wNs + "fill")?.Value;
                    if (!string.IsNullOrEmpty(fill) && fill != "auto")
                    {
                        style += $"background-color:#{fill};";
                    }
                }

                // Alineación vertical
                var vAlign = tcPr.Element(_wNs + "vAlign");
                if (vAlign != null)
                {
                    var val = vAlign.Attribute(_wNs + "val")?.Value;
                    style += $"vertical-align:{val};";
                }
            }

            // Procesar contenido de la celda
            var content = new StringBuilder();
            foreach (var para in cell.Elements(_wNs + "p"))
            {
                // Procesar párrafo sin tags p (ya estamos en celda)
                foreach (var child in para.Elements())
                {
                    if (child.Name.LocalName == "r")
                        content.Append(ProcessRun(child));
                    else if (child.Name.LocalName == "hyperlink")
                        content.Append(ProcessHyperlink(child));
                }
            }

            // Construir tag de celda
            var colspanAttr = colspan > 1 ? $" colspan=\"{colspan}\"" : "";
            var rowspanAttr = rowspan > 1 ? $" rowspan=\"{rowspan}\"" : "";

            return $"<td style=\"{style}\"{colspanAttr}{rowspanAttr}>{content}</td>";
        }

        /// <summary>
        /// Procesa un elemento drawing (imagen moderna)
        /// </summary>
        private string ProcessDrawing(XElement drawing)
        {
            try
            {
                // Buscar el blip (referencia a imagen)
                var blip = drawing.Descendants(_aNs + "blip").FirstOrDefault();
                if (blip == null) return "";

                var embedId = blip.Attribute(_rNs + "embed")?.Value;
                if (string.IsNullOrEmpty(embedId)) return "";

                // Buscar dimensiones
                int width = 0, height = 0;
                var extent = drawing.Descendants(_wpNs + "extent").FirstOrDefault();
                if (extent != null)
                {
                    // EMUs a pixels (914400 EMUs = 1 inch, asumimos 96 DPI)
                    if (long.TryParse(extent.Attribute("cx")?.Value, out long cx))
                        width = (int)(cx / 9525);
                    if (long.TryParse(extent.Attribute("cy")?.Value, out long cy))
                        height = (int)(cy / 9525);
                }

                // Obtener imagen Base64
                if (_imageBase64Data.TryGetValue(embedId, out var imgData))
                {
                    var sizeAttr = "";
                    if (width > 0) sizeAttr += $" width=\"{width}\"";
                    if (height > 0) sizeAttr += $" height=\"{height}\"";

                    return $"<img src=\"data:{imgData.format};base64,{imgData.base64}\"{sizeAttr} style=\"max-width:100%;height:auto;\"/>";
                }

                _warnings.Add($"Imagen no encontrada: {embedId}");
                return $"<span style=\"color:red;\">[Imagen: {embedId}]</span>";
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error procesando imagen: {ex.Message}");
                return "";
            }
        }

        /// <summary>
        /// Procesa una imagen VML antigua
        /// </summary>
        private string ProcessVmlPicture(XElement pict)
        {
            // Las imágenes VML son más complejas - implementación básica
            _warnings.Add("Imagen VML detectada - soporte limitado");
            return "<span style=\"color:orange;\">[Imagen VML]</span>";
        }

        /// <summary>
        /// Convierte color de highlight de Word a CSS
        /// </summary>
        private string ConvertHighlightColor(string wordColor)
        {
            return wordColor.ToLowerInvariant() switch
            {
                "yellow" => "#ffff00",
                "green" => "#00ff00",
                "cyan" => "#00ffff",
                "magenta" => "#ff00ff",
                "blue" => "#0000ff",
                "red" => "#ff0000",
                "darkblue" => "#000080",
                "darkcyan" => "#008080",
                "darkgreen" => "#008000",
                "darkmagenta" => "#800080",
                "darkred" => "#800000",
                "darkyellow" => "#808000",
                "darkgray" => "#808080",
                "lightgray" => "#c0c0c0",
                "black" => "#000000",
                _ => "#ffff00" // Default amarillo
            };
        }
    }
}
