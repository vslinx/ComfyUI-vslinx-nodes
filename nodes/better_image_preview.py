from nodes import PreviewImage


class VSLinx_BetterImagePreview(PreviewImage):
    CATEGORY = "vsLinx/image"
    FUNCTION = "preview_images"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    OUTPUT_NODE = True
    SEARCH_ALIASES = ["preview", "preview image", "image preview", "image gallery", "image viewer", "show image"]
    DESCRIPTION = (
        "Preview images like the built-in Preview Image node, with a grid view, an in-node full view "
        "with arrows and thumbnails, and buttons to open each image in a new tab. "
        "Passes the images through unchanged."
    )

    def preview_images(self, images, prompt=None, extra_pnginfo=None):
        saved = self.save_images(images, prompt=prompt, extra_pnginfo=extra_pnginfo)
        return {"ui": saved["ui"], "result": (images,)}


NODE_CLASS_MAPPINGS = {
    "vsLinx_BetterImagePreview": VSLinx_BetterImagePreview,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_BetterImagePreview": "Better Image Preview",
}
