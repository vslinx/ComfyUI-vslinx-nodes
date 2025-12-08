import math
import sys
from typing import Any, Iterable

def _log(enabled: bool, *args):
    if enabled:
        print("[vsLinx_AppendLorasFromNodeToString]", *args, file=sys.stdout, flush=True)

def _ordered_unique(seq: Iterable[str]) -> list[str]:
    seen = set()
    out = []
    for s in seq:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out

def _truncate_2dp(value: float) -> float:
    try:
        sign = -1 if value < 0 else 1
        v = abs(float(value))
        return sign * (math.trunc(v * 100.0) / 100.0)
    except Exception:
        return 0.0

def _format_lora_token(path: str, strength: float) -> str:
    s = _truncate_2dp(strength)
    return f"<lora:{path}:{s:.2f}>"

def _coerce_text_to_str(text) -> tuple[str, bool]:
    """
    Returns (string_text, changed_flag).
    Safely handles list/tuple/None and non-strs for Z-IMG style prompts.
    """
    if text is None:
        return ("", True)
    if isinstance(text, (list, tuple)):
        try:
            return (" ".join(map(str, text)), True)
        except Exception:
            return (" ".join([str(x) for x in text]), True)
    if not isinstance(text, str):
        return (str(text), True)
    return (text, False)

def _extract_node_id_from_unique_id(unique_id) -> str | None:
    """
    Handles unique_id formats like '230:228' (Z-IMG). Returns the left-hand id as a string.
    """
    if unique_id is None:
        return None
    s = str(unique_id)
    return s.split(":", 1)[0] if s else None

def _find_target_node_id(*, workflow: dict, unique_id: int, id: int, node_title: str, debug: bool) -> int | None:
    """
    Resolution priority:
      1) Follow this node's `powerloraloader_model` link to the upstream node (preferred).
      2) Fallback to explicit `id` if provided.
      3) Fallback to `node_title` match.
    """
    nodes = workflow.get("nodes", []) or []

    # --- Priority 1: resolve via link on THIS node's `powerloraloader_model` input
    link_id = None
    link_to_node_id: dict[int, int] = {}
    my_node_id_str = _extract_node_id_from_unique_id(unique_id)

    for node in nodes:
        if (
            node.get("type") == "vsLinx_AppendLorasFromNodeToString"
            and my_node_id_str is not None
            and str(node.get("id")) == my_node_id_str
            and link_id is None
        ):
            for node_input in node.get("inputs", []):
                if node_input.get("name") == "powerloraloader_model":
                    link_id = node_input.get("link")
                    break

        for out in node.get("outputs", []) or []:
            for lnk in out.get("links", []) or []:
                link_to_node_id[lnk] = node.get("id")

    if link_id is not None:
        upstream = link_to_node_id.get(link_id)
        _log(debug, f"[priority: link] Resolved upstream via link {link_id} -> node id={upstream}")
        if upstream is not None:
            return upstream

    # --- Priority 2: explicit id
    if id and id != 0:
        _log(debug, f"[priority: id] Using provided id={id}")
        return id

    # --- Priority 3: node title
    if node_title:
        for node in nodes:
            if "title" in node and node["title"] == node_title:
                _log(debug, f"[priority: title] Matched node by title: '{node_title}' -> id={node['id']}")
                return node["id"]
        _log(debug, f"No node matched title: '{node_title}'")

    _log(debug, "Could not resolve target node (no link/id/title match).")
    return None

