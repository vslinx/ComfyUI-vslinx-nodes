"""
vsLinx Anima LLLite Tiled ControlNet Sampler

Collapses a whole "tiled upscale with Anima ControlNet-LLLite" graph into a
single node. Internally it reproduces, for an arbitrary rows x columns grid:

    ImageTile (essentials)              -> split image into overlapping tiles
    for each tile:
        AnimaLLLiteApply (Anima-LLLite) -> patch MODEL with the tile as cond
        VAEEncode                       -> tile -> latent
        KSampler                        -> sample the tile
        VAEDecode                       -> latent -> tile image
    ImageUntile (essentials)            -> feather + stitch the tiles back

Doing it in one node means the grid is dynamic: change ``rows``/``columns`` and
the node loops the right number of times instead of forcing you to wire up one
KSampler chain per tile.

This node has no hard dependency on other custom node packs. The Anima
ControlNet-LLLite apply logic is vendored under ``nodes/_vendor`` (from
kohya-ss/ComfyUI-Anima-LLLite, Apache 2.0 — see the README "Credits" section),
and the essentials tile/untile math is small and pure, so it is reimplemented
here verbatim (algorithm and feathering from comfyui_essentials, MIT).
"""

from __future__ import annotations

import torch
import torch.nn.functional as F


# --- essentials tile/untile math (reimplemented; see module docstring) -------

