// ===================== RENDER.JS - Layer 4 =====================
// Canvas 2D drawing functions
"use strict";

var CAD = window.CAD;

CAD.redraw = function(){
    if(!CAD.ctx || !CAD.canvas) return;
    CAD.ctx.clearRect(0,0,CAD.canvas.width,CAD.canvas.height);
    CAD.ctx.fillStyle = CAD.bgColor || "#1a1a2e";
    CAD.ctx.fillRect(0,0,CAD.canvas.width,CAD.canvas.height);
    drawGrid();
    drawOrigin();
    for(var i=0;i<CAD.formas.length;i++){
        if(!CAD.formas[i].hidden){
            var isSel = (i===CAD.formaSel) || (CAD.selectedShapes && CAD.selectedShapes.indexOf(i)>=0);
            drawShape(CAD.formas[i], isSel);
        }
    }
    if(CAD.canvasHint) CAD.canvasHint.style.display = CAD.formas.length > 0 ? "none" : "";
    if(CAD.zoomIndicator) CAD.zoomIndicator.textContent = Math.round(CAD.cam.zoom*100)+"%";
};

function drawGrid(){
    if(!CAD.gridOn) return;
    CAD.ctx.save();
    var tl = CAD.s2w(0,0), br = CAD.s2w(CAD.canvas.width,CAD.canvas.height);
    var spacing = CAD.tamGrid;
    var screenSpacing = spacing * CAD.cam.zoom;
    while(screenSpacing < 15) { spacing *= 5; screenSpacing = spacing * CAD.cam.zoom; }
    while(screenSpacing > 150) { spacing /= 5; screenSpacing = spacing * CAD.cam.zoom; }
    var minY = Math.min(tl.y, br.y), maxY = Math.max(tl.y, br.y);
    var startX = Math.floor(tl.x / spacing) * spacing;
    var startY = Math.floor(minY / spacing) * spacing;
    var endX = Math.ceil(br.x / spacing) * spacing;
    var endY = Math.ceil(maxY / spacing) * spacing;
    CAD.ctx.strokeStyle = CAD.gridColor || "rgba(60,60,100,0.25)";
    CAD.ctx.lineWidth = 0.5;
    for(var wx=startX; wx<=endX; wx+=spacing){
        var sp = CAD.w2s(wx,0);
        CAD.ctx.beginPath(); CAD.ctx.moveTo(sp.x,0); CAD.ctx.lineTo(sp.x,CAD.canvas.height); CAD.ctx.stroke();
    }
    for(var wy=startY; wy<=endY; wy+=spacing){
        var sp2 = CAD.w2s(0,wy);
        CAD.ctx.beginPath(); CAD.ctx.moveTo(0,sp2.y); CAD.ctx.lineTo(CAD.canvas.width,sp2.y); CAD.ctx.stroke();
    }
    CAD.ctx.restore();
}

function drawOrigin(){
    CAD.ctx.save();
    var o = CAD.w2s(0,0);
    var len = 40;
    var axes;
    if(CAD.currentView === "2d-top") axes = [{dx:1,dy:0,lbl:"X",col:"rgba(220,80,80,0.5)"},{dx:0,dy:-1,lbl:"Y",col:"rgba(80,200,80,0.5)"}];
    else if(CAD.currentView === "2d-front") axes = [{dx:1,dy:0,lbl:"X",col:"rgba(220,80,80,0.5)"},{dx:0,dy:-1,lbl:"Z",col:"rgba(80,80,220,0.5)"}];
    else if(CAD.currentView === "2d-side") axes = [{dx:1,dy:0,lbl:"Y",col:"rgba(80,200,80,0.5)"},{dx:0,dy:-1,lbl:"Z",col:"rgba(80,80,220,0.5)"}];
    else axes = [{dx:1,dy:0,lbl:"X",col:"rgba(220,80,80,0.5)"},{dx:0,dy:-1,lbl:"Y",col:"rgba(80,200,80,0.5)"}];

    for(var i=0;i<axes.length;i++){
        var ax = axes[i];
        CAD.ctx.strokeStyle = ax.col; CAD.ctx.lineWidth = 1.5;
        CAD.ctx.beginPath(); CAD.ctx.moveTo(o.x,o.y); CAD.ctx.lineTo(o.x+ax.dx*len,o.y+ax.dy*len); CAD.ctx.stroke();
        CAD.ctx.fillStyle = ax.col; CAD.ctx.font = "bold 10px sans-serif";
        CAD.ctx.fillText(ax.lbl, o.x+ax.dx*len+(ax.dx?4:-4), o.y+ax.dy*len+(ax.dy?-4:4));
    }
    CAD.ctx.fillStyle = "rgba(255,255,255,0.3)";
    CAD.ctx.beginPath(); CAD.ctx.arc(o.x,o.y,3,0,Math.PI*2); CAD.ctx.fill();
    CAD.ctx.restore();
}

