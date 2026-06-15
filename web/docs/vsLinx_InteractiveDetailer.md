A clone of the Impact-Pack <b>FaceDetailer</b> node <b>without the wildcard field</b>. Instead of writing fragile SEGS-wildcard syntax, the workflow <b>pauses</b> when the detector finds segments and a <b>dialog pops up</b> showing every detected segment (numbered boxes on the full image + a crop preview per segment) with its own prompt textfield. Once you confirm, execution resumes and every segment is detailed with its own positive prompt.

<b>Requires <a href="https://github.com/ltdrdata/ComfyUI-Impact-Pack">ComfyUI-Impact-Pack</a>.</b> This node is only registered when Impact-Pack is installed; all other vsLinx nodes work without it.

Prompt rules inside the dialog:
- <b>Empty field</b> → the segment is detailed with the node's base ``positive`` conditioning (identical to FaceDetailer without a wildcard).
- <b>Any text</b> → the text is encoded with the connected ``clip`` and <b>replaces</b> the positive conditioning for that segment only. Impact's ``<lora:name:weight>`` syntax is supported and applies the LoRA for that segment only.
- <b>``[CONCAT]`` prefix</b> → the text is concatenated to the base positive conditioning instead of replacing it.
- <b>``[SKIP]``</b> → the segment is left completely untouched.

The dialog remembers your last prompts per node (browser localStorage) and prefills them on the next run. ``Ctrl+Enter`` confirms. Clicking a box in the overview focuses its textfield. If the page is reloaded while the workflow is waiting, the dialog is restored automatically.

Parameters (in addition to the standard FaceDetailer parameters):
| Parameter | Type | Description |
| -------- | -------- | ------- |
| segment_order | ``left-right`` / ``top-bottom`` / ``largest-first`` / ``confidence`` / ``detector`` | The order in which segments are numbered in the dialog and processed. |
| timeout_sec | INT | How long the workflow waits for the dialog before the ``on_timeout`` policy is applied. ``0`` waits forever. Keep this > 0 if you also run workflows headless via the API, otherwise the queue would hang with no browser connected. |
| on_timeout | ``use base prompt`` / ``skip detailing`` / ``cancel run`` | What happens when ``timeout_sec`` elapses without an answer. |
| always_ask | BOOLEAN | When enabled (default), the node re-executes — and re-asks — on every run, even if all inputs are unchanged. When disabled, unchanged inputs reuse the cached result without showing the dialog. |

Outputs:
| Parameter | Type | Description |
| -------- | -------- | ------- |
| image | IMAGE | The detailed image. |
| cropped_refined | IMAGE (list) | The refined crop per segment, in dialog order (matching the prompt numbering, unlike Impact-Pack which sorts by size). |
| cropped_enhanced_alpha | IMAGE (list) | The refined crops with the segment mask as alpha channel. |
| mask | MASK | Combined mask of all detected segments. |
| cnet_images | IMAGE (list) | ControlNet preprocessor previews when a SEGS ControlNet wrapper is involved. |
| used_prompts | STRING | A newline-joined summary of the prompt used per segment — handy for image-saver metadata. |

Notes:
- The per-segment seed is ``seed + segment_index``, like Impact-Pack.
- Image batches are not supported (same limitation as Impact's detailers); use image lists instead.
- Cancelling from the dialog or from the ComfyUI queue cleanly interrupts the run — the server never hangs on a closed dialog thanks to the timeout policy.
