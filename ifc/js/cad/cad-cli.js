// ===================== CAD-CLI.JS - Layer 7b =====================
// Browser-side CAD API module.
// Exposes window.cad API for programmatic drawing and JSON serialization.
"use strict";

var CAD = window.CAD;

// ── Helpers ──
function px(v){ return CAD.toPx(v); }
var _batch = 0;
function refresh(){
    if(_batch > 0) return;
    CAD.invalidateSnapCache();
    CAD.saveHist();
    CAD.redraw();
    CAD.callbacks.updTree?.();
    if(CAD.formas.length > 0) CAD.callbacks.selectShape?.(CAD.formas.length - 1);
}

// ── CLI log ──
var cliOutput = null;
function log(msg){
    if(cliOutput){
        cliOutput.value += msg + "\n";
        cliOutput.scrollTop = cliOutput.scrollHeight;
    }
    console.log("[CAD CLI] " + msg);
}

function parseCoord(s){
    var parts = s.replace(/\s/g,"").split(",");
    return {
        x: parseFloat(parts[0]) || 0,
        y: parseFloat(parts[1]) || 0,
        z: parseFloat(parts[2]) || 0
    };
}

// ===================== CAD API =====================
var cad = {};

cad.line = function(x1,y1,x2,y2,color,opts){
    var c = color || CAD.currentColor;
    var o = opts || {};
    var shape = {
        tipo:"linea",
        x1:px(x1), y1:px(y1), z1:CAD.currentZ,
        x2:px(x2), y2:px(y2), z2:CAD.currentZ,
        z:CAD.currentZ, color:c
    };
    if(o.lw) shape.lw = o.lw;
    CAD.formas.push(shape);
    refresh();
    log("LINE (" + x1 + "," + y1 + ") -> (" + x2 + "," + y2 + ")  L=" + CAD.F(CAD.D(px(x1),px(y1),px(x2),px(y2))/CAD.escala) + " " + CAD.unidad);
    return CAD.formas.length - 1;
};

cad.rect = function(x,y,w,h,color){
    var c = color || CAD.currentColor;
    CAD.formas.push({
        tipo:"rectangulo",
        x:px(x), y:px(y), w:px(w), h:px(h),
        z:CAD.currentZ, color:c
    });
    refresh();
    log("RECT (" + x + "," + y + ") " + w + "x" + h + " " + CAD.unidad);
    return CAD.formas.length - 1;
};

cad.circle = function(cx,cy,r,color,opts){
    var c = color || CAD.currentColor;
    var o = opts || {};
    var shape = {
        tipo:"circulo",
        cx:px(cx), cy:px(cy), r:px(r),
        z:CAD.currentZ, color:c
    };
    if(o.fill) shape.fill = o.fill;
    if(o.lw) shape.lw = o.lw;
    CAD.formas.push(shape);
    refresh();
    log("CIRCLE (" + cx + "," + cy + ") r=" + r + " " + CAD.unidad);
    return CAD.formas.length - 1;
};

cad.ellipse = function(cx,cy,rx,ry,color){
    var c = color || CAD.currentColor;
    CAD.formas.push({
        tipo:"elipse",
        cx:px(cx), cy:px(cy), rx:px(rx), ry:px(ry),
        z:CAD.currentZ, color:c
    });
    refresh();
    log("ELLIPSE (" + cx + "," + cy + ") rx=" + rx + " ry=" + ry);
    return CAD.formas.length - 1;
};

cad.arc = function(x1,y1,cx,cy,x2,y2,color){
    var c = color || CAD.currentColor;
    CAD.formas.push({
        tipo:"arco",
        x1:px(x1), y1:px(y1), cx:px(cx), cy:px(cy), x2:px(x2), y2:px(y2),
        z:CAD.currentZ, color:c
    });
    refresh();
    log("ARC (" + x1 + "," + y1 + ") ctrl(" + cx + "," + cy + ") -> (" + x2 + "," + y2 + ")");
    return CAD.formas.length - 1;
};

cad.carc = function(cx,cy,r,startAngle,endAngle,color){
    var c = color || CAD.currentColor;
    CAD.formas.push({
        tipo:"arco_circular",
        cx:px(cx), cy:px(cy), r:px(r),
        startAngle:startAngle, endAngle:endAngle,
        z:CAD.currentZ, color:c
    });
    refresh();
    log("CARC center(" + cx + "," + cy + ") r=" + r + " ang=" + CAD.F(startAngle*180/Math.PI) + "°->" + CAD.F(endAngle*180/Math.PI) + "°");
    return CAD.formas.length - 1;
};

cad.pline = function(coords,color){
    var c = color || CAD.currentColor;
    var pts = [];
    for(var i = 0; i < coords.length; i += 2){
        pts.push({x:px(coords[i]), y:px(coords[i+1]), z:CAD.currentZ});
    }
    if(pts.length < 2){ log("ERROR: PLINE needs at least 2 points"); return -1; }
    CAD.formas.push({tipo:"polilinea", pts:pts, z:CAD.currentZ, color:c});
    refresh();
    log("PLINE " + pts.length + " points");
    return CAD.formas.length - 1;
};

cad.clear = function(){
    CAD.saveHist();
    CAD.formas.length = 0;
    CAD.set("formaSel", -1);
    CAD.invalidateSnapCache();
    CAD.saveHist();
    CAD.redraw();
    CAD.callbacks.updTree?.();
    CAD.callbacks.showProps?.(-1);
    log("CLEAR - all shapes removed");
};

cad.undo = function(){
    if(CAD.histPos > 0){
        CAD.set("histPos", CAD.histPos - 1);
        CAD.set("formas", JSON.parse(JSON.stringify(CAD.historial[CAD.histPos])));
        CAD.set("formaSel", -1);
        CAD.invalidateSnapCache();
        CAD.redraw(); CAD.callbacks.updTree?.(); CAD.callbacks.showProps?.(-1);
        log("UNDO -> " + CAD.formas.length + " shapes");
    } else {
        log("UNDO: nothing to undo");
    }
};

cad.zoomfit = function(){
    CAD.zoomFit?.();
    log("ZOOM FIT");
};

cad.setZ = function(z){
    CAD.set("currentZ", px(z));
    log("Z plane = " + z + " " + CAD.unidad);
};

cad.color = function(c){
    CAD.set("currentColor", c);
    var picker = document.getElementById("colorPicker");
    if(picker) picker.value = c;
    log("COLOR set to " + c);
    return c;
};

