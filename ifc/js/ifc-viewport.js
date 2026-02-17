// =====================================================================
// Viewport — fitView, setView, visibility, wireframe, delete
// =====================================================================
"use strict";
var S = window._S;

// Shared: calcula centro y distancia robusta (percentil 95) para la cámara
function _calcViewDist(){
    if(!S.modelGroup || !S.modelGroup.children.length) return null;
    var meshBoxes = [];
    S.modelGroup.children.forEach(function(m){
        if(!m.isMesh || !m.visible) return;
        m.geometry.computeBoundingBox();
        var b = m.geometry.boundingBox.clone();
        b.applyMatrix4(m.matrixWorld);
        meshBoxes.push(b);
    });
    if(!meshBoxes.length) return null;
    var fullBox = new THREE.Box3();
    meshBoxes.forEach(function(b){ fullBox.union(b); });
    var fullCenter = fullBox.getCenter(new THREE.Vector3());
    var dists = [];
    meshBoxes.forEach(function(b){
        var c = b.getCenter(new THREE.Vector3());
        dists.push(c.distanceTo(fullCenter));
    });
    dists.sort(function(a,b){ return a - b; });
    var p95idx = Math.min(Math.floor(dists.length * 0.95), dists.length - 1);
    var radius95 = dists[p95idx];
    var trimBox = new THREE.Box3();
    meshBoxes.forEach(function(b){
        var c = b.getCenter(new THREE.Vector3());
        if(c.distanceTo(fullCenter) <= radius95 * 1.2) trimBox.union(b);
    });
    if(trimBox.isEmpty()) trimBox.copy(fullBox);
    var center = trimBox.getCenter(new THREE.Vector3());
    var size = trimBox.getSize(new THREE.Vector3());
    var d = Math.max(size.x, size.y, size.z) * 1.5;
    if(d < 1) d = 50;
    return {center: center, d: d, trimBox: trimBox, fullBox: fullBox};
}

// -- Camara ortografica para vistas 2D --
S.orthoCamera = null;
S.isOrtho = false;
S._perspCamera = null; // ref a la perspectiva original

function _ensureOrthoCamera(){
    if(S.orthoCamera) return;
    var container = document.getElementById("viewport");
    var w = container.clientWidth, h = container.clientHeight;
    var aspect = w / h;
    // Frustum inicial, se ajusta en cada setView
    S.orthoCamera = new THREE.OrthographicCamera(-10*aspect, 10*aspect, 10, -10, 0.01, 10000);
    S.orthoCamera.up.set(0, 1, 0);
}

function switchToOrtho(halfH, center, posVec, upVec){
    var container = document.getElementById("viewport");
    var w = container.clientWidth, h = container.clientHeight;
    var aspect = w / h;

    // Deshabilitar OrbitControls ANTES de todo para que no interfiera
    S.controls.enableRotate = false;
    S.controls.enableZoom = false;
    S.controls.enablePan = false;
    S.controls.enabled = false;

    // Crear camara ortografica NUEVA cada vez para evitar
    // estado residual de quaternion/rotation de la vista anterior
    var cam = new THREE.OrthographicCamera(
        -halfH * aspect, halfH * aspect,
        halfH, -halfH,
        -halfH * 10, halfH * 10
    );
    cam.position.copy(posVec);
    cam.up.copy(upVec);
    cam.lookAt(center.x, center.y, center.z);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    if(!S.isOrtho){
        S._perspCamera = S.camera;
    }
    S.orthoCamera = cam;
    S.camera = cam;

    // Asignar target ANTES de object para evitar que OrbitControls
    // recalcule la orientacion con el target anterior
    S.controls.target.copy(center);
    S.controls.object = cam;

    S.isOrtho = true;
}

function switchToPersp(){
    if(!S.isOrtho || !S._perspCamera) return;
    S.camera = S._perspCamera;
    S.controls.object = S._perspCamera;
    // Restaurar OrbitControls completo para 3D
    S.controls.enabled = true;
    S.controls.enableRotate = true;
    S.controls.enableZoom = true;
    S.controls.enablePan = true;
    S.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
    };
    S.controls.update();
    S.isOrtho = false;
}

