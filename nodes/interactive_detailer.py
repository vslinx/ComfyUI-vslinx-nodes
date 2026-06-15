"""
vsLinx Interactive Detailer

A FaceDetailer (ComfyUI-Impact-Pack) clone without the wildcard field.
Instead, when the detector finds segments, the workflow pauses and a dialog
pops up in the frontend showing every detected segment with its own prompt
textfield. Execution resumes once the prompts are confirmed; each segment is
then detailed with its own positive prompt.

Hard runtime dependency on ComfyUI-Impact-Pack, but ONLY for this node:
all imports of `impact.*` happen lazily inside functions, and the node is
only registered when Impact-Pack is installed (see __init__.py), so the rest
of the node pack keeps working without it.
"""

from __future__ import annotations

import os
import uuid

import numpy as np
import torch
from PIL import Image as PILImage

import comfy.samplers
import folder_paths
from nodes import MAX_RESOLUTION

from ..py.interactive_detailer_session import MANAGER

_IMPACT_MISSING_MSG = (
    "[vsLinx] 'Interactive Detailer' requires ComfyUI-Impact-Pack "
    "(https://github.com/ltdrdata/ComfyUI-Impact-Pack). "
    "Install it via ComfyUI-Manager and restart ComfyUI. "
    "All other vsLinx nodes work without it."
)

PREVIEW_SUBFOLDER = "vslinx_interactive_detailer"
OVERVIEW_MAX_SIDE = 1280
CROP_MAX_SIDE = 320

ORDER_MODES = ["left-right", "top-bottom", "largest-first", "confidence", "detector"]
TIMEOUT_MODES = ["use base prompt", "skip detailing", "cancel run"]


def _require_impact():
    """Lazy import of Impact-Pack internals with a readable error."""
    try:
        import impact.core as core
        import impact.utils as utils
    except ImportError as e:
        raise RuntimeError(_IMPACT_MISSING_MSG) from e
    return core, utils


def _schedulers():
    # Impact extends the scheduler list (GITS, AYS, ...). Fall back to the
    # core list if Impact isn't importable yet when /object_info is built.
    try:
        import impact.core as core

        return core.get_schedulers()
    except Exception:
        return comfy.samplers.KSampler.SCHEDULERS


# --------------------------- preview helpers ---------------------------


def _tensor_to_pil(image: torch.Tensor) -> PILImage.Image:
    """ComfyUI IMAGE [B,H,W,C] (first batch entry) -> RGB PIL image."""
    arr = image[0].detach().cpu().numpy()
    arr = (np.clip(arr, 0.0, 1.0) * 255.0).astype(np.uint8)
    if arr.ndim == 2:
        arr = np.stack([arr] * 3, axis=-1)
    if arr.shape[-1] == 1:
        arr = np.repeat(arr, 3, axis=-1)
    return PILImage.fromarray(arr[..., :3], mode="RGB")


def _save_temp(pil: PILImage.Image, tag: str) -> dict:
    temp_dir = os.path.join(folder_paths.get_temp_directory(), PREVIEW_SUBFOLDER)
    os.makedirs(temp_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex[:12]}_{tag}.png"
    pil.save(os.path.join(temp_dir, filename), compress_level=4)
    return {"filename": filename, "subfolder": PREVIEW_SUBFOLDER, "type": "temp"}


def _downscale(pil: PILImage.Image, max_side: int):
    scale = min(1.0, max_side / max(pil.width, pil.height))
    if scale < 1.0:
        pil = pil.resize(
            (max(1, round(pil.width * scale)), max(1, round(pil.height * scale))),
            PILImage.LANCZOS,
        )
    return pil, scale


