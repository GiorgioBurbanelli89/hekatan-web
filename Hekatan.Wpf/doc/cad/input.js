// ===================== INPUT.JS - Layer 6 =====================
// Mouse events, keyboard events, hit testing, zoom fit
"use strict";

import * as S from './state.js';
import { set, callbacks } from './state.js';
import { canvas, ctx, canvasArea, stX, stY, stZ, stLen, stAng, stSnap,
         inputX, inputY, inputZ, coordOverlay, dynXInput } from './dom.js';
import { D, Ang, toU, toPx, F, orthoSnap, gridSnapPt } from './math.js';
import { w2s, s2w, proj3to2, unproj2to3 } from './projection.js';
import { findSnap, drawSnapMarker, getTrackingLines, drawTrackingLines, applyTracking, invalidateSnapCache } from './snap.js';
import { redraw, drawSelectionBox } from './render.js';
import { saveHist } from './history.js';
import { updTree, selectShape, showProps } from './panels.js';
import { updateDynPos, showDynInput, updateDynValues } from './dynamic-input.js';

// ── Helper: get world/screen coords from mouse event ──
function getWorld(e){
    var r = canvas.getBoundingClientRect();
    return s2w(e.clientX - r.left, e.clientY - r.top);
}
function getScreen(e){
    var r = canvas.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
}

// ── Hit test: find shape under projected cursor ──
export function hitTest(wx, wy){
    var tol = 8 / S.cam.zoom;
    for(var i = S.formas.length - 1; i >= 0; i--){
        var f = S.formas[i]; if(f.hidden) continue;
        var fz = f.z||0;
        if(f.tipo==="linea"){
            var hp1=proj3to2(f.x1,f.y1,f.z1||fz), hp2=proj3to2(f.x2,f.y2,f.z2||fz);
            var dx=hp2.x-hp1.x, dy=hp2.y-hp1.y, len=dx*dx+dy*dy; if(len===0) continue;
            var u=Math.max(0,Math.min(1,((wx-hp1.x)*dx+(wy-hp1.y)*dy)/len));
            if(D(wx,wy,hp1.x+u*dx,hp1.y+u*dy)<tol) return i;
        } else if(f.tipo==="rectangulo"){
            var hr=proj3to2(f.x,f.y,fz), hr2=proj3to2(f.x+f.w,f.y+f.h,fz);
            var rx=Math.min(hr.x,hr2.x), ry=Math.min(hr.y,hr2.y), rw=Math.abs(hr2.x-hr.x), rh=Math.abs(hr2.y-hr.y);
            if(wx>=rx-tol&&wx<=rx+rw+tol&&wy>=ry-tol&&wy<=ry+rh+tol){
                if(Math.abs(wx-rx)<tol||Math.abs(wx-rx-rw)<tol||Math.abs(wy-ry)<tol||Math.abs(wy-ry-rh)<tol) return i;
                if(wx>=rx&&wx<=rx+rw&&wy>=ry&&wy<=ry+rh) return i;
            }
        } else if(f.tipo==="circulo"){
            var hc=proj3to2(f.cx,f.cy,fz);
            if(Math.abs(D(wx,wy,hc.x,hc.y)-f.r)<tol||D(wx,wy,hc.x,hc.y)<f.r) return i;
        } else if(f.tipo==="elipse"){
            var he=proj3to2(f.cx,f.cy,fz);
            var ex=(wx-he.x)/f.rx, ey=(wy-he.y)/f.ry, ev=ex*ex+ey*ey;
            if(Math.abs(ev-1)<0.3||ev<1) return i;
        } else if(f.tipo==="arco_circular"){
            var hac=proj3to2(f.cx,f.cy,fz);
            if(Math.abs(D(wx,wy,hac.x,hac.y)-f.r)<tol){
                var ang=Math.atan2(wy-hac.y, wx-hac.x);
                if(ang<0) ang+=Math.PI*2;
                var sa=f.startAngle, ea=f.endAngle;
                if(sa<0) sa+=Math.PI*2; if(ea<0) ea+=Math.PI*2;
                if(sa<=ea){ if(ang>=sa-0.1&&ang<=ea+0.1) return i; }
                else{ if(ang>=sa-0.1||ang<=ea+0.1) return i; }
            }
        } else if(f.tipo==="polilinea"||f.tipo==="mano"){
            for(var j=1;j<f.pts.length;j++){
                var hpp1=proj3to2(f.pts[j-1].x,f.pts[j-1].y,f.pts[j-1].z||fz);
                var hpp2=proj3to2(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
                var ldx=hpp2.x-hpp1.x, ldy=hpp2.y-hpp1.y, ll=ldx*ldx+ldy*ldy;
                if(ll===0) continue;
                var lu=Math.max(0,Math.min(1,((wx-hpp1.x)*ldx+(wy-hpp1.y)*ldy)/ll));
                if(D(wx,wy,hpp1.x+lu*ldx,hpp1.y+lu*ldy)<tol) return i;
            }
        } else if(f.tipo==="cota"){
            // Hit test dimension line (between projected endpoints at offset)
            var dp1=proj3to2(f.x1,f.y1,fz), dp2=proj3to2(f.x2,f.y2,fz);
            var ddx=dp2.x-dp1.x, ddy=dp2.y-dp1.y, dlen=Math.sqrt(ddx*ddx+ddy*ddy);
            if(dlen>0){
                var dnx=-ddy/dlen, dny=ddx/dlen;
                var doff=f.offset||10;
                var od1x=dp1.x+dnx*doff, od1y=dp1.y+dny*doff;
                var od2x=dp2.x+dnx*doff, od2y=dp2.y+dny*doff;
                var odx=od2x-od1x, ody=od2y-od1y, ol2=odx*odx+ody*ody;
                if(ol2>0){
                    var ou=Math.max(0,Math.min(1,((wx-od1x)*odx+(wy-od1y)*ody)/ol2));
                    if(D(wx,wy,od1x+ou*odx,od1y+ou*ody)<tol) return i;
                }
            }
            // Also hit test near measurement points
            if(D(wx,wy,dp1.x,dp1.y)<tol || D(wx,wy,dp2.x,dp2.y)<tol) return i;
        } else if(f.tipo==="grupo"&&f.children){
            // Hit test group children - if any child hit, return group index
            if(hitTestGroup(f, wx, wy, tol)) return i;
        }
    }
    return -1;
}

// ── Hit test inside a group (recursive) ──
function hitTestGroup(grp, wx, wy, tol){
    for(var i=grp.children.length-1; i>=0; i--){
        var f=grp.children[i]; if(f.hidden) continue;
        var fz=f.z||0;
        if(f.tipo==="grupo"&&f.children){ if(hitTestGroup(f,wx,wy,tol)) return true; continue; }
        if(f.tipo==="linea"){
            var hp1={x:f.x1,y:f.y1}, hp2={x:f.x2,y:f.y2};
            var dx=hp2.x-hp1.x, dy=hp2.y-hp1.y, len=dx*dx+dy*dy; if(len===0) continue;
            var u=Math.max(0,Math.min(1,((wx-hp1.x)*dx+(wy-hp1.y)*dy)/len));
            if(D(wx,wy,hp1.x+u*dx,hp1.y+u*dy)<tol) return true;
        } else if(f.tipo==="rectangulo"){
            var rx=f.x, ry=f.y, rw=f.w, rh=f.h;
            if(wx>=rx-tol&&wx<=rx+rw+tol&&wy>=ry-tol&&wy<=ry+rh+tol) return true;
        } else if(f.tipo==="circulo"){
            if(Math.abs(D(wx,wy,f.cx,f.cy)-f.r)<tol||D(wx,wy,f.cx,f.cy)<f.r) return true;
        } else if(f.tipo==="arco_circular"){
            if(Math.abs(D(wx,wy,f.cx,f.cy)-f.r)<tol) return true;
        } else if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
            for(var j=1;j<f.pts.length;j++){
                var p1=f.pts[j-1], p2=f.pts[j];
                var ldx=p2.x-p1.x, ldy=p2.y-p1.y, ll=ldx*ldx+ldy*ldy;
                if(ll===0) continue;
                var lu=Math.max(0,Math.min(1,((wx-p1.x)*ldx+(wy-p1.y)*ldy)/ll));
                if(D(wx,wy,p1.x+lu*ldx,p1.y+lu*ldy)<tol) return true;
            }
        }
    }
    return false;
}

