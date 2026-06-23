Selects an <b>Anima ControlNet-LLLite</b> weights file and outputs its filename, so the LLLite model can be chosen once and routed into one or more <b>Anima LLLite Tiled ControlNet Sampler</b> nodes from outside (instead of picking it on each sampler's dropdown).

Connect its output to the sampler's <code>lllite_name</code> input to drive the LLLite selection from outside. It outputs the same controlnet combo type, so it plugs straight in.

This node only outputs the filename — the actual LLLite module is built against the diffusion model inside the sampler — so it has no dependency on any other node pack.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| lllite_name | COMBO | Anima ControlNet-LLLite weights file (from the ``controlnet`` folder). |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| lllite_name | COMBO | The selected filename, for the sampler's ``lllite_name`` input. |
