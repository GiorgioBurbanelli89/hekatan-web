using System.Collections.Generic;

namespace Hekatan.Common.ExpressionParsers
{
    /// <summary>
    /// Configuración de sintaxis para un parser personalizado.
    /// Permite definir todos los delimitadores y símbolos del parser.
    /// </summary>
    public class ParserSyntaxConfig
    {
        /// <summary>Delimitador para comentarios de línea (ej: ' para Hekatan, % para LaTeX, # para Python)</summary>
        public string CommentLine { get; set; } = "'";

        /// <summary>Delimitador de inicio de comentario de bloque (ej: /* para C-style)</summary>
        public string CommentBlockStart { get; set; }

        /// <summary>Delimitador de fin de comentario de bloque (ej: */ para C-style)</summary>
        public string CommentBlockEnd { get; set; }

        /// <summary>Delimitador para strings (ej: " para Hekatan, ' para Python)</summary>
        public string StringDelimiter { get; set; } = "\"";

        /// <summary>Delimitador alternativo para strings (ej: ' para algunos parsers)</summary>
        public string StringDelimiterAlt { get; set; }

        /// <summary>Delimitador para HTML/output (ej: '<> en Hekatan)</summary>
        public string HtmlStart { get; set; } = "'<";
        public string HtmlEnd { get; set; } = ">'";

        /// <summary>Delimitador para bloques de código (ej: ``` en Markdown)</summary>
        public string CodeBlockStart { get; set; }
        public string CodeBlockEnd { get; set; }

        /// <summary>Símbolo para variables especiales/substitución (ej: $ en Hekatan)</summary>
        public string VariablePrefix { get; set; } = "$";

        /// <summary>Símbolo para directivas/keywords (ej: # en Hekatan, @ en C#)</summary>
        public string DirectivePrefix { get; set; } = "#";

        /// <summary>Operador de asignación (ej: = en Hekatan, := en Mathcad)</summary>
        public string Assignment { get; set; } = "=";

        /// <summary>Operador de evaluación/mostrar resultado (ej: = ? en Hekatan)</summary>
        public string Evaluation { get; set; } = "= ?";

        /// <summary>Operador de potencia (ej: ^ en Hekatan, ** en Python)</summary>
        public string Power { get; set; } = "^";

        /// <summary>Operador de multiplicación (ej: * en Hekatan, · en Mathcad)</summary>
        public string Multiply { get; set; } = "*";

        /// <summary>Operador de división (ej: / en Hekatan, ÷ en Mathcad)</summary>
        public string Divide { get; set; } = "/";

        /// <summary>Separador de argumentos (ej: ; en Hekatan, , en Python)</summary>
        public string ArgumentSeparator { get; set; } = ";";

        /// <summary>Separador de elementos en matriz fila (ej: , en Hekatan)</summary>
        public string MatrixRowSeparator { get; set; } = ",";

        /// <summary>Separador de elementos en matriz columna (ej: ; en Hekatan)</summary>
        public string MatrixColSeparator { get; set; } = ";";

        /// <summary>Separador de filas en matriz (ej: | en Hekatan)</summary>
        public string MatrixLineSeparator { get; set; } = "|";

        /// <summary>Prefijo para unidades (ej: ' en Hekatan, * en otros)</summary>
        public string UnitPrefix { get; set; } = "'";

        /// <summary>Delimitador para inicio de función especial (ej: $Root{ en Hekatan)</summary>
        public string SpecialFunctionStart { get; set; } = "$";
        public string SpecialFunctionEnd { get; set; } = "";

        /// <summary>Símbolos adicionales personalizados</summary>
        public Dictionary<string, string> CustomSymbols { get; set; } = new();

        /// <summary>Mapeo de operadores (sintaxis externa → sintaxis interna)</summary>
        public Dictionary<string, string> OperatorMap { get; set; } = new();

        /// <summary>Mapeo de funciones (sintaxis externa → sintaxis interna)</summary>
        public Dictionary<string, string> FunctionMap { get; set; } = new();

        /// <summary>Mapeo de keywords (sintaxis externa → sintaxis interna)</summary>
        public Dictionary<string, string> KeywordMap { get; set; } = new();

        /// <summary>Si es case-sensitive (true) o no (false)</summary>
        public bool CaseSensitive { get; set; } = true;

        /// <summary>Si permite espacios en nombres de variables</summary>
        public bool AllowSpacesInNames { get; set; } = false;

        /// <summary>Si requiere ; al final de statements</summary>
        public bool RequireSemicolon { get; set; } = false;

        /// <summary>Estilo de bloques: "indent" (Python), "braces" (C), "keywords" (Hekatan)</summary>
        public string BlockStyle { get; set; } = "keywords";

        /// <summary>
        /// Crea una configuración por defecto para Hekatan nativo
        /// </summary>
        public static ParserSyntaxConfig HekatanDefault()
        {
            return new ParserSyntaxConfig
            {
                CommentLine = "'",
                StringDelimiter = "\"",
                HtmlStart = "'<",
                HtmlEnd = ">'",
                VariablePrefix = "$",
                DirectivePrefix = "#",
                Assignment = "=",
                Evaluation = "= ?",
                Power = "^",
                Multiply = "*",
                Divide = "/",
                ArgumentSeparator = ";",
                MatrixRowSeparator = ",",
                MatrixColSeparator = ";",
                MatrixLineSeparator = "|",
                UnitPrefix = "'",
                SpecialFunctionStart = "$",
                CaseSensitive = true,
                BlockStyle = "keywords"
            };
        }

