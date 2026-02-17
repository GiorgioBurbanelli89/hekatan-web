// ===================== EXPORT.JS - Layer 5 =====================
// Calcpad (.cpd) and SVG export generators
"use strict";

var CAD = window.CAD;

CAD.genCpd = function(){
    var L = [
        "'Geometria exportada desde Calcpad CAD Editor",
        "'Unidades: "+CAD.unidad+" | Escala: "+CAD.escala+" px/"+CAD.unidad,
        "'================================================",
        ""
    ];
    var cnt = {linea:0,rectangulo:0,circulo:0,elipse:0,polilinea:0};
    for(var i=0; i<CAD.formas.length; i++){
        var f = CAD.formas[i];
        if(f.tipo==="mano"||f.tipo==="arco"||f.hidden) continue;
        cnt[f.tipo] = (cnt[f.tipo]||0)+1;
        var n = cnt[f.tipo], sf = CAD.formas.length>1 ? "_"+n : "";
        var fz = f.z||0;
        if(f.tipo==="linea"){
            L.push("'--- Linea "+n+" ---");
            L.push("L"+sf+" = "+CAD.F(CAD.toU(CAD.D(f.x1,f.y1,f.x2,f.y2)))+"'"+CAD.unidad+" |Longitud");
            L.push("ang"+sf+" = "+CAD.F(Math.abs(CAD.Ang(f.x1,f.y1,f.x2,f.y2)))+" |Angulo (grados)");
            L.push("x1"+sf+" = "+CAD.F(CAD.toU(f.x1))+"'"+CAD.unidad+" |X inicio");
            L.push("y1"+sf+" = "+CAD.F(CAD.toU(f.y1))+"'"+CAD.unidad+" |Y inicio");
            L.push("z1"+sf+" = "+CAD.F(CAD.toU(f.z1||fz))+"'"+CAD.unidad+" |Z inicio");
            L.push("x2"+sf+" = "+CAD.F(CAD.toU(f.x2))+"'"+CAD.unidad+" |X fin");
            L.push("y2"+sf+" = "+CAD.F(CAD.toU(f.y2))+"'"+CAD.unidad+" |Y fin");
            L.push("z2"+sf+" = "+CAD.F(CAD.toU(f.z2||fz))+"'"+CAD.unidad+" |Z fin");
            L.push("");
        } else if(f.tipo==="rectangulo"){
            var w=CAD.toU(Math.abs(f.w)), ht=CAD.toU(Math.abs(f.h));
            L.push("'--- Rectangulo "+n+" (Z="+CAD.F(CAD.toU(fz))+" "+CAD.unidad+") ---");
            L.push("b"+sf+" = "+CAD.F(w)+"'"+CAD.unidad+" |Ancho");
            L.push("h"+sf+" = "+CAD.F(ht)+"'"+CAD.unidad+" |Alto");
            L.push("A"+sf+" = b"+sf+"*h"+sf+" |Area");
            L.push("P"+sf+" = 2*(b"+sf+" + h"+sf+") |Perimetro");
            L.push("z"+sf+" = "+CAD.F(CAD.toU(fz))+"'"+CAD.unidad+" |Elevacion Z");
            L.push("");
        } else if(f.tipo==="circulo"){
            L.push("'--- Circulo "+n+" (Z="+CAD.F(CAD.toU(fz))+" "+CAD.unidad+") ---");
            L.push("r"+sf+" = "+CAD.F(CAD.toU(f.r))+"'"+CAD.unidad+" |Radio");
            L.push("d"+sf+" = 2*r"+sf+" |Diametro");
            L.push("A_c"+sf+" = \u03C0*r"+sf+"^2 |Area");
            L.push("z_c"+sf+" = "+CAD.F(CAD.toU(fz))+"'"+CAD.unidad+" |Elevacion Z");
            L.push("");
        } else if(f.tipo==="elipse"){
            L.push("'--- Elipse "+n+" (Z="+CAD.F(CAD.toU(fz))+" "+CAD.unidad+") ---");
            L.push("rx"+sf+" = "+CAD.F(CAD.toU(f.rx))+"'"+CAD.unidad+" |Semi-eje X");
            L.push("ry"+sf+" = "+CAD.F(CAD.toU(f.ry))+"'"+CAD.unidad+" |Semi-eje Y");
            L.push("A_e"+sf+" = \u03C0*rx"+sf+"*ry"+sf+" |Area");
            L.push("z_e"+sf+" = "+CAD.F(CAD.toU(fz))+"'"+CAD.unidad+" |Elevacion Z");
            L.push("");
        } else if(f.tipo==="polilinea"){
            var lt=0;
            for(var j=1; j<f.pts.length; j++) lt += CAD.D(f.pts[j-1].x,f.pts[j-1].y,f.pts[j].x,f.pts[j].y);
            L.push("'--- Polilinea "+n+" ---");
            L.push("L_p"+sf+" = "+CAD.F(CAD.toU(lt))+"'"+CAD.unidad+" |Longitud total");
            L.push("n_p"+sf+" = "+(f.pts.length-1)+" |Segmentos");
            L.push("");
        } else if(f.tipo==="cota"){
            var cdist = CAD.D(f.x1,f.y1,f.x2,f.y2);
            L.push("'--- Cota "+n+" ---");
            L.push("dim"+sf+" = "+CAD.F(CAD.toU(cdist))+"'"+CAD.unidad+" |Dimension");
            L.push("");
        }
    }
    return L.join("\n");
};

