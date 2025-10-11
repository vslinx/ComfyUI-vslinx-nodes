This node fits an image <b>inside the bounding box region of a mask</b> and places it into a destination image (or a blank canvas). It’s useful for workflows where you want to insert or align a smaller image (e.g. pose, object, logo, patch) into a specific masked region while keeping correct proportions.
This node does the following:
- Detects the bounding box (BBox) of your input mask — that is, the smallest rectangle that covers all white/non-zero pixels.
- Resizes the source image to fit inside (or cover) that bounding box, preserving aspect ratio.
- Places the resized image at the corresponding position in the destination image.
- Outputs the final composited image, a stand-alone fitted image, and a mask showing the exact placed region.

You can find an example workflow [here](https://github.com/user-attachments/assets/fb344190-206b-4c15-93ae-cac05c8b6740) for the images generated in the gif in the readme of this custom node. To open the workflow simply download the image and drag it into your comfy.

Parameters:
| Parameter | Type | Description |
| -------- | -------- | ------- |
| source | IMAGE | The image you want to insert (e.g. pose, object, decal). |
| mask | MASK | Defines where the image will be placed. The white area determines the bounding box. |
| destination | IMAGE (optional) | The image you’re compositing onto. If not provided, a blank canvas is created. |
| mode | ``fit`` / ``fill`` | ``fit`` scales the image inside the mask’s box (no crop). ``fill`` covers the box completely (may crop edges). |
| align_x / align_y | ``center`` / ``left`` / ``right`` and ``center`` / ``top`` / ``bottom`` | Alignment of the fitted image inside the box if the aspect ratio doesn’t match perfectly. |
| offset_x / offset_y | INT | Manual pixel offset for fine-tuning the placement. |
| threshold | FLOAT(0-1) | Mask brightness threshold for detecting the box. 0.5 works for most cases. |
| pad | INT | Expands the bounding box outward by N pixels. |
| use_source_alpha | BOOLEAN | If true, respects transparency in the source image during paste. |
| antialias | ``lanczos`` / ``bicubic`` / ``bilinear`` | Resampling method used when resizing the source image. |
| canvas_w / canvas_h | INT (optional) | Canvas size when no destination image is given. |

Outputs:
| Parameter | Type | Description |
| -------- | -------- | ------- |
| composite | IMAGE | The final composited image (destination + fitted source). |
| fitted_source | IMAGE | The resized image placed on a blank canvas. |
| placed_mask | MASK | The exact mask area where the image was placed. |
| x, y, w, h | INTs | Bounding box coordinates and dimensions used for placement. |