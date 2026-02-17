// ===================== SNAP.JS - Layer 3 =====================
// Snap system: getSnapPoints, findSnap, tracking, markers
"use strict";

var CAD = window.CAD;

// Segment intersection helper
function segIntersect(s1,s2){
    var dx1=s1.x2-s1.x1,dy1=s1.y2-s1.y1,dx2=s2.x2-s2.x1,dy2=s2.y2-s2.y1;
    var det=dx1*dy2-dy1*dx2;
    if(Math.abs(det)<1e-10) return null;
    var t=((s2.x1-s1.x1)*dy2-(s2.y1-s1.y1)*dx2)/det;
    var u=((s2.x1-s1.x1)*dy1-(s2.y1-s1.y1)*dx1)/det;
    if(t>=0&&t<=1&&u>=0&&u<=1) return {x:s1.x1+t*dx1,y:s1.y1+t*dy1};
    return null;
}

// ── Nodos de sección IFC importados (endpoints extra para snap) ──
var _sectionNodes = [];   // [{x,y}] en coordenadas CAD (cm)

CAD.addSectionNodes = function(nodes){
    _sectionNodes = nodes || [];
    _snapCache = null; _snapCacheKey = "";
    console.log("[CAD snap] "+_sectionNodes.length+" nodos de seccion IFC importados");
};

CAD.clearSectionNodes = function(){
    _sectionNodes = [];
    _snapCache = null; _snapCacheKey = "";
};

// ── Snap cache: invalidate on shape changes ──
var _snapCache = null;
var _snapCacheKey = "";

CAD.invalidateSnapCache = function(){ _snapCache = null; _snapCacheKey = ""; };

