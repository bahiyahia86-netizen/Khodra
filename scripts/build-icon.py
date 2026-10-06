from pathlib import Path
import struct

source = Path(r"public\icons\ChatGPT Image Oct 6, 2026, 09_59_38 AM.png")
target = Path(r"public\icons\icon.ico")

png = source.read_bytes()
if png[:8] != b"\x89PNG\r\n\x1a\n":
    raise ValueError("The selected icon is not a valid PNG file")

width = struct.unpack(">I", png[16:20])[0]
height = struct.unpack(">I", png[20:24])[0]

# ICO header: reserved, type 1 (ICON), number of entries.
# Each entry stores a PNG payload, which preserves alpha transparency.
header = struct.pack("<HHH", 0, 1, 1)
entry = struct.pack(
    "<BBBBHHII",
    0,
    0,
    0,
    0,
    1,
    32,
    len(png),
    len(header) + 16,
)
target.write_bytes(header + entry + png)

print(f"Created {target} ({target.stat().st_size} bytes, {width}x{height})")
