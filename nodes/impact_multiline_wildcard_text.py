class vsLinx_ImpactMultilineWildcardText:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                    },
                ),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "output"
    CATEGORY = "vsLinx/text"

    def output(self, text: str):
        return (text,)


NODE_CLASS_MAPPINGS = {
    "vsLinx_ImpactMultilineWildcardText": vsLinx_ImpactMultilineWildcardText,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_ImpactMultilineWildcardText": "(Impact-Pack) Multiline Wildcard Text",
}