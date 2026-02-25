using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Hekatan.Common.MultLangCode;
using Hekatan.Core;

namespace Hekatan.Common
{
    /// <summary>
    /// Central processor that orchestrates all Hekatan processing steps.
    /// Uses GlobalParser to decide: External Code OR Hekatan (NEVER both)
    /// </summary>
    public class HekatanProcessor
    {
        private readonly MacroParser _macroParser;
        private readonly GlobalParser _globalParser;
        private readonly ProcessingConfig _config;
        private ExecutionTracker? _tracker;

        public HekatanProcessor(Func<string, Queue<string>, string> includeHandler, ExecutionTracker? tracker = null)
        {
            _config = LoadProcessingConfig();
            _tracker = tracker;

            // Initialize GlobalParser - decides between external code or Hekatan
            _globalParser = new GlobalParser(_tracker);

            // Initialize MacroParser with external languages from config
            var externalLanguages = GetExternalLanguagesFromConfig();

            // DEBUG: Write to file for visibility
            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] HekatanProcessor initialized with {externalLanguages.Count} languages: {string.Join(", ", externalLanguages)}\n");
            }
            catch { }

            _macroParser = new MacroParser
            {
                Include = includeHandler,
                ExternalLanguages = externalLanguages
            };
        }

        /// <summary>
        /// Process code through the configured pipeline
        /// </summary>
        /// <param name="code">Code to process</param>
        /// <param name="addLineNumbers">Whether to add line numbers</param>
        /// <param name="progressCallback">Optional callback for progress updates during external code execution</param>
        public ProcessingResult ProcessCode(string code, bool addLineNumbers = true, Action<string>? progressCallback = null)
        {
            var result = new ProcessingResult
            {
                OriginalCode = code,
                ProcessedCode = code
            };

            try
            {
                // STEP -1: Detect complete HTML5 document - skip ALL processing
                // A complete HTML5 document (<!DOCTYPE html>...<html>...</html>) is passed
                // through directly without any macro/multilang/expression parsing
                var trimmed = code.AsSpan().Trim();
                if (trimmed.Length > 14 &&
                    (trimmed.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) ||
                     trimmed.StartsWith("<html", StringComparison.OrdinalIgnoreCase)) &&
                    trimmed.EndsWith("</html>", StringComparison.OrdinalIgnoreCase))
                {
                    result.ProcessedCode = code;
                    result.IsCompleteHtml5 = true;
                    result.Success = true;
                    return result;
                }

                // STEP 0: Process expression parser blocks (LaTeX, Mathcad, Python, Symbolic)
                // This translates external syntax to Hekatan syntax BEFORE any other processing
                var multilangProcessor = new MultLangProcessor();
                result.ProcessedCode = multilangProcessor.ProcessExpressionBlocks(code);

                // GLOBAL PARSER DECISION: External code OR Hekatan (NEVER both)
                bool hasExternalCode;
                result.ProcessedCode = _globalParser.Process(result.ProcessedCode, out hasExternalCode, progressCallback);
                result.MultilangProcessed = hasExternalCode;

                try
                {
                    var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss}] GlobalParser: HasExternalCode={hasExternalCode}\n");
                    if (hasExternalCode)
                    {
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] PATH: External Code - ExpressionParser will be SKIPPED\n");
                    }
                    else
                    {
                        System.IO.File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] PATH: Hekatan - ExpressionParser will be USED\n");
                    }
                }
                catch { }

                // Step 2: Macro processing (if enabled and NO external code)
                // Macros are part of Hekatan, so skip if external code was processed
                if (_config.MacrosEnabled && !hasExternalCode)
                {
                    var hasMacroErrors = _macroParser.Parse(
                        result.ProcessedCode,
                        out var macroOutput,
                        null,
                        0,
                        addLineNumbers
                    );

                    result.ProcessedCode = macroOutput;
                    result.MacroProcessed = true;
                    result.HasMacroErrors = hasMacroErrors;
                }

                result.Success = true;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorMessage = ex.Message;
            }

            return result;
        }

        /// <summary>
        /// Process code asynchronously through the configured pipeline
        /// Returns results progressively for better UI responsiveness
        /// </summary>
        /// <param name="code">Code to process</param>
        /// <param name="addLineNumbers">Whether to add line numbers</param>
        /// <param name="progressCallback">Optional callback for progress updates</param>
        /// <param name="partialResultCallback">Optional callback for partial HTML results as they become available</param>
        public async Task<ProcessingResult> ProcessCodeAsync(
            string code,
            bool addLineNumbers = true,
            Action<string>? progressCallback = null,
            Action<string>? partialResultCallback = null)
        {
            var result = new ProcessingResult
            {
                OriginalCode = code,
                ProcessedCode = code
            };

            try
            {
                // STEP -1: Detect complete HTML5 document - skip ALL processing
                var trimmed = code.AsSpan().Trim();
                if (trimmed.Length > 14 &&
                    (trimmed.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) ||
                     trimmed.StartsWith("<html", StringComparison.OrdinalIgnoreCase)) &&
                    trimmed.EndsWith("</html>", StringComparison.OrdinalIgnoreCase))
                {
                    result.ProcessedCode = code;
                    result.IsCompleteHtml5 = true;
                    result.Success = true;
                    return result;
                }

                // GLOBAL PARSER DECISION: External code OR Hekatan (NEVER both)
                // Run GlobalParser asynchronously to avoid blocking UI
                var (processedCode, hasExternalCode) = await Task.Run(() =>
                {
                    bool hasExtCode;
                    var processed = _globalParser.Process(code, out hasExtCode, progressCallback, partialResultCallback);
                    return (processed, hasExtCode);
                });

                result.ProcessedCode = processedCode;
                result.MultilangProcessed = hasExternalCode;

                try
                {
                    var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss}] GlobalParser ASYNC: HasExternalCode={hasExternalCode}\n");
                }
                catch { }

                // Step 2: Macro processing (if enabled and NO external code)
                if (_config.MacrosEnabled && !hasExternalCode)
                {
                    var (macroOutput, hasMacroErrors) = await Task.Run(() =>
                    {
                        string output;
                        var hasErrors = _macroParser.Parse(
                            result.ProcessedCode,
                            out output,
                            null,
                            0,
                            addLineNumbers
                        );
                        return (output, hasErrors);
                    });

                    result.ProcessedCode = macroOutput;
                    result.MacroProcessed = true;
                    result.HasMacroErrors = hasMacroErrors;
                }

                result.Success = true;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorMessage = ex.Message;
            }

            return result;
        }

        /// <summary>
        /// Gets exported variables from external code execution
        /// </summary>
        public IReadOnlyDictionary<string, object> GetExportedVariables()
        {
            return _globalParser?.ExportedVariables ??
                   new Dictionary<string, object>();
        }

        /// <summary>
        /// Direct access to MacroParser for legacy code (use ProcessCode instead when possible)
        /// </summary>
        public MacroParser MacroParser => _macroParser;

        /// <summary>
        /// Direct access to GlobalParser for legacy code
        /// </summary>
        public GlobalParser GlobalParser => _globalParser;

        private ProcessingConfig LoadProcessingConfig()
        {
            // For now, use hardcoded defaults
            // TODO: Read from HekatanConfig.json in the future
            return new ProcessingConfig
            {
                MultilangEnabled = true,
                MacrosEnabled = true,
                ProcessingOrder = new[] { "multilang", "macros", "expression" }
            };
        }

        private HashSet<string> GetExternalLanguagesFromConfig()
        {
            try
            {
                var config = MultLangManager.Config;
                if (config?.Languages != null)
                {
                    var languages = new HashSet<string>(config.Languages.Keys, StringComparer.OrdinalIgnoreCase);
                    System.Diagnostics.Debug.WriteLine($"HekatanProcessor: Loaded {languages.Count} external languages: {string.Join(", ", languages)}");
                    return languages;
                }
                else
                {
                    System.Diagnostics.Debug.WriteLine("HekatanProcessor: MultLangManager.Config is null or has no Languages");
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"HekatanProcessor: Error loading external languages: {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"HekatanProcessor: Stack trace: {ex.StackTrace}");
            }

            System.Diagnostics.Debug.WriteLine("HekatanProcessor: Returning empty HashSet for external languages");
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Configuration for the processing pipeline
        /// </summary>
        private class ProcessingConfig
        {
            public bool MultilangEnabled { get; set; }
            public bool MacrosEnabled { get; set; }
            public string[] ProcessingOrder { get; set; }
        }
    }

    /// <summary>
    /// Result of HekatanProcessor.ProcessCode()
    /// </summary>
    public class ProcessingResult
    {
        public bool Success { get; set; }
        public string OriginalCode { get; set; }
        public string ProcessedCode { get; set; }
        public bool MultilangProcessed { get; set; }
        public bool MacroProcessed { get; set; }
        public bool HasMacroErrors { get; set; }
        public bool IsCompleteHtml5 { get; set; }
        public string ErrorMessage { get; set; }
    }
}