def _gather_lora_tokens_from_prompt_node(prompt: dict, node_id: int, *, only_enabled: bool, debug: bool) -> list[str]:
    """
    Reads prompt[str(node_id)]['inputs'] for keys like 'lora_1', 'lora_2', ...
    Each value is expected to be a dict with keys: 'on', 'lora', 'strength'.
    Returns formatted tokens: <lora:PATH:STRENGTH>
    """
    node_key = str(node_id)
    values = (prompt or {}).get(node_key)
    if not values:
        _log(debug, f"prompt has no key for node id={node_id}")
        return []

    inputs = values.get("inputs", {}) or {}
    _log(debug, f"Node {node_id} inputs keys: {list(inputs.keys())}")

    tokens: list[str] = []
    for k, v in inputs.items():
        if not (isinstance(k, str) and k.startswith("lora_") and isinstance(v, dict)):
            continue

        # Respect only_enabled
        if only_enabled and not v.get("on", False):
            _log(debug, f"Skipping {k} (disabled).")
            continue

        lora_path = v.get("lora")
        if not (isinstance(lora_path, str) and lora_path):
            continue

        strength = v.get("strength", 1.0)
        try:
            strength = float(strength)
        except Exception:
            strength = 1.0

        token = _format_lora_token(lora_path, strength)
        _log(debug, f"Collected {k}: {token}")
        tokens.append(token)

    return _ordered_unique(tokens)


class vsLinx_AppendLorasFromNodeToString:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True}),
            },
            "optional": {
                "id": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1}),
                "node_title": ("STRING", {"multiline": False, "default": ""}),
                "powerloraloader_model": ("MODEL", ),
                "only_enabled": ("BOOLEAN", {"default": False}),
                "debug": ("BOOLEAN", {"default": False}),
            },
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "run"
    CATEGORY = "vsLinx/utility"
    DESCRIPTION = (
        "Reads LoRAs from a Power LoRA Loader node (via link, id, or title) and appends them "
        "to the text as <lora:FILEPATH/FILENAME:STRENGTH> tokens for metadata persistence."
    )
    OUTPUT_NODE = False

    @classmethod
    def IS_CHANGED(cls, *, id, node_title, powerloraloader_model, **kwargs):
        if powerloraloader_model is not None and (id != 0 or node_title != ""):
            return float("NaN")

    def run(
        self,
        text: str,
        id: int = 0,
        node_title: str = "",
        powerloraloader_model=None,
        only_enabled: bool = False,
        debug: bool = False,
        extra_pnginfo=None,
        prompt=None,
        unique_id: int = 0
    ):
        coerced_text, changed = _coerce_text_to_str(text)
        _log(debug, "----- CALL START -----")
        _log(debug, f"Input text (raw type={type(text).__name__}): {repr(text)}")
        if changed:
            _log(debug, f"Coerced text -> {repr(coerced_text)}")

        try:
            workflow = (extra_pnginfo or {}).get("workflow") or {}

            node_id = _find_target_node_id(
                workflow=workflow,
                unique_id=unique_id,
                id=id,
                node_title=node_title,
                debug=debug
            )
            if node_id is None:
                _log(debug, "No target node could be determined; returning original text.")
                _log(debug, "------ CALL END ------")
                return (coerced_text,)

            _log(debug, f"Target node id: {node_id}")
            tokens = _gather_lora_tokens_from_prompt_node(
                prompt or {},
                node_id,
                only_enabled=only_enabled,
                debug=debug
            )
            _log(debug, f"Detected LoRA tokens: {tokens if tokens else 'none'}")

            if not tokens:
                _log(debug, "No LoRAs found. Returning original text.")
                _log(debug, "------ CALL END ------")
                return (coerced_text,)

            spacer = "" if (coerced_text.endswith(" ") or not coerced_text) else " "
            out = f"{coerced_text}{spacer}{' '.join(tokens)}"
            _log(debug, f"Output text: {repr(out)}")
            _log(debug, "------ CALL END ------")
            return (out,)
        except Exception as e:
            _log(debug, f"ERROR: {e}")
            _log(debug, "------ CALL END ------")
            return (coerced_text,)


NODE_CLASS_MAPPINGS = {
    "vsLinx_AppendLorasFromNodeToString": vsLinx_AppendLorasFromNodeToString,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_AppendLorasFromNodeToString": "Power Lora Loader to Prompt (Image Saver)",
}