// ── Shape bounding box (projected 2D) ──
function shapeBounds(f){
    var fz = f.z||0;
    var minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    function exp(x3,y3,z3){
        var p=proj3to2(x3,y3,z3);
        if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x;
        if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y;
    }
    if(f.tipo==="linea"){ exp(f.x1,f.y1,f.z1||fz); exp(f.x2,f.y2,f.z2||fz); }
    else if(f.tipo==="rectangulo"){ exp(f.x,f.y,fz); exp(f.x+f.w,f.y+f.h,fz); }
    else if(f.tipo==="circulo"){ exp(f.cx-f.r,f.cy-f.r,fz); exp(f.cx+f.r,f.cy+f.r,fz); }
    else if(f.tipo==="elipse"){ exp(f.cx-f.rx,f.cy-f.ry,fz); exp(f.cx+f.rx,f.cy+f.ry,fz); }
    else if(f.tipo==="arco_circular"){ exp(f.cx-f.r,f.cy-f.r,fz); exp(f.cx+f.r,f.cy+f.r,fz); }
    else if(f.tipo==="arco"){ exp(f.x1,f.y1,fz); exp(f.x2,f.y2,fz); exp(f.cx,f.cy,fz); }
    else if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
        for(var j=0;j<f.pts.length;j++) exp(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
    }
    else if(f.tipo==="cota"){ exp(f.x1,f.y1,fz); exp(f.x2,f.y2,fz); }
    else if(f.tipo==="grupo"&&f.children){
        for(var gi=0;gi<f.children.length;gi++){
            var cb=shapeBounds(f.children[gi]);
            if(cb.minX<minX)minX=cb.minX; if(cb.maxX>maxX)maxX=cb.maxX;
            if(cb.minY<minY)minY=cb.minY; if(cb.maxY>maxY)maxY=cb.maxY;
        }
    }
    return {minX:minX, maxX:maxX, minY:minY, maxY:maxY};
}

// ── Test if line segment intersects rectangle ──
function lineIntersectsRect(x1,y1,x2,y2, rx,ry,rw,rh){
    // Cohen-Sutherland style: check if line crosses any edge of rect
    var rx2=rx+rw, ry2=ry+rh;
    // If either endpoint is inside rect
    if(x1>=rx&&x1<=rx2&&y1>=ry&&y1<=ry2) return true;
    if(x2>=rx&&x2<=rx2&&y2>=ry&&y2<=ry2) return true;
    // Check intersection with each edge
    function segCross(ax,ay,bx,by,cx,cy,dx,dy){
        var d1=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
        var d2=(bx-ax)*(dy-ay)-(by-ay)*(dx-ax);
        var d3=(dx-cx)*(ay-cy)-(dy-cy)*(ax-cx);
        var d4=(dx-cx)*(by-cy)-(dy-cy)*(bx-cx);
        if(((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0))) return true;
        return false;
    }
    if(segCross(x1,y1,x2,y2, rx,ry,rx2,ry)) return true;   // bottom
    if(segCross(x1,y1,x2,y2, rx2,ry,rx2,ry2)) return true;  // right
    if(segCross(x1,y1,x2,y2, rx2,ry2,rx,ry2)) return true;  // top
    if(segCross(x1,y1,x2,y2, rx,ry2,rx,ry)) return true;    // left
    return false;
}

// ── Test if shape is fully inside selection rect (Window mode) ──
function shapeInsideRect(f, rx, ry, rw, rh){
    var b = shapeBounds(f);
    return b.minX>=rx && b.maxX<=rx+rw && b.minY>=ry && b.maxY<=ry+rh;
}

// ── Test if shape crosses/touches selection rect (Crossing mode) ──
function shapeCrossesRect(f, rx, ry, rw, rh){
    var b = shapeBounds(f);
    // Quick reject: no bounding box overlap
    if(b.maxX<rx || b.minX>rx+rw || b.maxY<ry || b.minY>ry+rh) return false;
    // If fully inside, it crosses too
    if(b.minX>=rx && b.maxX<=rx+rw && b.minY>=ry && b.maxY<=ry+rh) return true;
    // Check specific geometry for line intersection
    var fz = f.z||0;
    if(f.tipo==="linea"){
        var p1=proj3to2(f.x1,f.y1,f.z1||fz), p2=proj3to2(f.x2,f.y2,f.z2||fz);
        return lineIntersectsRect(p1.x,p1.y,p2.x,p2.y, rx,ry,rw,rh);
    }
    if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
        for(var j=1;j<f.pts.length;j++){
            var pp1=proj3to2(f.pts[j-1].x,f.pts[j-1].y,f.pts[j-1].z||fz);
            var pp2=proj3to2(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
            if(lineIntersectsRect(pp1.x,pp1.y,pp2.x,pp2.y, rx,ry,rw,rh)) return true;
        }
        return false;
    }
    // For circles, rectangles, arcs - bounding box overlap is good enough
    return true;
}

