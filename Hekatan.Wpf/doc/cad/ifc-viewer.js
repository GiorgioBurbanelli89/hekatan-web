// ===================== IFC-VIEWER.JS - Layer 8 =====================
// IFC file loading, parsing, 3D rendering into existing Three.js scene.
// Exposes window.ifc API for CLI commands.
"use strict";

import * as S from './state.js';
import { set, callbacks } from './state.js';
import { switchTo3D } from './three-view.js';
import { canvasArea } from './dom.js';

// ── IFC State ──
var ifcModel = null;        // { group, metadata, entities, typeIndex, fileName, fileSize }
var ifcTypeVisibility = {};  // { IFCWALL: true, IFCBEAM: false, ... }
var ifcMeshes = {};          // { IFCWALL: [mesh1, mesh2], ... }

// ── IFC Text Parser (ISO-10303-21) ──
function parseIfcText(text){
    var meta = { schema: "", project: "", author: "", org: "", desc: "", timestamp: "" };
    var entities = {};
    var typeIndex = {};

    // Header parsing
    var schemaM = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i);
    if(schemaM) meta.schema = schemaM[1];

    var nameM = text.match(/FILE_NAME\s*\(\s*'([^']*)'\s*,\s*'([^']*)'/i);
    if(nameM){ meta.timestamp = nameM[2]; }

    var descM = text.match(/FILE_DESCRIPTION\s*\(\s*\(([^)]*)\)/i);
    if(descM) meta.desc = descM[1].replace(/'/g,"").trim();

    // Entity parsing
    var entRe = /^#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)\s*\((.*)\)\s*;\s*$/gm;
    var m;
    while((m = entRe.exec(text)) !== null){
        var id = parseInt(m[1]);
        var type = m[2].toUpperCase();
        var args = m[3];
        entities[id] = { id:id, type:type, args:args };
        if(!typeIndex[type]) typeIndex[type] = [];
        typeIndex[type].push(id);
    }

    // Extract metadata from entities
    if(typeIndex["IFCPROJECT"]){
        var pe = entities[typeIndex["IFCPROJECT"][0]];
        if(pe){ var n = extractField(pe.args, 2); if(n && n !== "$") meta.project = n; }
    }
    if(typeIndex["IFCORGANIZATION"]){
        var oe = entities[typeIndex["IFCORGANIZATION"][0]];
        if(oe){ var n = extractField(oe.args, 1); if(n && n !== "$") meta.org = n; }
    }
    if(typeIndex["IFCPERSON"]){
        var pe2 = entities[typeIndex["IFCPERSON"][0]];
        if(pe2){
            var fam = extractField(pe2.args, 1);
            var giv = extractField(pe2.args, 2);
            if(fam && fam !== "$" && giv && giv !== "$") meta.author = giv + " " + fam;
            else if(giv && giv !== "$") meta.author = giv;
            else if(fam && fam !== "$") meta.author = fam;
        }
    }

    return { metadata: meta, entities: entities, typeIndex: typeIndex };
}

function extractField(args, idx){
    var fields = splitIfcArgs(args);
    if(idx < fields.length){
        var v = fields[idx].trim();
        if(v.startsWith("'") && v.endsWith("'")) return v.slice(1,-1);
        return v;
    }
    return null;
}

function splitIfcArgs(args){
    var result = [];
    var depth = 0, inQuote = false, cur = "";
    for(var i = 0; i < args.length; i++){
        var c = args[i];
        if(c === "'" && (i === 0 || args[i-1] !== "\\")){ inQuote = !inQuote; cur += c; }
        else if(!inQuote && c === "("){ depth++; cur += c; }
        else if(!inQuote && c === ")"){ depth--; cur += c; }
        else if(!inQuote && depth === 0 && c === ","){ result.push(cur.trim()); cur = ""; }
        else { cur += c; }
    }
    if(cur.length > 0) result.push(cur.trim());
    return result;
}

// ── Known product types for IFC entity filtering ──
var PRODUCT_TYPES = [
    "IFCWALL","IFCWALLSTANDARDCASE","IFCBEAM","IFCCOLUMN","IFCSLAB",
    "IFCFOOTING","IFCPILE","IFCMEMBER","IFCPLATE","IFCROOF",
    "IFCSTAIR","IFCSTAIRFLIGHT","IFCRAMP","IFCRAMPFLIGHT",
    "IFCWINDOW","IFCDOOR","IFCCURTAINWALL","IFCRAILING",
    "IFCFURNISHINGELEMENT","IFCBUILDINGELEMENTPROXY",
    "IFCOPENINGELEMENT","IFCSPACE","IFCSITE","IFCBUILDING","IFCBUILDINGSTOREY"
];

// ── Alias map: short name → IFC type(s) ──
// Allows CLI commands like: wall hide, beam show, slab isolate
var ALIAS_MAP = {
    "wall":     ["IFCWALL","IFCWALLSTANDARDCASE"],
    "muro":     ["IFCWALL","IFCWALLSTANDARDCASE"],
    "beam":     ["IFCBEAM"],
    "viga":     ["IFCBEAM"],
    "column":   ["IFCCOLUMN"],
    "columna":  ["IFCCOLUMN"],
    "slab":     ["IFCSLAB"],
    "losa":     ["IFCSLAB"],
    "footing":  ["IFCFOOTING"],
    "zapata":   ["IFCFOOTING"],
    "pile":     ["IFCPILE"],
    "pilote":   ["IFCPILE"],
    "member":   ["IFCMEMBER"],
    "plate":    ["IFCPLATE"],
    "placa":    ["IFCPLATE"],
    "roof":     ["IFCROOF"],
    "techo":    ["IFCROOF"],
    "stair":    ["IFCSTAIR","IFCSTAIRFLIGHT"],
    "escalera": ["IFCSTAIR","IFCSTAIRFLIGHT"],
    "ramp":     ["IFCRAMP","IFCRAMPFLIGHT"],
    "rampa":    ["IFCRAMP","IFCRAMPFLIGHT"],
    "window":   ["IFCWINDOW"],
    "ventana":  ["IFCWINDOW"],
    "door":     ["IFCDOOR"],
    "puerta":   ["IFCDOOR"],
    "curtainwall":["IFCCURTAINWALL"],
    "railing":  ["IFCRAILING"],
    "baranda":  ["IFCRAILING"],
    "furniture":["IFCFURNISHINGELEMENT"],
    "mueble":   ["IFCFURNISHINGELEMENT"],
    "proxy":    ["IFCBUILDINGELEMENTPROXY"],
    "opening":  ["IFCOPENINGELEMENT"],
    "abertura": ["IFCOPENINGELEMENT"],
    "space":    ["IFCSPACE"],
    "espacio":  ["IFCSPACE"],
    "site":     ["IFCSITE"],
    "sitio":    ["IFCSITE"],
    "building": ["IFCBUILDING"],
    "edificio": ["IFCBUILDING"],
    "storey":   ["IFCBUILDINGSTOREY"],
    "piso":     ["IFCBUILDINGSTOREY"],
    "nivel":    ["IFCBUILDINGSTOREY"]
};

// ── Log to CLI panel ──
function log(msg){
    var out = document.getElementById("cliOutput");
    if(out){
        out.value += msg + "\n";
        out.scrollTop = out.scrollHeight;
    }
    console.log("[IFC] " + msg);
}

// ── Ensure Three.js is initialized and switch to 3D ──
function ensure3D(){
    if(!S.threeInited){
        if(S.currentView !== "3d"){
            set("currentView", "3d");
            var sel = document.getElementById("viewMode");
            if(sel) sel.value = "3d";
            switchTo3D();
        }
    }
}

// ── Load IFC from ArrayBuffer ──
async function loadIfcBuffer(buffer, fileName, fileSize){
    if(typeof WebIFC === "undefined"){
        log("ERROR: web-ifc no cargado. Verifique conexion a internet.");
        return null;
    }

    // Clear previous model
    clearIfc();

    ensure3D();

    log("Cargando " + fileName + " (" + (fileSize/1024).toFixed(0) + " KB)...");

    try {
        var ifcAPI = new WebIFC.IfcAPI();
        await ifcAPI.Init();

        var data = new Uint8Array(buffer);
        var modelID = ifcAPI.OpenModel(data);

        // Also parse as text for metadata
        var decoder = new TextDecoder("utf-8");
        var text = decoder.decode(data);
        var parsed = parseIfcText(text);

        // Extract geometry
        var meshes = ifcAPI.LoadAllGeometry(modelID);
        var modelGroup = new THREE.Group();
        modelGroup.name = "ifc_model";
        modelGroup.userData.isIFC = true;
        var totalVerts = 0, totalTris = 0;

        // Track meshes by type for visibility toggling
        var typeToMeshes = {};

        for(var i = 0; i < meshes.size(); i++){
            var mesh = meshes.get(i);
            var expressID = mesh.expressID;
            // Try to find entity type
            var entType = "UNKNOWN";
            if(parsed.entities[expressID]) entType = parsed.entities[expressID].type;

            var placedGeometries = mesh.geometries;
            for(var j = 0; j < placedGeometries.size(); j++){
                var pg = placedGeometries.get(j);
                var geom = ifcAPI.GetGeometry(modelID, pg.geometryExpressID);
                var vData = ifcAPI.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                var iData = ifcAPI.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

                var vertices = new Float32Array(vData.length / 2);
                for(var k = 0; k < vData.length; k += 6){
                    vertices[k/6*3] = vData[k];
                    vertices[k/6*3+1] = vData[k+1];
                    vertices[k/6*3+2] = vData[k+2];
                }

                var bufGeom = new THREE.BufferGeometry();
                bufGeom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
                bufGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(iData), 1));
                bufGeom.computeVertexNormals();

                var color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
                var mat = new THREE.MeshPhongMaterial({
                    color: color,
                    opacity: pg.color.w,
                    transparent: pg.color.w < 1,
                    side: THREE.DoubleSide
                });
                var m3 = new THREE.Mesh(bufGeom, mat);
                var matrix = new THREE.Matrix4();
                matrix.fromArray(pg.flatTransformation);
                m3.applyMatrix4(matrix);
                m3.userData.ifcType = entType;
                m3.userData.expressID = expressID;
                modelGroup.add(m3);

                if(!typeToMeshes[entType]) typeToMeshes[entType] = [];
                typeToMeshes[entType].push(m3);

                totalVerts += vertices.length / 3;
                totalTris += iData.length / 3;
            }
        }

        // Add lights if not present
        if(!S.threeScene.getObjectByName("ifc_ambient")){
            var amb = new THREE.AmbientLight(0xffffff, 0.5);
            amb.name = "ifc_ambient";
            S.threeScene.add(amb);
        }
        if(!S.threeScene.getObjectByName("ifc_dirlight")){
            var dir = new THREE.DirectionalLight(0xffffff, 0.8);
            dir.position.set(50, 100, 50);
            dir.name = "ifc_dirlight";
            S.threeScene.add(dir);
        }

        S.threeScene.add(modelGroup);
        ifcAPI.CloseModel(modelID);

        // Store model data
        ifcModel = {
            group: modelGroup,
            metadata: parsed.metadata,
            entities: parsed.entities,
            typeIndex: parsed.typeIndex,
            fileName: fileName,
            fileSize: fileSize,
            totalVerts: totalVerts,
            totalTris: totalTris
        };
        ifcMeshes = typeToMeshes;
        ifcTypeVisibility = {};
        for(var t in typeToMeshes) ifcTypeVisibility[t] = true;

        // Fit view to model
        fitIfcView();

        log("OK: " + fileName);
        log("  " + totalVerts.toLocaleString() + " vertices, " + totalTris.toLocaleString() + " triangulos");
        log("  Tipos: " + Object.keys(typeToMeshes).length + ", Entidades: " + Object.keys(parsed.entities).length);
        if(parsed.metadata.project) log("  Proyecto: " + parsed.metadata.project);

        // Update IFC panel
        updateIfcPanel();

        return ifcModel;
    } catch(err){
        log("ERROR: " + err.message);
        console.error("IFC load error:", err);
        return null;
    }
}

