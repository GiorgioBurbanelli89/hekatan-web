# Análisis Escalera IFC #3428 — Registro de Trabajo

## Elemento
- **ID**: #3428 IFCBUILDINGELEMENTPROXY
- **Archivo**: vivienda Silvia sin escalera.ifc (con merge de escalera)
- **Mesh**: 524 vértices, 1 solo mesh (hormigón + acabado juntos)
- **BBox**: X=3.41m, Y=3.31m, Z=2.90m
- **Min**: (-11.36, 0.20, -11.64) | **Max**: (-7.95, 3.52, -8.74)

## Estructura de la Escalera (Escalera en U)

### Ejes
- **Eje longitudinal**: X (los peldaños avanzan en X)
- **Eje lateral (ancho)**: Z
- **Eje vertical (altura)**: Y

### 37 Niveles Y Únicos — Patrón de Peldaños
Cada peldaño tiene **2 niveles Y**:
- Gap **0.030m** = espesor del acabado (cara inf acabado → cara sup acabado)
- Gap **0.150m** = altura libre entre peldaños (contrahuella sin acabado)
- Altura total peldaño = 0.030 + 0.150 = **0.180m (18cm)**

### Niveles Y Completos (de abajo a arriba)
```
Y=0.200  base primer peldaño (especial, gap=0.105 al siguiente)
Y=0.305  tope primer peldaño

Y=0.455  base peldaño 2 (hormigón)
Y=0.485  tope peldaño 2 (acabado +3cm)

Y=0.635 / Y=0.665  peldaño 3
Y=0.815 / Y=0.845  peldaño 4
Y=0.995 / Y=1.025  peldaño 5
Y=1.175 / Y=1.205  peldaño 6
Y=1.355 / Y=1.385  peldaño 7
Y=1.535 / Y=1.565  peldaño 8  ← último del tramo 1

Y=1.715 / Y=1.745  peldaño 9  ← inicio giro/descanso
Y=1.895 / Y=1.925  peldaño 10
Y=2.075 / Y=2.105  peldaño 11
Y=2.255 / Y=2.285  peldaño 12 ← fin giro/descanso

Y=2.435 / Y=2.465  peldaño 13 ← inicio tramo 2
Y=2.615 / Y=2.645  peldaño 14
Y=2.795 / Y=2.825  peldaño 15
Y=2.975 / Y=3.005  peldaño 16
Y=3.155 / Y=3.185  peldaño 17

Y=3.335 / Y=3.365  peldaño 18 ← inicio descanso superior
Y=3.515              último nivel
```

### Tramos Identificados por Posición X y Z

#### Tramo 1 (Inferior) — Peldaños 1-8
- **Y**: 0.200 → 1.565
- **Z**: [-9.84, -8.74] constante (ancho ~1.10m)
- **X**: avanza de -11.36 → -9.26 (dirección X+)
- Posiciones X promedio por peldaño:
  - Peld 1: X_avg=-11.31
  - Peld 2: X_avg=-11.21
  - Peld 3: X_avg=-10.91
  - Peld 4: X_avg=-10.61
  - Peld 5: X_avg=-10.31
  - Peld 6: X_avg=-10.01
  - Peld 7: X_avg=-9.71
  - Peld 8: X_avg=-9.41

#### Giro/Descanso — Peldaños 9-12
- **Y**: 1.715 → 2.285
- **X**: cambia de -9.02 → -8.93 (gira)
- **Z**: cambia de [-9.98,-8.74] → [-10.65,-10.26]
- Zona donde la escalera gira 180° (escalera en U)

#### Tramo 2 (Superior) — Peldaños 13-18+
- **Y**: 2.435 → 3.515
- **Z**: [-11.64, -10.54] constante (ancho ~1.10m)
- **X**: retrocede de -8.56 → -10.60 (dirección X-)
- Posiciones X promedio por peldaño:
  - Peld 13: X_avg=-8.56
  - Peld 14: X_avg=-9.31
  - Peld 15: X_avg=-9.61
  - Peld 16: X_avg=-10.01
  - Peld 17: X_avg=-10.61
  - Peld 18: X_avg=-10.60

