import unittest

from scripts.start_shared_demo import tunnel_origin


class SharedStartTests(unittest.TestCase):
    def test_uses_the_latest_complete_cloudflare_origin(self):
        logs = '| https://previous-demo.trycloudflare.com |\n| https://current-demo.trycloudflare.com |\n'
        self.assertEqual(tunnel_origin(logs), 'https://current-demo.trycloudflare.com')

    def test_does_not_accept_an_unrelated_host_or_a_cloudflare_suffix_in_a_larger_host(self):
        for logs in ('https://example.com', 'https://demo.trycloudflare.com.example.com', 'http://demo.trycloudflare.com'):
            with self.subTest(logs=logs), self.assertRaises(ValueError):
                tunnel_origin(logs)
