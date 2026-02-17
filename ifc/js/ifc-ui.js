// =====================================================================
// UI Panels — updateObjTree, showTypeProps, showEntityProps, log
// =====================================================================
"use strict";
var S = window._S;

function log(msg, cls){
    if(!S.cliOutput) return;
    var span = document.createElement("span");
    if(cls) span.className = cls;
    span.textContent = msg + "\n";
    S.cliOutput.appendChild(span);
    S.cliOutput.scrollTop = S.cliOutput.scrollHeight;
}

function updateObjTree(){
    if(!S.objTreeEl) return;
    if(!S.ifcModel){
        S.objTreeEl.innerHTML = '<p style="color:#555;padding:8px;font-size:10px;font-style:italic">Cargue un archivo IFC</p>';
        document.getElementById("objCount").textContent = "0";
        return;
    }

    var types = {};
    for(var t in S.ifcMeshes){
        types[t] = { meshCount: S.ifcMeshes[t].length, entCount: (S.ifcModel.typeIndex[t]||[]).length, hasMesh:true };
    }
    var STRUCT = ["IFCCOLUMN","IFCBEAM","IFCSLAB","IFCWALL","IFCWALLSTANDARDCASE","IFCFOOTING","IFCMEMBER",
        "IFCPLATE","IFCROOF","IFCSTAIR","IFCDOOR","IFCWINDOW","IFCRAILING","IFCREINFORCINGBAR",
        "IFCGRID","IFCBUILDINGSTOREY","IFCSITE","IFCBUILDING","IFCSPACE","IFCOPENINGELEMENT"];
    STRUCT.forEach(function(st){
        if(!types[st] && S.ifcModel.typeIndex[st] && S.ifcModel.typeIndex[st].length > 0){
            types[st] = { meshCount:0, entCount:S.ifcModel.typeIndex[st].length, hasMesh:false };
        }
    });

    var sorted = Object.keys(types).sort();
    var html = "";
    sorted.forEach(function(t){
        var info = types[t];
        var vis = S.ifcVisibility[t] !== false;
        var isSel = (t === S.selectedType);
        html += '<div class="tree-item'+(isSel?' sel':'')+(vis?'':' dim')+'" data-type="'+t+'">';
        html += '<span class="tree-icon" style="color:'+(vis?'#4ec9b0':'#555')+'">&#9632;</span>';
        html += '<span class="tree-name">'+t+'</span>';
        html += '<span class="tree-dim">'+(info.hasMesh ? info.meshCount : info.entCount)+'</span>';
        if(info.hasMesh){
            html += '<span class="tree-vis'+(vis?'':' hidden')+'" data-toggle="'+t+'" title="Visibilidad">'+(vis?'&#128065;':'&#128064;')+'</span>';
        }
        html += '</div>';
    });
    S.objTreeEl.innerHTML = html;
    document.getElementById("objCount").textContent = sorted.length;

    S.objTreeEl.querySelectorAll(".tree-item").forEach(function(el){
        el.addEventListener("click", function(e){
            if(e.target.hasAttribute("data-toggle")) return;
            var type = el.getAttribute("data-type");
            S.selectedType = type;
            updateObjTree();
            showTypeProps(type);
        });
    });
    S.objTreeEl.querySelectorAll("[data-toggle]").forEach(function(btn){
        btn.addEventListener("click", function(e){
            e.stopPropagation();
            var type = btn.getAttribute("data-toggle");
            setTypeVisible(type, !(S.ifcVisibility[type]!==false));
            updateObjTree();
        });
    });
}

function showTypeProps(type){
    if(!S.ifcModel) return;
    var html = '<table class="ptbl">';
    html += '<tr><td class="pl">Tipo:</td><td class="pv" style="color:#4ec9b0">'+type+'</td></tr>';
    var entCount = (S.ifcModel.typeIndex[type]||[]).length;
    var meshCount = S.ifcMeshes[type] ? S.ifcMeshes[type].length : 0;
    html += '<tr><td class="pl">Entidades:</td><td class="pv">'+entCount+'</td></tr>';
    if(meshCount) html += '<tr><td class="pl">Meshes:</td><td class="pv">'+meshCount+'</td></tr>';
    html += '<tr><td class="pl">Visible:</td><td class="pv">'+(S.ifcVisibility[type]!==false?'Sí':'No')+'</td></tr>';

    var ids = (S.ifcModel.typeIndex[type]||[]).slice(0,5);
    if(ids.length>0){
        html += '<tr><td colspan="2" class="pl" style="padding-top:4px">Primeros elementos:</td></tr>';
        ids.forEach(function(id){
            var e = S.ifcModel.entities[id];
            var name = decIfc((splitArgs(e.args)[2]||"").replace(/'/g,""));
            html += '<tr><td class="pl">#'+id+'</td><td class="pv" style="font-size:10px">'+name.substring(0,40)+'</td></tr>';
        });
    }
    html += '</table>';
    S.propsPanel.innerHTML = html;
}

function showEntityProps(expressID, type){
    if(!S.ifcModel) return;
    var e = S.ifcModel.entities[expressID];
    if(!e) return;
    var f = splitArgs(e.args);
    var name = decIfc((f[2]||"").replace(/'/g,""));

    var html = '<table class="ptbl">';
    html += '<tr><td class="pl">ID:</td><td class="pv">#'+expressID+'</td></tr>';
    html += '<tr><td class="pl">Tipo:</td><td class="pv" style="color:#4ec9b0">'+type+'</td></tr>';
    html += '<tr><td class="pl">Nombre:</td><td class="pv">'+name+'</td></tr>';
    html += '</table>';
    S.propsPanel.innerHTML = html;
    log("Seleccionado: #"+expressID+" "+type+" → "+name.substring(0,60), "c-str");
}

function updateProps(html){
    if(!S.propsPanel) return;
    S.propsPanel.innerHTML = html || '<p style="color:#555;font-style:italic;padding:4px 8px;font-size:10px">Clic en un tipo para ver propiedades</p>';
}

function updateStatus(){
    if(!S.statusBar) return;
    if(!S.ifcModel){ S.statusBar.textContent = "Listo"; return; }
    S.statusBar.textContent = S.ifcModel.fileName + " | " +
        Object.keys(S.ifcModel.entities).length + " ent | " +
        S.ifcModel.totalVerts.toLocaleString() + " verts";
}

function showLoading(msg){
    var el = document.getElementById("loadingOverlay");
    document.getElementById("loadingText").textContent = msg || "Cargando...";
    el.style.display = "flex";
}
function hideLoading(){ document.getElementById("loadingOverlay").style.display = "none"; }

function togglePanel(id){
    var el = document.getElementById(id);
    if(el) el.style.display = el.style.display==="none" ? "" : "none";
}
function closeReport(){ document.getElementById("reportPanel").style.display="none"; }
