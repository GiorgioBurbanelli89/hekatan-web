#nullable enable
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Handler for C++ code blocks: @{cpp}, @{explain}, @{cpp-explain}
    /// Provides syntax highlighting and translation to pseudocode
    /// </summary>
    public static class CppLanguageHandler
    {
        #region Token Types and Classes

        public enum TokenType
        {
            Keyword,
            Identifier,
            Number,
            String,
            Operator,
            Punctuation,
            Comment,
            Preprocessor,
            Type,
            Whitespace,
            Newline,
            Unknown
        }

        public class Token
        {
            public TokenType Type { get; set; }
            public string Value { get; set; } = "";
            public int Line { get; set; }
            public int Column { get; set; }

            public Token(TokenType type, string value, int line, int column)
            {
                Type = type;
                Value = value;
                Line = line;
                Column = column;
            }
        }

        #endregion

        #region Lexer Data

        private static readonly HashSet<string> Keywords = new(StringComparer.Ordinal)
        {
            "for", "while", "do", "if", "else", "switch", "case", "default",
            "break", "continue", "return", "goto",
            "class", "struct", "enum", "union", "namespace",
            "public", "private", "protected", "virtual", "override",
            "static", "const", "constexpr", "volatile", "mutable",
            "inline", "extern", "register",
            "new", "delete", "sizeof", "typeof", "alignof",
            "try", "catch", "throw",
            "template", "typename", "auto", "decltype",
            "true", "false", "nullptr", "NULL",
            "using", "typedef"
        };

        private static readonly HashSet<string> Types = new(StringComparer.Ordinal)
        {
            "void", "bool", "char", "short", "int", "long", "float", "double",
            "signed", "unsigned", "size_t", "ptrdiff_t",
            "int8_t", "int16_t", "int32_t", "int64_t",
            "uint8_t", "uint16_t", "uint32_t", "uint64_t",
            "string", "vector", "map", "set", "list", "array",
            "Matrix", "Vector", "Complex",  // Common FEM types
            "MatrixXd", "Matrix3d", "Matrix2d", "Matrix4d",  // Eigen matrix types
            "VectorXd", "Vector3d", "Vector2d", "Vector4d",  // Eigen vector types
            "MatrixXi", "VectorXi"  // Eigen integer types
        };

        private static readonly HashSet<string> Operators = new(StringComparer.Ordinal)
        {
            "+", "-", "*", "/", "%", "^",
            "=", "==", "!=", "<", ">", "<=", ">=",
            "&&", "||", "!",
            "&", "|", "~", "<<", ">>",
            "++", "--",
            "+=", "-=", "*=", "/=", "%=",
            "&=", "|=", "^=", "<<=", ">>=",
            "->", ".", "::", "?", ":"
        };

        #endregion

        #region Translation Dictionaries

        public enum ExplainLanguage
        {
            Spanish,
            English,
            MATLAB,
            Python
        }

        private static readonly Dictionary<string, Dictionary<ExplainLanguage, string>> KeywordTranslations = new()
        {
            ["for"] = new() { [ExplainLanguage.Spanish] = "PARA", [ExplainLanguage.English] = "FOR", [ExplainLanguage.MATLAB] = "for", [ExplainLanguage.Python] = "for" },
            ["while"] = new() { [ExplainLanguage.Spanish] = "MIENTRAS", [ExplainLanguage.English] = "WHILE", [ExplainLanguage.MATLAB] = "while", [ExplainLanguage.Python] = "while" },
            ["do"] = new() { [ExplainLanguage.Spanish] = "HACER", [ExplainLanguage.English] = "DO", [ExplainLanguage.MATLAB] = "do", [ExplainLanguage.Python] = "while" },
            ["if"] = new() { [ExplainLanguage.Spanish] = "SI", [ExplainLanguage.English] = "IF", [ExplainLanguage.MATLAB] = "if", [ExplainLanguage.Python] = "if" },
            ["else"] = new() { [ExplainLanguage.Spanish] = "SINO", [ExplainLanguage.English] = "ELSE", [ExplainLanguage.MATLAB] = "else", [ExplainLanguage.Python] = "else" },
            ["switch"] = new() { [ExplainLanguage.Spanish] = "SEGUN", [ExplainLanguage.English] = "SWITCH", [ExplainLanguage.MATLAB] = "switch", [ExplainLanguage.Python] = "match" },
            ["case"] = new() { [ExplainLanguage.Spanish] = "CASO", [ExplainLanguage.English] = "CASE", [ExplainLanguage.MATLAB] = "case", [ExplainLanguage.Python] = "case" },
            ["return"] = new() { [ExplainLanguage.Spanish] = "RETORNAR", [ExplainLanguage.English] = "RETURN", [ExplainLanguage.MATLAB] = "return", [ExplainLanguage.Python] = "return" },
            ["break"] = new() { [ExplainLanguage.Spanish] = "SALIR", [ExplainLanguage.English] = "BREAK", [ExplainLanguage.MATLAB] = "break", [ExplainLanguage.Python] = "break" },
            ["continue"] = new() { [ExplainLanguage.Spanish] = "CONTINUAR", [ExplainLanguage.English] = "CONTINUE", [ExplainLanguage.MATLAB] = "continue", [ExplainLanguage.Python] = "continue" },
            ["true"] = new() { [ExplainLanguage.Spanish] = "verdadero", [ExplainLanguage.English] = "true", [ExplainLanguage.MATLAB] = "true", [ExplainLanguage.Python] = "True" },
            ["false"] = new() { [ExplainLanguage.Spanish] = "falso", [ExplainLanguage.English] = "false", [ExplainLanguage.MATLAB] = "false", [ExplainLanguage.Python] = "False" },
            ["nullptr"] = new() { [ExplainLanguage.Spanish] = "nulo", [ExplainLanguage.English] = "null", [ExplainLanguage.MATLAB] = "[]", [ExplainLanguage.Python] = "None" },
            ["NULL"] = new() { [ExplainLanguage.Spanish] = "nulo", [ExplainLanguage.English] = "null", [ExplainLanguage.MATLAB] = "[]", [ExplainLanguage.Python] = "None" }
        };

        private static readonly Dictionary<string, Dictionary<ExplainLanguage, string>> OperatorTranslations = new()
        {
            ["&&"] = new() { [ExplainLanguage.Spanish] = " Y ", [ExplainLanguage.English] = " AND ", [ExplainLanguage.MATLAB] = " && ", [ExplainLanguage.Python] = " and " },
            ["||"] = new() { [ExplainLanguage.Spanish] = " O ", [ExplainLanguage.English] = " OR ", [ExplainLanguage.MATLAB] = " || ", [ExplainLanguage.Python] = " or " },
            ["!"] = new() { [ExplainLanguage.Spanish] = "NO ", [ExplainLanguage.English] = "NOT ", [ExplainLanguage.MATLAB] = "~", [ExplainLanguage.Python] = "not " },
            ["!="] = new() { [ExplainLanguage.Spanish] = " ≠ ", [ExplainLanguage.English] = " ≠ ", [ExplainLanguage.MATLAB] = " ~= ", [ExplainLanguage.Python] = " != " },
            ["=="] = new() { [ExplainLanguage.Spanish] = " = ", [ExplainLanguage.English] = " = ", [ExplainLanguage.MATLAB] = " == ", [ExplainLanguage.Python] = " == " },
            ["<="] = new() { [ExplainLanguage.Spanish] = " ≤ ", [ExplainLanguage.English] = " ≤ ", [ExplainLanguage.MATLAB] = " <= ", [ExplainLanguage.Python] = " <= " },
            [">="] = new() { [ExplainLanguage.Spanish] = " ≥ ", [ExplainLanguage.English] = " ≥ ", [ExplainLanguage.MATLAB] = " >= ", [ExplainLanguage.Python] = " >= " },
            ["++"] = new() { [ExplainLanguage.Spanish] = " + 1", [ExplainLanguage.English] = " + 1", [ExplainLanguage.MATLAB] = " + 1", [ExplainLanguage.Python] = " += 1" },
            ["--"] = new() { [ExplainLanguage.Spanish] = " - 1", [ExplainLanguage.English] = " - 1", [ExplainLanguage.MATLAB] = " - 1", [ExplainLanguage.Python] = " -= 1" },
            ["->"] = new() { [ExplainLanguage.Spanish] = ".", [ExplainLanguage.English] = ".", [ExplainLanguage.MATLAB] = ".", [ExplainLanguage.Python] = "." },
            ["::"] = new() { [ExplainLanguage.Spanish] = ".", [ExplainLanguage.English] = ".", [ExplainLanguage.MATLAB] = ".", [ExplainLanguage.Python] = "." }
        };

        private static readonly Dictionary<string, Dictionary<ExplainLanguage, string>> TypeTranslations = new()
        {
            ["int"] = new() { [ExplainLanguage.Spanish] = "entero", [ExplainLanguage.English] = "integer", [ExplainLanguage.MATLAB] = "int32", [ExplainLanguage.Python] = "int" },
            ["double"] = new() { [ExplainLanguage.Spanish] = "decimal", [ExplainLanguage.English] = "double", [ExplainLanguage.MATLAB] = "double", [ExplainLanguage.Python] = "float" },
            ["float"] = new() { [ExplainLanguage.Spanish] = "decimal", [ExplainLanguage.English] = "float", [ExplainLanguage.MATLAB] = "single", [ExplainLanguage.Python] = "float" },
            ["bool"] = new() { [ExplainLanguage.Spanish] = "booleano", [ExplainLanguage.English] = "boolean", [ExplainLanguage.MATLAB] = "logical", [ExplainLanguage.Python] = "bool" },
            ["char"] = new() { [ExplainLanguage.Spanish] = "caracter", [ExplainLanguage.English] = "character", [ExplainLanguage.MATLAB] = "char", [ExplainLanguage.Python] = "str" },
            ["string"] = new() { [ExplainLanguage.Spanish] = "cadena", [ExplainLanguage.English] = "string", [ExplainLanguage.MATLAB] = "string", [ExplainLanguage.Python] = "str" },
            ["void"] = new() { [ExplainLanguage.Spanish] = "nada", [ExplainLanguage.English] = "void", [ExplainLanguage.MATLAB] = "", [ExplainLanguage.Python] = "None" },
            ["vector"] = new() { [ExplainLanguage.Spanish] = "vector", [ExplainLanguage.English] = "vector", [ExplainLanguage.MATLAB] = "array", [ExplainLanguage.Python] = "list" },
            ["Matrix"] = new() { [ExplainLanguage.Spanish] = "matriz", [ExplainLanguage.English] = "matrix", [ExplainLanguage.MATLAB] = "matrix", [ExplainLanguage.Python] = "ndarray" },
            ["Vector"] = new() { [ExplainLanguage.Spanish] = "vector", [ExplainLanguage.English] = "vector", [ExplainLanguage.MATLAB] = "array", [ExplainLanguage.Python] = "ndarray" }
        };

        #endregion

        #region Math Rendering Helpers (Hekatan-style two-column)

        private static readonly Dictionary<string, string> GreekLetters = new(StringComparer.OrdinalIgnoreCase)
        {
            ["nu"] = "&nu;", ["alpha"] = "&alpha;", ["beta"] = "&beta;",
            ["gamma"] = "&gamma;", ["theta"] = "&theta;", ["sigma"] = "&sigma;",
            ["epsilon"] = "&epsilon;", ["delta"] = "&delta;", ["lambda"] = "&lambda;",
            ["mu"] = "&mu;", ["pi"] = "&pi;", ["rho"] = "&rho;",
            ["tau"] = "&tau;", ["phi"] = "&phi;", ["omega"] = "&omega;",
            ["kappa"] = "&kappa;", ["eta"] = "&eta;", ["zeta"] = "&zeta;",
            ["Omega"] = "&Omega;", ["Pi"] = "&Pi;", ["Sigma"] = "&Sigma;",
            ["Delta"] = "&Delta;", ["Lambda"] = "&Lambda;", ["Theta"] = "&Theta;"
        };

        /// <summary>
        /// Format a C++ variable name into Hekatan-style HTML with subscripts and Greek letters.
        /// x21→x₂₁, nu→ν, Db→D_b, dNdx1→∂N/∂x₁
        /// </summary>
        private static string FormatVarHtml(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return "";

            // Full Greek match
            if (GreekLetters.TryGetValue(name, out var greek))
                return $"<var>{greek}</var>";

            // Partial derivative: dNdx1 → ∂N/∂x₁
            var dm = Regex.Match(name, @"^d([A-Z]\w*)d([a-z])(\d*)$");
            if (dm.Success)
            {
                var top = dm.Groups[1].Value;
                var bot = dm.Groups[2].Value;
                var idx = dm.Groups[3].Value;
                var sub = idx.Length > 0 ? $"<sub>{idx}</sub>" : "";
                return $"<var>&part;{top}/&part;{bot}{sub}</var>";
            }

            // Uppercase + lowercase subscript: Db→D_b, Ae→A_e, Ds→D_s, Km→K_m
            var um = Regex.Match(name, @"^([A-Z][A-Z]?)([a-z])$");
            if (um.Success)
                return $"<var>{um.Groups[1].Value}</var><sub>{um.Groups[2].Value}</sub>";

            // Letters + digits: x21→x₂₁, bs1→bs₁, cs3→cs₃
            var nm = Regex.Match(name, @"^([a-zA-Z_]+?)(\d+)$");
            if (nm.Success)
            {
                var baseName = nm.Groups[1].Value;
                var digits = nm.Groups[2].Value;
                if (GreekLetters.TryGetValue(baseName, out var g))
                    return $"<var>{g}</var><sub>{digits}</sub>";
                return $"<var>{baseName}</var><sub>{digits}</sub>";
            }

            // Function notation: f_x → f(x), g_t → g(t) — ONLY for common math functions
            // with single-letter variable subscript (x, y, z, t, r, s, u, v, w)
            var funcM = Regex.Match(name, @"^([fghFGH])_([xyztrsuv])$");
            if (funcM.Success)
                return $"<var>{funcM.Groups[1].Value}</var>(<var>{funcM.Groups[2].Value}</var>)";

            // Underscore subscript: k_s→k_s, F_global→F_{global}, nu_xy→ν_{xy}
            var underM = Regex.Match(name, @"^(\w+?)_(\w+)$");
            if (underM.Success)
            {
                var basePart = underM.Groups[1].Value;
                var subPart = underM.Groups[2].Value;
                string baseHtml;
                if (GreekLetters.TryGetValue(basePart, out var gBase))
                    baseHtml = $"<var>{gBase}</var>";
                else
                    baseHtml = $"<var>{HttpUtility.HtmlEncode(basePart)}</var>";
                // Subscript part: also check for Greek
                string subHtml;
                if (GreekLetters.TryGetValue(subPart, out var gSub))
                    subHtml = gSub;
                else
                    subHtml = HttpUtility.HtmlEncode(subPart);
                return $"{baseHtml}<sub>{subHtml}</sub>";
            }

            return $"<var>{HttpUtility.HtmlEncode(name)}</var>";
        }

        /// <summary>
        /// Create Hekatan-style fraction HTML using .dvc/.dvr/.dvl classes
        /// </summary>
        private static string MakeFractionHtml(string numerator, string denominator)
        {
            return $"<span class=\"dvc\"><span class=\"dvr\">{numerator}</span>" +
                   $"<span class=\"dvl\"></span>" +
                   $"<span class=\"dvr\">{denominator}</span></span>";
        }

        /// <summary>
        /// Find top-level division in expression (respecting parentheses)
        /// </summary>
        private static (string num, string den)? FindTopLevelDivision(string expr)
        {
            int depth = 0;
            for (int i = expr.Length - 1; i >= 0; i--)
            {
                char c = expr[i];
                if (c == ')' || c == ']') depth++;
                else if (c == '(' || c == '[') depth--;
                else if (c == '/' && depth == 0 && i > 0 && i < expr.Length - 1)
                {
                    if (i > 0 && expr[i - 1] == '/') continue; // skip //
                    var num = expr[..i].Trim();
                    var den = expr[(i + 1)..].Trim();
                    if (num.Length > 0 && den.Length > 0)
                        return (num, den);
                }
            }
            return null;
        }

        /// <summary>
        /// Format individual tokens in a math expression (variables→var, numbers→b, *→·)
        /// </summary>
        private static string FormatMathTokens(string expr)
        {
            if (string.IsNullOrWhiteSpace(expr)) return "";

            // Protect existing HTML tags AND HTML entities (from ExprToMathHtml pow/sqrt) using control chars
            var tagMap = new Dictionary<string, string>();
            int tagIdx = 0;
            // Protect HTML tags
            expr = Regex.Replace(expr, @"</?(?:sup|sub|b|i|span|var|em|strong|p|div)(?:\s[^>]*)?>", m =>
            {
                var key = $"\x01{(char)(0x10 + tagIdx++)}\x01";
                tagMap[key] = m.Value;
                return key;
            });
            // Protect HTML entities (&radic; &middot; &part; etc.)
            expr = Regex.Replace(expr, @"&\w+;", m =>
            {
                var key = $"\x01{(char)(0x10 + tagIdx++)}\x01";
                tagMap[key] = m.Value;
                return key;
            });

            var sb = new StringBuilder();
            var parts = Regex.Split(expr, @"(\b[a-zA-Z_]\w*\b)");
            foreach (var p in parts)
            {
                if (string.IsNullOrEmpty(p)) continue;
                if (Regex.IsMatch(p, @"^[a-zA-Z_]\w*$"))
                {
                    if (Keywords.Contains(p) || Types.Contains(p))
                        sb.Append(HttpUtility.HtmlEncode(p));
                    else if (GreekLetters.TryGetValue(p, out var g))
                        sb.Append($"<var>{g}</var>");
                    else
                        sb.Append(FormatVarHtml(p));
                }
                else
                {
                    var formatted = p.Replace("*", " &middot; ");
                    formatted = Regex.Replace(formatted, @"(\d+\.?\d*(?:[eE][+-]?\d+)?)", "<b>$1</b>");
                    sb.Append(formatted);
                }
            }

            var result = sb.ToString();

            // Restore protected HTML tags
            foreach (var kv in tagMap)
                result = result.Replace(kv.Key, kv.Value);

            // Simplify repeated multiplication on final HTML:
            // <var>x</var> · <var>x</var> · <var>x</var> → <var>x</var><sup>3</sup>
            result = Regex.Replace(result, @"(<var>[^<]+</var>)\s*&middot;\s*\1\s*&middot;\s*\1", "$1<sup>3</sup>");
            // <var>x</var> · <var>x</var> → <var>x</var><sup>2</sup>
            result = Regex.Replace(result, @"(<var>[^<]+</var>)\s*&middot;\s*\1", "$1<sup>2</sup>");

            return result;
        }

        /// <summary>
        /// Convert a C++ math expression to Hekatan-style HTML.
        /// Handles fractions, powers, sqrt, Greek letters, subscripts.
        /// </summary>
        private static string ExprToMathHtml(string cppExpr)
        {
            if (string.IsNullOrWhiteSpace(cppExpr)) return "";
            cppExpr = cppExpr.Trim().TrimEnd(';').Trim();

            // pow(x, n) → x^n
            cppExpr = Regex.Replace(cppExpr, @"pow\(\s*([^,]+?)\s*,\s*(\d+)\s*\)", "$1<sup>$2</sup>");
            // sqrt(x) → √(x)
            cppExpr = Regex.Replace(cppExpr, @"sqrt\(\s*([^)]+)\s*\)", "&radic;($1)");
            // abs(x) → |x|
            cppExpr = Regex.Replace(cppExpr, @"abs\(\s*([^)]+)\s*\)", "|$1|");

            // Strip outer parens if they wrap entire expression
            if (cppExpr.StartsWith("(") && cppExpr.EndsWith(")"))
            {
                int d = 0;
                bool wrapsAll = true;
                for (int i = 0; i < cppExpr.Length - 1; i++)
                {
                    if (cppExpr[i] == '(') d++;
                    else if (cppExpr[i] == ')') d--;
                    if (d == 0 && i < cppExpr.Length - 1) { wrapsAll = false; break; }
                }
                if (wrapsAll) cppExpr = cppExpr[1..^1].Trim();
            }

            // Try fraction detection
            var frac = FindTopLevelDivision(cppExpr);
            if (frac != null)
            {
                var numHtml = FormatMathTokens(frac.Value.num);
                var denHtml = FormatMathTokens(frac.Value.den);
                return MakeFractionHtml(numHtml, denHtml);
            }

            return FormatMathTokens(cppExpr);
        }

        /// <summary>
        /// Convert a C++ expression to readable Octave/MATLAB code (plain text, not HTML).
        /// Keeps it simple: zeros(), for i=1:N, abs(), norm(), x^3, etc.
        /// </summary>
        private static string ExprToOctave(string cppExpr)
        {
            if (string.IsNullOrWhiteSpace(cppExpr)) return "";
            var expr = cppExpr.Trim().TrimEnd(';').Trim();

            // 1. Strip Eigen/std namespaces
            expr = Regex.Replace(expr, @"(std|Eigen)::", "");

            // 2. Eigen static constructors → Octave functions
            expr = Regex.Replace(expr, @"MatrixXd::Zero\(\s*(\w+)\s*,\s*(\w+)\s*\)", "zeros($1, $2)");
            expr = Regex.Replace(expr, @"VectorXd::Zero\(\s*(\w+)\s*\)", "zeros($1, 1)");
            expr = Regex.Replace(expr, @"Matrix(\d)d::Zero\(\)", "zeros($1, $1)");
            expr = Regex.Replace(expr, @"MatrixXd::Identity\(\s*(\w+)\s*,\s*(\w+)\s*\)", "eye($1, $2)");
            expr = Regex.Replace(expr, @"MatrixXd::Ones\(\s*(\w+)\s*,\s*(\w+)\s*\)", "ones($1, $2)");

            // 3. Eigen constructors: MatrixXd varName(r, c) → zeros(r, c)
            expr = Regex.Replace(expr, @"MatrixXd\s+(\w+)\(\s*(\w+)\s*,\s*(\w+)\s*\)", "$1 = zeros($2, $3)");
            expr = Regex.Replace(expr, @"Matrix(\d)d\s+(\w+)", "$2 = zeros($1, $1)");
            expr = Regex.Replace(expr, @"Vector(\d)d\s+(\w+)\(([^)]+)\)", "$2 = [$3]");

            // 4. Method calls on objects
            expr = Regex.Replace(expr, @"(\w+)\.transpose\(\)", "$1'");
            expr = Regex.Replace(expr, @"(\w+)\.inverse\(\)", "inv($1)");
            expr = Regex.Replace(expr, @"\(([^)]+)\)\.norm\(\)", "norm($1)");
            expr = Regex.Replace(expr, @"(\w+)\.norm\(\)", "norm($1)");
            expr = Regex.Replace(expr, @"(\w+)\.determinant\(\)", "det($1)");
            expr = Regex.Replace(expr, @"(\w+)\.rows\(\)", "size($1, 1)");
            expr = Regex.Replace(expr, @"(\w+)\.cols\(\)", "size($1, 2)");
            expr = Regex.Replace(expr, @"(\w+)\.setZero\(\)", "$1 = zeros(size($1))");
            expr = Regex.Replace(expr, @"(\w+)\.size\(\)", "length($1)");

            // 5. Math functions
            expr = Regex.Replace(expr, @"abs\(", "abs(");  // already clean after std:: strip
            expr = Regex.Replace(expr, @"pow\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)", "($1)^($2)");
            // sqrt, sin, cos, etc. are the same in Octave — no change needed

            // 6. Repeated multiplication → power
            expr = Regex.Replace(expr, @"\b(\w+)\s*\*\s*\1\s*\*\s*\1\b", "$1^3");
            expr = Regex.Replace(expr, @"\b(\w+)\s*\*\s*\1\b", "$1^2");

            // 7a. Double array index with NUMERIC indices: nodes[0][0] → nodes(1,1)
            expr = Regex.Replace(expr, @"(\w+)\[(\d+)\]\[(\d+)\]", m =>
            {
                var name = m.Groups[1].Value;
                var i = int.Parse(m.Groups[2].Value) + 1;
                var j = int.Parse(m.Groups[3].Value) + 1;
                return $"{name}({i},{j})";
            });
            // 7b. Double array index with VARIABLE indices
            expr = Regex.Replace(expr, @"(\w+)\[([a-zA-Z_]\w*)\]\[([a-zA-Z_]\w*)\]", "$1($2+1,$3+1)");
            // 7c. Single index numeric
            expr = Regex.Replace(expr, @"(\w+)\[(\d+)\]", m =>
            {
                var name = m.Groups[1].Value;
                var i = int.Parse(m.Groups[2].Value) + 1;
                return $"{name}({i})";
            });
            // 7d. Single index variable
            expr = Regex.Replace(expr, @"(\w+)\[([a-zA-Z_]\w*)\]", "$1($2+1)");

            // 8. Compound assignments: K(0, i * dofsPerNode) += bi * D_coeff → K(1, i * dofsPerNode) = K(1, i * dofsPerNode) + bi * D_coeff
            // Process each compound op by finding first occurrence with whitespace boundary
            foreach (var (cop, sop) in new[] { (" *= ", " * "), (" += ", " + "), (" -= ", " - "), (" /= ", " / ") })
            {
                int idx = expr.IndexOf(cop);
                if (idx > 0)
                {
                    var lhs = expr.Substring(0, idx).Trim();
                    var rhs = expr.Substring(idx + cop.Length).Trim();
                    expr = $"{lhs} = {lhs}{sop}{rhs}";
                }
            }

            // 9. Increment/decrement
            expr = Regex.Replace(expr, @"\+\+(\w+)", "$1 = $1 + 1");
            expr = Regex.Replace(expr, @"(\w+)\+\+", "$1 = $1 + 1");
            expr = Regex.Replace(expr, @"--(\w+)", "$1 = $1 - 1");
            expr = Regex.Replace(expr, @"(\w+)--", "$1 = $1 - 1");

            // 10. Strip remaining C++ type keywords
            expr = Regex.Replace(expr, @"\b(const|double|int|float|auto|unsigned|signed|long|short|size_t|void|bool)\s+", "");

            // 11. Clean up: << (stream) → remove, endl → remove
            expr = Regex.Replace(expr, @"cerr\s*<<.*", "% (warning message)");
            expr = Regex.Replace(expr, @"cout\s*<<.*", "% (print)");

            // 12. throw → error()
            expr = Regex.Replace(expr, @"throw\s+runtime_error\(\s*""([^""]*)""\s*\)", "error(\"$1\")");

            return expr.Trim();
        }

        /// <summary>
        /// Convert Eigen matrix &lt;&lt; block to Octave matrix literal: var = [r1; r2; r3]
        /// </summary>
        private static string ProcessMatrixToOctave(string matrixCode)
        {
            var m = Regex.Match(matrixCode, @"(\w+)\s*<<\s*(.+)", RegexOptions.Singleline);
            if (!m.Success) return ExprToOctave(matrixCode);

            var varName = m.Groups[1].Value;
            var valuesStr = m.Groups[2].Value.TrimEnd(';').Trim();
            var values = valuesStr.Split(',').Select(v => ExprToOctave(v.Trim())).Where(v => v.Length > 0).ToList();

            int n = (int)Math.Round(Math.Sqrt(values.Count));
            if (n * n != values.Count) n = values.Count <= 4 ? 2 : values.Count <= 9 ? 3 : (int)Math.Ceiling(Math.Sqrt(values.Count));
            int cols = Math.Max(n, 1);

            var sb = new StringBuilder();
            sb.Append($"{varName} = [");
            for (int i = 0; i < values.Count; i++)
            {
                if (i > 0 && i % cols == 0) sb.Append("; ");
                else if (i > 0) sb.Append(", ");
                sb.Append(values[i]);
            }
            sb.Append("];");
            return sb.ToString();
        }

        /// <summary>
        /// Extract plain parameter names from C++ signature: "const vector&lt;Node&gt; &amp;nodes, double E" → "nodes, E"
        /// </summary>
        private static string FormatParamsPlainNames(string paramsStr)
        {
            if (string.IsNullOrWhiteSpace(paramsStr)) return "";
            var parts = paramsStr.Split(',');
            var result = new List<string>();
            foreach (var p in parts)
            {
                var words = p.Trim().Split(new[] { ' ', '*', '&' }, StringSplitOptions.RemoveEmptyEntries);
                if (words.Length > 0)
                    result.Add(words[^1]); // last word = parameter name
            }
            return string.Join(", ", result);
        }

        /// <summary>
        /// Process an Eigen matrix &lt;&lt; block into Hekatan-style matrix HTML
        /// </summary>
        private static string ProcessMatrixToMathHtml(string matrixCode)
        {
            var m = Regex.Match(matrixCode, @"(\w+)\s*<<\s*(.+)", RegexOptions.Singleline);
            if (!m.Success) return $"<p class=\"eq\">{FormatMathTokens(matrixCode)}</p>";

            var varName = m.Groups[1].Value;
            var valuesStr = m.Groups[2].Value.TrimEnd(';').Trim();
            var values = valuesStr.Split(',').Select(v => v.Trim()).Where(v => v.Length > 0).ToList();

            int n = (int)Math.Round(Math.Sqrt(values.Count));
            if (n * n != values.Count) n = values.Count <= 4 ? 2 : values.Count <= 9 ? 3 : (int)Math.Ceiling(Math.Sqrt(values.Count));
            int cols = Math.Max(n, 1);
            int rows = values.Count / cols;
            if (rows * cols < values.Count) rows++;

            var sb = new StringBuilder();
            sb.Append($"<p class=\"eq\">{FormatVarHtml(varName)} = ");
            sb.Append("<span class=\"matrix\">");
            // Top bracket row
            sb.Append("<span class=\"tr\">");
            sb.Append("<span class=\"td\">&nbsp;</span>");
            for (int c = 0; c < cols; c++) sb.Append("<span class=\"td\">&nbsp;</span>");
            sb.Append("<span class=\"td\">&nbsp;</span></span>");
            // Data rows
            for (int r = 0; r < rows; r++)
            {
                sb.Append("<span class=\"tr\"><span class=\"td\">&nbsp;</span>");
                for (int c = 0; c < cols; c++)
                {
                    int idx = r * cols + c;
                    var val = idx < values.Count ? FormatMathTokens(values[idx]) : "";
                    sb.Append($"<span class=\"td\">{val}</span>");
                }
                sb.Append("<span class=\"td\">&nbsp;</span></span>");
            }
            // Bottom bracket row
            sb.Append("<span class=\"tr\">");
            sb.Append("<span class=\"td\">&nbsp;</span>");
            for (int c = 0; c < cols; c++) sb.Append("<span class=\"td\">&nbsp;</span>");
            sb.Append("<span class=\"td\">&nbsp;</span></span>");
            sb.Append("</span></p>");
            return sb.ToString();
        }

        /// <summary>
        /// Generate a three-column grid row (C++ code | Hekatan math | Octave code)
        /// </summary>
        private static string MakeGridRow(string mathHtml, string codeHtml, string octaveCode = "", string comment = "", bool isTitle = false)
        {
            var sb = new StringBuilder();
            if (!string.IsNullOrEmpty(comment))
                sb.Append($"<div class=\"ce-comment\">{HttpUtility.HtmlEncode(comment)}</div>");
            var cls = isTitle ? "ce-row ce-title-bg" : "ce-row";
            var octaveHtml = string.IsNullOrEmpty(octaveCode) ? "" : HttpUtility.HtmlEncode(octaveCode);
            sb.Append($"<div class=\"{cls}\">" +
                       $"<div class=\"ce-code\"><pre><code>{codeHtml}</code></pre></div>" +
                       $"<div class=\"ce-math\">{mathHtml}</div>" +
                       $"<div class=\"ce-octave\"><pre><code>{octaveHtml}</code></pre></div></div>");
            return sb.ToString();
        }

        /// <summary>
        /// Generate Hekatan-style output row.
        /// showCode=true shows C++ source above the equation.
        /// </summary>
        private static string MakeHekatanRow(string mathHtml, string codeHtml = "", string comment = "", bool showCode = false, bool isTitle = false)
        {
            var sb = new StringBuilder();
            if (!string.IsNullOrEmpty(comment))
                sb.Append($"<p style=\"color:#888;font-style:italic;font-family:'Segoe UI',sans-serif;font-size:10pt;margin:8px 0 2px\">{HttpUtility.HtmlEncode(comment)}</p>");
            if (showCode && !string.IsNullOrEmpty(codeHtml))
                sb.Append($"<pre class=\"ce-src\"><code>{codeHtml}</code></pre>");
            sb.Append(mathHtml);
            return sb.ToString();
        }

        /// <summary>
        /// Format function parameters for math display: "double E, double nu" → "E, ν"
        /// </summary>
        private static string FormatParamsForMath(string paramsStr)
        {
            if (string.IsNullOrWhiteSpace(paramsStr)) return "";
            var parts = paramsStr.Split(',');
            var result = new List<string>();
            foreach (var p in parts)
            {
                var words = p.Trim().Split(new[] { ' ', '*', '&' }, StringSplitOptions.RemoveEmptyEntries);
                if (words.Length > 0)
                    result.Add(FormatVarHtml(words[^1]));
            }
            return string.Join(", ", result);
        }

        #endregion

        #region C++ Compile and Execute

        /// <summary>
        /// Compile and execute C++ code with g++, returning computed variable values.
        /// Wraps user code in main(), adds printf for each variable automatically.
        /// </summary>
        private static Dictionary<string, string> CompileAndExecuteCpp(string code)
        {
            var values = new Dictionary<string, string>();
            var lines = code.Split('\n');

            // Build compilable program
            var program = new StringBuilder();
            program.AppendLine("#include <cstdio>");
            program.AppendLine("#include <cmath>");
            program.AppendLine("int main() {");

            foreach (var rawLine in lines)
            {
                var line = rawLine.Trim();
                if (string.IsNullOrWhiteSpace(line)) continue;
                if (line.StartsWith("//") || line.StartsWith("/*") || line.StartsWith("*")) continue;
                if (line == "{" || line == "}" || line == "};") continue;
                if (line.StartsWith("#")) continue;

                // Ensure line ends with ; for valid C++
                var codeLine = line.TrimEnd(';').TrimEnd() + ";";
                program.AppendLine($"    {codeLine}");

                // Detect variable to print
                string? varName = null;

                // Variable declaration: type name = expr;
                var declMatch = Regex.Match(codeLine, @"^(?:const\s+)?(?:double|float|int|long|unsigned|auto|size_t)\s+(\w+)\s*=");
                if (declMatch.Success)
                    varName = declMatch.Groups[1].Value;

                // Simple assignment: name = expr; (no type keyword)
                if (varName == null)
                {
                    var assignMatch = Regex.Match(codeLine, @"^(\w+)\s*[+\-*\/]?=\s*[^=]");
                    if (assignMatch.Success && !Regex.IsMatch(codeLine, @"^(if|for|while|return|printf|cout)\b"))
                        varName = assignMatch.Groups[1].Value;
                }

                if (varName != null)
                    program.AppendLine($"    printf(\"__CPP__{varName}=%.15g\\n\", (double){varName});");
            }

            program.AppendLine("    return 0;");
            program.AppendLine("}");

            // Write, compile, execute
            string tempDir = Path.GetTempPath();
            string id = Guid.NewGuid().ToString("N")[..8];
            string srcFile = Path.Combine(tempDir, $"calcpad_cpp_{id}.cpp");
            string exeFile = Path.ChangeExtension(srcFile, ".exe");

            try
            {
                File.WriteAllText(srcFile, program.ToString());

                // Compile with g++
                using var compile = new Process();
                compile.StartInfo = new ProcessStartInfo
                {
                    FileName = "g++",
                    Arguments = $"-O2 -o \"{exeFile}\" \"{srcFile}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                compile.Start();
                compile.WaitForExit(10000);
                if (compile.ExitCode != 0) return values;

                // Run
                using var run = new Process();
                run.StartInfo = new ProcessStartInfo
                {
                    FileName = exeFile,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                run.Start();
                var output = run.StandardOutput.ReadToEnd();
                run.WaitForExit(5000);

                // Parse __CPP__varName=value lines
                foreach (var outLine in output.Split('\n'))
                {
                    var trimmed = outLine.Trim();
                    if (trimmed.StartsWith("__CPP__"))
                    {
                        var eqPos = trimmed.IndexOf('=', 7);
                        if (eqPos > 7)
                        {
                            var name = trimmed.Substring(7, eqPos - 7);
                            var val = trimmed.Substring(eqPos + 1).Trim();
                            values[name] = FormatNumericValue(val);
                        }
                    }
                }
            }
            catch { /* g++ not available or compilation failed - graceful degradation */ }
            finally
            {
                try { if (File.Exists(srcFile)) File.Delete(srcFile); } catch { }
                try { if (File.Exists(exeFile)) File.Delete(exeFile); } catch { }
            }

            return values;
        }

        /// <summary>
        /// Format numeric value: 2.0 → "2", 10070.3325 → "10070.3325"
        /// </summary>
        private static string FormatNumericValue(string value)
        {
            if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
            {
                if (d == Math.Floor(d) && Math.Abs(d) < 1e15)
                    return ((long)d).ToString();
                return d.ToString("G10", CultureInfo.InvariantCulture);
            }
            return value;
        }

        #endregion

        #region Tokenizer

        public static List<Token> Tokenize(string code)
        {
            var tokens = new List<Token>();
            int i = 0;
            int line = 1;
            int column = 1;

            while (i < code.Length)
            {
                char c = code[i];

                // Newline
                if (c == '\n')
                {
                    tokens.Add(new Token(TokenType.Newline, "\n", line, column));
                    i++;
                    line++;
                    column = 1;
                    continue;
                }

                // Whitespace
                if (char.IsWhiteSpace(c))
                {
                    int start = i;
                    while (i < code.Length && char.IsWhiteSpace(code[i]) && code[i] != '\n')
                    {
                        i++;
                        column++;
                    }
                    tokens.Add(new Token(TokenType.Whitespace, code.Substring(start, i - start), line, column - (i - start)));
                    continue;
                }

                // Single-line comment
                if (c == '/' && i + 1 < code.Length && code[i + 1] == '/')
                {
                    int start = i;
                    while (i < code.Length && code[i] != '\n')
                        i++;
                    tokens.Add(new Token(TokenType.Comment, code.Substring(start, i - start), line, column));
                    column += i - start;
                    continue;
                }

                // Multi-line comment
                if (c == '/' && i + 1 < code.Length && code[i + 1] == '*')
                {
                    int start = i;
                    i += 2;
                    while (i + 1 < code.Length && !(code[i] == '*' && code[i + 1] == '/'))
                    {
                        if (code[i] == '\n') { line++; column = 1; }
                        else column++;
                        i++;
                    }
                    if (i + 1 < code.Length) i += 2;
                    tokens.Add(new Token(TokenType.Comment, code.Substring(start, i - start), line, column));
                    continue;
                }

                // Preprocessor directive
                if (c == '#')
                {
                    int start = i;
                    while (i < code.Length && code[i] != '\n')
                        i++;
                    tokens.Add(new Token(TokenType.Preprocessor, code.Substring(start, i - start), line, column));
                    column += i - start;
                    continue;
                }

                // String literal
                if (c == '"')
                {
                    int start = i;
                    i++;
                    while (i < code.Length && (code[i] != '"' || code[i - 1] == '\\'))
                        i++;
                    if (i < code.Length) i++;
                    tokens.Add(new Token(TokenType.String, code.Substring(start, i - start), line, column));
                    column += i - start;
                    continue;
                }

                // Character literal
                if (c == '\'')
                {
                    int start = i;
                    i++;
                    while (i < code.Length && (code[i] != '\'' || code[i - 1] == '\\'))
                        i++;
                    if (i < code.Length) i++;
                    tokens.Add(new Token(TokenType.String, code.Substring(start, i - start), line, column));
                    column += i - start;
                    continue;
                }

                // Number
                if (char.IsDigit(c) || (c == '.' && i + 1 < code.Length && char.IsDigit(code[i + 1])))
                {
                    int start = i;
                    // Hex number
                    if (c == '0' && i + 1 < code.Length && (code[i + 1] == 'x' || code[i + 1] == 'X'))
                    {
                        i += 2;
                        while (i < code.Length && (char.IsDigit(code[i]) || (code[i] >= 'a' && code[i] <= 'f') || (code[i] >= 'A' && code[i] <= 'F')))
                            i++;
                    }
                    else
                    {
                        while (i < code.Length && (char.IsDigit(code[i]) || code[i] == '.' || code[i] == 'e' || code[i] == 'E' || code[i] == '+' || code[i] == '-'))
                        {
                            if ((code[i] == '+' || code[i] == '-') && i > start && code[i - 1] != 'e' && code[i - 1] != 'E')
                                break;
                            i++;
                        }
                    }
                    // Type suffix (f, l, u, etc.)
                    while (i < code.Length && (code[i] == 'f' || code[i] == 'F' || code[i] == 'l' || code[i] == 'L' || code[i] == 'u' || code[i] == 'U'))
                        i++;
                    tokens.Add(new Token(TokenType.Number, code.Substring(start, i - start), line, column));
                    column += i - start;
                    continue;
                }

                // Identifier or keyword
                if (char.IsLetter(c) || c == '_')
                {
                    int start = i;
                    while (i < code.Length && (char.IsLetterOrDigit(code[i]) || code[i] == '_'))
                        i++;
                    string word = code.Substring(start, i - start);
                    TokenType type = Keywords.Contains(word) ? TokenType.Keyword :
                                     Types.Contains(word) ? TokenType.Type :
                                     TokenType.Identifier;
                    tokens.Add(new Token(type, word, line, column));
                    column += i - start;
                    continue;
                }

                // Multi-character operators
                if (i + 2 < code.Length)
                {
                    string threeChar = code.Substring(i, 3);
                    if (threeChar == "<<=" || threeChar == ">>=")
                    {
                        tokens.Add(new Token(TokenType.Operator, threeChar, line, column));
                        i += 3;
                        column += 3;
                        continue;
                    }
                }

                if (i + 1 < code.Length)
                {
                    string twoChar = code.Substring(i, 2);
                    if (Operators.Contains(twoChar))
                    {
                        tokens.Add(new Token(TokenType.Operator, twoChar, line, column));
                        i += 2;
                        column += 2;
                        continue;
                    }
                }

                // Single-character operator or punctuation
                string oneChar = c.ToString();
                if (Operators.Contains(oneChar))
                {
                    tokens.Add(new Token(TokenType.Operator, oneChar, line, column));
                }
                else if (c == '(' || c == ')' || c == '{' || c == '}' || c == '[' || c == ']' || c == ';' || c == ',')
                {
                    tokens.Add(new Token(TokenType.Punctuation, oneChar, line, column));
                }
                else
                {
                    tokens.Add(new Token(TokenType.Unknown, oneChar, line, column));
                }
                i++;
                column++;
            }

            return tokens;
        }

        #endregion

        #region Syntax Highlighting

        /// <summary>
        /// Generates HTML with syntax highlighting for C++ code
        /// </summary>
        public static string GenerateSyntaxHighlightedHtml(string code)
        {
            var tokens = Tokenize(code);
            var sb = new StringBuilder();

            foreach (var token in tokens)
            {
                var escapedValue = HttpUtility.HtmlEncode(token.Value);
                var cssClass = GetCssClass(token.Type);

                if (token.Type == TokenType.Newline)
                {
                    sb.Append("\n");
                }
                else if (token.Type == TokenType.Whitespace)
                {
                    sb.Append(token.Value);
                }
                else
                {
                    sb.Append($"<span class=\"{cssClass}\">{escapedValue}</span>");
                }
            }

            return sb.ToString();
        }

        private static string GetCssClass(TokenType type) => type switch
        {
            TokenType.Keyword => "cpp-keyword",
            TokenType.Identifier => "cpp-identifier",
            TokenType.Number => "cpp-number",
            TokenType.String => "cpp-string",
            TokenType.Operator => "cpp-operator",
            TokenType.Punctuation => "cpp-punctuation",
            TokenType.Comment => "cpp-comment",
            TokenType.Preprocessor => "cpp-preprocessor",
            TokenType.Type => "cpp-type",
            _ => "cpp-text"
        };

        #endregion

        #region Code Explanation

        /// <summary>
        /// Translates C++ code to pseudocode in the specified language
        /// </summary>
        public static string Explain(string code, ExplainLanguage target = ExplainLanguage.Spanish)
        {
            var lines = code.Split('\n');
            var result = new StringBuilder();
            int indentLevel = 0;

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrWhiteSpace(trimmed))
                {
                    result.AppendLine();
                    continue;
                }

                // Adjust indent for closing braces
                if (trimmed.StartsWith("}"))
                    indentLevel = Math.Max(0, indentLevel - 1);

                var indent = new string(' ', indentLevel * 4);
                var explained = ExplainLine(trimmed, target, indentLevel);

                if (!string.IsNullOrEmpty(explained))
                {
                    result.AppendLine(indent + explained);
                }

                // Adjust indent for opening braces
                if (trimmed.EndsWith("{"))
                    indentLevel++;
            }

            return result.ToString();
        }

        private static string ExplainLine(string line, ExplainLanguage target, int indent)
        {
            // Handle comments
            if (line.StartsWith("//"))
            {
                var comment = line.Substring(2).Trim();
                return target == ExplainLanguage.Spanish ? $"' {comment}" :
                       target == ExplainLanguage.Python ? $"# {comment}" :
                       $"% {comment}";
            }

            // Handle preprocessor directives
            if (line.StartsWith("#include"))
            {
                var lib = Regex.Match(line, @"[<""](.+)[>""]").Groups[1].Value;
                return target switch
                {
                    ExplainLanguage.Spanish => $"' Incluir libreria: {lib}",
                    ExplainLanguage.English => $"' Include library: {lib}",
                    ExplainLanguage.Python => $"import {lib.Replace(".h", "").Replace("<", "").Replace(">", "")}",
                    _ => $"% Import: {lib}"
                };
            }

            if (line.StartsWith("#define"))
            {
                var match = Regex.Match(line, @"#define\s+(\w+)\s+(.+)");
                if (match.Success)
                {
                    var name = match.Groups[1].Value;
                    var value = match.Groups[2].Value;
                    return target switch
                    {
                        ExplainLanguage.Spanish => $"' Constante {name} = {value}",
                        ExplainLanguage.English => $"' Constant {name} = {value}",
                        ExplainLanguage.Python => $"{name} = {value}  # constante",
                        _ => $"{name} = {value};  % constante"
                    };
                }
            }

            // Handle for loops
            var forMatch = Regex.Match(line, @"for\s*\(\s*(?:int\s+)?(\w+)\s*=\s*(\d+)\s*;\s*\w+\s*([<>=]+)\s*(\w+)\s*;\s*\w+(\+\+|--|\+=\d+|-=\d+)\s*\)");
            if (forMatch.Success)
            {
                var varName = forMatch.Groups[1].Value;
                var startVal = forMatch.Groups[2].Value;
                var comparison = forMatch.Groups[3].Value;
                var endVal = forMatch.Groups[4].Value;
                var increment = forMatch.Groups[5].Value;

                return target switch
                {
                    ExplainLanguage.Spanish => $"PARA {varName} DESDE {startVal} HASTA {endVal}:",
                    ExplainLanguage.English => $"FOR {varName} FROM {startVal} TO {endVal}:",
                    ExplainLanguage.MATLAB => $"for {varName} = {startVal}:{endVal}",
                    ExplainLanguage.Python => $"for {varName} in range({startVal}, {endVal}):",
                    _ => line
                };
            }

            // Handle while loops
            var whileMatch = Regex.Match(line, @"while\s*\((.+)\)");
            if (whileMatch.Success)
            {
                var condition = TranslateExpression(whileMatch.Groups[1].Value, target);
                return target switch
                {
                    ExplainLanguage.Spanish => $"MIENTRAS ({condition}):",
                    ExplainLanguage.English => $"WHILE ({condition}):",
                    ExplainLanguage.MATLAB => $"while {condition}",
                    ExplainLanguage.Python => $"while {condition}:",
                    _ => line
                };
            }

            // Handle if statements
            var ifMatch = Regex.Match(line, @"if\s*\((.+)\)");
            if (ifMatch.Success)
            {
                var condition = TranslateExpression(ifMatch.Groups[1].Value, target);
                return target switch
                {
                    ExplainLanguage.Spanish => $"SI ({condition}) ENTONCES:",
                    ExplainLanguage.English => $"IF ({condition}) THEN:",
                    ExplainLanguage.MATLAB => $"if {condition}",
                    ExplainLanguage.Python => $"if {condition}:",
                    _ => line
                };
            }

            // Handle else if
            var elseIfMatch = Regex.Match(line, @"else\s+if\s*\((.+)\)");
            if (elseIfMatch.Success)
            {
                var condition = TranslateExpression(elseIfMatch.Groups[1].Value, target);
                return target switch
                {
                    ExplainLanguage.Spanish => $"SINO SI ({condition}):",
                    ExplainLanguage.English => $"ELSE IF ({condition}):",
                    ExplainLanguage.MATLAB => $"elseif {condition}",
                    ExplainLanguage.Python => $"elif {condition}:",
                    _ => line
                };
            }

            // Handle else
            if (line.Trim() == "else" || line.Trim() == "else {")
            {
                return target switch
                {
                    ExplainLanguage.Spanish => "SINO:",
                    ExplainLanguage.English => "ELSE:",
                    ExplainLanguage.MATLAB => "else",
                    ExplainLanguage.Python => "else:",
                    _ => line
                };
            }

            // Handle function definitions
            var funcMatch = Regex.Match(line, @"(\w+)\s+(\w+)\s*\(([^)]*)\)\s*\{?");
            if (funcMatch.Success && Types.Contains(funcMatch.Groups[1].Value))
            {
                var returnType = TranslateType(funcMatch.Groups[1].Value, target);
                var funcName = funcMatch.Groups[2].Value;
                var params_ = funcMatch.Groups[3].Value;
                var translatedParams = TranslateParameters(params_, target);

                return target switch
                {
                    ExplainLanguage.Spanish => $"FUNCION {funcName}({translatedParams}) -> {returnType}:",
                    ExplainLanguage.English => $"FUNCTION {funcName}({translatedParams}) -> {returnType}:",
                    ExplainLanguage.MATLAB => $"function [{funcName}_result] = {funcName}({translatedParams})",
                    ExplainLanguage.Python => $"def {funcName}({translatedParams}):",
                    _ => line
                };
            }

            // Handle return statements
            var returnMatch = Regex.Match(line, @"return\s+(.+);");
            if (returnMatch.Success)
            {
                var value = TranslateExpression(returnMatch.Groups[1].Value, target);
                return target switch
                {
                    ExplainLanguage.Spanish => $"RETORNAR {value}",
                    ExplainLanguage.English => $"RETURN {value}",
                    ExplainLanguage.MATLAB => $"return {value}",
                    ExplainLanguage.Python => $"return {value}",
                    _ => line
                };
            }

            // Handle variable declarations
            var declMatch = Regex.Match(line, @"(\w+)\s+(\w+)\s*=\s*(.+);");
            if (declMatch.Success && (Types.Contains(declMatch.Groups[1].Value) || declMatch.Groups[1].Value == "auto"))
            {
                var varType = TranslateType(declMatch.Groups[1].Value, target);
                var varName = declMatch.Groups[2].Value;
                var value = TranslateExpression(declMatch.Groups[3].Value, target);

                return target switch
                {
                    ExplainLanguage.Spanish => $"{varName} = {value}  ' ({varType})",
                    ExplainLanguage.English => $"{varName} = {value}  ' ({varType})",
                    ExplainLanguage.MATLAB => $"{varName} = {value};  % {varType}",
                    ExplainLanguage.Python => $"{varName} = {value}  # {varType}",
                    _ => line
                };
            }

            // Handle assignments
            var assignMatch = Regex.Match(line, @"(\w+(?:\[\w+\])?(?:\[\w+\])?)\s*=\s*(.+);");
            if (assignMatch.Success)
            {
                var varName = TranslateArrayAccess(assignMatch.Groups[1].Value, target);
                var value = TranslateExpression(assignMatch.Groups[2].Value, target);

                return $"{varName} = {value}";
            }

            // Handle closing braces
            if (line == "}" || line == "};")
            {
                return target switch
                {
                    ExplainLanguage.Spanish => "FIN",
                    ExplainLanguage.English => "END",
                    ExplainLanguage.MATLAB => "end",
                    ExplainLanguage.Python => "",
                    _ => ""
                };
            }

            // Handle opening braces (skip)
            if (line == "{")
                return "";

            // Default: return translated expression
            var translated = TranslateExpression(line.TrimEnd(';'), target);
            return translated;
        }

        private static string TranslateExpression(string expr, ExplainLanguage target)
        {
            var result = expr;

            // Translate operators
            foreach (var (op, translations) in OperatorTranslations)
            {
                if (translations.TryGetValue(target, out var translated))
                {
                    result = result.Replace(op, translated);
                }
            }

            // Translate array access [i][j] to (i,j) for MATLAB or [i,j] for pseudocode
            result = TranslateArrayAccess(result, target);

            // Translate function calls sqrt, pow, etc.
            result = TranslateMathFunctions(result, target);

            return result;
        }

        private static string TranslateArrayAccess(string expr, ExplainLanguage target)
        {
            // Match arr[i][j] pattern
            var doubleIndex = Regex.Replace(expr, @"(\w+)\[(\w+)\]\[(\w+)\]",
                target == ExplainLanguage.MATLAB ? "$1($2,$3)" :
                target == ExplainLanguage.Python ? "$1[$2,$3]" :
                "$1[$2,$3]");

            // Match arr[i] pattern
            var singleIndex = Regex.Replace(doubleIndex, @"(\w+)\[(\w+)\]",
                target == ExplainLanguage.MATLAB ? "$1($2)" :
                "$1[$2]");

            return singleIndex;
        }

        private static string TranslateMathFunctions(string expr, ExplainLanguage target)
        {
            // sqrt -> √ for Spanish/English, sqrt for others
            if (target == ExplainLanguage.Spanish || target == ExplainLanguage.English)
            {
                expr = Regex.Replace(expr, @"sqrt\(([^)]+)\)", "√($1)");
            }

            // pow(x, 2) -> x² for Spanish/English
            if (target == ExplainLanguage.Spanish || target == ExplainLanguage.English)
            {
                expr = Regex.Replace(expr, @"pow\(([^,]+),\s*2\)", "$1²");
                expr = Regex.Replace(expr, @"pow\(([^,]+),\s*(\d+)\)", "$1^$2");
            }
            else if (target == ExplainLanguage.MATLAB)
            {
                expr = Regex.Replace(expr, @"pow\(([^,]+),\s*(\d+)\)", "$1^$2");
            }
            else if (target == ExplainLanguage.Python)
            {
                expr = Regex.Replace(expr, @"pow\(([^,]+),\s*(\d+)\)", "$1**$2");
            }

            // cout << -> print
            if (target == ExplainLanguage.Python)
            {
                expr = Regex.Replace(expr, @"cout\s*<<\s*", "print(");
                expr = Regex.Replace(expr, @"\s*<<\s*endl", ")");
            }

            return expr;
        }

        private static string TranslateType(string cppType, ExplainLanguage target)
        {
            if (TypeTranslations.TryGetValue(cppType, out var translations))
            {
                if (translations.TryGetValue(target, out var translated))
                    return translated;
            }
            return cppType;
        }

        private static string TranslateParameters(string params_, ExplainLanguage target)
        {
            if (string.IsNullOrWhiteSpace(params_))
                return "";

            var parts = params_.Split(',');
            var translated = new List<string>();

            foreach (var part in parts)
            {
                var trimmed = part.Trim();
                // Match "type name" or "type* name" or "type& name"
                var match = Regex.Match(trimmed, @"(\w+)\s*[\*&]?\s*(\w+)");
                if (match.Success)
                {
                    var type = TranslateType(match.Groups[1].Value, target);
                    var name = match.Groups[2].Value;

                    if (target == ExplainLanguage.Spanish)
                        translated.Add($"{name}: {type}");
                    else if (target == ExplainLanguage.Python)
                        translated.Add($"{name}: {type}");
                    else
                        translated.Add(name);
                }
                else
                {
                    translated.Add(trimmed);
                }
            }

            return string.Join(", ", translated);
        }

        #endregion

        #region HTML Generation

        /// <summary>
        /// Generates complete HTML output for @{cpp} block (code with syntax highlighting)
        /// </summary>
        public static string ProcessCppBlock(string code)
        {
            var highlighted = GenerateSyntaxHighlightedHtml(code);

            return $@"
<div class=""cpp-block"">
    <div class=""cpp-header"">
        <span class=""cpp-label"">C++</span>
    </div>
    <pre class=""cpp-code"">{highlighted}</pre>
</div>
{GetCppStyles()}";
        }

        /// <summary>
        /// Generates complete HTML output for @{explain} block
        /// </summary>
        public static string ProcessExplainBlock(string code, string targetLanguage = "spanish")
        {
            var target = targetLanguage.ToLower() switch
            {
                "english" or "en" or "ingles" => ExplainLanguage.English,
                "matlab" or "octave" => ExplainLanguage.MATLAB,
                "python" or "py" => ExplainLanguage.Python,
                _ => ExplainLanguage.Spanish
            };

            var targetLabel = target switch
            {
                ExplainLanguage.English => "Pseudocode (English)",
                ExplainLanguage.MATLAB => "MATLAB/Octave",
                ExplainLanguage.Python => "Python",
                _ => "Pseudocodigo (Espanol)"
            };

            var explained = Explain(code, target);

            return $@"
<div class=""explain-block"">
    <div class=""explain-header"">
        <span class=""explain-label"">{targetLabel}</span>
        <span class=""explain-subtitle"">Traduccion automatica desde C++</span>
    </div>
    <pre class=""explain-code"">{HttpUtility.HtmlEncode(explained)}</pre>
</div>
{GetExplainStyles()}";
        }

        /// <summary>
        /// Generates HTML for @{cpp-explain} block: Hekatan-style equation output from C++ code.
        /// All C++ declarations are formatted as mathematical equations with computed values.
        /// Compiles and executes C++ code with g++ to obtain real computed values.
        /// </summary>
        public static string ProcessCppExplainBlock(string code, string targetLanguage = "spanish")
        {
            var isEnglish = targetLanguage.ToLower() switch
            {
                "english" or "en" or "ingles" => true,
                _ => false
            };

            // Compile and execute to get computed values
            var computedValues = CompileAndExecuteCpp(code);

            var lines = code.Split('\n');
            var sb = new StringBuilder();

            sb.Append(GetCppExplainStyles());
            sb.Append("<div class=\"ce-wrapper\">");

            string pendingComment = "";
            var matrixLines = new List<string>();
            bool inMatrix = false;

            for (int li = 0; li < lines.Length; li++)
            {
                var raw = lines[li];
                var line = raw.Trim();

                if (string.IsNullOrWhiteSpace(line)) continue;
                if (line == "{" || line == "}" || line == "};") continue;

                // (semicolon is standard C++ syntax, always required)

                // Comments → pending description
                if (line.StartsWith("//"))
                {
                    var commentText = line.Substring(2).Trim();
                    pendingComment = pendingComment.Length > 0
                        ? pendingComment + " | " + commentText
                        : commentText;
                    continue;
                }
                if (line.StartsWith("/*"))
                {
                    pendingComment = line.Replace("/*", "").Replace("*/", "").Trim();
                    continue;
                }

                // Preprocessor (#include, #define) → show as comment
                if (line.StartsWith("#"))
                {
                    var mathHtml = $"<p class=\"eq\" style=\"color:#888;font-style:italic\">{HttpUtility.HtmlEncode(line)}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // Eigen matrix << detection
                if (line.Contains("<<") && !line.Contains("cout") && !line.Contains("cerr"))
                {
                    matrixLines.Add(raw);
                    if (!line.TrimEnd().EndsWith(";"))
                    {
                        inMatrix = true;
                        continue;
                    }
                    var matCode = string.Join("\n", matrixLines);
                    var matMath = ProcessMatrixToMathHtml(matCode);
                    sb.Append(MakeHekatanRow(matMath, "", pendingComment));
                    pendingComment = "";
                    matrixLines.Clear();
                    continue;
                }
                if (inMatrix)
                {
                    matrixLines.Add(raw);
                    if (line.TrimEnd().EndsWith(";"))
                    {
                        var matCode = string.Join("\n", matrixLines);
                        var matMath = ProcessMatrixToMathHtml(matCode);
                        sb.Append(MakeHekatanRow(matMath, "", pendingComment));
                        pendingComment = "";
                        matrixLines.Clear();
                        inMatrix = false;
                    }
                    continue;
                }

                // Function signature
                var funcMatch = Regex.Match(line, @"^(\w[\w:<>,\s]*?)\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$");
                if (funcMatch.Success)
                {
                    var retType = funcMatch.Groups[1].Value.Trim();
                    var funcName = funcMatch.Groups[2].Value;
                    var pars = funcMatch.Groups[3].Value;
                    bool isKnownType = Types.Contains(retType) || retType.Contains("Matrix") ||
                                      retType.Contains("Vector") || retType == "void" || retType == "auto" ||
                                      retType.StartsWith("Eigen") || retType.Contains("std::") ||
                                      Regex.IsMatch(retType, @"^(const\s+)?\w+$");
                    if (isKnownType)
                    {
                        var mathHtml = $"<p class=\"eq\"><b>{HttpUtility.HtmlEncode(funcName)}</b>({FormatParamsForMath(pars)}) &rarr; {HttpUtility.HtmlEncode(retType)}</p>";
                        sb.Append(MakeHekatanRow(mathHtml, "", pendingComment, false, true));
                        pendingComment = "";
                        continue;
                    }
                }

                // Helper: append computed value if available
                // Skip if the expression is already a plain numeric literal (avoids "x = 2 = 2")
                string ValueSuffix(string varName, string expr = "")
                {
                    if (computedValues.TryGetValue(varName, out var val))
                    {
                        // If expr is a simple numeric literal, don't duplicate
                        var trimExpr = expr.Trim().TrimEnd(';').Trim();
                        if (!string.IsNullOrEmpty(trimExpr) && Regex.IsMatch(trimExpr, @"^-?\d+\.?\d*$"))
                            return "";
                        return $" = <b>{val}</b>";
                    }
                    return "";
                }

                // Variable declaration: [const] type name = expr;
                var declMatch = Regex.Match(line, @"^(?:const\s+)?(\w+)\s+(\w+)\s*=\s*(.+?)\s*;?\s*$");
                if (declMatch.Success && (Types.Contains(declMatch.Groups[1].Value) ||
                    declMatch.Groups[1].Value == "auto" || declMatch.Groups[1].Value == "const"))
                {
                    var varName = declMatch.Groups[2].Value;
                    var expr = declMatch.Groups[3].Value;
                    var mathHtml = $"<p class=\"eq\">{FormatVarHtml(varName)} = {ExprToMathHtml(expr)}{ValueSuffix(varName, expr)}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // "const type name = expr" pattern
                var constDecl = Regex.Match(line, @"^const\s+(\w+)\s+(\w+)\s*=\s*(.+?)\s*;?\s*$");
                if (constDecl.Success)
                {
                    var varName = constDecl.Groups[2].Value;
                    var expr = constDecl.Groups[3].Value;
                    var mathHtml = $"<p class=\"eq\">{FormatVarHtml(varName)} = {ExprToMathHtml(expr)}{ValueSuffix(varName, expr)}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // If statement
                var ifMatch = Regex.Match(line, @"^if\s*\((.+)\)\s*\{?\s*$");
                if (ifMatch.Success)
                {
                    var cond = ifMatch.Groups[1].Value;
                    var label = isEnglish ? "If" : "Si";
                    var mathHtml = $"<p class=\"eq\">{label} {FormatMathTokens(cond)}:</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // Else if
                var elseIfMatch = Regex.Match(line, @"^else\s+if\s*\((.+)\)\s*\{?\s*$");
                if (elseIfMatch.Success)
                {
                    var cond = elseIfMatch.Groups[1].Value;
                    var label = isEnglish ? "Else if" : "Sino si";
                    var mathHtml = $"<p class=\"eq\">{label} {FormatMathTokens(cond)}:</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // Else
                if (line == "else" || line == "else {" || line == "else{")
                {
                    var label = isEnglish ? "Else:" : "Sino:";
                    var mathHtml = $"<p class=\"eq\">{label}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // Assignment with compound operators: lhs *= rhs; lhs += rhs;
                var compoundMatch = Regex.Match(line, @"^([\w.\[\](),\s]+?)\s*(\*=|\+=|-=|/=)\s*(.+?)\s*;?\s*$");
                if (compoundMatch.Success)
                {
                    var lhs = compoundMatch.Groups[1].Value.Trim();
                    var op = compoundMatch.Groups[2].Value;
                    var rhs = compoundMatch.Groups[3].Value;
                    var mathOp = op[0] == '*' ? " &middot; " : op[0] == '/' ? " / " : op[0] == '+' ? " + " : " &minus; ";
                    string lhsHtml;
                    var arrM = Regex.Match(lhs, @"(\w+)\((\d+)\s*,\s*(\d+)\)");
                    if (arrM.Success)
                        lhsHtml = $"{FormatVarHtml(arrM.Groups[1].Value)}({arrM.Groups[2].Value},{arrM.Groups[3].Value})";
                    else
                        lhsHtml = FormatVarHtml(lhs);
                    var mathHtml = $"<p class=\"eq\">{lhsHtml} = {lhsHtml}{mathOp}{ExprToMathHtml(rhs)}{ValueSuffix(lhs, rhs)}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // Assignment: lhs = rhs;
                var assignMatch = Regex.Match(line, @"^(\w[\w.\[\](),]*)\s*=\s*(.+?)\s*;?\s*$");
                if (assignMatch.Success)
                {
                    var lhs = assignMatch.Groups[1].Value;
                    var rhs = assignMatch.Groups[2].Value;
                    string lhsHtml;
                    var arrM = Regex.Match(lhs, @"(\w+)\((\d+)\s*,\s*(\d+)\)");
                    if (arrM.Success)
                        lhsHtml = $"{FormatVarHtml(arrM.Groups[1].Value)}({arrM.Groups[2].Value},{arrM.Groups[3].Value})";
                    else
                        lhsHtml = FormatVarHtml(lhs);
                    var mathHtml = $"<p class=\"eq\">{lhsHtml} = {ExprToMathHtml(rhs)}{ValueSuffix(lhs, rhs)}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // For loop
                var forMatch = Regex.Match(line, @"for\s*\(\s*(?:int\s+|size_t\s+|auto\s+)?(\w+)\s*=\s*(\w+)\s*;\s*\w+\s*([<>=!]+)\s*(\w+)\s*;");
                if (forMatch.Success)
                {
                    var v = forMatch.Groups[1].Value;
                    var start = forMatch.Groups[2].Value;
                    var op = forMatch.Groups[3].Value;
                    var end = forMatch.Groups[4].Value;
                    var label = isEnglish ? "For" : "Para";
                    var mathHtml = $"<p class=\"eq\">{label} {FormatVarHtml(v)} = {FormatMathTokens(start)}, ..., {FormatMathTokens(end)}" +
                                  (op == "<" ? " &minus; 1" : "") + ":</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // Return
                var retMatch = Regex.Match(line, @"return\s+(.+?)\s*;?\s*$");
                if (retMatch.Success)
                {
                    var expr = retMatch.Groups[1].Value;
                    var label = isEnglish ? "Result:" : "Resultado:";
                    var mathHtml = $"<p class=\"eq\"><b>{label}</b> {ExprToMathHtml(expr)}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // Throw → error()
                var throwMatch = Regex.Match(line, @"throw\s+.*?""([^""]*)""\s*\)\s*;?\s*$");
                if (throwMatch.Success)
                {
                    var msg = throwMatch.Groups[1].Value;
                    var mathHtml = $"<p class=\"eq\" style=\"color:#c00\">Error: {HttpUtility.HtmlEncode(msg)}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // std::vector initialization: std::vector<T> v = {a, b, c};
                var vecInitMatch = Regex.Match(line, @"(?:std::)?vector<\w+>\s+(\w+)\s*=\s*\{([^}]+)\}\s*;?\s*$");
                if (vecInitMatch.Success)
                {
                    var varName = vecInitMatch.Groups[1].Value;
                    var vals = vecInitMatch.Groups[2].Value;
                    var mathHtml = $"<p class=\"eq\">{FormatVarHtml(varName)} = [{FormatMathTokens(vals)}]</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // Eigen declaration without assignment
                var eigenDeclMatch = Regex.Match(line, @"^(?:Eigen::)?(\w+)\s+(\w+)\s*=\s*(.+?)\s*;?\s*$");
                if (eigenDeclMatch.Success && (eigenDeclMatch.Groups[1].Value.Contains("Matrix") || eigenDeclMatch.Groups[1].Value.Contains("Vector")))
                {
                    var varName = eigenDeclMatch.Groups[2].Value;
                    var expr = eigenDeclMatch.Groups[3].Value;
                    var mathHtml = $"<p class=\"eq\">{FormatVarHtml(varName)} = {ExprToMathHtml(expr)}{ValueSuffix(varName, expr)}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                    continue;
                }

                // Default
                {
                    var mathHtml = $"<p class=\"eq\">{FormatMathTokens(line.TrimEnd(';'))}</p>";
                    sb.Append(MakeHekatanRow(mathHtml, "", pendingComment));
                    pendingComment = "";
                }
            }

            sb.Append("</div>");
            return sb.ToString();
        }

        private static string GetCppStyles() => @"
<style>
.cpp-block {
    margin: 15px 0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 3px 10px rgba(0,0,0,0.15);
    font-family: 'Segoe UI', sans-serif;
}
.cpp-header {
    padding: 10px 15px;
    background: linear-gradient(135deg, #00599c 0%, #004482 100%);
    display: flex;
    align-items: center;
    gap: 10px;
}
.cpp-label {
    color: white;
    font-weight: bold;
    font-size: 13px;
    background: rgba(255,255,255,0.2);
    padding: 3px 8px;
    border-radius: 4px;
}
.cpp-code {
    margin: 0;
    padding: 15px;
    background: #1e1e1e;
    font-family: 'Cascadia Code', 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    line-height: 1.6;
    overflow-x: auto;
    color: #d4d4d4;
}
.cpp-keyword { color: #569cd6; font-weight: bold; }
.cpp-type { color: #4ec9b0; }
.cpp-identifier { color: #9cdcfe; }
.cpp-number { color: #b5cea8; }
.cpp-string { color: #ce9178; }
.cpp-comment { color: #6a9955; font-style: italic; }
.cpp-preprocessor { color: #c586c0; }
.cpp-operator { color: #d4d4d4; }
.cpp-punctuation { color: #d4d4d4; }
</style>";

        private static string GetExplainStyles() => @"
<style>
.explain-block {
    margin: 15px 0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 3px 10px rgba(0,0,0,0.15);
    font-family: 'Segoe UI', sans-serif;
}
.explain-header {
    padding: 10px 15px;
    background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
    display: flex;
    align-items: center;
    gap: 15px;
}
.explain-label {
    color: white;
    font-weight: bold;
    font-size: 13px;
    background: rgba(255,255,255,0.2);
    padding: 3px 8px;
    border-radius: 4px;
}
.explain-subtitle {
    color: rgba(255,255,255,0.7);
    font-size: 11px;
}
.explain-code {
    margin: 0;
    padding: 15px;
    background: #f5f5f5;
    font-family: 'Cascadia Code', 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    line-height: 1.6;
    overflow-x: auto;
    color: #333;
}
</style>";

        private static string GetCppExplainStyles() => @"
<style>
/* === Hekatan-Style Output from C++ Code === */
.ce-wrapper {
    max-width: 190mm;
    margin-left: 5mm;
}
/* Hekatan Equation Rendering */
.ce-wrapper .eq {
    font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif;
    margin: 3px 0;
    line-height: 150%;
}
.ce-wrapper .eq var {
    color: #06d;
    font-size: 105%;
}
.ce-wrapper .eq i {
    color: #086;
    font-style: normal;
    font-size: 90%;
}
.ce-wrapper .eq b {
    font-weight: 600;
}
.ce-wrapper .eq sub {
    font-family: Calibri, Candara, Corbel, sans-serif;
    font-size: 80%;
    vertical-align: -18%;
    margin-left: 1pt;
}
.ce-wrapper .eq sup {
    display: inline-block;
    margin-left: 1pt;
    margin-top: -3pt;
    font-size: 75%;
}
/* Fractions (.dvc/.dvr/.dvl) */
.ce-wrapper .dvc, .ce-wrapper .dvr, .ce-wrapper .dvs {
    display: inline-block;
    vertical-align: middle;
    white-space: nowrap;
}
.ce-wrapper .dvc {
    padding-left: 2pt;
    padding-right: 2pt;
    text-align: center;
    line-height: 110%;
}
.ce-wrapper .dvr {
    text-align: center;
    line-height: 110%;
    margin-bottom: 4pt;
}
.ce-wrapper .dvl {
    display: block;
    border-bottom: solid 1pt black;
    margin-top: 1pt;
    margin-bottom: 1pt;
}
/* Matrix Brackets */
.ce-wrapper .matrix {
    display: inline-table;
    vertical-align: middle;
}
.ce-wrapper .matrix .tr { display: table-row; }
.ce-wrapper .matrix .td {
    white-space: nowrap;
    padding: 0 2pt;
    min-width: 10pt;
    display: table-cell;
    font-size: 10pt;
    text-align: center;
}
.ce-wrapper .matrix .td:first-child, .ce-wrapper .matrix .td:last-child {
    width: 0.75pt; min-width: 0.75pt; max-width: 0.75pt; padding: 0 1pt;
}
.ce-wrapper .matrix .td:first-child { border-left: solid 1pt black; }
.ce-wrapper .matrix .td:last-child  { border-right: solid 1pt black; }
.ce-wrapper .matrix .tr:first-child .td:first-child,
.ce-wrapper .matrix .tr:first-child .td:last-child  { border-top: solid 1pt black; }
.ce-wrapper .matrix .tr:last-child  .td:first-child,
.ce-wrapper .matrix .tr:last-child  .td:last-child  { border-bottom: solid 1pt black; }
/* C++ source code (shown when line has no semicolon) */
.ce-src {
    background: #f4f7fb;
    border-left: 3px solid #90b4d8;
    border-radius: 3px;
    padding: 4px 10px;
    margin: 4px 0 0;
    font-family: 'Cascadia Code', Consolas, 'Courier New', monospace;
    font-size: 9pt;
    line-height: 1.4;
    color: #555;
}
.ce-src code {
    font-family: inherit;
}
/* C++ Syntax Highlight (for source display) */
.ce-wrapper .cpp-keyword { color: #07a; font-weight: bold; }
.ce-wrapper .cpp-type { color: #458; }
.ce-wrapper .cpp-identifier { color: #333; }
.ce-wrapper .cpp-number { color: #905; }
.ce-wrapper .cpp-string { color: #690; }
.ce-wrapper .cpp-comment { color: #888; font-style: italic; }
.ce-wrapper .cpp-preprocessor { color: #a0a; }
.ce-wrapper .cpp-operator { color: #333; }
.ce-wrapper .cpp-punctuation { color: #333; }
@media print {
    .ce-src { background: #f5f5f5 !important; }
}
</style>";

        #endregion
    }
}
