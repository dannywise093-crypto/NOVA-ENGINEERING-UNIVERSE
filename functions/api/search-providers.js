const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const timeout=(ms)=>AbortSignal.timeout(ms);
async function testProvider(name,configured,run){
 if(!configured)return {id:name,status:"not_configured",message:"Required server-side credentials are missing.",results:0};
 try{const r=await run();if(!r.ok)return {id:name,status:"failed",message:r.message||"Provider request failed.",results:0};return {id:name,status:"connected",message:"Test search succeeded.",results:r.count||0,example:r.example||null};}
 catch(e){return {id:name,status:"failed",message:e?.name==="TimeoutError"?"Provider test timed out.":"Provider request failed. Check credentials and provider settings.",results:0};}
}
export async function onRequestPost({request,env}){
 const origin=request.headers.get("Origin");const url=new URL(request.url);
 if(origin){try{if(new URL(origin).host!==url.host)return json({error:"Cross-origin request blocked."},403);}catch{return json({error:"Invalid origin."},403);}}
 let body={};try{body=await request.json();}catch{return json({error:"Send a JSON body."},400);}
 const query=String(body.query||"engineering technical documentation").trim().slice(0,180)||"engineering technical documentation";
 const providers=await Promise.all([
 testProvider("google",Boolean(env.GOOGLE_API_KEY&&env.GOOGLE_CSE_ID),async()=>{const u=new URL("https://www.googleapis.com/customsearch/v1");u.searchParams.set("key",env.GOOGLE_API_KEY);u.searchParams.set("cx",env.GOOGLE_CSE_ID);u.searchParams.set("q",query);const r=await fetch(u,{signal:timeout(8000)});const d=await r.json();if(!r.ok)return {ok:false,message:r.status===401||r.status===403?"Google rejected the credentials or API configuration.":"Google Search request failed ("+r.status+")."};const items=d.items||[];return {ok:true,count:items.length,example:items[0]?{title:items[0].title,url:items[0].link}:null};}),
 testProvider("bing",Boolean(env.BING_SEARCH_API_KEY),async()=>{const u=new URL("https://api.bing.microsoft.com/v7.0/search");u.searchParams.set("q",query);u.searchParams.set("count","3");const r=await fetch(u,{headers:{"Ocp-Apim-Subscription-Key":env.BING_SEARCH_API_KEY},signal:timeout(8000)});const d=await r.json().catch(()=>({}));if(!r.ok)return {ok:false,message:"Bing endpoint returned HTTP "+r.status+"; verify that your Microsoft search API subscription is supported."};const items=d.webPages?.value||[];return {ok:true,count:items.length,example:items[0]?{title:items[0].name,url:items[0].url}:null};}),
 testProvider("duckduckgo",true,async()=>{
  const apiUrl=new URL("https://api.duckduckgo.com/");
  apiUrl.searchParams.set("q",query);
  apiUrl.searchParams.set("format","json");
  apiUrl.searchParams.set("no_html","1");
  apiUrl.searchParams.set("skip_disambig","1");
  apiUrl.searchParams.set("t","novaengineeringuniverse");
  const r=await fetch(apiUrl,{headers:{"accept":"application/json"},signal:timeout(8000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)return {ok:false,message:"DuckDuckGo Instant Answer API returned HTTP "+r.status+"."};
  const items=[];
  const add=(title,url,text="")=>{
   if(typeof url==="string"&&/^https?:\/\//i.test(url)&&!items.some(x=>x.url===url)){
    items.push({title:String(title||text||"DuckDuckGo result").slice(0,200),url,snippet:String(text||"").slice(0,500)});
   }
  };
  if(d.AbstractText)add(d.Heading||d.AbstractSource,d.AbstractURL,d.AbstractText);
  if(typeof d.Answer==="string"&&d.Answer)add(d.Heading||"DuckDuckGo Instant Answer","https://duckduckgo.com/?q="+encodeURIComponent(query),d.Answer);
  if(d.Definition)add(d.DefinitionSource||"Definition",d.DefinitionURL,d.Definition);
  for(const x of (d.Results||[]))add(x.Text,x.FirstURL,x.Text);
  const flatten=(xs)=>{for(const x of xs||[]){if(x.Topics)flatten(x.Topics);else add(x.Text,x.FirstURL,x.Text);}};
  flatten(d.RelatedTopics);
  if(items.length)return {ok:true,count:items.length,example:{title:items[0].title,url:items[0].url},message:"DuckDuckGo Instant Answer API succeeded (limited answers, not full web search)."};
  const checkUrl=new URL("https://api.duckduckgo.com/");
  for(const [k,v] of Object.entries({q:"engineering",format:"json",no_html:"1",skip_disambig:"1",t:"novaengineeringuniverse"}))checkUrl.searchParams.set(k,v);
  const check=await fetch(checkUrl,{headers:{"accept":"application/json"},signal:timeout(8000)});
  if(!check.ok)return {ok:false,message:"DuckDuckGo Instant Answer API returned HTTP "+check.status+"."};
  const checkData=await check.json().catch(()=>({}));
  const checkItems=[];
  if(checkData.AbstractText&&checkData.AbstractURL)checkItems.push({title:checkData.Heading||"Engineering",url:checkData.AbstractURL});
  for(const x of checkData.Results||[])if(x.FirstURL)checkItems.push({title:x.Text||"Engineering",url:x.FirstURL});
  return {ok:true,count:checkItems.length,example:checkItems[0]||null,message:checkItems.length?"DuckDuckGo Instant Answer API is reachable; this query had no instant answer.":"DuckDuckGo Instant Answer API is reachable, but instant answers may be empty."};
}),
 testProvider("brave",Boolean(env.BRAVE_SEARCH_API_KEY),async()=>{const u=new URL("https://api.search.brave.com/res/v1/web/search");u.searchParams.set("q",query);u.searchParams.set("count","3");const r=await fetch(u,{headers:{"X-Subscription-Token":env.BRAVE_SEARCH_API_KEY,"Accept":"application/json"},signal:timeout(8000)});const d=await r.json().catch(()=>({}));if(!r.ok)return {ok:false,message:"Brave Search returned HTTP "+r.status+"; verify API key and plan."};const items=d.web?.results||[];return {ok:true,count:items.length,example:items[0]?{title:items[0].title,url:items[0].url}:null};}),
 testProvider("tavily",Boolean(env.TAVILY_API_KEY),async()=>{const r=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({api_key:env.TAVILY_API_KEY,query,max_results:3,search_depth:"basic"}),signal:timeout(8000)});const d=await r.json().catch(()=>({}));if(!r.ok)return {ok:false,message:"Tavily returned HTTP "+r.status+"; verify API key and plan."};const items=d.results||[];return {ok:items.length>0,count:items.length,example:items[0]?{title:items[0].title,url:items[0].url}:null,message:items.length?"":"No search results returned."};})
 ]);
 return json({testedAt:new Date().toISOString(),query,providers});
}
