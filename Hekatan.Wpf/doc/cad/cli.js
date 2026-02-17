// ===================== CAD-API.JS - Layer 7b =====================
// Browser-side CAD API module.
// Exposes window.cad API for programmatic drawing and JSON serialization.
"use strict";

import * as S from './state.js';
import { set, callbacks } from './state.js';
import { toPx, toU, F, D } from './math.js';
import { saveHist } from './history.js';
import { invalidateSnapCache } from './snap.js';
import { redraw } from './render.js';
import { updTree, selectShape, showProps } from './panels.js';

// ── Helpers ──
function px(v){ return toPx(v); }
var _batch = 0;   // batch nesting counter
function refresh(){
    if(_batch > 0) return;  // suppressed during batch
    invalidateSnapCache();
    saveHist();
    redraw();
    updTree();
    if(S.formas.length > 0) selectShape(S.formas.length - 1);
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

// ── Parse coordinate "x,y" or "x,y,z" ──
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

// LINE x1,y1 x2,y2  (in user units)
// opts: {lw:number} for custom lineWidth
cad.line = function(x1,y1,x2,y2,color,opts){
    var c = color || S.currentColor;
    var o = opts || {};
    var shape = {
        tipo:"linea",
        x1:px(x1), y1:px(y1), z1:S.currentZ,
        x2:px(x2), y2:px(y2), z2:S.currentZ,
        z:S.currentZ, color:c
    };
    if(o.lw) shape.lw = o.lw;
    S.formas.push(shape);
    refresh();
    log("LINE (" + x1 + "," + y1 + ") -> (" + x2 + "," + y2 + ")  L=" + F(D(px(x1),px(y1),px(x2),px(y2))/S.escala) + " " + S.unidad);
    return S.formas.length - 1;
};

// RECT x,y w,h  (origin + dimensions in user units)
cad.rect = function(x,y,w,h,color){
    var c = color || S.currentColor;
    S.formas.push({
        tipo:"rectangulo",
        x:px(x), y:px(y), w:px(w), h:px(h),
        z:S.currentZ, color:c
    });
    refresh();
    log("RECT (" + x + "," + y + ") " + w + "x" + h + " " + S.unidad);
    return S.formas.length - 1;
};

// CIRCLE cx,cy r  (center + radius in user units)
// opts: {fill:"color", lw:number} for filled circles & custom lineWidth
cad.circle = function(cx,cy,r,color,opts){
    var c = color || S.currentColor;
    var o = opts || {};
    var shape = {
        tipo:"circulo",
        cx:px(cx), cy:px(cy), r:px(r),
        z:S.currentZ, color:c
    };
    if(o.fill) shape.fill = o.fill;
    if(o.lw) shape.lw = o.lw;
    S.formas.push(shape);
    refresh();
    log("CIRCLE (" + cx + "," + cy + ") r=" + r + " " + S.unidad);
    return S.formas.length - 1;
};

// ELLIPSE cx,cy rx,ry
cad.ellipse = function(cx,cy,rx,ry,color){
    var c = color || S.currentColor;
    S.formas.push({
        tipo:"elipse",
        cx:px(cx), cy:px(cy), rx:px(rx), ry:px(ry),
        z:S.currentZ, color:c
    });
    refresh();
    log("ELLIPSE (" + cx + "," + cy + ") rx=" + rx + " ry=" + ry);
    return S.formas.length - 1;
};

// ARC x1,y1 cx,cy x2,y2  (start, control, end) - quadratic Bezier
cad.arc = function(x1,y1,cx,cy,x2,y2,color){
    var c = color || S.currentColor;
    S.formas.push({
        tipo:"arco",
        x1:px(x1), y1:px(y1), cx:px(cx), cy:px(cy), x2:px(x2), y2:px(y2),
        z:S.currentZ, color:c
    });
    refresh();
    log("ARC (" + x1 + "," + y1 + ") ctrl(" + cx + "," + cy + ") -> (" + x2 + "," + y2 + ")");
    return S.formas.length - 1;
};

// CARC - Circular arc (true arc, not Bezier)
// cx,cy = center, r = radius, startAngle, endAngle (in radians)
cad.carc = function(cx,cy,r,startAngle,endAngle,color){
    var c = color || S.currentColor;
    S.formas.push({
        tipo:"arco_circular",
        cx:px(cx), cy:px(cy), r:px(r),
        startAngle:startAngle, endAngle:endAngle,
        z:S.currentZ, color:c
    });
    refresh();
    log("CARC center(" + cx + "," + cy + ") r=" + r + " ang=" + F(startAngle*180/Math.PI) + "°->" + F(endAngle*180/Math.PI) + "°");
    return S.formas.length - 1;
};

// PLINE [x1,y1, x2,y2, x3,y3, ...]  (flat array of coords)
cad.pline = function(coords,color){
    var c = color || S.currentColor;
    var pts = [];
    for(var i = 0; i < coords.length; i += 2){
        pts.push({x:px(coords[i]), y:px(coords[i+1]), z:S.currentZ});
    }
    if(pts.length < 2){ log("ERROR: PLINE needs at least 2 points"); return -1; }
    S.formas.push({tipo:"polilinea", pts:pts, z:S.currentZ, color:c});
    refresh();
    log("PLINE " + pts.length + " points");
    return S.formas.length - 1;
};

// CLEAR - remove all shapes
cad.clear = function(){
    saveHist();
    S.formas.length = 0;
    set("formaSel", -1);
    invalidateSnapCache();
    saveHist();
    redraw();
    updTree();
    showProps(-1);
    log("CLEAR - all shapes removed");
};

// UNDO
cad.undo = function(){
    if(S.histPos > 0){
        set("histPos", S.histPos - 1);
        set("formas", JSON.parse(JSON.stringify(S.historial[S.histPos])));
        set("formaSel", -1);
        invalidateSnapCache();
        redraw(); updTree(); showProps(-1);
        log("UNDO -> " + S.formas.length + " shapes");
    } else {
        log("UNDO: nothing to undo");
    }
};

// ZOOMFIT
cad.zoomfit = function(){
    callbacks.zoomFit?.();
    log("ZOOM FIT");
};

// SET Z plane
cad.setZ = function(z){
    set("currentZ", px(z));
    log("Z plane = " + z + " " + S.unidad);
};

// SET color for next shapes
cad.color = function(c){
    set("currentColor", c);
    var picker = document.getElementById("colorPicker");
    if(picker) picker.value = c;
    log("COLOR set to " + c);
    return c;
};

// LIST all shapes
cad.list = function(){
    if(S.formas.length === 0){ log("No shapes"); return; }
    for(var i = 0; i < S.formas.length; i++){
        var f = S.formas[i];
        var info = "[" + i + "] " + f.tipo;
        if(f.tipo === "linea") info += " (" + F(toU(f.x1)) + "," + F(toU(f.y1)) + ")->(" + F(toU(f.x2)) + "," + F(toU(f.y2)) + ") L=" + F(toU(D(f.x1,f.y1,f.x2,f.y2)));
        else if(f.tipo === "rectangulo") info += " (" + F(toU(f.x)) + "," + F(toU(f.y)) + ") " + F(toU(Math.abs(f.w))) + "x" + F(toU(Math.abs(f.h)));
        else if(f.tipo === "circulo") info += " c(" + F(toU(f.cx)) + "," + F(toU(f.cy)) + ") r=" + F(toU(f.r));
        else if(f.tipo === "elipse") info += " c(" + F(toU(f.cx)) + "," + F(toU(f.cy)) + ") rx=" + F(toU(f.rx)) + " ry=" + F(toU(f.ry));
        else if(f.tipo === "polilinea") info += " " + f.pts.length + "pts";
        log(info);
    }
};

// DELETE shape by index
cad.del = function(idx){
    if(idx < 0 || idx >= S.formas.length){ log("ERROR: index " + idx + " out of range"); return; }
    saveHist();
    var tipo = S.formas[idx].tipo;
    S.formas.splice(idx, 1);
    set("formaSel", -1);
    invalidateSnapCache();
    saveHist();
    redraw(); updTree(); showProps(-1);
    log("DELETE [" + idx + "] " + tipo);
};

// MOVE shape(s) by dx, dy
cad.move = function(idx, dx, dy){
    if(typeof idx === "number"){
        if(idx < 0 || idx >= S.formas.length){ log("ERROR: index out of range"); return; }
        saveHist();
        var f = S.formas[idx];
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
        saveHist();
        for(var i=0;i<idx.length;i++) cad.move(idx[i], dx, dy);
    }
};

// COPY shape(s) with offset dx,dy - returns new index(es)
cad.copy = function(idx, dx, dy){
    dx = dx || 0; dy = dy || 0;
    if(typeof idx === "number"){
        if(idx < 0 || idx >= S.formas.length){ log("ERROR: index out of range"); return -1; }
        var clone = JSON.parse(JSON.stringify(S.formas[idx]));
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
        S.formas.push(clone);
        refresh();
        log("COPY [" + idx + "] -> [" + (S.formas.length-1) + "] offset (" + dx + "," + dy + ")");
        return S.formas.length - 1;
    } else if(Array.isArray(idx)){
        saveHist();
        var newIds = [];
        for(var i=0;i<idx.length;i++) newIds.push(cad.copy(idx[i], dx, dy));
        return newIds;
    }
};

// MIRROR shape along axis defined by two points
cad.mirror = function(idx, ax1, ay1, ax2, ay2){
    if(idx < 0 || idx >= S.formas.length){ log("ERROR: index out of range"); return -1; }
    var clone = JSON.parse(JSON.stringify(S.formas[idx]));
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
    S.formas.push(clone);
    refresh();
    log("MIRROR [" + idx + "] -> [" + (S.formas.length-1) + "]");
    return S.formas.length - 1;
};

// ROTATE shape around a center point by angle (degrees)
cad.rotate = function(idx, cx, cy, angleDeg){
    if(idx < 0 || idx >= S.formas.length){ log("ERROR: index out of range"); return; }
    saveHist();
    var f = S.formas[idx];
    var pcx=px(cx),pcy=px(cy), rad=angleDeg*Math.PI/180;
    var cosA=Math.cos(rad), sinA=Math.sin(rad);
    function rotPt(mx,my){ var dx2=mx-pcx,dy2=my-pcy; return {x:pcx+dx2*cosA-dy2*sinA, y:pcy+dx2*sinA+dy2*cosA}; }
    if(f.tipo==="linea"){
        var r1=rotPt(f.x1,f.y1),r2=rotPt(f.x2,f.y2);
        f.x1=r1.x;f.y1=r1.y;f.x2=r2.x;f.y2=r2.y;
    } else if(f.tipo==="rectangulo"){
        // Convert to polyline for rotation
        var pts=[{x:f.x,y:f.y},{x:f.x+f.w,y:f.y},{x:f.x+f.w,y:f.y+f.h},{x:f.x,y:f.y+f.h},{x:f.x,y:f.y}];
        for(var ri=0;ri<pts.length;ri++){ var rp=rotPt(pts[ri].x,pts[ri].y);pts[ri].x=rp.x;pts[ri].y=rp.y;pts[ri].z=f.z||0; }
        S.formas[idx]={tipo:"polilinea",pts:pts,z:f.z||0,color:f.color};
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

// SCALE shape from a center point by factor
cad.scaleShape = function(idx, factor, cx, cy){
    if(idx < 0 || idx >= S.formas.length){ log("ERROR: index out of range"); return; }
    saveHist();
    var f = S.formas[idx];
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
    log("SCALE [" + idx + "] x" + factor + " from (" + (cx/S.escala) + "," + (cy/S.escala) + ")");
};

// ── ARRAY: Rectangular array (like AutoCAD ARRAY) ──
// idx = shape index (or array of indices)
// nx,ny = number of copies in X,Y direction (total including original)
// dx,dy = spacing between copies in current units
// Returns array of new indices
cad.array = function(idx, nx, ny, dx, dy){
    nx = nx || 1; ny = ny || 1; dx = dx || 0; dy = dy || 0;
    var indices = Array.isArray(idx) ? idx : [idx];
    var newIds = [];
    saveHist();
    cad.beginBatch();
    for(var iy = 0; iy < ny; iy++){
        for(var ix = 0; ix < nx; ix++){
            if(ix === 0 && iy === 0) continue; // skip original position
            for(var k = 0; k < indices.length; k++){
                var ni = cad.copy(indices[k], ix * dx, iy * dy);
                newIds.push(ni);
            }
        }
    }
    cad.endBatch();
    log("ARRAY " + nx + "x" + ny + " spacing (" + dx + "," + dy + ") -> " + newIds.length + " copies");
    return newIds;
};

// ── POLAR ARRAY: copies around a center point ──
// idx = shape index (or array), n = total count, cx,cy = center, totalAngle = total sweep in degrees (default 360)
cad.polarArray = function(idx, n, cx, cy, totalAngle){
    n = n || 4;
    totalAngle = (totalAngle !== undefined) ? totalAngle : 360;
    var indices = Array.isArray(idx) ? idx : [idx];
    var newIds = [];
    var step = totalAngle / n;
    saveHist();
    cad.beginBatch();
    for(var i = 1; i < n; i++){
        for(var k = 0; k < indices.length; k++){
            var clone = JSON.parse(JSON.stringify(S.formas[indices[k]]));
            S.formas.push(clone);
            var ni = S.formas.length - 1;
            cad.rotate(ni, cx, cy, step * i);
            newIds.push(ni);
        }
    }
    cad.endBatch();
    log("POLAR ARRAY n=" + n + " center (" + cx + "," + cy + ") " + totalAngle + "° -> " + newIds.length + " copies");
    return newIds;
};

// ── ARRAY PATH: copy along a line/polyline path ──
// idx = shape to copy, n = number of copies, x1,y1,x2,y2 = path line
cad.arrayPath = function(idx, n, x1, y1, x2, y2){
    n = n || 2;
    var ddx = (x2 - x1) / (n - 1);
    var ddy = (y2 - y1) / (n - 1);
    var newIds = [];
    saveHist();
    cad.beginBatch();
    for(var i = 1; i < n; i++){
        var ni = cad.copy(idx, ddx * i, ddy * i);
        newIds.push(ni);
    }
    cad.endBatch();
    log("ARRAY PATH n=" + n + " from (" + x1 + "," + y1 + ") to (" + x2 + "," + y2 + ")");
    return newIds;
};

// ── OFFSET: creates a parallel copy of a shape at a given distance ──
// idx = shape index, dist = offset distance (positive = outward, negative = inward)
cad.offset = function(idx, dist, color){
    if(idx < 0 || idx >= S.formas.length){ log("ERROR: index out of range"); return -1; }
    var f = S.formas[idx];
    var d = px(dist);
    var c = color || f.color || S.currentColor;
    saveHist();

    if(f.tipo === "linea"){
        // Perpendicular offset
        var dx = f.x2 - f.x1, dy = f.y2 - f.y1;
        var len = Math.sqrt(dx*dx + dy*dy);
        if(len === 0) return -1;
        var nx = -dy/len * d, ny = dx/len * d;
        return cad.line((f.x1+nx)/S.escala, (f.y1+ny)/S.escala, (f.x2+nx)/S.escala, (f.y2+ny)/S.escala, c);
    } else if(f.tipo === "rectangulo"){
        // Expand/contract rectangle
        var newX = (f.x - d) / S.escala;
        var newY = (f.y - d) / S.escala;
        var newW = (Math.abs(f.w) + 2*d) / S.escala;
        var newH = (Math.abs(f.h) + 2*d) / S.escala;
        return cad.rect(newX, newY, newW, newH, c);
    } else if(f.tipo === "circulo"){
        return cad.circle(f.cx/S.escala, f.cy/S.escala, (f.r + d)/S.escala, c);
    } else if(f.tipo === "elipse"){
        return cad.ellipse(f.cx/S.escala, f.cy/S.escala, (f.rx+d)/S.escala, (f.ry+d)/S.escala, c);
    } else if(f.tipo === "polilinea" && f.pts && f.pts.length >= 2){
        // Offset each segment and find intersections
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
        // Build offset points: start of first segment, intersections between consecutive, end of last
        var offPts = [offSegs[0].x1 / S.escala, offSegs[0].y1 / S.escala];
        for(var j = 0; j < offSegs.length - 1; j++){
            var s1 = offSegs[j], s2 = offSegs[j+1];
            var inter = _lineIntersect(s1.x1,s1.y1,s1.x2,s1.y2, s2.x1,s2.y1,s2.x2,s2.y2);
            if(inter){
                offPts.push(inter.x / S.escala, inter.y / S.escala);
            } else {
                offPts.push(s1.x2 / S.escala, s1.y2 / S.escala);
            }
        }
        var last = offSegs[offSegs.length-1];
        offPts.push(last.x2 / S.escala, last.y2 / S.escala);
        return cad.pline(offPts, c);
    }
    log("OFFSET: type " + f.tipo + " not supported");
    return -1;
};

// Helper: line-line intersection (pixel coords)
function _lineIntersect(x1,y1,x2,y2,x3,y3,x4,y4){
    var d = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
    if(Math.abs(d) < 1e-10) return null;
    var t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / d;
    return {x: x1 + t*(x2-x1), y: y1 + t*(y2-y1)};
}

// SET scale
cad.scale = function(s){
    set("escala", s);
    redraw(); updTree();
    log("SCALE = " + s + " px/" + S.unidad);
};

// BATCH mode - suppress refresh for compound ops
cad.beginBatch = function(){ _batch++; };
cad.endBatch = function(){
    _batch--;
    if(_batch <= 0){ _batch = 0; refresh(); }
};

// SET unit
cad.unit = function(u){
    set("unidad", u);
    document.getElementById("unidad").value = u;
    redraw(); updTree();
    log("UNIT = " + u);
};

// GROUP: combine multiple shapes into one selectable block
cad.group = function(indices){
    // indices = array of shape indices to group
    if(!indices || indices.length < 2){
        log("ERROR: group needs at least 2 shape indices");
        return -1;
    }
    var children = [];
    var sorted = indices.slice().sort(function(a,b){return b-a;});
    for(var i=0;i<indices.length;i++){
        if(indices[i]>=0 && indices[i]<S.formas.length){
            children.push(JSON.parse(JSON.stringify(S.formas[indices[i]])));
        }
    }
    // Remove originals (from end to start to preserve indices)
    for(var j=0;j<sorted.length;j++){
        if(sorted[j]>=0 && sorted[j]<S.formas.length) S.formas.splice(sorted[j],1);
    }
    var grp = {tipo:"grupo", color:"#ffffff", z:0, children:children, hidden:false};
    S.formas.push(grp);
    refresh();
    log("GROUP created: " + children.length + " objects → index " + (S.formas.length-1));
    return S.formas.length-1;
};

// UNGROUP: explode a group back into individual shapes
cad.ungroup = function(idx){
    if(idx<0||idx>=S.formas.length||S.formas[idx].tipo!=="grupo"){
        log("ERROR: index " + idx + " is not a group");
        return;
    }
    var ch = S.formas[idx].children;
    S.formas.splice(idx, 1);
    var first = S.formas.length;
    for(var i=0;i<ch.length;i++) S.formas.push(ch[i]);
    refresh();
    log("UNGROUP: " + ch.length + " objects released (indices " + first + "-" + (S.formas.length-1) + ")");
};

// GROUP from range: convenience to group shapes by index range
cad.groupRange = function(from, to){
    var arr = [];
    for(var i=from;i<=to;i++) arr.push(i);
    return cad.group(arr);
};

// ── ZOOM / PAN programmatic control ──
cad.zoom = function(factor){
    S.cam.zoom *= factor;
    S.cam.zoom = Math.max(S.cam.minZoom, Math.min(S.cam.maxZoom, S.cam.zoom));
    redraw();
    log("ZOOM x" + factor + " → " + Math.round(S.cam.zoom*100) + "%");
};
cad.zoomin = function(){ cad.zoom(1.5); };
cad.zoomout = function(){ cad.zoom(1/1.5); };
cad.pan = function(dx, dy){
    S.cam.x += px(dx);
    S.cam.y += px(dy);
    redraw();
    log("PAN (" + dx + "," + dy + ")");
};
cad.zoomto = function(x, y, z){
    S.cam.x = px(x);
    S.cam.y = px(y);
    if(z !== undefined) S.cam.zoom = z;
    redraw();
    log("ZOOMTO (" + x + "," + y + ") zoom=" + S.cam.zoom.toFixed(2));
};

// ── DIMENSION (COTA): annotate distance between two points ──
cad.dim = function(x1,y1,x2,y2,offset,text,color){
    var c = color || "#ffdd00";
    offset = (offset !== undefined && offset !== null) ? px(offset) : px(10);
    var shape = {
        tipo:"cota",
        x1:px(x1), y1:px(y1),
        x2:px(x2), y2:px(y2),
        offset:offset,
        text:text || null,
        z:S.currentZ, color:c
    };
    S.formas.push(shape);
    refresh();
    var dist = D(px(x1),px(y1),px(x2),px(y2));
    log("DIM (" + x1 + "," + y1 + ") -> (" + x2 + "," + y2 + ") = " + F(toU(dist)) + " " + S.unidad);
    return S.formas.length - 1;
};
cad.hdim = function(x1,y1,x2,y2,offset,text,color){
    return cad.dim(x1, y1, x2, y1, offset, text || null, color);
};
cad.vdim = function(x1,y1,x2,y2,offset,text,color){
    return cad.dim(x1, y1, x1, y2, offset, text || null, color);
};
cad.adim = function(x1,y1,x2,y2,offset,text,color){
    return cad.dim(x1, y1, x2, y2, offset, text || null, color);
};

// HELP
cad.help = function(){
    log("=== CALCPAD CAD+IFC CLI ===");
    log("cad.line(x1,y1,x2,y2,[color])  - Draw line");
    log("cad.rect(x,y,w,h,[color])       - Draw rectangle");
    log("cad.circle(cx,cy,r,[color])      - Draw circle");
    log("cad.ellipse(cx,cy,rx,ry,[color]) - Draw ellipse");
    log("cad.arc(x1,y1,cx,cy,x2,y2)      - Draw arc (Bezier)");
    log("cad.carc(cx,cy,r,start,end)      - Circular arc (radians)");
    log("cad.pline([x1,y1,x2,y2,...])     - Draw polyline");
    log("cad.clear()                       - Remove all");
    log("cad.undo()                        - Undo");
    log("cad.zoomfit()                     - Zoom to fit");
    log("cad.list()                        - List all shapes");
    log("cad.del(idx)                      - Delete shape by index");
    log("cad.move(idx,dx,dy)               - Move shape");
    log("cad.copy(idx,dx,dy)               - Copy shape with offset");
    log("cad.mirror(idx,ax1,ay1,ax2,ay2)   - Mirror shape");
    log("cad.rotate(idx,cx,cy,angle)       - Rotate shape (degrees)");
    log("cad.scaleShape(idx,factor,cx,cy)  - Scale shape");
    log("cad.array(idx,nx,ny,dx,dy)        - Rectangular array");
    log("cad.polarArray(idx,n,cx,cy,angle) - Polar array");
    log("cad.arrayPath(idx,n,x1,y1,x2,y2) - Array along path");
    log("cad.offset(idx,dist,[color])      - Parallel offset copy");
    log("cad.group([i1,i2,...])            - Group shapes into block");
    log("cad.groupRange(from,to)           - Group index range");
    log("cad.ungroup(idx)                  - Ungroup/explode block");
    log("cad.setZ(z)                       - Set Z work plane");
    log("cad.scale(s)                      - Set scale (px/unit)");
    log("cad.unit('mm'|'cm'|'m')          - Set unit");
    log("--- Keyboard shortcuts (canvas) ---");
    log("M = Move selected | T = Trim | X = Scale");
    log("Ctrl+C = Copy | Ctrl+V = Paste | Ctrl+D = Duplicate");
    log("Delete = Delete | Esc = Cancel");
    log("cad.dim(x1,y1,x2,y2,off,txt)       - Dimension (cota)");
    log("cad.hdim(x1,y1,x2,y2,off)           - Horizontal dim");
    log("cad.vdim(x1,y1,x2,y2,off)           - Vertical dim");
    log("cad.adim(x1,y1,x2,y2,off)           - Aligned dim");
    log("cad.zoom(factor)                     - Zoom in/out");
    log("cad.zoomin() / cad.zoomout()         - Zoom ±50%");
    log("cad.pan(dx,dy)                       - Pan camera");
    log("cad.zoomto(x,y,zoom)                 - Center on point");
    log("cad.toJSON()                      - Export as JSON");
    log("cad.fromJSON(data)                 - Import from JSON");
    log("cad.save([filename])               - Download JSON file");
    log("cad.load()                         - Load JSON from file");
    log("--- Structural ---");
    log("rrect x y w h r [color]             - Rounded rect (stirrup profile)");
    log("stirrup x y w h r hookLen [color]    - Stirrup with 135° hooks");
    log("colsection cx cy bw bh rec dS dL nx ny bendR - Column section");
    log("  Ejemplo: colsection 0 0 30 40 4 1 1.6 3 4 3");
    log("--- IFC Commands ---");
    log("ifc load                           - Open IFC file");
    log("ifc meta                           - Show IFC metadata");
    log("ifc types                          - List entity types");
    log("ifc stats                          - Statistics by type");
    log("ifc hide <IFCTYPE>                 - Hide entity type");
    log("ifc show <IFCTYPE>                 - Show entity type");
    log("ifc hideall / showall              - Toggle all");
    log("ifc fit                            - Zoom to IFC model");
    log("ifc view top|front|right|3d        - Set view angle");
    log("ifc entity #123                    - Entity info");
    log("ifc clear                          - Remove IFC model");
    log("Coordinates are in current units (" + S.unidad + ")");
};

// ── STRUCTURAL: Rounded rectangle (stirrup / estribo) ──
// Draws a rectangle with rounded corners (fillet arcs) using lines + arcs
// x,y = bottom-left corner, w,h = dimensions, r = fillet radius
cad.rrect = function(x,y,w,h,r,color){
    var c = color || S.currentColor;
    r = r || 0;
    if(r > Math.abs(w)/2) r = Math.abs(w)/2;
    if(r > Math.abs(h)/2) r = Math.abs(h)/2;
    // 4 straight segments (shortened by fillet radius)
    // Bottom: left-right
    cad.line(x+r, y, x+w-r, y, c);
    // Right: bottom-top
    cad.line(x+w, y+r, x+w, y+h-r, c);
    // Top: right-left
    cad.line(x+w-r, y+h, x+r, y+h, c);
    // Left: top-bottom
    cad.line(x, y+h-r, x, y+r, c);

    if(r > 0){
        var PI = Math.PI;
        // True circular arcs at corners using cad.carc(cx,cy,r,startAngle,endAngle)
        // Bottom-left corner: center at (x+r, y+r), arc from 180° to 270° (π to 3π/2)
        cad.carc(x+r, y+r, r, PI, 3*PI/2, c);
        // Bottom-right corner: center at (x+w-r, y+r), arc from 270° to 360° (3π/2 to 2π)
        cad.carc(x+w-r, y+r, r, 3*PI/2, 2*PI, c);
        // Top-right corner: center at (x+w-r, y+h-r), arc from 0° to 90° (0 to π/2)
        cad.carc(x+w-r, y+h-r, r, 0, PI/2, c);
        // Top-left corner: center at (x+r, y+h-r), arc from 90° to 180° (π/2 to π)
        cad.carc(x+r, y+h-r, r, PI/2, PI, c);
    }
    log("RRECT (" + x + "," + y + ") " + w + "x" + h + " r=" + r + " " + S.unidad);
};

// STIRRUP: estribo con gancho (135° hook)
// x,y = bottom-left of stirrup, w,h = dims, r = bend radius, hookLen = hook length
cad.stirrup = function(x,y,w,h,r,hookLen,color){
    var c = color || "#4ec9b0";
    hookLen = hookLen || r*3;
    // Draw rounded rectangle
    cad.rrect(x, y, w, h, r, c);
    // Hook at top-left: 135° hook going inward-down
    var hx = x + r;
    var hy = y + h;
    var angle135 = (135 * Math.PI / 180);
    var hookDx = hookLen * Math.cos(angle135 + Math.PI/2);
    var hookDy = hookLen * Math.sin(angle135 + Math.PI/2);
    cad.line(hx, hy, hx + hookLen*0.707, hy - hookLen*0.707, c);
    // Hook at top-right
    var hx2 = x + w - r;
    cad.line(hx2, hy, hx2 - hookLen*0.707, hy - hookLen*0.707, c);
    log("STIRRUP with hooks (" + x + "," + y + ") " + w + "x" + h + " bend=" + r);
};

// COLUMN SECTION: draws full column reinforcement cross-section
// cx,cy = center, bw,bh = column width/height, rec = cover, dStirrup = stirrup bar dia,
// dLong = longitudinal bar dia, nx = bars in X dir, ny = bars in Y dir, bendR = bend radius
cad.columnSection = function(cx,cy,bw,bh,rec,dStirrup,dLong,nx,ny,bendR){
    // Track starting index to auto-group all shapes at the end
    var _groupStart = S.formas.length;
    cad.beginBatch();
    var c_concrete = "#cccccc";
    var c_stirrup = "#00ff88";
    var c_bar = "#ff4444";

    bendR = bendR || (dStirrup * 3);
    rec = rec || 4;  // recubrimiento in cm
    var dS = dStirrup;  // stirrup bar diameter

    // Outer concrete section
    var x0 = cx - bw/2, y0 = cy - bh/2;
    cad.rect(x0, y0, bw, bh, c_concrete);

    // Stirrup with real bar thickness (two rrects: outer and inner)
    // Stirrup centerline is at rec + dS/2 from concrete face
    var sxC = x0 + rec + dS/2;  // stirrup centerline X
    var syC = y0 + rec + dS/2;  // stirrup centerline Y
    var swC = bw - 2*(rec + dS/2);  // stirrup centerline width
    var shC = bh - 2*(rec + dS/2);  // stirrup centerline height

    // Outer edge of stirrup bar
    var sxO = sxC - dS/2, syO = syC - dS/2;
    var swO = swC + dS, shO = shC + dS;
    var rO = bendR + dS/2;  // outer bend radius

    // Inner edge of stirrup bar
    var sxI = sxC + dS/2, syI = syC + dS/2;
    var swI = swC - dS, shI = shC - dS;
    var rI = Math.max(bendR - dS/2, 0.5);  // inner bend radius

    // Draw both outer and inner stirrup profiles
    cad.rrect(sxO, syO, swO, shO, rO, c_stirrup);
    cad.rrect(sxI, syI, swI, shI, rI, c_stirrup);

    // ── 135° HOOKS (ACI 318 §25.3.2) ──
    // Each hook has its OWN small bend radius (hookR = 3·dS per ACI 318 §25.3.1)
    // separate from the stirrup corner fillet radius (bendR).
    //
    // The rrect draws a closed profile. The hooks are ADDITIONAL geometry at TL corner
    // representing the two bar ends that overlap there.
    //
    // Hook B (top leg end): bar comes from right along top face, at the TL fillet
    //   tangent point (where straight top segment meets the corner arc), the hook
    //   bends 135° downward with its own small radius, then extends 6·dS straight.
    //
    // Hook A (left leg start): bar comes from below along left face, at the TL fillet
    //   tangent point (where straight left segment meets the corner arc), the hook
    //   bends 135° rightward with its own small radius, then extends 6·dS straight.

    var half = dS / 2;
    var COS45 = 0.70710678;
    var SIN45 = 0.70710678;
    var PI = Math.PI;

    // Hook bend radius: ACI 318 §25.3.1 → min 3·dS for stirrups ≤ φ16mm
    var hookR = 3 * dS;
    var hookRO = hookR + half;   // outer edge of hook bend
    var hookRI = hookR - half;   // inner edge of hook bend
    if(hookRI < 0.2) hookRI = 0.2;

    // Extension length: 6 × stirrup bar diameter
    var hookExt = 6 * dS;

    // ── HOOK A: left leg (bar goes UP, bends RIGHT into core) ──
    // Tangent point: where left straight segment meets TL fillet
    // Center of hook bend: hookR to the RIGHT of tangent point
    // Arc: from π (tangent point is LEFT of center) to π/4 (exit at 45°)
    // Exit direction: tangent CW at π/4 → (sin45, -cos45) = (0.707, -0.707) = down-right ✓
    var hkAcx = sxC + hookR;
    var hkAcy = syC + shC - bendR;

    cad.carc(hkAcx, hkAcy, hookRO, PI/4, PI, c_stirrup);
    cad.carc(hkAcx, hkAcy, hookRI, PI/4, PI, c_stirrup);

    var eAx = hkAcx + hookRO * COS45,  eAy = hkAcy + hookRO * SIN45;
    var iAx = hkAcx + hookRI * COS45,  iAy = hkAcy + hookRI * SIN45;

    var hDx = COS45, hDy = -SIN45;   // extension direction: down-right
    cad.line(eAx, eAy, eAx + hookExt*hDx, eAy + hookExt*hDy, c_stirrup);
    cad.line(iAx, iAy, iAx + hookExt*hDx, iAy + hookExt*hDy, c_stirrup);

    var capAx = (eAx + iAx)/2 + hookExt*hDx;
    var capAy = (eAy + iAy)/2 + hookExt*hDy;
    cad.carc(capAx, capAy, half, -PI*3/4, PI/4, c_stirrup);

    // ── HOOK B: top leg (bar goes LEFT, bends DOWN into core) ──
    // Mirror of Hook A reflected about the 45° diagonal of the TL corner.
    // Mirror transform: swap (dx, dy) relative to corner (sxC, syC+shC).
    // Hook A center offset from corner: (+hookR, -bendR) → mirror: (-bendR, +hookR)
    // But hookR is below the top face, so center is BELOW the tangent point.
    // Tangent point: where top straight segment meets TL fillet = (sxC + bendR, syC + shC)
    // Center of hook bend: hookR BELOW tangent point
    // Arc angles: mirror of Hook A's (PI/4, PI) → swap each θ to PI/2−θ:
    //   PI/4 → PI/2−PI/4 = PI/4,  PI → PI/2−PI = -PI/2
    //   So arc goes from -PI/2 to PI/4
    var hkBcx = sxC + bendR;
    var hkBcy = syC + shC - hookR;

    cad.carc(hkBcx, hkBcy, hookRO, -PI/2, PI/4, c_stirrup);
    cad.carc(hkBcx, hkBcy, hookRI, -PI/2, PI/4, c_stirrup);

    // Exit point at θ = -PI/2: (cx + R·cos(-PI/2), cy + R·sin(-PI/2)) = (cx, cy - R)
    // Wait — mirror of Hook A exit at PI/4 should be at PI/2-PI/4 = PI/4 too? No.
    // Let me recalculate. Hook A exits at angle PI/4 from center.
    // Mirror(PI/4) = PI/2 - PI/4 = PI/4. Hmm same angle? That can't be right.
    // The mirror of an arc from PI to PI/4 about y=x line means:
    //   each point (r·cosθ, r·sinθ) → (r·sinθ, r·cosθ) = (r·cos(PI/2-θ), r·sin(PI/2-θ))
    // So angle θ maps to PI/2-θ.
    // Start: PI → PI/2-PI = -PI/2. End: PI/4 → PI/2-PI/4 = PI/4.
    // The ARC direction reverses: CW → CCW. But for cad.carc we need start < end for short arc.
    // -PI/2 < PI/4 ✓ → this should be the short 135° arc.
    //
    // Exit angle (Hook A exits at PI/4): mirror → PI/2 - PI/4 = PI/4.
    // So exit point: (cx + R·cos(PI/4), cy + R·sin(PI/4)) = toward upper-right
    // But wait, Hook A entry is at PI (left), exit at PI/4 (upper-right).
    // Mirror: entry at -PI/2 (bottom), exit at PI/4 (upper-right).
    // We want entry from top (π/2 direction from center) and exit going down-right.
    // Entry at -PI/2 means the tangent point is BELOW center — that's wrong.
    // The tangent point should be ABOVE center (at π/2).
    //
    // I think the issue is that the mirror also affects which end is entry/exit.
    // For Hook A: bar enters from BELOW at the tangent pt (angle π from center = left).
    // For Hook B: bar enters from the RIGHT at the tangent pt.
    // The tangent pt for B is at (sxC+bendR, syC+shC) = above center (π/2 from center).
    // Angle π/2 from center IS in the arc range [-π/2, π/4]?
    //   π/2 is NOT between -π/2 and π/4... it's at the boundary.
    //   Actually the SHORT arc from -π/2 to π/4 goes: -π/2 → 0 → π/4 (135° CCW).
    //   π/2 is outside this range. So the tangent point is NOT on this arc.
    //
    // The problem is my mirror approach is geometrically wrong for this case.
    // Let me just directly compute Hook B geometry from scratch.
    //
    // Hook B: bar comes from the RIGHT along the top face (going LEFT = -X direction).
    // At the TL corner tangent point (sxC+bendR, syC+shC), the bar bends 135° into the core.
    // The bend goes INWARD = toward the column center.
    // Bend center: below-right of tangent point? No — the center should be on the
    // inside of the bend. Bar goes LEFT, bends downward → center is BELOW the bar.
    // Center: (sxC+bendR, syC+shC - hookR).
    // Tangent point is DIRECTLY ABOVE center → angle π/2 from center. ✓
    //
    // Now: bar arrives going LEFT at the tangent point (angle π/2 from center).
    // The bar direction at this point = LEFT = -X.
    // For a point at angle π/2 on a circle, moving CW means decreasing angle.
    // The tangent direction at π/2 going CW (decreasing angle) = -X direction ✓
    // (tangent CW at θ: (sin θ, -cos θ) → at π/2: (1, 0)... that's +X, not -X)
    // Hmm, tangent going CCW at θ: (-sin θ, cos θ) → at π/2: (-1, 0) = -X ✓
    // So the bar is moving CCW at the entry point π/2.
    //
    // For 135° bend going CCW from π/2:
    // End angle = π/2 + 3π/4 = 5π/4 (= -3π/4)
    // But 5π/4 = -3π/4, and we need start < end for short arc.
    // Range: from -3π/4 to π/2? That's -3π/4 < π/2 → short arc = 5π/4 = 225°. Too much!
    // Range: from π/2 to -3π/4? That's π/2 > -3π/4 → long arc. Also wrong.
    //
    // Hmm. Let me think about this differently.
    // For an ARC drawn with cad.carc(cx,cy,r,a1,a2) where a1<a2:
    //   render: ctx.arc(x,y,r,-a1,-a2,true) → -a1 > -a2 → short CCW arc.
    //   The arc spans from angle a1 to a2, going CCW in world (CW in screen).
    //   In WORLD coordinates (Y-up), this arc goes COUNTERCLOCKWISE from a1 to a2.
    //
    // Hook A (works correctly):
    //   Arc (PI/4, PI) → from PI/4 to PI going CCW in world = 135°.
    //   At π (left), tangent CCW = (-sinπ, cosπ) = (0, -1) = DOWN.
    //   The bar arrives going UP at the tangent point (angle π from center).
    //   UP is the REVERSE of the arc tangent (DOWN), meaning the bar is on the
    //   OTHER end of the arc — the bar arrives and the arc bends it.
    //   Actually: the bar enters at π going in the REVERSE direction of the arc.
    //   The arc CCW at π goes DOWN (-Y). The bar arrives going UP (+Y).
    //   So the bar enters at π FROM the previous straight segment (going up),
    //   and the arc bends it. At exit (PI/4), tangent CCW = (-sinPI/4, cosPI/4) = (-0.707, 0.707).
    //   The bar exits going in the arc tangent direction at PI/4 but...
    //   Wait, the extension direction is (0.707, -0.707), which is the REVERSE of the CCW tangent.
    //   So the convention is: the bar ENTERS at the HIGH end of the arc angles (π),
    //   and EXITS at the LOW end (π/4), going in the reverse-CCW = CW tangent direction.
    //   CW tangent at PI/4: (sinPI/4, -cosPI/4) = (0.707, -0.707) ✓
    //
    // So for Hook B:
    //   Bar enters at the HIGH angle end, exits at LOW angle end.
    //   Bar enters going LEFT (-X) at the tangent point on top face.
    //   Entry tangent: the bar going LEFT means the REVERSE of arc tangent is LEFT.
    //   Arc tangent CCW at entry angle θ_entry: (-sinθ, cosθ).
    //   Reverse: (sinθ, -cosθ) = (-1, 0) → sinθ=-1, -cosθ=0 → θ=-π/2 or 3π/2.
    //   But we need entry at the HIGH end. θ_entry = 3π/2 (or -π/2 + 2π = 3π/2).
    //   Hmm, but angles wrap. Using 3π/2:
    //   Exit angle = 3π/2 - 3π/4 = 3π/4. Range: (3π/4, 3π/2) with a1<a2 ✓
    //   Arc from 3π/4 to 3π/2 going CCW = 135°.
    //   Exit at 3π/4: CW tangent = (sin(3π/4), -cos(3π/4)) = (0.707, 0.707) = up-right.
    //   That's NOT down-right. Wrong direction!
    //
    // Let me try: entry going LEFT at angle π/2 (top of circle).
    //   Tangent CW at π/2: (sin(π/2), -cos(π/2)) = (1, 0) = RIGHT. Not LEFT.
    //   Tangent CCW at π/2: (-sin(π/2), cos(π/2)) = (-1, 0) = LEFT. ✓
    //   So arc direction at π/2 is CCW going LEFT. Entry is at HIGH end = π/2.
    //   135° CCW → exit at π/2 + 3π/4 = 5π/4.
    //   But we need a1 < a2, so range is (π/2, 5π/4).
    //   CW tangent at 5π/4: (sin(5π/4), -cos(5π/4)) = (-0.707, 0.707). Nope.
    //
    // OK I keep going in circles. Let me just use the MIRROR approach numerically.
    // Hook A works. I'll compute Hook B by reflecting Hook A's geometry.

    // Corner of stirrup CL = (sxC, syC + shC)
    // Hook A tangent pt relative to corner: (0, -bendR)
    // Hook A center relative to corner: (+hookR, -bendR)
    // Hook A exit outer relative to corner: (hookR + hookRO·cos45, -bendR + hookRO·sin45)
    // Hook A exit inner relative to corner: (hookR + hookRI·cos45, -bendR + hookRI·sin45)
    //
    // Mirror about y=x: (a,b) → (b,a)
    // Hook B tangent pt relative: (-bendR, 0)
    //   absolute: (sxC - bendR, syC + shC) — that's outside the column! Wrong.
    //
    // The mirror should be about the INWARD diagonal, not y=x.
    // Actually for the TL corner, the "inward" diagonal goes from TL toward center,
    // at angle -45° from horizontal (down-right). The mirror axis is the line
    // from the corner going at -45°.
    // Mirror about line y=-x: (a,b) → (-b,-a)
    // Hook A relative: tangent(0, -bendR) → mirror: (bendR, 0)
    //   absolute: (sxC + bendR, syC + shC) ✓ This is the tangent point on top face!
    // Hook A center(hookR, -bendR) → mirror: (bendR, -hookR)
    //   absolute: (sxC + bendR, syC + shC - hookR) ✓ Same as what I had before.
    //
    // Now the exit points:
    // Hook A exit outer: (hookR + hookRO·cos45, -bendR + hookRO·sin45)
    //   mirror: (-(-bendR + hookRO·sin45), -(hookR + hookRO·cos45))
    //   = (bendR - hookRO·sin45, -hookR - hookRO·cos45)
    //   absolute: (sxC + bendR - hookRO·SIN45, syC + shC - hookR - hookRO·COS45)
    //
    // Exit direction: Hook A = (cos45, -sin45) = (0.707, -0.707)
    //   mirror(-b,-a): (-(-0.707), -(0.707)) = (0.707, -0.707) — same! ✓
    //
    // Arc angles: Hook A is (PI/4, PI).
    //   Mirror about y=-x: θ → -(PI/2 + θ) + PI = PI/2 - θ ... actually
    //   for y=-x mirror: point at angle θ → point at angle -PI/2 - θ (mod 2π)
    //   = -(PI/2 + θ).
    //   PI/4 → -(PI/2 + PI/4) = -3PI/4
    //   PI → -(PI/2 + PI) = -3PI/2 = PI/2 (mod 2π)
    //   Range: (-3PI/4, PI/2) with -3PI/4 < PI/2 ✓

    var hkBcx = sxC + bendR;
    var hkBcy = syC + shC - hookR;

    cad.carc(hkBcx, hkBcy, hookRO, -PI*3/4, PI/2, c_stirrup);
    cad.carc(hkBcx, hkBcy, hookRI, -PI*3/4, PI/2, c_stirrup);

    // Exit point: mirrored from Hook A
    var eBx = sxC + bendR - hookRO * SIN45;
    var eBy = syC + shC - hookR - hookRO * COS45;
    var iBx = sxC + bendR - hookRI * SIN45;
    var iBy = syC + shC - hookR - hookRI * COS45;

    cad.line(eBx, eBy, eBx + hookExt*hDx, eBy + hookExt*hDy, c_stirrup);
    cad.line(iBx, iBy, iBx + hookExt*hDx, iBy + hookExt*hDy, c_stirrup);

    var capBx = (eBx + iBx)/2 + hookExt*hDx;
    var capBy = (eBy + iBy)/2 + hookExt*hDy;
    cad.carc(capBx, capBy, half, -PI*3/4, PI/4, c_stirrup);

    // ── LONGITUDINAL BARS ──
    // Corner bars: tangent to the curved inner face of the stirrup.
    // Intermediate bars: tangent to the straight inner face of the stirrup.
    var barR = dLong / 2;
    var barOpts = {fill: c_bar};

    // Offset for intermediate bars on straight faces:
    // center at rec + dS + barR from concrete face
    var barOff = rec + dS + barR;

    // CORNER BARS: tangent to inner stirrup arc
    // Inner arc centers at each corner:
    var acBLx = sxI + rI,        acBLy = syI + rI;
    var acBRx = sxI + swI - rI,  acBRy = syI + rI;
    var acTRx = sxI + swI - rI,  acTRy = syI + shI - rI;
    var acTLx = sxI + rI,        acTLy = syI + shI - rI;
    // Bar center = arc center + (rI + barR)/√2 toward concrete corner
    var cd = (rI + barR) * 0.70710678;

    cad.circle(acBLx - cd, acBLy - cd, barR, c_bar, barOpts);   // BL
    cad.circle(acBRx + cd, acBRy - cd, barR, c_bar, barOpts);   // BR
    cad.circle(acTRx + cd, acTRy + cd, barR, c_bar, barOpts);   // TR
    cad.circle(acTLx - cd, acTLy + cd, barR, c_bar, barOpts);   // TL

    // Intermediate bars on bottom/top (X direction) - uniform spacing
    if(nx > 2){
        var spacingX = (bw - 2*barOff) / (nx - 1);
        for(var ix = 1; ix < nx-1; ix++){
            var bx = x0 + barOff + ix * spacingX;
            cad.circle(bx, y0 + barOff, barR, c_bar, barOpts);       // bottom
            cad.circle(bx, y0 + bh - barOff, barR, c_bar, barOpts);  // top
        }
    }

    // Intermediate bars on left/right (Y direction) - uniform spacing
    if(ny > 2){
        var spacingY = (bh - 2*barOff) / (ny - 1);
        for(var iy = 1; iy < ny-1; iy++){
            var by = y0 + barOff + iy * spacingY;
            cad.circle(x0 + barOff, by, barR, c_bar, barOpts);       // left
            cad.circle(x0 + bw - barOff, by, barR, c_bar, barOpts);  // right
        }
    }

    // ── COTAS DE RADIO (diagnóstico) ──
    var c_dim = "#ffdd00";
    var dim45 = 0.70710678;

    // Esquina TR: cotas del estribo (no interfiere con ganchos en TL)
    var dimArcTRx = sxC + swC - bendR;
    var dimArcTRy = syC + shC - bendR;
    cad.dim(dimArcTRx, dimArcTRy, dimArcTRx + rI*dim45, dimArcTRy + rI*dim45, 2, "Ri=" + F(toU(rI)), c_dim);
    cad.dim(dimArcTRx, dimArcTRy, dimArcTRx + rO*dim45, dimArcTRy + rO*dim45, -2, "Ro=" + F(toU(rO)), c_dim);
    cad.dim(dimArcTRx, dimArcTRy, dimArcTRx + bendR*dim45, dimArcTRy + bendR*dim45, -5, "bendR=" + F(toU(bendR)), c_dim);

    // Barra TR: radio de la varilla longitudinal
    var barTRx = acTRx + cd;
    var barTRy = acTRy + cd;
    cad.dim(barTRx, barTRy, barTRx + barR, barTRy, 3, "Rbar=" + F(toU(barR)), c_dim);

    // Barra TL: radio de varilla (donde están los ganchos)
    var barTLx2 = acTLx - cd;
    var barTLy2 = acTLy + cd;
    cad.dim(barTLx2, barTLy2, barTLx2 - barR, barTLy2, -3, "Rbar=" + F(toU(barR)), c_dim);

    // Hook bend radius dimension (at hook B center)
    cad.dim(hkBcx, hkBcy, hkBcx, hkBcy + hookR, 3, "hookR=" + F(toU(hookR)), c_dim);

    // Hook extension length (diagonal cota from hook B exit)
    cad.dim(eBx, eBy, eBx + hookExt*dim45, eBy - hookExt*dim45, 4, "6db=" + F(toU(hookExt)), c_dim);

    log("  RADIOS: bendR=" + F(toU(bendR)) + " rI=" + F(toU(rI)) + " rO=" + F(toU(rO)) +
        " hookR=" + F(toU(hookR)) + " barR=" + F(toU(barR)) +
        " hookExt=6x" + F(toU(dS)) + "=" + F(toU(hookExt)) + " " + S.unidad);

    // Auto-group all shapes created by this function
    cad.endBatch();
    var _groupEnd = S.formas.length;
    if(_groupEnd > _groupStart){
        var children = [];
        for(var _gi = _groupStart; _gi < _groupEnd; _gi++){
            children.push(S.formas[_gi]);
        }
        // Remove individual shapes and replace with group
        S.formas.splice(_groupStart, _groupEnd - _groupStart);
        var grp = {tipo:"grupo", color:"#ffffff", z:0, children:children, hidden:false};
        S.formas.push(grp);
        refresh();
    }
    log("COLUMN SECTION " + bw + "x" + bh + " rec=" + rec + " φestr=" + dStirrup + " " + nx + "x" + ny + " bars φ" + dLong);
    return S.formas.length - 1;
};

// ── Parse text command (for the CLI textarea) ──
cad.exec = function(cmdText){
    var lines = cmdText.trim().split("\n");
    for(var li = 0; li < lines.length; li++){
        var raw = lines[li].trim();
        if(!raw || raw.charAt(0) === "#" || raw.charAt(0) === "'") continue;
        var tokens = raw.replace(/,/g, " ").replace(/\s+/g, " ").split(" ");
        var cmd = tokens[0].toLowerCase();
        var n = tokens.map(parseFloat);

        try {
            if(cmd === "line" || cmd === "l" || cmd === "linea")
                cad.line(n[1],n[2],n[3],n[4], tokens[5]);
            else if(cmd === "rect" || cmd === "r" || cmd === "rectangulo")
                cad.rect(n[1],n[2],n[3],n[4], tokens[5]);
            else if(cmd === "circle" || cmd === "c" || cmd === "circulo")
                cad.circle(n[1],n[2],n[3], tokens[4]);
            else if(cmd === "ellipse" || cmd === "e" || cmd === "elipse")
                cad.ellipse(n[1],n[2],n[3],n[4], tokens[5]);
            else if(cmd === "arc" || cmd === "a" || cmd === "arco")
                cad.arc(n[1],n[2],n[3],n[4],n[5],n[6], tokens[7]);
            else if(cmd === "carc")
                cad.carc(n[1],n[2],n[3],n[4],n[5], tokens[6]);
            else if(cmd === "pline" || cmd === "pl" || cmd === "polilinea")
                cad.pline(n.slice(1));
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
            else if(cmd === "dim" || cmd === "cota")
                cad.dim(n[1],n[2],n[3],n[4],n[5],tokens[6]);
            else if(cmd === "hdim" || cmd === "cotah")
                cad.hdim(n[1],n[2],n[3],n[4],n[5],tokens[6]);
            else if(cmd === "vdim" || cmd === "cotav")
                cad.vdim(n[1],n[2],n[3],n[4],n[5],tokens[6]);
            else if(cmd === "adim" || cmd === "cotaa")
                cad.adim(n[1],n[2],n[3],n[4],n[5],tokens[6]);
            else if(cmd === "zoom") cad.zoom(n[1]||1.5);
            else if(cmd === "zoomin" || cmd === "zi") cad.zoomin();
            else if(cmd === "zoomout" || cmd === "zo") cad.zoomout();
            else if(cmd === "pan") cad.pan(n[1]||0, n[2]||0);
            else if(cmd === "zoomto" || cmd === "zt") cad.zoomto(n[1]||0, n[2]||0, n[3]);
            else if(cmd === "save") cad.save(tokens[1]);
            else if(cmd === "load") cad.load();
            // Structural commands
            else if(cmd === "rrect")
                cad.rrect(n[1],n[2],n[3],n[4],n[5], tokens[6]);
            else if(cmd === "stirrup" || cmd === "estribo")
                cad.stirrup(n[1],n[2],n[3],n[4],n[5],n[6], tokens[7]);
            else if(cmd === "colsection" || cmd === "columna" || cmd === "columnsection")
                cad.columnSection(n[1],n[2],n[3],n[4],n[5],n[6],n[7],n[8],n[9],n[10]);
            // IFC commands
            else if(cmd === "ifc"){
                if(window._ifcExec){
                    var res = window._ifcExec(tokens.slice(1));
                    if(res) log(res);
                } else { log("IFC module not loaded"); }
            }
            else if(cmd === "help" || cmd === "?") cad.help();
            // IFC alias: try resolving command as IFC type name
            // e.g. "wall hide", "beam show", "slab isolate", "column color #ff0"
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

// ── SERIALIZATION: toJSON / fromJSON / save / load ──

// Convert a single shape from pixel coords to user-unit coords
function shapeToUser(f){
    var o = {type: f.tipo, color: f.color || "#ffffff"};
    if(f.z) o.z = toU(f.z);
    if(f.lw) o.lw = f.lw;
    if(f.fill) o.fill = f.fill;
    if(f.hidden) o.hidden = true;

    if(f.tipo === "linea"){
        o.x1=toU(f.x1); o.y1=toU(f.y1); o.x2=toU(f.x2); o.y2=toU(f.y2);
        if(f.z1) o.z1=toU(f.z1);
        if(f.z2) o.z2=toU(f.z2);
    } else if(f.tipo === "rectangulo"){
        o.x=toU(f.x); o.y=toU(f.y); o.w=toU(f.w); o.h=toU(f.h);
    } else if(f.tipo === "circulo"){
        o.cx=toU(f.cx); o.cy=toU(f.cy); o.r=toU(f.r);
    } else if(f.tipo === "elipse"){
        o.cx=toU(f.cx); o.cy=toU(f.cy); o.rx=toU(f.rx); o.ry=toU(f.ry);
    } else if(f.tipo === "arco"){
        o.x1=toU(f.x1); o.y1=toU(f.y1); o.cx=toU(f.cx); o.cy=toU(f.cy); o.x2=toU(f.x2); o.y2=toU(f.y2);
    } else if(f.tipo === "arco_circular"){
        o.cx=toU(f.cx); o.cy=toU(f.cy); o.r=toU(f.r);
        o.startAngle=f.startAngle; o.endAngle=f.endAngle;
    } else if((f.tipo === "polilinea" || f.tipo === "mano") && f.pts){
        o.pts = f.pts.map(function(p){ return {x:toU(p.x), y:toU(p.y), z:p.z?toU(p.z):0}; });
    } else if(f.tipo === "cota"){
        o.x1=toU(f.x1); o.y1=toU(f.y1); o.x2=toU(f.x2); o.y2=toU(f.y2);
        o.offset=toU(f.offset||0);
        if(f.text) o.text=f.text;
    } else if(f.tipo === "grupo" && f.children){
        o.children = f.children.map(shapeToUser);
    }
    return o;
}

// Convert a single shape from user-unit coords to pixel coords
function shapeFromUser(o){
    var f = {tipo: o.type, color: o.color || "#ffffff"};
    if(o.z) f.z = px(o.z);
    if(o.lw) f.lw = o.lw;
    if(o.fill) f.fill = o.fill;
    if(o.hidden) f.hidden = true;

    if(o.type === "linea"){
        f.x1=px(o.x1); f.y1=px(o.y1); f.x2=px(o.x2); f.y2=px(o.y2);
        if(o.z1) f.z1=px(o.z1);
        if(o.z2) f.z2=px(o.z2);
        f.z = px(o.z||0);
    } else if(o.type === "rectangulo"){
        f.x=px(o.x); f.y=px(o.y); f.w=px(o.w); f.h=px(o.h);
    } else if(o.type === "circulo"){
        f.cx=px(o.cx); f.cy=px(o.cy); f.r=px(o.r);
    } else if(o.type === "elipse"){
        f.cx=px(o.cx); f.cy=px(o.cy); f.rx=px(o.rx); f.ry=px(o.ry);
    } else if(o.type === "arco"){
        f.x1=px(o.x1); f.y1=px(o.y1); f.cx=px(o.cx); f.cy=px(o.cy); f.x2=px(o.x2); f.y2=px(o.y2);
    } else if(o.type === "arco_circular"){
        f.cx=px(o.cx); f.cy=px(o.cy); f.r=px(o.r);
        f.startAngle=o.startAngle; f.endAngle=o.endAngle;
    } else if((o.type === "polilinea" || o.type === "mano") && o.pts){
        f.pts = o.pts.map(function(p){ return {x:px(p.x), y:px(p.y), z:p.z?px(p.z):0}; });
    } else if(o.type === "cota"){
        f.x1=px(o.x1); f.y1=px(o.y1); f.x2=px(o.x2); f.y2=px(o.y2);
        f.offset=px(o.offset||0);
        if(o.text) f.text=o.text;
    } else if(o.type === "grupo" && o.children){
        f.children = o.children.map(shapeFromUser);
    }
    return f;
}

// Export all shapes as portable JSON (user units)
cad.toJSON = function(){
    return {
        version: 1,
        unit: S.unidad,
        scale: S.escala,
        color: S.currentColor,
        z: toU(S.currentZ),
        shapes: S.formas.map(shapeToUser)
    };
};

// Import shapes from JSON (replaces current state)
cad.fromJSON = function(data){
    if(!data || !data.shapes){ log("ERROR: invalid JSON data"); return; }
    saveHist();
    if(data.unit) set("unidad", data.unit);
    if(data.scale) set("escala", data.scale);
    if(data.color) set("currentColor", data.color);
    if(data.z) set("currentZ", px(data.z));
    S.formas.length = 0;
    for(var i = 0; i < data.shapes.length; i++){
        S.formas.push(shapeFromUser(data.shapes[i]));
    }
    set("formaSel", -1);
    invalidateSnapCache();
    saveHist();
    redraw(); updTree(); showProps(-1);
    log("LOADED " + S.formas.length + " shapes from JSON");
};

// Save state to file download (browser)
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

// Load state from file picker (browser)
cad.load = function(){
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.addEventListener("change", function(){
        if(!input.files[0]) return;
        var reader = new FileReader();
        reader.onload = function(e){
            try {
                var data = JSON.parse(e.target.result);
                cad.fromJSON(data);
            } catch(err){
                log("ERROR loading file: " + err.message);
            }
        };
        reader.readAsText(input.files[0]);
    });
    input.click();
};

// ── Init CLI panel ──
export function initCLI(){
    cliOutput = document.getElementById("cliOutput");
    var cliInput = document.getElementById("cliInput");
    var cliRun = document.getElementById("cliRun");

    if(!cliInput || !cliOutput) {
        console.warn("CLI elements not found in DOM");
        return;
    }

    cliRun.addEventListener("click", function(){
        var cmd = cliInput.value.trim();
        if(cmd){ cad.exec(cmd); cliInput.value = ""; }
    });

    cliInput.addEventListener("keydown", function(e){
        if(e.key === "Enter" && !e.shiftKey){
            e.preventDefault();
            var cmd = cliInput.value.trim();
            if(cmd){ cad.exec(cmd); cliInput.value = ""; }
        }
    });

    // Expose globally
    window.cad = cad;
    log("Calcpad CAD CLI ready. Type 'help' or use cad.help()");
}
