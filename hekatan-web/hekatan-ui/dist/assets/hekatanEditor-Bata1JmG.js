import"./modulepreload-polyfill-B5Qt9EMX.js";import{p as ae}from"./parser-C_EzRoS9.js";const oe=`# Ejemplo 5.1 - Analisis de Grid Frame
> Mario Paz - Matrix Structural Analysis
> 2 elementos, 3 nodos, 9 GDL
> Unidades: kip, inch, rad

## 1. Propiedades
> W 14 x 82 - Todos los miembros
@{cells} |L = 100|I_z = 882|J_t = 5.08|
@{cells} |E_s = 29000|G_s = 11600|
> L [in], I_z [in^4], J_t [in^4], E_s [ksi], G_s [ksi]

## 2. Coeficientes de Rigidez
@{cells} |t_1 = G_s*J_t/L|a_4 = 4*E_s*I_z/L|a_2 = 2*E_s*I_z/L|
@{cells} |b_6 = 6*E_s*I_z/L^2|c_12 = 12*E_s*I_z/L^3|
> t [kip*in], a [kip*in], b [kip], c [kip/in]

## 3. Matriz de Rigidez Local [k] (eq 5.7)
> DOF: [theta_x, theta_z, delta_y] por nodo
> Igual para ambos elementos (eq a)
k = [[t_1,0,0,-t_1,0,0],[0,a_4,b_6,0,a_2,-b_6],[0,b_6,c_12,0,b_6,-c_12],[-t_1,0,0,t_1,0,0],[0,a_2,b_6,0,a_4,-b_6],[0,-b_6,-c_12,0,-b_6,c_12]]

## 4. Transformacion Elemento 2
> Elem 1: theta=0 => T_1=I (identidad)
> Elem 2: theta=90 grados (eq 5.11, eq b)
T_2 = [[0,-1,0,0,0,0],[1,0,0,0,0,0],[0,0,1,0,0,0],[0,0,0,0,-1,0],[0,0,0,1,0,0],[0,0,0,0,0,1]]

## 5. Rigidez Global Elemento 2
> k_bar_2 = T_2' * k * T_2 (eq 5.15, eq c)
kb2 = transpose(T_2) * k * T_2

## 6. Ensamblaje [K]_R
> Nodo 2 (libre) = extremo j Elem 1 (DOFs 4:6) + extremo i Elem 2 (DOFs 1:3)
> Submatriz Elem 1:
k1R = k[4:6, 4:6]
> Submatriz Elem 2 (global):
k2R = kb2[1:3, 1:3]
> [K]_R = k1R + k2R (eq d)
K_R = k1R + k2R

## 7. Fuerzas de Empotramiento
> Elem 1: M_0=200 kip*in a L/2, Apendice I Caso (b) (eq e)
@{cells} |L_1 = L/2|L_2 = L/2|M_0 = 200|
> Q_1=6*M_0*L_1*L_2/L^3, Q_2=M_0*L_2*(2*L_1-L_2)/L^2, Q_3=-Q_1, Q_4=M_0*L_1*(2*L_2-L_1)/L^2
@{cells} |Q_1 = 6*M_0*L_1*L_2/L^3|Q_2 = M_0*L_2*(2*L_1 - L_2)/L^2|
@{cells} |Q_3 = -Q_1|Q_4 = M_0*L_1*(2*L_2 - L_1)/L^2|
> DOF grid: [theta_x, theta_z, delta_y] => Q_f = [0, Q2, Q1, 0, Q4, Q3]
Q_f1 = col(0, Q_2, Q_1, 0, Q_4, Q_3)
> Elem 2: w=0.1 kip/in, Apendice I Caso (a) (eq f)
@{cells} |w_0 = 0.1|
> Q_f locales: M_i=wL^2/12, V_i=wL/2, M_j=-wL^2/12, V_j=wL/2
Q_f2L = col(0, w_0*L^2/12, w_0*L/2, 0, -w_0*L^2/12, w_0*L/2)
> Q_f en coordenadas globales via T_2'
Q_f2 = transpose(T_2) * Q_f2L

## 8. Vector de Fuerzas Reducido
> {F}_R = P - Q_f1(4:6) - Q_f2(1:3) (eq g)
> Incluye P = -10 kip en delta_y (coord 3)
P_d = col(0, 0, -10)
F_R = P_d - Q_f1[4:6] - Q_f2[1:3]

## 9. Solucion de Desplazamientos
> [K]_R {u} = {F}_R (eq h)
u = lusolve(K_R, F_R)
> u1=theta_x [rad], u2=theta_z [rad], u3=delta_y [in]

## 10. Desplazamientos Locales (eq i)
> Componentes: theta_x, theta_z, delta_y
@{cells} |u_1 = u[1]|u_2 = u[2]|u_3 = u[3]|
> Elem 1 (T_1=I): nodo 2 libre, nodo 1 empotrado
d_1 = col(u_1, u_2, u_3, 0, 0, 0)
> Elem 2: d_2 = T_2 * d_1 (T_1=I, mismo vector global)
d_2 = T_2 * d_1

## 11. Fuerzas en Elementos (eq 4.20)
> {P} = [k]{d} + {Q_f}
> Elem 1:
P_1 = k * d_1 + Q_f1
> Elem 2 (Q_f en locales):
P_2 = k * d_2 + Q_f2L

## 12. Reacciones en Apoyos
> Nodo 1 (empotrado): DOFs 4:6 de P_1
@{cells} |R_1 = P_1[4]|R_2 = P_1[5]|R_3 = P_1[6]|
> Nodo 3 (empotrado): P_bar_2 = T_2' * P_2 (eq 5.12)
Pb2 = transpose(T_2) * P_2
@{cells} |R_7 = Pb2[4]|R_8 = Pb2[5]|R_9 = Pb2[6]|
`,le=`# Analisis Modal - Eigen C++ (WASM)
> Problema generalizado: [K]{phi} = w^2 [M]{phi}
> Metodo: eigenvalues(K,M) y eigenvectors(K,M)

## 1. Sistema 2 GDL (Paz, Cap. 10)
> Unidades: kip, in, s

> Rigidez lateral y masa:
K_L = [[1243.5, -492.6], [-492.6, 317.9]]
M_1 = [[1.0102, 0], [0, 1.0102]]

> Eigenvalores (w^2):
w2_1 = eigenvalues(K_L, M_1)

> Frecuencias y periodos:
W_n1 = sqrt(w2_1[1])
W_n2 = sqrt(w2_1[2])
T_1 = 2*pi/W_n1
T_2 = 2*pi/W_n2

> Modos de vibracion (mass-normalized):
phi_1 = eigenvectors(K_L, M_1)

## 2. Edificio 3D - 9 GDL (Ej. 22)
> Analisis modal pseudotridimensional
> Unidades: ton, m, s

> Matriz de masa condensada (9x9):
M_m = [[9.664,0,0,0,0,0,-3.383,0,0],[0,8.102,0,0,0,0,0,-2.836,0],[0,0,2.956,0,0,0,0,0,-1.035],[0,0,0,9.664,0,0,5.799,0,0],[0,0,0,0,8.102,0,0,4.861,0],[0,0,0,0,0,2.956,0,0,0.887],[-3.383,0,0,5.799,0,0,160.097,0,0],[0,-2.836,0,0,4.861,0,0,134.217,0],[0,0,-1.035,0,0,0.887,0,0,21.569]]

> Matriz de rigidez (9x9):
K_E = [[9256.99,-5773.83,443.906,0,0,0,0,0,0],[-5773.83,8616.398,-3449.302,0,0,0,0,0,0],[443.906,-3449.302,3029.824,0,0,0,0,0,0],[0,0,0,9083.663,-5751.948,619.8,-567.114,2383.074,0],[0,0,0,-5751.948,8431.724,-3425.93,2383.074,-12482.682,0],[0,0,0,619.8,-3425.93,2852.154,-1859.4,10277.79,0],[0,0,0,-567.114,2383.074,-1859.4,330271.812,-204010.022,11016.049],[0,0,0,2383.074,-12482.682,10277.79,-204010.022,282946.888,-73087.32],[0,0,0,0,0,0,11016.049,-73087.32,62784.73]]

> Solucion del problema caracteristico:
lambda = inv(M_m) * K_E
w2 = sort(eigenvalues(lambda))

> Frecuencias naturales (rad/s):
w = sqrt(w2)

> Periodos de vibracion (s):
T_e = 2*pi / w

> Modos de vibracion normalizados (phi^T * M * phi = I):
phi_n = eigenvectors(K_E, M_m)
`,ie=`# Vectores y Trigonometria
> Operaciones con vectores, matrices y funciones trigonometricas

## 1. Operaciones con Vectores
v1 = [3, 4, 5]
v2 = [1, -2, 3]
> Suma y resta:
v_sum = v1 + v2
v_dif = v1 - v2
> Producto punto:
dp = dot(v1, v2)
> Producto cruz:
vc = cross(v1, v2)
> Norma:
n1 = norm(v1)

## 2. Algebra Lineal
A = [[2, 1], [5, 3]]
b = [4, 7]
> Determinante:
d = det(A)
> Inversa:
Ainv = inv(A)
> Resolver A*x = b:
x = inv(A) * b

## 3. Funciones Trigonometricas (escalares)
alpha = pi/6
s = sin(alpha)
c = cos(alpha)
t = tan(alpha)
> Identidad fundamental:
check = sin(alpha)^2 + cos(alpha)^2

## 4. Trig Element-wise en Vectores
> sin, cos, exp aplican automaticamente a cada elemento
ang = [0, pi/6, pi/4, pi/3, pi/2]
s_vec = sin(ang)
c_vec = cos(ang)
> Identidad en cada elemento: sin^2 + cos^2 = 1
check_v = sin(ang)^2 + cos(ang)^2

## 5. Funciones Matematicas en Vectores
vals = [1, 4, 9, 16, 25]
raices = sqrt(vals)
logaritmos = ln(vals)
absolutos = abs([-3, -1, 0, 2, 5])

## 6. Division y Potencia Element-wise
a = [10, 20, 30]
b = [2, 4, 5]
> Division vec / vec:
div_r = a / b
> Potencia vec ^ escalar:
pot_r = a ^ 2

## 7. Matriz de Rotacion 2D
theta = pi/4
R = [[cos(theta), -sin(theta)], [sin(theta), cos(theta)]]
> Rotar punto (1, 0):
p0 = [[1], [0]]
p1 = R * p0

## 8. Vibracion Amortiguada
> x(t) = e^(-zeta*wn*t) * sin(wd*t)
wn = 10
zeta = 0.1
wd = wn * sqrt(1 - zeta^2)
t_v = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
> Respuesta amortiguada (producto element-wise automatico):
x_t = exp(-zeta * wn * t_v) * sin(wd * t_v)
`,se=`# Rigidez Lateral: Portico con Mamposteria
> Adaptado de: Roberto Aguiar Falconi - "rlaxinfimamposteria"
> Metodo del puntal diagonal equivalente (NTE E.070 Peru)
> Demuestra: #for, #if, funciones, #while

## 1. Propiedades de Materiales
> Concreto armado (fc = 210 kg/cm2):
E_c = 2100000
> Mamposteria (fm = 50 kg/cm2):
E_m = 500000

## 2. Geometria del Portico
> Columnas: 30 x 40 cm, altura h [m]
@{cells} |b_c = 0.30| |h_c = 0.40| |h = 3.0|
> Viga: 25 x 50 cm, luz L_b [m]
@{cells} |b_v = 0.25| |h_v = 0.50| |L_b = 5.0|
> Espesor de mamposteria [m]:
t_m = 0.15

## 3. Propiedades de Seccion
I_c = b_c * h_c^3 / 12
I_v = b_v * h_v^3 / 12

## 4. Coeficientes de Rigidez
@{cells} |c12 = 12*E_c*I_c/h^3| |c6 = 6*E_c*I_c/h^2| |c4 = 4*E_c*I_c/h|
@{cells} |v4 = 4*E_c*I_v/L_b| |v2 = 2*E_c*I_v/L_b|

## 5. Ensamblaje y Condensacion
K = [[2*c12, c6, c6], [c6, c4+v4, v2], [c6, v2, c4+v4]]
K_ab = [[c6, c6]]
K_bb = [[c4+v4, v2], [v2, c4+v4]]
K_ba = [[c6], [c6]]
KL_sin = ([[2*c12]] - K_ab * inv(K_bb) * K_ba)[1,1]

## 6. Puntal Diagonal Equivalente
L_d = sqrt(h^2 + L_b^2)
alpha_d = atan(h / L_b)
a_p = L_d / 4
A_p = a_p * t_m
k_p = E_m * A_p / L_d
k_h = k_p * cos(alpha_d)^2

## 7. Con Mamposteria
KL_con = ([[2*c12 + k_h]] - K_ab * inv(K_bb) * K_ba)[1,1]

## 8. Resultados
> Sin mamposteria [T/m]:
KL_sin
> Con mamposteria [T/m]:
KL_con
Factor = KL_con / KL_sin

## 9. Clasificacion (#if)
#if Factor > 3
> ALERTA: Incremento muy alto - revisar modelo
clase = 3
#else if Factor > 2
> Incremento moderado - considerar en diseno
clase = 2
#else
> Incremento bajo
clase = 1
#end if

## 10. Estudio Parametrico (#for)
> Funcion de rigidez lateral con mamposteria:
kl_mamp(t) = KL_sin + E_m * (a_p * t) / L_d * cos(alpha_d)^2

> Variacion del espesor de mamposteria (10 a 30 cm):
#for t_cm = 10 : 5 : 30
kl_i = kl_mamp(t_cm / 100)
f_i = kl_i / KL_sin
#loop

## 11. Convergencia Newton-Raphson (#while)
> Buscar espesor t [m] tal que Factor = 2.0:
> f(t) = KL(t)/KL_sin - 2 = 0
t_n = 0.10
#while abs(kl_mamp(t_n)/KL_sin - 2) > 0.001
dt = 0.001
df = (kl_mamp(t_n + dt) - kl_mamp(t_n)) / dt
t_n = t_n - (kl_mamp(t_n)/KL_sin - 2) * KL_sin / df
#loop
> Espesor para Factor = 2.0 [cm]:
t_factor2 = t_n * 100
> Verificacion:
factor_check = kl_mamp(t_n) / KL_sin
`,ce=`# Ensamblaje FEM - Asignacion Indexada
> Construir matrices k[i,j] como en MATLAB/Octave
> Basado en: Roberto Aguiar - "rlaxinfimamposteria"

## 1. Propiedades de la Estructura
> Portico: 2 columnas identicas, 3 nodos, 6 GDL
@{cells} |E = 2100000| |I_c = 0.30 * 0.40^3 / 12|
@{cells} |h = 3.0| |ngl = 6|
EI = E * I_c

## 2. Matriz de Rigidez Local (4x4)
> GDL = [V_1, theta_1, V_2, theta_2]
> Construccion con asignacion indexada k[i,j]:
k = zeros(4,4)
k[1,1] = 12*EI/h^3
k[1,2] = 6*EI/h^2
k[1,3] = -12*EI/h^3
k[1,4] = 6*EI/h^2
k[2,1] = k[1,2]
k[2,2] = 4*EI/h
k[2,3] = -6*EI/h^2
k[2,4] = 2*EI/h
k[3,1] = k[1,3]
k[3,2] = k[2,3]
k[3,3] = k[1,1]
k[3,4] = -k[1,2]
k[4,1] = k[1,4]
k[4,2] = k[2,4]
k[4,3] = k[3,4]
k[4,4] = k[2,2]
> Matriz de rigidez completa:
k

## 3. Ensamblaje Global
> Metodo directo: SS[jj,mm] = SS[jj,mm] + k[j,m]
SS = zeros(ngl, ngl)
> Elemento 1 (nodos 1-2): GDL globales [1,2,3,4]
#for j = 1:4
#for m = 1:4
SS[j, m] = SS[j, m] + k[j, m]
#loop
#loop
> Elemento 2 (nodos 2-3): GDL globales [3,4,5,6]
#for j = 1:4
#for m = 1:4
SS[j+2, m+2] = SS[j+2, m+2] + k[j, m]
#loop
#loop
> Matriz de rigidez global ensamblada:
SS

## 4. Condensacion Estatica
> Particionar: GDL libres (1:2) y restringidos (3:6)
K_aa = SS[1:2, 1:2]
K_ab = SS[1:2, 3:6]
K_ba = SS[3:6, 1:2]
K_bb = SS[3:6, 3:6]
> Rigidez lateral condensada:
KL = K_aa - K_ab * inv(K_bb) * K_ba
`,re=`# Cell Arrays - Vectores de Matrices
> Almacenar matrices de rigidez por elemento
> Sintaxis: V{i} acceso, cell(n), cells(...), cset(), clen()

## 1. Crear desde lista de valores
A = [[1, 2], [3, 4]]
B = [[5, 6], [7, 8]]

> cells(A, B, ...) crea un cell array con los valores:
V = cells(A, B, A + B)
> Acceso por indice con llaves (1-based):
V{1}
V{2}
V{3}

## 2. Crear vacio y llenar con cset()
> cell(n) crea un cell array vacio de tamano n:
K = cell(2)
cset(K, 1, A * 2)
cset(K, 2, B + A)
> Ahora K{1} y K{2} contienen matrices:
K{1}
K{2}

## 3. FEM: Rigidez por Elemento
> Portico: ne elementos, cada uno con su matriz 4x4
@{cells} |EI = 2100000 * (0.30 * 0.40^3 / 12)| |ne = 3|
h(e) = 2.5 + 0.5 * e

> Generar K_e por elemento (#for silent):
K_e = cell(ne)
#for e = 1 : ne
k = zeros(4,4)
k[1,1] = 12*EI/h(e)^3
k[1,2] = 6*EI/h(e)^2
k[1,3] = -k[1,1]
k[1,4] = k[1,2]
k[2,2] = 4*EI/h(e)
k[2,4] = 2*EI/h(e)
k[3,3] = k[1,1]
k[3,4] = -k[1,2]
k[4,4] = k[2,2]
k[2,1] = k[1,2]
k[3,1] = k[1,3]
k[3,2] = k[2,3]
k[4,1] = k[1,4]
k[4,2] = k[2,4]
k[4,3] = k[3,4]
cset(K_e, e, k)
#loop
> Numero de elementos almacenados:
clen(K_e)

> Matriz de rigidez de cada elemento:
K_e{1}
K_e{2}
K_e{3}
`,de=`# Portico k{i} - Rigidez Lateral (Aguiar)
> Funciones de rigidez, cell arrays k{i}, #for/#if, ensamblaje manual
> Basado en metodo de rigidez lateral con pisos

## 1. Propiedades
E = 2100000
> Columnas: 30x40cm, Vigas: 25x50cm
I_c = 0.30 * 0.40^3 / 12
I_v = 0.25 * 0.50^3 / 12

## 2. Alturas de Entrepiso
> 3 pisos con alturas variables
h1 = 4.0
h2 = 3.5
h3 = 3.0
L = 5.0

## 3. Rigidez por Piso
> Funcion de rigidez de columna:
k_col(ei, hh) = 12*ei/hh^3
> Funcion de rigidez de viga:
k_vig(ei, ll) = 4*ei/ll

## 4. Rigidez de Columnas (2 por piso)
EI_c = E * I_c
k_c1 = 2 * k_col(EI_c, h1)
k_c2 = 2 * k_col(EI_c, h2)
k_c3 = 2 * k_col(EI_c, h3)

## 5. Matrices de Rigidez por Piso (2x2)
> Piso 1: columnas de h1
K_1 = [[k_c1, -k_c1], [-k_c1, k_c1]]
> Piso 2: columnas de h2
K_2 = [[k_c2, -k_c2], [-k_c2, k_c2]]
> Piso 3: columnas de h3
K_3 = [[k_c3, -k_c3], [-k_c3, k_c3]]

## 6. Cell Array de Rigideces
K_pisos = cells(K_1, K_2, K_3)
> Verificacion de cada piso:
K_pisos{1}
K_pisos{2}
K_pisos{3}

## 7. Ensamblaje Global (3x3)
KG = zeros(3, 3)
> Piso 1 (GDL 1-2):
KG[1,1] = KG[1,1] + K_pisos{1}[1,1]
KG[1,2] = KG[1,2] + K_pisos{1}[1,2]
KG[2,1] = KG[2,1] + K_pisos{1}[2,1]
KG[2,2] = KG[2,2] + K_pisos{1}[2,2]
> Piso 2 (GDL 2-3):
KG[2,2] = KG[2,2] + K_pisos{2}[1,1]
KG[2,3] = KG[2,3] + K_pisos{2}[1,2]
KG[3,2] = KG[3,2] + K_pisos{2}[2,1]
KG[3,3] = KG[3,3] + K_pisos{2}[2,2]
> Piso 3 (GDL 3):
KG[3,3] = KG[3,3] + K_pisos{3}[1,1]

> Rigidez global ensamblada:
KG

## 8. Fuerzas Laterales
F = col(10, 20, 15)

## 9. Desplazamientos
u = lusolve(KG, F)

## 10. Verificacion
#if u[1,1] > 0
> Desplazamientos positivos (esperado)
ok = 1
#else
> Error: desplazamientos negativos
ok = 0
#end if
`,me=`# Calculo - Integrales y Derivadas
> Visualizacion grafica con @{plot} - anotaciones, cotas y ecuaciones

## 1. Integral Definida - Area bajo la curva
> La integral definida es el area bajo la curva entre a y b

f(x) = x^2
a = 0
b = 4

> Resultado exacto: b^3/3 - a^3/3
Area = b^3/3 - a^3/3

## 1.1 Suma de Riemann Izquierda (n=8)

@{plot}
function: x^2
color: #0033CC
linewidth: 2.5
legend: f(x) = x^2
xlim: 0, 4
ylim: -1, 17
width: 700
height: 450
title: Suma de Riemann Izquierda - f(x) = x^2
xlabel: x
ylabel: f(x)

rect: 0, 0, 0.5, 0, #3366CC, fill
rect: 0.5, 0, 0.5, 0.25, #3366CC, fill
rect: 1.0, 0, 0.5, 1.0, #3366CC, fill
rect: 1.5, 0, 0.5, 2.25, #3366CC, fill
rect: 2.0, 0, 0.5, 4.0, #3366CC, fill
rect: 2.5, 0, 0.5, 6.25, #3366CC, fill
rect: 3.0, 0, 0.5, 9.0, #3366CC, fill
rect: 3.5, 0, 0.5, 12.25, #3366CC, fill

eq: 0.5, 15, "S_8 = 17.5", #CC0000, 13
eq: 0.5, 13.5, "Integral x^2 dx = 64/3 = 21.33", #003366, 12
text: 2.5, -0.7, "dx = 0.5", #666666, 11

dim: 0, -0.5, 4, -0.5, "a=0 a b=4", #333333
@{end plot}

## 2. Derivada - Pendiente de la Tangente
> f'(a) = pendiente de la recta tangente en (a, f(a))

## 2.1 Derivada de f(x) = x^2 en x=1.5

@{plot}
function: x^2
color: #0033CC
linewidth: 2.5
legend: f(x) = x^2
xlim: -0.5, 4
ylim: -2, 14
width: 700
height: 450
title: Derivada de f(x)=x^2 en x=1.5
xlabel: x
ylabel: f(x)

line: -0.5, -3.75, 3.5, 8.25, #CC0000
point: 1.5, 2.25, #CC0000, 7, filled

proj: 1.5, 2.25, #999999
eq: 2.2, 1.5, "f'(1.5) = 2*1.5 = 3", #CC0000, 12
eq: 2.2, 0.5, "Pendiente m = 3", #003366, 11
text: 1.6, 2.5, "(1.5, 2.25)", #333333, 10
text: 2.5, 6, "Tangente", #CC0000, 11
@{end plot}

## 3. Comparacion Numerica
> Suma de Riemann con N=100 vs resultado exacto
N_r = 100
dx = (b - a) / N_r
g_R(i) = f(a + (i - 0.5)*dx) * dx
Area_R = summation(g_R, 1, N_r)
Area_exacta = b^3/3 - a^3/3

> Regla de Simpson 1/3
h_s = (b - a) / 2
m = (a + b) / 2
Simpson = (h_s/3) * (f(a) + 4*f(m) + f(b))

@{cells} |Area_R| |Area_exacta| |Simpson|`,ue=`# Graficas con @{plot}
> Graficas SVG - sintaxis compatible con Hekatan Calc C#

## 1. Funcion Simple (function:)
@{plot}
function: sin(x)
color: #0033CC
linewidth: 2.5
legend: sin(x)
xlim: -6.28, 6.28
ylim: -1.5, 1.5
title: Funcion Seno
xlabel: x
ylabel: y
grid: true
@{end plot}

## 2. Multiples Series (numbered)
@{plot}
title: Funciones Trigonometricas
xlabel: x
ylabel: y
xlim: -6.28, 6.28
ylim: -1.5, 1.5
grid: true

function: sin(x)
color: #0033CC
legend: sin(x)
linewidth: 2.5

function2: cos(x)
color2: #CC0000
legend2: cos(x)
linewidth2: 2
style2: dashed

function3: sin(2*x)/2
color3: #006600
legend3: sin(2x)/2
linewidth3: 1.5
style3: dot
@{end plot}

## 3. Con Anotaciones
@{plot}
function: x^2
color: #0033CC
linewidth: 2.5
legend: f(x) = x^2
xlim: -1, 4
ylim: -2, 16
title: Derivada en x=2
xlabel: x
ylabel: f(x)
width: 650
height: 420
grid: true

line: -0.5, -4, 3.5, 12, #CC0000
point: 2, 4, #CC0000, 6, filled
proj: 2, 4, #AAAAAA
eq: 2.3, 3, "f'(2) = 2*2 = 4", #CC0000, 12
text: 2.8, 9, "Tangente", #CC0000, 11
@{end plot}

## 4. Con Variables del Scope
A_p = 2
w_p = 3
@{plot}
title: Amplitud y Frecuencia
xlabel: x
ylabel: y
xlim: 0, 6.28
ylim: -2.5, 2.5
grid: true

function: A_p*sin(w_p*x)
color: #0033CC
legend: A*sin(w*x)
linewidth: 2

function2: A_p*cos(w_p*x)
color2: #CC0000
legend2: A*cos(w*x)
linewidth2: 2
style2: dashed

hline: 0, #999999
@{end plot}

## 5. Sintaxis Inline (y =)
@{plot}
x = -3.14 : 3.14
y = -1.5 : 1.5
y = sin(x) | color: #2196f3 | width: 2 | label: "sin(x)"
y = cos(x) | color: #f44336 | width: 2 | label: "cos(x)" | style: dashed
point 0 0 #333
hline 1 #4caf50
hline -1 #4caf50
vline 0 #999
@{end plot}`,_e=`# Ecuaciones Formateadas
@{eq}
∫_0^1 x^2 dx = {1}/{3}                              (1)
∑_{n=0}^{∞} {1}/{n!} = e                             (2)
∏_{k=1}^{N} k = N!                                    (3)
lim_{x->0} {sin(x)}/{x} = 1                          (4)
d/dx [x^n] = n·x^{n-1}                               (5)
∂/∂x [x^2·y + y^3] = 2·x·y                           (6)

∫_0^{∞} e^{-x^2} dx = {sqrt(pi)}/{2}                 (7)
∑_{n=1}^{∞} {1}/{n^2} = {pi^2}/{6}                   (8)

∂²/∂x² u + ∂²/∂y² u = 0                              (9)
d²y/dx² + omega^2·y = 0                              (10)
@{end eq}`,pe=`# FEM Assembly
> Propiedades del elemento
E = 200000
A = 100
L = 1000

> Rigidez axial
k = E*A/L

> Matriz de rigidez local 2x2
K11 = k
K12 = -k
K21 = -k
K22 = k

> Ensamblaje 3 elementos en serie
K_global_22 = k + k
K_global_33 = k + k

> Fuerza aplicada en nodo 3
F3 = 1000
u3 = F3/k`,fe=`# Dibujo SVG
@{svg}
<svg viewBox="0 0 400 300" style="max-width:400px;background:#fff;border:1px solid #ddd;">
  <rect x="50" y="50" width="300" height="200" fill="none" stroke="#333" stroke-width="2"/>
  <circle cx="200" cy="150" r="60" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <line x1="50" y1="150" x2="350" y2="150" stroke="#999" stroke-dasharray="5,3"/>
  <line x1="200" y1="50" x2="200" y2="250" stroke="#999" stroke-dasharray="5,3"/>
  <text x="200" y="30" text-anchor="middle" font-size="14" fill="#333">Dibujo SVG</text>
</svg>
@{end svg}`,ge=`# Escena 3D con Three.js
@{three}
const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshPhongMaterial({color: 0x2196f3});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.8, 32, 32),
  new THREE.MeshPhongMaterial({color: 0xf44336})
);
sphere.position.set(3, 0, 0);
scene.add(sphere);

scene.add(new THREE.GridHelper(10, 10));
@{end three}`,be=`# Funciones y Operaciones Avanzadas
> Funciones de usuario, sumatorias, productos

## 1. Funciones de Usuario
f(x) = x^3 - 2*x + 1
f(0)
f(1)
f(2)
f(3)

g(x,y) = x^2 + y^2
g(3, 4)

## 2. Sumatoria Numerica
> summation(f, a, b) = Σ f(i) para i = a hasta b
h(i) = i^2
S_10 = summation(h, 1, 10)

> Factorial via producto
p(k) = k
fact_6 = nproduct(p, 1, 6)

## 3. Derivada Numerica
> nderivative(f, x) calcula f'(x) numericamente
df_1 = nderivative(f, 1)
df_2 = nderivative(f, 2)

## 4. Integral Numerica
> integral(f, a, b) calcula la integral definida
Area = integral(f, 0, 3)

## 5. Matrices con Funciones
k_col(ei, l) = [[12*ei/l^3, -6*ei/l^2], [-6*ei/l^2, 4*ei/l]]
EI = 2100000 * (0.30 * 0.40^3 / 12)
h = 3.0
K = k_col(EI, h)

## 6. Operaciones con Vectores
v = [1, 4, 9, 16, 25]
v_sqrt = sqrt(v)
v_sum = sum(v)
v_norm = norm(v)`,he=`# Integracion Numerica (Gauss-Legendre)
> Cuadratura de Gauss para integrales simples, dobles y triples

## Integral Simple

> Area bajo sin(x) de 0 a pi
f(x) = sin(x)
I_1 = integral(f, 0, pi)

> Integral de polinomio
g(x) = x^3 - 2*x + 1
I_2 = integral(g, -1, 2)

@{plot}
x = -1 : 2
y = -2 : 5
y = x^3 - 2*x + 1 | color: #2196f3 | width: 2 | label: "g(x) = x^3 - 2x + 1"
hline 0 #999
@{end plot}

## Integral Doble

> Volumen bajo paraboloide z = x^2 + y^2 en [0,1] x [0,1]
h(x,y) = x^2 + y^2
I_3 = integral2(h, 0, 1, 0, 1)

> Integral de sin(x)*cos(y) en [0,pi] x [0,pi/2]
p(x,y) = sin(x)*cos(y)
I_4 = integral2(p, 0, pi, 0, pi/2)

## Integral Triple

> Densidad r = x + y + z en cubo unitario
r(x,y,z) = x + y + z
I_5 = integral3(r, 0, 1, 0, 1, 0, 1)

> Integral de x*y*z en [0,2]^3
q(x,y,z) = x*y*z
I_6 = integral3(q, 0, 2, 0, 2, 0, 2)`,q={calculo:{name:"Calculo - Integrales/Derivadas",code:me},plot:{name:"@{plot} Graficas 2D",code:ue},eq_demo:{name:"@{eq} Ecuaciones",code:_e},integral:{name:"Integrales (Gauss)",code:he},vectores:{name:"Vectores y Trig",code:ie},control:{name:"Control de Flujo (#for, #if)",code:be},cell_arrays:{name:"Cell Arrays",code:re},fem:{name:"FEM Basico",code:pe},fem_assembly:{name:"FEM Ensamblaje",code:ce},portico:{name:"Portico k{i} (Aguiar)",code:de},mamposteria:{name:"Mamposteria (Aguiar)",code:se},modal:{name:"Analisis Modal (Eigen WASM)",code:le},grid_frame:{name:"Grid Frame (Paz 5.1)",code:oe},three:{name:"@{three} 3D",code:ge},svg:{name:"@{svg} Dibujo",code:fe}},n=document.getElementById("codeInput"),f=document.getElementById("output"),P=document.getElementById("btnRun"),z=document.getElementById("statusText"),K=document.getElementById("exampleSelect"),xe=document.getElementById("chkAutoRun"),F=document.getElementById("splitter"),V=document.getElementById("inputFrame"),ke=document.getElementById("outputFrame"),ve=document.getElementById("rulerH"),Ee=document.getElementById("rulerV"),H=document.getElementById("keypadContent"),W=document.getElementById("lineNumbers"),w=document.getElementById("syntaxLayer"),j=document.getElementById("findBar"),v=document.getElementById("findInput"),B=document.getElementById("replaceInput"),A=document.getElementById("findCount"),E=document.getElementById("acPopup");for(const[e,a]of Object.entries(q)){const t=document.createElement("option");t.value=e,t.textContent=a.name,K.appendChild(t)}K.addEventListener("change",()=>{const e=q[K.value];e&&(n.value=e.code,x(),y(),h())});let g=null;function h(){const e=n.value;if(!e.trim()){f.innerHTML="";return}z.textContent="Procesando...",P.disabled=!0;try{const a=ae(e);f.innerHTML=`<div class="output-page">${a.html}</div>`,z.textContent="Listo",I()}catch(a){f.innerHTML=`<div class="output-page"><div class="line error">Error: ${a.message}</div></div>`,z.textContent="Error"}P.disabled=!1}P.addEventListener("click",h);n.addEventListener("keydown",e=>{if(E.classList.contains("open")){if(e.key==="ArrowDown"){e.preventDefault(),k=(k+1)%b.length,G();return}if(e.key==="ArrowUp"){e.preventDefault(),k=(k-1+b.length)%b.length,G();return}if(e.key==="Enter"||e.key==="Tab"){e.preventDefault(),X();return}if(e.key==="Escape"){S();return}}if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault(),h();return}if(e.key==="F5"){e.preventDefault(),h();return}if(e.key==="f"&&(e.ctrlKey||e.metaKey)){e.preventDefault(),N(!1);return}if(e.key==="h"&&(e.ctrlKey||e.metaKey)){e.preventDefault(),N(!0);return}if(e.key==="Escape"&&j.classList.contains("open")){M();return}if(e.key==="q"&&(e.ctrlKey||e.metaKey)&&!e.shiftKey){e.preventDefault(),Z();return}if(e.key==="q"&&(e.ctrlKey||e.metaKey)&&e.shiftKey){e.preventDefault(),ee();return}if(e.key==="Tab"){e.preventDefault();const a=n.selectionStart,t=n.selectionEnd;n.value=n.value.substring(0,a)+"  "+n.value.substring(t),n.selectionStart=n.selectionEnd=a+2}});n.addEventListener("input",()=>{Ke(),g&&clearTimeout(g),g=setTimeout(h,400)});function x(){const e=n.value,a=e.split(`
`).length,t=n.selectionStart,l=e.substring(0,t).split(`
`).length;let o="";for(let i=1;i<=a;i++)o+=`<div${i===l?' class="active"':""}>${i}</div>`;W.innerHTML=o}function ye(){W.scrollTop=n.scrollTop}n.addEventListener("scroll",ye);n.addEventListener("input",x);n.addEventListener("click",x);n.addEventListener("keyup",x);function y(){const a=n.value.split(`
`);let t=!1;const l=[];for(const o of a){const i=o.trimStart();if(/^@\{(?!end)/.test(i)&&(t=!0),/^@\{end\s/.test(i)){l.push(L(o,"syn-block")),t=!1;continue}if(/^@\{/.test(i)){l.push(L(o,"syn-block"));continue}if(t){l.push(R(o));continue}if(/^#{1,6}\s/.test(i)){l.push(L(o,"syn-heading"));continue}if(i.startsWith(">")){l.push(L(o,"syn-comment"));continue}if(i.startsWith("'")){l.push(L(o,"syn-comment"));continue}if(/^#?(for|next|if|else|end if|repeat|loop|break|continue|while|do)\b/i.test(i)){l.push(L(o,"syn-keyword"));continue}l.push(Le(o))}w.innerHTML=l.join(`
`),w.scrollTop=n.scrollTop,w.scrollLeft=n.scrollLeft}function R(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function L(e,a){return`<span class="${a}">${R(e)}</span>`}function Le(e){return R(e).replace(/\b(\d+\.?\d*([eE][+-]?\d+)?)\b/g,'<span class="syn-number">$1</span>').replace(/\b(sin|cos|tan|asin|acos|atan|atan2|sqrt|cbrt|ln|log|exp|abs|round|floor|ceiling|min|max|mod|gcd|lcm|sum|product|integral|transpose|lsolve|det|inv|identity|matrix)\b/g,'<span class="syn-function">$1</span>')}n.addEventListener("input",y);n.addEventListener("scroll",()=>{w.scrollTop=n.scrollTop,w.scrollLeft=n.scrollLeft});let c=[],r=-1;function N(e=!1){j.classList.add("open");const a=document.getElementById("replaceRow");a.style.display=e?"flex":"none",v.focus();const t=n.value.substring(n.selectionStart,n.selectionEnd);t&&!t.includes(`
`)&&(v.value=t),v.select(),C()}function M(){j.classList.remove("open"),c=[],r=-1,A.textContent="",n.focus()}function C(){const e=v.value;if(!e){c=[],r=-1,A.textContent="";return}const a=document.getElementById("findCase").checked,t=document.getElementById("findRegex").checked;c=[];const l=n.value;try{if(t){const o=a?"g":"gi",i=new RegExp(e,o);let s;for(;(s=i.exec(l))!==null;)c.push({start:s.index,end:s.index+s[0].length}),s[0].length===0&&i.lastIndex++}else{const o=a?l:l.toLowerCase(),i=a?e:e.toLowerCase();let s=0;for(;(s=o.indexOf(i,s))!==-1;)c.push({start:s,end:s+e.length}),s+=e.length}}catch{}if(c.length>0){const o=n.selectionStart;r=c.findIndex(i=>i.start>=o),r===-1&&(r=0),O()}else r=-1;Q()}function O(){if(r<0||r>=c.length)return;const e=c[r];n.selectionStart=e.start,n.selectionEnd=e.end,n.focus();const a=n.value.substring(0,e.start).split(`
`).length,t=parseFloat(getComputedStyle(n).lineHeight)||20;n.scrollTop=Math.max(0,(a-5)*t)}function Q(){c.length===0?A.textContent=v.value?"0/0":"":A.textContent=`${r+1}/${c.length}`}function U(){c.length!==0&&(r=(r+1)%c.length,O(),Q())}function Y(){c.length!==0&&(r=(r-1+c.length)%c.length,O(),Q())}function Ce(){if(r<0||r>=c.length)return;const e=c[r],a=n.value;n.value=a.substring(0,e.start)+B.value+a.substring(e.end),C(),x(),y()}function we(){if(c.length===0)return;let e=n.value;for(let a=c.length-1;a>=0;a--){const t=c[a];e=e.substring(0,t.start)+B.value+e.substring(t.end)}n.value=e,C(),x(),y()}v.addEventListener("input",C);document.getElementById("findNext").addEventListener("click",U);document.getElementById("findPrev").addEventListener("click",Y);document.getElementById("replaceOne").addEventListener("click",Ce);document.getElementById("replaceAll").addEventListener("click",we);document.getElementById("findClose").addEventListener("click",M);document.getElementById("findCase").addEventListener("change",C);document.getElementById("findRegex").addEventListener("change",C);v.addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),e.shiftKey?Y():U()),e.key==="Escape"&&M()});B.addEventListener("keydown",e=>{e.key==="Escape"&&M()});const Ie=[...["sin","cos","tan","asin","acos","atan","atan2","sqrt","cbrt","ln","log","log2","exp","abs","round","floor","ceiling","min","max","mod","gcd","lcm","sum","product","integral","transpose","lsolve","det","inv","identity","matrix","sign","fact","comb","perm"].map(e=>({word:e+"(",kind:"fn"})),...["pi","e","inf"].map(e=>({word:e,kind:"const"})),...["for","next","if","else","end if","repeat","loop","break","continue","while","do"].map(e=>({word:e,kind:"kw"})),...["@{eq}","@{end eq}","@{plot}","@{end plot}","@{svg}","@{end svg}","@{three}","@{end three}","@{draw}","@{end draw}","@{html}","@{end html}","@{css}","@{end css}","@{markdown}","@{end markdown}","@{python}","@{end python}","@{bash}","@{end bash}","@{js}","@{end js}","@{columns 2}","@{end columns}","@{table}","@{end table}","@{function}","@{end function}","@{pagebreak}"].map(e=>({word:e,kind:"block"})),...["alpha","beta","gamma","delta","epsilon","zeta","eta","theta","lambda","mu","nu","xi","rho","sigma","tau","phi","psi","omega","Gamma","Delta","Theta","Lambda","Sigma","Phi","Psi","Omega"].map(e=>({word:e,kind:"greek"}))];let k=0,b=[];function J(){const e=n.selectionStart,a=n.value;let t=e;for(;t>0&&/[\w@{#.]/.test(a[t-1]);)t--;return{word:a.substring(t,e),start:t}}function Ke(){const{word:e,start:a}=J();if(e.length<2){S();return}const t=e.toLowerCase();if(b=Ie.filter(_=>_.word.toLowerCase().startsWith(t)&&_.word!==e),b.length===0){S();return}k=0,G(),n.getBoundingClientRect();const o=n.value.substring(0,a).split(`
`),i=parseFloat(getComputedStyle(n).lineHeight)||20,s=o.length,p=o[o.length-1].length,u=7.8,d=s*i-n.scrollTop+2,m=p*u-n.scrollLeft+50;E.style.top=`${d}px`,E.style.left=`${m}px`,E.classList.add("open")}function G(){E.innerHTML=b.map((e,a)=>`<div class="ac-item${a===k?" selected":""}" data-idx="${a}">
      <span>${R(e.word)}</span>
      <span class="ac-kind">${e.kind}</span>
    </div>`).join("")}function S(){E.classList.remove("open"),b=[]}function X(){if(b.length===0)return;const e=b[k],{start:a}=J(),t=n.value,l=n.selectionStart;n.value=t.substring(0,a)+e.word+t.substring(l),n.selectionStart=n.selectionEnd=a+e.word.length,S(),x(),y(),g&&clearTimeout(g),g=setTimeout(h,400)}E.addEventListener("click",e=>{const a=e.target.closest(".ac-item");a&&(k=parseInt(a.dataset.idx),X())});function Ae(e){const a=e.replace(/\\n/g,`
`),t=n.selectionStart,l=n.selectionEnd;n.value=n.value.substring(0,t)+a+n.value.substring(l),n.selectionStart=n.selectionEnd=t+a.length,n.focus(),x(),y(),g&&clearTimeout(g),g=setTimeout(h,400)}document.addEventListener("click",e=>{const a=e.target.closest("[data-insert]");a&&Ae(a.dataset.insert)});document.addEventListener("click",e=>{e.target.closest(".menu-item")||document.querySelectorAll(".menu-item").forEach(t=>t.classList.remove("open"))});document.querySelectorAll(".menu-dropdown button[data-action]").forEach(e=>{e.addEventListener("click",()=>{const a=e.dataset.action;switch(document.querySelectorAll(".menu-item").forEach(t=>t.classList.remove("open")),a){case"new":n.value="",f.innerHTML="";break;case"save":D(n.value,"document.hcalc","text/plain");break;case"saveas":D(n.value,"document.hcalc","text/plain");break;case"open":Se();break;case"export-html":D(f.innerHTML,"output.html","text/html");break;case"undo":document.execCommand("undo");break;case"redo":document.execCommand("redo");break;case"selectall":n.select();break;case"comment":Z();break;case"uncomment":ee();break}})});function D(e,a,t){const l=new Blob([e],{type:t}),o=document.createElement("a");o.href=URL.createObjectURL(l),o.download=a,o.click(),URL.revokeObjectURL(o.href)}function Se(){const e=document.createElement("input");e.type="file",e.accept=".hcalc,.cpd,.txt",e.onchange=()=>{var l;const a=(l=e.files)==null?void 0:l[0];if(!a)return;const t=new FileReader;t.onload=()=>{n.value=t.result,xe.checked&&h()},t.readAsText(a)},e.click()}function Z(){const e=n.selectionStart,a=n.selectionEnd,t=n.value,o=t.substring(0,e).lastIndexOf(`
`)+1,i=t.indexOf(`
`,a),s=i===-1?t.length:i,u=t.substring(o,s).split(`
`).map(d=>"'"+d).join(`
`);n.value=t.substring(0,o)+u+t.substring(s),n.selectionStart=o,n.selectionEnd=o+u.length}function ee(){const e=n.selectionStart,a=n.selectionEnd,t=n.value,o=t.substring(0,e).lastIndexOf(`
`)+1,i=t.indexOf(`
`,a),s=i===-1?t.length:i,u=t.substring(o,s).split(`
`).map(d=>d.startsWith("'")?d.slice(1):d).join(`
`);n.value=t.substring(0,o)+u+t.substring(s),n.selectionStart=o,n.selectionEnd=o+u.length}let T=!1;F.addEventListener("mousedown",e=>{T=!0,F.classList.add("dragging"),e.preventDefault()});document.addEventListener("mousemove",e=>{if(!T)return;const t=V.parentElement.getBoundingClientRect(),l=e.clientX-t.left,o=t.width-6,i=Math.max(15,Math.min(85,l/o*100));V.style.flex=`0 0 ${i}%`,ke.style.flex=`0 0 ${100-i}%`,I()});document.addEventListener("mouseup",()=>{T&&(T=!1,F.classList.remove("dragging"))});const Te=96,te=Te/2.54;function I(){Re(),Me()}function Re(){const e=ve,a=e.parentElement;e.width=a.clientWidth-18;const t=e.getContext("2d"),l=e.width,o=e.height;t.fillStyle="#F5F5F5",t.fillRect(0,0,l,o),t.strokeStyle="#AAA",t.fillStyle="#888",t.font="9px Segoe UI",t.textAlign="center";const s=f.scrollLeft||0,p=te,u=Math.floor(s/p),d=Math.ceil((s+l)/p);for(let m=u;m<=d;m++){const _=m*p-s;_<0||_>l||(t.beginPath(),m%5===0?(t.moveTo(_,o),t.lineTo(_,o-10),t.stroke(),t.fillText(`${m}`,_,10)):(t.moveTo(_,o),t.lineTo(_,o-5),t.stroke()))}t.beginPath(),t.moveTo(0,o-.5),t.lineTo(l,o-.5),t.stroke()}function Me(){const e=Ee,a=e.parentElement;e.height=a.clientHeight-18;const t=e.getContext("2d"),l=e.width,o=e.height;t.fillStyle="#F5F5F5",t.fillRect(0,0,l,o),t.strokeStyle="#AAA",t.fillStyle="#888",t.font="9px Segoe UI",t.textAlign="center";const i=f.scrollTop||0,s=te,p=Math.floor(i/s),u=Math.ceil((i+o)/s);for(let d=p;d<=u;d++){const m=d*s-i;m<0||m>o||(t.beginPath(),d%5===0?(t.moveTo(l,m),t.lineTo(l-10,m),t.stroke(),t.save(),t.translate(9,m),t.rotate(-Math.PI/2),t.fillText(`${d}`,0,0),t.restore()):(t.moveTo(l,m),t.lineTo(l-5,m),t.stroke()))}t.beginPath(),t.moveTo(l-.5,0),t.lineTo(l-.5,o),t.stroke()}f.addEventListener("scroll",I);window.addEventListener("resize",I);setTimeout(I,100);const ze={greek:[{label:"α",insert:"alpha"},{label:"β",insert:"beta"},{label:"γ",insert:"gamma"},{label:"δ",insert:"delta"},{label:"ε",insert:"epsilon"},{label:"ζ",insert:"zeta"},{label:"η",insert:"eta"},{label:"θ",insert:"theta"},{label:"λ",insert:"lambda"},{label:"μ",insert:"mu"},{label:"ν",insert:"nu"},{label:"ξ",insert:"xi"},{label:"π",insert:"pi"},{label:"ρ",insert:"rho"},{label:"σ",insert:"sigma"},{label:"τ",insert:"tau"},{label:"φ",insert:"phi"},{label:"ψ",insert:"psi"},{label:"ω",insert:"omega"},{label:"Γ",insert:"Gamma"},{label:"Δ",insert:"Delta"},{label:"Θ",insert:"Theta"},{label:"Λ",insert:"Lambda"},{label:"Σ",insert:"Sigma"},{label:"Φ",insert:"Phi"},{label:"Ψ",insert:"Psi"},{label:"Ω",insert:"Omega"}],operators:[{label:"+",insert:" + "},{label:"−",insert:" - "},{label:"×",insert:"*"},{label:"÷",insert:"/"},{label:"^",insert:"^"},{label:"!",insert:"!"},{label:"√",insert:"sqrt("},{label:"∛",insert:"cbrt("},{label:"≡",insert:" == "},{label:"≠",insert:" != "},{label:"<",insert:" < "},{label:">",insert:" > "},{label:"≤",insert:" <= "},{label:"≥",insert:" >= "},{label:"∧",insert:" && "},{label:"∨",insert:" || "},{label:"∑",insert:"sum("},{label:"∏",insert:"product("},{label:"∫",insert:"integral("}],functions:[{label:"sin",insert:"sin("},{label:"cos",insert:"cos("},{label:"tan",insert:"tan("},{label:"asin",insert:"asin("},{label:"acos",insert:"acos("},{label:"atan",insert:"atan("},{label:"ln",insert:"ln("},{label:"log",insert:"log("},{label:"exp",insert:"exp("},{label:"abs",insert:"abs("},{label:"sqrt",insert:"sqrt("},{label:"cbrt",insert:"cbrt("},{label:"round",insert:"round("},{label:"floor",insert:"floor("},{label:"ceil",insert:"ceiling("},{label:"min",insert:"min("},{label:"max",insert:"max("},{label:"mod",insert:"mod("},{label:"gcd",insert:"gcd("},{label:"lcm",insert:"lcm("}],blocks:[{label:"@{eq}",insert:"@{eq}\\n\\n@{end eq}"},{label:"@{plot}",insert:"@{plot}\\n\\n@{end plot}"},{label:"@{svg}",insert:"@{svg}\\n\\n@{end svg}"},{label:"@{three}",insert:"@{three}\\n\\n@{end three}"},{label:"@{draw}",insert:"@{draw}\\n\\n@{end draw}"},{label:"@{html}",insert:"@{html}\\n\\n@{end html}"},{label:"@{python}",insert:"@{python}\\n\\n@{end python}"},{label:"@{bash}",insert:"@{bash}\\n\\n@{end bash}"},{label:"@{js}",insert:"@{js}\\n\\n@{end js}"},{label:"@{columns}",insert:"@{columns 2}\\n\\n@{end columns}"},{label:"for",insert:"for i = 1 to 10\\n\\nnext"},{label:"if",insert:"if x > 0\\n\\nelse\\n\\nend if"}]};function ne(e){H.innerHTML="";const a=ze[e]||[];for(const t of a){const l=document.createElement("button");l.className=t.label.length>3?"key-btn wide":"key-btn",l.textContent=t.label,l.dataset.insert=t.insert,l.title=t.insert.replace(/\\n/g,"↵"),H.appendChild(l)}}document.querySelectorAll(".keypad-tab").forEach(e=>{e.addEventListener("click",()=>{document.querySelectorAll(".keypad-tab").forEach(a=>a.classList.remove("active")),e.classList.add("active"),ne(e.dataset.tab)})});ne("greek");var $;($=document.getElementById("btnPrint"))==null||$.addEventListener("click",()=>{const e=window.open("","_blank");e&&(e.document.write(`<!DOCTYPE html><html><head><title>Hekatan Calc Output</title>
    <style>body{font-family:'Segoe UI',sans-serif;padding:30px 40px;}</style></head>
    <body>${f.innerHTML}</body></html>`),e.document.close(),e.print())});n.value=q.calculo.code;K.value="calculo";x();y();h();
