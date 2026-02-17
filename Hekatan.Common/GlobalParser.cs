#nullable enable
using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using Hekatan.Common.MultLangCode;

namespace Hekatan.Common
{
    /// <summary>
    /// Parser Global - Decides whether to use external code execution OR Hekatan math parser
    /// NEVER both on the same content
    /// </summary>
    public class GlobalParser
    {
        private readonly MultLangProcessor _multLangProcessor;
        private ExecutionTracker? _tracker;

        public GlobalParser(ExecutionTracker? tracker = null)
        {
            _tracker = tracker;
            _multLangProcessor = new MultLangProcessor(_tracker);
        }

        /// <summary>
        /// Processes code by routing to EITHER external code processor OR Hekatan parser
        /// </summary>
        /// <param name="code">Input code</param>
        /// <param name="hasExternalCode">OUT: True if external code blocks were detected</param>
        /// <param name="progressCallback">Optional callback for progress updates during external code execution</param>
        /// <param name="partialResultCallback">Optional callback for partial HTML results as they become available</param>
        /// <returns>Processed code (either MultLang output or original code for Hekatan)</returns>
        public string Process(string code, out bool hasExternalCode, Action<string>? progressCallback = null, Action<string>? partialResultCallback = null)
        {
            _tracker?.EnterMethod("GlobalParser", "Process", $"Code length: {code.Length} chars");

            // PREPROCESSOR: @{config} directive - change comment character, etc.
            code = PreprocessConfig(code);

            // PREPROCESSOR: @{hide}/@{end hide} → #hide/#show (visibility control via global parser syntax)
            code = PreprocessVisibility(code);

            // PREPROCESSOR: Convert @(tag content) to <tag>content</tag>
            code = PreprocessAtSyntax(code);

            // PREPROCESSOR: @{include filename} - resolve file includes BEFORE bifurcation
            // Works for BOTH paths (MultLang and pure Hekatan)
            code = PreprocessIncludes(code);

            // CHECK FOR PAGE MODE: @{page markdown}
            if (IsMarkdownPageMode(code, out var markdownContent))
            {
                hasExternalCode = true;
                return ProcessMarkdownPage(markdownContent, progressCallback);
            }

            // HEKATAN MODE: Everything goes through MultLangProcessor
            // Text without @{} blocks is rendered as markdown
            // Calcpad parser only activates inside @{calcpad}...@{end calcpad} blocks
            hasExternalCode = true;
            return _multLangProcessor.Process(code, returnHtml: true, enableCollapse: false, progressCallback: progressCallback, partialResultCallback: partialResultCallback);
        }

        /// <summary>
        /// Check if code has any @{...} directive blocks
        /// </summary>
        private bool HasAnyDirectiveBlocks(string code)
        {
            // Simple check: does code contain @{ followed by a word and either } or content
            // Skip @{config} which is a preprocessor directive, not a language block
            var matches = System.Text.RegularExpressions.Regex.Matches(code, @"@\{([a-zA-Z]+)");
            foreach (System.Text.RegularExpressions.Match m in matches)
            {
                var word = m.Groups[1].Value;
                // Skip preprocessor directives that are converted before this check
                if (word.Equals("config", StringComparison.OrdinalIgnoreCase) ||
                    word.Equals("hide", StringComparison.OrdinalIgnoreCase) ||
                    word.Equals("show", StringComparison.OrdinalIgnoreCase) ||
                    word.Equals("include", StringComparison.OrdinalIgnoreCase))
                    continue;
                return true;
            }
            return false;
        }

