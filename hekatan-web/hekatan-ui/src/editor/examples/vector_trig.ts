/** Vectores y Trigonometria — operaciones element-wise */
export const VECTOR_TRIG_CODE = `# Vectores y Trigonometria
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
`;
