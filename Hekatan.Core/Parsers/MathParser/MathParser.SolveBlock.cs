using DocumentFormat.OpenXml.Office2016.Drawing.Command;
using System;
using System.Collections.Frozen;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Text;

namespace Hekatan.Core
{
    public partial class MathParser
    {
        private sealed class SolverBlock
        {
            internal enum SolverTypes
            {
                None,
                Find,
                Root,
                Sup,
                Inf,
                Area,
                Integral,
                DoubleIntegral,
                TripleIntegral,
                Gauss1D,
                Gauss2D,
                Gauss3D,
                Slope,
                Derivative,
                Repeat,
                While,
                Sum,
                Product,
                Inline,
                Block,
                Error
            }

            private static readonly FrozenDictionary<string, SolverTypes> Definitions = new Dictionary<string, SolverTypes>()
            {
                { "$find", SolverTypes.Find },
                { "$root", SolverTypes.Root },
                { "$sup", SolverTypes.Sup },
                { "$inf", SolverTypes.Inf },
                { "$area", SolverTypes.Area },
                { "$integral", SolverTypes.Integral },
                { "$int", SolverTypes.Integral },
                { "$dint", SolverTypes.DoubleIntegral },
                { "$double_integral", SolverTypes.DoubleIntegral },
                { "$tint", SolverTypes.TripleIntegral },
                { "$triple_integral", SolverTypes.TripleIntegral },
                { "$gauss", SolverTypes.Gauss1D },
                { "$gauss2d", SolverTypes.Gauss2D },
                { "$gauss3d", SolverTypes.Gauss3D },
                { "$slope", SolverTypes.Slope },
                { "$derivative", SolverTypes.Derivative },
                { "$deriv", SolverTypes.Derivative },
                { "$diff", SolverTypes.Derivative },
                { "$repeat", SolverTypes.Repeat },
                { "$while", SolverTypes.While },
                { "$sum", SolverTypes.Sum },
                { "$product", SolverTypes.Product },
                { "$prod", SolverTypes.Product },
                { "$inline", SolverTypes.Inline },
                { "$block", SolverTypes.Block },
            }.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);

            private static readonly string[] TypeNames =
            [
                string.Empty,
                "$Find",
                "$Root",
                "$Sup",
                "$inf",
                "∫",
                "∫",
                "∬",
                "∭",
                "G₁",
                "G₂",
                "G₃",
                "d/dt",
                "d/dt",
                "$Repeat",
                "$While",
                "∑",
                "∏",
                string.Empty,
                string.Empty,
                "$Error"
            ];
            private readonly Dictionary<string, Variable> _localVariables = [];
            private readonly MathParser _parser;
            private readonly SolverTypes _type;
            private Variable _var;
            private Variable _var2, _var3;
            private IScalarValue _va = RealValue.NaN, _vb = RealValue.NaN;
            private IScalarValue _va2 = RealValue.NaN, _vb2 = RealValue.NaN;
            private IScalarValue _va3 = RealValue.NaN, _vb3 = RealValue.NaN;
            private SolverItem[] _items;
            private Func<IValue> _a, _b, _f, _y;
            private Func<IValue> _a2, _b2, _a3, _b3;

            private string Script { get; }
            internal event Action OnChange;
            internal IValue Result { get; private set; }
            internal bool IsFigure { get; private set; }
            internal SolverBlock(string script, SolverTypes type, MathParser parser)
            {
                Script = script;
                _type = type;
                _parser = parser;
                Parse();
            }
            private bool IsBlock => _type == SolverTypes.Inline || _type == SolverTypes.Block || _type == SolverTypes.While;

            internal static SolverTypes GetSolverType(ReadOnlySpan<char> keyword)
            {
                var s = keyword.Trim().ToString();
                if (Definitions.TryGetValue(s, out SolverTypes value))
                    return value;

                return SolverTypes.Error;
            }

            private static string TypeName(SolverTypes st)
            {
                var i = (int)st;
                if (i >= 0 && i < (int)SolverTypes.Error)
                    return TypeNames[i];

                return TypeNames[(int)SolverTypes.Error];
            }

            private void Parse()
            {
                var targetUnits = _parser._targetUnits;
                if (IsBlock)
                {
                    _parser._input.AddLocalVariables(_localVariables);
                    _items = ParseBlockOrInline(Script);
                    _parser._input.RemoveLocalVariables();
                }
                else
                    _items = ParseSolver(Script);

                _parser._targetUnits = targetUnits;
                RenderOutput();
            }

