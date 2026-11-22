export function aiServiceHeaders() {
  const token = process.env.AI_SERVICE_TOKEN?.trim();
  return token ? { "x-ai-service-token": token } : {};
}
