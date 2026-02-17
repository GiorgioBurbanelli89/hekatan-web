// ===================== HISTORY.JS - Layer 5 =====================
// Undo/redo history management
"use strict";

(function(CAD){

CAD.saveHist = function(){
    if(CAD.histPos < CAD.historial.length - 1)
        CAD.set("historial", CAD.historial.slice(0, CAD.histPos + 1));
    CAD.historial.push(JSON.parse(JSON.stringify(CAD.formas)));
    if(CAD.historial.length > CAD.MAX_HIST) CAD.historial.shift();
    CAD.set("histPos", CAD.historial.length - 1);
    if(CAD.invalidateSnapCache) CAD.invalidateSnapCache();
};

CAD.undo = function(){
    if(CAD.histPos > 0){
        CAD.set("histPos", CAD.histPos - 1);
        CAD.set("formas", JSON.parse(JSON.stringify(CAD.historial[CAD.histPos])));
        CAD.set("formaSel", -1);
        if(CAD.invalidateSnapCache) CAD.invalidateSnapCache();
        CAD.callbacks.redraw?.();
        CAD.callbacks.updTree?.();
        CAD.callbacks.showProps?.(-1);
    }
};

})(window.CAD);
