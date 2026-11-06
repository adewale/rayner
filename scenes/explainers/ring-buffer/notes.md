# Construction and scope

Five slots make both wraparound and the full/empty ambiguity visible without hiding values. The operations setting compares reuse after two pops with refusal when no capacity remains. Queue order must be read from head; sorting the displayed slots or reading left to right would erase the lesson.

`RingBuffer` in `../lib/models.ts` is checked against a reference queue. It tracks length and refuses pushes when full; neither that bookkeeping choice nor that overflow policy defines all ring buffers. The array comparison follows [ECMAScript's Array.prototype.shift algorithm](https://tc39.es/ecma262/2025/#sec-array.prototype.shift); engines can optimize storage, so the logical move counts are not timing measurements. The model omits concurrent producers/consumers and memory-ordering requirements.

The scene also draws on the [Lantern ring-buffer example](https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/ring-buffer.doc.json).
