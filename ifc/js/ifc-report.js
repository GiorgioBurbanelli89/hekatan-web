// =====================================================================
// Report — generateReport (HTML structural report)
// =====================================================================
"use strict";
var S = window._S;

function generateReport(){
    var m = S.ifcModel.meta;
    var levs=getLevels(), cols=getElementsBySection("IFCCOLUMN"), beams=getElementsBySection("IFCBEAM");
    var slabs=getElementsBySection("IFCSLAB"), rb=getRebar(), gr=getGrids(), pr=getProfiles();
    var ss=getStructuralSummary();

    var h = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
    h += '<title>Reporte IFC - '+S.ifcModel.fileName+'</title>';
    h += '<style>';
    h += 'body{font-family:Segoe UI,Arial,sans-serif;max-width:900px;margin:20px auto;padding:0 20px;color:#333;line-height:1.6}';
    h += 'h1{color:#0e639c;border-bottom:3px solid #0e639c;padding-bottom:8px}';
    h += 'h2{color:#333;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}';
    h += 'table{border-collapse:collapse;width:100%;margin:12px 0}';
    h += 'th{background:#0e639c;color:#fff;text-align:left;padding:6px 12px}';
    h += 'td{padding:6px 12px;border-bottom:1px solid #eee}';
    h += 'tr:nth-child(even){background:#f5f7fa}';
    h += '.badge{display:inline-block;background:#e8f4fd;color:#0e639c;padding:2px 8px;border-radius:10px;font-size:12px}';
    h += '.num{text-align:right;font-family:Consolas,monospace;color:#0e639c;font-weight:bold}';
    h += '.mg{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin:12px 0}';
    h += '.mg .k{color:#666;font-weight:bold}.mg .v{color:#333}';
    h += 'footer{margin-top:40px;padding-top:12px;border-top:1px solid #ddd;color:#888;font-size:12px}';
    h += '</style></head><body>';

    h += '<h1>Reporte Estructural IFC</h1>';
    h += '<div class="mg">';
    h += '<span class="k">Archivo:</span><span class="v">'+S.ifcModel.fileName+'</span>';
    h += '<span class="k">Tamaño:</span><span class="v">'+(S.ifcModel.fileSize/1024/1024).toFixed(2)+' MB</span>';
    h += '<span class="k">Schema:</span><span class="v">'+(m.schema||"-")+'</span>';
    h += '<span class="k">Aplicación:</span><span class="v">'+(m.app||"-")+'</span>';
    h += '<span class="k">Proyecto:</span><span class="v">'+(m.project||"-")+'</span>';
    h += '<span class="k">Autor:</span><span class="v">'+(m.author||"-")+'</span>';
    h += '<span class="k">Fecha:</span><span class="v">'+(m.timestamp||"-")+'</span>';
    h += '<span class="k">Entidades:</span><span class="v">'+Object.keys(S.ifcModel.entities).length+'</span>';
    if(S.ifcModel.totalVerts) h += '<span class="k">Vértices:</span><span class="v">'+S.ifcModel.totalVerts.toLocaleString()+'</span>';
    h += '</div>';

    h += '<h2>Resumen Estructural</h2>';
    h += '<table><tr><th>Elemento</th><th>Tipo IFC</th><th style="text-align:right">Cantidad</th></tr>';
    for(var t in ss) h += '<tr><td>'+(S.SNAMES[t]||t)+'</td><td><span class="badge">'+t+'</span></td><td class="num">'+ss[t]+'</td></tr>';
    h += '</table>';

    h += '<h2>Niveles</h2><table><tr><th>#</th><th>Nombre</th><th style="text-align:right">Elevación (m)</th></tr>';
    levs.forEach(function(l,i){ h+='<tr><td>'+(i+1)+'</td><td>'+l.name+'</td><td class="num">'+l.elevation.toFixed(3)+'</td></tr>'; });
    h += '</table>';

    h += '<h2>Columnas</h2><table><tr><th>Sección</th><th style="text-align:right">Cant</th></tr>';
    for(var s in cols) h+='<tr><td>'+s+'</td><td class="num">'+cols[s].length+'</td></tr>';
    h += '</table>';

    h += '<h2>Vigas</h2><table><tr><th>Sección</th><th style="text-align:right">Cant</th></tr>';
    var bTotal=0;
    for(var s2 in beams){ h+='<tr><td>'+s2+'</td><td class="num">'+beams[s2].length+'</td></tr>'; bTotal+=beams[s2].length; }
    h += '<tr style="font-weight:bold"><td>TOTAL</td><td class="num">'+bTotal+'</td></tr></table>';

    h += '<h2>Losas</h2><table><tr><th>Tipo</th><th style="text-align:right">Cant</th></tr>';
    for(var s3 in slabs) h+='<tr><td>'+s3+'</td><td class="num">'+slabs[s3].length+'</td></tr>';
    h += '</table>';

    h += '<h2>Refuerzo ('+rb.total+' barras)</h2>';
    h += '<table><tr><th>Diámetro</th><th style="text-align:right">Cant</th></tr>';
    for(var d in rb.byDia) h+='<tr><td>φ'+d+'</td><td class="num">'+rb.byDia[d]+'</td></tr>';
    h += '</table>';

    if(gr.length>0){
        h += '<h2>Grillas</h2><table><tr><th>Nombre</th><th>Ejes U</th><th>Ejes V</th></tr>';
        gr.forEach(function(g){ h+='<tr><td>'+g.name+'</td><td class="num">'+g.axesU+'</td><td class="num">'+g.axesV+'</td></tr>'; });
        h += '</table>';
    }

    var prKeys = Object.keys(pr);
    if(prKeys.length>0){
        h += '<h2>Perfiles</h2><table><tr><th>Nombre</th><th>W (mm)</th><th>H (mm)</th><th>Usos</th></tr>';
        prKeys.sort().forEach(function(n){ var p=pr[n]; h+='<tr><td>'+n+'</td><td class="num">'+p.w.toFixed(0)+'</td><td class="num">'+p.h.toFixed(0)+'</td><td class="num">'+p.count+'</td></tr>'; });
        h += '</table>';
    }

    h += '<footer>Generado por Calcpad IFC CLI v3.0 — '+new Date().toLocaleString()+'</footer></body></html>';
    return h;
}
