using Hekatan.Core;
using Hekatan.Common;
using Hekatan.Common.MultLangCode;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Xml.Serialization;

namespace Hekatan.Cli
{
    class Program
    {   
        private static readonly string _currentCultureName = "en"; //en, bg or zh
        private static readonly char _dirSeparator = Path.DirectorySeparatorChar;
        const string Prompt = " |> ";
        private static int _width;

        internal static readonly string AppPath = AppContext.BaseDirectory;
        struct Line
        {
            private static readonly char[] GreekLetters = ['α', 'β', 'χ', 'δ', 'ε', 'φ', 'γ', 'η', 'ι', 'ø', 'κ', 'λ', 'μ', 'ν', 'ο', 'π', 'θ', 'ρ', 'σ', 'τ', 'υ', 'ϑ', 'ω', 'ξ', 'ψ', 'ζ'];
            private readonly StringBuilder _sb = new(80);
            public string Input, Output;
            public Line(string Input)
            {
                this.Input = LatinToGreek(Input);
                Output = string.Empty;
            }

            private string LatinToGreek(string input)
            { 
                var i = input.IndexOf('`');
                if (i == -1)
                    return input;

                _sb.Clear();
                var n = 0;
                while (i >= 0) 
                {
                    if (i > 0)
                        _sb.Append(input[n..i]);

                    n = i + 1;                    
                    _sb.Append(LatinToGreekChar(input[n]));
                    i = input.IndexOf('`', n);
                    ++n;
                }
                if (n < input.Length)
                    _sb.Append(input[n..]);

                return _sb.ToString();
            }
            private static char LatinToGreekChar(char c) => c switch
            {
                >= 'a' and <= 'z' => GreekLetters[c - 'a'],
                'V' => '∡',
                'J' => 'Ø',
                >= 'A' and <= 'Z' => (char) (GreekLetters[c - 'A'] + 'Α' - 'α'),
                '@' => '°',
                '\'' => '′',
                '"' => '″',
                _ => c
            };
        }

        static void Main()
        {
            Thread.CurrentThread.CurrentUICulture = new CultureInfo(_currentCultureName);
            try
            {
                _width = Math.Min(Math.Min(Console.WindowWidth, Console.BufferWidth), 85);
            }
            catch 
            { 
                _width = 85; 
            }
            Settings settings = GetSettings();
            if (TryConvertOnStartup(settings))
                return;
            
            MathParser mp = new(settings.Math);
            
            if (OperatingSystem.IsWindows())
            {
                Console.OutputEncoding = Encoding.Unicode;
                Console.InputEncoding = Encoding.Unicode;  
            }
            else
            {
                Console.OutputEncoding = Encoding.UTF8;
                Console.InputEncoding = Encoding.UTF8;  
            }
            
            //Console.WindowWidth = 85;
            List<Line> Lines = [];
            var Title = TryOpenOnStartup(Lines);

            Header(Title, settings.Math.Degrees);
            if (Title.Length > 0)
                Render(mp, Lines, true);

            while (true)
            {
                var LineNo = (Lines.Count + 1).ToString().PadLeft(3) + Prompt;
                Console.ForegroundColor = ConsoleColor.Green;
                Console.Write(LineNo);
                Console.ResetColor();
                var s = Console.ReadLine();
                if (s.Length == 0)
                {
                    Header(Title, settings.Math.Degrees);
                    Render(mp, Lines, true);
                }
                else
                {
                    string sCaps = s.ToUpper().Trim();
                    switch (sCaps)
                    {
                        case "NEW":
                            Title = string.Empty;
                            mp = new(settings.Math);
                            Lines.Clear();
                            Header(Title, settings.Math.Degrees);
                            break;
                        case "OPEN":
                            Console.SetCursorPosition(0, Console.CursorTop - 1);
                            var t = Open(LineNo, Lines);
                            if (!string.IsNullOrEmpty(t))
                            {
                                Title = t;
                                mp = new(settings.Math);
                                Header(Title, settings.Math.Degrees);
                                Render(mp, Lines, true);
                            }
                            break;
                        case "SAVE":
                            Title = Save(Title, LineNo, Lines);
                            Header(Title, settings.Math.Degrees);
                            Render(mp, Lines, false);
                            break;
                        case "EXIT":
                            return;
                        case "CLS":
                        case "DEL":
                        case "RESET":
                            Header(Title, settings.Math.Degrees);
                            if (sCaps == "DEL" && Lines.Count > 0)
                                Lines.RemoveAt(Lines.Count - 1);

                            if (sCaps != "CLS")
                                Render(mp, Lines, sCaps == "RESET");

                            break;
                        case "LIST":
                            List(LineNo);
                            break;
                        case "DEG":
                        case "RAD":
                        case "GRA":
                            settings.Math.Degrees = sCaps == "DEG" ? 0: sCaps == "RAD" ? 1 : 2;
                            mp.Degrees = settings.Math.Degrees;
                            Header(Title, settings.Math.Degrees);
                            Render(mp, Lines, true);
                            break;
                        case "SETTINGS":
                        case "OPTIONS":
                            if (OperatingSystem.IsWindows())
                            {
                                if (Execute("NOTEPAD", AppPath + "Settings.xml"))
                                {
                                    settings = GetSettings();
                                    mp = new(settings.Math);
                                    Header(Title, settings.Math.Degrees);
                                    Render(mp, Lines, true);
                                }
                            }
                            else
                            {
                                var settingsPath = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments) +
                                                   $"{_dirSeparator}.config{_dirSeparator}calcpad{_dirSeparator}Settings.xml";
                                File.SetUnixFileMode(settingsPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                                Execute("/bin/bash", $"-c \"nano {settingsPath}\"");
                                Console.Write(Messages.Press_Any_Key_When_Ready);
                                Console.ReadKey();
                                settings = GetSettings();
                                mp = new(settings.Math);
                                Header(Title, settings.Math.Degrees);
                                Render(mp, Lines, true);
                            }
                            break;
                        case "LICENSE":
                        case "HELP":
                            var fileName = $"{AppPath}doc{_dirSeparator}{sCaps}{AddCultureExt("TXT")}";
                            if (!File.Exists(fileName))
                                fileName = $"{AppPath}doc{_dirSeparator}{sCaps}.TXT";

                            RenderFile(fileName);
                            break;
                        default:
                            Console.SetCursorPosition(0, Console.CursorTop - 1);
                            Line L = new(s);
                            if (Calculate(mp, LineNo, ref L))
                                Lines.Add(L);

                            break;
                    }
                }
            }
        }