// ── Fit camera to IFC model ──
function fitIfcView(){
    if(!ifcModel || !ifcModel.group || !S.threeCamera || !S.threeControls) return;
    var box = new THREE.Box3().setFromObject(ifcModel.group);
    if(box.isEmpty()) return;
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z);
    S.threeCamera.position.set(center.x + maxDim*0.7, center.y - maxDim*0.5, center.z + maxDim*0.7);
    S.threeControls.target.copy(center);
    S.threeControls.update();
}

// ── Clear IFC model ──
function clearIfc(){
    if(ifcModel && ifcModel.group){
        // Dispose geometries and materials
        ifcModel.group.traverse(function(obj){
            if(obj.geometry) obj.geometry.dispose();
            if(obj.material){
                if(Array.isArray(obj.material)) obj.material.forEach(function(m){ m.dispose(); });
                else obj.material.dispose();
            }
        });
        if(S.threeScene) S.threeScene.remove(ifcModel.group);
    }
    // Remove lights
    var amb = S.threeScene ? S.threeScene.getObjectByName("ifc_ambient") : null;
    if(amb) S.threeScene.remove(amb);
    var dir = S.threeScene ? S.threeScene.getObjectByName("ifc_dirlight") : null;
    if(dir) S.threeScene.remove(dir);

    ifcModel = null;
    ifcMeshes = {};
    ifcTypeVisibility = {};
    updateIfcPanel();
}

