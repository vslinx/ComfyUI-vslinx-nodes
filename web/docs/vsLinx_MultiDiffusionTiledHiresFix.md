A model-agnostic <b>MultiDiffusion tiled hires-fix / refiner</b> that re-renders an image in overlapping tiles without producing tile seams. It works on any model (SD / SDXL / Flux / etc.) and needs no extra node packs.

It runs a <b>single sampling pass over the whole image</b>. Every denoising step the latent is split into overlapping tiles, the model is evaluated per tile, and the predictions are <b>averaged in latent space</b> (MultiDiffusion, Bar-Tal et al.). Because the tiles are re-synced every step they can't diverge, so:
<ul>
<li>there are <b>no tile seams</b> and no "double-exposure" ghosting to blend away, and</li>
<li>per-step UNet activations stay <b>tile-sized</b> — you get whole-image coherence at roughly tile-sized peak VRAM, unlike a single full-image pass.</li>
</ul>

<b>This node does not upscale on its own.</b> Upscale the image first (e.g. <code>Upscale Image By</code> or an upscale-model node), then feed it in here with a low <code>denoise</code> (~0.3–0.5) to refine the detail — the classic "hires fix", done in tiles.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | IMAGE | The (already-upscaled) image to refine in tiles. |
| model | MODEL | The diffusion model. |
| positive | CONDITIONING | Positive conditioning, shared across all tiles. |
| negative | CONDITIONING | Negative conditioning, shared across all tiles. |
| vae | VAE | VAE used to encode the image and decode the result. |
| seed | INT | Sampling seed. |
| steps | INT | KSampler steps. |
| cfg | FLOAT | Classifier-free guidance scale. |
| sampler_name | COMBO | KSampler sampler. |
| scheduler | COMBO | KSampler scheduler. |
| denoise | FLOAT | Denoise strength — for a tiled hires-fix keep this low (e.g. ``0.3``–``0.5``). |
| rows | INT | Number of tile rows (latent-space grid). |
| columns | INT | Number of tile columns (latent-space grid). |
| overlap | FLOAT | Overlap between tiles as a fraction of tile size (added on top of overlap_x/overlap_y). |
| overlap_x | INT | Extra horizontal overlap in pixels. |
| overlap_y | INT | Extra vertical overlap in pixels. |
| vae_decode_tiled | BOOLEAN | Decode the final full-image latent in tiles instead of one pass, so the decode can't spike VRAM (or, on Windows, spill into slow shared system memory). |
| vae_decode_tile_size | INT | Tile size in pixels for the tiled VAE decode. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | IMAGE | The refined image. |

Notes:
- More ``rows``/``columns`` means smaller per-step tiles, which lowers the peak VRAM of each model evaluation. The total number of model evaluations per step is ``rows × columns``, so a finer grid trades a little speed for lower VRAM.
- The final VAE decode is a single full-image pass and is <b>independent of ``rows``/``columns``</b> (the grid only tiles the per-step model call, not the VAE). If that decode pins your VRAM — on Windows it may not raise a clean out-of-memory error and instead crawl by spilling into shared system memory — enable ``vae_decode_tiled`` with a bounded ``vae_decode_tile_size``.
- This node delegates to any ``model_function_wrapper`` already installed upstream, so it can stack with other wrapper-based nodes instead of overwriting them.
