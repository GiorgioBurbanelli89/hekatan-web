/** FEM Assembly — Asignacion Indexada k[i,j] (Aguiar) */
export const FEM_ASSEMBLY_CODE = `# Ensamblaje FEM - Asignacion Indexada
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
`;
