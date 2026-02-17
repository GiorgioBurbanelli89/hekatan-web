// =====================================================================
// THREE.JS Init + Viewport helpers
// =====================================================================
"use strict";
var S = window._S;

function initThree(){
    var container = document.getElementById("viewport");
    var w = container.clientWidth, h = container.clientHeight;

    S.scene = new THREE.Scene();
    S.scene.background = new THREE.Color(0x1a1a2e);

    S.camera = new THREE.PerspectiveCamera(60, w/h, 0.1, 10000);
    S.camera.position.set(20, 15, 20);
    S.camera.up.set(0, 1, 0);

    S.renderer = new THREE.WebGLRenderer({ antialias: true });
    S.renderer.setSize(w, h);
    S.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    S.renderer.shadowMap.enabled = false;
    S.renderer.localClippingEnabled = true;
    container.appendChild(S.renderer.domElement);

    S.controls = new THREE.OrbitControls(S.camera, S.renderer.domElement);
    S.controls.enableDamping = true;
    S.controls.dampingFactor = 0.1;
    S.controls.screenSpacePanning = true;
    // Laptop touchpad: Shift+click = pan (alternativa a click derecho)
    S.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
    };
    // Touch: un dedo=rotar, dos=zoom, tres=pan
    S.controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
    };
    S.controls.zoomSpeed = 1.2;
    S.controls.panSpeed = 1.0;

    var amb = new THREE.AmbientLight(0xffffff, 0.5);
    S.scene.add(amb);
    var dir1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dir1.position.set(50, 80, 60);
    S.scene.add(dir1);
    var dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-30, -40, 40);
    S.scene.add(dir2);

    S.axesHelper = new THREE.AxesHelper(5);
    S.scene.add(S.axesHelper);

    S.gridHelper = new THREE.GridHelper(50, 50, 0x444466, 0x333344);
    S.scene.add(S.gridHelper);

    S.raycaster = new THREE.Raycaster();
    S.mouse = new THREE.Vector2();

    window.addEventListener("resize", function(){
        var w2 = container.clientWidth, h2 = container.clientHeight;
        if(S.isOrtho && S.orthoCamera){
            var aspect = w2 / h2;
            var halfH = S.orthoCamera.top; // mantener la mitad vertical
            S.orthoCamera.left   = -halfH * aspect;
            S.orthoCamera.right  =  halfH * aspect;
            S.orthoCamera.updateProjectionMatrix();
        }
        if(S.camera.isPerspectiveCamera){
            S.camera.aspect = w2/h2;
            S.camera.updateProjectionMatrix();
        }
        S.renderer.setSize(w2, h2);
    });

    S.renderer.domElement.addEventListener("click", onViewportClick);
    S.renderer.domElement.addEventListener("mousemove", onViewportMouseMove);
    S.renderer.domElement.addEventListener("mouseleave", onViewportMouseLeave);

    // Zoom ortografico con rueda del mouse/touchpad
    S.renderer.domElement.addEventListener("wheel", function(e){
        if(!S.isOrtho || !S.orthoCamera) return;
        e.preventDefault();
        var factor = e.deltaY > 0 ? 1.08 : 0.92;
        S.orthoCamera.left *= factor;
        S.orthoCamera.right *= factor;
        S.orthoCamera.top *= factor;
        S.orthoCamera.bottom *= factor;
        S.orthoCamera.updateProjectionMatrix();
    }, {passive: false});

    // ── Pan manual para modo ortografico ──
    // OrbitControls usa pointer events internamente, asi que usamos pointer events
    // con capture:true + stopImmediatePropagation para interceptar ANTES que OrbitControls.
    // Se usa un umbral de movimiento (4px) para distinguir entre clic (seleccion) y arrastre (pan).
    var _orthoPan = { active: false, dragging: false, startX: 0, startY: 0, threshold: 4 };

    S.renderer.domElement.addEventListener("pointerdown", function(e){
        if(!S.isOrtho || !S.orthoCamera) return;
        _orthoPan.active = true;
        _orthoPan.dragging = false;
        _orthoPan.startX = e.clientX;
        _orthoPan.startY = e.clientY;
        // NO stopImmediatePropagation aqui - esperamos a ver si arrastra
    }, true);

    S.renderer.domElement.addEventListener("pointermove", function(e){
        if(!_orthoPan.active || !S.isOrtho || !S.orthoCamera) return;
        var dx = e.clientX - _orthoPan.startX;
        var dy = e.clientY - _orthoPan.startY;

        // Si aun no estamos arrastrando, verificar umbral
        if(!_orthoPan.dragging){
            var totalMove = Math.abs(e.clientX - _orthoPan.startX) + Math.abs(e.clientY - _orthoPan.startY);
            if(totalMove < _orthoPan.threshold) return;
            _orthoPan.dragging = true;
        }

        _orthoPan.startX = e.clientX;
        _orthoPan.startY = e.clientY;

        if(Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

        // Convertir pixeles a unidades mundo segun el frustum actual
        var vw = container.clientWidth;
        var vh = container.clientHeight;
        var frustumW = S.orthoCamera.right - S.orthoCamera.left;
        var frustumH = S.orthoCamera.top - S.orthoCamera.bottom;
        var worldDx = -(dx / vw) * frustumW;
        var worldDy =  (dy / vh) * frustumH;

        // Mover camara y target juntos en el plano de la vista
        S.orthoCamera.updateMatrixWorld(true);
        var camRight = new THREE.Vector3();
        var camUp = new THREE.Vector3();
        camRight.setFromMatrixColumn(S.orthoCamera.matrixWorld, 0).normalize();
        camUp.setFromMatrixColumn(S.orthoCamera.matrixWorld, 1).normalize();

        var panOffset = camRight.clone().multiplyScalar(worldDx).add(camUp.clone().multiplyScalar(worldDy));
        S.orthoCamera.position.add(panOffset);
        S.controls.target.add(panOffset);

        e.stopImmediatePropagation();
        e.preventDefault();
    }, true);

    S.renderer.domElement.addEventListener("pointerup", function(e){
        if(_orthoPan.active){
            var wasDragging = _orthoPan.dragging;
            _orthoPan.active = false;
            _orthoPan.dragging = false;
            if(wasDragging){
                // Fue un arrastre (pan) — no permitir que el click propague
                e.stopImmediatePropagation();
            }
            // Si NO fue arrastre (fue un clic simple), dejar que el click event pase para seleccion
        }
    }, true);

    // Prevenir menu contextual en ortho para que click derecho sea pan
    S.renderer.domElement.addEventListener("contextmenu", function(e){
        if(S.isOrtho) e.preventDefault();
    });

    // Marcador de snap (esfera pequeña)
    var snapGeo = new THREE.SphereGeometry(0.025, 10, 10);
    var snapMat = new THREE.MeshBasicMaterial({color: 0x00ffff, depthTest: false, transparent: true, opacity: 0.9});
    S.snapMarker = new THREE.Mesh(snapGeo, snapMat);
    S.snapMarker.renderOrder = 999;
    S.snapMarker.visible = false;
    S.scene.add(S.snapMarker);

    // Navegacion por teclado (flechas=pan, +/-=zoom, WASD=rotar)
    var _keys = {};
    document.addEventListener("keydown", function(e){
        // No capturar si estamos en el input CLI
        if(document.activeElement && document.activeElement.id === "cliInput") return;
        _keys[e.key] = true;
    });
    document.addEventListener("keyup", function(e){ _keys[e.key] = false; });

    function animate(){
        requestAnimationFrame(animate);
        var panStep = 0.3;
        if(S.isOrtho && S.orthoCamera){
            // En ortho: flechas mueven segun ejes de la camara
            // El frustum es proporcional, escalar panStep
            var fw = S.orthoCamera.right - S.orthoCamera.left;
            var kStep = fw * 0.01; // 1% del ancho visible
            var camRight = new THREE.Vector3();
            var camUp = new THREE.Vector3();
            camRight.setFromMatrixColumn(S.orthoCamera.matrixWorld, 0).normalize();
            camUp.setFromMatrixColumn(S.orthoCamera.matrixWorld, 1).normalize();
            var moveVec = new THREE.Vector3();
            if(_keys["ArrowLeft"])  moveVec.add(camRight.clone().multiplyScalar(-kStep));
            if(_keys["ArrowRight"]) moveVec.add(camRight.clone().multiplyScalar(kStep));
            if(_keys["ArrowUp"])    moveVec.add(camUp.clone().multiplyScalar(kStep));
            if(_keys["ArrowDown"])  moveVec.add(camUp.clone().multiplyScalar(-kStep));
            if(moveVec.lengthSq() > 0){
                S.orthoCamera.position.add(moveVec);
                S.controls.target.add(moveVec);
            }
        } else {
            if(_keys["ArrowLeft"])  S.controls.target.x -= panStep, S.camera.position.x -= panStep;
            if(_keys["ArrowRight"]) S.controls.target.x += panStep, S.camera.position.x += panStep;
            if(_keys["ArrowUp"])    S.controls.target.y += panStep, S.camera.position.y += panStep;
            if(_keys["ArrowDown"])  S.controls.target.y -= panStep, S.camera.position.y -= panStep;
        }
        if(_keys["+"] || _keys["="]){
            if(S.isOrtho && S.orthoCamera){
                var f = 0.97;
                var cw = S.orthoCamera.right - S.orthoCamera.left;
                S.orthoCamera.left *= f; S.orthoCamera.right *= f;
                S.orthoCamera.top *= f; S.orthoCamera.bottom *= f;
                S.orthoCamera.updateProjectionMatrix();
            } else {
                S.camera.position.lerp(S.controls.target, 0.05);
            }
        }
        if(_keys["-"]){
            if(S.isOrtho && S.orthoCamera){
                var f2 = 1.03;
                S.orthoCamera.left *= f2; S.orthoCamera.right *= f2;
                S.orthoCamera.top *= f2; S.orthoCamera.bottom *= f2;
                S.orthoCamera.updateProjectionMatrix();
            } else {
                var dir = S.camera.position.clone().sub(S.controls.target).normalize();
                S.camera.position.add(dir.multiplyScalar(0.5));
            }
        }
        if(!S.isOrtho) S.controls.update();
        // Reforzar ocultamiento individual en cada frame
        if(S._hiddenMeshes && S._hiddenMeshes.length > 0){
            for(var _hi = 0; _hi < S._hiddenMeshes.length; _hi++){
                if(S._hiddenMeshes[_hi] && S._hiddenMeshes[_hi].visible){
                    S._hiddenMeshes[_hi].visible = false;
                }
            }
        }
        var cam = S.isOrtho ? S.orthoCamera : S.camera;
        S.renderer.render(S.scene, cam);
    }
    animate();
}

// Construir rayo manualmente para camara ortografica.
// Three.js r149 setFromCamera() puede fallar si projectionMatrixInverse
// no se recomputo despues de zoom o cambio de frustum.
function _setRayFromOrthoCamera(raycaster, mouse, cam){
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    // Recomputar projectionMatrixInverse manualmente
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    // Origen: punto en NDC (mouse.x, mouse.y, -1) transformado a mundo
    var origin = new THREE.Vector3(mouse.x, mouse.y, -1);
    origin.applyMatrix4(cam.projectionMatrixInverse);
    origin.applyMatrix4(cam.matrixWorld);

    // Direccion: la camara ortho mira en su eje -Z local
    var direction = new THREE.Vector3(0, 0, -1);
    direction.transformDirection(cam.matrixWorld);

    raycaster.ray.origin.copy(origin);
    raycaster.ray.direction.copy(direction);
    raycaster.near = 0;
    raycaster.far = Infinity;
}

function onViewportClick(e){
    if(!S.selectMode) return;
    if(!S.modelGroup || !S.modelGroup.children.length) return;
    var rect = S.renderer.domElement.getBoundingClientRect();
    S.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    S.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    var cam = (S.isOrtho && S.orthoCamera) ? S.orthoCamera : S.camera;

    if(S.isOrtho && cam.isOrthographicCamera){
        _setRayFromOrthoCamera(S.raycaster, S.mouse, cam);
    } else {
        S.raycaster.setFromCamera(S.mouse, cam);
    }
    var hits = S.raycaster.intersectObjects(S.modelGroup.children, false);

    var isCtrl = e.ctrlKey || e.metaKey;

    if(hits.length > 0){
        var obj = hits[0].object;
        if(isCtrl){
            // Ctrl+click: toggle en multi-selección
            _toggleMultiSelect(obj);
        } else {
            // Click normal: deseleccionar todo, seleccionar este
            deselectMesh();
            selectMesh(obj);
        }
        showEntityProps(obj.userData.expressID, obj.userData.ifcType);
        log("Seleccionado: #" + (obj.userData.expressID||"?") + " " + (obj.userData.ifcType||"?") +
            (S.selectedMeshes.length > 1 ? "  [" + S.selectedMeshes.length + " seleccionados]" : ""), "c-ok");
    } else if(!isCtrl){
        // Click en vacío sin Ctrl: deseleccionar todo
        deselectMesh();
    }
}

// ═══ Inicializar Map de originales si no existe ═══
function _ensureOriginalsMap(){
    if(!S.selectedOriginals) S.selectedOriginals = new Map();
}

