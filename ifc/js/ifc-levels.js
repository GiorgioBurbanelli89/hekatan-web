// =====================================================================
// Levels - Indicadores de nivel estilo Revit
// Lineas horizontales + triangulo marcador + etiqueta nombre/elevacion
// Comando: showlevels / ocultarlevels / togglelevels / levelmode
// =====================================================================
"use strict";
var S = window._S;

S.levelPlanesGroup = null;
S.levelPlanesVisible = false;
S.levelDisplayMode = "revit";

var LEVEL_COLORS = [
    0x2288dd, 0x22aa77, 0xdd8822, 0xdd4466, 0x6688dd,
    0x44bb88, 0xddaa44, 0xaa66dd, 0x22bbbb
];

function createLevelPlanes(){
    if(!S.ifcModel || !S.scene) return;
    removeLevelPlanes();

    var levels = getLevels();
    if(!levels || levels.length === 0){ log("No hay niveles en el modelo.","c-warn"); return; }

    var box = new THREE.Box3();
    if(S.modelGroup){
        S.modelGroup.traverse(function(o){
            if(o.isMesh && o.visible){
                o.updateMatrixWorld(true);
                box.expandByObject(o);
            }
        });
    }
    if(box.isEmpty()){ log("No hay geometria visible.","c-warn"); return; }

    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());

    S.levelPlanesGroup = new THREE.Group();
    S.levelPlanesGroup.name = "LevelIndicators";

    if(S.levelDisplayMode === "revit"){
        _createRevitLevels(levels, box, size, center);
    } else {
        _createPlaneLevels(levels, box, size, center);
    }

    S.scene.add(S.levelPlanesGroup);
    S.levelPlanesVisible = true;
    log("Niveles creados (" + S.levelDisplayMode + "): " + levels.length + " niveles", "c-ok");
}