        /// <summary>
        /// Preprocessor: @{include filename} - resolves file includes
        /// Runs BEFORE HasAnyDirectiveBlocks() so it works for BOTH processing paths
        /// Supports nested includes with max depth of 10 to prevent infinite recursion
        /// </summary>
        private string PreprocessIncludes(string code, int depth = 0)
        {
            if (depth > 10) return code; // Prevent infinite recursion

            // Match @{include filename} on its own line (with optional quotes around filename)
            var regex = new Regex(@"^@\{include\s+(.+?)\}\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase);

            if (!regex.IsMatch(code)) return code;

            return regex.Replace(code, match =>
            {
                var filename = match.Groups[1].Value.Trim().Trim('"', '\'');
                try
                {
                    var fullPath = Path.GetFullPath(Environment.ExpandEnvironmentVariables(filename));
                    if (File.Exists(fullPath))
                    {
                        var content = File.ReadAllText(fullPath);
                        // Recursive: resolve nested @{include} in included files
                        return PreprocessIncludes(content, depth + 1);
                    }
                    else
                    {
                        return $"'<p style='color:red;'>Error: @{{include}} file not found: {filename}</p>";
                    }
                }
                catch (Exception ex)
                {
                    return $"'<p style='color:red;'>Error: @{{include}} {filename}: {ex.Message}</p>";
                }
            });
        }

        /// <summary>
        /// Checks if code contains Hekatan calculations (not just external code and comments)
        /// </summary>
        private bool HasHekatanCode(string code)
        {
            var lines = code.Split('\n');
            bool inExternalBlock = false;

            foreach (var line in lines)
            {
                var trimmed = line.Trim();

                // Track external code blocks
                if (trimmed.StartsWith("@{") && !trimmed.StartsWith("@{end"))
                {
                    inExternalBlock = true;
                    continue;
                }
                else if (trimmed.StartsWith("@{end"))
                {
                    inExternalBlock = false;
                    continue;
                }

                // Skip lines inside external blocks
                if (inExternalBlock)
                    continue;

                // Skip only empty lines
                if (string.IsNullOrWhiteSpace(trimmed))
                    continue;

                // Lines starting with ' or " are Hekatan text/headings - this IS Hekatan code
                if (trimmed.StartsWith("'") || trimmed.StartsWith("\""))
                    return true;

                // If we reach here, it's likely Hekatan code
                // Look for typical Hekatan patterns: assignments, calculations
                if (trimmed.Contains("=") || trimmed.Contains("+") || trimmed.Contains("*") ||
                    trimmed.Contains("/") || char.IsLetterOrDigit(trimmed[0]))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Preprocesses mixed code: executes external blocks and replaces them with HTML comments
        /// </summary>
        private string PreprocessMixedCode(string code, Action<string>? progressCallback, Action<string>? partialResultCallback)
        {
            // Process external code blocks to get their HTML output
            // returnHtml=false means it will return Hekatan comments with HTML
            return _multLangProcessor.Process(code, returnHtml: false, enableCollapse: false, progressCallback: progressCallback, partialResultCallback: partialResultCallback);
        }

        /// <summary>
        /// Quick check if code contains external language blocks
        /// </summary>
        public static bool HasExternalCode(string code)
        {
            return MultLangManager.HasLanguageCode(code);
        }

        /// <summary>
        /// Gets exported variables from external code execution
        /// </summary>
        public System.Collections.Generic.IReadOnlyDictionary<string, object> ExportedVariables
            => _multLangProcessor.ExportedVariables;

        /// <summary>
        /// Processes inline Hekatan code markers in HTML output
        /// This is called from the presentation layer with access to ExpressionParser
        /// </summary>
        /// <param name="htmlContent">HTML content with <!--CALCPAD_INLINE:base64--> markers</param>
        /// <param name="calcpadExecutor">Function that executes Hekatan code and returns HTML result</param>
        /// <returns>HTML with inline Hekatan results</returns>
        public static string ProcessHekatanInlineMarkers(string htmlContent, System.Func<string, string> calcpadExecutor)
        {
            if (string.IsNullOrEmpty(htmlContent) || calcpadExecutor == null)
                return htmlContent;

            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                var markerCount = System.Text.RegularExpressions.Regex.Matches(htmlContent, @"<!--CALCPAD_INLINE:").Count;
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] ProcessHekatanInlineMarkers START: {markerCount} markers found in input\n");

                // Find first marker and show what's around it
                var firstMarkerIndex = htmlContent.IndexOf("<!--CALCPAD_INLINE:");
                if (firstMarkerIndex >= 0)
                {
                    var contextStart = Math.Max(0, firstMarkerIndex - 50);
                    var contextLength = Math.Min(150, htmlContent.Length - contextStart);
                    var context = htmlContent.Substring(contextStart, contextLength);
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss}] First marker at index {firstMarkerIndex}, context: '{context}'\n");
                }
            }
            catch { }

            var result = new StringBuilder();
            int i = 0;
            int markersProcessed = 0;

