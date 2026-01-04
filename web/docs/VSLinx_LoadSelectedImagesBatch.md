This node provides a “Select Images” button to choose one or multiple images and upload them to your ``input`` folder (same behavior as the default **Load Image** node). It includes a tiled preview and a fullscreen preview per image. <b>The images are returned as a batch</b>, allowing downstream nodes to process them together while the <b>filenames are returned as a string of all filenames seperated by a comma</b>.

This node does the following:
- Accepts paths from the “Select Images” UI as a JSON array or newline-separated list in ``selected_paths``.
- Resolves paths relative to the ComfyUI ``input`` directory and ignores files outside that root.
- Filters to valid image extensions (``.png``, ``.jpg``, ``.jpeg``, ``.webp``, ``.bmp``, ``.tif``/``.tiff``, ``.ppm``).
- Loads images, corrects EXIF orientation, converts to RGB if needed.
- Resizes **all** images to the first image’s size to form a valid batch.
- Stacks them into a single tensor with shape ``(B, H, W, 3)`` (BHWC).
- Optionally returns an **empty** batch (``(0, 64, 64, 3)``) if nothing valid is found and ``fail_if_empty`` is false; otherwise raises an error.
- Returns filenames without their extension as a comma seperated string with ``filename_handling``-property to dedupe duplicate filenames if needed.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| selected_paths | STRING (multiline) | Paths filled by the **Select Images** button (JSON array or newline-separated). Paths are relative to the ``input`` folder. Duplicates are removed. |
| fail_if_empty | BOOLEAN | If true, throws an error when no valid images are found (e.g., files moved/deleted). |
| filename_handling | ENUM | If set to ``full filename`` the filenames output returns the full filenames (without the extension), setting it to ``deduped filename`` will remove automatically added `` (n)`` from duplicate filenames in your input folder before returning it |


Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| images | IMAGE (batch) | A single batched tensor with shape ``(B, H, W, 3)`` (BHWC). All images are resized to match the first image’s dimensions. |
| filenames | STRING | A single string of comma seperated filenames without their extension |

Notes:
- Files are clamped to the ``input`` root for safety; anything outside is ignored.
- If some listed files are missing/invalid, they’re skipped. With ``fail_if_empty = true`` the node will error when **none** are valid.
