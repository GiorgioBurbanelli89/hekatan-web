using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// GNU Octave/MATLAB-specific syntax highlighter
    /// </summary>
    public class OctaveHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo OctaveInfo = new()
        {
            LanguageName = "GNU Octave",
            KeywordColor = "#0000FF",      // Blue
            BuiltinColor = "#008080",      // Teal
            StringColor = "#A020F0",       // Purple
            CommentColor = "#228B22",      // ForestGreen
            NumberColor = "#000000",       // Black
            OperatorColor = "#000000",     // Black
            VariableColor = "#000000",     // Black
            FunctionColor = "#0000FF",     // Blue
            ErrorColor = "#FF0000",        // Red
            CommentPrefix = "%",
            BlockCommentStart = "%{",
            BlockCommentEnd = "%}",
            StringDelimiter = '\'',
            AltStringDelimiter = '"',
            Keywords = new HashSet<string>
            {
                "break", "case", "catch", "classdef", "continue", "do", "else",
                "elseif", "end", "end_try_catch", "end_unwind_protect", "endclassdef",
                "endenumeration", "endevents", "endfor", "endfunction", "endif",
                "endmethods", "endparfor", "endproperties", "endswitch", "endwhile",
                "enumeration", "events", "for", "function", "global", "if", "methods",
                "otherwise", "parfor", "persistent", "properties", "return", "switch",
                "try", "until", "unwind_protect", "unwind_protect_cleanup", "while"
            },
            Builtins = new HashSet<string>
            {
                "abs", "acos", "acosh", "acot", "acoth", "acsc", "acsch", "angle",
                "asec", "asech", "asin", "asinh", "atan", "atan2", "atanh", "axis",
                "bar", "ceil", "clc", "clear", "close", "colorbar", "colormap",
                "conj", "contour", "cos", "cosh", "cot", "coth", "csc", "csch",
                "det", "diag", "diff", "disp", "eig", "eps", "error", "exp",
                "eye", "fclose", "fft", "fft2", "fftn", "fftshift", "figure",
                "fix", "floor", "fopen", "format", "fprintf", "fread", "fwrite",
                "grid", "hold", "i", "ifft", "ifft2", "ifftn", "imag", "inf",
                "input", "interp1", "interp2", "inv", "isempty", "isinf", "isnan",
                "j", "legend", "length", "linspace", "load", "log", "log10",
                "log2", "logspace", "lu", "max", "mean", "median", "mesh",
                "meshgrid", "min", "mod", "nan", "norm", "num2str", "ones",
                "pi", "plot", "plot3", "polar", "poly", "polyfit", "polyval",
                "printf", "prod", "qr", "rand", "randn", "rank", "real", "rem",
                "reshape", "roots", "round", "save", "sec", "sech", "sin",
                "sinh", "size", "sort", "sprintf", "sqrt", "std", "str2num",
                "subplot", "sum", "surf", "svd", "tan", "tanh", "title", "trace",
                "transpose", "var", "warning", "xlabel", "xlim", "ylabel", "ylim",
                "zeros", "zlabel", "zlim"
            },
            Operators = new HashSet<char>
            {
                '+', '-', '*', '/', '\\', '^', '=', '<', '>', '~', '&', '|', ':', ';', ',', '.'
            }
        };

        public OctaveHighlighter() : base(OctaveInfo)
        {
        }

        /// <summary>
        /// Octave also uses # for comments (like Python)
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

                // Check for comments (% or #)
                if (c == '%' || c == '#')
                {
                    // Check for block comment
                    if (c == '%' && i + 1 < len && line[i + 1] == '{')
                    {
                        var endIdx = line.IndexOf("%}", i + 2);
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

                // Check for strings
                if (c == '\'' || c == '"')
                {
                    var stringEnd = FindStringEnd(line, i, c);
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

                // Check for operators (including matrix operators like .*, ./, .^)
                if (Info.Operators.Contains(c))
                {
                    var opEnd = i + 1;
                    // Check for element-wise operators
                    if (c == '.' && opEnd < len && (line[opEnd] == '*' || line[opEnd] == '/' || line[opEnd] == '^' || line[opEnd] == '\''))
                        opEnd++;
                    // Check for comparison operators
                    else if ((c == '=' || c == '~' || c == '<' || c == '>') && opEnd < len && line[opEnd] == '=')
                        opEnd++;
                    // Check for logical operators
                    else if ((c == '&' || c == '|') && opEnd < len && line[opEnd] == c)
                        opEnd++;

                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..opEnd],
                        Type = TokenType.Operator,
                        StartIndex = i,
                        Length = opEnd - i
                    });
                    i = opEnd;
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
                    var idEnd = FindIdentifierEnd(line, i);
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
