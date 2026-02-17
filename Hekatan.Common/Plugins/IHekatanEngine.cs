using System;
using System.Collections.Generic;

namespace Hekatan.Common.Plugins
{
    /// <summary>
    /// Interface base para motores de evaluación de expresiones.
    /// Implementa esta interface para crear un motor personalizado.
    /// </summary>
    public interface IHekatanEngine
    {
        /// <summary>Nombre del motor</summary>
        string Name { get; }

        /// <summary>Descripción del motor</summary>
        string Description { get; }

        /// <summary>Tipo de motor: builtin, plugin, translator, custom</summary>
        string EngineType { get; }

        /// <summary>Capacidades soportadas</summary>
        IReadOnlyList<string> Capabilities { get; }

        /// <summary>Inicializa el motor con configuración opcional</summary>
        void Initialize(IDictionary<string, object> config = null);

        /// <summary>Evalúa una expresión y devuelve el resultado numérico</summary>
        double EvaluateNumeric(string expression, IDictionary<string, double> variables = null);

        /// <summary>Evalúa una expresión y devuelve el resultado como string (para simbólico)</summary>
        string EvaluateSymbolic(string expression, IDictionary<string, double> variables = null);

        /// <summary>Traduce expresión a sintaxis Hekatan (para traductores)</summary>
        string TranslateToHekatan(string expression);

        /// <summary>Valida sintaxis sin evaluar</summary>
        bool Validate(string expression, out string error);

        /// <summary>Limpia el estado del motor</summary>
        void Reset();
    }

    /// <summary>
    /// Interface para motores que soportan operaciones simbólicas
    /// </summary>
    public interface ISymbolicEngine : IHekatanEngine
    {
        /// <summary>Deriva una expresión respecto a una variable</summary>
        string Differentiate(string expression, string variable);

        /// <summary>Integra una expresión respecto a una variable</summary>
        string Integrate(string expression, string variable);

        /// <summary>Simplifica una expresión</summary>
        string Simplify(string expression);

        /// <summary>Expande una expresión algebraica</summary>
        string Expand(string expression);

        /// <summary>Resuelve una ecuación para una variable</summary>
        string[] Solve(string equation, string variable);

        /// <summary>Resuelve un sistema de ecuaciones</summary>
        string[,] SolveSystem(string[] equations, string[] variables);

        /// <summary>Calcula el límite de una expresión</summary>
        string Limit(string expression, string variable, string value);

        /// <summary>Convierte a LaTeX</summary>
        string ToLatex(string expression);
    }

    /// <summary>
    /// Interface para motores que soportan traducción de sintaxis
    /// </summary>
    public interface ITranslatorEngine : IHekatanEngine
    {
        /// <summary>Motor destino para la traducción</summary>
        string TargetEngine { get; }

        /// <summary>Diccionario de traducciones (regex → reemplazo)</summary>
        IDictionary<string, string> Translations { get; }

        /// <summary>Aplica todas las traducciones a una expresión</summary>
        string ApplyTranslations(string expression);
    }

    /// <summary>
    /// Clase base abstracta con implementación común
    /// </summary>
    public abstract class HekatanEngineBase : IHekatanEngine
    {
        public abstract string Name { get; }
        public abstract string Description { get; }
        public abstract string EngineType { get; }
        public virtual IReadOnlyList<string> Capabilities { get; } = Array.Empty<string>();

        protected IDictionary<string, double> Variables { get; } = new Dictionary<string, double>();

        public virtual void Initialize(IDictionary<string, object> config = null) { }

        public abstract double EvaluateNumeric(string expression, IDictionary<string, double> variables = null);

        public virtual string EvaluateSymbolic(string expression, IDictionary<string, double> variables = null)
        {
            return EvaluateNumeric(expression, variables).ToString();
        }

        public virtual string TranslateToHekatan(string expression)
        {
            return expression; // Por defecto no traduce
        }

        public virtual bool Validate(string expression, out string error)
        {
            error = null;
            return true;
        }

        public virtual void Reset()
        {
            Variables.Clear();
        }

        protected void MergeVariables(IDictionary<string, double> external)
        {
            if (external == null) return;
            foreach (var kvp in external)
            {
                Variables[kvp.Key] = kvp.Value;
            }
        }
    }

    /// <summary>
    /// Clase base para motores de traducción
    /// </summary>
    public abstract class TranslatorEngineBase : HekatanEngineBase, ITranslatorEngine
    {
        public override string EngineType => "translator";
        public abstract string TargetEngine { get; }
        public abstract IDictionary<string, string> Translations { get; }

        public override double EvaluateNumeric(string expression, IDictionary<string, double> variables = null)
        {
            // Los traductores no evalúan directamente
            throw new NotSupportedException("Translator engines do not evaluate directly. Use TranslateToHekatan.");
        }

        public override string TranslateToHekatan(string expression)
        {
            return ApplyTranslations(expression);
        }

        public virtual string ApplyTranslations(string expression)
        {
            var result = expression;
            foreach (var translation in Translations)
            {
                result = System.Text.RegularExpressions.Regex.Replace(
                    result,
                    translation.Key,
                    translation.Value,
                    System.Text.RegularExpressions.RegexOptions.None);
            }
            return result;
        }
    }
}
