"""Run a real scan once in a read-only ttyd PTY and retain its live output."""
import datetime
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
evidence = Path(__file__).resolve().parent
phase = sys.argv[1]
if phase not in ('before', 'after', 'capture-probe'):
    raise SystemExit('Unknown phase')
out = evidence / phase
out.mkdir(exist_ok=False)
cmd = ['node', '--import', str(evidence / 'capture.mjs'),
       str(root / 'packages/cli/dist/evergreen.mjs'), 'scan',
       'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L']
env = {'PATH': os.environ['PATH'], 'TERM': 'xterm-256color', 'NO_COLOR': '1',
       'SOROBAN_RPC_URL': 'https://soroban-testnet.stellar.org/',
       'EVERGREEN_CAPTURE_DIR': str(out)}
print(f'LIVE CLI SCAN: {phase} | {datetime.datetime.now(datetime.timezone.utc).isoformat()}', flush=True)
print('$ node packages/cli/dist/evergreen.mjs scan ' + cmd[-1], flush=True)
with (out / 'stdout.txt').open('xb') as log, (out / 'stderr.txt').open('xb') as err:
    proc = subprocess.Popen(cmd, cwd=root, env=env, stdout=subprocess.PIPE, stderr=err)
    for chunk in iter(lambda: proc.stdout.read1(4096), b''):
        log.write(chunk)
        log.flush()
        sys.stdout.buffer.write(chunk)
        sys.stdout.buffer.flush()
    code = proc.wait()
(out / 'run.json').write_text(json.dumps({'argv':cmd, 'exitCode':code,
    'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}, indent=2)+'\n')
print(f'\nCLI exit: {code} | scan finished; terminal held for screenshot', flush=True)
signal.pause()
