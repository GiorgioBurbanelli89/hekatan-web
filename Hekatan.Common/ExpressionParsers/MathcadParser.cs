using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Hekatan.Common.ExpressionParsers
{
    /// <summary>
    /// Parser que convierte sintaxis Mathcad Prime a sintaxis Hekatan
    /// </summary>
    public class MathcadParser : BaseExpressionParser
    {
        public override string Name => "Mathcad Prime Parser";
        public override string Directive => "@{mathcad}";
        public override string EndDirective => "@{end mathcad}";

        private readonly Dictionary<string, string> _translations = new()
        {
            // Operador de asignación: := -> =
            { ":=", "=" },
            { "≔", "=" },  // Unicode assignment

            // Operadores de multiplicación
            { "·", "*" },  // Middle dot
            { "×", "*" },  // Multiplication sign
            { "⋅", "*" },  // Dot operator

            // Operador de división
            { "÷", "/" },

            // Operadores de comparación
            { "≤", "<=" },
            { "≥", ">=" },
            { "≠", "!=" },

            // Funciones con nombres alternativos
            // Mathcad usa algunos nombres diferentes
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

            // 1. Aplicar traducciones de operadores
            result = ApplyTranslations(result, _translations);

            // 2. Convertir notación de vectores/matrices de Mathcad a Hekatan
            // Mathcad usa superíndice T para transpuesta: M^T -> transpose(M)
            result = Regex.Replace(result, @"(\w+)\^T\b", "transpose($1)");

            // 3. Convertir notación de derivadas de Mathcad
            // d/dx(f) en Mathcad -> diff(f, x) en Hekatan
            result = ConvertDerivativeNotation(result);

            // 4. Convertir rangos de Mathcad: x := 0, 0.1 .. 10 -> similar a Hekatan
            result = ConvertRangeNotation(result);

            // 5. Limpiar espacios extra
            result = Regex.Replace(result, @"\s+", " ");

            return result;
        }

        /// <summary>
        /// Convierte notación de derivadas de Mathcad a Hekatan
        /// </summary>
        private string ConvertDerivativeNotation(string expression)
        {
            // Mathcad: d/dx(f(x)) -> Hekatan: diff(f(x), x)
            // Nota: Esta es una aproximación, la sintaxis exacta puede variar
            var pattern = @"d/d(\w+)\s*\(([^)]+)\)";
            expression = Regex.Replace(expression, pattern, m =>
            {
                var variable = m.Groups[1].Value;
                var function = m.Groups[2].Value;
                return $"diff({function}, {variable})";
            });

            return expression;
        }

        /// <summary>
        /// Convierte notación de rangos de Mathcad
        /// Mathcad: x := 0, 0.1 .. 10
        /// Hekatan: x = seq(0, 0.1, 10)
        /// </summary>
        private string ConvertRangeNotation(string expression)
        {
            // Patrón: inicio, paso .. fin
            var pattern = @"(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\.\.\s*(\d+(?:\.\d+)?)";
            expression = Regex.Replace(expression, pattern, m =>
            {
                var start = m.Groups[1].Value;
                var step = m.Groups[2].Value;
                var end = m.Groups[3].Value;
                return $"seq({start}, {step}, {end})";
            });

            // Patrón: inicio .. fin (paso implícito de 1)
            pattern = @"(\d+(?:\.\d+)?)\s*\.\.\s*(\d+(?:\.\d+)?)";
            expression = Regex.Replace(expression, pattern, m =>
            {
                var start = m.Groups[1].Value;
                var end = m.Groups[2].Value;
                return $"seq({start}, 1, {end})";
            });

            return expression;
        }

        /// <summary>
        /// Traduce definición de función de Mathcad a Hekatan
        /// Mathcad: f(x) := x^2 + 1
        /// Hekatan: f(x) = x^2 + 1
        /// </summary>
        public string TranslateFunctionDefinition(string mathcadDef)
        {
            // Simplemente reemplazar := con =
            return mathcadDef.Replace(":=", "=").Replace("≔", "=");
        }

        /// <summary>
        /// Traduce bloques de código Mathcad multilinea
        /// </summary>
        public string TranslateBlock(string mathcadBlock)
        {
            var lines = mathcadBlock.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            var result = new List<string>();

            foreach (var line in lines)
            {
                var trimmed = line.Trim();

                // Ignorar líneas vacías
                if (string.IsNullOrWhiteSpace(trimmed))
                    continue;

                // Traducir la línea
                var translated = Translate(trimmed);
                result.Add(translated);
            }

            return string.Join("\n", result);
        }

        /// <summary>
        /// Convierte matrices de Mathcad a sintaxis Hekatan
        /// Mathcad usa notación similar pero con diferentes delimitadores
        /// </summary>
        public string TranslateMatrix(string mathcadMatrix)
        {
            // Esto puede requerir parsing más sofisticado
            // Por ahora, retornar tal cual (Hekatan y Mathcad son bastante similares)
            return mathcadMatrix;
        }

        /// <summary>
        /// Convierte unidades de Mathcad a Hekatan
        /// Mathcad: 5 m, Hekatan: 5'm
        /// </summary>
        public string TranslateWithUnits(string expression)
        {
            // Buscar patrón: número espacio unidad
            var pattern = @"(\d+(?:\.\d+)?)\s+([a-zA-Z]+)";
            return Regex.Replace(expression, pattern, "$1'$2");
        }
    }
}
