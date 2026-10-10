from pathlib import Path
import subprocess
import sys

script = Path(__file__).with_suffix(".ps1")
result = subprocess.run(
    ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
    check=False,
)
sys.exit(result.returncode)
