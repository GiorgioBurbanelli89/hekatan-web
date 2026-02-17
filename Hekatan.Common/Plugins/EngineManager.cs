using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Hekatan.Common.Plugins
{
    /// <summary>
    /// Gestiona los motores de evaluación de expresiones.
    /// Permite usar Hekatan nativo, AngouriMath, traductores de sintaxis, o motores personalizados.
    /// </summary>
    public class EngineManager
    {
        private readonly Dictionary<string, IHekatanEngine> _engines = new();
        private readonly Dictionary<string, EngineDefinition> _engineDefs = new();
        private IHekatanEngine _defaultEngine;
        private PluginConfig _config;
        private readonly string _configPath;

        public IReadOnlyDictionary<string, IHekatanEngine> Engines => _engines;
        public IHekatanEngine DefaultEngine => _defaultEngine;
        public List<string> Errors { get; } = new();
        public List<string> Warnings { get; } = new();

        /// <summary>Variables compartidas entre motores</summary>
        public Dictionary<string, double> SharedVariables { get; } = new();

        public EngineManager(string configPath = null)
        {
            _configPath = configPath ?? Path.Combine(
                Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),
                "Plugins", "PluginConfig.json");
        }

        /// <summary>
        /// Carga la configuración de motores desde JSON
        /// </summary>
        public bool LoadConfig()
        {
            try
            {
                if (!File.Exists(_configPath))
                {
                    Warnings.Add($"Config not found: {_configPath}");
                    // Registrar motor Hekatan nativo por defecto
                    RegisterBuiltinHekatanEngine();
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
                Errors.Add($"Error loading config: {ex.Message}");
                RegisterBuiltinHekatanEngine();
                return false;
            }
        }

        /// <summary>
        /// Inicializa todos los motores habilitados
        /// </summary>
        public void InitializeEngines()
        {
            if (_config?.Engines == null)
            {
                RegisterBuiltinHekatanEngine();
                return;
            }

            foreach (var (key, engineDef) in _config.Engines)
            {
                if (!engineDef.Enabled) continue;

                _engineDefs[key] = engineDef;

                try
                {
                    IHekatanEngine engine = engineDef.Type switch
                    {
                        "builtin" => CreateBuiltinEngine(key, engineDef),
                        "plugin" => CreatePluginEngine(key, engineDef),
                        "translator" => CreateTranslatorEngine(key, engineDef),
                        "custom" => CreateCustomEngine(key, engineDef),
                        _ => null
                    };

                    if (engine != null)
                    {
                        _engines[key] = engine;
                        if (engineDef.IsDefault)
                        {
                            _defaultEngine = engine;
                        }
                    }
                }
                catch (Exception ex)
                {
                    Warnings.Add($"Could not initialize engine '{key}': {ex.Message}");
                }
            }

            // Asegurar que hay un motor por defecto
            if (_defaultEngine == null && _engines.Count > 0)
            {
                _defaultEngine = _engines.Values.First();
            }
        }

        /// <summary>
        /// Obtiene un motor por nombre
        /// </summary>
        public IHekatanEngine GetEngine(string name)
        {
            if (string.IsNullOrEmpty(name) || name == "default")
                return _defaultEngine;

            return _engines.TryGetValue(name.ToLowerInvariant(), out var engine)
                ? engine
                : _defaultEngine;
        }

        /// <summary>
        /// Detecta qué motor usar basándose en la directiva
        /// </summary>
        public IHekatanEngine GetEngineByDirective(string directive)
        {
            var normalizedDirective = directive.Trim().ToLowerInvariant();

            foreach (var (key, def) in _engineDefs)
            {
                if (def.Directive?.ToLowerInvariant() == normalizedDirective)
                {
                    return GetEngine(key);
                }
            }

            return _defaultEngine;
        }

        /// <summary>
        /// Evalúa una expresión con el motor especificado
        /// </summary>
        public double Evaluate(string expression, string engineName = null)
        {
            var engine = GetEngine(engineName);
            if (engine == null)
            {
                throw new InvalidOperationException($"Engine '{engineName ?? "default"}' not found");
            }

            // Si es un traductor, primero traducir y luego evaluar con el motor destino
            if (engine is ITranslatorEngine translator)
            {
                var translated = translator.TranslateToHekatan(expression);
                var targetEngine = GetEngine(translator.TargetEngine);
                return targetEngine.EvaluateNumeric(translated, SharedVariables);
            }

            return engine.EvaluateNumeric(expression, SharedVariables);
        }

        /// <summary>
        /// Evalúa una expresión simbólicamente
        /// </summary>
        public string EvaluateSymbolic(string expression, string engineName = null)
        {
            var engine = GetEngine(engineName);
            if (engine == null)
            {
                throw new InvalidOperationException($"Engine '{engineName ?? "default"}' not found");
            }

            return engine.EvaluateSymbolic(expression, SharedVariables);
        }

        /// <summary>
        /// Traduce una expresión a sintaxis Hekatan
        /// </summary>
        public string Translate(string expression, string fromEngine)
        {
            var engine = GetEngine(fromEngine);
            if (engine is ITranslatorEngine translator)
            {
                return translator.TranslateToHekatan(expression);
            }
            return expression;
        }

        /// <summary>
        /// Registra un motor personalizado en tiempo de ejecución
        /// </summary>
        public void RegisterEngine(string name, IHekatanEngine engine, bool makeDefault = false)
        {
            _engines[name.ToLowerInvariant()] = engine;
            if (makeDefault)
            {
                _defaultEngine = engine;
            }
        }

        /// <summary>
        /// Define una variable compartida entre todos los motores
        /// </summary>
        public void SetVariable(string name, double value)
        {
            SharedVariables[name] = value;
        }

        /// <summary>
        /// Obtiene el valor de una variable compartida
        /// </summary>
        public double GetVariable(string name)
        {
            return SharedVariables.TryGetValue(name, out var value) ? value : double.NaN;
        }

        #region Private Factory Methods

        private void RegisterBuiltinHekatanEngine()
        {
            var calcpad = new HekatanNativeEngine();
            _engines["calcpad"] = calcpad;
            _defaultEngine = calcpad;
        }

        private IHekatanEngine CreateBuiltinEngine(string key, EngineDefinition def)
        {
            return key switch
            {
                "calcpad" => new HekatanNativeEngine(),
                _ => throw new NotSupportedException($"Unknown builtin engine: {key}")
            };
        }

        private IHekatanEngine CreatePluginEngine(string key, EngineDefinition def)
        {
            // Buscar el plugin referenciado
            if (string.IsNullOrEmpty(def.PluginRef))
            {
                throw new InvalidOperationException($"Plugin engine '{key}' requires pluginRef");
            }

            // Por ahora, crear wrapper para AngouriMath si está disponible
            if (def.PluginRef == "angourimath")
            {
                return new AngouriMathEngine();
            }

            throw new NotSupportedException($"Plugin '{def.PluginRef}' not implemented");
        }

        private IHekatanEngine CreateTranslatorEngine(string key, EngineDefinition def)
        {
            if (def.Translations == null || def.Translations.Count == 0)
            {
                throw new InvalidOperationException($"Translator '{key}' requires translations");
            }

            return new GenericTranslatorEngine(key, def.TargetEngine ?? "calcpad", def.Translations);
        }

        private IHekatanEngine CreateCustomEngine(string key, EngineDefinition def)
        {
            if (string.IsNullOrEmpty(def.AssemblyPath) || string.IsNullOrEmpty(def.ClassName))
            {
                throw new InvalidOperationException($"Custom engine '{key}' requires assemblyPath and className");
            }

            var assembly = Assembly.LoadFrom(def.AssemblyPath);
            var type = assembly.GetType(def.ClassName);
            if (type == null || !typeof(IHekatanEngine).IsAssignableFrom(type))
            {
                throw new InvalidOperationException($"Type '{def.ClassName}' does not implement IHekatanEngine");
            }

            return (IHekatanEngine)Activator.CreateInstance(type);
        }

        #endregion
    }

    #region Built-in Engine Implementations

    /// <summary>
    /// Motor nativo de Hekatan (placeholder - la implementación real está en Hekatan.Core)
    /// </summary>
    public class HekatanNativeEngine : HekatanEngineBase
    {
        public override string Name => "Hekatan Native";
        public override string Description => "Motor nativo de Hekatan con soporte de unidades";
        public override string EngineType => "builtin";
        public override IReadOnlyList<string> Capabilities =>
            new[] { "numeric", "units", "matrices", "vectors", "solve", "plot" };

        public override double EvaluateNumeric(string expression, IDictionary<string, double> variables = null)
        {
            MergeVariables(variables);
            // La evaluación real la hace Hekatan.Core.MathParser
            // Este es un placeholder para cuando se integre
            throw new NotImplementedException(
                "HekatanNativeEngine.EvaluateNumeric debe llamar a MathParser de Hekatan.Core");
        }
    }

    /// <summary>
    /// Motor simbólico usando AngouriMath
    /// </summary>
    public class AngouriMathEngine : HekatanEngineBase, ISymbolicEngine
    {
        public override string Name => "AngouriMath";
        public override string Description => "Motor simbólico - derivadas, integrales, ecuaciones";
        public override string EngineType => "plugin";
        public override IReadOnlyList<string> Capabilities =>
            new[] { "symbolic", "derivatives", "integrals", "solve", "simplify", "latex" };

        private readonly Type _entityType;
        private readonly Type _mathSType;
        private readonly Assembly _angouriAssembly;

        public AngouriMathEngine()
        {
            try
            {
                _angouriAssembly = AppDomain.CurrentDomain.GetAssemblies()
                    .FirstOrDefault(a => a.GetName().Name == "AngouriMath");

                if (_angouriAssembly == null)
                {
                    _angouriAssembly = Assembly.Load("AngouriMath");
                }

                _entityType = _angouriAssembly?.GetType("AngouriMath.Entity");
                _mathSType = _angouriAssembly?.GetType("AngouriMath.MathS");
            }
            catch
            {
                // AngouriMath no disponible
            }
        }

        private object ParseExpression(string expression)
        {
            if (_entityType == null)
                throw new InvalidOperationException("AngouriMath not loaded");

            // Usar conversión implícita de string a Entity
            var method = _entityType.GetMethod("op_Implicit", new[] { typeof(string) });
            return method?.Invoke(null, new object[] { expression });
        }

        public override double EvaluateNumeric(string expression, IDictionary<string, double> variables = null)
        {
            MergeVariables(variables);

            var entity = ParseExpression(expression);

            // Sustituir variables
            foreach (var v in Variables)
            {
                var substituteMethod = _entityType.GetMethod("Substitute");
                entity = substituteMethod?.Invoke(entity, new object[] { v.Key, v.Value });
            }

            // Evaluar numéricamente
            var evalMethod = _entityType.GetMethod("EvalNumerical");
            var result = evalMethod?.Invoke(entity, null);

            return Convert.ToDouble(result?.ToString() ?? "NaN");
        }

        public override string EvaluateSymbolic(string expression, IDictionary<string, double> variables = null)
        {
            var entity = ParseExpression(expression);
            var simplifyMethod = _entityType.GetMethod("Simplify");
            var simplified = simplifyMethod?.Invoke(entity, null);
            return simplified?.ToString() ?? expression;
        }

        public string Differentiate(string expression, string variable)
        {
            var entity = ParseExpression(expression);
            var diffMethod = _entityType.GetMethod("Differentiate", new[] { typeof(string) });
            var result = diffMethod?.Invoke(entity, new object[] { variable });
            return result?.ToString() ?? "";
        }

        public string Integrate(string expression, string variable)
        {
            var entity = ParseExpression(expression);
            var intMethod = _entityType.GetMethod("Integrate", new[] { typeof(string) });
            var result = intMethod?.Invoke(entity, new object[] { variable });
            return result?.ToString() ?? "";
        }

        public string Simplify(string expression)
        {
            var entity = ParseExpression(expression);
            var simplifyMethod = _entityType.GetMethod("Simplify");
            var result = simplifyMethod?.Invoke(entity, null);
            return result?.ToString() ?? expression;
        }

        public string Expand(string expression)
        {
            var entity = ParseExpression(expression);
            var expandMethod = _entityType.GetMethod("Expand");
            var result = expandMethod?.Invoke(entity, null);
            return result?.ToString() ?? expression;
        }

        public string[] Solve(string equation, string variable)
        {
            var entity = ParseExpression(equation);
            var solveMethod = _entityType.GetMethod("SolveEquation", new[] { typeof(string) });
            var result = solveMethod?.Invoke(entity, new object[] { variable });

            // Convertir el Set a array de strings
            if (result == null) return Array.Empty<string>();

            var solutions = new List<string>();
            var enumerator = result.GetType().GetMethod("GetEnumerator")?.Invoke(result, null);
            if (enumerator != null)
            {
                var moveNext = enumerator.GetType().GetMethod("MoveNext");
                var current = enumerator.GetType().GetProperty("Current");
                while ((bool)(moveNext?.Invoke(enumerator, null) ?? false))
                {
                    solutions.Add(current?.GetValue(enumerator)?.ToString() ?? "");
                }
            }

            return solutions.ToArray();
        }

        public string[,] SolveSystem(string[] equations, string[] variables)
        {
            // TODO: Implementar con MathS.Equations
            throw new NotImplementedException();
        }

        public string Limit(string expression, string variable, string value)
        {
            if (_mathSType == null) return "";

            var entity = ParseExpression(expression);
            var limitMethod = _mathSType.GetMethod("Limit", new[] { _entityType, typeof(string), _entityType });
            var valueEntity = ParseExpression(value);
            var result = limitMethod?.Invoke(null, new object[] { entity, variable, valueEntity });
            return result?.ToString() ?? "";
        }

        public string ToLatex(string expression)
        {
            var entity = ParseExpression(expression);
            var latexMethod = _entityType.GetMethod("Latexise");
            var result = latexMethod?.Invoke(entity, null);
            return result?.ToString() ?? expression;
        }
    }

    /// <summary>
    /// Motor genérico de traducción de sintaxis
    /// </summary>
    public class GenericTranslatorEngine : TranslatorEngineBase
    {
        private readonly string _name;
        private readonly string _targetEngine;
        private readonly Dictionary<string, string> _translations;

        public override string Name => _name;
        public override string Description => $"Translator: {_name} → {_targetEngine}";
        public override string TargetEngine => _targetEngine;
        public override IDictionary<string, string> Translations => _translations;

        public GenericTranslatorEngine(string name, string targetEngine, IDictionary<string, string> translations)
        {
            _name = name;
            _targetEngine = targetEngine;
            _translations = new Dictionary<string, string>(translations);
        }
    }

    #endregion

    #region Configuration Classes

    public class EngineDefinition
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public string Type { get; set; }
        public bool Enabled { get; set; }
        public bool IsDefault { get; set; }
        public string Directive { get; set; }
        public string EndDirective { get; set; }
        public string PluginRef { get; set; }
        public string TargetEngine { get; set; }
        public string AssemblyPath { get; set; }
        public string ClassName { get; set; }
        public string InterfaceType { get; set; }
        public List<string> Capabilities { get; set; }
        public Dictionary<string, string> Syntax { get; set; }
        public Dictionary<string, string> Translations { get; set; }
    }

    #endregion
}
