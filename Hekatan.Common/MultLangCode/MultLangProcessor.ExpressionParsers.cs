using System;
using System.Collections.Generic;
using System.Text;
using Hekatan.Common.ExpressionParsers;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Extensión de MultLangProcessor para soportar parsers de expresiones externos
    /// (LaTeX, Mathcad, Python-style math, etc.)
    /// </summary>
    public partial class MultLangProcessor
    {
        private static readonly ExpressionParserManager _expressionParserManager = new();

        /// <summary>
        /// Obtiene el gestor de parsers de expresiones
        /// </summary>
        public static ExpressionParserManager ExpressionParsers => _expressionParserManager;

        /// <summary>
        /// Procesa un bloque de expresión externa (LaTeX, Mathcad, etc.)
        /// y lo traduce a sintaxis Hekatan
        /// </summary>
        /// <param name="directive">Directiva que inicia el bloque (ej: "@{latex}")</param>
        /// <param name="content">Contenido del bloque en sintaxis externa</param>
        /// <returns>Contenido traducido a sintaxis Hekatan</returns>
        private string ProcessExpressionParserBlock(string directive, string content)
        {
            try
            {
                // Log de debug
                LogDebug($"ProcessExpressionParserBlock: directive={directive}, content length={content.Length}");

                // Buscar parser por directiva
                var parser = _expressionParserManager.GetParserByDirective(directive);
                if (parser == null)
                {
                    LogDebug($"No parser found for directive: {directive}");
                    return content; // No hay parser, retornar sin cambios
                }

                LogDebug($"Found parser: {parser.Name} (mode={parser.Mode})");

                // Si el parser está en modo traducción o híbrido, convertir a Hekatan
                if (parser.Mode == ParserMode.Translate || parser.Mode == ParserMode.Hybrid)
                {
                    var translated = parser.Translate(content);
                    LogDebug($"Translated content: {translated}");
                    return translated;
                }

                // Si el parser está en modo ejecución pura, requiere PluginManager
                // (esto se maneja en otro lugar)
                LogDebug($"Parser mode is {parser.Mode}, returning original content");
                return content;
            }
            catch (Exception ex)
            {
                LogDebug($"Error processing expression parser block: {ex.Message}");
                return $"' Error translating {directive}: {ex.Message}\n{content}";
            }
        }

        /// <summary>
        /// Helper para escribir logs de debug
        /// </summary>
        private void LogDebug(string message)
        {
            try
            {
                var debugPath = System.IO.Path.Combine(
                    System.IO.Path.GetTempPath(),
                    "calcpad-expression-parsers-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        /// <summary>
        /// Detecta y procesa bloques de expresiones en el código
        /// IMPORTANTE: No procesa bloques que estén dentro de @{columns}
        /// </summary>
        /// <param name="code">Código Hekatan con posibles bloques de expresiones</param>
        /// <returns>Código con bloques traducidos</returns>
        public string ProcessExpressionBlocks(string code)
        {
            if (string.IsNullOrWhiteSpace(code))
                return code;

            // Primero, identificar todas las regiones de columnas para NO procesarlas
            var columnRanges = FindColumnRanges(code);

            var result = new StringBuilder();
            var currentPos = 0;

            // Directivas de parsers de expresiones a buscar
            var expressionDirectives = new[]
            {
                ("@{latex}", "@{end latex}", "latex"),
                ("@{mathcad}", "@{end mathcad}", "mathcad"),
                ("@{pymath}", "@{end pymath}", "pymath"),
                ("@{symbolic}", "@{end symbolic}", "symbolic")
            };

            while (currentPos < code.Length)
            {
                // Primero verificar si estamos dentro de una región de columnas
                var columnRange = GetColumnRangeAt(currentPos, columnRanges);
                if (columnRange.HasValue)
                {
                    // Copiar toda la región de columnas sin procesarla
                    var (colStart, colEnd) = columnRange.Value;
                    var lengthToCopy = colEnd - currentPos;
                    result.Append(code.Substring(currentPos, lengthToCopy));
                    currentPos = colEnd;
                    continue;
                }

                int nearestStart = -1;
                string startDirective = null;
                string endDirective = null;
                string parserKey = null;

                // Buscar la directiva más cercana
                foreach (var (start, end, key) in expressionDirectives)
                {
                    var pos = code.IndexOf(start, currentPos, StringComparison.OrdinalIgnoreCase);
                    if (pos >= 0 && (nearestStart == -1 || pos < nearestStart))
                    {
                        nearestStart = pos;
                        startDirective = start;
                        endDirective = end;
                        parserKey = key;
                    }
                }

                // No hay más bloques de expresiones
                if (nearestStart == -1)
                {
                    result.Append(code.Substring(currentPos));
                    break;
                }

                // Agregar texto antes del bloque
                if (nearestStart > currentPos)
                {
                    result.Append(code.Substring(currentPos, nearestStart - currentPos));
                }

                // Buscar el fin del bloque
                var contentStart = nearestStart + startDirective.Length;
                var endPos = code.IndexOf(endDirective, contentStart, StringComparison.OrdinalIgnoreCase);

                if (endPos == -1)
                {
                    // No se encontró el fin, agregar todo lo que queda
                    result.Append(code.Substring(nearestStart));
                    break;
                }

                // Extraer contenido del bloque
                var content = code.Substring(contentStart, endPos - contentStart).Trim();

                // Procesar el bloque
                LogDebug($"Found {parserKey} block at {nearestStart}, length={content.Length}");
                var translated = ProcessExpressionParserBlock(startDirective, content);

                // Agregar contenido traducido
                result.Append(translated);

                // Mover posición después del bloque
                currentPos = endPos + endDirective.Length;
            }

            return result.ToString();
        }

        /// <summary>
        /// Encuentra todos los rangos de @{columns}...@{end columns} en el código
        /// </summary>
        private List<(int start, int end)> FindColumnRanges(string code)
        {
            var ranges = new List<(int, int)>();
            int currentPos = 0;

            while (currentPos < code.Length)
            {
                // Buscar inicio de columnas
                var startPos = code.IndexOf("@{columns", currentPos, StringComparison.OrdinalIgnoreCase);
                if (startPos == -1)
                    break;

                // Buscar fin de columnas
                var endPos = code.IndexOf("@{end columns}", startPos, StringComparison.OrdinalIgnoreCase);
                if (endPos == -1)
                    break;

                // Agregar el rango (desde el inicio de @{columns hasta el fin de @{end columns})
                ranges.Add((startPos, endPos + "@{end columns}".Length));

                currentPos = endPos + "@{end columns}".Length;
            }

            return ranges;
        }

        /// <summary>
        /// Verifica si una posición está dentro de algún rango de columnas
        /// </summary>
        private bool IsInsideColumnRange(int position, List<(int start, int end)> columnRanges)
        {
            foreach (var (start, end) in columnRanges)
            {
                if (position >= start && position < end)
                    return true;
            }
            return false;
        }

        /// <summary>
        /// Obtiene el rango de columna que contiene la posición dada
        /// </summary>
        private (int start, int end)? GetColumnRangeAt(int position, List<(int start, int end)> columnRanges)
        {
            foreach (var (start, end) in columnRanges)
            {
                if (position >= start && position < end)
                    return (start, end);
            }
            return null;
        }
    }
}
