using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Hekatan.Common.Templates
{
    /// <summary>
    /// Configuration for dynamic HTML template generation
    /// Allows customization of fonts, colors, styles, and template source
    /// </summary>
    public class TemplateConfig
    {
        /// <summary>
        /// Template source: "calcpad" for default, "user" for custom, "file" for external file
        /// </summary>
        [JsonPropertyName("template_source")]
        public string TemplateSource { get; set; } = "calcpad";

        /// <summary>
        /// Path to external template file (if template_source is "file")
        /// </summary>
        [JsonPropertyName("template_file")]
        public string TemplateFile { get; set; } = "";

        /// <summary>
        /// Font configuration
        /// </summary>
        [JsonPropertyName("fonts")]
        public FontConfig Fonts { get; set; } = new FontConfig();

        /// <summary>
        /// Color scheme configuration
        /// </summary>
        [JsonPropertyName("colors")]
        public ColorConfig Colors { get; set; } = new ColorConfig();

        /// <summary>
        /// Style configuration (bold, italic, etc.)
        /// </summary>
        [JsonPropertyName("styles")]
        public StyleConfig Styles { get; set; } = new StyleConfig();

        /// <summary>
        /// Custom CSS to inject into template
        /// </summary>
        [JsonPropertyName("custom_css")]
        public string CustomCss { get; set; } = "";

        /// <summary>
        /// Load configuration from JSON file
        /// </summary>
        public static TemplateConfig LoadFromFile(string path)
        {
            if (!System.IO.File.Exists(path))
                return new TemplateConfig();

            try
            {
                var json = System.IO.File.ReadAllText(path);
                return JsonSerializer.Deserialize<TemplateConfig>(json) ?? new TemplateConfig();
            }
            catch
            {
                return new TemplateConfig();
            }
        }

        /// <summary>
        /// Save configuration to JSON file
        /// </summary>
        public void SaveToFile(string path)
        {
            var options = new JsonSerializerOptions
            {
                WriteIndented = true
            };
            var json = JsonSerializer.Serialize(this, options);
            System.IO.File.WriteAllText(path, json);
        }

        /// <summary>
        /// Get default Hekatan template configuration
        /// </summary>
        public static TemplateConfig GetHekatanDefault()
        {
            return new TemplateConfig
            {
                TemplateSource = "calcpad",
                Fonts = new FontConfig
                {
                    Body = "Segoe UI, Arial, sans-serif",
                    Math = "Cambria Math, Times New Roman, serif",
                    Code = "Consolas, Courier New, monospace",
                    Headings = "Segoe UI Semibold, Arial, sans-serif"
                },
                Colors = new ColorConfig
                {
                    Background = "#ffffff",
                    Text = "#000000",
                    Heading = "#003366",
                    Link = "#0066cc",
                    Variable = "#0000ff",
                    Comment = "#008000",
                    Error = "#ff0000",
                    Border = "#cccccc"
                },
                Styles = new StyleConfig
                {
                    HeadingBold = true,
                    HeadingItalic = false,
                    CommentItalic = true,
                    VariableBold = false
                }
            };
        }

        /// <summary>
        /// Create a dark theme template
        /// </summary>
        public static TemplateConfig GetDarkTheme()
        {
            return new TemplateConfig
            {
                TemplateSource = "user",
                Fonts = new FontConfig
                {
                    Body = "Segoe UI, Arial, sans-serif",
                    Math = "Cambria Math, Times New Roman, serif",
                    Code = "Consolas, Courier New, monospace",
                    Headings = "Segoe UI Semibold, Arial, sans-serif"
                },
                Colors = new ColorConfig
                {
                    Background = "#1e1e1e",
                    Text = "#d4d4d4",
                    Heading = "#4ec9b0",
                    Link = "#569cd6",
                    Variable = "#9cdcfe",
                    Comment = "#6a9955",
                    Error = "#f48771",
                    Border = "#3e3e3e"
                },
                Styles = new StyleConfig
                {
                    HeadingBold = true,
                    HeadingItalic = false,
                    CommentItalic = true,
                    VariableBold = false
                }
            };
        }
    }

    /// <summary>
    /// Font family configuration for different elements
    /// </summary>
    public class FontConfig
    {
        [JsonPropertyName("body")]
        public string Body { get; set; } = "Arial, sans-serif";

        [JsonPropertyName("math")]
        public string Math { get; set; } = "Times New Roman, serif";

        [JsonPropertyName("code")]
        public string Code { get; set; } = "Consolas, monospace";

        [JsonPropertyName("headings")]
        public string Headings { get; set; } = "Arial, sans-serif";

        [JsonPropertyName("size_body")]
        public string SizeBody { get; set; } = "16px";

        [JsonPropertyName("size_math")]
        public string SizeMath { get; set; } = "18px";

        [JsonPropertyName("size_code")]
        public string SizeCode { get; set; } = "14px";

        [JsonPropertyName("size_h1")]
        public string SizeH1 { get; set; } = "2em";

        [JsonPropertyName("size_h2")]
        public string SizeH2 { get; set; } = "1.5em";

        [JsonPropertyName("size_h3")]
        public string SizeH3 { get; set; } = "1.2em";
    }

    /// <summary>
    /// Color scheme configuration
    /// </summary>
    public class ColorConfig
    {
        [JsonPropertyName("background")]
        public string Background { get; set; } = "#ffffff";

        [JsonPropertyName("text")]
        public string Text { get; set; } = "#000000";

        [JsonPropertyName("heading")]
        public string Heading { get; set; } = "#003366";

        [JsonPropertyName("link")]
        public string Link { get; set; } = "#0066cc";

        [JsonPropertyName("variable")]
        public string Variable { get; set; } = "#0000ff";

        [JsonPropertyName("comment")]
        public string Comment { get; set; } = "#008000";

        [JsonPropertyName("error")]
        public string Error { get; set; } = "#ff0000";

        [JsonPropertyName("border")]
        public string Border { get; set; } = "#cccccc";

        [JsonPropertyName("table_header")]
        public string TableHeader { get; set; } = "#e0e0e0";

        [JsonPropertyName("table_border")]
        public string TableBorder { get; set; } = "#cccccc";
    }

    /// <summary>
    /// Style configuration (bold, italic, underline)
    /// </summary>
    public class StyleConfig
    {
        [JsonPropertyName("heading_bold")]
        public bool HeadingBold { get; set; } = true;

        [JsonPropertyName("heading_italic")]
        public bool HeadingItalic { get; set; } = false;

        [JsonPropertyName("comment_italic")]
        public bool CommentItalic { get; set; } = true;

        [JsonPropertyName("comment_bold")]
        public bool CommentBold { get; set; } = false;

        [JsonPropertyName("variable_bold")]
        public bool VariableBold { get; set; } = false;

        [JsonPropertyName("variable_italic")]
        public bool VariableItalic { get; set; } = false;

        [JsonPropertyName("error_bold")]
        public bool ErrorBold { get; set; } = true;

        [JsonPropertyName("error_italic")]
        public bool ErrorItalic { get; set; } = false;
    }
}
