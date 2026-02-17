// GridCanvas.cs - Canvas con rejilla visual tipo MathCad Prime
// Características:
// - Rejilla visible (líneas principales cada 50px, secundarias cada 10px)
// - Snap-to-grid opcional
// - Zoom 25%-400%
// - Reglas horizontales y verticales

using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace Hekatan.Wpf.MathcadPrimeEditor.Controls
{
    /// <summary>
    /// Canvas personalizado con rejilla visual tipo MathCad Prime
    /// </summary>
    public class GridCanvas : Canvas
    {
        // Propiedades de la rejilla
        public static readonly DependencyProperty ShowGridProperty =
            DependencyProperty.Register("ShowGrid", typeof(bool), typeof(GridCanvas),
                new FrameworkPropertyMetadata(true, FrameworkPropertyMetadataOptions.AffectsRender));

        public static readonly DependencyProperty GridSizeProperty =
            DependencyProperty.Register("GridSize", typeof(double), typeof(GridCanvas),
                new FrameworkPropertyMetadata(10.0, FrameworkPropertyMetadataOptions.AffectsRender));

        public static readonly DependencyProperty MajorGridSizeProperty =
            DependencyProperty.Register("MajorGridSize", typeof(double), typeof(GridCanvas),
                new FrameworkPropertyMetadata(50.0, FrameworkPropertyMetadataOptions.AffectsRender));

        public static readonly DependencyProperty SnapToGridProperty =
            DependencyProperty.Register("SnapToGrid", typeof(bool), typeof(GridCanvas),
                new PropertyMetadata(false));

        public static readonly DependencyProperty ZoomLevelProperty =
            DependencyProperty.Register("ZoomLevel", typeof(double), typeof(GridCanvas),
                new FrameworkPropertyMetadata(1.0, FrameworkPropertyMetadataOptions.AffectsRender,
                    OnZoomLevelChanged));

        /// <summary>
        /// Mostrar/ocultar rejilla
        /// </summary>
        public bool ShowGrid
        {
            get => (bool)GetValue(ShowGridProperty);
            set => SetValue(ShowGridProperty, value);
        }

        /// <summary>
        /// Tamaño de la rejilla secundaria (líneas delgadas)
        /// </summary>
        public double GridSize
        {
            get => (double)GetValue(GridSizeProperty);
            set => SetValue(GridSizeProperty, value);
        }

        /// <summary>
        /// Tamaño de la rejilla principal (líneas gruesas)
        /// </summary>
        public double MajorGridSize
        {
            get => (double)GetValue(MajorGridSizeProperty);
            set => SetValue(MajorGridSizeProperty, value);
        }

        /// <summary>
        /// Snap-to-grid al mover elementos
        /// </summary>
        public bool SnapToGrid
        {
            get => (bool)GetValue(SnapToGridProperty);
            set => SetValue(SnapToGridProperty, value);
        }

        /// <summary>
        /// Nivel de zoom (0.25 - 4.0)
        /// </summary>
        public double ZoomLevel
        {
            get => (double)GetValue(ZoomLevelProperty);
            set => SetValue(ZoomLevelProperty, Math.Clamp(value, 0.25, 4.0));
        }

        // Colores de la rejilla
        private readonly Brush _minorGridBrush = new SolidColorBrush(Color.FromRgb(0xEE, 0xEE, 0xEE));
        private readonly Brush _majorGridBrush = new SolidColorBrush(Color.FromRgb(0xCC, 0xCC, 0xCC));
        private readonly Pen _minorGridPen;
        private readonly Pen _majorGridPen;

        public GridCanvas()
        {
            _minorGridPen = new Pen(_minorGridBrush, 0.5);
            _majorGridPen = new Pen(_majorGridBrush, 1.0);

            _minorGridPen.Freeze();
            _majorGridPen.Freeze();

            // Fondo blanco
            Background = Brushes.White;
            ClipToBounds = true;
        }

        private static void OnZoomLevelChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        {
            if (d is GridCanvas canvas)
            {
                // Aplicar transformación de escala
                canvas.LayoutTransform = new ScaleTransform((double)e.NewValue, (double)e.NewValue);
            }
        }

        /// <summary>
        /// Ajusta un punto a la rejilla más cercana
        /// </summary>
        public Point SnapToGridPoint(Point point)
        {
            if (!SnapToGrid)
                return point;

            double gridSize = GridSize;
            double x = Math.Round(point.X / gridSize) * gridSize;
            double y = Math.Round(point.Y / gridSize) * gridSize;

            return new Point(x, y);
        }

        /// <summary>
        /// Renderiza la rejilla
        /// </summary>
        protected override void OnRender(DrawingContext dc)
        {
            base.OnRender(dc);

            if (!ShowGrid)
                return;

            double width = ActualWidth;
            double height = ActualHeight;

            if (width == 0 || height == 0)
                return;

            // Dibujar rejilla secundaria (líneas delgadas cada GridSize)
            double minorGrid = GridSize;
            for (double x = 0; x <= width; x += minorGrid)
            {
                dc.DrawLine(_minorGridPen, new Point(x, 0), new Point(x, height));
            }
            for (double y = 0; y <= height; y += minorGrid)
            {
                dc.DrawLine(_minorGridPen, new Point(0, y), new Point(width, y));
            }

            // Dibujar rejilla principal (líneas gruesas cada MajorGridSize)
            double majorGrid = MajorGridSize;
            for (double x = 0; x <= width; x += majorGrid)
            {
                dc.DrawLine(_majorGridPen, new Point(x, 0), new Point(x, height));
            }
            for (double y = 0; y <= height; y += majorGrid)
            {
                dc.DrawLine(_majorGridPen, new Point(0, y), new Point(width, y));
            }
        }
    }
}
