// ===================== RENDER.JS - Layer 4 =====================
// Canvas 2D drawing functions
"use strict";

import * as S from './state.js';
import { D, toU, F } from './math.js';
import { canvas, ctx, canvasHint, zoomIndicator } from './dom.js';
import { w2s, s2w, w2s3 } from './projection.js';

export function redraw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#1a1a2e";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    drawGrid();
    drawOrigin();
    for(var i=0;i<S.formas.length;i++){
        if(!S.formas[i].hidden){
            var isSel = (i===S.formaSel) || (S.selectedShapes && S.selectedShapes.indexOf(i)>=0);
            drawShape(S.formas[i], isSel);
        }
    }
    canvasHint.style.display = S.formas.length > 0 ? "none" : "";
    zoomIndicator.textContent = Math.round(S.cam.zoom*100)+"%";
}

export function drawGrid(){
    if(!S.gridOn) return;
    ctx.save();
    var tl = s2w(0,0), br = s2w(canvas.width,canvas.height);
    var spacing = S.tamGrid;
    var screenSpacing = spacing * S.cam.zoom;
    while(screenSpacing < 15) { spacing *= 5; screenSpacing = spacing * S.cam.zoom; }
    while(screenSpacing > 150) { spacing /= 5; screenSpacing = spacing * S.cam.zoom; }
    var minY = Math.min(tl.y, br.y), maxY = Math.max(tl.y, br.y);
    var startX = Math.floor(tl.x / spacing) * spacing;
    var startY = Math.floor(minY / spacing) * spacing;
    var endX = Math.ceil(br.x / spacing) * spacing;
    var endY = Math.ceil(maxY / spacing) * spacing;
    ctx.strokeStyle = "rgba(60,60,100,0.25)";
    ctx.lineWidth = 0.5;
    for(var wx=startX; wx<=endX; wx+=spacing){
        var sp = w2s(wx,0);
        ctx.beginPath(); ctx.moveTo(sp.x,0); ctx.lineTo(sp.x,canvas.height); ctx.stroke();
    }
    for(var wy=startY; wy<=endY; wy+=spacing){
        var sp2 = w2s(0,wy);
        ctx.beginPath(); ctx.moveTo(0,sp2.y); ctx.lineTo(canvas.width,sp2.y); ctx.stroke();
    }
    ctx.restore();
}

export function drawOrigin(){
    ctx.save();
    var o = w2s(0,0);
    var len = 40;
    var axes;
    if(S.currentView === "2d-top") axes = [{dx:1,dy:0,lbl:"X",col:"rgba(220,80,80,0.5)"},{dx:0,dy:-1,lbl:"Y",col:"rgba(80,200,80,0.5)"}];
    else if(S.currentView === "2d-front") axes = [{dx:1,dy:0,lbl:"X",col:"rgba(220,80,80,0.5)"},{dx:0,dy:-1,lbl:"Z",col:"rgba(80,80,220,0.5)"}];
    else if(S.currentView === "2d-side") axes = [{dx:1,dy:0,lbl:"Y",col:"rgba(80,200,80,0.5)"},{dx:0,dy:-1,lbl:"Z",col:"rgba(80,80,220,0.5)"}];
    else axes = [{dx:1,dy:0,lbl:"X",col:"rgba(220,80,80,0.5)"},{dx:0,dy:-1,lbl:"Y",col:"rgba(80,200,80,0.5)"}];

    for(var i=0;i<axes.length;i++){
        var ax = axes[i];
        ctx.strokeStyle = ax.col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(o.x+ax.dx*len,o.y+ax.dy*len); ctx.stroke();
        ctx.fillStyle = ax.col; ctx.font = "bold 10px sans-serif";
        ctx.fillText(ax.lbl, o.x+ax.dx*len+(ax.dx?4:-4), o.y+ax.dy*len+(ax.dy?-4:4));
    }
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath(); ctx.arc(o.x,o.y,3,0,Math.PI*2); ctx.fill();
    ctx.restore();
}

