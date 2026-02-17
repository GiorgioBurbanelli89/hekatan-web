using System;
using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// Factory for creating language-specific highlighters
    /// </summary>
    public static class HighlighterFactory
    {
        private static readonly Dictionary<string, Func<BaseLanguageHighlighter>> _highlighterCreators =
            new(StringComparer.OrdinalIgnoreCase)
        {
            ["python"] = () => new PythonHighlighter(),
            ["powershell"] = () => new PowerShellHighlighter(),
            ["octave"] = () => new OctaveHighlighter(),
            ["julia"] = () => new JuliaHighlighter(),
            ["cpp"] = () => new CppHighlighter(),
            ["r"] = () => new RHighlighter(),
            ["bash"] = () => new BashHighlighter(),
            ["cmd"] = () => new BashHighlighter(), // CMD uses similar highlighting to Bash
            ["csharp"] = () => new CSharpHighlighter(),
            ["c"] = () => new CHighlighter(),
            ["fortran"] = () => new FortranHighlighter(),
            ["xaml"] = () => new PythonHighlighter(), // Use generic highlighter for XML-based languages
            ["wpf"] = () => new PythonHighlighter(), // Use generic highlighter for XAML/WPF
            ["markdown"] = () => new PythonHighlighter() // Use generic highlighter for Markdown
        };

        private static readonly Dictionary<string, BaseLanguageHighlighter> _cachedHighlighters = new();

        /// <summary>
        /// Gets or creates a highlighter for the specified language
        /// </summary>
        public static BaseLanguageHighlighter GetHighlighter(string language)
        {
            var key = language.ToLowerInvariant();

            if (_cachedHighlighters.TryGetValue(key, out var cached))
                return cached;

            if (_highlighterCreators.TryGetValue(key, out var creator))
            {
                var highlighter = creator();
                _cachedHighlighters[key] = highlighter;
                return highlighter;
            }

            // Return a default highlighter for unknown languages
            return new PythonHighlighter();
        }

        /// <summary>
        /// Checks if a highlighter is available for the specified language
        /// </summary>
        public static bool HasHighlighter(string language)
        {
            return _highlighterCreators.ContainsKey(language.ToLowerInvariant());
        }

        /// <summary>
        /// Gets all supported languages
        /// </summary>
        public static IEnumerable<string> GetSupportedLanguages()
        {
            return _highlighterCreators.Keys;
        }

        /// <summary>
        /// Registers a custom highlighter for a language
        /// </summary>
        public static void RegisterHighlighter(string language, Func<BaseLanguageHighlighter> creator)
        {
            var key = language.ToLowerInvariant();
            _highlighterCreators[key] = creator;
            _cachedHighlighters.Remove(key);
        }

        /// <summary>
        /// Clears the highlighter cache
        /// </summary>
        public static void ClearCache()
        {
            _cachedHighlighters.Clear();
        }
    }
}
