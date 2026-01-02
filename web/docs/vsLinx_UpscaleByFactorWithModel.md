This node upscales an image using a selected <b>upscale model</b> and then resizes the result to a target scale factor. <b>Upscale models typically operate at a fixed scale (e.g. 2× or 4×).</b> This node first runs the model at its native scale, then applies a final resize step to match your requested factor.

This node does the following:
- Upscales the image using the selected ``upscale_model`` via tiled processing (to reduce VRAM usage).
- Computes the target size from your input image dimensions and the provided ``factor``.
- Resizes the model output to exactly match that target size using the chosen ``upscale_method``.
- Returns the final image.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| upscale_model | UPSCALE_MODEL | The upscaling model to use |
| image | IMAGE | The input image to upscale. |
| upscale_method | ``nearest-exact`` / ``bilinear`` / ``area`` | The resampling method used for the final resize step to match your target factor. |
| factor | FLOAT | Target scaling factor relative to the original image size (min: 0.1, max 8.0). |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | IMAGE | The final upscaled + resized image. |

Notes:
- The upscaling model is always applied at its native scale (e.g. 2×/4×). The ``factor`` is achieved by resizing the model output to the target dimensions afterward.
- For ``factor`` values smaller than the model scale, this results in “upscale then downscale” (often still looks good).
- For very large factors (e.g. 8× with a 2× model), the additional scaling beyond the model’s native scale is performed by the final resize step (interpolation), which can look softer depending on ``upscale_method``.
- ``area`` generally works best for downscaling; ``nearest-exact`` preserves hard edges but can look blocky; ``bilinear`` is smoother but may soften details.