// ═══ Highlight un mesh (guardar original + pintar naranja) ═══
function _highlightMesh(mesh){
    _ensureOriginalsMap();
    if(!S.selectedOriginals.has(mesh)){
        S.selectedOriginals.set(mesh, {
            color: mesh.material.color.clone(),
            opacity: mesh.material.opacity
        });
    }
    mesh.material.color.set(0xff6600);
    mesh.material.opacity = 0.85;
    mesh.material.transparent = true;
    mesh.material.needsUpdate = true;
}

// ═══ Restaurar un mesh a su color/opacidad original ═══
function _unhighlightMesh(mesh){
    _ensureOriginalsMap();
    var orig = S.selectedOriginals.get(mesh);
    if(orig && mesh.material){
        mesh.material.color.copy(orig.color);
        mesh.material.opacity = orig.opacity;
        mesh.material.transparent = orig.opacity < 1;
        mesh.material.needsUpdate = true;
    }
    S.selectedOriginals.delete(mesh);
}

function selectMesh(mesh){
    if(!mesh || !mesh.material) return;
    _ensureOriginalsMap();
    // Guardar color/opacidad original (compat legacy)
    S.selectedMesh = mesh;
    S.selectedOrigColor = mesh.material.color.clone();
    S.selectedOrigOpacity = mesh.material.opacity;
    // Agregar a multi-selección
    if(S.selectedMeshes.indexOf(mesh) < 0) S.selectedMeshes.push(mesh);
    // Highlight
    _highlightMesh(mesh);
    // Actualizar botones de seleccion
    _updateSelButtons();
}

// ═══ Toggle Ctrl+click: agregar o quitar de multi-selección ═══
function _toggleMultiSelect(mesh){
    if(!mesh || !mesh.material) return;
    _ensureOriginalsMap();
    var idx = S.selectedMeshes.indexOf(mesh);
    if(idx >= 0){
        // Ya seleccionado → quitar
        _unhighlightMesh(mesh);
        S.selectedMeshes.splice(idx, 1);
    } else {
        // Agregar a selección
        S.selectedMeshes.push(mesh);
        _highlightMesh(mesh);
    }
    // Actualizar S.selectedMesh al último
    if(S.selectedMeshes.length > 0){
        var last = S.selectedMeshes[S.selectedMeshes.length - 1];
        S.selectedMesh = last;
        var origLast = S.selectedOriginals.get(last);
        S.selectedOrigColor = origLast ? origLast.color.clone() : null;
        S.selectedOrigOpacity = origLast ? origLast.opacity : 1;
    } else {
        S.selectedMesh = null;
        S.selectedOrigColor = null;
        S.selectedOrigOpacity = null;
    }
    _updateSelButtons();
}

function deselectMesh(){
    _ensureOriginalsMap();
    // Restaurar todos los meshes multi-seleccionados
    S.selectedMeshes.forEach(function(m){
        _unhighlightMesh(m);
    });
    S.selectedMeshes = [];
    S.selectedMesh = null;
    S.selectedOrigColor = null;
    S.selectedOrigOpacity = null;
    _updateSelButtons();
}

// ═══ Actualizar botones de selección ═══
function _updateSelButtons(){
    var btn = document.getElementById("btnDeleteSel");
    var btnH = document.getElementById("btnHideSel");
    var btnT = document.getElementById("btnTranspSel");
    var btnI = document.getElementById("btnIsolateSel");
    var n = S.selectedMeshes.length;
    if(n > 0){
        var selLabel = n === 1
            ? "#"+(S.selectedMesh.userData.expressID||"?")+" ("+S.selectedMesh.userData.ifcType+")"
            : n + " elementos";
        if(btn){ btn.disabled = false; btn.title = "Eliminar "+selLabel; }
        if(btnH){ btnH.disabled = false; btnH.title = "Ocultar "+selLabel; }
        if(btnT){ btnT.disabled = false; btnT.title = "Transparente "+selLabel; }
        if(btnI){ btnI.disabled = false; btnI.title = "Aislar "+selLabel; }
    } else {
        if(btn){ btn.disabled = true; btn.title = "Seleccione un elemento primero"; }
        if(btnH){ btnH.disabled = true; btnH.title = "Seleccione un elemento primero"; }
        if(btnT){ btnT.disabled = true; btnT.title = "Seleccione un elemento primero"; }
        if(btnI){ btnI.disabled = true; btnI.title = "Seleccione un elemento primero"; }
    }
}

// ═══ AISLAR: mostrar SOLO los seleccionados, ocultar el resto ═══
function isolateSelectedMeshes(){
    if(S.selectedMeshes.length === 0){
        log("No hay elementos seleccionados. Use Ctrl+clic para multi-seleccionar.", "c-warn");
        return;
    }
    // Si ya estamos aislados, des-aislar primero
    if(S._isolatedMode) unisolateMeshes();

    var selSet = new Set(S.selectedMeshes);
    var hidden = [];
    var ids = [];
    S.modelGroup.traverse(function(o){
        if(!o.isMesh) return;
        if(!selSet.has(o)){
            // Ocultar este mesh
            o.visible = false;
            o.userData._isolatedHidden = true;
            hidden.push(o);
        }
    });
    S._isolatedHidden = hidden;
    S._isolatedMode = true;

    // Recoger IDs de los seleccionados para log y persistencia
    S.selectedMeshes.forEach(function(m){
        if(m.userData.expressID) ids.push(m.userData.expressID);
    });

    // Restaurar highlight de selección (quedan visibles sin naranja)
    S.selectedMeshes.forEach(function(m){ _unhighlightMesh(m); });
    S.selectedMeshes = [];
    S.selectedMesh = null;
    S.selectedOrigColor = null;
    S.selectedOrigOpacity = null;
    _updateSelButtons();

    log("Aislados " + ids.length + " elementos. IDs: " + ids.map(function(i){return "#"+i;}).join(", "), "c-ok");
    log("Usa 'desaislar' o botón '↺ Restaurar' para volver.", "c-dim");

    // Registrar para persistencia (savehtml)
    if(ids.length > 0){
        trackCommand("aislar " + ids.map(function(i){return "#"+i;}).join(" "));
    }

    return ids;
}

// ═══ AISLAR POR IDs (para restaurar desde savehtml) ═══
function _isolateByIds(args){
    if(!S.modelGroup) return;
    // Parsear IDs: aislar #123 #456 #789
    var ids = [];
    args.forEach(function(a){
        var n = parseInt(a.replace("#",""));
        if(!isNaN(n)) ids.push(n);
    });
    if(ids.length === 0){ log("Uso: aislar #id1 #id2 ...", "c-err"); return; }

    // Des-aislar si ya estamos
    if(S._isolatedMode) unisolateMeshes();

    var idSet = new Set(ids);
    var hidden = [];
    var foundCount = 0;
    S.modelGroup.traverse(function(o){
        if(!o.isMesh) return;
        if(idSet.has(o.userData.expressID)){
            foundCount++;
        } else {
            o.visible = false;
            o.userData._isolatedHidden = true;
            hidden.push(o);
        }
    });
    S._isolatedHidden = hidden;
    S._isolatedMode = true;
    log("Aislados " + foundCount + " elementos por ID. " + hidden.length + " ocultos.", "c-ok");
}

// ═══ DES-AISLAR: restaurar visibilidad ═══
function unisolateMeshes(){
    if(!S._isolatedMode) return;
    var count = 0;
    if(S._isolatedHidden){
        S._isolatedHidden.forEach(function(m){
            if(m){
                m.visible = true;
                delete m.userData._isolatedHidden;
                count++;
            }
        });
    }
    S._isolatedHidden = [];
    S._isolatedMode = false;
    if(count > 0) log("Des-aislados " + count + " elementos restaurados.", "c-ok");
}

function deleteSelectedMesh(){
    if(!S.selectedMesh){
        log("No hay elemento seleccionado. Haga clic en un elemento 3D.", "c-warn");
        return;
    }
    var mesh = S.selectedMesh;
    var id = mesh.userData.expressID;
    var type = mesh.userData.ifcType || "?";
    // Limpiar de multi-selección
    _ensureOriginalsMap();
    S.selectedOriginals.delete(mesh);
    var mIdx = S.selectedMeshes.indexOf(mesh);
    if(mIdx >= 0) S.selectedMeshes.splice(mIdx, 1);
    // Restaurar antes de eliminar (para limpiar refs)
    S.selectedMesh = null;
    S.selectedOrigColor = null;
    S.selectedOrigOpacity = null;
    // Eliminar del modelGroup y de ifcMeshes
    S.modelGroup.remove(mesh);
    if(mesh.geometry) mesh.geometry.dispose();
    if(mesh.material) mesh.material.dispose();
    if(S.ifcMeshes[type]){
        var idx = S.ifcMeshes[type].indexOf(mesh);
        if(idx >= 0) S.ifcMeshes[type].splice(idx, 1);
        if(S.ifcMeshes[type].length === 0){
            delete S.ifcMeshes[type];
            delete S.ifcVisibility[type];
        }
    }
    if(id) removeFromIfcBuffer([id]);
    updateObjTree();
    log("Eliminado: #"+id+" ("+type+")", "c-ok");
    // Registrar en historial para persistencia (savehtml/restore)
    if(id) trackCommand("delete #" + id);
    var btn = document.getElementById("btnDeleteSel");
    if(btn){ btn.disabled = true; btn.title = "Seleccione un elemento primero"; }
}

function hideSelectedMesh(){
    console.log("[hideSelectedMesh] called, hasMesh=", !!S.selectedMesh);
    if(!S.selectedMesh){
        log("No hay elemento seleccionado.", "c-warn"); return;
    }
    var mesh = S.selectedMesh;
    var id = mesh.userData.expressID || "?";
    var type = mesh.userData.ifcType || "?";
    // Restaurar color original antes de ocultar
    _ensureOriginalsMap();
    _unhighlightMesh(mesh);
    var mIdx = S.selectedMeshes.indexOf(mesh);
    if(mIdx >= 0) S.selectedMeshes.splice(mIdx, 1);
    // Ocultar el mesh — flag permanente en userData
    mesh.visible = false;
    mesh.userData._individuallyHidden = true;
    // Guardar en lista de ocultos para poder restaurar
    if(!S._hiddenMeshes) S._hiddenMeshes = [];
    S._hiddenMeshes.push(mesh);
    // Actualizar selectedMesh al último del array o null
    if(S.selectedMeshes.length > 0){
        var lastM = S.selectedMeshes[S.selectedMeshes.length - 1];
        S.selectedMesh = lastM;
        var origM = S.selectedOriginals ? S.selectedOriginals.get(lastM) : null;
        S.selectedOrigColor = origM ? origM.color.clone() : null;
        S.selectedOrigOpacity = origM ? origM.opacity : 1;
    } else {
        S.selectedMesh = null;
        S.selectedOrigColor = null;
        S.selectedOrigOpacity = null;
    }
    _updateSelButtons();
    console.log("[hideSelectedMesh] done, hidden flag set, id=" + id);
    log("Oculto: #" + id + " (" + type + ")  — 'Restaurar' para volver", "c-ok");
}

function transparentSelectedMesh(opacity){
    console.log("[transparentSelectedMesh] called, hasMesh=", !!S.selectedMesh);
    if(!S.selectedMesh){
        log("No hay elemento seleccionado.", "c-warn"); return;
    }
    opacity = (typeof opacity === "number") ? opacity : 0.15;
    var mesh = S.selectedMesh;
    var id = mesh.userData.expressID || "?";
    var type = mesh.userData.ifcType || "?";
    // Obtener color original del Map de multi-selección
    _ensureOriginalsMap();
    var orig = S.selectedOriginals.get(mesh);
    var origColor = orig ? orig.color : (S.selectedOrigColor ? S.selectedOrigColor.clone() : mesh.material.color.clone());
    var origOpacity = orig ? orig.opacity : (S.selectedOrigOpacity || mesh.material.opacity);
    // Guardar opacidad original si no está guardada
    if(!mesh.userData._origOpacity && mesh.userData._origOpacity !== 0){
        mesh.userData._origOpacity = origOpacity;
        mesh.userData._origColor = origColor.clone();
    }
    // Restaurar color original pero con opacidad baja
    mesh.material.color.copy(origColor);
    mesh.material.opacity = opacity;
    mesh.material.transparent = true;
    mesh.material.depthWrite = false;
    mesh.material.needsUpdate = true;
    // Guardar en lista de transparentes
    if(!S._transparentMeshes) S._transparentMeshes = [];
    if(S._transparentMeshes.indexOf(mesh) < 0) S._transparentMeshes.push(mesh);
    // Limpiar de multi-selección
    S.selectedOriginals.delete(mesh);
    var mIdx = S.selectedMeshes.indexOf(mesh);
    if(mIdx >= 0) S.selectedMeshes.splice(mIdx, 1);
    // Limpiar seleccion SIN interferir con la transparencia
    S.selectedMesh = null;
    S.selectedOrigColor = null;
    S.selectedOrigOpacity = null;
    _updateSelButtons();
    log("Transparente (" + (opacity*100).toFixed(0) + "%): #" + id + " (" + type + ")  — 'mostrar todo' para restaurar", "c-ok");
}