// ═══════════════════════════════════════════════════════════════════
// MODO REVIT: Lineas + triangulo + etiqueta
// Para que se vean en TODAS las vistas (XY, YZ, XZ, 3D),
// las lineas forman un rectangulo completo en el plano horizontal
// a la elevacion del nivel. Etiquetas como sprites siempre visibles.
// ═══════════════════════════════════════════════════════════════════
function _createRevitLevels(levels, box, size, center){
    var ext = Math.max(size.x, size.z) * 0.35;
    var xMin = box.min.x - ext;
    var xMax = box.max.x + ext;
    var zMin = box.min.z - ext;
    var zMax = box.max.z + ext;

    var triSize = Math.max(size.x, size.z) * 0.025;
    if(triSize < 0.08) triSize = 0.08;
    if(triSize > 0.6) triSize = 0.6;

    var lineMaterial = function(color){
        return new THREE.LineBasicMaterial({
            color: color,
            depthTest: false,
            transparent: true,
            opacity: 0.85
        });
    };

    levels.forEach(function(lev, i){
        var elev = lev.elevation;
        var color = LEVEL_COLORS[i % LEVEL_COLORS.length];

        // ── 4 lineas formando rectangulo horizontal a la elevacion ──
        // Estas 4 lineas garantizan visibilidad en CUALQUIER vista ortografica
        var segments = [
            // Lado frontal (visible en elevacion XY desde +Z y -Z)
            xMin, elev, zMin,  xMax, elev, zMin,
            // Lado posterior
            xMin, elev, zMax,  xMax, elev, zMax,
            // Lado izquierdo (visible en elevacion YZ desde +X y -X)
            xMin, elev, zMin,  xMin, elev, zMax,
            // Lado derecho
            xMax, elev, zMin,  xMax, elev, zMax
        ];
        var rectGeo = new THREE.BufferGeometry();
        rectGeo.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
        var rectLine = new THREE.LineSegments(rectGeo, lineMaterial(color));
        rectLine.renderOrder = 10;
        S.levelPlanesGroup.add(rectLine);

        // ── Ticks verticales en las 4 esquinas ──
        var tickH = triSize * 1.2;
        var ticks = [
            xMin, elev - tickH, zMin,  xMin, elev + tickH, zMin,
            xMax, elev - tickH, zMin,  xMax, elev + tickH, zMin,
            xMin, elev - tickH, zMax,  xMin, elev + tickH, zMax,
            xMax, elev - tickH, zMax,  xMax, elev + tickH, zMax
        ];
        var tickGeo = new THREE.BufferGeometry();
        tickGeo.setAttribute("position", new THREE.Float32BufferAttribute(ticks, 3));
        var tickLine = new THREE.LineSegments(tickGeo, lineMaterial(color));
        tickLine.renderOrder = 10;
        S.levelPlanesGroup.add(tickLine);

        // ── Triangulos marcadores (4 esquinas, plano XY para frente/atras) ──
        _addTriangleXY(xMin, elev, zMin, triSize, color, 1);  // ▶ izq-frente
        _addTriangleXY(xMax, elev, zMin, triSize, color, -1); // ◀ der-frente
        _addTriangleXY(xMin, elev, zMax, triSize, color, 1);  // ▶ izq-atras
        _addTriangleXY(xMax, elev, zMax, triSize, color, -1); // ◀ der-atras

        // ── Triangulos marcadores (4 esquinas, plano YZ para lateral) ──
        _addTriangleYZ(xMin, elev, zMin, triSize, color, 1);  // ▶ izq-frente
        _addTriangleYZ(xMin, elev, zMax, triSize, color, -1); // ◀ izq-atras
        _addTriangleYZ(xMax, elev, zMin, triSize, color, 1);  // ▶ der-frente
        _addTriangleYZ(xMax, elev, zMax, triSize, color, -1); // ◀ der-atras

        // ── Etiquetas sprite (4 esquinas, siempre visibles como billboards) ──
        var lblOff = triSize * 1.5;
        var refLen = Math.max(xMax - xMin, zMax - zMin);
        // Esquina izq-frente (visible en XY y YZ)
        _addLevelLabel(lev.name, elev, xMin - lblOff, elev + lblOff * 0.6, zMin - lblOff, color, refLen);
        // Esquina der-frente
        _addLevelLabel(lev.name, elev, xMax + lblOff, elev + lblOff * 0.6, zMin - lblOff, color, refLen);
        // Esquina izq-atras (para vista posterior)
        _addLevelLabel(lev.name, elev, xMin - lblOff, elev + lblOff * 0.6, zMax + lblOff, color, refLen);

        // ── Linea punteada central tenue (referencia en 3D) ──
        var dashPts = [];
        var nDash = 30;
        for(var d = 0; d < nDash; d++){
            var t0 = d / nDash;
            var t1 = (d + 0.5) / nDash;
            // Linea en X por el centro de Z
            dashPts.push(
                xMin + t0 * (xMax - xMin), elev, center.z,
                xMin + t1 * (xMax - xMin), elev, center.z
            );
            // Linea en Z por el centro de X
            dashPts.push(
                center.x, elev, zMin + t0 * (zMax - zMin),
                center.x, elev, zMin + t1 * (zMax - zMin)
            );
        }
        var dashGeo = new THREE.BufferGeometry();
        dashGeo.setAttribute("position", new THREE.Float32BufferAttribute(dashPts, 3));
        var dashMat = new THREE.LineBasicMaterial({
            color: color, transparent: true, opacity: 0.15, depthTest: false
        });
        var dashLine = new THREE.LineSegments(dashGeo, dashMat);
        dashLine.renderOrder = 5;
        S.levelPlanesGroup.add(dashLine);
    });
}

