using System;
using System.Windows;

namespace Hekatan.Wpf.MiniExcel
{
    /// <summary>
    /// Ventana contenedora para el visor MiniExcel
    /// </summary>
    public partial class MiniExcelWindow : Window
    {
        /// <summary>
        /// Evento que se dispara cuando el usuario quiere importar contenido a Hekatan
        /// </summary>
        public event EventHandler<ExcelImportEventArgs> ImportToHekatan;

        public MiniExcelWindow()
        {
            InitializeComponent();
            ExcelViewer.ImportToHekatan += ExcelViewer_ImportToHekatan;
        }

        public MiniExcelWindow(string filePath) : this()
        {
            if (!string.IsNullOrEmpty(filePath))
            {
                ExcelViewer.OpenDocument(filePath);
                Title = $"MiniExcel - {System.IO.Path.GetFileName(filePath)}";
            }
        }

        private void ExcelViewer_ImportToHekatan(object sender, ExcelImportEventArgs e)
        {
            ImportToHekatan?.Invoke(this, e);
        }

        /// <summary>
        /// Abre un documento en el visor
        /// </summary>
        public void OpenDocument(string filePath)
        {
            ExcelViewer.OpenDocument(filePath);
            Title = $"MiniExcel - {System.IO.Path.GetFileName(filePath)}";
        }
    }
}
