using Hekatan.Core;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace Hekatan.Common
{
    /// <summary>
    /// Unified file reader for Hekatan files (.hcalc, .hcalcz, .cpd, .cpdz, .txt)
    /// Combines functionality from Hekatan.Cli and Hekatan.Wpf
    /// </summary>
    public static class HekatanReader
    {
        private static readonly StringBuilder _stringBuilder = new();

        /// <summary>
        /// TEST FUNCTION: Simple suma function to verify Hekatan.Common works in both CLI and WPF
        /// suma(x) = x + 1
        /// </summary>
        /// <param name="x">Input value</param>
        /// <returns>x + 1</returns>
        public static double Suma(double x)
        {
            return x + 1;
        }

        /// <summary>
        /// Returns a test message to verify the Common library is loaded
        /// </summary>
        public static string GetTestMessage()
        {
            return "[Hekatan.Common] Library loaded successfully!";
        }

        /// <summary>
        /// Reads and processes a Hekatan file
        /// </summary>
        /// <param name="fileName">Path to the file</param>
        /// <param name="environment">The environment calling this method (Cli, Wpf, Api)</param>
        /// <returns>Processed file content as string</returns>
        public static string Read(string fileName, HekatanEnvironment environment = HekatanEnvironment.Cli)
        {
            var content = ReadFileContent(fileName, environment);

            // Process import directives (@{mathcad:file}, @{smathstudio:file})
            var basePath = Path.GetDirectoryName(Path.GetFullPath(fileName)) ?? Environment.CurrentDirectory;
            content = ProcessImportDirectives(content, basePath);

            var inputLines = content.EnumerateLines();
            var outputLines = new List<string>();
            var hasForm = false;
            var insideLanguageBlock = false;

            foreach (var line in inputLines)
            {
                var lineStr = line.ToString();
                var trimmedLine = lineStr.Trim();

                // Check if we're entering or exiting a language block
                // MultLang directives use @{language} and @{end language} format
                if (trimmedLine.StartsWith("@{"))
                {
                    if (trimmedLine.StartsWith("@{end "))
                    {
                        insideLanguageBlock = false;
                    }
                    else
                    {
                        // @{python}, @{octave}, @{csharp}, etc.
                        insideLanguageBlock = true;
                    }
                }
                // Also check old-style directives starting with #
                // Exclude all Calcpad-specific directives that should NOT toggle language block state
                else if (trimmedLine.StartsWith("#") && !trimmedLine.StartsWith("#hide") &&
                    !trimmedLine.StartsWith("#show") && !trimmedLine.StartsWith("#pre") &&
                    !trimmedLine.StartsWith("#post") && !trimmedLine.StartsWith("#val") &&
                    !trimmedLine.StartsWith("#equ") && !trimmedLine.StartsWith("#noc") &&
                    !trimmedLine.StartsWith("#def") && !trimmedLine.StartsWith("#end ") &&
                    !trimmedLine.StartsWith("#include") && !trimmedLine.StartsWith("#local") &&
                    !trimmedLine.StartsWith("#global") && !trimmedLine.StartsWith("#for") &&
                    !trimmedLine.StartsWith("#loop") && !trimmedLine.StartsWith("#if") &&
                    !trimmedLine.StartsWith("#else") && !trimmedLine.StartsWith("#round") &&
                    !trimmedLine.StartsWith("#map"))
                {
                    // Could be a language directive like #python, #csharp, etc.
                    if (trimmedLine.Contains("end"))
                    {
                        insideLanguageBlock = false;
                    }
                    else
                    {
                        insideLanguageBlock = true;
                    }
                }

                ReadOnlySpan<char> s;
                if (line.Contains('\v'))
                {
                    hasForm = true;
                    var n = line.IndexOf('\v');
                    if (n == 0)
                    {
                        InputFieldProcessor.SetInputFieldsFromFile(line[1..].EnumerateSplits('\t'), outputLines);
                        break;
                    }
                    else
                    {
                        InputFieldProcessor.SetInputFieldsFromFile(line[(n + 1)..].EnumerateSplits('\t'), outputLines);
                        s = line[..n];
                    }
                }
                else
                {
                    // Don't process operators inside language blocks
                    if (insideLanguageBlock)
                    {
                        s = line.TrimStart('\t');
                    }
                    else
                    {
                        s = OperatorConverter.ReplaceCStyleOperators(line.TrimStart('\t'));
                    }

                    if (!hasForm)
                        hasForm = MacroParser.HasInputFields(s);
                }
                outputLines.Add(s.ToString());
            }
            return string.Join(Environment.NewLine, outputLines);
        }

        /// <summary>
        /// Reads text content from a Hekatan file, handling compression if needed
        /// Use .EnumerateLines() from Hekatan.Core to iterate over lines
        /// </summary>
        /// <param name="fileName">Path to the file</param>
        /// <param name="environment">The environment calling this method</param>
        /// <returns>File content as string</returns>
        public static string ReadFileContent(string fileName, HekatanEnvironment environment = HekatanEnvironment.Cli)
        {
            var fileExt = Path.GetExtension(fileName);
            if (fileExt.Equals(".hcalcz", StringComparison.InvariantCultureIgnoreCase) ||
                fileExt.Equals(".cpdz", StringComparison.InvariantCultureIgnoreCase))
            {
                // Check if it's a ZIP archive (composite with images) or simple deflate
                if (Zip.IsComposite(fileName))
                {
                    // WPF uses DecompressWithImages to extract images alongside code
                    // CLI can also benefit from this for full compatibility
                    return Zip.DecompressWithImages(fileName);
                }
                else
                {
                    var f = new FileInfo(fileName)
                    {
                        IsReadOnly = false
                    };
                    using var fs = f.OpenRead();
                    return Zip.Decompress(fs);
                }
            }
            return File.ReadAllText(fileName);
        }

        /// <summary>
        /// Reads text content from a file, handling compression
        /// Alias for ReadFileContent for backward compatibility
        /// </summary>
        /// <param name="fileName">Path to the file</param>
        /// <returns>File content as string</returns>
        public static string ReadText(string fileName) => ReadFileContent(fileName);

        /// <summary>
        /// Processes an #include directive, reading and merging the included file
        /// </summary>
        /// <param name="fileName">Path to the included file</param>
        /// <param name="fields">Queue of field values for form processing</param>
        /// <returns>Processed content from the included file</returns>
        public static string Include(string fileName, Queue<string> fields)
        {
            var isLocal = false;
            var insideLanguageBlock = false;
            var s = File.ReadAllText(fileName);
            var j = s.IndexOf('\v');
            var hasForm = j > 0;
            var lines = (hasForm ? s[..j] : s).EnumerateLines();
            var getLines = new List<string>();
            var sf = hasForm ? s[(j + 1)..] : default;
            Queue<string> getFields = InputFieldProcessor.GetFields(sf, fields);
            foreach (var line in lines)
            {
                var lineStr = line.ToString();
                var trimmedLine = lineStr.Trim();

                // Check if we're entering or exiting a language block
                // Exclude all Calcpad-specific directives that should NOT toggle language block state
                if (trimmedLine.StartsWith("#") && !trimmedLine.StartsWith("#hide") &&
                    !trimmedLine.StartsWith("#show") && !trimmedLine.StartsWith("#pre") &&
                    !trimmedLine.StartsWith("#post") && !trimmedLine.StartsWith("#val") &&
                    !trimmedLine.StartsWith("#equ") && !trimmedLine.StartsWith("#noc") &&
                    !trimmedLine.StartsWith("#def") && !trimmedLine.StartsWith("#end ") &&
                    !trimmedLine.StartsWith("#include") && !trimmedLine.StartsWith("#local") &&
                    !trimmedLine.StartsWith("#global") && !trimmedLine.StartsWith("#for") &&
                    !trimmedLine.StartsWith("#loop") && !trimmedLine.StartsWith("#if") &&
                    !trimmedLine.StartsWith("#else") && !trimmedLine.StartsWith("#round") &&
                    !trimmedLine.StartsWith("#map"))
                {
                    // Could be a language directive like #python, #csharp, #c, etc.
                    if (trimmedLine.Contains("end"))
                    {
                        insideLanguageBlock = false;
                    }
                    else
                    {
                        insideLanguageBlock = true;
                    }
                }

                if (Validator.IsKeyword(line, "#local"))
                    isLocal = true;
                else if (Validator.IsKeyword(line, "#global"))
                    isLocal = false;
                else
                {
                    if (!isLocal)
                    {
                        // Only process #include if we're NOT inside a language block
                        if (!insideLanguageBlock && Validator.IsKeyword(line, "#include"))
                        {
                            var includeFileName = GetModuleName(line);
                            getLines.Add(fields is null
                                ? Include(includeFileName, null)
                                : Include(includeFileName, new()));
                        }
                        else
                            getLines.Add(lineStr);
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
                    if (getFields is not null && getFields.Count > 0)
                    {
                        if (MacroParser.SetLineInputFields(getLines[i].TrimEnd(), _stringBuilder, getFields, false))
                            getLines[i] = _stringBuilder.ToString();

                        _stringBuilder.Clear();
                    }
                }
            }
            return string.Join(Environment.NewLine, getLines);
        }

        /// <summary>
        /// Extracts the module name from an #include directive
        /// </summary>
        private static string GetModuleName(ReadOnlySpan<char> s)
        {
            var n = s.Length;
            if (n < 9)
                return null;

            n = s.IndexOfAny('\'', '"');
            var n1 = s.LastIndexOf('#');
            if (n < 9 || n1 > 0 && n1 < n)
                n = n1;

            if (n < 9)
                n = s.Length;

            return s[8..n].Trim().ToString();
        }

        private const string ErrorString = "#Error";

        /// <summary>
        /// Converts code to HTML with line numbers and error highlighting
        /// </summary>
        /// <param name="code">Source code to convert</param>
        /// <returns>HTML representation of the code</returns>
        public static string CodeToHtml(string code)
        {
            const string spaces = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
            var errors = new Queue<int>();
            _stringBuilder.Clear();
            var lines = code.EnumerateLines();
            _stringBuilder.AppendLine("<pre class=\"code\">");
            var lineNumber = 0;
            foreach (var line in lines)
            {
                ++lineNumber;
                var i = line.IndexOf('\v');
                var lineText = i < 0 ? line : line[..i];
                var sourceLine = i < 0 ? lineNumber.ToString() : line[(i + 1)..];
                var lineNumText = lineNumber.ToString(CultureInfo.InvariantCulture);
                var n = lineNumText.Length;
                _stringBuilder.Append($"<p class=\"line-text\" id=\"line-{lineNumber}\"><span title=\"Source line {sourceLine}\">{spaces[(6 * n)..]}{lineNumber}</span>&emsp;│&emsp;");
                if (line.StartsWith(ErrorString))
                {
                    errors.Enqueue(lineNumber);
                    _stringBuilder.Append($"<span class=\"err\">{lineText[1..]}</span>");
                }
                else
                {
                    _stringBuilder.Append(lineText);
                }
                _stringBuilder.Append("</p>");
            }
            _stringBuilder.Append("</pre>");
            if (errors.Count != 0 && lineNumber > 30)
            {
                _stringBuilder.AppendLine($"<div class=\"errorHeader\">Found <b>{errors.Count}</b> errors in modules and macros:");
                var count = 0;
                while (errors.Count != 0 && ++count < 20)
                {
                    var errorLine = errors.Dequeue();
                    _stringBuilder.Append($" <span class=\"roundBox\" data-line=\"{errorLine}\">{errorLine}</span>");
                }
                if (errors.Count > 0)
                    _stringBuilder.Append(" ...");

                _stringBuilder.Append("</div>");
                _stringBuilder.AppendLine("<style>body {padding-top:0.5em;} p {margin:0; line-height:1.15em;}</style>");
            }
            else
                _stringBuilder.AppendLine("<style>p {margin:0; line-height:1.15em;}</style>");
            return _stringBuilder.ToString();
        }

        #region Import Directives (@{mathcad:file}, @{smathstudio:file}, @{excel:file})

        // Pattern to match @{mathcad:filepath} - captures the file path
        private static readonly Regex MathcadDirectivePattern = new(@"@\{mathcad:([^}]+)\}", RegexOptions.IgnoreCase);

        // Pattern to match @{smathstudio:filepath} or @{smath:filepath} - captures the file path
        private static readonly Regex SMathDirectivePattern = new(@"@\{(?:smathstudio|smath):([^}]+)\}", RegexOptions.IgnoreCase);

        // Pattern to match @{excel:filepath} or @{xlsx:filepath} - captures the file path
        private static readonly Regex ExcelDirectivePattern = new(@"@\{(?:excel|xlsx):([^}]+)\}", RegexOptions.IgnoreCase);

        /// <summary>
        /// Processes import directives in code:
        /// - @{mathcad:file.mcdx} - Imports and converts Mathcad Prime file
        /// - @{smathstudio:file.sm} or @{smath:file.sm} - Imports and converts SMath Studio file
        /// - @{excel:file.xlsx} or @{xlsx:file.xlsx} - Imports and converts Excel file
        /// </summary>
        /// <param name="code">Code containing import directives</param>
        /// <param name="basePath">Base directory for resolving relative paths</param>
        /// <returns>Code with directives replaced by converted content</returns>
        public static string ProcessImportDirectives(string code, string basePath = null)
        {
            if (string.IsNullOrEmpty(code))
                return code;

            // Quick check: if no import directives, return as-is
            if (!code.Contains("@{mathcad:", StringComparison.OrdinalIgnoreCase) &&
                !code.Contains("@{smathstudio:", StringComparison.OrdinalIgnoreCase) &&
                !code.Contains("@{smath:", StringComparison.OrdinalIgnoreCase) &&
                !code.Contains("@{excel:", StringComparison.OrdinalIgnoreCase) &&
                !code.Contains("@{xlsx:", StringComparison.OrdinalIgnoreCase))
            {
                return code;
            }

            basePath ??= Environment.CurrentDirectory;

            // Process Mathcad directives
            code = MathcadDirectivePattern.Replace(code, match =>
            {
                var filePath = match.Groups[1].Value.Trim();
                return ProcessMathcadImport(filePath, basePath);
            });

            // Process SMath directives
            code = SMathDirectivePattern.Replace(code, match =>
            {
                var filePath = match.Groups[1].Value.Trim();
                return ProcessSMathImport(filePath, basePath);
            });

            // Process Excel directives
            code = ExcelDirectivePattern.Replace(code, match =>
            {
                var filePath = match.Groups[1].Value.Trim();
                return ProcessExcelImport(filePath, basePath);
            });

            return code;
        }

        /// <summary>
        /// Processes a Mathcad Prime import directive
        /// </summary>
        private static string ProcessMathcadImport(string filePath, string basePath)
        {
            try
            {
                // Resolve relative path
                if (!Path.IsPathRooted(filePath))
                {
                    filePath = Path.Combine(basePath, filePath);
                }

                if (!File.Exists(filePath))
                {
                    return $"' ERROR: Archivo Mathcad no encontrado: {filePath}";
                }

                var converter = new McdxConverter();
                var result = converter.Convert(filePath);

                // Add header comment
                var sb = new StringBuilder();
                sb.AppendLine($"' === Importado de Mathcad: {Path.GetFileName(filePath)} ===");

                // Skip the header that McdxConverter adds (first 6 lines starting with ')
                var lines = result.Split('\n');
                bool skipHeader = true;
                foreach (var line in lines)
                {
                    var trimmed = line.TrimEnd('\r');
                    if (skipHeader && trimmed.StartsWith("'"))
                    {
                        if (trimmed.StartsWith("' ===") && !trimmed.Contains("Importado"))
                            continue; // Skip header lines
                        if (string.IsNullOrWhiteSpace(trimmed.TrimStart('\'')))
                            continue; // Skip empty comment lines in header
                        if (trimmed.Contains("Versión") || trimmed.Contains("Archivo:") || trimmed.Contains("Fecha:"))
                            continue; // Skip version/file/date lines
                    }
                    skipHeader = false;
                    sb.AppendLine(trimmed);
                }

                sb.AppendLine($"' === Fin importación Mathcad ===");

                // Add warnings if any
                if (converter.Warnings.Count > 0)
                {
                    sb.AppendLine("' Advertencias:");
                    foreach (var warning in converter.Warnings)
                    {
                        sb.AppendLine($"'   - {warning}");
                    }
                }

                return sb.ToString().TrimEnd();
            }
            catch (Exception ex)
            {
                return $"' ERROR al importar Mathcad: {ex.Message}";
            }
        }

        /// <summary>
        /// Processes an SMath Studio import directive
        /// </summary>
        private static string ProcessSMathImport(string filePath, string basePath)
        {
            try
            {
                // Resolve relative path
                if (!Path.IsPathRooted(filePath))
                {
                    filePath = Path.Combine(basePath, filePath);
                }

                if (!File.Exists(filePath))
                {
                    return $"' ERROR: Archivo SMath no encontrado: {filePath}";
                }

                var converter = new SMathConverter();
                var result = converter.Convert(filePath);

                // Add header comment
                var sb = new StringBuilder();
                sb.AppendLine($"' === Importado de SMath Studio: {Path.GetFileName(filePath)} ===");

                // Skip the header that SMathConverter adds (similar to Mathcad)
                var lines = result.Split('\n');
                bool skipHeader = true;
                foreach (var line in lines)
                {
                    var trimmed = line.TrimEnd('\r');
                    if (skipHeader && trimmed.StartsWith("'"))
                    {
                        if (trimmed.StartsWith("' ===") && !trimmed.Contains("Importado"))
                            continue;
                        if (string.IsNullOrWhiteSpace(trimmed.TrimStart('\'')))
                            continue;
                        if (trimmed.Contains("Versión") || trimmed.Contains("Archivo:") || trimmed.Contains("Fecha:"))
                            continue;
                    }
                    skipHeader = false;
                    sb.AppendLine(trimmed);
                }

                sb.AppendLine($"' === Fin importación SMath ===");

                // Add warnings if any
                if (converter.Warnings.Count > 0)
                {
                    sb.AppendLine("' Advertencias:");
                    foreach (var warning in converter.Warnings)
                    {
                        sb.AppendLine($"'   - {warning}");
                    }
                }

                return sb.ToString().TrimEnd();
            }
            catch (Exception ex)
            {
                return $"' ERROR al importar SMath: {ex.Message}";
            }
        }

        /// <summary>
        /// Processes an Excel import directive
        /// </summary>
        private static string ProcessExcelImport(string filePath, string basePath)
        {
            try
            {
                // Resolve relative path
                if (!Path.IsPathRooted(filePath))
                {
                    filePath = Path.Combine(basePath, filePath);
                }

                if (!File.Exists(filePath))
                {
                    return $"' ERROR: Archivo Excel no encontrado: {filePath}";
                }

                var converter = new XlsxConverter();
                var result = converter.Convert(filePath);

                // Add header comment
                var sb = new StringBuilder();
                sb.AppendLine($"' === Importado de Excel: {Path.GetFileName(filePath)} ===");

                // Skip the header that XlsxConverter adds (similar to Mathcad/SMath)
                var lines = result.Split('\n');
                bool skipHeader = true;
                foreach (var line in lines)
                {
                    var trimmed = line.TrimEnd('\r');
                    if (skipHeader && trimmed.StartsWith("'"))
                    {
                        if (trimmed.StartsWith("' ===") && !trimmed.Contains("Importado"))
                            continue;
                        if (string.IsNullOrWhiteSpace(trimmed.TrimStart('\'')))
                            continue;
                        if (trimmed.Contains("Versión") || trimmed.Contains("Archivo:") ||
                            trimmed.Contains("Fecha:") || trimmed.Contains("Hojas:"))
                            continue;
                    }
                    skipHeader = false;
                    sb.AppendLine(trimmed);
                }

                sb.AppendLine($"' === Fin importación Excel ===");

                // Add warnings if any
                if (converter.Warnings.Count > 0)
                {
                    sb.AppendLine("' Advertencias:");
                    foreach (var warning in converter.Warnings)
                    {
                        sb.AppendLine($"'   - {warning}");
                    }
                }

                return sb.ToString().TrimEnd();
            }
            catch (Exception ex)
            {
                return $"' ERROR al importar Excel: {ex.Message}";
            }
        }

        /// <summary>
        /// Checks if code contains any import directives
        /// </summary>
        public static bool HasImportDirectives(string code)
        {
            if (string.IsNullOrEmpty(code))
                return false;

            return code.Contains("@{mathcad:", StringComparison.OrdinalIgnoreCase) ||
                   code.Contains("@{smathstudio:", StringComparison.OrdinalIgnoreCase) ||
                   code.Contains("@{smath:", StringComparison.OrdinalIgnoreCase) ||
                   code.Contains("@{excel:", StringComparison.OrdinalIgnoreCase) ||
                   code.Contains("@{xlsx:", StringComparison.OrdinalIgnoreCase);
        }

        #endregion
    }
}
