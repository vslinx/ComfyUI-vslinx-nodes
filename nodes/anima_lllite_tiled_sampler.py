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
                rows, columns, overlap, overlap_x, overlap_y, method):
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
                th, tw = tile_img.shape[1], tile_img.shape[2]

                # Patch the model so the LLLite control image is this tile.
                patched_model = apply_anima_lllite(
                    model, weights_path, tile_img, strength,
                    start_percent, end_percent, preserve_wrapper,
                )

                latent = vae_encoder.encode(vae, tile_img)[0]

                sampled = common_ksampler(
                    patched_model, seed, steps, cfg, sampler_name, scheduler,
                    positive, negative, latent, denoise=denoise,
                )[0]

                decoded = vae_decoder.decode(vae, sampled)[0]

                # Keep tiles uniform (the VAE may round dims to a multiple of 8) so
                # the untile geometry and overlaps stay exact.
                decoded = _resize_to(decoded, th, tw, method)
                out_tiles.append(decoded)
                pbar.update(1)

            out_batch = torch.cat(out_tiles, dim=0)
            results.append(_untile_image(out_batch, ov_w, ov_h, rows, columns))

        return (torch.cat(results, dim=0),)


NODE_CLASS_MAPPINGS = {
    "vsLinx_AnimaLLLiteTiledSampler": VSLinx_AnimaLLLiteTiledSampler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_AnimaLLLiteTiledSampler": "Anima LLLite Tiled ControlNet Sampler",
}
