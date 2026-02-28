/**
 * main.ts - Hekatan Math Editor
 * Dos modos:
 *   - Calculate: textarea + output HTML (split view)
 *   - MathCanvas: WYSIWYG canvas editor (como MathCAD)
 */
import { HekatanEvaluator, math } from "hekatan-math/mathEngine.js";
import type { LineResult, CellResult } from "hekatan-math/mathEngine.js";
import { renderEquationText } from "hekatan-math/renderer.js";
import { MathEditor } from "hekatan-math/matheditor/MathEditor.js";
import { CadEngine } from "hekatan-math/matheditor/CadEngine.js";
import { execCommands } from "hekatan-math/matheditor/CadCli.js";
import { hitTest } from "hekatan-math/matheditor/CadInput.js";
import type { SnapPoint } from "hekatan-math/matheditor/CadSnap.js";
import { parseDraw3D } from "./Draw3DCli.js";
import { createScene, type Draw3DScene } from "./Draw3DScene.js";
import { addShapesToScene } from "./Draw3DRender.js";
import { renderOrthoView, type OrthoView } from "./Draw3DOrtho.js";
import { loadIfcToScene, fitCameraToBBox, filterIfcByPreset, getDetailCounts, setupIfcPicking, IFC_FILTER_PRESETS, type IfcDetailCategory } from "./Draw3DIfc.js";
import { Color as THREEColor } from "three";

// ─── Ejemplos ───────────────────────────────────────────
const EXAMPLES: Record<string, { name: string; code: string }> = {
  texto: {
    name: "Texto y Ecuaciones",
    code: `@{config eq:$, text:"}
# Mecanica de Materiales

@{text}
En mecanica de materiales, la letra griega sigma
representa el esfuerzo. La relacion esfuerzo-deformacion
esta dada por la Ley de Hooke $sigma = E*epsilon$
donde sigma es el esfuerzo y epsilon la deformacion.

Nota: sin comillas, sigma se convierte en simbolo griego.
Con comillas, "sigma" permanece como texto literal.
Igual para: "epsilon", "delta", "alpha", "theta".

La deflexion maxima de una viga simplemente apoyada es
$delta_max = P*L^3/(48*E*I)$ donde delta_max es la
deflexion en el centro del claro.
@{end text}
@{end config}

---

## Calculo Numerico

E = 200000
I = 500
L = 6000
P = 10

delta = P*L^3/(48*E*I)
`,
  },
  basico: {
    name: "Basico",
    code: `# Hekatan Math Editor
> Ejemplo basico de ecuaciones

a = 3
b = 4
c = sqrt(a^2 + b^2)

d = (a + b) / (a - b)

M = [[1, 2], [3, 4]]
det(M)`,
  },
  svgdemo: {
    name: "SVG Drawing Demo",
    code: `# SVG Drawing DSL
> Ejemplo del lenguaje de dibujo vectorial @{svg}

## Viga simplemente apoyada
@{svg 550 180}
background #f0f8ff
rect 10 10 530 160 fill:#e3f2fd stroke:#1565c0 width:2 rx:8
line 80 110 470 110 stroke:#333 width:3
circle 80 110 6 fill:#1565c0 stroke:#0d47a1 width:2
circle 470 110 6 fill:#c62828 stroke:#b71c1c width:2
arrow 275 50 275 105 stroke:#e65100 width:2
text 275 40 "P = 10 kN" size:13 bold color:#e65100 anchor:middle
text 80 135 "A" size:14 bold color:#1565c0 anchor:middle
text 470 135 "B" size:14 bold color:#c62828 anchor:middle
text 275 135 "L/2" size:12 italic color:#555 anchor:middle
polygon 72,120 80,110 88,120 fill:#1565c0
polygon 462,120 470,110 478,120 fill:#c62828
line 462 120 478 120 stroke:#c62828 width:2
@{end svg}

## Datos
L = 6
P = 10
R_A = P/2
R_B = P/2
M_max = P*L/4`,
  },
  cellarrays: {
    name: "Cell Arrays (Matrices)",
    code: `# Cell Arrays - Notacion Matricial
> Similar a cell arrays de MATLAB: {A, B, C}
> Notacion: k{1} → [k]₁,  k~{1} → [k̄]₁ (barra superior)

## 1. Matrices de Rigidez Local por Elemento
E = 29000
I = 882
L = 100
c = 12 * E * I / L^3

k1 = [[c, -c], [-c, c]]
k2 = [[2*c, -2*c], [-2*c, 2*c]]

## 2. Cell Array de Rigidez
> k = {k1, k2} agrupa matrices locales
k = {k1, k2}

## 3. Acceso con notacion matricial
> k{1} se renderiza como [k]₁
ke1 = k{1}
ke2 = k{2}

## 4. Matriz de Rigidez Global (con barra ~)
> T = matriz de transformacion (identidad para ejemplo)
T = [[1, 0], [0, 1]]

> K~{1} = T' * k{1} * T  (rigidez global elem 1)
Kg1 = transpose(T) * k{1} * T
Kg2 = transpose(T) * k{2} * T

> Cell array global
K = {Kg1, Kg2, Kg1 + Kg2}

> K{3} = ensamblaje total
Ktotal = K{3}`,
  },
  libroC5: {
    name: "Cap 5 - Grid Frames (Libro)",
    code: `# 5 Grid Frames

## 5.1 Introduccion

@{text}
En el Capitulo 4 se abordo el analisis estructural de porticos planos con
cargas aplicadas en el plano del portico. Cuando el portico plano esta
sometido a cargas aplicadas normalmente a su plano, la estructura se denomina
grid frame (marco de rejilla).

Estas estructuras tambien podrian tratarse como porticos tridimensionales
(Capitulo 6). Sin embargo, las estructuras modeladas como porticos planos o
como grid frames se tratan como casos especiales porque se obtiene una
reduccion inmediata en el numero de coordenadas nodales de la estructura.

Al analizar el portico plano bajo la accion de cargas en su plano, los unicos
desplazamientos nodales a considerar son las traslaciones en las direcciones
X e Y y la rotacion respecto al eje Z, resultando en un total de tres
coordenadas nodales en cada nodo. Para un grid frame ubicado en el plano X-Y
y cargado normalmente al plano de la estructura, solo se consideran tres
coordenadas nodales: la traslacion en la direccion Z y las rotaciones
respecto a los ejes X e Y.

En consecuencia, el analisis de grid frames requiere considerar solo tres
coordenadas nodales en cada nodo, mientras que tratarlas como porticos
tridimensionales requeriria seis coordenadas nodales, lo que implica un
aumento considerable en el tamano del problema.
@{end text}

## 5.2 Efectos Torsionales

@{text}
La similitud entre estas dos derivaciones ocurre porque la ecuacion
diferencial para ambos problemas tiene la misma forma matematica.
Para el problema axial, la ecuacion diferencial para la funcion de
desplazamiento esta dada por la ec. (4.4) como:
@{end text}

@{eq}
du/dx = P/(AE)  (5.1)
@{end eq}

@{text}
Analogamente, la ecuacion diferencial para el desplazamiento
angular torsional es:
@{end text}

@{eq}
dθ/dx = T/(JG)  (5.2)
@{end eq}

> donde,

@{columns 2}
> u = desplazamiento lineal
> P = fuerza axial
> E = modulo de elasticidad
> A = area de la seccion transversal
> θ = desplazamiento angular torsional
> T = momento torsor
> G = modulo de rigidez al cortante
> J = constante torsional (momento polar de inercia para secciones circulares)
@{end columns}

@{text}
Como consecuencia de la analogia entre las ecs. (5.1) y (5.2), podemos
expresar las funciones de desplazamiento para efectos torsionales como las
funciones correspondientes para desplazamientos por efectos axiales; por lo
tanto, por analogia con las ecs. (4.5) y (4.6) y con referencia a las
coordenadas nodales mostradas en la Figura 5.1, tenemos:
@{end text}

@{eq}
θ_1(x) = (1 - x/L)  (5.3)
@{end eq}

> y

@{eq}
θ_2(x) = x/L  (5.4)
@{end eq}

@{text}
en donde la funcion de desplazamiento angular θ_1(x) corresponde a la
funcion de desplazamiento lineal u_1(x) y la funcion de desplazamiento
angular θ_2(x) corresponde a la funcion de desplazamiento lineal u_2(x).
Tambien, analogamente a la ec. (4.7), los coeficientes de rigidez para
efectos torsionales pueden calcularse a partir de:
@{end text}

@{eq}
k_{ij} = ∫_0^L JG * θ_i'(x) * θ_j'(x) dx  (5.5)
@{end eq}

@{text}
en donde θ_i(x) y θ_j(x) son las derivadas respecto a x de las funciones
de desplazamiento angular θ_i(x) y θ_j(x) dadas por las ecs. (5.3) o (5.4).
@{end text}

## 5.5 Ejemplo Ilustrativo 5.1

> Para el grid frame mostrado en la Figura 5.4, realizar el analisis
> estructural para determinar lo siguiente:
> (a) Desplazamientos en las juntas entre elementos
> (b) Fuerzas internas en los elementos
> (c) Reacciones en los apoyos
> Ref: Mario Paz - Matrix Structural Analysis, 2 elementos, 3 nodos, 9 GDL
> Unidades: kip, inch, rad

@{draw 580 380}
# Fig 5.4 - Diagrama Estructural (3D oblicuo)
grid off
bg #ffffff
proj oblique 45 0.5
# Ejes de referencia
color #cc3333
arrow3d -4 0 0 -1 0 0
text3d -0.5 0 0 X
color #33aa33
arrow3d -4 0 0 -4 3 0
text3d -4 3.5 0 Y
color #3333cc
arrow3d -4 0 0 -4 0 3
text3d -4 0 3.5 Z
# Elem 1: Node1(0,0,0) to Node2(20,0,0) along X
color #333
line3d 0 0 0 20 0 0
# Elem 2: Node1(0,0,0) to Node3(0,20,0) along Y
line3d 0 0 0 0 20 0
# Nodos (circulos pequenos)
circle3d 0 0 0 0.15 #333
circle3d 20 0 0 0.15 #333
circle3d 0 20 0 0.15 #333
# Textos de nodos
color #1565c0
text3d 0.5 -1.5 0 1
text3d 20 -1.5 0 2
text3d 0 21.5 0 3
# Etiquetas de longitud
color #888
text3d 10 -2.5 0 L1=12*28 ft
text3d -3 10 0 L2=12*28 ft
# Carga puntual en nodo 2
color #cc0000
arrow3d 20 0 3 20 0 0.3
text3d 20.5 0 2.5 10 k
# Carga puntual en nodo 3
arrow3d 0 20 3 0 20 0.3
text3d 0.5 20 2.5 10 k
# Apoyos empotrados
color #666
text3d 0 -1.2 -0.5 (empotrado)
# Propiedades
color #444
text3d 7 2 0 E=30000 ksi
text3d 7 3.5 0 I=100 in^4
text3d 7 5 0 J=50 in^4
text3d 7 6.5 0 G=12000 ksi
@{end draw}

> -Fig. 5.4- Grid frame - Ejemplo Ilustrativo 5.1

### Datos del problema

E = 30000
I_z = 100
G = 12000
J = 50
L = 336

### 1. Rigidez Flexional y Torsional

EI = E * I_z
GJ = G * J

> Coeficientes de rigidez flexional (eq 5.3)

@{eq}
[k]_f = EI/L^3 * [12, 6L, -12, 6L; 6L, 4L^2, -6L, 2L^2; -12, -6L, 12, -6L; 6L, 2L^2, -6L, 4L^2]  (5.3)
@{end eq}

> Coeficientes de rigidez torsional (eq 5.5)

@{eq}
[k]_t = GJ/L * [1, -1; -1, 1]  (5.5)
@{end eq}

### 2. Matriz de Rigidez Local [k] (eq 5.7)

> La matriz de rigidez local de un elemento de grid frame
> combina flexion y torsion en un sistema de 6x6:

c = 12 * EI / L^3
a = 6 * EI / L^2
b = 4 * EI / L
d = 2 * EI / L
t = GJ / L

@{eq}
[k] = [12EI/L^3, 6EI/L^2, 0, -12EI/L^3, 6EI/L^2, 0; 6EI/L^2, 4EI/L, 0, -6EI/L^2, 2EI/L, 0; 0, 0, GJ/L, 0, 0, -GJ/L; -12EI/L^3, -6EI/L^2, 0, 12EI/L^3, -6EI/L^2, 0; 6EI/L^2, 2EI/L, 0, -6EI/L^2, 4EI/L, 0; 0, 0, -GJ/L, 0, 0, GJ/L]  (5.7)
@{end eq}

> Evaluacion numerica:

k1 = [[c, a, 0, -c, a, 0], [a, b, 0, -a, d, 0], [0, 0, t, 0, 0, -t], [-c, -a, 0, c, -a, 0], [a, d, 0, -a, b, 0], [0, 0, -t, 0, 0, t]]

> Nota: Ambos elementos tienen la misma seccion transversal,
> por lo tanto k{1} = k{2}

k = {k1, k1}

### 3. Ensamblaje de la Matriz Global

> DOF: theta_x, theta_y, delta_z por nodo
> Nodo 1: GDL 1,2,3 (libres)
> Nodo 2: GDL 4,5,6 (empotrados)
> Nodo 3: GDL 7,8,9 (empotrados)

> Condensando los GDL empotrados, la matriz reducida [K]_R es 3x3:

K_R = [[k1.(1,1) + k1.(1,1), k1.(1,2), k1.(1,2)], [k1.(2,1), k1.(2,2) + k1.(5,5), 0], [k1.(2,1), 0, k1.(2,2) + k1.(5,5)]]

### 4. Vector de Fuerzas

> Cargas en Nodo 2: P_z = 10 kip
> Cargas en Nodo 3: P_z = 10 kip

F_R = [20, 0, 0]

### 5. Solucion del Sistema

> {u} = [K]_R^-1 * {F}

u = lusolve(K_R, F_R)

> Desplazamientos en el nodo central (Nodo 1):

delta_z = u.(1)
theta_x = u.(2)
theta_y = u.(3)

### 6. Reacciones en los Apoyos

> Las reacciones se obtienen multiplicando la submatriz
> correspondiente por los desplazamientos:

> R{2} = k{1} * [u; 0; 0; 0] (reacciones en nodo 2)
> R{3} = k{2} * [u; 0; 0; 0] (reacciones en nodo 3)`,
  },
  gridframe: {
    name: "Ej 5.1 - Grid Frame (Paz)",
    code: `# 5.5 Analisis de Grid Frames
> El analisis estructural de grid frames es matematicamente identico al
> analisis de vigas o porticos planos presentado en los capitulos 1 y 4.
> Estos analisis difieren solamente en la seleccion de coordenadas nodales
> y las expresiones correspondientes a la matriz de rigidez para los
> elementos de cada estructura.

## Ejemplo Ilustrativo 5.1
> Para el grid frame mostrado en la Figura 5.4, realizar el analisis
> estructural para determinar lo siguiente:
> (a) Desplazamientos en las juntas entre elementos
> (b) Fuerzas internas en los elementos
> (c) Reacciones en los apoyos
> Ref: Mario Paz - Matrix Structural Analysis, 2 elementos, 3 nodos, 9 GDL
> Unidades: kip, inch, rad

@{draw 580 380}
# Fig 5.4 - Diagrama Estructural (3D oblicuo)
grid off
bg #ffffff
proj oblique 45 0.5
# Ejes de referencia
color #cc3333
arrow3d -4 0 0 -1 0 0
text3d -0.5 0 0 X
color #33aa33
arrow3d -4 0 0 -4 3 0
text3d -4 3.5 0 Y
color #3333cc
arrow3d -4 0 0 -4 0 3
text3d -4 0 3.5 Z
# Elem 1: Node1(0,0,0) to Node2(20,0,0) along X
color #333
line3d 0 0 0 20 0 0
# Elem 2: Node1(0,0,0) to Node3(0,20,0) along Y
line3d 0 0 0 0 20 0
# Nodos (circulos pequenos)
circle3d 0 0 0 0.15 #333
circle3d 20 0 0 0.15 #333
circle3d 0 20 0 0.15 #333
# Carga distribuida peine sobre Elem 2 (lineas cortas perpendiculares -Z)
color #cc0000
line3d 0 2 0 0 18 0
line3d 0 2 0 0 2 -2.5
line3d 0 4 0 0 4 -2.5
line3d 0 6 0 0 6 -2.5
line3d 0 8 0 0 8 -2.5
line3d 0 10 0 0 10 -2.5
line3d 0 12 0 0 12 -2.5
line3d 0 14 0 0 14 -2.5
line3d 0 16 0 0 16 -2.5
line3d 0 18 0 0 18 -2.5
line3d 0 2 -2.5 0 18 -2.5
text3d 0 11 -4 w = 0.1 k/in
# Fuerza puntual en Node 1 hacia -Z
arrow3d 0 0 5 0 0 0.5
text3d 1 0 5.5 10 k
# Momento en L/2 del Elem 1
color #9900cc
carc3d 10 0 0 1.5 0.3 5.2
text3d 10 0 2.5 200 k-in
# Apoyo empotrado en Node 2 (muro + rayado)
color #333
line3d 20 0 -1.5 20 0 1.5
line3d 20 0 1.5 21 0 1
line3d 20 0 1 21 0 0.5
line3d 20 0 0.5 21 0 0
line3d 20 0 0 21 0 -0.5
line3d 20 0 -0.5 21 0 -1
line3d 20 0 -1 21 0 -1.5
# Apoyo empotrado en Node 3 (muro + rayado)
line3d 0 20 -1.5 0 20 1.5
line3d 0 20 1.5 0 21 1
line3d 0 20 1 0 21 0.5
line3d 0 20 0.5 0 21 0
line3d 0 20 0 0 21 -0.5
line3d 0 20 -0.5 0 21 -1
line3d 0 20 -1 0 21 -1.5
# Labels nodos
color #333
text3d -1.5 0 -1 1
text3d 20.5 0 -1 2
text3d 0.5 21 0.5 3
# Labels elementos
color #0066cc
text3d 10 0 1.5 Elem 1
text3d 0 10 1.5 Elem 2
# Propiedades
color #666
text3d 12 0 -6 I=100 in^4, J=50 in^4
text3d 12 0 -7.5 E=30000, G=12000 ksi
text3d 12 0 -9 L1=L2=20 ft
fit
@{end draw}
> **Fig. 5.4** Grid frame - Ejemplo Ilustrativo 5.1

@{draw 900 700}
grid off
bg #ffffff
proj oblique 45 0.5
fontsize 14
color #000
lw 1.5

# Ejes coordenados
color #888
arrow3d 0 0 0  0 0 10
label3d 0 0 11 Z left
arrow3d 0 0 0  25 0 0
label3d 26 0 0 X left
arrow3d 0 0 0  0 25 0
label3d 0 26 0 Y left

# Barras con espesor
color #000
lw 2
beam3d 0 0 0  20 0 0  1.2
beam3d 0 0 0  0 20 0  1.2

# Grados de libertad
lw 1

# Nodo 1 (origen) - rotaciones + desplazamiento
arrow3d 3.5 0 -0.6  5.5 0 -0.6
arrow3d 1.5 0 -0.6  3.5 0 -0.6
label3d 6 0 -0.6 u1 left
arrow3d 0 3.5 -0.6  0 5.5 -0.6
arrow3d 0 1.5 -0.6  0 3.5 -0.6
label3d 0 6 -0.6 u2 left
dof3d 0 0 0.5  0 0 5  u3

# Nodo 2 (20, 0, 0)
arrow3d 23 0 -0.6  25 0 -0.6
arrow3d 21 0 -0.6  23 0 -0.6
label3d 25.5 0 -0.6 u4 left
arrow3d 20 3.2 -0.6  20 5.2 -0.6
arrow3d 20 1.2 -0.6  20 3.2 -0.6
label3d 20 5.7 -0.6 u5 left
dof3d 20 0 0.5  0 0 5  u6

# Nodo 3 (0, 20, 0)
arrow3d 3.2 20 -0.6  5.2 20 -0.6
arrow3d 1.2 20 -0.6  3.2 20 -0.6
label3d 5.7 20 -0.6 u7 left
arrow3d 0 23 -0.6  0 25 -0.6
arrow3d 0 21 -0.6  0 23 -0.6
label3d 0 25.5 -0.6 u8 left
dof3d 0 20 0.5  0 0 5  u9

# Nodos (circulos numerados)
node3d 0 0 -0.6 1 0.8
node3d 20 0 -0.6 2 0.8
node3d 0 20 -0.6 3 0.8

# Arco 90 en Nodo 1
lw 1
color #333
carc3d 0 0 0 4.5 0 1.5708
label3d 3 3 -1.5 90° below

# Triangulos de elementos
color #333
lw 1
line3d 8.5 0 -3.5  11.5 0 -3.5
line3d 11.5 0 -3.5  10 0 -1.5
line3d 10 0 -1.5  8.5 0 -3.5
label3d 10 0 -3 1 center

line3d 2 9 -1  2 11 -1
line3d 2 11 -1  2 10 1
line3d 2 10 1  2 9 -1
label3d 2 10 -0.3 2 center

# Apoyos empotrados (hatching)
line3d 20 0 -1.8  20 0 1.8
line3d 20 0 1.8  21 0 1.2
line3d 20 0 1.2  21 0 0.6
line3d 20 0 0.6  21 0 0
line3d 20 0 0  21 0 -0.6
line3d 20 0 -0.6  21 0 -1.2
line3d 20 0 -1.2  21 0 -1.8

line3d 0 20 -1.8  0 20 1.8
line3d 0 20 1.8  0 21 1.2
line3d 0 20 1.2  0 21 0.6
line3d 0 20 0.6  0 21 0
line3d 0 20 0  0 21 -0.6
line3d 0 20 -0.6  0 21 -1.2
line3d 0 20 -1.2  0 21 -1.8

fit
@{end draw}
> **Fig. 5.5** Grid frame modelado con coordenadas nodales u_1 a u_9

## 1. Propiedades
> W 14 x 82 - Todos los miembros
@{cells} |L = 100|I_z = 882|J_t = 5.08|
@{cells} |E_s = 29000|G_s = 11600|


## 2. Coeficientes de Rigidez
@{cells} |t_1 = G_s*J_t/L|a_4 = 4*E_s*I_z/L|a_2 = 2*E_s*I_z/L|
@{cells} |b_6 = 6*E_s*I_z/L^2|c_12 = 12*E_s*I_z/L^3|

## 3. Matriz de Rigidez Local [k] (eq 5.7)
> DOF: [theta_x, theta_z, delta_y] por nodo
k = [[t_1,0,0,-t_1,0,0],[0,a_4,b_6,0,a_2,-b_6],[0,b_6,c_12,0,b_6,-c_12],[-t_1,0,0,t_1,0,0],[0,a_2,b_6,0,a_4,-b_6],[0,-b_6,-c_12,0,-b_6,c_12]]



## 4. Transformacion Elemento 2
> Elem 2: theta=90 grados (eq 5.11)
T_2 = [[0,-1,0,0,0,0],[1,0,0,0,0,0],[0,0,1,0,0,0],[0,0,0,0,-1,0],[0,0,0,1,0,0],[0,0,0,0,0,1]]

## 5. Rigidez Global Elemento 2
> kb2 = T2' * k * T2 (eq 5.15)
kb2 = transpose(T_2) * k * T_2

## 6. Ensamblaje [K]_R
> Nodo 2 (libre) = extremo j Elem 1 (DOFs 4:6) + extremo i Elem 2 (DOFs 1:3)
k1R = k[4:6, 4:6]
k2R = kb2[1:3, 1:3]
K_R = k1R + k2R



## 7. Fuerzas de Empotramiento
> Elem 1: M_0=200 kip*in a L/2, Apendice I Caso (b) (eq e)
@{cells} |L_1 = L/2|L_2 = L/2|M_0 = 200|
> Q_1=6*M_0*L_1*L_2/L^3, Q_2=M_0*L_2*(2*L_1-L_2)/L^2, Q_3=-Q_1, Q_4=M_0*L_1*(2*L_2-L_1)/L^2
@{cells} |Q_1 = 6*M_0*L_1*L_2/L^3|Q_2 = M_0*L_2*(2*L_1 - L_2)/L^2|
@{cells} |Q_3 = -Q_1|Q_4 = M_0*L_1*(2*L_2 - L_1)/L^2|
> DOF grid [theta_x, theta_z, delta_y]: Q_f = [0, Q2, Q1, 0, Q4, Q3]
Q_f1 = [[0], [Q_2], [Q_1], [0], [Q_4], [Q_3]]
> Elem 2: w=0.1 kip/in, Apendice I Caso (a) (eq f)
@{cells} |w_0 = 0.1|
> M_i=wL^2/12, V_i=wL/2, M_j=-wL^2/12, V_j=wL/2
Q_f2L = [[0], [w_0*L^2/12], [w_0*L/2], [0], [-w_0*L^2/12], [w_0*L/2]]
> Q_f global via T_2'
Q_f2 = transpose(T_2) * Q_f2L



## 8. Vector de Fuerzas Reducido
> {F}_R = P - Q_f1(4:6) - Q_f2(1:3) (eq g)
P_d = [[0], [0], [-10]]
F_R = P_d - Q_f1[4:6, 1:1] - Q_f2[1:3, 1:1]

## 9. Solucion de Desplazamientos
> [K]_R {u} = {F}_R
u = lusolve(K_R, F_R)



## 10. Desplazamientos Locales
> Componentes: theta_x, theta_z, delta_y
@{cells} |u_1 = u[1,1]|u_2 = u[2,1]|u_3 = u[3,1]|
> Elem 1 (T_1=I): nodo 2 libre, nodo 1 empotrado
d_1 = [[u_1], [u_2], [u_3], [0], [0], [0]]
> Elem 2: d_2 = T_2 * d_1 (T_1=I, mismo vector global)
d_2 = T_2 * d_1

## 11. Fuerzas en Elementos (eq 4.20)
> {P} = [k]{d} + {Q_f}
P_1 = k * d_1 + Q_f1
> Elem 2 (Q_f en locales):
P_2 = k * d_2 + Q_f2L



## 12. Reacciones en Apoyos
> Nodo 1 (empotrado):
@{cells} |R_1 = P_1[4,1]|R_2 = P_1[5,1]|R_3 = P_1[6,1]|
> Nodo 3 (empotrado):
Pb2 = transpose(T_2) * P_2
@{cells} |R_7 = Pb2[4,1]|R_8 = Pb2[5,1]|R_9 = Pb2[6,1]|`,
  },
  vectores: {
    name: "Vectores y Matrices",
    code: `# Vectores y Matrices

## Vectores
v1 = [3, 4, 0]
v2 = [1, -2, 5]

> Producto punto
d = dot(v1, v2)

> Norma
n = norm(v1)

## Matrices
A = [[2, 1], [5, 3]]
B = [[1, 0], [0, 1]]

> Multiplicacion
C = multiply(A, B)

> Determinante
det_A = det(A)

> Inversa
A_inv = inv(A)

> Sistema lineal: A*x = b
b_vec = [[7], [19]]
x = lusolve(A, b_vec)`,
  },
  drawdemo: {
    name: "Draw / CAD",
    code: `# CAD Drawing Demo
> Bloques @{draw} para dibujo tecnico con comandos CLI

## Seccion transversal de viga

@{draw 500 350}
rect 0 0 30 50
rect 2.5 2.5 25 45
circle 5 5 1.2
circle 25 5 1.2
circle 5 45 1.2
circle 25 45 1.2
circle 15 25 1.2
hdim 0 0 30 0 -5
vdim 30 0 30 50 5
@{end draw}

## Planta de columnas

@{draw 500 300}
rect 0 0 20 8
rect 0 12 20 8
rect 0 0 8 20
rect 12 0 8 20
circle 4 4 1
circle 16 4 1
circle 4 16 1
circle 16 16 1
hdim 0 0 20 0 -3
vdim 20 0 20 20 3
@{end draw}

b = 30
h = 50
A_s = pi * 1.2^2 * 4`,
  },
  calculo: {
    name: "Calculo",
    code: `# Calculo Basico
> Operaciones aritmeticas y funciones

a = 3
b = 4
c = sqrt(a^2 + b^2)

> Trigonometria
alpha = atan2(b, a)
sin_a = sin(alpha)
cos_a = cos(alpha)

> Funcion personalizada
f(x) = x^3 - 2*x + 1
f(0)
f(1)
f(2)
f(3)

> Area de circulo
r = 5
A = pi * r^2`,
  },
  armadoColumna: {
    name: "Armado Columna",
    code: `# Armado Longitudinal de Columna
> Seccion transversal y elevacion usando comandos CAD CLI

## Datos de la columna
b_col = 40
h_col = 40
rec = 4
n_x = 3
n_y = 3
phi_long = 2.0
phi_est = 1.0
s_est = 15
L_col = 300

## Area de acero longitudinal
n_barras = 2*(n_x + n_y) - 4
A_s = n_barras * pi * (phi_long / 2)^2

## Seccion Transversal (CAD CLI: colsection)

@{draw 500 450}
grid off
bg #ffffff
# colsection cx cy bw bh rec dStirrup dLong nx ny
colsection 20 20 40 40 4 1.0 2.0 3 3
unit cm
# Cotas
hdim 0 0 40 0 -4
vdim 40 0 40 40 4
# Etiquetas
color #333
text 20 -6 b = 40 cm
text 47 20 h = 40 cm
color #dd3333
text 20 44 8 phi 20 mm
color #00aa66
text 20 48 Est phi 10 @ 15 cm
fit
@{end draw}
> **Fig. 1** Seccion transversal generada con colsection

## Elevacion de la Columna

@{draw 400 650}
grid off
bg #ffffff
# Columna en elevacion - concreto
color #ccc
rect 0 0 40 300
# Zona confinamiento inferior (lo=50cm, est@10cm)
color #00aa66
line 0 10 40 10
line 0 20 40 20
line 0 30 40 30
line 0 40 40 40
line 0 50 40 50
# Zona central (est@15cm) desde 50 hasta 250
line 0 65 40 65
line 0 80 40 80
line 0 95 40 95
line 0 110 40 110
line 0 125 40 125
line 0 140 40 140
line 0 155 40 155
line 0 170 40 170
line 0 185 40 185
line 0 200 40 200
line 0 215 40 215
line 0 230 40 230
line 0 245 40 245
# Zona confinamiento superior (lo=50cm, est@10cm)
line 0 250 40 250
line 0 260 40 260
line 0 270 40 270
line 0 280 40 280
line 0 290 40 290
# Barras longitudinales
color #dd3333
line 6 0 6 300
line 20 0 20 300
line 34 0 34 300
# Lineas separacion zonas (punteado)
color #0066cc
line -3 50 43 50
line -3 250 43 250
# Cotas
unit cm
vdim -5 0 -5 300 -10
vdim -5 0 -5 50 -4
vdim -5 250 -5 300 -4
hdim 0 300 40 300 6
# Etiquetas
color #333
text -20 150 L = 300 cm
text 20 312 b = 40 cm
color #0066cc
text -12 25 lo = 50
text -12 275 lo = 50
color #00aa66
text 48 25 @ 10 cm
text 48 150 @ 15 cm
text 48 275 @ 10 cm
fit
@{end draw}
> **Fig. 2** Elevacion con zonas de confinamiento (NEC)

## Zona de confinamiento (NEC)
l_o1 = max(h_col, L_col/6)
l_o = max(l_o1, 45)

## Cuantia de Refuerzo
A_g = b_col * h_col
rho = A_s / A_g * 100`,
  },
  draw3d: {
    name: "CAD 3D (Three.js)",
    code: `# CAD 3D - Three.js WebGL
> Mismo CLI que CAD 2D pero con coordenadas 3D

## Portico 3D
@{draw:3D 700 450}
bg #1a1a2e
camera 18 14 18
views front side top

# Columnas
color #999999
box 0 2.5 0 size:1,5,1
box 10 2.5 0 size:1,5,1
box 10 2.5 8 size:1,5,1

# Vigas
color #888888
box 5 5.5 0 size:12,1,1
box 10 5.5 4 size:1,1,10

# Losa (rect plano en xz)
color #aaaacc
rect 0 6 0 12 10 fill:#dde

# Flechas de carga
color #ff4444
arrow 5 9 4 5 6.5 4
text 5 9.5 4 "P = 200 kN"

# Cota
color #666666
dim 0 0 0 10 0 0 -2

# Circulo en planta
color #33aa66
circle 5 0.01 4 2

# Nodos esfericos
color #ff6600
sphere 0 5 0 r:0.25
sphere 10 5 0 r:0.25
sphere 10 5 8 r:0.25

# Piso
color #336633
box 0 -0.15 0 size:14,0.3,12
@{end draw}

## Datos
P = 200
L_x = 10
L_z = 8
M_base = P * L_x / 4`,
  },
  fig55: {
    name: "Fig 5.5 Grid Frame",
    code: `# Test Fig 5.5
> Grid frame with nodal coordinates u1-u9

@{draw 900 700}
grid off
bg #ffffff
proj oblique 45 0.5
fontsize 14
color #000
lw 1.5

# Ejes coordenados
color #888
arrow3d 0 0 0  0 0 10
label3d 0 0 11 Z left
arrow3d 0 0 0  25 0 0
label3d 26 0 0 X left
arrow3d 0 0 0  0 25 0
label3d 0 26 0 Y left

# Barras con espesor
color #000
lw 2
beam3d 0 0 0  20 0 0  1.2
beam3d 0 0 0  0 20 0  1.2

# Grados de libertad
lw 1

# Nodo 1 (origen) - rotaciones: →→  desplazamiento: →
arrow3d 3.5 0 -0.6  5.5 0 -0.6
arrow3d 1.5 0 -0.6  3.5 0 -0.6
label3d 6 0 -0.6 u1 left
arrow3d 0 3.5 -0.6  0 5.5 -0.6
arrow3d 0 1.5 -0.6  0 3.5 -0.6
label3d 0 6 -0.6 u2 left
dof3d 0 0 0.5  0 0 5  u3

# Nodo 2 (20, 0, 0)
arrow3d 23 0 -0.6  25 0 -0.6
arrow3d 21 0 -0.6  23 0 -0.6
label3d 25.5 0 -0.6 u4 left
arrow3d 20 3.2 -0.6  20 5.2 -0.6
arrow3d 20 1.2 -0.6  20 3.2 -0.6
label3d 20 5.7 -0.6 u5 left
dof3d 20 0 0.5  0 0 5  u6

# Nodo 3 (0, 20, 0)
arrow3d 3.2 20 -0.6  5.2 20 -0.6
arrow3d 1.2 20 -0.6  3.2 20 -0.6
label3d 5.7 20 -0.6 u7 left
arrow3d 0 23 -0.6  0 25 -0.6
arrow3d 0 21 -0.6  0 23 -0.6
label3d 0 25.5 -0.6 u8 left
dof3d 0 20 0.5  0 0 5  u9

# Nodos (circulos numerados)
node3d 0 0 -0.6 1 0.8
node3d 20 0 -0.6 2 0.8
node3d 0 20 -0.6 3 0.8

# Arco 90° en Nodo 1
lw 1
color #333
carc3d 0 0 0 4.5 0 1.5708
label3d 3 3 -1.5 90° below

# Triangulos de elementos
color #333
lw 1
line3d 8.5 0 -3.5  11.5 0 -3.5
line3d 11.5 0 -3.5  10 0 -1.5
line3d 10 0 -1.5  8.5 0 -3.5
label3d 10 0 -3 1 center

line3d 2 9 -1  2 11 -1
line3d 2 11 -1  2 10 1
line3d 2 10 1  2 9 -1
label3d 2 10 -0.3 2 center

# Apoyos empotrados (hatching)
line3d 20 0 -1.8  20 0 1.8
line3d 20 0 1.8  21 0 1.2
line3d 20 0 1.2  21 0 0.6
line3d 20 0 0.6  21 0 0
line3d 20 0 0  21 0 -0.6
line3d 20 0 -0.6  21 0 -1.2
line3d 20 0 -1.2  21 0 -1.8

line3d 0 20 -1.8  0 20 1.8
line3d 0 20 1.8  0 21 1.2
line3d 0 20 1.2  0 21 0.6
line3d 0 20 0.6  0 21 0
line3d 0 20 0  0 21 -0.6
line3d 0 20 -0.6  0 21 -1.2
line3d 0 20 -1.2  0 21 -1.8

fit
@{end draw}`,
  },
  ifcviewer: {
    name: "IFC Viewer",
    code: `# Visor IFC - Three.js WebGL
> Filtros: all, structural, columns, beams, slabs, rebar,
> plates, members, fasteners, connections, walls, openings

## Modelo Completo
@{import:ifc:FINAL.ifc 700 500}

## Detalle: Conexion Columna-Pedestal
> Columnas + Placas base + Refuerzo + Miembros + Pernos
@{import:ifc:FINAL.ifc 700 500 connections}`,
  },
};

