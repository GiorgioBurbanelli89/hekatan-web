#include <cstdio>
#include <cmath>

int main() {
    // Variable
    double x = 2;
    // Funcion cuadratica
    double f_x = x*x + 1;
    // Evaluar
    double y = 3*x + 5;

    printf("=== Ejemplo basico ===\n");
    printf("x = %.4f\n", x);
    printf("f(x) = x^2 + 1 = %.4f\n", f_x);
    printf("y = 3*x + 5 = %.4f\n", y);

    // Ejemplo FEM
    double E = 35000000;
    double nu = 0.15;
    double t = 0.15;
    double D = E*t*t*t/(12.0*(1.0 - nu*nu));
    double kappa = 5.0/6.0;
    double G = E/(2.0*(1.0 + nu));

    printf("\n=== Ejemplo FEM ===\n");
    printf("E = %.2f\n", E);
    printf("nu = %.4f\n", nu);
    printf("t = %.4f\n", t);
    printf("D = E*t^3/(12*(1-nu^2)) = %.4f\n", D);
    printf("kappa = 5/6 = %.6f\n", kappa);
    printf("G = E/(2*(1+nu)) = %.2f\n", G);

    return 0;
}
