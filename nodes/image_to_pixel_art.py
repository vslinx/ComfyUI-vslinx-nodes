"""
Image To Pixel Art node for ComfyUI-vslinx-nodes.

Converts images to true pixel art:
  1. Downscale to a discrete low-resolution pixel grid
  2. Quantize colors to a limited palette
  3. Apply optional dithering (Floyd-Steinberg or ordered Bayer)
  4. Nearest-neighbor upscale back to display size
"""

import math

import numpy as np
import torch
from PIL import Image

# ---------------------------------------------------------------------------
# Bayer ordered-dither threshold matrices, values in [0, 1)
# ---------------------------------------------------------------------------
_BAYER: dict[str, np.ndarray] = {
    "Bayer 2x2": np.array(
        [[0, 2],
         [3, 1]], dtype=np.float32
    ) / 4.0,
    "Bayer 4x4": np.array(
        [[ 0,  8,  2, 10],
         [12,  4, 14,  6],
         [ 3, 11,  1,  9],
         [15,  7, 13,  5]], dtype=np.float32
    ) / 16.0,
    "Bayer 8x8": np.array(
        [[ 0, 32,  8, 40,  2, 34, 10, 42],
         [48, 16, 56, 24, 50, 18, 58, 26],
         [12, 44,  4, 36, 14, 46,  6, 38],
         [60, 28, 52, 20, 62, 30, 54, 22],
         [ 3, 35, 11, 43,  1, 33,  9, 41],
         [51, 19, 59, 27, 49, 17, 57, 25],
         [15, 47,  7, 39, 13, 45,  5, 37],
         [63, 31, 55, 23, 61, 29, 53, 21]], dtype=np.float32
    ) / 64.0,
}

# ---------------------------------------------------------------------------
# Fixed color palettes (RGB tuples, 0-255)
# ---------------------------------------------------------------------------
_PALETTES: dict[str, list[tuple[int, int, int]]] = {
    "GameBoy (4)": [
        (15, 56, 15),
        (48, 98, 48),
        (139, 172, 15),
        (155, 188, 15),
    ],
    "Pico-8 (16)": [
        (0, 0, 0),       (29, 43, 83),    (126, 37, 83),  (0, 135, 81),
        (171, 82, 54),   (95, 87, 79),    (194, 195, 199),(255, 241, 232),
        (255, 0, 77),    (255, 163, 0),   (255, 236, 39), (0, 228, 54),
        (41, 173, 255),  (131, 118, 156), (255, 119, 168),(255, 204, 170),
    ],
    "CGA (16)": [
        (0, 0, 0),       (0, 0, 170),     (0, 170, 0),    (0, 170, 170),
        (170, 0, 0),     (170, 0, 170),   (170, 85, 0),   (170, 170, 170),
        (85, 85, 85),    (85, 85, 255),   (85, 255, 85),  (85, 255, 255),
        (255, 85, 85),   (255, 85, 255),  (255, 255, 85), (255, 255, 255),
    ],
    "C64 (16)": [
        (0, 0, 0),       (255, 255, 255), (136, 0, 0),    (170, 255, 238),
        (204, 68, 204),  (0, 204, 85),    (0, 0, 170),    (238, 238, 119),
        (221, 136, 85),  (102, 68, 0),    (255, 119, 119),(51, 51, 51),
        (119, 119, 119), (170, 255, 102), (0, 136, 255),  (187, 187, 187),
    ],
    "NES (52)": [
        (84, 84, 84),    (0, 30, 116),    (8, 16, 144),   (48, 0, 136),
        (68, 0, 100),    (92, 0, 48),     (84, 4, 0),     (60, 24, 0),
        (32, 42, 0),     (8, 58, 0),      (0, 64, 0),     (0, 60, 0),
        (0, 50, 60),     (0, 0, 0),
        (152, 150, 152), (8, 76, 196),    (48, 50, 236),  (92, 30, 228),
        (136, 20, 176),  (160, 20, 100),  (152, 34, 32),  (120, 60, 0),
        (84, 90, 0),     (40, 114, 0),    (8, 124, 0),    (0, 118, 40),
        (0, 102, 120),
        (236, 238, 236), (76, 154, 236),  (120, 124, 236),(176, 98, 236),
        (228, 84, 236),  (236, 88, 180),  (236, 106, 100),(212, 136, 32),
        (160, 170, 0),   (116, 196, 0),   (76, 208, 32),  (56, 204, 108),
        (56, 180, 204),  (60, 60, 60),
        (236, 238, 236), (168, 204, 236), (188, 188, 236),(212, 178, 236),
        (236, 174, 236), (236, 174, 212), (236, 180, 176),(228, 196, 144),
        (204, 210, 120), (180, 222, 120), (168, 226, 144),(152, 226, 180),
    ],
}

