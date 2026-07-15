"""
vsLinx MultiDiffusion Tiled Hires Fix

A model-agnostic tiled hires-fix / refine sampler. It is the ``multidiffusion``
behaviour of the Anima LLLite Tiled ControlNet Sampler with the LLLite parts
removed, so it works on any model (SD/SDXL/Flux/etc.).

It runs a single sampling pass over the whole latent: every denoising step the
latent is split into overlapping tiles, the model is evaluated per tile, and the
predictions are averaged in latent space (MultiDiffusion, Bar-Tal et al.).
Because the tiles are re-synced every step they can't diverge, so there are no
seams or "double-exposure" ghosting to blend away, and per-step UNet activations
stay tile-sized (whole-image coherence at roughly tile-sized peak VRAM).

This node does not upscale on its own — upscale the image first (e.g. "Upscale
Image By"), then feed it in with a low ``denoise`` (~0.3–0.5) to refine it.

The MultiDiffusion tiling math (``_md_spans`` / ``_md_weight_1d``) is shared with
the Anima sampler so there is a single source of truth for it.
"""

from __future__ import annotations

import torch

from .anima_lllite_tiled_sampler import _md_spans, _md_weight_1d


def _ensure_vae_compat(vae):
    """Back-fill VAE attributes that a newer ComfyUI's base ``VAE.encode`` /
    ``VAE.decode`` expect but that out-of-date custom-VAE packs don't set.

    ComfyUI-VAE-Utils' ``CustomVAE`` copies an older ``VAE.__init__`` and never
    calls ``super().__init__()``, so attributes added to the base VAE later (e.g.
    ``handles_tiling`` / ``format_encoded`` in ComfyUI 0.27.0) are missing on it
    and raise ``AttributeError`` the moment we encode/decode with it. We only
    fill attributes that are actually absent, using the base VAE's own defaults,
    so a stock / up-to-date VAE is left completely untouched.
    """
    for attr, default in (("handles_tiling", False), ("format_encoded", None)):
        if not hasattr(vae, attr):
            setattr(vae, attr, default)


def _is_upscale_vae(vae):
    """Detect a VAE-Utils-style upscale VAE.

    Packs like ComfyUI-VAE-Utils load VAEs (e.g. the Wan2.1 ``upscale2x``
    image VAE) whose decoder emits more channels than a plain RGB image -
    3 * k**2 channels that must be ``pixel_shuffle``-d back up into a k-times
    larger RGB image. A normal ComfyUI VAE has no ``real_output_channels``
    attribute (it is unique to VAE-Utils' ``CustomVAE``) and outputs 3
    channels, so this returns False for every stock VAE and we keep the
    original decode path untouched.
    """
    roc = getattr(vae, "real_output_channels", None)
    return isinstance(roc, int) and roc != 3 and roc % 3 == 0


