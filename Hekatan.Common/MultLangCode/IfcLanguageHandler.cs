using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Handler for @{ifc}...@{end ifc} blocks
    /// Generates inline HTML/JavaScript viewer using Three.js and web-ifc
    /// </summary>
    public static class IfcLanguageHandler
    {
        // Umbral para archivos grandes (50 MB)
        private const long LargeFileSizeThreshold = 50 * 1024 * 1024;

        // Flag para generar import map solo una vez
        private static bool _importMapGenerated = false;

        /// <summary>
        /// Reset the import map flag (call at start of new document processing)
        /// </summary>
        public static void ResetImportMapFlag()
        {
            _importMapGenerated = false;
        }

        /// <summary>
        /// Convert IFC to ThatOpen Fragments format using Node.js script
        /// Returns: (fragmentPath, fragmentTime, saveTime, totalTime, metadata)
        /// </summary>
        private static (string fragmentPath, int fragmentTime, int saveTime, int totalTime, string metadata) ConvertToFragments(string ifcPath)
        {
            try
            {
                string toolsPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tools");
                string scriptPath = Path.Combine(toolsPath, "ifc-to-fragments.js");

                if (!File.Exists(scriptPath))
                {
                    throw new Exception($"Script de fragmentación no encontrado: {scriptPath}");
                }

                // Generar ruta de salida
                string outputDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "resources", "ifc", "fragments");
                if (!Directory.Exists(outputDir))
                {
                    Directory.CreateDirectory(outputDir);
                }

                string fragmentFileName = $"{Path.GetFileNameWithoutExtension(ifcPath)}_{Guid.NewGuid():N}.frag";
                string fragmentPath = Path.Combine(outputDir, fragmentFileName);

                // Ejecutar script de fragmentación
                var process = new System.Diagnostics.Process();
                process.StartInfo.FileName = "node";
                process.StartInfo.Arguments = $"\"{scriptPath}\" \"{ifcPath}\" \"{fragmentPath}\"";
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.RedirectStandardOutput = true;
                process.StartInfo.RedirectStandardError = true;
                process.StartInfo.CreateNoWindow = true;
                process.StartInfo.WorkingDirectory = toolsPath;

                var output = new System.Text.StringBuilder();
                var error = new System.Text.StringBuilder();

                process.OutputDataReceived += (sender, e) => {
                    if (e.Data != null) output.AppendLine(e.Data);
                };
                process.ErrorDataReceived += (sender, e) => {
                    if (e.Data != null) error.AppendLine(e.Data);
                };

                var startTime = DateTime.Now;
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();

                if (process.ExitCode != 0)
                {
                    throw new Exception($"Error en fragmentación: {error}");
                }

                // Leer metadata
                string metadataPath = fragmentPath + ".meta.json";
                string metadata = File.Exists(metadataPath) ? File.ReadAllText(metadataPath) : "{}";

                // Parsear tiempos del metadata
                int fragmentTime = 0, saveTime = 0, totalTime = 0;
                try
                {
                    var json = System.Text.Json.JsonDocument.Parse(metadata);
                    fragmentTime = json.RootElement.GetProperty("fragmentTime").GetInt32();
                    saveTime = json.RootElement.GetProperty("saveTime").GetInt32();
                    totalTime = json.RootElement.GetProperty("totalTime").GetInt32();
                }
                catch { }

                return (fragmentPath, fragmentTime, saveTime, totalTime, metadata);
            }
            catch (Exception ex)
            {
                throw new Exception($"Error convirtiendo IFC a Fragments: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Process HTML content that contains IFC file references.
        /// Looks for https://calcpad.ifc/*.ifc URLs and ensures files exist in resources/ifc.
        /// If a referenced IFC file doesn't exist, shows an error message with details.
        /// </summary>
        private static string ProcessHtmlIfcReferences(string htmlContent)
        {
            try
            {
                string appPath = AppDomain.CurrentDomain.BaseDirectory;
                string ifcResourcePath = Path.Combine(appPath, "resources", "ifc");

                if (!Directory.Exists(ifcResourcePath))
                {
                    Directory.CreateDirectory(ifcResourcePath);
                }

                // Find all IFC file references in the HTML: https://calcpad.ifc/something.ifc
                var ifcUrlPattern = new Regex(@"https://calcpad\.ifc/([^'""\s<>]+\.ifc)", RegexOptions.IgnoreCase);
                var matches = ifcUrlPattern.Matches(htmlContent);

                if (matches.Count == 0)
                {
                    // No IFC URLs found, but still extract embeddable HTML if needed
                    return ExtractEmbeddableHtml(htmlContent);
                }

                // Check all referenced IFC files
                var missingFiles = new System.Collections.Generic.List<string>();

                foreach (Match match in matches)
                {
                    string ifcFileName = match.Groups[1].Value;
                    string ifcFilePath = Path.Combine(ifcResourcePath, ifcFileName);

                    if (!File.Exists(ifcFilePath))
                    {
                        if (!missingFiles.Contains(ifcFileName))
                            missingFiles.Add(ifcFileName);
                    }
                }

                // If any files are missing, show error
                if (missingFiles.Count > 0)
                {
                    var existingFiles = Directory.GetFiles(ifcResourcePath, "*.ifc");
                    string existingList = "";

                    if (existingFiles.Length > 0)
                    {
                        existingList = "<p style='color:#888; margin-top:10px; font-size:10px;'>Archivos IFC disponibles en resources/ifc:</p><ul style='font-size:10px; color:#888; margin:5px 0;'>";
                        foreach (var f in existingFiles.Take(10))
                        {
                            existingList += $"<li><code>{Path.GetFileName(f)}</code></li>";
                        }
                        if (existingFiles.Length > 10)
                            existingList += $"<li>... y {existingFiles.Length - 10} más</li>";
                        existingList += "</ul>";
                    }

                    string missingList = "<ul style='color:#e74c3c; margin:5px 0;'>";
                    foreach (var f in missingFiles)
                    {
                        missingList += $"<li><code>{f}</code></li>";
                    }
                    missingList += "</ul>";

                    // Log error
                    var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                    File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss}] HTML-IFC: ERROR - Missing IFC files: {string.Join(", ", missingFiles)}\n");

                    return $@"<div style='background:#1a1a2e; color:#fff; padding:20px; border-radius:8px; margin:10px 0; font-family:sans-serif;'>
                        <h3 style='color:#e74c3c; margin-top:0;'>Error: Archivo IFC no encontrado</h3>
                        <p>El HTML referencia archivo(s) IFC que no existen:</p>
                        {missingList}
                        {existingList}
                        <p style='color:#888; margin-top:15px; font-size:11px;'>
                            <b>Solución:</b> Primero cargue el archivo IFC usando:<br/>
                            <code style='background:#333; padding:3px 6px; border-radius:3px;'>@{{ifc}}C:\ruta\al\archivo.ifc@{{end ifc}}</code><br/><br/>
                            Esto copiará el archivo a resources/ifc/ con un nombre temporal.<br/>
                            Luego actualice el HTML para usar ese nombre de archivo.
                        </p>
                    </div>";
                }

                // All files exist, extract embeddable content if it's a full document
                var debugPath2 = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                File.AppendAllText(debugPath2,
                    $"[{DateTime.Now:HH:mm:ss}] HTML-IFC: All IFC files found, extracting embeddable content\n");

                // If the content is a full HTML document, extract only the embeddable parts
                return ExtractEmbeddableHtml(htmlContent);
            }
            catch (Exception ex)
            {
                return $"<div style='color: red; padding: 10px; border: 1px solid red; margin: 10px 0;'>Error procesando HTML IFC: {ex.Message}</div>";
            }
        }

        /// <summary>
        /// Extract embeddable HTML from a full HTML document.
        /// If the content is already embeddable (no DOCTYPE/html/head/body), returns it as-is.
        /// Otherwise, extracts style tags from head and content from body.
        /// </summary>
        private static string ExtractEmbeddableHtml(string htmlContent)
        {
            if (string.IsNullOrEmpty(htmlContent))
                return htmlContent;

            // Check if it's a full HTML document
            string trimmed = htmlContent.Trim();
            bool isFullDocument = trimmed.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) ||
                                  trimmed.StartsWith("<html", StringComparison.OrdinalIgnoreCase);

            if (!isFullDocument)
            {
                // Already embeddable, return as-is
                return htmlContent;
            }

            try
            {
                var result = new System.Text.StringBuilder();

                // Extract all <style> tags from head or anywhere
                var stylePattern = new Regex(@"<style[^>]*>(.*?)</style>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
                var styleMatches = stylePattern.Matches(htmlContent);
                foreach (Match match in styleMatches)
                {
                    result.AppendLine($"<style>{match.Groups[1].Value}</style>");
                }

                // Extract body content
                var bodyPattern = new Regex(@"<body[^>]*>(.*?)</body>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
                var bodyMatch = bodyPattern.Match(htmlContent);
                if (bodyMatch.Success)
                {
                    result.Append(bodyMatch.Groups[1].Value.Trim());
                }
                else
                {
                    // No body tag found, maybe there's content directly
                    // Try to extract everything after </head> and before </html>
                    var contentPattern = new Regex(@"</head>\s*(.*?)\s*</html>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
                    var contentMatch = contentPattern.Match(htmlContent);
                    if (contentMatch.Success)
                    {
                        result.Append(contentMatch.Groups[1].Value.Trim());
                    }
                    else
                    {
                        // Can't extract, return original
                        return htmlContent;
                    }
                }

                // Log extraction
                var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] ExtractEmbeddableHtml: Extracted embeddable content, {styleMatches.Count} style tags, body content length={result.Length}\n");

                return result.ToString();
            }
            catch (Exception ex)
            {
                // On any error, return original content
                var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] ExtractEmbeddableHtml: ERROR - {ex.Message}, returning original\n");
                return htmlContent;
            }
        }

        /// <summary>
        /// Process IFC block and return HTML with embedded viewer
        /// </summary>
        /// <param name="content">Path to IFC file or Base64 data</param>
        /// <param name="directive">Original directive (e.g., "@{ifc base64}")</param>
        /// <param name="wasmBasePath">Path to WASM files (relative or absolute). Use "cdn" for unpkg.com</param>
        /// <param name="outputDirectory">Output directory for generated HTML (used for large files to copy IFC alongside)</param>
        /// <returns>HTML for the IFC viewer</returns>
        public static string ProcessIfcBlock(string content, string directive, string wasmBasePath = "cdn", string outputDirectory = null)
        {
            content = content?.Trim() ?? string.Empty;

            if (string.IsNullOrEmpty(content))
            {
                return "<div class='error' style='color: red; padding: 10px; border: 1px solid red; margin: 10px 0;'>Error: No se especificó archivo IFC o datos Base64</div>";
            }

            bool isBase64 = directive.Contains("base64", StringComparison.OrdinalIgnoreCase);
            bool forceExternal = directive.Contains("external", StringComparison.OrdinalIgnoreCase);
            bool useFragments = directive.Contains("fragment", StringComparison.OrdinalIgnoreCase);

            string ifcBase64 = null;
            string fileName;
            string ifcFilePath = null;
            bool useExternalFile = false;

            // Si se solicita fragments, convertir primero
            if (useFragments && !isBase64)
            {
                // Verificar que el content es una ruta de archivo
                if (File.Exists(content))
                {
                    try
                    {
                        var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                        File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] IFC Fragment: Iniciando conversión a Fragments...\n");
                        File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] IFC Fragment: Archivo = '{content}'\n");

                        // Convertir a Fragments
                        var (fragmentPath, fragmentTime, saveTime, totalTime, metadata) = ConvertToFragments(content);

                        File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] IFC Fragment: Conversión completada\n");
                        File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] IFC Fragment: fragmentPath = '{fragmentPath}'\n");
                        File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] IFC Fragment: fragmentTime = {fragmentTime}ms\n");

                        // Copy fragment file to output directory for HTTP server access
                        string fragmentFileName = Path.GetFileName(fragmentPath);
                        if (!string.IsNullOrEmpty(outputDirectory))
                        {
                            string fragmentsDir = Path.Combine(outputDirectory, "fragments");
                            if (!Directory.Exists(fragmentsDir))
                            {
                                Directory.CreateDirectory(fragmentsDir);
                            }
                            string destPath = Path.Combine(fragmentsDir, fragmentFileName);
                            File.Copy(fragmentPath, destPath, overwrite: true);
                            File.AppendAllText(debugPath,
                                $"[{DateTime.Now:HH:mm:ss}] IFC Fragment: Copied to '{destPath}'\n");
                        }

                        // Generar visor de Fragments
                        string displayName = Path.GetFileNameWithoutExtension(content);
                        return GenerateFragmentsViewer(fragmentFileName, displayName, fragmentTime, totalTime);
                    }
                    catch (Exception ex)
                    {
                        var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                        File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] IFC Fragment: ERROR - {ex.Message}\n");
                        File.AppendAllText(debugPath,
                            $"[{DateTime.Now:HH:mm:ss}] IFC Fragment: Usando fallback a visor IFC externo\n");

                        // Fallback: forzar modo de archivo externo para archivos grandes
                        // Esto evita cargar todo el archivo en memoria
                        forceExternal = true;

                        var debugNote = $@"<!-- La fragmentación falló: {ex.Message.Split('\n')[0]} -->
<!-- Usando visor IFC con carga externa optimizada para archivos grandes -->";
                        // Continuar con flujo normal IFC (modo externo)
                    }
                }
            }

            if (isBase64)
            {
                // Content is already Base64
                ifcBase64 = content;
                fileName = "modelo.ifc";
            }
            else
            {
                // Content is a file path
                if (!File.Exists(content))
                {
                    return $"<div class='error' style='color: red; padding: 10px; border: 1px solid red; margin: 10px 0;'>Error: Archivo IFC no encontrado: {content}</div>";
                }

                try
                {
                    var fileInfo = new FileInfo(content);
                    fileName = fileInfo.Name;
                    ifcFilePath = content;

                    // Para archivos grandes o si se fuerza external, usar archivo externo
                    if (forceExternal || fileInfo.Length > LargeFileSizeThreshold)
                    {
                        useExternalFile = true;

                        // Log para debug
                        try
                        {
                            var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                            File.AppendAllText(debugPath,
                                $"[{DateTime.Now:HH:mm:ss}] IFC: Archivo grande detectado ({fileInfo.Length / 1024 / 1024} MB)\n" +
                                $"[{DateTime.Now:HH:mm:ss}] IFC: Usando modo archivo externo\n" +
                                $"[{DateTime.Now:HH:mm:ss}] IFC: outputDirectory = '{outputDirectory}'\n");
                        }
                        catch { }

                        // Si hay directorio de salida, copiar el IFC ahí
                        if (!string.IsNullOrEmpty(outputDirectory) && Directory.Exists(outputDirectory))
                        {
                            string destPath = Path.Combine(outputDirectory, fileName);
                            try
                            {
                                if (!File.Exists(destPath) || new FileInfo(destPath).Length != fileInfo.Length)
                                {
                                    File.Copy(content, destPath, true);

                                    var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                                    File.AppendAllText(debugPath,
                                        $"[{DateTime.Now:HH:mm:ss}] IFC: Archivo copiado a '{destPath}'\n");
                                }
                            }
                            catch (Exception copyEx)
                            {
                                var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                                File.AppendAllText(debugPath,
                                    $"[{DateTime.Now:HH:mm:ss}] IFC: Error copiando archivo: {copyEx.Message}\n");
                            }
                        }
                    }
                    else
                    {
                        // Archivo pequeño: usar Base64 embebido
                        byte[] ifcBytes = File.ReadAllBytes(content);
                        ifcBase64 = Convert.ToBase64String(ifcBytes);
                    }
                }
                catch (Exception ex)
                {
                    return $"<div class='error' style='color: red; padding: 10px; border: 1px solid red; margin: 10px 0;'>Error leyendo archivo IFC: {ex.Message}</div>";
                }
            }

            // Generate unique ID for this viewer instance
            string viewerId = $"ifc-viewer-{Guid.NewGuid():N}";

            if (useExternalFile)
            {
                return GenerateExternalFileViewerHtml(viewerId, fileName, ifcFilePath, wasmBasePath);
            }
            else
            {
                return GenerateViewerHtml(viewerId, ifcBase64, fileName, wasmBasePath);
            }
        }

        /// <summary>
        /// Generate standalone HTML viewer (for WPF button)
        /// </summary>
        public static string GenerateStandaloneViewer(string ifcBase64, string fileName, bool useCdn = false)
        {
            string viewerId = "ifc-viewer-main";

            // For WPF: use Virtual Host URL
            string wasmPath;
            if (useCdn)
            {
                wasmPath = "cdn";
            }
            else
            {
                // Use WebView2 Virtual Host (configured in MainWindow.xaml.cs)
                // https://calcpad.ifc/ maps to {AppInfo.Path}/resources/ifc/
                wasmPath = "https://calcpad.ifc";
            }

            return $@"<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>IFC Viewer - {fileName}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1e1e1e;
            color: #fff;
        }}
        #{viewerId} {{ width: 100% !important; height: 100% !important; position: relative; }}
        #{viewerId}-canvas {{ width: 100% !important; height: 100% !important; }}
        .ifc-viewer-container {{ width: 100% !important; height: 100% !important; margin: 0 !important; }}
        @keyframes ifc-spin {{ to {{ transform: rotate(360deg); }} }}
    </style>
</head>
<body>
    {GenerateViewerHtml(viewerId, ifcBase64, fileName, wasmPath)}
