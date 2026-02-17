// =====================================================================
// Commands — exec, execAlias, runCmd (CLI command executor)
// =====================================================================
"use strict";
var S = window._S;

function exec(cmdText){
    var lines = cmdText.trim().split("\n");
    lines.forEach(function(raw){
        raw = raw.trim();
        if(!raw||raw[0]==="#") return;
        var tokens = raw.split(/\s+/);
        var cmd = tokens[0].toLowerCase();
        var args = tokens.slice(1);

        // "aislar" sin IDs no se registra aquí — isolateSelectedMeshes() lo hace con IDs
        var skipTrack = /^(aislar|isolate|isolatesel)$/i.test(cmd) && (args.length === 0 || !args[0].startsWith("#"));
        if(!skipTrack) trackCommand(raw);

        var aliasTypes = resolveAlias(cmd);
        if(aliasTypes.length > 0 && args.length > 0){
            execAlias(aliasTypes, args);
            return;
        }

        try { runCmd(cmd, args, raw); }
        catch(e){ log("ERROR: "+e.message, "c-err"); }
    });
}

function execAlias(types, args){
    var action = args[0].toLowerCase();
    var extra = args.slice(1);
    types.forEach(function(t){
        switch(action){
            case "hide": case "ocultar": setTypeVisible(t,false); log(t+" oculto","c-ok"); break;
            case "show": case "mostrar": setTypeVisible(t,true); log(t+" visible","c-ok"); break;
            case "isolate": case "aislar": isolateType(t); log(t+" aislado","c-ok"); break;
            case "color": setTypeColor(t,extra[0]||"#ff6600"); log(t+" color="+(extra[0]||"#ff6600"),"c-ok"); break;
            case "opacity": case "opacidad": var op=parseFloat(extra[0]||"0.5"); setTypeOpacity(t,op); log(t+" opacity="+op,"c-ok"); break;
            case "count": case "contar":
                var mc = S.ifcMeshes[t]?S.ifcMeshes[t].length:0;
                var ec = S.ifcModel?((S.ifcModel.typeIndex[t]||[]).length):0;
                log(t+": "+mc+" meshes, "+ec+" entidades","c-num"); break;
            case "delete": case "eliminar": case "borrar":
                deleteType(t);
                log(t+" eliminado ("+((S.ifcMeshes[t]||[]).length)+" meshes restantes)","c-ok"); break;
            case "fit": case "encuadrar":
                if(S.ifcMeshes[t] && S.ifcMeshes[t].length>0){
                    var box = new THREE.Box3();
                    S.ifcMeshes[t].forEach(function(m){box.expandByObject(m);});
                    if(!box.isEmpty()){
                        var center=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3());
                        var d=Math.max(size.x,size.y,size.z)*1.5;
                        S.camera.position.set(center.x+d*0.6,center.y+d*0.5,center.z+d*0.4);
                        S.controls.target.copy(center); S.controls.update();
                    }
                }
                log(t+" encuadrado","c-ok"); break;
            default: log("Acciones: hide show isolate color opacity count fit delete","c-warn");
        }
    });
    updateObjTree();
}

