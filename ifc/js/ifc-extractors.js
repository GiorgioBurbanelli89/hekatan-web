// =====================================================================
// Structural Extractors — getLevels, getElements, getRebar, etc.
// =====================================================================
"use strict";
var S = window._S;

function getLevels(){
    if(!S.ifcModel) return [];
    var ids = S.ifcModel.typeIndex["IFCBUILDINGSTOREY"] || [];
    return ids.map(function(id){
        var e = S.ifcModel.entities[id];
        var f = splitArgs(e.args);
        return { id:id, name:decIfc((f[2]||"").replace(/'/g,"")), elevation:parseFloat(f[9])||0 };
    }).sort(function(a,b){ return a.elevation-b.elevation; });
}

function getElements(type){
    if(!S.ifcModel) return [];
    var ids = S.ifcModel.typeIndex[type] || [];
    return ids.map(function(id){
        var e = S.ifcModel.entities[id];
        var f = splitArgs(e.args);
        return { id:id, name:decIfc((f[2]||"").replace(/'/g,"")), typeName:decIfc((f[4]||"").replace(/'/g,"")) };
    });
}

function getElementsBySection(type){
    var elems = getElements(type);
    var sec = {};
    elems.forEach(function(e){
        var parts = e.name.split(":");
        var s = parts.length >= 2 ? parts[1].trim() : e.name;
        if(!sec[s]) sec[s] = [];
        sec[s].push(e);
    });
    return sec;
}

function getRebar(){
    if(!S.ifcModel) return {total:0,byDia:{},byShape:{}};
    var ids = S.ifcModel.typeIndex["IFCREINFORCINGBAR"] || [];
    var byDia={}, byShape={};
    ids.forEach(function(id){
        var e = S.ifcModel.entities[id];
        var name = decIfc((splitArgs(e.args)[2]||"").replace(/'/g,""));
        var dM = name.match(/(\d+)\s*mm/); var dia = dM ? dM[1]+"mm" : "?";
        byDia[dia] = (byDia[dia]||0)+1;
        var sM = name.match(/Forma\s+([^:]+)/); var shape = sM ? sM[1].trim() : "Otro";
        byShape[shape] = (byShape[shape]||0)+1;
    });
    return {total:ids.length, byDia:byDia, byShape:byShape};
}

function getGrids(){
    if(!S.ifcModel) return [];
    var ids = S.ifcModel.typeIndex["IFCGRID"] || [];
    return ids.map(function(id){
        var e = S.ifcModel.entities[id];
        var f = splitArgs(e.args);
        return { id:id, name:decIfc((f[2]||"").replace(/'/g,"")),
            axesU:(f[7]||"").split("#").length-1, axesV:(f[8]||"").split("#").length-1 };
    });
}

function getProfiles(){
    if(!S.ifcModel) return {};
    var ids = S.ifcModel.typeIndex["IFCRECTANGLEPROFILEDEF"] || [];
    var pr = {};
    ids.forEach(function(id){
        var e = S.ifcModel.entities[id];
        var f = splitArgs(e.args);
        var name = decIfc((f[1]||"").replace(/'/g,""));
        var w = (parseFloat(f[2])||0)*1000, h2 = (parseFloat(f[3])||0)*1000;
        if(!pr[name]) pr[name] = {count:0,w:w,h:h2};
        pr[name].count++;
    });
    return pr;
}

function getStructuralSummary(){
    var s = {};
    ["IFCCOLUMN","IFCBEAM","IFCSLAB","IFCWALL","IFCWALLSTANDARDCASE",
     "IFCFOOTING","IFCMEMBER","IFCPLATE","IFCROOF","IFCSTAIR",
     "IFCDOOR","IFCWINDOW","IFCRAILING","IFCREINFORCINGBAR","IFCGRID"].forEach(function(t){
        var c = (S.ifcModel.typeIndex[t]||[]).length;
        if(c>0) s[t]=c;
    });
    return s;
}
