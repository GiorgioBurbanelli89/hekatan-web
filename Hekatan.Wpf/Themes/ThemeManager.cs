using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Documents;
using System.Windows.Media;
using ICSharpCode.AvalonEdit;

namespace Hekatan.Wpf.Themes
{
    /// <summary>
    /// Manages application themes for Hekatan Calc.
    /// Available themes: HekatanDark, HekatanLight, Classic
    /// </summary>
    public static class ThemeManager
    {
        public enum Theme
        {
            HekatanDark,
            HekatanLight,
            Classic
        }

        private static Theme _currentTheme = Theme.Classic;
        private static Window _mainWindow;
        private static Color? _customPrimaryColor = null;

        /// <summary>
        /// Gets the currently active theme.
        /// </summary>
        public static Theme CurrentTheme => _currentTheme;

        /// <summary>
        /// Gets the current primary color (custom or default).
        /// </summary>
        public static Color GetCurrentPrimaryColor()
        {
            if (_customPrimaryColor.HasValue)
                return _customPrimaryColor.Value;

            return GetThemeColorSet(_currentTheme).Primary;
        }

        /// <summary>
        /// Sets a custom primary color that overrides the theme default.
        /// </summary>
        public static void SetCustomPrimaryColor(Color color)
        {
            _customPrimaryColor = color;
        }

        /// <summary>
        /// Clears the custom primary color, reverting to theme default.
        /// </summary>
        public static void ClearCustomPrimaryColor()
        {
            _customPrimaryColor = null;
        }

        /// <summary>
        /// Event raised when the theme changes.
        /// </summary>
        public static event EventHandler<Theme> ThemeChanged;

        /// <summary>
        /// Theme color definitions
        /// </summary>
        public static class Colors
        {
            // Hekatan Dark Theme - Colores como en la captura
            // Fondo claro + Dorado cálido para títulos
            public static class HekatanDark
            {
                public static Color Background => Color.FromRgb(240, 240, 235);       // #F0F0EB Fondo claro grisáceo
                public static Color BackgroundSecondary => Color.FromRgb(245, 245, 242); // #F5F5F2 Casi blanco
                public static Color BackgroundEditor => Color.FromRgb(255, 255, 255); // #FFFFFF Blanco para editor
                public static Color Foreground => Color.FromRgb(0, 0, 0);             // #000000 Negro para texto
                public static Color ForegroundSecondary => Color.FromRgb(80, 80, 80); // #505050 Gris oscuro
                public static Color Primary => Color.FromRgb(196, 160, 53);           // #C4A035 Dorado cálido (como en imagen)
                public static Color Accent => Color.FromRgb(212, 175, 55);            // #D4AF37 Dorado
                public static Color Border => Color.FromRgb(200, 200, 195);           // #C8C8C3 Borde gris claro
                public static Color MenuBackground => Color.FromRgb(250, 250, 248);   // #FAFAF8 Menú claro
                public static Color ToolbarBackground => Color.FromRgb(245, 245, 242); // #F5F5F2 Toolbar claro
                public static Color StatusBar => Color.FromRgb(235, 235, 230);        // #EBEBE6 StatusBar gris claro
            }

            // Hekatan Light Theme
            public static class HekatanLight
            {
                public static Color Background => Color.FromRgb(250, 250, 248);       // #FAFAF8
                public static Color BackgroundSecondary => Color.FromRgb(245, 244, 242); // #F5F4F2
                public static Color BackgroundEditor => Color.FromRgb(255, 255, 253);  // #FFFFFD
                public static Color Foreground => Color.FromRgb(35, 35, 40);          // #232328
                public static Color ForegroundSecondary => Color.FromRgb(85, 85, 90); // #55555A
                public static Color Primary => Color.FromRgb(184, 150, 12);           // #B8960C Gold
                public static Color Accent => Color.FromRgb(0, 140, 110);             // #008C6E Turquoise
                public static Color Border => Color.FromRgb(210, 208, 200);           // #D2D0C8
                public static Color MenuBackground => Color.FromRgb(255, 255, 253);   // #FFFFFD
                public static Color ToolbarBackground => Color.FromRgb(248, 247, 245); // #F8F7F5
                public static Color StatusBar => Color.FromRgb(242, 240, 235);        // #F2F0EB
            }

