using System;
using System.Collections.Generic;
using System.Text;

namespace Hekatan.Core
{
    internal class SvgParser : PlotParser
    {
        private readonly List<string> _svgElements = new();
        private readonly List<string> _svgDefs = new();  // Para gradientes, filtros, patrones
        private double _width = 800;
        private double _height = 600;
        private double _viewBoxX = 0;
        private double _viewBoxY = 0;
        private double _viewBoxWidth = 800;
        private double _viewBoxHeight = 600;
        private string _svgStyle = string.Empty;
        private string _widthUnit = string.Empty;
        private string _heightUnit = string.Empty;

        internal SvgParser(MathParser parser, PlotSettings settings) : base(parser, settings) { }

        internal override string Parse(ReadOnlySpan<char> script, bool calculate)
        {
            _svgElements.Clear();
            _svgDefs.Clear();

            var lines = script.ToString().Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith("$svg", StringComparison.OrdinalIgnoreCase))
                {
                    // Parse SVG configuration
                    ParseSvgConfig(trimmed);
                }
                else if (calculate)
                {
                    // Parse SVG elements
                    ParseSvgElement(trimmed);
                }
            }

            if (calculate)
                return GenerateSvgHtml();
            else
                return GetPlaceholderHtml(script.ToString());
        }

        // New methods for line-by-line processing
        internal void ParseSvgConfigLine(string line)
        {
            _svgElements.Clear();
            _svgDefs.Clear();
            ParseSvgConfig(line);
        }

        internal void AddElementLine(string line)
        {
            ParseSvgElement(line);
        }

        internal string GenerateHtml(bool calculate)
        {
            // Always generate the actual SVG image
            // In Input mode, variables may not be calculated yet, but EvalExpression
            // handles this by returning "0" for uncalculated expressions
            // This ensures the SVG is always displayed (like original Hekatan behavior)
            return GenerateSvgHtml();
        }

        private void ParseSvgConfig(string line)
        {
            // $svg{width:800; height:600; style:font-family: Arial; font-size: 20px}
            var start = line.IndexOf('{');
            var end = line.IndexOf('}');

            if (start >= 0 && end > start)
            {
                var config = line.Substring(start + 1, end - start - 1);

                // Extract style parameter separately since it contains semicolons
                string styleValue = null;
                var styleMatch = System.Text.RegularExpressions.Regex.Match(config, @"style\s*:\s*(.+?)(?=;\s*\w+\s*:|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (styleMatch.Success)
                {
                    styleValue = styleMatch.Groups[1].Value.Trim();
                    // Remove style from config to avoid parsing it again
                    config = config.Remove(styleMatch.Index, styleMatch.Length);
                }

                var pairs = config.Split(';');

                foreach (var pair in pairs)
                {
                    var kv = pair.Split(new[] { ':' }, 2);
                    if (kv.Length == 2)
                    {
                        var key = kv[0].Trim();
                        var value = kv[1].Trim();

                        switch (key.ToLower())
                        {
                            case "width":
                                var widthStr = EvalExpression(value);
                                if (double.TryParse(widthStr, out var w)) _width = w;
                                break;
                            case "height":
                                var heightStr = EvalExpression(value);
                                if (double.TryParse(heightStr, out var h)) _height = h;
                                break;
                            case "width-unit":
                                _widthUnit = value;
                                break;
                            case "height-unit":
                                _heightUnit = value;
                                break;
                            case "viewbox":
                                var vb = value.Split(',');
                                if (vb.Length == 4)
                                {
                                    var vxStr = EvalExpression(vb[0]);
                                    var vyStr = EvalExpression(vb[1]);
                                    var vwStr = EvalExpression(vb[2]);
                                    var vhStr = EvalExpression(vb[3]);
                                    if (double.TryParse(vxStr, out var vx)) _viewBoxX = vx;
                                    if (double.TryParse(vyStr, out var vy)) _viewBoxY = vy;
                                    if (double.TryParse(vwStr, out var vw)) _viewBoxWidth = vw;
                                    if (double.TryParse(vhStr, out var vh)) _viewBoxHeight = vh;
                                }
                                break;
                        }
                    }
                }

                // Set style value if it was extracted
                if (!string.IsNullOrEmpty(styleValue))
                    _svgStyle = styleValue;
            }
        }

        private void ParseSvgElement(string line)
        {
            var lowerLine = line.ToLower();

            if (lowerLine.StartsWith("line{"))
                ParseLine(line);
            else if (lowerLine.StartsWith("rect{") || lowerLine.StartsWith("rectangle{"))
                ParseRect(line);
            else if (lowerLine.StartsWith("circle{"))
                ParseCircle(line);
            else if (lowerLine.StartsWith("ellipse{"))
                ParseEllipse(line);
            else if (lowerLine.StartsWith("polygon{"))
                ParsePolygon(line);
            else if (lowerLine.StartsWith("polyline{"))
                ParsePolyline(line);
            else if (lowerLine.StartsWith("path{"))
                ParsePath(line);
            else if (lowerLine.StartsWith("text{"))
                ParseText(line);
            else if (lowerLine.StartsWith("group{") || lowerLine.StartsWith("g{"))
                ParseGroup(line);
            else if (lowerLine.StartsWith("lineargradient{"))
                ParseLinearGradient(line);
            else if (lowerLine.StartsWith("radialgradient{"))
                ParseRadialGradient(line);
            else if (lowerLine.StartsWith("filter{"))
                ParseFilter(line);
            else if (lowerLine.StartsWith("pattern{"))
                ParsePattern(line);
        }

        private void ParseLinearGradient(string line)
        {
            // lineargradient{id:grad1; x1:0%; y1:0%; x2:100%; y2:0%; stops:0:#ff0000,100:#0000ff}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<linearGradient ");

            AddAttribute(sb, props, "id");
            AddAttribute(sb, props, "x1");
            AddAttribute(sb, props, "y1");
            AddAttribute(sb, props, "x2");
            AddAttribute(sb, props, "y2");
            AddAttribute(sb, props, "gradientUnits");

            sb.Append(">");

            // Parse stops: "0:#ff0000,50:#00ff00,100:#0000ff"
            if (props.TryGetValue("stops", out var stops))
            {
                var stopPairs = stops.Split(',');
                foreach (var stop in stopPairs)
                {
                    var parts = stop.Split(':');
                    if (parts.Length == 2)
                    {
                        var offset = parts[0].Trim();
                        var color = parts[1].Trim();
                        sb.Append($"<stop offset=\"{offset}\" stop-color=\"{color}\" />");
                    }
                }
            }

            sb.Append("</linearGradient>");
            _svgDefs.Add(sb.ToString());
        }

        private void ParseRadialGradient(string line)
        {
            // radialgradient{id:grad2; cx:50%; cy:50%; r:50%; stops:0:#ffffff,100:#000000}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<radialGradient ");

            AddAttribute(sb, props, "id");
            AddAttribute(sb, props, "cx");
            AddAttribute(sb, props, "cy");
            AddAttribute(sb, props, "r");
            AddAttribute(sb, props, "fx");
            AddAttribute(sb, props, "fy");
            AddAttribute(sb, props, "gradientUnits");

            sb.Append(">");

            if (props.TryGetValue("stops", out var stops))
            {
                var stopPairs = stops.Split(',');
                foreach (var stop in stopPairs)
                {
                    var parts = stop.Split(':');
                    if (parts.Length == 2)
                    {
                        var offset = parts[0].Trim();
                        var color = parts[1].Trim();
                        sb.Append($"<stop offset=\"{offset}\" stop-color=\"{color}\" />");
                    }
                }
            }

            sb.Append("</radialGradient>");
            _svgDefs.Add(sb.ToString());
        }

        private void ParseFilter(string line)
        {
            // filter{id:blur1; type:gaussianBlur; stdDeviation:5}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<filter ");

            AddAttribute(sb, props, "id");
            sb.Append(">");

            if (props.TryGetValue("type", out var type))
            {
                if (type == "gaussianBlur" && props.TryGetValue("stdDeviation", out var stdDev))
                    sb.Append($"<feGaussianBlur stdDeviation=\"{stdDev}\" />");
                else if (type == "dropshadow")
                    sb.Append("<feDropShadow dx=\"2\" dy=\"2\" stdDeviation=\"2\" flood-opacity=\"0.3\" />");
            }

            sb.Append("</filter>");
            _svgDefs.Add(sb.ToString());
        }

        private void ParsePattern(string line)
        {
            // pattern{id:pattern1; x:0; y:0; width:20; height:20; patternUnits:userSpaceOnUse}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<pattern ");

            AddAttribute(sb, props, "id");
            AddAttribute(sb, props, "x", EvalExpression);
            AddAttribute(sb, props, "y", EvalExpression);
            AddAttribute(sb, props, "width", EvalExpression);
            AddAttribute(sb, props, "height", EvalExpression);
            AddAttribute(sb, props, "patternUnits");

            sb.Append(">");
            // Note: Pattern content would be added separately
            sb.Append("</pattern>");
            _svgDefs.Add(sb.ToString());
        }

        private void ParseLine(string line)
        {
            // line{x1:0; y1:0; x2:100; y2:100; stroke:black; stroke-width:2}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<line ");

            AddAttribute(sb, props, "x1", EvalExpression);
            AddAttribute(sb, props, "y1", EvalExpression);
            AddAttribute(sb, props, "x2", EvalExpression);
            AddAttribute(sb, props, "y2", EvalExpression);
            AddStyle(sb, props);

            sb.Append("/>");
            _svgElements.Add(sb.ToString());
        }

        private void ParseRect(string line)
        {
            // rect{x:10; y:10; width:80; height:50; fill:blue; stroke:black; stroke-width:2}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<rect ");

            AddAttribute(sb, props, "x", EvalExpression);
            AddAttribute(sb, props, "y", EvalExpression);
            AddAttribute(sb, props, "width", EvalExpression);
            AddAttribute(sb, props, "height", EvalExpression);
            AddAttribute(sb, props, "rx", EvalExpression);  // rounded corners
            AddAttribute(sb, props, "ry", EvalExpression);
            AddStyle(sb, props);

            sb.Append("/>");
            _svgElements.Add(sb.ToString());
        }

        private void ParseCircle(string line)
        {
            // circle{cx:50; cy:50; r:40; fill:red; stroke:black}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<circle ");

            AddAttribute(sb, props, "cx", EvalExpression);
            AddAttribute(sb, props, "cy", EvalExpression);
            AddAttribute(sb, props, "r", EvalExpression);
            AddStyle(sb, props);

            sb.Append("/>");
            _svgElements.Add(sb.ToString());
        }

        private void ParseEllipse(string line)
        {
            // ellipse{cx:100; cy:100; rx:50; ry:30; fill:yellow}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<ellipse ");

            AddAttribute(sb, props, "cx", EvalExpression);
            AddAttribute(sb, props, "cy", EvalExpression);
            AddAttribute(sb, props, "rx", EvalExpression);
            AddAttribute(sb, props, "ry", EvalExpression);
            AddStyle(sb, props);

            sb.Append("/>");
            _svgElements.Add(sb.ToString());
        }

        private void ParsePolygon(string line)
        {
            // polygon{points:10,10 50,50 10,90; fill:lime; stroke:black}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<polygon ");

            if (props.TryGetValue("points", out var points))
            {
                var evaluatedPoints = EvalPoints(points);
                sb.Append($"points=\"{evaluatedPoints}\" ");
            }

            AddStyle(sb, props);
            sb.Append("/>");
            _svgElements.Add(sb.ToString());
        }

        private void ParsePolyline(string line)
        {
            // polyline{points:0,0 50,25 50,75 100,100; fill:none; stroke:black; stroke-width:2}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<polyline ");

            if (props.TryGetValue("points", out var points))
            {
                var evaluatedPoints = EvalPoints(points);
                sb.Append($"points=\"{evaluatedPoints}\" ");
            }

            AddStyle(sb, props);
            sb.Append("/>");
            _svgElements.Add(sb.ToString());
        }

        private void ParsePath(string line)
        {
            // path{d:M10,10 L50,50 L10,90 Z; fill:orange; stroke:black}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<path ");

            if (props.TryGetValue("d", out var d))
                sb.Append($"d=\"{d}\" ");

            AddStyle(sb, props);
            sb.Append("/>");
            _svgElements.Add(sb.ToString());
        }

        private void ParseText(string line)
        {
            // text{x:50; y:50; content:Hello; font-size:20; fill:black}
            // Supports variable interpolation: content:B = %B% mm
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<text ");

            AddAttribute(sb, props, "x", EvalExpression);
            AddAttribute(sb, props, "y", EvalExpression);
            AddAttribute(sb, props, "font-size", EvalExpression);
            AddAttribute(sb, props, "font-family");
            AddAttribute(sb, props, "font-weight");
            AddAttribute(sb, props, "text-anchor");
            AddAttribute(sb, props, "transform");
            AddStyle(sb, props);

            sb.Append(">");

            if (props.TryGetValue("content", out var content))
            {
                // Interpolate variables in the form %variable% or %expression%
                var interpolated = InterpolateVariables(content);
                sb.Append(interpolated);
            }

            sb.Append("</text>");
            _svgElements.Add(sb.ToString());
        }

        private string InterpolateVariables(string text)
        {
            // Replace %variable% or %expression% with evaluated values
            // Example: "B = %B% mm" -> "B = 2500 mm"
            var result = new StringBuilder();
            int i = 0;
            while (i < text.Length)
            {
                if (text[i] == '%')
                {
                    int end = text.IndexOf('%', i + 1);
                    if (end > i)
                    {
                        var expr = text.Substring(i + 1, end - i - 1);
                        var evaluated = EvalExpression(expr);
                        result.Append(evaluated);
                        i = end + 1;
                        continue;
                    }
                }
                result.Append(text[i]);
                i++;
            }
            return result.ToString();
        }

        private void ParseGroup(string line)
        {
            // group{id:mygroup; transform:translate(50,50)}
            var props = ExtractProperties(line);
            var sb = new StringBuilder();
            sb.Append("<g ");

            AddAttribute(sb, props, "id");
            AddAttribute(sb, props, "transform");
            AddStyle(sb, props);

            sb.Append(">");
            // Note: Group closing handled separately
            _svgElements.Add(sb.ToString());
        }

        private Dictionary<string, string> ExtractProperties(string line)
        {
            var props = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var start = line.IndexOf('{');
            var end = line.LastIndexOf('}');

            if (start >= 0 && end > start)
            {
                var content = line.Substring(start + 1, end - start - 1);
                var pairs = content.Split(';');

                foreach (var pair in pairs)
                {
                    var kv = pair.Split(new[] { ':' }, 2);
                    if (kv.Length == 2)
                    {
                        var key = kv[0].Trim();
                        var value = kv[1].Trim();
                        props[key] = value;
                    }
                }
            }

            return props;
        }

        private void AddAttribute(StringBuilder sb, Dictionary<string, string> props, string name, Func<string, string> evaluator = null)
        {
            if (props.TryGetValue(name, out var value))
            {
                var finalValue = evaluator != null ? evaluator(value) : value;
                sb.Append($"{name}=\"{finalValue}\" ");
            }
        }

        private void AddStyle(StringBuilder sb, Dictionary<string, string> props)
        {
            // Lista completa de propiedades de estilo SVG
            var styleProps = new[] {
                // Fill y Stroke
                "fill", "fill-opacity", "fill-rule",
                "stroke", "stroke-width", "stroke-opacity", "stroke-linecap",
                "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",

                // Color y Opacity
                "color", "opacity", "stop-color", "stop-opacity",

                // Texto
                "font-family", "font-size", "font-weight", "font-style", "font-variant",
                "text-decoration", "text-anchor", "dominant-baseline", "baseline-shift",
                "letter-spacing", "word-spacing", "writing-mode", "direction",

                // Visibilidad y Display
                "visibility", "display", "overflow",

                // Filtros y Efectos
                "filter", "mask", "clip-path", "clip-rule",
                "marker-start", "marker-mid", "marker-end",

                // Mix y Blend
                "mix-blend-mode", "isolation",

                // Punteros
                "pointer-events", "cursor",

                // Varios
                "shape-rendering", "text-rendering", "image-rendering",
                "color-interpolation", "color-interpolation-filters"
            };

            var styles = new List<string>();
            foreach (var prop in styleProps)
            {
                if (props.TryGetValue(prop, out var value))
                    styles.Add($"{prop}:{value}");
            }

            // Atributos de presentación directos (no en style)
            var directAttrs = new[] {
                "transform", "id", "class", "data-*",
                "visibility", "display"
            };

            foreach (var attr in directAttrs)
            {
                if (props.TryGetValue(attr, out var value))
                    sb.Append($"{attr}=\"{value}\" ");
            }

            if (styles.Count > 0)
                sb.Append($"style=\"{string.Join(";", styles)}\" ");
        }

        private string EvalExpression(string expr)
        {
            try
            {
                Parser.Parse(expr);
                var result = Parser.CalculateReal();
                return result.ToString("G", System.Globalization.CultureInfo.InvariantCulture);
            }
            catch
            {
                // If evaluation fails, try to parse as number, otherwise return "0"
                if (double.TryParse(expr, out _))
                    return expr;
                return "0";
            }
        }

        private string EvalPoints(string points)
        {
            // Evaluate expressions in points like "b_f,0 b_f,h_f x_3,h_f x_2,h_f+30"
            // Split by spaces and commas, evaluate each token, rebuild string
            var tokens = points.Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries);
            var results = new List<string>();

            foreach (var token in tokens)
            {
                var trimmed = token.Trim();
                if (!string.IsNullOrEmpty(trimmed))
                {
                    var evaluated = EvalExpression(trimmed);
                    results.Add(evaluated);
                }
            }

            // Rebuild as space-separated pairs
            var sb = new StringBuilder();
            for (int i = 0; i < results.Count; i++)
            {
                if (i > 0 && i % 2 == 0)
                    sb.Append(' ');
                else if (i > 0)
                    sb.Append(',');

                sb.Append(results[i]);
            }

            return sb.ToString();
        }

        private string GenerateSvgHtml()
        {
            var sb = new StringBuilder();

            // Build SVG opening tag
            var widthStr = string.IsNullOrEmpty(_widthUnit) ?
                _width.ToString("G", System.Globalization.CultureInfo.InvariantCulture) :
                $"{_width.ToString("G", System.Globalization.CultureInfo.InvariantCulture)}{_widthUnit}";

            var heightStr = string.IsNullOrEmpty(_heightUnit) ?
                _height.ToString("G", System.Globalization.CultureInfo.InvariantCulture) :
                $"{_height.ToString("G", System.Globalization.CultureInfo.InvariantCulture)}{_heightUnit}";

            // Use viewBox values, but ensure they're valid (non-zero width/height)
            var vbX = _viewBoxX;
            var vbY = _viewBoxY;
            var vbW = _viewBoxWidth > 0 ? _viewBoxWidth : _width;
            var vbH = _viewBoxHeight > 0 ? _viewBoxHeight : _height;

            sb.Append($"<svg width=\"{widthStr}\" height=\"{heightStr}\" ");
            sb.Append($"viewBox=\"{vbX.ToString("G", System.Globalization.CultureInfo.InvariantCulture)} {vbY.ToString("G", System.Globalization.CultureInfo.InvariantCulture)} {vbW.ToString("G", System.Globalization.CultureInfo.InvariantCulture)} {vbH.ToString("G", System.Globalization.CultureInfo.InvariantCulture)}\" ");
            sb.Append("xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\"");

            if (!string.IsNullOrEmpty(_svgStyle))
                sb.Append($" style=\"{_svgStyle}\"");

            sb.AppendLine(">");

            // Add defs section if there are gradients/filters/patterns
            if (_svgDefs.Count > 0)
            {
                sb.AppendLine("  <defs>");
                foreach (var def in _svgDefs)
                    sb.AppendLine($"    {def}");
                sb.AppendLine("  </defs>");
            }

            // Add elements
            foreach (var element in _svgElements)
                sb.AppendLine($"  {element}");

            sb.AppendLine("</svg>");

            return sb.ToString();
        }

        private string GetPlaceholderHtml(string script)
        {
            return $"<div style='border:1px solid #ccc; padding:10px;'>[SVG Placeholder: {_width}x{_height}]</div>";
        }
    }
}