// ── Select shapes using Window or Crossing box ──
function selectByBox(x1,y1,x2,y2){
    var leftToRight = (x2 >= x1);
    var rx = Math.min(x1,x2), ry = Math.min(y1,y2);
    var rw = Math.abs(x2-x1), rh = Math.abs(y2-y1);
    var sel = [];
    for(var i=0; i<S.formas.length; i++){
        if(S.formas[i].hidden) continue;
        if(leftToRight){
            // Window: fully inside
            if(shapeInsideRect(S.formas[i], rx, ry, rw, rh)) sel.push(i);
        } else {
            // Crossing: touches or crosses
            if(shapeCrossesRect(S.formas[i], rx, ry, rw, rh)) sel.push(i);
        }
    }
    return sel;
}

// ── Deep clone a shape ──
function cloneShape(f){
    return JSON.parse(JSON.stringify(f));
}

// ── Move shape by delta ──
function moveShape(f, dx, dy){
    if(f.tipo==="linea"){ f.x1+=dx; f.y1+=dy; f.x2+=dx; f.y2+=dy; }
    else if(f.tipo==="rectangulo"){ f.x+=dx; f.y+=dy; }
    else if(f.tipo==="circulo"){ f.cx+=dx; f.cy+=dy; }
    else if(f.tipo==="elipse"){ f.cx+=dx; f.cy+=dy; }
    else if(f.tipo==="arco"){ f.x1+=dx; f.y1+=dy; f.cx+=dx; f.cy+=dy; f.x2+=dx; f.y2+=dy; }
    else if(f.tipo==="arco_circular"){ f.cx+=dx; f.cy+=dy; }
    else if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
        for(var j=0;j<f.pts.length;j++){ f.pts[j].x+=dx; f.pts[j].y+=dy; }
    }
    else if(f.tipo==="cota"){ f.x1+=dx; f.y1+=dy; f.x2+=dx; f.y2+=dy; }
    else if(f.tipo==="grupo"&&f.children){
        for(var gi=0;gi<f.children.length;gi++) moveShape(f.children[gi],dx,dy);
    }
}

// ── Scale shape from center ──
function scaleShape(f, factor, cx, cy){
    function sc(x,y){ return {x: cx+(x-cx)*factor, y: cy+(y-cy)*factor}; }
    if(f.tipo==="linea"){
        var p1=sc(f.x1,f.y1), p2=sc(f.x2,f.y2);
        f.x1=p1.x; f.y1=p1.y; f.x2=p2.x; f.y2=p2.y;
    } else if(f.tipo==="rectangulo"){
        var o=sc(f.x,f.y); f.x=o.x; f.y=o.y; f.w*=factor; f.h*=factor;
    } else if(f.tipo==="circulo"){
        var c=sc(f.cx,f.cy); f.cx=c.x; f.cy=c.y; f.r*=factor;
    } else if(f.tipo==="elipse"){
        var e=sc(f.cx,f.cy); f.cx=e.x; f.cy=e.y; f.rx*=factor; f.ry*=factor;
    } else if(f.tipo==="arco"){
        var a1=sc(f.x1,f.y1), ac=sc(f.cx,f.cy), a2=sc(f.x2,f.y2);
        f.x1=a1.x; f.y1=a1.y; f.cx=ac.x; f.cy=ac.y; f.x2=a2.x; f.y2=a2.y;
    } else if(f.tipo==="arco_circular"){
        var ac2=sc(f.cx,f.cy); f.cx=ac2.x; f.cy=ac2.y; f.r*=factor;
    } else if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
        for(var j=0;j<f.pts.length;j++){
            var p=sc(f.pts[j].x,f.pts[j].y);
            f.pts[j].x=p.x; f.pts[j].y=p.y;
        }
    } else if(f.tipo==="cota"){
        var p1=sc(f.x1,f.y1), p2=sc(f.x2,f.y2);
        f.x1=p1.x; f.y1=p1.y; f.x2=p2.x; f.y2=p2.y;
    } else if(f.tipo==="grupo"&&f.children){
        for(var gi=0;gi<f.children.length;gi++) scaleShape(f.children[gi],factor,cx,cy);
    }
}

// ── Get center of shapes for reference ──
function shapesCenter(indices){
    var sx=0, sy=0, n=0;
    for(var i=0;i<indices.length;i++){
        var b = shapeBounds(S.formas[indices[i]]);
        sx+=(b.minX+b.maxX)/2; sy+=(b.minY+b.maxY)/2; n++;
    }
    return n>0 ? {x:sx/n, y:sy/n} : {x:0, y:0};
}

// ── Get selected indices (multi or single) ──
function getSelection(){
    if(S.selectedShapes && S.selectedShapes.length > 0) return S.selectedShapes.slice();
    if(S.formaSel >= 0) return [S.formaSel];
    return [];
}

// ── Line-line intersection for trim ──
function lineLineIntersect(ax1,ay1,ax2,ay2, bx1,by1,bx2,by2){
    var dx1=ax2-ax1, dy1=ay2-ay1, dx2=bx2-bx1, dy2=by2-by1;
    var den=dx1*dy2-dy1*dx2;
    if(Math.abs(den)<1e-10) return null;
    var t=((bx1-ax1)*dy2-(by1-ay1)*dx2)/den;
    var u=((bx1-ax1)*dy1-(by1-ay1)*dx1)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1) return {x:ax1+t*dx1, y:ay1+t*dy1, t:t, u:u};
    return null;
}

