// =====================================================================
// Merge + Save — mergeFromUrl, mergeFromBuffer, _mergeCore, saveModel
// =====================================================================
"use strict";
var S = window._S;

async function mergeFromUrl(filterName, url){
    filterName = filterName.toLowerCase();
    var filterTypes = S.MERGE_FILTERS.hasOwnProperty(filterName) ? S.MERGE_FILTERS[filterName] : undefined;
    if(filterTypes === undefined){
        log("Filtro desconocido: "+filterName, "c-err");
        log("Filtros: "+Object.keys(S.MERGE_FILTERS).join(", "), "c-dim");
        return;
    }
    log("Merge: descargando "+url.split("/").pop()+"...", "c-warn");
    showLoading("Descargando para merge...");
    try {
        var resp = await fetch(url);
        var buffer = await resp.arrayBuffer();
        await _mergeCore(filterName, filterTypes, new Uint8Array(buffer));
    } catch(err){
        hideLoading();
        log("ERROR merge: " + err.message, "c-err");
        console.error(err);
    }
}

async function mergeFromBuffer(filterName, arrayBuffer, fileName){
    filterName = filterName.toLowerCase();
    var filterTypes = S.MERGE_FILTERS.hasOwnProperty(filterName) ? S.MERGE_FILTERS[filterName] : undefined;
    if(filterTypes === undefined){
        log("Filtro desconocido: "+filterName, "c-err"); return;
    }
    log("Merge: "+fileName+"...", "c-warn");
    try {
        await _mergeCore(filterName, filterTypes, new Uint8Array(arrayBuffer));
    } catch(err){
        hideLoading();
        log("ERROR merge: " + err.message, "c-err");
        console.error(err);
    }
}

