using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// C++-specific syntax highlighter
    /// </summary>
    public class CppHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo CppInfo = new()
        {
            LanguageName = "C++",
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
                "alignas", "alignof", "and", "and_eq", "asm", "auto", "bitand",
                "bitor", "bool", "break", "case", "catch", "char", "char8_t",
                "char16_t", "char32_t", "class", "compl", "concept", "const",
                "consteval", "constexpr", "constinit", "const_cast", "continue",
                "co_await", "co_return", "co_yield", "decltype", "default",
                "delete", "do", "double", "dynamic_cast", "else", "enum",
                "explicit", "export", "extern", "false", "float", "for", "friend",
                "goto", "if", "inline", "int", "long", "mutable", "namespace",
                "new", "noexcept", "not", "not_eq", "nullptr", "operator", "or",
                "or_eq", "private", "protected", "public", "register",
                "reinterpret_cast", "requires", "return", "short", "signed",
                "sizeof", "static", "static_assert", "static_cast", "struct",
                "switch", "template", "this", "thread_local", "throw", "true",
                "try", "typedef", "typeid", "typename", "union", "unsigned",
                "using", "virtual", "void", "volatile", "wchar_t", "while",
                "xor", "xor_eq"
            },
            Builtins = new HashSet<string>
            {
                // STL containers
                "vector", "string", "map", "set", "list", "deque", "queue",
                "stack", "array", "unordered_map", "unordered_set", "pair",
                "tuple", "optional", "variant", "any",
                // STL algorithms and utilities
                "cout", "cin", "cerr", "endl", "printf", "scanf", "malloc",
                "free", "memcpy", "memset", "strlen", "strcmp", "strcpy",
                "fopen", "fclose", "fread", "fwrite", "fprintf", "fscanf",
                // Common types
                "size_t", "ptrdiff_t", "int8_t", "int16_t", "int32_t", "int64_t",
                "uint8_t", "uint16_t", "uint32_t", "uint64_t",
                // IO streams
                "ifstream", "ofstream", "fstream", "stringstream", "istringstream",
                "ostringstream",
                // Smart pointers
                "unique_ptr", "shared_ptr", "weak_ptr", "make_unique", "make_shared"
            },
            Operators = new HashSet<char>
            {
                '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~',
                '?', ':', ';', ',', '.'
            }
        };

        public CppHighlighter() : base(CppInfo)
        {
        }

        /// <summary>
        /// C++ has preprocessor directives starting with #
        /// </summary>
        public override List<HighlightToken> Tokenize(string line)
        {
            var tokens = new List<HighlightToken>();
            if (string.IsNullOrEmpty(line))
                return tokens;

            var i = 0;
            var len = line.Length;
            var trimmed = line.TrimStart();

            // Check for preprocessor directives
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

                // Check for single-line comments
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

                // Check for block comments
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

                // Check for strings
                if (c == '"')
                {
                    // Check for raw string R"(...)"
                    if (i > 0 && line[i - 1] == 'R')
                    {
                        var rawEnd = line.IndexOf(")\"", i + 1);
                        if (rawEnd >= 0)
                        {
                            rawEnd += 2;
                            // Modify previous token to include R
                            if (tokens.Count > 0)
                            {
                                var lastToken = tokens[^1];
                                tokens[^1] = new HighlightToken
                                {
                                    Text = line[(i - 1)..rawEnd],
                                    Type = TokenType.String,
                                    StartIndex = i - 1,
                                    Length = rawEnd - i + 1
                                };
                            }
                            i = rawEnd;
                            continue;
                        }
                    }

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

                // Check for numbers (including hex, binary, octal)
                if (char.IsDigit(c) || (c == '.' && i + 1 < len && char.IsDigit(line[i + 1])))
                {
                    var numEnd = FindCppNumberEnd(line, i);
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

                // Check for operators (including multi-char operators)
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
                            twoChar == "->" || twoChar == "::")
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

        /// <summary>
        /// C++ number literals can be hex (0x), binary (0b), octal (0), and have suffixes
        /// </summary>
        private int FindCppNumberEnd(string line, int start)
        {
            var i = start;
            var len = line.Length;

            // Check for hex
            if (i + 1 < len && line[i] == '0' && (line[i + 1] == 'x' || line[i + 1] == 'X'))
            {
                i += 2;
                while (i < len && (char.IsDigit(line[i]) ||
                    (line[i] >= 'a' && line[i] <= 'f') ||
                    (line[i] >= 'A' && line[i] <= 'F') ||
                    line[i] == '\''))
                    i++;
            }
            // Check for binary
            else if (i + 1 < len && line[i] == '0' && (line[i + 1] == 'b' || line[i + 1] == 'B'))
            {
                i += 2;
                while (i < len && (line[i] == '0' || line[i] == '1' || line[i] == '\''))
                    i++;
            }
            else
            {
                i = FindNumberEnd(line, start);
            }

            // Check for suffixes (u, l, ul, ull, f, etc.)
            while (i < len && (line[i] == 'u' || line[i] == 'U' ||
                               line[i] == 'l' || line[i] == 'L' ||
                               line[i] == 'f' || line[i] == 'F'))
                i++;

            return i;
        }
    }
}