            private SolverItem[] ParseSolver(string script)
            {
                var n = 3;
                string delimiters = "@=:";
                if (_type == SolverTypes.Slope || _type == SolverTypes.Derivative || _type == SolverTypes.Gauss1D)
                    n = 2;
                else if (_type == SolverTypes.Gauss2D)
                {
                    n = 4;
                    delimiters = "@=@=";
                }
                else if (_type == SolverTypes.Gauss3D)
                {
                    n = 6;
                    delimiters = "@=@=@=";
                }
                else if (_type == SolverTypes.DoubleIntegral)
                {
                    n = 6;
                    delimiters = "@=:@=:";
                }
                else if (_type == SolverTypes.TripleIntegral)
                {
                    n = 9;
                    delimiters = "@=:@=:@=:";
                }

                var items = new SolverItem[n + 1];
                int current = 0, bracketCounter = 0, equalityIndex = -1;
                var ts = new TextSpan(script);
                var len = script.Length;
                for (int i = 0; i < len; ++i)
                {
                    var c = script[i];
                    if (c == '{')
                        ++bracketCounter;
                    else if (c == '}')
                        --bracketCounter;

                    if (_type == SolverTypes.Root && bracketCounter == 0 && current == 0 && c == '=')
                    {
                        if (equalityIndex == -1)
                            equalityIndex = i;
                        else
                            throw Exceptions.MultipleAssignments($"{ts.Cut()} ...");
                    }
                    if (bracketCounter == 0 && current < n && c == delimiters[current])
                    {
                        ts.ExpandTo(i);
                        items[current].Input = ts.Cut().ToString();
                        ts.Reset(i + 1);
                        ++current;
                    }
                    else
                        ts.Expand();
                }
                ts.ExpandTo(len);
                items[current].Input = ts.Cut().ToString();
                for (int i = 0; i <= n; ++i)
                    if (string.IsNullOrWhiteSpace(items[i].Input))
                    {
                        var j = i == 0 ? 0 : i - 1;
                        throw Exceptions.MissingDelimiter(delimiters[j], $"{TypeName(_type)}{{{script}}}");
                    }

                if (_type == SolverTypes.Repeat)
                {
                    var additionalItems = ParseBlockOrInline(items[0].Input);
                    len = additionalItems.Length - 1;
                    if (len > 0)
                    {
                        items[0] = additionalItems[0];
                        n = 3 + len;
                        SolverItem[] result = new SolverItem[n + 1];
                        Array.Copy(items, 0, result, 0, 4);
                        Array.Copy(additionalItems, 1, result, 4, len);
                        items = result;
                    }
                }
                else if (_type == SolverTypes.Root)
                {
                    if (equalityIndex != -1)
                    {
                        ref var item = ref items[0];
                        var s = item.Input;
                        item.Input = s[..equalityIndex];
                        Array.Resize(ref items, 5);
                        items[4].Input = s[(equalityIndex + 1)..];
                        n = 4;
                    }
                }
                var allowAssignment = _type == SolverTypes.Repeat || _type == SolverTypes.Root;
                for (int i = 0; i <= n; ++i)
                {
                    ref var item = ref items[i];
                    item.Input = item.Input.Trim();
                    _parser.Parse(item.Input, (i == 0 || i > 3) && allowAssignment);
                    item.Rpn = _parser._rpn;
                }
                if (_type == SolverTypes.Inf || _type == SolverTypes.Sup)
                {
                    var s = items[1].Input + (_type == SolverTypes.Sup ? "_sup" : "_inf");
                    _parser.SetVariable(s, RealValue.NaN);
                }

                // Extract integration variables
                var paramList = new List<Parameter>();
                var rpn = items[1].Rpn;
                if (rpn.Length == 1 && rpn[0] is VariableToken vt)
                {
                    paramList.Add(new(vt.Content));
                    vt.Variable = paramList[^1].Variable;
                    _var = vt.Variable;
                }
                else
                    throw Exceptions.CounterMustBeASingleVariableName();

                // Second variable for double/triple integral or Gauss 2D/3D
                if (_type == SolverTypes.DoubleIntegral || _type == SolverTypes.TripleIntegral ||
                    _type == SolverTypes.Gauss2D || _type == SolverTypes.Gauss3D)
                {
                    // For double integral: items[4] = var2
                    // For Gauss2D: items[3] = var2 (pattern @=@=)
                    int var2Index = (_type == SolverTypes.Gauss2D || _type == SolverTypes.Gauss3D) ? 3 : 4;
                    rpn = items[var2Index].Rpn;
                    if (rpn.Length == 1 && rpn[0] is VariableToken vt2)
                    {
                        paramList.Add(new(vt2.Content));
                        vt2.Variable = paramList[^1].Variable;
                        _var2 = vt2.Variable;
                    }
                    else
                        throw Exceptions.CounterMustBeASingleVariableName();
                }

                // Third variable for triple integral or Gauss 3D
                if (_type == SolverTypes.TripleIntegral || _type == SolverTypes.Gauss3D)
                {
                    // For triple integral: items[7] = var3
                    // For Gauss3D: items[5] = var3 (pattern @=@=@=)
                    int var3Index = _type == SolverTypes.Gauss3D ? 5 : 7;
                    rpn = items[var3Index].Rpn;
                    if (rpn.Length == 1 && rpn[0] is VariableToken vt3)
                    {
                        paramList.Add(new(vt3.Content));
                        vt3.Variable = paramList[^1].Variable;
                        _var3 = vt3.Variable;
                    }
                    else
                        throw Exceptions.CounterMustBeASingleVariableName();
                }

                Parameter[] parameters = [.. paramList];

                if (_parser.IsEnabled)
                {
                    rpn = items[0].Rpn;
                    _parser.BindParameters(parameters, rpn);
                    _parser.SubscribeOnChange(rpn, Clear);
                    _parser.SubscribeOnChange(items[2].Rpn, Clear);
                    if (items.Length > 3)
                    {
                        rpn = items[3].Rpn;
                        if (rpn is not null)
                            _parser.SubscribeOnChange(rpn, Clear);
                    }
                    // Subscribe to change events for double/triple integral bounds
                    if (_type == SolverTypes.DoubleIntegral || _type == SolverTypes.TripleIntegral)
                    {
                        _parser.SubscribeOnChange(items[5].Rpn, Clear);
                        _parser.SubscribeOnChange(items[6].Rpn, Clear);
                    }
                    if (_type == SolverTypes.TripleIntegral)
                    {
                        _parser.SubscribeOnChange(items[8].Rpn, Clear);
                        _parser.SubscribeOnChange(items[9].Rpn, Clear);
                    }
                }
                if (_type == SolverTypes.Repeat)
                    for(int i = 0; i < items.Length; i++)
                        if (i == 0 || i > 3)
                        {
                            rpn = items[i].Rpn;
                            if (rpn is not null && rpn.Length > 0)
                            {
                                FixRepeat(rpn);
                                if (i > 3)
                                {
                                    _parser.BindParameters(parameters, rpn);
                                    _parser.SubscribeOnChange(rpn, Clear);
                                }
                            }
                        }

                IsFigure = _type == SolverTypes.Sum ||
                   _type == SolverTypes.Product ||
                   _type == SolverTypes.Integral ||
                   _type == SolverTypes.DoubleIntegral ||
                   _type == SolverTypes.TripleIntegral ||
                   _type == SolverTypes.Area;

                return items;
            }