function restoreAllMeshVisibility(){
    var count = 0;
    // Des-aislar si estamos en modo aislamiento
    if(S._isolatedMode){
        if(S._isolatedHidden){
            S._isolatedHidden.forEach(function(m){
                if(m){ m.visible = true; delete m.userData._isolatedHidden; count++; }
            });
        }
        S._isolatedHidden = [];
        S._isolatedMode = false;
    }
    // Restaurar ocultos
    if(S._hiddenMeshes){
        S._hiddenMeshes.forEach(function(m){
            if(m) { m.visible = true; m.userData._individuallyHidden = false; m.material.needsUpdate = true; count++; }
        });
        S._hiddenMeshes = [];
    }
    // Restaurar transparentes
    if(S._transparentMeshes){
        S._transparentMeshes.forEach(function(m){
            if(m && m.userData._origOpacity !== undefined){
                m.material.opacity = m.userData._origOpacity;
                m.material.transparent = m.userData._origOpacity < 1;
                m.material.depthWrite = true;
                m.material.needsUpdate = true;
                if(m.userData._origColor){
                    m.material.color.copy(m.userData._origColor);
                }
                delete m.userData._origOpacity;
                delete m.userData._origColor;
                count++;
            }
        });
        S._transparentMeshes = [];
    }
    // Restaurar corte de sección si existe
    if(S._sectionState || document.querySelector('[data-section-cut]')){
        _sectionCutCleanup();
        count++;
    }
    // Eliminar líneas de corte huérfanas
    var sectionCuts = [];
    S.scene.traverse(function(o){ if(o.userData && o.userData._sectionCut) sectionCuts.push(o); });
    sectionCuts.forEach(function(o){ if(o.parent) o.parent.remove(o); count++; });
    if(count > 0) log("Restaurados " + count + " elementos", "c-ok");
}

function toggleSelectMode(on){
    S.selectMode = on;
    S.renderer.domElement.style.cursor = on ? "crosshair" : "";
    if(!on) deselectMesh();
    log("Modo selección: "+(on?"ACTIVO":"DESACTIVADO"), on?"c-ok":"c-dim");
}

// ---- Tooltip de coordenadas + snap a vértice cercano ----
var _mvThrottle = 0;
function onViewportMouseMove(e){
    var now = performance.now();
    if(now - _mvThrottle < 50) return; // throttle 50ms
    _mvThrottle = now;

    var tooltip = document.getElementById("coordTooltip");
    if(!tooltip || !S.modelGroup || !S.modelGroup.children.length){ return; }

    var rect = S.renderer.domElement.getBoundingClientRect();
    S.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    S.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    var cam = (S.isOrtho && S.orthoCamera) ? S.orthoCamera : S.camera;
    if(S.isOrtho && cam.isOrthographicCamera){
        _setRayFromOrthoCamera(S.raycaster, S.mouse, cam);
    } else {
        S.raycaster.setFromCamera(S.mouse, cam);
    }
    var hits = S.raycaster.intersectObjects(S.modelGroup.children, false);

    if(hits.length > 0){
        var hit = hits[0];
        var pt = hit.point; // punto de intersección en la superficie

        // Buscar el vértice más cercano al punto de hit
        var mesh = hit.object;
        var snap = findNearestVertex(mesh, pt);

        // En vista planta con nivel activo, fijar Y a la elevacion del corte
        var dispY = snap.y;
        if(S.plantLevelActive >= 0 && S.plantLevelsData && S.plantLevelsData[S.plantLevelActive]){
            dispY = S.plantLevelsData[S.plantLevelActive].elevation;
        }

        // Mostrar tooltip
        tooltip.style.display = "block";
        tooltip.style.left = (e.clientX - rect.left + 14) + "px";
        tooltip.style.top = (e.clientY - rect.top - 28) + "px";
        tooltip.textContent = "X:" + snap.x.toFixed(3) + "  Y:" + dispY.toFixed(3) + "  Z:" + snap.z.toFixed(3);

        // Mover marcador snap
        if(S.snapMarker){
            S.snapMarker.position.copy(snap);
            S.snapMarker.visible = true;
        }
    } else {
        tooltip.style.display = "none";
        if(S.snapMarker) S.snapMarker.visible = false;
    }
}

function onViewportMouseLeave(){
    var tooltip = document.getElementById("coordTooltip");
    if(tooltip) tooltip.style.display = "none";
    if(S.snapMarker) S.snapMarker.visible = false;
}

function findNearestVertex(mesh, point){
    var geo = mesh.geometry;
    if(!geo || !geo.attributes || !geo.attributes.position) return point;

    var pos = geo.attributes.position;
    var best = point.clone();
    var bestDist = Infinity;
    var v = new THREE.Vector3();

    // Para meshes con muchos vértices, muestrear cada N
    var step = pos.count > 5000 ? Math.ceil(pos.count / 2000) : 1;

    for(var i = 0; i < pos.count; i += step){
        v.fromBufferAttribute(pos, i);
        // Transformar a coordenadas mundo
        mesh.localToWorld(v);
        var d = v.distanceTo(point);
        if(d < bestDist){
            bestDist = d;
            best.copy(v);
        }
    }
    // Solo hacer snap si el vértice está cerca (< 0.5m del punto de hit)
    if(bestDist < 0.5) return best;
    return point;
}

// ═══════════════════════════════════════════════════════════════════
// CREAR LOSA RAMPA ESCALERA — genera losa inclinada bajo los peldaños
// ═══════════════════════════════════════════════════════════════════
function createStairRamp(thickness, meshesOverride){
    thickness = thickness || 0.15; // espesor por defecto 15cm
    if(!S.modelGroup || !S.modelGroup.children.length){
        log("No hay modelo cargado.", "c-err"); return;
    }

    // 1. Usar meshes proporcionados, seleccionados, o buscar por tipo.
    var stairMeshes = [];
    if(meshesOverride && meshesOverride.length > 0){
        stairMeshes = meshesOverride;
        log("Usando " + stairMeshes.length + " mesh(es) por ID como escalera.", "c-warn");
    } else if(S.selectedMeshes && S.selectedMeshes.length > 0){
        stairMeshes = S.selectedMeshes.slice();
        log("Usando " + stairMeshes.length + " mesh(es) seleccionado(s) como escalera.", "c-warn");
    } else if(S.selectedMesh){
        stairMeshes = [S.selectedMesh];
        log("Usando mesh seleccionado #" + (S.selectedMesh.userData.expressID||"?") + " como escalera.", "c-warn");
    } else {
        // Buscar por tipo IFC
        S.modelGroup.traverse(function(o){
            if(!o.isMesh || !o.visible) return;
            var t = (o.userData.ifcType || "").toUpperCase();
            if(t === "IFCSTAIR" || t === "IFCSTAIRFLIGHT" || t === "IFCBUILDINGELEMENTPART"
               || (o.userData.merged && t.indexOf("STAIR") >= 0)){
                stairMeshes.push(o);
            }
        });
        if(stairMeshes.length === 0){
            log("No se encontró escalera. Use: rampescalera 0.15 #ID", "c-err");
            log("  Seleccione la escalera y use: rampescalera 0.15 sel", "c-err");
            return;
        }
    }

    log("Analizando " + stairMeshes.length + " meshes de escalera...", "c-warn");

    // 2. Recolectar TODOS los vértices en coordenadas mundo
    var allVerts = [];
    stairMeshes.forEach(function(mesh){
        var pos = mesh.geometry.attributes.position;
        if(!pos) return;
        for(var i = 0; i < pos.count; i++){
            var v = new THREE.Vector3().fromBufferAttribute(pos, i);
            mesh.localToWorld(v);
            allVerts.push(v);
        }
    });

    if(allVerts.length < 3){
        log("Geometría de escalera insuficiente.", "c-err"); return;
    }

    // 3. Calcular bounding box global y ancho (eje lateral)
    var bbMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    var bbMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    allVerts.forEach(function(v){
        bbMin.min(v);
        bbMax.max(v);
    });

    var sizeX = bbMax.x - bbMin.x;
    var sizeZ = bbMax.z - bbMin.z;
    var sizeY = bbMax.y - bbMin.y;

    log("  BBox escalera: X=" + sizeX.toFixed(2) + " Y=" + sizeY.toFixed(2) + " Z=" + sizeZ.toFixed(2), "c-dim");
    log("  Min: (" + bbMin.x.toFixed(2) + ", " + bbMin.y.toFixed(2) + ", " + bbMin.z.toFixed(2) + ")", "c-dim");
    log("  Max: (" + bbMax.x.toFixed(2) + ", " + bbMax.y.toFixed(2) + ", " + bbMax.z.toFixed(2) + ")", "c-dim");

    // 4. Agrupar vértices por nivel Y para identificar peldaños y descansos
    var yBinSize = 0.02;
    var yBins = {};
    allVerts.forEach(function(v){
        var yKey = Math.round(v.y / yBinSize);
        if(!yBins[yKey]) yBins[yKey] = { y: 0, count: 0, xMin: Infinity, xMax: -Infinity, zMin: Infinity, zMax: -Infinity };
        yBins[yKey].y += v.y;
        yBins[yKey].count++;
        if(v.x < yBins[yKey].xMin) yBins[yKey].xMin = v.x;
        if(v.x > yBins[yKey].xMax) yBins[yKey].xMax = v.x;
        if(v.z < yBins[yKey].zMin) yBins[yKey].zMin = v.z;
        if(v.z > yBins[yKey].zMax) yBins[yKey].zMax = v.z;
    });

    var yLevels = [];
    for(var key in yBins){
        var b = yBins[key];
        yLevels.push({ y: b.y / b.count, count: b.count, xMin: b.xMin, xMax: b.xMax, zMin: b.zMin, zMax: b.zMax });
    }
    yLevels.sort(function(a,b){ return a.y - b.y; });

    log("  " + yLevels.length + " niveles Y detectados", "c-dim");

    // 5. Detectar tramos de escalera U
    //    Cada peldaño (nivel Y) tiene vértices centrados en una franja del eje lateral.
    //    Los peldaños del tramo 1 están en una zona Z (o X) y los del tramo 2 en otra.
    //    Encontrar la "huella lateral" de cada nivel Y para separar tramos.
    //    El eje longitudinal es el de mayor extensión (X o Z). El lateral es el otro.
    var longAxis0 = (sizeX > sizeZ) ? "x" : "z";
    var latAxis0  = (longAxis0 === "x") ? "z" : "x";
    log("  Eje longitudinal=" + longAxis0 + " lateral=" + latAxis0, "c-dim");

    // Para cada nivel Y, calcular centroide del eje lateral
    var stepCentroids = [];  // {y, latCenter, count}
    yLevels.forEach(function(lv){
        if(lv.count < 4) return; // Ignorar niveles con pocos vértices
        var latMin = (latAxis0 === "z") ? lv.zMin : lv.xMin;
        var latMax = (latAxis0 === "z") ? lv.zMax : lv.xMax;
        var latCenter = (latMin + latMax) / 2;
        stepCentroids.push({ y: lv.y, latCenter: latCenter, latMin: latMin, latMax: latMax, count: lv.count });
    });

    // Encontrar punto de corte en eje lateral usando Otsu (maximizar varianza inter-clase)
    var latVals = stepCentroids.map(function(s){ return s.latCenter; });
    latVals.sort(function(a,b){ return a-b; });
    var latMid = (bbMin[latAxis0] + bbMax[latAxis0]) / 2;
    // Buscar el mejor corte: probar cada centroide como punto de corte
    var bestCut = latMid, bestScore = -1;
    for(var ci = 0; ci < latVals.length - 1; ci++){
        var cut = (latVals[ci] + latVals[ci+1]) / 2;
        var g1 = [], g2 = [];
        stepCentroids.forEach(function(s){
            if(s.latCenter < cut) g1.push(s); else g2.push(s);
        });
        if(g1.length < 2 || g2.length < 2) continue;
        // Score = separación entre medias de Y de los dos grupos × separación lateral
        var yMean1 = 0, yMean2 = 0;
        g1.forEach(function(s){ yMean1 += s.y; }); yMean1 /= g1.length;
        g2.forEach(function(s){ yMean2 += s.y; }); yMean2 /= g2.length;
        var latSep = Math.abs(latVals[ci+1] - latVals[ci]);
        var ySep = Math.abs(yMean2 - yMean1);
        var score = latSep * 2 + ySep; // Priorizar separación lateral
        if(score > bestScore){ bestScore = score; bestCut = cut; }
    }

    // Separar vértices por eje lateral usando el punto de corte
    var group1 = [], group2 = [];
    allVerts.forEach(function(v){
        var latVal = (latAxis0 === "z") ? v.z : v.x;
        if(latVal < bestCut) group1.push(v); else group2.push(v);
    });

    log("  Split lateral en " + latAxis0 + "=" + bestCut.toFixed(2) +
        " → grupo1=" + group1.length + " grupo2=" + group2.length + " verts", "c-dim");

    // Verificar si cada grupo tiene pendiente (es un tramo inclinado)
    var runs = [];
    function makeRun(verts, label){
        if(verts.length < 3) return null;
        var mn = new THREE.Vector3(Infinity, Infinity, Infinity);
        var mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        verts.forEach(function(v){ mn.min(v); mx.max(v); });
        var sx = mx.x - mn.x, sz = mx.z - mn.z;
        var longAx = (sx > sz) ? "x" : "z";
        var yMin2 = mn.y, yMax2 = mx.y;
        if(Math.abs(yMax2 - yMin2) < 0.15) return null; // Plano (descanso), no tramo
        log("  " + label + ": " + verts.length + " verts, longAxis=" + longAx +
            " X=[" + mn.x.toFixed(2) + "→" + mx.x.toFixed(2) +
            "] Z=[" + mn.z.toFixed(2) + "→" + mx.z.toFixed(2) +
            "] Y=[" + yMin2.toFixed(2) + "→" + yMax2.toFixed(2) + "]", "c-dim");
        return { ext: { min: mn, max: mx, longAxis: longAx, sizeX: sx, sizeZ: sz },
                 yStart: yMin2, yEnd: yMax2, verts: verts };
    }

    // Solo crear tramos separados si ambos grupos tienen >15% de vértices y pendiente
    var minPct = allVerts.length * 0.15;
    if(group1.length > minPct && group2.length > minPct){
        var r1 = makeRun(group1, "Tramo 1");
        var r2 = makeRun(group2, "Tramo 2");
        if(r1) runs.push(r1);
        if(r2) runs.push(r2);
    }

    if(runs.length === 0){
        log("  Escalera recta (1 tramo)", "c-dim");
        var mn0 = bbMin.clone(), mx0 = bbMax.clone();
        runs.push({ ext: { min: mn0, max: mx0, longAxis: longAxis0, sizeX: sizeX, sizeZ: sizeZ },
                     yStart: bbMin.y, yEnd: bbMax.y, verts: allVerts });
    }

    log("  Detectados " + runs.length + " tramo(s) inclinado(s)", "c-num");

    // 7. Crear geometría de losa rampa para cada tramo
    var rampCount = 0;
    runs.forEach(function(run, ri){
        var ext = run.ext;
        var yBot = Math.min(run.yStart, run.yEnd);
        var yTop = Math.max(run.yStart, run.yEnd);
        var longAxis = ext.longAxis;
        var latAxis = (longAxis === "x") ? "z" : "x";

        // Determinar coordenadas del tramo
        var x0 = ext.min.x, x1 = ext.max.x;
        var z0 = ext.min.z, z1 = ext.max.z;

        // Determinar dirección de la pendiente
        // Agrupar verts por posición en eje longitudinal para ver si Y sube o baja
        var longMin2 = (longAxis === "x") ? ext.min.x : ext.min.z;
        var longMax2 = (longAxis === "x") ? ext.max.x : ext.max.z;
        var longMid2 = (longMin2 + longMax2) / 2;
        var yAvgLow = 0, cLow = 0, yAvgHigh = 0, cHigh = 0;
        run.verts.forEach(function(v){
            var lv = (longAxis === "x") ? v.x : v.z;
            if(lv < longMid2){ yAvgLow += v.y; cLow++; }
            else { yAvgHigh += v.y; cHigh++; }
        });
        if(cLow > 0) yAvgLow /= cLow;
        if(cHigh > 0) yAvgHigh /= cHigh;
        var goesUp = yAvgHigh > yAvgLow;

        log("  Tramo " + (ri+1) + ": [" + x0.toFixed(2) + "," + z0.toFixed(2) + "]→[" +
            x1.toFixed(2) + "," + z1.toFixed(2) + "] Y=[" + yBot.toFixed(2) + "→" + yTop.toFixed(2) + "]" +
            " dir=" + longAxis + (goesUp ? "+" : "-"), "c-dim");

        // Cara superior de la losa (bajo los escalones)
        var y00, y01, y10, y11;
        if(longAxis === "x"){
            if(goesUp){
                y00 = yBot; y01 = yBot;   // x=x0 (inicio bajo)
                y10 = yTop; y11 = yTop;   // x=x1 (fin alto)
            } else {
                y00 = yTop; y01 = yTop;
                y10 = yBot; y11 = yBot;
            }
        } else {
            if(goesUp){
                y00 = yBot; y10 = yBot;   // z=z0 (inicio bajo)
                y01 = yTop; y11 = yTop;   // z=z1 (fin alto)
            } else {
                y00 = yTop; y10 = yTop;
                y01 = yBot; y11 = yBot;
            }
        }

        // 8 vértices del prisma
        var verts = new Float32Array([
            // Cara superior (4 vértices)
            x0, y00, z0,    // 0: start-left
            x1, y10, z0,    // 1: end-left
            x1, y11, z1,    // 2: end-right
            x0, y01, z1,    // 3: start-right
            // Cara inferior (4 vértices, -thickness en Y)
            x0, y00 - thickness, z0,    // 4
            x1, y10 - thickness, z0,    // 5
            x1, y11 - thickness, z1,    // 6
            x0, y01 - thickness, z1     // 7
        ]);

        // 12 triángulos (6 caras × 2 tris)
        var indices = new Uint16Array([
            // Superior
            0,1,2, 0,2,3,
            // Inferior
            4,6,5, 4,7,6,
            // Frontal (start)
            0,3,7, 0,7,4,
            // Trasera (end)
            1,5,6, 1,6,2,
            // Izquierda
            0,4,5, 0,5,1,
            // Derecha
            3,2,6, 3,6,7
        ]);

        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        var material = new THREE.MeshPhongMaterial({
            color: 0x999999,
            opacity: 0.85,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: true
        });
        // Aplicar planos de recorte si están activos
        if(S.clippingEnabled && S.clippingPlane){
            material.clippingPlanes = [S.clippingPlane];
            if(S.clippingPlane2) material.clippingPlanes.push(S.clippingPlane2);
        }

        var mesh = new THREE.Mesh(geometry, material);
        mesh.userData = {
            expressID: 900000 + rampCount,
            ifcType: "STAIRRAMP",
            merged: true,
            generated: true,
            rampIndex: ri
        };

        S.modelGroup.add(mesh);

        // Registrar en ifcMeshes
        if(!S.ifcMeshes["STAIRRAMP"]) S.ifcMeshes["STAIRRAMP"] = [];
        S.ifcMeshes["STAIRRAMP"].push(mesh);
        if(S.ifcVisibility["STAIRRAMP"] === undefined) S.ifcVisibility["STAIRRAMP"] = true;

        rampCount++;
    });

    updateObjTree();
    log("═══ Creada(s) " + rampCount + " losa(s) rampa de " + (thickness*100).toFixed(0) + "cm ═══", "c-ok");
    log("  Tipo: STAIRRAMP — visible en árbol de objetos", "c-dim");
    log("  Para eliminar: delete STAIRRAMP  o  seleccionar + eliminar", "c-dim");
}