        internal static string AddCultureExt(string ext) => string.Equals(_currentCultureName, "en", StringComparison.Ordinal) ?
                $".{ext}" :
                $".{_currentCultureName}.{ext}";

        static Settings GetSettings()
        {
                Settings settings = new(); 
                settings.Math.Decimals = 6;
                XmlSerializer writer = new(settings.GetType());
                var path = OperatingSystem.IsWindows() ?
                    AppPath:
                    Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments) + $"{_dirSeparator}.config{_dirSeparator}calcpad{_dirSeparator}";

                var fileName = path + "Settings.xml";
                FileStream fileStream = null;
                try
                {
                    if (Path.Exists(fileName))
                    {
                        fileStream = File.OpenRead(fileName);
                        settings = (Settings)writer.Deserialize(fileStream);
                    }
                    else if(Path.Exists(path))
                    {
                        fileStream = File.Create(fileName);
                        writer.Serialize(fileStream, settings);
                    }
                }
            catch (Exception ex)
            {
                fileStream?.Close();
                var key = WriteErrorAndWait(ex.Message, Messages.WouldYouLikeToRestoreThePreviousSettingsYN);
                if (key.Key == ConsoleKey.Y)
                    TryRestoreSettings(settings, writer, path);
            }
            finally
            {
                fileStream?.Close();
            }
            return settings;
        }

        private static void TryRestoreSettings(Settings settings, XmlSerializer writer, string path)
        {
            try
            {
                if (Path.Exists(path))
                {
                    FileStream file = File.OpenWrite(path);
                    writer.Serialize(file, settings);
                    file.Close();
                    Console.WriteLine();
                }
            }
            catch (Exception ex)
            {
                WriteErrorAndWait(ex.Message);
            }
        }

        static void RenderFile(string path)
        {
            try
            {
                Console.Write(File.ReadAllText(path));
            }
            catch (Exception e)
            {
                Console.WriteLine(e.Message);    
            }
            Console.WriteLine();
        }

