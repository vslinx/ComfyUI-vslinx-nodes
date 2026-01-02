import torch
from comfy import model_management
import comfy.utils


class VSLinx_UpscaleByFactorWithModel:
    upscale_methods = ["nearest-exact", "bilinear", "area"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "upscale_model": ("UPSCALE_MODEL",),
                "image": ("IMAGE",),
                "upscale_method": (cls.upscale_methods,),
                "factor": ("FLOAT", {"default": 2.0, "min": 0.1, "max": 8.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "upscale"
    CATEGORY = "vsLinx/image"

    def upscale(self, upscale_model, image, upscale_method, factor):
        device = model_management.get_torch_device()
        upscale_model.to(device)

        try:
            in_img = image.movedim(-1, -3).to(device)
            s = comfy.utils.tiled_scale(
                in_img,
                lambda a: upscale_model(a),
                tile_x=128 + 64,
                tile_y=128 + 64,
                overlap=8,
                upscale_amount=upscale_model.scale,
            )
            upscaled = torch.clamp(s.movedim(-3, -1), min=0.0, max=1.0)

            old_w = int(image.shape[2])
            old_h = int(image.shape[1])
            new_w = max(1, int(old_w * float(factor)))
            new_h = max(1, int(old_h * float(factor)))

            samples = upscaled.movedim(-1, 1)
            out = comfy.utils.common_upscale(samples, new_w, new_h, upscale_method, crop="disabled")
            out = out.movedim(1, -1)

            return (out.to("cpu"),)

        finally:
            try:
                upscale_model.cpu()
            except Exception:
                pass


NODE_CLASS_MAPPINGS = {
    "vsLinx_UpscaleByFactorWithModel": VSLinx_UpscaleByFactorWithModel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_UpscaleByFactorWithModel": "Upscale by Factor (With Model)",
}