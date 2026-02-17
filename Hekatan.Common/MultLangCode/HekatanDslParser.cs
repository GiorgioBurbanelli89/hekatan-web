using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Parses @@DSL commands emitted by pyhekatan (Python) and converts them to HTML.
    /// Protocol: each line starting with @@ is a DSL command.
    /// Format: @@command field1|field2|field3|...
    /// Fields are separated by | (pipe). Escaped pipes: \|
    /// Base64 encoding used for multiline content (code, html_raw).
    /// </summary>
    public static class HekatanDslParser
    {
        // Greek letter mapping (same as pyhekatan)
        private static readonly Dictionary<string, string> GreekMap = new()
        {
            // Lowercase
            {"alpha", "\u03B1"}, {"beta", "\u03B2"}, {"gamma", "\u03B3"},
            {"delta", "\u03B4"}, {"epsilon", "\u03B5"}, {"zeta", "\u03B6"},
            {"eta", "\u03B7"}, {"theta", "\u03B8"}, {"iota", "\u03B9"},
            {"kappa", "\u03BA"}, {"lambda", "\u03BB"}, {"mu", "\u03BC"},
            {"nu", "\u03BD"}, {"xi", "\u03BE"}, {"omicron", "\u03BF"},
            {"pi", "\u03C0"}, {"rho", "\u03C1"}, {"sigma", "\u03C3"},
            {"tau", "\u03C4"}, {"upsilon", "\u03C5"}, {"phi", "\u03C6"},
            {"chi", "\u03C7"}, {"psi", "\u03C8"}, {"omega", "\u03C9"},
            // Uppercase
            {"Alpha", "\u0391"}, {"Beta", "\u0392"}, {"Gamma", "\u0393"},
            {"Delta", "\u0394"}, {"Epsilon", "\u0395"}, {"Zeta", "\u0396"},
            {"Eta", "\u0397"}, {"Theta", "\u0398"}, {"Iota", "\u0399"},
            {"Kappa", "\u039A"}, {"Lambda", "\u039B"}, {"Mu", "\u039C"},
            {"Nu", "\u039D"}, {"Xi", "\u039E"}, {"Omicron", "\u039F"},
            {"Pi", "\u03A0"}, {"Rho", "\u03A1"}, {"Sigma", "\u03A3"},
            {"Tau", "\u03A4"}, {"Upsilon", "\u03A5"}, {"Phi", "\u03A6"},
            {"Chi", "\u03A7"}, {"Psi", "\u03A8"}, {"Omega", "\u03A9"},
            // Variants
            {"varepsilon", "\u03B5"}, {"varphi", "\u03C6"},
            {"infty", "\u221E"}, {"infinity", "\u221E"},
        };

        private static readonly Regex GreekPattern;

        static HekatanDslParser()
        {
            // Build regex pattern matching Greek names at word boundaries
            var names = GreekMap.Keys.OrderByDescending(k => k.Length);
            var pattern = @"(?:^|(?<=[\s_*()/,]))(" + string.Join("|", names) + @")(?=[\s_^*()/,]|$)";
            GreekPattern = new Regex(pattern, RegexOptions.Compiled);
        }

        /// <summary>
        /// Checks if the output contains any @@DSL commands.
        /// </summary>
        public static bool ContainsDslCommands(string output)
        {
            if (string.IsNullOrEmpty(output)) return false;
            return output.Contains("@@");
        }

        /// <summary>
        /// Process the entire output: convert @@DSL lines to HTML, pass other lines through.
        /// </summary>
        public static string ProcessOutput(string output)
        {
            if (string.IsNullOrEmpty(output)) return output;

            var lines = output.Split('\n');
            var sb = new StringBuilder();
            string lastHtml = null;

            foreach (var rawLine in lines)
            {
                var line = rawLine.TrimEnd('\r');

                if (line.StartsWith("@@"))
                {
                    var html = ParseCommand(line);
                    if (html != null)
                    {
                        lastHtml = html;
                        sb.AppendLine(html);
                    }
                }
                else if (!string.IsNullOrWhiteSpace(line))
                {
                    // Plain text output from Python (not DSL)
                    sb.AppendLine($"<div class='lang-output-text'>{HttpUtility.HtmlEncode(line)}</div>");
                }
            }

            return sb.ToString().TrimEnd();
        }

        /// <summary>
        /// Parse a single @@command line and return HTML.
        /// </summary>
        public static string ParseCommand(string line)
        {
            if (!line.StartsWith("@@")) return null;

            // Split: @@command rest
            var spaceIdx = line.IndexOf(' ', 2);
            string command, rest;

            if (spaceIdx < 0)
            {
                command = line.Substring(2);
                rest = "";
            }
            else
            {
                command = line.Substring(2, spaceIdx - 2);
                rest = line.Substring(spaceIdx + 1);
            }

            var fields = SplitFields(rest);

            return command switch
            {
                "eq" => RenderEq(fields),
                "var" => RenderVar(fields),
                "matrix" => RenderMatrix(fields),
                "fraction" => RenderFraction(fields),
                "integral" => RenderIntegral(fields),
                "derivative" => RenderDerivative(fields),
                "partial" => RenderPartial(fields),
                "summation" => RenderSummation(fields),
                "product" => RenderProduct(fields),
                "sqrt" => RenderSqrt(fields),
                "double_integral" => RenderDoubleIntegral(fields),
                "limit" => RenderLimit(fields),
                "eq_num" => RenderEqNum(fields),
                "title" => RenderTitle(fields),
                "text" => RenderText(fields),
                "table" => RenderTable(fields),
                "columns" => RenderColumns(fields),
                "column" => RenderColumn(),
                "end_columns" => RenderEndColumns(),
                "check" => RenderCheck(fields),
                "image" => RenderImage(fields),
                "note" => RenderNote(fields),
                "code" => RenderCode(fields),
                "formula" => RenderFormula(fields),
                "hr" => "<hr style=\"margin:12px 0;border:none;border-top:1px solid #ddd;\">",
                "page_break" => "<div style=\"page-break-before:always;\"></div>",
                "html_raw" => RenderHtmlRaw(fields),
                _ => $"<!-- unknown DSL command: {HttpUtility.HtmlEncode(command)} -->"
            };
        }

        // ============================================================
        // Field parsing
        // ============================================================

        /// <summary>
        /// Split fields by | respecting escaped \|
        /// </summary>
        private static string[] SplitFields(string rest)
        {
            if (string.IsNullOrEmpty(rest)) return Array.Empty<string>();

            var fields = new List<string>();
            var current = new StringBuilder();

            for (int i = 0; i < rest.Length; i++)
            {
                if (rest[i] == '\\' && i + 1 < rest.Length && rest[i + 1] == '|')
                {
                    current.Append('|');
                    i++; // skip next
                }
                else if (rest[i] == '|')
                {
                    fields.Add(current.ToString());
                    current.Clear();
                }
                else
                {
                    current.Append(rest[i]);
                }
            }
            fields.Add(current.ToString());
            return fields.ToArray();
        }

        private static string F(string[] fields, int idx) =>
            idx < fields.Length ? fields[idx] : "";

        // ============================================================
        // Greek + subscript/superscript formatting (mirrors pyhekatan)
        // ============================================================

        private static string Greek(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            if (GreekMap.TryGetValue(text, out var g)) return g;
            return GreekPattern.Replace(text, m => GreekMap[m.Groups[1].Value]);
        }

        private static string FormatSubscript(string name)
        {
            if (string.IsNullOrEmpty(name)) return name;
            name = Greek(name);
            if (name.Contains('^'))
            {
                var parts = name.Split(new[] { '^' }, 2);
                var basePart = FormatSubscript(parts[0]);
                return $"{basePart}<sup>{parts[1]}</sup>";
            }
            if (name.Contains('_'))
            {
                var parts = name.Split(new[] { '_' }, 2);
                return $"{parts[0]}<sub>{Greek(parts[1])}</sub>";
            }
            return name;
        }

        private static string FormatExpr(string expr)
        {
            if (string.IsNullOrEmpty(expr)) return expr;
            var stripped = expr.Trim();

            // Pure number
            if (Regex.IsMatch(stripped, @"^-?\d+\.?\d*([eE][+-]?\d+)?$"))
                return stripped;

            // Split by operators
            var tokens = Regex.Split(expr, @"(\s*[+\-*/=<>]\s*|\s*\*\*\s*)");
            var result = new StringBuilder();
            foreach (var token in tokens)
            {
                var tok = token.Trim();
                if (tok is "+" or "-" or "/" or "=" or "<" or ">" or "**")
                    result.Append($" {tok} ");
                else if (tok == "*")
                    result.Append(" &middot; ");
                else if (string.IsNullOrEmpty(tok))
                    result.Append(token);
                else
                    result.Append(FormatSubscript(tok));
            }
            return result.ToString();
        }

        private static string FormatUnit(string unit)
        {
            if (string.IsNullOrEmpty(unit)) return "";
            if (unit.Contains('/'))
            {
                var parts = unit.Split(new[] { '/' }, 2);
                return $"{FormatUnitPart(parts[0])}\u2009\u2215\u2009{FormatUnitPart(parts[1])}";
            }
            if (unit.Contains('*'))
            {
                var parts = unit.Split('*');
                return string.Join("\u200A\u00B7\u200A", parts.Select(FormatUnitPart));
            }
            return FormatUnitPart(unit);
        }

        private static string FormatUnitPart(string part)
        {
            part = part.Trim();
            if (part.Contains('^'))
            {
                var split = part.Split(new[] { '^' }, 2);
                return $"{Greek(split[0])}<sup>{split[1]}</sup>";
            }
            return Greek(part);
        }

        private static string UnitHtml(string unit)
        {
            if (string.IsNullOrEmpty(unit)) return "";
            return $"\u2009<i>{FormatUnit(unit)}</i>";
        }

        // ============================================================
        // Nary operator helper (integral, sum, product)
        // ============================================================

        private static string NarySymbol(string symbol, string lower, string upper)
        {
            if (!string.IsNullOrEmpty(lower) && !string.IsNullOrEmpty(upper))
            {
                return $"<span class=\"nary-wrap\">" +
                       $"<span class=\"nary-sup\">{FormatSubscript(upper)}</span>" +
                       $"<span class=\"nary\">{symbol}</span>" +
                       $"<span class=\"nary-sub\">{FormatSubscript(lower)}</span>" +
                       $"</span>";
            }
            return $"<span class=\"nary\">{symbol}</span>";
        }

        // ============================================================
        // Renderers
        // ============================================================

        // @@eq name|value|unit
        private static string RenderEq(string[] f)
        {
            var name = FormatSubscript(F(f, 0));
            var value = FormatExpr(F(f, 1));
            var unit = UnitHtml(F(f, 2));
            return $"<div class=\"eq\"><var>{name}</var> = <span class=\"val\">{value}{unit}</span></div>";
        }

        // @@var name|value|unit|desc
        private static string RenderVar(string[] f)
        {
            var name = FormatSubscript(F(f, 0));
            var value = FormatExpr(F(f, 1));
            var unit = UnitHtml(F(f, 2));
            var desc = F(f, 3);
            var descHtml = !string.IsNullOrEmpty(desc) ? $" <span class=\"desc\">{desc}</span>" : "";
            return $"<div class=\"eq\"><var>{name}</var> = <span class=\"val\">{value}{unit}</span>{descHtml}</div>";
        }

        // @@matrix name|row1_c1,row1_c2;row2_c1,row2_c2
        private static string RenderMatrix(string[] f)
        {
            var name = F(f, 0);
            var dataStr = F(f, 1);

            if (string.IsNullOrEmpty(dataStr))
                return "<!-- empty matrix -->";

            var rows = dataStr.Split(';');
            var sb = new StringBuilder();
            sb.Append("<table class=\"matrix\">");
            foreach (var row in rows)
            {
                sb.Append("<tr class=\"tr\"><td class=\"td\"></td>");
                var cells = row.Split(',');
                foreach (var cell in cells)
                    sb.Append($"<td class=\"td\">{FormatSubscript(cell.Trim())}</td>");
                sb.Append("<td class=\"td\"></td></tr>");
            }
            sb.Append("</table>");

            if (!string.IsNullOrEmpty(name))
            {
                var nameHtml = FormatSubscript(name);
                return $"<div class=\"eq\"><var>{nameHtml}</var> = {sb}</div>";
            }
            return $"<div class=\"eq\">{sb}</div>";
        }

        // @@fraction name|numerator|denominator
        private static string RenderFraction(string[] f)
        {
            var name = F(f, 0);
            var num = FormatSubscript(F(f, 1));
            var den = FormatSubscript(F(f, 2));
            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";

            return $"<div class=\"eq\">{nameHtml}" +
                   $"<span class=\"dvc\">" +
                   $"<span class=\"dvl\">{num}</span>" +
                   $"<span class=\"dvl\">{den}</span>" +
                   $"</span></div>";
        }

        // @@integral name|integrand|variable|lower|upper
        private static string RenderIntegral(string[] f)
        {
            var name = F(f, 0);
            var integrand = FormatSubscript(F(f, 1));
            var variable = FormatSubscript(F(f, 2));
            var lower = F(f, 3);
            var upper = F(f, 4);

            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";
            var intSym = NarySymbol("&#8747;", lower, upper);

            return $"<div class=\"eq\">{nameHtml}{intSym}" +
                   $"<var>{integrand}</var>" +
                   $"<span class=\"dot-sep\">&middot;</span>" +
                   $"d<var>{variable}</var></div>";
        }

        // @@derivative name|func|variable|order
        private static string RenderDerivative(string[] f)
        {
            var name = F(f, 0);
            var func = FormatSubscript(F(f, 1));
            var variable = FormatSubscript(F(f, 2));
            int.TryParse(F(f, 3), out var order);
            if (order < 1) order = 1;

            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";

            string num, den;
            if (order == 1)
            {
                num = $"d<var>{func}</var>";
                den = $"d<var>{variable}</var>";
            }
            else
            {
                num = $"d<sup>{order}</sup><var>{func}</var>";
                den = $"d<var>{variable}</var><sup>{order}</sup>";
            }

            return $"<div class=\"eq\">{nameHtml}" +
                   $"<span class=\"dvc\">" +
                   $"<span class=\"dvl\">{num}</span>" +
                   $"<span class=\"dvl\">{den}</span>" +
                   $"</span></div>";
        }

        // @@partial name|func|var1,var2,...|order
        private static string RenderPartial(string[] f)
        {
            var name = F(f, 0);
            var func = FormatSubscript(F(f, 1));
            var varsStr = F(f, 2);
            int.TryParse(F(f, 3), out var totalOrder);
            if (totalOrder < 1) totalOrder = 1;

            var vars = varsStr.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";
            var pd = "\u2202"; // ∂

            string num, den;
            if (totalOrder == 1 && vars.Length == 1)
            {
                num = $"{pd}<var>{func}</var>";
                den = $"{pd}<var>{FormatSubscript(vars[0])}</var>";
            }
            else if (vars.Length == 1)
            {
                num = $"{pd}<sup>{totalOrder}</sup><var>{func}</var>";
                den = $"{pd}<var>{FormatSubscript(vars[0])}</var><sup>{totalOrder}</sup>";
            }
            else
            {
                // Mixed: ∂²f / ∂x∂y
                num = $"{pd}<sup>{totalOrder}</sup><var>{func}</var>";
                var denParts = string.Join("", vars.Select(v => $"{pd}<var>{FormatSubscript(v)}</var>"));
                den = denParts;
            }

            return $"<div class=\"eq\">{nameHtml}" +
                   $"<span class=\"dvc\">" +
                   $"<span class=\"dvl\">{num}</span>" +
                   $"<span class=\"dvl\">{den}</span>" +
                   $"</span></div>";
        }

        // @@summation name|expr|variable|lower|upper
        private static string RenderSummation(string[] f)
        {
            var name = F(f, 0);
            var expr = FormatSubscript(F(f, 1));
            var variable = F(f, 2);
            var lower = F(f, 3);
            var upper = F(f, 4);

            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";

            // Build lower label: i=1 format
            string lowerLabel = lower;
            if (!string.IsNullOrEmpty(lower) && !lower.Contains('='))
                lowerLabel = $"{FormatSubscript(variable)}={FormatSubscript(lower)}";
            else if (!string.IsNullOrEmpty(lower))
                lowerLabel = FormatSubscript(lower);

            var sumSym = NarySymbol("&sum;", lowerLabel, upper);

            return $"<div class=\"eq\">{nameHtml}{sumSym}<var>{expr}</var></div>";
        }

        // @@product name|expr|variable|lower|upper
        private static string RenderProduct(string[] f)
        {
            var name = F(f, 0);
            var expr = FormatSubscript(F(f, 1));
            var variable = F(f, 2);
            var lower = F(f, 3);
            var upper = F(f, 4);

            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";

            string lowerLabel = lower;
            if (!string.IsNullOrEmpty(lower) && !lower.Contains('='))
                lowerLabel = $"{FormatSubscript(variable)}={FormatSubscript(lower)}";
            else if (!string.IsNullOrEmpty(lower))
                lowerLabel = FormatSubscript(lower);

            var prodSym = NarySymbol("&prod;", lowerLabel, upper);

            return $"<div class=\"eq\">{nameHtml}{prodSym}<var>{expr}</var></div>";
        }

        // @@sqrt name|expr|index
        private static string RenderSqrt(string[] f)
        {
            var name = F(f, 0);
            var expr = FormatExpr(F(f, 1));
            var indexStr = F(f, 2);

            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";

            string pad;
            if (!string.IsNullOrEmpty(indexStr) && indexStr != "0")
                pad = $"&hairsp;<sup class=\"nth\">{indexStr}</sup>&hairsp;&hairsp;";
            else
                pad = "&ensp;&hairsp;&hairsp;";

            return $"<div class=\"eq\">{nameHtml}{pad}" +
                   $"<span class=\"o0\">" +
                   $"<span class=\"r\">\u221A</span>&hairsp;" +
                   $"{expr}" +
                   $"</span></div>";
        }

        // @@double_integral name|integrand|var1|lower1|upper1|var2|lower2|upper2
        private static string RenderDoubleIntegral(string[] f)
        {
            var name = F(f, 0);
            var integrand = FormatSubscript(F(f, 1));
            var var1 = FormatSubscript(F(f, 2));
            var lower1 = F(f, 3);
            var upper1 = F(f, 4);
            var var2 = FormatSubscript(F(f, 5));
            var lower2 = F(f, 6);
            var upper2 = F(f, 7);

            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";
            var int1 = NarySymbol("&#8747;", lower2, upper2);
            var int2 = NarySymbol("&#8747;", lower1, upper1);

            return $"<div class=\"eq\">{nameHtml}{int1}{int2}" +
                   $"<var>{integrand}</var>" +
                   $"<span class=\"dot-sep\">&middot;</span>" +
                   $"d<var>{var1}</var>" +
                   $"<span class=\"dot-sep\">&middot;</span>" +
                   $"d<var>{var2}</var></div>";
        }

        // @@limit name|expr|variable|to|direction
        private static string RenderLimit(string[] f)
        {
            var name = F(f, 0);
            var expr = FormatSubscript(F(f, 1));
            var variable = FormatSubscript(F(f, 2));
            var to = FormatSubscript(F(f, 3));
            var direction = F(f, 4);

            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";
            var dirHtml = !string.IsNullOrEmpty(direction) ? $"<sup>{direction}</sup>" : "";

            var limSym = $"<span class=\"nary-wrap\">" +
                         $"<span class=\"nary\" style=\"font-size:120%;color:#333;\">lim</span>" +
                         $"<span class=\"nary-sub\"><var>{variable}</var>&rarr;{to}{dirHtml}</span>" +
                         $"</span>";

            return $"<div class=\"eq\">{nameHtml}{limSym}<var>{expr}</var></div>";
        }

        // @@eq_num tag
        private static string RenderEqNum(string[] f)
        {
            var tag = F(f, 0);
            return $"<span class=\"eq-num\">({tag})</span>";
        }

        // @@title level|content
        private static string RenderTitle(string[] f)
        {
            int.TryParse(F(f, 0), out var level);
            if (level < 1) level = 1;
            if (level > 6) level = 6;
            var content = F(f, 1);
            return $"<h{level}>{Greek(content)}</h{level}>";
        }

        // @@text content
        private static string RenderText(string[] f)
        {
            var content = string.Join("|", f); // rejoin in case text had pipes
            return $"<p>{Greek(content)}</p>";
        }

        // @@table header_flag|row1_c1,row1_c2;row2_c1,row2_c2
        private static string RenderTable(string[] f)
        {
            var headerFlag = F(f, 0) == "1";
            var dataStr = F(f, 1);

            if (string.IsNullOrEmpty(dataStr))
                return "<!-- empty table -->";

            var rows = dataStr.Split(';');
            var sb = new StringBuilder();
            sb.Append("<table class=\"hekatan-table\">");

            for (int r = 0; r < rows.Length; r++)
            {
                sb.Append("<tr>");
                var cells = rows[r].Split(',');
                var tag = (r == 0 && headerFlag) ? "th" : "td";
                foreach (var cell in cells)
                    sb.Append($"<{tag}>{FormatSubscript(cell.Trim())}</{tag}>");
                sb.Append("</tr>");
            }

            sb.Append("</table>");
            return sb.ToString();
        }

        // @@columns n
        private static string RenderColumns(string[] f)
        {
            int.TryParse(F(f, 0), out var n);
            if (n < 2) n = 2;
            var width = 100 / n;
            return $"<div class=\"columns-container\" style=\"display:flex;gap:1em;flex-wrap:wrap;\">" +
                   $"<div class=\"column\" style=\"flex:1;min-width:{width - 5}%;max-width:{width + 5}%;\">";
        }

        // @@column
        private static string RenderColumn()
        {
            return "</div><div class=\"column\" style=\"flex:1;min-width:40%;max-width:60%;\">";
        }

        // @@end_columns
        private static string RenderEndColumns()
        {
            return "</div></div>";
        }

        // @@check name|value|limit|unit|condition|desc
        private static string RenderCheck(string[] f)
        {
            var name = FormatSubscript(F(f, 0));
            var valueStr = F(f, 1);
            var limitStr = F(f, 2);
            var unit = UnitHtml(F(f, 3));
            var condition = F(f, 4);
            var desc = F(f, 5);

            if (string.IsNullOrEmpty(condition)) condition = "<=";

            double.TryParse(valueStr, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var value);
            double.TryParse(limitStr, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var limit);

            var passed = condition switch
            {
                "<=" => value <= limit,
                ">=" => value >= limit,
                "<" => value < limit,
                ">" => value > limit,
                "==" => Math.Abs(value - limit) < 1e-12,
                _ => value <= limit,
            };

            var symbol = condition switch
            {
                "<=" => "\u2264",
                ">=" => "\u2265",
                "<" => "<",
                ">" => ">",
                "==" => "=",
                _ => "\u2264",
            };

            var statusClass = passed ? "ok" : "err";
            var statusMark = passed ? "\u2713" : "\u2717";
            var descHtml = !string.IsNullOrEmpty(desc) ? $" <span class=\"desc\">{desc}</span>" : "";

            return $"<div class=\"eq\">" +
                   $"<var>{name}</var> = " +
                   $"<span class=\"val\">{FormatExpr(valueStr)}{unit}</span>" +
                   $" {symbol} " +
                   $"<span class=\"val\">{FormatExpr(limitStr)}{unit}</span>" +
                   $" <span class=\"{statusClass}\"><b>{statusMark}</b></span>" +
                   $"{descHtml}</div>";
        }

        // @@image src|alt|width|caption
        private static string RenderImage(string[] f)
        {
            var src = F(f, 0);
            var alt = F(f, 1);
            var width = F(f, 2);
            var caption = F(f, 3);

            var style = !string.IsNullOrEmpty(width) ? $" style=\"max-width:{width};\"" : " style=\"max-width:100%;\"";
            var imgTag = $"<img src=\"{HttpUtility.HtmlAttributeEncode(src)}\" alt=\"{HttpUtility.HtmlAttributeEncode(alt)}\"{style}>";

            if (!string.IsNullOrEmpty(caption))
            {
                return $"<figure style=\"margin:12px 0;\">{imgTag}" +
                       $"<figcaption style=\"font-size:9pt;color:#666;margin-top:4px;font-style:italic;\">" +
                       $"{Greek(caption)}</figcaption></figure>";
            }
            return $"<div style=\"margin:8px 0;\">{imgTag}</div>";
        }

        // @@note kind|content
        private static string RenderNote(string[] f)
        {
            var kind = F(f, 0);
            var content = F(f, 1);

            var (bg, fg, border, icon) = kind switch
            {
                "warning" => ("#fff3e0", "#e65100", "#ffcc80", "\u26A0"),
                "error" => ("#fce4ec", "#c62828", "#ef9a9a", "\u2717"),
                "success" => ("#e8f5e9", "#2e7d32", "#a5d6a7", "\u2713"),
                _ => ("#e3f2fd", "#1565c0", "#bbdefb", "\u2139"),
            };

            return $"<div style=\"background:{bg};color:{fg};border-left:4px solid {border};" +
                   $"padding:8px 12px;margin:8px 0;border-radius:4px;font-size:10pt;\">" +
                   $"<b>{icon}</b> {Greek(content)}</div>";
        }

        // @@code lang|base64_content
        private static string RenderCode(string[] f)
        {
            var lang = F(f, 0);
            var b64 = F(f, 1);

            string content;
            try
            {
                content = Encoding.UTF8.GetString(Convert.FromBase64String(b64));
            }
            catch
            {
                content = b64; // fallback: treat as plain text
            }

            var escaped = HttpUtility.HtmlEncode(content);
            var langClass = !string.IsNullOrEmpty(lang) ? $" code-{lang}" : "";
            return $"<pre class=\"code-block{langClass}\" style=\"background:#f8f8f8;border-left:3px solid #3776ab;" +
                   $"border-radius:3px;padding:6px 8px;margin:6px 0;font-family:Consolas,monospace;" +
                   $"font-size:9pt;line-height:1.4;white-space:pre;overflow-x:auto;\">{escaped}</pre>";
        }

        // @@formula name|expression|unit
        private static string RenderFormula(string[] f)
        {
            var name = F(f, 0);
            var expression = FormatExpr(F(f, 1));
            var unit = UnitHtml(F(f, 2));
            var nameHtml = !string.IsNullOrEmpty(name) ? $"<var>{FormatSubscript(name)}</var> = " : "";
            return $"<div class=\"eq\">{nameHtml}{expression}{unit}</div>";
        }

        // @@html_raw base64_content
        private static string RenderHtmlRaw(string[] f)
        {
            var b64 = F(f, 0);
            try
            {
                return Encoding.UTF8.GetString(Convert.FromBase64String(b64));
            }
            catch
            {
                return $"<!-- html_raw decode error -->";
            }
        }
    }
}