        /// <summary>
        /// Crea una configuración para LaTeX
        /// </summary>
        public static ParserSyntaxConfig LaTeXStyle()
        {
            return new ParserSyntaxConfig
            {
                CommentLine = "%",
                StringDelimiter = "",
                HtmlStart = "",
                HtmlEnd = "",
                VariablePrefix = "",
                DirectivePrefix = "\\",
                Assignment = "=",
                Power = "^",
                Multiply = "\\cdot",
                Divide = "\\div",
                ArgumentSeparator = ",",
                UnitPrefix = "",
                BlockStyle = "braces",
                OperatorMap = new Dictionary<string, string>
                {
                    { "\\frac", "/" },
                    { "\\sqrt", "sqrt" },
                    { "\\cdot", "*" },
                    { "\\times", "*" },
                    { "\\div", "/" }
                },
                FunctionMap = new Dictionary<string, string>
                {
                    { "\\sin", "sin" },
                    { "\\cos", "cos" },
                    { "\\tan", "tan" },
                    { "\\ln", "ln" },
                    { "\\log", "log" }
                }
            };
        }

        /// <summary>
        /// Crea una configuración para Mathcad Prime
        /// </summary>
        public static ParserSyntaxConfig MathcadStyle()
        {
            return new ParserSyntaxConfig
            {
                CommentLine = "#",
                StringDelimiter = "\"",
                VariablePrefix = "",
                DirectivePrefix = "",
                Assignment = ":=",
                Power = "^",
                Multiply = "·",
                Divide = "÷",
                ArgumentSeparator = ",",
                MatrixRowSeparator = ",",
                MatrixColSeparator = ",",
                UnitPrefix = "",
                BlockStyle = "keywords",
                OperatorMap = new Dictionary<string, string>
                {
                    { ":=", "=" },
                    { "≔", "=" },
                    { "·", "*" },
                    { "×", "*" },
                    { "÷", "/" }
                }
            };
        }

        /// <summary>
        /// Crea una configuración para Python-style
        /// </summary>
        public static ParserSyntaxConfig PythonStyle()
        {
            return new ParserSyntaxConfig
            {
                CommentLine = "#",
                CommentBlockStart = "\"\"\"",
                CommentBlockEnd = "\"\"\"",
                StringDelimiter = "\"",
                StringDelimiterAlt = "'",
                VariablePrefix = "",
                DirectivePrefix = "@",
                Assignment = "=",
                Power = "**",
                Multiply = "*",
                Divide = "/",
                ArgumentSeparator = ",",
                MatrixRowSeparator = ",",
                UnitPrefix = "",
                RequireSemicolon = false,
                BlockStyle = "indent",
                CaseSensitive = true,
                OperatorMap = new Dictionary<string, string>
                {
                    { "**", "^" },
                    { "//", "div" },
                    { "%", "mod" }
                },
                FunctionMap = new Dictionary<string, string>
                {
                    { "math.sqrt", "sqrt" },
                    { "math.sin", "sin" },
                    { "math.cos", "cos" },
                    { "math.pi", "π" },
                    { "math.e", "e" }
                }
            };
        }

        /// <summary>
        /// Crea una configuración para C-style
        /// </summary>
        public static ParserSyntaxConfig CStyle()
        {
            return new ParserSyntaxConfig
            {
                CommentLine = "//",
                CommentBlockStart = "/*",
                CommentBlockEnd = "*/",
                StringDelimiter = "\"",
                StringDelimiterAlt = "'",
                VariablePrefix = "",
                DirectivePrefix = "#",
                Assignment = "=",
                Power = "pow",  // pow(a, b)
                Multiply = "*",
                Divide = "/",
                ArgumentSeparator = ",",
                UnitPrefix = "",
                RequireSemicolon = true,
                BlockStyle = "braces",
                CaseSensitive = true
            };
        }
    }

    /// <summary>
    /// Parser que usa configuración de sintaxis personalizable
    /// </summary>
    public class ConfigurableParser : BaseExpressionParser
    {
        private readonly ParserSyntaxConfig _config;
        private readonly string _name;
        private readonly string _directive;
        private readonly string _endDirective;

        public override string Name => _name;
        public override string Directive => _directive;
        public override string EndDirective => _endDirective;

        public ParserSyntaxConfig Config => _config;

        public ConfigurableParser(string name, string directive, ParserSyntaxConfig config)
        {
            _name = name;
            _directive = directive;
            _endDirective = $"@{{end {directive.TrimStart('@').TrimStart('{').TrimEnd('}')}}}";
            _config = config ?? ParserSyntaxConfig.HekatanDefault();
        }

        public override string Translate(string expression)
        {
            var result = expression;

            // 1. Aplicar mapeos de operadores
            if (_config.OperatorMap != null)
            {
                result = ApplyTranslations(result, _config.OperatorMap);
            }

            // 2. Aplicar mapeos de funciones
            if (_config.FunctionMap != null)
            {
                result = ApplyTranslations(result, _config.FunctionMap);
            }

            // 3. Aplicar mapeos de keywords
            if (_config.KeywordMap != null)
            {
                result = ApplyTranslations(result, _config.KeywordMap);
            }

            // 4. Aplicar símbolos custom
            if (_config.CustomSymbols != null)
            {
                result = ApplyTranslations(result, _config.CustomSymbols);
            }

            return result;
        }
    }
}
