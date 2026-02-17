using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Main manager for multi-language code execution
    /// Works in both WPF and CLI environments - ALWAYS synchronized via external JSON
    /// </summary>
    public static class MultLangManager
    {
        private static MultLangConfig _config;
        private static readonly object _lock = new();
        private static readonly Dictionary<string, bool> _availableLanguages = new();
        private static string _configFilePath;
        private static DateTime _lastConfigLoad;

        /// <summary>
        /// Path to the shared MultLangConfig.json file
        /// </summary>
        public static string ConfigFilePath
        {
            get
            {
                if (string.IsNullOrEmpty(_configFilePath))
                    _configFilePath = FindConfigFile();
                return _configFilePath;
            }
            set => _configFilePath = value;
        }

        /// <summary>
        /// Gets the loaded configuration (auto-reloads if file changed)
        /// </summary>
        public static MultLangConfig Config
        {
            get
            {
                lock (_lock)
                {
                    if (_config == null || ConfigFileChanged())
                        LoadConfig();
                    return _config;
                }
            }
        }

        /// <summary>
        /// Checks if config file has been modified since last load
        /// </summary>
        private static bool ConfigFileChanged()
        {
            if (string.IsNullOrEmpty(ConfigFilePath) || !File.Exists(ConfigFilePath))
                return false;

            var lastWrite = File.GetLastWriteTime(ConfigFilePath);
            return lastWrite > _lastConfigLoad;
        }

        /// <summary>
        /// Finds the MultLangConfig.json file in known locations
        /// Priority: 1) Project root, 2) Next to executable, 3) Common AppData
        /// </summary>
        private static string FindConfigFile()
        {
            var possiblePaths = new List<string>();

            // 1. PROJECT ROOT (search upwards from assembly location for .sln file)
            var projectRoot = FindProjectRoot();
            if (!string.IsNullOrEmpty(projectRoot))
            {
                possiblePaths.Add(Path.Combine(projectRoot, "MultLangConfig.json"));
                possiblePaths.Add(Path.Combine(projectRoot, "Hekatan.Common", "MultLangCode", "MultLangConfig.json"));
            }

            // 2. Next to the Hekatan.Common.dll (fallback for deployed apps)
            var assemblyDir = Path.GetDirectoryName(typeof(MultLangManager).Assembly.Location);
            if (!string.IsNullOrEmpty(assemblyDir))
            {
                possiblePaths.Add(Path.Combine(assemblyDir, "MultLangConfig.json"));
                possiblePaths.Add(Path.Combine(assemblyDir, "MultLangCode", "MultLangConfig.json"));
            }

            // 3. Current working directory
            possiblePaths.Add(Path.Combine(Environment.CurrentDirectory, "MultLangConfig.json"));
            possiblePaths.Add(Path.Combine(Environment.CurrentDirectory, "MultLangCode", "MultLangConfig.json"));

            // 4. Common AppData (for system-wide installations)
            var commonAppData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            possiblePaths.Add(Path.Combine(commonAppData, "Hekatan", "MultLangConfig.json"));

            // Return first existing file
            foreach (var path in possiblePaths)
            {
                if (File.Exists(path))
                {
                    LogDebug($"Found config at: {path}");
                    return path;
                }
            }

            // If none found, create in project root if we can find it, otherwise next to assembly
            var defaultPath = !string.IsNullOrEmpty(projectRoot)
                ? Path.Combine(projectRoot, "MultLangConfig.json")
                : possiblePaths.FirstOrDefault() ?? "MultLangConfig.json";

            LogDebug($"No config found. Will create at: {defaultPath}");
            return defaultPath;
        }

        /// <summary>
        /// Finds the project root by searching for directory containing both Hekatan.Common and Hekatan.Cli
        /// </summary>
        private static string FindProjectRoot()
        {
            try
            {
                var assemblyDir = Path.GetDirectoryName(typeof(MultLangManager).Assembly.Location);
                if (string.IsNullOrEmpty(assemblyDir))
                    return null;

                var currentDir = new DirectoryInfo(assemblyDir);

                // Search upwards max 10 levels
                for (int i = 0; i < 10 && currentDir != null; i++)
                {
                    // Check if this directory contains both Hekatan.Common and Hekatan.Cli subdirectories
                    // This indicates the project root
                    var hasCommon = Directory.Exists(Path.Combine(currentDir.FullName, "Hekatan.Common"));
                    var hasCli = Directory.Exists(Path.Combine(currentDir.FullName, "Hekatan.Cli"));

                    if (hasCommon && hasCli)
                    {
                        LogDebug($"Found project root (has Hekatan.Common + Hekatan.Cli): {currentDir.FullName}");
                        return currentDir.FullName;
                    }

                    currentDir = currentDir.Parent;
                }
            }
            catch (Exception ex)
            {
                LogDebug($"Error finding project root: {ex.Message}");
            }

            return null;
        }

        /// <summary>
        /// Logs debug messages to temp file
        /// </summary>
        private static void LogDebug(string message)
        {
            try
            {
                var logPath = Path.Combine(Path.GetTempPath(), "calcpad_multilang_debug.txt");
                File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] {message}\n");
            }
            catch { }
        }

        /// <summary>
        /// Loads configuration from external JSON file
        /// </summary>
        public static void LoadConfig()
        {
            lock (_lock)
            {
                try
                {
                    var logPath = Path.Combine(Path.GetTempPath(), "calcpad_multilang_debug.txt");
                    File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Looking for config at: {ConfigFilePath}\n");

                    if (File.Exists(ConfigFilePath))
                    {
                        var json = File.ReadAllText(ConfigFilePath);
                        _config = JsonSerializer.Deserialize<MultLangConfig>(json) ?? CreateDefaultConfig();
                        _lastConfigLoad = DateTime.Now;
                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Config loaded. Languages count: {_config.Languages.Count}\n");
                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Has csharp: {_config.Languages.ContainsKey("csharp")}\n");
                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Languages: {string.Join(", ", _config.Languages.Keys)}\n");
                    }
                    else
                    {
                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Config file NOT found. Using default config.\n");
                        // Create default config file
                        _config = CreateDefaultConfig();
                        SaveConfig();
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error loading MultLangConfig.json: {ex.Message}");
                    _config = CreateDefaultConfig();
                }
            }
        }

        /// <summary>
        /// Saves current configuration to JSON file
        /// </summary>
        public static void SaveConfig()
        {
            try
            {
                var dir = Path.GetDirectoryName(ConfigFilePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    Directory.CreateDirectory(dir);

                var options = new JsonSerializerOptions { WriteIndented = true };
                var json = JsonSerializer.Serialize(_config, options);
                File.WriteAllText(ConfigFilePath, json);
                _lastConfigLoad = DateTime.Now;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving MultLangConfig.json: {ex.Message}");
            }
        }

        /// <summary>
        /// Creates default configuration with common languages
        /// </summary>
        private static MultLangConfig CreateDefaultConfig()
        {
            return new MultLangConfig
            {
                Languages = new Dictionary<string, LanguageDefinition>
                {
                    ["python"] = new LanguageDefinition
                    {
                        Command = "python",
                        Extension = ".py",
                        Directive = "@{python}",
                        EndDirective = "@{end python}",
                        CommentPrefix = "#",
                        Keywords = new[] { "def", "class", "import", "from", "if", "elif", "else", "for", "while", "try", "except", "with", "return", "yield", "lambda", "and", "or", "not", "in", "is", "True", "False", "None" },
                        Builtins = new[] { "print", "len", "range", "str", "int", "float", "list", "dict", "set", "tuple", "open", "input", "type", "isinstance" }
                    },
                    ["powershell"] = new LanguageDefinition
                    {
                        Command = "pwsh",
                        Extension = ".ps1",
                        Directive = "@{powershell}",
                        EndDirective = "@{end powershell}",
                        CommentPrefix = "#",
                        Keywords = new[] { "function", "param", "if", "else", "elseif", "switch", "foreach", "for", "while", "do", "try", "catch", "finally", "return", "throw" },
                        Builtins = new[] { "Write-Host", "Write-Output", "Get-Content", "Set-Content", "Get-Item", "Set-Item", "New-Item", "Remove-Item" }
                    },
                    ["octave"] = new LanguageDefinition
                    {
                        Command = "octave-gui",
                        Extension = ".m",
                        Directive = "@{octave}",
                        EndDirective = "@{end octave}",
                        CommentPrefix = "%",
                        Keywords = new[] { "function", "end", "if", "else", "elseif", "endif", "for", "endfor", "while", "endwhile", "switch", "case", "otherwise", "return" },
                        Builtins = new[] { "disp", "printf", "fprintf", "plot", "zeros", "ones", "eye", "linspace", "sin", "cos", "sqrt", "abs" },
                        RunArgs = "--no-gui --quiet \"{file}\""
                    },
                    ["julia"] = new LanguageDefinition
                    {
                        Command = "julia",
                        Extension = ".jl",
                        Directive = "@{julia}",
                        EndDirective = "@{end julia}",
                        CommentPrefix = "#",
                        Keywords = new[] { "function", "end", "if", "else", "elseif", "for", "while", "try", "catch", "finally", "return", "struct", "module", "using", "import" },
                        Builtins = new[] { "println", "print", "length", "size", "typeof", "convert", "parse", "string" }
                    },
                    ["cpp"] = new LanguageDefinition
                    {
                        Command = "g++",
                        Extension = ".cpp",
                        Directive = "@{cpp}",
                        EndDirective = "@{end cpp}",
                        CommentPrefix = "//",
                        Keywords = new[] { "int", "double", "float", "char", "void", "bool", "if", "else", "for", "while", "do", "switch", "case", "return", "class", "struct", "public", "private", "protected" },
                        Builtins = new[] { "cout", "cin", "endl", "printf", "scanf", "malloc", "free", "new", "delete" },
                        RequiresCompilation = true,
                        CompileArgs = "{input} -o {output}"
                    },
                    ["bash"] = new LanguageDefinition
                    {
                        Command = "bash",
                        Extension = ".sh",
                        Directive = "@{bash}",
                        EndDirective = "@{end bash}",
                        CommentPrefix = "#",
                        Keywords = new[] { "if", "then", "else", "elif", "fi", "for", "do", "done", "while", "until", "case", "esac", "function", "return", "exit" },
                        Builtins = new[] { "echo", "read", "printf", "cd", "pwd", "ls", "cat", "grep", "sed", "awk" }
                    },
                    ["cmd"] = new LanguageDefinition
                    {
                        Command = "cmd",
                        Extension = ".bat",
                        Directive = "@{cmd}",
                        EndDirective = "@{end cmd}",
                        CommentPrefix = "REM",
                        Keywords = new[] { "if", "else", "for", "do", "goto", "call", "exit", "set", "setlocal", "endlocal" },
                        Builtins = new[] { "echo", "dir", "cd", "copy", "move", "del", "mkdir", "rmdir", "type" }
                    },
                    ["r"] = new LanguageDefinition
                    {
                        Command = "Rscript",
                        Extension = ".R",
                        Directive = "@{r}",
                        EndDirective = "@{end r}",
                        CommentPrefix = "#",
                        Keywords = new[] { "function", "if", "else", "for", "while", "repeat", "break", "next", "return", "in", "TRUE", "FALSE", "NULL", "NA" },
                        Builtins = new[] { "print", "cat", "paste", "c", "list", "data.frame", "matrix", "length", "sum", "mean" }
                    },
                    ["markdown"] = new LanguageDefinition
                    {
                        Command = "",
                        Extension = ".md",
                        Directive = "@{markdown}",
                        EndDirective = "@{end markdown}",
                        CommentPrefix = "",
                        Keywords = Array.Empty<string>(),
                        Builtins = Array.Empty<string>()
                    },
                    ["csharp"] = new LanguageDefinition
                    {
                        Command = "dotnet",
                        Extension = ".cs",
                        Directive = "@{csharp}",
                        EndDirective = "@{end csharp}",
                        CommentPrefix = "//",
                        Keywords = new[] { "class", "using", "namespace", "public", "private", "static", "void", "int", "string", "double", "bool", "if", "else", "for", "while", "foreach", "return", "new", "var" },
                        Builtins = new[] { "Console", "WriteLine", "ReadLine", "Parse", "ToString", "Length", "Count", "Add", "Remove" },
                        RequiresCompilation = true
                    },
                    ["xaml"] = new LanguageDefinition
                    {
                        Command = "dotnet",
                        Extension = ".xaml",
                        Directive = "@{xaml}",
                        EndDirective = "@{end xaml}",
                        CommentPrefix = "<!--",
                        Keywords = Array.Empty<string>(),
                        Builtins = Array.Empty<string>(),
                        RequiresCompilation = true
                    },
                    ["wpf"] = new LanguageDefinition
                    {
                        Command = "dotnet",
                        Extension = ".xaml",
                        Directive = "@{wpf}",
                        EndDirective = "@{end wpf}",
                        CommentPrefix = "<!--",
                        Keywords = Array.Empty<string>(),
                        Builtins = Array.Empty<string>(),
                        RequiresCompilation = true
                    },
                    ["c"] = new LanguageDefinition
                    {
                        Command = "gcc",
                        Extension = ".c",
                        Directive = "@{c}",
                        EndDirective = "@{end c}",
                        CommentPrefix = "//",
                        Keywords = new[] { "int", "float", "double", "char", "void", "if", "else", "for", "while", "do", "switch", "case", "return", "struct", "typedef", "sizeof", "const", "static", "extern" },
                        Builtins = new[] { "printf", "scanf", "malloc", "free", "sizeof", "strlen", "strcpy", "strcmp" },
                        RequiresCompilation = true,
                        CompileArgs = "{input} -o {output}"
                    },
                    ["fortran"] = new LanguageDefinition
                    {
                        Command = "gfortran",
                        Extension = ".f90",
                        Directive = "@{fortran}",
                        EndDirective = "@{end fortran}",
                        CommentPrefix = "!",
                        Keywords = new[] { "program", "end", "implicit", "none", "integer", "real", "double", "character", "if", "then", "else", "do", "while", "subroutine", "function", "return", "call" },
                        Builtins = new[] { "print", "write", "read", "allocate", "deallocate" },
                        RequiresCompilation = true,
                        CompileArgs = "{input} -o {output}"
                    },
                    ["rust"] = new LanguageDefinition
                    {
                        Command = "rustc",
                        Extension = ".rs",
                        Directive = "@{rust}",
                        EndDirective = "@{end rust}",
                        CommentPrefix = "//",
                        Keywords = new[] { "fn", "let", "mut", "const", "if", "else", "for", "while", "loop", "match", "struct", "enum", "impl", "pub", "mod", "use", "return", "self", "Self" },
                        Builtins = new[] { "println", "print", "format", "vec", "String", "Option", "Result", "Box" },
                        RequiresCompilation = true,
                        CompileArgs = "{input} -o {output}"
                    },
                    ["go"] = new LanguageDefinition
                    {
                        Command = "go",
                        Extension = ".go",
                        Directive = "@{go}",
                        EndDirective = "@{end go}",
                        CommentPrefix = "//",
                        Keywords = new[] { "package", "import", "func", "var", "const", "type", "struct", "interface", "if", "else", "for", "range", "switch", "case", "return", "defer", "go", "chan" },
                        Builtins = new[] { "fmt", "println", "printf", "print", "len", "cap", "make", "new", "append" },
                        RequiresCompilation = false,
                        RunArgs = "run {input}"
                    },
                    ["lua"] = new LanguageDefinition
                    {
                        Command = "lua",
                        Extension = ".lua",
                        Directive = "@{lua}",
                        EndDirective = "@{end lua}",
                        CommentPrefix = "--",
                        Keywords = new[] { "local", "function", "end", "if", "then", "else", "elseif", "for", "while", "do", "repeat", "until", "return", "break", "in", "and", "or", "not", "nil", "true", "false" },
                        Builtins = new[] { "print", "io", "string", "table", "math", "os", "tonumber", "tostring", "type" }
                    },
                    ["perl"] = new LanguageDefinition
                    {
                        Command = "perl",
                        Extension = ".pl",
                        Directive = "@{perl}",
                        EndDirective = "@{end perl}",
                        CommentPrefix = "#",
                        Keywords = new[] { "my", "our", "local", "sub", "if", "else", "elsif", "unless", "while", "for", "foreach", "do", "return", "last", "next", "use", "require", "package" },
                        Builtins = new[] { "print", "say", "open", "close", "read", "write", "chomp", "split", "join", "push", "pop" }
                    },
                    ["ruby"] = new LanguageDefinition
                    {
                        Command = "ruby",
                        Extension = ".rb",
                        Directive = "@{ruby}",
                        EndDirective = "@{end ruby}",
                        CommentPrefix = "#",
                        Keywords = new[] { "def", "end", "class", "module", "if", "else", "elsif", "unless", "while", "for", "do", "return", "yield", "begin", "rescue", "ensure", "raise", "require", "attr_accessor" },
                        Builtins = new[] { "puts", "print", "gets", "p", "pp", "each", "map", "select", "reduce" }
                    },
                    ["php"] = new LanguageDefinition
                    {
                        Command = "php",
                        Extension = ".php",
                        Directive = "@{php}",
                        EndDirective = "@{end php}",
                        CommentPrefix = "//",
                        Keywords = new[] { "function", "class", "public", "private", "protected", "static", "if", "else", "elseif", "while", "for", "foreach", "do", "switch", "case", "return", "new", "echo", "print", "use", "namespace" },
                        Builtins = new[] { "echo", "print", "printf", "sprintf", "array", "isset", "empty", "strlen", "count" }
                    },
                    ["haskell"] = new LanguageDefinition
                    {
                        Command = "runhaskell",
                        Extension = ".hs",
                        Directive = "@{haskell}",
                        EndDirective = "@{end haskell}",
                        CommentPrefix = "--",
                        Keywords = new[] { "module", "import", "where", "let", "in", "if", "then", "else", "case", "of", "do", "data", "type", "newtype", "class", "instance", "deriving" },
                        Builtins = new[] { "main", "putStrLn", "print", "show", "read", "map", "filter", "foldr", "foldl" }
                    },
                    ["d"] = new LanguageDefinition
                    {
                        Command = "dmd",
                        Extension = ".d",
                        Directive = "@{d}",
                        EndDirective = "@{end d}",
                        CommentPrefix = "//",
                        Keywords = new[] { "void", "int", "float", "double", "char", "string", "bool", "if", "else", "for", "foreach", "while", "do", "switch", "case", "return", "import", "module", "class", "struct" },
                        Builtins = new[] { "writeln", "writef", "readln", "to", "format" },
                        RequiresCompilation = true,
                        CompileArgs = "{input} -of={output}"
                    },
                    ["ts"] = new LanguageDefinition
                    {
                        Command = "npx",
                        Extension = ".ts",
                        Directive = "@{ts}",
                        EndDirective = "@{end ts}",
                        CommentPrefix = "//",
                        Keywords = new[] { "function", "class", "interface", "type", "const", "let", "var", "if", "else", "for", "while", "do", "switch", "case", "return", "import", "export", "async", "await", "new", "extends", "implements" },
                        Builtins = new[] { "console", "log", "error", "warn", "JSON", "parse", "stringify", "Array", "Object", "String", "Number", "Boolean" },
                        RunArgs = "tsx \"{file}\""
                    },
                    ["typescript"] = new LanguageDefinition
                    {
                        Command = "npx",
                        Extension = ".ts",
                        Directive = "@{typescript}",
                        EndDirective = "@{end typescript}",
                        CommentPrefix = "//",
                        Keywords = new[] { "function", "class", "interface", "type", "const", "let", "var", "if", "else", "for", "while", "do", "switch", "case", "return", "import", "export", "async", "await", "new", "extends", "implements" },
                        Builtins = new[] { "console", "log", "error", "warn", "JSON", "parse", "stringify", "Array", "Object", "String", "Number", "Boolean" },
                        RunArgs = "tsx \"{file}\""
                    }
                },
                Settings = new MultLangSettings
                {
                    Timeout = 30000,
                    MaxOutputLines = 1000,
                    TempDirectory = "temp_multilang",
                    ShareVariables = true
                }
            };
        }

        /// <summary>
        /// Adds a new language to the configuration
        /// </summary>
        public static void AddLanguage(string name, LanguageDefinition definition)
        {
            Config.Languages[name.ToLower()] = definition;
            SaveConfig();
            _availableLanguages[name.ToLower()] = IsCommandAvailable(definition.Command);
        }

        /// <summary>
        /// Removes a language from the configuration
        /// </summary>
        public static void RemoveLanguage(string name)
        {
            var key = name.ToLower();
            if (Config.Languages.ContainsKey(key))
            {
                Config.Languages.Remove(key);
                SaveConfig();
                _availableLanguages.Remove(key);
            }
        }

        /// <summary>
        /// Checks which configured languages are available in PATH
        /// </summary>
        private static void CheckAvailableLanguages()
        {
            // Load config if not already loaded
            if (_config == null)
                LoadConfig();

            _availableLanguages.Clear();
            foreach (var (name, lang) in _config!.Languages)
            {
                _availableLanguages[name] = IsCommandAvailable(lang.Command);
            }
        }

        /// <summary>
        /// Checks if a command is available in PATH
        /// </summary>
        public static bool IsCommandAvailable(string command)
        {
            // Empty command means the language doesn't need external execution
            // (e.g., "three" which generates HTML directly, or "css" which just saves files)
            if (string.IsNullOrWhiteSpace(command))
                return true;

            try
            {
                // Try direct execution first
                var startInfo = new ProcessStartInfo
                {
                    FileName = command,
                    Arguments = "--version",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = Process.Start(startInfo);
                process?.WaitForExit(5000);
                return process != null;
            }
            catch (System.ComponentModel.Win32Exception) when (OperatingSystem.IsWindows())
            {
                // Direct start failed (e.g., tsx is a .cmd wrapper on Windows).
                // Fallback: try with cmd.exe /c wrapping.
                try
                {
                    var startInfo = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = $"/c \"{command}\" --version",
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };

                    using var process = Process.Start(startInfo);
                    process?.WaitForExit(5000);
                    return process != null;
                }
                catch
                {
                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Gets whether a specific language is available
        /// </summary>
        public static bool IsLanguageAvailable(string languageName)
        {
            if (_availableLanguages.Count == 0)
                CheckAvailableLanguages();

            var lang = languageName.ToLower();

            // Support for ts:filename or typescript:filename syntax
            if (lang.StartsWith("ts:") || lang.StartsWith("typescript:"))
            {
                // Check if base TypeScript is available
                return _availableLanguages.TryGetValue("ts", out var tsAvail) && tsAvail ||
                       _availableLanguages.TryGetValue("typescript", out var tsAvail2) && tsAvail2;
            }

            return _availableLanguages.TryGetValue(lang, out var available) && available;
        }

        /// <summary>
        /// Gets all available languages
        /// </summary>
        public static IEnumerable<string> GetAvailableLanguages()
        {
            if (_availableLanguages.Count == 0)
                CheckAvailableLanguages();

            return _availableLanguages.Where(kv => kv.Value).Select(kv => kv.Key);
        }

        /// <summary>
        /// Detects if a line contains a language directive
        /// </summary>
        public static (bool found, string languageName, bool isEnd) DetectDirective(string line)
        {
            var trimmed = line.Trim();

            // LOG: Debug first call to see what languages are loaded
            if (trimmed == "@{css}")
            {
                try
                {
                    var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                    File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] DetectDirective checking '@{{css}}'\n");
                    File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Config.Languages count: {Config.Languages.Count}\n");
                    foreach (var (n, l) in Config.Languages)
                    {
                        File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}]   Lang '{n}': directive='{l.Directive}', end='{l.EndDirective}'\n");
                    }
                }
                catch { }
            }

            foreach (var (name, lang) in Config.Languages)
            {
                // Match start directive: "@{image png base64}" should match "@{image}"
                // Remove trailing } from directive and check if line starts with it
                // But ensure we don't match "@{r}" when the line is "@{rust}"
                string startPattern = lang.Directive.TrimEnd('}');  // "@{image}" → "@{image"
                if (trimmed.StartsWith(startPattern, StringComparison.OrdinalIgnoreCase))
                {
                    // Verify the character after the pattern is '}' or whitespace or ':' (for @{ts:filename}) or end
                    int afterIdx = startPattern.Length;
                    if (afterIdx >= trimmed.Length ||
                        trimmed[afterIdx] == '}' ||
                        trimmed[afterIdx] == ':' ||  // Support for @{ts:filename}
                        char.IsWhiteSpace(trimmed[afterIdx]))
                    {
                        // For @{ts:filename}, return the full directive name including the filename part
                        string returnName = name;
                        if (afterIdx < trimmed.Length && trimmed[afterIdx] == ':')
                        {
                            // Extract the full name with filename, e.g., "ts:getColorMap"
                            var endIdx = trimmed.IndexOf('}', afterIdx);
                            if (endIdx > afterIdx)
                            {
                                returnName = name + trimmed.Substring(afterIdx, endIdx - afterIdx);
                            }
                        }
                        try
                        {
                            var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                            File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] DetectDirective MATCH: '{trimmed}' startswith '{startPattern}' (lang={returnName})\n");
                        }
                        catch { }
                        return (true, returnName, false);
                    }
                }

                // Match end directive: "@{end ts}" or "@{end ts:filename}"
                string endPattern = lang.EndDirective.TrimEnd('}');  // "@{end ts}" → "@{end ts"
                if (trimmed.StartsWith(endPattern, StringComparison.OrdinalIgnoreCase))
                {
                    int afterIdx = endPattern.Length;
                    if (afterIdx >= trimmed.Length ||
                        trimmed[afterIdx] == '}' ||
                        trimmed[afterIdx] == ':' ||  // Support for @{end ts:filename}
                        char.IsWhiteSpace(trimmed[afterIdx]))
                    {
                        string returnName = name;
                        if (afterIdx < trimmed.Length && trimmed[afterIdx] == ':')
                        {
                            var endIdx = trimmed.IndexOf('}', afterIdx);
                            if (endIdx > afterIdx)
                            {
                                returnName = name + trimmed.Substring(afterIdx, endIdx - afterIdx);
                            }
                        }
                        return (true, returnName, true);
                    }
                }

                // Match alternative end directive: "@{/ts}" as alias for "@{end ts}"
                string altEndPattern = $"@{{/{name}";  // "@{/ts"
                if (trimmed.StartsWith(altEndPattern, StringComparison.OrdinalIgnoreCase))
                {
                    int afterIdx = altEndPattern.Length;
                    if (afterIdx >= trimmed.Length ||
                        trimmed[afterIdx] == '}' ||
                        char.IsWhiteSpace(trimmed[afterIdx]))
                    {
                        return (true, name, true);
                    }
                }
            }

            return (false, string.Empty, false);
        }

        /// <summary>
        /// Extracts code blocks for each language from Hekatan code
        /// </summary>
        public static Dictionary<string, List<CodeBlock>> ExtractCodeBlocks(string code)
        {
            var blocks = new Dictionary<string, List<CodeBlock>>();
            var lines = code.Split('\n');

            string currentLanguage = null;
            string currentStartDirective = null;  // Store the original start directive
            int blockStart = -1;
            var currentBlock = new StringBuilder();

            // Track if we're inside a @{columns} block to preserve nested directives
            bool insideColumns = false;
            int columnsDepth = 0;

            try
            {
                var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                File.AppendAllText(debugPath, $"\n[{DateTime.Now:HH:mm:ss}] === ExtractCodeBlocks START ===\n");
                File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Total lines: {lines.Length}\n");
            }
            catch { }

            for (int i = 0; i < lines.Length; i++)
            {
                var (found, langName, isEnd) = DetectDirective(lines[i]);

                // LOG: First 5 lines and lines around directives
                if (i < 5 || i >= 37 && i <= 42)
                {
                    try
                    {
                        var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                        var linePreview = lines[i].Length > 50 ? lines[i].Substring(0, 50) : lines[i];
                        File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] Line {i}: DetectDirective('{linePreview}') returned: found={found}, lang='{langName}', isEnd={isEnd}, insideColumns={insideColumns}\n");
                    }
                    catch { }
                }

                if (found)
                {
                    try
                    {
                        var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                        File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Line {i}: Directive found - lang='{langName}', isEnd={isEnd}, currentLang='{currentLanguage}', insideColumns={insideColumns}, depth={columnsDepth}\n");
                    }
                    catch { }

                    // Special handling for @{columns} - track depth to preserve nested directives
                    if (langName.StartsWith("columns", StringComparison.OrdinalIgnoreCase))
                    {
                        if (!isEnd)
                        {
                            insideColumns = true;
                            columnsDepth++;

                            try
                            {
                                var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                                File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Entering @{{columns}} block, depth now = {columnsDepth}\n");
                            }
                            catch { }
                        }
                        else
                        {
                            columnsDepth--;
                            if (columnsDepth == 0)
                            {
                                insideColumns = false;
                            }

                            try
                            {
                                var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                                File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Exiting @{{columns}} block, depth now = {columnsDepth}\n");
                            }
                            catch { }
                        }
                    }

                    // If we're inside columns and this is a nested directive (not the columns directive itself), treat as content
                    if (insideColumns && currentLanguage != null &&
                        currentLanguage.StartsWith("columns", StringComparison.OrdinalIgnoreCase) &&
                        !langName.StartsWith("columns", StringComparison.OrdinalIgnoreCase))
                    {
                        // Add the directive line as content (preserve nested directives)
                        currentBlock.AppendLine(lines[i]);
                        continue;
                    }

                    // If we're inside @{code} or @{ucode} wrapper and this is a nested directive, treat as content
                    // This allows @{code} and @{ucode} to wrap @{html-ifc} and other blocks
                    if (currentLanguage != null &&
                        (currentLanguage.Equals("code", StringComparison.OrdinalIgnoreCase) ||
                         currentLanguage.Equals("ucode", StringComparison.OrdinalIgnoreCase)) &&
                        !langName.Equals("code", StringComparison.OrdinalIgnoreCase) &&
                        !langName.Equals("ucode", StringComparison.OrdinalIgnoreCase))
                    {
                        // Add the directive line as content (preserve nested directives like @{html-ifc})
                        currentBlock.AppendLine(lines[i]);
                        continue;
                    }

                    // Match end directive: exact match OR base language match for parameterized blocks
                    // e.g., currentLanguage="theme:black" should close on @{end theme} (langName="theme")
                    bool isMatchingEnd = isEnd && (
                        currentLanguage == langName ||
                        (currentLanguage.Contains(':') &&
                         currentLanguage.Substring(0, currentLanguage.IndexOf(':')) == langName)
                    );

                    if (isMatchingEnd)
                    {
                        // End of block
                        if (!blocks.ContainsKey(currentLanguage))
                            blocks[currentLanguage] = new List<CodeBlock>();

                        blocks[currentLanguage].Add(new CodeBlock
                        {
                            Language = currentLanguage,
                            Code = currentBlock.ToString().TrimEnd(),
                            StartLine = blockStart,
                            EndLine = i,
                            StartDirective = currentStartDirective ?? string.Empty
                        });

                        try
                        {
                            var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                            File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Block closed: '{currentLanguage}', code length={currentBlock.Length}, directive='{currentStartDirective}'\n");
                        }
                        catch { }

                        currentLanguage = null;
                        currentStartDirective = null;
                        currentBlock.Clear();
                    }
                    else if (!isEnd && currentLanguage == null)
                    {
                        // Start of block
                        currentLanguage = langName;
                        currentStartDirective = lines[i].Trim();  // Save original directive (e.g., "@{image png base64}")
                        blockStart = i;

                        try
                        {
                            var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                            File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Block started: '{currentLanguage}', directive: '{currentStartDirective}'\n");
                        }
                        catch { }
                    }
                }
                else if (currentLanguage != null)
                {
                    currentBlock.AppendLine(lines[i]);
                }
            }

            // If a block was opened but never closed (no @{end lang}), auto-close it at end of file.
            // This allows @{python}, @{cpp}, etc. to work without requiring @{end python}.
            // The @{end lang} tag is only needed to switch back to Hekatan parser mid-file.
            if (currentLanguage != null && currentBlock.Length > 0)
            {
                if (!blocks.ContainsKey(currentLanguage))
                    blocks[currentLanguage] = new List<CodeBlock>();

                blocks[currentLanguage].Add(new CodeBlock
                {
                    Language = currentLanguage,
                    Code = currentBlock.ToString().TrimEnd(),
                    StartLine = blockStart,
                    EndLine = lines.Length - 1,
                    StartDirective = currentStartDirective ?? string.Empty
                });

                try
                {
                    var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                    File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Block auto-closed (no @{{end {currentLanguage}}}): '{currentLanguage}', code length={currentBlock.Length}\n");
                }
                catch { }

                currentLanguage = null;
                currentStartDirective = null;
                currentBlock.Clear();
            }

            try
            {
                var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] === ExtractCodeBlocks END ===\n");
                File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Total language types found: {blocks.Count}\n");
                foreach (var lang in blocks.Keys)
                {
                    File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}]   - '{lang}': {blocks[lang].Count} block(s)\n");
                }
            }
            catch { }

            return blocks;
        }

        /// <summary>
        /// Checks if there's any language code in the given Hekatan code
        /// </summary>
        public static bool HasLanguageCode(string code)
        {
            try
            {
                var logPath = Path.Combine(Path.GetTempPath(), "calcpad_haslangcode_debug.txt");
                File.AppendAllText(logPath, $"\n[{DateTime.Now:HH:mm:ss}] === HasLanguageCode called ===\n");
                File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Code length: {code.Length}\n");
                File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] First 200 chars: {(code.Length > 200 ? code.Substring(0, 200) : code)}\n");
                File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Config.Languages count: {Config.Languages.Count}\n");

                foreach (var lang in Config.Languages.Values)
                {
                    File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Checking directive: '{lang.Directive}'\n");

                    // Special logging for @{image}
                    if (lang.Directive == "@{image}")
                    {
                        // Show exact bytes of directive
                        var directiveBytes = System.Text.Encoding.UTF8.GetBytes(lang.Directive);
                        var directiveHex = BitConverter.ToString(directiveBytes).Replace("-", " ");
                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Directive bytes: {directiveHex}\n");
                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Directive length: {lang.Directive.Length}\n");

                        var debugIdx = code.IndexOf("@{", StringComparison.OrdinalIgnoreCase);
                        if (debugIdx >= 0)
                        {
                            var snippet = code.Substring(debugIdx, Math.Min(30, code.Length - debugIdx));
                            File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Found '@{{' at index {debugIdx}: '{snippet}'\n");

                            // Show bytes of what's at that position
                            var codeBytes = System.Text.Encoding.UTF8.GetBytes(snippet.Substring(0, Math.Min(8, snippet.Length)));
                            var codeHex = BitConverter.ToString(codeBytes).Replace("-", " ");
                            File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Code bytes at {debugIdx}: {codeHex}\n");
                        }

                        // Check different variations
                        bool hasAtBrace = code.Contains("@{");
                        bool hasImage = code.Contains("image", StringComparison.OrdinalIgnoreCase);
                        bool hasDirective = code.Contains(lang.Directive, StringComparison.OrdinalIgnoreCase);
                        bool hasDirectiveSimple = code.IndexOf("@{image") >= 0;

                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Contains '@{{': {hasAtBrace}\n");
                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Contains 'image': {hasImage}\n");
                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] Contains directive '@{{image}}': {hasDirective}\n");
                        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] IndexOf '@{{image' >= 0: {hasDirectiveSimple}\n");
                    }

                    // Check if directive appears in code
                    // For directives like "@{image}", also match "@{image " (with space or other chars after)
                    // But we need to ensure we don't match "@{r}" when looking for "@{rust}"
                    string searchPattern = lang.Directive.TrimEnd('}');  // "@{image}" → "@{image"
                    int idx = code.IndexOf(searchPattern, StringComparison.OrdinalIgnoreCase);
                    while (idx >= 0)
                    {
                        // Check if the next character after the pattern is '}', ':', or whitespace or end of string
                        // The ':' supports @{ts:filename} syntax for TypeScript modules
                        int afterIdx = idx + searchPattern.Length;
                        if (afterIdx >= code.Length ||
                            code[afterIdx] == '}' ||
                            code[afterIdx] == ':' ||  // Support for @{ts:filename}
                            char.IsWhiteSpace(code[afterIdx]))
                        {
                            File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] FOUND: '{searchPattern}' in code at {idx}! Returning TRUE\n");
                            return true;
                        }
                        // Try to find the next occurrence
                        idx = code.IndexOf(searchPattern, afterIdx, StringComparison.OrdinalIgnoreCase);
                    }
                }
                File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] No directives found. Returning FALSE\n");
            }
            catch { }

            return false;
        }

        /// <summary>
        /// Reloads configuration from file (force reload)
        /// </summary>
        public static void ReloadConfig()
        {
            _lastConfigLoad = DateTime.MinValue;
            LoadConfig();
        }
    }

    /// <summary>
    /// Represents a block of code in a specific language
    /// </summary>
    public class CodeBlock
    {
        public string Language { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public int StartLine { get; set; }
        public int EndLine { get; set; }
        /// <summary>
        /// The original start directive line (e.g., "@{image png base64}")
        /// Used to extract additional parameters like image format
        /// </summary>
        public string StartDirective { get; set; } = string.Empty;
    }
}