        static bool TryConvertOnStartup(Settings settings)
        {
            var args = Environment.GetCommandLineArgs();
            var n = args.Length;
            if (n <= 1)
                return false;

            var fileName = string.Join(" ", args, 1, n - 1).Trim();
            if (string.IsNullOrWhiteSpace(fileName))
                return false;

            if (OperatingSystem.IsWindows())
                fileName = fileName.ToLower();

            // Check for .mcdx (Mathcad Prime) files first
            var i = fileName.IndexOf(".mcdx");
            bool isMcdx = i >= 0;
            bool isSMath = false;
            bool isXlsx = false;
            bool isDocx = false;

            if (!isMcdx)
            {
                // Check for .xlsx (Excel) files
                i = fileName.IndexOf(".xlsx");
                isXlsx = i >= 0;
            }

            if (!isMcdx && !isXlsx)
            {
                // Check for .docx (Word) files
                i = fileName.IndexOf(".docx");
                isDocx = i >= 0;
            }

            if (!isMcdx && !isXlsx && !isDocx)
            {
                // Check for .sm (SMath Studio) files
                i = fileName.IndexOf(".sm");
                isSMath = i >= 0 && (i + 3 == fileName.Length || fileName[i + 3] == ' ');
            }

            if (!isMcdx && !isSMath && !isXlsx && !isDocx)
            {
                i = fileName.IndexOf(".hcalc");
                if (i < 0)
                    i = fileName.IndexOf(".cpd");
                if (i < 0)
                {
                    i = fileName.IndexOf(".txt");
                    if (i < 0)
                    {
                        if (fileName.IndexOf(".cpc") < 0)
                        {
                            WriteErrorAndWait(Messages.InvalidInputFileExtensionMustBeCpdOrTxt + ": " + fileName);
                            return true;
                        }
                        else
                            return false;
                    }
                }
            }
            // Calculate extension length: .hcalc=6, .cpd=4, .txt=4, .cpc=4
            var extLen = fileName[i..].StartsWith(".hcalc") ? 6 : 4;
            i += isMcdx ? 5 : (isXlsx ? 5 : (isDocx ? 5 : (isSMath ? 3 : extLen)));
            var outFile = fileName[i..].Trim();

            // Detectar flag -s (silent mode)
            var isSilent = outFile.EndsWith(" -s");
            if (isSilent)
                outFile = outFile[..^3];

            // Detectar flag -t (template personalizado)
            string customTemplate = null;
            var templateIndex = outFile.IndexOf(" -t ", StringComparison.OrdinalIgnoreCase);
            if (templateIndex < 0)
                templateIndex = outFile.IndexOf(" -t", StringComparison.OrdinalIgnoreCase);

            if (templateIndex >= 0)
            {
                var afterTemplate = outFile[(templateIndex + 3)..].Trim();
                var spaceIdx = afterTemplate.IndexOf(' ');
                customTemplate = spaceIdx > 0 ? afterTemplate[..spaceIdx] : afterTemplate;
                outFile = outFile[..templateIndex].Trim() + (spaceIdx > 0 ? " " + afterTemplate[(spaceIdx + 1)..].Trim() : "");
                outFile = outFile.Trim();
            }

            // Check for -cpd option (convert mcdx to cpd only, no processing)
            var cpdOnly = outFile.EndsWith(" -cpd") || outFile.EndsWith(" cpd") ||
                          outFile == "-cpd" || outFile == "cpd";
            if (cpdOnly)
            {
                if (outFile.EndsWith(" -cpd"))
                    outFile = outFile[..^5];
                else if (outFile.EndsWith(" cpd"))
                    outFile = outFile[..^4];
                else
                    outFile = "";
            }

            // Check for --sheet option (for xlsx files)
            string selectedSheet = null;
            var sheetIndex = outFile.IndexOf("--sheet ", StringComparison.OrdinalIgnoreCase);
            if (sheetIndex >= 0)
            {
                var afterSheet = outFile[(sheetIndex + 8)..].Trim();
                // Extract sheet name (might be quoted)
                if (afterSheet.StartsWith("\""))
                {
                    var endQuote = afterSheet.IndexOf('"', 1);
                    if (endQuote > 0)
                    {
                        selectedSheet = afterSheet[1..endQuote];
                        outFile = outFile[..sheetIndex].Trim() + " " + afterSheet[(endQuote + 1)..].Trim();
                    }
                }
                else
                {
                    var spaceIdx = afterSheet.IndexOf(' ');
                    selectedSheet = spaceIdx > 0 ? afterSheet[..spaceIdx] : afterSheet;
                    outFile = outFile[..sheetIndex].Trim() + (spaceIdx > 0 ? " " + afterSheet[(spaceIdx + 1)..].Trim() : "");
                }
                outFile = outFile.Trim();
            }

            fileName = fileName[..i].Trim();
            if (!File.Exists(fileName))
            {
                WriteErrorAndWait(Messages.InputFileDoesNotExist);
                return true;
            }

            // Handle -cpd option for mcdx/sm/xlsx/docx files (convert without processing)
            if ((isMcdx || isSMath || isXlsx || isDocx) && cpdOnly)
            {
                if (string.IsNullOrWhiteSpace(outFile))
                    outFile = Path.ChangeExtension(fileName, ".hcalc");

                if (isMcdx)
                {
                    if (!isSilent)
                        Console.WriteLine($"Converting Mathcad Prime to Hekatan: {Path.GetFileName(fileName)}");

                    var mcdxConverter = new McdxConverter();
                    var convertedCode = mcdxConverter.Convert(fileName);
                    File.WriteAllText(outFile, convertedCode);

                    if (!isSilent)
                    {
                        Console.WriteLine($"  Mathcad version: {mcdxConverter.MathcadVersion}");
                        if (mcdxConverter.Warnings.Count > 0)
                        {
                            Console.WriteLine($"  Warnings ({mcdxConverter.Warnings.Count}):");
                            foreach (var warning in mcdxConverter.Warnings)
                                Console.WriteLine($"    - {warning}");
                        }
                        Console.WriteLine($"Output: {outFile}");
                    }
                }
                else if (isXlsx)
                {
                    if (!isSilent)
                    {
                        Console.WriteLine($"Converting Excel to Hekatan: {Path.GetFileName(fileName)}");
                        if (!string.IsNullOrEmpty(selectedSheet))
                            Console.WriteLine($"  Selected sheet: {selectedSheet}");
                    }

                    var xlsxConverter = new XlsxConverter();
                    var convertedCode = xlsxConverter.Convert(fileName, selectedSheet);
                    File.WriteAllText(outFile, convertedCode);

                    if (!isSilent)
                    {
                        Console.WriteLine($"  Excel version: {xlsxConverter.ExcelVersion}");
                        Console.WriteLine($"  Sheets: {string.Join(", ", xlsxConverter.SheetNames.Values)}");
                        if (xlsxConverter.Warnings.Count > 0)
                        {
                            Console.WriteLine($"  Warnings ({xlsxConverter.Warnings.Count}):");
                            foreach (var warning in xlsxConverter.Warnings)
                                Console.WriteLine($"    - {warning}");
                        }
                        Console.WriteLine($"Output: {outFile}");
                    }
                }
                else if (isDocx)
                {
                    if (!isSilent)
                        Console.WriteLine($"Converting Word to Hekatan: {Path.GetFileName(fileName)}");

                    var docxConverter = new DocxConverter();
                    var convertedCode = docxConverter.Convert(fileName);
                    File.WriteAllText(outFile, convertedCode);

                    if (!isSilent)
                    {
                        Console.WriteLine($"  Word version: {docxConverter.WordVersion}");
                        if (docxConverter.Warnings.Count > 0)
                        {
                            Console.WriteLine($"  Warnings ({docxConverter.Warnings.Count}):");
                            foreach (var warning in docxConverter.Warnings)
                                Console.WriteLine($"    - {warning}");
                        }
                        Console.WriteLine($"Output: {outFile}");
                    }
                }
                else // isSMath
                {
                    if (!isSilent)
                        Console.WriteLine($"Converting SMath Studio to Hekatan: {Path.GetFileName(fileName)}");

                    var smathConverter = new SMathConverter();
                    var convertedCode = smathConverter.Convert(fileName);
                    File.WriteAllText(outFile, convertedCode);

                    if (!isSilent)
                    {
                        Console.WriteLine($"  SMath version: {smathConverter.SMathVersion}");
                        if (smathConverter.Warnings.Count > 0)
                        {
                            Console.WriteLine($"  Warnings ({smathConverter.Warnings.Count}):");
                            foreach (var warning in smathConverter.Warnings)
                                Console.WriteLine($"    - {warning}");
                        }
                        Console.WriteLine($"Output: {outFile}");
                    }
                }
                return true;
            }

            if (string.IsNullOrWhiteSpace(outFile))
                outFile = Path.ChangeExtension(fileName, ".html");
            else if (Directory.Exists(outFile))
                outFile += Path.GetFileNameWithoutExtension(fileName) + ".html";
            else if (string.Equals(outFile, "html") ||
                     string.Equals(outFile, "htm") ||
                     string.Equals(outFile, "docx") ||
                     string.Equals(outFile, "pdf"))
                outFile = Path.ChangeExtension(fileName, "." + outFile);

            var ext = Path.GetExtension(outFile);
            try
            {
                var path = Path.GetDirectoryName(fileName);
                if (!string.IsNullOrWhiteSpace(path))
                    Directory.SetCurrentDirectory(path);

                string code;

                // Handle .mcdx files (Mathcad Prime)
                if (isMcdx)
                {
                    if (!isSilent)
                        Console.WriteLine($"Converting Mathcad Prime file: {Path.GetFileName(fileName)}");

                    var mcdxConverter = new McdxConverter();
                    code = mcdxConverter.Convert(fileName);

                    if (!isSilent)
                    {
                        Console.WriteLine($"  Mathcad version: {mcdxConverter.MathcadVersion}");
                        if (mcdxConverter.Warnings.Count > 0)
                        {
                            Console.WriteLine($"  Warnings ({mcdxConverter.Warnings.Count}):");
                            foreach (var warning in mcdxConverter.Warnings)
                                Console.WriteLine($"    - {warning}");
                        }
                        Console.WriteLine();
                    }
                }
                // Handle .xlsx files (Excel)
                else if (isXlsx)
                {
                    if (!isSilent)
                    {
                        Console.WriteLine($"Converting Excel file: {Path.GetFileName(fileName)}");
                        if (!string.IsNullOrEmpty(selectedSheet))
                            Console.WriteLine($"  Selected sheet: {selectedSheet}");
                    }

                    var xlsxConverter = new XlsxConverter();
                    code = xlsxConverter.Convert(fileName, selectedSheet);

                    if (!isSilent)
                    {
                        Console.WriteLine($"  Excel version: {xlsxConverter.ExcelVersion}");
                        Console.WriteLine($"  Sheets: {string.Join(", ", xlsxConverter.SheetNames.Values)}");
                        if (xlsxConverter.Warnings.Count > 0)
                        {
                            Console.WriteLine($"  Warnings ({xlsxConverter.Warnings.Count}):");
                            foreach (var warning in xlsxConverter.Warnings)
                                Console.WriteLine($"    - {warning}");
                        }
                        Console.WriteLine();
                    }
                }
                // Handle .docx files (Word)
                else if (isDocx)
                {
                    if (!isSilent)
                        Console.WriteLine($"Converting Word file: {Path.GetFileName(fileName)}");

                    var docxConverter = new DocxConverter();
                    code = docxConverter.Convert(fileName);

                    if (!isSilent)
                    {
                        Console.WriteLine($"  Word version: {docxConverter.WordVersion}");
                        if (docxConverter.Warnings.Count > 0)
                        {
                            Console.WriteLine($"  Warnings ({docxConverter.Warnings.Count}):");
                            foreach (var warning in docxConverter.Warnings)
                                Console.WriteLine($"    - {warning}");
                        }
                        Console.WriteLine();
                    }
                }
                // Handle .sm files (SMath Studio)
                else if (isSMath)
                {
                    if (!isSilent)
                        Console.WriteLine($"Converting SMath Studio file: {Path.GetFileName(fileName)}");

                    var smathConverter = new SMathConverter();
                    code = smathConverter.Convert(fileName);

                    if (!isSilent)
                    {
                        Console.WriteLine($"  SMath version: {smathConverter.SMathVersion}");
                        if (smathConverter.Warnings.Count > 0)
                        {
                            Console.WriteLine($"  Warnings ({smathConverter.Warnings.Count}):");
                            foreach (var warning in smathConverter.Warnings)
                                Console.WriteLine($"    - {warning}");
                        }
                        Console.WriteLine();
                    }
                }
                else
                {
                    code = HekatanReader.Read(fileName);
                }

                // Process through HekatanProcessor (reads MultLangConfig.json automatically)
                var processor = new HekatanProcessor(HekatanReader.Include);
                var result = processor.ProcessCode(code, addLineNumbers: true);

                if (!result.Success)
                {
                    Console.WriteLine($"Processing error: {result.ErrorMessage}");
                    return true;
                }

                Converter converter = new(isSilent, customTemplate);

                // Use centralized HekatanOutputProcessor for the decision tree
                // (MultilangProcessed? → inline markers → ExpressionParser)
                // Shared parser instance for inline execution so variables persist across markers
                var sharedInlineParser = new ExpressionParser() { Settings = settings };
                var outputResult = HekatanOutputProcessor.Process(
                    result,
                    // Inline executor: reuses shared parser so variables persist between calls
                    inlineExecutor: calcpadCode =>
                    {
                        sharedInlineParser.Parse(calcpadCode, true, false);
                        return sharedInlineParser.HtmlResult;
                    },
                    // Full parser: normal Hekatan flow
                    fullParser: processedCode =>
                    {
                        var parser = new ExpressionParser() { Settings = settings };
                        parser.Parse(processedCode, true, ext == ".docx");
                        return (parser.HtmlResult, parser.OpenXmlExpressions);
                    }
                );

                var htmlResult = outputResult.HtmlContent;
                var openXmlExpressions = outputResult.OpenXmlExpressions;

                if (outputResult.HasMacroErrors)
                {
                    converter.ToHtml(htmlResult, outFile);
                    return true;
                }
                if (ext == ".html" || ext == ".htm")
                {
                    converter.ToHtml(htmlResult, outFile);

                    // Auto-open with HTTP server if contains IFC
                    if (!isSilent && ContainsIFC(htmlResult))
                    {
                        OpenHtmlWithHttpServer(outFile);
                    }
                }
                else if (ext == ".docx")
                    converter.ToOpenXml(htmlResult, outFile, openXmlExpressions);
                else if (ext == ".pdf")
                    converter.ToPdf(htmlResult, outFile);
                else
                    WriteErrorAndWait(Messages.InvalidOutputExtensionMustBeHtmlDocxOrPdf);

                return true;
            }
            catch (Exception ex) 
            {
                WriteErrorAndWait(ex.Message);
                return true;
            }
        }

