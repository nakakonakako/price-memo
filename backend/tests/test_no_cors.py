import unittest

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CORS_RESPONSE_HEADERS = (
    "access-control-allow-origin",
    "access-control-allow-credentials",
)


class TestNoCorsMiddleware(unittest.TestCase):
    def test_root_get_usable(self) -> None:
        response = client.get("/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["feature"], "B")
        self.assertIn("price-memo", body["message"])

    def test_options_with_origin_has_no_cors_headers(self) -> None:
        response = client.options(
            "/",
            headers={"Origin": "https://arbitrary.example"},
        )
        for header in CORS_RESPONSE_HEADERS:
            self.assertNotIn(header, response.headers)


if __name__ == "__main__":
    unittest.main()
