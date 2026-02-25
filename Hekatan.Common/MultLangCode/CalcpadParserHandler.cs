using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Calcpad.Core;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Handler for @{calcpad} language blocks.
    /// Uses the original Calcpad.Core parser (Proektsoftbg/Calcpad) as an external engine.
    /// Replicates the full Calcpad pipeline: MacroParser (#include, #def) → ExpressionParser.
    /// </summary>
    public static class CalcpadParserHandler
    {
        public static string Parse(string code, string workingDirectory = null)
        {
            if (string.IsNullOrWhiteSpace(code))
                return string.Empty;

            var previousDir = Directory.GetCurrentDirectory();
            try
            {
                // Set working directory for #include resolution
                if (!string.IsNullOrWhiteSpace(workingDirectory) && Directory.Exists(workingDirectory))
                    Directory.SetCurrentDirectory(workingDirectory);

                // Normalize line endings — block extraction (AppendLine after Split('\n'))
                // produces \r\r\n on Windows. Remove all \r to get clean \n-only endings.
                code = code.Replace("\r", "");

                // Phase 1: MacroParser — resolve #include and #def macros
                var macroParser = new MacroParser
                {
                    Include = IncludeFile
                };
                macroParser.Parse(code, out var expandedCode, null, 0, false);

                // Phase 2: ExpressionParser — evaluate math expressions
                var parser = new Calcpad.Core.ExpressionParser();
                parser.Parse(expandedCode, calculate: true, getXml: false);
                return parser.HtmlResult ?? string.Empty;
            }
            catch (Exception ex)
            {
                return $"<p><span class=\"err\">Calcpad parser error: {ex.Message}</span></p>";
            }
            finally
            {
                Directory.SetCurrentDirectory(previousDir);
            }
        }

        /// <summary>
        /// Reads an included file (same logic as CalcpadReader.Include in Calcpad.Cli)
        /// </summary>
        private static string IncludeFile(string fileName, Queue<string> fields)
        {
            if (!File.Exists(fileName))
                return $"'<span class=\"err\">Include file not found: {fileName}</span>";

            var s = File.ReadAllText(fileName);
            var j = s.IndexOf('\v');
            var lines = (j > 0 ? s[..j] : s).Split('\n');
            var result = new List<string>();
            var isLocal = false;

            foreach (var rawLine in lines)
            {
                var line = rawLine.TrimEnd('\r');
                var trimmed = line.TrimStart();

                if (trimmed.StartsWith("#local", StringComparison.OrdinalIgnoreCase))
                    isLocal = true;
                else if (trimmed.StartsWith("#global", StringComparison.OrdinalIgnoreCase))
                    isLocal = false;
                else if (!isLocal)
                {
                    if (trimmed.StartsWith("#include", StringComparison.OrdinalIgnoreCase))
                    {
                        var includeFileName = trimmed[8..].Trim();
                        result.Add(IncludeFile(includeFileName, fields is null ? null : new Queue<string>()));
                    }
                    else
                        result.Add(line);
                }
            }

            return string.Join(Environment.NewLine, result);
        }
    }
}
