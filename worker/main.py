import base64
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="NOVA Engineering CAD and Simulation Worker", version="0.1.0")
JOB_ROOT = Path(os.environ.get("JOB_ROOT", "/tmp/engineering-jobs"))
JOB_ROOT.mkdir(parents=True, exist_ok=True)
MAX_REQUEST_BYTES = 12000
MAX_RUNTIME_SECONDS = 35


def authorize(authorization: str | None) -> None:
    expected = os.environ.get("ENGINEERING_WORKER_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Worker authentication token is not configured.")
    if authorization != "Bearer " + expected:
        raise HTTPException(status_code=401, detail="Unauthorized.")


def number(params: dict[str, Any], key: str, minimum: float, maximum: float) -> float:
    value = params.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise HTTPException(status_code=400, detail=f"{key} must be a number.")
    value = float(value)
    if not math.isfinite(value) or value < minimum or value > maximum:
        raise HTTPException(status_code=400, detail=f"{key} must be between {minimum} and {maximum}.")
    return value


@app.get("/health")
def health(authorization: str | None = Header(default=None)):
    authorize(authorization)
    freecad = shutil.which("freecadcmd") or shutil.which("FreeCADCmd") or shutil.which("freecad")
    calculix = shutil.which("ccx") or shutil.which("calculix-ccx")
    return {
        "ok": True,
        "service": "nova-engineering-worker",
        "version": "0.1.0",
        "capabilities": {
            "freecadCadExport": bool(freecad),
            "calculixExecutable": bool(calculix),
            "jobs": ["cad_box", "cantilever_beam"]
        },
        "notes": [
            "cad_box invokes FreeCAD to create a parametric box and export STEP/STL files.",
            "cantilever_beam runs a transparent Euler-Bernoulli analytical calculation, not finite-element analysis.",
            "A CalculiX executable being installed does not mean an FEA model has been executed."
        ]
    }


@app.post("/jobs")
async def run_job(request: Request, authorization: str | None = Header(default=None)):
    authorize(authorization)
    raw = await request.body()
    if len(raw) > MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="Request is too large.")
    try:
        payload = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request must be a JSON object.")
    job_type = payload.get("jobType")
    params = payload.get("params") or {}
    if not isinstance(params, dict):
        raise HTTPException(status_code=400, detail="params must be an object.")
    job_id = uuid.uuid4().hex
    job_dir = JOB_ROOT / job_id
    job_dir.mkdir(mode=0o700)
    started = time.time()
    try:
        if job_type == "cad_box":
            result = await create_box(job_dir, params)
        elif job_type == "cantilever_beam":
            result = calculate_cantilever(params)
        else:
            raise HTTPException(status_code=400, detail="Unsupported jobType.")
        result.update({"ok": True, "jobId": job_id, "jobType": job_type,
                       "executionSeconds": round(time.time() - started, 3)})
        return JSONResponse(result)
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except subprocess.TimeoutExpired:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=504, detail="CAD process exceeded its execution time limit.")
    except Exception as exc:
        # Do not return local paths or internal exception details to clients.
        print(f"job {job_id} failed: {type(exc).__name__}: {exc}", flush=True)
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="The engineering job failed. Check worker logs.")