function fitView(){
    if(!S.modelGroup || !S.camera || !S.controls) return;
    var cd = _calcViewDist();
    if(!cd) return;
    var center = cd.center, d = cd.d;

    // Si estamos en ortho, ajustar frustum
    if(S.isOrtho){
        var container = document.getElementById("viewport");
        var aspect = container.clientWidth / container.clientHeight;
        var halfH = d * 0.55;
        S.camera.left   = -halfH * aspect;
        S.camera.right  =  halfH * aspect;
        S.camera.top    =  halfH;
        S.camera.bottom = -halfH;
        S.camera.updateProjectionMatrix();
        S.controls.target.copy(center);
        S.controls.update();
    } else {
        S.camera.position.set(center.x+d*0.6, center.y+d*0.5, center.z+d*0.4);
        S.camera.near = d * 0.0005;
        S.camera.far = d * 50;
        S.camera.updateProjectionMatrix();
        S.controls.target.copy(center);
        S.controls.update();
    }

    var gScale = d * 1.2;
    if(gScale > 50){
        S.scene.remove(S.gridHelper);
        S.gridHelper = new THREE.GridHelper(gScale, 50, 0x444466, 0x333344);
        S.gridHelper.position.y = cd.trimBox.min.y;
        S.scene.add(S.gridHelper);
    }
    var axScale = d * 0.05;
    S.axesHelper.scale.set(axScale, axScale, axScale);
}

function setView(view){
    if(!S.modelGroup || !S.modelGroup.children.length) return;

    var cd = _calcViewDist();
    if(!cd) return;
    var center = cd.center, d = cd.d * 1.2;
    var halfH = d * 0.55;

    // Vistas 2D ortograficas (elevacion)
    switch(view){
        case "elev-xy": case "elevacion-xy": case "elevxy":
        case "elev-frente": case "elevacion frente":
            // Plano XY: camara mira desde +Z hacia -Z (elevacion frontal)
            switchToOrtho(halfH, center,
                new THREE.Vector3(center.x, center.y, center.z + d),
                new THREE.Vector3(0, 1, 0));
            return;

        case "elev-yz": case "elevacion-yz": case "elevyz":
        case "elev-lateral": case "elevacion lateral":
            // Plano YZ: camara mira desde +X hacia -X (elevacion lateral)
            switchToOrtho(halfH, center,
                new THREE.Vector3(center.x + d, center.y, center.z),
                new THREE.Vector3(0, 1, 0));
            return;

        case "elev-xz": case "elevacion-xz": case "planta2d":
            // Plano XZ: camara mira desde +Y hacia -Y (planta ortografica)
            switchToOrtho(halfH, center,
                new THREE.Vector3(center.x, center.y + d, center.z),
                new THREE.Vector3(0, 0, -1));
            return;
    }

    // Vistas 3D perspectiva: volver a perspectiva si estamos en ortho
    if(S.isOrtho) switchToPersp();

    switch(view){
        case "top": case "planta":
            S.camera.position.set(center.x, center.y + d, center.z);
            S.camera.up.set(0, 0, -1); break;
        case "front": case "frente":
            S.camera.position.set(center.x, center.y, center.z + d);
            S.camera.up.set(0, 1, 0); break;
        case "right": case "derecha": case "lateral":
            S.camera.position.set(center.x + d, center.y, center.z);
            S.camera.up.set(0, 1, 0); break;
        case "back": case "atras":
            S.camera.position.set(center.x, center.y, center.z - d);
            S.camera.up.set(0, 1, 0); break;
        case "left": case "izquierda":
            S.camera.position.set(center.x - d, center.y, center.z);
            S.camera.up.set(0, 1, 0); break;
        default:
            S.camera.position.set(center.x+d*0.6, center.y+d*0.5, center.z+d*0.4);
            S.camera.up.set(0, 1, 0); break;
    }
    S.camera.near = d * 0.001;
    S.camera.far = d * 20;
    S.camera.updateProjectionMatrix();
    S.controls.target.copy(center);
    S.controls.update();
}

// ── Visibility & Appearance ──
// Helper: verificar si un mesh esta oculto individualmente (hideSelectedMesh)
function _isIndividuallyHidden(m){
    return !!(m.userData && m.userData._individuallyHidden);
}

