// MathcadRegion.cs - Clase base para todas las regiones de MathCad Prime
// Representa una región posicionable en el canvas (text, math, image, plot)

using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace Hekatan.Wpf.MathcadPrimeEditor.Models
{
    /// <summary>
    /// Tipo de región MathCad
    /// </summary>
    public enum RegionType
    {
        Text,       // Texto/Comentario
        Math,       // Ecuación matemática
        Image,      // Imagen/Gráfico
        Plot        // Gráfico 2D/3D (futuro)
    }

    /// <summary>
    /// Clase base para todas las regiones de MathCad Prime
    /// </summary>
    public abstract class MathcadRegion
    {
        /// <summary>
        /// ID único de la región
        /// </summary>
        public string RegionId { get; set; }

        /// <summary>
        /// Tipo de región
        /// </summary>
        public RegionType Type { get; set; }

        /// <summary>
        /// Posición vertical (top) en puntos
        /// </summary>
        public double Top { get; set; }

        /// <summary>
        /// Posición horizontal (left) en puntos
        /// </summary>
        public double Left { get; set; }

        /// <summary>
        /// Ancho de la región
        /// </summary>
        public double Width { get; set; }

        /// <summary>
        /// Alto de la región
        /// </summary>
        public double Height { get; set; }

        /// <summary>
        /// Está seleccionada?
        /// </summary>
        public bool IsSelected { get; set; }

        /// <summary>
        /// Control visual asociado a esta región
        /// </summary>
        public Border VisualElement { get; protected set; }

        /// <summary>
        /// Contenedor del contenido de la región
        /// </summary>
        public FrameworkElement ContentElement { get; protected set; }

        /// <summary>
        /// Constructor base
        /// </summary>
        protected MathcadRegion(RegionType type)
        {
            Type = type;
            RegionId = Guid.NewGuid().ToString("N");

            // Crear el contenedor visual
            VisualElement = new Border
            {
                BorderThickness = new Thickness(1),
                BorderBrush = Brushes.Transparent,
                Background = new SolidColorBrush(Color.FromArgb(10, 0, 0, 0)),
                Cursor = Cursors.SizeAll
            };

            // Eventos para interacción
            VisualElement.MouseEnter += OnMouseEnter;
            VisualElement.MouseLeave += OnMouseLeave;
            VisualElement.MouseLeftButtonDown += OnMouseLeftButtonDown;
        }

        /// <summary>
        /// Crea el contenido visual de la región (implementado por subclases)
        /// </summary>
        public abstract FrameworkElement CreateContent();

        /// <summary>
        /// Actualiza la posición y tamaño del visual
        /// </summary>
        public virtual void UpdateVisual()
        {
            if (VisualElement == null)
                return;

            Canvas.SetLeft(VisualElement, Left);
            Canvas.SetTop(VisualElement, Top);
            VisualElement.Width = Width > 0 ? Width : double.NaN;
            VisualElement.Height = Height > 0 ? Height : double.NaN;
        }

        /// <summary>
        /// Selecciona/deselecciona la región
        /// </summary>
        public virtual void SetSelected(bool selected)
        {
            IsSelected = selected;

            if (VisualElement != null)
            {
                VisualElement.BorderBrush = selected
                    ? new SolidColorBrush(Color.FromRgb(0x19, 0x76, 0xD2))  // Azul MathCad
                    : Brushes.Transparent;
                VisualElement.BorderThickness = selected ? new Thickness(2) : new Thickness(1);
            }
        }

        /// <summary>
        /// Serializa la región a XML (para guardar en .mcdx)
        /// </summary>
        public abstract string ToXml();

        /// <summary>
        /// Eventos de mouse
        /// </summary>
        private void OnMouseEnter(object sender, MouseEventArgs e)
        {
            if (!IsSelected && VisualElement != null)
            {
                VisualElement.BorderBrush = new SolidColorBrush(Color.FromRgb(0xCC, 0xCC, 0xCC));
            }
        }

        private void OnMouseLeave(object sender, MouseEventArgs e)
        {
            if (!IsSelected && VisualElement != null)
            {
                VisualElement.BorderBrush = Brushes.Transparent;
            }
        }

        private void OnMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            SetSelected(true);
            e.Handled = true;
        }
    }

    /// <summary>
    /// Región de texto/comentario
    /// </summary>
    public class TextRegion : MathcadRegion
    {
        public string Text { get; set; }
        public string FontFamily { get; set; } = "Euclid";
        public double FontSize { get; set; } = 14.67;
        public bool IsBold { get; set; }
        public bool IsItalic { get; set; }
        public string BackgroundColor { get; set; } = "#00FFFFFF";  // Transparente

        public TextRegion() : base(RegionType.Text)
        {
        }

        public override FrameworkElement CreateContent()
        {
            var textBlock = new TextBlock
            {
                Text = Text ?? "",
                FontFamily = new FontFamily(FontFamily),
                FontSize = FontSize,
                FontWeight = IsBold ? FontWeights.Bold : FontWeights.Normal,
                FontStyle = IsItalic ? FontStyles.Italic : FontStyles.Normal,
                TextWrapping = TextWrapping.Wrap,
                Padding = new Thickness(5)
            };

            if (!string.IsNullOrEmpty(BackgroundColor) && BackgroundColor != "#00FFFFFF")
            {
                try
                {
                    textBlock.Background = (SolidColorBrush)new BrushConverter().ConvertFrom(BackgroundColor);
                }
                catch { }
            }

            ContentElement = textBlock;
            VisualElement.Child = textBlock;
            return textBlock;
        }

        public override string ToXml()
        {
            return $@"<region region-id=""{RegionId}"" top=""{Top}"" left=""{Left}"" width=""{Width}"">
    <text>{System.Security.SecurityElement.Escape(Text ?? "")}</text>
</region>";
        }
    }

    /// <summary>
    /// Región matemática (ecuación)
    /// </summary>
    public class MathRegion : MathcadRegion
    {
        public string MathContent { get; set; }  // Contenido MathML
        public string ResultRef { get; set; }
        public bool IsDefinition { get; set; }    // := vs =

        public MathRegion() : base(RegionType.Math)
        {
        }

        public override FrameworkElement CreateContent()
        {
            // Por ahora mostrar como texto
            // TODO: Renderizar MathML o usar editor matemático
            var textBlock = new TextBlock
            {
                Text = MathContent ?? "(ecuación)",
                FontFamily = new FontFamily("Cambria Math"),
                FontSize = 16,
                Padding = new Thickness(5),
                Background = new SolidColorBrush(Color.FromArgb(20, 33, 150, 243))
            };

            ContentElement = textBlock;
            VisualElement.Child = textBlock;
            return textBlock;
        }

        public override string ToXml()
        {
            var resultRef = ResultRef ?? "0";
            var mathContent = MathContent ?? "";
            return $@"<region region-id=""{RegionId}"" top=""{Top}"" left=""{Left}"">
    <math resultRef=""{resultRef}"">
        {mathContent}
    </math>
</region>";
        }
    }

    /// <summary>
    /// Región de imagen
    /// </summary>
    public class ImageRegion : MathcadRegion
    {
        public string ImagePath { get; set; }
        public byte[] ImageData { get; set; }

        public ImageRegion() : base(RegionType.Image)
        {
        }

        public override FrameworkElement CreateContent()
        {
            var image = new Image
            {
                Stretch = Stretch.Uniform
            };

            // TODO: Cargar imagen desde ImagePath o ImageData

            ContentElement = image;
            VisualElement.Child = image;
            return image;
        }

        public override string ToXml()
        {
            return $@"<region region-id=""{RegionId}"" top=""{Top}"" left=""{Left}"" width=""{Width}"" height=""{Height}"">
    <picture/>
</region>";
        }
    }
}
