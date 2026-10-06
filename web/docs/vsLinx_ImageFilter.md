This node <b>pauses the workflow</b> and opens a full-screen dialog where you pick which images to keep. Only the selected images (and, if connected, their latents and masks) are passed on - in the <b>order you clicked them</b>. It works with a single image, a batch, or an image list (e.g. from ``Load (Multiple) Images (List)``). Handy for generating several candidates and only continuing (upscaling, detailing, saving...) with the ones you like.

This node does the following:
- Shows all incoming images in a grid. Click an image to select it; the number on the badge shows its position in the output.
- The magnifier button on an image opens a larger view where you can flip through the images and select them as well.
- When you press <b>Send</b>, the selected images, latents and masks are passed on and the workflow continues.
- If you don't answer before the ``timeout`` runs out, the ``on_timeout`` action decides what is sent.
- While waiting, the node itself shows its status and an <b>Open selector</b> button. Afterwards it shows what happened (e.g. "Sent - 2 of 9 images passed on") and a <b>Run again</b> button that queues the workflow again - because unchanged nodes before the filter are cached, this simply asks you again with the same images.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| images | IMAGE | The image, batch or list of images to choose from. Lists can contain images of different sizes - each one is shown and passed on at its original size. |
| latents | LATENT | (Optional) Latents that belong to the images. Filtered the same way as the images. |
| masks | MASK | (Optional) Masks that belong to the images. Filtered the same way as the images. |
| timeout | INT | Seconds to wait for a selection before ``on_timeout`` kicks in. Default: ``600``. |
| on_timeout | COMBO | What to send when the timeout runs out: ``send none``, ``send all``, ``send first`` or ``send last``. |
| on_single | COMBO | What to do when only one image arrives: ``send through`` (pass it on without asking, default) or ``show dialog`` (ask anyway). |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| images | IMAGE | The selected images, in the order you selected them. A batch comes out as one batch, a list comes out as a list with one entry per picked image (at its original size). |
| latents | LATENT | The latents of the selected images. Only usable when latents were connected. |
| masks | MASK | The masks of the selected images. Only usable when masks were connected. |

Dialog:
| Control | Description |
| -------- | ----------- |
| Fit / S / M / L | Tile size. ``Fit`` makes all images fit on screen without scrolling, ``S``/``M``/``L`` use fixed tile sizes and scroll. Images always keep their aspect ratio and are letterboxed inside their tile. Your choice is remembered. |
| All / None / Invert | Select all images, clear the selection, or flip it. |
| Timer | Time left before ``on_timeout`` is applied. The button next to it resets the timer to the full ``timeout``. |
| Hide | Hides the dialog without answering - the workflow keeps waiting. A small bar at the top of the screen (and the node's <b>Open selector</b> button) brings it back. |
| Cancel run | Stops the whole run. |
| Send | Passes on the selected images. With nothing selected it reads <b>Send none</b> (see ``on_none`` below). |

Keyboard shortcuts:
| Key | Description |
| -------- | ----------- |
| Click | Select / deselect an image. |
| Space | Select / deselect the image in the large view. |
| ← / → | Previous / next image in the large view. |
| A | Select all images. |
| Enter | Send. |
| Esc | Back from the large view to the grid, or hide the dialog. |

Node Properties (right-click → Properties):
| Property | Type | Default | Description |
| -------- | ---- | ------- | ----------- |
| on_none | COMBO | Stop run | What happens when no image is passed on (you pressed <b>Send none</b>, or the timeout ran out with ``send none``). ``Stop run`` stops the whole run, like the original cg-image-filter node. ``Stop branch`` only skips the nodes after the Image Filter - other parts of the workflow (for example a Save Image node placed before the filter) still finish. |

Notes:
- The node asks again on every run, even when its inputs haven't changed.
- If you reload the page while the node is waiting, the dialog opens again automatically.
- Cancelling the run from ComfyUI's queue also closes the dialog.
- Connected ``latents`` and ``masks`` need one entry per image, in the same order as the images.
- A batch can only hold images of one size, so nodes that build a batch from differently sized images resize them first. To pick from images of mixed sizes without them being squished, feed the filter a list instead (e.g. ``Load (Multiple) Images (List)``).
- If a list contains batches, they are split up: every image can be picked on its own and comes out as its own list entry.
- The previews shown in the dialog are temporary files, just like the built-in Preview Image node.
