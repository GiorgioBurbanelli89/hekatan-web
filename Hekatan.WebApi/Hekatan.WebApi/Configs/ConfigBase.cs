using Hekatan.WebApi.Utils.Web.Service;
using DocumentFormat.OpenXml.Office2010.PowerPoint;
using System.Text.RegularExpressions;

namespace Hekatan.WebApi.Configs
{
    /// <summary>
    /// automatically registered as singleton
    /// </summary>
    public class ConfigBase : ISingletonService
    {
        public ConfigBase(IConfiguration configuration)
        {
            IConfigurationHelper.BindConfig(configuration, this.GetType());
        }
    }
}