## Objetivo: Modificar Cara Inferior

### Lo que se necesita
- **NO agregar geometría nueva** (no crear losas/rampas adicionales)
- **Editar los vértices existentes** del mesh #3428
- Mover los vértices de la **cara inferior** de cada peldaño para que formen una rampa inclinada continua
- **NO modificar** la cara superior (huellas de los escalones)
- Tratar cada tramo por separado (tramo 1, giro, tramo 2)

### Vértices a Modificar
Los vértices de la "cara inferior" son los del **Y menor** de cada par de peldaño:
- Y=0.200, 0.455, 0.635, 0.815, 0.995, 1.175, 1.355, 1.535 (tramo 1)
- Y=1.715, 1.895, 2.075, 2.255 (giro)
- Y=2.435, 2.615, 2.795, 2.975, 3.155, 3.335, 3.515 (tramo 2)

Estos vértices actualmente forman un **zigzag escalonado**. Deben moverse en Y para formar una **línea recta inclinada**.

### Algoritmo Propuesto
Para cada tramo:
1. Encontrar Y_min (base) y Y_max (tope) del tramo
2. Encontrar X_min y X_max del tramo (eje longitudinal)
3. Para cada vértice de cara inferior:
   - Calcular t = (X - X_min) / (X_max - X_min) (posición normalizada)
   - Nuevo Y = Y_min + t * (Y_max - Y_min) - espesor
   - Donde espesor = distancia constante debajo de la huella (~15cm hormigón)

### Intentos Previos

#### Intento 1: Crear rampas STAIRRAMP nuevas
- **Resultado**: ❌ Rampas cruzadas en X (formaban una X)
- **Causa**: El split lateral por centroide Z falló — separó 410 vs 114 vértices incorrectamente
- **Lección**: No agregar geometría nueva, editar la existente

#### Intento 2: Colapsar acabado (mover yTop → yBot)
- **Resultado**: ✅ Parcial — colapsó 17 pares, 245 vértices
- **Problema**: Solo en memoria JS, se pierde al recargar
- **Lección**: Las modificaciones JS de geometría persisten mientras no se recargue la página

## Notas Técnicas

### Acceso a la Geometría
```javascript
const sc = ifcCli.scene();  // función, no propiedad
const meshes = ifcCli.meshes(); // función, retorna objeto {tipo: [meshes]}
// Buscar mesh por expressID:
let mesh = null;
sc.traverse(obj => {
  if (obj.isMesh && obj.userData && obj.userData.expressID == 3428) mesh = obj;
});
// Coordenadas mundo:
mesh.updateMatrixWorld(true);
const pos = mesh.geometry.attributes.position;
const v = new THREE.Vector3();
v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
v.applyMatrix4(mesh.matrixWorld); // local → world
// Para escribir de vuelta:
v.applyMatrix4(mesh.matrixWorld.clone().invert()); // world → local
pos.setXYZ(i, v.x, v.y, v.z);
pos.needsUpdate = true;
```

### Variables Globales del Visor
- `ifcCli.scene()` — THREE.Scene
- `ifcCli.meshes()` — {tipoIFC: [meshes]}
- `ifcCli.group` — grupo principal
- `THREE` — Three.js global

## Comandos CLI Implementados

### `quitaracabado #3428`
- **Archivo**: `ifc-commands.js` (case) + `ifc-three.js` (función `removeStairFinish`)
- **Qué hace**: Detecta pares de niveles Y con gap 2-5cm (acabado) y colapsa yTop→yBot
- **Resultado**: Elimina visualmente la capa de acabado, deja solo hormigón
- **Aliases**: `removefinish`, `removeending`

