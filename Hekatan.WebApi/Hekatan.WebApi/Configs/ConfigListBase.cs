using Hekatan.WebApi.Utils.Web.Service;

namespace Hekatan.WebApi.Configs
{
    public class ConfigListBase<T> : List<T>, ISingletonService where T : class, new()
    {
        public ConfigListBase(IConfiguration configuration)
        {
            IConfigurationHelper.BindConfig(configuration, this);
        }
    }
}
