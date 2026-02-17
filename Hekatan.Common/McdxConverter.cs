// McdxConverter.cs - Conversor de Mathcad Prime (.mcdx) a Hekatan (.cpd)
// El formato .mcdx es un archivo ZIP (Open Packaging Conventions) que contiene XML
// Usado por: Botón "Importar Mathcad" y directiva @{mcdx}

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Hekatan.Common
{
    /// <summary>
    /// Conversor de archivos Mathcad Prime (.mcdx) a Hekatan (.cpd)
    /// </summary>
    public class McdxConverter
    {
        private readonly StringBuilder _output = new StringBuilder();
        private readonly List<string> _warnings = new List<string>();
        private readonly XNamespace _mlNs = "http://schemas.mathsoft.com/math50";
        private readonly XNamespace _wsNs = "http://schemas.mathsoft.com/worksheet50";
        private readonly XNamespace _rNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private string _mathcadVersion = "Desconocida";
        private Dictionary<string, string> _imageRelationships = new Dictionary<string, string>();
        private Dictionary<string, (string format, string base64)> _imageBase64Data = new Dictionary<string, (string format, string base64)>();
        private string _imageOutputDir = null;
        private string _mcdxSourcePath = null;

        /// <summary>
        /// Lista de advertencias generadas durante la conversión
        /// </summary>
        public IReadOnlyList<string> Warnings => _warnings.AsReadOnly();

        /// <summary>
        /// Versión de Mathcad Prime detectada en el archivo
        /// </summary>
        public string MathcadVersion => _mathcadVersion;

        /// <summary>
        /// Convierte un archivo .mcdx a formato .cpd (string)
        /// </summary>
        /// <param name="mcdxPath">Ruta al archivo .mcdx</param>
        /// <returns>Contenido en formato Hekatan</returns>
        public string Convert(string mcdxPath)
        {
            if (!File.Exists(mcdxPath))
                throw new FileNotFoundException($"Archivo no encontrado: {mcdxPath}");

            _output.Clear();
            _warnings.Clear();
            _mathcadVersion = "Desconocida";
            _imageRelationships.Clear();
            _mcdxSourcePath = mcdxPath;

            // Crear directorio para imágenes extraídas (junto al archivo .mcdx)
            string fileNameWithoutExt = Path.GetFileNameWithoutExtension(mcdxPath);
            _imageOutputDir = Path.Combine(Path.GetDirectoryName(mcdxPath) ?? "", fileNameWithoutExt + "_images");

            try
            {
                // Copiar a archivo temporal para evitar bloqueo si Mathcad tiene el archivo abierto
                string tempPath = Path.Combine(Path.GetTempPath(), "calcpad_mcdx_" + Guid.NewGuid().ToString("N") + ".mcdx");
                try
                {
                    File.Copy(mcdxPath, tempPath, true);
                }
                catch (IOException)
                {
                    // Si no se puede copiar, intentar leer directamente
                    tempPath = mcdxPath;
                }

                using (var archive = ZipFile.OpenRead(tempPath))
                {
                    // Buscar y extraer versión de Mathcad de los metadatos
                    ExtractMathcadVersion(archive);

                    // Cargar relaciones de imágenes desde worksheet.xml.rels
                    LoadImageRelationships(archive);

                    // Convertir imágenes a Base64 si hay alguna
                    if (_imageRelationships.Count > 0)
                    {
                        ExtractImagesToBase64(archive);
                    }

                    // Ahora escribir el encabezado con la versión
                    _output.AppendLine("' ============================================");
                    _output.AppendLine($"' Importado de Mathcad Prime (.mcdx)");
                    _output.AppendLine($"' Versión Mathcad: {_mathcadVersion}");
                    _output.AppendLine($"' Archivo: {Path.GetFileName(mcdxPath)}");
                    _output.AppendLine($"' Fecha: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
                    if (_imageBase64Data.Count > 0)
                        _output.AppendLine($"' Imágenes embebidas: {_imageBase64Data.Count} (formato Base64)");
                    _output.AppendLine("' ============================================");
                    _output.AppendLine();

                    // Buscar worksheet.xml
                    ZipArchiveEntry worksheetEntry = null;
                    foreach (var entry in archive.Entries)
                    {
                        if (entry.FullName.EndsWith("worksheet.xml", StringComparison.OrdinalIgnoreCase))
                        {
                            worksheetEntry = entry;
                            break;
                        }
                    }

                    if (worksheetEntry == null)
                        throw new Exception("No se encontró worksheet.xml en el archivo .mcdx");

                    using (var stream = worksheetEntry.Open())
                    {
                        var doc = XDocument.Load(stream);
                        ProcessWorksheet(doc);
                    }
                }

                // Limpiar archivo temporal
                if (tempPath != mcdxPath && File.Exists(tempPath))
                {
                    try { File.Delete(tempPath); } catch { }
                }
            }
            catch (InvalidDataException)
            {
                throw new Exception("El archivo no es un archivo .mcdx válido (debe ser un archivo ZIP)");
            }

            // Agregar advertencias al final si las hay
            if (_warnings.Count > 0)
            {
                _output.AppendLine();
                _output.AppendLine("' === ADVERTENCIAS ===");
                foreach (var warning in _warnings)
                {
                    _output.AppendLine($"' {warning}");
                }
            }

            return _output.ToString();
        }

        /// <summary>
        /// Convierte y guarda el archivo .cpd
        /// </summary>
        public string ConvertAndSave(string mcdxPath, string outputPath = null)
        {
            if (string.IsNullOrEmpty(outputPath))
                outputPath = Path.ChangeExtension(mcdxPath, ".cpd");

            string content = Convert(mcdxPath);
            File.WriteAllText(outputPath, content, Encoding.UTF8);
            return outputPath;
        }

        /// <summary>
        /// Extrae la versión de Mathcad Prime de los metadatos del archivo .mcdx
        /// </summary>
        private void ExtractMathcadVersion(ZipArchive archive)
        {
            _mathcadVersion = "Desconocida";

            try
            {
                // Buscar en docProps/app.xml (donde está Application y AppVersion)
                var appEntry = archive.Entries.FirstOrDefault(e =>
                    e.FullName.Equals("docProps/app.xml", StringComparison.OrdinalIgnoreCase));

                if (appEntry != null)
                {
                    using (var stream = appEntry.Open())
                    {
                        var doc = XDocument.Load(stream);
                        var root = doc.Root;
                        if (root != null)
                        {
                            // Namespace de Mathcad Prime extended-properties
                            XNamespace mns = "http://schemas.mathsoft.com/extended-properties";
                            // Namespace de Office (fallback)
                            XNamespace ons = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";

                            // Buscar appVersion (Mathcad usa minúscula)
                            var appVersion = root.Element(mns + "appVersion")?.Value
                                          ?? root.Element(ons + "AppVersion")?.Value
                                          ?? root.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("appVersion", StringComparison.OrdinalIgnoreCase))?.Value;

                            // Buscar engineVersion para más detalle
                            var engineVersion = root.Element(mns + "engineVersion")?.Value
                                             ?? root.Descendants().FirstOrDefault(e => e.Name.LocalName == "engineVersion")?.Value;

                            // Buscar build date
                            var build = root.Element(mns + "build")?.Value
                                     ?? root.Descendants().FirstOrDefault(e => e.Name.LocalName == "build")?.Value;

                            if (!string.IsNullOrEmpty(appVersion))
                            {
                                // Extraer versión principal (ej: 10.0.0.0 -> 10.0)
                                var versionParts = appVersion.Split('.');
                                string majorMinor = versionParts.Length >= 2
                                    ? $"{versionParts[0]}.{versionParts[1]}"
                                    : appVersion;

                                _mathcadVersion = $"Prime {majorMinor}";

                                // Agregar build si está disponible
                                if (!string.IsNullOrEmpty(build))
                                    _mathcadVersion += $" (Build {build})";
                            }
                        }
                    }
                }

                // Si no se encontró en app.xml, buscar en el worksheet.xml
                if (_mathcadVersion == "Desconocida")
                {
                    var worksheetEntry = archive.Entries.FirstOrDefault(e =>
                        e.FullName.EndsWith("worksheet.xml", StringComparison.OrdinalIgnoreCase));

                    if (worksheetEntry != null)
                    {
                        using (var stream = worksheetEntry.Open())
                        {
                            var doc = XDocument.Load(stream);
                            var root = doc.Root;
                            if (root != null)
                            {
                                // Buscar atributo version en el elemento raíz
                                var versionAttr = root.Attribute("version");
                                if (versionAttr != null)
                                    _mathcadVersion = $"Prime (worksheet v{versionAttr.Value})";

                                // También buscar en el namespace del schema
                                var schemaVersion = root.Name.NamespaceName;
                                if (!string.IsNullOrEmpty(schemaVersion))
                                {
                                    // Extraer versión del namespace (ej: http://schemas.mathsoft.com/worksheet50)
                                    var match = Regex.Match(schemaVersion, @"(\d+)$");
                                    if (match.Success)
                                    {
                                        string wsVersion = match.Value;
                                        if (_mathcadVersion == "Desconocida")
                                        {
                                            // Mapear schema version a versión de Mathcad Prime
                                            string primeVersion = wsVersion switch
                                            {
                                                "50" => "Prime 1.0 - 4.0",
                                                "60" => "Prime 5.0",
                                                "70" => "Prime 6.0",
                                                "80" => "Prime 7.0",
                                                "90" => "Prime 8.0",
                                                "100" => "Prime 9.0",
                                                "110" => "Prime 10.0",
                                                _ => $"Prime (schema {wsVersion})"
                                            };
                                            _mathcadVersion = primeVersion;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Buscar también en Content_Types.xml o rels/.rels para más info
                if (_mathcadVersion == "Desconocida")
                {
                    var coreEntry = archive.Entries.FirstOrDefault(e =>
                        e.FullName.Equals("docProps/core.xml", StringComparison.OrdinalIgnoreCase));

                    if (coreEntry != null)
                    {
                        using (var stream = coreEntry.Open())
                        {
                            var doc = XDocument.Load(stream);
                            // Dublin Core namespace
                            XNamespace dcNs = "http://purl.org/dc/elements/1.1/";
                            var creator = doc.Descendants(dcNs + "creator").FirstOrDefault()?.Value;
                            if (!string.IsNullOrEmpty(creator) && creator.Contains("Mathcad"))
                                _mathcadVersion = creator;
                        }
                    }
                }
            }
            catch
            {
                // Si hay error leyendo metadatos, continuar con versión desconocida
                _mathcadVersion = "Desconocida";
            }
        }

        /// <summary>
        /// Carga las relaciones de imágenes desde mathcad/_rels/worksheet.xml.rels
        /// </summary>
        private void LoadImageRelationships(ZipArchive archive)
        {
            _imageRelationships.Clear();

            try
            {
                // Buscar el archivo worksheet.xml.rels
                var relsEntry = archive.Entries.FirstOrDefault(e =>
                    e.FullName.EndsWith("mathcad/_rels/worksheet.xml.rels", StringComparison.OrdinalIgnoreCase));

                if (relsEntry == null)
                    return; // No hay relaciones

                using (var stream = relsEntry.Open())
                {
                    var doc = XDocument.Load(stream);
                    var root = doc.Root;
                    if (root == null) return;

                    // Namespace para relationships
                    XNamespace relNs = "http://schemas.openxmlformats.org/package/2006/relationships";

                    // Buscar todos los Relationship de tipo image
                    var imageRels = root.Descendants(relNs + "Relationship")
                        .Where(r => r.Attribute("Type")?.Value.Contains("image") == true);

                    foreach (var rel in imageRels)
                    {
                        var id = rel.Attribute("Id")?.Value;
                        var target = rel.Attribute("Target")?.Value;

                        if (!string.IsNullOrEmpty(id) && !string.IsNullOrEmpty(target))
                        {
                            // Target puede empezar con / o no
                            if (target.StartsWith("/"))
                                target = target.Substring(1);

                            _imageRelationships[id] = target;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error al cargar relaciones de imágenes: {ex.Message}");
            }
        }

        /// <summary>
        /// Extrae las imágenes del archivo .mcdx a la carpeta de imágenes
        /// </summary>
        private void ExtractImages(ZipArchive archive)
        {
            if (_imageRelationships.Count == 0)
                return;

            try
            {
                // Crear directorio si no existe
                if (!Directory.Exists(_imageOutputDir))
                    Directory.CreateDirectory(_imageOutputDir);

                int extractedCount = 0;

                foreach (var imagePath in _imageRelationships.Values.Distinct())
                {
                    // Buscar la entrada en el archivo ZIP
                    var imageEntry = archive.Entries.FirstOrDefault(e =>
                        e.FullName.Equals(imagePath, StringComparison.OrdinalIgnoreCase));

                    if (imageEntry != null)
                    {
                        // Extraer solo el nombre del archivo
                        string fileName = Path.GetFileName(imageEntry.FullName);
                        string outputPath = Path.Combine(_imageOutputDir, fileName);

                        // Extraer archivo
                        using (var entryStream = imageEntry.Open())
                        using (var fileStream = File.Create(outputPath))
                        {
                            entryStream.CopyTo(fileStream);
                        }

                        extractedCount++;
                    }
                }

                if (extractedCount > 0)
                {
                    _warnings.Add($"{extractedCount} imagen(es) extraída(s) a carpeta '{Path.GetFileName(_imageOutputDir)}'");
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error al extraer imágenes: {ex.Message}");
            }
        }

        /// <summary>
        /// Extrae las imágenes del archivo .mcdx y las convierte a Base64 para embeber en .cpd
        /// </summary>
        private void ExtractImagesToBase64(ZipArchive archive)
        {
            if (_imageRelationships.Count == 0)
                return;

            _imageBase64Data.Clear();

            try
            {
                int convertedCount = 0;

                foreach (var (id, imagePath) in _imageRelationships)
                {
                    // Buscar la entrada en el archivo ZIP
                    var imageEntry = archive.Entries.FirstOrDefault(e =>
                        e.FullName.Equals(imagePath, StringComparison.OrdinalIgnoreCase));

                    if (imageEntry != null)
                    {
                        // Determinar formato de imagen por extensión
                        string extension = Path.GetExtension(imageEntry.FullName).ToLower();
                        string format = "png"; // default
                        if (extension == ".jpg" || extension == ".jpeg")
                            format = "jpeg";
                        else if (extension == ".bmp")
                            format = "bmp";
                        else if (extension == ".gif")
                            format = "gif";

                        // Leer imagen y convertir a Base64
                        using (var entryStream = imageEntry.Open())
                        using (var memoryStream = new MemoryStream())
                        {
                            entryStream.CopyTo(memoryStream);
                            byte[] imageBytes = memoryStream.ToArray();
                            string base64 = System.Convert.ToBase64String(imageBytes);

                            // Almacenar en diccionario usando el ID como clave
                            _imageBase64Data[id] = (format, base64);
                            convertedCount++;
                        }
                    }
                }

                if (convertedCount > 0)
                {
                    _warnings.Add($"{convertedCount} imagen(es) convertida(s) a Base64 (embebidas en .cpd)");
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error al convertir imágenes a Base64: {ex.Message}");
            }
        }

        /// <summary>
        /// Procesa el documento XML del worksheet
        /// </summary>
        private void ProcessWorksheet(XDocument doc)
        {
            var root = doc.Root;
            if (root == null) return;

            // Obtener namespace
            XNamespace ns = root.GetDefaultNamespace();
            if (string.IsNullOrEmpty(ns.NamespaceName))
                ns = _wsNs;

            // Buscar todas las regiones
            var regions = root.Descendants(ns + "region");
            if (!regions.Any())
                regions = root.Descendants("region");

            foreach (var region in regions)
            {
                ProcessRegion(region, ns);
            }
        }

        /// <summary>
        /// Procesa una región individual
        /// IMPORTANTE: El orden de verificación importa - los tipos más específicos
        /// (spec-table, solveblock, plot) deben verificarse ANTES de math,
        /// porque pueden contener elementos math internos.
        /// </summary>
        private void ProcessRegion(XElement region, XNamespace ns)
        {
            // 1. Buscar spec-table PRIMERO (contiene múltiples math)
            var specTable = region.Descendants().FirstOrDefault(e =>
                e.Name.LocalName == "spec-table" ||
                e.Name == ns + "spec-table");

            if (specTable != null)
            {
                ProcessSpecTableRegion(specTable, ns);
                return;
            }

            // 2. Buscar solveblock (contiene múltiples math)
            var solveblock = region.Descendants().FirstOrDefault(e =>
                e.Name.LocalName == "solveblock" ||
                e.Name == ns + "solveblock");

            if (solveblock != null)
            {
                ProcessSolveBlockRegion(solveblock, ns);
                return;
            }

            // 3. Buscar plot (gráfico) - antes de math porque tiene math interno
            var plot = region.Descendants().FirstOrDefault(e =>
                e.Name.LocalName == "plot" ||
                e.Name == ns + "plot");

            if (plot != null)
            {
                ProcessPlotRegion(plot, ns);
                return;
            }

            // 4. Buscar chartComponent
            var chartComponent = region.Descendants().FirstOrDefault(e =>
                e.Name.LocalName == "chartComponent" ||
                e.Name == ns + "chartComponent");

            if (chartComponent != null)
            {
                ProcessChartComponentRegion(chartComponent, ns);
                return;
            }

            // 5. Buscar elemento picture (imagen)
            var picture = region.Descendants().FirstOrDefault(e =>
                e.Name.LocalName == "picture" ||
                e.Name == ns + "picture");

            if (picture != null)
            {
                ProcessPictureRegion(picture, ns);
                return;
            }

            // 6. Buscar elemento text
            var text = region.Descendants().FirstOrDefault(e =>
                e.Name.LocalName == "text" ||
                e.Name == ns + "text");

            if (text != null)
            {
                ProcessTextRegion(text);
                return;
            }

            // 7. Buscar elemento math (último - caso más general)
            var math = region.Descendants().FirstOrDefault(e =>
                e.Name.LocalName == "math" ||
                e.Name == ns + "math");

            if (math != null)
            {
                ProcessMathRegion(math);
                return;
            }
        }

        /// <summary>
        /// Procesa una región matemática
        /// </summary>
        private void ProcessMathRegion(XElement math)
        {
            try
            {
                // Buscar define (asignación) o eval (evaluación)
                var define = math.Descendants().FirstOrDefault(e => e.Name.LocalName == "define");
                var eval = math.Descendants().FirstOrDefault(e => e.Name.LocalName == "eval");

                if (define != null)
                {
                    string expr = ProcessDefine(define);
                    if (!string.IsNullOrWhiteSpace(expr))
                        _output.AppendLine(expr);
                }
                else if (eval != null)
                {
                    string expr = ProcessEval(eval);
                    if (!string.IsNullOrWhiteSpace(expr))
                        _output.AppendLine(expr);
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error procesando expresión: {ex.Message}");
            }
        }

        /// <summary>
        /// Procesa una definición (variable = valor)
        /// </summary>
        private string ProcessDefine(XElement define)
        {
            var children = define.Elements().ToList();
            if (children.Count < 2) return null;

            // Primer hijo: nombre de la variable
            string varName = ExtractValue(children[0]);

            // Segundo hijo: valor/expresión
            string value = ExtractExpression(children[1]);

            if (string.IsNullOrWhiteSpace(varName) || string.IsNullOrWhiteSpace(value))
                return null;

            return $"{varName} = {value}";
        }

        /// <summary>
        /// Procesa una evaluación (mostrar resultado)
        /// </summary>
        private string ProcessEval(XElement eval)
        {
            var children = eval.Elements().ToList();
            if (children.Count == 0) return null;

            string expr = ExtractExpression(children[0]);
            if (string.IsNullOrWhiteSpace(expr))
                return null;

            // En Hekatan, simplemente ponemos la expresión para que se evalúe
            return expr;
        }

        /// <summary>
        /// Extrae el valor de un elemento (id, real, str)
        /// </summary>
        private string ExtractValue(XElement elem)
        {
            string localName = elem.Name.LocalName;

            switch (localName)
            {
                case "id":
                    return CleanIdentifier(elem.Value);
                case "real":
                    return elem.Value;
                case "str":
                    return $"\"{elem.Value}\"";
                default:
                    return ExtractExpression(elem);
            }
        }

        /// <summary>
        /// Extrae una expresión completa (recursivo)
        /// </summary>
        private string ExtractExpression(XElement elem)
        {
            string localName = elem.Name.LocalName;
            var children = elem.Elements().ToList();

            switch (localName)
            {
                case "id":
                    return CleanIdentifier(elem.Value);

                case "real":
                    return elem.Value;

                case "str":
                    return $"\"{elem.Value}\"";

                case "matrix":
                    return ProcessMatrix(elem);

                case "vector":
                    return ProcessVector(elem);

                case "apply":
                    return ProcessApply(elem);

                case "eval":
                    if (children.Count > 0)
                        return ExtractExpression(children[0]);
                    return "";

                case "parens":
                    if (children.Count > 0)
                        return $"({ExtractExpression(children[0])})";
                    return "()";

                case "sequence":
                    // Lista de argumentos
                    var args = children.Select(c => ExtractExpression(c));
                    return string.Join("; ", args);

                default:
                    // Si tiene hijos, procesar el primero
                    if (children.Count > 0)
                        return ExtractExpression(children[0]);
                    return elem.Value ?? "";
            }
        }

        /// <summary>
        /// Procesa un vector de Mathcad
        /// En Hekatan: vector columna = [v1; v2; v3], vector fila = [v1, v2, v3]
        /// </summary>
        private string ProcessVector(XElement vector)
        {
            var values = vector.Elements()
                .Where(e => e.Name.LocalName == "real" || e.Name.LocalName == "id" ||
                           e.Name.LocalName == "apply" || e.Name.LocalName == "matrix")
                .Select(e => ExtractExpression(e))
                .ToList();

            if (values.Count == 0)
                return "[]";

            // Vector columna en Hekatan: [v1; v2; v3] (punto y coma separa filas)
            var sb = new StringBuilder();
            sb.Append("[");
            sb.Append(string.Join("; ", values));
            sb.Append("]");
            return sb.ToString();
        }

        /// <summary>
        /// Procesa una matriz de Mathcad
        /// Mathcad almacena matrices en orden column-major
        /// En Hekatan:
        /// - Vector columna (Nx1): [v1; v2; v3] (punto y coma separa elementos)
        /// - Matriz (MxN): [r1c1; r1c2 | r2c1; r2c2] (| separa filas, ; separa columnas)
        /// </summary>
        private string ProcessMatrix(XElement matrix)
        {
            // Obtener dimensiones
            var rowsAttr = matrix.Attribute("rows");
            var colsAttr = matrix.Attribute("cols");

            if (rowsAttr == null || colsAttr == null)
            {
                _warnings.Add("Matriz sin dimensiones especificadas");
                return "[]";
            }

            int rows = int.Parse(rowsAttr.Value);
            int cols = int.Parse(colsAttr.Value);

            // Obtener todos los valores
            var values = matrix.Elements()
                .Where(e => e.Name.LocalName == "real" || e.Name.LocalName == "id" || e.Name.LocalName == "apply")
                .Select(e => ExtractExpression(e))
                .ToList();

            if (values.Count != rows * cols)
            {
                _warnings.Add($"Matriz con valores incompletos: esperados {rows * cols}, encontrados {values.Count}");
            }

            var sb = new StringBuilder();
            sb.Append("[");

            // Caso especial: Vector columna (cols = 1)
            // En Hekatan: [v1; v2; v3] (solo punto y coma)
            if (cols == 1)
            {
                sb.Append(string.Join("; ", values));
            }
            else
            {
                // Matriz: convertir de column-major a row-major
                // Mathcad column-major: valores ordenados por columna
                // Hekatan: filas separadas por |, columnas por ;
                for (int r = 0; r < rows; r++)
                {
                    if (r > 0) sb.Append(" | ");

                    for (int c = 0; c < cols; c++)
                    {
                        if (c > 0) sb.Append("; ");

                        // Índice en column-major: columna * num_filas + fila
                        int idx = c * rows + r;
                        if (idx < values.Count)
                            sb.Append(values[idx]);
                        else
                            sb.Append("0");
                    }
                }
            }

            sb.Append("]");
            return sb.ToString();
        }

        /// <summary>
        /// Procesa un elemento apply (operación o función)
        /// </summary>
        private string ProcessApply(XElement apply)
        {
            var children = apply.Elements().ToList();
            if (children.Count == 0) return "";

            string op = children[0].Name.LocalName;

            // Caso especial: el primer hijo es otro apply (aplicación de función/derivada)
            // Estructura: <apply><apply><functionDerivative/><id>f</id></apply><id>t</id></apply>
            // Significa: aplicar f'(derivada de f) al argumento t
            if (op == "apply" && children.Count >= 2)
            {
                var innerApply = children[0];
                var innerChildren = innerApply.Elements().ToList();
                if (innerChildren.Count >= 1)
                {
                    var innerOp = innerChildren[0].Name.LocalName;
                    if (innerOp == "functionDerivative")
                    {
                        // Es derivada aplicada a argumento: f'(t)
                        string derivExpr = ExtractExpression(innerApply);
                        string arg = ExtractExpression(children[1]);
                        return $"{derivExpr}({arg})";
                    }
                    else if (innerOp == "id")
                    {
                        // Es función normal aplicada: f(x)
                        string funcName = CleanIdentifier(innerChildren[0].Value);
                        var args = children.Skip(1).Select(c => ExtractExpression(c));
                        return $"{funcName}({string.Join("; ", args)})";
                    }
                }
            }

            switch (op)
            {
                // Operadores aritméticos
                case "plus":
                    if (children.Count >= 3)
                        return $"{ExtractExpression(children[1])} + {ExtractExpression(children[2])}";
                    break;

                case "minus":
                    if (children.Count >= 3)
                        return $"{ExtractExpression(children[1])} - {ExtractExpression(children[2])}";
                    else if (children.Count >= 2)
                        return $"-{ExtractExpression(children[1])}";
                    break;

                case "mult":
                    if (children.Count >= 3)
                        return $"{ExtractExpression(children[1])}*{ExtractExpression(children[2])}";
                    break;

                case "div":
                    if (children.Count >= 3)
                        return $"{ExtractExpression(children[1])}/{ExtractExpression(children[2])}";
                    break;

                case "pow":
                    if (children.Count >= 3)
                        return $"{ExtractExpression(children[1])}^{ExtractExpression(children[2])}";
                    break;

                case "scale":
                    // En Mathcad, scale se usa para aplicar unidades: valor * unidad
                    // En Hekatan, las unidades se aplican con ': valor'unidad
                    if (children.Count >= 3)
                    {
                        var valueExpr = ExtractExpression(children[1]);
                        var unitElement = children[2];

                        // Verificar si el segundo operando es una unidad (tiene label="UNIT")
                        var labelAttr = unitElement.Attribute("labels");
                        bool isUnit = labelAttr?.Value?.Contains("UNIT") == true;

                        if (isUnit || unitElement.Name.LocalName == "id")
                        {
                            // Es una unidad - usar sintaxis Hekatan: valor'unidad
                            var unitName = unitElement.Value?.Trim() ?? ExtractExpression(unitElement);
                            return $"{valueExpr}'{unitName}";
                        }
                        else
                        {
                            // Es multiplicación normal
                            return $"{valueExpr}*{ExtractExpression(unitElement)}";
                        }
                    }
                    break;

                // Funciones matemáticas
                case "sqrt":
                    if (children.Count >= 2)
                        return $"sqr({ExtractExpression(children[1])})";
                    break;

                case "sin":
                case "cos":
                case "tan":
                case "asin":
                case "acos":
                case "atan":
                case "sinh":
                case "cosh":
                case "tanh":
                case "ln":
                case "log":
                case "exp":
                case "abs":
                    if (children.Count >= 2)
                        return $"{op}({ExtractExpression(children[1])})";
                    break;

                case "functionDerivative":
                    // Derivada de una función: d/dt f(t)
                    // Estructura: <apply><functionDerivative/><id>f</id></apply> representa f'
                    // Para derivada aplicada: <apply><apply><functionDerivative/><id>f</id></apply><id>t</id></apply>
                    if (children.Count >= 2)
                    {
                        var funcElement = children[1];

                        // Contar nivel de derivada y obtener función base
                        int derivativeOrder = 1;
                        string baseFuncName = "";

                        // Si la función es otra derivada anidada, contar orden
                        var current = funcElement;
                        while (current != null && current.Name.LocalName == "apply")
                        {
                            var innerChildren = current.Elements().ToList();
                            if (innerChildren.Count >= 2 && innerChildren[0].Name.LocalName == "functionDerivative")
                            {
                                derivativeOrder++;
                                current = innerChildren[1];
                            }
                            else break;
                        }

                        // Obtener nombre de la función base
                        if (current != null)
                        {
                            baseFuncName = current.Name.LocalName == "id"
                                ? CleanIdentifier(current.Value)
                                : ExtractExpression(current);
                        }
                        else
                        {
                            baseFuncName = ExtractExpression(funcElement);
                        }

                        // Generar notación de derivada: f', f'', f'''
                        string primes = new string('\'', derivativeOrder);
                        return $"{baseFuncName}{primes}";
                    }
                    break;

                case "indexer":
                    // Indexación de array: X[1], Y[2], etc.
                    if (children.Count >= 3)
                    {
                        var arrayName = ExtractExpression(children[1]);
                        var index = ExtractExpression(children[2]);
                        return $"{arrayName}[{index}]";
                    }
                    break;

                case "id":
                    // Llamada a función: fem_beam_K(E, A, I, L)
                    string funcName = CleanIdentifier(children[0].Value);
                    if (children.Count >= 2)
                    {
                        var funcArgs = new List<string>();
                        for (int i = 1; i < children.Count; i++)
                        {
                            string arg = ExtractExpression(children[i]);
                            // Si es una secuencia, separar los argumentos
                            if (children[i].Name.LocalName == "sequence")
                            {
                                var seqArgs = children[i].Elements().Select(e => ExtractExpression(e));
                                funcArgs.AddRange(seqArgs);
                            }
                            else if (!string.IsNullOrWhiteSpace(arg))
                            {
                                funcArgs.Add(arg);
                            }
                        }
                        return $"{funcName}({string.Join("; ", funcArgs)})";
                    }
                    return funcName;

                default:
                    // Operador desconocido - intentar procesar hijos
                    if (children.Count >= 2)
                    {
                        var parts = children.Skip(1).Select(c => ExtractExpression(c));
                        return string.Join(" ", parts);
                    }
                    break;
            }

            return "";
        }

        /// <summary>
        /// Limpia un identificador (quita espacios, etc.)
        /// </summary>
        private string CleanIdentifier(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return "";

            // Quitar espacios en blanco
            id = id.Trim();

            // Reemplazar caracteres griegos comunes
            var greekMap = new Dictionary<string, string>
            {
                { "α", "alpha" }, { "β", "beta" }, { "γ", "gamma" },
                { "δ", "delta" }, { "ε", "epsilon" }, { "θ", "theta" },
                { "λ", "lambda" }, { "μ", "mu" }, { "ν", "nu" },
                { "π", "pi" }, { "ρ", "rho" }, { "σ", "sigma" },
                { "τ", "tau" }, { "φ", "phi" }, { "ω", "omega" }
            };

            foreach (var kv in greekMap)
            {
                id = id.Replace(kv.Key, kv.Value);
            }

            return id;
        }

        /// <summary>
        /// Procesa una región de texto
        /// </summary>
        private void ProcessTextRegion(XElement text)
        {
            string content = text.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(content))
            {
                // Convertir a comentario de Hekatan
                foreach (var line in content.Split('\n'))
                {
                    _output.AppendLine($"' {line.Trim()}");
                }
            }
        }

        /// <summary>
        /// Procesa una región de imagen (picture)
        /// </summary>
        private void ProcessPictureRegion(XElement picture, XNamespace ns)
        {
            try
            {
                // Buscar el elemento png, jpg, bmp, o cualquier elemento de imagen
                var imageElement = picture.Descendants().FirstOrDefault(e =>
                    e.Name.LocalName == "png" ||
                    e.Name.LocalName == "jpg" ||
                    e.Name.LocalName == "jpeg" ||
                    e.Name.LocalName == "bmp" ||
                    e.Name.LocalName == "gif");

                if (imageElement == null)
                {
                    _warnings.Add("Imagen encontrada pero sin referencia válida");
                    return;
                }

                // Obtener el item-idref (ID de la relación)
                var itemIdRef = imageElement.Attribute("item-idref")?.Value;
                if (string.IsNullOrEmpty(itemIdRef))
                {
                    _warnings.Add("Imagen sin ID de referencia");
                    return;
                }

                // Buscar la imagen en los datos Base64
                if (_imageBase64Data.TryGetValue(itemIdRef, out var imageData))
                {
                    // Obtener dimensiones si están disponibles
                    var width = imageElement.Attribute("display-width")?.Value;
                    var height = imageElement.Attribute("display-height")?.Value;

                    // Escribir comentario con información de la imagen
                    _output.AppendLine();
                    _output.AppendLine($"' ========== IMAGEN ==========");
                    _output.AppendLine($"' Formato: {imageData.format.ToUpper()}");
                    if (!string.IsNullOrEmpty(width) && !string.IsNullOrEmpty(height))
                        _output.AppendLine($"' Dimensiones: {width} x {height}");
                    _output.AppendLine($"' Tamaño Base64: {imageData.base64.Length} caracteres");
                    _output.AppendLine($"' ============================");
                    _output.AppendLine();

                    // Generar sintaxis @{image}
                    _output.AppendLine($"@{{image {imageData.format} base64}}");
                    _output.AppendLine(imageData.base64);
                    _output.AppendLine("@{end image}");
                    _output.AppendLine();
                }
                else
                {
                    _warnings.Add($"No se encontró imagen para ID: {itemIdRef}");
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error al procesar imagen: {ex.Message}");
            }
        }

        /// <summary>
        /// Procesa una región de gráfica (plot) - Genera código Python/Matplotlib
        /// </summary>
        private void ProcessPlotRegion(XElement plot, XNamespace ns)
        {
            try
            {
                // Buscar xyPlot
                var xyPlot = plot.Descendants().FirstOrDefault(e => e.Name.LocalName == "xyPlot");

                if (xyPlot != null)
                {
                    // Extraer información de la gráfica
                    var plotInfo = ExtractPlotInfo(xyPlot);

                    if (plotInfo.HasValidData)
                    {
                        GeneratePythonPlot(plotInfo);
                    }
                    else
                    {
                        // Fallback: mostrar información como comentarios
                        _output.AppendLine();
                        _output.AppendLine("' ========== GRÁFICA XY ==========");
                        _output.AppendLine($"' Variables: {plotInfo.XVariable} vs {plotInfo.YVariable}");
                        _output.AppendLine("' (No se pudo generar código automático)");
                        _output.AppendLine("' ================================");
                        _output.AppendLine();
                    }
                }
                else
                {
                    _warnings.Add("Gráfica de tipo desconocido");
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error al procesar gráfica: {ex.Message}");
            }
        }

        /// <summary>
        /// Información extraída de una gráfica
        /// </summary>
        private class PlotInfo
        {
            public string XVariable { get; set; } = "x";
            public string YVariable { get; set; } = "y";
            public string XStart { get; set; }
            public string XEnd { get; set; }
            public string YStart { get; set; }
            public string YEnd { get; set; }
            public string Title { get; set; }
            public List<TraceInfo> Traces { get; set; } = new List<TraceInfo>();
            public bool HasValidData => !string.IsNullOrEmpty(XVariable) && !string.IsNullOrEmpty(YVariable);
        }

        /// <summary>
        /// Información de una serie/trace de la gráfica
        /// </summary>
        private class TraceInfo
        {
            public string Color { get; set; } = "#0000FF";
            public string LineStyle { get; set; } = "Solid";
            public string Symbol { get; set; } = "none";
            public int LineWeight { get; set; } = 1;
        }

        /// <summary>
        /// Extrae información completa de un xyPlot
        /// </summary>
        private PlotInfo ExtractPlotInfo(XElement xyPlot)
        {
            var info = new PlotInfo();

            // Extraer título
            var title = xyPlot.Descendants().FirstOrDefault(e => e.Name.LocalName == "title");
            if (title != null && !string.IsNullOrWhiteSpace(title.Value))
                info.Title = title.Value.Trim();

            // Extraer traces (series)
            var traces = xyPlot.Descendants().FirstOrDefault(e => e.Name.LocalName == "traces");
            if (traces != null)
            {
                foreach (var trace in traces.Elements().Where(e => e.Name.LocalName == "trace"))
                {
                    var traceInfo = new TraceInfo();
                    var traceStyle = trace.Descendants().FirstOrDefault(e => e.Name.LocalName == "traceStyle");
                    if (traceStyle != null)
                    {
                        traceInfo.Color = traceStyle.Attribute("color")?.Value ?? "#0000FF";
                        traceInfo.LineStyle = traceStyle.Attribute("line-style")?.Value ?? "Solid";
                        traceInfo.Symbol = traceStyle.Attribute("symbol")?.Value ?? "none";
                        int.TryParse(traceStyle.Attribute("line-weight")?.Value, out int lw);
                        traceInfo.LineWeight = lw > 0 ? lw : 1;
                    }
                    info.Traces.Add(traceInfo);
                }
            }

            // Extraer ejes
            var axes = xyPlot.Descendants().FirstOrDefault(e => e.Name.LocalName == "axes");
            if (axes != null)
            {
                // Eje X
                var xAxis = axes.Descendants().FirstOrDefault(e => e.Name.LocalName == "xAxis");
                if (xAxis != null)
                {
                    var xVar = xAxis.Descendants().FirstOrDefault(e => e.Name.LocalName == "id");
                    if (xVar != null)
                        info.XVariable = CleanIdentifier(xVar.Value?.Trim() ?? "x");

                    info.XStart = xAxis.Attribute("start")?.Value;
                    info.XEnd = xAxis.Attribute("end")?.Value;
                }

                // Eje Y
                var yAxis = axes.Descendants().FirstOrDefault(e => e.Name.LocalName == "yAxis");
                if (yAxis != null)
                {
                    var yVar = yAxis.Descendants().FirstOrDefault(e => e.Name.LocalName == "id");
                    if (yVar != null)
                        info.YVariable = CleanIdentifier(yVar.Value?.Trim() ?? "y");

                    info.YStart = yAxis.Attribute("start")?.Value;
                    info.YEnd = yAxis.Attribute("end")?.Value;
                }
            }

            return info;
        }

        /// <summary>
        /// Genera código Python/Matplotlib para la gráfica
        /// </summary>
        private void GeneratePythonPlot(PlotInfo info)
        {
            _output.AppendLine();
            _output.AppendLine($"' Gráfica: {info.YVariable} vs {info.XVariable}");
            _output.AppendLine();
            _output.AppendLine("#columns 1 python");
            _output.AppendLine("import matplotlib.pyplot as plt");
            _output.AppendLine("import numpy as np");
            _output.AppendLine();
            _output.AppendLine($"# Datos de Hekatan (convertir vectores a arrays numpy)");
            _output.AppendLine($"# NOTA: Las variables {info.XVariable} y {info.YVariable} deben estar definidas arriba");
            _output.AppendLine($"# Si son vectores de Hekatan, extraer valores manualmente:");
            _output.AppendLine();

            // Generar datos de ejemplo basados en los rangos
            bool hasXRange = !string.IsNullOrEmpty(info.XStart) && !string.IsNullOrEmpty(info.XEnd);
            bool hasYRange = !string.IsNullOrEmpty(info.YStart) && !string.IsNullOrEmpty(info.YEnd);

            _output.AppendLine($"# Definir los datos (ajustar según las variables de Hekatan)");
            _output.AppendLine($"# Los valores deben coincidir con los vectores definidos arriba");
            _output.AppendLine($"x_data = np.array([2, 2, 6])  # Reemplazar con valores de {info.XVariable}");
            _output.AppendLine($"y_data = np.array([2, 3, 5])  # Reemplazar con valores de {info.YVariable}");
            _output.AppendLine();

            _output.AppendLine("# Crear figura");
            _output.AppendLine("plt.figure(figsize=(8, 6))");
            _output.AppendLine();

            // Generar plot con estilo
            string lineColor = "#00008B";  // Default: DarkBlue
            string lineStyle = "-";
            int lineWidth = 2;

            if (info.Traces.Count > 0)
            {
                var trace = info.Traces[0];
                lineColor = ConvertMathcadColor(trace.Color);
                lineStyle = ConvertLineStyle(trace.LineStyle);
                lineWidth = Math.Max(1, trace.LineWeight);
            }

            _output.AppendLine($"# Graficar datos");
            _output.AppendLine($"plt.plot(x_data, y_data, '{lineStyle}', color='{lineColor}', linewidth={lineWidth}, label='{info.YVariable}')");
            _output.AppendLine();

            // Configurar ejes con etiquetas y unidades
            _output.AppendLine("# Etiquetas de ejes (con unidades)");
            _output.AppendLine($"plt.xlabel('{info.XVariable}', fontsize=12)");
            _output.AppendLine($"plt.ylabel('{info.YVariable}', fontsize=12)");
            _output.AppendLine();

            // Configurar límites si están disponibles
            if (hasXRange)
            {
                _output.AppendLine($"plt.xlim({info.XStart}, {info.XEnd})");
            }
            if (hasYRange)
            {
                _output.AppendLine($"plt.ylim({info.YStart}, {info.YEnd})");
            }

            // Título
            if (!string.IsNullOrEmpty(info.Title))
            {
                _output.AppendLine($"plt.title('{info.Title}', fontsize=14, fontweight='bold')");
            }

            _output.AppendLine();
            _output.AppendLine("# Configuración adicional");
            _output.AppendLine("plt.grid(True, alpha=0.3, linestyle='--')");
            _output.AppendLine("plt.legend(loc='best')");
            _output.AppendLine("plt.tight_layout()");
            _output.AppendLine();
            _output.AppendLine("# Mostrar gráfica");
            _output.AppendLine("plt.show()");
            _output.AppendLine("#end columns");
            _output.AppendLine();
        }

        /// <summary>
        /// Convierte color Mathcad (#FFRRGGBB) a color matplotlib (#RRGGBB)
        /// </summary>
        private static string ConvertMathcadColor(string mathcadColor)
        {
            if (string.IsNullOrEmpty(mathcadColor))
                return "#0000FF";

            // Mathcad usa #AARRGGBB, matplotlib usa #RRGGBB
            if (mathcadColor.StartsWith("#") && mathcadColor.Length == 9)
            {
                // Quitar el alpha (primeros 2 chars después de #)
                return "#" + mathcadColor.Substring(3);
            }

            return mathcadColor;
        }

        /// <summary>
        /// Convierte estilo de línea Mathcad a matplotlib
        /// </summary>
        private static string ConvertLineStyle(string mathcadStyle)
        {
            return mathcadStyle?.ToLower() switch
            {
                "solid" => "-",
                "dash" => "--",
                "dot" => ":",
                "dashdot" => "-.",
                _ => "-"
            };
        }

        /// <summary>
        /// Procesa una región de solve block
        /// </summary>
        private void ProcessSolveBlockRegion(XElement solveblock, XNamespace ns)
        {
            try
            {
                _output.AppendLine();
                _output.AppendLine("' ========== SOLVE BLOCK ==========");

                // Buscar regiones internas
                var regions = solveblock.Descendants().FirstOrDefault(e => e.Name.LocalName == "regions");
                if (regions != null)
                {
                    int constraintCount = 0;
                    string solverType = null;

                    foreach (var region in regions.Elements())
                    {
                        var category = region.Attribute("solve-block-category")?.Value;

                        if (category == "constraint")
                        {
                            constraintCount++;
                            var math = region.Descendants().FirstOrDefault(e => e.Name.LocalName == "math");
                            if (math != null)
                            {
                                // Extraer ecuación (simplificado)
                                var equation = ExtractEquation(math);
                                if (!string.IsNullOrEmpty(equation))
                                    _output.AppendLine($"' Restricción {constraintCount}: {equation}");
                            }
                        }
                        else if (category == "solver")
                        {
                            var math = region.Descendants().FirstOrDefault(e => e.Name.LocalName == "math");
                            if (math != null)
                            {
                                // Buscar keyword (odesolve, solve, etc.)
                                var keyword = math.Descendants().FirstOrDefault(e =>
                                    e.Name.LocalName == "id" &&
                                    e.Attribute("labels")?.Value == "KEYWORD");

                                if (keyword != null)
                                {
                                    solverType = keyword.Value?.Trim();
                                }
                            }
                        }
                    }

                    if (!string.IsNullOrEmpty(solverType))
                        _output.AppendLine($"' Solver: {solverType}");

                    _output.AppendLine($"' Total restricciones: {constraintCount}");
                }

                _output.AppendLine("' (Solve blocks no soportados en Hekatan)");
                _output.AppendLine("' ==================================");
                _output.AppendLine();
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error al procesar solve block: {ex.Message}");
            }
        }

        /// <summary>
        /// Procesa una región de chart component (MathChart de Mathcad Prime)
        /// Los chartComponent contienen gráficas avanzadas con múltiples series
        /// definidas como X[1], Y[1], X[2], Y[2], etc.
        /// </summary>
        private void ProcessChartComponentRegion(XElement chartComponent, XNamespace ns)
        {
            try
            {
                // Estructura de chartComponent:
                // <chartComponent resultRef="N">
                //   <regions>
                //     <region><math><define>X[1] := variable</define></math></region>
                //     <region><math><define>Y[1] := expresion</define></math></region>
                //     ...
                //     <region><chartOleObject item-idref="..."/></region>  <!-- Gráfica OLE -->
                //   </regions>
                //   <InputSection Visibility="..." />
                // </chartComponent>

                var seriesDefinitions = new List<ChartSeriesDefinition>();

                // Buscar todas las regiones con definiciones matemáticas
                var regions = chartComponent.Descendants()
                    .Where(e => e.Name.LocalName == "region")
                    .ToList();

                foreach (var region in regions)
                {
                    // Buscar elemento math
                    var math = region.Elements()
                        .FirstOrDefault(e => e.Name.LocalName == "math");

                    if (math == null) continue;

                    // Buscar define
                    var define = math.Descendants()
                        .FirstOrDefault(e => e.Name.LocalName == "define");

                    if (define == null) continue;

                    // Extraer la definición indexada (X[1], Y[1], etc.)
                    var seriesDef = ExtractChartSeriesDefinition(define);
                    if (seriesDef != null)
                    {
                        seriesDefinitions.Add(seriesDef);
                    }
                }

                // Agrupar por número de serie
                var seriesGroups = seriesDefinitions
                    .GroupBy(s => s.SeriesIndex)
                    .OrderBy(g => g.Key)
                    .ToList();

                if (seriesGroups.Count == 0)
                {
                    _output.AppendLine();
                    _output.AppendLine("' ========== CHART COMPONENT ==========");
                    _output.AppendLine("' (No se encontraron definiciones de series)");
                    _output.AppendLine("' ======================================");
                    _output.AppendLine();
                    return;
                }

                // Generar código Python/Matplotlib para múltiples series
                _output.AppendLine();
                _output.AppendLine("' ========== MATHCHART (Gráfica Avanzada) ==========");
                _output.AppendLine($"' Series encontradas: {seriesGroups.Count}");

                // Mostrar definiciones originales como comentarios
                foreach (var group in seriesGroups)
                {
                    var xDef = group.FirstOrDefault(s => s.AxisType == "X");
                    var yDef = group.FirstOrDefault(s => s.AxisType == "Y");
                    _output.AppendLine($"' Serie {group.Key}: X = {xDef?.Expression ?? "?"}, Y = {yDef?.Expression ?? "?"}");
                }
                _output.AppendLine("' =================================================");
                _output.AppendLine();

                // Generar código Python con matplotlib
                GenerateChartComponentPython(seriesGroups);
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error al procesar chart component: {ex.Message}");
                _output.AppendLine();
                _output.AppendLine("' ========== CHART COMPONENT (ERROR) ==========");
                _output.AppendLine($"' Error: {ex.Message}");
                _output.AppendLine("' =============================================");
                _output.AppendLine();
            }
        }

        /// <summary>
        /// Clase para almacenar definiciones de series de chartComponent
        /// </summary>
        private class ChartSeriesDefinition
        {
            public string AxisType { get; set; }  // "X" o "Y"
            public int SeriesIndex { get; set; }   // 1, 2, 3...
            public string Expression { get; set; } // La expresión completa
            public string Unit { get; set; }       // Unidad si existe
            public string Variable { get; set; }   // Variable base (ej: "t'" o "x_a")
        }

        /// <summary>
        /// Extrae una definición de serie de chart (X[1], Y[1], etc.)
        /// </summary>
        private ChartSeriesDefinition ExtractChartSeriesDefinition(XElement define)
        {
            var children = define.Elements().ToList();
            if (children.Count < 2) return null;

            var leftSide = children[0];
            var rightSide = children[1];

            // Verificar si el lado izquierdo es un indexer: X[1], Y[2], etc.
            // Estructura: <apply><indexer/><id>X</id><real>1</real></apply>
            if (leftSide.Name.LocalName != "apply") return null;

            var applyChildren = leftSide.Elements().ToList();
            if (applyChildren.Count < 3) return null;

            var op = applyChildren[0];
            if (op.Name.LocalName != "indexer") return null;

            // Extraer nombre del eje (X o Y) y el índice
            var axisElement = applyChildren[1];
            var indexElement = applyChildren[2];

            string axisType = ExtractValue(axisElement)?.Trim();
            string indexStr = ExtractValue(indexElement)?.Trim();

            if (string.IsNullOrEmpty(axisType) || string.IsNullOrEmpty(indexStr))
                return null;

            // Solo procesar X e Y
            if (axisType != "X" && axisType != "Y") return null;

            if (!int.TryParse(indexStr, out int seriesIndex))
                return null;

            // Extraer la expresión del lado derecho
            string expression = ExtractExpression(rightSide);
            string unit = null;

            // Si es una división por unidad, extraer la unidad
            // Ejemplo: x_a(t')/mm → expresión=x_a(t'), unit=mm
            if (rightSide.Name.LocalName == "apply")
            {
                var rightChildren = rightSide.Elements().ToList();
                if (rightChildren.Count >= 3 && rightChildren[0].Name.LocalName == "div")
                {
                    var numerator = rightChildren[1];
                    var denominator = rightChildren[2];

                    // Verificar si el denominador es una unidad
                    var labels = denominator.Attribute("labels")?.Value ?? "";
                    if (labels.Contains("UNIT") || denominator.Name.LocalName == "id")
                    {
                        unit = ExtractValue(denominator)?.Trim();
                        expression = ExtractExpression(numerator);
                    }
                }
            }

            return new ChartSeriesDefinition
            {
                AxisType = axisType,
                SeriesIndex = seriesIndex,
                Expression = expression,
                Unit = unit,
                Variable = expression?.Split('(')[0]?.Trim() // Extraer variable base
            };
        }

        /// <summary>
        /// Genera código Python/Matplotlib para chartComponent con múltiples series
        /// </summary>
        private void GenerateChartComponentPython(List<IGrouping<int, ChartSeriesDefinition>> seriesGroups)
        {
            _output.AppendLine("#columns 1 python");
            _output.AppendLine("import matplotlib.pyplot as plt");
            _output.AppendLine("import numpy as np");
            _output.AppendLine();

            // Colores predefinidos para las series
            string[] colors = { "#1f77b4", "#2ca02c", "#9467bd", "#ff7f0e", "#d62728", "#8c564b" };

            _output.AppendLine("# === Definiciones de datos ===");
            _output.AppendLine("# NOTA: Reemplace estos valores con los datos calculados previamente");
            _output.AppendLine();

            // Variable independiente (generalmente la misma para todas las series X)
            var firstX = seriesGroups.FirstOrDefault()?.FirstOrDefault(s => s.AxisType == "X");
            if (firstX != null)
            {
                _output.AppendLine($"# Variable independiente: {firstX.Expression}");
                _output.AppendLine("t = np.linspace(0, 2, 201)  # Ajustar rango según los datos");
                _output.AppendLine();
            }

            // Generar datos de ejemplo para cada serie Y
            _output.AppendLine("# === Datos de las series ===");
            foreach (var group in seriesGroups)
            {
                var yDef = group.FirstOrDefault(s => s.AxisType == "Y");
                if (yDef != null)
                {
                    string unitComment = !string.IsNullOrEmpty(yDef.Unit) ? $" [{yDef.Unit}]" : "";
                    _output.AppendLine($"# Serie {group.Key}: {yDef.Expression}{unitComment}");
                    _output.AppendLine($"y{group.Key} = np.zeros_like(t)  # TODO: Reemplazar con datos reales");
                    _output.AppendLine();
                }
            }

            // Crear la figura
            _output.AppendLine("# === Crear gráfica ===");
            _output.AppendLine("fig, ax = plt.subplots(figsize=(10, 6))");
            _output.AppendLine();

            // Agregar cada serie
            int colorIdx = 0;
            foreach (var group in seriesGroups)
            {
                var yDef = group.FirstOrDefault(s => s.AxisType == "Y");
                if (yDef != null)
                {
                    string color = colors[colorIdx % colors.Length];
                    string label = yDef.Expression;
                    if (!string.IsNullOrEmpty(yDef.Unit))
                        label += $" ({yDef.Unit})";

                    _output.AppendLine($"ax.plot(t, y{group.Key}, '-', color='{color}', linewidth=1.5, label='{label}')");
                    colorIdx++;
                }
            }

            _output.AppendLine();
            _output.AppendLine("# === Configuración de ejes ===");

            // Etiqueta del eje X
            if (firstX != null)
            {
                _output.AppendLine($"ax.set_xlabel('{firstX.Expression}', fontsize=12)");
            }

            // Etiqueta del eje Y (combinar si hay múltiples unidades)
            var yUnits = seriesGroups
                .SelectMany(g => g.Where(s => s.AxisType == "Y" && !string.IsNullOrEmpty(s.Unit)))
                .Select(s => s.Unit)
                .Distinct()
                .ToList();

            if (yUnits.Count > 0)
            {
                _output.AppendLine($"ax.set_ylabel('{string.Join(", ", yUnits)}', fontsize=12)");
            }

            _output.AppendLine();
            _output.AppendLine("# === Estilo ===");
            _output.AppendLine("ax.grid(True, alpha=0.3, linestyle='--')");
            _output.AppendLine("ax.legend(loc='best', fontsize=10)");
            _output.AppendLine("ax.set_title('Gráfica importada de Mathcad Prime', fontsize=14)");
            _output.AppendLine();
            _output.AppendLine("plt.tight_layout()");
            _output.AppendLine("plt.show()");
            _output.AppendLine("#end columns");
            _output.AppendLine();
        }

        /// <summary>
        /// Procesa una región de spec-table (tabla de especificaciones con vectores/matrices)
        /// </summary>
        private void ProcessSpecTableRegion(XElement specTable, XNamespace ns)
        {
            try
            {
                // Procesar cada elemento math hijo directo de spec-table
                // Usar namespace explícito si está disponible
                var mathElements = specTable.Elements().Where(e => e.Name.LocalName == "math").ToList();

                // Debug: si no encontramos elementos, buscar con namespace
                if (mathElements.Count == 0)
                {
                    mathElements = specTable.Elements(ns + "math").ToList();
                }

                // Debug: si todavía no encontramos, buscar en todos los descendientes
                if (mathElements.Count == 0)
                {
                    mathElements = specTable.Descendants().Where(e => e.Name.LocalName == "math").ToList();
                }

                foreach (var math in mathElements)
                {
                    // Buscar define en namespace ml (Mathcad Math Language)
                    var define = math.Descendants(_mlNs + "define").FirstOrDefault();

                    // Si no está en namespace ml, buscar sin namespace
                    if (define == null)
                    {
                        define = math.Descendants().FirstOrDefault(e => e.Name.LocalName == "define");
                    }

                    if (define != null)
                    {
                        string expr = ProcessDefineWithUnit(define);
                        if (!string.IsNullOrWhiteSpace(expr))
                            _output.AppendLine(expr);
                    }
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error al procesar spec-table: {ex.Message}");
            }
        }

        /// <summary>
        /// Procesa una definición con soporte mejorado para unidades
        /// Convierte: x = scale(matrix, unit) a x = [v1; v2; v3]'unit
        /// </summary>
        private string ProcessDefineWithUnit(XElement define)
        {
            var children = define.Elements().ToList();
            if (children.Count < 2) return null;

            // Primer hijo: nombre de la variable
            string varName = ExtractValue(children[0]);

            // Segundo hijo: valor/expresión (puede ser apply con scale)
            var valueElement = children[1];
            string value = null;
            string unit = null;

            // Verificar si es un apply con scale (vector/matrix con unidad)
            if (valueElement.Name.LocalName == "apply")
            {
                var applyChildren = valueElement.Elements().ToList();
                if (applyChildren.Count >= 3 && applyChildren[0].Name.LocalName == "scale")
                {
                    // Es scale: valor * unidad
                    var matrixOrVector = applyChildren[1];
                    var unitElement = applyChildren[2];

                    if (matrixOrVector.Name.LocalName == "matrix")
                    {
                        value = ProcessMatrixForHekatan(matrixOrVector);
                    }
                    else if (matrixOrVector.Name.LocalName == "vector")
                    {
                        value = ProcessVector(matrixOrVector);
                    }
                    else
                    {
                        value = ExtractExpression(matrixOrVector);
                    }

                    // Extraer unidad
                    if (unitElement.Name.LocalName == "id")
                    {
                        unit = unitElement.Value?.Trim();
                    }
                }
            }

            // Si no es scale, procesar normalmente
            if (value == null)
            {
                value = ExtractExpression(valueElement);
            }

            if (string.IsNullOrWhiteSpace(varName) || string.IsNullOrWhiteSpace(value))
                return null;

            // Generar expresión con unidad en formato Hekatan: [1;2;3]'m
            if (!string.IsNullOrEmpty(unit))
                return $"{varName} = {value}'{unit}";
            else
                return $"{varName} = {value}";
        }

        /// <summary>
        /// Procesa una matriz para Hekatan con formato [v1; v2; v3] para vectores columna
        /// En Hekatan:
        /// - Vector columna: [v1; v2; v3]
        /// - Vector fila: [v1, v2, v3] o [v1; v2; v3 | v4; v5; v6] para matrices
        /// - Separador de columnas: ; (punto y coma)
        /// - Separador de filas: | (pipe)
        /// </summary>
        private string ProcessMatrixForHekatan(XElement matrix)
        {
            var rowsAttr = matrix.Attribute("rows");
            var colsAttr = matrix.Attribute("cols");

            if (rowsAttr == null || colsAttr == null)
            {
                _warnings.Add("Matriz sin dimensiones especificadas");
                return "[]";
            }

            int rows = int.Parse(rowsAttr.Value);
            int cols = int.Parse(colsAttr.Value);

            // Obtener todos los valores
            var values = matrix.Elements()
                .Where(e => e.Name.LocalName == "real" || e.Name.LocalName == "id" || e.Name.LocalName == "apply")
                .Select(e => ExtractExpression(e))
                .ToList();

            if (values.Count != rows * cols)
            {
                _warnings.Add($"Matriz con valores incompletos: esperados {rows * cols}, encontrados {values.Count}");
            }

            var sb = new StringBuilder();
            sb.Append("[");

            // Mathcad almacena en column-major order:
            // Para matriz 3x1 (vector columna): valores[0], valores[1], valores[2] -> filas
            // Para matriz 2x3: [0,0], [1,0], [0,1], [1,1], [0,2], [1,2]

            // En Hekatan:
            // - Vector columna (rows x 1): [v1; v2; v3] (punto y coma separa elementos)
            // - Matriz (rows x cols): cada fila separada por |, columnas por ;
            //   [fila1_col1; fila1_col2 | fila2_col1; fila2_col2]

            // Para vector columna (cols=1): simplemente usar ; como separador
            if (cols == 1)
            {
                // Los valores ya están en orden de filas
                sb.Append(string.Join("; ", values));
            }
            else
            {
                // Matriz: convertir de column-major a row-major
                // Mathcad: col0[row0, row1, ...], col1[row0, row1, ...], ...
                // Hekatan: [row0_col0; row0_col1; ... | row1_col0; row1_col1; ...]
                for (int r = 0; r < rows; r++)
                {
                    if (r > 0) sb.Append(" | ");

                    for (int c = 0; c < cols; c++)
                    {
                        if (c > 0) sb.Append("; ");

                        // Índice en column-major: columna * num_filas + fila
                        int idx = c * rows + r;
                        if (idx < values.Count)
                            sb.Append(values[idx]);
                        else
                            sb.Append("0");
                    }
                }
            }

            sb.Append("]");
            return sb.ToString();
        }

        /// <summary>
        /// Extrae una ecuación de un elemento math (simplificado)
        /// </summary>
        private string ExtractEquation(XElement math)
        {
            try
            {
                // Buscar apply con equal
                var equal = math.Descendants().FirstOrDefault(e => e.Name.LocalName == "equal");
                if (equal != null)
                {
                    return "[ecuación diferencial]";
                }

                // Buscar define
                var define = math.Descendants().FirstOrDefault(e => e.Name.LocalName == "define");
                if (define != null)
                {
                    var id = define.Descendants().FirstOrDefault(e => e.Name.LocalName == "id");
                    if (id != null)
                    {
                        return $"{id.Value} = [expresión]";
                    }
                }

                return "[ecuación]";
            }
            catch
            {
                return "[ecuación]";
            }
        }
    }
}
