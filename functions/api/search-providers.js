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
  const headers={
   "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
   "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
   "accept-language":"en-US,en;q=0.9",
   "referer":"https://duckduckgo.com/",
   "sec-fetch-dest":"document","sec-fetch-mode":"navigate","sec-fetch-site":"same-site"
  };
  const candidates=[
   "https://html.duckduckgo.com/html/?q="+encodeURIComponent(query),
   "https://lite.duckduckgo.com/lite/?q="+encodeURIComponent(query)
  ];
  let lastMessage="DuckDuckGo did not return parseable search results.";
  for(const endpoint of candidates){
   try{
    const r=await fetch(endpoint,{headers,redirect:"follow",signal:timeout(8000)});
    const html=await r.text();
    if(r.status===202||/challenge-form|anomaly-modal|captcha|select all squares/i.test(html)){
     lastMessage="DuckDuckGo returned an automated-request challenge. It does not provide an official full web-search API key; try again later or use a supported search API.";
     continue;
    }
    if(!r.ok){lastMessage="DuckDuckGo returned HTTP "+r.status+".";continue;}
const matches=[...html.matchAll(/<a\b[^>]*class=["'][^"']*(?:result__a|result-link)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const items=[];
    for(const m of matches){
     let href=m[1]||"";
     let title=(m[2]||"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/\s+/g," ").trim();
     if(href.startsWith("//"))href="https:"+href;
     const wrapped=href.match(/[?&](?:uddg|u)=([^&]+)/i);
     if(wrapped){try{href=decodeURIComponent(wrapped[1]);}catch{}}
     if(/^https?:\/\//i.test(href)&&title&&!items.some(x=>x.url===href))items.push({title,url:href});
     if(items.length>=3)break;
    }
    if(items.length)return {ok:true,count:items.length,example:items[0]};
    lastMessage="DuckDuckGo responded, but no search-result links could be parsed. Its page format may have changed or access may be restricted.";
   }catch(e){lastMessage=e?.name==="TimeoutError"?"DuckDuckGo search timed out.":"Could not reach DuckDuckGo search."}
  }
  return {ok:false,message:lastMessage};
}),
 testProvider("brave",Boolean(env.BRAVE_SEARCH_API_KEY),async()=>{const u=new URL("https://api.search.brave.com/res/v1/web/search");u.searchParams.set("q",query);u.searchParams.set("count","3");const r=await fetch(u,{headers:{"X-Subscription-Token":env.BRAVE_SEARCH_API_KEY,"Accept":"application/json"},signal:timeout(8000)});const d=await r.json().catch(()=>({}));if(!r.ok)return {ok:false,message:"Brave Search returned HTTP "+r.status+"; verify API key and plan."};const items=d.web?.results||[];return {ok:true,count:items.length,example:items[0]?{title:items[0].title,url:items[0].url}:null};}),
 testProvider("tavily",Boolean(env.TAVILY_API_KEY),async()=>{const r=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({api_key:env.TAVILY_API_KEY,query,max_results:3,search_depth:"basic"}),signal:timeout(8000)});const d=await r.json().catch(()=>({}));if(!r.ok)return {ok:false,message:"Tavily returned HTTP "+r.status+"; verify API key and plan."};const items=d.results||[];return {ok:items.length>0,count:items.length,example:items[0]?{title:items[0].title,url:items[0].url}:null,message:items.length?"":"No search results returned."};})
 ]);
 return json({testedAt:new Date().toISOString(),query,providers});
}
