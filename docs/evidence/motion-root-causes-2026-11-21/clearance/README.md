# Clearance of travelling cards, keys and the task list

The old routes cover consent words on both sign-in layouts, the device card during a poll and its reply, the API and MCP lane names, and the task-list heading in both company settings. The repaired routes allow for the full travelling shape at each turn and docking point.

| Route | Step and event | Previous maximum, Resvg | Repaired maximum, Resvg | Previous and repaired, Chromium | Frames per side | Witness |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| api-key (agent:key:flight) | slip / answer | 28 | 0 | 28 / 0 | 103 | [f35](api-key.webp) |
| device-poll (poll) | ask / collect | 104 | 0 | 106 / 0 | 85 | [f31](device-poll.webp) |
| device-poll (poll:back) | ask / collect | 114 | 0 | 116 / 0 | 85 | [f49](device-poll-return.webp) |
| list-honest (list) | board / read tasks | 236 | 0 | 232 / 0 | 67 | [f18](list-honest.webp) |
| list-hostile (list) | board / read tasks | 236 | 0 | 232 / 0 | 67 | [f18](list-hostile.webp) |
| mcp-key (agent:mcp-key:flight) | one-door / answer | 56 | 0 | 56 / 0 | 103 | [f32](mcp-key.webp) |
| password-device (password:travel) | approve / approve-read | 50 | 0 | 49 / 0 | 72 | [f33](password-device.webp) |
| password-direct (password:travel) | approve / approve-read | 52 | 0 | 52 / 0 | 72 | [f27](password-direct.webp) |

Counts are protected-word pixels recovered by removing the travelling shape. The Resvg maxima cover each complete event at 30 fps. Chromium 156.0.8078.4 revision 1248 paints the same four controls independently at the old maximum. The chapter tests also exercise the second approval, the other protected scope or device-card line, and each travel direction on the live scene clock. [Frame measurements and source hashes](receipts.json)

The consent card approaches the phone from the left of its checkbox column and the browser from the right of the scope words. It rises to field height before entering. While a device card occupies the near counter face, the poll stays below it until the whole slip can reach the exposed end. The API key turns below both ends of the label and the MCP key descends beyond the lane name. The task list descends beside the desk heading and crosses below it to the entrance of the tray, clear of the user’s words.

The native control test also places an outlined and then an opaque carrier around the same destination word. The hollow carrier preserves the glyphs while the opaque carrier fails. Missing lettering fails its own witness.
