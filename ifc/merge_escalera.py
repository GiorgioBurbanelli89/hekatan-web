"""
Merge escalera IFC into vivienda base IFC.
- Base: metres
- Escalera: millimetres → scale ×0.001
- Skip project/unit/site/building entities from escalera
- Renumber IDs
- Redirect root placements to building placement of base
"""
import re, sys

BASE = r"C:\Users\j-b-j\Documents\Calcpad-7.5.7\ifc\vivienda Silvia sin escalera.ifc"
ESCALERA = r"C:\Users\j-b-j\Documents\Calcpad-7.5.7\ifc\Silvia_Cedeno_escalera.ifc"
OUTPUT = r"C:\Users\j-b-j\Documents\Calcpad-7.5.7\ifc\vivienda_Silvia_con_escalera.ifc"

SCALE = 0.001  # mm to m

# IFC types to SKIP from escalera (project-level stuff)
SKIP_TYPES = [
    'IFCPROJECT', 'IFCUNITASSIGNMENT', 'IFCSIUNIT', 'IFCMEASUREWITHUNIT',
    'IFCDIMENSIONALEXPONENTS', 'IFCCONVERSIONBASEDUNIT', 'IFCMONETARYUNIT',
    'IFCDERIVEDUNIT', 'IFCDERIVEDUNITELEMENT', 'IFCGEOMETRICREPRESENTATIONCONTEXT',
    'IFCOWNERHISTORY', 'IFCPERSON', 'IFCORGANIZATION', 'IFCPERSONANDORGANIZATION',
    'IFCAPPLICATION', 'IFCACTORROLE', 'IFCPOSTALADDRESS', 'IFCSITE',
    'IFCBUILDING', 'IFCRELAGGREGATES',
]

# IDs in escalera that are project-level (from analysis: #1 to #78, #85, #94, #97, #103, #109, #118, #120, #122)
# We'll skip all lines whose IFC type matches SKIP_TYPES

def parse_id(line):
    """Extract #ID from a line like '#123= IFCWALL(...);'"""
    m = re.match(r'#(\d+)\s*=', line)
    return int(m.group(1)) if m else None

def parse_type(line):
    """Extract IFC type from line"""
    m = re.match(r'#\d+\s*=\s*(\w+)\s*\(', line)
    return m.group(1).upper() if m else None

def scale_cartesian_points(line, scale):
    """Scale IFCCARTESIANPOINT coordinates by scale factor"""
    def replacer(match):
        coords = match.group(1)
        parts = coords.split(',')
        scaled = []
        for p in parts:
            p = p.strip()
            try:
                v = float(p)
                v *= scale
                # Clean up representation
                if v == 0.0:
                    scaled.append('0.')
                elif v == int(v) and abs(v) < 1e10:
                    scaled.append(f'{int(v)}.')
                else:
                    scaled.append(f'{v}')
            except:
                scaled.append(p)
        return f'IFCCARTESIANPOINT(({",".join(scaled)}))'
    return re.sub(r'IFCCARTESIANPOINT\s*\(\s*\(([^)]+)\)\s*\)', replacer, line)

def scale_length_measures(line, scale):
    """Scale IFCPOSITIVELENGTHMEASURE and similar"""
    # IFCPOSITIVELENGTHMEASURE(350.) → IFCPOSITIVELENGTHMEASURE(0.35)
    def replacer(match):
        prefix = match.group(1)
        val = float(match.group(2))
        val *= scale
        return f'{prefix}({val})'
    line = re.sub(r'(IFCPOSITIVELENGTHMEASURE)\s*\(\s*([0-9.eE+-]+)\s*\)', replacer, line)
    line = re.sub(r'(IFCLENGTHMEASURE)\s*\(\s*([0-9.eE+-]+)\s*\)', replacer, line)
    # Elevation values in IFCBUILDINGSTOREY
    # handled by scaling cartesian points in placements
    return line

def scale_area_volume(line, scale):
    """Scale area (scale²) and volume (scale³) measures"""
    def area_rep(match):
        val = float(match.group(1))
        val *= scale * scale
        return f'IFCAREAMEASURE({val})'
    def vol_rep(match):
        val = float(match.group(1))
        val *= scale * scale * scale
        return f'IFCVOLUMEMEASURE({val})'
    line = re.sub(r'IFCAREAMEASURE\s*\(\s*([0-9.eE+-]+)\s*\)', area_rep, line)
    line = re.sub(r'IFCVOLUMEMEASURE\s*\(\s*([0-9.eE+-]+)\s*\)', vol_rep, line)
    return line