def _tile_image(image, rows, cols, overlap, overlap_x, overlap_y):
    """Split ``image`` (B,H,W,C) into a (rows*cols, h, w, C) batch.

    Returns ``(tiles, tile_w_full, tile_h_full, overlap_w, overlap_h)`` where the
    overlaps are the *computed* (and clamped) values — these must be fed back
    into :func:`_untile_image` for the geometry to line up. Mirrors
    ``comfyui_essentials.ImageTile``.
    """
    h, w = image.shape[1:3]
    tile_h = h // rows
    tile_w = w // cols
    h = tile_h * rows
    w = tile_w * cols
    overlap_h = int(tile_h * overlap) + overlap_y
    overlap_w = int(tile_w * overlap) + overlap_x

    # max overlap is half of the tile size
    overlap_h = min(tile_h // 2, overlap_h)
    overlap_w = min(tile_w // 2, overlap_w)

    if rows == 1:
        overlap_h = 0
    if cols == 1:
        overlap_w = 0

    tiles = []
    for i in range(rows):
        for j in range(cols):
            y1 = i * tile_h
            x1 = j * tile_w

            if i > 0:
                y1 -= overlap_h
            if j > 0:
                x1 -= overlap_w

            y2 = y1 + tile_h + overlap_h
            x2 = x1 + tile_w + overlap_w

            if y2 > h:
                y2 = h
                y1 = y2 - tile_h - overlap_h
            if x2 > w:
                x2 = w
                x1 = x2 - tile_w - overlap_w

            tiles.append(image[:, y1:y2, x1:x2, :])
    tiles = torch.cat(tiles, dim=0)

    return tiles, tile_w + overlap_w, tile_h + overlap_h, overlap_w, overlap_h


def _untile_image(tiles, overlap_x, overlap_y, rows, cols):
    """Feather + stitch a (rows*cols, h, w, C) batch back into one image.

    Mirrors ``comfyui_essentials.ImageUntile`` (top/left overlap feathering).
    """
    tile_h, tile_w = tiles.shape[1:3]
    tile_h -= overlap_y
    tile_w -= overlap_x
    out_w = cols * tile_w
    out_h = rows * tile_h

    out = torch.zeros((1, out_h, out_w, tiles.shape[3]), device=tiles.device, dtype=tiles.dtype)

    for i in range(rows):
        for j in range(cols):
            y1 = i * tile_h
            x1 = j * tile_w

            if i > 0:
                y1 -= overlap_y
            if j > 0:
                x1 -= overlap_x

            y2 = y1 + tile_h + overlap_y
            x2 = x1 + tile_w + overlap_x

            if y2 > out_h:
                y2 = out_h
                y1 = y2 - tile_h - overlap_y
            if x2 > out_w:
                x2 = out_w
                x1 = x2 - tile_w - overlap_x

            mask = torch.ones((1, tile_h + overlap_y, tile_w + overlap_x), device=tiles.device, dtype=tiles.dtype)

            # feather the overlap on top
            if i > 0 and overlap_y > 0:
                mask[:, :overlap_y, :] *= torch.linspace(0, 1, overlap_y, device=tiles.device, dtype=tiles.dtype).unsqueeze(1)
            # feather the overlap on left
            if j > 0 and overlap_x > 0:
                mask[:, :, :overlap_x] *= torch.linspace(0, 1, overlap_x, device=tiles.device, dtype=tiles.dtype).unsqueeze(0)

            mask = mask.unsqueeze(-1).repeat(1, 1, 1, tiles.shape[3])
            tile = tiles[i * cols + j] * mask
            out[:, y1:y2, x1:x2, :] = out[:, y1:y2, x1:x2, :] * (1 - mask) + tile
    return out


def _resize_to(image, target_h, target_w, method):
    """Resize a (B,H,W,C) image to (target_h, target_w) using ``method``."""
    import comfy.utils

    if image.shape[1] == target_h and image.shape[2] == target_w:
        return image
    s = comfy.utils.common_upscale(image.movedim(-1, 1), target_w, target_h, method, "disabled")
    return s.movedim(1, -1)


# --- per-tile color matching (fixes tonal seams between independent tiles) ----

def _color_match_meanstd(target, ref):
    """Reinhard mean/std transfer: re-scale ``target``'s per-channel mean and std
    to match ``ref``. Both are (1, H, W, C) in [0, 1]."""
    dims = (1, 2)
    t_mean = target.mean(dim=dims, keepdim=True)
    t_std = target.std(dim=dims, keepdim=True)
    r_mean = ref.mean(dim=dims, keepdim=True)
    r_std = ref.std(dim=dims, keepdim=True)
    return (target - t_mean) / (t_std + 1e-5) * r_std + r_mean


def _gaussian_blur(img_bchw, radius):
    """Separable gaussian blur (sigma = radius), reflect-padded."""
    x = torch.arange(-radius, radius + 1, device=img_bchw.device, dtype=img_bchw.dtype)
    k1 = torch.exp(-(x * x) / (2.0 * radius * radius))
    k1 = k1 / k1.sum()
    c = img_bchw.shape[1]
    kh = k1.view(1, 1, 1, -1).repeat(c, 1, 1, 1)
    kv = k1.view(1, 1, -1, 1).repeat(c, 1, 1, 1)
    out = F.pad(img_bchw, (radius, radius, 0, 0), mode="reflect")
    out = F.conv2d(out, kh, groups=c)
    out = F.pad(out, (0, 0, radius, radius), mode="reflect")
    out = F.conv2d(out, kv, groups=c)
    return out


def _wavelet_decompose(img_bchw, levels=5):
    """Split into (high-frequency detail, low-frequency tone) via a gaussian pyramid."""
    high = torch.zeros_like(img_bchw)
    low = img_bchw
    for i in range(levels):
        blurred = _gaussian_blur(low, 2 ** i)
        high = high + (low - blurred)
        low = blurred
    return high, low


def _color_match_wavelet(target, ref):
    """Keep ``target``'s detail (high freq) but take ``ref``'s tone (low freq).
    Both are (1, H, W, C) in [0, 1]."""
    t = target.movedim(-1, 1)
    r = ref.movedim(-1, 1)
    t_high, _ = _wavelet_decompose(t)
    _, r_low = _wavelet_decompose(r)
    return (t_high + r_low).movedim(1, -1)


class VSLinx_AnimaLLLiteTiledSampler:
    @classmethod
    def INPUT_TYPES(cls):
        # All comfy imports are lazy: this runs at runtime when comfy is loaded.
        import comfy.samplers
        import folder_paths
        from nodes import MAX_RESOLUTION

        return {
            "required": {
                "image": ("IMAGE",),
                "model": ("MODEL",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "vae": ("VAE",),

                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 7.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS,),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS,),
                "denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),

                "lllite_name": (folder_paths.get_filename_list("controlnet"),
                                {"tooltip": "Anima ControlNet-LLLite weights file (from the controlnet folder)."}),
                "strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "end_percent": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "preserve_wrapper": ("BOOLEAN", {"default": True,
                    "tooltip": "Delegate to any model_function_wrapper already installed upstream instead of overwriting it, so multiple wrapper nodes can stack. Same toggle as the AnimaLLLiteApply node."}),

                "rows": ("INT", {"default": 2, "min": 1, "max": 256, "step": 1}),
                "columns": ("INT", {"default": 2, "min": 1, "max": 256, "step": 1}),
                "overlap": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 0.5, "step": 0.01,
                    "tooltip": "Overlap between tiles as a fraction of tile size, added on top of overlap_x/overlap_y."}),
                "overlap_x": ("INT", {"default": 64, "min": 0, "max": MAX_RESOLUTION // 2, "step": 1,
                    "tooltip": "Extra horizontal overlap in pixels."}),
                "overlap_y": ("INT", {"default": 64, "min": 0, "max": MAX_RESOLUTION // 2, "step": 1,
                    "tooltip": "Extra vertical overlap in pixels."}),
                "method": (["lanczos", "nearest-exact", "bilinear", "area", "bicubic"],
                    {"tooltip": "Resampling used to keep every decoded tile at a uniform size before stitching."}),

                "color_match": (["none", "mean_std", "wavelet"],
                    {"tooltip": "Per-tile color matching against the source tile, to fix tonal seams (brightness/colour steps between tiles). 'mean_std' re-scales each tile's per-channel mean/std (fast, simple); 'wavelet' keeps the tile's detail but takes the source tile's broad tone (better on textured tiles)."}),
                "color_match_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "How strongly to apply the color match (0 = off, 1 = full)."}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "execute"
    CATEGORY = "vsLinx/sampling"
    DESCRIPTION = (
        "All-in-one Anima ControlNet-LLLite tiled sampler. Splits the image into "
        "a rows x columns grid of overlapping tiles, then for every tile applies "
        "Anima LLLite (tile as control), VAE-encodes, KSamples and VAE-decodes, "
        "and finally feathers the tiles back together — replacing a whole manual "
        "tile/sample/untile graph with one node. No extra node packs required."
    )
    SEARCH_ALIASES = [
        "anima lllite tiled sampler",
        "anima tile upscale",
        "lllite tiled controlnet sampling",
        "tiled ksampler anima",
        "anima controlnet tile",
    ]

    def execute(self, image, model, positive, negative, vae,
                seed, steps, cfg, sampler_name, scheduler, denoise,
                lllite_name, strength, start_percent, end_percent, preserve_wrapper,
                rows, columns, overlap, overlap_x, overlap_y, method,
                color_match="none", color_match_strength=1.0):
        import comfy.utils
        import folder_paths
        from nodes import VAEEncode, VAEDecode, common_ksampler

        from ._vendor.anima_lllite_apply import apply_anima_lllite

        weights_path = folder_paths.get_full_path("controlnet", lllite_name)
        if weights_path is None:
            raise FileNotFoundError(
                f"LLLite weights '{lllite_name}' not found in the controlnet folder."
            )

        vae_encoder = VAEEncode()
        vae_decoder = VAEDecode()

        def color_correct(target, ref):
            """Match ``target``'s colour to source ``ref`` per the selected mode."""
            if color_match == "none":
                return target
            if color_match == "mean_std":
                matched = _color_match_meanstd(target, ref)
            else:
                matched = _color_match_wavelet(target, ref)
            matched = matched.clamp(0.0, 1.0)
            if color_match_strength >= 1.0:
                return matched
            return target * (1.0 - color_match_strength) + matched * color_match_strength

        def sample_region(region_img, region_denoise):
            """LLLite-patched img2img over one region; returns the decoded image."""
            rh, rw = region_img.shape[1], region_img.shape[2]
            patched_model = apply_anima_lllite(
                model, weights_path, region_img, strength,
                start_percent, end_percent, preserve_wrapper,
            )
            latent = vae_encoder.encode(vae, region_img)[0]
            sampled = common_ksampler(
                patched_model, seed, steps, cfg, sampler_name, scheduler,
                positive, negative, latent, denoise=region_denoise,
            )[0]
            decoded = vae_decoder.decode(vae, sampled)[0]
            return _resize_to(decoded, rh, rw, method)

        # Process each image of an input batch independently and stitch each one
        # back on its own, so a batch of N images comes out as a batch of N
        # results (without this the tiles of different images would be mixed).
        batch_size = image.shape[0]
        pbar = comfy.utils.ProgressBar(batch_size * rows * columns)

        results = []
        for b in range(batch_size):
            tiles, tile_w_full, tile_h_full, ov_w, ov_h = _tile_image(
                image[b:b + 1], rows, columns, overlap, overlap_x, overlap_y
            )

            out_tiles = []
            for idx in range(tiles.shape[0]):
                tile_img = tiles[idx:idx + 1]
                # sample_region already returns the tile at its original size
                # (it resizes internally), keeping the untile geometry exact even
                # if the VAE rounds dims to a multiple of 8.
                decoded = sample_region(tile_img, denoise)
                # Re-anchor each tile's colour to its source so tiles can't drift
                # in tone relative to each other (fixes tonal seams).
                decoded = color_correct(decoded, tile_img)
                out_tiles.append(decoded)
                pbar.update(1)

            results.append(_untile_image(
                torch.cat(out_tiles, dim=0), ov_w, ov_h, rows, columns
            ))

        return (torch.cat(results, dim=0),)


NODE_CLASS_MAPPINGS = {
    "vsLinx_AnimaLLLiteTiledSampler": VSLinx_AnimaLLLiteTiledSampler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_AnimaLLLiteTiledSampler": "Anima LLLite Tiled ControlNet Sampler",
}