cad.list = function(){
    if(CAD.formas.length === 0){ log("No shapes"); return; }
    for(var i = 0; i < CAD.formas.length; i++){
        var f = CAD.formas[i];
        var info = "[" + i + "] " + f.tipo;
        if(f.tipo === "linea") info += " (" + CAD.F(CAD.toU(f.x1)) + "," + CAD.F(CAD.toU(f.y1)) + ")->(" + CAD.F(CAD.toU(f.x2)) + "," + CAD.F(CAD.toU(f.y2)) + ") L=" + CAD.F(CAD.toU(CAD.D(f.x1,f.y1,f.x2,f.y2)));
        else if(f.tipo === "rectangulo") info += " (" + CAD.F(CAD.toU(f.x)) + "," + CAD.F(CAD.toU(f.y)) + ") " + CAD.F(CAD.toU(Math.abs(f.w))) + "x" + CAD.F(CAD.toU(Math.abs(f.h)));
        else if(f.tipo === "circulo") info += " c(" + CAD.F(CAD.toU(f.cx)) + "," + CAD.F(CAD.toU(f.cy)) + ") r=" + CAD.F(CAD.toU(f.r));
        else if(f.tipo === "elipse") info += " c(" + CAD.F(CAD.toU(f.cx)) + "," + CAD.F(CAD.toU(f.cy)) + ") rx=" + CAD.F(CAD.toU(f.rx)) + " ry=" + CAD.F(CAD.toU(f.ry));
        else if(f.tipo === "polilinea") info += " " + f.pts.length + "pts";
        log(info);
    }
};

cad.del = function(idx){
    if(idx < 0 || idx >= CAD.formas.length){ log("ERROR: index " + idx + " out of range"); return; }
    CAD.saveHist();
    var tipo = CAD.formas[idx].tipo;
    CAD.formas.splice(idx, 1);
    CAD.set("formaSel", -1);
    CAD.invalidateSnapCache();
    CAD.saveHist();
    CAD.redraw(); CAD.callbacks.updTree?.(); CAD.callbacks.showProps?.(-1);
    log("DELETE [" + idx + "] " + tipo);
};

cad.move = function(idx, dx, dy){
    if(typeof idx === "number"){
        if(idx < 0 || idx >= CAD.formas.length){ log("ERROR: index out of range"); return; }
        CAD.saveHist();
        var f = CAD.formas[idx];
        var ddx = px(dx), ddy = px(dy);
        if(f.tipo==="linea"){ f.x1+=ddx; f.y1+=ddy; f.x2+=ddx; f.y2+=ddy; }
        else if(f.tipo==="rectangulo"){ f.x+=ddx; f.y+=ddy; }
        else if(f.tipo==="circulo"){ f.cx+=ddx; f.cy+=ddy; }
        else if(f.tipo==="elipse"){ f.cx+=ddx; f.cy+=ddy; }
        else if(f.tipo==="arco"){ f.x1+=ddx;f.y1+=ddy;f.cx+=ddx;f.cy+=ddy;f.x2+=ddx;f.y2+=ddy; }
        else if(f.tipo==="arco_circular"){ f.cx+=ddx; f.cy+=ddy; }
        else if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
            for(var j=0;j<f.pts.length;j++){ f.pts[j].x+=ddx; f.pts[j].y+=ddy; }
        }
        else if(f.tipo==="cota"){ f.x1+=ddx; f.y1+=ddy; f.x2+=ddx; f.y2+=ddy; }
        refresh();
        log("MOVE [" + idx + "] by (" + dx + "," + dy + ")");
    } else if(Array.isArray(idx)){
        CAD.saveHist();
        for(var i=0;i<idx.length;i++) cad.move(idx[i], dx, dy);
    }
};

cad.copy = function(idx, dx, dy){
    dx = dx || 0; dy = dy || 0;
    if(typeof idx === "number"){
        if(idx < 0 || idx >= CAD.formas.length){ log("ERROR: index out of range"); return -1; }
        var clone = JSON.parse(JSON.stringify(CAD.formas[idx]));
        var ddx = px(dx), ddy = px(dy);
        if(clone.tipo==="linea"){ clone.x1+=ddx; clone.y1+=ddy; clone.x2+=ddx; clone.y2+=ddy; }
        else if(clone.tipo==="rectangulo"){ clone.x+=ddx; clone.y+=ddy; }
        else if(clone.tipo==="circulo"){ clone.cx+=ddx; clone.cy+=ddy; }
        else if(clone.tipo==="elipse"){ clone.cx+=ddx; clone.cy+=ddy; }
        else if(clone.tipo==="arco"){ clone.x1+=ddx;clone.y1+=ddy;clone.cx+=ddx;clone.cy+=ddy;clone.x2+=ddx;clone.y2+=ddy; }
        else if(clone.tipo==="arco_circular"){ clone.cx+=ddx; clone.cy+=ddy; }
        else if((clone.tipo==="polilinea"||clone.tipo==="mano")&&clone.pts){
            for(var j=0;j<clone.pts.length;j++){ clone.pts[j].x+=ddx; clone.pts[j].y+=ddy; }
        }
        else if(clone.tipo==="cota"){ clone.x1+=ddx; clone.y1+=ddy; clone.x2+=ddx; clone.y2+=ddy; }
        CAD.formas.push(clone);
        refresh();
        log("COPY [" + idx + "] -> [" + (CAD.formas.length-1) + "] offset (" + dx + "," + dy + ")");
        return CAD.formas.length - 1;
    } else if(Array.isArray(idx)){
        CAD.saveHist();
        var newIds = [];
        for(var i=0;i<idx.length;i++) newIds.push(cad.copy(idx[i], dx, dy));
        return newIds;
    }
};

