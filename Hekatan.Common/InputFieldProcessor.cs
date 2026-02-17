using System;
using System.Collections.Generic;
using System.Text;
using Hekatan.Core;

namespace Hekatan.Common
{
    /// <summary>
    /// Processes input fields from Hekatan files
    /// Handles form data separated by \v character
    /// </summary>
    public static class InputFieldProcessor
    {
        private static readonly StringBuilder _stringBuilder = new();

        /// <summary>
        /// Sets input field values from file data into the output lines
        /// </summary>
        /// <param name="fields">Enumerator of field values separated by tabs</param>
        /// <param name="lines">List of lines to process</param>
        public static void SetInputFieldsFromFile(SplitEnumerator fields, List<string> lines)
        {
            if (fields.IsEmpty)
                return;

            _stringBuilder.Clear();
            var values = new Queue<string>();
            foreach (var s in fields)
                values.Enqueue(s.ToString());

            for (int i = 0, n = lines.Count; i < n; ++i)
            {
                if (MacroParser.SetLineInputFields(lines[i], _stringBuilder, values, false))
                    lines[i] = _stringBuilder.ToString();

                _stringBuilder.Clear();
                if (values.Count == 0)
                    return;
            }
        }

        /// <summary>
        /// Gets fields from a span, merging with existing fields if needed
        /// </summary>
        /// <param name="s">Span containing field data</param>
        /// <param name="fields">Existing fields queue (can be null)</param>
        /// <returns>Queue of field values</returns>
        public static Queue<string> GetFields(ReadOnlySpan<char> s, Queue<string> fields)
        {
            if (fields is null)
                return null;

            if (fields.Count > 0)
            {
                if (!s.IsEmpty)
                {
                    var getFields = MacroParser.GetFields(s, '\t');
                    if (fields.Count < getFields.Count)
                    {
                        for (int i = 0; i < fields.Count; ++i)
                            getFields.Dequeue();

                        while (getFields.Count > 0)
                            fields.Enqueue(getFields.Dequeue());
                    }
                }
                return fields;
            }
            else if (!s.IsEmpty)
                return MacroParser.GetFields(s, '\t');
            else
                return null;
        }
    }
}