CAD.getSnapPoints = function() {
    // Cache key based on shapes count + view (cheap check)
    var key = CAD.formas.length + "|" + CAD.currentView;
    if(_snapCache && _snapCacheKey === key) return _snapCache;

    var pts=[];
    for(var i=0;i<CAD.formas.length;i++){
        var f=CAD.formas[i];
        if(f.hidden) continue;
        var fz=f.z||0;
        if(f.tipo==="linea"){
            if(CAD.snapCfg.endpoint){
                pts.push(CAD.snap3(f.x1,f.y1,f.z1||fz,"endpoint","#e06c5a"));
                pts.push(CAD.snap3(f.x2,f.y2,f.z2||fz,"endpoint","#e06c5a"));
            }
            if(CAD.snapCfg.midpoint){
                pts.push(CAD.snap3((f.x1+f.x2)/2,(f.y1+f.y2)/2,((f.z1||fz)+(f.z2||fz))/2,"midpoint","#4ec9b0"));
            }
        } else if(f.tipo==="rectangulo"){
            var ex=f.x+f.w, ey=f.y+f.h;
            if(CAD.snapCfg.endpoint){
                pts.push(CAD.snap3(f.x,f.y,fz,"endpoint","#e06c5a"));
                pts.push(CAD.snap3(ex,f.y,fz,"endpoint","#e06c5a"));
                pts.push(CAD.snap3(f.x,ey,fz,"endpoint","#e06c5a"));
                pts.push(CAD.snap3(ex,ey,fz,"endpoint","#e06c5a"));
            }
            if(CAD.snapCfg.midpoint){
                pts.push(CAD.snap3(f.x+f.w/2,f.y,fz,"midpoint","#4ec9b0"));
                pts.push(CAD.snap3(f.x+f.w/2,ey,fz,"midpoint","#4ec9b0"));
                pts.push(CAD.snap3(f.x,f.y+f.h/2,fz,"midpoint","#4ec9b0"));
                pts.push(CAD.snap3(ex,f.y+f.h/2,fz,"midpoint","#4ec9b0"));
            }
            if(CAD.snapCfg.center){
                pts.push(CAD.snap3(f.x+f.w/2,f.y+f.h/2,fz,"center","#dcdcaa"));
            }
        } else if(f.tipo==="circulo"){
            if(CAD.snapCfg.center) pts.push(CAD.snap3(f.cx,f.cy,fz,"center","#dcdcaa"));
            if(CAD.snapCfg.quadrant){
                pts.push(CAD.snap3(f.cx+f.r,f.cy,fz,"quadrant","#c586c0"));
                pts.push(CAD.snap3(f.cx-f.r,f.cy,fz,"quadrant","#c586c0"));
                pts.push(CAD.snap3(f.cx,f.cy+f.r,fz,"quadrant","#c586c0"));
                pts.push(CAD.snap3(f.cx,f.cy-f.r,fz,"quadrant","#c586c0"));
            }
        } else if(f.tipo==="elipse"){
            if(CAD.snapCfg.center) pts.push(CAD.snap3(f.cx,f.cy,fz,"center","#dcdcaa"));
            if(CAD.snapCfg.quadrant){
                pts.push(CAD.snap3(f.cx+f.rx,f.cy,fz,"quadrant","#c586c0"));
                pts.push(CAD.snap3(f.cx-f.rx,f.cy,fz,"quadrant","#c586c0"));
                pts.push(CAD.snap3(f.cx,f.cy+f.ry,fz,"quadrant","#c586c0"));
                pts.push(CAD.snap3(f.cx,f.cy-f.ry,fz,"quadrant","#c586c0"));
            }
        } else if(f.tipo==="arco_circular"){
            if(CAD.snapCfg.center) pts.push(CAD.snap3(f.cx,f.cy,fz,"center","#dcdcaa"));
            if(CAD.snapCfg.endpoint){
                // start and end points of the arc
                pts.push(CAD.snap3(f.cx+Math.cos(f.startAngle)*f.r, f.cy+Math.sin(f.startAngle)*f.r, fz, "endpoint","#e06c5a"));
                pts.push(CAD.snap3(f.cx+Math.cos(f.endAngle)*f.r, f.cy+Math.sin(f.endAngle)*f.r, fz, "endpoint","#e06c5a"));
            }
        } else if(f.tipo==="cota"){
            if(CAD.snapCfg.endpoint){
                pts.push(CAD.snap3(f.x1,f.y1,fz,"endpoint","#e06c5a"));
                pts.push(CAD.snap3(f.x2,f.y2,fz,"endpoint","#e06c5a"));
            }
            if(CAD.snapCfg.midpoint){
                pts.push(CAD.snap3((f.x1+f.x2)/2,(f.y1+f.y2)/2,fz,"midpoint","#4ec9b0"));
            }
        } else if(f.tipo==="polilinea" && f.pts.length>1){
            for(var j=0;j<f.pts.length;j++){
                if(CAD.snapCfg.endpoint) pts.push(CAD.snap3(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz,"endpoint","#e06c5a"));
            }
            for(var k=1;k<f.pts.length;k++){
                if(CAD.snapCfg.midpoint) pts.push(CAD.snap3((f.pts[k-1].x+f.pts[k].x)/2,(f.pts[k-1].y+f.pts[k].y)/2,((f.pts[k-1].z||fz)+(f.pts[k].z||fz))/2,"midpoint","#4ec9b0"));
            }
        }
    }

    // Section nodes from IFC (imported as endpoint snaps)
    if(CAD.snapCfg.endpoint && _sectionNodes.length > 0){
        for(var sn=0; sn<_sectionNodes.length; sn++){
            pts.push({x:_sectionNodes[sn].x, y:_sectionNodes[sn].y, t:"endpoint", c:"#e06c5a"});
        }
    }

    // Intersection points
    if(CAD.snapCfg.intersection){
        var segs=[];
        for(var si=0;si<CAD.formas.length;si++){
            var sf=CAD.formas[si];
            if(sf.hidden) continue;
            var sfz=sf.z||0;
            if(sf.tipo==="linea"){var p1=CAD.proj3to2(sf.x1,sf.y1,sf.z1||sfz),p2=CAD.proj3to2(sf.x2,sf.y2,sf.z2||sfz);segs.push({x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y});}
            else if(sf.tipo==="rectangulo"){
                var rp=CAD.proj3to2(sf.x,sf.y,sfz),rp2=CAD.proj3to2(sf.x+sf.w,sf.y,sfz),rp3=CAD.proj3to2(sf.x+sf.w,sf.y+sf.h,sfz),rp4=CAD.proj3to2(sf.x,sf.y+sf.h,sfz);
                segs.push({x1:rp.x,y1:rp.y,x2:rp2.x,y2:rp2.y});
                segs.push({x1:rp2.x,y1:rp2.y,x2:rp3.x,y2:rp3.y});
                segs.push({x1:rp3.x,y1:rp3.y,x2:rp4.x,y2:rp4.y});
                segs.push({x1:rp4.x,y1:rp4.y,x2:rp.x,y2:rp.y});
            }
            else if(sf.tipo==="polilinea") for(var sj=1;sj<sf.pts.length;sj++){
                var pp1=CAD.proj3to2(sf.pts[sj-1].x,sf.pts[sj-1].y,sf.pts[sj-1].z||sfz);
                var pp2=CAD.proj3to2(sf.pts[sj].x,sf.pts[sj].y,sf.pts[sj].z||sfz);
                segs.push({x1:pp1.x,y1:pp1.y,x2:pp2.x,y2:pp2.y});
            }
        }
        for(var a=0;a<segs.length;a++) for(var b=a+1;b<segs.length;b++){
            var ip=segIntersect(segs[a],segs[b]);
            if(ip) pts.push({x:ip.x,y:ip.y,t:"intersection",c:"#569cd6"});
        }
    }
    _snapCache = pts;
    _snapCacheKey = key;
    return pts;
};