            while (i < htmlContent.Length)
            {
                // Debug: Check at index 622 (where first marker is)
                if (i == 622)
                {
                    try
                    {
                        var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                        var substring = htmlContent.Substring(i, Math.Min(30, htmlContent.Length - i));
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] At index 622: '{substring}'\n");

                        // Show byte codes of first 20 characters
                        var bytes = Encoding.UTF8.GetBytes(substring.Substring(0, Math.Min(20, substring.Length)));
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] Bytes: {BitConverter.ToString(bytes)}\n");

                        var expected = "<!--CALCPAD_INLINE:";
                        var expectedBytes = Encoding.UTF8.GetBytes(expected);
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] Expected bytes: {BitConverter.ToString(expectedBytes)}\n");

                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] Comparing to '<!--CALCPAD_INLINE:' = {htmlContent.Substring(i, 20) == "<!--CALCPAD_INLINE:"}\n");
                    }
                    catch { }
                }

                // Look for marker: <!--CALCPAD_INLINE:
                // Use IndexOf instead of Substring comparison (more reliable)
                if (i < htmlContent.Length &&
                    htmlContent.IndexOf("<!--CALCPAD_INLINE:", i, StringComparison.Ordinal) == i)
                {
                    markersProcessed++;
                    try
                    {
                        var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] ProcessHekatanInlineMarkers: Found marker #{markersProcessed} at position {i}\n");
                    }
                    catch { }

                    i += 19; // Skip marker "<!--CALCPAD_INLINE:" (19 chars, not 20!)

                    // Find end of comment: -->
                    int endIndex = htmlContent.IndexOf("-->", i);
                    if (endIndex > i)
                    {
                        string base64Code = htmlContent.Substring(i, endIndex - i);

                        try
                        {
                            var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                            System.IO.File.AppendAllText(debugPath,
                                $"[{DateTime.Now:HH:mm:ss}] Decoding base64: {base64Code.Substring(0, Math.Min(20, base64Code.Length))}...\n");
                        }
                        catch { }

                        try
                        {
                            // Decode base64
                            byte[] data = Convert.FromBase64String(base64Code);
                            string calcpadCode = Encoding.UTF8.GetString(data);

                            try
                            {
                                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                                System.IO.File.AppendAllText(debugPath,
                                    $"[{DateTime.Now:HH:mm:ss}] Decoded to: {calcpadCode}\n");
                                System.IO.File.AppendAllText(debugPath,
                                    $"[{DateTime.Now:HH:mm:ss}] Calling calcpadExecutor...\n");
                            }
                            catch { }

                            // Execute Hekatan code
                            string calcpadResult = calcpadExecutor(calcpadCode);

                            try
                            {
                                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                                System.IO.File.AppendAllText(debugPath,
                                    $"[{DateTime.Now:HH:mm:ss}] Got result: {calcpadResult.Substring(0, Math.Min(50, calcpadResult.Length))}...\n");
                            }
                            catch { }

                            // Append result
                            result.Append(calcpadResult);
                        }
                        catch (Exception ex)
                        {
                            try
                            {
                                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                                System.IO.File.AppendAllText(debugPath,
                                    $"[{DateTime.Now:HH:mm:ss}] ERROR: {ex.Message}\n");
                            }
                            catch { }

                            // If decoding or execution fails, keep the marker
                            result.Append($"<!--CALCPAD_INLINE:{base64Code}-->");
                        }

                        i = endIndex + 3; // Skip -->
                    }
                    else
                    {
                        result.Append(htmlContent[i]);
                        i++;
                    }
                }
                else
                {
                    result.Append(htmlContent[i]);
                    i++;
                }
            }

            return result.ToString();
        }

        /// <summary>
        /// Processes MULTILANG_OUTPUT markers in HTML content
        /// Replaces <!--MULTILANG_OUTPUT:base64--> with the decoded HTML
        /// </summary>
        /// <param name="htmlContent">HTML content with MULTILANG_OUTPUT markers</param>
        /// <returns>HTML with markers replaced by decoded content</returns>
        public static string ProcessMultilangOutputMarkers(string htmlContent)
        {
            if (string.IsNullOrEmpty(htmlContent))
                return htmlContent;

            const string markerStart = "<!--MULTILANG_OUTPUT:";
            const string markerEnd = "-->";

            // Quick check: if no markers, return as-is
            if (!htmlContent.Contains(markerStart))
                return htmlContent;

            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] ProcessMultilangOutputMarkers: Processing markers...\n");
            }
            catch { }

            var result = new StringBuilder();
            int i = 0;
            int markersProcessed = 0;

            while (i < htmlContent.Length)
            {
                // Look for marker: <!--MULTILANG_OUTPUT:
                if (i + markerStart.Length < htmlContent.Length &&
                    htmlContent.Substring(i, markerStart.Length) == markerStart)
                {
                    markersProcessed++;
                    int start = i + markerStart.Length;
                    int endIndex = htmlContent.IndexOf(markerEnd, start, StringComparison.Ordinal);

                    if (endIndex > start)
                    {
                        var base64Content = htmlContent.Substring(start, endIndex - start);

                        try
                        {
                            // Decode base64 to get the original HTML
                            var decodedBytes = Convert.FromBase64String(base64Content);
                            var decodedHtml = System.Text.Encoding.UTF8.GetString(decodedBytes);

                            // Insert the decoded HTML
                            result.Append(decodedHtml);

                            try
                            {
                                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                                System.IO.File.AppendAllText(debugPath,
                                    $"[{DateTime.Now:HH:mm:ss}] ProcessMultilangOutputMarkers: Decoded marker #{markersProcessed}, HTML length: {decodedHtml.Length}\n");
                            }
                            catch { }
                        }
                        catch (Exception ex)
                        {
                            // If decoding fails, keep the marker as-is
                            result.Append($"<!--MULTILANG_OUTPUT:{base64Content}-->");

                            try
                            {
                                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                                System.IO.File.AppendAllText(debugPath,
                                    $"[{DateTime.Now:HH:mm:ss}] ProcessMultilangOutputMarkers: Failed to decode marker #{markersProcessed}: {ex.Message}\n");
                            }
                            catch { }
                        }

                        i = endIndex + markerEnd.Length;
                    }
                    else
                    {
                        result.Append(htmlContent[i]);
                        i++;
                    }
                }
                else
                {
                    result.Append(htmlContent[i]);
                    i++;
                }
            }

            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] ProcessMultilangOutputMarkers: Processed {markersProcessed} markers, result length: {result.Length}\n");
            }
            catch { }

            return result.ToString();
        }

        /// <summary>
        /// Checks if the code starts with @{page markdown} directive
        /// </summary>
        /// <param name="code">Input code</param>
        /// <param name="markdownContent">Content after the directive (if found)</param>
        /// <returns>True if @{page markdown} was found</returns>
        private bool IsMarkdownPageMode(string code, out string markdownContent)
        {
            markdownContent = code;

            if (string.IsNullOrWhiteSpace(code))
                return false;

            var lines = code.Split('\n');
            foreach (var line in lines)
            {
                var trimmed = line.Trim().ToLower();

                // Skip empty lines and comments at the start
                if (string.IsNullOrWhiteSpace(trimmed))
                    continue;
                if (trimmed.StartsWith("'"))
                    continue;

                // Check for @{page markdown} directive
                if (trimmed == "@{page markdown}" || trimmed.StartsWith("@{page markdown}"))
                {
                    // Find where this line ends and get everything after
                    var idx = code.IndexOf(line) + line.Length;
                    markdownContent = idx < code.Length ? code.Substring(idx).TrimStart('\r', '\n') : "";
                    return true;
                }

                // If first non-empty, non-comment line is not @{page markdown}, stop checking
                break;
            }

            return false;
        }

        /// <summary>
        /// Processes entire page as Markdown with support for ALL parsers:
        /// - $$expression$$ = Hekatan block (evaluated and rendered as math)
        /// - $variable = Inline value substitution
        /// - @{table}...@{end table} = Table from matrix/vector
        /// - @{columns N}...@{column}...@{end columns} = Multi-column layout
        /// - @{python}...@{end python} = Python code
        /// - @{octave}...@{end octave} = Octave/MATLAB code
        /// - @{typescript}...@{end typescript} = TypeScript code
        /// - Any other @{language}...@{end language} = External code
        /// - Everything else = Markdown
        /// </summary>
        private string ProcessMarkdownPage(string content, Action<string>? progressCallback)
        {
            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] ProcessMarkdownPage: Processing {content.Length} chars\n");
            }
            catch { }

            var variables = new System.Collections.Generic.Dictionary<string, object>();
            var result = new StringBuilder();

            // Process in segments: Hekatan blocks ($$...$$), @{lang}, @{table}, and Markdown
            int i = 0;
            var markdownBuffer = new StringBuilder();

            while (i < content.Length)
            {
                // Check for Hekatan block: $$...$$
                if (i + 2 < content.Length && content.Substring(i, 2) == "$$")
                {
                    // Flush markdown buffer first
                    if (markdownBuffer.Length > 0)
                    {
                        result.Append(RenderMarkdownSegment(markdownBuffer.ToString(), variables));
                        markdownBuffer.Clear();
                    }

                    i += 2; // Skip opening $$
                    int endHekatan = content.IndexOf("$$", i);
                    if (endHekatan > i)
                    {
                        var calcpadCode = content.Substring(i, endHekatan - i).Trim();
                        // Mark for Hekatan processing
                        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(calcpadCode));
                        result.Append($"<!--CALCPAD_INLINE:{base64}-->");
                        i = endHekatan + 2;
                    }
                    else
                    {
                        markdownBuffer.Append("$$");
                    }
                }
                // Check for @{...} external code blocks (including @{table}, @{columns})
                else if (i + 2 < content.Length && content.Substring(i, 2) == "@{")
                {
                    // Find the closing } of the directive
                    int closeDirective = content.IndexOf('}', i + 2);
                    if (closeDirective > i + 2)
                    {
                        var directiveContent = content.Substring(i + 2, closeDirective - i - 2).Trim();
                        var langName = directiveContent.Split(' ')[0].ToLower();

                        // Special handling for @{end page markdown} - just skip it
                        if (directiveContent.Equals("end page markdown", StringComparison.OrdinalIgnoreCase))
                        {
                            // Skip this closing tag completely - it's not meant to be shown
                            i = closeDirective + 1;
                            continue;
                        }
                        // Special handling for @{columns N}
                        else if (langName == "columns")
                        {
                            // Flush markdown buffer first
                            if (markdownBuffer.Length > 0)
                            {
                                result.Append(RenderMarkdownSegment(markdownBuffer.ToString(), variables));
                                markdownBuffer.Clear();
                            }

                            // Process columns block
                            var endColumnsDirective = "@{end columns}";
                            int endColumnsBlock = content.IndexOf(endColumnsDirective, closeDirective, StringComparison.OrdinalIgnoreCase);

                            if (endColumnsBlock > closeDirective)
                            {
                                var columnsContent = content.Substring(closeDirective + 1, endColumnsBlock - closeDirective - 1);
                                var columnsHtml = ProcessColumnsBlock(directiveContent, columnsContent, variables, progressCallback);
                                result.Append(columnsHtml);
                                i = endColumnsBlock + endColumnsDirective.Length;
                            }
                            else
                            {
                                // No end directive found, treat as regular text
                                markdownBuffer.Append("@{");
                                i += 2;
                            }
                        }
                        else
                        {
                            // Find the end directive
                            var endDirective = $"@{{end {langName}}}";
                            int endBlock = content.IndexOf(endDirective, closeDirective, StringComparison.OrdinalIgnoreCase);

                            if (endBlock > closeDirective)
                            {
                                // Flush markdown buffer
                                if (markdownBuffer.Length > 0)
                                {
                                    result.Append(RenderMarkdownSegment(markdownBuffer.ToString(), variables));
                                    markdownBuffer.Clear();
                                }

                                // Extract the code block
                                var codeStart = closeDirective + 1;
                                var codeContent = content.Substring(codeStart, endBlock - codeStart);

                                // Process based on language type
                                if (langName == "table")
                                {
                                    // Table is handled by MultLangProcessor
                                    result.Append(_multLangProcessor.ProcessTableBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "eqdef" || langName == "ecuaciondef" || langName == "eqdefinicion")
                                {
                                    // Equation with definitions - handled by MultLangProcessor
                                    result.Append(_multLangProcessor.ProcessEqDefBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "eq" || langName == "equation" || langName == "ecuacion" || langName == "formula")
                                {
                                    // Equation block - handled by MultLangProcessor
                                    result.Append(_multLangProcessor.ProcessEquationBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "plot" || langName == "grafica" || langName == "grafico")
                                {
                                    // Plot block - handled by MultLangProcessor with variables
                                    result.Append(_multLangProcessor.ProcessPlotBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "svg")
                                {
                                    // SVG DSL block - handled by MultLangProcessor
                                    result.Append(_multLangProcessor.ProcessSvgBlockPublic(codeContent.Trim(), directiveContent, variables));
                                }
                                else if (langName == "tree")
                                {
                                    // Tree diagram block - handled by MultLangProcessor
                                    result.Append(_multLangProcessor.ProcessTreeBlockPublic(codeContent.Trim(), directiveContent, variables));
                                }
                                else if (langName == "three")
                                {
                                    // Three.js 3D scene block - handled by MultLangProcessor
                                    result.Append(_multLangProcessor.ProcessThreeBlockPublic(codeContent.Trim(), directiveContent, variables));
                                }
                                else if (langName == "triangle")
                                {
                                    // Triangle (Shewchuk) mesh block - handled by MultLangProcessor
                                    result.Append(_multLangProcessor.ProcessTriangleBlockPublic(codeContent.Trim(), directiveContent, variables));
                                }
                                else if (langName == "integral" || langName == "integrales")
                                {
                                    // Integral convenience block
                                    result.Append(_multLangProcessor.ProcessIntegralBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "derivate" || langName == "derivative" || langName == "derivada")
                                {
                                    // Derivative convenience block
                                    result.Append(_multLangProcessor.ProcessDerivateBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "gauss" || langName == "cuadratura")
                                {
                                    // Gauss quadrature convenience block
                                    result.Append(_multLangProcessor.ProcessGaussBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "function" || langName == "funcion" || langName == "func")
                                {
                                    // Function definition block (Octave/MATLAB syntax)
                                    result.Append(_multLangProcessor.ProcessFunctionBlockPublic(codeContent.Trim(), variables));
                                }
                                else
                                {
                                    // External language - process with MultLangProcessor
                                    var fullBlock = $"@{{{directiveContent}}}\n{codeContent}\n{endDirective}";
                                    var blockHtml = _multLangProcessor.Process(fullBlock, returnHtml: true, enableCollapse: false, progressCallback: progressCallback);

                                    // Extract variables from execution
                                    foreach (var kv in _multLangProcessor.ExportedVariables)
                                    {
                                        variables[kv.Key] = kv.Value;
                                    }

                                    result.Append(blockHtml);
                                }

                                i = endBlock + endDirective.Length;
                            }
                            else
                            {
                                // No end directive found, treat as regular text
                                markdownBuffer.Append("@{");
                                i += 2;
                            }
                        }
                    }
                    else
                    {
                        markdownBuffer.Append("@{");
                        i += 2;
                    }
                }
                else
                {
                    markdownBuffer.Append(content[i]);
                    i++;
                }
            }

            // Flush remaining markdown
            if (markdownBuffer.Length > 0)
            {
                result.Append(RenderMarkdownSegment(markdownBuffer.ToString(), variables));
            }

            // Wrap in basic HTML structure
            var html = $@"<div class='markdown-page'>
{result}
</div>";

            return html;
        }

        /// <summary>
        /// Processes @{columns N}...@{column}...@{end columns} blocks
        /// </summary>
        /// <param name="directive">The full directive content (e.g., "columns 3")</param>
        /// <param name="content">Content between @{columns N} and @{end columns}</param>
        /// <param name="variables">Variables dictionary for substitution</param>
        /// <param name="progressCallback">Progress callback for external code</param>
        /// <returns>HTML with CSS grid layout</returns>
        private string ProcessColumnsBlock(string directive, string content, System.Collections.Generic.Dictionary<string, object> variables, Action<string>? progressCallback)
        {
            // Parse number of columns from directive "columns N"
            var parts = directive.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            int numColumns = 2; // Default
            if (parts.Length >= 2 && int.TryParse(parts[1], out int n) && n > 0)
            {
                numColumns = Math.Min(n, 12); // Max 12 columns
            }

            // Split content by @{column} separator
            var columnSeparator = "@{column}";
            var columnContents = new System.Collections.Generic.List<string>();

            int pos = 0;
            while (pos < content.Length)
            {
                int nextSep = content.IndexOf(columnSeparator, pos, StringComparison.OrdinalIgnoreCase);
                if (nextSep >= 0)
                {
                    columnContents.Add(content.Substring(pos, nextSep - pos));
                    pos = nextSep + columnSeparator.Length;
                }
                else
                {
                    columnContents.Add(content.Substring(pos));
                    break;
                }
            }

            // If no separators found, use numColumns to split evenly (or just use as single column)
            if (columnContents.Count == 0)
            {
                columnContents.Add(content);
            }

            // Build HTML with CSS Grid
            var html = new StringBuilder();
            html.AppendLine($"<div class=\"calcpad-columns\" style=\"display: grid; grid-template-columns: repeat({numColumns}, 1fr); gap: 1rem;\">");

            foreach (var colContent in columnContents)
            {
                html.AppendLine("<div class=\"calcpad-column\" style=\"padding: 0.5rem;\">");

                // Check if content has @{...} blocks that need special processing
                var trimmedContent = colContent.Trim();
                if (trimmedContent.Contains("@{") || trimmedContent.Contains("$$"))
                {
                    // Process the column content recursively (may contain Hekatan blocks, external code, etc.)
                    var processedColumn = ProcessMarkdownPageContent(trimmedContent, variables, progressCallback);
                    html.Append(processedColumn);
                }
                else
                {
                    // Plain markdown/text content - process line by line for proper alignment
                    var lines = trimmedContent.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var line in lines)
                    {
                        if (!string.IsNullOrWhiteSpace(line))
                        {
                            // Render each line through markdown for bold/italic/etc
                            var renderedLine = RenderMarkdownSegment(line.Trim(), variables);
                            // Remove wrapping <p> tags for cleaner output in div
                            renderedLine = renderedLine.Trim();
                            if (renderedLine.StartsWith("<p>") && renderedLine.EndsWith("</p>\n"))
                            {
                                renderedLine = renderedLine.Substring(3, renderedLine.Length - 8);
                            }
                            else if (renderedLine.StartsWith("<p>") && renderedLine.EndsWith("</p>"))
                            {
                                renderedLine = renderedLine.Substring(3, renderedLine.Length - 7);
                            }
                            html.AppendLine($"<div style=\"margin:0.2em 0;\">{renderedLine}</div>");
                        }
                    }
                }

                html.AppendLine("</div>");
            }

            html.AppendLine("</div>");
            return html.ToString();
        }

        /// <summary>
        /// Processes content for Markdown page mode (reusable for columns, etc.)
        /// </summary>
        private string ProcessMarkdownPageContent(string content, System.Collections.Generic.Dictionary<string, object> variables, Action<string>? progressCallback)
        {
            var result = new StringBuilder();
            int i = 0;
            var markdownBuffer = new StringBuilder();

            while (i < content.Length)
            {
                // Check for Hekatan block: $$...$$
                if (i + 2 < content.Length && content.Substring(i, 2) == "$$")
                {
                    // Flush markdown buffer first
                    if (markdownBuffer.Length > 0)
                    {
                        result.Append(RenderMarkdownSegment(markdownBuffer.ToString(), variables));
                        markdownBuffer.Clear();
                    }

                    i += 2; // Skip opening $$
                    int endHekatan = content.IndexOf("$$", i);
                    if (endHekatan > i)
                    {
                        var calcpadCode = content.Substring(i, endHekatan - i).Trim();
                        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(calcpadCode));
                        result.Append($"<!--CALCPAD_INLINE:{base64}-->");
                        i = endHekatan + 2;
                    }
                    else
                    {
                        markdownBuffer.Append("$$");
                    }
                }
                // Check for @{...} external code blocks
                else if (i + 2 < content.Length && content.Substring(i, 2) == "@{")
                {
                    int closeDirective = content.IndexOf('}', i + 2);
                    if (closeDirective > i + 2)
                    {
                        var directiveContent = content.Substring(i + 2, closeDirective - i - 2).Trim();
                        var langName = directiveContent.Split(' ')[0].ToLower();

                        // Skip @{column} - it's just a separator, handled by parent
                        if (langName == "column")
                        {
                            i = closeDirective + 1;
                            continue;
                        }

                        // Nested @{columns} support
                        if (langName == "columns")
                        {
                            if (markdownBuffer.Length > 0)
                            {
                                result.Append(RenderMarkdownSegment(markdownBuffer.ToString(), variables));
                                markdownBuffer.Clear();
                            }

                            var endColDir = "@{end columns}";
                            int endCol = content.IndexOf(endColDir, closeDirective, StringComparison.OrdinalIgnoreCase);
                            if (endCol > closeDirective)
                            {
                                var nestedContent = content.Substring(closeDirective + 1, endCol - closeDirective - 1);
                                result.Append(ProcessColumnsBlock(directiveContent, nestedContent, variables, progressCallback));
                                i = endCol + endColDir.Length;
                            }
                            else
                            {
                                markdownBuffer.Append("@{");
                                i += 2;
                            }
                        }
                        else
                        {
                            var endDirective = $"@{{end {langName}}}";
                            int endBlock = content.IndexOf(endDirective, closeDirective, StringComparison.OrdinalIgnoreCase);

                            if (endBlock > closeDirective)
                            {
                                if (markdownBuffer.Length > 0)
                                {
                                    result.Append(RenderMarkdownSegment(markdownBuffer.ToString(), variables));
                                    markdownBuffer.Clear();
                                }

                                var codeStart = closeDirective + 1;
                                var codeContent = content.Substring(codeStart, endBlock - codeStart);

                                if (langName == "table")
                                {
                                    result.Append(_multLangProcessor.ProcessTableBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "eqdef" || langName == "ecuaciondef" || langName == "eqdefinicion")
                                {
                                    result.Append(_multLangProcessor.ProcessEqDefBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "eq" || langName == "equation" || langName == "ecuacion" || langName == "formula")
                                {
                                    result.Append(_multLangProcessor.ProcessEquationBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "plot" || langName == "grafica" || langName == "grafico")
                                {
                                    result.Append(_multLangProcessor.ProcessPlotBlockPublic(codeContent.Trim(), variables));
                                }
                                else if (langName == "svg")
                                {
                                    result.Append(_multLangProcessor.ProcessSvgBlockPublic(codeContent.Trim(), directiveContent, variables));
                                }
                                else if (langName == "function" || langName == "funcion" || langName == "func")
                                {
                                    result.Append(_multLangProcessor.ProcessFunctionBlockPublic(codeContent.Trim(), variables));
                                }
                                else
                                {
                                    var fullBlock = $"@{{{directiveContent}}}\n{codeContent}\n{endDirective}";
                                    var blockHtml = _multLangProcessor.Process(fullBlock, returnHtml: true, enableCollapse: false, progressCallback: progressCallback);

                                    foreach (var kv in _multLangProcessor.ExportedVariables)
                                    {
                                        variables[kv.Key] = kv.Value;
                                    }

                                    result.Append(blockHtml);
                                }

                                i = endBlock + endDirective.Length;
                            }
                            else
                            {
                                markdownBuffer.Append("@{");
                                i += 2;
                            }
                        }
                    }
                    else
                    {
                        markdownBuffer.Append("@{");
                        i += 2;
                    }
                }
                else
                {
                    markdownBuffer.Append(content[i]);
                    i++;
                }
            }

            // Flush remaining markdown
            if (markdownBuffer.Length > 0)
            {
                result.Append(RenderMarkdownSegment(markdownBuffer.ToString(), variables));
            }

            return result.ToString();
        }

        /// <summary>
        /// Renders a segment of Markdown to HTML, with $variable substitution
        /// </summary>
        private string RenderMarkdownSegment(string markdown, System.Collections.Generic.Dictionary<string, object> variables)
        {
            // Process $variable substitution
            var processed = System.Text.RegularExpressions.Regex.Replace(
                markdown,
                @"(?<!\\)\$([a-zA-Z_][a-zA-Z0-9_]*)",
                m =>
                {
                    var varName = m.Groups[1].Value;
                    if (variables.TryGetValue(varName, out var value))
                    {
                        if (value is double d)
                            return d.ToString("G10", System.Globalization.CultureInfo.InvariantCulture);
                        return value?.ToString() ?? "";
                    }
                    // Variable not found - create marker for Hekatan to resolve
                    var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(varName));
                    return $"<!--CALCPAD_INLINE:{base64}-->";
                }
            );

            // Escape \$ to $
            processed = processed.Replace("\\$", "$");

            // Render Markdown to HTML using Markdig
            try
            {
                // Use basic pipeline (extensions are in separate package)
                return Markdig.Markdown.ToHtml(processed);
            }
            catch
            {
                // Fallback: basic HTML conversion
                return $"<p>{System.Web.HttpUtility.HtmlEncode(processed)}</p>";
            }
        }
        /// <summary>
        /// Preprocessor: @{config} directive at the start of the file.
        /// Changes comment/heading characters to resolve conflicts with ' and ".
        /// Syntax:
        ///   @{config comment:% heading:!}
        ///   @{config comment:#}
        ///   @{config comment://}
        ///   @{config rad}          → Sets angle mode to radians
        /// When comment:% is set:
        ///   Lines starting with %  → become text lines (like ' in standard Hekatan)
        ///   Lines starting with %% → become heading lines (like " in standard Hekatan)
        ///   The ' character in expressions is no longer special (allows y', f'(x), etc.)
        /// </summary>
        /// <summary>
        /// Preprocessor: Converts @{hide}/@{end hide} to #hide/#show
        /// This allows visibility control using global parser syntax @{}
        /// instead of Calcpad-native #hide/#show keywords.
        /// Also supports @{show}/@{end show} as explicit show blocks.
        /// </summary>
        private static string PreprocessVisibility(string code)
        {
            // Quick check - avoid processing if not needed
            if (!code.Contains("@{hide", StringComparison.OrdinalIgnoreCase) &&
                !code.Contains("@{show", StringComparison.OrdinalIgnoreCase))
                return code;

            var lines = code.Split(new[] { '\n' }, StringSplitOptions.None);
            for (int i = 0; i < lines.Length; i++)
            {
                var trimmed = lines[i].Trim();
                var trimmedLower = trimmed.ToLowerInvariant();

                // @{hide} or @{hide} with trailing } → #hide
                if (trimmedLower == "@{hide}" || trimmedLower == "@{hide")
                {
                    lines[i] = "#hide";
                }
                // @{end hide} → #show
                else if (trimmedLower == "@{end hide}" || trimmedLower == "@{end hide")
                {
                    lines[i] = "#show";
                }
                // @{show} → #show (explicit show directive)
                else if (trimmedLower == "@{show}" || trimmedLower == "@{show")
                {
                    lines[i] = "#show";
                }
                // @{end show} → (no-op, just remove the line)
                else if (trimmedLower == "@{end show}" || trimmedLower == "@{end show")
                {
                    lines[i] = "";
                }
            }

            return string.Join("\n", lines);
        }

        private static string PreprocessConfig(string code)
        {
            // Quick check
            if (!code.Contains("@{config", StringComparison.OrdinalIgnoreCase))
                return code;

            var lines = code.Split(new[] { '\r', '\n' }, StringSplitOptions.None);
            string commentChar = null;
            string headingChar = null;
            bool configFound = false;
            int configLineIdx = -1;

            // Find @{config ...} line (must be in first 5 non-empty lines)
            int nonEmptyCount = 0;
            for (int i = 0; i < lines.Length && nonEmptyCount < 5; i++)
            {
                var trimmed = lines[i].Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;
                nonEmptyCount++;

                if (trimmed.StartsWith("@{config", StringComparison.OrdinalIgnoreCase))
                {
                    configLineIdx = i;
                    configFound = true;

                    // Parse options: @{config comment:% heading:! rad}
                    var inner = trimmed;
                    if (inner.EndsWith("}"))
                        inner = inner.Substring(0, inner.Length - 1);
                    inner = inner.Substring("@{config".Length).Trim();

                    var options = inner.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var opt in options)
                    {
                        if (opt.StartsWith("comment:", StringComparison.OrdinalIgnoreCase))
                            commentChar = opt.Substring("comment:".Length);
                        else if (opt.StartsWith("heading:", StringComparison.OrdinalIgnoreCase))
                            headingChar = opt.Substring("heading:".Length);
                        else if (opt.StartsWith("text:", StringComparison.OrdinalIgnoreCase))
                            commentChar = opt.Substring("text:".Length); // alias
                    }
                    break;
                }
            }

            if (!configFound || commentChar == null)
                return code;

            // Derive heading char: if comment is %, heading is %% by default
            if (headingChar == null)
                headingChar = commentChar + commentChar;

            // Remove the @{config} line
            lines[configLineIdx] = "";

            // Preprocess each line
            bool insideBlock = false; // track @{...} blocks to skip them
            for (int i = 0; i < lines.Length; i++)
            {
                if (i == configLineIdx) continue;

                var line = lines[i];
                var trimmed = line.TrimStart();

                // Track @{...} blocks - don't modify content inside them
                if (trimmed.StartsWith("@{") && !trimmed.StartsWith("@{end", StringComparison.OrdinalIgnoreCase)
                    && !trimmed.StartsWith("@{config", StringComparison.OrdinalIgnoreCase))
                {
                    insideBlock = true;
                    continue;
                }
                if (trimmed.StartsWith("@{end", StringComparison.OrdinalIgnoreCase))
                {
                    insideBlock = false;
                    continue;
                }
                if (insideBlock) continue;

                // Check for heading: line starts with headingChar (e.g., %%)
                if (headingChar.Length > 0 && trimmed.StartsWith(headingChar))
                {
                    var indent = line.Substring(0, line.Length - line.TrimStart().Length);
                    var rest = trimmed.Substring(headingChar.Length);
                    lines[i] = indent + "\"" + rest;
                    continue;
                }

                // Check for comment/text: line starts with commentChar (e.g., %)
                if (commentChar.Length > 0 && trimmed.StartsWith(commentChar))
                {
                    var indent = line.Substring(0, line.Length - line.TrimStart().Length);
                    var rest = trimmed.Substring(commentChar.Length);
                    lines[i] = indent + "'" + rest;
                    continue;
                }

                // Expression line: replace ' with prime symbol ′ (U+2032) so tokenizer ignores it
                // This allows f'(x), y', etc. in expressions
                if (line.Contains('\''))
                {
                    lines[i] = line.Replace('\'', '\u2032'); // ′ prime
                }
            }

            return string.Join("\n", lines);
        }

        /// <summary>
        /// Preprocessor: Converts @(tag content) syntax to HTML tags.
        /// This allows users to write markup without using angle brackets.
        /// Examples:
        ///   @(h1 Title)         → <h1>Title</h1>
        ///   @(h2 Subtitle)      → <h2>Subtitle</h2>
        ///   @(h3 Section)       → <h3>Section</h3>
        ///   @(p Normal text)    → <p>Normal text</p>
        ///   @(b bold text)      → <b>bold text</b>
        ///   @(i italic text)    → <i>italic text</i>
        ///   @(hr)               → <hr/>
        ///   @(br)               → <br/>
        ///   @(color:red Alert!) → <span style="color:red">Alert!</span>
        ///   @(bg:yellow Text)   → <span style="background:yellow">Text</span>
        ///   @(img url)          → <img src="url"/>
        ///   @(a url Text)       → <a href="url">Text</a>
        /// </summary>
        private static string PreprocessAtSyntax(string code)
        {
            if (!code.Contains("@("))
                return code;

            var sb = new StringBuilder(code.Length);
            int i = 0;
            while (i < code.Length)
            {
                if (i < code.Length - 2 && code[i] == '@' && code[i + 1] == '(')
                {
                    // Find matching closing paren
                    int depth = 1;
                    int start = i + 2;
                    int j = start;
                    while (j < code.Length && depth > 0)
                    {
                        if (code[j] == '(') depth++;
                        else if (code[j] == ')') depth--;
                        if (depth > 0) j++;
                    }

                    if (depth == 0)
                    {
                        var inner = code.Substring(start, j - start).Trim();
                        sb.Append(ConvertAtTag(inner));
                        i = j + 1;
                    }
                    else
                    {
                        sb.Append(code[i]);
                        i++;
                    }
                }
                else
                {
                    sb.Append(code[i]);
                    i++;
                }
            }
            return sb.ToString();
        }

        private static string ConvertAtTag(string inner)
        {
            if (string.IsNullOrWhiteSpace(inner))
                return string.Empty;

            // Self-closing tags
            if (inner.Equals("hr", StringComparison.OrdinalIgnoreCase))
                return "<hr/>";
            if (inner.Equals("br", StringComparison.OrdinalIgnoreCase))
                return "<br/>";

            // Split into tag and content
            int spaceIdx = inner.IndexOf(' ');
            string tag, content;

            if (spaceIdx == -1)
            {
                tag = inner;
                content = string.Empty;
            }
            else
            {
                tag = inner.Substring(0, spaceIdx);
                content = inner.Substring(spaceIdx + 1).Trim();
            }

            var tagLower = tag.ToLowerInvariant();

            // Standard block/inline tags
            switch (tagLower)
            {
                case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
                case "p": case "b": case "i": case "u": case "s":
                case "em": case "strong": case "sub": case "sup":
                case "pre": case "code": case "blockquote":
                case "div": case "span":
                    return $"<{tagLower}>{content}</{tagLower}>";

                case "img":
                    return $"<img src=\"{content}\"/>";

                case "a":
                    // @(a url Text) → <a href="url">Text</a>
                    var aSpace = content.IndexOf(' ');
                    if (aSpace > 0)
                        return $"<a href=\"{content.Substring(0, aSpace)}\">{content.Substring(aSpace + 1)}</a>";
                    return $"<a href=\"{content}\">{content}</a>";
            }

            // Color: @(color:red text) → <span style="color:red">text</span>
            if (tagLower.StartsWith("color:"))
            {
                var color = tag.Substring(6);
                return $"<span style=\"color:{color}\">{content}</span>";
            }

            // Background: @(bg:yellow text) → <span style="background:yellow">text</span>
            if (tagLower.StartsWith("bg:"))
            {
                var bg = tag.Substring(3);
                return $"<span style=\"background:{bg}\">{content}</span>";
            }

            // Font size: @(size:20px text) → <span style="font-size:20px">text</span>
            if (tagLower.StartsWith("size:"))
            {
                var size = tag.Substring(5);
                return $"<span style=\"font-size:{size}\">{content}</span>";
            }

            // Fallback: unknown tag, wrap in div with class
            if (!string.IsNullOrEmpty(content))
                return $"<div class=\"{tagLower}\">{content}</div>";

            return $"<div class=\"{tagLower}\"></div>";
        }
    }
}
