/** Vectores y Matrices con Unidades — formulas de ingenieria estructural */
export const UNITS_ENGINEERING_CODE = `# Vectores y Matrices - Ingenieria Estructural
> Formulas de concreto armado ACI con operador &

## 1. Propiedades de materiales
f'_c = 250 kgf/cm^2
fy = 4200 kgf/cm^2
Es = 2000000 kgf/cm^2
E_conc = (15100*sqrt(f'_c)) & kgf/cm^2

## 2. Modulo de ruptura y corte
fr = (2*sqrt(f'_c)) & kgf/cm^2
Vc_coef = (0.53*sqrt(f'_c)) & kgf/cm^2
props = [E_conc, fr, Vc_coef]
props & kgf/cm^2

## 3. Dimensiones de viga
b = 30 cm
h = 60 cm
d = 54 cm
rec = 6 cm
dims = [b, h, d, rec]
dims & mm

## 4. Cuantias ACI 318
> rho_min = 14/fy
rho_min = (14/fy) & kgf/cm^2
> rho_b = 0.85*beta1*f'c/fy * 6000/(6000+fy)
beta1 = 0.85
rho_b = (0.85*beta1*f'_c/fy*6000/(6000+fy)) & kgf/cm^2
rho_max = 0.75*rho_b
cuantias = [rho_min, rho_b, rho_max]

## 5. Areas de acero
As_min = (rho_min*b*d) & cm^2
As_b = (rho_b*b*d) & cm^2
As_max = (rho_max*b*d) & cm^2
areas = [As_min, As_b, As_max]
areas & cm^2

## 6. Momento resistente
> Mu = phi*As*fy*(d - a/2)
As = 12.5 cm^2
a = (As*fy/(0.85*f'_c*b)) & cm
Mu = (0.9*As*fy*(d - a/2)) & kgf*cm
Mu_tm = (Mu) & tonf*m
resultados_M = [a, Mu_tm]

## 7. Cortante ACI
> Vc = 0.53*sqrt(f'c)*b*d
Vc = (0.53*sqrt(f'_c)*b*d) & kgf
Vc_ton = (Vc) & tonf
> phi*Vc
phi_Vc = (0.75*Vc) & tonf
cortantes = [Vc_ton, phi_Vc]
cortantes & tonf

## 8. Rigideces de resorte
k1 = 500 kN/m
k2 = 800 kN/m
k3 = 1200 kN/m
K_vec = [k1, k2, k3]
K_vec & N/m

## 9. Matriz de rigidez 2x2
K = [k1+k2, -k2; -k2, k2+k3]
K & kN/m
K & N/m

## 10. Sistema de fuerzas
F1 = 50 kN
F2 = 30 kN
F = [F1; F2]
F & N`;
