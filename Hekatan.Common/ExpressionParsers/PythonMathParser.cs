using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Hekatan.Common.ExpressionParsers
{
    /// <summary>
    /// Parser que convierte sintaxis Python math a sintaxis Hekatan
    /// </summary>
    public class PythonMathParser : BaseExpressionParser
    {
        public override string Name => "Python Math Parser";
        public override string Directive => "@{pymath}";
        public override string EndDirective => "@{end pymath}";

        private readonly Dictionary<string, string> _translations = new()
        {
            // Operador de potencia: ** -> ^
            { @"\*\*", "^" },

            // Funciones del módulo math
            { @"math\.sqrt\b", "sqrt" },
            { @"math\.pow\b", "pow" },
            { @"math\.sin\b", "sin" },
            { @"math\.cos\b", "cos" },
            { @"math\.tan\b", "tan" },
            { @"math\.asin\b", "asin" },
            { @"math\.acos\b", "acos" },
            { @"math\.atan\b", "atan" },
            { @"math\.atan2\b", "atan2" },
            { @"math\.sinh\b", "sinh" },
            { @"math\.cosh\b", "cosh" },
            { @"math\.tanh\b", "tanh" },
            { @"math\.exp\b", "exp" },
            { @"math\.log\b", "ln" },    // math.log es ln en Python
            { @"math\.log10\b", "log" },  // math.log10 es log base 10
            { @"math\.log2\b", "log_2" }, // log base 2
            { @"math\.ceil\b", "ceil" },
            { @"math\.floor\b", "floor" },
            { @"math\.abs\b", "abs" },
            { @"math\.fabs\b", "abs" },

            // Constantes
            { @"math\.pi\b", "π" },
            { @"math\.e\b", "e" },
            { @"math\.inf\b", "∞" },

            // NumPy functions (si se usan)
            { @"np\.sqrt\b", "sqrt" },
            { @"np\.sin\b", "sin" },
            { @"np\.cos\b", "cos" },
            { @"np\.tan\b", "tan" },
            { @"np\.exp\b", "exp" },
            { @"np\.log\b", "ln" },
            { @"np\.pi\b", "π" },
            { @"np\.e\b", "e" },
        };

        public override string Translate(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression))
                return expression;

            // Si el contenido tiene múltiples líneas, procesarlas por separado
            if (expression.Contains('\n') || expression.Contains('\r'))
            {
                return TranslateBlock(expression);
            }

            // Procesar línea única
            var result = expression.Trim();

            // Aplicar traducciones
            result = ApplyTranslations(result, _translations);

            // Convertir operador de división entera // a div()
            result = Regex.Replace(result, @"(\w+)\s*//\s*(\w+)", "div($1, $2)");

            // Convertir operador módulo %
            result = Regex.Replace(result, @"(\w+)\s*%\s*(\w+)", "mod($1, $2)");

            // Limpiar espacios
            result = Regex.Replace(result, @"\s+", " ");

            return result;
        }

        /// <summary>
        /// Traduce comprensiones de lista simples a bucles Hekatan
        /// [x**2 for x in range(10)] -> $Map{x^2 @ x = 0 : 9}
        /// </summary>
        public string TranslateListComprehension(string pythonExpr)
        {
            // Patrón simple: [expr for var in range(n)]
            var pattern = @"\[(.+?)\s+for\s+(\w+)\s+in\s+range\((\d+)\)\]";
            var match = Regex.Match(pythonExpr, pattern);

            if (match.Success)
            {
                var expr = match.Groups[1].Value.Trim();
                var varName = match.Groups[2].Value;
                var rangeEnd = int.Parse(match.Groups[3].Value);

                // Traducir la expresión dentro
                expr = Translate(expr);

                // Generar $Map de Hekatan
                return $"$Map{{{expr} @ {varName} = 0 : {rangeEnd - 1}}}";
            }

            return pythonExpr;
        }

        /// <summary>
        /// Traduce bloques Python multilinea
        /// </summary>
        public string TranslateBlock(string pythonBlock)
        {
            var lines = pythonBlock.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            var result = new List<string>();

            foreach (var line in lines)
            {
                var trimmed = line.Trim();

                // Ignorar líneas vacías y comentarios Python
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("#"))
                    continue;

                // Detectar importaciones (ignorar)
                if (trimmed.StartsWith("import ") || trimmed.StartsWith("from "))
                    continue;

                // Traducir la línea
                var translated = Translate(trimmed);
                result.Add(translated);
            }

            return string.Join("\n", result);
        }

        /// <summary>
        /// Convierte funciones Python lambda a funciones Hekatan
        /// lambda x: x**2 -> f(x) = x^2
        /// </summary>
        public string TranslateLambda(string lambdaExpr, string functionName = "f")
        {
            var pattern = @"lambda\s+(\w+)\s*:\s*(.+)";
            var match = Regex.Match(lambdaExpr, pattern);

            if (match.Success)
            {
                var param = match.Groups[1].Value;
                var body = match.Groups[2].Value.Trim();

                // Traducir el cuerpo
                body = Translate(body);

                return $"{functionName}({param}) = {body}";
            }

            return lambdaExpr;
        }
    }
}