async function _mergeCore(filterName, filterTypes, data){
    showLoading("Inicializando web-ifc para merge...");
    var ifcAPI = new WebIFC.IfcAPI();
    ifcAPI.SetWasmPath("./");
    await ifcAPI.Init();

    showLoading("Abriendo modelo secundario...");
    var modelID = ifcAPI.OpenModel(data);

    var decoder = new TextDecoder("utf-8");
    var text = decoder.decode(data);
    var parsed = parseIfcText(text);

    showLoading("Extrayendo geometría filtrada...");
    var meshes = ifcAPI.LoadAllGeometry(modelID);
    var addedVerts = 0, addedTris = 0, addedMeshes = 0;

    var offset = null;
    var tempGroup = new THREE.Group();
    for(var i = 0; i < meshes.size(); i++){
        var mesh = meshes.get(i);
        var expressID = mesh.expressID;
        var entType = parsed.entities[expressID] ? parsed.entities[expressID].type : "UNKNOWN";
        if(filterTypes !== null && filterTypes.indexOf(entType) < 0) continue;

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
                positions[vi] = vData[k];    positions[vi+1] = vData[k+1]; positions[vi+2] = vData[k+2];
                normals[vi] = vData[k+3];    normals[vi+1] = vData[k+4];   normals[vi+2] = vData[k+5];
            }

            var bufGeom = new THREE.BufferGeometry();
            bufGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
            bufGeom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
            bufGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(iData), 1));

            var color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
            var mat = new THREE.MeshPhongMaterial({
                color: color, opacity: pg.color.w,
                transparent: pg.color.w < 1, side: THREE.DoubleSide
            });
            var m3 = new THREE.Mesh(bufGeom, mat);
            var matrix = new THREE.Matrix4();
            matrix.fromArray(pg.flatTransformation);
            m3.applyMatrix4(matrix);
            m3.userData.ifcType = entType;
            m3.userData.expressID = expressID;
            m3.userData.merged = true;

            tempGroup.add(m3);
            addedVerts += positions.length / 3;
            addedTris += iData.length / 3;
            addedMeshes++;
        }
    }

    // Auto-align using structural elements as reference
    if(addedMeshes > 0 && S.modelGroup.children.length > 0){
        var baseBox = new THREE.Box3(); var srcFullBox = new THREE.Box3();
        var baseColBox = new THREE.Box3(); var baseBeamBox = new THREE.Box3();
        var hasBaseCols = false, hasBaseBeams = false;
        S.modelGroup.traverse(function(o){
            if(!o.isMesh || o.userData.merged) return;
            baseBox.expandByObject(o);
            if(o.userData.ifcType === 'IFCCOLUMN'){ baseColBox.expandByObject(o); hasBaseCols = true; }
            if(o.userData.ifcType === 'IFCBEAM'){ baseBeamBox.expandByObject(o); hasBaseBeams = true; }
        });
        for(var ti2 = 0; ti2 < tempGroup.children.length; ti2++){
            srcFullBox.expandByObject(tempGroup.children[ti2]);
        }
        var allSrcMeshes = ifcAPI.LoadAllGeometry(modelID);
        var srcAllColBox = new THREE.Box3(); var hasSrcAllCols = false;
        var srcAllBeamBox = new THREE.Box3(); var hasSrcAllBeams = false;
        for(var ai = 0; ai < allSrcMeshes.size(); ai++){
            var am = allSrcMeshes.get(ai);
            var aType = parsed.entities[am.expressID] ? parsed.entities[am.expressID].type : "";
            var isCol = (aType === 'IFCCOLUMN'), isBeam = (aType === 'IFCBEAM');
            if(!isCol && !isBeam) continue;
            var apg = am.geometries;
            for(var aj = 0; aj < apg.size(); aj++){
                var apgj = apg.get(aj);
                var ageom = ifcAPI.GetGeometry(modelID, apgj.geometryExpressID);
                var avData = ifcAPI.GetVertexArray(ageom.GetVertexData(), ageom.GetVertexDataSize());
                for(var ak = 0; ak < avData.length; ak += 6){
                    var pt = new THREE.Vector3(avData[ak], avData[ak+1], avData[ak+2]);
                    var mx = new THREE.Matrix4(); mx.fromArray(apgj.flatTransformation);
                    pt.applyMatrix4(mx);
                    if(isCol){ srcAllColBox.expandByPoint(pt); hasSrcAllCols = true; }
                    if(isBeam){ srcAllBeamBox.expandByPoint(pt); hasSrcAllBeams = true; }
                }
            }
        }

        var offsetX = 0, offsetY = 0, offsetZ = 0;
        var methodXZ = "global", methodY = "global";
        if(hasBaseCols && hasSrcAllCols){
            var bcC = new THREE.Vector3(); baseColBox.getCenter(bcC);
            var scC = new THREE.Vector3(); srcAllColBox.getCenter(scC);
            offsetX = bcC.x - scC.x;
            offsetZ = bcC.z - scC.z;
            methodXZ = "columnas";
        } else {
            var bcG = new THREE.Vector3(); baseBox.getCenter(bcG);
            var scG = new THREE.Vector3(); srcFullBox.getCenter(scG);
            offsetX = bcG.x - scG.x;
            offsetZ = bcG.z - scG.z;
        }
        if(hasBaseBeams && hasSrcAllBeams){
            offsetY = baseBeamBox.max.y - srcAllBeamBox.max.y;
            methodY = "vigas-tope";
        } else if(hasBaseCols && hasSrcAllCols){
            var bcC2 = new THREE.Vector3(); baseColBox.getCenter(bcC2);
            var scC2 = new THREE.Vector3(); srcAllColBox.getCenter(scC2);
            offsetY = bcC2.y - scC2.y;
            methodY = "columnas";
        } else {
            var bcG2 = new THREE.Vector3(); baseBox.getCenter(bcG2);
            var scG2 = new THREE.Vector3(); srcFullBox.getCenter(scG2);
            offsetY = bcG2.y - scG2.y;
        }
        offset = new THREE.Vector3(offsetX, offsetY, offsetZ);
        log("Auto-alineación XZ("+methodXZ+") Y("+methodY+"): offset ("+offset.x.toFixed(2)+", "+offset.y.toFixed(2)+", "+offset.z.toFixed(2)+")", "c-dim");
        tempGroup.children.forEach(function(child){
            child.position.x += offset.x;
            child.position.y += offset.y;
            child.position.z += offset.z;
        });
    }

    // Move from temp to modelGroup
    while(tempGroup.children.length > 0){
        var ch = tempGroup.children[0];
        tempGroup.remove(ch);
        S.modelGroup.add(ch);
        var et = ch.userData.ifcType;
        if(!S.ifcMeshes[et]) S.ifcMeshes[et] = [];
        S.ifcMeshes[et].push(ch);
        S.ifcVisibility[et] = true;
    }

    ifcAPI.CloseModel(modelID);
    hideLoading();

    if(S.ifcModel){
        S.ifcModel.totalVerts += addedVerts;
        S.ifcModel.totalTris += addedTris;
        S.ifcModel.mergeBuffer = data.buffer.slice(0);
        S.ifcModel.mergeFilter = filterName;
        S.ifcModel.mergeOffset = offset ? {x: offset.x, y: offset.y, z: offset.z} : {x:0,y:0,z:0};
    }
    updateObjTree();
    updateStatus();
    fitView();

    log("Merge completado: +" + addedMeshes + " meshes ("+filterName+")", "c-ok");
    log("  +" + addedVerts.toLocaleString() + " vértices, +" + addedTris.toLocaleString() + " triángulos", "c-num");
}

