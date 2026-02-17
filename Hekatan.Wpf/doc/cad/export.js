// ===================== EXPORT.JS - Layer 5 =====================
// Calcpad (.cpd) and SVG export generators
"use strict";

import * as S from './state.js';
import { D, Ang, toU, F } from './math.js';
import { canvas } from './dom.js';
import { w2s3 } from './projection.js';

export function genCpd(){
    var L = [
        "'Geometria exportada desde Calcpad CAD Editor",
        "'Unidades: "+S.unidad+" | Escala: "+S.escala+" px/"+S.unidad,
        "'================================================",
        ""
    ];
    var cnt = {linea:0,rectangulo:0,circulo:0,elipse:0,polilinea:0};
    for(var i=0; i<S.formas.length; i++){
        var f = S.formas[i];
        if(f.tipo==="mano"||f.tipo==="arco"||f.hidden) continue;
        cnt[f.tipo] = (cnt[f.tipo]||0)+1;
        var n = cnt[f.tipo], sf = S.formas.length>1 ? "_"+n : "";
        var fz = f.z||0;
        if(f.tipo==="linea"){
            L.push("'--- Linea "+n+" ---");
            L.push("L"+sf+" = "+F(toU(D(f.x1,f.y1,f.x2,f.y2)))+"'"+S.unidad+" |Longitud");
            L.push("ang"+sf+" = "+F(Math.abs(Ang(f.x1,f.y1,f.x2,f.y2)))+" |Angulo (grados)");
            L.push("x1"+sf+" = "+F(toU(f.x1))+"'"+S.unidad+" |X inicio");
            L.push("y1"+sf+" = "+F(toU(f.y1))+"'"+S.unidad+" |Y inicio");
            L.push("z1"+sf+" = "+F(toU(f.z1||fz))+"'"+S.unidad+" |Z inicio");
            L.push("x2"+sf+" = "+F(toU(f.x2))+"'"+S.unidad+" |X fin");
            L.push("y2"+sf+" = "+F(toU(f.y2))+"'"+S.unidad+" |Y fin");
            L.push("z2"+sf+" = "+F(toU(f.z2||fz))+"'"+S.unidad+" |Z fin");
            L.push("");
        } else if(f.tipo==="rectangulo"){
            var w=toU(Math.abs(f.w)), ht=toU(Math.abs(f.h));
            L.push("'--- Rectangulo "+n+" (Z="+F(toU(fz))+" "+S.unidad+") ---");
            L.push("b"+sf+" = "+F(w)+"'"+S.unidad+" |Ancho");
            L.push("h"+sf+" = "+F(ht)+"'"+S.unidad+" |Alto");
            L.push("A"+sf+" = b"+sf+"*h"+sf+" |Area");
            L.push("P"+sf+" = 2*(b"+sf+" + h"+sf+") |Perimetro");
            L.push("z"+sf+" = "+F(toU(fz))+"'"+S.unidad+" |Elevacion Z");
            L.push("");
        } else if(f.tipo==="circulo"){
            L.push("'--- Circulo "+n+" (Z="+F(toU(fz))+" "+S.unidad+") ---");
            L.push("r"+sf+" = "+F(toU(f.r))+"'"+S.unidad+" |Radio");
            L.push("d"+sf+" = 2*r"+sf+" |Diametro");
            L.push("A_c"+sf+" = \u03C0*r"+sf+"^2 |Area");
            L.push("z_c"+sf+" = "+F(toU(fz))+"'"+S.unidad+" |Elevacion Z");
            L.push("");
        } else if(f.tipo==="elipse"){
            L.push("'--- Elipse "+n+" (Z="+F(toU(fz))+" "+S.unidad+") ---");
            L.push("rx"+sf+" = "+F(toU(f.rx))+"'"+S.unidad+" |Semi-eje X");
            L.push("ry"+sf+" = "+F(toU(f.ry))+"'"+S.unidad+" |Semi-eje Y");
            L.push("A_e"+sf+" = \u03C0*rx"+sf+"*ry"+sf+" |Area");
            L.push("z_e"+sf+" = "+F(toU(fz))+"'"+S.unidad+" |Elevacion Z");
            L.push("");
        } else if(f.tipo==="polilinea"){
            var lt=0;
            for(var j=1; j<f.pts.length; j++) lt += D(f.pts[j-1].x,f.pts[j-1].y,f.pts[j].x,f.pts[j].y);
            L.push("'--- Polilinea "+n+" ---");
            L.push("L_p"+sf+" = "+F(toU(lt))+"'"+S.unidad+" |Longitud total");
            L.push("n_p"+sf+" = "+(f.pts.length-1)+" |Segmentos");
            L.push("");
        } else if(f.tipo==="cota"){
            var cdist = D(f.x1,f.y1,f.x2,f.y2);
            L.push("'--- Cota "+n+" ---");
            L.push("dim"+sf+" = "+F(toU(cdist))+"'"+S.unidad+" |Dimension");
            L.push("");
        }
    }
    return L.join("\n");
}

