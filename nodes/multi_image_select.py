import os, json
from typing import List, Tuple
import numpy as np
from PIL import Image, ImageOps
import torch

try:
    from folder_paths import get_input_directory
except Exception:
    get_input_directory = None

IMG_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".ppm")

def _input_root() -> str:
    if get_input_directory:
        return os.path.abspath(get_input_directory())
    return os.path.abspath(os.path.join(os.getcwd(), "input"))

def _pil_to_tensor_bhwc(img: Image.Image) -> torch.Tensor:
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    arr = np.array(img, copy=False)
    if arr.ndim == 3 and arr.shape[2] == 4:
        arr = arr[:, :, :3]
    t = torch.from_numpy(arr.astype(np.float32) / 255.0)
    return t.unsqueeze(0)

def _resize_like(img: Image.Image, w: int, h: int) -> Image.Image:
    if img.size == (w, h):
        return img
    return img.resize((w, h), Image.LANCZOS)

def _parse_paths(s: str) -> List[str]:
    s = (s or "").strip()
    if not s:
        return []
    try:
        data = json.loads(s)
        if isinstance(data, list):
            return [str(x) for x in data]
    except Exception:
        pass
    return [line.strip() for line in s.splitlines() if line.strip()]

def _resolve_existing(rels: List[str]) -> Tuple[List[str], List[str]]:
    """
    Resolve relative paths against the input root, clamp to root,
    and keep only files that exist and have known image extensions.
    Returns (existing_abs_paths, missing_rel_paths).
    """
    root = os.path.abspath(_input_root()) + os.sep
    existing: List[str] = []
    missing: List[str] = []
    for rel in rels:
        ext_ok = os.path.splitext(rel)[1].lower() in IMG_EXTS
        abs_path = os.path.abspath(os.path.join(root, rel))
        in_root = abs_path.startswith(root)
        if not (ext_ok and in_root and os.path.isfile(abs_path)):
            missing.append(rel)
            continue
        existing.append(abs_path)
    return existing, missing

def _fail_if_needed(existing_count: int, missing: List[str], fail_if_empty: bool, node_name: str):
    if fail_if_empty and existing_count == 0:
        hint = ""
        if missing:
            if len(missing) <= 5:
                hint = " Missing: " + ", ".join(missing)
            else:
                hint = f" Missing {len(missing)} paths (first 5): " + ", ".join(missing[:5])
        raise RuntimeError(
            f"{node_name}: No valid images found. They may have been moved or deleted from the input folder.{hint}"
        )

class VSLinx_LoadSelectedImagesList:
    """
    Reads files listed in `selected_paths` (relative to ComfyUI input dir)
    and outputs an IMAGE **list** where each item is BHWC with B=1.
    """
    DESCRIPTION = "Provides a simple node with a “Select Images” button that lets you choose one or multiple images. After selection, the images are uploaded to your input folder in ComfyUI (the same behavior as the default Load Image node). The node also includes a preview of the selected images. The images are returned as an image list, allowing downstream nodes to process them one after another."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected_paths": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "Filled by the 'Select images' button (JSON array)."
                }),
                "fail_if_empty": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "load"
    CATEGORY = "vsLinx/image"

    def load(self, selected_paths: str = "", fail_if_empty: bool = True, **kwargs):
        if not selected_paths:
            selected_paths = kwargs.get("selected_paths", "")

        rels = _parse_paths(selected_paths)
        seen = set(); rels = [r for r in rels if not (r in seen or seen.add(r))]

        if not rels:
            _fail_if_needed(0, [], fail_if_empty, "Load (Multiple) Images (List)")
            return ([],)

        existing, missing = _resolve_existing(rels)
        _fail_if_needed(len(existing), missing, fail_if_empty, "Load (Multiple) Images (List)")

        images = []
        for abs_path in existing:
            try:
                img = Image.open(abs_path)
                images.append(_pil_to_tensor_bhwc(img))
            except Exception as e:
                print(f"[vsLinx_LoadSelectedImagesList] skip {abs_path}: {e}")

        if not images:
            _fail_if_needed(0, rels, fail_if_empty, "Load (Multiple) Images (List)")
            return ([],)

        return (images,)

class VSLinx_LoadSelectedImagesBatch:
    """
    Same as above, but returns a single **batched** IMAGE tensor (B, H, W, 3).
    All images are resized to the first image's size to ensure a valid batch.
    """
    DESCRIPTION = "Provides a simple node with a “Select Images” button that lets you choose one or multiple images. After selection, the images are uploaded to your input folder in ComfyUI (the same behavior as the default Load Image node). The node also includes a preview of the selected images. The images are returned as a batch, allowing downstream nodes to process them together."


    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected_paths": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "Filled by the 'Select images' button (JSON array)."
                }),
                "fail_if_empty": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "load_batch"
    CATEGORY = "vsLinx/image"

    def load_batch(self, selected_paths: str = "", fail_if_empty: bool = True, **kwargs):
        if not selected_paths:
            selected_paths = kwargs.get("selected_paths", "")

        rels = _parse_paths(selected_paths)
        seen = set(); rels = [r for r in rels if not (r in seen or seen.add(r))]

        if not rels:
            _fail_if_needed(0, [], fail_if_empty, "Load (Multiple) Images (Batch)")
            empty = torch.zeros((0, 64, 64, 3), dtype=torch.float32)
            return (empty,)

        existing, missing = _resolve_existing(rels)
        _fail_if_needed(len(existing), missing, fail_if_empty, "Load (Multiple) Images (Batch)")

        pil_images: List[Image.Image] = []
        for abs_path in existing:
            try:
                pil_images.append(Image.open(abs_path))
            except Exception as e:
                print(f"[vsLinx_LoadSelectedImagesBatch] skip {abs_path}: {e}")

        if not pil_images:
            _fail_if_needed(0, rels, fail_if_empty, "Load (Multiple) Images (Batch)")
            empty = torch.zeros((0, 64, 64, 3), dtype=torch.float32)
            return (empty,)

        W0, H0 = pil_images[0].size
        pil_images = [_resize_like(im, W0, H0) for im in pil_images]

        tensors = [_pil_to_tensor_bhwc(im) for im in pil_images]
        batch = torch.cat(tensors, dim=0)

        return (batch,)

NODE_CLASS_MAPPINGS = {
    "vsLinx_LoadSelectedImagesList": VSLinx_LoadSelectedImagesList,
    "vsLinx_LoadSelectedImagesBatch": VSLinx_LoadSelectedImagesBatch,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_LoadSelectedImagesList": "Load (Multiple) Images (List)",
    "vsLinx_LoadSelectedImagesBatch": "Load (Multiple) Images (Batch)",
}