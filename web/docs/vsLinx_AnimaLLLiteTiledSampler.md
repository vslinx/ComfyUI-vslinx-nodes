An all-in-one node for <b>Anima ControlNet-LLLite tiled sampling</b>. It replaces a whole manual graph (image tiling → per-tile VAE encode / LLLite apply / KSampler / VAE decode → batch + untile) with a single node, and makes the grid <b>dynamic</b>: change ``rows``/``columns`` and the node loops the correct number of times instead of forcing you to wire up one sampler chain per tile.

For every tile in the ``rows`` × ``columns`` grid the node:
1. applies <b>Anima ControlNet-LLLite</b> to the ``model`` using that tile as the control image,
2. <b>VAE-encodes</b> the tile into a latent,
3. runs the <b>KSampler</b> on it with the shared ``positive``/``negative`` conditioning,
4. <b>VAE-decodes</b> the result back to an image tile.

When all tiles are done they are feathered along their overlaps and <b>stitched back</b> into a single image (same algorithm as comfyui_essentials Image Tile / Image Untile). All tiles share the same ``seed``.

<b>Two sampling modes</b> (``sampling_mode``):
<ul>
<li><b>per_tile</b> (default) — the process above: each tile is sampled to completion, then the tiles are stitched. Lowest VRAM. Because tiles are sampled independently they can show seams or "double-exposure" ghosting where neighbours disagree; ``color_match`` and overlap help but can't fully remove it.</li>
<li><b>multidiffusion</b> — a single sampling pass over the <b>whole</b> latent. Every denoising step the latent is split into overlapping tiles, the model is run per tile (each with its own LLLite control crop), and the predictions are <b>averaged in latent space</b>. Because the tiles are re-synced every step they cannot diverge, so seams and double-exposure are eliminated. Uses a little more VRAM (it holds the full latent), and ``method`` / ``color_match`` do not apply.</li>
</ul>

<b>No extra node packs are required.</b> The Anima ControlNet-LLLite apply logic is bundled (vendored from <a href="https://github.com/kohya-ss/ComfyUI-Anima-LLLite">kohya-ss/ComfyUI-Anima-LLLite</a>, Apache 2.0), so the node works on its own.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | IMAGE | The image to upscale/refine in tiles. |
| model | MODEL | The Anima diffusion model. Patched per tile with LLLite. |
| positive | CONDITIONING | Positive conditioning, shared across all tiles. |
| negative | CONDITIONING | Negative conditioning, shared across all tiles. |
| vae | VAE | VAE used to encode/decode each tile. |
| sampling_mode | COMBO | ``per_tile`` (sample tiles then stitch — lowest VRAM, can seam) or ``multidiffusion`` (one pass, overlap-averaged each step — no seams, slightly more VRAM). |
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
| method | COMBO | (per_tile only) Resampling (``lanczos``, ``nearest-exact``, ``bilinear``, ``area``, ``bicubic``) used to keep every decoded tile at a uniform size before stitching. |
| color_match | COMBO | (per_tile only) Per-tile color matching against the source tile, to fix tonal seams (brightness/colour steps between tiles). ``none`` (default), ``mean_std`` (re-scales each tile's per-channel mean/std — fast, simple), ``wavelet`` (keeps the tile's detail but takes the source tile's broad tone — better on textured tiles). |
| color_match_strength | FLOAT | (per_tile only) How strongly to apply the color match (``0`` = off, ``1`` = full). |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | IMAGE | The stitched result of all sampled tiles. |

Notes:
- Like the essentials Image Tile node, the image is cropped to a whole number of tiles (``columns × tile_width`` by ``rows × tile_height``), so the output can be a few pixels smaller than the input.
- The overlaps used for stitching are the ones actually computed during tiling (after clamping to at most half a tile), so the geometry always lines up even if ``overlap_x``/``overlap_y`` exceed half the tile size.
- For lower VRAM use more ``rows``/``columns`` (smaller tiles) rather than a tiled VAE — splitting the VAE pass tends to hurt quality without a meaningful speed gain at these tile sizes.
- In ``per_tile`` mode, tiles sampled independently can drift in overall tone, leaving a faint brightness/colour step (seam) across smooth areas, and can disagree structurally (a "double-exposure" in the overlap). ``color_match`` fixes the tonal step; for structural seams use ``multidiffusion``.
- ``multidiffusion`` mode removes seams at the source: tiles are re-synced (overlap-averaged in latent space) at every denoising step, so they can't diverge. It does one full-image VAE encode/decode (ComfyUI auto-tiles the VAE if it would otherwise run out of memory) and holds the full latent in memory, so it uses a little more VRAM than ``per_tile``. ``method`` and ``color_match`` are not used in this mode.
- 4-channel (inpaint) LLLite weights are not supported here since they require a per-tile mask; use the standalone AnimaLLLiteApply node for that case.
