// =====================================================================
// File I/O — openFile, openMerge, loadFromUrl, drag&drop, init, public API
// =====================================================================
"use strict";
var S = window._S;

function openFile(){
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".ifc";
    input.onchange = function(){
        if(!input.files[0]) return;
        var file = input.files[0];
        var reader = new FileReader();
        reader.onload = function(){ loadIfcBuffer(reader.result, file.name, file.size); };
        reader.readAsArrayBuffer(file);
    };
    input.click();
}

function openMerge(){
    if(!S.modelGroup || S.modelGroup.children.length === 0){
        log("Primero cargue un modelo base antes de fusionar.", "c-err"); return;
    }
    var filter = prompt("Filtro de merge:\n  escalera, muro, columna, viga, losa, zapata, refuerzo, todo\n\nEscriba el filtro:", "escalera");
    if(!filter) return;
    filter = filter.trim().toLowerCase();
    if(!S.MERGE_FILTERS.hasOwnProperty(filter)){
        log("Filtro desconocido: "+filter, "c-err");
        log("Filtros: "+Object.keys(S.MERGE_FILTERS).join(", "), "c-dim"); return;
    }
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".ifc";
    input.onchange = function(){
        if(!input.files[0]) return;
        var file = input.files[0];
        var reader = new FileReader();
        reader.onload = function(){
            mergeFromBuffer(filter, reader.result, file.name);
        };
        reader.readAsArrayBuffer(file);
    };
    input.click();
}

function loadFromUrl(url){
    log("Cargando desde "+url+"...", "c-warn");
    showLoading("Descargando "+url.split("/").pop()+"...");
    fetch(url).then(function(r){ return r.arrayBuffer(); }).then(function(buf){
        var name = url.split("/").pop().split("\\").pop();
        loadIfcBuffer(buf, name, buf.byteLength).then(function(){
            if(S.ifcModel) S.ifcModel._loadUrl = url;
        });
    }).catch(function(e){
        hideLoading();
        log("ERROR fetch: "+e.message, "c-err");
        fetch(url).then(function(r){return r.text();}).then(function(txt){
            var name = url.split("/").pop();
            loadTextOnly(txt, name, txt.length);
        }).catch(function(e2){ log("ERROR: "+e2.message,"c-err"); });
    });
}

function initDragDrop(){
    var vp = document.getElementById("viewport");
    var overlay = document.getElementById("dropOverlay");

    document.body.addEventListener("dragover", function(e){ e.preventDefault(); });
    vp.addEventListener("dragenter", function(e){ e.preventDefault(); overlay.style.display="flex"; });
    vp.addEventListener("dragover", function(e){ e.preventDefault(); e.dataTransfer.dropEffect="copy"; });
    vp.addEventListener("dragleave", function(e){
        if(!vp.contains(e.relatedTarget)) overlay.style.display="none";
    });
    vp.addEventListener("drop", function(e){
        e.preventDefault(); overlay.style.display="none";
        for(var i=0;i<e.dataTransfer.files.length;i++){
            if(e.dataTransfer.files[i].name.toLowerCase().endsWith(".ifc")){
                var file = e.dataTransfer.files[i];
                var reader = new FileReader();
                reader.onload = function(){ loadIfcBuffer(reader.result, file.name, file.size); };
                reader.readAsArrayBuffer(file);
                break;
            }
        }
    });
}

