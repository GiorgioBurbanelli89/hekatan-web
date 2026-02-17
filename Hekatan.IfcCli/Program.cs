using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace Hekatan.IfcCli
{
    class Program
    {
        const string Version = "1.0.0";

        static int Main(string[] args)
        {
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

            if (args.Length == 0)
            {
                PrintHelp();
                return 0;
            }

            var command = args[0].ToLowerInvariant();

            try
            {
                return command switch
                {
                    "view" => RunView(args[1..]),
                    "meta" => RunMeta(args[1..]),
                    "filter" => RunFilter(args[1..]),
                    "batch" => RunBatch(args[1..]),
                    "--help" or "-h" or "help" => PrintHelp(),
                    "--version" or "-v" => PrintVersion(),
                    _ => UnknownCommand(command)
                };
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.Error.WriteLine($"Error: {ex.Message}");
                Console.ResetColor();
                return 1;
            }
        }

        static int RunView(string[] args)
        {
            if (args.Length == 0)
            {
                Console.Error.WriteLine("Usage: ifccli view <file.ifc> [-o output.html] [--cdn|--local <path>]");
                return 1;
            }

            string inputFile = null;
            string outputFile = null;
            string libsPath = "cdn";
            bool openBrowser = true;

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "-o" or "--output":
                        if (i + 1 < args.Length) outputFile = args[++i];
                        break;
                    case "--cdn":
                        libsPath = "cdn";
                        break;
                    case "--local":
                        if (i + 1 < args.Length) libsPath = args[++i];
                        break;
                    case "--no-open":
                        openBrowser = false;
                        break;
                    default:
                        if (inputFile == null && !args[i].StartsWith('-'))
                            inputFile = args[i];
                        break;
                }
            }

            if (inputFile == null || !File.Exists(inputFile))
            {
                Console.Error.WriteLine(inputFile == null
                    ? "Error: No input file specified."
                    : $"Error: File not found: {inputFile}");
                return 1;
            }

            outputFile ??= Path.ChangeExtension(inputFile, ".html");

            Console.WriteLine($"Converting: {Path.GetFileName(inputFile)} -> {Path.GetFileName(outputFile)}");

            var exporter = new IfcHtmlExporter();
            exporter.Export(inputFile, outputFile, libsPath);

            var fi = new FileInfo(outputFile);
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"Done! Output: {fi.FullName} ({fi.Length / 1024:N0} KB)");
            Console.ResetColor();

            if (openBrowser)
                OpenFile(outputFile);

            return 0;
        }

        static int RunMeta(string[] args)
        {
            if (args.Length == 0)
            {
                Console.Error.WriteLine("Usage: ifccli meta <file.ifc> [--set key=value ...] [-o output.ifc]");
                return 1;
            }

            string inputFile = null;
            string outputFile = null;
            var setValues = new System.Collections.Generic.Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "-o" or "--output":
                        if (i + 1 < args.Length) outputFile = args[++i];
                        break;
                    case "--set":
                        if (i + 1 < args.Length)
                        {
                            var kv = args[++i];
                            var eqIdx = kv.IndexOf('=');
                            if (eqIdx > 0)
                                setValues[kv[..eqIdx].Trim()] = kv[(eqIdx + 1)..].Trim().Trim('"', '\'');
                        }
                        break;
                    default:
                        if (inputFile == null && !args[i].StartsWith('-'))
                            inputFile = args[i];
                        break;
                }
            }

            if (inputFile == null || !File.Exists(inputFile))
            {
                Console.Error.WriteLine(inputFile == null
                    ? "Error: No input file specified."
                    : $"Error: File not found: {inputFile}");
                return 1;
            }

            var parser = new IfcParser();
            var ifc = parser.Parse(inputFile);

            if (setValues.Count == 0)
            {
                // Show current metadata
                Console.WriteLine($"File: {Path.GetFileName(inputFile)}");
                Console.WriteLine($"Schema: {ifc.FileSchema}");
                Console.WriteLine(new string('-', 40));
                Console.WriteLine($"Project:      {ifc.ProjectName ?? "(not set)"}");
                Console.WriteLine($"Author:       {ifc.AuthorName ?? "(not set)"}");
                Console.WriteLine($"Organization: {ifc.OrganizationName ?? "(not set)"}");
                Console.WriteLine($"Description:  {ifc.FileDescriptionText ?? "(not set)"}");
                Console.WriteLine($"Timestamp:    {ifc.FileTimestamp ?? "(not set)"}");
                Console.WriteLine(new string('-', 40));
                Console.WriteLine($"Total entities: {ifc.Entities.Count:N0}");
                return 0;
            }

            // Modify metadata
            var modifier = new IfcModifier();
            foreach (var kv in setValues)
            {
                modifier.SetMetadata(ifc, kv.Key, kv.Value);
                Console.WriteLine($"  Set {kv.Key} = \"{kv.Value}\"");
            }

            outputFile ??= inputFile;
            modifier.Save(ifc, outputFile);

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"Saved: {Path.GetFullPath(outputFile)}");
            Console.ResetColor();

            return 0;
        }

        static int RunFilter(string[] args)
        {
            if (args.Length == 0)
            {
                Console.Error.WriteLine("Usage: ifccli filter <file.ifc> [--types TYPE1,TYPE2] [--exclude TYPE] [--list] [--stats] [-o output.ifc]");
                return 1;
            }

            string inputFile = null;
            string outputFile = null;
            string[] includeTypes = null;
            string[] excludeTypes = null;
            bool listTypes = false;
            bool showStats = false;

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "-o" or "--output":
                        if (i + 1 < args.Length) outputFile = args[++i];
                        break;
                    case "--types":
                        if (i + 1 < args.Length)
                            includeTypes = args[++i].ToUpperInvariant().Split(',', StringSplitOptions.RemoveEmptyEntries);
                        break;
                    case "--exclude":
                        if (i + 1 < args.Length)
                            excludeTypes = args[++i].ToUpperInvariant().Split(',', StringSplitOptions.RemoveEmptyEntries);
                        break;
                    case "--list":
                        listTypes = true;
                        break;
                    case "--stats":
                        showStats = true;
                        break;
                    default:
                        if (inputFile == null && !args[i].StartsWith('-'))
                            inputFile = args[i];
                        break;
                }
            }

            if (inputFile == null || !File.Exists(inputFile))
            {
                Console.Error.WriteLine(inputFile == null
                    ? "Error: No input file specified."
                    : $"Error: File not found: {inputFile}");
                return 1;
            }

            var parser = new IfcParser();
            var ifc = parser.Parse(inputFile);

            if (listTypes || showStats)
            {
                Console.WriteLine($"File: {Path.GetFileName(inputFile)} ({new FileInfo(inputFile).Length / 1024:N0} KB)");
                Console.WriteLine($"Schema: {ifc.FileSchema}");
                Console.WriteLine($"Total entities: {ifc.Entities.Count:N0}");
                Console.WriteLine();

                var sorted = new System.Collections.Generic.SortedDictionary<string, int>();
                foreach (var kv in ifc.TypeIndex)
                    sorted[kv.Key] = kv.Value.Count;

                if (showStats)
                {
                    Console.WriteLine($"{"Type",-45} {"Count",8}");
                    Console.WriteLine(new string('-', 55));
                    foreach (var kv in sorted)
                        Console.WriteLine($"{kv.Key,-45} {kv.Value,8:N0}");
                }
                else
                {
                    foreach (var kv in sorted)
                        Console.WriteLine($"  {kv.Key} ({kv.Value})");
                }
                return 0;
            }

            if (includeTypes == null && excludeTypes == null)
            {
                Console.Error.WriteLine("Error: Specify --types or --exclude, or use --list/--stats to inspect.");
                return 1;
            }

            outputFile ??= Path.Combine(
                Path.GetDirectoryName(Path.GetFullPath(inputFile)) ?? ".",
                Path.GetFileNameWithoutExtension(inputFile) + "_filtered.ifc");

            Console.Write("Filtering...");

            var modifier = new IfcModifier();
            var filtered = modifier.Filter(ifc, includeTypes, excludeTypes);

            modifier.Save(filtered, outputFile);

            var fi = new FileInfo(outputFile);
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($" Done! {filtered.Entities.Count:N0} entities -> {fi.FullName} ({fi.Length / 1024:N0} KB)");
            Console.ResetColor();

            return 0;
        }

        static int RunBatch(string[] args)
        {
            if (args.Length == 0)
            {
                Console.Error.WriteLine("Usage: ifccli batch <folder> [-o output_folder] [--filter TYPE1,TYPE2]");
                return 1;
            }

            string inputFolder = null;
            string outputFolder = null;
            string[] filterTypes = null;

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "-o" or "--output":
                        if (i + 1 < args.Length) outputFolder = args[++i];
                        break;
                    case "--filter":
                        if (i + 1 < args.Length)
                            filterTypes = args[++i].ToUpperInvariant().Split(',', StringSplitOptions.RemoveEmptyEntries);
                        break;
                    default:
                        if (inputFolder == null && !args[i].StartsWith('-'))
                            inputFolder = args[i];
                        break;
                }
            }

            if (inputFolder == null || !Directory.Exists(inputFolder))
            {
                Console.Error.WriteLine(inputFolder == null
                    ? "Error: No folder specified."
                    : $"Error: Folder not found: {inputFolder}");
                return 1;
            }

            var ifcFiles = Directory.GetFiles(inputFolder, "*.ifc", SearchOption.TopDirectoryOnly);
            if (ifcFiles.Length == 0)
            {
                Console.Error.WriteLine($"No .ifc files found in: {inputFolder}");
                return 1;
            }

            outputFolder ??= inputFolder;
            if (!Directory.Exists(outputFolder))
                Directory.CreateDirectory(outputFolder);

            Console.WriteLine($"Processing {ifcFiles.Length} IFC files...");
            Console.WriteLine();

            var exporter = new IfcHtmlExporter();
            var sw = Stopwatch.StartNew();
            int success = 0, failed = 0;

            foreach (var ifcFile in ifcFiles)
            {
                var name = Path.GetFileName(ifcFile);
                try
                {
                    string outFile;
                    if (filterTypes != null)
                    {
                        // Filter first, then export filtered
                        var parser = new IfcParser();
                        var ifc = parser.Parse(ifcFile);
                        var modifier = new IfcModifier();
                        var filtered = modifier.Filter(ifc, filterTypes, null);
                        var filteredPath = Path.Combine(outputFolder, Path.GetFileNameWithoutExtension(ifcFile) + "_filtered.ifc");
                        modifier.Save(filtered, filteredPath);
                        outFile = Path.ChangeExtension(filteredPath, ".html");
                        exporter.Export(filteredPath, outFile, "cdn");
                    }
                    else
                    {
                        outFile = Path.Combine(outputFolder, Path.ChangeExtension(name, ".html"));
                        exporter.Export(ifcFile, outFile, "cdn");
                    }

                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.Write("  OK ");
                    Console.ResetColor();
                    Console.WriteLine($"{name} -> {Path.GetFileName(outFile)}");
                    success++;
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.Write("  FAIL ");
                    Console.ResetColor();
                    Console.WriteLine($"{name}: {ex.Message}");
                    failed++;
                }
            }

            sw.Stop();
            Console.WriteLine();
            Console.WriteLine($"Completed in {sw.Elapsed.TotalSeconds:F1}s: {success} OK, {failed} failed");

            return failed > 0 ? 1 : 0;
        }

        static int PrintHelp()
        {
            Console.WriteLine($@"
IfcCli v{Version} - IFC File Tool
================================

Commands:
  view   <file.ifc>   Convert IFC to interactive HTML viewer
  meta   <file.ifc>   View/edit IFC metadata (project, author, org)
  filter <file.ifc>   Filter/extract entities by type
  batch  <folder>     Batch convert all IFC files in a folder

Examples:
  ifccli view modelo.ifc                          Convert to HTML
  ifccli view modelo.ifc -o salida.html           Custom output path
  ifccli meta modelo.ifc                          Show metadata
  ifccli meta modelo.ifc --set project=""Edificio"" Edit metadata
  ifccli filter modelo.ifc --list                 List entity types
  ifccli filter modelo.ifc --stats                Statistics by type
  ifccli filter modelo.ifc --types IFCWALL        Extract walls only
  ifccli batch ./models/ -o ./html/               Batch convert folder

Options:
  -o, --output <path>    Output file/folder path
  --cdn                  Use CDN for JS libraries (default)
  --local <path>         Use local path for JS libraries
  --no-open              Don't auto-open in browser (view)
  --set key=value        Set metadata value (meta)
  --types TYPE1,TYPE2    Include only these types (filter)
  --exclude TYPE1,TYPE2  Exclude these types (filter)
  --list                 List entity types found (filter)
  --stats                Show statistics by type (filter)
  --filter TYPE1,TYPE2   Filter before converting (batch)
  -h, --help             Show this help
  -v, --version          Show version
");
            return 0;
        }

        static int PrintVersion()
        {
            Console.WriteLine($"IfcCli v{Version}");
            return 0;
        }

        static int UnknownCommand(string cmd)
        {
            Console.Error.WriteLine($"Unknown command: {cmd}");
            Console.Error.WriteLine("Use --help to see available commands.");
            return 1;
        }

        static void OpenFile(string path)
        {
            try
            {
                Process.Start(new ProcessStartInfo(Path.GetFullPath(path)) { UseShellExecute = true });
            }
            catch { }
        }
    }
}
