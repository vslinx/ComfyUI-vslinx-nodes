# ComfyUI-vslinx-nodes
These custom ComfyUI nodes let you quickly load one or multiple images through the default file dialog. They work like the normal "Load Image" node but support multi-select, so you no longer need to create folders or copy file paths manually. The nodes also include a preview, allowing you to see which images have been selected and switch between them using the standard ComfyUI image preview. There are two versions available: one that outputs the images as a list and another that outputs them as a batch.

## How to Install
### **Recommended**
* Install via [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager).

### **Manual**
* Navigate to `ComfyUI/custom_nodes` in your terminal (cmd).
* Clone the repository under the `custom_nodes` directory using the following command:
  ```
  git clone https://github.com/vslinx/ComfyUI-vslinx-nodes.git comfyui-vslinx-nodes
  ```

## Nodes

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

## Changelog
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