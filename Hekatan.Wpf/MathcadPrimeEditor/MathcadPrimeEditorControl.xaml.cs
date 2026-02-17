// MathcadPrimeEditorControl.xaml.cs - Control principal del editor MathCad Prime
// Funcionalidad completa de edición de archivos .mcdx

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Xml.Linq;
using Microsoft.Win32;
using Hekatan.Wpf.MathcadPrimeEditor.Models;

namespace Hekatan.Wpf.MathcadPrimeEditor
{
    public partial class MathcadPrimeEditorControl : UserControl
    {
        private List<MathcadRegion> _regions = new List<MathcadRegion>();
        private string _currentFilePath = null;
        private bool _isModified = false;

        public MathcadPrimeEditorControl()
        {
            InitializeComponent();

            // Eventos del canvas
            MathcadCanvas.MouseMove += MathcadCanvas_MouseMove;
            MathcadCanvas.MouseLeftButtonDown += MathcadCanvas_MouseLeftButtonDown;

            // Atajos de teclado
            this.KeyDown += OnKeyDown;

            UpdateStatusBar();
        }

        #region Manejo de Archivos

        /// <summary>
        /// Nuevo documento
        /// </summary>
        private void NewButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isModified)
            {
                var result = MessageBox.Show("¿Guardar cambios?", "MathCad Prime",
                    MessageBoxButton.YesNoCancel, MessageBoxImage.Question);

                if (result == MessageBoxResult.Cancel)
                    return;
                if (result == MessageBoxResult.Yes)
                    SaveButton_Click(sender, e);
            }

