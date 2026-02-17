using System;
using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.AutoComplete
{
    /// <summary>
    /// Factory for creating language-specific auto-complete providers
    /// </summary>
    public static class AutoCompleteFactory
    {
        private static readonly Dictionary<string, Func<BaseLanguageAutoComplete>> _creators =
            new(StringComparer.OrdinalIgnoreCase)
        {
            ["python"] = () => new PythonAutoComplete(),
            // Other languages will use Python as a base for now
            // They can be implemented specifically later
            ["powershell"] = () => new PythonAutoComplete(),
            ["octave"] = () => new PythonAutoComplete(),
            ["julia"] = () => new PythonAutoComplete(),
            ["cpp"] = () => new PythonAutoComplete(),
            ["r"] = () => new PythonAutoComplete(),
            ["bash"] = () => new PythonAutoComplete(),
            ["cmd"] = () => new PythonAutoComplete(),
            ["csharp"] = () => new PythonAutoComplete(),
            ["c"] = () => new PythonAutoComplete(),
            ["fortran"] = () => new PythonAutoComplete(),
            ["xaml"] = () => new PythonAutoComplete(),
            ["wpf"] = () => new PythonAutoComplete(),
            ["markdown"] = () => new PythonAutoComplete()
        };

        private static readonly Dictionary<string, BaseLanguageAutoComplete> _cached = new();

        /// <summary>
        /// Gets or creates an auto-complete provider for the specified language
        /// </summary>
        public static BaseLanguageAutoComplete GetAutoComplete(string language)
        {
            var key = language.ToLowerInvariant();

            if (_cached.TryGetValue(key, out var cached))
                return cached;

            if (_creators.TryGetValue(key, out var creator))
            {
                var autoComplete = creator();
                _cached[key] = autoComplete;
                return autoComplete;
            }

            return new PythonAutoComplete();
        }

        /// <summary>
        /// Checks if an auto-complete provider exists for the language
        /// </summary>
        public static bool HasAutoComplete(string language)
        {
            return _creators.ContainsKey(language.ToLowerInvariant());
        }

        /// <summary>
        /// Registers a custom auto-complete provider
        /// </summary>
        public static void RegisterAutoComplete(string language, Func<BaseLanguageAutoComplete> creator)
        {
            var key = language.ToLowerInvariant();
            _creators[key] = creator;
            _cached.Remove(key);
        }

        /// <summary>
        /// Clears the cache
        /// </summary>
        public static void ClearCache()
        {
            _cached.Clear();
        }
    }
}