// ── Toggle type visibility ──
function setTypeVisible(type, visible){
    type = type.toUpperCase();
    if(!ifcMeshes[type]){ log("Tipo no encontrado: " + type); return; }
    ifcTypeVisibility[type] = visible;
    ifcMeshes[type].forEach(function(m){ m.visible = visible; });
}

// ── Set color for all meshes of a type ──
function setTypeColor(type, hexColor){
    type = type.toUpperCase();
    if(!ifcMeshes[type]){ log("Tipo no encontrado: " + type); return; }
    var c = new THREE.Color(hexColor);
    ifcMeshes[type].forEach(function(m){
        if(m.material) m.material.color.copy(c);
    });
}

// ── Set opacity for all meshes of a type ──
function setTypeOpacity(type, opacity){
    type = type.toUpperCase();
    if(!ifcMeshes[type]){ log("Tipo no encontrado: " + type); return; }
    ifcMeshes[type].forEach(function(m){
        if(m.material){
            m.material.opacity = opacity;
            m.material.transparent = opacity < 1;
        }
    });
}

// ── Isolate: show only this type, hide everything else ──
function isolateType(type){
    type = type.toUpperCase();
    for(var t in ifcMeshes){
        var show = (t === type);
        ifcTypeVisibility[t] = show;
        ifcMeshes[t].forEach(function(m){ m.visible = show; });
    }
    updateIfcPanel();
}

