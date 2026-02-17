using System.Collections.Generic;

namespace Hekatan.Common.MultLangCode.AutoComplete
{
    /// <summary>
    /// Python-specific auto-complete provider
    /// </summary>
    public class PythonAutoComplete : BaseLanguageAutoComplete
    {
        private static readonly LanguageAutoCompleteInfo PythonInfo = CreatePythonInfo();

        public PythonAutoComplete() : base(PythonInfo)
        {
        }

        private static LanguageAutoCompleteInfo CreatePythonInfo()
        {
            var info = new LanguageAutoCompleteInfo
            {
                LanguageName = "Python",
                TriggerCharacters = new HashSet<char> { '.', '(' },
                MinimumPrefixLength = 2
            };

            // Keywords
            var keywords = new[]
            {
                "False", "None", "True", "and", "as", "assert", "async", "await",
                "break", "class", "continue", "def", "del", "elif", "else", "except",
                "finally", "for", "from", "global", "if", "import", "in", "is",
                "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
                "while", "with", "yield"
            };

            foreach (var kw in keywords)
            {
                info.Items.Add(new AutoCompleteItem
                {
                    DisplayText = kw,
                    InsertText = kw,
                    ItemType = AutoCompleteItemType.Keyword
                });
            }

            // Built-in functions
            var builtins = new Dictionary<string, string>
            {
                ["abs"] = "abs(x) - Return the absolute value",
                ["all"] = "all(iterable) - Return True if all elements are true",
                ["any"] = "any(iterable) - Return True if any element is true",
                ["bin"] = "bin(x) - Convert integer to binary string",
                ["bool"] = "bool(x) - Convert to boolean",
                ["chr"] = "chr(i) - Return character from Unicode code point",
                ["dict"] = "dict() - Create a new dictionary",
                ["dir"] = "dir(object) - Return list of names in current scope",
                ["enumerate"] = "enumerate(iterable, start=0) - Return enumerate object",
                ["eval"] = "eval(expression) - Evaluate expression",
                ["filter"] = "filter(function, iterable) - Filter elements",
                ["float"] = "float(x) - Convert to floating point",
                ["format"] = "format(value, format_spec) - Format value",
                ["getattr"] = "getattr(object, name) - Get attribute of object",
                ["globals"] = "globals() - Return global symbol table",
                ["hasattr"] = "hasattr(object, name) - Check if object has attribute",
                ["hash"] = "hash(object) - Return hash value",
                ["hex"] = "hex(x) - Convert integer to hexadecimal",
                ["id"] = "id(object) - Return identity of object",
                ["input"] = "input(prompt) - Read line from input",
                ["int"] = "int(x) - Convert to integer",
                ["isinstance"] = "isinstance(object, classinfo) - Check instance",
                ["iter"] = "iter(object) - Return iterator",
                ["len"] = "len(s) - Return length of object",
                ["list"] = "list() - Create a new list",
                ["locals"] = "locals() - Return local symbol table",
                ["map"] = "map(function, iterable) - Apply function to items",
                ["max"] = "max(iterable) - Return largest item",
                ["min"] = "min(iterable) - Return smallest item",
                ["next"] = "next(iterator) - Return next item",
                ["oct"] = "oct(x) - Convert integer to octal",
                ["open"] = "open(file, mode) - Open file",
                ["ord"] = "ord(c) - Return Unicode code point",
                ["pow"] = "pow(base, exp) - Return base to the power exp",
                ["print"] = "print(*objects, sep=' ', end='\\n') - Print objects",
                ["range"] = "range(stop) - Return range object",
                ["repr"] = "repr(object) - Return printable representation",
                ["reversed"] = "reversed(seq) - Return reversed iterator",
                ["round"] = "round(number, ndigits) - Round number",
                ["set"] = "set() - Create a new set",
                ["setattr"] = "setattr(object, name, value) - Set attribute",
                ["slice"] = "slice(start, stop, step) - Return slice object",
                ["sorted"] = "sorted(iterable) - Return sorted list",
                ["str"] = "str(object) - Convert to string",
                ["sum"] = "sum(iterable) - Sum of items",
                ["super"] = "super() - Return proxy object",
                ["tuple"] = "tuple() - Create a new tuple",
                ["type"] = "type(object) - Return type of object",
                ["vars"] = "vars(object) - Return __dict__ attribute",
                ["zip"] = "zip(*iterables) - Return iterator of tuples"
            };

            foreach (var (name, desc) in builtins)
            {
                info.Items.Add(new AutoCompleteItem
                {
                    DisplayText = name,
                    InsertText = name + "()",
                    ItemType = AutoCompleteItemType.Builtin,
                    Description = desc,
                    Signature = desc.Split('-')[0].Trim()
                });
            }

            // Common snippets
            info.Items.Add(new AutoCompleteItem
            {
                DisplayText = "def function",
                InsertText = "def function_name():\n    pass",
                ItemType = AutoCompleteItemType.Snippet,
                Description = "Define a new function"
            });

            info.Items.Add(new AutoCompleteItem
            {
                DisplayText = "class",
                InsertText = "class ClassName:\n    def __init__(self):\n        pass",
                ItemType = AutoCompleteItemType.Snippet,
                Description = "Define a new class"
            });

            info.Items.Add(new AutoCompleteItem
            {
                DisplayText = "if __name__",
                InsertText = "if __name__ == \"__main__\":\n    ",
                ItemType = AutoCompleteItemType.Snippet,
                Description = "Main entry point check"
            });

            info.Items.Add(new AutoCompleteItem
            {
                DisplayText = "try except",
                InsertText = "try:\n    \nexcept Exception as e:\n    pass",
                ItemType = AutoCompleteItemType.Snippet,
                Description = "Try-except block"
            });

            info.Items.Add(new AutoCompleteItem
            {
                DisplayText = "with open",
                InsertText = "with open(\"filename\", \"r\") as f:\n    ",
                ItemType = AutoCompleteItemType.Snippet,
                Description = "Open file with context manager"
            });

            return info;
        }
    }
}