// Triangulo en plano XY (visible desde +Z / -Z)
function _addTriangleXY(x, y, z, sz, color, dir){
    var shape = new THREE.Shape();
    shape.moveTo(0, -sz);
    shape.lineTo(dir * sz, 0);
    shape.lineTo(0, sz);
    shape.lineTo(0, -sz);
    var geom = new THREE.ShapeGeometry(shape);
    var mat = new THREE.MeshBasicMaterial({
        color: color, side: THREE.DoubleSide,
        depthTest: false, transparent: true, opacity: 0.85
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 11;
    S.levelPlanesGroup.add(mesh);
}

// Triangulo en plano YZ (visible desde +X / -X)
function _addTriangleYZ(x, y, z, sz, color, dir){
    var shape = new THREE.Shape();
    shape.moveTo(0, -sz);
    shape.lineTo(dir * sz, 0);
    shape.lineTo(0, sz);
    shape.lineTo(0, -sz);
    var geom = new THREE.ShapeGeometry(shape);
    var mat = new THREE.MeshBasicMaterial({
        color: color, side: THREE.DoubleSide,
        depthTest: false, transparent: true, opacity: 0.85
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 11;
    S.levelPlanesGroup.add(mesh);
}

// Etiqueta sprite billboard (siempre mira a la camara)
function _addLevelLabel(name, elev, px, py, pz, color, refSize){
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    canvas.width = 512;
    canvas.height = 80;

    ctx.fillStyle = "rgba(15,15,25,0.88)";
    ctx.fillRect(0, 0, 512, 80);

    var hexStr = "#" + color.toString(16).padStart(6, "0");
    ctx.strokeStyle = hexStr;
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, 510, 78);
    ctx.fillStyle = hexStr;
    ctx.fillRect(0, 0, 6, 80);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Arial";
    ctx.fillText(name, 14, 30);

    ctx.fillStyle = hexStr;
    ctx.font = "22px Arial";
    ctx.fillText((elev >= 0 ? "+" : "") + elev.toFixed(2) + " m", 14, 60);

    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    var spriteMat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthTest: false
    });
    var sprite = new THREE.Sprite(spriteMat);

    var labelW = refSize * 0.12;
    if(labelW < 0.8) labelW = 0.8;
    if(labelW > 3.5) labelW = 3.5;
    sprite.scale.set(labelW, labelW * (80 / 512), 1);
    sprite.position.set(px, py, pz);
    sprite.renderOrder = 20;
    S.levelPlanesGroup.add(sprite);
}

// ═══════════════════════════════════════════════════════════════════
// MODO PLANOS: Planos semitransparentes (modo anterior)
// ═══════════════════════════════════════════════════════════════════
function _createPlaneLevels(levels, box, size, center){
    var planeW = size.x * 1.4;
    var planeD = size.z * 1.4;
    if(planeW < 2) planeW = 20;
    if(planeD < 2) planeD = 20;

    levels.forEach(function(lev, i){
        var elev = lev.elevation;
        var color = LEVEL_COLORS[i % LEVEL_COLORS.length];

        var geom = new THREE.PlaneGeometry(planeW, planeD);
        var mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.25,
            side: THREE.DoubleSide, depthWrite: false
        });
        var plane = new THREE.Mesh(geom, mat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(center.x, elev, center.z);
        plane.renderOrder = -1;
        S.levelPlanesGroup.add(plane);

        var edgeGeo = new THREE.EdgesGeometry(geom);
        var edgeMat = new THREE.LineBasicMaterial({
            color: color, transparent: true, opacity: 0.85
        });
        var edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.rotation.x = -Math.PI / 2;
        edges.position.set(center.x, elev, center.z);
        S.levelPlanesGroup.add(edges);

        _addLevelLabel(lev.name, elev,
            center.x - planeW * 0.5, elev + 0.15, center.z - planeD * 0.5,
            color, planeW);
    });
}

// ═══════════════════════════════════════════════════════════════════
// Controles publicos
// ═══════════════════════════════════════════════════════════════════
function removeLevelPlanes(){
    if(S.levelPlanesGroup){
        S.scene.remove(S.levelPlanesGroup);
        S.levelPlanesGroup.traverse(function(o){
            if(o.geometry) o.geometry.dispose();
            if(o.material){
                if(o.material.map) o.material.map.dispose();
                o.material.dispose();
            }
        });
        S.levelPlanesGroup = null;
    }
    S.levelPlanesVisible = false;
}

function toggleLevelPlanes(){
    if(S.levelPlanesVisible){
        removeLevelPlanes();
        log("Niveles ocultos", "c-ok");
    } else {
        createLevelPlanes();
    }
}

function setLevelMode(mode){
    if(mode === "revit" || mode === "lineas" || mode === "lines"){
        S.levelDisplayMode = "revit";
    } else if(mode === "planos" || mode === "planes"){
        S.levelDisplayMode = "planes";
    } else {
        log("Modos: revit (lineas), planos (semitransparentes)", "c-warn");
        return;
    }
    log("Modo de niveles: " + S.levelDisplayMode, "c-ok");
    if(S.levelPlanesVisible){
        createLevelPlanes();
    }
}

// ═══════════════════════════════════════════════════════════════════════
// PLANT LEVELS — Niveles detectados por geometria real (top Y de meshes)
// Para vista planta XZ: escanea IFCSLAB, IFCBEAM, IFCWALLSTANDARDCASE,
// IFCWALL y agrupa por elevacion Y maxima.
// ═══════════════════════════════════════════════════════════════════════

