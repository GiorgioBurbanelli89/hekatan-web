// ===================== PANELS.JS - Layer 5 =====================
// Object tree, selection, properties panel
"use strict";

import * as S from './state.js';
import { set, callbacks } from './state.js';
import { objTree, objCount, panelProps } from './dom.js';
import { D, Ang, toU, F } from './math.js';

var typeIcons = {
    linea:'<svg viewBox="0 0 14 14"><line x1="2" y1="12" x2="12" y2="2" stroke="#569cd6" stroke-width="1.5"/></svg>',
    rectangulo:'<svg viewBox="0 0 14 14"><rect x="2" y="3" width="10" height="8" fill="none" stroke="#569cd6" stroke-width="1.3"/></svg>',
    circulo:'<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#569cd6" stroke-width="1.3"/></svg>',
    elipse:'<svg viewBox="0 0 14 14"><ellipse cx="7" cy="7" rx="6" ry="4" fill="none" stroke="#569cd6" stroke-width="1.3"/></svg>',
    polilinea:'<svg viewBox="0 0 14 14"><path d="M2 12L6 4L12 8" fill="none" stroke="#569cd6" stroke-width="1.3"/></svg>',
    arco:'<svg viewBox="0 0 14 14"><path d="M2 12Q7 2 12 12" fill="none" stroke="#569cd6" stroke-width="1.3"/></svg>',
    mano:'<svg viewBox="0 0 14 14"><path d="M2 10C4 6 8 4 12 6" fill="none" stroke="#569cd6" stroke-width="1.3"/></svg>',
    grupo:'<svg viewBox="0 0 14 14"><rect x="1" y="1" width="6" height="6" fill="none" stroke="#569cd6" stroke-width="1"/><rect x="7" y="7" width="6" height="6" fill="none" stroke="#569cd6" stroke-width="1"/></svg>',
    cota:'<svg viewBox="0 0 14 14"><line x1="2" y1="7" x2="12" y2="7" stroke="#ffdd00" stroke-width="1.2"/><line x1="2" y1="4" x2="2" y2="10" stroke="#ffdd00" stroke-width="1"/><line x1="12" y1="4" x2="12" y2="10" stroke="#ffdd00" stroke-width="1"/><polygon points="2,7 5,5.5 5,8.5" fill="#ffdd00"/><polygon points="12,7 9,5.5 9,8.5" fill="#ffdd00"/></svg>'
};

var typeNames = {linea:"Linea",rectangulo:"Rect",circulo:"Circulo",elipse:"Elipse",polilinea:"PLin",arco:"Arco",arco_circular:"CArc",mano:"Trazo",grupo:"Grupo",cota:"Cota"};

export { typeNames };

function shpDim(f){
    if(f.tipo==="linea") return F(toU(D(f.x1,f.y1,f.x2,f.y2)))+S.unidad;
    if(f.tipo==="rectangulo") return F(toU(Math.abs(f.w)))+"x"+F(toU(Math.abs(f.h)));
    if(f.tipo==="circulo") return "r="+F(toU(f.r));
    if(f.tipo==="elipse") return F(toU(f.rx))+"x"+F(toU(f.ry));
    if(f.tipo==="polilinea") return f.pts.length+" pts";
    if(f.tipo==="grupo") return f.children.length+" obj";
    if(f.tipo==="cota") return F(toU(D(f.x1,f.y1,f.x2,f.y2)))+S.unidad;
    return "";
}

export function updTree(){
    objCount.textContent = S.formas.length;
    var groups = {};
    for(var i=0; i<S.formas.length; i++){
        var t = S.formas[i].tipo;
        if(!groups[t]) groups[t] = [];
        groups[t].push(i);
    }

    var h = "";
    var order = ["grupo","linea","rectangulo","circulo","elipse","polilinea","arco","arco_circular","mano","cota"];
    for(var gi=0; gi<order.length; gi++){
        var gk = order[gi];
        if(!groups[gk]) continue;
        h += '<div class="tree-group">' + (typeNames[gk]||gk).toUpperCase() + 'S (' + groups[gk].length + ')</div>';
        for(var j=0; j<groups[gk].length; j++){
            var idx = groups[gk][j], f = S.formas[idx];
            var cnt = groups[gk].slice(0,j+1).length;
            var isMultiSel = S.selectedShapes && S.selectedShapes.indexOf(idx) >= 0;
            h += '<div class="tree-item' + ((idx===S.formaSel||isMultiSel)?' sel':'') + '" data-i="' + idx + '">';
            h += '<span class="tree-icon">' + typeIcons[f.tipo] + '</span>';
            h += '<span class="tree-name">' + (typeNames[f.tipo]||f.tipo) + ' ' + cnt + '</span>';
            h += '<span class="tree-dim">' + shpDim(f) + '</span>';
            h += '<span class="tree-vis' + (f.hidden?' hidden':'') + '" data-vis="' + idx + '" title="Visibilidad">' + (f.hidden?'&#9673;':'&#9679;') + '</span>';
            h += '</div>';
        }
    }
    objTree.innerHTML = h;

    // Bind click events
    var items = objTree.querySelectorAll(".tree-item");
    for(var k=0; k<items.length; k++){
        (function(el){
            el.addEventListener("click", function(e){
                if(e.target.hasAttribute("data-vis")) return;
                selectShape(parseInt(el.getAttribute("data-i")));
            });
        })(items[k]);
    }
    var visBtns = objTree.querySelectorAll(".tree-vis");
    for(var v=0; v<visBtns.length; v++){
        (function(el){
            el.addEventListener("click", function(e){
                e.stopPropagation();
                var idx2 = parseInt(el.getAttribute("data-vis"));
                S.formas[idx2].hidden = !S.formas[idx2].hidden;
                callbacks.redraw?.();
                updTree();
            });
        })(visBtns[v]);
    }
}

