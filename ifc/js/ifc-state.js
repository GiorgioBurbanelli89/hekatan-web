// =====================================================================
// CALCPAD IFC CLI v3.0 — Shared State (loaded FIRST)
// All modules read/write from window._S
// =====================================================================
"use strict";

window._S = {
    // THREE.JS objects
    scene: null, camera: null, renderer: null, controls: null,
    axesHelper: null, gridHelper: null,
    modelGroup: null,
    wireGroup: null,
    raycaster: null, mouse: null,

    // IFC model data
    ifcModel: null,
    ifcMeshes: {},
    ifcVisibility: {},
    selectedType: null,
    selectedMesh: null,          // mesh individual seleccionado por clic 3D
    selectedOrigColor: null,     // color original antes del highlight
    selectedOrigOpacity: null,   // opacidad original
    selectMode: true,            // selección 3D activa por defecto

    // Multi-selección (Ctrl+click)
    selectedMeshes: [],          // array de meshes seleccionados
    selectedOriginals: null,     // Map<mesh, {color, opacity}> — originales guardados
    _isolatedMode: false,        // true si estamos en modo aislamiento
    _isolatedHidden: [],         // meshes ocultos por aislamiento
    wireframeOn: false,

    // Clipping / Recorte
    clippingPlane: null,       // THREE.Plane activo (superior)
    clippingPlane2: null,      // THREE.Plane secundario (inferior, para seccion)
    clippingEnabled: false,
    clippingAxis: "y",         // "x","y","z" segun vista ortho
    clippingValue: 0,          // posicion del corte
    clippingFlip: false,       // invertir direccion del corte
    clipHelperGroup: null,     // THREE.Group con plano visual + flecha

    // DOM refs (set in init)
    cliOutput: null, cliInput: null, fileNameEl: null,
    objTreeEl: null, propsPanel: null, viewportInfo: null, statusBar: null,

    // Command history (up/down arrows)
    cmdHistory: [], histIdx: -1,

    // State persistence
    stateHistory: [],
    STATE_CMDS: /^(load|loadurl|merge|fusionar|mmove|fit|encuadrar|view|vista|wireframe|wire|showall|mostrartodo|hideall|ocultartodo|delete|eliminar|borrar|aislar|isolate|hidesel|ocultarsel|column|columna|beam|viga|wall|muro|slab|losa|footing|zapata|rebar|refuerzo|stair|escalera|railing|baranda|window|ventana|door|puerta)/i,

    // Alias map — element name → IFC type(s)
    ALIAS: {
        "wall":["IFCWALL","IFCWALLSTANDARDCASE"],"muro":["IFCWALL","IFCWALLSTANDARDCASE"],
        "beam":["IFCBEAM"],"viga":["IFCBEAM"],
        "column":["IFCCOLUMN"],"columna":["IFCCOLUMN"],
        "slab":["IFCSLAB"],"losa":["IFCSLAB"],
        "footing":["IFCFOOTING"],"zapata":["IFCFOOTING"],
        "member":["IFCMEMBER"],"plate":["IFCPLATE"],"placa":["IFCPLATE"],
        "roof":["IFCROOF"],"techo":["IFCROOF"],
        "stair":["IFCSTAIR","IFCSTAIRFLIGHT"],"escalera":["IFCSTAIR","IFCSTAIRFLIGHT"],
        "window":["IFCWINDOW"],"ventana":["IFCWINDOW"],
        "door":["IFCDOOR"],"puerta":["IFCDOOR"],
        "railing":["IFCRAILING"],"baranda":["IFCRAILING"],
        "rebar":["IFCREINFORCINGBAR"],"refuerzo":["IFCREINFORCINGBAR"],
        "opening":["IFCOPENINGELEMENT"],"space":["IFCSPACE"],
        "storey":["IFCBUILDINGSTOREY"],"nivel":["IFCBUILDINGSTOREY"],"piso":["IFCBUILDINGSTOREY"]
    },

    // Display names (Spanish)
    SNAMES: {
        IFCCOLUMN:"Columnas",IFCBEAM:"Vigas",IFCSLAB:"Losas",IFCWALL:"Muros",
        IFCWALLSTANDARDCASE:"Muros Std",IFCFOOTING:"Zapatas",IFCMEMBER:"Miembros",
        IFCPLATE:"Placas",IFCROOF:"Techos",IFCSTAIR:"Escaleras",IFCDOOR:"Puertas",
        IFCWINDOW:"Ventanas",IFCRAILING:"Barandas",IFCREINFORCINGBAR:"Refuerzo",IFCGRID:"Grillas"
    },

    // Plant levels (geometry-based)
    plantLevelsGroup: null,
    plantLevelsVisible: false,
    plantLevelsData: null,         // array of detected levels {elevation, types, count}
    plantLevelActive: -1,          // index of active plant level for clipping (-1 = none)

    // Merge filter presets
    MERGE_FILTERS: {
        "escalera":["IFCSTAIR","IFCSTAIRFLIGHT","IFCBUILDINGELEMENTPART","IFCBUILDINGELEMENTPROXY"],
        "stair":["IFCSTAIR","IFCSTAIRFLIGHT","IFCBUILDINGELEMENTPART","IFCBUILDINGELEMENTPROXY"],
        "muro":["IFCWALL","IFCWALLSTANDARDCASE"], "wall":["IFCWALL","IFCWALLSTANDARDCASE"],
        "columna":["IFCCOLUMN"], "column":["IFCCOLUMN"],
        "viga":["IFCBEAM"], "beam":["IFCBEAM"],
        "losa":["IFCSLAB"], "slab":["IFCSLAB"],
        "zapata":["IFCFOOTING"], "footing":["IFCFOOTING"],
        "refuerzo":["IFCREINFORCINGBAR"], "rebar":["IFCREINFORCINGBAR"],
        "todo":null, "all":null
    }
};