var PLANT_LEVEL_COLORS = [
    0x00aaff, 0x44dd88, 0xff8822, 0xee4488, 0x8866ee,
    0x22cccc, 0xddaa22, 0xff6666, 0x66bbff
];

// Tipos estructurales HORIZONTALES que definen niveles de planta
// Muros (IFCWALL) NO se incluyen: son verticales, su top coincide con un nivel pero no lo define
var PLANT_LEVEL_TYPES = ["IFCSLAB", "IFCBEAM", "IFCFOOTING"];

/**
 * Detectar niveles reales escaneando la Y-max (top) de cada mesh
 * Agrupa elevaciones cercanas con tolerancia.
 * Retorna array ordenado: [{elevation, types:{IFCSLAB:n,...}, count, label}]
 */
function detectPlantLevels(tolerance){
    if(!S.modelGroup) { console.log("[PlantLevels] No modelGroup"); return []; }
    tolerance = tolerance || 0.15; // 15cm por defecto

    // Recolectar elevaciones top de cada mesh estructural
    var tops = []; // {y, type}
    var meshCount = 0;
    S.modelGroup.traverse(function(m){
        if(!m.isMesh) return;
        meshCount++;
        if(!m.visible) return;
        var t = m.userData.ifcType;
        if(!t) return;
        // Solo tipos que definen niveles
        var tUp = t.toUpperCase();
        if(PLANT_LEVEL_TYPES.indexOf(tUp) < 0) return;
        m.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(m);
        if(box.isEmpty()) return;
        tops.push({ y: box.max.y, yMin: box.min.y, type: tUp });
    });
    console.log("[PlantLevels] meshes=" + meshCount + ", structural tops=" + tops.length);

    if(tops.length === 0) return [];

    // Ordenar por Y-max
    tops.sort(function(a, b){ return a.y - b.y; });

    // Agrupar por proximidad
    var groups = [];
    var currentGroup = { sum: tops[0].y, count: 1, types: {}, yMin: tops[0].yMin };
    currentGroup.types[tops[0].type] = 1;

    for(var i = 1; i < tops.length; i++){
        var avg = currentGroup.sum / currentGroup.count;
        if(Math.abs(tops[i].y - avg) <= tolerance){
            // Mismo grupo
            currentGroup.sum += tops[i].y;
            currentGroup.count++;
            currentGroup.types[tops[i].type] = (currentGroup.types[tops[i].type] || 0) + 1;
            if(tops[i].yMin < currentGroup.yMin) currentGroup.yMin = tops[i].yMin;
        } else {
            // Nuevo grupo
            groups.push(currentGroup);
            currentGroup = { sum: tops[i].y, count: 1, types: {}, yMin: tops[i].yMin };
            currentGroup.types[tops[i].type] = 1;
        }
    }
    groups.push(currentGroup);

    // Convertir a resultado final
    var levels = groups.map(function(g, idx){
        var elev = g.sum / g.count;
        // Generar label descriptivo
        var parts = [];
        for(var t in g.types){
            var sn = S.SNAMES[t] || t.replace("IFC","");
            parts.push(sn + ":" + g.types[t]);
        }
        return {
            elevation: Math.round(elev * 100) / 100, // redondear a cm
            yMin: Math.round(g.yMin * 100) / 100,
            types: g.types,
            count: g.count,
            label: "Nivel " + (idx + 1) + " (+" + elev.toFixed(2) + "m)",
            desc: parts.join(", ")
        };
    });

    return levels;
}

/**
 * Crear indicadores visuales de niveles de planta en la vista XZ
 * Muestra rectangulos con etiquetas de elevacion en cada nivel detectado
 */
