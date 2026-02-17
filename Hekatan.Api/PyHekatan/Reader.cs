/*
 * DEPRECATED: This file has been moved to Hekatan.Common.HekatanReader
 * Kept for reference only. Use Hekatan.Common.HekatanReader instead.
 *
 * Original code commented below:
 */

/*
using Hekatan.Core;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace Hekatan
{
    internal static class Reader
    {
        private static readonly StringBuilder _stringBuilder = new();
        internal static string Read(string fileName)
        {
            var inputLines = ReadLines(fileName);
            var outputLines = new List<string>();
            var hasForm = false;
            foreach (var line in inputLines)
            {
                ReadOnlySpan<char> s;
                if (line.Contains('\v'))
                {
                    hasForm = true;
                    var n = line.IndexOf('\v');
                    if (n == 0)
                    {
                        SetInputFieldsFromFile(line[1..].EnumerateSplits('\t'), outputLines);
                        break;
                    }
                    else
                    {
                        SetInputFieldsFromFile(line[(n + 1)..].EnumerateSplits('\t'), outputLines);
                        s = line[..n];
                    }
                }
                else
                {
                    s = ReplaceCStyleRelationalOperators(line.TrimStart('\t'));
                    if (!hasForm)
                        hasForm = MacroParser.HasInputFields(s);
                }
                outputLines.Add(s.ToString());
            }
            return string.Join(Environment.NewLine, outputLines);
        }

        private static SpanLineEnumerator ReadLines(string fileName)
        {
            var lines = new SpanLineEnumerator();
            if (Path.GetExtension(fileName).Equals(".cpdz", StringComparison.OrdinalIgnoreCase))
            {
                var f = new FileInfo(fileName)
                {
                    IsReadOnly = false
                };
                using var fs = f.OpenRead();
                lines = Zip.Decompress(fs);
            }
            else
            {
                return File.ReadAllText(fileName).EnumerateLines();
            }
            return lines;
        }

        private static string ReplaceCStyleRelationalOperators(ReadOnlySpan<char> s)
        {
            // ... code continues
        }

        // ... rest of the code
    }
}
*/