</body>
</html>";
        }

        /// <summary>
        /// Generate SIMPLE HTML viewer (minimal code, like Visor IFC.cpd)
        /// Clean code without toolbars, panels, or extra features
        /// Uses virtual host for all resources: https://calcpad.ifc/
        /// </summary>
        /// <param name="ifcFileName">Name of the IFC file in the virtual host directory</param>
        /// <param name="displayName">Display name for the file</param>
        public static string GenerateSimpleViewer(string ifcFileName, string displayName)
        {
            return $@"<!DOCTYPE html>
<html>
<head>
<style>
body {{ margin: 0; background: #1a1a1a; }}
#viewer {{ width: 100%; height: 500px; }}
canvas {{ width: 100%; height: 100%; }}
.loading {{ position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #4fc3f7; font-family: Arial; text-align: center; }}
.loading .spinner {{ border: 3px solid #333; border-top: 3px solid #4fc3f7; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px; }}
@keyframes spin {{ 0% {{ transform: rotate(0deg); }} 100% {{ transform: rotate(360deg); }} }}
</style>
</head>
<body>

<div id=""viewer"">
    <canvas id=""canvas""></canvas>
    <div class=""loading"" id=""loading"">
        <div class=""spinner""></div>
        <div id=""status"">Detectando entorno...</div>
    </div>
</div>

<script>
// Detectar si estamos en WPF (virtual host) o CLI (localhost/CDN)
const isWpf = window.location.hostname === 'calcpad.ifc';

// URLs de librerias segun el entorno
const libs = {{
    three: isWpf ? 'https://calcpad.ifc/three.min.js' : 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
    orbit: isWpf ? 'https://calcpad.ifc/OrbitControls.js' : 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
    webifc: isWpf ? 'https://calcpad.ifc/web-ifc-api-iife.js' : 'https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/web-ifc-api-iife.js'
}};

// Cargar script dinamicamente
function loadScript(url) {{
    return new Promise((resolve, reject) => {{
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    }});
}}

// Iniciar carga
(async () => {{
    const loading = document.getElementById('loading');
    const status = document.getElementById('status');

    try {{
        status.textContent = 'Cargando Three.js (' + (isWpf ? 'WPF' : 'CDN') + ')...';
        await loadScript(libs.three);

        status.textContent = 'Cargando OrbitControls...';
        await loadScript(libs.orbit);

        status.textContent = 'Cargando web-ifc...';
        await loadScript(libs.webifc);

        // ============ VISOR IFC ============
        const canvas = document.getElementById('canvas');
        const container = document.getElementById('viewer');

        // ESCENA
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);

        // CAMARA
        const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
        camera.position.set(20, 20, 20);

        // RENDERER
        const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
        renderer.setSize(container.clientWidth, container.clientHeight);

        // CONTROLES
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // LUCES
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const luz = new THREE.DirectionalLight(0xffffff, 0.8);
        luz.position.set(50, 100, 50);
        scene.add(luz);

        // GRID
        scene.add(new THREE.GridHelper(50, 50, 0x444444, 0x333333));

        // CARGAR IFC
        status.textContent = 'Inicializando web-ifc...';
        const ifcApi = new WebIFC.IfcAPI();

        // Configurar WASM segun entorno
        if (isWpf) {{
            await ifcApi.Init(p => p.endsWith('.wasm') ? 'https://calcpad.ifc/' + p : p);
        }} else {{
            await ifcApi.Init();
        }}

        status.textContent = 'Cargando modelo IFC...';
        // URL del modelo segun entorno
        const ifcUrl = isWpf ? 'https://calcpad.ifc/{ifcFileName}' : '{ifcFileName}';
        const response = await fetch(ifcUrl);

        if (!response.ok) {{
            throw new Error('No se encontro el archivo IFC (' + response.status + ')');
        }}

        const data = await response.arrayBuffer();
        const modelID = ifcApi.OpenModel(new Uint8Array(data));
        const flatMeshes = ifcApi.LoadAllGeometry(modelID);

        // CONVERTIR IFC A THREE.JS
        status.textContent = 'Procesando geometria...';
        const grupo = new THREE.Group();

        for (let i = 0; i < flatMeshes.size(); i++) {{
            const fm = flatMeshes.get(i);
            for (let j = 0; j < fm.geometries.size(); j++) {{
                const pg = fm.geometries.get(j);
                const geom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);
                const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                const indices = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

                if (!verts.length || !indices.length) continue;

                const positions = new Float32Array(verts.length / 2);
                for (let k = 0; k < verts.length; k += 6) {{
                    const n = (k / 6) * 3;
                    positions[n] = verts[k];
                    positions[n + 1] = verts[k + 1];
                    positions[n + 2] = verts[k + 2];
                }}

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setIndex(new THREE.BufferAttribute(indices, 1));
                geometry.computeVertexNormals();

                const material = new THREE.MeshPhongMaterial({{
                    color: new THREE.Color(pg.color.x, pg.color.y, pg.color.z),
                    side: THREE.DoubleSide,
                    transparent: pg.color.w < 1,
                    opacity: pg.color.w
                }});

                const mesh = new THREE.Mesh(geometry, material);
                mesh.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
                grupo.add(mesh);
            }}
        }}

        scene.add(grupo);
        ifcApi.CloseModel(modelID);

        // CENTRAR VISTA
        const box = new THREE.Box3().setFromObject(grupo);
        const center = box.getCenter(new THREE.Vector3());
        const size = Math.max(...box.getSize(new THREE.Vector3()).toArray());

        camera.position.set(center.x + size, center.y + size, center.z + size);
        controls.target.copy(center);
        controls.update();

        loading.style.display = 'none';

        // ANIMACION
        function animate() {{
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }}
        animate();

    }} catch (error) {{
        loading.innerHTML = '<div style=""color: #e74c3c;"">Error: ' + error.message + '</div>' +
            '<div style=""color: #888; font-size: 12px; margin-top: 10px;"">' +
            'Entorno: ' + (isWpf ? 'WPF (Virtual Host)' : 'CLI (CDN)') + '<br>' +
            'Coloca el archivo IFC en el mismo directorio.</div>';
    }}
}})();
</script>

</body>
</html>";
        }

        /// <summary>
        /// Generate HTML viewer with EMBEDDED IFC data (Base64)
        /// This allows loading IFC files from ANY location without copying them
        /// The IFC file is read as bytes and embedded directly in the HTML
        /// </summary>
        /// <param name="ifcFilePath">Full path to the IFC file</param>
        /// <param name="displayName">Display name for the file</param>
        public static string GenerateEmbeddedViewer(string ifcFilePath, string displayName)
        {
            // Read IFC file and convert to Base64
            byte[] ifcBytes = File.ReadAllBytes(ifcFilePath);
            string ifcBase64 = Convert.ToBase64String(ifcBytes);
            long fileSizeMB = ifcBytes.Length / (1024 * 1024);

            return $@"<!DOCTYPE html>
<html>
<head>
<style>
body {{ margin: 0; background: #1a1a1a; }}
#viewer {{ width: 100%; height: 500px; }}
canvas {{ width: 100%; height: 100%; }}
.loading {{ position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #4fc3f7; font-family: Arial; text-align: center; }}
.loading .spinner {{ border: 3px solid #333; border-top: 3px solid #4fc3f7; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px; }}
@keyframes spin {{ 0% {{ transform: rotate(0deg); }} 100% {{ transform: rotate(360deg); }} }}
.info {{ position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 5px; font-family: Arial; font-size: 12px; color: #888; }}
</style>
</head>
<body>

<div id=""viewer"">
    <canvas id=""canvas""></canvas>
    <div class=""loading"" id=""loading"">
        <div class=""spinner""></div>
        <div id=""status"">Cargando...</div>
    </div>
    <div class=""info"">
        <div style=""color: #4fc3f7; font-weight: bold;"">{displayName}</div>
        <div>Tamaño: {fileSizeMB} MB (embebido)</div>
    </div>
</div>

<script>
// IFC embebido como Base64 - NO necesita copiar archivos
const ifcBase64 = '{ifcBase64}';

// Detectar entorno
const isWpf = window.location.hostname === 'calcpad.ifc';

// URLs de librerias
const libs = {{
    three: isWpf ? 'https://calcpad.ifc/three.min.js' : 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
    orbit: isWpf ? 'https://calcpad.ifc/OrbitControls.js' : 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
    webifc: isWpf ? 'https://calcpad.ifc/web-ifc-api-iife.js' : 'https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/web-ifc-api-iife.js'
}};

function loadScript(url) {{
    return new Promise((resolve, reject) => {{
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    }});
}}

// Convertir Base64 a ArrayBuffer
function base64ToArrayBuffer(base64) {{
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {{
        bytes[i] = binaryString.charCodeAt(i);
    }}
    return bytes;
}}

(async () => {{
    const status = document.getElementById('status');
    const loading = document.getElementById('loading');

    try {{
        status.textContent = 'Cargando Three.js...';
        await loadScript(libs.three);
        await loadScript(libs.orbit);

        status.textContent = 'Cargando web-ifc...';
        await loadScript(libs.webifc);

        const canvas = document.getElementById('canvas');
        const container = document.getElementById('viewer');

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);

        const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
        camera.position.set(20, 20, 20);

        const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
        renderer.setSize(container.clientWidth, container.clientHeight);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const luz = new THREE.DirectionalLight(0xffffff, 0.8);
        luz.position.set(50, 100, 50);
        scene.add(luz);
        scene.add(new THREE.GridHelper(50, 50, 0x444444, 0x333333));

        status.textContent = 'Inicializando web-ifc...';
        const ifcApi = new WebIFC.IfcAPI();
        if (isWpf) {{
            await ifcApi.Init(p => p.endsWith('.wasm') ? 'https://calcpad.ifc/' + p : p);
        }} else {{
            await ifcApi.Init();
        }}

        status.textContent = 'Decodificando IFC embebido...';
        const ifcData = base64ToArrayBuffer(ifcBase64);

        status.textContent = 'Procesando modelo IFC...';
        const modelID = ifcApi.OpenModel(ifcData);
        const flatMeshes = ifcApi.LoadAllGeometry(modelID);

        status.textContent = 'Generando geometria 3D...';
        const grupo = new THREE.Group();

        for (let i = 0; i < flatMeshes.size(); i++) {{
            const fm = flatMeshes.get(i);
            for (let j = 0; j < fm.geometries.size(); j++) {{
                const pg = fm.geometries.get(j);
                const geom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);
                const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                const indices = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

                if (!verts.length || !indices.length) continue;

                const positions = new Float32Array(verts.length / 2);
                for (let k = 0; k < verts.length; k += 6) {{
                    const n = (k / 6) * 3;
                    positions[n] = verts[k];
                    positions[n + 1] = verts[k + 1];
                    positions[n + 2] = verts[k + 2];
                }}

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setIndex(new THREE.BufferAttribute(indices, 1));
                geometry.computeVertexNormals();

                const material = new THREE.MeshPhongMaterial({{
                    color: new THREE.Color(pg.color.x, pg.color.y, pg.color.z),
                    side: THREE.DoubleSide,
                    transparent: pg.color.w < 1,
                    opacity: pg.color.w
                }});

                const mesh = new THREE.Mesh(geometry, material);
                mesh.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
                grupo.add(mesh);
            }}
        }}

        scene.add(grupo);
        ifcApi.CloseModel(modelID);

        const box = new THREE.Box3().setFromObject(grupo);
        const center = box.getCenter(new THREE.Vector3());
        const size = Math.max(...box.getSize(new THREE.Vector3()).toArray());

        camera.position.set(center.x + size, center.y + size, center.z + size);
        controls.target.copy(center);
        controls.update();

        loading.style.display = 'none';

        function animate() {{
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }}
        animate();

    }} catch (error) {{
        loading.innerHTML = '<div style=""color: #e74c3c;"">Error: ' + error.message + '</div>';
    }}
}})();
</script>

</body>
</html>";
        }

        /// <summary>
        /// Generate HTML viewer that loads IFC file from virtual host
        /// Uses virtual host for all resources: https://calcpad.ifc/
        /// </summary>
        /// <param name="ifcFileName">Name of the IFC file in the virtual host directory (e.g., "temp_xxx.ifc")</param>
        /// <param name="displayName">Display name for the file</param>
        public static string GenerateFileBasedViewer(string ifcFileName, string displayName)
        {
            string viewerId = "ifc-viewer-main";

            // Use virtual host for all resources (configured in MainWindow.xaml.cs)
            // https://calcpad.ifc/ maps to {AppInfo.Path}/resources/ifc/
            string libsBase = "https://calcpad.ifc";
            string ifcUrl = $"https://calcpad.ifc/{ifcFileName}";

            return $@"<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>IFC Viewer - {displayName}</title>
    <style>
        /* ========== ESTILOS GENERALES - TEMA OSCURO ========== */
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a1a;
            color: #fff;
        }}
        #{viewerId} {{ width: 100%; height: 100%; position: relative; }}
        #{viewerId}-canvas {{ width: 100%; height: 100%; }}
        @keyframes ifc-spin {{ to {{ transform: rotate(360deg); }} }}
        .progress-bar {{
            width: 200px;
            height: 6px;
            background: #333;
            border-radius: 3px;
            margin-top: 10px;
            overflow: hidden;
        }}
        .progress-bar-fill {{
            height: 100%;
            background: #0078d4;
            width: 0%;
            transition: width 0.3s;
        }}
        /* ========== TOOLBAR PRINCIPAL ========== */
        .toolbar {{
            position: absolute;
            top: 8px;
            left: 10px;
            right: 10px;
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 4px;
            background: rgba(0,0,0,0.85);
            padding: 6px 10px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            z-index: 100;
        }}
        .toolbar button {{
            background: #2c3e50;
            color: #fff;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.2s;
        }}
        .toolbar button:hover {{ background: #34495e; border-color: #0078d4; }}
        .toolbar button.active {{ background: #0078d4; color: white; border-color: #0078d4; }}
        .toolbar-separator {{ width: 1px; background: #555; margin: 0 4px; }}
        /* ========== PANEL DE FILTROS ========== */
        .filters-panel {{
            position: absolute;
            top: 55px;
            left: 10px;
            background: rgba(0,0,0,0.85);
            padding: 10px 12px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            font-size: 11px;
            z-index: 100;
            min-width: 140px;
        }}
        .filters-panel .title {{ color: #4fc3f7; font-weight: 600; margin-bottom: 8px; font-size: 12px; }}
        .filters-panel label {{ display: flex; align-items: center; gap: 6px; margin: 4px 0; cursor: pointer; color: #ddd; }}
        .filters-panel input[type=""checkbox""] {{ accent-color: #0078d4; }}
        /* ========== PANEL DE NIVELES ========== */
        .levels-panel {{
            position: absolute;
            top: 55px;
            right: 10px;
            background: rgba(0,0,0,0.85);
            padding: 10px 12px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            font-size: 11px;
            z-index: 100;
            min-width: 120px;
        }}
        .levels-panel .title {{ color: #4fc3f7; font-weight: 600; margin-bottom: 8px; font-size: 12px; }}
        .level-nav {{ display: flex; align-items: center; gap: 8px; margin-top: 6px; }}
        .level-nav button {{ background: #2c3e50; border: 1px solid #444; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 14px; color: #fff; }}
        .level-nav button:hover {{ background: #34495e; }}
        .level-display {{ font-weight: 600; color: #fff; min-width: 60px; text-align: center; }}
        /* ========== PANEL DE CORTE ========== */
        .clipping-panel {{
            position: absolute;
            bottom: 80px;
            right: 10px;
            background: rgba(0,0,0,0.85);
            padding: 10px 12px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            font-size: 11px;
            z-index: 100;
            min-width: 180px;
        }}
        .clipping-panel .title {{ color: #4fc3f7; font-weight: 600; margin-bottom: 8px; font-size: 12px; }}
        .clipping-panel label {{ display: block; margin: 6px 0 2px; color: #aaa; }}
        .clipping-panel input[type=""range""] {{ width: 100%; accent-color: #0078d4; }}
        .clipping-panel .axis-btns {{ display: flex; gap: 4px; margin-bottom: 8px; }}
        .clipping-panel .axis-btns button {{ flex: 1; padding: 4px 8px; font-size: 10px; }}
        /* ========== COORDENADAS Y INFO ========== */
        .coords-display {{
            position: absolute;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.85);
            color: #4fc3f7;
            padding: 6px 16px;
            border-radius: 6px;
            font-family: 'Consolas', monospace;
            font-size: 11px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }}
        .line-info {{
            position: absolute;
            bottom: 45px;
            left: 50%;
            transform: translateX(-50%);
            background: #0078d4;
            color: white;
            padding: 5px 14px;
            border-radius: 6px;
            font-family: 'Consolas', monospace;
            font-size: 11px;
            display: none;
        }}
        .snap-indicator {{
            position: absolute;
            padding: 3px 8px;
            background: #f1c40f;
            color: #000;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            pointer-events: none;
            display: none;
            z-index: 150;
        }}
        /* ========== INFO PANEL ========== */
        .info-panel {{
            position: absolute;
            top: 55px;
            left: 160px;
            background: rgba(0,0,0,0.85);
            color: #fff;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }}
        /* ========== CONTROLES INFO ========== */
        .controls-info {{
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(0,0,0,0.85);
            color: #ddd;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }}
        .controls-info p {{ margin: 2px 0; }}
        .controls-info span {{ background: #444; padding: 2px 6px; border-radius: 3px; font-family: monospace; color: #fff; }}
        /* ========== PANEL DE SELECCION ========== */
        .selection-panel {{
            position: absolute;
            bottom: 60px;
            right: 10px;
            background: rgba(0,0,0,0.9);
            padding: 12px 15px;
            border-radius: 8px;
            font-size: 11px;
            z-index: 100;
            min-width: 180px;
            border: 1px solid #27ae60;
            box-shadow: 0 4px 15px rgba(39,174,96,0.3);
        }}
        .selection-panel .title {{ color: #27ae60; font-weight: 600; margin-bottom: 8px; font-size: 12px; border-bottom: 1px solid #333; padding-bottom: 5px; }}
        .selection-panel .sel-tipo {{ color: #fff; font-size: 14px; font-weight: 600; margin-bottom: 6px; }}
        .selection-panel .sel-info {{ color: #aaa; font-size: 10px; margin-bottom: 10px; }}
        .selection-panel .sel-info div {{ margin: 3px 0; }}
        .selection-panel .sel-btn {{
            width: 100%;
            padding: 6px 10px;
            background: #c0392b;
            border: none;
            color: #fff;
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
        }}
        .selection-panel .sel-btn:hover {{ background: #e74c3c; }}
        /* ========== PANEL DE TRANSPARENCIA ========== */
        .transparency-panel {{
            position: absolute;
            top: 55px;
            left: 160px;
            background: rgba(0,0,0,0.85);
            padding: 10px 12px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            font-size: 11px;
            z-index: 100;
            min-width: 160px;
            display: none;
        }}
        .transparency-panel .title {{ color: #9b59b6; font-weight: 600; margin-bottom: 8px; font-size: 12px; }}
        .transparency-panel .trans-row {{ display: flex; align-items: center; gap: 8px; margin: 6px 0; }}
        .transparency-panel .trans-row label {{ flex: 1; color: #ddd; }}
        .transparency-panel .trans-row input {{ width: 80px; accent-color: #9b59b6; }}
        .transparency-panel button {{ width: 100%; padding: 6px; margin-top: 8px; background: #555; border: none; color: #fff; border-radius: 4px; cursor: pointer; font-size: 10px; }}
        /* ========== PANEL DE MODELO ANALITICO ========== */
        .analytic-panel {{
            position: absolute;
            top: 200px;
            right: 10px;
            background: rgba(0,0,0,0.85);
            padding: 10px 12px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            font-size: 11px;
            z-index: 100;
            min-width: 180px;
            border: 1px solid #8e44ad;
            display: none;
        }}
        .analytic-panel .title {{ color: #8e44ad; font-weight: 600; margin-bottom: 8px; font-size: 12px; border-bottom: 1px solid #333; padding-bottom: 5px; }}
        .analytic-panel .stat-row {{ display: flex; justify-content: space-between; padding: 3px 0; }}
        .analytic-panel .stat-row .lbl {{ color: #888; }}
        .analytic-panel .stat-row .val {{ color: #9b59b6; font-weight: bold; }}
        .analytic-panel .toggle-row {{ display: flex; gap: 10px; margin: 8px 0; }}
        .analytic-panel .toggle-row label {{ display: flex; align-items: center; gap: 5px; color: #ddd; }}
        .analytic-panel button {{ width: 100%; padding: 6px; margin-top: 6px; border: none; color: #fff; border-radius: 4px; cursor: pointer; font-size: 10px; }}
        .analytic-panel button.purple {{ background: #8e44ad; }}
        .analytic-panel button.red {{ background: #c0392b; }}
        .analytic-panel button.blue {{ background: #0078d4; }}
    </style>
</head>
<body>
    <!-- ========== CONTENEDOR PRINCIPAL ========== -->
    <div id=""{viewerId}"" style=""width: 100%; height: 100%; position: relative; background: #1a1a1a;"">
        <canvas id=""{viewerId}-canvas"" style=""width: 100%; height: 100%;""></canvas>

        <!-- TOOLBAR PRINCIPAL -->
        <div class=""toolbar"" id=""{viewerId}-toolbar"">
            <button class=""tb-btn"" data-action=""select"" title=""Seleccionar (S)"">Seleccionar</button>
            <button class=""tb-btn"" data-action=""line"" title=""Dibujar Línea (L)"">Línea</button>
            <button class=""tb-btn"" data-action=""polyline"" title=""Polilínea (P)"">Polilínea</button>
            <span class=""toolbar-separator""></span>
            <button class=""tb-btn snap-btn"" data-action=""snap"" title=""Snap (F3)"">Snap OFF</button>
            <button class=""tb-btn ortho-btn"" data-action=""ortho"" title=""Ortho (F8)"">Ortho OFF</button>
            <button class=""tb-btn grid-btn active"" data-action=""grid"" title=""Grid (G)"">Grid</button>
            <span class=""toolbar-separator""></span>
            <button class=""tb-btn"" data-action=""top"" title=""Vista Planta"">Planta</button>
            <button class=""tb-btn"" data-action=""front"" title=""Vista Frontal"">Frontal</button>
            <button class=""tb-btn"" data-action=""right"" title=""Vista Derecha"">Derecha</button>
            <button class=""tb-btn"" data-action=""3d"" title=""Vista 3D"">3D</button>
            <button class=""tb-btn"" data-action=""fit"" title=""Fit to View (F)"">Fit</button>
            <span class=""toolbar-separator""></span>
            <button class=""tb-btn"" data-action=""undo"" title=""Deshacer (Ctrl+Z)"">Deshacer</button>
            <button class=""tb-btn"" data-action=""clear"" title=""Limpiar Dibujo"">Limpiar</button>
            <span class=""toolbar-separator""></span>
            <button class=""tb-btn trans-btn"" data-action=""transparency"" title=""Transparencia (T)"">Transparencia</button>
            <button class=""tb-btn analytic-btn"" data-action=""auto-analytic"" title=""Generar Modelo Analítico (A)"" style=""background:#8e44ad"">Auto Analítico</button>
            <button class=""tb-btn divide-btn"" data-action=""toggle-divide"" title=""Dividir/Unir columnas por piso (D)"" style=""background:#2980b9"">Dividir</button>
            <button class=""tb-btn model-btn"" data-action=""show-model"" title=""Ver Modelo Analítico (M)"">Modelo</button>
            <span class=""toolbar-separator""></span>
            <button class=""tb-btn"" data-action=""copy-html"" title=""Copiar HTML al portapapeles"" style=""background:#16a085"">Copiar HTML</button>
            <button class=""tb-btn"" data-action=""update-editor"" title=""Actualizar código en el editor (Ctrl+U)"" style=""background:#e67e22"">Actualizar Editor</button>
        </div>

        <!-- PANEL DE FILTROS -->
        <div class=""filters-panel"" id=""{viewerId}-filters"">
            <div class=""title"">Filtrar Elementos</div>
            <label><input type=""checkbox"" class=""filter-cb"" data-type=""WALL"" checked> Muros</label>
            <label><input type=""checkbox"" class=""filter-cb"" data-type=""SLAB"" checked> Losas</label>
            <label><input type=""checkbox"" class=""filter-cb"" data-type=""COLUMN"" checked> Columnas</label>
            <label><input type=""checkbox"" class=""filter-cb"" data-type=""BEAM"" checked> Vigas</label>
            <label><input type=""checkbox"" class=""filter-cb"" data-type=""WINDOW"" checked> Ventanas</label>
            <label><input type=""checkbox"" class=""filter-cb"" data-type=""DOOR"" checked> Puertas</label>
            <label><input type=""checkbox"" class=""filter-cb"" data-type=""OTHER"" checked> Otros</label>
        </div>

        <!-- PANEL DE NIVELES -->
        <div class=""levels-panel"" id=""{viewerId}-levels"">
            <div class=""title"">Niveles</div>
            <div class=""level-nav"">
                <button id=""{viewerId}-level-up"" title=""Nivel Superior"">▲</button>
                <span class=""level-display"" id=""{viewerId}-level-display"">Todos</span>
                <button id=""{viewerId}-level-down"" title=""Nivel Inferior"">▼</button>
            </div>
        </div>

        <!-- PANEL DE CORTE -->
        <div class=""clipping-panel"" id=""{viewerId}-clipping"">
            <div class=""title"">Plano de Corte</div>
            <div class=""axis-btns"">
                <button class=""tb-btn clip-axis"" data-axis=""x"">X</button>
                <button class=""tb-btn clip-axis"" data-axis=""y"">Y</button>
                <button class=""tb-btn clip-axis"" data-axis=""z"">Z</button>
                <button class=""tb-btn clip-axis"" data-axis=""none"">OFF</button>
            </div>
            <label>Posición: <span id=""{viewerId}-clip-value"">0</span></label>
            <input type=""range"" id=""{viewerId}-clip-slider"" min=""-100"" max=""100"" value=""0"">
        </div>

        <!-- INFO PANEL -->
        <div class=""info-panel"" id=""{viewerId}-info"">
            <strong>{displayName}</strong>
            <div id=""{viewerId}-stats""></div>
        </div>

        <!-- LOADING SPINNER -->
        <div id=""{viewerId}-loading"" style=""position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff; background: rgba(0,0,0,0.9); padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);"">
            <div style=""width: 50px; height: 50px; border: 3px solid #333; border-top-color: #0078d4; border-radius: 50%; animation: ifc-spin 1s linear infinite; margin: 0 auto;""></div>
            <p style=""margin-top: 15px;"" id=""{viewerId}-status"">Cargando archivo IFC...</p>
            <div class=""progress-bar""><div class=""progress-bar-fill"" id=""{viewerId}-progress""></div></div>
        </div>

        <!-- COORDENADAS -->
        <div class=""coords-display"" id=""{viewerId}-coords"">X: 0.00 Y: 0.00 Z: 0.00</div>
        <div class=""line-info"" id=""{viewerId}-lineinfo"">Longitud: 0.00</div>
        <div class=""snap-indicator"" id=""{viewerId}-snap-indicator""></div>

        <!-- PANEL DE SELECCIÓN -->
        <div class=""selection-panel"" id=""{viewerId}-selection"" style=""display: none;"">
            <div class=""title"">Elemento Seleccionado</div>
            <div id=""{viewerId}-sel-tipo"" class=""sel-tipo"">-</div>
            <div id=""{viewerId}-sel-info"" class=""sel-info""></div>
            <button id=""{viewerId}-sel-deselect"" class=""sel-btn"">Deseleccionar (Esc)</button>
        </div>

        <!-- PANEL DE TRANSPARENCIA -->
        <div class=""transparency-panel"" id=""{viewerId}-transparency"">
            <div class=""title"">Transparencia</div>
            <div class=""trans-row""><label>Muros</label><input type=""range"" class=""trans-slider"" data-type=""WALL"" min=""0"" max=""1"" step=""0.1"" value=""1""></div>
            <div class=""trans-row""><label>Losas</label><input type=""range"" class=""trans-slider"" data-type=""SLAB"" min=""0"" max=""1"" step=""0.1"" value=""1""></div>
            <div class=""trans-row""><label>Columnas</label><input type=""range"" class=""trans-slider"" data-type=""COLUMN"" min=""0"" max=""1"" step=""0.1"" value=""1""></div>
            <div class=""trans-row""><label>Vigas</label><input type=""range"" class=""trans-slider"" data-type=""BEAM"" min=""0"" max=""1"" step=""0.1"" value=""1""></div>
            <div class=""trans-row""><label>Otros</label><input type=""range"" class=""trans-slider"" data-type=""OTHER"" min=""0"" max=""1"" step=""0.1"" value=""1""></div>
            <button id=""{viewerId}-trans-reset"">Resetear</button>
        </div>

        <!-- PANEL DE MODELO ANALITICO -->
        <div class=""analytic-panel"" id=""{viewerId}-analytic"">
            <div class=""title"">Modelo Analítico</div>
            <div class=""stat-row""><span class=""lbl"">Columnas:</span><span class=""val"" id=""{viewerId}-stat-cols"">0</span></div>
            <div class=""stat-row""><span class=""lbl"">Vigas:</span><span class=""val"" id=""{viewerId}-stat-beams"">0</span></div>
            <div class=""stat-row""><span class=""lbl"">Nodos:</span><span class=""val"" id=""{viewerId}-stat-nodes"">0</span></div>
            <div class=""stat-row""><span class=""lbl"">Long. total:</span><span class=""val"" id=""{viewerId}-stat-length"">0.00 m</span></div>
            <div class=""toggle-row"">
                <label><input type=""checkbox"" id=""{viewerId}-show-physical"" checked> Físico</label>
                <label><input type=""checkbox"" id=""{viewerId}-show-analytic"" checked> Analítico</label>
            </div>
            <button class=""purple"" id=""{viewerId}-export-model"">Exportar JSON</button>
            <button class=""red"" id=""{viewerId}-clear-model"">Limpiar</button>
        </div>

        <!-- CONTROLES INFO -->
        <div class=""controls-info"">
            <p><span>Click + Arrastrar</span> Rotar</p>
            <p><span>Scroll</span> Zoom</p>
            <p><span>F</span> Fit | <span>L</span> Línea | <span>S</span> Seleccionar</p>
        </div>
    </div>

    <!-- ========== SCRIPTS ========== -->
    <script src=""{libsBase}/three.min.js""></script>
    <script src=""{libsBase}/OrbitControls.js""></script>
    <script src=""{libsBase}/web-ifc-api-iife.js""></script>
    <script>
        (async function() {{
            // ========== CONFIGURACION DE ELEMENTOS DOM ==========
            const containerId = '{viewerId}';
            const canvas = document.getElementById(containerId + '-canvas');
            const stats = document.getElementById(containerId + '-stats');
            const loading = document.getElementById(containerId + '-loading');
            const status = document.getElementById(containerId + '-status');
            const progress = document.getElementById(containerId + '-progress');
            const container = document.getElementById(containerId);
            const coordsEl = document.getElementById(containerId + '-coords');
            const lineInfoEl = document.getElementById(containerId + '-lineinfo');
            const snapIndicator = document.getElementById(containerId + '-snap-indicator');
            const levelDisplay = document.getElementById(containerId + '-level-display');
            const clipSlider = document.getElementById(containerId + '-clip-slider');
            const clipValue = document.getElementById(containerId + '-clip-value');
            const selectionPanel = document.getElementById(containerId + '-selection');
            const selTipo = document.getElementById(containerId + '-sel-tipo');
            const selInfo = document.getElementById(containerId + '-sel-info');
            const selDeselect = document.getElementById(containerId + '-sel-deselect');

            function updateStatus(msg, pct) {{
                if (status) status.textContent = msg;
                if (progress && pct !== undefined) progress.style.width = pct + '%';
            }}

            // ========== ESTADO DE LA APLICACION ==========
            let modo = 'select';
            let snapActivo = false;
            let orthoActivo = false;
            let gridVisible = true;
            let dibujando = false;
            let puntoInicial = null;
            const snapPuntos = [];
            const lineasGroup = new THREE.Group();
            const lineasHistorial = [];
            let lineaTemporal = null;
            let modelCenter, modelMaxDim;
            const geometries = [];
            let niveles = ['Todos'];
            const nivelesY = [];  // Alturas Y de cada nivel
            let nivelActual = 0;
            let clipPlane = null;
            let clipAxis = 'none';

            // Variables para selección de elementos
            let selectedMesh = null;
            let originalMaterial = null;
            const selectMaterial = new THREE.MeshPhongMaterial({{ color: 0x00ff00, emissive: 0x003300, side: THREE.DoubleSide }});

            // Variables para modelo analítico
            const analyticGroup = new THREE.Group();
            let slabLevels = [];
            let columnCenters = [];
            let divideColumnsByFloor = true; // Si true, divide columnas por piso; si false, columnas continuas
            let analyticModel = {{
                members: [],
                nodes: [],
                nextId: 1,
                nextNodeId: 1
            }};
            const analyticColors = {{
                beam: 0xe74c3c,
                column: 0x27ae60,
                brace: 0xf39c12
            }};

            // Elementos clasificados por tipo
            const elementsByType = {{
                WALL: [],
                SLAB: [],
                COLUMN: [],
                BEAM: [],
                WINDOW: [],
                DOOR: [],
                OTHER: []
            }};

            try {{
                updateStatus('Inicializando Three.js...', 10);

                // ========== CONFIGURACION DE LA ESCENA 3D ==========
                const scene = new THREE.Scene();
                scene.background = new THREE.Color(0x1a1a1a);

                const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
                camera.position.set(50, 50, 50);

                const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
                renderer.setSize(container.clientWidth, container.clientHeight);
                renderer.setPixelRatio(window.devicePixelRatio);
                renderer.localClippingEnabled = true;

                const controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;
                controls.dampingFactor = 0.05;

                // ========== ILUMINACION ==========
                scene.add(new THREE.AmbientLight(0xffffff, 0.6));
                const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
                dirLight.position.set(50, 100, 50);
                scene.add(dirLight);

                // ========== GRID ==========
                const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x333333);
                scene.add(gridHelper);
                scene.add(lineasGroup);
                scene.add(analyticGroup);

                // ========== RAYCASTER PARA SNAP Y SELECCION ==========
                const raycaster = new THREE.Raycaster();
                const mouse = new THREE.Vector2();

                updateStatus('Descargando archivo IFC...', 20);

                // ========== CARGA DEL ARCHIVO IFC ==========
                const response = await fetch('{ifcUrl}');
                if (!response.ok) throw new Error('Error descargando archivo: ' + response.status);

                updateStatus('Leyendo datos...', 40);
                const ifcData = await response.arrayBuffer();

                updateStatus('Inicializando web-ifc...', 50);
                const ifcApi = new WebIFC.IfcAPI();
                await ifcApi.Init(function(path) {{
                    if (path.endsWith('.wasm')) {{
                        return '{libsBase}/' + path;
                    }}
                    return path;
                }});

                updateStatus('Parseando modelo IFC...', 60);
                const modelID = ifcApi.OpenModel(new Uint8Array(ifcData));

                updateStatus('Generando geometría 3D...', 70);
                const flatMeshes = ifcApi.LoadAllGeometry(modelID);

                updateStatus('Construyendo malla...', 80);
                const allMeshes = new THREE.Group();
                const nivelesSet = new Set();

                // ========== PROCESAMIENTO DE GEOMETRIA IFC ==========
                for (let i = 0; i < flatMeshes.size(); i++) {{
                    const flatMesh = flatMeshes.get(i);
                    const expressID = flatMesh.expressID;
                    const placedGeometries = flatMesh.geometries;

                    for (let j = 0; j < placedGeometries.size(); j++) {{
                        const pg = placedGeometries.get(j);
                        const geom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);

                        const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                        const indices = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

                        if (verts.length === 0 || indices.length === 0) continue;

                        const positions = new Float32Array(verts.length / 2);
                        const normals = new Float32Array(verts.length / 2);
                        for (let k = 0; k < verts.length; k += 6) {{
                            const idx = (k / 6) * 3;
                            positions[idx] = verts[k];
                            positions[idx + 1] = verts[k + 1];
                            positions[idx + 2] = verts[k + 2];
                            normals[idx] = verts[k + 3];
                            normals[idx + 1] = verts[k + 4];
                            normals[idx + 2] = verts[k + 5];
                        }}

                        const bufferGeom = new THREE.BufferGeometry();
                        bufferGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                        bufferGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                        bufferGeom.setIndex(new THREE.BufferAttribute(indices, 1));

                        const color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
                        const material = new THREE.MeshPhongMaterial({{
                            color: color,
                            side: THREE.DoubleSide,
                            transparent: pg.color.w < 1,
                            opacity: pg.color.w
                        }});

                        const meshObj = new THREE.Mesh(bufferGeom, material);
                        const matrix = new THREE.Matrix4().fromArray(pg.flatTransformation);
                        meshObj.applyMatrix4(matrix);

                        // Detectar tipo IFC
                        let ifcType = 'OTHER';
                        try {{
                            const line = ifcApi.GetLine(modelID, expressID);
                            if (line && line.constructor) {{
                                const tn = line.constructor.name.toUpperCase();
                                if (tn.includes('WALL')) ifcType = 'WALL';
                                else if (tn.includes('SLAB') || tn.includes('FLOOR')) ifcType = 'SLAB';
                                else if (tn.includes('COLUMN')) ifcType = 'COLUMN';
                                else if (tn.includes('BEAM')) ifcType = 'BEAM';
                                else if (tn.includes('WINDOW')) ifcType = 'WINDOW';
                                else if (tn.includes('DOOR')) ifcType = 'DOOR';
                            }}
                        }} catch(e) {{}}
                        meshObj.userData.ifcType = ifcType;

                        // Detectar nivel basado en posición Y
                        bufferGeom.computeBoundingBox();
                        const yPos = bufferGeom.boundingBox.min.y;
                        const nivel = Math.floor(yPos / 3); // Aproximar niveles cada 3 metros
                        meshObj.userData.nivel = nivel;
                        nivelesSet.add(nivel);

                        // Agregar puntos de snap completos (similar a modelo analítico)
                        const min = bufferGeom.boundingBox.min.clone().applyMatrix4(meshObj.matrixWorld);
                        const max = bufferGeom.boundingBox.max.clone().applyMatrix4(meshObj.matrixWorld);
                        const cen = new THREE.Vector3();
                        bufferGeom.boundingBox.getCenter(cen);
                        cen.applyMatrix4(meshObj.matrixWorld);

                        // Centro (centroide)
                        snapPuntos.push({{ pos: cen, tipo: 'Centro' }});

                        // 8 esquinas del bounding box
                        snapPuntos.push({{ pos: new THREE.Vector3(min.x, min.y, min.z), tipo: 'Esquina' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(max.x, min.y, min.z), tipo: 'Esquina' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(min.x, max.y, min.z), tipo: 'Esquina' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(max.x, max.y, min.z), tipo: 'Esquina' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(min.x, min.y, max.z), tipo: 'Esquina' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(max.x, min.y, max.z), tipo: 'Esquina' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(min.x, max.y, max.z), tipo: 'Esquina' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(max.x, max.y, max.z), tipo: 'Esquina' }});

                        // 12 puntos medios de aristas
                        snapPuntos.push({{ pos: new THREE.Vector3((min.x+max.x)/2, min.y, min.z), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3((min.x+max.x)/2, max.y, min.z), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3((min.x+max.x)/2, min.y, max.z), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3((min.x+max.x)/2, max.y, max.z), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(min.x, (min.y+max.y)/2, min.z), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(max.x, (min.y+max.y)/2, min.z), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(min.x, (min.y+max.y)/2, max.z), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(max.x, (min.y+max.y)/2, max.z), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(min.x, min.y, (min.z+max.z)/2), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(max.x, min.y, (min.z+max.z)/2), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(min.x, max.y, (min.z+max.z)/2), tipo: 'Medio' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(max.x, max.y, (min.z+max.z)/2), tipo: 'Medio' }});

                        // 6 centros de caras
                        snapPuntos.push({{ pos: new THREE.Vector3(min.x, cen.y, cen.z), tipo: 'Cara' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(max.x, cen.y, cen.z), tipo: 'Cara' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(cen.x, min.y, cen.z), tipo: 'Cara' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(cen.x, max.y, cen.z), tipo: 'Cara' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(cen.x, cen.y, min.z), tipo: 'Cara' }});
                        snapPuntos.push({{ pos: new THREE.Vector3(cen.x, cen.y, max.z), tipo: 'Cara' }});

                        allMeshes.add(meshObj);
                        geometries.push(meshObj);

                        // Clasificar por tipo para transparencia
                        if (elementsByType[ifcType]) {{
                            elementsByType[ifcType].push(meshObj);
                        }} else {{
                            elementsByType.OTHER.push(meshObj);
                        }}

                        // Recolectar info para modelo analítico
                        if (ifcType === 'SLAB') {{
                            slabLevels.push(max.y);
                        }}
                        if (ifcType === 'COLUMN') {{
                            columnCenters.push({{
                                x: cen.x,
                                z: cen.z,
                                minY: min.y,
                                maxY: max.y
                            }});
                        }}
                    }}
                }}

                scene.add(allMeshes);

                // Deduplicar y ordenar niveles de losa
                slabLevels = [...new Set(slabLevels.map(y => Math.round(y * 100) / 100))].sort((a, b) => a - b);
                console.log('Niveles de losa detectados:', slabLevels);
                console.log('Centros de columnas:', columnCenters.length);

                // Configurar niveles con sus alturas Y
                const nivelesOrdenados = Array.from(nivelesSet).sort((a,b) => a-b);
                niveles = ['Todos', ...nivelesOrdenados.map(n => 'Nivel ' + n)];

                // Guardar las alturas Y de cada nivel (para la navegación)
                nivelesOrdenados.forEach(n => {{
                    nivelesY.push(n * 3); // Cada nivel está a n*3 metros
                }});

                if (levelDisplay) levelDisplay.textContent = niveles[0];
                console.log('Niveles detectados:', niveles, 'Alturas Y:', nivelesY);

                // ========== AJUSTE AUTOMATICO DE VISTA ==========
                updateStatus('Ajustando vista...', 90);
                const box = new THREE.Box3().setFromObject(allMeshes);
                modelCenter = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                modelMaxDim = Math.max(size.x, size.y, size.z);

                camera.position.set(modelCenter.x + modelMaxDim, modelCenter.y + modelMaxDim, modelCenter.z + modelMaxDim);
                controls.target.copy(modelCenter);
                controls.update();

                // Configurar slider de corte
                if (clipSlider) {{
                    clipSlider.min = -modelMaxDim;
                    clipSlider.max = modelMaxDim;
                    clipSlider.value = 0;
                }}

                if (loading) loading.style.display = 'none';
                if (stats) stats.innerHTML = '<br>' + geometries.length + ' elementos';

                ifcApi.CloseModel(modelID);

                // ========== FUNCIONES DE VISTAS ==========
                function setView(view) {{
                    const c = modelCenter, d = modelMaxDim * 1.5;
                    camera.up.set(0, 1, 0); // Reset up vector
                    switch(view) {{
                        case 'top':
                            camera.position.set(c.x, c.y + d, c.z);
                            camera.up.set(0, 0, -1);
                            // Aplicar corte horizontal automático si hay un nivel seleccionado
                            if (nivelActual > 0 && niveles[nivelActual] !== 'Todos') {{
                                const nivelY = nivelesY[nivelActual - 1] || c.y;
                                camera.position.set(c.x, nivelY + d/2, c.z);
                                controls.target.set(c.x, nivelY, c.z);
                            }} else {{
                                controls.target.copy(c);
                            }}
                            break;
                        case 'front':
                            camera.position.set(c.x, c.y, c.z + d);
                            controls.target.copy(c);
                            break;
                        case 'right':
                            camera.position.set(c.x + d, c.y, c.z);
                            controls.target.copy(c);
                            break;
                        case '3d':
                            camera.position.set(c.x + d*0.8, c.y + d*0.8, c.z + d*0.8);
                            controls.target.copy(c);
                            break;
                    }}
                    controls.update();
                }}

                function fitView() {{
                    camera.position.set(modelCenter.x + modelMaxDim, modelCenter.y + modelMaxDim, modelCenter.z + modelMaxDim);
                    controls.target.copy(modelCenter);
                    controls.update();
                }}

                // ========== FILTROS POR TIPO ==========
                function aplicarFiltros() {{
                    document.querySelectorAll('.filter-cb').forEach(cb => {{
                        const tipo = cb.dataset.type;
                        const visible = cb.checked;
                        geometries.forEach(m => {{
                            if (m.userData.ifcType === tipo && m.userData.nivelVisible !== false) {{
                                m.visible = visible;
                            }}
                        }});
                    }});
                }}

                // ========== FILTROS POR NIVEL ==========
                function aplicarNivel() {{
                    const nivelSeleccionado = niveles[nivelActual];
                    console.log('Aplicando nivel:', nivelSeleccionado, 'nivelActual:', nivelActual);

                    if (nivelSeleccionado === 'Todos') {{
                        // Mostrar todos los elementos
                        geometries.forEach(m => {{
                            m.userData.nivelVisible = true;
                            m.visible = true;
                        }});
                        // Quitar corte
                        clipAxis = 'none';
                        aplicarCorte();
                        // Actualizar botones de corte
                        document.querySelectorAll('.clip-axis').forEach(b => b.classList.remove('active'));
                    }} else {{
                        const nivelNum = parseInt(nivelSeleccionado.replace('Nivel ', ''));
                        const nivelY = nivelesY[nivelActual - 1];
                        console.log('Nivel num:', nivelNum, 'nivelY:', nivelY, 'nivelesY:', nivelesY);

                        // Mostrar solo elementos de este nivel
                        geometries.forEach(m => {{
                            const enNivel = m.userData.nivel === nivelNum;
                            m.userData.nivelVisible = enNivel;
                            m.visible = enNivel;
                        }});

                        // Aplicar corte horizontal automático en Y (para ver planta del nivel)
                        if (nivelY !== undefined && modelMaxDim) {{
                            clipAxis = 'y';
                            // Convertir la altura del corte al valor del slider (-100 a 100)
                            // El corte debe estar 3m arriba del nivel actual
                            const cortePosY = nivelY + 3;
                            const offsetFromCenter = cortePosY - modelCenter.y;
                            const sliderValue = (offsetFromCenter / modelMaxDim) * 100;
                            if (clipSlider) {{
                                clipSlider.value = Math.min(100, Math.max(-100, sliderValue));
                            }}
                            aplicarCorte();
                            // Marcar botón Y como activo
                            document.querySelectorAll('.clip-axis').forEach(b => {{
                                b.classList.toggle('active', b.dataset.axis === 'y');
                            }});
                        }}
                    }}
                    aplicarFiltros();
                    if (levelDisplay) levelDisplay.textContent = nivelSeleccionado;
                }}

                // ========== PLANO DE CORTE ==========
                function aplicarCorte() {{
                    if (clipAxis === 'none') {{
                        geometries.forEach(m => {{
                            m.material.clippingPlanes = [];
                            m.material.needsUpdate = true;
                        }});
                        if (clipValue) clipValue.textContent = 'OFF';
                        return;
                    }}

                    // El slider va de -100 a 100, lo mapeamos al rango del modelo
                    const sliderVal = parseFloat(clipSlider?.value || 0);
                    const range = modelMaxDim || 100;  // Usar dimensión máxima del modelo
                    const normalizedPos = (sliderVal / 100) * range;  // -range a +range

                    // Calcular posición absoluta del plano
                    let planePos, normal;
                    switch(clipAxis) {{
                        case 'x':
                            planePos = modelCenter.x + normalizedPos;
                            normal = new THREE.Vector3(-1, 0, 0);  // Normal negativa para cortar desde arriba/derecha
                            break;
                        case 'y':
                            planePos = modelCenter.y + normalizedPos;
                            normal = new THREE.Vector3(0, -1, 0);  // Normal negativa para cortar desde arriba
                            break;
                        case 'z':
                            planePos = modelCenter.z + normalizedPos;
                            normal = new THREE.Vector3(0, 0, -1);
                            break;
                    }}

                    // Crear plano de corte: Plane(normal, constant) donde constant = -distancia en dirección de normal
                    clipPlane = new THREE.Plane(normal, planePos);

                    geometries.forEach(m => {{
                        m.material.clippingPlanes = [clipPlane];
                        m.material.clipShadows = true;
                        m.material.needsUpdate = true;
                    }});

                    if (clipValue) clipValue.textContent = planePos.toFixed(1);
                    console.log('Corte aplicado:', clipAxis, 'pos:', planePos, 'slider:', sliderVal);
                }}

                // ========== SNAP ==========
                function encontrarSnap(sx, sy) {{
                    if (!snapActivo) return null;
                    let mejor = null, mejorD = 20;
                    snapPuntos.forEach(sp => {{
                        const p = sp.pos.clone().project(camera);
                        const px = (p.x + 1) / 2 * container.clientWidth;
                        const py = (-p.y + 1) / 2 * container.clientHeight;
                        const d = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
                        if (d < mejorD) {{ mejorD = d; mejor = sp; }}
                    }});
                    return mejor;
                }}

                function getPunto3D(e) {{
                    const rect = canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left, y = e.clientY - rect.top;
                    const sp = encontrarSnap(x, y);
                    if (sp) {{
                        snapIndicator.style.display = 'block';
                        snapIndicator.style.left = x + 'px';
                        snapIndicator.style.top = (y - 25) + 'px';
                        snapIndicator.textContent = sp.tipo;
                        return sp.pos.clone();
                    }}
                    snapIndicator.style.display = 'none';
                    mouse.x = (x / rect.width) * 2 - 1;
                    mouse.y = -(y / rect.height) * 2 + 1;
                    raycaster.setFromCamera(mouse, camera);
                    const hits = raycaster.intersectObjects(geometries);
                    if (hits.length > 0) return hits[0].point.clone();
                    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                    const pt = new THREE.Vector3();
                    raycaster.ray.intersectPlane(plano, pt);
                    return pt;
                }}

                function aplicarOrtho(ini, fin) {{
                    if (!orthoActivo || !ini) return fin;
                    const dx = Math.abs(fin.x - ini.x), dy = Math.abs(fin.y - ini.y), dz = Math.abs(fin.z - ini.z);
                    if (dx >= dy && dx >= dz) return new THREE.Vector3(fin.x, ini.y, ini.z);
                    if (dy >= dx && dy >= dz) return new THREE.Vector3(ini.x, fin.y, ini.z);
                    return new THREE.Vector3(ini.x, ini.y, fin.z);
                }}

                // ========== EVENT LISTENERS TOOLBAR ==========
                document.querySelectorAll('.tb-btn').forEach(btn => {{
                    btn.addEventListener('click', () => {{
                        const a = btn.dataset.action;
                        if (a === 'select') {{ modo = 'select'; controls.enabled = true; }}
                        else if (a === 'line') {{ modo = 'line'; controls.enabled = false; puntoInicial = null; }}
                        else if (a === 'polyline') {{ modo = 'polyline'; controls.enabled = false; }}
                        else if (a === 'snap') {{
                            snapActivo = !snapActivo;
                            btn.textContent = snapActivo ? 'Snap ON' : 'Snap OFF';
                            btn.classList.toggle('active', snapActivo);
                        }}
                        else if (a === 'ortho') {{
                            orthoActivo = !orthoActivo;
                            btn.textContent = orthoActivo ? 'Ortho ON' : 'Ortho OFF';
                            btn.classList.toggle('active', orthoActivo);
                        }}
                        else if (a === 'grid') {{
                            gridVisible = !gridVisible;
                            gridHelper.visible = gridVisible;
                            btn.classList.toggle('active', gridVisible);
                        }}
                        else if (a === 'top' || a === 'front' || a === 'right' || a === '3d') setView(a);
                        else if (a === 'fit') fitView();
                        else if (a === 'undo') {{
                            if (lineasHistorial.length > 0) {{
                                const ultima = lineasHistorial.pop();
                                lineasGroup.remove(ultima);
                                ultima.geometry.dispose();
                            }}
                        }}
                        else if (a === 'clear') {{
                            while (lineasHistorial.length > 0) {{
                                const l = lineasHistorial.pop();
                                lineasGroup.remove(l);
                                l.geometry.dispose();
                            }}
                        }}
                        else if (a === 'copy-html') {{
                            // Capturar estado actual del visor antes de copiar
                            // 1. Actualizar valores de sliders de transparencia en el HTML
                            document.querySelectorAll('.trans-slider').forEach(slider => {{
                                slider.setAttribute('value', slider.value);
                            }});

                            // 2. Actualizar estado de checkboxes de filtros
                            document.querySelectorAll('.filter-cb').forEach(cb => {{
                                if (cb.checked) {{
                                    cb.setAttribute('checked', 'checked');
                                }} else {{
                                    cb.removeAttribute('checked');
                                }}
                            }});

                            // 3. Guardar posición de cámara actual como atributo data
                            const viewerContainer = document.querySelector('.ifc-viewer-container');
                            if (viewerContainer && camera) {{
                                viewerContainer.setAttribute('data-camera-x', camera.position.x.toFixed(2));
                                viewerContainer.setAttribute('data-camera-y', camera.position.y.toFixed(2));
                                viewerContainer.setAttribute('data-camera-z', camera.position.z.toFixed(2));
                                viewerContainer.setAttribute('data-target-x', controls.target.x.toFixed(2));
                                viewerContainer.setAttribute('data-target-y', controls.target.y.toFixed(2));
                                viewerContainer.setAttribute('data-target-z', controls.target.z.toFixed(2));
                            }}

                            // 4. Guardar nivel actual
                            const levelDisplay = document.getElementById(containerId + '-level-display');
                            if (levelDisplay) {{
                                levelDisplay.setAttribute('data-nivel-actual', nivelActual);
                            }}

                            // 5. Guardar estado del plano de corte
                            const clipSliderEl = document.getElementById(containerId + '-clip-slider');
                            if (clipSliderEl) {{
                                clipSliderEl.setAttribute('value', clipSliderEl.value);
                                clipSliderEl.setAttribute('data-clip-axis', clipAxis || 'none');
                            }}

                            // Copiar el HTML actualizado al portapapeles
                            const htmlContent = document.documentElement.outerHTML;
                            navigator.clipboard.writeText(htmlContent).then(() => {{
                                btn.textContent = 'Copiado!';
                                btn.style.background = '#27ae60';
                                setTimeout(() => {{
                                    btn.textContent = 'Copiar HTML';
                                    btn.style.background = '#16a085';
                                }}, 2000);
                            }}).catch(err => {{
                                console.error('Error copiando HTML:', err);
                                alert('Error al copiar. Intenta de nuevo.');
                            }});
                        }}
                        else if (a === 'update-editor') {{
                            // ========== ACTUALIZAR EDITOR CON HTML COMPLETO MODIFICADO ==========
                            // Capturar el estado actual y actualizar los atributos HTML antes de enviar

                            // 1. Actualizar valores de sliders de transparencia en el HTML
                            document.querySelectorAll('.trans-slider').forEach(function(slider) {{
                                slider.setAttribute('value', slider.value);
                            }});

                            // 2. Actualizar estado de checkboxes de filtros
                            document.querySelectorAll('.filter-cb').forEach(function(cb) {{
                                if (cb.checked) {{
                                    cb.setAttribute('checked', 'checked');
                                }} else {{
                                    cb.removeAttribute('checked');
                                }}
                            }});

                            // 3. Guardar posición de cámara actual como atributo data
                            var viewerContainer = document.querySelector('.ifc-viewer-container');
                            if (viewerContainer && camera) {{
                                viewerContainer.setAttribute('data-camera-x', camera.position.x.toFixed(2));
                                viewerContainer.setAttribute('data-camera-y', camera.position.y.toFixed(2));
                                viewerContainer.setAttribute('data-camera-z', camera.position.z.toFixed(2));
                                viewerContainer.setAttribute('data-target-x', controls.target.x.toFixed(2));
                                viewerContainer.setAttribute('data-target-y', controls.target.y.toFixed(2));
                                viewerContainer.setAttribute('data-target-z', controls.target.z.toFixed(2));
                            }}

                            // 4. Guardar nivel actual
                            if (levelDisplay) {{
                                levelDisplay.setAttribute('data-nivel-actual', nivelActual);
                            }}

                            // 5. Guardar estado del plano de corte
                            var clipSliderEl = document.getElementById(containerId + '-clip-slider');
                            if (clipSliderEl) {{
                                clipSliderEl.setAttribute('value', clipSliderEl.value);
                                clipSliderEl.setAttribute('data-clip-axis', clipAxis || 'none');
                            }}

                            // 6. Obtener el HTML completo actualizado
                            var fullHtml = document.documentElement.outerHTML;

                            // Enviar HTML completo a AvalonEdit via WebView2
                            if (window.chrome && window.chrome.webview) {{
                                window.chrome.webview.postMessage({{
                                    type: 'updateEditorFull',
                                    content: fullHtml
                                }});
                                btn.textContent = 'Actualizado!';
                                btn.style.background = '#27ae60';
                                setTimeout(function() {{
                                    btn.textContent = 'Actualizar Editor';
                                    btn.style.background = '#e67e22';
                                }}, 2000);
                            }} else {{
                                // Fallback: copiar al portapapeles si no hay WebView2
                                navigator.clipboard.writeText(fullHtml).then(function() {{
                                    btn.textContent = 'Copiado!';
                                    btn.style.background = '#27ae60';
                                    alert('HTML copiado al portapapeles.');
                                    setTimeout(function() {{
                                        btn.textContent = 'Actualizar Editor';
                                        btn.style.background = '#e67e22';
                                    }}, 2000);
                                }});
                            }}
                        }}
                    }});
                }});

                // Event listeners filtros
                document.querySelectorAll('.filter-cb').forEach(cb => cb.addEventListener('change', aplicarFiltros));

                // ========== RESTAURAR ESTADO GUARDADO ==========
                // Restaurar transparencias desde atributos value guardados
                document.querySelectorAll('.trans-slider').forEach(slider => {{
                    var savedValue = slider.getAttribute('value');
                    if (savedValue && savedValue !== '1') {{
                        slider.value = savedValue;
                        var tipo = slider.dataset.type;
                        setTransparency(tipo, parseFloat(savedValue));
                    }}
                }});

                // Restaurar posición de cámara si está guardada
                var viewerContainer = document.querySelector('.ifc-viewer-container');
                if (viewerContainer) {{
                    var savedCamX = viewerContainer.getAttribute('data-camera-x');
                    var savedCamY = viewerContainer.getAttribute('data-camera-y');
                    var savedCamZ = viewerContainer.getAttribute('data-camera-z');
                    var savedTgtX = viewerContainer.getAttribute('data-target-x');
                    var savedTgtY = viewerContainer.getAttribute('data-target-y');
                    var savedTgtZ = viewerContainer.getAttribute('data-target-z');

                    if (savedCamX && savedCamY && savedCamZ && camera) {{
                        camera.position.set(parseFloat(savedCamX), parseFloat(savedCamY), parseFloat(savedCamZ));
                        if (savedTgtX && savedTgtY && savedTgtZ && controls) {{
                            controls.target.set(parseFloat(savedTgtX), parseFloat(savedTgtY), parseFloat(savedTgtZ));
                        }}
                        if (controls) controls.update();
                    }}
                }}

                // Restaurar nivel actual si está guardado
                if (levelDisplay) {{
                    var savedNivel = levelDisplay.getAttribute('data-nivel-actual');
                    if (savedNivel !== null && savedNivel !== undefined) {{
                        nivelActual = parseInt(savedNivel);
                        if (!isNaN(nivelActual)) {{
                            setTimeout(function() {{ aplicarNivel(); }}, 500);
                        }}
                    }}
                }}

                // Restaurar estado del plano de corte
                if (clipSlider) {{
                    var savedClipValue = clipSlider.getAttribute('value');
                    var savedClipAxis = clipSlider.getAttribute('data-clip-axis');
                    if (savedClipValue) clipSlider.value = savedClipValue;
                    if (savedClipAxis && savedClipAxis !== 'none') {{
                        clipAxis = savedClipAxis;
                        document.querySelectorAll('.clip-axis').forEach(function(b) {{
                            if (b.dataset.axis === clipAxis) b.classList.add('active');
                        }});
                        setTimeout(function() {{ aplicarCorte(); }}, 600);
                    }}
                }}

                // IMPORTANTE: Aplicar filtros después de cargar el modelo
                // Los checkboxes ya tienen el estado correcto desde el HTML (checked/unchecked)
                // Esto asegura que los elementos ocultos se mantengan ocultos al recargar
                setTimeout(function() {{
                    aplicarFiltros();
                    console.log('Filtros aplicados desde estado guardado');
                }}, 700);

                // Event listeners niveles
                document.getElementById(containerId + '-level-up')?.addEventListener('click', () => {{
                    if (nivelActual < niveles.length - 1) {{
                        nivelActual++;
                        aplicarNivel();
                    }}
                }});
                document.getElementById(containerId + '-level-down')?.addEventListener('click', () => {{
                    if (nivelActual > 0) {{
                        nivelActual--;
                        aplicarNivel();
                    }}
                }});

                // Event listeners corte
                document.querySelectorAll('.clip-axis').forEach(btn => {{
                    btn.addEventListener('click', () => {{
                        clipAxis = btn.dataset.axis;
                        document.querySelectorAll('.clip-axis').forEach(b => b.classList.remove('active'));
                        if (clipAxis !== 'none') btn.classList.add('active');
                        aplicarCorte();
                    }});
                }});
                clipSlider?.addEventListener('input', aplicarCorte);

                // ========== EVENTOS DE MOUSE ==========
                canvas.addEventListener('mousemove', (e) => {{
                    const pt = getPunto3D(e);
                    coordsEl.textContent = `X: ${{pt.x.toFixed(2)}} Y: ${{pt.y.toFixed(2)}} Z: ${{pt.z.toFixed(2)}}`;

                    if ((modo === 'line' || modo === 'polyline') && puntoInicial) {{
                        let fin = pt;
                        if (orthoActivo) fin = aplicarOrtho(puntoInicial, fin);
                        if (lineaTemporal) {{ lineasGroup.remove(lineaTemporal); lineaTemporal.geometry.dispose(); }}
                        const g = new THREE.BufferGeometry().setFromPoints([puntoInicial, fin]);
                        lineaTemporal = new THREE.Line(g, new THREE.LineBasicMaterial({{ color: 0xffcc00 }}));
                        lineasGroup.add(lineaTemporal);
                        const len = puntoInicial.distanceTo(fin);
                        lineInfoEl.style.display = 'block';
                        lineInfoEl.textContent = `Longitud: ${{len.toFixed(2)}}`;
                    }}
                }});

                // Función para deseleccionar elemento
                function deseleccionarElemento() {{
                    if (selectedMesh && originalMaterial) {{
                        selectedMesh.material = originalMaterial;
                    }}
                    selectedMesh = null;
                    originalMaterial = null;
                    if (selectionPanel) selectionPanel.style.display = 'none';
                }}

                // Función para seleccionar elemento
                function seleccionarElemento(mesh) {{
                    // Deseleccionar anterior
                    deseleccionarElemento();

                    // Seleccionar nuevo
                    selectedMesh = mesh;
                    originalMaterial = mesh.material;
                    mesh.material = selectMaterial;

                    // Mostrar información
                    if (selectionPanel) {{
                        selectionPanel.style.display = 'block';

                        const tipoNombre = {{
                            'WALL': 'Muro', 'SLAB': 'Losa', 'COLUMN': 'Columna',
                            'BEAM': 'Viga', 'WINDOW': 'Ventana', 'DOOR': 'Puerta',
                            'STAIR': 'Escalera', 'RAILING': 'Barandilla', 'ROOF': 'Techo',
                            'OTHER': 'Otro'
                        }};
                        const tipo = mesh.userData.ifcType || 'OTHER';
                        if (selTipo) selTipo.textContent = tipoNombre[tipo] || tipo;

                        if (selInfo) {{
                            mesh.geometry.computeBoundingBox();
                            const box = mesh.geometry.boundingBox;
                            const size = new THREE.Vector3();
                            box.getSize(size);
                            selInfo.innerHTML = `
                                <div>Nivel: ${{mesh.userData.nivel !== undefined ? mesh.userData.nivel : '-'}}</div>
                                <div>Dimensiones: ${{size.x.toFixed(2)}} × ${{size.y.toFixed(2)}} × ${{size.z.toFixed(2)}} m</div>
                            `;
                        }}
                    }}
                }}

                // Event listener para deseleccionar
                if (selDeselect) {{
                    selDeselect.addEventListener('click', deseleccionarElemento);
                }}

                canvas.addEventListener('click', (e) => {{
                    // Modo selección
                    if (modo === 'select') {{
                        const rect = canvas.getBoundingClientRect();
                        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                        raycaster.setFromCamera(mouse, camera);
                        const intersects = raycaster.intersectObjects(geometries);

                        if (intersects.length > 0) {{
                            seleccionarElemento(intersects[0].object);
                        }} else {{
                            deseleccionarElemento();
                        }}
                    }}
                    // Modo dibujo
                    else if (modo === 'line' || modo === 'polyline') {{
                        let pt = getPunto3D(e);
                        if (orthoActivo && puntoInicial) pt = aplicarOrtho(puntoInicial, pt);

                        if (!puntoInicial) {{
                            puntoInicial = pt;
                        }} else {{
                            const g = new THREE.BufferGeometry().setFromPoints([puntoInicial, pt]);
                            const linea = new THREE.Line(g, new THREE.LineBasicMaterial({{ color: 0xff6600, linewidth: 2 }}));
                            lineasGroup.add(linea);
                            lineasHistorial.push(linea);

                            if (modo === 'polyline') {{
                                puntoInicial = pt;
                            }} else {{
                                puntoInicial = null;
                                lineInfoEl.style.display = 'none';
                                if (lineaTemporal) {{ lineasGroup.remove(lineaTemporal); lineaTemporal = null; }}
                            }}
                        }}
                    }}
                }});

                // ========== TECLAS DE ACCESO RAPIDO ==========
                document.addEventListener('keydown', (e) => {{
                    if (e.key === 'f' || e.key === 'F') fitView();
                    else if (e.key === 'l' || e.key === 'L') {{ modo = 'line'; controls.enabled = false; puntoInicial = null; }}
                    else if (e.key === 's' || e.key === 'S') {{ modo = 'select'; controls.enabled = true; }}
                    else if (e.key === 'g' || e.key === 'G') {{
                        gridVisible = !gridVisible;
                        gridHelper.visible = gridVisible;
                    }}
                    else if (e.key === 'F3') {{
                        snapActivo = !snapActivo;
                        const btn = document.querySelector('.snap-btn');
                        if (btn) {{
                            btn.textContent = snapActivo ? 'Snap ON' : 'Snap OFF';
                            btn.classList.toggle('active', snapActivo);
                        }}
                    }}
                    else if (e.key === 'F8') {{
                        orthoActivo = !orthoActivo;
                        const btn = document.querySelector('.ortho-btn');
                        if (btn) {{
                            btn.textContent = orthoActivo ? 'Ortho ON' : 'Ortho OFF';
                            btn.classList.toggle('active', orthoActivo);
                        }}
                    }}
                    else if (e.key === 'Escape') {{
                        // Cancelar dibujo y deseleccionar
                        puntoInicial = null;
                        lineInfoEl.style.display = 'none';
                        if (lineaTemporal) {{ lineasGroup.remove(lineaTemporal); lineaTemporal = null; }}
                        deseleccionarElemento();
                        modo = 'select';
                        controls.enabled = true;
                    }}
                    else if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {{
                        e.preventDefault();
                        e.stopPropagation();
                        if (lineasHistorial.length > 0) {{
                            const ultima = lineasHistorial.pop();
                            lineasGroup.remove(ultima);
                            ultima.geometry.dispose();
                            console.log('Deshacer: línea eliminada, quedan', lineasHistorial.length);
                        }} else {{
                            console.log('Deshacer: no hay líneas para deshacer');
                        }}
                    }}
                }});

                // ========== FUNCIONES DE TRANSPARENCIA ==========
                function setTransparency(type, opacity) {{
                    const elems = elementsByType[type] || [];
                    elems.forEach(mesh => {{
                        mesh.material.opacity = opacity;
                        mesh.material.transparent = opacity < 1;
                        mesh.material.needsUpdate = true;
                    }});
                }}

                // ========== FUNCIONES DE MODELO ANALITICO ==========
                function findOrCreateNode(pos, tol = 0.01) {{
                    for (const node of analyticModel.nodes) {{
                        if (node.pos.distanceTo(pos) < tol) return node;
                    }}
                    const newNode = {{ id: analyticModel.nextNodeId++, pos: pos.clone(), members: [] }};
                    analyticModel.nodes.push(newNode);
                    return newNode;
                }}

                function createAnalyticMember(p1, p2, type, name, section) {{
                    const color = analyticColors[type] || 0xffffff;
                    const length = p1.distanceTo(p2);
                    if (length < 0.01) return;

                    const node1 = findOrCreateNode(p1);
                    const node2 = findOrCreateNode(p2);

                    const tubeGeom = new THREE.CylinderGeometry(0.08, 0.08, length, 8);
                    const tubeMat = new THREE.MeshBasicMaterial({{ color }});
                    const tube = new THREE.Mesh(tubeGeom, tubeMat);

                    const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
                    tube.position.copy(midPoint);

                    const direction = new THREE.Vector3().subVectors(p2, p1).normalize();
                    const up = new THREE.Vector3(0, 1, 0);
                    tube.quaternion.setFromUnitVectors(up, direction);

                    const nodeMat = new THREE.MeshBasicMaterial({{ color: 0xf1c40f }});
                    const nodeGeom = new THREE.SphereGeometry(0.12, 12, 12);

                    const sphere1 = new THREE.Mesh(nodeGeom, nodeMat);
                    sphere1.position.copy(p1);
                    const sphere2 = new THREE.Mesh(nodeGeom, nodeMat);
                    sphere2.position.copy(p2);

                    const group = new THREE.Group();
                    group.add(tube, sphere1, sphere2);
                    analyticGroup.add(group);

                    analyticModel.members.push({{
                        id: analyticModel.nextId++,
                        name, type, section, length,
                        node1: node1.id,
                        node2: node2.id,
                        color,
                        group
                    }});

                    node1.members.push(analyticModel.members[analyticModel.members.length - 1].id);
                    node2.members.push(analyticModel.members[analyticModel.members.length - 1].id);
                }}

                function updateAnalyticPanel() {{
                    const colCount = analyticModel.members.filter(m => m.type === 'column').length;
                    const beamCount = analyticModel.members.filter(m => m.type === 'beam').length;
                    const statCols = document.getElementById(containerId + '-stat-cols');
                    const statBeams = document.getElementById(containerId + '-stat-beams');
                    const statNodes = document.getElementById(containerId + '-stat-nodes');
                    const statLength = document.getElementById(containerId + '-stat-length');

                    if (statCols) statCols.textContent = colCount;
                    if (statBeams) statBeams.textContent = beamCount;
                    if (statNodes) statNodes.textContent = analyticModel.nodes.length;
                    const total = analyticModel.members.reduce((s, m) => s + m.length, 0);
                    if (statLength) statLength.textContent = total.toFixed(2) + ' m';
                }}

                function clearAnalyticModel() {{
                    while (analyticGroup.children.length) analyticGroup.remove(analyticGroup.children[0]);
                    analyticModel = {{ members: [], nodes: [], nextId: 1, nextNodeId: 1 }};
                    updateAnalyticPanel();
                }}

                function generateAutoAnalyticalModel() {{
                    clearAnalyticModel();
                    console.log('Generando modelo analítico...');
                    console.log('Columnas:', columnCenters.length, 'Niveles losa:', slabLevels);
                    console.log('Modo:', divideColumnsByFloor ? 'Columnas DIVIDIDAS por piso' : 'Columnas CONTINUAS');

                    // 1. Generar columnas - divididas por piso o continuas según configuración
                    for (const col of columnCenters) {{
                        if (divideColumnsByFloor) {{
                            // Modo DIVIDIR: Crear una columna por cada tramo entre losas
                            let prevY = col.minY;
                            for (const slabY of slabLevels) {{
                                if (slabY > col.minY && slabY < col.maxY) {{
                                    createAnalyticMember(
                                        new THREE.Vector3(col.x, prevY, col.z),
                                        new THREE.Vector3(col.x, slabY, col.z),
                                        'column',
                                        'C-' + analyticModel.nextId,
                                        '30x30'
                                    );
                                    prevY = slabY;
                                }}
                            }}
                            if (prevY < col.maxY) {{
                                createAnalyticMember(
                                    new THREE.Vector3(col.x, prevY, col.z),
                                    new THREE.Vector3(col.x, col.maxY, col.z),
                                    'column',
                                    'C-' + analyticModel.nextId,
                                    '30x30'
                                );
                            }}
                        }} else {{
                            // Modo UNIR: Una sola columna continua de base a tope
                            createAnalyticMember(
                                new THREE.Vector3(col.x, col.minY, col.z),
                                new THREE.Vector3(col.x, col.maxY, col.z),
                                'column',
                                'C-' + analyticModel.nextId,
                                '30x30'
                            );
                        }}
                    }}

                    // 2. Generar vigas divididas en centros de columnas
                    // IMPORTANTE: Las vigas se generan en la PARTE SUPERIOR (max.y)
                    // al mismo nivel que la cabeza de columna
                    for (const beamMesh of elementsByType.BEAM) {{
                        beamMesh.geometry.computeBoundingBox();
                        const beamBox = new THREE.Box3().setFromObject(beamMesh);
                        const beamCenter = beamBox.getCenter(new THREE.Vector3());
                        const beamSize = beamBox.getSize(new THREE.Vector3());

                        const isXBeam = beamSize.x > beamSize.z;
                        // Usar la parte SUPERIOR de la viga (max.y) en lugar del centro
                        const beamY = beamBox.max.y;

                        let startPt, endPt;
                        if (isXBeam) {{
                            startPt = new THREE.Vector3(beamBox.min.x, beamY, beamCenter.z);
                            endPt = new THREE.Vector3(beamBox.max.x, beamY, beamCenter.z);
                        }} else {{
                            startPt = new THREE.Vector3(beamCenter.x, beamY, beamBox.min.z);
                            endPt = new THREE.Vector3(beamCenter.x, beamY, beamBox.max.z);
                        }}

                        const intersections = [];
                        const tol = 0.5;

                        for (const col of columnCenters) {{
                            // Verificar si la viga está dentro del rango de la columna
                            if (beamBox.max.y >= col.minY && beamBox.min.y <= col.maxY) {{
                                if (isXBeam) {{
                                    if (Math.abs(col.z - beamCenter.z) < tol) {{
                                        if (col.x > beamBox.min.x + tol && col.x < beamBox.max.x - tol) {{
                                            intersections.push(col.x);
                                        }}
                                    }}
                                }} else {{
                                    if (Math.abs(col.x - beamCenter.x) < tol) {{
                                        if (col.z > beamBox.min.z + tol && col.z < beamBox.max.z - tol) {{
                                            intersections.push(col.z);
                                        }}
                                    }}
                                }}
                            }}
                        }}

                        intersections.sort((a, b) => a - b);

                        if (intersections.length === 0) {{
                            createAnalyticMember(startPt, endPt, 'beam', 'V-' + analyticModel.nextId, '30x50');
                        }} else {{
                            let prevPt = startPt.clone();
                            for (const inter of intersections) {{
                                const interPt = isXBeam
                                    ? new THREE.Vector3(inter, beamY, beamCenter.z)
                                    : new THREE.Vector3(beamCenter.x, beamY, inter);
                                createAnalyticMember(prevPt, interPt, 'beam', 'V-' + analyticModel.nextId, '30x50');
                                prevPt = interPt.clone();
                            }}
                            createAnalyticMember(prevPt, endPt, 'beam', 'V-' + analyticModel.nextId, '30x50');
                        }}
                    }}

                    updateAnalyticPanel();
                    console.log('Modelo analítico generado:', analyticModel.members.length, 'miembros');
                }}

                function exportAnalyticModel() {{
                    const data = {{
                        nodes: analyticModel.nodes.map(n => ({{ id: n.id, x: n.pos.x, y: n.pos.y, z: n.pos.z }})),
                        members: analyticModel.members.map(m => ({{
                            id: m.id, name: m.name, type: m.type, section: m.section,
                            node1: m.node1, node2: m.node2, length: m.length
                        }}))
                    }};
                    const blob = new Blob([JSON.stringify(data, null, 2)], {{ type: 'application/json' }});
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'modelo_analitico.json';
                    a.click();
                }}

                // ========== EVENT LISTENERS ADICIONALES ==========
                // Panel de transparencia
                const transPanel = document.getElementById(containerId + '-transparency');
                document.querySelectorAll('.trans-slider').forEach(slider => {{
                    slider.addEventListener('input', (e) => {{
                        setTransparency(e.target.dataset.type, parseFloat(e.target.value));
                    }});
                }});
                const transReset = document.getElementById(containerId + '-trans-reset');
                if (transReset) {{
                    transReset.addEventListener('click', () => {{
                        document.querySelectorAll('.trans-slider').forEach(slider => {{
                            slider.value = 1;
                            setTransparency(slider.dataset.type, 1);
                        }});
                    }});
                }}

                // Panel de modelo analítico
                const analyticPanel = document.getElementById(containerId + '-analytic');
                const showPhysical = document.getElementById(containerId + '-show-physical');
                const showAnalytic = document.getElementById(containerId + '-show-analytic');
                const exportBtn = document.getElementById(containerId + '-export-model');
                const clearBtn = document.getElementById(containerId + '-clear-model');

                if (showPhysical) showPhysical.addEventListener('change', (e) => {{ allMeshes.visible = e.target.checked; }});
                if (showAnalytic) showAnalytic.addEventListener('change', (e) => {{ analyticGroup.visible = e.target.checked; }});
                if (exportBtn) exportBtn.addEventListener('click', exportAnalyticModel);
                if (clearBtn) clearBtn.addEventListener('click', clearAnalyticModel);

                // Botones del toolbar para transparencia y modelo analítico
                document.querySelector('.trans-btn')?.addEventListener('click', () => {{
                    if (transPanel) transPanel.style.display = transPanel.style.display === 'none' ? 'block' : 'none';
                }});
                document.querySelector('.analytic-btn')?.addEventListener('click', generateAutoAnalyticalModel);
                document.querySelector('.divide-btn')?.addEventListener('click', () => {{
                    divideColumnsByFloor = !divideColumnsByFloor;
                    const btn = document.querySelector('.divide-btn');
                    if (btn) {{
                        btn.textContent = divideColumnsByFloor ? 'Dividir' : 'Unir';
                        btn.style.background = divideColumnsByFloor ? '#2980b9' : '#c0392b';
                    }}
                    // Regenerar el modelo analítico con la nueva configuración
                    if (analyticModel.members.length > 0) {{
                        generateAutoAnalyticalModel();
                    }}
                    console.log('Modo columnas:', divideColumnsByFloor ? 'DIVIDIDAS por piso' : 'CONTINUAS');
                }});
                document.querySelector('.model-btn')?.addEventListener('click', () => {{
                    if (analyticPanel) analyticPanel.style.display = analyticPanel.style.display === 'none' ? 'block' : 'none';
                }});

                // Teclas T, A, M, D, Ctrl+U
                document.addEventListener('keydown', (e) => {{
                    if (e.key === 't' || e.key === 'T') {{
                        if (transPanel) transPanel.style.display = transPanel.style.display === 'none' ? 'block' : 'none';
                    }}
                    else if (e.key === 'a' || e.key === 'A') {{
                        generateAutoAnalyticalModel();
                    }}
                    else if (e.key === 'd' || e.key === 'D') {{
                        // Toggle dividir/unir columnas
                        document.querySelector('.divide-btn')?.click();
                    }}
                    else if (e.key === 'm' || e.key === 'M') {{
                        if (analyticPanel) analyticPanel.style.display = analyticPanel.style.display === 'none' ? 'block' : 'none';
                    }}
                    else if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {{
                        // Ctrl+U: Actualizar editor
                        e.preventDefault();
                        const updateBtn = document.querySelector('[data-action=""update-editor""]');
                        if (updateBtn) updateBtn.click();
                    }}
                }});

                // ========== LOOP DE ANIMACION ==========
                function animate() {{
                    requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene, camera);
                }}
                animate();

                // ========== RESIZE ==========
                window.addEventListener('resize', () => {{
                    camera.aspect = container.clientWidth / container.clientHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(container.clientWidth, container.clientHeight);
                }});

            }} catch (error) {{
                console.error('IFC Viewer Error:', error);
                if (loading) {{
                    loading.innerHTML = '<p style=""color: #dc3545;"">Error: ' + error.message + '</p>';
                }}
            }}
        }})();
    </script>
</body>
</html>";
        }

        /// <summary>
        /// Generate inline HTML viewer for @{html-ifc} directive
        /// This HTML is embedded directly in the Hekatan output and uses Virtual Host URLs
        /// Accepts either:
        ///   1) Path to IFC file
        ///   2) Complete HTML code for the viewer
        ///   3) @{ucode}...@{end ucode} block with simplified directives
        /// </summary>
        /// <param name="content">Path to the IFC file OR complete HTML code</param>
        /// <param name="directive">The directive string</param>
        public static string GenerateInlineViewerHtml(string content, string directive)
        {
            if (string.IsNullOrEmpty(content))
            {
                return "<div style='color: red; padding: 10px; border: 1px solid red; margin: 10px 0;'>Error: No se especificó contenido IFC</div>";
            }

            // Clean content - remove BOM and ALL invisible characters at start
            string trimmedContent = content.Trim();

            // Check for simplified directives directly (when coming from @{ucode} wrapper)
            // Directives start with @{fondo, @{altura, @{visor, @{camara, @{luz, @{grid, @{archivo, @{controles
            if (trimmedContent.StartsWith("@{fondo", StringComparison.OrdinalIgnoreCase) ||
                     trimmedContent.StartsWith("@{altura", StringComparison.OrdinalIgnoreCase) ||
                     trimmedContent.StartsWith("@{visor", StringComparison.OrdinalIgnoreCase) ||
                     trimmedContent.StartsWith("@{camara", StringComparison.OrdinalIgnoreCase) ||
                     trimmedContent.StartsWith("@{luz", StringComparison.OrdinalIgnoreCase) ||
                     trimmedContent.StartsWith("@{grid", StringComparison.OrdinalIgnoreCase) ||
                     trimmedContent.StartsWith("@{archivo", StringComparison.OrdinalIgnoreCase) ||
                     trimmedContent.StartsWith("@{controles", StringComparison.OrdinalIgnoreCase))
            {
                // Log detection
                try
                {
                    File.AppendAllText(Path.Combine(Path.GetTempPath(), "calcpad-debug.txt"),
                        $"[{DateTime.Now:HH:mm:ss}] HTML-IFC: Detected simplified directives directly (from @{{uncode}} wrapper)\n");
                }
                catch { }

                // Process as simplified directives
                return GenerateHtmlFromUncode(trimmedContent);
            }

            // Remove common BOM and invisible characters
            while (trimmedContent.Length > 0 &&
                   (trimmedContent[0] == '\uFEFF' || trimmedContent[0] == '\u200B' ||
                    trimmedContent[0] == '\uFFFE' || trimmedContent[0] == '\u200C' ||
                    trimmedContent[0] == '\u200D' || trimmedContent[0] == '\u2060' ||
                    char.IsWhiteSpace(trimmedContent[0]) || trimmedContent[0] < 32))
            {
                trimmedContent = trimmedContent.Substring(1);
            }

            // Log for debugging
            var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
            try
            {
                var first50 = trimmedContent.Length > 50 ? trimmedContent.Substring(0, 50) : trimmedContent;
                var firstChar = trimmedContent.Length > 0 ? ((int)trimmedContent[0]).ToString() : "EMPTY";
                File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] HTML-IFC GenerateInlineViewerHtml: content.Length={content.Length}, trimmed.Length={trimmedContent.Length}\n" +
                    $"[{DateTime.Now:HH:mm:ss}] HTML-IFC: First char code: {firstChar}, First 50 chars: '{first50}'\n");
            }
            catch { }

            // Check if content is already HTML (starts with <!DOCTYPE or <html or <style or <div or <script)
            // Also check if it contains HTML tags anywhere (for safety)
            bool isHtml = trimmedContent.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) ||
                          trimmedContent.StartsWith("<html", StringComparison.OrdinalIgnoreCase) ||
                          trimmedContent.StartsWith("<style", StringComparison.OrdinalIgnoreCase) ||
                          trimmedContent.StartsWith("<div", StringComparison.OrdinalIgnoreCase) ||
                          trimmedContent.StartsWith("<script", StringComparison.OrdinalIgnoreCase) ||
                          trimmedContent.StartsWith("<?xml", StringComparison.OrdinalIgnoreCase) ||
                          trimmedContent.StartsWith("<", StringComparison.OrdinalIgnoreCase) || // Any HTML tag
                          trimmedContent.Contains("</html>") ||
                          trimmedContent.Contains("</body>") ||
                          trimmedContent.Contains("</script>");

            // Log detection result
            try
            {
                File.AppendAllText(debugPath,
                    $"[{DateTime.Now:HH:mm:ss}] HTML-IFC: isHtml detected = {isHtml}\n");
            }
            catch { }

            if (isHtml)
            {
                // Content is already HTML - return as-is WITHOUT extracting
                // The Converter will handle URL conversions for CLI vs WPF
                // Don't validate file existence here - files may be in different locations
                // Keep the full HTML document intact so Converter can detect it
                return trimmedContent;
            }

            // Content is a file path - process as before
            string ifcFilePath = trimmedContent;

            if (!File.Exists(ifcFilePath))
            {
                return $"<div style='color: red; padding: 10px; border: 1px solid red; margin: 10px 0;'>Error: Archivo IFC no encontrado: {ifcFilePath}</div>";
            }

            string fileName = Path.GetFileName(ifcFilePath);
            string viewerId = $"ifc-viewer-{Guid.NewGuid():N}";

            // Copy the IFC file to the resources/ifc directory so it's accessible via Virtual Host
            try
            {
                string appPath = AppDomain.CurrentDomain.BaseDirectory;
                string ifcResourcePath = Path.Combine(appPath, "resources", "ifc");

                if (!Directory.Exists(ifcResourcePath))
                {
                    Directory.CreateDirectory(ifcResourcePath);
                }

                // Generate a unique temp name to avoid conflicts
                string tempIfcName = $"temp_{Guid.NewGuid():N}.ifc";
                string destPath = Path.Combine(ifcResourcePath, tempIfcName);
                File.Copy(ifcFilePath, destPath, true);

                // Debug log
                var debugPath2 = Path.Combine(Path.GetTempPath(), "calcpad-debug.txt");
                File.AppendAllText(debugPath2,
                    $"[{DateTime.Now:HH:mm:ss}] HTML-IFC: Copied IFC to '{destPath}'\n" +
                    $"[{DateTime.Now:HH:mm:ss}] HTML-IFC: Virtual Host URL will be 'https://calcpad.ifc/{tempIfcName}'\n");

                // Use Virtual Host URLs - these are mapped in MainWindow.xaml.cs
                string libsBase = "https://calcpad.ifc";
                string ifcUrl = $"https://calcpad.ifc/{tempIfcName}";

                // Generate inline HTML that works directly in the WebView2 output
                return GenerateInlineViewerHtmlContent(viewerId, fileName, ifcUrl, libsBase);
            }
            catch (Exception ex)
            {
                return $"<div style='color: red; padding: 10px; border: 1px solid red; margin: 10px 0;'>Error preparando archivo IFC: {ex.Message}</div>";
            }
        }

        /// <summary>
        /// Generate the actual inline HTML content for the IFC viewer
        /// Uses Virtual Host URLs (https://calcpad.ifc/) for local scripts to avoid Tracking Prevention
        /// </summary>
        private static string GenerateInlineViewerHtmlContent(string viewerId, string displayName, string ifcUrl, string libsBase)
        {
            // Convert Virtual Host URL to file path for embedding as base64
            // This avoids CORS issues completely
            string ifcBase64Data = "";
            try
            {
                // Extract filename from Virtual Host URL
                var fileName = ifcUrl.Replace("https://calcpad.ifc/", "");
                var appPath = AppDomain.CurrentDomain.BaseDirectory;
                var ifcFilePath = Path.Combine(appPath, "resources", "ifc", fileName);

                if (File.Exists(ifcFilePath))
                {
                    var bytes = File.ReadAllBytes(ifcFilePath);
                    ifcBase64Data = Convert.ToBase64String(bytes);
                }
            }
            catch { }

            // Use Virtual Host for all scripts - these are mapped in MainWindow.xaml.cs
            // https://calcpad.ifc/ maps to {AppPath}/resources/ifc/
            string scriptBase = "https://calcpad.ifc";

            return $@"<style>
    #{viewerId} {{ width: 100%; height: 600px; position: relative; background: #1e1e1e; border-radius: 8px; overflow: hidden; margin: 10px 0; }}
    #{viewerId}-canvas {{ width: 100%; height: 100%; display: block; }}
    @keyframes ifc-spin-{viewerId} {{ to {{ transform: rotate(360deg); }} }}
</style>
<div id=""{viewerId}"" style=""width: 100%; height: 600px; position: relative; background: #1e1e1e; border-radius: 8px; overflow: hidden;"">
    <canvas id=""{viewerId}-canvas""></canvas>
    <div id=""{viewerId}-info"" style=""position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #fff; padding: 10px 15px; border-radius: 5px; font-size: 12px;"">
        <strong>{displayName}</strong>
        <div id=""{viewerId}-stats""></div>
    </div>
    <div id=""{viewerId}-loading"" style=""position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff;"">
        <div style=""width: 50px; height: 50px; border: 3px solid #333; border-top-color: #0078d4; border-radius: 50%; animation: ifc-spin-{viewerId} 1s linear infinite; margin: 0 auto;""></div>
        <p style=""margin-top: 15px;"" id=""{viewerId}-status"">Cargando modelo IFC...</p>
    </div>
    <div style=""position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #fff; padding: 10px; border-radius: 5px; font-size: 11px;"">
        <p><span style=""background: #444; padding: 2px 6px; border-radius: 3px; font-family: monospace;"">Click + Arrastrar</span> Rotar</p>
        <p><span style=""background: #444; padding: 2px 6px; border-radius: 3px; font-family: monospace;"">Scroll</span> Zoom</p>
    </div>
</div>
<script>
// Store IFC data as base64 to avoid CORS issues
window.ifcBase64Data_{viewerId.Replace("-", "_")} = '{ifcBase64Data}';
</script>
<script src=""{scriptBase}/three.min.js""></script>
<script src=""{scriptBase}/OrbitControls.js""></script>
<script src=""{scriptBase}/web-ifc-api-iife.js""></script>
<script>
(function() {{
    const containerId = '{viewerId}';
    const canvas = document.getElementById(containerId + '-canvas');
    const stats = document.getElementById(containerId + '-stats');
    const loading = document.getElementById(containerId + '-loading');
    const status = document.getElementById(containerId + '-status');
    const container = document.getElementById(containerId);

    if (!canvas || !container) {{
        console.error('IFC Viewer: Container not found');
        return;
    }}

    function updateStatus(msg) {{
        if (status) status.textContent = msg;
    }}

    async function initViewer() {{
        try {{
            updateStatus('Inicializando Three.js...');

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1e1e1e);

            const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
            camera.position.set(50, 50, 50);

            const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);

            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;

            scene.add(new THREE.AmbientLight(0xffffff, 0.5));
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(50, 100, 50);
            scene.add(dirLight);
            scene.add(new THREE.GridHelper(100, 100, 0x444444, 0x333333));

            updateStatus('Cargando datos IFC...');

            // Decode base64 IFC data (embedded to avoid CORS issues)
            const base64Data = window.ifcBase64Data_{viewerId.Replace("-", "_")};
            if (!base64Data) {{
                throw new Error('No se encontraron datos IFC');
            }}
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {{
                bytes[i] = binaryString.charCodeAt(i);
            }}
            const ifcData = bytes.buffer;

            updateStatus('Inicializando web-ifc...');
            const ifcApi = new WebIFC.IfcAPI();
            // Use Virtual Host for WASM file
            await ifcApi.Init(function(path) {{
                if (path.endsWith('.wasm')) {{
                    return '{scriptBase}/' + path;
                }}
                return path;
            }});

            updateStatus('Parseando modelo IFC...');
            const modelID = ifcApi.OpenModel(new Uint8Array(ifcData));

            updateStatus('Generando geometría 3D...');
            const flatMeshes = ifcApi.LoadAllGeometry(modelID);

            const allMeshes = new THREE.Group();
            let meshCount = 0;

            for (let i = 0; i < flatMeshes.size(); i++) {{
                const flatMesh = flatMeshes.get(i);
                const placedGeometries = flatMesh.geometries;

                for (let j = 0; j < placedGeometries.size(); j++) {{
                    const pg = placedGeometries.get(j);
                    const geom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);

                    const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                    const indices = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

                    if (verts.length === 0 || indices.length === 0) continue;

                    const positions = new Float32Array(verts.length / 2);
                    const normals = new Float32Array(verts.length / 2);
                    for (let k = 0; k < verts.length; k += 6) {{
                        const idx = (k / 6) * 3;
                        positions[idx] = verts[k];
                        positions[idx + 1] = verts[k + 1];
                        positions[idx + 2] = verts[k + 2];
                        normals[idx] = verts[k + 3];
                        normals[idx + 1] = verts[k + 4];
                        normals[idx + 2] = verts[k + 5];
                    }}

                    const bufferGeom = new THREE.BufferGeometry();
                    bufferGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    bufferGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                    bufferGeom.setIndex(new THREE.BufferAttribute(indices, 1));

                    const color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
                    const material = new THREE.MeshPhongMaterial({{
                        color: color,
                        side: THREE.DoubleSide,
                        transparent: pg.color.w < 1,
                        opacity: pg.color.w
                    }});

                    const meshObj = new THREE.Mesh(bufferGeom, material);
                    const matrix = new THREE.Matrix4().fromArray(pg.flatTransformation);
                    meshObj.applyMatrix4(matrix);
                    allMeshes.add(meshObj);
                    meshCount++;
                }}
            }}

            scene.add(allMeshes);

            updateStatus('Ajustando vista...');
            const box = new THREE.Box3().setFromObject(allMeshes);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
            controls.target.copy(center);
            controls.update();

            if (loading) loading.style.display = 'none';
            if (stats) stats.innerHTML = '<br>' + meshCount + ' elementos';

            ifcApi.CloseModel(modelID);

            function animate() {{
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }}
            animate();

            window.addEventListener('resize', () => {{
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            }});

        }} catch (error) {{
            console.error('IFC Viewer Error:', error);
            if (loading) {{
                loading.innerHTML = '<p style=""color: red;"">Error: ' + error.message + '</p>';
            }}
        }}
    }}

    initViewer();
}})();
</script>";
        }

        /// <summary>
        /// Generate HTML fragment for embedding in Hekatan output - works with autorun
        /// The IFC file is loaded from the virtual host
        /// Uses Virtual Host URLs for all scripts to avoid Tracking Prevention
        /// </summary>
        /// <param name="ifcFileName">Name of the IFC file in the virtual host directory</param>
        /// <param name="displayName">Display name for the file</param>
        public static string GenerateFileBasedViewerWithCdn(string ifcFileName, string displayName)
        {
            string viewerId = $"ifc-viewer-{Guid.NewGuid():N}";
            string ifcUrl = $"https://calcpad.ifc/{ifcFileName}";
            string scriptBase = "https://calcpad.ifc";

            // Generate HTML fragment (not full page) for embedding in Hekatan output
            return $@"<style>
    #{viewerId} {{ width: 100%; height: 600px; position: relative; background: #1e1e1e; border-radius: 8px; overflow: hidden; }}
    #{viewerId}-canvas {{ width: 100%; height: 100%; }}
    @keyframes ifc-spin-{viewerId} {{ to {{ transform: rotate(360deg); }} }}
</style>
    <div id=""{viewerId}"" style=""width: 100%; height: 100%; position: relative; background: #1e1e1e;"">
        <canvas id=""{viewerId}-canvas"" style=""width: 100%; height: 100%;""></canvas>
        <div id=""{viewerId}-info"" style=""position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #fff; padding: 10px 15px; border-radius: 5px; font-size: 12px;"">
            <strong>{displayName}</strong>
            <div id=""{viewerId}-stats""></div>
        </div>
        <div id=""{viewerId}-loading"" style=""position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff;"">
            <div style=""width: 50px; height: 50px; border: 3px solid #333; border-top-color: #0078d4; border-radius: 50%; animation: ifc-spin 1s linear infinite; margin: 0 auto;""></div>
            <p style=""margin-top: 15px;"" id=""{viewerId}-status"">Cargando archivo IFC...</p>
            <div class=""progress-bar""><div class=""progress-bar-fill"" id=""{viewerId}-progress""></div></div>
        </div>
        <div style=""position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #fff; padding: 10px; border-radius: 5px; font-size: 11px;"">
            <p><span style=""background: #444; padding: 2px 6px; border-radius: 3px; font-family: monospace;"">Click + Arrastrar</span> Rotar</p>
            <p><span style=""background: #444; padding: 2px 6px; border-radius: 3px; font-family: monospace;"">Scroll</span> Zoom</p>
            <p><span style=""background: #444; padding: 2px 6px; border-radius: 3px; font-family: monospace;"">F</span> Fit to view</p>
        </div>
    </div>
    <script src=""{scriptBase}/three.min.js""></script>
    <script src=""{scriptBase}/OrbitControls.js""></script>
    <script src=""{scriptBase}/web-ifc-api-iife.js""></script>
    <script>
        (async function() {{
            const containerId = '{viewerId}';
            const canvas = document.getElementById(containerId + '-canvas');
            const stats = document.getElementById(containerId + '-stats');
            const loading = document.getElementById(containerId + '-loading');
            const status = document.getElementById(containerId + '-status');
            const progress = document.getElementById(containerId + '-progress');
            const container = document.getElementById(containerId);

            function updateStatus(msg, pct) {{
                if (status) status.textContent = msg;
                if (progress && pct !== undefined) progress.style.width = pct + '%';
            }}

            try {{
                updateStatus('Inicializando Three.js...', 10);

                const scene = new THREE.Scene();
                scene.background = new THREE.Color(0x1e1e1e);
                const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
                camera.position.set(50, 50, 50);
                const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
                renderer.setSize(container.clientWidth, container.clientHeight);
                renderer.setPixelRatio(window.devicePixelRatio);
                const controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;
                controls.dampingFactor = 0.05;
                scene.add(new THREE.AmbientLight(0xffffff, 0.5));
                const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
                dirLight.position.set(50, 100, 50);
                scene.add(dirLight);
                const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x333333);
                scene.add(gridHelper);

                updateStatus('Descargando archivo IFC...', 20);

                // Fetch IFC file from virtual host
                const response = await fetch('{ifcUrl}');
                if (!response.ok) throw new Error('Error descargando archivo: ' + response.status);

                updateStatus('Leyendo datos...', 40);
                const ifcData = await response.arrayBuffer();

                updateStatus('Inicializando web-ifc...', 50);
                const ifcApi = new WebIFC.IfcAPI();
                // Use Virtual Host for WASM
                await ifcApi.Init(function(path) {{
                    if (path.endsWith('.wasm')) {{
                        return '{scriptBase}/' + path;
                    }}
                    return path;
                }});

                updateStatus('Parseando modelo IFC...', 60);
                const modelID = ifcApi.OpenModel(new Uint8Array(ifcData));

                updateStatus('Generando geometría 3D...', 70);
                const flatMeshes = ifcApi.LoadAllGeometry(modelID);

                updateStatus('Construyendo malla...', 80);
                const allMeshes = new THREE.Group();
                let meshCount = 0;

                for (let i = 0; i < flatMeshes.size(); i++) {{
                    const flatMesh = flatMeshes.get(i);
                    const placedGeometries = flatMesh.geometries;

                    for (let j = 0; j < placedGeometries.size(); j++) {{
                        const pg = placedGeometries.get(j);
                        const geom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);

                        const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                        const indices = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

                        if (verts.length === 0 || indices.length === 0) continue;

                        const positions = new Float32Array(verts.length / 2);
                        const normals = new Float32Array(verts.length / 2);
                        for (let k = 0; k < verts.length; k += 6) {{
                            const idx = (k / 6) * 3;
                            positions[idx] = verts[k];
                            positions[idx + 1] = verts[k + 1];
                            positions[idx + 2] = verts[k + 2];
                            normals[idx] = verts[k + 3];
                            normals[idx + 1] = verts[k + 4];
                            normals[idx + 2] = verts[k + 5];
                        }}

                        const bufferGeom = new THREE.BufferGeometry();
                        bufferGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                        bufferGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                        bufferGeom.setIndex(new THREE.BufferAttribute(indices, 1));

                        const color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
                        const material = new THREE.MeshPhongMaterial({{
                            color: color,
                            side: THREE.DoubleSide,
                            transparent: pg.color.w < 1,
                            opacity: pg.color.w
                        }});

                        const meshObj = new THREE.Mesh(bufferGeom, material);
                        const matrix = new THREE.Matrix4().fromArray(pg.flatTransformation);
                        meshObj.applyMatrix4(matrix);
                        allMeshes.add(meshObj);
                        meshCount++;
                    }}
                }}

                scene.add(allMeshes);

                updateStatus('Ajustando vista...', 90);
                const box = new THREE.Box3().setFromObject(allMeshes);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);

                camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
                controls.target.copy(center);
                controls.update();

                if (loading) loading.style.display = 'none';
                if (stats) stats.innerHTML = '<br>' + meshCount + ' elementos';

                ifcApi.CloseModel(modelID);

                function animate() {{
                    requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene, camera);
                }}
                animate();

                window.addEventListener('resize', () => {{
                    camera.aspect = container.clientWidth / container.clientHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(container.clientWidth, container.clientHeight);
                }});

                document.addEventListener('keydown', (e) => {{
                    if (e.key === 'f' || e.key === 'F') {{
                        camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
                        controls.target.copy(center);
                        controls.update();
                    }}
                }});

            }} catch (error) {{
                console.error('IFC Viewer Error:', error);
                if (loading) {{
                    loading.innerHTML = '<p style=""color: #ff6b6b;"">Error: ' + error.message + '</p>';
                }}
            }}
        }})();
    </script>";
        }

        /// <summary>
        /// Generate HTML viewer that loads IFC from external file (for large files)
        /// The IFC file should be in the same directory as the HTML or accessible via the provided path
        /// </summary>
        private static string GenerateExternalFileViewerHtml(string viewerId, string fileName, string ifcFilePath, string wasmBasePath)
        {
            string escapedFileName = fileName.Replace("'", "\\'").Replace("\"", "&quot;");

            // Determine script sources and WASM path
            string threeJsSrc, orbitControlsSrc, webIfcSrc, wasmLocateLogic;
            string importMapAddons, orbitControlsImport;
            bool useLocalLibs = wasmBasePath != "cdn";

            if (wasmBasePath == "cdn")
            {
                threeJsSrc = "https://unpkg.com/three@0.170.0/build/three.module.js";
                orbitControlsSrc = "https://unpkg.com/three@0.170.0/examples/jsm/controls/OrbitControls.js";
                webIfcSrc = "https://unpkg.com/web-ifc@0.0.57/web-ifc-api-iife.js";
                wasmLocateLogic = "ifcApi.SetWasmPath('https://unpkg.com/web-ifc@0.0.57/');";
                importMapAddons = "\"three/addons/\": \"https://unpkg.com/three@0.170.0/examples/jsm/\"";
                orbitControlsImport = "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';";
            }
            else
            {
                // Local libs - use direct path for OrbitControls since it's not in controls/ subdirectory
                threeJsSrc = $"{wasmBasePath}/three.module.js";
                orbitControlsSrc = $"{wasmBasePath}/OrbitControls.js";
                webIfcSrc = $"{wasmBasePath}/web-ifc-api-iife.js";
                wasmLocateLogic = $"ifcApi.SetWasmPath('{wasmBasePath}/');";
                // For local libs, map OrbitControls directly
                importMapAddons = $"\"OrbitControls\": \"{wasmBasePath}/OrbitControls.js\"";
                orbitControlsImport = "import { OrbitControls } from 'OrbitControls';";
            }

            // El archivo IFC se referencia relativamente (mismo directorio que el HTML)
            string ifcRelativePath = fileName;

            return $@"<!DOCTYPE html>
<html lang=""es"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>IFC Viewer - {escapedFileName}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1e1e1e;
            color: #fff;
        }}
        #container {{ width: 100%; height: 100%; position: relative; }}
        #canvas {{ width: 100%; height: 100%; }}
        #info {{
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0,0,0,0.8);
            padding: 12px 15px;
            border-radius: 8px;
            font-size: 12px;
            min-width: 180px;
        }}
        #info h3 {{ color: #4fc3f7; margin-bottom: 8px; font-size: 14px; }}
        #stats {{ color: #aaa; font-size: 11px; line-height: 1.6; }}
        #loading {{
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            z-index: 100;
        }}
        .spinner {{
            width: 60px;
            height: 60px;
            border: 4px solid #333;
            border-top-color: #4fc3f7;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }}
        @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
        #progress-container {{
            width: 300px;
            background: #333;
            border-radius: 10px;
            overflow: hidden;
            margin-top: 15px;
        }}
        #progress-bar {{
            height: 8px;
            background: linear-gradient(90deg, #4fc3f7, #00bcd4);
            width: 0%;
            transition: width 0.3s;
        }}
        #controls {{
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(0,0,0,0.8);
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 11px;
        }}
        .key {{
            display: inline-block;
            background: #444;
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
            margin-right: 5px;
        }}
        #selected-info {{
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.9);
            padding: 15px;
            border-radius: 8px;
            font-size: 11px;
            max-width: 300px;
            display: none;
            border: 1px solid #4fc3f7;
        }}
        #selected-info h4 {{ color: #4fc3f7; margin-bottom: 10px; }}
        #selected-info .prop {{ margin: 4px 0; }}
        #selected-info .prop-name {{ color: #aaa; }}
        #selected-info .prop-value {{ color: #fff; }}
        #debug {{
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(0,0,0,0.9);
            padding: 10px;
            border-radius: 8px;
            font-size: 10px;
            max-width: 350px;
            max-height: 200px;
            overflow: auto;
            font-family: monospace;
            display: none;
        }}
        /* ===== SNAP Y DIBUJO ESTILOS ===== */
        #toolbar {{
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.85);
            padding: 8px 12px;
            border-radius: 8px;
            display: flex;
            gap: 8px;
            z-index: 100;
        }}
        .btn-tool {{
            background: #2c3e50;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            transition: background 0.2s;
        }}
        .btn-tool:hover {{ background: #34495e; }}
        .btn-tool.active {{ background: #3498db; }}
        .btn-tool svg {{ width: 20px; height: 20px; }}
        #snap-menu {{
            position: absolute;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(44, 62, 80, 0.95);
            padding: 10px;
            border-radius: 8px;
            display: none;
            z-index: 101;
            min-width: 180px;
        }}
        #snap-menu label {{
            display: block;
            margin: 5px 0;
            cursor: pointer;
            font-size: 11px;
        }}
        #snap-menu input {{ margin-right: 8px; }}
        #snap-indicator {{
            position: absolute;
            padding: 3px 8px;
            background: rgba(52, 152, 219, 0.9);
            color: white;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            pointer-events: none;
            display: none;
            z-index: 50;
        }}
        #coord-display {{
            position: absolute;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: #4fc3f7;
            padding: 5px 15px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
        }}
        #line-info {{
            position: absolute;
            bottom: 40px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(52, 152, 219, 0.9);
            color: white;
            padding: 5px 15px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
            display: none;
        }}
    </style>
</head>
<body>
    <div id=""container"">
        <canvas id=""canvas""></canvas>

        <!-- TOOLBAR DE HERRAMIENTAS -->
        <div id=""toolbar"">
            <button class=""btn-tool"" id=""btnSelect"" title=""Seleccionar (S)"">
                <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <path d=""M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z""/>
                </svg>
                <span>Seleccionar</span>
            </button>
            <button class=""btn-tool"" id=""btnLinea"" title=""Dibujar Línea (L)"">
                <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <line x1=""4"" y1=""20"" x2=""20"" y2=""4""/>
                    <circle cx=""4"" cy=""20"" r=""2"" fill=""#3498db""/>
                    <circle cx=""20"" cy=""4"" r=""2"" fill=""#3498db""/>
                </svg>
                <span>Línea</span>
            </button>
            <button class=""btn-tool"" id=""btnPolilinea"" title=""Polilínea (P)"">
                <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <path d=""M4 20 L10 8 L18 14""/>
                    <circle cx=""4"" cy=""20"" r=""2"" fill=""#3498db""/>
                    <circle cx=""10"" cy=""8"" r=""2"" fill=""#3498db""/>
                    <circle cx=""18"" cy=""14"" r=""2"" fill=""#3498db""/>
                </svg>
                <span>Polilínea</span>
            </button>
            <button class=""btn-tool"" id=""btnSnap"" title=""Snap a Objetos"">
                <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <circle cx=""12"" cy=""12"" r=""3""/>
                    <path d=""M12 2v4M12 18v4M2 12h4M18 12h4""/>
                </svg>
                <span>Snap OFF</span>
            </button>
            <button class=""btn-tool"" id=""btnOrtho"" title=""Restricción 90° (F8)"">
                <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <path d=""M4 20h16M4 20v-16""/>
                    <path d=""M4 12h8"" stroke-dasharray=""2,2""/>
                </svg>
                <span>Ortho OFF</span>
            </button>
            <button class=""btn-tool"" id=""btnGrid"" title=""Mostrar Rejilla (G)"">
                <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <path d=""M3 3h18v18H3z""/>
                    <path d=""M3 9h18M3 15h18M9 3v18M15 3v18""/>
                </svg>
                <span>Grid</span>
            </button>
            <button class=""btn-tool"" id=""btnUndo"" title=""Deshacer (Ctrl+Z)"">
                <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <path d=""M3 10h10a5 5 0 0 1 0 10H13""/>
                    <path d=""M3 10l4-4M3 10l4 4""/>
                </svg>
                <span>Deshacer</span>
            </button>
            <button class=""btn-tool"" id=""btnClear"" title=""Limpiar Líneas"">
                <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <path d=""M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6""/>
                </svg>
                <span>Limpiar</span>
            </button>
        </div>

        <!-- MENU SNAP -->
        <div id=""snap-menu"">
            <label><input type=""checkbox"" id=""snapVertex"" checked> Vértice</label>
            <label><input type=""checkbox"" id=""snapMidpoint"" checked> Punto medio</label>
            <label><input type=""checkbox"" id=""snapCenter"" checked> Centro</label>
            <label><input type=""checkbox"" id=""snapEdge""> Borde cercano</label>
            <label><input type=""checkbox"" id=""snapFace""> Centro de cara</label>
            <label><input type=""checkbox"" id=""snapGrid""> Rejilla</label>
            <label><input type=""checkbox"" id=""snapPerpendicular""> Perpendicular</label>
        </div>

        <!-- INDICADOR DE SNAP -->
        <div id=""snap-indicator""></div>

        <!-- INFO DE COORDENADAS -->
        <div id=""coord-display"">X: 0.00 Y: 0.00 Z: 0.00</div>

        <!-- INFO DE LINEA EN DIBUJO -->
        <div id=""line-info"">Longitud: 0.00 | Ángulo: 0°</div>

        <!-- NAVEGACION POR NIVELES -->
        <div id=""level-nav"" style=""position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.85); padding: 10px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 5px;"">
            <button id=""btnLevelUp"" class=""btn-tool"" style=""padding: 6px 10px;"" title=""Nivel Superior"">
                <svg viewBox=""0 0 24 24"" width=""20"" height=""20"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <path d=""M12 19V5M5 12l7-7 7 7""/>
                </svg>
            </button>
            <div id=""level-display"" style=""color: #4fc3f7; font-size: 11px; text-align: center; min-width: 60px;"">
                <div>Nivel</div>
                <div id=""current-level"" style=""font-weight: bold; font-size: 14px;"">Todos</div>
            </div>
            <button id=""btnLevelDown"" class=""btn-tool"" style=""padding: 6px 10px;"" title=""Nivel Inferior"">
                <svg viewBox=""0 0 24 24"" width=""20"" height=""20"" fill=""none"" stroke=""currentColor"" stroke-width=""2"">
                    <path d=""M12 5v14M5 12l7 7 7-7""/>
                </svg>
            </button>
            <button id=""btnLevelAll"" class=""btn-tool"" style=""padding: 6px 10px; font-size: 9px;"" title=""Mostrar Todos los Niveles"">
                <span>Todos</span>
            </button>
        </div>

        <!-- VISTAS PREDEFINIDAS -->
        <div id=""view-controls"" style=""position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.85); padding: 10px; border-radius: 8px; display: flex; flex-direction: column; gap: 5px;"">
            <button class=""btn-tool btn-view"" data-view=""top"" style=""padding: 6px 10px;"" title=""Vista Superior (Planta)"">
                <span style=""font-size: 10px;"">▬ Planta</span>
            </button>
            <button class=""btn-tool btn-view"" data-view=""front"" style=""padding: 6px 10px;"" title=""Vista Frontal"">
                <span style=""font-size: 10px;"">□ Frontal</span>
            </button>
            <button class=""btn-tool btn-view"" data-view=""back"" style=""padding: 6px 10px;"" title=""Vista Posterior"">
                <span style=""font-size: 10px;"">□ Posterior</span>
            </button>
            <button class=""btn-tool btn-view"" data-view=""right"" style=""padding: 6px 10px;"" title=""Vista Lateral Derecha"">
                <span style=""font-size: 10px;"">◫ Derecha</span>
            </button>
            <button class=""btn-tool btn-view"" data-view=""left"" style=""padding: 6px 10px;"" title=""Vista Lateral Izquierda"">
                <span style=""font-size: 10px;"">◨ Izquierda</span>
            </button>
            <button class=""btn-tool btn-view"" data-view=""iso"" style=""padding: 6px 10px;"" title=""Vista Isométrica"">
                <span style=""font-size: 10px;"">◇ 3D</span>
            </button>
            <hr style=""width: 100%; border-color: #555; margin: 5px 0;"">
            <button class=""btn-tool"" id=""btnClipX"" style=""padding: 6px 10px;"" title=""Plano de Corte X"">
                <span style=""font-size: 10px;"">✂ Corte X</span>
            </button>
            <button class=""btn-tool"" id=""btnClipY"" style=""padding: 6px 10px;"" title=""Plano de Corte Y"">
                <span style=""font-size: 10px;"">✂ Corte Y</span>
            </button>
            <button class=""btn-tool"" id=""btnClipZ"" style=""padding: 6px 10px;"" title=""Plano de Corte Z"">
                <span style=""font-size: 10px;"">✂ Corte Z</span>
            </button>
            <button class=""btn-tool"" id=""btnClipOff"" style=""padding: 6px 10px;"" title=""Quitar Cortes"">
                <span style=""font-size: 10px;"">✕ Sin Corte</span>
            </button>
        </div>

        <!-- SLIDER DE CORTE -->
        <div id=""clip-slider-container"" style=""position: absolute; left: 120px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.85); padding: 15px 10px; border-radius: 8px; display: none; flex-direction: column; align-items: center;"">
            <span id=""clip-axis-label"" style=""color: #4fc3f7; font-size: 11px; margin-bottom: 5px;"">Corte X</span>
            <input type=""range"" id=""clipSlider"" min=""0"" max=""100"" value=""50"" style=""writing-mode: vertical-lr; direction: rtl; height: 150px; cursor: pointer;"">
            <span id=""clip-value"" style=""color: white; font-size: 10px; margin-top: 5px;"">50%</span>
        </div>

        <!-- PANEL DE FILTROS POR TIPO DE ELEMENTO -->
        <div id=""filter-panel"" style=""position: absolute; top: 70px; left: 10px; background: rgba(0,0,0,0.90); padding: 10px; border-radius: 8px; font-size: 11px; min-width: 150px; border: 1px solid #333;"">
            <div style=""color: #4fc3f7; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #444; padding-bottom: 5px;"">Filtrar Elementos</div>
            <label style=""display: flex; align-items: center; gap: 8px; margin: 5px 0; cursor: pointer;"">
                <input type=""checkbox"" id=""filterWalls"" checked>
                <span style=""display: inline-flex; align-items: center; gap: 4px;"">
                    <span style=""width: 12px; height: 12px; background: #3498db; border-radius: 2px;""></span> Muros
                </span>
            </label>
            <label style=""display: flex; align-items: center; gap: 8px; margin: 5px 0; cursor: pointer;"">
                <input type=""checkbox"" id=""filterSlabs"" checked>
                <span style=""display: inline-flex; align-items: center; gap: 4px;"">
                    <span style=""width: 12px; height: 12px; background: #9b59b6; border-radius: 2px;""></span> Losas
                </span>
            </label>
            <label style=""display: flex; align-items: center; gap: 8px; margin: 5px 0; cursor: pointer;"">
                <input type=""checkbox"" id=""filterColumns"" checked>
                <span style=""display: inline-flex; align-items: center; gap: 4px;"">
                    <span style=""width: 12px; height: 12px; background: #27ae60; border-radius: 2px;""></span> Columnas
                </span>
            </label>
            <label style=""display: flex; align-items: center; gap: 8px; margin: 5px 0; cursor: pointer;"">
                <input type=""checkbox"" id=""filterBeams"" checked>
                <span style=""display: inline-flex; align-items: center; gap: 4px;"">
                    <span style=""width: 12px; height: 12px; background: #e74c3c; border-radius: 2px;""></span> Vigas
                </span>
            </label>
            <label style=""display: flex; align-items: center; gap: 8px; margin: 5px 0; cursor: pointer;"">
                <input type=""checkbox"" id=""filterWindows"" checked>
                <span style=""display: inline-flex; align-items: center; gap: 4px;"">
                    <span style=""width: 12px; height: 12px; background: #f39c12; border-radius: 2px;""></span> Ventanas
                </span>
            </label>
            <label style=""display: flex; align-items: center; gap: 8px; margin: 5px 0; cursor: pointer;"">
                <input type=""checkbox"" id=""filterDoors"" checked>
                <span style=""display: inline-flex; align-items: center; gap: 4px;"">
                    <span style=""width: 12px; height: 12px; background: #1abc9c; border-radius: 2px;""></span> Puertas
                </span>
            </label>
            <label style=""display: flex; align-items: center; gap: 8px; margin: 5px 0; cursor: pointer;"">
                <input type=""checkbox"" id=""filterOther"" checked>
                <span style=""display: inline-flex; align-items: center; gap: 4px;"">
                    <span style=""width: 12px; height: 12px; background: #95a5a6; border-radius: 2px;""></span> Otros
                </span>
            </label>
            <hr style=""border-color: #444; margin: 8px 0;"">
            <button id=""btnShowAll"" class=""btn-tool"" style=""width: 100%; padding: 5px; font-size: 10px;"">Mostrar Todo</button>
            <button id=""btnHideAll"" class=""btn-tool"" style=""width: 100%; padding: 5px; font-size: 10px; margin-top: 4px;"">Ocultar Todo</button>
        </div>

        <div id=""info"">
            <h3 id=""filename"">{escapedFileName}</h3>
            <div id=""stats"">Cargando...</div>
        </div>
        <div id=""loading"">
            <div class=""spinner""></div>
            <p id=""status"">Inicializando...</p>
            <div id=""progress-container"">
                <div id=""progress-bar""></div>
            </div>
            <p id=""progress-text"" style=""margin-top: 10px; font-size: 12px; color: #888;""></p>
        </div>
        <div id=""controls"">
            <p><span class=""key"">F</span> Fit to view</p>
            <p><span class=""key"">S</span> Seleccionar</p>
            <p><span class=""key"">L</span> Línea</p>
            <p><span class=""key"">P</span> Polilínea</p>
            <p><span class=""key"">G</span> Grid</p>
            <p><span class=""key"">F8</span> Ortho</p>
            <p><span class=""key"">Ctrl+Z</span> Deshacer</p>
            <p><span class=""key"">Esc</span> Cancelar</p>
            <p><span class=""key"">DblClick</span> Terminar polilínea</p>
        </div>
        <div id=""selected-info"">
            <h4>Elemento Seleccionado</h4>
            <div id=""selected-props""></div>
        </div>
        <div id=""debug""></div>
    </div>

    <script src=""{webIfcSrc}""></script>

    <script type=""importmap"">
    {{
        ""imports"": {{
            ""three"": ""{threeJsSrc}"",
            {importMapAddons}
        }}
    }}
    </script>

    <script type=""module"">
        import * as THREE from 'three';
        {orbitControlsImport}

        const canvas = document.getElementById('canvas');
        const container = document.getElementById('container');
        const loading = document.getElementById('loading');
        const statusEl = document.getElementById('status');
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        const statsEl = document.getElementById('stats');
        const selectedInfo = document.getElementById('selected-info');
        const selectedProps = document.getElementById('selected-props');
        const debugEl = document.getElementById('debug');

        let showDebug = false;
        const debugLog = [];

        function log(msg) {{
            console.log(msg);
            debugLog.push(`[${{new Date().toLocaleTimeString()}}] ${{msg}}`);
            if (debugLog.length > 50) debugLog.shift();
            if (showDebug) {{
                debugEl.innerHTML = debugLog.join('<br>');
                debugEl.scrollTop = debugEl.scrollHeight;
            }}
        }}

        function updateProgress(percent, message) {{
            progressBar.style.width = percent + '%';
            if (message) statusEl.textContent = message;
        }}

        // Three.js setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e1e1e);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        camera.position.set(50, 50, 50);

        const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true, preserveDrawingBuffer: true }});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(100, 100, 50);
        scene.add(dirLight);
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        dirLight2.position.set(-50, -50, -50);
        scene.add(dirLight2);

        // Grid
        const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x333333);
        scene.add(gridHelper);
        let gridVisible = true;

        // Raycaster for selection
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let selectedMesh = null;
        let originalMaterial = null;
        const selectMaterial = new THREE.MeshPhongMaterial({{ color: 0x00ff00, emissive: 0x003300 }});

        // Store mesh data for selection info
        const meshDataMap = new Map();

        // ========== SISTEMA DE SNAP ==========
        let snapActivo = false;
        let orthoActivo = false;
        const snapTipos = {{
            vertex: true,
            midpoint: true,
            center: true,
            edge: false,
            face: false,
            grid: false,
            perpendicular: false
        }};
        const snapPuntos = [];
        let snapPuntoActual = null;
        const snapIndicator = document.getElementById('snap-indicator');
        const coordDisplay = document.getElementById('coord-display');
        const lineInfo = document.getElementById('line-info');
        const snapMenu = document.getElementById('snap-menu');

        // ========== SISTEMA DE DIBUJO ==========
        let modoActual = 'select'; // select, linea, polilinea
        let dibujando = false;
        let puntoInicial = null;
        const lineasDibujadas = [];
        const lineasGroup = new THREE.Group();
        scene.add(lineasGroup);
        let lineaTemporal = null;
        const historialLineas = [];
        const MAX_HISTORIAL = 30;

        // Material para lineas dibujadas
        const lineaMaterial = new THREE.LineBasicMaterial({{ color: 0xff6600, linewidth: 2 }});
        const lineaTempMaterial = new THREE.LineBasicMaterial({{ color: 0xffff00, linewidth: 1 }});

        // ========== SISTEMA DE NIVELES ==========
        let niveles = [];
        let nivelActual = -1; // -1 = Todos
        const currentLevelEl = document.getElementById('current-level');

        // ========== SISTEMA DE CLIPPING ==========
        let clipPlane = null;
        let clipAxis = null;
        const clipSliderContainer = document.getElementById('clip-slider-container');
        const clipSlider = document.getElementById('clipSlider');
        const clipAxisLabel = document.getElementById('clip-axis-label');
        const clipValueEl = document.getElementById('clip-value');

        // ========== FUNCIONES DE SNAP ==========
        function actualizarSnapPuntos() {{
            snapPuntos.length = 0;
            geometries.forEach(mesh => {{
                const positions = mesh.geometry.attributes.position;
                if (!positions) return;

                // Obtener matriz de transformacion mundial
                mesh.updateMatrixWorld();
                const matrixWorld = mesh.matrixWorld;

                // Agregar vertices como puntos de snap
                if (snapTipos.vertex) {{
                    for (let i = 0; i < positions.count; i += 3) {{ // Cada 3 vertices para reducir memoria
                        const v = new THREE.Vector3(
                            positions.getX(i),
                            positions.getY(i),
                            positions.getZ(i)
                        ).applyMatrix4(matrixWorld);
                        snapPuntos.push({{ pos: v, tipo: 'Vértice' }});
                    }}
                }}

                // Centro del objeto
                if (snapTipos.center) {{
                    mesh.geometry.computeBoundingBox();
                    const center = new THREE.Vector3();
                    mesh.geometry.boundingBox.getCenter(center);
                    center.applyMatrix4(matrixWorld);
                    snapPuntos.push({{ pos: center, tipo: 'Centro' }});
                }}
            }});
            log(`Snap: ${{snapPuntos.length}} puntos calculados`);
        }}

        function encontrarSnapPunto(screenX, screenY) {{
            if (!snapActivo || snapPuntos.length === 0) return null;

            const minDistScreen = 15; // pixels
            let mejorPunto = null;
            let mejorDist = Infinity;

            snapPuntos.forEach(sp => {{
                const screenPos = sp.pos.clone().project(camera);
                const sx = (screenPos.x + 1) / 2 * window.innerWidth;
                const sy = (-screenPos.y + 1) / 2 * window.innerHeight;

                const dist = Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2);
                if (dist < minDistScreen && dist < mejorDist) {{
                    mejorDist = dist;
                    mejorPunto = sp;
                }}
            }});

            return mejorPunto;
        }}

        function mostrarSnapIndicador(sp, screenX, screenY) {{
            if (sp) {{
                snapIndicator.style.display = 'block';
                snapIndicator.style.left = screenX + 'px';
                snapIndicator.style.top = (screenY - 25) + 'px';
                snapIndicator.textContent = sp.tipo;
                snapPuntoActual = sp;
            }} else {{
                snapIndicator.style.display = 'none';
                snapPuntoActual = null;
            }}
        }}

        // ========== FUNCIONES DE DIBUJO ==========
        function obtenerPunto3D(event) {{
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            // Primero buscar snap
            const snapPunto = encontrarSnapPunto(event.clientX, event.clientY);
            if (snapPunto) {{
                mostrarSnapIndicador(snapPunto, event.clientX, event.clientY);
                return snapPunto.pos.clone();
            }}

            // Si no hay snap, usar raycasting al plano XZ
            mouse.x = (x / rect.width) * 2 - 1;
            mouse.y = -(y / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);

            // Intersectar con geometrias o plano de trabajo
            const intersects = raycaster.intersectObjects(geometries);
            if (intersects.length > 0) {{
                mostrarSnapIndicador(null, 0, 0);
                return intersects[0].point.clone();
            }}

            // Plano de trabajo en Y=0
            const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const punto = new THREE.Vector3();
            raycaster.ray.intersectPlane(plano, punto);

            mostrarSnapIndicador(null, 0, 0);
            return punto;
        }}

        function aplicarOrtho(inicio, fin) {{
            if (!orthoActivo || !inicio) return fin;

            const dx = Math.abs(fin.x - inicio.x);
            const dy = Math.abs(fin.y - inicio.y);
            const dz = Math.abs(fin.z - inicio.z);

            // Encontrar el eje dominante
            if (dx >= dy && dx >= dz) {{
                return new THREE.Vector3(fin.x, inicio.y, inicio.z);
            }} else if (dy >= dx && dy >= dz) {{
                return new THREE.Vector3(inicio.x, fin.y, inicio.z);
            }} else {{
                return new THREE.Vector3(inicio.x, inicio.y, fin.z);
            }}
        }}

        function dibujarLineaTemporal(inicio, fin) {{
            if (lineaTemporal) {{
                lineasGroup.remove(lineaTemporal);
                lineaTemporal.geometry.dispose();
            }}

            const geometry = new THREE.BufferGeometry().setFromPoints([inicio, fin]);
            lineaTemporal = new THREE.Line(geometry, lineaTempMaterial);
            lineasGroup.add(lineaTemporal);

            // Mostrar info de linea
            const longitud = inicio.distanceTo(fin);
            const dx = fin.x - inicio.x;
            const dz = fin.z - inicio.z;
            const angulo = Math.atan2(dz, dx) * 180 / Math.PI;

            lineInfo.style.display = 'block';
            lineInfo.textContent = `Longitud: ${{longitud.toFixed(2)}} | Ángulo: ${{angulo.toFixed(1)}}°`;
        }}

        function confirmarLinea(inicio, fin) {{
            const geometry = new THREE.BufferGeometry().setFromPoints([inicio, fin]);
            const linea = new THREE.Line(geometry, lineaMaterial.clone());
            lineasGroup.add(linea);
            lineasDibujadas.push(linea);

            // Guardar en historial
            historialLineas.push(linea);
            if (historialLineas.length > MAX_HISTORIAL) {{
                const old = historialLineas.shift();
                // No eliminar, solo quitar del historial
            }}

            log(`Línea dibujada: (${{inicio.x.toFixed(2)}}, ${{inicio.y.toFixed(2)}}, ${{inicio.z.toFixed(2)}}) -> (${{fin.x.toFixed(2)}}, ${{fin.y.toFixed(2)}}, ${{fin.z.toFixed(2)}})`);
        }}

        function deshacerLinea() {{
            if (historialLineas.length > 0) {{
                const linea = historialLineas.pop();
                lineasGroup.remove(linea);
                const idx = lineasDibujadas.indexOf(linea);
                if (idx > -1) lineasDibujadas.splice(idx, 1);
                linea.geometry.dispose();
                log('Línea deshecha');
            }}
        }}

        function limpiarLineas() {{
            lineasDibujadas.forEach(l => {{
                lineasGroup.remove(l);
                l.geometry.dispose();
            }});
            lineasDibujadas.length = 0;
            historialLineas.length = 0;
            log('Líneas limpiadas');
        }}

        // ========== FUNCIONES DE NIVELES ==========
        function detectarNiveles() {{
            niveles = [];
            const alturasSet = new Set();

            geometries.forEach(mesh => {{
                mesh.geometry.computeBoundingBox();
                const box = mesh.geometry.boundingBox;
                const minY = box.min.y;
                const maxY = box.max.y;

                // Redondear a 0.5 para agrupar
                const nivel = Math.round(minY * 2) / 2;
                alturasSet.add(nivel);
            }});

            niveles = Array.from(alturasSet).sort((a, b) => a - b);
            log(`Niveles detectados: ${{niveles.length}}`);
        }}

        function mostrarNivel(indice) {{
            nivelActual = indice;

            if (indice === -1) {{
                // Mostrar todos
                geometries.forEach(m => m.visible = true);
                currentLevelEl.textContent = 'Todos';
            }} else if (indice >= 0 && indice < niveles.length) {{
                const alturaTarget = niveles[indice];
                const tolerancia = 3; // metros de tolerancia

                geometries.forEach(mesh => {{
                    mesh.geometry.computeBoundingBox();
                    const minY = mesh.geometry.boundingBox.min.y;
                    mesh.visible = Math.abs(minY - alturaTarget) < tolerancia;
                }});

                currentLevelEl.textContent = `${{(indice + 1)}} (${{alturaTarget.toFixed(1)}}m)`;
            }}
        }}

        // ========== FUNCIONES DE CLIPPING ==========
        function activarClip(axis) {{
            clipAxis = axis;
            clipSliderContainer.style.display = 'flex';
            clipAxisLabel.textContent = `Corte ${{axis.toUpperCase()}}`;

            if (!clipPlane) {{
                clipPlane = new THREE.Plane();
            }}

            actualizarClip(50);
            renderer.localClippingEnabled = true;
        }}

        function actualizarClip(porcentaje) {{
            if (!clipPlane || !window.modelCenter || !window.modelMaxDim) return;

            const centro = window.modelCenter;
            const dim = window.modelMaxDim;
            const offset = (porcentaje / 100 - 0.5) * dim * 2;

            switch(clipAxis) {{
                case 'x':
                    clipPlane.set(new THREE.Vector3(1, 0, 0), -(centro.x + offset));
                    break;
                case 'y':
                    clipPlane.set(new THREE.Vector3(0, 1, 0), -(centro.y + offset));
                    break;
                case 'z':
                    clipPlane.set(new THREE.Vector3(0, 0, 1), -(centro.z + offset));
                    break;
            }}

            // Aplicar a todos los materiales
            geometries.forEach(mesh => {{
                if (mesh.material) {{
                    mesh.material.clippingPlanes = [clipPlane];
                    mesh.material.clipShadows = true;
                }}
            }});

            clipValueEl.textContent = porcentaje + '%';
        }}

        function desactivarClip() {{
            clipSliderContainer.style.display = 'none';
            clipAxis = null;
            renderer.localClippingEnabled = false;

            geometries.forEach(mesh => {{
                if (mesh.material) {{
                    mesh.material.clippingPlanes = [];
                }}
            }});
        }}

        // ========== FUNCIONES DE VISTAS ==========
        function setView(viewName) {{
            if (!window.modelCenter || !window.modelMaxDim) return;

            const c = window.modelCenter;
            const d = window.modelMaxDim * 1.5;

            switch(viewName) {{
                case 'top':
                    camera.position.set(c.x, c.y + d, c.z);
                    camera.up.set(0, 0, -1);
                    break;
                case 'front':
                    camera.position.set(c.x, c.y, c.z + d);
                    camera.up.set(0, 1, 0);
                    break;
                case 'back':
                    camera.position.set(c.x, c.y, c.z - d);
                    camera.up.set(0, 1, 0);
                    break;
                case 'right':
                    camera.position.set(c.x + d, c.y, c.z);
                    camera.up.set(0, 1, 0);
                    break;
                case 'left':
                    camera.position.set(c.x - d, c.y, c.z);
                    camera.up.set(0, 1, 0);
                    break;
                case 'iso':
                    camera.position.set(c.x + d, c.y + d, c.z + d);
                    camera.up.set(0, 1, 0);
                    break;
            }}

            controls.target.copy(c);
            controls.update();
            log(`Vista: ${{viewName}}`);
        }}

        let ifcApi = null;
        let modelID = null;
        const geometries = [];

        async function loadIFC() {{
            const startTime = performance.now();
            let meshCount = 0;
            let triangleCount = 0;
            let vertexCount = 0;

            try {{
                updateProgress(5, 'Inicializando web-ifc...');
                log('Iniciando carga de IFC');

                ifcApi = new WebIFC.IfcAPI();
                {wasmLocateLogic}
                await ifcApi.Init();
                log('web-ifc inicializado');

                updateProgress(10, 'Descargando archivo IFC...');
                progressText.textContent = 'Archivo: {escapedFileName}';

                // Fetch the IFC file
                const response = await fetch('{ifcRelativePath}');
                if (!response.ok) {{
                    throw new Error(`Error descargando archivo: ${{response.status}} ${{response.statusText}}`);
                }}

                const contentLength = response.headers.get('content-length');
                const totalSize = contentLength ? parseInt(contentLength) : 0;

                updateProgress(15, 'Leyendo datos...');
                if (totalSize > 0) {{
                    progressText.textContent = `Tamaño: ${{(totalSize / 1024 / 1024).toFixed(1)}} MB`;
                }}

                const arrayBuffer = await response.arrayBuffer();
                const ifcData = new Uint8Array(arrayBuffer);
                log(`Archivo cargado: ${{ifcData.length.toLocaleString()}} bytes`);

                updateProgress(25, 'Abriendo modelo IFC...');
                modelID = ifcApi.OpenModel(ifcData);
                log(`Modelo abierto, ID: ${{modelID}}`);

                updateProgress(30, 'Analizando geometría...');
                const flatMeshes = ifcApi.LoadAllGeometry(modelID);
                const totalMeshes = flatMeshes.size();
                log(`Total meshes: ${{totalMeshes}}`);

                updateProgress(35, `Procesando ${{totalMeshes.toLocaleString()}} elementos...`);

                // Material cache
                const materials = {{}};

                // Process in chunks
                const chunkSize = 100;

                for (let i = 0; i < totalMeshes; i += chunkSize) {{
                    const end = Math.min(i + chunkSize, totalMeshes);

                    for (let j = i; j < end; j++) {{
                        const flatMesh = flatMeshes.get(j);
                        const expressID = flatMesh.expressID;
                        const placedGeometries = flatMesh.geometries;

                        for (let k = 0; k < placedGeometries.size(); k++) {{
                            const pg = placedGeometries.get(k);
                            const geometry = ifcApi.GetGeometry(modelID, pg.geometryExpressID);

                            const vertices = ifcApi.GetVertexArray(
                                geometry.GetVertexData(),
                                geometry.GetVertexDataSize()
                            );
                            const indices = ifcApi.GetIndexArray(
                                geometry.GetIndexData(),
                                geometry.GetIndexDataSize()
                            );

                            if (vertices.length === 0 || indices.length === 0) continue;

                            const bufferGeometry = new THREE.BufferGeometry();
                            const positions = new Float32Array(vertices.length / 2);
                            const normals = new Float32Array(vertices.length / 2);

                            for (let v = 0; v < vertices.length; v += 6) {{
                                const idx = v / 6 * 3;
                                positions[idx] = vertices[v];
                                positions[idx + 1] = vertices[v + 1];
                                positions[idx + 2] = vertices[v + 2];
                                normals[idx] = vertices[v + 3];
                                normals[idx + 1] = vertices[v + 4];
                                normals[idx + 2] = vertices[v + 5];
                            }}

                            bufferGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                            bufferGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                            bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

                            const color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
                            const colorKey = color.getHexString();

                            if (!materials[colorKey]) {{
                                materials[colorKey] = new THREE.MeshPhongMaterial({{
                                    color: color,
                                    side: THREE.DoubleSide,
                                    transparent: pg.color.w < 1,
                                    opacity: pg.color.w
                                }});
                            }}

                            const mesh = new THREE.Mesh(bufferGeometry, materials[colorKey]);
                            const matrix = new THREE.Matrix4().fromArray(pg.flatTransformation);
                            mesh.applyMatrix4(matrix);
                            mesh.userData.expressID = expressID;

                            // Obtener tipo IFC del elemento
                            let ifcType = 'OTHER';
                            try {{
                                const line = ifcApi.GetLine(modelID, expressID);
                                if (line && line.constructor && line.constructor.name) {{
                                    const typeName = line.constructor.name.toUpperCase();
                                    if (typeName.includes('WALL')) ifcType = 'WALL';
                                    else if (typeName.includes('SLAB') || typeName.includes('FLOOR') || typeName.includes('ROOF')) ifcType = 'SLAB';
                                    else if (typeName.includes('COLUMN')) ifcType = 'COLUMN';
                                    else if (typeName.includes('BEAM')) ifcType = 'BEAM';
                                    else if (typeName.includes('WINDOW')) ifcType = 'WINDOW';
                                    else if (typeName.includes('DOOR')) ifcType = 'DOOR';
                                }}
                            }} catch (e) {{ /* ignore */ }}
                            mesh.userData.ifcType = ifcType;

                            scene.add(mesh);
                            geometries.push(mesh);

                            // Store data for selection
                            meshDataMap.set(mesh.uuid, {{
                                expressID: expressID,
                                color: colorKey,
                                triangles: indices.length / 3,
                                vertices: positions.length / 3,
                                ifcType: ifcType
                            }});

                            meshCount++;
                            triangleCount += indices.length / 3;
                            vertexCount += positions.length / 3;
                        }}
                    }}

                    const progress = 35 + (i / totalMeshes) * 55;
                    updateProgress(progress, `Procesando: ${{Math.round((i / totalMeshes) * 100)}}%`);
                    progressText.textContent = `${{i.toLocaleString()}} / ${{totalMeshes.toLocaleString()}} elementos`;

                    await new Promise(r => setTimeout(r, 0));
                }}

                updateProgress(95, 'Ajustando cámara...');

                // Fit to view
                if (geometries.length > 0) {{
                    const box = new THREE.Box3().setFromObject(scene);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);

                    camera.position.set(center.x + maxDim * 1.5, center.y + maxDim * 1.5, center.z + maxDim * 1.5);
                    camera.far = maxDim * 20;
                    camera.updateProjectionMatrix();
                    controls.target.copy(center);
                    controls.update();

                    // Store for fit-to-view
                    window.modelCenter = center;
                    window.modelMaxDim = maxDim;
                }}

                const endTime = performance.now();
                const loadTime = ((endTime - startTime) / 1000).toFixed(1);

                updateProgress(100, 'Modelo cargado');
                log(`Carga completada en ${{loadTime}}s`);

                // Update stats
                statsEl.innerHTML = `
                    <div>Elementos: ${{meshCount.toLocaleString()}}</div>
                    <div>Triángulos: ${{triangleCount.toLocaleString()}}</div>
                    <div>Vértices: ${{vertexCount.toLocaleString()}}</div>
                    <div>Tiempo: ${{loadTime}}s</div>
                `;

                setTimeout(() => {{
                    loading.style.display = 'none';
                }}, 500);

            }} catch (error) {{
                console.error('Error loading IFC:', error);
                log('ERROR: ' + error.message);
                statusEl.textContent = 'Error: ' + error.message;
                statusEl.style.color = '#ff6b6b';
                progressText.textContent = 'Verifica que el archivo IFC esté en el mismo directorio que el HTML';
            }}
        }}

        // ========== EVENT LISTENERS TOOLBAR ==========

        // Funcion para activar boton en toolbar
        function activarBotonToolbar(btnId) {{
            document.querySelectorAll('#toolbar .btn-tool').forEach(btn => {{
                btn.classList.remove('active');
            }});
            const btn = document.getElementById(btnId);
            if (btn) btn.classList.add('active');
        }}

        // Boton Seleccionar
        document.getElementById('btnSelect')?.addEventListener('click', () => {{
            modoActual = 'select';
            activarBotonToolbar('btnSelect');
            dibujando = false;
            puntoInicial = null;
            lineInfo.style.display = 'none';
            if (lineaTemporal) {{
                lineasGroup.remove(lineaTemporal);
                lineaTemporal = null;
            }}
            controls.enabled = true;
            log('Modo: Seleccionar');
        }});

        // Boton Linea
        document.getElementById('btnLinea')?.addEventListener('click', () => {{
            modoActual = 'linea';
            activarBotonToolbar('btnLinea');
            dibujando = false;
            puntoInicial = null;
            controls.enabled = false;
            log('Modo: Dibujar Línea');
        }});

        // Boton Polilinea
        document.getElementById('btnPolilinea')?.addEventListener('click', () => {{
            modoActual = 'polilinea';
            activarBotonToolbar('btnPolilinea');
            dibujando = false;
            puntoInicial = null;
            controls.enabled = false;
            log('Modo: Dibujar Polilínea');
        }});

        // Boton Snap
        const btnSnap = document.getElementById('btnSnap');
        btnSnap?.addEventListener('click', (e) => {{
            e.stopPropagation();
            snapActivo = !snapActivo;
            btnSnap.querySelector('span').textContent = snapActivo ? 'Snap ON' : 'Snap OFF';
            btnSnap.classList.toggle('active', snapActivo);

            // Mostrar/ocultar menu
            if (snapMenu.style.display === 'none' || snapMenu.style.display === '') {{
                snapMenu.style.display = 'block';
            }} else {{
                snapMenu.style.display = 'none';
            }}

            if (snapActivo && snapPuntos.length === 0) {{
                actualizarSnapPuntos();
            }}
            log(`Snap: ${{snapActivo ? 'ON' : 'OFF'}}`);
        }});

        // Checkboxes del menu Snap
        document.querySelectorAll('#snap-menu input[type=checkbox]').forEach(cb => {{
            cb.addEventListener('change', () => {{
                const tipo = cb.id.replace('snap', '').toLowerCase();
                snapTipos[tipo] = cb.checked;
                if (snapActivo) actualizarSnapPuntos();
            }});
        }});

        // Cerrar menu snap al hacer click fuera
        document.addEventListener('click', (e) => {{
            if (!snapMenu.contains(e.target) && e.target.id !== 'btnSnap') {{
                snapMenu.style.display = 'none';
            }}
        }});

        // Boton Ortho
        const btnOrtho = document.getElementById('btnOrtho');
        btnOrtho?.addEventListener('click', () => {{
            orthoActivo = !orthoActivo;
            btnOrtho.querySelector('span').textContent = orthoActivo ? 'Ortho ON' : 'Ortho OFF';
            btnOrtho.classList.toggle('active', orthoActivo);
            log(`Ortho: ${{orthoActivo ? 'ON' : 'OFF'}}`);
        }});

        // Boton Grid
        const btnGrid = document.getElementById('btnGrid');
        btnGrid?.addEventListener('click', () => {{
            gridVisible = !gridVisible;
            gridHelper.visible = gridVisible;
            btnGrid.classList.toggle('active', gridVisible);
            log(`Grid: ${{gridVisible ? 'visible' : 'oculto'}}`);
        }});

        // Boton Deshacer
        document.getElementById('btnUndo')?.addEventListener('click', deshacerLinea);

        // Boton Limpiar
        document.getElementById('btnClear')?.addEventListener('click', limpiarLineas);

        // Botones de Niveles
        document.getElementById('btnLevelUp')?.addEventListener('click', () => {{
            if (nivelActual < niveles.length - 1) {{
                mostrarNivel(nivelActual + 1);
            }}
        }});

        document.getElementById('btnLevelDown')?.addEventListener('click', () => {{
            if (nivelActual > 0) {{
                mostrarNivel(nivelActual - 1);
            }} else if (nivelActual === -1 && niveles.length > 0) {{
                mostrarNivel(niveles.length - 1);
            }}
        }});

        document.getElementById('btnLevelAll')?.addEventListener('click', () => {{
            mostrarNivel(-1);
        }});

        // Botones de Vistas
        document.querySelectorAll('.btn-view').forEach(btn => {{
            btn.addEventListener('click', () => {{
                const view = btn.dataset.view;
                setView(view);
            }});
        }});

        // Botones de Clipping
        document.getElementById('btnClipX')?.addEventListener('click', () => activarClip('x'));
        document.getElementById('btnClipY')?.addEventListener('click', () => activarClip('y'));
        document.getElementById('btnClipZ')?.addEventListener('click', () => activarClip('z'));
        document.getElementById('btnClipOff')?.addEventListener('click', desactivarClip);

        // Slider de Clipping
        clipSlider?.addEventListener('input', (e) => {{
            actualizarClip(parseInt(e.target.value));
        }});

        // ========== FILTROS POR TIPO DE ELEMENTO ==========
        function aplicarFiltros() {{
            const filtros = {{
                WALL: document.getElementById('filterWalls')?.checked ?? true,
                SLAB: document.getElementById('filterSlabs')?.checked ?? true,
                COLUMN: document.getElementById('filterColumns')?.checked ?? true,
                BEAM: document.getElementById('filterBeams')?.checked ?? true,
                WINDOW: document.getElementById('filterWindows')?.checked ?? true,
                DOOR: document.getElementById('filterDoors')?.checked ?? true,
                OTHER: document.getElementById('filterOther')?.checked ?? true
            }};

            geometries.forEach(mesh => {{
                const tipo = mesh.userData.ifcType || 'OTHER';
                mesh.visible = filtros[tipo] ?? true;
            }});

            log(`Filtros aplicados`);
        }}

        // Event listeners para checkboxes de filtros
        ['filterWalls', 'filterSlabs', 'filterColumns', 'filterBeams', 'filterWindows', 'filterDoors', 'filterOther'].forEach(id => {{
            document.getElementById(id)?.addEventListener('change', aplicarFiltros);
        }});

        // Botones mostrar/ocultar todo
        document.getElementById('btnShowAll')?.addEventListener('click', () => {{
            ['filterWalls', 'filterSlabs', 'filterColumns', 'filterBeams', 'filterWindows', 'filterDoors', 'filterOther'].forEach(id => {{
                const cb = document.getElementById(id);
                if (cb) cb.checked = true;
            }});
            aplicarFiltros();
        }});

        document.getElementById('btnHideAll')?.addEventListener('click', () => {{
            ['filterWalls', 'filterSlabs', 'filterColumns', 'filterBeams', 'filterWindows', 'filterDoors', 'filterOther'].forEach(id => {{
                const cb = document.getElementById(id);
                if (cb) cb.checked = false;
            }});
            aplicarFiltros();
        }});

        // ========== EVENTOS DEL CANVAS ==========

        // Click en canvas
        canvas.addEventListener('click', (event) => {{
            if (modoActual === 'select') {{
                // Seleccion de objeto
                const rect = canvas.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(geometries);

                if (selectedMesh && originalMaterial) {{
                    selectedMesh.material = originalMaterial;
                }}

                if (intersects.length > 0) {{
                    selectedMesh = intersects[0].object;
                    originalMaterial = selectedMesh.material;
                    selectedMesh.material = selectMaterial;

                    const data = meshDataMap.get(selectedMesh.uuid);
                    if (data) {{
                        const tipoNombre = {{
                            WALL: 'Muro', SLAB: 'Losa', COLUMN: 'Columna',
                            BEAM: 'Viga', WINDOW: 'Ventana', DOOR: 'Puerta', OTHER: 'Otro'
                        }}[data.ifcType || 'OTHER'] || 'Otro';
                        selectedProps.innerHTML = `
                            <div class=""prop""><span class=""prop-name"">Express ID:</span> <span class=""prop-value"">${{data.expressID}}</span></div>
                            <div class=""prop""><span class=""prop-name"">Tipo:</span> <span class=""prop-value"" style=""color: #4fc3f7;"">${{tipoNombre}}</span></div>
                            <div class=""prop""><span class=""prop-name"">Triángulos:</span> <span class=""prop-value"">${{data.triangles.toLocaleString()}}</span></div>
                            <div class=""prop""><span class=""prop-name"">Vértices:</span> <span class=""prop-value"">${{data.vertices.toLocaleString()}}</span></div>
                            <div class=""prop""><span class=""prop-name"">Color:</span> <span class=""prop-value"">#${{data.color}}</span></div>
                        `;
                        selectedInfo.style.display = 'block';
                        log(`Seleccionado: ${{tipoNombre}} (ExpressID ${{data.expressID}})`);
                    }}
                }} else {{
                    selectedMesh = null;
                    originalMaterial = null;
                    selectedInfo.style.display = 'none';
                }}
            }} else if (modoActual === 'linea') {{
                // Dibujar linea
                let punto = obtenerPunto3D(event);
                if (orthoActivo && puntoInicial) {{
                    punto = aplicarOrtho(puntoInicial, punto);
                }}

                if (!puntoInicial) {{
                    puntoInicial = punto;
                    log(`Línea: Punto inicial (${{punto.x.toFixed(2)}}, ${{punto.y.toFixed(2)}}, ${{punto.z.toFixed(2)}})`);
                }} else {{
                    confirmarLinea(puntoInicial, punto);
                    puntoInicial = null;
                    lineInfo.style.display = 'none';
                    if (lineaTemporal) {{
                        lineasGroup.remove(lineaTemporal);
                        lineaTemporal = null;
                    }}
                }}
            }} else if (modoActual === 'polilinea') {{
                let punto = obtenerPunto3D(event);
                if (orthoActivo && puntoInicial) {{
                    punto = aplicarOrtho(puntoInicial, punto);
                }}

                if (!puntoInicial) {{
                    puntoInicial = punto;
                }} else {{
                    confirmarLinea(puntoInicial, punto);
                    puntoInicial = punto; // Continuar desde el ultimo punto
                }}
            }}
        }});

        // Movimiento del mouse
        canvas.addEventListener('mousemove', (event) => {{
            // Actualizar coordenadas
            let punto = obtenerPunto3D(event);
            coordDisplay.textContent = `X: ${{punto.x.toFixed(2)}} Y: ${{punto.y.toFixed(2)}} Z: ${{punto.z.toFixed(2)}}`;

            // Dibujar linea temporal
            if ((modoActual === 'linea' || modoActual === 'polilinea') && puntoInicial) {{
                if (orthoActivo) {{
                    punto = aplicarOrtho(puntoInicial, punto);
                }}
                dibujarLineaTemporal(puntoInicial, punto);
            }}
        }});

        // Doble click para terminar polilinea
        canvas.addEventListener('dblclick', () => {{
            if (modoActual === 'polilinea' && puntoInicial) {{
                puntoInicial = null;
                lineInfo.style.display = 'none';
                if (lineaTemporal) {{
                    lineasGroup.remove(lineaTemporal);
                    lineaTemporal = null;
                }}
                log('Polilínea terminada');
            }}
        }});

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {{
            if (e.key === 'f' || e.key === 'F') {{
                if (window.modelCenter && window.modelMaxDim) {{
                    camera.position.set(
                        window.modelCenter.x + window.modelMaxDim * 1.5,
                        window.modelCenter.y + window.modelMaxDim * 1.5,
                        window.modelCenter.z + window.modelMaxDim * 1.5
                    );
                    controls.target.copy(window.modelCenter);
                    controls.update();
                    log('Fit to view');
                }}
            }}
            if (e.key === 'd' || e.key === 'D') {{
                showDebug = !showDebug;
                debugEl.style.display = showDebug ? 'block' : 'none';
                if (showDebug) {{
                    debugEl.innerHTML = debugLog.join('<br>');
                }}
                log(`Debug ${{showDebug ? 'activado' : 'desactivado'}}`);
            }}
            if (e.key === 'Escape') {{
                // Cancelar operacion actual
                puntoInicial = null;
                lineInfo.style.display = 'none';
                if (lineaTemporal) {{
                    lineasGroup.remove(lineaTemporal);
                    lineaTemporal = null;
                }}
                log('Operación cancelada');
            }}
            if (e.key === 'F8') {{
                // Toggle Ortho
                e.preventDefault();
                btnOrtho?.click();
            }}
            if (e.key === 's' || e.key === 'S') {{
                document.getElementById('btnSelect')?.click();
            }}
            if (e.key === 'l' || e.key === 'L') {{
                document.getElementById('btnLinea')?.click();
            }}
            if (e.key === 'p' || e.key === 'P') {{
                document.getElementById('btnPolilinea')?.click();
            }}
            if (e.key === 'g' || e.key === 'G') {{
                btnGrid?.click();
            }}
            if (e.ctrlKey && e.key === 'z') {{
                e.preventDefault();
                deshacerLinea();
            }}
        }});

        // Animation loop
        function animate() {{
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }}

        // Resize
        window.addEventListener('resize', () => {{
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }});

        // Inicializar despues de cargar el modelo
        async function inicializar() {{
            await loadIFC();
            detectarNiveles();
            actualizarSnapPuntos();
        }}

        animate();
        inicializar();
        log('Visor IFC iniciado');
    </script>
</body>
</html>";
        }

        private static string GenerateViewerHtml(string viewerId, string ifcBase64, string fileName, string wasmBasePath)
        {
            // Escape single quotes in data for JavaScript
            string escapedBase64 = ifcBase64.Replace("'", "\\'");
            string escapedFileName = fileName.Replace("'", "\\'");

            // Determine script sources based on wasmBasePath
            string threeJsSrc, orbitControlsSrc, webIfcSrc;
            string locateFileLogic;

            if (wasmBasePath == "cdn")
            {
                // Use CDN - Three.js v0.128.0 (UMD) + web-ifc v0.0.66
                threeJsSrc = "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js";
                orbitControlsSrc = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js";
                webIfcSrc = "https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/web-ifc-api-iife.js";
                locateFileLogic = "// WASM auto-resolved from CDN script URL by Emscripten";
            }
            else
            {
                // Use local paths (can be relative like ./libs or absolute like file:///...)
                threeJsSrc = $"{wasmBasePath}/three.min.js";
                orbitControlsSrc = $"{wasmBasePath}/OrbitControls.js";
                webIfcSrc = $"{wasmBasePath}/web-ifc-api-iife.js";
                locateFileLogic = $"ifcAPI.SetWasmPath('{wasmBasePath}/');";

                // Debug logging
                try
                {
                    var debugPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "calcpad-debug.txt");
                    System.IO.File.AppendAllText(debugPath,
                        $"[{DateTime.Now:HH:mm:ss}] IFC HTML Generator: wasmBasePath = '{wasmBasePath}'\n" +
                        $"[{DateTime.Now:HH:mm:ss}] IFC HTML Generator: threeJsSrc = '{threeJsSrc}'\n" +
                        $"[{DateTime.Now:HH:mm:ss}] IFC HTML Generator: orbitControlsSrc = '{orbitControlsSrc}'\n" +
                        $"[{DateTime.Now:HH:mm:ss}] IFC HTML Generator: webIfcSrc = '{webIfcSrc}'\n");
                }
                catch { }
            }

            return $@"
<div id=""{viewerId}"" class=""ifc-viewer-container"" style=""width: 100%; height: 600px; position: relative; background: #1e1e1e; border-radius: 8px; overflow: hidden; margin: 10px 0;"">
    <canvas id=""{viewerId}-canvas"" style=""width: 100%; height: 100%;""></canvas>
    <!-- TOOLBAR -->
    <div id=""{viewerId}-toolbar"" style=""position: absolute; top: 8px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; background: rgba(0,0,0,0.85); padding: 5px 8px; border-radius: 6px; z-index: 100;"">
        <button class=""{viewerId}-btn"" data-action=""select"" title=""Seleccionar"" style=""background: #2c3e50; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px;"">Seleccionar</button>
        <button class=""{viewerId}-btn"" data-action=""line"" title=""Dibujar Línea"" style=""background: #2c3e50; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px;"">Línea</button>
        <button class=""{viewerId}-btn {viewerId}-snap-btn"" data-action=""snap"" title=""Snap"" style=""background: #2c3e50; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px;"">Snap OFF</button>
        <button class=""{viewerId}-btn {viewerId}-ortho-btn"" data-action=""ortho"" title=""Ortho F8"" style=""background: #2c3e50; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px;"">Ortho OFF</button>
        <button class=""{viewerId}-btn {viewerId}-grid-btn"" data-action=""grid"" title=""Grid"" style=""background: #3498db; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px;"">Grid</button>
        <span style=""width: 1px; background: #555; margin: 0 3px;""></span>
        <button class=""{viewerId}-btn"" data-action=""top"" title=""Vista Planta"" style=""background: #2c3e50; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px;"">Planta</button>
        <button class=""{viewerId}-btn"" data-action=""front"" title=""Vista Frontal"" style=""background: #2c3e50; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px;"">Frontal</button>
        <button class=""{viewerId}-btn"" data-action=""3d"" title=""Vista 3D"" style=""background: #2c3e50; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px;"">3D</button>
        <button class=""{viewerId}-btn"" data-action=""fit"" title=""Fit to View"" style=""background: #2c3e50; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px;"">Fit</button>
    </div>
    <!-- FILTROS -->
    <div id=""{viewerId}-filters"" style=""position: absolute; top: 55px; left: 10px; background: rgba(0,0,0,0.85); padding: 8px; border-radius: 6px; font-size: 10px; z-index: 100;"">
        <div style=""color: #4fc3f7; font-weight: bold; margin-bottom: 5px;"">Filtrar</div>
        <label style=""display: flex; align-items: center; gap: 5px; margin: 3px 0; cursor: pointer;""><input type=""checkbox"" class=""{viewerId}-filter"" data-type=""WALL"" checked> Muros</label>
        <label style=""display: flex; align-items: center; gap: 5px; margin: 3px 0; cursor: pointer;""><input type=""checkbox"" class=""{viewerId}-filter"" data-type=""SLAB"" checked> Losas</label>
        <label style=""display: flex; align-items: center; gap: 5px; margin: 3px 0; cursor: pointer;""><input type=""checkbox"" class=""{viewerId}-filter"" data-type=""COLUMN"" checked> Columnas</label>
        <label style=""display: flex; align-items: center; gap: 5px; margin: 3px 0; cursor: pointer;""><input type=""checkbox"" class=""{viewerId}-filter"" data-type=""BEAM"" checked> Vigas</label>
        <label style=""display: flex; align-items: center; gap: 5px; margin: 3px 0; cursor: pointer;""><input type=""checkbox"" class=""{viewerId}-filter"" data-type=""OTHER"" checked> Otros</label>
    </div>
    <div id=""{viewerId}-info"" style=""position: absolute; top: 55px; right: 10px; background: rgba(0,0,0,0.7); color: #fff; padding: 10px 15px; border-radius: 5px; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"">
        <strong id=""{viewerId}-filename"">{fileName}</strong>
        <div id=""{viewerId}-stats""></div>
    </div>
    <div id=""{viewerId}-loading"" style=""position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff;"">
        <div style=""width: 50px; height: 50px; border: 3px solid #333; border-top-color: #0078d4; border-radius: 50%; animation: ifc-spin 1s linear infinite; margin: 0 auto;""></div>
        <p style=""margin-top: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"">Cargando modelo IFC...</p>
    </div>
    <div id=""{viewerId}-coords"" style=""position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: #4fc3f7; padding: 5px 15px; border-radius: 4px; font-family: monospace; font-size: 11px;"">X: 0.00 Y: 0.00 Z: 0.00</div>
    <div id=""{viewerId}-lineinfo"" style=""position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); background: rgba(52,152,219,0.9); color: white; padding: 5px 15px; border-radius: 4px; font-family: monospace; font-size: 11px; display: none;"">Longitud: 0.00</div>
    <div id=""{viewerId}-snap-indicator"" style=""position: absolute; padding: 3px 8px; background: rgba(241,196,15,0.9); color: black; border-radius: 4px; font-size: 10px; pointer-events: none; display: none; z-index: 150;""></div>
</div>
<style>
    @keyframes ifc-spin {{ to {{ transform: rotate(360deg); }} }}
</style>
<script src=""{threeJsSrc}""></script>
<script src=""{orbitControlsSrc}""></script>
<script src=""{webIfcSrc}""></script>
<script>
    (async function() {{
        const vid = '{viewerId}';
        const canvas = document.getElementById(vid + '-canvas');
        const stats = document.getElementById(vid + '-stats');
        const loading = document.getElementById(vid + '-loading');
        const container = document.getElementById(vid);
        const coordsEl = document.getElementById(vid + '-coords');
        const lineInfoEl = document.getElementById(vid + '-lineinfo');
        const snapIndicator = document.getElementById(vid + '-snap-indicator');

        if (!canvas || !container) return;

        // Estado
        let modo = 'select';
        let snapActivo = false;
        let orthoActivo = false;
        let gridVisible = true;
        let dibujando = false;
        let puntoInicial = null;
        const snapPuntos = [];
        const lineasGroup = new THREE.Group();
        let lineaTemporal = null;
        let modelCenter, modelMaxDim;

        try {{
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1e1e1e);

            const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 5000);
            camera.position.set(10, 10, 10);

            const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);

            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;

            scene.add(new THREE.AmbientLight(0xffffff, 0.5));
            const dirLight = new THREE.DirectionalLight(0xffffff, 1);
            dirLight.position.set(50, 100, 50);
            scene.add(dirLight);

            const gridHelper = new THREE.GridHelper(100, 50, 0x444444, 0x333333);
            scene.add(gridHelper);
            scene.add(lineasGroup);

            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            // Load IFC
            const ifcAPI = new WebIFC.IfcAPI();
            {locateFileLogic}
            await ifcAPI.Init();

            const base64Data = '{escapedBase64}';
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

            const modelID = ifcAPI.OpenModel(bytes);
            const flatMeshes = ifcAPI.LoadAllGeometry(modelID);

            const geometries = [];
            let totalTri = 0, totalVert = 0;

            for (let i = 0; i < flatMeshes.size(); i++) {{
                const fm = flatMeshes.get(i);
                const expressID = fm.expressID;
                const pgs = fm.geometries;

                for (let j = 0; j < pgs.size(); j++) {{
                    const pg = pgs.get(j);
                    const geom = ifcAPI.GetGeometry(modelID, pg.geometryExpressID);
                    const verts = ifcAPI.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                    const indices = ifcAPI.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

                    if (verts.length === 0 || indices.length === 0) continue;

                    const bufGeom = new THREE.BufferGeometry();
                    const pos = new Float32Array(verts.length / 2);
                    const norm = new Float32Array(verts.length / 2);

                    for (let k = 0; k < verts.length; k += 6) {{
                        const idx = k / 6 * 3;
                        pos[idx] = verts[k]; pos[idx+1] = verts[k+1]; pos[idx+2] = verts[k+2];
                        norm[idx] = verts[k+3]; norm[idx+1] = verts[k+4]; norm[idx+2] = verts[k+5];
                    }}

                    bufGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                    bufGeom.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
                    bufGeom.setIndex(new THREE.BufferAttribute(indices, 1));

                    const mat = new THREE.MeshPhongMaterial({{
                        color: new THREE.Color(pg.color.x, pg.color.y, pg.color.z),
                        side: THREE.DoubleSide, transparent: pg.color.w < 1, opacity: pg.color.w
                    }});

                    const mesh = new THREE.Mesh(bufGeom, mat);
                    mesh.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));

                    // Tipo IFC
                    let ifcType = 'OTHER';
                    try {{
                        const line = ifcAPI.GetLine(modelID, expressID);
                        if (line && line.constructor) {{
                            const tn = line.constructor.name.toUpperCase();
                            if (tn.includes('WALL')) ifcType = 'WALL';
                            else if (tn.includes('SLAB') || tn.includes('FLOOR')) ifcType = 'SLAB';
                            else if (tn.includes('COLUMN')) ifcType = 'COLUMN';
                            else if (tn.includes('BEAM')) ifcType = 'BEAM';
                        }}
                    }} catch(e) {{}}
                    mesh.userData.ifcType = ifcType;

                    scene.add(mesh);
                    geometries.push(mesh);

                    // Snap points
                    bufGeom.computeBoundingBox();
                    const c = new THREE.Vector3();
                    bufGeom.boundingBox.getCenter(c);
                    c.applyMatrix4(mesh.matrixWorld);
                    snapPuntos.push({{ pos: c, tipo: 'Centro' }});

                    totalTri += indices.length / 3;
                    totalVert += pos.length / 3;
                }}
            }}

            ifcAPI.CloseModel(modelID);

            // Fit camera
            if (geometries.length > 0) {{
                const box = new THREE.Box3();
                geometries.forEach(m => box.expandByObject(m));
                modelCenter = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                modelMaxDim = Math.max(size.x, size.y, size.z);
                camera.position.set(modelCenter.x + modelMaxDim*1.5, modelCenter.y + modelMaxDim*1.5, modelCenter.z + modelMaxDim*1.5);
                controls.target.copy(modelCenter);
                controls.update();
            }}

            stats.innerHTML = '<br>Elementos: ' + geometries.length + '<br>Triángulos: ' + totalTri.toLocaleString();
            loading.style.display = 'none';

            // Funciones
            function setView(v) {{
                const c = modelCenter, d = modelMaxDim * 2;
                if (v === 'top') {{ camera.position.set(c.x, c.y + d, c.z); camera.up.set(0, 0, -1); }}
                else if (v === 'front') {{ camera.position.set(c.x, c.y, c.z + d); camera.up.set(0, 1, 0); }}
                else if (v === '3d') {{ camera.position.set(c.x + d, c.y + d, c.z + d); camera.up.set(0, 1, 0); }}
                controls.target.copy(c);
                controls.update();
            }}

            function fitView() {{
                if (modelCenter && modelMaxDim) {{
                    camera.position.set(modelCenter.x + modelMaxDim*1.5, modelCenter.y + modelMaxDim*1.5, modelCenter.z + modelMaxDim*1.5);
                    controls.target.copy(modelCenter);
                    controls.update();
                }}
            }}

            function aplicarFiltros() {{
                document.querySelectorAll('.' + vid + '-filter').forEach(cb => {{
                    const tipo = cb.dataset.type;
                    const visible = cb.checked;
                    geometries.forEach(m => {{
                        if (m.userData.ifcType === tipo) m.visible = visible;
                    }});
                }});
            }}

            function encontrarSnap(sx, sy) {{
                if (!snapActivo) return null;
                let mejor = null, mejorD = 20;
                snapPuntos.forEach(sp => {{
                    const p = sp.pos.clone().project(camera);
                    const px = (p.x + 1) / 2 * container.clientWidth;
                    const py = (-p.y + 1) / 2 * container.clientHeight;
                    const d = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
                    if (d < mejorD) {{ mejorD = d; mejor = sp; }}
                }});
                return mejor;
            }}

            function getPunto3D(e) {{
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left, y = e.clientY - rect.top;
                const sp = encontrarSnap(x, y);
                if (sp) {{
                    snapIndicator.style.display = 'block';
                    snapIndicator.style.left = x + 'px';
                    snapIndicator.style.top = (y - 25) + 'px';
                    snapIndicator.textContent = sp.tipo;
                    return sp.pos.clone();
                }}
                snapIndicator.style.display = 'none';
                mouse.x = (x / rect.width) * 2 - 1;
                mouse.y = -(y / rect.height) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);
                const hits = raycaster.intersectObjects(geometries);
                if (hits.length > 0) return hits[0].point.clone();
                const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                const pt = new THREE.Vector3();
                raycaster.ray.intersectPlane(plano, pt);
                return pt;
            }}

            function aplicarOrtho(ini, fin) {{
                if (!orthoActivo || !ini) return fin;
                const dx = Math.abs(fin.x - ini.x), dy = Math.abs(fin.y - ini.y), dz = Math.abs(fin.z - ini.z);
                if (dx >= dy && dx >= dz) return new THREE.Vector3(fin.x, ini.y, ini.z);
                if (dy >= dx && dy >= dz) return new THREE.Vector3(ini.x, fin.y, ini.z);
                return new THREE.Vector3(ini.x, ini.y, fin.z);
            }}

            // Event listeners
            document.querySelectorAll('.' + vid + '-btn').forEach(btn => {{
                btn.addEventListener('click', () => {{
                    const a = btn.dataset.action;
                    if (a === 'select') {{ modo = 'select'; controls.enabled = true; }}
                    else if (a === 'line') {{ modo = 'line'; controls.enabled = false; puntoInicial = null; }}
                    else if (a === 'snap') {{
                        snapActivo = !snapActivo;
                        btn.textContent = snapActivo ? 'Snap ON' : 'Snap OFF';
                        btn.style.background = snapActivo ? '#3498db' : '#2c3e50';
                    }}
                    else if (a === 'ortho') {{
                        orthoActivo = !orthoActivo;
                        btn.textContent = orthoActivo ? 'Ortho ON' : 'Ortho OFF';
                        btn.style.background = orthoActivo ? '#3498db' : '#2c3e50';
                    }}
                    else if (a === 'grid') {{
                        gridVisible = !gridVisible;
                        gridHelper.visible = gridVisible;
                        btn.style.background = gridVisible ? '#3498db' : '#2c3e50';
                    }}
                    else if (a === 'top' || a === 'front' || a === '3d') setView(a);
                    else if (a === 'fit') fitView();
                }});
            }});

            document.querySelectorAll('.' + vid + '-filter').forEach(cb => cb.addEventListener('change', aplicarFiltros));

            canvas.addEventListener('mousemove', (e) => {{
                const pt = getPunto3D(e);
                coordsEl.textContent = `X: ${{pt.x.toFixed(2)}} Y: ${{pt.y.toFixed(2)}} Z: ${{pt.z.toFixed(2)}}`;
                if (modo === 'line' && puntoInicial) {{
                    let fin = pt;
                    if (orthoActivo) fin = aplicarOrtho(puntoInicial, fin);
                    if (lineaTemporal) {{ lineasGroup.remove(lineaTemporal); lineaTemporal.geometry.dispose(); }}
                    const g = new THREE.BufferGeometry().setFromPoints([puntoInicial, fin]);
                    lineaTemporal = new THREE.Line(g, new THREE.LineBasicMaterial({{ color: 0xffff00 }}));
                    lineasGroup.add(lineaTemporal);
                    const len = puntoInicial.distanceTo(fin);
                    lineInfoEl.style.display = 'block';
                    lineInfoEl.textContent = `Longitud: ${{len.toFixed(2)}}`;
                }}
            }});

            canvas.addEventListener('click', (e) => {{
                if (modo === 'line') {{
                    let pt = getPunto3D(e);
                    if (orthoActivo && puntoInicial) pt = aplicarOrtho(puntoInicial, pt);
                    if (!puntoInicial) {{ puntoInicial = pt; }}
                    else {{
                        const g = new THREE.BufferGeometry().setFromPoints([puntoInicial, pt]);
                        const linea = new THREE.Line(g, new THREE.LineBasicMaterial({{ color: 0xff6600 }}));
                        lineasGroup.add(linea);
                        puntoInicial = null;
                        lineInfoEl.style.display = 'none';
                        if (lineaTemporal) {{ lineasGroup.remove(lineaTemporal); lineaTemporal = null; }}
                    }}
                }}
            }});

            document.addEventListener('keydown', (e) => {{
                if (e.key === 'f' || e.key === 'F') fitView();
                if (e.key === 'Escape') {{ puntoInicial = null; lineInfoEl.style.display = 'none'; if (lineaTemporal) {{ lineasGroup.remove(lineaTemporal); lineaTemporal = null; }} }}
            }});

            function animate() {{ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }}
            animate();

            const ro = new ResizeObserver(() => {{
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            }});
            ro.observe(container);

        }} catch (err) {{
            loading.innerHTML = '<p style=""color: #f44;"">Error: ' + err.message + '</p>';
        }}
    }})();
</script>";
        }

        /// <summary>
        /// Generate HTML viewer for ThatOpen Fragments files (.frag)
        /// Shows conversion and execution times
        /// </summary>
        private static string GenerateFragmentsViewer(string fragmentFileName, string displayName, int fragmentTime, int totalConversionTime)
        {
            string viewerId = $"ifc-fragments-{Guid.NewGuid():N}";
            // Use relative path for fragments (served by HTTP server)
            string fragmentUrl = $"./fragments/{fragmentFileName}";

            // No import map needed - @thatopen/components handles everything internally
            string importMapHtml = "";

            return $@"{importMapHtml}<style>
    #{viewerId} {{ width: 100%; height: 600px; position: relative; background: #1e1e1e; border-radius: 8px; overflow: hidden; margin: 10px 0; }}
    #{viewerId} canvas {{ width: 100% !important; height: 100% !important; }}
    @keyframes ifc-spin-{viewerId} {{ to {{ transform: rotate(360deg); }} }}
    .fragment-badge {{ background: #0078d4; color: white; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }}
</style>
<div id=""{viewerId}"" style=""width: 100%; height: 600px; position: relative; background: #1e1e1e; border-radius: 8px; overflow: hidden;"">
    <div id=""{viewerId}-info"" style=""position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: #fff; padding: 12px 15px; border-radius: 5px; font-size: 12px; max-width: 300px; z-index: 100;"">
        <div style=""display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"">
            <strong>{displayName}</strong>
            <span class=""fragment-badge"">FRAGMENTS</span>
        </div>
        <div id=""{viewerId}-stats"" style=""font-size: 11px; color: #aaa;""></div>
        <div id=""{viewerId}-times"" style=""font-size: 10px; color: #888; margin-top: 6px; padding-top: 6px; border-top: 1px solid #444;"">
            <div>⚡ Fragmentación: {fragmentTime} ms</div>
            <div>📦 Conversión total: {totalConversionTime} ms</div>
            <div id=""{viewerId}-loadtime""></div>
        </div>
    </div>
    <div id=""{viewerId}-loading"" style=""position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff; z-index: 100;"">
        <div style=""width: 50px; height: 50px; border: 3px solid #333; border-top-color: #0078d4; border-radius: 50%; animation: ifc-spin-{viewerId} 1s linear infinite; margin: 0 auto;""></div>
        <p style=""margin-top: 15px; font-size: 13px; color: #0078d4; font-weight: 600;"" id=""{viewerId}-status"">Cargando Fragments...</p>
    </div>
    <div style=""position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #fff; padding: 10px; border-radius: 5px; font-size: 11px; z-index: 100;"">
        <p><span style=""background: #444; padding: 2px 6px; border-radius: 3px; font-family: monospace;"">Click + Arrastrar</span> Rotar</p>
        <p><span style=""background: #444; padding: 2px 6px; border-radius: 3px; font-family: monospace;"">Scroll</span> Zoom</p>
    </div>
</div>
<script type=""module"">
// Using @thatopen/components for proper Three.js integration
import * as OBC from 'https://cdn.jsdelivr.net/npm/@thatopen/components@latest/+esm';

(async function() {{
    const containerId = '{viewerId}';
    const statsDiv = document.getElementById(containerId + '-stats');
    const loading = document.getElementById(containerId + '-loading');
    const status = document.getElementById(containerId + '-status');
    const loadtime = document.getElementById(containerId + '-loadtime');
    const container = document.getElementById(containerId);

    if (!container) {{
        console.error('Fragments Viewer: Container not found');
        return;
    }}

    function updateStatus(msg) {{
        if (status) status.textContent = msg;
        console.log('[Fragments Viewer]', msg);
    }}

    try {{
        const loadStart = performance.now();

        updateStatus('Inicializando ThatOpen Components...');

        // Initialize components
        const components = new OBC.Components();
        const worlds = components.get(OBC.Worlds);

        // Create world with scene, camera, and renderer
        const world = worlds.create();
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = null; // Use container's background color

        world.renderer = new OBC.SimpleRenderer(components, container);
        world.camera = new OBC.OrthoPerspectiveCamera(components);

        components.init();

        // Add grid
        const grids = components.get(OBC.Grids);
        grids.create(world);

        updateStatus('Inicializando FragmentsManager...');

        // Initialize FragmentsManager
        const fragments = components.get(OBC.FragmentsManager);
        const workerUrl = 'https://thatopen.github.io/engine_fragment/resources/worker.mjs';

        // Download worker as blob
        const workerResponse = await fetch(workerUrl);
        if (!workerResponse.ok) throw new Error('Error descargando worker: ' + workerResponse.status);
        const workerBlob = await workerResponse.blob();
        const workerFile = new File([workerBlob], 'worker.mjs', {{ type: 'text/javascript' }});
        const workerBlobUrl = URL.createObjectURL(workerFile);

        fragments.init(workerBlobUrl);

        let fragmentsDataSize = 0;

        // Handle loaded models
        fragments.list.onItemSet.add(({{ value: model }}) => {{
            console.log('[Fragments Viewer] Model loaded:', model);
            updateStatus('Modelo cargado, configurando...');

            model.useCamera(world.camera.three);
            world.scene.three.add(model.object);
            fragments.core.update(true);

            // Fit camera to model using OBC built-in method
            setTimeout(async () => {{
                try {{
                    // Use world.camera.fit which handles everything internally
                    if (world.camera.fit) {{
                        await world.camera.fit(world.meshes);
                        console.log('[Fragments Viewer] Camera fitted using world.camera.fit');
                    }}

                    // If fit didn't work well, try manual positioning using controls
                    if (world.camera.controls) {{
                        const controls = world.camera.controls;
                        // Get current camera position for logging
                        const cam = world.camera.three;
                        console.log('[Fragments Viewer] Camera position:', cam.position.toArray());

                        // Zoom out a bit more for better view
                        if (controls.dolly) {{
                            controls.dolly(-50, true);
                        }}
                    }}
                }} catch (e) {{
                    console.error('[Fragments Viewer] Error fitting camera:', e);
                }}
            }}, 500);

            // Update stats
            let meshCount = 0;
            let vertCount = 0;
            model.object.traverse((child) => {{
                if (child.isMesh) {{
                    meshCount++;
                    if (child.geometry && child.geometry.attributes.position) {{
                        vertCount += child.geometry.attributes.position.count;
                    }}
                }}
            }});

            console.log('[Fragments Viewer] Stats:', {{ meshCount, vertCount }});

            if (statsDiv) {{
                statsDiv.innerHTML = `Formato: Fragments<br>
                    Tamaño: ${{(fragmentsDataSize / 1024 / 1024).toFixed(2)}} MB<br>
                    Meshes: ${{meshCount}}<br>
                    Vértices: ${{vertCount.toLocaleString()}}`;
            }}

            const loadTime = Math.round(performance.now() - loadStart);
            if (loading) loading.style.display = 'none';
            if (loadtime) loadtime.innerHTML = '🚀 Tiempo carga: ' + loadTime + ' ms';
        }});

        updateStatus('Descargando Fragments...');

        // Load Fragments file
        const response = await fetch('{fragmentUrl}');
        if (!response.ok) throw new Error('Error descargando Fragments: ' + response.status);

        updateStatus('Parseando Fragments...');
        const buffer = await response.arrayBuffer();
        fragmentsDataSize = buffer.byteLength;
        console.log('[Fragments Viewer] Fragment file size:', fragmentsDataSize, 'bytes');

        updateStatus('Cargando modelo...');
        await fragments.core.load(buffer, {{ modelId: '{displayName}' }});
        console.log('[Fragments Viewer] Model loaded successfully');

    }} catch (error) {{
        console.error('Fragments Viewer Error:', error);
        if (loading) {{
            loading.innerHTML = '<p style=""color: #ff6b6b;"">Error: ' + error.message + '</p>';
        }}
    }}
}})();
</script>";
        }

        #region @{ucode} Support

        /// <summary>
        /// Extract content between @{blockType} and @{end blockType}
        /// </summary>
        private static string ExtractBlockContent(string content, string blockType)
        {
            var startTag = $"@{{{blockType}}}";
            var endTag = $"@{{end {blockType}}}";

            var startIdx = content.IndexOf(startTag, StringComparison.OrdinalIgnoreCase);
            if (startIdx < 0) return null;

            startIdx += startTag.Length;
            var endIdx = content.LastIndexOf(endTag, StringComparison.OrdinalIgnoreCase);

            if (endIdx <= startIdx) return null;

            return content.Substring(startIdx, endIdx - startIdx);
        }

        /// <summary>
        /// Add context menu (right-click) to HTML for copying as @{ucode}
        /// </summary>
        private static string AddContextMenuToHtml(string html, string originalContent)
        {
            // Context menu script - doesn't store original code, generates from DOM
            var contextMenuScript = @"
<style>
.ifc-context-menu {
    display: none;
    position: fixed;
    background: #2d2d44;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 8px 0;
    min-width: 200px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.ifc-context-menu.visible { display: block; }
.ifc-context-menu-item {
    padding: 10px 16px;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.ifc-context-menu-item:hover { background: #3d3d5c; }
.ifc-context-menu-item svg { width: 16px; height: 16px; }
.ifc-context-menu-separator { height: 1px; background: #444; margin: 5px 0; }
.ifc-context-menu-header { padding: 8px 16px; color: #888; font-size: 11px; text-transform: uppercase; }
</style>
<div id=""ifc-context-menu"" class=""ifc-context-menu"">
    <div class=""ifc-context-menu-header"">Copiar al Editor</div>
    <div class=""ifc-context-menu-item"" onclick=""copyAsCode()"">
        <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2""><path d=""M16 18l6-6-6-6M8 6l-6 6 6 6""/></svg>
        Copiar como @{code}
    </div>
    <div class=""ifc-context-menu-item"" onclick=""copyAsUcode()"">
        <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2""><rect x=""3"" y=""3"" width=""18"" height=""18"" rx=""2""/><path d=""M9 9h6M9 13h6M9 17h4""/></svg>
        Copiar como @{ucode}
    </div>
    <div class=""ifc-context-menu-separator""></div>
    <div class=""ifc-context-menu-item"" onclick=""syncToEditor()"">
        <svg viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2""><path d=""M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83""/></svg>
        Sincronizar Editor
    </div>
</div>
<script>
(function() {
    const menu = document.getElementById('ifc-context-menu');

    // Current viewer state (updated by viewer controls)
    window.ifcViewerState = window.ifcViewerState || {
        fondo: '#1a1a2e',
        camara: { pos: [10,10,10], target: [0,0,0], tipo: 'perspectiva' },
        controles: ['vistas', 'zoom', 'rotacion']
    };

    // Show context menu on right-click
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
        menu.classList.add('visible');
    });

    // Hide menu on click outside
    document.addEventListener('click', function() {
        menu.classList.remove('visible');
    });

    // Copy as @{code} - full HTML/JS code
    window.copyAsCode = function() {
        const code = '@{code}\n@{html-ifc}\n' + getCleanHtml() + '\n@{end html-ifc}\n@{end code}';
        copyToClipboard(code);
        sendToEditor(code);
        menu.classList.remove('visible');
    };

    // Copy as @{ucode} - simplified directives wrapper
    window.copyAsUcode = function() {
        const state = window.ifcViewerState;
        let ucode = '@{ucode}\n';

        // Si hay directivas originales, usarlas
        if (state.originalDirectives && state.originalDirectives.trim()) {
            ucode += state.originalDirectives.replace(/\\n/g, '\n');
        } else {
            // Generar directivas desde el estado actual
            // Archivo IFC (obligatorio)
            if (state.visor) ucode += '@{visor: ' + state.visor + '}\n';

            // Configuración básica
            ucode += '@{fondo: ' + state.fondo + '}\n';
            ucode += '@{altura: ' + (state.altura || '600') + '}\n';

            // Cámara
            ucode += '@{camara: tipo=' + state.camara.tipo + ', pos=' + state.camara.pos.join(',') + ', fov=' + (state.camara.fov || 75) + '}\n';

            // Controles
            ucode += '@{controles: ' + state.controles.join(', ') + '}\n';

            // Visualización
            if (state.grid) ucode += '@{grid: si}\n';
            if (state.ejes) ucode += '@{ejes: si}\n';
            if (state.sombras) ucode += '@{sombras: si}\n';
            if (state.wireframe) ucode += '@{wireframe: si}\n';

            // Panel VSCode-style
            if (state.seleccion) ucode += '@{seleccion: si}\n';
            if (state.propiedades) ucode += '@{propiedades: si}\n';
            if (state.arbol) ucode += '@{arbol: si}\n';
        }

        ucode += '@{end ucode}';
        copyToClipboard(ucode);
        sendToEditor(ucode);
        menu.classList.remove('visible');
    };

    // Sync current state to editor (@{code} wrapper with full HTML)
    window.syncToEditor = function() {
        const code = '@{code}\n@{html-ifc}\n' + getCleanHtml() + '\n@{end html-ifc}\n@{end code}';
        sendToEditor(code);
        menu.classList.remove('visible');
    };

    // Get clean HTML without the context menu itself
    function getCleanHtml() {
        // Clone the document
        const clone = document.documentElement.cloneNode(true);
        // Remove context menu elements
        const menuEl = clone.querySelector('#ifc-context-menu');
        if (menuEl) menuEl.remove();
        // Remove context menu styles and scripts (last style and last script)
        const styles = clone.querySelectorAll('style');
        const scripts = clone.querySelectorAll('script');
        if (styles.length > 0) {
            const lastStyle = styles[styles.length - 1];
            if (lastStyle.textContent.includes('ifc-context-menu')) lastStyle.remove();
        }
        if (scripts.length > 0) {
            const lastScript = scripts[scripts.length - 1];
            if (lastScript.textContent.includes('ifc-context-menu')) lastScript.remove();
        }
        return '<!DOCTYPE html>\n' + clone.outerHTML;
    }

    // Copy to clipboard
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(function() {
            console.log('Copied to clipboard');
        }).catch(function(err) {
            console.error('Copy failed:', err);
        });
    }

    // Send to AvalonEdit via WebView2
    function sendToEditor(code) {
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({
                type: 'updateEditor',
                content: code
            });
        }
    }
})();
</script>";

            // Insert context menu before closing </body> or at the end
            if (html.Contains("</body>"))
            {
                return html.Replace("</body>", contextMenuScript + "</body>");
            }
            else
            {
                return html + contextMenuScript;
            }
        }

        /// <summary>
        /// Generate HTML from @{ucode} simplified directives
        /// Parses directives like @{visor}, @{controles}, @{camara}, @{fondo}, @{altura} and generates full HTML/JS
        /// Supports both combined format: @{visor: fondo=#1e1e1e, altura=600}
        /// And individual format: @{fondo: #1e1e1e} @{altura: 600} @{visor: archivo.ifc}
        /// </summary>
        private static string GenerateHtmlFromUncode(string uncodeContent)
        {
            // ========== PARSE ALL DIRECTIVES ==========
            // Basic directives
            var visor = ParseDirective(uncodeContent, "visor");
            var fondoDirective = ParseDirective(uncodeContent, "fondo");
            var alturaDirective = ParseDirective(uncodeContent, "altura");
            var tituloDirective = ParseDirective(uncodeContent, "titulo");

            // Camera directives
            var camara = ParseDirective(uncodeContent, "camara");

            // Lighting directives
            var luz = ParseDirective(uncodeContent, "luz");
            var luzAmbiente = ParseDirective(uncodeContent, "luz.ambiente");
            var luzDireccional = ParseDirective(uncodeContent, "luz.direccional");

            // UI directives
            var controles = ParseDirective(uncodeContent, "controles");
            var toolbarDirective = ParseDirective(uncodeContent, "toolbar");
            var infoDirective = ParseDirective(uncodeContent, "info");

            // Visual directives
            var gridDirective = ParseDirective(uncodeContent, "grid");
            var wireframeDirective = ParseDirective(uncodeContent, "wireframe");
            var sombrasDirective = ParseDirective(uncodeContent, "sombras");
            var ejesDirective = ParseDirective(uncodeContent, "ejes");
            var opacidadDirective = ParseDirective(uncodeContent, "opacidad");

            // ========== EXTRACT VALUES ==========
            // Background color
            string fondo = !string.IsNullOrEmpty(fondoDirective) ? fondoDirective.Trim()
                         : GetParam(visor, "fondo", "#1a1a2e");

            // Height - extract only digits
            string alturaRaw = !string.IsNullOrEmpty(alturaDirective) ? alturaDirective.Trim()
                             : GetParam(visor, "altura", "600");
            var alturaDigits = Regex.Match(alturaRaw, @"(\d+)");
            string altura = alturaDigits.Success ? alturaDigits.Groups[1].Value : "600";
            if (string.IsNullOrEmpty(altura) || altura == "0") altura = "600";

            // Title
            string titulo = !string.IsNullOrEmpty(tituloDirective) ? tituloDirective.Trim() : "";

            // IFC file
            string archivo = !string.IsNullOrEmpty(visor) && !visor.Contains("=") ? visor.Trim()
                           : GetParam(visor, "archivo", "");

            // Camera settings
            string camaraTipo = GetParam(camara, "tipo", "perspectiva");
            string camaraPos = GetParam(camara, "pos", "50,50,50");
            string camaraTarget = GetParam(camara, "target", "0,0,0");
            string camaraFov = GetParam(camara, "fov", "75");

            // Lighting settings - extract numeric value from "intensidad=X" or use directly if numeric
            string ambienteIntensidad = ExtractNumericValue(luzAmbiente, "0.5");
            if (string.IsNullOrEmpty(ambienteIntensidad) || ambienteIntensidad == "0.5")
                ambienteIntensidad = GetParam(luz, "ambiente", "0.5");

            string direccionalIntensidad = ExtractNumericValue(luzDireccional, "0.8");
            if (string.IsNullOrEmpty(direccionalIntensidad) || direccionalIntensidad == "0.8")
                direccionalIntensidad = GetParam(luz, "direccional", "0.8");

            string luzColor = GetParam(luz, "color", "#ffffff");

            // UI settings
            bool mostrarToolbar = ParseBoolDirective(toolbarDirective, true);
            bool mostrarInfo = ParseBoolDirective(infoDirective, true);

            // Visual settings
            bool mostrarGrid = ParseBoolDirective(gridDirective, true);
            string gridTamano = GetParam(gridDirective, "tamano", "100");
            string gridDivisiones = GetParam(gridDirective, "divisiones", "100");

            bool wireframe = ParseBoolDirective(wireframeDirective, false);
            bool sombras = ParseBoolDirective(sombrasDirective, false);
            bool mostrarEjes = ParseBoolDirective(ejesDirective, false);

            string opacidad = !string.IsNullOrEmpty(opacidadDirective) ? opacidadDirective.Trim() : "1.0";

            // ========== NEW: VSCode-style IFC directives ==========
            var seleccionDirective = ParseDirective(uncodeContent, "seleccion");
            var propiedadesDirective = ParseDirective(uncodeContent, "propiedades");
            var arbolDirective = ParseDirective(uncodeContent, "arbol");
            var modeloAnaliticoDirective = ParseDirective(uncodeContent, "modelo-analitico");
            var snapDirective = ParseDirective(uncodeContent, "snap");

            bool habilitarSeleccion = ParseBoolDirective(seleccionDirective, false);
            bool mostrarPropiedades = ParseBoolDirective(propiedadesDirective, false);
            bool mostrarArbol = ParseBoolDirective(arbolDirective, false);
            bool habilitarModeloAnalitico = ParseBoolDirective(modeloAnaliticoDirective, false);
            string snapTipos = !string.IsNullOrEmpty(snapDirective) ? snapDirective : "esquinas,medios,centros";

            // ========== ANIMATION DIRECTIVES ==========
            // @{animacion: construccion} or @{animacion: tipo=construccion, velocidad=100, autoplay=si}
            var animacionDirective = ParseDirective(uncodeContent, "animacion");
            bool habilitarAnimacion = !string.IsNullOrEmpty(animacionDirective);
            string animacionTipo = GetParam(animacionDirective, "tipo",
                animacionDirective?.ToLower().Contains("construccion") == true ? "construccion" :
                animacionDirective?.ToLower().Contains("explosion") == true ? "explosion" :
                animacionDirective?.ToLower().Contains("orbita") == true ? "orbita" : "construccion");
            string animacionVelocidad = GetParam(animacionDirective, "velocidad", "50"); // ms between frames
            bool animacionAutoplay = GetParam(animacionDirective, "autoplay", "no").ToLower() == "si";

            // If any advanced feature is enabled, auto-enable selection
            if (mostrarPropiedades || mostrarArbol || habilitarModeloAnalitico)
                habilitarSeleccion = true;

            // ========== PARSE ADVANCED DIRECTIVES ==========
            // 3D Objects - @{cubo: pos=0,0,0, size=10, color=#ff0000}
            var cubos = ParseMultipleDirectives(uncodeContent, "cubo");
            var esferas = ParseMultipleDirectives(uncodeContent, "esfera");
            var planos = ParseMultipleDirectives(uncodeContent, "plano");
            var lineas = ParseMultipleDirectives(uncodeContent, "linea");
            var cilindros = ParseMultipleDirectives(uncodeContent, "cilindro");

            // Annotations - @{texto: pos=0,10,0, texto="Punto A", color=#ffffff, size=1}
            var textos = ParseMultipleDirectives(uncodeContent, "texto");
            var marcadores = ParseMultipleDirectives(uncodeContent, "marcador");

            // Clipping planes - @{corte: eje=x, pos=0}
            var cortes = ParseMultipleDirectives(uncodeContent, "corte");

            // Measurements - @{medida: desde=0,0,0, hasta=10,0,0, color=#00ff00}
            var medidas = ParseMultipleDirectives(uncodeContent, "medida");

            // DEBUG: Log what was found
            try
            {
                var debugPath = Path.Combine(Path.GetTempPath(), "calcpad-ifc-debug.txt");
                File.AppendAllText(debugPath, $"\n[{DateTime.Now:HH:mm:ss}] === GenerateHtmlFromUncode ===\n");
                File.AppendAllText(debugPath, $"Content length: {uncodeContent.Length}\n");
                File.AppendAllText(debugPath, $"Content preview: {uncodeContent.Substring(0, Math.Min(500, uncodeContent.Length))}\n");
                File.AppendAllText(debugPath, $"Cubos found: {cubos.Count}\n");
                File.AppendAllText(debugPath, $"Esferas found: {esferas.Count}\n");
                File.AppendAllText(debugPath, $"Planos found: {planos.Count}\n");
                File.AppendAllText(debugPath, $"Lineas found: {lineas.Count}\n");
                File.AppendAllText(debugPath, $"Cilindros found: {cilindros.Count}\n");
                File.AppendAllText(debugPath, $"Marcadores found: {marcadores.Count}\n");
                File.AppendAllText(debugPath, $"Medidas found: {medidas.Count}\n");
                foreach (var c in cubos) File.AppendAllText(debugPath, $"  Cubo: {c}\n");
            }
            catch { }

            // Controls list
            var controlesLista = controles?.Split(',').Select(c => c.Trim()).ToList()
                                 ?? new System.Collections.Generic.List<string> { "vistas", "zoom", "rotacion" };

            string viewerId = $"ifc-viewer-{Guid.NewGuid():N}";

            // Generate JavaScript for custom objects
            string customObjectsJs = GenerateCustomObjectsJs(cubos, esferas, planos, lineas, cilindros, textos, marcadores, cortes, medidas);

            // Generate toolbar buttons based on controles
            var toolbarHtml = GenerateToolbarHtml(controlesLista);

            // Calculate canvas margins based on visible panels
            string canvasLeft = mostrarArbol ? "280px" : "0";
            string canvasRight = mostrarPropiedades ? "320px" : "0";
            string canvasWidth = (mostrarArbol || mostrarPropiedades)
                ? $"calc(100% - {(mostrarArbol ? 280 : 0) + (mostrarPropiedades ? 320 : 0)}px)"
                : "100%";

            // Generate embeddable HTML (no full document structure)
            var html = $@"<style>
        #{viewerId} {{ width: 100%; height: {altura}px; position: relative; background: {fondo}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }}
        #{viewerId}-canvas {{ position: absolute; left: {canvasLeft}; right: {canvasRight}; width: {canvasWidth}; height: 100%; }}
        #{viewerId} .toolbar {{
            position: absolute;
            top: 10px;
            left: calc({canvasLeft} + ({canvasWidth}) / 2);
            transform: translateX(-50%);
            display: flex;
            gap: 5px;
            background: rgba(0,0,0,0.85);
            padding: 8px 12px;
            border-radius: 8px;
            z-index: 100;
        }}
        #{viewerId} .toolbar button {{
            background: #2d2d44;
            color: #fff;
            border: 1px solid #444;
            padding: 8px 14px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }}
        #{viewerId} .toolbar button:hover {{ background: #3d3d5c; border-color: #0078d4; }}
        #{viewerId} .toolbar button.active {{ background: #0078d4; }}
        #{viewerId} .control-panel {{
            position: absolute;
            top: 60px;
            right: 10px;
            background: rgba(0,0,0,0.85);
            padding: 12px;
            border-radius: 8px;
            min-width: 180px;
            z-index: 100;
            color: #fff;
        }}
        #{viewerId} .control-panel label {{ display: block; font-size: 11px; margin-bottom: 4px; color: #aaa; }}
        #{viewerId} .control-panel input[type='range'] {{ width: 100%; margin-bottom: 10px; }}
        #{viewerId} .control-panel input[type='color'] {{ width: 100%; height: 30px; border: none; border-radius: 4px; cursor: pointer; }}
        /* VSCode-style Properties Panel */
        #{viewerId} .properties-panel {{
            position: absolute;
            top: 0;
            right: 0;
            width: 320px;
            height: 100%;
            background: #1e1e1e;
            border-left: 1px solid #333;
            display: {(mostrarPropiedades ? "flex" : "none")};
            flex-direction: column;
            font-size: 12px;
            z-index: 150;
        }}
        #{viewerId} .properties-header {{
            background: #252526;
            padding: 10px 12px;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        #{viewerId} .properties-header h3 {{
            margin: 0;
            font-size: 11px;
            font-weight: 600;
            color: #cccccc;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        #{viewerId} .properties-close {{
            background: none;
            border: none;
            color: #888;
            cursor: pointer;
            font-size: 16px;
            padding: 2px 6px;
        }}
        #{viewerId} .properties-close:hover {{ color: #fff; background: #333; }}
        #{viewerId} .properties-content {{
            flex: 1;
            overflow-y: auto;
            padding: 0;
        }}
        #{viewerId} .prop-section {{
            border-bottom: 1px solid #333;
        }}
        #{viewerId} .prop-section-header {{
            background: #2d2d2d;
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            color: #e0e0e0;
            font-weight: 500;
        }}
        #{viewerId} .prop-section-header:hover {{ background: #363636; }}
        #{viewerId} .prop-section-header .icon {{ font-size: 10px; color: #888; }}
        #{viewerId} .prop-section-body {{
            padding: 4px 0;
            display: block;
        }}
        #{viewerId} .prop-section-body.collapsed {{ display: none; }}
        #{viewerId} .prop-row {{
            display: flex;
            padding: 4px 12px 4px 24px;
            border-bottom: 1px solid #2a2a2a;
        }}
        #{viewerId} .prop-row:hover {{ background: #2a2d2e; }}
        #{viewerId} .prop-name {{
            flex: 0 0 120px;
            color: #9cdcfe;
            font-size: 11px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }}
        #{viewerId} .prop-value {{
            flex: 1;
            color: #ce9178;
            font-size: 11px;
            word-break: break-all;
        }}
        #{viewerId} .prop-value.number {{ color: #b5cea8; }}
        #{viewerId} .prop-value.boolean {{ color: #569cd6; }}
        #{viewerId} .no-selection {{
            padding: 40px 20px;
            text-align: center;
            color: #666;
        }}
        #{viewerId} .no-selection .icon {{ font-size: 48px; margin-bottom: 15px; color: #444; }}
        /* Tree Panel */
        #{viewerId} .tree-panel {{
            position: absolute;
            top: 0;
            left: 0;
            width: 280px;
            height: 100%;
            background: #1e1e1e;
            border-right: 1px solid #333;
            display: {(mostrarArbol ? "flex" : "none")};
            flex-direction: column;
            font-size: 12px;
            z-index: 150;
        }}
        #{viewerId} .tree-header {{
            background: #252526;
            padding: 10px 12px;
            border-bottom: 1px solid #333;
        }}
        #{viewerId} .tree-header h3 {{
            margin: 0;
            font-size: 11px;
            font-weight: 600;
            color: #cccccc;
            text-transform: uppercase;
        }}
        #{viewerId} .tree-content {{
            flex: 1;
            overflow-y: auto;
            padding: 8px 0;
        }}
        #{viewerId} .tree-item {{
            padding: 4px 8px 4px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            color: #ccc;
        }}
        #{viewerId} .tree-item:hover {{ background: #2a2d2e; }}
        #{viewerId} .tree-item.selected {{ background: #094771; }}
        #{viewerId} .tree-item .icon {{ color: #75beff; font-size: 14px; }}
        #{viewerId} .tree-item .count {{ color: #888; font-size: 10px; margin-left: auto; }}
        #{viewerId} .tree-children {{ padding-left: 16px; }}
        /* Selection highlight */
        #{viewerId}-canvas {{ cursor: {(habilitarSeleccion ? "pointer" : "default")}; }}
        @keyframes ifc-spin-{viewerId} {{ to {{ transform: rotate(360deg); }} }}
        #{viewerId} .loading {{
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #fff;
        }}
        #{viewerId} .spinner {{
            width: 50px;
            height: 50px;
            border: 3px solid #333;
            border-top-color: #0078d4;
            border-radius: 50%;
            animation: ifc-spin-{viewerId} 1s linear infinite;
            margin: 0 auto;
        }}
    </style>
    <div id=""{viewerId}"">
        <canvas id=""{viewerId}-canvas""></canvas>
        {toolbarHtml}
        <div class=""control-panel"" id=""{viewerId}-controls"">
            {GenerateControlPanelHtml(controlesLista, viewerId)}
        </div>
        <div class=""loading"" id=""{viewerId}-loading"">
            <div class=""spinner""></div>
            <p style=""margin-top: 15px;"" id=""{viewerId}-status"">Cargando...</p>
        </div>
        <!-- VSCode-style Tree Panel -->
        <div class=""tree-panel"" id=""{viewerId}-tree"">
            <div class=""tree-header"">
                <h3>📁 Estructura IFC</h3>
            </div>
            <div class=""tree-content"" id=""{viewerId}-tree-content"">
                <div class=""no-selection"">Cargando estructura...</div>
            </div>
        </div>
        <!-- VSCode-style Properties Panel -->
        <div class=""properties-panel"" id=""{viewerId}-properties"">
            <div class=""properties-header"">
                <h3>Propiedades</h3>
                <button class=""properties-close"" onclick=""document.getElementById('{viewerId}-properties').style.display='none'"">×</button>
            </div>
            <div class=""properties-content"" id=""{viewerId}-props-content"">
                <div class=""no-selection"">
                    <div class=""icon"">🖱️</div>
                    <div>Haz clic en un elemento del modelo para ver sus propiedades</div>
                </div>
            </div>
        </div>
    </div>
    <script src=""https://calcpad.ifc/three.min.js""></script>
    <script src=""https://calcpad.ifc/OrbitControls.js""></script>
    <script src=""https://calcpad.ifc/web-ifc-api-iife.js""></script>
    <script>
    (async function() {{
        const container = document.getElementById('{viewerId}');
        const canvas = document.getElementById('{viewerId}-canvas');
        const loading = document.getElementById('{viewerId}-loading');
        const status = document.getElementById('{viewerId}-status');

        // Store viewer state for @{{uncode}} export
        window.ifcViewerState = {{
            visor: '{archivo}',
            fondo: '{fondo}',
            altura: '{altura}',
            camara: {{ tipo: '{camaraTipo}', pos: [{camaraPos}], target: [0,0,0], fov: {camaraFov} }},
            seleccion: {(habilitarSeleccion ? "true" : "false")},
            propiedades: {(mostrarPropiedades ? "true" : "false")},
            arbol: {(mostrarArbol ? "true" : "false")},
            controles: {System.Text.Json.JsonSerializer.Serialize(controlesLista)},
            grid: {(mostrarGrid ? "true" : "false")},
            ejes: {(mostrarEjes ? "true" : "false")},
            sombras: {(sombras ? "true" : "false")},
            wireframe: {(wireframe ? "true" : "false")},
            opacidad: {opacidad},
            // Directivas originales para exportar
            originalDirectives: `{uncodeContent.Replace("`", "\\`").Replace("\\", "\\\\").Replace("\r\n", "\\n").Replace("\n", "\\n")}`
        }};

        try {{
            // ========== ESCENA ==========
            const scene = new THREE.Scene();
            scene.background = new THREE.Color('{fondo}');

            // ========== CAMARA ==========
            const camera = new THREE.{(camaraTipo == "perspectiva" ? "PerspectiveCamera" : "PerspectiveCamera")}({camaraFov}, container.clientWidth / container.clientHeight, 0.1, 10000);
            const pos = [{camaraPos}];
            const target = [{camaraTarget}];
            camera.position.set(pos[0], pos[1], pos[2]);
            camera.lookAt(target[0], target[1], target[2]);

            // ========== RENDERER ==========
            const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            {(sombras ? "renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;" : "")}

            // ========== CONTROLES ==========
            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.target.set(target[0], target[1], target[2]);

            // ========== ILUMINACION ==========
            const ambientLight = new THREE.AmbientLight(0x{luzColor.TrimStart('#')}, {ambienteIntensidad});
            scene.add(ambientLight);
            const dirLight = new THREE.DirectionalLight(0x{luzColor.TrimStart('#')}, {direccionalIntensidad});
            dirLight.position.set(50, 100, 50);
            {(sombras ? "dirLight.castShadow = true; dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;" : "")}
            scene.add(dirLight);

            // ========== HELPERS VISUALES ==========
            {(mostrarGrid ? $"const gridHelper = new THREE.GridHelper({gridTamano}, {gridDivisiones}, 0x444444, 0x333333); scene.add(gridHelper);" : "// Grid deshabilitado")}
            {(mostrarEjes ? "const axesHelper = new THREE.AxesHelper(50); scene.add(axesHelper);" : "// Ejes deshabilitados")}

            // ========== CONFIGURACION GLOBAL ==========
            const globalOpacity = {opacidad};
            const useWireframe = {(wireframe ? "true" : "false")};

            // ========== SELECTION & PROPERTIES CONFIG (VSCode-style) ==========
            const enableSelection = {(habilitarSeleccion ? "true" : "false")};
            const showProperties = {(mostrarPropiedades ? "true" : "false")};
            const showTree = {(mostrarArbol ? "true" : "false")};
            const meshIfcData = new Map();
            const ifcTypeGroups = new Map();

            // ========== CARGA DEL ARCHIVO IFC ==========
            {(string.IsNullOrEmpty(archivo) ? "status.textContent = 'No se especificó archivo IFC'; if (loading) loading.style.display = 'none';" : $@"
            status.textContent = 'Descargando archivo IFC...';
            const response = await fetch('{archivo}');
            if (!response.ok) throw new Error('Error descargando IFC: ' + response.status);
            const ifcData = await response.arrayBuffer();

            status.textContent = 'Inicializando web-ifc...';
            const ifcApi = new WebIFC.IfcAPI();
            await ifcApi.Init(function(path) {{
                if (path.endsWith('.wasm')) return 'https://calcpad.ifc/' + path;
                return path;
            }});

            status.textContent = 'Parseando modelo IFC...';
            const modelID = ifcApi.OpenModel(new Uint8Array(ifcData));
            const flatMeshes = ifcApi.LoadAllGeometry(modelID);

            status.textContent = 'Generando geometría 3D...';
            const allMeshes = new THREE.Group();
            for (let i = 0; i < flatMeshes.size(); i++) {{
                const flatMesh = flatMeshes.get(i);
                const placedGeometries = flatMesh.geometries;
                for (let j = 0; j < placedGeometries.size(); j++) {{
                    const pg = placedGeometries.get(j);
                    const geom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);
                    const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                    const indices = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
                    if (verts.length === 0 || indices.length === 0) continue;

                    const positions = new Float32Array(verts.length / 2);
                    const normals = new Float32Array(verts.length / 2);
                    for (let k = 0; k < verts.length; k += 6) {{
                        const idx = (k / 6) * 3;
                        positions[idx] = verts[k]; positions[idx+1] = verts[k+1]; positions[idx+2] = verts[k+2];
                        normals[idx] = verts[k+3]; normals[idx+1] = verts[k+4]; normals[idx+2] = verts[k+5];
                    }}

                    const bufferGeom = new THREE.BufferGeometry();
                    bufferGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    bufferGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                    bufferGeom.setIndex(new THREE.BufferAttribute(indices, 1));

                    const color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
                    const finalOpacity = Math.min(pg.color.w, globalOpacity);
                    const material = new THREE.MeshPhongMaterial({{
                        color,
                        side: THREE.DoubleSide,
                        transparent: finalOpacity < 1,
                        opacity: finalOpacity,
                        wireframe: useWireframe
                    }});
                    const meshObj = new THREE.Mesh(bufferGeom, material);
                    meshObj.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
                    meshObj.castShadow = true;
                    meshObj.receiveShadow = true;
                    allMeshes.add(meshObj);

                    // Store IFC data for selection (VSCode-style)
                    if (enableSelection || showProperties || showTree) {{
                        const expressID = flatMesh.expressID;
                        try {{
                            const props = ifcApi.GetLine(modelID, expressID);
                            const typeName = props?.constructor?.name || 'Unknown';
                            const ifcData = {{
                                expressID: expressID,
                                type: typeName,
                                name: props?.Name?.value || props?.LongName?.value || null,
                                attributes: {{}}
                            }};

                            // Extract attributes
                            for (const key in props) {{
                                if (key === 'expressID') continue;
                                const val = props[key];
                                if (val !== null && val !== undefined) {{
                                    if (typeof val === 'object' && val.value !== undefined) {{
                                        ifcData.attributes[key] = val.value;
                                    }} else if (typeof val !== 'object' && typeof val !== 'function') {{
                                        ifcData.attributes[key] = val;
                                    }}
                                }}
                            }}

                            meshIfcData.set(meshObj, ifcData);

                            // Group by type for tree
                            if (!ifcTypeGroups.has(typeName)) {{
                                ifcTypeGroups.set(typeName, []);
                            }}
                            ifcTypeGroups.get(typeName).push(ifcData);
                        }} catch (e) {{
                            meshIfcData.set(meshObj, {{ expressID, type: 'Unknown', attributes: {{}} }});
                        }}
                    }}
                }}
            }}
            scene.add(allMeshes);

            // Populate tree panel after loading
            if (showTree) populateTreePanel();

            // Ajustar vista al modelo
            const box = new THREE.Box3().setFromObject(allMeshes);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
            controls.target.copy(center);
            controls.update();

            ifcApi.CloseModel(modelID);
            if (loading) loading.style.display = 'none';
            ")}

            // View functions
            window.setView = function(view) {{
                switch(view) {{
                    case 'top': camera.position.set(0, 100, 0); camera.lookAt(0, 0, 0); break;
                    case 'front': camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0); break;
                    case 'side': camera.position.set(100, 0, 0); camera.lookAt(0, 0, 0); break;
                    case '3d': camera.position.set(50, 50, 50); camera.lookAt(0, 0, 0); break;
                }}
                window.ifcViewerState.camara.pos = [camera.position.x, camera.position.y, camera.position.z];
            }};

            // Background color change
            window.setBackground = function(color) {{
                scene.background = new THREE.Color(color);
                window.ifcViewerState.fondo = color;
            }};

            // ========== OBJETOS PERSONALIZADOS ==========
            {customObjectsJs}

            // ========== ANIMATION SYSTEM ==========
            const animationEnabled = {(habilitarAnimacion ? "true" : "false")};
            const animationType = '{animacionTipo}';
            const animationSpeed = {animacionVelocidad}; // ms between frames
            const animationAutoplay = {(animacionAutoplay ? "true" : "false")};

            let animationMeshes = []; // Will be populated after loading
            let animationIndex = 0;
            let animationPlaying = false;
            let animationInterval = null;

            // Animation controls
            window.animationPlay = function() {{
                if (!animationEnabled || animationMeshes.length === 0) return;
                if (animationPlaying) return;
                animationPlaying = true;

                const playBtn = document.getElementById('{viewerId}-anim-play');
                const pauseBtn = document.getElementById('{viewerId}-anim-pause');
                if (playBtn) playBtn.style.display = 'none';
                if (pauseBtn) pauseBtn.style.display = 'inline-block';

                animationInterval = setInterval(() => {{
                    if (animationIndex < animationMeshes.length) {{
                        animationMeshes[animationIndex].visible = true;
                        animationIndex++;
                        updateAnimationProgress();
                    }} else {{
                        window.animationPause();
                    }}
                }}, animationSpeed);
            }};

            window.animationPause = function() {{
                animationPlaying = false;
                if (animationInterval) {{
                    clearInterval(animationInterval);
                    animationInterval = null;
                }}
                const playBtn = document.getElementById('{viewerId}-anim-play');
                const pauseBtn = document.getElementById('{viewerId}-anim-pause');
                if (playBtn) playBtn.style.display = 'inline-block';
                if (pauseBtn) pauseBtn.style.display = 'none';
            }};

            window.animationReset = function() {{
                window.animationPause();
                animationIndex = 0;
                animationMeshes.forEach(m => m.visible = false);
                updateAnimationProgress();
            }};

            window.animationShowAll = function() {{
                window.animationPause();
                animationIndex = animationMeshes.length;
                animationMeshes.forEach(m => m.visible = true);
                updateAnimationProgress();
            }};

            window.animationSeek = function(progress) {{
                window.animationPause();
                const targetIndex = Math.floor((progress / 100) * animationMeshes.length);
                animationIndex = targetIndex;
                animationMeshes.forEach((m, i) => m.visible = i < targetIndex);
                updateAnimationProgress();
            }};

            function updateAnimationProgress() {{
                const slider = document.getElementById('{viewerId}-anim-slider');
                const label = document.getElementById('{viewerId}-anim-label');
                if (slider) slider.value = (animationIndex / animationMeshes.length) * 100;
                if (label) label.textContent = animationIndex + ' / ' + animationMeshes.length;
            }}

            function initAnimation() {{
                if (!animationEnabled) return;

                // Collect all meshes from allMeshes group
                animationMeshes = [];
                allMeshes.traverse(obj => {{
                    if (obj.isMesh) {{
                        animationMeshes.push(obj);
                        obj.visible = false; // Hide initially
                    }}
                }});

                // Sort by position (bottom to top for construction effect)
                if (animationType === 'construccion') {{
                    animationMeshes.sort((a, b) => {{
                        const boxA = new THREE.Box3().setFromObject(a);
                        const boxB = new THREE.Box3().setFromObject(b);
                        return boxA.min.y - boxB.min.y; // Sort by Y (height)
                    }});
                }}

                updateAnimationProgress();

                // Auto-play if enabled
                if (animationAutoplay) {{
                    setTimeout(() => window.animationPlay(), 500);
                }}
            }}

            // ========== REVIT-STYLE TOOLS: GRID & ALIGN ==========
            let gridToolActive = false;
            let alignToolActive = false;
            let gridStartPoint = null;
            let gridLines = [];
            let gridCounter = 1;
            let gridLabels = 'numbers'; // 'numbers' or 'letters'
            const gridGroup = new THREE.Group();
            gridGroup.name = 'GridLines';
            scene.add(gridGroup);

            // Temporary line for preview
            let tempGridLine = null;
            const gridLineMaterial = new THREE.LineDashedMaterial({{
                color: 0x00aaff,
                dashSize: 0.5,
                gapSize: 0.2,
                linewidth: 2
            }});

            // Create grid bubble (circle with number/letter)
            function createGridBubble(position, label, isStart) {{
                const group = new THREE.Group();

                // Circle
                const circleGeom = new THREE.CircleGeometry(1.5, 32);
                const circleMat = new THREE.MeshBasicMaterial({{ color: 0x00aaff, side: THREE.DoubleSide }});
                const circle = new THREE.Mesh(circleGeom, circleMat);
                circle.position.copy(position);
                circle.lookAt(camera.position);
                group.add(circle);

                // Label sprite
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 64; canvas.height = 64;
                ctx.fillStyle = '#00aaff';
                ctx.beginPath();
                ctx.arc(32, 32, 30, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, 32, 32);

                const texture = new THREE.CanvasTexture(canvas);
                const spriteMat = new THREE.SpriteMaterial({{ map: texture }});
                const sprite = new THREE.Sprite(spriteMat);
                sprite.position.copy(position);
                sprite.scale.set(3, 3, 1);
                group.add(sprite);

                return group;
            }}

            // Get next grid label
            function getNextGridLabel() {{
                if (gridLabels === 'letters') {{
                    return String.fromCharCode(64 + gridCounter); // A, B, C...
                }}
                return gridCounter.toString(); // 1, 2, 3...
            }}

            // Toggle grid tool
            window.toggleGridTool = function() {{
                gridToolActive = !gridToolActive;
                alignToolActive = false;

                const gridBtn = document.getElementById('btn-grid');
                const alignBtn = document.getElementById('btn-align');

                if (gridToolActive) {{
                    gridBtn.style.background = '#00aaff';
                    alignBtn.style.background = '';
                    container.style.cursor = 'crosshair';
                    showToolTip('Rejilla: Clic para punto inicial, luego punto final. ESC para cancelar.');
                }} else {{
                    gridBtn.style.background = '';
                    container.style.cursor = 'default';
                    hideToolTip();
                    cancelGridDrawing();
                }}
            }};

            // Toggle align tool
            window.toggleAlignTool = function() {{
                alignToolActive = !alignToolActive;
                gridToolActive = false;

                const gridBtn = document.getElementById('btn-grid');
                const alignBtn = document.getElementById('btn-align');

                if (alignToolActive) {{
                    alignBtn.style.background = '#00aaff';
                    gridBtn.style.background = '';
                    container.style.cursor = 'pointer';
                    showToolTip('Alinear: Selecciona referencia, luego elemento a alinear. ESC para cancelar.');
                }} else {{
                    alignBtn.style.background = '';
                    container.style.cursor = 'default';
                    hideToolTip();
                }}
            }};

            // Tooltip functions
            function showToolTip(text) {{
                let tip = document.getElementById('{viewerId}-tooltip');
                if (!tip) {{
                    tip = document.createElement('div');
                    tip.id = '{viewerId}-tooltip';
                    tip.style.cssText = 'position:absolute;bottom:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:4px;font-size:12px;z-index:200;';
                    container.appendChild(tip);
                }}
                tip.textContent = text;
                tip.style.display = 'block';
            }}

            function hideToolTip() {{
                const tip = document.getElementById('{viewerId}-tooltip');
                if (tip) tip.style.display = 'none';
            }}

            // Cancel grid drawing
            function cancelGridDrawing() {{
                gridStartPoint = null;
                if (tempGridLine) {{
                    scene.remove(tempGridLine);
                    tempGridLine = null;
                }}
            }}

            // Get 3D point from mouse (raycasting to ground plane)
            function get3DPoint(event) {{
                const rect = canvas.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

                // Intersect with ground plane (Y=0)
                const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                const point = new THREE.Vector3();
                raycaster.ray.intersectPlane(groundPlane, point);

                return point;
            }}

            // Add grid line
            function addGridLine(start, end) {{
                const label = getNextGridLabel();

                // Create dashed line
                const points = [start, end];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(geometry, gridLineMaterial.clone());
                line.computeLineDistances();

                // Create bubbles at both ends
                const bubbleStart = createGridBubble(start, label, true);
                const bubbleEnd = createGridBubble(end, label, false);

                const gridLineGroup = new THREE.Group();
                gridLineGroup.add(line);
                gridLineGroup.add(bubbleStart);
                gridLineGroup.add(bubbleEnd);
                gridLineGroup.userData = {{ label, start: start.clone(), end: end.clone() }};

                gridGroup.add(gridLineGroup);
                gridLines.push(gridLineGroup);
                gridCounter++;

                // Update state for export
                if (!window.ifcViewerState.rejillas) window.ifcViewerState.rejillas = [];
                window.ifcViewerState.rejillas.push({{
                    label,
                    start: [start.x, start.y, start.z],
                    end: [end.x, end.y, end.z]
                }});
            }}

            // Mouse handlers for grid tool
            canvas.addEventListener('click', function(event) {{
                if (!gridToolActive) return;

                const point = get3DPoint(event);
                if (!point) return;

                if (!gridStartPoint) {{
                    // First click - set start point
                    gridStartPoint = point.clone();
                    showToolTip('Rejilla: Clic en punto final para completar la línea.');
                }} else {{
                    // Second click - complete the grid line
                    addGridLine(gridStartPoint, point);
                    gridStartPoint = null;
                    if (tempGridLine) {{
                        scene.remove(tempGridLine);
                        tempGridLine = null;
                    }}
                    showToolTip('Rejilla: Línea ' + (gridCounter - 1) + ' creada. Clic para nueva línea o ESC.');
                }}
            }});

            canvas.addEventListener('mousemove', function(event) {{
                if (!gridToolActive || !gridStartPoint) return;

                const point = get3DPoint(event);
                if (!point) return;

                // Update or create temp line
                if (tempGridLine) scene.remove(tempGridLine);

                const points = [gridStartPoint, point];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                tempGridLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({{ color: 0x00aaff, opacity: 0.5, transparent: true }}));
                scene.add(tempGridLine);
            }});

            // Keyboard shortcuts
            document.addEventListener('keydown', function(event) {{
                if (event.key === 'Escape') {{
                    if (gridToolActive) {{
                        cancelGridDrawing();
                        showToolTip('Rejilla: Clic para punto inicial.');
                    }}
                    if (alignToolActive) {{
                        window.toggleAlignTool();
                    }}
                }}
                if (event.key === 'g' || event.key === 'G') {{
                    window.toggleGridTool();
                }}
            }});

            // Delete last grid line
            window.undoLastGrid = function() {{
                if (gridLines.length > 0) {{
                    const last = gridLines.pop();
                    gridGroup.remove(last);
                    gridCounter--;
                    if (window.ifcViewerState.rejillas) window.ifcViewerState.rejillas.pop();
                }}
            }};

            // Clear all grid lines
            window.clearAllGrids = function() {{
                gridLines.forEach(g => gridGroup.remove(g));
                gridLines = [];
                gridCounter = 1;
                window.ifcViewerState.rejillas = [];
            }};

            // Toggle grid labels (numbers/letters)
            window.toggleGridLabels = function() {{
                gridLabels = gridLabels === 'numbers' ? 'letters' : 'numbers';
                showToolTip('Etiquetas de rejilla: ' + (gridLabels === 'numbers' ? 'Números (1,2,3...)' : 'Letras (A,B,C...)'));
            }};

            // ========== SELECTION & PROPERTIES RUNTIME (VSCode-style) ==========
            let selectedMesh = null;
            let originalMaterial = null;
            const highlightMaterial = new THREE.MeshBasicMaterial({{ color: 0x00aaff, transparent: true, opacity: 0.7 }});
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            // Function to extract IFC properties from web-ifc
            async function extractIfcProperties(ifcApi, modelID, expressID) {{
                try {{
                    const props = ifcApi.GetLine(modelID, expressID);
                    const result = {{
                        expressID: expressID,
                        type: props.constructor?.name || 'Unknown',
                        attributes: {{}}
                    }};

                    // Extract basic properties
                    for (const key in props) {{
                        if (key === 'expressID' || key === 'type') continue;
                        const val = props[key];
                        if (val !== null && val !== undefined) {{
                            if (typeof val === 'object' && val.value !== undefined) {{
                                result.attributes[key] = val.value;
                            }} else if (typeof val !== 'object') {{
                                result.attributes[key] = val;
                            }}
                        }}
                    }}

                    return result;
                }} catch (e) {{
                    return {{ expressID, type: 'Unknown', attributes: {{}} }};
                }}
            }}

            // Populate tree panel with IFC structure
            function populateTreePanel() {{
                if (!showTree) return;
                const treeContent = document.getElementById('{viewerId}-tree-content');
                if (!treeContent) return;

                let html = '';
                const sortedTypes = Array.from(ifcTypeGroups.entries())
                    .sort((a, b) => b[1].length - a[1].length);

                for (const [typeName, items] of sortedTypes) {{
                    const icon = getTypeIcon(typeName);
                    html += `<div class=""tree-item"" onclick=""window.toggleTreeSection(this)"">
                        <span class=""icon"">${{icon}}</span>
                        <span>${{typeName}}</span>
                        <span class=""count"">${{items.length}}</span>
                    </div>
                    <div class=""tree-children"" style=""display:none"">`;

                    for (const item of items.slice(0, 50)) {{ // Limit to 50 per type
                        const name = item.name || `#${{item.expressID}}`;
                        html += `<div class=""tree-item"" onclick=""window.selectByExpressID(${{item.expressID}})"">
                            <span style=""color:#888"">└</span>
                            <span>${{name}}</span>
                        </div>`;
                    }}
                    if (items.length > 50) {{
                        html += `<div class=""tree-item"" style=""color:#666"">... y ${{items.length - 50}} más</div>`;
                    }}
                    html += '</div>';
                }}

                treeContent.innerHTML = html || '<div class=""no-selection"">No hay elementos</div>';
            }}

            window.toggleTreeSection = function(el) {{
                const children = el.nextElementSibling;
                if (children && children.classList.contains('tree-children')) {{
                    children.style.display = children.style.display === 'none' ? 'block' : 'none';
                }}
            }};

            function getTypeIcon(typeName) {{
                const icons = {{
                    'IfcWall': '🧱', 'IfcWallStandardCase': '🧱',
                    'IfcSlab': '⬜', 'IfcRoof': '🏠',
                    'IfcColumn': '🏛️', 'IfcBeam': '📏',
                    'IfcDoor': '🚪', 'IfcWindow': '🪟',
                    'IfcStair': '🪜', 'IfcRailing': '🚧',
                    'IfcFurniture': '🪑', 'IfcSpace': '📦',
                    'IfcBuildingStorey': '🏢', 'IfcSite': '🌍'
                }};
                return icons[typeName] || '📐';
            }}

            // Show properties in VSCode-style panel
            function showPropertiesPanel(data) {{
                if (!showProperties) return;
                const propsContent = document.getElementById('{viewerId}-props-content');
                const propsPanel = document.getElementById('{viewerId}-properties');
                if (!propsContent || !propsPanel) return;

                propsPanel.style.display = 'flex';

                if (!data) {{
                    propsContent.innerHTML = `<div class=""no-selection"">
                        <div class=""icon"">🖱️</div>
                        <div>Haz clic en un elemento del modelo para ver sus propiedades</div>
                    </div>`;
                    return;
                }}

                let html = '';

                // Identity section
                html += `<div class=""prop-section"">
                    <div class=""prop-section-header"" onclick=""this.nextElementSibling.classList.toggle('collapsed')"">
                        <span class=""icon"">▼</span> Identidad
                    </div>
                    <div class=""prop-section-body"">
                        <div class=""prop-row""><span class=""prop-name"">Express ID</span><span class=""prop-value number"">${{data.expressID}}</span></div>
                        <div class=""prop-row""><span class=""prop-name"">Tipo IFC</span><span class=""prop-value"">${{data.type}}</span></div>
                    </div>
                </div>`;

                // Attributes section
                const attrs = Object.entries(data.attributes || {{}});
                if (attrs.length > 0) {{
                    html += `<div class=""prop-section"">
                        <div class=""prop-section-header"" onclick=""this.nextElementSibling.classList.toggle('collapsed')"">
                            <span class=""icon"">▼</span> Atributos (${{attrs.length}})
                        </div>
                        <div class=""prop-section-body"">`;

                    for (const [key, value] of attrs) {{
                        const valueClass = typeof value === 'number' ? 'number' :
                                          typeof value === 'boolean' ? 'boolean' : '';
                        const displayValue = value === null ? 'null' :
                                            value === undefined ? 'undefined' :
                                            String(value);
                        html += `<div class=""prop-row"">
                            <span class=""prop-name"">${{key}}</span>
                            <span class=""prop-value ${{valueClass}}"">${{displayValue}}</span>
                        </div>`;
                    }}
                    html += '</div></div>';
                }}

                // Geometry section
                if (selectedMesh) {{
                    const box = new THREE.Box3().setFromObject(selectedMesh);
                    const size = box.getSize(new THREE.Vector3());
                    const center = box.getCenter(new THREE.Vector3());

                    html += `<div class=""prop-section"">
                        <div class=""prop-section-header"" onclick=""this.nextElementSibling.classList.toggle('collapsed')"">
                            <span class=""icon"">▼</span> Geometría
                        </div>
                        <div class=""prop-section-body"">
                            <div class=""prop-row""><span class=""prop-name"">Ancho (X)</span><span class=""prop-value number"">${{size.x.toFixed(3)}} m</span></div>
                            <div class=""prop-row""><span class=""prop-name"">Alto (Y)</span><span class=""prop-value number"">${{size.y.toFixed(3)}} m</span></div>
                            <div class=""prop-row""><span class=""prop-name"">Profundidad (Z)</span><span class=""prop-value number"">${{size.z.toFixed(3)}} m</span></div>
                            <div class=""prop-row""><span class=""prop-name"">Centro</span><span class=""prop-value number"">(${{center.x.toFixed(2)}}, ${{center.y.toFixed(2)}}, ${{center.z.toFixed(2)}})</span></div>
                        </div>
                    </div>`;
                }}

                propsContent.innerHTML = html;
            }}

            // Select element by ExpressID (called from tree)
            window.selectByExpressID = function(expressID) {{
                for (const [mesh, data] of meshIfcData.entries()) {{
                    if (data.expressID === expressID) {{
                        selectMesh(mesh);

                        // Focus camera on selected element
                        const box = new THREE.Box3().setFromObject(mesh);
                        const center = box.getCenter(new THREE.Vector3());
                        controls.target.copy(center);

                        return;
                    }}
                }}
            }};

            // Select mesh and highlight
            function selectMesh(mesh) {{
                // Restore previous selection
                if (selectedMesh && originalMaterial) {{
                    selectedMesh.material = originalMaterial;
                }}

                if (mesh) {{
                    selectedMesh = mesh;
                    originalMaterial = mesh.material;
                    mesh.material = highlightMaterial;

                    const data = meshIfcData.get(mesh);
                    showPropertiesPanel(data);
                }} else {{
                    selectedMesh = null;
                    originalMaterial = null;
                    showPropertiesPanel(null);
                }}
            }}

            // Click handler for selection
            if (enableSelection) {{
                canvas.addEventListener('click', (event) => {{
                    const rect = canvas.getBoundingClientRect();
                    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                    raycaster.setFromCamera(mouse, camera);
                    const intersects = raycaster.intersectObjects(allMeshes.children, true);

                    if (intersects.length > 0) {{
                        selectMesh(intersects[0].object);
                    }} else {{
                        selectMesh(null);
                    }}
                }});

                // Hover effect
                canvas.addEventListener('mousemove', (event) => {{
                    const rect = canvas.getBoundingClientRect();
                    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                    raycaster.setFromCamera(mouse, camera);
                    const intersects = raycaster.intersectObjects(allMeshes.children, true);
                    canvas.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
                }});
            }}

            // Animation loop
            function animate() {{
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }}
            animate();

            // Resize handler
            window.addEventListener('resize', () => {{
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            }});

        }} catch (error) {{
            console.error('Viewer Error:', error);
            if (loading) loading.innerHTML = '<p style=""color: red;"">Error: ' + error.message + '</p>';
        }}
    }})();
    </script>";

            // Add context menu
            return AddContextMenuToHtml(html, $"@{{uncode}}\n{uncodeContent}\n@{{end}}");
        }

        /// <summary>
        /// Parse a directive like @{visor: param1=val1, param2=val2}
        /// Ignores lines that start with ' (Hekatan comment syntax)
        /// </summary>
        private static string ParseDirective(string content, string directiveName)
        {
            // Remove commented lines (Hekatan uses ' for comments)
            var cleanContent = RemoveCommentedLines(content);

            var pattern = $@"@{{{directiveName}:\s*([^}}]+)}}|@{{{directiveName}\s*:\s*([^}}]+)}}";
            var match = Regex.Match(cleanContent, pattern, RegexOptions.IgnoreCase);
            if (match.Success)
            {
                return match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
            }

            // Try simpler pattern without colon
            pattern = $@"@{{{directiveName}\s+([^}}]+)}}";
            match = Regex.Match(cleanContent, pattern, RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value : null;
        }

        /// <summary>
        /// Remove commented lines from ucode content
        /// Supports: // (C-style), # (shell/Python), ' (Hekatan - for compatibility)
        /// Used to prevent parsing directives inside comments
        /// </summary>
        private static string RemoveCommentedLines(string content)
        {
            if (string.IsNullOrEmpty(content)) return content;

            var lines = content.Split(new[] { "\r\n", "\n", "\r" }, StringSplitOptions.None);
            var nonCommentedLines = new System.Collections.Generic.List<string>();

            foreach (var line in lines)
            {
                var trimmed = line.TrimStart();
                // Skip lines that start with comment markers
                // // = C-style, # = shell/Python, ' = Hekatan (legacy compatibility)
                if (!trimmed.StartsWith("//") && !trimmed.StartsWith("#") && !trimmed.StartsWith("'"))
                {
                    nonCommentedLines.Add(line);
                }
            }

            return string.Join("\n", nonCommentedLines);
        }

        /// <summary>
        /// Get a parameter value from a directive string
        /// Handles values with commas like pos=50,50,50
        /// </summary>
        private static string GetParam(string directive, string paramName, string defaultValue)
        {
            if (string.IsNullOrEmpty(directive)) return defaultValue;

            // Pattern to capture value until next param (word=) or end of string
            // This handles values with commas like pos=50,50,50
            var pattern = $@"{paramName}\s*=\s*(.+?)(?=\s*,\s*[a-zA-Z_]+\s*=|$)";
            var match = Regex.Match(directive, pattern, RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value.Trim().TrimEnd(',') : defaultValue;
        }

        /// <summary>
        /// Extract numeric value from directive like "intensidad=0.5" or return value if already numeric
        /// </summary>
        private static string ExtractNumericValue(string directive, string defaultValue)
        {
            if (string.IsNullOrEmpty(directive)) return defaultValue;

            string trimmed = directive.Trim();

            // If it's already a number, return it
            if (Regex.IsMatch(trimmed, @"^[\d.]+$"))
                return trimmed;

            // Try to extract from "param=value" format
            var match = Regex.Match(trimmed, @"(?:intensidad|valor|value)\s*=\s*([\d.]+)", RegexOptions.IgnoreCase);
            if (match.Success)
                return match.Groups[1].Value;

            // Try to extract any number
            match = Regex.Match(trimmed, @"([\d.]+)");
            if (match.Success)
                return match.Groups[1].Value;

            return defaultValue;
        }

        /// <summary>
        /// Parse a boolean directive (si/no, true/false, 1/0)
        /// </summary>
        private static bool ParseBoolDirective(string directive, bool defaultValue)
        {
            if (string.IsNullOrEmpty(directive)) return defaultValue;

            string val = directive.Trim().ToLowerInvariant();
            if (val == "si" || val == "sí" || val == "true" || val == "1" || val == "yes" || val == "on")
                return true;
            if (val == "no" || val == "false" || val == "0" || val == "off")
                return false;

            return defaultValue;
        }

        /// <summary>
        /// Parse multiple directives with the same name (e.g., multiple @{cubo} directives)
        /// Ignores lines that start with ' (Hekatan comment syntax)
        /// </summary>
        private static System.Collections.Generic.List<string> ParseMultipleDirectives(string content, string directiveName)
        {
            var results = new System.Collections.Generic.List<string>();

            // Remove commented lines (Hekatan uses ' for comments)
            var cleanContent = RemoveCommentedLines(content);

            var pattern = $@"@{{{directiveName}:\s*([^}}]+)}}";
            var matches = Regex.Matches(cleanContent, pattern, RegexOptions.IgnoreCase);
            foreach (Match match in matches)
            {
                if (match.Success && match.Groups[1].Success)
                {
                    results.Add(match.Groups[1].Value);
                }
            }
            return results;
        }

        /// <summary>
        /// Generate JavaScript code for custom 3D objects
        /// </summary>
        private static string GenerateCustomObjectsJs(
            System.Collections.Generic.List<string> cubos,
            System.Collections.Generic.List<string> esferas,
            System.Collections.Generic.List<string> planos,
            System.Collections.Generic.List<string> lineas,
            System.Collections.Generic.List<string> cilindros,
            System.Collections.Generic.List<string> textos,
            System.Collections.Generic.List<string> marcadores,
            System.Collections.Generic.List<string> cortes,
            System.Collections.Generic.List<string> medidas)
        {
            var js = new System.Text.StringBuilder();
            js.AppendLine("// ========== OBJETOS PERSONALIZADOS ==========");

            // Generate cubes
            foreach (var cubo in cubos)
            {
                string pos = GetParam(cubo, "pos", "0,0,0");
                string size = GetParam(cubo, "size", "10");
                string color = GetParam(cubo, "color", "#ff0000");
                js.AppendLine($@"
            (function() {{
                const geom = new THREE.BoxGeometry({size}, {size}, {size});
                const mat = new THREE.MeshPhongMaterial({{ color: '{color}', wireframe: useWireframe }});
                const mesh = new THREE.Mesh(geom, mat);
                const p = [{pos}];
                mesh.position.set(p[0], p[1], p[2]);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                scene.add(mesh);
            }})();");
            }

            // Generate spheres
            foreach (var esfera in esferas)
            {
                string pos = GetParam(esfera, "pos", "0,0,0");
                string radio = GetParam(esfera, "radio", "5");
                string color = GetParam(esfera, "color", "#00ff00");
                js.AppendLine($@"
            (function() {{
                const geom = new THREE.SphereGeometry({radio}, 32, 32);
                const mat = new THREE.MeshPhongMaterial({{ color: '{color}', wireframe: useWireframe }});
                const mesh = new THREE.Mesh(geom, mat);
                const p = [{pos}];
                mesh.position.set(p[0], p[1], p[2]);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                scene.add(mesh);
            }})();");
            }

            // Generate cylinders
            foreach (var cilindro in cilindros)
            {
                string pos = GetParam(cilindro, "pos", "0,0,0");
                string radio = GetParam(cilindro, "radio", "5");
                string altura = GetParam(cilindro, "altura", "20");
                string color = GetParam(cilindro, "color", "#0000ff");
                js.AppendLine($@"
            (function() {{
                const geom = new THREE.CylinderGeometry({radio}, {radio}, {altura}, 32);
                const mat = new THREE.MeshPhongMaterial({{ color: '{color}', wireframe: useWireframe }});
                const mesh = new THREE.Mesh(geom, mat);
                const p = [{pos}];
                mesh.position.set(p[0], p[1], p[2]);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                scene.add(mesh);
            }})();");
            }

            // Generate planes
            foreach (var plano in planos)
            {
                string pos = GetParam(plano, "pos", "0,0,0");
                string ancho = GetParam(plano, "ancho", "50");
                string alto = GetParam(plano, "alto", "50");
                string color = GetParam(plano, "color", "#888888");
                string rotacion = GetParam(plano, "rotacion", "0,0,0");
                js.AppendLine($@"
            (function() {{
                const geom = new THREE.PlaneGeometry({ancho}, {alto});
                const mat = new THREE.MeshPhongMaterial({{ color: '{color}', side: THREE.DoubleSide, wireframe: useWireframe }});
                const mesh = new THREE.Mesh(geom, mat);
                const p = [{pos}];
                const r = [{rotacion}];
                mesh.position.set(p[0], p[1], p[2]);
                mesh.rotation.set(r[0] * Math.PI/180, r[1] * Math.PI/180, r[2] * Math.PI/180);
                mesh.receiveShadow = true;
                scene.add(mesh);
            }})();");
            }

            // Generate lines
            foreach (var linea in lineas)
            {
                string desde = GetParam(linea, "desde", "0,0,0");
                string hasta = GetParam(linea, "hasta", "10,10,10");
                string color = GetParam(linea, "color", "#ffffff");
                string grosor = GetParam(linea, "grosor", "2");
                js.AppendLine($@"
            (function() {{
                const mat = new THREE.LineBasicMaterial({{ color: '{color}', linewidth: {grosor} }});
                const points = [new THREE.Vector3({desde.Replace(",", ", ")}), new THREE.Vector3({hasta.Replace(",", ", ")})];
                const geom = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(geom, mat);
                scene.add(line);
            }})();");
            }

            // Generate text sprites (marcadores)
            foreach (var marcador in marcadores)
            {
                string pos = GetParam(marcador, "pos", "0,0,0");
                string texto = GetParam(marcador, "texto", "Punto");
                string color = GetParam(marcador, "color", "#ffffff");
                string bgColor = GetParam(marcador, "fondo", "#000000");
                js.AppendLine($@"
            (function() {{
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 256; canvas.height = 64;
                ctx.fillStyle = '{bgColor}';
                ctx.fillRect(0, 0, 256, 64);
                ctx.fillStyle = '{color}';
                ctx.font = 'bold 24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('{texto}', 128, 40);
                const texture = new THREE.CanvasTexture(canvas);
                const mat = new THREE.SpriteMaterial({{ map: texture }});
                const sprite = new THREE.Sprite(mat);
                const p = [{pos}];
                sprite.position.set(p[0], p[1], p[2]);
                sprite.scale.set(10, 2.5, 1);
                scene.add(sprite);
            }})();");
            }

            // Generate measurements (lines with labels)
            foreach (var medida in medidas)
            {
                string desde = GetParam(medida, "desde", "0,0,0");
                string hasta = GetParam(medida, "hasta", "10,0,0");
                string color = GetParam(medida, "color", "#ffff00");
                js.AppendLine($@"
            (function() {{
                const p1 = new THREE.Vector3({desde.Replace(",", ", ")});
                const p2 = new THREE.Vector3({hasta.Replace(",", ", ")});
                const dist = p1.distanceTo(p2).toFixed(2);

                // Line
                const mat = new THREE.LineBasicMaterial({{ color: '{color}', linewidth: 2 }});
                const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
                scene.add(new THREE.Line(geom, mat));

                // End markers
                const markerGeom = new THREE.SphereGeometry(0.3, 8, 8);
                const markerMat = new THREE.MeshBasicMaterial({{ color: '{color}' }});
                const m1 = new THREE.Mesh(markerGeom, markerMat); m1.position.copy(p1); scene.add(m1);
                const m2 = new THREE.Mesh(markerGeom, markerMat); m2.position.copy(p2); scene.add(m2);

                // Label
                const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 128; canvas.height = 32;
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, 128, 32);
                ctx.fillStyle = '{color}';
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(dist + ' m', 64, 22);
                const texture = new THREE.CanvasTexture(canvas);
                const spriteMat = new THREE.SpriteMaterial({{ map: texture }});
                const sprite = new THREE.Sprite(spriteMat);
                sprite.position.copy(mid);
                sprite.position.y += 2;
                sprite.scale.set(5, 1.25, 1);
                scene.add(sprite);
            }})();");
            }

            // Generate clipping planes
            if (cortes.Count > 0)
            {
                js.AppendLine("renderer.localClippingEnabled = true;");
                js.AppendLine("const clippingPlanes = [];");
                foreach (var corte in cortes)
                {
                    string eje = GetParam(corte, "eje", "x").ToLowerInvariant();
                    string posicion = GetParam(corte, "pos", "0");
                    string normal = eje == "x" ? "1,0,0" : (eje == "y" ? "0,1,0" : "0,0,1");
                    js.AppendLine($"clippingPlanes.push(new THREE.Plane(new THREE.Vector3({normal}), -{posicion}));");
                }
                js.AppendLine("// Apply clipping to all materials in the scene");
                js.AppendLine("scene.traverse(function(obj) { if (obj.material) { obj.material.clippingPlanes = clippingPlanes; obj.material.clipShadows = true; } });");
            }

            return js.ToString();
        }

        /// <summary>
        /// Generate toolbar HTML based on controls list
        /// </summary>
        private static string GenerateToolbarHtml(System.Collections.Generic.List<string> controles)
        {
            var buttons = new System.Text.StringBuilder();
            buttons.Append("<div class=\"toolbar\">");

            if (controles.Any(c => c.ToLower().Contains("vista")))
            {
                buttons.Append("<button onclick=\"setView('3d')\">3D</button>");
                buttons.Append("<button onclick=\"setView('top')\">Superior</button>");
                buttons.Append("<button onclick=\"setView('front')\">Frontal</button>");
                buttons.Append("<button onclick=\"setView('side')\">Lateral</button>");
                buttons.Append("<span style=\"width:1px;height:20px;background:#555;margin:0 8px;\"></span>"); // Separator
            }

            // Revit-style tools
            buttons.Append("<span style=\"width:1px;height:20px;background:#555;margin:0 8px;\"></span>");
            buttons.Append("<button id=\"btn-grid\" onclick=\"toggleGridTool()\" title=\"Colocar Rejilla (G)\">📐 Rejilla</button>");
            buttons.Append("<button id=\"btn-align\" onclick=\"toggleAlignTool()\" title=\"Alinear (AL)\">↔️ Alinear</button>");

            // Conversion buttons
            buttons.Append("<span style=\"width:1px;height:20px;background:#555;margin:0 8px;\"></span>");
            buttons.Append("<button onclick=\"copyAsUcode()\" title=\"Copiar como directivas simplificadas\">📋 @{ucode}</button>");
            buttons.Append("<button onclick=\"copyAsCode()\" title=\"Copiar como código HTML/JS completo\">📋 @{code}</button>");

            buttons.Append("</div>");
            return buttons.ToString();
        }

        /// <summary>
        /// Generate control panel HTML based on controls list
        /// </summary>
        private static string GenerateControlPanelHtml(System.Collections.Generic.List<string> controles, string viewerId)
        {
            var html = new System.Text.StringBuilder();

            if (controles.Any(c => c.ToLower().Contains("color") || c.ToLower().Contains("fondo")))
            {
                html.Append("<label>Color de Fondo</label>");
                html.Append("<input type=\"color\" value=\"#1a1a2e\" onchange=\"setBackground(this.value)\">");
            }

            if (controles.Any(c => c.ToLower().Contains("zoom")))
            {
                html.Append("<label>Zoom</label>");
                html.Append("<input type=\"range\" min=\"10\" max=\"200\" value=\"50\">");
            }

            if (controles.Any(c => c.ToLower().Contains("rotacion")))
            {
                html.Append("<label>Rotación</label>");
                html.Append("<input type=\"range\" min=\"0\" max=\"360\" value=\"0\">");
            }

            return html.ToString();
        }

        #endregion

        #region Bidirectional Conversion: HTML ↔ Directives

        /// <summary>
        /// Convert HTML/JS code to simplified directives
        /// Useful when user wants to simplify complex HTML into directives
        /// </summary>
        public static string ConvertHtmlToDirectives(string htmlCode)
        {
            var directives = new System.Text.StringBuilder();

            try
            {
                // Extract background color from CSS or JS
                string fondo = ExtractValue(htmlCode, @"background:\s*([#\w]+)", "#1a1a2e");
                if (string.IsNullOrEmpty(fondo))
                    fondo = ExtractValue(htmlCode, @"scene\.background\s*=\s*new\s+THREE\.Color\s*\(\s*0x([a-fA-F0-9]+)", "1e1e1e");
                if (fondo.StartsWith("0x")) fondo = "#" + fondo.Substring(2);
                if (!fondo.StartsWith("#") && fondo.Length == 6) fondo = "#" + fondo;

                // Extract camera position
                string camaraPos = "50,50,50";
                var posMatch = Regex.Match(htmlCode, @"camera\.position\.set\s*\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)");
                if (posMatch.Success)
                    camaraPos = $"{posMatch.Groups[1].Value},{posMatch.Groups[2].Value},{posMatch.Groups[3].Value}";

                // Extract viewer height - look for IFC viewer specific patterns first
                // Try to find height in the main viewer div (usually has 600px)
                string altura = ExtractValue(htmlCode, @"ifc-viewer[^{]*\{\s*[^}]*height:\s*(\d+)px", "");
                if (string.IsNullOrEmpty(altura) || altura == "0")
                {
                    // Try looking for height in style with 100% width context
                    altura = ExtractValue(htmlCode, @"width:\s*100%[^}]*height:\s*(\d+)px", "");
                }
                if (string.IsNullOrEmpty(altura) || altura == "0")
                {
                    // Fallback: find any 3-digit height (likely 600)
                    altura = ExtractValue(htmlCode, @"height:\s*(\d{3,})px", "600");
                }
                if (string.IsNullOrEmpty(altura)) altura = "600";

                // Extract ambient light intensity
                string luzAmbiente = ExtractValue(htmlCode, @"AmbientLight\s*\([^,]+,\s*([\d.]+)\s*\)", "0.5");

                // Extract directional light intensity
                string luzDireccional = ExtractValue(htmlCode, @"DirectionalLight\s*\([^,]+,\s*([\d.]+)\s*\)", "0.8");

                // Check if grid is present
                bool tieneGrid = htmlCode.Contains("GridHelper");

                // Check camera type
                string camaraTipo = htmlCode.Contains("OrthographicCamera") ? "ortografica" : "perspectiva";

                // Extract IFC file URL
                string archivoIfc = ExtractValue(htmlCode, @"fetch\s*\(\s*['""]([^'""]+\.ifc)['""]", "");

                // Build directives
                directives.AppendLine($"@{{fondo: {fondo}}}");
                directives.AppendLine($"@{{altura: {altura}}}");
                directives.AppendLine($"@{{camara: tipo={camaraTipo}, pos={camaraPos}}}");
                directives.AppendLine($"@{{luz.ambiente: {luzAmbiente}}}");
                directives.AppendLine($"@{{luz.direccional: {luzDireccional}}}");
                directives.AppendLine($"@{{grid: {(tieneGrid ? "visible" : "oculto")}}}");

                if (!string.IsNullOrEmpty(archivoIfc))
                    directives.AppendLine($"@{{archivo: {archivoIfc}}}");

                // Extract controls if present
                var controles = new System.Collections.Generic.List<string>();
                if (htmlCode.Contains("setView") || htmlCode.Contains("Vista"))
                    controles.Add("vistas");
                if (htmlCode.Contains("zoom") || htmlCode.Contains("Zoom"))
                    controles.Add("zoom");
                if (htmlCode.Contains("rotation") || htmlCode.Contains("Rotacion"))
                    controles.Add("rotacion");
                if (htmlCode.Contains("setBackground") || htmlCode.Contains("color"))
                    controles.Add("color");

                if (controles.Count > 0)
                    directives.AppendLine($"@{{controles: {string.Join(", ", controles)}}}");
            }
            catch
            {
                // If parsing fails, return minimal directives
                directives.AppendLine("@{fondo: #1a1a2e}");
                directives.AppendLine("@{altura: 600}");
                directives.AppendLine("@{camara: tipo=perspectiva, pos=50,50,50}");
            }

            return directives.ToString().TrimEnd();
        }

        /// <summary>
        /// Convert simplified directives to full HTML/JS code
        /// Used when @{ucode} wrapper contains directives that need to become full HTML
        /// </summary>
        public static string ConvertDirectivesToHtml(string directives)
        {
            // Parse directives
            string fondo = ExtractDirectiveValue(directives, "fondo", "#1a1a2e");
            string altura = ExtractDirectiveValue(directives, "altura", "600");
            string camaraTipo = ExtractDirectiveValue(directives, "camara", "tipo", "perspectiva");
            string camaraPos = ExtractDirectiveValue(directives, "camara", "pos", "50,50,50");
            string luzAmbiente = ExtractDirectiveValue(directives, "luz.ambiente", "0.5");
            string luzDireccional = ExtractDirectiveValue(directives, "luz.direccional", "0.8");
            string grid = ExtractDirectiveValue(directives, "grid", "visible");
            string archivo = ExtractDirectiveValue(directives, "archivo", "");

            // Parse camera position
            var posArray = camaraPos.Split(',');
            string posX = posArray.Length > 0 ? posArray[0].Trim() : "50";
            string posY = posArray.Length > 1 ? posArray[1].Trim() : "50";
            string posZ = posArray.Length > 2 ? posArray[2].Trim() : "50";

            // Convert fondo to hex for JS (0x format)
            string fondoHex = fondo.StartsWith("#") ? "0x" + fondo.Substring(1) : "0x1e1e1e";

            string viewerId = $"ifc-viewer-{Guid.NewGuid():N}";

            // Generate embeddable HTML (no full document structure)
            return $@"<style>
        /* ========== ESTILOS DEL VISOR IFC ========== */
        #{viewerId} {{ width: 100%; height: {altura}px; position: relative; background: {fondo}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #fff; }}
        #{viewerId}-canvas {{ width: 100%; height: 100%; }}
        @keyframes ifc-spin-{viewerId} {{ to {{ transform: rotate(360deg); }} }}
    </style>
    <div id=""{viewerId}"">
        <canvas id=""{viewerId}-canvas""></canvas>
        <div id=""{viewerId}-loading"" style=""position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff;"">
            <div style=""width: 50px; height: 50px; border: 3px solid #333; border-top-color: #0078d4; border-radius: 50%; animation: ifc-spin-{viewerId} 1s linear infinite; margin: 0 auto;""></div>
            <p style=""margin-top: 15px;"" id=""{viewerId}-status"">Cargando...</p>
        </div>
    </div>
    <script src=""https://calcpad.ifc/three.min.js""></script>
    <script src=""https://calcpad.ifc/OrbitControls.js""></script>
    <script src=""https://calcpad.ifc/web-ifc-api-iife.js""></script>
    <script>
    (async function() {{
        const container = document.getElementById('{viewerId}');
        const canvas = document.getElementById('{viewerId}-canvas');
        const loading = document.getElementById('{viewerId}-loading');

        try {{
            // ========== ESCENA 3D ==========
            const scene = new THREE.Scene();
            /* @{{fondo}} */
            scene.background = new THREE.Color({fondoHex});

            // ========== CAMARA ==========
            /* @{{camara: tipo={camaraTipo}, pos={camaraPos}}} */
            const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
            camera.position.set({posX}, {posY}, {posZ});

            const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);

            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;

            // ========== ILUMINACION ==========
            /* @{{luz.ambiente: {luzAmbiente}}} */
            scene.add(new THREE.AmbientLight(0xffffff, {luzAmbiente}));

            /* @{{luz.direccional: {luzDireccional}}} */
            const dirLight = new THREE.DirectionalLight(0xffffff, {luzDireccional});
            dirLight.position.set(50, 100, 50);
            scene.add(dirLight);

            // ========== GRID ==========
            /* @{{grid: {grid}}} */
            {(grid == "visible" ? "const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x333333);\n            scene.add(gridHelper);" : "// Grid oculto")}

            // ========== CONFIGURACION GLOBAL ==========
            const globalOpacity = 1.0;
            const useWireframe = false;

            // ========== CARGA DEL ARCHIVO IFC ==========
            /* @{{archivo: {archivo}}} */
            {(string.IsNullOrEmpty(archivo) ? "if (loading) loading.innerHTML = '<p>No se especificó archivo IFC</p>';" : $@"
            const response = await fetch('{archivo}');
            if (!response.ok) throw new Error('Error descargando IFC: ' + response.status);
            const ifcData = await response.arrayBuffer();

            const ifcApi = new WebIFC.IfcAPI();
            await ifcApi.Init(function(path) {{
                if (path.endsWith('.wasm')) return 'https://calcpad.ifc/' + path;
                return path;
            }});

            const modelID = ifcApi.OpenModel(new Uint8Array(ifcData));
            const flatMeshes = ifcApi.LoadAllGeometry(modelID);

            const allMeshes = new THREE.Group();
            for (let i = 0; i < flatMeshes.size(); i++) {{
                const flatMesh = flatMeshes.get(i);
                const placedGeometries = flatMesh.geometries;
                for (let j = 0; j < placedGeometries.size(); j++) {{
                    const pg = placedGeometries.get(j);
                    const geom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);
                    const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                    const indices = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
                    if (verts.length === 0 || indices.length === 0) continue;

                    const positions = new Float32Array(verts.length / 2);
                    const normals = new Float32Array(verts.length / 2);
                    for (let k = 0; k < verts.length; k += 6) {{
                        const idx = (k / 6) * 3;
                        positions[idx] = verts[k]; positions[idx+1] = verts[k+1]; positions[idx+2] = verts[k+2];
                        normals[idx] = verts[k+3]; normals[idx+1] = verts[k+4]; normals[idx+2] = verts[k+5];
                    }}

                    const bufferGeom = new THREE.BufferGeometry();
                    bufferGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    bufferGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                    bufferGeom.setIndex(new THREE.BufferAttribute(indices, 1));

                    const color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
                    const finalOpacity = Math.min(pg.color.w, globalOpacity);
                    const material = new THREE.MeshPhongMaterial({{
                        color,
                        side: THREE.DoubleSide,
                        transparent: finalOpacity < 1,
                        opacity: finalOpacity,
                        wireframe: useWireframe
                    }});
                    const meshObj = new THREE.Mesh(bufferGeom, material);
                    meshObj.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
                    meshObj.castShadow = true;
                    meshObj.receiveShadow = true;
                    allMeshes.add(meshObj);
                }}
            }}
            scene.add(allMeshes);

            // Ajustar vista
            const box = new THREE.Box3().setFromObject(allMeshes);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
            controls.target.copy(center);
            controls.update();

            ifcApi.CloseModel(modelID);
            ")}

            if (loading) loading.style.display = 'none';

            // ========== ANIMACION ==========
            function animate() {{
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }}
            animate();

            window.addEventListener('resize', () => {{
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            }});

        }} catch (error) {{
            console.error('Viewer Error:', error);
            if (loading) loading.innerHTML = '<p style=""color: red;"">Error: ' + error.message + '</p>';
        }}
    }})();
    </script>";
        }

        /// <summary>
        /// Extract a value using regex pattern
        /// </summary>
        private static string ExtractValue(string content, string pattern, string defaultValue)
        {
            var match = Regex.Match(content, pattern, RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value : defaultValue;
        }

        /// <summary>
        /// Extract a directive value like @{name: value}
        /// </summary>
        private static string ExtractDirectiveValue(string directives, string name, string defaultValue)
        {
            var pattern = $@"@{{{name}:\s*([^}}]+)}}";
            var match = Regex.Match(directives, pattern, RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value.Trim() : defaultValue;
        }

        /// <summary>
        /// Extract a specific parameter from a directive like @{camara: tipo=x, pos=y}
        /// </summary>
        private static string ExtractDirectiveValue(string directives, string directiveName, string paramName, string defaultValue)
        {
            // First find the directive
            var directivePattern = $@"@{{{directiveName}:\s*([^}}]+)}}";
            var directiveMatch = Regex.Match(directives, directivePattern, RegexOptions.IgnoreCase);
            if (!directiveMatch.Success) return defaultValue;

            // Then find the parameter
            var paramPattern = $@"{paramName}\s*=\s*([^,}}]+)";
            var paramMatch = Regex.Match(directiveMatch.Groups[1].Value, paramPattern, RegexOptions.IgnoreCase);
            return paramMatch.Success ? paramMatch.Groups[1].Value.Trim() : defaultValue;
        }

        /// <summary>
        /// Check if content is HTML/JS (true) or simplified directives (false)
        /// </summary>
        public static bool IsCodeMode(string content)
        {
            var trimmed = content.Trim();
            return trimmed.Contains("<!DOCTYPE") ||
                   trimmed.Contains("<html") ||
                   trimmed.Contains("<script") ||
                   trimmed.Contains("<style");
        }

        /// <summary>
        /// Toggle between HTML and directives modes
        /// Returns the converted content
        /// </summary>
        public static string ToggleCodeMode(string content, bool toDirectives)
        {
            if (toDirectives)
            {
                // Convert HTML to directives
                return ConvertHtmlToDirectives(content);
            }
            else
            {
                // Convert directives to HTML
                return ConvertDirectivesToHtml(content);
            }
        }

        #endregion
    }
}