_PALETTE_NAMES = ["Auto", "Grayscale"] + sorted(_PALETTES.keys())
_DITHER_NAMES  = ["None", "Floyd-Steinberg", "Bayer 2x2", "Bayer 4x4", "Bayer 8x8"]
_FILTER_NAMES  = ["Box (smooth)", "Nearest (harsh)"]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _palette_pil_image(colors: list[tuple[int, int, int]]) -> Image.Image:
    """Build a PIL palette image from a list of RGB colors (max 256)."""
    pal = Image.new("P", (1, 1))
    flat: list[int] = []
    for r, g, b in colors:
        flat += [r, g, b]
    flat += [0] * (256 * 3 - len(flat))
    pal.putpalette(flat)
    return pal


def _quantize_fixed(
    img: Image.Image,
    colors: list[tuple[int, int, int]],
    floyd: bool,
) -> Image.Image:
    """Quantize img to a fixed RGB palette using PIL."""
    pal = _palette_pil_image(colors)
    dither = Image.Dither.FLOYDSTEINBERG if floyd else Image.Dither.NONE
    return img.quantize(palette=pal, dither=dither).convert("RGB")


def _ordered_dither_fixed(
    arr: np.ndarray,
    colors: list[tuple[int, int, int]],
    bayer: np.ndarray,
) -> np.ndarray:
    """
    Vectorized ordered (Bayer) dithering against a fixed palette.

    For each pixel, finds the two nearest palette colors, then uses the
    Bayer threshold to decide which one to pick — exactly how Aseprite
    and classic hardware dithering works.

    arr   : uint8 [H, W, 3]
    colors: list of (R, G, B) palette entries
    bayer : float32 [M, M] threshold matrix, values in [0, 1)
    """
    h, w = arr.shape[:2]
    mh, mw = bayer.shape

    palette = np.array(colors, dtype=np.float32)  # [N, 3]
    px = arr.astype(np.float32)                   # [H, W, 3]

    # Tile the Bayer matrix to cover the whole image
    tiled = np.tile(bayer, (math.ceil(h / mh), math.ceil(w / mw)))[:h, :w]  # [H, W]

    # Squared distances to every palette entry:  [H, W, N]
    diff = px[:, :, np.newaxis, :] - palette[np.newaxis, np.newaxis, :, :]
    dists = np.sum(diff ** 2, axis=-1)

    # Two nearest palette indices
    order = np.argsort(dists, axis=-1)          # [H, W, N]
    idx1  = order[:, :, 0]                       # [H, W]
    idx2  = order[:, :, 1]                       # [H, W]

    d1 = np.take_along_axis(dists, idx1[:, :, np.newaxis], axis=-1).squeeze(-1)  # [H, W]
    d2 = np.take_along_axis(dists, idx2[:, :, np.newaxis], axis=-1).squeeze(-1)  # [H, W]

    # "mix" = how far the pixel sits between color1 and color2 (0 = at c1, 0.5 = midpoint)
    total = d1 + d2
    mix = np.where(total > 0, d1 / total, 0.0)  # [H, W]

    # Bayer decides: if threshold < mix, push toward the second color
    use_c2 = tiled < mix
    final_idx = np.where(use_c2, idx2, idx1)

    return palette[final_idx].astype(np.uint8)


