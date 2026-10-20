import os, json, tempfile, secrets, base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
try:
    import FreeCAD as App
    import Part
except Exception:
    App = None; Part = None
TOKEN=os.environ.get("CAD_WORKER_TOKEN","")
HOST=os.environ.get("CAD_WORKER_HOST","127.0.0.1")
PORT=int(os.environ.get("CAD_WORKER_PORT","8787"))
ALLOWED={"box","cylinder","sphere","cone","torus"}
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
class Handler(BaseHTTPRequestHandler):
    def send_json(self,code,obj):
        raw=json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_GET(self):
        if self.path=="/health": self.send_json(200,{"ok":bool(App and Part and TOKEN),"freecad_available":bool(App and Part),"token_configured":bool(TOKEN)})
        else: self.send_json(404,{"error":"Not found"})
    def do_POST(self):
        if self.path!="/v1/build-step": return self.send_json(404,{"error":"Not found"})
        if not TOKEN or not secrets.compare_digest(self.headers.get("Authorization",""),"Bearer "+TOKEN): return self.send_json(401,{"error":"Unauthorized"})
        if not App or not Part: return self.send_json(503,{"error":"FreeCAD Python modules are unavailable in this worker."})
        try: length=int(self.headers.get("Content-Length","0"))
        except ValueError: return self.send_json(400,{"error":"Invalid content length"})
        if length<2 or length>256000: return self.send_json(413,{"error":"Request too large or empty"})
        doc=None
        try:
            payload=json.loads(self.rfile.read(length)); objects=payload.get("scene",{}).get("objects",[])
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
