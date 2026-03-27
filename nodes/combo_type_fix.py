"""
Fixes combo type validation mismatch between custom nodes.

When different custom nodes extend combo lists (e.g. scheduler names) independently,
ComfyUI's validate_node_input() fails because it has no list-vs-list comparison logic.
This patch adds overlap-based validation for list combo types, so nodes with slightly
different scheduler/sampler lists can still connect.

Toggle via: ComfyUI Settings > vsLinx > Enable Combo Type Fix
"""

import logging

logger = logging.getLogger("vslinx.combo_type_fix")

# Global flag checked by the patched validator at runtime
enabled = True
_patched = False


def apply_combo_type_fix():
    """Monkey-patch validate_node_input to handle list-vs-list combo comparisons."""
    global _patched
    if _patched:
        return

    try:
        import comfy_execution.validation as validation_module
        import execution as execution_module
    except ImportError:
        logger.warning("[vsLinx] Could not import validation modules, combo type fix not applied.")
        return

    original_validate = validation_module.validate_node_input

    def patched_validate_node_input(received_type, input_type, strict=False):
        # Handle list-vs-list combo type comparison (e.g. scheduler lists)
        if enabled and isinstance(received_type, list) and isinstance(input_type, list):
            received_set = set(received_type)
            input_set = set(input_type)

            # Only intervene when the original would fail (lists not equal)
            if received_set != input_set:
                only_in_received = received_set - input_set
                only_in_input = input_set - received_set

                if strict:
                    result = received_set.issubset(input_set)
                else:
                    result = len(received_set & input_set) > 0

                if result:
                    parts = []
                    if only_in_received:
                        parts.append(f"source has extra: {sorted(only_in_received)}")
                    if only_in_input:
                        parts.append(f"target has extra: {sorted(only_in_input)}")
                    detail = "; ".join(parts)
                    logger.warning(
                        f"[vsLinx] Fixed combo type mismatch — {detail}. "
                        f"You can disable this fix under Settings > vsLinx."
                    )
                    return True

        return original_validate(received_type, input_type, strict)

    # Patch both the module definition and the already-imported reference in execution.py
    validation_module.validate_node_input = patched_validate_node_input
    if hasattr(execution_module, "validate_node_input"):
        execution_module.validate_node_input = patched_validate_node_input

    _patched = True
    logger.info("[vsLinx] Combo type validation fix applied.")


def register_routes():
    """Register a PromptServer route so the JS setting can toggle the fix."""
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return

    @PromptServer.instance.routes.get("/vslinx/combo_type_fix")
    async def get_status(request):
        return web.json_response({"enabled": enabled})

    @PromptServer.instance.routes.post("/vslinx/combo_type_fix")
    async def set_status(request):
        global enabled
        data = await request.json()
        enabled = bool(data.get("enabled", True))
        state = "enabled" if enabled else "disabled"
        logger.info(f"[vsLinx] Combo type fix {state} via settings.")
        return web.json_response({"enabled": enabled})


NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
