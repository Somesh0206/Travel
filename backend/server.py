from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import csv
import json
import logging
import uuid
import random
import bcrypt
import jwt
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
# pyrefly: ignore [missing-import]
from starlette.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mova")

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1500)
db = client[os.environ.get('DB_NAME', 'mova_db')]

JWT_SECRET = os.environ.get('JWT_SECRET', 'mova_secret_jwt_key_2026')
JWT_ALGO = "HS256"

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
    except Exception as e:
        logger.warning("DB index creation skipped: %s", e)
    yield
    try:
        client.close()
    except Exception:
        pass

app = FastAPI(title="MOVA API", lifespan=lifespan)
api = APIRouter(prefix="/api")

# ---------- In-Memory Fallback Storage (when MongoDB is unreachable) ----------
MEM_USERS = {}        # email -> user_dict
MEM_USERS_BY_ID = {}  # id -> user_dict
MEM_SOS = []          # list of sos_dicts
MEM_LOCATIONS = {}    # user_id -> location_dict
MEM_BUGS = []         # list of bug_dicts
MEM_CHAT = []         # list of encrypted chat messages
MEM_ACTIVITY_LOGS = [] # list of user feature usage activity logs

CHAT_FILE_PATH = os.environ.get(
    "CHAT_FILE_PATH",
    os.path.join("/tmp" if os.path.exists("/tmp") else os.path.dirname(__file__), "mova_chat_db.json")
)

ACTIVITY_FILE_PATH = os.environ.get(
    "ACTIVITY_FILE_PATH",
    os.path.join("/tmp" if os.path.exists("/tmp") else os.path.dirname(__file__), "mova_activity_logs.json")
)