// Versión con meshes seleccionados (rampescalera sel)
function createStairRampFromSelection(thickness){
    thickness = thickness || 0.15;
    if(S.selectedMeshes.length === 0 && !S.selectedMesh){
        log("Seleccione meshes de escalera con Ctrl+clic primero.", "c-err"); return;
    }
    var meshes = S.selectedMeshes.length > 0 ? S.selectedMeshes.slice() : [S.selectedMesh];
    // Temporalmente reasignar como IFCSTAIR para que createStairRamp los encuentre
    var origTypes = [];
    meshes.forEach(function(m){
        origTypes.push(m.userData.ifcType);
        m.userData.ifcType = "IFCSTAIRFLIGHT";
    });
    createStairRamp(thickness);
    // Restaurar tipos originales
    meshes.forEach(function(m, i){
        m.userData.ifcType = origTypes[i];
    });
}

// ============================================================
// QUITAR ACABADO DE ESCALERA
// Colapsa los pares de niveles Y con gap ~3cm (acabado)
// moviendo yTop → yBot para cada par
// ============================================================
function removeStairFinish(meshes){
    if(!meshes || meshes.length === 0){ log("No hay meshes para procesar.", "c-err"); return; }

    var totalMoved = 0;

    meshes.forEach(function(mesh){
        mesh.updateMatrixWorld(true);
        var pos = mesh.geometry.attributes.position;
        var wm = mesh.matrixWorld.clone();
        var inv = wm.clone().invert();
        var v = new THREE.Vector3();

        // 1. Recopilar todos los Y únicos en world space
        var ySet = {};
        for(var i = 0; i < pos.count; i++){
            v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
            v.applyMatrix4(wm);
            var yk = (Math.round(v.y * 200) / 200).toFixed(3);
            ySet[yk] = true;
        }
        var yVals = Object.keys(ySet).map(Number).sort(function(a,b){ return a-b; });
        log("  " + yVals.length + " niveles Y detectados en mesh #" + mesh.userData.expressID);

        // 2. Encontrar pares con gap 0.02-0.05 (acabado ~3cm)
        var acabadoPairs = [];
        for(var j = 0; j < yVals.length - 1; j++){
            var gap = yVals[j+1] - yVals[j];
            if(gap > 0.02 && gap < 0.05){
                acabadoPairs.push({yBot: yVals[j], yTop: yVals[j+1], gap: gap});
            }
        }
        log("  " + acabadoPairs.length + " capas de acabado detectadas (gap ~" +
            (acabadoPairs.length > 0 ? (acabadoPairs[0].gap * 100).toFixed(0) + "mm" : "?") + ")");

        // 3. Mover vértices yTop → yBot (colapsar acabado)
        var moved = 0;
        for(var i = 0; i < pos.count; i++){
            v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
            v.applyMatrix4(wm);

            for(var k = 0; k < acabadoPairs.length; k++){
                if(Math.abs(v.y - acabadoPairs[k].yTop) < 0.008){
                    v.y = acabadoPairs[k].yBot;
                    v.applyMatrix4(inv);
                    pos.setXYZ(i, v.x, v.y, v.z);
                    moved++;
                    break;
                }
            }
        }

        pos.needsUpdate = true;
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
        if(mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();

        totalMoved += moved;
        log("  Movidos " + moved + " vértices (acabado eliminado)", "c-ok");
    });

    log("═══ Acabado eliminado: " + totalMoved + " vértices modificados ═══", "c-ok");
    if(S.renderer) S.renderer.render(S.scene, S.camera);
}

// ============================================================
// EXTRAER CARA INFERIOR DE ESCALERA
// Separa los triángulos con normal apuntando hacia abajo
// (normal.y < umbral) en un nuevo mesh seleccionable.
// El mesh original queda SIN esas caras (se eliminan).
// ============================================================
function extractStairUnderside(meshes){
    if(!meshes || meshes.length === 0){ log("No hay meshes.", "c-err"); return; }

    meshes.forEach(function(mesh){
        mesh.updateMatrixWorld(true);
        var geo = mesh.geometry;
        var pos = geo.attributes.position;
        var idxAttr = geo.index;
        var wm = mesh.matrixWorld.clone();
        var inv = wm.clone().invert();

        if(!idxAttr){ log("Mesh sin index — no soportado.", "c-err"); return; }

        // 1. Leer vértices en world space
        var allW = [];
        var v = new THREE.Vector3();
        for(var i = 0; i < pos.count; i++){
            v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
            v.applyMatrix4(wm);
            allW.push({x:v.x, y:v.y, z:v.z});
        }

        // 2. Clasificar triángulos por orientación de normal
        var triCount = idxAttr.count / 3;
        var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        var ab = new THREE.Vector3(), ac = new THREE.Vector3(), norm = new THREE.Vector3();
        var downTris = [];   // índices de triángulos de cara inferior
        var keepTris = [];   // índices de triángulos a mantener en original

        for(var ti = 0; ti < triCount; ti++){
            var i0 = idxAttr.getX(ti*3), i1 = idxAttr.getX(ti*3+1), i2 = idxAttr.getX(ti*3+2);
            a.set(allW[i0].x, allW[i0].y, allW[i0].z);
            b.set(allW[i1].x, allW[i1].y, allW[i1].z);
            c.set(allW[i2].x, allW[i2].y, allW[i2].z);
            ab.subVectors(b, a); ac.subVectors(c, a);
            norm.crossVectors(ab, ac).normalize();

            if(norm.y < -0.7){
                downTris.push(ti);
            } else {
                keepTris.push(ti);
            }
        }

        log("  Mesh #" + mesh.userData.expressID + ": " +
            downTris.length + " tris inferiores, " + keepTris.length + " tris restantes");

        if(downTris.length === 0){ log("  No se encontró cara inferior.", "c-warn"); return; }

        // 3. Crear nuevo BufferGeometry para la cara inferior
        // Reusar los mismos vértices (posición) pero con nuevo index
        var downIndices = [];
        for(var di = 0; di < downTris.length; di++){
            var ti = downTris[di];
            downIndices.push(idxAttr.getX(ti*3), idxAttr.getX(ti*3+1), idxAttr.getX(ti*3+2));
        }

        var downGeo = new THREE.BufferGeometry();
        // Copiar atributo de posición completo (compartido, mismo buffer)
        downGeo.setAttribute('position', pos.clone());
        if(geo.attributes.normal) downGeo.setAttribute('normal', geo.attributes.normal.clone());
        downGeo.setIndex(downIndices);
        downGeo.computeBoundingBox();
        downGeo.computeBoundingSphere();
        downGeo.computeVertexNormals();

        // 4. Crear mesh con material distinguible
        var downMat = new THREE.MeshStandardMaterial({
            color: 0x8888cc,
            side: THREE.DoubleSide,
            roughness: 0.6,
            metalness: 0.1,
            transparent: true,
            opacity: 0.85
        });
        var downMesh = new THREE.Mesh(downGeo, downMat);
        downMesh.name = "cara_inferior_" + mesh.userData.expressID;
        downMesh.userData.expressID = mesh.userData.expressID * 10 + 1; // ID derivado
        downMesh.userData.ifcType = "CARA_INFERIOR";
        downMesh.userData.parentID = mesh.userData.expressID;
        // Aplicar misma transformación que el original
        downMesh.applyMatrix4(wm);

        // 5. Agregar al grupo del modelo
        if(S.modelGroup) S.modelGroup.add(downMesh);
        else S.scene.add(downMesh);

        // 6. Actualizar el mesh original: quitar triángulos de cara inferior
        var keepIndices = [];
        for(var ki = 0; ki < keepTris.length; ki++){
            var ti = keepTris[ki];
            keepIndices.push(idxAttr.getX(ti*3), idxAttr.getX(ti*3+1), idxAttr.getX(ti*3+2));
        }
        geo.setIndex(keepIndices);
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        if(geo.attributes.normal) geo.computeVertexNormals();
        pos.needsUpdate = true;

        var newID = mesh.userData.expressID * 10 + 1;
        log("  Cara inferior extraída → nuevo mesh #" + newID +
            " (" + downTris.length + " triángulos)", "c-ok");
    });

    log("═══ Cara inferior extraída como mesh separado ═══", "c-ok");
    if(S.renderer) S.renderer.render(S.scene, S.camera);
}

// ============================================================
// RAMPA INFERIOR DE ESCALERA  (v61 — basado en normales)
// Usa normales de triángulos para identificar SOLO la cara
// inferior (normal.y < -0.7). No toca huellas, contrahuellas
// ni acabado. Solo mueve los vértices de la cara de abajo.
// ============================================================
function stairUndersideToRamp(meshes){
    if(!meshes || meshes.length === 0){ log("No hay meshes para procesar.", "c-err"); return; }

    meshes.forEach(function(mesh){
        mesh.updateMatrixWorld(true);
        var pos = mesh.geometry.attributes.position;
        var geo = mesh.geometry;
        var idxAttr = geo.index;
        var wm = mesh.matrixWorld.clone();
        var inv = wm.clone().invert();
        var v = new THREE.Vector3();

        // ── 1. Todos los vértices en world space ──
        var allW = [];
        for(var i = 0; i < pos.count; i++){
            v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
            v.applyMatrix4(wm);
            allW.push({x:v.x, y:v.y, z:v.z});
        }

        // ── 2. Identificar vértices de cara inferior via normales ──
        var triCount = idxAttr ? idxAttr.count / 3 : pos.count / 3;
        var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        var ab = new THREE.Vector3(), ac = new THREE.Vector3(), norm = new THREE.Vector3();
        var downSet = new Set();

        for(var ti = 0; ti < triCount; ti++){
            var i0, i1, i2;
            if(idxAttr){ i0 = idxAttr.getX(ti*3); i1 = idxAttr.getX(ti*3+1); i2 = idxAttr.getX(ti*3+2); }
            else { i0 = ti*3; i1 = ti*3+1; i2 = ti*3+2; }
            a.set(allW[i0].x, allW[i0].y, allW[i0].z);
            b.set(allW[i1].x, allW[i1].y, allW[i1].z);
            c.set(allW[i2].x, allW[i2].y, allW[i2].z);
            ab.subVectors(b, a); ac.subVectors(c, a);
            norm.crossVectors(ab, ac).normalize();
            if(norm.y < -0.7){
                downSet.add(i0); downSet.add(i1); downSet.add(i2);
            }
        }
        log("  Cara inferior: " + downSet.size + " vértices en mesh #" + mesh.userData.expressID);
        if(downSet.size < 4) return;

        // ── 3. Agrupar vértices de cara inferior por nivel Y ──
        var yGroups = {};
        downSet.forEach(function(vi){
            var yk = (Math.round(allW[vi].y * 200) / 200).toFixed(3);
            if(!yGroups[yk]) yGroups[yk] = [];
            yGroups[yk].push(vi);
        });
        var yKeys = Object.keys(yGroups).sort(function(a,b){return Number(a)-Number(b);});

        // Filtrar: solo niveles Y con >=4 vértices (huellas reales)
        // Los niveles con 1-2 verts son aristas compartidas con contrahuellas
        var steps = [];
        for(var ki = 0; ki < yKeys.length; ki++){
            var yVal = Number(yKeys[ki]);
            var verts = yGroups[yKeys[ki]];
            if(verts.length < 3) continue;
            // Centroide X y rango Z
            var sx = 0, zMin = Infinity, zMax = -Infinity;
            for(var vi = 0; vi < verts.length; vi++){
                sx += allW[verts[vi]].x;
                var zz = allW[verts[vi]].z;
                if(zz < zMin) zMin = zz;
                if(zz > zMax) zMax = zz;
            }
            steps.push({
                yVal: yVal,
                verts: verts,
                xAvg: sx / verts.length,
                zMid: (zMin + zMax) / 2,
                zMin: zMin, zMax: zMax
            });
        }
        log("  " + steps.length + " niveles de cara inferior (huellas)");
        if(steps.length < 3) return;

        // ── 4. Clasificar tramos (adaptativo) ──
        var zMids = steps.map(function(s){return s.zMid;});
        var xAvgs = steps.map(function(s){return s.xAvg;});
        var zMidMin = Math.min.apply(null, zMids), zMidMax = Math.max.apply(null, zMids);
        var zMidRange = zMidMax - zMidMin;
        var tolT1 = Math.min(0.065, Math.max(0.04, zMidRange * 0.035));

        // Tramo 1: desde el inicio, zMid constante
        var tramo1 = [steps[0]];
        var z0 = steps[0].zMid;
        for(var si = 1; si < steps.length; si++){
            if(Math.abs(steps[si].zMid - z0) < tolT1) tramo1.push(steps[si]);
            else break;
        }

        // Descanso: desde el final, xAvg constante
        var xAvgRange = Math.max.apply(null, xAvgs) - Math.min.apply(null, xAvgs);
        var tolDsc = Math.max(0.05, xAvgRange * 0.05);
        var descanso = [steps[steps.length-1]];
        var x0 = steps[steps.length-1].xAvg;
        for(var si = steps.length-2; si >= tramo1.length; si--){
            if(Math.abs(steps[si].xAvg - x0) < tolDsc) descanso.unshift(steps[si]);
            else break;
        }

        // Tramo 2: banda zMid + gap xAvg + contigüidad
        var zMidThreshold = z0 - zMidRange * 0.50;
        var t1sorted = tramo1.slice().sort(function(a,b){return a.xAvg - b.xAvg;});
        var avgPitch = 0;
        for(var pi = 1; pi < t1sorted.length; pi++){
            avgPitch += Math.abs(t1sorted[pi].xAvg - t1sorted[pi-1].xAvg);
        }
        avgPitch = t1sorted.length > 1 ? avgPitch / (t1sorted.length - 1) : 0.30;
        var maxXGap = avgPitch * 2.5;

        var midStart = tramo1.length;
        var midEnd = steps.length - descanso.length;
        var tramo2 = [];
        var prevXAvg = descanso[0].xAvg;
        for(var si = midEnd - 1; si >= midStart; si--){
            var inBand = steps[si].zMid < zMidThreshold;
            var xGap = Math.abs(steps[si].xAvg - prevXAvg);
            if(inBand && xGap < maxXGap){
                tramo2.unshift(steps[si]);
                prevXAvg = steps[si].xAvg;
            } else { break; }
        }

        // Giro: lo intermedio
        var giroStart = tramo1.length;
        var giroEnd = giroStart + (steps.length - tramo1.length - tramo2.length - descanso.length);
        var giro = steps.slice(giroStart, giroEnd);

        log("  Clasificación: " + tramo1.length + "+" + giro.length + "+" +
            tramo2.length + "+" + descanso.length + " (t1+giro+t2+desc)");

        // ── 5. Interpolar rampa por tramo (solo verts de cara inferior) ──
        function _rampFlight(flight, useXaxis){
            if(flight.length < 2) return 0;
            var sorted = useXaxis
                ? flight.slice().sort(function(a,b){return a.xAvg - b.xAvg;})
                : flight;
            var yStart = sorted[0].yVal;
            var yEnd   = sorted[sorted.length-1].yVal;
            var xStart, xEnd, xRange;
            if(useXaxis){
                xStart = sorted[0].xAvg; xEnd = sorted[sorted.length-1].xAvg;
                xRange = xEnd - xStart;
                if(Math.abs(xRange) < 0.01) return 0;
            }
            var moved = 0;
            for(var fi = 0; fi < sorted.length; fi++){
                var step = sorted[fi];
                var t;
                if(useXaxis){
                    t = (step.xAvg - xStart) / xRange;
                } else {
                    t = fi / (sorted.length - 1);
                }
                t = Math.max(0, Math.min(1, t));
                var yNew = yStart + t * (yEnd - yStart);
                for(var vi = 0; vi < step.verts.length; vi++){
                    var idx = step.verts[vi];
                    // Interpolar por posición X individual del vértice
                    var tVert = t;
                    if(useXaxis){
                        tVert = (allW[idx].x - xStart) / xRange;
                        tVert = Math.max(0, Math.min(1, tVert));
                    }
                    var yV = yStart + tVert * (yEnd - yStart);
                    v.set(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
                    v.applyMatrix4(wm);
                    v.y = yV;
                    v.applyMatrix4(inv);
                    pos.setXYZ(idx, v.x, v.y, v.z);
                    allW[idx].y = yV;
                    moved++;
                }
            }
            return moved;
        }

        var totalMoved = 0;
        var m1 = _rampFlight(tramo1, true);
        log("    Tramo 1: " + m1 + " vértices");
        totalMoved += m1;

        var mg = _rampFlight(giro, false);
        log("    Giro:    " + mg + " vértices");
        totalMoved += mg;

        var m2 = _rampFlight(tramo2, true);
        log("    Tramo 2: " + m2 + " vértices");
        totalMoved += m2;

        log("  Rampa inferior: " + totalMoved + " vértices movidos", "c-ok");
        pos.needsUpdate = true;
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        if(geo.attributes.normal) geo.computeVertexNormals();
    });

    log("═══ Cara inferior → rampa (v61, normales) ═══", "c-ok");
    if(S.renderer) S.renderer.render(S.scene, S.camera);
}

// ============================================================
// CORTE 2D EN SECCIÓN — vista de bordes por plano
// Intersecta triángulos de meshes con un plano dado y dibuja
// las líneas de intersección como vista técnica 2D limpia.
// Uso: corte2d z -9.29        → corte Z en todos los meshes
//      corte2d x -10.5 #3428  → corte X solo en mesh #3428
// ============================================================
function sectionCut2D(args){
    if(!args || args.length < 2){
        log("Uso: corte2d z|-9.29  ó  corte2d x|-10.5  [#ID]", "c-err");
        log("  Eje: x, y, z  Valor: coordenada del plano", "c-err");
        return;
    }

    var axis = args[0].toLowerCase();
    if("xyz".indexOf(axis) < 0){ log("Eje debe ser x, y, o z.", "c-err"); return; }
    var planeVal = parseFloat(args[1]);
    if(isNaN(planeVal)){ log("Valor de plano inválido: " + args[1], "c-err"); return; }

    // IDs opcionales
    var filterIds = [];
    for(var ai = 2; ai < args.length; ai++){
        if(args[ai].charAt(0) === "#"){
            var id = parseInt(args[ai].substring(1));
            if(!isNaN(id)) filterIds.push(id);
        }
    }

    // Guardar cámara original ANTES de limpiar (para que no se pierda)
    var _origCamPos = S._sectionState ? S._sectionState.camPos : S.camera.position.clone();
    var _origCamTarget = S._sectionState ? S._sectionState.camTarget : S.controls.target.clone();
    var _origBgColor = S._sectionState ? S._sectionState.bgColor : (S.scene.background ? S.scene.background.clone() : null);
    // Limpiar cortes anteriores y restaurar estado previo
    _sectionCutCleanup();

    var axIdx = "xyz".indexOf(axis);
    var tol = 0.001;

    // Recopilar meshes a procesar (ANTES de ocultar)
    var meshes = [];
    S.scene.traverse(function(o){
        if(!o.isMesh) return;
        if(!o.visible) return;
        if(filterIds.length > 0){
            if(filterIds.indexOf(o.userData.expressID) < 0) return;
        }
        meshes.push(o);
    });

    log("Corte " + axis.toUpperCase() + "=" + planeVal.toFixed(3) +
        " en " + meshes.length + " meshes...");

    // ── Intersectar triángulos con el plano ──
    var allSegments = [];
    meshes.forEach(function(mesh){
        mesh.updateMatrixWorld(true);
        var pos = mesh.geometry.attributes.position;
        var idxAttr = mesh.geometry.index;
        var wm = mesh.matrixWorld.clone();
        var triCount = idxAttr ? idxAttr.count / 3 : pos.count / 3;
        var va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();

        for(var ti = 0; ti < triCount; ti++){
            var i0, i1, i2;
            if(idxAttr){ i0 = idxAttr.getX(ti*3); i1 = idxAttr.getX(ti*3+1); i2 = idxAttr.getX(ti*3+2); }
            else { i0 = ti*3; i1 = ti*3+1; i2 = ti*3+2; }

            va.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0)).applyMatrix4(wm);
            vb.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1)).applyMatrix4(wm);
            vc.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2)).applyMatrix4(wm);

            var vals = [
                axIdx === 0 ? va.x : axIdx === 1 ? va.y : va.z,
                axIdx === 0 ? vb.x : axIdx === 1 ? vb.y : vb.z,
                axIdx === 0 ? vc.x : axIdx === 1 ? vc.y : vc.z
            ];

            var above = 0, below = 0;
            for(var vi = 0; vi < 3; vi++){
                if(vals[vi] > planeVal + tol) above++;
                else if(vals[vi] < planeVal - tol) below++;
            }
            if(above === 0 || below === 0) continue;

            var verts = [va.clone(), vb.clone(), vc.clone()];
            var hits = [];
            for(var ei = 0; ei < 3; ei++){
                var ej = (ei + 1) % 3;
                var v1 = vals[ei], v2 = vals[ej];
                if((v1 - planeVal) * (v2 - planeVal) < 0){
                    var t = (planeVal - v1) / (v2 - v1);
                    hits.push(new THREE.Vector3().lerpVectors(verts[ei], verts[ej], t));
                }
            }
            if(hits.length >= 2) allSegments.push([hits[0], hits[1]]);
        }
    });

    log("  " + allSegments.length + " segmentos de intersección");
    if(allSegments.length === 0){
        log("No hay intersección con el plano.", "c-warn");
        return;
    }

    // ── Crear LineSegments del perfil (peldaños) ──
    var linePositions = [];
    for(var si = 0; si < allSegments.length; si++){
        var p1 = allSegments[si][0], p2 = allSegments[si][1];
        linePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
    var lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    var lineMat = new THREE.LineBasicMaterial({
        color: 0x111111, linewidth: 2, depthTest: false
    });
    var lineObj = new THREE.LineSegments(lineGeo, lineMat);
    lineObj.renderOrder = 999;
    lineObj.userData._sectionCut = true;
    S.scene.add(lineObj);

    // ── Nodos: puntos únicos en las intersecciones ──
    var uniqueMap = {};
    var tol3 = 1000; // redondeo a 0.001
    for(var si = 0; si < allSegments.length; si++){
        for(var pi = 0; pi < 2; pi++){
            var pt = allSegments[si][pi];
            var key = Math.round(pt.x*tol3)+","+Math.round(pt.y*tol3)+","+Math.round(pt.z*tol3);
            if(!uniqueMap[key]) uniqueMap[key] = pt;
        }
    }
    var nodeKeys = Object.keys(uniqueMap);
    var nodePositions = [];
    S._sectionNodes = []; // para snap
    for(var ni = 0; ni < nodeKeys.length; ni++){
        var np = uniqueMap[nodeKeys[ni]];
        nodePositions.push(np.x, np.y, np.z);
        S._sectionNodes.push(np.clone());
    }
    var nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
    var nodeMat = new THREE.PointsMaterial({
        color: 0xff0000, size: 3, sizeAttenuation: false, depthTest: false
    });
    var nodeObj = new THREE.Points(nodeGeo, nodeMat);
    nodeObj.renderOrder = 1001;
    nodeObj.userData._sectionCut = true;
    S.scene.add(nodeObj);
    log("  " + nodeKeys.length + " nodos (snap activo)");

    // ── Guardar segmentos y eje para el mini-CAD de sección ──
    S._sectionAxis = axis;
    S._sectionPlane = planeVal;
    S._sectionSegments = allSegments;
    S._sectionDrawings = S._sectionDrawings || []; // líneas/cotas dibujadas por el usuario
    S._sectionFilterIds = filterIds.slice(); // guardar IDs filtrados para srampa

    // ── Guardar estado y ocultar TODO excepto las líneas de corte ──
    S._sectionState = { bgColor: _origBgColor, hidden: [] };
    S.scene.traverse(function(o){
        if(o.userData && o.userData._sectionCut) return; // no ocultar las líneas
        if(o === S.scene) return;
        if(o.visible && (o.isMesh || o.isSprite || o.isLine || o.isLineSegments || o.isPoints ||
           o.type === "GridHelper" || o.type === "AxesHelper" || o.type === "Line2" ||
           o.isCSS2DObject || o.isGroup)){
            // Ocultar sprites (labels), helpers, meshes, todo
            if(o.isMesh || o.isSprite || o.isLine || o.isLineSegments || o.isPoints){
                o.userData._secVis = true;
                o.visible = false;
                S._sectionState.hidden.push(o);
            }
        }
    });
    // Ocultar helpers directos de S
    if(S.gridHelper){ S.gridHelper.visible = false; S._sectionState.gridWas = true; }
    if(S.axesHelper){ S.axesHelper.visible = false; S._sectionState.axesWas = true; }

    // Fondo blanco para vista técnica
    S.scene.background = new THREE.Color(0xffffff);

    // ── Posicionar cámara ajustada al corte ──
    var box = new THREE.Box3().setFromBufferAttribute(lineGeo.attributes.position);
    var center = box.getCenter(new THREE.Vector3());
    var sz = box.getSize(new THREE.Vector3());
    S._sectionState.camPos = _origCamPos;
    S._sectionState.camTarget = _origCamTarget;

    // Calcular distancia para que el corte llene la vista
    var aspect = S.renderer.domElement.clientWidth / S.renderer.domElement.clientHeight;
    var fov = S.camera.fov * Math.PI / 180;
    var viewH, viewW, dist;

    if(axis === "z"){
        viewH = sz.y; viewW = sz.x;
        if(viewH < 0.01) viewH = 1; if(viewW < 0.01) viewW = 1;
        var distH = (viewH * 1.3) / (2 * Math.tan(fov/2));
        var distW = (viewW * 1.3) / (2 * Math.tan(fov/2) * aspect);
        dist = Math.max(distH, distW, 0.5);
        S.camera.position.set(center.x, center.y, center.z + dist);
        S.camera.up.set(0, 1, 0);
    } else if(axis === "x"){
        viewH = sz.y; viewW = sz.z;
        if(viewH < 0.01) viewH = 1; if(viewW < 0.01) viewW = 1;
        var distH = (viewH * 1.3) / (2 * Math.tan(fov/2));
        var distW = (viewW * 1.3) / (2 * Math.tan(fov/2) * aspect);
        dist = Math.max(distH, distW, 0.5);
        S.camera.position.set(center.x + dist, center.y, center.z);
        S.camera.up.set(0, 1, 0);
    } else {
        viewH = sz.z; viewW = sz.x;
        if(viewH < 0.01) viewH = 1; if(viewW < 0.01) viewW = 1;
        var distH = (viewH * 1.3) / (2 * Math.tan(fov/2));
        var distW = (viewW * 1.3) / (2 * Math.tan(fov/2) * aspect);
        dist = Math.max(distH, distW, 0.5);
        S.camera.position.set(center.x, center.y + dist, center.z);
        S.camera.up.set(0, 0, -1);
    }
    S.camera.near = 0.01;
    S.camera.far = dist * 10;
    S.controls.target.copy(center);
    S.controls.update();
    S.camera.lookAt(center);
    S.camera.updateProjectionMatrix();

    // ── Activar snap handler para nodos de sección ──
    _sectionSnapEnable(axis);

    S.renderer.render(S.scene, S.camera);
    log("═══ Corte " + axis.toUpperCase() + "=" + planeVal.toFixed(3) +
        " — " + allSegments.length + " líneas, " + nodeKeys.length + " nodos ═══", "c-ok");
    log("  Mini-CAD: slinea | sdim | smedir | sborrar", "c-info");
    log("  Escriba 'restaurar' para volver a la vista normal.", "c-info");

    // ═══ ACTIVAR CAD 2D OVERLAY ═══
    _sectionActivateCAD(axis, planeVal, allSegments, S._sectionNodes);
}

