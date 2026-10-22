export async function onRequestPost({ request, env }) {
  if (request.method !== "POST") return Response.json({error:"Use POST."},{status:405});
  let body = {};
  try { body = await request.json(); } catch {}
  const prompt = String(body.prompt || "").trim();
  if (prompt.length < 8) return Response.json({error:"Please provide a more detailed image prompt."},{status:400});
  if (prompt.length > 1800) return Response.json({error:"Image prompt is too long."},{status:413});
  const width = [768,1024].includes(Number(body.width)) ? Number(body.width) : 1024;
  const height = [768,1024].includes(Number(body.height)) ? Number(body.height) : 1024;
  const key = env.POLLINATIONS_API_KEY || env.POLLINATIONS_KEY;
  const url = key
    ? "https://gen.pollinations.ai/image/" + encodeURIComponent(prompt) + "?model=black-forest-labs%2Fflux.1-schnell&width="+width+"&height="+height+"&safe=true"
    : "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width="+width+"&height="+height+"&nologo=true&safe=true";
  try {
    const response = await fetch(url,{headers:key?{Authorization:"Bearer "+key,Accept:"image/*"}:{Accept:"image/*"},signal:AbortSignal.timeout(55000)});
    const type = response.headers.get("content-type") || "";
    if (response.ok && type.startsWith("image/")) return new Response(response.body,{headers:{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
    return Response.json({error:key?"Image provider failed. Check the POLLINATIONS_API_KEY Cloudflare secret.":"The no-key image provider is unavailable or rate-limited. A Pollinations API key may be required.",provider_status:response.status},{status:502});
  } catch (error) {
    return Response.json({error:error.name==="TimeoutError"?"Image generation timed out. Try a shorter prompt.":"Could not connect to the image provider."},{status:502});
  }
}
