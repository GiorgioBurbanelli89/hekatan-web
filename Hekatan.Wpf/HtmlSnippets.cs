using System.Collections.Generic;

namespace Hekatan.Wpf
{
    /// <summary>
    /// HTML/CSS/JS Snippets for autocomplete (Emmet-style)
    /// </summary>
    public class HtmlSnippet
    {
        public string Trigger { get; set; }
        public string Description { get; set; }
        public string Template { get; set; }
        public int CursorOffset { get; set; } // Position to place cursor after insert

        public HtmlSnippet(string trigger, string description, string template, int cursorOffset = 0)
        {
            Trigger = trigger;
            Description = description;
            Template = template;
            CursorOffset = cursorOffset;
        }
    }

    public static class HtmlSnippets
    {
        public static readonly Dictionary<string, HtmlSnippet> Snippets = new()
        {
            // HTML5 Boilerplate
            ["html:5"] = new HtmlSnippet(
                "html:5",
                "HTML5 boilerplate",
                @"<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>Document</title>
</head>
<body>

</body>
</html>",
                cursorOffset: 8 // After <body>\n + 4 spaces
            ),

            ["html"] = new HtmlSnippet(
                "html",
                "HTML5 boilerplate",
                @"<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>Document</title>
</head>
<body>

</body>
</html>",
                cursorOffset: 8
            ),

            // Common HTML tags
            ["div"] = new HtmlSnippet(
                "div",
                "Div element",
                "<div>\n    \n</div>",
                cursorOffset: 4
            ),

            ["p"] = new HtmlSnippet(
                "p",
                "Paragraph",
                "<p></p>",
                cursorOffset: -4
            ),

            ["a"] = new HtmlSnippet(
                "a",
                "Anchor link",
                "<a href=\"\"></a>",
                cursorOffset: -6
            ),

            ["link"] = new HtmlSnippet(
                "link",
                "Link stylesheet",
                "<link rel=\"stylesheet\" href=\"\">",
                cursorOffset: -2
            ),

            ["script"] = new HtmlSnippet(
                "script",
                "Script tag",
                "<script src=\"\"></script>",
                cursorOffset: -11
            ),

            ["style"] = new HtmlSnippet(
                "style",
                "Style tag",
                "<style>\n    \n</style>",
                cursorOffset: 4
            ),

            ["h1"] = new HtmlSnippet("h1", "Heading 1", "<h1></h1>", -5),
            ["h2"] = new HtmlSnippet("h2", "Heading 2", "<h2></h2>", -5),
            ["h3"] = new HtmlSnippet("h3", "Heading 3", "<h3></h3>", -5),

            ["button"] = new HtmlSnippet(
                "button",
                "Button element",
                "<button></button>",
                cursorOffset: -9
            ),

            ["input"] = new HtmlSnippet(
                "input",
                "Input field",
                "<input type=\"text\">",
                cursorOffset: -7
            ),

            ["form"] = new HtmlSnippet(
                "form",
                "Form element",
                "<form action=\"\">\n    \n</form>",
                cursorOffset: 4
            ),

            ["table"] = new HtmlSnippet(
                "table",
                "Table element",
                @"<table>
    <thead>
        <tr>
            <th></th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td></td>
        </tr>
    </tbody>
</table>",
                cursorOffset: 12
            ),

            ["ul"] = new HtmlSnippet(
                "ul",
                "Unordered list",
                "<ul>\n    <li></li>\n</ul>",
                cursorOffset: 4
            ),

            ["ol"] = new HtmlSnippet(
                "ol",
                "Ordered list",
                "<ol>\n    <li></li>\n</ol>",
                cursorOffset: 4
            ),
        };

        /// <summary>
        /// CSS Snippets
        /// </summary>
        public static readonly Dictionary<string, HtmlSnippet> CssSnippets = new()
        {
            ["flex"] = new HtmlSnippet(
                "flex",
                "Flexbox container",
                @"display: flex;
justify-content: center;
align-items: center;",
                cursorOffset: 0
            ),

            ["grid"] = new HtmlSnippet(
                "grid",
                "Grid container",
                @"display: grid;
grid-template-columns: repeat(3, 1fr);
gap: 10px;",
                cursorOffset: 0
            ),

            ["center"] = new HtmlSnippet(
                "center",
                "Center element",
                @"margin: 0 auto;
text-align: center;",
                cursorOffset: 0
            ),
        };

        /// <summary>
        /// TypeScript/JavaScript Snippets
        /// </summary>
        public static readonly Dictionary<string, HtmlSnippet> TsSnippets = new()
        {
            ["function"] = new HtmlSnippet(
                "function",
                "Function declaration",
                @"function functionName() {

}",
                cursorOffset: 4
            ),

            ["arrow"] = new HtmlSnippet(
                "arrow",
                "Arrow function",
                "const functionName = () => {\n    \n}",
                cursorOffset: 4
            ),

            ["class"] = new HtmlSnippet(
                "class",
                "Class declaration",
                @"class ClassName {
    constructor() {

    }
}",
                cursorOffset: 8
            ),

            ["interface"] = new HtmlSnippet(
                "interface",
                "TypeScript interface",
                @"interface InterfaceName {

}",
                cursorOffset: 4
            ),

            ["log"] = new HtmlSnippet(
                "log",
                "Console log",
                "console.log();",
                cursorOffset: -2
            ),
        };

        /// <summary>
        /// Get snippets for a specific language/context
        /// </summary>
        public static Dictionary<string, HtmlSnippet> GetSnippetsForContext(string context)
        {
            return context?.ToLowerInvariant() switch
            {
                "html" => Snippets,
                "css" => CssSnippets,
                "ts" or "typescript" or "js" or "javascript" => TsSnippets,
                _ => new Dictionary<string, HtmlSnippet>()
            };
        }
    }
}
