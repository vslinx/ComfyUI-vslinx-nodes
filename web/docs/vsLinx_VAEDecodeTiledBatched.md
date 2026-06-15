A drop-in replacement for ComfyUI's built-in <b>VAE Decode (Tiled)</b> node. It keeps all of the original fields and behavior and adds one extra ``batch_size`` field that controls <b>how many latents are decoded by the VAE at once</b>.

By default ComfyUI decodes the entire latent batch in a single (tiled) VAE call. This node instead decodes ``batch_size`` latents at a time and concatenates the results back into the same output image batch. Decoding fewer at a time (e.g. ``1``) <b>lowers peak VRAM</b>.

``batch_size`` controls how many latents are decoded per call, while the tiling fields (``tile_size``, ``overlap``, ``temporal_size``, ``temporal_overlap``) control how each individual latent is split spatially — the two are independent and combine freely.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| samples | LATENT | The latent to be decoded. |
| vae | VAE | The VAE model used for decoding the latent. |
| tile_size | INT | Spatial tile size used during tiled decoding. |
| overlap | INT | Overlap between spatial tiles. |
| temporal_size | INT | Only used for video VAEs: amount of frames to decode at a time. |
| temporal_overlap | INT | Only used for video VAEs: amount of frames to overlap. |
| batch_size | INT | How many latents to hand to the VAE per decode call (default ``1`` = one item at a time). |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| IMAGE | IMAGE | The decoded image(s), in the original batch order. |

Notes:
- Output is identical to the built-in VAE Decode (Tiled) — only the number of latents processed per call changes.
- Setting ``batch_size`` equal to or greater than the number of latents behaves exactly like the built-in node (a single decode).
- The speed/VRAM benefit is hardware-dependent; on GPUs with plenty of headroom a small ``batch_size`` can be marginally slower due to more sequential calls.
