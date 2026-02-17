using Hekatan.Common;
using Hekatan.OpenXml;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace Hekatan.Cli
{
    internal class Converter
    {
        private readonly HtmlTemplateWrapper _templateWrapper = new();
        private readonly bool _isSilent;

        internal Converter(bool isSilent) : this(isSilent, null)
        {
        }

        internal Converter(bool isSilent, string customTemplate)
        {
            var appUrl = $"file:///{Program.AppPath.Replace("\\", "/")}doc/";
            var docDir = $"{Program.AppPath}doc{Path.DirectorySeparatorChar}";

            // Resolve template path (custom or culture-specific default)
            string templatePath;
            if (!string.IsNullOrEmpty(customTemplate))
            {
                templatePath = Path.Combine(docDir, $"{customTemplate}.html");
                if (!File.Exists(templatePath))
                    templatePath = Path.Combine(docDir, $"template{Program.AddCultureExt("html")}");
            }
            else
            {
                templatePath = Path.Combine(docDir, $"template{Program.AddCultureExt("html")}");
            }

            // Use centralized HtmlTemplateWrapper (shared with WPF)
            _templateWrapper.LoadTemplate(templatePath, "https://calcpad.local/", appUrl);
            _isSilent = isSilent;
        }

        internal void ToHtml(string html, string path)
        {
            // Para CLI: reemplazar URLs del virtual host con CDN/rutas locales
            html = ConvertIfcUrlsForCli(html, path);
            File.WriteAllText(path, _templateWrapper.Wrap(html));
            if (!_isSilent && File.Exists(path))
                Run(path);
        }

        /// <summary>
        /// Convierte URLs del virtual host (https://calcpad.ifc/) a URLs que funcionan en navegador
        /// - Librerías JS -> CDN
        /// - Archivos IFC -> rutas relativas locales
        /// - Archivos WASM -> CDN
        /// </summary>
        private static string ConvertIfcUrlsForCli(string html, string outputPath)
        {
            if (!html.Contains("calcpad.ifc", StringComparison.OrdinalIgnoreCase))
                return html;

            string outputDir = Path.GetDirectoryName(Path.GetFullPath(outputPath)) ?? "";

            // Reemplazar librerías Three.js con CDN (usar 0.149.0 que tiene scripts UMD)
            html = html.Replace("https://calcpad.ifc/three.min.js", "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js");
            html = html.Replace("https://calcpad.ifc/OrbitControls.js", "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js");

            // Reemplazar web-ifc con CDN
            html = html.Replace("https://calcpad.ifc/web-ifc-api-iife.js", "https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/web-ifc-api-iife.js");

            // Para archivos .wasm, usar CDN (web-ifc descarga automáticamente)
            // Eliminar la función de mapeo de WASM que usa calcpad.ifc
            html = System.Text.RegularExpressions.Regex.Replace(
                html,
                @"p\s*=>\s*p\.endsWith\(['""]\.wasm['""]\)\s*\?\s*['""]https://calcpad\.ifc/['""]\s*\+\s*p\s*:\s*p",
                "undefined",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            // Reemplazar archivos IFC con rutas relativas
            // Buscar archivos IFC en resources/ifc y copiarlos al directorio de salida
            string appPath = Program.AppPath;
            string ifcResourcePath = Path.Combine(appPath, "resources", "ifc");

            var ifcUrlPattern = new System.Text.RegularExpressions.Regex(
                @"https://calcpad\.ifc/([^'""\s<>]+\.ifc)",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            var matches = ifcUrlPattern.Matches(html);
            foreach (System.Text.RegularExpressions.Match match in matches)
            {
                string ifcFileName = match.Groups[1].Value;
                string sourceFile = Path.Combine(ifcResourcePath, ifcFileName);
                string destFile = Path.Combine(outputDir, ifcFileName);

                // Copiar archivo IFC al directorio de salida si existe
                if (File.Exists(sourceFile) && !File.Exists(destFile))
                {
                    try
                    {
                        File.Copy(sourceFile, destFile, true);
                    }
                    catch { }
                }

                // Reemplazar URL con ruta relativa
                html = html.Replace($"https://calcpad.ifc/{ifcFileName}", ifcFileName);
            }

            // Reemplazar cualquier otra referencia a calcpad.ifc con CDN base
            html = html.Replace("'https://calcpad.ifc/'", "'https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/'");
            html = html.Replace("\"https://calcpad.ifc/\"", "\"https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/\"");

            return html;
        }

        internal void ToOpenXml(string html, string path, List<string> expressions)
        {
            html = GetHtmlData(_templateWrapper.Wrap(html));
            new OpenXmlWriter(expressions).Convert(html, path);
            if (!_isSilent && File.Exists(path))
                Run(path);
        }
        internal void ToPdf(string html, string path)
        {
            var htmlFile = Path.ChangeExtension(path, ".html");
            File.WriteAllText(htmlFile, _templateWrapper.Wrap(html));
            
            string wkhtmltopdfPath;

            if (OperatingSystem.IsWindows())
            {
                wkhtmltopdfPath = Program.AppPath + "wkhtmltopdf.exe";
            }
            else
            {
                wkhtmltopdfPath = "/usr/bin/wkhtmltopdf";
                
                if (!File.Exists("/usr/bin/wkhtmltopdf"))
                {
                    throw new DirectoryNotFoundException("wkhtmltopdf not found.");
                }
            }
            
            var startInfo = new ProcessStartInfo
            {
                FileName = wkhtmltopdfPath
            };
            const string s = " --enable-local-file-access --disable-smart-shrinking --page-size A4  --margin-bottom 15 --margin-left 15 --margin-right 10 --margin-top 15 ";
            if (htmlFile.Contains(' ', StringComparison.Ordinal))
                startInfo.Arguments = s + '\"' + htmlFile + "\" \"" + path + '\"';
            else
                startInfo.Arguments = s + htmlFile + " " + path;

            startInfo.UseShellExecute = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            var process = Process.Start(startInfo);
            process?.WaitForExit();
            
            File.Delete(htmlFile);
            if (!_isSilent && File.Exists(path))
                Run(path);
        }

        private static void Run(string fileName) 
        {
            Process process = new()
            {
                StartInfo = new ProcessStartInfo(fileName)
                {
                    UseShellExecute = true
                }
            };
            process.Start();
        }



        private static string GetHtmlData(string html)
        {
            var sb = new StringBuilder(500);
            const string header =
@"Version:1.0
StartHTML:0000000001
EndHTML:0000000002
StartFragment:0000000003
EndFragment:0000000004";
            const string startFragmentText = "<!DOCTYPE HTML><!--StartFragment-->";
            const string endFragmentText = "<!--EndFragment-->";
            var startHtml = header.Length;
            var startFragment = startHtml + startFragmentText.Length;
            var endFragment = startFragment + html.Length;
            var endHtml = endFragment + endFragmentText.Length;
            sb.Append(header);
            sb.Replace("0000000001", $"{startHtml,8}");
            sb.Replace("0000000002", $"{endHtml,8}");
            sb.Replace("0000000003", $"{startFragment,8}");
            sb.Replace("0000000004", $"{endFragment,8}");
            sb.Append(startFragmentText);
            sb.Append(html);
            sb.Append(endFragmentText);
            return sb.ToString();
        }
    }
}