            // Classic Theme (Original Hekatan)
            public static class Classic
            {
                public static Color Background => Color.FromRgb(255, 255, 255);       // White
                public static Color BackgroundSecondary => Color.FromRgb(251, 251, 251); // #FBFBFB
                public static Color BackgroundEditor => Color.FromRgb(255, 255, 255);  // White
                public static Color Foreground => Color.FromRgb(0, 0, 0);             // Black
                public static Color ForegroundSecondary => Color.FromRgb(68, 68, 68); // #444444
                public static Color Primary => Color.FromRgb(60, 127, 177);           // #3C7FB1 Blue
                public static Color Accent => Color.FromRgb(123, 104, 238);           // #7B68EE Purple
                public static Color Border => Color.FromRgb(221, 221, 221);           // #DDDDDD
                public static Color MenuBackground => Color.FromRgb(255, 255, 255);   // White
                public static Color ToolbarBackground => Color.FromRgb(251, 251, 251); // #FBFBFB
                public static Color StatusBar => Color.FromRgb(240, 240, 240);        // #F0F0F0
            }
        }

        /// <summary>
        /// Registers the main window for theme application.
        /// </summary>
        public static void RegisterWindow(Window window)
        {
            _mainWindow = window;
        }

        /// <summary>
        /// Applies the specified theme to the application.
        /// </summary>
        public static void ApplyTheme(Theme theme)
        {
            _currentTheme = theme;

            // Apply theme directly to window
            if (_mainWindow != null)
            {
                ApplyThemeToWindow(_mainWindow, theme);
            }

            ThemeChanged?.Invoke(null, theme);
        }

        /// <summary>
        /// Applies the theme colors directly to the window and its children.
        /// </summary>
        private static void ApplyThemeToWindow(Window window, Theme theme)
        {
            var colors = GetThemeColorSet(theme);
            var bgBrush = new SolidColorBrush(colors.Background);
            var bgSecBrush = new SolidColorBrush(colors.BackgroundSecondary);
            var bgEditorBrush = new SolidColorBrush(colors.BackgroundEditor);
            var fgBrush = new SolidColorBrush(colors.Foreground);
            var fgSecBrush = new SolidColorBrush(colors.ForegroundSecondary);
            var primaryBrush = new SolidColorBrush(colors.Primary);
            var borderBrush = new SolidColorBrush(colors.Border);
            var menuBgBrush = new SolidColorBrush(colors.MenuBackground);
            var toolbarBgBrush = new SolidColorBrush(colors.ToolbarBackground);
            var statusBrush = new SolidColorBrush(colors.StatusBar);

            // Apply to window
            window.Background = bgBrush;

            // Main Grid
            if (window.FindName("MainGrid") is Grid mainGrid)
            {
                mainGrid.Background = toolbarBgBrush;
            }

            // Menu - aplicar a todos los items
            if (window.FindName("MainMenu") is Menu mainMenu)
            {
                mainMenu.Background = menuBgBrush;
                // Always use Egyptian Gold for menu text, regardless of theme
                mainMenu.Foreground = new SolidColorBrush(Color.FromRgb(212, 175, 55)); // #D4AF37
                ApplyThemeToMenuItems(mainMenu, colors);
            }

            // Frames Grid
            if (window.FindName("FramesGrid") is Grid framesGrid)
            {
                framesGrid.Background = bgBrush;
            }

            // Input Frame (Code editor container)
            if (window.FindName("InputFrame") is GroupBox inputFrame)
            {
                inputFrame.Background = bgSecBrush;
                inputFrame.Foreground = primaryBrush; // Gold for headers
                inputFrame.BorderBrush = borderBrush;
            }

            // Output Frame
            if (window.FindName("OutputFrame") is GroupBox outputFrame)
            {
                outputFrame.Background = bgSecBrush;
                outputFrame.Foreground = primaryBrush; // Gold for headers
                outputFrame.BorderBrush = borderBrush;
            }

            // Input Grid
            if (window.FindName("InputGrid") is Grid inputGrid)
            {
                inputGrid.Background = bgEditorBrush;
            }

            // RichTextBox (Code editor)
            if (window.FindName("RichTextBox") is RichTextBox richTextBox)
            {
                richTextBox.Background = bgEditorBrush;
                richTextBox.Foreground = fgBrush;
                richTextBox.BorderBrush = borderBrush;
                richTextBox.CaretBrush = fgBrush;

                if (richTextBox.Document != null)
                {
                    richTextBox.Document.Background = bgEditorBrush;
                    richTextBox.Document.Foreground = fgBrush;
                }
            }

            // AvalonEdit TextEditor
            if (window.FindName("TextEditor") is TextEditor textEditor)
            {
                textEditor.Background = bgEditorBrush;
                textEditor.Foreground = fgBrush;
                textEditor.LineNumbersForeground = fgSecBrush;
            }

            // Greek Letters Panel
            if (window.FindName("GreekLettersWarpPanel") is WrapPanel greekPanel)
            {
                greekPanel.Background = toolbarBgBrush;
            }

            // KeyPad Grid
            if (window.FindName("KeyPadGrid") is Grid keyPadGrid)
            {
                keyPadGrid.Background = toolbarBgBrush;
            }

            // Status Bar
            if (window.FindName("Status") is StatusBar statusBar)
            {
                statusBar.Background = statusBrush;
                statusBar.Foreground = fgBrush;
            }

            // Code Check Border
            if (window.FindName("CodeCheckBorder") is Border codeCheckBorder)
            {
                codeCheckBorder.Background = toolbarBgBrush;
                codeCheckBorder.BorderBrush = borderBrush;
            }

            // Apply to all controls in the visual tree
            ApplyThemeToVisualTree(window, colors);
        }

