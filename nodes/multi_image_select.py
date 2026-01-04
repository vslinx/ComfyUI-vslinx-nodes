import os
import json
import re
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
    Core Optimization: Prioritize using the actual file paths from the input directory over temporary paths passed from the frontend.
    """
    root = os.path.abspath(_input_root()) + os.sep
    existing: List[str] = []
    missing: List[str] = []
    
    # First, retrieve all valid images in the input directory (for matching actual paths).
    input_files = {}
    for file in os.listdir(root):
        if os.path.splitext(file)[1].lower() in IMG_EXTS:
            # Key: filename without extension (for matching), Value: actual absolute path
            input_files[os.path.splitext(file)[0].lower()] = os.path.join(root, file)

    for rel in rels:
        # Extract the filename (without extension) from the path passed to the frontend, used to match the actual file in the input directory.
        rel_basename = os.path.basename(rel)
        rel_name_noext = os.path.splitext(rel_basename)[0].lower()
        # Name after the cleaning system suffix (for fuzzy matching)
        rel_name_clean = re.sub(r'\s*\(\d+\)$', '', rel_name_noext)

        # Prioritize matching actual files in the input directory
        real_abs_path = None
        if rel_name_noext in input_files:
            real_abs_path = input_files[rel_name_noext]
        elif rel_name_clean in input_files:
            real_abs_path = input_files[rel_name_clean]
        else:
            # Fallback: Resolve according to the original logic.
            abs_path = os.path.abspath(os.path.join(root, rel))
            ext_ok = os.path.splitext(rel)[1].lower() in IMG_EXTS
            in_root = abs_path.startswith(root)
            if ext_ok and in_root and os.path.isfile(abs_path):
                real_abs_path = abs_path

        if real_abs_path:
            existing.append(real_abs_path)
        else:
            missing.append(rel)
    return existing, missing

def _clean_filename(filename: str, keep_legitimate_brackets: bool = True) -> str:
    """
    Precision Cleaning: Removes only the automatically added "(number)" suffix, preserving valid parentheses.
    - keep_legitimate_brackets=True：Retain as test(1).png → test(1), only clean up test (1).png → test
    """
    if keep_legitimate_brackets:
        # The regular expression only matches system suffixes ending with "space + (digit)" (e.g., "2 (2)" → "2", "test(1)" → "test(1)").
        clean_name = re.sub(r'\s+\(\d+\)$', '', filename)
    else:
        # Compatibility Mode: Remove all trailing (numbers) (Not recommended)
        clean_name = re.sub(r'\(\d+\)$', '', filename)
    return clean_name

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
    DESCRIPTION = "Provides a simple node with a “Select Images” button that lets you choose one or multiple images. After selection, the images are uploaded to your input folder in ComfyUI (the same behavior as the default Load Image node). The node also includes a preview of the selected images. The images are returned as an image list, allowing downstream nodes to process them one after another. Extra: Output filenames without extension."

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
            "optional": {
                "keep_legitimate_brackets": ("BOOLEAN", {"default": True}),  # New: Retain valid parentheses?
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("images", "filenames")
    OUTPUT_IS_LIST = (True, True)
    FUNCTION = "load"
    CATEGORY = "vsLinx/image"

    def load(self, selected_paths: str = "", fail_if_empty: bool = True, keep_legitimate_brackets: bool = True, **kwargs):
        if not selected_paths:
            selected_paths = kwargs.get("selected_paths", "")

        rels = _parse_paths(selected_paths)
        seen = set(); rels = [r for r in rels if not (r in seen or seen.add(r))]

        if not rels:
            _fail_if_needed(0, [], fail_if_empty, "Load (Multiple) Images (List)")
            return ([], [])

        existing, missing = _resolve_existing(rels)
        _fail_if_needed(len(existing), missing, fail_if_empty, "Load (Multiple) Images (List)")

        images = []
        filenames = []
        for abs_path in existing:
            try:
                img = Image.open(abs_path)
                images.append(_pil_to_tensor_bhwc(img))
                # Extract real files without extensions → Precisely clean system extensions
                raw_name = os.path.splitext(os.path.basename(abs_path))[0]
                clean_name = _clean_filename(raw_name, keep_legitimate_brackets)
                filenames.append(clean_name)
            except Exception as e:
                print(f"[vsLinx_LoadSelectedImagesList] skip {abs_path}: {e}")

        if not images:
            _fail_if_needed(0, rels, fail_if_empty, "Load (Multiple) Images (List)")
            return ([], [])

        return (images, filenames)

class VSLinx_LoadSelectedImagesBatch:
    DESCRIPTION = "Provides a simple node with a “Select Images” button that lets you choose one or multiple images. After selection, the images are uploaded to your input folder in ComfyUI (the same behavior as the default Load Image node). The node also includes a preview of the selected images. The images are returned as a batch, allowing downstream nodes to process them together. Extra: Output filenames without extension."

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
            "optional": {
                "keep_legitimate_brackets": ("BOOLEAN", {"default": True}),  # New: Retain valid parentheses?
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("images", "filenames")
    FUNCTION = "load_batch"
    CATEGORY = "vsLinx/image"

    def load_batch(self, selected_paths: str = "", fail_if_empty: bool = True, keep_legitimate_brackets: bool = True, **kwargs):
        if not selected_paths:
            selected_paths = kwargs.get("selected_paths", "")

        rels = _parse_paths(selected_paths)
        seen = set(); rels = [r for r in rels if not (r in seen or seen.add(r))]

        if not rels:
            _fail_if_needed(0, [], fail_if_empty, "Load (Multiple) Images (Batch)")
            empty = torch.zeros((0, 64, 64, 3), dtype=torch.float32)
            return (empty, "")

        existing, missing = _resolve_existing(rels)
        _fail_if_needed(len(existing), missing, fail_if_empty, "Load (Multiple) Images (Batch)")

        pil_images: List[Image.Image] = []
        filenames = []
        for abs_path in existing:
            try:
                pil_images.append(Image.open(abs_path))
                # Extract real files without extensions → Precisely clean system extensions
                raw_name = os.path.splitext(os.path.basename(abs_path))[0]
                clean_name = _clean_filename(raw_name, keep_legitimate_brackets)
                filenames.append(clean_name)
            except Exception as e:
                print(f"[vsLinx_LoadSelectedImagesBatch] skip {abs_path}: {e}")

        if not pil_images:
            _fail_if_needed(0, rels, fail_if_empty, "Load (Multiple) Images (Batch)")
            empty = torch.zeros((0, 64, 64, 3), dtype=torch.float32)
            return (empty, "")

        W0, H0 = pil_images[0].size
        pil_images = [_resize_like(im, W0, H0) for im in pil_images]

        tensors = [_pil_to_tensor_bhwc(im) for im in pil_images]
        batch = torch.cat(tensors, dim=0)

        filenames_str = ", ".join(filenames)

        return (batch, filenames_str)

NODE_CLASS_MAPPINGS = {
    "vsLinx_LoadSelectedImagesList": VSLinx_LoadSelectedImagesList,
    "vsLinx_LoadSelectedImagesBatch": VSLinx_LoadSelectedImagesBatch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_LoadSelectedImagesList": "Load (Multiple) Images (List)",
    "vsLinx_LoadSelectedImagesBatch": "Load (Multiple) Images (Batch)",
}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']