def _upscale_vae_decode(vae, latent, tiled, tile_size, overlap=64):
    """Decode with a VAE-Utils upscale VAE, mirroring that pack's own
    ``VAE Decode (VAE Utils)`` node so the result matches what the user gets
    outside this node.

    The decoder output carries the extra (3 * k**2) channels; we normalise the
    layout, guard the raw [-1, 1] range, and ``pixel_shuffle`` the channels back
    into a k-times larger RGB image. ``vae.decode`` / ``vae.decode_tiled`` route
    through the VAE's own overridden 3D decode, so ``real_output_channels`` and
    ``process_output`` are already handled correctly inside them.
    """
    import torch.nn.functional as F

    if tiled:
        if tile_size < overlap * 4:
            overlap = tile_size // 4
        compression = vae.spacial_compression_decode()
        images = vae.decode_tiled(
            latent["samples"],
            tile_x=tile_size // compression,
            tile_y=tile_size // compression,
            overlap=overlap // compression,
        )
    else:
        images = vae.decode(latent["samples"])

    if images.ndim == 5:  # collapse any temporal/batch dim into the image batch
        images = images.reshape(-1, images.shape[-3], images.shape[-2], images.shape[-1])

    # Safety guard mirroring VAE-Utils: if process_output wasn't applied the raw
    # decoder output is in [-1, 1]; map it back to [0, 1] so it isn't clamped black.
    if images.min() < -0.1:
        images = torch.clamp((images.float() + 1.0) / 2.0, min=0.0, max=1.0)

    ch = images.shape[-1]
    if ch != 3 and ch % 3 == 0:
        upscale = round((ch // 3) ** 0.5)
        if upscale > 1:
            images = F.pixel_shuffle(images.movedim(-1, 1), upscale_factor=int(upscale)).movedim(1, -1)

    return images


class VSLinx_MultiDiffusionTiledHiresFix:
    @classmethod
    def INPUT_TYPES(cls):
        import comfy.samplers
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
                "denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Denoise strength. For a tiled hires-fix on an already-upscaled image keep this low (e.g. 0.3-0.5)."}),

                "rows": ("INT", {"default": 2, "min": 1, "max": 256, "step": 1}),
                "columns": ("INT", {"default": 2, "min": 1, "max": 256, "step": 1}),
                "overlap": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 0.5, "step": 0.01,
                    "tooltip": "Overlap between tiles as a fraction of tile size, added on top of overlap_x/overlap_y."}),
                "overlap_x": ("INT", {"default": 64, "min": 0, "max": MAX_RESOLUTION // 2, "step": 1,
                    "tooltip": "Extra horizontal overlap in pixels."}),
                "overlap_y": ("INT", {"default": 64, "min": 0, "max": MAX_RESOLUTION // 2, "step": 1,
                    "tooltip": "Extra vertical overlap in pixels."}),

                "vae_decode_tiled": ("BOOLEAN", {"default": False,
                    "tooltip": "Decode the final full-image latent in tiles instead of one pass, to avoid a single huge VAE decode that can spike VRAM (or, on Windows, spill into slow shared system memory). The decode is a single full-image pass independent of rows/columns, so adding tiles won't shrink it - enable this instead."}),
                "vae_decode_tile_size": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 32,
                    "tooltip": "Tile size in pixels for the tiled VAE decode."}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "execute"
    CATEGORY = "vsLinx/sampling"
    DESCRIPTION = (
        "Model-agnostic MultiDiffusion tiled hires-fix / refiner. Runs one "
        "sampling pass over the whole image, splitting the latent into "
        "overlapping tiles every denoising step and averaging the overlaps in "
        "latent space, so there are no tile seams and per-step VRAM stays "
        "tile-sized. Upscale the image first, then refine it here with a low "
        "denoise. Works on any model (SD/SDXL/Flux/etc.) - no extra node packs."
    )
    SEARCH_ALIASES = [
        "hires fix",
        "hi-res fix",
        "tiled hires fix",
        "multidiffusion",
        "multi diffusion",
        "tiled diffusion",
        "tiled upscale",
        "tiled sampler",
        "tiled ksampler",
        "seamless tiled sampling",
        "mixture of diffusers",
    ]

    def execute(self, image, model, positive, negative, vae,
                seed, steps, cfg, sampler_name, scheduler, denoise,
                rows, columns, overlap, overlap_x, overlap_y,
                vae_decode_tiled=False, vae_decode_tile_size=512):
        import comfy.utils
        from nodes import VAEEncode, VAEDecode

        vae_encoder = VAEEncode()
        vae_decoder = VAEDecode()
        batch_size = image.shape[0]

        pbar = comfy.utils.ProgressBar(batch_size)
        results = []
        for b in range(batch_size):
            results.append(self._run(
                image[b:b + 1], model, vae, positive, negative,
                seed, steps, cfg, sampler_name, scheduler, denoise,
                rows, columns, overlap, overlap_x, overlap_y,
                vae_encoder, vae_decoder,
                vae_decode_tiled, vae_decode_tile_size,
            ))
            pbar.update(1)
        return (torch.cat(results, dim=0),)

    def _run(self, img, model, vae, positive, negative,
             seed, steps, cfg, sampler_name, scheduler, denoise,
             rows, columns, overlap, overlap_x, overlap_y,
             vae_encoder, vae_decoder,
             vae_decode_tiled=False, vae_decode_tile_size=512):
        """One MultiDiffusion pass over the whole latent: tile + overlap-average
        the model's prediction at every denoising step."""
        from nodes import common_ksampler

        # Make sure the VAE has the attributes newer ComfyUI expects, so
        # out-of-date custom VAEs (e.g. VAE-Utils) don't AttributeError on encode/decode.
        _ensure_vae_compat(vae)

        # Encode the whole image once (ComfyUI auto-tiles the VAE if it would OOM).
        latent = vae_encoder.encode(vae, img)[0]
        x0 = latent["samples"]
        latent_h, latent_w = int(x0.shape[-2]), int(x0.shape[-1])

        # Latent-space tile grid (covers the full latent; last tile reaches the edge).
        tile_hl = max(1, latent_h // rows)
        tile_wl = max(1, latent_w // columns)
        ov_hl = 0 if rows == 1 else min(int(tile_hl * overlap) + overlap_y // 8, tile_hl // 2)
        ov_wl = 0 if columns == 1 else min(int(tile_wl * overlap) + overlap_x // 8, tile_wl // 2)
        ys = _md_spans(latent_h, rows, ov_hl)
        xs = _md_spans(latent_w, columns, ov_wl)

        state = {"tag": None, "tiles": None}

        def build_tiles(device, dtype):
            tiles = []
            for i, (y0, y1) in enumerate(ys):
                ty_l = (ys[i - 1][1] - y0) if i > 0 else 0
                ty_r = (y1 - ys[i + 1][0]) if i < rows - 1 else 0
                wy = _md_weight_1d(y1 - y0, ty_l, ty_r, device, dtype)
                for j, (x0, x1) in enumerate(xs):
                    tx_l = (xs[j - 1][1] - x0) if j > 0 else 0
                    tx_r = (x1 - xs[j + 1][0]) if j < columns - 1 else 0
                    wx = _md_weight_1d(x1 - x0, tx_l, tx_r, device, dtype)
                    weight = wy[:, None] * wx[None, :]  # (th, tw)
                    tiles.append({"y0": y0, "y1": y1, "x0": x0, "x1": x1, "weight": weight})
            return tiles

        # Delegate to any wrapper already installed upstream so this node can
        # stack with other model_function_wrapper nodes instead of clobbering them.
        old_wrapper = model.model_options.get("model_function_wrapper")

        def call_model(apply_model, xt, t, c):
            if old_wrapper is not None:
                return old_wrapper(apply_model, {"input": xt, "timestep": t, "c": c})
            return apply_model(xt, t, **c)

        def wrapper(apply_model, args):
            x_in = args["input"]
            t = args["timestep"]
            c = args["c"]
            device, dtype = x_in.device, x_in.dtype

            tag = (device, dtype)
            if state["tag"] != tag:
                state["tiles"] = build_tiles(device, dtype)
                state["tag"] = tag

            acc = torch.zeros_like(x_in)
            lead = (1,) * (x_in.ndim - 2)
            wsum = torch.zeros(lead + (x_in.shape[-2], x_in.shape[-1]),
                               device=device, dtype=dtype)

            for td in state["tiles"]:
                y0, y1, x0, x1 = td["y0"], td["y1"], td["x0"], td["x1"]
                x_tile = x_in[..., y0:y1, x0:x1]
                eps = call_model(apply_model, x_tile, t, c)
                wb = td["weight"].view(lead + td["weight"].shape)
                acc[..., y0:y1, x0:x1] += eps * wb
                wsum[..., y0:y1, x0:x1] += wb

            return acc / wsum.clamp(min=1e-6)

        m = model.clone()
        m.set_model_unet_function_wrapper(wrapper)
        sampled = common_ksampler(
            m, seed, steps, cfg, sampler_name, scheduler,
            positive, negative, latent, denoise=denoise,
        )[0]

        if _is_upscale_vae(vae):
            # VAE-Utils-style upscale VAE (e.g. Wan2.1 upscale2x): the stock VAE
            # Decode node returns the raw multi-channel decoder output unchanged,
            # which isn't a usable image. Decode the way that pack's own node does
            # (pixel-shuffling the extra channels back into a larger RGB image).
            return _upscale_vae_decode(vae, sampled, vae_decode_tiled, vae_decode_tile_size)

        if vae_decode_tiled:
            # Decode the full-image latent in tiles, so the final decode can't
            # spike VRAM (or, on Windows, spill into slow shared system memory).
            from nodes import VAEDecodeTiled
            return VAEDecodeTiled().decode(vae, sampled, tile_size=vae_decode_tile_size)[0]
        return vae_decoder.decode(vae, sampled)[0]


NODE_CLASS_MAPPINGS = {
    "vsLinx_MultiDiffusionTiledHiresFix": VSLinx_MultiDiffusionTiledHiresFix,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_MultiDiffusionTiledHiresFix": "MultiDiffusion Tiled Hires Fix",
}
