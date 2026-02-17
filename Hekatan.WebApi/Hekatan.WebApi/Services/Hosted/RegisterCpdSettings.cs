using Hekatan.Document.Archive;
using Hekatan.WebApi.Services.Hekatan;
using Hekatan.WebApi.Services.Hosted.Base;
using Hekatan.WebApi.Utils.Hekatan;

namespace Hekatan.WebApi.Services.Hosted
{
    /// <summary>
    /// change the default cpd writer to web cpd writer
    /// </summary>
    /// <param name="writerSettings"></param>
    /// <param name="readerSettings"></param>
    public class RegisterCpdSettings(WebCpdWriterSettings writerSettings,WebCpdReaderSettings readerSettings) : IHostedServiceStartup
    {
        public int Order => 1;

        public async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            CpdWriterFactory.SetCpdWriterSettings(writerSettings);
            CpdReaderFactory.SetCpdReaderSettings(readerSettings);
        }
    }
}
