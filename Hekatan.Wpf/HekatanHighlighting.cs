using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Windows.Media;
using ICSharpCode.AvalonEdit.Document;
using ICSharpCode.AvalonEdit.Rendering;

namespace Hekatan.Wpf
{
    /// <summary>
    /// Syntax highlighting for Hekatan in AvalonEdit
    /// Supports Hekatan syntax + external language blocks
    /// </summary>
    public class HekatanHighlighter : DocumentColorizingTransformer
    {
        // Hekatan colors
        private static readonly SolidColorBrush CommentBrush = new SolidColorBrush(Color.FromRgb(0, 128, 0));      // Green
        private static readonly SolidColorBrush KeywordBrush = new SolidColorBrush(Color.FromRgb(0, 0, 255));      // Blue
        private static readonly SolidColorBrush FunctionBrush = new SolidColorBrush(Color.FromRgb(43, 145, 175));  // Cyan
        private static readonly SolidColorBrush NumberBrush = new SolidColorBrush(Color.FromRgb(163, 21, 21));     // Red
        private static readonly SolidColorBrush StringBrush = new SolidColorBrush(Color.FromRgb(163, 21, 21));     // Red
        private static readonly SolidColorBrush OperatorBrush = new SolidColorBrush(Color.FromRgb(0, 0, 0));       // Black
        private static readonly SolidColorBrush DirectiveBrush = new SolidColorBrush(Color.FromRgb(128, 0, 128));  // Purple

        // External language colors
        private static readonly SolidColorBrush ExternalKeywordBrush = new SolidColorBrush(Color.FromRgb(0, 0, 255));
        private static readonly SolidColorBrush ExternalStringBrush = new SolidColorBrush(Color.FromRgb(163, 21, 21));
        private static readonly SolidColorBrush ExternalCommentBrush = new SolidColorBrush(Color.FromRgb(0, 128, 0));

        // Hekatan keywords
        private static readonly HashSet<string> HekatanKeywords = new HashSet<string>
        {
            "if", "else", "end", "for", "to", "step", "next", "while", "loop",
            "break", "continue", "return", "local", "global",
            "and", "or", "not", "xor", "mod", "div",
            // SVG elements
            "line", "rect", "circle", "ellipse", "polygon", "polyline", "path", "text"
        };

        // Hekatan functions (sample - add more as needed)
        private static readonly HashSet<string> HekatanFunctions = new HashSet<string>
        {
            "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
            "sqrt", "sqr", "abs", "exp", "ln", "log", "log2",
            "round", "ceil", "floor", "trunc", "sign",
            "min", "max", "sum", "product", "average",
            "pi", "e"
        };

        // External language keywords
        private static readonly Dictionary<string, HashSet<string>> ExternalKeywords = new Dictionary<string, HashSet<string>>
        {
            ["python"] = new HashSet<string> { "def", "class", "import", "from", "if", "elif", "else", "for", "while", "try", "except", "with", "return", "yield", "lambda", "True", "False", "None" },
            ["cpp"] = new HashSet<string> { "int", "double", "float", "char", "void", "bool", "if", "else", "for", "while", "do", "switch", "case", "return", "class", "struct", "public", "private", "protected", "namespace", "using", "include" },
            ["csharp"] = new HashSet<string> { "class", "using", "namespace", "public", "private", "static", "void", "int", "string", "double", "bool", "if", "else", "for", "while", "foreach", "return", "new", "var" },
            ["octave"] = new HashSet<string> { "function", "end", "if", "else", "elseif", "endif", "for", "endfor", "while", "endwhile", "switch", "case", "otherwise", "return" },
            ["julia"] = new HashSet<string> { "function", "end", "if", "else", "elseif", "for", "while", "try", "catch", "finally", "return", "struct", "module", "using", "import" },
            ["r"] = new HashSet<string> { "function", "if", "else", "for", "while", "repeat", "break", "next", "return", "in", "TRUE", "FALSE", "NULL", "NA" },
        };