// ═════════════════════════════════════════════════════════════════════
// INIT
// ═════════════════════════════════════════════════════════════════════
function init(){
    S.cliOutput = document.getElementById("cliOutput");
    S.cliInput = document.getElementById("cliInput");
    S.fileNameEl = document.getElementById("fileName");
    S.objTreeEl = document.getElementById("objTree");
    S.propsPanel = document.getElementById("propsPanel");
    S.viewportInfo = document.getElementById("viewportInfo");
    S.statusBar = document.getElementById("statusBar");

    initThree();
    initDragDrop();

    log("Calcpad IFC CLI v3.0", "c-ok");
    log("Three.js + web-ifc — Arrastre un .ifc o escriba 'help'", "c-dim");
    log("Controlable via MCP Chrome: window.ifc.exec('...')", "c-dim");

    if(window.__ifcSavedState){
        var ss = window.__ifcSavedState;
        log("", "");
        log("Estado guardado detectado (" + ss.commands.length + " comandos)", "c-warn");
        log("  Guardado: " + ss.timestamp, "c-dim");
        log("  Escriba 'restore' después de cargar el IFC para re-aplicar.", "c-key");
        if(ss.loadUrl){
            log("  URL modelo: " + ss.loadUrl, "c-dim");
        }
    }

    // ── Auto-carga: cargar modelo + merge al iniciar ──
    if(window.__ifcAutoLoad){
        var al = window.__ifcAutoLoad;
        log("", "");
        log("Auto-carga configurada...", "c-warn");
        setTimeout(function(){
            autoLoadSequence(al);
        }, 500);
    }
}

async function autoLoadSequence(cfg){
    if(!cfg.baseUrl){ log("Auto-carga: falta baseUrl", "c-err"); return; }
    try {
        log("Cargando modelo base: " + decodeURIComponent(cfg.baseUrl.split("/").pop()), "c-key");
        showLoading("Cargando modelo...");
        var resp = await fetch(cfg.baseUrl);
        var buf = await resp.arrayBuffer();
        var name = decodeURIComponent(cfg.baseUrl.split("/").pop());
        await loadIfcBuffer(buf, name, buf.byteLength);
        if(S.ifcModel) S.ifcModel._loadUrl = cfg.baseUrl;

        if(cfg.merges && cfg.merges.length > 0){
            for(var i = 0; i < cfg.merges.length; i++){
                var m = cfg.merges[i];
                log("Auto-merge [" + (i+1) + "/" + cfg.merges.length + "]: " + m.filter + " desde " + decodeURIComponent(m.url.split("/").pop()), "c-key");
                await mergeFromUrl(m.filter, m.url);
                var totalOffY = (typeof m.offsetY === 'number' ? m.offsetY : 0) + (typeof m.mmoveY === 'number' ? m.mmoveY : 0);
                if(totalOffY !== 0){
                    S.modelGroup.traverse(function(o){
                        if(o.isMesh && o.userData.merged) o.position.y += totalOffY;
                    });
                    if(S.ifcModel && S.ifcModel.mergeOffset) S.ifcModel.mergeOffset.y += totalOffY;
                    log("  offsetY total: " + totalOffY.toFixed(2) + " (base escalera → 0.20)", "c-ok");
                }
            }
        }
        log("Auto-carga completada.", "c-ok");

        // ── Post-procesamiento de escalera: convertir cara inferior en rampa ──
        if(cfg.postProcess && cfg.postProcess.length > 0){
            cfg.postProcess.forEach(function(pp){
                if(pp === "stairRamp"){
                    var stairMeshes = [];
                    S.modelGroup.traverse(function(o){
                        if(o.isMesh && o.userData.merged) stairMeshes.push(o);
                    });
                    if(stairMeshes.length > 0){
                        log("Post-proceso: modificando escalera (" + stairMeshes.length + " meshes)...", "c-warn");
                        stairUndersideToRamp(stairMeshes); // v60: incluye removeFinish internamente
                        log("Escalera: cara inferior → rampa inclinada", "c-ok");
                    }
                }
            });
        }

        // Mostrar planos de nivel automáticamente
        if(typeof createLevelPlanes === 'function') createLevelPlanes();
        // Poblar selector de niveles de planta (GUI dropdown)
        if(typeof _populatePlantLevelSelect === 'function'){
            setTimeout(_populatePlantLevelSelect, 300);
        }
        // Restaurar comandos: primero __ifcSavedState (HTML guardado), luego localStorage
        if(window.__ifcSavedState && window.__ifcSavedState.commands && window.__ifcSavedState.commands.length > 0){
            restoreState();
        } else {
            autoRestoreFromLocalStorage();
        }
    } catch(e){
        hideLoading();
        log("ERROR auto-carga: " + e.message, "c-err");
    }
}

