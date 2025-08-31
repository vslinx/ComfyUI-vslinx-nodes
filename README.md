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
### Load (Multiple) Images (List)
Provides a simple node with a “Select Images” button that lets you choose one or multiple images. After selection, the images are uploaded to your ``input`` folder in ComfyUI (the same behavior as the default Load Image node). The node also includes a preview of the selected images: you can click on an image to switch from the tile view to a full image view. Clicking the X returns you to the tile view, while the numbering in the bottom-right corner allows you to switch between images. <br>
The node includes a ``max_images`` property that defines how many images can be loaded. If set to 0 or left empty, the number of allowed images is unlimited. <br>
It also includes a ``fail_if_empty`` property to throw an error if no elements are being passed, likely caused by images having been deleted or moved from the input folder.
<b>The images are returned as an image list, allowing downstream nodes to process them one after another.</b> <br>
<img width="1196" height="646" alt="Image" src="https://github.com/user-attachments/assets/111df53e-4f31-4320-80d7-81a61d57f0b0" />

### Load (Multiple) Images (Batch)
This node works the same way as the [Load (Multiple) Images (List)](#load-multiple-images-list)-Node but <b>the images are returned as a batch, allowing downstream nodes to process them together.</b>


## Changelog
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