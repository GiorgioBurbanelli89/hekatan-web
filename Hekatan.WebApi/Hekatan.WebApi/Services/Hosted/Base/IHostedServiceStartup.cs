using Hekatan.WebApi.Utils.Web.Service;

namespace Hekatan.WebApi.Services.Hosted.Base
{
    public interface IHostedServiceStartup : IScopedService<IHostedServiceStartup>
    {
        /// <summary>
        /// 优先级
        /// </summary>
        int Order { get; }

        Task ExecuteAsync(CancellationToken stoppingToken);
    }
}