// ═══════════════════════════════════════════════════════════════════
// SNAP HANDLER para vista de sección 2D
// Mueve snapMarker al nodo más cercano al cursor
// ═══════════════════════════════════════════════════════════════════
var _secSnapHandler = null;
var _secSnapClick = null;
var _secSnapPending = null;   // {cmd, p1} — para dibujar línea/cota en 2 clicks

function _sectionSnapEnable(axis){
    _sectionSnapDisable(); // limpiar anterior

    var canvas = S.renderer.domElement;
    var tooltip = document.getElementById("coordTooltip");

    // Ocultar snap marker cyan del visor 3D normal
    if(S.snapMarker) S.snapMarker.visible = false;

    // Crear marcador pequeño para sección (círculo verde)
    if(!S._secSnapMarker){
        var sg = new THREE.SphereGeometry(0.008, 8, 8);
        var sm = new THREE.MeshBasicMaterial({color: 0x00ff44, depthTest: false, transparent: true, opacity: 0.95});
        S._secSnapMarker = new THREE.Mesh(sg, sm);
        S._secSnapMarker.renderOrder = 1002;
        S._secSnapMarker.visible = false;
        S.scene.add(S._secSnapMarker);
    }

    _secSnapHandler = function(e){
        if(!S._sectionNodes || S._sectionNodes.length === 0) return;

        var rect = canvas.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        S.raycaster.setFromCamera(new THREE.Vector2(mx, my), S.camera);

        // Proyectar nodos a pantalla y buscar el más cercano al cursor
        var bestDist = Infinity, bestNode = null;
        var screenPos = new THREE.Vector3();
        for(var i = 0; i < S._sectionNodes.length; i++){
            screenPos.copy(S._sectionNodes[i]);
            screenPos.project(S.camera);
            var sx = screenPos.x, sy = screenPos.y;
            var dx = sx - mx, dy = sy - my;
            var d2 = dx*dx + dy*dy;
            if(d2 < bestDist){ bestDist = d2; bestNode = S._sectionNodes[i]; }
        }

        // Umbral de snap: 0.04 en coords NDC (~20px)
        if(bestNode && bestDist < 0.04*0.04){
            S._secSnapMarker.position.copy(bestNode);
            S._secSnapMarker.visible = true;
            S._secSnapCurrent = bestNode.clone();

            // Tooltip con coordenadas
            if(tooltip){
                tooltip.style.display = "block";
                tooltip.style.left = (e.clientX - rect.left + 14) + "px";
                tooltip.style.top = (e.clientY - rect.top - 28) + "px";
                var ax = axis;
                if(ax === "z"){
                    tooltip.textContent = "X:" + bestNode.x.toFixed(3) + " Y:" + bestNode.y.toFixed(3);
                } else if(ax === "x"){
                    tooltip.textContent = "Z:" + bestNode.z.toFixed(3) + " Y:" + bestNode.y.toFixed(3);
                } else {
                    tooltip.textContent = "X:" + bestNode.x.toFixed(3) + " Z:" + bestNode.z.toFixed(3);
                }
            }
            S.renderer.render(S.scene, S.camera);
        } else {
            S._secSnapMarker.visible = false;
            S._secSnapCurrent = null;
            if(tooltip) tooltip.style.display = "none";
            S.renderer.render(S.scene, S.camera);
        }
    };

    _secSnapClick = function(e){
        if(!S._secSnapCurrent) return;
        if(!_secSnapPending) return; // no hay comando activo

        var p = S._secSnapCurrent.clone();
        if(!_secSnapPending.p1){
            // Primer punto
            _secSnapPending.p1 = p;
            log("  P1: (" + p.x.toFixed(3) + ", " + p.y.toFixed(3) + ", " + p.z.toFixed(3) + ")", "c-info");
            log("  Click en segundo punto...", "c-info");
        } else {
            // Segundo punto → ejecutar comando
            var p1 = _secSnapPending.p1;
            var p2 = p;
            var cmd = _secSnapPending.cmd;

            if(cmd === "slinea"){
                _sectionDrawLine(p1, p2, 0x0000ff, 2);
                log("  SLINEA (" + p1.x.toFixed(3) + "," + p1.y.toFixed(3) +
                    ") → (" + p2.x.toFixed(3) + "," + p2.y.toFixed(3) + ")", "c-ok");
            } else if(cmd === "sdim"){
                var dist = p1.distanceTo(p2);
                _sectionDrawLine(p1, p2, 0xcc0000, 1);
                _sectionDrawDim(p1, p2, dist);
                log("  SDIM = " + dist.toFixed(4) + " m", "c-ok");
            } else if(cmd === "smedir"){
                var d = p1.distanceTo(p2);
                var dx = Math.abs(p2.x - p1.x);
                var dy = Math.abs(p2.y - p1.y);
                var dz = Math.abs(p2.z - p1.z);
                log("  ═══ MEDIDA ═══", "c-ok");
                log("  Distancia: " + d.toFixed(4) + " m", "c-ok");
                log("  ΔX=" + dx.toFixed(4) + " ΔY=" + dy.toFixed(4) + " ΔZ=" + dz.toFixed(4), "c-ok");
            } else if(cmd === "srampa"){
                var esp = _secSnapPending ? _secSnapPending.espesor : 0;
                _sectionPreviewRamp(p1, p2, esp);
            }
            _secSnapPending = null;
            S.renderer.render(S.scene, S.camera);
        }
    };

    canvas.addEventListener("mousemove", _secSnapHandler);
    canvas.addEventListener("click", _secSnapClick);
}

