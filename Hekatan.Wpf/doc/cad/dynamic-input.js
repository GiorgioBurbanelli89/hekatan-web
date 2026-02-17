// ===================== DYNAMIC-INPUT.JS - Layer 5 =====================
// AutoCAD-style floating Dynamic Input near cursor + Command Autocomplete
"use strict";

import * as S from './state.js';
import { set, callbacks } from './state.js';
import { canvasArea, dynInput, dynCmd, dynCmdInput, dynCoordBox,
         dynXInput, dynYInput, dynAngInput, dynLabel1, dynLabel2,
         dynZInput, dynZSep, dynZLabel, dynAngSep, dynAngLabel,
         cmdAutocomplete, canvas } from './dom.js';
import { D, Ang, toU, toPx, F } from './math.js';
import { unproj2to3 } from './projection.js';
import { saveHist } from './history.js';

// ── Position ──
export function updateDynPos(){
    if(!S.dynInputOn) { dynInput.classList.remove("visible"); return; }
    var ox = S.lastMouseScreen.x + 20;
    var oy = S.lastMouseScreen.y + 25;
    var cw = canvasArea.clientWidth, ch = canvasArea.clientHeight;
    if(ox + 180 > cw) ox = S.lastMouseScreen.x - 180;
    if(oy + 60 > ch) oy = S.lastMouseScreen.y - 60;
    dynInput.style.left = ox + "px";
    dynInput.style.top = oy + "px";
}

// ── Show/Hide ──
export function showDynInput(mode){
    if(!S.dynInputOn) return;
    dynInput.classList.add("visible");

    if(mode === "cmd"){
        dynCmd.style.display = "";
        dynCoordBox.style.display = "flex";
        dynLabel1.textContent = "X:"; dynLabel2.textContent = "Y:";
        dynZSep.style.display = ""; dynZLabel.style.display = ""; dynZInput.style.display = "";
        dynAngSep.style.display = "none"; dynAngLabel.style.display = "none"; dynAngInput.style.display = "none";
    } else if(mode === "coord"){
        dynCmd.style.display = "none";
        dynCoordBox.style.display = "flex";
        dynLabel1.textContent = "X:"; dynLabel2.textContent = "Y:";
        dynZSep.style.display = ""; dynZLabel.style.display = ""; dynZInput.style.display = "";
        dynAngSep.style.display = "none"; dynAngLabel.style.display = "none"; dynAngInput.style.display = "none";
    } else if(mode === "dist"){
        dynCmd.style.display = "none";
        dynCoordBox.style.display = "flex";
        dynLabel1.textContent = "D:"; dynLabel2.textContent = "";
        dynZSep.style.display = "none"; dynZLabel.style.display = "none"; dynZInput.style.display = "none";
        dynAngSep.style.display = ""; dynAngLabel.style.display = ""; dynAngInput.style.display = "";
    }
    updateDynPos();
}

export function hideDynInput(){
    dynInput.classList.remove("visible");
    set("dynFocused", false);
}

// ── Update values from mouse position ──
export function updateDynValues(wx, wy){
    if(!S.dynInputOn || S.dynFocused) return;
    if(S.pIni){
        var dist = toU(D(S.pIni.x, S.pIni.y, wx, wy));
        var ang = Ang(S.pIni.x, S.pIni.y, wx, wy);
        if(ang < 0) ang += 360;
        dynXInput.value = F(dist);
        dynYInput.value = "";
        dynAngInput.value = F(ang);
        showDynInput("dist");
    } else {
        var dw3 = unproj2to3(wx, wy);
        dynXInput.value = F(toU(dw3.x));
        dynYInput.value = F(toU(dw3.y));
        dynZInput.value = F(toU(dw3.z));
        if(S.modo !== "select" && S.modo !== "pan") showDynInput("coord");
        else showDynInput("cmd");
    }
}

// ── Helper: parse numeric input with validation ──
function parseNum(el){
    var v = parseFloat(el.value);
    if(isNaN(v)){
        el.style.outline = "1px solid #e06c5a";
        setTimeout(function(){ el.style.outline = ""; }, 800);
        return null;
    }
    return v;
}

