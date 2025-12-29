class TackTestNode:
    """
    A simple test node to verify that the Toolkit backend is loaded correctly.
    """
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "input_text": ("STRING", {"default": "Hello Toolkit"}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output_text",)
    FUNCTION = "test"
    CATEGORY = "Toolkit"

    def test(self, input_text):
        return (f"Toolkit is working: {input_text}",)
