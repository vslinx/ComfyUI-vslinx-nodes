A drop-in replacement for ComfyUI's built-in <b>VAE Decode</b> node. It works and behaves exactly the same, but adds one extra ``batch_size`` field that controls <b>how many latents are decoded by the VAE at once</b>.

By default ComfyUI decodes the entire latent batch in a single VAE call. This node instead decodes ``batch_size`` latents at a time and concatenates the results back into the same output image batch. Decoding fewer at a time (e.g. ``1``) <b>lowers peak VRAM</b> and on many setups <b>speeds up generation</b>, because a large single decode can push ComfyUI into a slower tiled / low-VRAM fallback or spill VRAM.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| samples | LATENT | The latent to be decoded. |
| vae | VAE | The VAE model used for decoding the latent. |
| batch_size | INT | How many latents to hand to the VAE per decode call (default ``1`` = one image at a time). |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| IMAGE | IMAGE | The decoded image(s), in the original batch order. |

Notes:
- Output is identical to the built-in VAE Decode — only the number of latents processed per call changes.
- Setting ``batch_size`` equal to or greater than the number of latents behaves exactly like the built-in node (a single decode), so it is safe to leave this node in any workflow.
- The speed/VRAM benefit is hardware-dependent. It helps most when a large single decode would otherwise force a low-VRAM fallback; on GPUs with plenty of headroom a small ``batch_size`` can be marginally slower due to more sequential calls.
