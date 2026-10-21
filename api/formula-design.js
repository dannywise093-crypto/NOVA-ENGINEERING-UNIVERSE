const { researchEngineering } = require("./_engineering-research");

const MODES = {
  formula: "Explain the relevant engineering formula. Write it symbolically, define every variable and SI unit, explain when it applies, state assumptions and limits, and include a short example when useful.",
  calculate: "Solve the engineering calculation step by step. List knowns and unknowns, convert units, choose the governing equation, show substitutions and arithmetic, check dimensions and reasonableness, and state uncertainty. If essential inputs are missing, ask for them instead of inventing values.",
  design: "Create a preliminary engineering design package: requirements and constraints; explicit assumptions; dimensioned parameter table with units and clearly marked illustrative placeholders; concept and component layout; governing equations; preliminary material/manufacturing options; validation and failure-mode checklist; and next steps. Include a valid OpenSCAD starter model only when appropriate. Never claim the design is validated or certified.",
  review: "Perform a preliminary design review: summarize intended function, identify missing requirements and assumptions, list plausible failure modes and hazards, equations or analyses needed, relevant standards bodies to investigate without inventing citations, verification tests, and limitations. Do not certify safety or code compliance."
};
module.exports = async function handler(req,res) {
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Use POST."});}
  let body=req.body;
  if(typeof body==="string"){try{body=JSON.parse(body)}catch{return res.status(400).json({error:"Request body must be valid JSON."});}}
  const task=String(body&&body.task||"").trim();
  const requestedMode=String(body&&body.mode||"formula");
  if(!Object.prototype.hasOwnProperty.call(MODES,requestedMode))return res.status(400).json({error:"Choose a supported task type."});
  const broadProjectIntent=/\b(i want to|i need to|help me|lets|let's|want to|need to)\b.{0,100}\b(build|create|develop|invent|engineer|design)\b|\b(build|create|develop|invent|design)\b.{0,100}\b(engine|supercar|super car|powertrain|vehicle|robot|aircraft|device|machine)\b/i.test(task);
  const isSupercarProject=/\b(super.?car|supercar)\b.{0,80}\b(engine|powertrain)\b|\b(engine|powertrain)\b.{0,80}\b(super.?car|supercar)\b/i.test(task);
  const mode=broadProjectIntent && requestedMode==="formula" ? "design" : requestedMode;
  if(task.length<8)return res.status(400).json({error:"Describe the engineering task in at least 8 characters."});
  if(task.length>8000)return res.status(413).json({error:"Keep the task under 8,000 characters."});
  const key=process.env.GROQ_API_KEY_5||process.env.GROQ_API_KEY;
  if(!key)return res.status(503).json({error:"GROQ_API_KEY_5 is missing from Vercel Production. Add the key in Project Settings → Environment Variables, then redeploy."});
  const researchTask = isSupercarProject ? "future supercar powertrain architecture comparison: high-performance combustion engines, hybrid powertrains, electric motors, thermal management, efficiency, materials, reliability, emissions, vehicle integration, and validation" : task;
  const research = await researchEngineering(researchTask, "general engineering");
  const sourceContext = research.sources.length ? research.sources.map((s,i)=>(i+1)+". "+s.title+(s.year?" ("+s.year+")":"")+" — "+s.url+(s.venue?" — "+s.venue:"")+(s.abstract?" — Abstract/summary: "+s.abstract:"")+(s.openAccessUrl?" — Open-access full-text link: "+s.openAccessUrl:"")).join("\n") : "No usable scholarly records were returned by the available public indexes for this query.";
  const system="You are Engineering Formula & Design AI, a specialized engineering assistant in NOVA Engineering Universe. Your purpose is to explain engineering formulas, solve well-specified calculations, create preliminary design concepts, and review engineering assumptions. For broad goals, act as an engineering project planner rather than returning only generic formulas. Compare plausible architectures before selecting one, state trade-offs and unknowns, ask a short prioritized set of clarifying questions when requirements materially affect the answer, and provide a staged plan covering requirements, evidence review, concept comparison, calculations, components/materials, CAD-ready outputs, simulation/validation, risks, manufacturing/cost, and next decisions. Include a compact project state (objective, stage, assumptions, open questions, provisional decisions, next action) so the user can continue in later requests. For a future supercar engine request, compare combustion, hybrid, and fully electric powertrain architectures first; explain that an electric powertrain is not a combustion engine, and recommend a direction only provisionally based on explicit targets. Be rigorous, practical, and transparent. Define variables and units, show calculations clearly, and distinguish known values from assumptions or illustrative placeholders. Use supplied live research results as leads, not proof: do not claim a source was read in full unless full text was retrieved, and never invent inputs, test results, sources, citations, code compliance, simulations, or material properties. If evidence is insufficient or no useful material is found, say so plainly and suggest what evidence or tests are needed. You cannot physically test materials or operate external CAD/simulation tools unless a real integration performs that operation and returns results. Do not pretend otherwise. This is not a certified engineering service; safety-critical work requires independent analysis and qualified professional review. Respond with clear headings and readable equations.";
  const projectGuidance = broadProjectIntent ? "\n\nMANDATORY PROJECT-FIRST BEHAVIOR: Do useful work immediately; do not stop at a list of questions. Start with a preliminary project brief and compare feasible architectures using available evidence. Label assumptions and unknowns. Give a staged roadmap, initial subsystem breakdown, research gaps, analyses/calculations needed, CAD/simulation requirements, validation plan, and one or two highest-priority questions at the end. For a supercar engine, compare combustion, hybrid, and fully electric powertrain options; explain that fully electric is a powertrain, not a combustion engine. Make only a provisional recommendation with stated criteria. Never imply a search result proves performance.\n" : "";
  const user="Task type: "+mode+" (UI requested: "+requestedMode+")\\nRequested method: "+MODES[mode]+"\\n\\nUser's engineering task:\\n"+task+projectGuidance+"\n\nLIVE PUBLIC RESEARCH SEARCH (retrieved for this request):\\n"+sourceContext+"\nResearch status: "+research.status+". "+research.note+"\nCompare candidate materials only when relevant and cite the supplied URLs. Clearly separate published data, estimates, and untested hypotheses. If no candidate can be supported, say that no verified option was found rather than guessing.";
  const models=[process.env.GROQ_MODEL||"openai/gpt-oss-20b","llama-3.3-70b-versatile"].filter((m,i,a)=>a.indexOf(m)===i);
  try{
    let lastStatus=502,lastProviderMessage="";
    for(const model of models){
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
      let response,data;
      try{
        response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({model,temperature:0.2,max_tokens:3000,messages:[{role:"system",content:system},{role:"user",content:user}]})});
        data=await response.json().catch(()=>null);
      }finally{clearTimeout(timer);}
      if(response&&response.ok){
        const message=data&&data.choices&&data.choices[0]&&data.choices[0].message;
        let answer=message&&message.content;
        if(Array.isArray(answer))answer=answer.map(p=>typeof p==="string"?p:(p&&(p.text||p.content)||"")).join("");
        if(typeof answer==="string"&&answer.trim())return res.status(200).json({ok:true,assistant:"formula-design-ai",mode,answer:answer.trim(),research,model});
        lastProviderMessage="The model returned an empty answer.";
      }else{
        lastStatus=response?response.status:502;
        const err=data&&data.error;lastProviderMessage=err&&typeof err.message==="string"?err.message:"";
        console.error("Formula-design Groq error",JSON.stringify({status:lastStatus,model,code:err&&err.code,message:lastProviderMessage}));
        if(lastStatus===401||lastStatus===403)return res.status(502).json({error:"Groq rejected GROQ_API_KEY_5. Check that the key is valid and enabled in Vercel Production."});
        if(lastStatus===429&&model!==models[models.length-1])continue;
      }
    }
    if(lastStatus===429)return res.status(503).json({error:"Groq quota or rate limit reached for both model attempts. Wait for the quota to reset or configure another valid key."});
    return res.status(502).json({error:"The AI provider did not return a usable answer. "+(lastProviderMessage||"Check model access and Vercel runtime logs.")});
  }catch(error){
    console.error("Formula-design endpoint failed",error&&error.message);
    return res.status(502).json({error:error&&error.name==="AbortError"?"The AI provider timed out. Please retry.":"Could not connect to the AI provider. Check the deployment and try again."});
  }
};
