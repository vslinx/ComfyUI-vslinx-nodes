An all-in-one node for <b>Anima ControlNet-LLLite tiled sampling</b>. It replaces a whole manual graph (image tiling → per-tile VAE encode / LLLite apply / KSampler / VAE decode → batch + untile) with a single node, and makes the grid <b>dynamic</b>: change ``rows``/``columns`` and the node loops the correct number of times instead of forcing you to wire up one sampler chain per tile.

For every tile in the ``rows`` × ``columns`` grid the node:
1. applies <b>Anima ControlNet-LLLite</b> to the ``model`` using that tile as the control image,
2. <b>VAE-encodes</b> the tile into a latent,
3. runs the <b>KSampler</b> on it with the shared ``positive``/``negative`` conditioning,
4. <b>VAE-decodes</b> the result back to an image tile.

When all tiles are done they are feathered along their overlaps and <b>stitched back</b> into a single image (same algorithm as comfyui_essentials Image Tile / Image Untile). All tiles share the same ``seed``.

<b>No extra node packs are required.</b> The Anima ControlNet-LLLite apply logic is bundled (vendored from <a href="https://github.com/kohya-ss/ComfyUI-Anima-LLLite">kohya-ss/ComfyUI-Anima-LLLite</a>, Apache 2.0), so the node works on its own.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | IMAGE | The image to upscale/refine in tiles. |
| model | MODEL | The Anima diffusion model. Patched per tile with LLLite. |
| positive | CONDITIONING | Positive conditioning, shared across all tiles. |
| negative | CONDITIONING | Negative conditioning, shared across all tiles. |
| vae | VAE | VAE used to encode/decode each tile. |
| seed | INT | Sampling seed (same for every tile). |
| steps | INT | KSampler steps. |
| cfg | FLOAT | Classifier-free guidance scale. |
| sampler_name | COMBO | KSampler sampler. |
| scheduler | COMBO | KSampler scheduler. |
| denoise | FLOAT | Denoise strength — for a tiled upscale this is usually low (e.g. ``0.3``–``0.5``). |
| lllite_name | COMBO | Anima ControlNet-LLLite weights file (from the ``controlnet`` folder). |
| strength | FLOAT | LLLite multiplier. |
| start_percent | FLOAT | Sampling-progress point where LLLite starts acting (0 = from the start). |
| end_percent | FLOAT | Sampling-progress point where LLLite stops acting (1 = until the end). |
| preserve_wrapper | BOOLEAN | Delegate to an upstream ``model_function_wrapper`` instead of overwriting it, so multiple wrapper nodes can stack. Same toggle as the AnimaLLLiteApply node. |
| rows | INT | Number of tile rows. |
| columns | INT | Number of tile columns. |
| overlap | FLOAT | Overlap between tiles as a fraction of tile size (added on top of overlap_x/overlap_y). |
| overlap_x | INT | Extra horizontal overlap in pixels. |
| overlap_y | INT | Extra vertical overlap in pixels. |
| method | COMBO | Resampling (``lanczos``, ``nearest-exact``, ``bilinear``, ``area``, ``bicubic``) used to keep every decoded tile at a uniform size before stitching. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | IMAGE | The stitched result of all sampled tiles. |

Notes:
- Like the essentials Image Tile node, the image is cropped to a whole number of tiles (``columns × tile_width`` by ``rows × tile_height``), so the output can be a few pixels smaller than the input.
- The overlaps used for stitching are the ones actually computed during tiling (after clamping to at most half a tile), so the geometry always lines up even if ``overlap_x``/``overlap_y`` exceed half the tile size.
- For lower VRAM use more ``rows``/``columns`` (smaller tiles) rather than a tiled VAE — splitting the VAE pass tends to hurt quality without a meaningful speed gain at these tile sizes.
- 4-channel (inpaint) LLLite weights are not supported here since they require a per-tile mask; use the standalone AnimaLLLiteApply node for that case.
