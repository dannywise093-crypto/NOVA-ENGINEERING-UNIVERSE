module.exports = async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8"); res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Use POST."});}
  const base=process.env.CAD_WORKER_URL,token=process.env.CAD_WORKER_TOKEN;
  if(!base||!token)return res.status(503).json({error:"Cascade Studio control is not connected yet. Configure CAD_WORKER_URL and CAD_WORKER_TOKEN in Vercel, then redeploy."});
  let body=req.body;if(typeof body==="string"){try{body=JSON.parse(body)}catch{return res.status(400).json({error:"Invalid JSON."})}}
  const scene=body&&body.scene;if(!scene||!Array.isArray(scene.objects)||scene.objects.length<1||scene.objects.length>30)return res.status(400).json({error:"Provide a scene containing 1–30 parts."});
  const allowed=new Set(["box","cylinder","sphere","cone"]);const objects=scene.objects.filter(o=>o&&allowed.has(o.type)).slice(0,30);
  if(!objects.length)return res.status(400).json({error:"Cascade bridge supports box, cylinder, sphere and cone primitives."});
  try{
    const upstream=await fetch(base.replace(/\/$/,"")+"/v1/cascade-run",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({scene:{units:"mm",objects}})});
    let data;try{data=await upstream.json()}catch{return res.status(502).json({error:"CAD worker returned an unreadable response."})}
    if(!upstream.ok)return res.status(upstream.status>=500?502:upstream.status).json({error:data.error||(data.result&&data.result.errors&&data.result.errors.join("\\n"))||"Cascade Studio execution failed.",details:data.result||null,code:data.code||null});
    return res.status(200).json({success:true,engine:data.engine,code:data.code,result:data.result,note:data.note});
  }catch(e){console.error("Cascade worker request failed",e&&e.message);return res.status(502).json({error:"Could not reach the configured CAD worker. Check its HTTPS URL and network access."})}
}
