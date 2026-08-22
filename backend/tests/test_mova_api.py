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


def test_multi_user_chat_database_isolation(admin):
    headers_admin, _ = admin

    # Register User A
    email_a = f"usera_{uuid.uuid4().hex[:6]}@test.com"
    r_a = client.post("/api/auth/register", json={"name": "User Alpha", "email": email_a, "password": "password123"})
    assert r_a.status_code == 200
    token_a = r_a.json()["token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Register User B
    email_b = f"userb_{uuid.uuid4().hex[:6]}@test.com"
    r_b = client.post("/api/auth/register", json={"name": "User Beta", "email": email_b, "password": "password123"})
    assert r_b.status_code == 200
    token_b = r_b.json()["token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A sends a message
    r1 = client.post("/api/chat/send", json={
        "ciphertext": "cipher_from_user_a",
        "iv": "iv_a",
        "receiver_email": "admin@mova.app"
    }, headers=headers_a)
    assert r1.status_code == 200
    msg_a_id = r1.json()["id"]

    # User B sends a message
    r2 = client.post("/api/chat/send", json={
        "ciphertext": "cipher_from_user_b",
        "iv": "iv_b",
        "receiver_email": "admin@mova.app"
    }, headers=headers_b)
    assert r2.status_code == 200
    msg_b_id = r2.json()["id"]

    # Verify User A only sees User A's message
    res_a_msgs = client.get("/api/chat/messages", headers=headers_a).json()
    assert any(m["id"] == msg_a_id for m in res_a_msgs)
    assert not any(m["id"] == msg_b_id for m in res_a_msgs)

    # Verify User B only sees User B's message
    res_b_msgs = client.get("/api/chat/messages", headers=headers_b).json()
    assert any(m["id"] == msg_b_id for m in res_b_msgs)
    assert not any(m["id"] == msg_a_id for m in res_b_msgs)

    # Verify Admin sees both separate threads
    threads = client.get("/api/chat/threads", headers=headers_admin).json()
    thread_emails = [t["user_email"] for t in threads]
    assert email_a in thread_emails
    assert email_b in thread_emails


def test_guest_chat_flow(admin):
    headers_admin, _ = admin
    guest_gid = f"guest_{uuid.uuid4().hex[:8]}"
    guest_headers = {
        "X-Guest-ID": guest_gid,
        "X-Guest-Name": "Guest Commuter 99"
    }

    # Guest sends message
    r = client.post("/api/chat/send", json={
        "ciphertext": "guest_cipher_packet",
        "iv": "guest_iv_123",
        "receiver_email": "admin@mova.app"
    }, headers=guest_headers)
    assert r.status_code == 200
    guest_msg = r.json()
    assert guest_msg["sender_id"] == guest_gid

    # Admin reads guest thread and replies
    admin_thread_msgs = client.get(f"/api/chat/messages?with_user={guest_msg['sender_email']}", headers=headers_admin).json()
    assert any(m["id"] == guest_msg["id"] for m in admin_thread_msgs)

    # Admin replies to guest
    r_reply = client.post("/api/chat/send", json={
        "ciphertext": "admin_reply_to_guest_cipher",
        "iv": "admin_reply_iv",
        "receiver_email": guest_msg["sender_email"]
    }, headers=headers_admin)
    assert r_reply.status_code == 200

    # Guest fetches messages and sees admin reply
    guest_feed = client.get("/api/chat/messages", headers=guest_headers).json()
    assert any(m["id"] == r_reply.json()["id"] for m in guest_feed)



# ---------- User Activity Analytics & Audit Exports ----------
def test_activity_tracking_flow(user):
    headers_user, u = user

    # Commuter logs feature activity
    r = client.post("/api/analytics/track", json={
        "feature_name": "route_planner",
        "feature_category": "Navigation & Mobility",
        "action_details": "Searched accessible wheelchair route from Campus 3 to Campus 15",
        "platform": "Web"
    }, headers=headers_user)
    assert r.status_code == 200, r.text
    log = r.json()["log"]
    assert log["user_email"] == u["email"]
    assert log["feature_name"] == "route_planner"

    # Guest commuter logs feature activity
    guest_gid = f"guest_{uuid.uuid4().hex[:6]}"
    guest_headers = {
        "X-Guest-ID": guest_gid,
        "X-Guest-Name": "Guest Commuter X"
    }
    r_guest = client.post("/api/analytics/track", json={
        "feature_name": "offline_pack",
        "feature_category": "Offline Resilience",
        "action_details": "Downloaded emergency safety shelter directory",
        "platform": "Mobile"
    }, headers=guest_headers)
    assert r_guest.status_code == 200
    guest_log = r_guest.json()["log"]
    assert guest_gid in guest_log["user_id"]


def test_admin_daily_usage_analytics(admin, user):
    headers_admin, _ = admin
    headers_user, _ = user

    # Admin accesses daily usage analytics
    r_admin = client.get("/api/analytics/daily-usage?days=30", headers=headers_admin)
    assert r_admin.status_code == 200
    data = r_admin.json()
    assert "summary" in data
    assert "feature_breakdown" in data
    assert "daily_trends" in data
    assert "recent_logs" in data
    assert data["summary"]["total_events"] >= 1

    # Regular commuter is blocked (403 Forbidden)
    r_forbidden = client.get("/api/analytics/daily-usage", headers=headers_user)
    assert r_forbidden.status_code == 403


def test_export_csv_and_pdf_reports(admin, user):
    headers_admin, _ = admin
    headers_user, _ = user

    # 1. Admin CSV Export
    r_csv = client.get("/api/exports/daily-usage.csv?days=30", headers=headers_admin)
    assert r_csv.status_code == 200
    assert "text/csv" in r_csv.headers["content-type"]
    assert "Log ID,Date,Timestamp,User Email" in r_csv.text

    # Alias /api/exports/report.csv
    r_csv_alias = client.get("/api/exports/report.csv", headers=headers_admin)
    assert r_csv_alias.status_code == 200

    # 2. Admin PDF Export
    r_pdf = client.get("/api/exports/daily-usage.pdf?days=30", headers=headers_admin)
    assert r_pdf.status_code == 200
    assert "application/pdf" in r_pdf.headers["content-type"]
    assert r_pdf.content.startswith(b"%PDF-")

    # Alias /api/exports/report.pdf
    r_pdf_alias = client.get("/api/exports/report.pdf", headers=headers_admin)
    assert r_pdf_alias.status_code == 200
    assert r_pdf_alias.content.startswith(b"%PDF-")

    # 3. Non-admin commuter is blocked from downloading reports
    assert client.get("/api/exports/daily-usage.csv", headers=headers_user).status_code == 403
    assert client.get("/api/exports/daily-usage.pdf", headers=headers_user).status_code == 403


# ---------- Logout ----------
def test_logout(user):
    headers_user, _ = user
    r = client.post("/api/auth/logout", headers=headers_user)
    assert r.status_code == 200