// ── List entities of a type ──
function listTypeEntities(type, maxCount){
    type = type.toUpperCase();
    if(!ifcModel) return "No hay modelo IFC.";
    var ids = ifcModel.typeIndex[type];
    if(!ids || ids.length === 0) return "Sin entidades de tipo " + type;
    maxCount = maxCount || 20;
    var lines = [];
    for(var i = 0; i < Math.min(ids.length, maxCount); i++){
        var e = ifcModel.entities[ids[i]];
        if(e) lines.push("  #" + e.id + " " + e.args.substring(0, 80));
    }
    return type + " (" + ids.length + " entidades)" +
           (ids.length > maxCount ? " [mostrando " + maxCount + "]" : "") +
           "\n" + lines.join("\n");
}

// ── Resolve alias to IFC types (returns array of matching loaded types) ──
function resolveAlias(name){
    name = name.toLowerCase();
    // Direct IFC type match (e.g. "ifcwall")
    var upper = name.toUpperCase();
    if(ifcMeshes[upper]) return [upper];
    // Alias map match
    if(ALIAS_MAP[name]){
        var found = [];
        for(var i = 0; i < ALIAS_MAP[name].length; i++){
            if(ifcMeshes[ALIAS_MAP[name][i]]) found.push(ALIAS_MAP[name][i]);
        }
        return found;
    }
    // Partial match: search loaded types
    var partial = [];
    for(var t in ifcMeshes){
        if(t.indexOf(upper) >= 0) partial.push(t);
    }
    return partial;
}

