/** Vectores con Unidades — conversion y operaciones */
export const UNITS_VECTORS_CODE = `# Vectores con Unidades
> Vectores con unidades fisicas, conversion y operaciones

## 1. Unidades iguales en vector
> Fuerzas en kN:
F_v = [[10 kN, 20 kN, 15 kN]]

## 2. Desplazamientos
d_v = [[5 mm, 10 mm, 3 mm]]

## 3. Unidades mixtas en vector
> Elementos con distintas unidades se convierten automaticamente:
z = [[5 mm, 3 tonf, 3 tonf/m^2]]

## 4. Conversion de unidades con &
> Convertir todo el vector a tonf/m^3:
z&tonf/m^3
`;
