import os
import hashlib
import re
import numpy as np
import torch
from PIL import Image, ImageOps, ImageSequence

import folder_paths
import node_helpers
from aiohttp import web
from server import PromptServer

_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".tif"}
_ANNOTATION_RE = re.compile(r"\s*\[[^\]]+\]\s*$")


def _strip_annotation(value: str) -> str:
    """Strip ComfyUI folder annotation like ' [output]' from a widget value."""
    return _ANNOTATION_RE.sub("", value or "").strip()


def _list_output_images(include_subfolders=True):
    """List image files in the output directory, sorted by mtime descending (newest first)."""
    output_dir = folder_paths.get_output_directory()
    results = []

    if include_subfolders:
        for root, _dirs, files in os.walk(output_dir):
            for f in files:
                if os.path.splitext(f)[1].lower() not in _IMG_EXTS:
                    continue
                full = os.path.join(root, f)
                if not os.path.isfile(full):
                    continue
                rel = os.path.relpath(full, output_dir).replace("\\", "/")
                if rel.startswith("./"):
                    rel = rel[2:]
                try:
                    mtime = os.path.getmtime(full)
                except Exception:
                    mtime = 0
                results.append((rel, mtime))
    else:
        try:
            for f in os.listdir(output_dir):
                full = os.path.join(output_dir, f)
                if os.path.isfile(full) and os.path.splitext(f)[1].lower() in _IMG_EXTS:
                    try:
                        mtime = os.path.getmtime(full)
                    except Exception:
                        mtime = 0
                    results.append((f, mtime))
        except Exception:
            pass

    results.sort(key=lambda x: x[1], reverse=True)
    return [r[0] for r in results]


def _resolve_image_path(image: str) -> str:
    """Resolve an image widget value to an absolute file path.

    Handles ComfyUI folder annotations (e.g. 'file.png [output]') via
    folder_paths.get_annotated_filepath.  Clipspace paths (from the
    MaskEditor) live in the input directory; everything else defaults
    to the output directory.
    """
    clean = _strip_annotation(image)
    if clean.startswith("clipspace/"):
        return folder_paths.get_annotated_filepath(image, default_dir=folder_paths.get_input_directory())
    return folder_paths.get_annotated_filepath(image, default_dir=folder_paths.get_output_directory())


@PromptServer.instance.routes.get("/vslinx/output_images_list")
async def vslinx_output_images_list(request: web.Request):
    include_sub = request.rel_url.query.get("include_subfolders", "true").lower() in ("true", "1", "yes")
    try:
        files = _list_output_images(include_sub)
        return web.json_response({"files": files})
    except Exception as e:
        return web.json_response({"error": str(e), "files": []}, status=500)


def _make_black_image():
    """Create a 512x512 black image tensor and empty mask."""
    image = torch.zeros((1, 512, 512, 3), dtype=torch.float32)
    mask = torch.zeros((1, 512, 512), dtype=torch.float32)
    return (image, mask)


class VSLinx_LoadLastGeneratedImage:
    CATEGORY = "vsLinx/image"
    FUNCTION = "load_image"
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    DESCRIPTION = (
        "Load the last generated image from the output folder. "
        "Supports auto-refresh after generation, manual refresh, file upload, "
        "and subfolder inclusion. Falls back to a black 512x512 image if no image is available."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("STRING", {"default": ""}),
                "auto_refresh": ("BOOLEAN", {"default": True}),
            },
        }

    def load_image(self, image, auto_refresh):
        clean = _strip_annotation(image)

        if not clean or clean == "(None)":
            files = _list_output_images(include_subfolders=True)
            if files:
                image = files[0]
            else:
                return _make_black_image()

        # Pass the original value so folder annotations like [temp], [input],
        # [output] are resolved by ComfyUI (e.g. clipspace painted masks).
        image_path = _resolve_image_path(image)

        if not os.path.isfile(image_path):
            return _make_black_image()

        img = node_helpers.pillow(Image.open, image_path)
        output_images = []
        output_masks = []
        w, h = None, None

        for i in ImageSequence.Iterator(img):
            i = node_helpers.pillow(ImageOps.exif_transpose, i)

            if i.mode == "I":
                i = i.point(lambda x: x * (1 / 255))
            frame = i.convert("RGB")

            if len(output_images) == 0:
                w = frame.size[0]
                h = frame.size[1]

            if frame.size[0] != w or frame.size[1] != h:
                continue

            arr = np.array(frame).astype(np.float32) / 255.0
            tensor = torch.from_numpy(arr)[None,]

            if "A" in i.getbands():
                mask = np.array(i.getchannel("A")).astype(np.float32) / 255.0
                mask = 1.0 - torch.from_numpy(mask)
            elif i.mode == "P" and "transparency" in i.info:
                mask = np.array(i.convert("RGBA").getchannel("A")).astype(np.float32) / 255.0
                mask = 1.0 - torch.from_numpy(mask)
            else:
                mask = torch.zeros((h, w), dtype=torch.float32, device="cpu")

            output_images.append(tensor)
            output_masks.append(mask.unsqueeze(0))

            if img.format == "MPO":
                break

        if not output_images:
            return _make_black_image()

        if len(output_images) > 1:
            return (torch.cat(output_images, dim=0), torch.cat(output_masks, dim=0))
        return (output_images[0], output_masks[0])

    @classmethod
    def IS_CHANGED(cls, image, auto_refresh):
        clean = _strip_annotation(image)
        if not clean or clean == "(None)":
            return float("nan")

        image_path = _resolve_image_path(image)

        if not os.path.isfile(image_path):
            return float("nan")

        try:
            m = hashlib.sha256()
            with open(image_path, "rb") as f:
                m.update(f.read())
            return m.digest().hex()
        except Exception:
            return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, image, auto_refresh):
        return True


NODE_CLASS_MAPPINGS = {
    "vsLinx_LoadLastGeneratedImage": VSLinx_LoadLastGeneratedImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_LoadLastGeneratedImage": "Load Last Generated Image",
}
