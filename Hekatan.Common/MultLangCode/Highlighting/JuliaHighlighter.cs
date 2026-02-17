using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// Julia-specific syntax highlighter
    /// </summary>
    public class JuliaHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo JuliaInfo = new()
        {
            LanguageName = "Julia",
            KeywordColor = "#CB3C33",      // Julia red
            BuiltinColor = "#389826",      // Julia green
            StringColor = "#9558B2",       // Julia purple
            CommentColor = "#808080",      // Gray
            NumberColor = "#000000",       // Black
            OperatorColor = "#000000",     // Black
            VariableColor = "#000000",     // Black
            FunctionColor = "#4063D8",     // Julia blue
            ErrorColor = "#FF0000",        // Red
            CommentPrefix = "#",
            BlockCommentStart = "#=",
            BlockCommentEnd = "=#",
            StringDelimiter = '"',
            AltStringDelimiter = '\'',
            Keywords = new HashSet<string>
            {
                "abstract", "baremodule", "begin", "break", "catch", "const",
                "continue", "do", "else", "elseif", "end", "export", "finally",
                "for", "function", "global", "if", "import", "let", "local",
                "macro", "module", "mutable", "primitive", "quote", "return",
                "struct", "try", "type", "using", "while"
            },
            Builtins = new HashSet<string>
            {
                "AbstractArray", "AbstractChar", "AbstractDict", "AbstractFloat",
                "AbstractMatrix", "AbstractRange", "AbstractSet", "AbstractString",
                "AbstractVector", "Any", "Array", "BigFloat", "BigInt", "Bool",
                "Char", "Complex", "Dict", "Float16", "Float32", "Float64",
                "Function", "Int", "Int128", "Int16", "Int32", "Int64", "Int8",
                "Integer", "IO", "IOBuffer", "Matrix", "Missing", "Nothing",
                "Number", "Pair", "Rational", "Real", "Set", "String", "Symbol",
                "Tuple", "Type", "UInt", "UInt128", "UInt16", "UInt32", "UInt64",
                "UInt8", "Union", "Vector",
                "abs", "abs2", "acos", "acosh", "acot", "acoth", "acsc", "acsch",
                "angle", "asec", "asech", "asin", "asinh", "atan", "atanh",
                "ceil", "clamp", "collect", "complex", "conj", "convert", "copy",
                "cos", "cosh", "cot", "coth", "count", "csc", "csch", "deg2rad",
                "denominator", "display", "div", "dump", "eltype", "enumerate",
                "exp", "exp10", "exp2", "expm1", "fill", "filter", "first",
                "floor", "foreach", "gcd", "get", "getfield", "haskey", "hash",
                "identity", "ifelse", "imag", "in", "inv", "isapprox", "isempty",
                "iseven", "isfinite", "isinf", "isnan", "isodd", "iterate",
                "join", "keys", "last", "lcm", "length", "log", "log10", "log2",
                "log1p", "map", "mapreduce", "max", "maximum", "merge", "min",
                "minimum", "mod", "numerator", "one", "ones", "parse", "pop!",
                "print", "println", "prod", "push!", "rad2deg", "rand", "randn",
                "range", "real", "reduce", "rem", "repeat", "repr", "reverse",
                "round", "sec", "sech", "show", "sign", "sin", "sinh", "size",
                "sizeof", "sort", "sort!", "sqrt", "string", "sum", "tan",
                "tanh", "trunc", "tuple", "typemax", "typemin", "unique",
                "values", "vcat", "zero", "zeros", "zip"
            },
            Operators = new HashSet<char>
            {
                '+', '-', '*', '/', '\\', '^', '%', '=', '<', '>', '!', '&', '|',
                '~', ':', ';', ',', '.', '?', '$'
            }
        };

        public JuliaHighlighter() : base(JuliaInfo)
        {
        }

        /// <summary>
        /// Julia has special handling for triple-quoted strings and macros
        /// </summary>
        public override List<HighlightToken> Tokenize(string line)
        {
            var tokens = new List<HighlightToken>();
            if (string.IsNullOrEmpty(line))
                return tokens;

            var i = 0;
            var len = line.Length;

            while (i < len)
            {
                var c = line[i];

                // Check for comments
                if (c == '#')
                {
                    // Check for block comment
                    if (i + 1 < len && line[i + 1] == '=')
                    {
                        var endIdx = line.IndexOf("=#", i + 2);
                        if (endIdx >= 0)
                        {
                            endIdx += 2;
                            tokens.Add(new HighlightToken
                            {
                                Text = line[i..endIdx],
                                Type = TokenType.Comment,
                                StartIndex = i,
                                Length = endIdx - i
                            });
                            i = endIdx;
                            continue;
                        }
                    }

                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..],
                        Type = TokenType.Comment,
                        StartIndex = i,
                        Length = len - i
                    });
                    break;
                }

                // Check for macros (@macro)
                if (c == '@')
                {
                    var macroEnd = i + 1;
                    while (macroEnd < len && (char.IsLetterOrDigit(line[macroEnd]) || line[macroEnd] == '_' || line[macroEnd] == '!'))
                        macroEnd++;

                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..macroEnd],
                        Type = TokenType.Builtin,
                        StartIndex = i,
                        Length = macroEnd - i
                    });
                    i = macroEnd;
                    continue;
                }

                // Check for strings (including triple-quoted)
                if (c == '"')
                {
                    var stringEnd = i + 1;
                    // Check for triple-quoted string
                    if (i + 2 < len && line[i + 1] == '"' && line[i + 2] == '"')
                    {
                        stringEnd = i + 3;
                        while (stringEnd + 2 < len)
                        {
                            if (line[stringEnd] == '"' && line[stringEnd + 1] == '"' && line[stringEnd + 2] == '"')
                            {
                                stringEnd += 3;
                                break;
                            }
                            stringEnd++;
                        }
                        if (stringEnd + 2 >= len)
                            stringEnd = len;
                    }
                    else
                    {
                        stringEnd = FindStringEnd(line, i, '"');
                    }

                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..stringEnd],
                        Type = TokenType.String,
                        StartIndex = i,
                        Length = stringEnd - i
                    });
                    i = stringEnd;
                    continue;
                }

                // Check for char literals
                if (c == '\'')
                {
                    var charEnd = FindStringEnd(line, i, '\'');
                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..charEnd],
                        Type = TokenType.String,
                        StartIndex = i,
                        Length = charEnd - i
                    });
                    i = charEnd;
                    continue;
                }

                // Check for numbers
                if (char.IsDigit(c) || (c == '.' && i + 1 < len && char.IsDigit(line[i + 1])))
                {
                    var numEnd = FindNumberEnd(line, i);
                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..numEnd],
                        Type = TokenType.Number,
                        StartIndex = i,
                        Length = numEnd - i
                    });
                    i = numEnd;
                    continue;
                }

                // Check for operators
                if (Info.Operators.Contains(c))
                {
                    tokens.Add(new HighlightToken
                    {
                        Text = c.ToString(),
                        Type = TokenType.Operator,
                        StartIndex = i,
                        Length = 1
                    });
                    i++;
                    continue;
                }

                // Check for brackets
                if (c == '(' || c == ')' || c == '[' || c == ']' || c == '{' || c == '}')
                {
                    tokens.Add(new HighlightToken
                    {
                        Text = c.ToString(),
                        Type = TokenType.Bracket,
                        StartIndex = i,
                        Length = 1
                    });
                    i++;
                    continue;
                }

                // Check for identifiers
                if (char.IsLetter(c) || c == '_')
                {
                    var idEnd = i;
                    // Julia allows ! at the end of function names (mutating functions)
                    while (idEnd < len && (char.IsLetterOrDigit(line[idEnd]) || line[idEnd] == '_'))
                        idEnd++;
                    if (idEnd < len && line[idEnd] == '!')
                        idEnd++;

                    var identifier = line[i..idEnd];
                    var tokenType = ClassifyIdentifier(identifier, line, idEnd);
                    tokens.Add(new HighlightToken
                    {
                        Text = identifier,
                        Type = tokenType,
                        StartIndex = i,
                        Length = idEnd - i
                    });
                    i = idEnd;
                    continue;
                }

                // Default
                tokens.Add(new HighlightToken
                {
                    Text = c.ToString(),
                    Type = TokenType.Default,
                    StartIndex = i,
                    Length = 1
                });
                i++;
            }

            return tokens;
        }
    }
}
