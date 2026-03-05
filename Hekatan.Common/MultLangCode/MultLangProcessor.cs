#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;
using Markdig;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Holds mesh data from @{triangle} for sharing with @{three} and @{svg}
    /// </summary>
    public class TriangleMeshData
    {
        public List<double[]> Nodes { get; set; } = new();
        public List<int> NodeMarkers { get; set; } = new();
        public List<int[]> Elements { get; set; } = new();
        public List<int[]> Segments { get; set; } = new();
        public List<int> SegmentMarkers { get; set; } = new();
        public List<int[]> Edges { get; set; } = new();
        public List<int> EdgeMarkers { get; set; } = new();
        public int InputVertexCount { get; set; }
        public double QualityAngle { get; set; }
        public double MaxArea { get; set; }
    }

    /// <summary>
    /// Processes Hekatan code to execute external language blocks
    /// and replace them with HTML output results.
    ///
    /// Variable sharing:
    /// - To export a variable from external code to Hekatan, print a line with format:
    ///   CALCPAD:variable_name=value
    ///   Example in Python: print("CALCPAD:resultado=3.14159")
    ///   Example in C++: cout << "CALCPAD:resultado=3.14159" << endl;
    /// - The variable will be available in subsequent Hekatan calculations
    /// </summary>
    public partial class MultLangProcessor
    {
        private readonly LanguageExecutor _executor;
        private readonly Dictionary<string, object> _exportedVariables;
        private ExecutionTracker? _tracker;
        private int _maximaBlockCounter;
        private bool _threeImportMapEmitted;
        private int _themeCounter;
        private bool _themeOpen;

        // Pattern to match CALCPAD:name=value lines
        private static readonly Regex HekatanVarPattern = new(@"^CALCPAD:(\w+)=(.+)$", RegexOptions.Multiline);

        public MultLangProcessor(ExecutionTracker? tracker = null)
        {
            _tracker = tracker;
            _executor = new LanguageExecutor(_tracker);
            _exportedVariables = new Dictionary<string, object>();
        }

        /// <summary>
        /// Gets variables exported from external language blocks
        /// </summary>
        public IReadOnlyDictionary<string, object> ExportedVariables => _exportedVariables;

        /// <summary>
        /// Processes the code, executes language blocks, and returns modified code with results
        /// </summary>
        /// <param name="code">Original Hekatan code with language blocks</param>
        /// <param name="variables">Optional variables to inject from Hekatan</param>
        /// <param name="returnHtml">If true, returns HTML output directly; if false, returns Hekatan comments</param>
        /// <param name="enableCollapse">If true, adds collapse/expand buttons (+/-) to language output blocks</param>
        /// <param name="progressCallback">Optional callback for progress updates (e.g., "Compilando... 5ms")</param>
        /// <param name="partialResultCallback">Optional callback for partial HTML results as they become available</param>
        /// <returns>Code with language blocks replaced by output and variable assignments</returns>
        public string Process(string code, Dictionary<string, object>? variables = null, bool returnHtml = true, bool enableCollapse = true, Action<string>? progressCallback = null, Action<string>? partialResultCallback = null)
        {
            // Reset state for new document
            IfcLanguageHandler.ResetImportMapFlag();
            MultLangTemplateManager.Reset();
            _maximaBlockCounter = 0;

            // Ensure variables dict exists for sharing data between blocks
            if (variables == null) variables = new Dictionary<string, object>();

            if (!MultLangManager.HasLanguageCode(code))
            {
                // HEKATAN MODE: No @{} blocks → process as Hekatan math/headings/text
                if (returnHtml)
                    return RenderPlainColumnContent(code);
                return code;
            }

            var blocks = MultLangManager.ExtractCodeBlocks(code);
            if (blocks.Count == 0)
            {
                // HEKATAN MODE: No extractable blocks → process as Hekatan math/headings/text
                if (returnHtml)
                    return RenderPlainColumnContent(code);
                return code;
            }

            // Split by newlines and remove any trailing \r from each line to avoid double line breaks
            var lines = code.Split('\n').Select(l => l.TrimEnd('\r')).ToArray();
            var result = new StringBuilder();
            var processedRanges = new List<(int start, int end, string output, List<(string name, string value)> vars)>();

            // Pre-extract simple Hekatan variable assignments from non-block lines
            // This makes variables like "A = 2" or "omega = 3" available in @{plot} function: expressions
            {
                var preBlockLineSet = new HashSet<int>();
                foreach (var (_, codeBlks) in blocks)
                    foreach (var blk in codeBlks)
                        for (int bi = blk.StartLine; bi <= blk.EndLine; bi++)
                            preBlockLineSet.Add(bi);
                var assignRegex = new System.Text.RegularExpressions.Regex(@"^\s*([a-zA-Zα-ωΑ-Ω]\w*)\s*=\s*(.+)$");
                for (int li = 0; li < lines.Length; li++)
                {
                    if (preBlockLineSet.Contains(li)) continue;
                    var trimLine = lines[li].Trim();
                    if (string.IsNullOrEmpty(trimLine) || trimLine.StartsWith("'") || trimLine.StartsWith("\"")) continue;
                    var m = assignRegex.Match(trimLine);
                    if (m.Success)
                    {
                        var vName = m.Groups[1].Value;
                        var vExpr = m.Groups[2].Value.Trim();
                        var commentIdx = vExpr.IndexOf('\'');
                        if (commentIdx > 0) vExpr = vExpr.Substring(0, commentIdx).Trim();
                        if (double.TryParse(vExpr, System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var numVal))
                        {
                            variables[vName] = numVal;
                        }
                        else if (vExpr == "π" || vExpr.Equals("pi", StringComparison.OrdinalIgnoreCase))
                            variables[vName] = Math.PI;
                    }
                }
            }

            // Execute each block and collect results
            foreach (var (language, codeBlocks) in blocks)
            {

                foreach (var block in codeBlocks)
                {
                    string output;
                    var extractedVars = new List<(string name, string value)>();

                    // Mark language as used for CSS injection
                    MultLangTemplateManager.MarkLanguageUsed(language);

                    // Special handling for @{code} and @{ucode} wrappers
                    // @{code}...@{end code} wraps @{html-ifc} blocks with full HTML/JS code
                    // @{ucode}...@{end ucode} wraps @{html-ifc} blocks with simplified directives OR direct IFC directives
                    if (language.Equals("code", StringComparison.OrdinalIgnoreCase) ||
                        language.Equals("ucode", StringComparison.OrdinalIgnoreCase))
                    {

                        string innerContent = block.Code ?? "";

                        // @{ucode} ALWAYS processes IFC directives directly
                        // Remove any @{html-ifc} wrapper if present (user error)
                        if (language.Equals("ucode", StringComparison.OrdinalIgnoreCase))
                        {
                            // Strip @{html-ifc}...@{end html-ifc} wrapper if present
                            innerContent = System.Text.RegularExpressions.Regex.Replace(
                                innerContent,
                                @"@\{html-ifc\}\s*\r?\n?",
                                "",
                                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                            innerContent = System.Text.RegularExpressions.Regex.Replace(
                                innerContent,
                                @"\s*@\{end\s+html-ifc\}",
                                "",
                                System.Text.RegularExpressions.RegexOptions.IgnoreCase);

                            // Process directly as IFC viewer with simplified directives
                            output = IfcLanguageHandler.GenerateInlineViewerHtml(innerContent, "@{ucode}");
                        }
                        else
                        {
                            // @{code} wrapper - process inner content recursively
                            output = Process(innerContent, variables, returnHtml, enableCollapse, progressCallback, partialResultCallback);
                        }
                    }
                    // Special handling for @{calcpad} - route to ORIGINAL Calcpad parser
                    // Uses Calcpad.Core (upstream Proektsoftbg/Calcpad) directly
                    else if (language.Equals("calcpad", StringComparison.OrdinalIgnoreCase))
                    {
                        output = CalcpadParserHandler.Parse(block.Code ?? "", System.IO.Directory.GetCurrentDirectory());
                    }
                    // Special handling for mcdx - convert Mathcad Prime file to Hekatan
                    else if (language.Equals("mcdx", StringComparison.OrdinalIgnoreCase))
                    {

                        // The code content should be a file path to .mcdx file
                        var mcdxPath = block.Code.Trim();
                        output = ProcessMcdxFile(mcdxPath);
                    }
                    // Special handling for image - embed Base64 images
                    else if (language.Equals("image", StringComparison.OrdinalIgnoreCase))
                    {

                        output = ProcessImageBlock(block.Code, block.StartDirective);
                    }
                    // Special handling for IFC - 3D viewer with Three.js and web-ifc
                    // Supports: @{ifc}path/to/file.ifc@{end ifc} or @{ifc base64}...@{end ifc}
                    // Also supports: @{ifc-fragment} for ThatOpen Fragments optimization
                    // NOTE: html-ifc is handled separately below (uses GenerateInlineViewerHtml)
                    else if (language.Equals("ifc", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("ifc-fragment", StringComparison.OrdinalIgnoreCase))
                    {

                        // Detect if running in WPF context and use Virtual Host URLs
                        var isWpf = AppDomain.CurrentDomain.FriendlyName.Contains("Hekatan.exe") ||
                                    AppDomain.CurrentDomain.FriendlyName.Contains("Hekatan.Wpf");

                        string wasmPath;
                        string outputDirectory = null;

                        // Use current working directory for output (where HTML will be generated)
                        // This ensures fragment files are placed next to the HTML for HTTP server access
                        outputDirectory = System.IO.Directory.GetCurrentDirectory();

                        // Verify IFC file exists
                        var ifcFilePath = block.Code?.Trim();
                        if (string.IsNullOrEmpty(ifcFilePath) || !System.IO.File.Exists(ifcFilePath))
                        {
                            // IFC file not found, will be handled by ProcessIfcBlock
                        }

                        if (isWpf)
                        {
                            // WPF: Use Virtual Host (mapped in MainWindow.xaml.cs InitializeWebViewer)
                            // https://calcpad.ifc/ifc/ maps to {AppInfo.Path}/resources/ifc/
                            wasmPath = "https://calcpad.ifc/ifc";

                        }
                        else
                        {
                            // CLI: Use local libs to avoid CDN Tracking Prevention issues in Edge
                            wasmPath = "./libs";

                            // Copy libs to output directory if needed
                            if (!string.IsNullOrEmpty(outputDirectory))
                            {
                                CopyIfcLibsToDirectory(outputDirectory);
                            }

                        }

                        output = IfcLanguageHandler.ProcessIfcBlock(block.Code, block.StartDirective, wasmPath, outputDirectory);
                    }
                    // Special handling for markdown - render to HTML
                    // Supports: @{calcpad:expr}, $varName for variable values, keywords #val, #nosub, etc.
                    else if (language.Equals("markdown", StringComparison.OrdinalIgnoreCase))
                    {

                        // Process variable substitution: $varName -> value
                        var codeWithVars = ProcessMarkdownVariables(block.Code, variables);
                        // Process inline Hekatan code: @{calcpad:...}
                        var processedCode = ProcessInlineHekatan(codeWithVars);
                        // Then render markdown to HTML
                        output = RenderMarkdown(processedCode);
                    }
                    // Special handling for table - generate HTML table from matrix/vector
                    // Syntax: @{table}
                    //         matrixName
                    //         headers=A,B,C style=bordered export=file.xlsx
                    //         @{end table}
                    else if (language.Equals("table", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessTableBlock(block.Code, variables);
                    }
                    // Special handling for plot - generate SVG chart from vectors
                    // Syntax: @{plot}
                    //         x: vectorX   or  x: [1; 2; 3]
                    //         y: vectorY   or  y: [4; 5; 6]
                    //         xlabel: "X axis"
                    //         ylabel: "Y axis"
                    //         title: "Chart Title"
                    //         xlim: 0, 10
                    //         ylim: 0, 100
                    //         grid: true
                    //         legend: "Serie 1"
                    //         color: #0000FF
                    //         style: solid|dash|dot
                    //         @{end plot}
                    else if (language.Equals("plot", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessPlotBlock(block.Code, variables);
                    }
                    // Special handling for svg - inline SVG with variable substitution
                    // Syntax: @{svg}
                    //         <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
                    //           <rect x="0" y="0" width="$width" height="$height" fill="#eee"/>
                    //           <circle cx="200" cy="150" r="$radius" fill="blue"/>
                    //         </svg>
                    //         @{end svg}
                    // Supports $varName substitution from Hekatan variables
                    else if (language.Equals("svg", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("svg ", StringComparison.OrdinalIgnoreCase))
                    {
                        // Pass StartDirective (e.g. "@{svg 500 300}") to extract size
                        var svgDirective = block.StartDirective ?? language;
                        // Strip @{ and } to get "svg 500 300"
                        if (svgDirective.StartsWith("@{")) svgDirective = svgDirective.Substring(2);
                        if (svgDirective.EndsWith("}")) svgDirective = svgDirective.Substring(0, svgDirective.Length - 1);
                        output = ProcessSvgBlock(block.Code, svgDirective.Trim(), variables);
                    }
                    // Special handling for @{animation} — synchronized Canvas+JS animation
                    // Syntax: @{animation}
                    //         key: value DSL parameters (xi1, xi2, label1, label2, title, wn)
                    //         @{end animation}
                    else if (language.Equals("animation", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessAnimationBlock(block.Code, "animation", variables);
                    }
                    // Special handling for @{draw} — CAD 2D/3D drawing on Canvas
                    else if (language.Equals("draw", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("draw ", StringComparison.OrdinalIgnoreCase))
                    {
                        var drawDirective = block.StartDirective ?? language;
                        if (drawDirective.StartsWith("@{")) drawDirective = drawDirective.Substring(2);
                        if (drawDirective.EndsWith("}")) drawDirective = drawDirective.Substring(0, drawDirective.Length - 1);
                        output = ProcessDrawBlock(block.Code, drawDirective.Trim(), variables);
                    }
                    // Special handling for @{tree} - Tree/hierarchy diagrams
                    // Syntax: @{tree}
                    //         Proyecto
                    //           Carpeta A
                    //             Archivo 1
                    //             Archivo 2
                    //           Carpeta B
                    //         @{end tree}
                    // Indentation (2 spaces per level) defines hierarchy
                    else if (language.Equals("tree", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("tree ", StringComparison.OrdinalIgnoreCase))
                    {
                        var treeDirective = block.StartDirective ?? language;
                        if (treeDirective.StartsWith("@{")) treeDirective = treeDirective.Substring(2);
                        if (treeDirective.EndsWith("}")) treeDirective = treeDirective.Substring(0, treeDirective.Length - 1);
                        output = ProcessTreeBlock(block.Code, treeDirective.Trim(), variables);
                    }
                    // Special handling for @{three} - Three.js 3D scenes
                    else if (language.Equals("three", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("three ", StringComparison.OrdinalIgnoreCase))
                    {
                        var threeDirective = block.StartDirective ?? language;
                        if (threeDirective.StartsWith("@{")) threeDirective = threeDirective.Substring(2);
                        if (threeDirective.EndsWith("}")) threeDirective = threeDirective.Substring(0, threeDirective.Length - 1);
                        output = ProcessThreeBlock(block.Code, threeDirective.Trim(), variables);
                    }
                    // Special handling for @{triangle} - Shewchuk Delaunay triangulation
                    else if (language.Equals("triangle", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("triangle ", StringComparison.OrdinalIgnoreCase))
                    {
                        var triDirective = block.StartDirective ?? language;
                        if (triDirective.StartsWith("@{")) triDirective = triDirective.Substring(2);
                        if (triDirective.EndsWith("}")) triDirective = triDirective.Substring(0, triDirective.Length - 1);
                        output = ProcessTriangleBlock(block.Code, triDirective.Trim(), variables);
                    }
                    // Special handling for @{maxima} - Maxima CAS (Computer Algebra System)
                    // Syntax: @{maxima}
                    //         diff(x^3 + 2*x, x);
                    //         integrate(sin(x)*cos(x), x);
                    //         ode2('diff(y,x,2) + 4*y = sin(x), y, x);
                    //         laplace(t^2*exp(-3*t), t, s);
                    //         taylor(sin(x), x, 0, 5);
                    //         @{end maxima}
                    // Executes Maxima in batch mode, parses output, formats results as HTML
                    else if (language.Equals("maxima", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("wxmaxima", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessMaximaBlock(block.Code, variables);
                    }
                    // Special handling for eq/equation - mathematical equation block
                    // Syntax: @{eq} or @{eq left} or @{eq right} or @{eq center}
                    //         S_a = η*Z*F_a
                    //         @{end eq}
                    // Renders equations with Hekatan-style formatting (fractions, subscripts, etc.)
                    // Alignment: center (default), left, right
                    // Note: DetectDirective returns just "eq" as language name (params stripped),
                    //       so we extract alignment from block.StartDirective (e.g., "@{eq left}")
                    else if (language.Equals("eq", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("eq:", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("equation", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("equation:", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("ecuacion", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("ecuacion:", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("formula", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("formula:", StringComparison.OrdinalIgnoreCase))
                    {
                        var eqAlign = ExtractEqAlignment(block.StartDirective);
                        output = ProcessEquationBlock(block.Code, variables, eqAlign);
                    }
                    // Special handling for eqdef - equations with definitions in two columns
                    // Syntax: @{eqdef} or @{eqdef left} or @{eqdef right}
                    //         S_a = η*Z*F_a | Aceleración espectral de diseño
                    //         T_0 = 0.1*F_s*F_d/F_a | Periodo de inicio
                    //         @{end eqdef}
                    // Renders equations in left column with Hekatan-style formatting, definitions in right column
                    else if (language.Equals("eqdef", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("eqdef:", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("ecuaciondef", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("eqdefinicion", StringComparison.OrdinalIgnoreCase))
                    {
                        var eqAlign = ExtractEqAlignment(block.StartDirective);
                        // Redirect to unified @{eq} which auto-detects | separator
                        output = ProcessEquationBlock(block.Code, variables, eqAlign);
                    }
                    // Special handling for @{integral} - convenience block for integrals
                    // Syntax: @{integral}
                    //         result = integrate(sin(x), x, 0, pi)
                    //         area = dintegrate(x*y, x, 0, 1, y, 0, 1)
                    //         vol = tintegrate(1, x, 0, 1, y, 0, 1, z, 0, 1)
                    //         @{end integral}
                    else if (language.Equals("integral", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("integrales", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessIntegralBlock(block.Code, variables);
                    }
                    // Special handling for @{derivate} - convenience block for derivatives
                    // Syntax: @{derivate}
                    //         slope = derivate(x^3 + 2*x, x, 1)
                    //         accel = derivate2(sin(t), t, pi/4)
                    //         @{end derivate}
                    else if (language.Equals("derivate", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("derivative", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("derivada", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessDerivateBlock(block.Code, variables);
                    }
                    // Special handling for @{gauss} - convenience block for Gauss quadrature
                    // Syntax: @{gauss}
                    //         result = gauss(f(xi), xi, 2)
                    //         area = gauss2d(f(xi,eta), xi, 2, eta, 2)
                    //         vol = gauss3d(f(xi,eta,zeta), xi, 2, eta, 2, zeta, 2)
                    //         @{end gauss}
                    else if (language.Equals("gauss", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("cuadratura", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessGaussBlock(block.Code, variables);
                    }
                    // Special handling for @{function} - define functions with Octave/MATLAB syntax
                    // Syntax: @{function}
                    //         function y = cuadrado(x)
                    //           y = x^2
                    //         end
                    //         hipotenusa(a, b) = sqrt(a^2 + b^2)
                    //         @{end function}
                    else if (language.Equals("function", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("funcion", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("func", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessFunctionBlock(block.Code, variables);
                    }
                    // Special handling for columns - multi-column layout
                    // Syntax: @{columns N}
                    //         content1
                    //         @{column}
                    //         content2
                    //         @{end columns}
                    else if (language.StartsWith("columns", StringComparison.OrdinalIgnoreCase))
                    {
                        // Mark columns as used so columns-math.css gets injected
                        MultLangTemplateManager.MarkLanguageUsed("columns");
                        // Pass block.StartDirective to preserve parameters like "@{columns 4}"
                        output = ProcessColumnsBlock(block.StartDirective, block.Code, variables, progressCallback);
                    }
                    // Special handling for center - centers content horizontally
                    // Syntax: @{center} or @{center text}
                    //         content to center
                    //         @{end center}
                    else if (language.StartsWith("center", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessCenterBlock(block.Code, variables, progressCallback);
                    }
                    // Special handling for html-ifc - inline IFC viewer embedded in output
                    // Syntax: @{html-ifc}path/to/file.ifc@{end html-ifc}
                    // This renders directly in the WebView2 output panel using Virtual Host
                    else if (language.Equals("html-ifc", StringComparison.OrdinalIgnoreCase))
                    {

                        // html-ifc always uses Virtual Host URLs for WebView2 rendering
                        // This allows the IFC viewer to work directly in the Hekatan output panel
                        output = IfcLanguageHandler.GenerateInlineViewerHtml(block.Code?.Trim() ?? "", block.StartDirective);
                    }
                    // Special handling for ifc-create - create IFC geometry from commands
                    // Syntax: @{ifc-create}
                    //         WALL w1 = (0,0,0) to (10,0,0) height=3 thickness=0.3
                    //         BEAM b1 = (0,0,3) to (10,0,3) section=0.3x0.5
                    //         @{end ifc-create}
                    else if (language.Equals("ifc-create", StringComparison.OrdinalIgnoreCase))
                    {

                        output = ProcessIfcCreateBlock(block.Code ?? "", block.StartDirective);
                    }
                    // Special handling for @{cpp} - if code has main(), compile and execute;
                    // otherwise, syntax-highlight only (for code snippets/documentation)
                    else if (language.Equals("cpp", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("c++", StringComparison.OrdinalIgnoreCase))
                    {
                        var cppCode = block.Code ?? "";
                        bool hasMainFunction = cppCode.Contains("int main") || cppCode.Contains("void main");

                        if (hasMainFunction)
                        {
                            // Executable C++ program - compile and run via LanguageExecutor
                            try
                            {
                                var execResult = _executor.Execute(block, variables, progressCallback);
                                output = LanguageHtmlGenerator.GenerateHtml(language, execResult);
                            }
                            catch (Exception ex)
                            {
                                output = $"<div class='lang-error'>C++ Error: {ex.Message}</div>";
                            }
                        }
                        else
                        {
                            // Code snippet - syntax highlighting only
                            output = CppLanguageHandler.ProcessCppBlock(cppCode);
                        }
                    }
                    // Special handling for @{explain} - Translate C++ to pseudocode
                    // Syntax: @{explain} or @{explain spanish} or @{explain matlab}
                    //         for (int i = 0; i < n; i++) { K[i] = E*A/L; }
                    //         @{end explain}
                    else if (language.StartsWith("explain", StringComparison.OrdinalIgnoreCase))
                    {

                        // Extract target language from directive: @{explain spanish}, @{explain matlab}, etc.
                        var targetLang = "spanish";
                        var parts = language.Split(new[] { ' ', ':' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length > 1)
                            targetLang = parts[1];

                        output = CppLanguageHandler.ProcessExplainBlock(block.Code ?? "", targetLang);
                    }
                    // Special handling for @{cpp-explain} - Both C++ code and explanation side by side
                    // Syntax: @{cpp-explain} or @{cpp-explain spanish}
                    //         for (int i = 0; i < n; i++) { ... }
                    //         @{end cpp-explain}
                    else if (language.StartsWith("cpp-explain", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("c++-explain", StringComparison.OrdinalIgnoreCase))
                    {

                        // Extract target language
                        var targetLang = "spanish";
                        var parts = language.Split(new[] { ' ', ':' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length > 1)
                            targetLang = parts[1];

                        output = CppLanguageHandler.ProcessCppExplainBlock(block.Code ?? "", targetLang);
                    }
                    // === THEME SYSTEM ===
                    // @{theme:name} - Change color scheme for all formatted output
                    // Syntax: @{theme:black} or @{theme:calcpad} or @{theme:mathcad}
                    // Can also use body content for custom overrides:
                    //   @{theme:custom}
                    //   var=#333
                    //   greek=#555
                    //   @{end theme}
                    else if (language.StartsWith("theme", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("tema", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessThemeBlock(block.Code ?? "", block.StartDirective);
                    }
                    // === DOCUMENT LAYOUT PARSERS ===
                    // @{paper} - Document page configuration (size, margins, colors, fonts)
                    else if (language.StartsWith("paper", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("pagina", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("documento", StringComparison.OrdinalIgnoreCase))
                    {
                        MultLangTemplateManager.MarkLanguageUsed("paper");
                        output = ProcessPaperBlock(block.Code ?? "", block.StartDirective);
                    }
                    // @{header} - Page header bar with text
                    else if (language.StartsWith("header", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("encabezado", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessHeaderBlock(block.Code ?? "", block.StartDirective);
                    }
                    // @{footer} - Page footer with line and text
                    else if (language.StartsWith("footer", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("piepagina", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessFooterBlock(block.Code ?? "", block.StartDirective);
                    }
                    // @{pagebreak} - Page break for print / PDF
                    // Syntax: @{pagebreak} (simple) or @{pagebreak N} (with page number footer)
                    // Also: @{pagebreak}left text|right text@{end pagebreak} for custom footer
                    else if (language.StartsWith("pagebreak", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("saltopagina", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("newpage", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessPageBreak(language, block.Code ?? "");
                    }
                    // @{figure} - Figure with image and numbered caption
                    else if (language.StartsWith("figure", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("figura", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessFigureBlock(block.Code ?? "", block.StartDirective);
                    }
                    // @{author} - Author info card with photo
                    else if (language.StartsWith("author", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("autor", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessAuthorBlock(block.Code ?? "", block.StartDirective);
                    }
                    // @{abstract} - Abstract / resumen block
                    else if (language.StartsWith("abstract", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("resumen", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessAbstractBlock(block.Code ?? "", block.StartDirective);
                    }
                    // @{reference} - References / bibliography
                    else if (language.StartsWith("reference", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("referencia", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("bibliografia", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessReferenceBlock(block.Code ?? "", block.StartDirective);
                    }
                    // @{title} - Document/section title block
                    else if (language.StartsWith("title", StringComparison.OrdinalIgnoreCase) ||
                             language.StartsWith("titulo", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessTitleBlock(block.Code ?? "", block.StartDirective);
                    }
                    // @{text} / @{texto} - Plain text block (no math evaluation)
                    // Renders content as HTML paragraphs. Blank lines create paragraph breaks.
                    else if (language.Equals("text", StringComparison.OrdinalIgnoreCase) ||
                             language.Equals("texto", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessTextBlock(block.Code ?? "", block.StartDirective);
                    }
                    // @{config} - Document configuration (bg, align, header, footer, startpage, color, bold)
                    else if (language.StartsWith("config", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessConfigBlock(language, block.Code ?? "");
                    }
                    // @{css} - Apply styles silently (no visible output)
                    else if (language.Equals("css", StringComparison.OrdinalIgnoreCase))
                    {
                        var cssCode = block.Code ?? "";
                        output = $"<style>\n{cssCode}\n</style>";
                    }
                    // @{html} - Inject HTML directly into output (no external file/browser)
                    else if (language.Equals("html", StringComparison.OrdinalIgnoreCase))
                    {
                        output = block.Code ?? "";
                    }
                    // @{inkscape} - Render SVG code via Inkscape CLI to PNG and show inline
                    else if (language.Equals("inkscape", StringComparison.OrdinalIgnoreCase))
                    {
                        output = ProcessInkscapeBlock(block.Code ?? "", block.StartDirective);
                    }
                    // C#, XAML, WPF, three, vite always execute (handled specially in LanguageExecutor)
                    // Extract base language name for checking (e.g., "vite C:/path" -> "vite")
                    else
                    {
                        var baseLang = language.Contains(' ') ? language.Split(' ')[0] : language;
                        if (baseLang.Equals("csharp", StringComparison.OrdinalIgnoreCase) ||
                            baseLang.Equals("xaml", StringComparison.OrdinalIgnoreCase) ||
                            baseLang.Equals("wpf", StringComparison.OrdinalIgnoreCase) ||
                            baseLang.Equals("html:embed", StringComparison.OrdinalIgnoreCase) ||
                            baseLang.Equals("three", StringComparison.OrdinalIgnoreCase) ||
                            baseLang.Equals("vite", StringComparison.OrdinalIgnoreCase) ||
                            MultLangManager.IsLanguageAvailable(baseLang))
                        {
                            var execResult = _executor.Execute(block, variables, progressCallback);

                            // Extract CALCPAD:var=value from output
                            if (execResult.Success && !string.IsNullOrWhiteSpace(execResult.Output))
                            {
                                extractedVars = ExtractHekatanVariables(execResult.Output);

                                // Store in exported variables dictionary
                                foreach (var (name, value) in extractedVars)
                                {
                                    if (double.TryParse(value, System.Globalization.NumberStyles.Any,
                                        System.Globalization.CultureInfo.InvariantCulture, out var numValue))
                                    {
                                        _exportedVariables[name] = numValue;
                                    }
                                    else
                                    {
                                        _exportedVariables[name] = value;
                                    }
                                }
                            }

                            // Generate output based on returnHtml mode
                            if (returnHtml)
                            {
                                // HTML mode: Generate formatted HTML output
                                output = LanguageHtmlGenerator.GenerateOutput(language, block.Code, execResult, enableCollapse);
                            }
                            else
                            {
                                // Mixed mode: Return plain text output (will be wrapped in Hekatan comments)
                                output = execResult.Success ? execResult.Output : execResult.Error;
                            }
                        }
                        else
                        {
                            output = LanguageHtmlGenerator.GenerateNotAvailable(baseLang, block.Code);
                        }
                    }
                    processedRanges.Add((block.StartLine, block.EndLine, output, extractedVars));

                    // PROGRESSIVE UPDATE: Send partial result to UI immediately

                    if (partialResultCallback != null && returnHtml && !string.IsNullOrEmpty(output))
                    {
                        try
                        {
                            // Send partial HTML result to update OUTPUT while processing
                            partialResultCallback(output);

                        }
                        catch { }
                    }
                }
            }

            // Sort ranges by start line (ascending to process in order)
            processedRanges.Sort((a, b) => a.start.CompareTo(b.start));

            // Build result by replacing blocks with output
            var skipRanges = new HashSet<int>();
            foreach (var (start, end, _, _) in processedRanges)
            {
                for (int i = start; i <= end; i++)
                    skipRanges.Add(i);
            }

            // Map start lines to their output and extracted variables
            var insertedContent = new Dictionary<int, (string output, List<(string name, string value)> vars)>();
            foreach (var (start, end, output, vars) in processedRanges)
            {
                insertedContent[start] = (output, vars);
            }

            if (returnHtml)
            {
                // Return HTML fragment (NOT full document - will be wrapped by HtmlApplyWorksheet)
                var htmlBuilder = new StringBuilder();

                // Inject combined CSS for all @{} language blocks used in this document
                var cssTag = MultLangTemplateManager.GetCombinedCssStyleTag();
                if (!string.IsNullOrEmpty(cssTag))
                    htmlBuilder.AppendLine(cssTag);

                // HEKATAN MODE: Lines outside @{} blocks are markdown text
                // Accumulate in buffer and flush as rendered markdown before each block
                var markdownBuffer = new StringBuilder();

                for (int i = 0; i < lines.Length; i++)
                {
                    if (insertedContent.TryGetValue(i, out var content))
                    {
                        // Flush markdown buffer before block output
                        // Use RenderPlainColumnContent (NOT RenderMarkdown) so math expressions
                        // generate CALCPAD_INLINE markers for evaluation by HekatanOutputProcessor
                        if (markdownBuffer.Length > 0)
                        {
                            htmlBuilder.Append(RenderPlainColumnContent(markdownBuffer.ToString()));
                            markdownBuffer.Clear();
                        }

                        // Insert HTML output directly (LanguageHtmlGenerator already created the HTML)
                        htmlBuilder.AppendLine(content.output);

                        // Add variable assignments as HTML
                        if (content.vars.Count > 0)
                        {
                            htmlBuilder.AppendLine("<div style='background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 10px; margin: 10px 0;'>");
                            htmlBuilder.AppendLine("<p><strong>Variables exportadas:</strong></p>");
                            htmlBuilder.AppendLine("<ul>");
                            foreach (var (name, value) in content.vars)
                            {
                                htmlBuilder.AppendLine($"<li><code style='background-color: #c8e6c9; padding: 2px 6px; border-radius: 3px;'>{name} = {value}</code></li>");
                            }
                            htmlBuilder.AppendLine("</ul>");
                            htmlBuilder.AppendLine("</div>");
                        }
                    }
                    else if (!skipRanges.Contains(i))
                    {
                        // HEKATAN MODE: Non-block lines accumulate as markdown
                        markdownBuffer.AppendLine(lines[i]);
                    }
                }

                // Flush remaining markdown buffer
                // Use RenderPlainColumnContent (NOT RenderMarkdown) so math expressions
                // generate CALCPAD_INLINE markers for evaluation by HekatanOutputProcessor
                if (markdownBuffer.Length > 0)
                {
                    htmlBuilder.Append(RenderPlainColumnContent(markdownBuffer.ToString()));
                    markdownBuffer.Clear();
                }

                // Add JavaScript for toggle functionality (only if enabled)
                if (enableCollapse)
                {
                    htmlBuilder.AppendLine("<script>");
                    htmlBuilder.AppendLine("function toggleLangOutput(id) {");
                    htmlBuilder.AppendLine("    var content = document.getElementById(id);");
                    htmlBuilder.AppendLine("    var icon = document.getElementById(id + '-icon');");
                    htmlBuilder.AppendLine("    if (content.style.display === 'none') {");
                    htmlBuilder.AppendLine("        content.style.display = 'block';");
                    htmlBuilder.AppendLine("        icon.textContent = '▼';");
                    htmlBuilder.AppendLine("    } else {");
                    htmlBuilder.AppendLine("        content.style.display = 'none';");
                    htmlBuilder.AppendLine("        icon.textContent = '▶';");
                    htmlBuilder.AppendLine("    }");
                    htmlBuilder.AppendLine("}");
                    htmlBuilder.AppendLine("</script>");
                }

                // Close any open theme div
                if (_themeOpen)
                {
                    htmlBuilder.Append("</div>");
                    _themeOpen = false;
                }

                var finalHtml = htmlBuilder.ToString();

                return finalHtml;
            }
            else
            {
                // Inject combined CSS as HTML marker for ExpressionParser to preserve
                var cssTag = MultLangTemplateManager.GetCombinedCssStyleTag();
                if (!string.IsNullOrEmpty(cssTag))
                {
                    var base64Css = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(cssTag));
                    result.AppendLine($"<!--MULTILANG_OUTPUT:{base64Css}-->");
                }

                // Return Hekatan code with HTML markers for external block outputs
                // HTML markers will be preserved by ExpressionParser and processed later
                for (int i = 0; i < lines.Length; i++)
                {
                    if (insertedContent.TryGetValue(i, out var content))
                    {
                        // Check if output looks like HTML (contains tags)
                        var outputTrimmed = content.output?.Trim() ?? "";
                        var isHtmlOutput = outputTrimmed.StartsWith("<") ||
                                          outputTrimmed.Contains("<div") ||
                                          outputTrimmed.Contains("<p") ||
                                          outputTrimmed.Contains("<span") ||
                                          outputTrimmed.Contains("<!DOCTYPE");

                        if (isHtmlOutput)
                        {
                            // For HTML output: use a special marker that ExpressionParser will preserve
                            // Format: <!--MULTILANG_OUTPUT:base64-->
                            var base64Output = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(content.output));
                            result.AppendLine($"<!--MULTILANG_OUTPUT:{base64Output}-->");
                        }
                        else
                        {
                            // For plain text output: insert as Hekatan comments
                            var outputLines = content.output?.Split('\n') ?? Array.Empty<string>();
                            foreach (var outputLine in outputLines)
                            {
                                var trimmedLine = outputLine.TrimEnd('\r');
                                if (!string.IsNullOrWhiteSpace(trimmedLine))
                                {
                                    // Don't show CALCPAD:var=value lines in output
                                    if (!trimmedLine.StartsWith("CALCPAD:"))
                                    {
                                        // Use double quotes if line contains single quotes to avoid comment termination
                                        // Hekatan interprets ' and " as comment start, and uses the same char to end
                                        var hasSingle = trimmedLine.Contains('\'');
                                        var hasDouble = trimmedLine.Contains('"');

                                        if (hasSingle && hasDouble)
                                        {
                                            // Both quotes present - escape single quotes and use single quote prefix
                                            var escaped = trimmedLine.Replace("'", "\\'");
                                            result.AppendLine($"'{escaped}");
                                        }
                                        else
                                        {
                                            var commentChar = hasSingle ? '"' : '\'';
                                            result.AppendLine($"{commentChar}{trimmedLine}");
                                        }
                                    }
                                }
                            }
                        }

                        // Add variable assignments to Hekatan
                        if (content.vars.Count > 0)
                        {
                            result.AppendLine("'Variables exportadas:");
                            foreach (var (name, value) in content.vars)
                            {
                                // Create Hekatan assignment: name = value
                                result.AppendLine($"{name} = {value}");
                            }
                        }
                    }
                    else if (!skipRanges.Contains(i))
                    {
                        result.AppendLine(lines[i]);
                    }
                    // else: skip this line (it's part of an external code block)
                }

                var finalResult = result.ToString().TrimEnd('\r', '\n');

                return finalResult;
            }
        }

        /// <summary>
        /// Extracts CALCPAD:name=value pairs from output
        /// </summary>
        private static List<(string name, string value)> ExtractHekatanVariables(string output)
        {
            var vars = new List<(string name, string value)>();
            var matches = HekatanVarPattern.Matches(output);

            foreach (Match match in matches)
            {
                if (match.Groups.Count >= 3)
                {
                    var name = match.Groups[1].Value;
                    var value = match.Groups[2].Value.Trim();
                    vars.Add((name, value));
                }
            }

            return vars;
        }

        /// <summary>
        /// Checks if the code contains any language blocks
        /// </summary>
        public static bool HasLanguageBlocks(string code)
        {
            return MultLangManager.HasLanguageCode(code);
        }

        /// <summary>
        /// Gets a list of languages used in the code
        /// </summary>
        public static IEnumerable<string> GetUsedLanguages(string code)
        {
            var blocks = MultLangManager.ExtractCodeBlocks(code);
            return blocks.Keys;
        }

        /// <summary>
        /// Processes a Mathcad Prime (.mcdx) file and converts it to Hekatan format
        /// </summary>
        private string ProcessMcdxFile(string mcdxPath)
        {
            try
            {
                // Resolve relative paths
                if (!System.IO.Path.IsPathRooted(mcdxPath))
                {
                    // Try to find the file relative to current directory or temp
                    var currentDir = Environment.CurrentDirectory;
                    var fullPath = System.IO.Path.Combine(currentDir, mcdxPath);
                    if (System.IO.File.Exists(fullPath))
                        mcdxPath = fullPath;
                }

                if (!System.IO.File.Exists(mcdxPath))
                {
                    return $"' ERROR: Archivo Mathcad no encontrado: {mcdxPath}\n" +
                           "' Verifique la ruta del archivo .mcdx";
                }

                var converter = new McdxConverter();
                var result = converter.Convert(mcdxPath);

                // Add any warnings as comments
                if (converter.Warnings.Count > 0)
                {
                    var sb = new StringBuilder();
                    sb.AppendLine(result);
                    sb.AppendLine();
                    sb.AppendLine("' === Advertencias de conversion ===");
                    foreach (var warning in converter.Warnings)
                    {
                        sb.AppendLine($"' {warning}");
                    }
                    result = sb.ToString();
                }

                return result;
            }
            catch (Exception ex)
            {
                return $"' ERROR al convertir archivo Mathcad: {ex.Message}\n" +
                       $"' Archivo: {mcdxPath}";
            }
        }

        /// <summary>
        /// Detects if a line is likely Hekatan math (variable assignment, function call, expression, etc.).
        /// In Hekatan Calc, any line that's not a heading, text, or HTML is assumed to be math.
        /// Examples: "a = 6", "f(x) = x^2 + 1", "transpose(A)*k", "100'in", "[1; 2; 3]"
        /// </summary>
        private static bool IsLikelyHekatanMath(string line)
        {
            if (string.IsNullOrWhiteSpace(line))
                return false;

            var trimmed = line.Trim();
            if (trimmed.Length == 0)
                return false;

            char first = trimmed[0];

            // Lines starting with letter, Greek, underscore, digit, bracket, sign, or $ (units)
            bool startsLikeMath = char.IsLetter(first)
                || first == '_'
                || char.IsDigit(first)
                || first == '(' || first == '['
                || first == '-' || first == '+'
                || first == '$'
                || first == '|'
                || (first >= 'α' && first <= 'ω')
                || (first >= 'Α' && first <= 'Ω');

            if (!startsLikeMath)
                return false;

            // Contains assignment → definitely math
            if (trimmed.Contains('='))
                return true;

            // Contains math operators, brackets, or unit separator → likely math
            foreach (char c in trimmed)
            {
                if (c == '+' || c == '*' || c == '/' || c == '^'
                    || c == '(' || c == ')' || c == '[' || c == ']'
                    || c == '\'')
                    return true;
            }

            // Standalone identifier (variable evaluation) or number
            if (trimmed.Length > 0 && (char.IsLetter(first) || first == '_'))
                return true;

            if (char.IsDigit(first))
                return true;

            return false;
        }

        /// <summary>
        /// Renders markdown content to HTML
        /// </summary>
        private string RenderMarkdown(string markdownCode)
        {
            try
            {
                // WORKAROUND: Markdig.Signed 0.43.0 UsePipeTables() doesn't work
                // Manually convert markdown tables to HTML before processing
                var processedCode = ConvertTablesToHtml(markdownCode);

                // Process rest of markdown normally
                var pipeline = new MarkdownPipelineBuilder()
                    .UseEmphasisExtras()
                    .UseListExtras()
                    .UseAutoIdentifiers()  // Enable automatic heading IDs for internal links
                    .Build();

                var html = Markdown.ToHtml(processedCode, pipeline);

                return html;
            }
            catch (Exception ex)
            {
                return $"<div class=\"error\">Error rendering markdown: {ex.Message}</div>";
            }
        }

        private string ConvertTablesToHtml(string markdown)
        {
            var lines = markdown.Split('\n');
            var result = new StringBuilder();
            var i = 0;

            while (i < lines.Length)
            {
                var line = lines[i].Trim();

                // Detect table: line with |
                if (line.Contains('|') && i + 1 < lines.Length)
                {
                    var nextLine = lines[i + 1].Trim();
                    // Check if next line is separator (contains | and -)
                    if (nextLine.Contains('|') && nextLine.Contains('-'))
                    {
                        // This is a table! Add inline styles for borders
                        result.AppendLine("<table style=\"border-collapse: collapse; width: 100%; margin: 10px 0;\">");

                        // Parse header
                        var headers = line.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                        result.AppendLine("<thead><tr>");
                        foreach (var header in headers)
                            result.AppendLine($"<th style=\"border: 1px solid #ddd; padding: 8px 12px; background-color: #f0f0f0; font-weight: bold;\">{ProcessInlineMarkdown(header)}</th>");
                        result.AppendLine("</tr></thead>");

                        // Skip separator line
                        i += 2;

                        // Parse rows
                        result.AppendLine("<tbody>");
                        while (i < lines.Length && lines[i].Trim().Contains('|'))
                        {
                            var rowLine = lines[i].Trim();
                            var cells = rowLine.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                            result.AppendLine("<tr>");
                            foreach (var cell in cells)
                                result.AppendLine($"<td style=\"border: 1px solid #ddd; padding: 8px 12px;\">{ProcessInlineMarkdown(cell)}</td>");
                            result.AppendLine("</tr>");
                            i++;
                        }
                        result.AppendLine("</tbody></table>");
                        continue;
                    }
                }

                result.AppendLine(lines[i]);
                i++;
            }

            return result.ToString();
        }

        private string ProcessInlineMarkdown(string text)
        {
            // Process inline markdown: **bold**, *italic*, `code`, etc.
            text = System.Text.RegularExpressions.Regex.Replace(text, @"\*\*(.+?)\*\*", "<strong>$1</strong>");
            text = System.Text.RegularExpressions.Regex.Replace(text, @"\*(.+?)\*", "<em>$1</em>");
            text = System.Text.RegularExpressions.Regex.Replace(text, @"`(.+?)`", "<code>$1</code>");
            return text;
        }

        /// <summary>
        /// Cleanup temporary files
        /// </summary>
        public void Cleanup()
        {
            _executor.Cleanup();
        }

        /// <summary>
        /// Process inline Hekatan code blocks: @{calcpad:...}
        /// Extracts and marks them for later processing
        /// </summary>
        private string ProcessInlineHekatan(string content)
        {

            // Pattern to match @{calcpad:...}
            var result = new StringBuilder();
            int i = 0;

            while (i < content.Length)
            {
                // Look for start marker: @{calcpad:
                if (i + 10 < content.Length &&
                    content.Substring(i, 10) == "@{calcpad:")
                {
                    i += 10; // Skip the marker

                    // Find closing }
                    int braceCount = 1;
                    int start = i;

                    while (i < content.Length && braceCount > 0)
                    {
                        if (content[i] == '{')
                            braceCount++;
                        else if (content[i] == '}')
                        {
                            braceCount--;
                            if (braceCount == 0)
                            {
                                // Found closing }
                                string calcpadCode = content.Substring(start, i - start);

                                // Wrap in a special marker that will be processed later
                                // Format: <!--CALCPAD_INLINE:base64encodedcode-->
                                var encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(calcpadCode));
                                result.Append($"<!--CALCPAD_INLINE:{encoded}-->");

                                i++; // Skip }
                                break;
                            }
                        }
                        i++;
                    }
                }
                else
                {
                    result.Append(content[i]);
                    i++;
                }
            }

            var resultString = result.ToString();

            return resultString;
        }

        /// <summary>
        /// Process image block with Base64 data
        /// Format: @{image png base64}
        ///         [base64 data here]
        ///         @{end image}
        /// </summary>
        /// <param name="content">The Base64 content (without the directive line)</param>
        /// <param name="startDirective">The original start directive (e.g., "@{image png base64}")</param>
        private string ProcessImageBlock(string content, string startDirective = "")
        {

            try
            {
                // Default format
                var format = "png";

                // Extract format from start directive (e.g., "@{image png base64}" -> "png")
                if (!string.IsNullOrEmpty(startDirective))
                {
                    var directiveLower = startDirective.ToLower();
                    if (directiveLower.Contains("jpg") || directiveLower.Contains("jpeg"))
                        format = "jpeg";
                    else if (directiveLower.Contains("bmp"))
                        format = "bmp";
                    else if (directiveLower.Contains("gif"))
                        format = "gif";
                    else if (directiveLower.Contains("png"))
                        format = "png";
                }

                // The content is already pure Base64 data (no metadata line)
                var base64Content = content;

                // Clean up the Base64 string (remove whitespace, newlines)
                base64Content = base64Content
                    .Replace("\n", "")
                    .Replace("\r", "")
                    .Replace(" ", "")
                    .Replace("\t", "")
                    .Trim();

                if (string.IsNullOrWhiteSpace(base64Content))
                {
                    return "<p style='color:red;'>Error: No se encontró contenido Base64</p>";
                }

                // Validate Base64 format (basic check)
                if (base64Content.Length % 4 != 0)
                {
                    // Add padding if needed
                    int padding = 4 - (base64Content.Length % 4);
                    if (padding < 4)
                    {
                        base64Content += new string('=', padding);
                    }
                }

                // Generate HTML with embedded image
                var html = $"<div style='text-align:center; margin: 20px 0;'>" +
                          $"<img src='data:image/{format};base64,{base64Content}' " +
                          $"style='max-width:100%; height:auto; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);' " +
                          $"alt='Imagen embebida' />" +
                          $"</div>";

                return html;
            }
            catch (Exception ex)
            {

                return $"<p style='color:red;'>Error al procesar imagen: {ex.Message}</p>";
            }
        }

        /// <summary>
        /// Process variable substitution in markdown: $varName -> value
        /// This allows writing clean markdown with embedded variable values
        /// Example: "El resultado es $x" -> "El resultado es 42"
        /// </summary>
        private string ProcessMarkdownVariables(string content, Dictionary<string, object> variables)
        {
            if (variables == null || variables.Count == 0)
                return content;

            var result = content;

            // Replace $varName with variable value
            // Pattern: $followed by word characters, not preceded by backslash
            result = System.Text.RegularExpressions.Regex.Replace(
                result,
                @"(?<!\\)\$([a-zA-Z_][a-zA-Z0-9_]*)",
                m =>
                {
                    var varName = m.Groups[1].Value;
                    if (variables.TryGetValue(varName, out var value))
                    {
                        // Format based on type
                        if (value is double d)
                            return d.ToString("G10", System.Globalization.CultureInfo.InvariantCulture);
                        else if (value is int i)
                            return i.ToString();
                        else if (value is double[] arr)
                            return "[" + string.Join(", ", arr.Select(x => x.ToString("G6", System.Globalization.CultureInfo.InvariantCulture))) + "]";
                        else if (value is double[,] matrix)
                            return FormatMatrixCompact(matrix);
                        else
                            return value?.ToString() ?? "";
                    }
                    return m.Value; // Keep original if variable not found
                }
            );

            // Allow escaping: \$ -> $
            result = result.Replace("\\$", "$");

            return result;
        }

        /// <summary>
        /// Format a 2D matrix in compact form for markdown display
        /// </summary>
        private string FormatMatrixCompact(double[,] matrix)
        {
            var rows = matrix.GetLength(0);
            var cols = matrix.GetLength(1);
            var sb = new StringBuilder("[");
            for (int i = 0; i < rows; i++)
            {
                if (i > 0) sb.Append("; ");
                for (int j = 0; j < cols; j++)
                {
                    if (j > 0) sb.Append(", ");
                    sb.Append(matrix[i, j].ToString("G6", System.Globalization.CultureInfo.InvariantCulture));
                }
            }
            sb.Append("]");
            return sb.ToString();
        }

        /// <summary>
        /// Process @{table} block - generates HTML table from Hekatan matrix/vector
        /// Syntax:
        ///   @{table}
        ///   matrixName
        ///   headers=A,B,C  (optional column headers)
        ///   rows=1,2,3     (optional row headers)
        ///   style=bordered (optional: bordered, striped, minimal)
        ///   export=file.xlsx (optional: export to Excel)
        ///   @{end table}
        /// </summary>
        public string ProcessTableBlockPublic(string content, Dictionary<string, object> variables)
        {
            return ProcessTableBlock(content, variables);
        }

        public string ProcessEqDefBlockPublic(string content, Dictionary<string, object> variables)
        {
            return ProcessEqDefBlock(content, variables);
        }

        public string ProcessEquationBlockPublic(string content, Dictionary<string, object> variables)
        {
            return ProcessEquationBlock(content, variables);
        }

        public string ProcessPlotBlockPublic(string content, Dictionary<string, object> variables)
        {
            return ProcessPlotBlock(content, variables);
        }

        public string ProcessIntegralBlockPublic(string content, Dictionary<string, object> variables)
        {
            return ProcessIntegralBlock(content, variables);
        }

        public string ProcessDerivateBlockPublic(string content, Dictionary<string, object> variables)
        {
            return ProcessDerivateBlock(content, variables);
        }

        public string ProcessGaussBlockPublic(string content, Dictionary<string, object> variables)
        {
            return ProcessGaussBlock(content, variables);
        }

        /// <summary>
        /// Process @{svg} block - SVG Drawing DSL
        /// Simplified syntax without XML tags:
        ///   @{svg 600 400}
        ///   background #f5f5f5
        ///   line 0 0 100 100 stroke:red width:2
        ///   circle 200 150 50 fill:blue
        ///   text 200 50 "Title" size:18 anchor:middle bold
        ///   @{end svg}
        /// Also supports raw SVG (backward compatible): if content contains &lt;svg, passes through.
        /// </summary>
        private string ProcessSvgBlock(string content, string directive, Dictionary<string, object> variables)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return "<p style='color:red;'>Error: Bloque @{svg} vac\u00edo</p>";

                // Substitute $varName with variable values
                var processed = ProcessMarkdownVariables(content, variables);
                var trimmed = processed.Trim();

                // BACKWARD COMPAT: If content contains <svg or < tags, use old passthrough
                if (trimmed.Contains("<svg", StringComparison.OrdinalIgnoreCase) ||
                    (trimmed.Contains("<") && trimmed.Contains("/>")))
                {
                    if (trimmed.Contains("<svg", StringComparison.OrdinalIgnoreCase))
                        return $"<div class=\"svg-block\" style=\"text-align: center; margin: 10px 0;\">{trimmed}</div>";
                    return $"<div class=\"svg-block\" style=\"text-align: center; margin: 10px 0;\">" +
                           $"<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"max-width: 100%;\">{trimmed}</svg></div>";
                }

                // NEW DSL MODE: Parse simplified commands
                // Parse width/height from directive: @{svg 600 400} or @{svg w:600 h:400}
                int svgWidth = 500, svgHeight = 400;
                ParseSvgDirectiveSize(directive, out svgWidth, out svgHeight);

                var lines = trimmed.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
                var elements = new StringBuilder();
                var defs = new StringBuilder();
                bool needsArrowDef = false;
                bool needsDimDef = false;
                bool needsDarrowDef = false;
                bool needsMomentDef = false;
                string bgColor = null;
                bool yUp = false;
                bool fitMode = false;
                double fitMargin = 5; // % margin for fit

                // Persistent state variables
                string svgStroke = null, svgFill = null, svgWidth2 = null;
                string svgOpacity = null, svgDash = null, svgFont = null, svgFontSize = null;

                // Bounding box tracking for fit mode
                double bbMinX = double.MaxValue, bbMinY = double.MaxValue;
                double bbMaxX = double.MinValue, bbMaxY = double.MinValue;
                void TrackBB(double x, double y) { if (x < bbMinX) bbMinX = x; if (x > bbMaxX) bbMaxX = x; if (y < bbMinY) bbMinY = y; if (y > bbMaxY) bbMaxY = y; }

                // First pass: check what markers/features we need
                foreach (var rawLine in lines)
                {
                    var line = rawLine.Trim().ToLower();
                    if (line.StartsWith("arrow")) needsArrowDef = true;
                    if (line.StartsWith("dim") || line.StartsWith("hdim") || line.StartsWith("vdim")) needsDimDef = true;
                    if (line.StartsWith("darrow")) needsDarrowDef = true;
                    if (line.StartsWith("moment") || line.StartsWith("carc")) needsMomentDef = true;
                    if (line.StartsWith("background"))
                    {
                        var parts = SplitSvgLine(rawLine.Trim());
                        if (parts.Count > 1) bgColor = parts[1];
                    }
                    if (line == "yup") yUp = true;
                    if (line.StartsWith("fit"))
                    {
                        fitMode = true;
                        var parts = SplitSvgLine(rawLine.Trim());
                        if (parts.Count > 1 && double.TryParse(parts[1], System.Globalization.NumberStyles.Float,
                            System.Globalization.CultureInfo.InvariantCulture, out var fm)) fitMargin = fm;
                    }
                    // Track bounding box for fit mode
                    if (fitMode)
                    {
                        var parts = SplitSvgLine(rawLine.Trim());
                        if (parts.Count >= 3)
                        {
                            for (int pi = 1; pi < parts.Count; pi++)
                            {
                                if (double.TryParse(parts[pi], System.Globalization.NumberStyles.Float,
                                    System.Globalization.CultureInfo.InvariantCulture, out var val))
                                {
                                    // Track alternating x,y values from positional params
                                    if (pi % 2 == 1) TrackBB(val, 0);
                                    else TrackBB(0, val);
                                }
                            }
                        }
                    }
                }

                // Build defs with all needed markers
                bool anyDefs = needsArrowDef || needsDimDef || needsDarrowDef || needsMomentDef;
                if (anyDefs)
                {
                    defs.Append("<defs>");
                    // Standard arrowhead
                    if (needsArrowDef || needsDimDef)
                    {
                        defs.Append("<marker id=\"svg-arrowhead\" markerWidth=\"10\" markerHeight=\"7\" refX=\"10\" refY=\"3.5\" orient=\"auto\">");
                        defs.Append("<polygon points=\"0 0, 10 3.5, 0 7\" fill=\"context-stroke\"/>");
                        defs.Append("</marker>");
                    }
                    // Dimension arrows (smaller, both ends)
                    if (needsDimDef)
                    {
                        defs.Append("<marker id=\"svg-dim-start\" markerWidth=\"8\" markerHeight=\"6\" refX=\"0\" refY=\"3\" orient=\"auto\">");
                        defs.Append("<polygon points=\"8 0, 0 3, 8 6\" fill=\"context-stroke\"/>");
                        defs.Append("</marker>");
                        defs.Append("<marker id=\"svg-dim-end\" markerWidth=\"8\" markerHeight=\"6\" refX=\"8\" refY=\"3\" orient=\"auto\">");
                        defs.Append("<polygon points=\"0 0, 8 3, 0 6\" fill=\"context-stroke\"/>");
                        defs.Append("</marker>");
                    }
                    // Double arrow (rotation DOF) - two arrowheads
                    if (needsDarrowDef)
                    {
                        defs.Append("<marker id=\"svg-darrow-start\" markerWidth=\"8\" markerHeight=\"6\" refX=\"0\" refY=\"3\" orient=\"auto\">");
                        defs.Append("<polygon points=\"8 0, 0 3, 8 6\" fill=\"context-stroke\"/>");
                        defs.Append("</marker>");
                        defs.Append("<marker id=\"svg-darrow-end\" markerWidth=\"8\" markerHeight=\"6\" refX=\"8\" refY=\"3\" orient=\"auto\">");
                        defs.Append("<polygon points=\"0 0, 8 3, 0 6\" fill=\"context-stroke\"/>");
                        defs.Append("</marker>");
                    }
                    // Moment arc arrow
                    if (needsMomentDef)
                    {
                        defs.Append("<marker id=\"svg-moment-arrow\" markerWidth=\"8\" markerHeight=\"6\" refX=\"8\" refY=\"3\" orient=\"auto\">");
                        defs.Append("<polygon points=\"0 0, 8 3, 0 6\" fill=\"context-stroke\"/>");
                        defs.Append("</marker>");
                    }
                    defs.Append("</defs>");
                }

                // Background rect
                if (bgColor != null)
                {
                    elements.Append($"<rect x=\"0\" y=\"0\" width=\"{svgWidth}\" height=\"{svgHeight}\" fill=\"{EscAttr(bgColor)}\" />");
                }

                // Process each line
                foreach (var rawLine in lines)
                {
                    var line = rawLine.Trim();
                    if (string.IsNullOrEmpty(line) || line.StartsWith("#") || line.StartsWith("//"))
                        continue;

                    var tokens = SplitSvgLine(line);
                    if (tokens.Count == 0) continue;

                    var cmd = tokens[0].ToLower();
                    if (cmd == "background" || cmd == "yup" || cmd == "fit") continue; // already handled

                    // State commands: modify persistent state, don't emit SVG
                    if (cmd == "color" || cmd == "stroke") { svgStroke = tokens.Count > 1 ? tokens[1] : null; continue; }
                    if (cmd == "fill") { svgFill = tokens.Count > 1 ? tokens[1] : null; continue; }
                    if (cmd == "width") { svgWidth2 = tokens.Count > 1 ? tokens[1] : null; continue; }
                    if (cmd == "opacity") { svgOpacity = tokens.Count > 1 ? tokens[1] : null; continue; }
                    if (cmd == "dash") { svgDash = tokens.Count > 1 ? tokens[1] : null; continue; }
                    if (cmd == "font") { svgFont = tokens.Count > 1 ? tokens[1] : null; continue; }
                    if (cmd == "fontsize") { svgFontSize = tokens.Count > 1 ? tokens[1] : null; continue; }
                    if (cmd == "reset") { svgStroke = svgFill = svgWidth2 = svgOpacity = svgDash = svgFont = svgFontSize = null; continue; }

                    var svgEl = ConvertSvgCommand(cmd, tokens, svgWidth, svgHeight, yUp,
                        svgStroke, svgFill, svgWidth2, svgOpacity, svgDash, svgFont, svgFontSize);
                    if (svgEl != null)
                        elements.Append(svgEl);
                }

                // Build final SVG
                var svg = new StringBuilder();
                svg.Append($"<div class=\"svg-block\" style=\"text-align: center; margin: 10px 0;\">");

                // Compute viewBox
                string viewBox;
                if (fitMode && bbMinX < bbMaxX && bbMinY < bbMaxY)
                {
                    double rangeX = bbMaxX - bbMinX, rangeY = bbMaxY - bbMinY;
                    if (rangeX < 1) rangeX = 1; if (rangeY < 1) rangeY = 1;
                    double mx = rangeX * fitMargin / 100, my = rangeY * fitMargin / 100;
                    var inv = System.Globalization.CultureInfo.InvariantCulture;
                    viewBox = $"{(bbMinX - mx).ToString(inv)} {(bbMinY - my).ToString(inv)} {(rangeX + 2 * mx).ToString(inv)} {(rangeY + 2 * my).ToString(inv)}";
                }
                else
                {
                    viewBox = $"0 0 {svgWidth} {svgHeight}";
                }

                svg.Append($"<svg viewBox=\"{viewBox}\" xmlns=\"http://www.w3.org/2000/svg\" ");
                svg.Append($"style=\"width:{svgWidth}pt; height:{svgHeight}pt; max-width:100%;\">");
                svg.Append(defs);

                if (yUp)
                    svg.Append($"<g transform=\"translate(0,{svgHeight}) scale(1,-1)\">");

                svg.Append(elements);

                if (yUp)
                    svg.Append("</g>");

                svg.Append("</svg></div>");

                return svg.ToString();
            }
            catch (Exception ex)
            {
                return $"<div style='color: red;'>Error in @{{svg}}: {ex.Message}</div>";
            }
        }

        /// <summary>Public accessor for @{page markdown} mode</summary>
        public string ProcessSvgBlockPublic(string content, string directive, Dictionary<string, object> variables)
        {
            return ProcessSvgBlock(content, directive, variables);
        }

        /// <summary>
        /// Process @{animation} blocks — generates synchronized Canvas+JS animation
        /// (mass-spring-damper + phasor spiral + sinusoidal waveform).
        /// DSL body supports key:value parameters per line.
        /// </summary>
        private string ProcessAnimationBlock(string content, string directive, Dictionary<string, object> variables)
        {
            try
            {
                int w = 880, h = 480;

                // Parse DSL parameters from body
                var parms = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (!string.IsNullOrWhiteSpace(content))
                {
                    var processed = ProcessMarkdownVariables(content, variables);
                    foreach (var rawLine in processed.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries))
                    {
                        var line = rawLine.Trim();
                        if (string.IsNullOrEmpty(line) || line.StartsWith("#")) continue;
                        var idx = line.IndexOf(':');
                        if (idx > 0)
                        {
                            parms[line.Substring(0, idx).Trim()] = line.Substring(idx + 1).Trim();
                        }
                    }
                }

                return GenerateSpringAnimation(w, h, parms);
            }
            catch (Exception ex)
            {
                return $"<div style='color:red;'>Error in @{{animation}}: {ex.Message}</div>";
            }
        }

        /// <summary>
        /// Generates a synchronized Canvas animation with mass-spring-damper,
        /// phasor spiral, and sinusoidal waveform — all driven by requestAnimationFrame.
        /// Parameters: xi1, xi2 (damping ratios), label1, label2, title, wn
        /// </summary>
        private string GenerateSpringAnimation(int w, int h, Dictionary<string, string> p)
        {
            var title = p.GetValueOrDefault("title", "Animacion Sincronizada");
            var xi1 = p.GetValueOrDefault("xi1", p.GetValueOrDefault("xi", "0.125"));
            var xi2 = p.GetValueOrDefault("xi2", "0.5");
            var label1 = p.GetValueOrDefault("label1", "poco amortiguamiento");
            var label2 = p.GetValueOrDefault("label2", "buen amortiguamiento");
            var wnVal = p.GetValueOrDefault("wn", "2");

            var uid = "sa" + Guid.NewGuid().ToString("N").Substring(0, 8);
            string JsEsc(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", " ").Replace("\r", "");

            var sb = new StringBuilder();
            sb.Append("<canvas id=\"").Append(uid)
              .Append("\" width=\"880\" height=\"480\" style=\"border:2px solid #ddd;border-radius:8px;background:#fafafa;display:block;margin:10px auto\"></canvas>");
            sb.Append("<div style=\"text-align:center;margin:6px auto;font-size:12px;color:#555;font-family:sans-serif\">");
            sb.Append("<label>&#9654; Velocidad: <input type=\"range\" id=\"").Append(uid).Append("spd\" min=\"0.1\" max=\"3.0\" step=\"0.1\" value=\"0.6\" style=\"width:200px;vertical-align:middle\"> ");
            sb.Append("<b><span id=\"").Append(uid).Append("sv\">0.6</span>x</b></label>");
            sb.Append("&nbsp;&nbsp;<button id=\"").Append(uid).Append("rst\" style=\"font-size:11px;padding:2px 8px;cursor:pointer\">Reset</button></div>");

            var js = "(function(){"
+ "var cv=document.getElementById(\"__UID__\");if(!cv)return;"
+ "var c=cv.getContext(\"2d\"),W=880,H=480;"
+ "var wn=__WN__,tMax=25,nP=500,prog=0,spd=0.6,pF=0;"
+ "var x1v=__XI1__,x2v=__XI2__,c1=\"#d32f2f\",c2=\"#1565c0\";"
+ "var sl=document.getElementById(\"__UID__spd\"),sv=document.getElementById(\"__UID__sv\"),rb=document.getElementById(\"__UID__rst\");"
+ "if(sl){sl.addEventListener(\"input\",function(){spd=parseFloat(this.value);sv.textContent=spd.toFixed(1);});}"
+ "if(rb){rb.addEventListener(\"click\",function(){spd=0.6;sl.value=0.6;sv.textContent=\"0.6\";prog=0;pF=0;});}"
+ "var msH=185,eq=115,amp=35,pcx=135,pcy=340,pR=120;"
+ "var wL=295,wR=865,wT=220,wB=460,wW=wR-wL,wH=wB-wT,wCY=wT+wH/2;"
+ "function rsp(t,xi){var w=wn*Math.sqrt(1-xi*xi);return Math.exp(-xi*wn*t)*Math.sin(w*t);}"
+ "function env(t,xi){return Math.exp(-xi*wn*t);}"
+ "function pXf(t,xi){var w=wn*Math.sqrt(1-xi*xi);return Math.exp(-xi*wn*t)*Math.cos(w*t);}"
+ "function tXf(t){return wL+(t/tMax)*wW;}"
+ "function vYf(v){return wCY-v*(wH/2);}"
+ "function zig(x,y1,y2,n){"
+ "var s=(y2-y1)/(2*n+2);c.beginPath();c.moveTo(x,y1);c.lineTo(x,y1+s);"
+ "for(var i=0;i<n;i++){c.lineTo(x-10,y1+s*(2*i+2));c.lineTo(x+10,y1+s*(2*i+3));}"
+ "c.lineTo(x,y2);c.strokeStyle=\"#777\";c.lineWidth=1.5;c.stroke();}"
+ "function pis(x,y1,y2){"
+ "var m=(y1+y2)/2,pw=7,ph=14;c.strokeStyle=\"#aaa\";c.lineWidth=1.5;"
+ "c.beginPath();c.moveTo(x,y1);c.lineTo(x,m-ph/2);c.stroke();"
+ "c.strokeRect(x-pw,m-ph/2,pw*2,ph);"
+ "c.beginPath();c.moveTo(x,m+ph/2);c.lineTo(x,y2);c.stroke();}"
+ "function bx(x,y,w,h,col,txt){"
+ "c.fillStyle=col;c.fillRect(x,y,w,h);c.fillStyle=\"#fff\";"
+ "c.font=\"bold 13px sans-serif\";c.textAlign=\"center\";c.fillText(txt,x+w/2,y+h/2+5);}"
+ "function drawMS(tCur){"
+ "var a1=amp*rsp(tCur,x1v),a2=amp*rsp(tCur,x2v);"
+ "c.fillStyle=\"#333\";c.font=\"bold 12px sans-serif\";c.textAlign=\"center\";"
+ "c.fillText(\"__TITLE__\",W/2,16);"
+ "var px1=290;"
+ "c.fillStyle=c1;c.font=\"bold 10px sans-serif\";"
+ "c.fillText(\"\\u03BE = \"+x1v+\" (__LAB1__)\",px1,33);"
+ "c.fillStyle=\"#666\";c.fillRect(px1-50,40,100,5);"
+ "for(var i=0;i<5;i++)c.fillRect(px1-45+i*20,35,2,5);"
+ "zig(px1-18,45,eq+a1,5);pis(px1+18,45,eq+a1);bx(px1-22,eq+a1,44,32,c1,\"m\");"
+ "var px2=590;"
+ "c.fillStyle=c2;c.font=\"bold 10px sans-serif\";"
+ "c.fillText(\"\\u03BE = \"+x2v+\" (__LAB2__)\",px2,33);"
+ "c.fillStyle=\"#666\";c.fillRect(px2-50,40,100,5);"
+ "for(var i=0;i<5;i++)c.fillRect(px2-45+i*20,35,2,5);"
+ "zig(px2-18,45,eq+a2,5);pis(px2+18,45,eq+a2);bx(px2-22,eq+a2,44,32,c2,\"m\");"
+ "c.setLineDash([3,3]);c.strokeStyle=\"#bbb\";c.lineWidth=0.5;"
+ "c.beginPath();c.moveTo(200,eq+16);c.lineTo(700,eq+16);c.stroke();c.setLineDash([]);"
+ "c.fillStyle=\"#aaa\";c.font=\"8px sans-serif\";c.textAlign=\"left\";c.fillText(\"equilibrio\",205,eq+14);"
+ "if(Math.abs(a1)>2){c.strokeStyle=c1;c.lineWidth=1;"
+ "c.beginPath();c.moveTo(px1+28,eq+16);c.lineTo(px1+28,eq+a1+16);c.stroke();"
+ "c.beginPath();c.moveTo(px1+25,eq+a1+16);c.lineTo(px1+28,eq+a1+10);c.stroke();"
+ "c.beginPath();c.moveTo(px1+31,eq+a1+16);c.lineTo(px1+28,eq+a1+10);c.stroke();}"
+ "if(Math.abs(a2)>2){c.strokeStyle=c2;c.lineWidth=1;"
+ "c.beginPath();c.moveTo(px2+28,eq+16);c.lineTo(px2+28,eq+a2+16);c.stroke();"
+ "c.beginPath();c.moveTo(px2+25,eq+a2+16);c.lineTo(px2+28,eq+a2+10);c.stroke();"
+ "c.beginPath();c.moveTo(px2+31,eq+a2+16);c.lineTo(px2+28,eq+a2+10);c.stroke();}"
+ "c.textAlign=\"center\";c.font=\"11px sans-serif\";"
+ "c.fillStyle=c1;c.fillText(\"\\u2195 Vibra MUCHO\",px1,msH-5);"
+ "c.fillStyle=c2;c.fillText(\"\\u2195 Vibra poco\",px2,msH-5);}"
+ "function drawPH(n){"
+ "c.fillStyle=\"#333\";c.font=\"bold 11px sans-serif\";c.textAlign=\"center\";"
+ "c.fillText(\"Diagrama Fasorial (espiral)\",pcx,205);"
+ "c.setLineDash([3,3]);c.strokeStyle=\"#ddd\";c.lineWidth=1;"
+ "c.beginPath();c.arc(pcx,pcy,pR,0,2*Math.PI);c.stroke();"
+ "c.beginPath();c.arc(pcx,pcy,pR*0.5,0,2*Math.PI);c.stroke();"
+ "c.setLineDash([]);c.strokeStyle=\"#ddd\";c.lineWidth=0.5;"
+ "c.beginPath();c.moveTo(pcx-pR-10,pcy);c.lineTo(pcx+pR+10,pcy);c.stroke();"
+ "c.beginPath();c.moveTo(pcx,pcy-pR-10);c.lineTo(pcx,pcy+pR+10);c.stroke();"
+ "drawSp(x1v,c1,n);drawSp(x2v,c2,n);"
+ "c.fillStyle=\"#999\";c.font=\"9px sans-serif\";c.textAlign=\"center\";"
+ "c.fillText(\"El vector gira y decrece\",pcx,H-8);}"
+ "function drawSp(xi,col,n){"
+ "c.strokeStyle=col;c.lineWidth=1.5;c.globalAlpha=0.5;c.beginPath();"
+ "for(var i=0;i<=n;i++){var t=i*tMax/nP,px=pcx+pXf(t,xi)*pR,py=pcy-rsp(t,xi)*pR;"
+ "if(i===0)c.moveTo(px,py);else c.lineTo(px,py);}"
+ "c.stroke();c.globalAlpha=1;"
+ "if(n>0){var t2=n*tMax/nP,px2=pcx+pXf(t2,xi)*pR,py2=pcy-rsp(t2,xi)*pR;"
+ "c.fillStyle=col;c.beginPath();c.arc(px2,py2,4,0,2*Math.PI);c.fill();"
+ "c.strokeStyle=col;c.globalAlpha=0.3;c.lineWidth=1;"
+ "c.beginPath();c.moveTo(pcx,pcy);c.lineTo(px2,py2);c.stroke();c.globalAlpha=1;}}"
+ "function drawWF(n){"
+ "c.fillStyle=\"#333\";c.font=\"bold 11px sans-serif\";c.textAlign=\"center\";"
+ "c.fillText(\"Forma Sinusoidal x(t)\",wL+wW/2,205);"
+ "c.strokeStyle=\"#eee\";c.lineWidth=0.5;var i;"
+ "for(i=0;i<=10;i++){var gx=wL+i*wW/10;c.beginPath();c.moveTo(gx,wT);c.lineTo(gx,wB);c.stroke();}"
+ "for(i=0;i<=8;i++){var gy=wT+i*wH/8;c.beginPath();c.moveTo(wL,gy);c.lineTo(wR,gy);c.stroke();}"
+ "c.strokeStyle=\"#bbb\";c.lineWidth=0.7;"
+ "c.beginPath();c.moveTo(wL,wCY);c.lineTo(wR,wCY);c.stroke();"
+ "c.strokeStyle=\"#999\";c.lineWidth=1;c.strokeRect(wL,wT,wW,wH);"
+ "c.fillStyle=\"#666\";c.font=\"9px sans-serif\";c.textAlign=\"right\";"
+ "c.fillText(\"1.0\",wL-3,wT+3);c.fillText(\"0\",wL-3,wCY+3);c.fillText(\"-1.0\",wL-3,wB+3);"
+ "c.textAlign=\"center\";"
+ "for(i=0;i<=5;i++)c.fillText((i*tMax/5).toFixed(0),tXf(i*tMax/5),wB+13);"
+ "c.fillText(\"t (s)\",wL+wW/2,H-5);"
+ "drawWv(x1v,c1,n);drawWv(x2v,c2,n);"
+ "if(n>0&&n<nP){var t=n*tMax/nP;"
+ "c.setLineDash([2,2]);c.strokeStyle=\"#666\";c.lineWidth=0.5;"
+ "c.beginPath();c.moveTo(tXf(t),wT);c.lineTo(tXf(t),wB);c.stroke();c.setLineDash([]);}}"
+ "function drawWv(xi,col,n){"
+ "c.setLineDash([3,3]);c.strokeStyle=col;c.globalAlpha=0.2;c.lineWidth=1;c.beginPath();"
+ "for(var i=0;i<=n;i++){var t=i*tMax/nP;if(i===0)c.moveTo(tXf(t),vYf(env(t,xi)));else c.lineTo(tXf(t),vYf(env(t,xi)));}"
+ "c.stroke();c.beginPath();"
+ "for(var i=0;i<=n;i++){var t=i*tMax/nP;if(i===0)c.moveTo(tXf(t),vYf(-env(t,xi)));else c.lineTo(tXf(t),vYf(-env(t,xi)));}"
+ "c.stroke();c.setLineDash([]);c.globalAlpha=1;"
+ "c.strokeStyle=col;c.lineWidth=2;c.beginPath();"
+ "for(var i=0;i<=n;i++){var t=i*tMax/nP;if(i===0)c.moveTo(tXf(t),vYf(rsp(t,xi)));else c.lineTo(tXf(t),vYf(rsp(t,xi)));}"
+ "c.stroke();"
+ "if(n>0&&n<nP){var t=n*tMax/nP;c.fillStyle=col;c.beginPath();c.arc(tXf(t),vYf(rsp(t,xi)),3,0,2*Math.PI);c.fill();}}"
+ "function conn(n){"
+ "if(n<1||n>=nP)return;var t=n*tMax/nP;"
+ "c.setLineDash([2,3]);c.lineWidth=1;"
+ "var v1=rsp(t,x1v),yC1=pcy-v1*pR;"
+ "c.strokeStyle=c1;c.globalAlpha=0.25;"
+ "c.beginPath();c.moveTo(pcx+pR+5,yC1);c.lineTo(wL,yC1);c.stroke();"
+ "var v2=rsp(t,x2v),yC2=pcy-v2*pR;"
+ "c.strokeStyle=c2;"
+ "c.beginPath();c.moveTo(pcx+pR+5,yC2);c.lineTo(wL,yC2);c.stroke();"
+ "c.setLineDash([]);c.globalAlpha=1;}"
+ "function leg(){"
+ "c.lineWidth=2;c.font=\"10px sans-serif\";c.textAlign=\"left\";"
+ "c.strokeStyle=c1;c.beginPath();c.moveTo(20,H-12);c.lineTo(40,H-12);c.stroke();"
+ "c.fillStyle=c1;c.fillText(\"\\u03BE=\"+x1v+\" (__LAB1__)\",44,H-8);"
+ "c.strokeStyle=c2;c.beginPath();c.moveTo(W/2-30,H-12);c.lineTo(W/2-10,H-12);c.stroke();"
+ "c.fillStyle=c2;c.fillText(\"\\u03BE=\"+x2v+\" (__LAB2__)\",W/2-6,H-8);}"
+ "function frame(){"
+ "c.clearRect(0,0,W,H);c.fillStyle=\"#fafafa\";c.fillRect(0,0,W,H);"
+ "var n=Math.min(Math.floor(prog),nP),tCur=n*tMax/nP;"
+ "c.strokeStyle=\"#ddd\";c.lineWidth=1;"
+ "c.beginPath();c.moveTo(10,msH+7);c.lineTo(W-10,msH+7);c.stroke();"
+ "drawMS(tCur);drawPH(n);drawWF(n);conn(n);leg();"
+ "if(n>=nP){pF++;if(pF>150){prog=0;pF=0;}}else{prog+=spd;}"
+ "requestAnimationFrame(frame);}"
+ "frame();})();";

            js = js.Replace("__UID__", uid)
                   .Replace("__XI1__", xi1)
                   .Replace("__XI2__", xi2)
                   .Replace("__WN__", wnVal)
                   .Replace("__TITLE__", JsEsc(title))
                   .Replace("__LAB1__", JsEsc(label1))
                   .Replace("__LAB2__", JsEsc(label2));

            sb.Append("<script>").Append(js).Append("</script>");
            return sb.ToString();
        }


        // =====================================================================
        // @{tree} - Tree/hierarchy diagram DSL
        // =====================================================================

        /// <summary>
        /// Process @{tree} block - generates a tree diagram from indented text.
        /// Each line is a node. Indentation (2 spaces per level) defines parent-child.
        /// Options on directive: @{tree title:"Mi Arbol" style:box|line|minimal}
        /// Line syntax: NodeText [icon:folder|file|gear|star|check|x|arrow]
        /// </summary>
        private string ProcessTreeBlock(string content, string directive, Dictionary<string, object> variables)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return "<p style='color:red;'>Error: Bloque @{tree} vacio</p>";

                var processed = ProcessMarkdownVariables(content, variables);
                var rawLines = processed.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

                // Parse directive options
                string title = null;
                string color = "#1565c0";
                string orientation = "vertical"; // vertical or horizontal

                var titleMatch = System.Text.RegularExpressions.Regex.Match(directive, @"title:""([^""]+)""", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (titleMatch.Success) title = titleMatch.Groups[1].Value;
                else
                {
                    var tm2 = System.Text.RegularExpressions.Regex.Match(directive, @"title:(\S+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    if (tm2.Success) title = tm2.Groups[1].Value;
                }
                var colorMatch = System.Text.RegularExpressions.Regex.Match(directive, @"color:(\S+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (colorMatch.Success) color = colorMatch.Groups[1].Value;
                if (directive.Contains("horizontal", StringComparison.OrdinalIgnoreCase)) orientation = "horizontal";

                // Parse lines into tree nodes
                var nodes = new List<(int level, string text, string icon)>();
                foreach (var rawLine in rawLines)
                {
                    if (string.IsNullOrWhiteSpace(rawLine)) continue;
                    var trimmed = rawLine.TrimEnd();
                    if (trimmed.TrimStart().StartsWith("#")) continue;

                    int spaces = 0;
                    while (spaces < trimmed.Length && trimmed[spaces] == ' ') spaces++;
                    int level = spaces / 2;
                    var nodeText = trimmed.TrimStart();

                    string icon = null;
                    var iconIdx = nodeText.IndexOf(" icon:", StringComparison.OrdinalIgnoreCase);
                    if (iconIdx >= 0)
                    {
                        icon = nodeText.Substring(iconIdx + 6).Trim();
                        nodeText = nodeText.Substring(0, iconIdx).Trim();
                    }
                    nodes.Add((level, nodeText, icon));
                }

                if (nodes.Count == 0)
                    return "<p style='color:gray;'>@{tree}: sin nodos</p>";

                // Determine which nodes have children
                var hasChildren = new bool[nodes.Count];
                for (int i = 0; i < nodes.Count - 1; i++)
                    if (nodes[i + 1].level > nodes[i].level) hasChildren[i] = true;

                // Generate unique ID for this tree
                var treeId = "tree_" + Guid.NewGuid().ToString("N").Substring(0, 8);

                // Build nested <ul><li> structure
                var sb = new System.Text.StringBuilder();

                // CSS styles for the visual tree
                sb.AppendLine($"<style>");
                sb.AppendLine($"  .{treeId} {{ font-family:'Segoe UI','Arial',sans-serif; font-size:10pt; }}");
                sb.AppendLine($"  .{treeId} ul {{ list-style:none; padding-left:28px; margin:0; }}");
                sb.AppendLine($"  .{treeId} > ul {{ padding-left:0; }}");
                sb.AppendLine($"  .{treeId} li {{ position:relative; padding:3px 0 3px 0; }}");
                // Vertical line from parent down
                sb.AppendLine($"  .{treeId} li::before {{ content:''; position:absolute; left:-16px; top:0; bottom:0; width:1px; background:#c0c0c0; }}");
                // Horizontal branch line to node
                sb.AppendLine($"  .{treeId} li::after {{ content:''; position:absolute; left:-16px; top:14px; width:14px; height:1px; background:#c0c0c0; }}");
                // Root level: no lines
                sb.AppendLine($"  .{treeId} > ul > li::before, .{treeId} > ul > li::after {{ display:none; }}");
                // Last child: cut vertical line at midpoint
                sb.AppendLine($"  .{treeId} li:last-child::before {{ bottom:calc(100% - 15px); }}");
                // Node label
                sb.AppendLine($"  .{treeId} .tnode {{ display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border:1px solid #d0d0d0; border-radius:5px; background:#fff; cursor:default; user-select:none; transition:all 0.15s; box-shadow:0 1px 2px rgba(0,0,0,0.06); }}");
                sb.AppendLine($"  .{treeId} .tnode:hover {{ background:#f0f4ff; border-color:#90b0d0; box-shadow:0 2px 5px rgba(0,0,0,0.1); }}");
                sb.AppendLine($"  .{treeId} .tnode.parent {{ cursor:pointer; font-weight:600; background:linear-gradient(135deg,#f8f9ff,#eef2ff); border-color:{EscAttr(color)}88; }}");
                sb.AppendLine($"  .{treeId} .tnode.parent:hover {{ background:linear-gradient(135deg,#eef2ff,#dde4ff); }}");
                sb.AppendLine($"  .{treeId} .tnode .icon {{ font-size:14px; flex-shrink:0; }}");
                sb.AppendLine($"  .{treeId} .tnode .toggle {{ font-size:9px; color:#888; margin-right:2px; transition:transform 0.2s; }}");
                sb.AppendLine($"  .{treeId} .tnode.collapsed .toggle {{ transform:rotate(-90deg); }}");
                sb.AppendLine($"  .{treeId} li.collapsed > ul {{ display:none; }}");
                // Root node special style
                sb.AppendLine($"  .{treeId} .tnode.root {{ font-weight:700; font-size:11pt; background:linear-gradient(135deg,{EscAttr(color)}18,{EscAttr(color)}30); border-color:{EscAttr(color)}; color:{EscAttr(color)}; padding:5px 14px; }}");
                sb.AppendLine($"</style>");

                sb.Append($"<div class='{treeId}' style='margin:12px 0; padding:16px 20px; background:#fafbfc; border:1px solid #e1e4e8; border-radius:8px; overflow-x:auto;'>");

                if (title != null)
                    sb.Append($"<div style='font-weight:700; font-size:13pt; color:{EscAttr(color)}; margin-bottom:10px; padding-bottom:6px; border-bottom:2px solid {EscAttr(color)}40;'>{System.Net.WebUtility.HtmlEncode(title)}</div>");

                // Build nested HTML from flat list
                int currentLevel = 0;
                sb.Append("<ul>");
                for (int i = 0; i < nodes.Count; i++)
                {
                    var (level, text, icon) = nodes[i];
                    bool hasKids = hasChildren[i];
                    bool isRoot = (level == 0 && i == 0);

                    // Close/open <ul> tags to match level
                    while (currentLevel < level) { sb.Append("<ul>"); currentLevel++; }
                    while (currentLevel > level) { sb.Append("</li></ul>"); currentLevel--; }
                    if (i > 0 && currentLevel == level) sb.Append("</li>");

                    sb.Append("<li>");

                    // Icon emoji
                    string iconEmoji = GetTreeIcon(icon, hasKids);

                    // Node classes
                    string nodeClass = "tnode";
                    if (isRoot) nodeClass += " root";
                    else if (hasKids) nodeClass += " parent";

                    sb.Append($"<span class='{nodeClass}'");
                    if (hasKids) sb.Append($" onclick=\"this.classList.toggle('collapsed');this.parentElement.classList.toggle('collapsed');\"");
                    sb.Append(">");

                    if (hasKids) sb.Append("<span class='toggle'>\u25BC</span>");
                    if (!string.IsNullOrEmpty(iconEmoji)) sb.Append($"<span class='icon'>{iconEmoji}</span>");
                    sb.Append(System.Net.WebUtility.HtmlEncode(text));
                    sb.Append("</span>");
                }

                // Close remaining open tags
                while (currentLevel > 0) { sb.Append("</li></ul>"); currentLevel--; }
                sb.Append("</li></ul>");

                sb.Append("</div>");

                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<div style='color: red;'>Error in @{{tree}}: {ex.Message}</div>";
            }
        }

        private string GetTreeIcon(string icon, bool hasKids)
        {
            if (icon != null)
            {
                return icon.ToLower() switch
                {
                    "folder" => "\U0001F4C1",
                    "file" => "\U0001F4C4",
                    "gear" => "\u2699\uFE0F",
                    "star" => "\u2B50",
                    "check" => "\u2705",
                    "x" => "\u274C",
                    "arrow" => "\u27A1\uFE0F",
                    "warning" => "\u26A0\uFE0F",
                    "info" => "\u2139\uFE0F",
                    "build" => "\U0001F527",
                    "code" => "\U0001F4BB",
                    "db" => "\U0001F5C4\uFE0F",
                    _ => ""
                };
            }
            return hasKids ? "\U0001F4C1" : "\U0001F4C4";
        }

        /// <summary>Public accessor for @{page markdown} mode</summary>
        public string ProcessTreeBlockPublic(string content, string directive, Dictionary<string, object> variables)
        {
            return ProcessTreeBlock(content, directive, variables);
        }

        /// <summary>
        /// Processes @{draw W H [align]} blocks.
        /// Parses CAD DSL commands and generates HTML canvas + JavaScript Canvas2D.
        /// Supports 2D primitives and 3D oblique projection with auto-fit.
        /// </summary>
        private string ProcessDrawBlock(string content, string directive, Dictionary<string, object> variables)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return "<p style='color:red;'>Error: Bloque @{draw} vac&#237;o</p>";

                var processed = ProcessMarkdownVariables(content, variables);
                var lines = processed.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

                // Parse directive: @{draw 600 400 left}
                int canvasW = 600, canvasH = 400;
                string align = "center";
                var dirParts = directive.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                if (dirParts.Length >= 3 && int.TryParse(dirParts[1], out int pw) && int.TryParse(dirParts[2], out int ph))
                { canvasW = pw; canvasH = ph; }
                else if (dirParts.Length >= 2 && int.TryParse(dirParts[1], out int pw2))
                { canvasW = pw2; canvasH = (int)(pw2 * 0.67); }
                if (dirParts.Length >= 4)
                {
                    var a = dirParts[3].ToLower();
                    if (a == "left" || a == "right" || a == "center") align = a;
                }

                var containerId = "draw_" + Guid.NewGuid().ToString("N").Substring(0, 8);

                // State tracking
                string currentColor = "#333333";
                string bgColor = "#ffffff";
                bool gridOn = false;
                double lineWidth = 1.5;
                double fontSize = 12;
                bool is3d = false;
                double projAngle = 45;
                double projScale = 0.5;
                bool autoFit = false;
                string fontFamily = "sans-serif";
                bool fontItalic = false;

                // Collect draw commands as structured data
                var cmds = new List<string>();

                foreach (var rawLine in lines)
                {
                    var line = rawLine.Trim();
                    if (string.IsNullOrEmpty(line) || line.StartsWith("#")) continue;

                    var parts = line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                    var cmd = parts[0].ToLower();

                    switch (cmd)
                    {
                        case "color":
                            if (parts.Length >= 2) currentColor = parts[1];
                            break;
                        case "bg":
                            if (parts.Length >= 2)
                            {
                                bgColor = parts[1].ToLowerInvariant() switch
                                {
                                    "book" => "#fffef8",
                                    "cream" => "#fffdd0",
                                    "dark" => "#1e1e1e",
                                    _ => parts[1]
                                };
                            }
                            break;
                        case "grid":
                            gridOn = parts.Length >= 2 && parts[1].ToLower() != "off";
                            break;
                        case "lw":
                            if (parts.Length >= 2 && double.TryParse(parts[1],
                                System.Globalization.NumberStyles.Float,
                                System.Globalization.CultureInfo.InvariantCulture, out double lwVal))
                                lineWidth = lwVal;
                            break;
                        case "proj":
                            is3d = true;
                            if (parts.Length >= 4)
                            {
                                double.TryParse(parts[2], System.Globalization.NumberStyles.Float,
                                    System.Globalization.CultureInfo.InvariantCulture, out projAngle);
                                double.TryParse(parts[3], System.Globalization.NumberStyles.Float,
                                    System.Globalization.CultureInfo.InvariantCulture, out projScale);
                            }
                            break;
                        case "fit":
                            autoFit = true;
                            break;

                        // 2D Primitives
                        case "line":
                            if (parts.Length >= 5)
                                cmds.Add($"L|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{currentColor}|{F(lineWidth)}");
                            break;
                        case "rect":
                            if (parts.Length >= 5)
                            {
                                var fill = parts.Length >= 6 ? parts[5] : "";
                                cmds.Add($"R|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{currentColor}|{F(lineWidth)}|{fill}");
                            }
                            break;
                        case "circle":
                            if (parts.Length >= 4)
                            {
                                var fill = parts.Length >= 5 && parts[4].StartsWith("#") ? parts[4] : "";
                                cmds.Add($"C|{parts[1]}|{parts[2]}|{parts[3]}|{currentColor}|{F(lineWidth)}|{fill}");
                            }
                            break;
                        case "arrow":
                            if (parts.Length >= 5)
                                cmds.Add($"A|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{currentColor}|{F(lineWidth)}");
                            break;
                        case "text":
                            if (parts.Length >= 4)
                            {
                                var txt = string.Join(" ", parts.Skip(3));
                                cmds.Add($"T|{parts[1]}|{parts[2]}|{DrawEscapeJs(txt)}|{currentColor}");
                            }
                            break;
                        case "pline":
                            cmds.Add($"P|{string.Join("|", parts.Skip(1))}|COL:{currentColor}|LW:{F(lineWidth)}");
                            break;
                        case "darrow":
                        case "flechadoble":
                            if (parts.Length >= 5)
                            {
                                var daCol = parts.Length >= 6 && parts[5].StartsWith("#") ? parts[5] : currentColor;
                                cmds.Add($"DA|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{daCol}|{F(lineWidth)}");
                            }
                            break;
                        case "otext":
                        case "otexto":
                        case "overbar":
                            if (parts.Length >= 4)
                            {
                                var otxt = string.Join(" ", parts.Skip(3));
                                cmds.Add($"OT|{parts[1]}|{parts[2]}|{DrawEscapeJs(otxt)}|{currentColor}|{F(fontSize)}");
                            }
                            break;
                        case "beam":
                        case "viga":
                            if (parts.Length >= 5)
                            {
                                var bmW = parts.Length >= 6 && !parts[5].StartsWith("#") ? parts[5] : "5";
                                var bmC = parts.Length >= 6 && parts[5].StartsWith("#") ? parts[5]
                                        : parts.Length >= 7 && parts[6].StartsWith("#") ? parts[6] : currentColor;
                                var bmH = parts.Length >= 8 ? parts[7] : "3";
                                cmds.Add($"BM2|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{bmW}|{bmC}|{F(lineWidth)}|{bmH}");
                            }
                            break;
                        case "cnode":
                        case "cid":
                        case "cn":
                            if (parts.Length >= 4)
                            {
                                var cnR = parts.Length >= 5 && !parts[4].StartsWith("#") ? parts[4] : "8";
                                var cnCol = parts.Length >= 5 && parts[4].StartsWith("#") ? parts[4]
                                          : parts.Length >= 6 && parts[5].StartsWith("#") ? parts[5] : currentColor;
                                cmds.Add($"C|{parts[1]}|{parts[2]}|{cnR}|{cnCol}|{F(lineWidth)}|#ffffff");
                                cmds.Add($"T|{parts[1]}|{parts[2]}|{DrawEscapeJs(parts[3])}|{cnCol}");
                            }
                            break;
                        case "tnode":
                        case "tid":
                        case "tn":
                            if (parts.Length >= 4)
                            {
                                var tnSz = parts.Length >= 5 && !parts[4].StartsWith("#") ? parts[4] : "10";
                                var tnCol = parts.Length >= 5 && parts[4].StartsWith("#") ? parts[4]
                                          : parts.Length >= 6 && parts[5].StartsWith("#") ? parts[5] : currentColor;
                                cmds.Add($"TN|{parts[1]}|{parts[2]}|{tnSz}|{tnCol}|{F(lineWidth)}|{DrawEscapeJs(parts[3])}");
                            }
                            break;
                        case "axes2d":
                            if (parts.Length >= 3)
                            {
                                var a2sz = parts.Length >= 4 ? parts[3] : "50";
                                var a2lh = parts.Length >= 5 ? parts[4] : "X";
                                var a2lv = parts.Length >= 6 ? parts[5] : "Y";
                                cmds.Add($"A|{parts[1]}|{parts[2]}|{parts[1]}+{a2sz}|{parts[2]}|#333333|{F(lineWidth)}");
                                cmds.Add($"T|{parts[1]}+{a2sz}+4|{parts[2]}|{DrawEscapeJs(a2lh)}|#333333");
                                cmds.Add($"A|{parts[1]}|{parts[2]}|{parts[1]}|{parts[2]}+{a2sz}|#333333|{F(lineWidth)}");
                                cmds.Add($"T|{parts[1]}-2|{parts[2]}+{a2sz}+6|{DrawEscapeJs(a2lv)}|#333333");
                            }
                            break;
                        case "axes2dxyz":
                            if (parts.Length >= 3)
                            {
                                var axsz = parts.Length >= 4 ? parts[3] : "40";
                                var axlx = parts.Length >= 5 ? parts[4] : "X";
                                var axly = parts.Length >= 6 ? parts[5] : "Y";
                                var axlz = parts.Length >= 7 ? parts[6] : "Z";
                                cmds.Add($"A|{parts[1]}|{parts[2]}|{parts[1]}+{axsz}|{parts[2]}|#cc0000|{F(lineWidth)}");
                                cmds.Add($"T|{parts[1]}+{axsz}+4|{parts[2]}|{DrawEscapeJs(axlx)}|#cc0000");
                                cmds.Add($"A|{parts[1]}|{parts[2]}|{parts[1]}|{parts[2]}+{axsz}|#00aa00|{F(lineWidth)}");
                                cmds.Add($"T|{parts[1]}-4|{parts[2]}+{axsz}+6|{DrawEscapeJs(axly)}|#00aa00");
                                cmds.Add($"A|{parts[1]}|{parts[2]}|{parts[1]}|{parts[2]}-{axsz}|#0000cc|{F(lineWidth)}");
                                cmds.Add($"T|{parts[1]}-4|{parts[2]}-{axsz}-6|{DrawEscapeJs(axlz)}|#0000cc");
                            }
                            break;
                        case "fontfamily":
                        case "ff":
                            if (parts.Length >= 2) fontFamily = parts[1].ToLower() == "serif" ? "serif" : "sans-serif";
                            break;
                        case "fontitalic":
                        case "fi":
                            if (parts.Length >= 2) fontItalic = parts[1].ToLower() == "on" || parts[1].ToLower() == "yes" || parts[1].ToLower() == "true";
                            break;

                        // 3D Primitives
                        case "line3d":
                            if (parts.Length >= 7)
                                cmds.Add($"L3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{currentColor}|{F(lineWidth)}");
                            break;
                        case "arrow3d":
                            if (parts.Length >= 7)
                                cmds.Add($"A3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{currentColor}|{F(lineWidth)}");
                            break;
                        case "darrow3d":
                        case "flechadoble3d":
                            if (parts.Length >= 7)
                            {
                                var da3Col = parts.Length >= 8 && parts[7].StartsWith("#") ? parts[7] : currentColor;
                                cmds.Add($"DA3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{da3Col}|{F(lineWidth)}");
                            }
                            break;
                        case "text3d":
                            if (parts.Length >= 5)
                            {
                                var txt3 = string.Join(" ", parts.Skip(4));
                                cmds.Add($"T3|{parts[1]}|{parts[2]}|{parts[3]}|{DrawEscapeJs(txt3)}|{currentColor}");
                            }
                            break;
                        case "circle3d":
                            if (parts.Length >= 5)
                            {
                                var fill3 = parts.Length >= 6 && parts[5].StartsWith("#") ? parts[5] : "";
                                cmds.Add($"C3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{currentColor}|{F(lineWidth)}|{fill3}");
                            }
                            break;
                        case "carc3d":
                            if (parts.Length >= 7)
                                cmds.Add($"CA3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{currentColor}|{F(lineWidth)}");
                            break;
                        case "pline3d":
                            cmds.Add($"P3|{string.Join("|", parts.Skip(1))}|COL:{currentColor}|LW:{F(lineWidth)}");
                            break;

                        // New primitives
                        case "fontsize":
                        case "fs":
                            if (parts.Length >= 2 && double.TryParse(parts[1],
                                System.Globalization.NumberStyles.Float,
                                System.Globalization.CultureInfo.InvariantCulture, out double fsVal))
                                fontSize = fsVal;
                            break;
                        case "hdim":
                        case "cotah":
                            // hdim x1 y1 x2 y2 offset text — horizontal dimension line
                            // In hdim, y2 is forced to y1 (horizontal)
                            if (parts.Length >= 6)
                            {
                                var hdText = parts.Length >= 7 ? string.Join(" ", parts.Skip(6)) : "";
                                cmds.Add($"DIM|{parts[1]}|{parts[2]}|{parts[3]}|{parts[2]}|{parts[5]}|{DrawEscapeJs(hdText)}|{currentColor}|{F(lineWidth)}|{F(fontSize)}");
                            }
                            break;
                        case "vdim":
                        case "cotav":
                            // vdim x1 y1 x2 y2 offset text — vertical dimension line
                            // In vdim, x2 is forced to x1 (vertical)
                            if (parts.Length >= 6)
                            {
                                var vdText = parts.Length >= 7 ? string.Join(" ", parts.Skip(6)) : "";
                                cmds.Add($"DIM|{parts[1]}|{parts[2]}|{parts[1]}|{parts[4]}|{parts[5]}|{DrawEscapeJs(vdText)}|{currentColor}|{F(lineWidth)}|{F(fontSize)}");
                            }
                            break;
                        case "dim":
                        case "cota":
                            // dim x1 y1 x2 y2 offset text — general dimension line
                            if (parts.Length >= 6)
                            {
                                var dimText = parts.Length >= 7 ? string.Join(" ", parts.Skip(6)) : "";
                                cmds.Add($"DIM|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{DrawEscapeJs(dimText)}|{currentColor}|{F(lineWidth)}|{F(fontSize)}");
                            }
                            break;
                        case "hatch3d":
                            if (parts.Length >= 13)
                            {
                                var hSpacing = parts.Length >= 14 && !parts[13].StartsWith("#") ? parts[13] : "1";
                                var hColor = parts.Length >= 14 && parts[13].StartsWith("#") ? parts[13]
                                           : parts.Length >= 15 && parts[14].StartsWith("#") ? parts[14] : currentColor;
                                cmds.Add($"H3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{parts[7]}|{parts[8]}|{parts[9]}|{parts[10]}|{parts[11]}|{parts[12]}|{hSpacing}|{hColor}|{F(lineWidth * 0.3)}");
                            }
                            break;
                        case "fillpoly3d":
                        {
                            var fpParts = parts.Skip(1).ToList();
                            var fpColor = fpParts.LastOrDefault()?.StartsWith("#") == true ? fpParts.Last() : currentColor;
                            if (fpParts.LastOrDefault()?.StartsWith("#") == true) fpParts.RemoveAt(fpParts.Count - 1);
                            cmds.Add($"FP3|{string.Join("|", fpParts)}|COL:{fpColor}|LW:{F(lineWidth)}");
                            break;
                        }
                        case "label3d":
                            if (parts.Length >= 5)
                            {
                                var anchorOpts = new[] { "left", "right", "above", "below", "center" };
                                var lastPart = parts[parts.Length - 1].ToLower();
                                var hasAnchor = anchorOpts.Contains(lastPart);
                                var lblText = string.Join(" ", parts.Skip(4).Take(parts.Length - 4 - (hasAnchor ? 1 : 0)));
                                var anchor = hasAnchor ? lastPart : "center";
                                cmds.Add($"LB3|{parts[1]}|{parts[2]}|{parts[3]}|{DrawEscapeJs(lblText)}|{currentColor}|{anchor}|{F(fontSize)}");
                            }
                            break;

                        // Compound structural elements
                        case "beam3d":
                            if (parts.Length >= 7)
                            {
                                var bDepth = parts.Length >= 8 ? parts[7] : "1.2";
                                var bLabel = parts.Length >= 9 ? parts[8] : "";
                                // Outline
                                cmds.Add($"L3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{currentColor}|{F(lineWidth)}");
                                cmds.Add($"L3|{parts[1]}|{parts[2]}|{parts[3]}-{bDepth}|{parts[4]}|{parts[5]}|{parts[6]}-{bDepth}|{currentColor}|{F(lineWidth)}");
                                cmds.Add($"L3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[1]}|{parts[2]}|{parts[3]}-{bDepth}|{currentColor}|{F(lineWidth)}");
                                cmds.Add($"L3|{parts[4]}|{parts[5]}|{parts[6]}|{parts[4]}|{parts[5]}|{parts[6]}-{bDepth}|{currentColor}|{F(lineWidth)}");
                                // Hatch
                                cmds.Add($"H3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{parts[4]}|{parts[5]}|{parts[6]}-{bDepth}|{parts[1]}|{parts[2]}|{parts[3]}-{bDepth}|{bDepth}*0.8|{currentColor}|{F(lineWidth * 0.3)}");
                                if (!string.IsNullOrEmpty(bLabel))
                                {
                                    // Direction triangle + label (simplified: just label below midpoint)
                                    cmds.Add($"BM_LBL|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{bDepth}|{DrawEscapeJs(bLabel)}|{currentColor}|{F(fontSize)}");
                                }
                            }
                            break;
                        case "node3d":
                            if (parts.Length >= 5)
                            {
                                var nRad = parts.Length >= 6 ? parts[5] : "0.8";
                                cmds.Add($"C3|{parts[1]}|{parts[2]}|{parts[3]}|{nRad}|{currentColor}|{F(lineWidth)}|#ffffff");
                                cmds.Add($"LB3|{parts[1]}|{parts[2]}|{parts[3]}|{DrawEscapeJs(parts[4])}|{currentColor}|center|{F(fontSize)}");
                            }
                            break;
                        case "dof3d":
                            if (parts.Length >= 8)
                            {
                                // Arrow from (x,y,z) to (x+dx,y+dy,z+dz)
                                cmds.Add($"A3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[1]}+{parts[4]}|{parts[2]}+{parts[5]}|{parts[3]}+{parts[6]}|{currentColor}|{F(lineWidth)}");
                                // Label at tip
                                cmds.Add($"DOF_LBL|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{DrawEscapeJs(parts[7])}|{currentColor}|{F(fontSize)}");
                            }
                            break;
                        case "rdof3d":
                            if (parts.Length >= 8)
                            {
                                // Two parallel arrows (rotation DOF) with perpendicular offset
                                cmds.Add($"RDOF3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[4]}|{parts[5]}|{parts[6]}|{DrawEscapeJs(parts[7])}|{currentColor}|{F(lineWidth)}|{F(fontSize)}");
                            }
                            break;
                        case "axes3d":
                            if (parts.Length >= 4)
                            {
                                var axSz = parts.Length >= 5 ? parts[4] : "4";
                                // Z up
                                cmds.Add($"A3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[1]}|{parts[2]}|{parts[3]}+{axSz}|#333333|{F(lineWidth)}");
                                cmds.Add($"LB3|{parts[1]}-1|{parts[2]}|{parts[3]}+{axSz}+0.5|Z|#333333|center|{F(fontSize)}");
                                // X right
                                cmds.Add($"A3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[1]}+{axSz}|{parts[2]}|{parts[3]}|#333333|{F(lineWidth)}");
                                cmds.Add($"LB3|{parts[1]}+{axSz}+0.5|{parts[2]}|{parts[3]}-0.5|X|#333333|center|{F(fontSize)}");
                                // Y oblique
                                cmds.Add($"A3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[1]}|{parts[2]}+{axSz}*0.75|{parts[3]}|#333333|{F(lineWidth)}");
                                cmds.Add($"LB3|{parts[1]}|{parts[2]}+{axSz}*0.75+0.5|{parts[3]}+0.5|Y|#333333|center|{F(fontSize)}");
                            }
                            break;
                        case "support3d":
                            if (parts.Length >= 5)
                            {
                                var supType = parts[4].ToLower();
                                var sz = "1.5";
                                switch (supType)
                                {
                                    case "pinned":
                                        // Triangle outline (3 lines)
                                        cmds.Add($"L3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[1]}-{sz}|{parts[2]}|{parts[3]}-{sz}*1.2|{currentColor}|{F(lineWidth)}");
                                        cmds.Add($"L3|{parts[1]}-{sz}|{parts[2]}|{parts[3]}-{sz}*1.2|{parts[1]}+{sz}|{parts[2]}|{parts[3]}-{sz}*1.2|{currentColor}|{F(lineWidth)}");
                                        cmds.Add($"L3|{parts[1]}+{sz}|{parts[2]}|{parts[3]}-{sz}*1.2|{parts[1]}|{parts[2]}|{parts[3]}|{currentColor}|{F(lineWidth)}");
                                        // Base line
                                        cmds.Add($"L3|{parts[1]}-{sz}*1.3|{parts[2]}|{parts[3]}-{sz}*1.2|{parts[1]}+{sz}*1.3|{parts[2]}|{parts[3]}-{sz}*1.2|{currentColor}|{F(lineWidth)}");
                                        // Hatching lines below base
                                        for (int hi = -2; hi <= 2; hi++)
                                            cmds.Add($"L3|{parts[1]}+{hi}*{sz}*0.35|{parts[2]}|{parts[3]}-{sz}*1.2|{parts[1]}+{hi}*{sz}*0.35-{sz}*0.3|{parts[2]}|{parts[3]}-{sz}*1.2-{sz}*0.4|{currentColor}|{F(lineWidth * 0.5)}");
                                        break;
                                    case "roller":
                                        // Triangle outline (3 lines)
                                        cmds.Add($"L3|{parts[1]}|{parts[2]}|{parts[3]}|{parts[1]}-{sz}|{parts[2]}|{parts[3]}-{sz}|{currentColor}|{F(lineWidth)}");
                                        cmds.Add($"L3|{parts[1]}-{sz}|{parts[2]}|{parts[3]}-{sz}|{parts[1]}+{sz}|{parts[2]}|{parts[3]}-{sz}|{currentColor}|{F(lineWidth)}");
                                        cmds.Add($"L3|{parts[1]}+{sz}|{parts[2]}|{parts[3]}-{sz}|{parts[1]}|{parts[2]}|{parts[3]}|{currentColor}|{F(lineWidth)}");
                                        // Circle below
                                        cmds.Add($"C3|{parts[1]}|{parts[2]}|{parts[3]}-{sz}-{sz}*0.3|{sz}*0.3|{currentColor}|{F(lineWidth)}|");
                                        // Base line
                                        cmds.Add($"L3|{parts[1]}-{sz}*1.3|{parts[2]}|{parts[3]}-{sz}-{sz}*0.6|{parts[1]}+{sz}*1.3|{parts[2]}|{parts[3]}-{sz}-{sz}*0.6|{currentColor}|{F(lineWidth)}");
                                        break;
                                    case "fixed":
                                        cmds.Add($"L3|{parts[1]}-{sz}|{parts[2]}|{parts[3]}|{parts[1]}+{sz}|{parts[2]}|{parts[3]}|{currentColor}|{F(lineWidth)}");
                                        for (int hi = -3; hi <= 3; hi++)
                                            cmds.Add($"L3|{parts[1]}+{hi}*{sz}*0.3|{parts[2]}|{parts[3]}|{parts[1]}+{hi}*{sz}*0.3-{sz}*0.3|{parts[2]}|{parts[3]}-{sz}*0.4|{currentColor}|{F(lineWidth * 0.5)}");
                                        break;
                                }
                            }
                            break;
                    }
                }

                // Generate HTML + JS
                var marginStyle = align switch
                {
                    "left" => "margin:10px 0;",
                    "right" => "margin:10px 0 10px auto;",
                    _ => "margin:10px auto;"
                };

                var sb = new StringBuilder();
                var wrapperId = containerId + "_wrap";
                sb.AppendLine($"<div style='text-align:{align};position:relative;display:block;max-width:{canvasW}px;{marginStyle}'>");
                sb.AppendLine($"  <div id='{wrapperId}' style='overflow:hidden;border:1px solid #ccc;border-radius:4px;" +
                              $"width:{canvasW}px;height:{canvasH}px;cursor:grab;position:relative;'>");
                sb.AppendLine($"    <canvas id='{containerId}' width='{canvasW}' height='{canvasH}' " +
                              $"style='display:block;background:{bgColor};transform-origin:0 0;'></canvas>");
                sb.AppendLine("  </div>");
                // Zoom buttons
                sb.AppendLine($"  <div style='position:absolute;top:4px;right:4px;display:flex;flex-direction:column;gap:2px;z-index:1;'>");
                sb.AppendLine($"    <button onclick=\"{containerId}_zf(1.3)\" style='width:26px;height:26px;cursor:pointer;border:1px solid #aaa;border-radius:4px;background:#fff;font-size:14px;line-height:1;'>+</button>");
                sb.AppendLine($"    <button onclick=\"{containerId}_zf(1/1.3)\" style='width:26px;height:26px;cursor:pointer;border:1px solid #aaa;border-radius:4px;background:#fff;font-size:14px;line-height:1;'>&minus;</button>");
                sb.AppendLine($"    <button onclick=\"{containerId}_zr()\" style='width:26px;height:26px;cursor:pointer;border:1px solid #aaa;border-radius:4px;background:#fff;font-size:11px;line-height:1;' title='Reset'>R</button>");
                sb.AppendLine("  </div>");
                sb.AppendLine("</div>");
                sb.AppendLine("<script>");
                sb.AppendLine("(function(){");
                sb.AppendLine($"var c=document.getElementById('{containerId}');");
                // Zoom/pan state
                sb.AppendLine($"var wr=document.getElementById('{wrapperId}');");
                sb.AppendLine("var zm=1,px=0,py=0,dragging=false,sx=0,sy=0,spx=0,spy=0;");
                sb.AppendLine("function applyT(){c.style.transform='translate('+px+'px,'+py+'px) scale('+zm+')';}");
                sb.AppendLine($"window.{containerId}_zf=function(f){{zm*=f;if(zm<0.1)zm=0.1;if(zm>20)zm=20;applyT();}};");
                sb.AppendLine($"window.{containerId}_zr=function(){{zm=1;px=0;py=0;applyT();}};");
                // Mouse wheel zoom
                sb.AppendLine("wr.addEventListener('wheel',function(e){e.preventDefault();" +
                    "var f=e.deltaY<0?1.15:1/1.15;" +
                    "var rect=wr.getBoundingClientRect();" +
                    "var mx=e.clientX-rect.left,my=e.clientY-rect.top;" +
                    "px=(px-mx)*f+mx;py=(py-my)*f+my;" +
                    "zm*=f;if(zm<0.1)zm=0.1;if(zm>20)zm=20;applyT();},{passive:false});");
                // Mouse drag pan
                sb.AppendLine("wr.addEventListener('mousedown',function(e){if(e.button===0){dragging=true;sx=e.clientX;sy=e.clientY;spx=px;spy=py;wr.style.cursor='grabbing';}});");
                sb.AppendLine("window.addEventListener('mousemove',function(e){if(dragging){px=spx+(e.clientX-sx);py=spy+(e.clientY-sy);applyT();}});");
                sb.AppendLine("window.addEventListener('mouseup',function(){if(dragging){dragging=false;wr.style.cursor='grab';}});");
                // Double-click reset
                sb.AppendLine("wr.addEventListener('dblclick',function(){zm=1;px=0;py=0;applyT();});");
                sb.AppendLine("var ctx=c.getContext('2d');");
                sb.AppendLine($"var W={canvasW},H={canvasH};");

                // Projection function
                if (is3d)
                {
                    sb.AppendLine($"var pA={F(projAngle)}*Math.PI/180,pS={F(projScale)};");
                    sb.AppendLine("function w2s(x,y,z){return[x+y*Math.cos(pA)*pS,z+y*Math.sin(pA)*pS];}");
                }

                // Arrow drawing helper
                sb.AppendLine("function drawArr(ctx,x1,y1,x2,y2,col,lw){" +
                    "ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=lw;" +
                    "ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();" +
                    "var a=Math.atan2(y2-y1,x2-x1),h=8*lw;" +
                    "ctx.beginPath();ctx.fillStyle=col;" +
                    "ctx.moveTo(x2,y2);" +
                    "ctx.lineTo(x2-h*Math.cos(a-0.35),y2-h*Math.sin(a-0.35));" +
                    "ctx.lineTo(x2-h*Math.cos(a+0.35),y2-h*Math.sin(a+0.35));" +
                    "ctx.closePath();ctx.fill();}");

                // Double arrow helper (two arrowheads)
                sb.AppendLine("function drawDArr(ctx,x1,y1,x2,y2,col,lw){" +
                    "ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=lw;" +
                    "ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();" +
                    "var dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy);" +
                    "if(len<2)return;var ux=dx/len,uy=dy/len,nx=-uy,ny=ux;" +
                    "var aL=8*lw,aW=3*lw,gap=3;" +
                    "ctx.fillStyle=col;" +
                    "ctx.beginPath();ctx.moveTo(x2,y2);" +
                    "ctx.lineTo(x2-ux*aL+nx*aW,y2-uy*aL+ny*aW);" +
                    "ctx.lineTo(x2-ux*aL-nx*aW,y2-uy*aL-ny*aW);" +
                    "ctx.closePath();ctx.fill();" +
                    "var off=aL+gap,bx=x2-ux*off,by=y2-uy*off;" +
                    "ctx.beginPath();ctx.moveTo(bx,by);" +
                    "ctx.lineTo(bx-ux*aL+nx*aW,by-uy*aL+ny*aW);" +
                    "ctx.lineTo(bx-ux*aL-nx*aW,by-uy*aL-ny*aW);" +
                    "ctx.closePath();ctx.fill();}");

                if (autoFit)
                {
                    // Two-pass: first collect all points, then transform and draw
                    sb.AppendLine("var pts=[];");
                    GenerateDrawPointCollection(sb, cmds, is3d);
                    sb.AppendLine("if(pts.length===0){pts.push([0,0],[1,1]);}");
                    sb.AppendLine("var mnX=1e9,mnY=1e9,mxX=-1e9,mxY=-1e9;");
                    sb.AppendLine("for(var i=0;i<pts.length;i++){var p=pts[i];if(p[0]<mnX)mnX=p[0];if(p[0]>mxX)mxX=p[0];if(p[1]<mnY)mnY=p[1];if(p[1]>mxY)mxY=p[1];}");
                    sb.AppendLine("var pad=30,rX=mxX-mnX||1,rY=mxY-mnY||1;");
                    sb.AppendLine("var sc=Math.min((W-2*pad)/rX,(H-2*pad)/rY);");
                    sb.AppendLine("ctx.save();");
                    // Flip Y: canvas Y goes down, world Y (Z projected) goes up
                    sb.AppendLine("ctx.translate(pad+(W-2*pad-rX*sc)/2, H-pad-(H-2*pad-rY*sc)/2);");
                    sb.AppendLine("ctx.scale(sc,-sc);");
                    sb.AppendLine("ctx.translate(-mnX,-mnY);");
                    // Adjusted line width
                    sb.AppendLine("var lwS=1/sc;");
                    GenerateDrawCommands(sb, cmds, is3d, true);
                    sb.AppendLine("ctx.restore();");
                }
                else
                {
                    sb.AppendLine("var lwS=1;");
                    GenerateDrawCommands(sb, cmds, is3d, false);
                }

                sb.AppendLine("})();");
                sb.AppendLine("</script>");
                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<p style='color:red;'>Error en @{{draw}}: {ex.Message}</p>";
            }
        }

        /// <summary>Collect projected points for auto-fit bounding box.</summary>
        private void GenerateDrawPointCollection(StringBuilder sb, List<string> cmds, bool is3d)
        {
            foreach (var cmd in cmds)
            {
                var p = cmd.Split('|');
                switch (p[0])
                {
                    case "L": // line x1 y1 x2 y2
                        sb.AppendLine($"pts.push([{p[1]},{p[2]}],[{p[3]},{p[4]}]);");
                        break;
                    case "R": // rect x y w h
                        sb.AppendLine($"pts.push([{p[1]},{p[2]}],[{p[1]}*1+{p[3]}*1,{p[2]}*1+{p[4]}*1]);");
                        break;
                    case "C": // circle cx cy r
                        sb.AppendLine($"pts.push([{p[1]}*1-{p[3]}*1,{p[2]}*1-{p[3]}*1],[{p[1]}*1+{p[3]}*1,{p[2]}*1+{p[3]}*1]);");
                        break;
                    case "A": // arrow x1 y1 x2 y2
                        sb.AppendLine($"pts.push([{p[1]},{p[2]}],[{p[3]},{p[4]}]);");
                        break;
                    case "T": // text x y
                        sb.AppendLine($"pts.push([{p[1]},{p[2]}]);");
                        break;
                    case "P": // pline coords...
                        for (int i = 1; i < p.Length - 2; i += 2)
                        {
                            if (p[i].Contains(":")) break;
                            if (i + 1 < p.Length && !p[i + 1].Contains(":"))
                                sb.AppendLine($"pts.push([{p[i]},{p[i + 1]}]);");
                        }
                        break;
                    case "L3": // line3d x1 y1 z1 x2 y2 z2
                        sb.AppendLine($"pts.push(w2s({p[1]},{p[2]},{p[3]}),w2s({p[4]},{p[5]},{p[6]}));");
                        break;
                    case "A3":
                        sb.AppendLine($"pts.push(w2s({p[1]},{p[2]},{p[3]}),w2s({p[4]},{p[5]},{p[6]}));");
                        break;
                    case "T3": // text3d x y z
                        sb.AppendLine($"pts.push(w2s({p[1]},{p[2]},{p[3]}));");
                        break;
                    case "C3": // circle3d cx cy cz r
                        sb.AppendLine($"(function(){{var c=w2s({p[1]},{p[2]},{p[3]});var r={p[4]}*1;" +
                            "pts.push([c[0]-r,c[1]-r],[c[0]+r,c[1]+r]);})();");
                        break;
                    case "CA3": // carc3d cx cy cz r startAngle endAngle
                        sb.AppendLine($"(function(){{var c=w2s({p[1]},{p[2]},{p[3]});var r={p[4]};" +
                            "pts.push([c[0]-r,c[1]-r],[c[0]+r,c[1]+r]);})();");
                        break;
                    case "P3": // pline3d
                        for (int i = 1; i < p.Length - 2; i += 3)
                        {
                            if (p[i].Contains(":")) break;
                            if (i + 2 < p.Length && !p[i + 1].Contains(":") && !p[i + 2].Contains(":"))
                                sb.AppendLine($"pts.push(w2s({p[i]},{p[i + 1]},{p[i + 2]}));");
                        }
                        break;

                    // New primitives
                    case "H3": // hatch3d - 4 corners
                        sb.AppendLine($"pts.push(w2s({p[1]},{p[2]},{p[3]}),w2s({p[4]},{p[5]},{p[6]}),w2s({p[7]},{p[8]},{p[9]}),w2s({p[10]},{p[11]},{p[12]}));");
                        break;
                    case "FP3": // fillpoly3d
                    {
                        var fpPts = new List<string>();
                        for (int i = 1; i < p.Length; i++)
                        {
                            if (p[i].Contains(":")) break;
                            fpPts.Add(p[i]);
                        }
                        for (int i = 0; i < fpPts.Count - 2; i += 3)
                            sb.AppendLine($"pts.push(w2s({fpPts[i]},{fpPts[i + 1]},{fpPts[i + 2]}));");
                        break;
                    }
                    case "LB3": // label3d
                        sb.AppendLine($"pts.push(w2s({p[1]},{p[2]},{p[3]}));");
                        break;
                    case "BM_LBL": // beam3d label
                        sb.AppendLine($"pts.push(w2s(({p[1]}+{p[4]})/2,({p[2]}+{p[5]})/2,({p[3]}+{p[6]})/2-{p[7]}-3));");
                        break;
                    case "DOF_LBL": // dof label
                        sb.AppendLine($"pts.push(w2s({p[1]}+{p[4]},{p[2]}+{p[5]},{p[3]}+{p[6]}));");
                        break;
                    case "RDOF3": // rotational DOF (two parallel arrows)
                        sb.AppendLine($"pts.push(w2s({p[1]},{p[2]},{p[3]}));");
                        sb.AppendLine($"pts.push(w2s({p[1]}+{p[4]},{p[2]}+{p[5]},{p[3]}+{p[6]}));");
                        break;
                    case "DA": // darrow x1 y1 x2 y2
                        sb.AppendLine($"pts.push([{p[1]},{p[2]}],[{p[3]},{p[4]}]);");
                        break;
                    case "DA3": // darrow3d x1 y1 z1 x2 y2 z2
                        sb.AppendLine($"pts.push(w2s({p[1]},{p[2]},{p[3]}),w2s({p[4]},{p[5]},{p[6]}));");
                        break;
                    case "OT": // otext x y
                        sb.AppendLine($"pts.push([{p[1]},{p[2]}]);");
                        break;
                    case "BM2": // beam2d x1 y1 x2 y2 width
                        sb.AppendLine($"(function(){{var w={p[5]}/2,dx={p[3]}-{p[1]},dy={p[4]}-{p[2]},len=Math.sqrt(dx*dx+dy*dy);" +
                            "if(len<1)return;var nx=-dy/len*w,ny=dx/len*w;" +
                            $"pts.push([{p[1]}+nx,{p[2]}+ny],[{p[1]}-nx,{p[2]}-ny],[{p[3]}+nx,{p[4]}+ny],[{p[3]}-nx,{p[4]}-ny]);}})();");
                        break;
                    case "TN": // tnode cx cy size
                        sb.AppendLine($"(function(){{var s={p[3]};pts.push([{p[1]}-s,{p[2]}-s*0.577],[{p[1]}+s,{p[2]}-s*0.577],[{p[1]},{p[2]}+s*1.155]);}})();");
                        break;
                    case "DIM": // dim x1 y1 x2 y2 offset text color lw fontSize
                        sb.AppendLine($"(function(){{var x1={p[1]},y1={p[2]},x2={p[3]},y2={p[4]},off={p[5]};" +
                            "var dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy);" +
                            "if(len<0.01){dx=0;dy=1;}else{dx/=len;dy/=len;}" +
                            "var nx=-dy*off,ny=dx*off;" +
                            "pts.push([x1+nx,y1+ny],[x2+nx,y2+ny]);}})();");
                        break;
                }
            }
        }

        /// <summary>Generate Canvas2D draw commands.</summary>
        private void GenerateDrawCommands(StringBuilder sb, List<string> cmds, bool is3d, bool scaled)
        {
            // When scaled (auto-fit), line width must be divided by scale
            string lwMul(string lw) => scaled ? $"{lw}*lwS" : lw;
            // Font size: when scaled, text needs inverse scale for readability
            string fontSize(int sz) => scaled ? $"Math.max(1,{sz}*lwS)" : $"{sz}";

            foreach (var cmd in cmds)
            {
                var p = cmd.Split('|');
                switch (p[0])
                {
                    case "L": // line x1 y1 x2 y2 color lw
                        sb.AppendLine($"ctx.beginPath();ctx.strokeStyle='{p[5]}';ctx.lineWidth={lwMul(p[6])};" +
                            $"ctx.moveTo({p[1]},{p[2]});ctx.lineTo({p[3]},{p[4]});ctx.stroke();");
                        break;
                    case "R": // rect x y w h color lw fill
                        sb.AppendLine($"ctx.strokeStyle='{p[5]}';ctx.lineWidth={lwMul(p[6])};ctx.strokeRect({p[1]},{p[2]},{p[3]},{p[4]});");
                        if (!string.IsNullOrEmpty(p[7]))
                            sb.AppendLine($"ctx.fillStyle='{p[7]}';ctx.fillRect({p[1]},{p[2]},{p[3]},{p[4]});");
                        break;
                    case "C": // circle cx cy r color lw fill
                        sb.AppendLine($"ctx.beginPath();ctx.strokeStyle='{p[4]}';ctx.lineWidth={lwMul(p[5])};" +
                            $"ctx.arc({p[1]},{p[2]},{p[3]},0,2*Math.PI);ctx.stroke();");
                        if (!string.IsNullOrEmpty(p[6]))
                            sb.AppendLine($"ctx.fillStyle='{p[6]}';ctx.fill();");
                        break;
                    case "A": // arrow x1 y1 x2 y2 color lw
                        sb.AppendLine($"drawArr(ctx,{p[1]},{p[2]},{p[3]},{p[4]},'{p[5]}',{lwMul(p[6])});");
                        break;
                    case "T": // text x y txt color
                        if (scaled)
                        {
                            sb.AppendLine($"ctx.save();ctx.translate({p[1]},{p[2]});ctx.scale(1,-1);" +
                                $"ctx.fillStyle='{p[4]}';ctx.font={fontSize(12)}+'px sans-serif';" +
                                $"ctx.fillText('{p[3]}',0,0);ctx.restore();");
                        }
                        else
                        {
                            sb.AppendLine($"ctx.fillStyle='{p[4]}';ctx.font='12px sans-serif';ctx.fillText('{p[3]}',{p[1]},{p[2]});");
                        }
                        break;
                    case "P": // pline coords... COL:col LW:lw
                    {
                        string pCol = "#333", pLw = "1.5";
                        var coords = new List<string>();
                        for (int i = 1; i < p.Length; i++)
                        {
                            if (p[i].StartsWith("COL:")) pCol = p[i].Substring(4);
                            else if (p[i].StartsWith("LW:")) pLw = p[i].Substring(3);
                            else if (p[i].ToLower() != "close") coords.Add(p[i]);
                        }
                        bool closed = cmd.ToLower().Contains("|close|") || cmd.ToLower().EndsWith("|close");
                        // strip the "close" from coords list if it ended up there
                        sb.AppendLine($"ctx.beginPath();ctx.strokeStyle='{pCol}';ctx.lineWidth={lwMul(pLw)};");
                        for (int i = 0; i < coords.Count - 1; i += 2)
                        {
                            sb.AppendLine(i == 0 ? $"ctx.moveTo({coords[i]},{coords[i + 1]});" : $"ctx.lineTo({coords[i]},{coords[i + 1]});");
                        }
                        if (closed) sb.AppendLine("ctx.closePath();");
                        sb.AppendLine("ctx.stroke();");
                        break;
                    }

                    // 3D commands
                    case "L3": // line3d x1 y1 z1 x2 y2 z2 color lw
                        sb.AppendLine($"(function(){{var a=w2s({p[1]},{p[2]},{p[3]}),b=w2s({p[4]},{p[5]},{p[6]});" +
                            $"ctx.beginPath();ctx.strokeStyle='{p[7]}';ctx.lineWidth={lwMul(p[8])};" +
                            "ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();})();");
                        break;
                    case "A3": // arrow3d x1 y1 z1 x2 y2 z2 color lw
                        sb.AppendLine($"(function(){{var a=w2s({p[1]},{p[2]},{p[3]}),b=w2s({p[4]},{p[5]},{p[6]});" +
                            $"drawArr(ctx,a[0],a[1],b[0],b[1],'{p[7]}',{lwMul(p[8])});}})()" + ";");
                        break;
                    case "T3": // text3d x y z txt color
                        if (scaled)
                        {
                            sb.AppendLine($"(function(){{var t=w2s({p[1]},{p[2]},{p[3]});" +
                                $"ctx.save();ctx.translate(t[0],t[1]);ctx.scale(1,-1);" +
                                $"ctx.fillStyle='{p[5]}';ctx.font={fontSize(12)}+'px sans-serif';" +
                                $"ctx.fillText('{p[4]}',0,0);ctx.restore();}})();");
                        }
                        else
                        {
                            sb.AppendLine($"(function(){{var t=w2s({p[1]},{p[2]},{p[3]});" +
                                $"ctx.fillStyle='{p[5]}';ctx.font='12px sans-serif';" +
                                $"ctx.fillText('{p[4]}',t[0],t[1]);}})();");
                        }
                        break;
                    case "C3": // circle3d cx cy cz r color lw fill
                        sb.AppendLine($"(function(){{var c=w2s({p[1]},{p[2]},{p[3]});" +
                            $"ctx.beginPath();ctx.strokeStyle='{p[5]}';ctx.lineWidth={lwMul(p[6])};" +
                            $"ctx.arc(c[0],c[1],{p[4]},0,2*Math.PI);ctx.stroke();");
                        if (!string.IsNullOrEmpty(p[7]))
                            sb.Append($"ctx.fillStyle='{p[7]}';ctx.fill();");
                        sb.AppendLine("})();");
                        break;
                    case "CA3": // carc3d cx cy cz r startAngle endAngle color lw
                        // Draw a curved arrow (arc with arrowhead) for moments
                        // Uses same convention as CadRender.ts: arc(center, r, -startAngle, -endAngle, true=CCW)
                        sb.AppendLine($"(function(){{var c=w2s({p[1]},{p[2]},{p[3]});" +
                            $"var r={p[4]},sa={p[5]},ea={p[6]};" +
                            $"ctx.beginPath();ctx.strokeStyle='{p[7]}';ctx.lineWidth={lwMul(p[8])};" +
                            "ctx.arc(c[0],c[1],r,-sa,-ea,true);ctx.stroke();" +
                            // Arrowhead at end of arc
                            "var endAng=-ea,ex=c[0]+r*Math.cos(endAng),ey=c[1]+r*Math.sin(endAng);" +
                            "var tx=Math.sin(endAng),ty=-Math.cos(endAng);" +
                            "var nx=-ty,ny=tx;" +
                            $"var aL=7*{lwMul("1")},aW=2.8*{lwMul("1")};" +
                            $"ctx.fillStyle='{p[7]}';ctx.beginPath();" +
                            "ctx.moveTo(ex,ey);" +
                            "ctx.lineTo(ex-tx*aL+nx*aW,ey-ty*aL+ny*aW);" +
                            "ctx.lineTo(ex-tx*aL-nx*aW,ey-ty*aL-ny*aW);" +
                            "ctx.closePath();ctx.fill();})();");
                        break;
                    case "P3": // pline3d coords... COL:col LW:lw
                    {
                        string pCol3 = "#333", pLw3 = "1.5";
                        var coords3 = new List<string>();
                        bool closed3 = false;
                        for (int i = 1; i < p.Length; i++)
                        {
                            if (p[i].StartsWith("COL:")) pCol3 = p[i].Substring(4);
                            else if (p[i].StartsWith("LW:")) pLw3 = p[i].Substring(3);
                            else if (p[i].ToLower() == "close") closed3 = true;
                            else coords3.Add(p[i]);
                        }
                        sb.AppendLine($"(function(){{ctx.beginPath();ctx.strokeStyle='{pCol3}';ctx.lineWidth={lwMul(pLw3)};");
                        for (int i = 0; i < coords3.Count - 2; i += 3)
                        {
                            sb.AppendLine($"var _p=w2s({coords3[i]},{coords3[i + 1]},{coords3[i + 2]});" +
                                (i == 0 ? "ctx.moveTo(_p[0],_p[1]);" : "ctx.lineTo(_p[0],_p[1]);"));
                        }
                        if (closed3) sb.AppendLine("ctx.closePath();");
                        sb.AppendLine("ctx.stroke();})();");
                        break;
                    }

                    // New primitives
                    case "H3": // hatch3d: H3|x1|y1|z1|x2|y2|z2|x3|y3|z3|x4|y4|z4|spacing|color|lw
                        sb.AppendLine($"(function(){{" +
                            $"var p1=w2s({p[1]},{p[2]},{p[3]}),p2=w2s({p[4]},{p[5]},{p[6]})," +
                            $"p3=w2s({p[7]},{p[8]},{p[9]}),p4=w2s({p[10]},{p[11]},{p[12]});" +
                            "ctx.save();" +
                            "ctx.beginPath();ctx.moveTo(p1[0],p1[1]);ctx.lineTo(p2[0],p2[1]);" +
                            "ctx.lineTo(p3[0],p3[1]);ctx.lineTo(p4[0],p4[1]);ctx.closePath();ctx.clip();" +
                            "var mn=[Math.min(p1[0],p2[0],p3[0],p4[0]),Math.min(p1[1],p2[1],p3[1],p4[1])]," +
                            "mx=[Math.max(p1[0],p2[0],p3[0],p4[0]),Math.max(p1[1],p2[1],p3[1],p4[1])];" +
                            // Spacing: in world-projected coords (ctx.scale handles screen mapping)
                            $"var sp={p[13]};if(sp<0.1)sp=0.1;" +
                            $"ctx.strokeStyle='{p[14]}';ctx.lineWidth=Math.max(0.8,{p[15]})*lwS;" +
                            "var dg=(mx[0]-mn[0])+(mx[1]-mn[1]);" +
                            "for(var d=-dg;d<dg;d+=sp){ctx.beginPath();" +
                            "ctx.moveTo(mn[0]+d,mn[1]);ctx.lineTo(mn[0]+d+(mx[1]-mn[1]),mx[1]);ctx.stroke();}" +
                            "ctx.restore();})();");
                        break;

                    case "FP3": // fillpoly3d: FP3|coords...|COL:color|LW:lw
                    {
                        string fpCol = "#333", fpLw = "1";
                        var fpCoords = new List<string>();
                        for (int i = 1; i < p.Length; i++)
                        {
                            if (p[i].StartsWith("COL:")) fpCol = p[i].Substring(4);
                            else if (p[i].StartsWith("LW:")) fpLw = p[i].Substring(3);
                            else fpCoords.Add(p[i]);
                        }
                        sb.Append("(function(){ctx.save();ctx.beginPath();");
                        for (int i = 0; i < fpCoords.Count - 2; i += 3)
                        {
                            sb.Append($"var _q=w2s({fpCoords[i]},{fpCoords[i + 1]},{fpCoords[i + 2]});");
                            sb.Append(i == 0 ? "ctx.moveTo(_q[0],_q[1]);" : "ctx.lineTo(_q[0],_q[1]);");
                        }
                        sb.AppendLine($"ctx.closePath();ctx.fillStyle='{fpCol}';ctx.fill();" +
                            $"ctx.strokeStyle='{fpCol}';ctx.lineWidth={lwMul(fpLw)};ctx.stroke();ctx.restore();}})();");
                        break;
                    }

                    case "LB3": // label3d: LB3|x|y|z|text|color|anchor|fontSize
                    {
                        var lbAnchor = p.Length >= 7 ? p[6] : "center";
                        var lbFs = p.Length >= 8 ? p[7] : "12";
                        var lbAlign = lbAnchor == "left" ? "left" : lbAnchor == "right" ? "right" : "center";
                        if (scaled)
                        {
                            sb.AppendLine($"(function(){{var t=w2s({p[1]},{p[2]},{p[3]});" +
                                $"ctx.save();ctx.translate(t[0],t[1]);ctx.scale(1,-1);" +
                                $"ctx.fillStyle='{p[5]}';ctx.font={fontSize(int.TryParse(lbFs.Split('.')[0], out int lfs) ? lfs : 12)}+'px sans-serif';" +
                                $"ctx.textAlign='{lbAlign}';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[4]}',0,0);ctx.restore();}})();");
                        }
                        else
                        {
                            sb.AppendLine($"(function(){{var t=w2s({p[1]},{p[2]},{p[3]});" +
                                $"ctx.fillStyle='{p[5]}';ctx.font='{lbFs}px sans-serif';" +
                                $"ctx.textAlign='{lbAlign}';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[4]}',t[0],t[1]);}})();");
                        }
                        break;
                    }

                    case "BM_LBL": // beam3d label: BM_LBL|x1|y1|z1|x2|y2|z2|depth|label|color|fontSize
                    {
                        var bmFs = p.Length >= 11 ? p[10] : "12";
                        if (scaled)
                        {
                            sb.AppendLine($"(function(){{" +
                                $"var mx=({p[1]}+{p[4]})/2,my=({p[2]}+{p[5]})/2,mz=({p[3]}+{p[6]})/2;" +
                                $"var tz=mz-{p[7]}-1;" +
                                $"var dx={p[4]}-({p[1]}),dy={p[5]}-({p[2]});" +
                                "var len=Math.sqrt(dx*dx+dy*dy)||1;var ux=dx/len,uy=dy/len;" +
                                // Direction triangle (filled)
                                "var t1=w2s(mx-ux*0.7,my-uy*0.7,tz),t2=w2s(mx+ux*0.7,my+uy*0.7,tz),t3=w2s(mx,my,tz+0.5);" +
                                $"ctx.save();ctx.fillStyle='{p[9]}';ctx.beginPath();" +
                                "ctx.moveTo(t1[0],t1[1]);ctx.lineTo(t2[0],t2[1]);ctx.lineTo(t3[0],t3[1]);" +
                                "ctx.closePath();ctx.fill();" +
                                // Label (white text over dark triangle)
                                $"var lt=w2s(mx,my,(tz+tz+0.5)/2);" +
                                $"ctx.translate(lt[0],lt[1]);ctx.scale(1,-1);" +
                                $"ctx.fillStyle='#ffffff';" +
                                $"ctx.font={fontSize(int.TryParse(bmFs.Split('.')[0], out int bmfsi) ? bmfsi : 12)}+'px sans-serif';" +
                                $"ctx.textAlign='center';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[8]}',0,0);ctx.restore();}})();");
                        }
                        else
                        {
                            sb.AppendLine($"(function(){{" +
                                $"var mx=({p[1]}+{p[4]})/2,my=({p[2]}+{p[5]})/2,mz=({p[3]}+{p[6]})/2;" +
                                $"var tz=mz-{p[7]}-1;" +
                                $"var dx={p[4]}-({p[1]}),dy={p[5]}-({p[2]});" +
                                "var len=Math.sqrt(dx*dx+dy*dy)||1;var ux=dx/len,uy=dy/len;" +
                                "var t1=w2s(mx-ux*0.7,my-uy*0.7,tz),t2=w2s(mx+ux*0.7,my+uy*0.7,tz),t3=w2s(mx,my,tz+0.5);" +
                                $"ctx.fillStyle='{p[9]}';ctx.beginPath();" +
                                "ctx.moveTo(t1[0],t1[1]);ctx.lineTo(t2[0],t2[1]);ctx.lineTo(t3[0],t3[1]);" +
                                "ctx.closePath();ctx.fill();" +
                                $"ctx.fillStyle='#ffffff';" +
                                $"var lt=w2s(mx,my,(tz+tz+0.5)/2);" +
                                $"ctx.font='{bmFs}px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[8]}',lt[0],lt[1]);}})();");
                        }
                        break;
                    }

                    case "DOF_LBL": // dof label: DOF_LBL|x|y|z|dx|dy|dz|label|color|fontSize
                    {
                        var dofFs = p.Length >= 10 ? p[9] : "12";
                        if (scaled)
                        {
                            sb.AppendLine($"(function(){{" +
                                $"var dx={p[4]},dy={p[5]},dz={p[6]};" +
                                "var len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;" +
                                "var ux=dx/len,uy=dy/len,uz=dz/len;" +
                                $"var t=w2s({p[1]}+dx+ux*0.8,{p[2]}+dy+uy*0.8,{p[3]}+dz+uz*0.8);" +
                                $"ctx.save();ctx.translate(t[0],t[1]);ctx.scale(1,-1);" +
                                $"ctx.fillStyle='{p[8]}';ctx.font={fontSize(int.TryParse(dofFs.Split('.')[0], out int dfsi) ? dfsi : 12)}+'px sans-serif';" +
                                $"ctx.textAlign='center';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[7]}',0,0);ctx.restore();}})();");
                        }
                        else
                        {
                            sb.AppendLine($"(function(){{" +
                                $"var dx={p[4]},dy={p[5]},dz={p[6]};" +
                                "var len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;" +
                                "var ux=dx/len,uy=dy/len,uz=dz/len;" +
                                $"var t=w2s({p[1]}+dx+ux*0.8,{p[2]}+dy+uy*0.8,{p[3]}+dz+uz*0.8);" +
                                $"ctx.fillStyle='{p[8]}';ctx.font='{dofFs}px sans-serif';" +
                                $"ctx.textAlign='center';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[7]}',t[0],t[1]);}})();");
                        }
                        break;
                    }

                    case "RDOF3": // rotational DOF: two parallel arrows + label
                    {
                        // RDOF3|x|y|z|dx|dy|dz|label|color|lw|fontSize
                        var rdFs = p.Length >= 11 ? p[10] : "12";
                        var rdLw = p.Length >= 10 ? p[9] : "1.5";
                        var rdColor = p.Length >= 9 ? p[8] : "#000";
                        if (scaled)
                        {
                            sb.AppendLine($"(function(){{" +
                                $"var x={p[1]},y={p[2]},z={p[3]},dx={p[4]},dy={p[5]},dz={p[6]};" +
                                "var len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;" +
                                "var ux=dx/len,uy=dy/len,uz=dz/len;" +
                                "var px=0,py=0,pz=0;if(Math.abs(uz)>0.7){px=1;}else{pz=1;}" +
                                "var off=0.3;" +
                                "var a1=w2s(x+px*off,y+py*off,z+pz*off),b1=w2s(x+dx+px*off,y+dy+py*off,z+dz+pz*off);" +
                                $"drawArr(ctx,a1[0],a1[1],b1[0],b1[1],'{rdColor}',{lwMul(rdLw)});" +
                                "var a2=w2s(x-px*off,y-py*off,z-pz*off),b2=w2s(x+dx-px*off,y+dy-py*off,z+dz-pz*off);" +
                                $"drawArr(ctx,a2[0],a2[1],b2[0],b2[1],'{rdColor}',{lwMul(rdLw)});" +
                                "var t=w2s(x+dx+ux*0.8,y+dy+uy*0.8,z+dz+uz*0.8);" +
                                $"ctx.save();ctx.translate(t[0],t[1]);ctx.scale(1,-1);" +
                                $"ctx.fillStyle='{rdColor}';ctx.font={fontSize(int.TryParse(rdFs.Split('.')[0], out int rdFsi) ? rdFsi : 12)}+'px sans-serif';" +
                                $"ctx.textAlign='center';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[7]}',0,0);ctx.restore();}})();");
                        }
                        else
                        {
                            sb.AppendLine($"(function(){{" +
                                $"var x={p[1]},y={p[2]},z={p[3]},dx={p[4]},dy={p[5]},dz={p[6]};" +
                                "var len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;" +
                                "var ux=dx/len,uy=dy/len,uz=dz/len;" +
                                "var px=0,py=0,pz=0;if(Math.abs(uz)>0.7){px=1;}else{pz=1;}" +
                                "var off=0.3;" +
                                "var a1=w2s(x+px*off,y+py*off,z+pz*off),b1=w2s(x+dx+px*off,y+dy+py*off,z+dz+pz*off);" +
                                $"drawArr(ctx,a1[0],a1[1],b1[0],b1[1],'{rdColor}',{rdLw});" +
                                "var a2=w2s(x-px*off,y-py*off,z-pz*off),b2=w2s(x+dx-px*off,y+dy-py*off,z+dz-pz*off);" +
                                $"drawArr(ctx,a2[0],a2[1],b2[0],b2[1],'{rdColor}',{rdLw});" +
                                "var t=w2s(x+dx+ux*0.8,y+dy+uy*0.8,z+dz+uz*0.8);" +
                                $"ctx.fillStyle='{rdColor}';ctx.font='{rdFs}px sans-serif';" +
                                $"ctx.textAlign='center';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[7]}',t[0],t[1]);}})();");
                        }
                        break;
                    }

                    case "DA": // darrow x1 y1 x2 y2 color lw
                        sb.AppendLine($"drawDArr(ctx,{p[1]},{p[2]},{p[3]},{p[4]},'{p[5]}',{lwMul(p[6])});");
                        break;

                    case "DA3": // darrow3d x1 y1 z1 x2 y2 z2 color lw
                        sb.AppendLine($"(function(){{var a=w2s({p[1]},{p[2]},{p[3]}),b=w2s({p[4]},{p[5]},{p[6]});" +
                            $"drawDArr(ctx,a[0],a[1],b[0],b[1],'{p[7]}',{lwMul(p[8])});}})()" + ";");
                        break;

                    case "OT": // otext x y txt color fontSize
                    {
                        var otFs = p.Length >= 6 ? p[5] : "12";
                        if (scaled)
                        {
                            sb.AppendLine($"(function(){{ctx.save();ctx.translate({p[1]},{p[2]});ctx.scale(1,-1);" +
                                $"ctx.fillStyle='{p[4]}';var fs={fontSize(int.TryParse(otFs.Split('.')[0], out int otfsi) ? otfsi : 12)};" +
                                "ctx.font=fs+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[3]}',0,0);" +
                                $"var m=ctx.measureText('{p[3]}'),tw=m.width;" +
                                "ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=1.5*lwS;" +
                                "ctx.beginPath();ctx.moveTo(-tw/2,-fs*0.6);ctx.lineTo(tw/2,-fs*0.6);ctx.stroke();" +
                                "ctx.restore();})();");
                        }
                        else
                        {
                            sb.AppendLine($"(function(){{ctx.fillStyle='{p[4]}';ctx.font='{otFs}px sans-serif';" +
                                $"ctx.textAlign='center';ctx.textBaseline='middle';" +
                                $"ctx.fillText('{p[3]}',{p[1]},{p[2]});" +
                                $"var m=ctx.measureText('{p[3]}'),tw=m.width;" +
                                $"ctx.strokeStyle='{p[4]}';ctx.lineWidth=1.5;" +
                                $"ctx.beginPath();ctx.moveTo({p[1]}-tw/2,{p[2]}-{otFs}*0.6);ctx.lineTo({p[1]}+tw/2,{p[2]}-{otFs}*0.6);ctx.stroke();" +
                                "})();");
                        }
                        break;
                    }

                    case "BM2": // beam2d: BM2|x1|y1|x2|y2|width|color|lw|hatchSpacing
                    {
                        sb.AppendLine($"(function(){{" +
                            $"var x1={p[1]},y1={p[2]},x2={p[3]},y2={p[4]},w={p[5]}/2;" +
                            "var dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy);" +
                            "if(len<1)return;var nx=-dy/len*w,ny=dx/len*w;" +
                            "var c1x=x1+nx,c1y=y1+ny,c2x=x2+nx,c2y=y2+ny," +
                            "c3x=x2-nx,c3y=y2-ny,c4x=x1-nx,c4y=y1-ny;" +
                            // Outline
                            $"ctx.strokeStyle='{p[6]}';ctx.lineWidth={lwMul(p[7])};" +
                            "ctx.beginPath();ctx.moveTo(c1x,c1y);ctx.lineTo(c2x,c2y);" +
                            "ctx.lineTo(c3x,c3y);ctx.lineTo(c4x,c4y);ctx.closePath();ctx.stroke();" +
                            // Hatching
                            $"ctx.save();ctx.beginPath();ctx.moveTo(c1x,c1y);ctx.lineTo(c2x,c2y);" +
                            "ctx.lineTo(c3x,c3y);ctx.lineTo(c4x,c4y);ctx.closePath();ctx.clip();" +
                            $"var sp={p[8]};if(sp<0.5)sp=0.5;" +
                            $"ctx.strokeStyle='{p[6]}';ctx.lineWidth={lwMul(p[7])}*0.3;" +
                            "var mn=Math.min(c1x,c2x,c3x,c4x),mx=Math.max(c1x,c2x,c3x,c4x)," +
                            "mny=Math.min(c1y,c2y,c3y,c4y),mxy=Math.max(c1y,c2y,c3y,c4y);" +
                            "var dg=(mx-mn)+(mxy-mny);" +
                            "for(var d=-dg;d<dg;d+=sp){ctx.beginPath();" +
                            "ctx.moveTo(mn+d,mny);ctx.lineTo(mn+d+(mxy-mny),mxy);ctx.stroke();}" +
                            "ctx.restore();}})();");
                        break;
                    }

                    case "TN": // tnode: TN|cx|cy|size|color|lw|label
                    {
                        sb.AppendLine($"(function(){{" +
                            $"var cx={p[1]},cy={p[2]},sz={p[3]};" +
                            "var h=sz*1.155,hb=sz*0.577;" +
                            // White-filled triangle
                            "ctx.beginPath();ctx.moveTo(cx-sz,cy-hb);ctx.lineTo(cx+sz,cy-hb);ctx.lineTo(cx,cy+h-hb);ctx.closePath();" +
                            $"ctx.fillStyle='#ffffff';ctx.fill();" +
                            $"ctx.strokeStyle='{p[4]}';ctx.lineWidth={lwMul(p[5])};ctx.stroke();");
                        if (p.Length >= 7 && !string.IsNullOrEmpty(p[6]))
                        {
                            if (scaled)
                            {
                                sb.AppendLine($"ctx.save();ctx.translate(cx,cy);ctx.scale(1,-1);" +
                                    $"ctx.fillStyle='{p[4]}';ctx.font={fontSize(10)}+'px serif';" +
                                    $"ctx.textAlign='center';ctx.textBaseline='middle';" +
                                    $"ctx.fillText('{p[6]}',0,0);ctx.restore();");
                            }
                            else
                            {
                                sb.AppendLine($"ctx.fillStyle='{p[4]}';ctx.font='10px serif';" +
                                    $"ctx.textAlign='center';ctx.textBaseline='middle';" +
                                    $"ctx.fillText('{p[6]}',cx,cy);");
                            }
                        }
                        sb.AppendLine("})();");
                        break;
                    }

                    case "DIM": // dimension line: DIM|x1|y1|x2|y2|offset|text|color|lw|fontSize
                    {
                        // Renders a dimension line with arrows and centered text
                        // The offset is perpendicular to the line direction
                        var dimFsz = p.Length >= 10 ? p[9] : "10";
                        sb.AppendLine($"(function(){{" +
                            $"var x1={p[1]},y1={p[2]},x2={p[3]},y2={p[4]},off={p[5]};" +
                            $"var col='{p[7]}',lw={lwMul(p[8])},fsz={dimFsz};" +
                            "var dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy);" +
                            "if(len<0.01)return;" +
                            "var ux=dx/len,uy=dy/len,nx=-uy,ny=ux;" +
                            // Extension lines from points to dimension line
                            "var ox1=x1+nx*off,oy1=y1+ny*off,ox2=x2+nx*off,oy2=y2+ny*off;" +
                            "ctx.strokeStyle=col;ctx.lineWidth=lw*0.5;" +
                            "ctx.beginPath();ctx.moveTo(x1+nx*2,y1+ny*2);ctx.lineTo(ox1+nx*3,oy1+ny*3);ctx.stroke();" +
                            "ctx.beginPath();ctx.moveTo(x2+nx*2,y2+ny*2);ctx.lineTo(ox2+nx*3,oy2+ny*3);ctx.stroke();" +
                            // Dimension line
                            "ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo(ox1,oy1);ctx.lineTo(ox2,oy2);ctx.stroke();" +
                            // Arrowheads
                            "var as=Math.min(8,len*0.15);" +
                            "ctx.beginPath();ctx.moveTo(ox1,oy1);ctx.lineTo(ox1+ux*as+nx*as*0.3,oy1+uy*as+ny*as*0.3);" +
                            "ctx.moveTo(ox1,oy1);ctx.lineTo(ox1+ux*as-nx*as*0.3,oy1+uy*as-ny*as*0.3);ctx.stroke();" +
                            "ctx.beginPath();ctx.moveTo(ox2,oy2);ctx.lineTo(ox2-ux*as+nx*as*0.3,oy2-uy*as+ny*as*0.3);" +
                            "ctx.moveTo(ox2,oy2);ctx.lineTo(ox2-ux*as-nx*as*0.3,oy2-uy*as-ny*as*0.3);ctx.stroke();");
                        // Text label
                        var dimLabel = p.Length >= 7 ? p[6] : "";
                        if (!string.IsNullOrEmpty(dimLabel))
                        {
                            if (scaled)
                            {
                                sb.AppendLine($"var mx=(ox1+ox2)/2,my=(oy1+oy2)/2;" +
                                    $"ctx.save();ctx.translate(mx,my);ctx.scale(1,-1);" +
                                    $"ctx.fillStyle=col;ctx.font={fontSize(int.TryParse(dimFsz, out var dimFs) ? dimFs : 10)}+'px serif';" +
                                    $"ctx.textAlign='center';ctx.textBaseline='bottom';" +
                                    $"ctx.fillText('{dimLabel}',0,0);ctx.restore();");
                            }
                            else
                            {
                                sb.AppendLine($"var mx=(ox1+ox2)/2,my=(oy1+oy2)/2;" +
                                    $"ctx.fillStyle=col;ctx.font='{dimFsz}px serif';" +
                                    $"ctx.textAlign='center';ctx.textBaseline='bottom';" +
                                    $"ctx.fillText('{dimLabel}',mx,my-2);");
                            }
                        }
                        sb.AppendLine("})();");
                        break;
                    }
                }
            }
        }

        /// <summary>Format a double for JS (invariant culture).</summary>
        private static string F(double v) =>
            v.ToString(System.Globalization.CultureInfo.InvariantCulture);

        /// <summary>Escape a string for use inside JS single-quoted string.</summary>
        private static string DrawEscapeJs(string s) =>
            s.Replace("\\", "\\\\").Replace("'", "\\'").Replace("\n", "\\n");

        /// <summary>
        /// Process @{three} blocks - Three.js 3D scene DSL
        /// Syntax: box x y z size:1,1,1 color:#4488ff
        ///         sphere x y z radius:0.5 color:#ff4444
        ///         cylinder x y z radius:0.3 height:2 color:#44ff44
        ///         plane x y z size:10,10 color:#888 rotation:90,0,0
        ///         line x1 y1 z1 x2 y2 z2 color:#fff
        ///         cone x y z radius:0.5 height:1 color:#ff0
        ///         torus x y z radius:1 tube:0.3 color:#0ff
        ///         light ambient color:#404040
        ///         light directional x y z color:#fff intensity:0.8
        ///         light point x y z color:#fff intensity:1
        ///         camera x y z look:0,0,0 fov:60
        ///         background #1a1a2e
        ///         grid size:10 step:1 color:#444
        ///         axes size:3
        ///         group translate:x,y,z rotate:x,y,z
        ///         endgroup
        ///         points x1,y1,z1 x2,y2,z2 ... color:#fff size:0.05
        ///         extrude shape:L,C,rect,I ... (future)
        /// </summary>
        private string ProcessThreeBlock(string content, string directive, Dictionary<string, object> variables)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return "<p style='color:red;'>Error: Bloque @{three} vacio</p>";

                var processed = ProcessMarkdownVariables(content, variables);
                var lines = processed.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

                // Parse directive: @{three 800 600}
                int canvasW = 800, canvasH = 500;
                var dirParts = directive.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                if (dirParts.Length >= 3 && int.TryParse(dirParts[1], out int pw) && int.TryParse(dirParts[2], out int ph))
                { canvasW = pw; canvasH = ph; }
                else if (dirParts.Length >= 2 && int.TryParse(dirParts[1], out int pw2))
                { canvasW = pw2; canvasH = (int)(pw2 * 0.625); }

                var containerId = "three_" + Guid.NewGuid().ToString("N").Substring(0, 8);

                // Detect raw JavaScript mode: if content contains JS syntax, pass through as-is
                bool isRawJs = false;
                foreach (var rawLine in lines)
                {
                    var trimLine = rawLine.Trim();
                    if (string.IsNullOrEmpty(trimLine) || trimLine.StartsWith("#") || trimLine.StartsWith("//")) continue;
                    // Check for JS syntax patterns that the DSL would never produce
                    if (trimLine.StartsWith("const ") || trimLine.StartsWith("let ") ||
                        trimLine.StartsWith("var ") || trimLine.StartsWith("function ") ||
                        trimLine.StartsWith("new THREE.") || trimLine.StartsWith("scene.") ||
                        trimLine.StartsWith("camera.") || trimLine.StartsWith("renderer.") ||
                        trimLine.Contains("=> {") || trimLine.Contains("= new THREE."))
                    {
                        isRawJs = true;
                        break;
                    }
                }

                if (isRawJs)
                {
                    // Raw JavaScript mode: wrap user code with container + Three.js imports
                    var rawCode = processed
                        .Replace("document.currentScript.parentElement.appendChild", "container.appendChild")
                        .Replace("document.currentScript.parentElement", "container");
                    // Strip import statements from user code - they go at top level, not inside IIFE
                    var rawLines = rawCode.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
                    var filteredCode = new System.Text.StringBuilder();
                    foreach (var rl in rawLines)
                    {
                        var trimRl = rl.TrimStart();
                        if (trimRl.StartsWith("import ") && (trimRl.Contains(" from ") || trimRl.Contains("from\"")))
                            continue; // skip - wrapper provides imports
                        filteredCode.AppendLine(rl);
                    }
                    rawCode = filteredCode.ToString();
                    bool hasOrbitControls = rawCode.Contains("OrbitControls");
                    bool hasAnimationLoop = rawCode.Contains("requestAnimationFrame");
                    var rawSb = new System.Text.StringBuilder();
                    rawSb.AppendLine($"<div id='{containerId}' style='width:{canvasW}px;height:{canvasH}px;margin:10px auto;border:1px solid #333;border-radius:6px;overflow:hidden;'></div>");
                    rawSb.AppendLine("<script type='module'>");
                    rawSb.AppendLine("import * as THREE from 'three';");
                    rawSb.AppendLine("import { OrbitControls } from 'three/addons/controls/OrbitControls.js';");
                    rawSb.AppendLine("(function(){");
                    rawSb.AppendLine($"  var container = document.getElementById('{containerId}');");
                    rawSb.AppendLine(rawCode);
                    // Auto-inject OrbitControls + animation loop if user didn't provide them
                    if (!hasOrbitControls && !hasAnimationLoop)
                    {
                        rawSb.AppendLine("  // Auto-injected OrbitControls and animation loop");
                        rawSb.AppendLine("  if (typeof camera !== 'undefined' && typeof renderer !== 'undefined' && typeof scene !== 'undefined') {");
                        rawSb.AppendLine("    var _controls = new OrbitControls(camera, renderer.domElement);");
                        rawSb.AppendLine("    _controls.enableDamping = true;");
                        rawSb.AppendLine("    _controls.dampingFactor = 0.05;");
                        rawSb.AppendLine("    _controls.update();");
                        rawSb.AppendLine("    (function _animate(){ requestAnimationFrame(_animate); _controls.update(); renderer.render(scene, camera); })();");
                        rawSb.AppendLine("  }");
                    }
                    rawSb.AppendLine("})();");
                    rawSb.AppendLine("</script>");
                    return rawSb.ToString();
                }

                // Collect scene data (DSL mode)
                string bgColor = "0x1a1a2e";
                var cameraPos = "5,5,5";
                var cameraLook = "0,0,0";
                int fov = 60;
                var objectsJs = new System.Text.StringBuilder();
                var lightsJs = new System.Text.StringBuilder();
                bool hasAmbient = false;
                bool hasDirectional = false;
                bool hasGrid = false;
                bool hasAxes = false;
                bool needsArrowDef = false;
                int groupDepth = 0;
                var animCode = new System.Text.StringBuilder();
                int animIdx = 0;

                // Persistent state for @{three} DSL
                string currentThreeColor = "#4488ff";
                string currentThreeOpacity = "1";
                string currentThreeWireframe = "false";
                string currentThreeMetalness = "0.1";
                string currentThreeRoughness = "0.5";

                foreach (var rawLine in lines)
                {
                    var line = rawLine.Trim();
                    if (string.IsNullOrEmpty(line) || line.StartsWith("#")) continue;

                    var tokens = SplitSvgLine(line);
                    if (tokens.Count == 0) continue;

                    var cmd = tokens[0].ToLower();
                    var opts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    var posParams = new List<string>();

                    for (int i = 1; i < tokens.Count; i++)
                    {
                        var tok = tokens[i];
                        if (tok.Contains(':'))
                        {
                            var ci = tok.IndexOf(':');
                            opts[tok.Substring(0, ci)] = tok.Substring(ci + 1);
                        }
                        else posParams.Add(tok);
                    }

                    string GetOpt(string key, string def = null) => opts.ContainsKey(key) ? opts[key] : def;
                    string Pos(int idx, string def = "0") => idx < posParams.Count ? posParams[idx] : def;
                    string ColorHex(string c) => c != null ? (c.StartsWith("#") ? "0x" + c.Substring(1) : c.StartsWith("0x") ? c : "0x" + c) : "0x4488ff";
                    // Use persistent color state as default
                    string OptColor() => ColorHex(GetOpt("color") ?? currentThreeColor);
                    string OptOpacity() => GetOpt("opacity") ?? currentThreeOpacity;
                    string OptWireframe() => GetOpt("wireframe") ?? currentThreeWireframe;
                    string OptMetalness() => GetOpt("metalness") ?? currentThreeMetalness;
                    string OptRoughness() => GetOpt("roughness") ?? currentThreeRoughness;

                    // animate: support — returns JS snippet to inject inside mesh block scope
                    string AnimSuffix(string px, string py, string pz) {
                        var anim = GetOpt("animate");
                        if (string.IsNullOrEmpty(anim)) return "";
                        var aName = $"_a{animIdx++}";
                        var parts = anim.Split(',');
                        var tp = parts[0].ToLower();
                        var p1 = parts.Length > 1 ? parts[1] : "1";
                        var p2 = parts.Length > 2 ? parts[2] : "1";
                        var sfx = $" mesh.name='{aName}';";
                        if (tp.StartsWith("oscillate-")) {
                            var ax = tp[tp.Length - 1].ToString();
                            var ov = ax == "x" ? px : ax == "y" ? py : pz;
                            sfx += $" mesh.userData._o={ov};";
                            animCode.AppendLine($"    {{ var o=scene.getObjectByName('{aName}'); if(o) o.position.{ax}=o.userData._o+{p1}*Math.sin({p2}*t*2*Math.PI); }}");
                        } else if (tp.StartsWith("rotate-")) {
                            var ax = tp[tp.Length - 1].ToString();
                            animCode.AppendLine($"    {{ var o=scene.getObjectByName('{aName}'); if(o) o.rotation.{ax}+={p1}*0.01; }}");
                        }
                        return sfx;
                    }

                    switch (cmd)
                    {
                        // === Persistent state commands ===
                        case "color":
                            currentThreeColor = Pos(0, "#4488ff");
                            break;
                        case "opacity":
                            currentThreeOpacity = Pos(0, "1");
                            break;
                        case "wireframe":
                            currentThreeWireframe = Pos(0, "false");
                            break;
                        case "metalness":
                            currentThreeMetalness = Pos(0, "0.1");
                            break;
                        case "roughness":
                            currentThreeRoughness = Pos(0, "0.5");
                            break;
                        case "reset":
                            currentThreeColor = "#4488ff"; currentThreeOpacity = "1"; currentThreeWireframe = "false";
                            currentThreeMetalness = "0.1"; currentThreeRoughness = "0.5";
                            break;

                        case "background":
                        case "bg":
                            bgColor = ColorHex(Pos(0, "#1a1a2e"));
                            break;

                        case "camera":
                            cameraPos = $"{Pos(0, "5")},{Pos(1, "5")},{Pos(2, "5")}";
                            if (GetOpt("look") != null) cameraLook = GetOpt("look");
                            if (GetOpt("fov") != null) int.TryParse(GetOpt("fov"), out fov);
                            break;

                        case "light":
                        {
                            var lightType = Pos(0, "ambient").ToLower();
                            var lColor = ColorHex(GetOpt("color", "#ffffff"));
                            var intensity = GetOpt("intensity", "1");
                            if (lightType == "ambient")
                            {
                                lightsJs.AppendLine($"  scene.add(new THREE.AmbientLight({lColor}, {intensity}));");
                                hasAmbient = true;
                            }
                            else if (lightType == "directional")
                            {
                                var lx = Pos(1, "5"); var ly = Pos(2, "10"); var lz = Pos(3, "7");
                                lightsJs.AppendLine($"  {{ var dl = new THREE.DirectionalLight({lColor}, {intensity}); dl.position.set({lx},{ly},{lz}); dl.castShadow=true; scene.add(dl); }}");
                                hasDirectional = true;
                            }
                            else if (lightType == "point")
                            {
                                var lx = Pos(1, "0"); var ly = Pos(2, "5"); var lz = Pos(3, "0");
                                lightsJs.AppendLine($"  {{ var pl = new THREE.PointLight({lColor}, {intensity}, 50); pl.position.set({lx},{ly},{lz}); scene.add(pl); }}");
                            }
                            break;
                        }

                        case "box":
                        case "cube":
                        {
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var size = GetOpt("size", "1,1,1").Split(',');
                            var sx = size[0]; var sy = size.Length > 1 ? size[1] : size[0]; var sz = size.Length > 2 ? size[2] : size[0];
                            var wf = OptWireframe();
                            var op = OptOpacity();
                            var mt = OptMetalness();
                            var rg = OptRoughness();
                            objectsJs.AppendLine($"  {{ var g=new THREE.BoxGeometry({sx},{sy},{sz}); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},wireframe:{wf},opacity:{op},transparent:{op}!=='1'?true:false,metalness:{mt},roughness:{rg}}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y},{z}); mesh.castShadow=true; mesh.receiveShadow=true; {ApplyRotation(GetOpt("rotation"))}{AnimSuffix(x,y,z)} currentGroup.add(mesh); }}");
                            break;
                        }

                        case "sphere":
                        {
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var r = GetOpt("radius", GetOpt("r", "0.5"));
                            var seg = GetOpt("segments", "32");
                            var wf = OptWireframe();
                            var op = OptOpacity();
                            objectsJs.AppendLine($"  {{ var g=new THREE.SphereGeometry({r},{seg},{seg}); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},wireframe:{wf},opacity:{op},transparent:{op}!=='1'?true:false}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y},{z}); mesh.castShadow=true; {ApplyRotation(GetOpt("rotation"))}{AnimSuffix(x,y,z)} currentGroup.add(mesh); }}");
                            break;
                        }

                        case "cylinder":
                        {
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var r = GetOpt("radius", GetOpt("r", "0.5"));
                            var h = GetOpt("height", GetOpt("h", "1"));
                            var seg = GetOpt("segments", "32");
                            var wf = OptWireframe();
                            var op = OptOpacity();
                            objectsJs.AppendLine($"  {{ var g=new THREE.CylinderGeometry({r},{r},{h},{seg}); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},wireframe:{wf},opacity:{op},transparent:{op}!=='1'?true:false}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y},{z}); mesh.castShadow=true; {ApplyRotation(GetOpt("rotation"))}{AnimSuffix(x,y,z)} currentGroup.add(mesh); }}");
                            break;
                        }

                        case "cone":
                        {
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var r = GetOpt("radius", GetOpt("r", "0.5"));
                            var h = GetOpt("height", GetOpt("h", "1"));
                            var op = OptOpacity();
                            objectsJs.AppendLine($"  {{ var g=new THREE.ConeGeometry({r},{h},32); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},opacity:{op},transparent:{op}!=='1'?true:false}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y},{z}); mesh.castShadow=true; {ApplyRotation(GetOpt("rotation"))}{AnimSuffix(x,y,z)} currentGroup.add(mesh); }}");
                            break;
                        }

                        case "torus":
                        {
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var r = GetOpt("radius", GetOpt("r", "1"));
                            var tube = GetOpt("tube", "0.3");
                            var op = OptOpacity();
                            objectsJs.AppendLine($"  {{ var g=new THREE.TorusGeometry({r},{tube},16,48); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},opacity:{op},transparent:{op}!=='1'?true:false}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y},{z}); mesh.castShadow=true; {ApplyRotation(GetOpt("rotation"))}{AnimSuffix(x,y,z)} currentGroup.add(mesh); }}");
                            break;
                        }

                        case "plane":
                        {
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var size = GetOpt("size", "10,10").Split(',');
                            var sw = size[0]; var sh = size.Length > 1 ? size[1] : size[0];
                            var op = OptOpacity();
                            objectsJs.AppendLine($"  {{ var g=new THREE.PlaneGeometry({sw},{sh}); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},side:THREE.DoubleSide,opacity:{op},transparent:{op}!=='1'?true:false}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y},{z}); mesh.receiveShadow=true; {ApplyRotation(GetOpt("rotation", "-90,0,0"))} currentGroup.add(mesh); }}");
                            break;
                        }

                        case "line":
                        {
                            // line x1 y1 z1 x2 y2 z2 color:#fff
                            var x1 = Pos(0); var y1 = Pos(1); var z1 = Pos(2);
                            var x2 = Pos(3); var y2 = Pos(4); var z2 = Pos(5);
                            var lw = GetOpt("width", "2");
                            objectsJs.AppendLine($"  {{ var pts=[new THREE.Vector3({x1},{y1},{z1}),new THREE.Vector3({x2},{y2},{z2})]; var g=new THREE.BufferGeometry().setFromPoints(pts); var m=new THREE.LineBasicMaterial({{color:{OptColor()},linewidth:{lw}}}); currentGroup.add(new THREE.Line(g,m)); }}");
                            break;
                        }

                        case "polyline":
                        {
                            // polyline x1,y1,z1 x2,y2,z2 ... color:#fff
                            var ptsCode = new System.Text.StringBuilder("[");
                            foreach (var p in posParams)
                            {
                                var coords = p.Split(',');
                                if (coords.Length >= 3)
                                    ptsCode.Append($"new THREE.Vector3({coords[0]},{coords[1]},{coords[2]}),");
                            }
                            ptsCode.Append("]");
                            objectsJs.AppendLine($"  {{ var pts={ptsCode}; var g=new THREE.BufferGeometry().setFromPoints(pts); var m=new THREE.LineBasicMaterial({{color:{OptColor()}}}); currentGroup.add(new THREE.Line(g,m)); }}");
                            break;
                        }

                        case "points":
                        {
                            var ptSize = GetOpt("size", "0.05");
                            var ptsCode = new System.Text.StringBuilder("[");
                            foreach (var p in posParams)
                            {
                                var coords = p.Split(',');
                                if (coords.Length >= 3)
                                    ptsCode.Append($"new THREE.Vector3({coords[0]},{coords[1]},{coords[2]}),");
                            }
                            ptsCode.Append("]");
                            objectsJs.AppendLine($"  {{ var pts={ptsCode}; pts.forEach(function(p){{ var g=new THREE.SphereGeometry({ptSize},8,8); var m=new THREE.MeshBasicMaterial({{color:{OptColor()}}}); var s=new THREE.Mesh(g,m); s.position.copy(p); currentGroup.add(s); }}); }}");
                            break;
                        }

                        case "grid":
                        {
                            var gSize = GetOpt("size", "10");
                            var gStep = GetOpt("step", "10");
                            var gColor = ColorHex(GetOpt("color", "#444444"));
                            objectsJs.AppendLine($"  {{ var gh=new THREE.GridHelper(parseInt({gSize}),parseInt({gStep}),{gColor},{gColor}); currentGroup.add(gh); }}");
                            hasGrid = true;
                            break;
                        }

                        case "axes":
                        {
                            var aSize = GetOpt("size", "3");
                            objectsJs.AppendLine($"  currentGroup.add(new THREE.AxesHelper({aSize}));");
                            hasAxes = true;
                            break;
                        }

                        case "group":
                        {
                            var tr = GetOpt("translate", "0,0,0").Split(',');
                            var tx = tr[0]; var ty = tr.Length > 1 ? tr[1] : "0"; var tz = tr.Length > 2 ? tr[2] : "0";
                            objectsJs.AppendLine($"  {{ var grp=new THREE.Group(); grp.position.set({tx},{ty},{tz}); {ApplyRotation(GetOpt("rotate"))} parentStack.push(currentGroup); currentGroup.add(grp); currentGroup=grp; }}");
                            groupDepth++;
                            break;
                        }

                        case "endgroup":
                        {
                            if (groupDepth > 0)
                            {
                                objectsJs.AppendLine("  { currentGroup=parentStack.pop(); }");
                                groupDepth--;
                            }
                            break;
                        }

                        case "text3d":
                        case "label":
                        {
                            // text3d x y z "texto" color:#fff size:0.5
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var txt = Pos(3, "Text");
                            var tSize = GetOpt("size", "0.3");
                            objectsJs.AppendLine($"  {{ var canvas=document.createElement('canvas'); var ctx=canvas.getContext('2d'); canvas.width=256; canvas.height=64; ctx.fillStyle='transparent'; ctx.fillRect(0,0,256,64); ctx.font='bold 32px Arial'; ctx.fillStyle='#{GetOpt("color", "#ffffff").Replace("#","").Replace("0x","")}'; ctx.textAlign='center'; ctx.fillText('{EscAttr(txt)}',128,40); var tex=new THREE.CanvasTexture(canvas); var spMat=new THREE.SpriteMaterial({{map:tex}}); var sp=new THREE.Sprite(spMat); sp.position.set({x},{y},{z}); sp.scale.set({tSize}*4,{tSize},1); currentGroup.add(sp); }}");
                            break;
                        }

                        // ===== AWATIF-STYLE STRUCTURAL COMMANDS =====

                        case "node":
                        {
                            // node x y z color:#00ff00 size:0.08
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var nSize = GetOpt("size", "0.08");
                            objectsJs.AppendLine($"  {{ var g=new THREE.SphereGeometry({nSize},12,12); var m=new THREE.MeshBasicMaterial({{color:{OptColor()}}}); var s=new THREE.Mesh(g,m); s.position.set({x},{y},{z}); currentGroup.add(s); }}");
                            break;
                        }

                        case "beam":
                        case "bar":
                        case "element":
                        {
                            // beam x1 y1 z1 x2 y2 z2 color:#aaa radius:0.05
                            // or beam x1,y1,z1 x2,y2,z2
                            var r = GetOpt("radius", GetOpt("r", null));
                            string bx1, by1, bz1, bx2, by2, bz2;

                            if (posParams.Count >= 6)
                            {
                                bx1 = Pos(0); by1 = Pos(1); bz1 = Pos(2);
                                bx2 = Pos(3); by2 = Pos(4); bz2 = Pos(5);
                            }
                            else if (posParams.Count >= 2)
                            {
                                var c1 = posParams[0].Split(','); var c2 = posParams[1].Split(',');
                                bx1 = c1[0]; by1 = c1.Length > 1 ? c1[1] : "0"; bz1 = c1.Length > 2 ? c1[2] : "0";
                                bx2 = c2[0]; by2 = c2.Length > 1 ? c2[1] : "0"; bz2 = c2.Length > 2 ? c2[2] : "0";
                            }
                            else break;

                            if (r != null)
                            {
                                // Cylinder between two points (3D beam)
                                objectsJs.AppendLine($"  {{ var p1=new THREE.Vector3({bx1},{by1},{bz1}); var p2=new THREE.Vector3({bx2},{by2},{bz2}); var dir=new THREE.Vector3().subVectors(p2,p1); var len=dir.length(); var mid=new THREE.Vector3().addVectors(p1,p2).multiplyScalar(0.5); var g=new THREE.CylinderGeometry({r},{r},len,12); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},metalness:0.3,roughness:0.6}}); var mesh=new THREE.Mesh(g,m); mesh.position.copy(mid); var ax=new THREE.Vector3(0,1,0); var d=dir.clone().normalize(); var q=new THREE.Quaternion().setFromUnitVectors(ax,d); mesh.setRotationFromQuaternion(q); mesh.castShadow=true; currentGroup.add(mesh); }}");
                            }
                            else
                            {
                                // Line between two points (wireframe)
                                objectsJs.AppendLine($"  {{ var pts=[new THREE.Vector3({bx1},{by1},{bz1}),new THREE.Vector3({bx2},{by2},{bz2})]; var g=new THREE.BufferGeometry().setFromPoints(pts); var m=new THREE.LineBasicMaterial({{color:{OptColor()}}}); currentGroup.add(new THREE.Line(g,m)); }}");
                            }
                            break;
                        }

                        case "support":
                        {
                            // support x y z type:fixed color:#9b2226 size:0.15
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var sSize = GetOpt("size", "0.15");
                            var sType = GetOpt("type", "fixed").ToLower();
                            var sColor = ColorHex(GetOpt("color", "#9b2226"));

                            if (sType == "pin" || sType == "pinned")
                            {
                                // Triangle/pyramid (pinned support)
                                objectsJs.AppendLine($"  {{ var g=new THREE.ConeGeometry({sSize},{sSize}*1.5,4); var m=new THREE.MeshStandardMaterial({{color:{sColor}}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y}-parseFloat({sSize})*0.75,{z}); mesh.rotation.y=Math.PI/4; currentGroup.add(mesh); }}");
                            }
                            else if (sType == "roller")
                            {
                                // Sphere (roller support)
                                objectsJs.AppendLine($"  {{ var g=new THREE.SphereGeometry({sSize},16,16); var m=new THREE.MeshStandardMaterial({{color:{sColor}}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y}-parseFloat({sSize}),{z}); currentGroup.add(mesh); }}");
                            }
                            else
                            {
                                // Cube (fixed support - Awatif style)
                                objectsJs.AppendLine($"  {{ var g=new THREE.BoxGeometry({sSize},{sSize},{sSize}); var m=new THREE.MeshStandardMaterial({{color:{sColor}}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y}-parseFloat({sSize})*0.5,{z}); currentGroup.add(mesh); }}");
                            }
                            break;
                        }

                        case "load":
                        case "force":
                        {
                            // load x y z fx fy fz color:#ee9b00 scale:1
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var fx = Pos(3, "0"); var fy = Pos(4, "-1"); var fz = Pos(5, "0");
                            var lScale = GetOpt("scale", "1");
                            var lColor = ColorHex(GetOpt("color", "#ee9b00"));
                            objectsJs.AppendLine($"  {{ var dir=new THREE.Vector3({fx},{fy},{fz}).normalize(); var orig=new THREE.Vector3({x},{y},{z}); var len=new THREE.Vector3({fx},{fy},{fz}).length()*{lScale}; var ah=new THREE.ArrowHelper(dir,orig,len>0?len:1,{lColor},0.3,0.15); currentGroup.add(ah); }}");
                            break;
                        }

                        case "moment":
                        {
                            // moment x y z axis:z value:1 color:#ee9b00
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var mColor = ColorHex(GetOpt("color", "#ee9b00"));
                            var mRadius = GetOpt("radius", "0.3");
                            objectsJs.AppendLine($"  {{ var g=new THREE.TorusGeometry({mRadius},0.03,8,32,Math.PI*1.5); var m=new THREE.MeshBasicMaterial({{color:{mColor}}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y},{z}); {ApplyRotation(GetOpt("rotation"))} currentGroup.add(mesh); var aDir=new THREE.Vector3(1,0,0); var aOrig=new THREE.Vector3(parseFloat({x})+parseFloat({mRadius}),{y},{z}); var ah=new THREE.ArrowHelper(aDir,aOrig,0.15,{mColor},0.12,0.08); currentGroup.add(ah); }}");
                            break;
                        }

                        case "triangle":
                        case "tri":
                        {
                            // triangle x1,y1,z1 x2,y2,z2 x3,y3,z3 color:#005f73 opacity:0.7
                            if (posParams.Count >= 3)
                            {
                                var c1 = posParams[0].Split(','); var c2 = posParams[1].Split(','); var c3 = posParams[2].Split(',');
                                var op = GetOpt("opacity", "0.7");
                                objectsJs.AppendLine($"  {{ var g=new THREE.BufferGeometry(); var verts=new Float32Array([{c1[0]},{(c1.Length>1?c1[1]:"0")},{(c1.Length>2?c1[2]:"0")},{c2[0]},{(c2.Length>1?c2[1]:"0")},{(c2.Length>2?c2[2]:"0")},{c3[0]},{(c3.Length>1?c3[1]:"0")},{(c3.Length>2?c3[2]:"0")}]); g.setAttribute('position',new THREE.BufferAttribute(verts,3)); g.computeVertexNormals(); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},side:THREE.DoubleSide,opacity:{op},transparent:true}}); var mesh=new THREE.Mesh(g,m); mesh.renderOrder=-1; currentGroup.add(mesh); }}");
                            }
                            break;
                        }

                        case "quad":
                        {
                            // quad x1,y1,z1 x2,y2,z2 x3,y3,z3 x4,y4,z4 color:#005f73 opacity:0.7
                            if (posParams.Count >= 4)
                            {
                                var c1 = posParams[0].Split(','); var c2 = posParams[1].Split(',');
                                var c3 = posParams[2].Split(','); var c4 = posParams[3].Split(',');
                                string V(string[] c, int i) => i < c.Length ? c[i] : "0";
                                var op = GetOpt("opacity", "0.7");
                                // Two triangles: 1-2-3 and 1-3-4
                                objectsJs.AppendLine($"  {{ var g=new THREE.BufferGeometry(); var verts=new Float32Array([{c1[0]},{V(c1,1)},{V(c1,2)},{c2[0]},{V(c2,1)},{V(c2,2)},{c3[0]},{V(c3,1)},{V(c3,2)},{c1[0]},{V(c1,1)},{V(c1,2)},{c3[0]},{V(c3,1)},{V(c3,2)},{c4[0]},{V(c4,1)},{V(c4,2)}]); g.setAttribute('position',new THREE.BufferAttribute(verts,3)); g.computeVertexNormals(); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},side:THREE.DoubleSide,opacity:{op},transparent:true}}); var mesh=new THREE.Mesh(g,m); mesh.renderOrder=-1; currentGroup.add(mesh); }}");
                            }
                            break;
                        }

                        case "arrow":
                        {
                            // arrow x y z dx dy dz color:#ee9b00 length:1
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var dx = Pos(3, "0"); var dy = Pos(4, "1"); var dz = Pos(5, "0");
                            var aLen = GetOpt("length", "1");
                            var aColor = ColorHex(GetOpt("color", "#ee9b00"));
                            objectsJs.AppendLine($"  {{ var dir=new THREE.Vector3({dx},{dy},{dz}).normalize(); var orig=new THREE.Vector3({x},{y},{z}); var ah=new THREE.ArrowHelper(dir,orig,{aLen},{aColor},0.2,0.1); currentGroup.add(ah); }}");
                            break;
                        }

                        case "localaxes":
                        case "orientation":
                        {
                            // localaxes x y z size:0.5
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var aSize = GetOpt("size", "0.5");
                            objectsJs.AppendLine($"  {{ var orig=new THREE.Vector3({x},{y},{z}); currentGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1,0,0),orig,{aSize},0xff0000,0.15,0.08)); currentGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0,1,0),orig,{aSize},0x00ff00,0.15,0.08)); currentGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0,0,1),orig,{aSize},0x0000ff,0.15,0.08)); }}");
                            break;
                        }

                        case "colorbar":
                        case "legend":
                        {
                            // colorbar min max label:"Deflexion (mm)" colors:blue,cyan,green,yellow,red
                            var minVal = Pos(0, "0"); var maxVal = Pos(1, "1");
                            var cbLabel = Pos(2, "Value");
                            var cbColors = GetOpt("colors", "0x0000ff,0x00ffff,0x00ff00,0xffff00,0xff0000");
                            objectsJs.AppendLine($"  {{ var cbDiv=document.createElement('div'); cbDiv.style.cssText='position:absolute;right:10px;top:10px;background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:6px;color:#fff;font:11px Arial;'; cbDiv.innerHTML='<div style=\"text-align:center;margin-bottom:4px;font-weight:bold\">{EscAttr(cbLabel)}</div>'; var colors=[{cbColors}]; var n=8; for(var ci=n;ci>=0;ci--){{ var t=ci/n; var val=(parseFloat({minVal})+(parseFloat({maxVal})-parseFloat({minVal}))*t).toFixed(3); var cIdx=Math.min(Math.floor(t*(colors.length-1)),colors.length-2); var ct=t*(colors.length-1)-cIdx; var c1=new THREE.Color(colors[cIdx]); var c2=new THREE.Color(colors[cIdx+1]); var c=c1.clone().lerp(c2,ct); cbDiv.innerHTML+='<div style=\"display:flex;align-items:center;gap:6px\"><div style=\"width:20px;height:12px;background:#'+c.getHexString()+'\"></div><span>'+val+'</span></div>'; }} container.style.position='relative'; container.appendChild(cbDiv); }}");
                            break;
                        }

                        case "mesh":
                        {
                            // mesh triangle [wireframe:true] [nodes:true] [boundary:true] [labels:true]
                            // mesh triangle color:rainbow|flat fill:#4488cc stroke:#224466
                            var meshType = Pos(0, "triangle").ToLower();
                            if (meshType == "triangle")
                            {
                                var ic = System.Globalization.CultureInfo.InvariantCulture;
                                TriangleMeshData meshData = null;
                                // Try to consume from queue (ordered, supports multiple triangle+three pairs)
                                if (variables != null && variables.ContainsKey("_triangle_mesh_queue") &&
                                    variables["_triangle_mesh_queue"] is List<TriangleMeshData> queue && queue.Count > 0)
                                {
                                    meshData = queue[0];
                                    queue.RemoveAt(0);
                                }
                                // Fallback to single mesh
                                else if (variables != null && variables.ContainsKey("_triangle_mesh") && variables["_triangle_mesh"] is TriangleMeshData tmd)
                                    meshData = tmd;
                                else if (_exportedVariables.ContainsKey("_triangle_mesh") && _exportedVariables["_triangle_mesh"] is TriangleMeshData tmd2)
                                    meshData = tmd2;

                                if (meshData == null || meshData.Nodes.Count == 0)
                                {
                                    objectsJs.AppendLine("  // mesh triangle: No mesh data found. Run @{triangle} block first.");
                                    break;
                                }

                                var mNodes = meshData.Nodes;
                                var mElements = meshData.Elements;
                                var mSegments = meshData.Segments;
                                var mNodeMarkers = meshData.NodeMarkers;
                                int mInputCount = meshData.InputVertexCount;

                                // Options
                                var colorMode = GetOpt("color", "rainbow"); // rainbow | flat
                                var mFill = GetOpt("fill", "#4488cc");
                                var mStroke = GetOpt("stroke", "#224466");
                                var mNodeColor = GetOpt("nodecolor", "#dd3333");
                                var mBndColor = GetOpt("boundarycolor", "#112266");
                                bool mShowWireframe = GetOpt("wireframe", "true") != "false";
                                bool mShowNodes = GetOpt("nodes", "true") != "false";
                                bool mShowBoundary = GetOpt("boundary", "true") != "false";
                                bool mShowLabels = GetOpt("labels", "false") == "true";
                                var mOpacity = GetOpt("opacity", "1");
                                var mMetalness = GetOpt("metalness", "0.1");
                                var mRoughness = GetOpt("roughness", "0.8");

                                // Build JSON data arrays
                                var nodesJson = new System.Text.StringBuilder("[");
                                for (int ni = 0; ni < mNodes.Count; ni++)
                                {
                                    if (ni > 0) nodesJson.Append(",");
                                    nodesJson.Append($"[{mNodes[ni][0].ToString(ic)},{mNodes[ni][1].ToString(ic)}]");
                                }
                                nodesJson.Append("]");

                                var elemsJson = new System.Text.StringBuilder("[");
                                for (int ei = 0; ei < mElements.Count; ei++)
                                {
                                    if (ei > 0) elemsJson.Append(",");
                                    elemsJson.Append($"[{mElements[ei][0]},{mElements[ei][1]},{mElements[ei][2]}]");
                                }
                                elemsJson.Append("]");

                                var segsJson = new System.Text.StringBuilder("[");
                                for (int si = 0; si < mSegments.Count; si++)
                                {
                                    if (si > 0) segsJson.Append(",");
                                    segsJson.Append($"[{mSegments[si][0]},{mSegments[si][1]}]");
                                }
                                segsJson.Append("]");

                                var markersJson = new System.Text.StringBuilder("[");
                                for (int mi = 0; mi < mNodeMarkers.Count; mi++)
                                {
                                    if (mi > 0) markersJson.Append(",");
                                    markersJson.Append(mNodeMarkers[mi].ToString());
                                }
                                markersJson.Append("]");

                                // Calculate bounding box for camera
                                double mMinX = double.MaxValue, mMinY = double.MaxValue;
                                double mMaxX = double.MinValue, mMaxY = double.MinValue;
                                foreach (var n in mNodes)
                                {
                                    if (n[0] < mMinX) mMinX = n[0]; if (n[0] > mMaxX) mMaxX = n[0];
                                    if (n[1] < mMinY) mMinY = n[1]; if (n[1] > mMaxY) mMaxY = n[1];
                                }
                                double mCx = (mMinX + mMaxX) / 2, mCy = (mMinY + mMaxY) / 2;
                                double mRangeX = mMaxX - mMinX, mRangeY = mMaxY - mMinY;
                                double mCamDist = Math.Max(mRangeX, mRangeY) * 1.5;

                                // Auto-set camera to view mesh from above-angle
                                cameraPos = $"{mCx.ToString(ic)},{mCamDist.ToString(ic)},{mCy.ToString(ic)}";
                                cameraLook = $"{mCx.ToString(ic)},0,{mCy.ToString(ic)}";
                                bgColor = "0xf0f0f0";

                                // Inject mesh data and build geometry
                                objectsJs.AppendLine($"  // === mesh triangle: {mNodes.Count} nodes, {mElements.Count} elements ===");
                                objectsJs.AppendLine($"  var triNodes = {nodesJson};");
                                objectsJs.AppendLine($"  var triElems = {elemsJson};");
                                objectsJs.AppendLine($"  var triSegs = {segsJson};");
                                objectsJs.AppendLine($"  var triMarkers = {markersJson};");
                                objectsJs.AppendLine($"  var triInputCount = {mInputCount};");

                                // Build face geometry with color mapping
                                objectsJs.AppendLine(@"  {
    const positions = [];
    const colors = [];
    const areas = [];
    for (let i = 0; i < triElems.length; i++) {
      const [a,b,c] = triElems[i];
      const ax=triNodes[a][0], ay=triNodes[a][1];
      const bx=triNodes[b][0], by=triNodes[b][1];
      const cx2=triNodes[c][0], cy2=triNodes[c][1];
      areas.push(Math.abs((bx-ax)*(cy2-ay)-(cx2-ax)*(by-ay))/2);
    }
    const aMin = Math.min(...areas), aMax = Math.max(...areas);");

                                if (colorMode == "rainbow")
                                {
                                    objectsJs.AppendLine(@"
    function rainbow(t) {
      t = Math.max(0, Math.min(1, t));
      return new THREE.Color(
        Math.max(0,Math.min(1, 1.5-Math.abs(t-0.0)*4)),
        Math.max(0,Math.min(1, 1.5-Math.abs(t-0.5)*4)),
        Math.max(0,Math.min(1, 1.5-Math.abs(t-1.0)*4))
      );
    }
    for (let i = 0; i < triElems.length; i++) {
      const [a,b,c] = triElems[i];
      positions.push(triNodes[a][0],0,triNodes[a][1]);
      positions.push(triNodes[b][0],0,triNodes[b][1]);
      positions.push(triNodes[c][0],0,triNodes[c][1]);
      const t = aMax>aMin ? (areas[i]-aMin)/(aMax-aMin) : 0.5;
      const col = rainbow(t);
      const d = 0.75;
      colors.push(col.r*d,col.g*d,col.b*d);
      colors.push(col.r*d,col.g*d,col.b*d);
      colors.push(col.r*d,col.g*d,col.b*d);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({vertexColors:true, side:THREE.DoubleSide, metalness:" + mMetalness + @", roughness:" + mRoughness + @", flatShading:true});
    currentGroup.add(new THREE.Mesh(geom, mat));");
                                }
                                else // flat color
                                {
                                    objectsJs.AppendLine($@"
    for (let i = 0; i < triElems.length; i++) {{
      const [a,b,c] = triElems[i];
      positions.push(triNodes[a][0],0,triNodes[a][1]);
      positions.push(triNodes[b][0],0,triNodes[b][1]);
      positions.push(triNodes[c][0],0,triNodes[c][1]);
    }}
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({{color:'{mFill}', side:THREE.DoubleSide, metalness:{mMetalness}, roughness:{mRoughness}, flatShading:true, opacity:{mOpacity}, transparent:{mOpacity}!=='1'?true:false}});
    currentGroup.add(new THREE.Mesh(geom, mat));");
                                }

                                // Wireframe edges
                                if (mShowWireframe)
                                {
                                    objectsJs.AppendLine($@"
    // Wireframe
    const edgePos = [];
    for (let i = 0; i < triElems.length; i++) {{
      const [a,b,c] = triElems[i];
      const ax=triNodes[a][0],ay=triNodes[a][1];
      const bx=triNodes[b][0],by=triNodes[b][1];
      const cx2=triNodes[c][0],cy2=triNodes[c][1];
      edgePos.push(ax,0.001,ay, bx,0.001,by);
      edgePos.push(bx,0.001,by, cx2,0.001,cy2);
      edgePos.push(cx2,0.001,cy2, ax,0.001,ay);
    }}
    const eGeom = new THREE.BufferGeometry();
    eGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
    currentGroup.add(new THREE.LineSegments(eGeom, new THREE.LineBasicMaterial({{color:'{mStroke}', linewidth:1, transparent:true, opacity:0.5}})));");
                                }

                                // Boundary segments
                                if (mShowBoundary && mSegments.Count > 0)
                                {
                                    objectsJs.AppendLine($@"
    // Boundary segments
    const bndPos = [];
    for (let i = 0; i < triSegs.length; i++) {{
      const [a,b] = triSegs[i];
      bndPos.push(triNodes[a][0],0.002,triNodes[a][1]);
      bndPos.push(triNodes[b][0],0.002,triNodes[b][1]);
    }}
    const bGeom = new THREE.BufferGeometry();
    bGeom.setAttribute('position', new THREE.Float32BufferAttribute(bndPos, 3));
    currentGroup.add(new THREE.LineSegments(bGeom, new THREE.LineBasicMaterial({{color:'{mBndColor}', linewidth:2}})));");
                                }

                                // Nodes
                                if (mShowNodes)
                                {
                                    double nodeSize = Math.Max(mRangeX, mRangeY) * 0.012;
                                    objectsJs.AppendLine($@"
    // Nodes
    const nGeo = new THREE.SphereGeometry({nodeSize.ToString(ic)}, 8, 8);
    const inputMat = new THREE.MeshStandardMaterial({{color:'{mNodeColor}'}});
    const steinerMat = new THREE.MeshStandardMaterial({{color:'#888888'}});
    const bndNodeMat = new THREE.MeshStandardMaterial({{color:'#cc6600'}});
    for (let i = 0; i < triNodes.length; i++) {{
      const isInput = i < triInputCount;
      const isBnd = triMarkers[i] !== 0;
      const mat = isInput ? inputMat : (isBnd ? bndNodeMat : steinerMat);
      const sp = new THREE.Mesh(nGeo, mat);
      sp.position.set(triNodes[i][0], 0.003, triNodes[i][1]);
      if (isInput) sp.scale.setScalar(1.4);
      currentGroup.add(sp);
    }}");
                                }

                                // Labels
                                if (mShowLabels)
                                {
                                    objectsJs.AppendLine(@"
    // Node labels
    function makeTriLabel(text, x, z) {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(0,0,64,32);
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.fillText(text, 32, 22);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: true });
      const sp = new THREE.Sprite(mat);
      sp.position.set(x, 0.15, z);
      sp.scale.set(0.3, 0.15, 1);
      return sp;
    }
    for (let i = 0; i < triNodes.length; i++) {
      currentGroup.add(makeTriLabel(i.toString(), triNodes[i][0]+0.05, triNodes[i][1]+0.05));
    }");
                                }

                                // Color legend for rainbow mode
                                if (colorMode == "rainbow")
                                {
                                    objectsJs.AppendLine(@"
    // Area color legend
    const lgd = document.createElement('div');
    lgd.style.cssText = 'position:absolute;right:10px;top:10px;z-index:10;background:rgba(255,255,255,0.85);padding:6px 8px;border-radius:4px;font-family:monospace;font-size:10px;';
    lgd.innerHTML = '<div style=""font-weight:bold;margin-bottom:3px;"">Area</div>' +
      '<div style=""display:flex;align-items:center;gap:4px;"">' +
      '<span>min</span>' +
      '<div style=""width:80px;height:12px;background:linear-gradient(to right,rgb(255,0,0),rgb(255,255,0),rgb(0,255,0),rgb(0,255,255),rgb(0,0,255));border:1px solid #ccc;border-radius:2px;""></div>' +
      '<span>max</span></div>';
    container.style.position='relative';
    container.appendChild(lgd);");
                                }

                                // Stats overlay
                                objectsJs.AppendLine($@"
    // Stats
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'position:absolute;bottom:6px;left:10px;z-index:10;font-family:monospace;font-size:10px;color:#555;background:rgba(255,255,255,0.7);padding:2px 6px;border-radius:3px;';
    statsDiv.textContent = 'Nodes: {mNodes.Count} | Elements: {mElements.Count} | Segments: {mSegments.Count}';
    container.style.position='relative';
    container.appendChild(statsDiv);");

                                // Grid
                                double gridSize = Math.Max(mRangeX, mRangeY) * 2;
                                int gridDiv = (int)(gridSize);
                                if (gridDiv < 4) gridDiv = 4;
                                objectsJs.AppendLine($@"
    // Grid
    var triGrid = new THREE.GridHelper({gridSize.ToString(ic)}, {gridDiv}, 0xcccccc, 0xe8e8e8);
    triGrid.position.set({mCx.ToString(ic)}, -0.01, {mCy.ToString(ic)});
    currentGroup.add(triGrid);
  }}");
                            }
                            break;
                        }

                        // === NEW: Circular arc 3D with arrow (moment indicator) ===
                        case "carc3d":
                        {
                            // carc3d x y z r startAngle endAngle plane:XZ segments:32
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var arcR = GetOpt("r", Pos(3, "0.5"));
                            var arcStart = GetOpt("start", Pos(4, "0"));
                            var arcEnd = GetOpt("end", Pos(5, "270"));
                            var arcPlane = GetOpt("plane", "XZ").ToUpper();
                            var arcSeg = GetOpt("segments", "32");
                            var arcColor = ColorHex(GetOpt("color") ?? currentThreeColor);
                            // Generate arc points in the specified plane + arrowhead cone at end
                            objectsJs.AppendLine($"  {{ var pts=[]; var r=parseFloat({arcR}); var s=parseFloat({arcStart})*Math.PI/180; var e=parseFloat({arcEnd})*Math.PI/180; var n=parseInt({arcSeg}); for(var i=0;i<=n;i++){{ var a=s+(e-s)*i/n; var px,py,pz; if('{arcPlane}'==='XY'){{ px=r*Math.cos(a); py=r*Math.sin(a); pz=0; }} else if('{arcPlane}'==='YZ'){{ px=0; py=r*Math.cos(a); pz=r*Math.sin(a); }} else {{ px=r*Math.cos(a); py=0; pz=r*Math.sin(a); }} pts.push(new THREE.Vector3(parseFloat({x})+px,parseFloat({y})+py,parseFloat({z})+pz)); }} var g=new THREE.BufferGeometry().setFromPoints(pts); var m=new THREE.LineBasicMaterial({{color:{arcColor},linewidth:2}}); currentGroup.add(new THREE.Line(g,m)); var tip=pts[pts.length-1]; var prev=pts[pts.length-2]; var tDir=new THREE.Vector3().subVectors(tip,prev).normalize(); var ag=new THREE.ConeGeometry(0.06,0.18,8); var am=new THREE.MeshBasicMaterial({{color:{arcColor}}}); var aM=new THREE.Mesh(ag,am); aM.position.copy(tip); var up=new THREE.Vector3(0,1,0); var q=new THREE.Quaternion().setFromUnitVectors(up,tDir); aM.setRotationFromQuaternion(q); currentGroup.add(aM); }}");
                            break;
                        }

                        // === NEW: 3D Dimension line ===
                        case "dim3d":
                        {
                            // dim3d x1 y1 z1 x2 y2 z2 text:"5 m" offset:0.3
                            var x1 = Pos(0); var y1 = Pos(1); var z1 = Pos(2);
                            var x2 = Pos(3); var y2 = Pos(4); var z2 = Pos(5);
                            var dimText = Pos(6, "");
                            var dimOff = GetOpt("offset", "0.3");
                            var dimColor = ColorHex(GetOpt("color") ?? currentThreeColor);
                            // Line + two arrows pointing inward + text sprite
                            objectsJs.AppendLine($"  {{ var p1=new THREE.Vector3({x1},{y1},{z1}); var p2=new THREE.Vector3({x2},{y2},{z2}); var dir=new THREE.Vector3().subVectors(p2,p1); var len=dir.length(); var mid=new THREE.Vector3().addVectors(p1,p2).multiplyScalar(0.5); var d=dir.clone().normalize(); var pts=[p1,p2]; var g=new THREE.BufferGeometry().setFromPoints(pts); var m=new THREE.LineBasicMaterial({{color:{dimColor},linewidth:1}}); currentGroup.add(new THREE.Line(g,m)); currentGroup.add(new THREE.ArrowHelper(d,p1,len*0.15,{dimColor},0.12,0.06)); currentGroup.add(new THREE.ArrowHelper(d.clone().negate(),p2,len*0.15,{dimColor},0.12,0.06)); if('{EscAttr(dimText)}'.length>0){{ var canvas=document.createElement('canvas'); var ctx=canvas.getContext('2d'); canvas.width=256; canvas.height=64; ctx.font='bold 28px Arial'; ctx.fillStyle='#{GetOpt("color", currentThreeColor).Replace("#","").Replace("0x","")}'; ctx.textAlign='center'; ctx.fillText('{EscAttr(dimText)}',128,40); var tex=new THREE.CanvasTexture(canvas); var sp=new THREE.Sprite(new THREE.SpriteMaterial({{map:tex}})); sp.position.copy(mid); sp.position.y+=parseFloat({dimOff}); sp.scale.set(len*0.5,len*0.125,1); currentGroup.add(sp); }} }}");
                            break;
                        }

                        // === NEW: Labeled axes with ticks ===
                        case "axes_labeled":
                        case "axeslabeled":
                        {
                            // axes_labeled length:5 ticks:true labels:X,Y,Z
                            var aLen = GetOpt("length", GetOpt("size", "5"));
                            var labelsStr = GetOpt("labels", "X,Y,Z").Split(',');
                            var xLbl = labelsStr.Length > 0 ? labelsStr[0] : "X";
                            var yLbl = labelsStr.Length > 1 ? labelsStr[1] : "Y";
                            var zLbl = labelsStr.Length > 2 ? labelsStr[2] : "Z";
                            bool ticks = GetOpt("ticks", "true") != "false";
                            var tickStep = GetOpt("step", "1");
                            // 3 ArrowHelpers + text sprites for labels + optional tick marks
                            objectsJs.AppendLine($"  {{ var aL=parseFloat({aLen}); var orig=new THREE.Vector3(0,0,0); currentGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1,0,0),orig,aL,0xff3333,0.15,0.08)); currentGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0,1,0),orig,aL,0x33ff33,0.15,0.08)); currentGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0,0,1),orig,aL,0x3333ff,0.15,0.08)); function mkLbl(t,x,y,z,c){{ var cv=document.createElement('canvas'); cv.width=128;cv.height=48; var cx=cv.getContext('2d'); cx.font='bold 28px Arial'; cx.fillStyle=c; cx.textAlign='center'; cx.fillText(t,64,34); var tx=new THREE.CanvasTexture(cv); var sp=new THREE.Sprite(new THREE.SpriteMaterial({{map:tx}})); sp.position.set(x,y,z); sp.scale.set(0.6,0.2,1); return sp; }} currentGroup.add(mkLbl('{EscAttr(xLbl)}',aL+0.3,0,0,'#ff3333')); currentGroup.add(mkLbl('{EscAttr(yLbl)}',0,aL+0.3,0,'#33ff33')); currentGroup.add(mkLbl('{EscAttr(zLbl)}',0,0,aL+0.3,'#3333ff')); ");
                            if (ticks)
                            {
                                objectsJs.AppendLine($"  var ts=parseFloat({tickStep}); for(var ti=ts;ti<=aL;ti+=ts){{ var tg=new THREE.SphereGeometry(0.02,4,4); var tmX=new THREE.Mesh(tg,new THREE.MeshBasicMaterial({{color:0xff3333}})); tmX.position.set(ti,0,0); currentGroup.add(tmX); var tmY=tmX.clone(); tmY.material=new THREE.MeshBasicMaterial({{color:0x33ff33}}); tmY.position.set(0,ti,0); currentGroup.add(tmY); var tmZ=tmX.clone(); tmZ.material=new THREE.MeshBasicMaterial({{color:0x3333ff}}); tmZ.position.set(0,0,ti); currentGroup.add(tmZ); currentGroup.add(mkLbl(ti.toFixed(0),ti,-0.2,0,'#666')); currentGroup.add(mkLbl(ti.toFixed(0),-0.2,ti,0,'#666')); currentGroup.add(mkLbl(ti.toFixed(0),0,-0.2,ti,'#666')); }}");
                            }
                            objectsJs.AppendLine("  }");
                            hasAxes = true;
                            break;
                        }

                        // === NEW: Plate/slab (flat box) ===
                        case "plate":
                        case "slab":
                        {
                            // plate x y z size:4,3 thickness:0.2
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var pSize = GetOpt("size", "4,3").Split(',');
                            var plW = pSize[0]; var plD = pSize.Length > 1 ? pSize[1] : pSize[0];
                            var plT = GetOpt("thickness", GetOpt("t", "0.2"));
                            var op = OptOpacity();
                            objectsJs.AppendLine($"  {{ var g=new THREE.BoxGeometry({plW},{plT},{plD}); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},opacity:{op},transparent:{op}!=='1'?true:false,side:THREE.DoubleSide}}); var mesh=new THREE.Mesh(g,m); mesh.position.set({x},{y},{z}); mesh.castShadow=true; mesh.receiveShadow=true; {ApplyRotation(GetOpt("rotation"))} currentGroup.add(mesh); }}");
                            break;
                        }

                        // === NEW: Tube between two points ===
                        case "tube":
                        case "pipe":
                        {
                            // tube x1 y1 z1 x2 y2 z2 radius:0.05
                            var x1 = Pos(0); var y1 = Pos(1); var z1 = Pos(2);
                            var x2 = Pos(3); var y2 = Pos(4); var z2 = Pos(5);
                            var tR = GetOpt("radius", GetOpt("r", "0.05"));
                            var tSeg = GetOpt("segments", "12");
                            objectsJs.AppendLine($"  {{ var p1=new THREE.Vector3({x1},{y1},{z1}); var p2=new THREE.Vector3({x2},{y2},{z2}); var dir=new THREE.Vector3().subVectors(p2,p1); var len=dir.length(); var mid=new THREE.Vector3().addVectors(p1,p2).multiplyScalar(0.5); var g=new THREE.CylinderGeometry({tR},{tR},len,{tSeg}); var m=new THREE.MeshStandardMaterial({{color:{OptColor()},metalness:0.3,roughness:0.6}}); var mesh=new THREE.Mesh(g,m); mesh.position.copy(mid); var ax=new THREE.Vector3(0,1,0); var d=dir.clone().normalize(); var q=new THREE.Quaternion().setFromUnitVectors(ax,d); mesh.setRotationFromQuaternion(q); mesh.castShadow=true; currentGroup.add(mesh); }}");
                            break;
                        }

                        // === NEW: Double arrow (rotation DOF) ===
                        case "darrow":
                        {
                            // darrow x y z dx dy dz length:1 — flecha doble para grados de libertad rotacionales
                            var x = Pos(0); var y = Pos(1); var z = Pos(2);
                            var dx = Pos(3, "0"); var dy = Pos(4, "1"); var dz = Pos(5, "0");
                            var daLen = GetOpt("length", "1");
                            var daColor = ColorHex(GetOpt("color") ?? currentThreeColor);
                            // Two arrows pointing in opposite directions from center
                            objectsJs.AppendLine($"  {{ var dir=new THREE.Vector3({dx},{dy},{dz}).normalize(); var orig=new THREE.Vector3({x},{y},{z}); var hLen=parseFloat({daLen})*0.5; var p1=orig.clone().sub(dir.clone().multiplyScalar(hLen)); currentGroup.add(new THREE.ArrowHelper(dir,p1,parseFloat({daLen}),{daColor},0.15,0.08)); currentGroup.add(new THREE.ArrowHelper(dir.clone().negate(),orig.clone().add(dir.clone().multiplyScalar(hLen)),parseFloat({daLen}),{daColor},0.15,0.08)); }}");
                            break;
                        }
                    }
                }

                // Default lights if none specified
                if (!hasAmbient)
                    lightsJs.Insert(0, "  scene.add(new THREE.AmbientLight(0x404040, 0.6));\n");
                if (!hasDirectional)
                    lightsJs.Insert(0, "  { var dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(5,10,7); dl.castShadow=true; scene.add(dl); }\n");

                // Build final HTML with embedded Three.js
                var sb = new System.Text.StringBuilder();
                sb.AppendLine($"<div id='{containerId}' style='width:{canvasW}px;height:{canvasH}px;margin:10px auto;border:1px solid #333;border-radius:6px;overflow:hidden;background:#1a1a2e;'></div>");
                // Import map is in the <head> of template.html - no need to emit here
                sb.AppendLine("<script type='module'>");
                sb.AppendLine("import * as THREE from 'three';");
                sb.AppendLine("import { OrbitControls } from 'three/addons/controls/OrbitControls.js';");
                sb.AppendLine("(function(){");
                sb.AppendLine($"  var container=document.getElementById('{containerId}');");
                sb.AppendLine($"  var scene=new THREE.Scene();");
                sb.AppendLine($"  scene.background=new THREE.Color({bgColor});");
                sb.AppendLine($"  var camera=new THREE.PerspectiveCamera({fov},{canvasW}/{canvasH},0.1,1000);");
                sb.AppendLine($"  var cp=[{cameraPos}]; camera.position.set(cp[0],cp[1],cp[2]);");
                sb.AppendLine($"  var cl=[{cameraLook}]; camera.lookAt(cl[0],cl[1],cl[2]);");
                sb.AppendLine($"  var renderer=new THREE.WebGLRenderer({{antialias:true}});");
                sb.AppendLine($"  renderer.setSize({canvasW},{canvasH});");
                sb.AppendLine("  renderer.shadowMap.enabled=true;");
                sb.AppendLine("  container.appendChild(renderer.domElement);");

                // Lights
                sb.Append(lightsJs);

                // Group system
                sb.AppendLine("  var parentStack=[];");
                sb.AppendLine("  var currentGroup=scene;");

                // Objects
                sb.Append(objectsJs);

                // Close remaining groups
                while (groupDepth > 0)
                {
                    sb.AppendLine("  currentGroup=parentStack.pop();");
                    groupDepth--;
                }

                // OrbitControls
                sb.AppendLine("  var controls=new OrbitControls(camera,renderer.domElement);");
                sb.AppendLine($"  controls.target.set(cl[0],cl[1],cl[2]);");
                sb.AppendLine("  controls.enableDamping=true;");
                sb.AppendLine("  controls.dampingFactor=0.05;");
                sb.AppendLine("  controls.update();");

                // Animation loop
                if (animCode.Length > 0)
                {
                    sb.AppendLine("  function animate(){");
                    sb.AppendLine("    requestAnimationFrame(animate);");
                    sb.AppendLine("    var t=performance.now()*0.001;");
                    sb.Append(animCode);
                    sb.AppendLine("    controls.update(); renderer.render(scene,camera);");
                    sb.AppendLine("  }");
                }
                else
                {
                    sb.AppendLine("  function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); }");
                }
                sb.AppendLine("  animate();");

                // Resize handler
                sb.AppendLine("  window.addEventListener('resize',function(){");
                sb.AppendLine($"    var w=container.clientWidth||{canvasW}; var h=container.clientHeight||{canvasH};");
                sb.AppendLine("    camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h);");
                sb.AppendLine("  });");

                sb.AppendLine("})();");
                sb.AppendLine("</script>");

                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<div style='color:red;'>Error in @{{three}}: {ex.Message}</div>";
            }
        }

        private string ApplyRotation(string rotation)
        {
            if (string.IsNullOrEmpty(rotation)) return "";
            var r = rotation.Split(',');
            var rx = r[0]; var ry = r.Length > 1 ? r[1] : "0"; var rz = r.Length > 2 ? r[2] : "0";
            return $"mesh.rotation.set({rx}*Math.PI/180,{ry}*Math.PI/180,{rz}*Math.PI/180);";
        }

        public string ProcessThreeBlockPublic(string content, string directive, Dictionary<string, object> variables)
        {
            return ProcessThreeBlock(content, directive, variables);
        }

        public string ProcessTriangleBlockPublic(string content, string directive, Dictionary<string, object> variables)
        {
            return ProcessTriangleBlock(content, directive, variables);
        }

        /// <summary>
        /// Process @{triangle} block - Shewchuk Delaunay triangulation.
        /// DSL syntax:
        ///   @{triangle 600 400}
        ///   # Define vertices
        ///   vertex 0 0
        ///   vertex 4 0
        ///   vertex 4 3
        ///   vertex 0 3
        ///   # Define segments (boundary edges, 0-indexed)
        ///   segment 0 1
        ///   segment 1 2
        ///   segment 2 3
        ///   segment 3 0
        ///   # Holes (point inside region to exclude)
        ///   hole 2 1.5
        ///   # Options
        ///   quality:30    (minimum angle)
        ///   area:0.5      (maximum element area)
        ///   # Visual options
        ///   fill:#e8f0fe stroke:#2255aa nodecolor:#ff4444
        ///   show:mesh,nodes,boundary,labels
        ///   @{end triangle}
        /// </summary>
        private string ProcessTriangleBlock(string content, string directive, Dictionary<string, object> variables)
        {
            // Ensure variables dict is not null
            if (variables == null) variables = new Dictionary<string, object>();

            // Parse SVG dimensions from directive
            int svgW = 600, svgH = 400;
            var dirParts = directive.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            if (dirParts.Length >= 3 && int.TryParse(dirParts[1], out int pw) && int.TryParse(dirParts[2], out int ph))
            { svgW = pw; svgH = ph; }
            else if (dirParts.Length >= 2 && int.TryParse(dirParts[1], out int pw2))
            { svgW = pw2; svgH = (int)(pw2 * 0.75); }

            var vertices = new List<double[]>();
            var segments = new List<int[]>();
            var holes = new List<double[]>();
            var regions = new List<double[]>();
            double qualityAngle = 20;
            double maxArea = -1;
            bool conformingDelaunay = false;
            string fillColor = "#e8f4fd";
            string strokeColor = "#2266aa";
            string nodeColor = "#cc3333";
            string boundaryColor = "#1144aa";
            double strokeWidth = 1;
            double nodeRadius = 3;
            bool showMesh = true;
            bool showNodes = true;
            bool showBoundary = true;
            bool showLabels = false;
            string title = "";
            string bgColor = "#ffffff";

            // Parse DSL lines
            var lines = content.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var rawLine in lines)
            {
                var line = rawLine.Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith("#")) continue;

                var tokens = SplitSvgLine(line);
                if (tokens.Count == 0) continue;

                var cmd = tokens[0].ToLowerInvariant();

                switch (cmd)
                {
                    case "vertex":
                    case "point":
                    case "node":
                    case "v":
                        if (tokens.Count >= 3 &&
                            double.TryParse(tokens[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double vx) &&
                            double.TryParse(tokens[2], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double vy))
                        {
                            vertices.Add(new[] { vx, vy });
                        }
                        break;

                    case "segment":
                    case "edge":
                    case "s":
                        if (tokens.Count >= 3 &&
                            int.TryParse(tokens[1], out int s1) &&
                            int.TryParse(tokens[2], out int s2))
                        {
                            int marker = 1;
                            if (tokens.Count >= 4 && int.TryParse(tokens[3], out int sm)) marker = sm;
                            segments.Add(new[] { s1, s2, marker });
                        }
                        break;

                    case "hole":
                        if (tokens.Count >= 3 &&
                            double.TryParse(tokens[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double hx) &&
                            double.TryParse(tokens[2], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double hy))
                        {
                            holes.Add(new[] { hx, hy });
                        }
                        break;

                    case "region":
                        if (tokens.Count >= 5 &&
                            double.TryParse(tokens[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double rx) &&
                            double.TryParse(tokens[2], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double ry) &&
                            double.TryParse(tokens[3], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double ra) &&
                            double.TryParse(tokens[4], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double rarea))
                        {
                            regions.Add(new[] { rx, ry, ra, rarea });
                        }
                        break;

                    case "polygon":
                    case "poly":
                        // polygon x1,y1 x2,y2 x3,y3 ... - auto-create vertices and segments
                        var polyVerts = new List<int>();
                        for (int pi = 1; pi < tokens.Count; pi++)
                        {
                            var tk = tokens[pi];
                            if (tk.Contains(":")) continue; // option
                            var coords = tk.Split(',');
                            if (coords.Length >= 2 &&
                                double.TryParse(coords[0], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double px) &&
                                double.TryParse(coords[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double py))
                            {
                                int idx = vertices.Count;
                                vertices.Add(new[] { px, py });
                                polyVerts.Add(idx);
                            }
                        }
                        // Auto-create closed segments
                        for (int pi = 0; pi < polyVerts.Count; pi++)
                        {
                            int next = (pi + 1) % polyVerts.Count;
                            segments.Add(new[] { polyVerts[pi], polyVerts[next], 1 });
                        }
                        break;

                    default:
                        // Parse key:value options from any line
                        foreach (var tk in tokens)
                        {
                            if (!tk.Contains(":")) continue;
                            var kv = tk.Split(new[] { ':' }, 2);
                            var key = kv[0].ToLowerInvariant();
                            var val = kv.Length > 1 ? kv[1] : "";
                            switch (key)
                            {
                                case "quality":
                                case "q":
                                    double.TryParse(val, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out qualityAngle);
                                    break;
                                case "area":
                                case "a":
                                    double.TryParse(val, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out maxArea);
                                    break;
                                case "fill":
                                    fillColor = val; break;
                                case "stroke":
                                    strokeColor = val; break;
                                case "nodecolor":
                                    nodeColor = val; break;
                                case "boundarycolor":
                                    boundaryColor = val; break;
                                case "width":
                                case "strokewidth":
                                    double.TryParse(val, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out strokeWidth);
                                    break;
                                case "noderadius":
                                    double.TryParse(val, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out nodeRadius);
                                    break;
                                case "show":
                                    showMesh = val.Contains("mesh");
                                    showNodes = val.Contains("node");
                                    showBoundary = val.Contains("bound") || val.Contains("segment");
                                    showLabels = val.Contains("label");
                                    break;
                                case "title":
                                    title = val; break;
                                case "background":
                                case "bg":
                                    bgColor = val; break;
                                case "delaunay":
                                    conformingDelaunay = val.ToLowerInvariant() != "false";
                                    break;
                            }
                        }
                        break;
                }

                // Also parse options from vertex/segment lines
                if (cmd == "vertex" || cmd == "point" || cmd == "node" || cmd == "v" ||
                    cmd == "segment" || cmd == "edge" || cmd == "s" || cmd == "hole" || cmd == "region")
                {
                    foreach (var tk in tokens)
                    {
                        if (!tk.Contains(":")) continue;
                        var kv = tk.Split(new[] { ':' }, 2);
                        var key = kv[0].ToLowerInvariant();
                        var val = kv.Length > 1 ? kv[1] : "";
                        switch (key)
                        {
                            case "quality": case "q":
                                double.TryParse(val, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out qualityAngle);
                                break;
                            case "area": case "a":
                                double.TryParse(val, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out maxArea);
                                break;
                            case "fill": fillColor = val; break;
                            case "stroke": strokeColor = val; break;
                            case "title": title = val; break;
                            case "background": case "bg": bgColor = val; break;
                            case "show":
                                showMesh = val.Contains("mesh"); showNodes = val.Contains("node");
                                showBoundary = val.Contains("bound") || val.Contains("segment");
                                showLabels = val.Contains("label"); break;
                        }
                    }
                }
            }

            // Also check title with regex for quoted titles
            var titleMatch = System.Text.RegularExpressions.Regex.Match(content, @"title:""([^""]+)""");
            if (titleMatch.Success) title = titleMatch.Groups[1].Value;

            if (vertices.Count < 3)
                return "<div style='color:red;padding:10px;border:1px solid red;'>Error: @{triangle} necesita al menos 3 vertices</div>";

            // If no segments defined, auto-create convex hull segments
            if (segments.Count == 0)
            {
                for (int i = 0; i < vertices.Count; i++)
                {
                    int next = (i + 1) % vertices.Count;
                    segments.Add(new[] { i, next, 1 });
                }
            }

            // Build .poly format input for triangle64.exe
            var polyInput = new System.Text.StringBuilder();
            polyInput.AppendLine($"{vertices.Count} 2 0 0");
            for (int i = 0; i < vertices.Count; i++)
            {
                polyInput.AppendLine($"{i} {vertices[i][0].ToString(System.Globalization.CultureInfo.InvariantCulture)} {vertices[i][1].ToString(System.Globalization.CultureInfo.InvariantCulture)}");
            }
            polyInput.AppendLine($"{segments.Count} 1");
            for (int i = 0; i < segments.Count; i++)
            {
                polyInput.AppendLine($"{i} {segments[i][0]} {segments[i][1]} {segments[i][2]}");
            }
            polyInput.AppendLine($"{holes.Count}");
            for (int i = 0; i < holes.Count; i++)
            {
                polyInput.AppendLine($"{i} {holes[i][0].ToString(System.Globalization.CultureInfo.InvariantCulture)} {holes[i][1].ToString(System.Globalization.CultureInfo.InvariantCulture)}");
            }
            if (regions.Count > 0)
            {
                polyInput.AppendLine($"{regions.Count}");
                for (int i = 0; i < regions.Count; i++)
                {
                    polyInput.AppendLine($"{i} {regions[i][0].ToString(System.Globalization.CultureInfo.InvariantCulture)} {regions[i][1].ToString(System.Globalization.CultureInfo.InvariantCulture)} {regions[i][2].ToString(System.Globalization.CultureInfo.InvariantCulture)} {regions[i][3].ToString(System.Globalization.CultureInfo.InvariantCulture)}");
                }
            }

            // Find triangle64.exe
            string triangleExe = FindTriangleExe();
            if (triangleExe == null)
                return "<div style='color:red;padding:10px;border:1px solid red;'>Error: triangle64.exe no encontrado. Copielo a Hekatan.Cli/tools/triangle/</div>";

            // Build arguments
            var args = new System.Text.StringBuilder("--stdin -p");
            if (qualityAngle > 0) args.Append($" -q{qualityAngle.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
            if (maxArea > 0) args.Append($" -a{maxArea.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
            if (conformingDelaunay) args.Append(" -D");
            args.Append(" -e"); // always output edges for visualization

            // Execute triangle64.exe
            string output;
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = triangleExe,
                    Arguments = args.ToString(),
                    UseShellExecute = false,
                    RedirectStandardInput = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = System.Text.Encoding.UTF8
                };

                using (var proc = System.Diagnostics.Process.Start(psi))
                {
                    proc.StandardInput.Write(polyInput.ToString());
                    proc.StandardInput.Close();
                    output = proc.StandardOutput.ReadToEnd();
                    string errors = proc.StandardError.ReadToEnd();
                    proc.WaitForExit(10000);

                    if (proc.ExitCode != 0)
                        return $"<div style='color:red;padding:10px;border:1px solid red;'>Error triangle64: {System.Web.HttpUtility.HtmlEncode(errors)}</div>";
                }
            }
            catch (Exception ex)
            {
                return $"<div style='color:red;padding:10px;border:1px solid red;'>Error ejecutando triangle64: {System.Web.HttpUtility.HtmlEncode(ex.Message)}</div>";
            }

            // Parse triangle output
            var outNodes = new List<double[]>();
            var outNodeMarkers = new List<int>();
            var outElements = new List<int[]>();
            var outEdges = new List<int[]>();
            var outEdgeMarkers = new List<int>();
            var outSegments = new List<int[]>();
            var outSegMarkers = new List<int>();

            string currentSection = "";
            foreach (var rawLine in output.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var line = rawLine.Trim();
                if (line.StartsWith("NODES")) { currentSection = "nodes"; continue; }
                if (line.StartsWith("ELEMENTS")) { currentSection = "elements"; continue; }
                if (line.StartsWith("EDGES")) { currentSection = "edges"; continue; }
                if (line.StartsWith("SEGMENTS")) { currentSection = "segments"; continue; }

                var parts = line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);

                if (currentSection == "nodes" && parts.Length >= 4)
                {
                    if (double.TryParse(parts[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double nx) &&
                        double.TryParse(parts[2], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double ny))
                    {
                        outNodes.Add(new[] { nx, ny });
                        int.TryParse(parts[3], out int nm);
                        outNodeMarkers.Add(nm);
                    }
                }
                else if (currentSection == "elements" && parts.Length >= 4)
                {
                    if (int.TryParse(parts[1], out int e1) &&
                        int.TryParse(parts[2], out int e2) &&
                        int.TryParse(parts[3], out int e3))
                    {
                        outElements.Add(new[] { e1, e2, e3 });
                    }
                }
                else if (currentSection == "edges" && parts.Length >= 4)
                {
                    if (int.TryParse(parts[1], out int ed1) &&
                        int.TryParse(parts[2], out int ed2))
                    {
                        outEdges.Add(new[] { ed1, ed2 });
                        int.TryParse(parts[3], out int em);
                        outEdgeMarkers.Add(em);
                    }
                }
                else if (currentSection == "segments" && parts.Length >= 4)
                {
                    if (int.TryParse(parts[1], out int sg1) &&
                        int.TryParse(parts[2], out int sg2))
                    {
                        outSegments.Add(new[] { sg1, sg2 });
                        int.TryParse(parts[3], out int sgm);
                        outSegMarkers.Add(sgm);
                    }
                }
            }

            if (outNodes.Count == 0 || outElements.Count == 0)
                return $"<div style='color:red;padding:10px;border:1px solid red;'>Error: triangle64 no genero malla. Output: {System.Web.HttpUtility.HtmlEncode(output.Substring(0, Math.Min(500, output.Length)))}</div>";

            // Export mesh data as shared variables for use in @{three} / @{svg}
            var meshData = new TriangleMeshData
            {
                Nodes = outNodes,
                NodeMarkers = outNodeMarkers,
                Elements = outElements,
                Segments = outSegments,
                SegmentMarkers = outSegMarkers,
                Edges = outEdges,
                EdgeMarkers = outEdgeMarkers,
                InputVertexCount = vertices.Count,
                QualityAngle = qualityAngle,
                MaxArea = maxArea
            };
            // Store in variables dict for subsequent blocks (queue for multiple meshes)
            variables["_triangle_mesh"] = meshData;
            _exportedVariables["_triangle_mesh"] = meshData;
            // Also push to queue for ordered consumption by @{three} mesh triangle
            if (!variables.ContainsKey("_triangle_mesh_queue") || !(variables["_triangle_mesh_queue"] is List<TriangleMeshData>))
                variables["_triangle_mesh_queue"] = new List<TriangleMeshData>();
            ((List<TriangleMeshData>)variables["_triangle_mesh_queue"]).Add(meshData);
            // Also export scalar counts
            variables["tri_nNodes"] = (double)outNodes.Count;
            variables["tri_nElements"] = (double)outElements.Count;
            variables["tri_nSegments"] = (double)outSegments.Count;
            _exportedVariables["tri_nNodes"] = (double)outNodes.Count;
            _exportedVariables["tri_nElements"] = (double)outElements.Count;
            _exportedVariables["tri_nSegments"] = (double)outSegments.Count;
            // Export individual node coordinates
            for (int ni = 0; ni < outNodes.Count; ni++)
            {
                variables[$"tri_x_{ni}"] = outNodes[ni][0];
                variables[$"tri_y_{ni}"] = outNodes[ni][1];
                _exportedVariables[$"tri_x_{ni}"] = outNodes[ni][0];
                _exportedVariables[$"tri_y_{ni}"] = outNodes[ni][1];
            }
            // Export element connectivity
            for (int ei = 0; ei < outElements.Count; ei++)
            {
                variables[$"tri_e{ei}_0"] = (double)outElements[ei][0];
                variables[$"tri_e{ei}_1"] = (double)outElements[ei][1];
                variables[$"tri_e{ei}_2"] = (double)outElements[ei][2];
                _exportedVariables[$"tri_e{ei}_0"] = (double)outElements[ei][0];
                _exportedVariables[$"tri_e{ei}_1"] = (double)outElements[ei][1];
                _exportedVariables[$"tri_e{ei}_2"] = (double)outElements[ei][2];
            }

            // Output: data tables only (values, not graphics)
            return GenerateTriangleDataOutput(outNodes, outNodeMarkers, outElements,
                outSegments, outSegMarkers, title, qualityAngle, maxArea, vertices.Count);
        }

        /// <summary>
        /// Outputs triangle mesh as clean data tables (values only, no graphics).
        /// Variables exported: tri_nNodes, tri_nElements, tri_x_i, tri_y_i, tri_e{i}_0/1/2
        /// Use these in @{three} or @{svg} to visualize.
        /// </summary>
        private string GenerateTriangleDataOutput(
            List<double[]> nodes, List<int> nodeMarkers,
            List<int[]> elements, List<int[]> segs, List<int> segMarkers,
            string title, double qualityAngle, double maxArea, int inputCount)
        {
            var ic = System.Globalization.CultureInfo.InvariantCulture;
            var sb = new System.Text.StringBuilder();

            sb.AppendLine("<div style='font-family:\"Segoe UI\",Arial,sans-serif;font-size:12px;border:1px solid #ccc;border-radius:6px;padding:10px;background:#fafafa;max-width:700px;'>");

            // Header
            if (!string.IsNullOrEmpty(title))
                sb.AppendLine($"<div style='font-weight:bold;font-size:14px;margin-bottom:6px;color:#222;'>{System.Web.HttpUtility.HtmlEncode(title)}</div>");

            sb.AppendLine($"<div style='color:#555;margin-bottom:8px;'>Triangle (Shewchuk) | <b>{nodes.Count}</b> nodos | <b>{elements.Count}</b> elementos | <b>{segs.Count}</b> segmentos | q={qualityAngle.ToString(ic)}{(maxArea > 0 ? $" a={maxArea.ToString(ic)}" : "")}</div>");

            // Variables info
            sb.AppendLine("<div style='background:#eef6ff;border:1px solid #c0d8f0;border-radius:4px;padding:6px 8px;margin-bottom:8px;font-size:11px;color:#335;'>");
            sb.AppendLine("<b>Variables exportadas:</b> ");
            sb.AppendLine($"<code>tri_nNodes</code>={nodes.Count}, <code>tri_nElements</code>={elements.Count}, ");
            sb.AppendLine($"<code>tri_x_0..{nodes.Count - 1}</code>, <code>tri_y_0..{nodes.Count - 1}</code>, ");
            sb.AppendLine($"<code>tri_e0_0/1/2..tri_e{elements.Count - 1}_0/1/2</code>");
            sb.AppendLine("<br>Usar en <code>@{{three}}</code>: <code>mesh triangle</code> | en <code>@{{svg}}</code>: <code>mesh triangle</code>");
            sb.AppendLine("</div>");

            // Nodes table
            sb.AppendLine($"<details open><summary style='cursor:pointer;font-weight:bold;color:#333;'>Nodos ({nodes.Count})</summary>");
            sb.AppendLine("<table style='border-collapse:collapse;margin:4px 0;font-family:monospace;font-size:11px;'>");
            sb.AppendLine("<tr style='background:#e8e8e8;'><th style='border:1px solid #ccc;padding:2px 8px;'>i</th><th style='border:1px solid #ccc;padding:2px 8px;'>x</th><th style='border:1px solid #ccc;padding:2px 8px;'>y</th><th style='border:1px solid #ccc;padding:2px 8px;'>bnd</th></tr>");
            for (int i = 0; i < nodes.Count; i++)
            {
                int m = nodeMarkers.Count > i ? nodeMarkers[i] : 0;
                string bg = i < inputCount ? "background:#fff8e1;" : "";
                sb.AppendLine($"<tr style='{bg}'><td style='border:1px solid #ddd;padding:1px 8px;text-align:center;'>{i}</td><td style='border:1px solid #ddd;padding:1px 8px;text-align:right;'>{nodes[i][0].ToString("F6", ic)}</td><td style='border:1px solid #ddd;padding:1px 8px;text-align:right;'>{nodes[i][1].ToString("F6", ic)}</td><td style='border:1px solid #ddd;padding:1px 8px;text-align:center;'>{m}</td></tr>");
            }
            sb.AppendLine("</table></details>");

            // Elements table
            sb.AppendLine($"<details><summary style='cursor:pointer;font-weight:bold;color:#333;'>Elementos ({elements.Count})</summary>");
            sb.AppendLine("<table style='border-collapse:collapse;margin:4px 0;font-family:monospace;font-size:11px;'>");
            sb.AppendLine("<tr style='background:#e8e8e8;'><th style='border:1px solid #ccc;padding:2px 8px;'>i</th><th style='border:1px solid #ccc;padding:2px 8px;'>n1</th><th style='border:1px solid #ccc;padding:2px 8px;'>n2</th><th style='border:1px solid #ccc;padding:2px 8px;'>n3</th></tr>");
            for (int i = 0; i < elements.Count; i++)
            {
                sb.AppendLine($"<tr><td style='border:1px solid #ddd;padding:1px 8px;text-align:center;'>{i}</td><td style='border:1px solid #ddd;padding:1px 8px;text-align:center;'>{elements[i][0]}</td><td style='border:1px solid #ddd;padding:1px 8px;text-align:center;'>{elements[i][1]}</td><td style='border:1px solid #ddd;padding:1px 8px;text-align:center;'>{elements[i][2]}</td></tr>");
            }
            sb.AppendLine("</table></details>");

            // Segments table
            if (segs.Count > 0)
            {
                sb.AppendLine($"<details><summary style='cursor:pointer;font-weight:bold;color:#333;'>Segmentos ({segs.Count})</summary>");
                sb.AppendLine("<table style='border-collapse:collapse;margin:4px 0;font-family:monospace;font-size:11px;'>");
                sb.AppendLine("<tr style='background:#e8e8e8;'><th style='border:1px solid #ccc;padding:2px 8px;'>i</th><th style='border:1px solid #ccc;padding:2px 8px;'>n1</th><th style='border:1px solid #ccc;padding:2px 8px;'>n2</th></tr>");
                for (int i = 0; i < segs.Count; i++)
                {
                    sb.AppendLine($"<tr><td style='border:1px solid #ddd;padding:1px 8px;text-align:center;'>{i}</td><td style='border:1px solid #ddd;padding:1px 8px;text-align:center;'>{segs[i][0]}</td><td style='border:1px solid #ddd;padding:1px 8px;text-align:center;'>{segs[i][1]}</td></tr>");
                }
                sb.AppendLine("</table></details>");
            }

            sb.AppendLine("</div>");
            return sb.ToString();
        }

        private string FindTriangleExe()
        {
            // Search for triangle64.exe in multiple locations
            var candidates = new[]
            {
                System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tools", "triangle", "triangle64.exe"),
                System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "triangle64.exe"),
                System.IO.Path.Combine(System.IO.Directory.GetCurrentDirectory(), "tools", "triangle", "triangle64.exe"),
                System.IO.Path.Combine(System.IO.Directory.GetCurrentDirectory(), "triangle64.exe"),
            };

            // Also search relative to working directory upward
            var cwd = System.IO.Directory.GetCurrentDirectory();
            var extra = new List<string>
            {
                System.IO.Path.Combine(cwd, "triangle_shewchuk", "triangle64.exe"),
                System.IO.Path.Combine(cwd, "Hekatan.Cli", "tools", "triangle", "triangle64.exe"),
            };
            // Walk up directories looking for triangle_shewchuk/
            var dir = cwd;
            for (int walk = 0; walk < 5 && dir != null; walk++)
            {
                extra.Add(System.IO.Path.Combine(dir, "triangle_shewchuk", "triangle64.exe"));
                extra.Add(System.IO.Path.Combine(dir, "tools", "triangle", "triangle64.exe"));
                dir = System.IO.Path.GetDirectoryName(dir);
            }
            candidates = candidates.Concat(extra).ToArray();

            foreach (var path in candidates)
            {
                if (System.IO.File.Exists(path)) return path;
            }

            // Try PATH
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "triangle64",
                    Arguments = "--help",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };
                using (var p = System.Diagnostics.Process.Start(psi))
                {
                    p.WaitForExit(2000);
                    if (p.ExitCode == 0) return "triangle64";
                }
            }
            catch { }

            return null;
        }

        private string GenerateTriangleSvg(int svgW, int svgH,
            List<double[]> nodes, List<int> nodeMarkers,
            List<int[]> elements, List<int[]> edges, List<int> edgeMarkers,
            List<int[]> segs, List<int> segMarkers,
            string fillColor, string strokeColor, string nodeColor, string boundaryColor,
            double strokeWidth, double nodeRadius,
            bool showMesh, bool showNodes, bool showBoundary, bool showLabels,
            string title, string bgColor, int inputVertexCount, double qualityAngle = 20)
        {
            // Calculate bounding box
            double minX = double.MaxValue, minY = double.MaxValue;
            double maxX = double.MinValue, maxY = double.MinValue;
            foreach (var n in nodes)
            {
                if (n[0] < minX) minX = n[0]; if (n[0] > maxX) maxX = n[0];
                if (n[1] < minY) minY = n[1]; if (n[1] > maxY) maxY = n[1];
            }
            double rangeX = maxX - minX;
            double rangeY = maxY - minY;
            if (rangeX < 1e-10) rangeX = 1;
            if (rangeY < 1e-10) rangeY = 1;

            // Add margin (10%)
            double margin = Math.Max(rangeX, rangeY) * 0.1;
            minX -= margin; minY -= margin;
            maxX += margin; maxY += margin;
            rangeX = maxX - minX;
            rangeY = maxY - minY;

            // Scale to fit SVG
            double scaleX = (svgW - 20) / rangeX;
            double scaleY = (svgH - 40) / rangeY;
            double scale = Math.Min(scaleX, scaleY);
            double offsetX = (svgW - rangeX * scale) / 2;
            double offsetY = 20; // top margin for title

            Func<double, double, (double, double)> transform = (x, y) =>
            {
                double sx = (x - minX) * scale + offsetX;
                double sy = (maxY - y) * scale + offsetY; // flip Y
                return (sx, sy);
            };

            var ic = System.Globalization.CultureInfo.InvariantCulture;
            var svg = new System.Text.StringBuilder();

            svg.AppendLine($"<svg xmlns='http://www.w3.org/2000/svg' width='{svgW}' height='{svgH}' viewBox='0 0 {svgW} {svgH}' style='background:{bgColor};border:1px solid #ccc;border-radius:4px;'>");

            // Title
            if (!string.IsNullOrEmpty(title))
            {
                svg.AppendLine($"<text x='{svgW / 2}' y='15' text-anchor='middle' font-family='Arial,sans-serif' font-size='14' font-weight='bold' fill='#333'>{System.Web.HttpUtility.HtmlEncode(title)}</text>");
            }

            // Draw filled triangles
            if (showMesh)
            {
                svg.AppendLine("<g class='tri-elements'>");
                foreach (var el in elements)
                {
                    var (x1, y1) = transform(nodes[el[0]][0], nodes[el[0]][1]);
                    var (x2, y2) = transform(nodes[el[1]][0], nodes[el[1]][1]);
                    var (x3, y3) = transform(nodes[el[2]][0], nodes[el[2]][1]);
                    svg.AppendLine($"<polygon points='{x1.ToString(ic)},{y1.ToString(ic)} {x2.ToString(ic)},{y2.ToString(ic)} {x3.ToString(ic)},{y3.ToString(ic)}' fill='{fillColor}' stroke='{strokeColor}' stroke-width='{strokeWidth.ToString(ic)}'/>");
                }
                svg.AppendLine("</g>");
            }

            // Draw boundary segments (thicker)
            if (showBoundary && segs.Count > 0)
            {
                svg.AppendLine("<g class='tri-boundary'>");
                foreach (var seg in segs)
                {
                    var (x1, y1) = transform(nodes[seg[0]][0], nodes[seg[0]][1]);
                    var (x2, y2) = transform(nodes[seg[1]][0], nodes[seg[1]][1]);
                    svg.AppendLine($"<line x1='{x1.ToString(ic)}' y1='{y1.ToString(ic)}' x2='{x2.ToString(ic)}' y2='{y2.ToString(ic)}' stroke='{boundaryColor}' stroke-width='{(strokeWidth * 2.5).ToString(ic)}'/>");
                }
                svg.AppendLine("</g>");
            }

            // Draw nodes
            if (showNodes)
            {
                svg.AppendLine("<g class='tri-nodes'>");
                for (int i = 0; i < nodes.Count; i++)
                {
                    var (cx, cy) = transform(nodes[i][0], nodes[i][1]);
                    bool isBoundary = nodeMarkers.Count > i && nodeMarkers[i] != 0;
                    bool isInput = i < inputVertexCount;
                    string nColor = isInput ? nodeColor : (isBoundary ? "#cc6600" : "#888888");
                    double nr = isInput ? nodeRadius * 1.3 : nodeRadius;
                    svg.AppendLine($"<circle cx='{cx.ToString(ic)}' cy='{cy.ToString(ic)}' r='{nr.ToString(ic)}' fill='{nColor}'/>");
                }
                svg.AppendLine("</g>");
            }

            // Draw labels
            if (showLabels)
            {
                svg.AppendLine("<g class='tri-labels' font-family='monospace' font-size='9' fill='#444'>");
                for (int i = 0; i < nodes.Count; i++)
                {
                    var (cx, cy) = transform(nodes[i][0], nodes[i][1]);
                    svg.AppendLine($"<text x='{(cx + 4).ToString(ic)}' y='{(cy - 4).ToString(ic)}'>{i}</text>");
                }
                svg.AppendLine("</g>");
            }

            // Info text
            svg.AppendLine($"<text x='5' y='{svgH - 5}' font-family='monospace' font-size='10' fill='#888'>Nodes: {nodes.Count} | Elements: {elements.Count} | Triangle (Shewchuk) q={qualityAngle.ToString(ic)}</text>");

            svg.AppendLine("</svg>");
            return svg.ToString();
        }

        /// <summary>
        /// Generate Three.js interactive mesh visualization (Awatif plate style)
        /// Shows: colored mesh faces, wireframe edges, boundary segments, node dots
        /// Includes: orbit controls, data tables, mesh statistics
        /// </summary>
        private string GenerateTriangleThreeJs(int canvasW, int canvasH,
            List<double[]> nodes, List<int> nodeMarkers,
            List<int[]> elements, List<int[]> edges, List<int> edgeMarkers,
            List<int[]> segs, List<int> segMarkers,
            string fillColor, string strokeColor, string nodeColor, string boundaryColor,
            double strokeWidth, double nodeRadius,
            bool showMesh, bool showNodes, bool showBoundary, bool showLabels,
            string title, string bgColor, int inputVertexCount,
            double qualityAngle, double maxArea)
        {
            var ic = System.Globalization.CultureInfo.InvariantCulture;
            var sb = new System.Text.StringBuilder();
            var uid = "tri_" + Guid.NewGuid().ToString("N").Substring(0, 8);

            // Calculate bounding box
            double minX = double.MaxValue, minY = double.MaxValue;
            double maxX = double.MinValue, maxY = double.MinValue;
            foreach (var n in nodes)
            {
                if (n[0] < minX) minX = n[0]; if (n[0] > maxX) maxX = n[0];
                if (n[1] < minY) minY = n[1]; if (n[1] > maxY) maxY = n[1];
            }
            double cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
            double rangeX = maxX - minX, rangeY = maxY - minY;
            double camDist = Math.Max(rangeX, rangeY) * 1.5;

            // Build JSON arrays for nodes and elements
            var nodesJson = new System.Text.StringBuilder("[");
            for (int i = 0; i < nodes.Count; i++)
            {
                if (i > 0) nodesJson.Append(",");
                nodesJson.Append($"[{nodes[i][0].ToString(ic)},{nodes[i][1].ToString(ic)}]");
            }
            nodesJson.Append("]");

            var elemsJson = new System.Text.StringBuilder("[");
            for (int i = 0; i < elements.Count; i++)
            {
                if (i > 0) elemsJson.Append(",");
                elemsJson.Append($"[{elements[i][0]},{elements[i][1]},{elements[i][2]}]");
            }
            elemsJson.Append("]");

            var segsJson = new System.Text.StringBuilder("[");
            for (int i = 0; i < segs.Count; i++)
            {
                if (i > 0) segsJson.Append(",");
                segsJson.Append($"[{segs[i][0]},{segs[i][1]}]");
            }
            segsJson.Append("]");

            var markersJson = new System.Text.StringBuilder("[");
            for (int i = 0; i < nodeMarkers.Count; i++)
            {
                if (i > 0) markersJson.Append(",");
                markersJson.Append(nodeMarkers[i].ToString());
            }
            markersJson.Append("]");

            // Build data tables HTML
            var tablesHtml = new System.Text.StringBuilder();
            tablesHtml.Append($"<div style='margin-top:8px;font-family:monospace;font-size:11px;'>");
            tablesHtml.Append($"<details><summary style='cursor:pointer;font-weight:bold;color:#333;'>Nodos ({nodes.Count})</summary>");
            tablesHtml.Append("<table style='border-collapse:collapse;margin:4px 0;width:100%;max-width:500px;'>");
            tablesHtml.Append("<tr style='background:#f0f0f0;'><th style='border:1px solid #ccc;padding:2px 6px;'>i</th><th style='border:1px solid #ccc;padding:2px 6px;'>x</th><th style='border:1px solid #ccc;padding:2px 6px;'>y</th><th style='border:1px solid #ccc;padding:2px 6px;'>bnd</th></tr>");
            for (int i = 0; i < nodes.Count; i++)
            {
                int m = nodeMarkers.Count > i ? nodeMarkers[i] : 0;
                tablesHtml.Append($"<tr><td style='border:1px solid #ddd;padding:1px 6px;text-align:center;'>{i}</td><td style='border:1px solid #ddd;padding:1px 6px;text-align:right;'>{nodes[i][0].ToString("F4", ic)}</td><td style='border:1px solid #ddd;padding:1px 6px;text-align:right;'>{nodes[i][1].ToString("F4", ic)}</td><td style='border:1px solid #ddd;padding:1px 6px;text-align:center;'>{m}</td></tr>");
            }
            tablesHtml.Append("</table></details>");
            tablesHtml.Append($"<details><summary style='cursor:pointer;font-weight:bold;color:#333;'>Elementos ({elements.Count})</summary>");
            tablesHtml.Append("<table style='border-collapse:collapse;margin:4px 0;width:100%;max-width:400px;'>");
            tablesHtml.Append("<tr style='background:#f0f0f0;'><th style='border:1px solid #ccc;padding:2px 6px;'>i</th><th style='border:1px solid #ccc;padding:2px 6px;'>n1</th><th style='border:1px solid #ccc;padding:2px 6px;'>n2</th><th style='border:1px solid #ccc;padding:2px 6px;'>n3</th></tr>");
            for (int i = 0; i < elements.Count; i++)
            {
                tablesHtml.Append($"<tr><td style='border:1px solid #ddd;padding:1px 6px;text-align:center;'>{i}</td><td style='border:1px solid #ddd;padding:1px 6px;text-align:center;'>{elements[i][0]}</td><td style='border:1px solid #ddd;padding:1px 6px;text-align:center;'>{elements[i][1]}</td><td style='border:1px solid #ddd;padding:1px 6px;text-align:center;'>{elements[i][2]}</td></tr>");
            }
            tablesHtml.Append("</table></details></div>");

            // Generate Three.js scene
            sb.AppendLine($"<div id='{uid}' style='position:relative;width:{canvasW}px;height:{canvasH}px;border:1px solid #ccc;border-radius:6px;overflow:hidden;background:{bgColor};'>");

            // Title overlay
            if (!string.IsNullOrEmpty(title))
            {
                sb.AppendLine($"<div style='position:absolute;top:8px;left:12px;z-index:10;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#333;text-shadow:0 0 4px rgba(255,255,255,0.8);'>{System.Web.HttpUtility.HtmlEncode(title)}</div>");
            }

            // Stats overlay
            sb.AppendLine($"<div style='position:absolute;bottom:6px;left:10px;z-index:10;font-family:monospace;font-size:10px;color:#666;background:rgba(255,255,255,0.7);padding:2px 6px;border-radius:3px;'>Nodes: {nodes.Count} | Elements: {elements.Count} | q={qualityAngle.ToString(ic)}{(maxArea > 0 ? $" a={maxArea.ToString(ic)}" : "")}</div>");

            sb.AppendLine("</div>");
            // Import map is in the <head> of template.html - no need to emit here
            sb.AppendLine($"<script type='module'>");
            sb.AppendLine("import * as THREE from 'three';");
            sb.AppendLine("import { OrbitControls } from 'three/addons/controls/OrbitControls.js';");
            sb.AppendLine("(function(){");
            sb.AppendLine($"const container = document.getElementById('{uid}');");
            sb.AppendLine($"const W = {canvasW}, H = {canvasH};");

            // Data
            sb.AppendLine($"const nodes = {nodesJson};");
            sb.AppendLine($"const elements = {elemsJson};");
            sb.AppendLine($"const segments = {segsJson};");
            sb.AppendLine($"const markers = {markersJson};");
            sb.AppendLine($"const inputCount = {inputVertexCount};");

            // Scene setup
            sb.AppendLine(@"
const scene = new THREE.Scene();
scene.background = new THREE.Color('" + bgColor + @"');
const camera = new THREE.PerspectiveCamera(45, W/H, 0.01, 1000);
camera.position.set(" + cx.ToString(ic) + "," + camDist.ToString(ic) + "," + cy.ToString(ic) + @");
camera.up.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(" + cx.ToString(ic) + ", 0, " + cy.ToString(ic) + @");
controls.enableDamping = true;
controls.dampingFactor = 0.1;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dLight = new THREE.DirectionalLight(0xffffff, 0.8);
dLight.position.set(5, 10, 7);
scene.add(dLight);
const dLight2 = new THREE.DirectionalLight(0xf0e6d3, 0.3);
dLight2.position.set(-3, 5, -5);
scene.add(dLight2);
");
            // Build mesh geometry - colored triangular faces (Awatif plate style)
            sb.AppendLine($"// Mesh faces");
            sb.AppendLine(@"
const geom = new THREE.BufferGeometry();
const positions = [];
const colors = [];
const faceColor = new THREE.Color('" + fillColor + @"');

// Per-element area for color mapping
const areas = [];
for (let i = 0; i < elements.length; i++) {
    const [a,b,c] = elements[i];
    const ax = nodes[a][0], ay = nodes[a][1];
    const bx = nodes[b][0], by = nodes[b][1];
    const cx2 = nodes[c][0], cy2 = nodes[c][1];
    const area = Math.abs((bx-ax)*(cy2-ay) - (cx2-ax)*(by-ay)) / 2;
    areas.push(area);
}
const minArea = Math.min(...areas);
const maxArea2 = Math.max(...areas);

// Rainbow color map function (like Awatif)
function rainbow(t) {
    t = Math.max(0, Math.min(1, t));
    const r = Math.max(0, Math.min(1, 1.5 - Math.abs(t - 0.0) * 4));
    const g = Math.max(0, Math.min(1, 1.5 - Math.abs(t - 0.5) * 4));
    const b2 = Math.max(0, Math.min(1, 1.5 - Math.abs(t - 1.0) * 4));
    return new THREE.Color(r, g, b2);
}

for (let i = 0; i < elements.length; i++) {
    const [a,b,c] = elements[i];
    // positions: x->x, y->0 (flat plate), z->y
    positions.push(nodes[a][0], 0, nodes[a][1]);
    positions.push(nodes[b][0], 0, nodes[b][1]);
    positions.push(nodes[c][0], 0, nodes[c][1]);
    // Color by area (can be changed to any per-element value)
    const t = maxArea2 > minArea ? (areas[i] - minArea) / (maxArea2 - minArea) : 0.5;
    const col = rainbow(t);
    const dim = 0.7; // dim factor like Awatif
    colors.push(col.r*dim, col.g*dim, col.b*dim);
    colors.push(col.r*dim, col.g*dim, col.b*dim);
    colors.push(col.r*dim, col.g*dim, col.b*dim);
}

geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
geom.computeVertexNormals();

const meshMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    metalness: 0.1,
    roughness: 0.8,
    flatShading: true
});
const meshObj = new THREE.Mesh(geom, meshMat);
scene.add(meshObj);
");

            // Wireframe edges (like Awatif elements.ts - LineSegments)
            sb.AppendLine(@"
// Wireframe edges
const edgePositions = [];
for (let i = 0; i < elements.length; i++) {
    const [a,b,c] = elements[i];
    const ax=nodes[a][0], ay=nodes[a][1];
    const bx=nodes[b][0], by=nodes[b][1];
    const cx2=nodes[c][0], cy2=nodes[c][1];
    edgePositions.push(ax,0.001,ay, bx,0.001,by);
    edgePositions.push(bx,0.001,by, cx2,0.001,cy2);
    edgePositions.push(cx2,0.001,cy2, ax,0.001,ay);
}
const edgeGeom = new THREE.BufferGeometry();
edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
const edgeMat = new THREE.LineBasicMaterial({ color: '" + strokeColor + @"', linewidth: 1, transparent: true, opacity: 0.5 });
scene.add(new THREE.LineSegments(edgeGeom, edgeMat));
");

            // Boundary segments (thicker, like Awatif)
            if (showBoundary)
            {
                sb.AppendLine(@"
// Boundary segments (thick)
const bndPositions = [];
for (let i = 0; i < segments.length; i++) {
    const [a,b] = segments[i];
    bndPositions.push(nodes[a][0], 0.002, nodes[a][1]);
    bndPositions.push(nodes[b][0], 0.002, nodes[b][1]);
}
const bndGeom = new THREE.BufferGeometry();
bndGeom.setAttribute('position', new THREE.Float32BufferAttribute(bndPositions, 3));
const bndMat = new THREE.LineBasicMaterial({ color: '" + boundaryColor + @"', linewidth: 2 });
scene.add(new THREE.LineSegments(bndGeom, bndMat));
");
            }

            // Nodes as small spheres (like Awatif nodes)
            if (showNodes)
            {
                sb.AppendLine(@"
// Nodes (small spheres like Awatif)
const nodeSizeBase = " + (Math.Max(rangeX, rangeY) * 0.012).ToString(ic) + @";
const nodeGeo = new THREE.SphereGeometry(nodeSizeBase, 8, 8);
const inputNodeMat = new THREE.MeshStandardMaterial({ color: '" + nodeColor + @"' });
const steinerNodeMat = new THREE.MeshStandardMaterial({ color: '#888888' });
const boundaryNodeMat = new THREE.MeshStandardMaterial({ color: '#cc6600' });
for (let i = 0; i < nodes.length; i++) {
    const isInput = i < inputCount;
    const isBnd = markers[i] !== 0;
    const mat = isInput ? inputNodeMat : (isBnd ? boundaryNodeMat : steinerNodeMat);
    const sphere = new THREE.Mesh(nodeGeo, mat);
    sphere.position.set(nodes[i][0], 0.003, nodes[i][1]);
    if (isInput) sphere.scale.setScalar(1.4);
    scene.add(sphere);
}
");
            }

            // Node labels
            if (showLabels)
            {
                sb.AppendLine(@"
// Node labels as sprites
function makeLabel(text, x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0,0,64,32);
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText(text, 32, 22);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: true });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, 0.15, z);
    sp.scale.set(0.3, 0.15, 1);
    return sp;
}
for (let i = 0; i < nodes.length; i++) {
    scene.add(makeLabel(i.toString(), nodes[i][0] + 0.05, nodes[i][1] + 0.05));
}
");
            }

            // Color legend (Awatif style overlay)
            sb.AppendLine(@"
// Color legend
const legend = document.createElement('div');
legend.style.cssText = 'position:absolute;right:10px;top:35px;z-index:10;background:rgba(255,255,255,0.85);padding:6px 8px;border-radius:4px;font-family:monospace;font-size:10px;';
legend.innerHTML = '<div style=""font-weight:bold;margin-bottom:3px;"">Area</div>' +
    '<div style=""display:flex;align-items:center;gap:4px;"">' +
    '<span>" + (maxArea > 0 ? "min" : "0") + @"</span>' +
    '<div style=""width:80px;height:12px;background:linear-gradient(to right,rgb(255,0,0),rgb(255,255,0),rgb(0,255,0),rgb(0,255,255),rgb(0,0,255));border:1px solid #ccc;border-radius:2px;""></div>' +
    '<span>max</span></div>';
container.appendChild(legend);
");

            // Grid helper
            sb.AppendLine($@"
// Grid
const gridSize = {(Math.Max(rangeX, rangeY) * 2).ToString(ic)};
const grid = new THREE.GridHelper(gridSize, {(int)(Math.Max(rangeX, rangeY) * 2)}, 0xcccccc, 0xe8e8e8);
grid.position.set({cx.ToString(ic)}, -0.01, {cy.ToString(ic)});
scene.add(grid);
");

            // Animation loop
            sb.AppendLine(@"
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();
");
            sb.AppendLine("})();");
            sb.AppendLine("</script>");

            // Append data tables
            sb.Append(tablesHtml);

            return sb.ToString();
        }

        private void ParseSvgDirectiveSize(string directive, out int w, out int h)
        {
            w = 500; h = 400;
            if (string.IsNullOrEmpty(directive)) return;
            // @{svg 600 400} → extract 600 and 400
            var parts = directive.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            // parts[0] = "svg", parts[1] = "600", parts[2] = "400"
            if (parts.Length >= 3 && int.TryParse(parts[1], out int pw) && int.TryParse(parts[2], out int ph))
            { w = pw; h = ph; }
            else if (parts.Length >= 2 && int.TryParse(parts[1], out int pw2))
            { w = pw2; h = (int)(pw2 * 0.75); } // default aspect ratio
        }

        /// <summary>Split SVG DSL line into tokens, respecting quoted strings</summary>
        private List<string> SplitSvgLine(string line)
        {
            var tokens = new List<string>();
            int i = 0;
            while (i < line.Length)
            {
                // Skip whitespace
                while (i < line.Length && char.IsWhiteSpace(line[i])) i++;
                if (i >= line.Length) break;

                if (line[i] == '"')
                {
                    // Quoted string
                    i++; // skip opening quote
                    int start = i;
                    while (i < line.Length && line[i] != '"') i++;
                    tokens.Add(line.Substring(start, i - start));
                    if (i < line.Length) i++; // skip closing quote
                }
                else
                {
                    // Regular token
                    int start = i;
                    while (i < line.Length && !char.IsWhiteSpace(line[i])) i++;
                    tokens.Add(line.Substring(start, i - start));
                }
            }
            return tokens;
        }

        private string EscAttr(string val) => System.Net.WebUtility.HtmlEncode(val ?? "");

        /// <summary>Convert a DSL command line to an SVG element string</summary>
        private string? ConvertSvgCommand(string cmd, List<string> tokens, int svgW, int svgH, bool yUp,
            string defStroke, string defFill, string defWidth, string defOpacity, string defDash,
            string defFont, string defFontSize)
        {
            // Extract options (key:value pairs) and flags (bold, italic)
            var opts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var flags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var posParams = new List<string>(); // positional params (numbers, coords)
            string? textContent = null;

            for (int i = 1; i < tokens.Count; i++)
            {
                var tok = tokens[i];
                if (tok.Contains(':'))
                {
                    var ci = tok.IndexOf(':');
                    opts[tok.Substring(0, ci)] = tok.Substring(ci + 1);
                }
                else if (tok == "bold" || tok == "italic")
                {
                    flags.Add(tok);
                }
                else if (textContent == null && !double.TryParse(tok, System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out _) && !tok.Contains(','))
                {
                    // Non-numeric, non-option token after positional params → treat as text
                    textContent = tok;
                }
                else
                {
                    posParams.Add(tok);
                }
            }

            // Helper to get style attributes (with persistent state fallbacks)
            string GetStroke() => opts.TryGetValue("stroke", out var s) ? s : null;
            string GetFill() => opts.TryGetValue("fill", out var f) ? f : null;
            string GetWidth() => opts.TryGetValue("width", out var w) ? w : null;
            string GetOpacity() => opts.TryGetValue("opacity", out var o) ? o : null;
            string GetDash() => opts.TryGetValue("dash", out var d) ? d : null;

            string BuildStyle(string defaultStroke = null, string defaultFill = "none")
            {
                var sb = new StringBuilder();
                var stroke = GetStroke() ?? defaultStroke ?? defStroke;
                var fill = GetFill() ?? (defaultFill != "none" ? defaultFill : null) ?? defFill;
                if (fill == null) fill = "none"; // ensure fill is always set
                var width = GetWidth() ?? defWidth;
                var opacity = GetOpacity() ?? defOpacity;
                var dash = GetDash() ?? defDash;

                if (stroke != null) sb.Append($" stroke=\"{EscAttr(stroke)}\"");
                if (fill != null) sb.Append($" fill=\"{EscAttr(fill)}\"");
                if (width != null) sb.Append($" stroke-width=\"{EscAttr(width)}\"");
                if (opacity != null) sb.Append($" opacity=\"{EscAttr(opacity)}\"");
                if (dash != null) sb.Append($" stroke-dasharray=\"{EscAttr(dash)}\"");
                return sb.ToString();
            }

            double P(int idx) => idx < posParams.Count && double.TryParse(posParams[idx],
                System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0;

            var inv = System.Globalization.CultureInfo.InvariantCulture;

            switch (cmd)
            {
                case "line":
                    return $"<line x1=\"{P(0)}\" y1=\"{P(1)}\" x2=\"{P(2)}\" y2=\"{P(3)}\"{BuildStyle("black")}/>";

                case "rect":
                {
                    var rx = opts.TryGetValue("rx", out var rxv) ? $" rx=\"{EscAttr(rxv)}\"" : "";
                    var ry = opts.TryGetValue("ry", out var ryv) ? $" ry=\"{EscAttr(ryv)}\"" : "";
                    return $"<rect x=\"{P(0)}\" y=\"{P(1)}\" width=\"{P(2)}\" height=\"{P(3)}\"{rx}{ry}{BuildStyle(null, "#ccc")}/>";
                }

                case "circle":
                    return $"<circle cx=\"{P(0)}\" cy=\"{P(1)}\" r=\"{P(2)}\"{BuildStyle(null, "none")}/>";

                case "ellipse":
                    return $"<ellipse cx=\"{P(0)}\" cy=\"{P(1)}\" rx=\"{P(2)}\" ry=\"{P(3)}\"{BuildStyle(null, "none")}/>";

                case "polyline":
                {
                    var points = string.Join(" ", posParams);
                    return $"<polyline points=\"{EscAttr(points)}\"{BuildStyle("black", "none")}/>";
                }

                case "polygon":
                {
                    var points = string.Join(" ", posParams);
                    return $"<polygon points=\"{EscAttr(points)}\"{BuildStyle("black")}/>";
                }

                case "text":
                {
                    var txt = textContent ?? "";
                    var size = opts.TryGetValue("size", out var sz) ? sz : (defFontSize ?? "12");
                    var color = opts.TryGetValue("color", out var cl) ? cl : (GetStroke() ?? defStroke ?? "black");
                    var anchor = opts.TryGetValue("anchor", out var an) ? an : "start";
                    var font = opts.TryGetValue("font", out var fn) ? fn : (defFont ?? "sans-serif");
                    var rotate = opts.TryGetValue("rotate", out var rt) ? rt : null;
                    var fontWeight = flags.Contains("bold") ? " font-weight=\"bold\"" : "";
                    var fontStyle = flags.Contains("italic") ? " font-style=\"italic\"" : "";
                    var transform = "";
                    if (yUp)
                    {
                        // Counter-scale text so it reads correctly when parent is flipped
                        var baseTransform = $"translate({P(0).ToString(inv)},{P(1).ToString(inv)}) scale(1,-1)";
                        if (rotate != null) baseTransform += $" rotate({EscAttr(rotate)})";
                        transform = $" transform=\"{baseTransform}\"";
                        return $"<text x=\"0\" y=\"0\" font-size=\"{EscAttr(size)}\" fill=\"{EscAttr(color)}\" " +
                               $"text-anchor=\"{EscAttr(anchor)}\" font-family=\"{EscAttr(font)}\"{fontWeight}{fontStyle}{transform}>{System.Net.WebUtility.HtmlEncode(txt)}</text>";
                    }
                    else
                    {
                        transform = rotate != null ? $" transform=\"rotate({EscAttr(rotate)},{P(0)},{P(1)})\"" : "";
                        return $"<text x=\"{P(0)}\" y=\"{P(1)}\" font-size=\"{EscAttr(size)}\" fill=\"{EscAttr(color)}\" " +
                               $"text-anchor=\"{EscAttr(anchor)}\" font-family=\"{EscAttr(font)}\"{fontWeight}{fontStyle}{transform}>{System.Net.WebUtility.HtmlEncode(txt)}</text>";
                    }
                }

                case "arc":
                {
                    // arc cx cy r startAngle endAngle [options]
                    double cx = P(0), cy = P(1), r = P(2);
                    double startDeg = P(3), endDeg = P(4);
                    double startRad = startDeg * Math.PI / 180;
                    double endRad = endDeg * Math.PI / 180;
                    double x1 = cx + r * Math.Cos(startRad);
                    double y1 = cy - r * Math.Sin(startRad);
                    double x2 = cx + r * Math.Cos(endRad);
                    double y2 = cy - r * Math.Sin(endRad);
                    int largeArc = Math.Abs(endDeg - startDeg) > 180 ? 1 : 0;
                    return $"<path d=\"M {x1.ToString(inv)} {y1.ToString(inv)} A {r.ToString(inv)} {r.ToString(inv)} 0 {largeArc} 0 {x2.ToString(inv)} {y2.ToString(inv)}\"{BuildStyle("black", "none")}/>";
                }

                case "arrow":
                    return $"<line x1=\"{P(0)}\" y1=\"{P(1)}\" x2=\"{P(2)}\" y2=\"{P(3)}\"{BuildStyle("black")} marker-end=\"url(#svg-arrowhead)\"/>";

                // === NEW: Double arrow (rotation DOF — flecha doble como en Fig 5.5) ===
                case "darrow":
                    return $"<line x1=\"{P(0)}\" y1=\"{P(1)}\" x2=\"{P(2)}\" y2=\"{P(3)}\"{BuildStyle("black")} marker-start=\"url(#svg-darrow-start)\" marker-end=\"url(#svg-darrow-end)\"/>";

                // === NEW: Dimension line ===
                case "dim":
                {
                    // dim x1 y1 x2 y2 offset:15 text:"2.5 m" size:10
                    double x1 = P(0), y1 = P(1), x2 = P(2), y2 = P(3);
                    double offset = opts.TryGetValue("offset", out var ov) && double.TryParse(ov, System.Globalization.NumberStyles.Float, inv, out var ov2) ? ov2 : 15;
                    var dimText = textContent ?? "";
                    var dimSize = opts.TryGetValue("size", out var dsz) ? dsz : "9";
                    var dimColor = GetStroke() ?? defStroke ?? "black";

                    // Direction vector and perpendicular
                    double dx = x2 - x1, dy = y2 - y1;
                    double len = Math.Sqrt(dx * dx + dy * dy);
                    if (len < 0.01) return null;
                    double nx = -dy / len, ny = dx / len; // perpendicular (offset direction)

                    // Offset points for dimension line
                    double ox1 = x1 + nx * offset, oy1 = y1 + ny * offset;
                    double ox2 = x2 + nx * offset, oy2 = y2 + ny * offset;

                    // Extension lines (from original points to offset points, extended a bit)
                    double ext = offset > 0 ? 3 : -3;
                    var sb = new StringBuilder();
                    sb.Append($"<line x1=\"{x1.ToString(inv)}\" y1=\"{y1.ToString(inv)}\" x2=\"{(ox1 + nx * ext).ToString(inv)}\" y2=\"{(oy1 + ny * ext).ToString(inv)}\" stroke=\"{EscAttr(dimColor)}\" stroke-width=\"0.5\"/>");
                    sb.Append($"<line x1=\"{x2.ToString(inv)}\" y1=\"{y2.ToString(inv)}\" x2=\"{(ox2 + nx * ext).ToString(inv)}\" y2=\"{(oy2 + ny * ext).ToString(inv)}\" stroke=\"{EscAttr(dimColor)}\" stroke-width=\"0.5\"/>");
                    // Dimension line with arrows
                    sb.Append($"<line x1=\"{ox1.ToString(inv)}\" y1=\"{oy1.ToString(inv)}\" x2=\"{ox2.ToString(inv)}\" y2=\"{oy2.ToString(inv)}\" stroke=\"{EscAttr(dimColor)}\" stroke-width=\"0.7\" marker-start=\"url(#svg-dim-start)\" marker-end=\"url(#svg-dim-end)\"/>");
                    // Text at midpoint
                    double mx = (ox1 + ox2) / 2, my = (oy1 + oy2) / 2;
                    double angleDeg = Math.Atan2(dy, dx) * 180 / Math.PI;
                    if (yUp) my -= 3; else my -= 3; // text offset above dimension line
                    if (dimText.Length > 0)
                    {
                        if (yUp)
                        {
                            sb.Append($"<text transform=\"translate({mx.ToString(inv)},{my.ToString(inv)}) scale(1,-1)\" font-size=\"{EscAttr(dimSize)}\" fill=\"{EscAttr(dimColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(dimText)}</text>");
                        }
                        else
                        {
                            sb.Append($"<text x=\"{mx.ToString(inv)}\" y=\"{my.ToString(inv)}\" font-size=\"{EscAttr(dimSize)}\" fill=\"{EscAttr(dimColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(dimText)}</text>");
                        }
                    }
                    return sb.ToString();
                }

                // === NEW: Horizontal dimension ===
                case "hdim":
                {
                    // hdim x1 x2 y offset:15 text:"..." size:10
                    double hx1 = P(0), hx2 = P(1), hy = P(2);
                    double hoff = opts.TryGetValue("offset", out var hov) && double.TryParse(hov, System.Globalization.NumberStyles.Float, inv, out var hov2) ? hov2 : 15;
                    var hText = textContent ?? $"{Math.Abs(hx2 - hx1).ToString(inv)}";
                    var hSize = opts.TryGetValue("size", out var hsz) ? hsz : "9";
                    var hColor = GetStroke() ?? defStroke ?? "black";
                    double hy2 = hy + hoff;
                    var sb = new StringBuilder();
                    sb.Append($"<line x1=\"{hx1.ToString(inv)}\" y1=\"{hy.ToString(inv)}\" x2=\"{hx1.ToString(inv)}\" y2=\"{(hy2 + (hoff > 0 ? 3 : -3)).ToString(inv)}\" stroke=\"{EscAttr(hColor)}\" stroke-width=\"0.5\"/>");
                    sb.Append($"<line x1=\"{hx2.ToString(inv)}\" y1=\"{hy.ToString(inv)}\" x2=\"{hx2.ToString(inv)}\" y2=\"{(hy2 + (hoff > 0 ? 3 : -3)).ToString(inv)}\" stroke=\"{EscAttr(hColor)}\" stroke-width=\"0.5\"/>");
                    sb.Append($"<line x1=\"{hx1.ToString(inv)}\" y1=\"{hy2.ToString(inv)}\" x2=\"{hx2.ToString(inv)}\" y2=\"{hy2.ToString(inv)}\" stroke=\"{EscAttr(hColor)}\" stroke-width=\"0.7\" marker-start=\"url(#svg-dim-start)\" marker-end=\"url(#svg-dim-end)\"/>");
                    double hmx = (hx1 + hx2) / 2;
                    if (yUp)
                        sb.Append($"<text transform=\"translate({hmx.ToString(inv)},{(hy2 - 3).ToString(inv)}) scale(1,-1)\" font-size=\"{EscAttr(hSize)}\" fill=\"{EscAttr(hColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(hText)}</text>");
                    else
                        sb.Append($"<text x=\"{hmx.ToString(inv)}\" y=\"{(hy2 - 3).ToString(inv)}\" font-size=\"{EscAttr(hSize)}\" fill=\"{EscAttr(hColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(hText)}</text>");
                    return sb.ToString();
                }

                // === NEW: Vertical dimension ===
                case "vdim":
                {
                    // vdim y1 y2 x offset:15 text:"..." size:10
                    double vy1 = P(0), vy2 = P(1), vx = P(2);
                    double voff = opts.TryGetValue("offset", out var vov) && double.TryParse(vov, System.Globalization.NumberStyles.Float, inv, out var vov2) ? vov2 : 15;
                    var vText = textContent ?? $"{Math.Abs(vy2 - vy1).ToString(inv)}";
                    var vSize = opts.TryGetValue("size", out var vsz) ? vsz : "9";
                    var vColor = GetStroke() ?? defStroke ?? "black";
                    double vx2 = vx + voff;
                    var sb = new StringBuilder();
                    sb.Append($"<line x1=\"{vx.ToString(inv)}\" y1=\"{vy1.ToString(inv)}\" x2=\"{(vx2 + (voff > 0 ? 3 : -3)).ToString(inv)}\" y2=\"{vy1.ToString(inv)}\" stroke=\"{EscAttr(vColor)}\" stroke-width=\"0.5\"/>");
                    sb.Append($"<line x1=\"{vx.ToString(inv)}\" y1=\"{vy2.ToString(inv)}\" x2=\"{(vx2 + (voff > 0 ? 3 : -3)).ToString(inv)}\" y2=\"{vy2.ToString(inv)}\" stroke=\"{EscAttr(vColor)}\" stroke-width=\"0.5\"/>");
                    sb.Append($"<line x1=\"{vx2.ToString(inv)}\" y1=\"{vy1.ToString(inv)}\" x2=\"{vx2.ToString(inv)}\" y2=\"{vy2.ToString(inv)}\" stroke=\"{EscAttr(vColor)}\" stroke-width=\"0.7\" marker-start=\"url(#svg-dim-start)\" marker-end=\"url(#svg-dim-end)\"/>");
                    double vmy = (vy1 + vy2) / 2;
                    if (yUp)
                        sb.Append($"<text transform=\"translate({(vx2 - 3).ToString(inv)},{vmy.ToString(inv)}) scale(1,-1) rotate(-90)\" font-size=\"{EscAttr(vSize)}\" fill=\"{EscAttr(vColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(vText)}</text>");
                    else
                        sb.Append($"<text x=\"{(vx2 - 3).ToString(inv)}\" y=\"{vmy.ToString(inv)}\" font-size=\"{EscAttr(vSize)}\" fill=\"{EscAttr(vColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\" transform=\"rotate(-90,{(vx2 - 3).ToString(inv)},{vmy.ToString(inv)})\">{System.Net.WebUtility.HtmlEncode(vText)}</text>");
                    return sb.ToString();
                }

                // === NEW: Structural support (pin, fixed, roller) ===
                case "support":
                {
                    // support x y type:pin|fixed|roller size:15
                    double sx = P(0), sy = P(1);
                    var sType = opts.TryGetValue("type", out var stv) ? stv.ToLower() : "pin";
                    double sSize = opts.TryGetValue("size", out var ssv) && double.TryParse(ssv, System.Globalization.NumberStyles.Float, inv, out var ss2) ? ss2 : 15;
                    var sColor = GetStroke() ?? defStroke ?? "black";
                    var sb = new StringBuilder();

                    if (sType == "pin")
                    {
                        // Triangle pointing up
                        double h = sSize, w = sSize * 0.8;
                        sb.Append($"<polygon points=\"{sx.ToString(inv)},{sy.ToString(inv)} {(sx - w / 2).ToString(inv)},{(sy + h).ToString(inv)} {(sx + w / 2).ToString(inv)},{(sy + h).ToString(inv)}\" stroke=\"{EscAttr(sColor)}\" fill=\"none\" stroke-width=\"1.5\"/>");
                        // Ground hatch line
                        sb.Append($"<line x1=\"{(sx - w / 2 - 2).ToString(inv)}\" y1=\"{(sy + h).ToString(inv)}\" x2=\"{(sx + w / 2 + 2).ToString(inv)}\" y2=\"{(sy + h).ToString(inv)}\" stroke=\"{EscAttr(sColor)}\" stroke-width=\"1.5\"/>");
                    }
                    else if (sType == "fixed")
                    {
                        // Filled rectangle + hatch lines
                        double w = sSize * 1.2, h = sSize * 0.4;
                        sb.Append($"<rect x=\"{(sx - w / 2).ToString(inv)}\" y=\"{sy.ToString(inv)}\" width=\"{w.ToString(inv)}\" height=\"{h.ToString(inv)}\" stroke=\"{EscAttr(sColor)}\" fill=\"none\" stroke-width=\"1.5\"/>");
                        // Hatch lines inside
                        for (double hx = sx - w / 2 + 3; hx < sx + w / 2; hx += 4)
                            sb.Append($"<line x1=\"{hx.ToString(inv)}\" y1=\"{sy.ToString(inv)}\" x2=\"{(hx - 3).ToString(inv)}\" y2=\"{(sy + h).ToString(inv)}\" stroke=\"{EscAttr(sColor)}\" stroke-width=\"0.7\"/>");
                    }
                    else if (sType == "roller")
                    {
                        // Triangle + circle underneath
                        double h = sSize * 0.7, w = sSize * 0.8, cr = sSize * 0.15;
                        sb.Append($"<polygon points=\"{sx.ToString(inv)},{sy.ToString(inv)} {(sx - w / 2).ToString(inv)},{(sy + h).ToString(inv)} {(sx + w / 2).ToString(inv)},{(sy + h).ToString(inv)}\" stroke=\"{EscAttr(sColor)}\" fill=\"none\" stroke-width=\"1.5\"/>");
                        sb.Append($"<circle cx=\"{sx.ToString(inv)}\" cy=\"{(sy + h + cr + 1).ToString(inv)}\" r=\"{cr.ToString(inv)}\" stroke=\"{EscAttr(sColor)}\" fill=\"none\" stroke-width=\"1\"/>");
                        sb.Append($"<line x1=\"{(sx - w / 2 - 2).ToString(inv)}\" y1=\"{(sy + h + 2 * cr + 2).ToString(inv)}\" x2=\"{(sx + w / 2 + 2).ToString(inv)}\" y2=\"{(sy + h + 2 * cr + 2).ToString(inv)}\" stroke=\"{EscAttr(sColor)}\" stroke-width=\"1.5\"/>");
                    }
                    return sb.ToString();
                }

                // === NEW: Distributed load ===
                case "dload":
                {
                    // dload x1 y1 x2 y2 n:5 length:20
                    double dx1 = P(0), dy1 = P(1), dx2 = P(2), dy2 = P(3);
                    int nArrows = opts.TryGetValue("n", out var nv) && int.TryParse(nv, out var nn) ? nn : 5;
                    double aLen = opts.TryGetValue("length", out var alv) && double.TryParse(alv, System.Globalization.NumberStyles.Float, inv, out var al2) ? al2 : 20;
                    var dColor = GetStroke() ?? defStroke ?? "black";
                    var sb = new StringBuilder();

                    // Direction perpendicular to the load line (for arrow direction)
                    double ddx = dx2 - dx1, ddy = dy2 - dy1;
                    double dLen = Math.Sqrt(ddx * ddx + ddy * ddy);
                    if (dLen < 0.01) return null;

                    // Load arrows perpendicular to the load line
                    // Default: arrows point in -Y direction (downward loads)
                    double anx = 0, any = yUp ? -1 : 1; // arrow direction: downward
                    if (opts.TryGetValue("dir", out var dirv))
                    {
                        var dirParts = dirv.Split(',');
                        if (dirParts.Length == 2)
                        {
                            double.TryParse(dirParts[0], System.Globalization.NumberStyles.Float, inv, out anx);
                            double.TryParse(dirParts[1], System.Globalization.NumberStyles.Float, inv, out any);
                        }
                    }

                    // Top line (connection line at arrow bases)
                    double tx1 = dx1 + anx * aLen, ty1 = dy1 + any * aLen;
                    double tx2 = dx2 + anx * aLen, ty2 = dy2 + any * aLen;
                    sb.Append($"<line x1=\"{tx1.ToString(inv)}\" y1=\"{ty1.ToString(inv)}\" x2=\"{tx2.ToString(inv)}\" y2=\"{ty2.ToString(inv)}\" stroke=\"{EscAttr(dColor)}\" stroke-width=\"0.7\"/>");

                    // Individual arrows
                    for (int ai = 0; ai <= nArrows; ai++)
                    {
                        double t = nArrows > 0 ? (double)ai / nArrows : 0;
                        double ax = dx1 + t * (dx2 - dx1);
                        double ay = dy1 + t * (dy2 - dy1);
                        double bx = ax + anx * aLen, by = ay + any * aLen;
                        sb.Append($"<line x1=\"{bx.ToString(inv)}\" y1=\"{by.ToString(inv)}\" x2=\"{ax.ToString(inv)}\" y2=\"{ay.ToString(inv)}\" stroke=\"{EscAttr(dColor)}\" stroke-width=\"0.7\" marker-end=\"url(#svg-arrowhead)\"/>");
                    }
                    return sb.ToString();
                }

                // === NEW: Moment (curved arrow) ===
                case "moment":
                case "carc":
                {
                    // moment cx cy r:20 start:0 end:270 text:"M" cw:false
                    double mcx = P(0), mcy = P(1);
                    double mr = opts.TryGetValue("r", out var mrv) && double.TryParse(mrv, System.Globalization.NumberStyles.Float, inv, out var mr2) ? mr2 : 20;
                    double mStart = opts.TryGetValue("start", out var msv) && double.TryParse(msv, System.Globalization.NumberStyles.Float, inv, out var ms2) ? ms2 : 0;
                    double mEnd = opts.TryGetValue("end", out var mev) && double.TryParse(mev, System.Globalization.NumberStyles.Float, inv, out var me2) ? me2 : 270;
                    var mText = textContent;
                    var mColor = GetStroke() ?? defStroke ?? "black";
                    bool clockwise = opts.TryGetValue("cw", out var cwv) && cwv.ToLower() == "true";

                    double startRad = mStart * Math.PI / 180;
                    double endRad = mEnd * Math.PI / 180;
                    double ax1 = mcx + mr * Math.Cos(startRad);
                    double ay1 = mcy - mr * Math.Sin(startRad);
                    double ax2 = mcx + mr * Math.Cos(endRad);
                    double ay2 = mcy - mr * Math.Sin(endRad);
                    int sweep = clockwise ? 1 : 0;
                    int large = Math.Abs(mEnd - mStart) > 180 ? 1 : 0;

                    var sb = new StringBuilder();
                    sb.Append($"<path d=\"M {ax1.ToString(inv)} {ay1.ToString(inv)} A {mr.ToString(inv)} {mr.ToString(inv)} 0 {large} {sweep} {ax2.ToString(inv)} {ay2.ToString(inv)}\" stroke=\"{EscAttr(mColor)}\" fill=\"none\" stroke-width=\"1.2\" marker-end=\"url(#svg-moment-arrow)\"/>");
                    if (mText != null)
                    {
                        if (yUp)
                            sb.Append($"<text transform=\"translate({mcx.ToString(inv)},{(mcy - mr - 5).ToString(inv)}) scale(1,-1)\" font-size=\"10\" fill=\"{EscAttr(mColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(mText)}</text>");
                        else
                            sb.Append($"<text x=\"{mcx.ToString(inv)}\" y=\"{(mcy - mr - 5).ToString(inv)}\" font-size=\"10\" fill=\"{EscAttr(mColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(mText)}</text>");
                    }
                    return sb.ToString();
                }

                // === NEW: Axes (coordinate axes with labels) ===
                case "axes":
                {
                    // axes x y length:100 labels:true xlabel:"X" ylabel:"Y"
                    double ax = P(0), ay = P(1);
                    double aLength = opts.TryGetValue("length", out var alv2) && double.TryParse(alv2, System.Globalization.NumberStyles.Float, inv, out var al3) ? al3 : 100;
                    bool labels = !opts.TryGetValue("labels", out var labv) || labv.ToLower() != "false";
                    var xLabel = opts.TryGetValue("xlabel", out var xlv) ? xlv : "X";
                    var yLabel = opts.TryGetValue("ylabel", out var ylv) ? ylv : "Y";
                    var aColor = GetStroke() ?? defStroke ?? "black";
                    var sb = new StringBuilder();
                    // X axis
                    sb.Append($"<line x1=\"{ax.ToString(inv)}\" y1=\"{ay.ToString(inv)}\" x2=\"{(ax + aLength).ToString(inv)}\" y2=\"{ay.ToString(inv)}\" stroke=\"{EscAttr(aColor)}\" stroke-width=\"1.2\" marker-end=\"url(#svg-arrowhead)\"/>");
                    // Y axis
                    if (yUp)
                        sb.Append($"<line x1=\"{ax.ToString(inv)}\" y1=\"{ay.ToString(inv)}\" x2=\"{ax.ToString(inv)}\" y2=\"{(ay + aLength).ToString(inv)}\" stroke=\"{EscAttr(aColor)}\" stroke-width=\"1.2\" marker-end=\"url(#svg-arrowhead)\"/>");
                    else
                        sb.Append($"<line x1=\"{ax.ToString(inv)}\" y1=\"{ay.ToString(inv)}\" x2=\"{ax.ToString(inv)}\" y2=\"{(ay - aLength).ToString(inv)}\" stroke=\"{EscAttr(aColor)}\" stroke-width=\"1.2\" marker-end=\"url(#svg-arrowhead)\"/>");
                    if (labels)
                    {
                        double labelOff = 12;
                        if (yUp)
                        {
                            sb.Append($"<text transform=\"translate({(ax + aLength + labelOff).ToString(inv)},{ay.ToString(inv)}) scale(1,-1)\" font-size=\"12\" fill=\"{EscAttr(aColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(xLabel)}</text>");
                            sb.Append($"<text transform=\"translate({ax.ToString(inv)},{(ay + aLength + labelOff).ToString(inv)}) scale(1,-1)\" font-size=\"12\" fill=\"{EscAttr(aColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(yLabel)}</text>");
                        }
                        else
                        {
                            sb.Append($"<text x=\"{(ax + aLength + labelOff).ToString(inv)}\" y=\"{(ay + 4).ToString(inv)}\" font-size=\"12\" fill=\"{EscAttr(aColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(xLabel)}</text>");
                            sb.Append($"<text x=\"{(ax - 4).ToString(inv)}\" y=\"{(ay - aLength - 4).ToString(inv)}\" font-size=\"12\" fill=\"{EscAttr(aColor)}\" text-anchor=\"middle\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(yLabel)}</text>");
                        }
                    }
                    return sb.ToString();
                }

                // === NEW: Node label (circled number) ===
                case "node":
                {
                    // node x y "1" r:10
                    double nx = P(0), ny = P(1);
                    var nText = textContent ?? "1";
                    double nr = opts.TryGetValue("r", out var nrv) && double.TryParse(nrv, System.Globalization.NumberStyles.Float, inv, out var nr2) ? nr2 : 10;
                    var nColor = GetStroke() ?? defStroke ?? "black";
                    var sb = new StringBuilder();
                    sb.Append($"<circle cx=\"{nx.ToString(inv)}\" cy=\"{ny.ToString(inv)}\" r=\"{nr.ToString(inv)}\" stroke=\"{EscAttr(nColor)}\" fill=\"white\" stroke-width=\"1\"/>");
                    if (yUp)
                        sb.Append($"<text transform=\"translate({nx.ToString(inv)},{ny.ToString(inv)}) scale(1,-1)\" font-size=\"{(nr * 1.2).ToString(inv)}\" fill=\"{EscAttr(nColor)}\" text-anchor=\"middle\" dominant-baseline=\"central\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(nText)}</text>");
                    else
                        sb.Append($"<text x=\"{nx.ToString(inv)}\" y=\"{ny.ToString(inv)}\" font-size=\"{(nr * 1.2).ToString(inv)}\" fill=\"{EscAttr(nColor)}\" text-anchor=\"middle\" dominant-baseline=\"central\" font-family=\"sans-serif\">{System.Net.WebUtility.HtmlEncode(nText)}</text>");
                    return sb.ToString();
                }

                case "grid":
                {
                    double gx = P(0), gy = P(1), gw = P(2), gh = P(3);
                    if (gw == 0) gw = svgW;
                    if (gh == 0) gh = svgH;
                    double step = opts.TryGetValue("step", out var st) && double.TryParse(st,
                        System.Globalization.NumberStyles.Float, inv, out var sv) ? sv : 50;
                    var gStroke = GetStroke() ?? "#ddd";
                    var gOpacity = GetOpacity() ?? "0.5";
                    var gWidth = GetWidth() ?? "0.5";
                    var sb = new StringBuilder();
                    for (double x = gx; x <= gx + gw; x += step)
                        sb.Append($"<line x1=\"{x.ToString(inv)}\" y1=\"{gy.ToString(inv)}\" x2=\"{x.ToString(inv)}\" y2=\"{(gy + gh).ToString(inv)}\" stroke=\"{EscAttr(gStroke)}\" stroke-width=\"{gWidth}\" opacity=\"{gOpacity}\"/>");
                    for (double y = gy; y <= gy + gh; y += step)
                        sb.Append($"<line x1=\"{gx.ToString(inv)}\" y1=\"{y.ToString(inv)}\" x2=\"{(gx + gw).ToString(inv)}\" y2=\"{y.ToString(inv)}\" stroke=\"{EscAttr(gStroke)}\" stroke-width=\"{gWidth}\" opacity=\"{gOpacity}\"/>");
                    return sb.ToString();
                }

                case "group":
                {
                    var transforms = new List<string>();
                    if (opts.TryGetValue("translate", out var tr))
                        transforms.Add($"translate({tr})");
                    if (opts.TryGetValue("rotate", out var rot))
                        transforms.Add($"rotate({rot})");
                    if (opts.TryGetValue("scale", out var sc))
                        transforms.Add($"scale({sc})");
                    var id = opts.TryGetValue("id", out var gid) ? $" id=\"{EscAttr(gid)}\"" : "";
                    var tf = transforms.Count > 0 ? $" transform=\"{string.Join(" ", transforms)}\"" : "";
                    return $"<g{id}{tf}>";
                }

                case "endgroup":
                    return "</g>";

                case "path":
                {
                    var d = opts.TryGetValue("d", out var dv) ? dv : (textContent ?? "");
                    return $"<path d=\"{EscAttr(d)}\"{BuildStyle("black", "none")}/>";
                }

                default:
                    return $"<!-- unknown svg command: {System.Net.WebUtility.HtmlEncode(cmd)} -->";
            }
        }

        /// <summary>
        /// Process @{maxima} block - Execute Maxima CAS commands and format results
        /// Syntax:
        ///   @{maxima}
        ///   diff(x^3 + 2*x, x);
        ///   integrate(sin(x)*cos(x), x);
        ///   ode2('diff(y,x,2) + 4*y = sin(x), y, x);
        ///   laplace(t^2*exp(-3*t), t, s);
        ///   taylor(sin(x), x, 0, 5);
        ///   @{end maxima}
        /// Requires Maxima installed and in PATH.
        /// Supports CALCPAD:var=value protocol for variable export.
        /// </summary>
        private string ProcessMaximaBlock(string content, Dictionary<string, object> variables)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return "<p style='color:red;'>Error: Bloque @{maxima} vac\u00edo</p>";

                // Check if maxima is available
                var maxima = FindMaximaInstall();
                if (maxima == null)
                {
                    return "<div class='maxima-not-found'>" +
                           "<strong>Maxima no encontrado</strong><br/>" +
                           "<p>Instala Maxima para usar <code>@{maxima}</code>:</p>" +
                           "<ul>" +
                           "<li><strong>Windows:</strong> <code>choco install maxima</code> o descarga de <a href='https://maxima.sourceforge.io/'>maxima.sourceforge.io</a></li>" +
                           "<li><strong>Linux:</strong> <code>sudo apt install maxima</code></li>" +
                           "<li><strong>macOS:</strong> <code>brew install maxima</code></li>" +
                           "</ul>" +
                           "<details><summary>C\u00f3digo enviado</summary><pre class='maxima-code'>" +
                           System.Net.WebUtility.HtmlEncode(content) + "</pre></details></div>";
                }

                // Substitute Hekatan variables into Maxima code
                var processed = SubstituteHekatanVarsForMaxima(content, variables);

                // Build batch string: prepend display2d:false and join all lines
                var batchString = "display2d:false$ " + processed.Replace('\r', ' ').Replace('\n', ' ');

                try
                {
                    System.Diagnostics.ProcessStartInfo startInfo;

                    if (maxima.IsDirect)
                    {
                        // Windows: call sbcl.exe directly with maxima.core (avoids cmd.exe /c .bat stdout issues)
                        startInfo = new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = maxima.SbclExe,
                            Arguments = $"--core \"{maxima.MaximaCore}\" --noinform --dynamic-space-size 2000 " +
                                        $"--end-runtime-options --eval \"(cl-user::run)\" --end-toplevel-options " +
                                        $"--very-quiet --init=\"\" --batch-string=\"{batchString.Replace("\"", "\\\"")}\"",
                            RedirectStandardOutput = true,
                            RedirectStandardError = true,
                            UseShellExecute = false,
                            CreateNoWindow = true,
                            StandardOutputEncoding = System.Text.Encoding.UTF8
                        };
                        // Set environment for Maxima
                        startInfo.Environment["SBCL_HOME"] = System.IO.Path.Combine(maxima.InstallDir, "bin");
                        startInfo.Environment["MAXIMA_PREFIX"] = maxima.InstallDir.Replace('\\', '/');
                        startInfo.Environment["MAXIMA_USERDIR"] = System.IO.Path.Combine(
                            System.IO.Path.GetTempPath(), "hekatan-maxima").Replace('\\', '/');
                    }
                    else
                    {
                        // Linux/macOS: call "maxima" directly
                        startInfo = new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = maxima.Command,
                            Arguments = $"--very-quiet --batch-string=\"{batchString.Replace("\"", "\\\"")}\"",
                            RedirectStandardOutput = true,
                            RedirectStandardError = true,
                            UseShellExecute = false,
                            CreateNoWindow = true,
                            StandardOutputEncoding = System.Text.Encoding.UTF8
                        };
                    }

                    using var process = new System.Diagnostics.Process { StartInfo = startInfo };
                    process.Start();

                    var stdout = process.StandardOutput.ReadToEnd();
                    var stderr = process.StandardError.ReadToEnd();
                    process.WaitForExit(30000); // 30 second timeout

                    if (!process.HasExited)
                    {
                        process.Kill();
                        return "<div style='color: red;'>Error: Maxima timeout (30s)</div>";
                    }

                    // Parse and format the output
                    return FormatMaximaOutput(content, stdout, stderr, variables);
                }
                catch (Exception ex)
                {
                    return $"<div style='color: red;'>Error ejecutando Maxima: {System.Net.WebUtility.HtmlEncode(ex.Message)}</div>";
                }
            }
            catch (Exception ex)
            {
                return $"<div style='color: red;'>Error in @{{maxima}} block: {System.Net.WebUtility.HtmlEncode(ex.Message)}</div>";
            }
        }

        /// <summary>
        /// Maxima installation info: sbcl.exe path + maxima.core path + install dir
        /// </summary>
        private class MaximaInstallInfo
        {
            public string SbclExe { get; set; } = "";
            public string MaximaCore { get; set; } = "";
            public string InstallDir { get; set; } = "";
            public bool IsDirect { get; set; } // true = sbcl.exe direct, false = "maxima" in PATH (Linux/macOS)
            public string Command { get; set; } = ""; // For non-Windows: "maxima"
        }

        /// <summary>
        /// Find the Maxima installation. On Windows, returns sbcl.exe + maxima.core paths
        /// to call SBCL directly (avoids cmd.exe /c maxima.bat stdout issues).
        /// On Linux/macOS, returns "maxima" command.
        /// </summary>
        private MaximaInstallInfo? FindMaximaInstall()
        {
            // On Windows: find sbcl.exe + maxima.core for direct execution
            if (OperatingSystem.IsWindows())
            {
                var searchDirs = new[] {
                    @"C:\",
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                };

                foreach (var baseDir in searchDirs)
                {
                    if (string.IsNullOrEmpty(baseDir)) continue;
                    try
                    {
                        var maximaDirs = System.IO.Directory.GetDirectories(baseDir, "maxima*")
                            .OrderByDescending(d => d);
                        foreach (var maximaDir in maximaDirs)
                        {
                            var sbclPath = System.IO.Path.Combine(maximaDir, "bin", "sbcl.exe");
                            if (!System.IO.File.Exists(sbclPath)) continue;

                            // Find maxima.core in lib/maxima/*/binary-sbcl/
                            var libDir = System.IO.Path.Combine(maximaDir, "lib", "maxima");
                            if (!System.IO.Directory.Exists(libDir)) continue;

                            foreach (var versionDir in System.IO.Directory.GetDirectories(libDir).OrderByDescending(d => d))
                            {
                                var corePath = System.IO.Path.Combine(versionDir, "binary-sbcl", "maxima.core");
                                if (System.IO.File.Exists(corePath))
                                {
                                    return new MaximaInstallInfo
                                    {
                                        SbclExe = sbclPath,
                                        MaximaCore = corePath.Replace('\\', '/'),
                                        InstallDir = maximaDir,
                                        IsDirect = true
                                    };
                                }
                            }
                        }
                    }
                    catch { }
                }
                return null;
            }

            // Linux/macOS: try "maxima" in PATH
            try
            {
                var testInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "maxima",
                    Arguments = "--version",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using var test = System.Diagnostics.Process.Start(testInfo);
                if (test != null)
                {
                    test.WaitForExit(5000);
                    if (test.ExitCode == 0)
                        return new MaximaInstallInfo { IsDirect = false, Command = "maxima" };
                }
            }
            catch { }

            return null;
        }

        /// <summary>
        /// Substitute Hekatan variables into Maxima code using $varName syntax
        /// </summary>
        private string SubstituteHekatanVarsForMaxima(string content, Dictionary<string, object> variables)
        {
            if (variables == null || variables.Count == 0)
                return content;

            var result = content;
            // Sort by length descending to avoid partial replacements
            foreach (var kvp in variables.OrderByDescending(k => k.Key.Length))
            {
                var varName = kvp.Key;
                var value = kvp.Value;

                string valueStr;
                if (value is double d)
                    valueStr = d.ToString(System.Globalization.CultureInfo.InvariantCulture);
                else if (value is int i)
                    valueStr = i.ToString();
                else
                    valueStr = value?.ToString() ?? "0";

                // Replace $varName with value
                result = result.Replace($"${varName}", valueStr);
            }
            return result;
        }

        /// <summary>
        /// Format Maxima output as HTML with input/output pairs.
        /// Handles both --very-quiet --batch format (no %o labels) and standard format (with %o labels).
        /// Batch format: Maxima echoes each input line then prints its result on the next line.
        /// </summary>
        private string FormatMaximaOutput(string input, string stdout, string stderr, Dictionary<string, object> variables)
        {
            var sb = new System.Text.StringBuilder();
            _maximaBlockCounter++;
            sb.AppendLine("<div class='maxima-block maxima-clean'>");

            // Get user input lines (what they wrote in @{maxima} block)
            var inputLines = input.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .ToArray();

            // Parse stdout lines
            var outputLines = stdout.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .ToArray();

            // Check if output uses (%oN) format or batch echo format
            bool hasOLabels = outputLines.Any(l => System.Text.RegularExpressions.Regex.IsMatch(l.Trim(), @"^\(%o\d+\)"));

            // Extract CALCPAD: variable exports from output
            foreach (var line in outputLines)
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith("CALCPAD:", StringComparison.OrdinalIgnoreCase))
                {
                    var eqIdx = trimmed.IndexOf('=', 8);
                    if (eqIdx > 8)
                    {
                        var varName = trimmed.Substring(8, eqIdx - 8).Trim();
                        var varValue = trimmed.Substring(eqIdx + 1).Trim();
                        if (double.TryParse(varValue, System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var numVal))
                        {
                            _exportedVariables[varName] = numVal;
                        }
                        else
                        {
                            _exportedVariables[varName] = varValue;
                        }
                    }
                }
            }

            // Build results list depending on format
            var results = new List<string>();

            if (hasOLabels)
            {
                // Standard format: extract (%oN) results
                foreach (var line in outputLines)
                {
                    var match = System.Text.RegularExpressions.Regex.Match(line.Trim(), @"^\(%o\d+\)\s*(.*)$");
                    if (match.Success)
                        results.Add(match.Groups[1].Value.Trim());
                }
            }
            else
            {
                // Batch echo format with --very-quiet:
                // Maxima echoes every input, but only prints a result for lines ending with ;
                // Lines ending with $ produce echo only (no result).
                // Pattern: echo_$, echo_$, echo_;, result, echo_;, result, ...
                var contentLines = outputLines
                    .Where(l =>
                    {
                        var t = l.Trim();
                        return !t.StartsWith("batch(") &&
                               !string.IsNullOrWhiteSpace(t) &&
                               !t.StartsWith("read and interpret") &&
                               !t.StartsWith("CALCPAD:") &&
                               !(t.StartsWith("\"") && t.EndsWith("\"")) &&
                               !string.Equals(t, "display2d:false", StringComparison.OrdinalIgnoreCase);
                    })
                    .ToList();

                // Build user input list (non-comment, non-empty) to know ; vs $ endings
                var userInputs = inputLines
                    .Select(l => l.Trim())
                    .Where(l => !string.IsNullOrWhiteSpace(l) && !l.StartsWith("/*") &&
                                !l.StartsWith("display2d"))
                    .ToList();

                // Walk through content lines, matching to user inputs
                int contentIdx = 0;
                foreach (var userLine in userInputs)
                {
                    if (contentIdx >= contentLines.Count) break;

                    // Skip the echo line (Maxima's re-formatted version of user input)
                    contentIdx++;

                    bool produceOutput = userLine.TrimEnd().EndsWith(";");
                    if (produceOutput && contentIdx < contentLines.Count)
                    {
                        // The next line is the result
                        results.Add(contentLines[contentIdx].Trim());
                        contentIdx++;
                    }
                    else if (produceOutput)
                    {
                        results.Add(""); // No result available
                    }
                    // For $ lines, just skip (no result)
                }
            }

            // Build elegant Hekatan-style output: equation = result (no In/Out labels, no table)
            int resultIdx = 0;
            bool inComment = false;
            string pendingComment = "";
            foreach (var inputLine in inputLines)
            {
                var trimmedInput = inputLine.Trim();

                // Track multi-line comments → render as description text
                if (trimmedInput.StartsWith("/*"))
                {
                    inComment = true;
                    var commentText = trimmedInput.Replace("/*", "").Replace("*/", "").Trim();
                    if (!string.IsNullOrWhiteSpace(commentText))
                        pendingComment = commentText;
                    if (trimmedInput.Contains("*/")) inComment = false;
                    continue;
                }
                if (inComment)
                {
                    if (trimmedInput.Contains("*/"))
                    {
                        var commentText = trimmedInput.Replace("*/", "").Trim();
                        if (!string.IsNullOrWhiteSpace(commentText))
                            pendingComment += (pendingComment.Length > 0 ? " " : "") + commentText;
                        inComment = false;
                    }
                    else
                    {
                        var commentText = trimmedInput.Trim(' ', '*');
                        if (!string.IsNullOrWhiteSpace(commentText))
                            pendingComment += (pendingComment.Length > 0 ? " " : "") + commentText;
                    }
                    continue;
                }

                // Skip display2d and empty lines
                if (trimmedInput.StartsWith("display2d") || string.IsNullOrWhiteSpace(trimmedInput))
                    continue;

                // Skip function definitions that end with := (just define, no result)
                bool isFuncDef = trimmedInput.Contains(":=");

                // Emit pending comment as description
                if (!string.IsNullOrWhiteSpace(pendingComment))
                {
                    sb.AppendLine($"<p class='maxima-desc'>{System.Net.WebUtility.HtmlEncode(pendingComment)}</p>");
                    pendingComment = "";
                }

                // Extract variable name from assignment: "varname: expr;" or "varname: expr$"
                string? varName = null;
                string? exprPart = null;
                var assignMatch = System.Text.RegularExpressions.Regex.Match(trimmedInput, @"^(\w+)\s*:\s*(.+?)\s*[;$]\s*$");
                if (assignMatch.Success && !isFuncDef)
                {
                    varName = assignMatch.Groups[1].Value;
                    exprPart = assignMatch.Groups[2].Value;
                }

                // Get result for this line (if it produces output)
                string? resultValue = null;
                if (!trimmedInput.EndsWith("$") && resultIdx < results.Count)
                {
                    resultValue = results[resultIdx];
                    resultIdx++;
                }
                else if (trimmedInput.EndsWith("$"))
                {
                    // Silent assignment - no result shown
                }

                // Render as equation
                if (varName != null && exprPart != null)
                {
                    // Assignment: varName = expression = result
                    var lhs = FormatMaximaExpression(varName);
                    var rhs = FormatMaximaExpression(exprPart);
                    if (!string.IsNullOrWhiteSpace(resultValue) && resultValue != exprPart.Trim())
                    {
                        var resHtml = FormatMaximaExpression(resultValue);
                        sb.AppendLine($"<p class='maxima-eq'>{lhs} = {rhs} = <b>{resHtml}</b></p>");
                    }
                    else if (!string.IsNullOrWhiteSpace(resultValue))
                    {
                        sb.AppendLine($"<p class='maxima-eq'>{lhs} = <b>{FormatMaximaExpression(resultValue)}</b></p>");
                    }
                    else
                    {
                        sb.AppendLine($"<p class='maxima-eq'>{lhs} = {rhs}</p>");
                    }
                }
                else if (isFuncDef)
                {
                    // Function definition: show as definition
                    sb.AppendLine($"<p class='maxima-eq'>{FormatMaximaExpression(trimmedInput.TrimEnd(';', '$'))}</p>");
                }
                else if (!string.IsNullOrWhiteSpace(resultValue))
                {
                    // Expression without assignment: show expression = result
                    var exprHtml = FormatMaximaExpression(trimmedInput.TrimEnd(';', '$'));
                    var resHtml = FormatMaximaExpression(resultValue);
                    sb.AppendLine($"<p class='maxima-eq'>{exprHtml} = <b>{resHtml}</b></p>");
                }
                else if (!trimmedInput.EndsWith("$"))
                {
                    // Expression without result
                    sb.AppendLine($"<p class='maxima-eq'>{FormatMaximaExpression(trimmedInput.TrimEnd(';', '$'))}</p>");
                }
            }

            // Show exported variables
            if (_exportedVariables.Count > 0)
            {
                sb.AppendLine("<div class='maxima-export'>");
                foreach (var kvp in _exportedVariables)
                {
                    sb.Append($"<span class='var-name'>{System.Net.WebUtility.HtmlEncode(kvp.Key)}</span> = ");
                    sb.AppendLine($"<span class='var-value'>{System.Net.WebUtility.HtmlEncode(kvp.Value?.ToString() ?? "")}</span><br/>");
                }
                sb.AppendLine("</div>");
            }

            // Show stderr if any (warnings/errors from Maxima)
            if (!string.IsNullOrWhiteSpace(stderr))
            {
                var stderrClean = stderr.Trim();
                if (!string.IsNullOrEmpty(stderrClean))
                {
                    sb.AppendLine("<div class='maxima-warning'>");
                    sb.Append("Warning: ");
                    sb.Append(System.Net.WebUtility.HtmlEncode(stderrClean));
                    sb.AppendLine("</div>");
                }
            }

            sb.AppendLine("</div>");
            return sb.ToString();
        }

        /// <summary>
        /// Format a Maxima expression with HTML: render matrices, highlight constants,
        /// convert mathematical functions to symbols (integrate→∫, diff→∂, sum→Σ, etc.)
        /// </summary>
        private static string FormatMaximaExpression(string expr)
        {
            if (string.IsNullOrWhiteSpace(expr)) return "";

            var trimmed = expr.Trim();

            // Render matrix(...) as an HTML table
            if (trimmed.StartsWith("matrix("))
            {
                return RenderMaximaMatrix(trimmed);
            }

            // HTML-encode the expression first
            var html = System.Net.WebUtility.HtmlEncode(trimmed);

            // Replace Maxima special constants with styled spans
            html = System.Text.RegularExpressions.Regex.Replace(html, @"%pi\b", "<span class='maxima-const'>&pi;</span>");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"%e\b", "<span class='maxima-const'>e</span>");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"%i\b", "<span class='maxima-const'>i</span>");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\binf\b", "<span class='maxima-const'>&infin;</span>");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\bminf\b", "<span class='maxima-const'>-&infin;</span>");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"%c\b", "<span class='maxima-const'>C</span>");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"%k1\b", "<span class='maxima-const'>C&#x2081;</span>");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"%k2\b", "<span class='maxima-const'>C&#x2082;</span>");

            // Replace mathematical function names with symbols (only when followed by '(')
            // integrate( → ∫(
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\bintegrate\(", "<span class='maxima-const' title='integrate'>&#x222B;</span>(");
            // diff( → ∂(
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\bdiff\(", "<span class='maxima-const' title='diff'>&#x2202;</span>(");
            // sum( → Σ(
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\bsum\(", "<span class='maxima-const' title='sum'>&Sigma;</span>(");
            // product( → Π(
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\bproduct\(", "<span class='maxima-const' title='product'>&Pi;</span>(");
            // limit( → lim(
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\blimit\(", "<span class='maxima-const' title='limit'>lim</span>(");
            // sqrt( → √(
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\bsqrt\(", "<span class='maxima-const' title='sqrt'>&#x221A;</span>(");
            // abs( → |·|(
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\babs\(", "<span class='maxima-const' title='abs'>|&middot;|</span>(");
            // gamma_function( → Γ(
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\bgamma\(", "<span class='maxima-const' title='gamma'>&Gamma;</span>(");

            // Replace ** with superscript notation
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\*\*(\d+)", "<sup>$1</sup>");
            // Replace ^N with superscript (single digit or parenthesized)
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\^(\d+)", "<sup>$1</sup>");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\^\(([^)]+)\)", "<sup>$1</sup>");

            // Clean up multiplication: replace * between letter/number and letter with · (middle dot)
            // But keep * in contexts like [a=30000,nu=0.2] (subst lists)
            html = System.Text.RegularExpressions.Regex.Replace(html, @"(?<=[\w\)])(\*)(?=[\w\(])", "&middot;");

            // Replace subst(...) with readable format
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\bsubst\(", "eval(");

            // Render fractions as Hekatan-style vertical fractions using dvc/dvl classes
            html = RenderMaximaFractions(html);

            return $"<span class='maxima-expr'>{html}</span>";
        }

        /// <summary>
        /// Render a Maxima matrix(...) expression as an HTML table with bracket borders.
        /// Input format: matrix([a,b,c],[d,e,f],[g,h,i])
        /// </summary>
        private static string RenderMaximaMatrix(string matrixExpr)
        {
            try
            {
                // Extract content between matrix( and final )
                var content = matrixExpr.Substring(7, matrixExpr.Length - 8); // Remove "matrix(" and ")"

                // Parse rows: split by ],[ pattern
                var rows = new List<List<string>>();
                var currentRow = new List<string>();
                int depth = 0;
                var cell = new System.Text.StringBuilder();

                for (int i = 0; i < content.Length; i++)
                {
                    char c = content[i];
                    if (c == '[')
                    {
                        depth++;
                        if (depth == 1) continue; // Skip opening bracket of row
                    }
                    else if (c == ']')
                    {
                        depth--;
                        if (depth == 0)
                        {
                            // End of row
                            if (cell.Length > 0) currentRow.Add(cell.ToString().Trim());
                            cell.Clear();
                            if (currentRow.Count > 0) rows.Add(currentRow);
                            currentRow = new List<string>();
                            continue;
                        }
                    }
                    else if (c == ',' && depth == 1)
                    {
                        // Cell separator within a row
                        currentRow.Add(cell.ToString().Trim());
                        cell.Clear();
                        continue;
                    }
                    else if (c == ',' && depth == 0)
                    {
                        // Row separator
                        continue;
                    }

                    if (depth >= 1) cell.Append(c);
                }

                if (rows.Count == 0) return System.Net.WebUtility.HtmlEncode(matrixExpr);

                // Build HTML table using same structure as native Hekatan matrices
                // Empty bracket cells at first/last position form the [ ] brackets
                var sb = new System.Text.StringBuilder();
                sb.Append("<span class='maxima-matrix'>");
                foreach (var row in rows)
                {
                    sb.Append("<span class='mrow'>");
                    sb.Append("<span class='mcell mbracket'></span>"); // Left bracket cell
                    foreach (var val in row)
                    {
                        sb.Append("<span class='mcell'>");
                        var cellHtml = FormatMaximaExpression(val);
                        sb.Append(cellHtml);
                        sb.Append("</span>");
                    }
                    sb.Append("<span class='mcell mbracket'></span>"); // Right bracket cell
                    sb.Append("</span>");
                }
                sb.Append("</span>");
                return sb.ToString();
            }
            catch
            {
                return System.Net.WebUtility.HtmlEncode(matrixExpr);
            }
        }

        /// <summary>
        /// Render fractions (A/B) as vertical Hekatan-style fractions using dvc/dvl HTML classes.
        /// Handles: simple fractions (2/3), negative fractions -(2/3), complex fractions d/(a*d-b*c).
        /// Works on already-HTML-encoded text (so / is literal, not encoded).
        /// </summary>
        private static string RenderMaximaFractions(string html)
        {
            if (!html.Contains("/")) return html;

            var result = new System.Text.StringBuilder();
            int i = 0;
            while (i < html.Length)
            {
                // Look for fraction pattern: try to find '/' that represents division
                int slashPos = html.IndexOf('/', i);
                if (slashPos < 0)
                {
                    result.Append(html, i, html.Length - i);
                    break;
                }

                // Skip if slash is inside an HTML tag
                if (IsInsideHtmlTag(html, slashPos))
                {
                    result.Append(html, i, slashPos - i + 1);
                    i = slashPos + 1;
                    continue;
                }

                // Extract numerator (before /) and denominator (after /)
                string numerator, denominator;
                int fracStart, fracEnd;
                bool isNegative = false;

                // Get numerator: walk backwards from slash
                int numEnd = slashPos - 1;
                if (numEnd < i)
                {
                    result.Append(html, i, slashPos - i + 1);
                    i = slashPos + 1;
                    continue;
                }

                // Check if numerator ends with ')' - find matching '('
                if (html[numEnd] == ')')
                {
                    int parenStart = FindMatchingOpenParen(html, numEnd);
                    if (parenStart < i)
                    {
                        result.Append(html, i, slashPos - i + 1);
                        i = slashPos + 1;
                        continue;
                    }
                    numerator = html.Substring(parenStart + 1, numEnd - parenStart - 1);
                    fracStart = parenStart;

                    // Check for leading negative sign: -(numerator)/denominator
                    if (fracStart > i && html[fracStart - 1] == '-')
                    {
                        isNegative = true;
                        fracStart--;
                    }
                }
                else
                {
                    // Simple numerator: walk backwards through alphanumeric/dot/html-entity chars
                    int numStart = numEnd;
                    while (numStart > i && IsPartOfToken(html, numStart - 1))
                        numStart--;
                    if (numStart > numEnd)
                    {
                        result.Append(html, i, slashPos - i + 1);
                        i = slashPos + 1;
                        continue;
                    }
                    numerator = html.Substring(numStart, numEnd - numStart + 1);
                    fracStart = numStart;
                }

                // Get denominator: walk forward from slash
                int denStart = slashPos + 1;
                if (denStart >= html.Length)
                {
                    result.Append(html, i, html.Length - i);
                    break;
                }

                // Check if denominator starts with '(' - find matching ')'
                if (html[denStart] == '(')
                {
                    int parenEnd = FindMatchingCloseParen(html, denStart);
                    if (parenEnd < 0)
                    {
                        result.Append(html, i, slashPos - i + 1);
                        i = slashPos + 1;
                        continue;
                    }
                    denominator = html.Substring(denStart + 1, parenEnd - denStart - 1);
                    fracEnd = parenEnd + 1;
                }
                else
                {
                    // Simple denominator: walk forward through alphanumeric/dot/html-entity chars
                    int denEnd = denStart;
                    while (denEnd < html.Length - 1 && IsPartOfToken(html, denEnd + 1))
                        denEnd++;
                    denominator = html.Substring(denStart, denEnd - denStart + 1);
                    fracEnd = denEnd + 1;
                }

                // Skip empty fractions
                if (string.IsNullOrWhiteSpace(numerator) || string.IsNullOrWhiteSpace(denominator))
                {
                    result.Append(html, i, slashPos - i + 1);
                    i = slashPos + 1;
                    continue;
                }

                // Emit everything before the fraction
                result.Append(html, i, fracStart - i);

                // Emit the fraction as Hekatan-style vertical fraction
                if (isNegative)
                    result.Append("−"); // Unicode minus sign
                result.Append("<span class='dvc'>");
                result.Append(FormatFractionPart(numerator));
                result.Append("<span class='dvl'></span>");
                result.Append(FormatFractionPart(denominator));
                result.Append("</span>");

                i = fracEnd;
            }

            var output = result.ToString();

            // Post-process: convert normal parentheses that wrap a fraction into tall parentheses.
            // Searches for "(<span class='dvc'>...nested spans...</span>)" and replaces the outer
            // ( and ) with <span class='b1'>(</span> and <span class='b1'>)</span>.
            output = UpgradeFractionParentheses(output);

            return output;
        }

        /// <summary>
        /// Format a fraction part: replace * with · for cleaner display
        /// </summary>
        private static string FormatFractionPart(string part)
        {
            return part.Replace("*", "·");
        }

        /// <summary>
        /// Post-process fraction HTML: find normal parentheses "(" and ")" that immediately wrap
        /// a <span class='dvc'>...</span> fraction block, and replace them with tall parentheses
        /// using Hekatan's .b1 CSS class (240% font-size, vertically centered).
        /// </summary>
        private static string UpgradeFractionParentheses(string html)
        {
            const string dvcOpen = "<span class='dvc'>";
            const string tallOpen = "<span class='b1'>(</span>";
            const string tallClose = "<span class='b1'>)</span>";

            var sb = new StringBuilder(html.Length + 100);
            int i = 0;

            while (i < html.Length)
            {
                // Look for "(" immediately before "<span class='dvc'>"
                if (html[i] == '(' && i + dvcOpen.Length < html.Length &&
                    html.Substring(i + 1, dvcOpen.Length) == dvcOpen)
                {
                    // Find the matching closing </span> for this dvc
                    int dvcStart = i + 1;
                    int dvcEnd = FindClosingSpan(html, dvcStart);
                    if (dvcEnd > 0 && dvcEnd < html.Length - 1 && html[dvcEnd + 1] == ')')
                    {
                        // Replace ( with tall ( and ) with tall )
                        sb.Append(tallOpen);
                        sb.Append(html, dvcStart, dvcEnd + 1 - dvcStart);
                        sb.Append(tallClose);
                        i = dvcEnd + 2; // Skip past the closing )
                        continue;
                    }
                }
                sb.Append(html[i]);
                i++;
            }

            return sb.ToString();
        }

        /// <summary>
        /// Finds the closing </span> that matches the opening <span at position pos.
        /// Handles nested spans correctly by counting depth.
        /// Returns the index of the '>' of the closing </span>.
        /// </summary>
        private static int FindClosingSpan(string html, int pos)
        {
            // pos should point to '<' of opening <span...>
            // Find the end of the opening tag first
            int tagEnd = html.IndexOf('>', pos);
            if (tagEnd < 0) return -1;

            int depth = 1;
            int j = tagEnd + 1;
            while (j < html.Length && depth > 0)
            {
                if (html[j] == '<')
                {
                    // Check for <span or </span>
                    if (j + 5 < html.Length && html.Substring(j, 5) == "<span")
                    {
                        depth++;
                        j += 5;
                        continue;
                    }
                    if (j + 7 <= html.Length && html.Substring(j, 7) == "</span>")
                    {
                        depth--;
                        if (depth == 0)
                            return j + 6; // Return index of '>' of </span>
                        j += 7;
                        continue;
                    }
                }
                j++;
            }
            return -1;
        }

        /// <summary>
        /// Check if a character is part of an alphanumeric/expression token (for fraction parsing)
        /// </summary>
        private static bool IsPartOfToken(string html, int pos)
        {
            char c = html[pos];
            // Alphanumeric, dot, underscore
            if (char.IsLetterOrDigit(c) || c == '.' || c == '_') return true;
            // HTML entities like &pi; - check if we're inside &...;
            if (c == ';')
            {
                // Walk backwards to find &
                for (int j = pos - 1; j >= 0 && j > pos - 10; j--)
                {
                    if (html[j] == '&') return true;
                    if (!char.IsLetterOrDigit(html[j]) && html[j] != '#') break;
                }
            }
            if (c == '&') return true;
            // Inside HTML entity
            if (c == '#') return true;
            return false;
        }

        /// <summary>
        /// Check if a position in the string is inside an HTML tag (between &lt; and &gt;)
        /// </summary>
        private static bool IsInsideHtmlTag(string html, int pos)
        {
            // Walk backwards to find < or >
            for (int j = pos - 1; j >= 0; j--)
            {
                if (html[j] == '>') return false; // Found closing tag first, we're outside
                if (html[j] == '<') return true;   // Found opening tag first, we're inside
            }
            return false;
        }

        /// <summary>
        /// Find matching opening parenthesis for a closing one
        /// </summary>
        private static int FindMatchingOpenParen(string html, int closePos)
        {
            int depth = 0;
            for (int j = closePos; j >= 0; j--)
            {
                if (html[j] == ')') depth++;
                else if (html[j] == '(') { depth--; if (depth == 0) return j; }
            }
            return -1;
        }

        /// <summary>
        /// Find matching closing parenthesis for an opening one
        /// </summary>
        private static int FindMatchingCloseParen(string html, int openPos)
        {
            int depth = 0;
            for (int j = openPos; j < html.Length; j++)
            {
                if (html[j] == '(') depth++;
                else if (html[j] == ')') { depth--; if (depth == 0) return j; }
            }
            return -1;
        }

        /// <summary>
        /// Normalize a Maxima expression for comparison: remove spaces, *, parens differences
        /// </summary>
        private static string NormalizeMaximaExpr(string expr)
        {
            if (string.IsNullOrEmpty(expr)) return "";
            var s = expr.Trim().TrimEnd(';', '$');
            // Remove all whitespace
            s = System.Text.RegularExpressions.Regex.Replace(s, @"\s+", "");
            // Normalize quotes
            s = s.Replace("'", "").Replace("\"", "");
            return s.ToLowerInvariant();
        }

        /// <summary>
        /// Check if two Maxima expressions are likely the same input
        /// (Maxima reformats expressions when echoing them)
        /// </summary>
        private static bool MaximaExprsMatch(string userNorm, string echoNorm)
        {
            if (string.IsNullOrEmpty(userNorm) || string.IsNullOrEmpty(echoNorm)) return false;
            // Direct match
            if (userNorm == echoNorm) return true;
            // Check if one contains the other (Maxima may add parens or rewrite)
            if (userNorm.Contains(echoNorm) || echoNorm.Contains(userNorm)) return true;
            // Compare ignoring parentheses
            var u = userNorm.Replace("(", "").Replace(")", "");
            var e = echoNorm.Replace("(", "").Replace(")", "");
            if (u == e) return true;
            // Check first significant chars match (Maxima may reformulate slightly)
            var minLen = Math.Min(u.Length, e.Length);
            if (minLen >= 6)
            {
                var prefix = Math.Min(minLen, 12);
                if (u.Substring(0, prefix) == e.Substring(0, prefix)) return true;
            }
            return false;
        }

        private string ProcessTableBlock(string content, Dictionary<string, object> variables)
        {
            try
            {
                var lines = content.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(l => l.Trim())
                    .Where(l => !string.IsNullOrEmpty(l))
                    .ToList();

                if (lines.Count == 0)
                    return "<p style='color:red;'>Error: Bloque @{table} vacío</p>";

                // Check if first line starts with "headers:" - this means inline data mode
                var firstLine = lines[0];
                if (firstLine.StartsWith("headers:", StringComparison.OrdinalIgnoreCase))
                {
                    return ProcessInlineTableData(lines);
                }

                // Original mode: First line should be the matrix/vector name
                var matrixName = lines[0];
                string[] headers = null;
                string[] rowHeaders = null;
                string style = "bordered";
                string exportFile = null;

                // Parse options from remaining lines
                for (int i = 1; i < lines.Count; i++)
                {
                    var line = lines[i].ToLower();
                    if (line.StartsWith("headers="))
                        headers = lines[i].Substring(8).Split(',').Select(h => h.Trim()).ToArray();
                    else if (line.StartsWith("rows="))
                        rowHeaders = lines[i].Substring(5).Split(',').Select(r => r.Trim()).ToArray();
                    else if (line.StartsWith("style="))
                        style = lines[i].Substring(6).Trim().ToLower();
                    else if (line.StartsWith("export="))
                        exportFile = lines[i].Substring(7).Trim();
                }

                // Get matrix/vector from variables
                if (!variables.TryGetValue(matrixName, out var data))
                    return $"<p style='color:red;'>Error: Variable '{matrixName}' no encontrada</p>";

                // Convert to 2D array if needed
                double[,] matrix;
                if (data is double[,] m)
                    matrix = m;
                else if (data is double[] arr)
                {
                    // Convert vector to single-row or single-column matrix
                    matrix = new double[1, arr.Length];
                    for (int j = 0; j < arr.Length; j++)
                        matrix[0, j] = arr[j];
                }
                else if (data is double d)
                {
                    // Single value
                    matrix = new double[1, 1] { { d } };
                }
                else
                    return $"<p style='color:red;'>Error: '{matrixName}' no es un matriz/vector numérico</p>";

                // Generate HTML table
                var sb = new StringBuilder();
                var tableStyle = GetTableStyle(style);

                sb.Append($"<table style='{tableStyle}'>");

                // Header row
                if (headers != null && headers.Length > 0)
                {
                    sb.Append("<thead><tr>");
                    if (rowHeaders != null) sb.Append("<th></th>"); // Empty corner cell
                    foreach (var h in headers)
                        sb.Append($"<th style='padding: 8px; text-align: center;'>{System.Web.HttpUtility.HtmlEncode(h)}</th>");
                    sb.Append("</tr></thead>");
                }

                // Data rows
                sb.Append("<tbody>");
                var rows = matrix.GetLength(0);
                var cols = matrix.GetLength(1);

                for (int i = 0; i < rows; i++)
                {
                    sb.Append("<tr>");

                    // Row header
                    if (rowHeaders != null && i < rowHeaders.Length)
                        sb.Append($"<th style='padding: 8px; text-align: left;'>{System.Web.HttpUtility.HtmlEncode(rowHeaders[i])}</th>");

                    // Data cells
                    for (int j = 0; j < cols; j++)
                    {
                        var value = matrix[i, j];
                        var formatted = FormatNumber(value);
                        sb.Append($"<td style='padding: 8px; text-align: right;'>{formatted}</td>");
                    }
                    sb.Append("</tr>");
                }
                sb.Append("</tbody></table>");

                // Export to file if requested
                if (!string.IsNullOrEmpty(exportFile))
                {
                    try
                    {
                        ExportTableToFile(matrix, headers, rowHeaders, exportFile);
                        sb.Append($"<p style='font-size:0.8em; color:#666;'>Exportado a: {System.Web.HttpUtility.HtmlEncode(exportFile)}</p>");
                    }
                    catch (Exception ex)
                    {
                        sb.Append($"<p style='color:orange;'>Advertencia: No se pudo exportar: {ex.Message}</p>");
                    }
                }

                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<p style='color:red;'>Error en @{{table}}: {ex.Message}</p>";
            }
        }

        /// <summary>
        /// Process inline table data with format:
        /// headers: Col1; Col2; Col3
        /// data1; data2; data3
        /// data4; data5; data6
        /// </summary>
        private string ProcessInlineTableData(List<string> lines)
        {
            try
            {
                var sb = new StringBuilder();
                string[] headers = null;
                var dataRows = new List<string[]>();
                string style = "bordered";

                foreach (var line in lines)
                {
                    var trimmed = line.Trim();

                    // Parse headers
                    if (trimmed.StartsWith("headers:", StringComparison.OrdinalIgnoreCase))
                    {
                        var headerContent = trimmed.Substring(8).Trim();
                        headers = headerContent.Split(';').Select(h => h.Trim()).ToArray();
                    }
                    // Parse style option
                    else if (trimmed.StartsWith("style:", StringComparison.OrdinalIgnoreCase))
                    {
                        style = trimmed.Substring(6).Trim().ToLower();
                    }
                    // Parse data row (contains semicolons)
                    else if (trimmed.Contains(";"))
                    {
                        var cells = trimmed.Split(';').Select(c => c.Trim()).ToArray();
                        dataRows.Add(cells);
                    }
                }

                // Build HTML table
                var tableStyle = GetTableStyle(style);
                sb.Append($"<table class=\"bordered\" style=\"{tableStyle}\">");

                // Header row
                if (headers != null && headers.Length > 0)
                {
                    sb.Append("<thead><tr>");
                    foreach (var h in headers)
                    {
                        sb.Append($"<th style=\"padding: 8px; text-align: center; border: 1px solid #333; background-color: #f0f0f0;\">{System.Web.HttpUtility.HtmlEncode(h)}</th>");
                    }
                    sb.Append("</tr></thead>");
                }

                // Data rows
                sb.Append("<tbody>");
                foreach (var row in dataRows)
                {
                    sb.Append("<tr>");
                    foreach (var cell in row)
                    {
                        // Try to format as number if possible
                        string formatted = cell;
                        if (double.TryParse(cell, System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out double numValue))
                        {
                            formatted = FormatNumber(numValue);
                        }
                        sb.Append($"<td style=\"padding: 8px; text-align: center; border: 1px solid #333;\">{System.Web.HttpUtility.HtmlEncode(formatted)}</td>");
                    }
                    sb.Append("</tr>");
                }
                sb.Append("</tbody></table>");

                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<p style='color:red;'>Error procesando tabla inline: {ex.Message}</p>";
            }
        }

        /// <summary>
        /// Get CSS style for table based on style name
        /// </summary>
        private string GetTableStyle(string style)
        {
            return style switch
            {
                "bordered" => "border-collapse: collapse; border: 1px solid #333; width: 100%;",
                "striped" => "border-collapse: collapse; width: 100%;",
                "minimal" => "border-collapse: collapse; width: 100%; border: none;",
                _ => "border-collapse: collapse; border: 1px solid #333; width: 100%;"
            };
        }

        /// <summary>
        /// Format number for table display
        /// </summary>
        private string FormatNumber(double value)
        {
            if (Math.Abs(value) < 1e-10) return "0";
            if (Math.Abs(value) >= 1e6 || Math.Abs(value) < 1e-3)
                return value.ToString("0.####E+0", System.Globalization.CultureInfo.InvariantCulture);
            return value.ToString("G6", System.Globalization.CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Process @{plot} block - generate SVG chart from vectors
        /// Syntax:
        ///   @{plot}
        ///   x: vectorX   or  x: [1; 2; 3]
        ///   y: vectorY   or  y: [4; 5; 6]
        ///   xlabel: "X axis label"
        ///   ylabel: "Y axis label"
        ///   title: "Chart Title"
        ///   xlim: min, max
        ///   ylim: min, max
        ///   grid: true|false
        ///   legend: "Serie Name"
        ///   color: #0000FF
        ///   style: solid|dash|dot
        ///   @{end plot}
        /// </summary>
        private string ProcessPlotBlock(string content, Dictionary<string, object> variables)
        {
            try
            {
                var lines = content.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(l => l.Trim())
                    .Where(l => !string.IsNullOrEmpty(l))
                    .ToList();

                if (lines.Count == 0)
                    return "<p style='color:red;'>Error: Bloque @{plot} vacío</p>";

                // Parse plot options - global settings
                string xData = null;
                string xlabel = "x", ylabel = "y", title = null;
                double? xmin = null, xmax = null, ymin = null, ymax = null;
                bool grid = true;
                bool showLegend = true;
                string background = "paper";  // "paper" (azul milimetrado) or "white" (blanco limpio)
                int width = 600, height = 400;
                int numPoints = 200;  // number of evaluation points for function: series

                // Multiple series support - track current series being configured
                var series = new List<PlotSeries>();
                PlotSeries currentSeries = null;

                // Default colors for multiple series (similar to Mathcad/Matlab)
                var defaultColors = new[] { "#0033CC", "#CC0000", "#006600", "#9900CC", "#FF6600", "#00CCCC", "#CC00CC", "#666666" };

                // Annotations: text, arrows, lines, shapes
                var annotations = new List<PlotAnnotation>();

                foreach (var line in lines)
                {
                    var colonIdx = line.IndexOf(':');
                    if (colonIdx <= 0) continue;

                    var key = line.Substring(0, colonIdx).Trim().ToLower();
                    var value = line.Substring(colonIdx + 1).Trim();

                    // Handle annotations specially (don't strip quotes yet)
                    if (key == "text" || key == "texto" || key == "label" || key == "etiqueta")
                    {
                        var annotation = ParseTextAnnotation(value);
                        if (annotation != null)
                            annotations.Add(annotation);
                        continue;
                    }
                    // Mathematical equation annotation (renders with proper math formatting)
                    if (key == "eq" || key == "equation" || key == "ecuacion" || key == "formula")
                    {
                        var annotation = ParseEquationAnnotation(value);
                        if (annotation != null)
                            annotations.Add(annotation);
                        continue;
                    }
                    if (key == "arrow" || key == "flecha")
                    {
                        var annotation = ParseArrowAnnotation(value);
                        if (annotation != null) annotations.Add(annotation);
                        continue;
                    }
                    if (key == "line" || key == "linea" || key == "hline" || key == "vline")
                    {
                        var annotation = ParseLineAnnotation(key, value);
                        if (annotation != null) annotations.Add(annotation);
                        continue;
                    }
                    if (key == "rect" || key == "rectangulo" || key == "circle" || key == "circulo")
                    {
                        var annotation = ParseShapeAnnotation(key, value);
                        if (annotation != null) annotations.Add(annotation);
                        continue;
                    }
                    // Projection lines from point to axes (like in derivative diagrams)
                    if (key == "proj" || key == "projection" || key == "proyeccion")
                    {
                        var annotation = ParseProjectionAnnotation(value);
                        if (annotation != null) annotations.Add(annotation);
                        continue;
                    }
                    // Axis tick labels (custom labels at specific positions)
                    if (key == "xtick" || key == "ytick" || key == "tickx" || key == "ticky")
                    {
                        var annotation = ParseTickAnnotation(key, value);
                        if (annotation != null) annotations.Add(annotation);
                        continue;
                    }
                    // Angle annotation (arc with label)
                    if (key == "angle" || key == "angulo")
                    {
                        var annotation = ParseAngleAnnotation(value);
                        if (annotation != null) annotations.Add(annotation);
                        continue;
                    }
                    // Dimension bracket/brace (curly braces)
                    if (key == "brace" || key == "bracket" || key == "llave")
                    {
                        var annotation = ParseBraceAnnotation(value);
                        if (annotation != null) annotations.Add(annotation);
                        continue;
                    }
                    // Filled point/dot marker
                    if (key == "point" || key == "punto" || key == "dot")
                    {
                        var annotation = ParsePointAnnotation(value);
                        if (annotation != null) annotations.Add(annotation);
                        continue;
                    }
                    // Dimension with double-headed arrow (like in technical drawings)
                    if (key == "dim" || key == "dimension" || key == "cota" || key == "measure")
                    {
                        var annotation = ParseDimensionAnnotation(value);
                        if (annotation != null) annotations.Add(annotation);
                        continue;
                    }

                    // Variable definition inside @{plot} block: var: A = 2
                    if (key == "var" || key == "let" || key == "define" || key == "def")
                    {
                        var eqPos = value.IndexOf('=');
                        if (eqPos > 0)
                        {
                            var vn = value.Substring(0, eqPos).Trim();
                            var ve = value.Substring(eqPos + 1).Trim();
                            if (double.TryParse(ve, System.Globalization.NumberStyles.Any,
                                System.Globalization.CultureInfo.InvariantCulture, out var dv))
                            {
                                variables[vn] = dv;
                            }
                        }
                        continue;
                    }

                    // Remove quotes from string values
                    if (value.StartsWith("\"") && value.EndsWith("\""))
                        value = value.Substring(1, value.Length - 2);
                    else if (value.StartsWith("'") && value.EndsWith("'"))
                        value = value.Substring(1, value.Length - 2);

                    // Check for numbered keys (y2, color2, etc.)
                    var numMatch = System.Text.RegularExpressions.Regex.Match(key, @"^(.+?)(\d+)$");
                    int seriesIndex = 0;
                    string baseKey = key;
                    if (numMatch.Success)
                    {
                        baseKey = numMatch.Groups[1].Value;
                        seriesIndex = int.Parse(numMatch.Groups[2].Value) - 1; // y2 -> index 1
                    }

                    // Ensure series list is large enough
                    while (series.Count <= seriesIndex)
                    {
                        var newSeries = new PlotSeries();
                        newSeries.Color = defaultColors[series.Count % defaultColors.Length];
                        series.Add(newSeries);
                    }

                    switch (baseKey)
                    {
                        case "x": xData = value; break;
                        case "y":
                            series[seriesIndex].YData = value;
                            currentSeries = series[seriesIndex];
                            break;
                        case "function":
                        case "f":
                        case "funcion":
                        case "func":
                            series[seriesIndex].FunctionExpr = value;
                            if (string.IsNullOrEmpty(series[seriesIndex].Legend))
                                series[seriesIndex].Legend = value;
                            currentSeries = series[seriesIndex];
                            break;
                        case "points":
                        case "n":
                        case "puntos":
                            if (int.TryParse(value, out var np) && np >= 2 && np <= 10000)
                                numPoints = np;
                            break;
                        case "xlabel": xlabel = value; break;
                        case "ylabel": ylabel = value; break;
                        case "title": title = value; break;
                        case "xlim":
                            var xlimParts = value.Split(',');
                            if (xlimParts.Length >= 2)
                            {
                                if (double.TryParse(xlimParts[0].Trim(), out var xminVal)) xmin = xminVal;
                                if (double.TryParse(xlimParts[1].Trim(), out var xmaxVal)) xmax = xmaxVal;
                            }
                            break;
                        case "ylim":
                            var ylimParts = value.Split(',');
                            if (ylimParts.Length >= 2)
                            {
                                if (double.TryParse(ylimParts[0].Trim(), out var yminVal)) ymin = yminVal;
                                if (double.TryParse(ylimParts[1].Trim(), out var ymaxVal)) ymax = ymaxVal;
                            }
                            break;
                        case "grid":
                            grid = !value.Equals("false", StringComparison.OrdinalIgnoreCase) &&
                                   !value.Equals("0", StringComparison.OrdinalIgnoreCase);
                            break;
                        case "showlegend":
                        case "mostrarleyenda":
                            if (value.Equals("false", StringComparison.OrdinalIgnoreCase) ||
                                value.Equals("0", StringComparison.OrdinalIgnoreCase) ||
                                value.Equals("no", StringComparison.OrdinalIgnoreCase))
                                showLegend = false;
                            break;
                        case "background":
                        case "bg":
                        case "fondo":
                            background = value.ToLower();
                            break;
                        case "legend":
                            series[seriesIndex].Legend = value;
                            break;
                        case "color":
                            series[seriesIndex].Color = value;
                            break;
                        case "style":
                            series[seriesIndex].LineStyle = value.ToLower();
                            break;
                        case "symbol":
                        case "marker":
                            series[seriesIndex].Symbol = value.ToLower();
                            break;
                        case "symbolsize":
                        case "markersize":
                            if (int.TryParse(value, out var ss)) series[seriesIndex].SymbolSize = ss;
                            break;
                        case "linewidth":
                        case "lw":
                            if (double.TryParse(value, System.Globalization.NumberStyles.Any,
                                System.Globalization.CultureInfo.InvariantCulture, out var lw))
                                series[seriesIndex].LineWidth = lw;
                            break;
                        case "width":
                            if (int.TryParse(value, out var w)) width = w;
                            break;
                        case "height":
                            if (int.TryParse(value, out var h)) height = h;
                            break;
                        case "smooth":
                        case "suavizado":
                        case "spline":
                            series[seriesIndex].Smooth = !value.Equals("false", StringComparison.OrdinalIgnoreCase) &&
                                     !value.Equals("0", StringComparison.OrdinalIgnoreCase) &&
                                     !value.Equals("no", StringComparison.OrdinalIgnoreCase);
                            break;
                        case "tension":
                        case "smoothtension":
                            if (double.TryParse(value, System.Globalization.NumberStyles.Any,
                                System.Globalization.CultureInfo.InvariantCulture, out var t))
                                series[seriesIndex].SmoothTension = Math.Max(0, Math.Min(1, t));
                            break;
                    }
                }

                // Evaluate function: expressions using MathParser
                var funcSeries = series.Where(s => !string.IsNullOrEmpty(s.FunctionExpr)).ToList();
                if (funcSeries.Count > 0)
                {
                    // If no x data provided, generate from xlim
                    if (xData == null)
                    {
                        double fxmin = xmin ?? -5;
                        double fxmax = xmax ?? 5;
                        var xGenerated = new double[numPoints];
                        for (int i = 0; i < numPoints; i++)
                            xGenerated[i] = fxmin + i * (fxmax - fxmin) / (numPoints - 1);
                        xData = string.Join(", ", xGenerated.Select(v =>
                            v.ToString(System.Globalization.CultureInfo.InvariantCulture)));
                    }

                    // Get x values to evaluate at
                    double[] evalXValues = GetPlotData(xData, variables);
                    if (evalXValues == null || evalXValues.Length < 2)
                        return "<p style='color:red;'>Error: No se pudieron generar valores x para funciones</p>";

                    // Create MathParser for function evaluation
                    var mathSettings = new Hekatan.Core.MathSettings
                    {
                        Decimals = 10,
                        Degrees = 1,  // radians
                        FormatEquations = false,
                        Substitute = false,
                    };
                    var mathParser = new Hekatan.Core.MathParser(mathSettings);
                    mathParser.IsEnabled = true;
                    mathParser.IsCalculation = true;

                    // Inject functions defined in @{function} blocks
                    if (variables != null &&
                        variables.TryGetValue("__function_definitions__", out var plotFuncDefsObj) &&
                        plotFuncDefsObj is List<string> plotFuncDefs)
                    {
                        foreach (var def in plotFuncDefs)
                        {
                            try { mathParser.Parse(def); mathParser.Calculate(false); } catch { }
                        }
                    }

                    // Build variable substitution list sorted by name length descending
                    // (longer names first to avoid partial replacements, e.g. "omega" before "o")
                    // MathParser uses single-char variables, so multi-char names like "omega"
                    // must be substituted textually before parsing
                    var varSubstitutions = new List<(string name, string value)>();
                    if (variables != null)
                    {
                        foreach (var kvp in variables)
                        {
                            if (kvp.Value is double dv)
                            {
                                varSubstitutions.Add((kvp.Key,
                                    $"({dv.ToString(System.Globalization.CultureInfo.InvariantCulture)})"));
                            }
                        }
                        // Sort by length descending so "omega" is replaced before "o"
                        varSubstitutions.Sort((a, b) => b.name.Length.CompareTo(a.name.Length));
                    }

                    // Evaluate each function series at all x points
                    foreach (var fs in funcSeries)
                    {
                        // Substitute all known variables into the expression
                        var exprTemplate = fs.FunctionExpr;
                        foreach (var (vName, vVal) in varSubstitutions)
                        {
                            if (vName == "x") continue; // x is set per-point
                            exprTemplate = System.Text.RegularExpressions.Regex.Replace(
                                exprTemplate,
                                @"(?<![a-zA-Zα-ωΑ-Ω_])" + System.Text.RegularExpressions.Regex.Escape(vName) + @"(?![a-zA-Zα-ωΑ-Ω_\d])",
                                vVal);
                        }

                        var yVals = new double[evalXValues.Length];
                        for (int i = 0; i < evalXValues.Length; i++)
                        {
                            try
                            {
                                // Substitute x value into expression
                                var xStr = evalXValues[i].ToString(System.Globalization.CultureInfo.InvariantCulture);
                                var expr = System.Text.RegularExpressions.Regex.Replace(
                                    exprTemplate,
                                    @"(?<![a-zA-Zα-ωΑ-Ω_])x(?![a-zA-Zα-ωΑ-Ω_\d])",
                                    $"({xStr})");
                                // Evaluate expression
                                mathParser.Parse(expr);
                                mathParser.Calculate(true);
                                var resultStr = mathParser.ResultAsString;
                                if (double.TryParse(resultStr,
                                    System.Globalization.NumberStyles.Any,
                                    System.Globalization.CultureInfo.InvariantCulture, out var yVal) &&
                                    !double.IsInfinity(yVal) && !double.IsNaN(yVal))
                                {
                                    yVals[i] = yVal;
                                }
                            }
                            catch { }
                        }
                        // Convert function series to data series
                        fs.YData = string.Join(", ", yVals.Select(v =>
                            v.ToString(System.Globalization.CultureInfo.InvariantCulture)));
                        fs.FunctionExpr = null;
                        // Enable smooth for function plots
                        if (!fs.Smooth) fs.Smooth = true;
                    }
                }

                // Remove series without data
                series = series.Where(s => !string.IsNullOrEmpty(s.YData)).ToList();

                if (series.Count == 0)
                    return "<p style='color:red;'>Error: No se definieron datos y para graficar</p>";

                // Get X data
                double[] xValues = GetPlotData(xData, variables);
                if (xValues == null)
                    return "<p style='color:red;'>Error: No se pudo obtener datos para x</p>";

                // Get all Y data and validate
                var allYValues = new List<double[]>();
                foreach (var s in series)
                {
                    var yVals = GetPlotData(s.YData, variables);
                    if (yVals == null)
                        return $"<p style='color:red;'>Error: No se pudo obtener datos para y</p>";
                    if (yVals.Length != xValues.Length)
                        return $"<p style='color:red;'>Error: Las longitudes de x ({xValues.Length}) y y ({yVals.Length}) no coinciden</p>";
                    allYValues.Add(yVals);
                }

                if (xValues.Length < 2)
                    return "<p style='color:red;'>Error: Se necesitan al menos 2 puntos para graficar</p>";

                // Calculate limits if not specified (considering all series)
                if (!xmin.HasValue) xmin = xValues.Min() - (xValues.Max() - xValues.Min()) * 0.05;
                if (!xmax.HasValue) xmax = xValues.Max() + (xValues.Max() - xValues.Min()) * 0.05;

                double globalYMin = allYValues.SelectMany(y => y).Min();
                double globalYMax = allYValues.SelectMany(y => y).Max();

                // Expand Y range to include text/equation annotations
                var textAnnotations = annotations.Where(a => a.Type == "text" || a.Type == "equation").ToList();
                if (textAnnotations.Count > 0)
                {
                    double annotationYMax = textAnnotations.Max(a => a.Y);
                    double annotationYMin = textAnnotations.Min(a => a.Y);
                    if (annotationYMax > globalYMax)
                        globalYMax = annotationYMax * 1.15;
                    if (annotationYMin < globalYMin)
                        globalYMin = annotationYMin * 0.85;
                }

                if (!ymin.HasValue) ymin = globalYMin - (globalYMax - globalYMin) * 0.05;
                if (!ymax.HasValue) ymax = globalYMax + (globalYMax - globalYMin) * 0.05;

                // Handle case where all values are the same
                if (Math.Abs(xmax.Value - xmin.Value) < 1e-10) { xmin -= 1; xmax += 1; }
                if (Math.Abs(ymax.Value - ymin.Value) < 1e-10) { ymin -= 1; ymax += 1; }

                return GeneratePlotSvgMultiSeries(xValues, allYValues, series, xmin.Value, xmax.Value, ymin.Value, ymax.Value,
                    xlabel, ylabel, title, grid, showLegend, background, width, height, annotations);
            }
            catch (Exception ex)
            {
                return $"<p style='color:red;'>Error en @{{plot}}: {ex.Message}</p>";
            }
        }

        /// <summary>
        /// Series class for multiple data series in a plot
        /// </summary>
        private class PlotSeries
        {
            public string YData { get; set; }
            public string FunctionExpr { get; set; }  // math expression to evaluate (e.g., "sin(x)")
            public string Color { get; set; } = "#4169E1";
            public string LineStyle { get; set; } = "solid";
            public string Symbol { get; set; } = "none";
            public int SymbolSize { get; set; } = 6;
            public double LineWidth { get; set; } = 2.0;
            public string Legend { get; set; }
            public bool Smooth { get; set; } = false;
            public double SmoothTension { get; set; } = 0.3;
        }

        /// <summary>
        /// Annotation class for plot elements
        /// </summary>
        private class PlotAnnotation
        {
            public string Type { get; set; } = "text";  // text, arrow, line, hline, vline, rect, circle
            public double X { get; set; }
            public double Y { get; set; }
            public double X2 { get; set; }  // For arrows, lines, rects
            public double Y2 { get; set; }
            public string Text { get; set; } = "";
            public string Color { get; set; } = "#003366";
            public int FontSize { get; set; } = 12;
            public string Anchor { get; set; } = "start";  // start, middle, end
            public bool Bold { get; set; } = false;
            public bool Italic { get; set; } = true;
            public double Rotation { get; set; } = 0;
            public double StrokeWidth { get; set; } = 1.5;
            public string Fill { get; set; } = "none";
        }

        /// <summary>
        /// Parse text annotation: x, y, "text" [, color, fontsize, anchor, bold, italic, rotation]
        /// </summary>
        private PlotAnnotation ParseTextAnnotation(string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = "text" };

                // Find the quoted text
                int quoteStart = value.IndexOf('"');
                int quoteEnd = value.LastIndexOf('"');
                if (quoteStart < 0 || quoteEnd <= quoteStart)
                {
                    quoteStart = value.IndexOf('\'');
                    quoteEnd = value.LastIndexOf('\'');
                }

                if (quoteStart < 0 || quoteEnd <= quoteStart)
                    return null;

                annotation.Text = value.Substring(quoteStart + 1, quoteEnd - quoteStart - 1);

                // Parse coordinates before the quote
                var coordsPart = value.Substring(0, quoteStart).Trim().TrimEnd(',');
                var coords = coordsPart.Split(',');
                if (coords.Length >= 2)
                {
                    double.TryParse(coords[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x);
                    double.TryParse(coords[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y);
                    annotation.X = x;
                    annotation.Y = y;
                }

                // Parse options after the quote
                if (quoteEnd < value.Length - 1)
                {
                    var optionsPart = value.Substring(quoteEnd + 1).Trim().TrimStart(',');
                    var options = optionsPart.Split(',');
                    foreach (var opt in options)
                    {
                        var o = opt.Trim().ToLower();
                        if (o.StartsWith("#") || o.StartsWith("rgb"))
                            annotation.Color = opt.Trim();
                        else if (int.TryParse(o, out var fs) && fs >= 6 && fs <= 72)
                            annotation.FontSize = fs;
                        else if (o == "start" || o == "middle" || o == "end" || o == "center")
                            annotation.Anchor = o == "center" ? "middle" : o;
                        else if (o == "bold" || o == "negrita")
                            annotation.Bold = true;
                        else if (o == "italic" || o == "cursiva")
                            annotation.Italic = true;
                        else if (o == "normal")
                            annotation.Italic = false;
                        else if (o.StartsWith("rot") || o.EndsWith("°") || o.EndsWith("deg"))
                        {
                            var rotVal = o.Replace("rot", "").Replace("°", "").Replace("deg", "").Trim();
                            double.TryParse(rotVal, System.Globalization.NumberStyles.Any,
                                System.Globalization.CultureInfo.InvariantCulture, out var rot);
                            annotation.Rotation = rot;
                        }
                    }
                }

                return annotation;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Parse equation annotation: x, y, "V = I*S_a/R*W" [, color, fontsize]
        /// Supports Hekatan-style math notation:
        /// - Subscripts: S_a becomes Sₐ
        /// - Greek letters: η, α, β, etc.
        /// - Operators: *, /, +, -, =
        /// </summary>
        private PlotAnnotation ParseEquationAnnotation(string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = "equation" };

                // Find the quoted equation
                int quoteStart = value.IndexOf('"');
                int quoteEnd = value.LastIndexOf('"');
                if (quoteStart < 0 || quoteEnd <= quoteStart)
                {
                    quoteStart = value.IndexOf('\'');
                    quoteEnd = value.LastIndexOf('\'');
                }

                if (quoteStart < 0 || quoteEnd <= quoteStart)
                    return null;

                annotation.Text = value.Substring(quoteStart + 1, quoteEnd - quoteStart - 1);

                // Parse coordinates before the quote
                var coordsPart = value.Substring(0, quoteStart).Trim().TrimEnd(',');
                var coords = coordsPart.Split(',');
                if (coords.Length >= 2)
                {
                    double.TryParse(coords[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x);
                    double.TryParse(coords[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y);
                    annotation.X = x;
                    annotation.Y = y;
                }

                // Parse options after the quote
                if (quoteEnd < value.Length - 1)
                {
                    var optionsPart = value.Substring(quoteEnd + 1).Trim().TrimStart(',');
                    var options = optionsPart.Split(',');
                    foreach (var opt in options)
                    {
                        var o = opt.Trim().ToLower();
                        if (o.StartsWith("#") || o.StartsWith("rgb"))
                            annotation.Color = opt.Trim();
                        else if (int.TryParse(o, out var fs) && fs >= 6 && fs <= 72)
                            annotation.FontSize = fs;
                    }
                }

                return annotation;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Convert Hekatan-style equation to SVG elements with proper formatting
        /// Uses foreignObject with Hekatan CSS classes for fractions
        /// Supports: fractions (a/b), subscripts (x_i), superscripts (x^2), Greek letters
        /// </summary>
        private string RenderEquationToSvg(string equation, double x, double y, string color, int fontSize)
        {
            // Use foreignObject to embed HTML with Hekatan's math formatting classes
            var sb = new StringBuilder();
            
            // Estimate width and height for foreignObject - make it larger for complex fractions
            var estimatedWidth = EstimateEquationWidth(equation, fontSize) * 1.5;
            var estimatedHeight = fontSize * 5.0; // Allow more room for stacked fractions
            
            // Create foreignObject container
            sb.Append($"<foreignObject x=\"{x:F1}\" y=\"{y - fontSize * 2:F1}\" width=\"{estimatedWidth:F0}\" height=\"{estimatedHeight:F0}\">");
            
            // Include Hekatan's CSS classes for fraction rendering inside the foreignObject
            sb.Append("<div xmlns=\"http://www.w3.org/1999/xhtml\">");
            sb.Append("<style>");
            // Hekatan fraction styles from template.html
            sb.Append(".dvc{display:inline-block;vertical-align:middle;white-space:nowrap;padding:0 2pt;text-align:center;line-height:110%;}");
            sb.Append(".dvl{display:block;border-bottom:solid 1pt currentColor;margin:1pt 0;}");
            sb.Append(".eq{font-family:'Georgia Pro','Century Schoolbook','Times New Roman',Times,serif;}");
            sb.Append(".eq var{color:inherit;font-size:105%;}");
            sb.Append(".eq sub{font-family:Calibri,Candara,Corbel,sans-serif;font-size:80%;vertical-align:-18%;margin-left:1pt;}");
            sb.Append(".eq sup{display:inline-block;margin-left:1pt;margin-top:-3pt;font-size:75%;}");
            sb.Append("</style>");
            
            // Main equation container with Hekatan's .eq class
            sb.Append($"<span class=\"eq\" style=\"");
            sb.Append("display:flex; align-items:center; height:100%; ");
            sb.Append($"font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif; ");
            sb.Append($"font-size: {fontSize}px; ");
            sb.Append($"color: {color}; ");
            sb.Append("white-space: nowrap;\">");
            
            // Convert equation to HTML with Hekatan-style math formatting
            sb.Append(ConvertEquationToMathHtml(equation, color, fontSize));
            
            sb.Append("</span></div></foreignObject>");
            
            return sb.ToString();
        }
        
        /// <summary>
        /// Convert equation to professional mathematical HTML with proper fractions
        /// This method handles the full equation parsing with proper fraction rendering
        /// </summary>
        private string ConvertEquationToMathHtml(string equation, string color, double fontSize)
        {
            var result = new StringBuilder();
            var tokens = TokenizeEquation(equation);
            
            for (int i = 0; i < tokens.Count; i++)
            {
                var token = tokens[i];
                
                if (token.Type == "fraction")
                {
                    // Render as proper stacked fraction
                    result.Append(RenderMathFraction(token.Numerator, token.Denominator, color, fontSize));
                }
                else if (token.Type == "superscript")
                {
                    result.Append($"<sup style=\"font-size:65%;vertical-align:super;\">{RenderMathVariable(token.Text, fontSize * 0.65)}</sup>");
                }
                else if (token.Type == "subscript")
                {
                    result.Append($"<sub style=\"font-size:65%;vertical-align:sub;\">{RenderMathVariable(token.Text, fontSize * 0.65)}</sub>");
                }
                else if (token.Type == "operator")
                {
                    result.Append($"<span style=\"padding:0 2px;\">{token.Text}</span>");
                }
                else if (token.Type == "paren_open")
                {
                    result.Append("<span style=\"font-size:120%;\">(</span>");
                }
                else if (token.Type == "paren_close")
                {
                    result.Append("<span style=\"font-size:120%;\">)</span>");
                }
                else
                {
                    // Variable or text - render the base text
                    result.Append(RenderMathVariable(token.Text, fontSize));

                    // If there's a subscript, render it properly as HTML
                    if (!string.IsNullOrEmpty(token.Subscript))
                    {
                        result.Append($"<sub style=\"font-size:65%;\">{RenderMathVariable(token.Subscript, fontSize * 0.65)}</sub>");
                    }
                }
            }

            return result.ToString();
        }
        
        /// <summary>
        /// Token class for equation parsing
        /// </summary>
        private class MathToken
        {
            public string Type { get; set; } = ""; // variable, operator, fraction, superscript, subscript, paren_open, paren_close
            public string Text { get; set; } = "";
            public string Subscript { get; set; } = ""; // Subscript text if any (not HTML)
            public string Numerator { get; set; } = "";
            public string Denominator { get; set; } = "";
        }
        
        /// <summary>
        /// Tokenize equation into components for rendering
        /// </summary>
        private List<MathToken> TokenizeEquation(string equation)
        {
            var tokens = new List<MathToken>();
            int i = 0;
            
            while (i < equation.Length)
            {
                char c = equation[i];
                
                // Handle opening parenthesis - check for fraction inside
                if (c == '(')
                {
                    int closeIdx = FindMatchingParen(equation, i);
                    if (closeIdx > i + 1)
                    {
                        var inner = equation.Substring(i + 1, closeIdx - i - 1);
                        
                        // Check if this is a fraction like (T_C/T) or (T_C·T_L/T^2)
                        int slashIdx = FindMainSlash(inner);
                        if (slashIdx > 0 && slashIdx < inner.Length - 1)
                        {
                            // This is a fraction in parentheses
                            var numPart = inner.Substring(0, slashIdx);
                            var denPart = inner.Substring(slashIdx + 1);
                            tokens.Add(new MathToken { Type = "fraction", Numerator = numPart, Denominator = denPart });
                            i = closeIdx + 1;
                            
                            // Check for superscript immediately after
                            if (i < equation.Length && equation[i] == '^')
                            {
                                i++;
                                var sup = ExtractSubscriptOrSuperscriptStr(equation, ref i);
                                tokens.Add(new MathToken { Type = "superscript", Text = sup });
                            }
                            continue;
                        }
                        else
                        {
                            // Regular parentheses - recurse for inner content
                            tokens.Add(new MathToken { Type = "paren_open", Text = "(" });
                            var innerTokens = TokenizeEquation(inner);
                            tokens.AddRange(innerTokens);
                            tokens.Add(new MathToken { Type = "paren_close", Text = ")" });
                            i = closeIdx + 1;
                            continue;
                        }
                    }
                    else
                    {
                        tokens.Add(new MathToken { Type = "paren_open", Text = "(" });
                        i++;
                        continue;
                    }
                }
                
                if (c == ')')
                {
                    tokens.Add(new MathToken { Type = "paren_close", Text = ")" });
                    i++;
                    continue;
                }
                
                // Handle operators
                if (c == '=' || c == '+' || c == '-' || c == '·' || c == '*')
                {
                    string op = c == '*' ? "·" : c.ToString();
                    tokens.Add(new MathToken { Type = "operator", Text = op });
                    i++;
                    continue;
                }
                
                // Handle subscript
                if (c == '_' && i + 1 < equation.Length)
                {
                    i++;
                    var sub = ExtractSubscriptOrSuperscriptStr(equation, ref i);
                    // Attach to previous token if it's a variable
                    if (tokens.Count > 0 && tokens[tokens.Count - 1].Type == "variable")
                    {
                        // Store subscript as structured data, NOT as embedded HTML
                        tokens[tokens.Count - 1].Subscript = sub;
                    }
                    else
                    {
                        tokens.Add(new MathToken { Type = "subscript", Text = sub });
                    }
                    continue;
                }

                // Handle superscript
                if (c == '^' && i + 1 < equation.Length)
                {
                    i++;
                    var sup = ExtractSubscriptOrSuperscriptStr(equation, ref i);
                    tokens.Add(new MathToken { Type = "superscript", Text = sup });
                    continue;
                }

                // Handle variables and numbers
                if (char.IsLetterOrDigit(c) || c == 'η' || c == 'α' || c == 'β' || c == 'γ' || c == 'π')
                {
                    var varBuilder = new StringBuilder();
                    string subscriptPart = "";
                    while (i < equation.Length)
                    {
                        char vc = equation[i];
                        if (char.IsLetterOrDigit(vc) || vc == 'η' || vc == 'α' || vc == 'β' || vc == 'γ' || vc == 'π')
                        {
                            varBuilder.Append(vc);
                            i++;
                        }
                        else if (vc == '_')
                        {
                            // Subscript attached to variable - store as structured data
                            i++;
                            subscriptPart = ExtractSubscriptOrSuperscriptStr(equation, ref i);
                            // Don't break - continue to check for more chars
                        }
                        else
                        {
                            break;
                        }
                    }
                    tokens.Add(new MathToken { Type = "variable", Text = varBuilder.ToString(), Subscript = subscriptPart });
                    continue;
                }
                
                // Handle slash outside parentheses - this is a fraction
                if (c == '/')
                {
                    // Get numerator from previous tokens - reconstruct with subscript notation
                    string numerator = "";
                    if (tokens.Count > 0)
                    {
                        var lastToken = tokens[tokens.Count - 1];
                        if (lastToken.Type == "variable" || lastToken.Type == "paren_close")
                        {
                            numerator = lastToken.Text;
                            // Include subscript in notation form if present
                            if (!string.IsNullOrEmpty(lastToken.Subscript))
                            {
                                numerator += "_" + lastToken.Subscript;
                            }
                            tokens.RemoveAt(tokens.Count - 1);
                        }
                    }

                    // Get denominator - keep plain text with _ and ^ notation
                    i++;
                    var denBuilder = new StringBuilder();
                    while (i < equation.Length)
                    {
                        char dc = equation[i];
                        if (char.IsLetterOrDigit(dc) || dc == '_' || dc == '^' || dc == '{' || dc == '}' || dc == 'η' || dc == 'α' || dc == 'β')
                        {
                            denBuilder.Append(dc);
                            i++;
                        }
                        else
                        {
                            break;
                        }
                    }

                    tokens.Add(new MathToken { Type = "fraction", Numerator = numerator, Denominator = denBuilder.ToString() });
                    continue;
                }
                
                // Skip whitespace
                if (char.IsWhiteSpace(c))
                {
                    i++;
                    continue;
                }
                
                // Unknown character - add as-is
                tokens.Add(new MathToken { Type = "variable", Text = c.ToString() });
                i++;
            }
            
            return tokens;
        }
        
        /// <summary>
        /// Find the main division slash in an expression (not inside nested parens)
        /// </summary>
        private int FindMainSlash(string expr)
        {
            int depth = 0;
            for (int i = 0; i < expr.Length; i++)
            {
                if (expr[i] == '(') depth++;
                else if (expr[i] == ')') depth--;
                else if (expr[i] == '/' && depth == 0)
                    return i;
            }
            return -1;
        }
        
        /// <summary>
        /// Extract subscript/superscript content as string
        /// </summary>
        private string ExtractSubscriptOrSuperscriptStr(string text, ref int index)
        {
            if (index >= text.Length) return "";
            
            if (text[index] == '{')
            {
                int start = index + 1;
                int depth = 1;
                index++;
                while (index < text.Length && depth > 0)
                {
                    if (text[index] == '{') depth++;
                    else if (text[index] == '}') depth--;
                    index++;
                }
                return text.Substring(start, index - start - 1);
            }
            else
            {
                // Single character or number
                var result = new StringBuilder();
                while (index < text.Length && (char.IsLetterOrDigit(text[index]) || text[index] == 'η' || text[index] == 'α'))
                {
                    result.Append(text[index]);
                    index++;
                    // Only take multiple chars if they're all digits
                    if (result.Length > 0 && !char.IsDigit(result[0]))
                        break;
                }
                return result.Length > 0 ? result.ToString() : (index < text.Length ? text[index++].ToString() : "");
            }
        }
        
        /// <summary>
        /// Render a proper mathematical fraction with stacked numerator/denominator
        /// Uses Hekatan's .dvc and .dvl CSS classes for consistent styling
        /// </summary>
        private string RenderMathFraction(string numerator, string denominator, string color, double fontSize)
        {
            var sb = new StringBuilder();

            // Use Hekatan's dvc class for fraction container - this matches the template.html styles
            // .dvc = division container with inline-block, vertical-align:middle, text-align:center
            // .dvl = division line (border-bottom)
            sb.Append("<span class=\"dvc\" style=\"padding:0 2pt;\">");

            // Numerator with proper styling - use RenderMathExpression to handle subscripts
            sb.Append($"<span style=\"display:block;font-size:{fontSize * 0.9:F0}px;line-height:110%;\">");
            sb.Append(RenderMathExpression(numerator, color, fontSize * 0.9));
            sb.Append("</span>");

            // Fraction line using Hekatan's .dvl class
            sb.Append($"<span class=\"dvl\" style=\"border-color:{color};\"></span>");

            // Denominator - use RenderMathExpression to handle subscripts
            sb.Append($"<span style=\"display:block;font-size:{fontSize * 0.9:F0}px;line-height:110%;\">");
            sb.Append(RenderMathExpression(denominator, color, fontSize * 0.9));
            sb.Append("</span>");

            sb.Append("</span>");

            return sb.ToString();
        }

        /// <summary>
        /// Render a complete math expression (may contain variables with subscripts, operators, etc.)
        /// This tokenizes and renders properly without embedding HTML in token text
        /// </summary>
        private string RenderMathExpression(string expression, string color, double fontSize)
        {
            if (string.IsNullOrEmpty(expression)) return "";

            var result = new StringBuilder();
            int i = 0;

            while (i < expression.Length)
            {
                char c = expression[i];

                // Greek letters
                if (c == 'η' || c == 'α' || c == 'β' || c == 'γ' || c == 'π' || c == 'φ' || c == 'θ' || c == 'ω')
                {
                    result.Append($"<span style=\"font-style:normal;\">{c}</span>");
                    i++;
                }
                // Letters - may have subscript
                else if (char.IsLetter(c))
                {
                    result.Append($"<i>{c}</i>");
                    i++;

                    // Check for subscript
                    if (i < expression.Length && expression[i] == '_')
                    {
                        i++;
                        var sub = ExtractSubscriptOrSuperscriptStr(expression, ref i);
                        result.Append($"<sub style=\"font-size:65%;\">{RenderMathVariable(sub, fontSize * 0.65)}</sub>");
                    }
                }
                // Numbers
                else if (char.IsDigit(c))
                {
                    result.Append(c);
                    i++;
                }
                // Superscript
                else if (c == '^' && i + 1 < expression.Length)
                {
                    i++;
                    var sup = ExtractSubscriptOrSuperscriptStr(expression, ref i);
                    result.Append($"<sup style=\"font-size:65%;\">{RenderMathVariable(sup, fontSize * 0.65)}</sup>");
                }
                // Operators
                else if (c == '·' || c == '*')
                {
                    result.Append("·");
                    i++;
                }
                else
                {
                    result.Append(c);
                    i++;
                }
            }

            return result.ToString();
        }
        
        /// <summary>
        /// Render a math variable with proper styling (italics for single letters, subscripts, etc.)
        /// </summary>
        private string RenderMathVariable(string text, double fontSize)
        {
            if (string.IsNullOrEmpty(text)) return "";

            var result = new StringBuilder();

            // Simple rendering - text should NOT contain HTML tags anymore
            // (subscripts are handled separately via token.Subscript property)
            foreach (char c in text)
            {
                // Greek letters - render as-is (they're already proper symbols)
                if (c == 'η' || c == 'α' || c == 'β' || c == 'γ' || c == 'π' || c == 'φ' || c == 'θ' || c == 'ω')
                {
                    result.Append($"<span style=\"font-style:normal;\">{c}</span>");
                }
                // Numbers - not italic
                else if (char.IsDigit(c))
                {
                    result.Append(c);
                }
                // Letters - italic
                else if (char.IsLetter(c))
                {
                    result.Append($"<i>{c}</i>");
                }
                // Operators
                else if (c == '·' || c == '*')
                {
                    result.Append("·");
                }
                else
                {
                    result.Append(c);
                }
            }

            return result.ToString();
        }

        /// <summary>
        /// Estimate equation width for foreignObject sizing
        /// </summary>
        private double EstimateEquationWidth(string equation, double fontSize)
        {
            double width = 0;
            for (int i = 0; i < equation.Length; i++)
            {
                char c = equation[i];
                if (c == '_' || c == '^' || c == '{' || c == '}')
                    continue;
                if (c == '/')
                    width += fontSize * 0.3; // Fraction takes less horizontal space
                else
                    width += fontSize * 0.55;
            }
            return Math.Max(width + 20, fontSize * 3);
        }

        /// <summary>
        /// Convert equation string to HTML with Hekatan-style fraction rendering
        /// </summary>
        private string ConvertEquationToHtml(string equation, string color, double fontSize)
        {
            var sb = new StringBuilder();
            int i = 0;
            
            while (i < equation.Length)
            {
                // Look ahead for fraction pattern
                int slashPos = FindNextFractionSlash(equation, i);
                
                if (slashPos >= 0)
                {
                    // Found a fraction - find numerator and denominator boundaries
                    var (numStart, numEnd) = FindNumeratorBounds(equation, slashPos);
                    var (denStart, denEnd) = FindDenominatorBounds(equation, slashPos);
                    
                    // Render content before the fraction
                    if (numStart > i)
                    {
                        var before = equation.Substring(i, numStart - i);
                        RenderHtmlEquationPart(sb, before, fontSize);
                    }
                    
                    // Get and clean numerator/denominator
                    var numerator = equation.Substring(numStart, numEnd - numStart);
                    var denominator = equation.Substring(denStart, denEnd - denStart);
                    numerator = TrimFractionPart(numerator);
                    denominator = TrimFractionPart(denominator);
                    
                    // Render fraction using Hekatan CSS classes
                    var fracFontSize = fontSize * 0.85;
                    sb.Append($"<span style=\"display:inline-block;vertical-align:middle;text-align:center;padding:0 2px;\">");
                    
                    // Numerator
                    sb.Append($"<span style=\"display:block;font-size:{fracFontSize:F0}px;\">");
                    RenderHtmlEquationPart(sb, numerator, fracFontSize);
                    sb.Append("</span>");
                    
                    // Fraction line
                    sb.Append($"<span style=\"display:block;border-bottom:1px solid {color};margin:1px 0;\"></span>");
                    
                    // Denominator
                    sb.Append($"<span style=\"display:block;font-size:{fracFontSize:F0}px;\">");
                    RenderHtmlEquationPart(sb, denominator, fracFontSize);
                    sb.Append("</span>");
                    
                    sb.Append("</span>");
                    
                    i = denEnd;
                }
                else
                {
                    // No more fractions - render rest normally
                    var rest = equation.Substring(i);
                    RenderHtmlEquationPart(sb, rest, fontSize);
                    break;
                }
            }
            
            return sb.ToString();
        }

        /// <summary>
        /// Find next fraction slash not inside parentheses/braces
        /// </summary>
        private int FindNextFractionSlash(string equation, int startFrom)
        {
            int parenDepth = 0;
            int braceDepth = 0;
            
            for (int i = startFrom; i < equation.Length; i++)
            {
                char c = equation[i];
                if (c == '(' || c == '[') parenDepth++;
                else if (c == ')' || c == ']') parenDepth--;
                else if (c == '{') braceDepth++;
                else if (c == '}') braceDepth--;
                else if (c == '/' && parenDepth == 0 && braceDepth == 0)
                {
                    // Make sure there's content on both sides
                    if (i > startFrom && i < equation.Length - 1)
                        return i;
                }
            }
            return -1;
        }

        /// <summary>
        /// Find numerator boundaries (content before slash)
        /// </summary>
        private (int start, int end) FindNumeratorBounds(string equation, int slashPos)
        {
            int end = slashPos;
            int start = slashPos - 1;
            int parenDepth = 0;
            int braceDepth = 0;
            
            while (start >= 0)
            {
                char c = equation[start];
                
                if (c == ')' || c == ']') parenDepth++;
                else if (c == '(' || c == '[')
                {
                    if (parenDepth > 0) parenDepth--;
                    else { start++; break; }
                }
                else if (c == '}') braceDepth++;
                else if (c == '{')
                {
                    if (braceDepth > 0) braceDepth--;
                    else { start++; break; }
                }
                else if (parenDepth == 0 && braceDepth == 0)
                {
                    // Stop at operators and spaces (but not _ or ^)
                    if (c == '+' || c == '-' || c == '=' || c == ' ' || c == '*' || c == '·')
                    {
                        start++;
                        break;
                    }
                }
                start--;
            }
            
            if (start < 0) start = 0;
            return (start, end);
        }

        /// <summary>
        /// Find denominator boundaries (content after slash)
        /// </summary>
        private (int start, int end) FindDenominatorBounds(string equation, int slashPos)
        {
            int start = slashPos + 1;
            int end = start;
            int parenDepth = 0;
            int braceDepth = 0;
            
            while (end < equation.Length)
            {
                char c = equation[end];
                
                if (c == '(' || c == '[') parenDepth++;
                else if (c == ')' || c == ']')
                {
                    if (parenDepth > 0) parenDepth--;
                    else break;
                }
                else if (c == '{') braceDepth++;
                else if (c == '}')
                {
                    if (braceDepth > 0) braceDepth--;
                    else break;
                }
                else if (parenDepth == 0 && braceDepth == 0)
                {
                    // Stop at operators and spaces
                    if (c == '+' || c == '-' || c == '=' || c == ' ' || c == '*' || c == '·')
                        break;
                }
                end++;
            }
            
            return (start, end);
        }

        /// <summary>
        /// Render equation part as HTML with proper formatting
        /// </summary>
        private void RenderHtmlEquationPart(StringBuilder sb, string text, double fontSize)
        {
            int i = 0;
            while (i < text.Length)
            {
                char c = text[i];

                // Handle parentheses with fraction inside: (a/b) -> render as proper fraction
                if (c == '(' && i + 1 < text.Length)
                {
                    // Find matching closing paren
                    int closeIdx = FindMatchingParen(text, i);
                    if (closeIdx > i + 1)
                    {
                        var inner = text.Substring(i + 1, closeIdx - i - 1);
                        // Check if inner content has a fraction
                        int slashIdx = inner.IndexOf('/');
                        if (slashIdx > 0 && slashIdx < inner.Length - 1)
                        {
                            // This is a fraction like (T_C/T) - render using native .dvc/.dvl
                            var numPart = inner.Substring(0, slashIdx);
                            var denPart = inner.Substring(slashIdx + 1);

                            sb.Append("<span class=\"dvc\">");
                            RenderHtmlEquationPart(sb, numPart, fontSize);
                            sb.Append("<span class=\"dvl\"></span>");
                            RenderHtmlEquationPart(sb, denPart, fontSize);
                            sb.Append("</span>");

                            i = closeIdx + 1;
                            continue;
                        }
                        else
                        {
                            // No fraction inside, render parentheses normally
                            sb.Append("(");
                            RenderHtmlEquationPart(sb, inner, fontSize);
                            sb.Append(")");
                            i = closeIdx + 1;
                            continue;
                        }
                    }
                }

                // Handle subscript: X_a or X_{abc} — recursive rendering (like hekatan-web)
                if (c == '_' && i + 1 < text.Length)
                {
                    i++;
                    string subscript = ExtractSubscriptOrSuperscript(text, ref i);
                    sb.Append("<sub>");
                    RenderHtmlEquationPart(sb, subscript, fontSize);
                    sb.Append("</sub>");
                }
                // Handle superscript: X^2 or X^{abc} — recursive rendering (like hekatan-web)
                else if (c == '^' && i + 1 < text.Length)
                {
                    i++;
                    string superscript = ExtractSubscriptOrSuperscript(text, ref i);
                    sb.Append("<sup>");
                    RenderHtmlEquationPart(sb, superscript, fontSize);
                    sb.Append("</sup>");
                }
                // Handle multiplication: * becomes ·
                else if (c == '*')
                {
                    sb.Append("·");
                    i++;
                }
                // Handle N-ary operators: ∫, ∑, ∏ with optional _sub^sup limits
                // Renders using native Calcpad pattern:
                // <span class="dvr"><small>sup</small><span class="nary">∫</span><small>sub</small></span>
                else if (c == '∫' || c == '∑' || c == '∏')
                {
                    string narySymbol = c == '∫' ? "<em>∫</em>" : c.ToString();
                    i++;

                    // Check for optional limits _sub and ^sup (in any order)
                    string subLimit = null;
                    string supLimit = null;
                    for (int pass = 0; pass < 2 && i < text.Length; pass++)
                    {
                        if (text[i] == '_' && i + 1 < text.Length)
                        {
                            i++;
                            subLimit = ExtractSubscriptOrSuperscript(text, ref i);
                        }
                        else if (text[i] == '^' && i + 1 < text.Length)
                        {
                            i++;
                            supLimit = ExtractSubscriptOrSuperscript(text, ref i);
                        }
                    }

                    sb.Append("<span class=\"dvr\">");
                    // Render limits as equations (supports fractions like h/2)
                    sb.Append("<small>");
                    if (supLimit != null) RenderNaryLimit(sb, supLimit, fontSize);
                    sb.Append("</small>");
                    sb.Append($"<span class=\"nary\">{narySymbol}</span>");
                    sb.Append("<small>");
                    if (subLimit != null) RenderNaryLimit(sb, subLimit, fontSize);
                    sb.Append("</small>");
                    sb.Append("</span>");
                }
                // Handle partial derivative symbol ∂ (renders as italic like a variable)
                else if (c == '∂')
                {
                    sb.Append("<i>∂</i>");
                    i++;
                }
                // Handle Greek letters - render directly (template .eq font handles them)
                else if (IsGreekLetter(c))
                {
                    sb.Append($"<i>{c}</i>");
                    i++;
                }
                // Make single letters italic using <var> tag (native Calcpad style)
                else if (char.IsLetter(c) && !char.IsDigit(c))
                {
                    bool isSingleVar = (i == 0 || !char.IsLetter(text[i - 1])) &&
                                       (i + 1 >= text.Length || !char.IsLetter(text[i + 1]) || text[i + 1] == '_');
                    if (isSingleVar)
                        sb.Append($"<var>{c}</var>");
                    else
                        sb.Append(c);
                    i++;
                }
                else
                {
                    sb.Append(System.Net.WebUtility.HtmlEncode(c.ToString()));
                    i++;
                }
            }
        }

        /// <summary>
        /// Render N-ary limit (sub/sup) with fraction support.
        /// For limits like h/2 or -h/2, renders as a small inline fraction.
        /// For simple limits like n or i=1, renders normally.
        /// </summary>
        private void RenderNaryLimit(StringBuilder sb, string limit, double fontSize)
        {
            int slashIdx = limit.IndexOf('/');
            if (slashIdx > 0 && slashIdx < limit.Length - 1)
            {
                // Has a fraction - render as inline fraction
                // Split into parts before and after /
                // Handle leading minus: -h/2 → minus sign + fraction h/2
                string prefix = "";
                string numPart = limit.Substring(0, slashIdx);
                string denPart = limit.Substring(slashIdx + 1);

                // Extract leading sign if present
                if (numPart.StartsWith("-") || numPart.StartsWith("+"))
                {
                    prefix = numPart[0].ToString();
                    numPart = numPart.Substring(1);
                }

                if (!string.IsNullOrEmpty(prefix))
                    sb.Append(System.Net.WebUtility.HtmlEncode(prefix));

                sb.Append("<span class=\"dvc\" style=\"font-size:85%;\">");
                RenderHtmlEquationPart(sb, numPart, fontSize);
                sb.Append("<span class=\"dvl\"></span>");
                RenderHtmlEquationPart(sb, denPart, fontSize);
                sb.Append("</span>");
            }
            else
            {
                // No fraction - render as equation part (handles subscripts, Greek, etc.)
                RenderHtmlEquationPart(sb, limit, fontSize);
            }
        }

        /// <summary>
        /// Check if a character is a Greek letter
        /// </summary>
        private static bool IsGreekLetter(char c)
        {
            return (c >= '\u0391' && c <= '\u03C9') || // Greek block
                   c == 'α' || c == 'β' || c == 'γ' || c == 'δ' || c == 'ε' ||
                   c == 'ζ' || c == 'η' || c == 'θ' || c == 'ι' || c == 'κ' ||
                   c == 'λ' || c == 'μ' || c == 'ν' || c == 'ξ' || c == 'ο' ||
                   c == 'π' || c == 'ρ' || c == 'σ' || c == 'τ' || c == 'υ' ||
                   c == 'φ' || c == 'χ' || c == 'ψ' || c == 'ω' ||
                   c == 'Α' || c == 'Β' || c == 'Γ' || c == 'Δ' || c == 'Ε' ||
                   c == 'Ζ' || c == 'Η' || c == 'Θ' || c == 'Ι' || c == 'Κ' ||
                   c == 'Λ' || c == 'Μ' || c == 'Ν' || c == 'Ξ' || c == 'Ο' ||
                   c == 'Π' || c == 'Ρ' || c == 'Σ' || c == 'Τ' || c == 'Υ' ||
                   c == 'Φ' || c == 'Χ' || c == 'Ψ' || c == 'Ω';
        }

        /// <summary>
        /// Find the matching closing parenthesis
        /// </summary>
        private int FindMatchingParen(string text, int openIdx)
        {
            if (openIdx >= text.Length || text[openIdx] != '(')
                return -1;

            int depth = 1;
            for (int i = openIdx + 1; i < text.Length; i++)
            {
                if (text[i] == '(') depth++;
                else if (text[i] == ')')
                {
                    depth--;
                    if (depth == 0) return i;
                }
            }
            return -1;
        }

        /// <summary>
        /// Render equation that may contain fractions (legacy SVG method - kept for fallback)
        /// </summary>
        private string RenderEquationWithFractionsSvg(string equation, double x, double y, string color, int fontSize)
        {
            var sb = new StringBuilder();
            sb.Append($"<g transform=\"translate({x:F1},{y:F1})\">");

            double currentX = 0;
            int i = 0;
            var fracFontSize = fontSize * 0.85;
            var lineHeight = fontSize * 0.4;

            while (i < equation.Length)
            {
                int slashPos = FindNextFractionSlash(equation, i);

                if (slashPos >= 0)
                {
                    var (numStart, numEnd) = FindNumeratorBounds(equation, slashPos);
                    var (denStart, denEnd) = FindDenominatorBounds(equation, slashPos);

                    if (numStart > i)
                    {
                        var beforeFrac = equation.Substring(i, numStart - i);
                        var beforeWidth = RenderInlineEquationPart(sb, beforeFrac, currentX, 0, color, fontSize);
                        currentX += beforeWidth;
                    }

                    var numerator = TrimFractionPart(equation.Substring(numStart, numEnd - numStart));
                    var denominator = TrimFractionPart(equation.Substring(denStart, denEnd - denStart));

                    var numWidth = EstimateTextWidth(numerator, fracFontSize);
                    var denWidth = EstimateTextWidth(denominator, fracFontSize);
                    var fracWidth = Math.Max(numWidth, denWidth) + 4;
                    var fracCenterX = currentX + fracWidth / 2;

                    sb.Append($"<text x=\"{fracCenterX:F1}\" y=\"{-lineHeight:F1}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"{fracFontSize:F0}\" fill=\"{color}\">");
                    RenderEquationContent(sb, numerator, color, fracFontSize);
                    sb.Append("</text>");

                    sb.Append($"<line x1=\"{currentX:F1}\" y1=\"0\" x2=\"{currentX + fracWidth:F1}\" y2=\"0\" stroke=\"{color}\" stroke-width=\"1\"/>");

                    sb.Append($"<text x=\"{fracCenterX:F1}\" y=\"{lineHeight + fontSize * 0.35:F1}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"{fracFontSize:F0}\" fill=\"{color}\">");
                    RenderEquationContent(sb, denominator, color, fracFontSize);
                    sb.Append("</text>");

                    currentX += fracWidth + 2;
                    i = denEnd;
                }
                else
                {
                    var rest = equation.Substring(i);
                    RenderInlineEquationPart(sb, rest, currentX, 0, color, fontSize);
                    break;
                }
            }

            sb.Append("</g>");
            return sb.ToString();
        }

        /// <summary>
        /// Find the position of a fraction slash (not inside parentheses)
        /// </summary>
        private int FindFractionSlash(string equation, int startFrom)
        {
            int parenDepth = 0;
            int braceDepth = 0;
            for (int i = startFrom; i < equation.Length; i++)
            {
                char c = equation[i];
                if (c == '(' || c == '[') parenDepth++;
                else if (c == ')' || c == ']') parenDepth--;
                else if (c == '{') braceDepth++;
                else if (c == '}') braceDepth--;
                else if (c == '/' && parenDepth == 0 && braceDepth == 0)
                    return i;
            }
            return -1;
        }

        /// <summary>
        /// Find the numerator boundaries for a fraction at slashPos
        /// </summary>
        private (int start, int end) FindNumerator(string equation, int slashPos)
        {
            int end = slashPos;
            int start = slashPos - 1;

            // Skip backwards to find numerator
            int parenDepth = 0;
            int braceDepth = 0;

            while (start >= 0)
            {
                char c = equation[start];
                if (c == ')' || c == ']') parenDepth++;
                else if (c == '(' || c == '[') { parenDepth--; if (parenDepth < 0) { start++; break; } }
                else if (c == '}') braceDepth++;
                else if (c == '{') { braceDepth--; if (braceDepth < 0) { start++; break; } }
                else if (parenDepth == 0 && braceDepth == 0)
                {
                    // Stop at operators (but not _ or ^)
                    if (c == '+' || c == '-' || c == '=' || c == ' ')
                    {
                        start++;
                        break;
                    }
                }
                start--;
            }
            if (start < 0) start = 0;

            return (start, end);
        }

        /// <summary>
        /// Find the denominator boundaries for a fraction at slashPos
        /// </summary>
        private (int start, int end) FindDenominator(string equation, int slashPos)
        {
            int start = slashPos + 1;
            int end = start;

            int parenDepth = 0;
            int braceDepth = 0;

            while (end < equation.Length)
            {
                char c = equation[end];
                if (c == '(' || c == '[') parenDepth++;
                else if (c == ')' || c == ']') { parenDepth--; if (parenDepth < 0) break; }
                else if (c == '{') braceDepth++;
                else if (c == '}') { braceDepth--; if (braceDepth < 0) break; }
                else if (parenDepth == 0 && braceDepth == 0)
                {
                    // Stop at operators (but not _ or ^)
                    if (c == '+' || c == '-' || c == '=' || c == ' ' || c == '*' || c == '·')
                    {
                        break;
                    }
                }
                end++;
            }

            return (start, end);
        }

        /// <summary>
        /// Remove outer parentheses or braces from fraction part
        /// </summary>
        private string TrimFractionPart(string text)
        {
            text = text.Trim();
            if ((text.StartsWith("(") && text.EndsWith(")")) ||
                (text.StartsWith("{") && text.EndsWith("}")) ||
                (text.StartsWith("[") && text.EndsWith("]")))
            {
                return text.Substring(1, text.Length - 2);
            }
            return text;
        }

        /// <summary>
        /// Estimate text width for layout purposes
        /// </summary>
        private double EstimateTextWidth(string text, double fontSize)
        {
            // Rough estimate: ~0.5 * fontSize per character, less for subscripts
            double width = 0;
            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];
                if (c == '_' || c == '^' || c == '{' || c == '}')
                    continue; // Subscript markers don't take space
                width += fontSize * 0.55;
            }
            return Math.Max(width, fontSize);
        }

        /// <summary>
        /// Render inline equation part and return width
        /// </summary>
        private double RenderInlineEquationPart(StringBuilder sb, string text, double x, double y, string color, double fontSize)
        {
            if (string.IsNullOrEmpty(text)) return 0;

            sb.Append($"<text x=\"{x:F1}\" y=\"{y:F1}\" font-family=\"Times New Roman, serif\" font-size=\"{fontSize:F0}\" fill=\"{color}\">");
            RenderEquationContent(sb, text, color, fontSize);
            sb.Append("</text>");

            return EstimateTextWidth(text, fontSize);
        }

        /// <summary>
        /// Render equation content (without text wrapper) handling subscripts, superscripts, etc.
        /// </summary>
        private void RenderEquationContent(StringBuilder sb, string text, string color, double fontSize)
        {
            int i = 0;
            while (i < text.Length)
            {
                char c = text[i];

                // Handle subscript: X_a or X_{abc}
                if (c == '_' && i + 1 < text.Length)
                {
                    i++;
                    string subscript = ExtractSubscriptOrSuperscript(text, ref i);
                    sb.Append($"<tspan baseline-shift=\"sub\" font-size=\"{fontSize * 0.7:F0}\">{System.Net.WebUtility.HtmlEncode(subscript)}</tspan>");
                }
                // Handle superscript: X^2 or X^{abc}
                else if (c == '^' && i + 1 < text.Length)
                {
                    i++;
                    string superscript = ExtractSubscriptOrSuperscript(text, ref i);
                    sb.Append($"<tspan baseline-shift=\"super\" font-size=\"{fontSize * 0.7:F0}\">{System.Net.WebUtility.HtmlEncode(superscript)}</tspan>");
                }
                // Handle multiplication: * becomes ·
                else if (c == '*')
                {
                    sb.Append("·");
                    i++;
                }
                // Handle Greek letters
                else if (c == '\\' && i + 1 < text.Length)
                {
                    var greekChar = TryParseGreekLetter(text, ref i);
                    if (greekChar != null)
                        sb.Append(greekChar);
                    else
                    {
                        sb.Append(System.Net.WebUtility.HtmlEncode(c.ToString()));
                        i++;
                    }
                }
                // Make single letters italic (variables)
                else if (char.IsLetter(c) && !char.IsDigit(c))
                {
                    // Check if it's a single letter variable
                    bool isSingleVar = (i == 0 || !char.IsLetter(text[i - 1])) &&
                                       (i + 1 >= text.Length || !char.IsLetter(text[i + 1]) || text[i + 1] == '_');
                    if (isSingleVar)
                        sb.Append($"<tspan font-style=\"italic\">{c}</tspan>");
                    else
                        sb.Append(c);
                    i++;
                }
                else
                {
                    sb.Append(System.Net.WebUtility.HtmlEncode(c.ToString()));
                    i++;
                }
            }
        }

        /// <summary>
        /// Extract subscript or superscript content (handles {} for multi-char)
        /// </summary>
        private string ExtractSubscriptOrSuperscript(string text, ref int i)
        {
            if (i >= text.Length) return "";

            if (text[i] == '{')
            {
                int endBrace = text.IndexOf('}', i);
                if (endBrace > i)
                {
                    var content = text.Substring(i + 1, endBrace - i - 1);
                    i = endBrace + 1;
                    return content;
                }
            }

            // Single character
            var result = text[i].ToString();
            i++;
            return result;
        }

        /// <summary>
        /// Try to parse a Greek letter name
        /// </summary>
        private string TryParseGreekLetter(string text, ref int i)
        {
            if (i >= text.Length || text[i] != '\\') return null;

            var remaining = text.Substring(i + 1);
            var match = System.Text.RegularExpressions.Regex.Match(remaining,
                @"^(alpha|beta|gamma|delta|epsilon|eta|theta|lambda|mu|nu|pi|rho|sigma|tau|phi|omega)\b",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            if (match.Success)
            {
                var greekChar = match.Value.ToLower() switch
                {
                    "alpha" => "α", "beta" => "β", "gamma" => "γ", "delta" => "δ",
                    "epsilon" => "ε", "eta" => "η", "theta" => "θ", "lambda" => "λ",
                    "mu" => "μ", "nu" => "ν", "pi" => "π", "rho" => "ρ",
                    "sigma" => "σ", "tau" => "τ", "phi" => "φ", "omega" => "ω",
                    _ => match.Value
                };
                i += 1 + match.Length;
                return greekChar;
            }
            return null;
        }

        /// <summary>
        /// Render simple equation without fractions
        /// </summary>
        private string RenderSimpleEquation(string equation, double x, double y, string color, int fontSize)
        {
            var sb = new StringBuilder();
            sb.Append($"<text x=\"{x:F1}\" y=\"{y:F1}\" font-family=\"Times New Roman, serif\" font-size=\"{fontSize}\" fill=\"{color}\">");
            RenderEquationContent(sb, equation, color, fontSize);
            sb.Append("</text>");
            return sb.ToString();
        }

        /// <summary>
        /// Parse arrow annotation: x1, y1, x2, y2 [, color, strokewidth]
        /// </summary>
        private PlotAnnotation ParseArrowAnnotation(string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = "arrow" };
                var parts = value.Split(',');
                if (parts.Length >= 4)
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x1);
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y1);
                    double.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x2);
                    double.TryParse(parts[3].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y2);
                    annotation.X = x1;
                    annotation.Y = y1;
                    annotation.X2 = x2;
                    annotation.Y2 = y2;

                    // Parse optional color and strokewidth
                    for (int i = 4; i < parts.Length; i++)
                    {
                        var p = parts[i].Trim();
                        if (p.StartsWith("#") || p.StartsWith("rgb"))
                            annotation.Color = p;
                        else if (double.TryParse(p, System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var sw))
                            annotation.StrokeWidth = sw;
                    }
                }
                return annotation;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Parse line annotation: x1, y1, x2, y2 or hline: y or vline: x [, color, strokewidth]
        /// </summary>
        private PlotAnnotation ParseLineAnnotation(string key, string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = key };
                var parts = value.Split(',');

                if (key == "hline")
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y);
                    annotation.Y = y;
                    // Parse optional color
                    for (int i = 1; i < parts.Length; i++)
                    {
                        var p = parts[i].Trim();
                        if (p.StartsWith("#")) annotation.Color = p;
                    }
                }
                else if (key == "vline")
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x);
                    annotation.X = x;
                    for (int i = 1; i < parts.Length; i++)
                    {
                        var p = parts[i].Trim();
                        if (p.StartsWith("#")) annotation.Color = p;
                    }
                }
                else if (parts.Length >= 4)
                {
                    annotation.Type = "line";
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x1);
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y1);
                    double.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x2);
                    double.TryParse(parts[3].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y2);
                    annotation.X = x1;
                    annotation.Y = y1;
                    annotation.X2 = x2;
                    annotation.Y2 = y2;
                    for (int i = 4; i < parts.Length; i++)
                    {
                        var p = parts[i].Trim();
                        if (p.StartsWith("#")) annotation.Color = p;
                    }
                }
                return annotation;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Parse shape annotation: rect x, y, w, h or circle x, y, r [, color, fill]
        /// </summary>
        private PlotAnnotation ParseShapeAnnotation(string key, string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = key.StartsWith("rect") ? "rect" : "circle" };
                var parts = value.Split(',');

                if (annotation.Type == "rect" && parts.Length >= 4)
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x);
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y);
                    double.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var w);
                    double.TryParse(parts[3].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var h);
                    annotation.X = x;
                    annotation.Y = y;
                    annotation.X2 = w;  // width
                    annotation.Y2 = h;  // height
                    for (int i = 4; i < parts.Length; i++)
                    {
                        var p = parts[i].Trim();
                        if (p.StartsWith("#"))
                        {
                            if (string.IsNullOrEmpty(annotation.Fill) || annotation.Fill == "none")
                                annotation.Color = p;
                            else
                                annotation.Fill = p;
                        }
                        else if (p == "fill" || p == "filled" || p == "lleno")
                            annotation.Fill = annotation.Color;
                    }
                }
                else if (annotation.Type == "circle" && parts.Length >= 3)
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x);
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y);
                    double.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var r);
                    annotation.X = x;
                    annotation.Y = y;
                    annotation.X2 = r;  // radius
                    for (int i = 3; i < parts.Length; i++)
                    {
                        var p = parts[i].Trim();
                        if (p.StartsWith("#"))
                        {
                            if (string.IsNullOrEmpty(annotation.Fill) || annotation.Fill == "none")
                                annotation.Color = p;
                            else
                                annotation.Fill = p;
                        }
                        else if (p == "fill" || p == "filled" || p == "lleno")
                            annotation.Fill = annotation.Color;
                    }
                }
                return annotation;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Parse projection annotation: x, y [, color, style]
        /// Draws dashed lines from point (x,y) to both axes
        /// </summary>
        private PlotAnnotation ParseProjectionAnnotation(string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = "projection" };
                var parts = value.Split(',');

                if (parts.Length >= 2)
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x);
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y);
                    annotation.X = x;
                    annotation.Y = y;
                    annotation.Color = "#666666";  // Default gray dashed
                    annotation.StrokeWidth = 1;

                    for (int i = 2; i < parts.Length; i++)
                    {
                        var p = parts[i].Trim();
                        if (p.StartsWith("#")) annotation.Color = p;
                    }
                }
                return annotation;
            }
            catch { return null; }
        }

        /// <summary>
        /// Parse tick annotation: value, "label" [, color]
        /// Adds custom label at axis position
        /// </summary>
        private PlotAnnotation ParseTickAnnotation(string key, string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = key.Contains("x") ? "xtick" : "ytick" };

                // Find quoted text
                int quoteStart = value.IndexOf('"');
                int quoteEnd = value.LastIndexOf('"');
                if (quoteStart < 0 || quoteEnd <= quoteStart)
                {
                    quoteStart = value.IndexOf('\'');
                    quoteEnd = value.LastIndexOf('\'');
                }

                if (quoteStart >= 0 && quoteEnd > quoteStart)
                {
                    annotation.Text = value.Substring(quoteStart + 1, quoteEnd - quoteStart - 1);
                    var beforeQuote = value.Substring(0, quoteStart).Trim().TrimEnd(',');
                    double.TryParse(beforeQuote, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var pos);

                    if (annotation.Type == "xtick")
                        annotation.X = pos;
                    else
                        annotation.Y = pos;

                    // Parse options after quote
                    if (quoteEnd < value.Length - 1)
                    {
                        var afterQuote = value.Substring(quoteEnd + 1).Split(',');
                        foreach (var p in afterQuote)
                        {
                            var pt = p.Trim();
                            if (pt.StartsWith("#")) annotation.Color = pt;
                        }
                    }
                }
                annotation.FontSize = 12;
                annotation.Italic = true;
                return annotation;
            }
            catch { return null; }
        }

        /// <summary>
        /// Parse angle annotation: x, y, startAngle, endAngle, radius, "label" [, color]
        /// Draws an arc indicating an angle
        /// </summary>
        private PlotAnnotation ParseAngleAnnotation(string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = "angle" };

                // Find quoted text for label
                int quoteStart = value.IndexOf('"');
                int quoteEnd = value.LastIndexOf('"');
                if (quoteStart < 0 || quoteEnd <= quoteStart)
                {
                    quoteStart = value.IndexOf('\'');
                    quoteEnd = value.LastIndexOf('\'');
                }

                string numericPart = quoteStart > 0 ? value.Substring(0, quoteStart) : value;
                var parts = numericPart.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);

                if (parts.Length >= 5)
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x);
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y);
                    double.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var startAngle);
                    double.TryParse(parts[3].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var endAngle);
                    double.TryParse(parts[4].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var radius);

                    annotation.X = x;
                    annotation.Y = y;
                    annotation.X2 = startAngle;  // Store start angle
                    annotation.Y2 = endAngle;    // Store end angle
                    annotation.Rotation = radius; // Store radius (reusing Rotation field)
                }

                if (quoteStart >= 0 && quoteEnd > quoteStart)
                {
                    annotation.Text = value.Substring(quoteStart + 1, quoteEnd - quoteStart - 1);
                }

                // Parse color after quote
                if (quoteEnd > 0 && quoteEnd < value.Length - 1)
                {
                    var afterQuote = value.Substring(quoteEnd + 1).Split(',');
                    foreach (var p in afterQuote)
                    {
                        var pt = p.Trim();
                        if (pt.StartsWith("#")) annotation.Color = pt;
                    }
                }

                annotation.FontSize = 11;
                return annotation;
            }
            catch { return null; }
        }

        /// <summary>
        /// Parse brace/bracket annotation: x1, y1, x2, y2, "label" [, color, position]
        /// Draws a curly brace between two points with a label
        /// position: above/below/left/right
        /// </summary>
        private PlotAnnotation ParseBraceAnnotation(string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = "brace" };

                // Find quoted text
                int quoteStart = value.IndexOf('"');
                int quoteEnd = value.LastIndexOf('"');
                if (quoteStart < 0 || quoteEnd <= quoteStart)
                {
                    quoteStart = value.IndexOf('\'');
                    quoteEnd = value.LastIndexOf('\'');
                }

                string numericPart = quoteStart > 0 ? value.Substring(0, quoteStart) : value;
                var parts = numericPart.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);

                if (parts.Length >= 4)
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x1);
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y1);
                    double.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x2);
                    double.TryParse(parts[3].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y2);

                    annotation.X = x1;
                    annotation.Y = y1;
                    annotation.X2 = x2;
                    annotation.Y2 = y2;
                }

                if (quoteStart >= 0 && quoteEnd > quoteStart)
                {
                    annotation.Text = value.Substring(quoteStart + 1, quoteEnd - quoteStart - 1);
                }

                // Parse options after quote
                annotation.Anchor = "below";  // Default position
                if (quoteEnd > 0 && quoteEnd < value.Length - 1)
                {
                    var afterQuote = value.Substring(quoteEnd + 1).Split(',');
                    foreach (var p in afterQuote)
                    {
                        var pt = p.Trim().ToLower();
                        if (pt.StartsWith("#")) annotation.Color = pt;
                        else if (pt == "above" || pt == "arriba" || pt == "top") annotation.Anchor = "above";
                        else if (pt == "below" || pt == "abajo" || pt == "bottom") annotation.Anchor = "below";
                        else if (pt == "left" || pt == "izquierda") annotation.Anchor = "left";
                        else if (pt == "right" || pt == "derecha") annotation.Anchor = "right";
                    }
                }

                annotation.FontSize = 11;
                return annotation;
            }
            catch { return null; }
        }

        /// <summary>
        /// Parse point annotation: x, y [, color, size, filled]
        /// Draws a point/dot marker
        /// </summary>
        private PlotAnnotation ParsePointAnnotation(string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = "point" };
                var parts = value.Split(',');

                if (parts.Length >= 2)
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x);
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y);
                    annotation.X = x;
                    annotation.Y = y;
                    annotation.X2 = 5;  // Default radius
                    annotation.Fill = "filled";  // Default filled

                    for (int i = 2; i < parts.Length; i++)
                    {
                        var p = parts[i].Trim();
                        if (p.StartsWith("#")) annotation.Color = p;
                        else if (double.TryParse(p, System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var size))
                            annotation.X2 = size;
                        else if (p == "empty" || p == "vacio" || p == "outline")
                            annotation.Fill = "none";
                        else if (p == "filled" || p == "lleno" || p == "fill")
                            annotation.Fill = "filled";
                    }
                }
                return annotation;
            }
            catch { return null; }
        }

        /// <summary>
        /// Parse dimension annotation with double-headed arrow: x1, y1, x2, y2, "label" [, color, offset]
        /// Draws a line with arrows at both ends and a label
        /// </summary>
        private PlotAnnotation ParseDimensionAnnotation(string value)
        {
            try
            {
                var annotation = new PlotAnnotation { Type = "dimension" };

                // Find quoted text
                int quoteStart = value.IndexOf('"');
                int quoteEnd = value.LastIndexOf('"');
                if (quoteStart < 0 || quoteEnd <= quoteStart)
                {
                    quoteStart = value.IndexOf('\'');
                    quoteEnd = value.LastIndexOf('\'');
                }

                string numericPart = quoteStart > 0 ? value.Substring(0, quoteStart) : value;
                var parts = numericPart.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);

                if (parts.Length >= 4)
                {
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x1);
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y1);
                    double.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var x2);
                    double.TryParse(parts[3].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var y2);

                    annotation.X = x1;
                    annotation.Y = y1;
                    annotation.X2 = x2;
                    annotation.Y2 = y2;
                }

                if (quoteStart >= 0 && quoteEnd > quoteStart)
                {
                    annotation.Text = value.Substring(quoteStart + 1, quoteEnd - quoteStart - 1);
                }

                // Parse options after quote
                annotation.Rotation = 0;  // Used for offset
                annotation.Color = "#333333";
                if (quoteEnd > 0 && quoteEnd < value.Length - 1)
                {
                    var afterQuote = value.Substring(quoteEnd + 1).Split(',');
                    foreach (var p in afterQuote)
                    {
                        var pt = p.Trim();
                        if (pt.StartsWith("#")) annotation.Color = pt;
                        else if (double.TryParse(pt, System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var offset))
                            annotation.Rotation = offset;  // Store offset in Rotation
                    }
                }

                annotation.FontSize = 11;
                return annotation;
            }
            catch { return null; }
        }

        /// <summary>
        /// Get plot data from variable name or inline array
        /// </summary>
        private double[] GetPlotData(string dataSpec, Dictionary<string, object> variables)
        {
            if (string.IsNullOrEmpty(dataSpec)) return null;

            // Check if it's an inline array: [1; 2; 3] or [1, 2, 3]
            // Also handle plain comma-separated values: 0, 0.11, 0.605, 2.4, 4.0
            var trimmedSpec = dataSpec.Trim();
            bool hasSquareBrackets = trimmedSpec.StartsWith("[") && trimmedSpec.EndsWith("]");
            bool looksLikeInlineData = trimmedSpec.Contains(",") || trimmedSpec.Contains(";");

            if (hasSquareBrackets || looksLikeInlineData)
            {
                var inner = hasSquareBrackets
                    ? trimmedSpec.Substring(1, trimmedSpec.Length - 2)
                    : trimmedSpec;
                var values = inner.Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries);
                var result = new List<double>();
                foreach (var v in values)
                {
                    var cleanVal = v.Trim();
                    // Remove unit if present (e.g., "2.5'm" -> "2.5")
                    var quoteIdx = cleanVal.IndexOf('\'');
                    if (quoteIdx > 0) cleanVal = cleanVal.Substring(0, quoteIdx);

                    if (double.TryParse(cleanVal, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var val))
                        result.Add(val);
                }
                if (result.Count > 0)
                    return result.ToArray();
            }

            // It's a variable name
            var varName = dataSpec.Trim();
            if (!variables.TryGetValue(varName, out var data))
                return null;

            // Convert to double array
            if (data is double[] arr) return arr;
            if (data is double d) return new[] { d };
            if (data is double[,] matrix)
            {
                // Flatten matrix (column-first)
                var rows = matrix.GetLength(0);
                var cols = matrix.GetLength(1);
                var flat = new double[rows * cols];
                int idx = 0;
                for (int c = 0; c < cols; c++)
                    for (int r = 0; r < rows; r++)
                        flat[idx++] = matrix[r, c];
                return flat;
            }

            return null;
        }

        /// <summary>
        /// Generate SVG plot with Mathcad Prime style (arrows, grid paper, italic labels, markers, annotations)
        /// </summary>
        private string GeneratePlotSvg(double[] x, double[] y, double xmin, double xmax, double ymin, double ymax,
            string xlabel, string ylabel, string title, string legend, string color, string lineStyle,
            string symbol, int symbolSize, double lineWidth, bool showGrid, int width, int height,
            bool smooth = false, double smoothTension = 0.3, List<PlotAnnotation> annotations = null)
        {
            const int margin = 70;
            const int marginTop = 30;
            const int marginRight = 30;
            const int marginBottom = 50;

            var plotWidth = width - margin - marginRight;
            var plotHeight = height - marginTop - marginBottom;

            var scaleX = plotWidth / (xmax - xmin);
            var scaleY = plotHeight / (ymax - ymin);

            var sb = new StringBuilder();

            // SVG header with defs for arrow markers
            sb.Append($"<svg class=\"hk-plot\" width=\"{width}\" height=\"{height}\" xmlns=\"http://www.w3.org/2000/svg\">");

            // Define arrow markers (for axes and annotations)
            sb.Append("<defs>");
            sb.Append("<marker id=\"arrowhead\" markerWidth=\"10\" markerHeight=\"7\" refX=\"9\" refY=\"3.5\" orient=\"auto\">");
            sb.Append("<polygon points=\"0 0, 10 3.5, 0 7\" fill=\"#333\"/>");
            sb.Append("</marker>");
            sb.Append("<marker id=\"arrowhead-annotation\" markerWidth=\"8\" markerHeight=\"6\" refX=\"7\" refY=\"3\" orient=\"auto\">");
            sb.Append("<polygon points=\"0 0, 8 3, 0 6\" fill=\"currentColor\"/>");
            sb.Append("</marker>");
            sb.Append("</defs>");

            // Background - papel milimetrado (azul claro)
            sb.Append($"<rect width=\"{width}\" height=\"{height}\" fill=\"#f0f8ff\"/>");

            // Plot area background - slightly lighter
            sb.Append($"<rect x=\"{margin}\" y=\"{marginTop}\" width=\"{plotWidth}\" height=\"{plotHeight}\" fill=\"#f8fbff\"/>");

            // Grid - papel milimetrado style
            if (showGrid)
            {
                sb.Append(GenerateMathcadGrid(margin, marginTop, plotWidth, plotHeight, xmin, xmax, ymin, ymax, scaleX, scaleY));
            }

            // Axes with arrows (drawn over grid)
            // Y-axis with arrow pointing up
            sb.Append($"<line x1=\"{margin}\" y1=\"{marginTop + plotHeight}\" x2=\"{margin}\" y2=\"{marginTop - 10}\" stroke=\"#333\" stroke-width=\"1.5\" marker-end=\"url(#arrowhead)\"/>");
            // X-axis with arrow pointing right
            sb.Append($"<line x1=\"{margin}\" y1=\"{marginTop + plotHeight}\" x2=\"{margin + plotWidth + 15}\" y2=\"{marginTop + plotHeight}\" stroke=\"#333\" stroke-width=\"1.5\" marker-end=\"url(#arrowhead)\"/>");

            // Convert line style to SVG dash array
            string dashArray = lineStyle switch
            {
                "dash" or "dashed" or "---" => "10,5",
                "dot" or "dotted" or "..." => "3,3",
                "dashdot" or "-.-" => "10,3,3,3",
                "longdash" or "--" => "15,5",
                "shortdash" => "5,3",
                "none" => "0,1000", // effectively invisible line
                _ => "" // solid
            };

            // Draw shape annotations FIRST (behind data curve)
            if (annotations != null && annotations.Count > 0)
            {
                var shapeTypes1 = new HashSet<string> { "rect", "circle", "hline", "vline" };
                var shapes1 = annotations.Where(a => shapeTypes1.Contains(a.Type)).ToList();
                if (shapes1.Count > 0)
                    sb.Append(GenerateAnnotations(shapes1, margin, marginTop, plotWidth, plotHeight, xmin, xmax, ymin, ymax, scaleX, scaleY));
            }

            // Calculate point coordinates
            var points = new List<(double px, double py)>();
            for (int i = 0; i < x.Length; i++)
            {
                var px = margin + (x[i] - xmin) * scaleX;
                var py = marginTop + plotHeight - (y[i] - ymin) * scaleY;
                // Clip to plot area
                px = Math.Max(margin, Math.Min(margin + plotWidth, px));
                py = Math.Max(marginTop, Math.Min(marginTop + plotHeight, py));
                points.Add((px, py));
            }

            // Data line (if style is not "none")
            if (lineStyle != "none")
            {
                if (smooth && points.Count >= 2)
                {
                    // Use smooth Bezier curves (Catmull-Rom spline converted to cubic Bezier)
                    sb.Append($"<path d=\"{GenerateSmoothPath(points, smoothTension)}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"{lineWidth:F1}\"");
                }
                else
                {
                    // Use straight line segments (polyline)
                    sb.Append($"<polyline points=\"");
                    foreach (var (px, py) in points)
                    {
                        sb.Append($"{px:F2},{py:F2} ");
                    }
                    sb.Append($"\" fill=\"none\" stroke=\"{color}\" stroke-width=\"{lineWidth:F1}\"");
                }
                if (!string.IsNullOrEmpty(dashArray))
                    sb.Append($" stroke-dasharray=\"{dashArray}\"");
                sb.Append("/>");
            }

            // Draw markers/symbols at each data point
            if (symbol != "none" && symbol != "ninguno")
            {
                foreach (var (px, py) in points)
                {
                    sb.Append(GenerateMarker(px, py, symbol, symbolSize, color));
                }
            }

            // Draw overlay annotations ON TOP of data curve (text, equations, arrows, etc.)
            if (annotations != null && annotations.Count > 0)
            {
                var shapeTypes2 = new HashSet<string> { "rect", "circle", "hline", "vline" };
                var overlays2 = annotations.Where(a => !shapeTypes2.Contains(a.Type)).ToList();
                if (overlays2.Count > 0)
                    sb.Append(GenerateAnnotations(overlays2, margin, marginTop, plotWidth, plotHeight, xmin, xmax, ymin, ymax, scaleX, scaleY));
            }

            // X-axis label (italic, with underline like Mathcad)
            var xlabelX = margin + plotWidth / 2;
            var xlabelY = height - 8;
            sb.Append($"<text x=\"{xlabelX}\" y=\"{xlabelY}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"14\" font-style=\"italic\" fill=\"#003366\">{System.Web.HttpUtility.HtmlEncode(xlabel)}</text>");
            // Underline for x label
            var xlabelWidth = xlabel.Length * 7;
            sb.Append($"<line x1=\"{xlabelX - xlabelWidth/2}\" y1=\"{xlabelY + 3}\" x2=\"{xlabelX + xlabelWidth/2}\" y2=\"{xlabelY + 3}\" stroke=\"#003366\" stroke-width=\"1\"/>");

            // Y-axis label (italic, rotated, with underline like Mathcad)
            var ylabelX = 15;
            var ylabelY = marginTop + plotHeight / 2;
            sb.Append($"<g transform=\"rotate(-90, {ylabelX}, {ylabelY})\">");
            sb.Append($"<text x=\"{ylabelX}\" y=\"{ylabelY}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"14\" font-style=\"italic\" fill=\"#003366\">{System.Web.HttpUtility.HtmlEncode(ylabel)}</text>");
            // Underline for y label (fixed: was using xlabelX instead of ylabelX)
            var ylabelWidth = ylabel.Length * 7;
            sb.Append($"<line x1=\"{ylabelX - ylabelWidth/2}\" y1=\"{ylabelY + 3}\" x2=\"{ylabelX + ylabelWidth/2}\" y2=\"{ylabelY + 3}\" stroke=\"#003366\" stroke-width=\"1\"/>");
            sb.Append("</g>");

            // Title (if provided)
            if (!string.IsNullOrEmpty(title))
            {
                sb.Append($"<text x=\"{width / 2}\" y=\"18\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"13\" font-weight=\"bold\" fill=\"#003366\">{System.Web.HttpUtility.HtmlEncode(title)}</text>");
            }

            // Legend (if provided)
            if (!string.IsNullOrEmpty(legend))
            {
                var legendX = margin + plotWidth - 90;
                var legendY = marginTop + 20;
                sb.Append($"<rect x=\"{legendX - 5}\" y=\"{legendY - 12}\" width=\"95\" height=\"22\" fill=\"white\" fill-opacity=\"0.9\" stroke=\"#ccc\" rx=\"3\"/>");
                // Legend line
                sb.Append($"<line x1=\"{legendX}\" y1=\"{legendY}\" x2=\"{legendX + 20}\" y2=\"{legendY}\" stroke=\"{color}\" stroke-width=\"{lineWidth:F1}\"");
                if (!string.IsNullOrEmpty(dashArray))
                    sb.Append($" stroke-dasharray=\"{dashArray}\"");
                sb.Append("/>");
                // Legend marker
                if (symbol != "none" && symbol != "ninguno")
                {
                    sb.Append(GenerateMarker(legendX + 10, legendY, symbol, symbolSize, color));
                }
                sb.Append($"<text x=\"{legendX + 25}\" y=\"{legendY + 4}\" font-family=\"Times New Roman, serif\" font-size=\"11\" font-style=\"italic\" fill=\"#003366\">{System.Web.HttpUtility.HtmlEncode(legend)}</text>");
            }

            sb.Append("</svg>");
            return sb.ToString();
        }

        /// <summary>
        /// Generate SVG plot with multiple data series support
        /// </summary>
        private string GeneratePlotSvgMultiSeries(double[] x, List<double[]> allYValues, List<PlotSeries> series,
            double xmin, double xmax, double ymin, double ymax,
            string xlabel, string ylabel, string title, bool showGrid, bool showLegend, string background, int width, int height,
            List<PlotAnnotation> annotations = null)
        {
            const int margin = 70;
            const int marginTop = 30;
            const int marginRight = 30;
            const int marginBottom = 50;

            var plotWidth = width - margin - marginRight;
            var plotHeight = height - marginTop - marginBottom;

            var scaleX = plotWidth / (xmax - xmin);
            var scaleY = plotHeight / (ymax - ymin);

            var sb = new StringBuilder();

            // SVG header with defs for arrow markers
            sb.Append($"<svg class=\"hk-plot\" width=\"{width}\" height=\"{height}\" xmlns=\"http://www.w3.org/2000/svg\">");

            // Define arrow markers (for axes and annotations)
            sb.Append("<defs>");
            sb.Append("<marker id=\"arrowhead\" markerWidth=\"10\" markerHeight=\"7\" refX=\"9\" refY=\"3.5\" orient=\"auto\">");
            sb.Append("<polygon points=\"0 0, 10 3.5, 0 7\" fill=\"#333\"/>");
            sb.Append("</marker>");
            sb.Append("<marker id=\"arrowhead-annotation\" markerWidth=\"8\" markerHeight=\"6\" refX=\"7\" refY=\"3\" orient=\"auto\">");
            sb.Append("<polygon points=\"0 0, 8 3, 0 6\" fill=\"currentColor\"/>");
            sb.Append("</marker>");
            // Double-headed arrow markers for dimensions
            sb.Append("<marker id=\"arrowhead-start\" markerWidth=\"8\" markerHeight=\"6\" refX=\"1\" refY=\"3\" orient=\"auto\">");
            sb.Append("<polygon points=\"8 0, 0 3, 8 6\" fill=\"#333\"/>");
            sb.Append("</marker>");
            sb.Append("<marker id=\"arrowhead-end\" markerWidth=\"8\" markerHeight=\"6\" refX=\"7\" refY=\"3\" orient=\"auto\">");
            sb.Append("<polygon points=\"0 0, 8 3, 0 6\" fill=\"#333\"/>");
            sb.Append("</marker>");
            sb.Append("</defs>");

            // Background - depends on style
            bool isWhiteBackground = background == "white" || background == "blanco" || background == "clean" || background == "limpio";
            if (isWhiteBackground)
            {
                sb.Append($"<rect width=\"{width}\" height=\"{height}\" fill=\"white\"/>");
                sb.Append($"<rect x=\"{margin}\" y=\"{marginTop}\" width=\"{plotWidth}\" height=\"{plotHeight}\" fill=\"white\"/>");
            }
            else
            {
                sb.Append($"<rect width=\"{width}\" height=\"{height}\" fill=\"#f0f8ff\"/>");
                sb.Append($"<rect x=\"{margin}\" y=\"{marginTop}\" width=\"{plotWidth}\" height=\"{plotHeight}\" fill=\"#f8fbff\"/>");
            }

            // Grid
            if (showGrid)
            {
                if (isWhiteBackground)
                {
                    sb.Append(GenerateSimpleGrid(margin, marginTop, plotWidth, plotHeight, xmin, xmax, ymin, ymax, scaleX, scaleY));
                }
                else
                {
                    sb.Append(GenerateMathcadGrid(margin, marginTop, plotWidth, plotHeight, xmin, xmax, ymin, ymax, scaleX, scaleY));
                }
            }

            // Axes with arrows (drawn over grid)
            sb.Append($"<line x1=\"{margin}\" y1=\"{marginTop + plotHeight}\" x2=\"{margin}\" y2=\"{marginTop - 10}\" stroke=\"#333\" stroke-width=\"1.5\" marker-end=\"url(#arrowhead)\"/>");
            sb.Append($"<line x1=\"{margin}\" y1=\"{marginTop + plotHeight}\" x2=\"{margin + plotWidth + 15}\" y2=\"{marginTop + plotHeight}\" stroke=\"#333\" stroke-width=\"1.5\" marker-end=\"url(#arrowhead)\"/>");

            // Draw shape annotations FIRST (behind data curves) - rects, circles, hlines, vlines
            if (annotations != null && annotations.Count > 0)
            {
                var shapeTypes = new HashSet<string> { "rect", "circle", "hline", "vline" };
                var shapeAnnotations = annotations.Where(a => shapeTypes.Contains(a.Type)).ToList();
                if (shapeAnnotations.Count > 0)
                    sb.Append(GenerateAnnotations(shapeAnnotations, margin, marginTop, plotWidth, plotHeight, xmin, xmax, ymin, ymax, scaleX, scaleY));
            }

            // Draw all data series
            for (int seriesIdx = 0; seriesIdx < series.Count && seriesIdx < allYValues.Count; seriesIdx++)
            {
                var s = series[seriesIdx];
                var y = allYValues[seriesIdx];

                // Convert line style to SVG dash array
                string dashArray = s.LineStyle switch
                {
                    "dash" or "dashed" or "---" => "10,5",
                    "dot" or "dotted" or "..." => "3,3",
                    "dashdot" or "-.-" => "10,3,3,3",
                    "longdash" or "--" => "15,5",
                    "shortdash" => "5,3",
                    "none" => "0,1000",
                    _ => ""
                };

                // Calculate point coordinates
                var points = new List<(double px, double py)>();
                for (int i = 0; i < x.Length; i++)
                {
                    var px = margin + (x[i] - xmin) * scaleX;
                    var py = marginTop + plotHeight - (y[i] - ymin) * scaleY;
                    px = Math.Max(margin, Math.Min(margin + plotWidth, px));
                    py = Math.Max(marginTop, Math.Min(marginTop + plotHeight, py));
                    points.Add((px, py));
                }

                // Data line (if style is not "none")
                if (s.LineStyle != "none")
                {
                    if (s.Smooth && points.Count >= 2)
                    {
                        sb.Append($"<path d=\"{GenerateSmoothPath(points, s.SmoothTension)}\" fill=\"none\" stroke=\"{s.Color}\" stroke-width=\"{s.LineWidth:F1}\"");
                    }
                    else
                    {
                        sb.Append($"<polyline points=\"");
                        foreach (var (px, py) in points)
                        {
                            sb.Append($"{px:F2},{py:F2} ");
                        }
                        sb.Append($"\" fill=\"none\" stroke=\"{s.Color}\" stroke-width=\"{s.LineWidth:F1}\"");
                    }
                    if (!string.IsNullOrEmpty(dashArray))
                        sb.Append($" stroke-dasharray=\"{dashArray}\"");
                    sb.Append("/>");
                }

                // Draw markers/symbols at each data point
                if (s.Symbol != "none" && s.Symbol != "ninguno")
                {
                    foreach (var (px, py) in points)
                    {
                        sb.Append(GenerateMarker(px, py, s.Symbol, s.SymbolSize, s.Color));
                    }
                }
            }

            // Draw remaining annotations ON TOP of data curves (text, equations, arrows, lines, etc.)
            if (annotations != null && annotations.Count > 0)
            {
                var shapeTypesOverlay = new HashSet<string> { "rect", "circle", "hline", "vline" };
                var overlayAnnotations = annotations.Where(a => !shapeTypesOverlay.Contains(a.Type)).ToList();
                if (overlayAnnotations.Count > 0)
                    sb.Append(GenerateAnnotations(overlayAnnotations, margin, marginTop, plotWidth, plotHeight, xmin, xmax, ymin, ymax, scaleX, scaleY));
            }

            // X-axis label
            var xlabelX = margin + plotWidth / 2;
            var xlabelY = height - 8;
            sb.Append($"<text x=\"{xlabelX}\" y=\"{xlabelY}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"14\" font-style=\"italic\" fill=\"#003366\">{System.Web.HttpUtility.HtmlEncode(xlabel)}</text>");
            var xlabelWidth = xlabel.Length * 7;
            sb.Append($"<line x1=\"{xlabelX - xlabelWidth/2}\" y1=\"{xlabelY + 3}\" x2=\"{xlabelX + xlabelWidth/2}\" y2=\"{xlabelY + 3}\" stroke=\"#003366\" stroke-width=\"1\"/>");

            // Y-axis label
            var ylabelX = 15;
            var ylabelY = marginTop + plotHeight / 2;
            sb.Append($"<g transform=\"rotate(-90, {ylabelX}, {ylabelY})\">");
            sb.Append($"<text x=\"{ylabelX}\" y=\"{ylabelY}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"14\" font-style=\"italic\" fill=\"#003366\">{System.Web.HttpUtility.HtmlEncode(ylabel)}</text>");
            // Underline for y label (fixed: was using xlabelX instead of ylabelX)
            var ylabelWidth = ylabel.Length * 7;
            sb.Append($"<line x1=\"{ylabelX - ylabelWidth/2}\" y1=\"{ylabelY + 3}\" x2=\"{ylabelX + ylabelWidth/2}\" y2=\"{ylabelY + 3}\" stroke=\"#003366\" stroke-width=\"1\"/>");
            sb.Append("</g>");

            // Title (if provided)
            if (!string.IsNullOrEmpty(title))
            {
                sb.Append($"<text x=\"{width / 2}\" y=\"18\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"13\" font-weight=\"bold\" fill=\"#003366\">{System.Web.HttpUtility.HtmlEncode(title)}</text>");
            }

            // Legend for multiple series (only if showLegend is true)
            var legendSeries = series.Where(s => !string.IsNullOrEmpty(s.Legend)).ToList();
            if (showLegend && legendSeries.Count > 0)
            {
                // Calculate legend width based on longest text (approx 6.5px per character + 30px for line)
                var maxLegendLength = legendSeries.Max(s => s.Legend?.Length ?? 0);
                var legendWidth = Math.Max(105, maxLegendLength * 7 + 35);

                var legendX = margin + plotWidth - legendWidth + 5;
                var legendY = marginTop + 15;
                var legendHeight = legendSeries.Count * 18 + 8;

                sb.Append($"<rect x=\"{legendX - 5}\" y=\"{legendY - 12}\" width=\"{legendWidth}\" height=\"{legendHeight}\" fill=\"white\" fill-opacity=\"0.9\" stroke=\"#ccc\" rx=\"3\"/>");

                for (int i = 0; i < legendSeries.Count; i++)
                {
                    var s = legendSeries[i];
                    var ly = legendY + i * 18;

                    // Legend line style
                    string dashArray = s.LineStyle switch
                    {
                        "dash" or "dashed" => "6,3",
                        "dot" or "dotted" => "2,2",
                        "dashdot" => "6,2,2,2",
                        _ => ""
                    };

                    sb.Append($"<line x1=\"{legendX}\" y1=\"{ly}\" x2=\"{legendX + 20}\" y2=\"{ly}\" stroke=\"{s.Color}\" stroke-width=\"{s.LineWidth:F1}\"");
                    if (!string.IsNullOrEmpty(dashArray))
                        sb.Append($" stroke-dasharray=\"{dashArray}\"");
                    sb.Append("/>");

                    if (s.Symbol != "none" && s.Symbol != "ninguno")
                    {
                        sb.Append(GenerateMarker(legendX + 10, ly, s.Symbol, s.SymbolSize, s.Color));
                    }

                    sb.Append($"<text x=\"{legendX + 25}\" y=\"{ly + 4}\" font-family=\"Times New Roman, serif\" font-size=\"11\" font-style=\"italic\" fill=\"{s.Color}\">{System.Web.HttpUtility.HtmlEncode(s.Legend)}</text>");
                }
            }

            sb.Append("</svg>");
            return sb.ToString();
        }

        /// <summary>
        /// Generate SVG for all annotations
        /// </summary>
        private string GenerateAnnotations(List<PlotAnnotation> annotations, int margin, int marginTop,
            int plotWidth, int plotHeight, double xmin, double xmax, double ymin, double ymax, double scaleX, double scaleY)
        {
            var sb = new StringBuilder();

            foreach (var ann in annotations)
            {
                // Convert data coordinates to pixel coordinates
                double px = margin + (ann.X - xmin) * scaleX;
                double py = marginTop + plotHeight - (ann.Y - ymin) * scaleY;
                double px2 = margin + (ann.X2 - xmin) * scaleX;
                double py2 = marginTop + plotHeight - (ann.Y2 - ymin) * scaleY;

                switch (ann.Type)
                {
                    case "text":
                        var fontStyle = ann.Italic ? "italic" : "normal";
                        var fontWeight = ann.Bold ? "bold" : "normal";
                        if (Math.Abs(ann.Rotation) > 0.01)
                        {
                            sb.Append($"<g transform=\"rotate({-ann.Rotation:F1}, {px:F1}, {py:F1})\">");
                            sb.Append($"<text x=\"{px:F1}\" y=\"{py:F1}\" text-anchor=\"{ann.Anchor}\" font-family=\"Times New Roman, serif\" font-size=\"{ann.FontSize}\" font-style=\"{fontStyle}\" font-weight=\"{fontWeight}\" fill=\"{ann.Color}\">{System.Web.HttpUtility.HtmlEncode(ann.Text)}</text>");
                            sb.Append("</g>");
                        }
                        else
                        {
                            sb.Append($"<text x=\"{px:F1}\" y=\"{py:F1}\" text-anchor=\"{ann.Anchor}\" font-family=\"Times New Roman, serif\" font-size=\"{ann.FontSize}\" font-style=\"{fontStyle}\" font-weight=\"{fontWeight}\" fill=\"{ann.Color}\">{System.Web.HttpUtility.HtmlEncode(ann.Text)}</text>");
                        }
                        break;

                    case "arrow":
                        sb.Append($"<line x1=\"{px:F1}\" y1=\"{py:F1}\" x2=\"{px2:F1}\" y2=\"{py2:F1}\" stroke=\"{ann.Color}\" stroke-width=\"{ann.StrokeWidth:F1}\" marker-end=\"url(#arrowhead-annotation)\"/>");
                        break;

                    case "line":
                        sb.Append($"<line x1=\"{px:F1}\" y1=\"{py:F1}\" x2=\"{px2:F1}\" y2=\"{py2:F1}\" stroke=\"{ann.Color}\" stroke-width=\"{ann.StrokeWidth:F1}\"/>");
                        break;

                    case "hline":
                        // Horizontal line at Y value across full width
                        sb.Append($"<line x1=\"{margin}\" y1=\"{py:F1}\" x2=\"{margin + plotWidth}\" y2=\"{py:F1}\" stroke=\"{ann.Color}\" stroke-width=\"{ann.StrokeWidth:F1}\" stroke-dasharray=\"5,3\"/>");
                        break;

                    case "vline":
                        // Vertical line at X value across full height
                        sb.Append($"<line x1=\"{px:F1}\" y1=\"{marginTop}\" x2=\"{px:F1}\" y2=\"{marginTop + plotHeight}\" stroke=\"{ann.Color}\" stroke-width=\"{ann.StrokeWidth:F1}\" stroke-dasharray=\"5,3\"/>");
                        break;

                    case "rect":
                        // Rectangle: X, Y is bottom-left corner; X2, Y2 are width and height in data units
                        var rectW = ann.X2 * scaleX;
                        var rectH = ann.Y2 * scaleY;
                        var rectY = py - rectH;  // SVG Y is at top
                        sb.Append($"<rect x=\"{px:F1}\" y=\"{rectY:F1}\" width=\"{rectW:F1}\" height=\"{rectH:F1}\" fill=\"{ann.Fill}\" stroke=\"{ann.Color}\" stroke-width=\"{ann.StrokeWidth:F1}\" fill-opacity=\"0.3\"/>");
                        break;

                    case "circle":
                        // Circle: X, Y is center; X2 is radius in data units (use average of X and Y scale)
                        var avgScale = (scaleX + scaleY) / 2;
                        var circleR = ann.X2 * avgScale;
                        sb.Append($"<circle cx=\"{px:F1}\" cy=\"{py:F1}\" r=\"{circleR:F1}\" fill=\"{ann.Fill}\" stroke=\"{ann.Color}\" stroke-width=\"{ann.StrokeWidth:F1}\" fill-opacity=\"0.3\"/>");
                        break;

                    case "projection":
                        // Projection lines from point to both axes (dashed)
                        var projAxisY = marginTop + plotHeight;  // X-axis
                        var projAxisX = margin;                   // Y-axis
                        // Horizontal line to Y-axis
                        sb.Append($"<line x1=\"{projAxisX}\" y1=\"{py:F1}\" x2=\"{px:F1}\" y2=\"{py:F1}\" stroke=\"{ann.Color}\" stroke-width=\"{ann.StrokeWidth:F1}\" stroke-dasharray=\"4,3\"/>");
                        // Vertical line to X-axis
                        sb.Append($"<line x1=\"{px:F1}\" y1=\"{py:F1}\" x2=\"{px:F1}\" y2=\"{projAxisY}\" stroke=\"{ann.Color}\" stroke-width=\"{ann.StrokeWidth:F1}\" stroke-dasharray=\"4,3\"/>");
                        break;

                    case "equation":
                        // Mathematical equation with proper formatting (subscripts, italics, etc.)
                        sb.Append(RenderEquationToSvg(ann.Text, px, py, ann.Color, ann.FontSize));
                        break;

                    case "xtick":
                        // Custom X-axis tick label
                        var xtickY = marginTop + plotHeight + 18;
                        sb.Append($"<text x=\"{px:F1}\" y=\"{xtickY}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"{ann.FontSize}\" font-style=\"italic\" fill=\"{ann.Color}\">{System.Web.HttpUtility.HtmlEncode(ann.Text)}</text>");
                        // Tick mark
                        sb.Append($"<line x1=\"{px:F1}\" y1=\"{marginTop + plotHeight}\" x2=\"{px:F1}\" y2=\"{marginTop + plotHeight + 5}\" stroke=\"{ann.Color}\" stroke-width=\"1\"/>");
                        break;

                    case "ytick":
                        // Custom Y-axis tick label - positioned to the LEFT of Y-axis
                        sb.Append($"<text x=\"{margin - 12}\" y=\"{py + 4:F1}\" text-anchor=\"end\" font-family=\"Times New Roman, serif\" font-size=\"{ann.FontSize}\" font-style=\"italic\" fill=\"{ann.Color}\">{System.Web.HttpUtility.HtmlEncode(ann.Text)}</text>");
                        // Tick mark - small horizontal line extending left from axis
                        sb.Append($"<line x1=\"{margin - 5}\" y1=\"{py:F1}\" x2=\"{margin}\" y2=\"{py:F1}\" stroke=\"{ann.Color}\" stroke-width=\"1\"/>");
                        break;

                    case "angle":
                        // Draw angle arc with label - Technical drawing style (angle dimension)
                        // Format: angle: x, y, startAngle, endAngle, radius, "label", color
                        // The arc represents the angle swept from startAngle to endAngle.
                        // Positive sweep (end > start) = counterclockwise in math = visually upward
                        // Negative sweep (end < start) = clockwise in math = visually downward

                        // Convert radius from data units to pixels
                        var angleRadiusPx = ann.Rotation * scaleX;
                        if (angleRadiusPx < 5) angleRadiusPx = 5;  // Minimum visible

                        // Get the two angles specified by user
                        var startAngleDeg = ann.X2;
                        var endAngleDeg = ann.Y2;

                        // Convert to radians for point calculation
                        var startAngleRad = startAngleDeg * Math.PI / 180.0;
                        var endAngleRad = endAngleDeg * Math.PI / 180.0;

                        // Arc points at radius distance from the vertex (px, py)
                        // In SVG, Y increases downward, so we subtract sin() to flip the Y coordinate
                        var arcStartX = px + angleRadiusPx * Math.Cos(startAngleRad);
                        var arcStartY = py - angleRadiusPx * Math.Sin(startAngleRad);
                        var arcEndX = px + angleRadiusPx * Math.Cos(endAngleRad);
                        var arcEndY = py - angleRadiusPx * Math.Sin(endAngleRad);

                        // Calculate angular difference (preserving sign for direction)
                        var angleDiff = endAngleDeg - startAngleDeg;

                        // The arc should represent the actual angle the user specified
                        // |angleDiff| is the size of the arc
                        // sign of angleDiff determines direction:
                        //   positive = counterclockwise in math (increasing angles)
                        //   negative = clockwise in math (decreasing angles)

                        // For SVG arc:
                        // - largeArc: 1 if |angle| > 180, 0 otherwise
                        // - sweepFlag: Controls arc direction (inverted due to SVG Y-axis)
                        //   * sweepFlag=0 for positive angles (arc curves inside the angle)
                        //   * sweepFlag=1 for negative angles (arc curves inside the angle)

                        int largeArc = Math.Abs(angleDiff) > 180 ? 1 : 0;
                        int sweepFlag = angleDiff >= 0 ? 0 : 1;

                        // Draw the arc
                        sb.Append($"<path d=\"M {arcStartX:F1},{arcStartY:F1} A {angleRadiusPx:F1},{angleRadiusPx:F1} 0 {largeArc},{sweepFlag} {arcEndX:F1},{arcEndY:F1}\" fill=\"none\" stroke=\"{ann.Color}\" stroke-width=\"1.5\"/>");

                        // Label at the midpoint of the arc
                        if (!string.IsNullOrEmpty(ann.Text))
                        {
                            // Midpoint is at the average of start and end angles
                            var midAngleDeg = (startAngleDeg + endAngleDeg) / 2.0;
                            var midAngleRad = midAngleDeg * Math.PI / 180.0;
                            // Label slightly outside the arc for readability
                            var labelRadius = angleRadiusPx + 15.0;
                            var labelX = px + labelRadius * Math.Cos(midAngleRad);
                            var labelY = py - labelRadius * Math.Sin(midAngleRad) + 4;
                            sb.Append($"<text x=\"{labelX:F1}\" y=\"{labelY:F1}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"{ann.FontSize + 2}\" font-style=\"italic\" fill=\"{ann.Color}\">{System.Web.HttpUtility.HtmlEncode(ann.Text)}</text>");
                        }
                        break;

                    case "brace":
                        // Draw brace/bracket between two points with label
                        // Determine orientation based on points
                        var braceIsHorizontal = Math.Abs(ann.Y - ann.Y2) < Math.Abs(ann.X - ann.X2);
                        var midX = (px + px2) / 2;
                        var midY = (py + py2) / 2;
                        var braceOffset = 15;

                        if (braceIsHorizontal)
                        {
                            // Horizontal brace (for Δx)
                            var braceY = ann.Anchor == "above" || ann.Anchor == "top" ? Math.Min(py, py2) - braceOffset : Math.Max(py, py2) + braceOffset;
                            // Draw brace shape using path
                            var leftX = Math.Min(px, px2);
                            var rightX = Math.Max(px, px2);
                            var curveHeight = ann.Anchor == "above" || ann.Anchor == "top" ? -8 : 8;

                            // Simple brace: |_____|  with middle peak
                            sb.Append($"<path d=\"M {leftX:F1},{braceY - curveHeight:F1} L {leftX:F1},{braceY:F1} L {midX - 5:F1},{braceY:F1} L {midX:F1},{braceY + curveHeight:F1} L {midX + 5:F1},{braceY:F1} L {rightX:F1},{braceY:F1} L {rightX:F1},{braceY - curveHeight:F1}\" fill=\"none\" stroke=\"{ann.Color}\" stroke-width=\"1\"/>");

                            // Label
                            if (!string.IsNullOrEmpty(ann.Text))
                            {
                                var labelY2 = braceY + curveHeight * 2;
                                sb.Append($"<text x=\"{midX:F1}\" y=\"{labelY2:F1}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"{ann.FontSize}\" font-style=\"italic\" fill=\"{ann.Color}\">{System.Web.HttpUtility.HtmlEncode(ann.Text)}</text>");
                            }
                        }
                        else
                        {
                            // Vertical brace (for Δy)
                            var braceX = ann.Anchor == "left" || ann.Anchor == "izquierda" ? Math.Min(px, px2) - braceOffset : Math.Max(px, px2) + braceOffset;
                            var topY = Math.Min(py, py2);
                            var bottomY = Math.Max(py, py2);
                            var curveWidth = ann.Anchor == "left" || ann.Anchor == "izquierda" ? -8 : 8;

                            // Vertical brace
                            sb.Append($"<path d=\"M {braceX - curveWidth:F1},{topY:F1} L {braceX:F1},{topY:F1} L {braceX:F1},{midY - 5:F1} L {braceX + curveWidth:F1},{midY:F1} L {braceX:F1},{midY + 5:F1} L {braceX:F1},{bottomY:F1} L {braceX - curveWidth:F1},{bottomY:F1}\" fill=\"none\" stroke=\"{ann.Color}\" stroke-width=\"1\"/>");

                            // Label
                            if (!string.IsNullOrEmpty(ann.Text))
                            {
                                var labelX2 = braceX + curveWidth * 2;
                                sb.Append($"<text x=\"{labelX2:F1}\" y=\"{midY + 4:F1}\" text-anchor=\"{(ann.Anchor == "left" ? "end" : "start")}\" font-family=\"Times New Roman, serif\" font-size=\"{ann.FontSize}\" font-style=\"italic\" fill=\"{ann.Color}\">{System.Web.HttpUtility.HtmlEncode(ann.Text)}</text>");
                            }
                        }
                        break;

                    case "point":
                        // Draw point/dot at coordinates
                        var pointRadius = ann.X2;
                        if (ann.Fill == "filled")
                        {
                            sb.Append($"<circle cx=\"{px:F1}\" cy=\"{py:F1}\" r=\"{pointRadius:F1}\" fill=\"{ann.Color}\" stroke=\"none\"/>");
                        }
                        else
                        {
                            sb.Append($"<circle cx=\"{px:F1}\" cy=\"{py:F1}\" r=\"{pointRadius:F1}\" fill=\"white\" stroke=\"{ann.Color}\" stroke-width=\"1.5\"/>");
                        }
                        break;

                    case "dimension":
                        // Draw dimension line with double arrows at both ends (like technical drawings)
                        var dimX2 = margin + (ann.X2 - xmin) * scaleX;
                        var dimY2 = marginTop + plotHeight - (ann.Y2 - ymin) * scaleY;
                        var dimColor = string.IsNullOrEmpty(ann.Color) ? "#333333" : ann.Color;
                        var dimStroke = ann.FontSize > 0 ? 1.5 : 1.2;

                        // Determine if horizontal or vertical dimension
                        var isHorizontal = Math.Abs(dimY2 - py) < Math.Abs(dimX2 - px);

                        // Draw the dimension line with arrow markers
                        sb.Append($"<line x1=\"{px:F1}\" y1=\"{py:F1}\" x2=\"{dimX2:F1}\" y2=\"{dimY2:F1}\" stroke=\"{dimColor}\" stroke-width=\"{dimStroke:F1}\" marker-start=\"url(#arrowhead-start)\" marker-end=\"url(#arrowhead-end)\"/>");

                        // Draw extension lines (small perpendicular lines at the ends)
                        var extLen = 8.0;
                        if (isHorizontal)
                        {
                            // Vertical extension lines
                            sb.Append($"<line x1=\"{px:F1}\" y1=\"{py - extLen:F1}\" x2=\"{px:F1}\" y2=\"{py + extLen:F1}\" stroke=\"{dimColor}\" stroke-width=\"1\"/>");
                            sb.Append($"<line x1=\"{dimX2:F1}\" y1=\"{dimY2 - extLen:F1}\" x2=\"{dimX2:F1}\" y2=\"{dimY2 + extLen:F1}\" stroke=\"{dimColor}\" stroke-width=\"1\"/>");
                        }
                        else
                        {
                            // Horizontal extension lines
                            sb.Append($"<line x1=\"{px - extLen:F1}\" y1=\"{py:F1}\" x2=\"{px + extLen:F1}\" y2=\"{py:F1}\" stroke=\"{dimColor}\" stroke-width=\"1\"/>");
                            sb.Append($"<line x1=\"{dimX2 - extLen:F1}\" y1=\"{dimY2:F1}\" x2=\"{dimX2 + extLen:F1}\" y2=\"{dimY2:F1}\" stroke=\"{dimColor}\" stroke-width=\"1\"/>");
                        }

                        // Draw label in the middle
                        if (!string.IsNullOrEmpty(ann.Text))
                        {
                            var labelMidX = (px + dimX2) / 2;
                            var labelMidY = (py + dimY2) / 2;
                            var labelOffset = 12.0;

                            if (isHorizontal)
                            {
                                // Label above or below horizontal line
                                labelMidY -= labelOffset;
                            }
                            else
                            {
                                // Label to the right of vertical line
                                labelMidX += labelOffset;
                            }

                            sb.Append($"<text x=\"{labelMidX:F1}\" y=\"{labelMidY:F1}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"{(ann.FontSize > 0 ? ann.FontSize : 11)}\" font-style=\"italic\" fill=\"{dimColor}\">{System.Web.HttpUtility.HtmlEncode(ann.Text)}</text>");
                        }
                        break;
                }
            }

            return sb.ToString();
        }

        /// <summary>
        /// Generate SVG marker symbol at given coordinates
        /// </summary>
        private string GenerateMarker(double cx, double cy, string symbol, int size, string color)
        {
            var s = size / 2.0;
            var sb = new StringBuilder();

            switch (symbol.ToLower())
            {
                case "x":
                case "cross":
                    // X marker
                    sb.Append($"<line x1=\"{cx - s:F1}\" y1=\"{cy - s:F1}\" x2=\"{cx + s:F1}\" y2=\"{cy + s:F1}\" stroke=\"{color}\" stroke-width=\"2\"/>");
                    sb.Append($"<line x1=\"{cx + s:F1}\" y1=\"{cy - s:F1}\" x2=\"{cx - s:F1}\" y2=\"{cy + s:F1}\" stroke=\"{color}\" stroke-width=\"2\"/>");
                    break;

                case "+":
                case "plus":
                    // Plus marker
                    sb.Append($"<line x1=\"{cx}\" y1=\"{cy - s:F1}\" x2=\"{cx}\" y2=\"{cy + s:F1}\" stroke=\"{color}\" stroke-width=\"2\"/>");
                    sb.Append($"<line x1=\"{cx - s:F1}\" y1=\"{cy}\" x2=\"{cx + s:F1}\" y2=\"{cy}\" stroke=\"{color}\" stroke-width=\"2\"/>");
                    break;

                case "o":
                case "circle":
                case "circulo":
                    // Circle (outline)
                    sb.Append($"<circle cx=\"{cx:F1}\" cy=\"{cy:F1}\" r=\"{s:F1}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"1.5\"/>");
                    break;

                case ".":
                case "dot":
                case "punto":
                    // Filled circle (dot)
                    sb.Append($"<circle cx=\"{cx:F1}\" cy=\"{cy:F1}\" r=\"{s:F1}\" fill=\"{color}\" stroke=\"none\"/>");
                    break;

                case "s":
                case "square":
                case "cuadrado":
                    // Square (outline)
                    sb.Append($"<rect x=\"{cx - s:F1}\" y=\"{cy - s:F1}\" width=\"{size}\" height=\"{size}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"1.5\"/>");
                    break;

                case "sf":
                case "squarefilled":
                case "cuadradolleno":
                    // Filled square
                    sb.Append($"<rect x=\"{cx - s:F1}\" y=\"{cy - s:F1}\" width=\"{size}\" height=\"{size}\" fill=\"{color}\" stroke=\"none\"/>");
                    break;

                case "d":
                case "diamond":
                case "diamante":
                case "rombo":
                    // Diamond (outline)
                    sb.Append($"<polygon points=\"{cx},{cy - s:F1} {cx + s:F1},{cy} {cx},{cy + s:F1} {cx - s:F1},{cy}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"1.5\"/>");
                    break;

                case "df":
                case "diamondfilled":
                    // Filled diamond
                    sb.Append($"<polygon points=\"{cx},{cy - s:F1} {cx + s:F1},{cy} {cx},{cy + s:F1} {cx - s:F1},{cy}\" fill=\"{color}\" stroke=\"none\"/>");
                    break;

                case "^":
                case "t":
                case "triangle":
                case "triangulo":
                    // Triangle up (outline)
                    sb.Append($"<polygon points=\"{cx},{cy - s:F1} {cx + s:F1},{cy + s:F1} {cx - s:F1},{cy + s:F1}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"1.5\"/>");
                    break;

                case "tf":
                case "trianglefilled":
                    // Filled triangle
                    sb.Append($"<polygon points=\"{cx},{cy - s:F1} {cx + s:F1},{cy + s:F1} {cx - s:F1},{cy + s:F1}\" fill=\"{color}\" stroke=\"none\"/>");
                    break;

                case "v":
                case "triangledown":
                    // Triangle down (outline)
                    sb.Append($"<polygon points=\"{cx},{cy + s:F1} {cx + s:F1},{cy - s:F1} {cx - s:F1},{cy - s:F1}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"1.5\"/>");
                    break;

                case "*":
                case "star":
                case "estrella":
                    // Star (5 points)
                    var outerR = s;
                    var innerR = s * 0.4;
                    var starPoints = new StringBuilder();
                    for (int i = 0; i < 10; i++)
                    {
                        var r = (i % 2 == 0) ? outerR : innerR;
                        var angle = Math.PI / 2 + i * Math.PI / 5;
                        var sx = cx + r * Math.Cos(angle);
                        var sy = cy - r * Math.Sin(angle);
                        starPoints.Append($"{sx:F1},{sy:F1} ");
                    }
                    sb.Append($"<polygon points=\"{starPoints}\" fill=\"{color}\" stroke=\"none\"/>");
                    break;

                case "starempty":
                case "estrellavacia":
                    // Star outline
                    var outerR2 = s;
                    var innerR2 = s * 0.4;
                    var starPoints2 = new StringBuilder();
                    for (int i = 0; i < 10; i++)
                    {
                        var r = (i % 2 == 0) ? outerR2 : innerR2;
                        var angle = Math.PI / 2 + i * Math.PI / 5;
                        var sx = cx + r * Math.Cos(angle);
                        var sy = cy - r * Math.Sin(angle);
                        starPoints2.Append($"{sx:F1},{sy:F1} ");
                    }
                    sb.Append($"<polygon points=\"{starPoints2}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"1.5\"/>");
                    break;

                default:
                    // Default: filled circle
                    if (symbol != "none" && symbol != "ninguno")
                        sb.Append($"<circle cx=\"{cx:F1}\" cy=\"{cy:F1}\" r=\"{s:F1}\" fill=\"{color}\" stroke=\"none\"/>");
                    break;
            }

            return sb.ToString();
        }

        /// <summary>
        /// Generate smooth SVG path using Catmull-Rom spline converted to cubic Bezier curves
        /// This creates visually smooth curves passing through all data points
        /// </summary>
        private string GenerateSmoothPath(List<(double px, double py)> points, double tension = 0.3)
        {
            if (points.Count < 2) return "";

            var sb = new StringBuilder();

            // Start at first point
            sb.Append($"M {points[0].px:F2},{points[0].py:F2}");

            if (points.Count == 2)
            {
                // Just draw a line for 2 points
                sb.Append($" L {points[1].px:F2},{points[1].py:F2}");
                return sb.ToString();
            }

            // Use Catmull-Rom to Bezier conversion for smooth curves
            // tension parameter: 0 = straight lines, 1 = very curved
            double t = 1 - tension; // Invert so higher tension = smoother curves

            for (int i = 0; i < points.Count - 1; i++)
            {
                // Get 4 points for Catmull-Rom: P0, P1 (current), P2 (next), P3
                var p0 = i > 0 ? points[i - 1] : points[i];
                var p1 = points[i];
                var p2 = points[i + 1];
                var p3 = i < points.Count - 2 ? points[i + 2] : points[i + 1];

                // Convert Catmull-Rom to Bezier control points
                // CP1 = P1 + (P2 - P0) / (6 * t)
                // CP2 = P2 - (P3 - P1) / (6 * t)
                double scale = 6.0 * Math.Max(0.1, t);

                double cp1x = p1.px + (p2.px - p0.px) / scale;
                double cp1y = p1.py + (p2.py - p0.py) / scale;

                double cp2x = p2.px - (p3.px - p1.px) / scale;
                double cp2y = p2.py - (p3.py - p1.py) / scale;

                // Cubic Bezier curve to next point
                sb.Append($" C {cp1x:F2},{cp1y:F2} {cp2x:F2},{cp2y:F2} {p2.px:F2},{p2.py:F2}");
            }

            return sb.ToString();
        }

        /// <summary>
        /// Generate simple subtle grid for white background plots
        /// </summary>
        private string GenerateSimpleGrid(int margin, int marginTop, int plotWidth, int plotHeight,
            double xmin, double xmax, double ymin, double ymax, double scaleX, double scaleY)
        {
            var sb = new StringBuilder();

            // Calculate tick intervals
            var xTicks = CalculateTicks(xmin, xmax, 8);
            var yTicks = CalculateTicks(ymin, ymax, 8);

            // Subtle gray grid lines
            foreach (var tick in xTicks)
            {
                var px = margin + (tick - xmin) * scaleX;
                if (px >= margin && px <= margin + plotWidth)
                {
                    sb.Append($"<line x1=\"{px:F1}\" y1=\"{marginTop}\" x2=\"{px:F1}\" y2=\"{marginTop + plotHeight}\" stroke=\"#e0e0e0\" stroke-width=\"0.5\"/>");
                    sb.Append($"<line x1=\"{px:F1}\" y1=\"{marginTop + plotHeight}\" x2=\"{px:F1}\" y2=\"{marginTop + plotHeight + 5}\" stroke=\"#333\" stroke-width=\"1\"/>");
                    sb.Append($"<text x=\"{px:F1}\" y=\"{marginTop + plotHeight + 18}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"11\" fill=\"#333\">{FormatTickLabel(tick)}</text>");
                }
            }

            foreach (var tick in yTicks)
            {
                var py = marginTop + plotHeight - (tick - ymin) * scaleY;
                if (py >= marginTop && py <= marginTop + plotHeight)
                {
                    sb.Append($"<line x1=\"{margin}\" y1=\"{py:F1}\" x2=\"{margin + plotWidth}\" y2=\"{py:F1}\" stroke=\"#e0e0e0\" stroke-width=\"0.5\"/>");
                    sb.Append($"<line x1=\"{margin - 5}\" y1=\"{py:F1}\" x2=\"{margin}\" y2=\"{py:F1}\" stroke=\"#333\" stroke-width=\"1\"/>");
                    sb.Append($"<text x=\"{margin - 8}\" y=\"{py + 4:F1}\" text-anchor=\"end\" font-family=\"Times New Roman, serif\" font-size=\"11\" fill=\"#333\">{FormatTickLabel(tick)}</text>");
                }
            }

            return sb.ToString();
        }

        /// <summary>
        /// Generate SVG grid with Mathcad Prime / graph paper style
        /// </summary>
        private string GenerateMathcadGrid(int margin, int marginTop, int plotWidth, int plotHeight,
            double xmin, double xmax, double ymin, double ymax, double scaleX, double scaleY)
        {
            var sb = new StringBuilder();

            // Calculate nice tick intervals for major grid
            var xTicks = CalculateTicks(xmin, xmax, 8);
            var yTicks = CalculateTicks(ymin, ymax, 8);

            // Calculate minor grid spacing (5 subdivisions)
            double xMajorInterval = xTicks.Length > 1 ? xTicks[1] - xTicks[0] : (xmax - xmin) / 5;
            double yMajorInterval = yTicks.Length > 1 ? yTicks[1] - yTicks[0] : (ymax - ymin) / 5;
            double xMinorInterval = xMajorInterval / 5;
            double yMinorInterval = yMajorInterval / 5;

            // Minor grid lines (thin, light blue - paper milimetrado)
            for (double x = Math.Floor(xmin / xMinorInterval) * xMinorInterval; x <= xmax; x += xMinorInterval)
            {
                var px = margin + (x - xmin) * scaleX;
                if (px >= margin && px <= margin + plotWidth)
                {
                    sb.Append($"<line x1=\"{px:F1}\" y1=\"{marginTop}\" x2=\"{px:F1}\" y2=\"{marginTop + plotHeight}\" stroke=\"#cce0ff\" stroke-width=\"0.5\"/>");
                }
            }
            for (double y = Math.Floor(ymin / yMinorInterval) * yMinorInterval; y <= ymax; y += yMinorInterval)
            {
                var py = marginTop + plotHeight - (y - ymin) * scaleY;
                if (py >= marginTop && py <= marginTop + plotHeight)
                {
                    sb.Append($"<line x1=\"{margin}\" y1=\"{py:F1}\" x2=\"{margin + plotWidth}\" y2=\"{py:F1}\" stroke=\"#cce0ff\" stroke-width=\"0.5\"/>");
                }
            }

            // Major grid lines (thicker, darker blue)
            foreach (var tick in xTicks)
            {
                var px = margin + (tick - xmin) * scaleX;
                if (px >= margin && px <= margin + plotWidth)
                {
                    sb.Append($"<line x1=\"{px:F1}\" y1=\"{marginTop}\" x2=\"{px:F1}\" y2=\"{marginTop + plotHeight}\" stroke=\"#99c2ff\" stroke-width=\"1\"/>");
                    // Tick mark on axis
                    sb.Append($"<line x1=\"{px:F1}\" y1=\"{marginTop + plotHeight}\" x2=\"{px:F1}\" y2=\"{marginTop + plotHeight + 5}\" stroke=\"#333\" stroke-width=\"1\"/>");
                    // Tick label
                    sb.Append($"<text x=\"{px:F1}\" y=\"{marginTop + plotHeight + 18}\" text-anchor=\"middle\" font-family=\"Times New Roman, serif\" font-size=\"11\" fill=\"#333\">{FormatTickLabel(tick)}</text>");
                }
            }

            foreach (var tick in yTicks)
            {
                var py = marginTop + plotHeight - (tick - ymin) * scaleY;
                if (py >= marginTop && py <= marginTop + plotHeight)
                {
                    sb.Append($"<line x1=\"{margin}\" y1=\"{py:F1}\" x2=\"{margin + plotWidth}\" y2=\"{py:F1}\" stroke=\"#99c2ff\" stroke-width=\"1\"/>");
                    // Tick mark on axis
                    sb.Append($"<line x1=\"{margin - 5}\" y1=\"{py:F1}\" x2=\"{margin}\" y2=\"{py:F1}\" stroke=\"#333\" stroke-width=\"1\"/>");
                    // Tick label
                    sb.Append($"<text x=\"{margin - 8}\" y=\"{py + 4:F1}\" text-anchor=\"end\" font-family=\"Times New Roman, serif\" font-size=\"11\" fill=\"#333\">{FormatTickLabel(tick)}</text>");
                }
            }

            return sb.ToString();
        }

        /// <summary>
        /// Generate SVG grid lines and tick labels (legacy)
        /// </summary>
        private string GenerateGrid(int margin, int marginTop, int plotWidth, int plotHeight,
            double xmin, double xmax, double ymin, double ymax, double scaleX, double scaleY)
        {
            var sb = new StringBuilder();

            // Calculate nice tick intervals
            var xTicks = CalculateTicks(xmin, xmax, 6);
            var yTicks = CalculateTicks(ymin, ymax, 6);

            // Vertical grid lines and X tick labels
            foreach (var tick in xTicks)
            {
                var px = margin + (tick - xmin) * scaleX;
                if (px >= margin && px <= margin + plotWidth)
                {
                    sb.Append($"<line x1=\"{px:F1}\" y1=\"{marginTop}\" x2=\"{px:F1}\" y2=\"{marginTop + plotHeight}\" stroke=\"#ddd\" stroke-width=\"1\"/>");
                    sb.Append($"<text x=\"{px:F1}\" y=\"{marginTop + plotHeight + 15}\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"10\">{FormatTickLabel(tick)}</text>");
                }
            }

            // Horizontal grid lines and Y tick labels
            foreach (var tick in yTicks)
            {
                var py = marginTop + plotHeight - (tick - ymin) * scaleY;
                if (py >= marginTop && py <= marginTop + plotHeight)
                {
                    sb.Append($"<line x1=\"{margin}\" y1=\"{py:F1}\" x2=\"{margin + plotWidth}\" y2=\"{py:F1}\" stroke=\"#ddd\" stroke-width=\"1\"/>");
                    sb.Append($"<text x=\"{margin - 5}\" y=\"{py + 4:F1}\" text-anchor=\"end\" font-family=\"Arial\" font-size=\"10\">{FormatTickLabel(tick)}</text>");
                }
            }

            return sb.ToString();
        }

        /// <summary>
        /// Calculate nice tick values for axis
        /// </summary>
        private double[] CalculateTicks(double min, double max, int targetCount)
        {
            var range = max - min;
            var rawInterval = range / targetCount;

            // Find nice interval (1, 2, 5 or 10 times a power of 10)
            var magnitude = Math.Pow(10, Math.Floor(Math.Log10(rawInterval)));
            var normalized = rawInterval / magnitude;

            double niceInterval;
            if (normalized <= 1.5) niceInterval = magnitude;
            else if (normalized <= 3) niceInterval = 2 * magnitude;
            else if (normalized <= 7) niceInterval = 5 * magnitude;
            else niceInterval = 10 * magnitude;

            // Generate ticks
            var result = new List<double>();
            var start = Math.Ceiling(min / niceInterval) * niceInterval;
            for (var t = start; t <= max; t += niceInterval)
            {
                result.Add(t);
            }
            return result.ToArray();
        }

        /// <summary>
        /// Format tick label
        /// </summary>
        private string FormatTickLabel(double value)
        {
            if (Math.Abs(value) < 1e-10) return "0";
            if (Math.Abs(value) >= 1e4 || (Math.Abs(value) < 1e-2 && Math.Abs(value) > 0))
                return value.ToString("0.##E+0", System.Globalization.CultureInfo.InvariantCulture);
            return value.ToString("G4", System.Globalization.CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Export table to file (CSV or XLSX)
        /// </summary>
        private void ExportTableToFile(double[,] matrix, string[] headers, string[] rowHeaders, string filename)
        {
            var ext = System.IO.Path.GetExtension(filename).ToLower();
            var rows = matrix.GetLength(0);
            var cols = matrix.GetLength(1);

            if (ext == ".csv")
            {
                var sb = new StringBuilder();

                // Headers
                if (headers != null)
                {
                    if (rowHeaders != null) sb.Append(",");
                    sb.AppendLine(string.Join(",", headers.Select(h => $"\"{h}\"")));
                }

                // Data
                for (int i = 0; i < rows; i++)
                {
                    if (rowHeaders != null && i < rowHeaders.Length)
                        sb.Append($"\"{rowHeaders[i]}\",");

                    for (int j = 0; j < cols; j++)
                    {
                        if (j > 0) sb.Append(",");
                        sb.Append(matrix[i, j].ToString(System.Globalization.CultureInfo.InvariantCulture));
                    }
                    sb.AppendLine();
                }

                System.IO.File.WriteAllText(filename, sb.ToString());
            }
            else if (ext == ".xlsx")
            {
                // For xlsx, create a simple OpenXML file (requires OpenXML SDK which is already referenced)
                // For now, fallback to CSV with xlsx extension info
                var csvFile = System.IO.Path.ChangeExtension(filename, ".csv");
                ExportTableToFile(matrix, headers, rowHeaders, csvFile);
                throw new Exception($"XLSX export no implementado, se guardó como CSV: {csvFile}");
            }
            else
            {
                throw new Exception($"Formato no soportado: {ext}. Use .csv o .xlsx");
            }
        }

        /// <summary>
        /// Process @{columns N} block - generates multi-column HTML layout
        /// Syntax:
        ///   @{columns N}
        ///   content for column 1
        ///   @{column}
        ///   content for column 2
        ///   @{column}
        ///   content for column 3
        ///   @{end columns}
        /// </summary>
        public string ProcessColumnsBlockPublic(string directive, string content, Dictionary<string, object> variables, Action<string>? progressCallback)
        {
            return ProcessColumnsBlock(directive, content, variables, progressCallback);
        }

        /// <summary>
        /// Process @{integral} block - convenience for numeric integrals
        /// Syntax:
        ///   @{integral}
        ///   result = integrate(sin(x), x, 0, pi)
        ///   area = dintegrate(x*y, x, 0, 1, y, 0, 1)
        ///   vol = tintegrate(1, x, 0, 1, y, 0, 1, z, 0, 1)
        ///   @{end integral}
        /// Translates to Hekatan $int/$dint/$tint solver syntax and evaluates.
        /// </summary>
        private string ProcessIntegralBlock(string content, Dictionary<string, object> variables)
        {
            return ProcessMathConvenienceBlock(content, variables, "integral",
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    // integrate(f, var, start, end) → $int{f @ var = start : end}
                    { "integrate", "$int" },
                    { "integral", "$int" },
                    { "int", "$int" },
                    // dintegrate(f, x, a, b, y, c, d) → $dint{f @ x = a : b @ y = c : d}
                    { "dintegrate", "$dint" },
                    { "double_integral", "$dint" },
                    { "dint", "$dint" },
                    // tintegrate(f, x, a, b, y, c, d, z, e, f2) → $tint{f @ x = a : b @ y = c : d @ z = e : f2}
                    { "tintegrate", "$tint" },
                    { "triple_integral", "$tint" },
                    { "tint", "$tint" },
                });
        }

        /// <summary>
        /// Process @{derivate} block - convenience for numeric derivatives
        /// Syntax:
        ///   @{derivate}
        ///   slope = derivate(x^3 + 2*x, x, 1)
        ///   accel = derivate2(sin(t), t, pi/4)
        ///   @{end derivate}
        /// Translates to Hekatan $deriv solver syntax and evaluates.
        /// </summary>
        private string ProcessDerivateBlock(string content, Dictionary<string, object> variables)
        {
            return ProcessMathConvenienceBlock(content, variables, "derivate",
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    // derivate(f, var, point) → $deriv{f @ var = point}
                    { "derivate", "$deriv" },
                    { "derivative", "$deriv" },
                    { "diff", "$diff" },
                    { "deriv", "$deriv" },
                    // derivate2 → second derivative (uses $derivative{...})
                    { "derivate2", "$derivative" },
                    { "derivative2", "$derivative" },
                    // slope
                    { "slope", "$slope" },
                    { "pendiente", "$slope" },
                });
        }

        /// <summary>
        /// Process @{gauss} block - convenience for Gauss quadrature
        /// Syntax:
        ///   @{gauss}
        ///   result = gauss(f(xi), xi, 2)
        ///   area = gauss2d(f(xi,eta), xi, 2, eta, 2)
        ///   vol = gauss3d(f(xi,eta,zeta), xi, 2, eta, 2, zeta, 2)
        ///   @{end gauss}
        /// Translates to Hekatan $gauss/$gauss2d/$gauss3d solver syntax and evaluates.
        /// </summary>
        private string ProcessGaussBlock(string content, Dictionary<string, object> variables)
        {
            return ProcessMathConvenienceBlock(content, variables, "gauss",
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    // gauss(f, var, order) → $gauss{f @ var = order}
                    { "gauss", "$gauss" },
                    { "gauss1d", "$gauss" },
                    // gauss2d(f, var1, n1, var2, n2) → $gauss2d{f @ var1 = n1 @ var2 = n2}
                    { "gauss2d", "$gauss2d" },
                    // gauss3d(f, var1, n1, var2, n2, var3, n3) → $gauss3d{f @ var1=n1 @ var2=n2 @ var3=n3}
                    { "gauss3d", "$gauss3d" },
                });
        }

        /// <summary>
        /// Process @{function} block - define functions with Octave/MATLAB syntax
        /// Syntax A (Octave multi-line):
        ///   @{function}
        ///   function y = cuadrado(x)
        ///     y = x^2
        ///   end
        ///   @{end function}
        /// Syntax B (simplified one-liner):
        ///   @{function}
        ///   cuadrado(x) = x^2
        ///   @{end function}
        /// Functions are registered and available for @{plot}, @{integral}, etc.
        /// </summary>
        private string ProcessFunctionBlock(string content, Dictionary<string, object> variables)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return "<p style='color:red;'>Error: Bloque @{function} vac\u00edo</p>";

                var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.None);
                var sb = new StringBuilder();
                sb.Append("<div class=\"math-func-block\" style=\"margin: 10px 0; padding: 10px 15px; " +
                          "background: #f0f8ff; border-left: 4px solid #228B22; border-radius: 4px; " +
                          "font-family: 'Times New Roman', serif;\">");
                sb.Append("<div style=\"font-size: 11px; color: #888; margin-bottom: 6px;\">@{function}</div>");

                // Create MathParser instance
                var settings = new Hekatan.Core.MathSettings
                {
                    Decimals = 6,
                    Degrees = 1, // radians
                    FormatEquations = false,
                    Substitute = false,
                };
                var parser = new Hekatan.Core.MathParser(settings);
                parser.IsEnabled = true;
                parser.IsCalculation = true;

                // Inject existing variables
                foreach (var kv in variables)
                {
                    if (kv.Value is double d)
                    {
                        try
                        {
                            parser.Parse($"{kv.Key} = {d.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
                            parser.Calculate(false);
                        }
                        catch { }
                    }
                }

                // Inject previously defined functions
                if (variables.TryGetValue("__function_definitions__", out var prevDefsObj) &&
                    prevDefsObj is List<string> prevDefs)
                {
                    foreach (var def in prevDefs)
                    {
                        try { parser.Parse(def); parser.Calculate(false); } catch { }
                    }
                }

                // Initialize function definitions list
                if (!variables.ContainsKey("__function_definitions__"))
                    variables["__function_definitions__"] = new List<string>();
                var funcDefs = (List<string>)variables["__function_definitions__"];

                // Parse all function definitions
                int lineIdx = 0;
                while (lineIdx < lines.Length)
                {
                    var line = lines[lineIdx].Trim();
                    lineIdx++;

                    // Skip empty lines and comments
                    if (string.IsNullOrEmpty(line) || line.StartsWith("'") || line.StartsWith("%") ||
                        line.StartsWith("#") || line.StartsWith("//"))
                        continue;

                    // Octave syntax: function retVar = funcName(params...)
                    var octaveMatch = System.Text.RegularExpressions.Regex.Match(line,
                        @"^\s*function\s+(\w+)\s*=\s*(\w+)\s*\(([^)]*)\)\s*$",
                        System.Text.RegularExpressions.RegexOptions.IgnoreCase);

                    if (octaveMatch.Success)
                    {
                        var returnVar = octaveMatch.Groups[1].Value.Trim();
                        var funcName = octaveMatch.Groups[2].Value.Trim();
                        var paramsStr = octaveMatch.Groups[3].Value.Trim();
                        var paramNames = paramsStr.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                                                  .Select(p => p.Trim()).ToList();

                        // Collect body lines until "end"
                        var bodyLines = new List<(string varName, string expr)>();
                        while (lineIdx < lines.Length)
                        {
                            var bodyLine = lines[lineIdx].Trim();
                            lineIdx++;
                            if (bodyLine.Equals("end", StringComparison.OrdinalIgnoreCase) ||
                                bodyLine.Equals("endfunction", StringComparison.OrdinalIgnoreCase))
                                break;
                            if (string.IsNullOrEmpty(bodyLine) || bodyLine.StartsWith("%") ||
                                bodyLine.StartsWith("#") || bodyLine.StartsWith("//") || bodyLine.StartsWith("'"))
                                continue;

                            // Strip trailing semicolon (Octave output suppression)
                            if (bodyLine.EndsWith(";"))
                                bodyLine = bodyLine.TrimEnd(';').TrimEnd();

                            // Parse assignment: varName = expression
                            var assignMatch = System.Text.RegularExpressions.Regex.Match(bodyLine,
                                @"^(\w+)\s*=\s*(.+)$");
                            if (assignMatch.Success)
                            {
                                bodyLines.Add((assignMatch.Groups[1].Value.Trim(), assignMatch.Groups[2].Value.Trim()));
                            }
                        }

                        // Flatten intermediate variables into return expression
                        var intermediates = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        string returnExpr = null;

                        foreach (var (vName, expr) in bodyLines)
                        {
                            // Substitute previously known intermediates into this expression
                            var expandedExpr = expr;
                            foreach (var inter in intermediates.OrderByDescending(k => k.Key.Length))
                            {
                                expandedExpr = System.Text.RegularExpressions.Regex.Replace(
                                    expandedExpr,
                                    @"(?<![a-zA-Z\u03b1-\u03c9\u0391-\u03a9_])" +
                                    System.Text.RegularExpressions.Regex.Escape(inter.Key) +
                                    @"(?![a-zA-Z\u03b1-\u03c9\u0391-\u03a9_\d])",
                                    $"({inter.Value})");
                            }

                            if (vName.Equals(returnVar, StringComparison.OrdinalIgnoreCase))
                            {
                                returnExpr = expandedExpr;
                            }
                            else if (!paramNames.Any(p => p.Equals(vName, StringComparison.OrdinalIgnoreCase)))
                            {
                                intermediates[vName] = expandedExpr;
                            }
                        }

                        if (returnExpr == null)
                        {
                            sb.Append($"<div style=\"margin: 4px 0; color: red;\">Error: function '{funcName}' - variable de retorno '{returnVar}' no asignada</div>");
                            continue;
                        }

                        // Map multi-char params to single-char for MathParser
                        var (mappedParams, mappedExpr, displayParams) = MapParamsToSingleChar(paramNames, returnExpr);

                        // Build Hekatan definition
                        var calcpadDef = $"{funcName}({string.Join(";", mappedParams)}) = {mappedExpr}";

                        // Register in MathParser
                        try
                        {
                            parser.Parse(calcpadDef);
                            parser.Calculate(false);
                            funcDefs.Add(calcpadDef);

                            // HTML output: show original syntax
                            var displayExpr = returnExpr;
                            // Substitute back to show original param names
                            for (int pi = 0; pi < paramNames.Count; pi++)
                            {
                                if (paramNames[pi] != mappedParams[pi])
                                {
                                    displayExpr = System.Text.RegularExpressions.Regex.Replace(
                                        displayExpr,
                                        @"(?<![a-zA-Z\u03b1-\u03c9\u0391-\u03a9_])" +
                                        System.Text.RegularExpressions.Regex.Escape(mappedParams[pi]) +
                                        @"(?![a-zA-Z\u03b1-\u03c9\u0391-\u03a9_\d])",
                                        paramNames[pi]);
                                }
                            }
                            var htmlExpr = FormatMathExpression(displayExpr);
                            sb.Append($"<div style=\"margin: 6px 0; font-size: 15px;\">");
                            sb.Append($"<span style=\"font-weight: bold; color: #228B22;\">{System.Net.WebUtility.HtmlEncode(funcName)}</span>");
                            sb.Append($"({System.Net.WebUtility.HtmlEncode(string.Join(", ", displayParams))}) = {htmlExpr}");
                            sb.Append("</div>");
                        }
                        catch (Exception ex)
                        {
                            sb.Append($"<div style=\"margin: 4px 0; color: red;\">Error en '{funcName}': {System.Net.WebUtility.HtmlEncode(ex.Message)}</div>");
                        }

                        continue;
                    }

                    // One-liner syntax: funcName(params) = expression
                    var oneLinerMatch = System.Text.RegularExpressions.Regex.Match(line,
                        @"^(\w+)\s*\(([^)]*)\)\s*=\s*(.+)$");

                    if (oneLinerMatch.Success)
                    {
                        var funcName = oneLinerMatch.Groups[1].Value.Trim();
                        var paramsStr = oneLinerMatch.Groups[2].Value.Trim();
                        var expr = oneLinerMatch.Groups[3].Value.Trim();
                        var paramNames = paramsStr.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                                                  .Select(p => p.Trim()).ToList();

                        // Map multi-char params to single-char for MathParser
                        var (mappedParams, mappedExpr, displayParams) = MapParamsToSingleChar(paramNames, expr);

                        // Build Hekatan definition
                        var calcpadDef = $"{funcName}({string.Join(";", mappedParams)}) = {mappedExpr}";

                        try
                        {
                            parser.Parse(calcpadDef);
                            parser.Calculate(false);
                            funcDefs.Add(calcpadDef);

                            var htmlExpr = FormatMathExpression(expr);
                            sb.Append($"<div style=\"margin: 6px 0; font-size: 15px;\">");
                            sb.Append($"<span style=\"font-weight: bold; color: #228B22;\">{System.Net.WebUtility.HtmlEncode(funcName)}</span>");
                            sb.Append($"({System.Net.WebUtility.HtmlEncode(string.Join(", ", displayParams))}) = {htmlExpr}");
                            sb.Append("</div>");
                        }
                        catch (Exception ex)
                        {
                            sb.Append($"<div style=\"margin: 4px 0; color: red;\">Error en '{funcName}': {System.Net.WebUtility.HtmlEncode(ex.Message)}</div>");
                        }

                        continue;
                    }

                    // Unknown line - show as comment
                    if (!string.IsNullOrWhiteSpace(line))
                    {
                        sb.Append($"<div style=\"color: #666; font-style: italic; margin: 4px 0;\">{System.Net.WebUtility.HtmlEncode(line)}</div>");
                    }
                }

                sb.Append("</div>");
                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<div style='color: red;'>Error en @{{function}}: {System.Net.WebUtility.HtmlEncode(ex.Message)}</div>";
            }
        }

        /// <summary>
        /// Map multi-character parameter names to single-character names for MathParser.
        /// MathParser only supports single-char variables (a-z, A-Z, Greek letters).
        /// Returns (mappedParams, mappedExpression, displayParams).
        /// </summary>
        private static (List<string> mappedParams, string mappedExpr, List<string> displayParams)
            MapParamsToSingleChar(List<string> paramNames, string expression)
        {
            var mapped = new List<string>();
            var display = new List<string>();
            var usedChars = new HashSet<string>(paramNames.Where(p => p.Length == 1), StringComparer.OrdinalIgnoreCase);
            var mappedExpr = expression;

            // Reserved chars: MathParser built-in single-char functions/constants
            var reserved = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { "e" }; // Euler's number

            // Build substitutions sorted by name length descending
            var substitutions = new List<(string original, string mapped)>();

            foreach (var param in paramNames)
            {
                if (param.Length == 1)
                {
                    // Already single-char, use as-is
                    mapped.Add(param);
                    display.Add(param);
                }
                else
                {
                    // Find a free single-char: try first char of name, then a-z, A-Z
                    string singleChar = null;
                    var firstChar = param.Substring(0, 1).ToLower();
                    if (!usedChars.Contains(firstChar) && !reserved.Contains(firstChar))
                    {
                        singleChar = firstChar;
                    }
                    else
                    {
                        // Try remaining lowercase letters
                        foreach (var c in "abcdfghijklmnopqrstuvwxyz")
                        {
                            var cs = c.ToString();
                            if (!usedChars.Contains(cs) && !reserved.Contains(cs))
                            {
                                singleChar = cs;
                                break;
                            }
                        }
                        // Try uppercase if all lowercase taken
                        if (singleChar == null)
                        {
                            foreach (var c in "ABCDFGHIJKLMNOPQRSTUVWXYZ")
                            {
                                var cs = c.ToString();
                                if (!usedChars.Contains(cs) && !reserved.Contains(cs))
                                {
                                    singleChar = cs;
                                    break;
                                }
                            }
                        }
                    }

                    if (singleChar == null) singleChar = param.Substring(0, 1); // fallback

                    usedChars.Add(singleChar);
                    mapped.Add(singleChar);
                    display.Add(param);
                    substitutions.Add((param, singleChar));
                }
            }

            // Apply substitutions to expression (longest first to avoid partial matches)
            substitutions.Sort((a, b) => b.original.Length.CompareTo(a.original.Length));
            foreach (var (original, sub) in substitutions)
            {
                mappedExpr = System.Text.RegularExpressions.Regex.Replace(
                    mappedExpr,
                    @"(?<![a-zA-Z\u03b1-\u03c9\u0391-\u03a9_])" +
                    System.Text.RegularExpressions.Regex.Escape(original) +
                    @"(?![a-zA-Z\u03b1-\u03c9\u0391-\u03a9_\d])",
                    sub);
            }

            return (mapped, mappedExpr, display);
        }

        /// <summary>
        /// Format a math expression for HTML display (basic superscripts, sqrt symbol, etc.)
        /// </summary>
        private static string FormatMathExpression(string expr)
        {
            var html = System.Net.WebUtility.HtmlEncode(expr);
            // ^2 → ²  ^3 → ³
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\^2(?!\d)", "\u00b2");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\^3(?!\d)", "\u00b3");
            // ^n → <sup>n</sup>
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\^(\w+)", "<sup>$1</sup>");
            html = System.Text.RegularExpressions.Regex.Replace(html, @"\^\(([^)]+)\)", "<sup>$1</sup>");
            // sqrt → √
            html = html.Replace("sqrt(", "\u221a(");
            // pi → π
            html = System.Text.RegularExpressions.Regex.Replace(html,
                @"(?<![a-zA-Z])pi(?![a-zA-Z])", "\u03c0");
            return html;
        }

        /// <summary>Public accessor for @{function} block from GlobalParser</summary>
        public string ProcessFunctionBlockPublic(string content, Dictionary<string, object> variables)
        {
            return ProcessFunctionBlock(content, variables);
        }

        /// <summary>
        /// Core method for processing @{integral}, @{derivate}, @{gauss} blocks.
        /// Parses convenience function syntax, translates to Hekatan $solver syntax,
        /// evaluates using MathParser, and generates formatted HTML.
        /// </summary>
        private string ProcessMathConvenienceBlock(string content, Dictionary<string, object> variables,
            string blockName, Dictionary<string, string> functionMap)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return $"<p style='color:red;'>Error: Bloque @{{{blockName}}} vac\u00edo</p>";

                var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                var sb = new StringBuilder();
                sb.Append($"<div class=\"math-conv-block\" style=\"margin: 10px 0; padding: 10px 15px; " +
                          $"background: #f8f9fa; border-left: 4px solid #4169E1; border-radius: 4px; " +
                          $"font-family: 'Times New Roman', serif;\">");
                sb.Append($"<div style=\"font-size: 11px; color: #888; margin-bottom: 6px;\">@{{{blockName}}}</div>");

                // Create MathParser instance for evaluation
                var settings = new Hekatan.Core.MathSettings
                {
                    Decimals = 6,
                    Degrees = 1, // 0=deg, 1=rad, 2=grad - use radians for math blocks
                    FormatEquations = false,
                    Substitute = false,
                };
                var parser = new Hekatan.Core.MathParser(settings);
                parser.IsEnabled = true;
                parser.IsCalculation = true;

                // Inject existing variables into the parser
                foreach (var kv in variables)
                {
                    if (kv.Value is double d)
                    {
                        try
                        {
                            parser.Parse($"{kv.Key} = {d.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
                            parser.Calculate(false);
                        }
                        catch { }
                    }
                }

                // Inject functions defined in @{function} blocks
                if (variables.TryGetValue("__function_definitions__", out var funcDefsObj) &&
                    funcDefsObj is List<string> funcDefs)
                {
                    foreach (var def in funcDefs)
                    {
                        try { parser.Parse(def); parser.Calculate(false); } catch { }
                    }
                }

                foreach (var rawLine in lines)
                {
                    var line = rawLine.Trim();
                    if (string.IsNullOrEmpty(line) || line.StartsWith("'") || line.StartsWith("#") || line.StartsWith("//"))
                    {
                        // Comment line - render as text
                        if (!string.IsNullOrEmpty(line) && (line.StartsWith("'") || line.StartsWith("#") || line.StartsWith("//")))
                        {
                            var commentText = line.TrimStart('\'', '#', '/').Trim();
                            sb.Append($"<div style=\"color: #666; font-style: italic; margin: 4px 0;\">{System.Net.WebUtility.HtmlEncode(commentText)}</div>");
                        }
                        continue;
                    }

                    // Translate convenience syntax to Hekatan solver syntax
                    var calcpadLine = TranslateConvenienceSyntax(line, functionMap);

                    // Evaluate the line
                    try
                    {
                        parser.Parse(calcpadLine);
                        parser.Calculate(true);

                        var resultStr = parser.ResultAsString;
                        var htmlEq = parser.ToHtmlResultOnly();

                        // Extract variable name if assignment
                        string varName = null;
                        var eqIdx = line.IndexOf('=');
                        if (eqIdx > 0)
                        {
                            varName = line.Substring(0, eqIdx).Trim();
                            // Store result in variables for sharing
                            if (double.TryParse(resultStr, System.Globalization.NumberStyles.Any,
                                System.Globalization.CultureInfo.InvariantCulture, out var val))
                            {
                                variables[varName] = val;
                            }
                        }

                        // Render: original expression → HTML result
                        var displayExpr = FormatConvenienceExpression(line, functionMap);
                        sb.Append($"<div style=\"margin: 6px 0; font-size: 15px;\">");
                        sb.Append($"<span style=\"color: #333;\">{displayExpr}</span>");
                        sb.Append($" <span style=\"color: #4169E1; font-weight: bold;\">= {System.Net.WebUtility.HtmlEncode(resultStr)}</span>");
                        sb.Append($"</div>");
                    }
                    catch (Exception ex)
                    {
                        sb.Append($"<div style=\"margin: 4px 0; color: red;\">Error en '{System.Net.WebUtility.HtmlEncode(line)}': {System.Net.WebUtility.HtmlEncode(ex.Message)}</div>");
                    }
                }

                sb.Append("</div>");
                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<div style='color: red;'>Error en @{{{blockName}}}: {System.Net.WebUtility.HtmlEncode(ex.Message)}</div>";
            }
        }

        /// <summary>
        /// Translate convenience function syntax to Hekatan $solver syntax.
        /// Examples:
        ///   integrate(sin(x), x, 0, pi)  →  $int{sin(x) @ x = 0 : pi}
        ///   dintegrate(x*y, x, 0, 1, y, 0, 1)  →  $dint{x*y @ x = 0 : 1 @ y = 0 : 1}
        ///   derivate(x^3, x, 2)  →  $deriv{x^3 @ x = 2}
        ///   gauss(f(xi), xi, 4)  →  $gauss{f(xi) @ xi = 4}
        ///   gauss2d(f, xi, 2, eta, 2)  →  $gauss2d{f @ xi = 2 @ eta = 2}
        /// </summary>
        private string TranslateConvenienceSyntax(string line, Dictionary<string, string> functionMap)
        {
            // Check if line contains an assignment: varName = funcCall(...)
            var eqIdx = -1;
            var parenDepth = 0;
            for (int i = 0; i < line.Length; i++)
            {
                if (line[i] == '(') parenDepth++;
                else if (line[i] == ')') parenDepth--;
                else if (line[i] == '=' && parenDepth == 0 && i > 0 && line[i - 1] != '<' && line[i - 1] != '>' && line[i - 1] != '!')
                {
                    eqIdx = i;
                    break;
                }
            }

            string prefix = "";
            string expression = line;
            if (eqIdx > 0)
            {
                prefix = line.Substring(0, eqIdx + 1).Trim() + " ";
                expression = line.Substring(eqIdx + 1).Trim();
            }

            // Try to match a known function call
            foreach (var kv in functionMap)
            {
                var funcName = kv.Key;
                var solverName = kv.Value;

                // Check for funcName( at the start of expression
                if (expression.StartsWith(funcName + "(", StringComparison.OrdinalIgnoreCase) ||
                    expression.StartsWith(funcName + " (", StringComparison.OrdinalIgnoreCase))
                {
                    // Find the matching closing parenthesis
                    var openIdx = expression.IndexOf('(');
                    var closeIdx = FindMatchingParenForConvenience(expression, openIdx);
                    if (closeIdx < 0) closeIdx = expression.Length - 1;

                    var argsStr = expression.Substring(openIdx + 1, closeIdx - openIdx - 1);

                    // Split args carefully (respecting nested parentheses)
                    var args = SplitFunctionArgs(argsStr);

                    // Build solver syntax based on solver type
                    string solverExpr = BuildSolverExpression(solverName, args);
                    return prefix + solverExpr;
                }
            }

            // No matching function found - return line as-is (plain Hekatan expression)
            return line;
        }

        /// <summary>
        /// Build the solver expression from function name and arguments.
        /// </summary>
        private string BuildSolverExpression(string solverName, List<string> args)
        {
            if (solverName == "$int" || solverName == "$integral")
            {
                // integrate(f, var, start, end) → $int{f @ var = start : end}
                if (args.Count >= 4)
                    return $"{solverName}{{{args[0]} @ {args[1]} = {args[2]} : {args[3]}}}";
                if (args.Count >= 2)
                    return $"{solverName}{{{args[0]} @ {args[1]} = 0 : 1}}";
            }
            else if (solverName == "$dint" || solverName == "$double_integral")
            {
                // dintegrate(f, x, a, b, y, c, d) → $dint{f @ x = a : b @ y = c : d}
                if (args.Count >= 7)
                    return $"{solverName}{{{args[0]} @ {args[1]} = {args[2]} : {args[3]} @ {args[4]} = {args[5]} : {args[6]}}}";
            }
            else if (solverName == "$tint" || solverName == "$triple_integral")
            {
                // tintegrate(f, x, a, b, y, c, d, z, e, f2) → $tint{f @ x = a:b @ y = c:d @ z = e:f2}
                if (args.Count >= 10)
                    return $"{solverName}{{{args[0]} @ {args[1]} = {args[2]} : {args[3]} @ {args[4]} = {args[5]} : {args[6]} @ {args[7]} = {args[8]} : {args[9]}}}";
            }
            else if (solverName == "$deriv" || solverName == "$diff" || solverName == "$derivative" || solverName == "$slope")
            {
                // derivate(f, var, point) → $deriv{f @ var = point}
                if (args.Count >= 3)
                    return $"{solverName}{{{args[0]} @ {args[1]} = {args[2]}}}";
                if (args.Count >= 2)
                    return $"{solverName}{{{args[0]} @ {args[1]} = 0}}";
            }
            else if (solverName == "$gauss")
            {
                // gauss(f, var, order) → $gauss{f @ var = order}
                if (args.Count >= 3)
                    return $"{solverName}{{{args[0]} @ {args[1]} = {args[2]}}}";
            }
            else if (solverName == "$gauss2d")
            {
                // gauss2d(f, var1, n1, var2, n2) → $gauss2d{f @ var1 = n1 @ var2 = n2}
                if (args.Count >= 5)
                    return $"{solverName}{{{args[0]} @ {args[1]} = {args[2]} @ {args[3]} = {args[4]}}}";
            }
            else if (solverName == "$gauss3d")
            {
                // gauss3d(f, var1, n1, var2, n2, var3, n3) → $gauss3d{f @ var1=n1 @ var2=n2 @ var3=n3}
                if (args.Count >= 7)
                    return $"{solverName}{{{args[0]} @ {args[1]} = {args[2]} @ {args[3]} = {args[4]} @ {args[5]} = {args[6]}}}";
            }

            // Fallback: return as-is
            return args.Count > 0 ? args[0] : "0";
        }

        /// <summary>
        /// Find the matching closing parenthesis for an opening one (for math convenience blocks).
        /// </summary>
        private int FindMatchingParenForConvenience(string s, int openIdx)
        {
            int depth = 0;
            for (int i = openIdx; i < s.Length; i++)
            {
                if (s[i] == '(') depth++;
                else if (s[i] == ')') { depth--; if (depth == 0) return i; }
            }
            return -1;
        }

        /// <summary>
        /// Split function arguments respecting nested parentheses.
        /// integrate(sin(x)*cos(x), x, 0, pi) → ["sin(x)*cos(x)", "x", "0", "pi"]
        /// </summary>
        private List<string> SplitFunctionArgs(string argsStr)
        {
            var result = new List<string>();
            int depth = 0;
            int start = 0;
            for (int i = 0; i < argsStr.Length; i++)
            {
                if (argsStr[i] == '(') depth++;
                else if (argsStr[i] == ')') depth--;
                else if (argsStr[i] == ',' && depth == 0)
                {
                    result.Add(argsStr.Substring(start, i - start).Trim());
                    start = i + 1;
                }
            }
            result.Add(argsStr.Substring(start).Trim());
            return result;
        }

        /// <summary>
        /// Format the original convenience expression for HTML display.
        /// Adds math symbols for integral signs, etc.
        /// </summary>
        private string FormatConvenienceExpression(string line, Dictionary<string, string> functionMap)
        {
            var encoded = System.Net.WebUtility.HtmlEncode(line);

            // Replace function names with mathematical symbols
            foreach (var kv in functionMap)
            {
                var funcName = kv.Key;
                var solverName = kv.Value;

                string symbol = solverName switch
                {
                    "$int" or "$integral" => "\u222B",      // ∫
                    "$dint" or "$double_integral" => "\u222C", // ∬
                    "$tint" or "$triple_integral" => "\u222D", // ∭
                    "$deriv" or "$diff" or "$derivative" => "d/d",
                    "$slope" => "\u2202",                    // ∂
                    "$gauss" => "G\u2081",                   // G₁
                    "$gauss2d" => "G\u2082",                 // G₂
                    "$gauss3d" => "G\u2083",                 // G₃
                    _ => funcName
                };

                // Replace funcName( with symbol notation
                encoded = System.Text.RegularExpressions.Regex.Replace(
                    encoded,
                    $@"\b{System.Text.RegularExpressions.Regex.Escape(funcName)}\b",
                    $"<span style='color:#4169E1;font-weight:bold;'>{symbol}</span>",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            }

            return encoded;
        }

        /// <summary>
        /// Process @{eq} block - renders mathematical equations with Hekatan-style formatting
        /// Syntax:
        ///   @{eq}           (centered, default)
        ///   @{eq left}      (left-aligned)
        ///   @{eq right}     (right-aligned)
        ///   S_a = η*Z*F_a
        ///   @{end eq}
        ///
        /// Supports: fractions (a/b), subscripts (X_a), superscripts (X^2), Greek letters,
        /// matrices [a,b;c,d], piecewise {cond: val; ...}, equation numbers (N),
        /// and definitions with | separator (absorbs @{eqdef}).
        /// </summary>
        /// <summary>
        /// Extract alignment parameter from start directive string.
        /// E.g., "@{eq left}" → "left", "@{eqdef right}" → "right", "@{eq}" → "center"
        /// Supports: left/izquierda, right/derecha, center (default)
        /// </summary>
        private string ExtractEqAlignment(string startDirective)
        {
            if (string.IsNullOrWhiteSpace(startDirective)) return "center";
            // Remove @{ and } to get inner content: "eq left", "eqdef right", "eq:center", etc.
            var inner = startDirective.Trim().TrimStart('@').TrimStart('{').TrimEnd('}').Trim();
            // Support both space and colon separators: @{eq left}, @{eq:center}, @{eq:right}
            var parts = inner.Split(new[] { ' ', ':' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length > 1)
            {
                var p = parts[1].ToLower();
                if (p == "left" || p == "izquierda") return "left";
                if (p == "right" || p == "derecha") return "right";
                if (p == "center" || p == "centro") return "center";
            }
            return "center";
        }

        private string ProcessEquationBlock(string content, Dictionary<string, object> variables, string align = "center")
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return "";

                var alignClass = align == "left" ? " eq-align-left" : align == "right" ? " eq-align-right" : "";
                var sb = new StringBuilder();
                sb.Append($"<div class=\"eq-block{alignClass}\">");

                var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var line in lines)
                {
                    var trimmedLine = line.Trim();
                    if (string.IsNullOrEmpty(trimmedLine))
                        continue;

                    // Substitute variables from context
                    var processedLine = ProcessMarkdownVariables(trimmedLine, variables);

                    // --- Detect equation number (N) at end of line ---
                    // Match patterns like (1), (2a), (1.2), (1.2a) at end of line
                    string eqNumber = null;
                    var eqNumMatch = System.Text.RegularExpressions.Regex.Match(processedLine, @"\((\d+(?:\.\d+)?[a-z]?)\)\s*$");
                    if (eqNumMatch.Success)
                    {
                        eqNumber = eqNumMatch.Groups[1].Value;
                        processedLine = processedLine.Substring(0, eqNumMatch.Index).TrimEnd();
                    }

                    // --- Detect definition separator | (eqdef mode) ---
                    string definition = null;
                    int pipeIdx = FindTopLevelPipe(processedLine);
                    if (pipeIdx > 0)
                    {
                        definition = processedLine.Substring(pipeIdx + 1).Trim();
                        processedLine = processedLine.Substring(0, pipeIdx).TrimEnd();
                    }

                    // --- Render the equation line ---
                    string equationHtml;

                    // Check for piecewise: name = {case1: val1; case2: val2}
                    var pwMatch = System.Text.RegularExpressions.Regex.Match(processedLine, @"^(.+?)\s*=\s*\{(.+)\}$");
                    if (pwMatch.Success && pwMatch.Groups[2].Value.Contains(":"))
                    {
                        equationHtml = RenderPiecewiseEquation(pwMatch.Groups[1].Value.Trim(), pwMatch.Groups[2].Value.Trim());
                    }
                    // Check for standalone matrix: [a,b;c,d] or [[a,b];[c,d]]
                    else if (ContainsMatrix(processedLine))
                    {
                        equationHtml = RenderEquationWithMatrices(processedLine);
                    }
                    else
                    {
                        equationHtml = RenderEquationToHtml(processedLine);
                    }

                    // --- Build the line container ---
                    if (definition != null)
                    {
                        // Two-column: equation | definition
                        sb.Append("<p class=\"eq-line eq-def\">");
                        sb.Append(equationHtml);
                        sb.Append($"<span class=\"eq-def-text\"> – {System.Net.WebUtility.HtmlEncode(definition)}</span>");
                        if (eqNumber != null)
                            sb.Append($"<span class=\"ref\">({eqNumber})</span>");
                        sb.Append("</p>");
                    }
                    else if (eqNumber != null)
                    {
                        // Centered equation with number aligned right
                        sb.Append("<p class=\"eq-line eq-numbered\">");
                        sb.Append(equationHtml);
                        sb.Append($"<span class=\"ref\">({eqNumber})</span>");
                        sb.Append("</p>");
                    }
                    else
                    {
                        // Simple centered equation
                        sb.Append($"<p class=\"eq-line\">{equationHtml}</p>");
                    }
                }

                sb.Append("</div>");
                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<div style='color: red;'>Error in equation block: {ex.Message}</div>";
            }
        }

        /// <summary>
        /// Find a top-level | separator (not inside brackets, parens, or braces)
        /// </summary>
        private int FindTopLevelPipe(string text)
        {
            int parenDepth = 0, bracketDepth = 0, braceDepth = 0;
            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];
                if (c == '(') parenDepth++;
                else if (c == ')') parenDepth--;
                else if (c == '[') bracketDepth++;
                else if (c == ']') bracketDepth--;
                else if (c == '{') braceDepth++;
                else if (c == '}') braceDepth--;
                else if (c == '|' && parenDepth == 0 && bracketDepth == 0 && braceDepth == 0)
                    return i;
            }
            return -1;
        }

        /// <summary>
        /// Detect if a line contains matrix notation [a,b;c,d]
        /// </summary>
        private bool ContainsMatrix(string line)
        {
            // Pattern: [...;...] with semicolons inside brackets (multi-row)
            int bracketDepth = 0;
            bool hasSemicolon = false;
            for (int i = 0; i < line.Length; i++)
            {
                if (line[i] == '[') bracketDepth++;
                else if (line[i] == ']')
                {
                    if (hasSemicolon && bracketDepth == 1) return true;
                    bracketDepth--;
                    hasSemicolon = false;
                }
                else if (line[i] == ';' && bracketDepth >= 1)
                    hasSemicolon = true;
            }
            return false;
        }

        /// <summary>
        /// Render piecewise function: name = {cond1: val1; cond2: val2}
        /// Output: name =  { val1,  cond1
        ///                  { val2,  cond2   (with large brace)
        /// </summary>
        private string RenderPiecewiseEquation(string lhs, string casesStr)
        {
            var sb = new StringBuilder();
            var cases = SplitPiecewiseCases(casesStr);

            // Left-hand side
            sb.Append("<span class=\"eq\">");
            RenderExpressionWithFractions(sb, lhs, 10);
            sb.Append(" = ");

            // Use Hekatan native piecewise pattern: <span class="dvcs">{brace}<span class="dvs">cases</span></span>
            // Determine curly brace size class based on number of cases (c1-c8)
            int level = Math.Max(1, Math.Min(cases.Count, 8));
            string curlyClass = level <= 1 ? "c1" : $"c{level}";
            sb.Append("<span class=\"dvcs\">");
            sb.Append($"<span class=\"{curlyClass}\">{{</span>");
            sb.Append("<span class=\"dvs\">");
            for (int i = 0; i < cases.Count; i++)
            {
                var (condition, value) = cases[i];
                if (!string.IsNullOrEmpty(condition))
                {
                    sb.Append("<span class=\"cond\">if </span>");
                    RenderExpressionWithFractions(sb, condition, 10);
                    sb.Append(": ");
                }
                RenderExpressionWithFractions(sb, value, 10);
                if (i < cases.Count - 1)
                    sb.Append("<br />");
            }
            sb.Append("</span></span></span>");

            return sb.ToString();
        }

        /// <summary>
        /// Split piecewise cases "cond1: val1; cond2: val2" into list of (condition, value)
        /// </summary>
        private List<(string condition, string value)> SplitPiecewiseCases(string casesStr)
        {
            var result = new List<(string, string)>();
            var parts = casesStr.Split(';');
            foreach (var part in parts)
            {
                var trimmed = part.Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;
                int colonIdx = trimmed.IndexOf(':');
                if (colonIdx > 0)
                {
                    result.Add((trimmed.Substring(0, colonIdx).Trim(), trimmed.Substring(colonIdx + 1).Trim()));
                }
                else
                {
                    result.Add(("", trimmed));
                }
            }
            return result;
        }

        /// <summary>
        /// Render an equation line that contains matrix notation [a,b;c,d]
        /// Parses the line, finds matrix blocks, renders them as HTML tables with brackets
        /// </summary>
        private string RenderEquationWithMatrices(string line)
        {
            var sb = new StringBuilder();
            sb.Append("<span class=\"eq\">");

            int i = 0;
            while (i < line.Length)
            {
                if (line[i] == '[')
                {
                    // Find matching ]
                    int closeIdx = FindMatchingBracket(line, i);
                    if (closeIdx > i)
                    {
                        var matrixContent = line.Substring(i + 1, closeIdx - i - 1);
                        // Check if it's a matrix (has ;) or just a simple bracket expression
                        if (matrixContent.Contains(";"))
                        {
                            sb.Append(RenderMatrixHtml(matrixContent));
                        }
                        else
                        {
                            // Simple brackets, render as-is with bold brackets like Calcpad
                            sb.Append("<b class=\"b0\">[</b>");
                            RenderExpressionWithFractions(sb, matrixContent, 10);
                            sb.Append("<b class=\"b0\">]</b>");
                        }
                        i = closeIdx + 1;
                        continue;
                    }
                }

                // Regular character - accumulate until next matrix
                int nextBracket = line.IndexOf('[', i);
                string segment;
                if (nextBracket > i)
                {
                    segment = line.Substring(i, nextBracket - i);
                    i = nextBracket;
                }
                else
                {
                    segment = line.Substring(i);
                    i = line.Length;
                }
                RenderExpressionWithFractions(sb, segment, 10);
            }

            sb.Append("</span>");
            return sb.ToString();
        }

        /// <summary>
        /// Find matching ] for a [ at given position
        /// </summary>
        private int FindMatchingBracket(string text, int openIdx)
        {
            if (openIdx >= text.Length || text[openIdx] != '[') return -1;
            int depth = 1;
            for (int i = openIdx + 1; i < text.Length; i++)
            {
                if (text[i] == '[') depth++;
                else if (text[i] == ']')
                {
                    depth--;
                    if (depth == 0) return i;
                }
            }
            return -1;
        }

        /// <summary>
        /// Render a matrix as HTML table with bracket borders
        /// Content format: "row1col1, row1col2; row2col1, row2col2"
        /// Semicolons separate rows, commas separate columns
        /// </summary>
        private string RenderMatrixHtml(string matrixContent)
        {
            var sb = new StringBuilder();
            var rows = matrixContent.Split(';');

            // Use Hekatan native .matrix class (same as Calcpad engine)
            // Structure: <span class="matrix">
            //   <span class="tr"><span class="td"></span> <span class="td">val</span> ... <span class="td"></span></span>
            // </span>
            // The empty first/last .td in each .tr create the bracket borders via CSS
            sb.Append("<span class=\"matrix\">");
            foreach (var row in rows)
            {
                var cells = row.Trim().Split(',');
                sb.Append("<span class=\"tr\"><span class=\"td\"></span>");
                foreach (var cell in cells)
                {
                    sb.Append("<span class=\"td\">");
                    RenderExpressionWithFractions(sb, cell.Trim(), 10);
                    sb.Append("</span>");
                }
                sb.Append("<span class=\"td\"></span></span>");
            }
            sb.Append("</span>");
            return sb.ToString();
        }

        /// <summary>
        /// Render a single equation line to HTML with Hekatan-style formatting
        /// </summary>
        private string RenderEquationToHtml(string equation)
        {
            var sb = new StringBuilder();
            sb.Append("<span class=\"eq\">");
            RenderExpressionWithFractions(sb, equation, 10);
            sb.Append("</span>");
            return sb.ToString();
        }

        /// <summary>
        /// Core expression renderer with fraction support.
        /// Finds top-level / operators and renders as visual fractions (dvc/dvl).
        /// Used by RenderEquationToHtml, RenderPiecewiseEquation, RenderEquationWithMatrices.
        /// </summary>
        private void RenderExpressionWithFractions(StringBuilder sb, string expression, double fontSize)
        {
            int i = 0;
            while (i < expression.Length)
            {
                // Find next fraction slash
                int slashPos = FindNextFractionSlash(expression, i);

                if (slashPos >= 0)
                {
                    var (numStart, numEnd) = FindNumeratorBounds(expression, slashPos);
                    var (denStart, denEnd) = FindDenominatorBounds(expression, slashPos);

                    // Render text before the fraction
                    if (numStart > i)
                    {
                        var before = expression.Substring(i, numStart - i);
                        RenderHtmlEquationPart(sb, before, fontSize);
                    }

                    // Render the fraction using native Hekatan/Calcpad CSS classes
                    var numerator = expression.Substring(numStart, numEnd - numStart).Trim('(', ')');
                    var denominator = expression.Substring(denStart, denEnd - denStart).Trim('(', ')');

                    sb.Append("<span class=\"dvc\">");
                    RenderHtmlEquationPart(sb, numerator, fontSize);
                    sb.Append("<span class=\"dvl\"></span>");
                    RenderHtmlEquationPart(sb, denominator, fontSize);
                    sb.Append("</span>");

                    i = denEnd;
                }
                else
                {
                    // No more fractions, render the rest
                    var rest = expression.Substring(i);
                    RenderHtmlEquationPart(sb, rest, fontSize);
                    break;
                }
            }
        }

        /// <summary>
        /// Process @{eqdef} block - renders equations with definitions in two columns
        /// Syntax:
        ///   @{eqdef}
        ///   S_a = η*Z*F_a | Aceleración espectral de diseño
        ///   T_0 = 0.1*F_s*F_d/F_a | Periodo de inicio del plateau
        ///   @{end eqdef}
        ///
        /// Each line has format: equation | definition
        /// Equations are rendered with Hekatan-style formatting (fractions, subscripts, etc.)
        /// Definitions are rendered as plain text
        /// </summary>
        private string ProcessEqDefBlock(string content, Dictionary<string, object> variables)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return "";

                var sb = new StringBuilder();

                // Table with two columns: equation (60%) and definition (40%)
                sb.Append("<table class=\"eqdef-table\" style=\"width: 100%; border-collapse: collapse; margin: 15px 0; font-family: 'Times New Roman', serif; font-size: 16px;\">");

                var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var line in lines)
                {
                    var trimmedLine = line.Trim();
                    if (string.IsNullOrEmpty(trimmedLine))
                        continue;

                    // Split by | separator
                    var parts = trimmedLine.Split('|');
                    var equation = parts[0].Trim();
                    var definition = parts.Length > 1 ? parts[1].Trim() : "";

                    // Substitute variables from context in equation
                    var processedEquation = ProcessMarkdownVariables(equation, variables);

                    // Render the equation as HTML
                    var equationHtml = RenderEquationToHtml(processedEquation);

                    sb.Append("<tr>");
                    sb.Append($"<td style=\"padding: 8px 12px; vertical-align: middle; width: 55%;\">{equationHtml}</td>");
                    sb.Append($"<td style=\"padding: 8px 12px; vertical-align: middle; color: #555; font-style: italic;\">– {definition}</td>");
                    sb.Append("</tr>");
                }

                sb.Append("</table>");
                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<div style='color: red;'>Error in eqdef block: {ex.Message}</div>";
            }
        }

        /// <summary>
        /// Process @{center} block - centers content horizontally
        /// Syntax:
        ///   @{center}
        ///   Text or content to center
        ///   @{end center}
        ///
        /// Can also be used inline: @{center text} Your centered text here @{end center}
        /// </summary>
        private string ProcessCenterBlock(string content, Dictionary<string, object> variables, Action<string>? progressCallback)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(content))
                    return "";

                // Process the content (may contain nested blocks like markdown)
                var processedContent = ProcessContentRecursively(content, variables, progressCallback);

                // Wrap in centered div
                var sb = new StringBuilder();
                sb.Append("<div style=\"text-align: center; margin: 15px 0;\">");
                sb.Append(processedContent);
                sb.Append("</div>");

                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<div style='color: red; text-align: center;'>Error in center block: {ex.Message}</div>";
            }
        }

        /// <summary>
        /// Recursively process content that may contain nested blocks
        /// </summary>
        private string ProcessContentRecursively(string content, Dictionary<string, object> variables, Action<string>? progressCallback)
        {
            // First, check if the content contains any @{...} blocks
            if (!content.Contains("@{"))
            {
                // No nested blocks, process variables then render markdown to HTML
                var withVars = ProcessMarkdownVariables(content, variables);
                return RenderMarkdown(withVars);
            }

            // Content has nested blocks, process them
            var processor = new HekatanProcessor(null);
            var result = processor.ProcessCode(content, addLineNumbers: false);
            if (result.Success)
            {
                return result.ProcessedCode;
            }

            // Fallback to simple markdown processing then render
            var fallbackWithVars = ProcessMarkdownVariables(content, variables);
            return RenderMarkdown(fallbackWithVars);
        }

        /// <summary>
        /// Processes the content of a single column inside @{columns}.
        /// Handles @{html}...@{end html} as passthrough (raw HTML output),
        /// while other @{language} blocks are processed normally.
        /// Plain text/HTML lines are rendered through markdown with HTML block preservation.
        /// </summary>
        private string ProcessColumnContent(string trimmedContent, bool hasLangCode, Dictionary<string, object> variables, Action<string>? progressCallback)
        {
            var result = new StringBuilder();

            // Split content into segments: @{html} blocks (passthrough) and everything else
            var contentLines = trimmedContent.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            var segmentBuilder = new StringBuilder();
            bool insideHtmlPassthrough = false;

            for (int i = 0; i < contentLines.Length; i++)
            {
                var line = contentLines[i];
                var trimLine = line.Trim();

                // Detect @{html} start - treat as passthrough
                if (!insideHtmlPassthrough &&
                    (trimLine.Equals("@{html}", StringComparison.OrdinalIgnoreCase) ||
                     trimLine.StartsWith("@{html}", StringComparison.OrdinalIgnoreCase)))
                {
                    // Flush any accumulated non-html content first
                    if (segmentBuilder.Length > 0)
                    {
                        var segment = segmentBuilder.ToString().Trim();
                        if (!string.IsNullOrEmpty(segment))
                        {
                            if (MultLangManager.HasLanguageCode(segment))
                            {
                                result.Append(Process(segment, returnHtml: true, enableCollapse: false, progressCallback: progressCallback));
                            }
                            else
                            {
                                result.Append(RenderPlainColumnContent(segment));
                            }
                        }
                        segmentBuilder.Clear();
                    }
                    insideHtmlPassthrough = true;
                    continue; // Skip the @{html} line itself
                }

                // Detect @{end html} - end of passthrough
                if (insideHtmlPassthrough &&
                    (trimLine.Equals("@{end html}", StringComparison.OrdinalIgnoreCase) ||
                     trimLine.Equals("@{endhtml}", StringComparison.OrdinalIgnoreCase) ||
                     trimLine.Equals("@{/html}", StringComparison.OrdinalIgnoreCase) ||
                     trimLine.Equals("@{end}", StringComparison.OrdinalIgnoreCase)))
                {
                    // Output the accumulated HTML directly (passthrough)
                    result.Append(segmentBuilder.ToString());
                    segmentBuilder.Clear();
                    insideHtmlPassthrough = false;
                    continue; // Skip the @{end html} line itself
                }

                segmentBuilder.AppendLine(line);
            }

            // Flush remaining content
            if (segmentBuilder.Length > 0)
            {
                var segment = segmentBuilder.ToString().Trim();
                if (!string.IsNullOrEmpty(segment))
                {
                    if (insideHtmlPassthrough)
                    {
                        // Unclosed @{html} block - output as-is
                        result.Append(segment);
                    }
                    else if (MultLangManager.HasLanguageCode(segment))
                    {
                        result.Append(Process(segment, returnHtml: true, enableCollapse: false, progressCallback: progressCallback));
                    }
                    else
                    {
                        result.Append(RenderPlainColumnContent(segment));
                    }
                }
            }

            return result.ToString();
        }

        /// <summary>
        /// Renders plain text/HTML content for a column (no @{language} blocks).
        /// Preserves multi-line HTML block elements intact.
        /// </summary>
        private string RenderPlainColumnContent(string content)
        {
            var contentLines = content.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            var lineHtml = new StringBuilder();
            bool insideHtmlBlock = false;
            var htmlBlockBuilder = new StringBuilder();
            string currentBlockTag = "";

            foreach (var line in contentLines)
            {
                var trimLine = line.Trim();

                // Detect start of HTML block elements
                if (!insideHtmlBlock && trimLine.Length > 0)
                {
                    if (trimLine.StartsWith("<") && !trimLine.StartsWith("</"))
                    {
                        var blockTags = new[] { "<div", "<table", "<svg", "<pre", "<style", "<ul", "<ol", "<p", "<h1", "<h2", "<h3", "<h4" };
                        bool isBlockStart = false;
                        string blockTag = "";
                        foreach (var tag in blockTags)
                        {
                            if (trimLine.StartsWith(tag, StringComparison.OrdinalIgnoreCase))
                            {
                                isBlockStart = true;
                                blockTag = tag.Substring(1); // Remove <
                                break;
                            }
                        }

                        if (isBlockStart)
                        {
                            // Self-contained on one line?
                            if (trimLine.Contains($"</{blockTag}>"))
                            {
                                lineHtml.AppendLine(line);
                            }
                            else
                            {
                                insideHtmlBlock = true;
                                currentBlockTag = blockTag;
                                htmlBlockBuilder.Clear();
                                htmlBlockBuilder.AppendLine(line);
                            }
                            continue;
                        }
                    }
                }

                if (insideHtmlBlock)
                {
                    htmlBlockBuilder.AppendLine(line);
                    if (trimLine.Contains($"</{currentBlockTag}>"))
                    {
                        insideHtmlBlock = false;
                        lineHtml.Append(htmlBlockBuilder.ToString());
                    }
                    continue;
                }

                // Page break: --- (three or more dashes on a line by themselves)
                if (trimLine.Length >= 3 && trimLine.All(c => c == '-'))
                {
                    // Only emit page break if there's visible content before it
                    // (avoid empty first page when document starts with @{config} + ---)
                    var priorContent = lineHtml.ToString();
                    bool hasVisibleContent = System.Text.RegularExpressions.Regex.IsMatch(
                        priorContent, @"<(h[1-6]|p |div |canvas |img |table )", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    if (hasVisibleContent)
                        lineHtml.AppendLine("</div><div class=\"page\">");
                    continue;
                }

                // @{config ...} — inline document configuration directive
                if (trimLine.StartsWith("@{config ", StringComparison.OrdinalIgnoreCase) && trimLine.EndsWith("}"))
                {
                    var cfgContent = trimLine[8..^1]; // Extract between "@{config " and "}"
                    lineHtml.Append(ProcessConfigBlock("config " + cfgContent, ""));
                    continue;
                }

                // @{pagebreak} — standalone page break (without @{end pagebreak})
                if (trimLine.StartsWith("@{pagebreak", StringComparison.OrdinalIgnoreCase) && trimLine.EndsWith("}"))
                {
                    lineHtml.AppendLine("</div><div class=\"page\">");
                    continue;
                }

                // @{end pagebreak} — skip (already handled)
                if (System.Text.RegularExpressions.Regex.IsMatch(trimLine, @"^@\{end\s+pagebreak\}$", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                {
                    continue;
                }

                // Regular line - check if it's Hekatan math or text/markdown
                if (!string.IsNullOrWhiteSpace(trimLine))
                {
                    // Hekatan heading: "text (legacy) or # text / ## text (markdown)
                    if (trimLine.StartsWith("\""))
                    {
                        var headingText = trimLine.Substring(1).Trim();
                        lineHtml.AppendLine($"<h2 style=\"margin:0.3em 0;\">{System.Web.HttpUtility.HtmlEncode(headingText)}</h2>");
                    }
                    else if (trimLine.Length > 1 && trimLine[0] == '#' &&
                             (trimLine[1] == ' ' || trimLine[1] == '#'))
                    {
                        // Markdown heading: # or ## or ### ...
                        var headingText = trimLine.TrimStart('#').Trim();
                        int level = 0;
                        foreach (var ch in trimLine)
                        {
                            if (ch == '#') level++;
                            else break;
                        }
                        if (level > 6) level = 6;
                        lineHtml.AppendLine($"<h{level} style=\"margin:0.3em 0;\">{System.Web.HttpUtility.HtmlEncode(headingText)}</h{level}>");
                    }
                    // Hekatan text: 'text (legacy) or > text (markdown)
                    else if (trimLine.StartsWith("'"))
                    {
                        var textContent = trimLine.Substring(1);
                        var renderedLine = RenderMarkdown(textContent);
                        renderedLine = renderedLine.Trim();
                        if (renderedLine.StartsWith("<p>") && renderedLine.EndsWith("</p>"))
                            renderedLine = renderedLine.Substring(3, renderedLine.Length - 7);
                        lineHtml.AppendLine($"<div style=\"margin:0.2em 0;\">{renderedLine}</div>");
                    }
                    else if (trimLine.Length > 1 && trimLine[0] == '>' && trimLine[1] == ' ')
                    {
                        // > text → Hekatan text (like ')
                        var textContent = trimLine.Substring(2);
                        var renderedLine = RenderMarkdown(textContent);
                        renderedLine = renderedLine.Trim();
                        if (renderedLine.StartsWith("<p>") && renderedLine.EndsWith("</p>"))
                            renderedLine = renderedLine.Substring(3, renderedLine.Length - 7);
                        lineHtml.AppendLine($"<div style=\"margin:0.2em 0;\">{renderedLine}</div>");
                    }
                    // HTML passthrough
                    else if (trimLine.StartsWith("<"))
                    {
                        var renderedLine = trimLine;
                        lineHtml.AppendLine($"<div style=\"margin:0.2em 0;\">{renderedLine}</div>");
                    }
                    // Hekatan math: everything else → CALCPAD_INLINE marker
                    else if (IsLikelyHekatanMath(trimLine))
                    {
                        var base64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(trimLine));
                        lineHtml.AppendLine($"<!--CALCPAD_INLINE:{base64}-->");
                    }
                    else
                    {
                        var renderedLine = RenderMarkdown(trimLine);
                        renderedLine = renderedLine.Trim();
                        if (renderedLine.StartsWith("<p>") && renderedLine.EndsWith("</p>"))
                            renderedLine = renderedLine.Substring(3, renderedLine.Length - 7);
                        lineHtml.AppendLine($"<div style=\"margin:0.2em 0;\">{renderedLine}</div>");
                    }
                }
            }

            // Flush unclosed HTML block
            if (insideHtmlBlock)
            {
                lineHtml.Append(htmlBlockBuilder.ToString());
            }

            return lineHtml.ToString();
        }

        private string ProcessColumnsBlock(string directive, string content, Dictionary<string, object> variables, Action<string>? progressCallback)
        {
            try
            {
                // Use shared ColumnsParser for structure extraction (shared with WPF)
                var parsed = ColumnsParser.Parse(directive, content);

                // Mark detected languages for CSS template injection
                foreach (var lang in parsed.DetectedLanguages)
                {
                    MultLangTemplateManager.MarkLanguageUsed(lang);
                }

                // Build HTML with flexbox layout (CLI-specific rendering)
                var widthPercent = 100.0 / parsed.ColumnCount;
                var html = new StringBuilder();
                html.Append("<div class=\"columns-container\" style=\"display:flex;gap:1em;flex-wrap:wrap;\">");

                foreach (var column in parsed.Columns)
                {
                    html.Append($"<div class=\"column\" style=\"flex:1;min-width:{widthPercent - 5}%;max-width:{widthPercent + 5}%;\">");

                    foreach (var segment in column)
                    {
                        switch (segment.Type)
                        {
                            case ColumnsParser.SegmentType.ExternalBlock:
                                if (segment.Language.Equals("html", StringComparison.OrdinalIgnoreCase))
                                {
                                    // HTML passthrough
                                    html.Append(segment.Content);
                                }
                                else
                                {
                                    // Process external language block through MultLangProcessor
                                    // Use only the base language name (first word) for the end tag,
                                    // since DetectDirective matches @{end abstract} not @{end abstract english}
                                    var baseLang = segment.Language.Split(' ')[0];
                                    var blockCode = $"@{{{segment.Language}}}\n{segment.Content}\n@{{end {baseLang}}}";
                                    html.Append(Process(blockCode, returnHtml: true, enableCollapse: false, progressCallback: progressCallback));
                                }
                                break;

                            case ColumnsParser.SegmentType.PlainText:
                                // Check if the plain text contains embedded language blocks
                                if (MultLangManager.HasLanguageCode(segment.Content))
                                {
                                    html.Append(Process(segment.Content, returnHtml: true, enableCollapse: false, progressCallback: progressCallback));
                                }
                                else
                                {
                                    html.Append(RenderPlainColumnContent(segment.Content));
                                }
                                break;
                        }
                    }

                    html.Append("</div>");
                }

                html.Append("</div>");
                return html.ToString();
            }
            catch (Exception ex)
            {
                return $"<p style='color:red;'>Error en @{{columns}}: {ex.Message}</p>";
            }
        }

        /// <summary>
        /// Process IFC creation block - creates IFC geometry from commands
        /// </summary>
        private string ProcessIfcCreateBlock(string content, string directive)
        {
            try
            {
                var creator = new IfcCreator();
                var ifcContent = creator.ProcessCommands(content);

                // Check for errors
                if (ifcContent.StartsWith("ERRORS:"))
                {
                    var errors = ifcContent.Replace("ERRORS:", "").Trim();
                    return $"<div style='color: red; padding: 10px; border: 1px solid red; margin: 10px 0; font-family: monospace; white-space: pre-wrap;'>Errores en IFC-CREATE:\n{System.Web.HttpUtility.HtmlEncode(errors)}</div>";
                }

                // Save IFC file to temp directory
                var tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad_ifc");
                if (!System.IO.Directory.Exists(tempDir))
                {
                    System.IO.Directory.CreateDirectory(tempDir);
                }

                var ifcFileName = $"created_{Guid.NewGuid():N}.ifc";
                var ifcFilePath = System.IO.Path.Combine(tempDir, ifcFileName);
                System.IO.File.WriteAllText(ifcFilePath, ifcContent);

                // Also copy to resources/ifc for WebView2 access
                var appPath = AppDomain.CurrentDomain.BaseDirectory;
                var ifcResourcePath = System.IO.Path.Combine(appPath, "resources", "ifc");
                if (!System.IO.Directory.Exists(ifcResourcePath))
                {
                    System.IO.Directory.CreateDirectory(ifcResourcePath);
                }
                var resourceIfcPath = System.IO.Path.Combine(ifcResourcePath, ifcFileName);
                System.IO.File.WriteAllText(resourceIfcPath, ifcContent);

                // Generate inline viewer using Virtual Host URL
                var viewerHtml = IfcLanguageHandler.GenerateInlineViewerHtml(resourceIfcPath, directive);

                // Add download link for the IFC file
                var downloadHtml = $@"
<div style='margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px;'>
    <strong>IFC Creado:</strong> {ifcFileName}<br>
    <a href='file:///{ifcFilePath.Replace('\\', '/')}' style='color: #0078d4;' download>Descargar archivo IFC</a>
    <span style='color: #666; font-size: 11px;'> | Guardado en: {ifcFilePath}</span>
</div>";

                return downloadHtml + viewerHtml;
            }
            catch (Exception ex)
            {
                return $"<div style='color: red; padding: 10px; border: 1px solid red; margin: 10px 0;'>Error en @{{ifc-create}}: {ex.Message}</div>";
            }
        }

        /// <summary>
        /// Copy IFC viewer libraries to target directory for CLI usage
        /// This avoids CDN issues with Edge Tracking Prevention
        /// </summary>
        private void CopyIfcLibsToDirectory(string targetDirectory)
        {
            try
            {
                var libsDir = System.IO.Path.Combine(targetDirectory, "libs");
                if (!System.IO.Directory.Exists(libsDir))
                {
                    System.IO.Directory.CreateDirectory(libsDir);
                }

                // List of required files for IFC viewer
                var requiredFiles = new[]
                {
                    "three.module.js",
                    "OrbitControls.js",
                    "web-ifc-api-iife.js",
                    "web-ifc.wasm"
                };

                // Try to find source libs directory
                string sourceLibsDir = null;

                // First check in Examples/libs (development)
                var examplesLibs = System.IO.Path.Combine(
                    System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location) ?? "",
                    "..", "..", "..", "..", "Examples", "libs");
                if (System.IO.Directory.Exists(examplesLibs))
                {
                    sourceLibsDir = System.IO.Path.GetFullPath(examplesLibs);
                }

                // Try other common locations
                if (sourceLibsDir == null)
                {
                    var possiblePaths = new[]
                    {
                        @"C:\Users\j-b-j\Documents\Hekatan-7.5.7\Examples\libs",
                        System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                            "Documents", "Hekatan-7.5.7", "Examples", "libs")
                    };

                    foreach (var path in possiblePaths)
                    {
                        if (System.IO.Directory.Exists(path))
                        {
                            sourceLibsDir = path;
                            break;
                        }
                    }
                }

                if (sourceLibsDir == null)
                {
                    return;
                }

                // Copy each required file
                foreach (var fileName in requiredFiles)
                {
                    var sourceFile = System.IO.Path.Combine(sourceLibsDir, fileName);
                    var destFile = System.IO.Path.Combine(libsDir, fileName);

                    if (System.IO.File.Exists(sourceFile) && !System.IO.File.Exists(destFile))
                    {
                        System.IO.File.Copy(sourceFile, destFile);
                    }
                }

            }
            catch { }
        }

        // =====================================================================
        // THEME SYSTEM - Color/style themes for all formatted output
        // =====================================================================

        /// <summary>
        /// Processes @{theme:name} block - Apply a color theme to all formatted output.
        /// Predefined themes: black, calcpad, mathcad, book, blueprint
        /// Custom theme with body:
        ///   @{theme:custom}
        ///   var=#333
        ///   greek=#555
        ///   nary=#888
        ///   cond=#666
        ///   ref=#444
        ///   deftext=#777
        ///   fraction=#000
        ///   @{end theme}
        /// </summary>
        private string ProcessThemeBlock(string code, string directive)
        {
            // Extract theme name from directive: @{theme:black} or @{theme black} or @{tema:negro}
            var themeName = "calcpad"; // default
            var cleanDirective = directive.Trim().TrimStart('@').Trim('{', '}').Trim();
            // cleanDirective is now "theme:black" or "theme black" or "tema:negro"
            var parts = cleanDirective.Split(new[] { ':', ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
                themeName = parts[1].Trim().ToLowerInvariant();

            // Define theme colors
            string varColor, greekColor, naryColor, condColor, refColor, defTextColor, fractionColor, subColor;
            string bgColor = "inherit";
            string textColor = "inherit";

            switch (themeName)
            {
                case "black":
                case "negro":
                case "mono":
                case "monocromo":
                    // All black - professional print style, white background
                    varColor = "#000";
                    greekColor = "#000";
                    naryColor = "#000";
                    condColor = "#000";
                    refColor = "#333";
                    defTextColor = "#444";
                    fractionColor = "#000";
                    subColor = "#000";
                    textColor = "#000";
                    break;

                case "mathcad":
                case "prime":
                    // Mathcad Prime style - blue variables, black operators
                    varColor = "#0033CC";
                    greekColor = "#0033CC";
                    naryColor = "#000";
                    condColor = "#666";
                    refColor = "#999";
                    defTextColor = "#666";
                    fractionColor = "#000";
                    subColor = "#0033CC";
                    textColor = "#000";
                    break;

                case "book":
                case "libro":
                case "textbook":
                    // Textbook/academic style - dark blue, serif feel
                    varColor = "#1a1a2e";
                    greekColor = "#1a1a2e";
                    naryColor = "#333";
                    condColor = "#555";
                    refColor = "#666";
                    defTextColor = "#555";
                    fractionColor = "#1a1a2e";
                    subColor = "#1a1a2e";
                    textColor = "#1a1a2e";
                    break;

                case "blueprint":
                case "plano":
                    // Blueprint engineering style - white on blue (inverted)
                    varColor = "#E8E8FF";
                    greekColor = "#D0D0FF";
                    naryColor = "#AAAAFF";
                    condColor = "#FFCC00";
                    refColor = "#88FF88";
                    defTextColor = "#CCCCCC";
                    fractionColor = "#E8E8FF";
                    subColor = "#D0D0FF";
                    bgColor = "#0a1628";
                    textColor = "#E8E8FF";
                    break;

                case "custom":
                case "personalizado":
                    // Parse custom colors from body content
                    var props = ParseKeyValueBlock(code);
                    varColor = props.GetValueOrDefault("var", "#06d");
                    greekColor = props.GetValueOrDefault("greek", props.GetValueOrDefault("griega", "#086"));
                    naryColor = props.GetValueOrDefault("nary", props.GetValueOrDefault("integral", "#C080F0"));
                    condColor = props.GetValueOrDefault("cond", props.GetValueOrDefault("condicion", "#E000D0"));
                    refColor = props.GetValueOrDefault("ref", props.GetValueOrDefault("referencia", "Green"));
                    defTextColor = props.GetValueOrDefault("deftext", props.GetValueOrDefault("definicion", "#555"));
                    fractionColor = props.GetValueOrDefault("fraction", props.GetValueOrDefault("fraccion", "inherit"));
                    subColor = props.GetValueOrDefault("sub", props.GetValueOrDefault("subindice", "inherit"));
                    bgColor = props.GetValueOrDefault("bg", props.GetValueOrDefault("fondo", "inherit"));
                    textColor = props.GetValueOrDefault("text", props.GetValueOrDefault("texto", "inherit"));
                    break;

                case "calcpad":
                case "hekatan":
                default:
                    // Original Calcpad colors (blue vars, green greek, purple nary)
                    varColor = "#06d";
                    greekColor = "#086";
                    naryColor = "#C080F0";
                    condColor = "#E000D0";
                    refColor = "Green";
                    defTextColor = "#555";
                    fractionColor = "inherit";
                    subColor = "inherit";
                    break;
            }

            // Generate scoped CSS using a unique wrapper div
            // Each theme wraps subsequent content until the next theme or end of document
            _themeCounter++;
            string scopeId = $"hkt-{_themeCounter}";

            var sb = new StringBuilder();

            // Close previous theme div if open
            if (_themeOpen)
                sb.Append("</div>");

            // Open new theme div
            sb.Append($"<div id=\"{scopeId}\" class=\"eq-theme\">");
            _themeOpen = true;

            sb.Append("<style>");

            // All selectors scoped to this theme div
            string s = $"#{scopeId}";

            // Variable color (single-letter vars rendered as <var>)
            sb.Append($"{s} .eq var {{ color: {varColor}; }}");

            // Greek/italic color
            sb.Append($"{s} .eq i {{ color: {greekColor}; }}");

            // N-ary operators (integral, sum, product)
            sb.Append($"{s} .nary {{ color: {naryColor}; }}");

            // Piecewise condition text
            sb.Append($"{s} .cond {{ color: {condColor}; }}");

            // Equation reference numbers
            sb.Append($"{s} .eq-numbered .ref, {s} .eq-def .ref {{ color: {refColor}; }}");
            sb.Append($"{s} .ref {{ color: {refColor}; }}");

            // Definition text (after | pipe)
            sb.Append($"{s} .eq-def-text {{ color: {defTextColor}; }}");

            // General text color (operators, numbers, parentheses)
            if (textColor != "inherit")
            {
                sb.Append($"{s} .eq {{ color: {textColor}; }}");
                sb.Append($"{s} .eq-line {{ color: {textColor}; }}");
                sb.Append($"{s} .eq sup, {s} .eq sub {{ color: {textColor}; }}");
            }

            // Fraction line color
            if (fractionColor != "inherit")
                sb.Append($"{s} .dvl {{ border-bottom-color: {fractionColor}; }}");

            // Subscript color override (when different from text)
            if (subColor != "inherit")
                sb.Append($"{s} .eq sub {{ color: {subColor}; }}");

            // Background color
            if (bgColor != "inherit")
            {
                sb.Append($"{s} {{ background: {bgColor}; padding: 1em; border-radius: 4px; }}");
                sb.Append($"{s} .matrix .td:first-child {{ border-left-color: {varColor}; }}");
                sb.Append($"{s} .matrix .td:last-child {{ border-right-color: {varColor}; }}");
            }

            sb.Append("</style>");
            return sb.ToString();
        }

        // =====================================================================
        // DOCUMENT LAYOUT PARSERS - Academic paper / journal formatting
        // =====================================================================

        /// <summary>
        /// Processes @{paper} block - Document page configuration.
        /// Sets page size, margins, fonts, colors via CSS @page and root styles.
        /// Syntax (key:value per line):
        ///   size: A4 | letter | 206x286mm
        ///   margin: 10mm 20mm 10mm 20mm  (top right bottom left)
        ///   font: "Myriad Pro", Arial, sans-serif
        ///   fontsize: 9pt
        ///   color: #333333
        ///   accent: #F27835
        ///   background: #FFFFFF
        ///   lineheight: 1.15
        /// </summary>
        private string ProcessPaperBlock(string code, string directive)
        {
            var props = ParseKeyValueBlock(code);
            var size = props.GetValueOrDefault("size", "A4");
            var margin = props.GetValueOrDefault("margin", "15mm 10mm 10mm 10mm");
            var font = props.GetValueOrDefault("font", "\"Myriad Pro\", Arial, Helvetica, sans-serif");
            var fontSize = props.GetValueOrDefault("fontsize", "9pt");
            var color = props.GetValueOrDefault("color", "#333333");
            var accent = props.GetValueOrDefault("accent", "#F27835");
            var bg = props.GetValueOrDefault("background", "#FFFFFF");
            var lineHeight = props.GetValueOrDefault("lineheight", "1.15");
            var columnGap = props.GetValueOrDefault("columngap", "6mm");
            var columns = props.GetValueOrDefault("columns", "");
            var startPage = props.GetValueOrDefault("startpage", "");
            var pageNumber = props.GetValueOrDefault("pagenumber", "");

            // Parse custom size (e.g., "206x286mm")
            string pageSize;
            if (size.Contains('x') || size.Contains('X'))
            {
                pageSize = size.Replace('x', ' ').Replace('X', ' ');
            }
            else
            {
                pageSize = size; // A4, letter, etc.
            }

            // Build @page rule with optional page numbering
            var pageRule = new StringBuilder();
            pageRule.Append($@"@page {{
  size: {pageSize};
  margin: {margin};");

            // Page numbering: pagenumber=right|left|center
            // Uses CSS @page margin boxes (supported by print/PDF renderers)
            if (!string.IsNullOrEmpty(pageNumber))
            {
                var pos = pageNumber.Trim().ToLowerInvariant();
                string marginBox = pos switch
                {
                    "left" => "@bottom-left",
                    "center" => "@bottom-center",
                    _ => "@bottom-right"
                };
                pageRule.Append($@"
  {marginBox} {{
    content: counter(page);
    font-family: {font};
    font-size: {fontSize};
    color: {color};
  }}");
            }
            pageRule.Append("\n}");

            // Counter reset for startpage
            string counterReset = "";
            if (!string.IsNullOrEmpty(startPage) && int.TryParse(startPage.Trim(), out int startNum))
            {
                counterReset = $"\nbody {{ counter-reset: page {startNum - 1}; }}";
            }

            // CSS columns for continuous multi-column layout (like academic books)
            string columnsCss = "";
            if (!string.IsNullOrEmpty(columns) && int.TryParse(columns.Trim(), out int colCount) && colCount >= 2)
            {
                columnsCss = $@"
body, .markdown-page {{
  column-count: {colCount};
  column-gap: var(--paper-columngap);
  column-rule: none;
}}
/* Prevent headings and eq-blocks from breaking across columns */
h1, h2, h3, h4 {{ column-span: all; }}
.eq-block, .eq-line {{ break-inside: avoid; }}
table {{ break-inside: avoid; }}";
            }

            return $@"<style>
{pageRule}
{counterReset}
:root {{
  --paper-font: {font};
  --paper-fontsize: {fontSize};
  --paper-color: {color};
  --paper-accent: {accent};
  --paper-bg: {bg};
  --paper-lineheight: {lineHeight};
  --paper-columngap: {columnGap};
}}
body, .markdown-page {{
  font-family: var(--paper-font);
  font-size: var(--paper-fontsize);
  color: var(--paper-color);
  background: var(--paper-bg);
  line-height: var(--paper-lineheight);
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}}
.paper-columns {{
  column-gap: var(--paper-columngap);
}}
h1, h2, h3, h4 {{ font-family: var(--paper-font); color: var(--paper-accent); }}
{columnsCss}
</style>";
        }

        /// <summary>
        /// Processes @{header} block - Page header bar.
        /// Syntax:
        ///   left: Građevinar 1/2018
        ///   right: Author Names
        ///   color: #F27835
        ///   textcolor: #FFFFFF
        ///   height: 30pt
        /// Or just text content for a simple centered header.
        /// </summary>
        private string ProcessHeaderBlock(string code, string directive)
        {
            var props = ParseKeyValueBlock(code);

            // Check if it's key:value format or plain text
            if (props.Count > 0 && (props.ContainsKey("left") || props.ContainsKey("right") || props.ContainsKey("center") || props.ContainsKey("color")))
            {
                var left = props.GetValueOrDefault("left", "");
                var right = props.GetValueOrDefault("right", "");
                var center = props.GetValueOrDefault("center", "");
                var barColor = props.GetValueOrDefault("color", "var(--paper-accent, #F27835)");
                var textColor = props.GetValueOrDefault("textcolor", "#FFFFFF");
                var rightColor = props.GetValueOrDefault("rightcolor", "var(--paper-accent, #F27835)");
                var height = props.GetValueOrDefault("height", "30pt");
                var barSide = props.GetValueOrDefault("barside", "left"); // left or right
                var lineColor = props.GetValueOrDefault("linecolor", "var(--paper-accent, #F27835)");

                var leftStyle = barSide == "left"
                    ? $"background:{barColor}; color:{textColor}; padding:0 12pt;"
                    : $"color:{rightColor}; padding:0 12pt;";
                var rightStyle = barSide == "right"
                    ? $"background:{barColor}; color:{textColor}; padding:0 12pt;"
                    : $"color:{rightColor}; padding:0 12pt;";

                return $@"<div class=""paper-header"" style=""display:flex; justify-content:space-between; align-items:center; height:{height}; font-size:9pt; border-bottom:1pt solid {lineColor}; margin-bottom:8pt;"">
  <div style=""{leftStyle}; height:100%; display:flex; align-items:center;"">{left}</div>
  {(string.IsNullOrEmpty(center) ? "" : $"<div style=\"flex:1; text-align:center;\">{center}</div>")}
  <div style=""{rightStyle}; height:100%; display:flex; align-items:center;"">{right}</div>
</div>";
            }
            else
            {
                // Simple header with text
                return $@"<div class=""paper-header"" style=""text-align:center; font-size:9pt; padding:4pt 0; border-bottom:1pt solid var(--paper-accent, #F27835); margin-bottom:8pt;"">{code.Trim()}</div>";
            }
        }

        /// <summary>
        /// Processes @{footer} block - Page footer.
        /// Syntax:
        ///   left: GRAĐEVINAR 70 (2018) 1, 19-29
        ///   right: 20
        ///   linecolor: #5F6062
        /// </summary>
        private string ProcessFooterBlock(string code, string directive)
        {
            var props = ParseKeyValueBlock(code);

            if (props.Count > 0 && (props.ContainsKey("left") || props.ContainsKey("right")))
            {
                var left = props.GetValueOrDefault("left", "");
                var right = props.GetValueOrDefault("right", "");
                var lineColor = props.GetValueOrDefault("linecolor", "#5F6062");
                var textColor = props.GetValueOrDefault("textcolor", "#727376");

                return $@"<div class=""paper-footer"" style=""border-top:0.25pt solid {lineColor}; display:flex; justify-content:space-between; padding-top:4pt; font-size:9pt; color:{textColor}; margin-top:12pt;"">
  <div>{left}</div>
  <div>{right}</div>
</div>";
            }
            else
            {
                return $@"<div class=""paper-footer"" style=""border-top:0.25pt solid #5F6062; text-align:center; padding-top:4pt; font-size:9pt; color:#727376; margin-top:12pt;"">{code.Trim()}</div>";
            }
        }

        /// <summary>
        /// Processes @{pagebreak} - Page break with optional page number footer.
        /// Syntax variants:
        ///   @{pagebreak}          - Simple page break, no footer
        ///   @{pagebreak 15}       - Page break with page number 15 at bottom-right
        ///   @{pagebreak}          - With content block:
        ///     left: TEORIA DE PLACAS
        ///     right: 15
        ///   @{end pagebreak}
        /// </summary>
        /// <summary>
        /// Processes @{text} blocks — renders content as plain text paragraphs (no math evaluation).
        /// Blank lines create paragraph breaks. Supports basic inline markup.
        /// </summary>
        private string ProcessTextBlock(string code, string startDirective)
        {
            if (string.IsNullOrWhiteSpace(code))
                return "";

            var sb = new StringBuilder();
            var lines = code.Split('\n');
            var paraLines = new List<string>();

            void FlushParagraph()
            {
                if (paraLines.Count == 0) return;
                var text = string.Join(" ", paraLines.Select(l => l.Trim()));
                // Basic inline formatting: **bold**, *italic*, `code`
                text = System.Text.RegularExpressions.Regex.Replace(text, @"\*\*(.+?)\*\*", "<b>$1</b>");
                text = System.Text.RegularExpressions.Regex.Replace(text, @"\*(.+?)\*", "<i>$1</i>");
                text = System.Text.RegularExpressions.Regex.Replace(text, @"`(.+?)`", "<code>$1</code>");
                sb.Append($"<p style=\"text-align:justify; line-height:160%; margin:0.4em 0;\">{text}</p>\n");
                paraLines.Clear();
            }

            foreach (var rawLine in lines)
            {
                var line = rawLine.TrimEnd('\r');
                if (string.IsNullOrWhiteSpace(line))
                {
                    FlushParagraph();
                }
                else
                {
                    paraLines.Add(line);
                }
            }
            FlushParagraph();

            return sb.ToString();
        }

        /// <summary>
        /// Processes @{config ...} directives — document configuration.
        /// Supports: bg, align, header, footer, startpage, color, bold, headertitle.
        /// </summary>
        private string ProcessConfigBlock(string language, string code)
        {
            // Parse inline config from directive: @{config bg:book, align:right, header:on}
            var cfgStr = language.Length > 6 ? language[6..].Trim() : "";
            if (string.IsNullOrWhiteSpace(cfgStr) && !string.IsNullOrWhiteSpace(code))
                cfgStr = code.Trim();

            if (string.IsNullOrWhiteSpace(cfgStr))
                return "";

            var sb = new StringBuilder();

            // Parse bg:<color>
            var bgMatch = System.Text.RegularExpressions.Regex.Match(cfgStr, @"bg:([^\s,}]+)");
            if (bgMatch.Success)
            {
                var bgColor = bgMatch.Groups[1].Value.ToLowerInvariant() switch
                {
                    "book" => "#fffef8",
                    "cream" => "#fffdd0",
                    "white" => "#ffffff",
                    "dark" => "#1e1e1e",
                    _ => bgMatch.Groups[1].Value
                };
                sb.Append($"<style>.page {{ background: {bgColor} !important; }}</style>\n");
            }

            // Parse align:<left|center|right>
            var alignMatch = System.Text.RegularExpressions.Regex.Match(cfgStr, @"align:(\w+)");
            if (alignMatch.Success)
            {
                sb.Append($"<style>.page {{ text-align: {alignMatch.Groups[1].Value} !important; }}</style>\n");
            }

            // Parse color:black — all-black equations (like printed books)
            var colorMatch = System.Text.RegularExpressions.Regex.Match(cfgStr, @"color:(black|default)");
            if (colorMatch.Success && colorMatch.Groups[1].Value.Equals("black", StringComparison.OrdinalIgnoreCase))
            {
                sb.Append("<style>.eq var, .eq i, .eq { color: #000 !important; }</style>\n");
            }

            // Parse header:on — page headers
            var headerMatch = System.Text.RegularExpressions.Regex.Match(cfgStr, @"header:(on|off)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (headerMatch.Success && headerMatch.Groups[1].Value.Equals("on", StringComparison.OrdinalIgnoreCase))
            {
                // Store header state - actual rendering happens in template
                MultLangTemplateManager.MarkLanguageUsed("header");
            }

            // Parse startpage:<N>
            var startPageMatch = System.Text.RegularExpressions.Regex.Match(cfgStr, @"startpage:(\d+)");
            if (startPageMatch.Success)
            {
                // Store start page number for pagination
                sb.Append($"<script>window.__hekatanStartPage = {startPageMatch.Groups[1].Value};</script>\n");
            }

            // Parse bold:on
            var boldMatch = System.Text.RegularExpressions.Regex.Match(cfgStr, @"bold:(on|off)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (boldMatch.Success && boldMatch.Groups[1].Value.Equals("on", StringComparison.OrdinalIgnoreCase))
            {
                sb.Append("<style>.eq { font-weight: bold; }</style>\n");
            }

            return sb.ToString();
        }

        private string ProcessPageBreak(string language, string code)
        {
            var sb = new StringBuilder();

            // Check if page number is in the directive itself: @{pagebreak 15}
            var parts = language.Split(new[] { ' ', '\t' }, 2, StringSplitOptions.RemoveEmptyEntries);
            string? pageNum = null;
            string? leftText = null;
            string lineColor = "#000";
            string textColor = "#000";

            if (parts.Length > 1)
            {
                // @{pagebreak 15} — number in directive
                pageNum = parts[1].Trim();
            }

            // Check if there's block content with key:value pairs
            if (!string.IsNullOrWhiteSpace(code))
            {
                var props = ParseKeyValueBlock(code);
                if (props.Count > 0)
                {
                    if (props.ContainsKey("right")) pageNum = props["right"];
                    if (props.ContainsKey("left")) leftText = props["left"];
                    if (props.ContainsKey("linecolor")) lineColor = props["linecolor"];
                    if (props.ContainsKey("textcolor")) textColor = props["textcolor"];
                }
                else if (pageNum == null)
                {
                    // Plain content = page number
                    var trimmed = code.Trim();
                    if (!string.IsNullOrEmpty(trimmed))
                        pageNum = trimmed;
                }
            }

            // Emit footer with page number if provided
            if (pageNum != null || leftText != null)
            {
                sb.Append($"<div class=\"paper-page-footer\" style=\"column-span:all; border-top:0.5pt solid {lineColor}; display:flex; justify-content:space-between; padding-top:4pt; font-size:10pt; color:{textColor}; margin-top:auto;\">");
                sb.Append($"<div>{leftText ?? ""}</div>");
                sb.Append($"<div>{pageNum ?? ""}</div>");
                sb.Append("</div>");
            }

            // Page break — close current .page div and open a new one (visual + print)
            sb.Append("</div><div class=\"page\">");

            return sb.ToString();
        }

        /// <summary>
        /// Processes @{figure} block - Figure with caption.
        /// Syntax:
        ///   src: path/to/image.png
        ///   width: 100%
        ///   caption: Figure 1. Description of the figure
        ///   number: 1
        ///   align: center
        /// Or simple: just a path on first line and caption on second.
        /// </summary>
        private string ProcessFigureBlock(string code, string directive)
        {
            var props = ParseKeyValueBlock(code);

            string src, caption, width, align;
            if (props.ContainsKey("src"))
            {
                src = props["src"];
                caption = props.GetValueOrDefault("caption", "");
                width = props.GetValueOrDefault("width", "100%");
                align = props.GetValueOrDefault("align", "center");
            }
            else
            {
                // Simple format: first non-empty line = src, rest = caption
                var lines = code.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
                src = lines.Length > 0 ? lines[0].Trim() : "";
                caption = lines.Length > 1 ? string.Join(" ", lines.Skip(1)).Trim() : "";
                width = "100%";
                align = "center";

                // Parse number from directive: @{figure 3} or @{figura 3}
                var directiveParts = directive.Replace("@{", "").Replace("}", "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (directiveParts.Length > 1)
                {
                    // Could be width parameter: @{figure 80%}
                    var param = directiveParts[1];
                    if (param.EndsWith("%") || param.EndsWith("px") || param.EndsWith("mm") || param.EndsWith("pt"))
                        width = param;
                }
            }

            var textAlign = align == "center" ? "text-align:center;" : (align == "right" ? "text-align:right;" : "");

            var html = new StringBuilder();
            html.Append($"<figure style=\"{textAlign} margin:8pt 0;\">");
            html.Append($"<img src=\"{src}\" style=\"max-width:{width}; height:auto;\" />");
            if (!string.IsNullOrWhiteSpace(caption))
            {
                html.Append($"<figcaption style=\"font-size:8pt; color:#555; margin-top:4pt; text-align:center;\">{caption}</figcaption>");
            }
            html.Append("</figure>");
            return html.ToString();
        }

        /// <summary>
        /// Processes @{author} block - Author info card with photo.
        /// Syntax:
        ///   photo: path/to/photo.png
        ///   name: Prof. Ivica Kožar, PhD
        ///   affiliation: University of Rijeka
        ///   email: kozar@gradri.uniri.hr
        /// Or multiple authors separated by ---
        /// </summary>
        private string ProcessAuthorBlock(string code, string directive)
        {
            // Split by --- for multiple authors
            var authorSections = code.Split(new[] { "\n---\n", "\n---" }, StringSplitOptions.RemoveEmptyEntries);
            var html = new StringBuilder();
            html.Append("<div class=\"paper-authors\" style=\"display:flex; flex-wrap:wrap; gap:12pt; margin:8pt 0;\">");

            foreach (var section in authorSections)
            {
                var props = ParseKeyValueBlock(section);
                var photo = props.GetValueOrDefault("photo", props.GetValueOrDefault("foto", ""));
                var name = props.GetValueOrDefault("name", props.GetValueOrDefault("nombre", ""));
                var affiliation = props.GetValueOrDefault("affiliation", props.GetValueOrDefault("afiliacion", ""));
                var email = props.GetValueOrDefault("email", props.GetValueOrDefault("correo", ""));
                var role = props.GetValueOrDefault("role", props.GetValueOrDefault("rol", ""));

                html.Append("<div class=\"paper-author\" style=\"display:flex; gap:6pt; flex:1; min-width:200pt;\">");
                if (!string.IsNullOrEmpty(photo))
                {
                    html.Append($"<img src=\"{photo}\" style=\"width:60pt; height:75pt; object-fit:cover; border-radius:2pt;\" />");
                }
                html.Append("<div style=\"font-size:8pt; line-height:1.3;\">");
                if (!string.IsNullOrEmpty(name))
                    html.Append($"<div style=\"font-weight:bold;\">{name}</div>");
                if (!string.IsNullOrEmpty(role))
                    html.Append($"<div style=\"font-style:italic;\">{role}</div>");
                if (!string.IsNullOrEmpty(affiliation))
                    html.Append($"<div>{affiliation.Replace("\\n", "<br/>")}</div>");
                if (!string.IsNullOrEmpty(email))
                    html.Append($"<div><a href=\"mailto:{email}\" style=\"color:var(--paper-accent, #F27835);\">{email}</a></div>");
                html.Append("</div></div>");
            }

            html.Append("</div>");
            return html.ToString();
        }

        /// <summary>
        /// Processes @{abstract} block - Abstract/resumen section.
        /// Content is the abstract text. Directive may contain language: @{abstract english}
        /// </summary>
        private string ProcessAbstractBlock(string code, string directive)
        {
            // Extract language from directive: @{abstract english} or @{resumen}
            var parts = directive.Replace("@{", "").Replace("}", "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var label = "Abstract";
            if (parts.Length > 1)
            {
                var lang = parts[1].ToLower();
                label = lang switch
                {
                    "english" or "en" => "Abstract",
                    "spanish" or "es" or "espanol" => "Resumen",
                    "croatian" or "hr" or "hrvatski" => "Sažetak",
                    "german" or "de" or "deutsch" => "Zusammenfassung",
                    "french" or "fr" or "francais" => "Résumé",
                    _ => parts[1] // Use as-is if not recognized
                };
            }
            else if (parts[0].Equals("resumen", StringComparison.OrdinalIgnoreCase))
            {
                label = "Resumen";
            }

            // Check if code has key:value format with keywords
            var props = ParseKeyValueBlock(code);
            var keywords = props.GetValueOrDefault("keywords", props.GetValueOrDefault("palabras", ""));
            var text = props.ContainsKey("text") ? props["text"] : code.Trim();

            // Remove keywords line from text if it was parsed
            if (props.ContainsKey("keywords") || props.ContainsKey("palabras"))
            {
                // Re-extract just the text portion
                var lines = code.Split('\n');
                var textLines = lines.Where(l => !l.Trim().StartsWith("keywords:", StringComparison.OrdinalIgnoreCase) &&
                                                  !l.Trim().StartsWith("palabras:", StringComparison.OrdinalIgnoreCase) &&
                                                  !l.Trim().StartsWith("text:", StringComparison.OrdinalIgnoreCase))
                                     .ToList();
                text = string.Join("\n", textLines).Trim();
            }

            var html = new StringBuilder();
            html.Append("<div class=\"paper-abstract\" style=\"margin:8pt 0; padding:6pt 0; border-top:1pt solid var(--paper-accent, #F27835); border-bottom:1pt solid var(--paper-accent, #F27835);\">");
            html.Append($"<div style=\"font-weight:bold; color:var(--paper-accent, #F27835); margin-bottom:4pt;\">{label}</div>");
            html.Append($"<div style=\"font-size:8.5pt; text-align:justify;\">{RenderMarkdown(text)}</div>");
            if (!string.IsNullOrEmpty(keywords))
            {
                html.Append($"<div style=\"margin-top:4pt; font-size:8pt;\"><b>Keywords:</b> {keywords}</div>");
            }
            html.Append("</div>");
            return html.ToString();
        }

        /// <summary>
        /// Processes @{reference} block - References/bibliography section.
        /// Each line is a reference entry. Numbered lines (1. or [1]) are auto-formatted.
        /// </summary>
        private string ProcessReferenceBlock(string code, string directive)
        {
            var parts = directive.Replace("@{", "").Replace("}", "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var label = "References";
            if (parts.Length > 1)
            {
                label = string.Join(" ", parts.Skip(1));
            }
            else if (parts[0].Equals("referencia", StringComparison.OrdinalIgnoreCase) ||
                     parts[0].Equals("referencias", StringComparison.OrdinalIgnoreCase))
            {
                label = "Referencias";
            }
            else if (parts[0].Equals("bibliografia", StringComparison.OrdinalIgnoreCase))
            {
                label = "Bibliografía";
            }

            var lines = code.Split('\n').Where(l => !string.IsNullOrWhiteSpace(l)).ToList();
            var html = new StringBuilder();
            html.Append("<div class=\"paper-references\" style=\"margin-top:12pt;\">");
            html.Append($"<div style=\"font-weight:bold; color:var(--paper-accent, #F27835); font-size:10pt; margin-bottom:6pt;\">{label}</div>");
            html.Append("<div style=\"font-size:8pt; line-height:1.4;\">");

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                // Detect numbered reference: [1] or 1.
                var match = Regex.Match(trimmed, @"^\[?(\d+)\]?\.?\s*(.+)$");
                if (match.Success)
                {
                    var num = match.Groups[1].Value;
                    var text = match.Groups[2].Value;
                    html.Append($"<div style=\"margin-bottom:3pt; padding-left:18pt; text-indent:-18pt;\">[{num}] {text}</div>");
                }
                else
                {
                    html.Append($"<div style=\"margin-bottom:3pt; padding-left:18pt; text-indent:-18pt;\">{trimmed}</div>");
                }
            }

            html.Append("</div></div>");
            return html.ToString();
        }

        /// <summary>
        /// Processes @{title} block - Document/section title.
        /// Syntax:
        ///   text: Method of incompatible modes
        ///   subtitle: overview and application
        ///   doi: https://doi.org/10.14256/JCE.2078.2017
        ///   type: preliminary note
        ///   received: 2017.06.26
        ///   accepted: 2017.11.20
        /// Or just plain text for a simple title.
        /// </summary>
        /// <summary>
        /// Processes @{inkscape} block - Renders SVG via Inkscape CLI to PNG and embeds inline.
        /// Also shows the SVG directly. If Inkscape is not installed, falls back to inline SVG only.
        /// Syntax: @{inkscape} or @{inkscape 600 400} (width height) or @{inkscape pdf}
        /// </summary>
        private string ProcessInkscapeBlock(string code, string directive)
        {
            try
            {
                var svgCode = code.Trim();

                // Parse directive options: @{inkscape [width] [height]} or @{inkscape pdf}
                var parts = directive.Replace("@{", "").Replace("}", "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                int width = 600, height = 400;
                string exportFormat = "png";

                for (int i = 1; i < parts.Length; i++)
                {
                    if (int.TryParse(parts[i], out var val))
                    {
                        if (i == 1) width = val;
                        else if (i == 2) height = val;
                    }
                    else if (parts[i].Equals("pdf", StringComparison.OrdinalIgnoreCase))
                        exportFormat = "pdf";
                }

                // Wrap in <svg> if not already a complete SVG
                if (!svgCode.TrimStart().StartsWith("<svg", StringComparison.OrdinalIgnoreCase))
                {
                    svgCode = $"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\">\n{svgCode}\n</svg>";
                }

                // Save SVG to temp file
                var tempDir = System.IO.Path.GetTempPath();
                var svgPath = System.IO.Path.Combine(tempDir, $"hekatan_inkscape_{Guid.NewGuid():N}.svg");
                var pngPath = System.IO.Path.ChangeExtension(svgPath, "." + exportFormat);
                System.IO.File.WriteAllText(svgPath, svgCode, new System.Text.UTF8Encoding(false));

                // Try Inkscape CLI conversion
                var inkscapePath = "inkscape";
                var defaultPaths = new[] {
                    @"C:\Program Files\Inkscape\bin\inkscape.exe",
                    @"C:\Program Files (x86)\Inkscape\bin\inkscape.exe"
                };
                foreach (var p in defaultPaths)
                    if (System.IO.File.Exists(p)) { inkscapePath = p; break; }

                var sb = new StringBuilder();

                try
                {
                    var psi = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = inkscapePath,
                        Arguments = exportFormat == "pdf"
                            ? $"\"{svgPath}\" --export-type=pdf --export-filename=\"{pngPath}\""
                            : $"\"{svgPath}\" --export-type=png --export-width={width} --export-filename=\"{pngPath}\"",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    };

                    var process = System.Diagnostics.Process.Start(psi);
                    process.WaitForExit(30000); // 30 second timeout

                    if (System.IO.File.Exists(pngPath) && exportFormat == "png")
                    {
                        // Embed PNG as base64 image
                        var bytes = System.IO.File.ReadAllBytes(pngPath);
                        var base64 = Convert.ToBase64String(bytes);
                        sb.AppendLine($"<div style='margin:8px 0;'>");
                        sb.AppendLine($"<img src='data:image/png;base64,{base64}' style='max-width:100%;' />");
                        sb.AppendLine($"</div>");

                        // Cleanup
                        try { System.IO.File.Delete(pngPath); } catch { }
                    }
                    else if (System.IO.File.Exists(pngPath) && exportFormat == "pdf")
                    {
                        sb.AppendLine($"<p style='color:#1565c0;'>PDF exportado: {pngPath}</p>");
                    }
                    else
                    {
                        // Fallback: show SVG inline
                        sb.AppendLine(svgCode);
                    }
                }
                catch
                {
                    // Inkscape not available, show SVG inline directly
                    sb.AppendLine(svgCode);
                }

                // Cleanup SVG temp
                try { System.IO.File.Delete(svgPath); } catch { }

                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"<p style='color:red;'>Error en @{{inkscape}}: {ex.Message}</p>";
            }
        }

        private string ProcessTitleBlock(string code, string directive)
        {
            var props = ParseKeyValueBlock(code);

            if (props.ContainsKey("text") || props.ContainsKey("titulo") || props.ContainsKey("subtitle"))
            {
                var text = props.GetValueOrDefault("text", props.GetValueOrDefault("titulo", ""));
                var subtitle = props.GetValueOrDefault("subtitle", props.GetValueOrDefault("subtitulo", ""));
                var doi = props.GetValueOrDefault("doi", "");
                var type = props.GetValueOrDefault("type", props.GetValueOrDefault("tipo", ""));
                var received = props.GetValueOrDefault("received", props.GetValueOrDefault("recibido", ""));
                var accepted = props.GetValueOrDefault("accepted", props.GetValueOrDefault("aceptado", ""));
                var udc = props.GetValueOrDefault("udc", "");

                var html = new StringBuilder();
                html.Append("<div class=\"paper-title\" style=\"margin:8pt 0 12pt 0;\">");

                if (!string.IsNullOrEmpty(udc))
                    html.Append($"<div style=\"font-size:8pt; color:#666;\">UDK {udc}</div>");
                if (!string.IsNullOrEmpty(type))
                    html.Append($"<div style=\"font-size:9pt; color:var(--paper-accent, #F27835); font-style:italic; margin-bottom:4pt;\">{type}</div>");

                html.Append($"<h1 style=\"font-size:16pt; font-weight:bold; color:var(--paper-accent, #F27835); margin:0 0 4pt 0; line-height:1.2;\">{text}</h1>");

                if (!string.IsNullOrEmpty(subtitle))
                    html.Append($"<h2 style=\"font-size:12pt; font-weight:normal; font-style:italic; color:#555; margin:0 0 6pt 0;\">{subtitle}</h2>");
                if (!string.IsNullOrEmpty(doi))
                    html.Append($"<div style=\"font-size:8pt; color:#666;\">DOI: <a href=\"{doi}\" style=\"color:var(--paper-accent, #F27835);\">{doi}</a></div>");
                if (!string.IsNullOrEmpty(received) || !string.IsNullOrEmpty(accepted))
                {
                    html.Append("<div style=\"font-size:8pt; color:#666;\">");
                    if (!string.IsNullOrEmpty(received)) html.Append($"Received: {received}");
                    if (!string.IsNullOrEmpty(received) && !string.IsNullOrEmpty(accepted)) html.Append(" | ");
                    if (!string.IsNullOrEmpty(accepted)) html.Append($"Accepted: {accepted}");
                    html.Append("</div>");
                }

                html.Append("</div>");
                return html.ToString();
            }
            else
            {
                // Simple title
                return $"<h1 style=\"font-size:16pt; font-weight:bold; color:var(--paper-accent, #F27835); margin:8pt 0;\">{code.Trim()}</h1>";
            }
        }

        /// <summary>
        /// Utility: Parses a block of key:value pairs into a dictionary.
        /// Lines without : are ignored. Values can span multiple lines if indented.
        /// </summary>
        private Dictionary<string, string> ParseKeyValueBlock(string code)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(code)) return result;

            var lines = code.Split('\n');
            string currentKey = null;
            var currentValue = new StringBuilder();

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;

                // Check for key: value pattern
                var colonIdx = trimmed.IndexOf(':');
                if (colonIdx > 0 && colonIdx < trimmed.Length - 1)
                {
                    var potentialKey = trimmed.Substring(0, colonIdx).Trim().ToLower();
                    // Only treat as key:value if key is a simple word (no spaces, no URLs)
                    if (!potentialKey.Contains(' ') && !potentialKey.Contains('/') && !potentialKey.Contains('.'))
                    {
                        // Save previous key
                        if (currentKey != null)
                        {
                            result[currentKey] = currentValue.ToString().Trim();
                        }
                        currentKey = potentialKey;
                        currentValue.Clear();
                        currentValue.Append(trimmed.Substring(colonIdx + 1).Trim());
                        continue;
                    }
                }

                // Continuation of previous value
                if (currentKey != null)
                {
                    currentValue.Append(" ");
                    currentValue.Append(trimmed);
                }
            }

            // Save last key
            if (currentKey != null)
            {
                result[currentKey] = currentValue.ToString().Trim();
            }

            return result;
        }
    }
}
