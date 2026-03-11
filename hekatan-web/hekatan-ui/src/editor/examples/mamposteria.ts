/** Mamposteria — Puntal Diagonal (Aguiar) */
export const MAMPOSTERIA_CODE = `# Rigidez Lateral: Portico con Mamposteria
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
`;