function setTypeVisible(type, vis){
    type = type.toUpperCase();
    if(!S.ifcMeshes[type]) return;
    S.ifcVisibility[type] = vis;
    S.ifcMeshes[type].forEach(function(m){
        // No restaurar meshes ocultos individualmente
        if(vis && _isIndividuallyHidden(m)) return;
        m.visible = vis;
    });
}
function setTypeColor(type, hex){
    type = type.toUpperCase();
    if(!S.ifcMeshes[type]) return;
    var c = new THREE.Color(hex);
    S.ifcMeshes[type].forEach(function(m){ if(m.material) m.material.color.copy(c); });
}
function setTypeOpacity(type, op){
    type = type.toUpperCase();
    if(!S.ifcMeshes[type]) return;
    S.ifcMeshes[type].forEach(function(m){
        if(m.material){ m.material.opacity=op; m.material.transparent=op<1; }
    });
}
function isolateType(type){
    type = type.toUpperCase();
    for(var t in S.ifcMeshes){
        var show = (t === type);
        S.ifcVisibility[t] = show;
        S.ifcMeshes[t].forEach(function(m){
            // No restaurar meshes ocultos individualmente
            if(show && _isIndividuallyHidden(m)) return;
            m.visible = show;
        });
    }
    updateObjTree();
}

function toggleWireframe(on){
    S.wireframeOn = on;
    if(S.wireGroup){
        S.scene.remove(S.wireGroup);
        S.wireGroup.traverse(function(o){ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });
        S.wireGroup = null;
    }
    if(on && S.modelGroup){
        S.wireGroup = new THREE.Group();
        S.modelGroup.traverse(function(child){
            if(child.isMesh && child.visible){
                var wg = new THREE.WireframeGeometry(child.geometry);
                var wm = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({color:0x888888, opacity:0.3, transparent:true}));
                wm.applyMatrix4(child.matrixWorld);
                S.wireGroup.add(wm);
            }
        });
        S.scene.add(S.wireGroup);
    }
}

function toggleAxes(on){ S.axesHelper.visible = on; }
function toggleGrid(on){ S.gridHelper.visible = on; }

// ── Alias resolver ──
function resolveAlias(name){
    name = name.toLowerCase();
    var upper = name.toUpperCase();
    if(S.ifcModel && S.ifcModel.typeIndex[upper]) return [upper];
    if(S.ALIAS[name]){
        var found = [];
        for(var i=0;i<S.ALIAS[name].length;i++){
            var t = S.ALIAS[name][i];
            if(S.ifcModel && (S.ifcModel.typeIndex[t] || S.ifcMeshes[t])) found.push(t);
        }
        return found.length ? found : S.ALIAS[name];
    }
    if(!S.ifcModel) return [];
    var partial = [];
    for(var t2 in S.ifcModel.typeIndex){
        if(t2.indexOf(upper)>=0) partial.push(t2);
    }
    return partial;
}

// ── Delete ──
function deleteType(type){
    type = type.toUpperCase();
    if(!S.ifcMeshes[type] || S.ifcMeshes[type].length === 0){
        log("No hay meshes de tipo " + type, "c-warn"); return;
    }
    var count = S.ifcMeshes[type].length;
    var idsToRemove = [];
    S.ifcMeshes[type].forEach(function(m){
        if(m.userData.expressID) idsToRemove.push(m.userData.expressID);
        S.modelGroup.remove(m);
        if(m.geometry) m.geometry.dispose();
        if(m.material){
            if(Array.isArray(m.material)) m.material.forEach(function(mt){mt.dispose();});
            else m.material.dispose();
        }
    });
    delete S.ifcMeshes[type];
    delete S.ifcVisibility[type];
    if(S.selectedType === type) S.selectedType = null;
    removeFromIfcBuffer(idsToRemove);
    updateObjTree();
    log("Eliminados " + count + " meshes tipo " + type + " (" + idsToRemove.length + " entidades del IFC)", "c-ok");
}

function deleteByExpressID(expressID){
    var found = false;
    for(var t in S.ifcMeshes){
        for(var i = S.ifcMeshes[t].length - 1; i >= 0; i--){
            var m = S.ifcMeshes[t][i];
            if(m.userData.expressID === expressID){
                S.modelGroup.remove(m);
                if(m.geometry) m.geometry.dispose();
                if(m.material) m.material.dispose();
                S.ifcMeshes[t].splice(i, 1);
                found = true;
                log("Eliminado #" + expressID + " (" + t + ")", "c-ok");
            }
        }
        if(S.ifcMeshes[t].length === 0){
            delete S.ifcMeshes[t];
            delete S.ifcVisibility[t];
        }
    }
    if(found){
        removeFromIfcBuffer([expressID]);
        updateObjTree();
    } else {
        log("No se encontró mesh con expressID #" + expressID, "c-warn");
    }
}

