// =====================================================================
// IFC Core — loadIfcBuffer, loadTextOnly, clearModel
// =====================================================================
"use strict";
var S = window._S;

async function loadIfcBuffer(buffer, fileName, fileSize){
    if(typeof WebIFC === "undefined"){
        log("ERROR: web-ifc no disponible", "c-err");
        return null;
    }

    clearModel();
    showLoading("Inicializando web-ifc...");

    try {
        var ifcAPI = new WebIFC.IfcAPI();
        ifcAPI.SetWasmPath("./");
        await ifcAPI.Init();

        showLoading("Abriendo modelo...");
        var data = new Uint8Array(buffer);
        var modelID = ifcAPI.OpenModel(data);

        var _rawBuf = buffer.slice(0);

        showLoading("Parseando texto IFC...");
        var decoder = new TextDecoder("utf-8");
        var text = decoder.decode(data);
        var parsed = parseIfcText(text);

        showLoading("Extrayendo geometría...");
        var meshes = ifcAPI.LoadAllGeometry(modelID);
        S.modelGroup = new THREE.Group();
        S.modelGroup.name = "ifc_model";
        var totalVerts = 0, totalTris = 0;
        var typeToMeshes = {};

        for(var i = 0; i < meshes.size(); i++){
            var mesh = meshes.get(i);
            var expressID = mesh.expressID;
            var entType = parsed.entities[expressID] ? parsed.entities[expressID].type : "UNKNOWN";

            var placedGeometries = mesh.geometries;
            for(var j = 0; j < placedGeometries.size(); j++){
                var pg = placedGeometries.get(j);
                var geom = ifcAPI.GetGeometry(modelID, pg.geometryExpressID);
                var vData = ifcAPI.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                var iData = ifcAPI.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

                var positions = new Float32Array(vData.length / 2);
                var normals = new Float32Array(vData.length / 2);
                for(var k = 0; k < vData.length; k += 6){
                    var vi = k/6*3;
                    positions[vi] = vData[k];
                    positions[vi+1] = vData[k+1];
                    positions[vi+2] = vData[k+2];
                    normals[vi] = vData[k+3];
                    normals[vi+1] = vData[k+4];
                    normals[vi+2] = vData[k+5];
                }

                var bufGeom = new THREE.BufferGeometry();
                bufGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
                bufGeom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
                bufGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(iData), 1));

                var color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
                var mat = new THREE.MeshPhongMaterial({
                    color: color,
                    opacity: pg.color.w,
                    transparent: pg.color.w < 1,
                    side: THREE.DoubleSide,
                    flatShading: false,
                    clippingPlanes: S.clippingEnabled && S.clippingPlane ? [S.clippingPlane] : []
                });
                var m3 = new THREE.Mesh(bufGeom, mat);
                var matrix = new THREE.Matrix4();
                matrix.fromArray(pg.flatTransformation);
                m3.applyMatrix4(matrix);
                m3.userData.ifcType = entType;
                m3.userData.expressID = expressID;
                S.modelGroup.add(m3);

                if(!typeToMeshes[entType]) typeToMeshes[entType] = [];
                typeToMeshes[entType].push(m3);

                totalVerts += positions.length / 3;
                totalTris += iData.length / 3;
            }
        }

        S.scene.add(S.modelGroup);
        ifcAPI.CloseModel(modelID);

        S.ifcModel = {
            meta: parsed.meta,
            entities: parsed.entities,
            typeIndex: parsed.typeIndex,
            fileName: fileName,
            fileSize: fileSize,
            totalVerts: totalVerts,
            totalTris: totalTris,
            raw: text,
            buffer: _rawBuf,
            mergeBuffer: null,
            mergeFilter: null,
            mergeOffset: null
        };
        S.ifcMeshes = typeToMeshes;
        S.ifcVisibility = {};
        for(var t in typeToMeshes) S.ifcVisibility[t] = true;

        hideLoading();
        fitView();
        updateObjTree();
        updateStatus();

        S.fileNameEl.textContent = fileName + " (" + (fileSize/1024/1024).toFixed(1) + " MB)";
        log("Modelo cargado: " + fileName, "c-ok");
        log("  " + totalVerts.toLocaleString() + " vértices, " + totalTris.toLocaleString() + " triángulos", "c-num");
        log("  " + Object.keys(typeToMeshes).length + " tipos, " + Object.keys(parsed.entities).length + " entidades", "c-num");
        if(parsed.meta.project) log("  Proyecto: " + parsed.meta.project, "c-key");

        // Poblar dropdown de niveles de planta si existe la funcion
        if(typeof _populatePlantLevelSelect === 'function'){
            setTimeout(_populatePlantLevelSelect, 500);
        }

        return S.ifcModel;
    } catch(err){
        hideLoading();
        log("ERROR al cargar: " + err.message, "c-err");
        console.error(err);

        log("Intentando carga solo-texto (sin geometría 3D)...", "c-warn");
        try {
            var dec = new TextDecoder("utf-8");
            var txt = dec.decode(new Uint8Array(buffer));
            loadTextOnly(txt, fileName, fileSize);
        } catch(e2){
            log("ERROR fallback: " + e2.message, "c-err");
        }
        return null;
    }
}

function loadTextOnly(text, fileName, fileSize){
    var t0 = performance.now();
    var parsed = parseIfcText(text);
    var dt = ((performance.now()-t0)/1000).toFixed(2);

    S.ifcModel = {
        meta: parsed.meta,
        entities: parsed.entities,
        typeIndex: parsed.typeIndex,
        fileName: fileName,
        fileSize: fileSize,
        totalVerts: 0,
        totalTris: 0,
        raw: text
    };
    S.ifcMeshes = {};
    S.ifcVisibility = {};

    S.fileNameEl.textContent = fileName + " (texto)";
    log("Parseado (solo texto) en " + dt + "s: " + Object.keys(parsed.entities).length + " entidades", "c-ok");
    updateObjTree();
    updateStatus();
    exec("summary");
}

function clearModel(){
    if(S.modelGroup){
        S.modelGroup.traverse(function(o){
            if(o.geometry) o.geometry.dispose();
            if(o.material){
                if(Array.isArray(o.material)) o.material.forEach(function(m){m.dispose();});
                else o.material.dispose();
            }
        });
        S.scene.remove(S.modelGroup);
        S.modelGroup = null;
    }
    if(S.wireGroup){ S.scene.remove(S.wireGroup); S.wireGroup=null; }
    S.ifcModel = null;
    S.ifcMeshes = {};
    S.ifcVisibility = {};
    S.selectedType = null;
    updateObjTree();
    updateProps(null);
}
