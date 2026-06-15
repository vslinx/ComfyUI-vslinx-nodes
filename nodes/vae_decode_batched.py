"""
vsLinx VAE Decode (Batched)

Drop-in replacements for ComfyUI's built-in VAEDecode / VAEDecodeTiled nodes
that add a `batch_size` field controlling how many latents are handed to the
VAE per decode call. By default ComfyUI decodes the whole batch at once; on
some setups decoding fewer (e.g. 1) at a time lowers peak VRAM and avoids the
slowdowns/OOM fallbacks that a large single decode can trigger.

Both nodes inherit from the core nodes and reuse their `decode` logic per
chunk, so behavior is identical to the originals when the batch fits in a
single chunk (batch_size >= number of latents).
"""

from __future__ import annotations

import torch

from nodes import VAEDecode, VAEDecodeTiled

_BATCH_SIZE_OPT = (
    "INT",
    {
        "default": 1,
        "min": 1,
        "max": 4096,
        "step": 1,
        "tooltip": (
            "How many latents to hand to the VAE per decode call. Lower values "
            "reduce peak VRAM at the cost of more sequential calls; the default "
            "of 1 decodes one image at a time. Values >= the batch size behave "
            "exactly like the built-in node (single decode)."
        ),
    },
)


def _decode_in_chunks(decode_fn, vae, samples, batch_size, *args):
    """Split the latent batch along dim 0 and decode `batch_size` at a time.

    `decode_fn` is the parent node's bound `decode` method; it is called once
    per chunk with a shallow-copied samples dict and the chunk swapped in, then
    the resulting image tensors are concatenated back into one batch.
    """
    latent = samples["samples"]

    # Nested latents have no simple dim-0 batch to slice; let the parent handle
    # them as-is. Same for the trivial cases where chunking changes nothing.
    if getattr(latent, "is_nested", False):
        return decode_fn(vae, samples, *args)

    total = latent.shape[0]
    if batch_size is None or batch_size < 1 or batch_size >= total or total <= 1:
        return decode_fn(vae, samples, *args)

    out = []
    for chunk in torch.split(latent, batch_size, dim=0):
        sub = dict(samples)
        sub["samples"] = chunk
        out.append(decode_fn(vae, sub, *args)[0])
    return (torch.cat(out, dim=0),)


class vsLinx_VAEDecodeBatched(VAEDecode):
    """VAEDecode with a batch_size field to decode fewer latents at a time."""

    @classmethod
    def INPUT_TYPES(cls):
        types = super().INPUT_TYPES()
        types["required"]["batch_size"] = _BATCH_SIZE_OPT
        return types

    CATEGORY = "vsLinx/latent"
    DESCRIPTION = (
        "Same as the built-in VAE Decode, but adds a batch_size field that "
        "controls how many latents are decoded by the VAE at once. Decoding "
        "fewer at a time (e.g. 1) can lower peak VRAM and speed things up."
    )
    SEARCH_ALIASES = [
        "vae decode",
        "vae decode batched",
        "decode batch size",
        "decode latent",
        "latent to image",
        "decode one at a time",
    ]

    def decode(self, vae, samples, batch_size=1):
        return _decode_in_chunks(super().decode, vae, samples, batch_size)


class vsLinx_VAEDecodeTiledBatched(VAEDecodeTiled):
    """VAEDecodeTiled with a batch_size field to decode fewer latents at a time."""

    @classmethod
    def INPUT_TYPES(cls):
        types = super().INPUT_TYPES()
        types["required"]["batch_size"] = _BATCH_SIZE_OPT
        return types

    CATEGORY = "vsLinx/latent"
    DESCRIPTION = (
        "Same as the built-in VAE Decode (Tiled), but adds a batch_size field "
        "that controls how many latents are decoded by the VAE at once. "
        "Decoding fewer at a time (e.g. 1) can lower peak VRAM."
    )
    SEARCH_ALIASES = [
        "vae decode tiled",
        "vae decode tiled batched",
        "tiled decode batch size",
        "decode latent tiled",
        "latent to image tiled",
    ]

    def decode(self, vae, samples, tile_size, overlap=64, temporal_size=64,
               temporal_overlap=8, batch_size=1):
        return _decode_in_chunks(
            super().decode, vae, samples, batch_size,
            tile_size, overlap, temporal_size, temporal_overlap,
        )


NODE_CLASS_MAPPINGS = {
    "vsLinx_VAEDecodeBatched": vsLinx_VAEDecodeBatched,
    "vsLinx_VAEDecodeTiledBatched": vsLinx_VAEDecodeTiledBatched,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_VAEDecodeBatched": "VAE Decode (Batched)",
    "vsLinx_VAEDecodeTiledBatched": "VAE Decode Tiled (Batched)",
}
