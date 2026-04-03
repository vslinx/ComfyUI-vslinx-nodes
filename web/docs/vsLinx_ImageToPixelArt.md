This node converts an image into <b>true pixel art</b> by downscaling it to a discrete low-resolution pixel grid, quantizing the colors to a limited palette, and scaling the result back up with nearest-neighbor interpolation so every pixel block is hard-edged and solid. No blending, no anti-aliasing — each pixel in the output is one real color from the palette.

This node does the following:
- Downscales the input image to a small pixel grid determined by ``pixel_size`` (e.g. a pixel_size of 8 on a 512px image → 64×64 grid).
- Quantizes all colors to a limited palette (auto-generated or a fixed historical palette).
- Applies optional dithering — either Floyd-Steinberg error diffusion or ordered Bayer dithering — at the low-resolution level.
- Scales the result back to the original resolution using nearest-neighbor upsampling so each pixel block is clearly visible.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | IMAGE | The input image to convert. |
| pixel_size | INT | How many original pixels make up one pixel-art pixel. Higher values produce a coarser, more pixelated result. |
| num_colors | INT | Maximum number of colors in the palette. Only applies when ``palette`` is set to ``Auto`` or ``Grayscale``. |
| dithering | ``None`` / ``Floyd-Steinberg`` / ``Bayer 2x2`` / ``Bayer 4x4`` / ``Bayer 8x8`` | Dithering method applied during color quantization. ``Floyd-Steinberg`` diffuses quantization error to neighboring pixels (smooth gradients). Bayer options use an ordered threshold matrix for the classic CGA/Game Boy crosshatch pattern. |
| palette | ``Auto`` / ``Grayscale`` / ``CGA (16)`` / ``C64 (16)`` / ``GameBoy (4)`` / ``NES (52)`` / ``Pico-8 (16)`` | Color palette to quantize to. ``Auto`` derives the best palette from the image itself. Fixed palettes (GameBoy, Pico-8, CGA, C64, NES) force the image into the exact historical colors of those platforms. |
| downscale_filter | ``Box (smooth)`` / ``Nearest (harsh)`` | Resampling method used when downscaling to the pixel grid. ``Box`` averages all original pixels in each block before quantizing, giving better color accuracy. ``Nearest`` samples a single pixel per block for a harder, more aliased look. |
| upscale_to_original | BOOLEAN | When enabled, scales the pixel grid back to the original image resolution using nearest-neighbor so each pixel block is a visible rectangle of solid color. Disable to output the raw low-resolution pixel art (e.g. 64×64). |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| pixel_art | IMAGE | The converted pixel art image. |

Notes:
- ``pixel_size`` directly controls the resolution of your pixel grid. At ``pixel_size`` 8 on a 512×512 image you get a 64×64 internal canvas — the same as drawing at 64×64 in Aseprite.
- Bayer dithering for fixed palettes uses the two-nearest-color ordered dithering algorithm: for each pixel the two closest palette colors are found, and the Bayer threshold decides which one to use. This is the same technique used by original Game Boy Color hardware and Aseprite's indexed dithering mode.
- ``Floyd-Steinberg`` tends to produce smoother gradients; Bayer produces the classic crosshatch / halftone pattern typical of 8-bit and 16-bit era graphics.
- When ``upscale_to_original`` is disabled, the output is the actual small image. Connect it to a Save Image node to export the real low-resolution pixel art file.
