import os, json, tempfile, secrets, base64, math
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
try:
    import FreeCAD as App
    import Part
except Exception:
    App = None; Part = None
try:
    from playwright.sync_api import sync_playwright
except Exception:
    sync_playwright = None
TOKEN=os.environ.get("CAD_WORKER_TOKEN","")
HOST=os.environ.get("CAD_WORKER_HOST","0.0.0.0")
PORT=int(os.environ.get("PORT",os.environ.get("CAD_WORKER_PORT","8787")) )
ALLOWED={"box","cylinder","sphere","cone","torus"}
CASCADE_URL=os.environ.get("CASCADE_STUDIO_URL","https://zalo.github.io/CascadeStudio/")
def make_cascade_code(objects):
    lines=["// Generated from the validated Engineering Universe scene."]
    shapes=[]
    for i,item in enumerate(objects):
        kind=item.get("type")
        if kind not in {"box","cylinder","sphere","cone"}: continue
        d=item.get("dimensions") if isinstance(item.get("dimensions"),dict) else {}
        w=num(d.get("width",30),30,1,2000); h=num(d.get("height",30),30,1,2000); dep=num(d.get("depth",30),30,1,2000)
        if kind=="box": expr="Box(%s, %s, %s)"%(w,h,dep)
        elif kind=="cylinder": expr="Cylinder(%s, %s)"%(max(w,dep)/2,h)
        elif kind=="sphere": expr="Sphere(%s)"%(max(w,h,dep)/2)
        else: expr="Cone(%s, 0.5, %s)"%(max(w,dep)/2,h)
        x,y,z=vec(item.get("position")); rx,ry,rz=vec(item.get("rotation"))
        expr="Translate([%s,%s,%s], %s)"%(x,y,z,expr)
        if rx: expr="Rotate([1,0,0], %s, %s)"%(rx,expr)
        if ry: expr="Rotate([0,1,0], %s, %s)"%(ry,expr)
        if rz: expr="Rotate([0,0,1], %s, %s)"%(rz,expr)
        name="part%d"%(i+1)
        lines.append("let %s = %s;"%(name,expr)); shapes.append(name)
    if not shapes: raise ValueError("Cascade bridge supports box, cylinder, sphere and cone; use FreeCAD for torus parts.")
    lines.append("Union([%s]);"%(", ".join(shapes)))
    return "\n".join(lines)
def num(v, default=0, low=-5000, high=5000):
    try: x=float(v)
    except (TypeError,ValueError): x=default
    return max(low,min(high,x))
def vec(v):
    return tuple(num(v[i]) for i in range(3)) if isinstance(v,list) and len(v)>=3 else (0,0,0)
def make_shape(item):
    d=item.get("dimensions") if isinstance(item.get("dimensions"),dict) else {}
    w=num(d.get("width",30),30,1,2000); h=num(d.get("height",30),30,1,2000); dep=num(d.get("depth",30),30,1,2000)
    kind=item["type"]
    if kind=="box": shape=Part.makeBox(w,dep,h)
    elif kind=="cylinder": shape=Part.makeCylinder(max(w,dep)/2,h)
    elif kind=="sphere": shape=Part.makeSphere(max(w,h,dep)/2)
    elif kind=="cone": shape=Part.makeCone(max(w,dep)/2,0.5,h)
    elif kind=="torus": shape=Part.makeTorus(max(w,dep)/2,max(1,min(w,h,dep)*0.12))
    else: raise ValueError("Unsupported primitive")
    x,y,z=vec(item.get("position")); rx,ry,rz=vec(item.get("rotation"))
    shape.translate(App.Vector(x,y,z))
    shape.rotate(App.Vector(x,y,z),App.Vector(1,0,0),rx)
    shape.rotate(App.Vector(x,y,z),App.Vector(0,1,0),ry)
    shape.rotate(App.Vector(x,y,z),App.Vector(0,0,1),rz)
    return shape
def simulate_beam(params):
    """Run a bounded Euler-Bernoulli cantilever calculation with SI inputs."""
    if not isinstance(params,dict):
        raise ValueError("params must be an object.")
    def bounded(key,low,high):
        value=params.get(key)
        if isinstance(value,bool) or not isinstance(value,(int,float)):
            raise ValueError(key+" must be a number.")
        value=float(value)
        if not (math.isfinite(value) and low<=value<=high):
            raise ValueError(key+" is outside the supported range.")
        return value
    length_m=bounded("lengthM",0.001,10)
    force_n=bounded("forceN",0,1000000)
    modulus=bounded("elasticModulusPa",1000000,1000000000000)
    inertia=bounded("secondMomentOfAreaM4",1e-12,1)
    section=bounded("sectionModulusM3",1e-12,1)
    allowable=bounded("allowableStressPa",1,10000000000)
    deflection=force_n*length_m**3/(3*modulus*inertia)
    moment=force_n*length_m
    stress=moment/section
    fos=(allowable/stress) if stress>0 else None
    return {"ok":True,"status":"completed",
        "engine":"Euler-Bernoulli analytical beam model",
        "model":"Prismatic cantilever beam with a point load at its free end; linear-elastic, small-deflection assumptions.",
        "inputsSI":{"lengthM":length_m,"forceN":force_n,"elasticModulusPa":modulus,
            "secondMomentOfAreaM4":inertia,"sectionModulusM3":section,"allowableStressPa":allowable},
        "resultsSI":{"tipDeflectionM":deflection,"rootBendingMomentNm":moment,
            "rootBendingStressPa":stress,"factorOfSafetyAgainstSuppliedAllowable":fos},
        "equations":{"tipDeflection":"delta = F L^3 / (3 E I)","rootMoment":"M = F L",
            "maximumBendingStress":"sigma = M / Z","factorOfSafety":"FoS = allowable_stress / calculated_stress"},
        "validation":{"finiteResults":all(math.isfinite(v) for v in [deflection,moment,stress]),"units":"SI"},
        "limitations":["Analytical beam theory only; this is not finite-element analysis (FEA).",
            "Assumes a prismatic cantilever, end point load, linear elasticity, and small deflection.",
            "Does not cover fatigue, buckling, stress concentrations, joints, plasticity, or manufacturing defects.",
            "Independent engineering review is required before real-world use."]}

