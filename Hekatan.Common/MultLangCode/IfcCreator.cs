using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Hekatan.Common.MultLangCode
{
    /// <summary>
    /// Creates IFC files from simple geometry commands
    /// Supports: POINT, LINE, WALL, BEAM, COLUMN, SLAB, PLATE
    ///
    /// Syntax examples:
    ///   POINT p1 = (0, 0, 0)
    ///   POINT p2 = (10, 0, 0)
    ///   LINE line1 = p1, p2
    ///   WALL wall1 = (0,0,0) to (10,0,0) height=3 thickness=0.3
    ///   BEAM beam1 = (0,0,3) to (10,0,3) section=0.3x0.5
    ///   COLUMN col1 = (0,0,0) to (0,0,3) section=0.4x0.4
    ///   SLAB slab1 = [(0,0,3), (10,0,3), (10,5,3), (0,5,3)] thickness=0.2
    /// </summary>
    public class IfcCreator
    {
        private readonly StringBuilder _ifcContent;
        private readonly List<IfcEntity> _entities;
        private int _entityId;
        private readonly Dictionary<string, Point3D> _points;
        private readonly Dictionary<string, IfcEntity> _namedEntities;

        // Project info
        private string _projectName = "Hekatan IFC Project";
        private string _author = "Hekatan";

        public IfcCreator()
        {
            _ifcContent = new StringBuilder();
            _entities = new List<IfcEntity>();
            _entityId = 100;
            _points = new Dictionary<string, Point3D>(StringComparer.OrdinalIgnoreCase);
            _namedEntities = new Dictionary<string, IfcEntity>(StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Process IFC creation commands and return the IFC file content
        /// </summary>
        public string ProcessCommands(string commands)
        {
            var lines = commands.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var errors = new List<string>();

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith("//") || trimmed.StartsWith("#"))
                    continue;

                try
                {
                    ProcessLine(trimmed);
                }
                catch (Exception ex)
                {
                    errors.Add($"Error en '{trimmed}': {ex.Message}");
                }
            }

            if (errors.Count > 0)
            {
                return "ERRORS:\n" + string.Join("\n", errors);
            }

            return GenerateIfcFile();
        }

        private void ProcessLine(string line)
        {
            // Parse command: COMMAND name = parameters
            var match = Regex.Match(line, @"^(\w+)\s+(\w+)\s*=\s*(.+)$", RegexOptions.IgnoreCase);
            if (!match.Success)
            {
                // Try SET command: SET property = value
                var setMatch = Regex.Match(line, @"^SET\s+(\w+)\s*=\s*(.+)$", RegexOptions.IgnoreCase);
                if (setMatch.Success)
                {
                    ProcessSetCommand(setMatch.Groups[1].Value, setMatch.Groups[2].Value.Trim());
                    return;
                }
                throw new ArgumentException("Sintaxis inválida. Use: COMANDO nombre = parámetros");
            }

            var command = match.Groups[1].Value.ToUpper();
            var name = match.Groups[2].Value;
            var parameters = match.Groups[3].Value.Trim();

            switch (command)
            {
                case "POINT":
                case "PUNTO":
                    ProcessPointCommand(name, parameters);
                    break;
                case "LINE":
                case "LINEA":
                    ProcessLineCommand(name, parameters);
                    break;
                case "WALL":
                case "MURO":
                case "PARED":
                    ProcessWallCommand(name, parameters);
                    break;
                case "BEAM":
                case "VIGA":
                    ProcessBeamCommand(name, parameters);
                    break;
                case "COLUMN":
                case "COLUMNA":
                    ProcessColumnCommand(name, parameters);
                    break;
                case "SLAB":
                case "LOSA":
                case "PLACA":
                    ProcessSlabCommand(name, parameters);
                    break;
                default:
                    throw new ArgumentException($"Comando desconocido: {command}");
            }
        }

        private void ProcessSetCommand(string property, string value)
        {
            switch (property.ToUpper())
            {
                case "PROJECT":
                case "PROYECTO":
                    _projectName = value.Trim('"', '\'');
                    break;
                case "AUTHOR":
                case "AUTOR":
                    _author = value.Trim('"', '\'');
                    break;
            }
        }

        private void ProcessPointCommand(string name, string parameters)
        {
            var point = ParsePoint(parameters);
            _points[name] = point;
        }

        private void ProcessLineCommand(string name, string parameters)
        {
            // LINE name = p1, p2  or  LINE name = (x1,y1,z1), (x2,y2,z2)
            var parts = SplitParameters(parameters);
            if (parts.Length != 2)
                throw new ArgumentException("LINE requiere 2 puntos");

            var p1 = ResolvePoint(parts[0]);
            var p2 = ResolvePoint(parts[1]);

            var entity = new IfcEntity
            {
                Id = _entityId++,
                Type = "IfcBeam", // Lines are represented as thin beams in IFC
                Name = name,
                StartPoint = p1,
                EndPoint = p2,
                Width = 0.01,
                Height = 0.01
            };
            _entities.Add(entity);
            _namedEntities[name] = entity;
        }

        private void ProcessWallCommand(string name, string parameters)
        {
            // WALL name = (x1,y1,z1) to (x2,y2,z2) height=H thickness=T
            var match = Regex.Match(parameters,
                @"(\([^)]+\)|\w+)\s+(?:to|a)\s+(\([^)]+\)|\w+)(?:\s+height\s*=\s*([\d.]+))?(?:\s+thickness\s*=\s*([\d.]+))?",
                RegexOptions.IgnoreCase);

            if (!match.Success)
                throw new ArgumentException("WALL sintaxis: (x1,y1,z1) to (x2,y2,z2) height=H thickness=T");

            var p1 = ResolvePoint(match.Groups[1].Value);
            var p2 = ResolvePoint(match.Groups[2].Value);
            var height = match.Groups[3].Success ? ParseDouble(match.Groups[3].Value) : 3.0;
            var thickness = match.Groups[4].Success ? ParseDouble(match.Groups[4].Value) : 0.2;

            var entity = new IfcEntity
            {
                Id = _entityId++,
                Type = "IfcWall",
                Name = name,
                StartPoint = p1,
                EndPoint = p2,
                Height = height,
                Width = thickness
            };
            _entities.Add(entity);
            _namedEntities[name] = entity;
        }

        private void ProcessBeamCommand(string name, string parameters)
        {
            // BEAM name = (x1,y1,z1) to (x2,y2,z2) section=WxH
            var match = Regex.Match(parameters,
                @"(\([^)]+\)|\w+)\s+(?:to|a)\s+(\([^)]+\)|\w+)(?:\s+section\s*=\s*([\d.]+)x([\d.]+))?",
                RegexOptions.IgnoreCase);

            if (!match.Success)
                throw new ArgumentException("BEAM sintaxis: (x1,y1,z1) to (x2,y2,z2) section=WxH");

            var p1 = ResolvePoint(match.Groups[1].Value);
            var p2 = ResolvePoint(match.Groups[2].Value);
            var width = match.Groups[3].Success ? ParseDouble(match.Groups[3].Value) : 0.3;
            var height = match.Groups[4].Success ? ParseDouble(match.Groups[4].Value) : 0.5;

            var entity = new IfcEntity
            {
                Id = _entityId++,
                Type = "IfcBeam",
                Name = name,
                StartPoint = p1,
                EndPoint = p2,
                Width = width,
                Height = height
            };
            _entities.Add(entity);
            _namedEntities[name] = entity;
        }

        private void ProcessColumnCommand(string name, string parameters)
        {
            // COLUMN name = (x,y,z1) to (x,y,z2) section=WxD or COLUMN name = (x,y,z) height=H section=WxD
            var match = Regex.Match(parameters,
                @"(\([^)]+\)|\w+)\s+(?:to|a)\s+(\([^)]+\)|\w+)(?:\s+section\s*=\s*([\d.]+)x([\d.]+))?",
                RegexOptions.IgnoreCase);

            if (!match.Success)
            {
                // Try alternate syntax: (x,y,z) height=H
                match = Regex.Match(parameters,
                    @"(\([^)]+\)|\w+)(?:\s+height\s*=\s*([\d.]+))?(?:\s+section\s*=\s*([\d.]+)x([\d.]+))?",
                    RegexOptions.IgnoreCase);

                if (match.Success)
                {
                    var basePoint = ResolvePoint(match.Groups[1].Value);
                    var colHeight = match.Groups[2].Success ? ParseDouble(match.Groups[2].Value) : 3.0;
                    var width = match.Groups[3].Success ? ParseDouble(match.Groups[3].Value) : 0.4;
                    var depth = match.Groups[4].Success ? ParseDouble(match.Groups[4].Value) : 0.4;

                    var entity = new IfcEntity
                    {
                        Id = _entityId++,
                        Type = "IfcColumn",
                        Name = name,
                        StartPoint = basePoint,
                        EndPoint = new Point3D(basePoint.X, basePoint.Y, basePoint.Z + colHeight),
                        Width = width,
                        Height = depth
                    };
                    _entities.Add(entity);
                    _namedEntities[name] = entity;
                    return;
                }
                throw new ArgumentException("COLUMN sintaxis: (x,y,z1) to (x,y,z2) section=WxD");
            }

            var p1 = ResolvePoint(match.Groups[1].Value);
            var p2 = ResolvePoint(match.Groups[2].Value);
            var w = match.Groups[3].Success ? ParseDouble(match.Groups[3].Value) : 0.4;
            var d = match.Groups[4].Success ? ParseDouble(match.Groups[4].Value) : 0.4;

            var ent = new IfcEntity
            {
                Id = _entityId++,
                Type = "IfcColumn",
                Name = name,
                StartPoint = p1,
                EndPoint = p2,
                Width = w,
                Height = d
            };
            _entities.Add(ent);
            _namedEntities[name] = ent;
        }

        private void ProcessSlabCommand(string name, string parameters)
        {
            // SLAB name = [(x1,y1,z), (x2,y2,z), ...] thickness=T
            var match = Regex.Match(parameters,
                @"\[([^\]]+)\](?:\s+thickness\s*=\s*([\d.]+))?",
                RegexOptions.IgnoreCase);

            if (!match.Success)
                throw new ArgumentException("SLAB sintaxis: [(x1,y1,z), (x2,y2,z), ...] thickness=T");

            var pointsStr = match.Groups[1].Value;
            var thickness = match.Groups[2].Success ? ParseDouble(match.Groups[2].Value) : 0.2;

            // Parse points
            var pointMatches = Regex.Matches(pointsStr, @"\([^)]+\)|\w+");
            var points = new List<Point3D>();
            foreach (Match pm in pointMatches)
            {
                points.Add(ResolvePoint(pm.Value));
            }

            if (points.Count < 3)
                throw new ArgumentException("SLAB requiere al menos 3 puntos");

            var entity = new IfcEntity
            {
                Id = _entityId++,
                Type = "IfcSlab",
                Name = name,
                Points = points,
                Height = thickness
            };
            _entities.Add(entity);
            _namedEntities[name] = entity;
        }

        private Point3D ResolvePoint(string input)
        {
            input = input.Trim();

            // Check if it's a named point
            if (_points.TryGetValue(input, out var namedPoint))
                return namedPoint;

            // Parse as coordinates
            return ParsePoint(input);
        }

        private Point3D ParsePoint(string input)
        {
            // Parse (x, y, z) or (x; y; z)
            var match = Regex.Match(input.Trim(), @"\(?\s*([-\d.]+)[,;\s]+([-\d.]+)[,;\s]+([-\d.]+)\s*\)?");
            if (!match.Success)
                throw new ArgumentException($"Formato de punto inválido: {input}");

            return new Point3D(
                ParseDouble(match.Groups[1].Value),
                ParseDouble(match.Groups[2].Value),
                ParseDouble(match.Groups[3].Value)
            );
        }

        private string[] SplitParameters(string parameters)
        {
            // Split by comma but respect parentheses
            var result = new List<string>();
            var current = new StringBuilder();
            var depth = 0;

            foreach (var c in parameters)
            {
                if (c == '(') depth++;
                else if (c == ')') depth--;
                else if (c == ',' && depth == 0)
                {
                    result.Add(current.ToString().Trim());
                    current.Clear();
                    continue;
                }
                current.Append(c);
            }
            if (current.Length > 0)
                result.Add(current.ToString().Trim());

            return result.ToArray();
        }

        private double ParseDouble(string value)
        {
            return double.Parse(value.Trim(), CultureInfo.InvariantCulture);
        }

        private string GenerateIfcFile()
        {
            var sb = new StringBuilder();
            var timestamp = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss");
            var guid = GenerateIfcGuid();

            // ISO-10303-21 header
            sb.AppendLine("ISO-10303-21;");
            sb.AppendLine("HEADER;");
            sb.AppendLine($"FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');");
            sb.AppendLine($"FILE_NAME('{_projectName}.ifc','{timestamp}',(''),(''),'Hekatan IFC Creator','Hekatan','');");
            sb.AppendLine("FILE_SCHEMA(('IFC2X3'));");
            sb.AppendLine("ENDSEC;");
            sb.AppendLine("DATA;");

            // Organization and Person
            sb.AppendLine($"#1=IFCORGANIZATION($,'{_author}',$,$,$);");
            sb.AppendLine("#2=IFCAPPLICATION(#1,'1.0','Hekatan','Hekatan');");
            sb.AppendLine("#3=IFCPERSON($,'',$,$,$,$,$,$);");
            sb.AppendLine("#4=IFCPERSONANDORGANIZATION(#3,#1,$);");
            sb.AppendLine($"#5=IFCOWNERHISTORY(#4,#2,$,.NOCHANGE.,$,$,$,{(int)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds});");

            // Units
            sb.AppendLine("#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);");
            sb.AppendLine("#7=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);");
            sb.AppendLine("#8=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);");
            sb.AppendLine("#9=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);");
            sb.AppendLine("#10=IFCUNITASSIGNMENT((#6,#7,#8,#9));");

            // Geometric representation context
            sb.AppendLine("#11=IFCDIRECTION((1.,0.,0.));");
            sb.AppendLine("#12=IFCDIRECTION((0.,0.,1.));");
            sb.AppendLine("#13=IFCCARTESIANPOINT((0.,0.,0.));");
            sb.AppendLine("#14=IFCAXIS2PLACEMENT3D(#13,#12,#11);");
            sb.AppendLine("#15=IFCDIRECTION((0.,1.));");
            sb.AppendLine("#16=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#14,#15);");
            sb.AppendLine("#17=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#16,$,.MODEL_VIEW.,$);");

            // Project
            sb.AppendLine($"#20=IFCPROJECT('{GenerateIfcGuid()}',#5,'{_projectName}',$,$,$,$,(#16),#10);");

            // Site, Building, Storey
            sb.AppendLine($"#21=IFCSITE('{GenerateIfcGuid()}',#5,'Site',$,$,#14,$,$,.ELEMENT.,$,$,$,$,$);");
            sb.AppendLine($"#22=IFCBUILDING('{GenerateIfcGuid()}',#5,'Building',$,$,#14,$,$,.ELEMENT.,$,$,$);");
            sb.AppendLine($"#23=IFCBUILDINGSTOREY('{GenerateIfcGuid()}',#5,'Ground Floor',$,$,#14,$,$,.ELEMENT.,0.);");

            // Relationships
            sb.AppendLine($"#24=IFCRELAGGREGATES('{GenerateIfcGuid()}',#5,$,$,#20,(#21));");
            sb.AppendLine($"#25=IFCRELAGGREGATES('{GenerateIfcGuid()}',#5,$,$,#21,(#22));");
            sb.AppendLine($"#26=IFCRELAGGREGATES('{GenerateIfcGuid()}',#5,$,$,#22,(#23));");

            // Generate entities
            int nextId = 30;
            var productIds = new List<int>();

            foreach (var entity in _entities)
            {
                var (entityStr, prodId, usedIds) = GenerateIfcEntity(entity, nextId);
                sb.Append(entityStr);
                productIds.Add(prodId);
                nextId = usedIds;
            }

            // Contain products in storey
            if (productIds.Count > 0)
            {
                var prodList = string.Join(",", productIds.Select(id => $"#{id}"));
                sb.AppendLine($"#{nextId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('{GenerateIfcGuid()}',#5,$,$,({prodList}),#23);");
            }

            sb.AppendLine("ENDSEC;");
            sb.AppendLine("END-ISO-10303-21;");

            return sb.ToString();
        }

        private (string content, int productId, int nextId) GenerateIfcEntity(IfcEntity entity, int startId)
        {
            var sb = new StringBuilder();
            int id = startId;

            switch (entity.Type)
            {
                case "IfcWall":
                    return GenerateWall(entity, id);
                case "IfcBeam":
                    return GenerateBeam(entity, id);
                case "IfcColumn":
                    return GenerateColumn(entity, id);
                case "IfcSlab":
                    return GenerateSlab(entity, id);
                default:
                    return ("", id, id);
            }
        }

        private (string content, int productId, int nextId) GenerateWall(IfcEntity entity, int id)
        {
            var sb = new StringBuilder();

            // Calculate wall direction and length
            var dx = entity.EndPoint.X - entity.StartPoint.X;
            var dy = entity.EndPoint.Y - entity.StartPoint.Y;
            var length = Math.Sqrt(dx * dx + dy * dy);
            var angle = Math.Atan2(dy, dx);

            // Local placement
            sb.AppendLine($"#{id}=IFCCARTESIANPOINT(({F(entity.StartPoint.X)},{F(entity.StartPoint.Y)},{F(entity.StartPoint.Z)}));");
            sb.AppendLine($"#{id+1}=IFCDIRECTION(({F(Math.Cos(angle))},{F(Math.Sin(angle))},0.));");
            sb.AppendLine($"#{id+2}=IFCDIRECTION((0.,0.,1.));");
            sb.AppendLine($"#{id+3}=IFCAXIS2PLACEMENT3D(#{id},#{id+2},#{id+1});");
            sb.AppendLine($"#{id+4}=IFCLOCALPLACEMENT($,#{id+3});");

            // Profile (rectangle)
            sb.AppendLine($"#{id+5}=IFCCARTESIANPOINT((0.,0.));");
            sb.AppendLine($"#{id+6}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#{id+5},{F(length)},{F(entity.Width)});");

            // Extrusion direction and solid
            sb.AppendLine($"#{id+7}=IFCDIRECTION((0.,0.,1.));");
            sb.AppendLine($"#{id+8}=IFCEXTRUDEDAREASOLID(#{id+6},#14,#{id+7},{F(entity.Height)});");

            // Shape representation
            sb.AppendLine($"#{id+9}=IFCSHAPEREPRESENTATION(#17,'Body','SweptSolid',(#{id+8}));");
            sb.AppendLine($"#{id+10}=IFCPRODUCTDEFINITIONSHAPE($,$,(#{id+9}));");

            // Wall entity
            int wallId = id + 11;
            sb.AppendLine($"#{wallId}=IFCWALLSTANDARDCASE('{GenerateIfcGuid()}',#5,'{entity.Name}',$,$,#{id+4},#{id+10},$);");

            return (sb.ToString(), wallId, id + 12);
        }

        private (string content, int productId, int nextId) GenerateBeam(IfcEntity entity, int id)
        {
            var sb = new StringBuilder();

            // Calculate beam direction and length
            var dx = entity.EndPoint.X - entity.StartPoint.X;
            var dy = entity.EndPoint.Y - entity.StartPoint.Y;
            var dz = entity.EndPoint.Z - entity.StartPoint.Z;
            var length = Math.Sqrt(dx * dx + dy * dy + dz * dz);

            // Normalize direction
            var nx = dx / length;
            var ny = dy / length;
            var nz = dz / length;

            // Local placement
            sb.AppendLine($"#{id}=IFCCARTESIANPOINT(({F(entity.StartPoint.X)},{F(entity.StartPoint.Y)},{F(entity.StartPoint.Z)}));");
            sb.AppendLine($"#{id+1}=IFCDIRECTION(({F(nx)},{F(ny)},{F(nz)}));");

            // Calculate perpendicular direction for local Y axis
            var perpX = -ny;
            var perpY = nx;
            var perpZ = 0.0;
            if (Math.Abs(perpX) < 0.001 && Math.Abs(perpY) < 0.001)
            {
                perpX = 1.0;
                perpY = 0.0;
            }
            sb.AppendLine($"#{id+2}=IFCDIRECTION(({F(perpX)},{F(perpY)},{F(perpZ)}));");
            sb.AppendLine($"#{id+3}=IFCAXIS2PLACEMENT3D(#{id},#{id+1},#{id+2});");
            sb.AppendLine($"#{id+4}=IFCLOCALPLACEMENT($,#{id+3});");

            // Profile (rectangle)
            sb.AppendLine($"#{id+5}=IFCCARTESIANPOINT((0.,0.));");
            sb.AppendLine($"#{id+6}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#{id+5},{F(entity.Width)},{F(entity.Height)});");

            // Extrusion
            sb.AppendLine($"#{id+7}=IFCDIRECTION((0.,0.,1.));");
            sb.AppendLine($"#{id+8}=IFCEXTRUDEDAREASOLID(#{id+6},#14,#{id+7},{F(length)});");

            // Shape representation
            sb.AppendLine($"#{id+9}=IFCSHAPEREPRESENTATION(#17,'Body','SweptSolid',(#{id+8}));");
            sb.AppendLine($"#{id+10}=IFCPRODUCTDEFINITIONSHAPE($,$,(#{id+9}));");

            // Beam entity
            int beamId = id + 11;
            sb.AppendLine($"#{beamId}=IFCBEAM('{GenerateIfcGuid()}',#5,'{entity.Name}',$,$,#{id+4},#{id+10},$);");

            return (sb.ToString(), beamId, id + 12);
        }

        private (string content, int productId, int nextId) GenerateColumn(IfcEntity entity, int id)
        {
            var sb = new StringBuilder();

            // Calculate column height
            var height = entity.EndPoint.Z - entity.StartPoint.Z;
            if (height < 0.001) height = 3.0;

            // Local placement
            sb.AppendLine($"#{id}=IFCCARTESIANPOINT(({F(entity.StartPoint.X)},{F(entity.StartPoint.Y)},{F(entity.StartPoint.Z)}));");
            sb.AppendLine($"#{id+1}=IFCDIRECTION((0.,0.,1.));");
            sb.AppendLine($"#{id+2}=IFCDIRECTION((1.,0.,0.));");
            sb.AppendLine($"#{id+3}=IFCAXIS2PLACEMENT3D(#{id},#{id+1},#{id+2});");
            sb.AppendLine($"#{id+4}=IFCLOCALPLACEMENT($,#{id+3});");

            // Profile (rectangle)
            sb.AppendLine($"#{id+5}=IFCCARTESIANPOINT((0.,0.));");
            sb.AppendLine($"#{id+6}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#{id+5},{F(entity.Width)},{F(entity.Height)});");

            // Extrusion
            sb.AppendLine($"#{id+7}=IFCDIRECTION((0.,0.,1.));");
            sb.AppendLine($"#{id+8}=IFCEXTRUDEDAREASOLID(#{id+6},#14,#{id+7},{F(height)});");

            // Shape representation
            sb.AppendLine($"#{id+9}=IFCSHAPEREPRESENTATION(#17,'Body','SweptSolid',(#{id+8}));");
            sb.AppendLine($"#{id+10}=IFCPRODUCTDEFINITIONSHAPE($,$,(#{id+9}));");

            // Column entity
            int colId = id + 11;
            sb.AppendLine($"#{colId}=IFCCOLUMN('{GenerateIfcGuid()}',#5,'{entity.Name}',$,$,#{id+4},#{id+10},$);");

            return (sb.ToString(), colId, id + 12);
        }

        private (string content, int productId, int nextId) GenerateSlab(IfcEntity entity, int id)
        {
            var sb = new StringBuilder();

            if (entity.Points == null || entity.Points.Count < 3)
                return ("", id, id);

            // Use first point's Z as the slab elevation
            var z = entity.Points[0].Z;

            // Local placement
            sb.AppendLine($"#{id}=IFCCARTESIANPOINT((0.,0.,{F(z)}));");
            sb.AppendLine($"#{id+1}=IFCDIRECTION((0.,0.,1.));");
            sb.AppendLine($"#{id+2}=IFCDIRECTION((1.,0.,0.));");
            sb.AppendLine($"#{id+3}=IFCAXIS2PLACEMENT3D(#{id},#{id+1},#{id+2});");
            sb.AppendLine($"#{id+4}=IFCLOCALPLACEMENT($,#{id+3});");

            // Create polyline for profile
            var pointIds = new List<int>();
            int nextPtId = id + 5;
            foreach (var pt in entity.Points)
            {
                sb.AppendLine($"#{nextPtId}=IFCCARTESIANPOINT(({F(pt.X)},{F(pt.Y)}));");
                pointIds.Add(nextPtId);
                nextPtId++;
            }
            // Close the loop
            pointIds.Add(pointIds[0]);

            var pointList = string.Join(",", pointIds.Select(pid => $"#{pid}"));
            sb.AppendLine($"#{nextPtId}=IFCPOLYLINE(({pointList}));");
            int polylineId = nextPtId++;

            // Profile
            sb.AppendLine($"#{nextPtId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#{polylineId});");
            int profileId = nextPtId++;

            // Extrusion (negative Z direction for thickness below)
            sb.AppendLine($"#{nextPtId}=IFCDIRECTION((0.,0.,-1.));");
            int extDirId = nextPtId++;

            sb.AppendLine($"#{nextPtId}=IFCEXTRUDEDAREASOLID(#{profileId},#14,#{extDirId},{F(entity.Height)});");
            int solidId = nextPtId++;

            // Shape representation
            sb.AppendLine($"#{nextPtId}=IFCSHAPEREPRESENTATION(#17,'Body','SweptSolid',(#{solidId}));");
            int shapeRepId = nextPtId++;

            sb.AppendLine($"#{nextPtId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#{shapeRepId}));");
            int prodDefId = nextPtId++;

            // Slab entity
            int slabId = nextPtId++;
            sb.AppendLine($"#{slabId}=IFCSLAB('{GenerateIfcGuid()}',#5,'{entity.Name}',$,$,#{id+4},#{prodDefId},$,.FLOOR.);");

            return (sb.ToString(), slabId, slabId + 1);
        }

        private string F(double value)
        {
            return value.ToString("F6", CultureInfo.InvariantCulture).TrimEnd('0').TrimEnd('.');
        }

        private string GenerateIfcGuid()
        {
            // IFC uses a base64-like encoding for GUIDs
            var guid = Guid.NewGuid();
            var bytes = guid.ToByteArray();

            const string chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
            var result = new char[22];

            int n = 0;
            for (int i = 0; i < 16; i += 3)
            {
                int val;
                if (i + 2 < 16)
                    val = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
                else if (i + 1 < 16)
                    val = (bytes[i] << 16) | (bytes[i + 1] << 8);
                else
                    val = bytes[i] << 16;

                for (int j = 0; j < 4 && n < 22; j++)
                {
                    result[n++] = chars[(val >> (18 - j * 6)) & 0x3F];
                }
            }

            return new string(result);
        }

        private class IfcEntity
        {
            public int Id { get; set; }
            public string Type { get; set; }
            public string Name { get; set; }
            public Point3D StartPoint { get; set; }
            public Point3D EndPoint { get; set; }
            public List<Point3D> Points { get; set; }
            public double Width { get; set; }
            public double Height { get; set; }
        }

        private struct Point3D
        {
            public double X { get; }
            public double Y { get; }
            public double Z { get; }

            public Point3D(double x, double y, double z)
            {
                X = x;
                Y = y;
                Z = z;
            }
        }
    }
}
