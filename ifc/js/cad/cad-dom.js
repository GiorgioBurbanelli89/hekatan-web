// ===================== DOM.JS - Layer 2 =====================
// References to DOM elements. Initialized after DOMContentLoaded.
"use strict";

(function(CAD){

CAD.canvas = null;
CAD.ctx = null;
CAD.canvasArea = null;
CAD.stX = null;
CAD.stY = null;
CAD.stZ = null;
CAD.stLen = null;
CAD.stAng = null;
CAD.stMode = null;
CAD.stSnap = null;
CAD.stInfo = null;
CAD.objTree = null;
CAD.objCount = null;
CAD.panelProps = null;
CAD.expOut = null;
CAD.inputX = null;
CAD.inputY = null;
CAD.inputZ = null;
CAD.coordOverlay = null;
CAD.zoomIndicator = null;
CAD.canvasHint = null;

// Dynamic Input elements
CAD.dynInput = null;
CAD.dynCmd = null;
CAD.dynCmdInput = null;
CAD.dynCoordBox = null;
CAD.dynXInput = null;
CAD.dynYInput = null;
CAD.dynAngInput = null;
CAD.dynLabel1 = null;
CAD.dynLabel2 = null;
CAD.dynZInput = null;
CAD.dynZSep = null;
CAD.dynZLabel = null;
CAD.dynAngSep = null;
CAD.dynAngLabel = null;
CAD.cmdAutocomplete = null;

// 3D canvas
CAD.canvas3d = null;

CAD.initDOM = function(){
    try {
        CAD.canvas = document.getElementById("lienzo");
        CAD.ctx = CAD.canvas ? CAD.canvas.getContext("2d") : null;
        CAD.canvasArea = document.getElementById("canvasArea");
        CAD.canvas3d = document.getElementById("canvas3d");

        CAD.stX = document.getElementById("stX");
        CAD.stY = document.getElementById("stY");
        CAD.stZ = document.getElementById("stZ");
        CAD.stLen = document.getElementById("stLen");
        CAD.stAng = document.getElementById("stAng");
        CAD.stMode = document.getElementById("stMode");
        CAD.stSnap = document.getElementById("stSnap");
        CAD.stInfo = document.getElementById("stInfo");

        CAD.objTree = document.getElementById("objTree");
        CAD.objCount = document.getElementById("objCount");
        CAD.panelProps = document.getElementById("panelProps");
        CAD.expOut = document.getElementById("expOut");

        CAD.inputX = document.getElementById("inputX");
        CAD.inputY = document.getElementById("inputY");
        CAD.inputZ = document.getElementById("inputZ");

        CAD.coordOverlay = document.getElementById("coordOverlay");
        CAD.zoomIndicator = document.getElementById("zoomIndicator");
        CAD.canvasHint = document.getElementById("canvasHint");

        // Dynamic Input
        CAD.dynInput = document.getElementById("dynInput");
        CAD.dynCmd = document.getElementById("dynCmd");
        CAD.dynCmdInput = document.getElementById("dynCmdInput");
        CAD.dynCoordBox = document.getElementById("dynCoordBox");
        CAD.dynXInput = document.getElementById("dynX");
        CAD.dynYInput = document.getElementById("dynY");
        CAD.dynAngInput = document.getElementById("dynAng");
        CAD.dynLabel1 = document.getElementById("dynLabel1");
        CAD.dynLabel2 = document.getElementById("dynLabel2");
        CAD.dynZInput = document.getElementById("dynZ");
        CAD.dynZSep = document.getElementById("dynZSep");
        CAD.dynZLabel = document.getElementById("dynZLabel");
        CAD.dynAngSep = document.getElementById("dynAngSep");
        CAD.dynAngLabel = document.getElementById("dynAngLabel");
        CAD.cmdAutocomplete = document.getElementById("cmdAutocomplete");
    } catch(e) {
        console.warn("CAD.initDOM: some elements not found -", e.message);
    }
};

})(window.CAD);
