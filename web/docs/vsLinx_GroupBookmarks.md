This is a UI-only utility node for bookmarking workflow groups. It adds a collapsible <b>side panel</b> on the right edge of the ComfyUI canvas that lists your bookmarked groups. Clicking any entry in the panel instantly jumps to that group and fits it into view. Groups can be organized into collapsible <b>sections</b> inside the panel. The panel state (open/collapsed sections, shown/hidden) is saved with the workflow.

This node does the following:
- Adds a persistent side panel on the right edge of the canvas listing all bookmarked groups.
- Clicking a bookmark entry in the panel centers the canvas on that group and zooms to fit it into view (equivalent to the "." shortcut).
- Groups in the panel can be organized into named **sections** that can be expanded and collapsed independently.
- Sections and their collapsed state, as well as the panel's shown/hidden state, are all saved with the workflow and restored on reload.
- The panel hides itself automatically when no bookmark node exists in the workflow or no groups have been bookmarked.

Buttons:
| Button | Description |
| -------- | ----------- |
| Manage Bookmarks | Opens the bookmark manager modal where you can select groups and organize them into sections. |

Modal — Manage Bookmarks:
| Area | Description |
| -------- | ----------- |
| All Groups (left) | Lists every group currently in the workflow. Click a group to add it to your active bookmarks. Active entries are highlighted. Click again to remove. |
| Active Bookmarks (right) | Shows the current bookmark list in the order they will appear in the panel. Drag the handle (⠿) to reorder entries. |
| + Add Section | Adds a new section header to the active bookmarks list. The label is editable inline — click it to rename. Drag a group on top of a section to place it inside. Sections can contain multiple groups and appear as collapsible categories in the side panel. |
| Confirm | Saves the current bookmark list and section layout to the node and updates the side panel. |

Notes:
- Drag a group entry onto a section header in the modal to nest it inside that section. The section will highlight in blue to confirm the drop target.
- Dragging a nested group out of its section and into an empty area or between other entries moves it back to the root level.
- The drop indicator (a blue line) shows exactly where the dragged item will land before you release.
- A section can be renamed at any time by clicking its label in the modal. Press Enter or click away to confirm.
- Removing a section (✕) removes the section header only — nested groups are deleted along with it. Re-add them from the left column if needed.
- The side panel's toggle button (the narrow tab on the right edge) shows/hides the panel inner contents. This state is saved with the workflow.
- Bookmark entries that reference a group no longer present in the workflow are shown in italic and cannot be clicked. They are preserved in the list so they reactivate if the group is added back.
- Multiple Group Bookmarks nodes in the same workflow are supported. Each node maintains its own independent bookmark list and the side panel merges all of them in order, deduplicating groups that appear in more than one node.