        /// <summary>
        /// Applies theme to menu items recursively.
        /// </summary>
        private static void ApplyThemeToMenuItems(ItemsControl menu, ThemeColorSet colors, bool isTopLevel = true)
        {
            var fgBrush = new SolidColorBrush(colors.Foreground);
            // Always use Egyptian Gold (#D4AF37) for top level menu items, regardless of theme
            var goldBrush = new SolidColorBrush(Color.FromRgb(212, 175, 55)); // #D4AF37 Egyptian Gold
            var bgBrush = new SolidColorBrush(colors.MenuBackground);

            foreach (var item in menu.Items)
            {
                if (item is MenuItem menuItem)
                {
                    // Top level menu items (File, Edit, etc.) get gold color
                    // Submenu items get normal foreground color
                    menuItem.Foreground = isTopLevel ? goldBrush : fgBrush;
                    menuItem.Background = bgBrush;
                    if (menuItem.Items.Count > 0)
                    {
                        ApplyThemeToMenuItems(menuItem, colors, false); // Children are not top level
                    }
                }
            }
        }

        /// <summary>
        /// Applies theme to the visual tree of a control.
        /// </summary>
        private static void ApplyThemeToVisualTree(DependencyObject parent, ThemeColorSet colors)
        {
            var fgBrush = new SolidColorBrush(colors.Foreground);
            var fgSecBrush = new SolidColorBrush(colors.ForegroundSecondary);
            var bgBrush = new SolidColorBrush(colors.Background);
            var bgSecBrush = new SolidColorBrush(colors.BackgroundSecondary);
            var bgEditorBrush = new SolidColorBrush(colors.BackgroundEditor);
            var borderBrush = new SolidColorBrush(colors.Border);
            var primaryBrush = new SolidColorBrush(colors.Primary);
            var toolbarBrush = new SolidColorBrush(colors.ToolbarBackground);
            var statusBrush = new SolidColorBrush(colors.StatusBar);

            int childCount = VisualTreeHelper.GetChildrenCount(parent);
            for (int i = 0; i < childCount; i++)
            {
                var child = VisualTreeHelper.GetChild(parent, i);

                switch (child)
                {
                    case Menu menu:
                        // Skip menu - it's handled separately by ApplyThemeToMenuItems
                        continue;

                    case MenuItem menuItem:
                        // Skip menu items - they're handled by ApplyThemeToMenuItems
                        continue;

                    case GroupBox groupBox:
                        groupBox.Foreground = primaryBrush;
                        groupBox.BorderBrush = borderBrush;
                        groupBox.Background = bgSecBrush;
                        break;

                    case Label label:
                        label.Foreground = fgBrush;
                        break;

                    case TextBlock textBlock:
                        // Skip textblocks inside menus (they're handled separately)
                        if (IsInsideMenu(textBlock))
                            continue;
                        textBlock.Foreground = fgBrush;
                        break;

                    case CheckBox checkBox:
                        checkBox.Foreground = fgBrush;
                        break;

                    case RadioButton radioButton:
                        radioButton.Foreground = fgBrush;
                        break;

                    case ComboBox comboBox:
                        comboBox.Foreground = fgBrush;
                        comboBox.Background = bgSecBrush;
                        comboBox.BorderBrush = borderBrush;
                        break;

                    case TextBox textBox:
                        textBox.Background = bgEditorBrush;
                        textBox.Foreground = fgBrush;
                        textBox.BorderBrush = borderBrush;
                        textBox.CaretBrush = fgBrush;
                        break;

                    case Button button:
                        button.Foreground = fgBrush;
                        button.Background = toolbarBrush;
                        button.BorderBrush = borderBrush;
                        break;

                    case ToolBar toolBar:
                        toolBar.Background = toolbarBrush;
                        toolBar.Foreground = fgBrush;
                        break;

                    case StatusBar statusBar:
                        statusBar.Background = statusBrush;
                        statusBar.Foreground = fgBrush;
                        break;

                    case StatusBarItem statusBarItem:
                        statusBarItem.Foreground = fgBrush;
                        break;

                    case Border border when border.Name != "ButtonBorder":
                        // Don't override button borders
                        border.BorderBrush = borderBrush;
                        break;

                    case Grid grid when string.IsNullOrEmpty(grid.Name):
                        // Only set background for unnamed grids
                        grid.Background = bgBrush;
                        break;

                    case ScrollViewer scrollViewer:
                        scrollViewer.Background = bgBrush;
                        break;

                    case TabControl tabControl:
                        tabControl.Background = bgSecBrush;
                        tabControl.Foreground = fgBrush;
                        tabControl.BorderBrush = borderBrush;
                        break;

                    case TabItem tabItem:
                        tabItem.Foreground = fgBrush;
                        tabItem.Background = bgSecBrush;
                        break;

                    case Expander expander:
                        expander.Foreground = primaryBrush;
                        expander.Background = bgSecBrush;
                        expander.BorderBrush = borderBrush;
                        break;

                    case Separator separator:
                        separator.Background = borderBrush;
                        break;

                    case ListView listView:
                        listView.Background = bgEditorBrush;
                        listView.Foreground = fgBrush;
                        listView.BorderBrush = borderBrush;
                        break;

                    case ListBox listBox:
                        listBox.Background = bgEditorBrush;
                        listBox.Foreground = fgBrush;
                        listBox.BorderBrush = borderBrush;
                        break;
                }

                // Recurse into children
                ApplyThemeToVisualTree(child, colors);
            }
        }