// ── Trim: cut a line at nearest intersection ──
function trimLine(lineIdx, clickX, clickY){
    var f = S.formas[lineIdx];
    if(f.tipo!=="linea") return false;
    // Find all intersections with other lines
    var ints = [];
    for(var i=0;i<S.formas.length;i++){
        if(i===lineIdx || S.formas[i].hidden) continue;
        var g = S.formas[i];
        if(g.tipo==="linea"){
            var ip = lineLineIntersect(f.x1,f.y1,f.x2,f.y2, g.x1,g.y1,g.x2,g.y2);
            if(ip) ints.push(ip);
        } else if((g.tipo==="polilinea")&&g.pts){
            for(var j=1;j<g.pts.length;j++){
                var ip2 = lineLineIntersect(f.x1,f.y1,f.x2,f.y2, g.pts[j-1].x,g.pts[j-1].y,g.pts[j].x,g.pts[j].y);
                if(ip2) ints.push(ip2);
            }
        } else if(g.tipo==="rectangulo"){
            var rx=g.x,ry=g.y,rw=g.w,rh=g.h;
            var edges=[[rx,ry,rx+rw,ry],[rx+rw,ry,rx+rw,ry+rh],[rx+rw,ry+rh,rx,ry+rh],[rx,ry+rh,rx,ry]];
            for(var ei=0;ei<edges.length;ei++){
                var ip3=lineLineIntersect(f.x1,f.y1,f.x2,f.y2, edges[ei][0],edges[ei][1],edges[ei][2],edges[ei][3]);
                if(ip3) ints.push(ip3);
            }
        }
    }
    if(ints.length===0) return false;
    // Sort intersections by t parameter
    ints.sort(function(a,b){ return a.t-b.t; });
    // Find which segment the click is in
    var dx=f.x2-f.x1, dy=f.y2-f.y1, len2=dx*dx+dy*dy;
    var clickT = len2>0 ? ((clickX-f.x1)*dx+(clickY-f.y1)*dy)/len2 : 0;
    // Find the two nearest intersections bounding clickT
    var tBefore=0, tAfter=1;
    for(var k=0;k<ints.length;k++){
        if(ints[k].t <= clickT && ints[k].t > tBefore) tBefore=ints[k].t;
        if(ints[k].t >= clickT && ints[k].t < tAfter) tAfter=ints[k].t;
    }
    // Remove the clicked segment, keep the rest
    saveHist();
    var keepParts = [];
    if(tBefore > 0.001) keepParts.push({x1:f.x1,y1:f.y1,x2:f.x1+tBefore*dx,y2:f.y1+tBefore*dy});
    if(tAfter < 0.999) keepParts.push({x1:f.x1+tAfter*dx,y1:f.y1+tAfter*dy,x2:f.x2,y2:f.y2});
    // Replace original line with keep parts
    S.formas.splice(lineIdx,1);
    for(var pi=0;pi<keepParts.length;pi++){
        S.formas.splice(lineIdx+pi,0,{
            tipo:"linea",x1:keepParts[pi].x1,y1:keepParts[pi].y1,
            x2:keepParts[pi].x2,y2:keepParts[pi].y2,z:f.z||0,color:f.color
        });
    }
    saveHist();
    return true;
}

// ── Zoom Fit ──
export function zoomFit(){
    if(S.formas.length===0){ S.cam.x=0; S.cam.y=0; S.cam.zoom=1; redraw(); return; }
    var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    function expandBounds(x3,y3,z3){
        var p=proj3to2(x3,y3,z3);
        minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
        minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
    }
    function expandShape(f){
        var fz=f.z||0;
        if(f.tipo==="linea"){ expandBounds(f.x1,f.y1,f.z1||fz); expandBounds(f.x2,f.y2,f.z2||fz); }
        else if(f.tipo==="rectangulo"){ expandBounds(f.x,f.y,fz); expandBounds(f.x+f.w,f.y+f.h,fz); }
        else if(f.tipo==="circulo"){ expandBounds(f.cx-f.r,f.cy-f.r,fz); expandBounds(f.cx+f.r,f.cy+f.r,fz); }
        else if(f.tipo==="arco_circular"){ expandBounds(f.cx-f.r,f.cy-f.r,fz); expandBounds(f.cx+f.r,f.cy+f.r,fz); }
        else if(f.tipo==="elipse"){ expandBounds(f.cx-f.rx,f.cy-f.ry,fz); expandBounds(f.cx+f.rx,f.cy+f.ry,fz); }
        else if(f.tipo==="arco"){ expandBounds(f.x1,f.y1,fz); expandBounds(f.x2,f.y2,fz); expandBounds(f.cx,f.cy,fz); }
        else if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
            for(var j=0;j<f.pts.length;j++) expandBounds(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
        }
        else if(f.tipo==="cota"){ expandBounds(f.x1,f.y1,fz); expandBounds(f.x2,f.y2,fz); }
        else if(f.tipo==="grupo"&&f.children){
            for(var gi=0;gi<f.children.length;gi++) expandShape(f.children[gi]);
        }
    }
    for(var i=0;i<S.formas.length;i++) expandShape(S.formas[i]);
    if(minX===Infinity) return;
    var bw=maxX-minX, bh=maxY-minY;
    if(bw<1) bw=100; if(bh<1) bh=100;
    S.cam.x=(minX+maxX)/2; S.cam.y=(minY+maxY)/2;
    S.cam.zoom=Math.min((canvas.width*0.85)/bw, (canvas.height*0.85)/bh);
    S.cam.zoom=Math.max(S.cam.minZoom,Math.min(S.cam.maxZoom,S.cam.zoom));
    redraw();
}

// ── Resize canvas to fill area ──
export function resizeCanvas(){
    canvas.width = canvasArea.clientWidth;
    canvas.height = canvasArea.clientHeight;
    redraw();
}