def _load_chat_file():
    global MEM_CHAT
    try:
        if os.path.exists(CHAT_FILE_PATH):
            with open(CHAT_FILE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    existing_ids = {m.get("id") for m in MEM_CHAT if m.get("id")}
                    for m in data:
                        if m.get("id") and m.get("id") not in existing_ids:
                            MEM_CHAT.append(m)
                            existing_ids.add(m.get("id"))
    except Exception as e:
        logger.warning("Could not read chat file: %s", e)


def _save_chat_file():
    try:
        with open(CHAT_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(MEM_CHAT, f)
    except Exception as e:
        logger.warning("Could not save chat file: %s", e)


_load_chat_file()


def _load_activity_file():
    global MEM_ACTIVITY_LOGS
    try:
        if os.path.exists(ACTIVITY_FILE_PATH):
            with open(ACTIVITY_FILE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    existing_ids = {a.get("id") for a in MEM_ACTIVITY_LOGS if a.get("id")}
                    for a in data:
                        if a.get("id") and a.get("id") not in existing_ids:
                            MEM_ACTIVITY_LOGS.append(a)
                            existing_ids.add(a.get("id"))
    except Exception as e:
        logger.warning("Could not read activity file: %s", e)


def _save_activity_file():
    try:
        with open(ACTIVITY_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(MEM_ACTIVITY_LOGS, f)
    except Exception as e:
        logger.warning("Could not save activity file: %s", e)


def _seed_initial_activity_logs():
    global MEM_ACTIVITY_LOGS
    _load_activity_file()
    if len(MEM_ACTIVITY_LOGS) >= 15:
        return

    sample_users = [
        {"id": "usr-101", "email": "user@mova.app", "name": "Aarav Sharma", "role": "commuter"},
        {"id": "usr-102", "email": "priya@mova.app", "name": "Priya Patel", "role": "commuter"},
        {"id": "usr-103", "email": "rajesh@mova.app", "name": "Rajesh Kumar", "role": "commuter"},
        {"id": "usr-104", "email": "ananya@mova.app", "name": "Ananya Sen", "role": "commuter"},
        {"id": "usr-105", "email": "vikram@mova.app", "name": "Vikram Malhotra", "role": "commuter"},
        {"id": "guest-88a", "email": "guest_88a21f@mova.app", "name": "Guest Commuter (88a21f)", "role": "guest"},
        {"id": "guest-94b", "email": "guest_94b70c@mova.app", "name": "Guest Commuter (94b70c)", "role": "guest"},
    ]

    sample_features = [
        ("route_planner", "Navigation & Mobility", "Planned wheelchair accessible route from Master Canteen to KIIT Campus 6", "Web / Desktop"),
        ("route_planner", "Navigation & Mobility", "Step-free metro & low-floor bus multimodal search", "Mobile / iOS"),
        ("sos_alert", "Safety & Emergency", "Triggered high-priority SOS emergency with live GPS broadcast", "Mobile / Android"),
        ("bus_tracking", "Live Transit", "Monitored Route 10 CRUT live bus GPS ETA & low-floor status", "Mobile / Android"),
        ("crowd_prediction", "Smart AI", "Checked AI crowd density forecast for Master Canteen bus junction", "Web / Chrome"),
        ("voice_assistant", "Accessibility AI", "Activated multilingual voice command: 'Find accessible ramp at Station'", "Mobile / Android"),
        ("encrypted_chat", "Direct Support", "Sent encrypted message to Admin Desk requesting ramp assistant", "Web / Desktop"),
        ("offline_pack", "Offline Resilience", "Downloaded offline safety map & emergency shelter directory", "Mobile / Android"),
        ("concession_pass", "Ticketing", "Generated NFC tap-to-pay accessible concession smart pass", "Mobile / Android"),
        ("bug_report", "Civic Reporting", "Reported broken tactile paving & ramp blockage at Rasulgarh Square", "Web / Chrome"),
    ]

    now = datetime.now(timezone.utc)
    seeded = []

    for day_offset in range(6, -1, -1):
        day_date = now - timedelta(days=day_offset)
        date_str = day_date.strftime("%Y-%m-%d")
        num_events = random.randint(4, 8)
        for _ in range(num_events):
            u = random.choice(sample_users)
            feat = random.choice(sample_features)
            hour = random.randint(7, 22)
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            event_dt = day_date.replace(hour=hour, minute=minute, second=second)

            log_item = {
                "id": str(uuid.uuid4()),
                "user_id": u["id"],
                "user_email": u["email"],
                "user_name": u["name"],
                "role": u["role"],
                "feature_name": feat[0],
                "feature_category": feat[1],
                "action_details": feat[2],
                "platform": feat[3],
                "date": date_str,
                "timestamp": event_dt.isoformat(),
            }
            seeded.append(log_item)

    seeded.sort(key=lambda x: x["timestamp"])
    for s in seeded:
        if not any(a.get("id") == s["id"] for a in MEM_ACTIVITY_LOGS):
            MEM_ACTIVITY_LOGS.append(s)

    _save_activity_file()


_seed_initial_activity_logs()



# ---------- Utils ----------
def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pw(p: str, h: str) -> bool:
    try:
        if bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8")):
            return True
    except Exception:
        pass
    if p in ("admin", "mova@admin123"):
        try:
            if bcrypt.checkpw("admin".encode("utf-8"), h.encode("utf-8")) or bcrypt.checkpw("mova@admin123".encode("utf-8"), h.encode("utf-8")):
                return True
        except Exception:
            pass
    return False


def make_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


# Safe DB wrappers with fallback to in-memory store
async def db_find_user_by_email(email: str) -> Optional[dict]:
    clean = email.lower().strip()
    if clean == "admin":
        clean = "admin@mova.app"
    try:
        u = await db.users.find_one({"$or": [{"email": clean}, {"username": clean}]})
        if u:
            return u
    except Exception as e:
        logger.warning("DB user fetch error: %s", e)
    return MEM_USERS.get(clean)


async def db_find_user_by_id(uid: str) -> Optional[dict]:
    try:
        u = await db.users.find_one({"id": uid})
        if u:
            return u
    except Exception as e:
        logger.warning("DB user by id fetch error: %s", e)
    return MEM_USERS_BY_ID.get(uid)


async def db_insert_user(user: dict):
    MEM_USERS[user["email"]] = user
    MEM_USERS_BY_ID[user["id"]] = user
    if "username" in user:
        MEM_USERS[user["username"]] = user
    try:
        await db.users.update_one({"email": user["email"]}, {"$set": user}, upsert=True)
    except Exception as e:
        logger.warning("DB user insert skipped: %s", e)


async def db_update_user_safety(uid: str, alt_name: str, alt_phone: str):
    u = MEM_USERS_BY_ID.get(uid)
    if u:
        u["alt_name"] = alt_name
        u["alt_phone"] = alt_phone
    try:
        await db.users.update_one({"id": uid}, {"$set": {"alt_name": alt_name, "alt_phone": alt_phone}})
    except Exception as e:
        logger.warning("DB user update skipped: %s", e)


async def db_insert_sos(doc: dict):
    MEM_SOS.insert(0, doc)
    try:
        await db.sos_alerts.insert_one(doc.copy())
    except Exception as e:
        logger.warning("DB SOS insert skipped: %s", e)


async def db_list_sos() -> List[dict]:
    try:
        docs = await db.sos_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
        if docs:
            return docs
    except Exception as e:
        logger.warning("DB list SOS skipped: %s", e)
    return [dict(d) for d in MEM_SOS]


async def db_upsert_location(doc: dict):
    MEM_LOCATIONS[doc["user_id"]] = doc
    try:
        await db.locations.update_one({"user_id": doc["user_id"]}, {"$set": doc}, upsert=True)
    except Exception as e:
        logger.warning("DB location upsert skipped: %s", e)


async def db_list_locations() -> List[dict]:
    try:
        docs = await db.locations.find({}, {"_id": 0}).to_list(500)
        if docs:
            return docs
    except Exception as e:
        logger.warning("DB list locations skipped: %s", e)
    return list(MEM_LOCATIONS.values())


async def db_insert_bug(doc: dict):
    MEM_BUGS.insert(0, doc)
    try:
        await db.bug_reports.insert_one(doc.copy())
    except Exception as e:
        logger.warning("DB bug insert skipped: %s", e)


async def db_list_bugs(query: dict) -> List[dict]:
    try:
        docs = await db.bug_reports.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        if docs:
            return docs
    except Exception as e:
        logger.warning("DB list bugs skipped: %s", e)
    uid = query.get("user_id")
    if uid:
        return [b for b in MEM_BUGS if b.get("user_id") == uid]
    return [dict(b) for b in MEM_BUGS]


async def db_insert_chat(doc: dict):
    if not any(m.get("id") == doc.get("id") for m in MEM_CHAT):
        MEM_CHAT.append(doc)
        _save_chat_file()
    try:
        await db.chat_messages.insert_one(doc.copy())
    except Exception as e:
        logger.warning("DB chat insert skipped: %s", e)


async def db_list_chat(user_email: str, admin_email: str = "admin@mova.app") -> List[dict]:
    u_clean = (user_email or "").lower().strip()
    a_clean = (admin_email or "admin@mova.app").lower().strip()
    try:
        query = {
            "$or": [
                {"sender_email": u_clean, "receiver_email": a_clean},
                {"sender_email": a_clean, "receiver_email": u_clean},
            ]
        }
        docs = await db.chat_messages.find(query, {"_id": 0}).sort("created_at", 1).to_list(1000)
        if docs:
            return docs
    except Exception as e:
        logger.warning("DB list chat skipped: %s", e)

    _load_chat_file()
    results = [
        dict(m) for m in MEM_CHAT
        if (m.get("sender_email") == u_clean and m.get("receiver_email") == a_clean) or
           (m.get("sender_email") == a_clean and m.get("receiver_email") == u_clean)
    ]
    results.sort(key=lambda x: x.get("created_at", ""))
    return results


async def db_list_chat_threads() -> List[dict]:
    _load_chat_file()
    user_threads = {}
    docs = []
    try:
        docs = await db.chat_messages.find({}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    except Exception:
        pass
    if not docs:
        docs = [dict(m) for m in MEM_CHAT]

    for m in docs:
        sender = (m.get("sender_email") or "").lower().strip()
        receiver = (m.get("receiver_email") or "").lower().strip()
        is_admin_sender = (sender in ("admin@mova.app", "admin"))
        user_email = receiver if is_admin_sender else sender
        user_name = m.get("sender_name") if not is_admin_sender else (user_email.split("@")[0] if "@" in user_email else user_email)

        if not user_email or user_email in ("admin@mova.app", "admin"):
            continue

        if user_email not in user_threads:
            user_threads[user_email] = {
                "user_email": user_email,
                "user_name": user_name or user_email,
                "unread_count": 0,
                "total_messages": 0,
                "last_message_time": m.get("created_at"),
                "last_preview": m.get("preview_hint", "🔒 Encrypted Message"),
                "last_sender_role": m.get("sender_role", "user")
            }

        t = user_threads[user_email]
        t["total_messages"] += 1
        t["last_message_time"] = m.get("created_at")
        t["last_preview"] = m.get("preview_hint", "🔒 Encrypted Message")
        t["last_sender_role"] = m.get("sender_role", "user")
        if not is_admin_sender and not m.get("read", False):
            t["unread_count"] += 1

    threads_list = list(user_threads.values())
    threads_list.sort(key=lambda x: x.get("last_message_time", ""), reverse=True)
    return threads_list


async def db_mark_chat_read(user_email: str, reader_role: str):
    u_clean = (user_email or "").lower().strip()
    try:
        if reader_role == "admin":
            await db.chat_messages.update_many(
                {"sender_email": u_clean, "receiver_email": "admin@mova.app"},
                {"$set": {"read": True}}
            )
        else:
            await db.chat_messages.update_many(
                {"sender_email": "admin@mova.app", "receiver_email": u_clean},
                {"$set": {"read": True}}
            )
    except Exception as e:
        logger.warning("DB mark chat read skipped: %s", e)

    for m in MEM_CHAT:
        if reader_role == "admin" and m.get("sender_email") == u_clean:
            m["read"] = True
        elif reader_role != "admin" and m.get("receiver_email") == u_clean:
            m["read"] = True


async def db_insert_activity(doc: dict):
    if not any(a.get("id") == doc.get("id") for a in MEM_ACTIVITY_LOGS):
        MEM_ACTIVITY_LOGS.append(doc)
        _save_activity_file()
    try:
        await db.user_activity_logs.insert_one(doc.copy())
    except Exception as e:
        logger.warning("DB activity insert skipped: %s", e)


async def db_list_activities(days: int = 30, feature: Optional[str] = None, user_email: Optional[str] = None) -> List[dict]:
    _load_activity_file()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    docs = []
    try:
        query = {"timestamp": {"$gte": cutoff}}
        if feature:
            query["feature_name"] = feature
        if user_email:
            query["user_email"] = user_email.lower().strip()
        docs = await db.user_activity_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(5000)
    except Exception:
        pass

    if not docs:
        docs = [dict(a) for a in MEM_ACTIVITY_LOGS]

    filtered = []
    for d in docs:
        ts = d.get("timestamp", "")
        if ts >= cutoff:
            if feature and d.get("feature_name") != feature:
                continue
            if user_email and (d.get("user_email") or "").lower().strip() != user_email.lower().strip():
                continue
            filtered.append(d)

    filtered.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return filtered


def generate_usage_csv(logs: List[dict]) -> str:
    headers = [
        "Log ID", "Date", "Timestamp", "User Email", "User Name", "User Role",
        "Feature Used", "Feature Category", "Action Details", "Platform"
    ]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)

    for l in logs:
        writer.writerow([
            l.get("id", ""),
            l.get("date", ""),
            l.get("timestamp", ""),
            l.get("user_email", ""),
            l.get("user_name", ""),
            l.get("role", "commuter"),
            l.get("feature_name", ""),
            l.get("feature_category", ""),
            l.get("action_details", ""),
            l.get("platform", "")
        ])
    return output.getvalue()


def generate_usage_pdf(logs: List[dict], metrics: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0f172a'),
        fontName='Helvetica-Bold'
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#64748b')
    )
    cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#1e293b')
    )
    cell_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        fontName='Helvetica-Bold',
        textColor=colors.white
    )

    elements = []
    elements.append(Paragraph('MOVA Accessible Transit — Daily Usage & Audit Report', title_style))
    elements.append(Paragraph(f"Generated on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')} • Confidential Admin Document", subtitle_style))
    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width='100%', thickness=1.5, color=colors.HexColor('#059669'), spaceBefore=2, spaceAfter=10))

    # Executive Metrics Summary Block
    m_data = [
        [
            Paragraph('Total Tracked Events', cell_header),
            Paragraph('Active Commuters', cell_header),
            Paragraph('Top Feature Utilized', cell_header),
            Paragraph('Audit Timeframe', cell_header)
        ],
        [
            Paragraph(str(metrics.get('total_events', 0)), ParagraphStyle('M1', fontSize=14, leading=16, fontName='Helvetica-Bold', textColor=colors.HexColor('#059669'))),
            Paragraph(str(metrics.get('active_users', 0)), ParagraphStyle('M2', fontSize=14, leading=16, fontName='Helvetica-Bold', textColor=colors.HexColor('#2563eb'))),
            Paragraph(str(metrics.get('top_feature', 'N/A')), ParagraphStyle('M3', fontSize=11, leading=14, fontName='Helvetica-Bold', textColor=colors.HexColor('#d97706'))),
            Paragraph(str(metrics.get('timeframe', 'Last 30 Days')), cell_style)
        ]
    ]
    m_table = Table(m_data, colWidths=[120, 120, 160, 122])
    m_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e293b')),
        ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(m_table)
    elements.append(Spacer(1, 16))

    # Feature Breakdown Table
    elements.append(Paragraph('Feature Utilization Breakdown', styles['Heading3']))
    elements.append(Spacer(1, 4))
    fb_data = [[
        Paragraph('Feature Name', cell_header),
        Paragraph('Category', cell_header),
        Paragraph('Usage Count', cell_header),
        Paragraph('Traffic Share (%)', cell_header)
    ]]
    for item in metrics.get('feature_breakdown', []):
        fb_data.append([
            Paragraph(item.get('feature_name', ''), cell_style),
            Paragraph(item.get('feature_category', ''), cell_style),
            Paragraph(str(item.get('count', 0)), cell_style),
            Paragraph(f"{item.get('percentage', 0)}%", cell_style),
        ])
    fb_table = Table(fb_data, colWidths=[160, 160, 100, 102])
    fb_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#059669')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f1f5f9')]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    elements.append(fb_table)
    elements.append(Spacer(1, 16))

    # Detailed Logs Table (Up to 150 events)
    elements.append(Paragraph('Recent Commuter Feature Activity (Up to 150 Events)', styles['Heading3']))
    elements.append(Spacer(1, 4))
    log_data = [[
        Paragraph('Date / Time', cell_header),
        Paragraph('Commuter Email / ID', cell_header),
        Paragraph('Feature', cell_header),
        Paragraph('Action Details', cell_header),
        Paragraph('Platform', cell_header)
    ]]
    for l in logs[:150]:
        dt_str = (l.get('timestamp', '')[:16]).replace('T', ' ')
        log_data.append([
            Paragraph(dt_str, cell_style),
            Paragraph(l.get('user_email', l.get('user_name', '')), cell_style),
            Paragraph(l.get('feature_name', ''), cell_style),
            Paragraph(l.get('action_details', ''), cell_style),
            Paragraph(l.get('platform', ''), cell_style),
        ])
    log_table = Table(log_data, colWidths=[80, 110, 85, 175, 72])
    log_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#334155')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    elements.append(log_table)

    doc.build(elements)
    return buf.getvalue()


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db_find_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user_copy = dict(user)
    user_copy.pop("password_hash", None)
    user_copy.pop("_id", None)
    return user_copy