### `rampainferior #3428`
- **Archivo**: `ifc-commands.js` (case) + `ifc-three.js` (función `stairUndersideToRamp`)
- **Versión**: v60 (integrada — incluye removeFinish internamente)
- **Qué hace**:
  1. Analiza niveles Y originales (con acabado) → 37 niveles, 20 peldaños
  2. Calcula centroides X/Z usando TODOS los vértices del peldaño (yBot+yTop)
  3. Clasifica tramos (T1: zMid constante, DESC: xAvg constante, T2: banda+gap, Giro: resto)
  4. Colapsa acabado (245 vértices, gap 2-5cm → yTop→yBot)
  5. Interpola Y linealmente para cada tramo (rampa)
- **Resultado**: Acabado eliminado + cara inferior de zigzag → rampa inclinada continua
- **Clasificación**: 8+3+6+3 (t1+giro+t2+desc), 340 vértices rampa + 245 acabado
- **Aliases**: `rampunderside`, `undersideramp`

### Flujo de Uso Correcto
```
1. aislar #3428              (aislar la escalera)
2. rampainferior #3428       (quitar acabado + convertir zigzag inferior en rampa)
```
Nota: `quitaracabado` ya no es necesario — `rampainferior` v60 lo integra.

## Log de Cambios en Código

### Archivos Modificados
1. **`ifc/js/ifc-commands.js`**:
   - Líneas ~132-135: Agregada sección de ayuda "Modificar Escalera"
   - Líneas ~513-540: Agregados cases `quitaracabado` y `rampainferior`

2. **`ifc/js/ifc-three.js`**:
   - Líneas ~1092-1250: Función `removeStairFinish(meshes)`
   - Líneas ~1250-1400: Función `stairUndersideToRamp(meshes)`

### Intento 3: Comandos CLI para editar vértices
- **Estado**: ✅ Funcional (v60 — integrada)
- **Enfoque**: Editar vértices directamente (no agregar geometría)
- **Paso único**: `rampainferior` — colapsa acabado + interpola Y linealmente por tramo

### Algoritmo Final de Clasificación (v60)
- Centroides calculados con TODOS los vértices del peldaño (yBot+yTop), no solo yBot
- **Tramo 1** (8 peld): zMid constante desde inicio (tolT1 = 3.5% rango Z, ~0.063)
- **Descanso** (3 peld): xAvg constante desde final (tolDsc = 5% rango X)
- **Tramo 2** (6 peld): banda zMid (<50% rango desde T1) + gap xAvg (<2.5× huella T1) + contiguo
- **Giro** (3 peld): todo lo intermedio
- Tramos 1/2: `_rampSingleFlight` — interpolación lineal por eje X
- Giro: `_rampBySequence` — interpolación por índice secuencial

### Iteraciones del Algoritmo de Clasificación
| Versión | Método | Resultado | Problema |
|---------|--------|-----------|----------|
| v21 | k-means zMid | 6+11+3 | Zonas incorrectas |
| v22 | Threshold fijo 0.05 | 9 segmentos | Muy fragmentado |
| v23 | Top 2 jumps | 11+7+2 | Giro absorbido en tramo1 |
| v25 | Tolerancia adaptiva | 11+1+6 | Tolerancia muy alta |
| v28 | Secuencia única 20 | 500 verts | Sin separar tramos |
| v29 | Two-pass (xAvg monótono) | 8+6+4+2 | Tramo2 pierde peld 13 |
| v30 | Two-pass (zMid constante) | 8+4+5+3 | ✅ OK con removeFinish previo |
| v40 | Reescrita desde cero | 6+4+4+3 | removeFinish distorsiona centroides |
| v50 | Adaptativa (banda+gap) | 8+3+6+3 | ✅ OK datos originales, pero requería removeFinish previo |
| **v60** | **Integrada (removeFinish + ALL verts)** | **8+3+6+3** | **✅ Autosuficiente** |
