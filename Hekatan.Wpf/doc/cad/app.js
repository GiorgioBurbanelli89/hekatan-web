// ===================== APP.JS - Layer 7 =====================
// Initialization, toolbar binds, toggles, callbacks registration
"use strict";

import * as S from './state.js';
import { set, callbacks } from './state.js';
import { initDOM, canvas, canvasArea, stMode, stInfo, stSnap,
         inputX, inputY, inputZ, expOut } from './dom.js';
import { toPx, F } from './math.js';
import { redraw } from './render.js';
import { saveHist, undo } from './history.js';
import { updTree, selectShape, showProps } from './panels.js';
import { genCpd, genSVG } from './export.js';
import { initDynInputEvents } from './dynamic-input.js';
import { switchTo3D, switchTo2D, init3DEvents } from './three-view.js';
import { hitTest, zoomFit, resizeCanvas, initCanvasEvents, initKeyboard } from './input.js';
import { invalidateSnapCache } from './snap.js';
import { initCLI } from './cli.js';
import { initIFC } from './ifc-viewer.js';

// ── Flash message ──
function flash(msg){
    stInfo.textContent = msg;
    setTimeout(function(){ stInfo.textContent = "v0.7"; }, 1500);
}

// ── Set drawing mode ──
var modeBtn = {
    select:"btnSelect", pan:"btnPan", linea:"btnLinea", polilinea:"btnPolilinea",
    rectangulo:"btnRectangulo", circulo:"btnCirculo", elipse:"btnElipse",
    arco:"btnArco", cota:"btnCota", mano:"btnMano"
};
var modeLbl = {
    select:"SELECCIONAR", pan:"PAN", linea:"LINEA", polilinea:"POLILINEA",
    rectangulo:"RECTANGULO", circulo:"CIRCULO", elipse:"ELIPSE", arco:"ARCO",
    cota:"COTA", mano:"MANO LIBRE"
};

function setMode(m){
    set("modo", m);
    set("pIni", null);
    set("poliEnCurso", false);
    S.ptsPoli.length = 0;
    stMode.textContent = modeLbl[m] || m.toUpperCase();
    canvas.style.cursor = m === "pan" ? "grab" : "crosshair";
    var btns = document.querySelectorAll(".toolbar .tool-btn");
    for(var i = 0; i < btns.length; i++) btns[i].classList.remove("active");
    var b = document.getElementById(modeBtn[m]);
    if(b) b.classList.add("active");
}

// ── Toggle functions ──
function toggleOrtho(){
    set("orthoOn", !S.orthoOn);
    document.getElementById("tglOrtho").classList.toggle("on", S.orthoOn);
    flash("ORTHO " + (S.orthoOn ? "ON" : "OFF"));
}

function toggleSnapOnOff(){
    set("snapOn", !S.snapOn);
    document.getElementById("tglSnap").classList.toggle("on", S.snapOn);
    flash("SNAP " + (S.snapOn ? "ON" : "OFF"));
}

// ── Register callbacks (break circular deps) ──
function registerCallbacks(){
    callbacks.setMode = setMode;
    callbacks.zoomFit = zoomFit;
    callbacks.redraw = redraw;
    callbacks.flash = flash;
    callbacks.updTree = updTree;
    callbacks.showProps = showProps;
    callbacks.selectShape = selectShape;
}

// ── Panel collapse ──
function bindCollapse(hdId, bdId, chevId){
    document.getElementById(hdId).addEventListener("click", function(){
        var bd = document.getElementById(bdId);
        var chev = document.getElementById(chevId);
        bd.classList.toggle("collapsed");
        chev.classList.toggle("collapsed");
    });
}

