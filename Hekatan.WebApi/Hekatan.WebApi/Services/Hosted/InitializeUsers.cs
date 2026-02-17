using Hekatan.WebApi.Configs;
using Hekatan.WebApi.Models;
using Hekatan.WebApi.Models.Base;
using Hekatan.WebApi.Services.Hosted.Base;
using Hekatan.WebApi.Utils.Encrypt;
using MongoDB.Driver;

namespace Hekatan.WebApi.Services.Hosted
{
    /// <summary>
    /// init users from config
    /// </summary>
    public class InitializeUsers(AppSettings<UsersConfig> users, MongoDBContext db) : IHostedServiceStartup
    {
        public int Order => 0;

        public async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            var userModels = users.Value.Select(x => new HekatanUserModel()
            {
                Username = x.Username,
                Password = x.Password.ToMD5(),
                Roles = x.Roles,
            });

            foreach (var user in userModels)
            {
                await db.Collection<HekatanUserModel>().UpdateOneAsync(Builders<HekatanUserModel>.Filter.Eq(x => x.Username, user.Username), Builders<HekatanUserModel>.Update
                        .SetOnInsert(x => x.Username, user.Username)
                        .SetOnInsert(x => x.Password, user.Password)
                        .SetOnInsert(x => x.Roles, user.Roles),
                    new UpdateOptions() { IsUpsert = true },
                    stoppingToken
                );
            }
        }
    }
}
