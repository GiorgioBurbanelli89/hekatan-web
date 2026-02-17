using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;

namespace Hekatan.Wpf
{
    /// <summary>
    /// Sistema de telemetría en tiempo real para Hekatan WPF
    /// Registra eventos, errores y métricas de rendimiento
    /// </summary>
    public static class HekatanTelemetry
    {
        private static readonly string TelemetryFilePath;
        private static readonly object _lock = new object();
        private static bool _isEnabled = true;
        private static readonly Stopwatch _sessionStopwatch;

        static HekatanTelemetry()
        {
            // Crear archivo de telemetría en %TEMP%\Hekatan
            var tempDir = Path.Combine(Path.GetTempPath(), "Hekatan");
            Directory.CreateDirectory(tempDir);

            var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            TelemetryFilePath = Path.Combine(tempDir, $"calcpad_telemetry_{timestamp}.log");

            _sessionStopwatch = Stopwatch.StartNew();

            // Registrar inicio de sesión
            LogSessionStart();
        }

        public static void Enable() => _isEnabled = true;
        public static void Disable() => _isEnabled = false;
        public static string GetTelemetryFilePath() => TelemetryFilePath;

        private static void LogSessionStart()
        {
            var header = new StringBuilder();
            header.AppendLine("=".PadRight(80, '='));
            header.AppendLine($"CALCPAD WPF - TELEMETRY SESSION START");
            header.AppendLine($"Timestamp: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}");
            header.AppendLine($"Machine: {Environment.MachineName}");
            header.AppendLine($"User: {Environment.UserName}");
            header.AppendLine($"OS: {Environment.OSVersion}");
            header.AppendLine($".NET Version: {Environment.Version}");
            header.AppendLine($"Working Directory: {Environment.CurrentDirectory}");
            header.AppendLine($"Telemetry File: {TelemetryFilePath}");
            header.AppendLine("=".PadRight(80, '='));
            header.AppendLine();

            WriteToFile(header.ToString());
        }

        /// <summary>
        /// Registra un evento general
        /// </summary>
        public static void LogEvent(string category, string message, object data = null)
        {
            if (!_isEnabled) return;

            var elapsed = _sessionStopwatch.Elapsed;
            var log = new StringBuilder();
            log.Append($"[{elapsed:hh\\:mm\\:ss\\.fff}] ");
            log.Append($"[{category}] ");
            log.Append(message);

            if (data != null)
            {
                log.AppendLine();
                log.Append($"  Data: {SerializeData(data)}");
            }

            log.AppendLine();
            WriteToFile(log.ToString());
        }

        /// <summary>
        /// Registra un error
        /// </summary>
        public static void LogError(string category, Exception ex, string context = null)
        {
            if (!_isEnabled) return;

            var elapsed = _sessionStopwatch.Elapsed;
            var log = new StringBuilder();
            log.AppendLine($"[{elapsed:hh\\:mm\\:ss\\.fff}] [ERROR] [{category}]");

            if (!string.IsNullOrEmpty(context))
                log.AppendLine($"  Context: {context}");

            log.AppendLine($"  Exception: {ex.GetType().Name}");
            log.AppendLine($"  Message: {ex.Message}");
            log.AppendLine($"  StackTrace:");
            log.AppendLine($"    {ex.StackTrace?.Replace("\n", "\n    ")}");

            if (ex.InnerException != null)
            {
                log.AppendLine($"  Inner Exception: {ex.InnerException.Message}");
            }

            log.AppendLine();
            WriteToFile(log.ToString());
        }

        /// <summary>
        /// Registra métricas de rendimiento
        /// </summary>
        public static void LogMetric(string name, long value, string unit = "ms")
        {
            if (!_isEnabled) return;

            var elapsed = _sessionStopwatch.Elapsed;
            var log = $"[{elapsed:hh\\:mm\\:ss\\.fff}] [METRIC] {name}: {value} {unit}\n";
            WriteToFile(log);
        }

        /// <summary>
        /// Registra inicio de operación (devuelve Stopwatch para medir duración)
        /// </summary>
        public static Stopwatch BeginOperation(string operationName, object parameters = null)
        {
            LogEvent("OPERATION_START", operationName, parameters);
            return Stopwatch.StartNew();
        }

