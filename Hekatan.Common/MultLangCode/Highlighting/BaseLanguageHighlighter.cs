using System;
using System.Collections.Generic;
using System.Text;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// Base class for language-specific syntax highlighters
    /// Provides tokenization that can be used by both WPF and CLI
    /// </summary>
    public abstract class BaseLanguageHighlighter
    {
        protected LanguageHighlightInfo Info { get; }

        protected BaseLanguageHighlighter(LanguageHighlightInfo info)
        {
            Info = info;
        }

        /// <summary>
        /// Tokenizes a line of code for syntax highlighting
        /// </summary>
        public virtual List<HighlightToken> Tokenize(string line)
        {
            var tokens = new List<HighlightToken>();
            if (string.IsNullOrEmpty(line))
                return tokens;

            var i = 0;
            var len = line.Length;
            var builder = new StringBuilder();

            while (i < len)
            {
                var c = line[i];

                // Check for comments
                if (!string.IsNullOrEmpty(Info.CommentPrefix) &&
                    line.AsSpan(i).StartsWith(Info.CommentPrefix))
                {
                    FlushToken(tokens, builder, TokenType.Default, i);
                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..],
                        Type = TokenType.Comment,
                        StartIndex = i,
                        Length = len - i
                    });
                    break;
                }

                // Check for block comment start
                if (!string.IsNullOrEmpty(Info.BlockCommentStart) &&
                    line.AsSpan(i).StartsWith(Info.BlockCommentStart))
                {
                    FlushToken(tokens, builder, TokenType.Default, i);
                    var endIdx = line.IndexOf(Info.BlockCommentEnd, i + Info.BlockCommentStart.Length);
                    if (endIdx >= 0)
                    {
                        endIdx += Info.BlockCommentEnd.Length;
                        tokens.Add(new HighlightToken
                        {
                            Text = line[i..endIdx],
                            Type = TokenType.Comment,
                            StartIndex = i,
                            Length = endIdx - i
                        });
                        i = endIdx;
                        continue;
                    }
                    else
                    {
                        tokens.Add(new HighlightToken
                        {
                            Text = line[i..],
                            Type = TokenType.Comment,
                            StartIndex = i,
                            Length = len - i
                        });
                        break;
                    }
                }

                // Check for strings
                if (c == Info.StringDelimiter || c == Info.AltStringDelimiter)
                {
                    FlushToken(tokens, builder, TokenType.Default, i);
                    var stringEnd = FindStringEnd(line, i, c);
                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..stringEnd],
                        Type = TokenType.String,
                        StartIndex = i,
                        Length = stringEnd - i
                    });
                    i = stringEnd;
                    continue;
                }

                // Check for numbers
                if (char.IsDigit(c) || (c == '.' && i + 1 < len && char.IsDigit(line[i + 1])))
                {
                    FlushToken(tokens, builder, TokenType.Default, i);
                    var numEnd = FindNumberEnd(line, i);
                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..numEnd],
                        Type = TokenType.Number,
                        StartIndex = i,
                        Length = numEnd - i
                    });
                    i = numEnd;
                    continue;
                }

                // Check for operators
                if (Info.Operators.Contains(c))
                {
                    FlushToken(tokens, builder, TokenType.Default, i);
                    tokens.Add(new HighlightToken
                    {
                        Text = c.ToString(),
                        Type = TokenType.Operator,
                        StartIndex = i,
                        Length = 1
                    });
                    i++;
                    continue;
                }

                // Check for brackets
                if (c == '(' || c == ')' || c == '[' || c == ']' || c == '{' || c == '}')
                {
                    FlushToken(tokens, builder, TokenType.Default, i);
                    tokens.Add(new HighlightToken
                    {
                        Text = c.ToString(),
                        Type = TokenType.Bracket,
                        StartIndex = i,
                        Length = 1
                    });
                    i++;
                    continue;
                }

                // Check for identifiers (keywords, builtins, variables)
                if (char.IsLetter(c) || c == '_')
                {
                    FlushToken(tokens, builder, TokenType.Default, i);
                    var idEnd = FindIdentifierEnd(line, i);
                    var identifier = line[i..idEnd];
                    var tokenType = ClassifyIdentifier(identifier, line, idEnd);
                    tokens.Add(new HighlightToken
                    {
                        Text = identifier,
                        Type = tokenType,
                        StartIndex = i,
                        Length = idEnd - i
                    });
                    i = idEnd;
                    continue;
                }

                // Default: add to current token
                builder.Append(c);
                i++;
            }

            FlushToken(tokens, builder, TokenType.Default, i);
            return tokens;
        }

        /// <summary>
        /// Classifies an identifier as keyword, builtin, function, or variable
        /// </summary>
        protected virtual TokenType ClassifyIdentifier(string identifier, string line, int endIndex)
        {
            if (Info.Keywords.Contains(identifier))
                return TokenType.Keyword;

            if (Info.Builtins.Contains(identifier))
                return TokenType.Builtin;

            // Check if followed by '(' to determine if it's a function
            var nextNonSpace = FindNextNonWhitespace(line, endIndex);
            if (nextNonSpace < line.Length && line[nextNonSpace] == '(')
                return TokenType.Function;

            return TokenType.Variable;
        }

        /// <summary>
        /// Flushes the current token builder to the token list
        /// </summary>
        protected void FlushToken(List<HighlightToken> tokens, StringBuilder builder, TokenType type, int endIndex)
        {
            if (builder.Length > 0)
            {
                tokens.Add(new HighlightToken
                {
                    Text = builder.ToString(),
                    Type = type,
                    StartIndex = endIndex - builder.Length,
                    Length = builder.Length
                });
                builder.Clear();
            }
        }

        /// <summary>
        /// Finds the end of a string literal
        /// </summary>
        protected virtual int FindStringEnd(string line, int start, char delimiter)
        {
            var i = start + 1;
            while (i < line.Length)
            {
                if (line[i] == '\\' && i + 1 < line.Length)
                {
                    i += 2; // Skip escaped character
                    continue;
                }
                if (line[i] == delimiter)
                    return i + 1;
                i++;
            }
            return line.Length;
        }

        /// <summary>
        /// Finds the end of a number literal
        /// </summary>
        protected virtual int FindNumberEnd(string line, int start)
        {
            var i = start;
            var hasDecimal = false;
            var hasExponent = false;

            while (i < line.Length)
            {
                var c = line[i];
                if (char.IsDigit(c))
                {
                    i++;
                }
                else if (c == '.' && !hasDecimal && !hasExponent)
                {
                    hasDecimal = true;
                    i++;
                }
                else if ((c == 'e' || c == 'E') && !hasExponent)
                {
                    hasExponent = true;
                    i++;
                    if (i < line.Length && (line[i] == '+' || line[i] == '-'))
                        i++;
                }
                else if (c == '_')
                {
                    // Some languages allow underscores in numbers
                    i++;
                }
                else
                {
                    break;
                }
            }
            return i;
        }

        /// <summary>
        /// Finds the end of an identifier
        /// </summary>
        protected virtual int FindIdentifierEnd(string line, int start)
        {
            var i = start;
            while (i < line.Length && (char.IsLetterOrDigit(line[i]) || line[i] == '_'))
                i++;
            return i;
        }

        /// <summary>
        /// Finds the next non-whitespace character
        /// </summary>
        protected int FindNextNonWhitespace(string line, int start)
        {
            var i = start;
            while (i < line.Length && char.IsWhiteSpace(line[i]))
                i++;
            return i;
        }

        /// <summary>
        /// Gets the color for a token type
        /// </summary>
        public string GetColorForToken(TokenType type)
        {
            return type switch
            {
                TokenType.Keyword => Info.KeywordColor,
                TokenType.Builtin => Info.BuiltinColor,
                TokenType.String => Info.StringColor,
                TokenType.Comment => Info.CommentColor,
                TokenType.Number => Info.NumberColor,
                TokenType.Operator => Info.OperatorColor,
                TokenType.Variable => Info.VariableColor,
                TokenType.Function => Info.FunctionColor,
                TokenType.Error => Info.ErrorColor,
                _ => Info.DefaultColor
            };
        }
    }
}
