Reads **LoRA entries from a Power LoRA Loader node** (by id/title or via the `powerloraloader_model` link) and appends them to your base prompt as **LoRA tokens** for metadata persistence with image-saver nodes. Tokens are formatted as `<lora:FILEPATH/FILENAME:STRENGTH>`, with **STRENGTH truncated to two decimals**.

This node does the following:
- Locates the target Power LoRA Loader by **node id**, **node title**, or by tracing the `powerloraloader_model` link from this node.
- Parses the target node’s **inputs** (not the MODEL object) and finds every `lora_*` entry (`{'on': bool, 'lora': str, 'strength': float}`).
- Builds a token for each entry in the exact format `<lora:PATH:STRENGTH>`, where `STRENGTH` is truncated (not rounded) to two decimals.
- Appends all tokens to the end of your input `text`, space-separated, preserving discovery order and removing duplicates.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| powerloraloader_model | MODEL (optional) | Connect the loader’s **model** output here so the node can trace the upstream link. |
| text | STRING | Base prompt text to which the LoRA tokens will be appended. |
| id | INT (optional) | Target Power LoRA Loader **node id**. If provided, this takes priority over `node_title`. |
| node_title | STRING (optional) | Manually edited **title** of the loader node. Used when `id` is 0 or no model is connected. |
| only_enabled | BOOLEAN | If true, include only LoRAs with `on: True`. Otherwise, include all `lora_*` entries that contain a valid path. |
| debug | BOOLEAN | Prints detailed logs (target resolution, discovered `lora_*`, built tokens, final output). Helpful for troubleshooting. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| text | STRING | The input `text` with appended LoRA tokens like `<lora:Illustrious\Style\vslinxtybwbleach.safetensors:1.00>`. |

Notes:
- **Resolution priority:** `powerloraloader_model` → `id` → `node_title`  link trace. If none resolve, the node returns the original `text` unchanged.
- **De-duplication:** Identical tokens are removed while preserving first-seen order.