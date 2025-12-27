# ComfyUI-vslinx-nodes
Custom ComfyUI nodes to streamline workflows: load multiple images via a multi-select dialog with preview; images upload instantly to the input folder and can be output as a list or a batch. Includes boolean AND/OR plus a boolean flip for easy branching, and nodes that bypass or mute other nodes based on a boolean value. Also includes “Fit Image into BBox Mask” to precisely fit/place an image into a mask region’s bounding box—ideal for compositing poses, objects, or partial elements—while preserving aspect ratio and offering alignment options. Adds a bridge from rgthree Power LoRA Loader to the image saver to store LoRA info in metadata, plus settings to show previews of all models & LoRAs across all model loaders - compatible with rgthree's subdirectory view.

## How to Install
### **Recommended**
* Install via [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager).

### **Manual**
* Navigate to `ComfyUI/custom_nodes` in your terminal (cmd).
* Clone the repository under the `custom_nodes` directory using the following command:
  ```
  git clone https://github.com/vslinx/ComfyUI-vslinx-nodes.git comfyui-vslinx-nodes
  ```

## Settings
#### Show hover previews in all model dropdowns
When enabled, this feature shows a preview for the model you’re hovering with your mouse.  
It works across **all model / LoRA loaders** and supports **`.safetensors`**, **`.ckpt`**, **`.pt`**, and **`.gguf`** files located in these folders:

- `loras`
- `checkpoints`
- `unet`
- `diffusion_models`