            private SolverItem[] ParseBlockOrInline(string script)
            {
                int bracketCounter = 0, curlyBracketCounter = 0, squareBracketCounter = 0;
                var ts = new TextSpan(script);
                var len = script.Length;
                var itemList = new List<SolverItem>();
                for (int i = 0; i < len; ++i)
                {
                    var c = script[i];
                    if (c == '(')
                        ++bracketCounter;
                    else if (c == ')')
                        --bracketCounter;
                    else if(c == '[')
                        ++squareBracketCounter;
                    else if (c == ']')
                        --squareBracketCounter;
                    else if(c == '{')
                        ++curlyBracketCounter;
                    else if (c == '}')
                        --curlyBracketCounter;

                    if (bracketCounter == 0 && 
                        squareBracketCounter == 0 && 
                        curlyBracketCounter == 0 && 
                        c == ';')
                    {
                        ts.ExpandTo(i);
                        itemList.Add(new SolverItem() { Input = ts.Cut().ToString() });
                        ts.Reset(i + 1);
                    }
                    else
                        ts.Expand();
                }
                ts.ExpandTo(len);
                itemList.Add(new SolverItem() { Input = ts.Cut().ToString() });
                var n = itemList.Count - 1;
                var itemArray = itemList.ToArray();
                for (int i = 0; i <= n; ++i)
                {
                    ref var item = ref itemArray[i];
                    item.Input = item.Input.Trim();
                    _parser.Parse(item.Input,true);
                    item.Rpn = _parser._rpn;
                }
                return itemArray;
            }

            private void RenderOutput()
            {
                for (int i = 0, n = _items.Length; i < n; ++i)
                    _items[i].Render(_parser);

                if (IsFigure)
                {
                    var order = Calculator.OperatorOrder[Calculator.OperatorIndex['*']];
                    var rpn = _items[0].Rpn;
                    var t = rpn[^1];
                    if (t.Order > order)
                    {
                        ref var item = ref _items[0];
                        item.Html = new HtmlWriter(_parser._settings, _parser.Phasor).AddBrackets(item.Html, 1);
                        item.Xml = new XmlWriter(_parser._settings, _parser.Phasor).AddBrackets(item.Xml, 1);
                    }
                }
            }

            private static void FixRepeat(Token[] rpn)
            {
                ref var rpn0 = ref rpn[0];
                if (rpn[^1].Content == "=" && rpn0.Index == -1)
                {
                    rpn0.Index = 1;
                    for (int i = 0, len = rpn.Length; i < len; ++i)
                        if (rpn[i].Type == TokenTypes.Variable && rpn[i].Content == rpn0.Content)
                            rpn[i].Index = 1;
                }
            }

