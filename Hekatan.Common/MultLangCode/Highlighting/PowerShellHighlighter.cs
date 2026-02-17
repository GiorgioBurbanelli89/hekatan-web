using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.Highlighting
{
    /// <summary>
    /// PowerShell-specific syntax highlighter
    /// </summary>
    public class PowerShellHighlighter : BaseLanguageHighlighter
    {
        private static readonly LanguageHighlightInfo PowerShellInfo = new()
        {
            LanguageName = "PowerShell",
            KeywordColor = "#0000FF",      // Blue
            BuiltinColor = "#FFFF00",      // Yellow (PowerShell cmdlets)
            StringColor = "#00BFFF",       // DeepSkyBlue
            CommentColor = "#006400",      // DarkGreen
            NumberColor = "#FFFFFF",       // White
            OperatorColor = "#808080",     // Gray
            VariableColor = "#00CED1",     // DarkTurquoise
            FunctionColor = "#FFFF00",     // Yellow
            ErrorColor = "#FF0000",        // Red
            DefaultColor = "#FFFFFF",      // White
            CommentPrefix = "#",
            BlockCommentStart = "<#",
            BlockCommentEnd = "#>",
            StringDelimiter = '"',
            AltStringDelimiter = '\'',
            Keywords = new HashSet<string>(System.StringComparer.OrdinalIgnoreCase)
            {
                "Begin", "Break", "Catch", "Class", "Continue", "Data", "Define",
                "Do", "DynamicParam", "Else", "ElseIf", "End", "Enum", "Exit",
                "Filter", "Finally", "For", "ForEach", "From", "Function", "If",
                "In", "InlineScript", "Hidden", "Parallel", "Param", "Process",
                "Return", "Sequence", "Switch", "Throw", "Trap", "Try", "Until",
                "Using", "Var", "While", "Workflow"
            },
            Builtins = new HashSet<string>(System.StringComparer.OrdinalIgnoreCase)
            {
                "Add-Content", "Add-Member", "Clear-Content", "Clear-Item",
                "Clear-Variable", "Compare-Object", "ConvertFrom-Json",
                "ConvertTo-Json", "Copy-Item", "Export-Csv", "ForEach-Object",
                "Format-List", "Format-Table", "Get-ChildItem", "Get-Command",
                "Get-Content", "Get-Date", "Get-Help", "Get-Item", "Get-ItemProperty",
                "Get-Location", "Get-Member", "Get-Process", "Get-Service",
                "Get-Variable", "Group-Object", "Import-Csv", "Import-Module",
                "Invoke-Command", "Invoke-Expression", "Invoke-RestMethod",
                "Invoke-WebRequest", "Join-Path", "Measure-Object", "Move-Item",
                "New-Item", "New-Object", "Out-File", "Out-Host", "Out-Null",
                "Out-String", "Read-Host", "Remove-Item", "Remove-Variable",
                "Rename-Item", "Resolve-Path", "Select-Object", "Select-String",
                "Set-Content", "Set-Item", "Set-ItemProperty", "Set-Location",
                "Set-Variable", "Sort-Object", "Split-Path", "Start-Process",
                "Start-Sleep", "Stop-Process", "Test-Path", "Where-Object",
                "Write-Debug", "Write-Error", "Write-Host", "Write-Output",
                "Write-Progress", "Write-Verbose", "Write-Warning"
            },
            Operators = new HashSet<char>
            {
                '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~'
            }
        };

        public PowerShellHighlighter() : base(PowerShellInfo)
        {
        }

        /// <summary>
        /// PowerShell variables start with $
        /// </summary>
        public override List<HighlightToken> Tokenize(string line)
        {
            var tokens = new List<HighlightToken>();
            if (string.IsNullOrEmpty(line))
                return tokens;

            var i = 0;
            var len = line.Length;

            while (i < len)
            {
                var c = line[i];

                // Check for single-line comments
                if (c == '#' && !(i + 1 < len && line[i + 1] == '<'))
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

                // Check for block comments
                if (c == '<' && i + 1 < len && line[i + 1] == '#')
                {
                    var endIdx = line.IndexOf("#>", i + 2);
                    if (endIdx >= 0)
                    {
                        endIdx += 2;
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

                // Check for variables ($variable)
                if (c == '$')
                {
                    var varEnd = i + 1;
                    while (varEnd < len && (char.IsLetterOrDigit(line[varEnd]) || line[varEnd] == '_'))
                        varEnd++;

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

                // Check for strings
                if (c == '"' || c == '\'')
                {
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

                // Check for cmdlets and identifiers
                if (char.IsLetter(c) || c == '_')
                {
                    var idEnd = i;
                    // PowerShell cmdlets can have dashes
                    while (idEnd < len && (char.IsLetterOrDigit(line[idEnd]) || line[idEnd] == '_' || line[idEnd] == '-'))
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

                // Check for operators
                if (Info.Operators.Contains(c))
                {
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

                // Default: add as default text
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

        /// <summary>
        /// Classifies PowerShell identifiers including cmdlets
        /// </summary>
        protected override TokenType ClassifyIdentifier(string identifier, string line, int endIndex)
        {
            // Check if it's a keyword (case-insensitive)
            if (Info.Keywords.Contains(identifier))
                return TokenType.Keyword;

            // Check if it's a cmdlet
            if (Info.Builtins.Contains(identifier))
                return TokenType.Builtin;

            // Check if it looks like a cmdlet (Verb-Noun pattern)
            if (identifier.Contains('-'))
                return TokenType.Function;

            return TokenType.Variable;
        }
    }
}