export function genSVG(){
    var w = canvas.width, h = canvas.height;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">\n';
    s += '  <rect width="100%" height="100%" fill="#1a1a2e"/>\n';
    for(var i=0; i<S.formas.length; i++){
        var f = S.formas[i]; if(f.hidden) continue;
        var c = f.color||"#569cd6";
        var fz = f.z||0;
        if(f.tipo==="linea"){
            var a=w2s3(f.x1,f.y1,f.z1||fz), b=w2s3(f.x2,f.y2,f.z2||fz);
            s += '  <line x1="'+F(a.x)+'" y1="'+F(a.y)+'" x2="'+F(b.x)+'" y2="'+F(b.y)+'" stroke="'+c+'" stroke-width="1.5"/>\n';
        } else if(f.tipo==="rectangulo"){
            var r1=w2s3(f.x,f.y,fz), r2=w2s3(f.x+f.w,f.y+f.h,fz);
            s += '  <rect x="'+F(r1.x)+'" y="'+F(r1.y)+'" width="'+F(r2.x-r1.x)+'" height="'+F(r2.y-r1.y)+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="circulo"){
            var cc=w2s3(f.cx,f.cy,fz);
            s += '  <circle cx="'+F(cc.x)+'" cy="'+F(cc.y)+'" r="'+F(f.r*S.cam.zoom)+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="elipse"){
            var ce=w2s3(f.cx,f.cy,fz);
            s += '  <ellipse cx="'+F(ce.x)+'" cy="'+F(ce.y)+'" rx="'+F(f.rx*S.cam.zoom)+'" ry="'+F(f.ry*S.cam.zoom)+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="polilinea"||f.tipo==="mano"){
            var p0=w2s3(f.pts[0].x,f.pts[0].y,f.pts[0].z||fz);
            var d="M"+F(p0.x)+","+F(p0.y);
            for(var j=1;j<f.pts.length;j++){var pj=w2s3(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);d+=" L"+F(pj.x)+","+F(pj.y);}
            s += '  <path d="'+d+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="arco"){
            var a1=w2s3(f.x1,f.y1,fz), ac=w2s3(f.cx,f.cy,fz), a2=w2s3(f.x2,f.y2,fz);
            var d2="M"+F(a1.x)+","+F(a1.y)+" Q"+F(ac.x)+","+F(ac.y)+" "+F(a2.x)+","+F(a2.y);
            s += '  <path d="'+d2+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="cota"){
            var ds1=w2s3(f.x1,f.y1,fz), ds2=w2s3(f.x2,f.y2,fz);
            var ddx=ds2.x-ds1.x, ddy=ds2.y-ds1.y, dlen=Math.sqrt(ddx*ddx+ddy*ddy);
            if(dlen>0){
                var dux=ddx/dlen, duy=ddy/dlen, dnx=-duy, dny=dux;
                var doff=(f.offset||10)*S.cam.zoom;
                var od1x=ds1.x+dnx*doff, od1y=ds1.y+dny*doff;
                var od2x=ds2.x+dnx*doff, od2y=ds2.y+dny*doff;
                // Extension lines
                s += '  <line x1="'+F(ds1.x+dnx*3)+'" y1="'+F(ds1.y+dny*3)+'" x2="'+F(ds1.x+dnx*(doff+6))+'" y2="'+F(ds1.y+dny*(doff+6))+'" stroke="'+c+'" stroke-width="0.8"/>\n';
                s += '  <line x1="'+F(ds2.x+dnx*3)+'" y1="'+F(ds2.y+dny*3)+'" x2="'+F(ds2.x+dnx*(doff+6))+'" y2="'+F(ds2.y+dny*(doff+6))+'" stroke="'+c+'" stroke-width="0.8"/>\n';
                // Dimension line
                s += '  <line x1="'+F(od1x)+'" y1="'+F(od1y)+'" x2="'+F(od2x)+'" y2="'+F(od2y)+'" stroke="'+c+'" stroke-width="1.2"/>\n';
                // Text
                var cdist=D(f.x1,f.y1,f.x2,f.y2);
                var lbl=f.text||(F(toU(cdist))+" "+S.unidad);
                var tmx=(od1x+od2x)/2, tmy=(od1y+od2y)/2;
                s += '  <text x="'+F(tmx)+'" y="'+F(tmy-4)+'" fill="'+c+'" font-size="11" font-family="Consolas,monospace" text-anchor="middle">'+lbl+'</text>\n';
            }
        }
    }
    s += '</svg>';
    return s;
}
