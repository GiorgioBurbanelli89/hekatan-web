using System.Windows;

namespace Hekatan.Wpf
{
    public partial class JupyterProgressWindow : Window
    {
        public JupyterProgressWindow()
        {
            InitializeComponent();
        }

        public void UpdateMessage(string message)
        {
            Dispatcher.Invoke(() =>
            {
                // Separar el mensaje del tiempo
                if (message.Contains("(") && message.Contains(" ms)"))
                {
                    int startIndex = message.IndexOf("(");
                    int endIndex = message.IndexOf(" ms)");
                    string mainMessage = message.Substring(0, startIndex).Trim();
                    string timeStr = message.Substring(startIndex + 1, endIndex - startIndex - 1);

                    MessageText.Text = mainMessage;
                    ElapsedTimeText.Text = timeStr + " ms";
                }
                else
                {
                    MessageText.Text = message;
                }
            });
        }
    }
}
