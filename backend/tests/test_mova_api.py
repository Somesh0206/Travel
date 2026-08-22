"""MOVA backend API tests - covers auth, safety, SOS, bugs, location, admin gating, transit, and encrypted chat."""
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.server import app

client = TestClient(app)

ADMIN_EMAIL = "admin@mova.app"
ADMIN_PASSWORD = "admin"


@pytest.fixture(scope="module")
def admin():
    r = client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["role"] == "admin"
    token = data["token"]
    headers = {"Authorization": f"Bearer {token}"}
    return headers, data


@pytest.fixture(scope="module")
def user():
    email = f"test_{uuid.uuid4().hex[:8]}@mova.app"
    r = client.post("/api/auth/register", json={
        "name": "Test User", "email": email, "password": "test1234",
        "alt_name": "Family", "alt_phone": "+91-9999999999"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    token = data["token"]
    headers = {"Authorization": f"Bearer {token}"}
    return headers, data


# ---------- Health ----------
def test_api_root():
    r = client.get("/api/")
    assert r.status_code == 200
    assert "MOVA" in r.json()["message"]


# ---------- Auth ----------
def test_register_duplicate_rejected(user):
    headers, u = user
    r = client.post("/api/auth/register", json={
        "name": "x", "email": u["email"], "password": "x"
    })
    assert r.status_code == 400


def test_login_invalid():
    r = client.post("/api/auth/login", json={"email": "nope@x.com", "password": "bad"})
    assert r.status_code == 401


def test_auth_me(user):
    headers, u = user
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == u["email"]
    assert body["role"] == "user"
    assert "password_hash" not in body
    assert "_id" not in body


def test_auth_me_unauth():
    r = client.get("/api/auth/me")
    assert r.status_code == 401


# ---------- Safety Check-in ----------
def test_safety_checkin(user):
    headers, u = user
    r = client.post("/api/safety/checkin", json={"alt_name": "Mom", "alt_phone": "+91-9111122223"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["alt_phone"] == "+91-9111122223"
    # verify persisted
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["alt_name"] == "Mom"
    assert me["alt_phone"] == "+91-9111122223"


# ---------- SOS ----------
def test_sos_create_and_admin_sees(user, admin):
    headers_user, u = user
    headers_admin, a = admin
    r = client.post("/api/sos", json={"lat": 20.3558, "lng": 85.8175, "message": "help"}, headers=headers_user)
    assert r.status_code == 200
    sos = r.json()
    assert sos["user_email"] == u["email"]
    assert sos["status"] == "active"
    assert "id" in sos

    # admin list
    r_admin = client.get("/api/sos/all", headers=headers_admin)
    assert r_admin.status_code == 200
    ids = [x["id"] for x in r_admin.json()]
    assert sos["id"] in ids

    # normal user blocked from /api/sos/all
    r_block = client.get("/api/sos/all", headers=headers_user)
    assert r_block.status_code == 403


# ---------- Location ----------
def test_location_update_and_admin_list(user, admin):
    headers_user, u = user
    headers_admin, a = admin
    r = client.post("/api/location/update", json={"lat": 20.3533, "lng": 85.8162}, headers=headers_user)
    assert r.status_code == 200

    r_admin = client.get("/api/location/all", headers=headers_admin)
    assert r_admin.status_code == 200
    users = r_admin.json()
    assert any(x["user_id"] == u["id"] for x in users)

    # user blocked from listing all locations
    r_block = client.get("/api/location/all", headers=headers_user)
    assert r_block.status_code == 403


# ---------- Bugs ----------
def test_bugs_flow(user, admin):
    headers_user, u = user
    headers_admin, a = admin
    r = client.post("/api/bugs", json={
        "title": "Test Bug",
        "description": "Something is broken",
        "category": "bug"
    }, headers=headers_user)
    assert r.status_code == 200
    bug = r.json()
    assert bug["title"] == "Test Bug"

    # user sees own
    r_user = client.get("/api/bugs", headers=headers_user)
    assert r_user.status_code == 200
    assert any(b["id"] == bug["id"] for b in r_user.json())

    # admin sees all
    r_admin = client.get("/api/bugs", headers=headers_admin)
    assert r_admin.status_code == 200
    assert any(b["id"] == bug["id"] for b in r_admin.json())


# ---------- Transit Endpoints ----------
def test_transit_stops():
    r = client.get("/api/transit/stops")
    assert r.status_code == 200 and len(r.json()) >= 4


def test_transit_routes():
    r = client.get("/api/transit/routes")
    assert r.status_code == 200 and len(r.json()) >= 2


def test_transit_campuses():
    r = client.get("/api/transit/campuses")
    assert r.status_code == 200 and len(r.json()) >= 5


def test_transit_hubs():
    r = client.get("/api/transit/hubs")
    assert r.status_code == 200 and len(r.json()) >= 5


def test_transit_nav_links():
    r = client.post("/api/transit/nav-links", json={
        "origin": "KIIT Campus 3",
        "destination": "Bhubaneswar Airport BBI",
        "mode": "transit"
    })
    assert r.status_code == 200
    data = r.json()
    assert "google_maps_url" in data
    assert "google.com/maps/dir" in data["google_maps_url"]
    assert "maps.apple.com" in data["apple_maps_url"]


def test_transit_geocode():
    r = client.get("/api/transit/geocode?q=Kolkata")
    assert r.status_code == 200
    res = r.json()
    assert "results" in res and len(res["results"]) >= 1
    names = [x["name"] for x in res["results"]]
    assert any("Kolkata" in n for n in names)


def test_transit_road_route():
    r = client.get("/api/transit/road-route?start_lat=20.3558&start_lng=85.8175&end_lat=20.3492&end_lng=85.8213&mode=driving")
    assert r.status_code == 200
    data = r.json()
    assert "coordinates" in data and len(data["coordinates"]) >= 2
    assert "distance_km" in data


def test_police():
    r = client.get("/api/safety/police")
    assert r.status_code == 200 and len(r.json()) >= 1


# ---------- Encrypted Chat ----------
def test_chat_send_and_retrieve_flow(user, admin):
    headers_user, u = user
    headers_admin, a = admin

    # User sends encrypted message to admin
    payload_user = {
        "ciphertext": "k3jA19bE/testCiphertextUser==",
        "iv": "1234567890ab",
        "algorithm": "AES-GCM-256",
        "receiver_email": "admin@mova.app",
        "preview_hint": "🔒 Encrypted Message"
    }
    r = client.post("/api/chat/send", json=payload_user, headers=headers_user)
    assert r.status_code == 200, r.text
    msg = r.json()
    assert msg["sender_email"] == u["email"]
    assert msg["receiver_email"] == "admin@mova.app"
    assert msg["ciphertext"] == payload_user["ciphertext"]

    # User views messages
    r_user_msgs = client.get("/api/chat/messages", headers=headers_user)
    assert r_user_msgs.status_code == 200
    user_msgs = r_user_msgs.json()
    assert any(m["id"] == msg["id"] for m in user_msgs)

    # Admin views threads
    r_threads = client.get("/api/chat/threads", headers=headers_admin)
    assert r_threads.status_code == 200
    threads = r_threads.json()
    assert any(t["user_email"] == u["email"] for t in threads)

    # Admin views specific user thread
    r_admin_msgs = client.get(f"/api/chat/messages?with_user={u['email']}", headers=headers_admin)
    assert r_admin_msgs.status_code == 200
    admin_msgs = r_admin_msgs.json()
    assert any(m["id"] == msg["id"] for m in admin_msgs)

    # Admin replies to user with encrypted response
    payload_admin = {
        "ciphertext": "x8Y7z9AdminReplyCiphertext==",
        "iv": "0987654321ba",
        "algorithm": "AES-GCM-256",
        "receiver_email": u["email"],
        "preview_hint": "🔒 Encrypted Message"
    }
    r_reply = client.post("/api/chat/send", json=payload_admin, headers=headers_admin)
    assert r_reply.status_code == 200
    reply_msg = r_reply.json()
    assert reply_msg["sender_role"] == "admin"
    assert reply_msg["receiver_email"] == u["email"]


def test_chat_threads_admin_only(user):
    headers_user, _ = user
    r = client.get("/api/chat/threads", headers=headers_user)
    assert r.status_code == 403


def test_chat_mark_read(user, admin):
    headers_user, u = user
    headers_admin, _ = admin
    r = client.post("/api/chat/mark-read", json={"with_user": u["email"]}, headers=headers_admin)
    assert r.status_code == 200


# ---------- Logout ----------
def test_logout(user):
    headers_user, _ = user
    r = client.post("/api/auth/logout", headers=headers_user)
    assert r.status_code == 200
