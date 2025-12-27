from __future__ import annotations

from pathlib import Path
from aiohttp import web
from server import PromptServer
import folder_paths

routes = PromptServer.instance.routes

MODEL_EXTS = (".safetensors", ".pt", ".ckpt", ".gguf")
IMG_EXTS = (".png", ".webp", ".jpg", ".jpeg")
VID_EXTS = (".mp4", ".webm")

SEARCH_TYPES = ("loras", "checkpoints", "unet", "diffusion_models")


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


def _resolve_model_anywhere(name: str) -> Path | None:
    has_ext = name.lower().endswith(MODEL_EXTS)

    for model_type in SEARCH_TYPES:
        full = folder_paths.get_full_path(model_type, name)
        if full is not None:
            return Path(full)

        if not has_ext:
            for ext in MODEL_EXTS:
                full = folder_paths.get_full_path(model_type, name + ext)
                if full is not None:
                    return Path(full)

    return None


async def _serve_preview_for_model_file(model_file: Path):
    for candidate in _candidate_paths_for_model(model_file):
        if candidate.exists():
            resp = web.FileResponse(
                path=str(candidate),
                headers={"Cache-Control": "no-store"},
            )
            resp.headers["Content-Type"] = _content_type_for(candidate)
            return resp

    return web.Response(status=204, headers={"Cache-Control": "no-store"})


@routes.get("/vslinx/model_preview")
async def vslinx_model_preview(request: web.Request):
    name = (request.query.get("name") or "").strip()
    if not name:
        raise web.HTTPBadRequest(text="Missing query parameter: name")

    name = _normalize_name(name)
    if not _is_safe_relpath(name):
        raise web.HTTPBadRequest(text="Invalid name")

    model_file = _resolve_model_anywhere(name)
    if model_file is None:
        return web.Response(status=204, headers={"Cache-Control": "no-store"})

    return await _serve_preview_for_model_file(model_file)