function drawShape(f,sel){
    CAD.ctx.save();
    CAD.ctx.strokeStyle = sel ? "#ffcc00" : (f.color||"#ffffff");
    var baseLw = f.lw || (sel ? 3 : 2);
    CAD.ctx.lineWidth = Math.max(baseLw / Math.max(CAD.cam.zoom, 0.2), 1.5);
    var fz = f.z||0;

    if(f.tipo==="linea"){
        var a=CAD.w2s3(f.x1,f.y1,f.z1||fz), b=CAD.w2s3(f.x2,f.y2,f.z2||fz);
        CAD.ctx.beginPath(); CAD.ctx.moveTo(a.x,a.y); CAD.ctx.lineTo(b.x,b.y); CAD.ctx.stroke();
        if(sel){drawNode3(f.x1,f.y1,f.z1||fz);drawNode3(f.x2,f.y2,f.z2||fz);}
    } else if(f.tipo==="rectangulo"){
        var r1=CAD.w2s3(f.x,f.y,fz), r2=CAD.w2s3(f.x+f.w,f.y+f.h,fz);
        if(f.fill){ CAD.ctx.fillStyle=f.fill; CAD.ctx.fillRect(r1.x,r1.y,r2.x-r1.x,r2.y-r1.y); }
        CAD.ctx.beginPath(); CAD.ctx.rect(r1.x,r1.y,r2.x-r1.x,r2.y-r1.y); CAD.ctx.stroke();
        if(sel){drawNode3(f.x,f.y,fz);drawNode3(f.x+f.w,f.y,fz);drawNode3(f.x,f.y+f.h,fz);drawNode3(f.x+f.w,f.y+f.h,fz);}
    } else if(f.tipo==="circulo"){
        var cc=CAD.w2s3(f.cx,f.cy,fz), sr=f.r*CAD.cam.zoom;
        CAD.ctx.beginPath(); CAD.ctx.arc(cc.x,cc.y,sr,0,Math.PI*2);
        if(f.fill){ CAD.ctx.fillStyle=f.fill; CAD.ctx.fill(); }
        CAD.ctx.stroke();
        if(sel) drawNode3(f.cx,f.cy,fz);
    } else if(f.tipo==="elipse"){
        var ce=CAD.w2s3(f.cx,f.cy,fz);
        CAD.ctx.beginPath(); CAD.ctx.ellipse(ce.x,ce.y,f.rx*CAD.cam.zoom,f.ry*CAD.cam.zoom,0,0,Math.PI*2); CAD.ctx.stroke();
        if(sel) drawNode3(f.cx,f.cy,fz);
    } else if(f.tipo==="polilinea"){
        var pz0=f.pts[0].z||fz;
        var p0=CAD.w2s3(f.pts[0].x,f.pts[0].y,pz0);
        CAD.ctx.beginPath(); CAD.ctx.moveTo(p0.x,p0.y);
        for(var j=1;j<f.pts.length;j++){var pj=CAD.w2s3(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);CAD.ctx.lineTo(pj.x,pj.y);}
        CAD.ctx.stroke();
        if(sel) for(var k=0;k<f.pts.length;k++) drawNode3(f.pts[k].x,f.pts[k].y,f.pts[k].z||fz);
    } else if(f.tipo==="arco"){
        var a1=CAD.w2s3(f.x1,f.y1,fz), ac=CAD.w2s3(f.cx,f.cy,fz), a2=CAD.w2s3(f.x2,f.y2,fz);
        CAD.ctx.beginPath(); CAD.ctx.moveTo(a1.x,a1.y); CAD.ctx.quadraticCurveTo(ac.x,ac.y,a2.x,a2.y); CAD.ctx.stroke();
        if(sel){drawNode3(f.x1,f.y1,fz);drawNode3(f.x2,f.y2,fz);}
    } else if(f.tipo==="arco_circular"){
        var ac2=CAD.w2s3(f.cx,f.cy,fz);
        var sr2=f.r*CAD.cam.zoom;
        CAD.ctx.beginPath();
        // Canvas arc goes clockwise for positive angles; our Y is up, screen Y is down
        // so we negate the angles to flip
        CAD.ctx.arc(ac2.x, ac2.y, sr2, -f.startAngle, -f.endAngle, true);
        CAD.ctx.stroke();
        if(sel) drawNode3(f.cx,f.cy,fz);
    } else if(f.tipo==="mano"){
        var m0=CAD.w2s3(f.pts[0].x,f.pts[0].y,f.pts[0].z||fz);
        CAD.ctx.beginPath(); CAD.ctx.moveTo(m0.x,m0.y);
        for(var m=1;m<f.pts.length;m++){var pm=CAD.w2s3(f.pts[m].x,f.pts[m].y,f.pts[m].z||fz);CAD.ctx.lineTo(pm.x,pm.y);}
        CAD.ctx.stroke();
    }

    // TEXTO (text annotation)
    else if(f.tipo==="texto"){
        var tp=CAD.w2s3(f.x,f.y,fz);
        var fontSize = Math.max(10, (f.fontSize||14)/Math.max(CAD.cam.zoom,0.2));
        CAD.ctx.font = (f.bold?"bold ":"") + fontSize + "px " + (f.fontFamily||"Consolas,monospace");
        CAD.ctx.fillStyle = sel ? "#ffcc00" : (f.color||"#ffffff");
        CAD.ctx.textAlign = f.align||"left";
        CAD.ctx.textBaseline = "middle";
        CAD.ctx.fillText(f.text||"", tp.x, tp.y);
        if(sel) drawNode3(f.x,f.y,fz);
    }

    // FLECHA (arrow line)
    else if(f.tipo==="flecha"){
        var fa=CAD.w2s3(f.x1,f.y1,f.z1||fz), fb=CAD.w2s3(f.x2,f.y2,f.z2||fz);
        CAD.ctx.beginPath(); CAD.ctx.moveTo(fa.x,fa.y); CAD.ctx.lineTo(fb.x,fb.y); CAD.ctx.stroke();
        // Arrowhead at endpoint
        var adx=fb.x-fa.x, ady=fb.y-fa.y, alen=Math.sqrt(adx*adx+ady*ady);
        if(alen>2){
            var aux=adx/alen, auy=ady/alen, anx=-auy, any=aux;
            var aLen=10, aW=4;
            CAD.ctx.fillStyle = sel ? "#ffcc00" : (f.color||"#ffffff");
            CAD.ctx.beginPath();
            CAD.ctx.moveTo(fb.x, fb.y);
            CAD.ctx.lineTo(fb.x-aux*aLen+anx*aW, fb.y-auy*aLen+any*aW);
            CAD.ctx.lineTo(fb.x-aux*aLen-anx*aW, fb.y-auy*aLen-any*aW);
            CAD.ctx.closePath(); CAD.ctx.fill();
        }
        if(sel){drawNode3(f.x1,f.y1,f.z1||fz);drawNode3(f.x2,f.y2,f.z2||fz);}
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

    if(f.tipo!=="cota" && f.tipo!=="texto") drawDimLabel(f);
    CAD.ctx.restore();
}

function drawDimLabel(f){
    if(CAD.showDimLabels === false) return;
    CAD.ctx.save();
    CAD.ctx.fillStyle="rgba(100,200,255,0.85)";
    CAD.ctx.font=Math.max(9, 11/Math.max(CAD.cam.zoom,0.3))+"px Consolas,monospace";
    CAD.ctx.textAlign="center";

    if(f.tipo==="linea"){
        var sm=CAD.w2s((f.x1+f.x2)/2,(f.y1+f.y2)/2);
        var l=CAD.toU(CAD.D(f.x1,f.y1,f.x2,f.y2));
        CAD.ctx.fillText(CAD.F(l)+" "+CAD.unidad,sm.x,sm.y-8);
    } else if(f.tipo==="rectangulo"){
        var st=CAD.w2s(f.x+f.w/2,f.y);
        CAD.ctx.fillText(CAD.F(CAD.toU(Math.abs(f.w)))+" "+CAD.unidad,st.x,st.y-6);
        var sl=CAD.w2s(f.x,f.y+f.h/2);
        CAD.ctx.save(); CAD.ctx.translate(sl.x-8,sl.y); CAD.ctx.rotate(-Math.PI/2);
        CAD.ctx.fillText(CAD.F(CAD.toU(Math.abs(f.h)))+" "+CAD.unidad,0,0); CAD.ctx.restore();
    } else if(f.tipo==="circulo"){
        var sc=CAD.w2s(f.cx,f.cy-f.r);
        CAD.ctx.fillText("r="+CAD.F(CAD.toU(f.r))+" "+CAD.unidad,sc.x,sc.y-6);
    } else if(f.tipo==="elipse"){
        var se=CAD.w2s(f.cx,f.cy-f.ry);
        CAD.ctx.fillText(CAD.F(CAD.toU(f.rx*2))+"x"+CAD.F(CAD.toU(f.ry*2))+" "+CAD.unidad,se.x,se.y-6);
    }
    CAD.ctx.restore();
}

// Draw selection box (Window=blue solid, Crossing=green dashed)
CAD.drawSelectionBox = function(x1,y1,x2,y2){
    if(!CAD.ctx) return;
    var s1 = CAD.w2s(x1,y1), s2 = CAD.w2s(x2,y2);
    var leftToRight = (x2 >= x1);  // Window mode
    CAD.ctx.save();
    if(leftToRight){
        // Window: blue solid outline, light blue transparent fill
        CAD.ctx.strokeStyle = "rgba(80,150,255,0.9)";
        CAD.ctx.fillStyle = "rgba(80,150,255,0.12)";
        CAD.ctx.setLineDash([]);
    } else {
        // Crossing: green dashed outline, light green transparent fill
        CAD.ctx.strokeStyle = "rgba(80,220,120,0.9)";
        CAD.ctx.fillStyle = "rgba(80,220,120,0.12)";
        CAD.ctx.setLineDash([6,4]);
    }
    CAD.ctx.lineWidth = 1.5;
    var rx = Math.min(s1.x,s2.x), ry = Math.min(s1.y,s2.y);
    var rw = Math.abs(s2.x-s1.x), rh = Math.abs(s2.y-s1.y);
    CAD.ctx.fillRect(rx,ry,rw,rh);
    CAD.ctx.strokeRect(rx,ry,rw,rh);
    CAD.ctx.restore();
};

function drawNode3(x3,y3,z3){
    var s=CAD.w2s3(x3,y3,z3);
    CAD.ctx.save(); CAD.ctx.fillStyle="#4ec9b0";
    CAD.ctx.beginPath(); CAD.ctx.rect(s.x-3,s.y-3,6,6); CAD.ctx.fill(); CAD.ctx.restore();
}

// ── Draw dimension annotation (cota) ──
function drawDimension(f, sel){
    CAD.ctx.save();
    var fz = f.z||0;
    var s1 = CAD.w2s3(f.x1, f.y1, fz);
    var s2 = CAD.w2s3(f.x2, f.y2, fz);

    // Direction vector and perpendicular
    var dx = s2.x - s1.x, dy = s2.y - s1.y;
    var len = Math.sqrt(dx*dx + dy*dy);
    if(len < 1){ CAD.ctx.restore(); return; }
    var ux = dx/len, uy = dy/len;       // unit along dimension
    var nx = -uy, ny = ux;              // unit perpendicular (screen coords)

    // Offset in screen pixels (consistent visual offset regardless of zoom)
    var offPx = (f.offset || 10) * CAD.cam.zoom;
    var extLen = offPx + 6;  // extension line goes a bit past dimension line

    // Extension line endpoints
    var e1x = s1.x + nx * extLen, e1y = s1.y + ny * extLen;
    var e2x = s2.x + nx * extLen, e2y = s2.y + ny * extLen;

    // Dimension line endpoints (at offset distance)
    var d1x = s1.x + nx * offPx, d1y = s1.y + ny * offPx;
    var d2x = s2.x + nx * offPx, d2y = s2.y + ny * offPx;

    var dimColor = sel ? "#ffcc00" : (f.color || "#ffdd00");

    // Extension lines (from point toward dimension line, with small gap)
    CAD.ctx.strokeStyle = dimColor;
    CAD.ctx.lineWidth = 0.8;
    CAD.ctx.setLineDash([]);
    var gap = 3;  // gap from measurement point
    CAD.ctx.beginPath();
    CAD.ctx.moveTo(s1.x + nx*gap, s1.y + ny*gap);
    CAD.ctx.lineTo(e1x, e1y);
    CAD.ctx.stroke();
    CAD.ctx.beginPath();
    CAD.ctx.moveTo(s2.x + nx*gap, s2.y + ny*gap);
    CAD.ctx.lineTo(e2x, e2y);
    CAD.ctx.stroke();

    // Dimension line
    CAD.ctx.lineWidth = 1.2;
    CAD.ctx.beginPath();
    CAD.ctx.moveTo(d1x, d1y);
    CAD.ctx.lineTo(d2x, d2y);
    CAD.ctx.stroke();

    // Arrowheads (filled triangles at each end)
    var arrowLen = 8, arrowW = 3;
    // Arrow at d1 (pointing toward d1)
    CAD.ctx.fillStyle = dimColor;
    CAD.ctx.beginPath();
    CAD.ctx.moveTo(d1x, d1y);
    CAD.ctx.lineTo(d1x + ux*arrowLen + nx*arrowW, d1y + uy*arrowLen + ny*arrowW);
    CAD.ctx.lineTo(d1x + ux*arrowLen - nx*arrowW, d1y + uy*arrowLen - ny*arrowW);
    CAD.ctx.closePath(); CAD.ctx.fill();
    // Arrow at d2 (pointing toward d2)
    CAD.ctx.beginPath();
    CAD.ctx.moveTo(d2x, d2y);
    CAD.ctx.lineTo(d2x - ux*arrowLen + nx*arrowW, d2y - uy*arrowLen + ny*arrowW);
    CAD.ctx.lineTo(d2x - ux*arrowLen - nx*arrowW, d2y - uy*arrowLen - ny*arrowW);
    CAD.ctx.closePath(); CAD.ctx.fill();

    // Text: distance in user units
    var worldDist = CAD.D(f.x1, f.y1, f.x2, f.y2);
    var label = f.text || (CAD.F(CAD.toU(worldDist)) + " " + CAD.unidad);
    var midX = (d1x + d2x) / 2;
    var midY = (d1y + d2y) / 2;

    // Rotate text along dimension line direction
    var angle = Math.atan2(dy, dx);
    // Keep text readable (not upside down)
    if(angle > Math.PI/2 || angle < -Math.PI/2) angle += Math.PI;

    CAD.ctx.fillStyle = dimColor;
    var fontSize = Math.max(10, 12/Math.max(CAD.cam.zoom,0.3));
    CAD.ctx.font = "bold " + fontSize + "px Consolas,monospace";
    CAD.ctx.textAlign = "center";
    CAD.ctx.textBaseline = "bottom";

    CAD.ctx.save();
    CAD.ctx.translate(midX, midY);
    CAD.ctx.rotate(angle);
    // Background box for readability
    var textW = CAD.ctx.measureText(label).width;
    CAD.ctx.fillStyle = "#1a1a2e";
    CAD.ctx.fillRect(-textW/2 - 3, -fontSize - 2, textW + 6, fontSize + 2);
    CAD.ctx.fillStyle = dimColor;
    CAD.ctx.fillText(label, 0, -3);
    CAD.ctx.restore();

    // Selection nodes
    if(sel){
        drawNode3(f.x1, f.y1, fz);
        drawNode3(f.x2, f.y2, fz);
    }

    CAD.ctx.restore();
}