        private static ConsoleKeyInfo WriteErrorAndWait(string message, string prompt = null)
        {
            WriteError(message, true);
            prompt ??= Messages.PressAnyKeyToContinue;
            Console.WriteLine(prompt);
            return Console.ReadKey();
        }

        static string TryOpenOnStartup(List<Line> Lines)
        {
            var args = Environment.GetCommandLineArgs();
            var n = args.Length;
            if (n > 1)
            {
                var fileName = string.Join(" ", args, 1, n - 1); //.ToLower(); cannot be used in linux due to case sensitive file system
            
                if (OperatingSystem.IsWindows())
                {
                    fileName = fileName.ToLower();
                }
                
                if (File.Exists(fileName))
                {
                    if (Path.GetExtension(fileName) == ".cpc")
                    {
                        Lines.Clear();
                        using (StreamReader sr = new(fileName))
                            while (!sr.EndOfStream)
                                Lines.Add(new Line(sr.ReadLine()));

                        return Path.GetFileNameWithoutExtension(fileName);
                    }
                }
            }
            return string.Empty;
        }

        static void Header(string Title, int drg)
        {
            Console.Clear();
            var ver = Assembly.GetExecutingAssembly().GetName().Version;
            Console.WriteLine(new string('—', _width));
            Console.WriteLine(string.Format(Messages.Welcome_To_Hekatan_Command_Line_Interpreter, ver.Major, ver.Minor, ver.Build));
            Console.WriteLine(Messages.Copyright_2023_By_Proektsoft_EOOD);
            Console.Write($"\r\n {Messages.Commands}: NEW OPEN SAVE LIST EXIT RESET CLS DEL ");
            switch (drg)
            {
                case 0:
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.Write("DEG ");
                    Console.ResetColor();
                    Console.Write("RAD ");
                    Console.Write("GRA ");
                    break;
                case 1:
                    Console.Write("DEG ");
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.Write("RAD ");
                    Console.ResetColor();
                    Console.Write("GRA ");
                    break;
                default:
                    Console.Write("DEG ");
                    Console.Write("RAD ");
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.Write("GRA ");
                    Console.ResetColor();
                    break;
            }
            Console.Write("SETTINGS LICENSE HELP\r\n");
            Console.WriteLine(new string('—', _width));
            if (Title.Length > 0)
                Console.WriteLine(" " + Title + ":\n");
            else
                Console.WriteLine($" {Messages.Enter_Math_Expressions_Or_Commands_Or_Type_HELP_For_Further_Instructions}:\n");
        }

