// ===================== THREE-VIEW.JS - Layer 5 =====================
// Three.js 3D view: init, sync shapes, raycasting, animate
"use strict";

import * as S from './state.js';
import { set, callbacks } from './state.js';
import { canvas, canvas3d, canvasArea, stX, stY, stZ, inputX, inputY, inputZ, coordOverlay } from './dom.js';
import { D, toU, F } from './math.js';
import { saveHist } from './history.js';

// ── Init Three.js scene ──
export function initThree(){
    if(S.threeInited) return;
    if(typeof THREE === "undefined"){
        callbacks.flash?.("Three.js no disponible (sin conexion?)");
        console.error("THREE not loaded - 3D view disabled");
        return false;
    }

    set("threeScene", new THREE.Scene());
    S.threeScene.background = new THREE.Color(0x1a1a2e);

    var aspect = canvasArea.clientWidth / canvasArea.clientHeight;
    set("threeCamera", new THREE.PerspectiveCamera(50, aspect, 0.1, 100000));
    S.threeCamera.position.set(300, -300, 400);
    S.threeCamera.up.set(0, 0, 1);

    set("threeRenderer", new THREE.WebGLRenderer({canvas: canvas3d, antialias: true}));
    S.threeRenderer.setSize(canvasArea.clientWidth, canvasArea.clientHeight);
    S.threeRenderer.setPixelRatio(window.devicePixelRatio);

    set("threeControls", new THREE.OrbitControls(S.threeCamera, canvas3d));
    S.threeControls.enableDamping = true;
    S.threeControls.dampingFactor = 0.1;
    S.threeControls.target.set(0, 0, 0);
    S.threeControls.mouseButtons = {LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN};

    // Grid XY
    var gridXY = new THREE.GridHelper(1000, 20, 0x3e3e3e, 0x2a2a40);
    gridXY.rotation.x = Math.PI / 2;
    S.threeScene.add(gridXY);

    // Axes
    var axLen = 150;
    var axMat = function(c){ return new THREE.LineBasicMaterial({color:c}); };
    var geoX = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(axLen,0,0)]);
    S.threeScene.add(new THREE.Line(geoX, axMat(0xdc5050)));
    var geoY = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,axLen,0)]);
    S.threeScene.add(new THREE.Line(geoY, axMat(0x50c850)));
    var geoZ = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,axLen)]);
    S.threeScene.add(new THREE.Line(geoZ, axMat(0x5050dc)));

    // Work plane
    var wpGeo = new THREE.PlaneGeometry(800, 800);
    var wpMat = new THREE.MeshBasicMaterial({color: 0x569cd6, transparent: true, opacity: 0.03, side: THREE.DoubleSide});
    var workPlane = new THREE.Mesh(wpGeo, wpMat);
    workPlane.name = "workplane";
    S.threeScene.add(workPlane);

    // Raycaster
    set("threeRaycaster", new THREE.Raycaster());
    set("threeMouse", new THREE.Vector2());

    set("threeInited", true);
}