function _sectionSnapDisable(){
    var canvas = S.renderer ? S.renderer.domElement : null;
    if(canvas && _secSnapHandler){
        canvas.removeEventListener("mousemove", _secSnapHandler);
        canvas.removeEventListener("click", _secSnapClick);
    }
    _secSnapHandler = null;
    _secSnapClick = null;
    _secSnapPending = null;
    S._secSnapCurrent = null;
    if(S._secSnapMarker) S._secSnapMarker.visible = false;
}

// Exponer funciones de snap de sección para integración CAD
S._sectionSnapEnableFn = _sectionSnapEnable;
S._sectionSnapDisableFn = _sectionSnapDisable;

// ── Dibujar línea sobre vista de sección ──
function _sectionDrawLine(p1, p2, color, lw){
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
        p1.x, p1.y, p1.z, p2.x, p2.y, p2.z
    ], 3));
    var mat = new THREE.LineBasicMaterial({
        color: color || 0x0000ff, linewidth: lw || 2, depthTest: false
    });
    var line = new THREE.LineSegments(geo, mat);
    line.renderOrder = 1000;
    line.userData._sectionCut = true;
    line.userData._sectionDrawing = true;
    S.scene.add(line);
    if(!S._sectionDrawings) S._sectionDrawings = [];
    S._sectionDrawings.push(line);
}

