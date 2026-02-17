using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// C-specific syntax highlighter
    /// </summary>
    public class CHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo CInfo = new()
        {
            LanguageName = "C",
            KeywordColor = "#0000FF",      // Blue
            BuiltinColor = "#2B91AF",      // Type color (teal-blue)
            StringColor = "#A31515",       // Red-brown
            CommentColor = "#008000",      // Green
            NumberColor = "#000000",       // Black
            OperatorColor = "#000000",     // Black
            VariableColor = "#000000",     // Black
            FunctionColor = "#795E26",     // Brown
            ErrorColor = "#FF0000",        // Red
            CommentPrefix = "//",
            BlockCommentStart = "/*",
            BlockCommentEnd = "*/",
            StringDelimiter = '"',
            AltStringDelimiter = '\'',
            Keywords = new HashSet<string>
            {
                "auto", "break", "case", "char", "const", "continue", "default",
                "do", "double", "else", "enum", "extern", "float", "for", "goto",
                "if", "int", "long", "register", "return", "short", "signed",
                "sizeof", "static", "struct", "switch", "typedef", "union",
                "unsigned", "void", "volatile", "while", "_Bool", "_Complex",
                "_Imaginary", "inline", "restrict", "_Alignas", "_Alignof",
                "_Atomic", "_Generic", "_Noreturn", "_Static_assert",
                "_Thread_local"
            },
            Builtins = new HashSet<string>
            {
                // Standard library functions
                "printf", "scanf", "fprintf", "fscanf", "sprintf", "sscanf",
                "fopen", "fclose", "fread", "fwrite", "fgets", "fputs",
                "malloc", "calloc", "realloc", "free", "memcpy", "memset",
                "memmove", "memcmp", "strlen", "strcpy", "strncpy", "strcat",
                "strncat", "strcmp", "strncmp", "strchr", "strstr", "strtok",
                "atoi", "atof", "atol", "strtol", "strtod", "abs", "labs",
                "fabs", "sqrt", "pow", "sin", "cos", "tan", "exp", "log",
                "ceil", "floor", "rand", "srand", "exit", "system", "getenv",
                // Common types
                "size_t", "ptrdiff_t", "FILE", "NULL", "int8_t", "int16_t",
                "int32_t", "int64_t", "uint8_t", "uint16_t", "uint32_t",
                "uint64_t", "bool", "true", "false"
            },
            Operators = new HashSet<char>
            {
                '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~',
                '?', ':', ';', ',', '.'
            }
        };

        public CHighlighter() : base(CInfo)
        {
        }

        public override List<HighlightToken> Tokenize(string line)
        {
            var tokens = new List<HighlightToken>();
            if (string.IsNullOrEmpty(line))
                return tokens;

            var i = 0;
            var len = line.Length;
            var trimmed = line.TrimStart();

            // Check for preprocessor directives (#include, #define, etc.)
            if (trimmed.StartsWith("#"))
            {
                tokens.Add(new HighlightToken
                {
                    Text = line,
                    Type = TokenType.Keyword,
                    StartIndex = 0,
                    Length = len
                });
                return tokens;
            }

            while (i < len)
            {
                var c = line[i];

                // Single-line comments (C99/C11)
                if (c == '/' && i + 1 < len && line[i + 1] == '/')
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

                // Block comments
                if (c == '/' && i + 1 < len && line[i + 1] == '*')
                {
                    var endIdx = line.IndexOf("*/", i + 2);
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
                    else
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
                }

                // Strings
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

                // Char literals
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

                // Numbers (including hex and octal)
                if (char.IsDigit(c) || (c == '.' && i + 1 < len && char.IsDigit(line[i + 1])))
                {
                    var numEnd = i;

                    // Check for hex (0x...)
                    if (c == '0' && i + 1 < len && (line[i + 1] == 'x' || line[i + 1] == 'X'))
                    {
                        numEnd = i + 2;
                        while (numEnd < len && (char.IsDigit(line[numEnd]) ||
                            (line[numEnd] >= 'a' && line[numEnd] <= 'f') ||
                            (line[numEnd] >= 'A' && line[numEnd] <= 'F')))
                            numEnd++;
                    }
                    else
                    {
                        numEnd = FindNumberEnd(line, i);
                    }

                    // Check for suffixes (u, l, ul, ll, etc.)
                    while (numEnd < len && (line[numEnd] == 'u' || line[numEnd] == 'U' ||
                                            line[numEnd] == 'l' || line[numEnd] == 'L' ||
                                            line[numEnd] == 'f' || line[numEnd] == 'F'))
                        numEnd++;

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

                // Operators
                if (Info.Operators.Contains(c))
                {
                    var opEnd = i + 1;
                    // Check for multi-char operators
                    if (opEnd < len)
                    {
                        var twoChar = line.Substring(i, 2);
                        if (twoChar == "++" || twoChar == "--" || twoChar == "==" ||
                            twoChar == "!=" || twoChar == "<=" || twoChar == ">=" ||
                            twoChar == "&&" || twoChar == "||" || twoChar == "<<" ||
                            twoChar == ">>" || twoChar == "+=" || twoChar == "-=" ||
                            twoChar == "*=" || twoChar == "/=" || twoChar == "%=" ||
                            twoChar == "&=" || twoChar == "|=" || twoChar == "^=" ||
                            twoChar == "->")
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

                // Identifiers
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
