/** Portico k{i} — rlaxinfi (Aguiar) */
export const PORTICO_CODE = `# Portico k{i} - Rigidez Lateral (Aguiar)
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
`;