// ── Apply coordinate entry (Enter) ──
export function dynApplyCoord(){
    var c = "#569cd6";
    if(S.pIni){
        var distVal = parseNum(dynXInput);
        if(distVal === null){ callbacks.flash?.("Valor numerico invalido"); return; }
        var angVal = parseNum(dynAngInput);
        if(angVal === null) angVal = 0;
        var distPx = toPx(distVal);
        if(S.orthoOn){
            var nearest = Math.round(angVal / 90) * 90;
            angVal = nearest;
        }
        var rad = angVal * Math.PI / 180;
        var wx = S.pIni.x + distPx * Math.cos(rad);
        var wy = S.pIni.y - distPx * Math.sin(rad);
        var zIni = S.pIni.z || S.currentZ;

        if(S.modo === "linea") S.formas.push({tipo:"linea",x1:S.pIni.x,y1:S.pIni.y,z1:zIni,x2:wx,y2:wy,z2:S.currentZ,z:zIni,color:c});
        else if(S.modo === "rectangulo") S.formas.push({tipo:"rectangulo",x:S.pIni.x,y:S.pIni.y,w:wx-S.pIni.x,h:wy-S.pIni.y,z:zIni,color:c});
        else if(S.modo === "circulo") S.formas.push({tipo:"circulo",cx:S.pIni.x,cy:S.pIni.y,r:D(S.pIni.x,S.pIni.y,wx,wy),z:zIni,color:c});
        else if(S.modo === "elipse") S.formas.push({tipo:"elipse",cx:S.pIni.x,cy:S.pIni.y,rx:Math.abs(wx-S.pIni.x),ry:Math.abs(wy-S.pIni.y),z:zIni,color:c});
        else if(S.modo === "arco") S.formas.push({tipo:"arco",x1:S.pIni.x,y1:S.pIni.y,cx:(S.pIni.x+wx)/2,cy:Math.min(S.pIni.y,wy)-40,x2:wx,y2:wy,z:zIni,color:c});

        if(S.poliEnCurso) S.ptsPoli.push({x:wx, y:wy, z:S.currentZ});
        else set("pIni", null);

        saveHist(); callbacks.redraw?.(); callbacks.updTree?.();
        if(S.formas.length>0) callbacks.selectShape?.(S.formas.length-1);
        callbacks.flash?.("OK: D=" + F(distVal) + " \u2220" + F(angVal) + "\u00b0");
    } else {
        var xv = parseNum(dynXInput);
        if(xv === null){ callbacks.flash?.("X invalido"); return; }
        var yv = parseNum(dynYInput);
        if(yv === null) yv = 0;
        var zv = parseNum(dynZInput);
        if(zv === null) zv = 0;
        var wx2 = toPx(xv);
        var wy2 = toPx(yv);
        var wz2 = toPx(zv);
        if(S.modo === "polilinea"){
            if(!S.poliEnCurso){ saveHist(); set("poliEnCurso",true); S.ptsPoli.length=0; S.ptsPoli.push({x:wx2,y:wy2,z:wz2}); }
            else S.ptsPoli.push({x:wx2,y:wy2,z:wz2});
        } else {
            saveHist();
            set("pIni", {x:wx2, y:wy2, z:wz2});
        }
        callbacks.redraw?.();
        callbacks.flash?.("P1: " + F(toU(wx2)) + ", " + F(toU(wy2)) + ", " + F(toU(wz2)));
    }
    set("dynFocused", false);
    canvas.focus();
}

// ── Apply command ──
export function dynApplyCmd(cmd){
    cmd = cmd.trim().toLowerCase();
    var cmdMap = {l:"linea",li:"linea",line:"linea",r:"rectangulo",rec:"rectangulo",rect:"rectangulo",c:"circulo",ci:"circulo",circle:"circulo",e:"elipse",el:"elipse",p:"polilinea",pl:"polilinea",a:"arco",f:"mano",s:"select",v:"select",h:"pan",z:"zoomfit",u:"undo"};
    if(cmdMap[cmd]){
        if(cmd === "z") callbacks.zoomFit?.();
        else if(cmd === "u"){ /* undo via callback */ }
        else callbacks.setMode?.(cmdMap[cmd]);
    }
    dynCmdInput.value = "";
    set("dynFocused", false);
    canvas.focus();
}

// ── Autocomplete ──
var cmdList = [
    {key:"l",  name:"LINEA",      hint:"Dibujar linea"},
    {key:"li", name:"LINE",       hint:"Dibujar linea"},
    {key:"r",  name:"RECTANGULO", hint:"Dibujar rectangulo"},
    {key:"rec",name:"RECT",       hint:"Dibujar rectangulo"},
    {key:"c",  name:"CIRCULO",    hint:"Dibujar circulo"},
    {key:"ci", name:"CIRCLE",     hint:"Dibujar circulo"},
    {key:"e",  name:"ELIPSE",     hint:"Dibujar elipse"},
    {key:"a",  name:"ARCO",       hint:"Dibujar arco"},
    {key:"p",  name:"POLILINEA",  hint:"Dibujar polilinea"},
    {key:"pl", name:"PLINE",      hint:"Dibujar polilinea"},
    {key:"f",  name:"FREEHAND",   hint:"Mano libre"},
    {key:"s",  name:"SELECT",     hint:"Seleccionar"},
    {key:"v",  name:"SELECT",     hint:"Seleccionar (V)"},
    {key:"h",  name:"PAN",        hint:"Mover vista"},
    {key:"z",  name:"ZOOM FIT",   hint:"Encuadrar todo"},
    {key:"u",  name:"UNDO",       hint:"Deshacer (Ctrl+Z)"}
];

