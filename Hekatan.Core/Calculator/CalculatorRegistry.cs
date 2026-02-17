using System;
using System.Collections.Frozen;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace Hekatan.Core
{
    /// <summary>
    /// Registry that loads operator and function definitions from JSON.
    /// Acts as a bridge between ParserLoader (JSON) and Calculator (evaluation).
    /// This allows extending Hekatan with new functions/operators without modifying C# code.
    /// </summary>
    public class CalculatorRegistry
    {
        private static CalculatorRegistry _instance;
        private static readonly object _lock = new();

        private bool _isLoaded;
        private string _configPath;

        // Dynamic dictionaries that can be extended from JSON
        private Dictionary<char, int> _operatorIndex = new();
        private Dictionary<string, int> _functionIndex = new();
        private Dictionary<string, int> _function2Index = new();
        private Dictionary<string, int> _function3Index = new();
        private Dictionary<string, int> _multiFunctionIndex = new();
        private Dictionary<string, int> _interpolationIndex = new();

        // Operator info
        private List<sbyte> _operatorOrder = new();
        private List<char> _operators = new();
        private List<bool> _isZeroPreserving = new();

        // Function aliases (e.g., "sen" -> "sin" for Spanish)
        private Dictionary<string, string> _functionAliases = new();

        // Custom functions defined in JSON (evaluated via delegate)
        private Dictionary<string, Func<double, double>> _customFunctions = new();
        private Dictionary<string, Func<double, double, double>> _customFunctions2 = new();

        public static CalculatorRegistry Instance
        {
            get
            {
                if (_instance == null)
                {
                    lock (_lock)
                    {
                        _instance ??= new CalculatorRegistry();
                    }
                }
                return _instance;
            }
        }

        public bool IsLoaded => _isLoaded;
        public List<string> Errors { get; } = new();
        public List<string> Warnings { get; } = new();

        // Read-only access to registries
        public IReadOnlyDictionary<char, int> OperatorIndex => _operatorIndex;
        public IReadOnlyDictionary<string, int> FunctionIndex => _functionIndex;
        public IReadOnlyDictionary<string, int> Function2Index => _function2Index;
        public IReadOnlyDictionary<string, int> Function3Index => _function3Index;
        public IReadOnlyDictionary<string, int> MultiFunctionIndex => _multiFunctionIndex;
        public IReadOnlyDictionary<string, int> InterpolationIndex => _interpolationIndex;
        public IReadOnlyList<sbyte> OperatorOrder => _operatorOrder;
        public IReadOnlyList<char> Operators => _operators;
        public IReadOnlyDictionary<string, string> FunctionAliases => _functionAliases;

        private CalculatorRegistry()
        {
            // Initialize with defaults from Calculator class
            InitializeDefaults();
        }

        /// <summary>
        /// Initialize with the same values as Calculator.cs (backward compatibility)
        /// </summary>
        private void InitializeDefaults()
        {
            // Copy operator definitions from Calculator
            _operatorIndex = new Dictionary<char, int>
            {
                { '^', 0 }, { '/', 1 }, { '÷', 1 }, { '\\', 2 }, { '⦼', 3 },
                { '*', 4 }, { '-', 5 }, { '+', 6 }, { '<', 7 }, { '>', 8 },
                { '≤', 9 }, { '≥', 10 }, { '≡', 11 }, { '≠', 12 },
                { '∧', 13 }, { '∨', 14 }, { '⊕', 15 }, { '=', 16 }, { '∠', 17 }
            };

            _operators = new List<char> { '^', '/', '\\', '⦼', '*', '-', '+', '<', '>', '≤', '≥', '≡', '≠', '∧', '∨', '⊕', '=', '∠' };
            _operatorOrder = new List<sbyte> { 0, 4, 4, 4, 4, 5, 6, 7, 7, 7, 7, 7, 7, 8, 9, 9, 10, 3 };
            _isZeroPreserving = new List<bool> { false, false, false, false, true, true, true, true, true, false, false, false, true, true, true, true, true, true };

            // Copy function definitions from Calculator
            _functionIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                { "sin", 0 }, { "cos", 1 }, { "tan", 2 }, { "csc", 3 }, { "sec", 4 }, { "cot", 5 },
                { "asin", 6 }, { "acos", 7 }, { "atan", 8 }, { "acsc", 9 }, { "asec", 10 }, { "acot", 11 },
                { "sinh", 12 }, { "cosh", 13 }, { "tanh", 14 }, { "csch", 15 }, { "sech", 16 }, { "coth", 17 },
                { "asinh", 18 }, { "acosh", 19 }, { "atanh", 20 }, { "acsch", 21 }, { "asech", 22 }, { "acoth", 23 },
                { "log", 24 }, { "ln", 25 }, { "log_2", 26 }, { "exp", 27 },
                { "abs", 28 }, { "sign", 29 }, { "sqr", 30 }, { "sqrt", 31 }, { "cbrt", 32 },
                { "round", 33 }, { "floor", 34 }, { "ceiling", 35 }, { "trunc", 36 },
                { "re", 37 }, { "im", 38 }, { "phase", 39 }, { "conj", 40 },
                { "random", 41 }, { "fact", 42 }, { "‐", 43 }, { "not", 44 }, { "timer", 45 }, { "suma", 46 }
            };

            _function2Index = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                { "atan2", 0 }, { "root", 1 }, { "mod", 2 }, { "mandelbrot", 3 }
            };

            _function3Index = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                { "if", 0 }
            };

            _multiFunctionIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                { "min", 0 }, { "max", 1 }, { "sum", 2 }, { "sumsq", 3 }, { "srss", 4 },
                { "average", 5 }, { "product", 6 }, { "mean", 7 }, { "switch", 8 },
                { "and", 9 }, { "or", 10 }, { "xor", 11 }, { "gcd", 12 }, { "lcm", 13 }
            };

            _interpolationIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                { "take", 0 }, { "line", 1 }, { "spline", 2 }
            };
        }

        /// <summary>
        /// Load additional definitions from JSON file
        /// </summary>
        public bool LoadFromJson(string configPath = null)
        {
            _configPath = configPath ?? FindConfigPath();

            // Debug: Write to file for troubleshooting
            try
            {
                var debugPath = Path.Combine(AppContext.BaseDirectory, "registry_debug.txt");
                File.WriteAllText(debugPath, $"BaseDirectory: {AppContext.BaseDirectory}\nConfigPath: {_configPath}\nExists: {File.Exists(_configPath ?? "null")}\n");
            }
            catch { /* ignore */ }

            if (string.IsNullOrEmpty(_configPath) || !File.Exists(_configPath))
            {
                Warnings.Add($"ParserDefinition.json not found at: {_configPath}");
                return false;
            }

            try
            {
                var json = File.ReadAllText(_configPath);
                var config = JsonSerializer.Deserialize<ParserDefinitionConfig>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    ReadCommentHandling = JsonCommentHandling.Skip
                });

                if (config?.Parsers == null)
                {
                    Warnings.Add("No parsers found in config");
                    return false;
                }

                // Find the active parser (calcpad by default)
                var activeParserName = config.ActiveParser ?? "calcpad";
                if (!config.Parsers.TryGetValue(activeParserName, out var activeParser))
                {
                    activeParser = config.Parsers.Values.FirstOrDefault();
                }

                if (activeParser != null)
                {
                    LoadOperators(activeParser);
                    LoadFunctions(activeParser);
                }

                // Load aliases if defined
                if (config.Aliases != null)
                {
                    var language = config.Settings?.DefaultLanguage ?? "spanish";
                    if (config.Aliases.TryGetValue(language, out var aliases))
                    {
                        foreach (var (alias, target) in aliases)
                        {
                            _functionAliases[alias.ToLowerInvariant()] = target.ToLowerInvariant();
                        }
                    }

                    // Debug: Append to debug file
                    try
                    {
                        var debugPath = Path.Combine(AppContext.BaseDirectory, "registry_debug.txt");
                        File.AppendAllText(debugPath, $"\nLanguage: {language}\nAliases count: {config.Aliases.Count}\nLoaded aliases: {_functionAliases.Count}\n");
                        foreach (var a in _functionAliases.Take(5))
                        {
                            File.AppendAllText(debugPath, $"  {a.Key} -> {a.Value}\n");
                        }
                    }
                    catch { /* ignore */ }
                }

                _isLoaded = true;
                return true;
            }
            catch (Exception ex)
            {
                Errors.Add($"Error loading JSON config: {ex.Message}");
                return false;
            }
        }

        private string FindConfigPath()
        {
            // Try multiple locations - from most specific to most general
            var baseDir = AppContext.BaseDirectory;
            var locations = new[]
            {
                // Direct location in output directory
                Path.Combine(baseDir, "Plugins", "ParserDefinition.json"),
                // Relative to output (for dotnet run scenarios)
                Path.Combine(baseDir, "..", "..", "..", "..", "Hekatan.Common", "Plugins", "ParserDefinition.json"),
                // Current working directory
                Path.Combine(Environment.CurrentDirectory, "Plugins", "ParserDefinition.json"),
                // Relative to current directory (development)
                Path.Combine(Environment.CurrentDirectory, "Hekatan.Common", "Plugins", "ParserDefinition.json"),
                // AppDomain base
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Plugins", "ParserDefinition.json"),
            };

            foreach (var path in locations)
            {
                var fullPath = Path.GetFullPath(path);
                if (File.Exists(fullPath))
                    return fullPath;
            }

            // Debug: add warning about searched paths
            Warnings.Add($"ParserDefinition.json not found. Searched: {string.Join("; ", locations.Select(Path.GetFullPath))}");
            return null;
        }

        private void LoadOperators(ParserConfig parser)
        {
            if (parser.Operators == null) return;

            foreach (var category in parser.Operators.Values)
            {
                foreach (var (symbol, info) in category)
                {
                    if (symbol.Length == 1)
                    {
                        var c = symbol[0];
                        if (!_operatorIndex.ContainsKey(c))
                        {
                            var newIndex = _operators.Count;
                            _operatorIndex[c] = newIndex;
                            _operators.Add(c);
                            _operatorOrder.Add((sbyte)(info.Precedence ?? 5));
                            _isZeroPreserving.Add(info.ZeroPreserving ?? true);
                        }
                    }
                }
            }
        }

        private void LoadFunctions(ParserConfig parser)
        {
            if (parser.Functions == null) return;

            foreach (var category in parser.Functions.Values)
            {
                foreach (var (name, info) in category)
                {
                    var lowerName = name.ToLowerInvariant();
                    var argCount = info.Args ?? 1;

                    // Skip if already exists
                    if (_functionIndex.ContainsKey(lowerName) ||
                        _function2Index.ContainsKey(lowerName) ||
                        _function3Index.ContainsKey(lowerName) ||
                        _multiFunctionIndex.ContainsKey(lowerName))
                    {
                        continue;
                    }

                    // Register based on argument count
                    if (argCount == 1)
                    {
                        var newIndex = _functionIndex.Count;
                        _functionIndex[lowerName] = newIndex;
                    }
                    else if (argCount == 2)
                    {
                        var newIndex = _function2Index.Count;
                        _function2Index[lowerName] = newIndex;
                    }
                    else if (argCount == 3)
                    {
                        var newIndex = _function3Index.Count;
                        _function3Index[lowerName] = newIndex;
                    }
                    else if (argCount < 0) // Variable args indicated by negative
                    {
                        var newIndex = _multiFunctionIndex.Count;
                        _multiFunctionIndex[lowerName] = newIndex;
                    }

                    // Handle alias
                    if (!string.IsNullOrEmpty(info.Alias))
                    {
                        _functionAliases[lowerName] = info.Alias.ToLowerInvariant();
                    }
                }
            }
        }

        /// <summary>
        /// Check if a function name exists (including aliases)
        /// </summary>
        public bool IsFunction(string name)
        {
            var lowerName = name.ToLowerInvariant();
            if (_functionIndex.ContainsKey(lowerName))
                return true;

            // Check alias
            if (_functionAliases.TryGetValue(lowerName, out var target))
                return _functionIndex.ContainsKey(target);

            return false;
        }

        /// <summary>
        /// Get function index, resolving aliases
        /// </summary>
        public int GetFunctionIndex(string name)
        {
            var lowerName = name.ToLowerInvariant();
            if (_functionIndex.TryGetValue(lowerName, out var index))
                return index;

            // Try alias
            if (_functionAliases.TryGetValue(lowerName, out var target))
            {
                if (_functionIndex.TryGetValue(target, out index))
                    return index;
            }

            return -1;
        }

        /// <summary>
        /// Check if a name is any type of function
        /// </summary>
        public bool IsAnyFunction(string name)
        {
            var lowerName = name.ToLowerInvariant();
            return _functionIndex.ContainsKey(lowerName) ||
                   _function2Index.ContainsKey(lowerName) ||
                   _function3Index.ContainsKey(lowerName) ||
                   _multiFunctionIndex.ContainsKey(lowerName) ||
                   _interpolationIndex.ContainsKey(lowerName) ||
                   _functionAliases.ContainsKey(lowerName);
        }

        /// <summary>
        /// Get the operator order (precedence) by index
        /// </summary>
        public sbyte GetOperatorOrder(int index)
        {
            if (index >= 0 && index < _operatorOrder.Count)
                return _operatorOrder[index];
            return 0;
        }

        /// <summary>
        /// Check if operator preserves zero
        /// </summary>
        public bool IsZeroPreservingOperator(int index)
        {
            if (index >= 0 && index < _isZeroPreserving.Count)
                return _isZeroPreserving[index];
            return true;
        }

        /// <summary>
        /// Register a custom function at runtime
        /// </summary>
        public void RegisterCustomFunction(string name, Func<double, double> func)
        {
            var lowerName = name.ToLowerInvariant();
            _customFunctions[lowerName] = func;

            if (!_functionIndex.ContainsKey(lowerName))
            {
                var newIndex = _functionIndex.Count;
                _functionIndex[lowerName] = newIndex;
            }
        }

        /// <summary>
        /// Register a custom 2-arg function at runtime
        /// </summary>
        public void RegisterCustomFunction2(string name, Func<double, double, double> func)
        {
            var lowerName = name.ToLowerInvariant();
            _customFunctions2[lowerName] = func;

            if (!_function2Index.ContainsKey(lowerName))
            {
                var newIndex = _function2Index.Count;
                _function2Index[lowerName] = newIndex;
            }
        }

        /// <summary>
        /// Try to evaluate a custom function
        /// </summary>
        public bool TryEvaluateCustom(string name, double arg, out double result)
        {
            var lowerName = name.ToLowerInvariant();
            if (_customFunctions.TryGetValue(lowerName, out var func))
            {
                result = func(arg);
                return true;
            }
            result = double.NaN;
            return false;
        }

        /// <summary>
        /// Try to evaluate a custom 2-arg function
        /// </summary>
        public bool TryEvaluateCustom2(string name, double arg1, double arg2, out double result)
        {
            var lowerName = name.ToLowerInvariant();
            if (_customFunctions2.TryGetValue(lowerName, out var func))
            {
                result = func(arg1, arg2);
                return true;
            }
            result = double.NaN;
            return false;
        }

        /// <summary>
        /// Reload configuration from JSON
        /// </summary>
        public void Reload()
        {
            _isLoaded = false;
            InitializeDefaults();
            LoadFromJson(_configPath);
        }
    }

    #region JSON Configuration Classes

    internal class ParserDefinitionConfig
    {
        public string Schema { get; set; }
        public string Version { get; set; }
        public Dictionary<string, ParserConfig> Parsers { get; set; }
        public string ActiveParser { get; set; }
        public Dictionary<string, Dictionary<string, string>> Aliases { get; set; }
        public ParserSettingsConfig Settings { get; set; }
    }

    internal class ParserConfig
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public bool Enabled { get; set; }
        public bool IsDefault { get; set; }
        public Dictionary<string, Dictionary<string, OperatorConfig>> Operators { get; set; }
        public Dictionary<string, Dictionary<string, FunctionConfig>> Functions { get; set; }
        public Dictionary<string, ConstantConfig> Constants { get; set; }
    }

    internal class OperatorConfig
    {
        public string Name { get; set; }
        public int? Precedence { get; set; }
        public string Associativity { get; set; }
        public bool? ZeroPreserving { get; set; }
    }

    internal class FunctionConfig
    {
        public int? Args { get; set; }
        public string Description { get; set; }
        public string Alias { get; set; }
    }

    internal class ConstantConfig
    {
        public double Value { get; set; }
        public string[] Aliases { get; set; }
    }

    internal class ParserSettingsConfig
    {
        public string DefaultLanguage { get; set; }
        public bool EnableAliases { get; set; }
    }

    #endregion
}
