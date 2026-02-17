using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Hekatan.Common.Plugins
{
    /// <summary>
    /// Manages loading and execution of plugin DLLs for Hekatan.
    /// Similar to SMath Studio's plugin system but configured via JSON.
    /// </summary>
    public class PluginManager
    {
        private readonly Dictionary<string, PluginInfo> _loadedPlugins = new();
        private readonly Dictionary<string, IHekatanFunction> _functions = new();
        private readonly Dictionary<string, IHekatanSymbolic> _symbolicFunctions = new();
        private readonly Dictionary<string, IHekatanMatrix> _matrixFunctions = new();
        private PluginConfig _config;
        private readonly string _configPath;

        public IReadOnlyDictionary<string, PluginInfo> LoadedPlugins => _loadedPlugins;
        public IReadOnlyDictionary<string, IHekatanFunction> Functions => _functions;
        public List<string> Errors { get; } = new();
        public List<string> Warnings { get; } = new();

        public PluginManager(string configPath = null)
        {
            _configPath = configPath ?? Path.Combine(
                Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),
                "Plugins", "PluginConfig.json");
        }

        /// <summary>
        /// Loads the plugin configuration from JSON file.
        /// </summary>
        public bool LoadConfig()
        {
            try
            {
                if (!File.Exists(_configPath))
                {
                    Warnings.Add($"Plugin config not found: {_configPath}");
                    return false;
                }

                var json = File.ReadAllText(_configPath);
                _config = JsonSerializer.Deserialize<PluginConfig>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    ReadCommentHandling = JsonCommentHandling.Skip
                });

                return _config != null;
            }
            catch (Exception ex)
            {
                Errors.Add($"Error loading plugin config: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Loads all enabled plugins from the configuration.
        /// </summary>
        public void LoadPlugins()
        {
            if (_config?.Plugins == null) return;

            foreach (var (key, plugin) in _config.Plugins)
            {
                if (!plugin.Enabled) continue;

                try
                {
                    LoadPlugin(key, plugin);
                }
                catch (Exception ex)
                {
                    Errors.Add($"Error loading plugin '{key}': {ex.Message}");
                }
            }

            // Load custom user plugins
            if (_config.CustomPlugins?.AutoLoad == true)
            {
                LoadCustomPlugins();
            }
        }

        /// <summary>
        /// Loads a single plugin from its definition.
        /// </summary>
        private void LoadPlugin(string key, PluginDefinition definition)
        {
            var assemblyPath = ResolveAssemblyPath(definition.AssemblyPath);
            if (string.IsNullOrEmpty(assemblyPath) || !File.Exists(assemblyPath))
            {
                // Try to load from NuGet packages
                assemblyPath = ResolveNuGetAssembly(definition.AssemblyPath);
            }

            if (string.IsNullOrEmpty(assemblyPath) || !File.Exists(assemblyPath))
            {
                Warnings.Add($"Assembly not found for plugin '{key}': {definition.AssemblyPath}");
                return;
            }

            var assembly = Assembly.LoadFrom(assemblyPath);
            var pluginInfo = new PluginInfo
            {
                Key = key,
                Definition = definition,
                Assembly = assembly,
                LoadedAt = DateTime.Now
            };

            _loadedPlugins[key] = pluginInfo;

            // Register functions from this plugin
            RegisterPluginFunctions(pluginInfo);
        }

        /// <summary>
        /// Registers all functions defined in the plugin.
        /// </summary>
        private void RegisterPluginFunctions(PluginInfo plugin)
        {
            if (plugin.Definition.Functions == null) return;

            foreach (var funcDef in plugin.Definition.Functions)
            {
                try
                {
                    var wrapper = CreateFunctionWrapper(plugin, funcDef);
                    if (wrapper != null)
                    {
                        _functions[funcDef.HekatanName] = wrapper;
                    }
                }
                catch (Exception ex)
                {
                    Warnings.Add($"Could not register function '{funcDef.HekatanName}': {ex.Message}");
                }
            }
        }

        /// <summary>
        /// Creates a wrapper for calling the plugin function.
        /// </summary>
        private IHekatanFunction CreateFunctionWrapper(PluginInfo plugin, FunctionDefinition funcDef)
        {
            var impl = funcDef.Implementation;
            if (impl == null) return null;

            Type targetType = null;
            MethodInfo method = null;

            if (impl.Type == "static")
            {
                var fullTypeName = $"{plugin.Definition.Namespace}.{impl.Class}";
                targetType = plugin.Assembly.GetType(fullTypeName);
                if (targetType == null)
                {
                    // Try without namespace prefix
                    targetType = plugin.Assembly.GetTypes()
                        .FirstOrDefault(t => t.Name == impl.Class);
                }

                if (targetType != null)
                {
                    method = targetType.GetMethod(impl.Method,
                        BindingFlags.Public | BindingFlags.Static);
                }
            }
            else if (impl.Type == "extension")
            {
                // Extension methods are harder - need to find them in the assembly
                method = plugin.Assembly.GetTypes()
                    .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Static))
                    .FirstOrDefault(m => m.Name == impl.Method &&
                                         m.IsDefined(typeof(System.Runtime.CompilerServices.ExtensionAttribute)));
            }

            if (method == null)
            {
                Warnings.Add($"Method '{impl.Method}' not found for function '{funcDef.HekatanName}'");
                return null;
            }

            return new DynamicFunctionWrapper(funcDef.HekatanName, method, targetType);
        }

        /// <summary>
        /// Loads user-defined plugins from custom paths.
        /// </summary>
        private void LoadCustomPlugins()
        {
            if (_config.CustomPlugins?.SearchPaths == null) return;

            foreach (var pathTemplate in _config.CustomPlugins.SearchPaths)
            {
                var path = Environment.ExpandEnvironmentVariables(pathTemplate);
                if (!Directory.Exists(path)) continue;

                foreach (var dllFile in Directory.GetFiles(path, "*.dll"))
                {
                    try
                    {
                        LoadCustomPlugin(dllFile);
                    }
                    catch (Exception ex)
                    {
                        Warnings.Add($"Error loading custom plugin '{dllFile}': {ex.Message}");
                    }
                }
            }
        }

        /// <summary>
        /// Loads a custom plugin DLL that implements Hekatan interfaces.
        /// </summary>
        private void LoadCustomPlugin(string dllPath)
        {
            var assembly = Assembly.LoadFrom(dllPath);
            var types = assembly.GetExportedTypes();

            // Find types implementing IHekatanFunction
            foreach (var type in types.Where(t => typeof(IHekatanFunction).IsAssignableFrom(t) && !t.IsInterface))
            {
                var instance = (IHekatanFunction)Activator.CreateInstance(type);
                _functions[instance.Name] = instance;
            }

            // Find types implementing IHekatanSymbolic
            foreach (var type in types.Where(t => typeof(IHekatanSymbolic).IsAssignableFrom(t) && !t.IsInterface))
            {
                var instance = (IHekatanSymbolic)Activator.CreateInstance(type);
                _symbolicFunctions[instance.Name] = instance;
            }

            // Find types implementing IHekatanMatrix
            foreach (var type in types.Where(t => typeof(IHekatanMatrix).IsAssignableFrom(t) && !t.IsInterface))
            {
                var instance = (IHekatanMatrix)Activator.CreateInstance(type);
                _matrixFunctions[instance.Name] = instance;
            }
        }

        /// <summary>
        /// Resolves the full path to an assembly.
        /// </summary>
        private string ResolveAssemblyPath(string assemblyName)
        {
            // Check if it's an absolute path
            if (Path.IsPathRooted(assemblyName) && File.Exists(assemblyName))
                return assemblyName;

            // Check relative to config directory
            var configDir = Path.GetDirectoryName(_configPath);
            var relativePath = Path.Combine(configDir, assemblyName);
            if (File.Exists(relativePath))
                return relativePath;

            // Check in application directory
            var appDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            var appPath = Path.Combine(appDir, assemblyName);
            if (File.Exists(appPath))
                return appPath;

            return null;
        }

        /// <summary>
        /// Tries to resolve assembly from NuGet packages.
        /// </summary>
        private string ResolveNuGetAssembly(string assemblyName)
        {
            var packageName = Path.GetFileNameWithoutExtension(assemblyName).ToLowerInvariant();
            var nugetPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".nuget", "packages", packageName);

            if (!Directory.Exists(nugetPath))
                return null;

            // Get latest version
            var versionDirs = Directory.GetDirectories(nugetPath)
                .OrderByDescending(d => d)
                .ToArray();

            foreach (var versionDir in versionDirs)
            {
                // Try to find the DLL in lib folder
                var libPath = Path.Combine(versionDir, "lib");
                if (!Directory.Exists(libPath)) continue;

                var frameworkDirs = Directory.GetDirectories(libPath)
                    .Where(d => Path.GetFileName(d).StartsWith("net"))
                    .OrderByDescending(d => d)
                    .ToArray();

                foreach (var fwDir in frameworkDirs)
                {
                    var dllPath = Path.Combine(fwDir, assemblyName);
                    if (File.Exists(dllPath))
                        return dllPath;
                }
            }

            return null;
        }

        /// <summary>
        /// Evaluates a function by name with given arguments.
        /// </summary>
        public double EvaluateFunction(string name, params double[] args)
        {
            if (_functions.TryGetValue(name, out var func))
            {
                return func.Evaluate(args);
            }
            throw new InvalidOperationException($"Function '{name}' not found");
        }

        /// <summary>
        /// Evaluates a symbolic expression.
        /// </summary>
        public string EvaluateSymbolic(string name, string expression)
        {
            if (_symbolicFunctions.TryGetValue(name, out var func))
            {
                return func.Transform(expression);
            }
            throw new InvalidOperationException($"Symbolic function '{name}' not found");
        }

        /// <summary>
        /// Checks if a function is available.
        /// </summary>
        public bool HasFunction(string name) => _functions.ContainsKey(name);

        /// <summary>
        /// Gets all available function names.
        /// </summary>
        public IEnumerable<string> GetFunctionNames() => _functions.Keys;
    }

    #region Configuration Classes

    public class PluginConfig
    {
        public Dictionary<string, PluginDefinition> Plugins { get; set; }
        public Dictionary<string, EngineDefinition> Engines { get; set; }
        public CustomPluginSettings CustomPlugins { get; set; }
        public Dictionary<string, InterfaceDefinition> Interfaces { get; set; }
        public PluginSettings Settings { get; set; }
    }

    public class PluginDefinition
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public string AssemblyPath { get; set; }
        public string Namespace { get; set; }
        public bool Enabled { get; set; }
        public string Directive { get; set; }
        public string EndDirective { get; set; }
        public List<FunctionDefinition> Functions { get; set; }
    }

    public class FunctionDefinition
    {
        public string HekatanName { get; set; }
        public string Description { get; set; }
        public string Signature { get; set; }
        public string ReturnType { get; set; }
        public ImplementationInfo Implementation { get; set; }
    }

    public class ImplementationInfo
    {
        public string Type { get; set; }  // "static" or "extension"
        public string Class { get; set; }
        public string Method { get; set; }
    }

    public class CustomPluginSettings
    {
        public string Description { get; set; }
        public List<string> SearchPaths { get; set; }
        public bool AutoLoad { get; set; }
    }

    public class InterfaceDefinition
    {
        public string Description { get; set; }
        public List<string> Methods { get; set; }
    }

    public class PluginSettings
    {
        public bool LoadOnStartup { get; set; }
        public bool HotReload { get; set; }
        public bool SandboxMode { get; set; }
        public int TimeoutMs { get; set; }
        public int MaxMemoryMB { get; set; }
    }

    public class PluginInfo
    {
        public string Key { get; set; }
        public PluginDefinition Definition { get; set; }
        public Assembly Assembly { get; set; }
        public DateTime LoadedAt { get; set; }
    }

    #endregion

    #region Plugin Interfaces

    /// <summary>
    /// Interface for custom numeric functions.
    /// Implement this to add new functions to Hekatan.
    /// </summary>
    public interface IHekatanFunction
    {
        /// <summary>Name of the function as used in Hekatan</summary>
        string Name { get; }

        /// <summary>Description shown in autocomplete/help</summary>
        string Description { get; }

        /// <summary>Number of parameters the function accepts (-1 for variable)</summary>
        int ParameterCount { get; }

        /// <summary>Evaluates the function with given arguments</summary>
        double Evaluate(double[] args);
    }

    /// <summary>
    /// Interface for symbolic math operations.
    /// </summary>
    public interface IHekatanSymbolic
    {
        string Name { get; }
        string[] Parameters { get; }
        string Transform(string expression);
    }

    /// <summary>
    /// Interface for matrix operations.
    /// </summary>
    public interface IHekatanMatrix
    {
        string Name { get; }
        double[,] Compute(double[,] input);
    }

    #endregion

    #region Dynamic Function Wrapper

    /// <summary>
    /// Wraps a reflected method as an IHekatanFunction.
    /// </summary>
    internal class DynamicFunctionWrapper : IHekatanFunction
    {
        private readonly MethodInfo _method;
        private readonly Type _targetType;

        public string Name { get; }
        public string Description => $"Plugin function: {Name}";
        public int ParameterCount => _method.GetParameters().Length;

        public DynamicFunctionWrapper(string name, MethodInfo method, Type targetType)
        {
            Name = name;
            _method = method;
            _targetType = targetType;
        }

        public double Evaluate(double[] args)
        {
            try
            {
                var parameters = _method.GetParameters();
                var invokeArgs = new object[parameters.Length];

                for (int i = 0; i < parameters.Length && i < args.Length; i++)
                {
                    invokeArgs[i] = Convert.ChangeType(args[i], parameters[i].ParameterType);
                }

                var result = _method.Invoke(null, invokeArgs);

                if (result is double d)
                    return d;
                if (result is IConvertible conv)
                    return conv.ToDouble(null);

                return double.NaN;
            }
            catch
            {
                return double.NaN;
            }
        }
    }

    #endregion
}
