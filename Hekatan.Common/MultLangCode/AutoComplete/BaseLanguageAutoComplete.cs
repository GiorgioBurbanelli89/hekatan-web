using System;
using System.Collections.Generic;
using System.Linq;

namespace Hekatan.Common.MultLangCode.AutoComplete
{
    /// <summary>
    /// Base class for language-specific auto-complete providers
    /// </summary>
    public abstract class BaseLanguageAutoComplete
    {
        protected LanguageAutoCompleteInfo Info { get; }
        protected List<AutoCompleteItem> AllItems { get; }

        protected BaseLanguageAutoComplete(LanguageAutoCompleteInfo info)
        {
            Info = info;
            AllItems = info.Items;
        }

        /// <summary>
        /// Gets auto-complete suggestions based on the current prefix
        /// </summary>
        public virtual IEnumerable<AutoCompleteItem> GetSuggestions(string prefix, string context = null)
        {
            if (string.IsNullOrEmpty(prefix) || prefix.Length < Info.MinimumPrefixLength)
                return Enumerable.Empty<AutoCompleteItem>();

            return AllItems
                .Where(item => item.DisplayText.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                .OrderBy(item => item.ItemType)
                .ThenBy(item => item.DisplayText.Length)
                .ThenBy(item => item.DisplayText);
        }

        /// <summary>
        /// Gets all items of a specific type
        /// </summary>
        public IEnumerable<AutoCompleteItem> GetItemsByType(AutoCompleteItemType type)
        {
            return AllItems.Where(item => item.ItemType == type);
        }

        /// <summary>
        /// Checks if a character should trigger auto-complete
        /// </summary>
        public bool ShouldTrigger(char c)
        {
            return Info.TriggerCharacters.Contains(c);
        }

        /// <summary>
        /// Adds a custom item to the auto-complete list
        /// </summary>
        public void AddItem(AutoCompleteItem item)
        {
            AllItems.Add(item);
        }

        /// <summary>
        /// Adds multiple custom items
        /// </summary>
        public void AddItems(IEnumerable<AutoCompleteItem> items)
        {
            AllItems.AddRange(items);
        }

        /// <summary>
        /// Gets the text to insert for a selected item
        /// </summary>
        public virtual string GetInsertText(AutoCompleteItem item, string prefix)
        {
            // Return the part of InsertText that comes after the prefix
            if (item.InsertText.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                return item.InsertText.Substring(prefix.Length);

            return item.InsertText;
        }
    }
}
