// ===================== PROJECTION.JS - Layer 3 =====================
// World <-> Screen transforms, 3D projection
"use strict";

import * as S from './state.js';
import { D } from './math.js';
import { canvas } from './dom.js';

// World -> Screen (2D projected coordinates)
// Y is negated so that positive Y points UP (AutoCAD convention)
export function w2s(wx, wy) {
    return {
        x: (wx - S.cam.x) * S.cam.zoom + canvas.width / 2,
        y: -(wy - S.cam.y) * S.cam.zoom + canvas.height / 2
    };
}

// Screen -> World (2D projected coordinates)
// Y is negated to match the w2s inversion
export function s2w(sx, sy) {
    return {
        x: (sx - canvas.width / 2) / S.cam.zoom + S.cam.x,
        y: -(sy - canvas.height / 2) / S.cam.zoom + S.cam.y
    };
}

// 3D projection: 3D world -> 2D canvas coords based on current view
export function proj3to2(x3,y3,z3){
    if(S.currentView === "2d-top") return {x:x3, y:y3};
    if(S.currentView === "2d-front") return {x:x3, y:-z3};
    if(S.currentView === "2d-side") return {x:y3, y:-z3};
    return {x:x3, y:y3};
}

// 2D canvas coords -> 3D world (using currentZ for missing axis)
export function unproj2to3(x2,y2){
    if(S.currentView === "2d-top") return {x:x2, y:y2, z:S.currentZ};
    if(S.currentView === "2d-front") return {x:x2, y:S.currentZ, z:-y2};
    if(S.currentView === "2d-side") return {x:S.currentZ, y:x2, z:-y2};
    return {x:x2, y:y2, z:S.currentZ};
}

// 3D world -> screen (projects 3D to 2D first, then to screen)
export function w2s3(x3,y3,z3){
    var p = proj3to2(x3,y3,z3);
    return w2s(p.x, p.y);
}

// Screen -> 3D world
export function s2w3(sx,sy){
    var w = s2w(sx,sy);
    return unproj2to3(w.x, w.y);
}

// Get z value from forma, defaulting to 0
export function getZ3(f,key){
    if(key && f[key] !== undefined) return f[key];
    return f.z !== undefined ? f.z : 0;
}

// Helper: push a snap point, projecting 3D->2D based on current view
export function snap3(x3,y3,z3,t,c){
    var p = proj3to2(x3,y3,z3);
    return {x:p.x, y:p.y, t:t, c:c};
}
