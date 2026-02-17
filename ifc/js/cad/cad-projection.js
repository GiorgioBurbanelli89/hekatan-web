// ===================== PROJECTION.JS - Layer 3 =====================
// World <-> Screen transforms, 3D projection
"use strict";

(function(CAD){

// World -> Screen (2D projected coordinates)
// Y is negated so that positive Y points UP (AutoCAD convention)
CAD.w2s = function(wx, wy) {
    return {
        x: (wx - CAD.cam.x) * CAD.cam.zoom + CAD.canvas.width / 2,
        y: -(wy - CAD.cam.y) * CAD.cam.zoom + CAD.canvas.height / 2
    };
};

// Screen -> World (2D projected coordinates)
// Y is negated to match the w2s inversion
CAD.s2w = function(sx, sy) {
    return {
        x: (sx - CAD.canvas.width / 2) / CAD.cam.zoom + CAD.cam.x,
        y: -(sy - CAD.canvas.height / 2) / CAD.cam.zoom + CAD.cam.y
    };
};

// 3D projection: 3D world -> 2D canvas coords based on current view
CAD.proj3to2 = function(x3,y3,z3){
    if(CAD.currentView === "2d-top") return {x:x3, y:y3};
    if(CAD.currentView === "2d-front") return {x:x3, y:-z3};
    if(CAD.currentView === "2d-side") return {x:y3, y:-z3};
    return {x:x3, y:y3};
};

// 2D canvas coords -> 3D world (using currentZ for missing axis)
CAD.unproj2to3 = function(x2,y2){
    if(CAD.currentView === "2d-top") return {x:x2, y:y2, z:CAD.currentZ};
    if(CAD.currentView === "2d-front") return {x:x2, y:CAD.currentZ, z:-y2};
    if(CAD.currentView === "2d-side") return {x:CAD.currentZ, y:x2, z:-y2};
    return {x:x2, y:y2, z:CAD.currentZ};
};

// 3D world -> screen (projects 3D to 2D first, then to screen)
CAD.w2s3 = function(x3,y3,z3){
    var p = CAD.proj3to2(x3,y3,z3);
    return CAD.w2s(p.x, p.y);
};

// Screen -> 3D world
CAD.s2w3 = function(sx,sy){
    var w = CAD.s2w(sx,sy);
    return CAD.unproj2to3(w.x, w.y);
};

// Get z value from forma, defaulting to 0
CAD.getZ3 = function(f,key){
    if(key && f[key] !== undefined) return f[key];
    return f.z !== undefined ? f.z : 0;
};

// Helper: push a snap point, projecting 3D->2D based on current view
CAD.snap3 = function(x3,y3,z3,t,c){
    var p = CAD.proj3to2(x3,y3,z3);
    return {x:p.x, y:p.y, t:t, c:c};
};

})(window.CAD);
