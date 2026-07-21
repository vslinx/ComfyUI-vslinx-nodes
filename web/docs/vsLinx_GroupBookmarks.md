This is a UI-only utility node for bookmarking parts of your workflow. It adds a collapsible <b>side panel</b> on the right edge of the ComfyUI canvas that lists your bookmarks. You can bookmark <b>whole groups</b> as well as <b>individual nodes</b>. Clicking any entry in the panel instantly jumps to that group or node and fits it into view. Bookmarks can be organized into collapsible <b>sections</b>. The panel state (open/collapsed sections, shown/hidden) is saved with the workflow.

This node does the following:
- Adds a persistent side panel on the right edge of the canvas listing all bookmarked groups and nodes.
- Clicking a <b>group</b> bookmark centers the canvas on that group and zooms to fit it into view. Clicking a <b>node</b> bookmark centers on and selects that node.
- Bookmarks in the panel can be organized into named <b>sections</b> that can be expanded and collapsed independently.
- Sections and their collapsed state, as well as the panel's shown/hidden state, are all saved with the workflow and restored on reload.
- The panel hides itself automatically when no bookmark node exists in the workflow or nothing has been bookmarked.

Buttons:
| Button | Description |
| -------- | ----------- |
| Manage Bookmarks | Opens the bookmark manager modal where you can pick groups and nodes and organize them into sections. |

Modal — Manage Bookmarks:
| Area | Description |
| -------- | ----------- |
| Groups & Nodes (left) | A searchable tree of everything in the workflow. Each group shows a node count and an expand arrow (▸). Click the group name (or the <b>+</b>) to bookmark the whole group. Click the arrow to expand the group and reveal the nodes inside it, then click a node (or its <b>+</b>) to bookmark just that node. Nodes that don't belong to any group are listed at the bottom under <b>Ungrouped nodes</b>. A green ✓ marks anything already bookmarked. |
| Search | Filters the tree by group and node name; matching groups auto-expand. Click the × in the field to clear it. |
| Active Bookmarks (right) | Shows your current bookmarks in the order they will appear in the panel. Each entry has a <b>GROUP</b> or <b>NODE</b> tag; node entries also show the group they live in (<code>in &lt;group&gt;</code>). Drag the handle (⠿) to reorder entries. Click the × to remove one. |
| + Add Section | Adds a new section header to the active bookmarks list. The label is editable inline — click it to rename. Any bookmarks placed after a section header (drag to reorder) belong to it and appear as a collapsible category in the side panel. |
| Confirm | Saves the current bookmark list and section layout to the node and updates the side panel. |

Notes:
- In the side panel each entry carries a small glyph so groups and nodes are easy to tell apart: a hollow blue square marks a <b>group</b>, a filled amber dot marks a <b>node</b>. A legend at the bottom of the panel shows both.
- Sections are flat dividers: every bookmark listed after a section header (until the next section) belongs to that section. Drag entries with the ⠿ handle to move them above or below a section. Bookmarks placed before the first section are always shown at the top level of the panel.
- A section can be renamed at any time by clicking its label in the modal. Press Enter or click away to confirm.
- Removing a section (×) removes the section header only; the bookmarks that were under it move up to the previous section (or to the top level).
- The blue drop indicator line shows exactly where the dragged item will land before you release.
- The side panel's toggle button (the narrow tab on the right edge) shows/hides the panel contents. This state is saved with the workflow.
- Node bookmarks are tracked by the node's id, so renaming a node keeps its bookmark working (the panel shows the node's current title). Bookmarks whose group or node no longer exists in the workflow are shown greyed-out in italic and cannot be clicked; they stay in the list so they reactivate if the group/node returns.
- Multiple Bookmarks nodes in the same workflow are supported. Each node maintains its own independent bookmark list and the side panel merges all of them in order, de-duplicating groups and nodes that appear in more than one node.