        protected override void ColorizeLine(DocumentLine line)
        {
            var lineText = CurrentContext.Document.GetText(line);
            var lineOffset = line.Offset;

            // Check if line is a comment (starts with ' or ")
            if (lineText.TrimStart().StartsWith("'") || lineText.TrimStart().StartsWith("\""))
            {
                ChangeLinePart(lineOffset, lineOffset + line.Length, element => element.TextRunProperties.SetForegroundBrush(CommentBrush));
                return;
            }

            // Check if line is an external language directive
            var trimmed = lineText.TrimStart();
            if (trimmed.StartsWith("@{"))
            {
                ChangeLinePart(lineOffset, lineOffset + line.Length, element => element.TextRunProperties.SetForegroundBrush(DirectiveBrush));
                return;
            }

            // Check if line starts with # (Hekatan directive like #if, #for, etc.)
            if (trimmed.StartsWith("#"))
            {
                ChangeLinePart(lineOffset, lineOffset + line.Length, element => element.TextRunProperties.SetForegroundBrush(DirectiveBrush));
                return;
            }

            // Check if line starts with $ (Hekatan commands like $svg, $end, $plot, $map)
            if (trimmed.StartsWith("$"))
            {
                ChangeLinePart(lineOffset, lineOffset + line.Length, element => element.TextRunProperties.SetForegroundBrush(DirectiveBrush));
                return;
            }

            // Colorize numbers
            var numberRegex = new Regex(@"\b\d+(\.\d+)?\b");
            foreach (Match match in numberRegex.Matches(lineText))
            {
                ChangeLinePart(
                    lineOffset + match.Index,
                    lineOffset + match.Index + match.Length,
                    element => element.TextRunProperties.SetForegroundBrush(NumberBrush)
                );
            }

            // Colorize strings
            var stringRegex = new Regex(@"""[^""]*""|'[^']*'");
            foreach (Match match in stringRegex.Matches(lineText))
            {
                ChangeLinePart(
                    lineOffset + match.Index,
                    lineOffset + match.Index + match.Length,
                    element => element.TextRunProperties.SetForegroundBrush(StringBrush)
                );
            }

            // Colorize Hekatan keywords and functions
            var wordRegex = new Regex(@"\b[a-zA-Z_][a-zA-Z0-9_]*\b");
            foreach (Match match in wordRegex.Matches(lineText))
            {
                var word = match.Value.ToLower();

                if (HekatanKeywords.Contains(word))
                {
                    ChangeLinePart(
                        lineOffset + match.Index,
                        lineOffset + match.Index + match.Length,
                        element => element.TextRunProperties.SetForegroundBrush(KeywordBrush)
                    );
                }
                else if (HekatanFunctions.Contains(word))
                {
                    ChangeLinePart(
                        lineOffset + match.Index,
                        lineOffset + match.Index + match.Length,
                        element => element.TextRunProperties.SetForegroundBrush(FunctionBrush)
                    );
                }
            }
        }
    }

    /// <summary>
    /// Colorizer for external language blocks
    /// </summary>
    public class ExternalLanguageHighlighter : DocumentColorizingTransformer
    {
        private readonly string _language;
        private readonly HashSet<string> _keywords;

        private static readonly SolidColorBrush KeywordBrush = new SolidColorBrush(Color.FromRgb(0, 0, 255));
        private static readonly SolidColorBrush StringBrush = new SolidColorBrush(Color.FromRgb(163, 21, 21));
        private static readonly SolidColorBrush CommentBrush = new SolidColorBrush(Color.FromRgb(0, 128, 0));
        private static readonly SolidColorBrush NumberBrush = new SolidColorBrush(Color.FromRgb(163, 21, 21));

        public ExternalLanguageHighlighter(string language, HashSet<string> keywords)
        {
            _language = language;
            _keywords = keywords ?? new HashSet<string>();
        }

        protected override void ColorizeLine(DocumentLine line)
        {
            var lineText = CurrentContext.Document.GetText(line);
            var lineOffset = line.Offset;

            // Colorize comments based on language
            if ((_language == "python" || _language == "bash" || _language == "r") && lineText.TrimStart().StartsWith("#"))
            {
                ChangeLinePart(lineOffset, lineOffset + line.Length, element => element.TextRunProperties.SetForegroundBrush(CommentBrush));
                return;
            }
            else if ((_language == "cpp" || _language == "csharp" || _language == "java") && lineText.TrimStart().StartsWith("//"))
            {
                ChangeLinePart(lineOffset, lineOffset + line.Length, element => element.TextRunProperties.SetForegroundBrush(CommentBrush));
                return;
            }

            // Colorize strings
            var stringRegex = new Regex(@"""[^""\\]*(\\.[^""\\]*)*""|'[^'\\]*(\\.[^'\\]*)*'");
            foreach (Match match in stringRegex.Matches(lineText))
            {
                ChangeLinePart(
                    lineOffset + match.Index,
                    lineOffset + match.Index + match.Length,
                    element => element.TextRunProperties.SetForegroundBrush(StringBrush)
                );
            }

            // Colorize numbers
            var numberRegex = new Regex(@"\b\d+(\.\d+)?(e[+-]?\d+)?\b", RegexOptions.IgnoreCase);
            foreach (Match match in numberRegex.Matches(lineText))
            {
                ChangeLinePart(
                    lineOffset + match.Index,
                    lineOffset + match.Index + match.Length,
                    element => element.TextRunProperties.SetForegroundBrush(NumberBrush)
                );
            }

            // Colorize keywords
            var wordRegex = new Regex(@"\b[a-zA-Z_][a-zA-Z0-9_]*\b");
            foreach (Match match in wordRegex.Matches(lineText))
            {
                if (_keywords.Contains(match.Value))
                {
                    ChangeLinePart(
                        lineOffset + match.Index,
                        lineOffset + match.Index + match.Length,
                        element => element.TextRunProperties.SetForegroundBrush(KeywordBrush)
                    );
                }
            }
        }
    }
}
