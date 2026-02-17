using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// Contains highlighting information for a language
    /// Can be used by both WPF (with brushes) and CLI/HTML (with colors)
    /// </summary>
    public class LanguageHighlightInfo
    {
        public string LanguageName { get; set; } = string.Empty;

        // Colors as hex strings for portability
        public string KeywordColor { get; set; } = "#0000FF";      // Blue
        public string BuiltinColor { get; set; } = "#008080";      // Teal
        public string StringColor { get; set; } = "#008000";       // Green
        public string CommentColor { get; set; } = "#808080";      // Gray
        public string NumberColor { get; set; } = "#000000";       // Black
        public string OperatorColor { get; set; } = "#B8860B";     // DarkGoldenrod
        public string VariableColor { get; set; } = "#0000FF";     // Blue
        public string FunctionColor { get; set; } = "#000000";     // Black (Bold)
        public string ErrorColor { get; set; } = "#DC143C";        // Crimson
        public string DefaultColor { get; set; } = "#000000";      // Black

        // Language-specific lists
        public HashSet<string> Keywords { get; set; } = new();
        public HashSet<string> Builtins { get; set; } = new();
        public HashSet<char> Operators { get; set; } = new();
        public string CommentPrefix { get; set; } = "#";
        public string BlockCommentStart { get; set; } = string.Empty;
        public string BlockCommentEnd { get; set; } = string.Empty;
        public char StringDelimiter { get; set; } = '"';
        public char AltStringDelimiter { get; set; } = '\'';
    }

    /// <summary>
    /// Token types for syntax highlighting
    /// </summary>
    public enum TokenType
    {
        Default,
        Keyword,
        Builtin,
        String,
        Comment,
        Number,
        Operator,
        Variable,
        Function,
        Bracket,
        Error
    }

    /// <summary>
    /// Represents a highlighted token
    /// </summary>
    public class HighlightToken
    {
        public string Text { get; set; } = string.Empty;
        public TokenType Type { get; set; } = TokenType.Default;
        public int StartIndex { get; set; }
        public int Length { get; set; }
    }
}