cad.mirror = function(idx, ax1, ay1, ax2, ay2){
    if(idx < 0 || idx >= CAD.formas.length){ log("ERROR: index out of range"); return -1; }
    var clone = JSON.parse(JSON.stringify(CAD.formas[idx]));
    var pax1=px(ax1),pay1=px(ay1),pax2=px(ax2),pay2=px(ay2);
    var adx=pax2-pax1, ady=pay2-pay1, alen2=adx*adx+ady*ady;
    function mirPt(mx,my){
        var t=((mx-pax1)*adx+(my-pay1)*ady)/alen2;
        var px2=pax1+t*adx, py2=pay1+t*ady;
        return {x:2*px2-mx, y:2*py2-my};
    }
    if(clone.tipo==="linea"){
        var mp1=mirPt(clone.x1,clone.y1), mp2=mirPt(clone.x2,clone.y2);
        clone.x1=mp1.x;clone.y1=mp1.y;clone.x2=mp2.x;clone.y2=mp2.y;
    } else if(clone.tipo==="rectangulo"){
        var mo=mirPt(clone.x,clone.y), mc=mirPt(clone.x+clone.w,clone.y+clone.h);
        clone.x=Math.min(mo.x,mc.x);clone.y=Math.min(mo.y,mc.y);
        clone.w=Math.abs(mc.x-mo.x);clone.h=Math.abs(mc.y-mo.y);
    } else if(clone.tipo==="circulo"){
        var mcc=mirPt(clone.cx,clone.cy);clone.cx=mcc.x;clone.cy=mcc.y;
    } else if(clone.tipo==="elipse"){
        var mce=mirPt(clone.cx,clone.cy);clone.cx=mce.x;clone.cy=mce.y;
    } else if((clone.tipo==="polilinea"||clone.tipo==="mano")&&clone.pts){
        for(var j=0;j<clone.pts.length;j++){
            var mp=mirPt(clone.pts[j].x,clone.pts[j].y);
            clone.pts[j].x=mp.x;clone.pts[j].y=mp.y;
        }
    }
    CAD.formas.push(clone);
    refresh();
    log("MIRROR [" + idx + "] -> [" + (CAD.formas.length-1) + "]");
    return CAD.formas.length - 1;
};

cad.rotate = function(idx, cx, cy, angleDeg){
    if(idx < 0 || idx >= CAD.formas.length){ log("ERROR: index out of range"); return; }
    CAD.saveHist();
    var f = CAD.formas[idx];
    var pcx=px(cx),pcy=px(cy), rad=angleDeg*Math.PI/180;
    var cosA=Math.cos(rad), sinA=Math.sin(rad);
    function rotPt(mx,my){ var dx2=mx-pcx,dy2=my-pcy; return {x:pcx+dx2*cosA-dy2*sinA, y:pcy+dx2*sinA+dy2*cosA}; }
    if(f.tipo==="linea"){
        var r1=rotPt(f.x1,f.y1),r2=rotPt(f.x2,f.y2);
        f.x1=r1.x;f.y1=r1.y;f.x2=r2.x;f.y2=r2.y;
    } else if(f.tipo==="rectangulo"){
        var pts=[{x:f.x,y:f.y},{x:f.x+f.w,y:f.y},{x:f.x+f.w,y:f.y+f.h},{x:f.x,y:f.y+f.h},{x:f.x,y:f.y}];
        for(var ri=0;ri<pts.length;ri++){ var rp=rotPt(pts[ri].x,pts[ri].y);pts[ri].x=rp.x;pts[ri].y=rp.y;pts[ri].z=f.z||0; }
        CAD.formas[idx]={tipo:"polilinea",pts:pts,z:f.z||0,color:f.color};
    } else if(f.tipo==="circulo"){
        var rc=rotPt(f.cx,f.cy);f.cx=rc.x;f.cy=rc.y;
    } else if(f.tipo==="elipse"){
        var re=rotPt(f.cx,f.cy);f.cx=re.x;f.cy=re.y;
    } else if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
        for(var rj=0;rj<f.pts.length;rj++){ var rrp=rotPt(f.pts[rj].x,f.pts[rj].y);f.pts[rj].x=rrp.x;f.pts[rj].y=rrp.y; }
    }
    refresh();
    log("ROTATE [" + idx + "] " + angleDeg + "° around (" + cx + "," + cy + ")");
};

cad.scaleShape = function(idx, factor, cx, cy){
    if(idx < 0 || idx >= CAD.formas.length){ log("ERROR: index out of range"); return; }
    CAD.saveHist();
    var f = CAD.formas[idx];
    cx = (cx !== undefined) ? px(cx) : f.cx || f.x || 0;
    cy = (cy !== undefined) ? px(cy) : f.cy || f.y || 0;
    function sc(x,y){ return {x:cx+(x-cx)*factor, y:cy+(y-cy)*factor}; }
    if(f.tipo==="linea"){
        var s1=sc(f.x1,f.y1),s2=sc(f.x2,f.y2);f.x1=s1.x;f.y1=s1.y;f.x2=s2.x;f.y2=s2.y;
    } else if(f.tipo==="rectangulo"){
        var so=sc(f.x,f.y);f.x=so.x;f.y=so.y;f.w*=factor;f.h*=factor;
    } else if(f.tipo==="circulo"){
        var scc=sc(f.cx,f.cy);f.cx=scc.x;f.cy=scc.y;f.r*=factor;
    } else if(f.tipo==="elipse"){
        var se=sc(f.cx,f.cy);f.cx=se.x;f.cy=se.y;f.rx*=factor;f.ry*=factor;
    } else if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
        for(var sj=0;sj<f.pts.length;sj++){var sp=sc(f.pts[sj].x,f.pts[sj].y);f.pts[sj].x=sp.x;f.pts[sj].y=sp.y;}
    }
    refresh();
    log("SCALE [" + idx + "] x" + factor);
};

cad.array = function(idx, nx, ny, dx, dy){
    nx = nx || 1; ny = ny || 1; dx = dx || 0; dy = dy || 0;
    var indices = Array.isArray(idx) ? idx : [idx];
    var newIds = [];
    CAD.saveHist();
    cad.beginBatch();
    for(var iy = 0; iy < ny; iy++){
        for(var ix = 0; ix < nx; ix++){
            if(ix === 0 && iy === 0) continue;
            for(var k = 0; k < indices.length; k++){
                var ni = cad.copy(indices[k], ix * dx, iy * dy);
                newIds.push(ni);
            }
        }
    }
    cad.endBatch();
    log("ARRAY " + nx + "x" + ny + " -> " + newIds.length + " copies");
    return newIds;
};

cad.polarArray = function(idx, n, cx, cy, totalAngle){
    n = n || 4;
    totalAngle = (totalAngle !== undefined) ? totalAngle : 360;
    var indices = Array.isArray(idx) ? idx : [idx];
    var newIds = [];
    var step = totalAngle / n;
    CAD.saveHist();
    cad.beginBatch();
    for(var i = 1; i < n; i++){
        for(var k = 0; k < indices.length; k++){
            var clone = JSON.parse(JSON.stringify(CAD.formas[indices[k]]));
            CAD.formas.push(clone);
            var ni = CAD.formas.length - 1;
            cad.rotate(ni, cx, cy, step * i);
            newIds.push(ni);
        }
    }
    cad.endBatch();
    log("POLAR ARRAY n=" + n + " -> " + newIds.length + " copies");
    return newIds;
};