def scale_storey_elevation(line, scale):
    """Scale elevation value in IFCBUILDINGSTOREY"""
    # IFCBUILDINGSTOREY('guid',#ref,'name',...,.ELEMENT.,-800.);
    # The last number before ); is the elevation
    if 'IFCBUILDINGSTOREY' not in line:
        return line
    m = re.match(r'(.*\.ELEMENT\.\s*,\s*)([0-9.eE+-]+)(\s*\)\s*;)', line)
    if m:
        elev = float(m.group(2))
        elev *= scale
        return f'{m.group(1)}{elev}{m.group(3)}'
    return line

def scale_rectangle_profile(line, scale):
    """Scale IFCRECTANGLEPROFILEDEF dimensions"""
    if 'IFCRECTANGLEPROFILEDEF' not in line:
        return line
    # Pattern: IFCRECTANGLEPROFILEDEF(.AREA.,'name',#ref,XDim,YDim);
    def replacer(match):
        prefix = match.group(1)
        xd = float(match.group(2)) * scale
        yd = float(match.group(3)) * scale
        suffix = match.group(4)
        return f'{prefix}{xd},{yd}{suffix}'
    return re.sub(
        r'(IFCRECTANGLEPROFILEDEF\s*\([^,]+,[^,]+,#\d+\s*,\s*)([0-9.eE+-]+)\s*,\s*([0-9.eE+-]+)(\s*\)\s*;)',
        replacer, line
    )

def scale_extrusion_depth(line, scale):
    """Scale IFCEXTRUDEDAREASOLID depth"""
    if 'IFCEXTRUDEDAREASOLID' not in line:
        return line
    # IFCEXTRUDEDAREASOLID(#profile,#placement,#direction,Depth);
    def replacer(match):
        prefix = match.group(1)
        depth = float(match.group(2)) * scale
        return f'{prefix}{depth});'
    return re.sub(
        r'(IFCEXTRUDEDAREASOLID\s*\([^)]*,\s*)([0-9.eE+-]+)\s*\)\s*;',
        replacer, line
    )

print("Reading base IFC...")
with open(BASE, 'r', encoding='utf-8', errors='replace') as f:
    base_lines = f.readlines()

print("Reading escalera IFC...")
with open(ESCALERA, 'r', encoding='utf-8', errors='replace') as f:
    esc_lines = f.readlines()

# Find max ID in base
max_base_id = 0
for line in base_lines:
    m = re.match(r'#(\d+)\s*=', line.strip())
    if m:
        max_base_id = max(max_base_id, int(m.group(1)))
print(f"Base max ID: #{max_base_id}")

# Extract DATA lines from escalera
esc_data = []
in_data = False
for line in esc_lines:
    stripped = line.strip()
    if stripped == 'DATA;':
        in_data = True
        continue
    if stripped == 'ENDSEC;' and in_data:
        break
    if in_data and stripped.startswith('#'):
        esc_data.append(stripped)

print(f"Escalera data lines: {len(esc_data)}")

# Collect IDs to skip and IDs to keep
skip_ids = set()
keep_lines = []
for line in esc_data:
    ifc_type = parse_type(line)
    line_id = parse_id(line)
    if ifc_type and ifc_type in SKIP_TYPES:
        if line_id:
            skip_ids.add(line_id)
        continue
    keep_lines.append(line)

print(f"Skipped {len(skip_ids)} project-level entities, keeping {len(keep_lines)} entities")

# Also skip IFCRELAGGREGATES that references project structure
# And skip the IFCGEOMETRICREPRESENTATIONSUBCONTEXT (it references base context)
final_lines = []
for line in keep_lines:
    ifc_type = parse_type(line)
    # Skip geometric representation subcontext (references project context)
    if ifc_type == 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT':
        lid = parse_id(line)
        if lid: skip_ids.add(lid)
        continue
    final_lines.append(line)

keep_lines = final_lines
print(f"After filtering subcontext: {len(keep_lines)} entities")

# Build ID mapping: old_id → new_id
id_offset = max_base_id + 10  # leave some room
old_ids = []
for line in keep_lines:
    lid = parse_id(line)
    if lid:
        old_ids.append(lid)

id_map = {}
next_id = id_offset
for old_id in old_ids:
    id_map[old_id] = next_id
    next_id += 1

print(f"ID mapping: {len(id_map)} entities, new range #{id_offset} to #{next_id-1}")

# Find the IFCGEOMETRICREPRESENTATIONSUBCONTEXT in the BASE for 'Body'/'Model'
# We need to map escalera's subcontext references to the base one
base_body_subctx = None
for line in base_lines:
    stripped = line.strip()
    if 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT' in stripped and "'Body'" in stripped:
        m = re.match(r'#(\d+)\s*=', stripped)
        if m:
            base_body_subctx = int(m.group(1))
            break

