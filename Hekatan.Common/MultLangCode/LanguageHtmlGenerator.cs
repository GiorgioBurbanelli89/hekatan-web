using System;
using System.Collections.Generic;
using System.Text;
using System.Web;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Generates HTML output for language execution results.
    /// Uses CSS from MultLangTemplateManager (loaded from .css files per language).
    /// </summary>
    public static class LanguageHtmlGenerator
    {
        // Counter for unique IDs
        private static int _outputCounter = 0;

        /// <summary>
        /// Generates HTML output for an execution result.
        /// CSS classes come from templates.json via MultLangTemplateManager.
        /// </summary>
        public static string GenerateHtml(string language, ExecutionResult result, bool enableCollapse = true)
        {
            // Mark language as used so CSS gets injected
            MultLangTemplateManager.MarkLanguageUsed(language);

            // If IsHtmlOutput is true, return the raw HTML directly without any wrapper
            if (result.IsHtmlOutput && result.Success)
                return result.Output;

            // Check for @@DSL commands (pyhekatan protocol) — parse DSL before HTML
            if (result.Success && !string.IsNullOrWhiteSpace(result.Output) &&
                HekatanDslParser.ContainsDslCommands(result.Output))
            {
                return HekatanDslParser.ProcessOutput(result.Output);
            }

            var template = MultLangTemplateManager.GetTemplate(language);
            var displayName = template.DisplayName;
            var containerClass = template.ContainerClass;
            var color = template.HeaderColor;
            var output = result.Output;
            var error = result.Error;

            var sb = new StringBuilder();

            // Simple output — no header, no window chrome
            // Just the result in a clean container
            if (!result.Success)
            {
                sb.AppendLine($"<div class='lang-block {containerClass}'>");
                sb.AppendLine("<div class='lang-error'>");
                sb.AppendLine(HttpUtility.HtmlEncode($"ERROR:\n{error}"));
                sb.AppendLine("</div>");
                sb.AppendLine("</div>");
            }
            else if (!string.IsNullOrWhiteSpace(output))
            {
                sb.AppendLine($"<div class='lang-output-text {containerClass}'>");
                if (ContainsHtmlTags(output))
                    sb.AppendLine(ProcessOutputWithHtml(output));
                else
                    sb.AppendLine(HttpUtility.HtmlEncode(output));
                sb.AppendLine("</div>");
            }
            else
            {
                if (IsGuiLanguage(language))
                {
                    sb.AppendLine($"<div class='lang-success'>");
                    sb.AppendLine($"{displayName} ejecutado correctamente (ventana GUI mostrada)");
                    sb.AppendLine("</div>");
                }
                // No output, no message — silent
            }

            return sb.ToString();
        }

        /// <summary>
        /// Checks if a language is a GUI framework
        /// </summary>
        private static bool IsGuiLanguage(string language)
        {
            return language.ToLower() switch
            {
                "qt" => true,
                "gtk" => true,
                "wpf" => true,
                "xaml" => true,
                "avalonia" => true,
                _ => false
            };
        }

        /// <summary>
        /// Resets styles and template state for a new document run.
        /// </summary>
        public static void ResetStyles()
        {
            MultLangTemplateManager.Reset();
            _outputCounter = 0;
        }

        /// <summary>
        /// Generates HTML for multiple execution results
        /// </summary>
        public static string GenerateHtml(Dictionary<string, List<(CodeBlock block, ExecutionResult result)>> results)
        {
            var sb = new StringBuilder();

            foreach (var (language, blocks) in results)
            {
                foreach (var (block, result) in blocks)
                {
                    sb.AppendLine(GenerateHtml(language, result));
                }
            }

            return sb.ToString();
        }

        /// <summary>
        /// Generates HTML output for a code block execution
        /// </summary>
        public static string GenerateOutput(string language, string code, ExecutionResult result, bool enableCollapse = true)
        {
            return GenerateHtml(language, result, enableCollapse);
        }

        /// <summary>
        /// Generates HTML for when a language is not available
        /// </summary>
        public static string GenerateNotAvailable(string language, string code)
        {
            var result = new ExecutionResult
            {
                Success = false,
                Error = $"Language '{language}' is not installed or not found in PATH.\nPlease install it and add to system PATH."
            };
            return GenerateHtml(language, result);
        }

        /// <summary>
        /// Checks if output contains HTML tags that should be preserved
        /// </summary>
        private static bool ContainsHtmlTags(string output)
        {
            if (string.IsNullOrEmpty(output))
                return false;

            // Check for common HTML tags that should be preserved
            // Must match the same tags supported by IsHtmlTag()
            return output.Contains("<img", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<a ", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<div", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<span", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<table", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<p>", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<p ", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<ul", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<ol", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<li", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<strong>", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<em>", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<br", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<hr", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<h1", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<h2", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<h3", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<h4", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<h5", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<h6", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<tr", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<td", StringComparison.OrdinalIgnoreCase) ||
                   output.Contains("<th", StringComparison.OrdinalIgnoreCase) ||
                   // SVG support — allow code blocks to output raw SVG graphics
                   output.Contains("<svg", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Processes output that contains HTML tags - preserves HTML, escapes plain text
        /// </summary>
        private static string ProcessOutputWithHtml(string output)
        {
            var sb = new StringBuilder();
            var lines = output.Split('\n');

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                // If line starts with HTML tag, don't escape it
                // Support common HTML tags: img, a, div, span, table, p, ul, ol, li, h1-h6, strong, em, br, hr
                if (trimmed.StartsWith("<") && IsHtmlTag(trimmed))
                {
                    sb.AppendLine(line);
                }
                else
                {
                    sb.AppendLine(HttpUtility.HtmlEncode(line));
                }
            }

            return sb.ToString().TrimEnd();
        }

        /// <summary>
        /// Checks if a line contains a recognized HTML tag
        /// </summary>
        private static bool IsHtmlTag(string trimmed)
        {
            // Common HTML tags to preserve
            return trimmed.StartsWith("<img", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<a ", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<div", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<span", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<table", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<p>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<p ", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</p>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<ul>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<ul ", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</ul>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<ol>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<ol ", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</ol>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<li>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<li ", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</li>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<strong>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</strong>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<em>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</em>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<br", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<hr", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<h1", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<h2", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<h3", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<h4", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<h5", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<h6", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</h", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</div>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</span>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</table>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<tr", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</tr>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<td", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</td>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<th", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</th>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<thead", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</thead>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<tbody", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</tbody>", StringComparison.OrdinalIgnoreCase) ||
                   // SVG elements — allow raw SVG output from code blocks
                   trimmed.StartsWith("<svg", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</svg>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<line", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<polyline", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<polygon", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<rect", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<circle", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<ellipse", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<path", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<text", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</text>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<g", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</g>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<defs", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</defs>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<marker", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</marker>", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("<style", StringComparison.OrdinalIgnoreCase) ||
                   trimmed.StartsWith("</style>", StringComparison.OrdinalIgnoreCase);
        }
    }
}