function deleteMerged(){
    var count = 0;
    if(!S.modelGroup) return;
    var toRemove = [];
    S.modelGroup.traverse(function(o){
        if(o.isMesh && o.userData.merged) toRemove.push(o);
    });
    toRemove.forEach(function(m){
        var t = m.userData.ifcType;
        S.modelGroup.remove(m);
        if(m.geometry) m.geometry.dispose();
        if(m.material) m.material.dispose();
        if(S.ifcMeshes[t]){
            var idx = S.ifcMeshes[t].indexOf(m);
            if(idx >= 0) S.ifcMeshes[t].splice(idx, 1);
            if(S.ifcMeshes[t].length === 0){
                delete S.ifcMeshes[t];
                delete S.ifcVisibility[t];
            }
        }
        count++;
    });
    if(S.ifcModel){
        S.ifcModel.mergeBuffer = null;
        S.ifcModel.mergeFilter = null;
        S.ifcModel.mergeOffset = null;
        S.ifcModel.manualMoveOffset = null;
    }
    updateObjTree();
    log("Eliminados " + count + " meshes fusionados (merge buffer limpiado)", "c-ok");
}

function deleteSelectedOrPrompt(){
    if(S.selectedType){
        if(confirm("¿Eliminar todos los elementos de tipo " + S.selectedType + "?")){
            deleteType(S.selectedType);
        }
    } else {
        log("Seleccione un tipo en el árbol de objetos primero, o use: delete <tipo>", "c-warn");
    }
}

// ═══════════════════════════════════════════════════════════════════
// Recorte / Clipping Planes
// ═══════════════════════════════════════════════════════════════════

