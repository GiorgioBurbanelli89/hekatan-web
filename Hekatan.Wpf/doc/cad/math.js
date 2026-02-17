// ===================== MATH.JS - Layer 1 =====================
// Pure math/utility functions. No imports needed.
"use strict";

import * as S from './state.js';

export function D(x1,y1,x2,y2) {
    return Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1));
}

export function Ang(x1,y1,x2,y2) {
    return Math.atan2(-(y2-y1),x2-x1)*180/Math.PI;
}

export function toU(px) {
    return +(px/S.escala).toFixed(2);
}

export function toPx(v) {
    return v*S.escala;
}

export function F(v) {
    return v%1===0?v.toString():v.toFixed(2);
}

export function orthoSnap(x1,y1,x2,y2) {
    if(!S.orthoOn) return {x:x2,y:y2};
    var a=Math.atan2(y2-y1,x2-x1), angs=[0,Math.PI/2,Math.PI,-Math.PI/2];
    var best=angs.reduce(function(p,c){return Math.abs(c-a)<Math.abs(p-a)?c:p;});
    var d=D(x1,y1,x2,y2);
    return {x:x1+Math.cos(best)*d, y:y1+Math.sin(best)*d};
}

export function gridSnapPt(x,y) {
    if(!S.sgridOn) return {x:x,y:y};
    return {x:Math.round(x/S.tamGrid)*S.tamGrid, y:Math.round(y/S.tamGrid)*S.tamGrid};
}
