/** Cell Arrays — Vectores de Matrices */
export const CELL_ARRAYS_CODE = `# Cell Arrays - Vectores de Matrices
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
`;