print(f"Base Body subcontext: #{base_body_subctx}")

# Find the escalera's IFCGEOMETRICREPRESENTATIONSUBCONTEXT ID
esc_body_subctx = None
for line in esc_data:
    if 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT' in line and "'Body'" in line:
        m = re.match(r'#(\d+)\s*=', line)
        if m:
            esc_body_subctx = int(m.group(1))
            break

print(f"Escalera Body subcontext: #{esc_body_subctx}")

# Find base IFCOWNERHISTORY
base_owner_history = None
for line in base_lines:
    stripped = line.strip()
    if 'IFCOWNERHISTORY' in stripped:
        m = re.match(r'#(\d+)\s*=', stripped)
        if m:
            base_owner_history = int(m.group(1))
            break

print(f"Base OwnerHistory: #{base_owner_history}")

# Find escalera's IFCOWNERHISTORY
esc_owner_history = 19  # from the file analysis

# Find base building storey that matches "BASE" or "Contrapiso" (elevation ~0.15-0.2m)
# The escalera's "Planta Baja" is at 200mm = 0.2m → maps to "Contrapiso" (0.2m)
base_contrapiso_placement = None
for line in base_lines:
    stripped = line.strip()
    if 'IFCBUILDINGSTOREY' in stripped and "'Contrapiso'" in stripped:
        # Get its placement reference
        m = re.match(r'#(\d+)\s*=\s*IFCBUILDINGSTOREY\s*\([^,]+,\s*#\d+\s*,[^,]+,[^,]+,[^,]+,\s*#(\d+)', stripped)
        if m:
            base_contrapiso_placement = int(m.group(2))
            break

print(f"Base Contrapiso placement: #{base_contrapiso_placement}")

# Now remap IDs and apply scaling
def remap_refs(line, id_map, special_maps=None):
    """Replace #NNN references with new IDs"""
    if special_maps is None:
        special_maps = {}
    def replacer(match):
        old_id = int(match.group(1))
        if old_id in special_maps:
            return f'#{special_maps[old_id]}'
        if old_id in id_map:
            return f'#{id_map[old_id]}'
        # Reference to skipped entity - need special handling
        return match.group(0)
    return re.sub(r'#(\d+)', replacer, line)

# Special mappings for cross-references
special = {}
# Map escalera's owner history -> base's
special[esc_owner_history] = base_owner_history
# Map escalera's body subcontext -> base's
if esc_body_subctx and base_body_subctx:
    special[esc_body_subctx] = base_body_subctx

# Map escalera's site placement (#94) and building placement (#118) -> base building (#32)
# Find base building placement
base_building_placement = None
for line in base_lines:
    stripped = line.strip()
    if 'IFCBUILDING' in stripped and 'IFCBUILDINGSTOREY' not in stripped:
        m = re.match(r"#\d+\s*=\s*IFCBUILDING\s*\([^,]+,\s*#\d+\s*,[^,]+,[^,]+,[^,]+,\s*#(\d+)", stripped)
        if m:
            base_building_placement = int(m.group(1))
            break

print(f"Base building placement: #{base_building_placement}")

# Escalera site placement = #94, building placement = #118
special[94] = base_building_placement   # site -> base building
special[118] = base_building_placement  # building -> base building

# Map escalera's building storey placements to base's
# Escalera storeys: Cimentación(-800mm), Exterior(0), Planta Baja(200mm), Planta Alta(3620mm), Planta Cubierta(7680mm)
# Base storeys: Z2(-1.85m), Z(-0.85m), Suelo N.(-0.4m), BASE(0.15m), Contrapiso(0.2m), NIVEL1(3.62m), CUB1(6.48m)
# Map: Cimentación → Z(-0.85), Planta Baja → Contrapiso(0.2), Planta Alta → NIVEL1(3.62)

# Find base storey placements
base_storeys = {}
for line in base_lines:
    stripped = line.strip()
    if 'IFCBUILDINGSTOREY' in stripped:
        m = re.match(r"#(\d+)\s*=\s*IFCBUILDINGSTOREY\s*\([^,]+,\s*#\d+\s*,\s*'([^']*)'", stripped)
        if m:
            name = m.group(2)
            # Get placement ref
            m2 = re.match(r"#\d+\s*=\s*IFCBUILDINGSTOREY\s*\([^,]+,\s*#\d+\s*,[^,]+,[^,]+,[^,]+,\s*#(\d+)", stripped)
            if m2:
                base_storeys[name] = int(m2.group(1))