            private void Compile() 
            {
                var allowAssignment =
                    _type == SolverTypes.Repeat || IsBlock;
                _f = _parser.CompileRpn(_items[0].Rpn, allowAssignment);

                var len = _items.Length;
                if (allowAssignment)
                {
                    var i0 = _type == SolverTypes.Repeat ? 4 : 1;
                    if (len > i0)
                    {
                        var e = _parser.RpnToExpressionTree(_items[0].Rpn, allowAssignment);
                        var expressions = new List<Expression>(len - i0 + 1) { e };
                        for (int i = i0; i < len; ++i)
                        {
                            var rpn_i = _items[i].Rpn;
                            if (rpn_i.Length > 0)
                            {
                                e = _parser.RpnToExpressionTree(rpn_i, true);
                                expressions.Add(e);
                            }
                        }
                        if (_type == SolverTypes.While)
                            _f = Compiler.CompileWhileBLock(expressions);
                        else
                        {
                            var body = Expression.Block(expressions);
                            var lambda = Expression.Lambda<Func<IValue>>(body);
                            _f = lambda.Compile();
                        }

                    }
                    if (i0 == 1)
                        return;
                }
                var rpn = _items[2].Rpn;
                if (rpn.Length == 1 &&
                    rpn[0].Type == TokenTypes.Constant)
                    _va = ((ValueToken)rpn[0]).Value;
                else
                    _a = _parser.CompileRpn(rpn);

                
                if (len > 3)
                {
                    rpn = _items[3].Rpn;
                    if (rpn is not null)
                    {
                        if (rpn.Length == 1 &&
                            rpn[0].Type == TokenTypes.Constant)
                            _vb = ((ValueToken)rpn[0]).Value;
                        else
                            _b = _parser.CompileRpn(rpn);
                    }
                }

                if (_type == SolverTypes.DoubleIntegral || _type == SolverTypes.TripleIntegral)
                {
                    // Compile bounds for second variable: items[5]=start2, items[6]=end2
                    rpn = _items[5].Rpn;
                    if (rpn.Length == 1 && rpn[0].Type == TokenTypes.Constant)
                        _va2 = ((ValueToken)rpn[0]).Value;
                    else
                        _a2 = _parser.CompileRpn(rpn);

                    rpn = _items[6].Rpn;
                    if (rpn.Length == 1 && rpn[0].Type == TokenTypes.Constant)
                        _vb2 = ((ValueToken)rpn[0]).Value;
                    else
                        _b2 = _parser.CompileRpn(rpn);

                    if (_type == SolverTypes.TripleIntegral)
                    {
                        // Compile bounds for third variable: items[8]=start3, items[9]=end3
                        rpn = _items[8].Rpn;
                        if (rpn.Length == 1 && rpn[0].Type == TokenTypes.Constant)
                            _va3 = ((ValueToken)rpn[0]).Value;
                        else
                            _a3 = _parser.CompileRpn(rpn);

                        rpn = _items[9].Rpn;
                        if (rpn.Length == 1 && rpn[0].Type == TokenTypes.Constant)
                            _vb3 = ((ValueToken)rpn[0]).Value;
                        else
                            _b3 = _parser.CompileRpn(rpn);
                    }
                }
                else if (_type == SolverTypes.Gauss2D || _type == SolverTypes.Gauss3D)
                {
                    // Gauss2D: items[4] = order2
                    rpn = _items[4].Rpn;
                    if (rpn.Length == 1 && rpn[0].Type == TokenTypes.Constant)
                        _va2 = ((ValueToken)rpn[0]).Value;
                    else
                        _a2 = _parser.CompileRpn(rpn);

                    if (_type == SolverTypes.Gauss3D)
                    {
                        // Gauss3D: items[6] = order3
                        rpn = _items[6].Rpn;
                        if (rpn.Length == 1 && rpn[0].Type == TokenTypes.Constant)
                            _va3 = ((ValueToken)rpn[0]).Value;
                        else
                            _a3 = _parser.CompileRpn(rpn);
                    }
                }
                else if (len > 4)
                {
                    rpn = _items[4].Rpn;
                    if (rpn is not null && rpn.Length > 0)
                        _y = _parser.CompileRpn(_items[4].Rpn);
                }
            }

            internal void BindParameters(ReadOnlySpan<Parameter> parameters, MathParser parser)
            {
                if (parser.IsEnabled)
                    for (int i = 0, len = _items.Length; i < len; ++i)
                        if (i != 1 || IsBlock)
                            parser.BindParameters(parameters, _items[i].Rpn);
            }

            private void Clear() => OnChange?.Invoke();

