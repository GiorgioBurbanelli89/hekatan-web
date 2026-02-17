using Hekatan.WebApi.Controllers.Base;
using Hekatan.WebApi.Controllers.DTOs;
using Hekatan.WebApi.Models.Base;
using Hekatan.WebApi.Services.Token;
using Hekatan.WebApi.Utils.Encrypt;
using Hekatan.WebApi.Utils.Web.ResponseModel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using MongoDB.Driver.Linq;

namespace Hekatan.WebApi.Controllers
{
    public class UserController(
        ILogger<UserController> logger,
        MongoDBContext db,
        TokenService tokenService
    ) : ControllerBaseV1
    {
        /// <summary>
        /// sign in to get the token
        /// </summary>
        /// <returns></returns>
        [AllowAnonymous]
        [HttpPost("sign-in")]
        public async Task<ResponseResult<string>> SignIn([FromBody] SignInData data)
        {
            data.Validate();

            var passwordMd5 = data.Password.ToMD5();
            var existUser = await db
                .HekatanUsers.AsQueryable()
                .Where(x => x.Username == data.Username)
                .Where(x => x.Password == passwordMd5)
                .FirstOrDefaultAsync();

            if (existUser == null)
            {
                return string.Empty.ToFailResponse("username or password is incorrect");
            }

            var token = tokenService.CreateToken(data.Username, existUser);
            return token.ToSuccessResponse();
        }
    }
}