export function drawShape(f,sel){
    ctx.save();
    ctx.strokeStyle = sel ? "#ffcc00" : (f.color||"#ffffff");
    var baseLw = f.lw || (sel ? 3 : 2);
    ctx.lineWidth = Math.max(baseLw / Math.max(S.cam.zoom, 0.2), 1.5);
    var fz = f.z||0;

    if(f.tipo==="linea"){
        var a=w2s3(f.x1,f.y1,f.z1||fz), b=w2s3(f.x2,f.y2,f.z2||fz);
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        if(sel){drawNode3(f.x1,f.y1,f.z1||fz);drawNode3(f.x2,f.y2,f.z2||fz);}
    } else if(f.tipo==="rectangulo"){
        var r1=w2s3(f.x,f.y,fz), r2=w2s3(f.x+f.w,f.y+f.h,fz);
        if(f.fill){ ctx.fillStyle=f.fill; ctx.fillRect(r1.x,r1.y,r2.x-r1.x,r2.y-r1.y); }
        ctx.beginPath(); ctx.rect(r1.x,r1.y,r2.x-r1.x,r2.y-r1.y); ctx.stroke();
        if(sel){drawNode3(f.x,f.y,fz);drawNode3(f.x+f.w,f.y,fz);drawNode3(f.x,f.y+f.h,fz);drawNode3(f.x+f.w,f.y+f.h,fz);}
    } else if(f.tipo==="circulo"){
        var cc=w2s3(f.cx,f.cy,fz), sr=f.r*S.cam.zoom;
        ctx.beginPath(); ctx.arc(cc.x,cc.y,sr,0,Math.PI*2);
        if(f.fill){ ctx.fillStyle=f.fill; ctx.fill(); }
        ctx.stroke();
        if(sel) drawNode3(f.cx,f.cy,fz);
    } else if(f.tipo==="elipse"){
        var ce=w2s3(f.cx,f.cy,fz);
        ctx.beginPath(); ctx.ellipse(ce.x,ce.y,f.rx*S.cam.zoom,f.ry*S.cam.zoom,0,0,Math.PI*2); ctx.stroke();
        if(sel) drawNode3(f.cx,f.cy,fz);
    } else if(f.tipo==="polilinea"){
        var pz0=f.pts[0].z||fz;
        var p0=w2s3(f.pts[0].x,f.pts[0].y,pz0);
        ctx.beginPath(); ctx.moveTo(p0.x,p0.y);
        for(var j=1;j<f.pts.length;j++){var pj=w2s3(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);ctx.lineTo(pj.x,pj.y);}
        ctx.stroke();
        if(sel) for(var k=0;k<f.pts.length;k++) drawNode3(f.pts[k].x,f.pts[k].y,f.pts[k].z||fz);
    } else if(f.tipo==="arco"){
        var a1=w2s3(f.x1,f.y1,fz), ac=w2s3(f.cx,f.cy,fz), a2=w2s3(f.x2,f.y2,fz);
        ctx.beginPath(); ctx.moveTo(a1.x,a1.y); ctx.quadraticCurveTo(ac.x,ac.y,a2.x,a2.y); ctx.stroke();
        if(sel){drawNode3(f.x1,f.y1,fz);drawNode3(f.x2,f.y2,fz);}
    } else if(f.tipo==="arco_circular"){
        var ac2=w2s3(f.cx,f.cy,fz);
        var sr2=f.r*S.cam.zoom;
        ctx.beginPath();
        // Canvas arc goes clockwise for positive angles; our Y is up, screen Y is down
        // so we negate the angles to flip
        ctx.arc(ac2.x, ac2.y, sr2, -f.startAngle, -f.endAngle, true);
        ctx.stroke();
        if(sel) drawNode3(f.cx,f.cy,fz);
    } else if(f.tipo==="mano"){
        var m0=w2s3(f.pts[0].x,f.pts[0].y,f.pts[0].z||fz);
        ctx.beginPath(); ctx.moveTo(m0.x,m0.y);
        for(var m=1;m<f.pts.length;m++){var pm=w2s3(f.pts[m].x,f.pts[m].y,f.pts[m].z||fz);ctx.lineTo(pm.x,pm.y);}
        ctx.stroke();
    }

    // GRUPO: draw all children recursively
    else if(f.tipo==="grupo" && f.children){
        for(var gi=0; gi<f.children.length; gi++){
            drawShape(f.children[gi], sel);
        }
    }

    // COTA (dimension annotation)
    else if(f.tipo==="cota"){
        drawDimension(f, sel);
    }

    if(f.tipo!=="cota") drawDimLabel(f);
    ctx.restore();
}