It is also compatible with the **[rgthree-comfy](https://github.com/rgthree/rgthree-comfy)** node’s **“Auto Nest Subdirectories in Menus”** setting. A feature that often breaks preview behavior when combined with other custom nodes (e.g. **[ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)**).

Preview files must be placed **in the same folder as the model** and use the **same base filename**.

Supported formats:

**Images**
- `png`
- `jpg`
- `jpeg`
- `webp`

**Videos**
- `mp4`
- `webm`

The extension will look for previews using the most common naming schemes:
- `ModelName.png` / `ModelName.webm` / etc.
- `ModelName.preview.png` / `ModelName.preview.webm` / etc.

Compatible with well-known ComfyUI custom nodes/plugins that save metadata and/or previews, such as  
**[ComfyUI-Lora-Manager](https://github.com/willmiao/ComfyUI-Lora-Manager)**.

<img width="549" height="678" alt="Image" src="https://github.com/user-attachments/assets/2fbfb270-562c-48f5-a9a5-19062410da7e" />

## Nodes

### Text
#### (Impact-Pack) Multiline Wildcard Text
Provides a simple multiline text field with a wildcard selector that automatically appends selected wildcards. This node uses the API endpoint from the [Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) custom node to provide a dropdown that lets you select wildcards to be added to your prompt.  
This node does not resolve these wildcards by itself and is intended to be passed into the **“Populated Prompt”** field in the Impact-Pack **“ImpactWildcardProcessor”** node.
<img width="1562" height="447" alt="Image" src="https://github.com/user-attachments/assets/27c5e3e3-4e51-450e-b91d-6f3ef48b2f28" />

### Image
#### Load (Multiple) Images (List)
Provides a simple node with a “Select Images” button that lets you choose one or multiple images. After selection, the images are uploaded to your ``input`` folder in ComfyUI (the same behavior as the default Load Image node). The node also includes a preview of the selected images: you can click on an image to switch from the tile view to a full image view. Clicking the X returns you to the tile view, while the numbering in the bottom-right corner allows you to switch between images. <br>
The node includes a ``max_images`` property that defines how many images can be loaded. If set to 0 or left empty, the number of allowed images is unlimited. <br>
It also includes a ``fail_if_empty`` property to throw an error if no elements are being passed, likely caused by images having been deleted or moved from the input folder.
<b>The images are returned as an image list, allowing downstream nodes to process them one after another.</b> <br>
<img width="1040" height="510" alt="Image" src="https://github.com/user-attachments/assets/83d6c60c-5069-4c3b-9886-0f4cefb64df9" />

#### Load (Multiple) Images (Batch)
This node works the same way as the [Load (Multiple) Images (List)](#load-multiple-images-list)-Node but <b>the images are returned as a batch, allowing downstream nodes to process them together.</b>

### Boolean
#### Boolean AND Operator
Provides a node with 2 boolean inputs. Outputs True only if both inputs are True. Otherwise returns False. <br>
<img width="1284" height="182" alt="Image" src="https://github.com/user-attachments/assets/a7c0a40b-8246-4aa5-806a-ba4d7b749ad9" />

#### Boolean OR Operator
Just like the AND Operator it provides a node with 2 boolean inputs. Outputs True if either input is True. Returns False only if both are False.

#### Boolean Flip
Flips the input value: True → False, False → True. Useful for inverting conditions.

### Utility
#### Forward/Bypass on Boolean (Any)
This node accepts any input type and forwards it unchanged. Its pass-through behavior can be controlled with the built-in boolean switch or by linking an external boolean node. This allows you to create conditional branches in your workflow. The bypass state is applied instantly in the UI, without waiting for workflow execution. <br>
<img width="1318" height="343" alt="Image" src="https://github.com/user-attachments/assets/94a8d6e8-fbd5-4a0d-8ca4-d557cb4bfd7a" />

#### Forward/Mute on Boolean (Any)
This node works the same way as ``Forward/Bypass on Boolean (Any)``, but instead of bypassing the connected nodes it mutes them. The mute state can be controlled with the built-in boolean switch or by linking an external boolean, and changes are applied instantly in the UI.

#### Power Lora Loader to Prompt (Image Saver)
This node acts as a bridge between the **Power Lora Loader (rgthree)** node by [rgthree](https://github.com/rgthree/rgthree-comfy) and the **Image Saver** node by [alexopus](https://github.com/alexopus/ComfyUI-Image-Saver).<br>
You can either **connect a model**, or **provide the id**  or **title** of a `Power Lora Loader (rgthree)` node, along with your prompt as a text string. The node will then **append the LoRAs** in the correct format for the Image Saver node. When you pass this new string to Image Saver as the **positive prompt**, it will save the hashes of the LoRAs for Civitai and other AI platforms while removing the LoRAs from the final string, so your prompt doesn’t look messy.

<img width="1766" height="498" alt="Image" src="https://github.com/user-attachments/assets/cb1d76a7-d638-4573-950e-4ae371d428be" />

### Inpaint helper
#### Fit Image into BBox Mask
This node fits an image <b>inside the bounding box region of a mask</b> and places it into a destination image (or a blank canvas). It’s useful for workflows where you want to insert or align a smaller image (e.g. pose, object, logo, patch) into a specific masked region while keeping correct proportions.
This node does the following:
- Detects the bounding box (BBox) of your input mask — that is, the smallest rectangle that covers all white/non-zero pixels.
- Resizes the source image to fit inside (or cover) that bounding box, preserving aspect ratio.
- Places the resized image at the corresponding position in the destination image.
- Outputs the final composited image, a stand-alone fitted image, and a mask showing the exact placed region.

You can find an example workflow [here](https://github.com/user-attachments/assets/fb344190-206b-4c15-93ae-cac05c8b6740) for the images generated in the gif below(download and drop the workflow image into comfyui).

<img width="1567" height="732" alt="Image" src="https://github.com/user-attachments/assets/ce8aa314-33e0-408f-b1dc-c98f966ea1a4" />

<img width="512" height="512" src="https://github.com/user-attachments/assets/8c4d8a46-42e9-4da0-ab72-7d00b5bd7d8f"/>

## Changelog
### v.1.4.0
- added the "(Impact-Pack) Multiline Wildcard Text"-Node that provides a simple multiline text field with a wildcard selector that automatically appends selected wildcards. 

### v1.3.1
* fixed a bug where the ``Power Lora Loader to Prompt (Image Saver)`` could not gather the information of the loras if they were qwen, flux or lumina2 (Z-IMG)

### v1.3.0
* added new ``Power Lora Loader to Prompt (Image Saver)``-Node to the utility group. This Node can read the loras of a Power Lora Loader from rgthree and append them to a text string - this is helpful in combination with the Image Saver Node from alexopus to persist loras & their weights.

### v1.2.0
* added documentation including input & output parameters for every single node, viewable via the in-comfy node info view
* changed some of the texts in readme & removed parameter documentation from readme
* changed folder structure to include docs alongside js

### v1.1.3
* added new ``Fit Image into BBox Mask``-Node in it's own ``vsLinx/inpaint`` node-library. This node fits an image <b>inside the bounding box region of a mask</b> and places it into a destination image (or a blank canvas). It’s useful for workflows where you want to insert or align a smaller image (e.g. pose, object, logo, patch) into a specific masked region while keeping correct proportions. It's intended to be used in an inpainting process where you'll pre-process this image and execute a controlnet on the masked area. An example and can be found in the node description above.

### v1.1.2
* The ``Forward/Bypass on Boolean (Any)`` and ``Forward/Mute on Boolean (Any)`` now search for the parent boolean value(s) of the upstream nodes if they're either ``Boolean AND Operator``, ``Boolean OR Operator`` or ``Boolean flip`` to ensure bypassing even if boolean value is passed by a node instead of the in-node switch.

### v1.1.1
* added ``Forward/Bypass on Boolean (Any)`` that lets you bypass directly connected node(s) based on a boolean value
* added ``Forward/Mute on Boolean (Any)`` that lets you mute directly connected node(s) based on a boolean value
* added ``Boolean AND Operator`` that returns true if both of it's boolean inputs are true, otherwise returns false
* added ``Boolean OR Operator`` that returns true if either of it's boolean inputs are true, otherwise returns false
* added ``Boolean flip`` that flips a boolean value: True becomes False, False becomes True.
* added descriptions for the ``Load (Multiple) Images (List/Batch)``-Nodes 

### v1.0.1 
* added ``fail_if_empty`` property in Properties (default true) to stop graph when selection resolves to no images
* improved runtime errors when files are missing from input (clear “No valid images found…” message)
* check for removed/missing files against server (HEAD/GET) after load/upload and before preview
* preview no longer prunes on browser decode failure; it’s best-effort and non-blocking
* de-duplicate selections (order-preserving) and respect ``max_images`` cap
* auto-prune missing files from ``selected_paths`` after restarts or external deletions
* renamed nodes (display names only; IDs unchanged for backward compatibility)

### v1.0.0 
* initial release