cad.arrayPath = function(idx, n, x1, y1, x2, y2){
    n = n || 2;
    var ddx = (x2 - x1) / (n - 1);
    var ddy = (y2 - y1) / (n - 1);
    var newIds = [];
    CAD.saveHist();
    cad.beginBatch();
    for(var i = 1; i < n; i++){
        var ni = cad.copy(idx, ddx * i, ddy * i);
        newIds.push(ni);
    }
    cad.endBatch();
    log("ARRAY PATH n=" + n);
    return newIds;
};

cad.offset = function(idx, dist, color){
    if(idx < 0 || idx >= CAD.formas.length){ log("ERROR: index out of range"); return -1; }
    var f = CAD.formas[idx];
    var d = px(dist);
    var c = color || f.color || CAD.currentColor;
    CAD.saveHist();

    if(f.tipo === "linea"){
        var dx = f.x2 - f.x1, dy = f.y2 - f.y1;
        var len = Math.sqrt(dx*dx + dy*dy);
        if(len === 0) return -1;
        var nx = -dy/len * d, ny = dx/len * d;
        return cad.line((f.x1+nx)/CAD.escala, (f.y1+ny)/CAD.escala, (f.x2+nx)/CAD.escala, (f.y2+ny)/CAD.escala, c);
    } else if(f.tipo === "rectangulo"){
        var newX = (f.x - d) / CAD.escala;
        var newY = (f.y - d) / CAD.escala;
        var newW = (Math.abs(f.w) + 2*d) / CAD.escala;
        var newH = (Math.abs(f.h) + 2*d) / CAD.escala;
        return cad.rect(newX, newY, newW, newH, c);
    } else if(f.tipo === "circulo"){
        return cad.circle(f.cx/CAD.escala, f.cy/CAD.escala, (f.r + d)/CAD.escala, c);
    } else if(f.tipo === "elipse"){
        return cad.ellipse(f.cx/CAD.escala, f.cy/CAD.escala, (f.rx+d)/CAD.escala, (f.ry+d)/CAD.escala, c);
    } else if(f.tipo === "polilinea" && f.pts && f.pts.length >= 2){
        var pts = f.pts;
        var offSegs = [];
        for(var i = 0; i < pts.length - 1; i++){
            var sdx = pts[i+1].x - pts[i].x, sdy = pts[i+1].y - pts[i].y;
            var slen = Math.sqrt(sdx*sdx + sdy*sdy);
            if(slen === 0) continue;
            var snx = -sdy/slen * d, sny = sdx/slen * d;
            offSegs.push({
                x1: pts[i].x + snx, y1: pts[i].y + sny,
                x2: pts[i+1].x + snx, y2: pts[i+1].y + sny
            });
        }
        if(offSegs.length === 0) return -1;
        var offPts = [offSegs[0].x1 / CAD.escala, offSegs[0].y1 / CAD.escala];
        for(var j = 0; j < offSegs.length - 1; j++){
            var s1 = offSegs[j], s2 = offSegs[j+1];
            var inter = _lineIntersect(s1.x1,s1.y1,s1.x2,s1.y2, s2.x1,s2.y1,s2.x2,s2.y2);
            if(inter){
                offPts.push(inter.x / CAD.escala, inter.y / CAD.escala);
            } else {
                offPts.push(s1.x2 / CAD.escala, s1.y2 / CAD.escala);
            }
        }
        var last = offSegs[offSegs.length-1];
        offPts.push(last.x2 / CAD.escala, last.y2 / CAD.escala);
        return cad.pline(offPts, c);
    }
    log("OFFSET: type " + f.tipo + " not supported");
    return -1;
};

function _lineIntersect(x1,y1,x2,y2,x3,y3,x4,y4){
    var d = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
    if(Math.abs(d) < 1e-10) return null;
    var t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / d;
    return {x: x1 + t*(x2-x1), y: y1 + t*(y2-y1)};
}

cad.scale = function(s){
    CAD.set("escala", s);
    CAD.redraw(); CAD.callbacks.updTree?.();
    log("SCALE = " + s + " px/" + CAD.unidad);
};

cad.beginBatch = function(){ _batch++; };
cad.endBatch = function(){
    _batch--;
    if(_batch <= 0){ _batch = 0; refresh(); }
};

cad.unit = function(u){
    CAD.set("unidad", u);
    var el = document.getElementById("unidad");
    if(el) el.value = u;
    CAD.redraw(); CAD.callbacks.updTree?.();
    log("UNIT = " + u);
};

cad.group = function(indices){
    if(!indices || indices.length < 2){ log("ERROR: group needs at least 2"); return -1; }
    var children = [];
    var sorted = indices.slice().sort(function(a,b){return b-a;});
    for(var i=0;i<indices.length;i++){
        if(indices[i]>=0 && indices[i]<CAD.formas.length)
            children.push(JSON.parse(JSON.stringify(CAD.formas[indices[i]])));
    }
    for(var j=0;j<sorted.length;j++){
        if(sorted[j]>=0 && sorted[j]<CAD.formas.length) CAD.formas.splice(sorted[j],1);
    }
    var grp = {tipo:"grupo", color:"#ffffff", z:0, children:children, hidden:false};
    CAD.formas.push(grp);
    refresh();
    log("GROUP: " + children.length + " objects → index " + (CAD.formas.length-1));
    return CAD.formas.length-1;
};

cad.ungroup = function(idx){
    if(idx<0||idx>=CAD.formas.length||CAD.formas[idx].tipo!=="grupo"){
        log("ERROR: index " + idx + " is not a group"); return;
    }
    var ch = CAD.formas[idx].children;
    CAD.formas.splice(idx, 1);
    for(var i=0;i<ch.length;i++) CAD.formas.push(ch[i]);
    refresh();
    log("UNGROUP: " + ch.length + " objects released");
};

cad.groupRange = function(from, to){
    var arr = [];
    for(var i=from;i<=to;i++) arr.push(i);
    return cad.group(arr);
};

cad.zoom = function(factor){
    CAD.cam.zoom *= factor;
    CAD.cam.zoom = Math.max(CAD.cam.minZoom, Math.min(CAD.cam.maxZoom, CAD.cam.zoom));
    CAD.redraw();
    log("ZOOM x" + factor + " → " + Math.round(CAD.cam.zoom*100) + "%");
};
cad.zoomin = function(){ cad.zoom(1.5); };
cad.zoomout = function(){ cad.zoom(1/1.5); };
cad.pan = function(dx, dy){
    CAD.cam.x += px(dx); CAD.cam.y += px(dy);
    CAD.redraw();
    log("PAN (" + dx + "," + dy + ")");
};
cad.zoomto = function(x, y, z){
    CAD.cam.x = px(x); CAD.cam.y = px(y);
    if(z !== undefined) CAD.cam.zoom = z;
    CAD.redraw();
};

