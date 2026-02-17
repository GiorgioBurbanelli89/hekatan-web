// ===================== STATE.JS - Layer 0 =====================
// Centralized mutable state singleton. No imports.
// All modules read/write from this shared state.
"use strict";

// Camera / Viewport
export var cam = {
    x: 0,       // world offset X (pan)
    y: 0,       // world offset Y (pan)
    zoom: 1,    // zoom level
    minZoom: 0.1,
    maxZoom: 200
};
export var isPanning = false, panStart = {x:0, y:0}, panCamStart = {x:0, y:0};

// Shapes and history
export var formas = [];
export var historial = [];
export var histPos = -1;
export var MAX_HIST = 40;

// Drawing state
export var modo = "select";
export var pIni = null;
export var dibujando = false;
export var xPrev = 0, yPrev = 0;
export var ptsPoli = [];
export var poliEnCurso = false;
export var formaSel = -1;

// Toggle state
export var snapOn = true;
export var orthoOn = true;
export var gridOn = true;
export var sgridOn = false;
export var tamGrid = 50;
export var escala = 1;
export var unidad = "cm";

// Color
export var currentColor = "#ffffff";

// 3D state
export var currentZ = 0;
export var currentView = "2d-top";

// Snap config
export var snapCfg = {
    endpoint:true, midpoint:true, center:true, quadrant:true,
    intersection:false, perpendicular:false, nearest:true, extension:false
};

// Object Snap Tracking
export var trackingOn = true;
export var trackThreshold = 12;

// Dynamic Input
export var dynInputOn = true;
export var acSelIdx = -1;
export var dynFocused = false;
export var lastMouseScreen = {x:0, y:0};

// Selection box (Window/Crossing)
export var selBoxActive = false;
export var selBoxStart = {x:0, y:0};  // world coords
export var selBoxEnd = {x:0, y:0};    // world coords
export var selectedShapes = [];        // array of selected shape indices

// Clipboard (copy/paste)
export var clipboard = [];

// Edit operations state (move, stretch, copy-place)
export var editOp = null;       // "move"|"copy"|"stretch"|"trim"|null
export var editBase = null;     // base point {x,y} for move/copy
export var editTarget = null;   // list of shapes being edited

// Three.js (references, set by three-view.js)
export var threeRenderer = null;
export var threeScene = null;
export var threeCamera = null;
export var threeControls = null;
export var threeRaycaster = null;
export var threeMouse = null;
export var threeInited = false;
export var threeAnimId = null;

// ===================== SETTERS =====================
// ES modules export bindings are read-only from importers.
// We expose setter functions for mutable state.

export function set(key, val){
    switch(key){
        case "isPanning": isPanning=val; break;
        case "panStart": panStart=val; break;
        case "panCamStart": panCamStart=val; break;
        case "formas": formas=val; break;
        case "historial": historial=val; break;
        case "histPos": histPos=val; break;
        case "modo": modo=val; break;
        case "pIni": pIni=val; break;
        case "dibujando": dibujando=val; break;
        case "xPrev": xPrev=val; break;
        case "yPrev": yPrev=val; break;
        case "ptsPoli": ptsPoli=val; break;
        case "poliEnCurso": poliEnCurso=val; break;
        case "formaSel": formaSel=val; break;
        case "snapOn": snapOn=val; break;
        case "orthoOn": orthoOn=val; break;
        case "gridOn": gridOn=val; break;
        case "sgridOn": sgridOn=val; break;
        case "tamGrid": tamGrid=val; break;
        case "escala": escala=val; break;
        case "unidad": unidad=val; break;
        case "currentColor": currentColor=val; break;
        case "currentZ": currentZ=val; break;
        case "currentView": currentView=val; break;
        case "trackingOn": trackingOn=val; break;
        case "dynInputOn": dynInputOn=val; break;
        case "acSelIdx": acSelIdx=val; break;
        case "dynFocused": dynFocused=val; break;
        case "lastMouseScreen": lastMouseScreen=val; break;
        case "selBoxActive": selBoxActive=val; break;
        case "selBoxStart": selBoxStart=val; break;
        case "selBoxEnd": selBoxEnd=val; break;
        case "selectedShapes": selectedShapes=val; break;
        case "clipboard": clipboard=val; break;
        case "editOp": editOp=val; break;
        case "editBase": editBase=val; break;
        case "editTarget": editTarget=val; break;
        case "threeRenderer": threeRenderer=val; break;
        case "threeScene": threeScene=val; break;
        case "threeCamera": threeCamera=val; break;
        case "threeControls": threeControls=val; break;
        case "threeRaycaster": threeRaycaster=val; break;
        case "threeMouse": threeMouse=val; break;
        case "threeInited": threeInited=val; break;
        case "threeAnimId": threeAnimId=val; break;
    }
}

// ===================== CALLBACKS =====================
// Functions registered by app.js to avoid circular imports
export var callbacks = {
    setMode: null,
    zoomFit: null,
    redraw: null,
    flash: null,
    updTree: null,
    showProps: null,
    selectShape: null
};
