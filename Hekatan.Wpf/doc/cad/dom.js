// ===================== DOM.JS - Layer 2 =====================
// References to DOM elements. Initialized after DOMContentLoaded.
"use strict";

export var canvas, ctx, canvasArea;
export var stX, stY, stZ, stLen, stAng, stMode, stSnap, stInfo;
export var objTree, objCount, panelProps, expOut;
export var inputX, inputY, inputZ;
export var coordOverlay, zoomIndicator, canvasHint;

// Dynamic Input elements
export var dynInput, dynCmd, dynCmdInput, dynCoordBox;
export var dynXInput, dynYInput, dynAngInput;
export var dynLabel1, dynLabel2;
export var dynZInput, dynZSep, dynZLabel;
export var dynAngSep, dynAngLabel;
export var cmdAutocomplete;

// 3D canvas
export var canvas3d;

export function initDOM(){
    canvas = document.getElementById("lienzo");
    ctx = canvas.getContext("2d");
    canvasArea = document.getElementById("canvasArea");
    canvas3d = document.getElementById("canvas3d");

    stX = document.getElementById("stX");
    stY = document.getElementById("stY");
    stZ = document.getElementById("stZ");
    stLen = document.getElementById("stLen");
    stAng = document.getElementById("stAng");
    stMode = document.getElementById("stMode");
    stSnap = document.getElementById("stSnap");
    stInfo = document.getElementById("stInfo");

    objTree = document.getElementById("objTree");
    objCount = document.getElementById("objCount");
    panelProps = document.getElementById("panelProps");
    expOut = document.getElementById("expOut");

    inputX = document.getElementById("inputX");
    inputY = document.getElementById("inputY");
    inputZ = document.getElementById("inputZ");

    coordOverlay = document.getElementById("coordOverlay");
    zoomIndicator = document.getElementById("zoomIndicator");
    canvasHint = document.getElementById("canvasHint");

    // Dynamic Input
    dynInput = document.getElementById("dynInput");
    dynCmd = document.getElementById("dynCmd");
    dynCmdInput = document.getElementById("dynCmdInput");
    dynCoordBox = document.getElementById("dynCoordBox");
    dynXInput = document.getElementById("dynX");
    dynYInput = document.getElementById("dynY");
    dynAngInput = document.getElementById("dynAng");
    dynLabel1 = document.getElementById("dynLabel1");
    dynLabel2 = document.getElementById("dynLabel2");
    dynZInput = document.getElementById("dynZ");
    dynZSep = document.getElementById("dynZSep");
    dynZLabel = document.getElementById("dynZLabel");
    dynAngSep = document.getElementById("dynAngSep");
    dynAngLabel = document.getElementById("dynAngLabel");
    cmdAutocomplete = document.getElementById("cmdAutocomplete");
}