function createPlantLevels(){
    if(!S.modelGroup || !S.scene) return;
    removePlantLevels();

    var levels = detectPlantLevels();
    if(!levels || levels.length === 0){
        log("No se detectaron niveles de planta.", "c-warn");
        return;
    }
    S.plantLevelsData = levels;

    // Bounding box del modelo
    var box = new THREE.Box3();
    S.modelGroup.traverse(function(o){
        if(o.isMesh && o.visible){
            o.updateMatrixWorld(true);
            box.expandByObject(o);
        }
    });
    if(box.isEmpty()) return;

    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    var ext = Math.max(size.x, size.z) * 0.25;
    var xMin = box.min.x - ext;
    var xMax = box.max.x + ext;
    var zMin = box.min.z - ext;
    var zMax = box.max.z + ext;

    S.plantLevelsGroup = new THREE.Group();
    S.plantLevelsGroup.name = "PlantLevelIndicators";

    levels.forEach(function(lev, i){
        var elev = lev.elevation;
        var color = PLANT_LEVEL_COLORS[i % PLANT_LEVEL_COLORS.length];

        // ── Rectangulo horizontal a la elevacion del nivel ──
        var segs = [
            xMin, elev, zMin,  xMax, elev, zMin,
            xMin, elev, zMax,  xMax, elev, zMax,
            xMin, elev, zMin,  xMin, elev, zMax,
            xMax, elev, zMin,  xMax, elev, zMax
        ];
        var geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
        var mat = new THREE.LineBasicMaterial({
            color: color, depthTest: false, transparent: true, opacity: 0.9
        });
        var lines = new THREE.LineSegments(geo, mat);
        lines.renderOrder = 15;
        S.plantLevelsGroup.add(lines);

        // ── Plano semitransparente (visible en planta XZ) ──
        var plW = xMax - xMin;
        var plD = zMax - zMin;
        var plGeo = new THREE.PlaneGeometry(plW, plD);
        var plMat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.08,
            side: THREE.DoubleSide, depthWrite: false
        });
        var plMesh = new THREE.Mesh(plGeo, plMat);
        plMesh.rotation.x = -Math.PI / 2;
        plMesh.position.set((xMin + xMax) / 2, elev, (zMin + zMax) / 2);
        plMesh.renderOrder = 14;
        S.plantLevelsGroup.add(plMesh);

        // ── Etiqueta sprite (billboard) ──
        var refLen = Math.max(plW, plD);
        var lblCanvas = document.createElement("canvas");
        var lblCtx = lblCanvas.getContext("2d");
        lblCanvas.width = 600;
        lblCanvas.height = 100;

        lblCtx.fillStyle = "rgba(10,10,20,0.9)";
        _roundRect(lblCtx, 0, 0, 600, 100, 8);
        lblCtx.fill();

        var hexStr = "#" + color.toString(16).padStart(6, "0");
        lblCtx.strokeStyle = hexStr;
        lblCtx.lineWidth = 3;
        lblCtx.strokeRect(2, 2, 596, 96);
        lblCtx.fillStyle = hexStr;
        lblCtx.fillRect(0, 0, 8, 100);

        lblCtx.fillStyle = "#ffffff";
        lblCtx.font = "bold 30px Arial";
        lblCtx.fillText("N" + (i + 1) + "  +" + elev.toFixed(2) + " m", 16, 35);

        lblCtx.fillStyle = hexStr;
        lblCtx.font = "22px Arial";
        lblCtx.fillText(lev.desc, 16, 72);

        var tex = new THREE.CanvasTexture(lblCanvas);
        tex.minFilter = THREE.LinearFilter;
        var spriteMat = new THREE.SpriteMaterial({
            map: tex, transparent: true, depthTest: false
        });
        var sprite = new THREE.Sprite(spriteMat);
        var labelW = refLen * 0.15;
        if(labelW < 1.0) labelW = 1.0;
        if(labelW > 4.0) labelW = 4.0;
        sprite.scale.set(labelW, labelW * (100 / 600), 1);
        sprite.position.set(xMin - ext * 0.3, elev, zMin - ext * 0.3);
        sprite.renderOrder = 25;
        S.plantLevelsGroup.add(sprite);

        // ── Cruz punteada tenue en el plano del nivel ──
        var dashPts = [];
        var nd = 25;
        for(var d = 0; d < nd; d++){
            var t0 = d / nd, t1 = (d + 0.5) / nd;
            dashPts.push(
                xMin + t0 * (xMax - xMin), elev, center.z,
                xMin + t1 * (xMax - xMin), elev, center.z
            );
            dashPts.push(
                center.x, elev, zMin + t0 * (zMax - zMin),
                center.x, elev, zMin + t1 * (zMax - zMin)
            );
        }
        var dashGeo = new THREE.BufferGeometry();
        dashGeo.setAttribute("position", new THREE.Float32BufferAttribute(dashPts, 3));
        var dashMat = new THREE.LineBasicMaterial({
            color: color, transparent: true, opacity: 0.12, depthTest: false
        });
        var dashLine = new THREE.LineSegments(dashGeo, dashMat);
        dashLine.renderOrder = 13;
        S.plantLevelsGroup.add(dashLine);
    });

    S.scene.add(S.plantLevelsGroup);
    S.plantLevelsVisible = true;

    log("═══ NIVELES DE PLANTA (geometría) ═══", "c-head");
    levels.forEach(function(lev, i){
        log("  N" + (i + 1) + "  +" + lev.elevation.toFixed(2) + "m  (" + lev.count + " elem: " + lev.desc + ")", "c-num");
    });
    log("Usa: plantlevel <N> para cortar a un nivel", "c-dim");
}