        /// <summary>
        /// Checks if a control is inside a Menu or MenuItem.
        /// </summary>
        private static bool IsInsideMenu(DependencyObject element)
        {
            DependencyObject parent = VisualTreeHelper.GetParent(element);
            while (parent != null)
            {
                if (parent is Menu || parent is MenuItem)
                    return true;
                parent = VisualTreeHelper.GetParent(parent);
            }
            return false;
        }

        /// <summary>
        /// Gets the color set for a theme.
        /// </summary>
        private static ThemeColorSet GetThemeColorSet(Theme theme)
        {
            var colorSet = theme switch
            {
                Theme.HekatanDark => new ThemeColorSet
                {
                    Background = Colors.HekatanDark.Background,
                    BackgroundSecondary = Colors.HekatanDark.BackgroundSecondary,
                    BackgroundEditor = Colors.HekatanDark.BackgroundEditor,
                    Foreground = Colors.HekatanDark.Foreground,
                    ForegroundSecondary = Colors.HekatanDark.ForegroundSecondary,
                    Primary = Colors.HekatanDark.Primary,
                    Accent = Colors.HekatanDark.Accent,
                    Border = Colors.HekatanDark.Border,
                    MenuBackground = Colors.HekatanDark.MenuBackground,
                    ToolbarBackground = Colors.HekatanDark.ToolbarBackground,
                    StatusBar = Colors.HekatanDark.StatusBar
                },
                Theme.HekatanLight => new ThemeColorSet
                {
                    Background = Colors.HekatanLight.Background,
                    BackgroundSecondary = Colors.HekatanLight.BackgroundSecondary,
                    BackgroundEditor = Colors.HekatanLight.BackgroundEditor,
                    Foreground = Colors.HekatanLight.Foreground,
                    ForegroundSecondary = Colors.HekatanLight.ForegroundSecondary,
                    Primary = Colors.HekatanLight.Primary,
                    Accent = Colors.HekatanLight.Accent,
                    Border = Colors.HekatanLight.Border,
                    MenuBackground = Colors.HekatanLight.MenuBackground,
                    ToolbarBackground = Colors.HekatanLight.ToolbarBackground,
                    StatusBar = Colors.HekatanLight.StatusBar
                },
                _ => new ThemeColorSet
                {
                    Background = Colors.Classic.Background,
                    BackgroundSecondary = Colors.Classic.BackgroundSecondary,
                    BackgroundEditor = Colors.Classic.BackgroundEditor,
                    Foreground = Colors.Classic.Foreground,
                    ForegroundSecondary = Colors.Classic.ForegroundSecondary,
                    Primary = Colors.Classic.Primary,
                    Accent = Colors.Classic.Accent,
                    Border = Colors.Classic.Border,
                    MenuBackground = Colors.Classic.MenuBackground,
                    ToolbarBackground = Colors.Classic.ToolbarBackground,
                    StatusBar = Colors.Classic.StatusBar
                }
            };

            // Apply custom primary color if set
            if (_customPrimaryColor.HasValue)
            {
                colorSet.Primary = _customPrimaryColor.Value;
            }

            return colorSet;
        }

