using System;
using System.Text;
using Hekatan.Core;

namespace Hekatan.Common
{
    /// <summary>
    /// Converts C-style operators to Unicode mathematical symbols
    /// Unified from Hekatan.Wpf (complete version with && and ||)
    /// </summary>
    public static class OperatorConverter
    {
        private static readonly StringBuilder _stringBuilder = new();

        /// <summary>
        /// Replaces C-style operators with Unicode equivalents:
        /// == → ≡ (equivalent)
        /// != → ≠ (not equal)
        /// >= → ≥ (greater or equal)
        /// &lt;= → ≤ (less or equal)
        /// %% → ⦼ (modulo)
        /// &amp;&amp; → ∧ (logical and)
        /// || → ∨ (logical or)
        /// </summary>
        /// <param name="s">Input text span</param>
        /// <returns>Text with Unicode operators</returns>
        public static string ReplaceCStyleOperators(ReadOnlySpan<char> s)
        {
            if (s.IsEmpty)
                return string.Empty;

            _stringBuilder.Clear();
            var commentEnumerator = s.EnumerateComments();
            foreach (var item in commentEnumerator)
            {
                if (!item.IsEmpty && item[0] != '"' && item[0] != '\'')
                {
                    foreach (var c in item)
                    {
                        if (c == '=')
                        {
                            var n = _stringBuilder.Length - 1;
                            if (n < 0)
                            {
                                _stringBuilder.Append(c);
                                break;
                            }
                            switch (_stringBuilder[n])
                            {
                                case '=':
                                    _stringBuilder[n] = '≡';
                                    break;
                                case '!':
                                    _stringBuilder[n] = '≠';
                                    break;
                                case '>':
                                    _stringBuilder[n] = '≥';
                                    break;
                                case '<':
                                    _stringBuilder[n] = '≤';
                                    break;
                                default:
                                    _stringBuilder.Append(c);
                                    break;
                            }
                        }
                        else if (c == '%')
                        {
                            var n = _stringBuilder.Length - 1;
                            if (n >= 0 && _stringBuilder[n] == '%')
                                _stringBuilder[n] = '⦼';
                            else
                                _stringBuilder.Append(c);
                        }
                        else if (c == '&')
                        {
                            var n = _stringBuilder.Length - 1;
                            if (n >= 0 && _stringBuilder[n] == '&')
                                _stringBuilder[n] = '∧';
                            else
                                _stringBuilder.Append(c);
                        }
                        else if (c == '|')
                        {
                            var n = _stringBuilder.Length - 1;
                            if (n >= 0 && _stringBuilder[n] == '|')
                                _stringBuilder[n] = '∨';
                            else
                                _stringBuilder.Append(c);
                        }
                        else
                            _stringBuilder.Append(c);
                    }
                }
                else
                    _stringBuilder.Append(item);
            }
            return _stringBuilder.ToString();
        }
    }
}