// ── Execute alias command from CLI ──
// Called as: wall hide | beam show | slab color #ff0000 | column isolate
// alias = "wall", action = "hide", extra = ["#ff0000"]
function execIfcAlias(alias, action, extra){
    if(!ifcModel) return "No hay modelo IFC cargado.";
    var types = resolveAlias(alias);
    if(types.length === 0) return null;  // null = not an IFC alias

    action = (action || "").toLowerCase();
    if(!action){
        // No action: just list info
        var info = [];
        for(var i = 0; i < types.length; i++){
            var cnt = ifcMeshes[types[i]] ? ifcMeshes[types[i]].length : 0;
            var vis = ifcTypeVisibility[types[i]] !== false ? "visible" : "oculto";
            info.push(types[i] + ": " + cnt + " meshes (" + vis + ")");
        }
        return info.join("\n");
    }

    var result = [];
    for(var j = 0; j < types.length; j++){
        var t = types[j];
        switch(action){
            case "hide": case "ocultar":
                setTypeVisible(t, false);
                result.push(t + " oculto");
                break;
            case "show": case "mostrar":
                setTypeVisible(t, true);
                result.push(t + " visible");
                break;
            case "isolate": case "aislar":
                isolateType(t);
                result.push(t + " aislado");
                break;
            case "color":
                var hex = (extra && extra[0]) || "#ff6600";
                setTypeColor(t, hex);
                result.push(t + " color=" + hex);
                break;
            case "opacity": case "opacidad":
                var op = parseFloat((extra && extra[0]) || "0.5");
                if(isNaN(op)) op = 0.5;
                setTypeOpacity(t, op);
                result.push(t + " opacity=" + op);
                break;
            case "count": case "contar":
                var cnt2 = ifcMeshes[t] ? ifcMeshes[t].length : 0;
                var entCnt = ifcModel.typeIndex[t] ? ifcModel.typeIndex[t].length : 0;
                result.push(t + ": " + cnt2 + " meshes, " + entCnt + " entidades");
                break;
            case "list": case "listar":
                result.push(listTypeEntities(t, parseInt((extra && extra[0]) || "20")));
                break;
            case "fit": case "encuadrar":
                // Fit to just this type's bounding box
                if(ifcMeshes[t] && ifcMeshes[t].length > 0 && S.threeCamera && S.threeControls){
                    var box = new THREE.Box3();
                    ifcMeshes[t].forEach(function(m){ box.expandByObject(m); });
                    if(!box.isEmpty()){
                        var center = box.getCenter(new THREE.Vector3());
                        var size = box.getSize(new THREE.Vector3());
                        var d = Math.max(size.x, size.y, size.z) * 1.5;
                        S.threeCamera.position.set(center.x+d*0.7, center.y-d*0.5, center.z+d*0.7);
                        S.threeControls.target.copy(center);
                        S.threeControls.update();
                    }
                }
                result.push(t + " encuadrado");
                break;
            default:
                result.push("Acciones: hide show isolate color opacity count list fit");
                break;
        }
    }
    updateIfcPanel();
    return result.join("\n");
}