print(f"Base storeys: {base_storeys}")

# Find escalera storey IDs and their placement IDs
esc_storeys = {}
for line in esc_data:
    if 'IFCBUILDINGSTOREY' in line:
        m = re.match(r"#(\d+)\s*=\s*IFCBUILDINGSTOREY\s*\([^,]+,\s*#\d+\s*,\s*'([^']*)'", line)
        if m:
            name = m.group(2)
            storey_id = int(m.group(1))
            # Get placement
            m2 = re.match(r"#\d+\s*=\s*IFCBUILDINGSTOREY\s*\([^,]+,\s*#\d+\s*,[^,]+,[^,]+,[^,]+,\s*#(\d+)", line)
            if m2:
                esc_storeys[name] = {'id': storey_id, 'placement': int(m2.group(1))}

print(f"Escalera storeys: {esc_storeys}")

# Skip IFCBUILDINGSTOREY lines from escalera (use base storeys instead)
# Also skip their IFCRELAGGREGATES
# And map their placement IDs
storey_map = {
    'Cimentacin': 'Z',          # -800mm -> -0.85m (IFC encoding removes o-accent -> "Cimentacin")
    'Exterior': 'Suelo N.',     # 0mm -> -0.4m
    'Planta Baja': 'Contrapiso', # 200mm -> 0.2m (exact match!)
    'Planta Alta': 'NIVEL 1',    # 3620mm -> 3.62m (exact match!)
    'Planta Cubierta': 'CUB1',  # 7680mm -> 6.48m (close enough)
}

def normalize_ifc_name(name):
    """Remove IFC encoding like \\X2\\00F3\\X0\\ and trailing spaces"""
    name = re.sub(r'\\X2\\[0-9A-Fa-f]{4}\\X0\\', '', name)
    name = name.strip()
    return name

# Map escalera storey placements → base storey placements
# Normalize escalera storey names for matching
esc_storeys_normalized = {}
for raw_name, info in esc_storeys.items():
    norm = normalize_ifc_name(raw_name)
    esc_storeys_normalized[norm] = info

print(f"Escalera storeys (normalized): {list(esc_storeys_normalized.keys())}")

for esc_name, base_name in storey_map.items():
    if esc_name in esc_storeys_normalized and base_name in base_storeys:
        esc_pl = esc_storeys_normalized[esc_name]['placement']
        base_pl = base_storeys[base_name]
        special[esc_pl] = base_pl
        skip_ids.add(esc_storeys_normalized[esc_name]['id'])
        print(f"  Map storey '{esc_name}' placement #{esc_pl} -> base '{base_name}' #{base_pl}")

# Also skip the placement entities for storeys (they reference building)
# These are IFCLOCALPLACEMENT that parent to building placement
# We already have them in skip_ids from the storey entity skip

# Re-filter keeping lines to remove storey entities
final_keep = []
for line in keep_lines:
    lid = parse_id(line)
    ifc_type = parse_type(line)
    if lid and lid in skip_ids:
        continue
    # Skip IFCBUILDINGSTOREY
    if ifc_type == 'IFCBUILDINGSTOREY':
        lid = parse_id(line)
        if lid: skip_ids.add(lid)
        continue
    final_keep.append(line)

keep_lines = final_keep
print(f"After removing storeys: {len(keep_lines)} entities")

# Rebuild id_map with only kept entities
id_map = {}
next_id = id_offset
for line in keep_lines:
    lid = parse_id(line)
    if lid:
        id_map[lid] = next_id
        next_id += 1

# Now process each line: remap IDs, scale coordinates
new_entities = []
for line in keep_lines:
    # Remap references
    new_line = remap_refs(line, id_map, special)

    # Scale cartesian points (mm → m)
    new_line = scale_cartesian_points(new_line, SCALE)

    # Scale length measures
    new_line = scale_length_measures(new_line, SCALE)

    # Scale area/volume
    new_line = scale_area_volume(new_line, SCALE)

    # Scale storey elevations
    new_line = scale_storey_elevation(new_line, SCALE)

    # Scale rectangle profiles
    new_line = scale_rectangle_profile(new_line, SCALE)

    # Scale extrusion depths
    new_line = scale_extrusion_depth(new_line, SCALE)

    # Update the ID number
    lid = parse_id(line)
    if lid and lid in id_map:
        new_line = re.sub(r'^#\d+', f'#{id_map[lid]}', new_line)

    # Redirect root placements ($) to base building placement
    if 'IFCLOCALPLACEMENT' in new_line and re.search(r'IFCLOCALPLACEMENT\s*\(\s*\$\s*,', new_line):
        new_line = re.sub(
            r'IFCLOCALPLACEMENT\s*\(\s*\$\s*,',
            f'IFCLOCALPLACEMENT(#{base_building_placement},',
            new_line
        )

    new_entities.append(new_line)

