using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// Fortran-specific syntax highlighter
    /// </summary>
    public class FortranHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo FortranInfo = new()
        {
            LanguageName = "Fortran",
            KeywordColor = "#0000FF",      // Blue
            BuiltinColor = "#2B91AF",      // Type color (teal-blue)
            StringColor = "#A31515",       // Red-brown
            CommentColor = "#008000",      // Green
            NumberColor = "#000000",       // Black
            OperatorColor = "#000000",     // Black
            VariableColor = "#000000",     // Black
            FunctionColor = "#795E26",     // Brown
            ErrorColor = "#FF0000",        // Red
            CommentPrefix = "!",
            BlockCommentStart = "",
            BlockCommentEnd = "",
            StringDelimiter = '"',
            AltStringDelimiter = '\'',
            Keywords = new HashSet<string>
            {
                // Program structure
                "program", "end", "subroutine", "function", "module", "contains",
                "use", "only", "interface", "procedure", "block", "associate",
                "endassociate", "endblock", "endfunction", "endinterface",
                "endmodule", "endprogram", "endsubroutine",
                // Type declarations
                "implicit", "none", "integer", "real", "double", "precision",
                "complex", "character", "logical", "type", "class", "dimension",
                "parameter", "allocatable", "pointer", "target", "save", "data",
                "common", "equivalence", "external", "intrinsic",
                // Control flow
                "if", "then", "else", "elseif", "endif", "select", "case",
                "default", "endselect", "where", "elsewhere", "endwhere",
                "forall", "endforall", "do", "while", "enddo", "cycle", "exit",
                "goto", "continue", "return", "stop",
                // I/O
                "read", "write", "print", "open", "close", "rewind", "backspace",
                "inquire", "format", "namelist",
                // Memory
                "allocate", "deallocate", "nullify",
                // Operators and special
                "intent", "in", "out", "inout", "optional", "recursive", "pure",
                "elemental", "result", "bind", "abstract", "extends", "private",
                "public", "protected", "sequence", "volatile", "asynchronous",
                // Logical
                "true", "false"
            },
            Builtins = new HashSet<string>
            {
                // Intrinsic functions - Mathematical
                "abs", "acos", "asin", "atan", "atan2", "cos", "sin", "tan",
                "cosh", "sinh", "tanh", "exp", "log", "log10", "sqrt", "ceiling",
                "floor", "mod", "modulo", "sign", "max", "min", "sum", "product",
                // Intrinsic functions - Array
                "size", "shape", "reshape", "transpose", "matmul", "dot_product",
                "all", "any", "count", "maxval", "minval", "pack", "unpack",
                "merge", "spread", "cshift", "eoshift",
                // Intrinsic functions - String
                "len", "len_trim", "trim", "adjustl", "adjustr", "index", "scan",
                "verify", "repeat", "char", "ichar", "achar", "iachar",
                // Intrinsic functions - Type conversion
                "int", "real", "dble", "cmplx", "nint", "aint", "anint",
                // Intrinsic functions - Inquiry
                "allocated", "associated", "present", "kind", "selected_int_kind",
                "selected_real_kind", "huge", "tiny", "epsilon", "precision",
                "range", "digits",
                // Intrinsic functions - Bit manipulation
                "iand", "ior", "ieor", "not", "ishft", "ishftc", "btest",
                "ibset", "ibclr", "ibits"
            },
            Operators = new HashSet<char>
            {
                '+', '-', '*', '/', '=', '<', '>', '(', ')', ',', ':', '%'
            }
        };

        public FortranHighlighter() : base(FortranInfo)
        {
        }

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

                // Comments start with !
                if (c == '!')
                {
                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..],
                        Type = TokenType.Comment,
                        StartIndex = i,
                        Length = len - i
                    });
                    break;
                }

                // Strings with double quotes
                if (c == '"')
                {
                    var stringEnd = FindStringEnd(line, i, '"');
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

                // Strings with single quotes
                if (c == '\'')
                {
                    var stringEnd = FindStringEnd(line, i, '\'');
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

                // Numbers
                if (char.IsDigit(c) || (c == '.' && i + 1 < len && char.IsDigit(line[i + 1])))
                {
                    var numEnd = FindNumberEnd(line, i);

                    // Check for Fortran-specific number suffixes
                    // e.g., 1.0D0 (double precision), 1.0E0 (exponential), 1_8 (kind specifier)
                    while (numEnd < len)
                    {
                        var ch = line[numEnd];
                        if (ch == 'D' || ch == 'd' || ch == 'E' || ch == 'e')
                        {
                            numEnd++;
                            if (numEnd < len && (line[numEnd] == '+' || line[numEnd] == '-'))
                                numEnd++;
                            while (numEnd < len && char.IsDigit(line[numEnd]))
                                numEnd++;
                            break;
                        }
                        else if (ch == '_')
                        {
                            numEnd++;
                            while (numEnd < len && char.IsDigit(line[numEnd]))
                                numEnd++;
                            break;
                        }
                        else
                        {
                            break;
                        }
                    }

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

                // Operators (including Fortran-specific operators like .eq., .ne., etc.)
                if (c == '.' && i + 1 < len && char.IsLetter(line[i + 1]))
                {
                    // Check for logical operators (.and., .or., .not., .eq., .ne., .lt., .le., .gt., .ge.)
                    var dotEnd = i + 1;
                    while (dotEnd < len && char.IsLetter(line[dotEnd]))
                        dotEnd++;
                    if (dotEnd < len && line[dotEnd] == '.')
                    {
                        dotEnd++;
                        var op = line[i..dotEnd].ToLower();
                        if (op == ".and." || op == ".or." || op == ".not." || op == ".eqv." ||
                            op == ".neqv." || op == ".eq." || op == ".ne." || op == ".lt." ||
                            op == ".le." || op == ".gt." || op == ".ge." || op == ".true." ||
                            op == ".false.")
                        {
                            tokens.Add(new HighlightToken
                            {
                                Text = line[i..dotEnd],
                                Type = TokenType.Operator,
                                StartIndex = i,
                                Length = dotEnd - i
                            });
                            i = dotEnd;
                            continue;
                        }
                    }
                }

                // Regular operators
                if (Info.Operators.Contains(c))
                {
                    var opEnd = i + 1;
                    // Check for multi-char operators
                    if (opEnd < len)
                    {
                        var twoChar = line.Substring(i, 2);
                        if (twoChar == "**" || twoChar == "==" || twoChar == "/=" ||
                            twoChar == "<=" || twoChar == ">=" || twoChar == "=>")
                            opEnd++;
                    }

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

                // Brackets
                if (c == '(' || c == ')' || c == '[' || c == ']')
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

                // Identifiers (Fortran is case-insensitive)
                if (char.IsLetter(c) || c == '_')
                {
                    var idEnd = FindIdentifierEnd(line, i);
                    var identifier = line[i..idEnd];
                    var tokenType = ClassifyIdentifier(identifier.ToLower(), line, idEnd);
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