// ─── DOM ────────────────────────────────────────────────
const codeInput = document.getElementById("codeInput") as HTMLTextAreaElement;
const syntaxLayer = document.getElementById("syntaxLayer") as HTMLDivElement;
const output = document.getElementById("output") as HTMLDivElement;
const exampleSelect = document.getElementById("exampleSelect") as HTMLSelectElement;
const chkAutoRun = document.getElementById("chkAutoRun") as HTMLInputElement;
const tabCode = document.getElementById("tabCode") as HTMLButtonElement;
const tabCanvas = document.getElementById("tabCanvas") as HTMLButtonElement;
const btnRun = document.getElementById("btnRun") as HTMLButtonElement;
const btnCad = document.getElementById("btnCad") as HTMLButtonElement;
const themeSelect = document.getElementById("themeSelect") as HTMLSelectElement;
const canvasContainer = document.getElementById("canvasContainer") as HTMLDivElement;
const mathCanvasEl = document.getElementById("mathCanvas") as HTMLCanvasElement;
const editorHeader = document.getElementById("editorHeader") as HTMLDivElement;
const foldGutter = document.getElementById("foldGutter") as HTMLDivElement;

// ─── MathEditor (WYSIWYG canvas) ────────────────────────
const editor = new MathEditor(mathCanvasEl);
(window as any)._editor = editor; // debug access

// ─── CAD Floating Toolbar + Interactive Drawing ──────────
let activeDrawBlock: any = null;
let cadToolbarVisible = false;

// ── Drawing state machine ──
type DrawTool = "line" | "rect" | "rrect" | "circle" | "ellipse" | "arc" | "pline" | "dim" | "hdim" | "vdim" | null;
let drawTool: DrawTool = null;
let drawPoints: { wx: number; wy: number }[] = [];
let drawMouseWorld: { wx: number; wy: number } | null = null;
let currentSnap: SnapPoint | null = null;  // snap activo bajo cursor

// Interactive tools that use mouse clicks on canvas
const INTERACTIVE_TOOLS = new Set<string>([
  "line", "rect", "rrect", "circle", "ellipse", "arc", "pline",
  "dim", "hdim", "vdim",
]);
// Commands that need CLI parameters (non-interactive)
const CLI_PARAM_CMDS = new Set([
  "move", "copy", "mirror", "rotate",
  "color", "scale", "unit", "bg", "stirrup", "colsection",
]);

// Create floating toolbar DOM
const cadToolbar = document.createElement("div");
cadToolbar.className = "cad-toolbar hidden";
cadToolbar.innerHTML = `
  <span class="drag-handle" title="Arrastrar">⠿</span>
  <button class="tool-draw" data-cmd="line" title="Linea (L)">Linea</button>
  <button class="tool-draw" data-cmd="rect" title="Rectangulo (R)">Rect</button>
  <button class="tool-draw" data-cmd="rrect" title="Rect redondeado">RRect</button>
  <button class="tool-draw" data-cmd="circle" title="Circulo (C)">Circulo</button>
  <button class="tool-draw" data-cmd="ellipse" title="Elipse (E)">Elipse</button>
  <button class="tool-draw" data-cmd="arc" title="Arco (A)">Arco</button>
  <button class="tool-draw" data-cmd="pline" title="Polilinea (PL)">PLine</button>
  <span class="sep">|</span>
  <button class="tool-dim" data-cmd="dim" title="Cota alineada">Cota</button>
  <button class="tool-dim" data-cmd="hdim" title="Cota horizontal">H-Cota</button>
  <button class="tool-dim" data-cmd="vdim" title="Cota vertical">V-Cota</button>
  <span class="sep">|</span>
  <button class="tool-edit" data-cmd="move" title="Mover (MV)">Mover</button>
  <button class="tool-edit" data-cmd="copy" title="Copiar (CP)">Copiar</button>
  <button class="tool-edit" data-cmd="mirror" title="Espejo (MI)">Espejo</button>
  <button class="tool-edit" data-cmd="rotate" title="Rotar (RO)">Rotar</button>
  <span class="sep">|</span>
  <button class="tool-view" data-cmd="fit" title="Encuadrar (ZF)">Encuadrar</button>
  <button class="tool-view" data-cmd="grid" title="Toggle grid">Grid</button>
  <button class="tool-view" data-cmd="labels on" title="Mostrar cotas auto">Labels</button>
  <span class="sep">|</span>
  <button class="tool-danger" data-cmd="undo" title="Deshacer (U)">↺ Undo</button>
  <button class="tool-danger" data-cmd="del" title="Eliminar ultimo">✕ Del</button>
  <button class="tool-danger" data-cmd="clear" title="Borrar todo">Clear</button>
  <span class="sep">|</span>
  <button class="tool-toggle snap-on" data-toggle="snap" title="Snap (F3)">Snap</button>
  <button class="tool-toggle" data-toggle="ortho" title="Ortho (F8)">Ortho</button>
  <button class="tool-toggle" data-toggle="track" title="Tracking (F11)">Track</button>
  <span class="sep">|</span>
  <input type="text" class="cad-cli" placeholder="Comando CLI..." title="Escribir comando y Enter">
  <span class="sep">|</span>
  <span class="coord-display" id="coordDisplay">X: — Y: —</span>
  <span class="sep">|</span>
  <button class="tool-close" data-action="close" title="Cerrar toolbar">✕</button>
`;
canvasContainer.appendChild(cadToolbar);

const coordDisplay = cadToolbar.querySelector("#coordDisplay") as HTMLSpanElement;

// ── Overlay canvas for interactive drawing ──
const cadOverlay = document.createElement("canvas");
cadOverlay.className = "cad-overlay hidden";
cadOverlay.tabIndex = -1;  // focusable for keyboard events
canvasContainer.appendChild(cadOverlay);

// ─── Prevent toolbar clicks from propagating to canvas/editor ──
cadToolbar.addEventListener("mousedown", (e) => { e.stopPropagation(); });
cadToolbar.addEventListener("pointerdown", (e) => { e.stopPropagation(); });

// ─── Drag logic ──────────────────────────────────────────
{
  const handle = cadToolbar.querySelector(".drag-handle") as HTMLElement;
  let dragging = false, dragX = 0, dragY = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    dragX = e.clientX - cadToolbar.offsetLeft;
    dragY = e.clientY - cadToolbar.offsetTop;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const parent = cadToolbar.parentElement!;
    const maxX = parent.clientWidth - cadToolbar.offsetWidth;
    const maxY = parent.clientHeight - cadToolbar.offsetHeight;
    cadToolbar.style.left = Math.max(0, Math.min(maxX, e.clientX - dragX)) + "px";
    cadToolbar.style.top = Math.max(0, Math.min(maxY, e.clientY - dragY)) + "px";
  });

  document.addEventListener("mouseup", () => { dragging = false; });
}

// ─── Activate a drawing tool ─────────────────────────────
function activateDrawTool(tool: DrawTool) {
  // Deactivate previous
  cadToolbar.querySelectorAll("button.tool-active").forEach(b => b.classList.remove("tool-active"));

  drawTool = tool;
  drawPoints = [];
  drawMouseWorld = null;

  if (tool) {
    // Highlight active button
    const btn = cadToolbar.querySelector(`button[data-cmd="${tool}"]`);
    if (btn) btn.classList.add("tool-active");
    showOverlay();
  } else {
    hideOverlay();
  }
}

// ─── Show/hide overlay positioned over active draw block ──
function showOverlay() {
  if (!activeDrawBlock) return;
  const block = activeDrawBlock;
  const scrollY = editor.scrollOffset;

  cadOverlay.width = block.drawW;
  cadOverlay.height = block.drawH;
  cadOverlay.style.left = (block.x + 2) + "px";
  cadOverlay.style.top = (block.y + 2 - scrollY) + "px";
  cadOverlay.style.width = block.drawW + "px";
  cadOverlay.style.height = block.drawH + "px";
  cadOverlay.classList.remove("hidden");
  cadOverlay.focus();
}

function hideOverlay() {
  cadOverlay.classList.add("hidden");
  drawTool = null;
  drawPoints = [];
  drawMouseWorld = null;
  cadToolbar.querySelectorAll("button.tool-active").forEach(b => b.classList.remove("tool-active"));
  clearOverlay();
}

function clearOverlay() {
  const ctx = cadOverlay.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, cadOverlay.width, cadOverlay.height);
}

// ─── Check if shape has enough points to commit ──────────
function isShapeComplete(tool: string, pts: { wx: number; wy: number }[]): boolean {
  switch (tool) {
    case "line": return pts.length >= 2;
    case "rect": case "rrect": return pts.length >= 2;
    case "circle": return pts.length >= 2;
    case "ellipse": return pts.length >= 2;
    case "arc": return pts.length >= 3;
    case "dim": case "hdim": case "vdim": return pts.length >= 2;
    // pline: never auto-complete, right-click to finish
    default: return false;
  }
}

