using System;
using System.Collections.Generic;
using System.Text;
using Hekatan.Common.MultLangCode;

namespace Hekatan.Common
{
    /// <summary>
    /// Shared parser for @{columns N}...@{end columns} blocks.
    /// Extracts the structure (column count, content per column, language blocks).
    /// Both CLI (renders to HTML) and WPF (renders to MathElements) use this.
    /// </summary>
    public static class ColumnsParser
    {
        /// <summary>
        /// Represents a parsed piece of content within a column.
        /// </summary>
        public class ColumnSegment
        {
            /// <summary>
            /// The type of content in this segment.
            /// </summary>
            public SegmentType Type { get; set; }

            /// <summary>
            /// The raw text content of the segment.
            /// </summary>
            public string Content { get; set; }

            /// <summary>
            /// Language name for ExternalBlock segments (e.g., "python", "cpp", "html").
            /// </summary>
            public string Language { get; set; }
        }

        /// <summary>
        /// Types of content that can appear inside a column.
        /// </summary>
        public enum SegmentType
        {
            /// <summary>Plain text/code/HTML lines</summary>
            PlainText,
            /// <summary>An @{language}...@{end language} block</summary>
            ExternalBlock
        }

        /// <summary>
        /// Result of parsing an @{columns} block.
        /// </summary>
        public class ColumnsResult
        {
            /// <summary>Number of columns (2-4).</summary>
            public int ColumnCount { get; set; }

            /// <summary>
            /// Content for each column, as a list of segments.
            /// Index = column number (0-based).
            /// </summary>
            public List<List<ColumnSegment>> Columns { get; set; }

            /// <summary>
            /// Languages detected in the content (for CSS injection).
            /// </summary>
            public HashSet<string> DetectedLanguages { get; set; }
        }

        /// <summary>
        /// Parse the column count from a directive like "@{columns 4}" or "#columns 3".
        /// </summary>
        public static int ParseColumnCount(string directive)
        {
            int numColumns = 2;
            var text = directive.Trim().TrimStart('@', '{').TrimEnd('}');
            var parts = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2 && int.TryParse(parts[1], out int n) && n >= 2 && n <= 4)
            {
                numColumns = n;
            }
            return numColumns;
        }

        /// <summary>
        /// Parse an @{columns} block into structured data.
        /// Handles: column separators (@{column}/---), nested @{language} blocks, plain text.
        /// </summary>
        /// <param name="directive">The opening directive (e.g., "@{columns 4}")</param>
        /// <param name="content">The content between @{columns} and @{end columns}</param>
        /// <returns>Parsed columns result</returns>
        public static ColumnsResult Parse(string directive, string content)
        {
            var numColumns = ParseColumnCount(directive);
            var result = new ColumnsResult
            {
                ColumnCount = numColumns,
                Columns = new List<List<ColumnSegment>>(),
                DetectedLanguages = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            };

            // Split content into raw column strings by separator
            var rawColumns = SplitByColumnSeparators(content, numColumns);

            // Parse each raw column into segments
            foreach (var rawCol in rawColumns)
            {
                var segments = ParseColumnSegments(rawCol.Trim(), result.DetectedLanguages);
                result.Columns.Add(segments);
            }

            // Pad to numColumns if fewer were found
            while (result.Columns.Count < numColumns)
            {
                result.Columns.Add(new List<ColumnSegment>());
            }

            return result;
        }

