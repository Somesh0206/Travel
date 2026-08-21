from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
# pyrefly: ignore [missing-import]
from starlette.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

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


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
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
    email: EmailStr
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
    {"id": "s1", "name": "KIIT Square", "lat": 20.3558, "lng": 85.8175, "accessible": True},
    {"id": "s2", "name": "KIIT Lake Gate", "lat": 20.3492, "lng": 85.8213, "accessible": True},
    {"id": "s3", "name": "Campus 15", "lat": 20.3541, "lng": 85.8262, "accessible": False},
    {"id": "s4", "name": "Patia Station", "lat": 20.3448, "lng": 85.8156, "accessible": True},
    {"id": "s5", "name": "Nandankanan Rd", "lat": 20.3766, "lng": 85.8203, "accessible": True},
    {"id": "s6", "name": "Vani Vihar", "lat": 20.2951, "lng": 85.8398, "accessible": True},
    {"id": "s7", "name": "Master Canteen", "lat": 20.2701, "lng": 85.8412, "accessible": False},
    {"id": "s8", "name": "Kalinga Hospital", "lat": 20.3084, "lng": 85.8267, "accessible": True},
]

DEMO_ROUTES = [
    {"id": "r1", "name": "Campus Loop", "stops": ["s1", "s2", "s3", "s5"], "vehicle": "Low-floor Bus", "accessible": True, "eta_min": 6},
    {"id": "r2", "name": "City Express", "stops": ["s1", "s4", "s6", "s7"], "vehicle": "Shared Van", "accessible": False, "eta_min": 12},
    {"id": "r3", "name": "Hospital Route", "stops": ["s2", "s4", "s8"], "vehicle": "Wheelchair Bus", "accessible": True, "eta_min": 9},
    {"id": "r4", "name": "Night Safe Ride", "stops": ["s1", "s2", "s6", "s7"], "vehicle": "Campus Vehicle", "accessible": True, "eta_min": 14},
]

POLICE_STATIONS = [
    {"name": "Infocity Police Station", "lat": 20.3489, "lng": 85.8151, "phone": "+91-674-2725100"},
    {"name": "Chandrasekharpur PS", "lat": 20.3196, "lng": 85.8154, "phone": "+91-674-2743100"},
    {"name": "Nayapalli PS", "lat": 20.2932, "lng": 85.8194, "phone": "+91-674-2555100"},
]


class NavLinksIn(BaseModel):
    origin: str
    destination: str
    mode: Optional[str] = "transit"  # transit | driving | walking


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