function drawDimLabel(f){
    ctx.save();
    ctx.fillStyle="rgba(100,200,255,0.85)";
    ctx.font=Math.max(9, 11/Math.max(S.cam.zoom,0.3))+"px Consolas,monospace";
    ctx.textAlign="center";

    if(f.tipo==="linea"){
        var sm=w2s((f.x1+f.x2)/2,(f.y1+f.y2)/2);
        var l=toU(D(f.x1,f.y1,f.x2,f.y2));
        ctx.fillText(F(l)+" "+S.unidad,sm.x,sm.y-8);
    } else if(f.tipo==="rectangulo"){
        var st=w2s(f.x+f.w/2,f.y);
        ctx.fillText(F(toU(Math.abs(f.w)))+" "+S.unidad,st.x,st.y-6);
        var sl=w2s(f.x,f.y+f.h/2);
        ctx.save(); ctx.translate(sl.x-8,sl.y); ctx.rotate(-Math.PI/2);
        ctx.fillText(F(toU(Math.abs(f.h)))+" "+S.unidad,0,0); ctx.restore();
    } else if(f.tipo==="circulo"){
        var sc=w2s(f.cx,f.cy-f.r);
        ctx.fillText("r="+F(toU(f.r))+" "+S.unidad,sc.x,sc.y-6);
    } else if(f.tipo==="elipse"){
        var se=w2s(f.cx,f.cy-f.ry);
        ctx.fillText(F(toU(f.rx*2))+"x"+F(toU(f.ry*2))+" "+S.unidad,se.x,se.y-6);
    }
    ctx.restore();
}

// Draw selection box (Window=blue solid, Crossing=green dashed)
export function drawSelectionBox(x1,y1,x2,y2){
    var s1 = w2s(x1,y1), s2 = w2s(x2,y2);
    var leftToRight = (x2 >= x1);  // Window mode
    ctx.save();
    if(leftToRight){
        // Window: blue solid outline, light blue transparent fill
        ctx.strokeStyle = "rgba(80,150,255,0.9)";
        ctx.fillStyle = "rgba(80,150,255,0.12)";
        ctx.setLineDash([]);
    } else {
        // Crossing: green dashed outline, light green transparent fill
        ctx.strokeStyle = "rgba(80,220,120,0.9)";
        ctx.fillStyle = "rgba(80,220,120,0.12)";
        ctx.setLineDash([6,4]);
    }
    ctx.lineWidth = 1.5;
    var rx = Math.min(s1.x,s2.x), ry = Math.min(s1.y,s2.y);
    var rw = Math.abs(s2.x-s1.x), rh = Math.abs(s2.y-s1.y);
    ctx.fillRect(rx,ry,rw,rh);
    ctx.strokeRect(rx,ry,rw,rh);
    ctx.restore();
}

function drawNode3(x3,y3,z3){
    var s=w2s3(x3,y3,z3);
    ctx.save(); ctx.fillStyle="#4ec9b0";
    ctx.beginPath(); ctx.rect(s.x-3,s.y-3,6,6); ctx.fill(); ctx.restore();
}