// ═════════════════════════════════════════════════════════════════════
// SAVE — Export merged IFC model (v3 — robust entity parser + spatial redirect)
// ═════════════════════════════════════════════════════════════════════
async function saveModel(outName){
    if(!S.ifcModel){ log("No hay modelo cargado.","c-err"); return; }
    if(!S.ifcModel.buffer){ log("No hay buffer original (modelo cargado sin buffer).","c-err"); return; }

    showLoading("Preparando guardado...");
    try {
        var api = new WebIFC.IfcAPI();
        api.SetWasmPath("./");
        await api.Init();

        showLoading("Abriendo modelo base...");
        var baseData = new Uint8Array(S.ifcModel.buffer);
        var baseID = api.OpenModel(baseData);

        if(S.ifcModel.mergeBuffer){
            showLoading("Insertando entidades fusionadas...");
            var mergeData = new Uint8Array(S.ifcModel.mergeBuffer);
            var mergeID = api.OpenModel(mergeData);

            var mergeTxt = new TextDecoder("utf-8").decode(mergeData);
            var baseTxt = new TextDecoder("utf-8").decode(baseData);
            var baseIsMilli = /IFCSIUNIT\s*\(\s*\*\s*,\s*\.LENGTHUNIT\.\s*,\s*\.MILLI\.\s*,/i.test(baseTxt);
            var mergeIsMilli = /IFCSIUNIT\s*\(\s*\*\s*,\s*\.LENGTHUNIT\.\s*,\s*\.MILLI\.\s*,/i.test(mergeTxt);
            var baseUnit = baseIsMilli ? "mm" : "m";
            var mergeUnit = mergeIsMilli ? "mm" : "m";

            var scaleFactor = 1.0;
            if(mergeIsMilli && !baseIsMilli) scaleFactor = 0.001;
            if(!mergeIsMilli && baseIsMilli) scaleFactor = 1000.0;

            log("Unidades base: " + baseUnit + ", merge: " + mergeUnit + ", factor escala: " + scaleFactor, "c-dim");

            var ifcOffset = {x:0, y:0, z:0};
            if(S.ifcModel.mergeOffset){
                ifcOffset.x = S.ifcModel.mergeOffset.x;
                ifcOffset.y = -S.ifcModel.mergeOffset.z;
                ifcOffset.z = S.ifcModel.mergeOffset.y;
            }
            if(S.ifcModel.manualMoveOffset){
                ifcOffset.x += S.ifcModel.manualMoveOffset.x;
                ifcOffset.y += -S.ifcModel.manualMoveOffset.z;
                ifcOffset.z += S.ifcModel.manualMoveOffset.y;
            }
            if(baseIsMilli){ ifcOffset.x *= 1000; ifcOffset.y *= 1000; ifcOffset.z *= 1000; }
            var hasOffset = Math.abs(ifcOffset.x) > 0.001 || Math.abs(ifcOffset.y) > 0.001 || Math.abs(ifcOffset.z) > 0.001;
            log("Offset IFC (base units): X=" + ifcOffset.x.toFixed(3) + " Y=" + ifcOffset.y.toFixed(3) + " Z=" + ifcOffset.z.toFixed(3) + " " + baseUnit, "c-dim");

            var baseEndData = baseTxt.lastIndexOf("ENDSEC;");

            var mergeEntities = parseIfcEntities(mergeTxt);
            log("  Entidades merge parseadas: " + mergeEntities.length + " (parser robusto v3)", "c-dim");

            var mergeEntityMap = {};
            for(var mei = 0; mei < mergeEntities.length; mei++){
                var me = mergeEntities[mei];
                var meIdMatch = me.match(/^#(\d+)\s*=\s*/);
                if(!meIdMatch) continue;
                var meId = parseInt(meIdMatch[1]);
                var meBody = me.substring(meIdMatch[0].length);
                var meTypeMatch = meBody.match(/^(\w+)\s*\(/);
                var meType = meTypeMatch ? meTypeMatch[1] : "UNKNOWN";
                mergeEntityMap[meId] = {type: meType, text: me};
            }

            var skipTypes = [
                "IFCPROJECT", "IFCUNITASSIGNMENT", "IFCSIUNIT",
                "IFCMEASUREWITHUNIT", "IFCDIMENSIONALEXPONENTS",
                "IFCCONVERSIONBASEDUNIT", "IFCGEOMETRICREPRESENTATIONCONTEXT",
                "IFCOWNERHISTORY", "IFCPERSON", "IFCORGANIZATION",
                "IFCPERSONANDORGANIZATION", "IFCAPPLICATION",
                "IFCMONETARYUNIT", "IFCDERIVEDUNIT", "IFCDERIVEDUNITELEMENT",
                "IFCGEOMETRICREPRESENTATIONSUBCONTEXT",
                "IFCSITE", "IFCBUILDING"
            ];
            var skipRelTypes = ["IFCRELAGGREGATES"];
            var skipAll = skipTypes.concat(skipRelTypes);

            var mergeSkippedIds = {};
            for(var skId in mergeEntityMap){
                var skType = mergeEntityMap[skId].type;
                if(skipAll.indexOf(skType) >= 0){
                    mergeSkippedIds[skId] = skType;
                }
            }

            var baseEntities = parseIfcEntities(baseTxt);
            var baseIdByType = {};
            for(var bei = 0; bei < baseEntities.length; bei++){
                var be = baseEntities[bei];
                var beIdMatch = be.match(/^#(\d+)\s*=\s*/);
                if(!beIdMatch) continue;
                var beId = parseInt(beIdMatch[1]);
                var beBody = be.substring(beIdMatch[0].length);
                var beTypeMatch = beBody.match(/^(\w+)\s*\(/);
                var beType = beTypeMatch ? beTypeMatch[1] : "";
                if(skipAll.indexOf(beType) >= 0){
                    if(!baseIdByType[beType]) baseIdByType[beType] = [];
                    baseIdByType[beType].push(beId);
                }
            }

            var mergeIdByType = {};
            for(var msId in mergeSkippedIds){
                var msType = mergeSkippedIds[msId];
                if(!mergeIdByType[msType]) mergeIdByType[msType] = [];
                mergeIdByType[msType].push(parseInt(msId));
            }

            var redirectMap = {};
            for(var rtype in mergeIdByType){
                var mids = mergeIdByType[rtype];
                var bids = baseIdByType[rtype] || [];
                for(var ri = 0; ri < mids.length; ri++){
                    var targetBase = bids.length > ri ? bids[ri] : (bids.length > 0 ? bids[0] : null);
                    if(targetBase !== null){
                        redirectMap[mids[ri]] = targetBase;
                    }
                }
            }

            function getStoreyMap(entities){
                var map = {};
                for(var si = 0; si < entities.length; si++){
                    var se = entities[si];
                    var sIdMatch = se.match(/^#(\d+)\s*=\s*/);
                    if(!sIdMatch) continue;
                    if(!/IFCBUILDINGSTOREY\s*\(/.test(se)) continue;
                    var sId = parseInt(sIdMatch[1]);
                    var nameMatch = se.match(/IFCBUILDINGSTOREY\s*\([^,]*,[^,]*,\s*'([^']*)'/);
                    var name = nameMatch ? nameMatch[1] : "STOREY_" + sId;
                    map[name] = sId;
                }
                return map;
            }
            var baseStoreys = getStoreyMap(baseEntities);
            var mergeStoreys = getStoreyMap(mergeEntities);

            var baseStoreyIds = Object.values(baseStoreys);
            var firstBaseStorey = baseStoreyIds.length > 0 ? baseStoreyIds[0] : null;
            for(var msName in mergeStoreys){
                var mStoreyId = mergeStoreys[msName];
                if(baseStoreys[msName]){
                    redirectMap[mStoreyId] = baseStoreys[msName];
                } else if(firstBaseStorey){
                    redirectMap[mStoreyId] = firstBaseStorey;
                }
                mergeSkippedIds[mStoreyId] = "IFCBUILDINGSTOREY";
            }

            var redirectCount = Object.keys(redirectMap).length;
            log("  Referencias redirigidas: " + redirectCount + " (proyecto + espacial)", "c-dim");

            var maxBaseID = 0;
            for(var mbi = 0; mbi < baseEntities.length; mbi++){
                var mbMatch = baseEntities[mbi].match(/^#(\d+)/);
                if(mbMatch){
                    var mbId = parseInt(mbMatch[1]);
                    if(mbId > maxBaseID) maxBaseID = mbId;
                }
            }
            var idOffset = maxBaseID + 100;

            var newLines = [];
            var needsScale = Math.abs(scaleFactor - 1.0) > 0.0001;
            var scaledPts = 0;
            var skippedCount = 0;
            var relContainedCount = 0;

            var wrapperPlacementID = 0;
            if(hasOffset){
                var wPtID = idOffset - 3;
                var wAxID = idOffset - 2;
                var wPlID = idOffset - 1;
                wrapperPlacementID = wPlID;
                newLines.push("#" + wPtID + "= IFCCARTESIANPOINT((" + ifcOffset.x + "," + ifcOffset.y + "," + ifcOffset.z + "));");
                newLines.push("#" + wAxID + "= IFCAXIS2PLACEMENT3D(#" + wPtID + ",$,$);");
                newLines.push("#" + wPlID + "= IFCLOCALPLACEMENT($,#" + wAxID + ");");
                log("  Wrapper placement #" + wPlID + " offset (" + ifcOffset.x.toFixed(3) + "," + ifcOffset.y.toFixed(3) + "," + ifcOffset.z.toFixed(3) + ") " + baseUnit, "c-ok");
            }

            for(var mi = 0; mi < mergeEntities.length; mi++){
                var entity = mergeEntities[mi];
                var entIdMatch = entity.match(/^#(\d+)\s*=\s*/);
                if(!entIdMatch) continue;
                var entId = parseInt(entIdMatch[1]);

                if(mergeSkippedIds.hasOwnProperty(entId)){
                    skippedCount++;
                    continue;
                }

                var entBody2 = entity.substring(entIdMatch[0].length);
                var entTypeMatch2 = entBody2.match(/^(\w+)\s*\(/);
                var entType2 = entTypeMatch2 ? entTypeMatch2[1] : "";

                if(entType2 === "IFCRELCONTAINEDINSPATIALSTRUCTURE"){
                    relContainedCount++;
                    skippedCount++;
                    continue;
                }

                if(entType2 === "IFCBUILDINGSTOREY"){
                    skippedCount++;
                    continue;
                }

                var newLine = entity.replace(/#(\d+)/g, function(match, num){
                    var origId = parseInt(num);
                    if(redirectMap.hasOwnProperty(origId)){
                        return "#" + redirectMap[origId];
                    }
                    return "#" + (origId + idOffset);
                });

                if(needsScale && newLine.indexOf("IFCCARTESIANPOINT") >= 0){
                    newLine = newLine.replace(
                        /IFCCARTESIANPOINT\s*\(\s*\(([^)]+)\)\s*\)/g,
                        function(match, coords){
                            var parts = coords.split(",");
                            var scaled = parts.map(function(p){
                                var v = parseFloat(p.trim());
                                if(isNaN(v)) return p.trim();
                                return (v * scaleFactor).toString();
                            });
                            scaledPts++;
                            return "IFCCARTESIANPOINT((" + scaled.join(",") + "))";
                        }
                    );
                }

                if(needsScale){
                    newLine = newLine.replace(
                        /IFCPOSITIVELENGTHMEASURE\s*\(\s*([0-9eE.+-]+)\s*\)/g,
                        function(match, val){ return "IFCPOSITIVELENGTHMEASURE(" + (parseFloat(val) * scaleFactor) + ")"; }
                    );
                    newLine = newLine.replace(
                        /IFCLENGTHMEASURE\s*\(\s*([0-9eE.+-]+)\s*\)/g,
                        function(match, val){ return "IFCLENGTHMEASURE(" + (parseFloat(val) * scaleFactor) + ")"; }
                    );
                    newLine = newLine.replace(
                        /IFCAREAMEASURE\s*\(\s*([0-9eE.+-]+)\s*\)/g,
                        function(match, val){ return "IFCAREAMEASURE(" + (parseFloat(val) * scaleFactor * scaleFactor) + ")"; }
                    );
                    newLine = newLine.replace(
                        /IFCVOLUMEMEASURE\s*\(\s*([0-9eE.+-]+)\s*\)/g,
                        function(match, val){ return "IFCVOLUMEMEASURE(" + (parseFloat(val) * scaleFactor * scaleFactor * scaleFactor) + ")"; }
                    );
                }

                if(wrapperPlacementID > 0 && /IFCLOCALPLACEMENT\s*\(\s*\$\s*,/.test(newLine)){
                    newLine = newLine.replace(
                        /IFCLOCALPLACEMENT\s*\(\s*\$\s*,/,
                        "IFCLOCALPLACEMENT(#" + wrapperPlacementID + ","
                    );
                }

                newLines.push(newLine);
            }

            // Rewrite IFCRELCONTAINEDINSPATIALSTRUCTURE
            if(relContainedCount > 0){
                for(var rci = 0; rci < mergeEntities.length; rci++){
                    var rce = mergeEntities[rci];
                    if(!/IFCRELCONTAINEDINSPATIALSTRUCTURE\s*\(/.test(rce)) continue;
                    var rcIdMatch = rce.match(/^#(\d+)\s*=/);
                    if(!rcIdMatch) continue;
                    var rcOrigId = parseInt(rcIdMatch[1]);
                    var lastHashMatch = rce.match(/,\s*#(\d+)\s*\)\s*;?\s*$/);
                    if(!lastHashMatch) continue;
                    var origStoreyId = parseInt(lastHashMatch[1]);
                    var prodListMatch = rce.match(/\(\s*(#\d+(?:\s*,\s*#\d+)*)\s*\)\s*,\s*#\d+\s*\)\s*;?\s*$/);
                    if(!prodListMatch) continue;
                    var prodRefs = prodListMatch[1].match(/#(\d+)/g);
                    if(!prodRefs || prodRefs.length === 0) continue;

                    var newProds = [];
                    for(var pi = 0; pi < prodRefs.length; pi++){
                        var pOrigId = parseInt(prodRefs[pi].substring(1));
                        if(mergeSkippedIds.hasOwnProperty(pOrigId)) continue;
                        if(redirectMap.hasOwnProperty(pOrigId)){
                            newProds.push("#" + redirectMap[pOrigId]);
                        } else {
                            newProds.push("#" + (pOrigId + idOffset));
                        }
                    }
                    if(newProds.length === 0) continue;

                    var targetStorey;
                    if(redirectMap.hasOwnProperty(origStoreyId)){
                        targetStorey = redirectMap[origStoreyId];
                    } else {
                        targetStorey = firstBaseStorey || origStoreyId;
                    }

                    var newGuid = "3M" + Math.random().toString(36).substr(2, 20);
                    var newRelId = rcOrigId + idOffset;
                    var baseOwnerIds = baseIdByType["IFCOWNERHISTORY"] || [];
                    var baseOwner = baseOwnerIds.length > 0 ? "#" + baseOwnerIds[0] : "$";

                    var newRel = "#" + newRelId + "= IFCRELCONTAINEDINSPATIALSTRUCTURE('" + newGuid + "'," + baseOwner + ",$,$,(" + newProds.join(",") + "),#" + targetStorey + ");";
                    newLines.push(newRel);
                }
                log("  IFCRELCONTAINEDINSPATIALSTRUCTURE reescritas: " + relContainedCount, "c-dim");
            }

            log("  Entidades omitidas (proyecto+espacial): " + skippedCount, "c-dim");
            log("  Entidades insertadas: " + newLines.length, "c-dim");
            if(needsScale) log("  Escaladas " + scaledPts + " coordenadas (factor " + scaleFactor + ")", "c-ok");

            var deletedIDs = S.ifcModel.deletedIDs || {};
            var hasDeleted = Object.keys(deletedIDs).length > 0;
            var finalBaseTxt = baseTxt.substring(0, baseEndData);
            if(hasDeleted){
                var baseEntsFiltered = parseIfcEntities(baseTxt);
                var baseHeader = baseTxt.substring(0, baseTxt.indexOf("DATA;") + 5);
                var keptBase = [];
                var deletedBaseCount = 0;
                for(var bfi = 0; bfi < baseEntsFiltered.length; bfi++){
                    var bfe = baseEntsFiltered[bfi];
                    var bfeIdMatch = bfe.match(/^#(\d+)/);
                    if(bfeIdMatch && deletedIDs[parseInt(bfeIdMatch[1])]){
                        deletedBaseCount++;
                        continue;
                    }
                    keptBase.push(bfe);
                }
                finalBaseTxt = baseHeader + "\n" + keptBase.join("\n") + "\n";
                if(deletedBaseCount > 0) log("  Eliminadas " + deletedBaseCount + " entidades base (delete)", "c-dim");
            }

            var mergedIfc = finalBaseTxt
                + "\n/* === MERGED: " + (S.ifcModel.mergeFilter||"") + " === */\n"
                + newLines.join("\n") + "\n"
                + baseTxt.substring(baseEndData);

            var blob = new Blob([mergedIfc], {type: "application/octet-stream"});
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = outName || S.ifcModel.fileName.replace(".ifc", "_merged.ifc");
            a.click();
            URL.revokeObjectURL(a.href);

            api.CloseModel(mergeID);
            log("IFC guardado: " + a.download + " (" + (blob.size/1024/1024).toFixed(1) + " MB)", "c-ok");
            log("  Entidades merge con ID offset +" + idOffset, "c-dim");
            if(needsScale) log("  Coordenadas escaladas: " + mergeUnit + " → " + baseUnit + " (factor " + scaleFactor + ")", "c-ok");
            if(hasOffset) log("  Wrapper placement: offset (" + ifcOffset.x.toFixed(3) + "," + ifcOffset.y.toFixed(3) + "," + ifcOffset.z.toFixed(3) + ") " + baseUnit, "c-ok");
        } else {
            // No merge — save base, filtering deleted entities if any
            var deletedIDs2 = S.ifcModel.deletedIDs || {};
            var hasDeleted2 = Object.keys(deletedIDs2).length > 0;
            if(hasDeleted2){
                var baseTxt2 = new TextDecoder("utf-8").decode(baseData);
                var baseEnts2 = parseIfcEntities(baseTxt2);
                var header2 = baseTxt2.substring(0, baseTxt2.indexOf("DATA;") + 5);
                var footer2 = baseTxt2.substring(baseTxt2.lastIndexOf("ENDSEC;"));
                var kept2 = [];
                var delCount2 = 0;
                for(var k2i = 0; k2i < baseEnts2.length; k2i++){
                    var k2e = baseEnts2[k2i];
                    var k2m = k2e.match(/^#(\d+)/);
                    if(k2m && deletedIDs2[parseInt(k2m[1])]){ delCount2++; continue; }
                    kept2.push(k2e);
                }
                var filteredIfc = header2 + "\n" + kept2.join("\n") + "\n" + footer2;
                var blob2 = new Blob([filteredIfc], {type: "application/octet-stream"});
                var a2 = document.createElement("a");
                a2.href = URL.createObjectURL(blob2);
                a2.download = outName || S.ifcModel.fileName;
                a2.click();
                URL.revokeObjectURL(a2.href);
                log("IFC guardado: " + a2.download + " (" + (blob2.size/1024/1024).toFixed(1) + " MB, " + delCount2 + " entidades eliminadas)", "c-ok");
            } else {
                var savedData = api.SaveModel(baseID);
                var blob3 = new Blob([savedData], {type: "application/octet-stream"});
                var a3 = document.createElement("a");
                a3.href = URL.createObjectURL(blob3);
                a3.download = outName || S.ifcModel.fileName;
                a3.click();
                URL.revokeObjectURL(a3.href);
                log("IFC guardado: " + a3.download + " (" + (blob3.size/1024/1024).toFixed(1) + " MB)", "c-ok");
            }
        }

        api.CloseModel(baseID);
    } catch(err){
        log("ERROR al guardar: " + err.message, "c-err");
        console.error(err);
    }
    hideLoading();
}
