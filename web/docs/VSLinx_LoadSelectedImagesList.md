This node provides a “Select Images” button to choose one or multiple images and upload them to your ``input`` folder (same behavior as the default **Load Image** node). It includes a tiled preview and a fullscreen preview per image. <b>The images and filenames are returned as a list</b>, allowing downstream nodes to process them one after another.

This node does the following:
- Accepts paths from the “Select Images” UI as a JSON array or newline-separated list in ``selected_paths``.
- Resolves paths relative to the ComfyUI ``input`` directory and ignores files outside that root.
- Filters to valid image extensions (``.png``, ``.jpg``, ``.jpeg``, ``.webp``, ``.bmp``, ``.tif``/``.tiff``, ``.ppm``).
- Loads each image, corrects EXIF orientation, converts to RGB if needed, and turns it into a BHWC tensor with B=1.
- Returns a **list** of images (each item: shape ``(1, H, W, 3)``).  
- Optionally raises an error if no valid images are found (``fail_if_empty``).
- Returns filenames without their extension as a list alongside the images with a ``filename_handling``-property to dedupe duplicate filenames if needed.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| selected_paths | STRING (multiline) | Paths filled by the **Select Images** button (JSON array or newline-separated). Paths are relative to the ``input`` folder. Duplicates are removed. |
| fail_if_empty | BOOLEAN | If true, throws an error when no valid images are found (e.g., files moved/deleted). |
| filename_handling | ENUM | If set to ``full filename`` the filenames output returns the full filenames (without the extension), setting it to ``deduped filename`` will remove automatically added `` (n)`` from duplicate filenames in your input folder before returning it |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| images | IMAGE (list) | A list of images; each element is a tensor with shape ``(1, H, W, 3)`` (BHWC with B=1). |
| filenames | STRING (list) | A list of strings; each filename is without their extension |

Notes:
- Files are clamped to the ``input`` root for safety; anything outside is ignored.
- If some listed files are missing/invalid, they’re skipped. With ``fail_if_empty = true`` the node will error when **none** are valid.