            internal IValue Calculate()
            {
                if (_f is null)
                    Compile();

                if (IsBlock)
                {
                    Result = _f();
                    return Result;
                }
                var x1 = IValue.AsReal((_a?.Invoke() ?? _va));
                if (_type == SolverTypes.Derivative)
                {
                    Result = Derivative(x1);
                    return Result;
                }

                // Gauss quadrature: x1 is the order (integer), not a limit
                if (_type == SolverTypes.Gauss1D || _type == SolverTypes.Gauss2D || _type == SolverTypes.Gauss3D)
                {
                    Result = CalculateGauss((int)Math.Round(x1.D));
                    return Result;
                }

                var x2 = RealValue.Zero;
                var y = 0d;
                var ux1 = x1.Units;
                if (_type != SolverTypes.Slope)
                {
                    x2 = IValue.AsReal((_b?.Invoke() ?? _vb), Exceptions.Items.Limit);
                    var ux2 = x2.Units;
                    if (!Unit.IsConsistent(ux1, ux2))
                        throw Exceptions.InconsistentUnits2(_items[0].Input, Unit.GetText(ux1), Unit.GetText(ux2));

                    if (ux2 is not null)
                        x2 *= ux2.ConvertTo(ux1);
                }
                _var.SetValue(x1);
                if (_type == SolverTypes.Root && _y is not null)
                {
                    var y1 = IValue.AsReal(_f(), Exceptions.Items.Result);
                    var uy1 = y1.Units;
                    y1 = IValue.AsReal(_y(), Exceptions.Items.Result);
                    _var.SetNumber(x2.D);
                    var y2 = IValue.AsReal(_y(), Exceptions.Items.Result);
                    if (Math.Abs(y2.D - y1.D) > 1e-14)
                        throw Exceptions.NotConstantExpression(_items[4].Input);

                    y = y1.D;
                    var uy2 = y2.Units;
                    if (!Unit.IsConsistent(uy1, uy2))
                        throw Exceptions.InconsistentUnits1(_items[0].Input, _items[4].Input);

                    if (uy2 is not null)
                        y *= uy2.ConvertTo(uy1);
                }
                var solver = _parser._solver;
                var variable = solver.Variable;
                var function = solver.Function;
                var solverUnits = solver.Units;
                solver.Variable = _var;
                solver.Function = _f;
                solver.Precision = _parser.Precision;
                solver.Units = null;
                IValue result = RealValue.NaN;
                double d = 0d;
                ++_parser._isSolver;
                try
                {
                    switch (_type)
                    {
                        case SolverTypes.Find:
                            d = solver.Find(x1.D, x2.D);
                            result = new RealValue(d);
                            break;
                        case SolverTypes.Root:
                            d = solver.Root(x1.D, x2.D, y);
                            result = new RealValue(d);
                            break;
                        case SolverTypes.Sup:
                            d = solver.Sup(x1.D, x2.D);
                            result = new RealValue(d);
                            break;
                        case SolverTypes.Inf:
                            d = solver.Inf(x1.D, x2.D);
                            result = new RealValue(d);
                            break;
                        case SolverTypes.Area:
                            solver.QuadratureMethod = QuadratureMethods.AdaptiveLobatto;
                            d = solver.Area(x1.D, x2.D);
                            result = new RealValue(d);
                            break;
                        case SolverTypes.Integral:
                            solver.QuadratureMethod = QuadratureMethods.TanhSinh;
                            d = solver.Area(x1.D, x2.D);
                            result = new RealValue(d);
                            break;
                        case SolverTypes.DoubleIntegral:
                        {
                            // ∬ f(x,y) dx dy
                            // Outer: integrate over var2 (second variable, items[4..6])
                            // Inner: integrate over var  (first variable, items[1..3])
                            var s2a = IValue.AsReal((_a2?.Invoke() ?? _va2)).D;
                            var s2b = IValue.AsReal((_b2?.Invoke() ?? _vb2)).D;
                            var innerSolver = new Solver
                            {
                                Precision = _parser.Precision,
                                QuadratureMethod = QuadratureMethods.TanhSinh,
                                Variable = _var,
                                Function = _f
                            };
                            solver.Variable = _var2;
                            solver.QuadratureMethod = QuadratureMethods.TanhSinh;
                            solver.Function = () =>
                            {
                                // For each value of var2, integrate f over var (inner)
                                var innerResult = innerSolver.Area(x1.D, x2.D);
                                return new RealValue(innerResult);
                            };
                            d = solver.Area(s2a, s2b);
                            result = new RealValue(d);
                            break;
                        }
                        case SolverTypes.TripleIntegral:
                        {
                            // ∭ f(x,y,z) dx dy dz
                            // Outermost: integrate over var3 (third variable, items[7..9])
                            // Middle: integrate over var2 (second variable, items[4..6])
                            // Inner: integrate over var (first variable, items[1..3])
                            var s2a = IValue.AsReal((_a2?.Invoke() ?? _va2)).D;
                            var s2b = IValue.AsReal((_b2?.Invoke() ?? _vb2)).D;
                            var s3a = IValue.AsReal((_a3?.Invoke() ?? _va3)).D;
                            var s3b = IValue.AsReal((_b3?.Invoke() ?? _vb3)).D;
                            var innerSolver = new Solver
                            {
                                Precision = _parser.Precision,
                                QuadratureMethod = QuadratureMethods.TanhSinh,
                                Variable = _var,
                                Function = _f
                            };
                            var middleSolver = new Solver
                            {
                                Precision = _parser.Precision,
                                QuadratureMethod = QuadratureMethods.TanhSinh,
                                Variable = _var2,
                                Function = () =>
                                {
                                    var innerResult = innerSolver.Area(x1.D, x2.D);
                                    return new RealValue(innerResult);
                                }
                            };
                            solver.Variable = _var3;
                            solver.QuadratureMethod = QuadratureMethods.TanhSinh;
                            solver.Function = () =>
                            {
                                var midResult = middleSolver.Area(s2a, s2b);
                                return new RealValue(midResult);
                            };
                            d = solver.Area(s3a, s3b);
                            result = new RealValue(d);
                            break;
                        }
                        case SolverTypes.Repeat:
                            result = _parser._settings.IsComplex ?
                                new ComplexValue(solver.ComplexRepeat(x1.D, x2.D)) :
                                solver.Repeat(x1.D, x2.D);
                            break;
                        case SolverTypes.Sum:
                            result = _parser._settings.IsComplex ?
                                new ComplexValue(solver.ComplexSum(x1.D, x2.D)) :
                                new RealValue(solver.Sum(x1.D, x2.D));
                            break;
                        case SolverTypes.Product:
                            result = _parser._settings.IsComplex ?
                                new ComplexValue(solver.ComplexProduct(x1.D, x2.D)) :
                                new RealValue(solver.Product(x1.D, x2.D));
                            break;
                        case SolverTypes.Slope:
                            d = solver.Slope(x1.D);
                            result = new RealValue(d);
                            break;
                    }
                }
                catch (MathParserException e)
                {
                    if (e.Message.Contains("%F"))
                    {
                        var s = e.Message.Replace("%F", _items[0].Input).Replace("%V", _items[1].Input);
                        throw new MathParserException(s);
                    }
                    throw;
                }
                if (_type == SolverTypes.Sup || _type == SolverTypes.Inf)
                {
                    var s = _items[1].Input + (_type == SolverTypes.Sup ? "_sup" : "_inf");
                    _parser.SetVariable(s, (RealValue)_var.Value);
                }
                --_parser._isSolver;

                if (double.IsNaN(d) && !_parser.IsPlotting)
                    throw Exceptions.NoSolution(ToString());

                if (result is RealValue real)
                    Result = new RealValue(real.D, solver.Units);
                else if (result is ComplexValue complex)
                {
                    if (complex.B == 0d)
                        Result = new RealValue(complex.A, solver.Units);
                    else
                        Result = new ComplexValue(complex.A, complex.B, solver.Units);
                }
                else
                    Result = result;

                solver.Variable = variable;
                solver.Function = function;
                solver.Units = solverUnits;
                return Result;
            }

