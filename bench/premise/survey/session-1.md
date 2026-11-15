Session 1 (`session_01N4DAa8HntRUsVQAvkJPpeo`, model `claude-opus-5-5`, no repository). Questions: python-dict, ext4-space, poppy, monty-hall, gtfs, string-length. The session's final message, verbatim:

1. **Deleted dictionary slot.** Python's dict uses open addressing. When a key's home slot is already taken, the key goes into the next slot along a fixed probe sequence. A lookup follows that same sequence and stops when it reaches an empty slot, because an empty slot means "this key was never inserted." Suppose you delete a key by simply emptying its slot. Any key that collided and was placed further along the sequence can no longer be found, because the lookup stops early at the gap and wrongly reports it missing. So deletion leaves a "dummy" marker (a tombstone) instead. Lookups treat it as "occupied, keep probing," and inserts can reuse it. CPython does exactly this with a DKIX_DUMMY entry in its index table, and resizing clears the markers out. (High confidence.)

2. **Empty ext4 space.** Several things take it, and the biggest one isn't actually eaten:
   - **Reserved blocks:** by default 5% of blocks are reserved for root. They are still free, but `df` leaves them out of "Avail." You can change this with `tune2fs -m 1` (or `-m 0` on data-only disks).
   - **Inode tables:** these are preallocated at format time. By default that's one 256-byte inode per 16 KiB of disk, about 1.6% of capacity.
   - **Journal:** usually 128 MiB to 1 GiB depending on filesystem size.
   - **Smaller metadata:** block and inode bitmaps, group descriptors, and backup superblocks.
   - **Units:** much of the "missing" space is just GB vs GiB. A "1 TB" disk is about 931 GiB.

   (High confidence.)

3. **Poppy.** I don't recognise a "Personal Agent Protocol" or "Poppy," so I can't describe it reliably. Treat the following as a guess. Protocols like this usually look like OAuth adapted for agents:
   - you grant your agent scoped, revocable permission to act for you ("may buy up to $100 at this store," "may start returns");
   - merchants publish what actions they accept in a machine-readable form;
   - the agent shows a signed credential with each request, so the merchant can check who it represents and what it's allowed to do;
   - risky steps go back to you for confirmation;
   - every action produces a receipt or audit trail.

   Check this against the spec's own overview; I have low confidence in any detail.

4. **Monty Hall.** The 2-in-3 depends on three rules: the host knows where the car is, always opens a door you didn't pick, and always reveals a goat. Under those rules, opening a door tells you nothing new about *your* door, so it keeps its 1/3 chance. The remaining 2/3 that the car was behind one of the other two doors all moves onto the one he left closed. Change the rule and the answer changes:
   - If the host opens a door at random and it just happens to show a goat, switching and staying are each 1/2.
   - If he offers a switch only when you picked the car, switching always loses.

   The odds come from the host's rule, not from the doors. (High confidence.)

5. **GTFS route with no departures.** A route doesn't carry a schedule itself. Each trip in `trips.txt` names a `service_id`, and that ID's dates are set in two files:
   - `calendar.txt` gives weekday on/off flags plus a start and end date.
   - `calendar_dates.txt` adds dates (exception_type 1) or removes them (exception_type 2).

   Common reasons for no departures today:
   - today falls outside the start–end range, because the feed has expired;
   - today's weekday flag is 0;
   - a holiday removal in `calendar_dates.txt`;
   - service defined only in `calendar_dates.txt`, with nothing listed for today.

   Also, times past 24:00, such as 25:10, belong to the *previous* service day. Late-night trips can therefore appear under "yesterday." (High confidence.)

6. **Three lengths.** "Length" can count three different things:
   - **Bytes:** the encoded size. In UTF-8 a character takes 1–4 bytes.
   - **Code points or code units:** code points are the numbered characters in Unicode, and Python counts these. JavaScript, Java and C# instead count UTF-16 units, where some characters take two.
   - **Grapheme clusters:** what a person sees as one character. Swift counts these.

   For example, 👍🏽 is 1 grapheme, 2 code points, 4 UTF-16 units and 8 UTF-8 bytes. A decomposed "é" (e plus a combining accent) is 1 grapheme, 2 code points and 3 bytes. Rules of thumb:
   - Size storage in bytes, and check whether your database counts bytes or characters. MySQL utf8mb4 VARCHAR(n) counts characters.
   - Apply user-facing "max 10 characters" limits to graphemes.
   - Normalize the text (e.g. NFC) before comparing or counting.

   (High confidence.)
