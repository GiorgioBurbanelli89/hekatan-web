// ===================== SNAP.JS - Layer 3 =====================
// Snap system: getSnapPoints, findSnap, tracking, markers
"use strict";

import * as S from './state.js';
import { D } from './math.js';
import { ctx } from './dom.js';
import { w2s, proj3to2, snap3 } from './projection.js';

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

// ── Snap cache: invalidate on shape changes ──
var _snapCache = null;
var _snapCacheKey = "";

export function invalidateSnapCache(){ _snapCache = null; _snapCacheKey = ""; }

export function getSnapPoints() {
    // Cache key based on shapes count + view (cheap check)
    var key = S.formas.length + "|" + S.currentView;
    if(_snapCache && _snapCacheKey === key) return _snapCache;

    var pts=[];
    for(var i=0;i<S.formas.length;i++){
        var f=S.formas[i];
        if(f.hidden) continue;
        var fz=f.z||0;
        if(f.tipo==="linea"){
            if(S.snapCfg.endpoint){
                pts.push(snap3(f.x1,f.y1,f.z1||fz,"endpoint","#e06c5a"));
                pts.push(snap3(f.x2,f.y2,f.z2||fz,"endpoint","#e06c5a"));
            }
            if(S.snapCfg.midpoint){
                pts.push(snap3((f.x1+f.x2)/2,(f.y1+f.y2)/2,((f.z1||fz)+(f.z2||fz))/2,"midpoint","#4ec9b0"));
            }
        } else if(f.tipo==="rectangulo"){
            var ex=f.x+f.w, ey=f.y+f.h;
            if(S.snapCfg.endpoint){
                pts.push(snap3(f.x,f.y,fz,"endpoint","#e06c5a"));
                pts.push(snap3(ex,f.y,fz,"endpoint","#e06c5a"));
                pts.push(snap3(f.x,ey,fz,"endpoint","#e06c5a"));
                pts.push(snap3(ex,ey,fz,"endpoint","#e06c5a"));
            }
            if(S.snapCfg.midpoint){
                pts.push(snap3(f.x+f.w/2,f.y,fz,"midpoint","#4ec9b0"));
                pts.push(snap3(f.x+f.w/2,ey,fz,"midpoint","#4ec9b0"));
                pts.push(snap3(f.x,f.y+f.h/2,fz,"midpoint","#4ec9b0"));
                pts.push(snap3(ex,f.y+f.h/2,fz,"midpoint","#4ec9b0"));
            }
            if(S.snapCfg.center){
                pts.push(snap3(f.x+f.w/2,f.y+f.h/2,fz,"center","#dcdcaa"));
            }
        } else if(f.tipo==="circulo"){
            if(S.snapCfg.center) pts.push(snap3(f.cx,f.cy,fz,"center","#dcdcaa"));
            if(S.snapCfg.quadrant){
                pts.push(snap3(f.cx+f.r,f.cy,fz,"quadrant","#c586c0"));
                pts.push(snap3(f.cx-f.r,f.cy,fz,"quadrant","#c586c0"));
                pts.push(snap3(f.cx,f.cy+f.r,fz,"quadrant","#c586c0"));
                pts.push(snap3(f.cx,f.cy-f.r,fz,"quadrant","#c586c0"));
            }
        } else if(f.tipo==="elipse"){
            if(S.snapCfg.center) pts.push(snap3(f.cx,f.cy,fz,"center","#dcdcaa"));
            if(S.snapCfg.quadrant){
                pts.push(snap3(f.cx+f.rx,f.cy,fz,"quadrant","#c586c0"));
                pts.push(snap3(f.cx-f.rx,f.cy,fz,"quadrant","#c586c0"));
                pts.push(snap3(f.cx,f.cy+f.ry,fz,"quadrant","#c586c0"));
                pts.push(snap3(f.cx,f.cy-f.ry,fz,"quadrant","#c586c0"));
            }
        } else if(f.tipo==="arco_circular"){
            if(S.snapCfg.center) pts.push(snap3(f.cx,f.cy,fz,"center","#dcdcaa"));
            if(S.snapCfg.endpoint){
                // start and end points of the arc
                pts.push(snap3(f.cx+Math.cos(f.startAngle)*f.r, f.cy+Math.sin(f.startAngle)*f.r, fz, "endpoint","#e06c5a"));
                pts.push(snap3(f.cx+Math.cos(f.endAngle)*f.r, f.cy+Math.sin(f.endAngle)*f.r, fz, "endpoint","#e06c5a"));
            }
        } else if(f.tipo==="cota"){
            if(S.snapCfg.endpoint){
                pts.push(snap3(f.x1,f.y1,fz,"endpoint","#e06c5a"));
                pts.push(snap3(f.x2,f.y2,fz,"endpoint","#e06c5a"));
            }
            if(S.snapCfg.midpoint){
                pts.push(snap3((f.x1+f.x2)/2,(f.y1+f.y2)/2,fz,"midpoint","#4ec9b0"));
            }
        } else if(f.tipo==="polilinea" && f.pts.length>1){
            for(var j=0;j<f.pts.length;j++){
                if(S.snapCfg.endpoint) pts.push(snap3(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz,"endpoint","#e06c5a"));
            }
            for(var k=1;k<f.pts.length;k++){
                if(S.snapCfg.midpoint) pts.push(snap3((f.pts[k-1].x+f.pts[k].x)/2,(f.pts[k-1].y+f.pts[k].y)/2,((f.pts[k-1].z||fz)+(f.pts[k].z||fz))/2,"midpoint","#4ec9b0"));
            }
        }
    }

    // Intersection points
    if(S.snapCfg.intersection){
        var segs=[];
        for(var si=0;si<S.formas.length;si++){
            var sf=S.formas[si];
            if(sf.hidden) continue;
            var sfz=sf.z||0;
            if(sf.tipo==="linea"){var p1=proj3to2(sf.x1,sf.y1,sf.z1||sfz),p2=proj3to2(sf.x2,sf.y2,sf.z2||sfz);segs.push({x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y});}
            else if(sf.tipo==="rectangulo"){
                var rp=proj3to2(sf.x,sf.y,sfz),rp2=proj3to2(sf.x+sf.w,sf.y,sfz),rp3=proj3to2(sf.x+sf.w,sf.y+sf.h,sfz),rp4=proj3to2(sf.x,sf.y+sf.h,sfz);
                segs.push({x1:rp.x,y1:rp.y,x2:rp2.x,y2:rp2.y});
                segs.push({x1:rp2.x,y1:rp2.y,x2:rp3.x,y2:rp3.y});
                segs.push({x1:rp3.x,y1:rp3.y,x2:rp4.x,y2:rp4.y});
                segs.push({x1:rp4.x,y1:rp4.y,x2:rp.x,y2:rp.y});
            }
            else if(sf.tipo==="polilinea") for(var sj=1;sj<sf.pts.length;sj++){
                var pp1=proj3to2(sf.pts[sj-1].x,sf.pts[sj-1].y,sf.pts[sj-1].z||sfz);
                var pp2=proj3to2(sf.pts[sj].x,sf.pts[sj].y,sf.pts[sj].z||sfz);
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
}

export function getNearestOnSegments(x,y){
    if(!S.snapCfg.nearest) return null;
    var best=null, md=14/S.cam.zoom;
    var segs=[];
    for(var i=0;i<S.formas.length;i++){
        var f=S.formas[i];
        if(f.hidden) continue;
        var fz=f.z||0;
        if(f.tipo==="linea"){var np1=proj3to2(f.x1,f.y1,f.z1||fz),np2=proj3to2(f.x2,f.y2,f.z2||fz);segs.push({x1:np1.x,y1:np1.y,x2:np2.x,y2:np2.y});}
        else if(f.tipo==="rectangulo"){
            var nr=proj3to2(f.x,f.y,fz),nr2=proj3to2(f.x+f.w,f.y,fz),nr3=proj3to2(f.x+f.w,f.y+f.h,fz),nr4=proj3to2(f.x,f.y+f.h,fz);
            segs.push({x1:nr.x,y1:nr.y,x2:nr2.x,y2:nr2.y});
            segs.push({x1:nr2.x,y1:nr2.y,x2:nr3.x,y2:nr3.y});
            segs.push({x1:nr3.x,y1:nr3.y,x2:nr4.x,y2:nr4.y});
            segs.push({x1:nr4.x,y1:nr4.y,x2:nr.x,y2:nr.y});
        }
        else if(f.tipo==="polilinea") for(var j=1;j<f.pts.length;j++){
            var npp1=proj3to2(f.pts[j-1].x,f.pts[j-1].y,f.pts[j-1].z||fz);
            var npp2=proj3to2(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
            segs.push({x1:npp1.x,y1:npp1.y,x2:npp2.x,y2:npp2.y});
        }
    }
    for(var k=0;k<segs.length;k++){
        var s=segs[k],dx=s.x2-s.x1,dy=s.y2-s.y1,len=dx*dx+dy*dy;
        if(len===0) continue;
        var u=Math.max(0,Math.min(1,((x-s.x1)*dx+(y-s.y1)*dy)/len));
        var px=s.x1+u*dx,py=s.y1+u*dy,d=D(x,y,px,py);
        if(d<md){md=d; best={x:px,y:py,t:"nearest",c:"#9cdcfe"};}
    }
    // Nearest on circles/ellipses
    for(var ci=0;ci<S.formas.length;ci++){
        var cf=S.formas[ci];
        if(cf.hidden) continue;
        var cfz=cf.z||0;
        if(cf.tipo==="circulo"){
            var cc2=proj3to2(cf.cx,cf.cy,cfz);
            var da=Math.atan2(y-cc2.y,x-cc2.x);
            var px2=cc2.x+Math.cos(da)*cf.r,py2=cc2.y+Math.sin(da)*cf.r;
            var d2=D(x,y,px2,py2);
            if(d2<md){md=d2; best={x:px2,y:py2,t:"nearest",c:"#9cdcfe"};}
        } else if(cf.tipo==="elipse"){
            var ce2=proj3to2(cf.cx,cf.cy,cfz);
            var ea=Math.atan2(y-ce2.y,x-ce2.x);
            var px3=ce2.x+Math.cos(ea)*cf.rx,py3=ce2.y+Math.sin(ea)*cf.ry;
            var d3=D(x,y,px3,py3);
            if(d3<md){md=d3; best={x:px3,y:py3,t:"nearest",c:"#9cdcfe"};}
        }
    }
    return best;
}

export function getPerpSnap(x,y){
    if(!S.snapCfg.perpendicular||!S.pIni) return null;
    var best=null, md=15/S.cam.zoom;
    var segs=[];
    for(var i=0;i<S.formas.length;i++){
        var f=S.formas[i]; if(f.hidden) continue;
        var fz=f.z||0;
        if(f.tipo==="linea"){var pp1=proj3to2(f.x1,f.y1,f.z1||fz),pp2=proj3to2(f.x2,f.y2,f.z2||fz);segs.push({x1:pp1.x,y1:pp1.y,x2:pp2.x,y2:pp2.y});}
        else if(f.tipo==="rectangulo"){
            var pr=proj3to2(f.x,f.y,fz),pr2=proj3to2(f.x+f.w,f.y,fz),pr3=proj3to2(f.x+f.w,f.y+f.h,fz),pr4=proj3to2(f.x,f.y+f.h,fz);
            segs.push({x1:pr.x,y1:pr.y,x2:pr2.x,y2:pr2.y});
            segs.push({x1:pr2.x,y1:pr2.y,x2:pr3.x,y2:pr3.y});
            segs.push({x1:pr3.x,y1:pr3.y,x2:pr4.x,y2:pr4.y});
            segs.push({x1:pr4.x,y1:pr4.y,x2:pr.x,y2:pr.y});
        }
        else if(f.tipo==="polilinea") for(var j=1;j<f.pts.length;j++){
            var ppp1=proj3to2(f.pts[j-1].x,f.pts[j-1].y,f.pts[j-1].z||fz);
            var ppp2=proj3to2(f.pts[j].x,f.pts[j].y,f.pts[j].z||fz);
            segs.push({x1:ppp1.x,y1:ppp1.y,x2:ppp2.x,y2:ppp2.y});
        }
    }
    for(var k=0;k<segs.length;k++){
        var s=segs[k],dx=s.x2-s.x1,dy=s.y2-s.y1,len=dx*dx+dy*dy;
        if(len===0) continue;
        var u=((S.pIni.x-s.x1)*dx+(S.pIni.y-s.y1)*dy)/len;
        if(u<0||u>1) continue;
        var px=s.x1+u*dx,py=s.y1+u*dy;
        var d2=D(x,y,px,py);
        if(d2<md){md=d2; best={x:px,y:py,t:"perpendicular",c:"#d7ba7d"};}
    }
    return best;
}

export function findSnap(wx,wy){
    if(!S.snapOn) return null;
    var thresh = 14 / S.cam.zoom;
    var pts=getSnapPoints();
    var best=null, md=thresh;
    for(var i=0;i<pts.length;i++){
        var d=D(wx,wy,pts[i].x,pts[i].y);
        if(d<md){md=d; best=pts[i];}
    }
    if(best) return best;
    var perp=getPerpSnap(wx,wy);
    if(perp) return perp;
    return getNearestOnSegments(wx,wy);
}

// Draw snap marker (in screen coords)
export function drawSnapMarker(wx,wy,type,color){
    var sp = w2s(wx,wy);
    var x=sp.x, y=sp.y;
    ctx.save();
    ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=2;
    var s=8;

    if(type==="endpoint"){
        ctx.beginPath(); ctx.rect(x-s,y-s,s*2,s*2); ctx.stroke();
    } else if(type==="midpoint"){
        ctx.beginPath(); ctx.moveTo(x,y-s); ctx.lineTo(x+s,y+s); ctx.lineTo(x-s,y+s); ctx.closePath(); ctx.stroke();
    } else if(type==="center"){
        ctx.beginPath(); ctx.arc(x,y,s,0,Math.PI*2); ctx.stroke();
    } else if(type==="quadrant"){
        ctx.beginPath(); ctx.moveTo(x,y-s); ctx.lineTo(x+s,y); ctx.lineTo(x,y+s); ctx.lineTo(x-s,y); ctx.closePath(); ctx.stroke();
    } else if(type==="intersection"){
        ctx.beginPath(); ctx.moveTo(x-s,y-s); ctx.lineTo(x+s,y+s); ctx.moveTo(x+s,y-s); ctx.lineTo(x-s,y+s); ctx.stroke();
    } else if(type==="perpendicular"){
        ctx.beginPath(); ctx.moveTo(x-s,y+s); ctx.lineTo(x-s,y-s); ctx.lineTo(x+s,y-s); ctx.stroke();
        ctx.beginPath(); ctx.rect(x-s,y-s,s,s); ctx.stroke();
    } else if(type==="nearest"){
        ctx.beginPath(); ctx.moveTo(x-s,y-s); ctx.lineTo(x+s,y+s); ctx.lineTo(x-s,y+s); ctx.lineTo(x+s,y-s); ctx.closePath(); ctx.stroke();
    } else if(type==="extension"){
        ctx.beginPath(); ctx.moveTo(x-s,y); ctx.lineTo(x+s,y); ctx.moveTo(x,y-s); ctx.lineTo(x,y+s); ctx.stroke();
    }

    // Label
    ctx.font="bold 10px Consolas,monospace";
    var lbl=type.charAt(0).toUpperCase()+type.slice(1);
    var tw=ctx.measureText(lbl).width;
    ctx.fillStyle="rgba(0,0,0,0.75)";
    ctx.fillRect(x-tw/2-3,y+s+2,tw+6,13);
    ctx.fillStyle=color;
    ctx.textAlign="center";
    ctx.fillText(lbl,x,y+s+12);
    ctx.restore();
}

// ===================== OBJECT SNAP TRACKING =====================
export function getTrackingLines(wx, wy){
    if(!S.trackingOn || !S.snapOn) return [];
    var lines = [];
    var thresh = S.trackThreshold / S.cam.zoom;
    var pts = getSnapPoints();
    if(S.pIni) pts.push({x:S.pIni.x, y:S.pIni.y, t:"start", c:"#4ec9b0"});

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
}

export function drawTrackingLines(lines){
    if(lines.length === 0) return;
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 0.8;

    for(var i = 0; i < lines.length; i++){
        var tl = lines[i];
        var s1 = w2s(tl.x1, tl.y1);
        var s2 = w2s(tl.x2, tl.y2);

        ctx.strokeStyle = "#d7ba7d";
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();

        var ms = 4;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = tl.snapPt.c || "#d7ba7d";
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y - ms);
        ctx.lineTo(s1.x + ms, s1.y);
        ctx.lineTo(s1.x, s1.y + ms);
        ctx.lineTo(s1.x - ms, s1.y);
        ctx.closePath();
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

export function applyTracking(wx, wy){
    if(!S.trackingOn || !S.snapOn) return {x: wx, y: wy, tracked: false};
    var thresh = S.trackThreshold / S.cam.zoom;
    var pts = getSnapPoints();
    if(S.pIni) pts.push({x:S.pIni.x, y:S.pIni.y, t:"start", c:"#4ec9b0"});

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
}
