using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// C#-specific syntax highlighter
    /// </summary>
    public class CSharpHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo CSharpInfo = new()
        {
            LanguageName = "C#",
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
                "abstract", "as", "base", "bool", "break", "byte", "case", "catch",
                "char", "checked", "class", "const", "continue", "decimal", "default",
                "delegate", "do", "double", "else", "enum", "event", "explicit",
                "extern", "false", "finally", "fixed", "float", "for", "foreach",
                "goto", "if", "implicit", "in", "int", "interface", "internal",
                "is", "lock", "long", "namespace", "new", "null", "object",
                "operator", "out", "override", "params", "private", "protected",
                "public", "readonly", "ref", "return", "sbyte", "sealed",
                "short", "sizeof", "stackalloc", "static", "string", "struct",
                "switch", "this", "throw", "true", "try", "typeof", "uint",
                "ulong", "unchecked", "unsafe", "ushort", "using", "var",
                "virtual", "void", "volatile", "while", "async", "await",
                "dynamic", "get", "partial", "set", "value", "where", "yield",
                "record", "init", "with", "required", "file", "scoped"
            },
            Builtins = new HashSet<string>
            {
                // Common types
                "Console", "String", "Int32", "Int64", "Double", "Boolean",
                "DateTime", "TimeSpan", "Guid", "Exception", "List", "Dictionary",
                "Array", "Enumerable", "Task", "StringBuilder", "Regex",
                // Common methods
                "WriteLine", "Write", "ReadLine", "Read", "Parse", "ToString",
                "TryParse", "Format", "Join", "Split", "Substring", "Replace",
                "Contains", "StartsWith", "EndsWith", "ToUpper", "ToLower",
                "Trim", "Length", "Count", "Add", "Remove", "Clear", "First",
                "Last", "Select", "Where", "OrderBy", "GroupBy", "Sum", "Max",
                "Min", "Average", "Any", "All", "ToArray", "ToList"
            },
            Operators = new HashSet<char>
            {
                '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~',
                '?', ':', ';', ',', '.'
            }
        };

        public CSharpHighlighter() : base(CSharpInfo)
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

            // Check for preprocessor directives (#if, #region, #define, etc.)
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

                // Single-line comments
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

                // Verbatim strings (@"...")
                if (c == '@' && i + 1 < len && line[i + 1] == '"')
                {
                    var stringEnd = i + 2;
                    while (stringEnd < len)
                    {
                        if (line[stringEnd] == '"')
                        {
                            // Check for escaped quote ("")
                            if (stringEnd + 1 < len && line[stringEnd + 1] == '"')
                            {
                                stringEnd += 2;
                                continue;
                            }
                            else
                            {
                                stringEnd++;
                                break;
                            }
                        }
                        stringEnd++;
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

                // Interpolated strings ($"..." or $@"...")
                if (c == '$' && i + 1 < len && (line[i + 1] == '"' ||
                    (i + 2 < len && line[i + 1] == '@' && line[i + 2] == '"')))
                {
                    var offset = line[i + 1] == '@' ? 3 : 2;
                    var stringEnd = FindStringEnd(line, i + offset - 1, '"');
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

                // Regular strings
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

                // Numbers
                if (char.IsDigit(c) || (c == '.' && i + 1 < len && char.IsDigit(line[i + 1])))
                {
                    var numEnd = FindNumberEnd(line, i);
                    // Check for numeric suffixes (f, d, m, l, ul, etc.)
                    while (numEnd < len && (line[numEnd] == 'f' || line[numEnd] == 'F' ||
                                            line[numEnd] == 'd' || line[numEnd] == 'D' ||
                                            line[numEnd] == 'm' || line[numEnd] == 'M' ||
                                            line[numEnd] == 'l' || line[numEnd] == 'L' ||
                                            line[numEnd] == 'u' || line[numEnd] == 'U'))
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
                            twoChar == "&&" || twoChar == "||" || twoChar == "??" ||
                            twoChar == "+=" || twoChar == "-=" || twoChar == "*=" ||
                            twoChar == "/=" || twoChar == "%=" || twoChar == "&=" ||
                            twoChar == "|=" || twoChar == "^=" || twoChar == "=>" ||
                            twoChar == "::")
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
