using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Hekatan.Common
{
    /// <summary>
    /// Centralized post-processing of HekatanProcessor results.
    /// Handles the decision tree: MultilangProcessed? → inline markers → ExpressionParser.
    /// Shared by both CLI and WPF to avoid duplicate logic.
    /// </summary>
    public class HekatanOutputProcessor
    {
        /// <summary>
        /// Delegate for executing Hekatan native code and returning HTML result.
        /// CLI creates a new ExpressionParser; WPF reuses its _parser instance.
        /// </summary>
        public delegate string HekatanExecutor(string calcpadCode);

        /// <summary>
        /// Delegate for full parsing (normal Hekatan flow when no external code).
        /// Returns (htmlResult, openXmlExpressions).
        /// </summary>
        public delegate (string HtmlResult, List<string> OpenXmlExpressions) FullParseExecutor(string code);

        /// <summary>
        /// Result of processing output.
        /// </summary>
        public class OutputResult
        {
            public string HtmlContent { get; set; }
            public List<string> OpenXmlExpressions { get; set; }
            public bool HasMacroErrors { get; set; }
            public bool MultilangProcessed { get; set; }
        }

        /// <summary>
        /// Process the output from HekatanProcessor.
        /// Flow:
        ///   1. If macro errors → show code as HTML
        ///   2. If MultilangProcessed → batch-evaluate inline Hekatan markers → return HTML
        ///   3. Otherwise → full Hekatan parse → return HTML
        /// </summary>
        public static OutputResult Process(
            ProcessingResult processingResult,
            HekatanExecutor inlineExecutor,
            FullParseExecutor fullParser)
        {
            var result = new OutputResult
            {
                HasMacroErrors = processingResult.HasMacroErrors,
                MultilangProcessed = processingResult.MultilangProcessed
            };

            var processedCode = processingResult.ProcessedCode;

            // PATH 0: Complete HTML5 document → pass through directly (no ExpressionParser)
            if (processingResult.IsCompleteHtml5)
            {
                result.HtmlContent = processedCode;
                result.OpenXmlExpressions = new List<string>();
                return result;
            }

            // PATH 1: Macro errors → show unwrapped code
            if (processingResult.HasMacroErrors)
            {
                result.HtmlContent = HekatanReader.CodeToHtml(processedCode);
                result.OpenXmlExpressions = new List<string>();
                return result;
            }

            // PATH 2: External code was processed (MultilangProcessed) → HTML with markers
            if (processingResult.MultilangProcessed)
            {
                var htmlContent = processedCode;
                result.OpenXmlExpressions = new List<string>();

                // Batch-evaluate ALL CALCPAD_INLINE markers in ONE Parse() call
                // so variables persist across lines (a=6, b=4, c=a+b works)
                if (htmlContent.Contains("<!--CALCPAD_INLINE:"))
                {
                    htmlContent = BatchEvaluateInlineMarkers(htmlContent, inlineExecutor);
                }

                result.HtmlContent = htmlContent;
                return result;
            }

            // PATH 3: Normal Hekatan processing → use ExpressionParser
            var (htmlResult, openXmlExpressions) = fullParser(processedCode);

            // Process MULTILANG_OUTPUT markers (from mixed mode)
            htmlResult = GlobalParser.ProcessMultilangOutputMarkers(htmlResult);

            result.HtmlContent = htmlResult;
            result.OpenXmlExpressions = openXmlExpressions;
            return result;
        }

        /// <summary>
        /// Batch-evaluates all CALCPAD_INLINE markers in ONE ExpressionParser.Parse() call.
        /// This ensures variables persist across lines (e.g., a=6, b=4, c=a+b works).
        ///
        /// Strategy:
        /// 1. Find all markers in order
        /// 2. Decode each to get the Hekatan math line
        /// 3. Join ALL lines into ONE code block
        /// 4. Call ExpressionParser.Parse() ONCE
        /// 5. Split the HTML result into per-line segments
        /// 6. Replace each marker with its corresponding HTML segment
        /// </summary>
        private static string BatchEvaluateInlineMarkers(string html, HekatanExecutor executor)
        {
            var markerPattern = new Regex(@"<!--CALCPAD_INLINE:([A-Za-z0-9+/=]+)-->");
            var matches = markerPattern.Matches(html);

            if (matches.Count == 0)
                return html;

            // 1. Decode all markers to get Hekatan code lines
            var codeLines = new List<string>();
            foreach (Match match in matches)
            {
                try
                {
                    var base64 = match.Groups[1].Value;
                    var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(base64));
                    codeLines.Add(decoded);
                }
                catch
                {
                    codeLines.Add(""); // placeholder for failed decode
                }
            }

            // 2. Combine ALL lines into ONE code block and parse ONCE
            var combinedCode = string.Join("\n", codeLines);
            string combinedHtml;
            try
            {
                combinedHtml = executor(combinedCode);
            }
            catch (Exception ex)
            {
                // If parsing fails entirely, replace all markers with error message
                var errorHtml = $"<p><span class='err'>Error: {ex.Message}</span></p>";
                var errorResult = html;
                foreach (Match match in matches)
                    errorResult = errorResult.Replace(match.Value, errorHtml);
                return errorResult;
            }

            // 3. Split HTML result into per-line segments
            // ExpressionParser terminates each line's output with AppendLine() (\n)
            // Each non-empty segment corresponds to one input line
            var segments = combinedHtml.Split('\n')
                .Select(s => s.TrimEnd('\r'))
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToArray();

            // 4. Replace each marker with its corresponding HTML segment
            // Build result forward for efficiency
            var sb = new StringBuilder(html.Length + combinedHtml.Length);
            int pos = 0;
            for (int i = 0; i < matches.Count; i++)
            {
                var marker = matches[i];
                // Append everything before this marker
                sb.Append(html, pos, marker.Index - pos);
                // Append the evaluated HTML for this line
                if (i < segments.Length)
                    sb.Append(segments[i]);
                pos = marker.Index + marker.Length;
            }
            // Append remainder after last marker
            sb.Append(html, pos, html.Length - pos);

            // Append extra segments (error summary, etc.) if any
            if (segments.Length > matches.Count)
            {
                for (int i = matches.Count; i < segments.Length; i++)
                {
                    sb.AppendLine();
                    sb.Append(segments[i]);
                }
            }

            return sb.ToString();
        }
    }
}
