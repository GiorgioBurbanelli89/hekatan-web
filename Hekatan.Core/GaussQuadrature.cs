using System;

namespace Hekatan.Core
{
    /// <summary>
    /// Gauss-Legendre quadrature tables for numerical integration.
    /// Used by $gauss, $gauss2d, $gauss3d solver blocks for FEM applications.
    /// Integration domain: [-1, 1] per dimension.
    /// </summary>
    internal static class GaussQuadrature
    {
        // Gauss-Legendre points and weights for orders 1-10
        // Source: Abramowitz & Stegun, Table 25.4
        private static readonly double[][] Points =
        [
            // n=1: 1 point
            [0.0],
            // n=2: 2 points
            [-0.5773502691896258, 0.5773502691896258],
            // n=3: 3 points
            [-0.7745966692414834, 0.0, 0.7745966692414834],
            // n=4: 4 points
            [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526],
            // n=5: 5 points
            [-0.9061798459386640, -0.5384693101056831, 0.0, 0.5384693101056831, 0.9061798459386640],
            // n=6: 6 points
            [-0.9324695142031521, -0.6612093864662645, -0.2386191860831969,
              0.2386191860831969,  0.6612093864662645,  0.9324695142031521],
            // n=7: 7 points
            [-0.9491079123427585, -0.7415311855993945, -0.4058451513773972, 0.0,
              0.4058451513773972,  0.7415311855993945,  0.9491079123427585],
            // n=8: 8 points
            [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
              0.1834346424956498,  0.5255324099163290,  0.7966664774136267,  0.9602898564975363],
            // n=9: 9 points
            [-0.9681602395076261, -0.8360311073266358, -0.6133714327005904, -0.3242534234038089, 0.0,
              0.3242534234038089,  0.6133714327005904,  0.8360311073266358,  0.9681602395076261],
            // n=10: 10 points
            [-0.9739065285171717, -0.8650633666889845, -0.6794095682990244, -0.4333953941292472, -0.1488743389816312,
              0.1488743389816312,  0.4333953941292472,  0.6794095682990244,  0.8650633666889845,  0.9739065285171717],
        ];

        private static readonly double[][] Weights =
        [
            // n=1
            [2.0],
            // n=2
            [1.0, 1.0],
            // n=3
            [0.5555555555555556, 0.8888888888888888, 0.5555555555555556],
            // n=4
            [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538],
            // n=5
            [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891],
            // n=6
            [0.1713244923791704, 0.3607615730481386, 0.4679139345726910,
             0.4679139345726910, 0.3607615730481386, 0.1713244923791704],
            // n=7
            [0.1294849661688697, 0.2797053914892767, 0.3818300505051189, 0.4179591836734694,
             0.3818300505051189, 0.2797053914892767, 0.1294849661688697],
            // n=8
            [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
             0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763],
            // n=9
            [0.0812743883615744, 0.1806481606948574, 0.2606106964029354, 0.3123470770400029, 0.3302393550012598,
             0.3123470770400029, 0.2606106964029354, 0.1806481606948574, 0.0812743883615744],
            // n=10
            [0.0666713443086881, 0.1494513491505806, 0.2190863625159820, 0.2692667193099963, 0.2955242247147529,
             0.2955242247147529, 0.2692667193099963, 0.2190863625159820, 0.1494513491505806, 0.0666713443086881],
        ];

        /// <summary>
        /// Get Gauss-Legendre points and weights for given order (1-10).
        /// </summary>
        internal static (double[] points, double[] weights) GetGauss1D(int n)
        {
            if (n < 1) n = 1;
            if (n > 10) n = 10;
            return (Points[n - 1], Weights[n - 1]);
        }

        /// <summary>
        /// 1D Gauss-Legendre quadrature: ∫_{-1}^{1} f(ξ) dξ
        /// </summary>
        internal static double Integrate1D(Func<double, double> f, int n)
        {
            var (points, weights) = GetGauss1D(n);
            double sum = 0;
            for (int i = 0; i < n; i++)
                sum += weights[i] * f(points[i]);
            return sum;
        }

        /// <summary>
        /// 2D Gauss-Legendre quadrature (tensor product for quad elements):
        /// ∫∫_{[-1,1]²} f(ξ,η) dξ dη
        /// </summary>
        internal static double Integrate2DQuad(Func<double, double, double> f, int nx, int ny)
        {
            var (px, wx) = GetGauss1D(nx);
            var (py, wy) = GetGauss1D(ny);
            double sum = 0;
            for (int i = 0; i < nx; i++)
                for (int j = 0; j < ny; j++)
                    sum += wx[i] * wy[j] * f(px[i], py[j]);
            return sum;
        }

        /// <summary>
        /// 3D Gauss-Legendre quadrature (tensor product for hex elements):
        /// ∫∫∫_{[-1,1]³} f(ξ,η,ζ) dξ dη dζ
        /// </summary>
        internal static double Integrate3DHex(Func<double, double, double, double> f, int nx, int ny, int nz)
        {
            var (px, wx) = GetGauss1D(nx);
            var (py, wy) = GetGauss1D(ny);
            var (pz, wz) = GetGauss1D(nz);
            double sum = 0;
            for (int i = 0; i < nx; i++)
                for (int j = 0; j < ny; j++)
                    for (int k = 0; k < nz; k++)
                        sum += wx[i] * wy[j] * wz[k] * f(px[i], py[j], pz[k]);
            return sum;
        }
    }
}
