// ===================== MATH.JS - Layer 1 =====================
// Pure math/utility functions. Reads escala, orthoOn, sgridOn, tamGrid from CAD.
"use strict";

(function(CAD){

CAD.D = function(x1,y1,x2,y2) {
    return Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1));
};

CAD.Ang = function(x1,y1,x2,y2) {
    return Math.atan2(-(y2-y1),x2-x1)*180/Math.PI;
};

CAD.toU = function(px) {
    return +(px/CAD.escala).toFixed(2);
};

CAD.toPx = function(v) {
    return v*CAD.escala;
};

CAD.F = function(v) {
    return v%1===0?v.toString():v.toFixed(2);
};

CAD.orthoSnap = function(x1,y1,x2,y2) {
    if(!CAD.orthoOn) return {x:x2,y:y2};
    var a=Math.atan2(y2-y1,x2-x1), angs=[0,Math.PI/2,Math.PI,-Math.PI/2];
    var best=angs.reduce(function(p,c){return Math.abs(c-a)<Math.abs(p-a)?c:p;});
    var d=CAD.D(x1,y1,x2,y2);
    return {x:x1+Math.cos(best)*d, y:y1+Math.sin(best)*d};
};

CAD.gridSnapPt = function(x,y) {
    if(!CAD.sgridOn) return {x:x,y:y};
    return {x:Math.round(x/CAD.tamGrid)*CAD.tamGrid, y:Math.round(y/CAD.tamGrid)*CAD.tamGrid};
};

})(window.CAD);
