// SMathConverter.cs - Conversor de SMath Studio (.sm) a Hekatan (.cpd)
// SMath Studio usa notación polaca inversa (RPN) en su formato XML

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Hekatan.Common
{
    /// <summary>
    /// Conversor de archivos SMath Studio (.sm) a Hekatan (.cpd)
    /// Implementa un evaluador RPN para interpretar las expresiones matemáticas
    /// </summary>
    public class SMathConverter
    {
        private readonly StringBuilder _output = new StringBuilder();
        private readonly List<string> _warnings = new List<string>();
        private string _smathVersion = "Desconocida";

        /// <summary>
        /// Lista de advertencias generadas durante la conversión
        /// </summary>
        public IReadOnlyList<string> Warnings => _warnings.AsReadOnly();

        /// <summary>
        /// Versión de SMath Studio detectada en el archivo
        /// </summary>
        public string SMathVersion => _smathVersion;

        /// <summary>
        /// Convierte un archivo .sm a formato .cpd (string)
        /// </summary>
        public string Convert(string smPath)
        {
            if (!File.Exists(smPath))
                throw new FileNotFoundException($"Archivo no encontrado: {smPath}");

            _output.Clear();
            _warnings.Clear();
            _smathVersion = "Desconocida";

            try
            {
                var doc = XDocument.Load(smPath);
                var root = doc.Root;

                if (root == null)
                    throw new Exception("El archivo .sm no tiene un elemento raíz válido");

                // Extract version info
                ExtractSMathVersion(root);

                // Write header
                _output.AppendLine("' ============================================");
                _output.AppendLine($"' Importado de SMath Studio (.sm)");
                _output.AppendLine($"' Versión SMath: {_smathVersion}");
                _output.AppendLine($"' Archivo: {Path.GetFileName(smPath)}");
                _output.AppendLine($"' Fecha: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
                _output.AppendLine("' ============================================");
                _output.AppendLine();

                // Process the worksheet
                ProcessWorksheet(root);

                return _output.ToString();
            }
            catch (Exception ex)
            {
                throw new Exception($"Error al procesar archivo SMath: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Convierte y guarda a archivo
        /// </summary>
        public string ConvertAndSave(string smPath, string outputPath = null)
        {
            if (string.IsNullOrEmpty(outputPath))
                outputPath = Path.ChangeExtension(smPath, ".cpd");

            string content = Convert(smPath);
            File.WriteAllText(outputPath, content, Encoding.UTF8);
            return outputPath;
        }

        /// <summary>
        /// Extrae la versión de SMath Studio desde el processing instruction
        /// </summary>
        private void ExtractSMathVersion(XElement root)
        {
            try
            {
                // Look in processing instructions first
                var doc = root.Document;
                if (doc != null)
                {
                    foreach (var node in doc.Nodes())
                    {
                        if (node is XProcessingInstruction pi && pi.Target == "application")
                        {
                            // Parse: progid="SMath Studio" version="1.1.8763.0"
                            var match = Regex.Match(pi.Data, @"version\s*=\s*""([^""]+)""");
                            if (match.Success)
                            {
                                _smathVersion = match.Groups[1].Value;
                                return;
                            }
                        }
                    }
                }

                // Fallback to settings
                var settings = root.Element(GetNs(root) + "settings");
                if (settings != null)
                {
                    var identity = settings.Element(GetNs(root) + "identity");
                    if (identity != null)
                    {
                        _smathVersion = "SMath Studio";
                        return;
                    }
                }

                _smathVersion = "SMath Studio";
            }
            catch
            {
                _smathVersion = "Desconocida";
            }
        }

        private XNamespace GetNs(XElement element)
        {
            return element.GetDefaultNamespace();
        }

        /// <summary>
        /// Procesa el documento XML del worksheet
        /// </summary>
        private void ProcessWorksheet(XElement root)
        {
            var ns = GetNs(root);

            // Find all regions
            var regionsContainer = root.Element(ns + "regions");
            if (regionsContainer == null)
            {
                _warnings.Add("No se encontró el contenedor de regiones");
                return;
            }

            var regions = regionsContainer.Elements(ns + "region").ToList();

            foreach (var region in regions)
            {
                ProcessRegion(region, ns);
            }

            if (_output.Length == 0 || _output.ToString().Trim().Split('\n').Length <= 7)
            {
                _warnings.Add("El archivo parece estar vacío o no contiene expresiones matemáticas reconocibles");
            }
        }

        /// <summary>
        /// Procesa una región del documento
        /// </summary>
        private void ProcessRegion(XElement region, XNamespace ns)
        {
            // Check for math region
            var math = region.Element(ns + "math");
            if (math != null)
            {
                ProcessMathRegion(math, ns);
                return;
            }

            // Check for text region
            var text = region.Element(ns + "text");
            if (text != null)
            {
                ProcessTextRegion(text, ns);
                return;
            }

            // Check for picture region (embedded images)
            // Note: <picture> element may not have namespace in SMath files
            var picture = region.Element(ns + "picture") ?? region.Element("picture");
            if (picture != null)
            {
                ProcessPictureRegion(picture, ns);
                return;
            }

            // Check for nested regions (areas/collapsed sections)
            var area = region.Element(ns + "area");
            if (area != null)
            {
                var title = area.Element(ns + "title");
                if (title != null)
                {
                    var titleText = GetTextContent(title);
                    if (!string.IsNullOrWhiteSpace(titleText))
                    {
                        _output.AppendLine($"' === {titleText} ===");
                    }
                }
            }

            // Process nested regions recursively
            foreach (var nestedRegion in region.Elements(ns + "region"))
            {
                ProcessRegion(nestedRegion, ns);
            }
        }

        /// <summary>
        /// Procesa una región matemática usando evaluador RPN
        /// </summary>
        private void ProcessMathRegion(XElement math, XNamespace ns)
        {
            try
            {
                var input = math.Element(ns + "input");
                if (input == null) return;

                var elements = input.Elements(ns + "e").ToList();
                if (elements.Count == 0) return;

                // Convert RPN to infix notation
                var expression = EvaluateRPN(elements);

                if (!string.IsNullOrWhiteSpace(expression))
                {
                    // Check if there's a description
                    var description = math.Element(ns + "description");
                    if (description != null)
                    {
                        var descText = GetTextContent(description);
                        if (!string.IsNullOrWhiteSpace(descText))
                        {
                            _output.AppendLine($"' {descText}");
                        }
                    }

                    _output.AppendLine(CleanExpression(expression));
                }
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error procesando expresión matemática: {ex.Message}");
            }
        }

        /// <summary>
        /// Evalúa una lista de elementos RPN y retorna expresión infija
        /// </summary>
        private string EvaluateRPN(List<XElement> elements)
        {
            var stack = new Stack<string>();

            foreach (var elem in elements)
            {
                var type = elem.Attribute("type")?.Value ?? "";
                var value = elem.Value?.Trim() ?? "";
                var style = elem.Attribute("style")?.Value ?? "";
                var argsAttr = elem.Attribute("args")?.Value;
                int args = 0;
                if (!string.IsNullOrEmpty(argsAttr))
                    int.TryParse(argsAttr, out args);

                switch (type.ToLowerInvariant())
                {
                    case "operand":
                        if (style == "unit")
                        {
                            // Unit - push as is
                            stack.Push(ConvertUnit(value));
                        }
                        else if (style == "string")
                        {
                            // String literal
                            stack.Push($"\"{value}\"");
                        }
                        else
                        {
                            // Variable or number
                            stack.Push(ConvertIdentifier(value));
                        }
                        break;

                    case "operator":
                        if (args >= 2 && stack.Count >= 2)
                        {
                            var right = stack.Pop();
                            var left = stack.Pop();
                            var result = ApplyOperator(value, left, right);
                            stack.Push(result);
                        }
                        else if (args == 1 && stack.Count >= 1)
                        {
                            var operand = stack.Pop();
                            var result = ApplyUnaryOperator(value, operand);
                            stack.Push(result);
                        }
                        else
                        {
                            _warnings.Add($"Operador '{value}' con argumentos insuficientes");
                        }
                        break;

                    case "function":
                        if (args > 0 && stack.Count >= args)
                        {
                            var funcArgs = new List<string>();
                            for (int i = 0; i < args; i++)
                            {
                                funcArgs.Insert(0, stack.Pop());
                            }
                            var result = ApplyFunction(value, funcArgs);
                            stack.Push(result);
                        }
                        else if (args == 0)
                        {
                            // Function with no args (constant)
                            stack.Push(ConvertFunction(value, new List<string>()));
                        }
                        else
                        {
                            _warnings.Add($"Función '{value}' con argumentos insuficientes (necesita {args}, hay {stack.Count})");
                        }
                        break;

                    case "bracket":
                        // Brackets are typically handled implicitly in RPN
                        break;

                    default:
                        // Unknown type - try to use as operand
                        if (!string.IsNullOrWhiteSpace(value))
                        {
                            stack.Push(value);
                        }
                        break;
                }
            }

            if (stack.Count == 1)
            {
                return stack.Pop();
            }
            else if (stack.Count > 1)
            {
                // Multiple values on stack - might be a display expression
                return string.Join(" ", stack.Reverse());
            }

            return "";
        }

        /// <summary>
        /// Aplica un operador binario
        /// </summary>
        private string ApplyOperator(string op, string left, string right)
        {
            switch (op)
            {
                case ":":
                case "≔":
                case ":=":
                    // Assignment operator
                    return $"{left} = {right}";

                case "→":
                case "=":
                    // Evaluation/equality
                    return $"{left} = {right}";

                case "+":
                    return $"{left} + {right}";

                case "-":
                    return NeedsParens(right, "-") ? $"{left} - ({right})" : $"{left} - {right}";

                case "*":
                case "·":
                case "×":
                    var leftP = NeedsParens(left, "*") ? $"({left})" : left;
                    var rightP = NeedsParens(right, "*") ? $"({right})" : right;
                    return $"{leftP}*{rightP}";

                case "/":
                case "÷":
                    rightP = NeedsParens(right, "/") ? $"({right})" : right;
                    return $"{left}/{rightP}";

                case "^":
                    leftP = NeedsParens(left, "^") ? $"({left})" : left;
                    rightP = NeedsParens(right, "^") ? $"({right})" : right;
                    return $"{leftP}^{rightP}";

                case "%":
                    return $"{left} % {right}";

                case "<":
                case ">":
                case "≤":
                case "<=":
                case "≥":
                case ">=":
                case "==":
                case "≠":
                case "!=":
                    return $"{left} {ConvertComparisonOp(op)} {right}";

                case "∧":
                case "and":
                    return $"{left} ∧ {right}";

                case "∨":
                case "or":
                    return $"{left} ∨ {right}";

                default:
                    return $"{left} {op} {right}";
            }
        }

        /// <summary>
        /// Aplica un operador unario
        /// </summary>
        private string ApplyUnaryOperator(string op, string operand)
        {
            switch (op)
            {
                case "-":
                    return $"-{operand}";
                case "+":
                    return operand;
                case "!":
                    return $"{operand}!";
                case "√":
                    return $"sqrt({operand})";
                case "²":
                    return $"{operand}^2";
                case "³":
                    return $"{operand}^3";
                default:
                    return $"{op}({operand})";
            }
        }

        /// <summary>
        /// Aplica una función
        /// </summary>
        private string ApplyFunction(string funcName, List<string> args)
        {
            var calcpadFunc = ConvertFunctionName(funcName);

            // Special handling for certain functions
            switch (funcName.ToLowerInvariant())
            {
                case "mat":
                case "matrix":
                    // Matrix creation - args are: elements..., rows, cols
                    return CreateMatrix(args);

                case "vec":
                case "vector":
                    // Vector creation
                    return $"[{string.Join("; ", args)}]";

                case "sys":
                case "augment":
                    // System of equations or augmented matrix
                    return $"[{string.Join(" | ", args)}]";

                default:
                    return $"{calcpadFunc}({string.Join("; ", args)})";
            }
        }

        /// <summary>
        /// Crea una matriz desde los argumentos de la función mat()
        /// </summary>
        private string CreateMatrix(List<string> args)
        {
            if (args.Count < 2)
                return $"[{string.Join("; ", args)}]";

            // Last two args are typically rows and cols counts
            // But in SMath, mat(a,b,c,rows,cols) creates a matrix
            // Try to parse the dimensions
            if (int.TryParse(args[args.Count - 2], out int rows) &&
                int.TryParse(args[args.Count - 1], out int cols))
            {
                var elements = args.Take(args.Count - 2).ToList();

                if (elements.Count == rows * cols || elements.Count == rows)
                {
                    // Build matrix in Hekatan format [row1 | row2 | ...]
                    var sb = new StringBuilder("[");

                    if (rows == 1 || cols == 1)
                    {
                        // Vector
                        sb.Append(string.Join("; ", elements));
                    }
                    else
                    {
                        // Matrix - elements might be in row or column major order
                        for (int r = 0; r < rows && r * cols < elements.Count; r++)
                        {
                            if (r > 0) sb.Append(" | ");
                            var rowElements = new List<string>();
                            for (int c = 0; c < cols && r * cols + c < elements.Count; c++)
                            {
                                rowElements.Add(elements[r * cols + c]);
                            }
                            sb.Append(string.Join("; ", rowElements));
                        }
                    }

                    sb.Append("]");
                    return sb.ToString();
                }
            }

            // Fallback - just create a simple vector
            return $"[{string.Join("; ", args)}]";
        }

        /// <summary>
        /// Convierte nombre de función de SMath a Hekatan
        /// </summary>
        private string ConvertFunctionName(string funcName)
        {
            return funcName?.ToLowerInvariant() switch
            {
                "sqrt" => "sqrt",
                "sin" => "sin",
                "cos" => "cos",
                "tan" => "tan",
                "asin" => "asin",
                "acos" => "acos",
                "atan" => "atan",
                "atan2" => "atan2",
                "sinh" => "sinh",
                "cosh" => "cosh",
                "tanh" => "tanh",
                "log" => "log",
                "log10" => "log",
                "ln" => "ln",
                "exp" => "exp",
                "abs" => "abs",
                "floor" => "floor",
                "ceil" => "ceiling",
                "ceiling" => "ceiling",
                "round" => "round",
                "trunc" => "trunc",
                "sign" => "sign",
                "max" => "max",
                "min" => "min",
                "sum" => "sum",
                "product" => "product",
                "det" => "det",
                "transpose" => "transp",
                "transp" => "transp",
                "inverse" => "inv",
                "inv" => "inv",
                "identity" => "identity",
                "diagonal" => "diagonal",
                "eigenvalues" => "eigenvalues",
                "eigenvectors" => "eigenvectors",
                "rank" => "rank",
                "trace" => "trace",
                "norm" => "norm",
                "cross" => "cross",
                "dot" => "dot",
                "if" => "if",
                "mod" => "mod",
                "gcd" => "gcd",
                "lcm" => "lcm",
                "fact" => "fact",
                "comb" => "comb",
                "perm" => "perm",
                "random" => "random",
                _ => funcName ?? "unknown"
            };
        }

        /// <summary>
        /// Convierte identificador de SMath a Hekatan
        /// </summary>
        private string ConvertIdentifier(string id)
        {
            if (string.IsNullOrEmpty(id))
                return "";

            // Check if it's a number (don't replace dots in numbers like 1.35)
            // Also handle comma as decimal separator (Russian locale)
            var normalizedId = id.Replace(',', '.');
            if (double.TryParse(normalizedId, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out _))
            {
                return normalizedId; // Return number with normalized decimal point
            }

            // Replace dots with underscores for variable names (R.y -> R_y)
            id = id.Replace(".", "_");

            // Handle Greek letter names
            id = id.Replace("alpha", "α")
                   .Replace("beta", "β")
                   .Replace("gamma", "γ")
                   .Replace("delta", "δ")
                   .Replace("epsilon", "ε")
                   .Replace("zeta", "ζ")
                   .Replace("eta", "η")
                   .Replace("theta", "θ")
                   .Replace("iota", "ι")
                   .Replace("kappa", "κ")
                   .Replace("lambda", "λ")
                   .Replace("mu", "μ")
                   .Replace("nu", "ν")
                   .Replace("xi", "ξ")
                   .Replace("omicron", "ο")
                   .Replace("pi", "π")
                   .Replace("rho", "ρ")
                   .Replace("sigma", "σ")
                   .Replace("tau", "τ")
                   .Replace("upsilon", "υ")
                   .Replace("phi", "φ")
                   .Replace("chi", "χ")
                   .Replace("psi", "ψ")
                   .Replace("omega", "ω");

            return id.Trim();
        }

        /// <summary>
        /// Convierte unidades de SMath a Hekatan
        /// </summary>
        private string ConvertUnit(string unit)
        {
            // Most units are the same, but some need conversion
            return unit switch
            {
                "М" => "M",      // Russian M
                "м" => "m",      // Russian m (meters)
                "мм" => "mm",    // Russian mm
                "см" => "cm",    // Russian cm
                "кг" => "kg",    // Russian kg
                "Н" => "N",      // Russian N (Newton)
                "Па" => "Pa",    // Russian Pa
                "МПа" => "MPa",  // Russian MPa
                "кН" => "kN",    // Russian kN
                _ => unit
            };
        }

        /// <summary>
        /// Convierte operador de comparación
        /// </summary>
        private string ConvertComparisonOp(string op)
        {
            return op switch
            {
                "≤" => "≤",
                "<=" => "≤",
                "≥" => "≥",
                ">=" => "≥",
                "≠" => "≠",
                "!=" => "≠",
                "==" => "≡",
                _ => op
            };
        }

        /// <summary>
        /// Determina si una expresión necesita paréntesis
        /// </summary>
        private bool NeedsParens(string expr, string contextOp)
        {
            if (string.IsNullOrEmpty(expr)) return false;

            // If it contains +, - and we're doing * or /
            if ((contextOp == "*" || contextOp == "/") &&
                (expr.Contains("+") || expr.Contains("-")))
            {
                return true;
            }

            // If it contains +, -, *, / and we're doing ^
            if (contextOp == "^" &&
                (expr.Contains("+") || expr.Contains("-") ||
                 expr.Contains("*") || expr.Contains("/")))
            {
                return true;
            }

            return false;
        }

        /// <summary>
        /// Procesa una región de texto
        /// </summary>
        private void ProcessTextRegion(XElement text, XNamespace ns)
        {
            var content = GetTextContent(text);
            if (!string.IsNullOrEmpty(content))
            {
                foreach (var line in content.Split('\n'))
                {
                    var trimmed = line.Trim();
                    if (!string.IsNullOrEmpty(trimmed))
                    {
                        _output.AppendLine($"' {trimmed}");
                    }
                }
            }
        }

        /// <summary>
        /// Extrae contenido de texto de un elemento
        /// </summary>
        private string GetTextContent(XElement element)
        {
            // Try to get from content/p structure
            var content = element.Descendants().FirstOrDefault(e => e.Name.LocalName == "content");
            if (content != null)
            {
                var paragraphs = content.Descendants().Where(e => e.Name.LocalName == "p");
                var text = string.Join("\n", paragraphs.Select(p => p.Value));
                if (!string.IsNullOrEmpty(text))
                    return text;
            }

            // Fallback to direct value
            return element.Value?.Trim() ?? "";
        }

        /// <summary>
        /// Limpia una expresión final
        /// </summary>
        private string CleanExpression(string expr)
        {
            if (string.IsNullOrEmpty(expr))
                return "";

            // Remove excessive whitespace
            expr = Regex.Replace(expr, @"\s+", " ").Trim();

            // Remove unnecessary outer parentheses from the whole expression
            while (expr.StartsWith("(") && expr.EndsWith(")") && IsMatchingParens(expr))
            {
                expr = expr.Substring(1, expr.Length - 2);
            }

            return expr;
        }

        /// <summary>
        /// Verifica si los paréntesis externos coinciden
        /// </summary>
        private bool IsMatchingParens(string expr)
        {
            int depth = 0;
            for (int i = 0; i < expr.Length - 1; i++)
            {
                if (expr[i] == '(') depth++;
                else if (expr[i] == ')') depth--;

                if (depth == 0) return false; // Parentheses closed before end
            }
            return true;
        }

        /// <summary>
        /// Convierte una función con sus argumentos
        /// </summary>
        private string ConvertFunction(string funcName, List<string> args)
        {
            var calcpadFunc = ConvertFunctionName(funcName);
            if (args.Count == 0)
                return calcpadFunc;
            return $"{calcpadFunc}({string.Join("; ", args)})";
        }

        /// <summary>
        /// Procesa una región de imagen (picture) de SMath Studio
        /// SMath embebe imágenes como: <picture><raw format="png" encoding="base64">...</raw></picture>
        /// </summary>
        private void ProcessPictureRegion(XElement picture, XNamespace ns)
        {
            try
            {
                // SMath stores images as <raw format="png" encoding="base64">base64data</raw>
                var raw = picture.Element(ns + "raw");
                if (raw == null)
                {
                    // Try without namespace
                    raw = picture.Element("raw");
                }

                if (raw == null)
                {
                    _warnings.Add("Imagen encontrada pero sin elemento <raw>");
                    return;
                }

                // Get format (png, jpg, etc.)
                var format = raw.Attribute("format")?.Value ?? "png";
                var encoding = raw.Attribute("encoding")?.Value ?? "base64";

                if (encoding.ToLower() != "base64")
                {
                    _warnings.Add($"Codificación de imagen no soportada: {encoding}");
                    return;
                }

                // Get the Base64 content
                var base64Content = raw.Value?.Trim();
                if (string.IsNullOrWhiteSpace(base64Content))
                {
                    _warnings.Add("Imagen sin contenido Base64");
                    return;
                }

                // Clean up whitespace from Base64
                base64Content = base64Content
                    .Replace("\n", "")
                    .Replace("\r", "")
                    .Replace(" ", "")
                    .Replace("\t", "");

                // Generate @{image} directive for Hekatan/GlobalParser
                _output.AppendLine();
                _output.AppendLine($"@{{image {format} base64}}");
                _output.AppendLine(base64Content);
                _output.AppendLine("@{end image}");
                _output.AppendLine();
            }
            catch (Exception ex)
            {
                _warnings.Add($"Error al procesar imagen: {ex.Message}");
            }
        }
    }
}
