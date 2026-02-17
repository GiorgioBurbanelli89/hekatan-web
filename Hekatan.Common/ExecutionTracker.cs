using System;
using System.Diagnostics;
using System.IO;

namespace Hekatan.Common
{
    /// <summary>
    /// Rastreador de ejecución del código fuente de Hekatan
    /// Reporta qué archivo .cs y línea se está ejecutando
    /// </summary>
    public class ExecutionTracker
    {
        public delegate void ExecutionStepHandler(ExecutionStep step);
        public event ExecutionStepHandler? OnExecutionStep;

        /// <summary>
        /// Reporta un paso de ejecución desde el código fuente
        /// </summary>
        public void ReportStep(string message, int skipFrames = 1)
        {
            if (OnExecutionStep == null)
                return;

            var stackTrace = new StackTrace(skipFrames, true);
            var frame = stackTrace.GetFrame(0);

            if (frame != null)
            {
                var method = frame.GetMethod();
                var fileName = frame.GetFileName();
                var lineNumber = frame.GetFileLineNumber();
                var className = method?.DeclaringType?.Name ?? "Unknown";
                var methodName = method?.Name ?? "Unknown";

                var step = new ExecutionStep
                {
                    Message = message,
                    FileName = fileName ?? "Unknown",
                    LineNumber = lineNumber,
                    ClassName = className,
                    MethodName = methodName,
                    Timestamp = DateTime.Now
                };

                OnExecutionStep.Invoke(step);
            }
        }

        /// <summary>
        /// Reporta entrada a un método
        /// </summary>
        public void EnterMethod(string className, string methodName, string? details = null)
        {
            var message = $"→ {className}.{methodName}";
            if (!string.IsNullOrEmpty(details))
                message += $" ({details})";

            ReportStep(message, skipFrames: 2);
        }

        /// <summary>
        /// Reporta salida de un método
        /// </summary>
        public void ExitMethod(string className, string methodName, string? result = null)
        {
            var message = $"← {className}.{methodName}";
            if (!string.IsNullOrEmpty(result))
                message += $" → {result}";

            ReportStep(message, skipFrames: 2);
        }
    }

    /// <summary>
    /// Información sobre un paso de ejecución
    /// </summary>
    public class ExecutionStep
    {
        public string Message { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public string ClassName { get; set; } = string.Empty;
        public string MethodName { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }

        public string GetShortFileName()
        {
            if (string.IsNullOrEmpty(FileName))
                return "Unknown";
            return Path.GetFileName(FileName);
        }

        public override string ToString()
        {
            return $"[{GetShortFileName()}:{LineNumber}] {ClassName}.{MethodName} - {Message}";
        }
    }
}
