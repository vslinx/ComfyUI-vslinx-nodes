import os, json
from typing import List
import numpy as np
from PIL import Image, ImageOps
import torch

try:
    from comfy.utils import get_comfy_path
except Exception:
    get_comfy_path = None

IMG_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".ppm")

def _input_root() -> str:
    base = get_comfy_path() if get_comfy_path else os.getcwd()
    return os.path.join(base, "input")

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

class VSLinx_LoadSelectedImagesList:
    """
    Reads image files listed in `selected_paths` (relative to ComfyUI/input)
    and outputs an IMAGE **list** where each item is BHWC with B=1.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected_paths": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "Filled by the 'Pick images' button (JSON array)."
                }),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "load"
    CATEGORY = "vsLinx/image"

    @staticmethod
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

    def load(self, selected_paths: str = "", **kwargs):
        if not selected_paths:
            selected_paths = kwargs.get("selected_paths", "")

        rels = self._parse_paths(selected_paths)
        if not rels:
            return ([],) 

        root = os.path.abspath(_input_root()) + os.sep
        images = []
        for rel in rels:
            if os.path.splitext(rel)[1].lower() not in IMG_EXTS:
                continue
            abs_path = os.path.abspath(os.path.join(root, rel))
            if not abs_path.startswith(root) or not os.path.isfile(abs_path):
                continue
            try:
                img = Image.open(abs_path)
                images.append(_pil_to_tensor_bhwc(img))
            except Exception as e:
                print(f"[vsLinx_LoadSelectedImagesList] skip {rel}: {e}")

        return (images,)

class VSLinx_LoadSelectedImagesBatch:
    """
    Same as above, but returns a single **batched** IMAGE tensor (B, H, W, 3).
    All images are resized to the first image's size to ensure a valid batch.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected_paths": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "Filled by the 'Pick images' button (JSON array)."
                }),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "load_batch"
    CATEGORY = "vsLinx/image"

    @staticmethod
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

    def load_batch(self, selected_paths: str = "", **kwargs):
        if not selected_paths:
            selected_paths = kwargs.get("selected_paths", "")

        rels = self._parse_paths(selected_paths)
        if not rels:
            empty = torch.zeros((0, 64, 64, 3), dtype=torch.float32)
            return (empty,)

        root = os.path.abspath(_input_root()) + os.sep
        pil_images: List[Image.Image] = []
        for rel in rels:
            if os.path.splitext(rel)[1].lower() not in IMG_EXTS:
                continue
            abs_path = os.path.abspath(os.path.join(root, rel))
            if not abs_path.startswith(root) or not os.path.isfile(abs_path):
                continue
            try:
                pil_images.append(Image.open(abs_path))
            except Exception as e:
                print(f"[vsLinx_LoadSelectedImagesBatch] skip {rel}: {e}")

        if not pil_images:
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
    "vsLinx_LoadSelectedImagesList": "Load Selected Images (List)",
    "vsLinx_LoadSelectedImagesBatch": "Load Selected Images (Batch)"
}