            private IValue Derivative(RealValue value)
            {
                var isReal = !_parser._settings.IsComplex;
                var h = 1e-20;
                var x = new ComplexValue(value.D, h, value.Units);
                IValue result;
                _var.SetValue(x);
                if (isReal)
                {
                    _parser.SetComplex(true);
                    result = _f();
                    _parser.SetComplex(false);
                }
                else
                    result = _f();

                var resultValue = IValue.AsValue(result, Exceptions.Items.Result);
                var complexValue = resultValue.AsComplex();
                return new RealValue(complexValue.B / h, complexValue.Units / value.Units);
            }

            private IValue CalculateGauss(int order)
            {
                if (order < 1) order = 1;
                if (order > 10) order = 10;
                double d;

                if (_type == SolverTypes.Gauss1D)
                {
                    // 1D: ∫_{-1}^{1} f(ξ) dξ ≈ Σ w_i * f(ξ_i)
                    d = GaussQuadrature.Integrate1D(xi =>
                    {
                        _var.SetNumber(xi);
                        var result = IValue.AsReal(_f(), Exceptions.Items.Result);
                        return result.D;
                    }, order);
                }
                else if (_type == SolverTypes.Gauss2D)
                {
                    // 2D quad: ∫∫_{[-1,1]²} f(ξ,η) dξ dη
                    // items[2] = order for var1, items[4] = order for var2
                    int order2 = (int)Math.Round(IValue.AsReal((_a2?.Invoke() ?? _va2)).D);
                    if (order2 < 1) order2 = 1;
                    if (order2 > 10) order2 = 10;
                    d = GaussQuadrature.Integrate2DQuad((xi, eta) =>
                    {
                        _var.SetNumber(xi);
                        _var2.SetNumber(eta);
                        var result = IValue.AsReal(_f(), Exceptions.Items.Result);
                        return result.D;
                    }, order, order2);
                }
                else // Gauss3D
                {
                    // 3D hex: ∫∫∫_{[-1,1]³} f(ξ,η,ζ) dξ dη dζ
                    int order2 = (int)Math.Round(IValue.AsReal((_a2?.Invoke() ?? _va2)).D);
                    int order3 = (int)Math.Round(IValue.AsReal((_a3?.Invoke() ?? _va3)).D);
                    if (order2 < 1) order2 = 1;
                    if (order2 > 10) order2 = 10;
                    if (order3 < 1) order3 = 1;
                    if (order3 > 10) order3 = 10;
                    d = GaussQuadrature.Integrate3DHex((xi, eta, zeta) =>
                    {
                        _var.SetNumber(xi);
                        _var2.SetNumber(eta);
                        _var3.SetNumber(zeta);
                        var result = IValue.AsReal(_f(), Exceptions.Items.Result);
                        return result.D;
                    }, order, order2, order3);
                }

                Result = new RealValue(d);
                return Result;
            }