        /// <summary>
        /// Split content by @{column} or --- separators.
        /// If no separators found, auto-distributes @{language} blocks across columns.
        /// </summary>
        private static List<string> SplitByColumnSeparators(string content, int numColumns)
        {
            var columnContents = new List<string>();
            var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.None);
            var currentColumn = new StringBuilder();
            bool foundSeparator = false;

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (trimmed == "---" || trimmed.Equals("@{column}", StringComparison.OrdinalIgnoreCase))
                {
                    columnContents.Add(currentColumn.ToString());
                    currentColumn.Clear();
                    foundSeparator = true;
                }
                else
                {
                    currentColumn.AppendLine(line);
                }
            }

            if (currentColumn.Length > 0 || foundSeparator)
            {
                columnContents.Add(currentColumn.ToString());
            }

            // If no separators found, try auto-distribution of code blocks
            if (columnContents.Count <= 1 && !foundSeparator)
            {
                var autoDistributed = TryAutoDistribute(content, numColumns);
                if (autoDistributed != null)
                    return autoDistributed;
            }

            return columnContents;
        }

        /// <summary>
        /// Auto-distribute @{language} blocks across N columns when no separators are present.
        /// </summary>
        private static List<string> TryAutoDistribute(string content, int numColumns)
        {
            var codeBlocks = MultLangManager.ExtractCodeBlocks(content);
            var allBlocks = new List<(int StartLine, string Language, string Code, string Directive)>();

            foreach (var (lang, blocks) in codeBlocks)
            {
                foreach (var block in blocks)
                {
                    allBlocks.Add((block.StartLine, block.Language, block.Code, block.StartDirective));
                }
            }

            allBlocks.Sort((a, b) => a.StartLine.CompareTo(b.StartLine));

            if (allBlocks.Count == 0)
                return null;

            var columnContents = new List<string>();
            for (int i = 0; i < numColumns; i++)
                columnContents.Add("");

            for (int i = 0; i < allBlocks.Count; i++)
            {
                var block = allBlocks[i];
                int columnIndex = i % numColumns;
                var blockContent = $"{block.Directive}\n{block.Code}\n@{{end {block.Language}}}";
                columnContents[columnIndex] += blockContent + "\n\n";
            }

            return columnContents;
        }

        /// <summary>
        /// Parse a single column's raw content into typed segments.
        /// Detects @{language}...@{end language} blocks vs. plain text.
        /// </summary>
        private static List<ColumnSegment> ParseColumnSegments(string content, HashSet<string> detectedLanguages)
        {
            var segments = new List<ColumnSegment>();
            if (string.IsNullOrWhiteSpace(content))
                return segments;

            var lines = content.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            var plainBuffer = new StringBuilder();
            int i = 0;

            while (i < lines.Length)
            {
                var trimmed = lines[i].Trim();

                // Detect @{language} block start (exclude @{end...}, @{calcpad}, @{column...})
                if (trimmed.StartsWith("@{") &&
                    !trimmed.StartsWith("@{end") &&
                    !trimmed.StartsWith("@{calcpad") &&
                    !trimmed.StartsWith("@{column") &&
                    !trimmed.StartsWith("@{columns"))
                {
                    // Flush any accumulated plain text
                    FlushPlainBuffer(plainBuffer, segments);

                    // Extract language name
                    int endBrace = trimmed.IndexOf('}');
                    if (endBrace > 2)
                    {
                        string language = trimmed.Substring(2, endBrace - 2).Trim();
                        detectedLanguages.Add(language);

                        // For end-tag matching, use only the base language name (first word)
                        // e.g., "abstract english" → "abstract", "reference REFERENCES" → "reference"
                        string baseLang = language.Split(' ')[0];

                        var codeBuilder = new StringBuilder();
                        i++;

                        // Collect lines until @{end language}
                        while (i < lines.Length)
                        {
                            var blockTrimmed = lines[i].Trim();
                            if (blockTrimmed.StartsWith($"@{{end {baseLang}}}") ||
                                blockTrimmed.StartsWith($"@{{end{baseLang}}}") ||
                                blockTrimmed == $"@{{/{baseLang}}}" ||
                                blockTrimmed.StartsWith($"@{{end {language}}}") ||
                                blockTrimmed.StartsWith($"@{{end{language}}}") ||
                                blockTrimmed == $"@{{/{language}}}" ||
                                blockTrimmed == "@{end}")
                            {
                                break;
                            }
                            codeBuilder.AppendLine(lines[i]);
                            i++;
                        }

                        segments.Add(new ColumnSegment
                        {
                            Type = SegmentType.ExternalBlock,
                            Language = language,
                            Content = codeBuilder.ToString().TrimEnd()
                        });

                        i++; // skip @{end}
                        continue;
                    }
                }

                // Detect CSS class references for language detection
                if (trimmed.Contains("code-cp") || trimmed.Contains("class=\"eq\"") || trimmed.Contains("class='eq'"))
                    detectedLanguages.Add("calcpad");
                if (trimmed.Contains("code-py"))
                    detectedLanguages.Add("python");
                if (trimmed.Contains("code-m\"") || trimmed.Contains("code-m "))
                    detectedLanguages.Add("octave");
                if (trimmed.Contains("code-cpp"))
                    detectedLanguages.Add("cpp");

                // Regular line - accumulate as plain text
                plainBuffer.AppendLine(lines[i]);
                i++;
            }

            // Flush remaining plain text
            FlushPlainBuffer(plainBuffer, segments);

            return segments;
        }

        private static void FlushPlainBuffer(StringBuilder buffer, List<ColumnSegment> segments)
        {
            if (buffer.Length > 0)
            {
                var text = buffer.ToString().TrimEnd();
                if (!string.IsNullOrWhiteSpace(text))
                {
                    segments.Add(new ColumnSegment
                    {
                        Type = SegmentType.PlainText,
                        Content = text
                    });
                }
                buffer.Clear();
            }
        }
    }
}
