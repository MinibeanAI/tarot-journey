// GET /api/health —— 只返回已配置的服务商名称，不暴露任何 key
export async function onRequestGet({ env }) {
  const providers = [];
  if (env.DEEPSEEK_API_KEY) providers.push('deepseek');
  if (env.OPENAI_API_KEY) providers.push('openai');
  return new Response(JSON.stringify({ ok: true, providers, kv: !!env.TAROT_KV }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