// ── Bind all 2D canvas events ──
export function initCanvasEvents(){

    // Zoom with wheel
    canvas.addEventListener("wheel", function(e){
        e.preventDefault();
        var sp = getScreen(e);
        var wBefore = s2w(sp.x, sp.y);
        var factor = e.deltaY < 0 ? 1.15 : 1/1.15;
        S.cam.zoom *= factor;
        S.cam.zoom = Math.max(S.cam.minZoom, Math.min(S.cam.maxZoom, S.cam.zoom));
        var wAfter = s2w(sp.x, sp.y);
        S.cam.x += wBefore.x - wAfter.x;
        S.cam.y += wBefore.y - wAfter.y;
        redraw();
    }, {passive: false});

    // Mouse down
    canvas.addEventListener("mousedown", function(e){
        canvas.focus();

        if(e.button === 1 || (e.button === 0 && S.modo === "pan")){
            e.preventDefault();
            set("isPanning", true);
            set("panStart", getScreen(e));
            set("panCamStart", {x: S.cam.x, y: S.cam.y});
            canvas.style.cursor = "grabbing";
            return;
        }

        if(e.button !== 0) return;

        var wp = getWorld(e);
        var wx = wp.x, wy = wp.y;

        var sp = findSnap(wx,wy);
        if(sp){ wx=sp.x; wy=sp.y; }
        var gp = gridSnapPt(wx,wy);
        wx=gp.x; wy=gp.y;

        // Handle edit operations (move, paste, trim, scale)
        if(S.editOp){
            if(S.editOp==="move"){
                if(!S.editBase){
                    set("editBase", {x:wx, y:wy});
                    callbacks.flash?.("Mover: click punto destino");
                } else {
                    var mdx=wx-S.editBase.x, mdy=wy-S.editBase.y;
                    saveHist();
                    for(var mi=0;mi<S.editTarget.length;mi++) moveShape(S.formas[S.editTarget[mi]], mdx, mdy);
                    saveHist(); redraw(); updTree();
                    callbacks.flash?.("Movido: " + S.editTarget.length + " obj");
                    set("editOp",null); set("editBase",null); set("editTarget",null);
                }
                return;
            }
            if(S.editOp==="paste"){
                if(!S.editBase){
                    // First click = base/anchor (center of clipboard)
                    set("editBase", {x:wx, y:wy});
                    // Calculate clipboard center
                    var cMinX=Infinity,cMaxX=-Infinity,cMinY=Infinity,cMaxY=-Infinity;
                    for(var pci=0;pci<S.editTarget.length;pci++){
                        var pb=shapeBounds(S.editTarget[pci]);
                        if(pb.minX<cMinX)cMinX=pb.minX; if(pb.maxX>cMaxX)cMaxX=pb.maxX;
                        if(pb.minY<cMinY)cMinY=pb.minY; if(pb.maxY>cMaxY)cMaxY=pb.maxY;
                    }
                    var pcx=(cMinX+cMaxX)/2, pcy=(cMinY+cMaxY)/2;
                    var pdx=wx-pcx, pdy=wy-pcy;
                    saveHist();
                    var newSel2=[];
                    for(var ppi=0;ppi<S.editTarget.length;ppi++){
                        var pc=cloneShape(S.editTarget[ppi]);
                        moveShape(pc, pdx, pdy);
                        S.formas.push(pc);
                        newSel2.push(S.formas.length-1);
                    }
                    set("selectedShapes", newSel2);
                    saveHist(); redraw(); updTree();
                    callbacks.flash?.("Pegado: " + S.editTarget.length + " obj");
                    set("editOp",null); set("editBase",null); set("editTarget",null);
                }
                return;
            }
            if(S.editOp==="trim"){
                var tidx = hitTest(wx, wy);
                if(tidx >= 0){
                    if(trimLine(tidx, wx, wy)){
                        redraw(); updTree();
                        callbacks.flash?.("Trimmed");
                    } else {
                        callbacks.flash?.("No se puede recortar este tipo");
                    }
                }
                // Stay in trim mode for multiple trims, Escape to exit
                return;
            }
            if(S.editOp==="scale"){
                if(!S.editBase){
                    set("editBase", {x:wx, y:wy});
                    callbacks.flash?.("Escalar: click punto destino (dist = factor)");
                } else {
                    var sDist = D(S.editBase.x, S.editBase.y, wx, wy);
                    var sRef = S.tamGrid || 50;
                    var sFactor = sDist / sRef;
                    if(sFactor < 0.01) sFactor = 0.01;
                    saveHist();
                    var sCx = S.editBase.x, sCy = S.editBase.y;
                    for(var si=0;si<S.editTarget.length;si++){
                        scaleShape(S.formas[S.editTarget[si]], sFactor, sCx, sCy);
                    }
                    saveHist(); redraw(); updTree();
                    callbacks.flash?.("Escalado x" + sFactor.toFixed(2));
                    set("editOp",null); set("editBase",null); set("editTarget",null);
                }
                return;
            }
        }

        if(S.modo==="select"){
            // Start selection box (will become Window or Crossing on mousemove/mouseup)
            set("selBoxActive", true);
            set("selBoxStart", {x:wx, y:wy});
            set("selBoxEnd", {x:wx, y:wy});
            set("selectedShapes", []);
            return;
        }

        if(S.modo==="mano"){
            set("dibujando",true); set("xPrev",wx); set("yPrev",wy);
            saveHist();
            S.formas.push({tipo:"mano",pts:[{x:wx,y:wy,z:S.currentZ}],z:S.currentZ,color:S.currentColor});
            return;
        }

        if(S.modo==="polilinea"){
            if(!S.poliEnCurso){
                saveHist(); set("poliEnCurso",true);
                S.ptsPoli.length=0; S.ptsPoli.push({x:wx,y:wy,z:S.currentZ});
            } else {
                S.ptsPoli.push({x:wx,y:wy,z:S.currentZ});
                redraw();
                ctx.save(); ctx.strokeStyle=S.currentColor; ctx.lineWidth=1.5; ctx.beginPath();
                var pp0=proj3to2(S.ptsPoli[0].x,S.ptsPoli[0].y,S.ptsPoli[0].z||0);
                var p0=w2s(pp0.x,pp0.y); ctx.moveTo(p0.x,p0.y);
                for(var i=1;i<S.ptsPoli.length;i++){
                    var ppi=proj3to2(S.ptsPoli[i].x,S.ptsPoli[i].y,S.ptsPoli[i].z||0);
                    var pi=w2s(ppi.x,ppi.y); ctx.lineTo(pi.x,pi.y);
                }
                ctx.stroke(); ctx.restore();
            }
            return;
        }

        // 2-click modes
        if(!S.pIni){ saveHist(); set("pIni",{x:wx,y:wy,z:S.currentZ}); }
        else{
            var pf=S.orthoOn?orthoSnap(S.pIni.x,S.pIni.y,wx,wy):{x:wx,y:wy};
            var c=S.currentColor;
            var zI=S.pIni.z||S.currentZ, zF=S.currentZ;
            if(S.modo==="linea") S.formas.push({tipo:"linea",x1:S.pIni.x,y1:S.pIni.y,z1:zI,x2:pf.x,y2:pf.y,z2:zF,z:zI,color:c});
            else if(S.modo==="rectangulo") S.formas.push({tipo:"rectangulo",x:S.pIni.x,y:S.pIni.y,w:pf.x-S.pIni.x,h:pf.y-S.pIni.y,z:zI,color:c});
            else if(S.modo==="circulo") S.formas.push({tipo:"circulo",cx:S.pIni.x,cy:S.pIni.y,r:D(S.pIni.x,S.pIni.y,pf.x,pf.y),z:zI,color:c});
            else if(S.modo==="elipse") S.formas.push({tipo:"elipse",cx:S.pIni.x,cy:S.pIni.y,rx:Math.abs(pf.x-S.pIni.x),ry:Math.abs(pf.y-S.pIni.y),z:zI,color:c});
            else if(S.modo==="arco") S.formas.push({tipo:"arco",x1:S.pIni.x,y1:S.pIni.y,cx:(S.pIni.x+pf.x)/2,cy:Math.min(S.pIni.y,pf.y)-40,x2:pf.x,y2:pf.y,z:zI,color:c});
            else if(S.modo==="cota") S.formas.push({tipo:"cota",x1:S.pIni.x,y1:S.pIni.y,x2:pf.x,y2:pf.y,offset:toPx(10),text:null,z:zI,color:"#ffdd00"});

            set("pIni",null); saveHist(); redraw(); updTree(); selectShape(S.formas.length-1);
        }
    });

    // Dblclick - finish polyline
    canvas.addEventListener("dblclick", function(){
        if(S.modo==="polilinea" && S.poliEnCurso && S.ptsPoli.length>1){
            S.formas.push({tipo:"polilinea",pts:JSON.parse(JSON.stringify(S.ptsPoli)),color:S.currentColor});
            set("poliEnCurso",false); S.ptsPoli.length=0;
            saveHist(); redraw(); updTree(); selectShape(S.formas.length-1);
        }
    });

    // Mouse move
    canvas.addEventListener("mousemove", function(e){
        if(S.isPanning){
            var sp = getScreen(e);
            S.cam.x = S.panCamStart.x - (sp.x - S.panStart.x)/S.cam.zoom;
            S.cam.y = S.panCamStart.y - (sp.y - S.panStart.y)/S.cam.zoom;
            redraw();
            return;
        }

        var wp = getWorld(e);
        var wx = wp.x, wy = wp.y;

        var sp2 = findSnap(wx,wy);
        if(sp2){ wx=sp2.x; wy=sp2.y; stSnap.textContent=sp2.t; stSnap.style.color=sp2.c; }
        else{ stSnap.textContent="--"; stSnap.style.color="#aaa"; }

        var trackLines = [];
        var tracked = false;
        if(!sp2 && S.trackingOn){
            var tk = applyTracking(wx, wy);
            if(tk.tracked){ wx = tk.x; wy = tk.y; tracked = true; }
            trackLines = getTrackingLines(wx, wy);
        }

        if(!sp2 && !tracked){
            var gp = gridSnapPt(wx,wy);
            wx=gp.x; wy=gp.y;
        }

        var w3 = unproj2to3(wx, wy);
        stX.textContent=F(toU(w3.x)); stY.textContent=F(toU(w3.y)); stZ.textContent=F(toU(w3.z));
        inputX.value=F(toU(w3.x)); inputY.value=F(toU(w3.y)); inputZ.value=F(toU(w3.z));
        coordOverlay.textContent=F(toU(w3.x))+", "+F(toU(w3.y))+", "+F(toU(w3.z))+" "+S.unidad;

        var sr = getScreen(e);
        set("lastMouseScreen", {x: sr.x, y: sr.y});
        updateDynValues(wx, wy);
        updateDynPos();

        // Edit operation preview (move/paste)
        if(S.editOp && S.editBase && (S.editOp==="move"||S.editOp==="scale")){
            redraw();
            var pdx2=wx-S.editBase.x, pdy2=wy-S.editBase.y;
            ctx.save(); ctx.setLineDash([4,3]); ctx.strokeStyle="#ffcc00"; ctx.lineWidth=1;
            // Draw line from base to cursor
            var sb1=w2s(S.editBase.x,S.editBase.y), sb2=w2s(wx,wy);
            ctx.beginPath(); ctx.moveTo(sb1.x,sb1.y); ctx.lineTo(sb2.x,sb2.y); ctx.stroke();
            // Draw base point marker
            ctx.fillStyle="#ffcc00"; ctx.beginPath(); ctx.arc(sb1.x,sb1.y,4,0,Math.PI*2); ctx.fill();
            ctx.restore();
        }
        if(S.editOp==="paste" && !S.editBase && S.editTarget){
            // Show ghost preview of paste at cursor
            redraw();
            var cMinX2=Infinity,cMaxX2=-Infinity,cMinY2=Infinity,cMaxY2=-Infinity;
            for(var gci=0;gci<S.editTarget.length;gci++){
                var gb=shapeBounds(S.editTarget[gci]);
                if(gb.minX<cMinX2)cMinX2=gb.minX; if(gb.maxX>cMaxX2)cMaxX2=gb.maxX;
                if(gb.minY<cMinY2)cMinY2=gb.minY; if(gb.maxY>cMaxY2)cMaxY2=gb.maxY;
            }
            var gcx=(cMinX2+cMaxX2)/2, gcy=(cMinY2+cMaxY2)/2;
            var gdx=wx-gcx, gdy=wy-gcy;
            ctx.save(); ctx.globalAlpha=0.4; ctx.setLineDash([4,3]);
            for(var gi=0;gi<S.editTarget.length;gi++){
                var ghost=cloneShape(S.editTarget[gi]);
                moveShape(ghost, gdx, gdy);
                // Quick ghost draw - just bounding box
                var gbb=shapeBounds(ghost);
                var gs1=w2s(gbb.minX,gbb.minY), gs2=w2s(gbb.maxX,gbb.maxY);
                ctx.strokeStyle="#4ec9b0"; ctx.lineWidth=1;
                ctx.strokeRect(gs1.x,gs1.y,gs2.x-gs1.x,gs2.y-gs1.y);
            }
            ctx.restore();
        }

        // Selection box preview
        if(S.selBoxActive && S.modo==="select"){
            set("selBoxEnd", {x:wx, y:wy});
            // Preview selection: compute which shapes would be selected
            var previewSel = selectByBox(S.selBoxStart.x, S.selBoxStart.y, wx, wy);
            set("selectedShapes", previewSel);
            redraw();
            drawSelectionBox(S.selBoxStart.x, S.selBoxStart.y, wx, wy);
        }

        // Preview
        if(S.pIni && S.modo!=="select" && S.modo!=="pan"){
            var pf=S.orthoOn?orthoSnap(S.pIni.x,S.pIni.y,wx,wy):{x:wx,y:wy};
            redraw();
            drawTrackingLines(trackLines);
            if(sp2) drawSnapMarker(sp2.x,sp2.y,sp2.t,sp2.c);

            var sa=w2s(S.pIni.x,S.pIni.y), sb=w2s(pf.x,pf.y);
            ctx.save(); ctx.setLineDash([6,4]); ctx.strokeStyle="#4ec9b0"; ctx.lineWidth=1;
            if(S.modo==="linea"||S.modo==="arco"){ ctx.beginPath();ctx.moveTo(sa.x,sa.y);ctx.lineTo(sb.x,sb.y);ctx.stroke(); }
            else if(S.modo==="rectangulo"){ ctx.beginPath();ctx.rect(sa.x,sa.y,sb.x-sa.x,sb.y-sa.y);ctx.stroke(); }
            else if(S.modo==="circulo"){ var rd=D(S.pIni.x,S.pIni.y,pf.x,pf.y)*S.cam.zoom;ctx.beginPath();ctx.arc(sa.x,sa.y,rd,0,Math.PI*2);ctx.stroke(); }
            else if(S.modo==="elipse"){ ctx.beginPath();ctx.ellipse(sa.x,sa.y,Math.abs(sb.x-sa.x),Math.abs(sb.y-sa.y),0,0,Math.PI*2);ctx.stroke(); }
            else if(S.modo==="cota"){
                ctx.strokeStyle="#ffdd00"; ctx.lineWidth=1;
                ctx.beginPath();ctx.moveTo(sa.x,sa.y);ctx.lineTo(sb.x,sb.y);ctx.stroke();
                var cdist=D(S.pIni.x,S.pIni.y,pf.x,pf.y);
                ctx.fillStyle="#ffdd00"; ctx.font="bold 11px Consolas,monospace"; ctx.textAlign="center";
                ctx.fillText(F(toU(cdist))+" "+S.unidad,(sa.x+sb.x)/2,(sa.y+sb.y)/2-10);
            }
            ctx.restore();

            stLen.textContent=F(toU(D(S.pIni.x,S.pIni.y,pf.x,pf.y)));
            stAng.textContent=F(Ang(S.pIni.x,S.pIni.y,pf.x,pf.y))+"\u00b0";
        }
        else if(!S.pIni && S.modo!=="select" && S.modo!=="pan" && !S.poliEnCurso && !S.dibujando){
            redraw();
            drawTrackingLines(trackLines);
            if(sp2) drawSnapMarker(sp2.x,sp2.y,sp2.t,sp2.c);
        }

        // Polyline preview
        if(S.poliEnCurso && S.ptsPoli.length>0){
            redraw();
            if(sp2) drawSnapMarker(sp2.x,sp2.y,sp2.t,sp2.c);
            ctx.save(); ctx.strokeStyle=S.currentColor; ctx.lineWidth=1.5; ctx.beginPath();
            var pk0=w2s(S.ptsPoli[0].x,S.ptsPoli[0].y); ctx.moveTo(pk0.x,pk0.y);
            for(var k=1;k<S.ptsPoli.length;k++){var pkk=w2s(S.ptsPoli[k].x,S.ptsPoli[k].y);ctx.lineTo(pkk.x,pkk.y);}
            var curS=w2s(wx,wy);
            ctx.setLineDash([6,4]); ctx.strokeStyle="#4ec9b0"; ctx.lineTo(curS.x,curS.y); ctx.stroke(); ctx.restore();
            var last=S.ptsPoli[S.ptsPoli.length-1];
            stLen.textContent=F(toU(D(last.x,last.y,wx,wy)));
            stAng.textContent=F(Ang(last.x,last.y,wx,wy))+"\u00b0";
        }

        // Freehand
        if(S.dibujando && S.modo==="mano"){
            var ult=S.formas[S.formas.length-1]; ult.pts.push({x:wx,y:wy,z:S.currentZ});
            var sp1=w2s(S.xPrev,S.yPrev), sp22=w2s(wx,wy);
            ctx.beginPath(); ctx.strokeStyle=S.currentColor; ctx.lineWidth=1.5;
            ctx.moveTo(sp1.x,sp1.y); ctx.lineTo(sp22.x,sp22.y); ctx.stroke();
            set("xPrev",wx); set("yPrev",wy);
        }
    });

    // Mouse up
    canvas.addEventListener("mouseup", function(e){
        if(S.isPanning){ set("isPanning",false); canvas.style.cursor=S.modo==="pan"?"grab":"crosshair"; return; }

        // Finalize selection box
        if(S.selBoxActive && S.modo==="select"){
            set("selBoxActive", false);
            var wp = getWorld(e);
            var dx = Math.abs(wp.x - S.selBoxStart.x);
            var dy = Math.abs(wp.y - S.selBoxStart.y);
            var minDrag = 5 / S.cam.zoom;  // minimum drag distance to count as box selection

            if(dx < minDrag && dy < minDrag){
                // Small click = single object selection (classic behavior)
                set("selectedShapes", []);
                selectShape(hitTest(S.selBoxStart.x, S.selBoxStart.y));
            } else {
                // Box selection
                var sel = selectByBox(S.selBoxStart.x, S.selBoxStart.y, wp.x, wp.y);
                set("selectedShapes", sel);
                if(sel.length === 1){
                    selectShape(sel[0]);
                } else if(sel.length > 1){
                    set("formaSel", -1);  // no single selection
                    showProps(-1);
                } else {
                    selectShape(-1);
                }
                redraw();
                updTree();
            }
            return;
        }

        if(S.dibujando && S.modo==="mano"){ set("dibujando",false); saveHist(); redraw(); updTree(); selectShape(S.formas.length-1); }
    });

    // Context menu
    canvas.addEventListener("contextmenu", function(e){ e.preventDefault(); });
}

