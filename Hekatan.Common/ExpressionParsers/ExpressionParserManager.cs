using System;
using System.Collections.Generic;
using System.Linq;

namespace Hekatan.Common.ExpressionParsers
{
    /// <summary>
    /// Gestor de parsers de expresiones externos.
    /// Permite registrar y usar parsers de LaTeX, Mathcad, Python-style, etc.
    /// </summary>
    public class ExpressionParserManager
    {
        private readonly Dictionary<string, IExpressionParser> _parsers = new();
        private readonly Dictionary<string, IExpressionParser> _parsersByDirective = new();
        private IExpressionParser _activeParser;

        public IReadOnlyDictionary<string, IExpressionParser> Parsers => _parsers;
        public IExpressionParser ActiveParser => _activeParser;

        public ExpressionParserManager()
        {
            // Registrar parsers por defecto
            RegisterDefaultParsers();
        }

        /// <summary>
        /// Registra los parsers incorporados
        /// </summary>
        private void RegisterDefaultParsers()
        {
            RegisterParser("latex", new LaTeXParser());
            RegisterParser("mathcad", new MathcadParser());
            RegisterParser("pymath", new PythonMathParser());

            // Registrar SymbolicParser (AngouriMath) si está disponible
            var symbolicParser = new SymbolicParser();
            if (symbolicParser.IsAvailable)
            {
                RegisterParser("symbolic", symbolicParser);
            }
        }

        /// <summary>
        /// Registra un parser personalizado
        /// </summary>
        public void RegisterParser(string key, IExpressionParser parser)
        {
            if (parser == null)
                throw new ArgumentNullException(nameof(parser));

            _parsers[key.ToLowerInvariant()] = parser;
            _parsersByDirective[parser.Directive.ToLowerInvariant()] = parser;
        }

        /// <summary>
        /// Obtiene un parser por clave
        /// </summary>
        public IExpressionParser GetParser(string key)
        {
            if (string.IsNullOrWhiteSpace(key))
                return null;

            return _parsers.TryGetValue(key.ToLowerInvariant(), out var parser) ? parser : null;
        }

        /// <summary>
        /// Obtiene un parser por su directiva (ej: "@{latex}")
        /// </summary>
        public IExpressionParser GetParserByDirective(string directive)
        {
            if (string.IsNullOrWhiteSpace(directive))
                return null;

            return _parsersByDirective.TryGetValue(directive.ToLowerInvariant(), out var parser) ? parser : null;
        }

        /// <summary>
        /// Establece el parser activo
        /// </summary>
        public bool SetActiveParser(string key)
        {
            var parser = GetParser(key);
            if (parser != null)
            {
                _activeParser = parser;
                return true;
            }
            return false;
        }

        /// <summary>
        /// Traduce una expresión usando el parser especificado
        /// </summary>
        public string Translate(string expression, string parserKey)
        {
            var parser = GetParser(parserKey);
            if (parser == null)
                throw new InvalidOperationException($"Parser not found: {parserKey}");

            if (parser.Mode != ParserMode.Translate)
                throw new InvalidOperationException($"Parser '{parserKey}' does not support translation");

            return parser.Translate(expression);
        }

        /// <summary>
        /// Traduce una expresión usando el parser activo
        /// </summary>
        public string Translate(string expression)
        {
            if (_activeParser == null)
                throw new InvalidOperationException("No active parser set");

            return _activeParser.Translate(expression);
        }

        /// <summary>
        /// Detecta y procesa un bloque de expresión externa
        /// Retorna el código traducido a Hekatan
        /// </summary>
        public string ProcessBlock(string directive, string content)
        {
            // Buscar parser por directiva
            var parser = GetParserByDirective(directive);
            if (parser == null)
            {
                // No se encontró parser, retornar contenido sin cambios
                return content;
            }

            // Si el parser traduce, convertir a Hekatan
            if (parser.Mode == ParserMode.Translate)
            {
                return parser.Translate(content);
            }

            // Si el parser ejecuta, no podemos hacer nada aquí
            // (debe manejarse en nivel superior con PluginManager)
            return content;
        }

        /// <summary>
        /// Lista todos los parsers disponibles
        /// </summary>
        public IEnumerable<(string Key, string Name, string Directive, ParserMode Mode)> ListParsers()
        {
            return _parsers.Select(p => (
                p.Key,
                p.Value.Name,
                p.Value.Directive,
                p.Value.Mode
            ));
        }

        /// <summary>
        /// Valida una expresión con el parser especificado
        /// </summary>
        public bool ValidateExpression(string expression, string parserKey, out string error)
        {
            var parser = GetParser(parserKey);
            if (parser == null)
            {
                error = $"Parser not found: {parserKey}";
                return false;
            }

            return parser.Validate(expression, out error);
        }
    }
}