class Handler(BaseHTTPRequestHandler):
    def send_json(self,code,obj):
        raw=json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("X-Content-Type-Options","nosniff"); self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=="/health":
            ready=bool(TOKEN and App and Part and sync_playwright)
            self.send_json(200 if ready else 503,{"ok":ready,"freecad_available":bool(App and Part),"cascade_playwright_available":bool(sync_playwright),"token_configured":bool(TOKEN)})
        elif path=="/":
            self.send_json(200,{"service":"Engineering Universe CAD worker","status":"running","health":"/health","endpoints":["POST /v1/build-step","POST /v1/cascade-run","POST /v1/simulate-beam"]})
        else: self.send_json(404,{"error":"Not found"})
    def do_POST(self):
        path=urlsplit(self.path).path
        if path not in ("/v1/build-step","/v1/cascade-run","/v1/simulate-beam"): return self.send_json(404,{"error":"Not found"})
        if not TOKEN or not secrets.compare_digest(self.headers.get("Authorization",""),"Bearer "+TOKEN): return self.send_json(401,{"error":"Unauthorized"})
        try: length=int(self.headers.get("Content-Length","0"))
        except ValueError: return self.send_json(400,{"error":"Invalid content length"})
        if length<2 or length>256000: return self.send_json(413,{"error":"Request too large or empty"})
        doc=None
        try:
            payload=json.loads(self.rfile.read(length))
            if path=="/v1/simulate-beam":
                result=simulate_beam(payload.get("params",{}))
                self.send_json(200,result)
                return
            objects=payload.get("scene",{}).get("objects",[])
            if path=="/v1/cascade-run":
                if not sync_playwright: return self.send_json(503,{"error":"Playwright is not installed. Install Playwright and Chromium on this worker."})
                if not isinstance(objects,list) or not objects or len(objects)>30: raise ValueError("Provide 1–30 scene objects.")
                code=make_cascade_code(objects)
                with sync_playwright() as p:
                    browser=p.chromium.launch(headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
                    page=browser.new_page()
                    page.goto(CASCADE_URL,wait_until="domcontentloaded",timeout=60000)
                    page.wait_for_function("window.CascadeAPI && window.CascadeAPI.isReady && window.CascadeAPI.isReady()",timeout=90000)
                    result=page.evaluate("(code) => window.CascadeAPI.runCode(code)",code)
                    browser.close()
                success=bool(result and result.get("success"))
                self.send_json(200 if success else 422,{"success":success,"code":code,"result":result or {},"engine":"Cascade Studio / OpenCascade.js","note":"Executed in a headless Cascade Studio session; the separate embedded editor is not synchronized."})
                return
            if not App or not Part: return self.send_json(503,{"error":"FreeCAD Python modules are unavailable in this worker."})
            if not isinstance(objects,list) or not objects or len(objects)>30: raise ValueError("Provide 1–30 scene objects.")
            doc=App.newDocument("EngineeringUniverse"); made=[]
            for i,item in enumerate(objects):
                if not isinstance(item,dict) or item.get("type") not in ALLOWED: continue
                obj=doc.addObject("PartDesign::Feature","Part%02d"%(i+1)); obj.Label=str(item.get("name") or (item["type"]+" "+str(i+1)))[:80]; obj.Shape=make_shape(item); made.append(obj)
            if not made: raise ValueError("No supported parts were supplied.")
            doc.recompute()
            with tempfile.TemporaryDirectory() as tmp:
                path=os.path.join(tmp,"engineering-universe.step"); Part.export(made,path)
                with open(path,"rb") as fh: encoded=base64.b64encode(fh.read()).decode("ascii")
            self.send_json(200,{"filename":"engineering-universe.step","content_base64":encoded,"parts":len(made),"format":"STEP","units":"mm","note":"Concept geometry only; not validated engineering."})
        except ValueError as exc: self.send_json(400,{"error":str(exc)})
        except Exception: self.send_json(500,{"error":"CAD generation failed. Check worker logs and FreeCAD version."})
        finally:
            if doc is not None:
                try: App.closeDocument(doc.Name)
                except Exception: pass
    def log_message(self,fmt,*args): print("CAD worker:",fmt%args)
if __name__=="__main__":
    if not TOKEN: raise SystemExit("Set CAD_WORKER_TOKEN before starting.")
    print("Engineering Universe FreeCAD worker listening on",HOST,PORT)
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
