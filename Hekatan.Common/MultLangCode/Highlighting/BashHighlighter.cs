using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// Bash/Shell-specific syntax highlighter
    /// </summary>
    public class BashHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo BashInfo = new()
        {
            LanguageName = "Bash",
            KeywordColor = "#0000FF",      // Blue
            BuiltinColor = "#008080",      // Teal
            StringColor = "#A020F0",       // Purple
            CommentColor = "#808080",      // Gray
            NumberColor = "#000000",       // Black
            OperatorColor = "#000000",     // Black
            VariableColor = "#B8860B",     // DarkGoldenrod (for $variables)
            FunctionColor = "#000000",     // Black
            ErrorColor = "#FF0000",        // Red
            CommentPrefix = "#",
            StringDelimiter = '"',
            AltStringDelimiter = '\'',
            Keywords = new HashSet<string>
            {
                "if", "then", "else", "elif", "fi", "case", "esac", "for", "select",
                "while", "until", "do", "done", "in", "function", "time", "coproc",
                "return", "exit", "break", "continue", "declare", "typeset", "local",
                "export", "readonly", "unset", "shift", "eval", "exec", "trap",
                "source", "alias", "unalias", "set", "shopt"
            },
            Builtins = new HashSet<string>
            {
                // Bash builtins
                "echo", "printf", "read", "cd", "pwd", "pushd", "popd", "dirs",
                "let", "test", "[", "[[", "true", "false", ":", ".", "help",
                "type", "hash", "bind", "builtin", "caller", "command", "compgen",
                "complete", "compopt", "enable", "getopts", "jobs", "kill", "wait",
                "disown", "bg", "fg", "suspend", "logout", "history", "fc",
                "mapfile", "readarray", "ulimit", "umask",
                // Common external commands
                "ls", "cp", "mv", "rm", "mkdir", "rmdir", "touch", "cat", "head",
                "tail", "grep", "egrep", "fgrep", "sed", "awk", "cut", "sort",
                "uniq", "wc", "find", "xargs", "tar", "gzip", "gunzip", "zip",
                "unzip", "curl", "wget", "ssh", "scp", "rsync", "chmod", "chown",
                "chgrp", "ln", "df", "du", "mount", "umount", "ps", "top", "htop",
                "kill", "killall", "pkill", "pgrep", "nohup", "screen", "tmux",
                "date", "cal", "sleep", "which", "whereis", "man", "info", "clear",
                "tee", "diff", "patch", "basename", "dirname", "realpath", "env",
                "printenv", "id", "whoami", "hostname", "uname", "uptime", "free",
                "file", "stat", "md5sum", "sha256sum", "base64", "tr", "rev"
            },
            Operators = new HashSet<char>
            {
                '=', '+', '-', '*', '/', '%', '<', '>', '!', '&', '|', '^',
                ';', ':', '?', '#', '@', '~'
            }
        };

        public BashHighlighter() : base(BashInfo)
        {
        }

        /// <summary>
        /// Bash has special variable syntax ($var, ${var}, $(...), etc.)
        /// </summary>
        public override List<HighlightToken> Tokenize(string line)
        {
            var tokens = new List<HighlightToken>();
            if (string.IsNullOrEmpty(line))
                return tokens;

            var i = 0;
            var len = line.Length;

            // Check for shebang
            if (line.StartsWith("#!"))
            {
                tokens.Add(new HighlightToken
                {
                    Text = line,
                    Type = TokenType.Comment,
                    StartIndex = 0,
                    Length = len
                });
                return tokens;
            }

            while (i < len)
            {
                var c = line[i];

                // Check for comments (but not in strings)
                if (c == '#')
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

                // Check for double-quoted strings (variables expand inside)
                if (c == '"')
                {
                    var stringEnd = FindStringEnd(line, i, '"');
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

                // Check for single-quoted strings (literal, no expansion)
                if (c == '\'')
                {
                    var stringEnd = i + 1;
                    while (stringEnd < len && line[stringEnd] != '\'')
                        stringEnd++;
                    if (stringEnd < len)
                        stringEnd++;

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

                // Check for variables ($var, ${var}, $(...), etc.)
                if (c == '$')
                {
                    var varEnd = i + 1;
                    if (varEnd < len)
                    {
                        var nextChar = line[varEnd];
                        if (nextChar == '{')
                        {
                            // ${variable}
                            var braceEnd = line.IndexOf('}', varEnd + 1);
                            varEnd = braceEnd >= 0 ? braceEnd + 1 : len;
                        }
                        else if (nextChar == '(')
                        {
                            // $(...) command substitution
                            var parenCount = 1;
                            varEnd++;
                            while (varEnd < len && parenCount > 0)
                            {
                                if (line[varEnd] == '(') parenCount++;
                                else if (line[varEnd] == ')') parenCount--;
                                varEnd++;
                            }
                        }
                        else if (char.IsLetterOrDigit(nextChar) || nextChar == '_' ||
                                 nextChar == '@' || nextChar == '*' || nextChar == '#' ||
                                 nextChar == '?' || nextChar == '$' || nextChar == '!' ||
                                 nextChar == '-')
                        {
                            // $variable or special variables
                            while (varEnd < len && (char.IsLetterOrDigit(line[varEnd]) || line[varEnd] == '_'))
                                varEnd++;
                        }
                    }

                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..varEnd],
                        Type = TokenType.Variable,
                        StartIndex = i,
                        Length = varEnd - i
                    });
                    i = varEnd;
                    continue;
                }

                // Check for backtick command substitution
                if (c == '`')
                {
                    var tickEnd = line.IndexOf('`', i + 1);
                    tickEnd = tickEnd >= 0 ? tickEnd + 1 : len;
                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..tickEnd],
                        Type = TokenType.String,
                        StartIndex = i,
                        Length = tickEnd - i
                    });
                    i = tickEnd;
                    continue;
                }

                // Check for numbers
                if (char.IsDigit(c))
                {
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

                // Check for operators and redirections
                if (Info.Operators.Contains(c))
                {
                    var opEnd = i + 1;
                    // Check for multi-char operators
                    if (opEnd < len)
                    {
                        var twoChar = line.Substring(i, 2);
                        if (twoChar == "&&" || twoChar == "||" || twoChar == ">>" ||
                            twoChar == "<<" || twoChar == "2>" || twoChar == "&>" ||
                            twoChar == ">|" || twoChar == ";;" || twoChar == "==" ||
                            twoChar == "!=" || twoChar == "-a" || twoChar == "-o")
                            opEnd++;
                    }

                    tokens.Add(new HighlightToken
                    {
                        Text = line[i..opEnd],
                        Type = TokenType.Operator,
                        StartIndex = i,
                        Length = opEnd - i
                    });
                    i = opEnd;
                    continue;
                }

                // Check for brackets
                if (c == '(' || c == ')' || c == '[' || c == ']' || c == '{' || c == '}')
                {
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

                // Check for identifiers (commands, keywords)
                if (char.IsLetter(c) || c == '_' || c == '-' || c == '.')
                {
                    var idEnd = i;
                    while (idEnd < len && (char.IsLetterOrDigit(line[idEnd]) || line[idEnd] == '_' || line[idEnd] == '-' || line[idEnd] == '.'))
                        idEnd++;

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

                // Default
                tokens.Add(new HighlightToken
                {
                    Text = c.ToString(),
                    Type = TokenType.Default,
                    StartIndex = i,
                    Length = 1
                });
                i++;
            }

            return tokens;
        }
    }
}