cad.dim = function(x1,y1,x2,y2,offset,text,color){
    var c = color || "#ffdd00";
    offset = (offset !== undefined && offset !== null) ? px(offset) : px(10);
    var shape = {
        tipo:"cota",
        x1:px(x1), y1:px(y1), x2:px(x2), y2:px(y2),
        offset:offset, text:text || null,
        z:CAD.currentZ, color:c
    };
    CAD.formas.push(shape);
    refresh();
    var dist = CAD.D(px(x1),px(y1),px(x2),px(y2));
    log("DIM (" + x1 + "," + y1 + ") -> (" + x2 + "," + y2 + ") = " + CAD.F(CAD.toU(dist)) + " " + CAD.unidad);
    return CAD.formas.length - 1;
};
cad.hdim = function(x1,y1,x2,y2,offset,text,color){ return cad.dim(x1, y1, x2, y1, offset, text, color); };
cad.vdim = function(x1,y1,x2,y2,offset,text,color){ return cad.dim(x1, y1, x1, y2, offset, text, color); };
cad.adim = function(x1,y1,x2,y2,offset,text,color){ return cad.dim(x1, y1, x2, y2, offset, text, color); };

cad.rrect = function(x,y,w,h,r,color){
    var c = color || CAD.currentColor;
    r = r || 0;
    if(r > Math.abs(w)/2) r = Math.abs(w)/2;
    if(r > Math.abs(h)/2) r = Math.abs(h)/2;
    cad.line(x+r, y, x+w-r, y, c);
    cad.line(x+w, y+r, x+w, y+h-r, c);
    cad.line(x+w-r, y+h, x+r, y+h, c);
    cad.line(x, y+h-r, x, y+r, c);
    if(r > 0){
        var PI = Math.PI;
        cad.carc(x+r, y+r, r, PI, 3*PI/2, c);
        cad.carc(x+w-r, y+r, r, 3*PI/2, 2*PI, c);
        cad.carc(x+w-r, y+h-r, r, 0, PI/2, c);
        cad.carc(x+r, y+h-r, r, PI/2, PI, c);
    }
    log("RRECT (" + x + "," + y + ") " + w + "x" + h + " r=" + r);
};

cad.stirrup = function(x,y,w,h,r,hookLen,color){
    var c = color || "#4ec9b0";
    hookLen = hookLen || r*3;
    cad.rrect(x, y, w, h, r, c);
    var hx = x + r, hy = y + h;
    cad.line(hx, hy, hx + hookLen*0.707, hy - hookLen*0.707, c);
    var hx2 = x + w - r;
    cad.line(hx2, hy, hx2 - hookLen*0.707, hy - hookLen*0.707, c);
    log("STIRRUP (" + x + "," + y + ") " + w + "x" + h);
};

cad.columnSection = function(cx,cy,bw,bh,rec,dStirrup,dLong,nx,ny,bendR){
    var _groupStart = CAD.formas.length;
    cad.beginBatch();
    var c_concrete = "#cccccc", c_stirrup = "#00ff88", c_bar = "#ff4444";
    bendR = bendR || (dStirrup * 3);
    rec = rec || 4;
    var dS = dStirrup;
    var x0 = cx - bw/2, y0 = cy - bh/2;
    cad.rect(x0, y0, bw, bh, c_concrete);
    var sxC = x0 + rec + dS/2, syC = y0 + rec + dS/2;
    var swC = bw - 2*(rec + dS/2), shC = bh - 2*(rec + dS/2);
    var sxO = sxC - dS/2, syO = syC - dS/2, swO = swC + dS, shO = shC + dS;
    var rO = bendR + dS/2;
    var sxI = sxC + dS/2, syI = syC + dS/2, swI = swC - dS, shI = shC - dS;
    var rI = Math.max(bendR - dS/2, 0.5);
    cad.rrect(sxO, syO, swO, shO, rO, c_stirrup);
    cad.rrect(sxI, syI, swI, shI, rI, c_stirrup);
    // Longitudinal bars
    var barR = dLong / 2;
    var barOpts = {fill: c_bar};
    var barOff = rec + dS + barR;
    var acBLx = sxI + rI, acBLy = syI + rI;
    var acBRx = sxI + swI - rI, acBRy = syI + rI;
    var acTRx = sxI + swI - rI, acTRy = syI + shI - rI;
    var acTLx = sxI + rI, acTLy = syI + shI - rI;
    var cd = (rI + barR) * 0.70710678;
    cad.circle(acBLx - cd, acBLy - cd, barR, c_bar, barOpts);
    cad.circle(acBRx + cd, acBRy - cd, barR, c_bar, barOpts);
    cad.circle(acTRx + cd, acTRy + cd, barR, c_bar, barOpts);
    cad.circle(acTLx - cd, acTLy + cd, barR, c_bar, barOpts);
    if(nx > 2){
        var spacingX = (bw - 2*barOff) / (nx - 1);
        for(var ix = 1; ix < nx-1; ix++){
            var bx = x0 + barOff + ix * spacingX;
            cad.circle(bx, y0 + barOff, barR, c_bar, barOpts);
            cad.circle(bx, y0 + bh - barOff, barR, c_bar, barOpts);
        }
    }
    if(ny > 2){
        var spacingY = (bh - 2*barOff) / (ny - 1);
        for(var iy = 1; iy < ny-1; iy++){
            var by = y0 + barOff + iy * spacingY;
            cad.circle(x0 + barOff, by, barR, c_bar, barOpts);
            cad.circle(x0 + bw - barOff, by, barR, c_bar, barOpts);
        }
    }
    cad.endBatch();
    var _groupEnd = CAD.formas.length;
    if(_groupEnd > _groupStart){
        var children = [];
        for(var _gi = _groupStart; _gi < _groupEnd; _gi++) children.push(CAD.formas[_gi]);
        CAD.formas.splice(_groupStart, _groupEnd - _groupStart);
        var grp = {tipo:"grupo", color:"#ffffff", z:0, children:children, hidden:false};
        CAD.formas.push(grp);
        refresh();
    }
    log("COLUMN SECTION " + bw + "x" + bh + " " + nx + "x" + ny + " bars");
    return CAD.formas.length - 1;
};