// ── Init ──
function init(){
    try {
    initDOM();
    registerCallbacks();

    // Toolbar buttons
    document.getElementById("btnSelect").addEventListener("click", function(){ setMode("select"); });
    document.getElementById("btnPan").addEventListener("click", function(){ setMode("pan"); });
    document.getElementById("btnLinea").addEventListener("click", function(){ setMode("linea"); });
    document.getElementById("btnPolilinea").addEventListener("click", function(){ setMode("polilinea"); });
    document.getElementById("btnRectangulo").addEventListener("click", function(){ setMode("rectangulo"); });
    document.getElementById("btnCirculo").addEventListener("click", function(){ setMode("circulo"); });
    document.getElementById("btnElipse").addEventListener("click", function(){ setMode("elipse"); });
    document.getElementById("btnArco").addEventListener("click", function(){ setMode("arco"); });
    document.getElementById("btnCota").addEventListener("click", function(){ setMode("cota"); });
    document.getElementById("btnMano").addEventListener("click", function(){ setMode("mano"); });
    document.getElementById("btnDeshacer").addEventListener("click", function(){ undo(); });
    document.getElementById("btnZoomFit").addEventListener("click", function(){ zoomFit(); });
    document.getElementById("btnLimpiar").addEventListener("click", function(){
        saveHist();
        S.formas.length = 0;
        set("formaSel", -1);
        invalidateSnapCache();
        saveHist();
        redraw();
        updTree();
        showProps(-1);
    });

    // Toggle buttons
    document.getElementById("tglSnap").addEventListener("click", function(){ toggleSnapOnOff(); });
    document.getElementById("tglOrtho").addEventListener("click", function(){ toggleOrtho(); });
    document.getElementById("tglGrid").addEventListener("click", function(){
        set("gridOn", !S.gridOn);
        this.classList.toggle("on", S.gridOn);
        redraw();
    });
    document.getElementById("tglSGrid").addEventListener("click", function(){
        set("sgridOn", !S.sgridOn);
        this.classList.toggle("on", S.sgridOn);
    });
    document.getElementById("tglOTrack").addEventListener("click", function(){
        set("trackingOn", !S.trackingOn);
        this.classList.toggle("on", S.trackingOn);
        flash("OTRACK " + (S.trackingOn ? "ON" : "OFF"));
    });

    // Snap bar items
    var snapItems = document.querySelectorAll(".snap-item[data-snap]");
    for(var si = 0; si < snapItems.length; si++){
        (function(el){
            el.addEventListener("click", function(){
                var k = el.getAttribute("data-snap");
                S.snapCfg[k] = !S.snapCfg[k];
                el.classList.toggle("on", S.snapCfg[k]);
            });
        })(snapItems[si]);
    }

    // Panel collapse
    bindCollapse("hdTree", "panelTree", "chevTree");
    bindCollapse("hdProps", "panelProps", "chevProps");
    bindCollapse("hdIfc", "panelIfc", "chevIfc");
    bindCollapse("hdExport", "panelExport", "chevExport");
    bindCollapse("hdCli", "panelCli", "chevCli");

    // Scale / Units
    document.getElementById("escala").addEventListener("change", function(){
        set("escala", parseFloat(this.value) || 1);
        redraw(); updTree();
        if(S.formaSel >= 0) showProps(S.formaSel);
    });
    document.getElementById("unidad").addEventListener("change", function(){
        set("unidad", this.value);
        redraw(); updTree();
        if(S.formaSel >= 0) showProps(S.formaSel);
    });

    // Color picker
    document.getElementById("colorPicker").addEventListener("input", function(){
        set("currentColor", this.value);
    });

    // View mode
    document.getElementById("viewMode").addEventListener("change", function(){
        set("currentView", this.value);
        if(S.currentView === "3d") switchTo3D();
        else switchTo2D(resizeCanvas);
    });

    // Export buttons
    document.getElementById("btnExpCpd").addEventListener("click", function(){ expOut.value = genCpd(); });
    document.getElementById("btnExpSvg").addEventListener("click", function(){ expOut.value = genSVG(); });
    document.getElementById("btnCopy").addEventListener("click", function(){
        expOut.select();
        try { document.execCommand("copy"); flash("Copiado!"); }
        catch(err){ flash("Error al copiar"); }
    });

    // Coord input
    inputX.addEventListener("keypress", function(e){ if(e.key === "Enter") inputY.focus(); });
    inputY.addEventListener("keypress", function(e){
        if(e.key === "Enter"){
            if(S.pIni){
                var wx = toPx(parseFloat(inputX.value) || 0);
                var wy = toPx(parseFloat(inputY.value) || 0);
                var c = "#569cd6";
                if(S.modo === "linea") S.formas.push({tipo:"linea",x1:S.pIni.x,y1:S.pIni.y,x2:wx,y2:wy,color:c});
                else if(S.modo === "rectangulo") S.formas.push({tipo:"rectangulo",x:S.pIni.x,y:S.pIni.y,w:wx-S.pIni.x,h:wy-S.pIni.y,color:c});
                else if(S.modo === "circulo") S.formas.push({tipo:"circulo",cx:S.pIni.x,cy:S.pIni.y,r:Math.sqrt((wx-S.pIni.x)*(wx-S.pIni.x)+(wy-S.pIni.y)*(wy-S.pIni.y)),color:c});
                else if(S.modo === "elipse") S.formas.push({tipo:"elipse",cx:S.pIni.x,cy:S.pIni.y,rx:Math.abs(wx-S.pIni.x),ry:Math.abs(wy-S.pIni.y),color:c});
                set("pIni", null); saveHist(); redraw(); updTree(); selectShape(S.formas.length - 1);
            } else {
                set("pIni", {x: toPx(parseFloat(inputX.value) || 0), y: toPx(parseFloat(inputY.value) || 0)});
                saveHist();
            }
            inputZ.focus();
        }
    });
    inputZ.addEventListener("keypress", function(e){
        if(e.key === "Enter"){
            set("currentZ", toPx(parseFloat(inputZ.value) || 0));
            flash("Plano Z = " + F(parseFloat(inputZ.value) || 0) + " " + S.unidad);
        }
    });

    // Set initial toggle visual states
    document.getElementById("tglSnap").classList.toggle("on", S.snapOn);
    document.getElementById("tglOrtho").classList.toggle("on", S.orthoOn);
    document.getElementById("tglGrid").classList.toggle("on", S.gridOn);
    document.getElementById("tglOTrack").classList.toggle("on", S.trackingOn);

    // Canvas events, keyboard, dynamic input, 3D events
    initCanvasEvents(setMode, toggleOrtho, toggleSnapOnOff, flash, undo);
    initKeyboard(setMode, toggleOrtho, toggleSnapOnOff, flash, undo);
    initDynInputEvents();
    init3DEvents();
    initCLI();
    initIFC();

    // Initial state
    saveHist();
    resizeCanvas();

    // Window resize
    window.addEventListener("resize", function(){
        if(S.currentView === "3d"){
            if(S.threeRenderer){
                var w = canvasArea.clientWidth, h = canvasArea.clientHeight;
                S.threeRenderer.setSize(w, h);
                S.threeCamera.aspect = w / h;
                S.threeCamera.updateProjectionMatrix();
            }
        } else {
            resizeCanvas();
        }
    });

    console.log("Calcpad CAD+IFC v0.8 initialized OK");
    } catch(err) {
        console.error("CAD init failed:", err);
        var msg = document.getElementById("stInfo");
        if(msg) msg.textContent = "Error: " + err.message;
    }
}

// ── Start ──
if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