        static bool Calculate(MathParser mp, string Prompt, ref Line L)
        {
            try
            {
                var Buffer = GetVariables(Prompt, L.Input);
                var Tokens = Buffer.Split('\'');
                L.Output = string.Empty;
                for (int i = 0; i < Tokens.Length; i++)
                {
                    if (i % 2 == 0)
                    {
                        if (Tokens[i].Length > 0)
                        {
                            var s = Tokens[i]
                                .Replace(" ", "")
                                .Replace("==", "≡")
                                .Replace("!=", "≠")
                                .Replace("<=", "≤")
                                .Replace(">=", "≥")
                                .Replace("||", "∨")
                                .Replace("&&", "∧")
                                .Replace("%%", "⦼");
                            mp.Parse(s);
                            mp.Calculate();
                            L.Output += mp.ToString().Trim() + ' ';
                        }
                    }
                    else
                        L.Output += Tokens[i].Trim() + ' ';
                }
                var Output = Prompt + L.Output.PadRight(_width - 8);
                Console.WriteLine(Output);
                mp.SaveAnswer();
                return true;
            }
            catch (Exception ex)
            {
                WriteError($"{Prompt + L.Input} {Messages.Error}: {ex.Message}", true);
                return false;
            }
        }

        static void Render(MathParser mp, List<Line> Lines, bool Reset)
        {
            if (Reset)
                mp.ClearCustomUnits();

            for (int i = 0; i < Lines.Count; i++)
            {
                var LineNo = (i + 1).ToString().PadLeft(3) + Prompt;
                if (Reset)
                {
                    Line L = Lines[i];
                    Calculate(mp, LineNo, ref L);
                    Lines[i] = L;
                }
                else
                    Console.WriteLine(LineNo + Lines[i].Output);

            }
        }