            internal string ToHtml(bool formatEquations)
            {
                var len = _items.Length;
                var writer = new HtmlWriter(_parser._settings, _parser.Phasor);
                if (IsBlock)
                {
                    var html = new string[len];
                    for (int i = 0; i < len; ++i)
                        html[i] = _items[i].Html;

                    if (_type == SolverTypes.Inline)
                        html = [string.Join("; ",  html)];
                    else if (_type == SolverTypes.While)
                        html[0] = $"<span class=\"cond\">while</span> {html[0]}";

                    return writer.FormatBlock(html);
                }
                if (formatEquations)
                {
                    if (_type == SolverTypes.Integral || _type == SolverTypes.Area)
                        return writer.FormatNary(
                            $"<em>{TypeName(_type)}</em>",
                            _items[2].Html + "&nbsp;",
                            "&ensp;" + _items[3].Html,
                            string.Concat(_items[0].Html, " d", _items[1].Html)
                            );

                    if (_type == SolverTypes.DoubleIntegral)
                    {
                        // ∬ f dx dy with nested integral signs
                        var innerIntegral = writer.FormatNary(
                            "<em>∫</em>",
                            _items[2].Html + "&nbsp;",
                            "&ensp;" + _items[3].Html,
                            string.Concat(_items[0].Html, " d", _items[1].Html, " d", _items[4].Html)
                            );
                        return writer.FormatNary(
                            "<em>∫</em>",
                            _items[5].Html + "&nbsp;",
                            "&ensp;" + _items[6].Html,
                            innerIntegral
                            );
                    }

                    if (_type == SolverTypes.TripleIntegral)
                    {
                        // ∭ f dx dy dz with nested integral signs
                        var innerIntegral = writer.FormatNary(
                            "<em>∫</em>",
                            _items[2].Html + "&nbsp;",
                            "&ensp;" + _items[3].Html,
                            string.Concat(_items[0].Html, " d", _items[1].Html, " d", _items[4].Html, " d", _items[7].Html)
                            );
                        var middleIntegral = writer.FormatNary(
                            "<em>∫</em>",
                            _items[5].Html + "&nbsp;",
                            "&ensp;" + _items[6].Html,
                            innerIntegral
                            );
                        return writer.FormatNary(
                            "<em>∫</em>",
                            _items[8].Html + "&nbsp;",
                            "&ensp;" + _items[9].Html,
                            middleIntegral
                            );
                    }

                    if (_type == SolverTypes.Gauss1D)
                    {
                        // Gauss₁(n) f(ξ) - show as G_n [f(ξ)]
                        return $"<span class=\"cond\">Gauss</span><sub>{_items[2].Html}</sub>" +
                               $"&nbsp;{_items[0].Html}&nbsp;d{_items[1].Html}";
                    }

                    if (_type == SolverTypes.Gauss2D)
                    {
                        return $"<span class=\"cond\">Gauss</span><sub>{_items[2].Html}×{_items[4].Html}</sub>" +
                               $"&nbsp;{_items[0].Html}&nbsp;d{_items[1].Html}&nbsp;d{_items[3].Html}";
                    }

                    if (_type == SolverTypes.Gauss3D)
                    {
                        return $"<span class=\"cond\">Gauss</span><sub>{_items[2].Html}×{_items[4].Html}×{_items[6].Html}</sub>" +
                               $"&nbsp;{_items[0].Html}&nbsp;d{_items[1].Html}&nbsp;d{_items[3].Html}&nbsp;d{_items[5].Html}";
                    }

                    if (_type == SolverTypes.Sum || _type == SolverTypes.Product)
                        return writer.FormatNary(
                            TypeName(_type),
                            string.Concat(_items[1].Html, "=&hairsp;", _items[2].Html),
                            _items[3].Html,
                            _items[0].Html
                            );

                    if (_type == SolverTypes.Slope || _type == SolverTypes.Derivative)
                    {
                        return writer.AddBrackets(
                            string.Concat(
                                writer.FormatDivision("<em>d</em>", $"<em>d</em>\u200A{_items[1].Html}", 0),
                                "&nbsp;",
                                _items[0].Html), 1,' ','|') +
                            $"<span class=\"low\"><em>{_items[1].Input}</em>\u200A=\u200A{_items[2].Html}</span>";
                    }
                }
                var sb = new StringBuilder($"<span class=\"cond\">{TypeName(_type)}</span>");
                if (_type == SolverTypes.Repeat && len > 4)
                {
                    var html = new string[len - 2];
                    html[0] = $"<span class=\"cond\">for</span> {_items[1].Html} = {_items[2].Html}...{_items[3].Html}";
                    html[1] = _items[0].Html;
                    for (int i = 4; i < len; ++i)
                        html[i - 2] = _items[i].Html;

                    sb.Append(' ').Append(writer.FormatBlock(html));
                    return sb.ToString();
                }
                sb.Append('{').Append(_items[0].Html);
                if (_type == SolverTypes.Root)
                {
                    if (_items.Length  > 4 &&  _items[4].Html is not null)
                        sb.Append(" = " + _items[4].Html);
                    else
                        sb.Append(" = 0");
                }

                if (_type == SolverTypes.Repeat)
                    sb.Append(" for ");
                else
                    sb.Append("; ");

                sb.Append(_items[1].Html);
                if (_type == SolverTypes.Repeat || _type == SolverTypes.Slope || _type == SolverTypes.Derivative)
                {
                    sb.Append(" = ").Append(_items[2].Html);
                    if (_type == SolverTypes.Repeat)
                    {
                        sb.Append("...").Append(_items[3].Html);
                    }
                    sb.Append('}');
                }
                else
                    sb.Append(" ∈ [")
                        .Append(_items[2].Html)
                        .Append("; ")
                        .Append(_items[3].Html)
                        .Append("]}");

                return sb.ToString();
            }

