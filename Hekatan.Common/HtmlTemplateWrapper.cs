using System;
using System.IO;
using System.Text;

namespace Hekatan.Common
{
    /// <summary>
    /// Centralized HTML template loading and content wrapping.
    /// Replaces duplicate HtmlApplyWorksheet() in both CLI Converter.cs and WPF MainWindow.xaml.cs.
    /// </summary>
    public class HtmlTemplateWrapper
    {
        private string _htmlTemplate;
        private readonly StringBuilder _sb = new();

        /// <summary>
        /// The raw template HTML (everything before the content insertion point).
        /// </summary>
        public string Template => _htmlTemplate;

        /// <summary>
        /// Whether a template has been loaded.
        /// </summary>
        public bool IsLoaded => !string.IsNullOrEmpty(_htmlTemplate);

        /// <summary>
        /// Load template from a file path with URL replacement.
        /// </summary>
        /// <param name="templatePath">Path to template.html</param>
        /// <param name="virtualHostUrl">Virtual host URL to replace (e.g., "https://calcpad.local/")</param>
        /// <param name="replacementUrl">Replacement URL (e.g., "file:///..." for CLI or "https://calcpad.local/" for WPF)</param>
        public void LoadTemplate(string templatePath, string virtualHostUrl = null, string replacementUrl = null)
        {
            if (!File.Exists(templatePath))
                throw new FileNotFoundException($"Template not found: {templatePath}");

            _htmlTemplate = File.ReadAllText(templatePath);

            if (!string.IsNullOrEmpty(virtualHostUrl) && !string.IsNullOrEmpty(replacementUrl))
            {
                _htmlTemplate = _htmlTemplate.Replace(virtualHostUrl, replacementUrl);
            }
        }

        /// <summary>
        /// Load template from a string directly (for testing or special cases).
        /// </summary>
        public void LoadTemplateFromString(string templateHtml)
        {
            _htmlTemplate = templateHtml;
        }

        /// <summary>
        /// Wrap content with the loaded template.
        /// If the content is already a complete HTML document (contains &lt;/html&gt;), returns it as-is.
        /// </summary>
        /// <param name="content">HTML content to wrap</param>
        /// <param name="screenScaleFactor">Optional screen scale factor (WPF uses this, CLI ignores)</param>
        /// <param name="scrollY">Optional scroll Y position to restore (WPF uses this, CLI ignores)</param>
        /// <returns>Complete HTML document</returns>
        public string Wrap(string content, double? screenScaleFactor = null, int scrollY = 0)
        {
            if (string.IsNullOrEmpty(_htmlTemplate))
                return content;

            // If content is already a complete HTML document, return as-is
            if (content.Contains("</html>", StringComparison.OrdinalIgnoreCase))
                return content;

            _sb.Clear();

            // Apply template (with optional screen scale factor)
            if (screenScaleFactor.HasValue)
            {
                var ssf = Math.Round(0.9 * Math.Sqrt(screenScaleFactor.Value), 2)
                    .ToString(System.Globalization.CultureInfo.InvariantCulture);
                _sb.Append(_htmlTemplate.Replace("var(--screen-scale-factor)", ssf));
            }
            else
            {
                _sb.Append(_htmlTemplate);
            }

            // Append content
            _sb.Append(content);

            // Optional scroll restoration (WPF feature)
            if (scrollY > 0)
            {
                _sb.Append($"<script>window.onload = function() {{ window.scrollTo(0, {scrollY}); }};</script>");
            }

            _sb.Append("</div> </body></html>");
            return _sb.ToString();
        }

        /// <summary>
        /// Find the template file path using culture extension.
        /// Shared logic for locating template.html / template.bg.html / template.zh.html.
        /// </summary>
        /// <param name="docPath">Base directory containing templates (e.g., "doc/")</param>
        /// <param name="cultureExtension">Culture extension (e.g., ".bg" or ".zh" or "")</param>
        /// <returns>Full path to the template file, or null if not found</returns>
        public static string FindTemplatePath(string docPath, string cultureExtension)
        {
            // Try culture-specific first
            if (!string.IsNullOrEmpty(cultureExtension))
            {
                var culturePath = Path.Combine(docPath, $"template{cultureExtension}.html");
                if (File.Exists(culturePath))
                    return culturePath;
            }

            // Fall back to default template.html
            var defaultPath = Path.Combine(docPath, "template.html");
            if (File.Exists(defaultPath))
                return defaultPath;

            return null;
        }
    }
}
