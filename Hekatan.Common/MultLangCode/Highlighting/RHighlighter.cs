using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// R language-specific syntax highlighter
    /// </summary>
    public class RHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo RInfo = new()
        {
            LanguageName = "R",
            KeywordColor = "#0000FF",      // Blue
            BuiltinColor = "#008080",      // Teal
            StringColor = "#008000",       // Green
            CommentColor = "#808080",      // Gray
            NumberColor = "#000000",       // Black
            OperatorColor = "#B8860B",     // DarkGoldenrod
            VariableColor = "#000000",     // Black
            FunctionColor = "#795E26",     // Brown
            ErrorColor = "#FF0000",        // Red
            CommentPrefix = "#",
            StringDelimiter = '"',
            AltStringDelimiter = '\'',
            Keywords = new HashSet<string>
            {
                "if", "else", "repeat", "while", "function", "for", "in", "next",
                "break", "TRUE", "FALSE", "NULL", "Inf", "NaN", "NA", "NA_integer_",
                "NA_real_", "NA_complex_", "NA_character_", "return", "invisible"
            },
            Builtins = new HashSet<string>
            {
                // Base functions
                "abs", "acos", "acosh", "all", "any", "append", "apply", "args",
                "asin", "asinh", "atan", "atan2", "atanh", "attr", "attributes",
                "c", "cat", "cbind", "ceiling", "character", "class", "colMeans",
                "colnames", "colSums", "complex", "cos", "cosh", "crossprod",
                "cummax", "cummin", "cumprod", "cumsum", "data.frame", "det",
                "diag", "diff", "dim", "dimnames", "double", "eigen", "exp",
                "factor", "file", "floor", "format", "function", "getwd", "grep",
                "grepl", "gsub", "head", "identical", "ifelse", "integer", "is.na",
                "is.null", "is.numeric", "lapply", "length", "library", "list",
                "log", "log10", "log2", "logical", "mapply", "match", "matrix",
                "max", "mean", "median", "merge", "min", "mode", "names", "nchar",
                "ncol", "nrow", "numeric", "order", "paste", "paste0", "print",
                "prod", "range", "rank", "rbind", "read.csv", "read.table", "rep",
                "require", "rev", "rm", "round", "rowMeans", "rownames", "rowSums",
                "sample", "sapply", "scale", "sd", "seq", "setdiff", "setwd",
                "sign", "sin", "sinh", "solve", "sort", "source", "split", "sprintf",
                "sqrt", "stop", "str", "strsplit", "sub", "subset", "substr", "sum",
                "summary", "svd", "t", "table", "tail", "tan", "tanh", "tolower",
                "toupper", "trunc", "typeof", "union", "unique", "unlist", "var",
                "vector", "warning", "which", "which.max", "which.min", "write.csv",
                "write.table", "xor",
                // ggplot2 common functions
                "ggplot", "aes", "geom_point", "geom_line", "geom_bar", "geom_histogram",
                "geom_boxplot", "facet_wrap", "facet_grid", "theme", "labs", "ggtitle",
                "xlab", "ylab", "scale_x_continuous", "scale_y_continuous",
                // dplyr common functions
                "filter", "select", "mutate", "arrange", "group_by", "summarize",
                "summarise", "left_join", "right_join", "inner_join", "full_join",
                "bind_rows", "bind_cols", "rename", "distinct", "count", "n"
            },
            Operators = new HashSet<char>
            {
                '+', '-', '*', '/', '^', '=', '<', '>', '!', '&', '|', '~',
                '%', ':', '$', '@', '?'
            }
        };

        public RHighlighter() : base(RInfo)
        {
        }

        /// <summary>
        /// R has special operators like %*%, %in%, etc.
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
                if (c == '"' || c == '\'')
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

                // Check for special operators like %*%, %in%, %%, etc.
                if (c == '%')
                {
                    var opEnd = line.IndexOf('%', i + 1);
                    if (opEnd >= 0)
                    {
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
                }

                // Check for numbers
                if (char.IsDigit(c) || (c == '.' && i + 1 < len && char.IsDigit(line[i + 1])))
                {
                    var numEnd = FindRNumberEnd(line, i);
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

                // Check for assignment operators
                if (c == '<' && i + 1 < len && line[i + 1] == '-')
                {
                    tokens.Add(new HighlightToken
                    {
                        Text = "<-",
                        Type = TokenType.Operator,
                        StartIndex = i,
                        Length = 2
                    });
                    i += 2;
                    continue;
                }

                if (c == '-' && i + 1 < len && line[i + 1] == '>')
                {
                    tokens.Add(new HighlightToken
                    {
                        Text = "->",
                        Type = TokenType.Operator,
                        StartIndex = i,
                        Length = 2
                    });
                    i += 2;
                    continue;
                }

                // Check for operators
                if (Info.Operators.Contains(c))
                {
                    var opEnd = i + 1;
                    // Check for multi-char operators
                    if (opEnd < len && ((c == '=' && line[opEnd] == '=') ||
                                        (c == '!' && line[opEnd] == '=') ||
                                        (c == '<' && line[opEnd] == '=') ||
                                        (c == '>' && line[opEnd] == '=') ||
                                        (c == '&' && line[opEnd] == '&') ||
                                        (c == '|' && line[opEnd] == '|') ||
                                        (c == ':' && line[opEnd] == ':')))
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

                // Check for identifiers (R allows . in names)
                if (char.IsLetter(c) || c == '_' || c == '.')
                {
                    var idEnd = i;
                    while (idEnd < len && (char.IsLetterOrDigit(line[idEnd]) || line[idEnd] == '_' || line[idEnd] == '.'))
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

        /// <summary>
        /// R number literals can have L suffix for integers
        /// </summary>
        private int FindRNumberEnd(string line, int start)
        {
            var i = FindNumberEnd(line, start);

            // Check for L suffix (integer)
            if (i < line.Length && line[i] == 'L')
                i++;

            // Check for i suffix (complex)
            if (i < line.Length && line[i] == 'i')
                i++;

            return i;
        }
    }
}
