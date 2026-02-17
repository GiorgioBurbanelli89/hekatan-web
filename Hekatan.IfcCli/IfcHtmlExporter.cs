using System;
using System.IO;
using System.Text.RegularExpressions;
using Hekatan.Common.MultLangCode;

namespace Hekatan.IfcCli
{
    /// <summary>
    /// Exports IFC files to standalone HTML with 3D viewer (Three.js + web-ifc)
    /// Reuses IfcLanguageHandler from Hekatan.Common
    /// </summary>
    public class IfcHtmlExporter
    {
        /// <summary>
        /// Export an IFC file to a standalone HTML file with interactive 3D viewer
        /// </summary>
        /// <param name="ifcPath">Path to the IFC file</param>
        /// <param name="htmlPath">Output HTML path</param>
        /// <param name="libsPath">"cdn" for CDN, or local path to Three.js/web-ifc libraries</param>
        public void Export(string ifcPath, string htmlPath, string libsPath = "cdn")
        {
            if (!File.Exists(ifcPath))
                throw new FileNotFoundException($"IFC file not found: {ifcPath}");

            var fileInfo = new FileInfo(ifcPath);
            var fileName = fileInfo.Name;

            string html;

            if (fileInfo.Length > 50 * 1024 * 1024) // >50 MB
            {
                // Large file: use file-based loading (copy IFC alongside HTML)
                html = ExportLargeFile(ifcPath, htmlPath, fileName, libsPath);
            }
            else
            {
                // Small/medium file: embed as Base64
                byte[] ifcBytes = File.ReadAllBytes(ifcPath);
                string ifcBase64 = Convert.ToBase64String(ifcBytes);
                html = IfcLanguageHandler.GenerateStandaloneViewer(ifcBase64, fileName, useCdn: libsPath == "cdn");
            }

            // Always fix Three.js version: v0.170+ is ES module only, need v0.128.0 for <script> tags
            html = FixThreeJsVersion(html);

            // If using non-CDN local path, rewrite URLs
            if (libsPath != "cdn")
            {
                html = RewriteLocalPaths(html, libsPath);
            }

            // For CDN mode, ensure we use the CDN URLs (fix any virtual host leftovers)
            if (libsPath == "cdn")
            {
                html = ConvertVirtualHostToCdn(html);
            }

            File.WriteAllText(htmlPath, html);
        }