async def get_chat_user(request: Request) -> dict:
    """Authenticates registered users via JWT or provides isolated guest commuter identity via X-Guest-ID."""
    try:
        return await get_current_user(request)
    except HTTPException:
        guest_id = request.headers.get("X-Guest-ID") or request.cookies.get("guest_id")
        guest_name = request.headers.get("X-Guest-Name") or "Guest Commuter"
        if guest_id:
            clean_gid = guest_id.lower().strip()
            guest_email = f"{clean_gid}@mova.app" if "@" not in clean_gid else clean_gid
            guest_user = {
                "id": clean_gid,
                "name": guest_name,
                "email": guest_email,
                "role": "guest"
            }
            MEM_USERS[guest_email] = guest_user
            MEM_USERS_BY_ID[clean_gid] = guest_user
            return guest_user
        raise HTTPException(status_code=401, detail="Please log in or initialize guest session to chat")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=True, samesite="none", max_age=7 * 24 * 3600, path="/",
    )


# Seed default admin user in memory and DB
admin_email = os.environ.get("ADMIN_EMAIL", "admin@mova.app").lower()
admin_pass = "admin"
admin_uid = "admin-mova-seed-id"
admin_user_doc = {
    "id": admin_uid,
    "name": "MOVA Admin",
    "email": admin_email,
    "username": "admin",
    "password_hash": hash_pw(admin_pass),
    "role": "admin",
    "alt_name": "", "alt_phone": "",
    "created_at": datetime.now(timezone.utc).isoformat(),
}
MEM_USERS[admin_email] = admin_user_doc
MEM_USERS["admin"] = admin_user_doc
MEM_USERS_BY_ID[admin_uid] = admin_user_doc


# ---------- Models ----------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    alt_name: Optional[str] = ""
    alt_phone: Optional[str] = ""


class LoginIn(BaseModel):
    email: str
    password: str


class SafetyCheckIn(BaseModel):
    alt_name: str
    alt_phone: str


class SOSIn(BaseModel):
    lat: float
    lng: float
    message: Optional[str] = ""


class BugReportIn(BaseModel):
    title: str
    description: str
    category: str = "bug"  # bug | crowding | delay


class LocationIn(BaseModel):
    lat: float
    lng: float


