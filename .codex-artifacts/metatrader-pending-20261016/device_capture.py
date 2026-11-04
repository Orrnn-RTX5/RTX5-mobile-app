import pathlib
import subprocess
import sys
import time

folder = pathlib.Path(__file__).resolve().parent
name = sys.argv[1]
action = sys.argv[2:]

def adb(args, timeout=5):
    try:
        result = subprocess.run(['adb', *args], capture_output=True, text=True, timeout=timeout)
        if result.returncode:
            print(result.stderr or result.stdout)
        return result.returncode
    except subprocess.TimeoutExpired:
        print('ADB response timed out; inspect the fresh screenshot before any retry:', args)
        return None

if action:
    adb(['shell', '-n', 'input', *action])
    time.sleep(0.35)
remote = '/sdcard/mt5-' + name + '.png'
adb(['shell', '-n', 'screencap', '-p', remote])
code = adb(['pull', remote, str(folder / (name + '.png'))])
if code != 0:
    sys.exit(1)
print(str(folder / (name + '.png')))
