"""MineHost backend API tests (real Minecraft server lifecycle)."""
import os
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- module: versions + property schema (read-only) ---
class TestMeta:
    def test_root(self, client):
        r = client.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        assert r.json()["message"] == "MineHost API"

    @pytest.mark.parametrize("stype", ["vanilla", "paper", "fabric", "forge"])
    def test_versions(self, client, stype):
        r = client.get(f"{API}/versions/{stype}", timeout=60)
        assert r.status_code == 200, r.text
        versions = r.json()["versions"]
        assert isinstance(versions, list)
        assert len(versions) > 0, f"empty version list for {stype}"
        assert all(isinstance(v, str) for v in versions)

    def test_versions_invalid_type(self, client):
        r = client.get(f"{API}/versions/bogus", timeout=30)
        assert r.status_code == 400

    def test_property_schema(self, client):
        r = client.get(f"{API}/property-schema", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["schema"], (list, dict))
        assert isinstance(data["groups"], list) and len(data["groups"]) > 0
        assert len(data["schema"]) > 10

    def test_get_missing_server_404(self, client):
        r = client.get(f"{API}/servers/does-not-exist", timeout=30)
        assert r.status_code == 404

    def test_create_invalid_type(self, client):
        r = client.post(f"{API}/servers", json={"name": "TEST_bad", "type": "nope",
                                                "mc_version": "1.21.4"}, timeout=30)
        assert r.status_code == 400


# --- module: full real-server lifecycle (paper 1.21.4) ---
class TestLifecycle:
    server_id = None

    def _poll_status(self, client, sid, target, timeout):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            r = client.get(f"{API}/servers/{sid}", timeout=30)
            assert r.status_code == 200, r.text
            last = r.json()["status"]
            if last == target:
                return True
            if last == "error":
                pytest.fail(f"server entered error state: {r.json().get('message')}")
            time.sleep(3)
        pytest.fail(f"timeout waiting for {target}, last status={last}")

    def test_01_create(self, client):
        r = client.post(f"{API}/servers", json={
            "name": "TEST_paper_qa", "type": "paper",
            "mc_version": "1.21.4", "ram_mb": 1024}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_paper_qa"
        assert d["type"] == "paper"
        assert d["mc_version"] == "1.21.4"
        assert d["ram_mb"] == 1024
        assert isinstance(d["port"], int)
        assert d["status"] in ("installing", "stopped")
        TestLifecycle.server_id = d["id"]

        lst = client.get(f"{API}/servers", timeout=30).json()
        assert any(s["id"] == d["id"] for s in lst)

    def test_02_install_completes(self, client):
        assert TestLifecycle.server_id
        self._poll_status(client, TestLifecycle.server_id, "stopped", 180)

    def test_03_properties_get_put(self, client):
        sid = TestLifecycle.server_id
        r = client.get(f"{API}/servers/{sid}/properties", timeout=30)
        assert r.status_code == 200
        props = r.json()["properties"]
        assert "max-players" in props
        r2 = client.put(f"{API}/servers/{sid}/properties",
                        json={"properties": {"motd": "TEST_MOTD_QA", "max-players": "7"}},
                        timeout=30)
        assert r2.status_code == 200
        assert r2.json()["properties"]["motd"] == "TEST_MOTD_QA"
        r3 = client.get(f"{API}/servers/{sid}/properties", timeout=30)
        assert r3.json()["properties"]["motd"] == "TEST_MOTD_QA"
        assert r3.json()["properties"]["max-players"] == "7"

    def test_04_mods_search_install_list_delete(self, client):
        sid = TestLifecycle.server_id
        r = client.get(f"{API}/servers/{sid}/mods/search", params={"q": "worldedit"}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["type"] == "plugin"
        results = data["results"]
        assert len(results) > 0, "no modrinth results"
        assert "project_id" in results[0] and "title" in results[0]

        pid = results[0]["project_id"]
        ri = client.post(f"{API}/servers/{sid}/mods", json={"project_id": pid}, timeout=180)
        assert ri.status_code == 200, ri.text
        fname = ri.json()["filename"]
        assert fname.endswith(".jar")

        rl = client.get(f"{API}/servers/{sid}/mods", timeout=30)
        assert rl.status_code == 200
        assert rl.json()["kind"] == "plugin"
        assert any(m["filename"] == fname for m in rl.json()["mods"])

        rd = client.delete(f"{API}/servers/{sid}/mods/{fname}", timeout=30)
        assert rd.status_code == 200
        assert not any(m["filename"] == fname
                       for m in client.get(f"{API}/servers/{sid}/mods", timeout=30).json()["mods"])

    def test_05_start_and_running(self, client):
        sid = TestLifecycle.server_id
        r = client.post(f"{API}/servers/{sid}/start", timeout=60)
        assert r.status_code == 200, r.text
        self._poll_status(client, sid, "running", 150)

        c = client.get(f"{API}/servers/{sid}/console", params={"since": 0}, timeout=30)
        assert c.status_code == 200
        body = c.json()
        text = "\n".join(l["text"] for l in body["lines"])
        assert "Done (" in text, f"no 'Done (' in console: {text[-800:]}"
        assert body["metrics"]["memory_mb"] > 0, body["metrics"]

    def test_06_command(self, client):
        sid = TestLifecycle.server_id
        r = client.post(f"{API}/servers/{sid}/command", json={"command": "list"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        time.sleep(3)
        c = client.get(f"{API}/servers/{sid}/console", params={"since": 0}, timeout=30)
        text = "\n".join(l["text"] for l in c.json()["lines"])
        assert "> list" in text

    def test_07_backup_while_running(self, client):
        sid = TestLifecycle.server_id
        r = client.post(f"{API}/servers/{sid}/backups", timeout=120)
        assert r.status_code in (200, 400), r.text
        if r.status_code == 200:
            name = r.json()["name"]
            lst = client.get(f"{API}/servers/{sid}/backups", timeout=30).json()["backups"]
            assert any(b["name"] == name for b in lst)
            assert client.delete(f"{API}/servers/{sid}/backups/{name}", timeout=30).status_code == 200

    def test_08_stop(self, client):
        sid = TestLifecycle.server_id
        r = client.post(f"{API}/servers/{sid}/stop", timeout=30)
        assert r.status_code == 200, r.text
        self._poll_status(client, sid, "stopped", 120)

    def test_09_delete(self, client):
        sid = TestLifecycle.server_id
        r = client.delete(f"{API}/servers/{sid}", timeout=60)
        assert r.status_code == 200, r.text
        assert client.get(f"{API}/servers/{sid}", timeout=30).status_code == 404
