from __future__ import annotations

from pathlib import Path
from aiohttp import web
from server import PromptServer
import folder_paths

routes = PromptServer.instance.routes

MODEL_EXTS = (".safetensors", ".pt", ".ckpt")
IMG_EXTS = (".png", ".webp", ".jpg", ".jpeg")
VID_EXTS = (".mp4", ".webm")


def _normalize_name(name: str) -> str:
    name = name.replace("\\", "/").strip()
    while name.startswith("./"):
        name = name[2:]
    return name


def _is_safe_relpath(name: str) -> bool:
    if not name or name.startswith("/"):
        return False
    parts = [p for p in name.split("/") if p]
    if any(p == ".." for p in parts):
        return False
    return True


def _content_type_for(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".png":
        return "image/png"
    if ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    if ext == ".mp4":
        return "video/mp4"
    if ext == ".webm":
        return "video/webm"
    return "application/octet-stream"


def _candidate_paths_for_model(model_file: Path) -> list[Path]:
    """
    For model:
      .../loras/Sub/Name v1.0.safetensors

    Checks in same folder:
      Name v1.0.preview.(png|webp|jpg|jpeg|mp4|webm)
      Name v1.0.(png|webp|jpg|jpeg|mp4|webm)

    And optional folder convention:
      Name v1.0/preview.(png|...|mp4|webm)
    """
    parent = model_file.parent
    base_name = model_file.stem

    candidates: list[Path] = []

    for ext in (*IMG_EXTS, *VID_EXTS):
        candidates.append(parent / f"{base_name}.preview{ext}")

    for ext in (*IMG_EXTS, *VID_EXTS):
        candidates.append(parent / f"{base_name}{ext}")

    folder = parent / base_name
    for ext in (*IMG_EXTS, *VID_EXTS):
        candidates.append(folder / f"preview{ext}")

    return candidates


@routes.get("/vslinx/model_preview/lora")
async def vslinx_lora_preview(request: web.Request):
    name = (request.query.get("name") or "").strip()
    if not name:
        raise web.HTTPBadRequest(text="Missing query parameter: name")

    name = _normalize_name(name)
    if not _is_safe_relpath(name):
        raise web.HTTPBadRequest(text="Invalid name")

    full = folder_paths.get_full_path("loras", name)

    if full is None and not name.lower().endswith(MODEL_EXTS):
        for ext in MODEL_EXTS:
            full = folder_paths.get_full_path("loras", name + ext)
            if full is not None:
                break

    if full is None:
        raise web.HTTPNotFound(text="LoRA not found")

    model_file = Path(full)

    for candidate in _candidate_paths_for_model(model_file):
        if candidate.exists():
            resp = web.FileResponse(
                path=str(candidate),
                headers={"Cache-Control": "no-store"},
            )
            resp.headers["Content-Type"] = _content_type_for(candidate)
            return resp

    raise web.HTTPNotFound(text="Preview not found")
