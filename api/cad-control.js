module.exports = async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8"); res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Use POST."});}
  const base=process.env.CAD_WORKER_URL, token=process.env.CAD_WORKER_TOKEN;
  if(!base||!token)return res.status(503).json({error:"FreeCAD worker is not connected yet. Configure CAD_WORKER_URL and CAD_WORKER_TOKEN in Vercel, then redeploy."});
  let body=req.body; if(typeof body==="string"){try{body=JSON.parse(body)}catch{return res.status(400).json({error:"Invalid JSON."})}}
  const scene=body&&body.scene; if(!scene||!Array.isArray(scene.objects)||scene.objects.length<1||scene.objects.length>30)return res.status(400).json({error:"Provide a scene containing 1–30 parts."});
  const allowed=new Set(["box","cylinder","sphere","cone","torus"]); const objects=scene.objects.filter(o=>o&&allowed.has(o.type)).slice(0,30);
  if(!objects.length)return res.status(400).json({error:"No supported geometry primitives found."});
  try{
    const upstream=await fetch(base.replace(/\/$/,"")+"/v1/build-step",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({scene:{units:"mm",objects}})});
    let data; try{data=await upstream.json()}catch{return res.status(502).json({error:"CAD worker returned an unreadable response."})}
    if(!upstream.ok)return res.status(upstream.status>=500?502:upstream.status).json({error:data.error||"FreeCAD worker failed."});
    if(typeof data.content_base64!=="string"||!/^[A-Za-z0-9+/=]+$/.test(data.content_base64))return res.status(502).json({error:"CAD worker returned invalid STEP data."});
    return res.status(200).json({filename:"engineering-universe.step",content_base64:data.content_base64,parts:Number(data.parts)||objects.length,format:"STEP",note:"Concept geometry only; not validated engineering."});
  }catch(e){console.error("CAD worker request failed",e&&e.message);return res.status(502).json({error:"Could not reach the configured FreeCAD worker. Check its HTTPS URL and network access."})}
}
