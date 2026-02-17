using Hekatan.WebApi.Models.Base;

namespace Hekatan.WebApi.Models
{
    public class HekatanUserModel : MongoDoc
    {
        public string Username { get; set; }

        public string Password { get; set; }

        public List<string> Roles { get; set; } = [];
    }
}