// ── Draw dimension annotation (cota) ──
function drawDimension(f, sel){
    ctx.save();
    var fz = f.z||0;
    var s1 = w2s3(f.x1, f.y1, fz);
    var s2 = w2s3(f.x2, f.y2, fz);

    // Direction vector and perpendicular
    var dx = s2.x - s1.x, dy = s2.y - s1.y;
    var len = Math.sqrt(dx*dx + dy*dy);
    if(len < 1){ ctx.restore(); return; }
    var ux = dx/len, uy = dy/len;       // unit along dimension
    var nx = -uy, ny = ux;              // unit perpendicular (screen coords)

    // Offset in screen pixels (consistent visual offset regardless of zoom)
    var offPx = (f.offset || 10) * S.cam.zoom;
    var extLen = offPx + 6;  // extension line goes a bit past dimension line

    // Extension line endpoints
    var e1x = s1.x + nx * extLen, e1y = s1.y + ny * extLen;
    var e2x = s2.x + nx * extLen, e2y = s2.y + ny * extLen;

    // Dimension line endpoints (at offset distance)
    var d1x = s1.x + nx * offPx, d1y = s1.y + ny * offPx;
    var d2x = s2.x + nx * offPx, d2y = s2.y + ny * offPx;

    var dimColor = sel ? "#ffcc00" : (f.color || "#ffdd00");

    // Extension lines (from point toward dimension line, with small gap)
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    var gap = 3;  // gap from measurement point
    ctx.beginPath();
    ctx.moveTo(s1.x + nx*gap, s1.y + ny*gap);
    ctx.lineTo(e1x, e1y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s2.x + nx*gap, s2.y + ny*gap);
    ctx.lineTo(e2x, e2y);
    ctx.stroke();

    // Dimension line
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(d1x, d1y);
    ctx.lineTo(d2x, d2y);
    ctx.stroke();

    // Arrowheads (filled triangles at each end)
    var arrowLen = 8, arrowW = 3;
    // Arrow at d1 (pointing toward d1)
    ctx.fillStyle = dimColor;
    ctx.beginPath();
    ctx.moveTo(d1x, d1y);
    ctx.lineTo(d1x + ux*arrowLen + nx*arrowW, d1y + uy*arrowLen + ny*arrowW);
    ctx.lineTo(d1x + ux*arrowLen - nx*arrowW, d1y + uy*arrowLen - ny*arrowW);
    ctx.closePath(); ctx.fill();
    // Arrow at d2 (pointing toward d2)
    ctx.beginPath();
    ctx.moveTo(d2x, d2y);
    ctx.lineTo(d2x - ux*arrowLen + nx*arrowW, d2y - uy*arrowLen + ny*arrowW);
    ctx.lineTo(d2x - ux*arrowLen - nx*arrowW, d2y - uy*arrowLen - ny*arrowW);
    ctx.closePath(); ctx.fill();

    // Text: distance in user units
    var worldDist = D(f.x1, f.y1, f.x2, f.y2);
    var label = f.text || (F(toU(worldDist)) + " " + S.unidad);
    var midX = (d1x + d2x) / 2;
    var midY = (d1y + d2y) / 2;

    // Rotate text along dimension line direction
    var angle = Math.atan2(dy, dx);
    // Keep text readable (not upside down)
    if(angle > Math.PI/2 || angle < -Math.PI/2) angle += Math.PI;

    ctx.fillStyle = dimColor;
    var fontSize = Math.max(10, 12/Math.max(S.cam.zoom,0.3));
    ctx.font = "bold " + fontSize + "px Consolas,monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angle);
    // Background box for readability
    var textW = ctx.measureText(label).width;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(-textW/2 - 3, -fontSize - 2, textW + 6, fontSize + 2);
    ctx.fillStyle = dimColor;
    ctx.fillText(label, 0, -3);
    ctx.restore();

    // Selection nodes
    if(sel){
        drawNode3(f.x1, f.y1, fz);
        drawNode3(f.x2, f.y2, fz);
    }

    ctx.restore();
}