// ── Set view angle ──
function setIfcView(view){
    if(!ifcModel || !ifcModel.group || !S.threeCamera || !S.threeControls) return;
    var box = new THREE.Box3().setFromObject(ifcModel.group);
    if(box.isEmpty()) return;
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var d = Math.max(size.x, size.y, size.z) * 1.5;
    switch(view){
        case "top":    S.threeCamera.position.set(center.x, center.y, center.z + d); break;
        case "front":  S.threeCamera.position.set(center.x, center.y - d, center.z); break;
        case "right":  S.threeCamera.position.set(center.x + d, center.y, center.z); break;
        case "back":   S.threeCamera.position.set(center.x, center.y + d, center.z); break;
        case "left":   S.threeCamera.position.set(center.x - d, center.y, center.z); break;
        default:       S.threeCamera.position.set(center.x+d*0.7, center.y-d*0.5, center.z+d*0.7); break;
    }
    S.threeControls.target.copy(center);
    S.threeControls.update();
}

// ── Update IFC panel in sidebar ──
function updateIfcPanel(){
    var tree = document.getElementById("ifcTree");
    var info = document.getElementById("ifcInfo");
    if(!tree || !info) return;

    if(!ifcModel){
        info.innerHTML = '<p style="color:#555;font-style:italic;">Arrastre un archivo .ifc o use el boton IFC</p>';
        tree.innerHTML = "";
        var cnt = document.getElementById("ifcCount");
        if(cnt) cnt.textContent = "0";
        return;
    }

    var meta = ifcModel.metadata;
    info.innerHTML =
        '<table class="ptbl">' +
        '<tr><td class="pl">Archivo:</td><td class="pv">' + ifcModel.fileName + '</td></tr>' +
        '<tr><td class="pl">Tamano:</td><td class="pv">' + (ifcModel.fileSize/1024/1024).toFixed(1) + ' MB</td></tr>' +
        (meta.schema ? '<tr><td class="pl">Schema:</td><td class="pv">' + meta.schema + '</td></tr>' : '') +
        (meta.project ? '<tr><td class="pl">Proyecto:</td><td class="pv">' + meta.project + '</td></tr>' : '') +
        (meta.author ? '<tr><td class="pl">Autor:</td><td class="pv">' + meta.author + '</td></tr>' : '') +
        (meta.org ? '<tr><td class="pl">Org:</td><td class="pv">' + meta.org + '</td></tr>' : '') +
        '<tr><td class="pl">Vertices:</td><td class="pv">' + ifcModel.totalVerts.toLocaleString() + '</td></tr>' +
        '<tr><td class="pl">Triangulos:</td><td class="pv">' + ifcModel.totalTris.toLocaleString() + '</td></tr>' +
        '</table>';

    // Build entity type tree with toggle visibility
    var sorted = Object.keys(ifcMeshes).sort();
    var html = "";
    for(var i = 0; i < sorted.length; i++){
        var t = sorted[i];
        var count = ifcMeshes[t].length;
        var vis = ifcTypeVisibility[t] !== false;
        html += '<div class="tree-item' + (vis ? '' : ' dim') + '" data-ifc-type="' + t + '">' +
                '<span class="tree-icon" style="color:' + (vis ? '#4ec9b0' : '#555') + ';">&#9632;</span>' +
                '<span class="tree-name">' + t + '</span>' +
                '<span class="tree-dim">' + count + '</span>' +
                '<span class="tree-vis ifc-vis' + (vis ? '' : ' hidden') + '" data-type="' + t + '" title="Mostrar/Ocultar">' +
                (vis ? '&#128065;' : '&#128064;') + '</span>' +
                '</div>';
    }
    tree.innerHTML = html;

    var cnt = document.getElementById("ifcCount");
    if(cnt) cnt.textContent = sorted.length + "";

    // Bind visibility toggles
    var btns = tree.querySelectorAll(".ifc-vis");
    for(var b = 0; b < btns.length; b++){
        (function(btn){
            btn.addEventListener("click", function(e){
                e.stopPropagation();
                var type = btn.getAttribute("data-type");
                var vis = ifcTypeVisibility[type] !== false;
                setTypeVisible(type, !vis);
                updateIfcPanel();
            });
        })(btns[b]);
    }
}

