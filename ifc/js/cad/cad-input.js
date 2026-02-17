// ===================== INPUT.JS - Layer 6 =====================
// Mouse events, keyboard events, hit testing, zoom fit
"use strict";

var CAD = window.CAD;

// ── Helper: get world/screen coords from mouse event ──
function getWorld(e){
    var r = CAD.canvas.getBoundingClientRect();
    return CAD.s2w(e.clientX - r.left, e.clientY - r.top);
}
function getScreen(e){
    var r = CAD.canvas.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
}

// ── Hit test: find shape under projected cursor ──
CAD.hitTest = function(wx, wy){
    var tol = 8 / CAD.cam.zoom;
    for(var i = CAD.formas.length - 1; i >= 0; i--){
        var f = CAD.formas[i]; if(f.hidden) continue;
        var fz = f.z||0;
        if(f.tipo==="linea"){
            var hp1=CAD.proj3to2(f.x1,f.y1,f.z1||fz), hp2=CAD.proj3to2(f.x2,f.y2,f.z2||fz);
            var dx=hp2.x-hp1.x, dy=hp2.y-hp1.y, len=dx*dx+dy*dy; if(len===0) continue;
            var u=Math.max(0,Math.min(1,((wx-hp1.x)*dx+(wy-hp1.y)*dy)/len));
            if(CAD.D(wx,wy,hp1.x+u*dx,hp1.y+u*dy)<tol) return i;
        } else if(f.tipo==="rectangulo"){
            var hr=CAD.proj3to2(f.x,f.y,fz), hr2=CAD.proj3to2(f.x+f.w,f.y+f.h,fz);
            var rx=Math.min(hr.x,hr2.x), ry=Math.min(hr.y,hr2.y), rw=Math.abs(hr2.x-hr.x), rh=Math.abs(hr2.y-hr.y);
            if(wx>=rx-tol&&wx<=rx+rw+tol&&wy>=ry-tol&&wy<=ry+rh+tol){
                if(Math.abs(wx-rx)<tol||Math.abs(wx-rx-rw)<tol||Math.abs(wy-ry)<tol||Math.abs(wy-ry-rh)<tol) return i;
                if(wx>=rx&&wx<=rx+rw&&wy>=ry&&wy<=ry+rh) return i;
            }
        } else if(f.tipo==="circulo"){
            var hc=CAD.proj3to2(f.cx,f.cy,fz);
            if(Math.abs(CAD.D(wx,wy,hc.x,hc.y)-f.r)<tol||CAD.D(wx,wy,hc.x,hc.y)<f.r) return i;
        } else if(f.tipo==="elipse"){
            var he=CAD.proj3to2(f.cx,f.cy,fz);
            var ex=(wx-he.x)/f.rx, ey=(wy-he.y)/f.ry, ev=ex*ex+ey*ey;
            if(Math.abs(ev-1)<0.3||ev<1) return i;
        } else if(f.tipo==="arco_circular"){
            var hac=CAD.proj3to2(f.cx,f.cy,fz);
            if(Math.abs(CAD.D(wx,wy,hac.x,hac.y)-f.r)<tol){
                var ang=Math.atan2(wy-hac.y, wx-hac.x);
                if(ang<0) ang+=Math.PI*2;
                var sa=f.startAngle, ea=f.endAngle;
                if(sa<0) sa+=Math.PI*2; if(ea<0) ea+=Math.PI*2;
                if(sa<=ea){ if(ang>=sa-0.1&&ang<=ea+0.1) return i; }
                else{ if(ang>=sa-0.1||ang<=ea+0.1) return i; }
            }
        } else if(f.tipo==="polilinea"||f.tipo==="mano"){
            for(var j=1;j<f.pts.length;j++){
                var hpp1=CAD.proj3to2(f.pts[j-1].x,f.pts[j-1].y,f.pts[j-1].z||fz);
                var hpp2=CAD.proj3to2(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
                var ldx=hpp2.x-hpp1.x, ldy=hpp2.y-hpp1.y, ll=ldx*ldx+ldy*ldy;
                if(ll===0) continue;
                var lu=Math.max(0,Math.min(1,((wx-hpp1.x)*ldx+(wy-hpp1.y)*ldy)/ll));
                if(CAD.D(wx,wy,hpp1.x+lu*ldx,hpp1.y+lu*ldy)<tol) return i;
            }
        } else if(f.tipo==="cota"){
            var dp1=CAD.proj3to2(f.x1,f.y1,fz), dp2=CAD.proj3to2(f.x2,f.y2,fz);
            var ddx=dp2.x-dp1.x, ddy=dp2.y-dp1.y, dlen=Math.sqrt(ddx*ddx+ddy*ddy);
            if(dlen>0){
                var dnx=-ddy/dlen, dny=ddx/dlen;
                var doff=f.offset||10;
                var od1x=dp1.x+dnx*doff, od1y=dp1.y+dny*doff;
                var od2x=dp2.x+dnx*doff, od2y=dp2.y+dny*doff;
                var odx=od2x-od1x, ody=od2y-od1y, ol2=odx*odx+ody*ody;
                if(ol2>0){
                    var ou=Math.max(0,Math.min(1,((wx-od1x)*odx+(wy-od1y)*ody)/ol2));
                    if(CAD.D(wx,wy,od1x+ou*odx,od1y+ou*ody)<tol) return i;
                }
            }
            if(CAD.D(wx,wy,dp1.x,dp1.y)<tol || CAD.D(wx,wy,dp2.x,dp2.y)<tol) return i;
        } else if(f.tipo==="grupo"&&f.children){
            if(hitTestGroup(f, wx, wy, tol)) return i;
        }
    }
    return -1;
};

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
            if(CAD.D(wx,wy,hp1.x+u*dx,hp1.y+u*dy)<tol) return true;
        } else if(f.tipo==="rectangulo"){
            var rx=f.x, ry=f.y, rw=f.w, rh=f.h;
            if(wx>=rx-tol&&wx<=rx+rw+tol&&wy>=ry-tol&&wy<=ry+rh+tol) return true;
        } else if(f.tipo==="circulo"){
            if(Math.abs(CAD.D(wx,wy,f.cx,f.cy)-f.r)<tol||CAD.D(wx,wy,f.cx,f.cy)<f.r) return true;
        } else if(f.tipo==="arco_circular"){
            if(Math.abs(CAD.D(wx,wy,f.cx,f.cy)-f.r)<tol) return true;
        } else if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
            for(var j=1;j<f.pts.length;j++){
                var p1=f.pts[j-1], p2=f.pts[j];
                var ldx=p2.x-p1.x, ldy=p2.y-p1.y, ll=ldx*ldx+ldy*ldy;
                if(ll===0) continue;
                var lu=Math.max(0,Math.min(1,((wx-p1.x)*ldx+(wy-p1.y)*ldy)/ll));
                if(CAD.D(wx,wy,p1.x+lu*ldx,p1.y+lu*ldy)<tol) return true;
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
        var p=CAD.proj3to2(x3,y3,z3);
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
CAD.shapeBounds = shapeBounds;

// ── Test if line segment intersects rectangle ──
function lineIntersectsRect(x1,y1,x2,y2, rx,ry,rw,rh){
    var rx2=rx+rw, ry2=ry+rh;
    if(x1>=rx&&x1<=rx2&&y1>=ry&&y1<=ry2) return true;
    if(x2>=rx&&x2<=rx2&&y2>=ry&&y2<=ry2) return true;
    function segCross(ax,ay,bx,by,cx,cy,dx,dy){
        var d1=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
        var d2=(bx-ax)*(dy-ay)-(by-ay)*(dx-ax);
        var d3=(dx-cx)*(ay-cy)-(dy-cy)*(ax-cx);
        var d4=(dx-cx)*(by-cy)-(dy-cy)*(bx-cx);
        if(((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0))) return true;
        return false;
    }
    if(segCross(x1,y1,x2,y2, rx,ry,rx2,ry)) return true;
    if(segCross(x1,y1,x2,y2, rx2,ry,rx2,ry2)) return true;
    if(segCross(x1,y1,x2,y2, rx2,ry2,rx,ry2)) return true;
    if(segCross(x1,y1,x2,y2, rx,ry2,rx,ry)) return true;
    return false;
}

function shapeInsideRect(f, rx, ry, rw, rh){
    var b = shapeBounds(f);
    return b.minX>=rx && b.maxX<=rx+rw && b.minY>=ry && b.maxY<=ry+rh;
}

function shapeCrossesRect(f, rx, ry, rw, rh){
    var b = shapeBounds(f);
    if(b.maxX<rx || b.minX>rx+rw || b.maxY<ry || b.minY>ry+rh) return false;
    if(b.minX>=rx && b.maxX<=rx+rw && b.minY>=ry && b.maxY<=ry+rh) return true;
    var fz = f.z||0;
    if(f.tipo==="linea"){
        var p1=CAD.proj3to2(f.x1,f.y1,f.z1||fz), p2=CAD.proj3to2(f.x2,f.y2,f.z2||fz);
        return lineIntersectsRect(p1.x,p1.y,p2.x,p2.y, rx,ry,rw,rh);
    }
    if((f.tipo==="polilinea"||f.tipo==="mano")&&f.pts){
        for(var j=1;j<f.pts.length;j++){
            var pp1=CAD.proj3to2(f.pts[j-1].x,f.pts[j-1].y,f.pts[j-1].z||fz);
            var pp2=CAD.proj3to2(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
            if(lineIntersectsRect(pp1.x,pp1.y,pp2.x,pp2.y, rx,ry,rw,rh)) return true;
        }
        return false;
    }
    return true;
}

function selectByBox(x1,y1,x2,y2){
    var leftToRight = (x2 >= x1);
    var rx = Math.min(x1,x2), ry = Math.min(y1,y2);
    var rw = Math.abs(x2-x1), rh = Math.abs(y2-y1);
    var sel = [];
    for(var i=0; i<CAD.formas.length; i++){
        if(CAD.formas[i].hidden) continue;
        if(leftToRight){
            if(shapeInsideRect(CAD.formas[i], rx, ry, rw, rh)) sel.push(i);
        } else {
            if(shapeCrossesRect(CAD.formas[i], rx, ry, rw, rh)) sel.push(i);
        }
    }
    return sel;
}

function cloneShape(f){ return JSON.parse(JSON.stringify(f)); }

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
CAD.moveShape = moveShape;
CAD.cloneShape = cloneShape;

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

function shapesCenter(indices){
    var sx=0, sy=0, n=0;
    for(var i=0;i<indices.length;i++){
        var b = shapeBounds(CAD.formas[indices[i]]);
        sx+=(b.minX+b.maxX)/2; sy+=(b.minY+b.maxY)/2; n++;
    }
    return n>0 ? {x:sx/n, y:sy/n} : {x:0, y:0};
}

function getSelection(){
    if(CAD.selectedShapes && CAD.selectedShapes.length > 0) return CAD.selectedShapes.slice();
    if(CAD.formaSel >= 0) return [CAD.formaSel];
    return [];
}

function lineLineIntersect(ax1,ay1,ax2,ay2, bx1,by1,bx2,by2){
    var dx1=ax2-ax1, dy1=ay2-ay1, dx2=bx2-bx1, dy2=by2-by1;
    var den=dx1*dy2-dy1*dx2;
    if(Math.abs(den)<1e-10) return null;
    var t=((bx1-ax1)*dy2-(by1-ay1)*dx2)/den;
    var u=((bx1-ax1)*dy1-(by1-ay1)*dx1)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1) return {x:ax1+t*dx1, y:ay1+t*dy1, t:t, u:u};
    return null;
}

function trimLine(lineIdx, clickX, clickY){
    var f = CAD.formas[lineIdx];
    if(f.tipo!=="linea") return false;
    var ints = [];
    for(var i=0;i<CAD.formas.length;i++){
        if(i===lineIdx || CAD.formas[i].hidden) continue;
        var g = CAD.formas[i];
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
    ints.sort(function(a,b){ return a.t-b.t; });
    var dx=f.x2-f.x1, dy=f.y2-f.y1, len2=dx*dx+dy*dy;
    var clickT = len2>0 ? ((clickX-f.x1)*dx+(clickY-f.y1)*dy)/len2 : 0;
    var tBefore=0, tAfter=1;
    for(var k=0;k<ints.length;k++){
        if(ints[k].t <= clickT && ints[k].t > tBefore) tBefore=ints[k].t;
        if(ints[k].t >= clickT && ints[k].t < tAfter) tAfter=ints[k].t;
    }
    CAD.saveHist();
    var keepParts = [];
    if(tBefore > 0.001) keepParts.push({x1:f.x1,y1:f.y1,x2:f.x1+tBefore*dx,y2:f.y1+tBefore*dy});
    if(tAfter < 0.999) keepParts.push({x1:f.x1+tAfter*dx,y1:f.y1+tAfter*dy,x2:f.x2,y2:f.y2});
    CAD.formas.splice(lineIdx,1);
    for(var pi=0;pi<keepParts.length;pi++){
        CAD.formas.splice(lineIdx+pi,0,{
            tipo:"linea",x1:keepParts[pi].x1,y1:keepParts[pi].y1,
            x2:keepParts[pi].x2,y2:keepParts[pi].y2,z:f.z||0,color:f.color
        });
    }
    CAD.saveHist();
    return true;
}

// ── Zoom Fit ──
CAD.zoomFit = function(){
    if(CAD.formas.length===0){ CAD.cam.x=0; CAD.cam.y=0; CAD.cam.zoom=1; CAD.redraw(); return; }
    var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    function expandBounds(x3,y3,z3){
        var p=CAD.proj3to2(x3,y3,z3);
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
    for(var i=0;i<CAD.formas.length;i++) expandShape(CAD.formas[i]);
    if(minX===Infinity) return;
    var bw=maxX-minX, bh=maxY-minY;
    if(bw<1) bw=100; if(bh<1) bh=100;
    CAD.cam.x=(minX+maxX)/2; CAD.cam.y=(minY+maxY)/2;
    CAD.cam.zoom=Math.min((CAD.canvas.width*0.85)/bw, (CAD.canvas.height*0.85)/bh);
    CAD.cam.zoom=Math.max(CAD.cam.minZoom,Math.min(CAD.cam.maxZoom,CAD.cam.zoom));
    CAD.redraw();
};

// ── Resize canvas to fill area ──
CAD.resizeCanvas = function(){
    CAD.canvas.width = CAD.canvasArea.clientWidth;
    CAD.canvas.height = CAD.canvasArea.clientHeight;
    CAD.redraw();
};

// ── Bind all 2D canvas events ──
CAD.initCanvasEvents = function(){

    CAD.canvas.addEventListener("wheel", function(e){
        e.preventDefault();
        var sp = getScreen(e);
        var wBefore = CAD.s2w(sp.x, sp.y);
        var factor = e.deltaY < 0 ? 1.15 : 1/1.15;
        CAD.cam.zoom *= factor;
        CAD.cam.zoom = Math.max(CAD.cam.minZoom, Math.min(CAD.cam.maxZoom, CAD.cam.zoom));
        var wAfter = CAD.s2w(sp.x, sp.y);
        CAD.cam.x += wBefore.x - wAfter.x;
        CAD.cam.y += wBefore.y - wAfter.y;
        CAD.redraw();
    }, {passive: false});

    CAD.canvas.addEventListener("mousedown", function(e){
        CAD.canvas.focus();

        if(e.button === 1 || (e.button === 0 && CAD.modo === "pan")){
            e.preventDefault();
            CAD.set("isPanning", true);
            CAD.set("panStart", getScreen(e));
            CAD.set("panCamStart", {x: CAD.cam.x, y: CAD.cam.y});
            CAD.canvas.style.cursor = "grabbing";
            return;
        }

        if(e.button !== 0) return;

        var wp = getWorld(e);
        var wx = wp.x, wy = wp.y;

        var sp = CAD.findSnap(wx,wy);
        if(sp){ wx=sp.x; wy=sp.y; }
        var gp = CAD.gridSnapPt(wx,wy);
        wx=gp.x; wy=gp.y;

        // Handle edit operations
        if(CAD.editOp){
            if(CAD.editOp==="move"){
                if(!CAD.editBase){
                    CAD.set("editBase", {x:wx, y:wy});
                    CAD.callbacks.flash?.("Mover: click punto destino");
                } else {
                    var mdx=wx-CAD.editBase.x, mdy=wy-CAD.editBase.y;
                    CAD.saveHist();
                    for(var mi=0;mi<CAD.editTarget.length;mi++) moveShape(CAD.formas[CAD.editTarget[mi]], mdx, mdy);
                    CAD.saveHist(); CAD.redraw(); CAD.callbacks.updTree?.();
                    CAD.callbacks.flash?.("Movido: " + CAD.editTarget.length + " obj");
                    CAD.set("editOp",null); CAD.set("editBase",null); CAD.set("editTarget",null);
                }
                return;
            }
            if(CAD.editOp==="paste"){
                if(!CAD.editBase){
                    CAD.set("editBase", {x:wx, y:wy});
                    var cMinX=Infinity,cMaxX=-Infinity,cMinY=Infinity,cMaxY=-Infinity;
                    for(var pci=0;pci<CAD.editTarget.length;pci++){
                        var pb=shapeBounds(CAD.editTarget[pci]);
                        if(pb.minX<cMinX)cMinX=pb.minX; if(pb.maxX>cMaxX)cMaxX=pb.maxX;
                        if(pb.minY<cMinY)cMinY=pb.minY; if(pb.maxY>cMaxY)cMaxY=pb.maxY;
                    }
                    var pcx=(cMinX+cMaxX)/2, pcy=(cMinY+cMaxY)/2;
                    var pdx=wx-pcx, pdy=wy-pcy;
                    CAD.saveHist();
                    var newSel2=[];
                    for(var ppi=0;ppi<CAD.editTarget.length;ppi++){
                        var pc=cloneShape(CAD.editTarget[ppi]);
                        moveShape(pc, pdx, pdy);
                        CAD.formas.push(pc);
                        newSel2.push(CAD.formas.length-1);
                    }
                    CAD.set("selectedShapes", newSel2);
                    CAD.saveHist(); CAD.redraw(); CAD.callbacks.updTree?.();
                    CAD.callbacks.flash?.("Pegado: " + CAD.editTarget.length + " obj");
                    CAD.set("editOp",null); CAD.set("editBase",null); CAD.set("editTarget",null);
                }
                return;
            }
            if(CAD.editOp==="trim"){
                var tidx = CAD.hitTest(wx, wy);
                if(tidx >= 0){
                    if(trimLine(tidx, wx, wy)){
                        CAD.redraw(); CAD.callbacks.updTree?.();
                        CAD.callbacks.flash?.("Trimmed");
                    } else {
                        CAD.callbacks.flash?.("No se puede recortar este tipo");
                    }
                }
                return;
            }
            if(CAD.editOp==="scale"){
                if(!CAD.editBase){
                    CAD.set("editBase", {x:wx, y:wy});
                    CAD.callbacks.flash?.("Escalar: click punto destino (dist = factor)");
                } else {
                    var sDist = CAD.D(CAD.editBase.x, CAD.editBase.y, wx, wy);
                    var sRef = CAD.tamGrid || 50;
                    var sFactor = sDist / sRef;
                    if(sFactor < 0.01) sFactor = 0.01;
                    CAD.saveHist();
                    var sCx = CAD.editBase.x, sCy = CAD.editBase.y;
                    for(var si=0;si<CAD.editTarget.length;si++){
                        scaleShape(CAD.formas[CAD.editTarget[si]], sFactor, sCx, sCy);
                    }
                    CAD.saveHist(); CAD.redraw(); CAD.callbacks.updTree?.();
                    CAD.callbacks.flash?.("Escalado x" + sFactor.toFixed(2));
                    CAD.set("editOp",null); CAD.set("editBase",null); CAD.set("editTarget",null);
                }
                return;
            }
        }

        if(CAD.modo==="select"){
            CAD.set("selBoxActive", true);
            CAD.set("selBoxStart", {x:wx, y:wy});
            CAD.set("selBoxEnd", {x:wx, y:wy});
            CAD.set("selectedShapes", []);
            return;
        }

        if(CAD.modo==="mano"){
            CAD.set("dibujando",true); CAD.set("xPrev",wx); CAD.set("yPrev",wy);
            CAD.saveHist();
            CAD.formas.push({tipo:"mano",pts:[{x:wx,y:wy,z:CAD.currentZ}],z:CAD.currentZ,color:CAD.currentColor});
            return;
        }

        if(CAD.modo==="polilinea"){
            if(!CAD.poliEnCurso){
                CAD.saveHist(); CAD.set("poliEnCurso",true);
                CAD.ptsPoli.length=0; CAD.ptsPoli.push({x:wx,y:wy,z:CAD.currentZ});
            } else {
                CAD.ptsPoli.push({x:wx,y:wy,z:CAD.currentZ});
                CAD.redraw();
                CAD.ctx.save(); CAD.ctx.strokeStyle=CAD.currentColor; CAD.ctx.lineWidth=1.5; CAD.ctx.beginPath();
                var pp0=CAD.proj3to2(CAD.ptsPoli[0].x,CAD.ptsPoli[0].y,CAD.ptsPoli[0].z||0);
                var p0=CAD.w2s(pp0.x,pp0.y); CAD.ctx.moveTo(p0.x,p0.y);
                for(var i=1;i<CAD.ptsPoli.length;i++){
                    var ppi=CAD.proj3to2(CAD.ptsPoli[i].x,CAD.ptsPoli[i].y,CAD.ptsPoli[i].z||0);
                    var pi=CAD.w2s(ppi.x,ppi.y); CAD.ctx.lineTo(pi.x,pi.y);
                }
                CAD.ctx.stroke(); CAD.ctx.restore();
            }
            return;
        }

        // 2-click modes
        if(!CAD.pIni){ CAD.saveHist(); CAD.set("pIni",{x:wx,y:wy,z:CAD.currentZ}); }
        else{
            var pf=CAD.orthoOn?CAD.orthoSnap(CAD.pIni.x,CAD.pIni.y,wx,wy):{x:wx,y:wy};
            var c=CAD.currentColor;
            var zI=CAD.pIni.z||CAD.currentZ, zF=CAD.currentZ;
            if(CAD.modo==="linea") CAD.formas.push({tipo:"linea",x1:CAD.pIni.x,y1:CAD.pIni.y,z1:zI,x2:pf.x,y2:pf.y,z2:zF,z:zI,color:c});
            else if(CAD.modo==="rectangulo") CAD.formas.push({tipo:"rectangulo",x:CAD.pIni.x,y:CAD.pIni.y,w:pf.x-CAD.pIni.x,h:pf.y-CAD.pIni.y,z:zI,color:c});
            else if(CAD.modo==="circulo") CAD.formas.push({tipo:"circulo",cx:CAD.pIni.x,cy:CAD.pIni.y,r:CAD.D(CAD.pIni.x,CAD.pIni.y,pf.x,pf.y),z:zI,color:c});
            else if(CAD.modo==="elipse") CAD.formas.push({tipo:"elipse",cx:CAD.pIni.x,cy:CAD.pIni.y,rx:Math.abs(pf.x-CAD.pIni.x),ry:Math.abs(pf.y-CAD.pIni.y),z:zI,color:c});
            else if(CAD.modo==="arco") CAD.formas.push({tipo:"arco",x1:CAD.pIni.x,y1:CAD.pIni.y,cx:(CAD.pIni.x+pf.x)/2,cy:Math.min(CAD.pIni.y,pf.y)-40,x2:pf.x,y2:pf.y,z:zI,color:c});
            else if(CAD.modo==="cota") CAD.formas.push({tipo:"cota",x1:CAD.pIni.x,y1:CAD.pIni.y,x2:pf.x,y2:pf.y,offset:CAD.toPx(10),text:null,z:zI,color:"#ffdd00"});

            CAD.set("pIni",null); CAD.saveHist(); CAD.redraw(); CAD.callbacks.updTree?.(); CAD.callbacks.selectShape?.(CAD.formas.length-1);
        }
    });

    CAD.canvas.addEventListener("dblclick", function(){
        if(CAD.modo==="polilinea" && CAD.poliEnCurso && CAD.ptsPoli.length>1){
            CAD.formas.push({tipo:"polilinea",pts:JSON.parse(JSON.stringify(CAD.ptsPoli)),color:CAD.currentColor});
            CAD.set("poliEnCurso",false); CAD.ptsPoli.length=0;
            CAD.saveHist(); CAD.redraw(); CAD.callbacks.updTree?.(); CAD.callbacks.selectShape?.(CAD.formas.length-1);
        }
    });

    CAD.canvas.addEventListener("mousemove", function(e){
        if(CAD.isPanning){
            var sp = getScreen(e);
            CAD.cam.x = CAD.panCamStart.x - (sp.x - CAD.panStart.x)/CAD.cam.zoom;
            CAD.cam.y = CAD.panCamStart.y - (sp.y - CAD.panStart.y)/CAD.cam.zoom;
            CAD.redraw();
            return;
        }

        var wp = getWorld(e);
        var wx = wp.x, wy = wp.y;

        var sp2 = CAD.findSnap(wx,wy);
        if(sp2){ wx=sp2.x; wy=sp2.y; if(CAD.stSnap){CAD.stSnap.textContent=sp2.t; CAD.stSnap.style.color=sp2.c;} }
        else{ if(CAD.stSnap){CAD.stSnap.textContent="--"; CAD.stSnap.style.color="#aaa";} }

        var trackLines = [];
        var tracked = false;
        if(!sp2 && CAD.trackingOn){
            var tk = CAD.applyTracking(wx, wy);
            if(tk.tracked){ wx = tk.x; wy = tk.y; tracked = true; }
            trackLines = CAD.getTrackingLines(wx, wy);
        }

        if(!sp2 && !tracked){
            var gp = CAD.gridSnapPt(wx,wy);
            wx=gp.x; wy=gp.y;
        }

        var w3 = CAD.unproj2to3(wx, wy);
        if(CAD.stX) CAD.stX.textContent=CAD.F(CAD.toU(w3.x));
        if(CAD.stY) CAD.stY.textContent=CAD.F(CAD.toU(w3.y));
        if(CAD.stZ) CAD.stZ.textContent=CAD.F(CAD.toU(w3.z));
        if(CAD.inputX) CAD.inputX.value=CAD.F(CAD.toU(w3.x));
        if(CAD.inputY) CAD.inputY.value=CAD.F(CAD.toU(w3.y));
        if(CAD.inputZ) CAD.inputZ.value=CAD.F(CAD.toU(w3.z));
        if(CAD.coordOverlay) CAD.coordOverlay.textContent=CAD.F(CAD.toU(w3.x))+", "+CAD.F(CAD.toU(w3.y))+", "+CAD.F(CAD.toU(w3.z))+" "+CAD.unidad;

        var sr = getScreen(e);
        CAD.set("lastMouseScreen", {x: sr.x, y: sr.y});
        if(CAD.updateDynValues) CAD.updateDynValues(wx, wy);
        if(CAD.updateDynPos) CAD.updateDynPos();

        // Edit operation preview
        if(CAD.editOp && CAD.editBase && (CAD.editOp==="move"||CAD.editOp==="scale")){
            CAD.redraw();
            CAD.ctx.save(); CAD.ctx.setLineDash([4,3]); CAD.ctx.strokeStyle="#ffcc00"; CAD.ctx.lineWidth=1;
            var sb1=CAD.w2s(CAD.editBase.x,CAD.editBase.y), sb2=CAD.w2s(wx,wy);
            CAD.ctx.beginPath(); CAD.ctx.moveTo(sb1.x,sb1.y); CAD.ctx.lineTo(sb2.x,sb2.y); CAD.ctx.stroke();
            CAD.ctx.fillStyle="#ffcc00"; CAD.ctx.beginPath(); CAD.ctx.arc(sb1.x,sb1.y,4,0,Math.PI*2); CAD.ctx.fill();
            CAD.ctx.restore();
        }
        if(CAD.editOp==="paste" && !CAD.editBase && CAD.editTarget){
            CAD.redraw();
            var cMinX2=Infinity,cMaxX2=-Infinity,cMinY2=Infinity,cMaxY2=-Infinity;
            for(var gci=0;gci<CAD.editTarget.length;gci++){
                var gb=shapeBounds(CAD.editTarget[gci]);
                if(gb.minX<cMinX2)cMinX2=gb.minX; if(gb.maxX>cMaxX2)cMaxX2=gb.maxX;
                if(gb.minY<cMinY2)cMinY2=gb.minY; if(gb.maxY>cMaxY2)cMaxY2=gb.maxY;
            }
            var gcx=(cMinX2+cMaxX2)/2, gcy=(cMinY2+cMaxY2)/2;
            var gdx=wx-gcx, gdy=wy-gcy;
            CAD.ctx.save(); CAD.ctx.globalAlpha=0.4; CAD.ctx.setLineDash([4,3]);
            for(var gi=0;gi<CAD.editTarget.length;gi++){
                var ghost=cloneShape(CAD.editTarget[gi]);
                moveShape(ghost, gdx, gdy);
                var gbb=shapeBounds(ghost);
                var gs1=CAD.w2s(gbb.minX,gbb.minY), gs2=CAD.w2s(gbb.maxX,gbb.maxY);
                CAD.ctx.strokeStyle="#4ec9b0"; CAD.ctx.lineWidth=1;
                CAD.ctx.strokeRect(gs1.x,gs1.y,gs2.x-gs1.x,gs2.y-gs1.y);
            }
            CAD.ctx.restore();
        }

        // Selection box preview
        if(CAD.selBoxActive && CAD.modo==="select"){
            CAD.set("selBoxEnd", {x:wx, y:wy});
            var previewSel = selectByBox(CAD.selBoxStart.x, CAD.selBoxStart.y, wx, wy);
            CAD.set("selectedShapes", previewSel);
            CAD.redraw();
            if(CAD.drawSelectionBox) CAD.drawSelectionBox(CAD.selBoxStart.x, CAD.selBoxStart.y, wx, wy);
        }

        // Preview
        if(CAD.pIni && CAD.modo!=="select" && CAD.modo!=="pan"){
            var pf=CAD.orthoOn?CAD.orthoSnap(CAD.pIni.x,CAD.pIni.y,wx,wy):{x:wx,y:wy};
            CAD.redraw();
            if(CAD.drawTrackingLines) CAD.drawTrackingLines(trackLines);
            if(sp2 && CAD.drawSnapMarker) CAD.drawSnapMarker(sp2.x,sp2.y,sp2.t,sp2.c);

            var sa=CAD.w2s(CAD.pIni.x,CAD.pIni.y), sb=CAD.w2s(pf.x,pf.y);
            CAD.ctx.save(); CAD.ctx.setLineDash([6,4]); CAD.ctx.strokeStyle="#4ec9b0"; CAD.ctx.lineWidth=1;
            if(CAD.modo==="linea"||CAD.modo==="arco"){ CAD.ctx.beginPath();CAD.ctx.moveTo(sa.x,sa.y);CAD.ctx.lineTo(sb.x,sb.y);CAD.ctx.stroke(); }
            else if(CAD.modo==="rectangulo"){ CAD.ctx.beginPath();CAD.ctx.rect(sa.x,sa.y,sb.x-sa.x,sb.y-sa.y);CAD.ctx.stroke(); }
            else if(CAD.modo==="circulo"){ var rd=CAD.D(CAD.pIni.x,CAD.pIni.y,pf.x,pf.y)*CAD.cam.zoom;CAD.ctx.beginPath();CAD.ctx.arc(sa.x,sa.y,rd,0,Math.PI*2);CAD.ctx.stroke(); }
            else if(CAD.modo==="elipse"){ CAD.ctx.beginPath();CAD.ctx.ellipse(sa.x,sa.y,Math.abs(sb.x-sa.x),Math.abs(sb.y-sa.y),0,0,Math.PI*2);CAD.ctx.stroke(); }
            else if(CAD.modo==="cota"){
                CAD.ctx.strokeStyle="#ffdd00"; CAD.ctx.lineWidth=1;
                CAD.ctx.beginPath();CAD.ctx.moveTo(sa.x,sa.y);CAD.ctx.lineTo(sb.x,sb.y);CAD.ctx.stroke();
                var cdist=CAD.D(CAD.pIni.x,CAD.pIni.y,pf.x,pf.y);
                CAD.ctx.fillStyle="#ffdd00"; CAD.ctx.font="bold 11px Consolas,monospace"; CAD.ctx.textAlign="center";
                CAD.ctx.fillText(CAD.F(CAD.toU(cdist))+" "+CAD.unidad,(sa.x+sb.x)/2,(sa.y+sb.y)/2-10);
            }
            CAD.ctx.restore();

            if(CAD.stLen) CAD.stLen.textContent=CAD.F(CAD.toU(CAD.D(CAD.pIni.x,CAD.pIni.y,pf.x,pf.y)));
            if(CAD.stAng) CAD.stAng.textContent=CAD.F(CAD.Ang(CAD.pIni.x,CAD.pIni.y,pf.x,pf.y))+"\u00b0";
        }
        else if(!CAD.pIni && CAD.modo!=="select" && CAD.modo!=="pan" && !CAD.poliEnCurso && !CAD.dibujando){
            CAD.redraw();
            if(CAD.drawTrackingLines) CAD.drawTrackingLines(trackLines);
            if(sp2 && CAD.drawSnapMarker) CAD.drawSnapMarker(sp2.x,sp2.y,sp2.t,sp2.c);
        }

        // Polyline preview
        if(CAD.poliEnCurso && CAD.ptsPoli.length>0){
            CAD.redraw();
            if(sp2 && CAD.drawSnapMarker) CAD.drawSnapMarker(sp2.x,sp2.y,sp2.t,sp2.c);
            CAD.ctx.save(); CAD.ctx.strokeStyle=CAD.currentColor; CAD.ctx.lineWidth=1.5; CAD.ctx.beginPath();
            var pk0=CAD.w2s(CAD.ptsPoli[0].x,CAD.ptsPoli[0].y); CAD.ctx.moveTo(pk0.x,pk0.y);
            for(var k=1;k<CAD.ptsPoli.length;k++){var pkk=CAD.w2s(CAD.ptsPoli[k].x,CAD.ptsPoli[k].y);CAD.ctx.lineTo(pkk.x,pkk.y);}
            var curS=CAD.w2s(wx,wy);
            CAD.ctx.setLineDash([6,4]); CAD.ctx.strokeStyle="#4ec9b0"; CAD.ctx.lineTo(curS.x,curS.y); CAD.ctx.stroke(); CAD.ctx.restore();
            var last=CAD.ptsPoli[CAD.ptsPoli.length-1];
            if(CAD.stLen) CAD.stLen.textContent=CAD.F(CAD.toU(CAD.D(last.x,last.y,wx,wy)));
            if(CAD.stAng) CAD.stAng.textContent=CAD.F(CAD.Ang(last.x,last.y,wx,wy))+"\u00b0";
        }

        // Freehand
        if(CAD.dibujando && CAD.modo==="mano"){
            var ult=CAD.formas[CAD.formas.length-1]; ult.pts.push({x:wx,y:wy,z:CAD.currentZ});
            var sp1=CAD.w2s(CAD.xPrev,CAD.yPrev), sp22=CAD.w2s(wx,wy);
            CAD.ctx.beginPath(); CAD.ctx.strokeStyle=CAD.currentColor; CAD.ctx.lineWidth=1.5;
            CAD.ctx.moveTo(sp1.x,sp1.y); CAD.ctx.lineTo(sp22.x,sp22.y); CAD.ctx.stroke();
            CAD.set("xPrev",wx); CAD.set("yPrev",wy);
        }
    });

    CAD.canvas.addEventListener("mouseup", function(e){
        if(CAD.isPanning){ CAD.set("isPanning",false); CAD.canvas.style.cursor=CAD.modo==="pan"?"grab":"crosshair"; return; }

        if(CAD.selBoxActive && CAD.modo==="select"){
            CAD.set("selBoxActive", false);
            var wp = getWorld(e);
            var dx = Math.abs(wp.x - CAD.selBoxStart.x);
            var dy = Math.abs(wp.y - CAD.selBoxStart.y);
            var minDrag = 5 / CAD.cam.zoom;

            if(dx < minDrag && dy < minDrag){
                CAD.set("selectedShapes", []);
                CAD.callbacks.selectShape?.(CAD.hitTest(CAD.selBoxStart.x, CAD.selBoxStart.y));
            } else {
                var sel = selectByBox(CAD.selBoxStart.x, CAD.selBoxStart.y, wp.x, wp.y);
                CAD.set("selectedShapes", sel);
                if(sel.length === 1){
                    CAD.callbacks.selectShape?.(sel[0]);
                } else if(sel.length > 1){
                    CAD.set("formaSel", -1);
                    CAD.callbacks.showProps?.(-1);
                } else {
                    CAD.callbacks.selectShape?.(-1);
                }
                CAD.redraw();
                CAD.callbacks.updTree?.();
            }
            return;
        }

        if(CAD.dibujando && CAD.modo==="mano"){ CAD.set("dibujando",false); CAD.saveHist(); CAD.redraw(); CAD.callbacks.updTree?.(); CAD.callbacks.selectShape?.(CAD.formas.length-1); }
    });

    CAD.canvas.addEventListener("contextmenu", function(e){ e.preventDefault(); });
};

// ── Keyboard events ──
CAD.initKeyboard = function(setMode, toggleOrtho, toggleSnapOnOff, flash, undo){
    document.addEventListener("keydown", function(e){
        // Solo procesar si CAD esta activo (overlay visible)
        if(!window._cadActive) return;

        if(e.ctrlKey && e.key==="z"){ e.preventDefault(); undo(); return; }

        if(e.ctrlKey && e.key==="c"){
            var sel = getSelection();
            if(sel.length > 0){
                e.preventDefault();
                var copies = [];
                for(var ci=0;ci<sel.length;ci++) copies.push(cloneShape(CAD.formas[sel[ci]]));
                CAD.set("clipboard", copies);
                flash("Copiado: " + sel.length + " obj");
            }
            return;
        }

        if(e.ctrlKey && e.key==="v"){
            if(CAD.clipboard && CAD.clipboard.length > 0){
                e.preventDefault();
                CAD.set("editOp", "paste");
                CAD.set("editBase", null);
                var clones = [];
                for(var pi=0;pi<CAD.clipboard.length;pi++) clones.push(cloneShape(CAD.clipboard[pi]));
                CAD.set("editTarget", clones);
                flash("Pegar: click punto destino");
            }
            return;
        }

        if(e.ctrlKey && e.key==="d"){
            var sel2 = getSelection();
            if(sel2.length > 0){
                e.preventDefault();
                CAD.saveHist();
                var pasteOffset = CAD.tamGrid || 10;
                var newSel = [];
                for(var di=0;di<sel2.length;di++){
                    var dup = cloneShape(CAD.formas[sel2[di]]);
                    moveShape(dup, pasteOffset, pasteOffset);
                    CAD.formas.push(dup);
                    newSel.push(CAD.formas.length-1);
                }
                CAD.set("selectedShapes", newSel);
                CAD.set("formaSel", newSel.length===1?newSel[0]:-1);
                CAD.saveHist(); CAD.redraw(); CAD.callbacks.updTree?.();
                flash("Duplicado: " + sel2.length + " obj");
            }
            return;
        }

        if(e.key==="Escape"){
            e.preventDefault(); CAD.set("pIni",null);
            CAD.set("selBoxActive", false);
            CAD.set("selectedShapes", []);
            if(CAD.editOp){ CAD.set("editOp",null); CAD.set("editBase",null); CAD.set("editTarget",null); flash("Cancelado"); CAD.redraw(); return; }
            if(CAD.poliEnCurso){
                if(CAD.ptsPoli.length>1){
                    CAD.formas.push({tipo:"polilinea",pts:JSON.parse(JSON.stringify(CAD.ptsPoli)),color:CAD.currentColor});
                    CAD.saveHist(); CAD.callbacks.updTree?.();
                }
                CAD.set("poliEnCurso",false); CAD.ptsPoli.length=0;
            }
            CAD.redraw(); flash("Cancelado"); return;
        }
        if(e.key==="F8"){ e.preventDefault(); toggleOrtho(); return; }
        if(e.key==="F3"){ e.preventDefault(); toggleSnapOnOff(); return; }
        if(e.key==="F11"){ e.preventDefault(); CAD.set("trackingOn",!CAD.trackingOn); var tgl=document.getElementById("tglOTrack"); if(tgl) tgl.classList.toggle("on",CAD.trackingOn); flash("OTRACK "+(CAD.trackingOn?"ON":"OFF")); return; }
        if(e.key==="Delete"){
            if(CAD.selectedShapes && CAD.selectedShapes.length > 0){
                CAD.saveHist();
                var sorted = CAD.selectedShapes.slice().sort(function(a,b){return b-a;});
                for(var dli=0; dli<sorted.length; dli++) CAD.formas.splice(sorted[dli],1);
                CAD.set("selectedShapes", []);
                CAD.set("formaSel", -1);
                CAD.saveHist(); CAD.redraw(); CAD.callbacks.updTree?.(); CAD.callbacks.showProps?.(-1);
                return;
            }
            if(CAD.formaSel>=0){
                CAD.saveHist(); CAD.formas.splice(CAD.formaSel,1); CAD.set("formaSel",-1); CAD.saveHist(); CAD.redraw(); CAD.callbacks.updTree?.(); CAD.callbacks.showProps?.(-1); return;
            }
        }
        var t=e.target; if(t.tagName==="INPUT"||t.tagName==="TEXTAREA") return;

        if(CAD.dynInputOn && CAD.modo!=="select" && CAD.modo!=="pan" && !e.ctrlKey && !e.altKey){
            if(/^[0-9.\-]$/.test(e.key)){
                e.preventDefault();
                CAD.set("dynFocused", true);
                if(CAD.dynXInput) CAD.dynXInput.value = e.key;
                if(CAD.dynXInput) CAD.dynXInput.focus();
                if(CAD.showDynInput) CAD.showDynInput(CAD.pIni ? "dist" : "coord");
                return;
            }
        }

        if(e.key==="m" && !e.ctrlKey){
            var msel = getSelection();
            if(msel.length > 0){
                CAD.set("editOp", "move");
                CAD.set("editBase", null);
                CAD.set("editTarget", msel);
                flash("Mover: click punto base");
                return;
            }
        }

        if(e.ctrlKey && e.shiftKey && e.key==="C"){
            var csel = getSelection();
            if(csel.length > 0){
                e.preventDefault();
                var copies2 = [];
                for(var ci2=0;ci2<csel.length;ci2++) copies2.push(cloneShape(CAD.formas[csel[ci2]]));
                CAD.set("clipboard", copies2);
                CAD.set("editOp", "paste");
                CAD.set("editBase", null);
                CAD.set("editTarget", copies2.map(function(s){return cloneShape(s);}));
                flash("Copiar con base: click punto base");
                return;
            }
        }

        if(e.key==="t" && !e.ctrlKey){
            CAD.set("editOp", "trim");
            flash("Trim: click segmento a recortar");
            return;
        }

        if(e.key==="x" && !e.ctrlKey){
            var xsel = getSelection();
            if(xsel.length > 0){
                CAD.set("editOp", "scale");
                CAD.set("editBase", null);
                CAD.set("editTarget", xsel);
                flash("Escalar: click punto base, luego factor");
                return;
            }
        }

        if(e.key==="g" && !e.ctrlKey && !e.shiftKey){
            var gsel = getSelection();
            if(gsel.length > 1){
                CAD.saveHist();
                var children = [];
                var sorted = gsel.slice().sort(function(a,b){return b-a;});
                for(var gii=0;gii<gsel.length;gii++) children.push(cloneShape(CAD.formas[gsel[gii]]));
                for(var gri=0;gri<sorted.length;gri++) CAD.formas.splice(sorted[gri],1);
                var grp = {tipo:"grupo", color:"#ffffff", z:0, children:children, hidden:false};
                CAD.formas.push(grp);
                CAD.set("formaSel", CAD.formas.length-1);
                CAD.set("selectedShapes", []);
                CAD.saveHist(); CAD.invalidateSnapCache(); CAD.redraw(); CAD.callbacks.updTree?.();
                flash("Grupo creado: " + children.length + " objetos");
                return;
            }
        }

        if(e.key==="G" && e.shiftKey && !e.ctrlKey){
            var uidx = CAD.formaSel;
            if(uidx >= 0 && CAD.formas[uidx] && CAD.formas[uidx].tipo==="grupo"){
                CAD.saveHist();
                var uch = CAD.formas[uidx].children;
                CAD.formas.splice(uidx, 1);
                var newSel = [];
                for(var ui=0;ui<uch.length;ui++){
                    CAD.formas.push(uch[ui]);
                    newSel.push(CAD.formas.length-1);
                }
                CAD.set("formaSel", -1);
                CAD.set("selectedShapes", newSel);
                CAD.saveHist(); CAD.invalidateSnapCache(); CAD.redraw(); CAD.callbacks.updTree?.();
                flash("Desagrupado: " + uch.length + " objetos");
                return;
            }
        }

        var km={v:"select",h:"pan",l:"linea",p:"polilinea",r:"rectangulo",c:"circulo",e:"elipse",a:"arco",f:"mano",d:"cota",z:null};
        if(e.key==="z" && !e.ctrlKey){ CAD.zoomFit(); return; }
        if(km[e.key]!==undefined && km[e.key]!==null) setMode(km[e.key]);
    });
};
