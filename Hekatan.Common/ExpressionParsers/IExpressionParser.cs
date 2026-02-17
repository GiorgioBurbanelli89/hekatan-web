using System.Collections.Generic;

namespace Hekatan.Common.ExpressionParsers
{
    /// <summary>
    /// Interface para parsers de expresiones externos (LaTeX, Mathcad, Python-style, etc.)
    /// </summary>
    public interface IExpressionParser
    {
        /// <summary>Nombre del parser (ej: "LaTeX Math Parser")</summary>
        string Name { get; }

        /// <summary>Directiva para activar este parser (ej: "@{latex}")</summary>
        string Directive { get; }

        /// <summary>Directiva de fin (ej: "@{end latex}")</summary>
        string EndDirective { get; }

        /// <summary>
        /// Traduce una expresión de la sintaxis externa a sintaxis Hekatan
        /// </summary>
        /// <param name="expression">Expresión en sintaxis externa</param>
        /// <returns>Expresión traducida a Hekatan</returns>
        string Translate(string expression);

        /// <summary>
        /// Evalúa directamente la expresión y devuelve resultado
        /// (solo para parsers que ejecutan en lugar de traducir)
        /// </summary>
        object Evaluate(string expression, IDictionary<string, double> variables);

        /// <summary>
        /// Valida sintaxis sin evaluar
        /// </summary>
        bool Validate(string expression, out string error);

        /// <summary>
        /// Indica si este parser traduce o ejecuta
        /// </summary>
        ParserMode Mode { get; }
    }

    /// <summary>
    /// Modo de operación del parser
    /// </summary>
    public enum ParserMode
    {
        /// <summary>Traduce a sintaxis Hekatan</summary>
        Translate,

        /// <summary>Ejecuta directamente (usa plugin)</summary>
        Execute,

        /// <summary>Modo híbrido (traduce y ejecuta)</summary>
        Hybrid
    }

    /// <summary>
    /// Clase base para parsers de traducción
    /// </summary>
    public abstract class BaseExpressionParser : IExpressionParser
    {
        public abstract string Name { get; }
        public abstract string Directive { get; }
        public abstract string EndDirective { get; }
        public virtual ParserMode Mode => ParserMode.Translate;

        public abstract string Translate(string expression);

        public virtual object Evaluate(string expression, IDictionary<string, double> variables)
        {
            // Los parsers de traducción no evalúan directamente
            return null;
        }

        public virtual bool Validate(string expression, out string error)
        {
            error = null;
            try
            {
                var translated = Translate(expression);
                return !string.IsNullOrWhiteSpace(translated);
            }
            catch (System.Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        /// <summary>
        /// Helper: Reemplaza patrones regex con valores de reemplazo
        /// </summary>
        protected string ApplyTranslations(string expression, Dictionary<string, string> translations)
        {
            var result = expression;
            foreach (var (pattern, replacement) in translations)
            {
                try
                {
                    result = System.Text.RegularExpressions.Regex.Replace(
                        result, pattern, replacement,
                        System.Text.RegularExpressions.RegexOptions.Multiline);
                }
                catch
                {
                    // Si falla el regex, intentar reemplazo simple
                    result = result.Replace(pattern, replacement);
                }
            }
            return result;
        }
    }
}