// ── File input handler ──
function openIfcFile(){
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".ifc";
    input.addEventListener("change", function(){
        if(input.files.length === 0) return;
        var file = input.files[0];
        var reader = new FileReader();
        reader.onload = function(){
            loadIfcBuffer(reader.result, file.name, file.size);
        };
        reader.readAsArrayBuffer(file);
    });
    input.click();
}

// ── Drag & Drop ──
function initDragDrop(){
    var area = canvasArea || document.getElementById("canvasArea");
    if(!area) return;

    area.addEventListener("dragover", function(e){
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        area.style.outline = "2px dashed #4ec9b0";
    });
    area.addEventListener("dragleave", function(){
        area.style.outline = "";
    });
    area.addEventListener("drop", function(e){
        e.preventDefault();
        area.style.outline = "";
        var files = e.dataTransfer.files;
        for(var i = 0; i < files.length; i++){
            if(files[i].name.toLowerCase().endsWith(".ifc")){
                var file = files[i];
                var reader = new FileReader();
                reader.onload = function(){
                    loadIfcBuffer(reader.result, file.name, file.size);
                };
                reader.readAsArrayBuffer(file);
                break;
            }
        }
    });
}

// ── CLI command handler ──
function execIfcCmd(args){
    var sub = (args[0] || "").toLowerCase();
    switch(sub){
        case "load": case "abrir":
            openIfcFile();
            return "Abriendo dialogo de archivo...";
        case "meta": case "info":
            if(!ifcModel) return "No hay modelo IFC cargado.";
            var m = ifcModel.metadata;
            return "Archivo: " + ifcModel.fileName + "\n" +
                   "Schema: " + m.schema + "\n" +
                   "Proyecto: " + (m.project || "-") + "\n" +
                   "Autor: " + (m.author || "-") + "\n" +
                   "Org: " + (m.org || "-") + "\n" +
                   "Vertices: " + ifcModel.totalVerts.toLocaleString() + "\n" +
                   "Triangulos: " + ifcModel.totalTris.toLocaleString();
        case "types": case "tipos":
            if(!ifcModel) return "No hay modelo IFC cargado.";
            var types = Object.keys(ifcMeshes).sort();
            return types.map(function(t){ return t + " (" + ifcMeshes[t].length + ")"; }).join("\n");
        case "stats": case "estadisticas":
            if(!ifcModel) return "No hay modelo IFC cargado.";
            var ti = ifcModel.typeIndex;
            var sorted = Object.keys(ti).sort(function(a,b){ return ti[b].length - ti[a].length; });
            var lines = sorted.slice(0, 30).map(function(t){ return t.padEnd(40) + " " + ti[t].length; });
            return "Total entidades: " + Object.keys(ifcModel.entities).length + "\n" +
                   "Tipo".padEnd(40) + " Cant\n" + "-".repeat(45) + "\n" + lines.join("\n");
        case "hide": case "ocultar":
            if(!args[1]) return "Uso: ifc hide <IFCTYPE>";
            setTypeVisible(args[1], false);
            return "Oculto: " + args[1].toUpperCase();
        case "show": case "mostrar":
            if(!args[1]) return "Uso: ifc show <IFCTYPE>";
            setTypeVisible(args[1], true);
            return "Visible: " + args[1].toUpperCase();
        case "hideall": case "ocultartodo":
            for(var t in ifcMeshes) setTypeVisible(t, false);
            updateIfcPanel();
            return "Todos los tipos ocultos.";
        case "showall": case "mostrartodo":
            for(var t in ifcMeshes) setTypeVisible(t, true);
            updateIfcPanel();
            return "Todos los tipos visibles.";
        case "fit": case "encuadrar":
            fitIfcView();
            return "Vista ajustada al modelo IFC.";
        case "view": case "vista":
            setIfcView(args[1] || "3d");
            return "Vista: " + (args[1] || "3d");
        case "clear": case "limpiar":
            clearIfc();
            return "Modelo IFC eliminado.";
        case "entity": case "entidad":
            if(!ifcModel || !args[1]) return "Uso: ifc entity <#ID>";
            var eid = parseInt(args[1].replace("#",""));
            var ent = ifcModel.entities[eid];
            if(!ent) return "Entidad #" + eid + " no encontrada.";
            return "#" + ent.id + " = " + ent.type + "(" + ent.args.substring(0,200) + (ent.args.length > 200 ? "..." : "") + ")";
        default:
            return "Comandos IFC:\n" +
                   "  ifc load          Cargar archivo IFC\n" +
                   "  ifc meta          Metadatos del modelo\n" +
                   "  ifc types         Listar tipos de entidades\n" +
                   "  ifc stats         Estadisticas por tipo\n" +
                   "  ifc hide <tipo>   Ocultar tipo\n" +
                   "  ifc show <tipo>   Mostrar tipo\n" +
                   "  ifc hideall       Ocultar todos\n" +
                   "  ifc showall       Mostrar todos\n" +
                   "  ifc fit           Encuadrar modelo\n" +
                   "  ifc view <v>      Vista (top/front/right/3d)\n" +
                   "  ifc entity <#id>  Info de entidad\n" +
                   "  ifc clear         Eliminar modelo";
    }
}