def _add_bayer_noise_auto(arr: np.ndarray, bayer: np.ndarray, num_colors: int) -> np.ndarray:
    """
    Pre-quantization Bayer noise for Auto/Grayscale palettes.

    Scales the noise by the estimated quantization step so that dithering
    is perceptible across the expected color range.

    arr : uint8 [H, W, 3]
    """
    h, w = arr.shape[:2]
    mh, mw = bayer.shape
    tiled = np.tile(bayer, (math.ceil(h / mh), math.ceil(w / mw)))[:h, :w]  # [H, W]

    # Estimated step size per channel: treat colors as evenly distributed in 3D RGB cube
    est_step = 256.0 / max(1.0, num_colors ** (1.0 / 3.0))
    noise = (tiled - 0.5) * est_step  # [H, W], centered around 0

    out = arr.astype(np.float32) + noise[:, :, np.newaxis]
    return np.clip(out, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

class ImageToPixelArt:
    DESCRIPTION = (
        "Converts an image to true pixel art: downscales to a discrete pixel grid, "
        "quantizes to a limited color palette, and applies optional dithering. "
        "The result contains only real, hard-edged pixels — no anti-aliasing or blending."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "pixel_size": ("INT", {
                    "default": 8, "min": 1, "max": 128, "step": 1,
                    "tooltip": (
                        "How many original pixels make up one pixel-art pixel. "
                        "8 on a 512px image → 64×64 pixel grid."
                    ),
                }),
                "num_colors": ("INT", {
                    "default": 32, "min": 2, "max": 256, "step": 1,
                    "tooltip": "Max palette size when using Auto or Grayscale palette.",
                }),
                "dithering": (_DITHER_NAMES, {"default": "Floyd-Steinberg"}),
                "palette": (_PALETTE_NAMES, {"default": "Auto"}),
                "downscale_filter": (_FILTER_NAMES, {
                    "default": "Box (smooth)",
                    "tooltip": (
                        "Box averages each pixel block before quantizing (better color). "
                        "Nearest samples a single pixel (harder, more aliased)."
                    ),
                }),
                "upscale_to_original": ("BOOLEAN", {
                    "default": True,
                    "tooltip": (
                        "Scale the pixel grid back to the original image size using "
                        "nearest-neighbor so each pixel block is clearly visible. "
                        "Disable to output the raw low-resolution pixel art."
                    ),
                }),
            }
        }

    RETURN_TYPES  = ("IMAGE",)
    RETURN_NAMES  = ("pixel_art",)
    FUNCTION      = "convert"
    CATEGORY      = "vsLinx/image"

    # ------------------------------------------------------------------

    def convert(
        self,
        image: torch.Tensor,
        pixel_size: int,
        num_colors: int,
        dithering: str,
        palette: str,
        downscale_filter: str,
        upscale_to_original: bool,
    ) -> tuple:
        pil_down = (
            Image.Resampling.BOX
            if downscale_filter == "Box (smooth)"
            else Image.Resampling.NEAREST
        )
        floyd   = dithering == "Floyd-Steinberg"
        is_bayer = dithering in _BAYER
        bayer   = _BAYER.get(dithering)

        results: list[torch.Tensor] = []

        for b in range(image.shape[0]):
            # Tensor → uint8 numpy
            arr = image[b].detach().cpu().numpy()
            arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
            pil_img = Image.fromarray(arr, mode="RGB")
            orig_w, orig_h = pil_img.size

            # --- 1. Downscale to the pixel-art grid ---
            low_w = max(1, orig_w // pixel_size)
            low_h = max(1, orig_h // pixel_size)
            low_img = pil_img.resize((low_w, low_h), pil_down)
            low_arr = np.array(low_img, dtype=np.uint8)

            # --- 2 + 3. Dithering + color quantization ---
            if palette == "Grayscale":
                gray = low_img.convert("L")
                if is_bayer:
                    # Bayer noise on grayscale (treat as 1-channel)
                    g_arr = np.array(gray, dtype=np.float32)
                    est_step = 256.0 / max(1.0, num_colors)
                    tiled = np.tile(
                        bayer,
                        (math.ceil(low_h / bayer.shape[0]), math.ceil(low_w / bayer.shape[1])),
                    )[:low_h, :low_w]
                    g_arr += (tiled - 0.5) * est_step
                    gray = Image.fromarray(np.clip(g_arr, 0, 255).astype(np.uint8), mode="L")
                    quantized = gray.quantize(colors=num_colors, dither=Image.Dither.NONE).convert("RGB")
                else:
                    dmode = Image.Dither.FLOYDSTEINBERG if floyd else Image.Dither.NONE
                    quantized = gray.quantize(colors=num_colors, dither=dmode).convert("RGB")

            elif palette in _PALETTES:
                colors = _PALETTES[palette]
                if is_bayer:
                    result_arr = _ordered_dither_fixed(low_arr, colors, bayer)
                    quantized = Image.fromarray(result_arr, mode="RGB")
                else:
                    quantized = _quantize_fixed(low_img, colors, floyd)

            else:  # "Auto"
                if is_bayer:
                    noisy_arr = _add_bayer_noise_auto(low_arr, bayer, num_colors)
                    noisy_img = Image.fromarray(noisy_arr, mode="RGB")
                    quantized = noisy_img.quantize(colors=num_colors, dither=Image.Dither.NONE).convert("RGB")
                else:
                    dmode = Image.Dither.FLOYDSTEINBERG if floyd else Image.Dither.NONE
                    quantized = low_img.quantize(colors=num_colors, dither=dmode).convert("RGB")

            # --- 4. Scale back up with nearest-neighbor (hard pixel blocks) ---
            if upscale_to_original:
                result = quantized.resize((orig_w, orig_h), Image.Resampling.NEAREST)
            else:
                result = quantized

            out_arr = np.array(result, dtype=np.float32) / 255.0
            results.append(torch.from_numpy(out_arr).unsqueeze(0))

        return (torch.cat(results, dim=0),)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

NODE_CLASS_MAPPINGS = {
    "VsLinxImageToPixelArt": ImageToPixelArt,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "VsLinxImageToPixelArt": "Image to Pixel Art",
}