        /// <summary>
        /// Handle large files by copying IFC alongside HTML and using fetch-based loading
        /// </summary>
        private static string ExportLargeFile(string ifcPath, string htmlPath, string fileName, string libsPath)
        {
            // Copy IFC file to output directory
            string outputDir = Path.GetDirectoryName(Path.GetFullPath(htmlPath)) ?? ".";
            string destIfcPath = Path.Combine(outputDir, fileName);
            if (Path.GetFullPath(ifcPath) != Path.GetFullPath(destIfcPath))
                File.Copy(ifcPath, destIfcPath, overwrite: true);

            // Generate viewer that loads IFC from file (fetch)
            string threeJs, orbitJs, webIfcJs, wasmLocate;
            if (libsPath == "cdn")
            {
                // Use v0.128.0 which exposes THREE as global (UMD), not ES module
                threeJs = "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js";
                orbitJs = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js";
                webIfcJs = "https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/web-ifc-api-iife.js";
                wasmLocate = "// WASM auto-resolved from CDN script URL";
            }
            else
            {
                threeJs = $"{libsPath}/three.min.js";
                orbitJs = $"{libsPath}/OrbitControls.js";
                webIfcJs = $"{libsPath}/web-ifc-api-iife.js";
                wasmLocate = $"ifcAPI.SetWasmPath('{libsPath}/');";
            }

            return $@"<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>IFC Viewer - {fileName}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ width: 100vw; height: 100vh; overflow: hidden; font-family: -apple-system, sans-serif; background: #1e1e1e; color: #fff; }}
        #container {{ width: 100%; height: 100%; position: relative; }}
        canvas {{ width: 100%; height: 100%; }}
        #loading {{ position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }}
        .spinner {{ width: 50px; height: 50px; border: 3px solid #333; border-top-color: #0078d4; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto; }}
        @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
        #info {{ position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 5px; font-size: 12px; }}
        #toolbar {{ position: absolute; top: 8px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; background: rgba(0,0,0,0.85); padding: 5px 8px; border-radius: 6px; z-index: 100; }}
        .btn {{ background: #2c3e50; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 10px; }}
        .btn:hover {{ background: #3498db; }}
    </style>
</head>
<body>
    <div id=""container"">
        <canvas id=""canvas""></canvas>
        <div id=""toolbar"">
            <button class=""btn"" onclick=""setView('top')"">Planta</button>
            <button class=""btn"" onclick=""setView('front')"">Frontal</button>
            <button class=""btn"" onclick=""setView('3d')"">3D</button>
            <button class=""btn"" onclick=""fitView()"">Fit</button>
        </div>
        <div id=""info""><strong>{fileName}</strong><div id=""stats""></div></div>
        <div id=""loading""><div class=""spinner""></div><p style=""margin-top:15px"">Cargando {fileName}...</p></div>
    </div>
    <script src=""{threeJs}""></script>
    <script src=""{orbitJs}""></script>
    <script src=""{webIfcJs}""></script>
    <script>
    (async function() {{
        const canvas = document.getElementById('canvas');
        const loading = document.getElementById('loading');
        const stats = document.getElementById('stats');

        // Three.js setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e1e1e);
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 10000);
        const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        const controls = new THREE.OrbitControls(camera, canvas);
        controls.enableDamping = true;
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(50, 100, 50);
        scene.add(dirLight);
        const grid = new THREE.GridHelper(100, 50, 0x444444, 0x333333);
        scene.add(grid);

        // Load IFC from file
        const ifcAPI = new WebIFC.IfcAPI();
        {wasmLocate}
        await ifcAPI.Init();

        const resp = await fetch('{fileName}');
        const data = new Uint8Array(await resp.arrayBuffer());
        const modelID = ifcAPI.OpenModel(data);

        // Extract geometry
        const meshes = ifcAPI.LoadAllGeometry(modelID);
        let totalVerts = 0, totalTris = 0;
        const modelGroup = new THREE.Group();

        for (let i = 0; i < meshes.size(); i++) {{
            const mesh = meshes.get(i);
            const placedGeometries = mesh.geometries;
            for (let j = 0; j < placedGeometries.size(); j++) {{
                const pg = placedGeometries.get(j);
                const geom = ifcAPI.GetGeometry(modelID, pg.geometryExpressID);
                const vData = ifcAPI.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                const iData = ifcAPI.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
                const vertices = new Float32Array(vData.length / 2);
                for (let k = 0; k < vData.length; k += 6) {{
                    vertices[k/6*3] = vData[k]; vertices[k/6*3+1] = vData[k+1]; vertices[k/6*3+2] = vData[k+2];
                }}
                const bufGeom = new THREE.BufferGeometry();
                bufGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                bufGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(iData), 1));
                bufGeom.computeVertexNormals();
                const color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
                const mat = new THREE.MeshPhongMaterial({{ color, opacity: pg.color.w, transparent: pg.color.w < 1, side: THREE.DoubleSide }});
                const m = new THREE.Mesh(bufGeom, mat);
                const matrix = new THREE.Matrix4();
                matrix.fromArray(pg.flatTransformation);
                m.applyMatrix4(matrix);
                modelGroup.add(m);
                totalVerts += vertices.length / 3;
                totalTris += iData.length / 3;
            }}
        }}

        scene.add(modelGroup);
        ifcAPI.CloseModel(modelID);
        loading.style.display = 'none';
        stats.innerHTML = `${{totalVerts.toLocaleString()}} vertices, ${{totalTris.toLocaleString()}} triangles`;

        // Center model
        const box = new THREE.Box3().setFromObject(modelGroup);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(center.x + maxDim, center.y + maxDim * 0.7, center.z + maxDim);
        controls.target.copy(center);
        controls.update();

        window.setView = (view) => {{
            const d = maxDim * 1.5;
            if (view === 'top') camera.position.set(center.x, center.y + d, center.z);
            else if (view === 'front') camera.position.set(center.x, center.y, center.z + d);
            else camera.position.set(center.x + d*0.7, center.y + d*0.5, center.z + d*0.7);
            controls.target.copy(center);
            controls.update();
        }};
        window.fitView = () => {{
            const d = maxDim * 1.5;
            camera.position.set(center.x + d*0.7, center.y + d*0.5, center.z + d*0.7);
            controls.target.copy(center);
            controls.update();
        }};

        function animate() {{ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }}
        animate();
        window.addEventListener('resize', () => {{
            camera.aspect = window.innerWidth/window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }});
    }})();
    </script>
</body>
</html>";
        }

        /// <summary>
        /// Convert any calcpad.ifc virtual host URLs to CDN
        /// </summary>
        private static string ConvertVirtualHostToCdn(string html)
        {
            if (!html.Contains("calcpad.ifc", StringComparison.OrdinalIgnoreCase))
                return html;

            // Use Three.js v0.128.0 (UMD/global, works with <script> tags)
            html = html.Replace("https://calcpad.ifc/three.min.js", "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js");
            html = html.Replace("https://calcpad.ifc/OrbitControls.js", "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js");
            html = html.Replace("https://calcpad.ifc/web-ifc-api-iife.js", "https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/web-ifc-api-iife.js");

            // Also replace any v0.170.0 CDN URLs (ES module, doesn't work with <script>)
            html = Regex.Replace(html, @"https://cdn\.jsdelivr\.net/npm/three@0\.170\.0/build/three\.min\.js",
                "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js");
            html = Regex.Replace(html, @"https://cdn\.jsdelivr\.net/npm/three@0\.170\.0/examples/js/controls/OrbitControls\.js",
                "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js");
            html = Regex.Replace(html, @"https://cdn\.jsdelivr\.net/npm/web-ifc@0\.0\.57/",
                "https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/");

            // WASM locator
            html = Regex.Replace(html,
                @"p\s*=>\s*p\.endsWith\(['""]\.wasm['""]\)\s*\?\s*['""]https://calcpad\.ifc/['""]\s*\+\s*p\s*:\s*p",
                "undefined",
                RegexOptions.IgnoreCase);

            html = html.Replace("'https://calcpad.ifc/'", "'https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/'");
            html = html.Replace("\"https://calcpad.ifc/\"", "\"https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/\"");

            return html;
        }

        /// <summary>
        /// Rewrite CDN or virtual host URLs to local library paths
        /// </summary>
        private static string RewriteLocalPaths(string html, string localPath)
        {
            // Replace any CDN version of Three.js / web-ifc
            html = Regex.Replace(html, @"https://cdn\.jsdelivr\.net/npm/three@[^/]+/build/three\.min\.js", $"{localPath}/three.min.js");
            html = Regex.Replace(html, @"https://cdn\.jsdelivr\.net/npm/three@[^/]+/examples/js/controls/OrbitControls\.js", $"{localPath}/OrbitControls.js");
            html = Regex.Replace(html, @"https://cdn\.jsdelivr\.net/npm/web-ifc@[^/]+/web-ifc-api-iife\.js", $"{localPath}/web-ifc-api-iife.js");

            // Also replace virtual host
            html = html.Replace("https://calcpad.ifc/three.min.js", $"{localPath}/three.min.js");
            html = html.Replace("https://calcpad.ifc/OrbitControls.js", $"{localPath}/OrbitControls.js");
            html = html.Replace("https://calcpad.ifc/web-ifc-api-iife.js", $"{localPath}/web-ifc-api-iife.js");

            return html;
        }

        /// <summary>
        /// Downgrade Three.js from v0.170+ (ES module only) to v0.128.0 (UMD/global)
        /// and web-ifc from v0.0.57 to v0.0.66 for compatibility with script tags
        /// </summary>
        private static string FixThreeJsVersion(string html)
        {
            // Three.js: any version -> 0.128.0 (last UMD version that exposes global THREE)
            html = Regex.Replace(html,
                @"https://cdn\.jsdelivr\.net/npm/three@(?!0\.128\.0)[^/]+/build/three\.min\.js",
                "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js");
            html = Regex.Replace(html,
                @"https://cdn\.jsdelivr\.net/npm/three@(?!0\.128\.0)[^/]+/examples/js/controls/OrbitControls\.js",
                "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js");

            // web-ifc: v0.0.57 -> v0.0.66
            html = html.Replace("web-ifc@0.0.57/", "web-ifc@0.0.66/");

            return html;
        }
    }
}
