// ===================== HISTORY.JS - Layer 5 =====================
// Undo/redo history management
"use strict";

import * as S from './state.js';
import { set } from './state.js';
import { callbacks } from './state.js';
import { invalidateSnapCache } from './snap.js';

export function saveHist(){
    if(S.histPos < S.historial.length - 1)
        set("historial", S.historial.slice(0, S.histPos + 1));
    S.historial.push(JSON.parse(JSON.stringify(S.formas)));
    if(S.historial.length > S.MAX_HIST) S.historial.shift();
    set("histPos", S.historial.length - 1);
    invalidateSnapCache();
}

export function undo(){
    if(S.histPos > 0){
        set("histPos", S.histPos - 1);
        set("formas", JSON.parse(JSON.stringify(S.historial[S.histPos])));
        set("formaSel", -1);
        invalidateSnapCache();
        callbacks.redraw?.();
        callbacks.updTree?.();
        callbacks.showProps?.(-1);
    }
}