// ── Sync shapes to Three.js scene ──
export function syncThreeShapes(){
    if(!S.threeInited) return;
    var toRemove = [];
    S.threeScene.traverse(function(obj){ if(obj.userData.isShape) toRemove.push(obj); });
    toRemove.forEach(function(obj){ S.threeScene.remove(obj); if(obj.geometry) obj.geometry.dispose(); });

    for(var i=0; i<S.formas.length; i++){
        var f = S.formas[i]; if(f.hidden) continue;
        var fz = f.z || 0;
        var col = new THREE.Color(i === S.formaSel ? "#ffcc00" : (f.color || "#569cd6"));
        var mat = new THREE.LineBasicMaterial({color: col, linewidth: 2});
        var pts = [];

        if(f.tipo === "linea"){
            pts.push(new THREE.Vector3(f.x1,f.y1,f.z1||fz));
            pts.push(new THREE.Vector3(f.x2,f.y2,f.z2||fz));
        } else if(f.tipo === "rectangulo"){
            pts.push(new THREE.Vector3(f.x,f.y,fz));
            pts.push(new THREE.Vector3(f.x+f.w,f.y,fz));
            pts.push(new THREE.Vector3(f.x+f.w,f.y+f.h,fz));
            pts.push(new THREE.Vector3(f.x,f.y+f.h,fz));
            pts.push(new THREE.Vector3(f.x,f.y,fz));
        } else if(f.tipo === "circulo"){
            for(var a=0;a<=64;a++){
                var ang = a/64*Math.PI*2;
                pts.push(new THREE.Vector3(f.cx+f.r*Math.cos(ang), f.cy+f.r*Math.sin(ang), fz));
            }
        } else if(f.tipo === "elipse"){
            for(var ae=0;ae<=64;ae++){
                var ange = ae/64*Math.PI*2;
                pts.push(new THREE.Vector3(f.cx+f.rx*Math.cos(ange), f.cy+f.ry*Math.sin(ange), fz));
            }
        } else if(f.tipo === "polilinea" || f.tipo === "mano"){
            for(var j=0;j<f.pts.length;j++)
                pts.push(new THREE.Vector3(f.pts[j].x, f.pts[j].y, f.pts[j].z||fz));
        } else if(f.tipo === "arco"){
            for(var t=0;t<=32;t++){
                var tt=t/32;
                var ax=(1-tt)*(1-tt)*f.x1+2*(1-tt)*tt*f.cx+tt*tt*f.x2;
                var ay=(1-tt)*(1-tt)*f.y1+2*(1-tt)*tt*f.cy+tt*tt*f.y2;
                pts.push(new THREE.Vector3(ax, ay, fz));
            }
        }

        if(pts.length >= 2){
            var geo = new THREE.BufferGeometry().setFromPoints(pts);
            var line = new THREE.Line(geo, mat);
            line.userData.isShape = true;
            line.userData.idx = i;
            S.threeScene.add(line);
        }
    }
}

// ── Render / Animate ──
function renderThree(){
    if(!S.threeInited) return;
    S.threeControls.update();
    S.threeRenderer.render(S.threeScene, S.threeCamera);
}

export function threeAnimLoop(){
    set("threeAnimId", requestAnimationFrame(threeAnimLoop));
    renderThree();
}

export function stopThreeAnim(){
    if(S.threeAnimId){ cancelAnimationFrame(S.threeAnimId); set("threeAnimId", null); }
}

// ── Raycasting: get 3D world point on work plane ──
export function getWorld3D(e){
    if(!S.threeRaycaster || !S.threeMouse) return {x:0, y:0, z:S.currentZ};
    var rect = canvas3d.getBoundingClientRect();
    S.threeMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    S.threeMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    S.threeRaycaster.setFromCamera(S.threeMouse, S.threeCamera);

    var planeNormal = new THREE.Vector3(0, 0, 1);
    var planePoint = new THREE.Vector3(0, 0, S.currentZ);
    var plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);
    var target = new THREE.Vector3();
    var hit = S.threeRaycaster.ray.intersectPlane(plane, target);
    if(hit) return {x: target.x, y: target.y, z: target.z};
    return {x: 0, y: 0, z: S.currentZ};
}

// ── Switch between 2D/3D views ──
export function switchTo3D(){
    if(initThree() === false){
        // revert dropdown to 2D
        var sel = document.getElementById("viewMode");
        if(sel) sel.value = "2d-top";
        return;
    }
    canvas.style.display = "none";
    canvas3d.style.display = "block";
    syncThreeShapes();
    threeAnimLoop();
    var w = canvasArea.clientWidth, h = canvasArea.clientHeight;
    S.threeRenderer.setSize(w, h);
    S.threeCamera.aspect = w / h;
    S.threeCamera.updateProjectionMatrix();
    callbacks.flash?.("Vista 3D | Ctrl+Click para dibujar");
}