// ── Keyboard events ──
export function initKeyboard(setMode, toggleOrtho, toggleSnapOnOff, flash, undo){
    document.addEventListener("keydown", function(e){
        // Ctrl+Z undo
        if(e.ctrlKey && e.key==="z"){ e.preventDefault(); undo(); return; }

        // Ctrl+C copy
        if(e.ctrlKey && e.key==="c"){
            var sel = getSelection();
            if(sel.length > 0){
                e.preventDefault();
                var copies = [];
                for(var ci=0;ci<sel.length;ci++) copies.push(cloneShape(S.formas[sel[ci]]));
                set("clipboard", copies);
                flash("Copiado: " + sel.length + " obj");
            }
            return;
        }

        // Ctrl+V paste
        if(e.ctrlKey && e.key==="v"){
            if(S.clipboard && S.clipboard.length > 0){
                e.preventDefault();
                // Start paste-place mode: next click = placement point
                set("editOp", "paste");
                set("editBase", null);
                // Clone clipboard shapes for placement
                var clones = [];
                for(var pi=0;pi<S.clipboard.length;pi++) clones.push(cloneShape(S.clipboard[pi]));
                set("editTarget", clones);
                flash("Pegar: click punto destino");
            }
            return;
        }

        // Ctrl+D duplicate in place with offset
        if(e.ctrlKey && e.key==="d"){
            var sel2 = getSelection();
            if(sel2.length > 0){
                e.preventDefault();
                saveHist();
                var pasteOffset = S.tamGrid || 10;
                var newSel = [];
                for(var di=0;di<sel2.length;di++){
                    var dup = cloneShape(S.formas[sel2[di]]);
                    moveShape(dup, pasteOffset, pasteOffset);
                    S.formas.push(dup);
                    newSel.push(S.formas.length-1);
                }
                set("selectedShapes", newSel);
                set("formaSel", newSel.length===1?newSel[0]:-1);
                saveHist(); redraw(); updTree();
                flash("Duplicado: " + sel2.length + " obj");
            }
            return;
        }

        // Escape
        if(e.key==="Escape"){
            e.preventDefault(); set("pIni",null);
            set("selBoxActive", false);
            set("selectedShapes", []);
            // Cancel edit operation
            if(S.editOp){ set("editOp",null); set("editBase",null); set("editTarget",null); flash("Cancelado"); redraw(); return; }
            if(S.poliEnCurso){
                if(S.ptsPoli.length>1){
                    S.formas.push({tipo:"polilinea",pts:JSON.parse(JSON.stringify(S.ptsPoli)),color:S.currentColor});
                    saveHist(); updTree();
                }
                set("poliEnCurso",false); S.ptsPoli.length=0;
            }
            redraw(); flash("Cancelado"); return;
        }
        if(e.key==="F8"){ e.preventDefault(); toggleOrtho(); return; }
        if(e.key==="F3"){ e.preventDefault(); toggleSnapOnOff(); return; }
        if(e.key==="F11"){ e.preventDefault(); set("trackingOn",!S.trackingOn); document.getElementById("tglOTrack").classList.toggle("on",S.trackingOn); flash("OTRACK "+(S.trackingOn?"ON":"OFF")); return; }
        if(e.key==="Delete"){
            // Multi-selection delete
            if(S.selectedShapes && S.selectedShapes.length > 0){
                saveHist();
                var sorted = S.selectedShapes.slice().sort(function(a,b){return b-a;});
                for(var dli=0; dli<sorted.length; dli++) S.formas.splice(sorted[dli],1);
                set("selectedShapes", []);
                set("formaSel", -1);
                saveHist(); redraw(); updTree(); showProps(-1);
                return;
            }
            if(S.formaSel>=0){
                saveHist(); S.formas.splice(S.formaSel,1); set("formaSel",-1); saveHist(); redraw(); updTree(); showProps(-1); return;
            }
        }
        var t=e.target; if(t.tagName==="INPUT"||t.tagName==="TEXTAREA") return;

        // Dynamic input: if user types a number, redirect focus
        if(S.dynInputOn && S.modo!=="select" && S.modo!=="pan" && !e.ctrlKey && !e.altKey){
            if(/^[0-9.\-]$/.test(e.key)){
                e.preventDefault();
                set("dynFocused", true);
                dynXInput.value = e.key;
                dynXInput.focus();
                showDynInput(S.pIni ? "dist" : "coord");
                return;
            }
        }

        // M = Move selected shapes
        if(e.key==="m" && !e.ctrlKey){
            var msel = getSelection();
            if(msel.length > 0){
                set("editOp", "move");
                set("editBase", null);
                set("editTarget", msel);
                flash("Mover: click punto base");
                return;
            }
        }

        // Ctrl+Shift+C = Copy with base point
        if(e.ctrlKey && e.shiftKey && e.key==="C"){
            var csel = getSelection();
            if(csel.length > 0){
                e.preventDefault();
                var copies2 = [];
                for(var ci2=0;ci2<csel.length;ci2++) copies2.push(cloneShape(S.formas[csel[ci2]]));
                set("clipboard", copies2);
                set("editOp", "paste");
                set("editBase", null);
                set("editTarget", copies2.map(function(s){return cloneShape(s);}));
                flash("Copiar con base: click punto base");
                return;
            }
        }

        // T = Trim mode
        if(e.key==="t" && !e.ctrlKey){
            set("editOp", "trim");
            flash("Trim: click segmento a recortar");
            return;
        }

        // X = Scale (stretch)
        if(e.key==="x" && !e.ctrlKey){
            var xsel = getSelection();
            if(xsel.length > 0){
                set("editOp", "scale");
                set("editBase", null);
                set("editTarget", xsel);
                flash("Escalar: click punto base, luego factor");
                return;
            }
        }

        // G = Group selected shapes
        if(e.key==="g" && !e.ctrlKey && !e.shiftKey){
            var gsel = getSelection();
            if(gsel.length > 1){
                saveHist();
                // Collect shapes, sort indices descending to remove from end first
                var children = [];
                var sorted = gsel.slice().sort(function(a,b){return b-a;});
                for(var gii=0;gii<gsel.length;gii++) children.push(cloneShape(S.formas[gsel[gii]]));
                for(var gri=0;gri<sorted.length;gri++) S.formas.splice(sorted[gri],1);
                var grp = {tipo:"grupo", color:"#ffffff", z:0, children:children, hidden:false};
                S.formas.push(grp);
                set("formaSel", S.formas.length-1);
                set("selectedShapes", []);
                saveHist(); invalidateSnapCache(); redraw(); updTree();
                flash("Grupo creado: " + children.length + " objetos");
                return;
            }
        }

        // Shift+G = Ungroup selected group
        if(e.key==="G" && e.shiftKey && !e.ctrlKey){
            var uidx = S.formaSel;
            if(uidx >= 0 && S.formas[uidx] && S.formas[uidx].tipo==="grupo"){
                saveHist();
                var uch = S.formas[uidx].children;
                S.formas.splice(uidx, 1);
                var newSel = [];
                for(var ui=0;ui<uch.length;ui++){
                    S.formas.push(uch[ui]);
                    newSel.push(S.formas.length-1);
                }
                set("formaSel", -1);
                set("selectedShapes", newSel);
                saveHist(); invalidateSnapCache(); redraw(); updTree();
                flash("Desagrupado: " + uch.length + " objetos");
                return;
            }
        }

        var km={v:"select",h:"pan",l:"linea",p:"polilinea",r:"rectangulo",c:"circulo",e:"elipse",a:"arco",f:"mano",d:"cota",z:null};
        if(e.key==="z" && !e.ctrlKey){ zoomFit(); return; }
        if(km[e.key]!==undefined && km[e.key]!==null) setMode(km[e.key]);
    });
}