async def create_box(job_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
    length = number(params, "lengthMm", 1, 2000)
    width = number(params, "widthMm", 1, 2000)
    height = number(params, "heightMm", 1, 2000)
    executable = shutil.which("freecadcmd") or shutil.which("FreeCADCmd") or shutil.which("freecad")
    if not executable:
        raise HTTPException(status_code=503, detail="FreeCAD command-line executable is unavailable.")
    step_path = job_dir / "model.step"
    stl_path = job_dir / "model.stl"
    fcstd_path = job_dir / "model.FCStd"
    macro_path = job_dir / "build_model.FCMacro"
    # Only numeric, range-checked parameters enter this fixed script; clients cannot submit code.
    macro_path.write_text(
        "import FreeCAD as App\n"
        "import Part\n"
        "import Mesh\n"
        f"doc = App.newDocument('NOVAModel')\n"
        f"shape = Part.makeBox({length!r}, {width!r}, {height!r})\n"
        "obj = doc.addObject('PartDesign::Feature', 'GeneratedBox')\n"
        "obj.Shape = shape\n"
        "doc.recompute()\n"
        f"Part.export([obj], {str(step_path)!r})\n"
        f"Mesh.export([obj], {str(stl_path)!r})\n"
        f"doc.saveAs({str(fcstd_path)!r})\n"
        "App.closeDocument(doc.Name)\n",
        encoding="utf-8"
    )
    process = subprocess.run(
        [executable, str(macro_path)],
        cwd=str(job_dir), capture_output=True, text=True,
        timeout=MAX_RUNTIME_SECONDS, check=False
    )
    if process.returncode != 0 or not step_path.exists() or not stl_path.exists():
        print("FreeCAD failure:", (process.stderr or process.stdout)[-4000:], flush=True)
        raise RuntimeError("FreeCAD did not produce expected model exports.")
    artifacts = {}
    for name, path in (("step", step_path), ("stl", stl_path), ("fcstd", fcstd_path)):
        if path.exists() and path.stat().st_size <= 2_000_000:
            artifacts[name] = {
                "filename": path.name,
                "mimeType": {"step": "model/step", "stl": "model/stl", "fcstd": "application/octet-stream"}[name],
                "base64": base64.b64encode(path.read_bytes()).decode("ascii")
            }
    return {
        "status": "completed",
        "engine": "FreeCAD",
        "model": {"type": "rectangular solid", "lengthMm": length, "widthMm": width, "heightMm": height},
        "artifacts": artifacts,
        "validation": {"stepExportCreated": step_path.exists(), "stlExportCreated": stl_path.exists(),
                       "fileSizesBytes": {name: path.stat().st_size for name, path in (("step", step_path), ("stl", stl_path))}},
        "limitations": ["This starter geometry is a simple rectangular solid, not an engine design.",
                        "File creation/export is not proof of structural or manufacturing suitability."]
    }


def calculate_cantilever(params: dict[str, Any]) -> dict[str, Any]:
    # Euler-Bernoulli beam model; SI units throughout.
    length = number(params, "lengthM", 0.001, 10)
    force = number(params, "forceN", 0, 1_000_000)
    elastic_modulus = number(params, "elasticModulusPa", 1_000_000, 1_000_000_000_000)
    second_moment = number(params, "secondMomentOfAreaM4", 1e-12, 1)
    section_modulus = number(params, "sectionModulusM3", 1e-12, 1)
    allowable_stress = number(params, "allowableStressPa", 1, 10_000_000_000)
    max_deflection = force * length**3 / (3 * elastic_modulus * second_moment)
    max_moment = force * length
    max_bending_stress = max_moment / section_modulus
    factor_of_safety = allowable_stress / max_bending_stress if max_bending_stress > 0 else None
    return {
        "status": "completed",
        "engine": "Euler-Bernoulli analytical beam model",
        "model": "Prismatic cantilever beam with a point load at its free end; linear-elastic, small-deflection assumptions.",
        "inputsSI": {"lengthM": length, "forceN": force, "elasticModulusPa": elastic_modulus,
                     "secondMomentOfAreaM4": second_moment, "sectionModulusM3": section_modulus,
                     "allowableStressPa": allowable_stress},
        "resultsSI": {"tipDeflectionM": max_deflection, "rootBendingMomentNm": max_moment,
                      "rootBendingStressPa": max_bending_stress, "factorOfSafetyAgainstSuppliedAllowable": factor_of_safety},
        "equations": {
            "tipDeflection": "delta = F L^3 / (3 E I)",
            "rootMoment": "M = F L",
            "maximumBendingStress": "sigma = M / Z",
            "factorOfSafety": "FoS = allowable_stress / calculated_stress"
        },
        "validation": {"finiteResults": all(math.isfinite(v) for v in [max_deflection, max_moment, max_bending_stress]),
                       "dimensionCheck": "SI inputs and outputs; dimensional consistency should be independently reviewed."},
        "limitations": ["This is analytical beam theory, not finite-element analysis (FEA).",
                        "It omits shear deformation, stress concentrations, fatigue, buckling, plasticity, joints, and manufacturing defects.",
                        "The supplied allowable stress must be justified for the actual material, temperature, environment, and load case.",
                        "Do not use this result alone for safety-critical decisions."]
    }
