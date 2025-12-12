# (Impact-Pack) Multiline Wildcard Text

Provides a **multiline text input node** tailored for Impact-Pack wildcards.  
Works like the default multiline STRING node, but adds a second-line dropdown that lets you **insert wildcard tokens** directly into the text field.

This node does the following:
- Provides a standard **multiline STRING input** for your prompt text.
- Adds a frontend **“Add wildcard”** dropdown below the text field.
- Populates the dropdown with available wildcard names detected from your setup.
- When you select a wildcard from the dropdown, it is appended to the `text` field, automatically adding `", "` first if the current text doesn’t already end with a comma.
- Can still be used as a normal multiline text node even if no wildcards are available.

---

## Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| text      | STRING | Base prompt text. This is a standard multiline STRING input; selecting wildcards from the dropdown appends them directly into this field. |

---

## Outputs

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| string    | STRING | The final prompt text, including any wildcards you added via the dropdown. |

---

## Notes

- The dropdown always works on the **visible text field**. You can freely edit, remove, or rearrange wildcard tokens after inserting them.
- If no wildcards are detected, the dropdown will indicate that none are available, and you can still type your prompt manually as usual.
- This node does not process the wildcards, it's only used to give a clean interface to add the wildcards to a multiline string, you'll have to connect it to the "Populated Prompt"-Field in the Impact-Pack "ImpactWildcardProcessor"-Node