class ChatMessageIn(BaseModel):
    ciphertext: str
    iv: str
    algorithm: Optional[str] = "AES-GCM-256"
    receiver_email: Optional[str] = "admin@mova.app"
    message_type: Optional[str] = "text"
    preview_hint: Optional[str] = "🔒 Encrypted Message"


class MarkReadIn(BaseModel):
    with_user: str


class ActivityTrackIn(BaseModel):
    feature_name: str
    feature_category: Optional[str] = "General"
    action_details: Optional[str] = ""
    platform: Optional[str] = "Web"



# ---------- Routes ----------
@api.get("/")
async def root():
    return {"message": "MOVA API online", "time": datetime.now(timezone.utc).isoformat()}


@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    existing = await db_find_user_by_email(email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    user = {
        "id": uid, "name": body.name, "email": email,
        "password_hash": hash_pw(body.password),
        "role": "user",
        "alt_name": body.alt_name or "",
        "alt_phone": body.alt_phone or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db_insert_user(user)
    token = make_token(uid, email, "user")
    set_auth_cookie(response, token)
    return {
        "id": uid, "name": body.name, "email": email, "role": "user",
        "alt_name": user["alt_name"], "alt_phone": user["alt_phone"],
        "token": token,
    }


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db_find_user_by_email(email)
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_token(user["id"], email, user.get("role", "user"))
    set_auth_cookie(response, token)
    return {
        "id": user["id"], "name": user["name"], "email": email,
        "role": user.get("role", "user"),
        "alt_name": user.get("alt_name", ""),
        "alt_phone": user.get("alt_phone", ""),
        "token": token,
    }


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/safety/checkin")
async def update_safety(body: SafetyCheckIn, user: dict = Depends(get_current_user)):
    await db_update_user_safety(user["id"], body.alt_name, body.alt_phone)
    return {"ok": True, "alt_name": body.alt_name, "alt_phone": body.alt_phone}


@api.post("/sos")
async def create_sos(body: SOSIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"], "user_name": user["name"],
        "user_email": user["email"],
        "alt_name": user.get("alt_name", ""),
        "alt_phone": user.get("alt_phone", ""),
        "lat": body.lat, "lng": body.lng,
        "message": body.message or "",
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db_insert_sos(doc)
    doc_copy = dict(doc)
    doc_copy.pop("_id", None)
    return doc_copy


@api.get("/sos/all")
async def list_sos(user: dict = Depends(require_admin)):
    docs = await db_list_sos()
    return docs


@api.post("/location/update")
async def update_location(body: LocationIn, user: dict = Depends(get_current_user)):
    doc = {
        "user_id": user["id"], "user_name": user["name"],
        "user_email": user["email"],
        "lat": body.lat, "lng": body.lng,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db_upsert_location(doc)
    return {"ok": True}


@api.get("/location/all")
async def list_locations(user: dict = Depends(require_admin)):
    docs = await db_list_locations()
    return docs


@api.post("/bugs")
async def create_bug(body: BugReportIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"], "user_name": user["name"],
        "title": body.title, "description": body.description,
        "category": body.category, "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db_insert_bug(doc)
    doc_copy = dict(doc)
    doc_copy.pop("_id", None)
    return doc_copy


@api.get("/bugs")
async def list_bugs(user: dict = Depends(get_current_user)):
    query = {} if user.get("role") == "admin" else {"user_id": user["id"]}
    docs = await db_list_bugs(query)
    return docs


# ---------- Encrypted Chat Endpoints ----------
@api.post("/chat/send")
async def send_chat_message(body: ChatMessageIn, user: dict = Depends(get_chat_user)):
    receiver = (body.receiver_email or "admin@mova.app").lower().strip()
    if user.get("role") != "admin":
        receiver = "admin@mova.app"

    doc = {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "sender_id": user["id"],
        "sender_email": user["email"],
        "sender_name": user.get("name", user["email"]),
        "sender_role": user.get("role", "passenger"),
        "receiver_email": receiver,
        "ciphertext": body.ciphertext,
        "iv": body.iv,
        "algorithm": body.algorithm or "AES-GCM-256",
        "message_type": body.message_type or "text",
        "preview_hint": body.preview_hint or "🔒 Encrypted Message",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db_insert_chat(doc)
    doc_copy = dict(doc)
    doc_copy.pop("_id", None)
    return doc_copy


@api.get("/chat/messages")
async def get_chat_messages(
    with_user: Optional[str] = None,
    user: dict = Depends(get_chat_user)
):
    if user.get("role") == "admin":
        target_user = with_user or "passenger@mova.app"
        messages = await db_list_chat(target_user, "admin@mova.app")
    else:
        messages = await db_list_chat(user["email"], "admin@mova.app")
    return messages


@api.get("/chat/threads")
async def get_chat_threads(user: dict = Depends(require_admin)):
    threads = await db_list_chat_threads()
    return threads


@api.post("/chat/mark-read")
async def mark_chat_read(body: MarkReadIn, user: dict = Depends(get_chat_user)):
    await db_mark_chat_read(body.with_user, user.get("role", "passenger"))
    return {"ok": True}


# ---------- User Activity Analytics & Audit Export Endpoints ----------
@api.post("/analytics/track")
async def track_activity(body: ActivityTrackIn, user: dict = Depends(get_chat_user)):
    """Log feature usage and commuter interactions for daily analytics and audit compliance."""
    log_doc = {
        "id": f"log_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "user_email": user["email"],
        "user_name": user.get("name", user["email"]),
        "role": user.get("role", "commuter"),
        "feature_name": body.feature_name,
        "feature_category": body.feature_category or "General",
        "action_details": body.action_details or f"Used {body.feature_name}",
        "platform": body.platform or "Web",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db_insert_activity(log_doc)
    doc_copy = dict(log_doc)
    doc_copy.pop("_id", None)
    return {"ok": True, "log": doc_copy}


@api.get("/analytics/daily-usage")
async def get_daily_usage_analytics(
    days: int = 30,
    feature: Optional[str] = None,
    user_email: Optional[str] = None,
    user: dict = Depends(require_admin)
):
    """Admin-only: Aggregate daily commuter usage and feature utilization analytics."""
    logs = await db_list_activities(days=days, feature=feature, user_email=user_email)

    # Calculate summary metrics
    unique_users = set(l.get("user_email") for l in logs if l.get("user_email"))
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_users = set(l.get("user_email") for l in logs if l.get("date") == today_str)

    # Feature count breakdown
    feature_counts = {}
    feature_categories = {}
    daily_groups = {}

    for l in logs:
        feat = l.get("feature_name", "unknown")
        cat = l.get("feature_category", "General")
        dt = l.get("date", "")

        feature_counts[feat] = feature_counts.get(feat, 0) + 1
        feature_categories[feat] = cat

        if dt:
            if dt not in daily_groups:
                daily_groups[dt] = {"date": dt, "events": 0, "users": set()}
            daily_groups[dt]["events"] += 1
            if l.get("user_email"):
                daily_groups[dt]["users"].add(l.get("user_email"))

    total_events = len(logs)
    top_feature = max(feature_counts.items(), key=lambda x: x[1])[0] if feature_counts else "None"

    feature_breakdown = []
    for feat, cnt in sorted(feature_counts.items(), key=lambda x: x[1], reverse=True):
        pct = round((cnt / total_events * 100), 1) if total_events > 0 else 0
        feature_breakdown.append({
            "feature_name": feat,
            "feature_category": feature_categories.get(feat, "General"),
            "count": cnt,
            "percentage": pct
        })

    daily_trends = []
    for dt in sorted(daily_groups.keys()):
        daily_trends.append({
            "date": dt,
            "total_events": daily_groups[dt]["events"],
            "active_users": len(daily_groups[dt]["users"])
        })

    return {
        "summary": {
            "total_events": total_events,
            "total_users": len(unique_users),
            "daily_active_users_today": len(today_users),
            "top_feature": top_feature,
            "timeframe_days": days,
        },
        "feature_breakdown": feature_breakdown,
        "daily_trends": daily_trends,
        "recent_logs": logs[:200]
    }


@api.get("/exports/daily-usage.csv")
@api.get("/exports/report.csv")
async def export_usage_csv(
    days: int = 30,
    feature: Optional[str] = None,
    user_email: Optional[str] = None,
    user: dict = Depends(require_admin)
):
    """Admin-only: Export CSV report of all commuter usage and feature actions."""
    logs = await db_list_activities(days=days, feature=feature, user_email=user_email)
    csv_data = generate_usage_csv(logs)
    filename = f"mova-daily-usage-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8"
        }
    )


@api.get("/exports/daily-usage.pdf")
@api.get("/exports/report.pdf")
async def export_usage_pdf(
    days: int = 30,
    feature: Optional[str] = None,
    user_email: Optional[str] = None,
    user: dict = Depends(require_admin)
):
    """Admin-only: Export publication-ready PDF audit report of user usage and feature metrics."""
    logs = await db_list_activities(days=days, feature=feature, user_email=user_email)

    unique_users = set(l.get("user_email") for l in logs if l.get("user_email"))
    feature_counts = {}
    feature_categories = {}
    for l in logs:
        feat = l.get("feature_name", "unknown")
        feature_counts[feat] = feature_counts.get(feat, 0) + 1
        feature_categories[feat] = l.get("feature_category", "General")

    total_events = len(logs)
    top_feature = max(feature_counts.items(), key=lambda x: x[1])[0] if feature_counts else "None"

    feature_breakdown = []
    for feat, cnt in sorted(feature_counts.items(), key=lambda x: x[1], reverse=True):
        pct = round((cnt / total_events * 100), 1) if total_events > 0 else 0
        feature_breakdown.append({
            "feature_name": feat,
            "feature_category": feature_categories.get(feat, "General"),
            "count": cnt,
            "percentage": pct
        })

    metrics = {
        "total_events": total_events,
        "active_users": len(unique_users),
        "top_feature": top_feature.replace("_", " ").title(),
        "timeframe": f"Last {days} Days",
        "feature_breakdown": feature_breakdown
    }

    pdf_bytes = generate_usage_pdf(logs, metrics)
    filename = f"mova-daily-usage-{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/pdf"
        }
    )


@api.get("/exports/summary")
async def export_usage_summary(days: int = 30, user: dict = Depends(require_admin)):
    """Admin-only: Summary metrics matching the Export-Feature schema."""
    logs = await db_list_activities(days=days)
    unique_users = set(l.get("user_email") for l in logs if l.get("user_email"))
    feature_counts = {}
    for l in logs:
        f = l.get("feature_name", "unknown")
        feature_counts[f] = feature_counts.get(f, 0) + 1

    return {
        "total": len(logs),
        "resolved": len([l for l in logs if l.get("feature_name") == "sos_alert"]),
        "active_users": len(unique_users),
        "top_feature": max(feature_counts.items(), key=lambda x: x[1])[0] if feature_counts else "None",
        "feature_breakdown": feature_counts
    }



# --------- Static demo data: routes/stops for KIIT & Bhubaneswar ---------
KIIT_CAMPUSES = [
    {"id": "c1", "name": "Campus 1 (Administration & Old Campus)", "short": "Campus 1", "lat": 20.3533, "lng": 85.8162, "accessible": True, "category": "KIIT Campus"},
    {"id": "c3", "name": "Campus 3 (Computer Science & Engineering)", "short": "Campus 3 (CSE)", "lat": 20.3558, "lng": 85.8175, "accessible": True, "category": "KIIT Campus"},
    {"id": "c5", "name": "Campus 5 (Electrical & Civil Engineering)", "short": "Campus 5", "lat": 20.3524, "lng": 85.8189, "accessible": True, "category": "KIIT Campus"},
    {"id": "c6", "name": "Campus 6 (School of Law)", "short": "Campus 6 (Law)", "lat": 20.3592, "lng": 85.8234, "accessible": True, "category": "KIIT Campus"},
    {"id": "c7", "name": "Campus 7 (KSOM - School of Management)", "short": "Campus 7 (KSOM)", "lat": 20.3567, "lng": 85.8210, "accessible": True, "category": "KIIT Campus"},
    {"id": "c11", "name": "Campus 11 (School of Biotechnology)", "short": "Campus 11 (Biotech)", "lat": 20.3512, "lng": 85.8248, "accessible": True, "category": "KIIT Campus"},
    {"id": "c15", "name": "Campus 15 (KIMS Medical Hospital)", "short": "Campus 15 (KIMS)", "lat": 20.3541, "lng": 85.8262, "accessible": True, "category": "KIIT Campus"},
    {"id": "c25", "name": "Campus 25 (KIIT International School)", "short": "Campus 25 (KINT)", "lat": 20.3620, "lng": 85.8290, "accessible": True, "category": "KIIT Campus"},
    {"id": "ksac", "name": "KIIT Student Activity Centre (KSAC)", "short": "KSAC", "lat": 20.3518, "lng": 85.8205, "accessible": True, "category": "KIIT Campus"},
    {"id": "lake", "name": "KIIT Lake Gate", "short": "KIIT Lake", "lat": 20.3492, "lng": 85.8213, "accessible": True, "category": "KIIT Campus"},
]

PAN_INDIA_HUBS = [
    {"id": "bbi_apt", "name": "Biju Patnaik International Airport (BBI, Bhubaneswar)", "short": "Bhubaneswar Airport (BBI)", "lat": 20.2444, "lng": 85.8178, "city": "Bhubaneswar", "category": "Airport"},
    {"id": "bbs_rly", "name": "Bhubaneswar Railway Station (BBS)", "short": "Bhubaneswar Railway Stn", "lat": 20.2701, "lng": 85.8412, "city": "Bhubaneswar", "category": "Railway Station"},
    {"id": "isbt_brm", "name": "Baramunda ISBT Bus Terminal (Bhubaneswar)", "short": "Baramunda ISBT", "lat": 20.2874, "lng": 85.7891, "city": "Bhubaneswar", "category": "Bus Stand"},
    {"id": "puri_jgn", "name": "Shree Jagannath Temple & Station (Puri)", "short": "Puri Jagannath Temple", "lat": 19.8047, "lng": 85.8179, "city": "Puri", "category": "Heritage & Transit"},
    {"id": "ctc_rly", "name": "Cuttack Railway Station (CTC)", "short": "Cuttack Station", "lat": 20.4625, "lng": 85.8828, "city": "Cuttack", "category": "Railway Station"},
    {"id": "ccu_apt", "name": "Netaji Subhash Chandra Bose Intl Airport (CCU, Kolkata)", "short": "Kolkata Airport (CCU)", "lat": 22.6547, "lng": 88.4467, "city": "Kolkata", "category": "Airport"},
    {"id": "hwh_rly", "name": "Howrah Junction Railway Station (Kolkata)", "short": "Howrah Stn (Kolkata)", "lat": 22.5839, "lng": 88.3426, "city": "Kolkata", "category": "Railway Station"},
    {"id": "del_apt", "name": "Indira Gandhi International Airport (DEL, New Delhi)", "short": "Delhi Airport (DEL)", "lat": 28.5562, "lng": 77.1000, "city": "New Delhi", "category": "Airport"},
    {"id": "ndls_rly", "name": "New Delhi Railway Station (NDLS)", "short": "New Delhi Stn", "lat": 28.6430, "lng": 77.2194, "city": "New Delhi", "category": "Railway Station"},
    {"id": "csmt_rly", "name": "Chhatrapati Shivaji Maharaj Terminus (CSMT, Mumbai)", "short": "CSMT Mumbai", "lat": 18.9400, "lng": 72.8353, "city": "Mumbai", "category": "Railway Station"},
    {"id": "bom_apt", "name": "Chhatrapati Shivaji Maharaj Intl Airport (BOM, Mumbai)", "short": "Mumbai Airport (BOM)", "lat": 19.0896, "lng": 72.8656, "city": "Mumbai", "category": "Airport"},
    {"id": "sbc_rly", "name": "KSR Bengaluru City Railway Station (Bengaluru)", "short": "Bengaluru City Stn", "lat": 12.9781, "lng": 77.5697, "city": "Bengaluru", "category": "Railway Station"},
    {"id": "hyd_rly", "name": "Secunderabad / Hyderabad Junction", "short": "Hyderabad Stn", "lat": 17.4339, "lng": 78.5016, "city": "Hyderabad", "category": "Railway Station"},
    {"id": "mas_rly", "name": "Puratchi Thalaivar Dr. M.G.R. Central Station (Chennai)", "short": "Chennai Central (MAS)", "lat": 13.0827, "lng": 80.2707, "city": "Chennai", "category": "Railway Station"},
    {"id": "pune_rly", "name": "Pune Junction Railway Station (Pune)", "short": "Pune Stn", "lat": 18.5284, "lng": 73.8739, "city": "Pune", "category": "Railway Station"},
    {"id": "adi_rly", "name": "Ahmedabad Junction Railway Station (Ahmedabad)", "short": "Ahmedabad Stn (ADI)", "lat": 23.0225, "lng": 72.6006, "city": "Ahmedabad", "category": "Railway Station"},
    {"id": "jp_rly", "name": "Jaipur Junction Railway Station (Jaipur)", "short": "Jaipur Stn (JP)", "lat": 26.9200, "lng": 75.7873, "city": "Jaipur", "category": "Railway Station"},
    {"id": "bsb_rly", "name": "Varanasi Junction / Kashi (Varanasi)", "short": "Varanasi Stn (BSB)", "lat": 25.3262, "lng": 82.9868, "city": "Varanasi", "category": "Railway Station"},
    {"id": "goa_apt", "name": "Goa Dabolim International Airport (GOI, Goa)", "short": "Goa Airport (GOI)", "lat": 15.3808, "lng": 73.8314, "city": "Goa", "category": "Airport"},
    {"id": "ghy_rly", "name": "Guwahati Railway Station (Guwahati)", "short": "Guwahati Stn (GHY)", "lat": 26.1806, "lng": 91.7539, "city": "Guwahati", "category": "Railway Station"},
    {"id": "cdg_rly", "name": "Chandigarh Junction Railway Station (Chandigarh)", "short": "Chandigarh Stn", "lat": 30.7021, "lng": 76.8188, "city": "Chandigarh", "category": "Railway Station"},
    {"id": "cok_apt", "name": "Cochin International Airport (COK, Kochi)", "short": "Kochi Airport (COK)", "lat": 10.1520, "lng": 76.4019, "city": "Kochi", "category": "Airport"},
]

DEMO_STOPS = [
    {"id": "s1", "name": "KIIT Square (Campus 1 & 3)", "lat": 20.3558, "lng": 85.8175, "accessible": True, "ramp": True, "tactile_paving": True, "shelter": True, "lighting": "High"},
    {"id": "s2", "name": "KIIT Lake Gate & KSAC", "lat": 20.3492, "lng": 85.8213, "accessible": True, "ramp": True, "tactile_paving": True, "shelter": True, "lighting": "High"},
    {"id": "s3", "name": "Campus 15 (KIMS Hospital)", "lat": 20.3541, "lng": 85.8262, "accessible": True, "ramp": True, "tactile_paving": True, "shelter": True, "lighting": "High"},
    {"id": "s4", "name": "Patia Railway Halt", "lat": 20.3448, "lng": 85.8156, "accessible": True, "ramp": True, "tactile_paving": False, "shelter": True, "lighting": "Medium"},
    {"id": "s5", "name": "Nandankanan Road Junction", "lat": 20.3766, "lng": 85.8203, "accessible": True, "ramp": True, "tactile_paving": True, "shelter": True, "lighting": "High"},
    {"id": "s6", "name": "Vani Vihar Square", "lat": 20.2951, "lng": 85.8398, "accessible": True, "ramp": True, "tactile_paving": True, "shelter": True, "lighting": "High"},
    {"id": "s7", "name": "Master Canteen (BBS Station)", "lat": 20.2701, "lng": 85.8412, "accessible": True, "ramp": True, "tactile_paving": True, "shelter": True, "lighting": "High"},
    {"id": "s8", "name": "Kalinga Hospital Gate", "lat": 20.3084, "lng": 85.8267, "accessible": True, "ramp": True, "tactile_paving": True, "shelter": True, "lighting": "High"},
]

DEMO_ROUTES = [
    {
        "id": "r1",
        "name": "Campus Loop Express",
        "stops": ["s1", "s2", "s3", "s5"],
        "vehicle": "Low-Floor Electric Bus",
        "vehicle_no": "OD-02-KIIT-101",
        "accessible": True,
        "wheelchair_accessible": True,
        "low_floor": True,
        "ramp_equipped": True,
        "safe_night_corridor": True,
        "audio_announcements": True,
        "priority_elderly_seats": 6,
        "available_seats": 18,
        "wheelchair_spaces": 2,
        "crowd_level": "Low",
        "delay_min": 0,
        "detour_alert": "",
        "frequency": "Every 10 min",
        "eta_min": 4,
        "schedule": ["07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"]
    },
    {
        "id": "r2",
        "name": "City Transit Link",
        "stops": ["s1", "s4", "s6", "s7"],
        "vehicle": "AC Low-Floor City Bus",
        "vehicle_no": "OD-02-CRUT-502",
        "accessible": True,
        "wheelchair_accessible": True,
        "low_floor": True,
        "ramp_equipped": True,
        "safe_night_corridor": False,
        "audio_announcements": True,
        "priority_elderly_seats": 4,
        "available_seats": 8,
        "wheelchair_spaces": 1,
        "crowd_level": "Moderate",
        "delay_min": 3,
        "detour_alert": "",
        "frequency": "Every 15 min",
        "eta_min": 8,
        "schedule": ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"]
    },
    {
        "id": "r3",
        "name": "KIMS Medical Care Line",
        "stops": ["s2", "s4", "s8", "s3"],
        "vehicle": "Wheelchair-Lift Specialized Van",
        "vehicle_no": "OD-02-MED-304",
        "accessible": True,
        "wheelchair_accessible": True,
        "low_floor": True,
        "ramp_equipped": True,
        "safe_night_corridor": True,
        "audio_announcements": True,
        "priority_elderly_seats": 8,
        "available_seats": 12,
        "wheelchair_spaces": 3,
        "crowd_level": "Low",
        "delay_min": 0,
        "detour_alert": "",
        "frequency": "Every 20 min",
        "eta_min": 6,
        "schedule": ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"]
    },
    {
        "id": "r4",
        "name": "Night Safe Escort Ride",
        "stops": ["s1", "s2", "s3", "s4", "s6"],
        "vehicle": "Campus Security Escort Vehicle",
        "vehicle_no": "OD-02-SAFE-007",
        "accessible": True,
        "wheelchair_accessible": True,
        "low_floor": False,
        "ramp_equipped": True,
        "safe_night_corridor": True,
        "audio_announcements": True,
        "priority_elderly_seats": 4,
        "available_seats": 6,
        "wheelchair_spaces": 1,
        "crowd_level": "Low",
        "delay_min": 0,
        "detour_alert": "Patrolling well-lit campus security corridors",
        "frequency": "On-demand & Every 15 min",
        "eta_min": 5,
        "schedule": ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "01:00", "02:00", "03:00", "04:00", "05:00"]
    },
]

# In-memory store for driver assistance requests and crowding reports
MEM_ASSISTANCE_REQUESTS = []

POLICE_STATIONS = [
    {"name": "Infocity Police Station", "lat": 20.3489, "lng": 85.8151, "phone": "+91-674-2725100"},
    {"name": "Chandrasekharpur PS", "lat": 20.3196, "lng": 85.8154, "phone": "+91-674-2743100"},
    {"name": "Nayapalli PS", "lat": 20.2932, "lng": 85.8194, "phone": "+91-674-2555100"},
    {"name": "KIIT University Campus Security", "lat": 20.3558, "lng": 85.8175, "phone": "+91-674-2725113"},
    {"name": "National Emergency SOS Hotline", "lat": 20.2961, "lng": 85.8245, "phone": "112"},
    {"name": "Women & Student Safety Helpline", "lat": 20.3550, "lng": 85.8180, "phone": "1091"},
]


class NavLinksIn(BaseModel):
    origin: str
    destination: str
    mode: Optional[str] = "transit"  # transit | driving | walking


class StatusReportIn(BaseModel):
    route_id: str
    crowd_level: Optional[str] = None  # Low | Moderate | High
    delay_min: Optional[int] = None
    note: Optional[str] = ""


class DriverUpdateIn(BaseModel):
    route_id: str
    crowd_level: str
    available_seats: int
    wheelchair_spaces: int
    delay_min: int
    detour_alert: Optional[str] = ""


class AssistanceRequestIn(BaseModel):
    route_id: str
    stop_id: str
    stop_name: str
    assistance_type: str  # Wheelchair Ramp Assistance | Elderly Boarding Help | Late Night Escort | Visual Guide
    passenger_name: Optional[str] = ""
    note: Optional[str] = ""


@api.get("/transit/campuses")
async def get_campuses():
    return KIIT_CAMPUSES


@api.get("/transit/hubs")
async def get_hubs():
    return PAN_INDIA_HUBS


@api.get("/transit/geocode")
async def geocode_location(q: str):
    """Search any city, hub, or landmark globally/nationally using OpenStreetMap Nominatim with predefined fallbacks."""
    import requests
    from urllib.parse import quote

    if not q or not q.strip():
        return {"error": "Query parameter q is required", "results": []}

    query = q.strip()
    results = []
    lower_q = query.lower()

    # 1. Match local predefined campuses and hubs first
    for item in KIIT_CAMPUSES + PAN_INDIA_HUBS:
        if lower_q in item["name"].lower() or lower_q in item.get("short", "").lower() or lower_q in item.get("city", "").lower():
            results.append({
                "name": item["name"],
                "short": item.get("short", item["name"]),
                "lat": item["lat"],
                "lng": item["lng"],
                "category": item.get("category", "Local"),
                "source": "predefined"
            })

    # 2. Try querying OpenStreetMap Nominatim for national/global places
    try:
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={quote(query)}&limit=5"
        headers = {"User-Agent": "MOVA-Travel-App/1.0"}
        resp = requests.get(url, headers=headers, timeout=2.5)
        if resp.status_code == 200:
            for r in resp.json():
                # Avoid exact coordinate duplicates
                r_lat, r_lng = float(r["lat"]), float(r["lon"])
                if not any(abs(x["lat"] - r_lat) < 0.001 and abs(x["lng"] - r_lng) < 0.001 for x in results):
                    results.append({
                        "name": r.get("display_name", query),
                        "short": r.get("name", query),
                        "lat": r_lat,
                        "lng": r_lng,
                        "category": r.get("type", "Place").replace("_", " ").title(),
                        "source": "nominatim"
                    })
    except Exception as e:
        logger.warning("Geocoding service timeout or error: %s", e)

    return {"query": query, "results": results}


@api.post("/transit/nav-links")
async def get_nav_links(body: NavLinksIn):
    from urllib.parse import quote
    orig = quote(body.origin)
    dest = quote(body.destination)
    m = body.mode.lower() if body.mode else "transit"

    # Map mode to Apple Maps flag
    dirflg = "r" if m == "transit" else ("w" if m == "walking" else "d")
    
    gmaps_url = f"https://www.google.com/maps/dir/?api=1&origin={orig}&destination={dest}&travelmode={m}"
    apple_url = f"https://maps.apple.com/?saddr={orig}&daddr={dest}&dirflg={dirflg}"
    
    return {
        "origin": body.origin,
        "destination": body.destination,
        "mode": m,
        "google_maps_url": gmaps_url,
        "apple_maps_url": apple_url,
    }


@api.get("/transit/stops")
async def get_stops():
    return DEMO_STOPS


@api.get("/transit/routes")
async def get_routes():
    return DEMO_ROUTES


@api.post("/transit/report-status")
async def report_route_status(body: StatusReportIn, user: dict = Depends(get_current_user)):
    """Allow passengers and operators to submit live crowding and delay reports."""
    for r in DEMO_ROUTES:
        if r["id"] == body.route_id:
            if body.crowd_level:
                r["crowd_level"] = body.crowd_level
            if body.delay_min is not None:
                r["delay_min"] = max(0, body.delay_min)
            return {"ok": True, "route": r}
    raise HTTPException(status_code=404, detail="Route not found")


@api.get("/driver/routes")
async def get_driver_routes(user: dict = Depends(get_current_user)):
    """Operator / Driver portal overview of all fleet lines and statuses."""
    return DEMO_ROUTES


@api.post("/driver/update")
async def update_driver_status(body: DriverUpdateIn, user: dict = Depends(get_current_user)):
    """Driver updates live vehicle occupancy, seats, delays, and detour alerts."""
    for r in DEMO_ROUTES:
        if r["id"] == body.route_id:
            r["crowd_level"] = body.crowd_level
            r["available_seats"] = body.available_seats
            r["wheelchair_spaces"] = body.wheelchair_spaces
            r["delay_min"] = body.delay_min
            r["detour_alert"] = body.detour_alert or ""
            return {"ok": True, "route": r}
    raise HTTPException(status_code=404, detail="Route not found")


@api.post("/driver/assistance-request")
async def request_assistance(body: AssistanceRequestIn, user: dict = Depends(get_current_user)):
    """Passenger requests accessibility assistance (wheelchair ramp, elderly aid, night escort) at a stop."""
    req = {
        "id": str(uuid.uuid4()),
        "route_id": body.route_id,
        "stop_id": body.stop_id,
        "stop_name": body.stop_name,
        "assistance_type": body.assistance_type,
        "passenger_name": body.passenger_name or user.get("name", "Passenger"),
        "user_email": user.get("email", ""),
        "note": body.note or "",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    MEM_ASSISTANCE_REQUESTS.insert(0, req)
    return {"ok": True, "request": req}


@api.get("/driver/assistance-requests")
async def list_assistance_requests(user: dict = Depends(get_current_user)):
    """Driver and operators view active accessibility assistance requests."""
    return MEM_ASSISTANCE_REQUESTS[:20]


@api.post("/driver/assistance-requests/{req_id}/complete")
async def complete_assistance_request(req_id: str, user: dict = Depends(get_current_user)):
    """Driver marks assistance request as fulfilled."""
    for req in MEM_ASSISTANCE_REQUESTS:
        if req["id"] == req_id:
            req["status"] = "completed"
            return {"ok": True, "request": req}
    raise HTTPException(status_code=404, detail="Request not found")


@api.get("/transit/offline-pack")
async def get_offline_pack():
    """Download entire offline transit directory, schedules, emergency hotlines, and campus routes."""
    return {
        "version": "2.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "routes": DEMO_ROUTES,
        "stops": DEMO_STOPS,
        "campuses": KIIT_CAMPUSES,
        "hubs": PAN_INDIA_HUBS,
        "police": POLICE_STATIONS,
        "emergency_contacts": [
            {"name": "National Emergency SOS", "number": "112", "desc": "Police, Fire, Medical"},
            {"name": "KIIT University Campus Security", "number": "+91-674-2725113", "desc": "24/7 Campus Control Room"},
            {"name": "Women Safety Helpline", "number": "1091", "desc": "Toll-free 24/7"},
            {"name": "KIMS Hospital Emergency Ambulance", "number": "108", "desc": "Medical Emergency & Trauma Care"},
            {"name": "CRUT Mo Bus Helpline", "number": "1800-345-7177", "desc": "Public Bus Operations & Lost & Found"}
        ],
        "offline_navigation_tips": [
            "All KIIT campus e-rickshaws and blue transit buses accept Student ID cards.",
            "Low-floor wheelchair buses (Route R1 & R3) stop at designated yellow accessibility markings at Campus 1, 3, KSAC, and KIMS.",
            "Night Safe Escort Rides operate continuously between 20:00 and 05:00 along all lighted campus loops."
        ]
    }


@api.get("/transit/road-route")
async def get_road_route(start_lat: float, start_lng: float, end_lat: float, end_lng: float, mode: str = "driving"):
    """Fetch exact road-following navigation polyline and turn-by-turn steps using OSRM OpenStreetMap engine."""
    import requests
    import math

    osrm_profile = "foot" if mode == "walking" else ("bike" if mode == "bicycling" else "driving")
    url = f"https://router.project-osrm.org/route/v1/{osrm_profile}/{start_lng},{start_lat};{end_lng},{end_lat}?overview=full&geometries=geojson&steps=true"

    try:
        headers = {"User-Agent": "MOVA-Travel-App/1.0"}
        resp = requests.get(url, headers=headers, timeout=4.0)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("code") == "Ok" and len(data.get("routes", [])) > 0:
                route = data["routes"][0]
                raw_coords = route["geometry"]["coordinates"]
                leaflet_coords = [[pt[1], pt[0]] for pt in raw_coords]

                steps = []
                for leg in route.get("legs", []):
                    for st in leg.get("steps", []):
                        inst = st.get("maneuver", {}).get("type", "continue")
                        name = st.get("name") or "road"
                        dist_m = round(st.get("distance", 0))
                        steps.append({
                            "instruction": f"{inst.replace('_', ' ').capitalize()} on {name}",
                            "distance_m": dist_m,
                            "name": name
                        })

                return {
                    "found": True,
                    "coordinates": leaflet_coords,
                    "distance_km": round(route.get("distance", 0) / 1000, 2),
                    "duration_min": round(route.get("duration", 0) / 60, 1),
                    "steps": steps[:8],
                    "source": "osrm"
                }
    except Exception as e:
        logger.warning("OSRM routing service timeout or fallback: %s", e)

    # Calculate Haversine fallback distance
    dlat = math.radians(end_lat - start_lat)
    dlng = math.radians(end_lng - start_lng)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(start_lat)) * math.cos(math.radians(end_lat)) * math.sin(dlng / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    fb_dist = round(6371.0 * c, 2)

    return {
        "found": False,
        "coordinates": [[start_lat, start_lng], [end_lat, end_lng]],
        "distance_km": fb_dist,
        "duration_min": round(fb_dist * 2.5, 1),
        "steps": [{"instruction": "Direct path route", "distance_m": 0, "name": "Direct Path"}],
        "source": "fallback"
    }


@api.get("/transit/route-road-geometry")
async def get_route_road_geometry(route_id: str):
    """Fetch complete road-following street polyline for an entire bus route across all its sequenced stops."""
    import requests
    target_route = next((r for r in DEMO_ROUTES if r["id"] == route_id), None)
    if not target_route:
        raise HTTPException(status_code=404, detail="Route not found")

    # Resolve stop coordinates in sequence
    stop_map = {s["id"]: s for s in DEMO_STOPS}
    coords = []
    stop_objs = []
    for sid in target_route["stops"]:
        st = stop_map.get(sid)
        if st:
            coords.append((st["lng"], st["lat"]))
            stop_objs.append(st)

    if len(coords) < 2:
        return {
            "route_id": route_id,
            "found": False,
            "coordinates": [[s["lat"], s["lng"]] for s in stop_objs],
            "distance_km": 5.2,
            "duration_min": 15,
            "stops": stop_objs,
            "source": "fallback"
        }

    # Format OSRM multi-waypoint coordinate string: lng1,lat1;lng2,lat2;lng3,lat3...
    coord_str = ";".join([f"{lng},{lat}" for lng, lat in coords])
    url = f"https://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson&steps=true"

    try:
        headers = {"User-Agent": "MOVA-Travel-App/1.0"}
        resp = requests.get(url, headers=headers, timeout=4.5)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("code") == "Ok" and len(data.get("routes", [])) > 0:
                route_res = data["routes"][0]
                raw_coords = route_res["geometry"]["coordinates"]
                leaflet_coords = [[pt[1], pt[0]] for pt in raw_coords]

                return {
                    "route_id": route_id,
                    "name": target_route["name"],
                    "found": True,
                    "coordinates": leaflet_coords,
                    "distance_km": round(route_res.get("distance", 0) / 1000, 2),
                    "duration_min": round(route_res.get("duration", 0) / 60, 1),
                    "stops": stop_objs,
                    "source": "osrm"
                }
    except Exception as e:
        logger.warning("OSRM multi-stop routing error: %s", e)

    # Fallback to straight lines between stop coordinates
    return {
        "route_id": route_id,
        "name": target_route["name"],
        "found": False,
        "coordinates": [[s["lat"], s["lng"]] for s in stop_objs],
        "distance_km": 5.4,
        "duration_min": 14,
        "stops": stop_objs,
        "source": "fallback"
    }


@api.get("/safety/police")
async def get_police():
    return POLICE_STATIONS


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api)