function runCmd(cmd, args, raw){
    switch(cmd){
    case "help": case "?": case "ayuda":
        log("═══ CALCPAD IFC CLI v3.0 ═══", "c-head");
        log("── Archivo ──", "c-key");
        log("  load / abrir           Cargar archivo IFC");
        log("  loadurl <url>          Cargar desde URL (MCP)");
        log("  merge <tipo> <url>     Fusionar elementos de otro IFC");
        log("    ej: merge escalera <url>");
        log("    tipos: escalera/stair, todo/all");
        log("  save [nombre.ifc]      Guardar modelo (con merge)");
        log("  clear / cls            Limpiar consola");
        log("  clearmodel             Descartar modelo");
        log("── Información ──", "c-key");
        log("  meta / info            Metadatos del archivo");
        log("  summary / resumen      Resumen estructural");
        log("  levels / niveles       Niveles y elevaciones");
        log("  columns / columnas     Detalle de columnas");
        log("  beams / vigas          Detalle de vigas");
        log("  slabs / losas          Detalle de losas");
        log("  rebar / refuerzo       Barras de refuerzo");
        log("  grids / ejes           Ejes/grillas");
        log("  profiles / perfiles    Perfiles rectangulares");
        log("  stats / estadisticas   Todas las entidades");
        log("  entity #ID             Info de una entidad");
        log("  search <texto>         Buscar en nombres");
        log("── Vista 3D ──", "c-key");
        log("  fit                    Encuadrar modelo");
        log("  view <top/front/3d>    Cambiar vista perspectiva");
        log("  wireframe              Toggle wireframe");
        log("  showall / hideall      Mostrar/ocultar todo");
        log("── Elevacion 2D (ortografica) ──", "c-key");
        log("  elevxy                 Elevacion plano XY (frente)");
        log("  elevxz / planta2d      Planta ortografica XZ");
        log("  elevyz                 Elevacion plano YZ (lateral)");
        log("  3d / perspectiva       Volver a vista 3D");
        log("  (mouse: arrastrar=pan, scroll=zoom, flechas=mover)", "c-dim");
        log("── Niveles de Planta (geometría) ──", "c-key");
        log("  plantlevels            Toggle niveles por geometria");
        log("  plantlevel             Listar niveles detectados");
        log("  plantlevel <N>         Cortar planta al nivel N");
        log("  plantlevel 0           Desactivar corte de nivel");
        log("── Recorte / Clipping ──", "c-key");
        log("  clip [x|y|z] [valor]   Recorte en eje (auto si omite eje)");
        log("  clip 3.5               Recorte en eje auto a 3.5m");
        log("  clipoff / sinrecorte   Desactivar recorte");
        log("  clipflip               Invertir direccion del corte");
        log("  clipval <num>          Mover posicion del recorte");
        log("── Tipo <acción> ──", "c-key");
        log("  column hide/show/isolate/color/opacity/count/fit/delete");
        log("  viga hide | muro show | losa color #ff0 | refuerzo delete");
        log("── Mover ──", "c-key");
        log("  move <dx> <dy> <dz>    Mover seleccion (relativo)");
        log("  moveto <x> <y> <z>     Mover seleccion a coordenada");
        log("  mmove <dx> <dy> <dz>   Mover meshes fusionados");
        log("  movetype <tipo> dx dy dz  Mover todos de un tipo");
        log("  pos / posicion         Coordenadas del seleccionado");
        log("── Aislar (multi-selección) ──", "c-key");
        log("  Ctrl+clic              Multi-seleccionar elementos");
        log("  aislar / isolate       Mostrar SOLO seleccionados");
        log("  desaislar / unisolate  Restaurar todos");
        log("── Eliminar ──", "c-key");
        log("  delete <tipo>          Eliminar por tipo (ej: delete refuerzo)");
        log("  delete merged          Eliminar todos los merge");
        log("  delete #1234           Eliminar entidad por expressID");
        log("  delete                 Eliminar tipo seleccionado");
        log("── Losa Rampa Escalera ──", "c-key");
        log("  rampescalera [espesor] Crear losa rampa bajo peldaños (def: 0.15m)");
        log("  rampescalera 0.15 #ID  Usar mesh específico por expressID");
        log("  rampescalera 0.12 sel  Usar selección manual como escalera");
        log("── Modificar Escalera ──", "c-key");
        log("  quitaracabado #ID     Eliminar acabado (3cm) de escalera");
        log("  rampainferior #ID     Rampa inferior (solo cara de abajo)");
        log("  extraercara #ID       Separar cara inferior como mesh independiente");
        log("── Geometría ──", "c-key");
        log("  extract json [TIPO]    Exportar geometría JSON");
        log("  extract obj [TIPO]     Exportar Wavefront OBJ");
        log("  extract csv            Tabla de elementos CSV");
        log("  extract clipboard      Resumen al portapapeles");
        log("  extract selected       Tipo seleccionado");
        log("── Reporte ──", "c-key");
        log("  report / reporte       Generar reporte HTML");
        log("  export / exportar      Descargar reporte HTML");
        log("  json                   Exportar datos JSON");
        log("── CAD 2D Overlay ──", "c-key");
        log("  cad2d                  Activar CAD 2D sobre viewport");
        log("  cad2d off              Desactivar CAD 2D");
        log("  sexport svg            Exportar dibujo CAD como SVG");
        log("  sexport cpd            Exportar geometria como Calcpad");
        log("  (Con CAD activo: L=linea R=rect C=circulo D=dim E=elipse)");
        log("  (  A=arco PL=polilinea  Esc=cancelar  U=undo  ZF=zoom fit)");
        log("  (  move/copy/mirror/rotate/offset/del/list/clear/save/load)");
        log("── Estado / Persistencia ──", "c-key");
        log("  savehtml               Guardar HTML con estado");
        log("  history                Ver historial comandos");
        log("  restore                Restaurar estado guardado");
        log("  clearhistory           Limpiar historial");
        break;

    case "load": case "abrir": openFile(); break;

    case "loadurl":
        if(!args[0]){ log("Uso: loadurl <url>","c-err"); return; }
        loadFromUrl(args[0]); break;

    case "merge": case "fusionar":
        if(args.length < 2){ log("Uso: merge <tipo> <url>","c-err"); log("  tipos: escalera/stair, todo/all","c-dim"); return; }
        if(!S.modelGroup){ log("Primero cargue un modelo base.","c-err"); return; }
        mergeFromUrl(args[0], args.slice(1).join(" ")); break;

    case "save": case "guardar":
        if(!S.ifcModel){ log("No hay modelo cargado.","c-err"); return; }
        saveModel(args[0] || null); break;

    case "delete": case "eliminar": case "borrar":
        if(!S.ifcModel){ log("No hay modelo cargado.","c-err"); return; }
        if(args.length === 0){
            if(S.selectedType){
                deleteType(S.selectedType);
                log(S.selectedType + " eliminado","c-ok");
            } else {
                log("Uso: delete <tipo|merged|#ID>","c-err");
                log("  delete IFCREINFORCINGBAR  Eliminar por tipo","c-dim");
                log("  delete refuerzo           Eliminar por alias","c-dim");
                log("  delete merged             Eliminar todos los merge","c-dim");
                log("  delete #1234              Eliminar entidad por ID","c-dim");
                log("  delete                    Eliminar tipo seleccionado","c-dim");
            }
            break;
        }
        var darg = args[0].toLowerCase();
        if(darg === "selected" || darg === "seleccionado" || darg === "sel"){
            deleteSelectedMesh();
            break;
        }
        if(darg === "merged" || darg === "merge" || darg === "fusionado"){
            deleteMerged();
        } else if(darg.startsWith("#")){
            var delId = parseInt(darg.substring(1));
            if(!isNaN(delId)) deleteByExpressID(delId);
            else log("ID inválido: " + darg, "c-err");
        } else {
            var delTypes = resolveAlias(darg);
            if(delTypes.length > 0){
                delTypes.forEach(function(dt){ deleteType(dt); });
            } else {
                deleteType(darg.toUpperCase());
            }
        }
        break;

    case "mmove":
        if(args.length < 3){ log("Uso: mmove <dx> <dy> <dz>  (mover meshes fusionados)","c-err"); return; }
        var mdx=parseFloat(args[0])||0, mdy=parseFloat(args[1])||0, mdz=parseFloat(args[2])||0;
        var mc2=0;
        if(S.modelGroup) S.modelGroup.traverse(function(o){
            if(o.isMesh && o.userData.merged){ o.position.x+=mdx; o.position.y+=mdy; o.position.z+=mdz; mc2++; }
        });
        if(S.ifcModel){
            if(!S.ifcModel.manualMoveOffset) S.ifcModel.manualMoveOffset = {x:0,y:0,z:0};
            S.ifcModel.manualMoveOffset.x += mdx;
            S.ifcModel.manualMoveOffset.y += mdy;
            S.ifcModel.manualMoveOffset.z += mdz;
        }
        log("Movidos "+mc2+" meshes merge: dx="+mdx+", dy="+mdy+", dz="+mdz, "c-ok");
        break;

    case "move": case "mover":
        if(args.length < 3){ log("Uso: move <dx> <dy> <dz>  (mover seleccion relativo)","c-err"); return; }
        moveSelected(parseFloat(args[0])||0, parseFloat(args[1])||0, parseFloat(args[2])||0);
        break;

    case "moveto": case "movera":
        if(args.length < 3){ log("Uso: moveto <x> <y> <z>  (mover a coordenada absoluta)","c-err"); return; }
        moveSelectedTo(parseFloat(args[0])||0, parseFloat(args[1])||0, parseFloat(args[2])||0);
        break;

    case "movetype": case "movertipo":
        if(args.length < 4){ log("Uso: movetype <tipo> <dx> <dy> <dz>","c-err"); return; }
        var mtTypes = resolveAlias(args[0]);
        var mtdx = parseFloat(args[1])||0, mtdy = parseFloat(args[2])||0, mtdz = parseFloat(args[3])||0;
        if(mtTypes.length === 0){ log("Tipo no encontrado: "+args[0],"c-err"); break; }
        mtTypes.forEach(function(mt){
            moveType(mt, mtdx, mtdy, mtdz);
        });
        break;

    case "pos": case "posicion": case "coords": case "coordenadas":
        showSelectedPosition();
        break;

    case "clear": case "cls":
        if(S.cliOutput) S.cliOutput.innerHTML = ""; break;

    case "clearmodel":
        clearModel();
        S.fileNameEl.textContent = "Sin archivo";
        log("Modelo descartado", "c-ok"); break;

    case "meta": case "info":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        var m = S.ifcModel.meta;
        log("═══ METADATOS ═══", "c-head");
        log("  Archivo:   "+S.ifcModel.fileName);
        log("  Tamaño:    "+(S.ifcModel.fileSize/1024/1024).toFixed(2)+" MB");
        log("  Schema:    "+(m.schema||"-"), "c-type");
        log("  Proyecto:  "+(m.project||"-"));
        log("  Autor:     "+(m.author||"-"));
        log("  Org:       "+(m.org||"-"));
        log("  App:       "+(m.app||"-"));
        log("  Fecha:     "+(m.timestamp||"-"));
        log("  Entidades: "+Object.keys(S.ifcModel.entities).length, "c-num");
        if(S.ifcModel.totalVerts) log("  Vértices:  "+S.ifcModel.totalVerts.toLocaleString(), "c-num");
        if(S.ifcModel.totalTris)  log("  Triáng:    "+S.ifcModel.totalTris.toLocaleString(), "c-num");
        break;

    case "summary": case "resumen":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        log("═══ RESUMEN ESTRUCTURAL ═══", "c-head");
        var ss = getStructuralSummary();
        for(var t in ss) log("  "+(S.SNAMES[t]||t).padEnd(22)+ss[t], "c-num");
        break;

    case "levels": case "niveles":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        var levs = getLevels();
        log("═══ NIVELES ("+levs.length+") ═══", "c-head");
        levs.forEach(function(l,i){ log("  "+(i+1)+". "+l.name.padEnd(30)+l.elevation.toFixed(3)+" m", "c-num"); });
        break;

    case "columns": case "columnas":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        var cs = getElementsBySection("IFCCOLUMN");
        log("═══ COLUMNAS ═══", "c-head");
        for(var s in cs) log("  "+s+": "+cs[s].length, "c-type");
        break;

    case "beams": case "vigas":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        var bs = getElementsBySection("IFCBEAM");
        log("═══ VIGAS ═══", "c-head");
        var bt=0;
        for(var s2 in bs){ log("  "+s2.padEnd(32)+bs[s2].length, "c-type"); bt+=bs[s2].length; }
        log("  TOTAL".padEnd(32)+bt, "c-num");
        break;

    case "slabs": case "losas":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        var sl = getElementsBySection("IFCSLAB");
        log("═══ LOSAS ═══", "c-head");
        for(var s3 in sl) log("  "+s3+": "+sl[s3].length, "c-type");
        break;

    case "rebar": case "refuerzo":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        var rb = getRebar();
        log("═══ REFUERZO ("+rb.total+" barras) ═══", "c-head");
        log("Por diámetro:", "c-key");
        for(var d in rb.byDia) log("  φ"+d.padEnd(10)+rb.byDia[d], "c-num");
        log("Por forma:", "c-key");
        for(var sh in rb.byShape) log("  "+sh.padEnd(25)+rb.byShape[sh], "c-num");
        break;

    case "grids": case "ejes":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        var gr = getGrids();
        log("═══ GRILLAS ("+gr.length+") ═══", "c-head");
        gr.forEach(function(g){ log("  "+g.name+" - "+g.axesU+" U x "+g.axesV+" V", "c-type"); });
        break;

    case "profiles": case "perfiles":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        var pr = getProfiles();
        log("═══ PERFILES RECTANGULARES ═══", "c-head");
        for(var n in pr){
            var p = pr[n];
            log("  "+n.padEnd(30)+p.w.toFixed(0)+"x"+p.h.toFixed(0)+"mm  ("+p.count+" usos)", "c-num");
        }
        break;

    case "stats": case "estadisticas":
        if(!S.ifcModel){ log("No hay archivo cargado.","c-err"); return; }
        var ti = S.ifcModel.typeIndex;
        var sorted = Object.keys(ti).sort(function(a,b){return ti[b].length-ti[a].length;});
        log("═══ TODAS LAS ENTIDADES ═══", "c-head");
        sorted.forEach(function(t2){ log("  "+t2.padEnd(42)+ti[t2].length, ti[t2].length>100?"c-num":""); });
        break;

    case "entity": case "entidad":
        if(!S.ifcModel){ log("No hay archivo.","c-err"); return; }
        var eid = parseInt((args[0]||"").replace("#",""));
        var ent = S.ifcModel.entities[eid];
        if(!ent){ log("Entidad #"+eid+" no encontrada.","c-err"); return; }
        log("#"+ent.id+" = "+ent.type, "c-type");
        log(ent.args.length>300?ent.args.substring(0,300)+"...":ent.args, "c-str");
        break;

    case "search": case "buscar":
        if(!S.ifcModel){ log("No hay archivo.","c-err"); return; }
        var q = args.join(" ").toLowerCase();
        var found=0;
        for(var id in S.ifcModel.entities){
            var e = S.ifcModel.entities[id];
            if(e.args.toLowerCase().indexOf(q)>=0){
                log("#"+e.id+" "+e.type+" → "+e.args.substring(0,100), "c-str");
                if(++found>=30){log("... (limitado a 30)","c-dim"); break;}
            }
        }
        if(found===0) log("No se encontró: "+q, "c-warn");
        else log("Encontrados: "+found, "c-ok");
        break;

    case "fit": case "encuadrar": fitView(); log("Vista encuadrada","c-ok"); break;

    case "view": case "vista": setView(args[0]||"3d"); log("Vista: "+(args[0]||"3d"),"c-ok"); break;

    case "elevxy": case "elev-xy": case "elevacion-xy":
        setView("elev-xy"); log("Elevacion XY (frente, ortografica 2D)","c-ok"); break;
    case "elevyz": case "elev-yz": case "elevacion-yz":
        setView("elev-yz"); log("Elevacion YZ (lateral, ortografica 2D)","c-ok"); break;
    case "elevxz": case "elev-xz": case "planta2d":
        setView("elev-xz"); log("Planta XZ (ortografica 2D)","c-ok"); break;
    case "3d": case "perspectiva":
        if(S.isOrtho) switchToPersp();
        setView("3d"); log("Vista 3D perspectiva","c-ok"); break;

    case "showlevels": case "mostrarlevels": case "mostrarniveles":
        createLevelPlanes(); break;
    case "hidelevels": case "ocultarlevels": case "ocultarniveles":
        removeLevelPlanes(); log("Niveles ocultos","c-ok"); break;
    case "togglelevels": case "planos":
        toggleLevelPlanes(); break;
    case "levelmode": case "modoniveles":
        if(args[0]) setLevelMode(args[0]);
        else log("Uso: levelmode revit | planos","c-warn");
        break;

    // ── Niveles de planta (geometria real) ──
    case "plantlevels": case "nivelesplanta": case "plantaniveles":
        togglePlantLevels(); break;
    case "showplantlevels": case "mostrarnivelesplanta":
        createPlantLevels(); break;
    case "hideplantlevels": case "ocultarnivelesplanta":
        removePlantLevels(); log("Niveles de planta ocultos","c-ok"); break;
    case "plantlevel": case "nivelplanta": case "planta":
        {
            var pln = parseInt(args[0]);
            if(isNaN(pln)){
                // Sin argumento: detectar y listar
                var plevs = detectPlantLevels();
                if(plevs.length === 0){ log("No se detectaron niveles.","c-warn"); break; }
                log("═══ NIVELES DE PLANTA ═══","c-head");
                plevs.forEach(function(pl,pi){
                    log("  N"+(pi+1)+"  +"+pl.elevation.toFixed(2)+"m  ("+pl.desc+")","c-num");
                });
                log("Usa: plantlevel <N> para cortar, plantlevel 0 para desactivar","c-dim");
            } else {
                setPlantLevel(pln);
            }
        }
        break;

    // ── Recorte / Clipping ──
    case "clip": case "recorte": case "section": case "corte":
        {
            var clipAxis = args[0];
            var clipVal = parseFloat(args[1]);
            var clipFlip = (args[2] === "flip" || args[2] === "invertir");
            // Si primer arg es numero, usar eje auto
            if(!isNaN(parseFloat(args[0])) && isNaN(clipVal)){
                clipVal = parseFloat(args[0]);
                clipAxis = getClipAxisForCurrentView();
                clipFlip = (args[1] === "flip" || args[1] === "invertir");
            }
            if(!clipAxis || (clipAxis !== "x" && clipAxis !== "y" && clipAxis !== "z")){
                clipAxis = getClipAxisForCurrentView();
            }
            if(isNaN(clipVal)){
                // Sin valor: usar centro del modelo en ese eje
                var cb = _clipBounds();
                if(cb){
                    clipVal = cb.center[clipAxis];
                } else { clipVal = 0; }
            }
            enableClipping(clipAxis, clipVal, clipFlip);
            log("Recorte " + clipAxis.toUpperCase() + " = " + clipVal.toFixed(3) + (clipFlip?" (invertido)":""), "c-ok");
        }
        break;
    case "clipoff": case "sinrecorte": case "noclip": case "sincorte":
        disableClipping();
        log("Recorte desactivado", "c-ok"); break;
    case "clipflip": case "invertirrecorte": case "flipclip":
        flipClipping();
        if(S.clippingEnabled) log("Recorte invertido: " + S.clippingAxis.toUpperCase() + " = " + S.clippingValue.toFixed(3), "c-ok");
        break;
    case "clipval": case "valorrecorte":
        {
            var cv = parseFloat(args[0]);
            if(isNaN(cv)){ log("Uso: clipval <numero>","c-warn"); break; }
            setClipValue(cv);
            log("Recorte movido a " + cv.toFixed(3), "c-ok");
        }
        break;

    case "wireframe": case "wire":
        S.wireframeOn = !S.wireframeOn;
        toggleWireframe(S.wireframeOn);
        document.getElementById("chkWire").checked = S.wireframeOn;
        log("Wireframe: "+(S.wireframeOn?"ON":"OFF"),"c-ok"); break;

    case "showall": case "mostrartodo":
        for(var ta in S.ifcMeshes) setTypeVisible(ta, true);
        restoreAllMeshVisibility();
        updateObjTree(); log("Todos visibles","c-ok"); break;

    case "hideall": case "ocultartodo":
        for(var tb in S.ifcMeshes) setTypeVisible(tb, false);
        updateObjTree(); log("Todos ocultos","c-ok"); break;

    case "hidesel": case "ocultarsel":
        hideSelectedMesh(); break;

    case "transpsel": case "transparentesel":
        var opVal = args[1] ? parseFloat(args[1]) : 0.12;
        transparentSelectedMesh(opVal); break;

    case "aislar": case "isolate": case "isolatesel":
        if(args.length > 0 && args[0].startsWith("#")){
            // Aislar por IDs: aislar #123 #456 #789 (restore desde savehtml)
            _isolateByIds(args);
        } else {
            // Aislar selección actual — trackCommand con IDs se hace dentro
            isolateSelectedMeshes();
        }
        break;

    case "desaislar": case "unisolate": case "unisolatesel":
        unisolateMeshes(); break;

    case "rampescalera": case "stairramp": case "rampstair":
        var rampThick = 0.15;
        var useSel = false;
        var rampIds = [];
        args.forEach(function(a){
            if(a === "sel" || a === "seleccion") useSel = true;
            else if(a.charAt(0) === "#"){ var id = parseInt(a.substring(1)); if(!isNaN(id)) rampIds.push(id); }
            else { var n = parseFloat(a); if(!isNaN(n)) rampThick = n; }
        });
        if(rampIds.length > 0){
            // Buscar meshes por expressID
            var rampMeshes = [];
            S.modelGroup.traverse(function(o){
                if(o.isMesh && rampIds.indexOf(o.userData.expressID) >= 0) rampMeshes.push(o);
            });
            if(rampMeshes.length > 0) createStairRamp(rampThick, rampMeshes);
            else log("No se encontraron meshes con IDs: " + rampIds.join(", "), "c-err");
        } else if(useSel) createStairRampFromSelection(rampThick);
        else createStairRamp(rampThick);
        break;

    case "quitaracabado": case "removefinish": case "removeending":
        var finIds = [];
        args.forEach(function(a){
            if(a.charAt(0) === "#"){ var id = parseInt(a.substring(1)); if(!isNaN(id)) finIds.push(id); }
        });
        if(finIds.length > 0){
            var finMeshes = [];
            S.modelGroup.traverse(function(o){
                if(o.isMesh && finIds.indexOf(o.userData.expressID) >= 0) finMeshes.push(o);
            });
            if(finMeshes.length > 0) removeStairFinish(finMeshes);
            else log("No se encontraron meshes con IDs: " + finIds.join(", "), "c-err");
        } else log("Uso: quitaracabado #ID", "c-err");
        break;

    case "extraercara": case "extractface": case "splitface":
        var efIds = [];
        args.forEach(function(a){
            if(a.charAt(0) === "#"){ var id = parseInt(a.substring(1)); if(!isNaN(id)) efIds.push(id); }
        });
        if(efIds.length > 0){
            var efMeshes = [];
            S.modelGroup.traverse(function(o){
                if(o.isMesh && efIds.indexOf(o.userData.expressID) >= 0) efMeshes.push(o);
            });
            if(efMeshes.length > 0) extractStairUnderside(efMeshes);
            else log("No se encontraron meshes con IDs: " + efIds.join(", "), "c-err");
        } else log("Uso: extraercara #ID", "c-err");
        break;

    case "rampainferior": case "rampunderside": case "undersideramp":
        var riIds = [];
        args.forEach(function(a){
            if(a.charAt(0) === "#"){ var id = parseInt(a.substring(1)); if(!isNaN(id)) riIds.push(id); }
        });
        if(riIds.length > 0){
            var riMeshes = [];
            S.modelGroup.traverse(function(o){
                if(o.isMesh && riIds.indexOf(o.userData.expressID) >= 0) riMeshes.push(o);
            });
            if(riMeshes.length > 0) stairUndersideToRamp(riMeshes);
            else log("No se encontraron meshes con IDs: " + riIds.join(", "), "c-err");
        } else log("Uso: rampainferior #ID", "c-err");
        break;

    case "corte2d": case "section2d": case "corte":
        sectionCut2D(args); break;

    case "slinea": case "sline": case "sdim": case "scota":
    case "smedir": case "smeasure": case "sborrar": case "sclear":
    case "snodos": case "snodes": case "srampa": case "sramp":
    case "sundo": case "sdeshacer":
    case "saplicar": case "sapply":
        sectionCAD([cmd].concat(args)); break;

    case "restaurar": case "restore-vis":
        restoreAllMeshVisibility(); break;

    case "report": case "reporte":
        if(!S.ifcModel){ log("No hay archivo.","c-err"); return; }
        var html = generateReport();
        document.getElementById("reportPanel").style.display = "block";
        document.getElementById("reportFrame").srcdoc = html;
        log("Reporte generado","c-ok"); break;

    case "export": case "exportar":
        if(!S.ifcModel){ log("No hay archivo.","c-err"); return; }
        var rhtml = generateReport();
        var blob = new Blob([rhtml],{type:"text/html"});
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = S.ifcModel.fileName.replace(".ifc","")+"_reporte.html";
        a.click(); URL.revokeObjectURL(a.href);
        log("Reporte descargado: "+a.download,"c-ok"); break;

    case "json":
        if(!S.ifcModel){ log("No hay archivo.","c-err"); return; }
        var data = {
            meta:S.ifcModel.meta, fileName:S.ifcModel.fileName,
            levels:getLevels(), columns:getElementsBySection("IFCCOLUMN"),
            beams:getElementsBySection("IFCBEAM"), slabs:getElementsBySection("IFCSLAB"),
            rebar:getRebar(), grids:getGrids(), profiles:getProfiles(),
            summary:getStructuralSummary()
        };
        var json = JSON.stringify(data,null,2);
        navigator.clipboard.writeText(json).then(function(){
            log("JSON copiado al portapapeles ("+json.length+" chars)","c-ok");
        });
        break;

    case "extract": case "extraer": case "geometry": case "geometria":
        if(!S.ifcModel){ log("No hay archivo.","c-err"); return; }
        var extractFmt = (args[0]||"json").toLowerCase();
        var extractFilter = args[1] ? args[1].toUpperCase() : null;
        extractGeometry(extractFmt, extractFilter);
        break;

    case "savehtml": case "guardarhtml":
        saveHtmlWithState();
        break;

    case "history": case "historial":
        if(S.stateHistory.length===0){ log("No hay historial de comandos.","c-dim"); return; }
        log("═══ HISTORIAL DE COMANDOS ═══","c-head");
        S.stateHistory.forEach(function(c,i){ log("  "+(i+1)+". "+c); });
        log("Total: "+S.stateHistory.length+" comandos","c-num");
        log("Tip: 'savehtml' guarda el HTML con este estado.","c-dim");
        break;

    case "clearhistory": case "limpiarhistorial":
        S.stateHistory = [];
        log("Historial limpiado.","c-ok");
        break;

    case "clearautosave": case "limpiarguardado":
        clearAutoSave();
        S.stateHistory = [];
        break;

    case "restore": case "restaurar":
        restoreState();
        break;

    case "cad2d": case "cad":
        if(args[0]==="off"||args[0]==="desactivar"){
            if(window.deactivateCAD) deactivateCAD();
            log("CAD 2D desactivado","c-ok");
        } else {
            if(window.activateCAD) activateCAD();
            log("CAD 2D activado — L=linea, R=rect, C=circulo, D=dim, Esc=cancelar","c-ok");
            log("  cad2d off  → desactivar overlay","c-dim");
        }
        break;

    case "sexport": case "cadexport":
        if(!window.CAD || !window._cadActive){
            log("CAD 2D no esta activo. Use 'cad2d' o 'corte2d' primero.","c-warn");
            break;
        }
        var fmt = (args[0]||"svg").toLowerCase();
        if(fmt === "svg"){
            var svg = CAD.genSVG();
            var blob = new Blob([svg], {type:"image/svg+xml"});
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url; a.download = "seccion_cad.svg"; a.click();
            URL.revokeObjectURL(url);
            log("SVG exportado: seccion_cad.svg ("+CAD.formas.length+" formas)","c-ok");
        } else if(fmt === "cpd" || fmt === "calcpad"){
            var cpd = CAD.genCpd();
            var blob2 = new Blob([cpd], {type:"text/plain"});
            var url2 = URL.createObjectURL(blob2);
            var a2 = document.createElement("a");
            a2.href = url2; a2.download = "seccion_cad.cpd"; a2.click();
            URL.revokeObjectURL(url2);
            log("Calcpad exportado: seccion_cad.cpd","c-ok");
        } else {
            log("Uso: sexport svg | sexport cpd","c-warn");
        }
        break;

    default:
        var aliasTypes2 = resolveAlias(cmd);
        if(aliasTypes2.length > 0 && args.length === 0){
            aliasTypes2.forEach(function(t3){
                var ec2 = S.ifcModel ? (S.ifcModel.typeIndex[t3]||[]).length : 0;
                var mc3 = S.ifcMeshes[t3] ? S.ifcMeshes[t3].length : 0;
                var vis = S.ifcVisibility[t3]!==false ? "visible" : "oculto";
                log(t3+": "+ec2+" entidades, "+mc3+" meshes ("+vis+")", "c-num");
            });
        } else if(window._cadActive && window.cad && window.cad.exec){
            // ═══ REENVIAR AL CAD 2D si está activo ═══
            window.cad.exec(raw);
        } else {
            log("Comando desconocido: "+cmd+". Escriba 'help'.","c-err");
        }
    }
}