// ═════════════════════════════════════════════════════════════════════
// PUBLIC API (for MCP Chrome: window.ifc)
// ═════════════════════════════════════════════════════════════════════
window.ifc = {
    init: init,
    exec: exec,
    openFile: openFile,
    openMerge: openMerge,
    mergeFromBuffer: mergeFromBuffer,
    loadFromUrl: loadFromUrl,
    saveModel: saveModel,
    deleteType: deleteType,
    deleteByExpressID: deleteByExpressID,
    deleteMerged: deleteMerged,
    loadBuffer: loadIfcBuffer,
    mergeFromUrl: mergeFromUrl,
    model: function(){ return S.ifcModel; },
    meshes: function(){ return S.ifcMeshes; },

    getLevels: getLevels,
    getElements: getElements,
    getElementsBySection: getElementsBySection,
    getRebar: getRebar,
    getGrids: getGrids,
    getProfiles: getProfiles,
    getStructuralSummary: getStructuralSummary,
    generateReport: generateReport,

    fitView: fitView,
    setView: setView,
    switchToOrtho: switchToOrtho,
    switchToPersp: switchToPersp,
    hide: function(t){ setTypeVisible(t,false); updateObjTree(); },
    show: function(t){ setTypeVisible(t,true); updateObjTree(); },
    hideAll: function(){ for(var t in S.ifcMeshes) setTypeVisible(t,false); updateObjTree(); },
    showAll: function(){ for(var t in S.ifcMeshes) setTypeVisible(t,true); updateObjTree(); },
    isolate: function(t){ isolateType(t); },
    setColor: setTypeColor,
    setOpacity: setTypeOpacity,
    toggleWireframe: toggleWireframe,
    toggleAxes: toggleAxes,
    toggleGrid: toggleGrid,
    setLevelMode: setLevelMode,
    createLevelPlanes: createLevelPlanes,
    removeLevelPlanes: removeLevelPlanes,
    toggleLevelPlanes: toggleLevelPlanes,

    resolve: resolveAlias,
    alias: function(name, action, extra){ return execAlias(resolveAlias(name), [action].concat(extra||[])); },

    scene: function(){ return S.scene; },
    camera: function(){ return S.camera; },
    renderer: function(){ return S.renderer; },
    group: function(){ return S.modelGroup; },

    extract: extractGeometry,
    saveHtml: saveHtmlWithState,
    restore: restoreState,
    clearAutoSave: clearAutoSave,
    history: function(){ return S.stateHistory; },

    selectMesh: selectMesh,
    deselectMesh: deselectMesh,
    deleteSelectedMesh: deleteSelectedMesh,
    hideSelectedMesh: hideSelectedMesh,
    transparentSelectedMesh: transparentSelectedMesh,
    restoreAllMeshVisibility: restoreAllMeshVisibility,
    toggleSelectMode: toggleSelectMode,

    moveSelected: moveSelected,
    moveSelectedTo: moveSelectedTo,
    moveType: moveType,
    showSelectedPosition: showSelectedPosition,

    enableClipping: enableClipping,
    disableClipping: disableClipping,
    setClipValue: setClipValue,
    flipClipping: flipClipping,

    moveMerged: function(dx,dy,dz){
        var count = 0;
        if(!S.modelGroup) return 0;
        S.modelGroup.traverse(function(o){
            if(o.isMesh && o.userData.merged){
                o.position.x += (dx||0);
                o.position.y += (dy||0);
                o.position.z += (dz||0);
                count++;
            }
        });
        return count;
    },

    // ── CAD integration: acceso al state interno ──
    _state: S
};
window.ifcCli = window.ifc; // backwards compat

// ── Global init ──
window.addEventListener("DOMContentLoaded", function(){ window.ifc.init(); });

// ── CLI input ──
function runInput(){
    var inp = document.getElementById("cliInput");
    var cmd = inp.value.trim();
    if(cmd){ window.ifc.exec(cmd); inp.value=""; }
    inp.focus();
}
document.addEventListener("keydown", function(e){
    if(e.key==="Enter" && document.activeElement.id==="cliInput"){ e.preventDefault(); runInput(); }
});
