using System.Text.RegularExpressions;

namespace Hekatan.AiAgent
{
    /// <summary>
    /// Extrae y limpia codigo del LLM.
    /// Soporta tanto codigo Hekatan (.hcalc) como comandos CAD CLI.
    /// </summary>
    public static class HekatanCodeExtractor
    {
        public class ExtractionResult
        {
            public string Code { get; set; } = "";
            public string RawResponse { get; set; } = "";
            public bool HadCodeBlock { get; set; }
            public string DetectedLanguageTag { get; set; } = "";
            public bool ContainsSvg { get; set; }
            public bool ContainsThreeJs { get; set; }
            public bool ContainsHtml { get; set; }
            public bool ContainsCss { get; set; }
            public bool ContainsCalc { get; set; }
            public bool ContainsCadCli { get; set; }
            public bool ContainsHekatanDirectives { get; set; }
            public int LineCount { get; set; }
            public List<string> Issues { get; set; } = new();
        }

        /// <summary>
        /// Extrae codigo limpio de la respuesta del LLM
        /// </summary>
        public static ExtractionResult Extract(string response)
        {
            var result = new ExtractionResult { RawResponse = response };

            if (string.IsNullOrWhiteSpace(response))
            {
                result.Issues.Add("Respuesta vacia");
                return result;
            }

            string code = response;

            // Buscar bloques de codigo markdown
            var codeBlockMatch = Regex.Match(response,
                @"```(\w*)\s*\n([\s\S]*?)```",
                RegexOptions.Multiline);

            if (codeBlockMatch.Success)
            {
                result.HadCodeBlock = true;
                result.DetectedLanguageTag = codeBlockMatch.Groups[1].Value;
                code = codeBlockMatch.Groups[2].Value;

                // Si hay multiples bloques, concatenarlos
                var allBlocks = Regex.Matches(response,
                    @"```\w*\s*\n([\s\S]*?)```",
                    RegexOptions.Multiline);

                if (allBlocks.Count > 1)
                {
                    var parts = new List<string>();
                    foreach (Match block in allBlocks)
                    {
                        parts.Add(block.Groups[1].Value.Trim());
                    }
                    code = string.Join("\n\n", parts);
                }
            }
            else
            {
                // No hay bloques de codigo - intentar usar la respuesta directa
                code = CleanDirectResponse(response);
            }

            // Analizar contenido
            result.ContainsSvg = code.Contains("<svg") || code.Contains("</svg>");
            result.ContainsThreeJs = code.Contains("THREE.") || code.Contains("three.min.js");
            result.ContainsHtml = code.Contains("@{html}") || code.Contains("<div") || code.Contains("<script");
            result.ContainsCss = code.Contains("@{css}");
            result.ContainsCalc = Regex.IsMatch(code, @"^\w+\s*=\s*[\d.]", RegexOptions.Multiline);
            result.ContainsHekatanDirectives = code.Contains("@{") && code.Contains("@{end");

            // Detectar comandos CAD CLI
            result.ContainsCadCli = IsCadCliCode(code);

            // Validar y corregir problemas comunes (solo para no-CAD)
            if (!result.ContainsCadCli)
                code = FixCommonIssues(code, result);

            result.Code = code.Trim();
            result.LineCount = result.Code.Split('\n').Length;

            return result;
        }

        /// <summary>
        /// Extrae SOLO comandos CAD CLI de la respuesta (elimina texto explicativo)
        /// </summary>
        public static string ExtractCadCommands(string response)
        {
            var result = Extract(response);
            var code = result.Code;

            // Filtrar solo lineas que son comandos CAD validos o comentarios
            var lines = code.Split('\n');
            var cadLines = new List<string>();

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;

                // Comentarios CAD
                if (trimmed.StartsWith("#") || trimmed.StartsWith("'"))
                {
                    cadLines.Add(trimmed);
                    continue;
                }

                // Comandos CAD conocidos
                var firstWord = trimmed.Split(' ', ',')[0].ToLower();
                if (CadCommands.Contains(firstWord))
                {
                    cadLines.Add(trimmed);
                }
            }

            return string.Join("\n", cadLines);
        }

        private static readonly HashSet<string> CadCommands = new(StringComparer.OrdinalIgnoreCase)
        {
            "line", "l", "linea", "rect", "r", "rectangulo",
            "circle", "c", "circulo", "ellipse", "e", "elipse",
            "arc", "a", "arco", "carc", "pline", "pl", "polilinea",
            "clear", "undo", "u", "zoomfit", "zf", "fit",
            "list", "ls", "del", "delete",
            "move", "mv", "copy", "cp", "mirror", "mi",
            "rotate", "ro", "scaleshape", "ss",
            "array", "ar", "polararray", "pa", "arraypath", "ap",
            "offset", "of", "z", "scale", "unit",
            "dim", "cota", "hdim", "cotah", "vdim", "cotav", "adim", "cotaa",
            "zoom", "zoomin", "zi", "zoomout", "zo",
            "pan", "zoomto", "zt",
            "rrect", "stirrup", "estribo",
            "colsection", "columna", "columnsection",
            "text", "texto", "arrow", "flecha",
            "line3d", "l3d", "linea3d", "arrow3d", "flecha3d",
            "text3d", "texto3d", "pline3d", "pl3d", "polilinea3d",
            "circle3d", "c3d", "circulo3d", "carc3d",
            "proj", "projection", "grid", "labels",
            "bg", "background", "color",
            "save", "load", "help"
        };

