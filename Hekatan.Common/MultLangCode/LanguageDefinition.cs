using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Represents a single language configuration
    /// </summary>
    public class LanguageDefinition
    {
        [JsonPropertyName("command")]
        public string Command { get; set; } = string.Empty;

        [JsonPropertyName("extension")]
        public string Extension { get; set; } = string.Empty;

        [JsonPropertyName("directive")]
        public string Directive { get; set; } = string.Empty;

        [JsonPropertyName("endDirective")]
        public string EndDirective { get; set; } = string.Empty;

        [JsonPropertyName("commentPrefix")]
        public string CommentPrefix { get; set; } = string.Empty;

        [JsonPropertyName("keywords")]
        public string[] Keywords { get; set; } = [];

        [JsonPropertyName("builtins")]
        public string[] Builtins { get; set; } = [];

        [JsonPropertyName("template")]
        public string Template { get; set; } = string.Empty;

        /// <summary>
        /// True if language requires compilation before execution (C++, C, Rust, etc.)
        /// </summary>
        [JsonPropertyName("requiresCompilation")]
        public bool RequiresCompilation { get; set; } = false;

        /// <summary>
        /// Arguments for compilation (e.g., "-o {output}" for g++)
        /// {input} = source file, {output} = executable
        /// </summary>
        [JsonPropertyName("compileArgs")]
        public string CompileArgs { get; set; } = string.Empty;

        /// <summary>
        /// Arguments for execution (for interpreted languages)
        /// {file} = source file
        /// </summary>
        [JsonPropertyName("runArgs")]
        public string RunArgs { get; set; } = "\"{file}\"";

        /// <summary>
        /// True if this is a GUI application that should not block (Qt, GTK, WPF, etc.)
        /// When true, the process is started but not waited on
        /// </summary>
        [JsonPropertyName("isGuiApplication")]
        public bool IsGuiApplication { get; set; } = false;
    }

    /// <summary>
    /// Global settings for MultLangCode
    /// </summary>
    public class MultLangSettings
    {
        [JsonPropertyName("timeout")]
        public int Timeout { get; set; } = 30000;

        [JsonPropertyName("maxOutputLines")]
        public int MaxOutputLines { get; set; } = 1000;

        [JsonPropertyName("tempDirectory")]
        public string TempDirectory { get; set; } = "temp_multilang";

        [JsonPropertyName("shareVariables")]
        public bool ShareVariables { get; set; } = true;
    }

    /// <summary>
    /// Root configuration object for MultLangConfig.json
    /// </summary>
    public class MultLangConfig
    {
        [JsonPropertyName("languages")]
        public Dictionary<string, LanguageDefinition> Languages { get; set; } = new();

        [JsonPropertyName("settings")]
        public MultLangSettings Settings { get; set; } = new();
    }
}
