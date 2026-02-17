using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Hekatan.IfcCli
{
    /// <summary>
    /// Represents a parsed IFC file (ISO-10303-21)
    /// </summary>
    public class IfcFile
    {
        public string FilePath { get; set; }
        public string HeaderRaw { get; set; }
        public string FileDescriptionText { get; set; }
        public string FileNameRaw { get; set; }
        public string FileSchema { get; set; }
        public string FileTimestamp { get; set; }

        // Extracted metadata
        public string ProjectName { get; set; }
        public string AuthorName { get; set; }
        public string OrganizationName { get; set; }

        // Entity data
        public Dictionary<int, IfcEntity> Entities { get; } = new();
        public Dictionary<string, List<int>> TypeIndex { get; } = new(StringComparer.OrdinalIgnoreCase);

        // Original lines for reconstruction
        public List<string> HeaderLines { get; } = new();
        public string PreHeader { get; set; } // "ISO-10303-21;"
        public string PostData { get; set; }  // "ENDSEC;\nEND-ISO-10303-21;"
    }

    /// <summary>
    /// Represents a single IFC entity (#ID= IFCTYPE(...);)
    /// </summary>
    public class IfcEntity
    {
        public int Id { get; set; }
        public string Type { get; set; }
        public string RawLine { get; set; }
        public string Arguments { get; set; }
        public HashSet<int> References { get; } = new();
    }

    /// <summary>
    /// Parser for IFC files (ISO-10303-21 format)
    /// </summary>
    public class IfcParser
    {
        // Pattern: #123= IFCTYPE(args);
        private static readonly Regex EntityPattern = new(
            @"^#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)\s*\((.*)\)\s*;\s*$",
            RegexOptions.Compiled | RegexOptions.Singleline);

        // Pattern: #123 reference inside arguments
        private static readonly Regex RefPattern = new(
            @"#(\d+)",
            RegexOptions.Compiled);

        // Pattern for FILE_NAME('name','timestamp',('author'),('org'),...)
        private static readonly Regex FileNamePattern = new(
            @"FILE_NAME\s*\(\s*'([^']*)'\s*,\s*'([^']*)'",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        // Pattern for FILE_SCHEMA
        private static readonly Regex FileSchemaPattern = new(
            @"FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'\s*\)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        // Pattern for FILE_DESCRIPTION
        private static readonly Regex FileDescPattern = new(
            @"FILE_DESCRIPTION\s*\(\s*\(([^)]*)\)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        public IfcFile Parse(string filePath)
        {
            if (!File.Exists(filePath))
                throw new FileNotFoundException($"IFC file not found: {filePath}");

            var ifc = new IfcFile { FilePath = filePath };
            var lines = File.ReadAllLines(filePath, Encoding.UTF8);

            var section = Section.Pre;
            var headerSb = new StringBuilder();
            var entityBuffer = new StringBuilder();

            for (int i = 0; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrEmpty(line))
                    continue;

                switch (section)
                {
                    case Section.Pre:
                        if (line.StartsWith("ISO-10303-21", StringComparison.OrdinalIgnoreCase))
                            ifc.PreHeader = line;
                        if (line.StartsWith("HEADER;", StringComparison.OrdinalIgnoreCase))
                        {
                            section = Section.Header;
                            // Handle "HEADER;FILE_DESCRIPTION(...)" on same line
                            var afterHeader = line["HEADER;".Length..].Trim();
                            if (afterHeader.Length > 0)
                            {
                                ifc.HeaderLines.Add(afterHeader);
                                headerSb.AppendLine(afterHeader);
                            }
                        }
                        break;

                    case Section.Header:
                        if (line.Equals("ENDSEC;", StringComparison.OrdinalIgnoreCase))
                        {
                            section = Section.BetweenHeaderAndData;
                            ifc.HeaderRaw = headerSb.ToString();
                            ParseHeader(ifc);
                        }
                        else
                        {
                            ifc.HeaderLines.Add(lines[i]); // preserve original indentation
                            headerSb.AppendLine(line);
                        }
                        break;

                    case Section.BetweenHeaderAndData:
                        if (line.Equals("DATA;", StringComparison.OrdinalIgnoreCase))
                            section = Section.Data;
                        break;

                    case Section.Data:
                        if (line.Equals("ENDSEC;", StringComparison.OrdinalIgnoreCase))
                        {
                            // Flush any remaining entity buffer
                            FlushEntity(entityBuffer, ifc);
                            section = Section.Post;
                            ifc.PostData = "ENDSEC;";
                        }
                        else if (line.StartsWith('#'))
                        {
                            // New entity starts - flush previous
                            FlushEntity(entityBuffer, ifc);
                            entityBuffer.Append(line);

                            // Check if entity is complete (ends with ;)
                            if (line.EndsWith(';'))
                            {
                                FlushEntity(entityBuffer, ifc);
                            }
                        }
                        else
                        {
                            // Continuation of multi-line entity
                            entityBuffer.Append(' ').Append(line);
                            if (line.EndsWith(';'))
                            {
                                FlushEntity(entityBuffer, ifc);
                            }
                        }
                        break;

                    case Section.Post:
                        if (line.StartsWith("END-ISO-10303-21", StringComparison.OrdinalIgnoreCase))
                            ifc.PostData += "\n" + line;
                        break;
                }
            }

            // Extract metadata from entities
            ExtractMetadataFromEntities(ifc);

            return ifc;
        }

        private static void FlushEntity(StringBuilder buffer, IfcFile ifc)
        {
            if (buffer.Length == 0)
                return;

            var raw = buffer.ToString();
            buffer.Clear();

            var match = EntityPattern.Match(raw);
            if (!match.Success)
                return;

            var entity = new IfcEntity
            {
                Id = int.Parse(match.Groups[1].Value),
                Type = match.Groups[2].Value.ToUpperInvariant(),
                RawLine = raw,
                Arguments = match.Groups[3].Value
            };

            // Extract references
            foreach (Match refMatch in RefPattern.Matches(entity.Arguments))
            {
                entity.References.Add(int.Parse(refMatch.Groups[1].Value));
            }

            ifc.Entities[entity.Id] = entity;

            if (!ifc.TypeIndex.TryGetValue(entity.Type, out var list))
            {
                list = new List<int>();
                ifc.TypeIndex[entity.Type] = list;
            }
            list.Add(entity.Id);
        }

        private static void ParseHeader(IfcFile ifc)
        {
            var header = ifc.HeaderRaw;

            // FILE_SCHEMA
            var schemaMatch = FileSchemaPattern.Match(header);
            if (schemaMatch.Success)
                ifc.FileSchema = schemaMatch.Groups[1].Value;

            // FILE_NAME
            var nameMatch = FileNamePattern.Match(header);
            if (nameMatch.Success)
            {
                ifc.FileNameRaw = nameMatch.Value;
                ifc.FileTimestamp = nameMatch.Groups[2].Value;
            }

            // FILE_DESCRIPTION
            var descMatch = FileDescPattern.Match(header);
            if (descMatch.Success)
                ifc.FileDescriptionText = descMatch.Groups[1].Value.Trim('\'', ' ');
        }

        private static void ExtractMetadataFromEntities(IfcFile ifc)
        {
            // IFCPROJECT - project name
            if (ifc.TypeIndex.TryGetValue("IFCPROJECT", out var projectIds))
            {
                foreach (var id in projectIds)
                {
                    var entity = ifc.Entities[id];
                    var name = ExtractNameField(entity.Arguments);
                    if (name != null)
                    {
                        ifc.ProjectName = name;
                        break;
                    }
                }
            }

            // IFCORGANIZATION - organization name
            if (ifc.TypeIndex.TryGetValue("IFCORGANIZATION", out var orgIds))
            {
                foreach (var id in orgIds)
                {
                    var entity = ifc.Entities[id];
                    var name = ExtractOrgName(entity.Arguments);
                    if (name != null)
                    {
                        ifc.OrganizationName = name;
                        break;
                    }
                }
            }

            // IFCPERSON - author
            if (ifc.TypeIndex.TryGetValue("IFCPERSON", out var personIds))
            {
                foreach (var id in personIds)
                {
                    var entity = ifc.Entities[id];
                    var name = ExtractPersonName(entity.Arguments);
                    if (name != null)
                    {
                        ifc.AuthorName = name;
                        break;
                    }
                }
            }
        }

        /// <summary>
        /// Extract the Name field from IFCPROJECT arguments
        /// IFCPROJECT('guid',#owner,'Name','Description',...)
        /// Name is typically the 3rd positional argument
        /// </summary>
        private static string ExtractNameField(string args)
        {
            var fields = SplitIfcArgs(args);
            // IFCPROJECT: GlobalId, OwnerHistory, Name, Description, ...
            if (fields.Count >= 3)
            {
                var name = fields[2].Trim('\'');
                return name == "$" ? null : name;
            }
            return null;
        }

        /// <summary>
        /// Extract name from IFCORGANIZATION
        /// IFCORGANIZATION($,'Name','Description',...)
        /// </summary>
        private static string ExtractOrgName(string args)
        {
            var fields = SplitIfcArgs(args);
            // IFCORGANIZATION: Id, Name, Description, ...
            if (fields.Count >= 2)
            {
                var name = fields[1].Trim('\'');
                return name == "$" ? null : name;
            }
            return null;
        }

        /// <summary>
        /// Extract name from IFCPERSON
        /// IFCPERSON($,'FamilyName','GivenName',...)
        /// </summary>
        private static string ExtractPersonName(string args)
        {
            var fields = SplitIfcArgs(args);
            // IFCPERSON: Id, FamilyName, GivenName, ...
            if (fields.Count >= 3)
            {
                var family = fields[1].Trim('\'');
                var given = fields[2].Trim('\'');
                if (family == "$" && given == "$") return null;
                if (family == "$") return given;
                if (given == "$") return family;
                return $"{given} {family}";
            }
            return null;
        }

        /// <summary>
        /// Split IFC arguments respecting nested parentheses and quotes
        /// </summary>
        public static List<string> SplitIfcArgs(string args)
        {
            var result = new List<string>();
            int depth = 0;
            bool inQuote = false;
            var current = new StringBuilder();

            for (int i = 0; i < args.Length; i++)
            {
                char c = args[i];

                if (c == '\'' && (i == 0 || args[i - 1] != '\\'))
                {
                    inQuote = !inQuote;
                    current.Append(c);
                }
                else if (!inQuote && c == '(')
                {
                    depth++;
                    current.Append(c);
                }
                else if (!inQuote && c == ')')
                {
                    depth--;
                    current.Append(c);
                }
                else if (!inQuote && depth == 0 && c == ',')
                {
                    result.Add(current.ToString().Trim());
                    current.Clear();
                }
                else
                {
                    current.Append(c);
                }
            }

            if (current.Length > 0)
                result.Add(current.ToString().Trim());

            return result;
        }

        private enum Section
        {
            Pre,
            Header,
            BetweenHeaderAndData,
            Data,
            Post
        }
    }
}