function updateAutocomplete(val){
    val = val.trim().toLowerCase();
    cmdAutocomplete.innerHTML = "";
    set("acSelIdx", -1);
    if(!val){ cmdAutocomplete.classList.remove("visible"); return; }
    var matches = cmdList.filter(function(c){ return c.key.indexOf(val) === 0 || c.name.toLowerCase().indexOf(val) === 0; });
    if(matches.length === 0){ cmdAutocomplete.classList.remove("visible"); return; }
    matches.forEach(function(m, i){
        var div = document.createElement("div");
        div.className = "cmd-ac-item";
        div.setAttribute("data-cmd", m.key);
        div.innerHTML = '<span class="ac-key">' + m.key.toUpperCase() + '</span><span class="ac-name">' + m.name + '</span><span class="ac-hint">' + m.hint + '</span>';
        div.addEventListener("mousedown", function(e){
            e.preventDefault();
            dynApplyCmd(m.key);
            hideAutocomplete();
        });
        div.addEventListener("mouseenter", function(){
            var all = cmdAutocomplete.querySelectorAll(".cmd-ac-item");
            for(var j=0;j<all.length;j++) all[j].classList.remove("sel");
            div.classList.add("sel");
            set("acSelIdx", i);
        });
        cmdAutocomplete.appendChild(div);
    });
    cmdAutocomplete.classList.add("visible");
}

export function hideAutocomplete(){
    cmdAutocomplete.classList.remove("visible");
    cmdAutocomplete.innerHTML = "";
    set("acSelIdx", -1);
}

// ── Bind keyboard events for dynamic input fields ──
export function initDynInputEvents(){
    dynXInput.addEventListener("keydown", function(e){
        if(e.key === "Tab"){ e.preventDefault(); if(S.pIni) dynAngInput.focus(); else dynYInput.focus(); }
        if(e.key === "Enter"){ e.preventDefault(); dynApplyCoord(); }
        if(e.key === "Escape"){ e.preventDefault(); set("dynFocused",false); canvas.focus(); }
    });
    dynYInput.addEventListener("keydown", function(e){
        if(e.key === "Tab"){ e.preventDefault(); dynZInput.focus(); }
        if(e.key === "Enter"){ e.preventDefault(); dynApplyCoord(); }
        if(e.key === "Escape"){ e.preventDefault(); set("dynFocused",false); canvas.focus(); }
    });
    dynZInput.addEventListener("keydown", function(e){
        if(e.key === "Tab"){ e.preventDefault(); dynXInput.focus(); }
        if(e.key === "Enter"){ e.preventDefault(); dynApplyCoord(); }
        if(e.key === "Escape"){ e.preventDefault(); set("dynFocused",false); canvas.focus(); }
    });
    dynAngInput.addEventListener("keydown", function(e){
        if(e.key === "Tab"){ e.preventDefault(); dynXInput.focus(); }
        if(e.key === "Enter"){ e.preventDefault(); dynApplyCoord(); }
        if(e.key === "Escape"){ e.preventDefault(); set("dynFocused",false); canvas.focus(); }
    });
    dynCmdInput.addEventListener("keydown", function(e){
        var items = cmdAutocomplete.querySelectorAll(".cmd-ac-item");
        if(e.key === "ArrowDown" || e.key === "ArrowUp"){
            e.preventDefault();
            if(items.length === 0) return;
            if(e.key === "ArrowDown") set("acSelIdx", Math.min(S.acSelIdx + 1, items.length - 1));
            else set("acSelIdx", Math.max(S.acSelIdx - 1, 0));
            for(var i = 0; i < items.length; i++) items[i].classList.toggle("sel", i === S.acSelIdx);
            if(S.acSelIdx >= 0) items[S.acSelIdx].scrollIntoView({block:"nearest"});
            return;
        }
        if(e.key === "Enter"){
            e.preventDefault();
            if(S.acSelIdx >= 0 && items.length > 0) dynApplyCmd(items[S.acSelIdx].getAttribute("data-cmd"));
            else dynApplyCmd(dynCmdInput.value);
            hideAutocomplete();
            return;
        }
        if(e.key === "Escape"){ e.preventDefault(); dynCmdInput.value=""; set("dynFocused",false); hideAutocomplete(); canvas.focus(); return; }
        if(e.key === "Tab"){ e.preventDefault(); hideAutocomplete(); dynXInput.focus(); return; }
    });
    dynCmdInput.addEventListener("input", function(){
        updateAutocomplete(dynCmdInput.value);
    });

    // Focus tracking - use requestAnimationFrame to avoid race conditions
    var _blurTimer = null;
    [dynXInput, dynYInput, dynZInput, dynAngInput, dynCmdInput].forEach(function(el){
        el.addEventListener("focus", function(){
            if(_blurTimer){ clearTimeout(_blurTimer); _blurTimer = null; }
            set("dynFocused", true);
        });
        el.addEventListener("blur", function(){
            if(_blurTimer) clearTimeout(_blurTimer);
            _blurTimer = setTimeout(function(){
                _blurTimer = null;
                if(!dynInput.contains(document.activeElement)) set("dynFocused", false);
            }, 80);
        });
    });
}