// Obtener bounding box del modelo para limites del clip
function _clipBounds(){
    if(!S.modelGroup) return null;
    var box = new THREE.Box3().setFromObject(S.modelGroup);
    return { min: box.min, max: box.max, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
}

// Activar clipping en eje dado a valor dado
// axis: "x","y","z"   value: posicion de corte   flip: invertir
function enableClipping(axis, value, flip){
    var normal;
    var f = flip ? -1 : 1;
    switch(axis){
        case "x": normal = new THREE.Vector3(f, 0, 0); break;
        case "z": normal = new THREE.Vector3(0, 0, f); break;
        default:  normal = new THREE.Vector3(0, f, 0); break; // "y"
    }
    // THREE.Plane: normal apunta hacia el lado VISIBLE, constant = -dot(normal, point)
    S.clippingPlane = new THREE.Plane(normal, -value * f);
    S.clippingEnabled = true;
    S.clippingAxis = axis;
    S.clippingValue = value;
    S.clippingFlip = !!flip;
    _applyClipToMaterials();
    _updateClipHelpers();
}

// Desactivar clipping
function disableClipping(){
    S.clippingEnabled = false;
    S.clippingPlane = null;
    S.clippingPlane2 = null;
    _removeClipHelpers();
    _applyClipToMaterials();
}

// Mover posicion del plano de corte
function setClipValue(val){
    if(!S.clippingEnabled || !S.clippingPlane) return;
    S.clippingValue = val;
    var f = S.clippingFlip ? -1 : 1;
    S.clippingPlane.constant = -val * f;
    _moveClipHelpers(val);
}

// Invertir direccion del corte
function flipClipping(){
    if(!S.clippingEnabled) return;
    enableClipping(S.clippingAxis, S.clippingValue, !S.clippingFlip);
}

// ═══ HELPERS VISUALES DEL RECORTE: Plano de referencia + Flechas ═══

function _removeClipHelpers(){
    if(S.clipHelperGroup){
        S.scene.remove(S.clipHelperGroup);
        S.clipHelperGroup.traverse(function(o){
            if(o.geometry) o.geometry.dispose();
            if(o.material){
                if(Array.isArray(o.material)) o.material.forEach(function(m){m.dispose();});
                else o.material.dispose();
            }
        });
        S.clipHelperGroup = null;
    }
}

function _updateClipHelpers(){
    _removeClipHelpers();
    if(!S.clippingEnabled || !S.modelGroup) return;

    var cb = _clipBounds();
    if(!cb) return;

    S.clipHelperGroup = new THREE.Group();
    S.clipHelperGroup.name = "clip_helpers";

    var axis = S.clippingAxis;
    var val = S.clippingValue;
    var flip = S.clippingFlip;
    var cx = cb.center.x, cy = cb.center.y, cz = cb.center.z;
    var sx = cb.size.x, sy = cb.size.y, sz = cb.size.z;
    var maxDim = Math.max(sx, sy, sz);

    // Tamaño del plano visual: cubrir el modelo con margen
    var margin = 1.3;
    var planeW, planeH;
    var planePos = new THREE.Vector3();
    var planeRot = new THREE.Euler();

    // Dirección de la flecha perpendicular (normal del recorte → lado visible)
    var arrowDir = new THREE.Vector3();
    var arrowLen;

    // Ejes paralelos al plano (para flechas en-plano)
    var inPlane1 = new THREE.Vector3();
    var inPlane2 = new THREE.Vector3();
    var ip1Len, ip2Len;

    switch(axis){
        case "x":
            planeW = sz * margin; planeH = sy * margin;
            planePos.set(val, cy, cz);
            planeRot.set(0, Math.PI / 2, 0);
            arrowDir.set(flip ? -1 : 1, 0, 0);
            arrowLen = sx * 0.25;
            inPlane1.set(0, 1, 0); ip1Len = sy * 0.5;
            inPlane2.set(0, 0, 1); ip2Len = sz * 0.5;
            break;
        case "z":
            planeW = sx * margin; planeH = sy * margin;
            planePos.set(cx, cy, val);
            planeRot.set(Math.PI / 2, 0, 0);
            arrowDir.set(0, 0, flip ? -1 : 1);
            arrowLen = sz * 0.25;
            inPlane1.set(1, 0, 0); ip1Len = sx * 0.5;
            inPlane2.set(0, 1, 0); ip2Len = sy * 0.5;
            break;
        default: // "y"
            planeW = sx * margin; planeH = sz * margin;
            planePos.set(cx, val, cz);
            planeRot.set(0, 0, 0);
            arrowDir.set(0, flip ? -1 : 1, 0);
            arrowLen = sy * 0.25;
            inPlane1.set(1, 0, 0); ip1Len = sx * 0.5;
            inPlane2.set(0, 0, 1); ip2Len = sz * 0.5;
            break;
    }

    // ── 1. Plano visual semitransparente ──
    var planeGeom = new THREE.PlaneGeometry(planeW, planeH);
    var planeMat = new THREE.MeshBasicMaterial({
        color: 0xff4488,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    var planeMesh = new THREE.Mesh(planeGeom, planeMat);
    planeMesh.position.copy(planePos);
    planeMesh.rotation.copy(planeRot);
    planeMesh.renderOrder = 999;
    planeMesh.name = "clipPlane";
    S.clipHelperGroup.add(planeMesh);

    // ── 2. Bordes del plano ──
    var edgeGeom = new THREE.EdgesGeometry(planeGeom);
    var edgeMat = new THREE.LineBasicMaterial({ color: 0xff4488, linewidth: 2, transparent: true, opacity: 0.7 });
    var edges = new THREE.LineSegments(edgeGeom, edgeMat);
    edges.position.copy(planePos);
    edges.rotation.copy(planeRot);
    edges.renderOrder = 999;
    edges.name = "clipEdges";
    S.clipHelperGroup.add(edges);

    // ── 3. Flecha perpendicular (dirección del recorte = lado visible) ──
    if(arrowLen < 0.3) arrowLen = 0.3;
    var arrowColor = 0xff2266;
    var headLen = arrowLen * 0.35;
    var headW = headLen * 0.5;
    var arrow = new THREE.ArrowHelper(arrowDir, planePos.clone(), arrowLen, arrowColor, headLen, headW);
    arrow.renderOrder = 1000;
    arrow.name = "clipArrowPerp";
    S.clipHelperGroup.add(arrow);

    // ── 4. Cruz de flechas en el plano (siempre visible en cualquier vista) ──
    var crossColor = 0xff6699;
    var crossLen1 = ip1Len * 0.6;
    var crossLen2 = ip2Len * 0.6;
    var crossHead = maxDim * 0.02;
    var crossHeadW = crossHead * 0.6;
    if(crossLen1 > 0.2){
        // Flecha +inPlane1
        var a1 = new THREE.ArrowHelper(inPlane1, planePos.clone(), crossLen1, crossColor, crossHead, crossHeadW);
        a1.renderOrder = 1000; a1.name = "clipCross1p";
        S.clipHelperGroup.add(a1);
        // Flecha -inPlane1
        var a1n = new THREE.ArrowHelper(inPlane1.clone().negate(), planePos.clone(), crossLen1, crossColor, crossHead, crossHeadW);
        a1n.renderOrder = 1000; a1n.name = "clipCross1n";
        S.clipHelperGroup.add(a1n);
    }
    if(crossLen2 > 0.2){
        // Flecha +inPlane2
        var a2 = new THREE.ArrowHelper(inPlane2, planePos.clone(), crossLen2, crossColor, crossHead, crossHeadW);
        a2.renderOrder = 1000; a2.name = "clipCross2p";
        S.clipHelperGroup.add(a2);
        // Flecha -inPlane2
        var a2n = new THREE.ArrowHelper(inPlane2.clone().negate(), planePos.clone(), crossLen2, crossColor, crossHead, crossHeadW);
        a2n.renderOrder = 1000; a2n.name = "clipCross2n";
        S.clipHelperGroup.add(a2n);
    }

    // ── 5. Etiqueta de eje (sprite en el extremo de la flecha perpendicular) ──
    var labelOffset = arrowLen * 1.15;
    var labelPos = planePos.clone().add(arrowDir.clone().multiplyScalar(labelOffset));
    var axisLabel = axis.toUpperCase() + (flip ? "−" : "+");
    var sprite = _makeTextSprite(axisLabel, { fontSize: 56, color: "#ff4488", bgColor: "rgba(0,0,0,0.7)" });
    sprite.position.copy(labelPos);
    sprite.renderOrder = 1001;
    sprite.name = "clipLabel";
    S.clipHelperGroup.add(sprite);

    // ── 6. Etiqueta de valor (posición del corte) ──
    var valLabelPos;
    switch(axis){
        case "x": valLabelPos = new THREE.Vector3(val, cb.max.y + maxDim*0.05, cz); break;
        case "z": valLabelPos = new THREE.Vector3(cx, cb.max.y + maxDim*0.05, val); break;
        default:  valLabelPos = new THREE.Vector3(cb.max.x + maxDim*0.05, val, cz); break;
    }
    var valText = axis.toUpperCase() + "=" + val.toFixed(2) + "m";
    var valSprite = _makeTextSprite(valText, { fontSize: 40, color: "#ffaacc", bgColor: "rgba(0,0,0,0.6)" });
    valSprite.position.copy(valLabelPos);
    valSprite.renderOrder = 1001;
    valSprite.name = "clipValLabel";
    S.clipHelperGroup.add(valSprite);

    S.scene.add(S.clipHelperGroup);
}

// Mover los helpers a nueva posición (optimizado para slider fluido)
function _moveClipHelpers(val){
    if(!S.clipHelperGroup || !S.clipHelperGroup.children.length){
        if(S.clippingEnabled) _updateClipHelpers();
        return;
    }
    var axis = S.clippingAxis;
    var cb = _clipBounds();
    if(!cb) return;
    var maxDim = Math.max(cb.size.x, cb.size.y, cb.size.z);

    // Mover todos los hijos a la nueva posición en el eje de recorte
    S.clipHelperGroup.children.forEach(function(child){
        switch(axis){
            case "x": child.position.x = val; break;
            case "z": child.position.z = val; break;
            default:  child.position.y = val; break;
        }
    });

    // Ajustar etiqueta de valor (último hijo = valSprite)
    var valSprite = null;
    S.clipHelperGroup.children.forEach(function(c){ if(c.name === "clipValLabel") valSprite = c; });
    if(valSprite){
        switch(axis){
            case "x": valSprite.position.set(val, cb.max.y + maxDim*0.05, cb.center.z); break;
            case "z": valSprite.position.set(cb.center.x, cb.max.y + maxDim*0.05, val); break;
            default:  valSprite.position.set(cb.max.x + maxDim*0.05, val, cb.center.z); break;
        }
        // Actualizar texto del valor
        valSprite.material.map.dispose();
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        var text = axis.toUpperCase() + "=" + val.toFixed(2) + "m";
        ctx.font = "bold 40px Arial";
        var tw = ctx.measureText(text).width;
        var pad = 16;
        canvas.width = tw + pad * 2;
        canvas.height = 56 + pad;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        _roundRect(ctx, 0, 0, canvas.width, canvas.height, 6);
        ctx.fill();
        ctx.font = "bold 40px Arial";
        ctx.fillStyle = "#ffaacc";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width/2, canvas.height/2);
        var tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        valSprite.material.map = tex;
        valSprite.material.needsUpdate = true;
    }

    // Ajustar posición de la etiqueta de eje
    var labelSprite = null;
    S.clipHelperGroup.children.forEach(function(c){ if(c.name === "clipLabel") labelSprite = c; });
    if(labelSprite){
        var flip = S.clippingFlip;
        var f = flip ? -1 : 1;
        var arrowLen;
        switch(axis){
            case "x": arrowLen = cb.size.x * 0.25; break;
            case "z": arrowLen = cb.size.z * 0.25; break;
            default:  arrowLen = cb.size.y * 0.25; break;
        }
        if(arrowLen < 0.3) arrowLen = 0.3;
        var offset = arrowLen * 1.15;
        switch(axis){
            case "x": labelSprite.position.set(val + f * offset, cb.center.y, cb.center.z); break;
            case "z": labelSprite.position.set(cb.center.x, cb.center.y, val + f * offset); break;
            default:  labelSprite.position.set(cb.center.x, val + f * offset, cb.center.z); break;
        }
    }
}

// Crear sprite de texto para etiquetas 3D
function _makeTextSprite(text, opts){
    opts = opts || {};
    var fontSize = opts.fontSize || 36;
    var color = opts.color || "#ffffff";
    var bgColor = opts.bgColor || "rgba(0,0,0,0.5)";

    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    ctx.font = "bold " + fontSize + "px Arial";
    var metrics = ctx.measureText(text);
    var tw = metrics.width;
    var pad = fontSize * 0.4;
    canvas.width = tw + pad * 2;
    canvas.height = fontSize * 1.4 + pad;

    ctx.fillStyle = bgColor;
    var r = 6;
    _roundRect(ctx, 0, 0, canvas.width, canvas.height, r);
    ctx.fill();

    ctx.font = "bold " + fontSize + "px Arial";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var sprite = new THREE.Sprite(mat);
    // Escalar sprite según tamaño del modelo
    var cb = _clipBounds();
    var scale = cb ? Math.max(cb.size.x, cb.size.y, cb.size.z) * 0.06 : 1;
    sprite.scale.set(scale * (canvas.width / canvas.height), scale, 1);
    return sprite;
}

function _roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Aplicar/quitar plano de recorte a TODOS los materiales del modelo
function _applyClipToMaterials(){
    if(!S.modelGroup) return;
    var planes = [];
    if(S.clippingEnabled && S.clippingPlane) planes.push(S.clippingPlane);
    if(S.clippingEnabled && S.clippingPlane2) planes.push(S.clippingPlane2);
    S.modelGroup.traverse(function(obj){
        if(obj.isMesh && obj.material){
            obj.material.clippingPlanes = planes;
            obj.material.needsUpdate = true;
            // Reforzar: meshes ocultos individualmente permanecen ocultos
            if(obj.userData && obj.userData._individuallyHidden){
                obj.visible = false;
            }
        }
    });
    // Tambien wireframe group
    if(S.wireGroup){
        S.wireGroup.traverse(function(obj){
            if(obj.material){
                obj.material.clippingPlanes = planes;
                obj.material.needsUpdate = true;
            }
        });
    }
    _updateClipPanel();
}

// Auto-detectar eje de clip segun vista ortho activa
function getClipAxisForCurrentView(){
    // Basado en la posicion de la camara respecto al centro del modelo
    if(!S.isOrtho || !S.camera) return "y";
    var dir = new THREE.Vector3();
    S.camera.getWorldDirection(dir);
    var ax = Math.abs(dir.x), ay = Math.abs(dir.y), az = Math.abs(dir.z);
    if(az >= ax && az >= ay) return "z"; // elevxy: mira en Z
    if(ax >= ay && ax >= az) return "x"; // elevyz: mira en X
    return "y"; // elevxz: mira en Y
}

// Actualizar GUI del clip panel
function _updateClipPanel(){
    var panel = document.getElementById("clipPanel");
    if(!panel) return;
    var slider = document.getElementById("clipSlider");
    var valInput = document.getElementById("clipValue");
    var axisLabel = document.getElementById("clipAxisLabel");
    if(S.clippingEnabled){
        if(axisLabel) axisLabel.textContent = S.clippingAxis.toUpperCase() + (S.clippingFlip ? " ▼" : " ▲");
        if(valInput) valInput.value = S.clippingValue.toFixed(2);
        if(slider) slider.value = S.clippingValue;
    }
}

// ═══════════════════════════════════════════════════════════════════
// Mover elementos por coordenadas
// ═══════════════════════════════════════════════════════════════════

// Mover el mesh seleccionado relativamente (dx, dy, dz)
function moveSelected(dx, dy, dz){
    if(!S.selectedMesh){
        log("No hay elemento seleccionado. Active modo seleccion y haga clic en un mesh.", "c-warn");
        return;
    }
    S.selectedMesh.position.x += dx;
    S.selectedMesh.position.y += dy;
    S.selectedMesh.position.z += dz;
    var id = S.selectedMesh.userData.expressID || "?";
    var type = S.selectedMesh.userData.ifcType || "?";
    log("Movido #" + id + " (" + type + ") dx=" + dx.toFixed(3) + " dy=" + dy.toFixed(3) + " dz=" + dz.toFixed(3), "c-ok");
    _updateMovePanel();
}

// Mover el mesh seleccionado a una coordenada absoluta (centro del bounding box)
function moveSelectedTo(x, y, z){
    if(!S.selectedMesh){
        log("No hay elemento seleccionado.", "c-warn");
        return;
    }
    // Calcular centro actual del mesh en coordenadas mundo
    S.selectedMesh.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(S.selectedMesh);
    var currentCenter = box.getCenter(new THREE.Vector3());
    // Calcular delta necesario
    var dx = x - currentCenter.x;
    var dy = y - currentCenter.y;
    var dz = z - currentCenter.z;
    S.selectedMesh.position.x += dx;
    S.selectedMesh.position.y += dy;
    S.selectedMesh.position.z += dz;
    var id = S.selectedMesh.userData.expressID || "?";
    log("Movido #" + id + " a X=" + x.toFixed(3) + " Y=" + y.toFixed(3) + " Z=" + z.toFixed(3), "c-ok");
    _updateMovePanel();
}

// Mover todos los meshes de un tipo
function moveType(type, dx, dy, dz){
    type = type.toUpperCase();
    if(!S.ifcMeshes[type]){
        log("No hay meshes de tipo " + type, "c-warn");
        return;
    }
    var count = 0;
    S.ifcMeshes[type].forEach(function(m){
        m.position.x += dx;
        m.position.y += dy;
        m.position.z += dz;
        count++;
    });
    log("Movidos " + count + " meshes " + type + ": dx=" + dx.toFixed(3) + " dy=" + dy.toFixed(3) + " dz=" + dz.toFixed(3), "c-ok");
}

// Mostrar posicion actual del mesh seleccionado
function showSelectedPosition(){
    if(!S.selectedMesh){
        log("No hay elemento seleccionado.", "c-warn");
        return;
    }
    S.selectedMesh.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(S.selectedMesh);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var id = S.selectedMesh.userData.expressID || "?";
    var type = S.selectedMesh.userData.ifcType || "?";
    log("═══ POSICION #" + id + " (" + type + ") ═══", "c-head");
    log("  Centro:  X=" + center.x.toFixed(3) + "  Y=" + center.y.toFixed(3) + "  Z=" + center.z.toFixed(3), "c-num");
    log("  Tamaño:  " + size.x.toFixed(3) + " x " + size.y.toFixed(3) + " x " + size.z.toFixed(3) + " m", "c-num");
    log("  Min:     X=" + box.min.x.toFixed(3) + "  Y=" + box.min.y.toFixed(3) + "  Z=" + box.min.z.toFixed(3), "c-dim");
    log("  Max:     X=" + box.max.x.toFixed(3) + "  Y=" + box.max.y.toFixed(3) + "  Z=" + box.max.z.toFixed(3), "c-dim");
    log("  Offset:  X=" + S.selectedMesh.position.x.toFixed(3) + "  Y=" + S.selectedMesh.position.y.toFixed(3) + "  Z=" + S.selectedMesh.position.z.toFixed(3), "c-dim");
}

// Actualizar el panel de movimiento GUI si existe
function _updateMovePanel(){
    var panel = document.getElementById("movePanel");
    if(!panel || !S.selectedMesh) return;
    S.selectedMesh.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(S.selectedMesh);
    var center = box.getCenter(new THREE.Vector3());
    var posInfo = document.getElementById("movePosInfo");
    if(posInfo){
        posInfo.textContent = "X:" + center.x.toFixed(2) + " Y:" + center.y.toFixed(2) + " Z:" + center.z.toFixed(2);
    }
}

function removeFromIfcBuffer(expressIDs){
    if(!S.ifcModel || !S.ifcModel.buffer || expressIDs.length === 0) return;
    if(!S.ifcModel.deletedIDs) S.ifcModel.deletedIDs = {};
    expressIDs.forEach(function(id){ S.ifcModel.deletedIDs[id] = true; });
    log("  " + expressIDs.length + " entidades marcadas para eliminar del IFC", "c-dim");
}