            internal string ToXml()
            {
                var len = _items.Length;
                var writer = new XmlWriter(_parser._settings, _parser.Phasor);
                if (IsBlock)
                {
                    var xml = new string[len];
                    for (int i = 0; i < len; ++i)
                        xml[i] = _items[i].Xml;

                    if (_type == SolverTypes.Inline)
                        xml = [string.Join(XmlWriter.Run("; "), xml)];
                    else if (_type == SolverTypes.While)
                        xml[0] = string.Concat(XmlWriter.Run(TypeName(_type), XmlWriter.NormalText), " ", xml[0]);

                    return writer.FormatBlock(xml);
                }
                if (_type == SolverTypes.Integral || _type == SolverTypes.Area)
                    return writer.FormatNary(
                        TypeName(_type),
                        _items[2].Xml,
                        _items[3].Xml,
                        _items[0].Xml + XmlWriter.Run(" d") + _items[1].Xml
                        );

                if (_type == SolverTypes.DoubleIntegral)
                {
                    var innerXml = writer.FormatNary(
                        "∫",
                        _items[2].Xml,
                        _items[3].Xml,
                        _items[0].Xml + XmlWriter.Run(" d") + _items[1].Xml + XmlWriter.Run(" d") + _items[4].Xml
                        );
                    return writer.FormatNary(
                        "∫",
                        _items[5].Xml,
                        _items[6].Xml,
                        innerXml
                        );
                }

                if (_type == SolverTypes.TripleIntegral)
                {
                    var innerXml = writer.FormatNary(
                        "∫",
                        _items[2].Xml,
                        _items[3].Xml,
                        _items[0].Xml + XmlWriter.Run(" d") + _items[1].Xml + XmlWriter.Run(" d") + _items[4].Xml + XmlWriter.Run(" d") + _items[7].Xml
                        );
                    var middleXml = writer.FormatNary(
                        "∫",
                        _items[5].Xml,
                        _items[6].Xml,
                        innerXml
                        );
                    return writer.FormatNary(
                        "∫",
                        _items[8].Xml,
                        _items[9].Xml,
                        middleXml
                        );
                }

                if (_type == SolverTypes.Sum || _type == SolverTypes.Product)
                    return writer.FormatNary(
                        TypeName(_type),
                        _items[1].Xml + XmlWriter.Run("=") + _items[2].Xml,
                        _items[3].Xml,
                        _items[0].Xml
                        );

                if (_type == SolverTypes.Slope || _type == SolverTypes.Derivative)
                {
                    return writer.FormatSubscript(writer.AddBrackets(
                        writer.FormatDivision(XmlWriter.Run("d"), $"{XmlWriter.Run("d")}{_items[1].Xml}", 0) +
                            _items[0].Xml, 1, ' ', '|'),
                        $"{XmlWriter.Run(_items[1].Input)}{XmlWriter.Run("\u2009=\u2009")}{_items[2].Xml}");
                }
                var sb = new StringBuilder();
                if (_type == SolverTypes.Repeat && len > 4)
                {
                    sb.Append(XmlWriter.Run(TypeName(_type), XmlWriter.NormalText));
                    var xml = new string[len - 2];
                    xml[0] = $"{XmlWriter.Run("for ", XmlWriter.NormalText)}{_items[1].Xml}{XmlWriter.Run("=")}{_items[2].Xml}{XmlWriter.Run("...")}{_items[3].Xml}";
                    xml[1] = _items[0].Xml;
                    for (int i = 4; i < len; ++i)
                        xml[i - 2] = _items[i].Xml;

                    sb.Append(writer.FormatBlock(xml));
                    return sb.ToString();
                }
                else
                {
                    sb.Append(_items[0].Xml);
                    if (_type == SolverTypes.Root)
                    {
                        if (_items.Length > 4 && _items[4].Xml is not null)
                            sb.Append(XmlWriter.Run("=") + _items[4].Xml);
                        else
                            sb.Append(XmlWriter.Run("=0"));
                    }
                }
                if (_type == SolverTypes.Repeat)
                    sb.Append(XmlWriter.Run(" for ", XmlWriter.NormalText));
                else
                    sb.Append(XmlWriter.Run(";"));

                sb.Append(_items[1].Xml);
                if (_type == SolverTypes.Repeat || _type == SolverTypes.Slope || _type == SolverTypes.Derivative)
                {
                    sb.Append(XmlWriter.Run("=")).Append(_items[2].Xml);
                    if (_type == SolverTypes.Repeat)
                        sb.Append(XmlWriter.Run("...")).Append(_items[3].Xml);
                }
                else
                {
                    sb.Append(XmlWriter.Run("∈"))
                        .Append(XmlWriter.Brackets(_items[2].Xml + XmlWriter.Run(";") + _items[3].Xml, '[', ']'));
                }
                var s = sb.ToString();
                return XmlWriter.Run(TypeName(_type), XmlWriter.NormalText) + XmlWriter.Brackets(s, '{', '}');
            }

            public override string ToString()
            {
                var len = _items.Length;
                var writer = new TextWriter(_parser._settings, _parser.Phasor);
                if (IsBlock)
                {
                    var text = new string[len];
                    for (int i = 0; i < len; ++i)
                        text[i] = _items[i].Input;

                    if (_type == SolverTypes.Inline)
                        text = [string.Join("; ", text)];
                    else if (_type == SolverTypes.While)
                        text[0] = $"<span class=\"cond\">while</span> {text[0]}";

                    return writer.FormatBlock(text);
                }
                if (_type == SolverTypes.Sum ||
                    _type == SolverTypes.Product ||
                    _type == SolverTypes.Integral ||
                    _type == SolverTypes.Area ||
                    _type == SolverTypes.Repeat)
                    return writer.FormatNary(
                        "$" + _type.ToString(),
                        string.Concat(_items[1].Input, " = ", _items[2].Input),
                        _items[3].Input,
                        _items[0].Input
                        );

                var sb = new StringBuilder();
                sb.Append(TypeName(_type)).Append('{');
                if (_type == SolverTypes.Repeat && len > 4)
                {
                    var text = new string[len - 3];
                    text[0] = _items[0].Input;
                    for (int i = 4; i < len; ++i)
                        text[i - 3] = _items[i].Input;

                    sb.Append(writer.FormatBlock(text));
                }
                sb.Append(_items[0].Input);
                if (_type == SolverTypes.Root)
                {
                    if (_items.Length > 4 && _items[4].Input is not null)
                        sb.Append(" = " + _items[4].Input);
                    else
                        sb.Append(" = 0");
                }
                sb.Append("; ").Append(_items[1].Input);
                if (_type == SolverTypes.Slope || _type == SolverTypes.Derivative)
                    sb.Append(" = ")
                        .Append(_items[2].Input)
                        .Append('}');

                else
                    sb.Append(" ∈ [")
                        .Append(_items[2].Input)
                        .Append("; ")
                        .Append(_items[3].Input)
                        .Append("]}");

                return sb.ToString();
            }

            private struct SolverItem
            {
                internal string Input;
                internal string Html;
                internal string Xml;
                internal Token[] Rpn;

                internal void Render(MathParser parser)
                {
                    if (Rpn is not null)
                    {
                        parser._rpn = Rpn;
                        Html = parser.ToHtml();
                        Xml = parser.ToXml();
                    }
                }
            }
        }
    }
}