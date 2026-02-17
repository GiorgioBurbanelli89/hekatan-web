using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace Hekatan.Common.ExpressionParsers
{
    /// <summary>
    /// Parser para operaciones simbólicas usando AngouriMath.
    /// Permite derivadas, integrales, simplificación, resolver ecuaciones, etc.
    /// </summary>
    public class SymbolicParser : BaseExpressionParser
    {
        public override string Name => "Symbolic Math Parser (AngouriMath)";
        public override string Directive => "@{symbolic}";
        public override string EndDirective => "@{end symbolic}";
        public override ParserMode Mode => ParserMode.Hybrid; // Puede traducir o ejecutar

        private readonly Type _entityType;
        private readonly Type _mathSType;
        private readonly Assembly _angouriAssembly;
        private readonly bool _isAvailable;

        public SymbolicParser()
        {
            try
            {
                // DEBUG: Log intentos de carga
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-symbolic-debug.txt");
                System.IO.File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] Intentando cargar AngouriMath...\n");

                _angouriAssembly = AppDomain.CurrentDomain.GetAssemblies()
                    .FirstOrDefault(a => a.GetName().Name == "AngouriMath");

                if (_angouriAssembly == null)
                {
                    System.IO.File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] No encontrado en AppDomain, intentando Assembly.Load...\n");
                    _angouriAssembly = Assembly.Load("AngouriMath");
                }

                if (_angouriAssembly != null)
                {
                    System.IO.File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] AngouriMath assembly cargado: {_angouriAssembly.FullName}\n");
                }

                _entityType = _angouriAssembly?.GetType("AngouriMath.Entity");
                _mathSType = _angouriAssembly?.GetType("AngouriMath.MathS");
                _isAvailable = _entityType != null && _mathSType != null;

                System.IO.File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] IsAvailable={_isAvailable}, EntityType={_entityType != null}, MathSType={_mathSType != null}\n");
            }
            catch (Exception ex)
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-symbolic-debug.txt");
                System.IO.File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss}] ERROR: {ex.Message}\n{ex.StackTrace}\n");
                _isAvailable = false;
            }
        }

        public bool IsAvailable => _isAvailable;

        private void LogDebug(string message)
        {
            try
            {
                var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-symbolic-debug.txt");
                System.IO.File.AppendAllText(debugPath, $"[{DateTime.Now:HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        private object ParseExpression(string expression)
        {
            if (!_isAvailable)
                throw new InvalidOperationException("AngouriMath not available. Install AngouriMath package.");

            // Usar conversión implícita de string a Entity
            var method = _entityType.GetMethod("op_Implicit", new[] { typeof(string) });
            return method?.Invoke(null, new object[] { expression });
        }

        public override string Translate(string expression)
        {
            if (!_isAvailable)
                return $"' Error: AngouriMath not available\n{expression}";

            // Si el contenido tiene múltiples líneas, procesarlas por separado
            if (expression.Contains('\n') || expression.Contains('\r'))
            {
                return TranslateBlock(expression);
            }

            try
            {
                // Detectar operaciones simbólicas especiales
                var result = ProcessSymbolicOperations(expression);
                return result ?? expression;
            }
            catch (Exception ex)
            {
                return $"' Symbolic error: {ex.Message}\n{expression}";
            }
        }

        /// <summary>
        /// Traduce bloques simbólicos multilínea
        /// </summary>
        public string TranslateBlock(string symbolicBlock)
        {
            LogDebug($"TranslateBlock called with {symbolicBlock.Length} chars");
            var lines = symbolicBlock.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            var result = new List<string>();

            LogDebug($"Split into {lines.Length} lines");
            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                LogDebug($"Processing line: '{trimmed}'");

                // Ignorar líneas vacías y comentarios
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("'"))
                {
                    LogDebug($"Line is comment or empty, keeping as-is");
                    result.Add(line);
                    continue;
                }

                // Traducir la línea
                try
                {
                    var translated = ProcessSymbolicOperations(trimmed);
                    LogDebug($"Translated to: '{translated}'");
                    result.Add(translated ?? trimmed);
                }
                catch (Exception ex)
                {
                    LogDebug($"Translation error: {ex.Message}");
                    result.Add($"' Error: {ex.Message}");
                }
            }

            var final = string.Join("\n", result);
            LogDebug($"Final result length: {final.Length}");
            return final;
        }

        /// <summary>
        /// Procesa operaciones simbólicas y las convierte a sintaxis Hekatan
        /// </summary>
        private string ProcessSymbolicOperations(string expression)
        {
            var lines = expression.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            var output = new List<string>();

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("'"))
                {
                    output.Add(line);
                    continue;
                }

                string processed = null;

                // 1. Derivada: d/dx(expresión) o derive(expresión, x)
                if (Regex.IsMatch(trimmed, @"d/d[a-zA-Z]\(") || trimmed.Contains("derive("))
                {
                    processed = ProcessDerivative(trimmed);
                }
                // 2. Integral: ∫(expresión, x) o integrate(expresión, x)
                else if (trimmed.Contains("∫(") || trimmed.Contains("integrate("))
                {
                    processed = ProcessIntegral(trimmed);
                }
                // 3. Simplificar: simplify(expresión)
                else if (trimmed.Contains("simplify("))
                {
                    processed = ProcessSimplify(trimmed);
                }
                // 4. Expandir: expand(expresión)
                else if (trimmed.Contains("expand("))
                {
                    processed = ProcessExpand(trimmed);
                }
                // 5. Resolver: solve(ecuación, variable)
                else if (trimmed.Contains("solve("))
                {
                    processed = ProcessSolve(trimmed);
                }
                // 6. Límite: limit(expresión, x, valor)
                else if (trimmed.Contains("limit("))
                {
                    processed = ProcessLimit(trimmed);
                }
                // 7. ODE: solve_ode(ecuación, función, variable)
                else if (trimmed.Contains("solve_ode("))
                {
                    processed = ProcessODE(trimmed);
                }
                // 8. Verificar ODE: verify_ode(solución, ecuación, función, variable)
                else if (trimmed.Contains("verify_ode("))
                {
                    processed = ProcessVerifyODE(trimmed);
                }
                // 9. Asignación normal con evaluación simbólica
                else if (trimmed.Contains("="))
                {
                    processed = ProcessAssignment(trimmed);
                }

                output.Add(processed ?? line);
            }

            return string.Join("\n", output);
        }

        private string ProcessDerivative(string line)
        {
            // d/dx(expresión) → derivada
            var match = Regex.Match(line, @"(\w+)\s*=\s*d/d([a-zA-Z])\((.+)\)");
            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var variable = match.Groups[2].Value;
                var expr = match.Groups[3].Value;

                try
                {
                    LogDebug($"ProcessDerivative: expr={expr}, variable={variable}");
                    var entity = ParseExpression(expr);
                    LogDebug($"Entity parsed: {entity}");

                    // Enumerar todos los métodos Differentiate para evitar ambigüedad
                    var methods = _entityType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                        .Where(m => m.Name == "Differentiate")
                        .ToArray();

                    LogDebug($"Found {methods.Length} Differentiate overloads");
                    foreach (var m in methods)
                    {
                        var pars = m.GetParameters();
                        LogDebug($"  - Differentiate({string.Join(", ", pars.Select(p => p.ParameterType.Name))})");
                    }

                    // Buscar el método que toma un Variable o Entity como parámetro
                    var diffMethod = methods.FirstOrDefault(m =>
                    {
                        var pars = m.GetParameters();
                        return pars.Length == 1 &&
                               (pars[0].ParameterType.Name == "Variable" ||
                                pars[0].ParameterType.Name == "Entity");
                    });

                    LogDebug($"Selected method: {diffMethod?.ToString()}");

                    object result = null;
                    if (diffMethod != null)
                    {
                        var variableEntity = ParseExpression(variable);
                        LogDebug($"Variable entity: {variableEntity}");
                        result = diffMethod.Invoke(entity, new object[] { variableEntity });
                    }
                    else
                    {
                        LogDebug($"No suitable Differentiate method found, trying MathS.Differentiate");
                        // Último intento: usar MathS.Differentiate
                        var mathsDiff = _mathSType?.GetMethod("Differentiate",
                            BindingFlags.Public | BindingFlags.Static,
                            null,
                            new[] { _entityType, _entityType },
                            null);

                        if (mathsDiff != null)
                        {
                            var variableEntity = ParseExpression(variable);
                            result = mathsDiff.Invoke(null, new object[] { entity, variableEntity });
                        }
                    }

                    LogDebug($"Differentiation result: {result}");
                    var simplified = Simplify(result);
                    LogDebug($"Simplified result: {simplified}");

                    // Mostrar resultado simbólico como comentario
                    return $"' {varName} = d/d{variable}({expr})\n' {varName} = {simplified}";
                }
                catch (Exception ex)
                {
                    LogDebug($"ProcessDerivative ERROR: {ex.Message}\n{ex.StackTrace}");
                    return $"' {varName} = d/d{variable}({expr})\n' Error: {ex.Message}";
                }
            }

            // derive(expresión, x)
            match = Regex.Match(line, @"(\w+)\s*=\s*derive\((.+?),\s*([a-zA-Z])\)");
            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var expr = match.Groups[2].Value;
                var variable = match.Groups[3].Value;

                try
                {
                    var entity = ParseExpression(expr);
                    var variableEntity = ParseExpression(variable);

                    var methods = _entityType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                        .Where(m => m.Name == "Differentiate")
                        .ToArray();

                    var diffMethod = methods.FirstOrDefault(m =>
                    {
                        var pars = m.GetParameters();
                        return pars.Length == 1 &&
                               (pars[0].ParameterType.Name == "Variable" ||
                                pars[0].ParameterType.Name == "Entity");
                    });

                    var result = diffMethod?.Invoke(entity, new object[] { variableEntity });
                    var simplified = Simplify(result);

                    return $"' {varName} = d/d{variable}({expr})\n' {varName} = {simplified}";
                }
                catch (Exception ex)
                {
                    return $"' {varName} = derive({expr}, {variable})\n' Error: {ex.Message}";
                }
            }

            return null;
        }

        private string ProcessIntegral(string line)
        {
            // ∫(expresión, x) o integrate(expresión, x)
            var pattern = @"(\w+)\s*=\s*(?:∫|integrate)\((.+?),\s*([a-zA-Z])\)";
            var match = Regex.Match(line, pattern);

            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var expr = match.Groups[2].Value;
                var variable = match.Groups[3].Value;

                try
                {
                    var entity = ParseExpression(expr);
                    var variableEntity = ParseExpression(variable);

                    var methods = _entityType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                        .Where(m => m.Name == "Integrate")
                        .ToArray();

                    var intMethod = methods.FirstOrDefault(m =>
                    {
                        var pars = m.GetParameters();
                        return pars.Length == 1 &&
                               (pars[0].ParameterType.Name == "Variable" ||
                                pars[0].ParameterType.Name == "Entity");
                    });

                    var result = intMethod?.Invoke(entity, new object[] { variableEntity });
                    var simplified = Simplify(result);

                    return $"' {varName} = ∫({expr}, {variable})\n' {varName} = {simplified}";
                }
                catch (Exception ex)
                {
                    return $"' {varName} = ∫({expr}, {variable})\n' Error: {ex.Message}";
                }
            }

            return null;
        }

        private string ProcessSimplify(string line)
        {
            // simplify(expresión)
            var match = Regex.Match(line, @"(\w+)\s*=\s*simplify\((.+)\)");
            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var expr = match.Groups[2].Value;

                try
                {
                    var entity = ParseExpression(expr);
                    var simplified = Simplify(entity);

                    return $"' {varName} = simplify({expr})\n' {varName} = {simplified}";
                }
                catch (Exception ex)
                {
                    return $"' {varName} = simplify({expr})\n' Error: {ex.Message}";
                }
            }

            return null;
        }

        private string ProcessExpand(string line)
        {
            // expand(expresión)
            var match = Regex.Match(line, @"(\w+)\s*=\s*expand\((.+)\)");
            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var expr = match.Groups[2].Value;

                try
                {
                    LogDebug($"ProcessExpand: expr={expr}");
                    var entity = ParseExpression(expr);
                    LogDebug($"Entity parsed: {entity}");

                    // Enumerar todos los métodos Expand para evitar ambigüedad
                    var methods = _entityType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                        .Where(m => m.Name == "Expand")
                        .ToArray();

                    LogDebug($"Found {methods.Length} Expand overloads");
                    foreach (var m in methods)
                    {
                        var pars = m.GetParameters();
                        LogDebug($"  - Expand({string.Join(", ", pars.Select(p => p.ParameterType.Name))})");
                    }

                    // Buscar el método que toma Int32 como parámetro (depth)
                    var expandMethod = methods.FirstOrDefault(m =>
                    {
                        var pars = m.GetParameters();
                        return pars.Length == 1 && pars[0].ParameterType == typeof(int);
                    });

                    // Si no se encuentra, buscar método sin parámetros
                    if (expandMethod == null)
                        expandMethod = methods.FirstOrDefault(m => m.GetParameters().Length == 0);

                    LogDebug($"Selected method: {expandMethod?.ToString()}");

                    object result = null;
                    if (expandMethod != null && expandMethod.GetParameters().Length == 1)
                    {
                        // Llamar con profundidad 10
                        result = expandMethod.Invoke(entity, new object[] { 10 });
                    }
                    else if (expandMethod != null)
                    {
                        result = expandMethod.Invoke(entity, null);
                    }
                    LogDebug($"Expand result: {result}");

                    return $"' {varName} = expand({expr})\n' {varName} = {result}";
                }
                catch (Exception ex)
                {
                    LogDebug($"ProcessExpand ERROR: {ex.Message}\n{ex.StackTrace}");
                    return $"' {varName} = expand({expr})\n' Error: {ex.Message}";
                }
            }

            return null;
        }

        private string ProcessSolve(string line)
        {
            // solve(ecuación, variable)
            var match = Regex.Match(line, @"(\w+)\s*=\s*solve\((.+?),\s*([a-zA-Z])\)");
            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var equation = match.Groups[2].Value;
                var variable = match.Groups[3].Value;

                try
                {
                    var entity = ParseExpression(equation);
                    var solveMethod = _entityType.GetMethod("SolveEquation", new[] { typeof(string) });
                    var result = solveMethod?.Invoke(entity, new object[] { variable });

                    return $"' {varName} = solve({equation}, {variable})\n' Soluciones: {result}";
                }
                catch (Exception ex)
                {
                    return $"' {varName} = solve({equation}, {variable})\n' Error: {ex.Message}";
                }
            }

            return null;
        }

        private string ProcessLimit(string line)
        {
            // limit(expresión, x, valor)
            var match = Regex.Match(line, @"(\w+)\s*=\s*limit\((.+?),\s*([a-zA-Z]),\s*(.+?)\)");
            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var expr = match.Groups[2].Value;
                var variable = match.Groups[3].Value;
                var value = match.Groups[4].Value;

                try
                {
                    LogDebug($"ProcessLimit: expr={expr}, variable={variable}, value={value}");
                    var entity = ParseExpression(expr);
                    LogDebug($"Entity parsed: {entity}");
                    var variableEntity = ParseExpression(variable);
                    LogDebug($"Variable entity: {variableEntity}");
                    var valueEntity = ParseExpression(value);
                    LogDebug($"Value entity: {valueEntity}");

                    var methods = _mathSType.GetMethods(BindingFlags.Public | BindingFlags.Static)
                        .Where(m => m.Name == "Limit")
                        .ToArray();

                    LogDebug($"Found {methods.Length} Limit overloads");
                    foreach (var m in methods)
                    {
                        var pars = m.GetParameters();
                        LogDebug($"  - Limit({string.Join(", ", pars.Select(p => p.ParameterType.Name))})");
                    }

                    // Buscar método con 4 parámetros: (Entity, Entity, Entity, ApproachFrom)
                    var limitMethod = methods.FirstOrDefault(m =>
                    {
                        var pars = m.GetParameters();
                        return pars.Length == 4 &&
                               pars[0].ParameterType == _entityType &&
                               pars[1].ParameterType == _entityType &&
                               pars[2].ParameterType == _entityType &&
                               pars[3].ParameterType.Name == "ApproachFrom";
                    });

                    // Si no se encuentra con 4 parámetros, buscar con 3
                    if (limitMethod == null)
                    {
                        limitMethod = methods.FirstOrDefault(m =>
                        {
                            var pars = m.GetParameters();
                            return pars.Length == 3 &&
                                   pars[0].ParameterType == _entityType &&
                                   pars[1].ParameterType == _entityType &&
                                   pars[2].ParameterType == _entityType;
                        });
                    }

                    LogDebug($"Selected method: {limitMethod?.ToString()}");

                    object result = null;
                    if (limitMethod != null)
                    {
                        var pars = limitMethod.GetParameters();
                        if (pars.Length == 4)
                        {
                            // Obtener el tipo ApproachFrom y usar el valor por defecto (BothSides = 0)
                            var approachFromType = pars[3].ParameterType;
                            var approachFromValue = Enum.GetValues(approachFromType).GetValue(0);
                            result = limitMethod.Invoke(null, new object[] { entity, variableEntity, valueEntity, approachFromValue });
                        }
                        else
                        {
                            result = limitMethod.Invoke(null, new object[] { entity, variableEntity, valueEntity });
                        }
                    }
                    LogDebug($"Limit result: {result}");

                    // Evaluar el límite usando Evaled o InnerSimplified
                    var evaluated = result;
                    try
                    {
                        // Intentar obtener la propiedad Evaled
                        var evaledProp = result?.GetType().GetProperty("Evaled");
                        if (evaledProp != null)
                        {
                            evaluated = evaledProp.GetValue(result);
                            LogDebug($"Limit evaled: {evaluated}");
                        }
                        else
                        {
                            // Intentar InnerSimplified
                            var innerSimplifiedProp = result?.GetType().GetProperty("InnerSimplified");
                            if (innerSimplifiedProp != null)
                            {
                                evaluated = innerSimplifiedProp.GetValue(result);
                                LogDebug($"Limit inner simplified: {evaluated}");
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        LogDebug($"Evaled/InnerSimplified error: {ex.Message}");
                    }

                    // Simplificar el resultado
                    var simplified = Simplify(evaluated);
                    LogDebug($"Limit simplified: {simplified}");

                    return $"' {varName} = limit({expr}, {variable}→{value})\n' {varName} = {simplified}";
                }
                catch (Exception ex)
                {
                    LogDebug($"ProcessLimit ERROR: {ex.Message}\n{ex.StackTrace}");
                    return $"' {varName} = limit({expr}, {variable}→{value})\n' Error: {ex.Message}";
                }
            }

            return null;
        }

        private string ProcessAssignment(string line)
        {
            // Asignación normal: variable = expresión
            var match = Regex.Match(line, @"(\w+)\s*=\s*(.+)");
            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var expr = match.Groups[2].Value;

                try
                {
                    var entity = ParseExpression(expr);
                    var simplified = Simplify(entity);

                    return $"{varName} = {simplified} ' simplified";
                }
                catch
                {
                    return line; // Si falla, devolver línea original
                }
            }

            return null;
        }

        /// <summary>
        /// Procesa ecuaciones diferenciales ordinarias (ODEs)
        /// Soporta:
        /// - ODEs de primer orden: y' = f(x) o y' + p*y = q(x)
        /// - ODEs de segundo orden homogéneas: y'' + a*y' + b*y = 0
        /// </summary>
        private string ProcessODE(string line)
        {
            // solve_ode(ecuación, función, variable)
            // Sintaxis mejorada SIN '=' interno:
            // sol = solve_ode(y' - 2*x, y, x)           ' ODE: y' = 2*x
            // sol = solve_ode(y' + 2*y, y, x)           ' ODE: y' + 2*y = 0
            // sol = solve_ode(y'' - 3*y' + 2*y, y, x)   ' ODE: y'' - 3*y' + 2*y = 0

            // Regex que NO captura '=' dentro de solve_ode()
            var match = Regex.Match(line, @"(\w+)\s*=\s*solve_ode\(([^,]+),\s*([a-zA-Z])\s*,\s*([a-zA-Z])\)");
            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var equation = match.Groups[2].Value;
                var function = match.Groups[3].Value;  // y
                var variable = match.Groups[4].Value;  // x

                try
                {
                    LogDebug($"ProcessODE: equation={equation}, function={function}, variable={variable}");

                    // Normalizar ecuación: remover espacios extra
                    equation = equation.Trim();

                    // Detectar tipo de ODE
                    string result = null;

                    // Caso 1: y'' + a*y' + b*y (segundo orden, asumimos = 0)
                    if (equation.Contains("''"))
                    {
                        // Si no tiene '=', agregar = 0
                        if (!equation.Contains("="))
                            equation += " = 0";
                        result = SolveSecondOrderLinearHomogeneous(equation, function, variable);
                    }
                    // Caso 2: y' - f(x) (primer orden separable: y' = f(x))
                    // Detectar si la ecuación NO contiene 'y' (solo y' y x)
                    else if (equation.Contains("'"))
                    {
                        // Remover y' de la ecuación para ver qué queda
                        var withoutYPrime = equation.Replace(function + "'", "").Trim();

                        // Si no contiene 'y' (solo x), es separable
                        if (!withoutYPrime.Contains(function))
                        {
                            LogDebug($"Detected separable ODE: {equation}");

                            // Parsear y' +/- f(x)
                            var separableMatch = Regex.Match(equation, function + @"'\s*([-+])\s*(.+)");
                            if (separableMatch.Success)
                            {
                                var sign = separableMatch.Groups[1].Value;
                                var expr = separableMatch.Groups[2].Value.Trim();

                                LogDebug($"Sign: {sign}, Expr: {expr}");

                                if (sign == "-")
                                    result = SolveFirstOrderSeparable($"{function}' = {expr}", function, variable);
                                else
                                    result = SolveFirstOrderSeparable($"{function}' = -({expr})", function, variable);
                            }
                            else
                            {
                                // Si no hay operador, asumir que es y' = <resto>
                                result = SolveFirstOrderSeparable($"{function}' = 0", function, variable);
                            }
                        }
                        // Caso 3: y' + p*y (primer orden lineal: contiene 'y')
                        else
                        {
                            // Si no tiene '=', agregar = 0
                            if (!equation.Contains("="))
                                equation += " = 0";
                            result = SolveFirstOrderLinear(equation, function, variable);
                        }
                    }
                    else
                    {
                        result = "Tipo de ODE no soportado aún";
                    }

                    // Formatear la ecuación original
                    string displayEquation = equation;
                    if (!displayEquation.Contains("="))
                        displayEquation += " = 0";

                    // Reemplazar y' y y'' con notación Unicode
                    displayEquation = displayEquation.Replace(function + "''", function + "″");
                    displayEquation = displayEquation.Replace(function + "'", function + "′");

                    var formattedEquation = FormatMathExpression(displayEquation);

                    // Formatear la solución
                    var formattedResult = FormatMathExpression(result);
                    var formattedVarName = $"<var>{varName}</var>";

                    // Retornar ecuación Y solución
                    return $"'<p><b>Ecuación:</b> <span class=\"eq\">{formattedEquation}</span></p>\n'<p><b>Solución:</b> <span class=\"eq\">{formattedVarName} = {formattedResult}</span></p>";
                }
                catch (Exception ex)
                {
                    LogDebug($"ProcessODE ERROR: {ex.Message}\n{ex.StackTrace}");
                    return $"' {varName} = solve_ode({equation}, {function}, {variable})\n' Error: {ex.Message}";
                }
            }

            return null;
        }

        /// <summary>
        /// Resuelve ODE de primer orden separable: y' = f(x)
        /// Solución: y = ∫f(x)dx + C
        /// </summary>
        private string SolveFirstOrderSeparable(string equation, string function, string variable)
        {
            LogDebug($"SolveFirstOrderSeparable: {equation}");

            // Extraer f(x) de "y' = f(x)"
            var match = Regex.Match(equation, @"[a-zA-Z]'\s*=\s*(.+)");
            if (!match.Success)
                return "No se pudo parsear la ecuación";

            var rightSide = match.Groups[1].Value.Trim();
            LogDebug($"Right side: {rightSide}");

            try
            {
                // Integrar f(x)
                var entity = ParseExpression(rightSide);
                var variableEntity = ParseExpression(variable);

                var methods = _entityType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => m.Name == "Integrate")
                    .ToArray();

                var intMethod = methods.FirstOrDefault(m =>
                {
                    var pars = m.GetParameters();
                    return pars.Length == 1 &&
                           (pars[0].ParameterType.Name == "Variable" ||
                            pars[0].ParameterType.Name == "Entity");
                });

                var result = intMethod?.Invoke(entity, new object[] { variableEntity });
                var simplified = Simplify(result);

                return $"{function} = {simplified} + C";
            }
            catch (Exception ex)
            {
                LogDebug($"SolveFirstOrderSeparable ERROR: {ex.Message}");
                return $"Error al integrar: {ex.Message}";
            }
        }

        /// <summary>
        /// Resuelve ODE lineal de primer orden: y' + p(x)*y = q(x)
        /// Usa el factor integrante: μ(x) = e^(∫p(x)dx)
        /// </summary>
        private string SolveFirstOrderLinear(string equation, string function, string variable)
        {
            LogDebug($"SolveFirstOrderLinear: {equation}");

            // Parsear y' + p*y = q
            // Por ahora, implementar caso simple: y' + a*y = 0
            var match = Regex.Match(equation, @"[a-zA-Z]'\s*\+\s*([^=]+)\*[a-zA-Z]\s*=\s*0");
            if (match.Success)
            {
                var coefficient = match.Groups[1].Value.Trim();
                LogDebug($"Homogeneous first order: coefficient = {coefficient}");

                // Solución: y = C*e^(-a*x)
                return $"{function} = C*e^(-({coefficient})*{variable})";
            }

            // Caso general requiere factor integrante
            return "ODE lineal de primer orden (caso general) - en desarrollo";
        }

        /// <summary>
        /// Resuelve ODE lineal de segundo orden homogénea con coeficientes constantes:
        /// y'' + a*y' + b*y = 0
        /// Solución usando ecuación característica: r² + a*r + b = 0
        /// </summary>
        private string SolveSecondOrderLinearHomogeneous(string equation, string function, string variable)
        {
            LogDebug($"SolveSecondOrderLinearHomogeneous: {equation}");

            try
            {
                // Parsear y'' + a*y' + b*y = 0
                // Extraer coeficientes a y b

                // Remover espacios y normalizar
                var normalized = equation.Replace(" ", "");
                LogDebug($"Normalized: {normalized}");

                // Regex para capturar: y'' + (coef)*y' + (coef)*y = 0
                // Casos:
                // y'' - 3*y' + 2*y = 0
                // y'' + 4*y' + 4*y = 0
                // y'' + y = 0

                double a = 0, b = 0;

                // Buscar coeficiente de y'
                var yPrimeMatch = Regex.Match(normalized, @"([+-]?\d*\.?\d*)\*?" + function + "''");
                var yPrimeCoef = Regex.Match(normalized, @"([+-]?\d+\.?\d*)\*?" + function + "'(?!')");
                var yCoef = Regex.Match(normalized, @"([+-]?\d+\.?\d*)\*?" + function + "(?!')");

                if (yPrimeCoef.Success)
                {
                    var coefStr = yPrimeCoef.Groups[1].Value;
                    if (string.IsNullOrEmpty(coefStr) || coefStr == "+") coefStr = "1";
                    if (coefStr == "-") coefStr = "-1";
                    a = double.Parse(coefStr);
                }

                if (yCoef.Success)
                {
                    var coefStr = yCoef.Groups[1].Value;
                    if (string.IsNullOrEmpty(coefStr) || coefStr == "+") coefStr = "1";
                    if (coefStr == "-") coefStr = "-1";
                    b = double.Parse(coefStr);
                }

                LogDebug($"Coefficients: a={a}, b={b}");

                // Resolver ecuación característica: r² + a*r + b = 0
                var discriminant = a * a - 4 * b;
                LogDebug($"Discriminant: {discriminant}");

                if (discriminant > 0)
                {
                    // Dos raíces reales distintas
                    var r1 = (-a + Math.Sqrt(discriminant)) / 2.0;
                    var r2 = (-a - Math.Sqrt(discriminant)) / 2.0;
                    LogDebug($"Real roots: r1={r1}, r2={r2}");

                    return $"{function} = C1*e^({r1:F4}*{variable}) + C2*e^({r2:F4}*{variable})";
                }
                else if (Math.Abs(discriminant) < 1e-10)
                {
                    // Raíz doble
                    var r = -a / 2.0;
                    LogDebug($"Repeated root: r={r}");

                    return $"{function} = (C1 + C2*{variable})*e^({r:F4}*{variable})";
                }
                else
                {
                    // Raíces complejas conjugadas
                    var alpha = -a / 2.0;
                    var beta = Math.Sqrt(-discriminant) / 2.0;
                    LogDebug($"Complex roots: α={alpha}, β={beta}");

                    return $"{function} = e^({alpha:F4}*{variable})*(C1*cos({beta:F4}*{variable}) + C2*sin({beta:F4}*{variable}))";
                }
            }
            catch (Exception ex)
            {
                LogDebug($"SolveSecondOrderLinearHomogeneous ERROR: {ex.Message}");
                return $"Error: {ex.Message}";
            }
        }

        /// <summary>
        /// Verifica si una solución satisface una ODE
        /// verify_ode(solución, ecuación, función, variable)
        /// </summary>
        private string ProcessVerifyODE(string line)
        {
            var match = Regex.Match(line, @"(\w+)\s*=\s*verify_ode\((.+?),\s*(.+?),\s*([a-zA-Z])\s*,\s*([a-zA-Z])\)");
            if (match.Success)
            {
                var varName = match.Groups[1].Value;
                var solution = match.Groups[2].Value;
                var equation = match.Groups[3].Value;
                var function = match.Groups[4].Value;
                var variable = match.Groups[5].Value;

                try
                {
                    LogDebug($"ProcessVerifyODE: solution={solution}, equation={equation}");

                    // Derivar la solución según el orden de la ODE
                    var solutionEntity = ParseExpression(solution);
                    var variableEntity = ParseExpression(variable);

                    // Obtener y'
                    var methods = _entityType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                        .Where(m => m.Name == "Differentiate")
                        .ToArray();

                    var diffMethod = methods.FirstOrDefault(m =>
                    {
                        var pars = m.GetParameters();
                        return pars.Length == 1 &&
                               (pars[0].ParameterType.Name == "Variable" ||
                                pars[0].ParameterType.Name == "Entity");
                    });

                    var yPrime = diffMethod?.Invoke(solutionEntity, new object[] { variableEntity });
                    LogDebug($"y' = {yPrime}");

                    string verificationResult = "Verificación simbólica - en desarrollo";

                    // Si la ecuación tiene y'', calcular también la segunda derivada
                    if (equation.Contains("''"))
                    {
                        var yDoublePrime = diffMethod?.Invoke(yPrime, new object[] { variableEntity });
                        LogDebug($"y'' = {yDoublePrime}");
                        verificationResult = $"y' = {Simplify(yPrime)}, y'' = {Simplify(yDoublePrime)}";
                    }
                    else
                    {
                        verificationResult = $"y' = {Simplify(yPrime)}";
                    }

                    return $"' {varName} = verify_ode({solution}, {equation})\n' {verificationResult}";
                }
                catch (Exception ex)
                {
                    LogDebug($"ProcessVerifyODE ERROR: {ex.Message}\n{ex.StackTrace}");
                    return $"' {varName} = verify_ode(...)\n' Error: {ex.Message}";
                }
            }

            return null;
        }

        private string Simplify(object entity)
        {
            if (entity == null) return "";

            try
            {
                // Enumerar todos los métodos Simplify para evitar ambigüedad
                var methods = _entityType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => m.Name == "Simplify")
                    .ToArray();

                // Buscar el método sin parámetros
                var simplifyMethod = methods.FirstOrDefault(m => m.GetParameters().Length == 0);

                if (simplifyMethod != null)
                {
                    var result = simplifyMethod.Invoke(entity, null);
                    return result?.ToString() ?? entity.ToString();
                }
                else
                {
                    // Si no hay método sin parámetros, devolver la entidad tal cual
                    return entity.ToString();
                }
            }
            catch (Exception ex)
            {
                LogDebug($"Simplify ERROR: {ex.Message}");
                return entity.ToString();
            }
        }

        public override object Evaluate(string expression, IDictionary<string, double> variables)
        {
            if (!_isAvailable)
                throw new InvalidOperationException("AngouriMath not available");

            var entity = ParseExpression(expression);

            // Sustituir variables
            if (variables != null)
            {
                var substituteMethod = _entityType.GetMethod("Substitute", new[] { typeof(string), typeof(double) });
                foreach (var v in variables)
                {
                    entity = substituteMethod?.Invoke(entity, new object[] { v.Key, v.Value });
                }
            }

            // Evaluar numéricamente
            var evalMethod = _entityType.GetMethod("EvalNumerical");
            var result = evalMethod?.Invoke(entity, null);

            return result;
        }

        public override bool Validate(string expression, out string error)
        {
            error = null;

            if (!_isAvailable)
            {
                error = "AngouriMath not available";
                return false;
            }

            try
            {
                ParseExpression(expression);
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        /// <summary>
        /// Formatea una expresión matemática como HTML siguiendo exactamente el formato de Hekatan.
        /// Variables: <var>, Funciones: <b>, Exponentes: <sup>, Fracciones: <span class="dvc">, Números y operadores: texto plano
        /// </summary>
        private string FormatMathExpression(string expr, bool processFractions = true)
        {
            if (string.IsNullOrEmpty(expr))
                return expr;

            // Si procesamos fracciones, primero detectarlas y procesarlas recursivamente
            if (processFractions)
            {
                expr = ProcessFractions(expr);
            }

            // Funciones matemáticas que usan <b> en Hekatan
            var mathFunctions = new[] { "sin", "cos", "tan", "log", "ln", "exp", "sqrt", "abs", "csc", "sec", "cot" };

            var result = new StringBuilder();
            var i = 0;

            while (i < expr.Length)
            {
                var c = expr[i];

                // Si encontramos HTML (de fracciones ya formateadas), copiarlo tal cual
                if (c == '<')
                {
                    // Extraer el nombre de la etiqueta
                    var tagStart = i;
                    i++;
                    var tagName = new StringBuilder();
                    while (i < expr.Length && (char.IsLetterOrDigit(expr[i]) || expr[i] == '/'))
                    {
                        if (expr[i] != '/')
                            tagName.Append(expr[i]);
                        i++;
                    }

                    // Copiar hasta el cierre de la etiqueta de apertura
                    while (i < expr.Length && expr[i] != '>')
                        i++;

                    if (i < expr.Length)
                        i++; // Saltar >

                    // Si es una etiqueta con cierre (var, span, b, sup), buscar el cierre
                    var tag = tagName.ToString();
                    if (tag == "var" || tag == "span" || tag == "b" || tag == "sup")
                    {
                        var closeTag = $"</{tag}>";
                        var closeIndex = expr.IndexOf(closeTag, i);
                        if (closeIndex != -1)
                        {
                            // Copiar todo desde tagStart hasta después del cierre
                            result.Append(expr.Substring(tagStart, closeIndex + closeTag.Length - tagStart));
                            i = closeIndex + closeTag.Length;
                            continue;
                        }
                    }

                    // Si no encontramos cierre o es auto-cerrada, copiar lo que tenemos
                    result.Append(expr.Substring(tagStart, i - tagStart));
                    continue;
                }

                // Letras: variables o funciones
                if (char.IsLetter(c))
                {
                    var name = new StringBuilder();
                    name.Append(c);
                    i++;

                    // Capturar palabra completa
                    while (i < expr.Length && (char.IsLetterOrDigit(expr[i]) || expr[i] == '_'))
                    {
                        name.Append(expr[i]);
                        i++;
                    }

                    var identifier = name.ToString();

                    // Funciones usan <b>, variables usan <var>
                    if (mathFunctions.Contains(identifier.ToLower()))
                        result.Append($"<b>{identifier}</b>");
                    else
                        result.Append($"<var>{identifier}</var>");

                    continue;
                }

                // Exponentes: ^ seguido del exponente
                if (c == '^')
                {
                    i++;

                    // Saltar espacios
                    while (i < expr.Length && char.IsWhiteSpace(expr[i]))
                        i++;

                    // Exponente entre paréntesis
                    if (i < expr.Length && expr[i] == '(')
                    {
                        result.Append("<sup>");
                        i++;
                        var exponent = new StringBuilder();
                        int parenCount = 1;

                        while (i < expr.Length && parenCount > 0)
                        {
                            if (expr[i] == '(') parenCount++;
                            if (expr[i] == ')') parenCount--;

                            if (parenCount > 0)
                                exponent.Append(expr[i]);

                            i++;
                        }

                        result.Append(FormatMathExpression(exponent.ToString()));
                        result.Append("</sup>");
                    }
                    // Exponente simple
                    else
                    {
                        result.Append("<sup>");
                        var exponent = new StringBuilder();

                        // Signo
                        if (i < expr.Length && (expr[i] == '-' || expr[i] == '+'))
                        {
                            exponent.Append(expr[i]);
                            i++;
                        }

                        // Capturar exponente
                        while (i < expr.Length && (char.IsLetterOrDigit(expr[i]) || expr[i] == '.'))
                        {
                            exponent.Append(expr[i]);
                            i++;
                        }

                        result.Append(FormatMathExpression(exponent.ToString()));
                        result.Append("</sup>");
                    }
                    continue;
                }

                // Todo lo demás (números, operadores, paréntesis, espacios) = texto plano
                result.Append(c);
                i++;
            }

            return result.ToString();
        }

        /// <summary>
        /// Detecta y procesa fracciones, formateando numerador y denominador recursivamente
        /// </summary>
        private string ProcessFractions(string expr)
        {
            var result = new StringBuilder();
            var i = 0;

            while (i < expr.Length)
            {
                // Buscar el operador /
                var divIndex = expr.IndexOf('/', i);
                if (divIndex == -1)
                {
                    // No hay más divisiones, agregar el resto
                    result.Append(expr.Substring(i));
                    break;
                }

                // Encontrar el numerador (hacia atrás desde /)
                int numStart = FindNumeratorStart(expr, divIndex);

                // Agregar todo antes del numerador
                result.Append(expr.Substring(i, numStart - i));

                // Encontrar el denominador (hacia adelante desde /)
                int denEnd = FindDenominatorEnd(expr, divIndex + 1);

                // Extraer numerador y denominador
                string numerator = expr.Substring(numStart, divIndex - numStart).Trim();
                string denominator = expr.Substring(divIndex + 1, denEnd - divIndex - 1).Trim();

                // Formatear numerador y denominador recursivamente (sin procesar más fracciones)
                string formattedNum = FormatMathExpression(numerator, false);
                string formattedDen = FormatMathExpression(denominator, false);

                // Formatear como fracción de Hekatan
                result.Append($"<span class=\"dvc\">{formattedNum}<span class=\"dvl\"></span>{formattedDen}</span>");

                i = denEnd;
            }

            return result.ToString();
        }

        /// <summary>
        /// Encuentra el inicio del numerador retrocediendo desde la división
        /// </summary>
        private int FindNumeratorStart(string expr, int divIndex)
        {
            int parenCount = 0;
            int i = divIndex - 1;

            // Saltar espacios
            while (i >= 0 && char.IsWhiteSpace(expr[i]))
                i--;

            // Si termina en ), buscar el ( correspondiente
            if (i >= 0 && expr[i] == ')')
            {
                parenCount = 1;
                i--;
                while (i >= 0 && parenCount > 0)
                {
                    if (expr[i] == ')') parenCount++;
                    if (expr[i] == '(') parenCount--;
                    i--;
                }
                // Ahora i está antes del (
                // Verificar si hay algo antes (como una función o variable)
                while (i >= 0 && (char.IsLetterOrDigit(expr[i]) || expr[i] == '_'))
                    i--;

                return i + 1;
            }

            // Buscar hacia atrás hasta encontrar un operador de baja precedencia o inicio
            while (i >= 0)
            {
                var c = expr[i];

                // Operadores de baja precedencia terminan el numerador
                if (c == '+' || c == '-' || c == '=' || c == '<' || c == '>' || c == ',')
                {
                    // Si es - al inicio o después de (, es signo negativo, no operador
                    if (c == '-' && (i == 0 || expr[i - 1] == '(' || expr[i - 1] == ','))
                    {
                        i--;
                        continue;
                    }
                    return i + 1;
                }

                // Paréntesis de apertura termina el numerador
                if (c == '(' && parenCount == 0)
                {
                    return i + 1;
                }

                if (c == ')')
                    parenCount++;
                if (c == '(')
                    parenCount--;

                i--;
            }

            return 0; // Inicio de la expresión
        }

        /// <summary>
        /// Encuentra el final del denominador avanzando desde después de la división
        /// </summary>
        private int FindDenominatorEnd(string expr, int start)
        {
            int i = start;
            int parenCount = 0;

            // Saltar espacios
            while (i < expr.Length && char.IsWhiteSpace(expr[i]))
                i++;

            // Si empieza con (, buscar el ) correspondiente
            if (i < expr.Length && expr[i] == '(')
            {
                parenCount = 1;
                i++;
                while (i < expr.Length && parenCount > 0)
                {
                    if (expr[i] == '(') parenCount++;
                    if (expr[i] == ')') parenCount--;
                    i++;
                }
                return i;
            }

            // Buscar hacia adelante hasta encontrar un operador de baja precedencia
            while (i < expr.Length)
            {
                var c = expr[i];

                // Operadores de baja precedencia terminan el denominador
                if (c == '+' || c == '-' || c == '=' || c == '<' || c == '>' || c == ',' || c == ')')
                {
                    // Si es - al inicio, es signo negativo
                    if (c == '-' && i == start)
                    {
                        i++;
                        continue;
                    }
                    return i;
                }

                // Espacios después de un número/variable pueden terminar el denominador
                if (char.IsWhiteSpace(c))
                {
                    // Mirar adelante para ver si sigue otro término
                    int j = i + 1;
                    while (j < expr.Length && char.IsWhiteSpace(expr[j]))
                        j++;

                    if (j < expr.Length && (expr[j] == '+' || expr[j] == '-' || expr[j] == '=' ||
                        expr[j] == '*' || expr[j] == '(' || expr[j] == ')'))
                        return i;
                }

                i++;
            }

            return expr.Length; // Final de la expresión
        }
    }
}
