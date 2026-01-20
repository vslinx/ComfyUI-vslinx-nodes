This node helps you build prompts from one or more CSV “prompt lists”. For each row you pick one or more entries (or choose `Random`), and the node combines everything into one final prompt — plus two preview outputs so you can see what was chosen.

It’s especially useful if you write prompts in another language (Chinese, Japanese, Spanish, etc.) but want the final output to be English prompt text. You can keep a CSV where the **left column is your native-language key** and the **right column is the English prompt text**.

Example CSV (2 columns):
- `猫` → `cat, cute, fluffy`
- `夜景` → `night cityscape, neon lights`

You can then select `猫` inside the node UI (in your language), and the node will output the matching English prompt text.

## How it works
- Click **Select CSV File** to open the CSV manager.
- From there you can:
  - Upload one or more CSV files
  - Create folders to organize your CSV libraries
  - Browse and select existing CSVs (including subfolders)
- Each selected CSV becomes a row inside the node.
- Rows can be **freely reordered** by dragging them using the dotted handle on the left.
- Click the **filename** in a row to switch that row to another CSV that already exists in `input/csv` (including subfolders).
- For each CSV row, choose:
  - `(None)` → ignore this row
  - `Random` → pick a random entry from that CSV (controlled by the node’s seed)
  - One or more labels from the CSV (via multi-select)
- Each row (CSV rows *and* additional prompt rows) has its own **comma toggle** and **remove button**. 
  - The remove button will remove the entry from the list
  - The comma toggle will add a comma at the end of the entry during output, if not already present. (Default activated)

## Selection & Multi-Select
- Clicking the selection field opens a searchable list of all labels from the first CSV column.
- You can **filter/search** the list to quickly find entries.
- Enable **multi-select mode (⧉ icon)** to select multiple labels from the same CSV.
- Confirm multi-selection by clicking the **✓ icon**.
- Selected items are applied **in the order you chose them**, and this order is preserved in the final prompt.
- When multiple labels are selected, the row shows a compact indicator (e.g. “3 selected”), while the full list is visible in the preview outputs.

## Additional Prompt Rows
- Click **Add empty prompt** to insert a new free-form prompt row.
- These rows allow you to enter custom text (including multi-line prompts) that will be inserted at the end of the current list.

## CSV Manager (Select CSV File)
The **Select CSV File** button opens a powerful CSV manager that lets you fully manage your prompt libraries.

### Features
- Create folders inside `ComfyUI/input/csv`
- Upload CSV files:
  - Into the root folder
  - Or directly into a selected folder
- Select **multiple CSV files at once**
- Select **entire folders**, including all subfolders
- Create new subfolders inside folders by marking a folder and then clicking **Create Folder**

### Folder & File Selection Behavior
- Selecting a folder selects all CSV files inside it (including subfolders).
- Subfolders are also visually marked when included via a parent folder.
- You can:
  - Deselect individual files inside a selected folder
  - Deselect entire subfolders
  - Re-select individual files inside a deselected subfolder
- This allows precise control over which files are included, even with large folder hierarchies.

### Adding Files
- After selecting files and/or folders, click **Add** to insert them into the node.
- Each selected CSV becomes its own row.
- Files are added in a predictable, stable order.

## CSV Format
- Only the **first two columns** are used:
  - Column 1 = the key/label you choose in the node (can be your native language)
  - Column 2 = the text that will be added to the final prompt (often English prompt text)
- Rows with an empty key are ignored.
- If the same key appears multiple times, the **last one** is used.

## Parameters
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| seed | INT | Seed used for `Random` selections when the workflow seed mode is fixed / increment / decrement / randomize. |
| pre_prompt | STRING (input) | Optional text that is prepended to the generated prompt. If both `pre_prompt` and the generated prompt are present, they are joined with a space (or directly if punctuation already matches). |
| pre_selection | STRING (input) | Optional text that is prepended to the generated selection preview. If both `pre_selection` and the generated prompt are present, they are joined with a new line (or directly if punctuation already matches). This allows chaining of multiple of these nodes in a workflow and providing a full preview of the selection. |
| pre_preview | STRING (input) | Optional text that is prepended to the generated selection preview. If both `pre_preview` and the generated prompt are present, they are joined with a new line (or directly if punctuation already matches). This allows chaining of multiple of these nodes in a workflow and providing a full preview of the preview selection. |

## Outputs
| Output | Type | Description |
| ----- | ---- | ----------- |
| prompt | STRING | The combined prompt text from all active rows, processed top to bottom. |
| selection_preview | STRING | A multi-line preview showing which labels were selected in each row (including multi-select and Random). |
| output_preview | STRING | A multi-line preview showing what each row contributed to the final prompt text. |

## Notes
- Only `.csv` files are supported.
- CSV files can be organized freely into subfolders under `input/csv`.
- The CSV manager supports:
  - Filename search
  - Searching **inside CSV contents** (both columns) via the **In Contents?** toggle
- `Random` picks are resolved at execution time using the node’s seed behavior.
- Duplicate handling during upload:
  - If a file with the same name **and identical content** already exists *in the target folder*, it is reused.
  - If a file with the same name but different content exists *in the same folder*, you can overwrite, rename, or cancel.
  - The same CSV file can exist in **multiple different folders** without conflict.
- If you try to switch a row to a CSV that’s already used by another row, the node avoids duplicates by removing the conflicting row.
- Row order always matters: rows are processed **top to bottom**, exactly as shown in the UI.
- You can clear all rows at once using **Clear**, which includes a confirmation dialog to prevent accidental data loss.