def _safe_float(value, default=0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


# ------------------------------- the node ------------------------------


class vsLinx_InteractiveDetailer:
    """FaceDetailer clone that asks for one prompt per detected segment."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "guide_size": ("FLOAT", {"default": 512, "min": 64, "max": MAX_RESOLUTION, "step": 8}),
                "guide_size_for": ("BOOLEAN", {"default": True, "label_on": "bbox", "label_off": "crop_region"}),
                "max_size": ("FLOAT", {"default": 1024, "min": 64, "max": MAX_RESOLUTION, "step": 8}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS,),
                "scheduler": (_schedulers(),),
                "positive": ("CONDITIONING", {"tooltip": "Base positive conditioning. Used for every segment whose dialog prompt is left empty."}),
                "negative": ("CONDITIONING",),
                "denoise": ("FLOAT", {"default": 0.5, "min": 0.0001, "max": 1.0, "step": 0.01}),
                "feather": ("INT", {"default": 5, "min": 0, "max": 100, "step": 1}),
                "noise_mask": ("BOOLEAN", {"default": True, "label_on": "enabled", "label_off": "disabled"}),
                "force_inpaint": ("BOOLEAN", {"default": True, "label_on": "enabled", "label_off": "disabled"}),
                "bbox_threshold": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "bbox_dilation": ("INT", {"default": 10, "min": -512, "max": 512, "step": 1}),
                "bbox_crop_factor": ("FLOAT", {"default": 3.0, "min": 1.0, "max": 10, "step": 0.1}),
                "sam_detection_hint": (["center-1", "horizontal-2", "vertical-2", "rect-4", "diamond-4", "mask-area", "mask-points", "mask-point-bbox", "none"],),
                "sam_dilation": ("INT", {"default": 0, "min": -512, "max": 512, "step": 1}),
                "sam_threshold": ("FLOAT", {"default": 0.93, "min": 0.0, "max": 1.0, "step": 0.01}),
                "sam_bbox_expansion": ("INT", {"default": 0, "min": 0, "max": 1000, "step": 1}),
                "sam_mask_hint_threshold": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 1.0, "step": 0.01}),
                "sam_mask_hint_use_negative": (["False", "Small", "Outter"],),
                "drop_size": ("INT", {"min": 1, "max": MAX_RESOLUTION, "step": 1, "default": 10}),
                "bbox_detector": ("BBOX_DETECTOR",),
                "cycle": ("INT", {"default": 1, "min": 1, "max": 10, "step": 1}),
                "segment_order": (ORDER_MODES, {"default": "left-right", "tooltip": "Order in which segments are numbered in the dialog and processed."}),
                "timeout_sec": ("INT", {"default": 300, "min": 0, "max": 86400, "tooltip": "How long to wait for the dialog before applying the timeout policy. 0 = wait forever. Keep > 0 if you also run workflows headless via the API."}),
                "on_timeout": (TIMEOUT_MODES, {"default": "use base prompt"}),
                "always_ask": ("BOOLEAN", {"default": True, "label_on": "enabled", "label_off": "disabled", "tooltip": "When enabled, the node re-executes (and re-asks) on every run even if inputs are unchanged. When disabled, unchanged inputs reuse the cached result without showing the dialog."}),
            },
            "optional": {
                "sam_model_opt": ("SAM_MODEL",),
                "segm_detector_opt": ("SEGM_DETECTOR",),
                "detailer_hook": ("DETAILER_HOOK",),
                "inpaint_model": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
                "noise_mask_feather": ("INT", {"default": 20, "min": 0, "max": 100, "step": 1}),
                "scheduler_func_opt": ("SCHEDULER_FUNC",),
                "tiled_encode": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
                "tiled_decode": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "MASK", "IMAGE", "STRING")
    RETURN_NAMES = ("image", "cropped_refined", "cropped_enhanced_alpha", "mask", "cnet_images", "used_prompts")
    OUTPUT_IS_LIST = (False, True, True, False, True, False)
    FUNCTION = "doit"
    CATEGORY = "vsLinx/detailer"

    SEARCH_ALIASES = [
        "guided detailer",
        "guided",
        "interactive detailer",
        "face detailer",
        "facedetailer",
        "manual detailer",
        "per-segment prompt",
        "prompt per face",
        "prompt per segment",
        "detailer dialog",
    ]

    DESCRIPTION = (
        "FaceDetailer clone (requires ComfyUI-Impact-Pack) without the wildcard field. "
        "When segments are detected, the workflow pauses and a dialog asks for one positive "
        "prompt per segment. Empty prompt = use the base positive conditioning. "
        "'[SKIP]' = leave that segment untouched. Prompts support Impact's '<lora:name:weight>' syntax."
    )

    @classmethod
    def IS_CHANGED(cls, always_ask=True, **kwargs):
        if always_ask:
            return float("NaN")  # never equal to itself -> always re-execute
        return ""

    # --------------------------- detection ---------------------------

    @staticmethod
    def _detect(core, image, bbox_detector, bbox_threshold, bbox_dilation,
                bbox_crop_factor, drop_size, sam_detection_hint, sam_dilation,
                sam_threshold, sam_bbox_expansion, sam_mask_hint_threshold,
                sam_mask_hint_use_negative, sam_model_opt, segm_detector_opt,
                detailer_hook):
        # Mirrors FaceDetailer.enhance_face's detection stage.
        if hasattr(bbox_detector, "setAux"):
            bbox_detector.setAux("face")  # default prompt for CLIPSeg detectors
        segs = bbox_detector.detect(
            image, bbox_threshold, bbox_dilation, bbox_crop_factor, drop_size,
            detailer_hook=detailer_hook,
        )
        if hasattr(bbox_detector, "setAux"):
            bbox_detector.setAux(None)

        if sam_model_opt is not None:
            sam_mask = core.make_sam_mask(
                sam_model_opt, segs, image, sam_detection_hint, sam_dilation,
                sam_threshold, sam_bbox_expansion, sam_mask_hint_threshold,
                sam_mask_hint_use_negative,
            )
            segs = core.segs_bitwise_and_mask(segs, sam_mask)
        elif segm_detector_opt is not None:
            segm_segs = segm_detector_opt.detect(
                image, bbox_threshold, bbox_dilation, bbox_crop_factor, drop_size
            )
            if (hasattr(segm_detector_opt, "override_bbox_by_segm")
                    and segm_detector_opt.override_bbox_by_segm
                    and not (detailer_hook is not None
                             and not hasattr(detailer_hook, "override_bbox_by_segm"))):
                segs = segm_segs
            else:
                segm_mask = core.segs_to_combined_mask(segm_segs)
                segs = core.segs_bitwise_and_mask(segs, segm_mask)
        return segs

    @staticmethod
    def _order_segs(seg_list, mode):
        if mode == "left-right":
            return sorted(seg_list, key=lambda s: (s.bbox[0], s.bbox[1]))
        if mode == "top-bottom":
            return sorted(seg_list, key=lambda s: (s.bbox[1], s.bbox[0]))
        if mode == "largest-first":
            return sorted(
                seg_list,
                key=lambda s: (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1]),
                reverse=True,
            )
        if mode == "confidence":
            return sorted(seg_list, key=lambda s: _safe_float(s.confidence), reverse=True)
        return list(seg_list)  # "detector"

    # ------------------------ dialog payload -------------------------

    @staticmethod
    def _build_payload(image, seg_list, node_id):
        full_pil = _tensor_to_pil(image)
        overview_pil, scale = _downscale(full_pil.copy(), OVERVIEW_MAX_SIDE)
        overview_ref = _save_temp(overview_pil, "overview")

        segments = []
        for i, seg in enumerate(seg_list):
            x1, y1, x2, y2 = [int(v) for v in seg.crop_region]
            x1 = max(0, min(x1, full_pil.width - 1))
            y1 = max(0, min(y1, full_pil.height - 1))
            x2 = max(x1 + 1, min(x2, full_pil.width))
            y2 = max(y1 + 1, min(y2, full_pil.height))
            crop_pil, _ = _downscale(full_pil.crop((x1, y1, x2, y2)), CROP_MAX_SIDE)
            crop_ref = _save_temp(crop_pil, f"seg{i}")

            segments.append({
                "index": i,
                "label": str(getattr(seg, "label", "") or "segment"),
                "confidence": round(_safe_float(getattr(seg, "confidence", 0.0)), 3),
                "bbox": [int(v) for v in seg.bbox],
                "crop_region": [x1, y1, x2, y2],
                "preview": crop_ref,
            })

        return {
            "node_id": str(node_id) if node_id is not None else None,
            "image_width": full_pil.width,
            "image_height": full_pil.height,
            "overview": {"preview": overview_ref, "scale": scale},
            "segments": segments,
        }

    # -------------------------- detail loop --------------------------

    @staticmethod
    def _detail(core, utils, image, segs, ordered_segs, prompts, model, clip, vae,
                guide_size, guide_size_for, max_size, seed, steps, cfg,
                sampler_name, scheduler, positive, negative, denoise, feather,
                noise_mask, force_inpaint, detailer_hook, cycle, inpaint_model,
                noise_mask_feather, scheduler_func_opt, tiled_encode, tiled_decode):
        # Adapted from Impact-Pack's DetailerForEach.do_detail, with the
        # wildcard chooser replaced by an explicit per-segment prompt list.
        image = image.clone()
        enhanced_list = []
        enhanced_alpha_list = []
        cnet_pil_list = []

        is_dummy_model = isinstance(model, str) and model == "DUMMY"
        if (not is_dummy_model and noise_mask_feather > 0
                and "denoise_mask_function" not in model.model_options
                and hasattr(utils, "apply_differential_diffusion")):
            model = utils.apply_differential_diffusion(model)

        for i, seg in enumerate(ordered_segs):
            prompt_text = (prompts[i] if i < len(prompts) else "").strip()
            if prompt_text == "[SKIP]":
                continue

            concat_mode = None
            if prompt_text.startswith("[CONCAT]"):
                concat_mode = "concat"
                prompt_text = prompt_text[len("[CONCAT]"):].strip()

            cropped_image = utils.crop_ndarray4(image.cpu().numpy(), seg.crop_region)
            cropped_image = utils.to_tensor(cropped_image)
            mask = utils.to_tensor(seg.cropped_mask)
            mask = utils.tensor_gaussian_blur_mask(mask, feather)

            cropped_mask = seg.cropped_mask if noise_mask else None
            seg_seed = seed + i

            cropped_positive = [
                [condition, {
                    k: core.crop_condition_mask(v, image, seg.crop_region) if k == "mask" else v
                    for k, v in details.items()
                }]
                for condition, details in positive
            ] if not isinstance(positive, str) else positive

            cropped_negative = [
                [condition, {
                    k: core.crop_condition_mask(v, image, seg.crop_region) if k == "mask" else v
                    for k, v in details.items()
                }]
                for condition, details in negative
            ] if not isinstance(negative, str) else negative

            if not is_dummy_model:
                # enhance_detail handles the per-segment prompt for us:
                # wildcard_opt is encoded with `clip` (incl. <lora:..> syntax)
                # and replaces - or with concat mode extends - the positive
                # conditioning for this segment only.
                enhanced_image, cnet_pils = core.enhance_detail(
                    cropped_image, model, clip, vae, guide_size, guide_size_for,
                    max_size, seg.bbox, seg_seed, steps, cfg, sampler_name,
                    scheduler, cropped_positive, cropped_negative, denoise,
                    cropped_mask, force_inpaint,
                    wildcard_opt=prompt_text if prompt_text != "" else None,
                    wildcard_opt_concat_mode=concat_mode,
                    detailer_hook=detailer_hook,
                    control_net_wrapper=seg.control_net_wrapper,
                    cycle=cycle, inpaint_model=inpaint_model,
                    noise_mask_feather=noise_mask_feather,
                    scheduler_func=scheduler_func_opt,
                    vae_tiled_encode=tiled_encode,
                    vae_tiled_decode=tiled_decode,
                )
            else:
                enhanced_image, cnet_pils = cropped_image, None

            if cnet_pils is not None:
                cnet_pil_list.extend(cnet_pils)

            if enhanced_image is not None:
                image = image.cpu()
                enhanced_image = enhanced_image.cpu()
                utils.tensor_paste(
                    image, enhanced_image,
                    (seg.crop_region[0], seg.crop_region[1]), mask,
                )
                enhanced_list.append(enhanced_image)

                if detailer_hook is not None:
                    image = detailer_hook.post_paste(image)

                enhanced_image_alpha = utils.tensor_convert_rgba(enhanced_image)
                mask = utils.tensor_resize(mask, *utils.tensor_get_size(enhanced_image))
                utils.tensor_putalpha(enhanced_image_alpha, mask)
                enhanced_alpha_list.append(enhanced_image_alpha)

        image_tensor = utils.tensor_convert_rgb(image)
        combined_mask = core.segs_to_combined_mask(segs)

        # NOTE: unlike Impact-Pack we keep the original segment order here so
        # that cropped outputs line up with the dialog numbering / prompts.
        if len(enhanced_list) == 0:
            enhanced_list = [utils.empty_pil_tensor()]
        if len(enhanced_alpha_list) == 0:
            enhanced_alpha_list = [utils.empty_pil_tensor()]
        if len(cnet_pil_list) == 0:
            cnet_pil_list = [utils.empty_pil_tensor()]

        return image_tensor, enhanced_list, enhanced_alpha_list, combined_mask, cnet_pil_list

    @staticmethod
    def _passthrough(core, utils, image, segs):
        empty = utils.empty_pil_tensor()
        combined_mask = core.segs_to_combined_mask(segs)
        return image, [empty], [empty], combined_mask, [empty]

    # ------------------------------ main ------------------------------

    def doit(self, image, model, clip, vae, guide_size, guide_size_for, max_size,
             seed, steps, cfg, sampler_name, scheduler, positive, negative,
             denoise, feather, noise_mask, force_inpaint, bbox_threshold,
             bbox_dilation, bbox_crop_factor, sam_detection_hint, sam_dilation,
             sam_threshold, sam_bbox_expansion, sam_mask_hint_threshold,
             sam_mask_hint_use_negative, drop_size, bbox_detector, cycle,
             segment_order, timeout_sec, on_timeout, always_ask,
             sam_model_opt=None, segm_detector_opt=None, detailer_hook=None,
             inpaint_model=False, noise_mask_feather=20, scheduler_func_opt=None,
             tiled_encode=False, tiled_decode=False, unique_id=None):
        core, utils = _require_impact()

        if image.shape[0] > 1:
            raise Exception(
                "[vsLinx] Interactive Detailer does not support image batches "
                "(same limitation as Impact-Pack's detailers). "
                "Use a list of images (batch size 1 each) instead."
            )

        segs = self._detect(
            core, image, bbox_detector, bbox_threshold, bbox_dilation,
            bbox_crop_factor, drop_size, sam_detection_hint, sam_dilation,
            sam_threshold, sam_bbox_expansion, sam_mask_hint_threshold,
            sam_mask_hint_use_negative, sam_model_opt, segm_detector_opt,
            detailer_hook,
        )
        segs = core.segs_scale_match(segs, image.shape)

        # Drop segments with empty masks BEFORE asking, so the prompts the
        # user enters always line up 1:1 with the segments that get detailed.
        seg_list = [s for s in segs[1] if not bool((s.cropped_mask == 0).all())]
        ordered_segs = self._order_segs(seg_list, segment_order)

        if len(ordered_segs) == 0:
            out = self._passthrough(core, utils, image, segs)
            return (*out, "")

        payload = self._build_payload(image, ordered_segs, unique_id)
        status, prompts = MANAGER.request_prompts(payload, timeout_sec)

        if status == "timeout":
            if on_timeout == "cancel run":
                import comfy.model_management as mm
                raise mm.InterruptProcessingException()
            if on_timeout == "skip detailing":
                out = self._passthrough(core, utils, image, segs)
                return (*out, "(timed out - skipped)")
            prompts = ["" for _ in ordered_segs]  # "use base prompt"

        # Normalize length (dialog should always match, but be defensive).
        prompts = list(prompts)[: len(ordered_segs)]
        prompts += ["" for _ in range(len(ordered_segs) - len(prompts))]

        out = self._detail(
            core, utils, image, segs, ordered_segs, prompts, model, clip, vae,
            guide_size, guide_size_for, max_size, seed, steps, cfg,
            sampler_name, scheduler, positive, negative, denoise, feather,
            noise_mask, force_inpaint, detailer_hook, cycle, inpaint_model,
            noise_mask_feather, scheduler_func_opt, tiled_encode, tiled_decode,
        )

        used_prompts = "\n".join(
            f"#{i + 1}: {p.strip() if p.strip() else '(base prompt)'}"
            for i, p in enumerate(prompts)
        )
        return (*out, used_prompts)


NODE_CLASS_MAPPINGS = {
    "vsLinx_InteractiveDetailer": vsLinx_InteractiveDetailer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_InteractiveDetailer": "(Impact-Pack) Interactive Detailer",
}