export function selectShape(idx){
    set("formaSel", idx);
    set("selectedShapes", []);  // clear multi-selection on single select
    callbacks.redraw?.();
    updTree();
    showProps(idx);
}

export function showProps(idx){
    // Multi-selection info
    if(S.selectedShapes && S.selectedShapes.length > 1){
        var counts = {};
        for(var si=0; si<S.selectedShapes.length; si++){
            var st = S.formas[S.selectedShapes[si]].tipo;
            counts[st] = (counts[st]||0) + 1;
        }
        var info = '<p style="color:#4ec9b0;font-size:11px;font-weight:bold;">' + S.selectedShapes.length + ' objetos seleccionados</p>';
        info += '<table class="ptbl">';
        for(var ct in counts){
            info += '<tr><td class="pl">' + (typeNames[ct]||ct) + '</td><td class="pv">' + counts[ct] + '</td></tr>';
        }
        info += '</table>';
        panelProps.innerHTML = info;
        return;
    }
    if(idx<0 || idx>=S.formas.length){
        panelProps.innerHTML = '<p style="color:#555;font-style:italic;font-size:11px;">Seleccione un objeto</p>';
        return;
    }
    var f = S.formas[idx], h = '<table class="ptbl">';
    function R(l,v){ h += '<tr><td class="pl">'+l+'</td><td class="pv">'+v+'</td></tr>'; }
    var fz = f.z||0;
    function P3(x,y,z){ return "("+F(toU(x))+", "+F(toU(y))+", "+F(toU(z||fz))+")"; }
    R("Tipo", (typeNames[f.tipo]||f.tipo)+" "+(idx+1));
    R("Z", F(toU(fz))+" "+S.unidad);
    if(f.tipo==="linea"){
        R("Longitud", F(toU(D(f.x1,f.y1,f.x2,f.y2)))+" "+S.unidad);
        R("Angulo", F(Ang(f.x1,f.y1,f.x2,f.y2))+"\u00b0");
        R("P1", P3(f.x1,f.y1,f.z1||fz));
        R("P2", P3(f.x2,f.y2,f.z2||fz));
    } else if(f.tipo==="rectangulo"){
        var w=toU(Math.abs(f.w)), ht=toU(Math.abs(f.h));
        R("Ancho (b)", F(w)+" "+S.unidad);
        R("Alto (h)", F(ht)+" "+S.unidad);
        R("Area", F(+(w*ht).toFixed(2))+" "+S.unidad+"\u00b2");
        R("Perimetro", F(+(2*(w+ht)).toFixed(2))+" "+S.unidad);
        R("Origen", P3(f.x,f.y,fz));
    } else if(f.tipo==="circulo"){
        var r=toU(f.r);
        R("Radio (r)", F(r)+" "+S.unidad);
        R("Diametro", F(+(2*r).toFixed(2))+" "+S.unidad);
        R("Area", F(+(Math.PI*r*r).toFixed(2))+" "+S.unidad+"\u00b2");
        R("Circunf.", F(+(2*Math.PI*r).toFixed(2))+" "+S.unidad);
        R("Centro", P3(f.cx,f.cy,fz));
    } else if(f.tipo==="elipse"){
        var rx=toU(f.rx), ry=toU(f.ry);
        R("Rx", F(rx)+" "+S.unidad);
        R("Ry", F(ry)+" "+S.unidad);
        R("Area", F(+(Math.PI*rx*ry).toFixed(2))+" "+S.unidad+"\u00b2");
        R("Centro", P3(f.cx,f.cy,fz));
    } else if(f.tipo==="polilinea"){
        var lt=0;
        for(var i=1; i<f.pts.length; i++) lt += D(f.pts[i-1].x,f.pts[i-1].y,f.pts[i].x,f.pts[i].y);
        R("Longitud", F(toU(lt))+" "+S.unidad);
        R("Segmentos", f.pts.length-1);
        R("P1", P3(f.pts[0].x,f.pts[0].y,f.pts[0].z||fz));
        R("P"+f.pts.length, P3(f.pts[f.pts.length-1].x,f.pts[f.pts.length-1].y,f.pts[f.pts.length-1].z||fz));
    } else if(f.tipo==="cota"){
        R("Distancia", F(toU(D(f.x1,f.y1,f.x2,f.y2)))+" "+S.unidad);
        R("P1", P3(f.x1,f.y1,fz));
        R("P2", P3(f.x2,f.y2,fz));
        R("Offset", F(toU(f.offset||0))+" "+S.unidad);
        if(f.text) R("Texto", f.text);
    } else if(f.tipo==="grupo" && f.children){
        R("Objetos", f.children.length);
        var gcounts = {};
        for(var gi=0; gi<f.children.length; gi++){
            var gt = f.children[gi].tipo;
            gcounts[gt] = (gcounts[gt]||0) + 1;
        }
        for(var gk in gcounts) R(typeNames[gk]||gk, gcounts[gk]);
        R("", "");
        R("G = Agrupar", "Shift+G = Desagrupar");
    }
    h += '</table>';
    panelProps.innerHTML = h;
}
