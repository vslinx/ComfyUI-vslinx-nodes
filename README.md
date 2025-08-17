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
### Load Selected Images (List)
Provides a simple node with a “Select Images” button that lets you choose one or multiple images. After selection, the images are uploaded to your input folder in ComfyUI (the same behavior as the default Load Image node). The node also includes a preview of the selected images: you can click on an image to switch from the tile view to a full image view. Clicking the X returns you to the tile view, while the numbering in the bottom-right corner allows you to switch between images. <br>
<b>The images are returned as an image list, allowing downstream nodes to process them one after another.</b> <br>
<img width="1196" height="646" alt="Image" src="https://github.com/user-attachments/assets/111df53e-4f31-4320-80d7-81a61d57f0b0" />

### Load Selected Images (Batch)
This node works the same way as the [Load Selected Images (List)](#load-selected-images-list)-Node but <b>the images are returned as a batch, allowing downstream nodes to process them together.</b>


## Changelog
* v1.0.0: initial release