export function switchTo2D(resizeCanvas){
    stopThreeAnim();
    // Dispose shape geometries to prevent memory leak
    if(S.threeScene){
        var toDispose = [];
        S.threeScene.traverse(function(obj){
            if(obj.userData.isShape) toDispose.push(obj);
        });
        toDispose.forEach(function(obj){
            S.threeScene.remove(obj);
            if(obj.geometry) obj.geometry.dispose();
            if(obj.material) obj.material.dispose();
        });
    }
    canvas3d.style.display = "none";
    canvas.style.display = "block";
    resizeCanvas();
    callbacks.redraw?.();
    var sel = document.getElementById("viewMode");
    callbacks.flash?.("Vista: " + sel.options[sel.selectedIndex].text);
}

// ── 3D canvas events for drawing ──
export function init3DEvents(){
    canvas3d.addEventListener("mousedown", function(e){
        if(e.button !== 0 || S.modo === "select" || S.modo === "pan") return;
        if(!e.ctrlKey && !e.shiftKey) return;

        var wp = getWorld3D(e);
        var wx = wp.x, wy = wp.y, wz = wp.z;

        if(S.modo === "polilinea"){
            if(!S.poliEnCurso){ saveHist(); set("poliEnCurso",true); S.ptsPoli.length=0; S.ptsPoli.push({x:wx,y:wy,z:wz}); }
            else S.ptsPoli.push({x:wx,y:wy,z:wz});
            syncThreeShapes();
            return;
        }

        if(!S.pIni){ saveHist(); set("pIni",{x:wx,y:wy,z:wz}); }
        else{
            var c="#569cd6";
            if(S.modo==="linea") S.formas.push({tipo:"linea",x1:S.pIni.x,y1:S.pIni.y,z1:S.pIni.z,x2:wx,y2:wy,z2:wz,z:S.pIni.z,color:c});
            else if(S.modo==="rectangulo") S.formas.push({tipo:"rectangulo",x:S.pIni.x,y:S.pIni.y,w:wx-S.pIni.x,h:wy-S.pIni.y,z:S.pIni.z,color:c});
            else if(S.modo==="circulo") S.formas.push({tipo:"circulo",cx:S.pIni.x,cy:S.pIni.y,r:D(S.pIni.x,S.pIni.y,wx,wy),z:S.pIni.z,color:c});
            else if(S.modo==="elipse") S.formas.push({tipo:"elipse",cx:S.pIni.x,cy:S.pIni.y,rx:Math.abs(wx-S.pIni.x),ry:Math.abs(wy-S.pIni.y),z:S.pIni.z,color:c});
            set("pIni",null); saveHist(); syncThreeShapes(); callbacks.updTree?.();
            if(S.formas.length>0) callbacks.selectShape?.(S.formas.length-1);
        }
    });

    canvas3d.addEventListener("mousemove", function(e){
        if(S.modo === "select" || S.modo === "pan") return;
        var wp = getWorld3D(e);
        stX.textContent=F(toU(wp.x)); stY.textContent=F(toU(wp.y)); stZ.textContent=F(toU(wp.z));
        inputX.value=F(toU(wp.x)); inputY.value=F(toU(wp.y)); inputZ.value=F(toU(wp.z));
        coordOverlay.textContent=F(toU(wp.x))+", "+F(toU(wp.y))+", "+F(toU(wp.z))+" "+S.unidad;
    });

    canvas3d.addEventListener("dblclick", function(){
        if(S.modo==="polilinea" && S.poliEnCurso && S.ptsPoli.length>1){
            S.formas.push({tipo:"polilinea",pts:JSON.parse(JSON.stringify(S.ptsPoli)),z:S.ptsPoli[0].z||0,color:"#569cd6"});
            set("poliEnCurso",false); S.ptsPoli.length=0;
            saveHist(); syncThreeShapes(); callbacks.updTree?.();
            callbacks.selectShape?.(S.formas.length-1);
        }
    });
}
