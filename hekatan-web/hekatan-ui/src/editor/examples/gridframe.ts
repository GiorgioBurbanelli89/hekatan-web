/**
 * Grid Frame - Chapter 5, Illustrative Example 5.1
 * Mario Paz - Matrix Structural Analysis and Dynamics
 * Uses # > @{cells} syntax (native Hekatan directives)
 */
export const GRID_FRAME_CODE = `# Ejemplo 5.1 - Analisis de Grid Frame
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

## 7. Fuerzas Nodales Equivalentes
> Elem 1: M_0=200 kip*in a L/2 (eq e)
Q_b1 = col(0, -50, -3, 0, -50, 3)
> Elem 2: w=0.1 kip/in distribuida (eq f)
Q_b2 = col(-83.33, 0, -5, 83.33, 0, -5)

## 8. Vector de Fuerzas Reducido
> {F}_R = Q1(4:6) + Q2(1:3) + P_directa (eq g)
> Incluye P = -10 kip en delta_y (coord 3)
P_d = col(0, 0, -10)
F_R = Q_b1[4:6] + Q_b2[1:3] + P_d

## 9. Solucion de Desplazamientos
> [K]_R {u} = {F}_R (eq h)
u = lusolve(K_R, F_R)
> u1=theta_x [rad], u2=theta_z [rad], u3=delta_y [in]

## 10. Desplazamientos Locales (eq i)
> Elem 1 (T_1=I): {d}_1 = [u_nodo2; 0_nodo1]
d_1 = col(u[1], u[2], u[3], 0, 0, 0)
> Elem 2: {d}_2 = T_2 * [u_nodo2; 0_nodo3]
d_b2 = col(u[1], u[2], u[3], 0, 0, 0)
d_2 = T_2 * d_b2

## 11. Fuerzas en Elementos (eq 4.20)
> {P} = [k]{d} - {Q}
> Elem 1:
P_1 = k * d_1 - Q_b1
> Elem 2 (Q en locales):
Q_2L = col(0, 83.33, 5, 0, -83.33, 5)
P_2 = k * d_2 - Q_2L

## 12. Reacciones en Apoyos
> Nodo 1 (empotrado): DOFs 4:6 de P_1
@{cells} |R_1 = P_1[4]|R_2 = P_1[5]|R_3 = P_1[6]|
> Nodo 3 (empotrado): P_bar_2 = T_2' * P_2 (eq 5.12)
Pb2 = transpose(T_2) * P_2
@{cells} |R_7 = Pb2[4]|R_8 = Pb2[5]|R_9 = Pb2[6]|
`;
