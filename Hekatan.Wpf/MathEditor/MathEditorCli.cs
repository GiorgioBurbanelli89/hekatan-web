using System;
using System.Collections.Generic;
using System.Text;

namespace Hekatan.Wpf.MathEditor
{
    /// <summary>
    /// CLI para depurar el formato de MathEditor
    /// Muestra cómo se parsea y formatea cada elemento
    /// </summary>
    public static class MathEditorCli
    {
        /// <summary>
        /// Analiza código Hekatan y muestra el formato de cada carácter
        /// </summary>
        public static void AnalyzeAndPrint(string code)
        {
            Console.WriteLine("=== MathEditor CLI - Análisis de Formato ===");
            Console.WriteLine($"Input: {code}");
            Console.WriteLine();

            var lines = code.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);

            for (int lineNum = 0; lineNum < lines.Length; lineNum++)
            {
                var line = lines[lineNum];
                Console.WriteLine($"--- Línea {lineNum + 1}: \"{line}\" ---");

                if (string.IsNullOrEmpty(line))
                {
                    Console.WriteLine("  (línea vacía)");
                    continue;
                }

                // Analizar cada carácter
                Console.WriteLine("  Análisis por carácter:");
                var elements = ParseLine(line);

                foreach (var elem in elements)
                {
                    Console.WriteLine($"    {elem}");
                }

                // Mostrar cómo se vería en HTML (similar al output de Hekatan)
                Console.WriteLine();
                Console.WriteLine("  HTML esperado (template.html):");
                Console.WriteLine($"    {GenerateExpectedHtml(line)}");
                Console.WriteLine();
            }
        }

        /// <summary>
        /// Parsea una línea y devuelve los elementos con su formato
        /// </summary>
        private static List<ElementInfo> ParseLine(string line)
        {
            var elements = new List<ElementInfo>();
            int i = 0;

            while (i < line.Length)
            {
                char c = line[i];

                // Detectar potencia: base^exponente
                if (c == '^' && i > 0)
                {
                    // El siguiente es el exponente
                    i++;
                    var expStart = i;

                    // Extraer exponente (hasta operador o fin)
                    while (i < line.Length && !IsOperatorForExit(line[i]))
                    {
                        i++;
                    }

                    var exponent = line.Substring(expStart, i - expStart);
                    elements.Add(new ElementInfo
                    {
                        Type = "SUPERSCRIPT",
                        Text = exponent,
                        Style = "font-size: 75%; margin-top: -3pt",
                        Color = GetColorForText(exponent)
                    });
                    continue;
                }

                // Detectar subíndice: base_subscript
                if (c == '_' && i > 0)
                {
                    i++;
                    var subStart = i;

                    // Extraer subíndice (hasta operador o fin)
                    while (i < line.Length && char.IsLetterOrDigit(line[i]))
                    {
                        i++;
                    }

                    var subscript = line.Substring(subStart, i - subStart);
                    elements.Add(new ElementInfo
                    {
                        Type = "SUBSCRIPT",
                        Text = subscript,
                        Style = "font-size: 80%; vertical-align: -18%",
                        Color = GetColorForText(subscript)
                    });
                    continue;
                }

                // Detectar fracción: a/b
                if (c == '/' && i > 0 && i < line.Length - 1)
                {
                    elements.Add(new ElementInfo
                    {
                        Type = "FRACTION_LINE",
                        Text = "/",
                        Style = "border-bottom: solid 1pt black",
                        Color = "black"
                    });
                    i++;
                    continue;
                }

                // Carácter normal
                elements.Add(new ElementInfo
                {
                    Type = GetCharType(c),
                    Text = c.ToString(),
                    Style = GetStyleForChar(c),
                    Color = GetColorForChar(c)
                });
                i++;
            }

            return elements;
        }

        private static bool IsOperatorForExit(char c)
        {
            return c == '+' || c == '-' || c == '*' || c == '/' ||
                   c == '=' || c == '<' || c == '>' || c == ' ' ||
                   c == '(' || c == ')' || c == '[' || c == ']';
        }

        private static string GetCharType(char c)
        {
            if (char.IsDigit(c)) return "NUMBER";
            if (char.IsLetter(c)) return "VARIABLE";
            if (c == '+' || c == '-' || c == '*' || c == '/' || c == '=' || c == '^')
                return "OPERATOR";
            if (c == '(' || c == ')' || c == '[' || c == ']')
                return "BRACKET";
            if (c == ' ') return "SPACE";
            return "OTHER";
        }