CAD.getNearestOnSegments = function(x,y){
    if(!CAD.snapCfg.nearest) return null;
    var best=null, md=14/CAD.cam.zoom;
    var segs=[];
    for(var i=0;i<CAD.formas.length;i++){
        var f=CAD.formas[i];
        if(f.hidden) continue;
        var fz=f.z||0;
        if(f.tipo==="linea"){var np1=CAD.proj3to2(f.x1,f.y1,f.z1||fz),np2=CAD.proj3to2(f.x2,f.y2,f.z2||fz);segs.push({x1:np1.x,y1:np1.y,x2:np2.x,y2:np2.y});}
        else if(f.tipo==="rectangulo"){
            var nr=CAD.proj3to2(f.x,f.y,fz),nr2=CAD.proj3to2(f.x+f.w,f.y,fz),nr3=CAD.proj3to2(f.x+f.w,f.y+f.h,fz),nr4=CAD.proj3to2(f.x,f.y+f.h,fz);
            segs.push({x1:nr.x,y1:nr.y,x2:nr2.x,y2:nr2.y});
            segs.push({x1:nr2.x,y1:nr2.y,x2:nr3.x,y2:nr3.y});
            segs.push({x1:nr3.x,y1:nr3.y,x2:nr4.x,y2:nr4.y});
            segs.push({x1:nr4.x,y1:nr4.y,x2:nr.x,y2:nr.y});
        }
        else if(f.tipo==="polilinea") for(var j=1;j<f.pts.length;j++){
            var npp1=CAD.proj3to2(f.pts[j-1].x,f.pts[j-1].y,f.pts[j-1].z||fz);
            var npp2=CAD.proj3to2(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
            segs.push({x1:npp1.x,y1:npp1.y,x2:npp2.x,y2:npp2.y});
        }
    }
    for(var k=0;k<segs.length;k++){
        var s=segs[k],dx=s.x2-s.x1,dy=s.y2-s.y1,len=dx*dx+dy*dy;
        if(len===0) continue;
        var u=Math.max(0,Math.min(1,((x-s.x1)*dx+(y-s.y1)*dy)/len));
        var px=s.x1+u*dx,py=s.y1+u*dy,d=CAD.D(x,y,px,py);
        if(d<md){md=d; best={x:px,y:py,t:"nearest",c:"#9cdcfe"};}
    }
    // Nearest on circles/ellipses
    for(var ci=0;ci<CAD.formas.length;ci++){
        var cf=CAD.formas[ci];
        if(cf.hidden) continue;
        var cfz=cf.z||0;
        if(cf.tipo==="circulo"){
            var cc2=CAD.proj3to2(cf.cx,cf.cy,cfz);
            var da=Math.atan2(y-cc2.y,x-cc2.x);
            var px2=cc2.x+Math.cos(da)*cf.r,py2=cc2.y+Math.sin(da)*cf.r;
            var d2=CAD.D(x,y,px2,py2);
            if(d2<md){md=d2; best={x:px2,y:py2,t:"nearest",c:"#9cdcfe"};}
        } else if(cf.tipo==="elipse"){
            var ce2=CAD.proj3to2(cf.cx,cf.cy,cfz);
            var ea=Math.atan2(y-ce2.y,x-ce2.x);
            var px3=ce2.x+Math.cos(ea)*cf.rx,py3=ce2.y+Math.sin(ea)*cf.ry;
            var d3=CAD.D(x,y,px3,py3);
            if(d3<md){md=d3; best={x:px3,y:py3,t:"nearest",c:"#9cdcfe"};}
        }
    }
    return best;
};

CAD.getPerpSnap = function(x,y){
    if(!CAD.snapCfg.perpendicular||!CAD.pIni) return null;
    var best=null, md=15/CAD.cam.zoom;
    var segs=[];
    for(var i=0;i<CAD.formas.length;i++){
        var f=CAD.formas[i]; if(f.hidden) continue;
        var fz=f.z||0;
        if(f.tipo==="linea"){var pp1=CAD.proj3to2(f.x1,f.y1,f.z1||fz),pp2=CAD.proj3to2(f.x2,f.y2,f.z2||fz);segs.push({x1:pp1.x,y1:pp1.y,x2:pp2.x,y2:pp2.y});}
        else if(f.tipo==="rectangulo"){
            var pr=CAD.proj3to2(f.x,f.y,fz),pr2=CAD.proj3to2(f.x+f.w,f.y,fz),pr3=CAD.proj3to2(f.x+f.w,f.y+f.h,fz),pr4=CAD.proj3to2(f.x,f.y+f.h,fz);
            segs.push({x1:pr.x,y1:pr.y,x2:pr2.x,y2:pr2.y});
            segs.push({x1:pr2.x,y1:pr2.y,x2:pr3.x,y2:pr3.y});
            segs.push({x1:pr3.x,y1:pr3.y,x2:pr4.x,y2:pr4.y});
            segs.push({x1:pr4.x,y1:pr4.y,x2:pr.x,y2:pr.y});
        }
        else if(f.tipo==="polilinea") for(var j=1;j<f.pts.length;j++){
            var ppp1=CAD.proj3to2(f.pts[j-1].x,f.pts[j-1].y,f.pts[j-1].z||fz);
            var ppp2=CAD.proj3to2(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
            segs.push({x1:ppp1.x,y1:ppp1.y,x2:ppp2.x,y2:ppp2.y});
        }
    }
    for(var k=0;k<segs.length;k++){
        var s=segs[k],dx=s.x2-s.x1,dy=s.y2-s.y1,len=dx*dx+dy*dy;
        if(len===0) continue;
        var u=((CAD.pIni.x-s.x1)*dx+(CAD.pIni.y-s.y1)*dy)/len;
        if(u<0||u>1) continue;
        var px=s.x1+u*dx,py=s.y1+u*dy;
        var d2=CAD.D(x,y,px,py);
        if(d2<md){md=d2; best={x:px,y:py,t:"perpendicular",c:"#d7ba7d"};}
    }
    return best;
};

CAD.findSnap = function(wx,wy){
    if(!CAD.snapOn) return null;
    var thresh = 14 / CAD.cam.zoom;
    var pts=CAD.getSnapPoints();
    var best=null, md=thresh;
    for(var i=0;i<pts.length;i++){
        var d=CAD.D(wx,wy,pts[i].x,pts[i].y);
        if(d<md){md=d; best=pts[i];}
    }
    if(best) return best;
    var perp=CAD.getPerpSnap(wx,wy);
    if(perp) return perp;
    return CAD.getNearestOnSegments(wx,wy);
};

// Draw snap marker (in screen coords)
CAD.drawSnapMarker = function(wx,wy,type,color){
    if(!CAD.ctx) return;
    var sp = CAD.w2s(wx,wy);
    var x=sp.x, y=sp.y;
    CAD.ctx.save();
    CAD.ctx.strokeStyle=color; CAD.ctx.fillStyle=color; CAD.ctx.lineWidth=2;
    var s=8;

    if(type==="endpoint"){
        CAD.ctx.beginPath(); CAD.ctx.rect(x-s,y-s,s*2,s*2); CAD.ctx.stroke();
    } else if(type==="midpoint"){
        CAD.ctx.beginPath(); CAD.ctx.moveTo(x,y-s); CAD.ctx.lineTo(x+s,y+s); CAD.ctx.lineTo(x-s,y+s); CAD.ctx.closePath(); CAD.ctx.stroke();
    } else if(type==="center"){
        CAD.ctx.beginPath(); CAD.ctx.arc(x,y,s,0,Math.PI*2); CAD.ctx.stroke();
    } else if(type==="quadrant"){
        CAD.ctx.beginPath(); CAD.ctx.moveTo(x,y-s); CAD.ctx.lineTo(x+s,y); CAD.ctx.lineTo(x,y+s); CAD.ctx.lineTo(x-s,y); CAD.ctx.closePath(); CAD.ctx.stroke();
    } else if(type==="intersection"){
        CAD.ctx.beginPath(); CAD.ctx.moveTo(x-s,y-s); CAD.ctx.lineTo(x+s,y+s); CAD.ctx.moveTo(x+s,y-s); CAD.ctx.lineTo(x-s,y+s); CAD.ctx.stroke();
    } else if(type==="perpendicular"){
        CAD.ctx.beginPath(); CAD.ctx.moveTo(x-s,y+s); CAD.ctx.lineTo(x-s,y-s); CAD.ctx.lineTo(x+s,y-s); CAD.ctx.stroke();
        CAD.ctx.beginPath(); CAD.ctx.rect(x-s,y-s,s,s); CAD.ctx.stroke();
    } else if(type==="nearest"){
        CAD.ctx.beginPath(); CAD.ctx.moveTo(x-s,y-s); CAD.ctx.lineTo(x+s,y+s); CAD.ctx.lineTo(x-s,y+s); CAD.ctx.lineTo(x+s,y-s); CAD.ctx.closePath(); CAD.ctx.stroke();
    } else if(type==="extension"){
        CAD.ctx.beginPath(); CAD.ctx.moveTo(x-s,y); CAD.ctx.lineTo(x+s,y); CAD.ctx.moveTo(x,y-s); CAD.ctx.lineTo(x,y+s); CAD.ctx.stroke();
    }

    // Label
    CAD.ctx.font="bold 10px Consolas,monospace";
    var lbl=type.charAt(0).toUpperCase()+type.slice(1);
    var tw=CAD.ctx.measureText(lbl).width;
    CAD.ctx.fillStyle="rgba(0,0,0,0.75)";
    CAD.ctx.fillRect(x-tw/2-3,y+s+2,tw+6,13);
    CAD.ctx.fillStyle=color;
    CAD.ctx.textAlign="center";
    CAD.ctx.fillText(lbl,x,y+s+12);
    CAD.ctx.restore();
};

// ===================== OBJECT SNAP TRACKING =====================
CAD.getTrackingLines = function(wx, wy){
    if(!CAD.trackingOn || !CAD.snapOn) return [];
    var lines = [];
    var thresh = CAD.trackThreshold / CAD.cam.zoom;
    var pts = CAD.getSnapPoints();
    if(CAD.pIni) pts.push({x:CAD.pIni.x, y:CAD.pIni.y, t:"start", c:"#4ec9b0"});

    for(var i = 0; i < pts.length; i++){
        var p = pts[i];
        if(Math.abs(wy - p.y) < thresh && Math.abs(wx - p.x) > thresh){
            lines.push({x1:p.x,y1:p.y,x2:wx,y2:p.y,snapPt:p,axis:"h",snapY:p.y});
        }
        if(Math.abs(wx - p.x) < thresh && Math.abs(wy - p.y) > thresh){
            lines.push({x1:p.x,y1:p.y,x2:p.x,y2:wy,snapPt:p,axis:"v",snapX:p.x});
        }
    }
    return lines;
};

CAD.drawTrackingLines = function(lines){
    if(lines.length === 0 || !CAD.ctx) return;
    CAD.ctx.save();
    CAD.ctx.setLineDash([3, 5]);
    CAD.ctx.lineWidth = 0.8;

    for(var i = 0; i < lines.length; i++){
        var tl = lines[i];
        var s1 = CAD.w2s(tl.x1, tl.y1);
        var s2 = CAD.w2s(tl.x2, tl.y2);

        CAD.ctx.strokeStyle = "#d7ba7d";
        CAD.ctx.globalAlpha = 0.7;
        CAD.ctx.beginPath();
        CAD.ctx.moveTo(s1.x, s1.y);
        CAD.ctx.lineTo(s2.x, s2.y);
        CAD.ctx.stroke();

        var ms = 4;
        CAD.ctx.globalAlpha = 0.9;
        CAD.ctx.strokeStyle = tl.snapPt.c || "#d7ba7d";
        CAD.ctx.beginPath();
        CAD.ctx.moveTo(s1.x, s1.y - ms);
        CAD.ctx.lineTo(s1.x + ms, s1.y);
        CAD.ctx.lineTo(s1.x, s1.y + ms);
        CAD.ctx.lineTo(s1.x - ms, s1.y);
        CAD.ctx.closePath();
        CAD.ctx.stroke();
    }
    CAD.ctx.globalAlpha = 1;
    CAD.ctx.restore();
};

CAD.applyTracking = function(wx, wy){
    if(!CAD.trackingOn || !CAD.snapOn) return {x: wx, y: wy, tracked: false};
    var thresh = CAD.trackThreshold / CAD.cam.zoom;
    var pts = CAD.getSnapPoints();
    if(CAD.pIni) pts.push({x:CAD.pIni.x, y:CAD.pIni.y, t:"start", c:"#4ec9b0"});

    var bestH = null, bestV = null;
    var minDH = thresh, minDV = thresh;

    for(var i = 0; i < pts.length; i++){
        var p = pts[i];
        var dh = Math.abs(wy - p.y);
        var dv = Math.abs(wx - p.x);
        if(dh < minDH && Math.abs(wx - p.x) > thresh){ minDH = dh; bestH = p; }
        if(dv < minDV && Math.abs(wy - p.y) > thresh){ minDV = dv; bestV = p; }
    }

    var rx = wx, ry = wy, tracked = false;
    if(bestH && bestV){
        rx = bestV.x; ry = bestH.y; tracked = true;
    } else if(bestV){
        rx = bestV.x; tracked = true;
    } else if(bestH){
        ry = bestH.y; tracked = true;
    }
    return {x: rx, y: ry, tracked: tracked};
};
