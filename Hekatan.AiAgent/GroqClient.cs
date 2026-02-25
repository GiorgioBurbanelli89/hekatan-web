using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace Hekatan.AiAgent
{
    /// <summary>
    /// Cliente para la API de Groq (compatible con OpenAI API format)
    /// Soporta texto e imagenes (vision) para replicar dibujos
    /// </summary>
    public class GroqClient
    {
        private readonly HttpClient _httpClient;
        private const string API_URL = "https://api.groq.com/openai/v1/chat/completions";

        public string ApiKey { get; set; } = "";
        public string Model { get; set; } = "llama-3.3-70b-versatile";
        public double Temperature { get; set; } = 0.3; // Bajo para codigo preciso
        public int MaxTokens { get; set; } = 4096;

        public GroqClient()
        {
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromSeconds(120);
        }

        /// <summary>
        /// Envia un mensaje de texto con system prompt
        /// </summary>
        public async Task<string> SendTextAsync(string systemPrompt, string userMessage)
        {
            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {ApiKey}");

            var requestBody = new
            {
                model = Model,
                messages = new object[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = userMessage }
                },
                temperature = Temperature,
                max_tokens = MaxTokens
            };

            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync(API_URL, content);
            var responseJson = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                throw new Exception($"Groq API error ({response.StatusCode}): {responseJson}");

            using var doc = JsonDocument.Parse(responseJson);
            return doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";
        }

        /// <summary>
        /// Envia un mensaje con imagen (vision) para que la AI replique el dibujo
        /// Usa modelos con soporte vision: llama-3.2-90b-vision-preview, llama-3.2-11b-vision-preview
        /// </summary>
        public async Task<string> SendImageAsync(string systemPrompt, string userMessage, string base64Image, string mimeType = "image/png")
        {
            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {ApiKey}");

            // Para vision, usar modelo compatible (Llama 4 Scout)
            var visionModel = Model.Contains("scout") ? Model : "meta-llama/llama-4-scout-17b-16e-instruct";

            var requestBody = new
            {
                model = visionModel,
                messages = new object[]
                {
                    new { role = "system", content = systemPrompt },
                    new
                    {
                        role = "user",
                        content = new object[]
                        {
                            new { type = "text", text = userMessage },
                            new
                            {
                                type = "image_url",
                                image_url = new
                                {
                                    url = $"data:{mimeType};base64,{base64Image}"
                                }
                            }
                        }
                    }
                },
                temperature = Temperature,
                max_tokens = MaxTokens
            };

            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync(API_URL, content);
            var responseJson = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                throw new Exception($"Groq Vision API error ({response.StatusCode}): {responseJson}");

            using var doc = JsonDocument.Parse(responseJson);
            return doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";
        }
    }
}