        private static string GetStyleForChar(char c)
        {
            if (char.IsDigit(c)) return "normal";
            if (char.IsLetter(c)) return "italic (var)";
            return "normal";
        }

        private static string GetColorForChar(char c)
        {
            if (char.IsDigit(c)) return "black";
            if (char.IsLetter(c)) return "#06d (blue)";
            return "black";
        }

        private static string GetColorForText(string text)
        {
            if (string.IsNullOrEmpty(text)) return "black";
            if (char.IsDigit(text[0])) return "black";
            return "#06d (blue)";
        }

        /// <summary>
        /// Genera el HTML esperado según el template de Hekatan
        /// </summary>
        private static string GenerateExpectedHtml(string line)
        {
            var sb = new StringBuilder();
            sb.Append("<span class=\"eq\">");

            int i = 0;
            while (i < line.Length)
            {
                char c = line[i];

                // Potencia
                if (c == '^' && i > 0)
                {
                    i++;
                    var expStart = i;
                    while (i < line.Length && !IsOperatorForExit(line[i]))
                    {
                        i++;
                    }
                    var exponent = line.Substring(expStart, i - expStart);
                    sb.Append($"<sup>{FormatText(exponent)}</sup>");
                    continue;
                }

                // Subíndice
                if (c == '_' && i > 0)
                {
                    i++;
                    var subStart = i;
                    while (i < line.Length && char.IsLetterOrDigit(line[i]))
                    {
                        i++;
                    }
                    var subscript = line.Substring(subStart, i - subStart);
                    sb.Append($"<sub>{FormatText(subscript)}</sub>");
                    continue;
                }

                // Carácter normal
                if (char.IsLetter(c))
                {
                    // Acumular letras para variable
                    var varStart = i;
                    while (i < line.Length && char.IsLetter(line[i]))
                    {
                        i++;
                    }
                    var varName = line.Substring(varStart, i - varStart);

                    // Verificar si es función conocida
                    if (IsKnownFunction(varName))
                    {
                        sb.Append($"<i>{varName}</i>");
                    }
                    else
                    {
                        sb.Append($"<var>{varName}</var>");
                    }
                    continue;
                }

                sb.Append(c);
                i++;
            }

            sb.Append("</span>");
            return sb.ToString();
        }

        private static string FormatText(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";

            var sb = new StringBuilder();
            foreach (char c in text)
            {
                if (char.IsLetter(c))
                    sb.Append($"<var>{c}</var>");
                else
                    sb.Append(c);
            }
            return sb.ToString();
        }

        private static bool IsKnownFunction(string text)
        {
            var functions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "sin", "cos", "tan", "cot", "sec", "csc",
                "asin", "acos", "atan", "acot",
                "sinh", "cosh", "tanh", "coth",
                "log", "ln", "exp", "sqrt", "cbrt", "root",
                "abs", "sign", "floor", "ceiling", "round", "trunc",
                "min", "max", "sum", "if"
            };
            return functions.Contains(text);
        }

        private class ElementInfo
        {
            public string Type { get; set; }
            public string Text { get; set; }
            public string Style { get; set; }
            public string Color { get; set; }

            public override string ToString()
            {
                return $"[{Type}] \"{Text}\" → style: {Style}, color: {Color}";
            }
        }

        /// <summary>
        /// Punto de entrada para ejecutar desde línea de comandos
        /// </summary>
        public static void Main(string[] args)
        {
            if (args.Length == 0)
            {
                // Ejemplos por defecto
                Console.WriteLine("Uso: MathEditorCli <expresión>");
                Console.WriteLine();
                Console.WriteLine("Ejemplos de prueba:");
                Console.WriteLine();

                AnalyzeAndPrint("2^2+1");
                AnalyzeAndPrint("x^2+3*x-1");
                AnalyzeAndPrint("a/b+c/d");
                AnalyzeAndPrint("sqrt(x^2+y^2)");
                AnalyzeAndPrint("M_x=P*L/4");
            }
            else
            {
                AnalyzeAndPrint(string.Join(" ", args));
            }
        }
    }
}
