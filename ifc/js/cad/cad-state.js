// ===================== STATE.JS - Layer 0 =====================
// Centralized mutable state singleton. No imports.
// All modules read/write from this shared state.
"use strict";

window.CAD = window.CAD || {};

// Camera / Viewport
CAD.cam = {
    x: 0,       // world offset X (pan)
    y: 0,       // world offset Y (pan)
    zoom: 1,    // zoom level
    minZoom: 0.1,
    maxZoom: 200
};
CAD.isPanning = false;
CAD.panStart = {x:0, y:0};
CAD.panCamStart = {x:0, y:0};

// Shapes and history
CAD.formas = [];
CAD.historial = [];
CAD.histPos = -1;
CAD.MAX_HIST = 40;

// Drawing state
CAD.modo = "select";
CAD.pIni = null;
CAD.dibujando = false;
CAD.xPrev = 0;
CAD.yPrev = 0;
CAD.ptsPoli = [];
CAD.poliEnCurso = false;
CAD.formaSel = -1;

// Toggle state
CAD.snapOn = true;
CAD.orthoOn = true;
CAD.gridOn = true;
CAD.sgridOn = false;
CAD.tamGrid = 50;
CAD.escala = 1;
CAD.unidad = "cm";

// Color
CAD.currentColor = "#ffffff";

// 3D state
CAD.currentZ = 0;
CAD.currentView = "2d-top";

// 3D projection (oblique)
CAD.projMode = "2d";        // "2d" | "oblique"
CAD.projAngle = Math.PI/6;  // 30 degrees default
CAD.projScale = 0.5;        // cabinet projection

// Display
CAD.showDimLabels = true;
CAD.bgColor = "#1a1a2e";

// Snap config
CAD.snapCfg = {
    endpoint:true, midpoint:true, center:true, quadrant:true,
    intersection:false, perpendicular:false, nearest:true, extension:false
};

// Object Snap Tracking
CAD.trackingOn = true;
CAD.trackThreshold = 12;

// Dynamic Input
CAD.dynInputOn = true;
CAD.acSelIdx = -1;
CAD.dynFocused = false;
CAD.lastMouseScreen = {x:0, y:0};

// Selection box (Window/Crossing)
CAD.selBoxActive = false;
CAD.selBoxStart = {x:0, y:0};  // world coords
CAD.selBoxEnd = {x:0, y:0};    // world coords
CAD.selectedShapes = [];        // array of selected shape indices

// Clipboard (copy/paste)
CAD.clipboard = [];

// Edit operations state (move, stretch, copy-place)
CAD.editOp = null;       // "move"|"copy"|"stretch"|"trim"|null
CAD.editBase = null;     // base point {x,y} for move/copy
CAD.editTarget = null;   // list of shapes being edited

// Three.js (references, set by three-view.js)
CAD.threeRenderer = null;
CAD.threeScene = null;
CAD.threeCamera = null;
CAD.threeControls = null;
CAD.threeRaycaster = null;
CAD.threeMouse = null;
CAD.threeInited = false;
CAD.threeAnimId = null;

// ===================== SETTERS =====================
// With global namespace, properties are directly mutable.
// We keep set() for compatibility with code that calls it.

CAD.set = function(key, val){
    switch(key){
        case "isPanning": CAD.isPanning=val; break;
        case "panStart": CAD.panStart=val; break;
        case "panCamStart": CAD.panCamStart=val; break;
        case "formas": CAD.formas=val; break;
        case "historial": CAD.historial=val; break;
        case "histPos": CAD.histPos=val; break;
        case "modo": CAD.modo=val; break;
        case "pIni": CAD.pIni=val; break;
        case "dibujando": CAD.dibujando=val; break;
        case "xPrev": CAD.xPrev=val; break;
        case "yPrev": CAD.yPrev=val; break;
        case "ptsPoli": CAD.ptsPoli=val; break;
        case "poliEnCurso": CAD.poliEnCurso=val; break;
        case "formaSel": CAD.formaSel=val; break;
        case "snapOn": CAD.snapOn=val; break;
        case "orthoOn": CAD.orthoOn=val; break;
        case "gridOn": CAD.gridOn=val; break;
        case "sgridOn": CAD.sgridOn=val; break;
        case "tamGrid": CAD.tamGrid=val; break;
        case "escala": CAD.escala=val; break;
        case "unidad": CAD.unidad=val; break;
        case "currentColor": CAD.currentColor=val; break;
        case "currentZ": CAD.currentZ=val; break;
        case "currentView": CAD.currentView=val; break;
        case "trackingOn": CAD.trackingOn=val; break;
        case "dynInputOn": CAD.dynInputOn=val; break;
        case "acSelIdx": CAD.acSelIdx=val; break;
        case "dynFocused": CAD.dynFocused=val; break;
        case "lastMouseScreen": CAD.lastMouseScreen=val; break;
        case "selBoxActive": CAD.selBoxActive=val; break;
        case "selBoxStart": CAD.selBoxStart=val; break;
        case "selBoxEnd": CAD.selBoxEnd=val; break;
        case "selectedShapes": CAD.selectedShapes=val; break;
        case "clipboard": CAD.clipboard=val; break;
        case "editOp": CAD.editOp=val; break;
        case "editBase": CAD.editBase=val; break;
        case "editTarget": CAD.editTarget=val; break;
        case "threeRenderer": CAD.threeRenderer=val; break;
        case "threeScene": CAD.threeScene=val; break;
        case "threeCamera": CAD.threeCamera=val; break;
        case "threeControls": CAD.threeControls=val; break;
        case "threeRaycaster": CAD.threeRaycaster=val; break;
        case "threeMouse": CAD.threeMouse=val; break;
        case "threeInited": CAD.threeInited=val; break;
        case "threeAnimId": CAD.threeAnimId=val; break;
    }
};

// ===================== CALLBACKS =====================
// Functions registered by app.js to avoid circular imports
CAD.callbacks = {
    setMode: null,
    zoomFit: null,
    redraw: null,
    flash: null,
    updTree: null,
    showProps: null,
    selectShape: null
};