// ── Text annotation ──
cad.text = function(x,y,str,color){
    var c = color || CAD.currentColor;
    var t = (str||"").replace(/^["']|["']$/g, ""); // strip quotes
    CAD.formas.push({
        tipo:"texto",
        x:px(x), y:px(y), text:t,
        z:CAD.currentZ, color:c
    });
    refresh();
    log("TEXT (" + x + "," + y + ") \"" + t + "\"");
    return CAD.formas.length - 1;
};

// ── Arrow line ──
cad.arrow = function(x1,y1,x2,y2,color){
    var c = color || CAD.currentColor;
    CAD.formas.push({
        tipo:"flecha",
        x1:px(x1), y1:px(y1), z1:CAD.currentZ,
        x2:px(x2), y2:px(y2), z2:CAD.currentZ,
        z:CAD.currentZ, color:c
    });
    refresh();
    log("ARROW (" + x1 + "," + y1 + ") -> (" + x2 + "," + y2 + ")");
    return CAD.formas.length - 1;
};

// ── 3D drawing commands ──
cad.line3d = function(x1,y1,z1,x2,y2,z2,color){
    var c = color || CAD.currentColor;
    CAD.formas.push({
        tipo:"linea", is3d:true,
        x1:px(x1), y1:px(y1), z1:px(z1),
        x2:px(x2), y2:px(y2), z2:px(z2),
        z:px(z1), color:c
    });
    refresh();
    log("LINE3D (" + x1 + "," + y1 + "," + z1 + ") -> (" + x2 + "," + y2 + "," + z2 + ")");
    return CAD.formas.length - 1;
};

cad.arrow3d = function(x1,y1,z1,x2,y2,z2,color){
    var c = color || CAD.currentColor;
    CAD.formas.push({
        tipo:"flecha", is3d:true,
        x1:px(x1), y1:px(y1), z1:px(z1),
        x2:px(x2), y2:px(y2), z2:px(z2),
        z:px(z1), color:c
    });
    refresh();
    log("ARROW3D (" + x1 + "," + y1 + "," + z1 + ") -> (" + x2 + "," + y2 + "," + z2 + ")");
    return CAD.formas.length - 1;
};

cad.text3d = function(x,y,z,str,color){
    var c = color || CAD.currentColor;
    var t = (str||"").replace(/^["']|["']$/g, "");
    CAD.formas.push({
        tipo:"texto", is3d:true,
        x:px(x), y:px(y), text:t,
        z:px(z), color:c
    });
    refresh();
    log("TEXT3D (" + x + "," + y + "," + z + ") \"" + t + "\"");
    return CAD.formas.length - 1;
};

cad.pline3d = function(coords,color){
    var c = color || CAD.currentColor;
    var pts = [];
    for(var i = 0; i < coords.length - 2; i += 3){
        pts.push({x:px(coords[i]), y:px(coords[i+1]), z:px(coords[i+2])});
    }
    if(pts.length < 2){ log("PLINE3D: need at least 6 values (2 points x3)"); return -1; }
    CAD.formas.push({
        tipo:"polilinea", is3d:true,
        pts:pts, z:pts[0].z, color:c
    });
    refresh();
    log("PLINE3D " + pts.length + " points");
    return CAD.formas.length - 1;
};

cad.circle3d = function(cx,cy,cz,r,color){
    var c = color || CAD.currentColor;
    CAD.formas.push({
        tipo:"circulo", is3d:true,
        cx:px(cx), cy:px(cy), r:px(r),
        z:px(cz), color:c
    });
    refresh();
    log("CIRCLE3D (" + cx + "," + cy + "," + cz + ") r=" + r);
    return CAD.formas.length - 1;
};

cad.carc3d = function(cx,cy,cz,r,startAngle,endAngle,color){
    var c = color || CAD.currentColor;
    var sa = (startAngle||0)*Math.PI/180;
    var ea = (endAngle||360)*Math.PI/180;
    CAD.formas.push({
        tipo:"arco_circular", is3d:true,
        cx:px(cx), cy:px(cy), r:px(r),
        startAngle:sa, endAngle:ea,
        z:px(cz), color:c
    });
    refresh();
    log("CARC3D (" + cx + "," + cy + "," + cz + ") r=" + r + " " + startAngle + "°-" + endAngle + "°");
    return CAD.formas.length - 1;
};

// ── Projection mode ──
cad.proj = function(mode, angle, scale){
    if(mode === "oblique" || mode === "oblicua"){
        CAD.projMode = "oblique";
        if(!isNaN(angle)) CAD.projAngle = angle * Math.PI / 180;
        if(!isNaN(scale)) CAD.projScale = scale;
        log("PROJ oblique angle=" + (CAD.projAngle*180/Math.PI).toFixed(1) + "° scale=" + CAD.projScale);
    } else {
        CAD.projMode = "2d";
        log("PROJ 2d");
    }
    refresh();
};

// ── Grid / Labels / Background ──
cad.grid = function(on){ CAD.gridOn = (on !== "off" && on !== false); refresh(); log("GRID " + (CAD.gridOn?"on":"off")); };
cad.labels = function(on){ CAD.showDimLabels = (on !== "off" && on !== false); refresh(); log("LABELS " + (CAD.showDimLabels?"on":"off")); };
cad.bg = function(c){ CAD.bgColor = c || "#1a1a2e"; refresh(); log("BG " + CAD.bgColor); };

cad.help = function(){
    log("=== HEKATAN CAD CLI ===");
    log("cad.line/rect/circle/ellipse/arc/carc/pline/dim/text/arrow");
    log("cad.line3d/arrow3d/text3d/pline3d/circle3d/carc3d");
    log("cad.clear/undo/zoomfit/list/del/move/copy/mirror/rotate");
    log("cad.scaleShape/array/polarArray/offset/group/ungroup");
    log("cad.rrect/stirrup/columnSection");
    log("cad.proj/grid/labels/bg");
    log("Type 'help' for full list");
};

// ── Parse text command ──
cad.exec = function(cmdText){
    var lines = cmdText.trim().split("\n");
    for(var li = 0; li < lines.length; li++){
        var raw = lines[li].trim();
        if(!raw || raw.charAt(0) === "#" || raw.charAt(0) === "'") continue;
        var tokens = raw.replace(/,/g, " ").replace(/\s+/g, " ").split(" ");
        var cmd = tokens[0].toLowerCase();
        var n = tokens.map(parseFloat);
        try {
            if(cmd === "line" || cmd === "l" || cmd === "linea") cad.line(n[1],n[2],n[3],n[4], tokens[5]);
            else if(cmd === "rect" || cmd === "r" || cmd === "rectangulo") cad.rect(n[1],n[2],n[3],n[4], tokens[5]);
            else if(cmd === "circle" || cmd === "c" || cmd === "circulo") cad.circle(n[1],n[2],n[3], tokens[4]);
            else if(cmd === "ellipse" || cmd === "e" || cmd === "elipse") cad.ellipse(n[1],n[2],n[3],n[4], tokens[5]);
            else if(cmd === "arc" || cmd === "a" || cmd === "arco") cad.arc(n[1],n[2],n[3],n[4],n[5],n[6], tokens[7]);
            else if(cmd === "carc") cad.carc(n[1],n[2],n[3],n[4],n[5], tokens[6]);
            else if(cmd === "pline" || cmd === "pl" || cmd === "polilinea") cad.pline(n.slice(1));
            else if(cmd === "clear") cad.clear();
            else if(cmd === "undo" || cmd === "u") cad.undo();
            else if(cmd === "zoomfit" || cmd === "zf" || cmd === "fit") cad.zoomfit();
            else if(cmd === "list" || cmd === "ls") cad.list();
            else if(cmd === "del" || cmd === "delete") cad.del(n[1]);
            else if(cmd === "move" || cmd === "mv") cad.move(n[1], n[2], n[3]);
            else if(cmd === "copy" || cmd === "cp") cad.copy(n[1], n[2], n[3]);
            else if(cmd === "mirror" || cmd === "mi") cad.mirror(n[1], n[2], n[3], n[4], n[5]);
            else if(cmd === "rotate" || cmd === "ro") cad.rotate(n[1], n[2], n[3], n[4]);
            else if(cmd === "scaleshape" || cmd === "ss") cad.scaleShape(n[1], n[2], n[3], n[4]);
            else if(cmd === "array" || cmd === "ar") cad.array(n[1], n[2], n[3], n[4], n[5]);
            else if(cmd === "polararray" || cmd === "pa") cad.polarArray(n[1], n[2], n[3], n[4], n[5]);
            else if(cmd === "arraypath" || cmd === "ap") cad.arrayPath(n[1], n[2], n[3], n[4], n[5], n[6]);
            else if(cmd === "offset" || cmd === "of") cad.offset(n[1], n[2]);
            else if(cmd === "z") cad.setZ(n[1]);
            else if(cmd === "scale") cad.scale(n[1]);
            else if(cmd === "unit") cad.unit(tokens[1]);
            else if(cmd === "dim" || cmd === "cota") cad.dim(n[1],n[2],n[3],n[4],n[5],tokens[6]);
            else if(cmd === "hdim" || cmd === "cotah") cad.hdim(n[1],n[2],n[3],n[4],n[5],tokens[6]);
            else if(cmd === "vdim" || cmd === "cotav") cad.vdim(n[1],n[2],n[3],n[4],n[5],tokens[6]);
            else if(cmd === "adim" || cmd === "cotaa") cad.adim(n[1],n[2],n[3],n[4],n[5],tokens[6]);
            else if(cmd === "zoom") cad.zoom(n[1]||1.5);
            else if(cmd === "zoomin" || cmd === "zi") cad.zoomin();
            else if(cmd === "zoomout" || cmd === "zo") cad.zoomout();
            else if(cmd === "pan") cad.pan(n[1]||0, n[2]||0);
            else if(cmd === "zoomto" || cmd === "zt") cad.zoomto(n[1]||0, n[2]||0, n[3]);
            else if(cmd === "save") cad.save(tokens[1]);
            else if(cmd === "load") cad.load();
            else if(cmd === "rrect") cad.rrect(n[1],n[2],n[3],n[4],n[5], tokens[6]);
            else if(cmd === "stirrup" || cmd === "estribo") cad.stirrup(n[1],n[2],n[3],n[4],n[5],n[6], tokens[7]);
            else if(cmd === "colsection" || cmd === "columna" || cmd === "columnsection") cad.columnSection(n[1],n[2],n[3],n[4],n[5],n[6],n[7],n[8],n[9],n[10]);
            else if(cmd === "text" || cmd === "texto") cad.text(n[1],n[2], tokens.slice(3).join(" "));
            else if(cmd === "arrow" || cmd === "flecha") cad.arrow(n[1],n[2],n[3],n[4], tokens[5]);
            else if(cmd === "line3d" || cmd === "l3d" || cmd === "linea3d") cad.line3d(n[1],n[2],n[3],n[4],n[5],n[6], tokens[7]);
            else if(cmd === "arrow3d" || cmd === "flecha3d") cad.arrow3d(n[1],n[2],n[3],n[4],n[5],n[6], tokens[7]);
            else if(cmd === "text3d" || cmd === "texto3d") cad.text3d(n[1],n[2],n[3], tokens.slice(4).join(" "));
            else if(cmd === "pline3d" || cmd === "pl3d" || cmd === "polilinea3d") cad.pline3d(n.slice(1));
            else if(cmd === "circle3d" || cmd === "c3d" || cmd === "circulo3d") cad.circle3d(n[1],n[2],n[3],n[4], tokens[5]);
            else if(cmd === "carc3d") cad.carc3d(n[1],n[2],n[3],n[4],n[5],n[6], tokens[7]);
            else if(cmd === "proj" || cmd === "projection") cad.proj(tokens[1], n[2], n[3]);
            else if(cmd === "grid") cad.grid(tokens[1]);
            else if(cmd === "labels") cad.labels(tokens[1]);
            else if(cmd === "bg" || cmd === "background") cad.bg(tokens[1]);
            else if(cmd === "color") cad.color(tokens[1]);
            else if(cmd === "ifc"){
                if(window._ifcExec){
                    var res = window._ifcExec(tokens.slice(1));
                    if(res) log(res);
                } else { log("IFC module not loaded"); }
            }
            else if(cmd === "help" || cmd === "?") cad.help();
            else if(window._ifcAlias){
                var aliasResult = window._ifcAlias(cmd, tokens[1], tokens.slice(2));
                if(aliasResult !== null) log(aliasResult);
                else log("Unknown: " + raw);
            }
            else log("Unknown: " + raw);
        } catch(err){
            log("ERROR: " + err.message + " in: " + raw);
        }
    }
};

// ── Serialization ──
function shapeToUser(f){
    var o = {type: f.tipo, color: f.color || "#ffffff"};
    if(f.z) o.z = CAD.toU(f.z);
    if(f.lw) o.lw = f.lw;
    if(f.fill) o.fill = f.fill;
    if(f.hidden) o.hidden = true;
    if(f.tipo === "linea"){ o.x1=CAD.toU(f.x1);o.y1=CAD.toU(f.y1);o.x2=CAD.toU(f.x2);o.y2=CAD.toU(f.y2);if(f.z1)o.z1=CAD.toU(f.z1);if(f.z2)o.z2=CAD.toU(f.z2); }
    else if(f.tipo === "rectangulo"){ o.x=CAD.toU(f.x);o.y=CAD.toU(f.y);o.w=CAD.toU(f.w);o.h=CAD.toU(f.h); }
    else if(f.tipo === "circulo"){ o.cx=CAD.toU(f.cx);o.cy=CAD.toU(f.cy);o.r=CAD.toU(f.r); }
    else if(f.tipo === "elipse"){ o.cx=CAD.toU(f.cx);o.cy=CAD.toU(f.cy);o.rx=CAD.toU(f.rx);o.ry=CAD.toU(f.ry); }
    else if(f.tipo === "arco"){ o.x1=CAD.toU(f.x1);o.y1=CAD.toU(f.y1);o.cx=CAD.toU(f.cx);o.cy=CAD.toU(f.cy);o.x2=CAD.toU(f.x2);o.y2=CAD.toU(f.y2); }
    else if(f.tipo === "arco_circular"){ o.cx=CAD.toU(f.cx);o.cy=CAD.toU(f.cy);o.r=CAD.toU(f.r);o.startAngle=f.startAngle;o.endAngle=f.endAngle; }
    else if((f.tipo === "polilinea" || f.tipo === "mano") && f.pts){ o.pts = f.pts.map(function(p){ return {x:CAD.toU(p.x), y:CAD.toU(p.y), z:p.z?CAD.toU(p.z):0}; }); }
    else if(f.tipo === "cota"){ o.x1=CAD.toU(f.x1);o.y1=CAD.toU(f.y1);o.x2=CAD.toU(f.x2);o.y2=CAD.toU(f.y2);o.offset=CAD.toU(f.offset||0);if(f.text)o.text=f.text; }
    else if(f.tipo === "grupo" && f.children){ o.children = f.children.map(shapeToUser); }
    return o;
}

function shapeFromUser(o){
    var f = {tipo: o.type, color: o.color || "#ffffff"};
    if(o.z) f.z = px(o.z);
    if(o.lw) f.lw = o.lw;
    if(o.fill) f.fill = o.fill;
    if(o.hidden) f.hidden = true;
    if(o.type === "linea"){ f.x1=px(o.x1);f.y1=px(o.y1);f.x2=px(o.x2);f.y2=px(o.y2);if(o.z1)f.z1=px(o.z1);if(o.z2)f.z2=px(o.z2);f.z=px(o.z||0); }
    else if(o.type === "rectangulo"){ f.x=px(o.x);f.y=px(o.y);f.w=px(o.w);f.h=px(o.h); }
    else if(o.type === "circulo"){ f.cx=px(o.cx);f.cy=px(o.cy);f.r=px(o.r); }
    else if(o.type === "elipse"){ f.cx=px(o.cx);f.cy=px(o.cy);f.rx=px(o.rx);f.ry=px(o.ry); }
    else if(o.type === "arco"){ f.x1=px(o.x1);f.y1=px(o.y1);f.cx=px(o.cx);f.cy=px(o.cy);f.x2=px(o.x2);f.y2=px(o.y2); }
    else if(o.type === "arco_circular"){ f.cx=px(o.cx);f.cy=px(o.cy);f.r=px(o.r);f.startAngle=o.startAngle;f.endAngle=o.endAngle; }
    else if((o.type === "polilinea" || o.type === "mano") && o.pts){ f.pts = o.pts.map(function(p){ return {x:px(p.x), y:px(p.y), z:p.z?px(p.z):0}; }); }
    else if(o.type === "cota"){ f.x1=px(o.x1);f.y1=px(o.y1);f.x2=px(o.x2);f.y2=px(o.y2);f.offset=px(o.offset||0);if(o.text)f.text=o.text; }
    else if(o.type === "grupo" && o.children){ f.children = o.children.map(shapeFromUser); }
    return f;
}

cad.toJSON = function(){
    return {
        version: 1, unit: CAD.unidad, scale: CAD.escala,
        color: CAD.currentColor, z: CAD.toU(CAD.currentZ),
        shapes: CAD.formas.map(shapeToUser)
    };
};

cad.fromJSON = function(data){
    if(!data || !data.shapes){ log("ERROR: invalid JSON data"); return; }
    CAD.saveHist();
    if(data.unit) CAD.set("unidad", data.unit);
    if(data.scale) CAD.set("escala", data.scale);
    if(data.color) CAD.set("currentColor", data.color);
    if(data.z) CAD.set("currentZ", px(data.z));
    CAD.formas.length = 0;
    for(var i = 0; i < data.shapes.length; i++) CAD.formas.push(shapeFromUser(data.shapes[i]));
    CAD.set("formaSel", -1);
    CAD.invalidateSnapCache();
    CAD.saveHist();
    CAD.redraw(); CAD.callbacks.updTree?.(); CAD.callbacks.showProps?.(-1);
    log("LOADED " + CAD.formas.length + " shapes from JSON");
};

cad.save = function(filename){
    filename = filename || "cad-state.json";
    var json = JSON.stringify(cad.toJSON(), null, 2);
    var blob = new Blob([json], {type: "application/json"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log("SAVED to " + filename);
};

cad.load = function(){
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.addEventListener("change", function(){
        if(!input.files[0]) return;
        var reader = new FileReader();
        reader.onload = function(e){
            try { cad.fromJSON(JSON.parse(e.target.result)); }
            catch(err){ log("ERROR loading: " + err.message); }
        };
        reader.readAsText(input.files[0]);
    });
    input.click();
};

// ── Init CLI panel ──
CAD.initCLI = function(){
    // Solo tomar referencia al output — los eventos del cliInput los maneja
    // ifc-commands.js (exec → runCmd → default → cad.exec) para evitar
    // duplicar listeners y que el dispatcher IFC tenga prioridad.
    cliOutput = document.getElementById("cliOutput");
    window.cad = cad;
    console.log("[CAD CLI] Modulo listo. Comandos CAD disponibles cuando CAD 2D activo.");
};

// Expose cad object
window.cad = cad;
