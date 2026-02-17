using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;

namespace Hekatan.Wpf
{
    public partial class App : Application
    {
        private void App_Startup(object sender, StartupEventArgs e)
        {
            AppDomain.CurrentDomain.UnhandledException += AppDomain_UnhandledException;
        }

        private void AppDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            AppDomain.CurrentDomain.UnhandledException -= AppDomain_UnhandledException;
            ReportUnhandledExceptionAndClose((Exception)e.ExceptionObject);
        }

        private void Application_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
        {
            // Mark as handled to prevent app from closing automatically
            e.Handled = true;

            // Log the error
            System.Diagnostics.Debug.WriteLine($"[UNHANDLED EXCEPTION] {e.Exception.Message}\n{e.Exception.StackTrace}");

            // Check if this is an OutOfMemoryException or similar fatal error
            bool isFatalError = e.Exception is OutOfMemoryException ||
                               e.Exception is StackOverflowException ||
                               e.Exception is AccessViolationException;

            if (isFatalError)
            {
                DispatcherUnhandledException -= Application_DispatcherUnhandledException;
                ReportUnhandledExceptionAndClose(e.Exception);
            }
            else
            {
                // For non-fatal errors, show message and try to continue
                var result = MessageBox.Show(
                    $"Ocurrió un error:\n{e.Exception.Message}\n\n" +
                    "¿Desea cerrar la aplicación?\n" +
                    "(Seleccione 'No' para intentar continuar)",
                    "Hekatan Calc - Error",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Error);

                if (result == MessageBoxResult.Yes)
                {
                    DispatcherUnhandledException -= Application_DispatcherUnhandledException;
                    ReportUnhandledExceptionAndClose(e.Exception);
                }
                // If No, the app will try to continue
            }
        }

        private static void ReportUnhandledExceptionAndClose(Exception e)
        {
            try
            {
                MainWindow main = (MainWindow)Current.MainWindow;
                var logFileName = Path.ChangeExtension(Path.GetTempFileName(), ".txt");
                var message = GetMessage(e);
                if (main != null && main.IsSaved)
                {
                    message += AppMessages.ReportUnhandledExceptionAndClose_NoUnsavedData;
                }
                else if (main != null)
                {
                    message += AppMessages.ReportUnhandledExceptionAndClose_NoUnsavedData_RecoveryAttempted;
                    try
                    {
                        var tempFile = Path.ChangeExtension(Path.GetRandomFileName(), ".hcalc");
                        main.SaveStateAndRestart(tempFile);
                        message += AppMessages.NYourDataWasSavedBothToClipboardAndTempFile + tempFile;
                    }
                    catch
                    {
                        message += AppMessages.ReportUnhandledExceptionAndClose_UnsavedData_RecoveryFailed;
                    }
                }
                message += string.Format(AppMessages.ExceptionDetails, e);
                File.WriteAllText(logFileName, message);
                Task.Run(async () =>
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = logFileName,
                        UseShellExecute = true
                    });
                });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[ReportUnhandledExceptionAndClose] Error logging: {ex.Message}");
            }
            Application.Current.Shutdown();
        }

        private static string GetMessage(Exception e) =>
            string.Format(AppMessages.UnexpectedErrorOccurred, e.Message, e.Source);
    }
}