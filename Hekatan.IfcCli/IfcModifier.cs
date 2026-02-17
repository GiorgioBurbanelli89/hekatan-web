using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Hekatan.IfcCli
{
    /// <summary>
    /// Modifies IFC metadata and filters entities
    /// </summary>
    public class IfcModifier
    {
        // Structural entity types that must always be preserved for a valid IFC file
        private static readonly HashSet<string> StructuralTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY",
            "IFCOWNERHISTORY", "IFCPERSON", "IFCORGANIZATION", "IFCPERSONANDORGANIZATION",
            "IFCAPPLICATION", "IFCUNITASSIGNMENT", "IFCSIUNIT", "IFCDERIVEDUNIT",
            "IFCDERIVEDUNITELEMENT", "IFCMONETARYUNIT", "IFCMEASUREWITHUNIT",
            "IFCDIMENSIONALEXPONENTS", "IFCCONVERSIONBASEDUNIT",
            "IFCGEOMETRICREPRESENTATIONCONTEXT", "IFCGEOMETRICREPRESENTATIONSUBCONTEXT",
            "IFCDIRECTION", "IFCCARTESIANPOINT", "IFCAXIS2PLACEMENT3D", "IFCAXIS2PLACEMENT2D",
            "IFCLOCALPLACEMENT", "IFCRELAGGREGATES"
        };

        // Product entity types that can be filtered (elements you see in the model)
        private static readonly HashSet<string> ProductTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "IFCWALL", "IFCWALLSTANDARDCASE", "IFCCURTAINWALL",
            "IFCCOLUMN", "IFCBEAM", "IFCMEMBER",
            "IFCSLAB", "IFCPLATE", "IFCFOOTING",
            "IFCSTAIR", "IFCSTAIRFLIGHT", "IFCRAMP", "IFCRAMPFLIGHT",
            "IFCRAILING", "IFCROOF",
            "IFCWINDOW", "IFCDOOR",
            "IFCFURNISHINGELEMENT", "IFCBUILDINGELEMENTPROXY",
            "IFCCOVERING", "IFCOPENINGELEMENT", "IFCFLOWSEGMENT",
            "IFCFLOWTERMINAL", "IFCFLOWFITTING", "IFCDISTRIBUTIONPORT",
            "IFCSPACE", "IFCBUILDINGSTOREY"
        };

        /// <summary>
        /// Set a metadata field on the parsed IFC file
        /// </summary>
        public void SetMetadata(IfcFile ifc, string key, string value)
        {
            switch (key.ToLowerInvariant())
            {
                case "project" or "proyecto":
                    SetProjectName(ifc, value);
                    break;
                case "author" or "autor":
                    SetPersonName(ifc, value);
                    break;
                case "organization" or "org" or "organizacion":
                    SetOrganizationName(ifc, value);
                    break;
                case "description" or "descripcion":
                    SetProjectDescription(ifc, value);
                    break;
                default:
                    throw new ArgumentException($"Unknown metadata key: {key}. Valid keys: project, author, organization, description");
            }
        }

        /// <summary>
        /// Filter IFC entities by type, keeping structural dependencies
        /// </summary>
        public IfcFile Filter(IfcFile source, string[] includeTypes, string[] excludeTypes)
        {
            var filtered = new IfcFile
            {
                FilePath = source.FilePath,
                HeaderRaw = source.HeaderRaw,
                FileDescriptionText = source.FileDescriptionText,
                FileNameRaw = source.FileNameRaw,
                FileSchema = source.FileSchema,
                FileTimestamp = source.FileTimestamp,
                ProjectName = source.ProjectName,
                AuthorName = source.AuthorName,
                OrganizationName = source.OrganizationName,
                PreHeader = source.PreHeader,
                PostData = source.PostData
            };
            foreach (var line in source.HeaderLines)
                filtered.HeaderLines.Add(line);

            // Determine which product entity IDs to keep
            var keepIds = new HashSet<int>();

            foreach (var kvp in source.Entities)
            {
                var entity = kvp.Value;

                // Always keep structural types
                if (StructuralTypes.Contains(entity.Type))
                {
                    keepIds.Add(entity.Id);
                    continue;
                }

                bool keep;
                if (includeTypes != null && includeTypes.Length > 0)
                {
                    // Include mode: only keep matching types + their dependencies
                    keep = includeTypes.Any(t => entity.Type.Equals(t, StringComparison.OrdinalIgnoreCase));
                }
                else if (excludeTypes != null && excludeTypes.Length > 0)
                {
                    // Exclude mode: keep everything except matching types
                    keep = !excludeTypes.Any(t => entity.Type.Equals(t, StringComparison.OrdinalIgnoreCase));
                }
                else
                {
                    keep = true;
                }

                if (keep)
                    keepIds.Add(entity.Id);
            }

            // Resolve dependencies: for each kept entity, also keep all referenced entities
            var resolved = new HashSet<int>(keepIds);
            var queue = new Queue<int>(keepIds);
            while (queue.Count > 0)
            {
                var id = queue.Dequeue();
                if (!source.Entities.TryGetValue(id, out var entity))
                    continue;

                foreach (var refId in entity.References)
                {
                    if (source.Entities.ContainsKey(refId) && resolved.Add(refId))
                        queue.Enqueue(refId);
                }
            }

            // Also keep relationship entities that reference kept entities
            foreach (var kvp in source.Entities)
            {
                var entity = kvp.Value;
                if (resolved.Contains(entity.Id))
                    continue;

                // Keep relationships (IFCREL*) that connect to kept entities
                if (entity.Type.StartsWith("IFCREL", StringComparison.OrdinalIgnoreCase))
                {
                    // Check if any of its references point to a kept entity
                    bool referencesKeptEntity = entity.References.Any(r => resolved.Contains(r));
                    if (referencesKeptEntity)
                    {
                        // For IFCRELCONTAINEDINSPATIALSTRUCTURE, filter the related elements list
                        if (entity.Type.Equals("IFCRELCONTAINEDINSPATIALSTRUCTURE", StringComparison.OrdinalIgnoreCase))
                        {
                            var updatedEntity = FilterRelContained(entity, resolved, source);
                            if (updatedEntity != null)
                            {
                                resolved.Add(updatedEntity.Id);
                                source.Entities[updatedEntity.Id] = updatedEntity;
                            }
                        }
                        else
                        {
                            resolved.Add(entity.Id);
                        }
                    }
                }

                // Keep property sets, materials, types linked to kept entities
                if (entity.Type.StartsWith("IFCPROPERTYS", StringComparison.OrdinalIgnoreCase) ||
                    entity.Type.StartsWith("IFCMATERIAL", StringComparison.OrdinalIgnoreCase) ||
                    entity.Type.StartsWith("IFCTYPEPRODUCT", StringComparison.OrdinalIgnoreCase))
                {
                    if (entity.References.Any(r => resolved.Contains(r)))
                        resolved.Add(entity.Id);
                }
            }

            // Build the filtered file
            foreach (var id in resolved.OrderBy(x => x))
            {
                if (!source.Entities.TryGetValue(id, out var entity))
                    continue;

                filtered.Entities[id] = entity;
                if (!filtered.TypeIndex.TryGetValue(entity.Type, out var list))
                {
                    list = new List<int>();
                    filtered.TypeIndex[entity.Type] = list;
                }
                list.Add(id);
            }

            return filtered;
        }

        /// <summary>
        /// Save an IFC file (original or modified) to disk
        /// </summary>
        public void Save(IfcFile ifc, string outputPath)
        {
            var sb = new StringBuilder();

            // Pre-header
            sb.AppendLine(ifc.PreHeader ?? "ISO-10303-21;");

            // Header
            sb.AppendLine("HEADER;");
            foreach (var line in ifc.HeaderLines)
                sb.AppendLine(line);
            sb.AppendLine("ENDSEC;");

            // Data
            sb.AppendLine("DATA;");
            foreach (var entity in ifc.Entities.OrderBy(kv => kv.Key))
                sb.AppendLine(entity.Value.RawLine);
            sb.AppendLine("ENDSEC;");
            sb.AppendLine("END-ISO-10303-21;");

            File.WriteAllText(outputPath, sb.ToString(), Encoding.UTF8);
        }

        #region Metadata Modification

        private static void SetProjectName(IfcFile ifc, string name)
        {
            if (!ifc.TypeIndex.TryGetValue("IFCPROJECT", out var ids) || ids.Count == 0)
                return;

            var entity = ifc.Entities[ids[0]];
            var args = IfcParser.SplitIfcArgs(entity.Arguments);
            if (args.Count >= 3)
            {
                args[2] = $"'{EscapeIfcString(name)}'";
                UpdateEntityArgs(entity, args);
                ifc.ProjectName = name;
            }
        }

        private static void SetProjectDescription(IfcFile ifc, string description)
        {
            if (!ifc.TypeIndex.TryGetValue("IFCPROJECT", out var ids) || ids.Count == 0)
                return;

            var entity = ifc.Entities[ids[0]];
            var args = IfcParser.SplitIfcArgs(entity.Arguments);
            if (args.Count >= 4)
            {
                args[3] = $"'{EscapeIfcString(description)}'";
                UpdateEntityArgs(entity, args);
            }
        }

        private static void SetPersonName(IfcFile ifc, string name)
        {
            if (!ifc.TypeIndex.TryGetValue("IFCPERSON", out var ids) || ids.Count == 0)
                return;

            var entity = ifc.Entities[ids[0]];
            var args = IfcParser.SplitIfcArgs(entity.Arguments);
            // IFCPERSON(Id, FamilyName, GivenName, ...)
            if (args.Count >= 3)
            {
                var parts = name.Split(' ', 2);
                args[2] = $"'{EscapeIfcString(parts[0])}'"; // GivenName
                if (parts.Length > 1)
                    args[1] = $"'{EscapeIfcString(parts[1])}'"; // FamilyName
                else
                    args[1] = "$";

                UpdateEntityArgs(entity, args);
                ifc.AuthorName = name;
            }
        }

        private static void SetOrganizationName(IfcFile ifc, string name)
        {
            if (!ifc.TypeIndex.TryGetValue("IFCORGANIZATION", out var ids) || ids.Count == 0)
                return;

            var entity = ifc.Entities[ids[0]];
            var args = IfcParser.SplitIfcArgs(entity.Arguments);
            // IFCORGANIZATION(Id, Name, Description, ...)
            if (args.Count >= 2)
            {
                args[1] = $"'{EscapeIfcString(name)}'";
                UpdateEntityArgs(entity, args);
                ifc.OrganizationName = name;
            }
        }

        private static void UpdateEntityArgs(IfcEntity entity, List<string> args)
        {
            entity.Arguments = string.Join(",", args);
            entity.RawLine = $"#{entity.Id}= {entity.Type}({entity.Arguments});";
        }

        private static string EscapeIfcString(string s)
        {
            return s.Replace("'", "''").Replace("\\", "\\\\");
        }

        #endregion

        #region Filtering Helpers

        /// <summary>
        /// For IFCRELCONTAINEDINSPATIALSTRUCTURE, filter the RelatedElements list
        /// to only include kept entities
        /// </summary>
        private static IfcEntity FilterRelContained(IfcEntity entity, HashSet<int> keepIds, IfcFile source)
        {
            var args = IfcParser.SplitIfcArgs(entity.Arguments);
            // IFCRELCONTAINEDINSPATIALSTRUCTURE(GlobalId, OwnerHistory, Name, Description, RelatedElements, RelatingStructure)
            if (args.Count < 5) return null;

            var relatedElements = args[4]; // e.g. "(#100,#200,#300)"
            var refs = Regex.Matches(relatedElements, @"#(\d+)");
            var keptRefs = new List<string>();

            foreach (Match m in refs)
            {
                int refId = int.Parse(m.Groups[1].Value);
                if (keepIds.Contains(refId))
                    keptRefs.Add($"#{refId}");
            }

            if (keptRefs.Count == 0)
                return null;

            args[4] = $"({string.Join(",", keptRefs)})";

            var updated = new IfcEntity
            {
                Id = entity.Id,
                Type = entity.Type,
                Arguments = string.Join(",", args)
            };
            updated.RawLine = $"#{updated.Id}= {updated.Type}({updated.Arguments});";

            // Recalculate references
            foreach (Match rm in Regex.Matches(updated.Arguments, @"#(\d+)"))
                updated.References.Add(int.Parse(rm.Groups[1].Value));

            return updated;
        }

        #endregion
    }
}
