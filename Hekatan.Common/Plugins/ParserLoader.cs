using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Hekatan.Common.Plugins
{
    /// <summary>
    /// Carga definiciones de parser desde JSON.
    /// Permite que todas las expresiones, operadores, funciones y sintaxis
    /// sean configurables sin modificar código C#.
    /// </summary>
    public class ParserLoader
    {
        private ParserDefinitionRoot _root;
        private readonly string _configPath;
        private Dictionary<string, ParserDefinition> _parsers = new();
        private ParserDefinition _activeParser;

        public IReadOnlyDictionary<string, ParserDefinition> Parsers => _parsers;
        public ParserDefinition ActiveParser => _activeParser;
        public List<string> Errors { get; } = new();

        public ParserLoader(string configPath = null)
        {
            _configPath = configPath ?? Path.Combine(
                Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location),
                "Plugins", "ParserDefinition.json");
        }

        /// <summary>
        /// Carga las definiciones de parser desde JSON
        /// </summary>
        public bool Load()
        {
            try
            {
                if (!File.Exists(_configPath))
                {
                    Errors.Add($"Parser definition not found: {_configPath}");
                    return false;
                }

                var json = File.ReadAllText(_configPath);
                _root = JsonSerializer.Deserialize<ParserDefinitionRoot>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    ReadCommentHandling = JsonCommentHandling.Skip
                });

                if (_root?.Parsers == null)
                {
                    Errors.Add("Invalid parser definition: no parsers found");
                    return false;
                }

                // Indexar parsers
                foreach (var (key, parser) in _root.Parsers)
                {
                    parser.Key = key;
                    _parsers[key] = parser;

                    if (parser.IsDefault)
                    {
                        _activeParser = parser;
                    }
                }

                // Seleccionar parser activo si se especifica
                if (!string.IsNullOrEmpty(_root.ActiveParser) && _parsers.ContainsKey(_root.ActiveParser))
                {
                    _activeParser = _parsers[_root.ActiveParser];
                }

                // Asegurar que hay un parser activo
                if (_activeParser == null && _parsers.Count > 0)
                {
                    _activeParser = _parsers.Values.First();
                }

                // Aplicar aliases si están habilitados
                if (_root.Settings?.EnableAliases == true && _root.Aliases != null)
                {
                    ApplyAliases();
                }

                return true;
            }
            catch (Exception ex)
            {
                Errors.Add($"Error loading parser definition: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Obtiene un parser por nombre
        /// </summary>
        public ParserDefinition GetParser(string name)
        {
            if (string.IsNullOrEmpty(name)) return _activeParser;
            return _parsers.TryGetValue(name.ToLowerInvariant(), out var parser) ? parser : _activeParser;
        }

        /// <summary>
        /// Cambia el parser activo
        /// </summary>
        public bool SetActiveParser(string name)
        {
            if (_parsers.TryGetValue(name.ToLowerInvariant(), out var parser))
            {
                _activeParser = parser;
                return true;
            }
            return false;
        }

        /// <summary>
        /// Obtiene información de un operador
        /// </summary>
        public OperatorInfo GetOperator(string symbol, string parserName = null)
        {
            var parser = GetParser(parserName);
            if (parser?.Operators == null) return null;

            foreach (var category in parser.Operators.Values)
            {
                if (category.TryGetValue(symbol, out var op))
                {
                    return op;
                }
            }
            return null;
        }

        /// <summary>
        /// Obtiene información de una función
        /// </summary>
        public FunctionInfo GetFunction(string name, string parserName = null)
        {
            var parser = GetParser(parserName);
            if (parser?.Functions == null) return null;

            var lowerName = name.ToLowerInvariant();

            foreach (var category in parser.Functions.Values)
            {
                if (category.TryGetValue(lowerName, out var func))
                {
                    return func;
                }
                // Buscar por alias
                foreach (var (funcName, funcInfo) in category)
                {
                    if (funcInfo.Alias?.ToLowerInvariant() == lowerName)
                    {
                        return funcInfo;
                    }
                }
            }
            return null;
        }

        /// <summary>
        /// Obtiene un delimitador
        /// </summary>
        public DelimiterInfo GetDelimiter(string type, string parserName = null)
        {
            var parser = GetParser(parserName);
            return parser?.Delimiters?.TryGetValue(type, out var delim) == true ? delim : null;
        }

        /// <summary>
        /// Obtiene una keyword
        /// </summary>
        public KeywordInfo GetKeyword(string keyword, string parserName = null)
        {
            var parser = GetParser(parserName);
            if (parser?.Keywords == null) return null;

            foreach (var category in parser.Keywords.Values)
            {
                if (category.TryGetValue(keyword, out var kw))
                {
                    return kw;
                }
            }
            return null;
        }

        /// <summary>
        /// Verifica si un token es un operador
        /// </summary>
        public bool IsOperator(string token, string parserName = null)
        {
            return GetOperator(token, parserName) != null;
        }

        /// <summary>
        /// Verifica si un token es una función
        /// </summary>
        public bool IsFunction(string token, string parserName = null)
        {
            return GetFunction(token, parserName) != null;
        }

        /// <summary>
        /// Verifica si un token es una keyword
        /// </summary>
        public bool IsKeyword(string token, string parserName = null)
        {
            return GetKeyword(token, parserName) != null;
        }

        /// <summary>
        /// Obtiene el valor de una constante
        /// </summary>
        public double? GetConstant(string name, string parserName = null)
        {
            var parser = GetParser(parserName);
            if (parser?.Constants == null) return null;

            if (parser.Constants.TryGetValue(name, out var constant))
            {
                return constant.Value;
            }

            // Buscar en aliases
            foreach (var c in parser.Constants.Values)
            {
                if (c.Aliases?.Contains(name) == true)
                {
                    return c.Value;
                }
            }

            return null;
        }

        /// <summary>
        /// Traduce expresión de un parser a otro
        /// </summary>
        public string Translate(string expression, string fromParser, string toParser = "calcpad")
        {
            var source = GetParser(fromParser);
            if (source?.Type != "translator" || source.Translations == null)
            {
                return expression; // No es traductor o no tiene traducciones
            }

            var result = expression;

            // Aplicar traducciones de comandos
            if (source.Translations.Commands != null)
            {
                foreach (var (pattern, replacement) in source.Translations.Commands)
                {
                    // Convertir patrón LaTeX a regex
                    var regex = ConvertToRegex(pattern);
                    var repl = ConvertToReplacement(replacement);
                    result = Regex.Replace(result, regex, repl, RegexOptions.None);
                }
            }

            return result;
        }

        /// <summary>
        /// Obtiene todos los nombres de funciones disponibles
        /// </summary>
        public IEnumerable<string> GetAllFunctionNames(string parserName = null)
        {
            var parser = GetParser(parserName);
            if (parser?.Functions == null) yield break;

            foreach (var category in parser.Functions.Values)
            {
                foreach (var name in category.Keys)
                {
                    yield return name;
                }
            }
        }

        /// <summary>
        /// Obtiene todos los operadores
        /// </summary>
        public IEnumerable<string> GetAllOperators(string parserName = null)
        {
            var parser = GetParser(parserName);
            if (parser?.Operators == null) yield break;

            foreach (var category in parser.Operators.Values)
            {
                foreach (var op in category.Keys)
                {
                    yield return op;
                }
            }
        }

        private void ApplyAliases()
        {
            var language = _root.Settings?.DefaultLanguage ?? "english";
            if (!_root.Aliases.TryGetValue(language, out var aliases)) return;

            // Aplicar aliases a cada parser
            foreach (var parser in _parsers.Values)
            {
                if (parser.Functions == null) continue;

                // Crear categoría de aliases si no existe
                if (!parser.Functions.ContainsKey("aliases"))
                {
                    parser.Functions["aliases"] = new Dictionary<string, FunctionInfo>();
                }

                foreach (var (alias, target) in aliases)
                {
                    var targetFunc = GetFunction(target, parser.Key);
                    if (targetFunc != null)
                    {
                        parser.Functions["aliases"][alias] = new FunctionInfo
                        {
                            Args = targetFunc.Args,
                            ArgsArray = targetFunc.ArgsArray,
                            Description = $"Alias for {target}",
                            Alias = target
                        };
                    }
                }
            }
        }

        private string ConvertToRegex(string latexPattern)
        {
            // Convertir patrón LaTeX a regex
            var regex = Regex.Escape(latexPattern);
            // Reemplazar #1, #2 con grupos de captura
            regex = Regex.Replace(regex, @"\\#(\d)", @"(.+?)");
            return regex;
        }

        private string ConvertToReplacement(string replacement)
        {
            // Convertir #1, #2 a $1, $2
            return Regex.Replace(replacement, @"#(\d)", @"$$$1");
        }
    }

    #region JSON Model Classes

    public class ParserDefinitionRoot
    {
        public string Schema { get; set; }
        public string Version { get; set; }
        public string Description { get; set; }
        public Dictionary<string, ParserDefinition> Parsers { get; set; }
        public string ActiveParser { get; set; }
        public Dictionary<string, Dictionary<string, string>> Aliases { get; set; }
        public ParserSettings Settings { get; set; }
    }

    public class ParserDefinition
    {
        public string Key { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public bool Enabled { get; set; }
        public bool IsDefault { get; set; }
        public string Type { get; set; }
        public string Engine { get; set; }
        public string TargetParser { get; set; }
        public string AssemblyPath { get; set; }
        public string ClassName { get; set; }

        public Dictionary<string, TokenTypeInfo> TokenTypes { get; set; }
        public Dictionary<string, DelimiterInfo> Delimiters { get; set; }
        public Dictionary<string, Dictionary<string, OperatorInfo>> Operators { get; set; }
        public Dictionary<string, Dictionary<string, KeywordInfo>> Keywords { get; set; }
        public Dictionary<string, Dictionary<string, FunctionInfo>> Functions { get; set; }
        public Dictionary<string, ConstantInfo> Constants { get; set; }
        public Dictionary<string, NumberFormatInfo> NumberFormats { get; set; }
        public VariableRulesInfo VariableRules { get; set; }
        public TranslationsInfo Translations { get; set; }
    }

    public class TokenTypeInfo
    {
        public int Id { get; set; }
        public string Name { get; set; }
    }

    public class DelimiterInfo
    {
        public string Start { get; set; }
        public string End { get; set; }
        public string Escape { get; set; }
        public string RowSeparator { get; set; }
        public string ColSeparator { get; set; }
        public string Separator { get; set; }
        public bool Multiline { get; set; }
        public string Description { get; set; }
    }

    public class OperatorInfo
    {
        public string Name { get; set; }
        public int Precedence { get; set; }
        public string Associativity { get; set; }
        public bool Unary { get; set; }
        public bool Postfix { get; set; }
        public string Alias { get; set; }
        public string Description { get; set; }
    }

    public class KeywordInfo
    {
        public string Name { get; set; }
        public string End { get; set; }
        public string Description { get; set; }
    }

    public class FunctionInfo
    {
        public int Args { get; set; }
        public int[] ArgsArray { get; set; }
        public string Separator { get; set; }
        public bool Block { get; set; }
        public string Alias { get; set; }
        public string Description { get; set; }
    }

    public class ConstantInfo
    {
        public double Value { get; set; }
        public string[] Aliases { get; set; }
        public string Description { get; set; }
    }

    public class NumberFormatInfo
    {
        public string Pattern { get; set; }
        public string Prefix { get; set; }
        public string Description { get; set; }
    }

    public class VariableRulesInfo
    {
        public string Pattern { get; set; }
        public bool AllowGreek { get; set; }
        public bool AllowPrimes { get; set; }
        public bool AllowSubscripts { get; set; }
        public string SubscriptChar { get; set; }
        public string[] Reserved { get; set; }
    }

    public class TranslationsInfo
    {
        public Dictionary<string, string> Commands { get; set; }
        public Dictionary<string, EnvironmentInfo> Environments { get; set; }
    }

    public class EnvironmentInfo
    {
        public string Start { get; set; }
        public string End { get; set; }
        public string Convert { get; set; }
    }

    public class ParserSettings
    {
        public string DefaultLanguage { get; set; }
        public bool EnableAliases { get; set; }
        public bool CaseSensitive { get; set; }
        public bool AllowMixedParsers { get; set; }
        public string ParserSwitchDirective { get; set; }
        public string ParserEndDirective { get; set; }
    }

    #endregion
}