// ── Cota (dimensión) sobre vista de sección ──
function _sectionDrawDim(p1, p2, dist){
    // Texto como sprite CSS2D o como cartelito 3D
    // Usaremos un sprite simple de Three.js
    var mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    // Offset perpendicular para que no tape la línea
    var dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    var perp = new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(0.08);
    mid.add(perp);

    // Canvas para texto
    var cvs = document.createElement("canvas");
    cvs.width = 256; cvs.height = 64;
    var ctx = cvs.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "#cc0000";
    ctx.font = "bold 28px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(dist.toFixed(3) + " m", 128, 32);

    var tex = new THREE.CanvasTexture(cvs);
    var spMat = new THREE.SpriteMaterial({map: tex, depthTest: false, transparent: true});
    var sprite = new THREE.Sprite(spMat);
    sprite.position.copy(mid);
    // Escala del sprite proporcional a la vista
    var sc = dist * 0.25;
    if(sc < 0.1) sc = 0.1;
    sprite.scale.set(sc, sc * 0.25, 1);
    sprite.renderOrder = 1003;
    sprite.userData._sectionCut = true;
    sprite.userData._sectionDrawing = true;
    S.scene.add(sprite);
    if(!S._sectionDrawings) S._sectionDrawings = [];
    S._sectionDrawings.push(sprite);
}

// ── Comandos mini-CAD para sección ──
function sectionCAD(args){
    if(!S._sectionState){
        log("No hay vista de sección activa. Use 'corte2d' primero.", "c-err");
        return;
    }
    var cmd = args[0] ? args[0].toLowerCase() : "";
    if(cmd === "slinea" || cmd === "sline"){
        _secSnapPending = {cmd: "slinea", p1: null};
        log("SLINEA: click en primer punto (snap a nodo)...", "c-info");
    } else if(cmd === "sdim" || cmd === "scota"){
        _secSnapPending = {cmd: "sdim", p1: null};
        log("SDIM: click en primer punto...", "c-info");
    } else if(cmd === "smedir" || cmd === "smeasure"){
        _secSnapPending = {cmd: "smedir", p1: null};
        log("SMEDIR: click en primer punto...", "c-info");
    } else if(cmd === "srampa" || cmd === "sramp"){
        // srampa [espesor] — trazar línea de narices, paralela inferior automática
        var espesor = (args.length > 1 && !isNaN(parseFloat(args[1]))) ? parseFloat(args[1]) : 0;
        _secSnapPending = {cmd: "srampa", p1: null, espesor: espesor};
        log("SRAMPA: click en NARIZ del primer peldaño...", "c-info");
        log("  Luego click en NARIZ del último peldaño.", "c-info");
        log("  → Preview: se dibujan líneas sobre el perfil original.", "c-info");
        log("  → Luego 'saplicar' para modificar el mesh.", "c-info");
        if(espesor > 0) log("  Espesor de losa: " + espesor.toFixed(3) + " m", "c-info");
        else log("  Espesor: automático (medido desde geometría)", "c-info");
    } else if(cmd === "saplicar" || cmd === "sapply"){
        // Aplicar la rampa previamente previsualizada
        if(!S._rampPreview){
            log("No hay preview de rampa. Use 'srampa' primero.", "c-warn"); return;
        }
        var rp = S._rampPreview;
        _sectionApplyRamp(rp.p1, rp.p2, rp.espesor);
        S._rampPreview = null;
    } else if(cmd === "sborrar" || cmd === "sclear"){
        // Borrar dibujos de usuario sobre la sección
        if(S._sectionDrawings){
            S._sectionDrawings.forEach(function(o){ if(o.parent) o.parent.remove(o); });
            S._sectionDrawings = [];
        }
        S.renderer.render(S.scene, S.camera);
        log("Dibujos de sección borrados.", "c-ok");
    } else if(cmd === "snodos" || cmd === "snodes"){
        // Listar nodos con coordenadas
        if(!S._sectionNodes || S._sectionNodes.length === 0){
            log("No hay nodos.", "c-warn"); return;
        }
        log("═══ " + S._sectionNodes.length + " NODOS ═══", "c-ok");
        for(var i = 0; i < S._sectionNodes.length; i++){
            var n = S._sectionNodes[i];
            log("  [" + i + "] X:" + n.x.toFixed(4) + " Y:" + n.y.toFixed(4) + " Z:" + n.z.toFixed(4));
        }
    } else if(cmd === "sundo" || cmd === "sdeshacer"){
        // Restaurar posiciones del mesh antes de srampa
        if(!S._rampBackup || S._rampBackup.length === 0){
            log("No hay rampa que deshacer.", "c-warn"); return;
        }
        S._rampBackup.forEach(function(bk){
            var geo = bk.mesh.geometry;
            var pos = geo.attributes.position;
            pos.array.set(bk.positions);
            pos.needsUpdate = true;
            geo.computeBoundingBox();
            geo.computeBoundingSphere();
            if(geo.attributes.normal) geo.computeVertexNormals();
        });
        S._rampBackup = [];
        log("Rampa deshecha. Regenerando corte...", "c-ok");
        // Borrar dibujos de sección (líneas de rampa)
        if(S._sectionDrawings){
            S._sectionDrawings.forEach(function(o){ if(o.parent) o.parent.remove(o); });
            S._sectionDrawings = [];
        }
        // Regenerar corte con geometría original
        var origAxis = S._sectionAxis;
        var origPlane = S._sectionPlane;
        var filterIds = S._sectionFilterIds || [];
        var cutArgs = [origAxis, String(origPlane)];
        for(var ki = 0; ki < filterIds.length; ki++) cutArgs.push("#" + filterIds[ki]);
        sectionCut2D(cutArgs);
    } else {
        log("Mini-CAD sección: slinea | sdim | smedir | sborrar | snodos | srampa | saplicar | sundo", "c-info");
    }
}

// ═══════════════════════════════════════════════════════════════════
// PREVIEW de rampa: dibuja líneas sobre el perfil original sin modificar mesh
// ═══════════════════════════════════════════════════════════════════
function _sectionPreviewRamp(p1, p2, espesor){
    if(!S._sectionAxis || !S._sectionState){
        log("No hay sección activa.", "c-err"); return;
    }
    var axis = S._sectionAxis;
    var hAxis, vAxis;
    if(axis === "z"){ hAxis = "x"; vAxis = "y"; }
    else if(axis === "x"){ hAxis = "z"; vAxis = "y"; }
    else { hAxis = "x"; vAxis = "z"; }

    var h1 = p1[hAxis], v1 = p1[vAxis];
    var h2 = p2[hAxis], v2 = p2[vAxis];
    if(h1 > h2){ var th = h1; h1 = h2; h2 = th; var tv = v1; v1 = v2; v2 = tv; }

    var dh = h2 - h1;
    if(Math.abs(dh) < 0.001){ log("Puntos en la misma posición horizontal.", "c-err"); return; }
    var slope = (v2 - v1) / dh;
    var angle = Math.atan(slope);
    var cosA = Math.cos(angle);

    // Auto-detectar espesor si no se dio
    if(!espesor || espesor <= 0){
        var filterIds = S._sectionFilterIds || [];
        var meshes = [];
        S._sectionState.hidden.forEach(function(o){
            if(!o.isMesh) return;
            if(filterIds.length > 0 && filterIds.indexOf(o.userData.expressID) < 0) return;
            meshes.push(o);
        });
        var minVertDist = Infinity;
        meshes.forEach(function(mesh){
            var pos = mesh.geometry.attributes.position;
            var wm = mesh.matrixWorld;
            var v3 = new THREE.Vector3();
            for(var i = 0; i < pos.count; i++){
                v3.set(pos.getX(i), pos.getY(i), pos.getZ(i));
                v3.applyMatrix4(wm);
                var hVal = v3[hAxis], vVal = v3[vAxis];
                if(hVal < h1 + 0.05 || hVal > h2 - 0.05) continue;
                var vNariz = v1 + slope * (hVal - h1);
                var vertDist = vNariz - vVal;
                if(vertDist > 0.01 && vertDist < minVertDist) minVertDist = vertDist;
            }
        });
        if(minVertDist === Infinity) minVertDist = 0.15;
        espesor = minVertDist * cosA;
    }

    var vOffset = espesor / cosA;
    var rv1 = v1 - vOffset;
    var rv2 = v2 - vOffset;

    // Dibujar líneas de preview (P1 a P2)
    var pAxis = S._sectionPlane;
    var lp1 = new THREE.Vector3(), lp2 = new THREE.Vector3();
    var rp1 = new THREE.Vector3(), rp2 = new THREE.Vector3();
    lp1[hAxis] = h1; lp1[vAxis] = v1;  lp1[axis] = pAxis;
    lp2[hAxis] = h2; lp2[vAxis] = v2;  lp2[axis] = pAxis;
    rp1[hAxis] = h1; rp1[vAxis] = rv1; rp1[axis] = pAxis;
    rp2[hAxis] = h2; rp2[vAxis] = rv2; rp2[axis] = pAxis;
    _sectionDrawLine(lp1, lp2, 0x999999, 1); // narices gris
    _sectionDrawLine(rp1, rp2, 0x00aaff, 2); // paralela azul
    S.renderer.render(S.scene, S.camera);

    // Guardar parámetros para saplicar
    S._rampPreview = { p1: p1.clone(), p2: p2.clone(), espesor: espesor };

    log("═══ PREVIEW RAMPA ═══", "c-ok");
    log("  Narices: h=" + h1.toFixed(3) + "→" + h2.toFixed(3), "c-info");
    log("  Pendiente: " + (angle*180/Math.PI).toFixed(1) + "°", "c-info");
    log("  Espesor: " + (espesor*100).toFixed(1) + " cm", "c-info");
    log("  → Línea gris = narices, azul = fondo de losa", "c-info");
    log("  → 'saplicar' para modificar mesh", "c-ok");
    log("  → 'sborrar' para cancelar", "c-info");
}

