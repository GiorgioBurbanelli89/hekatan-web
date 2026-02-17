using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Manages CSS templates for @{} language output blocks.
    /// Loads templates.json index and individual .css files from MultLangCode/Templates/.
    /// Provides combined CSS injection for HTML output (shared by Cli and Wpf).
    /// </summary>
    public static class MultLangTemplateManager
    {
        private static string _templatesDir;
        private static Dictionary<string, TemplateEntry> _index;
        private static readonly Dictionary<string, string> _cssCache = new();
        private static readonly HashSet<string> _usedLanguages = new();
        private static bool _cssInjected;

        /// <summary>
        /// Template entry from templates.json
        /// </summary>
        public class TemplateEntry
        {
            public string CssFile { get; set; } = "default.css";
            public string TemplateFile { get; set; } = "";
            public string ContainerClass { get; set; } = "lang-block";
            public string HeaderColor { get; set; } = "#4A90E2";
            public string DisplayName { get; set; } = "Output";
        }

        // Cache for CSS extracted from template HTML files
        private static readonly Dictionary<string, string> _templateCssCache = new();

        /// <summary>
        /// Finds the Templates directory (same search pattern as MultLangManager)
        /// </summary>
        private static string FindTemplatesDir()
        {
            var possiblePaths = new List<string>();

            var assemblyDir = Path.GetDirectoryName(typeof(MultLangTemplateManager).Assembly.Location);
            if (!string.IsNullOrEmpty(assemblyDir))
            {
                possiblePaths.Add(Path.Combine(assemblyDir, "MultLangCode", "Templates"));
                possiblePaths.Add(Path.Combine(assemblyDir, "Templates"));
            }

            possiblePaths.Add(Path.Combine(Environment.CurrentDirectory, "MultLangCode", "Templates"));
            possiblePaths.Add(Path.Combine(Environment.CurrentDirectory, "Templates"));

            foreach (var path in possiblePaths)
            {
                if (Directory.Exists(path) && File.Exists(Path.Combine(path, "templates.json")))
                    return path;
            }

            // Fallback: return first existing directory
            foreach (var path in possiblePaths)
            {
                if (Directory.Exists(path))
                    return path;
            }

            return possiblePaths.Count > 0 ? possiblePaths[0] : "Templates";
        }

        /// <summary>
        /// Loads the templates.json index file
        /// </summary>
        private static void EnsureLoaded()
        {
            if (_index != null) return;

            _templatesDir = FindTemplatesDir();
            _index = new Dictionary<string, TemplateEntry>(StringComparer.OrdinalIgnoreCase);

            var jsonPath = Path.Combine(_templatesDir, "templates.json");
            if (!File.Exists(jsonPath)) return;

            try
            {
                var json = File.ReadAllText(jsonPath);
                using var doc = JsonDocument.Parse(json);

                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    if (prop.Name.StartsWith("_")) continue; // Skip comments

                    var entry = new TemplateEntry();
                    if (prop.Value.TryGetProperty("cssFile", out var cssFile))
                        entry.CssFile = cssFile.GetString();
                    if (prop.Value.TryGetProperty("containerClass", out var containerClass))
                        entry.ContainerClass = containerClass.GetString();
                    if (prop.Value.TryGetProperty("headerColor", out var headerColor))
                        entry.HeaderColor = headerColor.GetString();
                    if (prop.Value.TryGetProperty("displayName", out var displayName))
                        entry.DisplayName = displayName.GetString();
                    if (prop.Value.TryGetProperty("templateFile", out var templateFile))
                        entry.TemplateFile = templateFile.GetString();

                    _index[prop.Name] = entry;
                }
            }
            catch
            {
                // Silently fail - will use defaults
            }
        }

        /// <summary>
        /// Gets the template entry for a language. Falls back to "default".
        /// </summary>
        public static TemplateEntry GetTemplate(string language)
        {
            EnsureLoaded();
            if (_index.TryGetValue(language, out var entry))
                return entry;
            if (_index.TryGetValue("default", out var defaultEntry))
                return defaultEntry;
            return new TemplateEntry();
        }

        /// <summary>
        /// Reads and caches CSS content for a given css file name.
        /// </summary>
        private static string ReadCssFile(string cssFileName)
        {
            if (_cssCache.TryGetValue(cssFileName, out var cached))
                return cached;

            var cssPath = Path.Combine(_templatesDir, cssFileName);
            if (File.Exists(cssPath))
            {
                try
                {
                    var content = File.ReadAllText(cssPath);
                    _cssCache[cssFileName] = content;
                    return content;
                }
                catch { }
            }

            _cssCache[cssFileName] = string.Empty;
            return string.Empty;
        }

        /// <summary>
        /// Reads a template HTML file and extracts all CSS from its &lt;style&gt; tags.
        /// Caches the extracted CSS for reuse.
        /// </summary>
        private static string ExtractCssFromTemplate(string templateFileName)
        {
            if (string.IsNullOrEmpty(templateFileName))
                return string.Empty;

            if (_templateCssCache.TryGetValue(templateFileName, out var cached))
                return cached;

            var templatePath = Path.Combine(_templatesDir, templateFileName);
            if (!File.Exists(templatePath))
            {
                _templateCssCache[templateFileName] = string.Empty;
                return string.Empty;
            }

            try
            {
                var html = File.ReadAllText(templatePath);
                var sb = new StringBuilder();

                // Extract all <style>...</style> blocks
                int searchFrom = 0;
                while (searchFrom < html.Length)
                {
                    var styleStart = html.IndexOf("<style", searchFrom, StringComparison.OrdinalIgnoreCase);
                    if (styleStart < 0) break;

                    // Find the end of the opening <style> tag
                    var tagEnd = html.IndexOf('>', styleStart);
                    if (tagEnd < 0) break;

                    // Find </style>
                    var styleEnd = html.IndexOf("</style>", tagEnd, StringComparison.OrdinalIgnoreCase);
                    if (styleEnd < 0) break;

                    // Extract CSS content between <style...> and </style>
                    var cssContent = html.Substring(tagEnd + 1, styleEnd - tagEnd - 1);
                    if (!string.IsNullOrWhiteSpace(cssContent))
                    {
                        sb.AppendLine($"/* --- from {templateFileName} --- */");
                        sb.AppendLine(cssContent.Trim());
                    }

                    searchFrom = styleEnd + 8; // length of "</style>"
                }

                var result = sb.ToString();
                _templateCssCache[templateFileName] = result;
                return result;
            }
            catch
            {
                _templateCssCache[templateFileName] = string.Empty;
                return string.Empty;
            }
        }

        /// <summary>
        /// Gets the full template CSS for a language (extracted from its templateFile).
        /// </summary>
        public static string GetTemplateCss(string language)
        {
            EnsureLoaded();
            var template = GetTemplate(language);
            return ExtractCssFromTemplate(template.TemplateFile);
        }

        /// <summary>
        /// Gets the template HTML file path for a language (if it exists).
        /// </summary>
        public static string GetTemplateFilePath(string language)
        {
            EnsureLoaded();
            var template = GetTemplate(language);
            if (string.IsNullOrEmpty(template.TemplateFile))
                return null;
            var path = Path.Combine(_templatesDir, template.TemplateFile);
            return File.Exists(path) ? path : null;
        }

        /// <summary>
        /// Gets the CSS content for a specific language.
        /// </summary>
        public static string GetCss(string language)
        {
            EnsureLoaded();
            var template = GetTemplate(language);
            return ReadCssFile(template.CssFile);
        }

        /// <summary>
        /// Marks a language as used in the current document.
        /// Call this when processing an @{language} block.
        /// </summary>
        public static void MarkLanguageUsed(string language)
        {
            _usedLanguages.Add(language.ToLower());
        }

        /// <summary>
        /// Generates a &lt;style&gt; tag with combined CSS for all used languages.
        /// Returns empty string if no languages used or already injected.
        /// Call this once before emitting the first @{} block output.
        /// </summary>
        public static string GetCombinedCssStyleTag()
        {
            if (_cssInjected || _usedLanguages.Count == 0)
                return string.Empty;

            EnsureLoaded();
            _cssInjected = true;

            var sb = new StringBuilder();
            sb.AppendLine("<style type='text/css'>");
            sb.AppendLine("/* === @{} Language Block Styles (auto-injected by MultLangTemplateManager) === */");

            // Always include default.css
            var defaultCss = ReadCssFile("default.css");
            if (!string.IsNullOrEmpty(defaultCss))
                sb.AppendLine(defaultCss);

            // Include CSS for each used language (deduplicate by cssFile)
            var includedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "default.css" };
            foreach (var lang in _usedLanguages)
            {
                var template = GetTemplate(lang);
                if (!includedFiles.Contains(template.CssFile))
                {
                    includedFiles.Add(template.CssFile);
                    var css = ReadCssFile(template.CssFile);
                    if (!string.IsNullOrEmpty(css))
                        sb.AppendLine(css);
                }
            }

            // Include CSS extracted from per-language template HTML files (deduplicate by templateFile)
            var includedTemplates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var lang in _usedLanguages)
            {
                var template = GetTemplate(lang);
                if (!string.IsNullOrEmpty(template.TemplateFile) && !includedTemplates.Contains(template.TemplateFile))
                {
                    includedTemplates.Add(template.TemplateFile);
                    var templateCss = ExtractCssFromTemplate(template.TemplateFile);
                    if (!string.IsNullOrEmpty(templateCss))
                        sb.AppendLine(templateCss);
                }
            }

            sb.AppendLine("</style>");

            // Inject toggle JS for collapse/expand functionality
            sb.AppendLine("<script type='text/javascript'>");
            sb.AppendLine("if (typeof toggleLangOutput === 'undefined') {");
            sb.AppendLine("  function toggleLangOutput(id) {");
            sb.AppendLine("    var el = document.getElementById(id);");
            sb.AppendLine("    var icon = document.getElementById(id + '-icon');");
            sb.AppendLine("    if (el) {");
            sb.AppendLine("      if (el.style.display === 'none') {");
            sb.AppendLine("        el.style.display = '';");
            sb.AppendLine("        if (icon) icon.innerHTML = '\\u25BC';");
            sb.AppendLine("      } else {");
            sb.AppendLine("        el.style.display = 'none';");
            sb.AppendLine("        if (icon) icon.innerHTML = '\\u25B6';");
            sb.AppendLine("      }");
            sb.AppendLine("    }");
            sb.AppendLine("  }");
            sb.AppendLine("}");
            sb.AppendLine("</script>");

            return sb.ToString();
        }

        /// <summary>
        /// Resets state for a new document processing run.
        /// </summary>
        public static void Reset()
        {
            _usedLanguages.Clear();
            _cssInjected = false;
        }

        /// <summary>
        /// Full reset including cached data (for testing or config reload).
        /// </summary>
        public static void FullReset()
        {
            Reset();
            _index = null;
            _cssCache.Clear();
            _templateCssCache.Clear();
            _templatesDir = null;
        }
    }
}