// ── Expose window.ifc API ──
var ifc = {};
ifc.load = openIfcFile;
ifc.meta = function(){ return ifcModel ? ifcModel.metadata : null; };
ifc.types = function(){ return Object.keys(ifcMeshes).sort(); };
ifc.stats = function(){
    if(!ifcModel) return null;
    var r = {};
    for(var t in ifcMeshes) r[t] = ifcMeshes[t].length;
    return r;
};
ifc.hide = function(type){ setTypeVisible(type, false); updateIfcPanel(); };
ifc.show = function(type){ setTypeVisible(type, true); updateIfcPanel(); };
ifc.hideAll = function(){ for(var t in ifcMeshes) setTypeVisible(t, false); updateIfcPanel(); };
ifc.showAll = function(){ for(var t in ifcMeshes) setTypeVisible(t, true); updateIfcPanel(); };
ifc.fit = fitIfcView;
ifc.view = setIfcView;
ifc.clear = clearIfc;
ifc.entity = function(id){ return ifcModel ? ifcModel.entities[id] : null; };
ifc.model = function(){ return ifcModel; };
ifc.loadBuffer = loadIfcBuffer;

ifc.alias = execIfcAlias;
ifc.resolve = resolveAlias;
ifc.setColor = setTypeColor;
ifc.setOpacity = setTypeOpacity;
ifc.isolate = isolateType;
ifc.listEntities = listTypeEntities;

window.ifc = ifc;

// ── Initialize ──
export function initIFC(){
    // Bind IFC load button
    var btn = document.getElementById("btnIfc");
    if(btn) btn.addEventListener("click", openIfcFile);

    // Init drag & drop
    initDragDrop();

    // Register IFC command handler in CLI
    // The CLI module checks window._ifcExec for IFC commands
    window._ifcExec = execIfcCmd;
    // Register alias handler: CLI checks this for IFC type names as commands
    window._ifcAlias = execIfcAlias;

    log("IFC Viewer listo. Arrastre un .ifc o escriba: ifc load");
    log("  Tras importar: wall hide | beam show | slab isolate | column color #ff0");
}

export { loadIfcBuffer, clearIfc, execIfcCmd, execIfcAlias };
