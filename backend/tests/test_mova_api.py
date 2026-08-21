"""MOVA backend API tests - covers auth, safety, SOS, bugs, location, admin gating, transit."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://safe-commute-18.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@mova.app"
ADMIN_PASSWORD = "mova@admin123"


def _client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin():
    s = _client()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["role"] == "admin"
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data


@pytest.fixture(scope="module")
def user():
    s = _client()
    email = f"test_{uuid.uuid4().hex[:8]}@mova.app"
    r = s.post(f"{API}/auth/register", json={
        "name": "Test User", "email": email, "password": "test1234",
        "alt_name": "Family", "alt_phone": "+91-9999999999"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data


# ---------- Health ----------
def test_api_root():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert "MOVA" in r.json()["message"]


# ---------- Auth ----------
def test_register_duplicate_rejected(user):
    s, u = user
    r = s.post(f"{API}/auth/register", json={
        "name": "x", "email": u["email"], "password": "x"
    })
    assert r.status_code == 400


def test_login_invalid():
    r = requests.post(f"{API}/auth/login", json={"email": "nope@x.com", "password": "bad"})
    assert r.status_code == 401


def test_auth_me(user):
    s, u = user
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == u["email"]
    assert body["role"] == "user"
    assert "password_hash" not in body
    assert "_id" not in body


def test_auth_me_unauth():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


# ---------- Safety Check-in ----------
def test_safety_checkin(user):
    s, u = user
    r = s.post(f"{API}/safety/checkin", json={"alt_name": "Mom", "alt_phone": "+91-9111122223"})
    assert r.status_code == 200
    assert r.json()["alt_phone"] == "+91-9111122223"
    # verify persisted
    me = s.get(f"{API}/auth/me").json()
    assert me["alt_name"] == "Mom"
    assert me["alt_phone"] == "+91-9111122223"


# ---------- SOS ----------
def test_sos_create_and_admin_sees(user, admin):
    s, u = user
    r = s.post(f"{API}/sos", json={"lat": 20.3558, "lng": 85.8175, "message": "help"})
    assert r.status_code == 200
    sos = r.json()
    assert sos["user_email"] == u["email"]
    assert "_id" not in sos

    # non-admin cannot list all
    r2 = s.get(f"{API}/sos/all")
    assert r2.status_code == 403

    admin_s, _ = admin
    r3 = admin_s.get(f"{API}/sos/all")
    assert r3.status_code == 200
    ids = [d["id"] for d in r3.json()]
    assert sos["id"] in ids


# ---------- Location ----------
def test_location_update_and_admin_list(user, admin):
    s, _ = user
    r = s.post(f"{API}/location/update", json={"lat": 20.35, "lng": 85.82})
    assert r.status_code == 200

    r2 = s.get(f"{API}/location/all")
    assert r2.status_code == 403

    admin_s, _ = admin
    r3 = admin_s.get(f"{API}/location/all")
    assert r3.status_code == 200
    assert isinstance(r3.json(), list)


# ---------- Bugs ----------
def test_bugs_flow(user, admin):
    s, u = user
    r = s.post(f"{API}/bugs", json={"title": "TEST_bug", "description": "desc", "category": "bug"})
    assert r.status_code == 200
    bid = r.json()["id"]

    # user sees own bugs
    my = s.get(f"{API}/bugs").json()
    assert any(b["id"] == bid for b in my)

    # admin sees all
    admin_s, _ = admin
    all_bugs = admin_s.get(f"{API}/bugs").json()
    assert any(b["id"] == bid for b in all_bugs)


# ---------- Transit / Police ----------
def test_transit_stops():
    r = requests.get(f"{API}/transit/stops")
    assert r.status_code == 200 and len(r.json()) >= 4


def test_transit_routes():
    r = requests.get(f"{API}/transit/routes")
    assert r.status_code == 200 and len(r.json()) >= 2


def test_police():
    r = requests.get(f"{API}/safety/police")
    assert r.status_code == 200 and len(r.json()) >= 1


# ---------- Logout ----------
def test_logout(user):
    s, _ = user
    r = s.post(f"{API}/auth/logout")
    assert r.status_code == 200
