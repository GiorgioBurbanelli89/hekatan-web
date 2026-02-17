using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.AutoComplete
{
    /// <summary>
    /// Represents an auto-complete item with display information
    /// </summary>
    public class AutoCompleteItem
    {
        /// <summary>
        /// The text to display in the auto-complete list
        /// </summary>
        public string DisplayText { get; set; } = string.Empty;

        /// <summary>
        /// The text to insert when selected
        /// </summary>
        public string InsertText { get; set; } = string.Empty;

        /// <summary>
        /// The type of item (keyword, function, variable, etc.)
        /// </summary>
        public AutoCompleteItemType ItemType { get; set; } = AutoCompleteItemType.Variable;

        /// <summary>
        /// Optional description/documentation
        /// </summary>
        public string Description { get; set; } = string.Empty;

        /// <summary>
        /// Optional signature for functions
        /// </summary>
        public string Signature { get; set; } = string.Empty;
    }

    /// <summary>
    /// Types of auto-complete items
    /// </summary>
    public enum AutoCompleteItemType
    {
        Keyword,
        Builtin,
        Function,
        Variable,
        Type,
        Constant,
        Module,
        Snippet
    }

    /// <summary>
    /// Contains auto-complete information for a language
    /// </summary>
    public class LanguageAutoCompleteInfo
    {
        public string LanguageName { get; set; } = string.Empty;

        /// <summary>
        /// All available auto-complete items
        /// </summary>
        public List<AutoCompleteItem> Items { get; set; } = new();

        /// <summary>
        /// Characters that trigger auto-complete
        /// </summary>
        public HashSet<char> TriggerCharacters { get; set; } = new() { '.' };

        /// <summary>
        /// Minimum characters before showing auto-complete
        /// </summary>
        public int MinimumPrefixLength { get; set; } = 2;
    }
}
