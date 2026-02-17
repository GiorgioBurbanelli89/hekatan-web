using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Hekatan.Common.ExpressionParsers
{
    /// <summary>
    /// Parser que convierte sintaxis LaTeX a sintaxis Hekatan
    /// </summary>
    public class LaTeXParser : BaseExpressionParser
    {
        public override string Name => "LaTeX Math Parser";
        public override string Directive => "@{latex}";
        public override string EndDirective => "@{end latex}";

        private readonly Dictionary<string, string> _translations = new()
        {
            // Fracciones: \frac{a}{b} -> (a)/(b)
            { @"\\frac\{([^{}]+)\}\{([^{}]+)\}", "($1)/($2)" },

            // Raíces: \sqrt{x} -> sqrt(x), \sqrt[n]{x} -> root(x; n)
            { @"\\sqrt\{([^{}]+)\}", "sqrt($1)" },
            { @"\\sqrt\[([^{}]+)\]\{([^{}]+)\}", "root($2; $1)" },

            // Funciones trigonométricas
            { @"\\sin\b", "sin" },
            { @"\\cos\b", "cos" },
            { @"\\tan\b", "tan" },
            { @"\\arcsin\b", "asin" },
            { @"\\arccos\b", "acos" },
            { @"\\arctan\b", "atan" },

            // Funciones logarítmicas y exponenciales
            { @"\\ln\b", "ln" },
            { @"\\log\b", "log" },
            { @"\\exp\b", "exp" },

            // Constantes
            { @"\\pi\b", "π" },
            { @"\\infty\b", "∞" },

            // Operadores
            { @"\\cdot\b", "*" },
            { @"\\times\b", "*" },
            { @"\\div\b", "/" },

            // Superíndices: x^{2} -> x^2
            { @"\^\{([^{}]+)\}", "^($1)" },

            // Subíndices: x_{i} -> x_i (Hekatan usa _ para subíndices)
            { @"_\{([^{}]+)\}", "_$1" },

            // Paréntesis grandes: \left( ... \right) -> ( ... )
            { @"\\left\(", "(" },
            { @"\\right\)", ")" },
            { @"\\left\[", "[" },
            { @"\\right\]", "]" },

            // Sumas: \sum_{i=1}^{n} -> $Sum{...}
            // Integrales: \int_{a}^{b} -> $Integral{...}
            // Nota: Estas son aproximaciones, pueden necesitar procesamiento manual
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

            // PASO 1: Reemplazar operadores simples primero (cdot, times, div)
            result = Regex.Replace(result, @"\\cdot\b", "*");
            result = Regex.Replace(result, @"\\times\b", "*");
            result = Regex.Replace(result, @"\\div\b", "/");

            // PASO 2: Reemplazar constantes
            result = Regex.Replace(result, @"\\pi\b", "π");
            result = Regex.Replace(result, @"\\infty\b", "∞");

            // PASO 3: Reemplazar funciones trigonométricas
            result = Regex.Replace(result, @"\\sin\b", "sin");
            result = Regex.Replace(result, @"\\cos\b", "cos");
            result = Regex.Replace(result, @"\\tan\b", "tan");
            result = Regex.Replace(result, @"\\arcsin\b", "asin");
            result = Regex.Replace(result, @"\\arccos\b", "acos");
            result = Regex.Replace(result, @"\\arctan\b", "atan");
            result = Regex.Replace(result, @"\\ln\b", "ln");
            result = Regex.Replace(result, @"\\log\b", "log");
            result = Regex.Replace(result, @"\\exp\b", "exp");

            // PASO 4: Reemplazar paréntesis grandes
            result = result.Replace(@"\left(", "(");
            result = result.Replace(@"\right)", ")");
            result = result.Replace(@"\left[", "[");
            result = result.Replace(@"\right]", "]");

            // PASO 5: Procesar raíces (deben ir antes de superíndices porque pueden contener ^)
            result = Regex.Replace(result, @"\\sqrt\[([^\[\]]+)\]\{([^{}]+)\}", "root($2; $1)");
            result = Regex.Replace(result, @"\\sqrt\{([^{}]+)\}", "sqrt($1)");

            // PASO 6: Procesar superíndices y subíndices (convertir llaves a paréntesis/nada)
            result = Regex.Replace(result, @"\^\{([^{}]+)\}", "^($1)");
            result = Regex.Replace(result, @"_\{([^{}]+)\}", "_$1");

            // PASO 7: Ahora procesar fracciones (después de que los superíndices ya no usen llaves)
            // Usamos un patrón más permisivo que acepta paréntesis dentro
            result = Regex.Replace(result, @"\\frac\{([^{}]+)\}\{([^{}]+)\}", "($1)/($2)");

            // PASO 8: Si aún quedan fracciones con contenido complejo, hacer otro pase
            // Esto maneja casos donde hay paréntesis dentro de la fracción
            int maxPasses = 3;
            for (int i = 0; i < maxPasses; i++)
            {
                var before = result;
                result = Regex.Replace(result, @"\\frac\{([^{}]+)\}\{([^{}]+)\}", "($1)/($2)");
                if (before == result)
                    break; // No hay más cambios
            }

            // Limpiar espacios extra
            result = Regex.Replace(result, @"\s+", " ");

            return result;
        }

        /// <summary>
        /// Traduce una ecuación completa LaTeX (ej: "x = \frac{a + b}{2}")
        /// </summary>
        public string TranslateEquation(string latexEquation)
        {
            // Separar por el signo =
            var parts = latexEquation.Split('=', 2);

            if (parts.Length == 1)
            {
                // Solo una expresión, no hay asignación
                return Translate(parts[0].Trim());
            }

            // Hay asignación: variable = expresión
            var leftSide = parts[0].Trim();
            var rightSide = parts[1].Trim();

            // Traducir nombre de variable (puede tener subíndices)
            leftSide = TranslateVariableName(leftSide);

            // Traducir expresión del lado derecho
            rightSide = Translate(rightSide);

            return $"{leftSide} = {rightSide}";
        }

        /// <summary>
        /// Traduce nombres de variables con subíndices LaTeX
        /// Ejemplo: M_{max} -> M_max
        /// </summary>
        private string TranslateVariableName(string varName)
        {
            // Subíndices: x_{i} -> x_i
            varName = Regex.Replace(varName, @"_\{([^{}]+)\}", "_$1");

            // Superíndices en nombres (poco común pero posible)
            varName = Regex.Replace(varName, @"\^\{([^{}]+)\}", "^$1");

            return varName.Trim();
        }

        /// <summary>
        /// Maneja bloques multilinea LaTeX
        /// </summary>
        public string TranslateBlock(string latexBlock)
        {
            var lines = latexBlock.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            var result = new List<string>();

            foreach (var line in lines)
            {
                var trimmed = line.Trim();

                // Ignorar líneas vacías y comentarios LaTeX
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("%"))
                    continue;

                // Traducir la línea
                var translated = TranslateEquation(trimmed);
                result.Add(translated);
            }

            return string.Join("\n", result);
        }
    }
}