        /// <summary>
        /// Detecta si el codigo contiene comandos CAD CLI
        /// </summary>
        private static bool IsCadCliCode(string code)
        {
            var lines = code.Split('\n');
            int cadLineCount = 0;
            int totalNonEmpty = 0;

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith("#") || trimmed.StartsWith("'"))
                    continue;

                totalNonEmpty++;
                var firstWord = trimmed.Split(' ', ',')[0].ToLower();
                if (CadCommands.Contains(firstWord))
                    cadLineCount++;
            }

            // Si mas de la mitad de las lineas son comandos CAD
            return totalNonEmpty > 0 && (double)cadLineCount / totalNonEmpty > 0.5;
        }

        private static string CleanDirectResponse(string response)
        {
            var lines = response.Split('\n');
            var codeLines = new List<string>();
            bool inCode = false;

            foreach (var line in lines)
            {
                var trimmed = line.Trim();

                if (!inCode && (
                    trimmed.StartsWith("\"") ||
                    trimmed.StartsWith("'") ||
                    trimmed.StartsWith("@{") ||
                    trimmed.StartsWith("<") ||
                    trimmed.StartsWith("#if") ||
                    trimmed.StartsWith("#for") ||
                    // CAD commands
                    IsCadCommand(trimmed) ||
                    Regex.IsMatch(trimmed, @"^\w+\s*=\s*")
                ))
                {
                    inCode = true;
                }

                if (inCode)
                {
                    codeLines.Add(line);
                }
            }

            return codeLines.Count > 0 ? string.Join("\n", codeLines) : response;
        }

        private static bool IsCadCommand(string line)
        {
            if (string.IsNullOrWhiteSpace(line)) return false;
            var firstWord = line.Split(' ', ',')[0].ToLower();
            return CadCommands.Contains(firstWord);
        }

        private static string FixCommonIssues(string code, ExtractionResult result)
        {
            if ((code.Contains("<svg") || code.Contains("<div")) &&
                !code.Contains("@{html}") && !code.Contains("@{css}"))
            {
                var lines = code.Split('\n');
                var calcLines = new List<string>();
                var htmlLines = new List<string>();
                bool inHtml = false;

                foreach (var line in lines)
                {
                    var trimmed = line.Trim();
                    if (trimmed.StartsWith("<") || inHtml)
                    {
                        inHtml = true;
                        htmlLines.Add(line);
                    }
                    else if (trimmed.StartsWith("\"") || trimmed.StartsWith("'") ||
                             Regex.IsMatch(trimmed, @"^\w+\s*=") || string.IsNullOrWhiteSpace(trimmed))
                    {
                        if (!inHtml)
                            calcLines.Add(line);
                        else
                            htmlLines.Add(line);
                    }
                    else
                    {
                        calcLines.Add(line);
                    }
                }

                if (htmlLines.Count > 0)
                {
                    code = string.Join("\n", calcLines) + "\n\n@{html}\n" +
                           string.Join("\n", htmlLines) + "\n@{end html}";
                    result.Issues.Add("Se agrego @{html}/@{end html} faltante");
                }
            }

            if (code.Contains("@("))
            {
                result.Issues.Add("Contiene @() - incompatible con parser Hekatan");
            }

            return code;
        }

        /// <summary>
        /// Detecta automaticamente que modo de generacion usar
        /// </summary>
        public static GenerationMode DetectMode(string userInput)
        {
            var lower = userInput.ToLower();

            // CAD CLI keywords (default mode)
            if (lower.Contains("cad") || lower.Contains("dibuja") || lower.Contains("dibujo") ||
                lower.Contains("seccion") || lower.Contains("viga") || lower.Contains("columna") ||
                lower.Contains("apoyo") || lower.Contains("carga") || lower.Contains("replica") ||
                lower.Contains("planta") || lower.Contains("alzado") || lower.Contains("esquema") ||
                lower.Contains("estribo") || lower.Contains("armado") || lower.Contains("armadura") ||
                lower.Contains("perfil") || lower.Contains("diagrama") || lower.Contains("grafica"))
                return GenerationMode.CadCli;

            if (lower.Contains("3d") || lower.Contains("three") || lower.Contains("modelo") ||
                lower.Contains("perspectiva") || lower.Contains("rotacion") || lower.Contains("orbita"))
                return GenerationMode.ThreeJs;

            if (lower.Contains("svg"))
                return GenerationMode.Svg;

            if (lower.Contains("css") || lower.Contains("estilo") || lower.Contains("formato") ||
                lower.Contains("diseno") || lower.Contains("tarjeta"))
                return GenerationMode.Css;

            if (lower.Contains("calcula") || lower.Contains("disena") || lower.Contains("verifica") ||
                lower.Contains("formula") || lower.Contains("ecuacion") || lower.Contains("resistencia"))
                return GenerationMode.Calc;

            return GenerationMode.CadCli; // Default a CAD CLI
        }
    }
}