        /// <summary>
        /// Color set for a theme
        /// </summary>
        private class ThemeColorSet
        {
            public Color Background { get; set; }
            public Color BackgroundSecondary { get; set; }
            public Color BackgroundEditor { get; set; }
            public Color Foreground { get; set; }
            public Color ForegroundSecondary { get; set; }
            public Color Primary { get; set; }
            public Color Accent { get; set; }
            public Color Border { get; set; }
            public Color MenuBackground { get; set; }
            public Color ToolbarBackground { get; set; }
            public Color StatusBar { get; set; }
        }

        /// <summary>
        /// Gets the display name for a theme.
        /// </summary>
        public static string GetThemeDisplayName(Theme theme)
        {
            return theme switch
            {
                Theme.HekatanDark => "Hekatan Dark (Egyptian Gold)",
                Theme.HekatanLight => "Hekatan Light (Gold Accent)",
                Theme.Classic => "Classic (Original Hekatan)",
                _ => theme.ToString()
            };
        }

        /// <summary>
        /// Cycles to the next available theme.
        /// </summary>
        public static void CycleTheme()
        {
            var nextTheme = _currentTheme switch
            {
                Theme.HekatanDark => Theme.HekatanLight,
                Theme.HekatanLight => Theme.Classic,
                Theme.Classic => Theme.HekatanDark,
                _ => Theme.HekatanDark
            };

            ApplyTheme(nextTheme);
        }