// ─── Commit shape to CadEngine ───────────────────────────
function commitShape(tool: string, pts: { wx: number; wy: number }[]) {
  if (!activeDrawBlock) return;
  const engine = activeDrawBlock.cadEngine;
  const u = (v: number) => engine.toU(v);
  let cmd = "";

  switch (tool) {
    case "line": {
      cmd = `line ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)}`;
      break;
    }
    case "rect": {
      const x = Math.min(pts[0].wx, pts[1].wx);
      const y = Math.min(pts[0].wy, pts[1].wy);
      const w = Math.abs(pts[1].wx - pts[0].wx);
      const h = Math.abs(pts[1].wy - pts[0].wy);
      cmd = `rect ${u(x)} ${u(y)} ${u(w)} ${u(h)}`;
      break;
    }
    case "rrect": {
      const x = Math.min(pts[0].wx, pts[1].wx);
      const y = Math.min(pts[0].wy, pts[1].wy);
      const w = Math.abs(pts[1].wx - pts[0].wx);
      const h = Math.abs(pts[1].wy - pts[0].wy);
      const r = Math.min(w, h) * 0.15;
      cmd = `rrect ${u(x)} ${u(y)} ${u(w)} ${u(h)} ${u(r)}`;
      break;
    }
    case "circle": {
      const r = engine.D(pts[0].wx, pts[0].wy, pts[1].wx, pts[1].wy);
      cmd = `circle ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(r)}`;
      break;
    }
    case "ellipse": {
      const rx = Math.abs(pts[1].wx - pts[0].wx);
      const ry = Math.abs(pts[1].wy - pts[0].wy);
      cmd = `ellipse ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(rx)} ${u(ry)}`;
      break;
    }
    case "arc": {
      cmd = `arc ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)} ${u(pts[2].wx)} ${u(pts[2].wy)}`;
      break;
    }
    case "pline": {
      if (pts.length < 2) return;
      const coords = pts.map(p => `${u(p.wx)} ${u(p.wy)}`).join(" ");
      cmd = `pline ${coords}`;
      break;
    }
    case "dim": {
      cmd = `dim ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)}`;
      break;
    }
    case "hdim": {
      cmd = `hdim ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)}`;
      break;
    }
    case "vdim": {
      cmd = `vdim ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)}`;
      break;
    }
  }

  if (cmd) {
    engine.exec(cmd);
    activeDrawBlock.code += (activeDrawBlock.code ? "\n" : "") + cmd;
    editor.render();
    // Reposition overlay after re-render
    showOverlay();
  }
}

// ─── Render preview on overlay ───────────────────────────
function renderOverlayPreview() {
  const ctx = cadOverlay.getContext("2d");
  if (!ctx || !activeDrawBlock) return;
  ctx.clearRect(0, 0, cadOverlay.width, cadOverlay.height);

  if (!drawTool || drawPoints.length === 0 || !drawMouseWorld) return;

  const engine = activeDrawBlock.cadEngine;

  ctx.save();
  ctx.strokeStyle = "#0088ff";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);

  const p = drawPoints;
  const m = drawMouseWorld;

  switch (drawTool) {
    case "line": case "dim": case "hdim": case "vdim": {
      if (p.length === 1) {
        const s1 = engine.w2s(p[0].wx, p[0].wy);
        const s2 = engine.w2s(m.wx, m.wy);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
      }
      break;
    }
    case "rect": case "rrect": {
      if (p.length === 1) {
        const s1 = engine.w2s(p[0].wx, p[0].wy);
        const s2 = engine.w2s(m.wx, m.wy);
        ctx.beginPath();
        ctx.rect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
        ctx.stroke();
      }
      break;
    }
    case "circle": {
      if (p.length === 1) {
        const sc = engine.w2s(p[0].wx, p[0].wy);
        const se = engine.w2s(m.wx, m.wy);
        const r = Math.sqrt((se.x - sc.x) ** 2 + (se.y - sc.y) ** 2);
        ctx.beginPath(); ctx.arc(sc.x, sc.y, r, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case "ellipse": {
      if (p.length === 1) {
        const sc = engine.w2s(p[0].wx, p[0].wy);
        const se = engine.w2s(m.wx, m.wy);
        const rx = Math.abs(se.x - sc.x);
        const ry = Math.abs(se.y - sc.y);
        ctx.beginPath(); ctx.ellipse(sc.x, sc.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case "arc": {
      if (p.length === 1) {
        const s1 = engine.w2s(p[0].wx, p[0].wy);
        const s2 = engine.w2s(m.wx, m.wy);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
      } else if (p.length === 2) {
        const s1 = engine.w2s(p[0].wx, p[0].wy);
        const sc = engine.w2s(p[1].wx, p[1].wy);
        const s2 = engine.w2s(m.wx, m.wy);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y);
        ctx.quadraticCurveTo(sc.x, sc.y, s2.x, s2.y); ctx.stroke();
      }
      break;
    }
    case "pline": {
      // Draw all segments so far + line to mouse
      if (p.length >= 1) {
        const s0 = engine.w2s(p[0].wx, p[0].wy);
        ctx.beginPath(); ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < p.length; i++) {
          const si = engine.w2s(p[i].wx, p[i].wy);
          ctx.lineTo(si.x, si.y);
        }
        const sm = engine.w2s(m.wx, m.wy);
        ctx.lineTo(sm.x, sm.y);
        ctx.stroke();
      }
      break;
    }
  }

  // Draw collected points as markers
  ctx.setLineDash([]);
  ctx.fillStyle = "#0088ff";
  for (const pt of p) {
    const s = engine.w2s(pt.wx, pt.wy);
    ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
  }

  // Draw crosshair at mouse
  const ms = engine.w2s(m.wx, m.wy);
  ctx.strokeStyle = "rgba(0,136,255,0.3)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(ms.x, 0); ctx.lineTo(ms.x, cadOverlay.height);
  ctx.moveTo(0, ms.y); ctx.lineTo(cadOverlay.width, ms.y);
  ctx.stroke();

  ctx.restore();

  // Draw tracking lines (fuera del save/restore del preview)
  const trackLines = engine.snap.getTrackingLines(engine, m.wx, m.wy);
  if (trackLines.length > 0) {
    engine.snap.drawTrackingLines(ctx, engine, trackLines);
  }

  // Draw snap marker
  if (currentSnap) {
    engine.snap.drawSnapMarker(ctx, engine, currentSnap.x, currentSnap.y, currentSnap.t, currentSnap.c);
  }
}

// ─── Overlay mouse handlers ──────────────────────────────
cadOverlay.addEventListener("mousemove", (e) => {
  if (!activeDrawBlock) return;
  const rect = cadOverlay.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const engine = activeDrawBlock.cadEngine;
  let w = engine.s2w(sx, sy);
  let wx = w.x, wy = w.y;

  // 1) Object snap (F3)
  currentSnap = engine.snap.findSnap(engine, wx, wy);
  if (currentSnap) { wx = currentSnap.x; wy = currentSnap.y; }

  // 2) Grid snap (if no object snap)
  if (!currentSnap && engine.gridOn) {
    const gs = engine.snap.gridSnap(engine, wx, wy);
    wx = gs.x; wy = gs.y;
  }

  // 3) Ortho constraint (F8) - only when drawing with at least 1 point
  if (engine.snap.orthoOn && drawPoints.length > 0) {
    const last = drawPoints[drawPoints.length - 1];
    const ort = engine.snap.orthoSnap(last.wx, last.wy, wx, wy);
    wx = ort.x; wy = ort.y;
  }

  drawMouseWorld = { wx, wy };

  // Update coordinate display
  const ux = engine.toU(wx), uy = engine.toU(wy);
  coordDisplay.textContent = `X: ${engine.F(ux)}  Y: ${engine.F(uy)}`;

  if (drawTool) renderOverlayPreview();
});

cadOverlay.addEventListener("mousedown", (e) => {
  if (!activeDrawBlock || e.button !== 0) return;
  const engine = activeDrawBlock.cadEngine;

  // Si no hay herramienta activa: hit test para seleccion
  if (!drawTool) {
    const rect = cadOverlay.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = engine.s2w(sx, sy);
    const idx = hitTest(engine, w.x, w.y);
    if (idx >= 0) {
      engine.formaSel = idx;
      engine.selectedShapes = [idx];
    } else {
      engine.formaSel = -1;
      engine.selectedShapes = [];
    }
    editor.render();
    showOverlay();
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Usa las coordenadas ya snapped del mousemove
  const wx = drawMouseWorld ? drawMouseWorld.wx : 0;
  const wy = drawMouseWorld ? drawMouseWorld.wy : 0;

  drawPoints.push({ wx, wy });

  // Actualizar pIni para perpendicular/tracking
  if (drawPoints.length === 1) {
    engine.snap.pIni = { x: wx, y: wy };
  }

  if (isShapeComplete(drawTool, drawPoints)) {
    const savedTool = drawTool;
    commitShape(drawTool, drawPoints);
    drawPoints = [];
    engine.snap.pIni = null;
    engine.snap.invalidateCache();
    // Stay in same tool for continuous drawing
    drawTool = savedTool;
  }

  renderOverlayPreview();
  e.preventDefault();
  e.stopPropagation();
});

// Right-click: finish pline or cancel current shape
cadOverlay.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (drawTool === "pline" && drawPoints.length >= 2) {
    commitShape("pline", drawPoints);
    drawPoints = [];
    renderOverlayPreview();
  } else if (drawPoints.length > 0) {
    drawPoints = [];
    renderOverlayPreview();
  } else {
    activateDrawTool(null);
  }
});

// Keyboard on overlay: Escape to cancel, F3/F8/F11 toggles
cadOverlay.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (drawPoints.length > 0) {
      drawPoints = [];
      renderOverlayPreview();
    } else {
      activateDrawTool(null);
    }
    e.preventDefault();
    e.stopPropagation();
  } else if (e.key === "F3" && activeDrawBlock) {
    toggleSnapOrtho("snap");
    e.preventDefault();
  } else if (e.key === "F8" && activeDrawBlock) {
    toggleSnapOrtho("ortho");
    e.preventDefault();
  } else if (e.key === "F11" && activeDrawBlock) {
    toggleSnapOrtho("track");
    e.preventDefault();
  } else if (e.key === "Delete" && activeDrawBlock) {
    const engine = activeDrawBlock.cadEngine;
    if (engine.selectedShapes.length > 0) {
      // Delete selected shapes (reverse order)
      const sorted = [...engine.selectedShapes].sort((a, b) => b - a);
      for (const idx of sorted) engine.formas.splice(idx, 1);
      engine.selectedShapes = [];
      engine.formaSel = -1;
      engine.saveHist();
      engine.snap.invalidateCache();
      editor.render();
      showOverlay();
    }
    e.preventDefault();
  }
});

// Mouse wheel on overlay: zoom in/out
cadOverlay.addEventListener("wheel", (e) => {
  if (!activeDrawBlock) return;
  e.preventDefault();
  const engine = activeDrawBlock.cadEngine;
  const rect = cadOverlay.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  // World position under cursor before zoom
  const wBefore = engine.s2w(sx, sy);

  // Zoom factor
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  engine.cam.zoom = Math.max(engine.cam.minZoom, Math.min(engine.cam.maxZoom, engine.cam.zoom * factor));

  // World position under cursor after zoom
  const wAfter = engine.s2w(sx, sy);

  // Pan to keep point under cursor
  engine.cam.x += wBefore.x - wAfter.x;
  engine.cam.y += wBefore.y - wAfter.y;

  // Re-render
  editor.render();
  showOverlay();
  if (drawTool) renderOverlayPreview();
}, { passive: false });

// Middle mouse button drag: pan
{
  let panning = false, panStartX = 0, panStartY = 0, panStartCamX = 0, panStartCamY = 0;

  cadOverlay.addEventListener("mousedown", (e) => {
    if (e.button === 1 && activeDrawBlock) {
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartCamX = activeDrawBlock.cadEngine.cam.x;
      panStartCamY = activeDrawBlock.cadEngine.cam.y;
      cadOverlay.style.cursor = "grabbing";
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!panning || !activeDrawBlock) return;
    const engine = activeDrawBlock.cadEngine;
    const dx = (e.clientX - panStartX) / engine.cam.zoom;
    const dy = (e.clientY - panStartY) / engine.cam.zoom;
    engine.cam.x = panStartCamX - dx;
    engine.cam.y = panStartCamY + dy;  // Y inverted
    editor.render();
    showOverlay();
    if (drawTool) renderOverlayPreview();
  });

  document.addEventListener("mouseup", (e) => {
    if (panning) {
      panning = false;
      cadOverlay.style.cursor = "crosshair";
    }
  });
}

// ─── Toggle snap/ortho/track ─────────────────────────────
function toggleSnapOrtho(which: "snap" | "ortho" | "track") {
  if (!activeDrawBlock) return;
  const snap = activeDrawBlock.cadEngine.snap;
  if (which === "snap") snap.snapOn = !snap.snapOn;
  else if (which === "ortho") snap.orthoOn = !snap.orthoOn;
  else if (which === "track") snap.trackingOn = !snap.trackingOn;
  updateToggleButtons();
}

function updateToggleButtons() {
  if (!activeDrawBlock) return;
  const snap = activeDrawBlock.cadEngine.snap;
  cadToolbar.querySelectorAll("button[data-toggle]").forEach((btn) => {
    const t = (btn as HTMLElement).dataset.toggle;
    const on = t === "snap" ? snap.snapOn : t === "ortho" ? snap.orthoOn : snap.trackingOn;
    btn.classList.toggle("snap-on", on);
  });
}

// ─── Button click handler ────────────────────────────────
cadToolbar.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  if (action === "close") {
    toggleCadToolbar(false);
    return;
  }

  // Toggle buttons (snap/ortho/track)
  const toggle = btn.dataset.toggle;
  if (toggle) {
    toggleSnapOrtho(toggle as "snap" | "ortho" | "track");
    return;
  }

  const cmd = btn.dataset.cmd;
  if (!cmd || !activeDrawBlock) return;

  if (INTERACTIVE_TOOLS.has(cmd)) {
    // Interactive drawing tool → activate overlay
    activateDrawTool(cmd as DrawTool);
  } else if (CLI_PARAM_CMDS.has(cmd)) {
    // Pre-fill CLI input with command and focus
    cliInput.value = cmd + " ";
    cliInput.focus();
    cliInput.setSelectionRange(cliInput.value.length, cliInput.value.length);
  } else {
    // Immediate command (fit, grid, undo, del, clear, labels)
    activeDrawBlock.cadEngine.exec(cmd);
    editor.render();
    if (drawTool) showOverlay();  // reposition if overlay active
  }
});

// ─── CLI input ───────────────────────────────────────────
const cliInput = cadToolbar.querySelector(".cad-cli") as HTMLInputElement;
cliInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && activeDrawBlock) {
    const cmd = cliInput.value.trim();
    if (cmd) {
      activeDrawBlock.cadEngine.exec(cmd);
      activeDrawBlock.code += (activeDrawBlock.code ? "\n" : "") + cmd;
      editor.render();
      cliInput.value = "";
      if (drawTool) showOverlay();
    }
    e.preventDefault();
    e.stopPropagation();
  }
  // Prevent canvas from capturing these keys
  e.stopPropagation();
});

// ─── Toggle toolbar visibility ───────────────────────────
function toggleCadToolbar(show: boolean) {
  cadToolbarVisible = show;
  cadToolbar.classList.toggle("hidden", !show);
  btnCad.classList.toggle("active", show);
  if (!show) {
    activateDrawTool(null);
  } else {
    updateToggleButtons();
  }
}

// ─── CAD button: enable when cursor is on a @{draw} block ──
editor.onDrawBlockFocus = (draw) => {
  activeDrawBlock = draw;
  btnCad.disabled = !draw;
  if (!draw && cadToolbarVisible) {
    toggleCadToolbar(false);
  }
};

btnCad.addEventListener("click", () => {
  if (!activeDrawBlock) return;
  toggleCadToolbar(!cadToolbarVisible);
});

// Populate examples dropdown
for (const [key, ex] of Object.entries(EXAMPLES)) {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = ex.name;
  exampleSelect.appendChild(opt);
}

// ─── Mode switching (like WPF: toggle textarea/canvas in same panel) ──
let currentMode: "code" | "canvas" = "code";
let _isSyncingModes = false; // Guard flag to prevent feedback loops

function setMode(mode: "code" | "canvas") {
  if (_isSyncingModes) return;
  try {
    _isSyncingModes = true;
    const wasCanvas = currentMode === "canvas";
    currentMode = mode;
    tabCode.classList.toggle("active", mode === "code");
    tabCanvas.classList.toggle("active", mode === "canvas");

    editorHeader.textContent = mode === "canvas" ? "MathCanvas" : "Code";

    if (mode === "code") {
      // Code mode: show textarea, hide canvas (output always visible)
      codeInput.style.display = "";
      if (syntaxLayer) syntaxLayer.style.display = "";
      canvasContainer.style.display = "none";
      // Sync from canvas → code
      if (wasCanvas) {
        setCodeContent(editor.toHekatan());
      }
      updateSyntax();
      runCode();
    } else {
      // MathCanvas mode: show canvas, hide textarea (output always visible)
      codeInput.style.display = "none";
      if (syntaxLayer) syntaxLayer.style.display = "none";
      canvasContainer.style.display = "";
      // Sync code → canvas
      editor.loadFromText(codeInput.value);
      requestAnimationFrame(() => {
        editor.resize();
        editor.render();
        // Focus canvas AFTER browser has painted so cursor blink timer starts
        mathCanvasEl.focus();
      });
      // Also run code to update output
      runCode();
    }
  } finally {
    // Reset flag async to allow UI to update
    setTimeout(() => { _isSyncingModes = false; }, 0);
  }
}

tabCode.addEventListener("click", () => setMode("code"));
tabCanvas.addEventListener("click", () => setMode("canvas"));
btnRun.addEventListener("click", () => {
  if (currentMode === "canvas") {
    setCodeContent(editor.toHekatan());
  }
  runCode();
});

// ─── Live sync: MathCanvas → Code → Output (like WPF ContentChanged) ──
editor.onContentChanged = (code: string) => {
  if (_isSyncingModes) return;
  try {
    _isSyncingModes = true;
    setCodeContent(code);
    // Auto-run if enabled
    if (chkAutoRun.checked) {
      runCode();
    }
  } finally {
    setTimeout(() => { _isSyncingModes = false; }, 0);
  }
};

// ─── Example selection ──────────────────────────────────
exampleSelect.addEventListener("change", () => {
  const ex = EXAMPLES[exampleSelect.value];
  if (!ex) return;
  setCodeContent(ex.code);
  editor.loadFromText(ex.code);
  updateSyntax();
  runCode(); // Always update output
  if (currentMode === "canvas") {
    mathCanvasEl.focus();
  }
});

// ─── AutoRun checkbox → MathEditor ──────────────────────
chkAutoRun.addEventListener("change", () => {
  editor.setAutoRun(chkAutoRun.checked);
});

// ─── MathEditor callbacks ───────────────────────────────
// onContentChanged is already set above (with AutoRun support)

editor.onExecute = (code: string) => {
  // F5 / Ctrl+Enter: switch to code mode to see results
  setCodeContent(code);
  setMode("code");
  runCode();
};

// ─── Theme toggle (only affects Calculate mode HTML output) ──
themeSelect.addEventListener("change", () => {
  output.classList.toggle("theme-hekatan", themeSelect.value === "hekatan");
  if (currentMode === "code") runCode();
});

// ─── Eigen WASM (pre-load for fast linear algebra) ──────
import { eigenSolver } from "hekatan-math/wasm/eigenSolver.js";
eigenSolver.init().then(() => console.log("Eigen WASM loaded (229 KB) — sparse/dense solvers ready"));

// ─── Evaluator ──────────────────────────────────────────
const evaluator = new HekatanEvaluator();

// Track active 3D scenes for cleanup
let active3DScenes: Draw3DScene[] = [];

// ─── Code Folding (AvalonEdit-style +/- collapse) ─────────
let fullSourceLines: string[] = [];
let foldRanges: Map<number, number> = new Map(); // srcStart → srcEnd
let viewToSourceMap: number[] = [];
let prevViewLineCount = 0;

/** Find matching `end` for a foldable block at startIdx.
 *  Supports: for/if/while...end  AND  @{tag}...@{end tag} */
