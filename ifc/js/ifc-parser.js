// =====================================================================
// IFC Text Parser (ISO-10303-21) + Utility functions
// =====================================================================
"use strict";

function parseIfcText(text){
    var meta = { schema:"", project:"", author:"", org:"", desc:"", timestamp:"", app:"" };
    var entities = {};
    var typeIndex = {};

    var schemaM = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i);
    if(schemaM) meta.schema = schemaM[1];
    var nameM = text.match(/FILE_NAME\s*\(\s*'[^']*'\s*,\s*'([^']*)'/i);
    if(nameM) meta.timestamp = nameM[1];
    var appM = text.match(/'(Autodesk[^']*)'|'(ArchiCAD[^']*)'|'(Revit[^']*)'/i);
    if(appM) meta.app = appM[1]||appM[2]||appM[3];

    var entRe = /^#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)\s*\(([\s\S]*?)\)\s*;\s*$/gm;
    var m;
    while((m = entRe.exec(text)) !== null){
        var id = parseInt(m[1]);
        var type = m[2].toUpperCase();
        entities[id] = { id:id, type:type, args:m[3] };
        if(!typeIndex[type]) typeIndex[type] = [];
        typeIndex[type].push(id);
    }

    if(typeIndex["IFCPROJECT"]){
        var pe = entities[typeIndex["IFCPROJECT"][0]];
        if(pe){ var n = field(pe.args,2); if(n&&n!=="$") meta.project=n; }
    }
    if(typeIndex["IFCORGANIZATION"]){
        var oe = entities[typeIndex["IFCORGANIZATION"][0]];
        if(oe){ var n2 = field(oe.args,1); if(n2&&n2!=="$") meta.org=n2; }
    }
    if(typeIndex["IFCPERSON"]){
        var pe2 = entities[typeIndex["IFCPERSON"][0]];
        if(pe2){
            var fam=field(pe2.args,1), giv=field(pe2.args,2);
            meta.author = "";
            if(giv&&giv!=="$") meta.author=giv;
            if(fam&&fam!=="$") meta.author=(meta.author?meta.author+" ":"")+fam;
        }
    }

    return { meta:meta, entities:entities, typeIndex:typeIndex };
}

function field(args, idx){
    var fields = splitArgs(args);
    if(idx<fields.length){
        var v=fields[idx].trim();
        if(v.startsWith("'")&&v.endsWith("'")) return decIfc(v.slice(1,-1));
        return v;
    }
    return null;
}

function splitArgs(args){
    var result=[],depth=0,inQ=false,cur="";
    for(var i=0;i<args.length;i++){
        var c=args[i];
        if(c==="'"&&(i===0||args[i-1]!=="\\")){ inQ=!inQ; cur+=c; }
        else if(!inQ&&c==="("){ depth++; cur+=c; }
        else if(!inQ&&c===")"){ depth--; cur+=c; }
        else if(!inQ&&depth===0&&c===","){ result.push(cur.trim()); cur=""; }
        else { cur+=c; }
    }
    if(cur.length>0) result.push(cur.trim());
    return result;
}

function decIfc(s){
    return s.replace(/\\X\\([0-9A-Fa-f]{2})/g, function(_,h){ return String.fromCharCode(parseInt(h,16)); })
            .replace(/\\X2\\([0-9A-Fa-f]{4})\\X0\\/g, function(_,h){ return String.fromCharCode(parseInt(h,16)); });
}

// Robust entity parser for save/merge (handles multi-line + strings with semicolons)
function parseIfcEntities(ifcText){
    var dataStart = ifcText.indexOf("DATA;");
    var dataEnd = ifcText.lastIndexOf("ENDSEC;");
    if(dataStart < 0 || dataEnd < 0) return [];
    var section = ifcText.substring(dataStart + 5, dataEnd);
    var entities = [];
    var current = "";
    var inString = false;
    for(var ci = 0; ci < section.length; ci++){
        var ch = section[ci];
        if(ch === "'" && !inString){ inString = true; current += ch; continue; }
        if(ch === "'" && inString){ inString = false; current += ch; continue; }
        if(inString){ current += ch; continue; }
        if(ch === ";"){
            current += ";";
            var trimmed = current.trim();
            if(/^#\d+\s*=/.test(trimmed)){
                entities.push(trimmed);
            }
            current = "";
            continue;
        }
        if(ch === "\r") continue;
        if(ch === "\n"){ current += " "; continue; }
        current += ch;
    }
    return entities;
}
