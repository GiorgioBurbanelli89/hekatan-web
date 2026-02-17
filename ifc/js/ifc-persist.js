// =====================================================================
// Persistence — trackCommand, saveHtmlWithState, restoreState, extractGeometry
// =====================================================================
"use strict";
var S = window._S;

var STATE_CMDS = /^(load|loadurl|merge|fusionar|mmove|fit|encuadrar|view|vista|wireframe|wire|showall|mostrartodo|hideall|ocultartodo|delete|eliminar|borrar|aislar|isolate|hidesel|ocultarsel|column|columna|beam|viga|wall|muro|slab|losa|footing|zapata|rebar|refuerzo|stair|escalera|railing|baranda|window|ventana|door|puerta)/i;

// Comandos que NO se deben auto-guardar (se manejan por autoLoad)
var SKIP_AUTOSAVE = /^(load|loadurl|merge|fusionar)\b/i;

function trackCommand(rawCmd){
    rawCmd = rawCmd.trim();
    if(!rawCmd || rawCmd[0]==="#") return;
    if(STATE_CMDS.test(rawCmd)){
        S.stateHistory.push(rawCmd);
        // Auto-guardar en localStorage (excluir load/merge que ya se manejan por autoLoad)
        if(!SKIP_AUTOSAVE.test(rawCmd)){
            autoSaveToLocalStorage();
        }
    }
}

function autoSaveToLocalStorage(){
    try {
        // Solo guardar comandos que NO son load/merge
        var cmds = S.stateHistory.filter(function(c){ return !SKIP_AUTOSAVE.test(c); });
        localStorage.setItem("ifcCli_savedCommands", JSON.stringify(cmds));
    } catch(e){ /* localStorage lleno o no disponible */ }
}

function autoRestoreFromLocalStorage(){
    try {
        var saved = localStorage.getItem("ifcCli_savedCommands");
        if(!saved) return;
        var cmds = JSON.parse(saved);
        if(!cmds || !cmds.length) return;
        log("Restaurando " + cmds.length + " comandos guardados...", "c-warn");
        cmds.forEach(function(cmd){
            log("  > " + cmd, "c-dim");
            exec(cmd);
        });
        // Agregar al historial actual
        cmds.forEach(function(c){ S.stateHistory.push(c); });
        log("Estado restaurado (" + cmds.length + " comandos)", "c-ok");
    } catch(e){ /* error parsing */ }
}

function clearAutoSave(){
    try { localStorage.removeItem("ifcCli_savedCommands"); } catch(e){}
    log("Auto-guardado limpiado.", "c-ok");
}

function saveHtmlWithState(){
    log("Generando HTML con estado guardado...", "c-warn");
    try {
        var doctype = "<!DOCTYPE html>\n";
        var htmlEl = document.documentElement.cloneNode(true);

        var cloneOutput = htmlEl.querySelector("#cliOutput");
        if(cloneOutput) cloneOutput.innerHTML = "";
        var cloneLoading = htmlEl.querySelector("#loadingOverlay");
        if(cloneLoading) cloneLoading.style.display = "none";

        var stateScript = document.createElement("script");
        stateScript.id = "ifc-saved-state";
        var stateData = {
            version: "3.0",
            timestamp: new Date().toISOString(),
            commands: S.stateHistory.slice(),
            loadUrl: null,
            mergeUrl: null
        };
        if(S.ifcModel && S.ifcModel._loadUrl) stateData.loadUrl = S.ifcModel._loadUrl;
        if(S.ifcModel && S.ifcModel._mergeUrl) stateData.mergeUrl = S.ifcModel._mergeUrl;

        stateScript.textContent = "\nwindow.__ifcSavedState = " + JSON.stringify(stateData, null, 2) + ";\n";

        var bodyEl = htmlEl.querySelector("body");
        var oldState = htmlEl.querySelector("#ifc-saved-state");
        if(oldState) oldState.remove();
        bodyEl.appendChild(stateScript);

        var html = doctype + htmlEl.outerHTML;
        var blob = new Blob([html], {type:"text/html;charset=utf-8"});
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        var outName = "ifc-cli";
        if(S.ifcModel) outName = S.ifcModel.fileName.replace(".ifc","") + "_viewer";
        a.download = outName + ".html";
        a.click();
        URL.revokeObjectURL(a.href);

        log("HTML guardado: " + a.download + " (" + (blob.size/1024).toFixed(0) + " KB)", "c-ok");
        log("  " + S.stateHistory.length + " comandos guardados en el HTML", "c-num");
        log("  Al abrir, ejecute: window.ifc.exec('restore') para re-aplicar", "c-dim");
    } catch(err){
        log("ERROR savehtml: " + err.message, "c-err");
        console.error(err);
    }
}