        static string GetVariables(string Prompt, string Input)
        {
            var i = 0;
            while (i >= 0)
            {
                i = Input.IndexOf('?');
                if (i >= 0)
                {
                    Console.Write(Prompt + Input[..i].Replace("\'", string.Empty));
                    var Variable = Console.ReadLine();
                    Input = Input[..i] + Variable + Input[(i + 1)..];
                    Console.SetCursorPosition(0, Console.CursorTop - 1);
                }
            }
            return Input;
        }

        static string Open(string Prompt, List<Line> Lines)
        {
            var FilePath = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments) + $"{_dirSeparator}cpc";
            if (!Directory.Exists(FilePath))
            {
                WriteError($"{Prompt}OPEN {Messages.There_Are_No_Saved_Problems}\r\n", false);
                return null;
            }
            Console.Write($"{Prompt}OPEN {Messages.Problem_Title} ");
            var Title = Console.ReadLine();
            var FileName = FilePath + _dirSeparator + Title + ".cpc";
            if (File.Exists(FileName))
            {
                Lines.Clear();
                using StreamReader sr = new(FileName);
                while (!sr.EndOfStream)
                    Lines.Add(new Line(sr.ReadLine()));

                return Title;
            }
            else
            {
                WriteError(Prompt + string.Format(Messages.Problem_0_Does_Not_Exist, Title), true);
                return null;
            }
        }

        static string Save(string Title, string Prompt, List<Line> Lines)
        {
            var FilePath = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments) + $"{_dirSeparator}cpc";
            if (!Directory.Exists(FilePath))
                Directory.CreateDirectory(FilePath);

            Console.SetCursorPosition(0, Console.CursorTop - 1);
            Prompt += "SAVE" + Messages.Problem_Title;
            if (Title.Length > 0 )
                Prompt += $" ({Title}): ";
            else
                Prompt += ": ";
            Console.Write(Prompt);
            var NewTitle = Console.ReadLine();
            if (NewTitle.Length == 0)
                NewTitle = Title;

            if (NewTitle.Length > 0)
            {
                var FileName = FilePath + _dirSeparator + NewTitle + ".cpc";
                using StreamWriter sw = new(FileName);
                foreach (Line L in Lines)
                    sw.WriteLine(L.Input);
            }
            return NewTitle;
        }

        static void List(string Prompt)
        {
            string FilePath = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments) + $"{_dirSeparator}cpc";
            if (!Directory.Exists(FilePath))
            {
                WriteError(Prompt + Messages.There_Are_No_Saved_Problems, true);
                return;
            }
            List<string> Lines = Directory.EnumerateFiles(FilePath).ToList();
            foreach (string s in Lines)
                Console.WriteLine(Path.GetFileNameWithoutExtension(s));

            Console.WriteLine();
        }

        private static void WriteError(string message, bool line)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            if (line)
                Console.WriteLine(message);
            else
                Console.Write(message);

            Console.ResetColor();
        }
        private static bool Execute(string fileName, string args = "")
        {
            var proc = new Process();
            var psi = new ProcessStartInfo
            {
                UseShellExecute = OperatingSystem.IsWindows(),
                FileName = fileName,
                Arguments = args,
                Verb = "runas"
            };
            proc.StartInfo = psi;
            try
            {
                Console.WriteLine(Messages.Loading_The_Settings_File);
                var result = proc.Start();
                proc.WaitForExit();
                return result;
            }
            catch (Exception Ex)
            {
                WriteError(Ex.Message, true);
                return false;
            }
        }

        /// <summary>
        /// Detecta si el HTML contiene un visor IFC
        /// </summary>
        private static bool ContainsIFC(string htmlContent)
        {
            return htmlContent != null &&
                   (htmlContent.Contains("ifc-viewer", StringComparison.OrdinalIgnoreCase) ||
                    htmlContent.Contains("web-ifc", StringComparison.OrdinalIgnoreCase) ||
                    htmlContent.Contains("ifc-fragment", StringComparison.OrdinalIgnoreCase) ||
                    htmlContent.Contains("@thatopen/fragments", StringComparison.OrdinalIgnoreCase) ||
                    htmlContent.Contains("@{ifc}", StringComparison.OrdinalIgnoreCase) ||
                    htmlContent.Contains("@{ifc-fragment}", StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Abre el archivo HTML usando un servidor HTTP local (para evitar errores CORS con IFC)
        /// </summary>
        private static void OpenHtmlWithHttpServer(string htmlFilePath)
        {
            try
            {
                var fileName = Path.GetFileName(htmlFilePath);
                var directory = Path.GetDirectoryName(Path.GetFullPath(htmlFilePath));
                var port = 8888;

                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("=== IFC Viewer - HTTP Server ===");
                Console.ResetColor();
                Console.WriteLine($"Detected IFC content. Starting HTTP server...");
                Console.WriteLine($"Directory: {directory}");
                Console.WriteLine($"Port: {port}");
                Console.WriteLine();

                // Check if Node.js/npx is available
                if (!IsCommandAvailable("node") && !IsCommandAvailable("npx"))
                {
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("Warning: Node.js not found. Cannot start HTTP server.");
                    Console.WriteLine("Please open the file manually using a web server:");
                    Console.WriteLine($"  http://localhost:{port}/{fileName}");
                    Console.ResetColor();
                    Console.WriteLine();
                    Console.WriteLine("Or use the script: ver-html.bat " + fileName);
                    Console.WriteLine();
                    Console.WriteLine("Install Node.js from: https://nodejs.org/");
                    Console.WriteLine();
                    return;
                }

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine($"Starting HTTP server on port {port}...");
                Console.ResetColor();

                // Start HTTP server FIRST using npx http-server
                var npxCommand = "npx";
                var serverProcess = new ProcessStartInfo
                {
                    FileName = npxCommand,
                    Arguments = $"--yes http-server \"{directory}\" -p {port} --cors -c-1",
                    UseShellExecute = true,
                    WorkingDirectory = directory
                };

                var process = Process.Start(serverProcess);
                if (process == null)
                {
                    Console.WriteLine("Failed to start HTTP server");
                    return;
                }

                // Wait for server to be ready (check with HTTP request)
                var url = $"http://localhost:{port}/{fileName}";
                var maxRetries = 10;
                var serverReady = false;

                for (int i = 0; i < maxRetries; i++)
                {
                    Thread.Sleep(1000);
                    try
                    {
                        using var client = new System.Net.Http.HttpClient();
                        client.Timeout = TimeSpan.FromSeconds(2);
                        var response = client.GetAsync($"http://localhost:{port}/").Result;
                        if (response.IsSuccessStatusCode)
                        {
                            serverReady = true;
                            break;
                        }
                    }
                    catch
                    {
                        // Server not ready yet, continue waiting
                    }
                }

                if (!serverReady)
                {
                    Console.WriteLine("Warning: Could not verify server is ready, opening browser anyway...");
                }

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine($"Opening: {url}");
                Console.ResetColor();
                Console.WriteLine();
                Console.WriteLine("Press Ctrl+C to stop the server when done.");
                Console.WriteLine();

                // NOW open browser after server is ready
                try
                {
                    if (OperatingSystem.IsWindows())
                        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                    else if (OperatingSystem.IsLinux())
                        Process.Start("xdg-open", url);
                    else if (OperatingSystem.IsMacOS())
                        Process.Start("open", url);
                }
                catch
                {
                    Console.WriteLine($"Could not open browser automatically. Please open: {url}");
                }

                // Wait for server process (blocking)
                process.WaitForExit();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"Error starting HTTP server: {ex.Message}");
                Console.ResetColor();
                Console.WriteLine();
                Console.WriteLine("You can open the file manually using a web server.");
            }
        }

        /// <summary>
        /// Verifica si un comando está disponible en el sistema
        /// </summary>
        private static bool IsCommandAvailable(string command)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = OperatingSystem.IsWindows() ? "where" : "which",
                    Arguments = command,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using var process = Process.Start(startInfo);
                process?.WaitForExit();
                return process?.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }
    }
}
