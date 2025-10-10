from typing import List, Optional, Tuple
import numpy as np
from PIL import Image, ImageDraw
import torch

# -------------------- tensor <-> PIL helpers --------------------

def _image_tensor_to_pil_list(img: torch.Tensor) -> List[Image.Image]:
    """
    Convert ComfyUI IMAGE tensor [B,H,W,C] float32 in [0,1] to list of PIL images.
    Keeps alpha if present; most ops convert to RGB as needed.
    """
    if img.dim() != 4 or img.shape[-1] not in (1,3,4):
        raise ValueError("IMAGE must be [B,H,W,C] with C in {1,3,4}.")
    out = []
    for b in range(img.shape[0]):
        arr = img[b].detach().cpu().numpy()
        arr = np.clip(arr, 0.0, 1.0)
        arr = (arr * 255.0).astype(np.uint8)
        c = arr.shape[2]
        if c == 1:
            out.append(Image.fromarray(np.repeat(arr, 3, axis=2), mode="RGB"))
        elif c == 3:
            out.append(Image.fromarray(arr, mode="RGB"))
        else:  # 4
            out.append(Image.fromarray(arr, mode="RGBA"))
    return out

def _mask_any_to_pil_list(mask_like: torch.Tensor,
                          force_size: Optional[Tuple[int,int]] = None) -> List[Image.Image]:
    """
    Accept MASK in shapes:
      - [B,1,H,W] float/uint8 in [0..1] or [0..255]
      - [B,H,W]   float/uint8
      - [B,H,W,C] (IMAGE used as mask) -> luminance
    Return list of single-channel PIL "L" images in 0..255.
    """
    if mask_like.dim() == 4 and mask_like.shape[1] == 1:
        B, _, H, W = mask_like.shape
        out = []
        for i in range(B):
            arr = mask_like[i,0].detach().cpu().numpy()
            if arr.dtype != np.float32 and arr.dtype != np.float64:
                arr = arr.astype(np.float32)
            if arr.max() <= 1.0:
                arr = (arr * 255.0).clip(0,255)
            out.append(Image.fromarray(arr.astype(np.uint8), mode="L"))
        if force_size and out and out[0].size != force_size:
            out = [im.resize(force_size, Image.NEAREST) for im in out]
        return out

    if mask_like.dim() == 3:
        B, H, W = mask_like.shape
        out = []
        for i in range(B):
            arr = mask_like[i].detach().cpu().numpy()
            if arr.dtype != np.float32 and arr.dtype != np.float64:
                arr = arr.astype(np.float32)
            if arr.max() <= 1.0:
                arr = (arr * 255.0).clip(0,255)
            out.append(Image.fromarray(arr.astype(np.uint8), mode="L"))
        if force_size and out and out[0].size != force_size:
            out = [im.resize(force_size, Image.NEAREST) for im in out]
        return out

    if mask_like.dim() == 4 and mask_like.shape[-1] in (1,3,4):
        imgs = _image_tensor_to_pil_list(mask_like)
        l = [im.convert("L") for im in imgs]
        if force_size and l and l[0].size != force_size:
            l = [im.resize(force_size, Image.NEAREST) for im in l]
        return l

    raise ValueError("MASK must be [B,1,H,W] or [B,H,W] (or an IMAGE used as mask).")

def _pil_list_to_image_tensor(imgs: List[Image.Image]) -> torch.Tensor:
    batch = []
    for im in imgs:
        arr = np.asarray(im.convert("RGB"), dtype=np.uint8).astype(np.float32) / 255.0
        batch.append(arr)
    arrb = np.stack(batch, axis=0)
    return torch.from_numpy(arrb)

def _pil_list_to_mask_tensor(masks: List[Image.Image]) -> torch.Tensor:
    batch = []
    for m in masks:
        arr = np.asarray(m.convert("L"), dtype=np.uint8).astype(np.float32) / 255.0
        batch.append(arr[None, ...])  # [1,H,W]
    arrb = np.stack(batch, axis=0)
    return torch.from_numpy(arrb)

def _resample_from_name(name: str):
    name = (name or "lanczos").lower()
    if name == "bilinear":
        return Image.BILINEAR
    if name == "bicubic":
        return Image.BICUBIC
    return Image.LANCZOS

def _bbox_from_mask(mask_l: Image.Image, threshold: float = 0.5) -> Optional[Tuple[int,int,int,int]]:
    arr = np.array(mask_l, dtype=np.uint8)
    thr = int(round(np.clip(threshold, 0.0, 1.0) * 255))
    binm = (arr >= thr).astype(np.uint8) * 255
    pil = Image.fromarray(binm, mode="L")
    return pil.getbbox()

def _expand_bbox(x0,y0,x1,y1, w,h, pad: int):
    if pad <= 0:
        return x0,y0,x1,y1
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad); y1 = min(h, y1 + pad)
    return x0,y0,x1,y1

def _fit_size(src_w, src_h, dst_w, dst_h, mode="fit"):
    if mode == "fill":
        s = max(dst_w / src_w, dst_h / src_h)
    else:
        s = min(dst_w / src_w, dst_h / src_h)
    nw = max(1, int(round(src_w * s)))
    nh = max(1, int(round(src_h * s)))
    return nw, nh

def _alignment_offset(ax: str, ay: str, box_w: int, box_h: int, content_w: int, content_h: int):
    if ax == "left": ox = 0
    elif ax == "right": ox = box_w - content_w
    else: ox = (box_w - content_w) // 2
    if ay == "top": oy = 0
    elif ay == "bottom": oy = box_h - content_h
    else: oy = (box_h - content_h) // 2
    return ox, oy