        /// <summary>
        /// Registra fin de operación
        /// </summary>
        public static void EndOperation(string operationName, Stopwatch sw, object result = null)
        {
            sw.Stop();
            var log = new StringBuilder();
            log.Append($"OPERATION_END: {operationName} (Duration: {sw.ElapsedMilliseconds} ms)");

            LogEvent("OPERATION_END", operationName, new
            {
                DurationMs = sw.ElapsedMilliseconds,
                Result = result
            });

            LogMetric($"Operation_{operationName}", sw.ElapsedMilliseconds);
        }

        /// <summary>
        /// Registra estado de UI Automation
        /// </summary>
        public static void LogUIAutomation(string controlName, bool hasAutomationId, string automationId = null)
        {
            var data = new
            {
                ControlName = controlName,
                HasAutomationId = hasAutomationId,
                AutomationId = automationId
            };

            LogEvent("UI_AUTOMATION", $"Control: {controlName}", data);
        }

        /// <summary>
        /// Registra procesamiento de código MultLang
        /// </summary>
        public static void LogMultLangProcessing(string language, int codeLength, string status)
        {
            var data = new
            {
                Language = language,
                CodeLength = codeLength,
                Status = status
            };

            LogEvent("MULTILANG", $"Processing {language} code", data);
        }

        /// <summary>
        /// Registra navegación WebView2
        /// </summary>
        public static void LogWebViewNavigation(string url, int contentLength)
        {
            var data = new
            {
                URL = url,
                ContentLength = contentLength
            };

            LogEvent("WEBVIEW", "Navigation", data);
        }

        /// <summary>
        /// Guarda el HTML completo del Output para diagnóstico
        /// </summary>
        public static void SaveOutputHtml(string html, string label = "output")
        {
            if (!_isEnabled || string.IsNullOrEmpty(html)) return;

            try
            {
                var tempDir = Path.Combine(Path.GetTempPath(), "Hekatan");
                var timestamp = DateTime.Now.ToString("HHmmss_fff");
                var filename = $"output_html_{label}_{timestamp}.html";
                var filepath = Path.Combine(tempDir, filename);

                File.WriteAllText(filepath, html, Encoding.UTF8);

                LogEvent("OUTPUT_HTML", $"Saved to {filename}", new { Length = html.Length, Path = filepath });
            }
            catch (Exception ex)
            {
                LogError("OUTPUT_HTML", ex, "Failed to save output HTML");
            }
        }

        /// <summary>
        /// Escribe línea directa al log (thread-safe)
        /// </summary>
        private static void WriteToFile(string content)
        {
            try
            {
                lock (_lock)
                {
                    File.AppendAllText(TelemetryFilePath, content, Encoding.UTF8);
                }
            }
            catch
            {
                // No lanzar excepciones de telemetría
            }
        }

        private static string SerializeData(object data)
        {
            try
            {
                if (data == null) return "null";

                var type = data.GetType();
                if (type.IsPrimitive || type == typeof(string))
                    return data.ToString();

                // Serialización simple de propiedades
                var props = type.GetProperties();
                var sb = new StringBuilder("{ ");

                for (int i = 0; i < props.Length; i++)
                {
                    if (i > 0) sb.Append(", ");
                    sb.Append($"{props[i].Name}: {props[i].GetValue(data)}");
                }

                sb.Append(" }");
                return sb.ToString();
            }
            catch
            {
                return data.ToString();
            }
        }

        /// <summary>
        /// Cierra la sesión de telemetría
        /// </summary>
        public static void EndSession()
        {
            var footer = new StringBuilder();
            footer.AppendLine();
            footer.AppendLine("=".PadRight(80, '='));
            footer.AppendLine($"CALCPAD WPF - TELEMETRY SESSION END");
            footer.AppendLine($"Timestamp: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}");
            footer.AppendLine($"Session Duration: {_sessionStopwatch.Elapsed:hh\\:mm\\:ss}");
            footer.AppendLine("=".PadRight(80, '='));

            WriteToFile(footer.ToString());
        }
    }
}