            _regions.Clear();
            MathcadCanvas.Children.Clear();
            _currentFilePath = null;
            _isModified = false;
            UpdateStatusBar();
            StatusText.Text = "Nuevo documento creado";
        }

        /// <summary>
        /// Abrir archivo .mcdx
        /// </summary>
        private void OpenButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog
            {
                Filter = "MathCad Prime (*.mcdx)|*.mcdx|Todos los archivos (*.*)|*.*",
                Title = "Abrir archivo MathCad Prime"
            };

            if (dialog.ShowDialog() == true)
            {
                try
                {
                    LoadMcdxFile(dialog.FileName);
                    _currentFilePath = dialog.FileName;
                    _isModified = false;
                    StatusText.Text = $"Archivo abierto: {Path.GetFileName(dialog.FileName)}";
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Error al abrir archivo:\n{ex.Message}", "Error",
                        MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        /// <summary>
        /// Guardar archivo .mcdx
        /// </summary>
        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(_currentFilePath))
            {
                var dialog = new SaveFileDialog
                {
                    Filter = "MathCad Prime (*.mcdx)|*.mcdx",
                    Title = "Guardar archivo MathCad Prime",
                    DefaultExt = ".mcdx"
                };

                if (dialog.ShowDialog() != true)
                    return;

                _currentFilePath = dialog.FileName;
            }

            try
            {
                SaveMcdxFile(_currentFilePath);
                _isModified = false;
                StatusText.Text = $"Archivo guardado: {Path.GetFileName(_currentFilePath)}";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al guardar:\n{ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Carga un archivo .mcdx
        /// </summary>
        public void LoadMcdxFile(string filePath)
        {
            _regions.Clear();
            MathcadCanvas.Children.Clear();

            // Extraer ZIP a temporal
            string tempDir = Path.Combine(Path.GetTempPath(), "calcpad_mcdx_" + Guid.NewGuid().ToString("N"));
            ZipFile.ExtractToDirectory(filePath, tempDir);

            try
            {
                // Leer worksheet.xml
                string worksheetPath = Path.Combine(tempDir, "mathcad", "worksheet.xml");
                if (!File.Exists(worksheetPath))
                    throw new Exception("No se encontró worksheet.xml en el archivo .mcdx");

                XDocument doc = XDocument.Load(worksheetPath);
                XNamespace ws = "http://schemas.mathsoft.com/worksheet50";
                XNamespace ml = "http://schemas.mathsoft.com/math50";

                // Parsear regiones
                var regionsElement = doc.Root?.Element(ws + "regions");
                if (regionsElement == null)
                    return;

                foreach (var regionXml in regionsElement.Elements(ws + "region"))
                {
                    var region = ParseRegion(regionXml, ws, ml);
                    if (region != null)
                    {
                        AddRegionToCanvas(region);
                    }
                }

                UpdateStatusBar();
            }
            finally
            {
                // Limpiar temporal
                try { Directory.Delete(tempDir, true); } catch { }
            }
        }

        /// <summary>
        /// Parsea una región desde XML
        /// </summary>
        private MathcadRegion ParseRegion(XElement regionXml, XNamespace ws, XNamespace ml)
        {
            string regionId = regionXml.Attribute("region-id")?.Value;
            double top = double.Parse(regionXml.Attribute("top")?.Value ?? "0");
            double left = double.Parse(regionXml.Attribute("left")?.Value ?? "0");
            double width = double.Parse(regionXml.Attribute("width")?.Value ?? "0");
            double height = double.Parse(regionXml.Attribute("height")?.Value ?? "0");

            // Detectar tipo de región
            var textElement = regionXml.Element(ws + "text");
            var mathElement = regionXml.Element(ws + "math");
            var pictureElement = regionXml.Element(ws + "picture");

            if (textElement != null)
            {
                // Región de texto
                var textRegion = new TextRegion
                {
                    RegionId = regionId,
                    Top = top,
                    Left = left,
                    Width = width > 0 ? width : 300,
                    Height = height > 0 ? height : 50,
                    Text = ExtractTextFromFlowDocument(textElement)
                };
                return textRegion;
            }
            else if (mathElement != null)
            {
                // Región matemática
                var mathRegion = new MathRegion
                {
                    RegionId = regionId,
                    Top = top,
                    Left = left,
                    Width = width > 0 ? width : 200,
                    Height = height > 0 ? height : 50,
                    MathContent = mathElement.ToString(),
                    ResultRef = mathElement.Attribute("resultRef")?.Value
                };
                return mathRegion;
            }
            else if (pictureElement != null)
            {
                // Región de imagen
                var imageRegion = new ImageRegion
                {
                    RegionId = regionId,
                    Top = top,
                    Left = left,
                    Width = width,
                    Height = height
                };
                return imageRegion;
            }

            return null;
        }

        /// <summary>
        /// Extrae texto de FlowDocument (simplificado)
        /// </summary>
        private string ExtractTextFromFlowDocument(XElement textElement)
        {
            // TODO: Parsear FlowDocument XAML completo
            // Por ahora retornar texto simplificado
            return textElement.Value;
        }

        /// <summary>
        /// Guarda el documento como .mcdx
        /// </summary>
        private void SaveMcdxFile(string filePath)
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "calcpad_mcdx_save_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);

            try
            {
                // Crear estructura de directorios
                Directory.CreateDirectory(Path.Combine(tempDir, "mathcad"));
                Directory.CreateDirectory(Path.Combine(tempDir, "mathcad", "xaml"));
                Directory.CreateDirectory(Path.Combine(tempDir, "_rels"));
                Directory.CreateDirectory(Path.Combine(tempDir, "docProps"));

                // Generar worksheet.xml
                XNamespace ws = "http://schemas.mathsoft.com/worksheet50";
                var doc = new XDocument(
                    new XElement(ws + "worksheet",
                        new XAttribute("msg-id", "NoMessage"),
                        new XElement(ws + "regions",
                            _regions.Select(r => XElement.Parse(r.ToXml()))
                        )
                    )
                );

                string worksheetPath = Path.Combine(tempDir, "mathcad", "worksheet.xml");
                doc.Save(worksheetPath);

                // Crear archivos mínimos requeridos
                CreateMinimalMcdxStructure(tempDir);

                // Comprimir a ZIP (.mcdx)
                if (File.Exists(filePath))
                    File.Delete(filePath);

                ZipFile.CreateFromDirectory(tempDir, filePath);
            }
            finally
            {
                try { Directory.Delete(tempDir, true); } catch { }
            }
        }

        /// <summary>
        /// Crea estructura mínima de archivos .mcdx
        /// </summary>
        private void CreateMinimalMcdxStructure(string tempDir)
        {
            // [Content_Types].xml
            File.WriteAllText(Path.Combine(tempDir, "[Content_Types].xml"),
                @"<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>
<Types xmlns=""http://schemas.openxmlformats.org/package/2006/content-types"">
  <Default Extension=""xml"" ContentType=""application/xml""/>
  <Default Extension=""rels"" ContentType=""application/vnd.openxmlformats-package.relationships+xml""/>
</Types>");

            // _rels/.rels
            File.WriteAllText(Path.Combine(tempDir, "_rels", ".rels"),
                @"<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>
<Relationships xmlns=""http://schemas.openxmlformats.org/package/2006/relationships"">
  <Relationship Id=""rId1"" Type=""http://schemas.mathsoft.com/worksheet50"" Target=""mathcad/worksheet.xml""/>
</Relationships>");

            // docProps/core.xml
            File.WriteAllText(Path.Combine(tempDir, "docProps", "core.xml"),
                @"<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>
<cp:coreProperties xmlns:cp=""http://schemas.openxmlformats.org/package/2006/metadata/core-properties"">
  <dc:title xmlns:dc=""http://purl.org/dc/elements/1.1/"">Hekatan MathCad Document</dc:title>
  <dc:creator xmlns:dc=""http://purl.org/dc/elements/1.1/"">Hekatan</dc:creator>
</cp:coreProperties>");
        }

        #endregion

        #region Inserción de Regiones

        /// <summary>
        /// Insertar región de texto
        /// </summary>
        private void InsertTextButton_Click(object sender, RoutedEventArgs e)
        {
            var region = new TextRegion
            {
                Top = 50,
                Left = 50,
                Width = 400,
                Height = 50,
                Text = "Texto aquí..."
            };

            AddRegionToCanvas(region);
            _isModified = true;
            StatusText.Text = "Región de texto insertada";
        }

        /// <summary>
        /// Insertar región matemática
        /// </summary>
        private void InsertMathButton_Click(object sender, RoutedEventArgs e)
        {
            var region = new MathRegion
            {
                Top = 100,
                Left = 50,
                Width = 300,
                Height = 40,
                MathContent = "x := 0"
            };

            AddRegionToCanvas(region);
            _isModified = true;
            StatusText.Text = "Región matemática insertada";
        }

        /// <summary>
        /// Insertar imagen
        /// </summary>
        private void InsertImageButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog
            {
                Filter = "Imágenes (*.png;*.jpg;*.jpeg)|*.png;*.jpg;*.jpeg"
            };

            if (dialog.ShowDialog() == true)
            {
                var region = new ImageRegion
                {
                    Top = 150,
                    Left = 50,
                    Width = 300,
                    Height = 200,
                    ImagePath = dialog.FileName
                };

                AddRegionToCanvas(region);
                _isModified = true;
                StatusText.Text = "Imagen insertada";
            }
        }

        /// <summary>
        /// Agrega una región al canvas
        /// </summary>
        private void AddRegionToCanvas(MathcadRegion region)
        {
            region.CreateContent();
            region.UpdateVisual();

            _regions.Add(region);
            MathcadCanvas.Children.Add(region.VisualElement);

            UpdateStatusBar();
        }

        #endregion

        #region Vista y Zoom

        private void ShowGridCheckbox_CheckedChanged(object sender, RoutedEventArgs e)
        {
            MathcadCanvas.ShowGrid = ShowGridCheckbox.IsChecked == true;
        }

        private void SnapToGridCheckbox_CheckedChanged(object sender, RoutedEventArgs e)
        {
            MathcadCanvas.SnapToGrid = SnapToGridCheckbox.IsChecked == true;
        }

        private void ZoomInButton_Click(object sender, RoutedEventArgs e)
        {
            MathcadCanvas.ZoomLevel = Math.Min(MathcadCanvas.ZoomLevel + 0.25, 4.0);
            UpdateZoomText();
        }

        private void ZoomOutButton_Click(object sender, RoutedEventArgs e)
        {
            MathcadCanvas.ZoomLevel = Math.Max(MathcadCanvas.ZoomLevel - 0.25, 0.25);
            UpdateZoomText();
        }

        private void ZoomResetButton_Click(object sender, RoutedEventArgs e)
        {
            MathcadCanvas.ZoomLevel = 1.0;
            UpdateZoomText();
        }

        private void UpdateZoomText()
        {
            ZoomLevelText.Text = $"{MathcadCanvas.ZoomLevel * 100:F0}%";
        }

        #endregion

        #region Eventos del Canvas

        private void MathcadCanvas_MouseMove(object sender, MouseEventArgs e)
        {
            var pos = e.GetPosition(MathcadCanvas);
            PositionText.Text = $"X: {pos.X:F0}, Y: {pos.Y:F0}";
        }

        private void MathcadCanvas_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            // Deseleccionar todas las regiones
            foreach (var region in _regions)
            {
                region.SetSelected(false);
            }
        }

        #endregion

        #region Atajos de Teclado

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (Keyboard.Modifiers == ModifierKeys.Control)
            {
                switch (e.Key)
                {
                    case Key.N:
                        NewButton_Click(this, null);
                        e.Handled = true;
                        break;
                    case Key.O:
                        OpenButton_Click(this, null);
                        e.Handled = true;
                        break;
                    case Key.S:
                        SaveButton_Click(this, null);
                        e.Handled = true;
                        break;
                }
            }
        }

        #endregion

        #region Utilidades

        private void UpdateStatusBar()
        {
            RegionCountText.Text = $"Regiones: {_regions.Count}";
        }

        #endregion
    }
}
