using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// Python-specific syntax highlighter
    /// </summary>
    public class PythonHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo PythonInfo = new()
        {
            LanguageName = "Python",
            KeywordColor = "#0000FF",      // Blue
            BuiltinColor = "#008080",      // Teal
            StringColor = "#008000",       // Green
            CommentColor = "#808080",      // Gray
            NumberColor = "#000000",       // Black
            OperatorColor = "#B8860B",     // DarkGoldenrod
            VariableColor = "#0000FF",     // Blue
            FunctionColor = "#000000",     // Black
            ErrorColor = "#DC143C",        // Crimson
            CommentPrefix = "#",
            StringDelimiter = '"',
            AltStringDelimiter = '\'',
            Keywords = new HashSet<string>
            {
                "False", "None", "True", "and", "as", "assert", "async", "await",
                "break", "class", "continue", "def", "del", "elif", "else", "except",
                "finally", "for", "from", "global", "if", "import", "in", "is",
                "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
                "while", "with", "yield"
            },
            Builtins = new HashSet<string>
            {
                "abs", "aiter", "all", "any", "anext", "ascii", "bin", "bool",
                "breakpoint", "bytearray", "bytes", "callable", "chr", "classmethod",
                "compile", "complex", "delattr", "dict", "dir", "divmod", "enumerate",
                "eval", "exec", "filter", "float", "format", "frozenset", "getattr",
                "globals", "hasattr", "hash", "help", "hex", "id", "input", "int",
                "isinstance", "issubclass", "iter", "len", "list", "locals", "map",
                "max", "memoryview", "min", "next", "object", "oct", "open", "ord",
                "pow", "print", "property", "range", "repr", "reversed", "round",
                "set", "setattr", "slice", "sorted", "staticmethod", "str", "sum",
                "super", "tuple", "type", "vars", "zip"
            },
            Operators = new HashSet<char>
            {
                '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '@'
            }
        };

        public PythonHighlighter() : base(PythonInfo)
        {
        }

        /// <summary>
        /// Python supports triple-quoted strings
        /// </summary>
        protected override int FindStringEnd(string line, int start, char delimiter)
        {
            // Check for triple quotes
            if (start + 2 < line.Length &&
                line[start + 1] == delimiter &&
                line[start + 2] == delimiter)
            {
                // Triple-quoted string
                var i = start + 3;
                while (i + 2 < line.Length)
                {
                    if (line[i] == delimiter &&
                        line[i + 1] == delimiter &&
                        line[i + 2] == delimiter)
                        return i + 3;
                    i++;
                }
                return line.Length;
            }

            return base.FindStringEnd(line, start, delimiter);
        }

        /// <summary>
        /// Python decorators start with @
        /// </summary>
        public override List<HighlightToken> Tokenize(string line)
        {
            var tokens = base.Tokenize(line);

            // Check for decorators
            for (int i = 0; i < tokens.Count; i++)
            {
                var token = tokens[i];
                if (token.Type == TokenType.Operator && token.Text == "@")
                {
                    // Next identifier is a decorator
                    if (i + 1 < tokens.Count && tokens[i + 1].Type == TokenType.Variable)
                    {
                        tokens[i + 1] = new HighlightToken
                        {
                            Text = tokens[i + 1].Text,
                            Type = TokenType.Builtin,
                            StartIndex = tokens[i + 1].StartIndex,
                            Length = tokens[i + 1].Length
                        };
                    }
                }
            }

            return tokens;
        }
    }
}