function findFoldEnd(lines: string[], startIdx: number): number {
  const startTrim = lines[startIdx].trim();
  // @{tag} blocks → find matching @{end tag}
  const atMatch = startTrim.match(/^@\{(\w+)/);
  if (atMatch && !/^@\{end\b/.test(startTrim)) {
    const tag = atMatch[1].toLowerCase();
    for (let i = startIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim().toLowerCase();
      if (t.startsWith(`@{end ${tag}`) || t === `@{end ${tag}}`) return i;
    }
    return -1;
  }
  // for/if/while blocks → find matching end
  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const t = lines[i].trim().toLowerCase();
    if (/^(for|if|while)\b/.test(t)) depth++;
    if (/^end\b/.test(t)) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Build the visible textarea view from fullSourceLines + folds */
function buildFoldView(): { viewLines: string[], mapping: number[] } {
  const viewLines: string[] = [];
  const mapping: number[] = [];
  let i = 0;
  while (i < fullSourceLines.length) {
    if (foldRanges.has(i)) {
      viewLines.push(fullSourceLines[i] + "  \u22EF"); // ⋯
      mapping.push(i);
      i = foldRanges.get(i)! + 1;
    } else {
      viewLines.push(fullSourceLines[i]);
      mapping.push(i);
      i++;
    }
  }
  return { viewLines, mapping };
}

/** Refresh textarea content to reflect current fold state */
function refreshFoldView() {
  const sel = codeInput.selectionStart;
  const { viewLines, mapping } = buildFoldView();
  viewToSourceMap = mapping;
  codeInput.value = viewLines.join("\n");
  codeInput.selectionStart = codeInput.selectionEnd = Math.min(sel, codeInput.value.length);
  prevViewLineCount = viewLines.length;
  updateSyntax();
  updateFoldGutter();
}

/** Toggle fold/unfold on a view line */
function toggleFold(viewLineIdx: number) {
  const srcLine = viewToSourceMap[viewLineIdx];
  if (srcLine === undefined) return;
  if (foldRanges.has(srcLine)) {
    foldRanges.delete(srcLine);
  } else {
    const endLine = findFoldEnd(fullSourceLines, srcLine);
    if (endLine > srcLine) foldRanges.set(srcLine, endLine);
  }
  refreshFoldView();
  if (chkAutoRun.checked) {
    if (autoRunTimer) clearTimeout(autoRunTimer);
    autoRunTimer = window.setTimeout(runCode, 400);
  }
}

/** Render fold markers in the gutter */
function updateFoldGutter() {
  if (!foldGutter) return;
  const lines = codeInput.value.split("\n");
  const markers: string[] = [];
  for (let v = 0; v < lines.length; v++) {
    const srcIdx = viewToSourceMap[v] ?? v;
    const trimmed = (fullSourceLines[srcIdx] ?? lines[v] ?? "").trim().toLowerCase();
    const isFoldable = /^(for|if|while)\b/.test(trimmed) ||
      (/^@\{\w+/.test(trimmed) && !/^@\{end\b/.test(trimmed) && !/^@\{config\b/.test(trimmed));
    if (isFoldable) {
      const folded = foldRanges.has(srcIdx);
      markers.push(`<span class="fold-marker fold-active" data-v="${v}">${folded ? "+" : "\u2212"}</span>`);
    } else {
      markers.push(`<span class="fold-marker fold-empty">\u00A0</span>`);
    }
  }
  foldGutter.innerHTML = `<div class="fold-inner">${markers.join("")}</div>`;
  syncFoldGutterScroll();
}

/** Sync fold gutter scroll position with textarea */
function syncFoldGutterScroll() {
  if (!foldGutter) return;
  const inner = foldGutter.querySelector(".fold-inner") as HTMLElement;
  if (inner) inner.style.marginTop = `-${codeInput.scrollTop}px`;
}

/** Set code content and reset all folds */
function setCodeContent(code: string) {
  codeInput.value = code;
  fullSourceLines = code.split("\n");
  foldRanges.clear();
  viewToSourceMap = fullSourceLines.map((_, i) => i);
  prevViewLineCount = fullSourceLines.length;
  updateFoldGutter();
}

/** Sync textarea edits back to fullSourceLines */
function syncFromTextarea() {
  const newLines = codeInput.value.split("\n");
  if (foldRanges.size === 0) {
    fullSourceLines = newLines;
    viewToSourceMap = newLines.map((_, i) => i);
    prevViewLineCount = newLines.length;
    return;
  }
  if (newLines.length !== prevViewLineCount) {
    // Line count changed while folds active → unfold all
    fullSourceLines = newLines.map(l => l.endsWith("  \u22EF") ? l.slice(0, -3) : l);
    foldRanges.clear();
    viewToSourceMap = fullSourceLines.map((_, i) => i);
    prevViewLineCount = newLines.length;
  } else {
    // Same line count → sync changed lines through mapping
    for (let v = 0; v < newLines.length; v++) {
      const s = viewToSourceMap[v];
      if (s !== undefined) {
        let line = newLines[v];
        // Strip fold marker if editing a folded line
        if (foldRanges.has(s) && line.endsWith("  \u22EF")) line = line.slice(0, -3);
        fullSourceLines[s] = line;
      }
    }
  }
  updateFoldGutter();
}

/** Get the full unfolded source for evaluation */
function getFullSource(): string {
  if (foldRanges.size === 0 || fullSourceLines.length === 0) return codeInput.value;
  return fullSourceLines.join("\n");
}

// Fold gutter click handler
foldGutter?.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest(".fold-marker:not(.fold-empty)") as HTMLElement;
  if (!el) return;
  const v = parseInt(el.dataset.v || "0", 10);
  toggleFold(v);
});

function runCode() {
  const code = getFullSource();
  if (!code.trim()) { output.innerHTML = `<div class="output-pages-wrapper"><div class="output-page"></div></div>`; return; }

  // Cleanup previous 3D scenes
  for (const sc of active3DScenes) sc.dispose();
  active3DScenes = [];

  try {
    const results = evaluator.evalDocument(code);
    const rawHTML = renderResults(results, code);
    // Split by page break markers into multiple pages
    const pageContents = rawHTML.split("<!--PAGEBREAK-->");
    const pagesHTML = pageContents.map(pc => `<div class="output-page">${pc}</div>`).join("\n");
    output.innerHTML = `<div class="output-pages-wrapper">${pagesHTML}</div>`;
    // Render @{draw} CAD blocks into their canvas elements (must be after innerHTML)
    renderDrawBlocks(results);
    // Render @{draw:3D} Three.js blocks
    renderDraw3DBlocks(results);
    // Render @{draw:3D:IFC} file upload + viewer
    renderDraw3DIfcBlocks(results);
    // Render @{import:ifc:file} auto-load IFC models
    renderImportIfcBlocks(results);
    // Auto page-break: split pages that overflow A4 height, then fit zoom
    setTimeout(() => { autoPageBreak(); syncZoom(); }, 50);
  } catch (e: any) {
    output.innerHTML = `<div class="output-pages-wrapper"><div class="output-page"><div class="out-error">Error: ${escHtml(e.message)}</div></div></div>`;
    setTimeout(syncZoom, 50);
  }
}

// ─── Auto page-break: split pages when content overflows A4 height ───
function autoPageBreak() {
  const wrapper = output.querySelector(".output-pages-wrapper") as HTMLElement;
  if (!wrapper) return;

  // Measure 267mm (A4 297mm - 15mm top padding - 15mm bottom padding) in pixels
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;height:267mm;";
  document.body.appendChild(probe);
  const maxContentPx = probe.offsetHeight;
  document.body.removeChild(probe);

  let safety = 50; // prevent infinite loop
  while (safety-- > 0) {
    const pages = Array.from(wrapper.querySelectorAll(".output-page")) as HTMLElement[];
    let didSplit = false;

    for (const page of pages) {
      const children = Array.from(page.children) as HTMLElement[];
      if (children.length <= 1) continue; // single element — can't split further

      // offsetTop includes padding-top, so max = padTop + contentHeight
      const padTop = parseFloat(getComputedStyle(page).paddingTop) || 0;
      const maxBottomPx = padTop + maxContentPx;

      let splitIdx = -1;
      for (let i = 0; i < children.length; i++) {
        // offsetTop is relative to .output-page (position:relative)
        const bottom = children[i].offsetTop + children[i].offsetHeight;
        if (bottom > maxBottomPx && i > 0) {
          splitIdx = i;
          break;
        }
      }

      if (splitIdx > 0) {
        const newPage = document.createElement("div");
        newPage.className = "output-page";
        const toMove = children.slice(splitIdx);
        for (const el of toMove) newPage.appendChild(el);
        wrapper.insertBefore(newPage, page.nextSibling);
        didSplit = true;
        break; // restart loop since DOM changed
      }
    }

    if (!didSplit) break;
  }
}

// ─── Output Rulers (Word-style, JS-created canvas overlays) ────────
const outputPanel = document.getElementById("outputPanel") as HTMLElement;

// Create ruler canvases
const outRulerH = document.createElement("canvas");
outRulerH.className = "output-ruler-h-overlay";
const outRulerV = document.createElement("canvas");
outRulerV.className = "output-ruler-v-overlay";
const outRulerCorner = document.createElement("div");
outRulerCorner.className = "output-ruler-corner-overlay";

// Insert into output-panel (which has position:relative)
outputPanel.appendChild(outRulerCorner);
outputPanel.appendChild(outRulerH);
outputPanel.appendChild(outRulerV);

// Position overlays below the "Output" header
function positionOutputRulers() {
  const header = outputPanel.querySelector(".output-header") as HTMLElement;
  const headerH = header ? header.offsetHeight : 30;
  const panelW = outputPanel.offsetWidth;
  outRulerCorner.style.top = `${headerH}px`;
  outRulerH.style.top = `${headerH}px`;
  outRulerH.style.width = `${panelW - 18 - 16}px`;  // -18 vRuler, -16 scrollbar
  outRulerV.style.top = `${headerH + 18}px`;
  outRulerV.style.height = `${outputPanel.offsetHeight - headerH - 18}px`;
}

/** Get the first output page's bounding rect relative to the output panel */
function getPageGeometry() {
  const page = output.querySelector(".output-page") as HTMLElement;
  if (!page) return null;
  const pageRect = page.getBoundingClientRect();
  const panelRect = outputPanel.getBoundingClientRect();
  const headerEl = outputPanel.querySelector(".output-header") as HTMLElement;
  const headerH = headerEl ? headerEl.offsetHeight : 30;
  // Page position relative to the ruler overlay origin
  const rulerHLeft = 18; // ruler H starts at left=18px (after vRuler)
  return {
    // Page left edge relative to hRuler canvas origin
    pageX: pageRect.left - panelRect.left - rulerHLeft,
    // Page visual width and height (after CSS zoom)
    pageW: pageRect.width,
    pageH: pageRect.height,
    // Page top relative to vRuler canvas origin (vRuler starts at headerH + 18)
    pageY: pageRect.top - panelRect.top - headerH - 18,
    headerH,
  };
}

/** Draw horizontal ruler on the Output panel */
function drawOutputHRuler() {
  const geo = getPageGeometry();
  const dpr = window.devicePixelRatio || 1;
  const cssW = outRulerH.offsetWidth;
  const cssH = 18;
  outRulerH.width = Math.round(cssW * dpr);
  outRulerH.height = Math.round(cssH * dpr);
  const ctx = outRulerH.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  ctx.fillStyle = "#d0ccc8";
  ctx.fillRect(0, 0, cssW, cssH);

  if (!geo) return;

  // Derive scale: visual page width / A4 CSS width (794px)
  const a4Wmm = 210, marginLmm = 20, marginRmm = 15;
  const pxPerMm = 96 / 25.4;
  const a4Wpx = a4Wmm * pxPerMm;
  const visScale = geo.pageW / a4Wpx;
  const marginL = marginLmm * pxPerMm * visScale;
  const marginR = marginRmm * pxPerMm * visScale;

  // Content area highlight
  const cLeft = Math.max(0, geo.pageX + marginL);
  const cRight = Math.min(cssW, geo.pageX + geo.pageW - marginR);
  if (cRight > cLeft) {
    ctx.fillStyle = "#f0eeec";
    ctx.fillRect(cLeft, 0, cRight - cLeft, cssH);
  }

  // Cm ticks
  const cmPx = (96 / 2.54) * visScale;
  const totalCm = Math.ceil(a4Wmm / 10);
  const labelInterval = cmPx < 8 ? 10 : cmPx < 14 ? 5 : cmPx < 22 ? 2 : 1;
  const rulerFontSize = Math.max(6, Math.min(10, Math.round(cmPx * 0.6)));
  ctx.font = `${rulerFontSize}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (let cm = 0; cm <= totalCm; cm++) {
    const x = geo.pageX + cm * cmPx;
    if (x < -1 || x > cssW + 1) continue;
    const isLabel = cm % labelInterval === 0;
    ctx.strokeStyle = "#777";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, cssH - 1);
    ctx.lineTo(x, cssH - (isLabel ? 7 : 4));
    ctx.stroke();
    if (cm > 0 && isLabel) {
      ctx.fillStyle = "#555";
      ctx.fillText(`${cm}`, x, cssH - 7);
    }
    if (cmPx >= 10) {
      const halfX = x + cmPx / 2;
      if (halfX >= 0 && halfX <= cssW) {
        ctx.beginPath();
        ctx.moveTo(halfX, cssH - 1);
        ctx.lineTo(halfX, cssH - 3);
        ctx.stroke();
      }
    }
  }

  // Margin triangles
  ctx.fillStyle = "#666";
  const triL = geo.pageX + marginL;
  const triR = geo.pageX + geo.pageW - marginR;
  if (triL >= 0 && triL <= cssW) {
    ctx.beginPath();
    ctx.moveTo(triL, cssH - 1);
    ctx.lineTo(triL - 4, cssH - 5);
    ctx.lineTo(triL + 4, cssH - 5);
    ctx.closePath(); ctx.fill();
  }
  if (triR >= 0 && triR <= cssW) {
    ctx.beginPath();
    ctx.moveTo(triR, cssH - 1);
    ctx.lineTo(triR - 4, cssH - 5);
    ctx.lineTo(triR + 4, cssH - 5);
    ctx.closePath(); ctx.fill();
  }

  // Bottom border
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cssH - 0.5);
  ctx.lineTo(cssW, cssH - 0.5);
  ctx.stroke();
}

/** Draw vertical ruler on the Output panel */
function drawOutputVRuler() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = 18;
  const cssH = outRulerV.offsetHeight;
  if (cssH <= 0) return;
  outRulerV.width = Math.round(cssW * dpr);
  outRulerV.height = Math.round(cssH * dpr);
  const ctx = outRulerV.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  ctx.fillStyle = "#d0ccc8";
  ctx.fillRect(0, 0, cssW, cssH);

  // Get all visible pages
  const pages = output.querySelectorAll(".output-page");
  if (!pages.length) return;

  const panelRect = outputPanel.getBoundingClientRect();
  const headerEl = outputPanel.querySelector(".output-header") as HTMLElement;
  const headerH = headerEl ? headerEl.offsetHeight : 30;
  const vRulerTop = panelRect.top + headerH + 18;

  const a4Hmm = 297, marginTmm = 15, marginBmm = 15;
  const pxPerMm = 96 / 25.4;

  // Process each visible page
  for (const pg of pages) {
    const pgRect = (pg as HTMLElement).getBoundingClientRect();
    const pageTopInRuler = pgRect.top - vRulerTop;
    const pageH = pgRect.height;

    // Skip pages completely outside view
    if (pageTopInRuler + pageH < -10 || pageTopInRuler > cssH + 10) continue;

    const visScale = pageH / (a4Hmm * pxPerMm);
    const marginT = marginTmm * pxPerMm * visScale;
    const marginB = marginBmm * pxPerMm * visScale;

    // Content area highlight
    const contentTop = pageTopInRuler + marginT;
    const contentBottom = pageTopInRuler + pageH - marginB;
    const clampedTop = Math.max(0, contentTop);
    const clampedBottom = Math.min(cssH, contentBottom);
    if (clampedBottom > clampedTop) {
      ctx.fillStyle = "#f0eeec";
      ctx.fillRect(0, clampedTop, cssW, clampedBottom - clampedTop);
    }

    // Cm ticks
    const cmPx = (96 / 2.54) * visScale;
    const totalCm = Math.ceil(a4Hmm / 10);
    const labelInterval = cmPx < 8 ? 10 : cmPx < 14 ? 5 : cmPx < 22 ? 2 : 1;
    const vFontSize = Math.max(6, Math.min(10, Math.round(cmPx * 0.6)));
    ctx.font = `${vFontSize}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let cm = 0; cm <= totalCm; cm++) {
      const y = pageTopInRuler + cm * cmPx;
      if (y < -1 || y > cssH + 1) continue;
      const isLabel = cm % labelInterval === 0;
      ctx.strokeStyle = "#777";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cssW - 1, y);
      ctx.lineTo(cssW - (isLabel ? 7 : 4), y);
      ctx.stroke();
      if (cm > 0 && isLabel && y > 4) {
        ctx.fillStyle = "#555";
        ctx.fillText(`${cm}`, cssW / 2 - 1, y);
      }
      if (cmPx >= 10) {
        const halfY = y + cmPx / 2;
        if (halfY >= 0 && halfY <= cssH) {
          ctx.beginPath();
          ctx.moveTo(cssW - 1, halfY);
          ctx.lineTo(cssW - 3, halfY);
          ctx.stroke();
        }
      }
    }

    // Margin triangles
    ctx.fillStyle = "#666";
    if (contentTop >= 0 && contentTop <= cssH) {
      ctx.beginPath();
      ctx.moveTo(cssW - 1, contentTop);
      ctx.lineTo(cssW - 5, contentTop - 2);
      ctx.lineTo(cssW - 5, contentTop + 2);
      ctx.closePath(); ctx.fill();
    }
    if (contentBottom >= 0 && contentBottom <= cssH) {
      ctx.beginPath();
      ctx.moveTo(cssW - 1, contentBottom);
      ctx.lineTo(cssW - 5, contentBottom - 2);
      ctx.lineTo(cssW - 5, contentBottom + 2);
      ctx.closePath(); ctx.fill();
    }
  }

  // Right border
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cssW - 0.5, 0);
  ctx.lineTo(cssW - 0.5, cssH);
  ctx.stroke();
}

function updateOutputRulers() {
  positionOutputRulers();
  drawOutputHRuler();
  drawOutputVRuler();
}

// ─── Shared CSS-transform zoom ──────────────────────────────────────
// zoomLevel is applied as CSS transform on the canvas and CSS zoom on
// the output wrapper. This makes EVERYTHING scale visually: pages,
// text, equations, @{draw} diagrams, matrices, etc.

function syncZoom() {
  const zoom = editor.getDebugInfo().zoomLevel;

  // Canvas panel: CSS zoom (changes layout size → scrollbars work naturally)
  (mathCanvasEl.style as any).zoom = `${zoom}`;

  // Output panel: compute SAME auto-fit scale as MathCanvas (same formula)
  // so both pages are always identical size regardless of timing
  const wrapper = output.querySelector(".output-pages-wrapper") as HTMLElement;
  if (wrapper) {
    const a4Wpx = 210 * 96 / 25.4;            // 794px = A4 width
    const vRulerW = 18, sbW = 10, sbMargin = 2; // same as MathEditor constants
    // Use output panel width for scale calculation
    const panelW = output.clientWidth || mathCanvasEl.clientWidth || codeInput.clientWidth;
    const availW = panelW - sbW - sbMargin - vRulerW;
    const scale = Math.min((availW - 20) / a4Wpx, 1);
    wrapper.style.zoom = `${scale * zoom}`;

    // Dynamic padding-top: match MathCanvas gap exactly
    // MathCanvas pagesStartY = rulerH(18) + max(4, 12*scale), no zoom mult
    const rulerH = 18;
    const mcPageGap = Math.max(4, 12 * scale);
    const dynPadTop = Math.round(rulerH + mcPageGap);
    output.style.paddingTop = `${dynPadTop}px`;
  }

  updateOutputRulers();
}

// Auto-fit al cargar y al cambiar tamaño — re-render canvas then sync
window.addEventListener("resize", () => {
  editor.resize();          // recomputes autoFitScale
  syncZoom();               // includes updateOutputRulers()
});
setTimeout(() => { editor.resize(); syncZoom(); }, 100);
setTimeout(() => { updateOutputRulers(); }, 200);

// When canvas zoom changes → sync output
editor.onZoomChange = (_zoom) => {
  syncZoom();
};

// Global Ctrl+wheel → always route to our shared zoom (prevent browser zoom)
document.addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.05 : 0.05;
  const info = editor.getDebugInfo();
  const newZoom = Math.max(0.5, Math.min(3.0, info.zoomLevel + delta));
  editor.setZoom(newZoom);    // fires onZoomChange → syncZoom
}, { passive: false });

// ─── Scroll sync: MathCanvas ↔ Output ───────────────────
let scrollSyncing = false;

// Canvas scroll → Output scroll
editor.onScrollChange = (fraction) => {
  if (scrollSyncing) return;
  scrollSyncing = true;
  const maxScroll = output.scrollHeight - output.clientHeight;
  if (maxScroll > 0) output.scrollTop = fraction * maxScroll;
  scrollSyncing = false;
};

// Output scroll → Canvas scroll + update vertical ruler
output.addEventListener("scroll", () => {
  if (scrollSyncing) return;
  scrollSyncing = true;
  const maxScroll = output.scrollHeight - output.clientHeight;
  const fraction = maxScroll > 0 ? output.scrollTop / maxScroll : 0;
  editor.setScrollFraction(fraction);
  scrollSyncing = false;
  updateOutputRulers();
});

// ─── Keyboard (Calculate mode textarea) ─────────────────
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "F5") { e.preventDefault(); runCode(); return; }
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); return; }
  if (e.key === "Tab") {
    e.preventDefault();
    const s = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    codeInput.value = codeInput.value.substring(0, s) + "  " + codeInput.value.substring(end);
    codeInput.selectionStart = codeInput.selectionEnd = s + 2;
    syncFromTextarea();
    updateSyntax();
  }
});

// AutoRun on input (Calculate mode)
let autoRunTimer: number | null = null;
codeInput.addEventListener("input", () => {
  syncFromTextarea();
  updateSyntax();
  updateFoldGutter();
  if (!chkAutoRun.checked) return;
  if (autoRunTimer) clearTimeout(autoRunTimer);
  autoRunTimer = window.setTimeout(runCode, 400);
});

// ─── Syntax Highlighting ────────────────────────────────
const SYN_FUNCTIONS = /\b(sin|cos|tan|asin|acos|atan|atan2|sqrt|cbrt|ln|log|exp|abs|round|floor|ceiling|min|max|mod|gcd|lcm|sum|product|integral|transpose|lsolve|det|inv|identity|matrix)\b/g;
const SYN_NUMBERS = /\b(\d+\.?\d*([eE][+-]?\d+)?)\b/g;

function synEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function synHl(text: string, cls: string): string {
  return `<span class="${cls}">${synEsc(text)}</span>`;
}
function synLine(line: string): string {
  return synEsc(line)
    .replace(SYN_NUMBERS, '<span class="syn-number">$1</span>')
    .replace(/\b(sin|cos|tan|asin|acos|atan|atan2|sqrt|cbrt|ln|log|exp|abs|round|floor|ceiling|min|max|mod|gcd|lcm|sum|product|integral|transpose|lsolve|det|inv|identity|matrix)\b/g,
      '<span class="syn-function">$1</span>');
}
/** Split line at // and dim the comment part */
function synWithInlineComment(line: string, mainFn: (s: string) => string): string {
  const idx = line.indexOf("//");
  if (idx < 0) return mainFn(line);
  const codePart = line.slice(0, idx);
  const commentPart = line.slice(idx);
  return mainFn(codePart) + `<span class="syn-dim">${synEsc(commentPart)}</span>`;
}
function updateSyntax() {
  if (!syntaxLayer) return;
  const text = codeInput.value;
  const lines = text.split("\n");
  let inBlock = false;
  const parts: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (/^@\{(?!end)/.test(trimmed)) inBlock = true;
    if (/^@\{end\s/.test(trimmed)) { parts.push(synHl(line, "syn-block")); inBlock = false; continue; }
    if (/^@\{/.test(trimmed)) { parts.push(synHl(line, "syn-block")); continue; }
    if (inBlock) { parts.push(synEsc(line)); continue; }
    if (/^#{1,6}\s/.test(trimmed)) {
      parts.push(synWithInlineComment(line, s => synHl(s, "syn-heading"))); continue;
    }
    if (trimmed.startsWith("//")) { parts.push(synHl(line, "syn-dim")); continue; }
    if (trimmed.startsWith(">")) {
      parts.push(synWithInlineComment(line, s => synHl(s, "syn-comment"))); continue;
    }
    if (trimmed.startsWith("'")) {
      parts.push(synWithInlineComment(line, s => synHl(s, "syn-comment"))); continue;
    }
    if (/^(for|next|end(\s+(for|if|while))?|end|if|else(\s+if)?|repeat|loop|break|continue|while|do)\b/i.test(trimmed)) {
      parts.push(synWithInlineComment(line, s => synHl(s, "syn-keyword"))); continue;
    }
    parts.push(synWithInlineComment(line, synLine));
  }
  syntaxLayer.innerHTML = parts.join("\n");
  syntaxLayer.scrollTop = codeInput.scrollTop;
  syntaxLayer.scrollLeft = codeInput.scrollLeft;
}
codeInput.addEventListener("scroll", () => {
  if (syntaxLayer) {
    syntaxLayer.scrollTop = codeInput.scrollTop;
    syntaxLayer.scrollLeft = codeInput.scrollLeft;
  }
  syncFoldGutterScroll();
});

// ─── Menu & Toolbar Actions ─────────────────────────────
function insertAtCursor(text: string) {
  const s = codeInput.selectionStart;
  const e = codeInput.selectionEnd;
  const val = codeInput.value;
  const insert = text.replace(/\\n/g, "\n");
  codeInput.value = val.substring(0, s) + insert + val.substring(e);
  codeInput.selectionStart = codeInput.selectionEnd = s + insert.length;
  codeInput.focus();
  syncFromTextarea();
  updateSyntax();
  if (chkAutoRun.checked) {
    if (autoRunTimer) clearTimeout(autoRunTimer);
    autoRunTimer = window.setTimeout(runCode, 400);
  }
}

// Menu dropdown buttons
document.querySelectorAll<HTMLButtonElement>(".menu-dropdown button[data-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    switch (action) {
      case "new": setCodeContent(""); updateSyntax(); runCode(); break;
      case "save": {
        const blob = new Blob([getFullSource()], { type: "text/plain" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = "document.hcalc"; a.click(); break;
      }
      case "open": {
        const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".hcalc,.txt";
        inp.onchange = () => { if (inp.files?.[0]) inp.files[0].text().then(t => { setCodeContent(t); updateSyntax(); runCode(); }); };
        inp.click(); break;
      }
      case "export-html": {
        const blob = new Blob([output.innerHTML], { type: "text/html" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = "output.html"; a.click(); break;
      }
      case "print": window.print(); break;
      case "undo": document.execCommand("undo"); updateSyntax(); break;
      case "redo": document.execCommand("redo"); updateSyntax(); break;
      case "find": /* TODO */ break;
      case "selectall": codeInput.select(); break;
    }
  });
});

// Insert buttons (menu submenus + toolbar fmt-btn)
document.querySelectorAll<HTMLButtonElement>("[data-insert]").forEach(btn => {
  btn.addEventListener("click", () => {
    const text = btn.dataset.insert || "";
    insertAtCursor(text);
  });
});

// ─── HTML escaping ──────────────────────────────────────
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ═══════════════════════════════════════════════════════════
// RENDERER - Genera HTML con clases de template.html
// ═══════════════════════════════════════════════════════════

function renderResults(results: LineResult[], sourceCode: string): string {
  const html: string[] = [];
  let inColumns = false;
  let columnCount = 0;
  let columnItems: string[] = [];
  let currentAlign: "left" | "center" | "right" = "left"; // default alignment
  const sourceLines = sourceCode.split("\n");
  _renderSourceLines = sourceLines; // Store for integral notation lookup
  // Reset render-time config (will be re-applied from directives)
  evaluator.eqDelimiter = "";
  evaluator.textDelimiter = "";

  for (const r of results) {
    let srcLine = sourceLines[r.lineIndex]?.trim() ?? "";
    // Strip inline // comments from source line for rendering
    const cmtIdx = srcLine.indexOf("//");
    if (cmtIdx >= 0) srcLine = srcLine.slice(0, cmtIdx).trim();

    // Detect alignment from @{align:...}, @{text:...} and @{eq:...} directives
    if (r.type === "directive" && r.display && /^(align|text|eq):/.test(r.display)) {
      const align = r.display.split(":")[1];
      if (align === "end") {
        currentAlign = "left";
      } else {
        currentAlign = align as "left" | "center" | "right";
      }
      continue;
    }

    // Detect @{columns N} start
    const colMatch = srcLine.match(/^@\{columns\s+(\d+)\}/i);
    if (colMatch) {
      inColumns = true;
      columnCount = parseInt(colMatch[1]);
      columnItems = [];
      continue;
    }

    // Empty line or heading/comment exits columns mode
    if (inColumns && (r.type === "empty" || r.type === "heading" || r.type === "comment" || r.type === "hrule")) {
      if (columnItems.length > 0) {
        html.push(renderColumnsGrid(columnItems, columnCount));
        columnItems = [];
      }
      inColumns = false;
    }

    if (inColumns && (r.type === "assignment" || r.type === "expression")) {
      columnItems.push(renderLineEq(r, srcLine));
      continue;
    }

    // Flush remaining columns
    if (inColumns && columnItems.length > 0 && r.type !== "assignment" && r.type !== "expression") {
      html.push(renderColumnsGrid(columnItems, columnCount));
      columnItems = [];
      inColumns = false;
    }

    switch (r.type) {
      case "heading": {
        const match = r.display!.match(/^(#{1,6})\s+(.*)/);
        if (match) {
          const level = match[1].length;
          const headText = match[2];
          // Book-style chapter heading: "# 5 Grid Frames" → number big, title right-aligned, ruled lines
          if (level === 1) {
            const chapMatch = headText.match(/^(\d+)\s+(.*)/);
            if (chapMatch) {
              html.push(`<h1 class="chapter-heading align-${currentAlign}"><span class="chapter-num">${escHtml(chapMatch[1])}</span> <span class="chapter-title">${escHtml(chapMatch[2])}</span></h1>`);
            } else {
              html.push(`<h1 class="chapter-heading align-${currentAlign}"><span class="chapter-title">${escHtml(headText)}</span></h1>`);
            }
          } else if (level === 2) {
            // Section heading: "## 5.2 Efectos" → number spaced from title
            const secMatch = headText.match(/^([\d.]+)\s+(.*)/);
            if (secMatch) {
              html.push(`<h${level} class="section-heading align-${currentAlign}"><span class="section-num">${escHtml(secMatch[1])}</span><span class="section-title">${escHtml(secMatch[2])}</span></h${level}>`);
            } else {
              html.push(`<h${level} class="align-${currentAlign}">${escHtml(headText)}</h${level}>`);
            }
          } else {
            html.push(`<h${level} class="align-${currentAlign}">${escHtml(headText)}</h${level}>`);
          }
        }
        break;
      }
      case "comment":
        html.push(`<p class="out-comment align-${currentAlign}">${renderCommentMath(r.display!)}</p>`);
        break;
      case "empty":
        html.push(`<div class="out-empty"></div>`);
        break;
      case "hrule":
        html.push(`<hr class="out-hrule">`);
        break;
      case "eqline": {
        // Equation line inside @{text} > @{eq} block
        const eqLine = r.display!;
        const numMatch = eqLine.match(/\((\d+(?:\.\d+)?[a-z]?)\)\s*$/);
        let eqText = eqLine;
        let eqNum = "";
        if (numMatch) {
          eqText = eqLine.slice(0, numMatch.index).trim();
          eqNum = numMatch[1];
        }
        let eqHtml = `<p class="eq align-${currentAlign}" style="line-height:2.2;margin:4px 0;">`;
        eqHtml += renderEquationText(eqText);
        if (eqNum) eqHtml += `<span style="float:right;font-style:normal;margin-left:24px">(${eqNum})</span>`;
        eqHtml += `</p>`;
        html.push(eqHtml);
        break;
      }
      case "assignment":
        if (r.displayHint) {
          html.push(`<p class="eq out-line align-${currentAlign}">${renderDisplayHint(r)}</p>`);
        } else {
          html.push(`<p class="eq out-line align-${currentAlign}">${renderLineEq(r, srcLine)}</p>`);
        }
        break;
      case "expression":
        if (r.displayHint) {
          html.push(`<p class="eq out-line align-${currentAlign}">${renderDisplayHint(r)}</p>`);
        } else {
          html.push(`<p class="eq out-line align-${currentAlign}">${renderExprResult(r)}</p>`);
        }
        break;
      case "plot":
        html.push(renderPlotBlock(r));
        break;
      case "cells":
        html.push(renderCells(r));
        break;
      case "error":
        html.push(`<div class="out-error">${escHtml(r.error!)}</div>`);
        break;
      case "draw": {
        const uid = `cad-output-${r.lineIndex}`;
        const w = r.drawWidth || 500;
        const h = r.drawHeight || 400;
        html.push(`<div class="draw-container" style="margin:0.5em 0;max-width:100%;overflow:hidden;">
          <canvas id="${uid}" width="${w}" height="${h}" style="border:1px solid #ccc;display:block;max-width:100%;height:auto;"></canvas>
        </div>`);
        break;
      }
      case "draw3d": {
        const uid3 = `cad3d-output-${r.lineIndex}`;
        const w3 = r.drawWidth || 500;
        const h3 = r.drawHeight || 400;
        html.push(`<div class="draw3d-container" id="${uid3}" style="margin:0.5em 0;width:${w3}px;max-width:100%;height:${h3}px;border:1px solid #4488ff;border-radius:4px;overflow:hidden;box-sizing:border-box;"></div>`);
        break;
      }
      case "draw3difc": {
        const uidIfc = `ifc3d-output-${r.lineIndex}`;
        const wIfc = r.drawWidth || 600;
        const hIfc = r.drawHeight || 450;
        html.push(`<div class="draw3d-ifc-container" style="margin:0.5em 0;">
          <div style="margin-bottom:6px;display:flex;align-items:center;gap:8px;">
            <input type="file" id="${uidIfc}-file" accept=".ifc" style="font-size:12px;">
            <span id="${uidIfc}-status" style="font-size:11px;color:#888;">Selecciona un archivo .ifc</span>
          </div>
          <div id="${uidIfc}" style="width:${wIfc}px;max-width:100%;height:${hIfc}px;border:1px solid #4488ff;border-radius:4px;overflow:hidden;background:#1a1a2e;box-sizing:border-box;"></div>
          <div id="${uidIfc}-views" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
        </div>`);
        break;
      }
      case "importifc": {
        const uidIfc2 = `ifc-import-${r.lineIndex}`;
        const wI = r.drawWidth || 700;
        const hI = r.drawHeight || 500;
        const btnStyle = `padding:2px 7px;font-size:10px;border:1px solid #555;border-radius:3px;cursor:pointer;background:#2a2a3e;color:#ccc;`;
        html.push(`<div class="draw3d-ifc-container" style="margin:0.5em 0;">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:11px;color:#888;" id="${uidIfc2}-status">Cargando ${r.ifcFile}...</span>
          </div>
          <div id="${uidIfc2}-filters" style="display:none;margin-bottom:4px;">
            <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;">
              <span style="font-size:10px;color:#666;margin-right:2px;">Filtros:</span>
              <button data-filter="all" style="${btnStyle}background:#4488ff;color:#fff;">Todo</button>
              <button data-filter="structural" style="${btnStyle}">Estructural</button>
              <button data-filter="connections" style="${btnStyle}">Conexiones</button>
              <button data-filter="columns" style="${btnStyle}">Columnas</button>
              <button data-filter="beams" style="${btnStyle}">Vigas</button>
              <button data-filter="slabs" style="${btnStyle}">Losas</button>
              <button data-filter="rebar" style="${btnStyle}">Refuerzo</button>
              <button data-filter="plates" style="${btnStyle}">Placas</button>
              <button data-filter="members" style="${btnStyle}">Miembros</button>
              <button data-filter="fasteners" style="${btnStyle}">Pernos</button>
              <button data-filter="walls" style="${btnStyle}">Muros</button>
              <button data-filter="openings" style="${btnStyle}">Ventanas</button>
            </div>
          </div>
          <div id="${uidIfc2}" style="width:${wI}px;height:${hI}px;border:1px solid #4488ff;border-radius:4px;overflow:hidden;background:#1a1a2e;cursor:crosshair;"></div>
          <div id="${uidIfc2}-pick" style="font-size:11px;color:#aaa;margin-top:3px;min-height:16px;">Click en un elemento para seleccionar</div>
          <div id="${uidIfc2}-views" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
        </div>`);
        break;
      }
      case "directive": {
        // Detect @{pagebreak} → insert page break marker
        if (/^@\{pagebreak/i.test(srcLine)) {
          html.push(`<!--PAGEBREAK-->`);
        }
        // Apply/reset config delimiters for rendering
        const disp = r.display || "";
        if (disp === "config:end") {
          evaluator.eqDelimiter = "";
          evaluator.textDelimiter = "";
        } else if (disp.startsWith("config:")) {
          const cfgBody = disp.slice(7); // after "config:"
          const eqM = cfgBody.match(/eq=(.)/);
          if (eqM) evaluator.eqDelimiter = eqM[1];
          const txM = cfgBody.match(/text=(.)/);
          if (txM) evaluator.textDelimiter = txM[1];
        }
        break;
      }
    }
  }

  if (inColumns && columnItems.length > 0) {
    html.push(renderColumnsGrid(columnItems, columnCount));
  }

  return html.join("\n");
}

/** Post-render: find draw results and render CAD commands into their canvases */
function renderDrawBlocks(results: LineResult[]): void {
  for (const r of results) {
    if (r.type !== "draw" || !r.drawCommands) continue;
    const uid = `cad-output-${r.lineIndex}`;
    const canvas = document.getElementById(uid) as HTMLCanvasElement | null;
    if (!canvas) continue;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    const w = r.drawWidth || 500;
    const h = r.drawHeight || 400;
    const eng = new CadEngine();
    eng.canvasW = w;
    eng.canvasH = h;

    // Execute all CAD CLI commands
    execCommands(eng, r.drawCommands.join("\n"));

    // Auto zoom-fit
    eng.zoomFit();

    // Render to canvas
    eng.renderToCtx(ctx, w, h);
  }
}

/** Post-render: find draw3d results and create Three.js scenes */
function renderDraw3DBlocks(results: LineResult[]): void {
  for (const r of results) {
    if (r.type !== "draw3d" || !r.drawCommands) continue;
    const uid = `cad3d-output-${r.lineIndex}`;
    const container = document.getElementById(uid);
    if (!container) continue;

    const w = r.drawWidth || 500;
    const h = r.drawHeight || 400;

    // Parse 3D commands
    const { shapes, config } = parseDraw3D(r.drawCommands);

    // Create Three.js scene
    const sc = createScene(container, w, h);
    active3DScenes.push(sc);

    // Apply config
    if (config.bg) sc.scene.background = new THREEColor(config.bg);
    if (config.grid === false) {
      const grid = sc.scene.children.find(c => (c as any).isGridHelper);
      if (grid) sc.scene.remove(grid);
    }
    if (config.camX !== undefined) {
      sc.camera.position.set(config.camX!, config.camY!, config.camZ!);
      sc.camera.lookAt(0, 0, 0);
    }

    // Add shapes
    addShapesToScene(sc.scene, shapes);

    // Render orthographic 2D views if requested
    if (config.views && config.views.length > 0) {
      const viewsDiv = document.createElement("div");
      viewsDiv.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;";
      const vw = Math.min(w, 350);
      const vh = Math.round(vw * 0.75);
      for (const vname of config.views) {
        const canvas = renderOrthoView(sc.scene, vname as OrthoView, vw, vh);
        canvas.style.cssText = "border:1px solid #ccc;border-radius:3px;";
        viewsDiv.appendChild(canvas);
      }
      container.parentElement!.insertBefore(viewsDiv, container.nextSibling);
    }
  }
}

/** Post-render: wire up IFC file inputs to load models into Three.js */
function renderDraw3DIfcBlocks(results: LineResult[]): void {
  for (const r of results) {
    if (r.type !== "draw3difc") continue;
    const uid = `ifc3d-output-${r.lineIndex}`;
    const fileInput = document.getElementById(`${uid}-file`) as HTMLInputElement | null;
    const container = document.getElementById(uid);
    const statusEl = document.getElementById(`${uid}-status`);
    const viewsDiv = document.getElementById(`${uid}-views`);
    if (!fileInput || !container) continue;

    const w = r.drawWidth || 600;
    const h = r.drawHeight || 450;

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (statusEl) statusEl.textContent = `Cargando ${file.name}...`;
      container.innerHTML = "";
      try {
        const buf = await file.arrayBuffer();
        const sc = createScene(container, w, h);
        sc.scene.background = new THREEColor(0x1a1a2e);
        active3DScenes.push(sc);
        const { meshCount, bbox } = await loadIfcToScene(sc.scene, buf);
        fitCameraToBBox(sc.camera, sc.controls, bbox);
        if (statusEl) statusEl.textContent = `${file.name} — ${meshCount} meshes (cargado)`;
        // Vistas ortograficas
        if (viewsDiv) {
          viewsDiv.innerHTML = "";
          const vw = Math.min(w, 300);
          const vh = Math.round(vw * 0.75);
          for (const vname of ["front", "side", "top"] as OrthoView[]) {
            const canvas = renderOrthoView(sc.scene, vname, vw, vh);
            canvas.style.cssText = "border:1px solid #555;border-radius:3px;";
            viewsDiv.appendChild(canvas);
          }
        }
      } catch (err: any) {
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        console.error("IFC load error:", err);
      }
    });
  }
}

/** Post-render: auto-fetch IFC files and load into Three.js scenes */
function renderImportIfcBlocks(results: LineResult[]): void {
  for (const r of results) {
    if (r.type !== "importifc" || !r.ifcFile) continue;
    const uid = `ifc-import-${r.lineIndex}`;
    const container = document.getElementById(uid);
    const statusEl = document.getElementById(`${uid}-status`);
    const viewsDiv = document.getElementById(`${uid}-views`);
    const filtersEl = document.getElementById(`${uid}-filters`);
    if (!container) continue;

    const w = r.drawWidth || 700;
    const h = r.drawHeight || 500;
    const file = r.ifcFile;

    (async () => {
      try {
        const url = file.startsWith("/") || file.startsWith("http") ? file : "/" + file;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} al cargar ${url}`);
        const buf = await resp.arrayBuffer();
        if (statusEl) statusEl.textContent = `Procesando ${file}...`;
        const sc = createScene(container, w, h);
        sc.scene.background = new THREEColor(0x1a1a2e);
        active3DScenes.push(sc);
        const { meshCount, bbox, detailCategories, elementInfo } = await loadIfcToScene(sc.scene, buf);
        fitCameraToBBox(sc.camera, sc.controls, bbox);

        // Conteo detallado por categoria
        const counts = getDetailCounts(detailCategories);
        const parts: string[] = [];
        if (counts.column)   parts.push(`Col:${counts.column}`);
        if (counts.beam)     parts.push(`Vig:${counts.beam}`);
        if (counts.slab)     parts.push(`Los:${counts.slab}`);
        if (counts.footing)  parts.push(`Zap:${counts.footing}`);
        if (counts.rebar)    parts.push(`Ref:${counts.rebar}`);
        if (counts.plate)    parts.push(`Pla:${counts.plate}`);
        if (counts.member)   parts.push(`Mie:${counts.member}`);
        if (counts.fastener) parts.push(`Per:${counts.fastener}`);
        if (counts.wall)     parts.push(`Mur:${counts.wall}`);
        if (counts.opening)  parts.push(`Ven:${counts.opening}`);
        if (counts.other)    parts.push(`Otr:${counts.other}`);
        if (statusEl) statusEl.textContent =
          `${file} — ${meshCount} meshes (${parts.join(" ")})`;

        // Aplicar filtro inicial desde directiva
        const initFilter = r.ifcFilter || "all";
        if (initFilter !== "all") {
          filterIfcByPreset(detailCategories, initFilter);
        }

        // Activar botones de filtro
        if (filtersEl) {
          filtersEl.style.display = "block";
          const buttons = filtersEl.querySelectorAll("button[data-filter]");
          buttons.forEach((b) => {
            const f = (b as HTMLElement).dataset.filter || "all";
            (b as HTMLElement).style.background = f === initFilter ? "#4488ff" : "#2a2a3e";
            (b as HTMLElement).style.color = f === initFilter ? "#fff" : "#ccc";
          });
          const lineIdx = r.lineIndex;
          buttons.forEach((btn) => {
            btn.addEventListener("click", () => {
              const f = (btn as HTMLElement).dataset.filter || "all";
              filterIfcByPreset(detailCategories, f);
              buttons.forEach((b) => {
                (b as HTMLElement).style.background = b === btn ? "#4488ff" : "#2a2a3e";
                (b as HTMLElement).style.color = b === btn ? "#fff" : "#ccc";
              });
              // Actualizar la linea en el textarea (two-way binding)
              const ta = document.getElementById("codeInput") as HTMLTextAreaElement | null;
              if (ta) {
                const lines = ta.value.split("\n");
                if (lineIdx < lines.length) {
                  const filterSuffix = f === "all" ? "" : " " + f;
                  lines[lineIdx] = `@{import:ifc:${file} ${w} ${h}${filterSuffix}}`;
                  ta.value = lines.join("\n");
                }
              }
            });
          });
        }

        if (viewsDiv) {
          const vw = Math.min(w, 300), vh = Math.round(vw * 0.75);
          for (const vname of ["front", "side", "top"] as OrthoView[]) {
            const canvas = renderOrthoView(sc.scene, vname, vw, vh);
            canvas.style.cssText = "border:1px solid #555;border-radius:3px;";
            viewsDiv.appendChild(canvas);
          }
        }

        // Picking: click para seleccionar elementos
        const pickEl = document.getElementById(`${uid}-pick`);
        const lineIdx = r.lineIndex;
        setupIfcPicking(container, sc.camera, sc.scene, elementInfo, (result) => {
          if (!pickEl) return;
          if (!result) {
            pickEl.textContent = "Click en un elemento para seleccionar";
            pickEl.style.color = "#aaa";
            return;
          }
          const info = result.info;
          const label = info
            ? `[${info.typeName}] ${info.name} (ID:${info.expressID}, cat:${info.category})`
            : `ID:${result.expressID} cat:${result.category}`;
          pickEl.innerHTML = `<span style="color:#ff6600;">▸</span> ${label}`;
          pickEl.style.color = "#ddd";

          // Escribir seleccion como comentario en textarea
          const ta = document.getElementById("codeInput") as HTMLTextAreaElement | null;
          if (ta) {
            const lines = ta.value.split("\n");
            // Buscar si ya hay un comentario de seleccion despues del import
            const selComment = `> Sel: ${label}`;
            const nextLine = lineIdx + 1;
            if (nextLine < lines.length && lines[nextLine].startsWith("> Sel:")) {
              lines[nextLine] = selComment;
            } else {
              lines.splice(nextLine, 0, selComment);
            }
            ta.value = lines.join("\n");
          }
        });
      } catch (err: any) {
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        console.error("IFC import error:", err);
      }
    })();
  }
}

/** Renderiza columnas como grid CSS */
function renderColumnsGrid(items: string[], cols: number): string {
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px 24px;margin:0.3em 0;">
    ${items.map(item => `<p class="eq out-line">${item}</p>`).join("\n")}
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// EQUATION RENDERING - Using .eq var, .eq sub, .eq sup, etc.
// ═══════════════════════════════════════════════════════════

/** Renderiza una linea de asignacion: var = expr = valor */
// Source lines stored during renderResults for integral notation lookup
let _renderSourceLines: string[] = [];

/** Build ∫ HTML for integral/integral2/integral3 calls */
function buildIntegralHTML(intName: string, fnName: string, exprText: string): string | null {
  // Find function definition in source: f(x) = expr or f(x,y) = expr
  const fnDefRe = new RegExp(`^${fnName}\\(([^)]+)\\)\\s*=\\s*(.+)$`);
  let params: string[] = [];
  let bodyText = "";
  for (const line of _renderSourceLines) {
    const stripped = line.trim().replace(/\/\/.*$/, "").trim();
    const m = stripped.match(fnDefRe);
    if (m) {
      params = m[1].split(",").map(s => s.trim());
      bodyText = m[2].trim();
      break;
    }
  }
  if (!bodyText) return null;

  // Parse bounds from exprText: integral(f, a, b) or integral2(f, xa, xb, ya, yb) etc.
  // Remove "integralN(fnName," prefix and trailing ")"
  const argsStr = exprText.replace(/^integral[23]?\s*\(\s*\w+\s*,\s*/, "").replace(/\)\s*$/, "");
  const bounds = splitArgs(argsStr);

  const bodyHtml = renderMathExpr(bodyText);

  // Helper: build one ∫ symbol with limits
  const intSym = (lo: string, hi: string) =>
    `<span class="dvr"><small>${renderMathExpr(hi)}</small><span class="nary"><em>∫</em></span><small>${renderMathExpr(lo)}</small></span>`;

  if (intName === "integral" && bounds.length >= 2) {
    const dv = params[0] || "x";
    return `${intSym(bounds[0], bounds[1])} (${bodyHtml}) <i>d${dv}</i>`;
  }
  if (intName === "integral2" && bounds.length >= 4) {
    const dx = params[0] || "x", dy = params[1] || "y";
    return `${intSym(bounds[0], bounds[1])} ${intSym(bounds[2], bounds[3])} (${bodyHtml}) <i>d${dy}</i> <i>d${dx}</i>`;
  }
  if (intName === "integral3" && bounds.length >= 6) {
    const dx = params[0] || "x", dy = params[1] || "y", dz = params[2] || "z";
    return `${intSym(bounds[0], bounds[1])} ${intSym(bounds[2], bounds[3])} ${intSym(bounds[4], bounds[5])} (${bodyHtml}) <i>d${dz}</i> <i>d${dy}</i> <i>d${dx}</i>`;
  }
  return null;
}

/** Split function arguments respecting parentheses */
function splitArgs(s: string): string[] {
  const args: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= s.length; i++) {
    if (i === s.length || (s[i] === "," && depth === 0)) {
      args.push(s.slice(start, i).trim());
      start = i + 1;
    } else if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
  }
  return args;
}

function renderLineEq(r: LineResult, srcLine: string): string {
  const varName = r.varName ?? "";
  const value = r.value;

  // Extraer la expresion original del source
  const assignMatch = srcLine.match(/^([a-zA-Z_][\w]*(?:\([^)]*\))?)\s*=\s*(.+)$/);
  const exprText = assignMatch ? assignMatch[2].trim() : "";

  // Nombre de variable con <var> y subindices
  const nameHTML = renderVarName(varName);

  // ─── hideExpr: ocultar expresion/funcion, mostrar solo var = resultado ───
  if (r.hideExpr && value !== undefined && typeof value !== "function") {
    if (evaluator.isMatrix(value)) {
      return `${nameHTML} = ${renderMatrixHTML(value)}`;
    }
    if (evaluator.isCellArray(value)) {
      return `${nameHTML} = ${renderCellArrayHTML(value, varName)}`;
    }
    return `${nameHTML} = ${renderValueSpan(value)}`;
  }

  // ─── Render lusolve equation: {F} = [K]{u} ───
  if (r.lsolveData) {
    return renderLsolveEquation(r.lsolveData, varName);
  }

  // ─── Render integral() calls with ∫ notation ───
  if (typeof value === "number" && exprText) {
    const intMatch = exprText.match(/^(integral[23]?)\s*\(\s*(\w+)\s*,/);
    if (intMatch) {
      const intHtml = buildIntegralHTML(intMatch[1], intMatch[2], exprText);
      if (intHtml) {
        const valueHTML = renderValueSpan(value);
        return `${nameHTML} = ${intHtml} = ${valueHTML}`;
      }
    }
  }

  // Si es una funcion definida, solo mostrar la definicion
  if (typeof value === "function" || value === undefined) {
    if (exprText) {
      return `${nameHTML} = ${renderMathExpr(exprText)}`;
    }
    return nameHTML;
  }

  const scope = evaluator.getScope();

  // Si es un cell array, mostrar con formato especial
  if (evaluator.isCellArray(value)) {
    return `${nameHTML} = ${renderCellArrayHTML(value, varName)}`;
  }

  // Si es una matriz, mostrar nombre = expr simbolica = matriz numerica
  if (evaluator.isMatrix(value)) {
    if (exprText && /[a-zA-Z]/.test(exprText)) {
      const substituted = substituteValues(exprText, scope);
      // Solo mostrar sustitucion si difiere del resultado numerico
      const matHTML = renderMatrixHTML(value);
      if (substituted) {
        const substHTML = renderMathExpr(substituted);
        if (substHTML !== matHTML) {
          return `${nameHTML} = ${renderMathExpr(exprText)} = ${substHTML} = ${matHTML}`;
        }
      }
      return `${nameHTML} = ${renderMathExpr(exprText)} = ${matHTML}`;
    }
    return `${nameHTML} = ${renderMatrixHTML(value)}`;
  }

  // Renderizar valor
  const valueHTML = renderValueSpan(value);

  // Si la expresion es simple (solo un numero o variable), solo var = valor
  if (!exprText || exprText === String(value) || /^[\d.]+$/.test(exprText)) {
    return `${nameHTML} = ${valueHTML}`;
  }

  // Procedimiento: nombre = expr simbolica = expr con valores = resultado
  if (chkSubstitute?.checked !== false) {
    const substituted = substituteValues(exprText, scope);
    if (substituted && substituted !== fmtNum(value)) {
      return `${nameHTML} = ${renderMathExpr(exprText)} = ${renderMathExpr(substituted)} = ${valueHTML}`;
    }
  }
  return `${nameHTML} = ${renderMathExpr(exprText)} = ${valueHTML}`;
}

/** Renderiza una expresion pura (sin asignacion) */
function renderExprResult(r: LineResult): string {
  return renderValueSpan(r.value);
}

/** Renderiza con display hint row/col */
function renderDisplayHint(r: LineResult): string {
  const val = r.value;
  const nameHTML = r.varName ? renderVarName(r.varName) + " = " : "";
  if (r.displayHint === "row") {
    return nameHTML + renderRowValue(val);
  }
  if (r.displayHint === "col") {
    return nameHTML + renderColumnVector(val);
  }
  return nameHTML + renderValueSpan(val);
}

/** Renderiza valor en una sola linea horizontal [a b c ...] */
function renderRowValue(val: any): string {
  if (val === undefined || val === null) return "";
  let arr: any[] | null = null;
  if (evaluator.isMatrix(val)) arr = val.toArray();
  else if (Array.isArray(val)) arr = val;
  if (!arr) return fmtNum(val);
  // Flatten: [[1],[2],[3]] → [1,2,3] or [[1,2],[3,4]] → "1 2 ; 3 4"
  if (Array.isArray(arr[0])) {
    const rows = arr as any[][];
    if (rows[0].length === 1) {
      // Column vector Nx1 → flat horizontal
      return `[${rows.map(r => fmtNum(r[0])).join("&ensp;")}]`;
    }
    // Matrix: rows separated by ;
    return `[${rows.map(row => row.map(fmtNum).join("&ensp;")).join(";&ensp;")}]`;
  }
  return `[${arr.map(fmtNum).join("&ensp;")}]`;
}

/** Renderiza @{plot} block como SVG con heatmap/mesh/colorbar */
function renderPlotBlock(r: LineResult): string {
  if (!r.plotCommands || r.plotCommands.length === 0) return "";
  const scope = evaluator.getScope();

  let xRange: number[] | null = null;
  let yRange: number[] | null = null;
  let heatmapVar: string | null = null;
  let showMesh = false;
  let colorbarLabel = "";
  let titleText = "";
  let titleX = 0;
  let titleY = 0;

  for (const line of r.plotCommands) {
    const t = line.trim();
    if (!t || t.startsWith("//")) continue;

    // x = 0 : 6
    const xMatch = t.match(/^x\s*=\s*(.+?)\s*:\s*(.+)$/);
    if (xMatch) {
      const a = Number(math.evaluate(xMatch[1], scope));
      const b = Number(math.evaluate(xMatch[2], scope));
      const n = Math.round(b - a);
      xRange = [];
      for (let i = 0; i <= n; i++) xRange.push(a + i);
      continue;
    }
    // y = 0 : 4
    const yMatch = t.match(/^y\s*=\s*(.+?)\s*:\s*(.+)$/);
    if (yMatch) {
      const a = Number(math.evaluate(yMatch[1], scope));
      const b = Number(math.evaluate(yMatch[2], scope));
      const n = Math.round(b - a);
      yRange = [];
      for (let i = 0; i <= n; i++) yRange.push(a + i);
      continue;
    }
    // heatmap VARNAME
    const heatMatch = t.match(/^heatmap\s+(\w+)/i);
    if (heatMatch) { heatmapVar = heatMatch[1]; continue; }
    // mesh
    if (/^mesh\s*$/i.test(t)) { showMesh = true; continue; }
    // colorbar "label"
    const cbMatch = t.match(/^colorbar\s+"([^"]+)"/i);
    if (cbMatch) { colorbarLabel = cbMatch[1]; continue; }
    // text X Y "label"
    const txtMatch = t.match(/^text\s+([\d.]+)\s+([\d.-]+)\s+"([^"]+)"/i);
    if (txtMatch) { titleX = parseFloat(txtMatch[1]); titleY = parseFloat(txtMatch[2]); titleText = txtMatch[3]; continue; }
  }

  if (!heatmapVar || !xRange || !yRange) return `<div class="out-error">Plot: missing heatmap variable or x/y range</div>`;

  // Get matrix from scope
  const matVal = scope[heatmapVar];
  if (!matVal) return `<div class="out-error">Plot: variable '${heatmapVar}' not found</div>`;
  let data: number[][];
  if (matVal.toArray) data = matVal.toArray();
  else if (Array.isArray(matVal)) data = matVal;
  else return `<div class="out-error">Plot: '${heatmapVar}' is not a matrix</div>`;

  const nRows = data.length;
  const nCols = Array.isArray(data[0]) ? data[0].length : 1;

  // Find min/max
  let vmin = Infinity, vmax = -Infinity;
  for (const row of data) {
    if (Array.isArray(row)) {
      for (const v of row) { if (v < vmin) vmin = v; if (v > vmax) vmax = v; }
    } else {
      if ((row as any) < vmin) vmin = row as any; if ((row as any) > vmax) vmax = row as any;
    }
  }

  // SVG dimensions
  const margin = { top: 30, right: 80, bottom: 50, left: 50 };
  const plotW = 420, plotH = 280;
  const svgW = plotW + margin.left + margin.right;
  const svgH = plotH + margin.top + margin.bottom;

  const xMin = xRange[0], xMax = xRange[xRange.length - 1];
  const yMin = yRange[0], yMax = yRange[yRange.length - 1];
  const cellW = plotW / nCols;
  const cellH = plotH / nRows;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="font-family:sans-serif;font-size:11px;display:block;margin:8px 0;">`;
  svg += `<rect width="${svgW}" height="${svgH}" fill="#fff"/>`;

  // Heatmap cells
  for (let ri = 0; ri < nRows; ri++) {
    for (let ci = 0; ci < nCols; ci++) {
      const v = Array.isArray(data[ri]) ? data[ri][ci] : data[ri];
      const t = vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5;
      const color = heatColor(t);
      const x = margin.left + ci * cellW;
      const y = margin.top + ri * cellH;
      svg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${color}" stroke="${showMesh ? '#666' : 'none'}" stroke-width="${showMesh ? 0.5 : 0}"/>`;
    }
  }

  // Mesh overlay: node grid
  if (showMesh) {
    // Vertical lines
    for (let ci = 0; ci <= nCols; ci++) {
      const x = margin.left + ci * cellW;
      svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}" stroke="#999" stroke-width="0.3"/>`;
    }
    // Horizontal lines
    for (let ri = 0; ri <= nRows; ri++) {
      const y = margin.top + ri * cellH;
      svg += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#999" stroke-width="0.3"/>`;
    }
  }

  // X axis labels
  for (let ci = 0; ci <= nCols; ci++) {
    const x = margin.left + ci * cellW;
    const val = xMin + (xMax - xMin) * ci / nCols;
    svg += `<text x="${x}" y="${margin.top + plotH + 16}" text-anchor="middle" fill="#333">${val.toFixed(1)}</text>`;
  }
  // Y axis labels
  for (let ri = 0; ri <= nRows; ri++) {
    const y = margin.top + ri * cellH;
    const val = yMin + (yMax - yMin) * ri / nRows;
    svg += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" fill="#333">${val.toFixed(1)}</text>`;
  }

  // Colorbar
  if (colorbarLabel) {
    const cbX = margin.left + plotW + 12;
    const cbW = 14, cbH = plotH;
    const nSteps = 50;
    for (let s = 0; s < nSteps; s++) {
      const t = 1 - s / nSteps;
      const cy = margin.top + s * (cbH / nSteps);
      svg += `<rect x="${cbX}" y="${cy}" width="${cbW}" height="${cbH / nSteps + 0.5}" fill="${heatColor(t)}"/>`;
    }
    svg += `<rect x="${cbX}" y="${margin.top}" width="${cbW}" height="${cbH}" fill="none" stroke="#666" stroke-width="0.5"/>`;
    svg += `<text x="${cbX + cbW + 4}" y="${margin.top + 4}" fill="#333" font-size="10">${fmtNum(vmax)}</text>`;
    svg += `<text x="${cbX + cbW + 4}" y="${margin.top + cbH}" fill="#333" font-size="10">${fmtNum(vmin)}</text>`;
    svg += `<text x="${cbX + cbW / 2}" y="${margin.top - 8}" text-anchor="middle" fill="#333" font-size="10">${escHtml(colorbarLabel)}</text>`;
  }

  // Title
  if (titleText) {
    const tx = margin.left + plotW / 2;
    const ty = margin.top + plotH + 38;
    svg += `<text x="${tx}" y="${ty}" text-anchor="middle" fill="#333" font-size="12" font-weight="bold">${escHtml(titleText)}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

/** Heatmap color scale: blue → cyan → green → yellow → red */
function heatColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 0; g = Math.round(255 * s); b = 255;
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = 0; g = 255; b = Math.round(255 * (1 - s));
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(255 * s); g = 255; b = 0;
  } else {
    const s = (t - 0.75) / 0.25;
    r = 255; g = Math.round(255 * (1 - s)); b = 0;
  }
  return `rgb(${r},${g},${b})`;
}

/** Renderiza celdas @{cells} */
function renderCells(r: LineResult): string {
  if (!r.cells || r.cells.length === 0) return "";
  const scope = evaluator.getScope();
  const cellsHTML = r.cells.map(c => {
    const nameHTML = c.varName ? renderVarName(c.varName) : "";
    const valueHTML = renderValueSpan(c.value);
    const exprHTML = c.expr ? renderMathExpr(c.expr) : "";

    if (c.varName) {
      if (!c.expr || c.expr === String(c.value) || /^[\d.]+$/.test(c.expr)) {
        return `<span class="eq">${nameHTML} = ${valueHTML}</span>`;
      }
      // Procedimiento: nombre = simbolico = con valores = resultado
      if (chkSubstitute?.checked !== false) {
        const substituted = substituteValues(c.expr, scope);
        if (substituted && substituted !== fmtNum(c.value)) {
          return `<span class="eq">${nameHTML} = ${exprHTML} = ${renderMathExpr(substituted)} = ${valueHTML}</span>`;
        }
      }
      return `<span class="eq">${nameHTML} = ${exprHTML} = ${valueHTML}</span>`;
    }
    return `<span class="eq">${valueHTML}</span>`;
  });
  return `<div class="out-cells">${cellsHTML.join("")}</div>`;
}

// ═══════════════════════════════════════════════════════════
// SUBSTITUCION DE VALORES (procedimiento)
// ═══════════════════════════════════════════════════════════

/** Palabras reservadas de math.js que NO son variables */
const MATH_KEYWORDS = new Set([
  'sqrt', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan', 'atan2', 'log', 'ln', 'exp', 'abs',
  'det', 'inv', 'norm', 'dot', 'cross', 'transpose',
  'multiply', 'lusolve', 'add', 'subset', 'index', 'range',
  'matrix', 'col', 'row', 'pi', 'e', 'inf', 'true', 'false',
  'ceil', 'floor', 'round', 'sign', 'mod', 'min', 'max',
  'sum', 'prod', 'mean', 'trace', 'diag', 'zeros', 'ones', 'eye',
  'size', 'length', 'concat', 'flatten', 'reshape', 'sort',
]);

/**
 * Sustituye nombres de variables por sus valores numericos en una expresion.
 * Retorna null si no se sustituyo nada.
 */
function substituteValues(expr: string, scope: Record<string, any>): string | null {
  // Obtener variables escalares del scope, ordenadas por longitud (mas larga primero)
  const varNames = Object.keys(scope)
    .filter(v => !MATH_KEYWORDS.has(v) && typeof scope[v] === 'number')
    .sort((a, b) => b.length - a.length);

  let result = expr;
  let anyReplaced = false;

  for (const varName of varNames) {
    const value = scope[varName] as number;
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    const before = result;
    const numStr = fmtNum(value);
    // Parentizar negativos para evitar ambiguedad: a*-3 -> a*(-3)
    const replacement = value < 0 ? `(${numStr})` : numStr;
    result = result.replace(regex, replacement);
    if (result !== before) anyReplaced = true;
  }

  return anyReplaced ? result : null;
}

// ═══════════════════════════════════════════════════════════
// GREEK LETTERS
// ═══════════════════════════════════════════════════════════

const GREEK: Record<string, string> = {
  alpha: "\u03B1", beta: "\u03B2", gamma: "\u03B3", delta: "\u03B4",
  epsilon: "\u03B5", zeta: "\u03B6", eta: "\u03B7", theta: "\u03B8",
  iota: "\u03B9", kappa: "\u03BA", lambda: "\u03BB", mu: "\u03BC",
  nu: "\u03BD", xi: "\u03BE", omicron: "\u03BF", pi: "\u03C0",
  rho: "\u03C1", sigma: "\u03C3", tau: "\u03C4", upsilon: "\u03C5",
  phi: "\u03C6", chi: "\u03C7", psi: "\u03C8", omega: "\u03C9",
  Alpha: "\u0391", Beta: "\u0392", Gamma: "\u0393", Delta: "\u0394",
  Epsilon: "\u0395", Zeta: "\u0396", Eta: "\u0397", Theta: "\u0398",
  Iota: "\u0399", Kappa: "\u039A", Lambda: "\u039B", Mu: "\u039C",
  Nu: "\u039D", Xi: "\u039E", Omicron: "\u039F", Pi: "\u03A0",
  Rho: "\u03A1", Sigma: "\u03A3", Tau: "\u03A4", Upsilon: "\u03A5",
  Phi: "\u03A6", Chi: "\u03A7", Psi: "\u03A8", Omega: "\u03A9",
};

/** Convierte nombre griego a su caracter Unicode */
function greekify(s: string): string {
  return GREEK[s] ?? s;
}

// ═══════════════════════════════════════════════════════════
// VARIABLE NAMES - <var> with <sub> for subscripts
// ═══════════════════════════════════════════════════════════

/** Renderiza nombre de variable: alpha_2 -> <var>α</var><sub>2</sub> */
function renderVarName(name: string): string {
  if (!name) return "";
  const parts = name.split("_");
  const base = greekify(parts[0]);
  if (parts.length === 1) {
    return `<var>${escHtml(base)}</var>`;
  }
  const sub = parts.slice(1).map(p => greekify(p)).join("_");
  return `<var>${escHtml(base)}</var><sub>${escHtml(sub)}</sub>`;
}

// ═══════════════════════════════════════════════════════════
// MATH EXPRESSION RENDERING
// ═══════════════════════════════════════════════════════════

/** Renderiza una expresion de matriz simbolica [[a],[b],[c]] como tabla vertical */
function renderSymbolicMatrix(expr: string): string | null {
  const t = expr.trim();
  if (!t.startsWith('[[') || !t.endsWith(']]')) return null;

  // Parsear filas respetando profundidad de brackets
  const inner = t.slice(1, -1); // quitar [ ] externo
  const rows: string[] = [];
  let depth = 0, current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    current += ch;
    if (depth === 0 && current.trim()) {
      const row = current.trim();
      if (row.startsWith('[') && row.endsWith(']')) {
        rows.push(row.slice(1, -1).trim());
      }
      current = '';
      // saltar coma despues de ]
      if (i + 1 < inner.length && inner[i + 1] === ',') i++;
    }
  }
  if (rows.length === 0) return null;

  // Detectar si es vector columna (1 elemento por fila) o matriz
  const isCol = rows.every(r => !r.includes(','));
  const cols = isCol ? 1 : (rows[0].split(',').length);

  let html = `<span class="matrix" style="--mat-cols:${cols}">`;
  for (const row of rows) {
    html += `<span class="tr"><span class="td"></span>`;
    if (isCol) {
      html += `<span class="td">${renderMathExpr(row)}</span>`;
    } else {
      for (const cell of row.split(',')) {
        html += `<span class="td">${renderMathExpr(cell.trim())}</span>`;
      }
    }
    html += `<span class="td"></span></span>`;
  }
  html += `</span>`;
  return html;
}

/** Renderiza una expresion matematica con formato visual */
function renderMathExpr(expr: string): string {
  // Detectar matrices [[...],[...]] y renderizar como tabla vertical
  const matHTML = renderSymbolicMatrix(expr);
  if (matHTML) return matHTML;

  let result = expr;

  // 0. Cell array / matrix bracket notation:
  //    k~{1} → [k̄]₁  (overbar + brackets + subscript)
  //    k{1}  → [k]₁   (brackets + subscript)
  //    K~{R} → [K̄]ᵣ   (overbar + brackets + subscript)
  //    K{R}  → [K]ᵣ   (brackets + subscript)
  result = result.replace(/\b([a-zA-Z]\w*)~\{(\w+)\}/g, (_, name, idx) => {
    return `[<var>${greekify(name)}</var>\u0304]<sub>${greekify(idx)}</sub>`;
  });
  result = result.replace(/\b([a-zA-Z]\w*)\{(\w+)\}/g, (_, name, idx) => {
    return `[<var>${greekify(name)}</var>]<sub>${greekify(idx)}</sub>`;
  });

  // 0b. Array indexing: v[n] → v_[n] with faded brackets (distinct from v_n plain subscript)
  //     K[i,j] → K_[i,j]   Ke[1,1] → Ke_[1,1]
  result = result.replace(/\b([a-zA-Z_]\w*)\[([^\]]+)\]/g, (_, name: string, idx: string) => {
    const idxParts = idx.split(',').map((p: string) => `<i>${greekify(p.trim())}</i>`).join(',');
    return `<var>${greekify(name)}</var><sub><span class="idx-br">[</span>${idxParts}<span class="idx-br">]</span></sub>`;
  });

  // 1. sqrt(expr) -> radical con clase .r0 + .o0 (SVG)
  result = result.replace(/sqrt\(([^)]+)\)/g, (_, inner) => {
    return `<span class="radical-wrap"><span class="r0"></span><span class="o0">${renderMathExpr(inner)}</span></span>`;
  });

  // 2. Fracciones -> .dvc / .dvl
  // 2a. (expr)/(expr) -> fraccion con ambos en parentesis
  result = result.replace(/\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g, (_, num, den) => {
    return `<span class="dvc"><span class="dvl">${renderMathExpr(num)}</span><span>${renderMathExpr(den)}</span></span>`;
  });
  // 2b. expr/(expr) -> fraccion cuando solo denominador en parentesis (e.g. P*L^3/(48*E*I))
  result = result.replace(/^(.+)\/\(([^)]+)\)$/, (_, num, den) => {
    return `<span class="dvc"><span class="dvl">${renderMathExpr(num)}</span><span>${renderMathExpr(den)}</span></span>`;
  });
  // 2c. (expr)/token -> fraccion con numerador en parentesis, denominador simple (e.g. (11600*5.08)/100)
  result = result.replace(/\(([^)]+)\)\s*\/\s*([a-zA-Z_]\w*|\d+(?:\.\d+)?)/g, (_, num, den) => {
    return `<span class="dvc"><span class="dvl">${renderMathExpr(num)}</span><span>${renderMathExpr(den)}</span></span>`;
  });
  // 2d. expr/token -> fraccion general (e.g. G_s*J_t/L, 4*E*I/L)
  result = result.replace(/^(.+)\/([a-zA-Z_]\w*|\d+(?:\.\d+)?)$/, (_, num, den) => {
    return `<span class="dvc"><span class="dvl">${renderMathExpr(num)}</span><span>${renderMathExpr(den)}</span></span>`;
  });

  // 3. Funciones conocidas: sin, cos, etc -> <i>func</i>
  result = result.replace(/\b(sin|cos|tan|cot|sec|csc|asin|acos|atan|log|ln|exp|sqrt|abs|det|inv|norm|dot|cross|transpose|multiply|lusolve|add|subset|index|range|matrix)\b/g,
    '<i>$1</i>');

  // 4. Greek letter words -> Unicode (before splitting into single chars)
  result = result.replace(/\b(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|rho|sigma|tau|upsilon|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega)\b/g,
    (m) => `<var>${greekify(m)}</var>`);

  // 5. Variables con subindice: a_xyz -> <var>a</var><sub>xyz</sub>
  result = result.replace(/\b([a-zA-Z])_(\w+)\b/g, (_, base, sub) => {
    return `<var>${greekify(base)}</var><sub>${greekify(sub)}</sub>`;
  });

  // 6. Variables simples (letras solas que no son parte de tags HTML) -> <var>
  //    Lookbehind: skip letters preceded by < or / (inside <i>, </i> tags)
  //    Lookahead:  skip letters followed by >, (, <, / (closing tag or function call)
  result = result.replace(/(?<![<\/])\b([a-zA-Z])\b(?![>(<\/])/g, '<var>$1</var>');

  // 6. Smart multiplication rendering:
  // 6a. number * <var> → implicit juxtaposition (no dot): 2c, -2c, 12c
  result = result.replace(/(\d+(?:\.\d+)?)\s*\*\s*(<var>)/g, '$1$2');
  // 6b. </var|sub|sup> * <var> → implicit (variable × variable): EI, E_s·I_z
  result = result.replace(/(<\/(?:var|sub|sup)>)\s*\*\s*(<var>)/g, '$1$2');
  // 6c. number * number → parenthesized product: (2·306.936)
  //     negative lookahead: NOT when second number is followed by ^, digit, or dot
  //     (avoids breaking 0.1*100^2 → (0.1·100)^2 which changes meaning)
  result = result.replace(/(-?\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)(?![0-9.^])/g, '($1\u00B7$2)');
  // 6d. remaining * → ·
  result = result.replace(/\*/g, '\u00B7');

  // 7. ^N -> <sup>N</sup>  (AFTER variables para que <var>a</var>^2 funcione)
  result = result.replace(/\^(\d+)/g, '<sup>$1</sup>');
  result = result.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');

  return result;
}

/** Renderiza texto de comentario con formato math (subscripts, superscripts, griego) */
function renderCommentMath(text: string): string {
  // --- Text delimiter: "..." becomes literal (no Greek, no subscripts, etc.) ---
  const tDelim = evaluator.textDelimiter;
  if (tDelim && text.includes(tDelim)) {
    const tEsc = tDelim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tRe = new RegExp(`(${tEsc}[^${tEsc}]*${tEsc})`, "g");
    const tParts = text.split(tRe);
    return tParts.map(part => {
      if (part.startsWith(tDelim) && part.endsWith(tDelim) && part.length >= 2) {
        // Literal text — just escape HTML, no processing
        const inner = part.slice(tDelim.length, -tDelim.length);
        return escHtml(inner);
      }
      return renderCommentMathInner(part);
    }).join("");
  }
  return renderCommentMathInner(text);
}

/** Procesa inline @{eq} y $...$ despues de extraer texto literal */
function renderCommentMathInner(text: string): string {
  // Inline @{eq}...@{end eq} mixed with text on the same line
  if (text.includes("@{eq}") && text.includes("@{end")) {
    const parts = text.split(/(@\{eq\}.*?@\{end\s+eq\})/gi);
    return parts.map(part => {
      const m = part.match(/^@\{eq\}(.*?)@\{end\s+eq\}$/i);
      if (m) {
        return `<span class="inline-eq">${renderEquationText(m[1].trim())}</span>`;
      }
      return renderCommentMathPlain(part);
    }).join("");
  }
  // $...$ inline equations (when eq delimiter is configured)
  const delim = evaluator.eqDelimiter;
  if (delim && text.includes(delim)) {
    const escaped = delim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped}[^${escaped}]+${escaped})`, "g");
    const parts = text.split(re);
    return parts.map(part => {
      if (part.startsWith(delim) && part.endsWith(delim) && part.length > 2) {
        const eq = part.slice(delim.length, -delim.length).trim();
        return `<span class="inline-eq">${renderEquationText(eq)}</span>`;
      }
      return renderCommentMathPlain(part);
    }).join("");
  }
  return renderCommentMathPlain(text);
}

/** Procesamiento basico de texto comentario (sin inline @{eq}) */
function renderCommentMathPlain(text: string): string {
  let result = escHtml(text);

  // Cell/matrix bracket notation in comments:
  //   k~{1} → [k̄]₁,  k{1} → [k]₁
  result = result.replace(/\b([a-zA-Z]\w*)~\{(\w+)\}/g, (_, name, idx) => {
    return `[${greekify(name)}\u0304]<sub>${greekify(idx)}</sub>`;
  });
  result = result.replace(/\b([a-zA-Z]\w*)\{(\w+)\}/g, (_, name, idx) => {
    return `[${greekify(name)}]<sub>${greekify(idx)}</sub>`;
  });

  // Greek letter words -> Unicode
  result = result.replace(/\b(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|rho|sigma|tau|upsilon|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega)\b/g,
    (m) => greekify(m));

  // Variables con subindice: X_abc -> X<sub>abc</sub>
  result = result.replace(/([a-zA-Z\u0370-\u03FF])_(\w+)/g, (_, base, sub) => {
    return `${base}<sub>${greekify(sub)}</sub>`;
  });

  // Superscripts: ^2, ^{n+1}
  result = result.replace(/\^(\d+)/g, '<sup>$1</sup>');
  result = result.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');

  // * -> · (middle dot)
  result = result.replace(/\*/g, '\u00B7');

  return result;
}

// ═══════════════════════════════════════════════════════════
// VALUE RENDERING
// ═══════════════════════════════════════════════════════════

/** Renderiza un valor numerico/escalar como span */
function renderValueSpan(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "function") return "";

  if (evaluator.isMatrix(value)) {
    return renderMatrixHTML(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(v => renderValueSpan(v)).join(", ")}]`;
  }

  if (typeof value === "number") {
    return fmtNum(value);
  }

  return escHtml(String(value));
}

/** Renderiza un cell array: V = { V₁ = [mat], V₂ = [mat], ... } */
function renderCellArrayHTML(value: any, varName?: string): string {
  if (!value || !(value as any).__cell) return renderValueSpan(value);
  const elems = (value as any).elements as any[];
  const parts = elems.map((e: any, i: number) => {
    const label = varName
      ? `<span class="cell-label">${renderVarName(varName + "_" + (i + 1))}</span> = `
      : "";
    const valHTML = evaluator.isMatrix(e) ? renderMatrixHTML(e) : renderValueSpan(e);
    return `<span class="cell-element">${label}${valHTML}</span>`;
  });
  return `<span class="cell-array"><span class="cell-brace">{</span>${parts.join('<span class="cell-sep">,</span>')}<span class="cell-brace">}</span></span>`;
}

/** Renderiza una matriz math.js usando clases .matrix .tr .td de template.html */
function renderMatrixHTML(m: any): string {
  const arr = m.toArray() as any[];

  // Vector 1D: [a, b, c]
  if (!Array.isArray(arr[0])) {
    return `[${(arr as number[]).map(v => fmtNum(v)).join(", ")}]`;
  }

  const rows = arr as any[][];
  const cols = rows[0]?.length ?? 1;

  let html = `<span class="matrix" style="--mat-cols:${cols}">`;
  for (const row of rows) {
    html += `<span class="tr">`;
    html += `<span class="td"></span>`;
    for (const v of row) {
      html += `<span class="td">${fmtNum(v)}</span>`;
    }
    html += `<span class="td"></span>`;
    html += `</span>`;
  }
  html += `</span>`;
  return html;
}

/** Renderiza un vector como columna (siempre vertical) */
function renderColumnVector(v: any): string {
  if (!v || !v.toArray) return renderValueSpan(v);
  const arr = v.toArray() as any[];
  // Si es 2D (Nx1 o NxM), usar renderMatrixHTML directamente
  if (Array.isArray(arr[0])) return renderMatrixHTML(v);
  // 1D: forzar columna vertical
  const n = arr.length;
  let html = `<span class="matrix" style="--mat-cols:1">`;
  for (const val of arr) {
    html += `<span class="tr"><span class="td"></span><span class="td">${fmtNum(val)}</span><span class="td"></span></span>`;
  }
  html += `</span>`;
  return html;
}

/** Renderiza ecuacion matricial {F} = [K]{u} para lusolve */
function renderLsolveEquation(data: { K: any; F: any; Z: any }, varName: string): string {
  const kArr = data.K.toArray ? data.K.toArray() : data.K;
  const n = Array.isArray(kArr) ? kArr.length : 0;
  const nameHTML = renderVarName(varName);
  // Limite de tamano: solo mostrar ecuacion completa para sistemas pequenos
  if (n > 12 || n === 0) {
    return `${nameHTML} = ${renderColumnVector(data.Z)}`;
  }
  // Vector simbolico de incognitas: {u₁, u₂, u₃, ...}
  let symHTML = `<span class="lsolve-sym-vec">`;
  for (let i = 0; i < n; i++) {
    symHTML += `<span class="tr"><span class="td"></span><span class="td">${renderVarName(varName)}<sub>${i + 1}</sub></span><span class="td"></span></span>`;
  }
  symHTML += `</span>`;
  const fHTML = renderColumnVector(data.F);
  const kHTML = renderMatrixHTML(data.K);
  const zHTML = renderColumnVector(data.Z);
  // Ecuacion: {F} = [K] · {var} → var = [Z]
  return `<span class="lsolve-eq-wrap">${fHTML}<span class="lsolve-sign">=</span>${kHTML}<span class="lsolve-sign">&middot;</span>${symHTML}</span><br>${nameHTML} = ${zHTML}`;
}

/** Formatea un numero */
function fmtNum(v: any): string {
  if (typeof v === "number") {
    const dec = parseInt(decimalsInput?.value ?? "2", 10);
    const zeroSmall = chkZeroSmall?.checked ?? true;
    if (zeroSmall && Math.abs(v) < 1e-12) return "0";
    if (Number.isInteger(v)) return String(v);
    if (Math.abs(v) < 0.001 || Math.abs(v) > 1e6) return v.toPrecision(Math.max(dec, 2));
    return v.toFixed(dec);
  }
  return escHtml(String(v));
}

// (Duplicate fontSize zoom handler removed — zoom is synced from MathCanvas)

// ─── Splitter drag to resize ─────────────────────────────
const splitter = document.getElementById("splitter") as HTMLDivElement;
const editorPanel = document.querySelector(".editor-panel") as HTMLDivElement;

splitter.addEventListener("mousedown", (e) => {
  e.preventDefault();
  splitter.classList.add("dragging");
  const parent = splitter.parentElement!;

  let rafId = 0;
  const onMove = (ev: MouseEvent) => {
    const rect = parent.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const pct = Math.max(15, Math.min(85, (x / rect.width) * 100));
    editorPanel.style.flexBasis = `${pct}%`;
    // Wait for DOM reflow before re-rendering
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      editor.resize();
      syncZoom();
    });
  };

  const onUp = () => {
    splitter.classList.remove("dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    cancelAnimationFrame(rafId);
    // Final re-render after drag ends (DOM already reflowed)
    requestAnimationFrame(() => {
      editor.resize();
      syncZoom();
    });
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

// ─── Custom Scrollbar for Output Panel ────────────────────
(() => {
  const scrollContent = output;  // .output-content
  const scrollbar = document.getElementById("customScrollbar") as HTMLDivElement;
  const thumb = document.getElementById("scrollThumb") as HTMLDivElement;
  const btnUp = document.getElementById("scrollUp") as HTMLDivElement;
  const btnDown = document.getElementById("scrollDown") as HTMLDivElement;
  if (!scrollbar || !thumb || !btnUp || !btnDown) return;

  const BTN_H = 18;  // height of up/down buttons

  function updateThumb() {
    const { scrollHeight, clientHeight, scrollTop } = scrollContent;
    if (scrollHeight <= clientHeight) {
      scrollbar.style.display = "none";
      return;
    }
    scrollbar.style.display = "";
    // Position scrollbar to start below output-header
    const outputHeader = scrollContent.previousElementSibling as HTMLElement;
    const headerH = outputHeader ? outputHeader.offsetHeight : 0;
    scrollbar.style.top = headerH + "px";

    const trackH = scrollbar.clientHeight - BTN_H * 2;
    const ratio = clientHeight / scrollHeight;
    const thumbH = Math.max(30, trackH * ratio);
    const scrollRange = scrollHeight - clientHeight;
    const thumbTop = BTN_H + (scrollTop / scrollRange) * (trackH - thumbH);
    thumb.style.height = thumbH + "px";
    thumb.style.top = thumbTop + "px";
  }

  scrollContent.addEventListener("scroll", updateThumb);
  new ResizeObserver(updateThumb).observe(scrollContent);
  // Also update when content changes
  new MutationObserver(updateThumb).observe(scrollContent, { childList: true, subtree: true });

  // Drag thumb
  let dragging = false;
  let dragStartY = 0;
  let dragStartScroll = 0;

  thumb.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    dragStartY = e.clientY;
    dragStartScroll = scrollContent.scrollTop;
    thumb.classList.add("dragging");
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const { scrollHeight, clientHeight } = scrollContent;
    const trackH = scrollbar.clientHeight - BTN_H * 2;
    const ratio = clientHeight / scrollHeight;
    const thumbH = Math.max(30, trackH * ratio);
    const dy = e.clientY - dragStartY;
    const scrollRange = scrollHeight - clientHeight;
    const scrollDelta = (dy / (trackH - thumbH)) * scrollRange;
    scrollContent.scrollTop = dragStartScroll + scrollDelta;
  });

  document.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      thumb.classList.remove("dragging");
    }
  });

  // Click on track to jump
  scrollbar.addEventListener("mousedown", (e) => {
    if (e.target === thumb || e.target === btnUp || e.target === btnDown) return;
    const rect = scrollbar.getBoundingClientRect();
    const clickY = e.clientY - rect.top - BTN_H;
    const { scrollHeight, clientHeight } = scrollContent;
    const trackH = scrollbar.clientHeight - BTN_H * 2;
    const ratio = clickY / trackH;
    scrollContent.scrollTop = ratio * (scrollHeight - clientHeight);
  });

  // Up/Down buttons
  let scrollInterval: number | null = null;
  const startScroll = (dir: number) => {
    scrollContent.scrollBy({ top: dir * 60 });
    scrollInterval = window.setInterval(() => scrollContent.scrollBy({ top: dir * 60 }), 120);
  };
  const stopScroll = () => { if (scrollInterval !== null) { clearInterval(scrollInterval); scrollInterval = null; } };

  btnUp.addEventListener("mousedown", (e) => { e.stopPropagation(); startScroll(-1); });
  btnDown.addEventListener("mousedown", (e) => { e.stopPropagation(); startScroll(1); });
  document.addEventListener("mouseup", stopScroll);

  // Initial state
  updateThumb();
})();

// ═══════════════════════════════════════════════════════════
// DEBUG CLI PANEL - Testing interactivo del MathEditor
// ═══════════════════════════════════════════════════════════
{
  const debugPanel = document.getElementById("debugPanel") as HTMLDivElement;
  const debugOutput = document.getElementById("debugOutput") as HTMLDivElement;
  const debugInput = document.getElementById("debugInput") as HTMLInputElement;
  const debugToggle = document.getElementById("debugToggle") as HTMLButtonElement;
  const btnDebug = document.getElementById("btnDebug") as HTMLButtonElement;

  let debugVisible = false;
  const cmdHistory: string[] = [];
  let histIdx = -1;

  function toggleDebug() {
    debugVisible = !debugVisible;
    debugPanel.style.display = debugVisible ? "flex" : "none";
    if (debugVisible) {
      debugInput.focus();
      dbgPrint("help", "Escribe 'help' para ver comandos disponibles");
    }
  }

  btnDebug.addEventListener("click", toggleDebug);
  debugToggle.addEventListener("click", toggleDebug);

  // F12 para toggle (no interfiere con DevTools si ctrl+shift+I)
  document.addEventListener("keydown", (e) => {
    if (e.key === "F12" && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      toggleDebug();
    }
  });

  function dbgPrint(cls: string, text: string, copyable?: string) {
    const line = document.createElement("div");
    line.className = "dbg-line dbg-" + cls;
    line.textContent = text;
    if (copyable) {
      const btn = document.createElement("span");
      btn.className = "dbg-copy";
      btn.textContent = "[copiar]";
      btn.title = "Copiar al portapapeles";
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(copyable).then(() => {
          btn.textContent = "[copiado!]";
          setTimeout(() => btn.textContent = "[copiar]", 1500);
        });
      });
      line.appendChild(btn);
    }
    debugOutput.appendChild(line);
    debugOutput.scrollTop = debugOutput.scrollHeight;
  }

  function dbgJSON(obj: any) {
    const json = JSON.stringify(obj, null, 2);
    dbgPrint("data", json, json);
  }

  function execDebugCmd(raw: string) {
    const input = raw.trim();
    if (!input) return;

    cmdHistory.push(input);
    histIdx = cmdHistory.length;
    dbgPrint("cmd", "> " + input);

    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case "help":
        case "h":
        case "?":
          dbgPrint("help", "=== MathEditor Debug CLI ===");
          dbgPrint("help", "── Navegacion ──");
          dbgPrint("help", "info / i          - Estado actual del editor");
          dbgPrint("help", "pos / p           - Posicion del cursor con coordenadas");
          dbgPrint("help", "chars / ch        - Coordenadas pixel de cada caracter");
          dbgPrint("help", "elements / el [r] - Lista elementos en fila r");
          dbgPrint("help", "rows              - Lista todas las filas");
          dbgPrint("help", "left / l [N]      - Mover cursor izquierda N veces");
          dbgPrint("help", "right / r [N]     - Mover cursor derecha N veces");
          dbgPrint("help", "up / u            - Mover cursor arriba");
          dbgPrint("help", "down / d          - Mover cursor abajo");
          dbgPrint("help", "goto R C [P]      - Ir a fila R, columna C, posicion P");
          dbgPrint("help", "click X Y         - Simular click en canvas (X,Y)");
          dbgPrint("help", "── Edicion ──");
          dbgPrint("help", "type TEXTO        - Insertar texto");
          dbgPrint("help", "del [N]           - Borrar N caracteres (backspace)");
          dbgPrint("help", "line TEXTO        - Insertar nueva fila con texto");
          dbgPrint("help", "text              - Mostrar texto del elemento actual");
          dbgPrint("help", "all               - Serializar contenido completo");
          dbgPrint("help", "── Estructuras matematicas ──");
          dbgPrint("help", "frac [num] [den]  - Insertar fraccion");
          dbgPrint("help", "pow [base] [exp]  - Insertar potencia/superindice");
          dbgPrint("help", "sub [base] [sub]  - Insertar subindice");
          dbgPrint("help", "sqrt [expr]       - Insertar raiz cuadrada");
          dbgPrint("help", "int [lo] [hi] [f] - Insertar integral");
          dbgPrint("help", "deriv [f] [var]   - Insertar derivada");
          dbgPrint("help", "mat [R] [C]       - Insertar matriz RxC");
          dbgPrint("help", "vec [v1] [v2] ... - Insertar vector columna");
          dbgPrint("help", "── Ventana ──");
          dbgPrint("help", "new               - Nueva hoja en blanco");
          dbgPrint("help", "examples          - Listar ejemplos disponibles");
          dbgPrint("help", "load NOMBRE       - Cargar ejemplo por nombre");
          dbgPrint("help", "mode canvas|code  - Cambiar modo editor");
          dbgPrint("help", "theme calcpad|hekatan - Cambiar tema");
          dbgPrint("help", "autorun on|off    - Toggle AutoRun");
          dbgPrint("help", "run               - Ejecutar codigo (F5)");
          dbgPrint("help", "── Debug ──");
          dbgPrint("help", "clicklog on|off   - Log coordenadas al hacer click");
          dbgPrint("help", "bounds [row]      - Mostrar bounds de elementos");
          dbgPrint("help", "── Sistema ──");
          dbgPrint("help", "eval              - Forzar evaluacion");
          dbgPrint("help", "render            - Re-render canvas");
          dbgPrint("help", "focus             - Focus canvas + cursor timer");
          dbgPrint("help", "test              - Ejecutar test completo automatizado");
          dbgPrint("help", "clear / cls       - Limpiar consola");
          break;

        case "info":
        case "i": {
          const info = editor.getDebugInfo();
          dbgPrint("info", `Cursor: fila=${info.row} col=${info.col} | fontSize=${info.fontSize.toFixed(2)}px | zoom=${info.zoomLevel}`);
          dbgPrint("info", `Canvas: ${info.canvasW}x${info.canvasH}px | scroll=${info.scrollY} | contentH=${info.contentHeight}`);
          dbgPrint("info", `Timer: ${info.cursorTimer ? 'ON' : 'OFF'} | Visible: ${info.cursorVisible}`);
          if (info.element) {
            const e = info.element;
            dbgPrint("ok", `Elemento: ${e.type} @ (${e.x}, ${e.y}) size=${e.width}x${e.height}`);
            if (e.text !== undefined) {
              dbgPrint("ok", `Texto: "${e.text}" | display: "${e.displayText}" | cursorPos=${e.cursorPosition}/${e.textLength}`);
            }
          }
          const json = JSON.stringify(info, null, 2);
          dbgPrint("data", "JSON completo:", json);
          break;
        }

        case "pos":
        case "p": {
          const info = editor.getDebugInfo();
          if (info.element) {
            const e = info.element;
            const msg = `[${info.row},${info.col}] ${e.type} pos=${e.cursorPosition ?? '?'} @ pixel(${e.x}, ${e.y}) size(${e.width}x${e.height})`;
            dbgPrint("ok", msg, msg);
          } else {
            dbgPrint("err", "No hay elemento activo");
          }
          break;
        }

        case "chars":
        case "ch": {
          const chars = editor.getCharCoords();
          if (chars.length === 0) {
            dbgPrint("err", "No hay caracteres (elemento vacio o no es MathText)");
          } else {
            dbgPrint("info", `${chars.length} caracteres:`);
            for (const c of chars) {
              dbgPrint("data", `  [${c.idx}] '${c.char}' @ x=${c.x} y=${c.y} w=${c.w} h=${c.h}`);
            }
            const json = JSON.stringify(chars, null, 2);
            dbgPrint("data", "JSON:", json);
          }
          break;
        }

        case "elements":
        case "el": {
          const row = args[0] !== undefined ? parseInt(args[0]) : undefined;
          const elements = editor.getRowElements(row);
          if (elements.length === 0) {
            dbgPrint("err", "Sin elementos en esa fila");
          } else {
            dbgPrint("info", `${elements.length} elementos en fila ${row ?? '(actual)'}:`);
            for (const e of elements) {
              const cur = e.cursor ? " <<CURSOR>>" : "";
              const txt = e.text !== undefined ? ` "${e.text}"` : "";
              dbgPrint("data", `  [${e.row},${e.col}][${e.idx}] ${e.type}${txt} @ (${e.x},${e.y}) ${e.w}x${e.h}${cur}`);
            }
          }
          break;
        }

        case "rows": {
          const info = editor.getDebugInfo();
          for (let r = 0; r < info.totalRows; r++) {
            const els = editor.getRowElements(r);
            const texts = els.filter((e: any) => e.text !== undefined).map((e: any) => e.text).join(" | ");
            const mark = r === info.row ? " <<<" : "";
            dbgPrint("data", `  fila ${r}: ${els.length} elementos — ${texts}${mark}`);
          }
          break;
        }

        case "left":
        case "l": {
          const n = parseInt(args[0] || "1");
          for (let i = 0; i < n; i++) editor.moveCursorLeft();
          const info = editor.getDebugInfo();
          dbgPrint("ok", `Cursor: [${info.row},${info.col}] pos=${info.element?.cursorPosition ?? '?'}`);
          break;
        }

        case "right":
        case "r": {
          const n = parseInt(args[0] || "1");
          for (let i = 0; i < n; i++) editor.moveCursorRight();
          const info = editor.getDebugInfo();
          dbgPrint("ok", `Cursor: [${info.row},${info.col}] pos=${info.element?.cursorPosition ?? '?'}`);
          break;
        }

        case "up":
        case "u":
          editor.moveCursorUp();
          dbgPrint("ok", `Cursor: [${editor.getDebugInfo().row},${editor.getDebugInfo().col}]`);
          break;

        case "down":
        case "d":
          editor.moveCursorDown();
          dbgPrint("ok", `Cursor: [${editor.getDebugInfo().row},${editor.getDebugInfo().col}]`);
          break;

        case "goto": {
          const r = parseInt(args[0] ?? "-1");
          const c = parseInt(args[1] ?? "0");
          const p = args[2] !== undefined ? parseInt(args[2]) : undefined;
          const result = editor.moveCursorTo(r, c, p);
          dbgPrint(result.startsWith("OK") ? "ok" : "err", result);
          break;
        }

        case "click": {
          const cx = parseFloat(args[0] ?? "0");
          const cy = parseFloat(args[1] ?? "0");
          const result = editor.simulateClick(cx, cy);
          dbgPrint("ok", result);
          // Mostrar info del nuevo elemento
          const info = editor.getDebugInfo();
          if (info.element) {
            dbgPrint("info", `→ ${info.element.type} "${info.element.text ?? ''}" pos=${info.element.cursorPosition ?? '?'} @ (${info.element.x},${info.element.y})`);
          }
          break;
        }

        case "type": {
          const text = parts.slice(1).join(" ");
          if (!text) { dbgPrint("err", "Uso: type TEXTO"); break; }
          const result = editor.typeText(text);
          dbgPrint(result.startsWith("OK") ? "ok" : "err", result);
          break;
        }

        case "del": {
          const n = parseInt(args[0] || "1");
          const result = editor.deleteBack(n);
          dbgPrint(result.startsWith("OK") ? "ok" : "err", result);
          break;
        }

        case "text": {
          const info = editor.getDebugInfo();
          if (info.element?.text !== undefined) {
            dbgPrint("ok", `Texto plano: "${info.element.text}"`);
            dbgPrint("ok", `Display:     "${info.element.displayText}"`);
            dbgPrint("info", `Pos: ${info.element.cursorPosition}/${info.element.textLength}`);
          } else {
            dbgPrint("err", "Elemento actual no tiene texto");
          }
          break;
        }

        case "all": {
          const code = editor.toHekatan();
          dbgPrint("ok", `${code.split('\n').length} lineas:`);
          for (const line of code.split('\n')) {
            dbgPrint("data", "  " + line);
          }
          dbgPrint("data", "", code);
          break;
        }

        case "clicklog": {
          const onoff = (args[0] || "").toLowerCase();
          if (onoff === "on") {
            editor.onDebugClick = (info) => {
              dbgPrint("info", `CLICK mouse=(${info.mouseX},${info.mouseY}) content=(${info.contentX},${info.contentY})`);
              dbgPrint("info", `  hitTest → row=${info.foundRow} col=${info.foundCol} type=${info.elementType} text="${info.elementText}"`);
              dbgPrint("info", `  cursor → row=${info.cursorRow} element="${info.cursorElement}"`);
            };
            dbgPrint("ok", "Click logging ACTIVADO — haz click en el canvas");
          } else if (onoff === "off") {
            editor.onDebugClick = null;
            dbgPrint("ok", "Click logging DESACTIVADO");
          } else {
            dbgPrint("err", "Uso: clicklog on|off");
          }
          break;
        }

        case "bounds": {
          const rowArg = args[0] ? parseInt(args[0]) : -1;
          const allBounds = editor.getElementBounds();
          const rows = rowArg >= 0 ? allBounds.filter(r => r.row === rowArg) : allBounds;
          for (const r of rows) {
            dbgPrint("info", `Row ${r.row}:`);
            for (const el of r.elements) {
              dbgPrint("data", `  ${el.type} "${el.text}" @ (${el.x},${el.y}) ${el.w}x${el.h}`);
            }
          }
          if (rows.length === 0) dbgPrint("err", `No se encontro row ${rowArg}`);
          break;
        }

        case "eval":
          editor.render();
          dbgPrint("ok", "Evaluacion forzada");
          break;

        case "render":
          editor.render();
          dbgPrint("ok", "Canvas re-renderizado");
          break;

        case "focus":
          mathCanvasEl.focus();
          dbgPrint("ok", `Focus + cursor timer: ${editor.getDebugInfo().cursorTimer ? 'ON' : 'OFF'}`);
          break;

        case "clear":
        case "cls":
          debugOutput.innerHTML = "";
          break;

        // ─── Insertar estructuras matemáticas ───

        case "line": {
          const text = parts.slice(1).join(" ");
          if (!text) { dbgPrint("err", "Uso: line TEXTO (inserta nueva fila)"); break; }
          const result = editor.insertLine(text);
          dbgPrint(result.startsWith("OK") ? "ok" : "err", result);
          break;
        }

        case "frac": {
          const num = args[0] || "";
          const den = args[1] || "";
          dbgPrint("ok", editor.insertFraction(num, den));
          break;
        }

        case "pow":
        case "power": {
          const base = args[0] || "";
          const exp = args[1] || "";
          dbgPrint("ok", editor.insertPower(base, exp));
          break;
        }

        case "sub":
        case "subscript": {
          const base = args[0] || "x";
          const sub = args[1] || "i";
          dbgPrint("ok", editor.insertSubscript(base, sub));
          break;
        }

        case "sqrt":
        case "root": {
          const rad = args[0] || "";
          dbgPrint("ok", editor.insertRoot(rad));
          break;
        }

        case "integral":
        case "int": {
          const lo = args[0] || "0";
          const hi = args[1] || "1";
          const body = args[2] || "";
          dbgPrint("ok", editor.insertIntegral(lo, hi, body));
          break;
        }

        case "deriv":
        case "derivative": {
          const fn = args[0] || "f";
          const vr = args[1] || "x";
          dbgPrint("ok", editor.insertDerivative(fn, vr));
          break;
        }

        case "matrix":
        case "mat": {
          const rows = parseInt(args[0] || "2");
          const cols = parseInt(args[1] || "2");
          dbgPrint("ok", editor.insertMatrix(rows, cols));
          break;
        }

        case "vector":
        case "vec": {
          const vals = args.length > 0 ? args : ["0", "0", "0"];
          dbgPrint("ok", editor.insertVector(vals));
          break;
        }

        // ─── Test completo automatizado ───
        case "test": {
          dbgPrint("info", "=== TEST COMPLETO DEL MATHEDITOR ===");
          dbgPrint("info", "");

          // 1. Insertar ecuación simple
          dbgPrint("info", "--- 1. Insertar ecuación: x = 5 ---");
          const r1 = editor.insertLine("x = 5");
          dbgPrint("ok", r1);
          dbgPrint("ok", `  → info: ${JSON.stringify(editor.getDebugInfo().element)}`);

          // 2. Insertar ecuación con operaciones
          dbgPrint("info", "--- 2. Insertar: y = x^2 + 3*x - 1 ---");
          const r2 = editor.insertLine("y = x^2 + 3*x - 1");
          dbgPrint("ok", r2);

          // 3. Insertar raíz cuadrada
          dbgPrint("info", "--- 3. Insertar: z = sqrt(x^2 + y^2) ---");
          const r3 = editor.insertLine("z = sqrt(x^2 + y^2)");
          dbgPrint("ok", r3);

          // 4. Navegar y editar
          dbgPrint("info", "--- 4. Navegar arriba 2 filas (a 'y = x^2...') ---");
          editor.moveCursorUp();
          editor.moveCursorUp();
          const infoY = editor.getDebugInfo();
          dbgPrint("ok", `  En fila ${infoY.row}: "${infoY.element?.text}"`);

          // 5. Ir al final y eliminar
          dbgPrint("info", "--- 5. Ir al final y borrar 2 chars ---");
          editor.moveCursorRight();
          editor.moveCursorRight();
          editor.moveCursorRight();
          // Navigate to last text element
          const rowEls = editor.getRowElements();
          dbgPrint("data", `  Elementos en fila: ${rowEls.map((e: any) => e.type + ':"' + (e.text ?? '') + '"').join(', ')}`);

          // 6. Insertar nueva línea con fracción
          dbgPrint("info", "--- 6. Insertar ecuación con fracción: a/b ---");
          const r6 = editor.insertLine("w = a/b + c");
          dbgPrint("ok", r6);
          const els6 = editor.getRowElements();
          dbgPrint("data", `  Elementos: ${els6.map((e: any) => e.type).join(', ')}`);

          // 7. Insertar línea vacía + matriz
          dbgPrint("info", "--- 7. Insertar matriz 2x2 ---");
          editor.insertLine("M = ");
          const r7 = editor.insertMatrix(2, 2);
          dbgPrint("ok", r7);

          // 8. Insertar vector
          dbgPrint("info", "--- 8. Insertar vector ---");
          editor.insertLine("v = ");
          const r8 = editor.insertVector(["1", "2", "3"]);
          dbgPrint("ok", r8);

          // 9. Verificar que todo el contenido se serializa
          dbgPrint("info", "--- 9. Verificar serialización ---");
          const code = editor.toHekatan();
          const lines = code.split('\n');
          dbgPrint("ok", `Total: ${lines.length} líneas`);

          // 10. Forzar evaluación
          dbgPrint("info", "--- 10. Evaluación ---");
          editor.render();
          dbgPrint("ok", "Render completado");

          dbgPrint("info", "");
          dbgPrint("info", "=== TEST COMPLETO FINALIZADO ===");
          break;
        }

        // ─── Comandos de ventana ───
        case "new":
        case "blank": {
          editor.loadFromText("");
          setCodeContent("");
          exampleSelect.value = "";
          if (currentMode === "canvas") {
            mathCanvasEl.focus();
          }
          runCode();
          dbgPrint("ok", "Nueva hoja en blanco");
          break;
        }

        case "examples":
        case "list": {
          dbgPrint("info", "Ejemplos disponibles:");
          for (const [key, ex] of Object.entries(EXAMPLES)) {
            const mark = exampleSelect.value === key ? " <<<" : "";
            dbgPrint("data", `  ${key} — ${ex.name}${mark}`);
          }
          break;
        }

        case "load": {
          const name = args[0];
          if (!name) {
            dbgPrint("err", "Uso: load NOMBRE (usa 'examples' para ver lista)");
            break;
          }
          const ex = EXAMPLES[name];
          if (!ex) {
            // Try partial match
            const match = Object.keys(EXAMPLES).find(k => k.toLowerCase().startsWith(name.toLowerCase()));
            if (match) {
              const mex = EXAMPLES[match];
              exampleSelect.value = match;
              setCodeContent(mex.code);
              editor.loadFromText(mex.code);
              runCode();
              if (currentMode === "canvas") mathCanvasEl.focus();
              dbgPrint("ok", `Cargado: ${match} — ${mex.name}`);
            } else {
              dbgPrint("err", `Ejemplo '${name}' no encontrado. Usa 'examples' para ver lista.`);
            }
            break;
          }
          exampleSelect.value = name;
          setCodeContent(ex.code);
          editor.loadFromText(ex.code);
          runCode();
          if (currentMode === "canvas") mathCanvasEl.focus();
          dbgPrint("ok", `Cargado: ${name} — ${ex.name}`);
          break;
        }

        case "mode": {
          const m = (args[0] || "").toLowerCase();
          if (m === "canvas" || m === "c") {
            setMode("canvas");
            dbgPrint("ok", "Modo: MathCanvas");
          } else if (m === "code" || m === "t") {
            setMode("code");
            dbgPrint("ok", "Modo: Code");
          } else {
            dbgPrint("info", `Modo actual: ${currentMode}`);
            dbgPrint("help", "Uso: mode canvas|code");
          }
          break;
        }

        case "theme": {
          const t = (args[0] || "").toLowerCase();
          if (t === "calcpad" || t === "c") {
            themeSelect.value = "calcpad";
            themeSelect.dispatchEvent(new Event("change"));
            dbgPrint("ok", "Tema: Calcpad");
          } else if (t === "hekatan" || t === "h") {
            themeSelect.value = "hekatan";
            themeSelect.dispatchEvent(new Event("change"));
            dbgPrint("ok", "Tema: Hekatan");
          } else {
            dbgPrint("info", `Tema actual: ${themeSelect.value}`);
            dbgPrint("help", "Uso: theme calcpad|hekatan");
          }
          break;
        }

        case "autorun": {
          const v = (args[0] || "").toLowerCase();
          if (v === "on" || v === "1") {
            chkAutoRun.checked = true;
            chkAutoRun.dispatchEvent(new Event("change"));
            dbgPrint("ok", "AutoRun: ON");
          } else if (v === "off" || v === "0") {
            chkAutoRun.checked = false;
            chkAutoRun.dispatchEvent(new Event("change"));
            dbgPrint("ok", "AutoRun: OFF");
          } else {
            dbgPrint("info", `AutoRun: ${chkAutoRun.checked ? "ON" : "OFF"}`);
          }
          break;
        }

        case "run": {
          if (currentMode === "canvas") {
            setCodeContent(editor.toHekatan());
          }
          runCode();
          dbgPrint("ok", "Codigo ejecutado");
          break;
        }

        default:
          dbgPrint("err", `Comando desconocido: '${cmd}'. Escribe 'help' para ver comandos.`);
      }
    } catch (err: any) {
      dbgPrint("err", `Error: ${err.message}`);
    }
  }

  // Input handlers
  debugInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      execDebugCmd(debugInput.value);
      debugInput.value = "";
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      if (histIdx > 0) {
        histIdx--;
        debugInput.value = cmdHistory[histIdx];
      }
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (histIdx < cmdHistory.length - 1) {
        histIdx++;
        debugInput.value = cmdHistory[histIdx];
      } else {
        histIdx = cmdHistory.length;
        debugInput.value = "";
      }
      e.preventDefault();
    } else if (e.key === "Escape") {
      toggleDebug();
    }
    e.stopPropagation(); // No enviar keys al canvas/textarea
  });
  debugInput.addEventListener("keypress", (e) => e.stopPropagation());
  debugInput.addEventListener("keyup", (e) => e.stopPropagation());

  // Expose to window for console access
  (window as any).__dbg = execDebugCmd;
  (window as any).__editor = editor;
}

// ═══════════════════════════════════════════════════════════
// KEYPAD BAR — Greek, Operators, Functions, Blocks
// ═══════════════════════════════════════════════════════════
const keypadContent = document.getElementById("keypadContent") as HTMLDivElement;

const KEYPAD_DATA: Record<string, { label: string; insert: string }[]> = {
  greek: [
    { label: "\u03B1", insert: "alpha" }, { label: "\u03B2", insert: "beta" },
    { label: "\u03B3", insert: "gamma" }, { label: "\u03B4", insert: "delta" },
    { label: "\u03B5", insert: "epsilon" }, { label: "\u03B6", insert: "zeta" },
    { label: "\u03B7", insert: "eta" }, { label: "\u03B8", insert: "theta" },
    { label: "\u03BB", insert: "lambda" }, { label: "\u03BC", insert: "mu" },
    { label: "\u03BD", insert: "nu" }, { label: "\u03BE", insert: "xi" },
    { label: "\u03C0", insert: "pi" }, { label: "\u03C1", insert: "rho" },
    { label: "\u03C3", insert: "sigma" }, { label: "\u03C4", insert: "tau" },
    { label: "\u03C6", insert: "phi" }, { label: "\u03C8", insert: "psi" },
    { label: "\u03C9", insert: "omega" },
    { label: "\u0393", insert: "Gamma" }, { label: "\u0394", insert: "Delta" },
    { label: "\u0398", insert: "Theta" }, { label: "\u039B", insert: "Lambda" },
    { label: "\u03A3", insert: "Sigma" }, { label: "\u03A6", insert: "Phi" },
    { label: "\u03A8", insert: "Psi" }, { label: "\u03A9", insert: "Omega" },
  ],
  operators: [
    { label: "+", insert: " + " }, { label: "\u2212", insert: " - " },
    { label: "\u00D7", insert: "*" }, { label: "\u00F7", insert: "/" },
    { label: "^", insert: "^" }, { label: "!", insert: "!" },
    { label: "\u221A", insert: "sqrt(" }, { label: "\u221B", insert: "cbrt(" },
    { label: "\u2261", insert: " == " }, { label: "\u2260", insert: " != " },
    { label: "<", insert: " < " }, { label: ">", insert: " > " },
    { label: "\u2264", insert: " <= " }, { label: "\u2265", insert: " >= " },
    { label: "\u2227", insert: " && " }, { label: "\u2228", insert: " || " },
    { label: "\u2211", insert: "sum(" }, { label: "\u220F", insert: "product(" },
    { label: "\u222B", insert: "integral(" },
  ],
  functions: [
    { label: "sin", insert: "sin(" }, { label: "cos", insert: "cos(" },
    { label: "tan", insert: "tan(" }, { label: "asin", insert: "asin(" },
    { label: "acos", insert: "acos(" }, { label: "atan", insert: "atan(" },
    { label: "ln", insert: "ln(" }, { label: "log", insert: "log(" },
    { label: "exp", insert: "exp(" }, { label: "abs", insert: "abs(" },
    { label: "sqrt", insert: "sqrt(" }, { label: "cbrt", insert: "cbrt(" },
    { label: "round", insert: "round(" }, { label: "floor", insert: "floor(" },
    { label: "ceil", insert: "ceiling(" }, { label: "min", insert: "min(" },
    { label: "max", insert: "max(" }, { label: "mod", insert: "mod(" },
    { label: "det", insert: "det(" }, { label: "inv", insert: "inv(" },
    { label: "transp", insert: "transpose(" }, { label: "lsolve", insert: "lsolve(" },
  ],
  blocks: [
    { label: "@{eq}", insert: "@{eq}\\n\\n@{end eq}" },
    { label: "@{text}", insert: "@{text}\\n\\n@{end text}" },
    { label: "@{draw}", insert: "@{draw 500 400}\\n\\n@{end draw}" },
    { label: "@{three}", insert: "@{three 600 400}\\n\\n@{end three}" },
    { label: "@{config}", insert: "@{config eq:$, text:\"}\\n\\n@{end config}" },
    { label: "@{columns}", insert: "@{columns 2}\\n\\n@{end columns}" },
    { label: "for", insert: "for i = 1 to 10\\n\\nnext" },
    { label: "if", insert: "if x > 0\\n\\nelse\\n\\nend if" },
    { label: "@{pagebreak}", insert: "@{pagebreak}" },
    { label: "---", insert: "\\n---\\n" },
  ],
};

function renderKeypad(tabName: string) {
  keypadContent.innerHTML = "";
  const items = KEYPAD_DATA[tabName] || [];
  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = item.label.length > 3 ? "key-btn wide" : "key-btn";
    btn.textContent = item.label;
    btn.dataset.insert = item.insert;
    btn.title = item.insert.replace(/\\n/g, "\u21B5");
    btn.addEventListener("click", () => insertAtCursor(item.insert));
    keypadContent.appendChild(btn);
  }
}

// Tab switching
document.querySelectorAll<HTMLButtonElement>(".keypad-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".keypad-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    renderKeypad(tab.dataset.tab!);
  });
});

// Initial keypad
renderKeypad("greek");

// ═══════════════════════════════════════════════════════════
// STATUS BAR — Decimals, Substitute, Zero small, Plot options
// ═══════════════════════════════════════════════════════════
const decimalsInput = document.getElementById("decimalsInput") as HTMLInputElement;
const chkSubstitute = document.getElementById("chkSubstitute") as HTMLInputElement;
const chkZeroSmall = document.getElementById("chkZeroSmall") as HTMLInputElement;
const chkAdaptive = document.getElementById("chkAdaptive") as HTMLInputElement;
const chkShadows = document.getElementById("chkShadows") as HTMLInputElement;

// Re-run on status bar changes
decimalsInput.addEventListener("change", () => { if (chkAutoRun.checked) runCode(); });
chkSubstitute.addEventListener("change", () => { if (chkAutoRun.checked) runCode(); });
chkZeroSmall.addEventListener("change", () => { if (chkAutoRun.checked) runCode(); });

// ─── Init ───────────────────────────────────────────────
// Load default example: Texto y Ecuaciones
const defaultEx = EXAMPLES["texto"];
if (defaultEx) {
  exampleSelect.value = "texto";
  setCodeContent(defaultEx.code);
  editor.loadFromText(defaultEx.code);
} else {
  exampleSelect.value = "";
  setCodeContent("");
  editor.loadFromText("");
}
updateSyntax();
setMode("code");