print(f"Processed {len(new_entities)} entities")

# Now we need to add IFCRELCONTAINEDINSPATIALSTRUCTURE to assign
# escalera elements to the correct base storeys
# Find which elements were contained in each escalera storey
esc_rel_contained = {}
for line in esc_data:
    if 'IFCRELCONTAINEDINSPATIALSTRUCTURE' in line:
        # Pattern: IFCRELCONTAINEDINSPATIALSTRUCTURE('guid',#owner,'name',$,(#el1,#el2,...),#storey);
        m = re.search(r'\(\s*((?:#\d+\s*,?\s*)+)\s*\)\s*,\s*#(\d+)\s*\)\s*;', line)
        if m:
            elements_str = m.group(1)
            storey_ref = int(m.group(2))
            elements = [int(x) for x in re.findall(r'#(\d+)', elements_str)]
            esc_rel_contained[storey_ref] = elements

# Create new IFCRELCONTAINEDINSPATIALSTRUCTURE for base storeys
import uuid

def ifc_guid():
    """Generate a simple IFC GUID-like string"""
    chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
    u = uuid.uuid4().int
    result = []
    for _ in range(22):
        result.append(chars[u % 64])
        u //= 64
    return ''.join(result)

# Find base IFCRELCONTAINEDINSPATIALSTRUCTURE for each storey
# We'll add elements to existing containers
base_rel_contained = {}
for line in base_lines:
    stripped = line.strip()
    if 'IFCRELCONTAINEDINSPATIALSTRUCTURE' in stripped:
        # Find which storey it references
        m = re.search(r',\s*#(\d+)\s*\)\s*;', stripped)
        if m:
            storey_id = int(m.group(1))
            base_rel_contained[storey_id] = stripped

# Map escalera elements to base storeys and create new rel entries
new_rels = []
for esc_storey_id, elements in esc_rel_contained.items():
    # Find which escalera storey name this is
    esc_storey_name = None
    for name, info in esc_storeys_normalized.items():
        if info['id'] == esc_storey_id:
            esc_storey_name = name
            break

    if esc_storey_name and esc_storey_name in storey_map:
        base_storey_name = storey_map[esc_storey_name]
        # Get base storey ID
        base_storey_id = None
        for line in base_lines:
            stripped = line.strip()
            if 'IFCBUILDINGSTOREY' in stripped and f"'{base_storey_name}'" in stripped:
                m = re.match(r'#(\d+)', stripped)
                if m:
                    base_storey_id = int(m.group(1))
                    break

        if base_storey_id:
            # Remap element IDs
            mapped_elements = []
            for el_id in elements:
                if el_id in id_map:
                    mapped_elements.append(f'#{id_map[el_id]}')
                elif el_id in skip_ids:
                    continue  # skipped entity
                else:
                    mapped_elements.append(f'#{el_id}')  # shouldn't happen

            if mapped_elements:
                guid = ifc_guid()
                rel_id = next_id
                next_id += 1
                rel_line = f"#{rel_id}=IFCRELCONTAINEDINSPATIALSTRUCTURE('{guid}',#{base_owner_history},'Escalera elements',$,({','.join(mapped_elements)}),#{base_storey_id});"
                new_rels.append(rel_line)
                print(f"  Assigned {len(mapped_elements)} elements to '{base_storey_name}' (#{base_storey_id})")

# Also handle elements that reference storey placements directly via IFCLOCALPLACEMENT
# These need their parent placement redirected to the base storey placement
# This is already handled by the special mapping above

# Combine all new lines
all_new = new_entities + new_rels
print(f"\nTotal new entities: {len(all_new)}")

# Find ENDSEC in base and insert before it
print("Writing output file...")
with open(OUTPUT, 'w', encoding='utf-8') as f:
    for i, line in enumerate(base_lines):
        stripped = line.strip()
        # Insert new entities before the last ENDSEC (end of DATA)
        if stripped == 'ENDSEC;' and i > 100:  # not the HEADER endsec
            f.write(f"/* === ESCALERA MERGE ({len(all_new)} entities, scaled mm->m) === */\n")
            for new_line in all_new:
                f.write(new_line + '\n')
            f.write(f"/* === END ESCALERA MERGE === */\n")
        f.write(line)

print(f"\nDone! Output: {OUTPUT}")
print(f"Base entities: {max_base_id}")
print(f"New entities: {len(all_new)} (#{id_offset} to #{next_id-1})")
