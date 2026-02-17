// XlsxConverter.cs - Conversor de Excel (.xlsx) a Hekatan (.cpd)
// El formato .xlsx es un archivo ZIP (Open Packaging Conventions) que contiene XML
// Similar a McdxConverter pero para hojas de cálculo Excel

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
    /// Conversor de archivos Excel (.xlsx) a Hekatan (.cpd)
    /// </summary>
    public class XlsxConverter
    {
        private readonly StringBuilder _output = new StringBuilder();
        private readonly List<string> _warnings = new List<string>();
        private readonly XNamespace _ssNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        private readonly XNamespace _rNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private string[] _sharedStrings;
        private Dictionary<string, string> _sheetNames = new Dictionary<string, string>();
        private string _excelVersion = "Desconocida";

        // Estilos de Excel
        private Dictionary<int, CellFont> _fonts = new Dictionary<int, CellFont>();
        private Dictionary<int, CellFill> _fills = new Dictionary<int, CellFill>();
        private Dictionary<int, CellBorder> _borders = new Dictionary<int, CellBorder>();
        private Dictionary<int, CellStyle> _cellStyles = new Dictionary<int, CellStyle>();

        /// <summary>
        /// Lista de advertencias generadas durante la conversión
        /// </summary>
        public IReadOnlyList<string> Warnings => _warnings.AsReadOnly();

        /// <summary>
        /// Versión de Excel detectada
        /// </summary>
        public string ExcelVersion => _excelVersion;

        /// <summary>
        /// Hojas disponibles en el archivo Excel
        /// </summary>
        public IReadOnlyDictionary<string, string> SheetNames => _sheetNames;

        /// <summary>
        /// Convierte un archivo .xlsx a formato .cpd (string)
        /// </summary>
        /// <param name="xlsxPath">Ruta al archivo .xlsx</param>
        /// <param name="sheetName">Nombre de la hoja a convertir (null = todas)</param>
        /// <returns>Contenido en formato Hekatan</returns>
        public string Convert(string xlsxPath, string sheetName = null)
        {
            if (!File.Exists(xlsxPath))
                throw new FileNotFoundException($"Archivo no encontrado: {xlsxPath}");

            _output.Clear();
            _warnings.Clear();
            _sheetNames.Clear();
            _excelVersion = "Desconocida";

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

                using (var archive = ZipFile.OpenRead(tempPath))
                {
                    // Extraer versión de Excel de los metadatos
                    ExtractExcelVersion(archive);

                    // Cargar sharedStrings
                    LoadSharedStrings(archive);

                    // Cargar estilos (fuentes, colores, bordes)
                    LoadStyles(archive);

                    // Cargar nombres de hojas
                    LoadSheetNames(archive);

                    // Escribir encabezado
                    _output.AppendLine("' ============================================");
                    _output.AppendLine($"' Importado de Excel (.xlsx)");
                    _output.AppendLine($"' Versión: {_excelVersion}");
                    _output.AppendLine($"' Archivo: {Path.GetFileName(xlsxPath)}");
                    _output.AppendLine($"' Fecha: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
                    _output.AppendLine($"' Hojas: {_sheetNames.Count}");
                    _output.AppendLine("' ============================================");
                    _output.AppendLine();

                    // Convertir hojas
                    if (string.IsNullOrEmpty(sheetName))
                    {
                        // Convertir todas las hojas
                        foreach (var sheet in _sheetNames)
                        {
                            ConvertSheet(archive, sheet.Key, sheet.Value);
                        }
                    }
                    else
                    {
                        // Buscar la hoja específica
                        var matchingSheet = _sheetNames.FirstOrDefault(s =>
                            s.Value.Equals(sheetName, StringComparison.OrdinalIgnoreCase));

                        if (matchingSheet.Key != null)
                        {
                            ConvertSheet(archive, matchingSheet.Key, matchingSheet.Value);
                        }
                        else
                        {
                            _warnings.Add($"Hoja '{sheetName}' no encontrada");
                        }
                    }
                }

                // Limpiar archivo temporal
                if (tempPath != xlsxPath && File.Exists(tempPath))
                {
                    try { File.Delete(tempPath); } catch { }
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error durante la conversión: {ex.Message}");
            }

            return _output.ToString();
        }

        private void ExtractExcelVersion(ZipArchive archive)
        {
            try
            {
                var appEntry = archive.GetEntry("docProps/app.xml");
                if (appEntry != null)
                {
                    using (var stream = appEntry.Open())
                    {
                        var doc = XDocument.Load(stream);
                        var ns = doc.Root.GetDefaultNamespace();
                        var appVersion = doc.Descendants(ns + "AppVersion").FirstOrDefault()?.Value;
                        var application = doc.Descendants(ns + "Application").FirstOrDefault()?.Value;

                        if (!string.IsNullOrEmpty(application))
                            _excelVersion = application + (appVersion != null ? $" {appVersion}" : "");
                    }
                }
            }
            catch { }
        }

        private void LoadSharedStrings(ZipArchive archive)
        {
            var ssEntry = archive.GetEntry("xl/sharedStrings.xml");
            if (ssEntry == null)
            {
                _sharedStrings = new string[0];
                return;
            }

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

        private void LoadSheetNames(ZipArchive archive)
        {
            var wbEntry = archive.GetEntry("xl/workbook.xml");
            if (wbEntry == null) return;

            using (var stream = wbEntry.Open())
            {
                var doc = XDocument.Load(stream);
                var sheets = doc.Descendants(_ssNs + "sheet");
                int index = 1;
                foreach (var sheet in sheets)
                {
                    var name = sheet.Attribute("name")?.Value ?? $"Hoja{index}";
                    var sheetFile = $"xl/worksheets/sheet{index}.xml";
                    _sheetNames[sheetFile] = name;
                    index++;
                }
            }
        }

        private void ConvertSheet(ZipArchive archive, string sheetFile, string sheetName)
        {
            var entry = archive.GetEntry(sheetFile);
            if (entry == null)
            {
                _warnings.Add($"No se encontró el archivo de hoja: {sheetFile}");
                return;
            }

            _output.AppendLine($"\"<hr/>");
            _output.AppendLine($"\"{sheetName.ToUpper()}");
            _output.AppendLine($"'<h2 style=\"color:#217346;\">{sheetName}</h2>");
            _output.AppendLine($"'<div style=\"overflow-x:auto;\">");
            _output.AppendLine($"'<table style=\"border-collapse:collapse; font-family:Calibri,sans-serif; font-size:11pt; margin:10px 0;\">");
            _output.AppendLine();

            using (var stream = entry.Open())
            {
                var doc = XDocument.Load(stream);
                var rows = doc.Descendants(_ssNs + "row").ToList();

                // ==================================================================
                // PASO 1: Generar tabla HTML visual completa con TODO el formato
                // ==================================================================
                foreach (var row in rows)
                {
                    _output.AppendLine("'<tr>");
                    foreach (var cell in row.Elements(_ssNs + "c"))
                    {
                        var cellValue = GetCellDisplayValue(cell);
                        var styleIdx = cell.Attribute("s")?.Value;
                        var styleAttr = GetCellStyleAttribute(styleIdx);
                        _output.AppendLine($"'<td{styleAttr}>{EscapeHtml(cellValue)}</td>");
                    }
                    _output.AppendLine("'</tr>");
                }
                _output.AppendLine("'</table>");
                _output.AppendLine("'</div>");
                _output.AppendLine();

                // Estructuras para almacenar datos de celdas
                var cellValues = new Dictionary<string, string>();
                var cellFormulas = new Dictionary<string, string>();
                var cellLabels = new Dictionary<string, string>();  // cellRef -> label (nombre variable)
                var cellUnits = new Dictionary<string, string>();   // cellRef -> unidad
                var constants = new List<(string varName, string value, string unit, string label)>();
                var formulas = new List<(string varName, string formula, string unit, string label, string cellRef)>();
                var headers = new List<(int rowNum, string text)>();

                // Primera pasada: recopilar todos los valores, fórmulas y etiquetas
                foreach (var row in rows)
                {
                    var rowNum = int.Parse(row.Attribute("r")?.Value ?? "0");
                    var rowCells = row.Elements(_ssNs + "c").ToList();

                    foreach (var cell in rowCells)
                    {
                        var cellRef = cell.Attribute("r")?.Value;
                        if (string.IsNullOrEmpty(cellRef)) continue;

                        var type = cell.Attribute("t")?.Value;
                        var valueElem = cell.Element(_ssNs + "v");
                        var formulaElem = cell.Element(_ssNs + "f");

                        string value = null;
                        string formula = null;

                        if (valueElem != null)
                        {
                            if (type == "s" && _sharedStrings.Length > 0)
                            {
                                if (int.TryParse(valueElem.Value, out int ssIndex) && ssIndex < _sharedStrings.Length)
                                    value = _sharedStrings[ssIndex];
                            }
                            else
                            {
                                value = valueElem.Value;
                            }
                        }

                        if (formulaElem != null)
                            formula = formulaElem.Value;

                        if (value != null)
                            cellValues[cellRef] = value;
                        if (formula != null)
                            cellFormulas[cellRef] = formula;
                    }

                    // Detectar encabezados (fila con solo texto en primera celda)
                    if (rowCells.Count > 0)
                    {
                        var firstCellRef = rowCells.First().Attribute("r")?.Value;
                        var firstValue = firstCellRef != null && cellValues.ContainsKey(firstCellRef)
                            ? cellValues[firstCellRef] : null;

                        bool isHeader = !string.IsNullOrEmpty(firstValue) && IsTextOnly(firstValue) &&
                            rowCells.Skip(1).All(c => {
                                var r = c.Attribute("r")?.Value;
                                return r == null || !cellValues.ContainsKey(r) || string.IsNullOrWhiteSpace(cellValues[r]);
                            });

                        if (isHeader)
                            headers.Add((rowNum, firstValue));
                    }
                }

                // Segunda pasada: identificar etiquetas y unidades para cada celda numérica
                foreach (var cellRef in cellValues.Keys.ToList())
                {
                    var value = cellValues[cellRef];
                    if (!IsNumeric(value) && !cellFormulas.ContainsKey(cellRef)) continue;

                    // Buscar etiqueta (celda a la izquierda)
                    var labelRef = GetLeftCell(cellRef);
                    if (labelRef != null && cellValues.ContainsKey(labelRef) && IsTextOnly(cellValues[labelRef]))
                    {
                        cellLabels[cellRef] = cellValues[labelRef];
                    }

                    // Buscar unidad (celda a la derecha)
                    var unitRef = GetRightCell(cellRef);
                    if (unitRef != null && cellValues.ContainsKey(unitRef) && IsUnit(cellValues[unitRef]))
                    {
                        cellUnits[cellRef] = cellValues[unitRef];
                    }
                }

                // Tercera pasada: separar constantes de fórmulas
                var processedVarNames = new HashSet<string>();
                foreach (var row in rows)
                {
                    foreach (var cell in row.Elements(_ssNs + "c"))
                    {
                        var cellRef = cell.Attribute("r")?.Value;
                        if (string.IsNullOrEmpty(cellRef)) continue;

                        var hasFormula = cellFormulas.ContainsKey(cellRef);
                        var hasValue = cellValues.ContainsKey(cellRef);
                        if (!hasFormula && !hasValue) continue;

                        var value = hasValue ? cellValues[cellRef] : null;
                        var label = cellLabels.ContainsKey(cellRef) ? cellLabels[cellRef] : null;
                        var unit = cellUnits.ContainsKey(cellRef) ? cellUnits[cellRef] : null;
                        var varName = ConvertToVariableName(label ?? cellRef);

                        // Evitar duplicados
                        if (processedVarNames.Contains(varName)) continue;

                        if (hasFormula)
                        {
                            var formula = cellFormulas[cellRef];
                            formulas.Add((varName, formula, unit, label, cellRef));
                            processedVarNames.Add(varName);
                        }
                        else if (hasValue && IsNumeric(value))
                        {
                            constants.Add((varName, value, unit, label));
                            processedVarNames.Add(varName);
                        }
                    }
                }

                // Generar código Hekatan limpio y compacto

                // 1. Sección de DATOS (constantes) - solo las que tienen label
                // Nota sobre keywords de Hekatan:
                //   #val  = Solo muestra el VALOR (sin nombre de variable ni ecuación)
                //   #equ  = Muestra ecuación completa con sustitución (por defecto)
                //   #noc  = No calcula, solo define variables
                //   #hide/#show = Ocultar/mostrar secciones
                //   #nosub = Solo variables sin sustitución
                //
                // Sintaxis de unidades: h = 25cm (valor pegado a unidad)
                // Conversión de unidades: h = 25cm|m (entrada en cm, salida en m)
                var labeledConstants = constants.Where(c => !string.IsNullOrEmpty(c.label)).ToList();
                if (labeledConstants.Count > 0)
                {
                    _output.AppendLine("\"DATOS DE ENTRADA");
                    // Usar #nosub para mostrar solo la variable y su valor, sin sustituciones
                    _output.AppendLine("#nosub");

                    foreach (var (varName, value, unit, label) in labeledConstants)
                    {
                        var cleanValue = ConvertScientificNotation(value);
                        // Sintaxis Hekatan: valor + unidad (pegados)
                        // Ejemplo: h = 25cm (asigna 25 centímetros)
                        var calcpadUnit = ConvertToHekatanUnit(unit);
                        if (!string.IsNullOrEmpty(calcpadUnit))
                            _output.AppendLine($"{varName} = {cleanValue}{calcpadUnit}");
                        else
                            _output.AppendLine($"{varName} = {cleanValue}");
                    }

                    // Volver al modo normal para cálculos
                    _output.AppendLine("#varsub");
                    _output.AppendLine();
                }

                // 2. Sección de CÁLCULOS - solo fórmulas con labels (las importantes)
                var labeledFormulas = formulas.Where(f => !string.IsNullOrEmpty(f.label)).ToList();
                if (labeledFormulas.Count > 0)
                {
                    _output.AppendLine("\"CÁLCULOS");

                    // Ordenar por dependencia
                    var orderedFormulas = OrderFormulasByDependency(labeledFormulas, cellValues, cellLabels);

                    foreach (var (varName, formula, unit, label, cellRef) in orderedFormulas)
                    {
                        var calcpadFormula = ConvertExcelFormula(formula, cellValues, cellLabels);
                        _output.AppendLine($"{varName} = {calcpadFormula}");
                    }
                    _output.AppendLine();
                }

                // 3. Si no hay labels pero hay fórmulas, mostrar las más importantes (totales, etc.)
                if (labeledFormulas.Count == 0 && formulas.Count > 0)
                {
                    _output.AppendLine("\"CÁLCULOS");

                    // Filtrar solo fórmulas "importantes" (SUM, totales, o las últimas de cada columna)
                    var importantFormulas = formulas
                        .Where(f => f.formula.Contains("SUM", StringComparison.OrdinalIgnoreCase) ||
                                   f.varName.Contains("total", StringComparison.OrdinalIgnoreCase) ||
                                   f.varName.Contains("min", StringComparison.OrdinalIgnoreCase) ||
                                   f.varName.Contains("max", StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    // Si no hay importantes, tomar las primeras 10
                    if (importantFormulas.Count == 0)
                        importantFormulas = formulas.Take(10).ToList();

                    var orderedFormulas = OrderFormulasByDependency(importantFormulas, cellValues, cellLabels);

                    foreach (var (varName, formula, unit, label, cellRef) in orderedFormulas)
                    {
                        var calcpadFormula = ConvertExcelFormula(formula, cellValues, cellLabels);
                        _output.AppendLine($"{varName} = {calcpadFormula}");
                    }
                    _output.AppendLine();
                }
            }

            _output.AppendLine();
        }

        private List<(string varName, string formula, string unit, string label, string cellRef)> OrderFormulasByDependency(
            List<(string varName, string formula, string unit, string label, string cellRef)> formulas,
            Dictionary<string, string> cellValues,
            Dictionary<string, string> cellLabels)
        {
            // Crear mapa de dependencias
            var varToFormula = formulas.ToDictionary(f => f.varName, f => f);
            var dependencies = new Dictionary<string, HashSet<string>>();

            foreach (var (varName, formula, _, _, _) in formulas)
            {
                var deps = new HashSet<string>();
                // Encontrar referencias de celda en la fórmula
                var matches = Regex.Matches(formula, @"\$?([A-Z]+)\$?(\d+)");
                foreach (Match m in matches)
                {
                    var cellRef = m.Groups[1].Value + m.Groups[2].Value;
                    var depVarName = cellLabels.ContainsKey(cellRef)
                        ? ConvertToVariableName(cellLabels[cellRef])
                        : ConvertToVariableName(cellRef);
                    if (depVarName != varName)
                        deps.Add(depVarName);
                }
                dependencies[varName] = deps;
            }

            // Topological sort simple
            var result = new List<(string varName, string formula, string unit, string label, string cellRef)>();
            var visited = new HashSet<string>();
            var visiting = new HashSet<string>();

            void Visit(string varName)
            {
                if (visited.Contains(varName)) return;
                if (visiting.Contains(varName)) return; // Ciclo detectado, ignorar

                visiting.Add(varName);

                if (dependencies.ContainsKey(varName))
                {
                    foreach (var dep in dependencies[varName])
                    {
                        if (varToFormula.ContainsKey(dep))
                            Visit(dep);
                    }
                }

                visiting.Remove(varName);
                visited.Add(varName);

                if (varToFormula.ContainsKey(varName))
                    result.Add(varToFormula[varName]);
            }

            foreach (var varName in varToFormula.Keys)
                Visit(varName);

            return result;
        }

        private string ConvertExcelFormula(string formula, Dictionary<string, string> cellValues, Dictionary<string, string> cellLabels)
        {
            if (string.IsNullOrEmpty(formula)) return "0";

            var result = formula;

            // Quitar el signo + al inicio
            if (result.StartsWith("+"))
                result = result.Substring(1);

            // Convertir notación científica (1.5E-2 -> 0.015) antes de otras conversiones
            result = ConvertScientificNotation(result);

            // Convertir funciones de Excel a Hekatan
            result = Regex.Replace(result, @"SUM\(([^)]+)\)", m => ConvertSumRange(m.Groups[1].Value, cellLabels, cellValues), RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"SQRT\(", "sqr(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"ABS\(", "abs(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"SIN\(", "sin(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"COS\(", "cos(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"TAN\(", "tan(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"PI\(\)", "π", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"POWER\(([^,]+),([^)]+)\)", "$1^($2)", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"LOG\(", "ln(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"LOG10\(", "log(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"EXP\(", "e^(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"MIN\(", "min(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"MAX\(", "max(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"ROUND\(([^,]+),([^)]+)\)", "round($1;$2)", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"INT\(", "floor(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"CEILING\(", "ceiling(", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"FLOOR\(", "floor(", RegexOptions.IgnoreCase);

            // Convertir IF con strings a comentarios (Hekatan no soporta strings en IF)
            // IF(cond,"str1","str2") -> comentar como fórmula condicional
            result = Regex.Replace(result, @"IF\(([^,]+),""[^""]*"",""[^""]*""\)", m => {
                // Extraer solo la condición y comentar
                var cond = Regex.Match(m.Value, @"IF\(([^,]+),").Groups[1].Value;
                return $"({cond})"; // Solo evaluar la condición numérica
            }, RegexOptions.IgnoreCase);

            // IF normal sin strings
            result = Regex.Replace(result, @"IF\(", "if(", RegexOptions.IgnoreCase);

            // Convertir operadores de comparación de Excel a Hekatan
            result = result.Replace(">=", "≥");
            result = result.Replace("<=", "≤");
            result = result.Replace("<>", "≠");

            // Convertir min/max con funciones anidadas - procesar recursivamente
            result = ConvertMinMaxFunctions(result, cellValues, cellLabels);

            // Convertir referencias de celda a nombres de variable o valores directos
            result = Regex.Replace(result, @"\$?([A-Z]+)\$?(\d+)", m => {
                var cellRef = m.Groups[1].Value + m.Groups[2].Value;

                // Si tiene label, usar el nombre de variable
                if (cellLabels.ContainsKey(cellRef))
                    return ConvertToVariableName(cellLabels[cellRef]);

                // Si tiene valor numérico pero no label, usar el valor directamente
                if (cellValues != null && cellValues.ContainsKey(cellRef))
                {
                    var value = cellValues[cellRef];
                    if (double.TryParse(value, out _))
                        return value; // Usar el valor numérico directo
                }

                // Fallback: usar nombre de celda como variable
                return ConvertToVariableName(cellRef);
            });

            // Limpiar espacios extras
            result = result.Replace(" ", "");

            return result;
        }

        private string ConvertSumRange(string range, Dictionary<string, string> cellLabels, Dictionary<string, string> cellValues = null)
        {
            // Convertir SUM(A1:A5) a var1+var2+var3+... (solo celdas con valor numérico)
            var parts = range.Split(':');
            if (parts.Length != 2) return range;

            var startMatch = Regex.Match(parts[0], @"([A-Z]+)(\d+)");
            var endMatch = Regex.Match(parts[1], @"([A-Z]+)(\d+)");

            if (!startMatch.Success || !endMatch.Success) return range;

            var col = startMatch.Groups[1].Value;
            var startRow = int.Parse(startMatch.Groups[2].Value);
            var endRow = int.Parse(endMatch.Groups[2].Value);

            var cells = new List<string>();
            for (int i = startRow; i <= endRow; i++)
            {
                var cellRef = $"{col}{i}";

                // Si tenemos cellValues, verificar si la celda tiene valor numérico
                if (cellValues != null)
                {
                    if (!cellValues.ContainsKey(cellRef))
                        continue; // Celda vacía, omitir

                    var value = cellValues[cellRef];
                    if (!double.TryParse(value, out _))
                        continue; // No es numérico, omitir
                }

                // Usar el label si existe, sino usar la referencia de celda
                if (cellLabels.ContainsKey(cellRef))
                    cells.Add(ConvertToVariableName(cellLabels[cellRef]));
                else
                    cells.Add(ConvertToVariableName(cellRef));
            }

            if (cells.Count == 0) return "0";
            if (cells.Count == 1) return cells[0];
            return "(" + string.Join("+", cells) + ")";
        }

        private string ConvertToVariableName(string input)
        {
            if (string.IsNullOrEmpty(input)) return "x";

            // Reemplazar caracteres especiales
            var result = input
                .Replace(" ", "_")
                .Replace("'", "")
                .Replace("\"", "")
                .Replace("(", "")
                .Replace(")", "")
                .Replace("[", "")
                .Replace("]", "")
                .Replace("/", "_")
                .Replace("\\", "_")
                .Replace("-", "_")
                .Replace("+", "_")
                .Replace("*", "_")
                .Replace("=", "_")
                .Replace(".", "_")
                .Replace(",", "_")
                .Replace(":", "_")
                .Replace(";", "_")
                .Replace("°", "")
                .Replace("²", "2")
                .Replace("³", "3")
                .Replace("≤", "")
                .Replace("≥", "")
                .Replace("∑", "Sum")
                .Replace("α", "alpha")
                .Replace("β", "beta")
                .Replace("γ", "gamma")
                .Replace("δ", "delta")
                .Replace("φ", "phi")
                .Replace("ρ", "rho")
                .Replace("σ", "sigma")
                .Replace("τ", "tau")
                .Replace("ω", "omega")
                .Replace("π", "pi")
                .Replace("μ", "mu")
                .Replace("ν", "nu")
                .Replace("λ", "lambda")
                .Replace("η", "eta")
                .Replace("θ", "theta");

            // Eliminar caracteres no válidos (excepto letras, números y guión bajo)
            result = Regex.Replace(result, @"[^a-zA-Z0-9_]", "");

            // Reemplazar guiones bajos al inicio (Hekatan no permite _ al inicio)
            while (result.Length > 0 && result[0] == '_')
                result = result.Length > 1 ? result.Substring(1) : "v";

            // Asegurar que no empiece con número (agregar 'v' en lugar de '_')
            if (result.Length > 0 && char.IsDigit(result[0]))
                result = "v" + result;

            // Limitar longitud
            if (result.Length > 30)
                result = result.Substring(0, 30);

            if (string.IsNullOrEmpty(result))
                result = "x";

            return result;
        }

        private string GetLeftCell(string cellRef)
        {
            var match = Regex.Match(cellRef, @"([A-Z]+)(\d+)");
            if (!match.Success) return null;

            var col = match.Groups[1].Value;
            var row = match.Groups[2].Value;

            if (col.Length == 1 && col[0] > 'A')
                return ((char)(col[0] - 1)).ToString() + row;

            return null;
        }

        private string GetRightCell(string cellRef)
        {
            var match = Regex.Match(cellRef, @"([A-Z]+)(\d+)");
            if (!match.Success) return null;

            var col = match.Groups[1].Value;
            var row = match.Groups[2].Value;

            if (col.Length == 1 && col[0] < 'Z')
                return ((char)(col[0] + 1)).ToString() + row;

            return null;
        }

        private bool IsNumeric(string value)
        {
            return double.TryParse(value, out _);
        }

        private bool IsTextOnly(string value)
        {
            if (string.IsNullOrEmpty(value)) return false;
            // Es texto si no es puramente numérico
            return !double.TryParse(value, out _);
        }

        private bool IsUnit(string value)
        {
            if (string.IsNullOrEmpty(value)) return false;

            // Lista de unidades comunes
            var commonUnits = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "m", "cm", "mm", "km", "in", "ft", "yd",
                "m2", "m²", "cm2", "cm²", "mm2", "mm²",
                "m3", "m³", "cm3", "cm³", "mm3", "mm³",
                "kg", "g", "t", "ton", "tonf", "kgf", "N", "kN", "MN",
                "Pa", "kPa", "MPa", "GPa", "kg/cm2", "kg/cm²", "t/m2", "t/m²",
                "N/m", "kN/m", "N/m2", "kN/m2",
                "t-m", "kN-m", "kg-cm", "tonf-m",
                "s", "min", "h", "seg",
                "rad", "deg", "°",
                "ksi", "psi",
                "u", "OK", "SISM", "COMP"
            };

            return commonUnits.Contains(value.Trim());
        }

        private string EscapeHtml(string text)
        {
            return text
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;");
        }

        /// <summary>
        /// Convierte unidad de Excel a formato Hekatan
        /// </summary>
        private string ConvertToHekatanUnit(string unit)
        {
            if (string.IsNullOrEmpty(unit)) return null;

            var u = unit.Trim();

            // Mapa de unidades comunes de Excel a Hekatan
            var unitMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                // Longitud
                { "m", "m" }, { "cm", "cm" }, { "mm", "mm" }, { "km", "km" },
                { "in", "in" }, { "ft", "ft" }, { "yd", "yd" },
                // Área
                { "m2", "m^2" }, { "m²", "m^2" }, { "cm2", "cm^2" }, { "cm²", "cm^2" },
                { "mm2", "mm^2" }, { "mm²", "mm^2" },
                // Volumen / Inercia
                { "m3", "m^3" }, { "m³", "m^3" }, { "cm3", "cm^3" }, { "cm³", "cm^3" },
                { "mm3", "mm^3" }, { "mm³", "mm^3" },
                { "m4", "m^4" }, { "cm4", "cm^4" }, { "mm4", "mm^4" },
                // Masa
                { "kg", "kg" }, { "g", "g" }, { "t", "t" }, { "ton", "t" },
                // Fuerza
                { "N", "N" }, { "kN", "kN" }, { "MN", "MN" },
                { "kgf", "kgf" }, { "tonf", "tf" }, { "tf", "tf" },
                // Presión
                { "Pa", "Pa" }, { "kPa", "kPa" }, { "MPa", "MPa" }, { "GPa", "GPa" },
                { "kg/cm2", "kgf/cm^2" }, { "kg/cm²", "kgf/cm^2" },
                { "t/m2", "tf/m^2" }, { "t/m²", "tf/m^2" },
                // Momento
                { "N·m", "N*m" }, { "kN·m", "kN*m" }, { "kN-m", "kN*m" },
                { "kg·m", "kgf*m" }, { "t·m", "tf*m" }, { "t-m", "tf*m" },
                // Tiempo
                { "s", "s" }, { "min", "min" }, { "h", "h" },
                // Ángulo
                { "rad", "rad" }, { "deg", "°" }, { "°", "°" }
            };

            if (unitMap.TryGetValue(u, out var calcpadUnit))
                return calcpadUnit;

            // Si no está en el mapa, devolver null (no usar unidad)
            return null;
        }

        /// <summary>
        /// Convierte notación científica a decimal (1.5E-2 -> 0.015)
        /// </summary>
        private string ConvertScientificNotation(string input)
        {
            // Patrón para notación científica: número E exponente
            return Regex.Replace(input, @"(\d+\.?\d*)[Ee]([+-]?\d+)", m => {
                if (double.TryParse(m.Value, System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out double val))
                {
                    // Formatear sin notación científica
                    return val.ToString("0.##########", System.Globalization.CultureInfo.InvariantCulture);
                }
                return m.Value;
            });
        }

        /// <summary>
        /// Convierte funciones min/max manejando anidamiento y separadores
        /// </summary>
        private string ConvertMinMaxFunctions(string input, Dictionary<string, string> cellValues, Dictionary<string, string> cellLabels)
        {
            var result = input;

            // Primero: convertir MIN/MAX a minúsculas
            result = Regex.Replace(result, @"\bMIN\b", "min", RegexOptions.IgnoreCase);
            result = Regex.Replace(result, @"\bMAX\b", "max", RegexOptions.IgnoreCase);

            // Procesar funciones min/max de adentro hacia afuera
            // Usar un enfoque iterativo para manejar anidamiento
            int maxIterations = 10;
            int iteration = 0;
            string prevResult;

            do
            {
                prevResult = result;

                // Buscar min/max con contenido sin paréntesis internos
                result = Regex.Replace(result, @"(min|max)\(([^()]+)\)", m => {
                    var funcName = m.Groups[1].Value.ToLower();
                    var args = m.Groups[2].Value;

                    // Convertir : a ; (rango Excel a separador Hekatan)
                    // Convertir , a ; (separador Excel a Hekatan)
                    args = args.Replace(":", ";").Replace(",", ";");

                    return $"{funcName}({args})";
                }, RegexOptions.IgnoreCase);

                iteration++;
            }
            while (iteration < maxIterations && result != prevResult);

            return result;
        }

        /// <summary>
        /// Obtiene la lista de nombres de hojas disponibles
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

                    using (var stream = wbEntry.Open())
                    {
                        var doc = XDocument.Load(stream);
                        var ns = doc.Root.GetDefaultNamespace();
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

        private string GetCellDisplayValue(XElement cell)
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

        private string GetCellStyleAttribute(string styleIndex)
        {
            if (string.IsNullOrEmpty(styleIndex))
                return " style=\"padding:5px 8px; border:1px solid #ddd;\"";

            if (!int.TryParse(styleIndex, out int idx) || !_cellStyles.ContainsKey(idx))
                return " style=\"padding:5px 8px; border:1px solid #ddd;\"";

            var style = _cellStyles[idx];
            var css = new List<string>();
            css.Add("padding:5px 8px");
            css.Add("border:1px solid #ddd");

            // Fuente
            if (_fonts.ContainsKey(style.FontId))
            {
                var font = _fonts[style.FontId];
                if (font.Bold) css.Add("font-weight:bold");
                if (font.Italic) css.Add("font-style:italic");
                if (!string.IsNullOrEmpty(font.Color))
                {
                    var color = font.Color.Length > 6 ? font.Color.Substring(font.Color.Length - 6) : font.Color;
                    if (color != "000000") // Solo si no es negro por defecto
                        css.Add($"color:#{color}");
                }
            }

            // Relleno de fondo
            if (_fills.ContainsKey(style.FillId))
            {
                var fill = _fills[style.FillId];
                if (!string.IsNullOrEmpty(fill.BackgroundColor))
                {
                    var bgColor = fill.BackgroundColor.Length > 6 ?
                        fill.BackgroundColor.Substring(fill.BackgroundColor.Length - 6) :
                        fill.BackgroundColor;
                    if (bgColor != "FFFFFF" && bgColor != "ffffff") // Solo si no es blanco por defecto
                        css.Add($"background-color:#{bgColor}");
                }
            }

            // Alineación
            if (!string.IsNullOrEmpty(style.HAlign))
                css.Add($"text-align:{style.HAlign}");

            return $" style=\"{string.Join("; ", css)}\"";
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

        // Clases helper para estilos
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
