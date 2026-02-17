using System;
using System.Diagnostics;
using System.Windows;

namespace Hekatan.Wpf
{
    /// <summary>
    /// Options for pasting images
    /// </summary>
    public enum PasteImageOption
    {
        Base64,
        LocalFile,
        Imgur
    }

    /// <summary>
    /// Dialog for selecting how to paste an image
    /// </summary>
    public partial class PasteImageDialog : Window
    {
        public PasteImageOption SelectedOption { get; private set; } = PasteImageOption.Base64;
        public string ImgurClientId { get; private set; } = string.Empty;

        public PasteImageDialog()
        {
            InitializeComponent();

            // Load saved Imgur Client-ID if available
            try
            {
                var savedClientId = Properties.Settings.Default.ImgurClientId;
                if (!string.IsNullOrEmpty(savedClientId))
                {
                    ImgurClientIdTextBox.Text = savedClientId;
                }
            }
            catch { }
        }

        private void RadioImgur_Checked(object sender, RoutedEventArgs e)
        {
            if (ImgurPanel != null)
                ImgurPanel.Visibility = Visibility.Visible;
        }

        private void RadioImgur_Unchecked(object sender, RoutedEventArgs e)
        {
            if (ImgurPanel != null)
                ImgurPanel.Visibility = Visibility.Collapsed;
        }

        private void ImgurRegisterLink_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Open Imgur API registration page
                Process.Start(new ProcessStartInfo
                {
                    FileName = "https://api.imgur.com/oauth2/addclient",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"No se pudo abrir el navegador:\n{ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void ImgurAppsLink_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Open Imgur API apps page where user can see their Client-ID
                // After registering, the Client-ID appears on this page
                Process.Start(new ProcessStartInfo
                {
                    FileName = "https://api.imgur.com/oauth2/addclient",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"No se pudo abrir el navegador:\n{ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void OkButton_Click(object sender, RoutedEventArgs e)
        {
            if (RadioBase64.IsChecked == true)
            {
                SelectedOption = PasteImageOption.Base64;
            }
            else if (RadioLocalFile.IsChecked == true)
            {
                SelectedOption = PasteImageOption.LocalFile;
            }
            else if (RadioImgur.IsChecked == true)
            {
                SelectedOption = PasteImageOption.Imgur;
                ImgurClientId = ImgurClientIdTextBox.Text.Trim();

                if (string.IsNullOrEmpty(ImgurClientId))
                {
                    MessageBox.Show(
                        "Por favor, ingrese su Client-ID de Imgur.\n\n" +
                        "Si no tiene uno, haga clic en el enlace para registrar una aplicación gratuita.",
                        "Client-ID requerido",
                        MessageBoxButton.OK, MessageBoxImage.Warning);
                    ImgurClientIdTextBox.Focus();
                    return;
                }

                // Save Client-ID for future use
                try
                {
                    Properties.Settings.Default.ImgurClientId = ImgurClientId;
                    Properties.Settings.Default.Save();
                }
                catch { }
            }

            DialogResult = true;
            Close();
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }
    }

    /// <summary>
    /// Converter for showing/hiding elements based on boolean value
    /// </summary>
    public class BoolToVisibilityConverter : System.Windows.Data.IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            return (value is bool b && b) ? Visibility.Visible : Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            return value is Visibility v && v == Visibility.Visible;
        }
    }
}