/**
 * Remover indicadores de niveles de planta
 */
function removePlantLevels(){
    if(S.plantLevelsGroup){
        S.scene.remove(S.plantLevelsGroup);
        S.plantLevelsGroup.traverse(function(o){
            if(o.geometry) o.geometry.dispose();
            if(o.material){
                if(o.material.map) o.material.map.dispose();
                o.material.dispose();
            }
        });
        S.plantLevelsGroup = null;
    }
    S.plantLevelsVisible = false;
}

function togglePlantLevels(){
    if(S.plantLevelsVisible){
        removePlantLevels();
        log("Niveles de planta ocultos", "c-ok");
    } else {
        createPlantLevels();
    }
}

/**
 * Activar vista de planta + seccion (doble clip) a un nivel especifico
 * n = numero de nivel (1-based) o 0 para desactivar
 *
 * Corte superior: todo lo que esta ARRIBA de la elevacion del nivel N se oculta
 * Corte inferior: todo lo que esta ABAJO del nivel N-1 se oculta
 * Resultado: solo se ve la "rebanada" del piso seleccionado
 *
 * Si hay contrapiso (losa) y debajo vigas, ambos se ven en la seccion.
 */
function setPlantLevel(n){
    if(!S.plantLevelsData || S.plantLevelsData.length === 0){
        var levels = detectPlantLevels();
        if(!levels || levels.length === 0){
            log("No se detectaron niveles.", "c-err");
            return;
        }
        S.plantLevelsData = levels;
    }

    if(n <= 0 || n > S.plantLevelsData.length){
        // Desactivar ambos clips
        disableClipping();
        S.plantLevelActive = -1;
        // Sincronizar dropdown GUI
        var _plSel0 = document.getElementById("plantLevelSelect");
        if(_plSel0) _plSel0.value = "-1";
        log("Clip de nivel desactivado. Mostrando todo.", "c-ok");
        return;
    }

    var lev = S.plantLevelsData[n - 1];
    S.plantLevelActive = n - 1;

    // ── Plano SUPERIOR: corta por arriba del nivel N ──
    // Normal (0,−1,0) → visible lo de abajo, oculta lo de arriba
    var topCut = lev.elevation;
    var topPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), topCut);

    // ── Plano INFERIOR: corta por debajo del nivel N-1 ──
    // Normal (0,+1,0) → visible lo de arriba, oculta lo de abajo
    var botCut;
    if(n >= 2){
        var prevLev = S.plantLevelsData[n - 2];
        // Cortar ligeramente debajo del nivel anterior para ver vigas/contrapiso
        botCut = prevLev.elevation - 0.02;
    } else {
        // Primer nivel: no hay piso inferior, mostrar desde muy abajo
        botCut = lev.elevation - 5.0;
    }
    var botPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -botCut);

    // Activar ambos planos
    S.clippingPlane = topPlane;
    S.clippingPlane2 = botPlane;
    S.clippingEnabled = true;
    S.clippingAxis = "y";
    S.clippingValue = topCut;
    S.clippingFlip = false;

    // Aplicar a materiales
    _applyClipToMaterials();
    _removeClipHelpers(); // No mostrar helpers de clip normal

    // Sincronizar dropdown GUI si existe
    var _plSel = document.getElementById("plantLevelSelect");
    if(_plSel) _plSel.value = n.toString();

    // Cambiar a vista planta si no estamos
    if(!S.isOrtho){
        setView("elev-xz");
    }

    var thickness = topCut - botCut;
    log("═══ PLANTA NIVEL N" + n + " ═══", "c-head");
    log("  Corte superior: +" + topCut.toFixed(2) + "m", "c-num");
    log("  Corte inferior: +" + botCut.toFixed(2) + "m", "c-num");
    log("  Espesor seccion: " + thickness.toFixed(2) + "m", "c-dim");
    log("  " + lev.desc, "c-dim");
    log("  plantlevel 0 | clipoff → desactivar", "c-dim");
}