        /// <summary>
        /// Initializes the theme system with the default or saved theme.
        /// </summary>
        public static void Initialize()
        {
            // Try to load saved theme preference from user settings file
            try
            {
                var settingsPath = GetThemeSettingsPath();
                if (System.IO.File.Exists(settingsPath))
                {
                    var lines = System.IO.File.ReadAllLines(settingsPath);
                    if (lines.Length > 0 && Enum.TryParse<Theme>(lines[0].Trim(), out var theme))
                    {
                        // Load custom color if present
                        if (lines.Length > 1 && lines[1].StartsWith("#") && lines[1].Length == 7)
                        {
                            var hex = lines[1].Trim();
                            var r = Convert.ToByte(hex.Substring(1, 2), 16);
                            var g = Convert.ToByte(hex.Substring(3, 2), 16);
                            var b = Convert.ToByte(hex.Substring(5, 2), 16);
                            _customPrimaryColor = Color.FromRgb(r, g, b);
                        }

                        ApplyTheme(theme);
                        return;
                    }
                }
            }
            catch
            {
                // Settings not available, use default
            }

            // Default to Classic theme for familiarity
            ApplyTheme(Theme.Classic);
        }

        /// <summary>
        /// Saves the current theme preference and custom color.
        /// </summary>
        public static void SaveThemePreference()
        {
            try
            {
                var settingsPath = GetThemeSettingsPath();
                var dir = System.IO.Path.GetDirectoryName(settingsPath);
                if (!string.IsNullOrEmpty(dir) && !System.IO.Directory.Exists(dir))
                {
                    System.IO.Directory.CreateDirectory(dir);
                }

                // Save theme and optional custom color
                var content = _currentTheme.ToString();
                if (_customPrimaryColor.HasValue)
                {
                    var c = _customPrimaryColor.Value;
                    content += $"\n#{c.R:X2}{c.G:X2}{c.B:X2}";
                }
                System.IO.File.WriteAllText(settingsPath, content);
            }
            catch
            {
                // Ignore save errors
            }
        }

        /// <summary>
        /// Gets the path to the theme settings file.
        /// </summary>
        private static string GetThemeSettingsPath()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return System.IO.Path.Combine(appData, "HekatanCalc", "theme.txt");
        }

        /// <summary>
        /// Gets the current theme's background color for HTML/WebView content.
        /// </summary>
        public static string GetHtmlBackgroundColor()
        {
            var colors = GetThemeColorSet(_currentTheme);
            return $"#{colors.Background.R:X2}{colors.Background.G:X2}{colors.Background.B:X2}";
        }

        /// <summary>
        /// Gets the current theme's foreground color for HTML/WebView content.
        /// </summary>
        public static string GetHtmlForegroundColor()
        {
            var colors = GetThemeColorSet(_currentTheme);
            return $"#{colors.Foreground.R:X2}{colors.Foreground.G:X2}{colors.Foreground.B:X2}";
        }

        /// <summary>
        /// Gets CSS for the current theme to inject into WebView content.
        /// </summary>
        public static string GetThemeCss()
        {
            var colors = GetThemeColorSet(_currentTheme);
            var bg = $"#{colors.Background.R:X2}{colors.Background.G:X2}{colors.Background.B:X2}";
            var fg = $"#{colors.Foreground.R:X2}{colors.Foreground.G:X2}{colors.Foreground.B:X2}";
            var primary = $"#{colors.Primary.R:X2}{colors.Primary.G:X2}{colors.Primary.B:X2}";
            var accent = $"#{colors.Accent.R:X2}{colors.Accent.G:X2}{colors.Accent.B:X2}";
            var border = $"#{colors.Border.R:X2}{colors.Border.G:X2}{colors.Border.B:X2}";

            return $@"
                body {{
                    background-color: {bg} !important;
                    color: {fg} !important;
                }}
                a {{ color: {accent} !important; }}
                h1, h2, h3, h4, h5, h6 {{ color: {primary} !important; }}
                table {{ border-color: {border} !important; }}
                th, td {{ border-color: {border} !important; }}
            ";
        }
    }
}
