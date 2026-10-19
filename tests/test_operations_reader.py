"""Concurrent viewers share a fresh snapshot and recover after failed reads."""
import json
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.request import urlopen
from uuid import uuid4

from atlas.server import OperationsReader, make_handler


class OperationsReaderTests(unittest.TestCase):
    def test_concurrent_http_viewers_share_one_read(self):
        run = str(uuid4())
        entered, release = threading.Event(), threading.Event()

        class CH:
            calls = 0

            def operations(self, requested_run):
                self.calls += 1
                entered.set()
                if not release.wait(3):
                    raise TimeoutError('test gate')
                return {'run_id': requested_run, 'snapshot_at': self.calls, 'couriers': []}

        ch = CH()
        simulator = type('Simulator', (), {'snapshot': lambda self: {'run_id': run}})()
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(None, ch, None, simulator))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        def get():
            with urlopen(f'http://127.0.0.1:{server.server_port}/api/operations', timeout=5) as response:
                return response.status, json.load(response)

        try:
            with ThreadPoolExecutor(max_workers=6) as pool:
                futures = [pool.submit(get) for _ in range(6)]
                self.assertTrue(entered.wait(2))
                release.set()
                results = [future.result(6) for future in futures]
            self.assertEqual(ch.calls, 1)
            self.assertEqual(results, [(200, {'run_id': run, 'snapshot_at': 1, 'couriers': []})] * 6)
        finally:
            release.set()
            server.shutdown()
            server.server_close()
            thread.join(2)

    def test_freshness_starts_when_read_completes_and_expired_data_is_refreshed(self):
        now = [0]

        class CH:
            calls = 0

            def operations(self, run):
                self.calls += 1
                now[0] += 5  # A slow read must still be fresh for waiting viewers.
                return {'run_id': run, 'snapshot_at': self.calls}

        ch = CH()
        reader = OperationsReader(ch)
        with patch('atlas.server.time.monotonic', side_effect=lambda: now[0]):
            first = reader.get('active')
            now[0] += 1
            self.assertEqual(reader.get('active'), first)
            now[0] += 1
            self.assertEqual(reader.get('active')['snapshot_at'], 2)
            self.assertEqual(reader.get('other')['run_id'], 'other')
        self.assertEqual(ch.calls, 3)

    def test_failed_reads_are_retried_instead_of_serving_a_success_or_cached_error(self):
        class CH:
            calls = 0

            def operations(self, run):
                self.calls += 1
                if self.calls == 1:
                    raise OSError('temporary database failure')
                return {'run_id': run, 'couriers': []}

        ch = CH()
        reader = OperationsReader(ch)
        with self.assertRaises(OSError):
            reader.get('active')
        self.assertEqual(reader.get('active'), {'run_id': 'active', 'couriers': []})
        self.assertEqual(ch.calls, 2)


if __name__ == '__main__':
    unittest.main()
