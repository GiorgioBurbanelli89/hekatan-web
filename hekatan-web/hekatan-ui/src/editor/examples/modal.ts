/** Analisis Modal — Eigenvalues/Eigenvectors via Eigen WASM */
export const MODAL_CODE = `# Analisis Modal - Eigen C++ (WASM)
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
`;
