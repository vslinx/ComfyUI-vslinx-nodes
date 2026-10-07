This node previews images just like ComfyUI's built-in **Preview Image** node, but adds a few quality-of-life features: a <b>grid view</b> for multiple images, an <b>in-node full view</b> to flip through them, and buttons to <b>open any image in a new browser tab</b>. Unlike the built-in node, it also <b>passes the images through</b> as an output, so you can keep using them further down the workflow.

This node does the following:
- Saves the incoming images as temporary previews (exactly like the built-in Preview Image node, nothing is written to your ``output`` folder).
- Shows multiple images in a grid laid out like the built-in node: it picks the number of columns that shows the images as large as possible in the node. Hovering an image reveals two buttons: <b>View in node</b> and <b>Open in new tab</b>. Clicking an image opens it in the full view.
- The full view shows one image at a time with previous/next arrows, a position counter (e.g. ``2 / 4``), and a thumbnail strip at the bottom to jump to any image. The <b>Grid</b> button takes you back to the grid, the <b>Open</b> button opens the current image in a new tab.
- A single image is always shown directly in the full view.
- Outputs the input images unchanged.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| images | IMAGE | The images to preview. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| images | IMAGE | The same images that went in, unchanged. |

Buttons:
| Button | Description |
| -------- | ----------- |
| View in node | (Grid) Opens the image in the full view inside the node. Clicking the image itself does the same. |
| Open in new tab | (Grid) Opens the full-resolution image in a new browser tab. |
| Grid | (Full view) Returns to the grid view. Only shown when there is more than one image. |
| Open | (Full view) Opens the current image in a new browser tab. |
| ‹ / › | (Full view) Shows the previous / next image. Wraps around at the ends. |

Node Properties (right-click → Properties):
| Property | Type | Default | Description |
| -------- | ---- | ------- | ----------- |
| show_buttons | COMBO | On hover | When the grid buttons are visible. ``On hover`` only shows them on the image under your mouse, ``Always`` keeps them visible on every image. |

Notes:
- Right-clicking the images opens ComfyUI's usual node menu, including <b>Open Image</b>, <b>Copy Image</b> and <b>Save Image</b> for the image under your mouse (or the one shown in the full view).
- With the node selected in the full view, use the ``←`` / ``→`` arrow keys to flip through the images and ``Esc`` to go back to the grid.
- When new images arrive, the node switches back to the grid view, just like the built-in node.
- Like with the built-in node, previews are temporary and are cleared when ComfyUI restarts.
