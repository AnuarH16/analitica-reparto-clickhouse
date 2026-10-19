"""Start the shared lab and optionally publish its current tunnel to Vercel."""
import argparse
import json
import re
import subprocess
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ['docker', 'compose', '-f', 'compose.yaml', '-f', 'compose.share.yaml', '--profile', 'atlas']


def tunnel_origin(logs):
    origins = re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com(?=[\s|]|$)', logs)
    if not origins:
        raise ValueError('The tunnel has not published its address yet.')
    return origins[-1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish', action='store_true', help='Update the linked Vercel project and deploy production.')
    args = parser.parse_args()
    sharing = ROOT / 'data/sharing'
    token = (sharing / 'token').read_text().strip()
    if len(token) < 32 or f'ATLAS_SHARE_TOKEN={token}' not in (sharing / 'gateway.env').read_text().splitlines():
        raise SystemExit('The local gateway token files are missing or do not match. See docs/SHARING-VERCEL.md.')
    project = json.loads((ROOT / '.vercel/project.json').read_text()) if args.publish else None
    subprocess.run(COMPOSE + ['up', '-d', '--build', '--wait', '--wait-timeout', '120',
                             'clickhouse', 'atlas', 'share-gateway', 'share-tunnel'], cwd=ROOT, check=True)
    deadline = time.monotonic() + 90
    while True:
        try:
            logs = subprocess.run(COMPOSE + ['logs', '--no-color', 'share-tunnel'],
                                  cwd=ROOT, check=True, capture_output=True, text=True)
            origin = tunnel_origin(logs.stdout + logs.stderr)
            for endpoint in ('status', 'operations'):
                request = Request(origin + '/api/' + endpoint, headers={'Authorization': 'Bearer ' + token})
                with urlopen(request, timeout=10) as response:
                    json.load(response)
            break
        except (OSError, ValueError) as error:
            if time.monotonic() >= deadline:
                raise SystemExit('The authenticated tunnel did not become ready. No Vercel deployment was published.')
            print('Waiting for authenticated tunnel:', type(error).__name__, flush=True)
            time.sleep(1)
    (sharing / 'origin').write_text(origin + '\n')
    print('Authenticated tunnel ready:', origin, flush=True)
    if args.publish:
        scope = project['orgId']
        print('Publishing linked Vercel project:', project['projectName'], flush=True)
        for environment in ('preview', 'production'):
            subprocess.run(['vercel', 'env', 'update', 'ATLAS_SHARE_ORIGIN', environment, '--yes', '--scope', scope],
                           input=origin + '\n', text=True, cwd=ROOT, check=True)
        subprocess.run(['vercel', 'deploy', '--prod', '--yes', '--scope', scope], cwd=ROOT, check=True)
    else:
        print('Use --publish to update the linked Vercel deployment with this address.')


if __name__ == '__main__':
    main()