// ═══════════════════════════════════════════════════════════════════
// SRAMPA: Modificar cara inferior de escalera usando línea de narices
// P1 y P2 = narices de los peldaños (línea superior/guía).
// Se calcula una paralela inferior desplazada por el espesor de losa.
// Todos los vértices debajo de la paralela se mueven a ella.
// espesor = 0 → auto-detectar midiendo distancia perpendicular mínima
// ═══════════════════════════════════════════════════════════════════
function _sectionApplyRamp(p1, p2, espesor){
    if(!S._sectionAxis || !S._sectionState){
        log("No hay sección activa.", "c-err"); return;
    }
    var axis = S._sectionAxis;

    // Determinar ejes horizontal y vertical del corte
    var hAxis, vAxis;
    if(axis === "z"){ hAxis = "x"; vAxis = "y"; }
    else if(axis === "x"){ hAxis = "z"; vAxis = "y"; }
    else { hAxis = "x"; vAxis = "z"; }

    var h1 = p1[hAxis], v1 = p1[vAxis];
    var h2 = p2[hAxis], v2 = p2[vAxis];

    // Asegurar que h1 < h2 (ordenar por eje horizontal)
    if(h1 > h2){ var th = h1; h1 = h2; h2 = th; var tv = v1; v1 = v2; v2 = tv; }

    var dh = h2 - h1;
    if(Math.abs(dh) < 0.001){ log("Los puntos están en la misma posición horizontal.", "c-err"); return; }
    var slope = (v2 - v1) / dh;
    var angle = Math.atan(slope);
    var cosA = Math.cos(angle);

    log("═══ SRAMPA: Línea de narices → paralela inferior ═══");
    log("  Nariz1: h=" + h1.toFixed(3) + " v=" + v1.toFixed(3));
    log("  Nariz2: h=" + h2.toFixed(3) + " v=" + v2.toFixed(3));
    log("  Pendiente: " + slope.toFixed(4) + " (" + (angle*180/Math.PI).toFixed(1) + "°)");

    // Buscar meshes filtrados
    var filterIds = S._sectionFilterIds || [];
    var meshes = [];
    S._sectionState.hidden.forEach(function(o){
        if(!o.isMesh) return;
        if(filterIds.length > 0){
            if(filterIds.indexOf(o.userData.expressID) < 0) return;
        }
        meshes.push(o);
    });
    log("  Meshes a modificar: " + meshes.length + (filterIds.length > 0 ? " (filtro: #" + filterIds.join(",#") + ")" : " (todos)"));

    // ── Si espesor = 0, auto-detectar ──
    // Para cada vértice debajo de la línea de narices, medir distancia
    // vertical (vNariz - vVertice). El espesor de losa es el mínimo
    // de esas distancias (el punto más cercano a la línea por abajo).
    if(!espesor || espesor <= 0){
        var minVertDist = Infinity;
        meshes.forEach(function(mesh){
            var pos = mesh.geometry.attributes.position;
            var wm = mesh.matrixWorld;
            var v3 = new THREE.Vector3();
            for(var i = 0; i < pos.count; i++){
                v3.set(pos.getX(i), pos.getY(i), pos.getZ(i));
                v3.applyMatrix4(wm);
                var hVal = v3[hAxis], vVal = v3[vAxis];
                if(hVal < h1 + 0.05 || hVal > h2 - 0.05) continue; // evitar extremos
                var vNariz = v1 + slope * (hVal - h1);
                var vertDist = vNariz - vVal; // positivo = debajo de la línea
                if(vertDist > 0.01 && vertDist < minVertDist){
                    minVertDist = vertDist;
                }
            }
        });
        if(minVertDist === Infinity) minVertDist = 0.15; // fallback 15cm
        espesor = minVertDist * cosA; // convertir dist vertical a perpendicular
        log("  Espesor auto-detectado: " + espesor.toFixed(4) + " m (" + (espesor*100).toFixed(1) + " cm)");
    } else {
        log("  Espesor especificado: " + espesor.toFixed(4) + " m");
    }

    // ── Calcular la paralela inferior ──
    // Desplazar la línea de narices hacia abajo perpendicularmente por 'espesor'
    // Desplazamiento vertical = espesor / cos(ángulo)
    var vOffset = espesor / cosA;
    var rv1 = v1 - vOffset; // V de la paralela inferior en h1
    var rv2 = v2 - vOffset; // V de la paralela inferior en h2

    log("  Paralela inferior: v1=" + rv1.toFixed(3) + " v2=" + rv2.toFixed(3) + " (offset vertical=" + vOffset.toFixed(4) + ")");

    // ── Rango de modificación: estrictamente entre P1 y P2 (narices) ──
    // No extender ni a izquierda ni a derecha.
    // La rampa solo aplica en la zona inclinada definida por los clicks.
    log("  Rango modificación: h=" + h1.toFixed(3) + " → " + h2.toFixed(3) + " (narices)");

    // Dibujar líneas solo entre P1 y P2 (narices)
    var pAxis = S._sectionPlane;
    var lp1 = new THREE.Vector3(), lp2 = new THREE.Vector3();
    var rp1 = new THREE.Vector3(), rp2 = new THREE.Vector3();
    lp1[hAxis] = h1; lp1[vAxis] = v1;  lp1[axis] = pAxis;
    lp2[hAxis] = h2; lp2[vAxis] = v2;  lp2[axis] = pAxis;
    rp1[hAxis] = h1; rp1[vAxis] = rv1; rp1[axis] = pAxis;
    rp2[hAxis] = h2; rp2[vAxis] = rv2; rp2[axis] = pAxis;
    _sectionDrawLine(lp1, lp2, 0x999999, 1); // línea de narices gris
    _sectionDrawLine(rp1, rp2, 0x00aaff, 2); // paralela inferior azul

    // ── Guardar backup de posiciones para undo ──
    S._rampBackup = [];
    meshes.forEach(function(mesh){
        var geo = mesh.geometry;
        if(!geo || !geo.attributes || !geo.attributes.position) return;
        var pos = geo.attributes.position;
        S._rampBackup.push({
            mesh: mesh,
            positions: new Float32Array(pos.array) // copia completa
        });
    });

    // ── Modificar vértices: todo debajo de la paralela inferior ──
    var totalMoved = 0;

    meshes.forEach(function(mesh){
        var geo = mesh.geometry;
        if(!geo || !geo.attributes || !geo.attributes.position) return;

        var pos = geo.attributes.position;
        var idx = geo.index;
        var wm = mesh.matrixWorld.clone();
        var wmInv = new THREE.Matrix4().copy(wm).invert();
        var v3 = new THREE.Vector3();
        var onRamp = new Uint8Array(pos.count);

        // ── PASADA 1: Mover vértices debajo de la paralela inferior ──
        // Rango: estrictamente h1 a h2 (narices clickeadas)
        for(var i = 0; i < pos.count; i++){
            v3.set(pos.getX(i), pos.getY(i), pos.getZ(i));
            v3.applyMatrix4(wm);

            var hVal = v3[hAxis];
            if(hVal < h1 - 0.01 || hVal > h2 + 0.01) continue;

            var vRamp = rv1 + slope * (hVal - h1); // Y de la paralela inferior

            if(v3[vAxis] < vRamp + 0.02){ // debajo o dentro de 2cm
                if(Math.abs(v3[vAxis] - vRamp) > 0.001){
                    v3[vAxis] = vRamp;
                    v3.applyMatrix4(wmInv);
                    pos.setXYZ(i, v3.x, v3.y, v3.z);
                    totalMoved++;
                }
                onRamp[i] = 1;
            }
        }

        // ── PASADA 2: Propagación por triángulos ──
        if(idx){
            var changed = true;
            var pass = 0;
            while(changed && pass < 10){
                changed = false;
                pass++;
                for(var t = 0; t < idx.count; t += 3){
                    var i0 = idx.getX(t), i1 = idx.getX(t+1), i2 = idx.getX(t+2);
                    var sum = onRamp[i0] + onRamp[i1] + onRamp[i2];

                    if(sum === 2){
                        var target = !onRamp[i0] ? i0 : !onRamp[i1] ? i1 : i2;

                        v3.set(pos.getX(target), pos.getY(target), pos.getZ(target));
                        v3.applyMatrix4(wm);

                        var hVal = v3[hAxis];
                        if(hVal < h1 - 0.01 || hVal > h2 + 0.01) continue;

                        var vRamp = rv1 + slope * (hVal - h1);
                        var maxMargin = Math.abs(slope) * 0.32 + 0.20;
                        if(v3[vAxis] < vRamp + maxMargin && v3[vAxis] > vRamp - 0.01){
                            v3[vAxis] = vRamp;
                            v3.applyMatrix4(wmInv);
                            pos.setXYZ(target, v3.x, v3.y, v3.z);
                            onRamp[target] = 1;
                            totalMoved++;
                            changed = true;
                        }
                    }
                }
            }
            if(pass > 1) log("  Propagación: " + pass + " pasadas", "c-info");
        }

        if(totalMoved > 0){
            pos.needsUpdate = true;
            geo.computeBoundingBox();
            geo.computeBoundingSphere();
            if(geo.attributes.normal) geo.computeVertexNormals();
        }
    });

    log("  Vértices movidos: " + totalMoved, totalMoved > 0 ? "c-ok" : "c-warn");

    if(totalMoved > 0){
        log("  Regenerando corte...", "c-info");
        var origAxis = S._sectionAxis;
        var origPlane = S._sectionPlane;

        var cutArgs = [origAxis, String(origPlane)];
        for(var ki = 0; ki < filterIds.length; ki++){
            cutArgs.push("#" + filterIds[ki]);
        }
        sectionCut2D(cutArgs);
        log("═══ Rampa aplicada ═══", "c-ok");
    } else {
        log("  No se encontraron vértices debajo de la línea.", "c-warn");
    }
}

// Limpieza interna de cortes de sección
function _sectionCutCleanup(){
    // Desactivar CAD overlay
    if(window.deactivateCAD) deactivateCAD();

    // Desactivar snap handler de sección
    _sectionSnapDisable();

    // Remover líneas de corte, nodos, dibujos
    var cuts = [];
    S.scene.traverse(function(o){ if(o.userData && o.userData._sectionCut) cuts.push(o); });
    cuts.forEach(function(o){
        if(o.geometry) o.geometry.dispose();
        if(o.material){
            if(o.material.map) o.material.map.dispose();
            o.material.dispose();
        }
        if(o.parent) o.parent.remove(o);
    });

    // Limpiar estado de sección
    S._sectionNodes = null;
    S._sectionSegments = null;
    S._sectionDrawings = [];
    S._sectionAxis = null;
    S._sectionPlane = null;
    S._sectionFilterIds = null;

    // Remover marcador snap de sección
    if(S._secSnapMarker){
        S.scene.remove(S._secSnapMarker);
        if(S._secSnapMarker.geometry) S._secSnapMarker.geometry.dispose();
        if(S._secSnapMarker.material) S._secSnapMarker.material.dispose();
        S._secSnapMarker = null;
    }

    // Restaurar visibilidad
    if(S._sectionState){
        S._sectionState.hidden.forEach(function(o){
            if(o && o.userData._secVis){ o.visible = true; delete o.userData._secVis; }
        });
        if(S._sectionState.gridWas && S.gridHelper) S.gridHelper.visible = true;
        if(S._sectionState.axesWas && S.axesHelper) S.axesHelper.visible = true;
        if(S._sectionState.bgColor) S.scene.background = S._sectionState.bgColor;
        else S.scene.background = new THREE.Color(0x1a1a2e);
        if(S._sectionState.camPos){
            S.camera.position.copy(S._sectionState.camPos);
            S.controls.target.copy(S._sectionState.camTarget);
            S.controls.update();
        }
        S._sectionState = null;
    }
}

// ═══════════════════════════════════════════════════════════════════
// PUENTE corte2d → CAD 2D Overlay
// Importa los segmentos del corte como polylines en el CAD
// ═══════════════════════════════════════════════════════════════════
function _sectionActivateCAD(axis, planeVal, segments3d, nodes3d){
    if(!window.CAD || !window.activateCAD) return;

    // Mapear 3D → 2D segun el eje del corte
    // corte Z: CAD.x = World.X, CAD.y = World.Y
    // corte X: CAD.x = World.Z, CAD.y = World.Y (mirar de +X)
    // corte Y: CAD.x = World.X, CAD.y = World.Z (mirar de +Y, planta)
    function proj(v3){
        if(axis === "z") return {x: v3.x, y: v3.y};
        if(axis === "x") return {x: v3.z, y: v3.y};
        return {x: v3.x, y: v3.z}; // axis === "y"
    }

    // Limpiar formas CAD anteriores
    CAD.formas.length = 0;
    CAD.historial.length = 0;
    CAD.set("histPos", -1);
    CAD.set("formaSel", -1);
    CAD.set("selectedShapes", []);

    // Escala: IFC usa metros, CAD usa cm (escala 1) por defecto.
    // Convertir m → cm (× 100) para mejor resolución visual
    var scale = 100; // 1m = 100 unidades CAD
    CAD.set("escala", 1);   // 1 unidad CAD = 1 cm
    CAD.set("unidad", "cm");
    CAD.set("tamGrid", 10); // grid cada 10cm

    // Importar cada segmento como línea CAD
    // La proyección CAD (w2s) ya niega Y, así que Y+ apunta arriba como en IFC
    for(var i = 0; i < segments3d.length; i++){
        var a = proj(segments3d[i][0]);
        var b = proj(segments3d[i][1]);
        CAD.formas.push({
            tipo: "linea",
            x1: a.x * scale, y1: a.y * scale,
            x2: b.x * scale, y2: b.y * scale,
            color: "#333333",
            _section: true  // marcar como geometría de sección (no editable)
        });
    }

    // Calcular bounding box de los segmentos para centrar la vista CAD
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for(var i = 0; i < CAD.formas.length; i++){
        var f = CAD.formas[i];
        if(f.tipo === "linea"){
            minX = Math.min(minX, f.x1, f.x2);
            maxX = Math.max(maxX, f.x1, f.x2);
            minY = Math.min(minY, f.y1, f.y2);
            maxY = Math.max(maxY, f.y1, f.y2);
        }
    }

    // Configurar colores para modo sección (ANTES de activar para que redraw los use)
    CAD.bgColor = "#ffffff";                        // fondo blanco como vista técnica
    CAD.gridColor = "rgba(180,190,210,0.3)";        // grid sutil sobre blanco
    CAD.set("currentColor", "#0066cc");             // dibujos del usuario en azul

    // Desactivar snap handler de sección IFC (el CAD tiene su propio snap)
    _sectionSnapDisable();

    // Desactivar OrbitControls (el CAD overlay maneja pan/zoom propio)
    if(S.controls) S.controls.enabled = false;

    // Importar nodos de sección como snap points adicionales del CAD
    // (los nodos IFC se agregan como puntos snap "endpoint" extra)
    if(nodes3d && nodes3d.length > 0 && CAD.addSectionNodes){
        var cadNodes = [];
        for(var ni = 0; ni < nodes3d.length; ni++){
            var np = proj(nodes3d[ni]);
            cadNodes.push({x: np.x * scale, y: np.y * scale});
        }
        CAD.addSectionNodes(cadNodes);
    }

    // Activar overlay (redimensiona canvas, bindea eventos)
    activateCAD();

    // Centrar y encuadrar la vista CAD en los segmentos importados
    if(minX < Infinity && CAD.canvas){
        var cx = (minX + maxX) / 2;
        var cy = (minY + maxY) / 2;
        var w = maxX - minX;
        var h = maxY - minY;
        var pad = 1.3; // 30% de margen
        var zx = CAD.canvas.width / (w * pad || 1);
        var zy = CAD.canvas.height / (h * pad || 1);
        var zoom = Math.min(zx, zy, 5); // max zoom 5x
        CAD.cam.zoom = zoom;
        CAD.cam.x = cx;
        CAD.cam.y = cy;
        CAD.redraw();
    }

    // Guardar historial inicial con segmentos importados
    CAD.saveHist();

    log("  CAD 2D activado — " + segments3d.length + " segmentos importados", "c-ok");
    log("  L=línea  D=cota  R=rect  C=circulo  Esc=cancelar", "c-dim");
    log("  U=undo  ZF=encuadrar  cad2d off=desactivar  sexport svg", "c-dim");
}
