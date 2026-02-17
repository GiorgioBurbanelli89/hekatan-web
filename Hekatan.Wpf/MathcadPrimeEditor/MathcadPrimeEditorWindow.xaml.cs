// MathcadPrimeEditorWindow.xaml.cs - Ventana standalone del editor MathCad Prime

using System.Windows;

namespace Hekatan.Wpf.MathcadPrimeEditor
{
    public partial class MathcadPrimeEditorWindow : Window
    {
        public MathcadPrimeEditorWindow()
        {
            InitializeComponent();
        }

        /// <summary>
        /// Constructor con archivo a abrir
        /// </summary>
        public MathcadPrimeEditorWindow(string filePath) : this()
        {
            if (!string.IsNullOrEmpty(filePath))
            {
                Loaded += (s, e) =>
                {
                    try
                    {
                        EditorControl.LoadMcdxFile(filePath);
                    }
                    catch (System.Exception ex)
                    {
                        MessageBox.Show($"Error al abrir archivo:\n{ex.Message}", "Error",
                            MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                };
            }
        }
    }
}
