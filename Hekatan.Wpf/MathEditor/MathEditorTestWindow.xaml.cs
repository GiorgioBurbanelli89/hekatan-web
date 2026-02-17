using System.Windows;

namespace Hekatan.Wpf.MathEditor
{
    public partial class MathEditorTestWindow : Window
    {
        public MathEditorTestWindow()
        {
            InitializeComponent();
        }

        private void BtnGetCode_Click(object sender, RoutedEventArgs e)
        {
            var code = MathEditor.ToHekatan();
            OutputText.Text = $"Código Hekatan:\n{code}";
        }

        private void BtnClear_Click(object sender, RoutedEventArgs e)
        {
            MathEditor.FromHekatan("");
            OutputText.Text = "";
        }
    }
}