class vsLinx_FitImageIntoBBoxMask:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "source": ("IMAGE",),
                "mask": ("MASK",),
                "mode": (["fit","fill"], {"default":"fit"}),
                "align_x": (["center","left","right"], {"default":"center"}),
                "align_y": (["center","top","bottom"], {"default":"center"}),
                "offset_x": ("INT", {"default":0, "min":-4096, "max":4096, "step":1}),
                "offset_y": ("INT", {"default":0, "min":-4096, "max":4096, "step":1}),
                "threshold": ("FLOAT", {"default":0.5, "min":0.0, "max":1.0, "step":0.01}),
                "pad": ("INT", {"default":0, "min":0, "max":4096, "step":1}),
                "use_source_alpha": ("BOOLEAN", {"default":False}),
                "antialias": (["lanczos","bicubic","bilinear"], {"default":"lanczos"}),
            },
            "optional": {
                "destination": ("IMAGE",),
                "canvas_w": ("INT", {"default":1024, "min":16, "max":8192, "step":1}),
                "canvas_h": ("INT", {"default":1024, "min":16, "max":8192, "step":1}),
            }
        }

    RETURN_TYPES = ("IMAGE","IMAGE","MASK","INT","INT","INT","INT")
    RETURN_NAMES = ("composite","fitted_source","placed_mask","x","y","w","h")
    FUNCTION = "run"
    CATEGORY = "vsLinx/inpaint"

    def run(
        self,
        source: torch.Tensor,
        mask: torch.Tensor,
        mode: str = "fit",
        align_x: str = "center",
        align_y: str = "center",
        offset_x: int = 0,
        offset_y: int = 0,
        threshold: float = 0.5,
        pad: int = 0,
        use_source_alpha: bool = False,
        antialias: str = "lanczos",
        destination: Optional[torch.Tensor] = None,
        canvas_w: int = 1024,
        canvas_h: int = 1024,
    ):
        resample = _resample_from_name(antialias)

        src_list = _image_tensor_to_pil_list(source)
        if destination is not None:
            dst_list = _image_tensor_to_pil_list(destination)
            canvas_size = (dst_list[0].width, dst_list[0].height)
        else:
            dst_list = [Image.new("RGB", (canvas_w, canvas_h), (0,0,0))]
            canvas_size = (canvas_w, canvas_h)

        mask_list = _mask_any_to_pil_list(mask, force_size=canvas_size)

        B = max(len(src_list), len(dst_list), len(mask_list))
        if len(src_list) == 1 and B > 1: src_list = src_list * B
        if len(dst_list) == 1 and B > 1: dst_list = dst_list * B
        if len(mask_list) == 1 and B > 1: mask_list = mask_list * B

        composites, fitted_only, placed_masks = [], [], []
        out_x = out_y = out_w = out_h = 0

        for idx, (s_img, d_img, m_img) in enumerate(zip(src_list, dst_list, mask_list)):
            canvas = d_img.copy()

            bb = _bbox_from_mask(m_img, threshold=threshold)
            if bb is None:
                composites.append(canvas)
                fitted_only.append(Image.new("RGB", canvas.size, (0,0,0)))
                placed_masks.append(Image.new("L", canvas.size, 0))
                continue

            x0, y0, x1, y1 = _expand_bbox(*bb, canvas.width, canvas.height, pad)
            box_w = max(1, x1 - x0); box_h = max(1, y1 - y0)

            src_w, src_h = s_img.width, s_img.height
            new_w, new_h = _fit_size(src_w, src_h, box_w, box_h, mode=mode)
            ax, ay = _alignment_offset(align_x, align_y, box_w, box_h, new_w, new_h)
            paste_x = x0 + ax + offset_x
            paste_y = y0 + ay + offset_y

            s_rgba = s_img if s_img.mode == "RGBA" else s_img.convert("RGBA")
            fitted = s_rgba.resize((new_w, new_h), resample=resample)

            if use_source_alpha:
                canvas.paste(fitted.convert("RGB"), (paste_x, paste_y), fitted.split()[-1])
            else:
                canvas.paste(fitted.convert("RGB"), (paste_x, paste_y))

            on_black = Image.new("RGB", canvas.size, (0,0,0))
            if use_source_alpha:
                on_black.paste(fitted.convert("RGB"), (paste_x, paste_y), fitted.split()[-1])
            else:
                on_black.paste(fitted.convert("RGB"), (paste_x, paste_y))

            footprint = Image.new("L", canvas.size, 0)
            draw = ImageDraw.Draw(footprint)
            draw.rectangle([paste_x, paste_y, paste_x + new_w - 1, paste_y + new_h - 1], fill=255)

            m_arr = np.array(m_img, dtype=np.uint8)
            f_arr = np.array(footprint, dtype=np.uint8)
            placed = Image.fromarray(np.minimum(m_arr, f_arr), mode="L")

            composites.append(canvas); fitted_only.append(on_black); placed_masks.append(placed)
            if idx == 0:
                out_x, out_y, out_w, out_h = int(x0), int(y0), int(box_w), int(box_h)

        return (
            _pil_list_to_image_tensor(composites),
            _pil_list_to_image_tensor(fitted_only),
            _pil_list_to_mask_tensor(placed_masks),
            out_x, out_y, out_w, out_h
        )

NODE_CLASS_MAPPINGS = {"vsLinx_FitImageIntoBBoxMask": vsLinx_FitImageIntoBBoxMask}
NODE_DISPLAY_NAME_MAPPINGS = {"vsLinx_FitImageIntoBBoxMask": "Fit Image into BBox Mask"}
