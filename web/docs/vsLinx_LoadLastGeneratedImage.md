This node loads an image from the ``output`` folder via a dropdown, with the newest image pre-selected. It is designed as a replacement for ComfyUI's built-in **LoadImageOutput** node. It supports <b>auto-refresh after generation</b>, so it automatically picks up newly generated images without manual interaction. The node also supports the <b>MaskEditor</b> (right-click → "Open in MaskEditor"), and painted masks are preserved across workflow executions and tab switches. If no image is available, the node falls back to a <b>512×512 black image</b> to prevent blocking the workflow.

This node does the following:
- Lists all images in the ``output`` folder (optionally including subfolders), sorted by modification time (newest first).
- Shows a dropdown to select any image from the list, with a live preview below the widgets.
- When ``Auto refresh after generation`` is enabled, automatically detects newly generated images after workflow execution and selects them. If no new image appeared, the current selection (and any painted mask) is preserved.
- Supports the MaskEditor: painted masks are saved to ``input/clipspace/`` by ComfyUI's MaskEditor. The node detects this and loads the masked image as both the preview and the source for the ``mask`` output.
- Loads the selected image, corrects EXIF orientation, converts to RGB, and extracts the alpha channel as a mask (if present). Images with transparency (RGBA or palette-based) produce an inverted alpha mask; images without alpha produce an empty (all-zero) mask.
- Falls back to a 512×512 black image with an empty mask when no valid image is found or the file is missing.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | COMBO (UI-only) | Dropdown listing images from the ``output`` folder, sorted newest-first. This widget is not sent to the backend; it controls the hidden ``image`` widget. |
| Auto refresh after generation | BOOLEAN | When true, the node automatically updates the dropdown and selects the newest image after each workflow execution — but only if a genuinely new file appeared. Default: ``true``. |

Buttons:
| Button | Description |
| -------- | ----------- |
| Refresh | Re-scans the output folder and selects the newest image. |
| Choose file to upload | Opens a file picker to upload an image into the ``output`` folder, then selects it. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| image | IMAGE | The loaded image as a float32 tensor ``(1, H, W, 3)`` (RGB, 0–1 range). When a painted mask exists, this is the original image from clipspace (without the mask overlay). |
| mask | MASK | A float32 tensor ``(1, H, W)``. Derived from the alpha channel (inverted) if the image has transparency, or from the MaskEditor's painted mask. All-zero if neither exists. |

Node Properties (right-click → Properties):
| Property | Type | Default | Description |
| -------- | ---- | ------- | ----------- |
| include_subfolders | BOOLEAN | true | When true, the dropdown lists images from all subfolders inside the ``output`` directory. When false, only top-level files are shown. Changing this re-scans and selects the newest image. |

Notes:
- The dropdown always shows ``output``-folder images. When you paint a mask via the MaskEditor, the masked image is saved to ``input/clipspace/`` by ComfyUI internally. The node detects this, updates the hidden ``image`` widget to point at the clipspace file, and shows the masked preview — but the dropdown still displays the original output image.
- Painted masks are preserved across workflow executions (when no new file is generated), tab switches, and page reloads. The hidden ``image`` widget stores the full annotated path (e.g. ``clipspace/clipspace-painted-masked-xxx.png [input]``) which is serialized with the workflow.
- Auto-refresh works by snapshotting the newest file before execution starts. After execution completes, it compares the new file list — only if a different file now sits at position 0 does it switch selection (and clear any painted mask). If no new file appeared, the current selection and mask are untouched.
- If the selected file no longer exists on disk (e.g. manually deleted), the node falls back to a 512×512 black image rather than erroring. This ensures downstream nodes always receive valid tensors.
- Supported image formats: ``.png``, ``.jpg``/``.jpeg``, ``.webp``, ``.bmp``, ``.gif``, ``.tiff``/``.tif``.
- The file list is fetched via a custom API endpoint (``GET /vslinx/output_images_list?include_subfolders=true|false``) to avoid blocking the UI on large output folders.
- ``IS_CHANGED`` uses a SHA-256 hash of the file contents, so re-executions are skipped when the selected image hasn't changed on disk.