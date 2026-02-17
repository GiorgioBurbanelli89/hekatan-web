using System;
using System.Windows;

namespace Hekatan.Wpf.MiniWord
{
    /// <summary>
    /// Ventana contenedora para el visor MiniWord
    /// </summary>
    public partial class MiniWordWindow : Window
    {
        /// <summary>
        /// Evento que se dispara cuando el usuario quiere importar contenido a Hekatan
        /// </summary>
        public event EventHandler<ImportToHekatanEventArgs> ImportToHekatan;

        public MiniWordWindow()
        {
            InitializeComponent();
            WordViewer.ImportToHekatan += WordViewer_ImportToHekatan;
        }

        public MiniWordWindow(string filePath) : this()
        {
            if (!string.IsNullOrEmpty(filePath))
            {
                WordViewer.OpenDocument(filePath);
                Title = $"MiniWord - {System.IO.Path.GetFileName(filePath)}";
            }
        }

        private void WordViewer_ImportToHekatan(object sender, ImportToHekatanEventArgs e)
        {
            ImportToHekatan?.Invoke(this, e);
        }

        /// <summary>
        /// Abre un documento en el visor
        /// </summary>
        public void OpenDocument(string filePath)
        {
            WordViewer.OpenDocument(filePath);
            Title = $"MiniWord - {System.IO.Path.GetFileName(filePath)}";
        }
    }
}