CAD.genSVG = function(){
    var w = CAD.canvas.width, h = CAD.canvas.height;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">\n';
    s += '  <rect width="100%" height="100%" fill="'+(CAD.bgColor||"#1a1a2e")+'"/>\n';
    for(var i=0; i<CAD.formas.length; i++){
        var f = CAD.formas[i]; if(f.hidden) continue;
        var c = f.color||"#569cd6";
        var fz = f.z||0;
        if(f.tipo==="linea"){
            var a=CAD.w2s3(f.x1,f.y1,f.z1||fz), b=CAD.w2s3(f.x2,f.y2,f.z2||fz);
            s += '  <line x1="'+CAD.F(a.x)+'" y1="'+CAD.F(a.y)+'" x2="'+CAD.F(b.x)+'" y2="'+CAD.F(b.y)+'" stroke="'+c+'" stroke-width="1.5"/>\n';
        } else if(f.tipo==="rectangulo"){
            var r1=CAD.w2s3(f.x,f.y,fz), r2=CAD.w2s3(f.x+f.w,f.y+f.h,fz);
            s += '  <rect x="'+CAD.F(r1.x)+'" y="'+CAD.F(r1.y)+'" width="'+CAD.F(r2.x-r1.x)+'" height="'+CAD.F(r2.y-r1.y)+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="circulo"){
            var cc=CAD.w2s3(f.cx,f.cy,fz);
            s += '  <circle cx="'+CAD.F(cc.x)+'" cy="'+CAD.F(cc.y)+'" r="'+CAD.F(f.r*CAD.cam.zoom)+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="elipse"){
            var ce=CAD.w2s3(f.cx,f.cy,fz);
            s += '  <ellipse cx="'+CAD.F(ce.x)+'" cy="'+CAD.F(ce.y)+'" rx="'+CAD.F(f.rx*CAD.cam.zoom)+'" ry="'+CAD.F(f.ry*CAD.cam.zoom)+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="polilinea"||f.tipo==="mano"){
            var p0=CAD.w2s3(f.pts[0].x,f.pts[0].y,f.pts[0].z||fz);
            var d="M"+CAD.F(p0.x)+","+CAD.F(p0.y);
            for(var j=1;j<f.pts.length;j++){var pj=CAD.w2s3(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);d+=" L"+CAD.F(pj.x)+","+CAD.F(pj.y);}
            s += '  <path d="'+d+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="arco"){
            var a1=CAD.w2s3(f.x1,f.y1,fz), ac=CAD.w2s3(f.cx,f.cy,fz), a2=CAD.w2s3(f.x2,f.y2,fz);
            var d2="M"+CAD.F(a1.x)+","+CAD.F(a1.y)+" Q"+CAD.F(ac.x)+","+CAD.F(ac.y)+" "+CAD.F(a2.x)+","+CAD.F(a2.y);
            s += '  <path d="'+d2+'" stroke="'+c+'" stroke-width="1.5" fill="none"/>\n';
        } else if(f.tipo==="cota"){
            var ds1=CAD.w2s3(f.x1,f.y1,fz), ds2=CAD.w2s3(f.x2,f.y2,fz);
            var ddx=ds2.x-ds1.x, ddy=ds2.y-ds1.y, dlen=Math.sqrt(ddx*ddx+ddy*ddy);
            if(dlen>0){
                var dux=ddx/dlen, duy=ddy/dlen, dnx=-duy, dny=dux;
                var doff=(f.offset||10)*CAD.cam.zoom;
                var od1x=ds1.x+dnx*doff, od1y=ds1.y+dny*doff;
                var od2x=ds2.x+dnx*doff, od2y=ds2.y+dny*doff;
                // Extension lines
                s += '  <line x1="'+CAD.F(ds1.x+dnx*3)+'" y1="'+CAD.F(ds1.y+dny*3)+'" x2="'+CAD.F(ds1.x+dnx*(doff+6))+'" y2="'+CAD.F(ds1.y+dny*(doff+6))+'" stroke="'+c+'" stroke-width="0.8"/>\n';
                s += '  <line x1="'+CAD.F(ds2.x+dnx*3)+'" y1="'+CAD.F(ds2.y+dny*3)+'" x2="'+CAD.F(ds2.x+dnx*(doff+6))+'" y2="'+CAD.F(ds2.y+dny*(doff+6))+'" stroke="'+c+'" stroke-width="0.8"/>\n';
                // Dimension line
                s += '  <line x1="'+CAD.F(od1x)+'" y1="'+CAD.F(od1y)+'" x2="'+CAD.F(od2x)+'" y2="'+CAD.F(od2y)+'" stroke="'+c+'" stroke-width="1.2"/>\n';
                // Text
                var cdist=CAD.D(f.x1,f.y1,f.x2,f.y2);
                var lbl=f.text||(CAD.F(CAD.toU(cdist))+" "+CAD.unidad);
                var tmx=(od1x+od2x)/2, tmy=(od1y+od2y)/2;
                s += '  <text x="'+CAD.F(tmx)+'" y="'+CAD.F(tmy-4)+'" fill="'+c+'" font-size="11" font-family="Consolas,monospace" text-anchor="middle">'+lbl+'</text>\n';
            }
        }
    }
    s += '</svg>';
    return s;
};