function restoreState(){
    if(!window.__ifcSavedState){
        log("No hay estado guardado en este HTML.","c-dim");
        return;
    }
    var state = window.__ifcSavedState;
    log("═══ RESTAURANDO ESTADO ═══","c-head");
    log("  Guardado: " + state.timestamp, "c-dim");
    log("  Comandos: " + state.commands.length, "c-num");

    var skipped = 0;
    state.commands.forEach(function(cmd){
        if(/^(load|loadurl|merge|fusionar)\b/i.test(cmd)){
            log("  [skip] " + cmd + " (requiere archivo)", "c-dim");
            skipped++;
            return;
        }
        log("  > " + cmd, "c-key");
        exec(cmd);
    });
    S.stateHistory = state.commands.slice();
    log("Restaurado: " + (state.commands.length - skipped) + " comandos ejecutados, " + skipped + " omitidos", "c-ok");
}

// ═════════════════════════════════════════════════════════════════════
// EXTRACT GEOMETRY — Export 3D mesh data
// ═════════════════════════════════════════════════════════════════════
function extractGeometry(format, filterType){
    if(!S.modelGroup || S.modelGroup.children.length === 0){
        log("No hay geometría 3D cargada.", "c-err"); return;
    }

    var elements = [];
    var totalVerts = 0, totalTris = 0;

    S.modelGroup.traverse(function(obj){
        if(!obj.isMesh) return;
        var type = obj.userData.ifcType || "UNKNOWN";
        if(filterType && type !== filterType) return;

        var pos = obj.geometry.attributes.position;
        var idx = obj.geometry.index;
        var norm = obj.geometry.attributes.normal;

        var worldMatrix = obj.matrixWorld;
        var verts = [];
        var norms = [];
        for(var i = 0; i < pos.count; i++){
            var v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            v.applyMatrix4(worldMatrix);
            verts.push(v.x, v.y, v.z);
            if(norm){
                var n = new THREE.Vector3(norm.getX(i), norm.getY(i), norm.getZ(i));
                var normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
                n.applyMatrix3(normalMatrix).normalize();
                norms.push(n.x, n.y, n.z);
            }
        }

        var indices = [];
        if(idx){
            for(var j = 0; j < idx.count; j++) indices.push(idx.getX(j));
        }

        var bb = new THREE.Box3().setFromObject(obj);
        var bbMin = bb.min, bbMax = bb.max;
        var bbCenter = bb.getCenter(new THREE.Vector3());
        var bbSize = bb.getSize(new THREE.Vector3());

        var name = "";
        if(S.ifcModel && S.ifcModel.entities[obj.userData.expressID]){
            var ent = S.ifcModel.entities[obj.userData.expressID];
            var f = splitArgs(ent.args);
            name = decIfc((f[2]||"").replace(/'/g,""));
        }

        var elem = {
            id: obj.userData.expressID,
            type: type,
            name: name,
            merged: !!obj.userData.merged,
            color: obj.material ? [
                obj.material.color.r,
                obj.material.color.g,
                obj.material.color.b,
                obj.material.opacity
            ] : [1,1,1,1],
            geometry: {
                vertices: verts,
                normals: norms,
                indices: indices,
                vertexCount: pos.count,
                triangleCount: idx ? idx.count / 3 : 0
            },
            boundingBox: {
                min: [bbMin.x, bbMin.y, bbMin.z],
                max: [bbMax.x, bbMax.y, bbMax.z],
                center: [bbCenter.x, bbCenter.y, bbCenter.z],
                size: [bbSize.x, bbSize.y, bbSize.z]
            }
        };
        elements.push(elem);
        totalVerts += pos.count;
        totalTris += idx ? idx.count / 3 : 0;
    });

    if(elements.length === 0){
        log("No se encontraron elementos" + (filterType ? " de tipo " + filterType : "") + ".", "c-warn");
        return;
    }

    var typeCounts = {};
    elements.forEach(function(e){ typeCounts[e.type] = (typeCounts[e.type]||0)+1; });

    switch(format){
    case "json":
        var jsonData = {
            model: S.ifcModel ? S.ifcModel.fileName : "unknown",
            exported: new Date().toISOString(),
            filter: filterType || "all",
            summary: {
                totalElements: elements.length,
                totalVertices: totalVerts,
                totalTriangles: totalTris,
                types: typeCounts
            },
            elements: elements
        };
        var jsonStr = JSON.stringify(jsonData);
        var blob = new Blob([jsonStr], {type:"application/json"});
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (S.ifcModel?S.ifcModel.fileName.replace(".ifc",""):"model") + "_geometry.json";
        a.click(); URL.revokeObjectURL(a.href);
        log("JSON geometry exportado: " + a.download, "c-ok");
        log("  " + elements.length + " elementos, " + totalVerts.toLocaleString() + " vértices, " + (jsonStr.length/1024/1024).toFixed(1) + " MB", "c-num");
        break;

    case "obj":
        var objLines = ["# Exported from Calcpad IFC CLI v3.0"];
        objLines.push("# Model: " + (S.ifcModel?S.ifcModel.fileName:"unknown"));
        objLines.push("# Elements: " + elements.length);
        objLines.push("");
        var vertOffset = 1;
        elements.forEach(function(el){
            objLines.push("o " + el.type + "_" + el.id);
            var v2 = el.geometry.vertices;
            for(var i2=0; i2<v2.length; i2+=3){
                objLines.push("v " + v2[i2].toFixed(6) + " " + v2[i2+1].toFixed(6) + " " + v2[i2+2].toFixed(6));
            }
            var n2 = el.geometry.normals;
            for(var j2=0; j2<n2.length; j2+=3){
                objLines.push("vn " + n2[j2].toFixed(4) + " " + n2[j2+1].toFixed(4) + " " + n2[j2+2].toFixed(4));
            }
            var idx2 = el.geometry.indices;
            for(var k2=0; k2<idx2.length; k2+=3){
                var a2=idx2[k2]+vertOffset, b2=idx2[k2+1]+vertOffset, c2=idx2[k2+2]+vertOffset;
                objLines.push("f " + a2+"//"+a2 + " " + b2+"//"+b2 + " " + c2+"//"+c2);
            }
            vertOffset += el.geometry.vertexCount;
            objLines.push("");
        });
        var objStr = objLines.join("\n");
        var blobObj = new Blob([objStr], {type:"text/plain"});
        var aObj = document.createElement("a");
        aObj.href = URL.createObjectURL(blobObj);
        aObj.download = (S.ifcModel?S.ifcModel.fileName.replace(".ifc",""):"model") + ".obj";
        aObj.click(); URL.revokeObjectURL(aObj.href);
        log("OBJ exportado: " + aObj.download, "c-ok");
        log("  " + elements.length + " objetos, " + (objStr.length/1024/1024).toFixed(1) + " MB", "c-num");
        break;

    case "csv":
        var csvLines = ["id,type,name,merged,vx,vy,vz,bbox_cx,bbox_cy,bbox_cz,bbox_w,bbox_h,bbox_d,vertices,triangles"];
        elements.forEach(function(el){
            var bb2 = el.boundingBox;
            csvLines.push([
                el.id, el.type, '"'+el.name.replace(/"/g,'""')+'"', el.merged,
                bb2.center[0].toFixed(4), bb2.center[1].toFixed(4), bb2.center[2].toFixed(4),
                bb2.center[0].toFixed(4), bb2.center[1].toFixed(4), bb2.center[2].toFixed(4),
                bb2.size[0].toFixed(4), bb2.size[1].toFixed(4), bb2.size[2].toFixed(4),
                el.geometry.vertexCount, el.geometry.triangleCount
            ].join(","));
        });
        var csvStr = csvLines.join("\n");
        var blobCsv = new Blob([csvStr], {type:"text/csv"});
        var aCsv = document.createElement("a");
        aCsv.href = URL.createObjectURL(blobCsv);
        aCsv.download = (S.ifcModel?S.ifcModel.fileName.replace(".ifc",""):"model") + "_elements.csv";
        aCsv.click(); URL.revokeObjectURL(aCsv.href);
        log("CSV exportado: " + aCsv.download, "c-ok");
        log("  " + elements.length + " filas", "c-num");
        break;

    case "clipboard": case "clip":
        var clipData = {
            model: S.ifcModel ? S.ifcModel.fileName : "unknown",
            filter: filterType || "all",
            elements: elements.map(function(el){
                return {
                    id: el.id, type: el.type, name: el.name,
                    center: el.boundingBox.center,
                    size: el.boundingBox.size,
                    vertices: el.geometry.vertexCount,
                    triangles: el.geometry.triangleCount
                };
            })
        };
        navigator.clipboard.writeText(JSON.stringify(clipData,null,2)).then(function(){
            log("Geometría copiada al portapapeles (resumen)", "c-ok");
            log("  " + elements.length + " elementos", "c-num");
        });
        break;

    case "selected": case "sel":
        if(!S.selectedType){
            log("Primero seleccione un tipo en el árbol.", "c-err"); return;
        }
        extractGeometry("json", S.selectedType);
        return;

    default:
        log("Formatos: json, obj, csv, clipboard, selected", "c-warn");
        log("  extract json              → Todo en JSON", "c-dim");
        log("  extract obj               → Wavefront OBJ", "c-dim");
        log("  extract csv               → Tabla de elementos", "c-dim");
        log("  extract json IFCBEAM      → Solo vigas en JSON", "c-dim");
        log("  extract clipboard         → Resumen al portapapeles", "c-dim");
        log("  extract selected          → Tipo seleccionado", "c-dim");
    }

    if(format !== "selected" && format !== "sel"){
        log("Tipos exportados:", "c-dim");
        for(var tc in typeCounts) log("  " + tc + ": " + typeCounts[tc], "c-dim");
    }
}
