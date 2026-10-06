import comfy.model_management as mm
from comfy_execution.graph_utils import ExecutionBlocker
from nodes import PreviewImage
from server import PromptServer

from ..py.image_filter_session import EVENT_NAME_DONE, MANAGER

TIMEOUT_MODES = ["send none", "send all", "send first", "send last"]
SINGLE_MODES = ["send through", "show dialog"]
NONE_MODES = ["Stop run", "Stop branch"]


class VSLinx_ImageFilter:
    CATEGORY = "vsLinx/image"
    FUNCTION = "filter_images"
    RETURN_TYPES = ("IMAGE", "LATENT", "MASK")
    RETURN_NAMES = ("images", "latents", "masks")
    SEARCH_ALIASES = ["image filter", "image chooser", "select images", "pick images", "filter images"]
    DESCRIPTION = (
        "Pauses the workflow and shows a dialog to pick which images to keep. "
        "Only the selected images (and their latents/masks) are passed on, in the order you clicked them."
    )

    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True, True, True)

    _preview = PreviewImage()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "timeout": ("INT", {"default": 600, "min": 1, "max": 86400, "tooltip": "Seconds to wait for a selection before the on_timeout action is applied."}),
                "on_timeout": (TIMEOUT_MODES, {"default": "send none"}),
                "on_single": (SINGLE_MODES, {"default": "send through", "tooltip": "What to do when only one image arrives."}),
                "on_none": (NONE_MODES, {"default": "Stop run"}),
            },
            "optional": {
                "latents": ("LATENT",),
                "masks": ("MASK",),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"},
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def filter_images(self, images, timeout, on_timeout, on_single, on_none, latents=None, masks=None, prompt=None, extra_pnginfo=None, unique_id=None):
        # Every input arrives as a list; each image entry may itself be a batch.
        timeout, on_timeout, on_single, on_none = timeout[0], on_timeout[0], on_single[0], on_none[0]
        prompt, extra_pnginfo, unique_id = prompt[0], extra_pnginfo[0], unique_id[0]

        entries = [(i, b) for i, batch in enumerate(images) for b in range(batch.shape[0])]
        total = len(entries)
        done = {"node_id": unique_id, "total": total}

        if total == 1 and on_single == "send through":
            PromptServer.instance.send_sync(EVENT_NAME_DONE, {**done, "status": "passed", "sent": 1})
            return (images, latents or [None], masks or [None])

        refs = []
        for batch in images:
            refs += self._preview.save_images(batch, filename_prefix="vsLinx.filter", prompt=prompt, extra_pnginfo=extra_pnginfo)["ui"]["images"]
        sizes = [[images[i].shape[2], images[i].shape[1]] for i, _ in entries]
        payload = {"node_id": unique_id, "images": refs, "sizes": sizes, "timeout": timeout}

        try:
            status, selection = MANAGER.request_selection(payload, timeout)
        except mm.InterruptProcessingException:
            PromptServer.instance.send_sync(EVENT_NAME_DONE, {**done, "status": "cancelled", "sent": 0})
            raise

        if status == "timeout":
            selection = {
                "send none": [],
                "send all": list(range(total)),
                "send first": [0],
                "send last": [total - 1],
            }[on_timeout]
        else:
            selection = [k for k in selection if 0 <= k < total]

        PromptServer.instance.send_sync(EVENT_NAME_DONE, {
            **done,
            "status": "timedout" if status == "timeout" else "sent",
            "sent": len(selection),
            "mode": on_timeout,
        })

        if not selection:
            if on_none == "Stop branch":
                return (ExecutionBlocker(None),) * 3
            raise mm.InterruptProcessingException()

        picks = [entries[k] for k in selection]
        if len(images) == 1:
            # A single batch stays a single batch.
            idx = [b for _, b in picks]
            return (
                [images[0][idx]],
                [{"samples": latents[0]["samples"][idx]}] if latents else [None],
                [masks[0][idx]] if masks else [None],
            )
        return (
            [images[i][b:b + 1] for i, b in picks],
            [{"samples": latents[i]["samples"][b:b + 1]} for i, b in picks] if latents else [None],
            [masks[i][b:b + 1] for i, b in picks] if masks else [None],
        )

NODE_CLASS_MAPPINGS = {
    "vsLinx_ImageFilter": VSLinx_ImageFilter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_ImageFilter": "Image Filter",
}
